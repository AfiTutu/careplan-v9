# CarePlan · Specialcare v9.8 QA report

**Assessment date:** 3 July 2026  
**Artifact:** GitHub/Cloudflare production deployment candidate  
**Frontend basis:** approved v9.7 standalone build, with only the five explicitly requested UI fixes

## Verdict

The repository passed the included source-level, unit, Chromium and local Cloudflare-emulation checks. It is ready for GitHub upload and controlled production acceptance testing.

It is **not** an independent enterprise certification, compliance attestation, penetration-test report, medical-device approval or proof of live disaster recovery. Real patient use remains blocked by the mandatory live items in `RELEASE-CHECKLIST.md`.

## Approved five-fix scope

| Requirement | Result |
|---|---|
| Meal day-card dates are separated/readable | Passed |
| SOS emergency contacts use aligned responsive cards | Passed |
| External Links Delete appears to the left of Edit and works | Passed |
| Calendar month print includes images and video still thumbnails | Passed |
| Care week print includes images and video still thumbnails | Passed |
| Repeated brand eyebrow removed above page headings; fixed header retained | Passed |

No other approved visual/workflow redesign was intentionally introduced.

## Automated QA

### Static and source checks

- Unique static HTML IDs: **27**
- Duplicate static IDs: **0**
- External third-party scripts/styles in HTML: **0**
- Inline application scripts: **0**
- `public/app.js` syntax: passed
- Workspace API syntax: passed
- Media upload/download API syntax: passed
- Required Pages, Functions, D1, R2, PWA, security and documentation files: passed

### Unit tests

- Test files: **1/1 passed**
- Tests: **8/8 passed**
- Covered:
  - schema-98 workspace validation;
  - malformed/unsafe payload rejection;
  - workspace/media ID and allowlist validation;
  - media file-signature validation;
  - deterministic ETags;
  - AES-GCM workspace encryption and slug binding;
  - AES-GCM media encryption and object-variant binding;
  - same-origin write protection.

### Chromium workflow tests

- Tests: **6/6 passed**
- Covered:
  - exact production assets start without runtime errors;
  - approved fixed-header branding and no repeated page eyebrow;
  - Meal date layout;
  - SOS Emergency Contact layout;
  - External Link Delete/Edit ordering and deletion;
  - attached image rendering inside Care and Calendar print documents;
  - mobile full-navigation drawer and module grouping.

The browser suite loads the exact production HTML, CSS and JavaScript in an isolated Chromium document because this execution environment administratively blocks localhost browser navigation. Network/API behaviour was tested separately against live local Wrangler emulation.

### Cloudflare Functions

- Wrangler Pages Functions compilation: passed
- Wrangler version used: `4.106.0`
- Generated Functions bundle: passed

### Dependency audit

- Known production dependency vulnerabilities at QA time: **0**

## Local Cloudflare emulation

Tests ran against `wrangler pages dev` with local D1, local R2 and local-development identity injection.

| API behaviour | Result |
|---|---:|
| Authenticated invited owner session | 200 |
| First workspace initialization | 201 |
| Encrypted workspace read | 200 |
| Current-ETag update | 200 |
| Stale-ETag update | 412 |
| Cross-origin workspace write | 403 |
| Valid image upload | 201 |
| Invalid image signature | 415 |
| Original image decrypt/download round trip | 200 / byte-identical |
| Thumbnail decrypt/download round trip | 200 / byte-identical |
| Duplicate media ID without explicit replace | 409 |
| Explicit backup-style media replacement | 201 |
| Viewer workspace write | 403 |
| Viewer media upload | 403 |
| Media deletion | 200 |

### Storage inspection

- D1 encrypted workspace row contained the application encryption envelope.
- Search for a known patient name in raw `data_json`: **not found**.
- Search for a known media plaintext marker in local Wrangler storage: **not found**.
- D1 media metadata row and audit events were created.

## Deployment gate

The production verification script was tested with placeholder configuration. It correctly rejected:

- placeholder D1 database ID;
- placeholder R2 bucket;
- placeholder Cloudflare Access team domain;
- placeholder Access audience tag;
- R2/GitHub variable mismatch.

This is expected. Replace placeholders only during actual Cloudflare setup.

## Remaining live acceptance requirements

Before real patient information:

1. deploy to the real HTTPS domain;
2. complete Access owner/editor/viewer/uninvited tests;
3. inspect real remote D1 and R2 encryption;
4. test mobile/desktop PWA installation;
5. test two-device conflicts and offline resynchronisation;
6. test all multi-page prints on supported browsers/printers;
7. test encrypted backup restore including media;
8. test D1/R2 recovery and account revocation;
9. complete privacy/legal/medical disclaimers;
10. complete independent penetration and accessibility testing.
