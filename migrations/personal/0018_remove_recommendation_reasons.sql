-- Recommendation explanations were removed from the learner UI because they
-- repeated the action detail. Keep only the selected action and decision
-- provenance; the generated prose and its duplicate source code are not part
-- of the recommendation model anymore.
ALTER TABLE user_recommendation_decisions DROP COLUMN reason_text;
ALTER TABLE user_recommendation_decisions DROP COLUMN reason_code;

-- Purge the retired field from materialized subject views immediately. The
-- ordinary snapshot refresh repopulates the lanes from the slimmer view type.
UPDATE user_home_snapshots
SET
  payload_json = json_set(
    payload_json,
    '$.dashboard.subjects', json('[]'),
    '$.subjectViews', json('[]')
  ),
  dirty = 1,
  source_revision = source_revision + 1,
  refresh_claim = NULL,
  refresh_claimed_at = NULL,
  updated_at = CURRENT_TIMESTAMP;
