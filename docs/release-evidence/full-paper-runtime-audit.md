# Full-paper runtime audit

Date: 2026-07-16

Scope: recovered requirements P3, P11, P12 and the related U1/U2/U3
acceptance surface.

## Audited guarantees

- A full-paper sitting is advertised only after the server verifies an approved
  `complete_official_paper` review, an exact published question inventory,
  current reviewed rendering overlays/assets, a passing per-question
  solvability report, exact mark totals and complete grading coverage.
- Migration `0028` withdraws every legacy approval that predates exact content
  attestation. Reapproval stores a shared SHA-256 fingerprint over the question
  and marking source documents, every question/render overlay/asset, and every
  mark-scheme, checklist, model-answer, deterministic answer-key and answer-chain
  input used by the runtime. Availability recomputes this fingerprint and fails
  closed after any update or deletion. The fingerprint is also part of the
  server session manifest, so reapproval under the same `reviewed_at` still
  invalidates an older in-progress sitting.
- Every signed-in sitting has a server-generated id and high-entropy nonce whose
  hash is stored in Personal D1 with the authenticated user, exact paper/source,
  approved-review fingerprint and server start timestamp. Migration `0008`
  enforces immutable identity/submission fields and one-way
  `in_progress -> submitted -> grading -> complete` transitions.
- Browser storage version 4 is an account-and-paper-specific resumable UX copy,
  not an evidence authority. Full answer snapshots autosave to the server with
  monotonically increasing revisions. Older out-of-order saves cannot replace
  a newer revision; conflicting same-revision writes fail closed. Manual submit
  flushes the newest revision first, while visibility/page-hide hooks perform a
  best-effort immediate flush before browser suspension.
- A stale or expired server authorization never deletes that browser snapshot.
  Reload restores it in a visibly read-only state with saved answers and any
  completed results; editing, submission and grading remain blocked until the
  learner explicitly confirms `Start again`, which is the only destructive path.
- The approved deadline is derived from the server start. At time-up, editing
  locks and submission begins without a blank-answer prompt. A tab reopened
  after the deadline is safely auto-locked to its last server-accepted draft at
  the exact deadline, so neither background throttling nor a lost response
  creates client-authorized overtime.
- Ordinary question/source text selection is disabled in the test-taking
  container. Copy, cut, paste and drop are prevented. Answer controls retain
  text selection for normal editing, but the container still prevents copying,
  cutting or externally inserting text. `beforeinput` also blocks
  `insertFromPaste` and `insertFromDrop` as a fallback where clipboard/drop
  event delivery differs.
- Graded paper attempts use stable session-and-question attempt IDs. Every
  positive-mark, fully gradeable part must persist before its question group
  can complete; a blank part is persisted as independent `0/max` evidence.
  Explicit zero-mark instruction rows are the only allowed skips. Paper sitting
  approval, current required-asset delivery, exact answer/result inventory and
  the server authorization are rechecked before any independent write.
- Model output is staged on the sitting before personal attempt/evidence writes.
  The live approval and exact content fingerprint are reloaded after model work
  and again immediately before independent persistence; withdrawal or content
  drift releases the claim without writing learner evidence.
  A timeout or partial persistence retry reuses that exact staged response and
  never calls the model again. Completed-group replay returns the stored response.
  Canonical idempotency fences compare answer, result, marks, chain steps,
  feedback, model/version, assistance, evidence independence, duration and
  metadata before any gap or learner-state mutation. A group advances only
  after every expected evidence-bearing row is confirmed saved.

## Timing correction

The first recovered runtime sent the complete paper elapsed time with every
question group. That made a two-hour sitting look like two hours spent on each
question.

Storage version 4 keeps a local active answer part for responsive UX, while the
Personal D1 sitting row is authoritative for timing. The server starts the
first part, closes/switches active intervals when it accepts revisioned draft
events, caps the final interval at the approved deadline and freezes all
durations when it locks submission. Client requests cannot submit a start time,
submission time or duration map.

Each grading claim receives its exact `part ref -> duration` map only from the
server sitting row, and the personal-evidence writer records the matching
server-derived duration for each saved answer. This is active-question time,
not eye tracking: passive reading remains assigned to the current server-known
part until the next accepted activation revision.

## Responsive/theme structure

The sitting shell follows the stable full-height flex pattern and uses shared
semantic light/dark tokens. The paper remains paper-like and content-first.
The narrow-screen paper sheet now uses its available container width rather
than subtracting four rem from an already padded mobile viewport.

## Automated evidence

```text
corepack pnpm exec vitest run \
  src/lib/experiments/questions/paperSitting.test.ts \
  src/lib/server/paperSittingContentFingerprint.test.ts \
  src/lib/server/paperSittingReadiness.test.ts \
  src/lib/server/paperSittingReviewImport.test.ts \
  src/lib/server/paperSittingSession.test.ts \
  src/lib/server/paperSittingSessionMigration.test.ts \
  src/lib/server/paperSittingAttemptPersistence.test.ts \
  src/lib/server/personalLearningAttemptIdempotency.test.ts \
  src/lib/server/subjectLearning.test.ts \
  src/routes/api/experiments/questions/[paperSlug]/sitting/sitting.test.ts \
  src/routes/api/experiments/questions/[paperSlug]/[ref]/grade/grade.test.ts \
  src/lib/learning/answerAssistance.test.ts

12 files passed; 131 tests passed.

corepack pnpm run check

svelte-check found 0 errors and 0 warnings.
```

## Browser-only acceptance still required

Run these checks against an actually approved full paper, not a renderer
preview:

1. At mobile (at least 375x812), iPad (768x1024) and laptop (1440x900), inspect
   start, in-progress, grading and completed states in light and dark themes for
   clipping, horizontal overflow, sticky-status overlap and legible long
   questions/response controls.
2. Start a sitting, enter several written and fixed responses, reload, close and
   reopen the tab before and after the deadline, and confirm the server draft
   resumes while the overall clock continues and then freezes at the approved
   deadline.
3. Move between parts by touch/pointer, keyboard focus and the question
   navigator. Inspect `user_paper_sitting_sessions` before/after submission and
   Personal D1 evidence afterward to confirm increasing draft revisions,
   server-derived per-part durations, stable attempt IDs and no whole-paper
   duration repeated for every answer.
4. Try keyboard shortcuts, context menus, drag/drop and touch selection. Confirm
   source text cannot be selected/copied, answer paste/drop is blocked, and
   ordinary typed-answer caret/editing remains usable.
5. Exercise the blank-answer confirmation, 5,000-character limit, interrupted
   grading/retry, reload during partial grading and completed-result restore.
6. Confirm an incomplete, stale, unsupported or unapproved paper remains a
   read-only preview and cannot create independent paper-sitting evidence by
   posting directly to the grading endpoint.
