import type { Actions, PageServerLoad } from './$types';
import { executeQuery, queryRows } from '$lib/server/db';
import {
	ENRICHED_SESSIONS_CTE,
	parseAnalyticsFilters,
	sessionScope,
	type AnalyticsFilters
} from '$lib/server/analyticsScope';
import { buildSessionSequences, topJourneyPatterns } from '$lib/server/journeys';

type Row = Record<string, string | number | null>;
type Param = string | number | null;

const SESSION_LIST_COLUMNS = `
	s.session_id, s.anonymous_id, s.actor_key, s.actor_kind, s.effective_user_id,
	s.effective_user_email, s.effective_user_name, s.started_at, s.last_seen_at,
	s.initial_path, s.initial_referrer, s.country, s.region, s.city, s.browser_name,
	s.operating_system, s.device_type, s.viewport_width, s.viewport_height,
	s.event_count, s.page_view_count, s.engaged_ms, s.environment,
	s.effective_traffic_class, s.effective_traffic_source, s.traffic_detail, s.traffic_note
`;

function modelScope(filters: AnalyticsFilters): { sql: string; params: Param[] } {
	const since = new Date(Date.now() - filters.days * 86_400_000).toISOString();
	const where = ['m.started_at >= ?'];
	const params: Param[] = [since];
	if (filters.environment !== 'all') {
		where.push('m.environment = ?');
		params.push(filters.environment);
	}
	const effectiveTraffic = `COALESCE(s.effective_traffic_class,
		CASE WHEN m.environment <> 'production' THEN 'internal_test' ELSE 'unknown' END)`;
	if (filters.traffic === 'bots') {
		where.push(`${effectiveTraffic} IN ('verified_bot', 'suspected_bot')`);
	} else if (filters.traffic !== 'all') {
		where.push(`${effectiveTraffic} = ?`);
		params.push(filters.traffic);
	}
	if (filters.identity === 'authenticated') {
		where.push('COALESCE(m.user_id, s.effective_user_id) IS NOT NULL');
	} else if (filters.identity === 'anonymous') {
		where.push('COALESCE(m.user_id, s.effective_user_id) IS NULL');
	}
	if (filters.country) {
		where.push('s.country = ?');
		params.push(filters.country);
	}
	if (filters.path) {
		where.push('m.path LIKE ?');
		params.push(`%${filters.path}%`);
	}
	if (filters.search) {
		const search = `%${filters.search}%`;
		where.push(`(
			m.feature LIKE ? OR m.model LIKE ? OR
			COALESCE(m.user_email, s.effective_user_email) LIKE ? OR
			COALESCE(m.user_id, s.effective_user_id) LIKE ? OR
			m.anonymous_id LIKE ? OR m.run_id LIKE ? OR m.path LIKE ?
		)`);
		params.push(search, search, search, search, search, search, search);
	}
	return { sql: where.join(' AND '), params };
}

function countryAggregationSql(scopeSql: string, limit = 80): string {
	return `${ENRICHED_SESSIONS_CTE},
	scoped_sessions AS (
		SELECT s.* FROM enriched_sessions s WHERE ${scopeSql}
	),
	profile_countries AS (
		SELECT
			actor_key,
			country,
			ROW_NUMBER() OVER (PARTITION BY actor_key ORDER BY last_seen_at DESC) AS country_rank
		FROM scoped_sessions
		WHERE country IS NOT NULL
	),
	country_visits AS (
		SELECT country, COUNT(*) AS sessions
		FROM scoped_sessions
		WHERE country IS NOT NULL
		GROUP BY country
	)
	SELECT
		visit.country,
		COUNT(profile.actor_key) AS profiles,
		visit.sessions
	FROM country_visits visit
	LEFT JOIN profile_countries profile
		ON profile.country = visit.country AND profile.country_rank = 1
	GROUP BY visit.country, visit.sessions
	ORDER BY profiles DESC, sessions DESC
	LIMIT ${limit}`;
}

async function selectedSessionData(
	db: App.Locals['analyticsDb'],
	sessionId: string
): Promise<{
	selectedSession: Row | null;
	events: Row[];
	sessionModelRuns: Row[];
	journey: Row[];
}> {
	if (!sessionId) {
		return { selectedSession: null, events: [], sessionModelRuns: [], journey: [] };
	}
	const selectedSession =
		(
			await queryRows<Row>(
				db,
				`${ENRICHED_SESSIONS_CTE}
				SELECT ${SESSION_LIST_COLUMNS}
				FROM enriched_sessions s WHERE s.session_id = ? LIMIT 1`,
				[sessionId]
			)
		)[0] ?? null;
	if (!selectedSession) {
		return { selectedSession: null, events: [], sessionModelRuns: [], journey: [] };
	}
	const [events, sessionModelRuns] = await Promise.all([
		queryRows<Row>(
			db,
			`SELECT
				e.event_id, e.request_id, e.session_id, e.event_type, e.client_timestamp_ms,
				e.occurred_at, e.sequence_number, e.page_view_id, e.url, e.path, e.query_string,
				e.title, e.referrer, e.duration_ms, e.engaged_ms, e.scroll_depth_percent,
				e.element_tag, e.element_id, e.element_classes, e.element_text, e.element_role,
				e.element_name, e.element_href, e.element_selector, e.input_name, e.input_type,
				e.input_value, e.previous_value, e.is_redacted, e.properties_json,
				r.cf_ray, r.cf_json AS request_cf_json, r.headers_json
			FROM analytics_events e
			LEFT JOIN analytics_requests r ON r.request_id = e.request_id
			WHERE e.session_id = ?
			ORDER BY e.client_timestamp_ms ASC, e.sequence_number ASC`,
			[sessionId]
		),
		queryRows<Row>(
			db,
			`SELECT
				run_id, feature, path, model, model_version, thinking_level, status,
				started_at, completed_at, duration_ms, cost_usd, error_name, error_message
			FROM analytics_model_runs WHERE session_id = ? ORDER BY started_at ASC`,
			[sessionId]
		)
	]);
	const journey: Row[] = [
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
	return { selectedSession, events, sessionModelRuns, journey };
}

async function selectedPersonData(
	db: App.Locals['analyticsDb'],
	actorKey: string,
	filters: AnalyticsFilters
): Promise<{ selectedPerson: Row | null; personSessions: Row[]; personSequences: Row[] }> {
	if (!actorKey) return { selectedPerson: null, personSessions: [], personSequences: [] };
	const historyScope = sessionScope(filters, {
		omit: ['traffic', 'identity', 'country', 'search', 'path']
	});
	const params = [...historyScope.params, actorKey];
	const [personRows, personSessions, pageRows] = await Promise.all([
		queryRows<Row>(
			db,
			`${ENRICHED_SESSIONS_CTE},
			person_history AS (
				SELECT
					s.*,
					ROW_NUMBER() OVER (
						PARTITION BY s.actor_key ORDER BY s.last_seen_at DESC
					) AS actor_rank
				FROM enriched_sessions s
				WHERE ${historyScope.sql} AND s.actor_key = ?
			)
			SELECT
				s.actor_key, s.actor_kind, MAX(s.effective_user_id) AS user_id,
				MAX(s.effective_user_email) AS user_email, MAX(s.effective_user_name) AS user_name,
				MIN(s.started_at) AS first_seen_at, MAX(s.last_seen_at) AS last_seen_at,
				COUNT(*) AS sessions, SUM(s.page_view_count) AS page_views,
				SUM(s.engaged_ms) AS engaged_ms,
				MAX(CASE WHEN s.actor_rank = 1 THEN s.effective_traffic_class END)
					AS traffic_class,
				MAX(CASE WHEN s.actor_rank = 1 THEN s.effective_traffic_source END)
					AS traffic_source,
				MAX(CASE WHEN s.actor_rank = 1 THEN s.traffic_note END) AS traffic_note
			FROM person_history s
			GROUP BY s.actor_key, s.actor_kind`,
			params
		),
		queryRows<Row>(
			db,
			`${ENRICHED_SESSIONS_CTE}
			SELECT ${SESSION_LIST_COLUMNS}
			FROM enriched_sessions s
			WHERE ${historyScope.sql} AND s.actor_key = ?
			ORDER BY s.last_seen_at DESC LIMIT 100`,
			params
		),
		queryRows<Row>(
			db,
			`${ENRICHED_SESSIONS_CTE},
			person_page_views AS (
				SELECT
					e.session_id, e.path, e.client_timestamp_ms,
					ROW_NUMBER() OVER (
						PARTITION BY e.session_id
						ORDER BY e.client_timestamp_ms ASC, e.sequence_number ASC
					) AS page_rank
				FROM analytics_events e
				JOIN enriched_sessions s ON s.session_id = e.session_id
				WHERE ${historyScope.sql} AND s.actor_key = ? AND e.event_type = 'page_view'
			)
			SELECT session_id, path, client_timestamp_ms
			FROM person_page_views
			WHERE page_rank <= 80
			ORDER BY client_timestamp_ms ASC LIMIT 8000`,
			params
		)
	]);
	const sequenceBySession = new Map(
		buildSessionSequences(pageRows).map((sequence) => [sequence.sessionId, sequence.label])
	);
	return {
		selectedPerson: personRows[0] ?? null,
		personSessions: personSessions.map((session) => ({
			...session,
			path_sequence: sequenceBySession.get(String(session.session_id)) ?? 'No page views'
		})),
		personSequences: buildSessionSequences(pageRows).map((sequence) => ({
			session_id: sequence.sessionId,
			path_sequence: sequence.label
		}))
	};
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const filters = parseAnalyticsFilters(url);
	const selectedSessionId = (url.searchParams.get('session') || '').trim().slice(0, 96);
	const selectedPersonKey = (url.searchParams.get('person') || '').trim().slice(0, 180);
	const selectedRunId = (url.searchParams.get('run') || '').trim().slice(0, 96);
	const scope = sessionScope(filters);
	const trafficScope = sessionScope(filters, { omit: ['traffic'] });
	const countryScope = sessionScope(filters, { omit: ['country'] });

	const commonQueries = Promise.all([
		queryRows<Row>(
			locals.analyticsDb,
			`${ENRICHED_SESSIONS_CTE}
			SELECT
				COUNT(*) AS sessions,
				COUNT(DISTINCT s.actor_key) AS profiles,
				COUNT(DISTINCT CASE WHEN s.actor_kind = 'user' THEN s.actor_key END) AS authenticated_users,
				COUNT(DISTINCT CASE WHEN s.actor_kind = 'anonymous' THEN s.actor_key END) AS anonymous_browsers,
				COALESCE(SUM(s.page_view_count), 0) AS page_views,
				COALESCE(SUM(s.engaged_ms), 0) AS engaged_ms,
				COALESCE(SUM(CASE
					WHEN s.engaged_ms >= 10000 OR s.page_view_count >= 2 THEN 1
					ELSE 0
				END), 0) AS engaged_sessions,
				COALESCE(SUM(CASE WHEN EXISTS (
					SELECT 1 FROM analytics_events practice_event
					WHERE practice_event.session_id = s.session_id
						AND practice_event.event_type = 'page_view'
						AND practice_event.path LIKE '%/practice%'
				) THEN 1 ELSE 0 END), 0) AS practice_sessions
			FROM enriched_sessions s WHERE ${scope.sql}`,
			scope.params
		),
		queryRows<Row>(
			locals.analyticsDb,
			`${ENRICHED_SESSIONS_CTE}
			SELECT
				s.effective_traffic_class AS traffic_class,
				COUNT(*) AS sessions,
				COUNT(DISTINCT s.actor_key) AS profiles,
				COALESCE(SUM(s.page_view_count), 0) AS page_views
			FROM enriched_sessions s
			WHERE ${trafficScope.sql}
			GROUP BY s.effective_traffic_class
			ORDER BY sessions DESC`,
			trafficScope.params
		),
		queryRows<Row>(
			locals.analyticsDb,
			countryAggregationSql(countryScope.sql),
			countryScope.params
		)
	]);

	const overviewQueries =
		filters.view === 'overview'
			? Promise.all([
					queryRows<Row>(
						locals.analyticsDb,
						`${ENRICHED_SESSIONS_CTE}
						SELECT
							SUBSTR(s.last_seen_at, 1, 10) AS day,
							COUNT(*) AS sessions,
							COUNT(DISTINCT s.actor_key) AS profiles,
							SUM(CASE WHEN s.engaged_ms >= 10000 OR s.page_view_count >= 2 THEN 1 ELSE 0 END)
								AS engaged_sessions
						FROM enriched_sessions s
						WHERE ${scope.sql}
						GROUP BY day ORDER BY day ASC`,
						scope.params
					),
					queryRows<Row>(
						locals.analyticsDb,
						`${ENRICHED_SESSIONS_CTE}
						SELECT
							COUNT(*) AS scoped_sessions,
							SUM(CASE WHEN EXISTS (
								SELECT 1 FROM analytics_events e
								WHERE e.session_id = s.session_id AND e.event_type = 'page_view'
									AND e.path LIKE '/questions/%'
									AND e.path NOT LIKE '/questions/%/%'
							) THEN 1 ELSE 0 END) AS question,
							SUM(CASE WHEN EXISTS (
								SELECT 1 FROM analytics_events e
								WHERE e.session_id = s.session_id AND e.event_type = 'page_view'
									AND e.path LIKE '/questions/%/answer-chain'
							) THEN 1 ELSE 0 END) AS answer_chain,
							SUM(CASE WHEN EXISTS (
								SELECT 1 FROM analytics_events e
								WHERE e.session_id = s.session_id AND e.event_type = 'page_view'
									AND e.path LIKE '/constellations/%'
							) THEN 1 ELSE 0 END) AS constellation,
							SUM(CASE WHEN EXISTS (
								SELECT 1 FROM analytics_events e
								WHERE e.session_id = s.session_id AND e.event_type = 'page_view'
									AND e.path LIKE '%/practice%'
							) THEN 1 ELSE 0 END) AS practice,
							SUM(CASE WHEN EXISTS (
								SELECT 1 FROM analytics_model_runs m
								WHERE m.session_id = s.session_id AND m.status = 'success'
									AND m.feature IN (
										'question_answer_grading',
										'english_step_grading',
										'experiment_question_grading'
									)
							) THEN 1 ELSE 0 END) AS checked
						FROM enriched_sessions s WHERE ${scope.sql}`,
						scope.params
					),
					queryRows<Row>(
						locals.analyticsDb,
						`${ENRICHED_SESSIONS_CTE}
						SELECT
							COALESCE(s.initial_path, '/') AS path,
							COUNT(*) AS sessions,
							COUNT(DISTINCT s.actor_key) AS profiles
						FROM enriched_sessions s
						WHERE ${scope.sql}
						GROUP BY path ORDER BY sessions DESC LIMIT 8`,
						scope.params
					),
					queryRows<Row>(
						locals.analyticsDb,
						countryAggregationSql(scope.sql, 40),
						scope.params
					),
					filters.search
						? Promise.resolve([] as Row[])
						: queryRows<Row>(
								locals.analyticsDb,
								`SELECT
							summary_id, status, environment, window_days, traffic_scope, identity_scope,
							country_scope, path_scope, created_at, completed_at, duration_ms, model,
							summary_markdown, error_message
						FROM analytics_ai_summaries
						WHERE environment = ? AND window_days = ? AND traffic_scope = ?
							AND identity_scope = ? AND COALESCE(country_scope, '') = ?
							AND COALESCE(path_scope, '') = ?
						ORDER BY created_at DESC LIMIT 1`,
									[
										filters.environment,
										filters.days,
										filters.traffic,
										filters.identity,
										filters.country,
										filters.path
									]
								)
				])
			: Promise.resolve([[], [], [], [], []] as Row[][]);

	const listLimit = filters.view === 'journeys' ? 120 : filters.view === 'overview' ? 12 : 0;
	const sessionListPromise = listLimit
		? queryRows<Row>(
				locals.analyticsDb,
				`${ENRICHED_SESSIONS_CTE}
				SELECT ${SESSION_LIST_COLUMNS}
				FROM enriched_sessions s
				WHERE ${scope.sql}
				ORDER BY s.last_seen_at DESC LIMIT ${listLimit}`,
				scope.params
			)
		: Promise.resolve([]);
	const pathRowsPromise =
		filters.view === 'overview' || filters.view === 'journeys'
			? queryRows<Row>(
					locals.analyticsDb,
					`${ENRICHED_SESSIONS_CTE}
					SELECT e.session_id, e.path, e.client_timestamp_ms
					FROM analytics_events e
					JOIN enriched_sessions s ON s.session_id = e.session_id
					WHERE ${scope.sql} AND e.event_type = 'page_view'
					ORDER BY s.last_seen_at DESC, e.client_timestamp_ms ASC LIMIT 7000`,
					scope.params
				)
			: Promise.resolve([]);

	const peoplePromise =
		filters.view === 'people'
			? queryRows<Row>(
					locals.analyticsDb,
					`${ENRICHED_SESSIONS_CTE},
					ranked_people_sessions AS (
						SELECT
							s.*,
							ROW_NUMBER() OVER (
								PARTITION BY s.actor_key ORDER BY s.last_seen_at DESC
							) AS actor_rank
						FROM enriched_sessions s
						WHERE ${scope.sql}
					)
					SELECT
						s.actor_key, s.actor_kind, MAX(s.effective_user_id) AS user_id,
						MAX(s.effective_user_email) AS user_email,
						MAX(s.effective_user_name) AS user_name,
						MIN(s.started_at) AS first_seen_at, MAX(s.last_seen_at) AS last_seen_at,
						COUNT(*) AS sessions, SUM(s.page_view_count) AS page_views,
						SUM(s.engaged_ms) AS engaged_ms,
						COUNT(DISTINCT SUBSTR(s.started_at, 1, 10)) AS active_days,
						MAX(CASE WHEN s.actor_rank = 1 THEN s.country END) AS country,
						MAX(CASE WHEN s.actor_rank = 1 THEN s.region END) AS region,
						MAX(CASE WHEN s.actor_rank = 1 THEN s.device_type END) AS device_type,
						MAX(CASE WHEN s.actor_rank = 1 THEN s.initial_path END) AS recent_entry,
						MAX(CASE WHEN s.actor_rank = 1 THEN s.effective_traffic_class END)
							AS traffic_class,
						MAX(CASE WHEN s.actor_rank = 1 THEN s.effective_traffic_source END)
							AS traffic_source,
						MAX(CASE WHEN s.actor_rank = 1 THEN s.traffic_note END) AS traffic_note
					FROM ranked_people_sessions s
					GROUP BY s.actor_key, s.actor_kind
					ORDER BY last_seen_at DESC LIMIT 200`,
					scope.params
				)
			: Promise.resolve([]);

	const model = modelScope(filters);
	const modelQueries =
		filters.view === 'models'
			? Promise.all([
					queryRows<Row>(
						locals.analyticsDb,
						`${ENRICHED_SESSIONS_CTE}
						SELECT
							COUNT(*) AS runs,
							SUM(CASE WHEN m.status = 'success' THEN 1 ELSE 0 END) AS successes,
							SUM(CASE WHEN m.status <> 'success' THEN 1 ELSE 0 END) AS failures,
							ROUND(AVG(m.duration_ms), 0) AS average_duration_ms,
							COALESCE(SUM(m.cost_usd), 0) AS cost_usd
						FROM analytics_model_runs m
						LEFT JOIN enriched_sessions s ON s.session_id = m.session_id
						WHERE ${model.sql}`,
						model.params
					),
					queryRows<Row>(
						locals.analyticsDb,
						`${ENRICHED_SESSIONS_CTE}
						SELECT
							m.feature, COUNT(*) AS runs,
							SUM(CASE WHEN m.status <> 'success' THEN 1 ELSE 0 END) AS failures,
							ROUND(AVG(m.duration_ms), 0) AS average_duration_ms
						FROM analytics_model_runs m
						LEFT JOIN enriched_sessions s ON s.session_id = m.session_id
						WHERE ${model.sql}
						GROUP BY m.feature ORDER BY runs DESC`,
						model.params
					),
					queryRows<Row>(
						locals.analyticsDb,
						`${ENRICHED_SESSIONS_CTE}
						SELECT
							m.run_id, m.session_id, m.anonymous_id, m.user_id, m.user_email,
							m.feature, m.path, m.model, m.model_version, m.thinking_level, m.status,
							m.started_at, m.completed_at, m.duration_ms, m.cost_usd,
							m.error_name, m.error_message, m.environment,
							COALESCE(s.effective_traffic_class,
								CASE WHEN m.environment <> 'production' THEN 'internal_test' ELSE 'unknown' END
							) AS traffic_class
						FROM analytics_model_runs m
						LEFT JOIN enriched_sessions s ON s.session_id = m.session_id
						WHERE ${model.sql}
						ORDER BY m.started_at DESC LIMIT 150`,
						model.params
					)
				])
			: Promise.resolve([[], [], []] as Row[][]);

	const [
		[summaryRows, trafficBreakdown, countryOptions],
		[dailyTrend, milestoneRows, topEntries, locations, latestSummaries],
		sessions,
		pathRows,
		people,
		[modelSummaryRows, modelFeatures, modelRuns],
		sessionDetail,
		personDetail,
		selectedRunRows
	] = await Promise.all([
		commonQueries,
		overviewQueries,
		sessionListPromise,
		pathRowsPromise,
		peoplePromise,
		modelQueries,
		selectedSessionData(locals.analyticsDb, selectedSessionId),
		selectedPersonData(locals.analyticsDb, selectedPersonKey, filters),
		selectedRunId
			? queryRows<Row>(
					locals.analyticsDb,
					`SELECT
						run_id, session_id, anonymous_id, user_id, user_email, user_name,
						environment, app_version, feature, route_id, path, model, model_version,
						thinking_level, status, started_at, completed_at, duration_ms, prompt_text,
						model_input_json, output_text, reasoning_text, usage_json, cost_usd,
						error_name, error_message, metadata_json, cf_json
					FROM analytics_model_runs WHERE run_id = ? LIMIT 1`,
					[selectedRunId]
				)
			: Promise.resolve([])
	]);

	const sequences = buildSessionSequences(pathRows);
	const sequenceBySession = new Map(
		sequences.map((sequence) => [sequence.sessionId, sequence.label])
	);
	const sessionsWithPaths = sessions.map((session) => ({
		...session,
		session_id: session.session_id,
		path_sequence: sequenceBySession.get(String(session.session_id)) ?? 'No page views'
	}));
	const allTrafficSessions = trafficBreakdown.reduce(
		(sum, row) => sum + Number(row.sessions || 0),
		0
	);
	const excludedSessions = Math.max(
		0,
		allTrafficSessions - Number(summaryRows[0]?.sessions || 0)
	);

	return {
		adminIdentity: locals.adminIdentity,
		adminUser: locals.adminUser,
		filters,
		summary: summaryRows[0] ?? {
			sessions: 0,
			profiles: 0,
			authenticated_users: 0,
			anonymous_browsers: 0,
			page_views: 0,
			engaged_ms: 0,
			engaged_sessions: 0,
			practice_sessions: 0
		},
		trafficBreakdown,
		excludedSessions,
		countryOptions,
		dailyTrend,
		milestones: milestoneRows[0] ?? null,
		topEntries,
		locations,
		topJourneyPatterns: topJourneyPatterns(sequences),
		latestSummary: latestSummaries[0] ?? null,
		sessions: sessionsWithPaths,
		people,
		modelSummary: modelSummaryRows[0] ?? {
			runs: 0,
			successes: 0,
			failures: 0,
			average_duration_ms: 0,
			cost_usd: 0
		},
		modelFeatures,
		modelRuns,
		...sessionDetail,
		...personDetail,
		selectedRun: selectedRunRows[0] ?? null
	};
};

async function hash(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const actions: Actions = {
	classifyActor: async ({ request, locals }) => {
		const form = await request.formData();
		const actorKey = String(form.get('actorKey') || '').trim();
		const classification = String(form.get('classification') || '');
		const note = String(form.get('note') || '')
			.trim()
			.slice(0, 200);
		if (!/^(?:user|anon):[a-zA-Z0-9_-]{1,128}$/.test(actorKey)) {
			return { saved: false, message: 'The person identifier is invalid.' };
		}
		if (!['human', 'internal_test', 'clear'].includes(classification)) {
			return { saved: false, message: 'The traffic classification is invalid.' };
		}
		const now = new Date().toISOString();
		if (classification === 'clear') {
			await executeQuery(locals.analyticsDb, 'DELETE FROM analytics_actor_labels WHERE actor_key = ?', [
				actorKey
			]);
		} else {
			await executeQuery(
				locals.analyticsDb,
				`INSERT INTO analytics_actor_labels (
					actor_key, classification, note, created_by, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(actor_key) DO UPDATE SET
					classification = excluded.classification,
					note = excluded.note,
					created_by = excluded.created_by,
					updated_at = excluded.updated_at`,
				[actorKey, classification, note || null, locals.adminIdentity, now, now]
			);
		}
		await executeQuery(
			locals.analyticsDb,
			`INSERT INTO analytics_admin_audit (
				audit_id, action, scope, target_hash, requested_by, created_at, metadata_json
			) VALUES (?, 'traffic-classification', 'actor', ?, ?, ?, ?)`,
			[
				crypto.randomUUID(),
				await hash(actorKey),
				locals.adminIdentity,
				now,
				JSON.stringify({ classification })
			]
		);
		return { saved: true, actorKey, classification };
	}
};
