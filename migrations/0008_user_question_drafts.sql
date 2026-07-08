CREATE TABLE IF NOT EXISTS user_question_drafts (
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_chain_id TEXT REFERENCES answer_chains(id) ON DELETE SET NULL,
  draft_kind TEXT NOT NULL,
  answer_text TEXT NOT NULL DEFAULT '',
  draft_json TEXT NOT NULL DEFAULT '{}',
  client_updated_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_user_question_drafts_user_updated
  ON user_question_drafts (user_id, updated_at DESC);
