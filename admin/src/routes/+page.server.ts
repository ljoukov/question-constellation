import type { PageServerLoad } from './$types';
import { queryRows } from '$lib/server/db';

type Param = string | number | null;

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const days = positiveInteger(url.searchParams.get('days'), 30, 3650);
	const search = (url.searchParams.get('q') || '').trim().slice(0, 200);
	const path = (url.searchParams.get('path') || '').trim().slice(0, 500);
	const eventType = (url.searchParams.get('type') || '').trim().slice(0, 64);
	const environment = ['production', 'development'].includes(
		url.searchParams.get('environment') || ''
	)
		? (url.searchParams.get('environment') as 'production' | 'development')
		: 'all';
	const identity = ['authenticated', 'anonymous'].includes(url.searchParams.get('identity') || '')
		? (url.searchParams.get('identity') as 'authenticated' | 'anonymous')
		: 'all';
	const selectedSessionId = (url.searchParams.get('session') || '').trim().slice(0, 96);
	const selectedRunId = (url.searchParams.get('run') || '').trim().slice(0, 96);
	const since = new Date(Date.now() - days * 86_400_000).toISOString();
	const where = ['s.last_seen_at >= ?'];
	const params: Param[] = [since];
	if (environment !== 'all') {
		where.push('s.environment = ?');
		params.push(environment);
	}
	if (identity === 'authenticated') where.push('s.user_id IS NOT NULL');
	if (identity === 'anonymous') where.push('s.user_id IS NULL');

	if (search) {
		where.push(`(
			s.session_id LIKE ? OR s.anonymous_id LIKE ? OR s.user_id LIKE ? OR
			s.user_email LIKE ? OR s.ip_address LIKE ? OR s.initial_path LIKE ?
		)`);
		for (let index = 0; index < 6; index += 1) params.push(`%${search}%`);
	}
	if (path) {
		where.push(
			'EXISTS (SELECT 1 FROM analytics_events pe WHERE pe.session_id = s.session_id AND pe.path LIKE ?)'
		);
		params.push(`%${path}%`);
	}
	if (eventType) {
		where.push(
			'EXISTS (SELECT 1 FROM analytics_events te WHERE te.session_id = s.session_id AND te.event_type = ?)'
		);
		params.push(eventType);
	}

	const environmentClause = environment === 'all' ? '' : ' AND environment = ?';
	const environmentParams: Param[] = environment === 'all' ? [since] : [since, environment];
	const [summaryRows, sessions, eventTypes, topPages, modelRuns, environments, latestSummaries] =
		await Promise.all([
			queryRows<{
				sessions: number;
				authenticated_users: number;
				anonymous_visitors: number;
				page_views: number;
				events: number;
				engaged_ms: number;
				model_runs: number;
			}>(
				locals.analyticsDb,
				`SELECT
				COUNT(*) AS sessions,
				COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) AS authenticated_users,
				COUNT(DISTINCT anonymous_id) AS anonymous_visitors,
				COALESCE(SUM(page_view_count), 0) AS page_views,
				COALESCE(SUM(event_count), 0) AS events,
				COALESCE(SUM(engaged_ms), 0) AS engaged_ms
			FROM analytics_sessions WHERE last_seen_at >= ?${environmentClause}`,
				environmentParams
			),
			queryRows<Record<string, string | number | null>>(
				locals.analyticsDb,
				`SELECT s.* FROM analytics_sessions s
			WHERE ${where.join(' AND ')}
			ORDER BY s.last_seen_at DESC LIMIT 200`,
				params
			),
			queryRows<{ event_type: string; count: number }>(
				locals.analyticsDb,
				`SELECT event_type, COUNT(*) AS count FROM analytics_events
			WHERE received_at >= ?${environmentClause} GROUP BY event_type ORDER BY count DESC`,
				environmentParams
			),
			queryRows<{ path: string; views: number; visitors: number }>(
				locals.analyticsDb,
				`SELECT path, COUNT(*) AS views, COUNT(DISTINCT anonymous_id) AS visitors
			FROM analytics_events WHERE event_type = 'page_view' AND received_at >= ?${environmentClause}
			GROUP BY path ORDER BY views DESC LIMIT 20`,
				environmentParams
			),
			queryRows<Record<string, string | number | null>>(
				locals.analyticsDb,
				`SELECT * FROM analytics_model_runs
			WHERE started_at >= ?${environmentClause}
			ORDER BY started_at DESC LIMIT 200`,
				environmentParams
			),
			queryRows<{ environment: string; sessions: number }>(
				locals.analyticsDb,
				`SELECT environment, COUNT(*) AS sessions FROM analytics_sessions
			WHERE last_seen_at >= ? GROUP BY environment ORDER BY sessions DESC`,
				[since]
			),
			queryRows<Record<string, string | number | null>>(
				locals.analyticsDb,
				`SELECT * FROM analytics_ai_summaries
			WHERE environment = ? AND window_days = ?
			ORDER BY created_at DESC LIMIT 1`,
				[environment, days]
			)
		]);
	const modelRunCount = modelRuns.length;

	const selectedSession = selectedSessionId
		? ((
				await queryRows<Record<string, string | number | null>>(
					locals.analyticsDb,
					'SELECT * FROM analytics_sessions WHERE session_id = ? LIMIT 1',
					[selectedSessionId]
				)
			)[0] ?? null)
		: null;
	const events = selectedSession
		? await queryRows<Record<string, string | number | null>>(
				locals.analyticsDb,
				`SELECT e.*, r.cf_ray, r.cf_json AS request_cf_json, r.headers_json
				FROM analytics_events e
				LEFT JOIN analytics_requests r ON r.request_id = e.request_id
				WHERE e.session_id = ? ORDER BY e.client_timestamp_ms ASC, e.sequence_number ASC`,
				[selectedSessionId]
			)
		: [];
	const sessionModelRuns = selectedSession
		? await queryRows<Record<string, string | number | null>>(
				locals.analyticsDb,
				'SELECT * FROM analytics_model_runs WHERE session_id = ? ORDER BY started_at ASC',
				[selectedSessionId]
			)
		: [];
	const selectedRun = selectedRunId
		? ((
				await queryRows<Record<string, string | number | null>>(
					locals.analyticsDb,
					'SELECT * FROM analytics_model_runs WHERE run_id = ? LIMIT 1',
					[selectedRunId]
				)
			)[0] ?? null)
		: null;
	const journey: Array<Record<string, string | number | null>> = [
		...events.map((event) => ({
			...event,
			journey_kind: 'event',
			journey_time: Number(event.client_timestamp_ms || 0)
		})),
		...sessionModelRuns.map((run) => ({
			...run,
			journey_kind: 'model',
			journey_time: Date.parse(String(run.started_at || '')) || 0
		}))
	].sort((left, right) => Number(left.journey_time) - Number(right.journey_time));

	return {
		adminIdentity: locals.adminIdentity,
		adminUser: locals.adminUser,
		filters: { days, search, path, eventType, environment, identity },
		summary: summaryRows[0] ?? {
			sessions: 0,
			authenticated_users: 0,
			anonymous_visitors: 0,
			page_views: 0,
			events: 0,
			engaged_ms: 0,
			model_runs: 0
		},
		modelRunCount,
		sessions,
		eventTypes,
		topPages,
		modelRuns,
		environments,
		latestSummary: latestSummaries[0] ?? null,
		selectedSession,
		events,
		sessionModelRuns,
		journey,
		selectedRun
	};
};
