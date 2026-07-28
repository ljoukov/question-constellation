-- Leaderboards are requested on every challenge page. Store the complete
-- participant projection once per scope so each page performs one indexed row
-- read instead of scanning every learner's per-challenge progress rows.
CREATE TABLE challenge_leaderboard_snapshots (
  scope TEXT PRIMARY KEY
    CHECK (scope IN ('all', 'biology', 'chemistry', 'physics')),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  participants_json TEXT NOT NULL DEFAULT '{}'
    CHECK (
      json_valid(participants_json)
      AND json_type(participants_json) = 'object'
    ),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO challenge_leaderboard_snapshots (scope)
VALUES ('all'), ('biology'), ('chemistry'), ('physics');

-- Identity keys are lowercase UTF-8 hex. They are safe JSON object keys and
-- keep raw account ids out of the runtime leaderboard result.
WITH scoped_scores AS (
  SELECT
    'all' AS scope,
    lower(hex(CAST(user_id AS BLOB))) AS identity_key,
    SUM(best_score) AS total_score,
    COUNT(*) AS completed_count
  FROM user_challenge_progress
  WHERE best_score IS NOT NULL
  GROUP BY user_id

  UNION ALL

  SELECT
    CASE
      WHEN challenge_id GLOB 'biology-*' THEN 'biology'
      WHEN challenge_id GLOB 'chemistry-*' THEN 'chemistry'
      WHEN challenge_id GLOB 'physics-*' THEN 'physics'
    END AS scope,
    lower(hex(CAST(user_id AS BLOB))) AS identity_key,
    SUM(best_score) AS total_score,
    COUNT(*) AS completed_count
  FROM user_challenge_progress
  WHERE best_score IS NOT NULL
    AND (
      challenge_id GLOB 'biology-*'
      OR challenge_id GLOB 'chemistry-*'
      OR challenge_id GLOB 'physics-*'
    )
  GROUP BY scope, user_id
),
scope_payloads AS (
  SELECT
    scope,
    json_group_object(
      identity_key,
      json_object('score', total_score, 'completed', completed_count)
    ) AS participants_json
  FROM scoped_scores
  GROUP BY scope
)
UPDATE challenge_leaderboard_snapshots
SET
  participants_json = COALESCE(
    (
      SELECT scope_payloads.participants_json
      FROM scope_payloads
      WHERE scope_payloads.scope = challenge_leaderboard_snapshots.scope
    ),
    json('{}')
  ),
  updated_at = CURRENT_TIMESTAMP;

-- Profile deletion must also remove the denormalized leaderboard identity.
DROP TRIGGER IF EXISTS user_home_snapshot_profile_delete;

CREATE TRIGGER user_home_snapshot_profile_delete
AFTER DELETE ON user_profiles
FOR EACH ROW
BEGIN
  DELETE FROM user_challenge_progress WHERE user_id = OLD.uid;
  DELETE FROM user_home_snapshots WHERE user_id = OLD.uid;
  UPDATE challenge_leaderboard_snapshots
  SET
    participants_json = json_remove(
      participants_json,
      '$."' || lower(hex(CAST(OLD.uid AS BLOB))) || '"'
    ),
    updated_at = CURRENT_TIMESTAMP;
END;
