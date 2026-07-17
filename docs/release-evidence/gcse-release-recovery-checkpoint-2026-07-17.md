# GCSE release recovery checkpoint — 2026-07-17

## Outcome and deliberate stop

This is a safe implementation and data checkpoint, not a completed GCSE release. The final work
window was deliberately limited to the already-active OCR English Literature J352/01 paper, the
prompt/import boundary changes already made, the subject-content workflow documentation, the
database schema required by the new runtime, and publication of those changes to `origin/main`.
The two remaining OCR English Language papers and the prepared study-card queues were not started.

The final same-model J352/01 retry passed its source, repaired-extraction, learner-asset and
independent-judge reuse gates, then the provider returned a second capacity failure during fresh
answer-chain reconciliation. It stopped before chain attestation, solvability or import. No
post-repair D1/R2 write occurred. The failure was preserved, and the paper/card queue was stopped as
requested rather than substituting another model or starting another paper.

## Requirements recovered and independently audited

`docs/rollout-requirements-audit.md` recovers the requirements from the two source rollout JSONL
files and distinguishes binding requirements from later ideas. Its 43 requirements comprise P1–P12,
L1–L10, D1–D4, I1–I7, U1–U6 and Q1–Q4. The independent implementation matrix in
`docs/release-evidence/release-requirement-implementation-audit.md` records 25 PASS, 18 PARTIAL and
0 FAIL at this checkpoint. A PASS means the implementation requirement exists; it does not mean all
prepared content has been generated, imported, browser-validated or released.

Important recovered requirements include:

- English Literature plot-summary and lawful quotation flashcards, with character, theme and
  context cards as a clearly labelled extension (L6).
- Prospective MCQ generation may choose three or four choices: prefer four when three plausible
  misconceptions exist, but use three instead of inventing a weak distractor. Accepted and in-flight
  releases were not regenerated only for this change (L10).
- Historical papers are revisited selectively with the stronger model rather than blindly
  reimporting hundreds of papers (D4).
- Database changes may use a clean migration because there are no users requiring backward
  compatibility, followed by verified imports and publication (Q3).

## Implementation completed before this checkpoint

The local implementation bundle is rooted in commit `20ff4f8`. Its subject line says “Complete GCSE
content release”, but that description is not evidence that the release is complete; this report and
the requirement audit are authoritative about the unfinished data work.

Later focused commits are:

- `668f006` — renamed `docs/adding-a-subject.md` to
  `docs/subject-content-workflow.md`, expanded it to cover adding, fixing, updating and improving
  subject content, and linked it from `README.md` and `AGENTS.md`. The evergreen guide contains no
  status report for this work.
- `c5ae4b4` — made the independent extraction judge record and bind the exact source inputs used by
  the judge, with regression coverage.
- `de7f691` — bound the emitted import-ready paper to the exact audited output rather than merely
  trusting an earlier phase path, with regression coverage.

The broader implementation bundle includes the full-paper sitting runtime, evidence-strength and
assistance handling, working mark-rate display, official curriculum catalog/mappings, explicit
flashcard/MCQ/true-false/short-written paths, Literature card discovery, three-or-four-choice card
contracts, content-addressed card lineage, selective paper locks, fail-closed paper approval,
illustration freshness invalidation, browser-validation harnesses, and migrations 0021–0028 plus
Personal migrations 0007–0008. Exact requirement-to-code mapping is in the implementation audit.

## Reviewed J352/01 extraction repair

The official paper contains 24 questions worth 720 marks. OCR withholds the A Christmas Carol
extract required by question `17.1` for third-party copyright, so that exact 40-mark question is the
only holdout. The publishable candidate is therefore exactly 23 questions / 680 marks.

The complete failed solvability report identified one factual defect in question `13.1`: the model
answer attributed Jekyll's action of shutting his mouth tight and nodding to the wrong Utterson
question. `scripts/repair-ocr-j352-01-solvability-finding.mjs` makes one deterministic change only,
at `questions[18].modelAnswer.answerText`, and anchors it to the official printed extract. The
reviewed evidence is
`docs/release-evidence/ocr-j352-01-reviewed-solvability-repair.json`.

Repair invariants and hashes:

- full repaired 24-question artifact SHA-256:
  `5d145c281ea8dd8b3d4755c6570b66eb2561e289ec3dddbc907a061c6c0511b4`
- full repaired canonical JSON SHA-256:
  `c32bdf294352542f5d7c44124dd3cd2057096654e3885f603c19e68c7c398ca5`
- exact 23-question pipeline input SHA-256:
  `22cbf81851b52cd8c247196bce389b44516ac15e8b37330ff07b78fe8cc61c67`
- exact pipeline-input canonical JSON SHA-256:
  `a4b2338c5a47c116e3286941c03922f1cb97ce9f8ddfb1710f754fa0c5a73343`
- deterministic validation passes all 23 publishable questions / 680 marks; validating the full
  inventory fails only for the exact `17.1` copyright holdout.
- a fresh independent post-repair extraction judge scored 1.00, checked all 24 inventory refs
  including the holdout, and required zero further repairs. Its model thread is
  `019f6f3c-4a3b-7b23-b7ee-7055e33edae1`.

The repaired resume command is recorded in
`docs/release-evidence/current-model-paper-resume-after-usage-reset.md`.

## Infrastructure failures preserved honestly

These are not content passes:

- The 2026-07-17 08:51–10:54 UTC chain attempt produced and deterministically validated a
  23-question chain artifact, but the transport timed out while returning the final response. The
  wrapper correctly recorded `The operation was aborted` and did not attest the phase. Evidence is
  preserved locally under
  `tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-01-qp-jun24/failed-chain-transport-20260717T105437Z/`.
- A later chain attempt was interrupted by the VM restart and produced no attested output. It is
  preserved under
  `tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-01-qp-jun24/interrupted-chain-vm-restart-20260717/`.
- The 2026-07-17 16:13–16:17 UTC retry ended with `Selected model is at capacity. Please try a
different model.` It produced no chain verdict or import and is preserved under
  `tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-01-qp-jun24/failed-chain-capacity-20260717T161714Z/`.

No weaker or different model was substituted for the required `gpt-5.6-sol` / maximum-thinking
gate.

## Final J352/01 result at this checkpoint

The last retry ran from 2026-07-17 16:24:21 to 16:29:45 UTC in model thread
`019f70e4-ab87-71f3-947f-9dab4c20dd4b`, using `gpt-5.6-sol` with maximum thinking. It passed the
verified source snapshot, visible source identity and 18-asset learner bundle gates, and it reused
only the exact hash-bound repaired extraction and the passed independent extraction judge.

Fresh chain reconciliation then ended with the provider event `Selected model is at capacity.
Please try a different model.` The chain summary and outer production summary correctly remain
`failed`; there is no chain attestation, no post-repair solvability report, no write import and no
post-import content fingerprint. The terminal attempt is preserved locally under
`tmp/current-model-paper-cohort/reviewed-repairs/ocr-j352-01-qp-jun24/failed-chain-capacity-20260717T162945Z/`.
Its hashes are:

- chain summary: `940bd328a03cea93fe07f0cfb820213b6fa8de09437730cb5031f9f48df9af32`
- production summary: `94bca3c620506817998ecacce4abdf02b3d9f5a5c53efbce27ef68380c2fab30`
- event stream: `8e3d20e1fd65f97150c78ce0c68bfafaee17fd684f9dcf9c7d250b12756cfa02`

J352/01 therefore remains incomplete at this checkpoint despite its repaired extraction and passed
independent extraction judge. The retained scope is still exactly 23 questions / 680 marks. The
remote database still contains the older 23-row / 680-mark legacy import, but it has zero question
assets, zero rendering overlays and 23 missing ready overlays. Its fingerprint is
`paper-sitting-content-v1:3e53bc46bbc95ef081237859ff3169adcd5f66465877638f85b773ba7187a299`.
Those rows are not evidence for this current-model rollout and remain unapproved.

## Paper cohort accounting

`data/release/selective-paper-cohort-lock.json` locks the exact 20-paper selective cohort. Before
the final J352/01 attempt, 17 of 20 papers had terminal outcomes. The active paper was J352/01; the
other two incomplete papers were:

- `ocr-j351-01-qp-jun24`: 5 retained questions / 84 marks.
- `ocr-j351-02-qp-jun24`: 2 retained questions / 80 marks.

Their exact source/copyright disposition and safe resume commands are in
`docs/release-evidence/current-model-paper-resume-after-usage-reset.md`. No further historical-paper
rerun was launched at this checkpoint.

## Study-card accounting

The prepared card work must not be confused with imported production coverage:

- `data/study-cards/final-release-baseline.json` locks the accepted baseline at 24 releases / 488
  cards.
- `docs/release-evidence/study-card-coverage-ledger.json` records 789 eligible official descendant
  targets: 351 covered and 438 uncovered when the completion queue was frozen.
- `docs/release-evidence/study-card-prepared-completion/prepared-run-lock.json` locks 26 remaining
  standard physical batches / 438 cards. These comprise 24 generation batches plus two archived
  review-only batches and 25 atomic execution units.
- The same lock contains 13 English Literature deepening shards / 171 cards for plot, quotations
  and the labelled character/theme/context extension.
- The orchestrator evidence is a dry run only. None of the 438 + 171 prepared future cards was
  generated or imported during this checkpoint.

If all prepared work is later accepted unchanged, the planned total is 63 releases / 1,097 cards
with 43 lineage manifests: 24 + 26 + 13 releases and 488 + 438 + 171 cards.

## Database transition

Before mutation, the remote Question D1 database was exported to the ignored local file
`tmp/question-db-before-0024-0028.sql`. The backup is 32,530,021 bytes with SHA-256
`4238eb7ee19992464a69a67d41a94652ac0914e72a198039116eb293906de0b8`.

The migration ledgers were re-read immediately before applying anything. Question D1 had exactly
0024–0028 pending; Personal D1 had no pending migration. Wrangler then applied exactly:

1. `0024_remove_superseded_english_guided_seed.sql`
2. `0025_canonicalize_reviewed_english_source_metadata.sql`
3. `0026_withdraw_unsupported_paper_sittings.sql`
4. `0027_invalidate_stale_chain_illustrations.sql`
5. `0028_paper_sitting_content_fingerprint.sql`

The post-migration ledger reports no pending Question migration. Remote readback confirms:

- one `approved_content_fingerprint` column;
- 12 paper-sitting reviews, all `withdrawn`, with zero approved;
- zero remaining legacy guided-seed questions, sources, chains, constellations, imports or route
  payload references;
- three canonicalized 2023 poetry questions and six reviewed required source assets;
- zero published chain illustrations;
- 21 illustration-freshness triggers; and
- no rows from `PRAGMA foreign_key_check`.

The full-release operator runbook originally sequenced migrations after all 20 paper imports. This
checkpoint applies the schema earlier because the pushed runtime reads
`approved_content_fingerprint` and therefore requires migration 0028. The transition is schema-safe,
but the two remaining papers will be post-migration writes; their mappings, illustrations and
approvals must later be rebuilt or refreshed under the new fingerprint rules.

## Verification and publication

The final merged implementation passed:

- extraction-pipeline golden suite: 14 / 14;
- study-card pipeline: 16 files / 101 tests;
- full Vitest suite: 130 files / 842 tests;
- focused import-output binding regression after the final annotation: 1 file / 2 tests;
- `svelte-check`: 0 errors / 0 warnings; and
- Cloudflare production build through the SvelteKit adapter.

The first post-merge check exposed three implicit-`any` diagnostics on the new import-ready helper's
destructured options. Commit `52846b1` adds the minimal JSDoc contract; the focused test, full check
and production build then passed. Upstream `origin/main` at `cbc69f9` was merged without conflict in
commit `8507248` before the final gates.

After all gates, the merged checkpoint history—including the workflow, prompt/import hardening,
reviewed repair, annotation fix and this report—was pushed directly from `HEAD` to `origin/main`.
A post-push remote readback confirmed that `origin/main` matched the local published commit. Per the
repository's deployment policy, no manual `wrangler deploy` was run; the `main` push is the trigger
for Cloudflare's automatic deployment.

## Work deliberately left

- Finish the two OCR English Language papers above with the exact current-model extraction judge,
  chain, solvability and write-import gates.
- Correct the stale J352/02 assertion in `scripts/verify-final-release-data.mjs`: accepted data uses
  `04.1` / `ocr-j352-02-jun24-04-1`, while the verifier still expects `04.0`.
- Complete and accept the 26 standard card batches / 438 cards, then the 13 Literature shards / 171
  cards; import the curriculum, mappings and accepted card manifests.
- Rebuild fresh answer-chain illustrations after migration 0027 invalidates the prior published
  set, then approve exact complete paper sittings under the fingerprint policy.
- Run the English Literature teaching matrix: at least 10 question shapes, five realistic learner
  inputs and four wording replays, grounded in raw mark-scheme rows.
- Complete phone, iPad and laptop browser review in light and dark, the full-paper D1 checks,
  keyboard/touch anti-copy checks, final data verifier, production deployment confirmation and
  production smoke tests.
- Do not send email, restore the removed generic-thinking UI, start a broad historical-paper rerun,
  or treat prepared/dry-run artifacts as published content.

## Evidence index

| Evidence                                                                      | Purpose                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| `docs/rollout-requirements-audit.md`                                          | Recovered requirements and transcript anchors          |
| `docs/release-evidence/release-requirement-implementation-audit.md`           | Independent 43-requirement implementation matrix       |
| `docs/subject-content-workflow.md`                                            | Evergreen add/fix/update/improve workflow              |
| `docs/release-evidence/ocr-j352-01-reviewed-solvability-repair.json`          | One-field reviewed J352/01 repair and immutable hashes |
| `docs/release-evidence/current-model-paper-resume-after-usage-reset.md`       | Exact remaining-paper matrix and safe commands         |
| `data/release/selective-paper-cohort-lock.json`                               | Exact 20-paper source lock                             |
| `data/study-cards/final-release-baseline.json`                                | Immutable accepted 24-release / 488-card baseline      |
| `docs/release-evidence/study-card-coverage-ledger.json`                       | Covered and uncovered official card targets            |
| `docs/release-evidence/study-card-prepared-completion/prepared-run-lock.json` | Hash-locked future standard and Literature queues      |
| `docs/release-evidence/final-release-operator-runbook.md`                     | Remaining final-release sequencing and checks          |
