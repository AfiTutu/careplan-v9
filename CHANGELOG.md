# Changelog

## 9.8.0 — GitHub/Cloudflare production candidate

### Approved final UI scope

- Corrected Meal day-card date layout.
- Rebuilt SOS Emergency Contacts into aligned responsive cards.
- Added External Link deletion immediately before Edit.
- Added attached images to Calendar month and Care week prints.
- Added video still thumbnails to Calendar/Care prints.
- Removed repeated `CarePlan · Specialcare` eyebrows above page headlines while retaining the fixed brand header.

### Production architecture

- Upgraded cloud envelope to schema 98.
- Added Cloudflare Access JWT validation and workspace roles.
- Added AES-256-GCM application encryption for D1 records.
- Added private R2 media API with per-object AES-256-GCM encryption.
- Added media type, size and file-signature validation.
- Added D1 media metadata migration and media audit events.
- Added ETag conflict protection and explicit conflict resolution.
- Added password-encrypted complete backups containing records and media.
- Added PWA service worker that excludes APIs/private media from caches.
- Added GitHub QA and gated production deployment workflow.

### Important

This is a production deployment candidate, not an independent certification or compliance attestation. Complete `RELEASE-CHECKLIST.md` before live patient use.
