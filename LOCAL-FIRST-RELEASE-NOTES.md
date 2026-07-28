# CarePlan v9.9 Local-First Release

This build is prepared for single-device customer use with browser local storage. Cloud sync, workspace paths, Access roles, D1 and R2 are intentionally disabled until the multitenant phase.

## Release decisions
- No preview/demo mode or fictional seed data.
- One production navigation/render chain remains visible after startup completes.
- Empty caregiver profiles no longer crash the Today page.
- Existing root local data is migrated from the v9.8 local-preview key when found.
- Password-encrypted complete backups remain available.
- Service worker cache version is bumped and application assets use network-first updates to prevent stale deployments.
- A startup error boundary prevents a silent empty page.

## Customer disclosure
Records remain on the device and browser used. Customers must export encrypted backups regularly. Clearing site data, private browsing, browser removal, or device loss may remove records.
