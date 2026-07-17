#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileSha256 } from './lib/codex-phase-artifacts.mjs';
import { assertLearnerVisibleAssetBundleCurrent } from './lib/learner-visible-asset-binding.mjs';
import { assertBoundJsonInputCurrent, captureBoundJsonInput } from './lib/phase-input-binding.mjs';

const rootDir = process.cwd();
const defaultAssetRoots = [
	'data/vision-extracted/aqa-separate-science-higher/assets/question-papers',
	'data/vision-extracted/aqa-combined-science-trilogy-higher/assets/question-papers',
	'data/aqa-combined-science-trilogy-higher/assets/question-papers'
];
const bucketName = 'question-constellation';
const r2Prefix = 'images/papers';
const defaultConcurrency = 4;
const localWranglerPath = path.join(rootDir, 'node_modules/.bin/wrangler');
const wranglerCommand = existsSync(localWranglerPath) ? localWranglerPath : 'wrangler';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const explicitAssetRoot = stringArg('asset-root', '');
const baselinePath = stringArg('referenced-baseline', '');
const expectedBaselineSha256 = stringArg('expected-baseline-sha256', '');
const expectedBaselineCanonicalJsonSha256 = stringArg(
	'expected-baseline-canonical-json-sha256',
	''
);
const assetManifestPath = stringArg('asset-manifest', '');
const expectedAssetManifestSha256 = stringArg('expected-asset-manifest-sha256', '');
const expectedAssetManifestCanonicalJsonSha256 = stringArg(
	'expected-asset-manifest-canonical-json-sha256',
	''
);
if (Boolean(expectedBaselineSha256) !== Boolean(expectedBaselineCanonicalJsonSha256)) {
	throw new Error('Pass both expected referenced-baseline hashes together.');
}
if (Boolean(expectedAssetManifestSha256) !== Boolean(expectedAssetManifestCanonicalJsonSha256)) {
	throw new Error('Pass both expected learner asset manifest hashes together.');
}
if (assetManifestPath && !baselinePath) {
	throw new Error('An exact learner asset manifest requires --referenced-baseline=<json>.');
}
const sourceDocumentId = stringArg('source-document-id', '');
const localAssetRoot = resolveAssetRoot();
const limit = integerArg('limit', null, 1);
const offset = integerArg('offset', 0, 0);
const concurrency = integerArg('concurrency', defaultConcurrency, 1);
const maxRetries = integerArg('retries', 3, 0);
let baselineBinding = null;
let assetManifestBinding = null;

const usage = `Usage:
node scripts/upload-r2-images.mjs [--dry-run] [--asset-root=<dir>] [--referenced-baseline=<json>] [--asset-manifest=<json>] [--source-document-id=<id>]

Defaults to uploading all local assets from the first existing current extraction asset root.
Use --referenced-baseline=<json> only to filter uploads to assets referenced by an existing extraction JSON.
Use --asset-manifest=<json> to require exact staged bytes and mandatory remote readback verification.
Use --source-document-id=<id> for Codex SDK extraction assets that should be stored under images/papers/<id>/.`;

if (args.has('--help')) {
	console.log(usage);
	process.exit(0);
}

function stringArg(name, defaultValue) {
	const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	if (!arg) return defaultValue;
	return arg.slice(name.length + 3);
}

function integerArg(name, defaultValue, minValue) {
	const arg = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
	if (!arg) return defaultValue;
	const rawValue = arg.slice(name.length + 3);
	const value = Number(rawValue);
	if (!Number.isInteger(value) || value < minValue) {
		throw new Error(`--${name} must be an integer greater than or equal to ${minValue}.`);
	}
	return value;
}

function resolveAssetRoot() {
	if (explicitAssetRoot) {
		return path.isAbsolute(explicitAssetRoot)
			? explicitAssetRoot
			: path.join(rootDir, explicitAssetRoot);
	}
	for (const candidate of defaultAssetRoots) {
		const fullPath = path.join(rootDir, candidate);
		if (existsSync(fullPath)) return fullPath;
	}
	return path.join(rootDir, defaultAssetRoots[0]);
}

function contentTypeForFile(filePath) {
	const lowerPath = filePath.toLowerCase();

	if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) return 'image/jpeg';
	if (lowerPath.endsWith('.png')) return 'image/png';
	if (lowerPath.endsWith('.webp')) return 'image/webp';
	if (lowerPath.endsWith('.gif')) return 'image/gif';
	if (lowerPath.endsWith('.svg')) return 'image/svg+xml';

	return 'application/octet-stream';
}

function listFiles(dir) {
	const files = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...listFiles(fullPath));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}
	return files;
}

function toUploadItem(filePath) {
	const relativePath = path.relative(localAssetRoot, filePath).split(path.sep).join('/');
	if (relativePath.startsWith('../') || relativePath === '..') {
		throw new Error(
			`Referenced asset ${path.relative(rootDir, filePath)} is outside --asset-root=${path.relative(rootDir, localAssetRoot)}.`
		);
	}
	const key = sourceDocumentId
		? `${r2Prefix}/${sourceDocumentId}/${path.basename(filePath)}`
		: `${r2Prefix}/${relativePath}`;
	return {
		filePath,
		key,
		contentType: contentTypeForFile(filePath),
		size: statSync(filePath).size
	};
}

function assertPathExists(filePath, description) {
	if (!existsSync(filePath)) {
		throw new Error(`${description} was not found at ${path.relative(rootDir, filePath)}.`);
	}
}

function assertInputsAvailable() {
	if (!assetManifestPath) {
		assertPathExists(localAssetRoot, 'Local question-paper asset directory');
	}
	if (baselinePath) {
		assertPathExists(
			path.isAbsolute(baselinePath) ? baselinePath : path.join(rootDir, baselinePath),
			'Referenced extraction JSON'
		);
	}
	if (assetManifestPath) {
		assertPathExists(
			path.isAbsolute(assetManifestPath)
				? assetManifestPath
				: path.join(rootDir, assetManifestPath),
			'Learner asset manifest'
		);
	}
}

function referencedUploadItems() {
	const resolvedBaselinePath = path.isAbsolute(baselinePath)
		? baselinePath
		: path.join(rootDir, baselinePath);
	if (!baselineBinding) {
		baselineBinding = captureBoundJsonInput(resolvedBaselinePath, {
			rootDir,
			expectedSha256: expectedBaselineSha256,
			expectedCanonicalJsonSha256: expectedBaselineCanonicalJsonSha256,
			label: 'Referenced extraction baseline'
		});
	}
	const baseline = baselineBinding.value;
	if (assetManifestPath) return manifestUploadItems(baseline);
	const items = new Map();

	for (const question of baseline.questions ?? []) {
		for (const asset of question.assets ?? []) {
			const assetPath = asset.file_path ?? asset.filePath ?? asset.localPath ?? asset.path;
			if (!assetPath) continue;
			const filePath = path.isAbsolute(assetPath) ? assetPath : path.join(rootDir, assetPath);
			const item = toUploadItem(filePath);
			items.set(item.key, item);
		}
	}

	return Array.from(items.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function manifestUploadItems(baseline) {
	if (!assetManifestBinding) {
		const resolvedManifestPath = path.isAbsolute(assetManifestPath)
			? assetManifestPath
			: path.join(rootDir, assetManifestPath);
		assetManifestBinding = captureBoundJsonInput(resolvedManifestPath, {
			rootDir,
			expectedSha256: expectedAssetManifestSha256,
			expectedCanonicalJsonSha256: expectedAssetManifestCanonicalJsonSha256,
			label: 'Learner asset manifest'
		});
	}
	assertLearnerVisibleAssetBundleCurrent({
		paper: baseline,
		manifest: assetManifestBinding.value,
		rootDir
	});
	if (sourceDocumentId && assetManifestBinding.value.sourceDocumentId !== sourceDocumentId) {
		throw new Error('Learner asset manifest source document id differs from the upload target.');
	}
	return assetManifestBinding.value.entries
		.map((entry) => {
			const filePath = path.resolve(rootDir, entry.snapshotPath);
			return {
				filePath,
				key: entry.r2Key,
				contentType: entry.contentType,
				size: entry.size,
				sha256: entry.sha256
			};
		})
		.sort((left, right) => left.key.localeCompare(right.key));
}

function runWranglerPutOnce(item) {
	return new Promise((resolve, reject) => {
		const child = execFile(
			wranglerCommand,
			[
				'r2',
				'object',
				'put',
				`${bucketName}/${item.key}`,
				'--remote',
				'--file',
				item.filePath,
				'--content-type',
				item.contentType,
				'--cache-control',
				'public, max-age=31536000, immutable',
				'--force'
			],
			{ cwd: rootDir, maxBuffer: 1024 * 1024 },
			(error, stdout, stderr) => {
				if (error) {
					reject(new Error(stderr || stdout || error.message));
					return;
				}
				resolve();
			}
		);
		child.stdin?.end();
	});
}

async function runWranglerPut(item) {
	let attempt = 0;
	while (true) {
		try {
			assertUploadInputsCurrent();
			assertUploadItemCurrent(item);
			await runWranglerPutOnce(item);
			assertUploadInputsCurrent();
			assertUploadItemCurrent(item);
			if (assetManifestBinding) await verifyRemoteObject(item);
			assertUploadInputsCurrent();
			assertUploadItemCurrent(item);
			return;
		} catch (error) {
			attempt += 1;
			if (attempt > maxRetries) throw error;
			const delayMs = Math.min(30000, 1000 * 2 ** (attempt - 1));
			console.warn(`Retrying ${item.key} after upload failure (${attempt}/${maxRetries})`);
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
}

function assertUploadInputsCurrent() {
	if (baselineBinding) {
		assertBoundJsonInputCurrent(baselineBinding, {
			label: 'Referenced extraction baseline'
		});
	}
	if (assetManifestBinding) {
		assertBoundJsonInputCurrent(assetManifestBinding, {
			label: 'Learner asset manifest'
		});
		assertLearnerVisibleAssetBundleCurrent({
			paper: baselineBinding.value,
			manifest: assetManifestBinding.value,
			rootDir
		});
	}
}

function assertUploadItemCurrent(item) {
	if (!item.sha256) return;
	const stats = statSync(item.filePath);
	if (stats.size !== item.size || fileSha256(item.filePath) !== item.sha256) {
		throw new Error(`Staged learner asset changed before upload/readback: ${item.key}`);
	}
}

async function verifyRemoteObject(item) {
	const readbackRoot = mkdtempSync(path.join(tmpdir(), 'question-r2-readback-'));
	const outputPath = path.join(readbackRoot, 'object');
	try {
		await new Promise((resolve, reject) => {
			const child = execFile(
				wranglerCommand,
				['r2', 'object', 'get', `${bucketName}/${item.key}`, '--remote', '--file', outputPath],
				{ cwd: rootDir, maxBuffer: 1024 * 1024 },
				(error, stdout, stderr) => {
					if (error) {
						reject(new Error(stderr || stdout || error.message));
						return;
					}
					resolve();
				}
			);
			child.stdin?.end();
		});
		if (
			!existsSync(outputPath) ||
			statSync(outputPath).size !== item.size ||
			fileSha256(outputPath) !== item.sha256
		) {
			throw new Error(`Remote R2 readback differs from staged bytes: ${item.key}`);
		}
	} finally {
		rmSync(readbackRoot, { recursive: true, force: true });
	}
}

async function runQueue(items) {
	let nextIndex = 0;
	let uploaded = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const item = items[nextIndex];
			nextIndex += 1;
			await runWranglerPut(item);
			uploaded += 1;
			if (uploaded % 25 === 0 || uploaded === items.length) {
				console.log(`Uploaded ${uploaded}/${items.length}`);
			}
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

assertInputsAvailable();

const allItems = baselinePath
	? referencedUploadItems()
	: listFiles(localAssetRoot)
			.map(toUploadItem)
			.sort((a, b) => a.key.localeCompare(b.key));
const items = allItems.slice(offset, limit ? offset + limit : undefined);

console.log(
	JSON.stringify(
		{
			local_asset_root: path.relative(rootDir, localAssetRoot),
			bucket: bucketName,
			r2_prefix: r2Prefix,
			total_files: allItems.length,
			source: baselinePath ? 'referenced_extraction_assets' : 'all_local_assets',
			referenced_baseline: baselinePath || null,
			referenced_baseline_artifact: baselineBinding?.artifact ?? null,
			learner_asset_manifest: assetManifestPath || null,
			learner_asset_manifest_artifact: assetManifestBinding?.artifact ?? null,
			remote_readback_required: Boolean(assetManifestBinding),
			source_document_id: sourceDocumentId || null,
			offset,
			selected_files: items.length,
			total_selected_bytes: items.reduce((sum, item) => sum + item.size, 0),
			concurrency,
			retries: maxRetries,
			dry_run: dryRun
		},
		null,
		2
	)
);

for (const item of items.slice(0, 10)) {
	console.log(`${item.filePath} -> ${item.key}`);
}

if (dryRun) {
	process.exit(0);
}

try {
	await runQueue(items);
	assertUploadInputsCurrent();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
