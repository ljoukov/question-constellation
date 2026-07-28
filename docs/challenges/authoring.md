# Challenge authoring and solvability

Challenges are reviewed views over GCSE science knowledge and exam-marking moves. They are not a
free-standing generated quiz bank. Read `docs/subject-content-workflow.md`,
`docs/product-methodology.md`, and `docs/product-flows.md` before changing the catalogue.

## Content contract

Each challenge contains two complete contexts:

1. a showdown, diagnosis, and smallest-sufficient improvement for the opening question; and
2. a different-context transfer task that uses the same scoring move.

Both contexts must be answerable from what the learner can actually see. Keep numbers, conditions,
units, and comparison directions in the prompt. Do not refer to a diagram, graph, image, figure,
photograph, table, or drawing that the stage does not render. Do not ask the learner to draw, sketch,
plot, shade, or label because the challenge renderer has no drawing canvas.

The learner-facing question is also the authority for every decorative illustration brief. Copy its
variables, allele letters and case, genotypes, formulae, units, counts, directions, labels,
materials, and apparatus state exactly. Never replace question-specific notation with a
conventional example. Prefer an answer-neutral physical starting scene over a notation-heavy
generated diagram; if exact notation is essential, use a deterministic code-native asset or require
the image to show only that exact notation with the outcome unresolved.

The release validators reject unseen visual references and unsupported drawing tasks. The synthetic
regression cases in `src/lib/challenges/contentValidation.test.ts` pin those failure modes without
copying any production challenge into source control.

## Rare visual-dependent transfers

Use a visual only when reading the visual is itself the assessed skill and a text equivalent would
change the task. In that case:

1. Export the active D1 catalogue to ignored workspace data with
   `pnpm run export:challenge-catalog-source`.
2. Add the exact answer-neutral visual authority and generation guards to the challenge candidate
   under `tmp/`. Treat a transfer teaser as unresolved: list allowed evidence and forbid answer
   leakage.
3. Run `pnpm run generate:science-question-art` against the complete candidate art manifest. The
   generator makes the dark and light variants as two independent fresh generations and refuses
   output outside ignored `tmp/`.
4. Run `pnpm run review:science-question-art` and
   `pnpm run audit:science-question-art-perceptual`. Accept only a pair that passes the image,
   cross-theme meaning, mobile-crop, ownership, and perceptual checks.
   Retain harmless imperfections as annotations. Regenerate only a major failure, always as a fresh
   composition; never edit or provide the rejected image as a reference.
5. Bind the accepted pair, its exact review, alt text, intrinsic dimensions, and generation guards
   into the next complete catalogue bundle. The catalogue importer uploads and reads back the bytes
   in R2 before it can activate the corresponding D1 rows.
6. Inspect the actual transfer stage at desktop and phone widths. The prose and alt text must still
   identify the task without relying on colour alone.

Adding decorative card art does not satisfy a visual-dependent transfer. The transfer stage renders
only `transferArt`.

## Curriculum grounding

Every published challenge record in D1 must contain one exact reviewed curriculum citation. Reuse an
existing reference only when the new challenge tests the same specification statement. A new topic
needs its own exact specification code, section, official deep link, expected heading, and source
text. Never add a subject-wide fallback or a code-side curriculum registry.

Keep internal paper ids optional. If a challenge cites imported question ids, both ids must already
belong to the same reviewed answer-chain family. Hand-authored contexts without those ids still need
the exact curriculum reference and all deterministic catalogue checks.

## D1/R2 release workflow

Production challenge content is not a source module, checked-in JSON file, or static asset. The
active immutable release is stored in `QUESTION_DB`; challenge image bytes are stored in
`QUESTION_R2`. Each challenge record contains its complete definition, public projections, answer
chain, curriculum citation, short-recall prompt, accepted visual review, exact art-authority spec,
and question-specific generation guards.

Every public page is materialized ahead of activation in `challenge_route_payloads`. The hub,
subject, detail, and internal index/sitemap consumers therefore load one active-release row rather
than joining the canonical catalogue during a request.

Use these operator steps:

```sh
# Export lightweight canonical records for planning and authoring.
pnpm run export:challenge-catalog-source -- --output=tmp/challenge-catalog/current-source.json

# Reconstruct the complete active bundle and exact R2 bytes before deriving a later release.
pnpm run export:challenge-catalog-release -- \
  --output-root=tmp/challenge-catalog/exports

# Derive a later complete release directly from that portable bundle and one reviewed change set.
pnpm run derive:challenge-catalog -- \
  --bundle=tmp/challenge-catalog/exports/<active-release>/<active-release>.bundle.json \
  --changes=tmp/challenge-catalog/<new-release>/changes.json \
  --release-id=<new-release> \
  --output=tmp/challenge-catalog/<new-release>/<new-release>.bundle.json

# A genuinely new catalogue instead starts from one complete final-state draft.
pnpm run create:challenge-catalog -- \
  --draft=tmp/challenge-catalog/<new-release>/draft.json \
  --output=tmp/challenge-catalog/<new-release>/<new-release>.bundle.json

# Dry-run first; publish only with the exact hash printed by that dry-run.
pnpm run import:challenge-catalog -- \
  --bundle=tmp/challenge-catalog/<new-release>/<new-release>.bundle.json
pnpm run import:challenge-catalog -- \
  --bundle=tmp/challenge-catalog/<new-release>/<new-release>.bundle.json \
  --publish \
  --expected-sha256=<exact-content-sha256>
```

The draft, portable bundle, and change-set formats contain complete canonical records directly.
Changed records are full replacements, not partial patches. Do not add an accepted-subset
projection, static-art cohort, catalogue conversion, or source-module adapter. Rejected content is
repaired and reviewed before it enters the complete candidate bundle.

The importer accepts arbitrary validated catalogue counts. It uploads and exactly reads back every
content-addressed R2 object, stages and exactly reads back the canonical and denormalized D1 rows,
then changes the active pointer atomically. Never put a challenge record under `src/`, `data/`, or
`docs/`, and never put challenge image bytes under `static/`.

## Authoring transport and evidence

The generator defaults to the existing Codex SDK transport. If that subscription call stalls, start
a deliberate direct run rather than assuming the old process stopped or silently changing provider:

```sh
pnpm run generate:science-challenges \
  --transport=llm-direct \
  --direct-response-mode=prompt-json \
  --thinking-level=high \
  --direct-part-size=4 \
  --plan=tmp/science-challenges/<release-id>/plan.json \
  --source=tmp/science-challenges/<release-id>/source-snapshot.json \
  --evidence=tmp/science-challenges/<release-id>/curriculum-evidence.json
```

`llm-direct` is explicit and subscription-backed. Its default
`--direct-response-mode=structured-json` uses `@ljoukov/llm` `streamJson`. The alternative
`--direct-response-mode=prompt-json` uses `streamText` with the exact local JSON Schema appended to
the prompt, then applies strict `JSON.parse` and the schema locally. Prompt JSON does not send a
provider response schema, accept Markdown fences, repair malformed JSON, or fall back to structured
JSON. Both modes use `chatgpt-gpt-5.6-sol` and an empty tools array. Maximum thinking remains the
default and the only allowed level for SDK or structured JSON. Prompt JSON alone may explicitly use
`--thinking-level=high`, which can help when a long reasoning stream otherwise ends without response
text. There is no automatic thinking-level fallback: the selected level is persisted and replayed
exactly. Neither mode activates automatically, changes provider/model, or falls through to an
API-billed transport. The direct path uses the normal ChatGPT profile, or the paired
`CHATGPT_CODEX_PROXY_URL` and `CHATGPT_CODEX_PROXY_API_KEY` values when both are present. WebSocket
responses are disabled. A half-configured proxy fails before authoring.

`--direct-part-size=4` is an explicit `llm-direct`-only option for an eight-row shard whose single
structured response stalls. It partitions the canonical rows as ordered 4 + 4 requests without
rebasing their global answer positions, then merges them mechanically in plan order. Every part uses
the same fixed model, maximum thinking, empty tools array, strict part-count schema and bounded outer
attempt policy. It is not a fallback: omitting the flag keeps one direct request, and a failed part
fails the whole attempt.

Each direct attempt retains the exact evidence needed for release replay:

- `request.json` binds the literal prompt, response schema, model, maximum thinking, no-tools
  setting, response mode, local schema hash and transport controls;
- `events.jsonl`, `last-message.json` and `thoughts.txt` retain the raw response, thought, model,
  usage stream and, for structured mode only, the final-JSON event;
- `result-metadata.json` binds provider, exact model version, usage, cost, timing and raw-output,
  thought and structured-value hashes; and
- `run-summary.json` binds every evidence file, the exact prompt and candidate, event counts and
  zero tool/action counters.

A multipart attempt keeps those seven files under `parts/part-NN/` for every ordered part. Its root
event index, merged response and composite summary bind the full input envelope, orchestration
prompt, exact reconstructed part prompts, all raw part outputs and their deterministic merge.
Resume, materialization and archive replay reject missing, reordered, substituted or rehashed part
evidence.

Candidate materialization, provenance archiving, and release replay require the exact evidence
contract for the transport selected by the plan. There is no transport conversion or missing-field
adapter. Missing files, changed bytes, a different provider/model/thinking level, a tool event, or a
stale prompt/candidate binding invalidates the run. The archived request, thought, and event streams
remain external hash dependencies; result metadata and sanitized lineage remain in the durable
release archive.

`--timeout-ms` supplies a cancellation signal, not an operating-system guarantee that an SDK child
has exited. If an SDK process appears stuck, stop and account for that process before starting a new
output root. Do not launch both transports against the same attempt directory or treat a missing
summary as proof that the first request never reached the service.

## Quality checks

Before browser review, run:

```sh
pnpm run test:science-challenge-authoring-transport
pnpm run test:challenges
pnpm run check
pnpm run build
```

The challenge tests enforce unique routes, complete stages, one correct choice per stage, plausible
choice-length balance, balanced showdown answers, curriculum coverage, artwork pairs, and transfer
solvability. Then play representative starter, standard, and stretch rounds for every changed subject
on desktop and a narrow phone viewport. Complete and deliberately miss every stage, verify feedback,
restart a round, and confirm that no prompt depends on content outside the rendered frame.
