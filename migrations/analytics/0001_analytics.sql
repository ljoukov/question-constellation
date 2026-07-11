PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS analytics_sessions (
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
  engaged_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_requests (
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
  FOREIGN KEY (session_id) REFERENCES analytics_sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analytics_events (
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
  is_redacted INTEGER NOT NULL DEFAULT 0,
  properties_json TEXT,
  FOREIGN KEY (request_id) REFERENCES analytics_requests(request_id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES analytics_sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_last_seen ON analytics_sessions(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON analytics_sessions(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_anonymous ON analytics_sessions(anonymous_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_time ON analytics_events(session_id, client_timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_time ON analytics_events(user_id, client_timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_time ON analytics_events(event_type, client_timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_path_time ON analytics_events(path, client_timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_requests_session_time ON analytics_requests(session_id, received_at DESC);
