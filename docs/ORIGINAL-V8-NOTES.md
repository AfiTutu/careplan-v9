> Historical note: this file preserves the original v8 frontend handover. The v8.2 release package now includes the Cloudflare Pages Functions backend, encrypted D1 persistence, role enforcement, and explicit conflict handling described in the current README and security documents.

# CarePlan Pro v8 — Warm Companion & Flexible Routines

## Status

This package is the upgraded single-file frontend for CarePlan Pro. It preserves the existing CarePlan v7 workspace envelope and same-origin sync contract while raising the workspace schema to **5**.

The cloud Worker still needs to provide the same production API:

- `GET /<slug>/api/data`
- `PUT /<slug>/api/data`
- `ETag` on successful GET/PUT
- `If-Match` handling and `412 Precondition Failed` for stale writes

The frontend is not a substitute for clinical advice or emergency services.

## Main UX upgrades

- Mobile-first **Today** companion screen.
- Calm care-progress ring that excludes optional and as-needed routines.
- Unified timeline for medication, caregiver routines, therapy activities, meals and same-day appointments.
- Fixed mobile navigation: Today, Daily Care, Medications, Records and SOS.
- System/light/dark appearance control with reduced-motion support.
- Warmer language and visual treatment while retaining exact medication, emergency and record details.
- Large mobile touch targets and visible controls; no action depends on swipe gestures.

## Flexible Daily Care routines

Caregivers can create routines for any real-life need, including:

- Morning care
- Personal care
- Feeding and nutrition
- Positioning
- Sleep and rest
- Therapy and play
- Communication
- School and learning
- Outdoor and community activities
- A fully custom category

Each routine supports:

- Custom name and emoji/icon
- Custom category
- Time and approximate duration
- Every day
- Weekdays
- Weekends
- Selected days
- Once a week
- One-time date
- As-needed availability
- Optional/flexible status
- Active/paused status
- Detailed caregiver instructions
- Edit, pause, resume and delete
- Done, skipped and reopened states

## Routine data model

```json
{
  "id": 1710000000000,
  "title": "Morning side-lying play",
  "icon": "🧸",
  "category": "Therapy & play",
  "frequency": "selected",
  "days": [1, 3, 5],
  "weeklyDay": "",
  "date": "",
  "time": "09:00",
  "duration": 15,
  "notes": "Use the left side first. Stop if breathing or swallowing changes.",
  "optional": true,
  "active": true,
  "events": [
    {
      "id": 1710000001234,
      "date": "2026-06-28",
      "status": "done",
      "at": "2026-06-28T09:14:00.000Z",
      "caregiver": "Mama"
    }
  ],
  "createdAt": "2026-06-27T10:00:00.000Z",
  "updatedAt": "2026-06-28T09:14:00.000Z"
}
```

Completion history is append-only. Reopening or undoing a routine creates a new `pending` event rather than silently deleting the prior record.

## Migration

Opening a v7 or older patient profile automatically adds:

```json
"routines": []
```

Existing data is preserved. The upgraded envelope reports:

```json
{
  "appVersion": "8.0.0",
  "schemaVersion": 5
}
```

The Worker must allow schema 5 payloads before v8 is deployed to production.

## Care progress rules

The percentage includes only:

- Scheduled medication doses
- Required routines due today
- Scheduled therapy activities due today

It excludes:

- Optional routines
- As-needed routines
- Meals, because the current meal model has no completion record
- Appointments
- Logs

Red is not used for ordinary incomplete progress. Red remains reserved for genuine medication alerts and emergency information.

## Required production checks

1. Upgrade an existing v7 backup and confirm all previous data remains intact.
2. Add routines for each schedule type and confirm they appear only on correct dates.
3. Confirm optional/as-needed routines do not lower care progress.
4. Mark routine done, skip, undo and reopen; confirm the event history is retained.
5. Confirm routines appear in JSON backups, CSV exports, calendar output and caregiver handover printouts.
6. Test phone widths at 320, 360, 390 and 430 px.
7. Test keyboard navigation, large text, dark mode and reduced motion.
8. Test two-device sync conflict handling through the production Worker.
9. Verify no child data, PIN, session or workspace content is written to logs.
10. Keep an exported backup during the family pilot.

## Suggested first family routines

These are examples only and should be customised to the child and clinician-approved care plan:

- Morning positioning
- Oral and face care
- Feeding setup and tube check
- Quiet floor play
- Supported side-lying play
- Stretching prescribed by the therapist
- Communication/AAC practice
- Rest and sensory regulation
- Bedtime settling routine
