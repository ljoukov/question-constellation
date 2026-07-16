-- Keep spaced-repetition state within the exact learner course and tier that
-- produced it. Preserve all legacy reviews while rebuilding the primary key.

DROP INDEX IF EXISTS idx_user_recall_card_reviews_user_due;
DROP INDEX IF EXISTS idx_user_recall_reviews_course;

ALTER TABLE user_recall_card_reviews RENAME TO user_recall_card_reviews_legacy;

CREATE TABLE user_recall_card_reviews (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  course TEXT,
  tier TEXT,
  topic_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'recall',
  last_grade TEXT NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  correct_count INTEGER NOT NULL DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 0,
  due_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content_revision INTEGER,
  content_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, card_id, scope_key)
);

INSERT INTO user_recall_card_reviews (
  user_id, card_id, scope_key, subject, course, tier, topic_id, mode,
  last_grade, seen_count, correct_count, interval_days, due_at,
  content_revision, content_hash, created_at, updated_at
)
SELECT
  user_id,
  card_id,
  COALESCE(course, '') || '|' || COALESCE(tier, ''),
  subject,
  course,
  tier,
  topic_id,
  mode,
  last_grade,
  seen_count,
  correct_count,
  interval_days,
  due_at,
  NULL,
  NULL,
  created_at,
  updated_at
FROM user_recall_card_reviews_legacy;

DROP TABLE user_recall_card_reviews_legacy;

CREATE INDEX idx_user_recall_card_reviews_user_due
  ON user_recall_card_reviews (user_id, due_at);

CREATE INDEX idx_user_recall_reviews_course
  ON user_recall_card_reviews (user_id, subject, course, tier, due_at);
