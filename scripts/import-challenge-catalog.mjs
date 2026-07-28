#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import {
	canonicalHash,
	sha256,
	stableStringify,
	validateChallengeCatalogBundle
} from './lib/challenge-catalog-bundle.mjs';
import { d1Batch, d1Rows, loadD1Env, readWranglerConfig } from './lib/d1-rest.mjs';
import { uploadScienceChallengeArtObject } from './lib/science-challenge-art-r2-upload.mjs';

const rootDir = process.cwd();
loadD1Env(rootDir);
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}

const bundlePath = path.resolve(rootDir, args.bundle);
const ignoredRoot = path.resolve(rootDir, 'tmp');
const bundleRelativeToIgnored = path.relative(ignoredRoot, bundlePath);
if (
	!bundleRelativeToIgnored ||
	bundleRelativeToIgnored.startsWith(`..${path.sep}`) ||
	path.isAbsolute(bundleRelativeToIgnored)
) {
	throw new Error('--bundle must point to an ignored file under tmp/.');
}
if (!existsSync(bundlePath)) throw new Error(`Bundle does not exist: ${bundlePath}`);
const binding = captureBundleBinding(bundlePath);
if (args.expectedSha256 && args.expectedSha256 !== binding.validation.contentSha256) {
	throw new Error('Bundle content SHA-256 differs from --expected-sha256.');
}
if (args.publish && !args.expectedSha256) {
	throw new Error('--publish requires --expected-sha256=<bundle content SHA-256>.');
}

console.log(
	JSON.stringify(
		{
			status: args.publish ? 'publish-authorized' : 'dry-run',
			bundle: path.relative(rootDir, bundlePath),
			releaseId: binding.validation.releaseId,
			contentSha256: binding.validation.contentSha256,
			challenges: binding.validation.challengeCount,
			assets: binding.validation.assetCount,
			assetBytes: binding.validation.bytes,
			routePayloads: binding.validation.routePayloadCount,
			subjectCounts: binding.validation.subjectCounts,
			remoteWrites: args.publish ? 'R2 then staging D1 then atomic activation' : 'not-run'
		},
		null,
		2
	)
);
if (!args.publish) process.exit(0);

const existing = await remoteRelease(binding.bundle.release.id);
if (existing) {
	if (existing.content_sha256 !== binding.validation.contentSha256) {
		throw new Error(
			`Release id ${binding.bundle.release.id} already exists with different content.`
		);
	}
	if (existing.status === 'published') {
		const active = await activeRelease();
		if (active?.release_id !== binding.bundle.release.id) {
			throw new Error(`Release ${binding.bundle.release.id} is published but is not active.`);
		}
		await verifyD1Readback(binding.bundle);
		await verifyActiveRouteReadback(binding.bundle);
		console.log(
			JSON.stringify(
				{
					status: 'already-current',
					releaseId: binding.bundle.release.id,
					contentSha256: binding.validation.contentSha256,
					d1Readback: 'passed',
					r2Upload: 'skipped because the exact active release already passed publication'
				},
				null,
				2
			)
		);
		process.exit(0);
	}
	if (existing.status !== 'staging') {
		throw new Error(
			`Release ${binding.bundle.release.id} is ${existing.status}; immutable retired releases cannot be republished.`
		);
	}
}

const bucket = questionR2Bucket();
const wranglerCommand = resolveWranglerCommand();
console.log(
	JSON.stringify(
		{
			stage: 'r2-upload',
			bucket,
			objects: binding.bundle.assets.length,
			concurrency: args.concurrency,
			readback: 'required for every object'
		},
		null,
		2
	)
);
let uploaded = 0;
const uploadResults = await runConcurrent(
	binding.bundle.assets.map((object) => async () => {
		const result = await uploadScienceChallengeArtObject({
			object,
			bucket,
			repositoryRoot: rootDir,
			assetRoot: rootDir,
			wranglerCommand,
			retries: args.retries,
			assertBindingCurrent: () => assertBundleStatCurrent(binding),
			assertLocalObjectCurrent: () => assertAssetCurrent(object)
		});
		uploaded += 1;
		if (uploaded % 25 === 0 || uploaded === binding.bundle.assets.length) {
			console.log(
				JSON.stringify({
					stage: 'r2-upload',
					completed: uploaded,
					total: binding.bundle.assets.length
				})
			);
		}
		return result;
	}),
	args.concurrency
);
const uploadFailures = uploadResults.filter((result) => result.status !== 'passed');
if (uploadFailures.length > 0) {
	throw new Error(
		`R2 upload/readback failed for ${uploadFailures.length} objects:\n${uploadFailures
			.slice(0, 20)
			.map((failure) => `${failure.id}: ${failure.error}`)
			.join('\n')}`
	);
}
assertBundleCurrent(binding);
for (const asset of binding.bundle.assets) assertAssetCurrent(asset);

console.log(
	JSON.stringify({
		stage: 'd1-staging',
		releaseId: binding.bundle.release.id,
		challenges: binding.bundle.challenges.length,
		assets: binding.bundle.assets.length,
		routePayloads: binding.bundle.routes.length
	})
);
await stageRelease(binding.bundle);
await upsertEntries(binding.bundle);
await upsertAssets(binding.bundle);
await upsertRoutes(binding.bundle);
assertBundleCurrent(binding);
await verifyD1Readback(binding.bundle);
await activateRelease(binding.bundle);
const finalState = await verifyPublishedState(binding.bundle);
console.log(
	JSON.stringify(
		{
			status: 'passed',
			releaseId: binding.bundle.release.id,
			contentSha256: binding.validation.contentSha256,
			r2UploadedAndReadBack: uploadResults.length,
			r2Bytes: binding.validation.bytes,
			d1Challenges: finalState.challenge_count,
			d1Assets: finalState.asset_count,
			d1RoutePayloads: finalState.route_payload_count,
			d1ExactReadback: 'passed',
			activation: 'atomic'
		},
		null,
		2
	)
);

function captureBundleBinding(filePath) {
	const bytes = readFileSync(filePath);
	const bundle = JSON.parse(bytes.toString('utf8'));
	const validation = validateChallengeCatalogBundle(bundle, { rootDir, verifyFiles: true });
	const stat = statSync(filePath);
	return {
		filePath,
		fileSha256: sha256(bytes),
		fileSize: stat.size,
		fileMtimeMs: stat.mtimeMs,
		bundle,
		validation
	};
}

function assertBundleStatCurrent(binding) {
	const stat = statSync(binding.filePath);
	if (stat.size !== binding.fileSize || stat.mtimeMs !== binding.fileMtimeMs) {
		throw new Error('Challenge catalogue bundle changed during publication.');
	}
}

function assertBundleCurrent(binding) {
	assertBundleStatCurrent(binding);
	const bytes = readFileSync(binding.filePath);
	if (sha256(bytes) !== binding.fileSha256) {
		throw new Error('Challenge catalogue bundle bytes changed during publication.');
	}
	validateChallengeCatalogBundle(JSON.parse(bytes.toString('utf8')), {
		rootDir,
		verifyFiles: true
	});
}

function assertAssetCurrent(asset) {
	const absolutePath = path.resolve(rootDir, asset.localPath);
	if (
		!existsSync(absolutePath) ||
		statSync(absolutePath).size !== asset.size ||
		sha256(readFileSync(absolutePath)) !== asset.sha256
	) {
		throw new Error(`Reviewed challenge asset changed: ${asset.localPath}`);
	}
}

async function stageRelease(bundle) {
	const release = bundle.release;
	await d1Batch([
		{
			sql: `INSERT INTO challenge_catalog_releases (
			        id, schema_version, status, content_sha256, challenge_count,
			        asset_count, route_payload_count, subject_counts_json, source_evidence_json
			      ) VALUES (?, ?, 'staging', ?, ?, ?, ?, ?, ?)
			      ON CONFLICT(id) DO UPDATE SET
			        schema_version = excluded.schema_version,
			        challenge_count = excluded.challenge_count,
			        asset_count = excluded.asset_count,
			        route_payload_count = excluded.route_payload_count,
			        subject_counts_json = excluded.subject_counts_json,
			        source_evidence_json = excluded.source_evidence_json
			      WHERE challenge_catalog_releases.status = 'staging'
			        AND challenge_catalog_releases.content_sha256 = excluded.content_sha256`,
			params: [
				release.id,
				release.schemaVersion,
				release.contentSha256,
				release.challengeCount,
				release.assetCount,
				release.routePayloadCount,
				stableStringify(release.subjectCounts),
				stableStringify(release.sourceEvidence)
			]
		}
	]);
	const staged = await remoteRelease(release.id);
	if (!staged || staged.status !== 'staging' || staged.content_sha256 !== release.contentSha256) {
		throw new Error(`D1 did not stage the exact release ${release.id}.`);
	}
}

async function upsertEntries(bundle) {
	const statements = bundle.challenges.map((record) => {
		const recordJson = stableStringify(record);
		return {
			sql: `INSERT INTO challenge_catalog_entries (
			        release_id, challenge_id, subject, slug, display_order,
			        record_json, content_sha256
			      ) VALUES (?, ?, ?, ?, ?, ?, ?)
			      ON CONFLICT(release_id, challenge_id) DO UPDATE SET
			        subject = excluded.subject,
			        slug = excluded.slug,
			        display_order = excluded.display_order,
			        record_json = excluded.record_json,
			        content_sha256 = excluded.content_sha256`,
			params: [
				bundle.release.id,
				record.definition.id,
				record.definition.subject,
				record.definition.slug,
				record.displayOrder,
				recordJson,
				sha256(recordJson)
			]
		};
	});
	await runD1Chunks(statements, { maxStatements: 20, maxBytes: 512 * 1024 });
}

async function upsertAssets(bundle) {
	const statements = bundle.assets.map((asset) => ({
		sql: `INSERT INTO challenge_catalog_assets (
		        release_id, asset_id, art_id, challenge_id, role, theme, r2_key,
		        public_path, byte_size, content_sha256, content_type, cache_control,
		        review_disposition
		      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		      ON CONFLICT(release_id, asset_id) DO UPDATE SET
		        art_id = excluded.art_id,
		        challenge_id = excluded.challenge_id,
		        role = excluded.role,
		        theme = excluded.theme,
		        r2_key = excluded.r2_key,
		        public_path = excluded.public_path,
		        byte_size = excluded.byte_size,
		        content_sha256 = excluded.content_sha256,
		        content_type = excluded.content_type,
		        cache_control = excluded.cache_control,
		        review_disposition = excluded.review_disposition`,
		params: [
			bundle.release.id,
			asset.id,
			asset.artId,
			asset.challengeId,
			asset.role,
			asset.theme,
			asset.r2Key,
			asset.publicPath,
			asset.size,
			asset.sha256,
			asset.contentType,
			asset.cacheControl,
			asset.reviewDisposition
		]
	}));
	await runD1Chunks(statements, { maxStatements: 30, maxBytes: 512 * 1024 });
}

async function upsertRoutes(bundle) {
	const statements = bundle.routes.map((routeEntry) => {
		const payloadJson = stableStringify(routeEntry.payload);
		return {
			sql: `INSERT INTO challenge_route_payloads (
			        release_id, route_path, route_kind, payload_json,
			        content_sha256, payload_bytes
			      ) VALUES (?, ?, ?, ?, ?, ?)
			      ON CONFLICT(release_id, route_path) DO UPDATE SET
			        route_kind = excluded.route_kind,
			        payload_json = excluded.payload_json,
			        content_sha256 = excluded.content_sha256,
			        payload_bytes = excluded.payload_bytes`,
			params: [
				bundle.release.id,
				routeEntry.path,
				routeEntry.kind,
				payloadJson,
				routeEntry.payloadSha256,
				routeEntry.payloadBytes
			]
		};
	});
	await runD1Chunks(statements, { maxStatements: 5, maxBytes: 512 * 1024 });
}

async function runD1Chunks(statements, { maxStatements, maxBytes }) {
	const chunks = [];
	let chunk = [];
	let bytes = 0;
	for (const statement of statements) {
		const statementBytes = Buffer.byteLength(JSON.stringify(statement));
		if (chunk.length > 0 && (chunk.length >= maxStatements || bytes + statementBytes > maxBytes)) {
			chunks.push(chunk);
			chunk = [];
			bytes = 0;
		}
		chunk.push(statement);
		bytes += statementBytes;
	}
	if (chunk.length > 0) chunks.push(chunk);
	for (let index = 0; index < chunks.length; index += 1) {
		await d1Batch(chunks[index]);
		if ((index + 1) % 10 === 0 || index + 1 === chunks.length) {
			console.log(
				JSON.stringify({
					stage: 'd1-staging',
					batchesComplete: index + 1,
					batchesTotal: chunks.length
				})
			);
		}
	}
}

async function verifyD1Readback(bundle) {
	const releaseId = bundle.release.id;
	const entryRows = await readbackInChunks({
		items: bundle.challenges,
		keyFor: (record) => record.definition.id,
		sqlFor: (count) => `SELECT challenge_id, subject, slug, display_order, record_json,
		                            content_sha256
		                       FROM challenge_catalog_entries
		                      WHERE release_id = ?
		                        AND challenge_id IN (${placeholders(count)})`,
		paramsFor: (chunk) => [releaseId, ...chunk.map((record) => record.definition.id)],
		chunkSize: 25
	});
	const entryById = new Map(entryRows.map((row) => [row.challenge_id, row]));
	for (const record of bundle.challenges) {
		const row = entryById.get(record.definition.id);
		const expectedJson = stableStringify(record);
		if (
			!row ||
			row.subject !== record.definition.subject ||
			row.slug !== record.definition.slug ||
			row.display_order !== record.displayOrder ||
			row.content_sha256 !== sha256(expectedJson) ||
			row.record_json !== expectedJson
		) {
			throw new Error(`D1 challenge readback differs for ${record.definition.id}.`);
		}
	}

	const assetRows = await readbackInChunks({
		items: bundle.assets,
		keyFor: (asset) => asset.id,
		sqlFor: (count) => `SELECT asset_id, art_id, challenge_id, role, theme, r2_key,
		                            public_path, byte_size, content_sha256, content_type,
		                            cache_control, review_disposition
		                       FROM challenge_catalog_assets
		                      WHERE release_id = ?
		                        AND asset_id IN (${placeholders(count)})`,
		paramsFor: (chunk) => [releaseId, ...chunk.map((asset) => asset.id)],
		chunkSize: 60
	});
	const assetById = new Map(assetRows.map((row) => [row.asset_id, row]));
	for (const asset of bundle.assets) {
		const row = assetById.get(asset.id);
		if (
			!row ||
			row.art_id !== asset.artId ||
			row.challenge_id !== asset.challengeId ||
			row.role !== asset.role ||
			row.theme !== asset.theme ||
			row.r2_key !== asset.r2Key ||
			row.public_path !== asset.publicPath ||
			row.byte_size !== asset.size ||
			row.content_sha256 !== asset.sha256 ||
			row.content_type !== asset.contentType ||
			row.cache_control !== asset.cacheControl ||
			row.review_disposition !== asset.reviewDisposition
		) {
			throw new Error(`D1 asset readback differs for ${asset.id}.`);
		}
	}

	const routeRows = await readbackInChunks({
		items: bundle.routes,
		keyFor: (routeEntry) => routeEntry.path,
		sqlFor: (count) => `SELECT route_path, route_kind, payload_json, content_sha256,
		                            payload_bytes
		                       FROM challenge_route_payloads
		                      WHERE release_id = ?
		                        AND route_path IN (${placeholders(count)})`,
		paramsFor: (chunk) => [releaseId, ...chunk.map((routeEntry) => routeEntry.path)],
		chunkSize: 5
	});
	const routeByPath = new Map(routeRows.map((row) => [row.route_path, row]));
	for (const routeEntry of bundle.routes) {
		const row = routeByPath.get(routeEntry.path);
		const expectedJson = stableStringify(routeEntry.payload);
		if (
			!row ||
			row.route_kind !== routeEntry.kind ||
			row.content_sha256 !== routeEntry.payloadSha256 ||
			row.payload_bytes !== routeEntry.payloadBytes ||
			row.payload_json !== expectedJson
		) {
			throw new Error(`D1 route readback differs for ${routeEntry.path}.`);
		}
	}
	const counts = await d1Rows(
		`SELECT
		   (SELECT COUNT(*) FROM challenge_catalog_entries WHERE release_id = ?) AS challenge_count,
		   (SELECT COUNT(*) FROM challenge_catalog_assets WHERE release_id = ?) AS asset_count,
		   (SELECT COUNT(*) FROM challenge_route_payloads WHERE release_id = ?) AS route_payload_count`,
		[releaseId, releaseId, releaseId]
	);
	const count = counts[0];
	if (
		count?.challenge_count !== bundle.release.challengeCount ||
		count?.asset_count !== bundle.release.assetCount ||
		count?.route_payload_count !== bundle.release.routePayloadCount
	) {
		throw new Error(`D1 release ${releaseId} contains unexpected extra or missing rows.`);
	}
}

async function readbackInChunks({ items, sqlFor, paramsFor, chunkSize }) {
	const rows = [];
	for (let index = 0; index < items.length; index += chunkSize) {
		const chunk = items.slice(index, index + chunkSize);
		rows.push(...(await d1Rows(sqlFor(chunk.length), paramsFor(chunk))));
	}
	return rows;
}

async function activateRelease(bundle) {
	await d1Batch([
		{
			sql: `UPDATE challenge_catalog_releases
			         SET status = 'retired'
			       WHERE status = 'published'
			         AND id <> ?`,
			params: [bundle.release.id]
		},
		{
			sql: `UPDATE challenge_catalog_releases
			         SET status = 'published',
			             published_at = COALESCE(published_at, CURRENT_TIMESTAMP)
			       WHERE id = ?
			         AND status = 'staging'
			         AND content_sha256 = ?`,
			params: [bundle.release.id, bundle.release.contentSha256]
		},
		{
			sql: `DELETE FROM challenge_active_route_payloads`,
			params: []
		},
		{
			sql: `INSERT INTO challenge_active_route_payloads (
			        route_path, route_kind, release_id, release_sha256,
			        payload_json, content_sha256, payload_bytes, activated_at
			      )
			      SELECT route_path, route_kind, release_id, ?,
			             payload_json, content_sha256, payload_bytes, CURRENT_TIMESTAMP
			        FROM challenge_route_payloads
			       WHERE release_id = ?`,
			params: [bundle.release.contentSha256, bundle.release.id]
		},
		{
			sql: `INSERT INTO challenge_catalog_state (
			        state_key, release_id, content_sha256, updated_at
			      ) VALUES ('active', ?, ?, CURRENT_TIMESTAMP)
			      ON CONFLICT(state_key) DO UPDATE SET
			        release_id = excluded.release_id,
			        content_sha256 = excluded.content_sha256,
			        updated_at = CURRENT_TIMESTAMP`,
			params: [bundle.release.id, bundle.release.contentSha256]
		}
	]);
}

async function verifyPublishedState(bundle) {
	const rows = await d1Rows(
		`SELECT r.id AS release_id, r.status, r.content_sha256, r.challenge_count,
		        r.asset_count, r.route_payload_count, s.content_sha256 AS state_sha256
		   FROM challenge_catalog_state AS s
		   JOIN challenge_catalog_releases AS r ON r.id = s.release_id
		  WHERE s.state_key = 'active'
		  LIMIT 1`
	);
	const row = rows[0];
	if (
		!row ||
		row.release_id !== bundle.release.id ||
		row.status !== 'published' ||
		row.content_sha256 !== bundle.release.contentSha256 ||
		row.state_sha256 !== bundle.release.contentSha256 ||
		row.challenge_count !== bundle.release.challengeCount ||
		row.asset_count !== bundle.release.assetCount ||
		row.route_payload_count !== bundle.release.routePayloadCount
	) {
		throw new Error('Active D1 challenge release differs after activation.');
	}
	await verifyActiveRouteReadback(bundle);
	return row;
}

async function verifyActiveRouteReadback(bundle) {
	const routeRows = await readbackInChunks({
		items: bundle.routes,
		keyFor: (routeEntry) => routeEntry.path,
		sqlFor: (count) => `SELECT route_path, route_kind, release_id, release_sha256,
		                            payload_json, content_sha256, payload_bytes
		                       FROM challenge_active_route_payloads
		                      WHERE route_path IN (${placeholders(count)})`,
		paramsFor: (chunk) => chunk.map((routeEntry) => routeEntry.path),
		chunkSize: 5
	});
	const routeByPath = new Map(routeRows.map((row) => [row.route_path, row]));
	for (const routeEntry of bundle.routes) {
		const row = routeByPath.get(routeEntry.path);
		const expectedJson = stableStringify(routeEntry.payload);
		if (
			!row ||
			row.route_kind !== routeEntry.kind ||
			row.release_id !== bundle.release.id ||
			row.release_sha256 !== bundle.release.contentSha256 ||
			row.content_sha256 !== routeEntry.payloadSha256 ||
			row.payload_bytes !== routeEntry.payloadBytes ||
			row.payload_json !== expectedJson
		) {
			throw new Error(`Active D1 route readback differs for ${routeEntry.path}.`);
		}
	}
	const rows = await d1Rows(
		`SELECT COUNT(*) AS route_payload_count
		   FROM challenge_active_route_payloads
		  WHERE release_id = ?
		    AND release_sha256 = ?`,
		[bundle.release.id, bundle.release.contentSha256]
	);
	if (rows[0]?.route_payload_count !== bundle.release.routePayloadCount) {
		throw new Error('Active D1 challenge route projection contains unexpected rows.');
	}
}

async function remoteRelease(releaseId) {
	return (
		await d1Rows(
			`SELECT id, status, content_sha256, challenge_count, asset_count,
			        route_payload_count
			   FROM challenge_catalog_releases
			  WHERE id = ?
			  LIMIT 1`,
			[releaseId]
		)
	)[0];
}

async function activeRelease() {
	return (
		await d1Rows(
			`SELECT release_id, content_sha256
			   FROM challenge_catalog_state
			  WHERE state_key = 'active'
			  LIMIT 1`
		)
	)[0];
}

function questionR2Bucket() {
	const config = readWranglerConfig(rootDir);
	const binding = config.r2_buckets?.find((candidate) => candidate.binding === 'QUESTION_R2');
	const bucket = process.env.QUESTION_R2_BUCKET_NAME ?? binding?.bucket_name;
	if (!bucket) throw new Error('QUESTION_R2 bucket is not configured.');
	return bucket;
}

function resolveWranglerCommand() {
	const local = path.resolve(rootDir, 'node_modules/.bin/wrangler');
	if (existsSync(local)) return local;
	throw new Error('Local Wrangler executable is unavailable.');
}

function placeholders(count) {
	return Array.from({ length: count }, () => '?').join(', ');
}

async function runConcurrent(tasks, concurrency) {
	const results = new Array(tasks.length);
	let cursor = 0;
	const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
		while (true) {
			const index = cursor;
			cursor += 1;
			if (index >= tasks.length) return;
			results[index] = await tasks[index]();
		}
	});
	await Promise.all(workers);
	return results;
}

function parseArgs(argv) {
	const parsed = {
		help: false,
		publish: false,
		bundle: '',
		expectedSha256: '',
		concurrency: 6,
		retries: 2
	};
	for (const argument of argv) {
		if (argument === '--') continue;
		if (argument === '--help') parsed.help = true;
		else if (argument === '--publish') parsed.publish = true;
		else if (argument.startsWith('--bundle=')) parsed.bundle = argument.slice('--bundle='.length);
		else if (argument.startsWith('--expected-sha256=')) {
			parsed.expectedSha256 = argument.slice('--expected-sha256='.length);
		} else if (argument.startsWith('--concurrency=')) {
			parsed.concurrency = numberOption(argument, '--concurrency=', 1, 12);
		} else if (argument.startsWith('--retries=')) {
			parsed.retries = numberOption(argument, '--retries=', 0, 5);
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}
	if (!parsed.help && !parsed.bundle) {
		throw new Error('--bundle=<ignored tmp bundle> is required.');
	}
	return parsed;
}

function numberOption(argument, prefix, min, max) {
	const value = Number(argument.slice(prefix.length));
	if (!Number.isInteger(value) || value < min || value > max) {
		throw new Error(`${prefix.slice(0, -1)} must be an integer from ${min} to ${max}.`);
	}
	return value;
}

function usage() {
	return `Usage: node scripts/import-challenge-catalog.mjs [options]

Dry-run is the default. Publication first uploads and exactly reads back every content-addressed
R2 object, then stages and exactly reads back all canonical and denormalized D1 rows, and finally
changes the active-release pointer in one D1 batch transaction.

Options:
  --bundle=<tmp/.../challenge-catalog.bundle.json>     Required
  --publish
  --expected-sha256=<64-char bundle content SHA-256>  Required with --publish
  --concurrency=<1-12>                                Default: 6
  --retries=<0-5>                                     Default: 2
  --help`;
}
