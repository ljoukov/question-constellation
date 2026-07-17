WITH raw_candidates AS (
  SELECT
    session_id,
    environment,
    COALESCE(user_agent, '') AS user_agent,
    NULLIF(
      TRIM(
        json_extract(
          CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END,
          '$.verifiedBotCategory'
        )
      ),
      ''
    ) AS verified_bot_category,
    json_extract(
      CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END,
      '$.botManagement.verifiedBot'
    ) AS bot_management_verified,
    CAST(
      json_extract(
        CASE WHEN json_valid(cf_json) THEN cf_json ELSE '{}' END,
        '$.botManagement.score'
      ) AS INTEGER
    ) AS bot_score,
    COALESCE(last_seen_at, started_at) AS observed_at
  FROM analytics_sessions
  WHERE traffic_class = 'unknown' OR traffic_source IS NULL
),
normalized_candidates AS (
  SELECT
    *,
    CASE WHEN
      LOWER(user_agent) LIKE '%googlebot%'
      OR LOWER(user_agent) LIKE '%googleother%'
      OR LOWER(user_agent) LIKE '%google-inspectiontool%'
      OR LOWER(user_agent) LIKE '%adsbot-google%'
      OR LOWER(user_agent) LIKE '%apis-google%'
      OR LOWER(user_agent) LIKE '%mediapartners-google%'
      OR LOWER(user_agent) LIKE '%bingbot%'
      OR LOWER(user_agent) LIKE '%bingpreview%'
      OR LOWER(user_agent) LIKE '%duckduckbot%'
      OR LOWER(user_agent) LIKE '%baiduspider%'
      OR LOWER(user_agent) LIKE '%yandexbot%'
      OR LOWER(user_agent) LIKE '%applebot%'
      OR LOWER(user_agent) LIKE '%slurp%'
      OR LOWER(user_agent) LIKE '%facebookexternalhit%'
      OR LOWER(user_agent) LIKE '%twitterbot%'
      OR LOWER(user_agent) LIKE '%linkedinbot%'
      OR LOWER(user_agent) LIKE '%petalbot%'
      OR LOWER(user_agent) LIKE '%semrushbot%'
      OR LOWER(user_agent) LIKE '%ahrefsbot%'
      OR LOWER(user_agent) LIKE '%bytespider%'
      OR LOWER(user_agent) LIKE '%gptbot%'
      OR LOWER(user_agent) LIKE '%chatgpt-user%'
      OR LOWER(user_agent) LIKE '%claudebot%'
      OR LOWER(user_agent) LIKE '%anthropic-ai%'
      OR LOWER(user_agent) LIKE '%perplexitybot%'
      OR LOWER(user_agent) LIKE '%ccbot%'
      OR LOWER(user_agent) LIKE '%crawler%'
      OR LOWER(user_agent) LIKE '%spider%'
      OR LOWER(user_agent) LIKE '%headlesschrome%'
      OR LOWER(user_agent) LIKE '%chrome-lighthouse%'
      OR LOWER(user_agent) LIKE '%lighthouse%'
      OR LOWER(user_agent) LIKE '%pagespeed%'
      OR LOWER(user_agent) LIKE '%pingdom%'
      OR LOWER(user_agent) LIKE '%uptimerobot%'
      OR LOWER(user_agent) LIKE '%curl/%'
      OR LOWER(user_agent) LIKE '%wget/%'
      OR LOWER(user_agent) LIKE '%python-requests%'
      OR LOWER(user_agent) LIKE '%go-http-client%'
      OR LOWER(user_agent) LIKE '%node-fetch%'
    THEN 1 ELSE 0 END AS user_agent_automation
  FROM raw_candidates
),
classified_candidates AS (
  SELECT
    session_id,
    CASE
      WHEN environment <> 'production' THEN 'internal_test'
      WHEN verified_bot_category IS NOT NULL THEN 'verified_bot'
      WHEN bot_management_verified = 1 THEN 'verified_bot'
      WHEN bot_score BETWEEN 1 AND 29 THEN 'suspected_bot'
      WHEN user_agent_automation = 1 THEN 'suspected_bot'
      WHEN NULLIF(TRIM(user_agent), '') IS NULL THEN 'unknown'
      ELSE 'human'
    END AS new_traffic_class,
    CASE
      WHEN environment <> 'production' THEN 'development_environment'
      WHEN verified_bot_category IS NOT NULL THEN 'cloudflare_verified_bot'
      WHEN bot_management_verified = 1 THEN 'cloudflare_bot_management'
      WHEN bot_score BETWEEN 1 AND 29 THEN 'cloudflare_bot_score'
      WHEN user_agent_automation = 1 THEN 'user_agent_rule'
      WHEN NULLIF(TRIM(user_agent), '') IS NULL THEN 'missing_user_agent'
      ELSE 'browser_traffic'
    END AS new_traffic_source,
    CASE
      WHEN environment <> 'production' THEN environment
      WHEN verified_bot_category IS NOT NULL THEN verified_bot_category
      WHEN bot_score BETWEEN 1 AND 29 THEN 'score ' || CAST(bot_score AS TEXT)
      WHEN user_agent_automation = 1 THEN 'classifier v2 user-agent rule'
      ELSE NULL
    END AS new_traffic_detail,
    observed_at
  FROM normalized_candidates
)
UPDATE analytics_sessions
SET
  traffic_class = (
    SELECT new_traffic_class FROM classified_candidates
    WHERE classified_candidates.session_id = analytics_sessions.session_id
  ),
  traffic_source = (
    SELECT new_traffic_source FROM classified_candidates
    WHERE classified_candidates.session_id = analytics_sessions.session_id
  ),
  traffic_detail = (
    SELECT new_traffic_detail FROM classified_candidates
    WHERE classified_candidates.session_id = analytics_sessions.session_id
  ),
  classification_version = 2,
  classified_at = (
    SELECT observed_at FROM classified_candidates
    WHERE classified_candidates.session_id = analytics_sessions.session_id
  )
WHERE session_id IN (SELECT session_id FROM classified_candidates);
