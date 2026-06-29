#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const usage = `Usage:
node scripts/check-public-question-routes.mjs \\
  --source-document-id=aqa-84611h-qp-nov20

Optional:
  --base-url=https://constellation.eviworld.com
  --output=tmp/public-route-checks/<source-document-id>.json
  --concurrency=6
  --no-assets
  --fail-on-error`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const sourceDocumentId = requiredStringArg('source-document-id');
const baseUrl = stringArg('base-url', 'https://constellation.eviworld.com').replace(/\/+$/, '');
const outputPath = path.resolve(
	rootDir,
	stringArg('output', `tmp/public-route-checks/${sourceDocumentId}.json`)
);
const concurrency = integerArg('concurrency', 6, 1);
const includeAssets = !hasArg('no-assets');
const failOnError = hasArg('fail-on-error') || !hasArg('no-fail-on-error');

loadDotEnvFile(path.join(rootDir, '.env'));
loadDotEnvFile(path.join(rootDir, '.env.local'));

const wranglerConfig = readWranglerConfig();
const databaseConfig = wranglerConfig.d1_databases?.find((db) => db.binding === 'QUESTION_DB');
const accountId = requiredEnv('CLOUDFLARE_ACCOUNT_ID');
const apiToken = requiredEnv(
	'CLOUDFLARE_API_TOKEN',
	process.env.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN ?? null
);
const databaseId = requiredEnv('QUESTION_DB_DATABASE_ID', databaseConfig?.database_id ?? null);
const d1QueryUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

const startedAt = new Date().toISOString();
const rows = await loadImportedQuestionRows();
if (rows.length === 0) {
	throw new Error(`No imported questions found for ${sourceDocumentId}.`);
}

const questionRoutes = rows.flatMap((row) => [
	route('question', `/questions/${encodeURIComponent(row.question_id)}`, row),
	route('question-chain', `/questions/${encodeURIComponent(row.question_id)}/chain`, row),
	route('practice', `/questions/${encodeURIComponent(row.question_id)}/practice`, row)
]);
const chainIds = [...new Set(rows.map((row) => row.answer_chain_id).filter(Boolean))].sort();
const chainRoutes = chainIds.flatMap((chainId) => [
	route('chain', `/chains/${encodeURIComponent(chainId)}`, { answer_chain_id: chainId }),
	route('constellation', `/constellations/${encodeURIComponent(chainId)}`, {
		answer_chain_id: chainId
	})
]);
const assetRoutes = includeAssets
	? [
			...new Map(
				rows
					.flatMap((row) => (row.asset_paths ?? []).map((assetPath) => [assetPath, assetPath]))
					.filter(([, assetPath]) => assetPath)
			).values()
		].map((assetPath) => route('asset', assetPath, { asset_path: assetPath }, 'HEAD'))
	: [];

const checks = await mapLimit(
	[...questionRoutes, ...chainRoutes, ...assetRoutes],
	concurrency,
	checkRoute
);
const failed = checks.filter((check) => check.status !== 'passed');
const summary = {
	status: failed.length === 0 ? 'passed' : 'failed',
	startedAt,
	finishedAt: new Date().toISOString(),
	sourceDocumentId,
	baseUrl,
	databaseId,
	questionCount: rows.length,
	chainCount: chainIds.length,
	routeCount: checks.length,
	failedRouteCount: failed.length,
	assetRoutesChecked: assetRoutes.length,
	failed,
	checks
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (failed.length > 0 && failOnError) process.exit(1);

function route(kind, pathname, metadata, method = 'GET') {
	return {
		kind,
		method,
		pathname,
		url: pathname.startsWith('http') ? pathname : `${baseUrl}${pathname}`,
		metadata
	};
}

async function checkRoute(item) {
	const started = Date.now();
	try {
		const response = await fetch(item.url, {
			method: item.method,
			redirect: 'follow',
			headers:
				item.method === 'HEAD'
					? {}
					: {
							Accept: 'text/html,application/xhtml+xml,image/*;q=0.8,*/*;q=0.5'
						}
		});
		const durationMs = Date.now() - started;
		let bodySample = '';
		let bodyIssue = null;
		if (item.method !== 'HEAD') {
			const body = await response.text();
			bodySample = body.slice(0, 240);
			bodyIssue = routeBodyIssue(body);
		}
		const statusPassed = response.status >= 200 && response.status < 400;
		return {
			...item,
			status: statusPassed && !bodyIssue ? 'passed' : 'failed',
			httpStatus: response.status,
			durationMs,
			bodyIssue,
			bodySample: bodyIssue ? bodySample : undefined
		};
	} catch (error) {
		return {
			...item,
			status: 'failed',
			httpStatus: null,
			durationMs: Date.now() - started,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}

function routeBodyIssue(body) {
	if (!body) return 'empty response body';
	const lowered = body.toLowerCase();
	if (lowered.includes('internal error')) return 'body contains Internal Error';
	if (lowered.includes('__error')) return 'body appears to contain an app error payload';
	if (lowered.includes('question not found')) return 'body contains question not found';
	if (lowered.includes('answer chain not found')) return 'body contains answer chain not found';
	if (lowered.includes('no questions for chain')) return 'body contains no questions for chain';
	if (lowered.includes('missing response asset mapping')) {
		return 'body contains missing response asset mapping';
	}
	return null;
}

async function mapLimit(items, limit, mapper) {
	const out = new Array(items.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			out[index] = await mapper(items[index], index);
		}
	});
	await Promise.all(workers);
	return out;
}

async function loadImportedQuestionRows() {
	const rows = await d1Query(
		`SELECT q.id AS question_id,
		        q.source_question_ref,
		        qac.answer_chain_id,
		        GROUP_CONCAT(DISTINCT qa.public_path) AS asset_paths_csv
		   FROM questions q
		   JOIN question_answer_chains qac ON qac.question_id = q.id
		  LEFT JOIN question_assets qa ON qa.question_id = q.id AND qa.public_path IS NOT NULL
		  WHERE q.source_document_id = ?
		    AND q.status = 'published'
		    AND q.needs_human_review = 0
		    AND qac.needs_human_review = 0
		    AND qac.is_primary = 1
		  GROUP BY q.id, q.source_question_ref, qac.answer_chain_id
		  ORDER BY q.display_order, q.source_question_ref`,
		[sourceDocumentId]
	);
	return rows.map((row) => ({
		question_id: row.question_id,
		source_question_ref: row.source_question_ref,
		answer_chain_id: row.answer_chain_id,
		asset_paths: String(row.asset_paths_csv ?? '')
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	}));
}

async function d1Query(sql, params = []) {
	const response = await fetch(d1QueryUrl, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiToken}`,
			'Content-Type': 'application/json',
			Accept: 'application/json'
		},
		body: JSON.stringify({ sql, params })
	});
	const bodyText = await response.text();
	if (!response.ok) {
		throw new Error(`D1 query failed: ${response.status} ${response.statusText}: ${bodyText}`);
	}
	const body = JSON.parse(bodyText);
	if (!body.success) throw new Error(`D1 query failed: ${JSON.stringify(body.errors ?? body)}`);
	const result = Array.isArray(body.result) ? body.result[0] : body.result;
	if (result?.success === false) throw new Error(`D1 statement failed: ${JSON.stringify(result)}`);
	return result?.results ?? [];
}

function loadDotEnvFile(filePath) {
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

function readWranglerConfig() {
	const raw = readFileSync(path.join(rootDir, 'wrangler.jsonc'), 'utf8')
		.replace(/^\s*\/\/.*$/gm, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');
	return JSON.parse(raw);
}

function requiredEnv(name, fallback = null) {
	const value = process.env[name] ?? fallback;
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function requiredStringArg(name) {
	const value = stringArg(name, '');
	if (!value) throw new Error(`Pass --${name}=...\n\n${usage}`);
	return value;
}

function integerArg(name, defaultValue, minValue) {
	const raw = stringArg(name, '');
	if (!raw) return defaultValue;
	const value = Number(raw);
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer >= ${minValue}.`);
	}
	return value;
}
