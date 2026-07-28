#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
	deriveChallengeCatalogBundle,
	sha256,
	validateChallengeCatalogBundle
} from './lib/challenge-catalog-bundle.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}

const sourcePath = resolveIgnoredPath(args.bundle, 'source bundle');
const changePath = resolveIgnoredPath(args.changes, 'change set');
const outputPath = resolveIgnoredPath(args.output, 'derived bundle output');
for (const [label, filePath] of [
	['source bundle', sourcePath],
	['change set', changePath]
]) {
	if (!existsSync(filePath)) throw new Error(`${label} does not exist: ${filePath}`);
}

const sourceBundle = readJson(sourcePath);
const changeSet = readJson(changePath);
const bundle = deriveChallengeCatalogBundle({
	rootDir,
	sourceBundle,
	releaseId: args.releaseId,
	changeSet,
	changeFileSha256: sha256(readFileSync(changePath))
});
const validation = validateChallengeCatalogBundle(bundle, { rootDir, verifyFiles: true });

if (existsSync(outputPath)) {
	const existingValidation = validateChallengeCatalogBundle(readJson(outputPath), {
		rootDir,
		verifyFiles: true
	});
	if (existingValidation.contentSha256 !== validation.contentSha256) {
		throw new Error(`Refusing to overwrite a different bundle: ${outputPath}`);
	}
	console.log(
		JSON.stringify(
			{ status: 'already-current', output: relative(outputPath), ...validation },
			null,
			2
		)
	);
	process.exit(0);
}

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, { flag: 'wx' });
console.log(
	JSON.stringify({ status: 'passed', output: relative(outputPath), ...validation }, null, 2)
);

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveIgnoredPath(value, label) {
	const resolved = path.resolve(rootDir, value);
	const ignoredRoot = path.resolve(rootDir, 'tmp');
	const relativePath = path.relative(ignoredRoot, resolved);
	if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
		throw new Error(`${label} must be a file under ignored tmp/.`);
	}
	return resolved;
}

function relative(filePath) {
	return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function parseArgs(argv) {
	const values = new Map();
	for (const argument of argv) {
		if (argument === '--') continue;
		if (argument === '--help') {
			if (values.has('help')) throw new Error('Duplicate --help option.');
			values.set('help', true);
			continue;
		}
		const match = argument.match(/^--(bundle|changes|release-id|output)=(.+)$/u);
		if (!match) throw new Error(`Unknown argument: ${argument}`);
		if (values.has(match[1])) throw new Error(`Duplicate --${match[1]} option.`);
		values.set(match[1], match[2]);
	}
	const help = Boolean(values.get('help'));
	if (!help) {
		for (const name of ['bundle', 'changes', 'release-id', 'output']) {
			if (!values.has(name)) throw new Error(`--${name} is required.`);
		}
	}
	return {
		help,
		bundle: String(values.get('bundle') ?? ''),
		changes: String(values.get('changes') ?? ''),
		releaseId: String(values.get('release-id') ?? ''),
		output: String(values.get('output') ?? '')
	};
}

function usage() {
	return `Usage: node scripts/derive-challenge-catalog-bundle.mjs [options]

Derive a new immutable catalogue release from a portable D1/R2 export and one final-state change set.
The change set can add, completely replace, or remove records and assets. Partial record patches are
not accepted. All inputs and outputs must be under ignored tmp/. Release-scoped R2 keys and every
denormalized route payload are rebuilt.

Options:
  --bundle=<portable-bundle.json>
  --changes=<challenge-catalog-changes.json>
  --release-id=<new-release-id>
  --output=<new-bundle.json>
  --help`;
}
