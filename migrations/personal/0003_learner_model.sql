-- The learner model is deliberately split into source evidence, derived state,
-- and recommendation decisions. Evidence rows are append-only by application
-- convention: corrections should append a row with supersedes_evidence_id so
-- account deletion can still remove a learner's data.

CREATE TABLE IF NOT EXISTS user_subject_curriculum_scopes (
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  board TEXT NOT NULL DEFAULT 'AQA',
  qualification TEXT NOT NULL DEFAULT 'GCSE',
  course TEXT NOT NULL DEFAULT 'GCSE Subject',
  tier TEXT NOT NULL DEFAULT 'Higher',
  specification_code TEXT NOT NULL,
  specification_version TEXT,
  official_source_url TEXT NOT NULL,
  scope_mode TEXT NOT NULL DEFAULT 'all'
    CHECK (scope_mode IN ('all', 'selected')),
  selected_component_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subject)
);

CREATE TABLE IF NOT EXISTS user_learning_evidence (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  board TEXT NOT NULL DEFAULT 'AQA',
  qualification TEXT NOT NULL DEFAULT 'GCSE',
  course TEXT,
  tier TEXT,
  curriculum_component_id TEXT NOT NULL,
  component_kind TEXT NOT NULL,
  component_id TEXT NOT NULL,
  component_title TEXT,
  evidence_kind TEXT NOT NULL
    CHECK (evidence_kind IN (
      'independent_transfer_constructed',
      'independent_exam_constructed',
      'short_constructed',
      'multiple_choice',
      'true_false',
      'flashcard_self_rating'
    )),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('correct', 'partial', 'incorrect', 'known', 'unsure')),
  independent INTEGER NOT NULL DEFAULT 0
    CHECK (independent IN (0, 1)),
  awarded_marks INTEGER,
  max_marks INTEGER,
  source_item_id TEXT,
  source_attempt_id TEXT,
  source_session_id TEXT,
  question_id TEXT,
  answer_chain_id TEXT,
  response_duration_ms INTEGER,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  supersedes_evidence_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS user_learner_component_states (
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  board TEXT NOT NULL DEFAULT 'AQA',
  qualification TEXT NOT NULL DEFAULT 'GCSE',
  curriculum_component_id TEXT NOT NULL,
  component_kind TEXT NOT NULL,
  component_id TEXT NOT NULL,
  component_title TEXT,
  state TEXT NOT NULL DEFAULT 'no_evidence'
    CHECK (state IN ('no_evidence', 'developing', 'secure', 'due', 'conflicting')),
  uncertainty TEXT NOT NULL DEFAULT 'high'
    CHECK (uncertainty IN ('high', 'medium', 'low')),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  independent_evidence_count INTEGER NOT NULL DEFAULT 0,
  distinct_item_count INTEGER NOT NULL DEFAULT 0,
  strongest_evidence_kind TEXT
    CHECK (strongest_evidence_kind IS NULL OR strongest_evidence_kind IN (
      'independent_transfer_constructed',
      'independent_exam_constructed',
      'short_constructed',
      'multiple_choice',
      'true_false',
      'flashcard_self_rating'
    )),
  last_evidence_id TEXT,
  last_outcome TEXT,
  last_evidence_at TEXT,
  next_check_at TEXT,
  reason_code TEXT NOT NULL,
  supporting_evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  algorithm_version TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subject, component_kind, component_id)
);

CREATE TABLE IF NOT EXISTS user_recommendation_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  board TEXT NOT NULL DEFAULT 'AQA',
  qualification TEXT NOT NULL DEFAULT 'GCSE',
  curriculum_scope_snapshot_json TEXT NOT NULL DEFAULT '{}',
  learner_state_snapshot_json TEXT NOT NULL DEFAULT '{}',
  candidate_actions_json TEXT NOT NULL DEFAULT '[]',
  selected_action_id TEXT NOT NULL,
  selected_action_kind TEXT NOT NULL
    CHECK (selected_action_kind IN ('recall', 'close_gap', 'apply_chain')),
  selected_component_kind TEXT NOT NULL,
  selected_component_id TEXT NOT NULL,
  selected_curriculum_component_id TEXT NOT NULL,
  selected_route TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  decision_source TEXT NOT NULL DEFAULT 'rules'
    CHECK (decision_source IN ('rules', 'llm')),
  algorithm_version TEXT NOT NULL,
  model_run_id TEXT,
  valid_until TEXT,
  acted_at TEXT,
  outcome_evidence_id TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_curriculum_scopes_user
  ON user_subject_curriculum_scopes (user_id, subject);

CREATE INDEX IF NOT EXISTS idx_user_learning_evidence_user_subject_time
  ON user_learning_evidence (user_id, subject, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_learning_evidence_component
  ON user_learning_evidence (user_id, subject, component_kind, component_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_learning_evidence_curriculum
  ON user_learning_evidence (user_id, subject, curriculum_component_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_learning_evidence_session
  ON user_learning_evidence (user_id, source_session_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_user_learner_states_subject_state
  ON user_learner_component_states (user_id, subject, state, next_check_at);

CREATE INDEX IF NOT EXISTS idx_user_recommendations_user_subject_time
  ON user_recommendation_decisions (user_id, subject, created_at DESC);
