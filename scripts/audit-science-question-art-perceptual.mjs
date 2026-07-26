#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { stableStringify, validateQuestionArtManifest } from './lib/science-challenge-release.mjs';
import {
	SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
	buildPerceptualAudit,
	validatePerceptualAudit
} from './lib/science-question-art-perceptual.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}

const manifestPath = path.resolve(rootDir, args.manifest);
if (!existsSync(manifestPath)) throw new Error(`Art manifest does not exist: ${manifestPath}`);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const manifestValidation = validateQuestionArtManifest(manifest, {
	expectedCount: args.requireCount
});
if (manifestValidation.status !== 'passed') {
	throw new Error(`Art manifest validation failed:\n${manifestValidation.issues.join('\n')}`);
}

const audit = buildPerceptualAudit(manifest, {
	rootDir,
	threshold: SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
	batchSize: args.batchSize
});
const assetInventory = manifest.specs.map((spec) => {
	const dark = audit.records.find((record) => record.id === `${spec.id}-dark`);
	const light = audit.records.find((record) => record.id === `${spec.id}-light`);
	return { id: spec.id, darkSha256: dark?.sha256, lightSha256: light?.sha256 };
});
const validation = validatePerceptualAudit(audit, {
	manifest,
	assetInventory,
	expectedRecordCount: args.requireCount * 2
});
if (validation.status !== 'passed' && audit.status === 'passed') {
	audit.status = 'failed';
	audit.validationIssues = validation.issues;
}

const outputPath = path.resolve(rootDir, args.output);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${stableStringify(audit)}\n`);
console.log(
	JSON.stringify(
		{
			status: validation.status,
			releaseId: manifest.releaseId,
			recordCount: audit.recordCount,
			collisionCount: audit.collisionCount,
			output: path.relative(rootDir, outputPath),
			issues: validation.issues
		},
		null,
		2
	)
);
if (validation.status !== 'passed') process.exit(1);

function parseArgs(argv) {
	const values = new Map();
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') values.set('help', true);
		else if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			values.set(key, rest.join('='));
		}
	}
	return {
		help: Boolean(values.get('help')),
		manifest: String(
			values.get('manifest') ?? 'tmp/science-challenges/science-500-v1/compiled/art-manifest.json'
		),
		output: String(
			values.get('output') ??
				'tmp/science-challenges/science-500-v1/art-review/perceptual-audit.json'
		),
		requireCount: integer(values.get('require-count') ?? 1_000, '--require-count', 1, 1_000),
		batchSize: integer(values.get('batch-size') ?? 100, '--batch-size', 1, 250)
	};
}

function integer(value, label, minimum, maximum) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
	}
	return parsed;
}

function usage() {
	return [
		'Usage: node scripts/audit-science-question-art-perceptual.mjs [options]',
		'',
		'--manifest=<art-manifest.json>',
		'--output=<perceptual-audit.json>',
		'--require-count=<count>    Full manifest count gate; default 1000',
		'--batch-size=<1-250>       ImageMagick inputs per hashing batch; default 100'
	].join('\n');
}
