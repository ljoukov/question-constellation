# Recall Practice

Question Constellation's answer-chain flow helps students close reasoning gaps in multi-mark answers.
The recall flow is a separate support surface for low-mark GCSE Science questions where the main
barrier is remembering a small required fact, test result, formula, unit, definition, or required-practical
detail.

## Product Role

- Keep answer chains as the main public exam-question atlas.
- Use `/recall` as a lightweight retrieval-practice surface for AQA GCSE Science recall knowledge.
- Do not turn recall cards into answer chains unless the item genuinely has reusable mark-scoring
  reasoning.
- Store progress locally for now. A future signed-in model can sync due cards, streaks, and weak topics.

## Card Types

Recall cards should be compact and source-grounded:

- `definition`: terms such as diffusion, isotope, homeostasis.
- `formula`: equations and word equations.
- `process`: short named mechanisms that often earn one or two marks.
- `test-result`: chemical tests and observable results.
- `unit`: SI units and common GCSE measurement units.
- `practical`: required-practical method hooks.
- `fact`: standalone recall facts.
- `comparison`: paired terms such as scalar/vector or genotype/phenotype.

## Practice Modes

- `Recall`: show the prompt, reveal the expected answer, then self-grade.
- `Recognise`: show answer choices for a lower-friction recognition pass.
- `Reverse`: show the answer side and recall the term, process, or formula name.

The recognition mode is deliberately not the only mode because visible choices reduce retrieval
strength. Signed-in progress records the exact course/tier scope plus card content revision and hash,
so revised material is not silently treated as previously mastered.

## Sources

Recall generation uses the reviewed official catalog in
`data/curricula/curriculum-catalog.json` and its immutable PDFs. Curriculum is independent of past
papers. Refresh those sources through the curriculum catalog workflow; the older AQA-only cache can
still be regenerated with:

```sh
npm run download:aqa-science-specifications
```

The original curated route data in `src/lib/recall/aqaScienceRecall.ts` remains a fallback. Generated
cards retain exact PDF page evidence, the specification file hash, and reviewed offering/component
targets in D1.

The compiler extracts each selected page range in PDF reading order (`pdftotext -raw`). This avoids
splicing the specification's right-hand skills notes into the middle of its content sentences. Model
evidence must still be one contiguous verbatim span from that extraction; reconstructed or tidied
quotes are rejected before review.

## Visual Cue Contract

Every card has one familiar native emoji that acts as a quick visual landmark. It identifies the broad
scientific context without encoding the answer, formula, result, trend, unit, or a clue that eliminates a
distractor. The visible card uses the emoji; the card-kind label remains available to assistive technology
and to the setup filters.

The compiler uses separate Codex turns for generation, full-card review and cue review. Persist a card
only when the deterministic validator, the independent content reviewer and the independent cue
reviewer all accept it. A proposed replacement is applied to the complete card and reviewed in another
turn; no fallback is automatically safe. The original deck and compiler share the allowlists in
`src/lib/recall/visualCues.js`.

The current artifact contract is `recall-card-bundle-v2` with prompt
`recall-card-compiler-v6`. It requires evidence support paths for every choice's feedback and every
distractor misconception. Immutable `recall-card-compiler-v5` bundles remain importable and visible;
their run IDs must end in `-compiler-v5`, while every new run must end in `-compiler-v6`. This keeps the
exact historic prompts and outputs auditable without letting a v5 artifact masquerade as a v6 run.
Older v1/v3 canary artifacts used coarser support tags; the importer rejects them explicitly rather
than silently interpreting them under the stronger contract. Regenerate those older artifacts before
importing them.

## Reproducible Compiler

Select one focused official topic or section and at least one exact offering. Tier is always explicit;
the compiler never expands a broad component to both tiers. If more than one offering is intentional,
also name the one primary mapping.

```sh
pnpm run generate:recall-cards -- \
  --specification-id=aqa-gcse-combined-science-trilogy-8464-v1.1 \
  --component-id=aqa-gcse-combined-science-trilogy-8464-v1.1:4-3-1-7 \
  --subject=Biology \
  --offering-id=aqa-gcse-combined-science-trilogy-8464-v1.1:biology:higher \
  --count=3
```

That command is a zero-model-cost plan by default. Add `--generate` only after checking the source,
page range, tier and targets. Production defaults are `gpt-5.6-sol` with `max` reasoning for the
generator and both independent reviewers.

Ephemeral event streams and working files live below `tmp/recall-generation/<run-id>/`. A successful
run separately writes its exact source evidence, prompts, structured model outputs, normalized
candidates, independent reviews, canonical accepted bundle, rejection report and run manifest below
`data/recall/generated/<run-id>/`. The accepted bundle is the reviewable, durable import artifact; its
SHA-256 identity is computed from canonical JSON, independent of whitespace or indentation.

## Dry-run-first Import

```sh
pnpm run import:recall-cards -- \
  --input=data/recall/generated/<run-id>/accepted-cards.json

pnpm run import:recall-cards -- \
  --input=data/recall/generated/<run-id>/accepted-cards.json \
  --write
```

The first command is read-only. It checks schema presence, official source hashes, specification-tree
relationships, exact offering/tier targets, ownership, stable IDs, idempotency and content conflicts.
`--write` accepts only durable artifacts below `data/recall/generated`. Changed compiler-owned cards
also require `--allow-update`; the update is guarded by the exact old status, revision and hash observed
during preflight. Each transaction writes a draft, all four choices, evidence and reviewed targets,
then publishes through D1 completeness triggers. Post-write verification compares every stored child
row with the accepted artifact.
