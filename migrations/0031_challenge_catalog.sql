PRAGMA foreign_keys = ON;

-- Challenge content is published as immutable releases. A release remains
-- invisible while its R2 objects, canonical rows and denormalized route
-- snapshots are uploaded and read back. Only the singleton state pointer is
-- consulted by the public app.
CREATE TABLE IF NOT EXISTS challenge_catalog_releases (
  id TEXT PRIMARY KEY
    CHECK (
      id = trim(id)
      AND length(id) BETWEEN 1 AND 120
      AND id NOT GLOB '*[^a-z0-9-]*'
    ),
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('staging', 'published', 'retired')),
  content_sha256 TEXT NOT NULL UNIQUE
    CHECK (
      length(content_sha256) = 64
      AND content_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
  challenge_count INTEGER NOT NULL CHECK (challenge_count > 0),
  asset_count INTEGER NOT NULL CHECK (asset_count > 0),
  route_payload_count INTEGER NOT NULL CHECK (route_payload_count > 0),
  subject_counts_json TEXT NOT NULL
    CHECK (
      json_valid(subject_counts_json)
      AND json_type(subject_counts_json) = 'object'
    ),
  source_evidence_json TEXT NOT NULL
    CHECK (
      json_valid(source_evidence_json)
      AND json_type(source_evidence_json) = 'object'
    ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS challenge_catalog_entries (
  release_id TEXT NOT NULL
    REFERENCES challenge_catalog_releases(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL
    CHECK (
      challenge_id = trim(challenge_id)
      AND length(challenge_id) BETWEEN 1 AND 160
      AND challenge_id NOT GLOB '*[^a-z0-9-]*'
    ),
  subject TEXT NOT NULL CHECK (subject IN ('biology', 'chemistry', 'physics')),
  slug TEXT NOT NULL
    CHECK (
      slug = trim(slug)
      AND length(slug) BETWEEN 1 AND 180
      AND slug NOT GLOB '*[^a-z0-9-]*'
    ),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  record_json TEXT NOT NULL
    CHECK (
      json_valid(record_json)
      AND json_type(record_json) = 'object'
    ),
  content_sha256 TEXT NOT NULL
    CHECK (
      length(content_sha256) = 64
      AND content_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (release_id, challenge_id),
  UNIQUE (release_id, subject, slug),
  UNIQUE (release_id, display_order)
);

CREATE INDEX IF NOT EXISTS idx_challenge_catalog_entries_subject_order
  ON challenge_catalog_entries (release_id, subject, display_order);

CREATE TABLE IF NOT EXISTS challenge_catalog_assets (
  release_id TEXT NOT NULL
    REFERENCES challenge_catalog_releases(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,
  art_id TEXT NOT NULL,
  challenge_id TEXT,
  role TEXT NOT NULL
    CHECK (role IN ('primary', 'transfer', 'earned', 'social')),
  theme TEXT NOT NULL CHECK (theme IN ('light', 'dark')),
  r2_key TEXT NOT NULL,
  public_path TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  content_sha256 TEXT NOT NULL
    CHECK (
      length(content_sha256) = 64
      AND content_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
  content_type TEXT NOT NULL,
  cache_control TEXT NOT NULL,
  review_disposition TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (release_id, asset_id),
  UNIQUE (release_id, r2_key),
  FOREIGN KEY (release_id, challenge_id)
    REFERENCES challenge_catalog_entries(release_id, challenge_id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_challenge_catalog_assets_owner
  ON challenge_catalog_assets (release_id, challenge_id, role, theme);

CREATE TABLE IF NOT EXISTS challenge_route_payloads (
  release_id TEXT NOT NULL
    REFERENCES challenge_catalog_releases(id) ON DELETE CASCADE,
  route_path TEXT NOT NULL
    CHECK (
      route_path = trim(route_path)
      AND length(route_path) BETWEEN 1 AND 400
      AND substr(route_path, 1, 1) = '/'
    ),
  route_kind TEXT NOT NULL
    CHECK (route_kind IN ('index', 'hub', 'subject', 'detail')),
  payload_json TEXT NOT NULL
    CHECK (
      json_valid(payload_json)
      AND json_type(payload_json) = 'object'
    ),
  content_sha256 TEXT NOT NULL
    CHECK (
      length(content_sha256) = 64
      AND content_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
  payload_bytes INTEGER NOT NULL CHECK (payload_bytes > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (release_id, route_path)
);

CREATE INDEX IF NOT EXISTS idx_challenge_route_payloads_kind
  ON challenge_route_payloads (release_id, route_kind, route_path);

CREATE TABLE IF NOT EXISTS challenge_catalog_state (
  state_key TEXT PRIMARY KEY CHECK (state_key = 'active'),
  release_id TEXT NOT NULL
    REFERENCES challenge_catalog_releases(id) ON DELETE RESTRICT,
  content_sha256 TEXT NOT NULL
    CHECK (
      length(content_sha256) = 64
      AND content_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
