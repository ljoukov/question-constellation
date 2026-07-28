PRAGMA foreign_keys = ON;

-- This database starts empty. This file is the complete current schema; it
-- intentionally contains no upgrade, backfill, or legacy-conversion path.

CREATE TABLE user_profiles (
  uid TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  photo_url TEXT,
  selected_board TEXT NOT NULL DEFAULT 'AQA',
  selected_qualification TEXT NOT NULL DEFAULT 'GCSE',
  selected_subject TEXT NOT NULL DEFAULT 'Biology',
  selected_tier TEXT NOT NULL DEFAULT 'Higher',
  theme_preference TEXT NOT NULL DEFAULT 'auto'
    CHECK (theme_preference IN ('auto', 'light', 'dark')),
  visual_effects_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (visual_effects_enabled IN (0, 1)),
  guest_profile_sync_pending INTEGER NOT NULL DEFAULT 1
    CHECK (guest_profile_sync_pending IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_profile_subjects (
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  board TEXT NOT NULL DEFAULT 'AQA',
  qualification TEXT NOT NULL DEFAULT 'GCSE',
  course TEXT NOT NULL DEFAULT 'Separate Science',
  tier TEXT NOT NULL DEFAULT 'Higher',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  current_grade TEXT,
  target_grade TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subject)
);

CREATE TABLE user_english_literature_selections (
  user_id TEXT PRIMARY KEY,
  board TEXT NOT NULL DEFAULT 'OCR',
  specification_code TEXT NOT NULL DEFAULT 'J352',
  modern_text TEXT,
  nineteenth_century_novel TEXT,
  poetry_cluster TEXT,
  shakespeare_play TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_question_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_chain_id TEXT,
  answer_text TEXT NOT NULL,
  result TEXT NOT NULL,
  awarded_marks INTEGER NOT NULL DEFAULT 0,
  max_marks INTEGER NOT NULL DEFAULT 0,
  present_step_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(present_step_ids_json)),
  missing_step_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_step_ids_json)),
  feedback_markdown TEXT NOT NULL DEFAULT '',
  model TEXT,
  model_version TEXT,
  question_title TEXT,
  source_question_ref TEXT,
  board TEXT,
  qualification TEXT,
  subject TEXT,
  course TEXT,
  tier TEXT,
  paper TEXT,
  topic_path_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(topic_path_json)),
  chain_title TEXT,
  independent INTEGER NOT NULL DEFAULT 0 CHECK (independent IN (0, 1)),
  assistance_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(assistance_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_question_drafts (
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_chain_id TEXT,
  draft_kind TEXT NOT NULL,
  answer_text TEXT NOT NULL DEFAULT '',
  draft_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(draft_json)),
  client_updated_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE user_chain_gaps (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  answer_chain_id TEXT NOT NULL,
  chain_step_id TEXT NOT NULL,
  source_question_id TEXT,
  latest_attempt_id TEXT,
  board TEXT,
  qualification TEXT,
  subject TEXT,
  course TEXT,
  tier TEXT,
  paper TEXT,
  topic_path_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(topic_path_json)),
  marks INTEGER,
  chain_title TEXT NOT NULL,
  canonical_chain_text TEXT NOT NULL DEFAULT '',
  step_text TEXT NOT NULL,
  step_order INTEGER NOT NULL DEFAULT 0,
  source_question_title TEXT,
  source_question_ref TEXT,
  source_prompt_text TEXT,
  source_context_text TEXT,
  source_metadata_json TEXT CHECK (source_metadata_json IS NULL OR json_valid(source_metadata_json)),
  source_topic_path_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(source_topic_path_json)),
  status TEXT NOT NULL DEFAULT 'active',
  gap_band TEXT NOT NULL DEFAULT 'large_gap',
  evidence_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, answer_chain_id, chain_step_id)
);

CREATE TABLE user_gap_builder_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  gap_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  guided_answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(guided_answers_json)),
  final_answer TEXT,
  result_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(result_json)),
  assistance_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(assistance_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE user_subject_curriculum_scopes (
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
  selected_component_ids_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(selected_component_ids_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subject)
);

CREATE TABLE user_learning_evidence (
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
  independent INTEGER NOT NULL DEFAULT 0 CHECK (independent IN (0, 1)),
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
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json))
);

CREATE TABLE user_learner_component_states (
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
  supporting_evidence_ids_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(supporting_evidence_ids_json)),
  algorithm_version TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, subject, component_kind, component_id)
);

CREATE TABLE user_recommendation_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  board TEXT NOT NULL DEFAULT 'AQA',
  qualification TEXT NOT NULL DEFAULT 'GCSE',
  curriculum_scope_snapshot_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(curriculum_scope_snapshot_json)),
  learner_state_snapshot_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(learner_state_snapshot_json)),
  candidate_actions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(candidate_actions_json)),
  selected_action_id TEXT NOT NULL,
  selected_action_kind TEXT NOT NULL
    CHECK (selected_action_kind IN ('recall', 'close_gap', 'apply_chain')),
  selected_component_kind TEXT NOT NULL,
  selected_component_id TEXT NOT NULL,
  selected_curriculum_component_id TEXT NOT NULL,
  selected_route TEXT NOT NULL,
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

CREATE TABLE user_recall_coverage_misses (
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
  learner_state TEXT NOT NULL CHECK (learner_state IN ('developing', 'conflicting')),
  learner_uncertainty TEXT NOT NULL CHECK (learner_uncertainty IN ('high', 'medium', 'low')),
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

CREATE TABLE user_paper_sitting_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  paper_slug TEXT NOT NULL,
  source_document_id TEXT NOT NULL,
  review_fingerprint TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  total_marks INTEGER NOT NULL CHECK (total_marks > 0),
  question_groups_json TEXT NOT NULL CHECK (json_valid(question_groups_json)),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'grading', 'complete')),
  started_at_ms INTEGER NOT NULL CHECK (started_at_ms > 0),
  submitted_at_ms INTEGER,
  completed_at_ms INTEGER,
  answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(answers_json)),
  response_durations_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(response_durations_json)),
  draft_revision INTEGER NOT NULL DEFAULT 0 CHECK (draft_revision >= 0),
  active_part_ref TEXT,
  active_part_started_at_ms INTEGER,
  results_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(results_json)),
  grade_responses_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(grade_responses_json)),
  next_question_index INTEGER NOT NULL DEFAULT 0 CHECK (next_question_index >= 0),
  graded_question_refs_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(graded_question_refs_json)),
  in_flight_claim_id TEXT,
  in_flight_question_ref TEXT,
  in_flight_started_at_ms INTEGER,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  transition_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (status = 'in_progress' AND submitted_at_ms IS NULL)
    OR (status IN ('submitted', 'grading', 'complete') AND submitted_at_ms IS NOT NULL)
  ),
  CHECK (
    (status = 'complete' AND completed_at_ms IS NOT NULL)
    OR (status <> 'complete' AND completed_at_ms IS NULL)
  ),
  CHECK (
    (in_flight_claim_id IS NULL AND in_flight_question_ref IS NULL AND in_flight_started_at_ms IS NULL)
    OR (in_flight_claim_id IS NOT NULL AND in_flight_question_ref IS NOT NULL AND in_flight_started_at_ms IS NOT NULL)
  ),
  CHECK (
    (active_part_ref IS NULL AND active_part_started_at_ms IS NULL)
    OR (active_part_ref IS NOT NULL AND active_part_started_at_ms IS NOT NULL)
  )
);

CREATE TABLE user_challenge_progress (
  user_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL CHECK (length(challenge_id) BETWEEN 1 AND 120),
  started_at TEXT NOT NULL CHECK (length(started_at) BETWEEN 20 AND 40),
  updated_at TEXT NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 40),
  completed_at TEXT CHECK (completed_at IS NULL OR length(completed_at) BETWEEN 20 AND 40),
  plays INTEGER NOT NULL CHECK (plays BETWEEN 1 AND 1000000),
  last_stage TEXT NOT NULL
    CHECK (last_stage IN ('showdown', 'diagnose', 'repair', 'transfer', 'complete')),
  best_score INTEGER CHECK (best_score IS NULL OR best_score IN (400, 425, 450, 475, 500)),
  best_time_ms INTEGER CHECK (best_time_ms IS NULL OR best_time_ms BETWEEN 0 AND 21600000),
  last_score INTEGER CHECK (last_score IS NULL OR last_score IN (400, 425, 450, 475, 500)),
  last_time_ms INTEGER CHECK (last_time_ms IS NULL OR last_time_ms BETWEEN 0 AND 21600000),
  CHECK (best_score IS NOT NULL OR best_time_ms IS NULL),
  CHECK (last_score IS NOT NULL OR last_time_ms IS NULL),
  CHECK (last_score IS NULL OR (best_score IS NOT NULL AND best_score >= last_score)),
  CHECK (updated_at >= started_at),
  CHECK (completed_at IS NULL OR completed_at <= updated_at),
  CHECK (last_stage != 'complete' OR completed_at IS NOT NULL),
  PRIMARY KEY (user_id, challenge_id)
);

CREATE TABLE user_home_snapshots (
  user_id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL
    CHECK (json_valid(payload_json) AND length(payload_json) <= 524288),
  dirty INTEGER NOT NULL DEFAULT 1 CHECK (dirty IN (0, 1)),
  source_revision INTEGER NOT NULL DEFAULT 0 CHECK (source_revision >= 0),
  snapshot_revision INTEGER NOT NULL DEFAULT 0
    CHECK (snapshot_revision >= 0 AND snapshot_revision <= source_revision),
  refresh_claim TEXT,
  refresh_claimed_at TEXT,
  refreshed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (refresh_claim IS NULL AND refresh_claimed_at IS NULL)
    OR (refresh_claim IS NOT NULL AND refresh_claimed_at IS NOT NULL)
  )
);

CREATE TABLE challenge_leaderboard_snapshots (
  scope TEXT PRIMARY KEY CHECK (scope IN ('all', 'biology', 'chemistry', 'physics')),
  participants_json TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(participants_json) AND json_type(participants_json) = 'object'),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO challenge_leaderboard_snapshots (scope)
VALUES ('all'), ('biology'), ('chemistry'), ('physics');

CREATE INDEX idx_user_profile_subjects_user_enabled
  ON user_profile_subjects (user_id, enabled, subject);
CREATE INDEX idx_user_question_attempts_user_created
  ON user_question_attempts (user_id, created_at DESC);
CREATE INDEX idx_user_question_attempts_user_question
  ON user_question_attempts (user_id, question_id);
CREATE INDEX idx_user_question_attempts_user_subject
  ON user_question_attempts (user_id, subject, created_at DESC);
CREATE INDEX idx_user_question_attempts_course
  ON user_question_attempts (user_id, subject, course, tier, created_at DESC);
CREATE INDEX idx_user_question_drafts_user_updated
  ON user_question_drafts (user_id, updated_at DESC);
CREATE INDEX idx_user_chain_gaps_user_status
  ON user_chain_gaps (user_id, status, updated_at DESC);
CREATE INDEX idx_user_chain_gaps_user_subject
  ON user_chain_gaps (user_id, subject, status, updated_at DESC);
CREATE INDEX idx_user_chain_gaps_user_chain
  ON user_chain_gaps (user_id, answer_chain_id);
CREATE INDEX idx_user_chain_gaps_course
  ON user_chain_gaps (user_id, subject, course, tier, status, updated_at DESC);
CREATE INDEX idx_user_gap_builder_runs_gap_created
  ON user_gap_builder_runs (gap_id, created_at DESC);
CREATE INDEX idx_user_recall_card_reviews_user_due
  ON user_recall_card_reviews (user_id, due_at);
CREATE INDEX idx_user_recall_reviews_course
  ON user_recall_card_reviews (user_id, subject, course, tier, due_at);
CREATE INDEX idx_user_learning_evidence_user_subject_time
  ON user_learning_evidence (user_id, subject, occurred_at DESC);
CREATE INDEX idx_user_learning_evidence_component
  ON user_learning_evidence (user_id, subject, component_kind, component_id, occurred_at DESC);
CREATE INDEX idx_user_learning_evidence_curriculum
  ON user_learning_evidence (user_id, subject, curriculum_component_id, occurred_at DESC);
CREATE INDEX idx_user_learning_evidence_session
  ON user_learning_evidence (user_id, source_session_id, occurred_at);
CREATE INDEX idx_user_learning_evidence_supersedes
  ON user_learning_evidence (user_id, supersedes_evidence_id)
  WHERE supersedes_evidence_id IS NOT NULL;
CREATE INDEX idx_user_learner_states_subject_state
  ON user_learner_component_states (user_id, subject, state, next_check_at);
CREATE INDEX idx_user_learner_states_course
  ON user_learner_component_states (user_id, subject, course, tier, state, next_check_at);
CREATE INDEX idx_user_recommendations_user_subject_time
  ON user_recommendation_decisions (user_id, subject, created_at DESC);
CREATE INDEX idx_user_recall_coverage_misses_scope
  ON user_recall_coverage_misses (user_id, subject, course, tier, last_seen_at DESC);
CREATE INDEX idx_user_recall_coverage_misses_component
  ON user_recall_coverage_misses (offering_id, curriculum_component_id, last_seen_at DESC);
CREATE INDEX idx_user_paper_sittings_user_paper_updated
  ON user_paper_sitting_sessions (user_id, paper_slug, updated_at DESC);
CREATE INDEX idx_user_paper_sittings_in_flight
  ON user_paper_sitting_sessions (status, in_flight_started_at_ms)
  WHERE in_flight_claim_id IS NOT NULL;
CREATE INDEX idx_user_challenge_progress_user_updated
  ON user_challenge_progress (user_id, updated_at DESC);

CREATE TRIGGER user_paper_sitting_sessions_one_way_status
BEFORE UPDATE OF status ON user_paper_sitting_sessions
FOR EACH ROW
WHEN NOT (
  NEW.status = OLD.status
  OR (OLD.status = 'in_progress' AND NEW.status = 'submitted')
  OR (OLD.status = 'submitted' AND NEW.status = 'grading')
  OR (OLD.status = 'grading' AND NEW.status = 'complete')
)
BEGIN
  SELECT RAISE(ABORT, 'paper sitting status cannot move backwards or skip a transition');
END;

CREATE TRIGGER user_paper_sitting_sessions_immutable_identity
BEFORE UPDATE ON user_paper_sitting_sessions
FOR EACH ROW
WHEN
  NEW.user_id IS NOT OLD.user_id
  OR NEW.nonce_hash IS NOT OLD.nonce_hash
  OR NEW.paper_slug IS NOT OLD.paper_slug
  OR NEW.source_document_id IS NOT OLD.source_document_id
  OR NEW.review_fingerprint IS NOT OLD.review_fingerprint
  OR NEW.reviewed_at IS NOT OLD.reviewed_at
  OR NEW.duration_minutes IS NOT OLD.duration_minutes
  OR NEW.total_marks IS NOT OLD.total_marks
  OR NEW.question_groups_json IS NOT OLD.question_groups_json
  OR NEW.started_at_ms IS NOT OLD.started_at_ms
  OR (
    OLD.submitted_at_ms IS NOT NULL
    AND (
      NEW.submitted_at_ms IS NOT OLD.submitted_at_ms
      OR NEW.answers_json IS NOT OLD.answers_json
      OR NEW.response_durations_json IS NOT OLD.response_durations_json
      OR NEW.draft_revision IS NOT OLD.draft_revision
      OR NEW.active_part_ref IS NOT OLD.active_part_ref
      OR NEW.active_part_started_at_ms IS NOT OLD.active_part_started_at_ms
    )
  )
  OR (OLD.completed_at_ms IS NOT NULL AND NEW.completed_at_ms IS NOT OLD.completed_at_ms)
BEGIN
  SELECT RAISE(ABORT, 'paper sitting identity and locked submission are immutable');
END;

-- A new profile always gets the complete, point-readable home projection.
CREATE TRIGGER user_home_snapshot_profile_insert
AFTER INSERT ON user_profiles
FOR EACH ROW
BEGIN
  INSERT INTO user_home_snapshots (
    user_id, payload_json, dirty, source_revision, snapshot_revision
  ) VALUES (
    NEW.uid,
    json_object(
      'dashboard', json_object(
        'studentName',
          CASE
            WHEN NEW.name IS NULL OR trim(NEW.name) = '' THEN ''
            WHEN instr(trim(NEW.name), ' ') > 0
              THEN substr(trim(NEW.name), 1, instr(trim(NEW.name), ' ') - 1)
            ELSE trim(NEW.name)
          END,
        'subjects', json('[]'),
        'weeklySummary', json_object(
          'attemptCount', 0,
          'recallCount', 0,
          'closedGapCount', 0
        )
      ),
      'subjectViews', json('[]'),
      'appearance', json_object(
        'themePreference', NEW.theme_preference,
        'visualEffectsEnabled',
          CASE WHEN NEW.visual_effects_enabled = 0 THEN json('false') ELSE json('true') END
      ),
      'challengeProgress', json_object('version', 2, 'challenges', json('{}')),
      'challengeCompletedCount', 0,
      'challengeTotalBestScore', 0
    ),
    1,
    0,
    0
  );
END;

CREATE TRIGGER user_home_snapshot_profile_update
AFTER UPDATE OF
  name,
  selected_board,
  selected_qualification,
  selected_subject,
  selected_tier,
  theme_preference,
  visual_effects_enabled
ON user_profiles
FOR EACH ROW
WHEN
  NEW.name IS NOT OLD.name
  OR NEW.selected_board IS NOT OLD.selected_board
  OR NEW.selected_qualification IS NOT OLD.selected_qualification
  OR NEW.selected_subject IS NOT OLD.selected_subject
  OR NEW.selected_tier IS NOT OLD.selected_tier
  OR NEW.theme_preference IS NOT OLD.theme_preference
  OR NEW.visual_effects_enabled IS NOT OLD.visual_effects_enabled
BEGIN
  UPDATE user_home_snapshots
  SET
    payload_json = json_set(
      payload_json,
      '$.dashboard.studentName',
        CASE
          WHEN NEW.name IS NULL OR trim(NEW.name) = '' THEN ''
          WHEN instr(trim(NEW.name), ' ') > 0
            THEN substr(trim(NEW.name), 1, instr(trim(NEW.name), ' ') - 1)
          ELSE trim(NEW.name)
        END,
      '$.appearance.themePreference', NEW.theme_preference,
      '$.appearance.visualEffectsEnabled',
        CASE WHEN NEW.visual_effects_enabled = 0 THEN json('false') ELSE json('true') END
    ),
    dirty = CASE
      WHEN
        NEW.name IS NOT OLD.name
        OR NEW.selected_board IS NOT OLD.selected_board
        OR NEW.selected_qualification IS NOT OLD.selected_qualification
        OR NEW.selected_subject IS NOT OLD.selected_subject
        OR NEW.selected_tier IS NOT OLD.selected_tier
      THEN 1
      ELSE dirty
    END,
    source_revision = source_revision + 1,
    snapshot_revision = CASE
      WHEN
        NEW.name IS OLD.name
        AND NEW.selected_board IS OLD.selected_board
        AND NEW.selected_qualification IS OLD.selected_qualification
        AND NEW.selected_subject IS OLD.selected_subject
        AND NEW.selected_tier IS OLD.selected_tier
      THEN snapshot_revision + 1
      ELSE snapshot_revision
    END,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.uid;
END;

CREATE TRIGGER user_home_snapshot_profile_subject_insert
AFTER INSERT ON user_profile_subjects
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_profile_subject_update
AFTER UPDATE ON user_profile_subjects
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_profile_subject_delete
AFTER DELETE ON user_profile_subjects
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER user_home_snapshot_literature_insert
AFTER INSERT ON user_english_literature_selections
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_literature_update
AFTER UPDATE ON user_english_literature_selections
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_literature_delete
AFTER DELETE ON user_english_literature_selections
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER user_home_snapshot_scope_insert
AFTER INSERT ON user_subject_curriculum_scopes
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_scope_update
AFTER UPDATE ON user_subject_curriculum_scopes
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_scope_delete
AFTER DELETE ON user_subject_curriculum_scopes
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER user_home_snapshot_attempt_insert
AFTER INSERT ON user_question_attempts
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_attempt_update
AFTER UPDATE ON user_question_attempts
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_attempt_delete
AFTER DELETE ON user_question_attempts
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER user_home_snapshot_draft_insert
AFTER INSERT ON user_question_drafts
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_draft_update
AFTER UPDATE ON user_question_drafts
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_draft_delete
AFTER DELETE ON user_question_drafts
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER user_home_snapshot_gap_insert
AFTER INSERT ON user_chain_gaps
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_gap_update
AFTER UPDATE ON user_chain_gaps
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_gap_delete
AFTER DELETE ON user_chain_gaps
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER user_home_snapshot_review_insert
AFTER INSERT ON user_recall_card_reviews
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_review_update
AFTER UPDATE ON user_recall_card_reviews
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_review_delete
AFTER DELETE ON user_recall_card_reviews
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER user_home_snapshot_evidence_insert
AFTER INSERT ON user_learning_evidence
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_evidence_update
AFTER UPDATE ON user_learning_evidence
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_evidence_delete
AFTER DELETE ON user_learning_evidence
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER user_home_snapshot_component_state_insert
AFTER INSERT ON user_learner_component_states
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_component_state_update
AFTER UPDATE ON user_learner_component_states
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_component_state_delete
AFTER DELETE ON user_learner_component_states
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

CREATE TRIGGER user_home_snapshot_recommendation_insert
AFTER INSERT ON user_recommendation_decisions
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_recommendation_update
AFTER UPDATE ON user_recommendation_decisions
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_recommendation_delete
AFTER DELETE ON user_recommendation_decisions
BEGIN
  UPDATE user_home_snapshots
  SET dirty = 1, source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

-- Challenge writes are projected immediately by the application. Advancing
-- only the source revision gives that projection a constant-size CAS fence.
CREATE TRIGGER user_home_snapshot_challenge_progress_insert
AFTER INSERT ON user_challenge_progress
BEGIN
  UPDATE user_home_snapshots
  SET source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_challenge_progress_update
AFTER UPDATE ON user_challenge_progress
BEGIN
  UPDATE user_home_snapshots
  SET source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
CREATE TRIGGER user_home_snapshot_challenge_progress_delete
AFTER DELETE ON user_challenge_progress
BEGIN
  UPDATE user_home_snapshots
  SET source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;

-- Personal tables intentionally do not require a profile row because guest
-- challenge sync can race first profile creation. This one trigger is the
-- complete deletion boundary and prevents orphaned personal rows.
CREATE TRIGGER user_profile_delete_cascade
AFTER DELETE ON user_profiles
FOR EACH ROW
BEGIN
  DELETE FROM user_home_snapshots WHERE user_id = OLD.uid;
  DELETE FROM user_paper_sitting_sessions WHERE user_id = OLD.uid;
  DELETE FROM user_recommendation_decisions WHERE user_id = OLD.uid;
  DELETE FROM user_learner_component_states WHERE user_id = OLD.uid;
  DELETE FROM user_recall_coverage_misses WHERE user_id = OLD.uid;
  DELETE FROM user_gap_builder_runs WHERE user_id = OLD.uid;
  DELETE FROM user_chain_gaps WHERE user_id = OLD.uid;
  DELETE FROM user_learning_evidence WHERE user_id = OLD.uid;
  DELETE FROM user_question_attempts WHERE user_id = OLD.uid;
  DELETE FROM user_question_drafts WHERE user_id = OLD.uid;
  DELETE FROM user_recall_card_reviews WHERE user_id = OLD.uid;
  DELETE FROM user_subject_curriculum_scopes WHERE user_id = OLD.uid;
  DELETE FROM user_english_literature_selections WHERE user_id = OLD.uid;
  DELETE FROM user_profile_subjects WHERE user_id = OLD.uid;
  DELETE FROM user_challenge_progress WHERE user_id = OLD.uid;
  UPDATE challenge_leaderboard_snapshots
  SET
    participants_json = json_remove(
      participants_json,
      '$."' || lower(hex(CAST(OLD.uid AS BLOB))) || '"'
    ),
    updated_at = CURRENT_TIMESTAMP;
END;
