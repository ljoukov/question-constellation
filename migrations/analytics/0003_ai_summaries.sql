CREATE TABLE IF NOT EXISTS analytics_ai_summaries (
  summary_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  environment TEXT NOT NULL,
  window_days INTEGER NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_analytics_ai_summaries_scope_time
ON analytics_ai_summaries(environment, window_days, created_at DESC);
