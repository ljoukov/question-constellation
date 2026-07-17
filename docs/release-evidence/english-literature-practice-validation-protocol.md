# English Literature post-import practice protocol

Snapshot date: 2026-07-16

This is the deterministic preparation and evidence contract for the real-browser OCR J352
teaching validation required by `AGENTS.md`. It does not claim that learner grading or the browser
replays have run. The preparation command performs read-only `QUESTION_DB` `SELECT` queries and
optional HTTP `GET` route probes only; it neither invokes a model nor writes D1.

## Selection gate

The selector is `scripts/prepare-english-literature-practice-validation.mjs`. Its reusable contract
and completed-evidence validator live in
`src/lib/englishLiteraturePracticeValidationPlan.ts`.

It selects two real questions from each required task shape, giving ten questions in total:

- poetry comparison;
- two-extract comparison;
- extract plus wider text;
- whole-text judgement;
- single-text analysis.

A question is selectable only when all of these agree:

- the question is published and review-clean;
- a reviewed rendering overlay exists;
- the runtime English source-eligibility gate passes;
- a source-dependent row has canonical `self_containment_json.status = "source_complete"`;
- `requiredSourceCount`, exact required labels, visible stable asset ids and public paths describe
  every complete printed source;
- every source asset is required, review-clean and referenced by the learner-visible overlay;
- positive raw mark-scheme rows have real source-document ids and source references, rather than
  `guided-rubric`, generated or placeholder provenance;
- the reviewed checklist links to those raw rows;
- a useful reviewed model answer is linked to raw mark evidence;
- a clean reviewed or published primary chain has steps; and
- when `--base-url` is supplied, `/questions/<id>/practice` redirects to the real `task` stage and
  that stage returns HTTP 200.

The selector maximises source-paper, paper-label and topic diversity within each task shape. It
never fills a missing shape with a different kind of question.

## Prepared execution matrix

Every ready plan contains these empty evidence slots for the later browser run:

- six realistic inputs: blank, irrelevant, plausible-but-vague, partially successful,
  feedback-driven retry and secure;
- four wording variants for a representative question from every task shape (20 replay rows);
- every stage's observed title, goal, criteria, hints and fit to the exact question;
- independent evidence for every configured success criterion;
- exact learner input, decision, feedback, cited learner wording, unlock state and next action;
- later-stage lock, passed-stage review, downstream invalidation, reset and direct-route checks for
  every selected question; and
- all ten questions at 390x844 and 1440x900, in light and dark themes (40 layout rows), including
  source readability, clipping, overflow, height stability and feedback readability.

The blank profile is a client-gate check, not a grading scenario. Its exact input is the empty
string, the Check control must remain disabled, and no `grade-step` request or model result may be
observed. The other five profiles are real learner-model checks.

The four replay variants may differ at the margin, but their recorded missing skill, pass threshold
and next action must remain the same. The completion validator fails inconsistent replay groups,
unfilled criteria, missing source grounding, failed navigation checks, incomplete layouts or a
non-passing release decision.

## Gated real-Chrome workflow after the replacement imports

Do not run the model-backed teaching matrix until the OCR replacement imports pass and the root task
explicitly releases it.

First restart the local Vite server and create a fresh, ready selection from the final imported
database. The plan SHA-256 printed later binds every model call to this exact selection and prevents
running against a stale import.

```sh
scripts/dev-server.sh restart 5173

node scripts/prepare-english-literature-practice-validation.mjs \
  --d1 \
  --base-url=http://127.0.0.1:5173 \
  --output=docs/release-evidence/english-literature-practice-validation-selection.json \
  --snapshot-output=tmp/english-literature-practice-validation/candidates.json \
  --require-ready
```

Create the reviewed-input template from the exact SvelteKit `__data.json` contracts. This makes no
model calls and does not launch Chrome:

```sh
node scripts/validate-english-literature-practice-browser.mjs \
  --prepare-input-template \
  --plan=docs/release-evidence/english-literature-practice-validation-selection.json
```

The command prints the final plan fingerprint, exact planned model-call count and dynamic
confirmation token. A human reviewer must then fill
`docs/release-evidence/english-literature-practice-browser/reviewed-inputs.json` with
question-specific inputs. Every quotation must be checked exactly against its named source, and an
examiner claim may be used only when the selected question carries exact examiner-report
provenance. Do not silently correct or invent a quotation. Inputs without quotations or examiner
claims must attest that explicitly.

Run the non-model browser evidence first:

```sh
node scripts/validate-english-literature-practice-browser.mjs \
  --read-only-browser \
  --plan=docs/release-evidence/english-literature-practice-validation-selection.json \
  --inputs=docs/release-evidence/english-literature-practice-browser/reviewed-inputs.json \
  --fail-on-issues
```

This launches real headless Chrome, compares all rendered stage titles, goals, criteria and hints
with the exact runtime contract, checks direct-route/navigation/reset behavior, and records 40 full
mobile/desktop light/dark screenshots. Analytics and draft writes are intercepted. Synthetic
session results are labelled `synthetic-ui-fixture` and prove UI behavior only; they can never count
as learner grading, source, quotation or examiner evidence.

Only after the root task explicitly releases grading, set the fixed disposable local identity and
restart the Vite server:

```sh
DEV_AUTH_USER_ID=ux-cleanup-test-user
DEV_AUTH_EMAIL=ux-cleanup-test-user@example.test
DEV_AUTH_NAME="English Literature Validation"
```

Put those values in `.env.local`, then run `scripts/dev-server.sh restart 5173` so the server-side
identity matches the cleanup gate.

Run the model matrix using the exact token and plan fingerprint printed by the template command:

```sh
node scripts/validate-english-literature-practice-browser.mjs \
  --execute-model-validation \
  --plan=docs/release-evidence/english-literature-practice-validation-selection.json \
  --inputs=docs/release-evidence/english-literature-practice-browser/reviewed-inputs.json \
  --confirm=execute-<exact-count>-english-literature-model-calls \
  --confirm-plan-sha256=<exact-plan-sha256> \
  --fail-on-issues
```

The executor refuses non-loopback origins, the wrong dev-auth uid, incomplete reviews, stale plan
hashes, and wrong call counts. It deletes and verifies all personal and analytics rows for the fixed
uid before and after execution. It writes `report.json` atomically after each case. If a run is
interrupted, repeat the identical command with `--resume`; the runner validates each stored
exact-input checkpoint and skips it. It fails closed instead of trusting or repeating a changed
checkpoint.

Inspect every raw learner-model row and fill only the manual-review fields under
`report.plan.execution`: cited learner wording for each criterion, the one missing analytical move,
goalpost consistency, retry acknowledgement, replay consistency, independent criterion decisions,
and the final release decision. Never edit the retained exact input or raw returned grading result.
Then validate the completed evidence:

```sh
node scripts/prepare-english-literature-practice-validation.mjs \
  --validate-completed=docs/release-evidence/english-literature-practice-browser/report.json \
  --output=docs/release-evidence/english-literature-practice-validation-completion-check.json
```

The completed browser run must also retain exact raw mark rows and source refs used for each grading
decision. Examiner-report guidance may be recorded only when it exists for that exact question; an
empty source means no examiner commentary may appear in the grading prompt or evidence.

## Last recorded deterministic blocker

The last read-only preflight, before the replacement imports, found 255 OCR English Literature
candidates and selected zero under the stricter post-import contract:

| Task shape              | Candidates | Eligible now | Required |
| ----------------------- | ---------: | -----------: | -------: |
| Poetry comparison       |         21 |            0 |        2 |
| Two-extract comparison  |         35 |            0 |        2 |
| Extract plus wider text |         68 |            0 |        2 |
| Whole-text judgement    |         60 |            0 |        2 |
| Single-text analysis    |         71 |            0 |        2 |

The dominant defects are 255 missing reviewed overlays, 192 missing useful source-grounded model
answers, 143 source-dependent rows without canonical `source_complete` status and explicit source
counts, 45 checklists not linked to accepted raw rows, and 25 rows without acceptable raw positive
mark evidence. This is expected legacy evidence, not a regression introduced by the validator.

The OCR J352 replacement retry has not run yet. The old source-identity attempt failed on a visible
`4872/X` mismatch, but that is no longer the active blocker: the reviewed exact-SHA fallback is now
implemented, all eight OCR question-paper/mark-scheme hashes match, and the 14/14 extraction golden
suite passes. The remaining gate is to run and accept the replacement imports themselves.

## Runtime source-status alignment after replacement acceptance

The runtime source gate is deliberately still status-agnostic while the legacy guided seed is the
only Romeo and Juliet fallback. A read-only production audit found exactly four source-dependent
rows that the current runtime can launch:

- `english-lit-romeo-juliet-fate-guided`;
- `ocr-j352-02-jun23-01-1a`;
- `ocr-j352-02-jun23-02-1a`; and
- `ocr-j352-02-jun23-03-1a`.

After J352/02 official Question 4 is accepted, apply the release in this order: migration 0024
removes the guided seed, guarded migration 0025 canonicalizes only the three visually audited June
2023 poetry rows, and then runtime eligibility starts requiring
`self_containment_json.status = "source_complete"` for every source-dependent Literature task.
Runtime regression tests must prove that a missing or wrong status is blocked, those three
canonical poetry rows remain launchable, accepted Question 4 remains launchable, and
source-independent whole-text and single-text tasks are unaffected.

Migration 0025 alone does not make the three legacy poetry questions eligible for this validation
selector: they still need reviewed rendering overlays and substantive reviewed model answers whose
support maps to the imported raw mark rows. A successful new June 2024 import may instead supply
the two poetry-comparison selections.

The existing J352/01 baseline (23 questions / 680 alternative-route marks) and J352/02 baseline
(14 questions / 440 alternative-route marks) are flat option inventories and remain permanently
ineligible for complete timed-paper approval. Replacement imports must update the same source ids,
not duplicate them. In particular, J352/02 official Question 4 is the intended Romeo and Juliet
fate replacement: it needs the complete printed Prologue, raw scheme rows, reviewed model answer,
primary chain, reviewed overlay and working practice route before the legacy `guided-rubric` seed
can be retired.
