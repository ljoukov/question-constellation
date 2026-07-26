-- Challenge recommendations are derived from the current bundled catalogue
-- and the saved challengeProgress object on every learner-facing load. Remove
-- the duplicate title/hook projection so catalogue copy cannot go stale in D1.
UPDATE user_home_snapshots
SET
  schema_version = 4,
  payload_json = json_remove(
    json_set(payload_json, '$.version', 4),
    '$.challengeRecommendation'
  ),
  dirty = 1,
  source_revision = source_revision + 1,
  refresh_claim = NULL,
  refresh_claimed_at = NULL,
  updated_at = CURRENT_TIMESTAMP;

DROP TRIGGER IF EXISTS user_home_snapshot_profile_insert;

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
    4,
    json_object(
      'version', 4,
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
        'themePreference',
          CASE
            WHEN NEW.theme_preference IN ('auto', 'light', 'dark') THEN NEW.theme_preference
            ELSE 'auto'
          END,
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
  )
  ON CONFLICT(user_id) DO UPDATE SET
    schema_version = 4,
    payload_json = json_remove(
      json_set(
        user_home_snapshots.payload_json,
        '$.version', 4,
        '$.dashboard.studentName',
          CASE
            WHEN NEW.name IS NULL OR trim(NEW.name) = '' THEN ''
            WHEN instr(trim(NEW.name), ' ') > 0
              THEN substr(trim(NEW.name), 1, instr(trim(NEW.name), ' ') - 1)
            ELSE trim(NEW.name)
          END,
        '$.dashboard.subjects', json('[]'),
        '$.subjectViews', json('[]'),
        '$.appearance.themePreference',
          CASE
            WHEN NEW.theme_preference IN ('auto', 'light', 'dark') THEN NEW.theme_preference
            ELSE 'auto'
          END,
        '$.appearance.visualEffectsEnabled',
          CASE WHEN NEW.visual_effects_enabled = 0 THEN json('false') ELSE json('true') END
      ),
      '$.challengeRecommendation'
    ),
    dirty = 1,
    source_revision = user_home_snapshots.source_revision + 1,
    refresh_claim = NULL,
    refresh_claimed_at = NULL,
    updated_at = CURRENT_TIMESTAMP;
END;
