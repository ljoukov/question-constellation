ALTER TABLE user_profiles
ADD COLUMN local_profile_import_pending INTEGER NOT NULL DEFAULT 1
CHECK (local_profile_import_pending IN (0, 1));

-- Every profile that predates this provenance marker is established, even when
-- it still has the historical AQA/Biology/Higher defaults and no subject rows.
UPDATE user_profiles
SET local_profile_import_pending = 0;
