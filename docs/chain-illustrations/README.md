# Chain illustration selection

Each selected chain was checked against its current published questions, mark-scheme rows,
checklists and model answers before illustration. Two independent images were generated from the
same prompt for each subject. The six compressed candidates remain in `candidates/`; the three
selected assets and their R2 metadata are declared in `manifest.json`.

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
reuse gate, generates A and B concurrently from the same prompt, runs deterministic image checks
and a fresh visual judge, including an explicit cross-panel consistency audit, then uploads only a
passing winner to an immutable R2 key. Without `--publish`, it leaves the reviewed candidates and
job record under `tmp/chain-illustrations/`.

The production import accepts `--generate-chain-illustrations` only with `--import`. A single-paper
run considers chains touched by that source document; a batch waits until every paper finishes and
runs one deduplicated cohort. Image failure does not block the underlying question import unless
`--require-chain-illustrations` is explicitly set.

The first automation batch should remain capped at 20 mechanically eligible pre-candidates,
processed as pairs only after the semantic gate accepts them. Rejections are not backfilled merely
to hit a quota. Review the first 20 eventual winners as a calibration set before making publication
unattended by default.

## Stable visual language

- 16:9 landscape, generated at `2048x1152`, with iPad-safe margins and a legibility check at
  `1024x576`.
- Deep navy scientific-atlas background, subtle grid, restrained luminous glow, accurate subject
  cutaways, and minimal verbatim text.
- Two to four numbered panels in one clear direction. Never pad to four; never show a return loop.
- Repeated objects and before/after states must remain internally consistent across every panel in
  the same event.
- Route the atlas by subject and mechanism: biological/medical/cellular/ecology, molecular/materials/
  apparatus/energy, or electrical/mechanics/waves/nuclear/measurement.
- No marketing composition, logo, watermark, exam-board branding, decorative legend, extra step,
  invented equation, or unsupported causal claim.

Every accepted source step must be mapped exactly once to a visual panel and supported for every
public member. The source fingerprint, exact prompts, both candidate hashes, hard checks, judge
scores, and selection rationale are retained in the job artifact and D1 generation metadata.
