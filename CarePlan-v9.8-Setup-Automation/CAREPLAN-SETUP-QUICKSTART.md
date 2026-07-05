# CarePlan · Specialcare — automated GitHub/Cloudflare setup

## Before running

1. Download and extract `CarePlan-v9.8-GitHub-Cloudflare-Production.zip`.
2. In Cloudflare Zero Trust, create a self-hosted Access application for the full CarePlan hostname.
3. Record the Access team domain and the application AUD tag.
4. Create a least-privilege Cloudflare API token for GitHub Actions with access to the selected Pages project/account, D1, and the required R2 binding.
5. Use PowerShell 7.2 or newer on Windows 10/11.

## Easiest run

Place `Setup-CarePlan-GitHub-Cloudflare.ps1` in the extracted production folder, open PowerShell 7 in that folder, and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Setup-CarePlan-GitHub-Cloudflare.ps1
```

The script prompts for anything it cannot safely discover.

## Run while the ZIP is still unextracted

Place the setup script beside the production ZIP and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\Setup-CarePlan-GitHub-Cloudflare.ps1 `
  -PackageZipPath ".\CarePlan-v9.8-GitHub-Cloudflare-Production.zip"
```

## Fully named example

```powershell
.\Setup-CarePlan-GitHub-Cloudflare.ps1 `
  -GitHubOwner "YOUR_GITHUB_LOGIN" `
  -RepositoryName "careplan-specialcare" `
  -RepositoryVisibility private `
  -PagesProjectName "careplan-specialcare" `
  -D1DatabaseName "careplan-specialcare-production" `
  -R2BucketName "careplan-specialcare-private-media" `
  -TeamDomain "https://YOUR-TEAM.cloudflareaccess.com" `
  -PolicyAud "YOUR_ACCESS_APPLICATION_AUD_TAG" `
  -WorkspaceSlug "family-one" `
  -WorkspaceOwnerEmail "owner@example.com"
```

## What it automates

- prerequisite checks and optional installation;
- GitHub CLI and Wrangler sign-in;
- GitHub repository creation;
- Cloudflare Pages project creation;
- D1 database and migrations;
- private R2 bucket creation;
- `wrangler.jsonc` production configuration;
- Cloudflare `DATA_ENCRYPTION_KEY` secret;
- a current-Windows-user DPAPI recovery copy of that key;
- initial workspace owner invitation;
- GitHub Actions environment, secrets, and variables;
- commit, push, QA, migrations, and deployment workflow monitoring.

## Still completed in the Cloudflare dashboard

- custom domain attachment and DNS;
- Cloudflare Access application/policies;
- production acceptance checks in `RELEASE-CHECKLIST.md`.

Do not accept real care data until the live release checklist is complete.
