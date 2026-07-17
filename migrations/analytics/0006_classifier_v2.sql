UPDATE analytics_sessions
SET
  traffic_class = 'suspected_bot',
  traffic_source = 'user_agent_rule',
  traffic_detail = 'classifier v2 user-agent rule',
  classification_version = 2,
  classified_at = COALESCE(last_seen_at, started_at)
WHERE environment = 'production'
  AND (
    traffic_class = 'human'
    OR traffic_source IN ('browser_traffic', 'user_agent_rule')
  )
  AND (
    LOWER(COALESCE(user_agent, '')) LIKE '%googlebot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%spider%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%googleother%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%google-inspectiontool%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%adsbot-google%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%apis-google%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%mediapartners-google%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%bingbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%bingpreview%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%duckduckbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%baiduspider%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%yandexbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%applebot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%slurp%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%facebookexternalhit%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%twitterbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%linkedinbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%petalbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%semrushbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%ahrefsbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%bytespider%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%gptbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%chatgpt-user%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%claudebot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%anthropic-ai%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%perplexitybot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%ccbot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%crawler%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%headlesschrome%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%chrome-lighthouse%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%lighthouse%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%pagespeed%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%pingdom%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%uptimerobot%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%curl/%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%wget/%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%python-requests%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%go-http-client%'
    OR LOWER(COALESCE(user_agent, '')) LIKE '%node-fetch%'
  );

UPDATE analytics_sessions
SET classification_version = 2
WHERE classification_version < 2;
