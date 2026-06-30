import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

export function readWranglerConfig(rootDir = process.cwd()) {
	const wranglerPath = path.join(rootDir, 'wrangler.jsonc');
	if (!existsSync(wranglerPath)) return {};
	const raw = readFileSync(wranglerPath, 'utf8')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');
	return JSON.parse(raw);
}

export function loadD1Env(rootDir = process.cwd()) {
	loadDotEnvFile(path.join(rootDir, '.env'));
	loadDotEnvFile(path.join(rootDir, '.env.local'));
}

export function d1Config(rootDir = process.cwd()) {
	loadD1Env(rootDir);
	const wranglerConfig = readWranglerConfig(rootDir);
	const databaseConfig = wranglerConfig.d1_databases?.find((db) => db.binding === 'QUESTION_DB');
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? process.env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN;
	const databaseId = process.env.QUESTION_DB_DATABASE_ID ?? databaseConfig?.database_id;
	if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID is required for D1 access.');
	if (!apiToken)
		throw new Error('CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ACCESS_TOKEN is required.');
	if (!databaseId) throw new Error('QUESTION_DB database id is required.');
	return { accountId, apiToken, databaseId };
}

export async function d1Query(sql, params = [], { rootDir = process.cwd() } = {}) {
	const { accountId, apiToken, databaseId } = d1Config(rootDir);
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

export async function d1Rows(sql, params = [], options = {}) {
	return (await d1Query(sql, params, options)).results;
}
