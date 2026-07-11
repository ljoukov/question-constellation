import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

const DATABASE_ID = 'd989edc1-26d8-4bd6-83f1-97b09c4d50a2';
type Param = string | number | null;
type AnalyticsDbSession = App.Locals['analyticsDb'];

export async function queryRows<T extends Record<string, unknown>>(
	db: AnalyticsDbSession,
	sql: string,
	params: Param[] = []
): Promise<T[]> {
	if (db && !dev) {
		let statement = db.prepare(sql);
		if (params.length) statement = statement.bind(...params);
		return (await statement.all<T>()).results ?? [];
	}

	const accountId = env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN;
	const databaseId = env.ANALYTICS_DB_DATABASE_ID || DATABASE_ID;
	if (!accountId || !apiToken)
		throw new Error('Local Cloudflare D1 credentials are not configured.');
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ sql, params })
		}
	);
	const body = (await response.json()) as {
		success?: boolean;
		errors?: unknown[];
		result?: Array<{ results?: T[]; success?: boolean }>;
	};
	if (!response.ok || !body.success || body.result?.[0]?.success === false) {
		throw new Error(`Analytics query failed: ${JSON.stringify(body.errors ?? body)}`);
	}
	return body.result?.[0]?.results ?? [];
}

export async function executeQuery(
	db: AnalyticsDbSession,
	sql: string,
	params: Param[] = []
): Promise<void> {
	if (db && !dev) {
		let statement = db.prepare(sql);
		if (params.length) statement = statement.bind(...params);
		await statement.run();
		return;
	}

	const accountId = env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN;
	const databaseId = env.ANALYTICS_DB_DATABASE_ID || DATABASE_ID;
	if (!accountId || !apiToken)
		throw new Error('Local Cloudflare D1 credentials are not configured.');
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ sql, params })
		}
	);
	const body = (await response.json()) as { success?: boolean; errors?: unknown[] };
	if (!response.ok || !body.success) {
		throw new Error(`Analytics write failed: ${JSON.stringify(body.errors ?? body)}`);
	}
}
