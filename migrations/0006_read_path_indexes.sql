CREATE INDEX IF NOT EXISTS idx_user_question_attempts_user_question
  ON user_question_attempts (user_id, question_id);

CREATE INDEX IF NOT EXISTS idx_questions_public_subject_name
  ON questions (status, needs_human_review, subject, id);
