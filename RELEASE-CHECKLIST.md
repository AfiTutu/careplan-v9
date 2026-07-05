# Mandatory production release checklist

Do not enter real patient information until every applicable item is complete and evidenced.

## GitHub and deployment

- [ ] Repository is private.
- [ ] `main` branch protection requires the QA workflow.
- [ ] Direct pushes to `main` are restricted.
- [ ] Required GitHub secrets exist: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- [ ] Required GitHub variables exist: `CLOUDFLARE_PAGES_PROJECT`, `CAREPLAN_D1_DATABASE_NAME`, `CAREPLAN_R2_BUCKET_NAME`.
- [ ] Cloudflare API token is least-privilege and has an expiry/rotation owner.
- [ ] Dependabot and private vulnerability reporting are enabled.

## Cloudflare resources

- [ ] Placeholder D1 ID/name in `wrangler.jsonc` replaced with the real production database.
- [ ] Placeholder R2 bucket replaced with the real private bucket.
- [ ] `TEAM_DOMAIN` and `POLICY_AUD` are real Access values.
- [ ] `ALLOW_LOCAL_DEV` remains `false` in production.
- [ ] All D1 migrations apply remotely without errors.
- [ ] Pages Functions can access both `CAREPLAN_DB` and `CAREPLAN_MEDIA`.
- [ ] The custom production domain is active and HTTPS-only.

## Authentication and authorization

- [ ] Cloudflare Access protects the full hostname, including assets and `/api/` routes.
- [ ] Only approved identity providers and policies are enabled.
- [ ] MFA requirements match the risk assessment.
- [ ] Owner, editor, viewer and uninvited-user tests pass on production HTTPS.
- [ ] Revoked users lose access promptly.
- [ ] A lost/stolen-device response procedure is documented.

## Encryption and keys

- [ ] A random 32-byte key is stored as `DATA_ENCRYPTION_KEY` in Cloudflare encrypted secrets.
- [ ] The real key is absent from GitHub, build logs, `.env` files and support tickets.
- [ ] Recovery copy is stored in an approved secure vault with controlled access.
- [ ] Key-loss and rotation runbooks have named owners.
- [ ] D1 inspection confirms no readable care record JSON.
- [ ] R2 inspection confirms original media is not readable plaintext.

## Functional acceptance

- [ ] Create, edit and reopen patient, caregiver and multiple-hospital profiles.
- [ ] Add/edit/delete External Links and verify Delete appears before Edit.
- [ ] Meal day-card dates display correctly on mobile and desktop.
- [ ] Emergency Contacts display cleanly at mobile and desktop widths.
- [ ] Add image and short-video attachments to Care and Logs.
- [ ] Today renders linked task media correctly.
- [ ] Calendar monthly print contains every event and attached images/video thumbnails.
- [ ] Care weekly print contains all scheduled items and attached images/video thumbnails.
- [ ] Handover prints all pages without truncation and medicines match the live Medicines module.
- [ ] Empty log templates print landscape with adequate writing space.
- [ ] `.ics` export imports as expected into every supported calendar application.
- [ ] Encrypted backup download and restore succeeds with records and media.
- [ ] Wrong backup password fails safely.
- [ ] Two-device conflict test blocks silent overwrite.
- [ ] Offline record edit resynchronises correctly after reconnecting.

## PWA acceptance

- [ ] Install succeeds on supported Android, iOS/iPadOS and desktop browsers.
- [ ] Mobile bottom navigation and full menu drawer expose every module.
- [ ] Desktop sidebar exposes the same functionality.
- [ ] App shell opens after one prior online load when offline.
- [ ] API and private media responses are absent from service-worker caches.
- [ ] Browser/site-data loss warning is visible in Data & PWA.

## Security and resilience

- [ ] Independent penetration test completed and material findings resolved.
- [ ] Dependency/security scan reviewed.
- [ ] Content Security Policy tested on the production hostname.
- [ ] D1 restore/time-travel procedure tested.
- [ ] R2 recovery/versioning policy defined and tested if enabled.
- [ ] Encrypted backup restore drill completed by someone other than the developer.
- [ ] Monitoring and alerting cover authentication/API/deployment failures.
- [ ] Incident response and breach notification procedures are approved.
- [ ] Audit-log retention/export requirements are implemented.

## Legal, privacy and customer operations

- [ ] Jurisdiction-specific privacy assessment completed.
- [ ] Privacy notice, terms, consent and retention/deletion policy published.
- [ ] Data-controller/processor roles and Cloudflare terms reviewed.
- [ ] Customer support and urgent-access escalation are documented.
- [ ] Medical and emergency-use disclaimers approved.
- [ ] Product claims do not state certification or compliance not independently established.

## Release sign-off

- [ ] Product owner
- [ ] Security reviewer
- [ ] Privacy/legal reviewer
- [ ] Operations owner
- [ ] Production acceptance date and deployed commit recorded
