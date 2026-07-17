-- Question Constellation production acquisition baseline.
-- Executed against question-constellation-analytics (Cloudflare D1 / SQLite).
-- Production origin: https://constellation.eviworld.com
-- Window: full available production history from 2026-07-11T00:00:00Z
-- through the fixed cutoff 2026-07-17T16:40:00Z.
--
-- Definitions:
-- - Actor: user:<user_id> when authenticated, otherwise anon:<anonymous_id>.
-- - Human: the session classifier's value after an analytics_actor_labels
--   manual override, when present, otherwise analytics_sessions.traffic_class.
-- - Google origin: initial_referrer is exactly the www.google.com HTTPS origin
--   after trimming the trailing slash. This excludes accounts.google.com OAuth
--   callbacks and does not use a substring match.
-- - Biology landing: an exact Google-origin session whose initial_path contains
--   "biology". The observed value is zero, so broader subject mapping cannot
--   increase evidence for a Biology landing in this window.

WITH labeled AS (
  SELECT
    s.*,
    CASE
      WHEN s.user_id IS NOT NULL THEN 'user:' || s.user_id
      ELSE 'anon:' || s.anonymous_id
    END AS actor_key,
    COALESCE(l.classification, s.traffic_class, 'unknown')
      AS effective_traffic_class
  FROM analytics_sessions AS s
  LEFT JOIN analytics_actor_labels AS l
    ON l.actor_key = CASE
      WHEN s.user_id IS NOT NULL THEN 'user:' || s.user_id
      ELSE 'anon:' || s.anonymous_id
    END
  WHERE s.environment = 'production'
    AND s.last_seen_at >= '2026-07-11T00:00:00Z'
    AND s.last_seen_at < '2026-07-17T16:40:00Z'
),
human AS (
  SELECT *
  FROM labeled
  WHERE effective_traffic_class = 'human'
)
SELECT
  COUNT(*) AS human_sessions,
  COALESCE(SUM(page_view_count), 0) AS human_page_views,
  COUNT(DISTINCT actor_key) AS distinct_human_actors,
  SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END)
    AS anonymous_human_sessions,
  SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END)
    AS authenticated_human_sessions,
  COALESCE(SUM(CASE WHEN user_id IS NULL THEN page_view_count ELSE 0 END), 0)
    AS anonymous_human_page_views,
  COALESCE(SUM(CASE WHEN user_id IS NOT NULL THEN page_view_count ELSE 0 END), 0)
    AS authenticated_human_page_views,
  SUM(
    CASE
      WHEN LOWER(RTRIM(COALESCE(initial_referrer, ''), '/'))
        = 'https://www.google.com'
      THEN 1 ELSE 0
    END
  ) AS exact_google_origin_sessions,
  SUM(
    CASE
      WHEN user_id IS NULL
        AND LOWER(RTRIM(COALESCE(initial_referrer, ''), '/'))
          = 'https://www.google.com'
      THEN 1 ELSE 0
    END
  ) AS anonymous_exact_google_origin_sessions,
  SUM(
    CASE
      WHEN LOWER(RTRIM(COALESCE(initial_referrer, ''), '/'))
          = 'https://www.google.com'
        AND LOWER(COALESCE(initial_path, '')) LIKE '%biology%'
      THEN 1 ELSE 0
    END
  ) AS biology_exact_google_origin_sessions
FROM human;

-- Operator-concentration check. This returns counts only and excludes actor IDs.
WITH labeled AS (
  SELECT
    s.*,
    CASE
      WHEN s.user_id IS NOT NULL THEN 'user:' || s.user_id
      ELSE 'anon:' || s.anonymous_id
    END AS actor_key,
    COALESCE(l.classification, s.traffic_class, 'unknown')
      AS effective_traffic_class
  FROM analytics_sessions AS s
  LEFT JOIN analytics_actor_labels AS l
    ON l.actor_key = CASE
      WHEN s.user_id IS NOT NULL THEN 'user:' || s.user_id
      ELSE 'anon:' || s.anonymous_id
    END
  WHERE s.environment = 'production'
    AND s.last_seen_at >= '2026-07-11T00:00:00Z'
    AND s.last_seen_at < '2026-07-17T16:40:00Z'
),
human AS (
  SELECT *
  FROM labeled
  WHERE effective_traffic_class = 'human'
),
actor_totals AS (
  SELECT
    actor_key,
    COUNT(*) AS sessions,
    SUM(page_view_count) AS page_views
  FROM human
  GROUP BY actor_key
),
ranked AS (
  SELECT
    sessions,
    page_views,
    ROW_NUMBER() OVER (ORDER BY sessions DESC, page_views DESC) AS rank
  FROM actor_totals
),
totals AS (
  SELECT
    COUNT(*) AS sessions,
    SUM(page_view_count) AS page_views
  FROM human
)
SELECT
  r.sessions AS dominant_actor_sessions,
  ROUND(100.0 * r.sessions / t.sessions, 1) AS share_of_sessions_pct,
  r.page_views AS dominant_actor_page_views,
  ROUND(100.0 * r.page_views / t.page_views, 1) AS share_of_page_views_pct
FROM ranked AS r
CROSS JOIN totals AS t
WHERE r.rank = 1;

-- Reproducible crawler baseline at the same cutoff. These are sessions/initial
-- paths, not learner visits, impressions, indexed pages, or clicks.
WITH googlebot AS (
  SELECT s.*
  FROM analytics_sessions AS s
  WHERE s.environment = 'production'
    AND s.last_seen_at >= '2026-07-11T00:00:00Z'
    AND s.last_seen_at < '2026-07-17T16:40:00Z'
    AND LOWER(COALESCE(s.user_agent, '')) LIKE '%googlebot%'
    AND COALESCE(
      json_extract(
        CASE WHEN json_valid(s.cf_json) THEN s.cf_json ELSE '{}' END,
        '$.verifiedBotCategory'
      ),
      ''
    ) = 'Search Engine Crawler'
)
SELECT
  COUNT(*) AS verified_googlebot_sessions,
  COUNT(DISTINCT initial_path) AS distinct_initial_paths,
  SUM(
    CASE
      WHEN LOWER(COALESCE(initial_path, '')) LIKE '%biology%'
      THEN 1 ELSE 0
    END
  ) AS path_text_biology_sessions,
  COUNT(
    DISTINCT CASE
      WHEN LOWER(COALESCE(initial_path, '')) LIKE '%biology%'
      THEN initial_path
    END
  ) AS path_text_biology_distinct_paths
FROM googlebot;
