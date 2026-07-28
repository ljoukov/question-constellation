#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
	CHALLENGE_CATALOG_BUNDLE_SCHEMA,
	CHALLENGE_CATALOG_INDEX_PATH,
	sha256,
	stableStringify,
	validateChallengeCatalogBundle
} from './lib/challenge-catalog-bundle.mjs';
import { d1Rows, loadD1Env, readWranglerConfig } from './lib/d1-rest.mjs';

const execFileAsync = promisify(execFile);
const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
loadD1Env(rootDir);
const requestedOutputRoot = path.resolve(rootDir, args.outputRoot);
const ignoredRoot = path.resolve(rootDir, 'tmp');
const requestedRelativeToIgnored = path.relative(ignoredRoot, requestedOutputRoot);
if (
	!requestedRelativeToIgnored ||
	requestedRelativeToIgnored.startsWith(`..${path.sep}`) ||
	path.isAbsolute(requestedRelativeToIgnored)
) {
	throw new Error('--output-root must be an ignored directory under tmp/.');
}
const release = (
	await d1Rows(
		`SELECT r.id, r.schema_version, r.content_sha256, r.challenge_count,
		        r.asset_count, r.route_payload_count, r.subject_counts_json,
		        r.source_evidence_json
		   FROM challenge_catalog_state AS s
		   JOIN challenge_catalog_releases AS r
		     ON r.id = s.release_id
		    AND r.status = 'published'
		    AND r.content_sha256 = s.content_sha256
		  WHERE s.state_key = 'active'
		  LIMIT 1`
	)
)[0];
if (!release) throw new Error('No active D1 challenge catalogue release exists.');
if (release.schema_version !== CHALLENGE_CATALOG_BUNDLE_SCHEMA) {
	throw new Error(
		`Active release uses ${release.schema_version}; exact portable export requires ${CHALLENGE_CATALOG_BUNDLE_SCHEMA}.`
	);
}

const entryRows = await d1Rows(
	`SELECT display_order, record_json, content_sha256
	   FROM challenge_catalog_entries
	  WHERE release_id = ?
	  ORDER BY display_order`,
	[release.id]
);
const assetRows = await d1Rows(
	`SELECT asset_id, art_id, challenge_id, role, theme, r2_key, public_path,
	        byte_size, content_sha256, content_type, cache_control, review_disposition
	   FROM challenge_catalog_assets
	  WHERE release_id = ?
	  ORDER BY asset_id`,
	[release.id]
);
if (entryRows.length !== release.challenge_count || assetRows.length !== release.asset_count) {
	throw new Error('Active D1 release membership differs from its declared counts.');
}

const indexRow = (
	await d1Rows(
		`SELECT route_kind, payload_json, content_sha256, payload_bytes
		   FROM challenge_route_payloads
		  WHERE release_id = ?
		    AND route_path = ?
		  LIMIT 1`,
		[release.id, CHALLENGE_CATALOG_INDEX_PATH]
	)
)[0];
if (!indexRow) throw new Error('Active challenge catalogue index payload is missing.');
const indexPayload = JSON.parse(indexRow.payload_json);
const records = entryRows.map((row, index) => {
	const record = JSON.parse(row.record_json);
	if (record.displayOrder !== index || sha256(stableStringify(record)) !== row.content_sha256) {
		throw new Error(`Active challenge record ${index} failed exact D1 readback.`);
	}
	return record;
});

const routePaths = [
	CHALLENGE_CATALOG_INDEX_PATH,
	'/challenges',
	...indexPayload.subjects.map((subject) => `/challenges/${subject.subject}`),
	...records.map((record) => `/challenges/${record.definition.subject}/${record.definition.slug}`)
];
const routeRows = [];
for (let index = 0; index < routePaths.length; index += 5) {
	const chunk = routePaths.slice(index, index + 5);
	routeRows.push(
		...(await d1Rows(
			`SELECT route_path, route_kind, payload_json, content_sha256, payload_bytes
			   FROM challenge_route_payloads
			  WHERE release_id = ?
			    AND route_path IN (${chunk.map(() => '?').join(', ')})`,
			[release.id, ...chunk]
		))
	);
}
if (routeRows.length !== release.route_payload_count) {
	throw new Error('Active D1 route payload membership is incomplete.');
}
const routeByPath = new Map(routeRows.map((row) => [row.route_path, row]));
const routes = routePaths.map((routePath) => {
	const row = routeByPath.get(routePath);
	if (!row || sha256(row.payload_json) !== row.content_sha256) {
		throw new Error(`Active D1 route payload failed readback: ${routePath}`);
	}
	return {
		path: routePath,
		kind: row.route_kind,
		payload: JSON.parse(row.payload_json),
		payloadSha256: row.content_sha256,
		payloadBytes: row.payload_bytes
	};
});

const outputRoot = path.join(requestedOutputRoot, release.id);
const assets = assetRows.map((row) => ({
	id: row.asset_id,
	artId: row.art_id,
	challengeId: row.challenge_id,
	role: row.role,
	theme: row.theme,
	localPath: path
		.relative(rootDir, path.join(outputRoot, 'assets', `${row.asset_id}.webp`))
		.replaceAll(path.sep, '/'),
	size: row.byte_size,
	sha256: row.content_sha256,
	contentType: row.content_type,
	cacheControl: row.cache_control,
	r2Key: row.r2_key,
	publicPath: row.public_path,
	reviewDisposition: row.review_disposition
}));
const bucket = questionR2Bucket();
const wrangler = path.resolve(rootDir, 'node_modules/.bin/wrangler');
let completed = 0;
await runConcurrent(
	assets.map((asset) => async () => {
		const destination = path.resolve(rootDir, asset.localPath);
		if (
			!existsSync(destination) ||
			readFileSync(destination).byteLength !== asset.size ||
			sha256(readFileSync(destination)) !== asset.sha256
		) {
			mkdirSync(path.dirname(destination), { recursive: true });
			await execFileAsync(
				wrangler,
				[
					'r2',
					'object',
					'get',
					`${bucket}/${asset.r2Key}`,
					'--file',
					destination,
					'--remote',
					'--env-file',
					'.env.local'
				],
				{ cwd: rootDir, maxBuffer: 2 * 1024 * 1024 }
			);
		}
		const bytes = readFileSync(destination);
		if (bytes.byteLength !== asset.size || sha256(bytes) !== asset.sha256) {
			throw new Error(`Exported R2 bytes differ for ${asset.id}.`);
		}
		completed += 1;
		if (completed % 50 === 0 || completed === assets.length) {
			console.log(JSON.stringify({ stage: 'r2-export', completed, total: assets.length }));
		}
	}),
	args.concurrency
);

const bundle = {
	schemaVersion: release.schema_version,
	release: {
		id: release.id,
		schemaVersion: release.schema_version,
		challengeCount: release.challenge_count,
		assetCount: release.asset_count,
		routePayloadCount: release.route_payload_count,
		subjectCounts: JSON.parse(release.subject_counts_json),
		sourceEvidence: JSON.parse(release.source_evidence_json),
		contentSha256: release.content_sha256
	},
	subjects: indexPayload.subjects,
	arcs: indexPayload.arcs,
	socialImage: indexPayload.socialImage,
	assets,
	challenges: records,
	routes,
	contentSha256: release.content_sha256
};
const validation = validateChallengeCatalogBundle(bundle, {
	rootDir,
	verifyFiles: true
});
if (validation.contentSha256 !== release.content_sha256) {
	throw new Error('Portable release export differs from the active D1 release hash.');
}
const outputPath = path.join(outputRoot, `${release.id}.bundle.json`);
if (existsSync(outputPath)) {
	const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
	if (existing.contentSha256 !== bundle.contentSha256) {
		throw new Error(`Refusing to overwrite a different release export: ${outputPath}`);
	}
} else {
	mkdirSync(path.dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, { flag: 'wx' });
}
console.log(
	JSON.stringify(
		{
			status: 'passed',
			releaseId: release.id,
			contentSha256: release.content_sha256,
			challenges: records.length,
			assets: assets.length,
			routes: routes.length,
			output: path.relative(rootDir, outputPath)
		},
		null,
		2
	)
);

function questionR2Bucket() {
	const config = readWranglerConfig(rootDir);
	const bucket =
		process.env.QUESTION_R2_BUCKET_NAME ??
		config.r2_buckets?.find((candidate) => candidate.binding === 'QUESTION_R2')?.bucket_name;
	if (!bucket) throw new Error('QUESTION_R2 bucket is not configured.');
	return bucket;
}

async function runConcurrent(tasks, concurrency) {
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
			while (true) {
				const index = cursor;
				cursor += 1;
				if (index >= tasks.length) return;
				await tasks[index]();
			}
		})
	);
}

function parseArgs(argv) {
	const parsed = {
		outputRoot: 'tmp/challenge-catalog/exports',
		concurrency: 6,
		help: false
	};
	for (const argument of argv) {
		if (argument === '--') continue;
		if (argument === '--help') {
			if (parsed.help) throw new Error('Duplicate --help option.');
			parsed.help = true;
		} else if (argument.startsWith('--output-root=')) {
			parsed.outputRoot = argument.slice('--output-root='.length);
		} else if (argument.startsWith('--concurrency=')) {
			parsed.concurrency = Number(argument.slice('--concurrency='.length));
			if (
				!Number.isInteger(parsed.concurrency) ||
				parsed.concurrency < 1 ||
				parsed.concurrency > 12
			) {
				throw new Error('--concurrency must be an integer from 1 to 12.');
			}
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}
	return parsed;
}

function usage() {
	return `Usage: node scripts/export-challenge-catalog-release.mjs [options]

Export the complete active D1 release and exact R2 bytes as a portable bundle under ignored tmp/.

Options:
  --output-root=<tmp/...>  Default: tmp/challenge-catalog/exports
  --concurrency=<1-12>     Default: 6
  --help`;
}
