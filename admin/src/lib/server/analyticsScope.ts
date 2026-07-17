export type DashboardView = 'overview' | 'people' | 'journeys' | 'models';
export type EnvironmentScope = 'production' | 'development' | 'all';
export type TrafficScope = 'human' | 'bots' | 'internal_test' | 'unknown' | 'all';
export type IdentityScope = 'authenticated' | 'anonymous' | 'all';

export type AnalyticsFilters = {
	view: DashboardView;
	days: number;
	environment: EnvironmentScope;
	traffic: TrafficScope;
	identity: IdentityScope;
	country: string;
	search: string;
	path: string;
};

type Param = string | number | null;
type FilterKey = 'traffic' | 'country' | 'identity' | 'search' | 'path';

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function oneOf<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
	return values.includes(value as T) ? (value as T) : fallback;
}

export function parseAnalyticsFilters(url: URL): AnalyticsFilters {
	return {
		view: oneOf(url.searchParams.get('view'), ['overview', 'people', 'journeys', 'models'], 'overview'),
		days: positiveInteger(url.searchParams.get('days'), 30, 3650),
		environment: oneOf(
			url.searchParams.get('environment'),
			['production', 'development', 'all'],
			'production'
		),
		traffic: oneOf(
			url.searchParams.get('traffic'),
			['human', 'bots', 'internal_test', 'unknown', 'all'],
			'human'
		),
		identity: oneOf(
			url.searchParams.get('identity'),
			['authenticated', 'anonymous', 'all'],
			'all'
		),
		country: (url.searchParams.get('country') || '')
			.trim()
			.toUpperCase()
			.replace(/[^A-Z]/g, '')
			.slice(0, 2),
		search: (url.searchParams.get('q') || '').trim().slice(0, 200),
		path: (url.searchParams.get('path') || '').trim().slice(0, 500)
	};
}

export const ENRICHED_SESSIONS_CTE = `
WITH enriched_sessions AS (
	SELECT
		s.*,
		s.user_id AS effective_user_id,
		s.user_email AS effective_user_email,
		s.user_name AS effective_user_name,
		CASE
			WHEN s.user_id IS NOT NULL
				THEN 'user:' || s.user_id
			ELSE 'anon:' || s.anonymous_id
		END AS actor_key,
		CASE
			WHEN s.user_id IS NOT NULL THEN 'user'
			ELSE 'anonymous'
		END AS actor_kind,
		COALESCE(actor_label.classification, s.traffic_class, 'unknown') AS effective_traffic_class,
		CASE
			WHEN actor_label.classification IS NOT NULL THEN 'manual_override'
			ELSE s.traffic_source
		END AS effective_traffic_source,
		actor_label.note AS traffic_note
	FROM analytics_sessions s
	LEFT JOIN analytics_actor_labels actor_label ON actor_label.actor_key = CASE
		WHEN s.user_id IS NOT NULL
			THEN 'user:' || s.user_id
		ELSE 'anon:' || s.anonymous_id
	END
)`;

export function sessionScope(
	filters: AnalyticsFilters,
	options: { omit?: FilterKey[]; alias?: string } = {}
): { sql: string; params: Param[]; since: string } {
	const alias = options.alias ?? 's';
	const omitted = new Set(options.omit ?? []);
	const since = new Date(Date.now() - filters.days * 86_400_000).toISOString();
	const where = [`${alias}.last_seen_at >= ?`];
	const params: Param[] = [since];

	if (filters.environment !== 'all') {
		where.push(`${alias}.environment = ?`);
		params.push(filters.environment);
	}
	if (!omitted.has('traffic') && filters.traffic !== 'all') {
		if (filters.traffic === 'bots') {
			where.push(`${alias}.effective_traffic_class IN ('verified_bot', 'suspected_bot')`);
		} else {
			where.push(`${alias}.effective_traffic_class = ?`);
			params.push(filters.traffic);
		}
	}
	if (!omitted.has('identity') && filters.identity !== 'all') {
		where.push(`${alias}.actor_kind = ?`);
		params.push(filters.identity === 'authenticated' ? 'user' : 'anonymous');
	}
	if (!omitted.has('country') && filters.country) {
		where.push(`${alias}.country = ?`);
		params.push(filters.country);
	}
	if (!omitted.has('search') && filters.search) {
		const search = `%${filters.search}%`;
		where.push(`(
			${alias}.effective_user_email LIKE ? OR ${alias}.effective_user_name LIKE ? OR
			${alias}.effective_user_id LIKE ? OR ${alias}.anonymous_id LIKE ? OR
			${alias}.session_id LIKE ? OR ${alias}.initial_path LIKE ?
		)`);
		params.push(search, search, search, search, search, search);
	}
	if (!omitted.has('path') && filters.path) {
		where.push(`EXISTS (
			SELECT 1 FROM analytics_events path_event
			WHERE path_event.session_id = ${alias}.session_id AND path_event.path LIKE ?
		)`);
		params.push(`%${filters.path}%`);
	}

	return { sql: where.join(' AND '), params, since };
}

export function filterQueryString(
	filters: AnalyticsFilters,
	overrides: Record<string, string | number | null> = {}
): string {
	const params = new URLSearchParams();
	params.set('view', filters.view);
	params.set('days', String(filters.days));
	params.set('environment', filters.environment);
	params.set('traffic', filters.traffic);
	if (filters.identity !== 'all') params.set('identity', filters.identity);
	if (filters.country) params.set('country', filters.country);
	if (filters.search) params.set('q', filters.search);
	if (filters.path) params.set('path', filters.path);
	for (const [key, value] of Object.entries(overrides)) {
		if (value === null || value === '') params.delete(key);
		else params.set(key, String(value));
	}
	return params.toString();
}
