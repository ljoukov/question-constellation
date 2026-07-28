PRAGMA foreign_keys = ON;

-- Public challenge requests must read exactly one denormalized row. Immutable
-- release payloads remain in challenge_route_payloads for publication audit,
-- while this table is the complete active runtime projection.
CREATE TABLE challenge_active_route_payloads (
  route_path TEXT PRIMARY KEY
    CHECK (
      route_path = trim(route_path)
      AND length(route_path) BETWEEN 1 AND 400
      AND substr(route_path, 1, 1) = '/'
    ),
  route_kind TEXT NOT NULL
    CHECK (route_kind IN ('index', 'hub', 'subject', 'detail')),
  release_id TEXT NOT NULL
    REFERENCES challenge_catalog_releases(id) ON DELETE RESTRICT,
  release_sha256 TEXT NOT NULL
    CHECK (
      length(release_sha256) = 64
      AND release_sha256 NOT GLOB '*[^0-9a-f]*'
    ),
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
  activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Populate the projection for the release that was already active when this
-- migration ran. Future catalogue publications replace it atomically.
INSERT INTO challenge_active_route_payloads (
  route_path,
  route_kind,
  release_id,
  release_sha256,
  payload_json,
  content_sha256,
  payload_bytes,
  activated_at
)
SELECT
  payload.route_path,
  payload.route_kind,
  release.id,
  release.content_sha256,
  payload.payload_json,
  payload.content_sha256,
  payload.payload_bytes,
  CURRENT_TIMESTAMP
FROM challenge_catalog_state AS state
JOIN challenge_catalog_releases AS release
  ON release.id = state.release_id
 AND release.status = 'published'
 AND release.content_sha256 = state.content_sha256
JOIN challenge_route_payloads AS payload
  ON payload.release_id = release.id
WHERE state.state_key = 'active';
