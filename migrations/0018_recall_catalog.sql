-- Versioned, curriculum-grounded recall-card catalog.
--
-- Cards enter as drafts. The publish transition is deliberately guarded so a
-- partially imported or unreviewed bundle cannot become learner-facing.

CREATE TABLE recall_generation_runs (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  generator_model TEXT NOT NULL,
  generator_thinking_level TEXT NOT NULL,
  reviewer_model TEXT NOT NULL,
  reviewer_thinking_level TEXT NOT NULL,
  cue_reviewer_model TEXT NOT NULL,
  cue_reviewer_thinking_level TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  artifact_path TEXT,
  run_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'imported', 'rejected')),
  import_owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recall_cards (
  id TEXT PRIMARY KEY,
  concept_key TEXT NOT NULL,
  board TEXT NOT NULL CHECK (board = 'AQA'),
  qualification TEXT NOT NULL CHECK (qualification = 'GCSE'),
  subject TEXT NOT NULL CHECK (subject IN ('Biology', 'Chemistry', 'Physics')),
  kind TEXT NOT NULL CHECK (
    kind IN ('definition', 'formula', 'process', 'test-result', 'unit', 'practical', 'fact', 'comparison')
  ),
  visual_cue TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  reverse_front TEXT,
  reverse_back TEXT,
  explanation TEXT NOT NULL,
  memory_tip TEXT,
  content_revision INTEGER NOT NULL CHECK (content_revision >= 1),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  source_fingerprint TEXT NOT NULL,
  generation_run_id TEXT NOT NULL REFERENCES recall_generation_runs(id) ON DELETE RESTRICT,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  needs_human_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_human_review IN (0, 1)),
  import_owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (subject, concept_key)
);

CREATE TABLE recall_card_choices (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES recall_cards(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 0 AND 3),
  choice_key TEXT NOT NULL,
  text TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  feedback TEXT NOT NULL,
  misconception TEXT,
  import_owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (card_id, display_order),
  UNIQUE (card_id, choice_key),
  UNIQUE (card_id, text)
);

CREATE TABLE recall_card_evidence (
  id TEXT NOT NULL,
  card_id TEXT NOT NULL REFERENCES recall_cards(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind = 'curriculum_component'),
  specification_id TEXT NOT NULL REFERENCES curriculum_specifications(id) ON DELETE CASCADE,
  curriculum_component_id TEXT NOT NULL REFERENCES curriculum_components(id) ON DELETE CASCADE,
  source_page_start INTEGER NOT NULL CHECK (source_page_start > 0),
  source_page_end INTEGER NOT NULL CHECK (source_page_end >= source_page_start),
  source_excerpt TEXT NOT NULL,
  source_file_hash TEXT NOT NULL CHECK (length(source_file_hash) = 64),
  excerpt_hash TEXT NOT NULL CHECK (length(excerpt_hash) = 64),
  supports_json TEXT NOT NULL,
  import_owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (card_id, id)
);

CREATE TABLE recall_card_curriculum_targets (
  card_id TEXT NOT NULL REFERENCES recall_cards(id) ON DELETE CASCADE,
  offering_id TEXT NOT NULL REFERENCES curriculum_offerings(id) ON DELETE CASCADE,
  curriculum_component_id TEXT NOT NULL REFERENCES curriculum_components(id) ON DELETE CASCADE,
  topic_component_id TEXT NOT NULL REFERENCES curriculum_components(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reviewed INTEGER NOT NULL CHECK (reviewed IN (0, 1)),
  mapping_source TEXT NOT NULL,
  import_owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (card_id, offering_id)
);

CREATE INDEX idx_recall_cards_published
  ON recall_cards (subject, status, needs_human_review, kind, id);

CREATE UNIQUE INDEX idx_recall_choices_one_correct
  ON recall_card_choices (card_id)
  WHERE is_correct = 1;

CREATE INDEX idx_recall_evidence_component
  ON recall_card_evidence (curriculum_component_id, card_id);

CREATE INDEX idx_recall_targets_offering_topic
  ON recall_card_curriculum_targets (offering_id, topic_component_id, reviewed, card_id);

CREATE UNIQUE INDEX idx_recall_targets_one_primary
  ON recall_card_curriculum_targets (card_id)
  WHERE is_primary = 1;

CREATE TRIGGER recall_cards_publish_choice_count
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  SELECT COUNT(*) FROM recall_card_choices WHERE card_id = NEW.id
) <> 4
BEGIN
  SELECT RAISE(ABORT, 'recall card requires exactly four choices');
END;

CREATE TRIGGER recall_cards_publish_choice_feedback
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND EXISTS (
  SELECT 1 FROM recall_card_choices
  WHERE card_id = NEW.id AND length(trim(feedback)) = 0
)
BEGIN
  SELECT RAISE(ABORT, 'recall card choices require feedback');
END;

CREATE TRIGGER recall_cards_publish_correct_choice_count
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  SELECT COUNT(*) FROM recall_card_choices
  WHERE card_id = NEW.id AND is_correct = 1
) <> 1
BEGIN
  SELECT RAISE(ABORT, 'recall card requires exactly one correct choice');
END;

CREATE TRIGGER recall_cards_publish_correct_choice_text
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  SELECT COUNT(*) FROM recall_card_choices
  WHERE card_id = NEW.id AND is_correct = 1 AND trim(text) = trim(NEW.back)
) <> 1
BEGIN
  SELECT RAISE(ABORT, 'recall card correct choice must equal its canonical answer');
END;

CREATE TRIGGER recall_cards_publish_evidence
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  SELECT COUNT(*) FROM recall_card_evidence WHERE card_id = NEW.id
) < 1
BEGIN
  SELECT RAISE(ABORT, 'recall card requires source evidence');
END;

CREATE TRIGGER recall_cards_publish_evidence_supports
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND EXISTS (
  SELECT 1 FROM recall_card_evidence WHERE card_id = NEW.id AND (
    json_valid(supports_json) = 0 OR json_type(supports_json) <> 'array'
    OR json_array_length(supports_json) < 1
  )
)
BEGIN
  SELECT RAISE(ABORT, 'recall card evidence requires supported fields');
END;

CREATE TRIGGER recall_cards_publish_no_unreviewed_targets
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND EXISTS (
  SELECT 1 FROM recall_card_curriculum_targets WHERE card_id = NEW.id AND reviewed = 0
)
BEGIN
  SELECT RAISE(ABORT, 'recall card cannot publish unreviewed curriculum targets');
END;

CREATE TRIGGER recall_cards_publish_primary_target
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  SELECT COUNT(*) FROM recall_card_curriculum_targets
  WHERE card_id = NEW.id AND is_primary = 1 AND reviewed = 1
) <> 1
BEGIN
  SELECT RAISE(ABORT, 'recall card requires one reviewed primary target');
END;

CREATE TRIGGER recall_cards_publish_reverse_pair
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  (NULLIF(trim(NEW.reverse_front), '') IS NULL) <>
  (NULLIF(trim(NEW.reverse_back), '') IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'recall card reverse fields must be a complete pair');
END;

CREATE TRIGGER recall_cards_publish_reviewed_target
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  SELECT COUNT(*) FROM recall_card_curriculum_targets WHERE card_id = NEW.id AND reviewed = 1
) < 1
BEGIN
  SELECT RAISE(ABORT, 'recall card requires a reviewed curriculum target');
END;

CREATE TRIGGER recall_cards_publish_teaching_fields
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  length(trim(NEW.front)) = 0 OR length(trim(NEW.back)) = 0
  OR length(trim(NEW.visual_cue)) = 0 OR length(trim(NEW.explanation)) = 0
)
BEGIN
  SELECT RAISE(ABORT, 'recall card teaching fields are incomplete');
END;

CREATE TRIGGER recall_cards_publish_unique_choice_text
BEFORE UPDATE OF status ON recall_cards
WHEN NEW.status = 'published' AND (
  SELECT COUNT(DISTINCT lower(trim(text))) FROM recall_card_choices WHERE card_id = NEW.id
) <> 4
BEGIN
  SELECT RAISE(ABORT, 'recall card choice text must be unique');
END;
