import { env } from '$env/dynamic/private';
import { QUESTION_DB_DATABASE_ID } from './cloudflareConfig';
import { getQuestionDb } from './bindings';

export type SqlParam = string | number | null;

type D1RestQueryResult<T> = {
	success?: boolean;
	results?: T[];
	meta?: unknown;
};

type D1RestResponse<T> = {
	success: boolean;
	errors?: unknown[];
	messages?: unknown[];
	result?: D1RestQueryResult<T>[] | D1RestQueryResult<T>;
};

function getLocalApiToken() {
	return env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN;
}

function getLocalD1Config() {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = getLocalApiToken();
	const databaseId = env.QUESTION_DB_DATABASE_ID || QUESTION_DB_DATABASE_ID;

	if (!accountId || !apiToken || !databaseId) {
		throw new Error(
			'QUESTION_DB binding is unavailable and local D1 REST credentials are not configured.'
		);
	}

	return { accountId, apiToken, databaseId };
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

function normalizeD1Results<T>(response: D1RestResponse<T>): T[] {
	if (!response.success) {
		throw new Error(`D1 REST query failed: ${JSON.stringify(response.errors ?? response)}`);
	}

	const result = Array.isArray(response.result) ? response.result[0] : response.result;
	if (result?.success === false) {
		throw new Error(`D1 REST statement failed: ${JSON.stringify(result)}`);
	}

	return result?.results ?? [];
}

export async function queryRows<T extends Record<string, unknown>>(
	sql: string,
	params: SqlParam[] = []
): Promise<T[]> {
	const db = getQuestionDb();

	if (db) {
		let statement = db.prepare(sql);
		if (params.length > 0) {
			statement = statement.bind(...params);
		}
		const result = await statement.all<T>();
		return result.results ?? [];
	}

	const { accountId, apiToken, databaseId } = getLocalD1Config();
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

	return normalizeD1Results<T>(JSON.parse(bodyText) as D1RestResponse<T>);
}

export async function queryFirst<T extends Record<string, unknown>>(
	sql: string,
	params: SqlParam[] = []
): Promise<T | null> {
	const rows = await queryRows<T>(sql, params);
	return rows[0] ?? null;
}
