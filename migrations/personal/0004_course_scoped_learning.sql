-- Keep derived learner state and activity summaries tied to the exact course
-- configuration that produced them. A learner changing route or tier should not
-- inherit confidence or due work from a different specification.

ALTER TABLE user_learner_component_states ADD COLUMN course TEXT;
ALTER TABLE user_learner_component_states ADD COLUMN tier TEXT;

ALTER TABLE user_question_attempts ADD COLUMN course TEXT;
ALTER TABLE user_chain_gaps ADD COLUMN course TEXT;

ALTER TABLE user_recall_card_reviews ADD COLUMN course TEXT;
ALTER TABLE user_recall_card_reviews ADD COLUMN tier TEXT;

CREATE INDEX IF NOT EXISTS idx_user_learner_states_course
  ON user_learner_component_states (user_id, subject, course, tier, state, next_check_at);

CREATE INDEX IF NOT EXISTS idx_user_question_attempts_course
  ON user_question_attempts (user_id, subject, course, tier, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_chain_gaps_course
  ON user_chain_gaps (user_id, subject, course, tier, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_recall_reviews_course
  ON user_recall_card_reviews (user_id, subject, course, tier, due_at);
