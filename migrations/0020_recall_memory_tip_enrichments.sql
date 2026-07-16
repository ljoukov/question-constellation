-- Reviewed memory-tip overlays for immutable, already-published recall cards.
--
-- The base recall-card row remains immutable. An enrichment records the exact
-- generation run, revision and hash it reviewed, plus the effective revision
-- and hash learners should use when (and only when) that base identity still
-- matches. Runs and enrichment content are append-only; publication/retirement
-- are explicit state transitions.

CREATE TABLE recall_memory_tip_enrichment_runs (
  id TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  generator_model TEXT NOT NULL,
  generator_thinking_level TEXT NOT NULL,
  reviewer_model TEXT NOT NULL,
  reviewer_thinking_level TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL CHECK (
    length(source_fingerprint) = 64
    AND source_fingerprint = lower(source_fingerprint)
    AND source_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  artifact_hash TEXT NOT NULL CHECK (
    length(artifact_hash) = 64
    AND artifact_hash = lower(artifact_hash)
    AND artifact_hash NOT GLOB '*[^0-9a-f]*'
  ),
  artifact_path TEXT NOT NULL CHECK (
    artifact_path =
      'data/recall/enrichments/' || id || '/accepted-enrichments.json'
  ),
  run_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(run_json) = 1 AND json_type(run_json) = 'object'
  ),
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'imported', 'rejected')),
  import_owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE recall_card_memory_tip_enrichments (
  id TEXT PRIMARY KEY,
  enrichment_run_id TEXT NOT NULL
    REFERENCES recall_memory_tip_enrichment_runs(id) ON DELETE RESTRICT,
  card_id TEXT NOT NULL REFERENCES recall_cards(id) ON DELETE RESTRICT,
  base_generation_run_id TEXT NOT NULL
    REFERENCES recall_generation_runs(id) ON DELETE RESTRICT,
  base_content_revision INTEGER NOT NULL CHECK (base_content_revision >= 1),
  base_content_hash TEXT NOT NULL CHECK (
    length(base_content_hash) = 64
    AND base_content_hash = lower(base_content_hash)
    AND base_content_hash NOT GLOB '*[^0-9a-f]*'
  ),
  base_source_fingerprint TEXT NOT NULL CHECK (
    length(base_source_fingerprint) = 64
    AND base_source_fingerprint = lower(base_source_fingerprint)
    AND base_source_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  base_artifact_hash TEXT NOT NULL CHECK (
    length(base_artifact_hash) = 64
    AND base_artifact_hash = lower(base_artifact_hash)
    AND base_artifact_hash NOT GLOB '*[^0-9a-f]*'
  ),
  base_artifact_path TEXT NOT NULL CHECK (
    base_artifact_path =
      'data/recall/generated/' || base_generation_run_id || '/accepted-cards.json'
  ),
  base_provenance_hash TEXT NOT NULL CHECK (
    length(base_provenance_hash) = 64
    AND base_provenance_hash = lower(base_provenance_hash)
    AND base_provenance_hash NOT GLOB '*[^0-9a-f]*'
  ),
  memory_tip TEXT NOT NULL CHECK (
    memory_tip = trim(memory_tip)
    AND length(memory_tip) BETWEEN 8 AND 180
    AND instr(memory_tip, char(0)) = 0
    AND memory_tip NOT GLOB ('*[' || char(1) || '-' || char(31) || char(127) || ']*')
  ),
  effective_content_revision INTEGER NOT NULL CHECK (
    effective_content_revision = base_content_revision + 1
  ),
  effective_hash_version TEXT NOT NULL CHECK (
    effective_hash_version = 'recall-memory-tip-effective-content-v1'
  ),
  effective_content_hash TEXT NOT NULL CHECK (
    length(effective_content_hash) = 64
    AND effective_content_hash = lower(effective_content_hash)
    AND effective_content_hash NOT GLOB '*[^0-9a-f]*'
    AND effective_content_hash <> base_content_hash
  ),
  provenance_json TEXT NOT NULL DEFAULT '{}' CHECK (
    json_valid(provenance_json) = 1 AND json_type(provenance_json) = 'object'
  ),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  needs_human_review INTEGER NOT NULL DEFAULT 0 CHECK (needs_human_review IN (0, 1)),
  import_owner TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (enrichment_run_id, card_id)
);

CREATE INDEX idx_recall_memory_tip_enrichment_runs_status
  ON recall_memory_tip_enrichment_runs (status, schema_version, prompt_version, id);

CREATE INDEX idx_recall_memory_tip_enrichments_base
  ON recall_card_memory_tip_enrichments (
    card_id,
    base_generation_run_id,
    base_content_revision,
    base_content_hash,
    status,
    needs_human_review
  );

CREATE UNIQUE INDEX idx_recall_memory_tip_enrichments_one_published
  ON recall_card_memory_tip_enrichments (card_id)
  WHERE status = 'published';

CREATE TRIGGER recall_memory_tip_enrichment_runs_insert_as_accepted
BEFORE INSERT ON recall_memory_tip_enrichment_runs
WHEN NEW.status <> 'accepted'
BEGIN
  SELECT RAISE(ABORT, 'recall memory-tip enrichment runs must enter as accepted');
END;

CREATE TRIGGER recall_memory_tip_enrichment_runs_metadata_immutable
BEFORE UPDATE ON recall_memory_tip_enrichment_runs
WHEN NEW.id <> OLD.id
  OR NEW.schema_version <> OLD.schema_version
  OR NEW.prompt_version <> OLD.prompt_version
  OR NEW.generator_model <> OLD.generator_model
  OR NEW.generator_thinking_level <> OLD.generator_thinking_level
  OR NEW.reviewer_model <> OLD.reviewer_model
  OR NEW.reviewer_thinking_level <> OLD.reviewer_thinking_level
  OR NEW.source_fingerprint <> OLD.source_fingerprint
  OR NEW.artifact_hash <> OLD.artifact_hash
  OR NEW.artifact_path <> OLD.artifact_path
  OR NEW.run_json <> OLD.run_json
  OR NEW.started_at <> OLD.started_at
  OR NEW.finished_at <> OLD.finished_at
  OR NEW.import_owner <> OLD.import_owner
  OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'recall memory-tip enrichment run provenance is immutable');
END;

CREATE TRIGGER recall_memory_tip_enrichment_runs_status_transition
BEFORE UPDATE OF status ON recall_memory_tip_enrichment_runs
WHEN NEW.status <> OLD.status AND NOT (
  OLD.status = 'accepted' AND NEW.status IN ('imported', 'rejected')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid recall memory-tip enrichment run status transition');
END;

CREATE TRIGGER recall_memory_tip_enrichment_runs_import_requires_published_rows
BEFORE UPDATE OF status ON recall_memory_tip_enrichment_runs
WHEN NEW.status = 'imported' AND OLD.status <> 'imported' AND (
  NEW.schema_version <> 'recall-memory-tip-enrichment-v1'
  OR NEW.prompt_version <> 'recall-memory-tip-enricher-v1'
  OR NEW.import_owner <> 'recall-memory-tip-enrichment-import/v1'
  OR NEW.artifact_path <>
    'data/recall/enrichments/' || NEW.id || '/accepted-enrichments.json'
  OR COALESCE(json_type(NEW.run_json, '$.enrichmentCount'), '') <> 'integer'
  OR COALESCE(json_extract(NEW.run_json, '$.enrichmentCount'), 0) < 1
  OR
  (SELECT COUNT(*)
   FROM recall_card_memory_tip_enrichments
   WHERE enrichment_run_id = OLD.id) <>
    json_extract(NEW.run_json, '$.enrichmentCount')
  OR EXISTS (
    SELECT 1
    FROM recall_card_memory_tip_enrichments
    WHERE enrichment_run_id = OLD.id
      AND (status <> 'published' OR needs_human_review <> 0)
  )
  OR EXISTS (
    SELECT 1
    FROM recall_card_memory_tip_enrichments enrichment
    WHERE enrichment.enrichment_run_id = OLD.id
      AND NOT EXISTS (
        SELECT 1
        FROM recall_cards card
        JOIN recall_generation_runs base_run
          ON base_run.id = card.generation_run_id
        WHERE card.id = enrichment.card_id
          AND card.status = 'published'
          AND card.needs_human_review = 0
          AND card.import_owner = 'recall-card-import/v1'
          AND NULLIF(trim(card.memory_tip), '') IS NULL
          AND card.generation_run_id = enrichment.base_generation_run_id
          AND card.content_revision = enrichment.base_content_revision
          AND card.content_hash = enrichment.base_content_hash
          AND card.source_fingerprint = enrichment.base_source_fingerprint
          AND base_run.status = 'imported'
          AND base_run.import_owner = 'recall-card-import/v1'
          AND base_run.source_fingerprint = enrichment.base_source_fingerprint
          AND base_run.artifact_hash = enrichment.base_artifact_hash
          AND base_run.artifact_path = enrichment.base_artifact_path
          AND card.source_fingerprint = base_run.source_fingerprint
      )
  )
)
BEGIN
  SELECT RAISE(ABORT, 'imported memory-tip enrichment run requires reviewed published rows');
END;

CREATE TRIGGER recall_memory_tip_enrichment_runs_delete_immutable
BEFORE DELETE ON recall_memory_tip_enrichment_runs
BEGIN
  SELECT RAISE(ABORT, 'recall memory-tip enrichment runs are immutable');
END;

CREATE TRIGGER recall_memory_tip_enrichments_insert_as_draft
BEFORE INSERT ON recall_card_memory_tip_enrichments
WHEN NEW.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'recall memory-tip enrichments must be inserted as drafts');
END;

CREATE TRIGGER recall_memory_tip_enrichments_insert_base_guard
BEFORE INSERT ON recall_card_memory_tip_enrichments
WHEN NOT EXISTS (
  SELECT 1
  FROM recall_cards card
  JOIN recall_generation_runs base_run
    ON base_run.id = card.generation_run_id
  WHERE card.id = NEW.card_id
    AND card.status = 'published'
    AND card.needs_human_review = 0
    AND card.import_owner = 'recall-card-import/v1'
    AND NULLIF(trim(card.memory_tip), '') IS NULL
    AND card.generation_run_id = NEW.base_generation_run_id
    AND card.content_revision = NEW.base_content_revision
    AND card.content_hash = NEW.base_content_hash
    AND card.source_fingerprint = NEW.base_source_fingerprint
    AND base_run.status = 'imported'
    AND base_run.import_owner = 'recall-card-import/v1'
    AND base_run.source_fingerprint = NEW.base_source_fingerprint
    AND base_run.artifact_hash = NEW.base_artifact_hash
    AND base_run.artifact_path = NEW.base_artifact_path
    AND card.source_fingerprint = base_run.source_fingerprint
    AND base_run.artifact_path =
      'data/recall/generated/' || base_run.id || '/accepted-cards.json'
)
BEGIN
  SELECT RAISE(ABORT, 'memory-tip enrichment base card identity is stale or ineligible');
END;

CREATE TRIGGER recall_memory_tip_enrichments_publish_base_guard
BEFORE UPDATE OF status ON recall_card_memory_tip_enrichments
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1
  FROM recall_cards card
  JOIN recall_generation_runs base_run
    ON base_run.id = card.generation_run_id
  WHERE card.id = NEW.card_id
    AND card.status = 'published'
    AND card.needs_human_review = 0
    AND card.import_owner = 'recall-card-import/v1'
    AND NULLIF(trim(card.memory_tip), '') IS NULL
    AND card.generation_run_id = NEW.base_generation_run_id
    AND card.content_revision = NEW.base_content_revision
    AND card.content_hash = NEW.base_content_hash
    AND card.source_fingerprint = NEW.base_source_fingerprint
    AND base_run.status = 'imported'
    AND base_run.import_owner = 'recall-card-import/v1'
    AND base_run.source_fingerprint = NEW.base_source_fingerprint
    AND base_run.artifact_hash = NEW.base_artifact_hash
    AND base_run.artifact_path = NEW.base_artifact_path
    AND card.source_fingerprint = base_run.source_fingerprint
    AND base_run.artifact_path =
      'data/recall/generated/' || base_run.id || '/accepted-cards.json'
)
BEGIN
  SELECT RAISE(ABORT, 'memory-tip enrichment base card identity is stale or ineligible');
END;

CREATE TRIGGER recall_memory_tip_enrichments_publish_run_guard
BEFORE UPDATE OF status ON recall_card_memory_tip_enrichments
WHEN NEW.status = 'published' AND NOT EXISTS (
  SELECT 1
  FROM recall_memory_tip_enrichment_runs enrichment_run
  WHERE enrichment_run.id = NEW.enrichment_run_id
    AND enrichment_run.status IN ('accepted', 'imported')
    AND enrichment_run.schema_version = 'recall-memory-tip-enrichment-v1'
    AND enrichment_run.prompt_version = 'recall-memory-tip-enricher-v1'
    AND enrichment_run.import_owner = 'recall-memory-tip-enrichment-import/v1'
    AND NEW.import_owner = 'recall-memory-tip-enrichment-import/v1'
    AND enrichment_run.artifact_path =
      'data/recall/enrichments/' || enrichment_run.id || '/accepted-enrichments.json'
)
BEGIN
  SELECT RAISE(ABORT, 'memory-tip enrichment run is not an accepted import candidate');
END;

CREATE TRIGGER recall_memory_tip_enrichments_content_immutable
BEFORE UPDATE ON recall_card_memory_tip_enrichments
WHEN NEW.id <> OLD.id
  OR NEW.enrichment_run_id <> OLD.enrichment_run_id
  OR NEW.card_id <> OLD.card_id
  OR NEW.base_generation_run_id <> OLD.base_generation_run_id
  OR NEW.base_content_revision <> OLD.base_content_revision
  OR NEW.base_content_hash <> OLD.base_content_hash
  OR NEW.base_source_fingerprint <> OLD.base_source_fingerprint
  OR NEW.base_artifact_hash <> OLD.base_artifact_hash
  OR NEW.base_artifact_path <> OLD.base_artifact_path
  OR NEW.base_provenance_hash <> OLD.base_provenance_hash
  OR NEW.memory_tip <> OLD.memory_tip
  OR NEW.effective_content_revision <> OLD.effective_content_revision
  OR NEW.effective_hash_version <> OLD.effective_hash_version
  OR NEW.effective_content_hash <> OLD.effective_content_hash
  OR NEW.provenance_json <> OLD.provenance_json
  OR NEW.needs_human_review <> OLD.needs_human_review
  OR NEW.import_owner <> OLD.import_owner
  OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'recall memory-tip enrichment content is immutable');
END;

CREATE TRIGGER recall_memory_tip_enrichments_status_transition
BEFORE UPDATE OF status ON recall_card_memory_tip_enrichments
WHEN NEW.status <> OLD.status AND NOT (
  (OLD.status = 'draft' AND NEW.status = 'published')
  OR (OLD.status = 'published' AND NEW.status = 'retired')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid recall memory-tip enrichment status transition');
END;

CREATE TRIGGER recall_memory_tip_enrichments_delete_immutable
BEFORE DELETE ON recall_card_memory_tip_enrichments
BEGIN
  SELECT RAISE(ABORT, 'recall memory-tip enrichments are immutable');
END;
