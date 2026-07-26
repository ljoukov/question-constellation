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

The deterministic gate in `src/lib/challenges/contentValidation.test.ts` rejects unseen visual
references and unsupported drawing tasks.

## Rare visual-dependent transfers

Use a visual only when reading the visual is itself the assessed skill and a text equivalent would
change the task. In that case:

1. Write a challenge-illustration spec following `docs/challenge-illustrations/README.md`. Treat the
   transfer prompt as a teaser: list allowed evidence and forbid answer leakage.
2. Run `pnpm generate:challenge-illustration -- generate --spec=<spec>`.
3. Accept only a dark/light pair that passes the image, theme, mobile-crop, and usage judges.
4. Publish both files under `static/product/challenges/` and wire the pair to the challenge's
   `transferArt` definition with useful alt text and intrinsic dimensions.
5. Inspect the actual transfer stage at desktop and phone widths. The prose and alt text must still
   identify the task without relying on colour alone.

Adding decorative card art does not satisfy a visual-dependent transfer. The transfer stage renders
only `transferArt`.

## Curriculum grounding

Every published challenge id must resolve to one exact reviewed entry in
`src/lib/server/challengeCurriculum.ts`. Reuse an existing reference only when the new challenge tests
the same specification statement. A new topic needs its own exact specification code, section,
official deep link, expected heading, and source text. Never add a subject-wide fallback.

Keep internal paper ids optional. If a challenge cites imported question ids, both ids must already
belong to the same reviewed answer-chain family. Hand-authored contexts without those ids still need
the exact curriculum reference and all deterministic catalogue checks.

## Authoring transport and evidence

The generator defaults to the existing Codex SDK transport. If that subscription call stalls, start
a deliberate direct run rather than assuming the old process stopped or silently changing provider:

```sh
pnpm run generate:science-challenges \
  --transport=llm-direct \
  --direct-response-mode=prompt-json \
  --thinking-level=high \
  --direct-part-size=4 \
  --plan=tmp/science-challenges/science-500-v1/plan.json \
  --source=tmp/science-challenges/science-500-v1/source-snapshot.json \
  --evidence=tmp/science-challenges/science-500-v1/curriculum-evidence.json
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

Candidate materialization, provenance archiving and release replay accept both old Codex SDK evidence
and this direct evidence. Direct evidence is fail-closed: missing files, changed bytes, a different
provider/model/thinking level, a tool event or a stale prompt/candidate binding invalidates the run.
The archived request, thought and event streams remain external hash dependencies; result metadata
and sanitized lineage remain in the durable release archive.

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
