# Challenge illustration pipeline

Challenge art uses the same luminous-atlas prompts, hard image checks, dark visual judge, strict
light edit judge, and glitch catalogue as answer-chain art. A second usage judge checks the actual
challenge stage: responsive presentation, crop safety, legibility, cited evidence, and teaser
answer leakage.

The JSON spec is the source of truth. It must include:

- displayStage: teaser or earned;
- the learner question, correct answer, and exhaustive evidence rows;
- a 2–4-stage visual plan, with evidence IDs on every stage;
- representative mobile presentation, position, final canvas width, and height;
- `mobileFit: "pan"` plus `mobileViewportWidth` for a legible horizontal atlas; pan mode judges
  both the full canvas at its real display scale and the initial phone-width crop. Pan artwork must
  use one left-to-right sequence (1 then 2 then 3); two-row, snake, circular, or corner-panel
  layouts fail because a phone crop can imply the wrong order;
- separate in-repository dark/light WebP output paths;
- for teasers, allowed clues plus forbidden answer text and visual disclosures.

Validate the spec and inspect the prompt/output plan without making model calls or files:

```sh
pnpm generate:challenge-illustration -- generate \
  --spec=docs/challenge-illustrations/specs/enzyme-denaturation-earned.json \
  --dry-run
```

Generate a fresh dark original with chatgpt-gpt-image-2, judge it, edit the accepted dark into a
light sibling, judge the pair, and copy only a passing pair:

```sh
pnpm generate:challenge-illustration -- generate \
  --spec=docs/challenge-illustrations/specs/enzyme-denaturation-earned.json
```

Review an existing pair without image-generation calls:

```sh
pnpm generate:challenge-illustration -- review-existing \
  --spec=docs/challenge-illustrations/specs/enzyme-denaturation-earned.json \
  --dark=docs/challenge-illustrations/candidates/enzyme-denaturation-dark-v2.webp \
  --light=docs/challenge-illustrations/candidates/enzyme-denaturation-light-v2.webp
```

Every run keeps the spec snapshot, augmented prompts and hashes, source/asset hashes,
desktop/mobile previews (including the initial viewport for pan mode), judge
prompts/events/results, validations, attempts, and terminal job.json under
tmp/challenge-illustrations/. Failed retries are fresh dark generations or new light edits from the
accepted dark; their prompt suffix contains only observed defects and rules triggered by those
defects.

Final paths are never touched before all gates pass. Existing final files are refused unless
--replace-output is explicit. Existing work roots likewise require both the pipeline sentinel and
--replace-work-root.
