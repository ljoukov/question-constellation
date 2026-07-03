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

CREATE INDEX IF NOT EXISTS idx_user_profile_subjects_user_enabled
  ON user_profile_subjects (user_id, enabled, subject);
