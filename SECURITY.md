# Security model

## Security boundary

CarePlan · Specialcare is designed as a private authenticated workspace, not a public health-record portal.

- Protect the entire production hostname with Cloudflare Access.
- Pages Functions independently validate the Access JWT, issuer and audience.
- D1 membership enforces `owner`, `editor` and `viewer` roles per workspace.
- Writes require same-origin browser requests and a CarePlan client header.
- Viewer accounts cannot change workspace records or media.

## Data at rest

### D1 records

Workspace JSON is encrypted with AES-256-GCM before storage. Associated data binds ciphertext to the workspace slug. D1 stores an encryption envelope, ETag and audit metadata rather than readable care records.

### R2 media

Original image/video bytes and generated thumbnails are separately encrypted with AES-256-GCM before R2 storage. Associated data includes workspace slug, media ID and object variant. D1 stores media metadata and encryption metadata; R2 stores ciphertext.

### Keys

- `DATA_ENCRYPTION_KEY`: current 32-byte base64 key, stored only as a Cloudflare encrypted secret.
- `DATA_ENCRYPTION_KEY_ID`: non-secret identifier.
- Optional previous key variables support controlled read compatibility during rotation.
- Losing all usable encryption keys makes stored records and media unrecoverable.

See `docs/KEY-RECOVERY-AND-ROTATION.md`.

## Data in the browser

The PWA keeps an offline working copy of record data in browser storage. This improves resilience but means:

- a compromised/unlocked device or browser profile can expose its local copy;
- clearing site data can remove unsynced changes;
- private/incognito sessions are unsuitable;
- attached cloud media normally requires a connection after restart;
- the service worker caches only application shell assets and a data-free HTML shell, never `/api/` responses.

Require device encryption, screen lock, supported browsers and prompt access revocation when a caregiver leaves.

## Concurrency and recovery

- ETags and `If-Match` prevent silent last-write-wins overwrites.
- If both cloud and browser changed, the UI requires an explicit conflict decision and retains a browser recovery copy.
- Password-encrypted complete backups include records and media.
- Backups are user-controlled files; their password cannot be recovered by the application.

## Media controls

- Server-enforced MIME allowlist, byte-size limits and file-signature checks.
- R2 objects are not public.
- Downloads require Access identity and workspace membership.
- Deletion removes D1 metadata and R2 objects and creates an audit event.
- Video duration is checked in the browser; strict server-side duration verification would require a dedicated media-processing service.
- This release does not include malware scanning, content moderation or transcoding. Add those controls if required by your risk assessment.

## Audit

Audit events are created for workspace creation/update and media upload/delete. The included audit log is operational evidence, not an immutable/WORM compliance ledger. Export or stream audit events to a protected retention system if regulation or contractual policy requires immutability.

## HTTP security

The package includes:

- restrictive Content Security Policy;
- HSTS;
- frame denial;
- no-referrer policy;
- noindex headers;
- same-origin opener/resource controls;
- no-store API responses;
- same-origin write validation.

## Medical safety

CarePlan is an organisational and handover tool. It is not a prescribing system, diagnostic system, emergency service or replacement for a clinician-approved medication chart. Live deployment must include appropriate customer terms, privacy notice, consent, retention policy and emergency-use disclaimer.

## Not established by this package

This package alone does not establish:

- HIPAA, Malaysian PDPA, GDPR or other legal compliance;
- medical-device registration;
- independent penetration-test clearance;
- accessibility certification;
- production recovery-time/recovery-point guarantees;
- Cloudflare account security or customer operational discipline.

Complete the release checklist, obtain jurisdiction-specific advice and commission independent security testing before representing the product as certified or compliant.

## Reporting a vulnerability

Do not open a public issue containing patient data or exploit details. Configure a private security contact and GitHub private vulnerability reporting before launch.
