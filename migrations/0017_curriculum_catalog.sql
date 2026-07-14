PRAGMA foreign_keys = ON;

-- Canonical, versioned exam-board specifications. The source PDF remains the
-- immutable authority; components below are a reviewed, queryable projection.
CREATE TABLE IF NOT EXISTS curriculum_specifications (
  id TEXT PRIMARY KEY,
  board TEXT NOT NULL,
  qualification TEXT NOT NULL,
  subject TEXT NOT NULL,
  course TEXT NOT NULL,
  specification_code TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  first_teaching_year INTEGER,
  first_exam_year INTEGER,
  last_exam_year INTEGER,
  status TEXT NOT NULL DEFAULT 'current'
    CHECK (status IN ('upcoming', 'current', 'legacy', 'withdrawn')),
  landing_url TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  local_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  page_count INTEGER NOT NULL CHECK (page_count > 0),
  source_metadata_json TEXT NOT NULL DEFAULT '{}',
  import_owner TEXT NOT NULL DEFAULT 'official_curriculum_importer',
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (
    board,
    qualification,
    subject,
    course,
    specification_code,
    version
  )
);

CREATE TABLE IF NOT EXISTS curriculum_components (
  id TEXT PRIMARY KEY,
  specification_id TEXT NOT NULL
    REFERENCES curriculum_specifications(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES curriculum_components(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  component_kind TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  display_order INTEGER NOT NULL,
  selectable INTEGER NOT NULL DEFAULT 0 CHECK (selectable IN (0, 1)),
  subject_area TEXT,
  paper TEXT,
  tier_json TEXT NOT NULL DEFAULT '[]',
  option_group_id TEXT,
  source_page_start INTEGER,
  source_page_end INTEGER,
  source_excerpt TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  import_owner TEXT NOT NULL DEFAULT 'official_curriculum_importer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (specification_id, subject_area, code)
);

-- One row per exact profile combination. `selection_tree_json` is deliberately
-- denormalized so a subject/scope page requires one indexed D1 read.
CREATE TABLE IF NOT EXISTS curriculum_offerings (
  id TEXT PRIMARY KEY,
  board TEXT NOT NULL,
  qualification TEXT NOT NULL,
  profile_subject TEXT NOT NULL,
  course TEXT NOT NULL,
  tier TEXT NOT NULL,
  specification_id TEXT NOT NULL
    REFERENCES curriculum_specifications(id) ON DELETE CASCADE,
  root_component_id TEXT REFERENCES curriculum_components(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  selection_tree_json TEXT NOT NULL,
  selectable_component_ids_json TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  import_owner TEXT NOT NULL DEFAULT 'official_curriculum_importer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (board, qualification, profile_subject, course, tier)
);

-- Profile needs all available combinations at once. This single-row snapshot
-- avoids per-subject joins and keeps the normalized catalogue auditable.
CREATE TABLE IF NOT EXISTS curriculum_profile_snapshots (
  id TEXT PRIMARY KEY,
  qualification TEXT NOT NULL,
  options_json TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  import_owner TEXT NOT NULL DEFAULT 'official_curriculum_importer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS question_curriculum_components (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  curriculum_component_id TEXT NOT NULL
    REFERENCES curriculum_components(id) ON DELETE CASCADE,
  specification_id TEXT NOT NULL
    REFERENCES curriculum_specifications(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  mapping_source TEXT NOT NULL,
  mapping_notes TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (question_id, curriculum_component_id)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_specifications_profile
  ON curriculum_specifications (
    qualification,
    board,
    subject,
    course,
    status,
    first_exam_year,
    last_exam_year
  );

CREATE INDEX IF NOT EXISTS idx_curriculum_components_tree
  ON curriculum_components (specification_id, parent_id, display_order);

CREATE INDEX IF NOT EXISTS idx_curriculum_components_selectable
  ON curriculum_components (specification_id, selectable, subject_area, display_order);

CREATE INDEX IF NOT EXISTS idx_curriculum_offerings_profile
  ON curriculum_offerings (
    qualification,
    board,
    profile_subject,
    course,
    tier,
    enabled
  );

CREATE INDEX IF NOT EXISTS idx_question_curriculum_component
  ON question_curriculum_components (curriculum_component_id, question_id);

CREATE INDEX IF NOT EXISTS idx_question_curriculum_question
  ON question_curriculum_components (question_id, is_primary);

CREATE UNIQUE INDEX IF NOT EXISTS idx_question_curriculum_one_primary_per_spec
  ON question_curriculum_components (question_id, specification_id)
  WHERE is_primary = 1;
