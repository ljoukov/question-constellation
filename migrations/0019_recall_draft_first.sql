-- Publishing is a state transition so the 0018 validation triggers always run.
-- This also prevents a direct INSERT from bypassing child-row checks.

CREATE TRIGGER recall_cards_insert_as_draft
BEFORE INSERT ON recall_cards
WHEN NEW.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'recall cards must be inserted as drafts before publication');
END;

CREATE TRIGGER recall_cards_published_content_immutable
BEFORE UPDATE ON recall_cards
WHEN OLD.status = 'published' AND NEW.status = 'published' AND (
  NEW.concept_key <> OLD.concept_key
  OR NEW.board <> OLD.board
  OR NEW.qualification <> OLD.qualification
  OR NEW.subject <> OLD.subject
  OR NEW.kind <> OLD.kind
  OR NEW.visual_cue <> OLD.visual_cue
  OR NEW.front <> OLD.front
  OR NEW.back <> OLD.back
  OR COALESCE(NEW.reverse_front, '') <> COALESCE(OLD.reverse_front, '')
  OR COALESCE(NEW.reverse_back, '') <> COALESCE(OLD.reverse_back, '')
  OR NEW.explanation <> OLD.explanation
  OR COALESCE(NEW.memory_tip, '') <> COALESCE(OLD.memory_tip, '')
  OR NEW.content_revision <> OLD.content_revision
  OR NEW.content_hash <> OLD.content_hash
  OR NEW.source_fingerprint <> OLD.source_fingerprint
  OR NEW.generation_run_id <> OLD.generation_run_id
  OR NEW.provenance_json <> OLD.provenance_json
  OR NEW.needs_human_review <> OLD.needs_human_review
)
BEGIN
  SELECT RAISE(ABORT, 'published recall-card content must be retired before revision');
END;

CREATE TRIGGER recall_choices_published_parent_immutable_insert
BEFORE INSERT ON recall_card_choices
WHEN EXISTS (SELECT 1 FROM recall_cards WHERE id = NEW.card_id AND status = 'published')
BEGIN
  SELECT RAISE(ABORT, 'published recall-card choices are immutable');
END;

CREATE TRIGGER recall_choices_published_parent_immutable_update
BEFORE UPDATE ON recall_card_choices
WHEN EXISTS (
  SELECT 1 FROM recall_cards
  WHERE id IN (OLD.card_id, NEW.card_id) AND status = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'published recall-card choices are immutable');
END;

CREATE TRIGGER recall_choices_published_parent_immutable_delete
BEFORE DELETE ON recall_card_choices
WHEN EXISTS (SELECT 1 FROM recall_cards WHERE id = OLD.card_id AND status = 'published')
BEGIN
  SELECT RAISE(ABORT, 'published recall-card choices are immutable');
END;

CREATE TRIGGER recall_evidence_published_parent_immutable_insert
BEFORE INSERT ON recall_card_evidence
WHEN EXISTS (SELECT 1 FROM recall_cards WHERE id = NEW.card_id AND status = 'published')
BEGIN
  SELECT RAISE(ABORT, 'published recall-card evidence is immutable');
END;

CREATE TRIGGER recall_evidence_published_parent_immutable_update
BEFORE UPDATE ON recall_card_evidence
WHEN EXISTS (
  SELECT 1 FROM recall_cards
  WHERE id IN (OLD.card_id, NEW.card_id) AND status = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'published recall-card evidence is immutable');
END;

CREATE TRIGGER recall_evidence_published_parent_immutable_delete
BEFORE DELETE ON recall_card_evidence
WHEN EXISTS (SELECT 1 FROM recall_cards WHERE id = OLD.card_id AND status = 'published')
BEGIN
  SELECT RAISE(ABORT, 'published recall-card evidence is immutable');
END;

CREATE TRIGGER recall_targets_published_parent_immutable_insert
BEFORE INSERT ON recall_card_curriculum_targets
WHEN EXISTS (SELECT 1 FROM recall_cards WHERE id = NEW.card_id AND status = 'published')
BEGIN
  SELECT RAISE(ABORT, 'published recall-card targets are immutable');
END;

CREATE TRIGGER recall_targets_published_parent_immutable_update
BEFORE UPDATE ON recall_card_curriculum_targets
WHEN EXISTS (
  SELECT 1 FROM recall_cards
  WHERE id IN (OLD.card_id, NEW.card_id) AND status = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'published recall-card targets are immutable');
END;

CREATE TRIGGER recall_targets_published_parent_immutable_delete
BEFORE DELETE ON recall_card_curriculum_targets
WHEN EXISTS (SELECT 1 FROM recall_cards WHERE id = OLD.card_id AND status = 'published')
BEGIN
  SELECT RAISE(ABORT, 'published recall-card targets are immutable');
END;
