-- Snapshot v3 retires cached navigation projections created before the
-- canonical /questions, /subjects/:subject/content, and path-led recall routes.
-- Keep appearance and challenge progress available immediately, but clear
-- subject lanes until the catalog-backed refresh rebuilds their hrefs.
UPDATE user_home_snapshots
SET
  schema_version = 3,
  payload_json = json_set(
    payload_json,
    '$.version', 3,
    '$.dashboard.subjects', json('[]'),
    '$.subjectViews', json('[]')
  ),
  dirty = 1,
  source_revision = source_revision + 1,
  refresh_claim = NULL,
  refresh_claimed_at = NULL,
  updated_at = CURRENT_TIMESTAMP;

-- Seed new accounts with a v3-compatible point-readable fallback before the
-- first catalog-backed prewarm fills in their subject lanes.
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
    3,
    json_object(
      'version', 3,
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
    schema_version = 3,
    payload_json = json_set(
      user_home_snapshots.payload_json,
      '$.version', 3,
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
    dirty = 1,
    source_revision = user_home_snapshots.source_revision + 1,
    refresh_claim = NULL,
    refresh_claimed_at = NULL,
    updated_at = CURRENT_TIMESTAMP;
END;
