import { dev, version } from '$app/environment';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { ANALYTICS_DB_DATABASE_ID } from './cloudflareConfig';
import type { AnalyticsBatchPayload, AnalyticsEventPayload } from '$lib/analytics/types';
import type { AdminUser } from './auth/session';

type AnalyticsDb = D1Database | D1DatabaseSession;
type SqlStatement = { sql: string; params: Array<string | number | null> };

const SENSITIVE_HEADERS = new Set([
	'authorization',
	'cookie',
	'cf-access-jwt-assertion',
	'proxy-authorization',
	'x-api-key'
]);

function text(value: unknown, maximum: number): string | null {
	if (typeof value !== 'string') return null;
	return value.slice(0, maximum);
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function decimal(value: unknown, minimum = 0, maximum = 100): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	return Math.min(maximum, Math.max(minimum, value));
}

function safeJson(value: unknown, maximum = 32_000): string | null {
	if (value === undefined || value === null) return null;
	try {
		return JSON.stringify(value).slice(0, maximum);
	} catch {
		return null;
	}
}

function identifier(value: unknown): string | null {
	const normalized = text(value, 96);
	return normalized && /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : null;
}

function requestHeaders(request: Request): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [name, value] of request.headers) {
		if (!SENSITIVE_HEADERS.has(name.toLowerCase())) result[name] = value.slice(0, 4_000);
	}
	return result;
}

function cfValue(cf: IncomingRequestCfProperties | undefined, key: string): string | null {
	const value = cf?.[key as keyof IncomingRequestCfProperties];
	return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function eventParams(
	event: AnalyticsEventPayload,
	identity: {
		requestId: string;
		sessionId: string;
		anonymousId: string;
		user: AdminUser | null;
		receivedAt: string;
		environment: string;
		appVersion: string | null;
	}
): Array<string | number | null> {
	const timestamp = integer(event.timestamp, 0) ?? Date.now();
	return [
		identifier(event.eventId),
		identity.requestId,
		identity.sessionId,
		identity.anonymousId,
		identity.user?.uid ?? null,
		identity.user?.email ?? null,
		identity.user?.name ?? null,
		text(event.type, 64),
		timestamp,
		new Date(timestamp).toISOString(),
		identity.receivedAt,
		integer(event.sequence, 0),
		identifier(event.pageViewId),
		text(event.url, 4_000),
		text(event.path, 1_000),
		text(event.query, 2_000),
		text(event.title, 1_000),
		text(event.referrer, 4_000),
		integer(event.durationMs, 0, 86_400_000),
		integer(event.engagedMs, 0, 86_400_000),
		decimal(event.scrollDepthPercent),
		text(event.element?.tag, 64),
		text(event.element?.id, 256),
		text(event.element?.classes, 1_000),
		text(event.element?.text, 2_000),
		text(event.element?.role, 128),
		text(event.element?.name, 512),
		text(event.element?.href, 4_000),
		text(event.element?.selector, 2_000),
		text(event.input?.name, 512),
		text(event.input?.type, 128),
		text(event.input?.value, 12_000),
		text(event.input?.previousValue, 12_000),
		event.input?.redacted ? 1 : 0,
		safeJson(event.properties),
		identity.environment,
		identity.appVersion
	];
}

const INSERT_EVENT_SQL = `
	INSERT OR IGNORE INTO analytics_events (
		event_id, request_id, session_id, anonymous_id, user_id, user_email, user_name,
		event_type, client_timestamp_ms, occurred_at, received_at, sequence_number,
		page_view_id, url, path, query_string, title, referrer, duration_ms, engaged_ms,
		scroll_depth_percent, element_tag, element_id, element_classes, element_text,
		element_role, element_name, element_href, element_selector, input_name, input_type,
		input_value, previous_value, is_redacted, properties_json, environment, app_version
	) VALUES (${Array.from({ length: 37 }, () => '?').join(', ')})`;

async function executeRest(statements: SqlStatement[]) {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN;
	const databaseId = env.ANALYTICS_DB_DATABASE_ID || ANALYTICS_DB_DATABASE_ID;
	if (!accountId || !apiToken || !databaseId) {
		throw new Error('ANALYTICS_DB binding and local D1 REST credentials are unavailable.');
	}

	for (const statement of statements) {
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(statement)
			}
		);
		if (!response.ok) {
			throw new Error(`Analytics D1 query failed (${response.status}): ${await response.text()}`);
		}
		const body = (await response.json()) as { success?: boolean; errors?: unknown[] };
		if (!body.success) throw new Error(`Analytics D1 query failed: ${JSON.stringify(body.errors)}`);
	}
}

async function executeStatements(db: AnalyticsDb | null, statements: SqlStatement[]) {
	if (!db || dev) return await executeRest(statements);
	await db.batch(
		statements.map(({ sql, params }) => {
			let statement = db.prepare(sql);
			if (params.length) statement = statement.bind(...params);
			return statement;
		})
	);
}

export function parseAnalyticsBatch(value: unknown): AnalyticsBatchPayload | null {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Partial<AnalyticsBatchPayload>;
	const sessionId = identifier(candidate.sessionId);
	const anonymousId = identifier(candidate.anonymousId);
	if (!sessionId || !anonymousId || !Array.isArray(candidate.events)) return null;
	const events = candidate.events.slice(0, 50).filter((event): event is AnalyticsEventPayload => {
		if (!event || typeof event !== 'object') return false;
		return Boolean(identifier(event.eventId) && text(event.type, 64));
	});
	if (!events.length) return null;
	return { ...candidate, sessionId, anonymousId, events } as AnalyticsBatchPayload;
}

export async function recordAnalyticsBatch(args: {
	db: AnalyticsDb | null;
	request: Request;
	cf: IncomingRequestCfProperties | undefined;
	user: AdminUser | null;
	payload: AnalyticsBatchPayload;
}) {
	const { db, request, cf, user, payload } = args;
	const requestId = crypto.randomUUID();
	const receivedAt = new Date().toISOString();
	const environment = text(env.ANALYTICS_ENVIRONMENT, 64) || (dev ? 'development' : 'production');
	const appVersion = version || null;
	const first = payload.events[0];
	const firstClientTimestamp = Math.min(
		...payload.events.map((event) => integer(event.timestamp, 0) ?? Date.now())
	);
	const sessionStartedAt = new Date(firstClientTimestamp).toISOString();
	const headers = requestHeaders(request);
	const ipAddress =
		request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || null;
	const userAgent = request.headers.get('user-agent');
	const engagedMs = payload.events.reduce(
		(sum, event) => sum + (integer(event.engagedMs, 0, 86_400_000) ?? 0),
		0
	);
	const pageViews = payload.events.filter((event) => event.type === 'page_view').length;
	const context = payload.context ?? {};

	const sessionStatement: SqlStatement = {
		sql: `
			INSERT INTO analytics_sessions (
				session_id, anonymous_id, user_id, user_email, user_name, started_at, last_seen_at,
				initial_url, initial_path, initial_referrer, landing_title, ip_address, user_agent,
				accept_language, country, region, region_code, city, postal_code, timezone, colo,
				continent, latitude, longitude, asn, as_organization, browser_name, browser_version,
				operating_system, device_type, viewport_width, viewport_height, screen_width,
				screen_height, cf_json, request_headers_json, event_count, page_view_count, engaged_ms,
				environment, app_version, connection_effective_type, connection_downlink_mbps,
				connection_rtt_ms, connection_save_data, device_memory_gb, hardware_concurrency
			) VALUES (${Array.from({ length: 47 }, () => '?').join(', ')})
			ON CONFLICT(session_id) DO UPDATE SET
				last_seen_at = excluded.last_seen_at,
				user_id = COALESCE(excluded.user_id, analytics_sessions.user_id),
				user_email = COALESCE(excluded.user_email, analytics_sessions.user_email),
				user_name = COALESCE(excluded.user_name, analytics_sessions.user_name),
				ip_address = COALESCE(excluded.ip_address, analytics_sessions.ip_address),
				user_agent = COALESCE(excluded.user_agent, analytics_sessions.user_agent),
				country = COALESCE(excluded.country, analytics_sessions.country),
				region = COALESCE(excluded.region, analytics_sessions.region),
				city = COALESCE(excluded.city, analytics_sessions.city),
				timezone = COALESCE(excluded.timezone, analytics_sessions.timezone),
				colo = COALESCE(excluded.colo, analytics_sessions.colo),
				browser_name = COALESCE(excluded.browser_name, analytics_sessions.browser_name),
				browser_version = COALESCE(excluded.browser_version, analytics_sessions.browser_version),
				operating_system = COALESCE(excluded.operating_system, analytics_sessions.operating_system),
				device_type = COALESCE(excluded.device_type, analytics_sessions.device_type),
				viewport_width = COALESCE(excluded.viewport_width, analytics_sessions.viewport_width),
				viewport_height = COALESCE(excluded.viewport_height, analytics_sessions.viewport_height),
				screen_width = COALESCE(excluded.screen_width, analytics_sessions.screen_width),
				screen_height = COALESCE(excluded.screen_height, analytics_sessions.screen_height),
				cf_json = COALESCE(excluded.cf_json, analytics_sessions.cf_json),
				request_headers_json = COALESCE(excluded.request_headers_json, analytics_sessions.request_headers_json),
				environment = excluded.environment,
				app_version = COALESCE(excluded.app_version, analytics_sessions.app_version),
				connection_effective_type = COALESCE(excluded.connection_effective_type, analytics_sessions.connection_effective_type),
				connection_downlink_mbps = COALESCE(excluded.connection_downlink_mbps, analytics_sessions.connection_downlink_mbps),
				connection_rtt_ms = COALESCE(excluded.connection_rtt_ms, analytics_sessions.connection_rtt_ms),
				connection_save_data = COALESCE(excluded.connection_save_data, analytics_sessions.connection_save_data),
				device_memory_gb = COALESCE(excluded.device_memory_gb, analytics_sessions.device_memory_gb),
				hardware_concurrency = COALESCE(excluded.hardware_concurrency, analytics_sessions.hardware_concurrency),
				event_count = analytics_sessions.event_count + excluded.event_count,
				page_view_count = analytics_sessions.page_view_count + excluded.page_view_count,
				engaged_ms = analytics_sessions.engaged_ms + excluded.engaged_ms`,
		params: [
			payload.sessionId,
			payload.anonymousId,
			user?.uid ?? null,
			user?.email ?? null,
			user?.name ?? null,
			sessionStartedAt,
			receivedAt,
			text(first.url, 4_000),
			text(first.path, 1_000),
			text(first.referrer, 4_000),
			text(first.title, 1_000),
			ipAddress,
			userAgent,
			request.headers.get('accept-language'),
			cfValue(cf, 'country'),
			cfValue(cf, 'region'),
			cfValue(cf, 'regionCode'),
			cfValue(cf, 'city'),
			cfValue(cf, 'postalCode'),
			cfValue(cf, 'timezone'),
			cfValue(cf, 'colo'),
			cfValue(cf, 'continent'),
			cfValue(cf, 'latitude'),
			cfValue(cf, 'longitude'),
			integer(cf?.asn, 0),
			cfValue(cf, 'asOrganization'),
			text(context.browserName, 128),
			text(context.browserVersion, 128),
			text(context.operatingSystem, 256),
			text(context.deviceType, 64),
			integer(context.viewportWidth, 0, 100_000),
			integer(context.viewportHeight, 0, 100_000),
			integer(context.screenWidth, 0, 100_000),
			integer(context.screenHeight, 0, 100_000),
			safeJson(cf, 64_000),
			safeJson(headers, 64_000),
			payload.events.length,
			pageViews,
			engagedMs,
			environment,
			appVersion,
			text(context.connectionEffectiveType, 64),
			decimal(context.connectionDownlinkMbps, 0, 100_000),
			integer(context.connectionRttMs, 0, 1_000_000),
			context.connectionSaveData === undefined ? null : context.connectionSaveData ? 1 : 0,
			decimal(context.deviceMemoryGb, 0, 10_000),
			integer(context.hardwareConcurrency, 0, 10_000)
		]
	};

	const requestStatement: SqlStatement = {
		sql: `INSERT INTO analytics_requests (
			request_id, session_id, received_at, ip_address, user_agent, cf_ray, country, colo,
			cf_json, headers_json, event_count, environment, app_version
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		params: [
			requestId,
			payload.sessionId,
			receivedAt,
			ipAddress,
			userAgent,
			request.headers.get('cf-ray'),
			cfValue(cf, 'country'),
			cfValue(cf, 'colo'),
			safeJson(cf, 64_000),
			safeJson(headers, 64_000),
			payload.events.length,
			environment,
			appVersion
		]
	};

	const identity = {
		requestId,
		sessionId: payload.sessionId,
		anonymousId: payload.anonymousId,
		user,
		receivedAt,
		environment,
		appVersion
	};
	await executeStatements(db, [
		sessionStatement,
		requestStatement,
		...payload.events.map((event) => ({
			sql: INSERT_EVENT_SQL,
			params: eventParams(event, identity)
		}))
	]);
}

export type ModelAnalyticsCompletion = {
	modelVersion?: string | null;
	output?: string | null;
	reasoning?: string | null;
	usage?: unknown;
	costUsd?: number | null;
	metadata?: Record<string, unknown>;
};

export function startModelAnalytics(input: {
	feature: string;
	model: string;
	thinkingLevel?: string | null;
	prompt: string;
	modelInput?: unknown;
	metadata?: Record<string, unknown>;
}): {
	runId: string;
	complete: (completion: ModelAnalyticsCompletion) => void;
	fail: (error: unknown, completion?: ModelAnalyticsCompletion) => void;
} {
	const runId = crypto.randomUUID();
	const startedAt = new Date();
	const startedAtMs = Date.now();
	let finished = false;
	let requestEvent: ReturnType<typeof getRequestEvent> | null = null;
	try {
		requestEvent = getRequestEvent();
	} catch {
		// Model utilities also run in scripts and tests where no request exists.
	}

	const persist = (
		status: 'success' | 'error',
		completion: ModelAnalyticsCompletion,
		error?: unknown
	) => {
		if (finished || !requestEvent) return;
		finished = true;
		const completedAt = new Date();
		const request = requestEvent.request;
		const cf = requestEvent.platform?.cf;
		const user = requestEvent.locals.user;
		const environment = text(env.ANALYTICS_ENVIRONMENT, 64) || (dev ? 'development' : 'production');
		const errorValue = error instanceof Error ? error : error ? new Error(String(error)) : null;
		const statement: SqlStatement = {
			sql: `INSERT INTO analytics_model_runs (
				run_id, session_id, anonymous_id, user_id, user_email, user_name, environment,
				app_version, feature, route_id, path, model, model_version, thinking_level,
				status, started_at, completed_at, duration_ms, prompt_text, model_input_json,
				output_text, reasoning_text, usage_json, cost_usd, error_name, error_message,
				metadata_json, ip_address, user_agent, cf_json, request_headers_json
			) VALUES (${Array.from({ length: 31 }, () => '?').join(', ')})`,
			params: [
				runId,
				identifier(requestEvent.cookies.get('qc_sid')),
				identifier(requestEvent.cookies.get('qc_aid')),
				user?.uid ?? null,
				user?.email ?? null,
				user?.name ?? null,
				environment,
				version || null,
				text(input.feature, 128),
				text(requestEvent.route.id, 512),
				text(requestEvent.url.pathname, 1_000),
				text(input.model, 256),
				text(completion.modelVersion, 256),
				text(input.thinkingLevel, 128),
				status,
				startedAt.toISOString(),
				completedAt.toISOString(),
				Math.max(0, completedAt.getTime() - startedAtMs),
				text(input.prompt, 300_000),
				safeJson(input.modelInput, 300_000),
				text(completion.output, 300_000),
				text(completion.reasoning, 300_000),
				safeJson(completion.usage, 100_000),
				typeof completion.costUsd === 'number' ? completion.costUsd : null,
				errorValue?.name ?? null,
				text(errorValue?.message, 20_000),
				safeJson({ ...input.metadata, ...completion.metadata }, 100_000),
				request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip'),
				request.headers.get('user-agent'),
				safeJson(cf, 64_000),
				safeJson(requestHeaders(request), 64_000)
			]
		};
		const task = executeStatements(requestEvent.locals.analyticsDb, [statement]).catch(
			(writeError) => console.error('Model analytics could not be stored.', writeError)
		);
		if (requestEvent.platform?.ctx) requestEvent.platform.ctx.waitUntil(task);
		else void task;
	};

	return {
		runId,
		complete(completion) {
			persist('success', completion);
		},
		fail(error, completion = {}) {
			persist('error', completion, error);
		}
	};
}
