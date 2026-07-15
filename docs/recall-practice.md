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
strength. Local progress stores `Again`, `Hard`, `Good`, and `Easy` outcomes with simple review
intervals.

## Sources

The initial AQA GCSE Science specifications are cached in `data/aqa-science-specifications/`.
Regenerate the cache with:

```sh
npm run download:aqa-science-specifications
```

The route data in `src/lib/recall/aqaScienceRecall.ts` references the official AQA specification pages
and specification section numbers for each card.

## Visual Cue Contract

Every card has one familiar native emoji that acts as a quick visual landmark. It identifies the broad
scientific context without encoding the answer, formula, result, trend, unit, or a clue that eliminates a
distractor. The visible card uses the emoji; the card-kind label remains available to assistive technology
and to the setup filters.

The original deck is curated source data rather than the output of a live card generator. Any future
curriculum-grounded importer must use both stages in
`scripts/lib/recall-card-generation-prompt.mjs`: generate the complete card with its subject-only cue
allowlist, then send that complete card through the independent cue-review prompt. Persist it only when
the cue passes the subject validator and the semantic review accepts that exact cue. A proposed
replacement must be applied and reviewed again; no fallback is automatically safe. This is a tested
contract for a future importer, not a live generation pipeline. The current curated backfill and the
future generator share the allowlists in `src/lib/recall/visualCues.js`.
