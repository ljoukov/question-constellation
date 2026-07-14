import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {string | number | boolean | null} D1Parameter */
/** @typedef {{ rootDir?: string, binding?: string }} D1QueryOptions */
/** @typedef {{ binding?: string, database_id?: string }} WranglerD1Database */
/** @typedef {{ d1_databases?: WranglerD1Database[] }} WranglerConfig */

/** @param {string} filePath */
export function loadDotEnvFile(filePath) {
	if (!existsSync(filePath)) return;
	for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
		if (!match) continue;
		const [, key, rawValue] = match;
		if (process.env[key] !== undefined) continue;
		let value = rawValue.trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		process.env[key] = value;
	}
}

/**
 * @param {string} [rootDir]
 * @returns {WranglerConfig}
 */
export function readWranglerConfig(rootDir = process.cwd()) {
	const wranglerPath = path.join(rootDir, 'wrangler.jsonc');
	if (!existsSync(wranglerPath)) return {};
	const raw = readFileSync(wranglerPath, 'utf8')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');
	return /** @type {WranglerConfig} */ (JSON.parse(raw));
}

/** @param {string} [rootDir] */
export function loadD1Env(rootDir = process.cwd()) {
	loadDotEnvFile(path.join(rootDir, '.env'));
	loadDotEnvFile(path.join(rootDir, '.env.local'));
}

/**
 * @param {string} [rootDir]
 * @param {string} [binding]
 */
export function d1Config(rootDir = process.cwd(), binding = 'QUESTION_DB') {
	loadD1Env(rootDir);
	const wranglerConfig = readWranglerConfig(rootDir);
	const databaseConfig = wranglerConfig.d1_databases?.find((db) => db.binding === binding);
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN;
	const databaseId = process.env[`${binding}_DATABASE_ID`] ?? databaseConfig?.database_id;
	if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required for D1 access.');
	if (!apiToken)
		throw new Error('CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ACCESS_TOKEN is required.');
	if (!databaseId) throw new Error(`${binding} database id is required.`);
	return { accountId, apiToken, databaseId };
}

/**
 * D1 responses are generic because each caller supplies a different SELECT shape.
 *
 * @template [Row=any]
 * @param {string} sql
 * @param {D1Parameter[]} [params]
 * @param {D1QueryOptions} [options]
 * @returns {Promise<{ results: Row[], meta: unknown }>}
 */
export async function d1Query(
	sql,
	params = [],
	{ rootDir = process.cwd(), binding = 'QUESTION_DB' } = {}
) {
	const { accountId, apiToken, databaseId } = d1Config(rootDir, binding);
	const response = await fetch(
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
		throw new Error(`D1 query failed: ${response.status} ${response.statusText}: ${bodyText}`);
	}
	const body = JSON.parse(bodyText);
	if (!body.success) throw new Error(`D1 query failed: ${JSON.stringify(body.errors ?? body)}`);
	const result = Array.isArray(body.result) ? body.result[0] : body.result;
	if (result?.success === false) throw new Error(`D1 statement failed: ${JSON.stringify(result)}`);
	return {
		results: result?.results ?? [],
		meta: result?.meta ?? null
	};
}

/**
 * @template [Row=any]
 * @param {string} sql
 * @param {D1Parameter[]} [params]
 * @param {D1QueryOptions} [options]
 * @returns {Promise<Row[]>}
 */
export async function d1Rows(sql, params = [], options = {}) {
	return (await d1Query(sql, params, options)).results;
}

/**
 * Execute a D1 batch transaction and require every statement to succeed.
 *
 * @param {Array<{sql: string, params?: D1Parameter[]}>} statements
 * @param {D1QueryOptions} [options]
 * @returns {Promise<Array<{success?: boolean, results?: unknown[], meta?: unknown}>>}
 */
export async function d1Batch(
	statements,
	{ rootDir = process.cwd(), binding = 'QUESTION_DB' } = {}
) {
	if (statements.length === 0) return [];
	const { accountId, apiToken, databaseId } = d1Config(rootDir, binding);
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				batch: statements.map((statement) => ({
					sql: statement.sql,
					params: statement.params ?? []
				}))
			})
		}
	);
	const bodyText = await response.text();
	if (!response.ok) {
		throw new Error(`D1 batch failed: ${response.status} ${response.statusText}: ${bodyText}`);
	}
	const body = JSON.parse(bodyText);
	if (!body.success) throw new Error(`D1 batch failed: ${JSON.stringify(body.errors ?? body)}`);
	const results = /** @type {Array<{success?: boolean, results?: unknown[], meta?: unknown}>} */ (
		Array.isArray(body.result) ? body.result : []
	);
	if (results.length !== statements.length) {
		throw new Error(
			`D1 batch returned ${results.length} results for ${statements.length} statements.`
		);
	}
	const failedIndex = results.findIndex((result) => result?.success === false);
	if (failedIndex !== -1) {
		throw new Error(
			`D1 batch statement ${failedIndex + 1} failed: ${JSON.stringify(results[failedIndex])}`
		);
	}
	return results;
}
