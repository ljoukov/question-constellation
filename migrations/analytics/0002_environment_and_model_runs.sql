ALTER TABLE analytics_sessions ADD COLUMN environment TEXT NOT NULL DEFAULT 'production';
ALTER TABLE analytics_sessions ADD COLUMN app_version TEXT;
ALTER TABLE analytics_sessions ADD COLUMN connection_effective_type TEXT;
ALTER TABLE analytics_sessions ADD COLUMN connection_downlink_mbps REAL;
ALTER TABLE analytics_sessions ADD COLUMN connection_rtt_ms INTEGER;
ALTER TABLE analytics_sessions ADD COLUMN connection_save_data INTEGER;
ALTER TABLE analytics_sessions ADD COLUMN device_memory_gb REAL;
ALTER TABLE analytics_sessions ADD COLUMN hardware_concurrency INTEGER;

ALTER TABLE analytics_requests ADD COLUMN environment TEXT NOT NULL DEFAULT 'production';
ALTER TABLE analytics_requests ADD COLUMN app_version TEXT;

ALTER TABLE analytics_events ADD COLUMN environment TEXT NOT NULL DEFAULT 'production';
ALTER TABLE analytics_events ADD COLUMN app_version TEXT;

CREATE TABLE IF NOT EXISTS analytics_model_runs (
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

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_environment_time ON analytics_sessions(environment, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_environment_time ON analytics_events(environment, client_timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_model_runs_time ON analytics_model_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_model_runs_session_time ON analytics_model_runs(session_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_model_runs_user_time ON analytics_model_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_model_runs_environment_status ON analytics_model_runs(environment, status, started_at DESC);
