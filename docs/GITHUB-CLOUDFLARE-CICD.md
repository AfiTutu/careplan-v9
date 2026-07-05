# GitHub-managed Cloudflare delivery

GitHub is the source of truth. Do not enable a second independent auto-deployment pipeline for the same Pages project.

## GitHub secrets

Repository or production-environment secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Use a least-privilege Cloudflare token that can deploy the intended Pages project and manage the intended D1 database. Protect the production GitHub environment with required reviewers if available.

## GitHub variables

- `CLOUDFLARE_PAGES_PROJECT`
- `CAREPLAN_D1_DATABASE_NAME`
- `CAREPLAN_R2_BUCKET_NAME`

The names must match `wrangler.jsonc`; `npm run deploy:verify` rejects placeholders or mismatches.

## Pull requests

`.github/workflows/qa.yml` runs:

```text
npm ci
npm run check
Playwright Chromium tests
Pages Functions compilation
npm audit --omit=dev
```

Require this workflow in branch protection.

## Main branch

`.github/workflows/deploy-production.yml` repeats QA, validates deployment configuration, applies unapplied D1 migrations and deploys the exact `public/` assets and Pages Functions with Wrangler.

Cloudflare encrypted secrets such as `DATA_ENCRYPTION_KEY` remain in Cloudflare and are not passed through GitHub.

## Rollback

- Application assets: select a known-good Pages deployment or redeploy a known-good Git commit.
- Database: do not reverse SQL casually. Use a tested forward migration or approved D1 recovery procedure.
- Media: restoring metadata without the matching R2 objects is incomplete. Include R2 in the recovery plan.
