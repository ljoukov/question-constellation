PRAGMA foreign_keys = ON;

-- Generic, release-scoped GCSE study cards. This catalog deliberately does
-- not alias or copy the older AQA-science recall tables: accepted artifacts
-- are imported draft-first into a clean contract and become visible only when
-- their release passes every card, source, target and coverage guard below.

CREATE TABLE study_card_releases (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'standard-study-deck-v1'),
  prompt_version TEXT NOT NULL CHECK (
    prompt_version = trim(prompt_version) AND length(prompt_version) BETWEEN 1 AND 120
  ),
  generator_model TEXT NOT NULL CHECK (
    generator_model = trim(generator_model) AND length(generator_model) BETWEEN 1 AND 120
  ),
  generator_thinking_level TEXT NOT NULL CHECK (
    generator_thinking_level = trim(generator_thinking_level)
    AND length(generator_thinking_level) BETWEEN 1 AND 40
  ),
  generator_run_id TEXT NOT NULL CHECK (
    generator_run_id = trim(generator_run_id) AND length(generator_run_id) BETWEEN 1 AND 160
  ),
  reviewer_model TEXT NOT NULL CHECK (
    reviewer_model = trim(reviewer_model) AND length(reviewer_model) BETWEEN 1 AND 120
  ),
  reviewer_thinking_level TEXT NOT NULL CHECK (
    reviewer_thinking_level = trim(reviewer_thinking_level)
    AND length(reviewer_thinking_level) BETWEEN 1 AND 40
  ),
  reviewer_run_id TEXT NOT NULL CHECK (
    reviewer_run_id = trim(reviewer_run_id) AND length(reviewer_run_id) BETWEEN 1 AND 160
  ),
  reviewer_independent_turn INTEGER NOT NULL CHECK (reviewer_independent_turn = 1),
  source_manifest_hash TEXT NOT NULL CHECK (
    length(source_manifest_hash) = 64
    AND source_manifest_hash = lower(source_manifest_hash)
    AND source_manifest_hash NOT GLOB '*[^0-9a-f]*'
  ),
  artifact_hash TEXT NOT NULL CHECK (
    length(artifact_hash) = 64
    AND artifact_hash = lower(artifact_hash)
    AND artifact_hash NOT GLOB '*[^0-9a-f]*'
  ),
  artifact_path TEXT NOT NULL CHECK (
    artifact_path = 'data/study-cards/releases/' || id || '/accepted-study-cards.json'
  ),
  expected_card_count INTEGER NOT NULL CHECK (expected_card_count >= 0),
  expected_coverage_count INTEGER NOT NULL CHECK (expected_coverage_count >= 1),
  release_json TEXT NOT NULL CHECK (
    json_valid(release_json) = 1 AND json_type(release_json) = 'object'
  ),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'imported', 'rejected')),
  import_owner TEXT NOT NULL CHECK (import_owner = 'study-card-import/v1'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_cards (
  id TEXT PRIMARY KEY,
  release_id TEXT NOT NULL REFERENCES study_card_releases(id) ON DELETE RESTRICT,
  concept_key TEXT NOT NULL CHECK (
    concept_key = trim(concept_key) AND length(concept_key) BETWEEN 1 AND 100
  ),
  board TEXT NOT NULL CHECK (board IN ('AQA', 'OCR')),
  qualification TEXT NOT NULL CHECK (qualification = 'GCSE'),
  subject TEXT NOT NULL CHECK (
    subject IN (
      'Biology', 'Chemistry', 'Physics', 'Computer Science',
      'Geography', 'History', 'English Language', 'English Literature'
    )
  ),
  kind TEXT NOT NULL CHECK (
    kind IN (
      'definition', 'formula', 'process', 'test-result', 'unit', 'practical',
      'fact', 'comparison', 'case-study', 'chronology', 'cause-consequence',
      'interpretation', 'technique', 'structure', 'method', 'plot', 'quotation',
      'character', 'theme', 'context'
    )
  ),
  emoji TEXT NOT NULL CHECK (
    emoji = trim(emoji) AND length(emoji) BETWEEN 1 AND 16
  ),
  front TEXT NOT NULL CHECK (
    front = trim(front) AND length(front) BETWEEN 8 AND 240
  ),
  back TEXT NOT NULL CHECK (
    back = trim(back) AND length(back) BETWEEN 1 AND 700
  ),
  reverse_front TEXT CHECK (
    reverse_front IS NULL OR (
      reverse_front = trim(reverse_front) AND length(reverse_front) BETWEEN 4 AND 240
    )
  ),
  reverse_back TEXT CHECK (
    reverse_back IS NULL OR (
      reverse_back = trim(reverse_back) AND length(reverse_back) BETWEEN 1 AND 700
    )
  ),
  explanation TEXT NOT NULL CHECK (
    explanation = trim(explanation) AND length(explanation) BETWEEN 12 AND 1200
  ),
  memory_tip TEXT CHECK (
    memory_tip IS NULL OR (
      memory_tip = trim(memory_tip) AND length(memory_tip) BETWEEN 8 AND 240
    )
  ),
  content_revision INTEGER NOT NULL CHECK (content_revision >= 1),
  content_hash TEXT NOT NULL CHECK (
    length(content_hash) = 64
    AND content_hash = lower(content_hash)
    AND content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  source_fingerprint TEXT NOT NULL CHECK (
    length(source_fingerprint) = 64
    AND source_fingerprint = lower(source_fingerprint)
    AND source_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  provenance_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(provenance_json) = 1 AND json_type(provenance_json) = 'object'
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  needs_human_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_human_review IN (0, 1)),
  import_owner TEXT NOT NULL CHECK (import_owner = 'study-card-import/v1'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (release_id, board, subject, concept_key),
  CHECK (
    (board = 'AQA' AND subject IN (
      'Biology', 'Chemistry', 'Physics', 'Computer Science', 'Geography', 'History'
    ))
    OR (board = 'OCR' AND subject IN ('English Language', 'English Literature'))
  ),
  CHECK (
    (reverse_front IS NULL AND reverse_back IS NULL)
    OR (reverse_front IS NOT NULL AND reverse_back IS NOT NULL)
  )
);

CREATE TABLE study_card_choices (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES study_cards(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 0 AND 3),
  choice_key TEXT NOT NULL CHECK (
    choice_key = trim(choice_key) AND length(choice_key) BETWEEN 1 AND 80
  ),
  text TEXT NOT NULL CHECK (
    text = trim(text) AND length(text) BETWEEN 1 AND 700
  ),
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  feedback TEXT NOT NULL CHECK (
    feedback = trim(feedback) AND length(feedback) BETWEEN 4 AND 700
  ),
  misconception TEXT CHECK (
    misconception IS NULL OR (
      misconception = trim(misconception) AND length(misconception) BETWEEN 4 AND 500
    )
  ),
  import_owner TEXT NOT NULL CHECK (import_owner = 'study-card-import/v1'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (card_id, display_order),
  UNIQUE (card_id, choice_key),
  UNIQUE (card_id, text)
);

CREATE TABLE study_card_sources (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES study_cards(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (
    source_kind IN (
      'curriculum-specification', 'question-paper', 'mark-scheme',
      'examiner-report', 'supporting-document', 'official-web-page',
      'primary-text', 'secondary-source', 'original-synthesis'
    )
  ),
  source_url TEXT NOT NULL CHECK (
    source_url = trim(source_url)
    AND source_url GLOB 'https://*'
    AND length(source_url) BETWEEN 9 AND 1000
  ),
  source_title TEXT NOT NULL CHECK (
    source_title = trim(source_title) AND length(source_title) BETWEEN 1 AND 500
  ),
  source_locator TEXT NOT NULL CHECK (
    source_locator = trim(source_locator) AND length(source_locator) BETWEEN 1 AND 300
  ),
  source_excerpt TEXT NOT NULL CHECK (
    source_excerpt = trim(source_excerpt) AND length(source_excerpt) BETWEEN 1 AND 2000
  ),
  source_hash TEXT NOT NULL CHECK (
    length(source_hash) = 64
    AND source_hash = lower(source_hash)
    AND source_hash NOT GLOB '*[^0-9a-f]*'
  ),
  rights_basis TEXT NOT NULL CHECK (
    rights_basis = trim(rights_basis) AND length(rights_basis) BETWEEN 4 AND 240
  ),
  supports_json TEXT NOT NULL CHECK (
    json_valid(supports_json) = 1
    AND json_type(supports_json) = 'array'
    AND json_array_length(supports_json) >= 1
  ),
  import_owner TEXT NOT NULL CHECK (import_owner = 'study-card-import/v1'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE study_card_targets (
  card_id TEXT NOT NULL REFERENCES study_cards(id) ON DELETE CASCADE,
  offering_id TEXT NOT NULL REFERENCES curriculum_offerings(id) ON DELETE RESTRICT,
  curriculum_component_id TEXT NOT NULL
    REFERENCES curriculum_components(id) ON DELETE RESTRICT,
  topic_component_id TEXT NOT NULL
    REFERENCES curriculum_components(id) ON DELETE RESTRICT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reviewed INTEGER NOT NULL CHECK (reviewed IN (0, 1)),
  mapping_source TEXT NOT NULL CHECK (
    mapping_source = trim(mapping_source) AND length(mapping_source) BETWEEN 1 AND 120
  ),
  import_owner TEXT NOT NULL CHECK (import_owner = 'study-card-import/v1'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (card_id, offering_id, curriculum_component_id)
);

CREATE TABLE study_deck_coverage (
  release_id TEXT NOT NULL REFERENCES study_card_releases(id) ON DELETE RESTRICT,
  offering_id TEXT NOT NULL REFERENCES curriculum_offerings(id) ON DELETE RESTRICT,
  topic_component_id TEXT NOT NULL
    REFERENCES curriculum_components(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('ready', 'withheld')),
  reason TEXT CHECK (
    reason IS NULL OR (reason = trim(reason) AND length(reason) BETWEEN 4 AND 500)
  ),
  card_count INTEGER NOT NULL CHECK (card_count >= 0),
  reviewed INTEGER NOT NULL CHECK (reviewed IN (0, 1)),
  import_owner TEXT NOT NULL CHECK (import_owner = 'study-card-import/v1'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (release_id, offering_id, topic_component_id),
  CHECK (
    (status = 'ready' AND reason IS NULL AND card_count > 0)
    OR (status = 'withheld' AND reason IS NOT NULL AND card_count = 0)
  )
);

CREATE INDEX idx_study_card_releases_runtime
  ON study_card_releases (status, schema_version, id);

CREATE INDEX idx_study_cards_runtime
  ON study_cards (release_id, board, subject, status, needs_human_review, kind, id);

CREATE INDEX idx_study_card_choices_card
  ON study_card_choices (card_id, display_order);

CREATE INDEX idx_study_card_sources_card
  ON study_card_sources (card_id, source_kind, id);

CREATE INDEX idx_study_card_targets_offering_topic
  ON study_card_targets (offering_id, topic_component_id, reviewed, card_id);

CREATE UNIQUE INDEX idx_study_card_targets_one_primary
  ON study_card_targets (card_id)
  WHERE is_primary = 1;

CREATE UNIQUE INDEX idx_study_card_targets_one_topic_mapping
  ON study_card_targets (card_id, offering_id, topic_component_id);

CREATE INDEX idx_study_deck_coverage_runtime
  ON study_deck_coverage (release_id, offering_id, status, topic_component_id);

-- Releases and cards must enter in their pre-publication states so child-row
-- and coverage checks cannot be bypassed by a direct INSERT.

CREATE TRIGGER study_card_releases_insert_as_accepted
BEFORE INSERT ON study_card_releases
WHEN NEW.status <> 'accepted'
BEGIN
  SELECT RAISE(ABORT, 'study-card releases must be inserted as accepted');
END;

CREATE TRIGGER study_cards_insert_as_draft
BEFORE INSERT ON study_cards
WHEN NEW.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'study cards must be inserted as drafts');
END;

CREATE TRIGGER study_card_releases_metadata_immutable
BEFORE UPDATE ON study_card_releases
WHEN NEW.id <> OLD.id
  OR NEW.schema_version <> OLD.schema_version
  OR NEW.prompt_version <> OLD.prompt_version
  OR NEW.generator_model <> OLD.generator_model
  OR NEW.generator_thinking_level <> OLD.generator_thinking_level
  OR NEW.generator_run_id <> OLD.generator_run_id
  OR NEW.reviewer_model <> OLD.reviewer_model
  OR NEW.reviewer_thinking_level <> OLD.reviewer_thinking_level
  OR NEW.reviewer_run_id <> OLD.reviewer_run_id
  OR NEW.reviewer_independent_turn <> OLD.reviewer_independent_turn
  OR NEW.source_manifest_hash <> OLD.source_manifest_hash
  OR NEW.artifact_hash <> OLD.artifact_hash
  OR NEW.artifact_path <> OLD.artifact_path
  OR NEW.expected_card_count <> OLD.expected_card_count
  OR NEW.expected_coverage_count <> OLD.expected_coverage_count
  OR NEW.release_json <> OLD.release_json
  OR NEW.started_at <> OLD.started_at
  OR NEW.finished_at <> OLD.finished_at
  OR NEW.import_owner <> OLD.import_owner
  OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'study-card release provenance is immutable');
END;

CREATE TRIGGER study_card_releases_status_transition
BEFORE UPDATE OF status ON study_card_releases
WHEN NEW.status <> OLD.status AND NOT (
  OLD.status = 'accepted' AND NEW.status IN ('imported', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid study-card release status transition');
END;

CREATE TRIGGER study_card_releases_import_expected_counts
BEFORE UPDATE OF status ON study_card_releases
WHEN NEW.status = 'imported' AND (
  (SELECT COUNT(*) FROM study_cards WHERE release_id = NEW.id) <> NEW.expected_card_count
  OR (SELECT COUNT(*) FROM study_deck_coverage WHERE release_id = NEW.id)
     <> NEW.expected_coverage_count
)
BEGIN
  SELECT RAISE(ABORT, 'study-card release counts do not match its accepted artifact');
END;

CREATE TRIGGER study_card_releases_import_published_cards
BEFORE UPDATE OF status ON study_card_releases
WHEN NEW.status = 'imported' AND EXISTS (
  SELECT 1 FROM study_cards
  WHERE release_id = NEW.id AND (status <> 'published' OR needs_human_review <> 0)
)
BEGIN
  SELECT RAISE(ABORT, 'study-card release contains unpublished or unreviewed cards');
END;

CREATE TRIGGER study_card_releases_import_coverage_reviewed
BEFORE UPDATE OF status ON study_card_releases
WHEN NEW.status = 'imported' AND EXISTS (
  SELECT 1 FROM study_deck_coverage
  WHERE release_id = NEW.id AND reviewed <> 1
)
BEGIN
  SELECT RAISE(ABORT, 'study-card release coverage must be reviewed');
END;

CREATE TRIGGER study_card_releases_import_coverage_counts
BEFORE UPDATE OF status ON study_card_releases
WHEN NEW.status = 'imported' AND EXISTS (
  SELECT 1
  FROM study_deck_coverage coverage
  WHERE coverage.release_id = NEW.id
    AND coverage.card_count <> (
      SELECT COUNT(DISTINCT target.card_id)
      FROM study_card_targets target
      JOIN study_cards card ON card.id = target.card_id
      WHERE card.release_id = NEW.id
        AND card.status = 'published'
        AND target.offering_id = coverage.offering_id
        AND target.topic_component_id = coverage.topic_component_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'study-card coverage count differs from published targets');
END;

CREATE TRIGGER study_card_releases_import_coverage_curriculum
BEFORE UPDATE OF status ON study_card_releases
WHEN NEW.status = 'imported' AND EXISTS (
  SELECT 1
  FROM study_deck_coverage coverage
  LEFT JOIN curriculum_offerings offering ON offering.id = coverage.offering_id
  LEFT JOIN curriculum_components topic ON topic.id = coverage.topic_component_id
  WHERE coverage.release_id = NEW.id AND (
    offering.id IS NULL OR offering.enabled <> 1
    OR topic.id IS NULL OR topic.selectable <> 1
    OR topic.specification_id <> offering.specification_id
    OR json_valid(offering.selectable_component_ids_json) = 0
    OR NOT EXISTS (
      SELECT 1 FROM json_each(offering.selectable_component_ids_json)
      WHERE value = coverage.topic_component_id
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'study-card coverage target is not selectable for its offering');
END;

-- Publication checks for an individual card.

CREATE TRIGGER study_cards_publish_release
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1 FROM study_card_releases release
  WHERE release.id = NEW.release_id
    AND release.status = 'accepted'
    AND release.source_manifest_hash = NEW.source_fingerprint
    AND release.import_owner = NEW.import_owner
)
BEGIN
  SELECT RAISE(ABORT, 'study card must belong to its accepted release provenance');
END;

CREATE TRIGGER study_cards_publish_review
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND NEW.needs_human_review <> 0
BEGIN
  SELECT RAISE(ABORT, 'study card still needs human review');
END;

CREATE TRIGGER study_cards_publish_choice_count
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND NOT (
  (SELECT COUNT(*) FROM study_card_choices WHERE card_id = NEW.id) BETWEEN 3 AND 4
)
BEGIN
  SELECT RAISE(ABORT, 'study card requires three or four choices');
END;

CREATE TRIGGER study_cards_publish_choice_order
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND (
  (SELECT MIN(display_order) FROM study_card_choices WHERE card_id = NEW.id) <> 0
  OR (SELECT MAX(display_order) FROM study_card_choices WHERE card_id = NEW.id)
     <> (SELECT COUNT(*) - 1 FROM study_card_choices WHERE card_id = NEW.id)
)
BEGIN
  SELECT RAISE(ABORT, 'study card choices must occupy consecutive display orders from zero');
END;

CREATE TRIGGER study_cards_publish_correct_choice
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND (
  (SELECT COUNT(*) FROM study_card_choices
   WHERE card_id = NEW.id AND is_correct = 1) <> 1
  OR
  (SELECT COUNT(*) FROM study_card_choices
   WHERE card_id = NEW.id AND is_correct = 1 AND trim(text) = trim(NEW.back)) <> 1
)
BEGIN
  SELECT RAISE(ABORT, 'study card requires one canonical correct choice');
END;

CREATE TRIGGER study_cards_publish_choice_quality
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND (
  (SELECT COUNT(DISTINCT lower(trim(text))) FROM study_card_choices WHERE card_id = NEW.id)
    <> (SELECT COUNT(*) FROM study_card_choices WHERE card_id = NEW.id)
  OR EXISTS (
    SELECT 1 FROM study_card_choices
    WHERE card_id = NEW.id AND (
      (is_correct = 1 AND misconception IS NOT NULL)
      OR (is_correct = 0 AND misconception IS NULL)
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'study card choices require unique text and diagnostic misconceptions');
END;

CREATE TRIGGER study_cards_publish_sources
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND (
  (SELECT COUNT(*) FROM study_card_sources WHERE card_id = NEW.id) < 1
  OR NOT EXISTS (
    SELECT 1 FROM study_card_sources source, json_each(source.supports_json)
    WHERE source.card_id = NEW.id AND value = 'front'
  )
  OR NOT EXISTS (
    SELECT 1 FROM study_card_sources source, json_each(source.supports_json)
    WHERE source.card_id = NEW.id AND value = 'back'
  )
  OR NOT EXISTS (
    SELECT 1 FROM study_card_sources source, json_each(source.supports_json)
    WHERE source.card_id = NEW.id AND value = 'explanation'
  )
  OR (
    NEW.memory_tip IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM study_card_sources source, json_each(source.supports_json)
      WHERE source.card_id = NEW.id AND value = 'memoryTip'
    )
  )
  OR (
    NEW.reverse_front IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM study_card_sources source, json_each(source.supports_json)
      WHERE source.card_id = NEW.id AND value = 'reverse'
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'study card sources do not support every teaching claim');
END;

CREATE TRIGGER study_cards_publish_targets
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND (
  (SELECT COUNT(*) FROM study_card_targets WHERE card_id = NEW.id AND reviewed = 1) < 1
  OR (SELECT COUNT(*) FROM study_card_targets
      WHERE card_id = NEW.id AND reviewed = 1 AND is_primary = 1) <> 1
  OR EXISTS (SELECT 1 FROM study_card_targets WHERE card_id = NEW.id AND reviewed <> 1)
)
BEGIN
  SELECT RAISE(ABORT, 'study card requires reviewed targets and one primary target');
END;

CREATE TRIGGER study_cards_publish_target_curriculum
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND EXISTS (
  SELECT 1
  FROM study_card_targets target
  LEFT JOIN curriculum_offerings offering ON offering.id = target.offering_id
  LEFT JOIN curriculum_components component ON component.id = target.curriculum_component_id
  LEFT JOIN curriculum_components topic ON topic.id = target.topic_component_id
  WHERE target.card_id = NEW.id AND (
    offering.id IS NULL OR offering.enabled <> 1
    OR offering.board <> NEW.board
    OR offering.qualification <> NEW.qualification
    OR offering.profile_subject <> NEW.subject
    OR component.id IS NULL OR component.specification_id <> offering.specification_id
    OR topic.id IS NULL OR topic.specification_id <> offering.specification_id
    OR topic.selectable <> 1
    OR json_valid(offering.selectable_component_ids_json) = 0
    OR NOT EXISTS (
      SELECT 1 FROM json_each(offering.selectable_component_ids_json)
      WHERE value = target.topic_component_id
    )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'study card target is not selectable for its board, subject and offering');
END;

CREATE TRIGGER study_cards_publish_target_coverage
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status = 'published' AND EXISTS (
  SELECT 1
  FROM study_card_targets target
  WHERE target.card_id = NEW.id AND NOT EXISTS (
    SELECT 1 FROM study_deck_coverage coverage
    WHERE coverage.release_id = NEW.release_id
      AND coverage.offering_id = target.offering_id
      AND coverage.topic_component_id = target.topic_component_id
      AND coverage.status = 'ready'
      AND coverage.reviewed = 1
  )
)
BEGIN
  SELECT RAISE(ABORT, 'study card target lacks reviewed ready coverage');
END;

CREATE TRIGGER study_cards_status_transition
BEFORE UPDATE OF status ON study_cards
WHEN NEW.status <> OLD.status AND NOT (
  (OLD.status = 'draft' AND NEW.status = 'published')
  OR (OLD.status = 'published' AND NEW.status = 'retired')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid study-card status transition');
END;

CREATE TRIGGER study_cards_published_content_immutable
BEFORE UPDATE ON study_cards
WHEN OLD.status = 'published' AND (
  NEW.id <> OLD.id
  OR NEW.release_id <> OLD.release_id
  OR NEW.concept_key <> OLD.concept_key
  OR NEW.board <> OLD.board
  OR NEW.qualification <> OLD.qualification
  OR NEW.subject <> OLD.subject
  OR NEW.kind <> OLD.kind
  OR NEW.emoji <> OLD.emoji
  OR NEW.front <> OLD.front
  OR NEW.back <> OLD.back
  OR COALESCE(NEW.reverse_front, '') <> COALESCE(OLD.reverse_front, '')
  OR COALESCE(NEW.reverse_back, '') <> COALESCE(OLD.reverse_back, '')
  OR NEW.explanation <> OLD.explanation
  OR COALESCE(NEW.memory_tip, '') <> COALESCE(OLD.memory_tip, '')
  OR NEW.content_revision <> OLD.content_revision
  OR NEW.content_hash <> OLD.content_hash
  OR NEW.source_fingerprint <> OLD.source_fingerprint
  OR NEW.provenance_json <> OLD.provenance_json
  OR NEW.needs_human_review <> OLD.needs_human_review
  OR NEW.import_owner <> OLD.import_owner
  OR NEW.created_at <> OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'published study-card content is immutable; use a new release');
END;

CREATE TRIGGER study_cards_published_delete
BEFORE DELETE ON study_cards
WHEN OLD.status IN ('published', 'retired')
BEGIN
  SELECT RAISE(ABORT, 'published study cards cannot be deleted');
END;

-- Child content is immutable once its parent is published. A changed card must
-- receive a new release and new card identity rather than in-place rewriting.

CREATE TRIGGER study_card_choices_published_parent_insert
BEFORE INSERT ON study_card_choices
WHEN EXISTS (SELECT 1 FROM study_cards WHERE id = NEW.card_id AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'published study-card choices are immutable');
END;

CREATE TRIGGER study_card_choices_published_parent_update
BEFORE UPDATE ON study_card_choices
WHEN EXISTS (SELECT 1 FROM study_cards WHERE id IN (OLD.card_id, NEW.card_id) AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'published study-card choices are immutable');
END;

CREATE TRIGGER study_card_choices_published_parent_delete
BEFORE DELETE ON study_card_choices
WHEN EXISTS (SELECT 1 FROM study_cards WHERE id = OLD.card_id AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'published study-card choices are immutable');
END;

CREATE TRIGGER study_card_sources_published_parent_insert
BEFORE INSERT ON study_card_sources
WHEN EXISTS (SELECT 1 FROM study_cards WHERE id = NEW.card_id AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'published study-card sources are immutable');
END;

CREATE TRIGGER study_card_sources_published_parent_update
BEFORE UPDATE ON study_card_sources
WHEN EXISTS (SELECT 1 FROM study_cards WHERE id IN (OLD.card_id, NEW.card_id) AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'published study-card sources are immutable');
END;

CREATE TRIGGER study_card_sources_published_parent_delete
BEFORE DELETE ON study_card_sources
WHEN EXISTS (SELECT 1 FROM study_cards WHERE id = OLD.card_id AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'published study-card sources are immutable');
END;

CREATE TRIGGER study_card_targets_published_parent_insert
BEFORE INSERT ON study_card_targets
WHEN EXISTS (SELECT 1 FROM study_cards WHERE id = NEW.card_id AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'published study-card targets are immutable');
END;

CREATE TRIGGER study_card_targets_published_parent_update
BEFORE UPDATE ON study_card_targets
WHEN EXISTS (SELECT 1 FROM study_cards WHERE id IN (OLD.card_id, NEW.card_id) AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'published study-card targets are immutable');
END;

CREATE TRIGGER study_card_targets_published_parent_delete
BEFORE DELETE ON study_card_targets
WHEN EXISTS (SELECT 1 FROM study_cards WHERE id = OLD.card_id AND status <> 'draft')
BEGIN
  SELECT RAISE(ABORT, 'published study-card targets are immutable');
END;

CREATE TRIGGER study_deck_coverage_imported_release_insert
BEFORE INSERT ON study_deck_coverage
WHEN EXISTS (SELECT 1 FROM study_card_releases WHERE id = NEW.release_id AND status <> 'accepted')
BEGIN
  SELECT RAISE(ABORT, 'imported study-card coverage is immutable');
END;

CREATE TRIGGER study_deck_coverage_imported_release_update
BEFORE UPDATE ON study_deck_coverage
WHEN EXISTS (
  SELECT 1 FROM study_card_releases
  WHERE id IN (OLD.release_id, NEW.release_id) AND status <> 'accepted'
)
BEGIN
  SELECT RAISE(ABORT, 'imported study-card coverage is immutable');
END;

CREATE TRIGGER study_deck_coverage_imported_release_delete
BEFORE DELETE ON study_deck_coverage
WHEN EXISTS (SELECT 1 FROM study_card_releases WHERE id = OLD.release_id AND status <> 'accepted')
BEGIN
  SELECT RAISE(ABORT, 'imported study-card coverage is immutable');
END;

CREATE TRIGGER study_card_releases_terminal_delete
BEFORE DELETE ON study_card_releases
WHEN OLD.status IN ('imported', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'terminal study-card releases cannot be deleted');
END;
