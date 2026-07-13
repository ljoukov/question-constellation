-- Existing r2_key/public_path/asset_sha256 columns remain the dark-mode asset aliases.
-- The light variant is an edit of the same composition and is published on the same row.
ALTER TABLE answer_chain_illustrations ADD COLUMN light_r2_key TEXT;
ALTER TABLE answer_chain_illustrations ADD COLUMN light_public_path TEXT;
ALTER TABLE answer_chain_illustrations ADD COLUMN light_asset_sha256 TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_answer_chain_illustrations_light_r2_key
  ON answer_chain_illustrations (light_r2_key)
  WHERE light_r2_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_answer_chain_illustrations_light_public_path
  ON answer_chain_illustrations (light_public_path)
  WHERE light_public_path IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_light_pair_insert
BEFORE INSERT ON answer_chain_illustrations
WHEN (
  NEW.light_r2_key IS NULL
  OR NEW.light_public_path IS NULL
  OR NEW.light_asset_sha256 IS NULL
) AND (
  NEW.light_r2_key IS NOT NULL
  OR NEW.light_public_path IS NOT NULL
  OR NEW.light_asset_sha256 IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'answer-chain illustration light assets must be stored as a complete pair');
END;

CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_light_pair_update
BEFORE UPDATE OF light_r2_key, light_public_path, light_asset_sha256
ON answer_chain_illustrations
WHEN (
  NEW.light_r2_key IS NULL
  OR NEW.light_public_path IS NULL
  OR NEW.light_asset_sha256 IS NULL
) AND (
  NEW.light_r2_key IS NOT NULL
  OR NEW.light_public_path IS NOT NULL
  OR NEW.light_asset_sha256 IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'answer-chain illustration light assets must be stored as a complete pair');
END;

CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_distinct_pair_insert
BEFORE INSERT ON answer_chain_illustrations
WHEN NEW.light_r2_key = NEW.r2_key
  OR NEW.light_public_path = NEW.public_path
  OR NEW.light_asset_sha256 = NEW.asset_sha256
BEGIN
  SELECT RAISE(ABORT, 'answer-chain illustration dark and light assets must be distinct');
END;

CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_distinct_pair_update
BEFORE UPDATE ON answer_chain_illustrations
WHEN NEW.light_r2_key = NEW.r2_key
  OR NEW.light_public_path = NEW.public_path
  OR NEW.light_asset_sha256 = NEW.asset_sha256
BEGIN
  SELECT RAISE(ABORT, 'answer-chain illustration dark and light assets must be distinct');
END;

-- Existing dark-only rows are intentionally not returned by the runtime query. They can be
-- backfilled atomically by setting all three light fields in one update. Every newly inserted or
-- variant/status-updated published row must be a complete dark/light pair. Primary demotion remains
-- possible so a new verified pair can replace a legacy row.
CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_published_pair_insert
BEFORE INSERT ON answer_chain_illustrations
WHEN NEW.status = 'published' AND (
  NEW.light_r2_key IS NULL
  OR NEW.light_public_path IS NULL
  OR NEW.light_asset_sha256 IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'published answer-chain illustrations require dark and light assets');
END;

CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_published_pair_update
BEFORE UPDATE OF status, light_r2_key, light_public_path, light_asset_sha256
ON answer_chain_illustrations
WHEN NEW.status = 'published' AND (
  NEW.light_r2_key IS NULL
  OR NEW.light_public_path IS NULL
  OR NEW.light_asset_sha256 IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'published answer-chain illustrations require dark and light assets');
END;
