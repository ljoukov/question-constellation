ALTER TABLE analytics_sessions ADD COLUMN traffic_class TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE analytics_sessions ADD COLUMN traffic_source TEXT;
ALTER TABLE analytics_sessions ADD COLUMN traffic_detail TEXT;
ALTER TABLE analytics_sessions ADD COLUMN classification_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE analytics_sessions ADD COLUMN classified_at TEXT;

ALTER TABLE analytics_ai_summaries ADD COLUMN traffic_scope TEXT NOT NULL DEFAULT 'legacy_all';
ALTER TABLE analytics_ai_summaries ADD COLUMN identity_scope TEXT NOT NULL DEFAULT 'all';
ALTER TABLE analytics_ai_summaries ADD COLUMN country_scope TEXT;
ALTER TABLE analytics_ai_summaries ADD COLUMN path_scope TEXT;

UPDATE analytics_sessions
SET
  traffic_class = CASE
    WHEN environment <> 'production' THEN 'internal_test'
    WHEN NULLIF(TRIM(json_extract(CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END, '$.verifiedBotCategory')), '') IS NOT NULL THEN 'verified_bot'
    WHEN json_extract(CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END, '$.botManagement.verifiedBot') = 1 THEN 'verified_bot'
    WHEN CAST(json_extract(CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END, '$.botManagement.score') AS INTEGER) BETWEEN 1 AND 29 THEN 'suspected_bot'
    WHEN LOWER(COALESCE(user_agent, '')) LIKE '%googlebot%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%googleother%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%google-inspectiontool%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%bingbot%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%crawler%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%spider%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%headlesschrome%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%chrome-lighthouse%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%pagespeed%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%gptbot%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%claudebot%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%perplexitybot%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%bytespider%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%facebookexternalhit%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%curl/%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%wget/%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%python-requests%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%go-http-client%'
      THEN 'suspected_bot'
    WHEN NULLIF(TRIM(COALESCE(user_agent, '')), '') IS NULL THEN 'unknown'
    ELSE 'human'
  END,
  traffic_source = CASE
    WHEN environment <> 'production' THEN 'development_environment'
    WHEN NULLIF(TRIM(json_extract(CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END, '$.verifiedBotCategory')), '') IS NOT NULL
      THEN 'cloudflare_verified_bot'
    WHEN json_extract(CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END, '$.botManagement.verifiedBot') = 1
      THEN 'cloudflare_bot_management'
    WHEN CAST(json_extract(CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END, '$.botManagement.score') AS INTEGER) BETWEEN 1 AND 29
      THEN 'cloudflare_bot_score'
    WHEN NULLIF(TRIM(COALESCE(user_agent, '')), '') IS NULL THEN 'missing_user_agent'
    WHEN LOWER(COALESCE(user_agent, '')) LIKE '%bot%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%crawler%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%spider%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%googleother%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%headlesschrome%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%lighthouse%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%pagespeed%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%curl/%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%wget/%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%python-requests%'
      OR LOWER(COALESCE(user_agent, '')) LIKE '%go-http-client%'
      THEN 'user_agent_rule'
    ELSE 'browser_traffic'
  END,
  traffic_detail = COALESCE(
    NULLIF(TRIM(json_extract(CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END, '$.verifiedBotCategory')), ''),
    CASE
      WHEN environment <> 'production' THEN environment
      WHEN CAST(json_extract(CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END, '$.botManagement.score') AS INTEGER) BETWEEN 1 AND 29
        THEN 'score ' || CAST(json_extract(CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END, '$.botManagement.score') AS TEXT)
      ELSE NULL
    END
  ),
  classification_version = 1,
  classified_at = COALESCE(last_seen_at, started_at);

CREATE TABLE IF NOT EXISTS analytics_actor_labels (
  actor_key TEXT PRIMARY KEY,
  classification TEXT NOT NULL CHECK (classification IN ('human', 'internal_test')),
  note TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_traffic_time
ON analytics_sessions(traffic_class, environment, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_actor_labels_classification
ON analytics_actor_labels(classification, updated_at DESC);
