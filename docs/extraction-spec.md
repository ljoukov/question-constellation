# Extraction Specification

This document defines what an extraction agent should recover from exam-paper and mark-scheme files, how those objects map to Question Constellation product concepts, and how they should be stored in a Cloudflare D1 database.

The existing product docs explain the human-facing product direction. This document is stricter: it is the contract for paper import, mark-scheme alignment, answer-chain derivation, review flags, and storage.

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
- Command word, such as `explain`, `describe`, `calculate`, `evaluate`, or `state`.
- Mark value.
- Answer lines or expected response format when visible.
- Board, qualification, subject, tier, paper, and series inherited from the source.
- Topic path if stated or confidently inferable.
- Specification reference if stated or confidently inferable.
- Page number range.
- Required diagrams, tables, graphs, equations, images, or source text.
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

Set derivation as:

- `source` when the answer is directly provided.
- `generated_from_mark_scheme` when composed from marking points.
- `human_reviewed` when reviewed and accepted.

Generated model answers should not be published without either high mark-scheme alignment confidence or human review.

### Common Weak Answers

Common weak answers should represent a realistic partial answer that misses one or more chain links.

Example:

```text
Less blood gets to the heart so it hurts.
```

This is useful because it can be mapped to missing links such as `oxygen`, `respiration`, and `energy`.

Do not invent a weak answer if the mark scheme gives no clear basis and the agent cannot identify a plausible missing link.

## Output Contract

The extraction agent should emit structured JSON before database insertion. The database importer can then normalize this JSON into rows.

Minimum shape:

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
  page_number INTEGER,
  bbox_json TEXT,
  alt_text TEXT,
  extracted_text TEXT,
  file_path TEXT,
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
- Every constellation candidate has a fit rationale.
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
