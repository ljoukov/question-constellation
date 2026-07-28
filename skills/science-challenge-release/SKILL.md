---
name: science-challenge-release
description: Author, review, illustrate, bundle, and publish GCSE challenge releases to D1 and R2.
---

# Science challenge release

Use this skill for any new, repaired, expanded, or imported challenge catalogue. The release is
count-agnostic: derive every challenge, subject, route, and asset count from the candidate bundle.
Never encode a release's records, ids, prompts, review decisions, art briefs, guards, or image bytes
in Git.

Run commands from the repository root.

## Read first

Read these files completely before changing content or release tooling:

- `AGENTS.md`
- `docs/subject-content-workflow.md`
- `docs/product-methodology.md`
- `docs/product-flows.md`
- `docs/extraction-spec.md`
- `docs/challenges/authoring.md`
- `docs/challenges/generated-science-verification.md`
- `docs/challenges/science-question-art-r2.md`

The learner flow remains question -> answer chain -> constellation -> practice. Curated data must
carry the public experience without requiring a runtime model call.

## Storage authority

- `QUESTION_DB` is authoritative for canonical records, public projections, answer chains,
  curriculum citations, short-recall prompts, visual reviews, art-authority specs,
  challenge-specific generation guards, asset metadata, and denormalized route payloads.
- `QUESTION_R2` is authoritative for accepted challenge image bytes.
- Git may contain schemas, migrations, loaders, validators, generic prompt builders, generic
  generation and review tooling, documentation, and synthetic tests only.
- Candidate records, portable exports, model evidence, prompts, reviews, bundles, and image files
  must stay under ignored `tmp/` until publication.

Do not add production challenge data under `src/`, `data/`, `docs/`, or `static/`. Do not add
challenge-specific conditionals to prompt builders. A challenge-specific constraint belongs in the
canonical D1 record at `artAuthority.spec.generationGuards`.

## Canonical release shape

Every candidate uses `challenge-catalog-bundle/v2`. Its release section and content hash are derived
from the complete candidate:

- canonical challenge records;
- immutable R2 asset bindings and local candidate bytes;
- subject counts;
- hub, subject, detail, index, and sitemap route payloads; and
- release metadata.

The hash excludes portable local file locations but includes every public value and image hash.
Never hand-edit a hash or route payload.

Route payloads are deliberately denormalized:

- the challenge hub reads one active payload;
- each subject hub reads one active payload;
- each challenge detail reads one active payload;
- index and sitemap consumers read their own active payloads.

Runtime loaders must resolve the active release pointer and requested route in one D1 query. Do not
reintroduce joins or source-module assembly on page load.

## 1. Start from D1, not source code

Export the active catalogue into an ignored workspace when extending an existing release:

```sh
WORK_ROOT="tmp/challenge-catalog/<new-release-id>"
SOURCE_EXPORT="$WORK_ROOT/active-source.json"

pnpm run export:challenge-catalog-source -- --output="$SOURCE_EXPORT"
```

The export is an authoring input, not a tracked fallback. New importers may instead create a
candidate source from extraction evidence, but every producer must emit the canonical record shape
directly. Do not add a compatibility parser or conversion stage.

## 2. Author and independently review content

Use the source export explicitly:

```sh
pnpm run plan:science-challenges -- \
  --catalog-source="$SOURCE_EXPORT" \
  <other-plan-inputs>

pnpm run generate:science-challenges -- \
  --catalog-source="$SOURCE_EXPORT" \
  <authoring-inputs>
```

Authoring prompts are built only by
`scripts/lib/science-challenge-authoring-prompts.mjs`. They use curriculum evidence as scope
authority and question/mark-scheme evidence as calibration. Preserve immutable attempts and exact
prompt/model/output hashes.

Independent review must cover every candidate in the proposed release. A reviewer diagnoses exact
fields and evidence; it does not silently repair them. Accepted rows remain byte-identical through
targeted repair. Any changed row must be independently reviewed again.

Do not assume a fixed number of shards, reviewers, subjects, or accepted rows. Batch sizes are
operational limits, not catalogue geometry.

## 3. Author and review short recall

Short-recall records are part of the canonical challenge record and detail-route payload. Author and
review them from the ignored candidate set. Derive target and batch counts from that set.

Each accepted prompt must satisfy the validators in
`scripts/lib/science-challenge-short-recall.mjs`, including exactly one blank, an unambiguous short
answer, complete ordinary aliases, question-specific wording, no answer leak, no duplicate, and D1
limits.

Repair only independently rejected rows in a fresh immutable authoring root, then rerun a complete
review against the changed candidate set.

## 4. Generate and review art

`scripts/generate-science-question-art.mjs` is the release art generator. It reads art authority and
exact `generationGuards` from the candidate catalogue source or active D1 release.

For each selected owner:

1. generate a brand-new dark original with `chatgpt-gpt-image-2`;
2. generate a brand-new light variant independently from the same authoritative spec;
3. normalize both delivery files;
4. independently review the exact pair with `gpt-5.6-sol`; and
5. bind accepted bytes, hashes, review, and alt text into the canonical record.

The learner-facing question outranks the art brief. Compare exact variables, notation, counts,
directions, labels, materials, apparatus states, and requested evidence.

Apply the major-only decision rule:

- retain harmless or slightly imperfect art with a specific annotation;
- freshly regenerate only a clearly wrong question/material, false scientific state, conflicting
  notation/count/direction, answer leak, or unusable diagram;
- never edit, inpaint, or provide a rejected image as a reference;
- a rejected pair gets two new independent compositions from the same authoritative spec.

Decorative background texture is not a scale claim. Only a scale bar, axis, measurement mark,
calibrated grid, or explicit dimension creates scale evidence.

Unpublished question, prompt, brief, and image disclosure to configured generation/review services
requires explicit user authorization unless already in scope.

## 5. Create or derive the portable bundle

For a later release, first export the exact active bundle and R2 bytes, then apply one reviewed
canonical change set:

```sh
CATALOG_BUNDLE="$WORK_ROOT/<new-release-id>.bundle.json"

pnpm run export:challenge-catalog-release -- \
  --output-root="$WORK_ROOT/active-release"

pnpm run derive:challenge-catalog -- \
  --bundle="$WORK_ROOT/active-release/<active-release-id>/<active-release-id>.bundle.json" \
  --changes="$WORK_ROOT/changes.json" \
  --release-id="<new-release-id>" \
  --output="$CATALOG_BUNDLE"
```

A genuinely new catalogue uses one complete final-state draft:

```sh
pnpm run create:challenge-catalog -- \
  --draft="$WORK_ROOT/draft.json" \
  --output="$CATALOG_BUNDLE"
```

All inputs and outputs must be ignored `tmp/` paths. Drafts and change sets contain complete
canonical records directly; a changed record is a full replacement, never a partial patch. Do not
introduce accepted-subset projections, static-art cohorts, or catalogue format conversions. The
create and derive commands validate identities, public projections, art review bindings, asset
ownership, image sizes and hashes, and denormalized route coverage. They reject duplicate
subject/slug routes, missing detail payloads, stale hashes, and challenge-specific data that would
need a checked-in fallback.

## 6. Dry-run, upload, read back, and activate

Dry-run the exact bundle first:

```sh
pnpm run import:challenge-catalog -- --bundle="$CATALOG_BUNDLE"
```

Record the printed content hash. With explicit remote-write authorization, publish only that exact
hash:

```sh
pnpm run import:challenge-catalog -- \
  --bundle="$CATALOG_BUNDLE" \
  --publish \
  --expected-sha256="<exact-content-sha256>"
```

Publication ordering is mandatory:

1. upload every content-addressed image to R2;
2. read every R2 object back and verify full SHA-256 and byte size;
3. stage release, canonical record, asset, and route-payload rows in D1;
4. read all staged D1 rows back and verify canonical hashes and derived counts;
5. activate the release pointer in the final D1 transaction.

Never activate a partial release. A failed import leaves the prior pointer active.

## 7. Prove portability

Export the active remote release back from D1/R2:

```sh
pnpm run export:challenge-catalog-release -- \
  --output-root="$WORK_ROOT/readback"
```

Run the importer dry-run against that exported bundle. Require exact equality for the release hash,
canonical challenge count, subject counts, asset count, route-payload count, and every R2 image hash.
This proves that the next release can start without a source-controlled catalogue.

## 8. Validate the application

Run at least:

```sh
pnpm run test:challenges
pnpm run test:science-challenge-release
pnpm run check
pnpm run build
```

Start local development with `scripts/dev-server.sh`. Inspect the challenge hub, every subject hub
affected by the release, and representative detail routes on desktop and mobile. Confirm:

- route counts match the active D1 release;
- image URLs use the active immutable R2 namespace;
- visible images load and have non-zero dimensions;
- no horizontal overflow, console errors, or failed requests;
- learner states and progress still work; and
- decorative art is not required to solve the task.

## 9. Verify the tracked tree

Run:

```sh
git status --short
git diff --check
```

Scan the tracked change set for production challenge records, challenge-specific prompt guards,
review rows, art specs, image bytes, credentials, and machine-local paths. None may remain.

Publishing D1/R2 data does not authorize a Git push or Worker deployment. Push or deploy only when
the user separately requests it.

## Completion gate

Do not call the release complete until:

- every canonical candidate has an independent acceptance;
- every accepted image pair has exact review and hash bindings;
- all R2 objects pass full readback;
- all canonical and denormalized D1 rows pass readback;
- the active pointer references the exact published hash;
- the remote export reconstructs the same bundle;
- tests, type checks, build, and browser QA pass; and
- the tracked repository contains no production challenge data or image bytes.
