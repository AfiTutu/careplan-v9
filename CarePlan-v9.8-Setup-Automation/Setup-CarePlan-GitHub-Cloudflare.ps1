#requires -Version 7.2
<#
.SYNOPSIS
  One-command GitHub + Cloudflare bootstrap for CarePlan · Specialcare v9.8.

.DESCRIPTION
  Run this script from the extracted CarePlan production package root.

  It can:
    - verify/install Git, GitHub CLI, and Node.js 22 on Windows;
    - authenticate GitHub CLI and Cloudflare Wrangler;
    - create or reuse a private GitHub repository;
    - create or reuse a Cloudflare Pages project;
    - create or reuse a D1 database and private R2 bucket;
    - patch wrangler.jsonc with the real resource IDs and Access values;
    - generate and upload DATA_ENCRYPTION_KEY as a Cloudflare Pages secret;
    - create a current-user DPAPI-protected recovery copy of the key;
    - apply D1 migrations;
    - optionally create the first workspace owner invitation;
    - configure GitHub Actions secrets and variables;
    - commit and push the configured project;
    - wait for the production GitHub Actions workflow.

  Cloudflare Access application creation and custom-domain DNS are intentionally
  not automated because Wrangler does not manage those resources. Create the
  Access application first, then supply its team domain and AUD tag when asked.

.EXAMPLE
  Set-ExecutionPolicy -Scope Process Bypass
  .\Setup-CarePlan-GitHub-Cloudflare.ps1

.EXAMPLE
  .\Setup-CarePlan-GitHub-Cloudflare.ps1 `
    -GitHubOwner "your-github-name" `
    -RepositoryName "careplan-specialcare" `
    -PagesProjectName "careplan-specialcare" `
    -TeamDomain "https://your-team.cloudflareaccess.com" `
    -PolicyAud "your-access-application-aud-tag" `
    -WorkspaceSlug "family-one" `
    -WorkspaceOwnerEmail "owner@example.com"

.NOTES
  Requirements:
    - Windows 10/11
    - PowerShell 7.2+
    - A GitHub account
    - A Cloudflare account with Pages, D1, R2 and Zero Trust enabled
    - A Cloudflare API token for GitHub Actions (entered securely; never written)
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter()]
    [string]$ProjectRoot = $PSScriptRoot,

    [Parameter()]
    [string]$PackageZipPath = "",

    [Parameter()]
    [string]$GitHubOwner = "",

    [Parameter()]
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string]$RepositoryName = "careplan-specialcare",

    [Parameter()]
    [ValidateSet('private', 'public', 'internal')]
    [string]$RepositoryVisibility = "private",

    [Parameter()]
    [ValidatePattern('^[a-z0-9-]+$')]
    [string]$PagesProjectName = "careplan-specialcare",

    [Parameter()]
    [ValidatePattern('^[a-z0-9-]+$')]
    [string]$D1DatabaseName = "careplan-specialcare-production",

    [Parameter()]
    [ValidatePattern('^[a-z0-9-]{3,63}$')]
    [string]$R2BucketName = "careplan-specialcare-private-media",

    [Parameter()]
    [ValidatePattern('^[A-Za-z0-9._/-]+$')]
    [string]$ProductionBranch = "main",

    [Parameter()]
    [string]$TeamDomain = "",

    [Parameter()]
    [string]$PolicyAud = "",

    [Parameter()]
    [string]$CloudflareAccountId = "",

    [Parameter()]
    [ValidateSet('', 'weur', 'eeur', 'apac', 'oc', 'wnam', 'enam')]
    [string]$D1Location = "apac",

    [Parameter()]
    [ValidateSet('', 'WNAM', 'ENAM', 'WEUR', 'EEUR', 'APAC', 'OC')]
    [string]$R2Location = "APAC",

    [Parameter()]
    [ValidatePattern('^[a-z0-9-]*$')]
    [string]$WorkspaceSlug = "",

    [Parameter()]
    [string]$WorkspaceOwnerEmail = "",

    [Parameter()]
    [string]$ProvisionedByEmail = "",

    [Parameter()]
    [switch]$SkipPrerequisiteInstall,

    [Parameter()]
    [switch]$SkipLocalQa,

    [Parameter()]
    [switch]$SkipWorkspaceProvisioning,

    [Parameter()]
    [switch]$SkipGitPush,

    [Parameter()]
    [switch]$SkipWorkflowWatch,

    [Parameter()]
    [switch]$ForceExistingRemote
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:OriginalLocation = Get-Location
$script:SensitiveValues = [System.Collections.Generic.List[string]]::new()
$script:ProvisionedWorkspaceSlug = $WorkspaceSlug

function Write-Banner {
    param([string]$Text)
    Write-Host ""
    Write-Host ("=" * 78) -ForegroundColor DarkCyan
    Write-Host ("  " + $Text) -ForegroundColor Cyan
    Write-Host ("=" * 78) -ForegroundColor DarkCyan
}

function Write-Step {
    param([string]$Text)
    Write-Host ""
    Write-Host ("[+] " + $Text) -ForegroundColor Green
}

function Write-Info {
    param([string]$Text)
    Write-Host ("    " + $Text) -ForegroundColor Gray
}

function Write-Warn {
    param([string]$Text)
    Write-Host ("[!] " + $Text) -ForegroundColor Yellow
}

function Stop-Setup {
    param([string]$Message)
    throw "CarePlan setup stopped: $Message"
}

function Refresh-ProcessPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = @($machinePath, $userPath) -join ';'
}

function Test-CommandAvailable {
    param([Parameter(Mandatory)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Tool {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter()][string[]]$Arguments = @(),
        [Parameter()][switch]$Capture,
        [Parameter()][switch]$AllowFailure,
        [Parameter()][switch]$Quiet
    )

    if (-not $Quiet) {
        $display = @($Command) + $Arguments
        Write-Info (($display | ForEach-Object {
            $value = [string]$_
            foreach ($secret in $script:SensitiveValues) {
                if (-not [string]::IsNullOrEmpty($secret)) {
                    $value = $value.Replace($secret, '***')
                }
            }
            if ($value -match '\s') { '"' + $value + '"' } else { $value }
        }) -join ' ')
    }

    if ($Capture) {
        $lines = @(& $Command @Arguments 2>&1)
        $exitCode = $LASTEXITCODE
        $text = $lines -join "`n"
        if (($exitCode -ne 0) -and (-not $AllowFailure)) {
            throw "Command failed with exit code $exitCode.`n$text"
        }
        return [pscustomobject]@{
            ExitCode = $exitCode
            Output   = $text
            Lines    = $lines
        }
    }

    & $Command @Arguments
    $exitCode = $LASTEXITCODE
    if (($exitCode -ne 0) -and (-not $AllowFailure)) {
        throw "Command failed with exit code $exitCode: $Command $($Arguments -join ' ')"
    }
    return $exitCode
}

function Invoke-ToolWithStdin {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$InputText,
        [Parameter(Mandatory)][string]$Command,
        [Parameter()][string[]]$Arguments = @(),
        [Parameter()][switch]$AllowFailure
    )

    Write-Info ("$Command " + ($Arguments -join ' ') + "  [value supplied through stdin]")
    $lines = @($InputText | & $Command @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    $text = $lines -join "`n"
    if (($exitCode -ne 0) -and (-not $AllowFailure)) {
        throw "Command failed with exit code $exitCode.`n$text"
    }
    return [pscustomobject]@{
        ExitCode = $exitCode
        Output   = $text
        Lines    = $lines
    }
}

function Read-RequiredValue {
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [Parameter()][string]$CurrentValue = ""
    )
    if (-not [string]::IsNullOrWhiteSpace($CurrentValue)) {
        return $CurrentValue.Trim()
    }
    do {
        $value = (Read-Host $Prompt).Trim()
    } while ([string]::IsNullOrWhiteSpace($value))
    return $value
}

function Read-YesNo {
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [Parameter()][bool]$DefaultYes = $true
    )
    $suffix = if ($DefaultYes) { '[Y/n]' } else { '[y/N]' }
    $answer = (Read-Host "$Prompt $suffix").Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
    return $answer -in @('y', 'yes')
}

function ConvertFrom-SecureStringPlainText {
    param([Parameter(Mandatory)][Security.SecureString]$SecureValue)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function New-RandomBase64Key {
    param([int]$ByteCount = 32)
    $bytes = [byte[]]::new($ByteCount)
    [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    return [Convert]::ToBase64String($bytes)
}

function Protect-RecoveryKeyForCurrentWindowsUser {
    param(
        [Parameter(Mandatory)][string]$PlainKey,
        [Parameter(Mandatory)][string]$ProjectName
    )

    if (-not $IsWindows) {
        Write-Warn 'DPAPI recovery export is Windows-only. The Cloudflare secret was set, but no local recovery file was created.'
        return $null
    }

    $directory = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'CarePlan-Recovery'
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $file = Join-Path $directory "$ProjectName-DATA_ENCRYPTION_KEY.dpapi.txt"

    $secure = ConvertTo-SecureString -String $PlainKey -AsPlainText -Force
    $protected = ConvertFrom-SecureString -SecureString $secure
    Set-Content -LiteralPath $file -Value $protected -Encoding utf8NoBOM -NoNewline

    try {
        & icacls.exe $file /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
    }
    catch {
        Write-Warn "Could not tighten the ACL automatically. Protect this file manually: $file"
    }

    return $file
}

function ConvertFrom-JsonSafe {
    param([string]$Text)
    if ([string]::IsNullOrWhiteSpace($Text)) { return $null }

    $clean = [regex]::Replace($Text, "`e\[[0-9;?]*[ -/]*[@-~]", '')
    try { return $clean | ConvertFrom-Json -Depth 100 } catch { }

    $arrayStart = $clean.IndexOf('[')
    $arrayEnd = $clean.LastIndexOf(']')
    if ($arrayStart -ge 0 -and $arrayEnd -gt $arrayStart) {
        try { return $clean.Substring($arrayStart, $arrayEnd - $arrayStart + 1) | ConvertFrom-Json -Depth 100 } catch { }
    }

    $objectStart = $clean.IndexOf('{')
    $objectEnd = $clean.LastIndexOf('}')
    if ($objectStart -ge 0 -and $objectEnd -gt $objectStart) {
        try { return $clean.Substring($objectStart, $objectEnd - $objectStart + 1) | ConvertFrom-Json -Depth 100 } catch { }
    }

    return $null
}

function Get-ObjectPropertyValue {
    param(
        [Parameter(Mandatory)]$Object,
        [Parameter(Mandatory)][string[]]$Names,
        [Parameter()]$DefaultValue = $null
    )
    if ($null -eq $Object) { return $DefaultValue }
    foreach ($name in $Names) {
        $property = $Object.PSObject.Properties[$name]
        if ($null -ne $property -and $null -ne $property.Value) {
            $text = [string]$property.Value
            if (-not [string]::IsNullOrWhiteSpace($text)) { return $property.Value }
        }
    }
    return $DefaultValue
}

function Get-CloudflareAccounts {
    param([Parameter(Mandatory)]$WhoAmI)

    $accounts = [System.Collections.Generic.List[object]]::new()

    if ($null -ne $WhoAmI.accounts) {
        foreach ($account in @($WhoAmI.accounts)) {
            $id = [string](Get-ObjectPropertyValue -Object $account -Names @('id', 'account_id') -DefaultValue '')
            $name = [string](Get-ObjectPropertyValue -Object $account -Names @('name', 'account_name') -DefaultValue $id)
            if ($id -match '^[a-fA-F0-9]{32}$') {
                $accounts.Add([pscustomobject]@{ Id = $id; Name = $name })
            }
        }
    }

    if ($null -ne $WhoAmI.account) {
        $id = [string](Get-ObjectPropertyValue -Object $WhoAmI.account -Names @('id', 'account_id') -DefaultValue '')
        $name = [string](Get-ObjectPropertyValue -Object $WhoAmI.account -Names @('name', 'account_name') -DefaultValue $id)
        if ($id -match '^[a-fA-F0-9]{32}$') {
            $accounts.Add([pscustomobject]@{ Id = $id; Name = $name })
        }
    }

    if ($accounts.Count -eq 0) {
        $raw = $WhoAmI | ConvertTo-Json -Depth 100 -Compress
        foreach ($match in [regex]::Matches($raw, '"(?:id|account_id)":"([a-fA-F0-9]{32})"')) {
            $id = $match.Groups[1].Value
            if (-not ($accounts.Id -contains $id)) {
                $accounts.Add([pscustomobject]@{ Id = $id; Name = $id })
            }
        }
    }

    return @($accounts | Sort-Object Id -Unique)
}

function Select-CloudflareAccountId {
    param(
        [Parameter(Mandatory)][object[]]$Accounts,
        [string]$CurrentValue = ''
    )

    if (-not [string]::IsNullOrWhiteSpace($CurrentValue)) {
        if ($CurrentValue -notmatch '^[a-fA-F0-9]{32}$') {
            Stop-Setup 'CloudflareAccountId must be a 32-character hexadecimal account ID.'
        }
        return $CurrentValue
    }

    if ($Accounts.Count -eq 1) { return [string]$Accounts[0].Id }
    if ($Accounts.Count -gt 1) {
        Write-Host 'Cloudflare accounts:' -ForegroundColor Cyan
        for ($i = 0; $i -lt $Accounts.Count; $i++) {
            Write-Host ("  [{0}] {1}  ({2})" -f ($i + 1), $Accounts[$i].Name, $Accounts[$i].Id)
        }
        do {
            $choice = Read-Host 'Select the Cloudflare account number'
            $number = 0
            $valid = [int]::TryParse($choice, [ref]$number) -and $number -ge 1 -and $number -le $Accounts.Count
        } while (-not $valid)
        return [string]$Accounts[$number - 1].Id
    }

    return Read-RequiredValue -Prompt 'Cloudflare account ID (32 hex characters)'
}

function Get-D1DatabaseRecord {
    param(
        [Parameter(Mandatory)]$D1List,
        [Parameter(Mandatory)][string]$Name
    )
    return @($D1List) | Where-Object {
        [string](Get-ObjectPropertyValue -Object $_ -Names @('name', 'database_name') -DefaultValue '') -eq $Name
    } | Select-Object -First 1
}

function Get-D1DatabaseId {
    param([Parameter(Mandatory)]$Database)
    foreach ($property in @('uuid', 'database_id', 'id')) {
        $value = [string]$Database.$property
        if ($value -match '^[a-fA-F0-9-]{32,36}$') { return $value }
    }
    Stop-Setup 'Wrangler returned the D1 database, but its database ID could not be determined.'
}

function Ensure-WingetPackage {
    param(
        [Parameter(Mandatory)][string]$CommandName,
        [Parameter(Mandatory)][string]$PackageId,
        [Parameter(Mandatory)][string]$FriendlyName
    )

    if (Test-CommandAvailable $CommandName) { return }
    if ($SkipPrerequisiteInstall) {
        Stop-Setup "$FriendlyName is not installed. Install it and rerun, or remove -SkipPrerequisiteInstall."
    }
    if (-not (Test-CommandAvailable 'winget')) {
        Stop-Setup "$FriendlyName is missing and winget is unavailable. Install $FriendlyName manually, then rerun."
    }

    Write-Step "Installing $FriendlyName with winget"
    Invoke-Tool -Command 'winget' -Arguments @(
        'install', '--id', $PackageId, '--exact', '--source', 'winget',
        '--accept-package-agreements', '--accept-source-agreements', '--silent'
    )
    Refresh-ProcessPath
    if (-not (Test-CommandAvailable $CommandName)) {
        Stop-Setup "$FriendlyName installation completed but '$CommandName' is not on PATH. Open a new PowerShell 7 window and rerun."
    }
}

function Ensure-Prerequisites {
    Write-Banner 'Prerequisites'

    if (-not $IsWindows) {
        Stop-Setup 'This bootstrap file is designed for Windows PowerShell 7.2 or newer.'
    }

    Ensure-WingetPackage -CommandName 'git' -PackageId 'Git.Git' -FriendlyName 'Git'
    Ensure-WingetPackage -CommandName 'gh' -PackageId 'GitHub.cli' -FriendlyName 'GitHub CLI'

    if (-not (Test-CommandAvailable 'node')) {
        if ($SkipPrerequisiteInstall) {
            Stop-Setup 'Node.js 22 is not installed.'
        }
        if (-not (Test-CommandAvailable 'winget')) {
            Stop-Setup 'Node.js 22 is missing and winget is unavailable.'
        }
        Write-Step 'Installing Node.js 22 with winget'
        $nodeInstall = Invoke-Tool -Command 'winget' -Arguments @(
            'install', '--id', 'OpenJS.NodeJS.22', '--exact', '--source', 'winget',
            '--accept-package-agreements', '--accept-source-agreements', '--silent'
        ) -AllowFailure
        Refresh-ProcessPath
        if (-not (Test-CommandAvailable 'node')) {
            Stop-Setup 'Node.js 22 could not be installed automatically. Install Node.js 20 or 22, then rerun.'
        }
    }

    foreach ($command in @('npm', 'npx')) {
        if (-not (Test-CommandAvailable $command)) {
            Stop-Setup "$command is unavailable. Repair the Node.js installation and rerun."
        }
    }

    $nodeVersionText = (& node --version).Trim().TrimStart('v')
    $nodeVersion = [version]$nodeVersionText
    if (($nodeVersion.Major -lt 20) -or ($nodeVersion.Major -ge 23)) {
        Stop-Setup "Node.js $nodeVersionText is not supported by this release. Install Node.js 20 or 22."
    }

    Write-Info "Git: $(git --version)"
    Write-Info "GitHub CLI: $(gh --version | Select-Object -First 1)"
    Write-Info "Node.js: $(node --version)"
    Write-Info "npm: $(npm --version)"
}

function Test-CarePlanProjectDirectory {
    param([Parameter(Mandatory)][string]$Path)
    $required = @(
        'package.json',
        'package-lock.json',
        'wrangler.jsonc',
        'public\index.html',
        'functions',
        'migrations',
        '.github\workflows\deploy-production.yml'
    )
    foreach ($item in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $Path $item))) { return $false }
    }
    return $true
}

function Assert-ProjectRoot {
    $startingPath = (Resolve-Path -LiteralPath $ProjectRoot).Path
    if (Test-CarePlanProjectDirectory -Path $startingPath) { return $startingPath }

    $childCandidates = @(Get-ChildItem -LiteralPath $startingPath -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-CarePlanProjectDirectory -Path $_.FullName })
    if ($childCandidates.Count -eq 1) { return $childCandidates[0].FullName }
    if ($childCandidates.Count -gt 1) {
        Stop-Setup 'More than one CarePlan package folder was found. Rerun with -ProjectRoot pointing to the intended package.'
    }

    $zipCandidate = $PackageZipPath
    if ([string]::IsNullOrWhiteSpace($zipCandidate)) {
        $matchingZips = @(Get-ChildItem -LiteralPath $startingPath -File -Filter 'CarePlan-v9.8-GitHub-Cloudflare-Production*.zip' -ErrorAction SilentlyContinue)
        if ($matchingZips.Count -eq 1) { $zipCandidate = $matchingZips[0].FullName }
    }

    if (-not [string]::IsNullOrWhiteSpace($zipCandidate)) {
        $zipResolved = (Resolve-Path -LiteralPath $zipCandidate).Path
        $extractBase = Join-Path (Split-Path -Parent $zipResolved) 'CarePlan-v9.8-Setup-Workspace'
        if (-not (Test-Path -LiteralPath $extractBase)) {
            Write-Step "Extracting production package to '$extractBase'"
            Expand-Archive -LiteralPath $zipResolved -DestinationPath $extractBase -Force
        }
        if (Test-CarePlanProjectDirectory -Path $extractBase) { return $extractBase }
        $extractedCandidates = @(Get-ChildItem -LiteralPath $extractBase -Directory -Recurse -ErrorAction SilentlyContinue |
            Where-Object { Test-CarePlanProjectDirectory -Path $_.FullName })
        if ($extractedCandidates.Count -eq 1) { return $extractedCandidates[0].FullName }
    }

    Stop-Setup 'No extracted CarePlan production package was found. Place this script next to the v9.8 ZIP, extract the ZIP first, or pass -ProjectRoot / -PackageZipPath.'
}

function Ensure-Authentication {
    Write-Banner 'Authentication'

    $ghStatus = Invoke-Tool -Command 'gh' -Arguments @('auth', 'status') -Capture -AllowFailure -Quiet
    if ($ghStatus.ExitCode -ne 0) {
        Write-Step 'Signing in to GitHub CLI'
        Invoke-Tool -Command 'gh' -Arguments @('auth', 'login', '--web', '--git-protocol', 'https')
    }
    else {
        Write-Info 'GitHub CLI is already authenticated.'
    }

    $cfStatus = Invoke-Tool -Command 'npx' -Arguments @('wrangler', 'whoami', '--json') -Capture -AllowFailure -Quiet
    if ($cfStatus.ExitCode -ne 0) {
        Write-Step 'Signing in to Cloudflare Wrangler'
        Invoke-Tool -Command 'npx' -Arguments @('wrangler', 'login')
        $cfStatus = Invoke-Tool -Command 'npx' -Arguments @('wrangler', 'whoami', '--json') -Capture
    }
    else {
        Write-Info 'Cloudflare Wrangler is already authenticated.'
    }

    $whoAmI = ConvertFrom-JsonSafe $cfStatus.Output
    if ($null -eq $whoAmI) {
        Stop-Setup 'Wrangler authentication succeeded, but whoami JSON could not be parsed.'
    }
    return $whoAmI
}

function Resolve-GitHubOwner {
    param([string]$CurrentValue)
    if (-not [string]::IsNullOrWhiteSpace($CurrentValue)) { return $CurrentValue.Trim() }
    $result = Invoke-Tool -Command 'gh' -Arguments @('api', 'user', '--jq', '.login') -Capture
    $login = $result.Output.Trim()
    if ([string]::IsNullOrWhiteSpace($login)) {
        Stop-Setup 'Could not determine the authenticated GitHub login.'
    }
    return $login
}

function Normalize-TeamDomain {
    param([string]$Value)
    $domain = Read-RequiredValue -Prompt 'Cloudflare Access team domain, e.g. https://your-team.cloudflareaccess.com' -CurrentValue $Value
    if ($domain -notmatch '^https://[A-Za-z0-9.-]+\.cloudflareaccess\.com/?$') {
        Stop-Setup 'TEAM_DOMAIN must look like https://your-team.cloudflareaccess.com'
    }
    return $domain.TrimEnd('/')
}

function Ensure-NpmDependenciesAndQa {
    Write-Banner 'Locked dependencies and local QA'
    Write-Step 'Installing locked npm dependencies'
    Invoke-Tool -Command 'npm' -Arguments @('ci')

    if ($SkipLocalQa) {
        Write-Warn 'Local QA was skipped by request. GitHub Actions will still run QA before deployment.'
        return
    }

    Write-Step 'Installing Playwright Chromium'
    Invoke-Tool -Command 'npx' -Arguments @('playwright', 'install', 'chromium')
    Write-Step 'Running complete CarePlan QA suite'
    Invoke-Tool -Command 'npm' -Arguments @('run', 'qa')
    Write-Step 'Running production dependency audit'
    Invoke-Tool -Command 'npm' -Arguments @('audit', '--omit=dev')
}

function Ensure-CloudflareResources {
    param([Parameter(Mandatory)][string]$WranglerPath)

    Write-Banner 'Cloudflare Pages, D1 and R2'

    $pagesListResult = Invoke-Tool -Command 'npx' -Arguments @('wrangler', 'pages', 'project', 'list', '--json') -Capture
    $pages = ConvertFrom-JsonSafe $pagesListResult.Output
    $pageExists = @($pages) | Where-Object {
        [string](Get-ObjectPropertyValue -Object $_ -Names @('name', 'project_name') -DefaultValue '') -eq $PagesProjectName
    } | Select-Object -First 1
    if ($null -eq $pageExists) {
        Write-Step "Creating Pages project '$PagesProjectName'"
        Invoke-Tool -Command 'npx' -Arguments @(
            'wrangler', 'pages', 'project', 'create', $PagesProjectName,
            '--production-branch', $ProductionBranch
        )
    }
    else {
        Write-Info "Pages project already exists: $PagesProjectName"
    }

    $d1ListResult = Invoke-Tool -Command 'npx' -Arguments @('wrangler', 'd1', 'list', '--json') -Capture
    $d1List = ConvertFrom-JsonSafe $d1ListResult.Output
    $database = Get-D1DatabaseRecord -D1List $d1List -Name $D1DatabaseName
    if ($null -eq $database) {
        Write-Step "Creating D1 database '$D1DatabaseName'"
        $arguments = @('wrangler', 'd1', 'create', $D1DatabaseName)
        if (-not [string]::IsNullOrWhiteSpace($D1Location)) {
            $arguments += @('--location', $D1Location)
        }
        Invoke-Tool -Command 'npx' -Arguments $arguments
        $d1ListResult = Invoke-Tool -Command 'npx' -Arguments @('wrangler', 'd1', 'list', '--json') -Capture
        $d1List = ConvertFrom-JsonSafe $d1ListResult.Output
        $database = Get-D1DatabaseRecord -D1List $d1List -Name $D1DatabaseName
    }
    if ($null -eq $database) {
        Stop-Setup "D1 database '$D1DatabaseName' could not be found after creation."
    }
    $databaseId = Get-D1DatabaseId -Database $database
    Write-Info "D1 database: $D1DatabaseName ($databaseId)"

    $r2Info = Invoke-Tool -Command 'npx' -Arguments @('wrangler', 'r2', 'bucket', 'info', $R2BucketName, '--json') -Capture -AllowFailure -Quiet
    if ($r2Info.ExitCode -ne 0) {
        Write-Step "Creating private R2 bucket '$R2BucketName'"
        $arguments = @('wrangler', 'r2', 'bucket', 'create', $R2BucketName)
        if (-not [string]::IsNullOrWhiteSpace($R2Location)) {
            $arguments += @('--location', $R2Location)
        }
        Invoke-Tool -Command 'npx' -Arguments $arguments
    }
    else {
        Write-Info "R2 bucket already exists: $R2BucketName"
    }

    return [pscustomobject]@{
        D1DatabaseId = $databaseId
    }
}

function Update-WranglerConfiguration {
    param(
        [Parameter(Mandatory)][string]$WranglerPath,
        [Parameter(Mandatory)][string]$D1DatabaseId
    )

    Write-Banner 'Production configuration'
    $config = Get-Content -LiteralPath $WranglerPath -Raw | ConvertFrom-Json -Depth 100

    $config.name = $PagesProjectName
    $config.pages_build_output_dir = './public'

    if ($null -eq $config.d1_databases -or @($config.d1_databases).Count -eq 0) {
        Stop-Setup 'wrangler.jsonc has no D1 binding.'
    }
    $config.d1_databases[0].binding = 'CAREPLAN_DB'
    $config.d1_databases[0].database_name = $D1DatabaseName
    $config.d1_databases[0].database_id = $D1DatabaseId
    $config.d1_databases[0].migrations_dir = 'migrations'

    if ($null -eq $config.r2_buckets -or @($config.r2_buckets).Count -eq 0) {
        Stop-Setup 'wrangler.jsonc has no R2 binding.'
    }
    $config.r2_buckets[0].binding = 'CAREPLAN_MEDIA'
    $config.r2_buckets[0].bucket_name = $R2BucketName

    if ($null -eq $config.vars) {
        $config | Add-Member -MemberType NoteProperty -Name vars -Value ([pscustomobject]@{})
    }
    $config.vars.APP_ENV = 'production'
    $config.vars.TEAM_DOMAIN = $TeamDomain
    $config.vars.POLICY_AUD = $PolicyAud
    $config.vars.ALLOW_LOCAL_DEV = 'false'
    $config.vars.DATA_ENCRYPTION_KEY_ID = 'primary'

    $json = $config | ConvertTo-Json -Depth 100
    Set-Content -LiteralPath $WranglerPath -Value $json -Encoding utf8NoBOM
    Write-Info "Updated $WranglerPath"
}

function Set-CloudflareEncryptionSecret {
    param([Parameter(Mandatory)][string]$WranglerPath)

    Write-Banner 'Application encryption secret'
    Write-Info 'A new 32-byte AES key will be generated unless an existing key is supplied.'
    Write-Info 'Using a new key on an existing live database makes old encrypted records unreadable.'

    $existingSecrets = Invoke-Tool -Command 'npx' -Arguments @(
        'wrangler', 'pages', 'secret', 'list',
        '--project-name', $PagesProjectName,
        '--config', $WranglerPath
    ) -Capture -AllowFailure -Quiet

    $secretAlreadyExists = $existingSecrets.Output -match 'DATA_ENCRYPTION_KEY'
    $replaceExisting = $true
    if ($secretAlreadyExists) {
        $replaceExisting = Read-YesNo -Prompt 'DATA_ENCRYPTION_KEY already exists. Replace it?' -DefaultYes $false
        if (-not $replaceExisting) {
            Write-Info 'Existing Cloudflare encryption secret preserved.'
            return [pscustomobject]@{ RecoveryFile = $null; Replaced = $false }
        }
        Write-Warn 'Only replace this key before customer data exists, or during an approved key-rotation procedure.'
        if (-not (Read-YesNo -Prompt 'Confirm encryption key replacement' -DefaultYes $false)) {
            Stop-Setup 'Encryption key replacement was cancelled.'
        }
    }

    $useExisting = Read-YesNo -Prompt 'Do you already have the approved base64 32-byte encryption key?' -DefaultYes $false
    if ($useExisting) {
        $secureKey = Read-Host 'Paste DATA_ENCRYPTION_KEY (input hidden)' -AsSecureString
        $plainKey = ConvertFrom-SecureStringPlainText -SecureValue $secureKey
        try {
            $decoded = [Convert]::FromBase64String($plainKey)
            if ($decoded.Length -ne 32) { Stop-Setup 'DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.' }
        }
        catch {
            Stop-Setup 'DATA_ENCRYPTION_KEY must be valid base64 for exactly 32 bytes.'
        }
    }
    else {
        $plainKey = New-RandomBase64Key -ByteCount 32
    }

    $script:SensitiveValues.Add($plainKey)
    Invoke-ToolWithStdin -InputText $plainKey -Command 'npx' -Arguments @(
        'wrangler', 'pages', 'secret', 'put', 'DATA_ENCRYPTION_KEY',
        '--project-name', $PagesProjectName,
        '--config', $WranglerPath
    ) | Out-Null

    $recoveryFile = Protect-RecoveryKeyForCurrentWindowsUser -PlainKey $plainKey -ProjectName $PagesProjectName
    $plainKey = $null
    [GC]::Collect()

    if ($null -ne $recoveryFile) {
        Write-Warn "Recovery key saved with Windows DPAPI protection: $recoveryFile"
        Write-Warn 'DPAPI recovery works only for this Windows user profile. Copy the key into an approved off-device password manager or secrets vault before launch.'
    }

    return [pscustomobject]@{ RecoveryFile = $recoveryFile; Replaced = $true }
}

function Apply-D1Migrations {
    param([Parameter(Mandatory)][string]$WranglerPath)
    Write-Banner 'D1 migrations'
    Invoke-Tool -Command 'npx' -Arguments @(
        'wrangler', 'd1', 'migrations', 'apply', $D1DatabaseName,
        '--remote', '--config', $WranglerPath
    )
}

function Provision-FirstWorkspace {
    param([Parameter(Mandatory)][string]$WranglerPath)

    if ($SkipWorkspaceProvisioning) {
        Write-Warn 'Initial workspace invitation was skipped.'
        return
    }

    $provision = $true
    if ([string]::IsNullOrWhiteSpace($WorkspaceSlug) -and [string]::IsNullOrWhiteSpace($WorkspaceOwnerEmail)) {
        $provision = Read-YesNo -Prompt 'Create the first owner workspace invitation now?' -DefaultYes $true
    }
    if (-not $provision) { return }

    $slug = Read-RequiredValue -Prompt 'Workspace slug, e.g. family-one' -CurrentValue $WorkspaceSlug
    $slug = $slug.ToLowerInvariant()
    if ($slug -notmatch '^[a-z0-9]+(?:-[a-z0-9]+)*$' -or $slug.Length -gt 63) {
        Stop-Setup 'Workspace slug must be 1-63 lowercase letters/numbers with optional internal hyphens.'
    }

    $ownerEmail = Read-RequiredValue -Prompt 'Owner email used by Cloudflare Access' -CurrentValue $WorkspaceOwnerEmail
    if ($ownerEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        Stop-Setup 'Workspace owner email is not valid.'
    }

    $createdBy = $ProvisionedByEmail
    if ([string]::IsNullOrWhiteSpace($createdBy)) { $createdBy = $ownerEmail }

    $slugSql = $slug.Replace("'", "''")
    $ownerSql = $ownerEmail.Trim().ToLowerInvariant().Replace("'", "''")
    $createdBySql = $createdBy.Trim().ToLowerInvariant().Replace("'", "''")
    $sql = "INSERT OR REPLACE INTO workspace_invites(workspace_slug,email,role,created_at,created_by) VALUES('$slugSql','$ownerSql','owner',datetime('now'),'$createdBySql');"

    Write-Step "Provisioning owner invitation for /$slug"
    Invoke-Tool -Command 'npx' -Arguments @(
        'wrangler', 'd1', 'execute', $D1DatabaseName,
        '--remote', '--yes', '--command', $sql,
        '--config', $WranglerPath
    )
    $script:ProvisionedWorkspaceSlug = $slug
    Write-Info "Initial workspace URL after deployment: https://$PagesProjectName.pages.dev/$slug/"
}

function Ensure-GitRepository {
    param(
        [Parameter(Mandatory)][string]$Owner,
        [Parameter(Mandatory)][string]$RepoFullName
    )

    Write-Banner 'Git and GitHub repository'

    if (-not (Test-Path -LiteralPath '.git')) {
        Write-Step 'Initializing local Git repository'
        Invoke-Tool -Command 'git' -Arguments @('init')
    }
    Invoke-Tool -Command 'git' -Arguments @('branch', '-M', $ProductionBranch)

    $gitName = Invoke-Tool -Command 'git' -Arguments @('config', '--get', 'user.name') -Capture -AllowFailure -Quiet
    if ([string]::IsNullOrWhiteSpace($gitName.Output)) {
        Invoke-Tool -Command 'git' -Arguments @('config', 'user.name', $Owner)
    }
    $gitEmail = Invoke-Tool -Command 'git' -Arguments @('config', '--get', 'user.email') -Capture -AllowFailure -Quiet
    if ([string]::IsNullOrWhiteSpace($gitEmail.Output)) {
        Invoke-Tool -Command 'git' -Arguments @('config', 'user.email', "$Owner@users.noreply.github.com")
    }

    $repoView = Invoke-Tool -Command 'gh' -Arguments @('repo', 'view', $RepoFullName, '--json', 'nameWithOwner,url') -Capture -AllowFailure -Quiet
    if ($repoView.ExitCode -ne 0) {
        Write-Step "Creating GitHub repository '$RepoFullName'"
        $visibilityFlag = "--$RepositoryVisibility"
        Invoke-Tool -Command 'gh' -Arguments @(
            'repo', 'create', $RepoFullName,
            $visibilityFlag,
            '--description', 'CarePlan · Specialcare private care planning PWA',
            '--source', '.',
            '--remote', 'origin'
        )
    }
    else {
        Write-Info "GitHub repository already exists: $RepoFullName"
        $remoteResult = Invoke-Tool -Command 'git' -Arguments @('remote', 'get-url', 'origin') -Capture -AllowFailure -Quiet
        $expectedRemote = "https://github.com/$RepoFullName.git"
        if ($remoteResult.ExitCode -ne 0) {
            Invoke-Tool -Command 'git' -Arguments @('remote', 'add', 'origin', $expectedRemote)
        }
        elseif (($remoteResult.Output.Trim() -ne $expectedRemote) -and ($remoteResult.Output.Trim() -ne "git@github.com:$RepoFullName.git")) {
            if (-not $ForceExistingRemote) {
                Stop-Setup "Existing origin points to '$($remoteResult.Output.Trim())', not '$RepoFullName'. Rerun with -ForceExistingRemote to replace it."
            }
            Invoke-Tool -Command 'git' -Arguments @('remote', 'set-url', 'origin', $expectedRemote)
        }
    }

    Invoke-Tool -Command 'gh' -Arguments @('repo', 'set-default', $RepoFullName)
}

function Set-GitHubDeploymentConfiguration {
    param(
        [Parameter(Mandatory)][string]$RepoFullName,
        [Parameter(Mandatory)][string]$ApiToken
    )

    Write-Banner 'GitHub Actions environment, secrets and variables'

    Invoke-Tool -Command 'gh' -Arguments @(
        'api', '--method', 'PUT',
        "repos/$RepoFullName/environments/production",
        '--silent'
    )

    Invoke-ToolWithStdin -InputText $ApiToken -Command 'gh' -Arguments @(
        'secret', 'set', 'CLOUDFLARE_API_TOKEN', '--repo', $RepoFullName
    ) | Out-Null
    Invoke-ToolWithStdin -InputText $CloudflareAccountId -Command 'gh' -Arguments @(
        'secret', 'set', 'CLOUDFLARE_ACCOUNT_ID', '--repo', $RepoFullName
    ) | Out-Null

    $variables = [ordered]@{
        CLOUDFLARE_PAGES_PROJECT  = $PagesProjectName
        CAREPLAN_D1_DATABASE_NAME = $D1DatabaseName
        CAREPLAN_R2_BUCKET_NAME   = $R2BucketName
    }
    foreach ($item in $variables.GetEnumerator()) {
        Invoke-Tool -Command 'gh' -Arguments @(
            'variable', 'set', $item.Key,
            '--repo', $RepoFullName,
            '--body', [string]$item.Value
        )
    }
}

function Commit-And-Push {
    param([Parameter(Mandatory)][string]$RepoFullName)

    Write-Banner 'Commit and GitHub deployment'
    Invoke-Tool -Command 'git' -Arguments @('add', '--all')
    $diff = Invoke-Tool -Command 'git' -Arguments @('diff', '--cached', '--quiet') -Capture -AllowFailure -Quiet
    if ($diff.ExitCode -ne 0) {
        Invoke-Tool -Command 'git' -Arguments @(
            'commit', '-m', 'Configure CarePlan v9.8 production infrastructure'
        )
    }
    else {
        Write-Info 'No uncommitted project changes were detected.'
    }

    if ($SkipGitPush) {
        Write-Warn 'Git push was skipped. Run `git push -u origin main` when ready.'
        return
    }

    $remoteHead = Invoke-Tool -Command 'git' -Arguments @('ls-remote', '--heads', 'origin', $ProductionBranch) -Capture -AllowFailure -Quiet
    if (($remoteHead.ExitCode -eq 0) -and (-not [string]::IsNullOrWhiteSpace($remoteHead.Output))) {
        Write-Info "Remote branch '$ProductionBranch' already exists; fetching before push."
        Invoke-Tool -Command 'git' -Arguments @('fetch', 'origin', $ProductionBranch)
        $aheadBehind = Invoke-Tool -Command 'git' -Arguments @(
            'rev-list', '--left-right', '--count', "HEAD...origin/$ProductionBranch"
        ) -Capture -AllowFailure -Quiet
        if ($aheadBehind.ExitCode -eq 0) {
            $parts = $aheadBehind.Output.Trim() -split '\s+'
            $remoteOnly = if ($parts.Count -ge 2) { [int]$parts[1] } else { 0 }
            if ($remoteOnly -gt 0) {
                Stop-Setup "The remote branch contains $remoteOnly commit(s) not in this folder. Pull/reconcile those changes before rerunning; the setup script will not force-push."
            }
        }
    }

    Invoke-Tool -Command 'git' -Arguments @('push', '--set-upstream', 'origin', $ProductionBranch)

    if ($SkipWorkflowWatch) {
        Write-Warn 'Workflow watch was skipped. Check GitHub Actions manually.'
        return
    }

    Write-Step 'Waiting for the production GitHub Actions run to appear'
    $runId = $null
    for ($attempt = 0; $attempt -lt 30 -and $null -eq $runId; $attempt++) {
        Start-Sleep -Seconds 4
        $runResult = Invoke-Tool -Command 'gh' -Arguments @(
            'run', 'list', '--repo', $RepoFullName,
            '--workflow', 'deploy-production.yml', '--limit', '1',
            '--json', 'databaseId,headBranch,status,conclusion,url'
        ) -Capture -AllowFailure -Quiet
        if ($runResult.ExitCode -eq 0) {
            $runs = ConvertFrom-JsonSafe $runResult.Output
            $run = @($runs) | Where-Object { $_.headBranch -eq $ProductionBranch } | Select-Object -First 1
            if ($null -ne $run) { $runId = [string]$run.databaseId }
        }
    }

    if ($null -eq $runId) {
        Write-Warn 'The deployment workflow was not detected within two minutes. Open the repository Actions tab to inspect it.'
        return
    }

    Write-Step "Watching GitHub Actions run $runId"
    Invoke-Tool -Command 'gh' -Arguments @('run', 'watch', $runId, '--repo', $RepoFullName, '--exit-status')
}

function Get-CloudflareApiTokenSecurely {
    if (-not [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
        Write-Warn 'Using CLOUDFLARE_API_TOKEN from the current process environment.'
        return $env:CLOUDFLARE_API_TOKEN
    }

    Write-Host ''
    Write-Host 'GitHub Actions needs a Cloudflare API token.' -ForegroundColor Cyan
    Write-Host 'Create a least-privilege token in Cloudflare, allowing the selected account to:' -ForegroundColor Gray
    Write-Host '  - edit Cloudflare Pages;' -ForegroundColor Gray
    Write-Host '  - edit D1 databases/migrations;' -ForegroundColor Gray
    Write-Host '  - access the required R2 resource binding as applicable.' -ForegroundColor Gray
    Write-Host 'The token is read with hidden input, sent directly to GitHub Secrets, and not written to disk.' -ForegroundColor Gray

    $secure = Read-Host 'Cloudflare API token' -AsSecureString
    $plain = ConvertFrom-SecureStringPlainText -SecureValue $secure
    if ([string]::IsNullOrWhiteSpace($plain)) {
        Stop-Setup 'Cloudflare API token cannot be empty.'
    }
    return $plain
}

function Write-FinalSummary {
    param(
        [Parameter(Mandatory)][string]$RepoFullName,
        [Parameter()][string]$RecoveryFile
    )

    Write-Banner 'Setup complete'
    Write-Host "GitHub repository : https://github.com/$RepoFullName" -ForegroundColor White
    Write-Host "Pages project     : https://$PagesProjectName.pages.dev" -ForegroundColor White
    Write-Host "D1 database       : $D1DatabaseName" -ForegroundColor White
    Write-Host "R2 bucket         : $R2BucketName (private by default)" -ForegroundColor White
    Write-Host "Access team domain: $TeamDomain" -ForegroundColor White
    if (-not [string]::IsNullOrWhiteSpace($script:ProvisionedWorkspaceSlug)) {
        Write-Host "Workspace          : https://$PagesProjectName.pages.dev/$($script:ProvisionedWorkspaceSlug)/" -ForegroundColor White
    }
    if (-not [string]::IsNullOrWhiteSpace($RecoveryFile)) {
        Write-Host "DPAPI recovery key : $RecoveryFile" -ForegroundColor White
    }

    Write-Host ''
    Write-Host 'Mandatory remaining Cloudflare dashboard steps:' -ForegroundColor Yellow
    Write-Host '  1. Attach your custom HTTPS domain to the Pages project.' -ForegroundColor Yellow
    Write-Host '  2. Create/verify the Cloudflare Access self-hosted application over the entire hostname.' -ForegroundColor Yellow
    Write-Host '  3. Ensure the Access team domain and AUD tag match wrangler.jsonc.' -ForegroundColor Yellow
    Write-Host '  4. Complete every live item in RELEASE-CHECKLIST.md before real patient data.' -ForegroundColor Yellow
    Write-Host '  5. Store the encryption recovery key in an approved off-device secrets vault.' -ForegroundColor Yellow
}

try {
    Write-Banner 'CarePlan · Specialcare v9.8 — GitHub + Cloudflare setup'
    $ProjectRoot = Assert-ProjectRoot
    Set-Location -LiteralPath $ProjectRoot

    Ensure-Prerequisites
    $whoAmI = Ensure-Authentication

    $GitHubOwner = Resolve-GitHubOwner -CurrentValue $GitHubOwner
    $repoFullName = "$GitHubOwner/$RepositoryName"

    $accounts = Get-CloudflareAccounts -WhoAmI $whoAmI
    $CloudflareAccountId = Select-CloudflareAccountId -Accounts $accounts -CurrentValue $CloudflareAccountId
    $TeamDomain = Normalize-TeamDomain -Value $TeamDomain
    $PolicyAud = Read-RequiredValue -Prompt 'Cloudflare Access application AUD tag' -CurrentValue $PolicyAud

    $wranglerPath = Join-Path $ProjectRoot 'wrangler.jsonc'

    Ensure-NpmDependenciesAndQa
    $resources = Ensure-CloudflareResources -WranglerPath $wranglerPath
    Update-WranglerConfiguration -WranglerPath $wranglerPath -D1DatabaseId $resources.D1DatabaseId

    $secretResult = Set-CloudflareEncryptionSecret -WranglerPath $wranglerPath
    Apply-D1Migrations -WranglerPath $wranglerPath
    Provision-FirstWorkspace -WranglerPath $wranglerPath

    Ensure-GitRepository -Owner $GitHubOwner -RepoFullName $repoFullName

    $cloudflareApiToken = Get-CloudflareApiTokenSecurely
    $script:SensitiveValues.Add($cloudflareApiToken)
    Set-GitHubDeploymentConfiguration -RepoFullName $repoFullName -ApiToken $cloudflareApiToken
    $cloudflareApiToken = $null
    [GC]::Collect()

    Commit-And-Push -RepoFullName $repoFullName
    Write-FinalSummary -RepoFullName $repoFullName -RecoveryFile $secretResult.RecoveryFile
}
catch {
    Write-Host ''
    Write-Host 'SETUP FAILED' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    Write-Host 'Nothing is force-deleted or force-pushed by this script. Correct the reported issue and rerun; completed resource-creation steps are idempotent.' -ForegroundColor Yellow
    exit 1
}
finally {
    $script:SensitiveValues.Clear()
    Set-Location $script:OriginalLocation
}
