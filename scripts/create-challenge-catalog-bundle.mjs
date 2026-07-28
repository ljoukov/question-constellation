#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
	createChallengeCatalogBundle,
	validateChallengeCatalogBundle
} from './lib/challenge-catalog-bundle.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}

const draftPath = resolveIgnoredPath(args.draft, 'catalogue draft');
const outputPath = resolveIgnoredPath(args.output, 'bundle output');
if (!existsSync(draftPath)) throw new Error(`Catalogue draft does not exist: ${draftPath}`);

const bundle = createChallengeCatalogBundle({
	rootDir,
	draft: JSON.parse(readFileSync(draftPath, 'utf8'))
});
const validation = validateChallengeCatalogBundle(bundle, { rootDir, verifyFiles: true });
if (existsSync(outputPath)) {
	const existingValidation = validateChallengeCatalogBundle(
		JSON.parse(readFileSync(outputPath, 'utf8')),
		{ rootDir, verifyFiles: true }
	);
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
		const match = argument.match(/^--(draft|output)=(.+)$/u);
		if (!match) throw new Error(`Unknown argument: ${argument}`);
		if (values.has(match[1])) throw new Error(`Duplicate --${match[1]} option.`);
		values.set(match[1], match[2]);
	}
	const help = Boolean(values.get('help'));
	if (!help) {
		for (const name of ['draft', 'output']) {
			if (!values.has(name)) throw new Error(`--${name} is required.`);
		}
	}
	return {
		help,
		draft: String(values.get('draft') ?? ''),
		output: String(values.get('output') ?? '')
	};
}

function usage() {
	return `Usage: node scripts/create-challenge-catalog-bundle.mjs [options]

Create a first immutable catalogue release directly from one complete challenge-catalog-draft/v1
document. The draft, image assets, and output must stay under ignored tmp/. No other catalogue
formats or source-code data are accepted.

Options:
  --draft=<challenge-catalog-draft.json>
  --output=<challenge-catalog-bundle.json>
  --help`;
}
