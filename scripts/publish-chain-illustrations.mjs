#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { loadD1Env } from './lib/d1-rest.mjs';
import {
	assertPublishedIllustrationSource,
	hardImageCheck,
	publishChainIllustration
} from './lib/chain-illustration-publisher.mjs';

const rootDir = process.cwd();
const manifestPath = path.resolve(
	rootDir,
	stringArg('manifest', 'docs/chain-illustrations/manifest.json')
);
const dryRun = hasArg('dry-run');
const skipR2 = hasArg('skip-r2');
const skipD1 = hasArg('skip-d1');

loadD1Env(rootDir);

function requiredString(value, label) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value.trim();
}

function resolveProjectPath(relativePath, label) {
	const cleaned = requiredString(relativePath, label);
	const resolved = path.resolve(rootDir, cleaned);
	if (resolved !== rootDir && !resolved.startsWith(`${rootDir}${path.sep}`)) {
		throw new Error(`${label} must stay inside the repository.`);
	}
	if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${cleaned}`);
	return resolved;
}

function readManifest() {
	if (!existsSync(manifestPath)) throw new Error(`Missing manifest: ${relative(manifestPath)}`);
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (!Number.isInteger(manifest.version) || manifest.version < 1) {
		throw new Error('Manifest version must be a positive integer.');
	}
	if (!Array.isArray(manifest.illustrations) || manifest.illustrations.length === 0) {
		throw new Error('Manifest must contain at least one illustration.');
	}
	return manifest;
}

async function normalizeIllustration(entry, manifest) {
	const id = requiredString(entry.id, 'illustration.id');
	const answerChainId = requiredString(entry.answerChainId, `${id}.answerChainId`);
	const sourceQuestionId = requiredString(entry.sourceQuestionId, `${id}.sourceQuestionId`);
	const darkLocalPath = resolveProjectPath(entry.localPath, `${id}.localPath`);
	const lightLocalPath = resolveProjectPath(entry.lightLocalPath, `${id}.lightLocalPath`);
	const darkPromptPath = resolveProjectPath(entry.promptPath, `${id}.promptPath`);
	const lightPromptPath = resolveProjectPath(entry.lightPromptPath, `${id}.lightPromptPath`);
	const darkR2Key = requiredString(entry.r2Key, `${id}.r2Key`);
	const lightR2Key = requiredString(entry.lightR2Key, `${id}.lightR2Key`);
	const darkPublicPath = requiredString(entry.publicPath, `${id}.publicPath`);
	const lightPublicPath = requiredString(entry.lightPublicPath, `${id}.lightPublicPath`);
	for (const [theme, r2Key, publicPath] of [
		['dark', darkR2Key, darkPublicPath],
		['light', lightR2Key, lightPublicPath]
	]) {
		const expectedPublicPath = `/images/${r2Key.replace(/^images\//, '')}`;
		if (!r2Key.startsWith('images/chains/') || !r2Key.endsWith('.webp')) {
			throw new Error(`${id}.${theme}R2Key must be a WebP key under images/chains/.`);
		}
		if (publicPath !== expectedPublicPath) {
			throw new Error(`${id}.${theme}PublicPath must be ${expectedPublicPath}.`);
		}
	}
	const [darkCheck, lightCheck] = await Promise.all(
		[darkLocalPath, lightLocalPath].map((localPath) => hardImageCheck(localPath, { rootDir }))
	);
	for (const [theme, hardCheck, expectedSha256] of [
		['dark', darkCheck, entry.assetSha256],
		['light', lightCheck, entry.lightAssetSha256]
	]) {
		if (hardCheck.status !== 'passed') {
			throw new Error(`${id} ${theme} failed image checks: ${hardCheck.issues.join(' ')}`);
		}
		if (hardCheck.width !== entry.width || hardCheck.height !== entry.height) {
			throw new Error(
				`${id} ${theme} dimensions are ${hardCheck.width}x${hardCheck.height}, not ${entry.width}x${entry.height}.`
			);
		}
		if (expectedSha256 && hardCheck.sha256 !== expectedSha256) {
			throw new Error(`${id} ${theme} SHA-256 does not match the manifest.`);
		}
	}
	return {
		id,
		answerChainId,
		sourceQuestionId,
		altText: requiredString(entry.altText, `${id}.altText`),
		caption: requiredString(entry.caption, `${id}.caption`),
		styleKey: requiredString(manifest.styleKey, 'manifest.styleKey'),
		generationModel: entry.lightGenerationModel ?? 'codex-imagegen',
		dark: {
			localPath: darkLocalPath,
			promptText: readFileSync(darkPromptPath, 'utf8').trim(),
			r2Key: darkR2Key,
			publicPath: darkPublicPath,
			width: darkCheck.width,
			height: darkCheck.height,
			assetSha256: darkCheck.sha256
		},
		light: {
			localPath: lightLocalPath,
			promptText: readFileSync(lightPromptPath, 'utf8').trim(),
			r2Key: lightR2Key,
			publicPath: lightPublicPath,
			width: lightCheck.width,
			height: lightCheck.height,
			assetSha256: lightCheck.sha256,
			derivedFromAssetSha256: darkCheck.sha256
		},
		generationMetadata: {
			manifestVersion: manifest.version,
			generatedBy: entry.generatedBy ?? 'curated-theme-pair-manifest',
			prompts: {
				dark: { promptText: readFileSync(darkPromptPath, 'utf8').trim() },
				light: { promptText: readFileSync(lightPromptPath, 'utf8').trim() }
			},
			selectedCandidate: entry.selectedCandidate,
			candidates: entry.candidates,
			selectionRationale: entry.selectionRationale
		}
	};
}

const manifest = readManifest();
const items = await Promise.all(
	manifest.illustrations.map((entry) => normalizeIllustration(entry, manifest))
);
for (const item of items) await assertPublishedIllustrationSource(item, { rootDir });

console.log(
	JSON.stringify(
		{
			status: dryRun ? 'validated' : 'publishing',
			manifest: relative(manifestPath),
			illustrations: items.map((item) => ({
				id: item.id,
				answerChainId: item.answerChainId,
				darkR2Key: item.dark.r2Key,
				lightR2Key: item.light.r2Key,
				dimensions: `${item.dark.width}x${item.dark.height}`
			})),
			skipR2,
			skipD1
		},
		null,
		2
	)
);

if (!dryRun) {
	for (const item of items) {
		await publishChainIllustration(item, { rootDir, skipR2, skipD1 });
	}
	console.log(`Published ${items.length} chain illustrations.`);
}

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}
