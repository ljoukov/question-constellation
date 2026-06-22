CREATE TABLE IF NOT EXISTS question_response_answer_keys (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  response_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (question_id, response_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_question_response_answer_keys_question
  ON question_response_answer_keys (question_id, response_kind, display_order);
