# Extraction Specification

This document defines what an extraction agent should recover from exam-paper and mark-scheme files, how those objects map to Question Constellation product concepts, and how they should be stored in a Cloudflare D1 database.

The existing product docs explain the human-facing product direction. This document is stricter: it is the contract for paper import, mark-scheme alignment, answer-chain derivation, review flags, and storage.

## LLM Extraction Prompt

Use this section as the top-level prompt when an LLM extraction script or review agent extracts
questions from papers and mark schemes.

Use this document as the contract for output shape, provenance, confidence, review flags, and D1/SQLite storage. Do not treat it as a request for keyword classification.

The core task is semantic answer-chain extraction. For each atomic question, read the question and the mark scheme together, then infer the ordered reasoning links that actually earn marks. A topic label, specification reference, command word, mark value, or repeated vocabulary is metadata only. These fields can help search, filtering, and audit, but they are not the grouping method.

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
2. Infer semantic mark-scoring reasoning chains.
3. Use topic and keyword metadata only for search, filtering, and audit.
4. Flag uncertain cases instead of creating weak chains or weak constellations.

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

Bad answer chains are:

- Only a topic name, such as `respiration`.
- Too narrow, such as the exact wording of one prompt.
- Too broad, such as `cause and effect`.
- Invented without mark-scheme support.

If a question is pure recall, a single formula substitution, or too ambiguous, the extraction agent should not force it into a rich answer chain. Mark it as `no_chain_candidate` or `needs_human_review`.

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

### Thinking Memory

Thinking Memory stores answer chains the learner has earned through practice. The extraction agent does not create student memory. It creates the public chain, question, checklist, and constellation objects that later become saveable memory entries.

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
- Self-containment metadata: whether the printed atomic prompt is already self-contained, requires
  prior context, requires assets, or requires both.
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

Do not merge marked subparts into one practice question unless the mark scheme treats them as one answer. For example, `01.1`, `01.2`, and `01.3` should normally become separate question rows under the same parent.

### From Mark Schemes

For each question or subquestion, extract:

- Marking points.
- Alternative acceptable answers.
- `allow`, `accept`, `ignore`, `reject`, and `do not accept` guidance.
- Additional guidance or examiner notes.
- Level descriptors and bands.
- Required units, rounding, significant figures, formulae, or workings.
- Answer variants for higher/foundation tiers if shown.
- Assessment objective or specification references if present.

Preserve distinction between positive marking points and negative guidance. A `reject` item is not a checklist item, but it can become a warning or common weak answer rule.

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

### Numeric Specificity Guardrail

An answer chain is a reusable reasoning or method pattern. It must not become a worked solution to
one question.

For calculation questions, keep prompt-specific arithmetic in the model answer, mark checklist, and
mark-scheme evidence. Do not put given values, substitutions, intermediate values, final numeric
answers, or one-question units inside `canonical_chain_text`, `summary`, `step_text`,
`explanation`, or `common_omission`.

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
node scripts/audit-answer-chain-specificity.mjs --fail-on-blocking
```

If the audit flags a chain, regenerate or edit the chain to describe the reusable move. Do not delete
the numeric model answer or checklist evidence; those fields are supposed to stay source-specific.

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

The CLI accepts PDFs and writes extracted JSON:

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

For the current AQA Physics data layout, use the preset:

```sh
pnpm run extract:physics-vision -- --paper=aqa-8464p1h-qp-jun18 --force
pnpm run extract:physics-vision -- --all --force
```

`extract:physics-vision` is a compatibility command for the same script-first pipeline; there should
not be a second Physics-specific extractor.

For AQA Separate Science Higher, first download the official assessment resources into `data/`, then
extract/import from that manifest:

```sh
pnpm run download:aqa-separate-science
pnpm run extract:aqa-separate-science -- --subject=biology --paper=aqa-84611h-qp-jun24 --force
pnpm run extract:aqa-separate-science -- --all --force
pnpm run import:aqa-separate-science -- --all --replace-all-subject
```

The downloader scrapes the official AQA assessment-resource pages for GCSE Biology 8461, Chemistry
8462, and Physics 8463. It keeps standard Higher question papers in
`data/aqa-separate-science-higher/question-papers/`, mark schemes in
`data/aqa-separate-science-higher/mark-schemes/`, standard inserts in
`data/aqa-separate-science-higher/supporting-documents/`, and writes
`data/aqa-separate-science-higher/manifest.json`. Modified-print variants and examiner reports are
excluded unless a future importer explicitly needs them.

Use `--question-pages=1-3` and `--mark-scheme-pages=4-5` for chunked extraction. Use
`--chunk-pages=<n>` to control page batching. Mark schemes are passed as extracted text by default;
use `--mark-scheme-image-mode=all` only when layout/text extraction is not enough. The library exports `extractFullPaperFromPdfSet`,
`extractCandidateFromPdfPair`, `extractCandidateFromImages`, `evaluateCandidate`, and
`runGoldenPdfEval` so batch jobs can run many chunks or papers in parallel under their own
concurrency control.

The script owns PDF processing. The model should not be asked to discover files or run shell
commands. Required local tools are:

- `pdfinfo` to count/inspect pages.
- `pdftoppm` to render pages to PNG images.
- `@ljoukov/llm` to call `chatgpt-gpt-5.5-fast` or another configured model with structured JSON
  output.

For normal PDFs, the CLI runs an independent rubric judge by default after extraction. The judge sees
candidate JSON and deterministic findings, not the extractor's private context, and must score from
0 to 1. Use `--skip-judge` only for local debugging when you explicitly want deterministic checks
without another LLM call.

There are two kinds of tests:

- Mechanical tests such as `pnpm run test:extraction-pipeline` check schemas, script wiring, prompt
  guardrails, and deterministic chain-specificity rules.
- The LLM integration test `pnpm run eval:extraction-pipeline-llm` renders a golden PDF/mark-scheme
  pair, runs the extractor with the configured model, and then asks a separate judge call to compare
  the output semantically against golden concepts and forbidden chain values.

The production output shape is the import-shaped JSON used by `import:vision`: `sourceDocument`,
`markSchemeDocument`, optional `supportingDocuments`, atomic `questions`, render blocks, response
objects, assets, mark-scheme items, checklist items, model answers, answer chains, common weak
answers, review flags, and local asset manifest. A compact extraction schema may be used only inside
small golden fixtures; it is not the production artifact.

When `--existing-chains` is supplied, the extractor must compare each chain to existing chain ids. It
should reuse an id when the ordered method is the same, keep the old id when clarifying wording for a
compatible chain, and create a new id only for genuinely new mark-scoring reasoning. The optional
`chainResolution` field records `reuse_existing`, `update_existing`, `create_new`, or `needs_review`
for audit.

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

The extraction pipeline may run a bounded repair loop with `--repair-attempts=<n>`. This is the only
agentic loop needed for the current chain-quality problem: the script gives the model deterministic
findings and judge feedback, then asks it to return repaired JSON. The model does not get filesystem
write tools. If later PDF/layout work needs model-controlled tools, expose narrow runtime tools
inside `@ljoukov/llm.runToolLoop()` or `runAgentLoop()` such as `render_pdf_page`,
`read_page_image_metadata`, and `compare_candidate_to_golden`; do not expose arbitrary shell or D1
write access to the extractor.

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

### Model Answers

A model answer should be source-derived and concise. It should include enough detail to satisfy the mark checklist, not a full textbook explanation.

Generate and store model answers only for written-response questions, such as free-text answer lines or labelled written answer spaces. Do not create model-answer rows for fixed-answer interactions such as multiple choice, image labels, matching, equation blanks, number-line answers, or any response where the UI can deterministically check a fixed key. For those questions, store the answer key in the response schema or `question_response_answer_keys` instead.

For written-response questions, the model answer must be student-facing answer text. It must never be a raw mark-scheme row, assessment objective, specification reference, examiner instruction, or truncated scoring fragment. Bad model answers include strings such as `01.2 positive charge is provided by 1 AO1; protons 6.4.1.2`, `4.4.1.1`, `A bold and is used...`, or any wording copied from generic mark-scheme guidance. The importer should reject or regenerate these rather than storing them.

When a paper importer has enough mark-scheme evidence, it should generate the written-response model answer during import and store it in D1, so runtime grading can display the stored answer without spending another model call. Runtime grading may still use a model to evaluate a student's free-text response, but it should treat the stored model answer as source-grounded evidence, not ask the grading model to invent a fresh model answer.

Set derivation as:

- `source` when the answer is directly provided.
- `generated_from_mark_scheme` when composed from marking points.
- `human_reviewed` when reviewed and accepted.

Generated model answers should not be published without either high mark-scheme alignment confidence or human review.

### Fixed-Response Answer Keys

Fixed-response questions still need student-facing feedback. Prefer deterministic checking when the
correct response can be extracted confidently, but the runtime grader may fall back to the supplied
mark scheme and response format when the structured key is missing.

For every fixed-response interaction, store the visible response format in the render overlay and
store the correct answer key either in `response.correctAnswers` or in
`question_response_answer_keys`:

- `choice`: use target id `answer`; store the correct option text or the printed letter when the
  paper only gives A/B/C/D choices.
- `choice-table`: use target id `answer`; store the selected row as the same `|`-joined text the
  UI emits.
- `matching`: use each left-side value or stable left-side id as the target id; store the matching
  right-side value.
- `equation-blanks`: use each blank id as the target id; store the correct value or expression for
  that blank.
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
3. Extract mark-scheme rows and split them into usable marking points. Keep `allow`, `reject`, and
   examiner guidance as guidance, not as positive checklist rows.
4. For written-response questions, generate a concise model answer from the mark-scheme evidence and
   reject answers that contain AO codes, spec codes, row numbers, or generic marking instructions.
5. For fixed-response questions, extract `correctAnswers` and insert rows into
   `question_response_answer_keys`; do not generate model answers for these unless the fixed response
   is actually a written answer in disguise.
6. Derive answer chains only when the marks depend on reusable reasoning, not for pure recall or
   single-step key selection. For calculation chains, reject chain text that includes prompt-specific
   numeric substitutions or final numeric answers; those belong in model answers and checklist rows.
7. Import to D1, then run validation queries for question counts, render-overlay coverage,
   mark-scheme coverage, model-answer coverage, fixed-response answer-key coverage, and zero
   published questions with no usable grading evidence.
8. Open `/experiments/questions/<paper>` and a sample of single-question routes on desktop and
   mobile; inspect the rendered paper against the source and submit representative written and
   fixed-response answers through the real grading endpoint.
9. For any route that returns missing-evidence feedback, repair the D1 evidence from the official
   source or remove the question from the published experiment before handing the import off.

For extraction scripts or agents that generate import JSON, include this instruction in the task
prompt:

```text
For each rendered response object, emit the exact user-facing response format and, when the correct
answer is known from the mark scheme, emit response.correctAnswers. Use target id "answer" for a
single selected choice, each left-side id for matching, each blank id for equation blanks, and each
image-label zone id for labels. Written-response model answers must be clean student answer text,
not raw mark-scheme rows or AO/spec notation.
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
