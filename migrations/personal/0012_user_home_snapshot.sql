-- Materialise the complete signed-in home payload into one point-readable row.
-- Source-table triggers only invalidate the row. A background refresh claims a
-- source revision, rebuilds from canonical data, and publishes with CAS.
CREATE TABLE user_home_snapshots (
  user_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1
    CHECK (schema_version >= 1),
  payload_json TEXT NOT NULL
    CHECK (json_valid(payload_json) AND length(payload_json) <= 524288),
  dirty INTEGER NOT NULL DEFAULT 1
    CHECK (dirty IN (0, 1)),
  source_revision INTEGER NOT NULL DEFAULT 0
    CHECK (source_revision >= 0),
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

-- Existing accounts get an appearance-correct, useful fallback immediately.
-- The first background refresh replaces the empty learning lanes.
INSERT INTO user_home_snapshots (
  user_id,
  schema_version,
  payload_json,
  dirty,
  source_revision,
  snapshot_revision
)
SELECT
  uid,
  1,
  json_object(
    'version', 1,
    'dashboard', json_object(
      'studentName',
        CASE
          WHEN name IS NULL OR trim(name) = '' THEN ''
          WHEN instr(trim(name), ' ') > 0
            THEN substr(trim(name), 1, instr(trim(name), ' ') - 1)
          ELSE trim(name)
        END,
      'subjects', json('[]'),
      'weeklySummary', json_object(
        'attemptCount', 0,
        'recallCount', 0,
        'closedGapCount', 0
      )
    ),
    'appearance', json_object(
      'themePreference',
        CASE
          WHEN theme_preference IN ('auto', 'light', 'dark') THEN theme_preference
          ELSE 'auto'
        END,
      'visualEffectsEnabled',
        CASE WHEN visual_effects_enabled = 0 THEN json('false') ELSE json('true') END
    ),
    'challengeProgress', json_object('version', 2, 'challenges', json('{}')),
    'challengeRecommendation', json_object(
      'id', 'biology-data-conclusions',
      'slug', 'smoking-risk-data-conclusions',
      'subject', 'biology',
      'title', 'Can you draw a conclusion from smoking-risk data?',
      'hook', '“Smoking causes disease” sounds scientific — but the table cannot prove that.'
    ),
    'challengeCompletedCount', 0,
    'challengeTotalBestScore', 0
  ),
  1,
  0,
  0
FROM user_profiles
;

-- New profiles receive the same fallback without making the first home request
-- fan out to profile/settings tables.
CREATE TRIGGER user_home_snapshot_profile_insert
AFTER INSERT ON user_profiles
FOR EACH ROW
BEGIN
  INSERT INTO user_home_snapshots (
    user_id,
    schema_version,
    payload_json,
    dirty,
    source_revision,
    snapshot_revision
  ) VALUES (
    NEW.uid,
    1,
    json_object(
      'version', 1,
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
      'appearance', json_object(
        'themePreference',
          CASE
            WHEN NEW.theme_preference IN ('auto', 'light', 'dark') THEN NEW.theme_preference
            ELSE 'auto'
          END,
        'visualEffectsEnabled',
          CASE WHEN NEW.visual_effects_enabled = 0 THEN json('false') ELSE json('true') END
      ),
      'challengeProgress', json_object('version', 2, 'challenges', json('{}')),
      'challengeRecommendation', json_object(
        'id', 'biology-data-conclusions',
        'slug', 'smoking-risk-data-conclusions',
        'subject', 'biology',
        'title', 'Can you draw a conclusion from smoking-risk data?',
        'hook', '“Smoking causes disease” sounds scientific — but the table cannot prove that.'
      ),
      'challengeCompletedCount', 0,
      'challengeTotalBestScore', 0
    ),
    1,
    0,
    0
  )
  ON CONFLICT(user_id) DO UPDATE SET
    payload_json = json_set(
      user_home_snapshots.payload_json,
      '$.dashboard.studentName',
        CASE
          WHEN NEW.name IS NULL OR trim(NEW.name) = '' THEN ''
          WHEN instr(trim(NEW.name), ' ') > 0
            THEN substr(trim(NEW.name), 1, instr(trim(NEW.name), ' ') - 1)
          ELSE trim(NEW.name)
        END,
      '$.appearance.themePreference',
        CASE
          WHEN NEW.theme_preference IN ('auto', 'light', 'dark') THEN NEW.theme_preference
          ELSE 'auto'
        END,
      '$.appearance.visualEffectsEnabled',
        CASE WHEN NEW.visual_effects_enabled = 0 THEN json('false') ELSE json('true') END
    ),
    dirty = 1,
    source_revision = user_home_snapshots.source_revision + 1,
    updated_at = CURRENT_TIMESTAMP;
END;

-- Profile identity/configuration and appearance are projected directly. A
-- last_seen-only UPDATE does not fire this trigger.
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
      '$.appearance.themePreference',
        CASE
          WHEN NEW.theme_preference IN ('auto', 'light', 'dark') THEN NEW.theme_preference
          ELSE 'auto'
        END,
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

-- Each learner-model source invalidates only its owning snapshot row. These
-- point updates avoid scans and make concurrent refreshes fail their CAS.

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
