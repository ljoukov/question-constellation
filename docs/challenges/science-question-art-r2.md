# Science challenge art in R2

Challenge artwork is production data. Accepted bytes live in `QUESTION_R2`; their question, brief,
review, alt text, generation guards, hashes, and delivery bindings live in the canonical D1 record.
Git contains only generic generation/review tooling and synthetic tests.

## Source authority

The generator reads either:

- the active D1 catalogue; or
- an explicit ignored catalogue export under `tmp/`.

It must not import challenge definitions, art specs, or guard tables from `src/`, `data/`, `docs/`,
or `static/`.

The learner-facing question is authoritative. `artAuthority.spec` defines the answer-neutral visual
brief, and `artAuthority.spec.generationGuards` contains exact challenge-specific constraints.
Prompt builders may add generic safety rules, but they must not contain challenge ids or
question-specific exception tables.

## Pair generation

`scripts/generate-science-question-art.mjs` generates one primary pair per selected owner:

1. a brand-new dark original using `chatgpt-gpt-image-2`;
2. a brand-new light variant generated independently from the same authoritative spec; and
3. normalized opaque delivery WebPs.

All manifests, prompts, masters, normalized files, jobs, repair evidence, and reviews stay under
ignored `tmp/`. The checked-in `static/` tree is never a publication target.

Each immutable job binds:

- release and challenge identity;
- canonical art-authority hash;
- exact dark and light prompts;
- model and attempt;
- master and normalized byte hashes;
- dimensions and file sizes; and
- any review or perceptual repair authority.

## Scientific and task checks

Before generation and during review, compare the art authority with the learner question:

- exact variables, cases, allele notation, formulae, units, and numeric counts;
- direction, sequence, polarity, wiring, and source/target relationships;
- material, component, sample, and apparatus identity;
- open/closed, sealed/unsealed, heated/unheated, and other visible states; and
- whether the image supplies evidence the learner is asked to infer.

A decorative background pattern is not a scale claim. Only a scale bar, axis, measurement mark,
calibrated grid, explicit dimension, or comparable measurement cue claims scale.

## Independent review

`scripts/review-science-question-art.mjs` reviews exact dark/light pairs with `gpt-5.6-sol`. It
checks scientific accuracy, question relevance, brief/question consistency, visible notation,
answer leakage, unwanted text, theme fidelity, visual quality, mobile safety, and alt text.

The decision rule is deliberately conservative:

- `accept`: no material issue;
- `retain-with-annotation`: a harmless or slightly imperfect depiction that remains scientifically
  usable and does not leak the answer;
- `fresh-regenerate`: clearly wrong question/material, false science, conflicting
  notation/count/direction/state, answer leakage, or unusable task diagram.

Minor annotations remain attached to the D1 review record. They do not trigger image generation.

## Fresh regeneration only

A rejected image is never edited, inpainted, or supplied as a reference. A repair request:

1. freezes the exact major rejection and candidate authority;
2. asks for a new dark composition from scratch;
3. asks separately for a new light composition from the same authoritative spec;
4. does not attach the rejected pair or either new variant as a reference; and
5. runs a fresh exact-pair review.

The attempt ceiling is immutable. Provider infrastructure failures record resumable evidence and
must not be relabelled as visual failures.

## Perceptual and ownership audit

Before bundling:

- verify every expected pair exists and every byte matches its job;
- reject cross-owner path or art-id reuse;
- run configured perceptual fingerprints across owners;
- compare intended light/dark variants as one owner pair without suppressing cross-owner matches;
- ensure each primary owner has exactly one accepted pair; and
- ensure any task-dependent diagram is separately source-bound and reviewed.

## R2 publication

The challenge-catalogue bundle records local candidate paths only for portable import. Those paths
are excluded from the canonical release hash. Public bindings use immutable content-addressed R2
keys within the release namespace.

The importer:

1. validates the complete bundle and all local bytes;
2. uploads every R2 object;
3. downloads every object again;
4. verifies full SHA-256 and byte size;
5. stages canonical record, asset, and denormalized route rows in D1; and
6. activates the release only after exact D1 readback.

There is no checked-in image fallback.

## Browser validation

After publication, inspect hub, subject, and representative detail routes on desktop and mobile.
Require immutable release-scoped image URLs, non-zero natural dimensions, accurate alt text, no
horizontal overflow, no console/network errors, and no learner answer dependency on decorative art.

Publishing unpublished questions, briefs, prompts, or image pairs to configured model services
requires explicit user authorization unless that disclosure is already in scope.
