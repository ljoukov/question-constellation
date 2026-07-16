-- Private, non-user-facing coverage telemetry for deciding whether a future
-- personalised-card overlay is warranted. This table never supplies content.
CREATE TABLE IF NOT EXISTS user_recall_coverage_misses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  board TEXT NOT NULL,
  qualification TEXT NOT NULL,
  course TEXT NOT NULL,
  tier TEXT NOT NULL,
  offering_id TEXT NOT NULL,
  specification_id TEXT NOT NULL,
  gap_id TEXT NOT NULL,
  answer_chain_id TEXT NOT NULL,
  chain_step_id TEXT NOT NULL,
  source_question_id TEXT NOT NULL,
  curriculum_component_id TEXT NOT NULL,
  topic_component_id TEXT NOT NULL,
  learner_state TEXT NOT NULL
    CHECK (learner_state IN ('developing', 'conflicting')),
  learner_uncertainty TEXT NOT NULL
    CHECK (learner_uncertainty IN ('high', 'medium', 'low')),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 2),
  distinct_item_count INTEGER NOT NULL CHECK (distinct_item_count >= 2),
  reason_code TEXT NOT NULL DEFAULT 'stable_gap_no_exact_reviewed_card'
    CHECK (reason_code = 'stable_gap_no_exact_reviewed_card'),
  shadow_version TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 1 CHECK (observation_count >= 1),
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, gap_id, offering_id, curriculum_component_id)
);

CREATE INDEX IF NOT EXISTS idx_user_recall_coverage_misses_scope
  ON user_recall_coverage_misses (
    user_id, subject, course, tier, last_seen_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_user_recall_coverage_misses_component
  ON user_recall_coverage_misses (
    offering_id, curriculum_component_id, last_seen_at DESC
  );
