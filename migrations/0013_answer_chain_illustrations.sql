CREATE TABLE IF NOT EXISTS answer_chain_illustrations (
  id TEXT PRIMARY KEY,
  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
  source_question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
  r2_key TEXT NOT NULL UNIQUE,
  public_path TEXT NOT NULL UNIQUE,
  alt_text TEXT NOT NULL,
  caption TEXT,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  style_key TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  generation_metadata_json TEXT NOT NULL DEFAULT '{}',
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'rejected')),
  needs_human_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_human_review IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_answer_chain_illustrations_chain
  ON answer_chain_illustrations (
    answer_chain_id,
    status,
    needs_human_review,
    is_primary DESC,
    updated_at DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_answer_chain_illustrations_primary_published
  ON answer_chain_illustrations (answer_chain_id)
  WHERE is_primary = 1 AND status = 'published';
