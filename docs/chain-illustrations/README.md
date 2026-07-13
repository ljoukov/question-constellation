# Chain illustration selection

For the original manual calibration set, each selected chain was checked against its current
published questions, mark-scheme rows, checklists and model answers before illustration. Two
independent images were generated from the same prompt for each subject. Those historical files
remain in `candidates/`; new automated runs use the dark-generation/light-edit flow below.

## Selected chains

- Biology — `Vaccine immunity`: two clean public questions across November 2020 and June 2024.
  Candidate B was selected because the injection and later antibody response read most clearly.
- Chemistry — `Alloy hardness`: the same different-atoms → distorted-layers → blocked-sliding
  mechanism scores in both the steel/iron and aluminium-alloy questions. Candidate A was selected
  because it avoids an extra label and shows the hardness test with minimal deformation.
- Physics — `Step-Up Grid`: both public questions require the same potential-difference → current →
  cable-loss path. Candidate B was selected for its clean left-to-right grid journey.

The wider gas-pressure chain was not selected: one current membership ends in turbine power rather
than pressure, so a chain-level pressure image would not accurately cover every attached question.

## Automated post-import phase

The reusable implementation is intentionally downstream of answer-chain extraction:

```sh
pnpm run generate:chain-illustrations -- --chain-id=<id> --dry-run
pnpm run generate:chain-illustrations -- --chain-id=<id> --publish
```

`scripts/generate-chain-illustrations.mjs` reads final public evidence from D1, runs the semantic
reuse gate, generates one dark illustration from scratch, then sends that exact image back to the
image model as the input for a light-mode edit. It runs deterministic checks and a fresh visual
judge over both images, including explicit cross-panel and cross-theme consistency audits, then
uploads only a passing pair to immutable theme-specific R2 keys. Without `--publish`, it leaves the
two reviewed variants and job record under `tmp/chain-illustrations/`.

Every real production `--import` runs this phase automatically. A single-paper run considers chains
touched by that source document; a batch suppresses the child passes, waits until every paper
finishes, and runs one deduplicated cohort. `--generate-chain-illustrations` remains accepted as a
compatibility flag, while `--skip-chain-illustrations` is the explicit opt-out. Image failure does
not block the underlying question import unless `--require-chain-illustrations` is explicitly set.

Automatic batches remain capped at 20 mechanically eligible pre-candidates. Each accepted chain
produces exactly one dark generation and one derived light edit; it does not generate independent
alternatives or select a winner. Rejections are not backfilled merely to hit a quota. Continue to
review the first 20 eventual theme pairs as a calibration set for the prompts and visual QA gates.

## Stable visual language

- 16:9 landscape, generated at `2048x1152`, with iPad-safe margins and a legibility check at
  `1024x576`.
- Dark variant: deep navy scientific-atlas background, subtle grid, restrained luminous glow,
  accurate subject cutaways, and minimal verbatim text.
- Light variant: the same composition, objects, states, arrows and text, edited onto pale atlas
  surfaces with dark typography and contrast-adjusted versions of the same semantic colours.
- Two to four numbered panels in one clear direction. Never pad to four; never show a return loop.
- Pass the three-second, text-hidden test: the pictures alone should recover the ordered mechanism
  through objects, spatial direction, semantic colour and visible physical state changes.
- Establish the shared system or subject once. Give every stage a different mechanism-specific
  visual anchor; never repeat the same full transformer, body, apparatus, background or camera view
  as the dominant picture in several boxes.
- Prefer cutaways, motion, obstruction, heat, shape matching and concrete before/after outcomes over
  generic gauges or decorative repetition. End at a recognisable consequence such as energy
  reaching homes, a pathogen being neutralised or a material resisting deformation.
- Repeated objects and before/after states must remain internally consistent, but continuity must
  support the mechanism rather than become the main visual.
- Use full GCSE terminology in learner-facing copy. Never emit opaque shorthand such as `p.d.`;
  small correct equations may support an already visible link but must never replace it.
- Route the atlas by subject and mechanism: biological/medical/cellular/ecology, molecular/materials/
  apparatus/energy, or electrical/mechanics/waves/nuclear/measurement.
- No marketing composition, logo, watermark, exam-board branding, decorative legend, extra step,
  invented equation, or unsupported causal claim.

Every accepted source step must be mapped exactly once to a visual panel and supported for every
public member. The source fingerprint, exact dark-generation and light-edit prompts, both variant
hashes, derivation link, hard checks, and visual/cross-theme judge scores are retained in the job
artifact and D1 generation metadata.
