# English Literature practice validation

Snapshot date: 2026-07-16

Scope: the production `QUESTION_DB` OCR GCSE English Literature J352 rows and the
current pre-release application code. This is a source, derivation, grounding and
route audit. It is not a claim that the required interactive model/browser replay
has been completed.

## Outcome

- Production contains 255 published, review-clean English Literature questions.
- Twelve representative questions are source-runnable across poetry comparison,
  extract plus wider text, whole-text judgement and single-text analysis.
- No production two-extract comparison is source-complete. Those tasks remain
  unavailable rather than being shown with a synopsis in place of the extracts.
- Only one representative runnable question currently has a genuine learner-facing
  model answer. Checklist-style model-answer placeholders and high-level response
  outlines are now hidden instead of being presented as model answers.
- The seeded Romeo and Juliet extract task has the complete printed Prologue, but
  its five marking rows use `guided-rubric` provenance rather than a raw page-level
  imported mark-scheme transcription. This remains a provenance gap.
- The six June 2023 poetry source images returned HTTP 200 with `image/png` and were
  visually inspected as readable full question/poem pages.

“Runnable” below means that the deterministic source gate permits the practice
route and the task has reviewed mark rows/checklist rows. It does not mean the
interactive grading matrix has passed.

## Production matrix

| Question                               | Task shape                 | Learner-visible source                                            | Source/route status           | Mark evidence                                              | Learner model answer                                          |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `ocr-j352-02-jun23-01-1a`              | Poetry comparison          | Two required, reviewed source pages: `page-04.png`, `page-05.png` | Runnable                      | 2 mark rows, 2 checklist rows; official MS page refs       | Hidden: stored row is an answer outline, not a model response |
| `ocr-j352-02-jun23-02-1a`              | Poetry comparison          | Two required, reviewed source pages: `page-06.png`, `page-07.png` | Runnable                      | 2 mark rows, 2 checklist rows; official MS page refs       | Hidden: stored row is an answer outline                       |
| `ocr-j352-02-jun23-03-1a`              | Poetry comparison          | Two required, reviewed source pages: `page-08.png`, `page-09.png` | Runnable                      | 2 mark rows, 2 checklist rows; official MS page refs       | Hidden: stored row is an answer outline                       |
| `english-lit-romeo-juliet-fate-guided` | Extract plus wider play    | Complete 14-line, 631-character Prologue in visible context       | Runnable, with provenance gap | 5 mark rows and 5 checklist rows; rows say `guided-rubric` | Genuine full response                                         |
| `ocr-j352-01-jun24-08-1`               | Whole-text judgement       | No printed source required                                        | Runnable                      | 3 mark rows, 3 checklist rows; `MS pp.32,35`               | Hidden: “no single fixed model answer” placeholder            |
| `ocr-j352-01-jun24-10-1`               | Whole-text judgement       | No printed source required                                        | Runnable                      | 3 mark rows, 3 checklist rows; `MS pp.32,37`               | Hidden: placeholder                                           |
| `ocr-j352-02-jun24-05-0`               | Whole-play judgement       | No printed source required                                        | Runnable                      | 6 mark rows, 4 checklist rows; official page refs          | Hidden: answer outline                                        |
| `ocr-j352-02-jun24-09-0`               | Whole-play judgement       | No printed source required                                        | Runnable                      | 7 mark rows, 4 checklist rows; official page refs          | Hidden: answer outline                                        |
| `ocr-j352-01-jun24-03-1b`              | Single-text analysis       | Learner supplies another studied-text moment                      | Runnable                      | 2 mark rows, 3 checklist rows; `MS p.27`                   | Hidden: placeholder                                           |
| `ocr-j352-01-jun24-04-1b`              | Single-text analysis       | Learner supplies another studied-text moment                      | Runnable                      | 2 mark rows, 3 checklist rows; `MS p.28`                   | Hidden: placeholder                                           |
| `ocr-j352-02-jun24-02-1b`              | Single anthology poem      | Learner selects another studied anthology poem                    | Runnable                      | 5 mark rows, 3 checklist rows; official pages 19 and 21    | Hidden: answer outline                                        |
| `ocr-j352-02-jun24-07-0`               | Single whole-play analysis | No printed source required                                        | Runnable                      | 6 mark rows, 5 checklist rows; official page refs          | Hidden: answer outline                                        |
| `ocr-j352-01-jun24-02-1a`              | Two-extract comparison     | Only a 320-character source synopsis; no asset or overlay         | Blocked as intended           | 3 mark rows, 3 checklist rows                              | Not relevant while source is blocked                          |
| `ocr-j352-01-jun24-04-1a`              | Two-extract comparison     | Only a 158-character source synopsis; no asset or overlay         | Blocked as intended           | 2 mark rows, 3 checklist rows                              | Not relevant while source is blocked                          |
| `ocr-j352-01-jun24-07-1`               | Extract plus wider novel   | Only “Pip is visiting Satis House” summary; no extract            | Blocked as intended           | 3 mark rows, 3 checklist rows                              | Not relevant while source is blocked                          |
| `ocr-j352-02-jun24-08-0`               | Extract plus wider play    | Only “extract-based Macbeth option” summary; no extract           | Blocked as intended           | 7 mark rows, 5 checklist rows                              | Not relevant while source is blocked                          |
| `ocr-j352-02-nov20-06-0`               | Extract plus wider play    | Copyright-placeholder image and summary only                      | Blocked as intended           | 6 mark rows, 5 checklist rows                              | No reviewed model row                                         |

The blocked rows prove why a mark scheme, synopsis or model answer must never be
treated as a substitute for the learner-visible printed source.

## Deterministic source contract

The practice eligibility gate now mirrors `ExamQuestionCard` and
`BlockRenderer`:

- If no rendering overlay exists, reviewed context and standalone assets are
  learner-visible.
- If any stem/prompt overlay block exists, plain context and standalone assets are
  hidden by the renderer. Only text in supported rendered block kinds and assets
  referenced by an exact `figure.assetId` count.
- Unsupported pseudo-blocks such as `source`, `extract`, `passage`, `poem` and
  `blockquote` do not count because the current renderer does not display them.
- A long one-paragraph synopsis does not count as an extract. Unquoted imported
  source text must be at least 600 characters over at least four non-empty lines.
- Every exact `required_asset_labels` entry must match a learner-visible, usable
  asset. A placeholder, copyright notice or source-defect observation never counts.
- A task clearly saying `these`, `two` or `both` poems/extracts requires two printed
  sources. One declared page cannot unlock it.
- A poetry comparison saying `and in one other poem` or `another poem from` the
  anthology/cluster requires one printed poem; the comparison poem is studied
  recall. Poetry comparisons that do not reveal their printed-source shape fail
  closed unless `required_source_count` metadata resolves it.
- If one image genuinely contains multiple printed sources, imports must supply
  `required_source_count` plus `complete_source_bundle: true`; the independent
  review must verify that all sources are present, identifiable and ordered.
- “Starting with this moment/passage/scene…” and Act/Scene/Chapter plus `elsewhere`
  wording are source-dependent even when the noun `extract` is absent.
- “Explore another moment…” remains a source-independent studied-text task.

Queued J352 imports must provide accurate `requires_context`/`requires_assets`,
`required_source_count`, exact ordered source labels, reviewed `question_assets`
with R2/public paths, and learner-visible render references. Two-extract tasks must
contain both complete extracts. Extract-plus-wider tasks must contain the complete
printed extract; the wider-text portion remains learner recall.

## Task derivation and teaching audit

The current classifier and stage builders distinguish all required task shapes:

- poetry and extract comparison: Task → paired Evidence → Methods → Develop → Essay;
- extract plus wider text: Task → Extract → Method → Elsewhere → Essay;
- whole-text judgement: Task → Moment 1 → Method → Moment 2 → Essay;
- single-text analysis: Task → Evidence → Method → Develop → Essay.

Goals, hints and independent success criteria are task-specific. The grading parser
requires every criterion configured for the active step before it can pass. The
grading prompt requires feedback to cite the learner's actual words, isolate the
missing move, acknowledge a repaired weakness, avoid moving the goalposts, treat
indicative content as examples, and never invent or silently correct quotations.

Raw `mark_scheme_items` are sent with item type and source reference. Examiner
report guidance is only sent when reviewed overlay metadata contains it; the other
questions honestly send none. No examiner commentary is synthesized.

The UI locks later stages, keeps passed stages reviewable, invalidates downstream
passes after editing an earlier answer, and supports reset. The ordinary practice
URL redirects to the first `task` stage. Paste/drop assistance is recorded and
guided evidence is always marked non-independent. A duplicated paste/drop notice
was removed.

## Verification performed

- Focused Vitest coverage includes exact required-label completeness, one-of-two
  missing, one printed plus one studied poem, ambiguous comparison fail-closed,
  overlay-hidden context/assets, exact figure references, unsupported block kinds,
  long synopsis rejection, source-wording variants and task classification.
- Local route checks on port 5197:
  - seeded extract practice: 307 to `/step-by-step/task`, then 200; the full Prologue
    and extract-specific scaffold were present;
  - June 2023 poetry comparison: 307 to `/step-by-step/task`, then 200; both source
    image paths and the comparison scaffold were present;
  - whole-text judgement and single-text analysis: 307 to the task stage, then 200;
  - missing two-extract task: 303 back to the question page with the exact
    source-unavailable reason.

## Still required before release sign-off

After the queued J352 source imports finish, repeat the real-browser teaching
validation required by `AGENTS.md`:

1. Use at least ten source-complete questions spanning all five task shapes,
   including at least two real two-extract comparisons.
2. Submit blank/irrelevant, plausible-but-vague, partially successful,
   feedback-driven retry and secure responses.
3. Replay representative cases four times with small wording changes and compare
   the missing skill, threshold and next action.
4. Check every success criterion independently against exact learner text and raw
   mark-scheme rows.
5. Exercise lock, retry, passed-stage review, reset and direct-route behaviour in
   the browser.
6. Inspect desktop and mobile layouts, source readability, clipping, overflow and
   theme contrast.
7. Replace the hidden outline/placeholder rows with reviewed, question-specific
   model answers where a learner-facing model answer is promised.
8. Replace the seeded `guided-rubric` rows with raw imported OCR mark-scheme rows or
   record a reviewed provenance link proving equivalence.

No runtime grading-model calls were made during this audit, so pedagogical
consistency remains an explicit root release task rather than an inferred pass.
