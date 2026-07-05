param(
  [string]$RepoName = "careplan-specialcare",
  [ValidateSet("private","public")]
  [string]$RepoVisibility = "private",
  [string]$CommitMessage = "Initial CarePlan Specialcare production package"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "" 
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Require-Command {
  param([string]$Name, [string]$InstallHint)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found. $InstallHint"
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CarePlan Specialcare - Push to GitHub only" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

Require-Command git "Install Git for Windows: https://git-scm.com/download/win"
Require-Command gh "Install GitHub CLI: winget install --id GitHub.cli"

$ProjectRoot = (Get-Location).Path
Write-Host "Project folder: $ProjectRoot" -ForegroundColor Yellow

Write-Step "Checking GitHub CLI login"
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "GitHub CLI is not logged in. Starting login..." -ForegroundColor Yellow
  & gh auth login
  if ($LASTEXITCODE -ne 0) { throw "GitHub login failed." }
}
Write-Host "GitHub CLI login OK." -ForegroundColor Green

Write-Step "Preparing .gitignore"
$gitignorePath = Join-Path $ProjectRoot ".gitignore"
$gitignoreText = @"
# Dependencies
node_modules/

# Local environment / secrets
.env
.env.*
!.env.example
*.local
.dev.vars

# Cloudflare local state
.wrangler/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Test outputs
coverage/
playwright-report/
test-results/

# OS files
.DS_Store
Thumbs.db

# Temporary files
*.tmp
*.bak
*.old
"@
if (Test-Path $gitignorePath) {
  $existing = Get-Content $gitignorePath -Raw
  foreach ($line in ($gitignoreText -split "`r?`n")) {
    if ($line.Trim().Length -gt 0 -and $existing -notmatch [regex]::Escape($line)) {
      Add-Content -Path $gitignorePath -Value $line
    }
  }
} else {
  Set-Content -Path $gitignorePath -Value $gitignoreText -Encoding UTF8
}
Write-Host ".gitignore ready." -ForegroundColor Green

Write-Step "Initializing Git repository"
if (-not (Test-Path (Join-Path $ProjectRoot ".git"))) {
  & git init
  if ($LASTEXITCODE -ne 0) { throw "git init failed." }
} else {
  Write-Host "Git repository already exists." -ForegroundColor Green
}

& git branch -M main
if ($LASTEXITCODE -ne 0) { throw "Could not set branch to main." }

Write-Step "Staging files"
& git add .
if ($LASTEXITCODE -ne 0) { throw "git add failed." }

$status = & git status --porcelain
if ([string]::IsNullOrWhiteSpace(($status | Out-String))) {
  Write-Host "No changes to commit." -ForegroundColor Yellow
} else {
  Write-Step "Creating commit"
  & git commit -m $CommitMessage
  if ($LASTEXITCODE -ne 0) { throw "git commit failed. Check git user.name and user.email." }
}

Write-Step "Checking GitHub remote"
$originUrl = $null
try { $originUrl = & git remote get-url origin 2>$null } catch { $originUrl = $null }

if (-not [string]::IsNullOrWhiteSpace($originUrl)) {
  Write-Host "Existing origin found: $originUrl" -ForegroundColor Yellow
  Write-Step "Pushing to existing GitHub remote"
  & git push -u origin main
  if ($LASTEXITCODE -ne 0) { throw "git push failed." }
} else {
  Write-Step "Creating GitHub repository: $RepoName"
  if ($RepoVisibility -eq "public") {
    & gh repo create $RepoName --public --source . --remote origin --push
  } else {
    & gh repo create $RepoName --private --source . --remote origin --push
  }
  if ($LASTEXITCODE -ne 0) { throw "GitHub repository creation or push failed." }
}

$finalRemote = & git remote get-url origin
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  DONE - CarePlan has been pushed to GitHub" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host "GitHub remote: $finalRemote" -ForegroundColor Cyan
Write-Host "Next: connect this GitHub repo manually in Cloudflare Pages." -ForegroundColor Yellow
Write-Host ""
