CREATE TABLE IF NOT EXISTS analytics_admin_audit (
  audit_id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  scope TEXT NOT NULL,
  target_hash TEXT,
  requested_by TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_analytics_admin_audit_time
ON analytics_admin_audit(created_at DESC);
