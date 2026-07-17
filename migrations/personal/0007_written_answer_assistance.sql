ALTER TABLE user_question_attempts
  ADD COLUMN independent INTEGER NOT NULL DEFAULT 0;

ALTER TABLE user_question_attempts
  ADD COLUMN assistance_json TEXT NOT NULL DEFAULT '{}';

ALTER TABLE user_gap_builder_runs
  ADD COLUMN assistance_json TEXT NOT NULL DEFAULT '{}';
