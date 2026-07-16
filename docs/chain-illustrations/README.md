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
image model as the input for a light-mode edit only after the dark original independently passes
deterministic and visual QA. It then runs deterministic light checks and a separate strict
cross-theme preservation audit, and uploads only a passing pair to immutable theme-specific R2 keys.
Without `--publish`, it leaves the two validated variants and job record under
`tmp/chain-illustrations/`.

Every real production `--import` runs this phase automatically. A single-paper run considers chains
touched by that source document; a batch suppresses the child passes, waits until every paper
finishes, and runs one deduplicated cohort. `--generate-chain-illustrations` remains accepted as a
compatibility flag, while `--skip-chain-illustrations` is the explicit opt-out. Image failure does
not block the underlying question import unless `--require-chain-illustrations` is explicitly set.

Automatic batches remain capped at 20 mechanically eligible pre-candidates. The pipeline first
generates a no-reference dark original and independently judges that single image. A failed dark is
discarded; its retry is another brand-new no-reference generation whose prompt adds only the exact
observed defects and the structured glitch rules the judge triggered. No light edit is attempted
until one dark original passes. The accepted dark is then locked as the only source image for every
light-edit attempt. A failed light is discarded and re-edited from that accepted dark—never from a
failed light. The pair is publishable only after the light edit passes strict theme-preservation QA.
The pipeline never generates independent dark alternatives merely to select a winner, and rejected
chains are not backfilled merely to hit a quota. Continue to review the first 20 eventual theme pairs
as a calibration set for the prompts and visual QA gates.

## Stable visual language

- 16:9 landscape with iPad-safe margins and a legibility check at `1024x576`. The current scoped
  number-rule repair cohort is `1672x941`; automated jobs record and validate their actual output
  dimensions instead of claiming a fixed generator size.
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
- Never include a value copied from one source question, a worked substitution, intermediate or
  final numerical answer, one-question unit, or an invented example scale. Panel ordinals are fine;
  equations, symbols, formula constants and ratios are allowed only when they apply unchanged to
  every public member of the chain.
- The independent judge, not the core generation prompt, owns the full structured glitch catalogue:
  ambiguous symbol placement, wrong conductor association, bypass topology, invalid equations,
  repeated-object identity/size drift, force-removal direction, conventional-current/electron-flow
  confusion, question-specific numbers, lost track/surface contact, unexplained abstract encodings,
  broken spatial storytelling, missing bridges for central derived quantities or governing laws,
  ambiguous physical-quantity encodings, creation-like cues for conserved quantities, and inexact
  relationship terminology. Every symbol/current label must target one exact physical quantity or
  location; equations remain visually separate from conductor/object labels. A compact universal
  relationship may bridge an otherwise opaque term to familiar quantities, and a compact universal
  conservation/balance statement may reinforce the same mechanism. Both stay outside the numbered
  reasoning steps and never contain example values.
- Before scoring correctness or aesthetics, the judge reconstructs what a learner would infer with
  wording hidden and after reading the full image. It records specific visual cue → concept →
  relationship associations, plausible unintended takeaways, and whether the connected lesson
  matches the planner's intended goal. A list of visible nouns or copied labels is not a pass.
- Route the atlas by subject and mechanism: biological/medical/cellular/ecology, molecular/materials/
  apparatus/energy, or electrical/mechanics/waves/nuclear/measurement.
- No marketing composition, logo, watermark, exam-board branding, decorative legend, extra step,
  invented equation, or unsupported causal claim.

Every accepted source step must be mapped exactly once to a visual panel and supported for every
public member. New jobs created by the current publisher retain the source fingerprint, exact
dark-generation and light-edit prompts, both variant hashes, derivation link, hard checks, and
separate dark-original and light-preservation judge records in the job artifact and D1 generation
metadata.
The metadata distinguishes deterministic checks, independent model visual QA, and human audit.
Prompt/asset hashes and the dark-to-light derivation-record hash are mandatory; a missing human
review is recorded honestly as `not_performed` or `not_recorded`, never inferred from model QA.
Publishing a new content-addressed ID relies on the D1 replacement triggers: the new pair becomes
the sole published primary and the former primary is retained as a non-primary draft.

`manifest-number-rule-repairs-v3.json` is deliberately scoped to the five pairs regenerated after
the numeric-transferability and diagram-label review. It excludes unchanged pairs and does not
claim candidate selection, structured model QA evidence, or human review that was not recorded.

`manifest-momentum-clarity-repair-v4.json` is a one-pair replacement for the rejected collision
visual. It removes the unexplained contribution bars, keeps both trolleys registered to one rail,
uses a continuous before/contact/after story, restores an ordered 1→4 scan path, and adds the
universal bridge `momentum = mass × velocity` alongside the governing reminder `total momentum
before = total momentum after`. Velocity arrows are labelled explicitly, the two trolleys sit inside
a visible closed-system enclosure, and contact is shown as directional transfer rather than a burst
that could imply creation. Its light variant is an edit of the accepted dark master, not an
independently generated alternative.
