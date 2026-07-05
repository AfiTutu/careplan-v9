# Cloudflare deployment

## 1. Create resources

Create:

- a Cloudflare Pages project;
- a D1 database, for example `careplan-specialcare-production`;
- a private R2 bucket, for example `careplan-specialcare-private-media`;
- a custom HTTPS hostname for the Pages project.

Replace the D1 `database_name`, D1 `database_id` and R2 `bucket_name` placeholders in `wrangler.jsonc`.

## 2. Configure Cloudflare Access

Create a self-hosted Access application covering the entire CarePlan hostname. Record:

- your team domain, such as `https://your-team.cloudflareaccess.com`;
- the application audience tag.

Put those values in `wrangler.jsonc` as `TEAM_DOMAIN` and `POLICY_AUD`. Keep `ALLOW_LOCAL_DEV` set to `false`.

Pages Functions validate `Cf-Access-Jwt-Assertion` independently, so do not remove Access JWT validation merely because the edge policy is active.

## 3. Configure the encryption secret

Generate a random 32-byte base64 key:

```bash
openssl rand -base64 32
```

Store it as the Cloudflare encrypted secret `DATA_ENCRYPTION_KEY` for the Pages project. Do not put it in GitHub variables, repository files or deployment logs.

Retain a protected recovery copy according to `KEY-RECOVERY-AND-ROTATION.md`.

## 4. Apply migrations

```bash
npx wrangler d1 migrations apply careplan-specialcare-production --remote
```

Migrations are versioned in `migrations/`:

- `0001_initial.sql`: workspaces, membership, invitations and audit events;
- `0002_media.sql`: encrypted R2 object metadata.

## 5. Provision a workspace

Edit and run the example invitation:

```bash
npx wrangler d1 execute careplan-specialcare-production --remote \
  --file scripts/provision-workspace.sql.example
```

Use a unique lower-case slug. The invited person initializes the workspace on first authenticated save.

## 6. Configure GitHub deployment

Follow `GITHUB-CLOUDFLARE-CICD.md`. The workflow:

1. installs locked dependencies;
2. runs static/unit/Chromium/Functions checks;
3. runs the production dependency audit;
4. validates that placeholders are gone;
5. applies remote D1 migrations;
6. deploys Pages assets and Functions.

## 7. Production acceptance

Visit the real HTTPS workspace and complete every item in `../RELEASE-CHECKLIST.md`, including Access-role tests, encrypted D1/R2 inspection, two-device conflict testing, media, print, backup restore and account revocation.
