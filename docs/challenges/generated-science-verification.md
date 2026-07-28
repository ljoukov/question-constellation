# Generated science challenge verification

Generated challenge content is publishable only after an independent, evidence-bound review. The
workflow is count-agnostic and operates on ignored candidate files under `tmp/`; accepted runtime
records live in D1.

## Authority

- Official curriculum/specification evidence defines scope.
- Paper, mark-scheme, and answer-chain evidence calibrates task shape and marking.
- The candidate's learner-facing question is authoritative over supporting copy and art.
- The active D1 catalogue, or an explicit ignored export of it, supplies existing ids, routes, and
  duplicate context.
- Git contains validators and generic prompt builders, never production candidate or review rows.

## Candidate freeze

Before review, freeze:

- the plan and its canonical hash;
- source and curriculum evidence hashes;
- ordered candidate bytes;
- authoring prompt, model, thinking, response-mode, and output evidence;
- the complete existing-catalogue context used during authoring; and
- the exact candidate count and ordered id set.

Do not review a mutable directory. Any candidate change creates a new immutable review objective.

## Independent assignment

Partition the complete candidate set into bounded ordered assignments. Batch size is operational;
it must not imply a fixed release size. Every candidate appears exactly once.

Reviewers receive only the frozen assignment evidence and the shared rubric. They do not receive an
authoring conversation, operator diagnosis, or another reviewer's decisions. The dispatch ledger
binds each assignment, evidence hash, reviewer task, model, and reasoning level.

Use the canonical packet and validation builders in:

- `scripts/lib/science-challenge-verifier-packets.mjs`
- `scripts/lib/science-challenge-verifier-dispatch.mjs`
- `scripts/lib/science-challenge-release.mjs`
- `scripts/aggregate-science-challenge-verification.mjs`

## Review gates

Each candidate must independently pass:

1. exact curriculum grounding;
2. paper and mark-scheme calibration without copying;
3. scientific, numerical, notation, and unit correctness;
4. distinct opening, transfer, and same-component contribution;
5. self-contained learner tasks;
6. a fair compare, diagnose, repair, and transfer loop;
7. defensible choices and misconception-based distractors;
8. calibrated difficulty and marks;
9. clear British learner-facing copy;
10. safe, answer-neutral illustration authority; and
11. a safe misconception-led teaser.

`accepted` is the conjunction of every required gate and an empty issue list. A rejection names the
exact field, visible evidence, category, and minimal repair. Reviewers diagnose; they do not edit
candidate bytes.

## Aggregation

Aggregation must fail closed when:

- assignment, candidate, source, curriculum, or dispatch hashes drift;
- a candidate is missing, duplicated, reordered, or reviewed more than once;
- a review contains unknown fields or inconsistent acceptance;
- reviewer provenance is incomplete;
- a typed repair or recovery binding is partial; or
- the aggregate candidate count differs from the frozen candidate set.

The aggregate preserves every row and issue. Publication proceeds only when the proposed complete
catalogue contains independently accepted records only. Do not create a separate accepted-subset
artefact from a mixed cohort. Repair rejected rows, freeze the changed
candidate set, and rerun complete independent review before bundling.

## Repair

Repair only rejected rows and only under a typed repair authority. Preserve accepted siblings
byte-for-byte. A repair prompt receives the frozen candidate, its exact independent issues, and the
same authoritative source evidence.

Each objective has at most four immutable attempts. Do not delete, rename, or copy evidence to reset
an attempt budget. An ambiguous provider response or crash is not proof that no request occurred.

After any repair, rerun independent review for the complete proposed publication cohort. Do not
merge an old acceptance with changed candidate bytes.

## Materialization and publication

Materialization stays under ignored `tmp/`. It authenticates:

- the candidate and aggregate review;
- any repair/recovery lineage;
- short-recall authoring and review;
- art authority, generation, review, and perceptual evidence;
- curriculum and answer-chain projections; and
- every image byte and delivery binding.

The challenge-catalogue create or derive command consumes canonical records directly and computes
the hub, subject, detail, index, and sitemap payloads. It does not convert an earlier catalogue
shape. The D1/R2 importer is the sole publication path. It uploads and reads back every R2 object,
stages and reads back every D1 row, and changes the active release pointer only in the final
transaction.

## Verification commands

Run the focused workflow suite plus application gates:

```sh
pnpm run test:science-challenge-release
pnpm run test:challenges
pnpm run check
pnpm run build
```

Export the active D1/R2 release and dry-run the importer against that export. A release is not
portable until its canonical hash, record count, route count, asset count, and every image hash
round-trip exactly without a source-controlled catalogue.
