CREATE TABLE IF NOT EXISTS user_profiles (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  photo_url TEXT,
  selected_board TEXT NOT NULL DEFAULT 'AQA',
  selected_qualification TEXT NOT NULL DEFAULT 'GCSE',
  selected_subject TEXT NOT NULL DEFAULT 'Biology',
  selected_tier TEXT NOT NULL DEFAULT 'Higher',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_question_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_chain_id TEXT REFERENCES answer_chains(id) ON DELETE SET NULL,
  answer_text TEXT NOT NULL,
  result TEXT NOT NULL,
  awarded_marks INTEGER NOT NULL DEFAULT 0,
  max_marks INTEGER NOT NULL DEFAULT 0,
  present_step_ids_json TEXT NOT NULL DEFAULT '[]',
  missing_step_ids_json TEXT NOT NULL DEFAULT '[]',
  feedback_markdown TEXT NOT NULL DEFAULT '',
  model TEXT,
  model_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_chain_gaps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  answer_chain_id TEXT NOT NULL REFERENCES answer_chains(id) ON DELETE CASCADE,
  chain_step_id TEXT NOT NULL REFERENCES answer_chain_steps(id) ON DELETE CASCADE,
  source_question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
  latest_attempt_id TEXT REFERENCES user_question_attempts(id) ON DELETE SET NULL,
  board TEXT,
  qualification TEXT,
  subject TEXT,
  tier TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  gap_band TEXT NOT NULL DEFAULT 'large_gap',
  evidence_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, answer_chain_id, chain_step_id)
);

CREATE TABLE IF NOT EXISTS user_gap_builder_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  gap_id TEXT NOT NULL REFERENCES user_chain_gaps(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  guided_answers_json TEXT NOT NULL DEFAULT '{}',
  final_answer TEXT,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_recall_card_reviews (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'recall',
  last_grade TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  correct_count INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 0,
  due_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_user_question_attempts_user_created
  ON user_question_attempts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_question_attempts_question
  ON user_question_attempts (question_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_chain_gaps_user_status
  ON user_chain_gaps (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_chain_gaps_user_chain
  ON user_chain_gaps (user_id, answer_chain_id);

CREATE INDEX IF NOT EXISTS idx_user_gap_builder_runs_gap_created
  ON user_gap_builder_runs (gap_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_recall_card_reviews_user_due
  ON user_recall_card_reviews (user_id, due_at);
