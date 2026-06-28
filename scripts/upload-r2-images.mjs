#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const defaultAssetRoots = [
	'data/vision-extracted/aqa-separate-science-higher/assets/question-papers',
	'data/vision-extracted/aqa-combined-science-trilogy-higher/assets/question-papers',
	'data/aqa-combined-science-trilogy-higher/assets/question-papers'
];
const bucketName = 'question-constellation';
const r2Prefix = 'images/papers';
const defaultConcurrency = 4;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const explicitAssetRoot = stringArg('asset-root', '');
const baselinePath = stringArg('referenced-baseline', '');
const localAssetRoot = resolveAssetRoot();
const limit = integerArg('limit', null, 1);
const offset = integerArg('offset', 0, 0);
const concurrency = integerArg('concurrency', defaultConcurrency, 1);
const maxRetries = integerArg('retries', 3, 0);

const usage = `Usage:
node scripts/upload-r2-images.mjs [--dry-run] [--asset-root=<dir>] [--referenced-baseline=<json>]

Defaults to uploading all local assets from the first existing current extraction asset root.
Use --referenced-baseline=<json> only to filter uploads to assets referenced by an existing extraction JSON.`;

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
	const key = `${r2Prefix}/${relativePath}`;
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
	assertPathExists(localAssetRoot, 'Local question-paper asset directory');
	if (baselinePath) {
		assertPathExists(
			path.isAbsolute(baselinePath) ? baselinePath : path.join(rootDir, baselinePath),
			'Referenced extraction JSON'
		);
	}
}

function referencedUploadItems() {
	const resolvedBaselinePath = path.isAbsolute(baselinePath)
		? baselinePath
		: path.join(rootDir, baselinePath);
	const baseline = JSON.parse(readFileSync(resolvedBaselinePath, 'utf8'));
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

function runWranglerPutOnce(item) {
	return new Promise((resolve, reject) => {
		const child = execFile(
			'wrangler',
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
			await runWranglerPutOnce(item);
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
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
