# Extraction Specification

This document defines what scripts should recover from exam-paper and mark-scheme files, how those objects map to Question Constellation product concepts, and how they should be stored in a Cloudflare D1 database.

The existing product docs explain the human-facing product direction. This document is stricter: it is the contract for paper import, mark-scheme alignment, answer-chain derivation, review flags, and storage.

## Pipeline Phases

The production import is a two-phase pipeline:

1. **PDF-to-question extraction** turns question papers, mark schemes, and optional supporting
   documents into source-grounded, renderable, gradable question JSON. This phase owns page images,
   parent context, response controls, required assets, mark-scheme evidence, checklists, answer keys,
   model answers, provenance, and extraction review flags. It must not spend time deriving reusable
   answer-chain groups.
2. **Answer-chain grouping/reconciliation** is a separate text-only phase over already extracted
   question data plus existing chain context. It decides whether questions reuse, update, or create
   answer chains and constellations. It can batch many extracted questions together because it no
   longer needs page images or PDF rendering.

## LLM Extraction Prompt

Use this section as the top-level prompt when an LLM extraction script or review agent extracts
questions from papers and mark schemes.

Use this document as the contract for output shape, provenance, confidence, review flags, and D1/SQLite storage. Do not treat it as a request for keyword classification.

The core task for PDF-to-question extraction is faithful source recovery. For each atomic question,
recover the learner-visible prompt, required parent context, response controls, required images or
tables, positive mark-scheme evidence, checklist items, answer key or model answer, provenance,
confidence, and review flags. Do not generate reusable answer chains in this phase; use placeholder
chain fields only when needed for schema compatibility.

The core task for the later chain phase is semantic answer-chain grouping. For each extracted atomic
question, read the extracted prompt and mark-scheme evidence together, then infer the ordered
reasoning links that actually earn marks. A topic label, specification reference, command word, mark
value, or repeated vocabulary is metadata only. These fields can help search, filtering, and audit,
but they are not the grouping method.

For each question, decide:

- What does a full-mark answer have to connect?
- Which ordered reasoning links are required by the mark scheme?
- Which mark-scheme items support each link?
- What would a plausible weak answer say, and which link would it miss?
- Is this actually an answer-chain question, or is it better classified as recall, calculation method, level descriptor, or no-chain candidate?

For each proposed chain or constellation, include:

- The chain title and canonical chain text.
- Ordered chain steps with step roles.
- Supporting mark-scheme evidence for each step.
- Member questions and their transfer distance.
- A concise fit rationale explaining why these questions share the same chain.
- Near-miss notes when similar-looking questions should not be grouped because the reasoning differs.
- Confidence and human-review flags.

Do not use these shortcuts as final grouping evidence:

- Shared keywords.
- Same topic or specification path.
- Same command word.
- Same mark value.
- Same paper or exam board.
- Embedding or text similarity without reasoning verification.

Two questions belong in the same constellation only if the same ordered chain of reasoning would score marks in both, and the same missing link would explain a weak answer in both. If that cannot be shown from the prompt and mark scheme, flag the case instead of forcing a group.

When priorities conflict, follow this order:

1. Preserve source evidence and provenance.
2. Make extracted questions renderable and gradable before deriving chains.
3. Infer semantic mark-scoring reasoning chains only in the text-only chain phase.
4. Use topic and keyword metadata only for search, filtering, and audit.
5. Flag uncertain cases instead of creating weak chains or weak constellations.

Output concise evidence rationales. Do not emit private reasoning traces; emit auditable claims tied to source text and mark-scheme items.

## Product Definitions

### Question Constellation

Question Constellation is a public GCSE question bank organized by reusable answer chains. The learner starts from a concrete exam question, sees the reasoning chain that earns marks, then practises nearby and transfer questions using the same chain.

The product is not a generic practice list. Its distinctive object is the answer chain: a reusable sequence of reasoning links that can appear across questions that look different on the surface.

### Answer Chain

An answer chain is the normalized reasoning sequence needed to produce a mark-scoring answer.

Example:

```text
blood flow -> oxygen -> respiration -> energy -> pain
```

An answer chain is not just a topic label. A topic says what content area is involved; an answer chain says what steps connect the prompt to the marks.

Good answer chains are:

- Specific enough that a student can repair a weak answer by adding missing links.
- General enough that several questions can share the chain.
- Supported by mark-scheme evidence.
- Written in plain student-facing language.
- Short enough to work as a memory handle: titles are usually 1-3 words, and canonical chain text
  is usually 2-5 tiny links joined by `->`, such as `low to high -> active transport -> energy needed`.

Bad answer chains are:

- Only a topic name, such as `respiration`.
- Too narrow, such as the exact wording of one prompt.
- Too broad, such as `cause and effect`.
- Invented without mark-scheme support.
- Paragraph-like explanations that belong in step explanations, not in the visible chain.

Every published marked question should have an answer-chain link so the product can organize
practice consistently. Pure recall, fixed-response, and single-step selection questions should use a
compact generic recall/discrimination chain, not a rich causal chain and not a new exact-answer fact
chain. If no reusable chain can be stated without copying the one-question answer, mark the question
`needs_human_review` and hold it out rather than inventing a brittle chain.

### Answer Chain Step

An answer-chain step is one ordered reasoning link. Each step should have:

- `step_text`: short student-facing wording.
- `step_role`: one of `given`, `cause`, `process`, `link`, `effect`, `evidence`, `method`, `calculation`, `conclusion`.
- `mark_support`: the mark-scheme item or items that support the step.
- `common_omission`: what a weak answer often skips.

### Constellation

A constellation is a curated set of questions that use the same answer chain.

The extraction agent may propose constellation memberships, but publication should depend on review confidence. A question can belong to more than one candidate chain, but only one should normally be primary for the first product surface.

Transfer labels:

- `start`: the clearest first question for the chain.
- `near`: same chain in a very similar context.
- `stretch`: same chain in a less obvious context.
- `exam_transfer`: harder or more exam-like transfer.
- `unclassified`: chain fit exists but distance is not yet decided.

### Mark Checklist

A mark checklist is a student-facing version of the mark scheme. It should translate marking points into atomic requirements without losing the source meaning.

Each checklist item must link back to one or more mark-scheme items where possible.

### Retained Chain Review

The current product does not expose the old `/thinking-memory` route. A future retained-chain review surface may use answer chains the learner has earned through practice, but extraction agents should only create the public chain, question, checklist, and constellation objects.

## Extraction Inputs

The agent may receive:

- Question papers.
- Mark schemes.
- Examiner reports.
- Inserts, diagrams, data sheets, or source booklets.
- Topic tests or school-created files when source metadata is available.

Question papers and mark schemes should be paired by board, qualification, subject, tier, paper/component, and series. If pairing is uncertain, keep both documents but mark the extraction run as needing review.

## What To Extract

### From Each Source Document

Extract:

- Document type: `question_paper`, `mark_scheme`, `examiner_report`, `insert`, `topic_test`, or `other`.
- Board, qualification, subject, tier, paper, component code, series, and year if present.
- Source URL or local file path.
- File hash.
- Page count.
- Any document-level notes that affect extraction, such as modified print, specimen paper, or missing pages.

### From Question Papers

Extract every question and subquestion that can be practised independently.

For each question or subquestion, extract:

- Source question reference, such as `01.2`.
- Parent reference if it is part of a multipart question.
- Display order.
- Prompt text.
- Self-contained prompt text: the practice-ready formulation with any required parent stem,
  scenario, method, source text, or figure/table reference carried forward.
- Question-card title: a deliberately written standalone label under
  `concept-method-process-v2`. It must name the distinctive concept, method, relationship, or
  process in 3-9 words and no more than 64 characters. Read the complete atomic task before its
  mark boundary and synthesize the label; never take the first N words, copy the task with only its
  command opener removed, start with an exam command or `How`/`Why`/`What`, let a secondary
  `give`/`use`/`tick` instruction override the main task, or reveal an outcome found only in the
  mark scheme. Persist the accepted value as `metadata_json.card_title`, with
  `card_title_contract` and provenance alongside it.
- Self-containment metadata: whether the printed atomic prompt is already self-contained, requires
  prior context, requires assets, or requires both.
- For English Literature tasks with a printed extract, poem, or source pair, use
  `selfContainment.status: "source_complete"` only when every required official source is complete
  and learner-visible before the marked prompt. Persist the exact required asset labels and source
  count; a partial, hidden, placeholder, copyright-flagged, or review-flagged source must not carry
  `source_complete` and remains blocked from guided practice.
- Command word, such as `explain`, `describe`, `calculate`, `evaluate`, or `state`.
- Mark value.
- Answer lines or expected response format when visible.
- Render-ready question body blocks for exam-sheet display when available. Text inside blocks may
  use plain Markdown bold (`**text**`) for source boldface and inline TeX math delimited with
  `$...$`; do not store formatting as character-offset ranges.
- Board, qualification, subject, tier, paper, and series inherited from the source.
- Topic path if stated or confidently inferable.
- Specification reference if stated or confidently inferable.
- Page number range.
- Required diagrams, tables, graphs, equations, images, or source text.
- Asset dependencies, including source label, role, local file path, public path or storage key,
  extraction confidence, and whether the mapping needs human review.
- Interactive response structure when visible, such as answer-line counts, tick-one/tick-many
  choices, matching columns, fill-in blanks, graph/image canvases, image label zones, and table
  answer layouts. Store these as explicit objects with provenance, not as inferred text snippets.
- Any visible constraints, such as `use Figure 2`, `give your answer to 2 significant figures`, or `do not refer to...`.

Answer-line counts are a renderability aid, not the learning objective. Keep short response spaces
strict: 1-5 visible lines should match exactly, and 6-10 visible lines should normally be within one
line. For long written-response areas above 10 lines, allow a wider tolerance of about 20% and treat
plausible over/under counts as warnings, not import blockers, when the extracted response surface is
clearly substantial and not collapsed. Fail long-response line counts only when the answer area is
missing, unusably small, mapped to the wrong question, or implausibly far from the printed response
space. Do not spend Codex time counting every ruled line on multi-page History/essay responses when
the learner can resize or type a long answer in the app.

Do not merge marked subparts into one practice question unless the mark scheme treats them as one answer. For example, `01.1`, `01.2`, and `01.3` should normally become separate question rows under the same parent.

### From Mark Schemes

For each question or subquestion, extract:

- Marking points.
- Alternative acceptable answers.
- `allow`, `accept`, `ignore`, `reject`, and `do not accept` guidance.
- Additional guidance or examiner notes.
- Level descriptors and bands.
- Official indicative-content rows, stored as positive optional evidence with
  `itemType: "indicative_content"` rather than generic `guidance`; their checklist examples remain
  `required: false` because no learner must reproduce every listed example.
- Required units, rounding, significant figures, formulae, or workings.
- Answer variants for higher/foundation tiers if shown.
- Assessment objective or specification references if present.

Preserve distinction between positive marking points and negative guidance. A `reject` item is not a checklist item, but it can become a warning or common weak answer rule.

### From Examiner Reports

When examiner reports or mark/commentary reports are available, use them as secondary evidence for
student-facing traps and grading guidance. They should inform `common_weak_answers.explanation`,
hint wording, and warning-style feedback, especially where examiners describe recurring
misreadings, missing evaluation, weak use of sources, or common calculation/setup errors. Do not use
examiner-report comments as replacement positive marking points; credit still comes from the mark
scheme. Preserve report provenance in review notes or evidence metadata where possible.

### Derived Objects

After source extraction, derive:

- Mark checklist items.
- Model answer.
- Answer-chain candidate.
- Common weak answer.
- Missing links.
- Constellation candidate memberships.
- Review flags and confidence scores.

Derived objects must keep source provenance. If the agent generates a model answer or chain wording, it must record which mark-scheme items support it and whether human review is required.

## Extraction Rules

### Question Segmentation

Use the smallest independently marked unit as the main `question` row. Parent question rows are allowed for grouping, but public practice should normally use the atomic marked row.

Keep original question references exactly as printed. Also create a stable slug later from normalized metadata and reference, but never replace the source reference.

### Mark-Scheme Alignment

Every mark-scheme item should be linked to a question. If a mark-scheme row covers multiple acceptable routes, split it into separate items only when the alternatives are semantically distinct.

Each mark checklist item should link back to the source mark-scheme item IDs. If a checklist item is inferred from a level descriptor rather than a direct marking point, mark its confidence lower and set `needs_human_review`.

### Answer-Chain Derivation

Build an answer chain when a question requires connected reasoning.

Recommended process:

1. Identify the command word and mark value.
2. Read the prompt and mark-scheme items together.
3. Extract the minimal reasoning sequence required to earn the marks.
4. Remove prompt-specific surface wording while preserving scientific or mathematical meaning.
5. Label the role of each step.
6. Link each step to mark-scheme evidence.
7. Compare against existing chains before creating a new one.
8. If the chain fit is uncertain, create a draft candidate and flag for review.

Do not use the subject topic tree as the main chain. The topic path remains metadata; the chain is the reasoning structure.

The student-visible chain must be compact. Write `title` as a 1-3 word label unless a longer title is
absolutely necessary. Write `canonical_chain_text` / `canonicalChainText` as 2-5 short links joined
by `->`. Each link should normally be 1-4 words. Keep step labels similarly short; one simple emoji
per step is allowed if it helps memory, but is optional. `summary` should be a short memory cue or
usage note, not a sentence-length repeat of the chain. Put teaching explanation in `explanation`,
`common_omission`, checklist items, or model answers. For example:

```text
low to high -> active transport -> energy needed
change -> original -> times 100
reagent -> treatment -> colour
```

Do not create a new chain merely because the paper, organism, substance, command word, or source data
format differs. First compare the ordered mark-scoring links with existing chains. Recurring method
chains such as graph plotting, percentage change, clinical trials, food tests, cell cycle, diffusion
or active transport, controlled variables, and practical validity should normally reuse or update an
existing chain when the same links earn the marks.

Every `common_weak_answers` entry should include `missingStepIndexes` in extracted JSON, even when
the best value is `[]`. The D1 importer normalizes missing values to `[]`, but production Codex chain
runs should emit the array explicitly so validation can distinguish "no identifiable missing step"
from an accidentally incomplete weak-answer object.

### Numeric Specificity Guardrail

An answer chain is a reusable reasoning or method pattern. It must not become a worked solution to
one question.

For calculation questions, keep prompt-specific arithmetic in the model answer, mark checklist, and
mark-scheme evidence. Do not put given values, substitutions, intermediate values, final numeric
answers, or one-question units inside `canonical_chain_text`, `summary`, `step_text`,
`explanation`, or `common_omission`.

The stable `answerChain.id` is machine metadata rather than learner-visible chain text. A newly
created ID may include the source-document slug and source question reference for collision safety;
numeric-specificity validation must not mistake those identity segments for worked-answer content.

Bad chain step text:

```text
Substitute k=8500 and e=0.012 to get E_e=0.5 x 8500 x 0.012^2.
Calculate E_e=0.612.
```

Good chain step text:

```text
Convert the extension or compression into metres.
Substitute the known values into E_e = 1/2 ke^2.
Calculate the elastic potential energy and give the correct unit.
```

Formula constants such as the `1/2` in `E_e = 1/2 ke^2` are allowed. The problem is the one-question
numeric substitution, not the formula.

For extraction and repair scripts, run the answer-chain specificity audit before importing:

```sh
pnpm run audit:answer-chain-specificity -- --fail-on-blocking
```

If the audit flags a chain, repair the chain text with the LLM repair command, then re-run the audit:

```sh
pnpm run repair:answer-chain-specificity -- \
  --input-root=data/vision-extracted \
  --write \
  --model=chatgpt-gpt-5.5 --thinking-level=xhigh \
  --concurrency=4 \
  --fail-on-blocking

pnpm run audit:answer-chain-specificity -- --fail-on-blocking
```

The repair command should rewrite only answer-chain fields unless a checklist/model-answer value is
clearly missing from the mark scheme. Do not delete the numeric model answer or checklist evidence;
those fields are supposed to stay source-specific.
Pure PDF extraction outputs may contain schema-compatibility placeholder chains with no chain id; the
repair command skips those placeholders by default because chain creation belongs to the separate
text-only grouping/reconciliation phase.
For existing exported JSON, leave `--max-existing-chains` at its default of `0`; the current chain id
and text are already in each repair task, and sending the whole compatibility context makes the repair
loop much slower and more expensive. Use a positive `--max-existing-chains` only when repairing a new
extraction that genuinely needs cross-paper chain compatibility hints.

The audit scans all exported extraction JSON under `data/vision-extracted` by default, plus legacy
semantic-chain candidate files under `data/extracted-questions`. To inspect already-imported D1
content, run:

```sh
pnpm run audit:answer-chain-specificity -- --d1 --no-json --no-semantic --output=tmp/d1-answer-chain-specificity-audit.json
```

If imported chains contain prompt-specific numeric solution text, do not try to hide the problem in
UI code or by deleting source evidence. First repair the source JSON and re-import. If repair cannot
complete immediately, mark those D1 chains and memberships as review-only as a quarantine step, then
repair or re-import from a clean import-ready subset:

```sh
pnpm run audit:answer-chain-specificity -- --d1 --no-json --no-semantic --mark-review
```

Review-marked chains must not be shown on public chain, constellation, or practice surfaces. They are
data repair work items, not a completed extraction outcome.

### Scripted Pipeline, Golden Checks, And Independent Review

Extraction quality should be checked in three layers:

1. Deterministic golden checks and audits.
2. An LLM integration eval that runs the extraction pipeline against a small source fixture and
   judges the output.
3. An independent reviewer pass that did not generate the extraction.

The reusable extraction entry points are scripts and library functions, not a Codex skill:

```text
scripts/lib/llm-extraction-pipeline.mjs
scripts/extract-paper-llm.mjs
scripts/eval-extraction-pipeline-llm.mjs
```

The legacy `@ljoukov/llm` CLI accepts PDFs and writes extracted JSON:

```sh
node scripts/extract-paper-llm.mjs \
  --question-paper=<question-paper.pdf> \
  --mark-scheme=<mark-scheme.pdf> \
  --source-document-id=<stable-source-id> \
  --supporting-document=<examiner-report-or-insert.pdf> \
  --existing-chains=<existing-chain-context.json-or-md> \
  --output=<candidate.json> \
  --write-eval=<evaluation.json>
```

For production imports, use the Codex orchestrator. It runs official-PDF extraction, optional
existing-chain context build, Codex answer-chain reconciliation, strict import-ready subset audit,
Codex SDK learner-facing solvability review, D1 replacement safety check, and D1 import dry-run or
explicit write:

```sh
pnpm run extract:production -- \
  --question-paper=data/aqa-separate-science-higher/question-papers/AQA-84611H-QP-NOV20.PDF \
  --mark-scheme=data/aqa-separate-science-higher/mark-schemes/AQA-84611H-W-MS-NOV20.PDF \
  --source-document-id=aqa-84611h-qp-nov20 \
  --subject=Biology \
  --subject-area=Biology \
  --paper-label="Biology Paper 1" \
  --component-code=84611H \
  --series="November 2020" \
  --year=2020 \
  --existing-chain-input-root=tmp/import-ready-extracted/aqa-separate-science-higher \
  --model=gpt-5.6-sol \
  --extraction-thinking-level=max \
  --chain-thinking-level=max
```

Production Codex imports use the non-fast GPT-5.6 Sol model with `max` reasoning. Keep the fast
variant for latency-sensitive interactive product flows; do not use it for offline paper imports.

The orchestrator writes a summary under
`tmp/codex-production-import/<source-document-id>/codex-production-import-summary.json`. It defaults
to an import dry-run and a read-only D1 replacement/conflict check; add `--import` only after
reviewing the summary, strict audit, solvability results, and D1 replacement plan. Use
`--run-legacy-solvability` only when intentionally running the older API-key-backed judge for a
diagnostic comparison. Use `--skip-d1-conflict-check` only for local debugging because the D1
replacement plan is the safe-replacement gate.

To run the Codex SDK solvability gate directly against an import-ready artifact:

```sh
pnpm run codex:solvability-judge -- \
  --input=tmp/codex-production-import/<source-document-id>/import-ready/<source-document-id>.json \
  --source-document-id=<source-document-id> \
  --model=gpt-5.6-sol \
  --thinking-level=max
```

For AQA GCSE Computer Science, Geography, and History imports, first build the paper manifest from
official AQA assessment-resource records plus any configured GCSE paper index used for PDF discovery:

```sh
pnpm run download:aqa-indexed-subject-papers -- \
  --computer-science-index-url=<source-url> \
  --geography-index-url=<source-url> \
  --history-index-url=<source-url> \
  --concurrency=8
```

An external GCSE paper index is a discovery pointer source, not the import authority. Prefer records
discovered from AQA assessment-resource pages when present
(`source_role: official_aqa_assessment_resource`). Use externally discovered PDF URLs only as public
PDF pointers for rows or supporting documents that are not matched by AQA assessment-resource
metadata (`source_role: discovery_index_pdf_pointer`). Do not infer authority from the CDN hostname
alone; keep `source_page_url`, `discovered_via`, hashes, and local PDF metadata in the manifest.

Then run whole-paper Codex production imports from that manifest:

```sh
pnpm run codex:production-import:batch -- \
  --all \
  --manifest=data/aqa-gcse-history-geography-computer-science/manifest.json \
  --data-root=data/aqa-gcse-history-geography-computer-science \
  --work-root=tmp/codex-humanities-production-import \
  --summary=tmp/codex-humanities-production-import/summary.json \
  --d1-existing-chains \
  --skip-imported \
  --existing-chain-max-examples=4 \
  --existing-chain-max-mark-items=4 \
  --model=gpt-5.6-sol \
  --concurrency=8 \
  --solvability-concurrency=2 \
  --paper-attempts=2
```

Use `--d1-existing-chains` for production batches unless intentionally running an isolation
benchmark. The batch runner builds one D1 context file per selected subject with
`scripts/build-existing-chain-context.mjs --d1` and forwards the subject-specific file as
`--existing-chains` to each paper pipeline. Without this flag, each paper can pass extraction and
import while still inventing new single-paper chains. For large same-subject batches, prefer waves:
run a wave with `--d1-existing-chains`, import only passed papers, rebuild D1 context, then run the
next wave so later papers can reuse chains created by earlier waves. A future cohort-level chain
consolidation pass may still be needed for high-quality cross-paper chain reuse.

Use `--skip-imported` when resuming a batch against live D1. The batch runner checks existing
`questions.source_document_id` values through the Cloudflare REST fallback and omits manifest rows
that are already present, while still building D1 chain context from the current published data.
When every selected row is already imported, the runner exits successfully with an empty `planned`
list instead of treating the no-op as a failure.

Use `--allow-unpublishable-source-drops` only when an official PDF explicitly withholds a learner
source, such as a copyright-restricted figure, and no official supporting PDF or mark-scheme/report
evidence can produce a learner-safe substitute. This flag is deliberately narrower than
`--allow-dropped-questions`: the extraction stage may drop only rows whose deterministic failure is
`known_unresolved_copyright_source`, records the dropped refs in
`extractionRun.droppedUnpublishableSourceQuestionRefs`, and then revalidates the cleaned extraction.
Unexpected review flags, asset errors, answer-key defects, or chain/import warnings must still fail.
The extraction summary records the pre-drop and retained artifact hashes, question/mark totals,
each dropped ref/mark/reason, and explicit count/mark/reason conservation invariants. A later
import-ready pass must still report zero additional dropped questions; this extraction-level contract
is the only permitted omission.
For OCR J351 June 2024 specifically, the public inserts remove some complete reading passages. Only
the exact J351/01 and J351/02 source ids may use the corresponding hold-out rule, and only when the
row is source-dependent, explicitly `source_missing` or `source_incomplete`, explicitly documents
the blocked/removed source, and remains `needsHumanReview=true`; an ordinary review is not droppable.
Before any such hold-out, `scripts/lib/ocr-j351-june-2024-inventory.mjs` locks the original normalized
bank inventory exactly. J351/01 must contain `01.1a=1`, `01.1b=1`, `01.1c=2`, `02.0=6`, `03.0=12`,
`04.0=18`, `05.0=40`, and `06.0=40` (8 rows, 120 marks); J351/02 must contain `01.1a=3`,
`01.1b=1`, `02.1=6`, `03.1=12`, `04.1=18`, `05.1=40`, and `06.1=40` (7 rows, 120 marks).
The lock runs against the original artifact before subsetting, so a missing ordinary row, changed mark,
duplicate, unexpected ref, or order mutation fails. Generic original question/mark expectations are not
reapplied to the retained subset after the explicitly evidenced copyright rows are removed.
OCR J352/01 June 2024 has one equally narrow official-source hold-out. Public question-paper page 21
prints Q17 but explicitly says the Pearson A Christmas Carol extract was removed for third-party
copyright. Only exact ref `17.1` may be held out, and only when it remains a 40-mark source-dependent
row with `source_incomplete` or `source_missing`, one required A Christmas Carol source, no substitute
asset, explicit page-21 copyright-removal evidence, and both question/model-answer review flags. The
pre-subset inventory is locked to 24 rows / 720 marks in exact order: `01.1a` through `06.1b` at 20
marks each, then `07.1` through `18.1` at 40 marks each. The only permitted J352/01 subset is therefore
23 rows / 680 marks after dropping `17.1` (1 row / 40 marks); ordinary whole-text Q18 and every other
route remain mandatory. Fixed J352/01 topology independently requires complete source assets for the
six Section A part-(a) comparisons and odd Section B extract questions 7, 9, 11, 13, 15, and 17, so
deleting extractor source metadata cannot turn another source task into a whole-text question.
If Codex extraction already completed but the wrapper/importer logic changed, use
`--reuse-existing-extraction` against the same work root to reprocess the existing
`question-fragments/`, `normalized-extraction.json`, and `validation.json` without spending another
Codex extraction turn. Reuse refreshes the deterministic helper bundle before reprocessing, while
preserving the model observations and fragments. Downstream extraction judge, chain reconciliation,
solvability, and D1 gates still run normally.

When an independent extraction judge fails on a small, source-verifiable defect, preserve the failed
candidate, complete judge report, and judge summary before replacing the judge work directory. A
deterministic repair may then be supplied during reuse with `--reviewed-repair-evidence` for bounded
JSON-field changes, or `--reviewed-asset-repair-evidence` for a bounded official-PDF asset crop. The
evidence must bind the exact failed candidate/report and official PDFs, enumerate every changed path
or crop dimension, record a passing deterministic validation, and bind the exact repaired output.
Asset-repair evidence additionally binds the live repaired asset bytes in extraction phase outputs,
so a later resume fails closed if the image changes. A second repair stage must preserve and reference
the first evidence artifact rather than rewriting the earlier failed audit. These flags require
`--reuse-existing-extraction`; neither one is permission for an unbounded manual edit or a substitute
for a fresh independent judge pass.

For writes, the D1 update is incremental per paper. The pipeline does not stream in-progress data
into D1. A paper is written only after official-PDF source identity preflight, Codex PDF extraction,
independent extraction judge, Codex answer-chain reconciliation, R2 asset upload when assets are
referenced, strict import-ready audit, Codex solvability judge, D1 replacement/conflict check, and
the final `--import` gate all pass. Failed or in-progress papers remain under `tmp/` artifacts and
should not be visible in the app.

Source-component compatibility is fail-closed. Normalize punctuation and accept exact component
codes or a trailing alphabetic qualifier, but do not treat arbitrary numeric prefixes as the same
paper. The only family-level exception is AQA Combined Science `8464`: visible `8464/B`, `8464/C`,
or `8464/P` may match a manifest code for the same subject family with an explicit paper/tier suffix
such as `8464B1H`. The subject letter must agree, and one full paper/tier code must never match a
different paper/tier code. Record the applied compatibility rule in source-identity evidence; do
not use `--allow-visible-source-mismatch` for this case.

The downloaded manifest currently covers 100 whole-paper entries: 6 Computer Science, 15 Geography,
and 79 History papers, with 70 AQA examiner-report PDFs. Examiner reports are secondary evidence
only for common traps, weak-answer explanations, hints, and grading warnings; positive credit still
comes from the mark scheme.

Current AQA History/Geography/Computer Science D1 status, measured from remote D1 on 2026-07-06:

| Subject          | Manifest papers | D1 question-paper docs | D1 questions | D1 marks | Remaining manifest papers |
| ---------------- | --------------: | ---------------------: | -----------: | -------: | ------------------------: |
| Computer Science |               6 |                      6 |          228 |      520 |                         0 |
| Geography        |              15 |                     15 |          507 |     1437 |                         0 |
| History          |              79 |                     57 |          261 |     2360 |                        22 |

Geography 2022 Paper 2 imported successfully through the Codex SDK production path in
`tmp/codex-humanities-resume-v56/aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp`.
The importer held out Q03.1 only because the official question paper withholds Figure 10 for
third-party copyright and the mark scheme provides only the answer key, not learner-safe source
evidence. The publishable import has 45 questions and 124 marks. Extraction, independent extraction
judge, chain reconciliation, R2 upload, strict audit, Codex solvability, D1 write, and deployed route
crawl all passed. Do not fall back to `OPENAI_API_KEY` for these imports; the Codex SDK runner is
expected to use ChatGPT subscription auth.

History v31/v32 on 2026-07-06 is the current 2023 response-book repeatability case. The v31 batch
correctly stopped four papers before D1: 2023 Germany P1A B had line counts `18/20/47/21/47/72`
instead of `22/24/50/25/51/75`; 2023 Inter-war P1B B had `20/76/51/101` instead of
`22/76/51/102`; 2023 Gulf/Afghanistan P1B E had `20/75/49/99` instead of `22/76/51/102`; and
2023 First World War P1B A omitted the learner-visible Source C provenance caption. The extractor
prompt, helper validator, independent judge, and regression fixtures now encode these source-specific
expectations, including the First World War Source C caption: "A poster produced by the American
navy, in January 1917, to recruit sailors." The v32 rerun from the same official PDFs passed
extraction, independent extraction judge, chain reconciliation, solvability, strict audit, D1/R2
write, and deployed route crawls for all four papers. Artifacts are under
`tmp/codex-history-batch-v32/` and `tmp/public-route-checks/*-v32.json`.

Recent History reruns used the same official-PDF-to-D1 path with `--d1-existing-chains`,
independent extraction judging, Codex solvability, D1 conflict checks, and deployed route crawls:

| Paper                              |                                                                                         Extraction |                                                                                   Extraction judge |                                                                                        Chain run |                                                                                         Solvability | Import and route result                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------: | -----------------------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| History 2020 P1B A First World War | 455.930s; 54 commands; 0 failed; input 1,420,843; cached 1,155,072; output 18,764; reasoning 2,778 |      198.001s; 35 commands; 0 failed; input 542,606; cached 395,264; output 8,386; reasoning 1,558 |   233.120s; 28 commands; 1 failed; input 923,712; cached 771,584; output 10,623; reasoning 4,241 |        100.559s; 10 commands; 1 failed; input 185,051; cached 92,672; output 3,964; reasoning 1,541 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p1b-a-fww-after-import.json` passed 22/22 routes including 2 assets       |
| History 2020 P1B C East-West       | 359.474s; 46 commands; 0 failed; input 1,630,350; cached 1,394,688; output 16,437; reasoning 1,774 |   255.834s; 43 commands; 1 failed; input 1,138,099; cached 949,248; output 11,674; reasoning 3,532 |   234.071s; 24 commands; 1 failed; input 828,878; cached 752,640; output 11,792; reasoning 4,895 |        84.378s; 12 commands; 0 failed; input 192,561; cached 145,408; output 3,892; reasoning 1,305 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p1b-c-east-west-after-import.json` passed 20/20 routes                    |
| History 2020 P1B D Asia            | 386.555s; 61 commands; 0 failed; input 1,653,944; cached 1,461,248; output 18,790; reasoning 2,737 |      170.686s; 22 commands; 0 failed; input 541,613; cached 404,992; output 7,626; reasoning 2,110 |   229.075s; 23 commands; 1 failed; input 788,125; cached 714,240; output 10,386; reasoning 4,457 | rerun 119.506s; 19 commands; 2 failed; input 190,669; cached 143,360; output 5,495; reasoning 1,687 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p1b-d-asia-after-import.json` passed 20/20 routes                         |
| History 2020 P2A A Health          | 415.217s; 51 commands; 0 failed; input 1,370,248; cached 1,168,384; output 17,736; reasoning 1,309 |      145.878s; 20 commands; 1 failed; input 469,131; cached 351,744; output 6,124; reasoning 1,415 |   260.440s; 23 commands; 1 failed; input 702,798; cached 629,760; output 13,042; reasoning 6,325 |         113.015s; 18 commands; 1 failed; input 331,839; cached 231,936; output 4,912; reasoning 897 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2a-a-health-after-import.json` passed 21/21 routes including 1 asset     |
| History 2020 P2A B Power           | 560.914s; 50 commands; 0 failed; input 1,797,026; cached 1,600,512; output 18,420; reasoning 2,497 |      172.983s; 15 commands; 0 failed; input 569,240; cached 413,184; output 5,576; reasoning 1,126 |   253.248s; 29 commands; 0 failed; input 743,907; cached 677,376; output 12,397; reasoning 5,770 |      186.344s; 32 commands; 10 failed; input 332,199; cached 232,960; output 8,379; reasoning 1,580 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2a-b-power-after-import.json` passed 21/21 routes including 1 asset      |
| History 2020 P2A C Migration       | 427.088s; 55 commands; 3 failed; input 1,565,851; cached 1,311,232; output 19,166; reasoning 2,896 |      202.893s; 19 commands; 1 failed; input 869,368; cached 666,112; output 7,261; reasoning 1,459 |   200.713s; 18 commands; 0 failed; input 388,446; cached 311,296; output 10,218; reasoning 4,639 |       136.816s; 20 commands; 2 failed; input 229,239; cached 152,064; output 6,101; reasoning 1,948 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2a-c-migration-after-import.json` passed 21/21 routes including 1 asset  |
| History 2020 P2B A Norman England  | 418.460s; 41 commands; 0 failed; input 1,683,352; cached 1,538,048; output 20,108; reasoning 2,728 |      214.556s; 39 commands; 0 failed; input 785,664; cached 643,072; output 8,936; reasoning 1,580 |   247.682s; 24 commands; 1 failed; input 584,828; cached 505,344; output 12,548; reasoning 4,507 |       104.924s; 15 commands; 1 failed; input 237,646; cached 179,200; output 4,572; reasoning 1,357 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2b-a-norman-after-import.json` passed 20/20 routes                       |
| History 2020 P2B B Medieval        | 362.820s; 56 commands; 0 failed; input 1,368,946; cached 1,181,184; output 16,991; reasoning 3,084 |      163.963s; 22 commands; 0 failed; input 902,806; cached 701,952; output 6,438; reasoning 1,472 |   247.200s; 28 commands; 2 failed; input 896,924; cached 805,376; output 11,474; reasoning 4,452 |       121.355s; 14 commands; 1 failed; input 308,066; cached 258,048; output 5,108; reasoning 1,282 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2b-b-medieval-after-import.json` passed 20/20 routes                     |
| History 2020 P2B C Elizabethan     | 480.343s; 68 commands; 0 failed; input 1,976,642; cached 1,777,664; output 22,496; reasoning 3,401 |      182.461s; 35 commands; 0 failed; input 577,886; cached 487,936; output 7,895; reasoning 1,956 |    219.614s; 20 commands; 0 failed; input 729,341; cached 607,232; output 9,989; reasoning 4,308 |       123.778s; 26 commands; 1 failed; input 243,127; cached 187,392; output 5,650; reasoning 1,299 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2b-c-elizabethan-after-import.json` passed 20/20 routes                  |
| History 2020 P2B D Restoration     | 362.901s; 52 commands; 0 failed; input 1,408,949; cached 1,233,408; output 17,296; reasoning 2,150 |      120.281s; 23 commands; 0 failed; input 353,675; cached 278,016; output 5,154; reasoning 1,058 |   210.881s; 19 commands; 1 failed; input 613,623; cached 552,960; output 10,339; reasoning 3,954 |       122.377s; 19 commands; 4 failed; input 231,496; cached 185,856; output 5,205; reasoning 1,327 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2020-p2b-d-restoration-after-import.json` passed 20/20 routes                  |
| History 2021 P1A A America         | 377.754s; 53 commands; 0 failed; input 1,211,222; cached 1,069,056; output 18,859; reasoning 2,308 |      202.044s; 29 commands; 0 failed; input 793,661; cached 621,568; output 8,784; reasoning 2,575 |   276.969s; 22 commands; 3 failed; input 480,694; cached 389,120; output 14,293; reasoning 6,941 |       160.125s; 25 commands; 2 failed; input 267,292; cached 209,920; output 7,654; reasoning 2,448 | 6 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1a-a-america-after-import.json` passed 30/30 routes                      |
| History 2021 P1A B Germany         | 406.752s; 42 commands; 0 failed; input 1,432,953; cached 1,235,968; output 18,363; reasoning 1,866 |      154.245s; 21 commands; 1 failed; input 496,328; cached 347,136; output 6,610; reasoning 1,559 |   276.690s; 26 commands; 1 failed; input 672,542; cached 602,624; output 13,756; reasoning 6,186 |       137.917s; 23 commands; 3 failed; input 314,851; cached 251,392; output 6,417; reasoning 1,309 | 6 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1a-b-germany-after-import.json` passed 30/30 routes                      |
| History 2021 P1A C Russia          |   420.136s; 51 commands; 0 failed; input 1,174,612; cached 993,280; output 20,646; reasoning 2,361 |      173.337s; 31 commands; 1 failed; input 713,996; cached 574,976; output 7,770; reasoning 1,857 | 308.445s; 35 commands; 1 failed; input 1,067,863; cached 993,792; output 15,040; reasoning 6,669 |       132.365s; 23 commands; 2 failed; input 295,119; cached 257,536; output 5,651; reasoning 1,002 | 6 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1a-c-russia-after-import.json` passed 30/30 routes                       |
| History 2021 P1B B Inter-war Years | 474.789s; 41 commands; 0 failed; input 2,296,029; cached 1,982,976; output 19,486; reasoning 4,310 |      227.056s; 29 commands; 3 failed; input 927,799; cached 693,760; output 9,324; reasoning 3,027 | 294.059s; 27 commands; 0 failed; input 1,118,899; cached 945,664; output 14,100; reasoning 6,704 |         385.312s; 16 commands; 2 failed; input 211,833; cached 154,112; output 4,298; reasoning 712 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1b-b-inter-war-after-import.json` passed 20/20 routes                    |
| History 2021 P1A D America         | 449.833s; 52 commands; 0 failed; input 1,627,161; cached 1,448,960; output 20,880; reasoning 2,276 |     236.855s; 24 commands; 1 failed; input 709,775; cached 539,648; output 10,369; reasoning 4,979 |   283.831s; 28 commands; 0 failed; input 724,002; cached 628,736; output 13,930; reasoning 5,891 |       160.342s; 18 commands; 2 failed; input 333,999; cached 274,944; output 7,134; reasoning 2,799 | 6 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1a-d-america-1920-after-import.json` passed 30/30 routes                 |
| History 2021 P1B A First World War | 467.827s; 57 commands; 1 failed; input 1,767,117; cached 1,522,688; output 19,372; reasoning 2,930 |     232.786s; 34 commands; 1 failed; input 921,707; cached 790,016; output 10,480; reasoning 3,434 |   269.642s; 28 commands; 1 failed; input 977,633; cached 896,000; output 12,709; reasoning 5,751 |       184.458s; 22 commands; 3 failed; input 374,641; cached 306,176; output 6,228; reasoning 1,425 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1b-a-fww-after-import.json` passed 22/22 routes including 2 assets       |
| History 2021 P1B C East-West       | 810.032s; 65 commands; 1 failed; input 5,086,386; cached 4,459,008; output 23,773; reasoning 3,973 |      216.935s; 41 commands; 0 failed; input 940,932; cached 810,496; output 9,242; reasoning 2,172 | 259.965s; 32 commands; 0 failed; input 1,007,168; cached 919,040; output 12,043; reasoning 4,892 |       144.766s; 21 commands; 7 failed; input 230,587; cached 157,696; output 6,606; reasoning 1,543 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1b-c-east-west-after-import.json` passed 22/22 routes including 2 assets |
| History 2021 P1B D Asia            | 376.820s; 43 commands; 0 failed; input 1,445,142; cached 1,255,936; output 17,223; reasoning 2,535 |   228.867s; 44 commands; 5 failed; input 1,062,437; cached 936,960; output 10,148; reasoning 3,122 |   253.576s; 19 commands; 0 failed; input 563,478; cached 430,592; output 12,284; reasoning 6,419 |       131.831s; 20 commands; 4 failed; input 299,766; cached 257,024; output 5,383; reasoning 1,182 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p1b-d-asia-after-import.json` passed 20/20 routes                         |
| History 2021 P2A A Health          | 477.568s; 59 commands; 0 failed; input 1,647,510; cached 1,410,048; output 19,485; reasoning 3,518 |     306.145s; 30 commands; 4 failed; input 887,402; cached 772,608; output 11,220; reasoning 3,207 |   205.837s; 19 commands; 1 failed; input 429,106; cached 367,104; output 10,236; reasoning 3,813 |          77.810s; 11 commands; 2 failed; input 151,506; cached 109,056; output 3,385; reasoning 611 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p2a-a-health-after-import.json` passed 21/21 routes including 1 asset     |
| History 2021 P2A B Power           | 466.758s; 64 commands; 0 failed; input 1,758,292; cached 1,546,240; output 21,964; reasoning 4,512 |  241.991s; 37 commands; 0 failed; input 1,215,539; cached 1,059,328; output 9,949; reasoning 2,985 |   268.333s; 35 commands; 1 failed; input 821,485; cached 679,936; output 13,125; reasoning 5,345 |       127.618s; 16 commands; 1 failed; input 321,778; cached 262,144; output 5,491; reasoning 1,690 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p2a-b-power-after-import.json` passed 20/20 routes                        |
| History 2021 P2A C Migration first | 463.692s; 66 commands; 0 failed; input 1,955,610; cached 1,769,472; output 21,221; reasoning 3,616 | 295.219s; 55 commands; 5 failed; input 1,317,186; cached 1,105,920; output 12,759; reasoning 3,161 |                                                                                              n/a |                                                                                                 n/a | Blocked before D1 by independent judge: response lines were 46/49/48/91 instead of 47/48/47/97; guardrails added before rerun                            |
| History 2021 P2A C Migration rerun |     291.481s; 34 commands; 1 failed; input 865,297; cached 690,176; output 13,894; reasoning 1,283 |      156.080s; 21 commands; 0 failed; input 344,135; cached 216,576; output 5,163; reasoning 1,318 |   217.725s; 23 commands; 1 failed; input 888,137; cached 807,424; output 10,329; reasoning 3,232 |       144.349s; 18 commands; 0 failed; input 240,178; cached 209,920; output 5,354; reasoning 1,805 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p2a-c-migration-after-import.json` passed 20/20 routes                    |
| History 2021 P2B A Norman          | 419.050s; 50 commands; 0 failed; input 1,619,904; cached 1,346,560; output 19,520; reasoning 3,374 |      152.026s; 34 commands; 0 failed; input 591,039; cached 482,816; output 6,800; reasoning 1,250 |   267.166s; 29 commands; 1 failed; input 807,302; cached 558,592; output 13,667; reasoning 6,584 |         130.709s; 25 commands; 3 failed; input 346,422; cached 266,752; output 5,895; reasoning 772 | 4 kept, D1 write passed; route crawl `tmp/public-route-checks/aqa-history-2021-p2b-a-norman-after-import.json` passed 20/20 routes                       |

The History reruns exposed a repeatable answer-book line-count weakness. The extractor and
independent judge now include source-specific rendered-page guardrails for First World War, Asia,
the shared 2020 Paper 2 answer-book layouts, and 2021 Paper 1 Section A options. Paper 2 Section A
options use `01.1 = 49`, `02.1 = 52`, `03.1 = 52`, and `04.1 = 101`. Paper 2 Section B options
use `01.1 = 48`, `02.1 = 50`, `03.1 = 49`, and `04.1 = 98`. 2021 Paper 1 Section A uses America
`22/23/50/23/50/76`, Germany `22/24/50/24/51/76`, and Russia `22/24/51/23/51/73` for questions
`01`-`06`. Those counts include the first ruled line below the prompt, lines beside/after
`Extra space`, continuation-page top lines, and the final inner ruled line above the page frame. The
v17 batch correctly failed before D1 on missing Paper 2 guardrails; the v18 rerun from the same
official PDFs passed after the extractor prompt, deterministic helper validation, and independent
judge were updated. The v20 first run likewise failed before D1 on 2021 Section A answer-line
counts: America Q06.1 was 74 instead of 76; Germany Q03.1/Q05.1/Q06.1 were 47/48/72 instead of
50/51/76; Russia Q02.0/Q03.0/Q05.0/Q06.0 were 23/50/50/72 instead of 24/51/51/73. After adding the
source-specific prompt/helper/judge guardrails, a fresh `--force` rerun from the official PDFs
passed extraction judge, chain reconciliation, solvability, strict audit, D1 write, and deployed
route crawls for all three papers. The next v21 run added two more repeatability fixes: Option D
America first failed solvability because `stemBlocks[].keyItems` containing complete
Interpretation A/B text were omitted from learner-visible contexts, and First World War first failed
before D1 because broad crops undercounted its answer booklets as `14/57/37/70` instead of
`21/76/51/102`. The shared learner-context builder now preserves `keyItems`, and the extractor,
helper validator, and judge include source-specific 2021 P1A D and 2021 P1B A line-count
guardrails. The rerun in `tmp/codex-history-batch-v21-rerun/` passed all gates and route crawls.
The v22 batch then imported 2021 Health and East-West but correctly blocked 2021 Asia before D1:
the first Asia extraction counted `17/70/46/93` lines instead of `22/77/51/103`. The production
extractor prompt, helper validator, independent judge, and regression tests now include 2021 Paper
1 Section B Option B/C/D line-count guardrails: Option B `22/77/52/103`, Option C `22/76/52/102`,
and Option D `22/77/51/103`. The targeted rerun in `tmp/codex-history-batch-v22-asia-rerun/`
passed extraction, independent judge, chain reconciliation, solvability, strict audit, D1 write,
and deployed route crawl. The v23 batch then imported 2021 Power and Norman, with deployed route
crawls passing `20/20` for each. It also correctly blocked 2021 Migration before D1 because the
independent judge found response-line counts `46/49/48/91` instead of `47/48/47/97`. The extractor
prompt, deterministic helper validator, independent judge prompt, and regression tests now include
the source-specific Migration guardrail: Q01.1 `20 + 27 = 47`, Q02.1 `21 + 27 = 48`, Q03.1
`20 + 27 = 47`, and Q04.1 `18 + 27 + 27 + 25 = 97`. The forced rerun in
`tmp/codex-history-batch-v23-migration-rerun/` then passed extraction, independent judge, chain
reconciliation, solvability, strict audit, D1 write, and a deployed `20/20` route crawl. After this
write, D1 held History `29` papers, `134` questions, and `1208` marks. The v24 batch then imported
2021 Elizabethan through all gates, but correctly blocked five papers before D1 because rendered
response-line evidence did not match source-specific guardrails. The guardrails now cover 2021 P2B B
Medieval `48/51/51/96`, 2021 P2B D Restoration `48/52/52/97`, 2022 P1A A America
`21/22/49/23/49/71`, 2022 P1A B Germany `21/23/49/24/50/72`, 2022 P1A D America
`22/24/48/25/50/74`, and 2022 P1B A First World War `23/74/48/101`. The rerun in
`tmp/codex-history-batch-v24-rerun/` imported Medieval, Restoration, America 1840, and America
1920 after extraction, independent judge, chain reconciliation, solvability, strict audit, safe D1
write, and deployed route checks. Germany first exposed an import-path bug: `stemBlocks[].keyItems`
with `{term, description}` entries were not included in learner-visible solvability context, so
Q01.1-Q03.1 looked unsolvable despite correct extraction. The shared context builder now preserves
`term`/`description` key items, and `tmp/codex-history-batch-v24-germany-keyitems-rerun/` passed all
gates and D1 import. Route-check reports for the five rerun papers live under
`tmp/public-route-checks/aqa-history-2021-p2b-b-medieval.json`,
`tmp/public-route-checks/aqa-history-2021-p2b-d-restoration.json`,
`tmp/public-route-checks/aqa-history-2022-p1a-a-america1840.json`,
`tmp/public-route-checks/aqa-history-2022-p1a-d-america1920.json`, and
`tmp/public-route-checks/aqa-history-2022-p1a-b-germany.json`; all have `failedRouteCount: 0`.
After these writes, D1 held History `37` papers, `174` questions, and `1532` marks, with total D1
coverage at `139` question papers: Biology `15`, Chemistry `14`, Computer Science `6`, English
`39`, Geography `15`, History `37`, and Physics `13`.

The v19 Paper 2 Section B resume exposed a strict-audit normalizer bug. Medieval and Elizabethan had
already passed PDF extraction, extraction judge, and chain reconciliation, but import-ready audit
failed because reused D1 chain definitions can omit `answerChain.reviewNotes` while the final D1
schema requires an array. The shared import normalizer now compacts missing, scalar, and object-form
chain review notes into arrays before strict audit and D1 writes. A regression in
`scripts/test-extraction-pipeline.mjs` covers reused D1 chains without review notes. After the fix,
Medieval and Elizabethan were rerun with cached official-PDF extraction artifacts and passed strict
audit, Codex solvability, D1 conflict checks/write, and deployed route crawls. Route checks for
Medieval, Elizabethan, and Restoration also confirmed public multi-paper chain visibility:
`hist-chain-factor-weigh-judgement` is visible on 12 papers and the Section B `Convincing View`
chain is visible on 4 papers, with zero route failures.

For legacy `@ljoukov/llm` production runs, verify the old run artifact before treating it as
import-ready:

```sh
pnpm run verify:production-extraction -- \
  --work-root=tmp/production-extraction/aqa-84611h-qp-nov20
```

The verifier reads the top-level production summary, extraction judge report, chain reconciliation
summary, strict import-ready audit, import-ready JSON files, and the LLM log for the run id. It
fails if any step only appears to have passed while a lower-level judge still requested repairs,
including stale learner-facing solvability findings such as duplicated context blocks or missing
unordered answer-key semantics. Use `--allow-dropped-questions` only for deliberate partial imports
where the dropped questions are separately tracked for repair.

For the current AQA Physics data layout, use the preset:

```sh
pnpm run extract:physics-vision -- --paper=aqa-8464p1h-qp-jun18 --force
pnpm run extract:physics-vision -- --all --force
```

`extract:physics-vision` is a compatibility command for the same script-first pipeline; there should
not be a second Physics-specific extractor.

For AQA Separate Science Higher, first download the official assessment resources into `data/`. The
Codex single-paper production path is the main path; the batch/chunk commands below remain useful for
legacy comparison, repairs, and manifest management:

```sh
pnpm run download:aqa-separate-science
pnpm run extract:aqa-separate-science -- --subject=biology --paper=aqa-84611h-qp-jun24 --force
pnpm run extract:aqa-separate-science -- --all --force
pnpm run extract:production:batch -- --all --concurrency=3 --paper-attempts=2 --chunk-pages=2 --chunk-concurrency=2 --extraction-model=chatgpt-gpt-5.5 --extraction-thinking-level=medium --extraction-judge-thinking-level=medium --extraction-judge-mode=question-batches --extraction-judge-batch-size=8 --extraction-judge-concurrency=2 --chain-model=chatgpt-gpt-5.5 --chain-thinking-level=xhigh --solvability-model=chatgpt-gpt-5.5 --solvability-thinking-level=xhigh --llm-timeout-ms=600000 --llm-max-attempts=3 --llm-max-calls=48 --run-id-prefix=aqa-separate-production
pnpm run extract:aqa-separate-science:batch -- --all --chunk-pages=2 --chunk-concurrency=2 --extraction-granularity=chunk --evaluation-mode=extraction --concurrency=3 --paper-attempts=2 --repair-attempts=1 --repair-batch-size=4 --judge-mode=paper --judge-repair-attempts=1 --llm-timeout-ms=600000 --llm-max-calls=48
pnpm run audit:extracted-data -- --input-root=data/vision-extracted/aqa-separate-science-higher --recursive --run-solvability
pnpm run audit:current-exported-data
pnpm run build:existing-chain-context -- --input-root=tmp/import-ready-extracted/aqa-separate-science-higher --output=tmp/existing-chain-context.json
pnpm run reconcile:answer-chains -- --input-root=data/vision-extracted/aqa-separate-science-higher --output-root=tmp/chain-reconciled/aqa-separate-science-higher --existing-chains=tmp/existing-chain-context.json --model=chatgpt-gpt-5.5 --thinking-level=xhigh --fail-on-blocking
pnpm run prepare:import-ready-extraction -- --input-root=tmp/chain-reconciled/aqa-separate-science-higher --output-root=tmp/import-ready-extracted/aqa-separate-science-higher
```

The downloader scrapes the official AQA assessment-resource pages for GCSE Biology 8461, Chemistry
8462, and Physics 8463. It keeps standard Higher question papers in
`data/aqa-separate-science-higher/question-papers/`, mark schemes in
`data/aqa-separate-science-higher/mark-schemes/`, standard inserts in
`data/aqa-separate-science-higher/supporting-documents/`, and writes
`data/aqa-separate-science-higher/manifest.json`. Modified-print variants and examiner reports are
excluded unless a future importer explicitly needs them.

Use `extract:production:batch` only for unattended legacy comparison runs from the AQA Separate
Science manifest until a Codex batch wrapper is added. Use `--dry-run` first to inspect the exact
per-paper commands. Batch `--concurrency` controls the number of legacy papers running at once;
`--solvability-concurrency` is forwarded to the per-paper learner-facing solvability gate. Use
`--run-id-prefix=<id>` so every legacy paper gets a stable LLM log file such as
`tmp/llm-extraction-logs/<id>-aqa-84611h-qp-nov20.jsonl`.

Use `--question-pages=1-3` and `--mark-scheme-pages=4-5` for chunked extraction. The script first
does a cheap deterministic scout over question-paper text to find visible source question refs by
page. The default `--chunk-strategy=parent-question` then merges adjacent pages from the same parent
question, so a page window does not split `05.7` away from the `05` stem, tables, figures, or earlier
subparts it needs. Use `--chunk-strategy=fixed-pages` only for benchmark reproduction or debugging a
specific page-window failure. Use `--chunk-pages=<n>` as the initial target batch size, and
`--concurrency=<n>` to run multiple papers in parallel after single-paper extraction is stable.
`extract:aqa-separate-science:batch` remains available for legacy extraction-only debugging and
cache repair. Do not use it as the normal production import path because it predates the
chain-reconciliation/import-ready orchestrator and does not derive reusable answer chains by default.
Its `--import-raw-output` flag is a compatibility escape hatch for already audited complete outputs,
not a production shortcut.
Use `--force` to overwrite output files and rendered page images. Use
`--force-chunks` when prompt, logging, schema, or model changes mean cached LLM chunk outputs must be
regenerated; `--force` alone intentionally does not spend new LLM calls for existing chunk caches.
Set `--paper-attempts=<n>` to retry a paper after transient provider timeouts; retries reuse
per-target caches even when the first attempt used `--force-chunks`, so a single timed-out question
does not force the whole paper to restart from page 1.
Use `--extraction-granularity=question` only as a focused repair/debug mode for hard page layouts,
and pass `--allow-question-granularity` to acknowledge that cost. It runs one extraction call per
detected sourceQuestionRef and can turn one paper into dozens of LLM calls. The default `chunk` mode
extracts all subquestions that begin in each planned parent-question chunk in one call. Dense GCSE
papers with tables/graphs should usually start at `--chunk-pages=2`; the parent-question planner may
extend that window when adjacent pages contain the same parent ref. Drop to `--chunk-pages=1` only
when a page is too visually dense for one call; with the default parent-question strategy, adjacent
pages from the same parent still stay together. Use `--chunk-concurrency` to recover wall-clock speed
without forcing oversized prompts. Do not present page-by-page extraction as the production strategy;
it is only a diagnostic benchmark mode.
Use `--llm-max-calls=<n>` on benchmark and batch runs so a call-count regression fails early instead
of silently running for hours.
For full-paper production extraction, use `--extraction-judge-mode=question-batches` and
`--extraction-judge-thinking-level=medium` unless a newer benchmark proves another setting is both
faster and at least as strict. The judge batches must be parent-aware: a later subquestion such as
`05.7` is judged with the rest of parent `05` and the bounded source pages needed for that parent
context. The batch candidate includes `extractionRun.evaluationQuestionRefs`; source pages may
include neighboring context pages, and the judge must not fail a batch just because a visible context
page contains another question outside those target refs. Do not send a whole paper candidate plus
all rendered page images to one judge call; a failed or slow judge must not force the expensive
vision extraction to restart. The extraction CLI writes the raw pre-judge candidate before judging,
then writes the final candidate again after any repair attempts. Use paper-level judging only for
small scoped diagnostics where the candidate and page evidence are intentionally tiny.
Use `--rejudge` after prompt or repair-code changes to force evaluation of existing JSON. Mark
schemes are passed as extracted text by default; use
`--mark-scheme-image-mode=all` only when layout/text extraction is not enough. The library exports `extractFullPaperFromPdfSet`,
`extractCandidateFromPdfPair`, `extractCandidateFromImages`, `evaluateCandidate`,
`evaluateCandidateQuestionBatches`, and `runGoldenPdfEval` so batch jobs can run many chunks,
judge batches, or papers in parallel under their own concurrency control.

The script owns PDF processing. The model should not be asked to discover files or run shell
commands. To match Codex-quality extraction without depending on the Codex harness, the script must
do the deterministic preparation first:

- Extract or expose core question-paper page text with `pdftotext -layout`. For the bounded
  agentic path, do this through page-scoped tools on demand rather than by pre-feeding whole-paper
  text dumps or historical `question-paper.txt` / `mark-scheme.txt` artifacts.
- Detect candidate `sourceQuestionRef` values from that text.
- Pass compact metadata and detected refs into the extractor prompt. Let the agent request
  page/ref text, page images, crops, line checks, and mark-scheme slices through explicit tools.
- Render question-paper pages for layout, response controls, figures, answer lines, and tables that
  text extraction flattened.
- Check embedded PDF images with `pdfimages` or PyMuPDF before treating rendered page screenshots as
  figure assets. Use embedded assets when the official PDF contains the figure directly; use page
  renders for layout and visual understanding.
- Count answer spaces with targeted crop/image checks or PDF vector/drawing inspection. Do not rely
  on one global method: some papers encode writing lines as strokes, others as thin filled
  rectangles, and graph/table borders can look like answer lines.
- Crop referenced figure, graph, and diagram assets deterministically before review. The current
  cropper uses `pdftotext -bbox-layout` to find standalone figure labels, then a rendered-page
  row-projection pass to isolate the visual region. A fallback full-page image is allowed only as a
  review-blocking artifact, not as an import-ready asset.
- Isolate mark-scheme text to the detected refs before the LLM call, falling back to mark-scheme
  images only when text extraction is insufficient.
- Validate parseable JSON and deterministic import gates after the model returns.

Required local tools are:

- `pdfinfo` to count/inspect pages.
- `pdfimages` and/or PyMuPDF to detect and extract embedded official figure assets before falling
  back to rendered-page crops.
- `pdftoppm` to render pages to PNG images.
- `pdftotext` to provide the model with deterministic text/ref scouts before visual inspection and
  bounding boxes for deterministic figure cropping.
- A targeted answer-line detector over rendered crops and/or PDF drawing commands.
- Codex CLI/SDK auth for non-fast `gpt-5.6-sol` subscription-backed extraction, judge, and chain
  runs at `max` reasoning.
- `@ljoukov/llm` only for explicitly requested legacy diagnostics or repair runs, not the default
  production import path.

Codex is now the main production runner for whole-paper PDF import. `pnpm run extract:production`
and `pnpm run codex:production-import` call
`scripts/run-codex-production-import-pipeline.mjs`, which runs four phases:

1. PDF extraction with `scripts/run-codex-pdf-extraction.mjs`.
2. Separate answer-chain reconciliation with `scripts/run-codex-answer-chains.mjs`.
3. Import-ready preparation with strict extraction audit before learner-facing review.
4. Codex SDK learner-facing solvability review with `scripts/run-codex-solvability-judge.mjs`,
   then final strict import-ready preparation with D1 conflict check and D1 import dry-run or
   explicit write.

Passed-phase reuse is content-addressed, not ref-addressed. Each extraction, independent-judge,
answer-chain, and solvability summary records canonical JSON hashes for its exact JSON inputs and
outputs, plus byte hashes for official PDF inputs. `--resume-passed-phases` must reject reuse when a
required hash is absent or when any current artifact differs, even if its source-document id,
question count, and source-question refs are unchanged. A prompt, mark-evidence, response-control,
model-answer, asset, or chain mutation invalidates that phase and every dependent phase. Historical
passes may be attested only from preserved exact phase snapshots; a ref-only or status-only summary
is never sufficient.

On an explicit resume, a phase command is reached only after that phase fails the exact reuse gate.
The orchestrator force-replaces that rejected phase's stale work directory so a legitimate rerun does
not fail on directory existence; exact reusable phases remain untouched and are never rerun.

The production pipeline passes `--skip-chain-style-judge` to the answer-chain runner unless
`--run-legacy-chain-style-judge` is explicitly supplied, and it only runs the older solvability
judge when `--run-legacy-solvability` is explicitly supplied. This avoids accidentally using legacy
`@ljoukov/llm` API-key paths during Codex subscription imports. The chain phase still runs
deterministic `validate-chain` checks for missing ids, placeholder chains, overlong visible labels,
invalid step roles, and invalid positive mark evidence. Use a Codex-run reviewer or the public
route-equivalent style audit for production quality gates; use the legacy prompt-based chain-style
judge and legacy solvability judge only when intentionally comparing or repairing older artifacts.

The runner uses the official Codex SDK (`@openai/codex-sdk`) to launch local Codex through the same
subscription-backed CLI auth as interactive Codex. The SDK wraps the Codex CLI and streams JSONL
events, so benchmarks remain comparable with direct `codex exec --json` runs while the script gets
cleaner event logging, usage accounting, final-message capture, and timeouts. The SDK runner strips
generic `OPENAI_*` variables and `CODEX_API_KEY` from the subscription environment so a local
`.env.local` cannot accidentally switch production imports to API-key auth. Set `CODEX_API_KEY`, or
set `CODEX_USE_OPENAI_API_KEY=true` with `OPENAI_API_KEY`, only for an explicitly intended API-key
diagnostic. The default production Codex model name is `gpt-5.6-sol`; the old
`chatgpt-gpt-5.5` model identifier is for legacy `@ljoukov/llm` calls and is not the Codex CLI model
name.

The PDF extraction runner prepares a clean isolated directory containing only:

- `question-paper.pdf`, `mark-scheme.pdf`, and optional `supporting-XX.pdf` official inputs.
- `helper.mjs`, copied from `scripts/codex-import-helper.mjs`.
- `metadata.json` and the exact `prompt.md` used for the run.

It does not feed `question-paper.txt`, `mark-scheme.txt`, full OCR dumps, historical benchmark
texts, or extracted repository context into the prompt. Codex may create local working artifacts from
the PDFs during the run. The prompt tells Codex to use the PDF text layer first, render pages/contact
sheets for layout, extract embedded images for figures/tables, use geometry/rendered checks for
answer-line counts, and treat OCR as fallback only. Formulae and equations get explicit visual
verification requirements for chemistry equations, ionic formulae, state symbols, charges, physics
formulae, fractions, units, and rearranged equations.

`scripts/codex-import-helper.mjs` is self-contained so it works inside `/tmp` clean directories. It
provides the helper operations Codex should call instead of reinventing them every run:

- `pdf-info`
- `pdftotext-pages`
- `render-pages`
- `extract-embedded-images`
- `contact-sheet`
- `crop`
- `crop-page`
- `line-count`
- `normalize-extraction`
- `validate-extraction`
- `validate-chain`
- `summarize-codex-events`

The helper canonicalizes common Codex draft response kinds (`tick_box`, `tick_box_table`,
`equation_completion`, `calculation`, `structured_fields`) into app response kinds before
validation. It still fails real defects such as duplicate refs, mark-total mismatch, unsupported
response kinds, missing mark evidence, missing fixed-response answer keys, missing written
modelAnswer rows, missing visual assets, unresolved review flags, and placeholder answer chains in
the chain phase. `validate-chain` also rejects paragraph-like answer chains: titles must stay short,
canonical chain text must be 2-5 compact `->` links, summaries must stay concise, and step labels
must stay short. A separate reviewer can then check whether the chain is actually a memorable
learner-facing cue rather than a generic instruction; in the Codex production path this should be a
Codex reviewer or public style audit, while the legacy prompt-based chain-style judge is explicit
opt-in.

For already-deployed public D1 chains, use the public route-equivalent style audit before posting
links or claiming a cleanup:

```sh
npm run audit:public-answer-chain-style -- --include-reuse-warnings \
  --output=tmp/public-chain-style-audit.json
```

This audit checks only chains that the app can publicly route to: published chain, published
membership, published question, and an available rendering overlay. It fails paragraph-like titles,
canonical text, summaries, step labels, unsupported legacy step roles, and placeholder handles. With
`--include-reuse-warnings`, it also warns when a chain has only one public source paper; that warning
means the wording may be reusable, but the deployed data does not yet prove cross-paper reuse. Repair
deployed copy with:

```sh
npm run repair:public-answer-chain-style -- \
  --output=tmp/public-chain-style-repair.json

npm run repair:public-answer-chain-style -- \
  --skip-generation --input-repair=tmp/public-chain-style-repair.json --write
```

The repair command rewrites only `answer_chains`, `answer_chain_steps`, and stale/overlong
`question_answer_chains.fit_notes`. It must not change question extraction, mark-scheme rows, model
answers, fixed-response answer keys, assets, or memberships. Run route checks after a write.

Answer chains are not produced during PDF extraction. `scripts/run-codex-answer-chains.mjs` runs
after extraction and receives one normalized paper plus optional `existing-chain-context.json`.
For each question it must choose `reuse_existing`, `create_new`, `update_existing`, or
`needs_review`. By default the Codex chain runner is not authorized to alter published/shared chain
definitions: it may reuse an existing public chain only when the existing title, canonical text,
summary, and steps fit unchanged. If a matching public chain would need more general, count-neutral,
or source-neutral wording, create a new stable chain id instead of `update_existing`. Pass
`--allow-shared-chain-updates` only for an intentional update run; then the prompt requires Codex to
inspect every available already-attached example in the existing context, and if the evidence is
insufficient it must create a new chain or mark review instead of over-generalizing. Exact numeric
answers, tick-box letters, table values, source-specific facts, and worked solutions stay in response
keys, mark scheme items, checklists, or model answers, not in answer-chain fields.

`scripts/prepare-import-ready-extraction.mjs` remains the strict gate after chain reconciliation. By
default the Codex production pipeline runs solvability and D1 dry-run checks. Import writes require
`--import`. D1 replacement safety is read-only by default through `--check-existing`: the import path
reports existing source documents/questions, existing chain links for the target paper, incoming
question ID collisions, and incoming chain IDs already attached to other papers. Shared-chain updates
are blocked unless `--allow-shared-chain-updates` is passed after cross-paper chain validation.
Pass `--refresh-shared-chain-definitions` only when the incoming shared-chain definitions have passed
the prompt-based chain-style judge and should intentionally replace existing published chain titles,
canonical text, and steps. Without this flag, safe `reuse_existing` chains preserve their existing D1
definitions during a paper replacement.

The prepare script clears its output directory before each run and refuses to do so if that output is
the input root or input-file directory; stale JSON files must not be allowed to contaminate strict
audit or import dry-run results. The normalizer treats non-positive PDF `pageCount` values as missing
and recomputes the count from the official PDF path, because Codex draft JSON can preserve
`pageCount: 0` even when all page refs are otherwise correct.

After a real D1 import, run `scripts/check-public-question-routes.mjs` for the imported
`sourceDocumentId`. It queries D1, opens every deployed question, question-chain, practice, chain,
constellation, and image route under `https://constellation.eviworld.com`, and fails on HTTP errors
or app error bodies. This is the route-health gate for "open question" failures that can escape a
pure D1 row-count audit. The same report also records public-visible chain multiplicity using the
same predicates as the public chain pages: published chain, published question, no review flags on
the chain/question/membership, and an available rendering overlay. Raw D1 memberships that are
draft, review-blocked, or missing render overlays do not count as public multi-question or
multi-paper evidence. If a report advertises multi-paper chains, use `publicMultiPaperChains`, not
raw `total_linked_papers`.

The D1 post-write audit requires mark-scheme rows, checklist rows, and a chain for every imported
question. It also requires a model answer or fixed answer key for normal written/fixed-response
questions. `asset-canvas` and `drawing-box` responses are exempt from the single-answer requirement:
graph/drawing responses are gradable from their mark scheme and checklist, and forcing a fake
answer key would make the data less faithful.

Import-ready normalization must preserve the response surface chosen by extraction when the prompt
asks the learner to draw, plot, sketch, complete, or label a graph, grid, diagram, cross-section, or
image. It may normalize an `asset-canvas` over a structured table into `choice-table` only for
genuine table-value selection tasks such as ring/circle/select/tick/shade a value or cell. It must
not convert graph plotting from a table of source data into a table-choice response; the source
table is context, while the learner response surface is the graph canvas.

For blank printed grids that the learner must complete or draw on, extraction should use
`response.kind: "drawing-box"` with `response.grid: { rows, columns }` and visible
`rowLabels`/`columnLabels` when present. This is distinct from an unconstrained drawing area such as
logic-circuit drawing, which can remain a plain `drawing-box`. Import, server loading, response
rendering, and solvability context generation must preserve the grid metadata so the learner and the
judge see the original answer surface.

The older `@ljoukov/llm` chunk/agentic path is kept as a legacy diagnostic and repair harness under
`scripts/extract-paper-llm.mjs`, `scripts/run-production-extraction-pipeline.mjs`, and
`pnpm run extract:production:llm`. It is no longer the main production import path.

Whole-paper Codex comparison data lives in
`docs/codex-whole-pdf-import-observations.md` ("Codex Whole-PDF Import Observations"). The historical
`tmp/codex-benchmark-whole-paper-20260628` artifact is not a true PDF-only production baseline
because it supplied precomputed `question-paper.txt`, `mark-scheme.txt`, and page PNGs. It remains a
useful JSON-quality reference, but not proof of official-PDF-to-JSON extraction.

Six-paper isolated Codex rollout study, 2026-06-28: free-discovery Codex runs were given only
official PDFs in isolated temporary directories. They discovered several workflows now captured in
the production prompts and helper menu:

| Paper              | Mode             | Wall time | Questions | Marks | Commands | Input tokens | Cached input |
| ------------------ | ---------------- | --------: | --------: | ----: | -------: | -----------: | -----------: |
| Biology P1 Nov20   | free discovery   |   892.38s |        46 |   100 |       14 |    1,953,808 |    1,587,328 |
| Chemistry P1 Nov20 | free discovery   |   717.32s |        43 |   100 |       48 |    2,476,964 |    2,182,784 |
| Physics P1 Nov20   | free discovery   |   858.10s |        41 |   100 |       31 |    3,740,954 |    3,227,392 |
| Biology P1 Nov20   | prompted toolkit |   624.23s |        46 |   100 |       44 |    1,399,015 |    1,176,704 |
| Chemistry P1 Nov20 | prompted toolkit |   689.49s |        43 |   100 |       73 |    1,673,756 |    1,491,200 |
| Physics P1 Nov20   | prompted toolkit |   902.03s |        41 |   100 |       57 |          n/a |          n/a |
| Biology P2 Nov20   | prompted toolkit |   685.28s |        43 |   100 |       38 |    3,492,832 |    3,031,040 |
| Chemistry P2 Nov20 | prompted toolkit |   932.46s |        47 |   100 |       66 |    4,178,204 |    3,804,160 |
| Physics P2 Nov20   | prompted toolkit |   685.73s |        38 |   100 |       53 |    1,925,301 |    1,756,416 |

The full artifacts live under `tmp/codex-isolated-pdf-baselines-20260628/`. The prompted toolkit
helped Biology P1 and Physics P2, modestly helped Chemistry P1, and hurt or failed to cleanly finish
Physics P1 / Chemistry P2. Do not encode a single rigid workflow. Use a prompt/tool menu and let the
agent choose:

- Text-first extraction with `pdftotext -layout`.
- Embedded-asset extraction with `pdfimages` or PyMuPDF.
- Rendered-page/contact-sheet inspection for layout and graph/diagram understanding.
- Targeted crop line detection only where line counts are uncertain.
- PDF vector/drawing inspection for papers where answer rules are vector strokes or thin filled
  rectangles.
- Text/pdfplumber table extraction for real tables, with visual fallback when tables are raster or
  pdfplumber output is noisy.
- LaTeX normalization for formulae, chemical equations, symbols, units, powers of ten, and
  substitutions.
- A deterministic builder/validator step that writes JSON, checks duplicate refs and 100 total
  marks, writes a trace summary, then stops.

Direct whole-paper Codex PDF-only reruns, 2026-06-29, used isolated temporary directories containing
only the official PDFs plus the prompt. Codex was allowed to discover its own local workflow and write
temporary helper scripts/artifacts:

| Paper              | Wall time | Questions | Marks | Commands | Input tokens | Cached input | Output tokens | Notes                                                                                                                 |
| ------------------ | --------: | --------: | ----: | -------: | -----------: | -----------: | ------------: | --------------------------------------------------------------------------------------------------------------------- |
| Biology P1 Jun18   |      754s |        44 |   100 |       47 |    2,375,562 |    2,176,896 |        36,583 | Includes review-marked withdrawn `06.1`-`06.8` placeholders; production importer must omit or repair these before D1. |
| Chemistry P1 Jun18 |      887s |        46 |   100 |       95 |    2,955,790 |    2,691,968 |        42,191 | Passed Codex's syntax/count validation with no review flags.                                                          |
| Physics P2 Jun18   |    1,383s |        48 |   100 |       51 |    5,561,702 |    4,909,184 |        34,883 | Passed Codex's syntax/count validation with no review flags.                                                          |

The observable Codex sequence was not a single rigid recipe: it used `pdfinfo`,
`pdftotext -layout`, `pdfimages -list` / embedded extraction, PyMuPDF/pdfplumber summaries and table
extraction, rendered page contact sheets, targeted crop/line checks, PDF drawing geometry, custom
builder scripts, `jq`/Python validation, and final count/mark sanity checks. The production runner
keeps those useful deterministic steps available but still lets Codex choose the workflow by paper.

Prompt caveats from the rollout study:

- In isolated Codex runs, say "do not run git; this is not a repo."
- Say to use the prepared Python interpreter, not plain `python`, when Pillow/PyMuPDF/pdfplumber are
  required.
- `contact-sheet --thumb` must be a `WxH` value such as `220x300`.
- Avoid whole-page line detection by default; it can count graph grids, table borders, and page
  rules.
- The longest remaining bottleneck is not observation but whole-paper JSON/builder synthesis.
  Production scripts should make the final builder/schema validation as deterministic and compact as
  possible.

The previous full-paper chunk run in
`tmp/production-extraction-full-paper/aqa-84611h-qp-nov20/` failed during PDF extraction/judging:
the extraction portion used 12 logged calls, 292,191 tokens, and `$2.23753`; a later repaired judge
run used 7 calls, 133,015 tokens, and `$1.0494`. Its extraction judge reported `fail` with score
`0.90` and three required repairs. This is the legacy script baseline the Codex production path must
beat on whole-paper quality before import.

Current Codex SDK production run, Biology P1 Nov20, 2026-06-29:

| Phase             | Artifact                                                                           | Wall time | Questions | Marks |         Actions | Failed actions | Input tokens | Cached input | Output tokens | Reasoning tokens | Result                                     |
| ----------------- | ---------------------------------------------------------------------------------- | --------: | --------: | ----: | --------------: | -------------: | -----------: | -----------: | ------------: | ---------------: | ------------------------------------------ |
| PDF extraction    | `tmp/codex-sdk-extraction/aqa-84611h-qp-nov20/normalized-extraction-v5.json`       |  500.567s |        46 |   100 |              51 |              3 |    1,371,023 |    1,202,176 |        21,831 |            3,637 | deterministic extraction validation passed |
| Answer chains     | `tmp/codex-sdk-chain/aqa-84611h-qp-nov20-v7-source-repaired/chain-reconciled.json` |  557.425s |        46 |   100 |              41 |              0 |    1,407,819 |    1,218,560 |        27,717 |           11,011 | 32 reused, 14 created, 0 updated, 0 review |
| Solvability audit | `tmp/codex-sdk-import-ready/aqa-84611h-qp-nov20/final-solvability-v7-audit.json`   |  893.195s |        46 |   100 |             n/a | 0 failed calls |      212,340 |            0 |        15,481 |           52,850 | 46/46 passed                               |
| D1 import write   | `tmp/codex-sdk-import-ready/aqa-84611h-qp-nov20/final-import-v7-audit.json`        |      8.2s |        46 |   100 | 554 SQL inserts |              0 |          n/a |          n/a |           n/a |              n/a | targeted D1 replacement passed             |

The raw SDK extraction and chain phases were faster than the prompted Biology P1 Nov20 Codex
baseline (624.23s extraction-only) and much more complete than the legacy chunk extractor, but the
first learner-facing solvability audit found real source-context defects: Q01 investigation/table
context, Q06.1 controlled-factor context, and Q07 mAbs definition/context. The final v7 import
artifact repairs those fields from the official PDF text layer and rendered-page evidence, then
passes deterministic extraction validation, chain validation, strict audit, 46/46 solvability, D1
dry-run, and D1 write coverage. The production extraction prompt now explicitly requires exact
parent/source stems for referential prompts such as "this investigation", "the mAbs", "other
factors", and "the anomalous result"; the normalizer also renders `contextText` as `stemBlocks` when
Codex supplies context text without explicit blocks.

D1 replacement safety for the v7 import was read-only checked before write:

- Existing paper row count: 46.
- Incoming question count: 46.
- Incoming chain count: 43.
- Question ID collisions: 0.
- Shared incoming chains attached to other papers: 7, all `reuse_existing`.
- Unsafe shared-chain updates: 0.
- `safeToReplace`: `true`.

The actual import replaced only `aqa-84611h-qp-nov20` and reported post-write coverage of 46
questions, 46 render overlays, 98 mark-scheme rows, 96 checklist rows, 40 model answers, 9 fixed
answer keys, 43 answer-chain links, and no questions missing grading evidence. Codex runs are
subscription-metered and the SDK does not emit dollar cost, so compare Codex approaches by wall time,
actions, failed actions, and token counts. `@ljoukov/llm` judge phases still emit cost in their own
logs; the v7 solvability audit logged 46 calls, 280,671 total tokens, and `$3.11163`.

Follow-up chain-quality remediation for the same Biology P1 Nov20 import, 2026-06-29:

- Reconciled artifact: `tmp/chain-prompt-validation/updated-chain-reconciled-concrete-v3.json`.
- Deterministic chain validation:
  `tmp/chain-prompt-validation/codex-work-concrete-v3/chain-validation-final-v11.json`, 46
  questions, 0 blocking issues.
- Prompt-based chain-style judge:
  `tmp/chain-prompt-validation/codex-work-concrete-v3/chain-style-judge-final-v11.json`, 45
  distinct chains, status `passed`, 0 issues, 83.790s, 23,833 prompt tokens, 83 response tokens,
  2,136 reasoning tokens, 26,052 total tokens, `$0.185735`.
- Negative prompt-judge fixtures explicitly failed the user-reported bad styles:
  `tmp/chain-prompt-validation/bad-symbiosis-style-judge-rerun.json` caught the paragraph-like
  symbiosis chain, and `tmp/chain-prompt-validation/bad-fixed-response-style-judge.json` caught a
  fixed-response chain that copied `Willow bark` into visible chain fields.
- Strict import-ready dry-run:
  `tmp/chain-prompt-validation/prepare-import-ready-v4.out` and
  `tmp/chain-prompt-validation/import-ready-audit-v4.json`, 46/46 questions kept, 0 dropped, strict
  audit 0 errors/0 warnings, solvability 46/46 passed, D1 replacement plan `safeToReplace: true`,
  incoming question count 46, incoming chain count 45, question ID collisions 0, one intentional
  shared-chain update (`bio-chain-photosynthesis-limitation-glucose-protein-growth`).
- D1 write artifact: `tmp/chain-prompt-validation/import-write-v4.out`, 18 clear statements, 576
  insert/upsert statements, post-write coverage of 46 questions, 46 render overlays, 98 mark-scheme
  rows, 96 checklist rows, 40 model answers, 9 fixed-response answer keys, 45 answer-chain links,
  and no missing grading evidence.
- D1 write was verified by query and live routes. Q07.1 and Q07.3 D1 render overlays store `lines`
  counts of 6 and 16 respectively. Later link checks found that some manually reported chain URLs
  were stale draft-only ids rather than the public ids actually attached to the Nov 2020 questions;
  do not report links from raw chain ids without checking the public route body.

Public D1 chain-copy remediation, 2026-06-30:

- Baseline public-route-equivalent style audit:
  `tmp/public-chain-style-audit-before.json`, 225 public chains, 218 hard style-error chains, 7
  warning-only chains, 2,231 style errors, 339 warnings.
- Repair artifact: `tmp/public-chain-style-repair-all.json`, 218 repaired chains, 446,119 total
  GPT-5.5 tokens (`323,990` prompt, `49,675` response, `72,454` thinking), `$5.283820`.
- D1 write from the validated repair plan updated 218 `answer_chains`, replaced 553 old
  `answer_chain_steps` with 735 compact step rows, and shortened 248 stale/overlong
  `question_answer_chains.fit_notes`.
- Post-write wording-only audit:
  `tmp/public-chain-style-audit-after-style-only.json`, 225 public chains, 0 errors, 0 warnings.
- Post-write audit with reuse warnings:
  `tmp/public-chain-style-audit-after.json`, 225 public chains, 0 style errors, 175 warnings, all
  warnings `single_public_paper`. This is a publication coverage warning, not a chain-copy warning:
  Biology currently has one public paper, so Biology chains should not be described as cross-paper
  until more audited Biology papers are imported/published or existing draft rows are safely promoted.
- Live route sweeps after the write passed: 225/225 public chain pages and 310/310 public question
  pages returned real pages with no 404/not-found body.

Public D1 cross-paper chain reuse review, 2026-06-30:

- Use `pnpm run review:d1-answer-chain-reuse -- --dotenv=/path/to/.env.local --force` to prepare
  clean D1-derived chain candidates, launch Codex through `@openai/codex-sdk`, and validate the
  review plan before any D1 write. The runner gives Codex only `candidates.json`, `helper.mjs`,
  `docs/extraction-spec.md`, and a prompt inside an isolated work directory. Codex must write
  `review-plan.json`; the parent runner applies accepted rows to D1 only with `--write`.
- Candidate selection is intentionally conservative: `answer_chains.status='draft'`,
  `answer_chains.needs_human_review=0`, draft questions with `needs_human_review=0`,
  no-review `question_answer_chains`, render overlays, mark rows, checklist rows, and model-answer
  or fixed-response answer-key evidence. Attached review-flagged examples are shown to Codex as
  warnings but are not publishable.
- Run artifact:
  `tmp/codex-d1-chain-reuse-review-20260630/review-plan.full.json`. Codex accepted 4/4 candidate
  chains and 9/9 publication-ready questions after manual semantic inspection of the same evidence.
  Codex SDK summary: 118.078s, 30 events, 9 command actions, 0 failed actions, 147,763 input tokens,
  88,064 cached input tokens, 5,899 output tokens, 2,989 reasoning tokens. The deterministic plan
  validator passed after copy tightening with 0 errors and 0 warnings.
- D1 write summary:
  `tmp/codex-d1-chain-reuse-review-20260630/summary-after-write.json`, 4 chains published, 9
  questions published, 9 chain links updated, 15 old step rows replaced with 15 compact step rows.
  Six promoted Chemistry question metadata titles were repaired because their extractor metadata had
  captured answer-line or tick-box option text as the public card title; future writes normalize
  accepted question titles from the command/question phrase.
- Promoted public multi-paper chains:
  `bio-chain-ivf-eggs-fertilisation-embryo-transfer` (`IVF sequence`, 2 questions / 2 papers),
  `chem-chain-chromatography-rf-relationship` (`Rf equation`, 3 questions / 3 papers),
  `chem-chain-crude-oil-formation-plankton-burial-compression-time` (`Crude oil`, 2 questions / 2
  papers), and `chem-chain-exothermic-temperature-increase-shifts-left` (`Equilibrium shift`, 2
  questions / 2 papers).
- Post-write public style audit:
  `tmp/public-chain-style-audit-after-cross-paper-promotion.json`, 229 public chains, 0 style
  errors, 175 warnings, all still `single_public_paper`. Corrected public counts: Biology 45 public
  chains / 1 multi-paper chain, Chemistry 3 public chains / 3 multi-paper chains, Physics 181 public
  chains / 50 multi-paper chains.
- Live route verification passed for the four promoted chain URLs and all nine promoted question
  URLs. Fresh chain-page HTML contained the expected multiple question refs and repaired card titles.
- Empty published-shell cleanup demoted 9 `answer_chains` rows that had `status='published'` but no
  route-visible public questions:
  `bio-chain-data-two-conclusions-comparison`, `bio-chain-food-test-reagent-treatment-colour`,
  `bio-chain-percentage-change-original-difference`,
  `bio-chain-photosynthesis-limitation-glucose-protein-growth`,
  `bio-chain-prokaryotic-cell-differences-recall`, `bio-chain-reaction-time-control-variables`,
  `physics-chain-atomic-model-diagram-labels`, `physics-chain-flemings-left-hand-rule-labels`, and
  `physics-chain-heating-practical-risk-burns-cuts`. Post-cleanup D1 query found 0 published chains
  with zero public questions; sampled stale URLs now return the normal not-found route instead of a
  broken public chain page.

Flagged D1 chain reuse review mode, 2026-06-30:

- Use `pnpm run review:d1-answer-chain-reuse -- --candidate-mode=review --force` only after the
  clean no-review promotion pass. Review mode looks for draft questions with no question-level human
  review flag where the chain, chain link, or previously demoted chain row is still review-flagged.
  It is a repair/promotion workflow for already-imported evidence, not a replacement for per-paper
  answer-chain reconciliation.
- Review-mode Codex must reject candidates when the review flag is justified by bad extraction,
  corrupted mark-scheme evidence, incomplete support, or a chain that covers only part of a
  multi-mark question. The parent process still requires manual semantic inspection of every
  accepted chain before `--write`; deterministic validation alone is not enough for review-flagged
  groups.
- Run artifact:
  `tmp/codex-d1-chain-review-flagged-20260630/review-plan.full.json`. Codex reviewed 42 candidate
  groups. Raw Codex accepted 24 chains / 51 questions and rejected 18; deterministic validation
  passed but reported 12 summary wording warnings. Manual Codex inspection then rejected
  `bio-chain-bacteria-favourable-conditions-reproduce-faster` because it covered only the
  rapid-growth stage of a 4-mark growth-curve question, broadened
  `bio-chain-meiosis-divisions-haploid-variation` to include the varied-cell outcome, and shortened
  warning summaries.
- Final validation artifact:
  `tmp/codex-d1-chain-review-flagged-20260630/summary-after-manual-validate.json`, 23 accepted
  chains, 19 rejected chains, 49 questions to publish, 0 validation errors, 0 validation warnings.
  Codex SDK metrics: 392.173s, 42 events, 13 command actions, 0 failed actions, 501,742 input
  tokens, 393,728 cached input tokens, 20,083 output tokens, 5,787 reasoning tokens. Codex SDK runs
  are subscription-metered, so no dollar cost is available.
- D1 write artifact:
  `tmp/codex-d1-chain-review-flagged-20260630/summary-after-manual-write.json`, 23 chains
  published, 49 questions published, 33 question metadata titles updated, 49 chain links updated,
  76 old step rows deleted, and 81 compact step rows inserted.
- Post-write D1/public verification:
  `tmp/public-chain-style-audit-after-review-mode.json`, 252 public chains, 0 style errors, 175
  reuse warnings, all existing `single_public_paper` warnings. Subject counts after the write:
  Biology 53 public chains / 9 multi-paper chains / 64 public question links; Chemistry 18 public
  chains / 18 multi-paper chains / 40 public question links; Physics 181 public chains / 50
  multi-paper chains / 264 public question links. D1 empty published-chain query returned 0 rows.
  `tmp/public-route-check-after-review-mode.json` fetched all 23 newly promoted chain pages and all
  49 newly published question pages; every route returned 200 and every chain page contained the
  expected multiple question ids and title. `tmp/public-practice-route-check-after-review-mode.json`
  also fetched all 49 chain-page "Open question" practice links; every route returned 200 with the
  expected chain and question ids.

Render/import fix rerun, Biology P1 Nov20, 2026-06-29:

| Phase                        | Artifact                                                                                                     | Wall time |         Actions |  Failed actions | Input tokens | Cached input | Output tokens | Reasoning tokens | Result                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | --------: | --------------: | --------------: | -----------: | -----------: | ------------: | ---------------: | ---------------------------------------------------------------------------------------------------------------------- |
| Codex PDF extraction         | `tmp/codex-sdk-extraction/aqa-84611h-qp-nov20-renderfix-v12/normalized-extraction.json`                      |  585.272s |              46 |               2 |    1,691,858 |    1,432,064 |        23,889 |            4,238 | 46 questions, 100 marks, mechanical validation passed                                                                  |
| Targeted Codex repair        | `tmp/codex-extraction-repair/aqa-84611h-qp-nov20-renderfix-v12-to-v15/repaired-normalized-extraction.json`   |  103.976s |              22 |               2 |      299,143 |      264,704 |         4,495 |              814 | repaired Q01.3/Q01.8/Q01.9/Q02.1; preserved Q07.1 = 7 and Q07.3 = 16 line counts                                       |
| Independent extraction judge | `tmp/codex-extraction-judge/aqa-84611h-qp-nov20-renderfix-v15/judge-report.json`                             |  201.065s |              39 |               0 |    1,066,391 |      913,920 |         7,330 |            1,208 | pass, score 0.98, 46 refs checked, 0 required repairs                                                                  |
| Codex answer chains          | `tmp/codex-sdk-chain/aqa-84611h-qp-nov20-renderfix-v15/chain-reconciled-normalized.json`                     |  617.405s |              38 |               0 |    1,122,847 |    1,017,344 |        26,277 |           11,663 | 32 reused, 14 created, chain validation passed                                                                         |
| Strict audit and solvability | `tmp/codex-sdk-import-ready/aqa-84611h-qp-nov20/renderfix-v15-fresh-import-audit.json`                       |       n/a |  46 judge calls |  0 failed calls |          n/a |          n/a |           n/a |              n/a | mechanical audit passed; solvability 46/46                                                                             |
| R2 upload                    | `tmp/codex-extraction-repair/aqa-84611h-qp-nov20-renderfix-v12-to-v15/assets/`                               |      8.4s |      11 uploads |               0 |          n/a |          n/a |           n/a |              n/a | 11 referenced assets uploaded                                                                                          |
| D1 import write              | `tmp/codex-sdk-import-ready/aqa-84611h-qp-nov20/renderfix-v15-fresh-import/chain-reconciled-normalized.json` |      5.8s | 588 SQL inserts |               0 |          n/a |          n/a |           n/a |              n/a | post-write coverage passed: 46 overlays, 155 mark rows, 77 checklist rows, 39 model answers, 10 answer keys, 44 chains |
| Deployed crawl               | `tmp/public-route-checks/aqa-84611h-qp-nov20-renderfix-v15.json`                                             |   64.425s | 237 HTTP routes | 0 failed routes |          n/a |          n/a |           n/a |              n/a | all 46 questions, 44 chains/constellations, and 11 image routes returned 200                                           |

The v15 rerun fixed the importer path rather than patching D1 by hand:

- `codex-import-helper.mjs` now recomputes official PDF page counts when Codex emits `pageCount: 0`.
- `prepare-import-ready-extraction.mjs` now clears stale output before strict audit/import checks.
- `import-physics-vision.mjs` no longer rejects graph/drawing `asset-canvas` questions for lacking a
  single answer key when they have mark rows and checklist rows.
- `check-public-question-routes.mjs` makes deployed route crawling repeatable after D1 writes.

The direct Codex whole-paper result is now the quality target and the production execution model. It
handled mark-checklist semantics well, especially any-two alternatives and level-of-response
descriptors, but raw Codex outputs still need normalization, app response-kind validation, asset
validation, chain reconciliation, solvability, strict audit, and D1 dry-run before import.

Geography Paper 2 June 2022 final import, 2026-07-05:

| Phase                              | Artifact                                                                                                                                                                                              | Wall time | Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Codex PDF extraction               | `tmp/codex-humanities-resume-v56/aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp/raw/aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp.json`              | 1106.343s |            70 |              1 |           5,164,539 |    4,686,848 |                 47,684 |            5,944 | 46 printed questions, 125 printed marks; Q03.1 deterministically held out as an unresolved copyright source                                |
| Independent Codex extraction judge | `tmp/codex-humanities-resume-v56/aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp/extraction-judge/judge-report.json`                                                           |  301.422s |            58 |              1 |           1,003,797 |      775,168 |                 13,809 |            3,057 | pass, score 0.99; 45 retained questions, 124 marks, held-out Q03.1 verified from rendered official PDF evidence                            |
| Codex answer-chain reconciliation  | `tmp/codex-humanities-resume-v56/aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp/chain-reconciled/aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp.json` |  742.669s |            43 |              0 |           2,012,497 |    1,823,232 |                 36,867 |           13,497 | 15 reused existing chains, 30 create-new resolutions, 22 unique new chain IDs, deterministic chain validation passed                       |
| Codex solvability judge            | `tmp/codex-humanities-resume-v56/aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp/codex-solvability/solvability-report.json`                                                    |  318.045s |            19 |              1 |             879,062 |      732,672 |                 15,510 |            4,343 | passed 45/45; image-dependent graph/map/source questions inspected against copied assets                                                   |
| Strict audit / D1 write            | `tmp/codex-humanities-resume-v56/aqa-geography-2022-june-paper-2-challenges-in-the-human-environment-qp/import-ready-audit.json`                                                                      |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 45/45 kept, 0 audit errors/warnings, D1 write passed                                                                                       |
| R2 upload and deployed crawl       | `tmp/public-route-checks/aqa-geography-2022-june-paper-2-after-import.json`                                                                                                                           |   91.269s |    209 routes |              0 |                 n/a |          n/a |                    n/a |              n/a | all question, question-chain, practice, chain, constellation, and 12 asset routes passed; 9 public multi-paper chains visible after import |

This run proves the current production path can import a whole Geography paper from official PDFs
while safely excluding a single unpublishable source item. It also exercises the D1 existing-chain
context: the deployed crawl reports 31 public chains for this paper, 13 public multi-question chains,
9 public multi-paper chains, and 0 raw multi-paper chains that show only one public question.

Computer Science canary, Paper 2 June 2024, 2026-07-01:

| Phase                                   | Artifact                                                                                                                                                                         | Wall time |      Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | -----------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | --------------------------------------------------------------------------------------------------- |
| Codex PDF extraction                    | `tmp/codex-humanities-canary-subscription-v8/aqa-computer-science-2024-june-paper-2-computing-concepts-qp/raw/aqa-computer-science-2024-june-paper-2-computing-concepts-qp.json` |  765.148s |                 68 |              2 |           2,137,304 |    1,867,264 |                 36,553 |            4,389 | 38 questions, 90 marks, deterministic extraction validation passed                                  |
| Independent Codex extraction judge      | `tmp/codex-humanities-canary-subscription-v8/aqa-computer-science-2024-june-paper-2-computing-concepts-qp/extraction-judge/judge-report.json`                                    |  252.157s |                 42 |              2 |             924,378 |      642,048 |                 10,868 |            3,015 | pass, score 0.98, 38 refs checked, 0 required repairs                                               |
| Codex answer-chain reconciliation       | `tmp/codex-humanities-chain-rerun-v1/chain-reconciled/aqa-computer-science-2024-june-paper-2-computing-concepts-qp.json`                                                         |  421.364s |                 19 |              0 |             441,319 |      377,344 |                 22,407 |            9,520 | 38 created, 0 reused; deterministic chain validation passed after prompt/style repairs              |
| Chain style repair 1                    | `tmp/codex-humanities-chain-rerun-v1/codex-chains/style-repair-summary-1.json`                                                                                                   |  185.381s |                 28 |              1 |             584,788 |      514,560 |                  9,119 |            4,621 | repaired fixed-response/SQL-style chain wording; one harmless missing-context read                  |
| Chain style repair 2                    | `tmp/codex-humanities-chain-rerun-v1/codex-chains/style-repair-summary-2.json`                                                                                                   |   91.711s |                 21 |              1 |             214,664 |      156,672 |                  4,194 |            1,091 | repaired decimal-to-hex method wording; one harmless missing-context read                           |
| Prompt chain-style judge                | `tmp/codex-humanities-chain-rerun-v1/codex-chains/chain-style-judge.json`                                                                                                        |       n/a |          5 batches |              0 |              24,356 |            0 |                    349 |            2,379 | passed, 0 issues, 27,084 total tokens                                                               |
| Strict audit / solvability / D1 dry-run | `tmp/codex-humanities-chain-rerun-v1/import-ready-final-solvability-audit.json`                                                                                                  |       n/a |          38 judges |              0 |             106,855 |            0 |                 11,547 |           24,696 | 38/38 solvability passed, 0 audit errors/warnings, 38 kept, 0 dropped, `safeToReplace`              |
| D1 canary write                         | `tmp/codex-humanities-chain-rerun-v1/import-ready-final-solvability/aqa-computer-science-2024-june-paper-2-computing-concepts-qp.normalized.json`                                |    8.147s | 580 SQL statements |              0 |                 n/a |          n/a |                    n/a |              n/a | 38 questions, 38 overlays, 141 mark rows, 69 checklist rows, 38 model answers, 11 answer keys       |
| R2 upload and deployed crawl            | `tmp/public-route-checks/aqa-computer-science-2024-june-paper-2-computing-concepts-qp-after-r2.json`                                                                             |   73.262s |         200 routes |              0 |                 n/a |          n/a |                    n/a |              n/a | after uploading 10 referenced assets, all question/chain/practice/constellation/image routes passed |

This run started from official AQA PDFs plus the examiner report and did not feed whole
`question-paper.txt` or `mark-scheme.txt` files to Codex. It exposed importer fixes that are now
part of the production path: normalize non-positive page counts from the official PDF, coerce
string/level mark values before audit, keep reusable calculation constants such as base-16 out of
the prompt-specific-number guardrail, and treat fixed-response model answers such as `A and E` as
duplicates of separate answer keys instead of dropping the question. The extracted CS paper passed
through import-ready D1 dry-run with no existing-paper conflicts and 580 planned SQL statements.

The canary did not prove cross-paper Computer Science chain reuse because no existing-chain context
was supplied; all 38 chains were created new. Batch imports that claim reuse must pass
`--existing-chain-input-root` or `--existing-chains` into the chain phase, then report reused,
updated, and created counts from `codex-chain-summary.json` and public route-visible multiplicity
after any D1 write.

The first deployed route crawl for this canary failed only the 10 asset HEAD routes because the D1
write was performed manually from the import-ready artifact before running the R2 upload helper. The
main `scripts/run-codex-production-import-pipeline.mjs --import` path uploads referenced assets
before the D1 write; if a manual import path is used for diagnostics, run
`scripts/upload-r2-images.mjs` with the extraction asset root and reconciled JSON before claiming
route health.

Computer Science Paper 2 June 2023 follow-up, 2026-07-01:

| Phase                              | Artifact                                                                                                                                                                                     | Wall time | Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Codex PDF extraction               | `tmp/codex-humanities-cs-followup-v8/aqa-computer-science-2023-june-paper-2-computing-concepts-qp/raw/aqa-computer-science-2023-june-paper-2-computing-concepts-qp.json`                     |  956.402s |            51 |              2 |           2,427,464 |    2,202,112 |                 44,715 |            5,278 | 44 questions, 90 marks, deterministic validation passed                                                                                    |
| Independent Codex extraction judge | `tmp/codex-humanities-cs-followup-v8/aqa-computer-science-2023-june-paper-2-computing-concepts-qp/extraction-judge/judge-report.json`                                                        |  194.710s |            27 |              0 |             656,517 |      497,664 |                  8,791 |            2,651 | pass, score 0.99, 44 refs checked, 0 required repairs                                                                                      |
| Codex answer-chain reconciliation  | `tmp/codex-humanities-cs-followup-v8/aqa-computer-science-2023-june-paper-2-computing-concepts-qp/chain-reconciled/aqa-computer-science-2023-june-paper-2-computing-concepts-qp.json`        |  652.357s |            40 |              0 |           1,281,240 |    1,181,696 |                 34,524 |           15,118 | 4 reused, 39 created, 1 updated, chain validation passed, legacy style judge skipped                                                       |
| Strict audit / D1 dry-run          | `tmp/codex-humanities-cs-followup-v8/aqa-computer-science-2023-june-paper-2-computing-concepts-qp/import-ready-audit-confidence.json`                                                        |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 44/44 kept, 0 audit errors/warnings; legacy per-question solvability not run                                                               |
| D1 import write                    | `tmp/codex-humanities-cs-followup-v8/aqa-computer-science-2023-june-paper-2-computing-concepts-qp/import-ready-confidence/aqa-computer-science-2023-june-paper-2-computing-concepts-qp.json` |   34.177s | 631 SQL stmts |              0 |                 n/a |          n/a |                    n/a |              n/a | 44 questions, 44 overlays, 148 mark rows, 80 checklist rows, 36 model answers, 33 answer keys, 44 chain links, no missing grading evidence |
| Deployed crawl                     | `tmp/public-route-checks/aqa-computer-science-2023-june-paper-2-computing-concepts-qp-after-import.json`                                                                                     |   64.546s |    225 routes |              0 |                 n/a |          n/a |                    n/a |              n/a | all question/chain/practice/constellation/image routes passed; 5 multi-paper chains visible across 2 papers                                |

This run deliberately exercised the cross-paper safety guard. The first D1 dry-run blocked because
Codex proposed updating the existing `cs-chain-logic-gate-truth-table-match` chain, which was
already attached to a 2024 Paper 2 question. Manual cross-paper inspection showed the update only
generalized "gate symbol" to "gate cue", so it still fit the 2024 OR-gate truth-table question and
the new 2023 XOR truth-table question. Only after that check did the write use
`--allow-shared-chain-updates`. The deployed route crawl confirmed there were no chains linked to
multiple papers but showing only one public question.

Computer Science Paper 2 June 2022 follow-up, 2026-07-02:

| Phase                                 | Artifact                                                                                                                                                                                        | Wall time | Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex PDF extraction                  | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/raw/aqa-computer-science-2022-june-paper-2-computing-concepts-qp.json`              |  879.575s |            54 |              1 |           2,742,139 |    2,447,872 |                 41,778 |            5,480 | 45 questions, 90 marks, deterministic validation passed; one harmless `identify` race before a crop existed                                        |
| Independent Codex extraction judge    | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/extraction-judge/judge-report.json`                                                 |  243.256s |            33 |              0 |           1,211,551 |      934,912 |                 10,466 |            2,597 | pass, score 1.00, 45 refs checked, 0 required repairs                                                                                              |
| Codex answer-chain reconciliation     | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/chain-reconciled/aqa-computer-science-2022-june-paper-2-computing-concepts-qp.json` |  559.805s |            31 |              0 |           1,050,747 |      932,352 |                 28,940 |           12,521 | 9 reused, 34 created, 2 updated, 0 review; deterministic chain validation passed; legacy chain style judge skipped                                 |
| Strict audit / D1 dry-run             | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/import-ready-strict-media-fix-audit.json`                                           |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 45/45 kept, 0 audit errors/warnings; D1 dry-run passed with 595 planned SQL statements and `safeToReplace`; Codex solvability run separately below |
| Codex solvability v2                  | `tmp/codex-solvability-cs2022-v2/codex-solvability-summary.json`                                                                                                                                |  322.605s |            34 |              2 |             769,266 |      671,744 |                 15,482 |            5,208 | failed 44/45: Q11.0 stored alternative Unicode/ASCII answers as literal strings such as `119 or 77` instead of canonical answers plus aliases      |
| Alias-fixed strict audit / D1 dry-run | `tmp/codex-humanities-cs-identity-safe-v3/work/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/import-ready-alias-fix-audit.json`                                                  |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 45/45 kept, 0 audit errors/warnings; D1 dry-run passed with 595 planned SQL statements                                                             |
| Codex solvability v3                  | `tmp/codex-solvability-cs2022-v3-alias-fix/codex-solvability-summary.json`                                                                                                                      |  263.114s |            24 |              0 |             709,143 |      562,176 |                 13,148 |            4,502 | passed 45/45 after importer normalization converted literal alternatives into `correctAnswer` plus `aliases`                                       |

This run exposed two importer problems that would have made a correct Codex extraction look bad in
the app or in import accounting:

- `labeled-lines` now preserves per-field line counts and fixed-response answer keys through
  normalization, D1 import, server data loading, grading parsing, and the Svelte response renderer.
  This is needed for mixed response areas such as Q01.2's four working lines plus one hexadecimal
  answer line and Q04.1's separate three-line answer areas for system software and application
  software.
- Referenced `Figure`/`Table` warnings now accept learner-visible structured source data blocks
  when the source figure is a string/table rather than a diagram. This keeps CS 2022 Q17.2 and
  Q18.1/Q18.3/Q18.4/Q18.5 in the strict import-ready subset while still requiring real image assets
  for diagram or label-on-image response surfaces such as Q17.3.
- Fixed-response alternatives now normalize into machine-readable aliases before import. The Codex
  solvability judge caught Q11.0 because `119 or 77` style literal answer strings are not a
  deterministic grading key. The prompt, helper validation, shared import normalizer, subset
  builder, and D1 importer now preserve `{correctAnswer, aliases}` and block raw literal
  alternatives when they have not been normalized.

Later CS 2022 Paper 2 deployed repair, 2026-07-03:

- Artifact: `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/chain-reconciled/aqa-computer-science-2022-june-paper-2-computing-concepts-qp.repaired-q17-3.json`.
- The new deterministic guard `known_huffman_tree_answer_key_swapped` blocks Q17.3 Huffman-tree
  label swaps. Correct visual mapping is root-left/code `0 = I`, node-7-right/code `11 = S`, and
  node-3-right/code `101 = P`.
- Focused Codex repair: 140.602s, 30 command actions, 4 failed actions, 430,999 input tokens,
  324,096 cached input tokens, 5,656 output tokens, and 1,341 reasoning tokens. It preserved the
  paper and repaired the Q17.3 key.
- Strict audit/import-ready: `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/import-ready-repaired-q17-3`, 45/45 kept, 0 dropped, 0 errors/warnings.
- Codex solvability: `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2022-june-paper-2-computing-concepts-qp/codex-solvability-repaired-q17-3-summary.json`, 234.428s, 17 command actions, 0 failed actions, 421,539 input tokens, 316,416 cached input tokens, 11,981 output tokens, 3,382 reasoning tokens, passed 45/45.
- D1 targeted write used `--allow-shared-chain-updates` only after inspecting the six shared-chain
  generalizations; it inserted/replaced 45 questions, 45 overlays, 160 mark rows, 70 checklist rows,
  37 model answers, 36 answer keys, and 45 chain links.
- Deployed route crawl:
  `tmp/public-route-checks/aqa-computer-science-2022-june-paper-2-computing-concepts-qp.json`,
  228 routes, 0 failures, 45 questions, 45 chains, 13 public multi-paper chains, and no raw
  multi-paper chain that rendered as a single visible question.

Computer Science Paper 1A June 2024 deployed import, 2026-07-03:

| Phase                                     | Artifact                                                                                                                                                                                                                                                 | Wall time | Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | -------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------- |
| Q08 trace-table focused repair            | `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp/raw/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp.repaired-q08-trace.json`      |  187.631s |           n/a |            n/a |             447,722 |      412,672 |                  8,197 |            1,444 | repaired Q08.0 so the trace response includes retained intermediate weeks states [4,0,0], [4,6,0], [4,6,2] and final weeksTotal 12                 |
| Independent extraction judge after Q08    | `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp/extraction-judge-repaired-q08-summary.json`                                                                                  |  576.794s |           n/a |            n/a |           4,887,691 |    4,280,320 |                 20,255 |            5,388 | failed score 0.82; found ten line/grid-count defects, which became source-specific prompt and deterministic guards                                 |
| Line-count repair                         | `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp/raw/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp.repaired-q08-linecounts.json` |   84.640s |            13 |              0 |             153,619 |       96,256 |                  3,521 |              390 | repaired Q02.4/Q02.5/Q03.1/Q04.2/Q09.3/Q11.0/Q12.6/Q12.7/Q13.0/Q14.2/Q15.0 response counts                                                         |
| Independent extraction judge after counts | `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp/extraction-judge-repaired-q08-linecounts-summary.json`                                                                       |  316.314s |           n/a |            n/a |           1,451,903 |    1,289,728 |                 13,628 |            2,539 | passed score 1.00, 36 refs checked, 0 required repairs                                                                                             |
| Codex answer-chain reconciliation         | `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp/codex-chain-repaired-q08-linecounts-summary.json`                                                                            |  446.370s |           n/a |              0 |             551,278 |      456,192 |                 23,451 |            8,606 | 35 created, 1 updated existing (`cs-chain-database-field-data-type`), 0 reused/review; chain validation passed                                     |
| Q03.2 paired-boundary focused repair      | `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp/extraction-repair-q03-2-paired-v1-summary.json`                                                                              |  112.920s |            20 |              3 |             172,609 |      130,560 |                  5,556 |            1,994 | repaired unsafe independent aliases for boundary test data/result pairs; deterministic validation passed                                           |
| Strict audit / D1 dry-run                 | `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp/import-ready-audit-repaired-q08-linecounts-q03pair-dryrun-allow-shared.json`                                                 |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 36/36 kept, 0 dropped, 0 audit errors/warnings; dry-run safe with one reviewed shared-chain update and 555 planned inserts                         |
| Codex solvability                         | `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp/codex-solvability-repaired-q08-linecounts-q03pair-summary.json`                                                              |  286.827s |            27 |              1 |             832,508 |      763,392 |                 14,099 |            4,531 | passed 36/36 after preserving literal `<`, `>`, `                                                                                                  |     | `, and `>=` in learner-visible context text |
| D1 targeted write                         | `tmp/codex-humanities-cs-full-v6/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp/import-ready-audit-repaired-q08-linecounts-q03pair-import.json`                                                              |       n/a | 555 SQL stmts |              0 |                 n/a |          n/a |                    n/a |              n/a | wrote 36 questions, 36 overlays, 114 mark rows, 88 checklist rows, 25 model answers, 26 answer keys, and 33 chain links                            |
| Deployed crawl                            | `tmp/public-route-checks/aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp.json`                                                                                                                                |   75.074s |    174 routes |              0 |                 n/a |          n/a |                    n/a |              n/a | all question, practice, chain, and constellation routes returned 200; 1 public multi-paper chain visible across 2 papers; no asset routes required |

This run added two repeatable importer safeguards:

- Learner-visible context flattening now removes only actual HTML tags and preserves literal
  Computer Science operators such as `<`, `>`, `||`, and `>=`. The previous broad tag-stripper made
  correct JSON look unsolvable by turning `while (userNumber < 1 || userNumber > 100)` into
  `while (userNumber  100)` in the solvability context.
- `known_paired_boundary_answer_encoded_as_independent_aliases` blocks table-answer keys where two
  cells are conditionally paired. Q03.2 boundary values `0/101` must pair with `Invalid number`, while
  `1/100` must pair with `Valid number entered`; independent aliases would accept wrong cross-pairs.
  The extraction and repair prompts now tell Codex to use labelled/free response fields plus
  markChecklist/modelAnswer pairing guidance until the app has a structured paired-table response.

The D1 write allowed exactly one shared-chain update after cross-paper inspection:
`cs-chain-database-field-data-type` generalized from `field values -> suitable type` to
`stored value -> suitable type`, which still fits the existing 2023 `DepositPaid` data-type question
and the new 2024 `year = 2021` data-type question. Live route verification showed the chain renders
both questions publicly.

Computer Science Paper 2 June 2021 deployed import, 2026-07-03:

The official inputs are `data/aqa-gcse-history-geography-computer-science/question-papers/AQA-85202-QP-NOV21.PDF`
and `data/aqa-gcse-history-geography-computer-science/mark-schemes/AQA-85202-MS-NOV21.PDF`.
The filenames say `NOV21`, but the visible PDF identity is June 2021, component `8520/2`, so the
source id is `aqa-computer-science-2021-june-paper-2-written-assessment-qp`.

| Phase                              | Artifact                                                                                                                                                                                       | Wall time | Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex PDF extraction               | `tmp/codex-humanities-cs-2021-paper-2-v2/work/aqa-computer-science-2021-june-paper-2-written-assessment-qp/raw/aqa-computer-science-2021-june-paper-2-written-assessment-qp.json`              |  773.786s |            39 |              1 |           3,026,008 |    2,691,584 |                 36,263 |            4,820 | 34 questions, 80 marks, deterministic extraction validation passed                                                                                               |
| Independent Codex extraction judge | `tmp/codex-humanities-cs-2021-paper-2-v2/work/aqa-computer-science-2021-june-paper-2-written-assessment-qp/extraction-judge/judge-report.json`                                                 |  207.985s |            25 |              0 |             662,137 |      549,376 |                  9,253 |            2,118 | pass, score 1.00, 34 refs checked, 0 required repairs                                                                                                            |
| Codex answer-chain reconciliation  | `tmp/codex-humanities-cs-2021-paper-2-v2/work/aqa-computer-science-2021-june-paper-2-written-assessment-qp/chain-reconciled/aqa-computer-science-2021-june-paper-2-written-assessment-qp.json` |  526.426s |            32 |              1 |           1,503,557 |    1,385,984 |                 25,410 |            8,646 | 11 reused, 23 created, 0 updated/review; deterministic chain validation passed after one in-run repair                                                           |
| Strict audit / D1 dry-run          | `tmp/codex-humanities-cs-2021-paper-2-v2/work/aqa-computer-science-2021-june-paper-2-written-assessment-qp/import-ready-doc-dry-run.out`                                                       |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 34/34 kept, 0 dropped, 0 audit errors/warnings; existing-paper replacement safe, 11 shared chains all `reuse_existing`, 0 unsafe shared updates, 514 dry-run SQL |
| Codex solvability                  | `tmp/codex-humanities-cs-2021-paper-2-v2/work/aqa-computer-science-2021-june-paper-2-written-assessment-qp/codex-solvability/solvability-report.json`                                          |  247.441s |            31 |              2 |             664,527 |      519,168 |                 11,910 |            2,698 | passed 34/34; Q03 Figure 1 bit pattern rendered as structured equation text, no fragile screenshot needed                                                        |
| R2 asset upload                    | `tmp/codex-humanities-cs-2021-paper-2-v2/work/aqa-computer-science-2021-june-paper-2-written-assessment-qp/codex-extraction/assets`                                                            |       n/a |     3 objects |              0 |                 n/a |          n/a |                    n/a |              n/a | uploaded Figure 2, Figure 3, and Table 3 assets under `images/papers/aqa-computer-science-2021-june-paper-2-written-assessment-qp/`                              |
| D1 targeted write                  | `tmp/codex-humanities-cs-2021-paper-2-v2/work/aqa-computer-science-2021-june-paper-2-written-assessment-qp/import-ready/aqa-computer-science-2021-june-paper-2-written-assessment-qp.json`     |       n/a | 514 SQL stmts |              0 |                 n/a |          n/a |                    n/a |              n/a | wrote 34 questions, 34 overlays, 141 mark rows, 72 checklist rows, 27 model answers, 34 answer keys, and 34 chains                                               |
| Deployed route crawl               | `tmp/public-route-checks/aqa-computer-science-2021-june-paper-2-written-assessment-qp-after-import.json`                                                                                       |   73.391s |    173 routes |              0 |                 n/a |          n/a |                    n/a |              n/a | all public question, practice, chain, constellation, and 3 asset routes returned 200; 11 public multi-paper chains and no single-visible multi-paper chain       |

This run encoded two repeatable importer fixes rather than patching D1 by hand:

- The first chain attempt proposed two `update_existing` actions for shared public chains and the D1
  dry-run blocked them. `scripts/run-codex-answer-chains.mjs` now defaults to no shared-chain updates:
  reuse unchanged public definitions when they fit, or create a new chain id when wording would need to
  change. `--allow-shared-chain-updates` is now an explicit opt-in passed through the production
  pipeline only after cross-paper compatibility review.
- Referenced-media validation now accepts a labelled structured `equation`, `formula`, `math`, or
  `code` block as the learner-visible surface for a referenced figure when that block contains the full
  visual content. CS 2021 Paper 2 Q03 uses this for `Figure 1` (`1 0 1 1 0 0 0 0`), while true diagram
  and screenshot dependencies still require assets.

Computer Science Paper 1 June 2021 deployed import, 2026-07-03:

The official inputs are `data/aqa-gcse-history-geography-computer-science/question-papers/AQA-85201-QP-NOV21.PDF`
and `data/aqa-gcse-history-geography-computer-science/mark-schemes/AQA-85201-MS-NOV21.PDF`.
The filenames say `NOV21`, but the visible PDF identity is June 2021, component `8520/1`, so the
source id is `aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp`.

| Phase                              | Artifact                                                                                                                                                                                                                                       | Wall time | Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex PDF extraction               | `tmp/codex-humanities-cs-2021-paper-1-v1/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp/raw/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp.json`                   | 1229.726s |            59 |              1 |           6,031,808 |    5,552,128 |                 49,801 |            8,143 | 31 questions, 80 marks, deterministic extraction validation passed; one harmless `identify` call ran before the Q07 assets existed                                        |
| Independent Codex extraction judge | `tmp/codex-humanities-cs-2021-paper-1-v1/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp/extraction-judge/judge-report.json`                                                                              | 1079.597s |            40 |              6 |           1,393,024 |    1,073,152 |                  9,856 |            1,637 | passed score 0.98, 31 refs checked, 0 required repairs; verified fragile line counts including Q05.3, Q06.2, Q07.6, and Q09.3                                             |
| Codex answer-chain reconciliation  | `tmp/codex-humanities-cs-2021-paper-1-v1/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp/chain-reconciled/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp.json`      |  555.975s |            28 |              0 |           1,390,298 |    1,262,080 |                 28,951 |           12,690 | 8 reused, 23 created, 0 updated/review; deterministic chain validation passed                                                                                             |
| Codex solvability before fix       | `tmp/codex-humanities-cs-2021-paper-1-v1/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp/codex-solvability-summary.json`                                                                                  |  351.679s |            26 |              1 |             738,501 |      569,856 |                 16,563 |            7,023 | failed 29/31 because Q09.1/Q09.2 rendered only unlabelled drawing boxes; the extracted JSON already contained 3x4 and 4x7 grid metadata                                   |
| Codex solvability after grid fix   | `tmp/codex-humanities-cs-2021-paper-1-v1/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp/codex-solvability-grid-fix-summary.json`                                                                         |  527.053s |            30 |              3 |             769,052 |      653,312 |                 17,143 |            7,645 | passed 31/31 after solvability context, import, server loading, and renderer preserved `drawing-box.grid` and row labels                                                  |
| Strict audit / D1 dry-run          | `tmp/codex-humanities-cs-2021-paper-1-v1/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp/import-ready-grid-fix-dry-run-audit.json`                                                                        |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 31/31 kept, 0 dropped, 0 audit errors/warnings; D1 dry-run safe with 479 planned statements and seven shared reuse-only chains                                            |
| R2 asset upload                    | `tmp/codex-humanities-cs-2021-paper-1-v1/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp/codex-extraction/assets`                                                                                         |       n/a |     2 objects |              0 |                 n/a |          n/a |                    n/a |              n/a | uploaded Q07 Figure 6 and Figure 7 under `images/papers/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp/`                            |
| D1 targeted write                  | `tmp/codex-humanities-cs-2021-paper-1-v1/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp/import-ready-grid-fix/aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp.json` |       n/a | 479 SQL stmts |              0 |                 n/a |          n/a |                    n/a |              n/a | wrote 31 questions, 31 overlays, 109 mark rows, 87 checklist rows, 24 model answers, 39 answer keys, and 29 chains                                                        |
| Deployed route crawl               | `tmp/public-route-checks/aqa-computer-science-2021-june-paper-1-grid-fix.json`                                                                                                                                                                 |   69.022s |    153 routes |              0 |                 n/a |          n/a |                    n/a |              n/a | all public question, practice, chain, constellation, and 2 asset routes returned 200; 7 public multi-paper chains and no raw multi-paper chain rendered as single-visible |

This run encoded the grid-answer fix in the importer path rather than patching D1 rows. `drawing-box`
now supports `grid`, `rowLabels`, and `columnLabels` across extraction schema, strict helper
validation, import normalization, D1 render overlays, server-side hydration, Svelte rendering, and
solvability context. The validator distinguishes real printed grid/cell/square answer surfaces from
plain drawing areas such as logic-circuit boxes that mention a truth table.

Geography Paper 1 June 2023 repair canary, 2026-07-02:

| Phase                                   | Artifact                                                                                                                                                                                                               | Wall time |   Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                                           |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | --------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Codex PDF extraction                    | `tmp/codex-humanities-geography-repair-v23/work/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp/raw/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp.json`              | 1894.550s |             116 |              2 |           9,333,595 |    8,632,832 |                 62,333 |            8,236 | 39 questions, 103 printed marks, mechanical validation passed after in-run Figure 15 and Figure 7/context repairs                                |
| Repo normalization and extraction judge | `tmp/codex-humanities-geography-repair-v23/work/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp/extraction-judge-repo-normalized/judge-report.json`                                            |  383.959s |              72 |              3 |           1,660,994 |    1,459,712 |                 15,978 |            3,486 | independent judge passed, score 1.00, 39 refs checked, 0 required repairs                                                                        |
| Codex answer-chain reconciliation       | `tmp/codex-humanities-geography-repair-v23/work/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp/chain-reconciled/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp.json` |  605.327s |              24 |              0 |             854,287 |      772,096 |                 30,483 |           13,729 | 35 created, 4 reused, 0 updated/review, 37 unique chain ids; deterministic chain validation passed                                               |
| Strict audit / D1 dry-run               | `tmp/codex-humanities-geography-repair-v23/work/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp/import-ready-current-dry-run-audit.json`                                                       |       n/a |             n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | current-code rerun passed; 39/39 kept, 0 dropped, 0 audit errors/warnings; D1 dry-run passed with 651 planned SQL statements and `safeToReplace` |
| Codex solvability                       | `tmp/codex-humanities-geography-repair-v23/work/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp/codex-solvability-summary.json`                                                                |  322.597s |              25 |              0 |             847,480 |      696,320 |                 11,938 |            2,922 | passed 39/39                                                                                                                                     |
| R2 asset upload                         | `tmp/codex-humanities-geography-repair-v23/work/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp/codex-extraction/assets`                                                                       |       n/a |      18 objects |              0 |                 n/a |          n/a |                    n/a |              n/a | uploaded all 18 referenced images under `images/papers/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp/`                 |
| D1 targeted write                       | `tmp/codex-humanities-geography-repair-v23/work/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp/import-ready-current-write-audit.json`                                                         |       n/a |   651 SQL stmts |              0 |                 n/a |          n/a |                    n/a |              n/a | targeted write passed; 39 questions, 39 overlays, 177 mark rows, 77 checklist rows, 28 model answers, 13 answer keys, 37 chains                  |
| Deployed route crawl                    | `tmp/public-route-checks/aqa-geography-2023-june-paper-1-living-with-the-physical-environment-qp-after-import.json`                                                                                                    |       n/a | 209 HTTP routes |              0 |                 n/a |          n/a |                    n/a |              n/a | all public question, chain, practice, constellation, and 18 asset routes returned 200                                                            |

This run is the repeatability pattern for Geography imports. The accepted artifact was not
hand-edited: Codex ran from the official question paper, mark scheme, examiner report, and OS-map
insert PDFs; deterministic helper normalization then removed duplicated `contextText` that repeated
rendered block text before the independent judge reran. The helper now rejects raw duplicate
`contextText` that survives normalization with `context_text_duplicates_render_block`.

The artifact was then promoted with the same production import path used for the Science and
Computer Science canaries: current-code strict audit/D1 dry-run, referenced R2 image upload, targeted
D1 write with `--check-existing --import`, and a deployed public-route crawl. Live D1 now has the
source document with 39 question rows and the crawl verified every public route emitted by those
questions and chains.

The run exposed two Geography-specific importer rules that are now encoded in prompts and helper
validation rather than patched into one output:

- Copyright-blanked Figure 7 food webs may be represented as faithful structured learner-visible
  source tables, but exact organism labels such as `Large water plant` must be preserved and the
  source must not label that organism as the producer before the learner answers.
- Figure/source crops must exclude surrounding setup or prompt text; OCR-detected phrases such as
  `Study Figure`, `Using Figure`, `With the help of Figure`, and `Shade one circle only` are blocking
  crop contamination unless they belong in separate `stemBlocks` or `promptBlocks`.

Geography Paper 2 June 2023 repair canary, 2026-07-03:

| Phase                              | Artifact                                                                                                                                                                                                                                       | Wall time | Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------- |
| Codex PDF extraction               | `tmp/codex-humanities-geography-repair-v43-2023p2-figure6-source-fix/work/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp/raw/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp.json`              | 1145.399s |            91 |              2 |           7,055,029 |    6,696,960 |                 48,017 |            4,671 | 40 questions, 114 printed marks, deterministic validation passed after in-run crop repairs                                      |
| Independent Codex extraction judge | `tmp/codex-humanities-geography-repair-v43-2023p2-figure6-source-fix/work/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp/extraction-judge/judge-report.json`                                                           |  373.521s |            66 |              3 |           1,217,751 |    1,037,312 |                 17,116 |            3,844 | pass, score 0.98, 40 refs checked, 0 required repairs; verified Figure 6 text plus all three photographs                        |
| Codex answer-chain reconciliation  | `tmp/codex-humanities-geography-repair-v43-2023p2-figure6-source-fix/work/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp/chain-reconciled/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp.json` |  525.190s |            19 |              0 |             811,968 |      733,696 |                 27,398 |           13,443 | 0 reused, 40 created, 35 unique chain ids; deterministic chain validation passed                                                |
| Codex solvability before fix       | `tmp/codex-humanities-geography-repair-v43-2023p2-figure6-source-fix/work/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp/codex-solvability-summary.json`                                                               |  428.384s |            23 |              2 |           1,247,986 |    1,077,760 |                 18,657 |            6,091 | failed 37/40; Q04.1/Q05.1/Q06.1 rendered only the percentage line in solvability context and omitted fixed choice options       |
| Codex solvability after fix        | `tmp/codex-humanities-geography-repair-v43-2023p2-figure6-source-fix/work/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp/codex-solvability-contextfix-summary.json`                                                    |  423.480s |            28 |              1 |           1,027,123 |      757,248 |                 19,298 |            7,344 | passed 40/40 after `labeled-lines` solvability contexts exposed `choiceOptions` plus labelled written fields                    |
| Strict audit / D1 dry-run          | `tmp/codex-humanities-geography-repair-v43-2023p2-figure6-source-fix/work/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp/import-ready-audit.json`                                                                      |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 40/40 kept, 0 dropped, 0 audit errors/warnings; D1 dry-run passed with 586 planned statements and `safeToReplace`               |
| R2 asset upload                    | `tmp/codex-humanities-geography-repair-v43-2023p2-figure6-source-fix/work/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp/codex-extraction/assets`                                                                      |       n/a |    13 objects |              0 |                 n/a |          n/a |                    n/a |              n/a | uploaded all 13 referenced images under `images/papers/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp/` |
| D1 targeted write                  | `tmp/codex-humanities-geography-repair-v43-2023p2-figure6-source-fix/work/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp/import-ready/aqa-geography-2023-june-paper-2-challenges-in-the-human-environment-qp.json`     |       n/a | 586 SQL stmts |              0 |                 n/a |          n/a |                    n/a |              n/a | targeted write passed; 40 questions, 40 overlays, 134 mark rows, 62 checklist rows, 36 model answers, 13 answer keys, 35 chains |
| Deployed route crawl               | `tmp/public-route-checks/aqa-geography-2023-paper-2-after-import.json`                                                                                                                                                                         |   81.450s |    203 routes |              0 |                 n/a |          n/a |                    n/a |              n/a | all public question, question-chain, practice, chain, constellation, and 13 asset routes returned 200                           |

This canary was produced by the production Codex SDK path from the official question paper, mark
scheme, examiner report, and insert PDFs. The earlier failed runs are intentionally preserved as
evidence: v36 failed solvability because Q01.3/Figure 2 lacked the x-axis scale needed to plot 350
reports; v42 passed that repair but the independent extraction judge failed Q02.3 because Figure 6
was text-only and omitted the three Southampton Science Park photographs.

The accepted v43 run encoded those findings in the production path rather than hand-patching D1:

- The PDF extraction prompt now calls out Geography 2023 Paper 2 Q01.3/Figure 2 and Q02.3/Figure 6
  as fragile source surfaces, including verified 180 DPI crop coordinates. Helper validation now
  rejects missing Figure 2 scale evidence and text-only Figure 6 outputs.
- Crop contamination validation forced Codex to repair Figure 4, Figure 5, Figure 10, and Figure 12
  source crops so setup/prompt text such as `Study Figure` and `Shade one circle only` is rendered as
  text blocks, not inside image assets.
- `labeled-lines` solvability context now includes embedded fixed `choiceOptions` before labelled
  written fields. This matches the product renderer and prevents false solvability failures for
  mixed fixed-choice plus written-response items such as Q04.1, Q05.1, and Q06.1.

Geography Paper 1 June 2024 OS-map repair canary, 2026-07-03:

| Phase                                    | Artifact                                                                                                                                                                                                                                                         | Wall time | Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | ------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex PDF extraction                     | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/raw/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp.json`                                      | 1219.288s |            95 |              3 |           5,145,719 |    4,622,336 |                 44,188 |            3,341 | 38 questions, 103 printed marks, deterministic validation passed                                                                                              |
| Independent Codex extraction judge       | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/extraction-judge/judge-report.json`                                                                                    |  294.696s |            45 |              0 |           1,282,089 |    1,092,096 |                 12,656 |            2,229 | pass, score 1.00, 38 refs checked, 0 required repairs                                                                                                         |
| Codex answer-chain reconciliation        | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/chain-reconciled/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp.validation-repaired-v2.json`  |  526.611s |            17 |              0 |             375,066 |      303,104 |                 28,283 |           15,377 | 32 created, 6 reused, 0 updated/review, 34 unique chain ids; deterministic chain validation passed                                                            |
| Strict audit before solvability          | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/import-ready-audit-validation-repaired-v2.json`                                                                        |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 38/38 kept, 0 dropped, 0 audit errors/warnings                                                                                                                |
| Codex solvability before fix             | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/codex-solvability-validation-repaired-v2/solvability-report.json`                                                      |       n/a |            48 |              2 |                 n/a |          n/a |                    n/a |              n/a | failed 33/38; Q02.3 word bank did not render in judge context, and Figures 16/18 crops omitted OS-map northings, grid square 7109, or point Y                 |
| Codex extraction repair from solvability | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/chain-reconciled/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp.solvability-repaired-v1.json` |  423.185s |            52 |              6 |           1,332,572 |    1,108,480 |                 17,636 |            7,858 | repaired Q02.3 word-bank rendering and recropped Figure 16/18 from official rendered pages; 38 questions, 103 marks, validation passed                        |
| Codex solvability after fix              | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/codex-solvability-solvability-repaired-v1/solvability-report.json`                                                     |  444.892s |            18 |              2 |           1,701,371 |    1,533,440 |                 15,110 |            4,153 | passed 38/38                                                                                                                                                  |
| Strict audit / D1 dry-run                | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/import-ready-audit-dry-run-solvability-repaired-v1.json`                                                               |       n/a |           n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 38/38 kept, 0 dropped, 0 audit errors/warnings; D1 dry-run passed with 526 planned statements, no existing source document, no ID collisions, `safeToReplace` |
| R2 asset upload                          | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/codex-extraction-solvability-repair-v1/assets`                                                                         |       n/a |    15 objects |              0 |                 n/a |          n/a |                    n/a |              n/a | uploaded all 15 referenced images under `images/papers/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/`                              |
| D1 targeted write                        | `tmp/codex-humanities-geography-repair-v30-2024p1-linecounts/work/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp/import-ready-audit-imported-solvability-repaired-v1.json`                                                              |       n/a | 526 SQL stmts |              0 |                 n/a |          n/a |                    n/a |              n/a | targeted write passed; 38 questions, 38 overlays, 99 mark rows, 71 checklist rows, 28 model answers, 13 answer keys, 34 chains; no missing grading evidence   |
| Deployed route crawl                     | `tmp/public-route-checks/aqa-geography-2024-june-paper-1-living-with-the-physical-environment-qp-after-solvability-repair-import.json`                                                                                                                           |   80.664s |    197 routes |              0 |                 n/a |          n/a |                    n/a |              n/a | all public question, practice, chain, constellation, and 15 asset routes returned 200; 5 public multi-paper chains and 7 public multi-question chains         |

The accepted artifact was repaired by the Codex SDK production path, not by editing D1 rows. The
failed solvability report became input to `scripts/run-codex-extraction-repair.mjs`, which used the
official question paper and mark scheme plus rendered pages to replace the incomplete OS-map crops.
The new Figure 16 crop includes the full grid frame, eastings 07-12, northings 69-73, scale bar,
north arrow, and points X/Y. The new Figure 18 crop includes eastings 70-74, northings 09-14, grid
square 7109, scale bar, north arrow, and points X/Y.

This canary added three repeatability rules to the importer:

- The extraction and extraction-repair prompts now require Ordnance Survey and grid-reference map
  crops to include readable eastings/northings, scale, north arrow, all referenced grid squares, and
  all measurement endpoints. A tight embedded crop is invalid when coordinate labels live in the
  rendered-page margins.
- `buildLearnerVisibleQuestionContext` renders `key` blocks whose `items` are plain strings, so
  word-bank questions such as Q02.3 expose `chain`, `consumer`, `increase`, `producer`, `reduce`,
  and `web` to solvability judges and app renderers.
- `codex-import-helper.mjs validate-chain` now checks answer chains against exact fixed-response
  answers, and `scripts/run-codex-answer-chains.mjs` can launch a bounded Codex validation-repair
  turn when deterministic chain validation fails. This aligned standalone `validate-chain` with the
  stricter import-ready audit that caught the earlier Q02.3 `producer role` chain wording.

History Paper 1 Section A Option B Germany June 2024 canary, 2026-07-02:

| Phase                              | Artifact                                                                                                                                                                                                                                                                   | Wall time |  Actions/calls | Failed actions | Input/prompt tokens | Cached input | Output/response tokens | Reasoning tokens | Result                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------: | -------------: | -------------: | ------------------: | -----------: | ---------------------: | ---------------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex PDF extraction               | `tmp/codex-humanities-history-canary-v5-full/work/aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp/raw/aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp.json`              |  471.323s |             59 |              2 |           1,534,080 |    1,345,536 |                 23,175 |            3,587 | 6 questions, 40 marks, deterministic validation passed, 0 review refs                                                                        |
| Independent Codex extraction judge | `tmp/codex-humanities-history-canary-v5-full/work/aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp/extraction-judge/judge-report.json`                                                                                     |  212.913s |             34 |              1 |             742,458 |      614,912 |                  9,175 |            2,363 | pass, score 1.00; line counts verified as 22, 24, 50, 25, 51, 75                                                                             |
| Codex answer-chain reconciliation  | `tmp/codex-humanities-history-canary-v5-full/work/aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp/chain-reconciled/aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp.json` |  276.238s |             20 |              0 |             839,958 |      776,192 |                 13,836 |            7,025 | 0 reused, 6 created, 0 updated/review; deterministic chain validation passed                                                                 |
| Codex solvability                  | `tmp/codex-humanities-history-canary-v5-full/work/aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp/codex-solvability/solvability-report.json`                                                                              |   93.728s |             16 |              1 |             268,181 |      193,024 |                  4,437 |            1,029 | passed 6/6                                                                                                                                   |
| Strict audit / D1 dry-run          | `tmp/codex-humanities-history-canary-v5-full/work/aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp/import-ready-audit.json`                                                                                                |       n/a |            n/a |              0 |                 n/a |          n/a |                    n/a |              n/a | 6/6 kept, 0 dropped, 0 audit errors/warnings; D1 dry-run passed with 136 planned statements and `safeToReplace`                              |
| D1 targeted write                  | `tmp/codex-humanities-history-canary-v5-full/work/aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp/import-ready-write-audit.json`                                                                                          |       n/a |  136 SQL stmts |              0 |                 n/a |          n/a |                    n/a |              n/a | targeted write passed; 6 questions, 6 overlays, 37 mark rows, 25 checklist rows, 6 model answers, 6 chain links, no missing grading evidence |
| Deployed route crawl               | `tmp/public-route-checks/aqa-history-2024-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp-after-import.json`                                                                                                                               |   14.004s | 30 HTTP routes |              0 |                 n/a |          n/a |                    n/a |              n/a | all public question, chain, practice, and constellation routes returned 200                                                                  |

This run is the repeatability pattern for History imports with copyright-withheld source text. The
accepted artifact was produced by the production batch runner from the official question paper, mark
scheme, examiner report, and insert PDFs. No historical `question-paper.txt` or `mark-scheme.txt`
benchmark dump was supplied as prompt input.

The run exposed three History/importer rules that are now encoded in prompts and helper packaging:

- A copyright-withheld interpretation/source can use a neutral learner-visible substitute only when
  official mark-scheme/examiner-report evidence is enough to make the question answerable without
  giving away the answer. In that case provenance belongs in `reviewNotes`, learner-visible blocks
  must not contain phrases such as `official evidence`, `mark scheme evidence`, `reconstructed`, or
  `source unavailable`, and `needsHumanReview` should remain false. Set `needsHumanReview=true`
  only when the official evidence is insufficient or contradictory.
- History answer-book continuation pages must be counted from rendered pages. For this canary the
  independent judge verified 03.1 as 23+27 lines, 05.1 as 24+27 lines, and 06.1 as 22+27+26 lines.
- `helper.mjs validate-chain` must use the same answer-chain specificity checks as the import-ready
  subset builder and fail warnings that would otherwise drop questions at import time. The chain
  prompt also forbids question-specific years/dates/counts in visible answer-chain fields, including
  step explanations and common omissions.

Because `helper.mjs` now imports the shared specificity checker, every isolated Codex work directory
that copies `helper.mjs` must also copy `answer-chain-specificity.mjs`; this applies to extraction,
extraction-judge, and chain runs.

History Paper 1 Section A 2020 Germany and America D1 imports, 2026-07-05:

| Paper                  | Work root                                                                                                                        |                                                                   Extraction |                                                  Extraction judge |                                  Chains |         Solvability |                                                 D1/routes |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------: | ----------------------------------------------------------------: | --------------------------------------: | ------------------: | --------------------------------------------------------: |
| Option B Germany Nov20 | `tmp/codex-history-batch-v2/aqa-history-2020-june-paper-1-section-a-option-b-germany-1890-1945-democracy-and-dictatorship-qp`    |                       437.247s, 52 actions, 0 failed, 1,884,097 input tokens | 221.360s, pass 0.98, 42 actions, 0 failed, 1,159,801 input tokens | 297.510s, 2 reused, 4 created, 0 review | 94.185s, 6/6 passed | 6 questions, 40 marks, D1 write passed, route crawl 30/30 |
| Option A America Nov20 | `tmp/codex-history-america-v4/aqa-history-2020-june-paper-1-section-a-option-a-america-1840-1895-expansion-and-consolidation-qp` | 504.298s, 78 actions, 2 failed contact-sheet retries, 2,910,538 input tokens |   180.877s, pass 0.97, 22 actions, 0 failed, 642,944 input tokens | 242.093s, 4 reused, 2 created, 0 review | 97.210s, 6/6 passed | 6 questions, 40 marks, D1 write passed, route crawl 30/30 |

The 2020 Germany route crawl artifact is
`tmp/public-route-checks/aqa-history-2020-june-paper-1-section-a-option-b-germany-2020-after-import.json`.
It reported 30 routes checked, 0 failures, 2 public multi-question chains, and 2 public multi-paper
chains. The 2020 America route crawl artifact is
`tmp/public-route-checks/aqa-history-2020-june-paper-1-section-a-option-a-america-2020-after-import.json`.
It reported 30 routes checked, 0 failures, 4 public multi-question chains, and 4 public multi-paper
chains, with no raw multi-paper chain collapsed to a single visible question.

The America paper is the repeatability case for rendered answer-line counting in History option
papers. The production prompt now treats the line immediately after `Extra space` as
learner-writable but excludes page-frame and mark-box borders. For AQA 8145/1A/A Nov20 the expected
line counts are 01.1 = 22, 02.1 = 24, 03.1 = 50 (23 + 27), 04.1 = 25, 05.1 = 51 (24 + 27), and
06.1 = 75 (22 + 27 + 26). The extraction judge verified these counts from rendered official pages.

The independent extraction judge must evaluate the current schema fields. Valid imports may have
legacy `answer` or `markScheme` fields absent or null when `markSchemeItems`, `markChecklist`, and
`modelAnswer.answerText` contain the grading evidence. The judge should fail missing evidence in
those current fields, not fail solely because legacy fields are null.

The visible-PDF source identity audit for the AQA History, Geography, and Computer Science manifest
now blocks manifest rows whose visible PDF front matter disagrees with the manifest. After the
manifest series repair, the current audit artifact is
`tmp/aqa-manifest-source-identity-audit-after-series-repair-20260703.json`: 100 rows checked, 100
passed, 0 warnings, and 0 failures across 6 Computer Science, 15 Geography, and 79 History rows.
Earlier failing artifacts are preserved only as diagnostics.

Use phase-specific model and reasoning overrides when benchmarking. Codex extraction, independent
judging, answer-chain reconciliation, and solvability review default to non-fast `gpt-5.6-sol` with
`max` reasoning. Do not optimize cost ahead of extraction quality. Record wall time,
command actions, failed actions, input/cached/output/reasoning tokens, question count, mark total,
validation results, chain results, solvability results, D1 dry-run results, and artifact paths.

Every `@ljoukov/llm.generateJson()` extractor, judge, and repair call must be durably logged. By
default, `scripts/lib/llm-extraction-pipeline.mjs` writes JSONL records to
`tmp/llm-extraction-logs/<run-id>.jsonl`; pass `--run-id=<stable-id>` to
`scripts/extract-paper-llm.mjs` or set `EXTRACTION_RUN_ID=<stable-id>` for direct library/batch judge
calls. Set `EXTRACTION_LLM_LOG_DIR=<dir>` to redirect logs or `EXTRACTION_LLM_LOG=0` to disable them
only for local debugging. Log records must include:

- `llm_call_started` with call label, model, thinking level, media resolution, timeout, attempt
  limit, text character count, and image count/byte estimates.
- `llm_call_event` for the library-emitted stream events, including `thought` deltas, response
  deltas, model-version events, blocked events, and usage events. If the provider exposes only
  reasoning summaries, the log contains those summaries, not hidden internal state.
- `llm_call_completed` with success/failure, duration, model version, token usage, `costUsd`, raw
  text size, output text size, thought text size, and compact output counts such as question refs or
  repaired refs.

Use the summary command to inspect accounting and stuck/active calls:

The legacy `scripts/run-production-extraction-pipeline.mjs` still writes
`production-extraction-summary.json` for old chunk/batch benchmark compatibility. New Codex SDK runs
write phase-specific summaries such as `codex-extraction-summary.json`, `codex-chain-summary.json`,
and `codex-production-import-summary.json` instead.

```sh
pnpm run summarize:llm-extraction-logs
pnpm run summarize:llm-extraction-logs -- --log-dir=tmp/llm-extraction-logs --since=2026-06-27
pnpm run summarize:llm-extraction-logs -- --run-id=aqa-84611h-qp-nov20-full-logged-20260627004414
```

Cost is observability only. It can help estimate a run, detect runaway retries, or compare prompt
changes, but it must not drive production extraction quality decisions. Keep the configured model
and phase-specific reasoning level unless a quality eval and human review justify a change.
Production LLM JSON calls default to three attempts so transient malformed JSON, truncated output,
or network timeouts do not stop a paper after one provider failure.

On the full AQA Biology Paper 1 November 2020 cached extraction candidate, a monolithic extraction
judge prompt with 46 questions and 36 images timed out after 600 seconds. The parent-aware batched
judge at `medium` reasoning completed seven batches in 322.76 seconds, cost about `$1.0434`, and
found real renderability defects such as missing/cropped figure assets and fallback graph-canvas
assets. A comparable `xhigh` batch run had a single batch take 290 seconds, so do not use `xhigh` as
the extraction-judge default without a newer benchmark.

For normal PDFs, the CLI runs an independent rubric judge by default after extraction. The judge sees
candidate JSON, deterministic findings, selected question-paper page text, and rendered selected
question-paper page images, not the extractor's private context, and must score from 0 to 1. It must
ground missing-prompt or missing-figure claims in that supplied source evidence, not infer extra
instructions from the numeric answer or mark scheme. Use `--skip-judge` only for local debugging when
you explicitly want deterministic checks without another LLM call.

A failed judge must never be relabelled as a model pass. In the exceptional case where one or more
complete independent audits checked the exact paper and each returned a closed, source-unambiguous
finding set, a reviewed-source closure may avoid another costly whole-paper rerun. A repair closure
must preserve every failed report and thread, say `modelJudgePass: false`, hash the before/after
artifact and every changed field, cite the exact official question-paper or mark-scheme anchor for
every repaired ref, and rerun deterministic validation across the full ref and mark inventory with
zero blockers.

A source-reviewed false-positive closure is narrower. It is allowed only when exact official source
evidence directly disproves every failed finding and no candidate repair is warranted. It must archive
the original failed report, thread, events, prompt, candidate, and judge snapshot; bind the exact
official source hashes and page-level anchors; record each finding as
`false_positive_no_candidate_change`; prove the before/after candidate hashes and canonical hashes are
identical with an empty changed-path set; and pass the same full-inventory deterministic validation.
It must not invent a field repair or erase the failed model audit.

For either form, the closure status is `passed_after_reviewed_source_closure`, not `passed`, and
release evidence must keep that distinction. Timed-paper approval may accept it only through the
strict closure validator for the relevant closure type; an ordinary manual override, missing hash,
missing source anchor, partial audit, unresolved repair, or unproven false-positive claim still fails
closed.

Automatic repair attempts must include unresolved `needsHumanReview` rows, not only failed reusable-chain
checks. The CLI first runs a question-quality repair pass for flagged refs, then a text-only answer-chain
repair pass. A repair model may clear `needsHumanReview` only when it has returned concrete repaired
fields and removed or narrowed the review notes; deterministic audit and the learner-facing solvability
judge still decide import readiness. Do not use repair attempts to auto-approve copyright-placeholder
media, unknown figure crops, missing parent context, or fallback full-page assets that have not been made
intentionally learner-visible.

The batch harness must treat unresolved `needsHumanReview` flags as raw-output blockers even when a
previous rubric or solvability eval file says `passed`. Existing outputs with review flags must be sent
through pre-judge repair again, or be excluded by the import-ready subset builder. A stale passing eval
does not make a review-marked question publishable.

When chunked extraction is merged, recompute run-level review state from unresolved child question,
asset, checklist, model-answer, and chain flags plus durable document-level problems. Do not preserve
chunk-window notes such as "question X began on a lookahead page" as paper-level review blockers after
the later chunk has extracted that question.

Extraction chunks must include prior context pages as well as lookahead pages. Prior context is how the
extractor recovers parent stems, previous subpart values, tables, figures, and diagrams for questions
such as `05.7` whose own prompt begins after the source context. The default CLI window is
`--context-pages=2`; increase it for papers where a parent question spans more pages. Prior context
pages are never extraction starts: they are visible evidence only for core-page target questions.
The planned core-page groups are recorded in `extractionRun.pageSelection.plannedChunkCorePages` so
latency and quality audits can see whether a run used parent-question chunks or fixed page windows.

There are two kinds of tests:

- Mechanical tests such as `pnpm run test:extraction-pipeline` check schemas, script wiring, prompt
  guardrails, and deterministic chain-specificity rules.
- The LLM integration test `pnpm run eval:extraction-pipeline-llm` renders a golden PDF/mark-scheme
  pair, runs the extractor with the configured model, and then asks a separate judge call to compare
  the output semantically against golden concepts and forbidden chain values.

Production paper runs also need a learner-facing solvability judge. This is separate from the
answer-chain judge. It assembles the same extracted learner-visible bundle a student should see for a
target ref such as `05.7`: parent group context, all earlier subparts in that group, the target
prompt, tables, media references, response controls, and any attached local image assets. A separate
LLM then tries to answer using only that visible bundle and compares the attempted answer against the
target mark-scheme evidence. It must fail when the answer depends on a missing table, graph, figure,
diagram, previous-part value, or response control.

Run it against already extracted JSON with:

```sh
pnpm run eval:question-solvability -- \
  --input-root=data/vision-extracted/aqa-separate-science-higher \
  --recursive --paper=aqa-84611h-qp-nov20 \
  --question=01.9 \
  --output=tmp/aqa-84611h-qp-nov20.solvability.eval.json \
  --model=chatgpt-gpt-5.5 --thinking-level=xhigh
```

Use `--all` or omit `--question` for a full audit. The AQA batch runner can run this gate with
`--solvability-mode=question-batches`; it is intentionally opt-in because it is one LLM call per
rendered learner-visible question. The result is written separately from the chain judge, under
`tmp/aqa-separate-science-solvability-evals` by default, so a paper can be blocked for a
learner-visible rendering defect even when its chain quality is acceptable.

Label-only media is not a valid published extraction for interactive media. When `response.kind` is
`asset-canvas` or `image-label-zones`, the referenced graph, diagram, or image must appear in
`assets` with a usable `filePath`, `publicPath`, or `r2Key`. A row such as
`{"sourceLabel":"Figure 1"}` is only a note that the asset exists in the source PDF; it is not enough
for the learner-facing renderer or the solvability judge.

`response.unit` is learner-visible and means that the unit was already printed beside the answer
field. It must never be inferred from the mark scheme. If the paper asks the learner to give the unit,
or prints a separate blank labelled `Unit`, leave `response.unit` empty and make the written final
answer require the learner-supplied value and unit. Otherwise the extraction reveals a mark-scoring
answer and is not source-faithful.

Repair scripts must use the same media-reference contract. A local `filePath` is ideal for mechanical
inspection and upload, but `publicPath` or `r2Key` is still a concrete learner-visible reference; do not
generate a duplicate full-page fallback only because a pre-uploaded asset lacks `filePath`.

For existing extracted JSONs that predate this rule, run the deterministic response-asset repair
before judging/importing:

```sh
pnpm run repair:extraction-response-assets -- \
  --input-root=data/vision-extracted/aqa-separate-science-higher \
  --recursive --paper=aqa-84611h-qp-nov20 \
  --repair-text-references
```

The repair renders the official question-paper page and attaches it as a review-marked fallback asset
when an interactive response only had a label. Prefer a precise crop when available, but a concrete
page image is better than a broken learner-facing asset reference. Pass
`--repair-text-references` when the audit reports learner-visible text such as "Use Figure 2" but no
asset was attached; the generated asset is still marked `needsHumanReview`.

`needsHumanReview` means the extractor or repair script could not prove the row is publishable. Treat
it as an import blocker, not as a vague warning or a normal end state. Common causes are full-page
fallback assets that need cropping/confirmation, source-page figure mismatches, copyright placeholder
media, unsupported response controls, or chain text that still looks prompt-specific. The normal
workflow is to run the mechanical repair scripts, LLM repair, deterministic audits, and learner-facing
solvability judge until the flag is cleared by evidence. Only source-ambiguous media or genuinely
uncertain official-material cases should remain for manual review. Do not clear the flag by prompt
instruction alone: clear it only after the source asset/render control has been fixed and the
mechanical audit plus learner-facing solvability judge pass. A reviewed asset must also point to the
correct numbered source PDF page; for example, an asset labelled `Figure 4` with `pageNumber: 19` is
invalid if the source page text does not contain `Figure 4`.

Physical ruler tasks need a web-safe measurement surface. Do not rely on responsive image CSS or a
device's physical CSS-pixel size. When the official mark scheme requires measuring a printed image,
attach source-verified `paperMeasurement` metadata to the exact official crop: horizontal axis,
source pixel width, pixels per millimetre derived from the embedded PDF/image density, and a concise
learner instruction. The public renderer provides two movable guides and a live original-paper-mm
readout. The solvability judge must verify the calibration against the local asset; invented,
unverified, or inconsistent density remains import-blocking.

Before importing existing exported artifacts, run the aggregate extracted-data audit:

```sh
pnpm run audit:current-exported-data

pnpm run repair:extracted-data -- \
  --input-root=data/vision-extracted/aqa-separate-science-higher \
  --recursive --write

pnpm run repair:answer-chain-specificity -- \
  --input-root=data/vision-extracted/aqa-separate-science-higher \
  --recursive --write \
  --model=chatgpt-gpt-5.5 --thinking-level=xhigh \
  --concurrency=4 \
  --fail-on-blocking

pnpm run audit:extracted-data -- \
  --input-root=data/vision-extracted/aqa-separate-science-higher \
  --recursive --run-solvability \
  --concurrency=4 \
  --fail-on-warnings \
  --output=tmp/aqa-separate-science-extracted-data-audit.json \
  --model=chatgpt-gpt-5.5 --thinking-level=xhigh
```

Without `--run-solvability`, the audit is a cheap mechanical gate over current JSON files: schema
validity, reusable answer-chain specificity, fixed-response answer keys, written-response model
answers, response-control slots, positive chain evidence, source provenance, grading evidence, and
concrete media file references. It also flags learner-visible questions that say to use a figure,
graph, diagram, or image without attaching a concrete media asset, and rejects public-paper
copyright placeholders as valid substitutes for the original stimulus. With `--run-solvability`, it
then runs the
learner-facing LLM judge only for artifacts that passed the mechanical gate, unless
`--include-mechanical-failures` is set. Use this command as the catch-up audit for already
exported/import-ready problems, not only for new extraction runs.
The command prints a compact terminal summary and writes the full JSON report to `--output`; pass
`--format=json` when another script needs the complete report on stdout.
Use `--fail-on-warnings` for an import-ready gate. Warnings include `needsHumanReview`; those outputs
may be useful for debugging and repair, but they should not be imported until the repair loop and
source/media checks clear the flag. Manual review is reserved for cases where the source documents are
ambiguous after the automated repair and judge passes have been attempted.

If a full paper is partially blocked by unpublishable or unreviewed questions, build an import-ready
subset instead of weakening the importer:

```sh
pnpm run build:import-ready-extracted-subset -- \
  --input-root=data/vision-extracted/aqa-separate-science-higher \
  --output-root=tmp/import-ready-extracted/aqa-separate-science-higher \
  --recursive

pnpm run audit:extracted-data -- \
  --input-root=tmp/import-ready-extracted/aqa-separate-science-higher \
  --recursive --fail-on-warnings

pnpm run prepare:import-ready-extraction -- \
  --input-root=data/vision-extracted/aqa-separate-science-higher \
  --output-root=tmp/import-ready-extracted/aqa-separate-science-higher
```

The subset builder drops questions with deterministic errors, warnings, `needsHumanReview` flags, or
review-marked assets/chains. It does not clear review flags, invent replacement figures, or modify
the source extraction. Use it for progressive imports only when publishing a clean subset is better
than blocking all clean questions behind one copyright placeholder or review-only repair.
`prepare:import-ready-extraction` is the production gate around that subset: by default it builds the
subset, audits it strictly, and runs per-paper import dry-runs. Add `--import` only when those dry-runs
should write to D1.

Withdrawn questions, replacement notices, statistics-only rows, and mean-mark/max-mark lines are not
learner-facing questions. If the source materials do not contain the original prompt plus positive
marking criteria, the extractor must omit that subquestion. The deterministic gate treats withdrawal
notes and statistics as non-positive evidence, so those rows cannot justify a placeholder answer
chain.

For existing exports that already contain those rows, use `repair:extracted-data` as a mechanical
patch before import. It is a dry-run unless `--write` is passed. The repair only drops
withdrawn/statistics-only question rows and removes unsupported answer-chain tail steps; it does not
invent missing source text, media, answer keys, or new chain content. Run `repair:extraction-response-assets`
separately for interactive media that needs a concrete page image or crop. Run the separate
text-only chain grouping or `repair:answer-chain-specificity` phase for chains that still contain
prompt-specific worked values; then the specificity audit verifies whether the repair actually
removed blocked chain text.

The production output shape is the import-shaped JSON used by `import:vision`: `sourceDocument`,
`markSchemeDocument`, optional `supportingDocuments`, atomic `questions`, render blocks, response
objects, assets, mark-scheme items, checklist items, written-response model answers,
fixed-response answer keys, answer chains, common weak answers, review flags, and local asset
manifest. A compact extraction schema may be used only inside small golden fixtures; it is not the
production artifact.

Source provenance is required, not optional. Each production artifact must preserve stable
`sourceDocument.id`, `markSchemeDocument.id`, source URLs when available, local file paths, file
hashes, per-question `sourceQuestionRef`, `pageStart`, `pageEnd`, and mark-scheme `sourceRef`
values. The importer persists these to `source_documents`, `questions`, and mark-scheme rows so a
future UI can link back to the official question formulation, paper page span, or mark-scheme
evidence without re-extracting PDFs.

When existing chain context is supplied to the chain grouping phase, that phase must compare each
candidate chain to existing chain ids. It should reuse an id when the ordered method is the same,
keep the old id when clarifying wording for a compatible chain, and create a new id only for
genuinely new mark-scoring reasoning. The optional `chainResolution` field records
`reuse_existing`, `update_existing`, `create_new`, or `needs_review` for audit. A marked question
with `answerChain.id: null` is extraction-complete but not publishable: hold it out of the import
subset until the chain grouping phase assigns a stable compatible chain id.

Build the compatibility context from already-audited extracted JSON, preferably the import-ready
subset rather than raw review-marked outputs:

```sh
pnpm run build:existing-chain-context -- \
  --input-root=tmp/import-ready-extracted/aqa-separate-science-higher \
  --output=tmp/existing-chain-context.json

pnpm run reconcile:answer-chains -- \
  --input-root=data/vision-extracted/aqa-separate-science-higher \
  --output-root=tmp/chain-reconciled/aqa-separate-science-higher \
  --existing-chains=tmp/existing-chain-context.json \
  --model=chatgpt-gpt-5.5 \
  --thinking-level=xhigh \
  --fail-on-blocking
```

The context builder deduplicates by `answerChain.id`, keeps representative question refs, and omits
questions or chains still marked `needsHumanReview`. This makes the model's compatibility decision
source-backed without exposing an unbounded dump of all prior questions. The reconciliation script is
the production text-only chain phase: it reads extraction-complete JSON, repairs placeholder or bad
chain fields with `repairFullPaperAnswerChains`, records `chainResolution`, runs the independent
answer-chain judge unless `--skip-judge` is passed for local debugging, and writes a separate
reconciled tree for the import-ready subset builder. It should not re-render PDFs or modify prompt,
response, mark-scheme, checklist, model-answer, or asset fields except through the dedicated
question-quality repair path.

The deterministic golden fixture is:

```text
tests/golden/answer-chain-quality.json
```

Run it with:

```sh
node scripts/test-answer-chain-golden.mjs
```

The fixture should contain minimal examples of allowed generic chains, rejected worked-solution
chains, and warning-only numeric recall cases. When a new failure mode appears, add or update a
golden example before changing the audit rule.

The pipeline-level LLM golden fixture is:

```text
tests/golden/extraction-pipeline-spring-energy.json
```

Run the full extractor-plus-judge eval with:

```sh
node scripts/eval-extraction-pipeline-llm.mjs --run-llm \
  --write-candidate=tmp/extraction-pipeline-candidate.json \
  --write-result=tmp/extraction-pipeline-result.json
```

This eval creates a tiny synthetic question-paper PDF and mark-scheme PDF, renders them to images,
passes those images plus this extraction spec to the extractor model, then runs:

- schema validation,
- mechanical golden checks for forbidden chain values and required model/checklist values,
- the answer-chain specificity audit, and
- an independent LLM judge over the candidate JSON and golden fixture.

Use `--candidate=<json>` to judge an existing extractor output without rerunning extraction. A pass
requires both the mechanical checks and the semantic judge to pass. The judge should focus on
conceptual equivalence, not exact wording: the chain must capture the reusable method, while worked
numbers stay in model/checklist evidence.

The extraction pipeline may run bounded repair loops with `--repair-attempts=<n>`, but keep the
phases separate:

- PDF-to-question extraction recovers source-grounded prompt, response, asset, and mark-scheme
  evidence. It creates placeholder chains only.
- `pnpm run codex:answer-chains` runs the text-only per-paper Codex chain workflow. It can reuse,
  update, create, or mark review from mark evidence and existing-chain context. If it updates or
  generalizes a published chain, it must check every available already-attached example in the
  supplied context; otherwise it should split/create a new chain.
- `pnpm run review:d1-answer-chain-reuse` runs the Codex D1 publication review for already-imported
  draft chains. Default `--candidate-mode=clean` is for conservative post-import promotion of
  no-review, mechanically complete, multi-paper chain groups. `--candidate-mode=review` is for
  flagged/demoted groups where Codex and a manual evidence pass decide whether review flags can be
  cleared for a safe cross-paper subset. Neither mode is a substitute for per-paper answer-chain
  reconciliation.
- `pnpm run reconcile:answer-chains` remains the legacy `@ljoukov/llm` text-only chain workflow for
  diagnostic comparisons and focused repair runs.
- `pnpm run prepare:import-ready-extraction` builds the strict import-ready subset, runs the
  learner-facing solvability judge, and performs the targeted D1 import dry-run or write.

The model does not get filesystem write tools in repair/generalization phases except through the
terminal submit tool managed by the script. The production process must not expose arbitrary shell or
D1 write access to the extractor or chain agents.

After extraction or repair, run an independent reviewer pass. The reviewer can be a second scripted
LLM judge or a separate fresh-context agent, but it should see only candidate JSON, the golden fixture
or rubric, and deterministic findings. It should not see the extractor's private context. It should
report `accept`, `repair`, or `uncertain`; it should not edit files or import to D1. The import step
only runs after the main process applies repairs and reruns the checks.

### Chain Reuse Decision

Two questions can share an answer chain when:

- Their mark-scoring answers require the same ordered reasoning links.
- Missing the same link would lose marks in both questions.
- The model answers can be explained by the same chain with only context words changed.

They should not share a chain when:

- They are only in the same topic.
- One requires a different causal mechanism.
- One is pure recall and the other is reasoning.
- One requires a calculation method and the other requires conceptual explanation.

Compact chain examples that should guide future Codex chain extraction/review:

- `IVF sequence`: `collect eggs -> lab fertilise -> embryo divides -> uterus transfer`. This is
  reusable across IVF process questions, but it must not be attached to separate one-mark hormone,
  target-organ, microscope, ratio, or ethics questions.
- `Rf equation`: `distances -> divide -> rearrange -> round`. This is reusable across
  chromatography Rf calculations where the target value changes, because the same ratio method earns
  the marks.
- `Crude oil`: `dead plankton -> buried sediment -> compressed -> long time`. This is a compact
  formation recall chain with concrete terms, not a generic `source -> process -> product` label.
- `Equilibrium shift`: `temp up -> exothermic forward -> shifts left`. This is acceptable for
  repeated one-mark Le Chatelier decisions with the same condition and direction, but should split
  from pressure, concentration, catalyst, or endothermic-temperature chains.
- `Food test`: `reagent -> treatment -> colour`. This is good only for food-test method questions;
  do not attach graph plotting, colorimeter interpretation, enzyme pH, or food-test calculation rows
  just because the source experiment uses iodine or food tests.

### Model Answers

A model answer should be source-derived and concise. It should include enough detail to satisfy the mark checklist, not a full textbook explanation.

`promptText`, `promptBlocks`, `leadBlocks`, and rendered table/figure blocks are learner-visible and
must stay faithful to the printed paper. Do not place answers from previous subquestions into those
fields. If a later subquestion is ambiguous when extracted alone, put the resolved context in
`selfContainedPromptText` or `contextText` for standalone grading/search, while keeping the rendered
prompt as printed. Example: for "How did the students deal with the anomalous result?", the rendered
prompt should not name the anomalous value, but `selfContainedPromptText` may identify it so a grading
judge can evaluate the answer without replaying the previous subpart.

Generate and store model answers only for written-response questions, such as free-text answer lines or labelled written answer spaces. Do not create model-answer rows for fixed-answer interactions such as multiple choice, image labels, matching, equation blanks, number-line answers, or any response where the UI can deterministically check a fixed key. For those questions, store the answer key in the response schema or `question_response_answer_keys` instead.

For written-response questions, the model answer must be student-facing answer text. It must never be a raw mark-scheme row, assessment objective, specification reference, examiner instruction, or truncated scoring fragment. Bad model answers include strings such as `01.2 positive charge is provided by 1 AO1; protons 6.4.1.2`, `4.4.1.1`, `A bold and is used...`, or any wording copied from generic mark-scheme guidance. The importer should reject or regenerate these rather than storing them.

For answer-chain step evidence, use only direct positive mark rows such as `mark`, `answer`,
`marking_point`, or `alternative_marking_point`. Do not point chain steps at `allow`, `accept`,
`guidance`, `ignore`, `reject`, `do_not_accept`, or `alternative` rows. When a source mark scheme
uses an `allow` row as a complete alternative answer, normalize that row to
`alternative_marking_point` before linking it from the chain; otherwise keep it as checklist guidance
only.

When a paper importer has enough mark-scheme evidence, it should generate the written-response model answer during import and store it in D1, so runtime grading can display the stored answer without spending another model call. Runtime grading may still use a model to evaluate a student's free-text response, but it should treat the stored model answer as source-grounded evidence, not ask the grading model to invent a fresh model answer.

Set derivation as:

- `source` when the answer is directly provided.
- `generated_from_mark_scheme` when composed from marking points.
- `human_reviewed` when reviewed and accepted.

Generated model answers should not be published without either high mark-scheme alignment confidence or human review.

### Fixed-Response Answer Keys

Fixed-response questions still need student-facing feedback. Prefer deterministic checking when the
correct response can be extracted confidently. Runtime grading must not spend an LLM call on fixed
interactions such as choices, choice tables, matching, equation blanks, number-line answers, or image
labels. If the structured key is missing, treat that as an import defect and leave the subpart
ungraded until `response.correctAnswers` or `question_response_answer_keys` is repaired.

For every fixed-response interaction, store the visible response format in the render overlay and
store the correct answer key either in `response.correctAnswers` or in
`question_response_answer_keys`:

- `choice`: use target id `answer`; store the correct option text or the printed letter when the
  paper only gives A/B/C/D choices.
- `choice-table`: use target id `answer`; store the selected row as the same `|`-joined text the
  UI emits. For "ring/select the value in Table N" prompts, keep the source table as a structured
  table block and make the choice-table rows selectable source cells such as
  `Temperature: 45 | Test 2 | 14.2`; do not use `asset-canvas` for a table that can be represented
  structurally.
- `matching`: use each left-side value or stable left-side id as the target id; store the matching
  right-side value.
- `equation-blanks`: use each blank id as the target id; store the correct value or expression for
  that blank. When a set of blanks accepts values in any order, also store an `unorderedGroups` entry
  with the target ids and allowed answer set so duplicate entries are not credited as a valid
  permutation.
- `number-line`: use target id `answer`; include unit, rounding, tolerance, or significant-figure
  requirements in `metadata_json` when exact string matching would be unsafe.
- `image-label-zones`: use each zone id as the target id; store the correct label.

Do not store a raw mark-scheme row such as `01.1 B 1 AO1` as a model answer. For fixed-response
questions, the model answer column should normally be empty; the answer key and mark scheme carry
the grading evidence.

Every fixed-response key should be student-checkable:

- Matching questions must store one key per left-side item and include any combined scoring rule in
  `metadata_json`, for example `2 marks for all three correct links; 1 mark for one or two correct
links`.
- Choice tables must store the selected row in exactly the same serialized form emitted by the UI,
  for example `Vacuole | Ribosome | Cell wall`.
- Alternative accepted fixed-response answers must be machine-readable. Store one canonical
  `correctAnswer` plus `aliases`, not a raw literal such as `"119 or 77"`, so D1 writes
  `aliases_json` and deterministic grading can accept all official variants.
- Calculation questions with visible working lines and a final answer blank should use a written
  response shape such as `labeled-lines` for the working and final answer line, with the worked
  calculation and final value in `modelAnswer` and `markChecklist`. Do not collapse a two-mark
  method-plus-answer calculation to a single final-answer blank.
- Numeric entries must store acceptable aliases and unit/tolerance notes in `aliases_json` and
  `metadata_json`; do not rely on exact string matching when scientific notation, Unicode minus
  signs, or units may vary.
- If the paper asks for more than one fixed written field, the render overlay must expose each field.
  Do not render a formula-plus-equation answer as a single `number-line`.

### Grading Evidence Audit

A paper import is incomplete until every published atomic question has at least one usable grading
evidence source:

- positive mark-scheme items,
- student-facing checklist items,
- a clean stored model answer for written-response questions,
- structured fixed-response answer keys, or
- reviewed answer-chain evidence.

Do not ship a paper with a fallback message such as "missing mark-scheme evidence". Missing rows must
be repaired from the official mark scheme, or the question must be held out of the public experiment.

Run a database audit after every import or repair. For the current experiment papers, use the same
shape as:

```sql
SELECT q.source_document_id, q.source_question_ref, q.id, q.marks,
       COALESCE(json_extract(qro.render_json, '$.response.kind'), 'missing') AS response_kind,
       COUNT(DISTINCT m.id) AS mark_rows,
       COUNT(DISTINCT c.id) AS checklist_rows,
       COUNT(DISTINCT ma.id) AS model_answers,
       COUNT(DISTINCT k.id) AS answer_keys
FROM questions q
LEFT JOIN question_rendering_overlays qro ON qro.question_id = q.id
LEFT JOIN mark_scheme_items m ON m.question_id = q.id
LEFT JOIN mark_checklist_items c ON c.question_id = q.id
LEFT JOIN model_answers ma ON ma.question_id = q.id
LEFT JOIN question_response_answer_keys k ON k.question_id = q.id
WHERE q.source_document_id IN (
  'aqa-8464b1h-qp-jun18',
  'aqa-8464p1h-qp-jun18',
  'aqa-8464b1h-qp-jun19',
  'aqa-8464c1h-qp-nov21'
)
GROUP BY q.id
ORDER BY q.source_document_id, q.display_order;
```

Treat any row with zero `mark_rows`, zero `checklist_rows`, zero `model_answers`, and zero
`answer_keys` as a blocking import defect. For fixed-response rows, also inspect that the answer-key
targets match the UI serialization. For written-response rows, inspect the stored model answer as a
human would; heuristic checks alone are not enough.

### Paper Import Workflow

Use this checklist when extracting another full paper and importing it into D1:

1. Pair the question paper and mark scheme, then extract source metadata and atomic question rows.
2. Extract the render overlay for each atomic question, including blocks, assets, marks, and the
   exact interactive response object.
3. Extract mark-scheme rows and split them into usable marking points. Keep `reject`, `ignore`, and
   examiner guidance as guidance, not as positive checklist rows. If an AQA `allow` or `accept` row is
   only a wording tolerance, keep it as guidance. If it is a complete independently credited answer
   route, normalize it as `alternative_marking_point` so answer-chain evidence can cover that route.
4. For written-response questions (`lines` or `labeled-lines`), generate a concise model answer from
   the mark-scheme evidence and reject answers that contain AO codes, spec codes, row numbers, or
   generic marking instructions.
5. For fixed-response questions, extract `correctAnswers` and insert rows into
   `question_response_answer_keys`; do not generate model answers for these unless the fixed response
   is actually a written answer in disguise.
6. Derive an answer chain for every published marked question. For pure recall or single-step fixed
   responses, use a compact generic recall/discrimination chain and keep the exact answer only in the
   answer key, mark-scheme rows, and checklist. For calculation chains, reject chain text that includes
   prompt-specific numeric substitutions or final numeric answers; those belong in written-response
   model answers, answer keys, and checklist rows.
7. Run the learner-facing solvability judge on the extracted artifact before import. It should include
   earlier subparts in the same parent group as visible context and attach local image assets when
   available. Treat missing required media, tables, parent context, response controls, or previous-part
   information as blocking extraction/render defects.
8. Import to D1, then run validation queries for question counts, render-overlay coverage,
   mark-scheme coverage, model-answer coverage, fixed-response answer-key coverage, and zero
   published questions with no usable grading evidence.
9. Open `/experiments/questions/<paper>` and a sample of single-question routes on desktop and
   mobile; inspect the rendered paper against the source and submit representative written and
   fixed-response answers through the real grading endpoint.
10. For any route that returns missing-evidence feedback, repair the D1 evidence from the official
    source or remove the question from the published experiment before handing the import off.

For extraction scripts or agents that generate import JSON, include this instruction in the task
prompt:

```text
For each rendered response object, emit the exact user-facing response format and, when the correct
answer is known from the mark scheme, emit response.correctAnswers. Use target id "answer" for a
single selected choice, each left-side id for matching, each blank id for equation blanks, and each
image-label zone id for labels. Fixed-response questions should normally set modelAnswer to null;
written-response model answers must be clean student answer text, not raw mark-scheme rows or
AO/spec notation.
```

### Common Weak Answers

Common weak answers should represent a realistic partial answer that misses one or more chain links.

Example:

```text
Less blood gets to the heart so it hurts.
```

This is useful because it can be mapped to missing links such as `oxygen`, `respiration`, and `energy`.

Do not invent a weak answer if the mark scheme gives no clear basis and the agent cannot identify a plausible missing link.

## Render Extraction Methodology

Question rendering extraction is LLM-assisted. It should not be treated as a plain PDF-to-text
conversion task. The extractor should use the model's visual judgement, page images, rendered
assets, and small geometry scripts together.

Recommended process:

1. Extract the semantic baseline: question references, prompt text, marks, parent context, assets,
   tables, and mark-scheme alignment.
2. Build a first render overlay from structured blocks and response interactions.
3. Render the source PDF page or cropped figure to an image.
4. Render the app view for the same question.
5. Use `view_image` or an equivalent browser screenshot inspection step to compare the PDF image
   and the app render visually. Look for missing figures, duplicated text, broken tables, bad
   formulae, wrong answer-line counts, and interaction controls that do not match the paper.
6. Use scripts only to propose geometry or repetitive structure. The LLM must still inspect and
   accept, adjust, or reject the result.
7. Store render interactions as explicit objects with provenance such as `llm-visual-review`,
   `pdf-geometry`, `vision-extracted`, or `script-candidate`. Do not hide important rendering
   structure in flat prompt text.

The practical rule is: if the question relies on visual layout, the agent should look. Text
extraction alone is not enough for exam papers.

### Visual Review Loop

During the experiment pass, the useful loop was:

1. Generate or import the D1 render overlay.
2. Open `/experiments/questions/<paper>` or `/experiments/questions/<paper>/<ref>`.
3. Compare the rendered question against a PDF page image using `view_image` or browser
   screenshots.
4. Fix the render overlay schema or extraction heuristic.
5. Re-import the affected paper and inspect again.

This found issues that text extraction missed:

- Figure references where the figure image was not rendered.
- Repeated options where MCQ or matching choices appeared once as dead text and again as
  interactive controls.
- Tables flattened into ordinary text.
- Chemical and physics formulae losing TeX structure.
- Mark brackets duplicated because one copy came from prompt text and one from the marks field.
- Copyright/footer text accidentally included in the question prompt.
- Image-label blanks that needed positioned targets on top of a figure.

### Dependency And Asset Guardrails

Single-question mode must render all dependencies needed by that question, including parent stems,
figures, tables, and graph canvases that were printed before the atomic subquestion. Whole-question
mode, such as `02`, should include the shared dependency once and then render each subquestion below
it. Do not solve this with route-specific hard-coding; store dependency blocks in the render object
and dedupe by rendered figure/table identity.

Standalone source labels need special handling:

- If a line is only `Figure N` or `Table N` and a figure/table block is generated for it, render the
  structured block and its caption.
- If no structured block is generated, drop the standalone label from paragraph text rather than
  merging it into a sentence. A common bad render is `shown in Figure 3 Figure 3`.
- It is acceptable for the visible page to show a sentence ending in `Figure 3` followed by a
  separate `Figure 3` caption and the actual image. That mirrors the paper; the problem is flattening
  the label into prose without the figure/table.

Missing figure assets can sometimes be inferred from local embedded PDF images, but only with a
review flag. The safe heuristic is narrow:

1. A standalone `Figure N` label appears in the relevant parent stem or prompt.
2. The baseline extraction has no asset with that label.
3. The relevant source page has exactly one embedded image candidate.
4. The importer creates a synthetic asset with `needs_human_review: true` and provenance such as
   `inferred_single_embedded_image_on_context_page`.
5. The visual reviewer confirms the app render against the PDF page image.

Do not keep a broad fallback that maps any referenced figure to any image on the same page. That
caused the wrong image to be used when a table or later graph shared the page. Also verify that the
chosen local image is available from R2; a correct D1 object still renders broken if the R2 key is
missing.

### Table Extraction Guardrails

Exam tables often arrive from PDF text extraction as flat lines. The importer can use scripts to
recover obvious tables, but the extracted table object should be visually checked:

- Support numeric-first rows such as `0.0 +24` and text-first rows such as `Acrylic 1200`.
- Support numbered trial rows where the first column is `1`, `2`, `3` and the printed header only
  names the measured value. Store this as a blank first heading plus the value heading, not as
  `Column 2`.
- Preserve units as inline TeX, for example `Density in $\\mathrm{kg/m^3}$`, and keep unit formulae
  non-wrappable in the renderer.
- If a table is successfully converted into a structured table, do not also render the same rows as
  ordinary prompt text.
- If a response asks the student to ring or identify a value in a table, represent the source table
  once as `structured-table` and encode the interaction as a table-cell `choice-table`. Reserve
  `asset-canvas` for graphs, diagrams, image marking, and other visual surfaces that cannot be
  represented structurally.
- Validate both `/experiments/questions/<paper>/<subquestion>` and
  `/experiments/questions/<paper>/<parent-question>`, because single-subquestion focus can expose
  missing dependencies and parent-question focus can expose duplicate shared dependencies.

### Answer-Line And Image-Label Geometry

For image-label questions, scripts can identify candidate answer lines in a figure. These are only
candidates. The LLM still needs to inspect the rendered result, because answer lines, table borders,
circuit wires, figure callout lines, and page rules can look similar to simple image processing.

The experiment used this kind of script to find long dark horizontal segments and convert them into
normalized target boxes:

```python
import json
import sys
from PIL import Image

img = Image.open(sys.argv[1]).convert("L")
w, h = img.size
pix = img.load()
segments = []

for y in range(h):
    x = 0
    while x < w:
        while x < w and pix[x, y] >= 80:
            x += 1
        start = x
        while x < w and pix[x, y] < 80:
            x += 1
        end = x
        if end - start >= max(180, int(w * 0.13)):
            segments.append((y, start, end))

clusters = []
for y, start, end in segments:
    for cluster in clusters:
        same_band = abs(cluster["y"] - y) <= 4
        overlaps = not (end < cluster["start"] - 20 or start > cluster["end"] + 20)
        if same_band and overlaps:
            cluster["ys"].append(y)
            cluster["start"] = min(cluster["start"], start)
            cluster["end"] = max(cluster["end"], end)
            cluster["y"] = sum(cluster["ys"]) / len(cluster["ys"])
            break
    else:
        clusters.append({"ys": [y], "y": y, "start": start, "end": end})

zones = []
for cluster in sorted(clusters, key=lambda item: (item["y"], item["start"])):
    line_width = cluster["end"] - cluster["start"]
    line_height = max(cluster["ys"]) - min(cluster["ys"]) + 1
    if line_width < max(180, int(w * 0.13)) or line_height > 8:
        continue

    zone_height = max(36, int(h * 0.075))

    # The printed line is a writing baseline, not the top of an input box.
    # Place the box mostly above the detected line so centered text reads naturally.
    y0 = int(cluster["y"] - zone_height * 1.05)

    zones.append(
        {
            "id": f"blank-{len(zones) + 1}",
            "label": f"Blank {len(zones) + 1}",
            "x": round(cluster["start"] / w, 4),
            "y": round(y0 / h, 4),
            "width": round(line_width / w, 4),
            "height": round(zone_height / h, 4),
        }
    )

print(json.dumps({"width": w, "height": h, "zones": zones}))
```

Known quirks:

- The detected line is often a text baseline. If an empty target box is placed directly on that
  line, the box looks too low and the eventual text baseline feels wrong.
- A target box should usually be opaque white so the original paper line does not show through the
  dashed box or filled answer.
- The vertical offset is empirical. The `1.05` factor above worked for one AQA atom-label figure,
  but it is not a general truth.
- Normalized `y` can be negative when the line is close to the top of the cropped asset. The
  renderer or extractor should clamp or review this depending on the asset crop.
- Horizontal-line detection may pick up unrelated figure geometry. Reject false positives during
  visual review instead of treating the script output as authoritative.
- If an answer target should be a label box rather than free text, the response object should
  represent that explicitly, for example as `image-label-zones` with a label bank.

Scripts like this are useful because they reduce manual coordinate entry. They are unsafe if used
alone. The extraction workflow should combine script candidates, LLM visual inspection with
`view_image`, and explicit provenance so questionable geometry can be reviewed later.

## Output Contract

The extraction agent should emit structured JSON before database insertion. The database importer can then normalize this JSON into rows.

Minimum shape:

<!-- prettier-ignore -->
```json
{
  "extraction_run": {
    "agent_version": "string",
    "started_at": "2026-06-21T00:00:00Z",
    "source_document_ids": ["source-doc-id"],
    "needs_human_review": false,
    "review_notes": []
  },
  "source_documents": [
    {
      "id": "source-doc-id",
      "doc_type": "question_paper",
      "board": "AQA",
      "qualification": "GCSE",
      "subject": "Combined Science",
      "tier": "Higher",
      "paper": "Biology Paper 1",
      "series": "June 2024",
      "component_code": "8464B1H",
      "source_url": "https://example.com/paper.pdf",
      "file_hash": "sha256:...",
      "page_count": 24
    }
  ],
  "questions": [
    {
      "source_question_ref": "01.2",
      "parent_source_question_ref": "01",
      "display_order": 12,
      "prompt_text": "Explain why reduced blood flow to the heart can cause chest pain.",
      "self_contained_prompt_text": "Explain why reduced blood flow to the heart can cause chest pain.",
      "self_containment": {
        "status": "self_contained",
        "is_self_contained": true,
        "requires_context": false,
        "requires_assets": false,
        "added_context": null,
        "required_asset_labels": [],
        "rationale": "Prompt can be practised without prior paper context.",
        "confidence": 0.9
      },
      "command_word": "Explain",
      "marks": 4,
      "topic_path": ["Biology", "Organisation", "Heart and blood vessels"],
      "spec_ref": null,
      "page_start": 5,
      "page_end": 5,
      "assets": [],
      "mark_scheme_items": [
        {
          "item_type": "mark",
          "text": "Less oxygen reaches heart muscle cells.",
          "marks": 1,
          "source_ref": "MS 01.2 row 1",
          "confidence": 0.92
        }
      ],
      "mark_checklist": [
        {
          "text": "Say that less oxygen reaches the heart muscle cells.",
          "required": true,
          "mark_scheme_item_indexes": [0],
          "confidence": 0.9
        }
      ],
      "model_answer": {
        "answer_text": "Reduced blood flow means less oxygen reaches the heart muscle cells, so they carry out less aerobic respiration and release less energy. This can cause chest pain.",
        "derivation": "generated_from_mark_scheme",
        "confidence": 0.86,
        "needs_human_review": false
      },
      "answer_chain": {
        "title": "Blood flow -> oxygen -> respiration -> energy -> effect",
        "canonical_chain_text": "blood flow -> oxygen -> respiration -> energy -> effect",
        "steps": [
          {
            "step_text": "Reduced blood flow",
            "step_role": "given",
            "common_omission": null,
            "mark_scheme_item_indexes": []
          },
          {
            "step_text": "Less oxygen reaches cells",
            "step_role": "link",
            "common_omission": "Student says blood is reduced but does not mention oxygen.",
            "mark_scheme_item_indexes": [0]
          }
        ],
        "confidence": 0.84,
        "status": "draft"
      },
      "common_weak_answers": [
        {
          "weak_answer_text": "Less blood gets to the heart so it hurts.",
          "explanation": "This names reduced blood flow but misses the oxygen, respiration, and energy links.",
          "missing_step_indexes": [1],
          "confidence": 0.74
        }
      ],
      "constellation_candidates": [
        {
          "answer_chain_title": "Blood flow -> oxygen -> respiration -> energy -> effect",
          "transfer_distance": "start",
          "fit_confidence": 0.84,
          "rationale": "The mark scheme requires the same oxygen, respiration, energy reasoning links."
        }
      ],
      "needs_human_review": false,
      "review_notes": []
    }
  ]
}
```

## Confidence And Review Rules

Use confidence scores from `0.0` to `1.0`.

Recommended fields:

- `source_confidence`: document metadata confidence.
- `question_segmentation_confidence`: question/subquestion boundary confidence.
- `mark_scheme_alignment_confidence`: confidence that marking points are linked to the right question.
- `topic_confidence`: topic/spec classification confidence.
- `answer_chain_confidence`: confidence in the derived chain.
- `constellation_fit_confidence`: confidence in chain reuse.

Set `needs_human_review` when:

- The question depends on a diagram or table that was not extracted reliably.
- The mark scheme uses level descriptors.
- The mark scheme has multiple valid answer routes.
- The extracted prompt or marks are incomplete.
- The question-to-mark-scheme pairing is uncertain.
- The answer-chain fit is below `0.75`.
- The model answer is generated and mark-scheme support is weak.
- The agent cannot tell whether a question is recall, calculation, or reasoning.
- The item may require rights or provenance review before public display.

Suggested publishing gate:

- Publish question metadata only when source and segmentation confidence are high.
- Publish mark checklist only when mark-scheme alignment confidence is high.
- Publish answer-chain pages only when the chain is reviewed or confidence is high and source support is clear.
- Publish constellation pages only after at least three questions have confident chain fit or a human has curated the set.

## D1 Storage Schema

D1 is SQLite-compatible. Store queryable objects in normal SQL rows. Store flexible or source-specific structures as JSON text in `TEXT` columns. JSON fields should contain valid JSON, but the application should validate this before insertion rather than relying only on database constraints.

### Schema Principles

- Source documents are immutable evidence records.
- Questions, mark-scheme items, answer chains, and constellations are first-class rows.
- Derived content must link back to source rows where possible.
- Draft and review status must be stored explicitly.
- Public pages should query normalized rows, not raw extraction blobs.
- Keep raw extraction JSON for audit and reprocessing.

### Core Tables

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE extraction_runs (
  id TEXT PRIMARY KEY,
  agent_name TEXT NOT NULL,
  agent_version TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'review_required')),
  source_document_ids_json TEXT NOT NULL DEFAULT '[]',
  raw_output_json TEXT,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  review_notes TEXT
);

CREATE TABLE source_documents (
  id TEXT PRIMARY KEY,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('question_paper', 'mark_scheme', 'examiner_report', 'insert', 'topic_test', 'other')),
  board TEXT,
  qualification TEXT,
  subject TEXT,
  tier TEXT,
  paper TEXT,
  component_code TEXT,
  series TEXT,
  year INTEGER,
  title TEXT,
  source_url TEXT,
  file_path TEXT,
  file_hash TEXT NOT NULL,
  page_count INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (file_hash)
);

CREATE TABLE source_pages (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  extracted_text TEXT,
  ocr_confidence REAL,
  page_image_path TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (source_document_id, page_number)
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id),
  parent_question_id TEXT REFERENCES questions(id),
  source_question_ref TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  command_word TEXT,
  marks INTEGER,
  board TEXT,
  qualification TEXT,
  subject TEXT,
  tier TEXT,
  paper TEXT,
  component_code TEXT,
  series TEXT,
  year INTEGER,
  topic_path_json TEXT NOT NULL DEFAULT '[]',
  spec_ref TEXT,
  page_start INTEGER,
  page_end INTEGER,
  answer_format TEXT,
  source_constraints_json TEXT NOT NULL DEFAULT '[]',
  extraction_confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  review_notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source_document_id, source_question_ref)
);

CREATE TABLE question_assets (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('diagram', 'table', 'graph', 'image', 'equation', 'source_text', 'other')),
  source_label TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  role TEXT CHECK (role IN ('context', 'read_data', 'identify_label', 'answer_canvas', 'source_text')),
  page_number INTEGER,
  bbox_json TEXT,
  alt_text TEXT,
  extracted_text TEXT,
  file_path TEXT,
  storage_key TEXT,
  public_path TEXT,
  extraction_confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE mark_scheme_items (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  source_document_id TEXT REFERENCES source_documents(id),
  display_order INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('mark', 'allow', 'accept', 'ignore', 'reject', 'guidance', 'level_descriptor', 'alternative', 'working', 'unit')),
  text TEXT NOT NULL,
  marks REAL,
  source_ref TEXT,
  confidence REAL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE mark_checklist_items (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  mark_scheme_item_ids_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE model_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  derivation TEXT NOT NULL CHECK (derivation IN ('source', 'generated_from_mark_scheme', 'human_reviewed')),
  supporting_mark_scheme_item_ids_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Answer-Chain Tables

```sql
CREATE TABLE answer_chains (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  canonical_chain_text TEXT NOT NULL,
  subject TEXT,
  broad_topic TEXT,
  summary TEXT,
  created_by TEXT NOT NULL CHECK (created_by IN ('extraction_agent', 'human', 'hybrid')),
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published', 'rejected')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE answer_chain_steps (
  id TEXT PRIMARY KEY,
  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  step_text TEXT NOT NULL,
  step_role TEXT NOT NULL CHECK (step_role IN ('given', 'cause', 'process', 'link', 'effect', 'evidence', 'method', 'calculation', 'conclusion')),
  explanation TEXT,
  common_omission TEXT,
  supported_by_mark_scheme_item_ids_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE (answer_chain_id, display_order)
);

CREATE TABLE question_answer_chains (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  fit_confidence REAL,
  fit_notes TEXT,
  transfer_distance TEXT NOT NULL DEFAULT 'unclassified' CHECK (transfer_distance IN ('start', 'near', 'stretch', 'exam_transfer', 'unclassified')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (question_id, answer_chain_id)
);

CREATE TABLE common_weak_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
  answer_chain_id TEXT REFERENCES answer_chains(id) ON DELETE CASCADE,
  weak_answer_text TEXT NOT NULL,
  missing_chain_step_ids_json TEXT NOT NULL DEFAULT '[]',
  explanation TEXT,
  source TEXT NOT NULL CHECK (source IN ('agent', 'observed', 'human')),
  confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  CHECK (question_id IS NOT NULL OR answer_chain_id IS NOT NULL)
);
```

### Constellation Tables

```sql
CREATE TABLE constellations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id),
  board TEXT,
  qualification TEXT,
  subject TEXT,
  tier TEXT,
  paper TEXT,
  topic_path_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'published', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE constellation_questions (
  id TEXT PRIMARY KEY,
  constellation_id TEXT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  transfer_distance TEXT NOT NULL CHECK (transfer_distance IN ('start', 'near', 'stretch', 'exam_transfer', 'unclassified')),
  role TEXT NOT NULL DEFAULT 'practice' CHECK (role IN ('start', 'practice', 'review', 'challenge')),
  rationale TEXT,
  confidence REAL,
  UNIQUE (constellation_id, question_id)
);
```

### Review And Issue Tables

```sql
CREATE TABLE extraction_issues (
  id TEXT PRIMARY KEY,
  extraction_run_id TEXT REFERENCES extraction_runs(id) ON DELETE CASCADE,
  source_document_id TEXT REFERENCES source_documents(id),
  question_id TEXT REFERENCES questions(id),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'blocker')),
  issue_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);

CREATE TABLE review_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('question', 'mark_scheme_item', 'mark_checklist_item', 'model_answer', 'answer_chain', 'constellation')),
  entity_id TEXT NOT NULL,
  reviewer TEXT,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject', 'edit', 'request_changes')),
  notes TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Suggested Indexes

```sql
CREATE INDEX idx_questions_public_lookup
  ON questions (qualification, board, subject, tier, paper, year, source_question_ref);

CREATE INDEX idx_questions_topic
  ON questions (subject, topic_path_json);

CREATE INDEX idx_mark_scheme_items_question
  ON mark_scheme_items (question_id, display_order);

CREATE INDEX idx_answer_chains_subject_topic
  ON answer_chains (subject, broad_topic, status);

CREATE INDEX idx_question_answer_chains_question
  ON question_answer_chains (question_id, is_primary);

CREATE INDEX idx_question_answer_chains_chain
  ON question_answer_chains (answer_chain_id, transfer_distance);

CREATE INDEX idx_constellation_questions_order
  ON constellation_questions (constellation_id, display_order);

CREATE INDEX idx_extraction_issues_open
  ON extraction_issues (severity, resolved_at);
```

## Import Workflow

### Chained-bank updates are additive and scope-reconciling

`pnpm run import:chained` must never clear the public bank or replay the schema during an ordinary
run. It upserts only the selected questions and the chains reached by their memberships, preserves
review-controlled publication status, then removes obsolete importer-owned child rows only inside
those imported question and chain IDs. All replacement rows are written first; the scoped child
cleanup is one transactional D1 batch. Unrelated questions, chains, manually published workflow
state, and `answer_chain_illustrations` rows remain untouched.

Every parent and child write is preflighted against its primary and secondary unique keys. An
existing row is mutable only when it carries this importer's explicit owner marker; an unknown,
legacy, curated, or foreign owner is preserved, and a conflicting planned write aborts the whole
import before the first mutation. Adoption is therefore an explicit, hash-checked repair operation
rather than an inference from a shared question id, chain id, generated id pattern, or old
`extraction_agent` label.

Schema application is an explicit maintenance action: use `--apply-schema` with an import, or
`--schema-only` without one. Never treat either flag as part of a routine or subset refresh. A
`--dry-run` reports the proposed upserts, current scoped stale-child counts, preserved ambiguity,
and ownership conflicts; it performs no writes and deliberately skips public-route materialization
because the remote database still represents the pre-import state.

The current D1 bank predates explicit ownership and deliberately remains blocked from a broad
chained import. Apply reviewed one-off content through `scripts/reimport-scoped-chained-questions.mjs`
with exact question/chain ids. Any future ownership handoff must use a tracked row manifest with
canonical content hashes and declared allowed differences; never blanket-tag legacy rows.

### Automatic Post-Publication Chain Illustrations

Illustration generation is a separate, D1-backed phase after question and chain publication. Keep
the extraction candidate, answer-chain reconciliation schemas, and `run-codex-answer-chains.mjs`
text-only. An illustration is derived from the final public chain plus the evidence for every public
member; it is not part of the source-paper extraction.

Use `pnpm run generate:chain-illustrations` directly when repairing or calibrating a known chain.
Every real Codex production `--import` runs the illustration phase automatically after its D1 write;
`--generate-chain-illustrations` remains accepted as a compatibility flag. Use
`--skip-chain-illustrations` only for an intentional opt-out. The batch importer suppresses each
single-paper child pass and runs one deduplicated phase after its paper cohort completes so shared
chains are generated once. Illustration failure is non-blocking by default;
`--require-chain-illustrations` makes it fail the import.

The automatic phase must fail closed at each gate:

1. Prefilter to clean published Biology, Chemistry, or Physics chains with two to five ordered
   steps, at least two clean questions from two source papers, chain and membership confidence of
   at least `0.85`, and complete clean mark/model/checklist artifacts.
2. Have an evidence reviewer map every stored source step for every public member to either an exact
   prompt-given excerpt or an existing mark-scheme row. Reject missing steps, different endpoints,
   branches, question-specific links, dangling evidence references, recall-only groups, and
   level-of-response questions. Multiple papers alone never prove semantic reuse.
3. Reduce the accepted chain to two to four visual panels without padding. Chains of at most four
   steps map one-to-one. A five-step chain may merge one adjacent pair only when both scoring ideas
   remain explicit and every source step still appears exactly once in order. The semantic plan must
   define one coherent system or subject, one unique mechanism-specific visual anchor per stage, and
   the meaning a learner should recover from each stage with all text hidden. Reject unexplained
   abbreviations, repeated dominant hero views, generic gauges standing in for mechanisms, and
   conclusions without a concrete visible outcome.
4. Generate one dark-mode `2048x1152` WebP from scratch with no reference image. Use the
   subject/subdomain version of the luminous scientific-atlas style, a deep navy grid, minimal
   verbatim labels, one unambiguous path, and iPad-safe margins. Then pass that exact generated image
   back to the image model with `action: edit` to produce its light-mode sibling. The edit may change
   surfaces, text contrast, shadows, highlights, and glow only; it must preserve composition, objects,
   states, arrows, equations, wording, panel geometry, sequence, and scientific meaning.
5. Reject either file if it does not decode, is below `1536x864`, falls outside a 1.5% tolerance
   around `16:9`, or has different dimensions from its sibling. A fresh-context visual judge then
   checks both variants for scientific accuracy, evidence fidelity, exact labels and numbers,
   sequence clarity, 1024x576 legibility, distinct causal visuals, text-hidden comprehension, clear
   terminology, absence of dominant repetition, and the absence of extra claims, loops, panels,
   logos, or watermarks. Before scoring, the judge must reconstruct what a learner infers with text
   hidden and after reading, record visible cue → concept → relationship associations, list plausible
   unintended takeaways, and compare the connected lesson with the planner's intended goal. It also
   runs a strict cross-theme consistency audit. Publish the pair only
   when both variants score at least `18/20` with full correctness, evidence, and text scores, every
   hard visual-learning flag passes, and cross-theme preservation scores `4/4`.
   The judge owns the persistent structured glitch catalogue: ambiguous symbol placement, wrong
   conductor association, bypass topology, invalid equations, repeated-object identity/size drift,
   force-removal direction, conventional-current/electron-direction confusion, question-specific
   numbers, lost ground/track contact, unexplained encodings, broken spatial stories, missing
   derived-quantity or governing-law bridges, ambiguous quantity encodings, creation-like cues for
   conserved quantities, and scientifically inexact relationship terminology. Symbols require an
   unambiguous leader or immediate physical target; equations must be visually separate from
   conductor/object labels. A failed deterministic or
   visual attempt is discarded as a pair. Retry with a brand-new dark generation and no reference
   image; append only the exact observed defects and the catalogue rules actually triggered. Never
   patch or edit a failed dark image, and do not create a light variant until a dark original passes
   its independent single-image judge. Lock that accepted dark as the source for all light attempts.
   If a light edit fails, discard it and make a fresh edit from the accepted dark, never from the
   failed light.
6. Hash the chain, ordered steps, public memberships, prompts, mark rows, models, and checklists.
   Recheck that fingerprint after generation. Upload both variants to immutable theme-specific R2
   keys, verify both uploaded byte streams, and only then promote their shared
   `answer_chain_illustrations` record. A changed source fingerprint must be regenerated rather than
   silently reusing stale art. Generation metadata must retain prompt hashes, both asset hashes, the
   dark-to-light derivation-record hash, deterministic hard-check snapshots, the model visual-audit
   identity/output hash, and an explicit human-audit record. `not_performed` or `not_recorded` is a
   valid honest human-audit state; never describe model QA as human review. Content-addressed IDs may
   change when assets change. Existing D1 replacement triggers must leave the new row as the sole
   published primary and demote the former primary to a non-primary draft.

The stable reusable prompt and validation logic live in
`scripts/lib/chain-illustration-pipeline.mjs`. Generation uses the subscription-backed
`chatgpt-gpt-image-2` path in the outer Node process; Codex is used for evidence planning and
independent visual QA. No image-generation secret belongs in the Worker runtime.

### Corpus-Level Curriculum Notices

Curriculum changes that only become clear by comparing papers across years do not belong in a
single-paper extraction result. Store reviewed learner-facing context in `curriculum_notices`, scoped
to its board, qualification, subject, specification, and content area, with the source-document IDs
that support it.

A future corpus-level model pass should return a short title and one or two useful sentences only
when the context changes how a learner should interpret or use imported questions. It should not
turn paper summaries, extraction logs, or internal review notes into learner copy. For example:
`Earlier poetry anthology - OCR first assessed its revised anthology in June 2024. Earlier questions
use the previous version; this question bank keeps them for essay practice.` Official facts and
product policy must be attributed separately. Model suggestions must be source-backed and reviewed
before publication.

1. Create an `extraction_runs` row with status `running`.
2. Insert or reuse `source_documents` by `file_hash`.
3. Insert `source_pages` when OCR or page text is available.
4. Insert atomic `questions`.
5. Insert `question_assets`.
6. Insert `mark_scheme_items`.
7. Insert `mark_checklist_items` and `model_answers`.
8. Match or create `answer_chains`.
9. Insert `answer_chain_steps`.
10. Insert `question_answer_chains`.
11. Propose or update `constellations` and `constellation_questions`.
12. Insert `common_weak_answers`.
13. Insert `extraction_issues` for any uncertain object.
14. Store raw agent output JSON on `extraction_runs.raw_output_json`.
15. Set the run status to `completed` or `review_required`.

`common_weak_answers` are question-specific evidence, not chain-level copy. New
imports should populate `explanation` and `missing_chain_step_ids_json` whenever
possible, because practice hints use those fields to build a clue for the active
question. `answer_chain_steps.common_omission` remains the fallback when a
specific question has no reviewed weak-answer row.

## Agent Quality Checklist

Before returning an extraction result, the agent should verify:

- Every question has a source document, source reference, prompt, display order, and page reference.
- Every marked question has a mark value or a review issue explaining why it is missing.
- Every mark-scheme item is linked to a question.
- Every checklist item links to mark-scheme evidence or is flagged.
- Every model answer has a derivation and confidence.
- Every answer-chain step has a role.
- Every answer chain has at least two steps unless it is explicitly a calculation or single-step recall candidate.
- Every constellation candidate has a semantic fit rationale, not just shared topic, keyword, or text similarity.
- Every uncertain diagram/table/source extract has an asset review flag.
- No generated answer-chain or model-answer content is published solely because it exists.

## Human Review Priorities

Review these first:

1. Questions with diagrams, tables, graphs, or source inserts.
2. Six-mark or level-of-response questions.
3. Questions where the answer-chain confidence is below `0.75`.
4. Questions that create a new answer chain instead of matching an existing one.
5. Constellations with fewer than three confident questions.
6. Any item where the prompt, mark value, or source metadata was inferred.

## Relationship To Product Docs

Use this document when building importers, extraction agents, schema migrations, review tooling, or question-bank data models.

Use `docs/product-methodology.md` for product doctrine and `docs/product-flows.md` for user-facing flows and mobile UX.
