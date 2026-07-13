ALTER TABLE answer_chain_illustrations ADD COLUMN source_fingerprint TEXT;
ALTER TABLE answer_chain_illustrations ADD COLUMN asset_sha256 TEXT;
ALTER TABLE answer_chain_illustrations ADD COLUMN generation_model TEXT;

CREATE INDEX IF NOT EXISTS idx_answer_chain_illustrations_fingerprint
  ON answer_chain_illustrations (answer_chain_id, source_fingerprint, status);

CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_primary_insert
BEFORE INSERT ON answer_chain_illustrations
WHEN NEW.is_primary = 1 AND NEW.status = 'published'
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id = NEW.answer_chain_id
    AND id <> NEW.id
    AND is_primary = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_primary_update
BEFORE UPDATE OF is_primary, status, answer_chain_id ON answer_chain_illustrations
WHEN NEW.is_primary = 1 AND NEW.status = 'published'
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id = NEW.answer_chain_id
    AND id <> NEW.id
    AND is_primary = 1;
END;
