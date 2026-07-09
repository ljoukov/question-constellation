import { env } from '$env/dynamic/private';
import { PERSONAL_DB_DATABASE_ID, QUESTION_DB_DATABASE_ID } from './cloudflareConfig';
import { getPersonalDb, getQuestionDb, type QuestionDbBinding } from './bindings';

export type SqlParam = string | number | null;

export type QueryRowsResult<T> = {
	results: T[];
	meta: D1QueryMetadata | null;
	elapsedMs: number;
};

export type D1QueryMetadata = {
	duration?: number;
	timings?: {
		sql_duration_ms?: number;
	};
	rows_read?: number;
	rows_written?: number;
	served_by?: string;
	served_by_region?: string;
	served_by_colo?: string;
	total_attempts?: number;
	[key: string]: unknown;
};

type D1RestQueryResult<T> = {
	success?: boolean;
	results?: T[];
	meta?: D1QueryMetadata;
};

type D1RestResponse<T> = {
	success: boolean;
	errors?: unknown[];
	messages?: unknown[];
	result?: D1RestQueryResult<T>[] | D1RestQueryResult<T>;
};

type DatabaseRole = 'question' | 'personal';

function getLocalApiToken() {
	return env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN;
}

function getLocalD1Config(role: DatabaseRole) {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = getLocalApiToken();
	const databaseId =
		role === 'personal'
			? env.PERSONAL_DB_DATABASE_ID || PERSONAL_DB_DATABASE_ID
			: env.QUESTION_DB_DATABASE_ID || QUESTION_DB_DATABASE_ID;

	if (!accountId || !apiToken || !databaseId) {
		throw new Error(
			`${role === 'personal' ? 'PERSONAL_DB' : 'QUESTION_DB'} binding is unavailable and local D1 REST credentials are not configured.`
		);
	}

	return { accountId, apiToken, databaseId };
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function numericEnv(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function summarizeSql(sql: string): string {
	const normalized = normalizeWhitespace(sql);
	if (normalized.length <= 160) return normalized;
	return `${normalized.slice(0, 157)}...`;
}

function logQueryIfNeeded(
	role: DatabaseRole,
	sql: string,
	params: SqlParam[],
	meta: D1QueryMetadata | null,
	elapsedMs: number
) {
	const slowThresholdMs = numericEnv(env.DB_QUERY_LOG_THRESHOLD_MS, 750);
	const scanThresholdRows = numericEnv(env.DB_QUERY_ROWS_READ_LOG_THRESHOLD, 1000);
	const rowsRead = typeof meta?.rows_read === 'number' ? meta.rows_read : null;
	const sqlDurationMs =
		typeof meta?.timings?.sql_duration_ms === 'number'
			? meta.timings.sql_duration_ms
			: typeof meta?.duration === 'number'
				? meta.duration
				: null;
	const shouldLog =
		elapsedMs >= slowThresholdMs || (rowsRead !== null && rowsRead >= scanThresholdRows);

	if (!shouldLog) return;

	console.info(
		'[db] read query',
		JSON.stringify({
			elapsedMs,
			sqlDurationMs,
			rowsRead,
			rowsWritten: meta?.rows_written ?? null,
			servedBy: meta?.served_by ?? null,
			region: meta?.served_by_region ?? null,
			colo: meta?.served_by_colo ?? null,
			database: role,
			params: params.length,
			sql: summarizeSql(sql)
		})
	);
}

async function fetchD1WithRetry(url: string, init: RequestInit) {
	const maxAttempts = 4;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			const response = await fetch(url, init);
			if (response.status < 500 || attempt === maxAttempts) return response;
		} catch (error) {
			if (attempt === maxAttempts) throw error;
		}
		await sleep(600 * attempt);
	}
	throw new Error('D1 REST query failed after retries.');
}

function normalizeD1Results<T>(response: D1RestResponse<T>): {
	results: T[];
	meta: D1QueryMetadata | null;
} {
	if (!response.success) {
		throw new Error(`D1 REST query failed: ${JSON.stringify(response.errors ?? response)}`);
	}

	const result = Array.isArray(response.result) ? response.result[0] : response.result;
	if (result?.success === false) {
		throw new Error(`D1 REST statement failed: ${JSON.stringify(result)}`);
	}

	return {
		results: result?.results ?? [],
		meta: result?.meta ?? null
	};
}

async function queryRowsWithMetaFromDb<T extends Record<string, unknown>>(
	role: DatabaseRole,
	db: QuestionDbBinding | undefined,
	sql: string,
	params: SqlParam[] = []
): Promise<QueryRowsResult<T>> {
	const startedAt = Date.now();

	if (db) {
		let statement = db.prepare(sql);
		if (params.length > 0) {
			statement = statement.bind(...params);
		}
		const result = await statement.all<T>();
		const elapsedMs = Date.now() - startedAt;
		const meta = (result.meta ?? null) as D1QueryMetadata | null;
		logQueryIfNeeded(role, sql, params, meta, elapsedMs);
		return { results: result.results ?? [], meta, elapsedMs };
	}

	const { accountId, apiToken, databaseId } = getLocalD1Config(role);
	const response = await fetchD1WithRetry(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ sql, params })
		}
	);
	const bodyText = await response.text();

	if (!response.ok) {
		throw new Error(`D1 REST query failed: ${response.status} ${response.statusText}: ${bodyText}`);
	}

	const normalized = normalizeD1Results<T>(JSON.parse(bodyText) as D1RestResponse<T>);
	const elapsedMs = Date.now() - startedAt;
	logQueryIfNeeded(role, sql, params, normalized.meta, elapsedMs);
	return { ...normalized, elapsedMs };
}

export async function queryRowsWithMeta<T extends Record<string, unknown>>(
	sql: string,
	params: SqlParam[] = []
): Promise<QueryRowsResult<T>> {
	return await queryRowsWithMetaFromDb('question', getQuestionDb(), sql, params);
}

export async function queryPersonalRowsWithMeta<T extends Record<string, unknown>>(
	sql: string,
	params: SqlParam[] = []
): Promise<QueryRowsResult<T>> {
	return await queryRowsWithMetaFromDb('personal', getPersonalDb(), sql, params);
}

export async function queryRows<T extends Record<string, unknown>>(
	sql: string,
	params: SqlParam[] = []
): Promise<T[]> {
	return (await queryRowsWithMeta<T>(sql, params)).results;
}

export async function queryPersonalRows<T extends Record<string, unknown>>(
	sql: string,
	params: SqlParam[] = []
): Promise<T[]> {
	return (await queryPersonalRowsWithMeta<T>(sql, params)).results;
}

async function executeQueryForDb(
	role: DatabaseRole,
	db: QuestionDbBinding | undefined,
	sql: string,
	params: SqlParam[] = []
): Promise<void> {
	if (db) {
		let statement = db.prepare(sql);
		if (params.length > 0) {
			statement = statement.bind(...params);
		}
		await statement.run();
		return;
	}

	const { accountId, apiToken, databaseId } = getLocalD1Config(role);
	const response = await fetchD1WithRetry(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({ sql, params })
		}
	);
	const bodyText = await response.text();

	if (!response.ok) {
		throw new Error(`D1 REST query failed: ${response.status} ${response.statusText}: ${bodyText}`);
	}

	normalizeD1Results<Record<string, unknown>>(
		JSON.parse(bodyText) as D1RestResponse<Record<string, unknown>>
	);
}

export async function executeQuery(sql: string, params: SqlParam[] = []): Promise<void> {
	await executeQueryForDb('question', getQuestionDb(), sql, params);
}

export async function executePersonalQuery(sql: string, params: SqlParam[] = []): Promise<void> {
	await executeQueryForDb('personal', getPersonalDb(), sql, params);
}

export async function queryFirst<T extends Record<string, unknown>>(
	sql: string,
	params: SqlParam[] = []
): Promise<T | null> {
	const rows = await queryRows<T>(sql, params);
	return rows[0] ?? null;
}

export async function queryPersonalFirst<T extends Record<string, unknown>>(
	sql: string,
	params: SqlParam[] = []
): Promise<T | null> {
	const rows = await queryPersonalRows<T>(sql, params);
	return rows[0] ?? null;
}
