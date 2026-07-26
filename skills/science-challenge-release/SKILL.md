---
name: science-challenge-release
description: Authenticate, enrich, illustrate, audit, materialize, and publish the fixed science-179-v1 GCSE challenge release.
---

# Science challenge release

Use this skill for the fixed `science-179-v1` release and for later releases that deliberately reuse
its authenticated-subset pattern. This is not the legacy `science-500-v1` workflow.

Run commands from a repository root. The art-cohort builder is the one exception that may run from
the historical evidence repository because its current CLI resolves all inputs against its working
directory. Durable paths must be repo-relative. Use portable placeholders for external checkouts and
never persist their resolved paths. Do not put operator identity, credentials, environment values,
model conversation identifiers, or local diagnostic paths in prompts, evidence, release files,
commits, or handoffs.

## Read first

Read these files completely before changing the cohort or release tooling:

- `AGENTS.md`
- `docs/subject-content-workflow.md`
- `docs/product-methodology.md`
- `docs/product-flows.md`
- `docs/extraction-spec.md`
- `docs/challenges/README.md`
- `docs/challenges/authoring.md`
- `docs/challenges/generated-science-verification.md`
- `docs/challenges/science-question-art-r2.md`
- `docs/challenges/session-pacing-and-memory-beats.md`

The learner flow stays question -> answer chain -> constellation -> practice. The release is a
curated public question bank, not a runtime-model feature.

## Fixed release contract

`science-179-v1` has one closed interpretation:

| Layer                   | Required result                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Source content          | Authenticate all 408 historical drafts and all 408 independent reviews                                                                 |
| Publication selection   | Publish exactly 179 accepted rows in source-plan order                                                                                 |
| Holdout                 | Preserve exactly 229 rejected rows and their issues; do not repair them for this release                                               |
| Accepted subjects       | Biology 34, Chemistry 71, Physics 74                                                                                                   |
| Existing catalogue      | Preserve 92 authored challenges                                                                                                        |
| Final catalogue         | 92 authored + 179 accepted = 271 unique challenge definitions                                                                          |
| Short recall            | 179 generated prompts; 23 ordered batches of at most 8                                                                                 |
| New art cohort          | 179 accepted owners + 60 existing replacement owners = 239 pairs                                                                       |
| Generated art files     | 239 dark masters + 239 geometry-matched light edits; 478 normalized delivery WebPs                                                     |
| Authored-static art     | Keep 32 authored primary owners; semantically review every current pair and freshly replace only major failures at new versioned paths |
| Final primary ownership | Exactly 271 unique challenge owners and 271 unique primary pairs                                                                       |

Do not call the 229 holdouts “pending fixes”. Their disposition is final for `science-179-v1`. A
later attempt to publish any of them requires a new release id, new candidate bytes, and a fresh
independent review.

### Storage authorities

- Git is authoritative for accepted definitions, runtime identities, curriculum projection, visual
  mapping, sanitized provenance, short-recall evidence, and the accepted release marker.
- `QUESTION_DB` is the exact remote mirror for short-recall rows. The write target is the combined
  92 authored plus 179 generated prompts, or 271 rows.
- R2 stores the 478 new content-addressed WebP bytes. The runtime contains only their public routes.
- The 32 authored-static owners remain Git-backed. Their current bytes must pass the same
  question-authoritative semantic review; major failures move to new versioned static sources, while
  minor imperfections remain with annotations.

Never move definitions into D1, never check generated art bytes into the release tree, and never
treat a D1 or R2 object as authority for changed Git content.

## Canonical prompt and review contracts

Do not duplicate or paraphrase these prompts in an operator note. The builders are part of the
provenance replay and are the canonical text.

### Challenge authoring

The historical candidates were authored with prompt version `science-challenge-authoring-v3`.
Canonical sources:

- `scripts/lib/science-challenge-authoring-prompts.mjs`
  - `buildScienceChallengeAuthoringPrompt`
  - `buildScienceChallengeVerificationRepairPrompt`
  - `buildScienceChallengeRepairPrompt`
  - `buildScienceChallengeMultipartInitialPartPrompt`
  - `buildScienceChallengeMultipartAttemptParts`
  - `reconstructScienceChallengeAuthoringAttemptPrompt`
- `scripts/lib/science-challenge-direct-prompt-json-runner.mjs`
  - `buildScienceChallengePromptJsonProviderPrompt`
  - `runDirectScienceChallengePromptJsonTurn`
- `scripts/lib/science-challenge-release.mjs`
  - `SCIENCE_CHALLENGE_PROMPT_VERSION`
  - `challengeBatchOutputSchema`
  - `validateGeneratedChallenge`
  - `validateGeneratedChallengeCollection`
- `scripts/lib/science-challenge-batch-validation.mjs`
  - `validateScienceChallengeGeneratedBatch`

The contract uses the official specification as scope authority and paper/mark-scheme/answer-chain
material only as calibration evidence. It requires two new, self-contained and materially distinct
contexts; correct science, units and distractors; a fair compare/diagnose/repair/transfer loop;
British learner copy; no unseen visual dependency; and answer-neutral illustration briefs.

Prompt JSON is tool-free, strictly parsed, locally schema-validated, and has no transport fallback.
The exact builders, input projections, schemas, candidate bytes, and model run evidence must replay.

This release does not run that author again. It authenticates the already reviewed 408-row source and
projects its accepted rows.

### Independent content verification

The source review remains a 408-row gate: 51 assignments of 8, split 17 each across exactly three
fresh empty-context reviewers using `gpt-5.6-sol` at maximum reasoning. The canonical review contract
is composed from:

- `docs/challenges/generated-science-verification.md` for the rubric and output shape;
- `buildScienceChallengeVerifierPacketBundle` and its generated wave message in
  `scripts/lib/science-challenge-verifier-packets.mjs`;
- `SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS` and `validateIndependentContentReviewRow` in
  `scripts/lib/science-challenge-release.mjs`; and
- the dispatch, evidence, and aggregate checks in
  `scripts/aggregate-science-challenge-verification.mjs`.

Each candidate must independently pass all eleven gates:

1. exact curriculum grounding;
2. paper and mark-scheme calibration without copying;
3. scientific and numerical correctness;
4. distinct opening, transfer, and same-component cohort contribution;
5. self-contained tasks;
6. fair compare, diagnose, repair, and transfer flow;
7. defensible choices and misconception-based distractors;
8. calibrated difficulty and marks;
9. clean learner-facing copy;
10. safe, answer-neutral illustration briefs; and
11. a safe misconception-led hero teaser.

`accepted` must equal the conjunction of all eleven booleans with an empty issue list. A rejection
must identify the exact field, visible evidence, category, and minimal repair. The reviewer diagnoses;
it does not author or repair.

For `science-179-v1`, the failed 408-row aggregate is valid source evidence because the projection
authenticates every row and selects only the 179 individually accepted reviews. Do not change the
historical aggregate to claim a 408/408 pass.

### Short-recall author and reviewer

Canonical builders and gates are in `scripts/lib/science-challenge-short-recall.mjs`:

- `buildScienceChallengeShortRecallAuthoringPrompt`;
- `buildScienceChallengeShortRecallReviewPrompt`;
- `scienceChallengeShortRecallAuthoringOutputSchema`;
- `scienceChallengeShortRecallReviewOutputSchema`;
- `SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES`;
- prompt, collection, repair-evidence, and final accepted-artifact validators.

Execution and replay live in `scripts/lib/science-challenge-short-recall-pipeline.mjs`. The operator
CLI uses the subscription alias `chatgpt-gpt-5.6-sol`, whose model is `gpt-5.6-sol`. Author with
`high` thinking; review independently with `max` thinking. Both runs are tool-free prompt JSON.

The reviewer sets these eleven gates independently:

1. `questionSpecific`
2. `scientificallyCorrect`
3. `blankContract`
4. `answerContract`
5. `aliasesComplete`
6. `hiddenStepAppropriate`
7. `unambiguous`
8. `nonGeneric`
9. `noDuplicate`
10. `noLeak`
11. `d1Safe`

A prompt needs exactly one literal `___`, one unambiguous one- or two-word canonical answer, all
ordinary aliases, a valid hidden-step binding, question-specific wording, no answer leakage, no
cross-catalog duplicate, and valid D1 limits.

### Art generation and independent review

The only release art generator is `scripts/generate-science-question-art.mjs`. It imports
`generateImages` from `@ljoukov/llm` and fixes the image model to `chatgpt-gpt-image-2`.

- `buildDarkPrompt` is the canonical dark-generation prompt.
- `buildLightPrompt` is the canonical geometry-preserving light-edit prompt.
- `baseStylePrompt` is the canonical theme style contract.

For each owner, the wrapper generates one new 2048x1152 dark master, edits that master into the light
sibling, then normalizes both to opaque 960x540 WebP. The immutable job retains its master evidence;
the delivery inventory contains the 478 normalized WebPs. Dark art must be scientifically accurate,
question-specific, text-free, mobile-safe, and answer-neutral. The light edit must preserve canvas,
crop, geometry, objects, counts, states, directions, connections, and meaning; only palette,
lighting, contrast, shadows, highlights, and glow may change.

The learner-facing question outranks every art brief. Before generation and during review, compare
every exact variable, allele and case, genotype, formula, unit, count, direction, sample/object
label, material and apparatus state. A brief that conflicts with current learner copy is a major
failure even when an image follows it perfectly. In particular, conventional substitution is not
allowed: an `Aa × Aa` diagram is wrong for an `Rr × Rr` question.

The independent art prompt and closed v2 output schema are `reviewPrompt` and `reviewOutputSchema`
in `scripts/review-science-question-art.mjs`. It uses `gpt-5.6-sol` with maximum reasoning and
judges ten gates:

1. scientific accuracy;
2. exact relevance;
3. brief consistency with the learner question;
4. exact visible-notation agreement;
5. no answer leakage;
6. no unwanted text;
7. dark/light theme fidelity;
8. visual quality;
9. mobile safety; and
10. accurate, non-leaking alt text.

Acceptance requires all ten booleans, no major issue, and a score of at least 18/20. A harmless
minor issue uses `retain-with-annotation` and must not trigger generation. A semantic, answer,
notation, task-identity, material, direction, count, label, unit, state, meaning or usability defect
uses `fresh-regenerate`. Never edit or inpaint a failed pair and never provide it as a generation
reference: create a brand-new dark composition, then derive a new light sibling only from that new
dark master. Model generation and review disclose unpublished question/brief/image bytes to their
configured services, so obtain explicit authorization when that disclosure is not already in scope.

## Working paths

Set these repo-relative paths once:

```sh
RELEASE_ID="science-179-v1"
WORK_ROOT="tmp/science-challenges/$RELEASE_ID"
SUBSET_ROOT="$WORK_ROOT/accepted-subset-evidence"
ACCEPTED_SUBSET="$SUBSET_ROOT/accepted-subset.json"
ART_EVIDENCE_ROOT="<art-evidence-checkout>"
TOOLING_FROM_ART_EVIDENCE="<tooling-checkout-from-art-evidence-root>"
SOURCE_ART_MANIFEST="<source-art-manifest-relative-to-art-evidence-root>"
SOURCE_VERIFICATION_SUMMARY="<verification-summary-relative-to-art-evidence-root>"
ART_MANIFEST_RELATIVE="$WORK_ROOT/compiled/art-manifest.json"
ART_MANIFEST="$ART_EVIDENCE_ROOT/$ART_MANIFEST_RELATIVE"
ART_ROOT="$WORK_ROOT/art-generation"
ART_REVIEW_ROOT="$WORK_ROOT/art-review"
PERCEPTUAL_AUDIT="$ART_REVIEW_ROOT/perceptual-audit.json"
STATIC_REVIEW_RELEASE="science-179-v1-retained-static-final-v1"
STATIC_REVIEW_ROOT="tmp/science-challenges/$STATIC_REVIEW_RELEASE"
STATIC_REVIEW_MANIFEST="$STATIC_REVIEW_ROOT/art-manifest.json"
STATIC_REVIEW_SUMMARY="$STATIC_REVIEW_ROOT/art-review/review-summary.json"
CATALOG_ART_AUDIT="$WORK_ROOT/catalog-art-audit.json"
R2_READBACK_REPORT="$WORK_ROOT/r2-upload-readback.jsonl"
SHORT_AUTHOR_ROOT="$WORK_ROOT/short-recall/authoring-v1"
SHORT_REVIEW_ROOT="$WORK_ROOT/short-recall/review-v1"
RELEASE_ROOT="data/challenges/releases/$RELEASE_ID"
LOCAL_BASE_URL="http://127.0.0.1:5173"
PRODUCTION_BASE_URL="<production-origin>"
```

Every immutable output path must be absent on first publication. On resume, validate and reuse the
same bound root; do not delete or rename evidence to reset an attempt budget.

## 1. Authenticate and project the accepted subset

The source evidence may live in another checkout. Supply it through the portable placeholder
`<evidence-checkout>` and never copy its resolved location into output.

First run the authenticated replay without writes:

```sh
node scripts/build-science-challenge-accepted-subset.mjs \
  --evidence-root="<evidence-checkout>" \
  --review-rebase-manifest="<repo-relative-review-rebase-manifest>" \
  --verification-summary="<repo-relative-verification-summary>" \
  --output-root="$SUBSET_ROOT" \
  --dry-run
```

The dry-run must authenticate the historical rebase, source plan, 408 candidates, 408 reviews,
assignment evidence, reviewer provenance, source snapshot, curriculum evidence, and the exact 92
historical definitions. It must report 179 accepted and 229 rejected.

On a fresh run, remove only `--dry-run`. Publication writes the complete directory atomically:

- `accepted-subset.json`
- `evidence-projection.json`
- `collection-validation.json`
- `holdout-ledger.json`
- `hash-receipt.json`
- `manifest.json`

`evidence-projection.json` preserves all 408 drafts and all 408 semantic reviews but replaces
machine-bound reviewer identity with sequential aliases. `holdout-ledger.json` preserves all 229
rejections and their issues. `accepted-subset.json` contains only the 179 accepted candidates, in
source-plan order. All files bind raw or canonical hashes through the manifest and receipt.

Do not hand-edit the projection, reorder accepted ids, filter the holdout ledger, or repair a source
candidate.

## 2. Build the one-pair art cohort

The cohort builder authenticates the authoritative 1,000-spec source manifest and the 408-row review
summary, then selects only:

- the opening brief for each of the 179 accepted new challenges; and
- the opening brief for the 60 authored challenges whose primary art is being replaced.

The current builder has no `--evidence-root`. Run it from the art-evidence repository and reference
the tooling checkout with a portable relative placeholder. Do not copy or symlink evidence merely
to satisfy path resolution. Dry-run first:

```sh
(
  cd "$ART_EVIDENCE_ROOT"
  node "$TOOLING_FROM_ART_EVIDENCE/scripts/build-science-challenge-art-cohort.mjs" \
    --source-art-manifest="$SOURCE_ART_MANIFEST" \
    --verification-summary="$SOURCE_VERIFICATION_SUMMARY" \
    --output="$ART_MANIFEST_RELATIVE" \
    --dry-run
)
```

Require `pairPolicy: "one-pair-per-challenge"`, 179 accepted-new owners, 60 replacement owners, 239
specs, and 478 output files. Then rerun the same subshell without `--dry-run`.

Each challenge owns exactly one primary dark/light pair. Runtime deliberately maps the same owned
pair to both `cardArt` and `transferArt`; opening and transfer do not need separate decorative art.
An extra functional diagram is allowed only when the learner task genuinely depends on that exact
visual evidence. It must be a separately modelled, source-bound, reviewed task asset, not a second
primary pair. For this release, the catalogue audit must report no unresolved functional visual
dependency; a complete `questionPresentation.table` is the supported structured resolution for a
table-dependent opening task.

## 3. Author 179 short-recall prompts

Validate the complete 23-batch plan with no writes or model calls:

```sh
pnpm run generate:science-challenge-short-recall \
  --candidate-set="$ACCEPTED_SUBSET" \
  --output-root="$SHORT_AUTHOR_ROOT" \
  --model=chatgpt-gpt-5.6-sol \
  --thinking-level=high \
  --batch-size=8 \
  --concurrency=6 \
  --max-attempts=4 \
  --timeout-ms=7200000 \
  --dry-run
```

The plan must contain 22 batches of 8 and one final batch of 3, exactly 179 targets, zero writes, and
zero model calls. Remove only `--dry-run` to author.

For an interrupted run, repeat the identical command with `--resume`. Resume may reuse only a passed
attempt whose prompt, input, output, model, thinking level, and hashes replay. It never resets the
four-attempt ceiling.

Retain:

- `$SHORT_AUTHOR_ROOT/candidate-prompts.json`
- `$SHORT_AUTHOR_ROOT/authoring-evidence.json`
- the immutable batch attempt evidence

## 4. Independently review all 179 short-recall prompts

Inspect the full-review plan first:

```sh
pnpm run review:science-challenge-short-recall \
  --candidate-set="$ACCEPTED_SUBSET" \
  --prompt-bundle="$SHORT_AUTHOR_ROOT/candidate-prompts.json" \
  --authoring-evidence="$SHORT_AUTHOR_ROOT/authoring-evidence.json" \
  --output-root="$SHORT_REVIEW_ROOT" \
  --model=chatgpt-gpt-5.6-sol \
  --thinking-level=max \
  --batch-size=8 \
  --concurrency=6 \
  --max-attempts=4 \
  --timeout-ms=7200000 \
  --dry-run
```

Remove only `--dry-run` to review. The reviewer receives the complete global prompt index. The gate
passes only at 179 accepted, zero rejected, and zero issues; only then is
`short-recall-prompts.json` written.

If review rejects prompts, create fresh authoring and review roots. Repair only the rejected rows:

```sh
SHORT_REPAIR_AUTHOR_ROOT="$WORK_ROOT/short-recall/authoring-repair-02"
SHORT_REPAIR_REVIEW_ROOT="$WORK_ROOT/short-recall/review-02"

pnpm run generate:science-challenge-short-recall \
  --candidate-set="$ACCEPTED_SUBSET" \
  --output-root="$SHORT_REPAIR_AUTHOR_ROOT" \
  --prior-bundle="$SHORT_AUTHOR_ROOT/candidate-prompts.json" \
  --repair-review="$SHORT_REVIEW_ROOT/review-evidence.json" \
  --repair-authoring-evidence="$SHORT_AUTHOR_ROOT/authoring-evidence.json" \
  --model=chatgpt-gpt-5.6-sol \
  --thinking-level=high \
  --batch-size=8 \
  --concurrency=6 \
  --max-attempts=4 \
  --timeout-ms=7200000 \
  --dry-run
```

Inspect the exact repair target set, then remove only `--dry-run`. The merge must preserve every
accepted prompt byte-identically and replace each rejected prompt exactly once. Point
`SHORT_AUTHOR_ROOT` at the repair root and perform a new complete 179-row review in the fresh review
root. Never resume a review after prompt bytes change.

## 5. Generate 239 dark/light pairs

The art manifest and output root must belong to `science-179-v1`. Keep the configured free-space
reserve and confirm ImageMagick is available.

Run the wrapper's no-write/no-model plan:

```sh
pnpm run generate:science-question-art \
  --manifest="$ART_MANIFEST" \
  --work-root="$ART_ROOT" \
  --require-count=239 \
  --concurrency=6 \
  --max-attempts=4 \
  --min-free-space-gib=10 \
  --resume \
  --dry-run
```

It must select 239 pairs and plan 239 dark generations plus 239 light edits with
`chatgpt-gpt-image-2`. Remove only `--dry-run` to generate. A completed run has 239 passed immutable
jobs and exactly 478 normalized WebPs.

An ordinary interruption resumes with the identical `--resume` command. A review-bound or
perceptual-bound repair is a separate, single-use objective and must not use `--resume`. Image-service
network, DNS, timeout, authentication, rate-limit and HTTP failures latch a shared resumable stop
after current in-flight evidence is recorded; they must not consume all remaining composition
attempts. If an older ordinary lineage already consumed all four attempts before this guard existed,
preserve that evidence and use a new immutable release/cohort id after the infrastructure
prerequisite is fixed; never delete attempts to reset the budget.

## 6. Independently review the 239 pairs

```sh
pnpm run review:science-question-art \
  --manifest="$ART_MANIFEST" \
  --output-root="$ART_REVIEW_ROOT" \
  --require-count=239 \
  --batch-size=4 \
  --concurrency=4 \
  --resume
```

This is 60 ordered batches: 59 of 4 pairs and one of 3. Require 239 accepted (clean plus annotated),
zero major-rejected, zero missing, zero invalid batches, exact dark/light byte hashes, and a passed
summary. Minor issues remain in `retain-with-annotation` rows and do not enter the generator.

For major-rejected `fresh-regenerate` pairs, bind repair to the complete current review:

```sh
pnpm run generate:science-question-art \
  --manifest="$ART_MANIFEST" \
  --work-root="$ART_ROOT" \
  --require-count=239 \
  --concurrency=6 \
  --max-attempts=4 \
  --min-free-space-gib=10 \
  --repair-review="$ART_REVIEW_ROOT/review-summary.json" \
  --replace-output \
  --dry-run
```

Inspect the evidence hash and exact major-rejected set, then remove only `--dry-run`. Do not add
`--resume`. The repair prompt must explicitly request a fresh composition and must not attach or
reference the rejected image. After any changed pair, rebuild the complete independent 239-pair
review.

## 7. Run perceptual and catalogue ownership audits

First audit the 478 newly generated files:

```sh
pnpm run audit:science-question-art-perceptual \
  --manifest="$ART_MANIFEST" \
  --output="$PERCEPTUAL_AUDIT" \
  --require-count=239
```

The audit uses all configured full, mirror, and centre-crop dHash variants. Only the intended
dark/light sibling for one art id is excluded. Require zero collision across different owners.

If it finds collisions, regenerate only its deterministic collision cover:

```sh
pnpm run generate:science-question-art \
  --manifest="$ART_MANIFEST" \
  --work-root="$ART_ROOT" \
  --require-count=239 \
  --concurrency=6 \
  --max-attempts=4 \
  --min-free-space-gib=10 \
  --repair-perceptual-audit="$PERCEPTUAL_AUDIT" \
  --replace-output \
  --dry-run
```

Inspect the selected repair count, then remove only `--dry-run`. Rebuild the full independent art
review and the perceptual audit after any collision repair.

Before the closed-catalogue audit, freeze and independently review all 32 authored-static pairs:

```sh
pnpm run prepare:science-authored-static-art-review \
  --release-id="$STATIC_REVIEW_RELEASE"

pnpm run review:science-question-art \
  --manifest="$STATIC_REVIEW_MANIFEST" \
  --output-root="$STATIC_REVIEW_ROOT/art-review" \
  --require-count=32 \
  --batch-size=4 \
  --concurrency=4 \
  --resume
```

If that review reports major failures, create a new immutable `--generation-candidate` cohort
containing only those explicit challenge ids. Generate brand-new pairs without a rejected-image
reference, inspect them, and promote accepted masters to new versioned static paths; do not
overwrite the rejected files. Then rebuild `$STATIC_REVIEW_RELEASE` under a new release id and run a
fresh complete 32-pair review. Minor issues remain as annotations and are not regenerated.

Next audit the closed 271-challenge catalogue, supplying that final review:

```sh
node scripts/audit-science-challenge-catalog-art.mjs \
  --accepted-subset="$ACCEPTED_SUBSET" \
  --art-evidence-root="$ART_EVIDENCE_ROOT" \
  --art-manifest="$ART_MANIFEST_RELATIVE" \
  --retained-static-manifest="$STATIC_REVIEW_MANIFEST" \
  --retained-static-review="$STATIC_REVIEW_SUMMARY" \
  --output="$CATALOG_ART_AUDIT" \
  --dry-run
```

Require:

- 179 accepted-new owners;
- 60 existing replacement owners;
- 32 retained authored-static owners;
- 271 unique primary owners and pairs;
- 542 dark/light files across the complete catalogue;
- no cross-owner path, art-id, or perceptual collision; and
- 32 byte-bound authored-static semantic acceptances, allowing only recorded minor annotations;
- zero authored-static major defects or learner-question/art contradictions; and
- no unresolved functional diagram requirement.

Then remove only `--dry-run` to publish the immutable audit.

## 8. Materialize the accepted release

The accepted-release materializer must authenticate the subset projection, 179-row short-recall
authoring and review evidence, 239-pair art manifest and independent review, 478-file perceptual
audit and generation lineage, final catalogue ownership audit, curriculum evidence, and every local
WebP byte.

Use only the dedicated `science-179-v1` materializer CLI described by
`scripts/materialize-science-challenge-accepted-release.mjs`. Do not use
`scripts/materialize-science-challenge-release.mjs`; that is the legacy 408/2,000-art materializer.

<!-- VERIFIED_MATERIALIZER_COMMANDS -->

The write must build `data/challenges/releases/science-179-v1` in a sibling staging directory, replay
the complete tree, rename it atomically, and publish `accepted-challenges.json` last. Runtime must
contain 179 definitions, identities, and curriculum rows plus 239 visual rows. Each visual's
`cardArt` and `transferArt` must bind the same owned pair.

The release tree must include the sanitized 408-draft/408-review projection and 229-row holdout
ledger, not the machine-local source checkout.

## 9. Run local deterministic gates

Run the focused release suites, then repository checks:

```sh
pnpm run test:science-challenge-release
pnpm run test:science-challenge-short-recall
pnpm run test:science-question-art-perceptual
pnpm run test:science-authored-static-art-review
pnpm run check
pnpm run build
```

Also run the dedicated accepted-subset, art-cohort, catalogue-audit, accepted-release materializer,
and accepted-art uploader tests when those tests are not yet included by the package scripts.

Fail on any changed count, stale hash, path leak, duplicate id, missing review, missing WebP,
unresolved functional visual, runtime mismatch, or test warning that affects release integrity.

## 10. Dry-run and upload the 478 R2 objects

Use `scripts/upload-science-challenge-art.mjs`; its defaults must identify the closed
`science-179-v1` tree and 239-pair/478-WebP contract. First replay release evidence without reading
or mutating R2:

```sh
pnpm run upload:science-challenge-art --release-evidence-only
```

Then run the full local-byte dry-run:

```sh
pnpm run upload:science-challenge-art
```

Record the printed `manifestFileSha256`, `manifestCanonicalSha256`, and `acceptedReleaseSha256`.
With explicit remote-write authorization, pass those exact current values:

```sh
test ! -e "$R2_READBACK_REPORT"
set -o pipefail

pnpm run upload:science-challenge-art \
  --upload \
  "--expected-file-sha256=<manifest-file-sha256>" \
  "--expected-canonical-sha256=<manifest-canonical-sha256>" \
  "--expected-release-sha256=<accepted-release-sha256>" \
  --concurrency=4 \
  --retries=2 \
  2>&1 | tee "$R2_READBACK_REPORT"
```

The first pass must be read-only and must replay the accepted release, delivery manifest, exact
local file sizes and SHA-256 values, art review, perceptual audit, generation lineage, and catalogue
audit. Record every required hash pin printed by dry-run.

The explicit upload pass must:

- require the current dry-run pins;
- snapshot each local source before remote mutation;
- upload exactly 478 content-addressed WebPs;
- download every object again;
- verify full SHA-256 and byte size for every readback; and
- print a final 478/478 success summary.

Any changed release or image byte invalidates the pins. Rerun dry-run rather than overriding the
gate. Preserve and hash `$R2_READBACK_REPORT`; the uploader prints evidence to standard output but
does not publish a report file itself. R2 upload is a remote mutation and requires explicit release
authorization.

## 11. Run the clean-network local browser gate

Do not claim a clean browser gate before R2 upload and exact readback. Missing R2 art is a real 404,
not an ignorable pre-publication warning.

Choose one starter, standard, and stretch challenge from each subject in
`$RELEASE_ROOT/runtime.json`. Use their exact runtime path and intended `scope` query:

```sh
BIOLOGY_STARTER_ROUTE="<runtime-route-with-scope>"
BIOLOGY_STANDARD_ROUTE="<runtime-route-with-scope>"
BIOLOGY_STRETCH_ROUTE="<runtime-route-with-scope>"
CHEMISTRY_STARTER_ROUTE="<runtime-route-with-scope>"
CHEMISTRY_STANDARD_ROUTE="<runtime-route-with-scope>"
CHEMISTRY_STRETCH_ROUTE="<runtime-route-with-scope>"
PHYSICS_STARTER_ROUTE="<runtime-route-with-scope>"
PHYSICS_STANDARD_ROUTE="<runtime-route-with-scope>"
PHYSICS_STRETCH_ROUTE="<runtime-route-with-scope>"
BROWSER_QA_ROOT="$WORK_ROOT/browser-qa-r2"

scripts/dev-server.sh restart 5173

node scripts/validate-release-browser.mjs \
  --base-url="$LOCAL_BASE_URL" \
  --output="$BROWSER_QA_ROOT" \
  --route=challenge-hub:/challenges \
  --route=biology-hub:/challenges/biology \
  --route=chemistry-hub:/challenges/chemistry \
  --route=physics-hub:/challenges/physics \
  --route="biology-starter:$BIOLOGY_STARTER_ROUTE" \
  --route="biology-standard:$BIOLOGY_STANDARD_ROUTE" \
  --route="biology-stretch:$BIOLOGY_STRETCH_ROUTE" \
  --route="chemistry-starter:$CHEMISTRY_STARTER_ROUTE" \
  --route="chemistry-standard:$CHEMISTRY_STANDARD_ROUTE" \
  --route="chemistry-stretch:$CHEMISTRY_STRETCH_ROUTE" \
  --route="physics-starter:$PHYSICS_STARTER_ROUTE" \
  --route="physics-standard:$PHYSICS_STANDARD_ROUTE" \
  --route="physics-stretch:$PHYSICS_STRETCH_ROUTE" \
  --viewport=mobile,ipad,laptop \
  --theme=light,dark \
  --allow-anonymous \
  --fail-on-issues
```

The explicit route matrix replaces the harness defaults. Inspect its warnings and screenshots even
when it passes.

For the nine challenge routes, play the complete opening -> diagnosis -> repair -> transfer loop.
Verify wrong, retry, and correct states; locking and reviewability; reset; progress; subject/mixed
scope; next-unfinished selection; mobile layout; keyboard/focus behavior; and no console or network
errors.

For each representative, fetch both themes of its single owned pair: 18 unique R2 objects. Confirm
that opening and transfer render that same pair, the bytes and public paths match the delivery
manifest, the alt text is accurate, and the image never supplies evidence required to solve either
task.

Run the sitemap validator and require 275 challenge-section URLs: one hub, three subject hubs, and
271 challenge leaves.

```sh
pnpm run seo:validate-sitemap --base-url="$LOCAL_BASE_URL"
```

Preserve the browser output and a release-bound manual QA report with exact runtime/release hashes,
routes, actions, expected and observed results, viewport, theme, evidence paths, and evidence hashes.

## 12. Commit before any D1 write

Inspect the dirty tree and preserve unrelated work. Stage only the reviewed release scope and any
required runtime/tooling changes:

```sh
git status --short
git add -- "<explicit-reviewed-path-1>" "<explicit-reviewed-path-2>"
git diff --cached --check
git diff --cached --name-status
git diff --cached --stat
```

Before committing:

- replay the materialized release from the staged bytes;
- scan staged filenames and bytes plus release/browser/readback evidence for user-specific paths,
  identity strings, credentials, authorization material, cookies, and private keys;
- confirm the working release tree is byte-identical to the staged release tree; and
- confirm the staged set contains no unrelated changes.

Commit the exact reviewed tree locally:

```sh
git commit -m "Release reviewed science challenge cohort"
```

Do not write D1 before this succeeds. The D1 importer enforces that
`accepted-challenges.json`, `runtime.json`, `short-recall-prompts.json`, authoring evidence, and
review evidence are tracked and byte-identical in the current `HEAD`.

Do not push yet if a push can trigger deployment. Complete D1 and R2 readiness first.

## 13. Apply the committed short-recall snapshot to D1

Validate the combined 271-row snapshot locally:

```sh
pnpm run validate:challenge-short-recall
```

Require 271 total rows, subject counts Biology 64, Chemistry 101, Physics 106, exactly 179 generated
rows, exact catalogue order, and a stable target fingerprint.

Inspect migration state:

```sh
pnpm exec wrangler d1 migrations list QUESTION_DB --remote --env-file .env.local
```

Apply only an actually pending required `QUESTION_DB` migration and only with explicit authorization:

```sh
pnpm exec wrangler d1 migrations apply QUESTION_DB --remote --env-file .env.local
```

Read the current remote short-recall baseline without mutation and record its exact row count and
content fingerprint. The expected first-release baseline is the 92 authored ids, but always use the
current read-only result.

Write only with both current guards:

```sh
pnpm run import:challenge-short-recall \
  "--expected-before-count=<remote-before-count>" \
  "--expected-before-fingerprint=<remote-before-fingerprint>"
```

Require an authenticated plan with 179 additions, no authored changes, no deletes, and an exact
271-row post-write readback. Then verify again read-only:

```sh
node scripts/import-challenge-short-recall-prompts.mjs --verify-remote
```

Do not upload Cloudflare operator values into Worker secrets. A D1 mismatch after the transactional
write is a release failure even if the checked-in fallback would hide it in the UI.

## 14. Push, deploy, and verify production

Only after R2 readback, local browser QA, the local commit, and D1 readback all pass:

```sh
git fetch origin
git merge-base --is-ancestor origin/main HEAD
git push origin HEAD:main
```

If manual deployment is explicitly authorized, deploy the pushed commit:

```sh
pnpm exec wrangler deploy --env-file .env.local
```

Record the pushed commit and deployed Worker version. Then repeat the exact browser route, viewport,
theme, learner-loop, 18-object, and sitemap gates against production, using a fresh evidence root:

```sh
pnpm run seo:validate-sitemap --base-url="$PRODUCTION_BASE_URL"
```

Require 275 challenge-section URLs and no fallback image, stale runtime, D1 mismatch, console error,
network error, layout issue, scope leak, or answer dependence on decorative art.

## Repair and evidence rules

- The 229 rejected content rows are immutable holdouts. Never repair them inside
  `science-179-v1`.
- Preserve accepted content rows byte-for-byte. A content change invalidates the accepted subset,
  short recall, art selection, and release; use a new release.
- Short-recall repair may change only independently rejected prompts. Preserve accepted prompt bytes,
  use fresh roots, and rerun the complete 179-row review.
- Art-review repair may change only rejected pairs. Perceptual repair may change only the
  deterministic collision cover. Every changed pair requires a complete fresh visual review and
  fresh perceptual/catalog audits.
- One content or model objective has at most four immutable attempts. Never delete evidence, rename
  a root, or create a fifth attempt to bypass the limit.
- A timeout or interrupted response is not proof that a provider request did not occur. Follow the
  recorded resume or repair action.
- Never hand-edit candidates, prompts, image jobs, reviews, audit rows, hashes, receipts, delivery
  manifests, runtime projections, or the accepted marker.
- `accepted-challenges.json` is a final marker, not a place to reconstruct missing evidence.
- Raw model reasoning and machine-local logs are not learner runtime data and are not publishable.

## Completion checklist

Do not call the release complete until all of these agree:

- authenticated sanitized projection: 408 drafts, 408 reviews, 179 accepted, 229 held out;
- accepted subset: 34 Biology, 71 Chemistry, 74 Physics;
- catalogue: 92 existing + 179 new = 271 definitions;
- short recall: 179/179 independently accepted in 23 batches;
- generated art: 239/239 independently accepted pairs and 478 exact WebPs;
- ownership: 179 new + 60 replacements + 32 retained = 271 unique primary pairs;
- perceptual and catalogue audits: zero collision and zero unresolved functional visual;
- Git release/runtime replay: passed from the committed bytes;
- R2: 478/478 uploaded and read back by size and full SHA-256;
- D1: 271/271 rows exactly read back after a commit-bound write;
- local and production browser matrices: passed in all three viewports and both themes;
- challenge sitemap section: exactly 275 URLs; and
- pushed commit, deployment version, release hashes, readback report, and QA evidence recorded.
