PRAGMA foreign_keys = ON;

-- This database starts empty. This file is the complete current schema; it
-- intentionally contains no classifier backfill or historical conversion.

CREATE TABLE analytics_sessions (
  session_id TEXT PRIMARY KEY,
  anonymous_id TEXT NOT NULL,
  user_id TEXT,
  user_email TEXT,
  user_name TEXT,
  started_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  initial_url TEXT,
  initial_path TEXT,
  initial_referrer TEXT,
  landing_title TEXT,
  ip_address TEXT,
  user_agent TEXT,
  accept_language TEXT,
  country TEXT,
  region TEXT,
  region_code TEXT,
  city TEXT,
  postal_code TEXT,
  timezone TEXT,
  colo TEXT,
  continent TEXT,
  latitude TEXT,
  longitude TEXT,
  asn INTEGER,
  as_organization TEXT,
  browser_name TEXT,
  browser_version TEXT,
  operating_system TEXT,
  device_type TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  screen_width INTEGER,
  screen_height INTEGER,
  cf_json TEXT,
  request_headers_json TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  page_view_count INTEGER NOT NULL DEFAULT 0,
  engaged_ms INTEGER NOT NULL DEFAULT 0,
  environment TEXT NOT NULL,
  app_version TEXT,
  connection_effective_type TEXT,
  connection_downlink_mbps REAL,
  connection_rtt_ms INTEGER,
  connection_save_data INTEGER CHECK (connection_save_data IS NULL OR connection_save_data IN (0, 1)),
  device_memory_gb REAL,
  hardware_concurrency INTEGER,
  traffic_class TEXT NOT NULL DEFAULT 'unknown'
    CHECK (traffic_class IN ('human', 'verified_bot', 'suspected_bot', 'internal_test', 'unknown')),
  traffic_source TEXT NOT NULL DEFAULT 'missing_context',
  traffic_detail TEXT
);

CREATE TABLE analytics_requests (
  request_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  cf_ray TEXT,
  country TEXT,
  colo TEXT,
  cf_json TEXT,
  headers_json TEXT,
  event_count INTEGER NOT NULL,
  environment TEXT NOT NULL,
  app_version TEXT,
  FOREIGN KEY (session_id) REFERENCES analytics_sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE analytics_events (
  event_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  anonymous_id TEXT NOT NULL,
  user_id TEXT,
  user_email TEXT,
  user_name TEXT,
  event_type TEXT NOT NULL,
  client_timestamp_ms INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  sequence_number INTEGER,
  page_view_id TEXT,
  url TEXT,
  path TEXT,
  query_string TEXT,
  title TEXT,
  referrer TEXT,
  duration_ms INTEGER,
  engaged_ms INTEGER,
  scroll_depth_percent REAL,
  element_tag TEXT,
  element_id TEXT,
  element_classes TEXT,
  element_text TEXT,
  element_role TEXT,
  element_name TEXT,
  element_href TEXT,
  element_selector TEXT,
  input_name TEXT,
  input_type TEXT,
  input_value TEXT,
  previous_value TEXT,
  is_redacted INTEGER NOT NULL DEFAULT 0 CHECK (is_redacted IN (0, 1)),
  properties_json TEXT,
  environment TEXT NOT NULL,
  app_version TEXT,
  FOREIGN KEY (request_id) REFERENCES analytics_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES analytics_sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE analytics_model_runs (
  run_id TEXT PRIMARY KEY,
  session_id TEXT,
  anonymous_id TEXT,
  user_id TEXT,
  user_email TEXT,
  user_name TEXT,
  environment TEXT NOT NULL,
  app_version TEXT,
  feature TEXT NOT NULL,
  route_id TEXT,
  path TEXT,
  model TEXT NOT NULL,
  model_version TEXT,
  thinking_level TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  prompt_text TEXT,
  model_input_json TEXT,
  output_text TEXT,
  reasoning_text TEXT,
  usage_json TEXT,
  cost_usd REAL,
  error_name TEXT,
  error_message TEXT,
  metadata_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  cf_json TEXT,
  request_headers_json TEXT
);

CREATE TABLE analytics_ai_summaries (
  summary_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  environment TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  traffic_scope TEXT NOT NULL DEFAULT 'all'
    CHECK (traffic_scope IN ('human', 'bots', 'internal_test', 'unknown', 'all')),
  identity_scope TEXT NOT NULL DEFAULT 'all'
    CHECK (identity_scope IN ('authenticated', 'anonymous', 'all')),
  country_scope TEXT,
  path_scope TEXT,
  requested_by TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  model TEXT NOT NULL,
  model_version TEXT,
  thinking_level TEXT,
  prompt_text TEXT,
  source_snapshot_json TEXT,
  reasoning_text TEXT,
  summary_markdown TEXT,
  usage_json TEXT,
  cost_usd REAL,
  error_message TEXT
);

CREATE TABLE analytics_admin_audit (
  audit_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  target_hash TEXT,
  requested_by TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE TABLE analytics_actor_labels (
  actor_key TEXT PRIMARY KEY,
  classification TEXT NOT NULL CHECK (classification IN ('human', 'internal_test')),
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_analytics_sessions_last_seen
  ON analytics_sessions (last_seen_at DESC);
CREATE INDEX idx_analytics_sessions_user
  ON analytics_sessions (user_id, last_seen_at DESC);
CREATE INDEX idx_analytics_sessions_anonymous
  ON analytics_sessions (anonymous_id, last_seen_at DESC);
CREATE INDEX idx_analytics_sessions_environment_time
  ON analytics_sessions (environment, last_seen_at DESC);
CREATE INDEX idx_analytics_sessions_traffic_time
  ON analytics_sessions (traffic_class, environment, last_seen_at DESC);
CREATE INDEX idx_analytics_requests_session_time
  ON analytics_requests (session_id, received_at DESC);
CREATE INDEX idx_analytics_events_session_time
  ON analytics_events (session_id, client_timestamp_ms);
CREATE INDEX idx_analytics_events_user_time
  ON analytics_events (user_id, client_timestamp_ms DESC);
CREATE INDEX idx_analytics_events_type_time
  ON analytics_events (event_type, client_timestamp_ms DESC);
CREATE INDEX idx_analytics_events_path_time
  ON analytics_events (path, client_timestamp_ms DESC);
CREATE INDEX idx_analytics_events_environment_time
  ON analytics_events (environment, client_timestamp_ms DESC);
CREATE INDEX idx_analytics_model_runs_time
  ON analytics_model_runs (started_at DESC);
CREATE INDEX idx_analytics_model_runs_session_time
  ON analytics_model_runs (session_id, started_at DESC);
CREATE INDEX idx_analytics_model_runs_user_time
  ON analytics_model_runs (user_id, started_at DESC);
CREATE INDEX idx_analytics_model_runs_environment_status
  ON analytics_model_runs (environment, status, started_at DESC);
CREATE INDEX idx_analytics_ai_summaries_scope_time
  ON analytics_ai_summaries (
    environment,
    window_days,
    traffic_scope,
    identity_scope,
    created_at DESC
  );
CREATE INDEX idx_analytics_admin_audit_time
  ON analytics_admin_audit (created_at DESC);
CREATE INDEX idx_analytics_actor_labels_classification
  ON analytics_actor_labels (classification, updated_at DESC);
