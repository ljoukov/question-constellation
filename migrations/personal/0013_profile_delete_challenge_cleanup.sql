-- Challenge progress has no foreign key to user_profiles, so clean it up
-- explicitly alongside the materialised home snapshot when a profile is
-- deleted.
DROP TRIGGER IF EXISTS user_home_snapshot_profile_delete;

CREATE TRIGGER user_home_snapshot_profile_delete
AFTER DELETE ON user_profiles
FOR EACH ROW
BEGIN
  DELETE FROM user_challenge_progress WHERE user_id = OLD.uid;
  DELETE FROM user_home_snapshots WHERE user_id = OLD.uid;
END;

-- Canonical progress writes advance the projection fence. A successful
-- application-level projection catches snapshot_revision up to source_revision.
-- If projection fails, the mismatch makes the row stale and eligible for repair.
CREATE TRIGGER user_home_snapshot_challenge_progress_insert
AFTER INSERT ON user_challenge_progress
FOR EACH ROW
BEGIN
  UPDATE user_home_snapshots
  SET source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER user_home_snapshot_challenge_progress_update
AFTER UPDATE ON user_challenge_progress
FOR EACH ROW
BEGIN
  UPDATE user_home_snapshots
  SET source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER user_home_snapshot_challenge_progress_delete
AFTER DELETE ON user_challenge_progress
FOR EACH ROW
BEGIN
  UPDATE user_home_snapshots
  SET source_revision = source_revision + 1, updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id;
END;
