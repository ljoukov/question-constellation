-- Promoting a complete verified theme pair atomically replaces any older primary row.
-- This also lets the first paired asset replace a legacy dark-only primary illustration.
CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_replace_primary_insert
BEFORE INSERT ON answer_chain_illustrations
WHEN NEW.is_primary = 1 AND NEW.status = 'published'
BEGIN
  UPDATE answer_chain_illustrations
     SET is_primary = 0,
         status = 'draft',
         updated_at = CURRENT_TIMESTAMP
   WHERE answer_chain_id = NEW.answer_chain_id
     AND id <> NEW.id
     AND is_primary = 1;
END;

CREATE TRIGGER IF NOT EXISTS trg_answer_chain_illustrations_replace_primary_update
BEFORE UPDATE OF answer_chain_id, is_primary, status ON answer_chain_illustrations
WHEN NEW.is_primary = 1 AND NEW.status = 'published'
BEGIN
  UPDATE answer_chain_illustrations
     SET is_primary = 0,
         status = 'draft',
         updated_at = CURRENT_TIMESTAMP
   WHERE answer_chain_id = NEW.answer_chain_id
     AND id <> NEW.id
     AND is_primary = 1;
END;
