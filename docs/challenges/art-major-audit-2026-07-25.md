# Science challenge art major-error audit — 2026-07-25

## Scope and decision rule

This audit covers:

- all 32 retained authored primary light/dark pairs;
- all 63 light/dark pairs currently present in `science-179-v1` generation output;
- all 239 selected `science-179-v1` question-art briefs.

The learner-facing question is authoritative. A pair is a **major fresh-regeneration target**
only when it is clearly for the wrong question or material, visibly uses conflicting notation,
shows a scientifically false state, or directly supplies the requested result. Minor cosmetic,
generic or nonessential imperfections are retained with an annotation. A failed pair is never
edited or inpainted; its replacement starts with a brand-new dark generation.

The external model reviewer was not run because the local sandbox approval correctly blocked
uploading unpublished questions and images without separate user approval. The inspection here is
local: deterministic question/brief checks, full-resolution visual inspection, and dark/light
composition comparison.

Fresh-generation manifests were frozen for the nine major targets. The v1 cohort produced no image
bytes and consumed its four attempt slots on immediate sandbox `fetch failed` errors; preserve those
failure records. The v2 manifest was frozen, but its external process was denied before it started,
so it has no generation lineage. After explicit disclosure approval, v2 may be used with the
updated run-level image-service stop, which records current in-flight failures without consuming
the remaining composition budget.

- `science-authored-static-major-repair-20260725-v1` manifest:
  `a38f2ea6de76698b42308534109b28c09c3f4b3d8a11f36787cbc303a185b957`
- `science-authored-static-major-repair-20260725-v2` manifest:
  `234b026b6f463f55bcaa7464c15fbed1bb27ebfdcc7980033bd38a54b5684621`

## Major retained-art failures to regenerate

| Challenge                        | Major defect                                                                                                              | Fresh replacement requirement                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `biology-recessive-inheritance`  | Learner question uses `R/r`; both images show a completed `Aa × Aa` square.                                               | Blank `Rr × Rr` Punnett structure with exact `R` and `r` gamete labels and no completed offspring cells or probability. |
| `chemistry-alloy-hardness`       | The aluminium-alloy task is illustrated with conspicuously copper/brass-coloured blocks.                                  | Two silver-grey aluminium samples and an unused hardness tester; no hardness result or atom-layer answer.               |
| `chemistry-ionic-bonding`        | The image completes the electron transfer, displays charged ions and therefore supplies the explanation.                  | Separate neutral sodium and chlorine atom models before transfer; no charge signs, arrow or product lattice.            |
| `chemistry-molten-electrolysis`  | The image visibly supplies electrode polarity and the metal/gas products requested by the task.                           | Active closed-circuit molten-lead-bromide apparatus at onset; no polarity text, deposit, bubbles or product.            |
| `chemistry-exothermic-energy`    | A before/after arrow, rising thermometer and outward energy arrows directly reveal the requested conclusion.              | Separate reactants, insulated cup and baseline thermometer before mixing; no result panel or energy arrows.             |
| `chemistry-flame-tests`          | The three finished flame colours include the lilac potassium result and reveal the observation.                           | Clean loop, unlabelled sample and unlit burner before testing; no flame colour or result.                               |
| `chemistry-equilibrium-pressure` | The challenge is mapped to a generic raw-material/life-cycle industry image unrelated to equilibrium pressure.            | Sealed ammonia-synthesis pressure vessel and compressor before any yield comparison; no product amount or result.       |
| `physics-conductivity-rate`      | The picture is a metal pan with a plastic handle, not the stated metal inner liner, coolant wall and plastic outer shell. | Accurate cutaway bowl construction with those three layers and no heat-flow answer.                                     |
| `physics-motor-force`            | The pictured switch is open, contradicting the question’s current-carrying wire.                                          | Exact powered wire segment perpendicular to opposite magnet poles in one closed series circuit; no force/field arrows.  |

## Retained annotations and text repairs

- `chemistry-stoichiometric-mass`: the prior alt text reversed decomposition into a synthesis
  supply direction. The text is corrected. The actual unlabelled apparatus does not establish a
  direction strongly enough to justify regeneration.
- `chemistry-constant-mass`: “damp precipitate” was inaccurate for the evaporated salt sample. The
  text is corrected; the separate dish, heater and balance remain usable.
- `biology-homeostasis-control`: the loop is answer-forward but scientifically coherent and
  unlabelled. Retain as an explanatory visual rather than treating it as a wrong diagram.
- `biology-cell-differences`: the models contain detailed structures but no labels or false
  comparison. Retain.
- `biology-recessive-flower-inheritance`: the generated pair uses unlabelled chromosome-colour
  props but no conflicting allele letters and shows no offspring outcome. Retain.
- `biology-hormones-in-human-reproduction-01`, `biology-producing-monoclonal-antibodies-01` and
  other generic contextual still lifes are not ideal depictions, but they do not teach a wrong fact
  or expose the answer. Retain.

## Generated cohort result

The 239 selected briefs pass the deterministic learner-question authority check after the validator
repair. The 63 currently present generated pairs preserve the same geometry across light and dark
themes, and local inspection found no obvious major question/notation contradiction. These bytes
still require the ordinary complete release review once external review is explicitly authorised;
they must not be described as independently accepted on the strength of this local audit alone.
