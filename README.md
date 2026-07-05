# CarePlan · Specialcare v9.8

Mobile-first care-planning PWA for Cloudflare Pages, Pages Functions, D1, R2 and Cloudflare Access.

This repository is the **production deployment candidate** built from the approved v9.7 standalone frontend. The final UI scope was deliberately limited to:

1. corrected Meal day-card dates;
2. redesigned SOS emergency-contact cards;
3. Delete placed before Edit in External Links;
4. images/video still thumbnails included in Calendar and Care prints; and
5. removal of the repeated brand eyebrow above page headings.

No other approved care workflow was intentionally redesigned.

## Architecture

- **GitHub:** source of truth, pull requests, QA and production workflow.
- **Cloudflare Pages:** static PWA shell.
- **Pages Functions:** authenticated workspace and private-media API.
- **Cloudflare Access:** identity boundary for the whole application hostname.
- **D1:** encrypted workspace documents, membership, media metadata and audit events.
- **R2:** private application-encrypted image/video objects.
- **Browser:** offline working copy of records plus the installable PWA shell.

Workspace records and media are encrypted with AES-256-GCM before being written to D1 or R2. The encryption key is a Cloudflare encrypted secret and must never be committed to GitHub.

## Local QA

```bash
npm ci
npm run qa
```

Useful commands:

```bash
npm run check             # static checks + unit tests
npm run test:e2e          # Chromium UI/workflow tests
npm run build:functions   # compile Pages Functions
npm audit --omit=dev
```

For local Pages Functions testing:

```bash
cp .dev.vars.example .dev.vars
# replace the placeholder with a random 32-byte base64 key
npx wrangler d1 migrations apply CAREPLAN_DB --local
npm run dev
```

Create a local invite before initializing a workspace:

```bash
npx wrangler d1 execute CAREPLAN_DB --local --command \
  "INSERT INTO workspace_invites(workspace_slug,email,role,created_at,created_by)
   VALUES('family-one','developer@local.invalid','owner',datetime('now'),'local-admin');"
```

Then open `http://127.0.0.1:8788/family-one/`.

## One-time Cloudflare setup

Follow `docs/DEPLOYMENT-CLOUDFLARE.md` and `docs/GITHUB-CLOUDFLARE-CICD.md`.

You must create and configure:

- one private GitHub repository;
- one Cloudflare Pages project;
- one D1 database;
- one private R2 bucket;
- one Cloudflare Access self-hosted application protecting the full hostname;
- the `DATA_ENCRYPTION_KEY` encrypted secret;
- GitHub deployment secrets and variables;
- at least one workspace invitation.

After setup, routine source changes happen through GitHub. Pull requests run QA. A merge to `main` applies versioned D1 migrations and deploys Pages only after QA succeeds.

## Workspace URLs

Each patient workspace uses a stable path:

```text
https://care.example.com/<workspace-slug>/
```

The slug is validated and also binds encryption/authentication context. Do not rename a live slug manually.

## Media

- Images: JPEG, PNG, WebP or GIF; maximum 8 MB.
- Videos: MP4, WebM or QuickTime; maximum 25 MB.
- The frontend limits video duration to 30 seconds.
- The API validates file signatures and encrypts bytes before R2 storage.
- Calendar and Care printing includes images; video attachments print a still thumbnail.

Private media API responses are never placed in the service-worker cache.

## Backups

The Data & PWA section creates a password-encrypted `.careplan` backup containing records and media. Use a unique password of at least 12 characters and store it separately. Test restore procedures before selling access.

## Release status

The source and local emulation have passed the checks documented in `QA-REPORT.md`. This does **not** constitute independent enterprise certification, medical-device approval, penetration testing, legal compliance or production disaster-recovery proof. Complete every live acceptance item in `RELEASE-CHECKLIST.md` before real patient information is entered.
