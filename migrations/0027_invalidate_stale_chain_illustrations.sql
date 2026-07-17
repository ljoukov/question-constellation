-- A stored source fingerprint is meaningful only while every input used to compute it is
-- unchanged. Retire the pre-trigger population once, then fail closed on future evidence edits.
UPDATE answer_chain_illustrations
SET is_primary = 0,
    status = 'draft',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'published';

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_chain_update
AFTER UPDATE ON answer_chains
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id = NEW.id AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_step_insert
AFTER INSERT ON answer_chain_steps
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id = NEW.answer_chain_id AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_step_update
AFTER UPDATE ON answer_chain_steps
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (OLD.answer_chain_id, NEW.answer_chain_id)
    AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_step_delete
AFTER DELETE ON answer_chain_steps
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id = OLD.answer_chain_id AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_mapping_insert
AFTER INSERT ON question_answer_chains
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id = NEW.answer_chain_id AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_mapping_update
AFTER UPDATE ON question_answer_chains
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (OLD.answer_chain_id, NEW.answer_chain_id)
    AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_mapping_delete
AFTER DELETE ON question_answer_chains
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id = OLD.answer_chain_id AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_question_update
AFTER UPDATE ON questions
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = NEW.id
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_question_delete
BEFORE DELETE ON questions
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = OLD.id
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_overlay_insert
AFTER INSERT ON question_rendering_overlays
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = NEW.question_id
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_overlay_update
AFTER UPDATE ON question_rendering_overlays
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains
    WHERE question_id IN (OLD.question_id, NEW.question_id)
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_overlay_delete
AFTER DELETE ON question_rendering_overlays
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = OLD.question_id
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_mark_insert
AFTER INSERT ON mark_scheme_items
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = NEW.question_id
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_mark_update
AFTER UPDATE ON mark_scheme_items
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains
    WHERE question_id IN (OLD.question_id, NEW.question_id)
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_mark_delete
AFTER DELETE ON mark_scheme_items
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = OLD.question_id
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_checklist_insert
AFTER INSERT ON mark_checklist_items
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = NEW.question_id
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_checklist_update
AFTER UPDATE ON mark_checklist_items
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains
    WHERE question_id IN (OLD.question_id, NEW.question_id)
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_checklist_delete
AFTER DELETE ON mark_checklist_items
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = OLD.question_id
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_model_insert
AFTER INSERT ON model_answers
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = NEW.question_id
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_model_update
AFTER UPDATE ON model_answers
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains
    WHERE question_id IN (OLD.question_id, NEW.question_id)
  ) AND status = 'published';
END;

CREATE TRIGGER IF NOT EXISTS answer_chain_illustrations_stale_on_model_delete
AFTER DELETE ON model_answers
BEGIN
  UPDATE answer_chain_illustrations
  SET is_primary = 0, status = 'draft', updated_at = CURRENT_TIMESTAMP
  WHERE answer_chain_id IN (
    SELECT answer_chain_id FROM question_answer_chains WHERE question_id = OLD.question_id
  ) AND status = 'published';
END;
