PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_imports (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  question_count INTEGER NOT NULL DEFAULT 0,
  chain_count INTEGER NOT NULL DEFAULT 0,
  constellation_count INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  doc_type TEXT NOT NULL,
  board TEXT,
  qualification TEXT,
  subject TEXT,
  subject_area TEXT,
  tier TEXT,
  paper TEXT,
  component_code TEXT,
  series TEXT,
  year INTEGER,
  title TEXT,
  source_url TEXT,
  file_path TEXT,
  file_hash TEXT,
  page_count INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL REFERENCES source_documents(id),
  parent_source_question_ref TEXT,
  source_question_ref TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL,
  prompt_text TEXT NOT NULL,
  self_contained_prompt_text TEXT,
  context_text TEXT,
  command_word TEXT,
  marks INTEGER,
  board TEXT,
  qualification TEXT,
  subject TEXT,
  subject_area TEXT,
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
  self_containment_json TEXT NOT NULL DEFAULT '{}',
  extraction_confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  review_notes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_assets (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,
  source_label TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  role TEXT,
  page_number INTEGER,
  bbox_json TEXT,
  alt_text TEXT,
  extracted_text TEXT,
  file_path TEXT,
  r2_key TEXT,
  public_path TEXT,
  extraction_confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS mark_scheme_items (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  source_document_id TEXT REFERENCES source_documents(id),
  display_order INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  text TEXT NOT NULL,
  marks REAL,
  source_ref TEXT,
  confidence REAL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS mark_checklist_items (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  text TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  mark_scheme_item_ids_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS model_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  derivation TEXT NOT NULL,
  supporting_mark_scheme_item_ids_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS answer_chains (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  canonical_chain_text TEXT NOT NULL,
  subject TEXT,
  subject_area TEXT,
  broad_topic TEXT,
  summary TEXT,
  created_by TEXT NOT NULL DEFAULT 'extraction_agent',
  confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  review_notes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS answer_chain_steps (
  id TEXT PRIMARY KEY,
  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  step_text TEXT NOT NULL,
  step_role TEXT NOT NULL,
  explanation TEXT,
  common_omission TEXT,
  supported_by_mark_scheme_item_ids_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  UNIQUE (answer_chain_id, display_order)
);

CREATE TABLE IF NOT EXISTS question_answer_chains (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  fit_confidence REAL,
  fit_notes TEXT,
  transfer_distance TEXT NOT NULL DEFAULT 'unclassified',
  display_order INTEGER,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  review_notes_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (question_id, answer_chain_id)
);

CREATE TABLE IF NOT EXISTS common_weak_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
  answer_chain_id TEXT REFERENCES answer_chains(id) ON DELETE CASCADE,
  weak_answer_text TEXT NOT NULL,
  missing_chain_step_ids_json TEXT NOT NULL DEFAULT '[]',
  explanation TEXT,
  source TEXT NOT NULL DEFAULT 'agent',
  confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS constellations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id),
  board TEXT,
  qualification TEXT,
  subject TEXT,
  subject_area TEXT,
  tier TEXT,
  paper TEXT,
  topic_path_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  review_notes_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS constellation_questions (
  id TEXT PRIMARY KEY,
  constellation_id TEXT NOT NULL REFERENCES constellations(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL,
  transfer_distance TEXT NOT NULL DEFAULT 'unclassified',
  role TEXT NOT NULL DEFAULT 'practice',
  rationale TEXT,
  confidence REAL,
  needs_human_review INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (constellation_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_questions_slug ON questions (slug);
CREATE INDEX IF NOT EXISTS idx_questions_subject_area ON questions (subject_area, paper, year);
CREATE INDEX IF NOT EXISTS idx_question_assets_question ON question_assets (question_id);
CREATE INDEX IF NOT EXISTS idx_mark_checklist_question ON mark_checklist_items (question_id, display_order);
CREATE INDEX IF NOT EXISTS idx_answer_chain_steps_chain ON answer_chain_steps (answer_chain_id, display_order);
CREATE INDEX IF NOT EXISTS idx_question_answer_chains_question ON question_answer_chains (question_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_question_answer_chains_chain ON question_answer_chains (answer_chain_id, display_order);
CREATE INDEX IF NOT EXISTS idx_constellation_questions_constellation ON constellation_questions (constellation_id, display_order);
