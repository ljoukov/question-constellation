CREATE TABLE IF NOT EXISTS user_profiles (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  photo_url TEXT,
  selected_board TEXT NOT NULL DEFAULT 'AQA',
  selected_qualification TEXT NOT NULL DEFAULT 'GCSE',
  selected_subject TEXT NOT NULL DEFAULT 'Biology',
  selected_tier TEXT NOT NULL DEFAULT 'Higher',
  theme_preference TEXT NOT NULL DEFAULT 'auto',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profile_subjects (
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  board TEXT NOT NULL DEFAULT 'AQA',
  qualification TEXT NOT NULL DEFAULT 'GCSE',
  course TEXT NOT NULL DEFAULT 'Separate Science',
  tier TEXT NOT NULL DEFAULT 'Higher',
  enabled INTEGER NOT NULL DEFAULT 1,
  current_grade TEXT,
  target_grade TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subject)
);

CREATE TABLE IF NOT EXISTS user_question_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_chain_id TEXT,
  answer_text TEXT NOT NULL,
  result TEXT NOT NULL,
  awarded_marks INTEGER NOT NULL DEFAULT 0,
  max_marks INTEGER NOT NULL DEFAULT 0,
  present_step_ids_json TEXT NOT NULL DEFAULT '[]',
  missing_step_ids_json TEXT NOT NULL DEFAULT '[]',
  feedback_markdown TEXT NOT NULL DEFAULT '',
  model TEXT,
  model_version TEXT,
  question_title TEXT,
  source_question_ref TEXT,
  board TEXT,
  qualification TEXT,
  subject TEXT,
  tier TEXT,
  paper TEXT,
  topic_path_json TEXT NOT NULL DEFAULT '[]',
  chain_title TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_question_drafts (
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_chain_id TEXT,
  draft_kind TEXT NOT NULL,
  answer_text TEXT NOT NULL DEFAULT '',
  draft_json TEXT NOT NULL DEFAULT '{}',
  client_updated_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE IF NOT EXISTS user_chain_gaps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  answer_chain_id TEXT NOT NULL,
  chain_step_id TEXT NOT NULL,
  source_question_id TEXT,
  latest_attempt_id TEXT,
  board TEXT,
  qualification TEXT,
  subject TEXT,
  tier TEXT,
  paper TEXT,
  topic_path_json TEXT NOT NULL DEFAULT '[]',
  marks INTEGER,
  chain_title TEXT NOT NULL,
  canonical_chain_text TEXT NOT NULL DEFAULT '',
  step_text TEXT NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  source_question_title TEXT,
  source_question_ref TEXT,
  source_prompt_text TEXT,
  source_context_text TEXT,
  source_metadata_json TEXT,
  source_topic_path_json TEXT NOT NULL DEFAULT '[]',
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
  gap_id TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_user_profile_subjects_user_enabled
  ON user_profile_subjects (user_id, enabled, subject);

CREATE INDEX IF NOT EXISTS idx_user_question_attempts_user_created
  ON user_question_attempts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_question_attempts_user_question
  ON user_question_attempts (user_id, question_id);

CREATE INDEX IF NOT EXISTS idx_user_question_attempts_user_subject
  ON user_question_attempts (user_id, subject, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_question_drafts_user_updated
  ON user_question_drafts (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_chain_gaps_user_status
  ON user_chain_gaps (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_chain_gaps_user_subject
  ON user_chain_gaps (user_id, subject, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_chain_gaps_user_chain
  ON user_chain_gaps (user_id, answer_chain_id);

CREATE INDEX IF NOT EXISTS idx_user_gap_builder_runs_gap_created
  ON user_gap_builder_runs (gap_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_recall_card_reviews_user_due
  ON user_recall_card_reviews (user_id, due_at);
