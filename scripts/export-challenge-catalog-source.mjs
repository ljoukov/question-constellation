#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { CHALLENGE_CATALOG_SOURCE_SCHEMA, canonicalHash } from './lib/challenge-catalog-bundle.mjs';
import { loadD1Env } from './lib/d1-rest.mjs';
import { loadChallengeCatalogSource } from './lib/challenge-catalog-source.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
loadD1Env(rootDir);
const source = await loadChallengeCatalogSource({ rootDir, sourcePath: null });
const unsigned = {
	schemaVersion: CHALLENGE_CATALOG_SOURCE_SCHEMA,
	release: source.release,
	records: source.records,
	subjects: source.subjects,
	arcs: source.arcs,
	socialImage: source.socialImage
};
const output = { ...unsigned, contentSha256: canonicalHash(unsigned) };
const outputPath = path.resolve(rootDir, args.output);
const ignoredRoot = path.resolve(rootDir, 'tmp');
const outputRelativeToIgnored = path.relative(ignoredRoot, outputPath);
if (
	!outputRelativeToIgnored ||
	outputRelativeToIgnored.startsWith(`..${path.sep}`) ||
	path.isAbsolute(outputRelativeToIgnored)
) {
	throw new Error('--output must be an ignored file under tmp/.');
}
if (existsSync(outputPath)) {
	const existing = JSON.parse(readFileSync(outputPath, 'utf8'));
	if (existing.contentSha256 !== output.contentSha256) {
		throw new Error(`Refusing to overwrite a different catalogue source: ${outputPath}`);
	}
	console.log(
		JSON.stringify({
			status: 'already-current',
			output: path.relative(rootDir, outputPath),
			releaseId: source.release?.id,
			challenges: source.records.length,
			contentSha256: output.contentSha256
		})
	);
	process.exit(0);
}
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: 'wx' });
console.log(
	JSON.stringify(
		{
			status: 'passed',
			output: path.relative(rootDir, outputPath),
			releaseId: source.release?.id,
			challenges: source.records.length,
			contentSha256: output.contentSha256
		},
		null,
		2
	)
);

function parseArgs(argv) {
	const values = new Map();
	for (const argument of argv) {
		if (argument === '--') continue;
		if (argument === '--help') {
			if (values.has('help')) throw new Error('Duplicate --help option.');
			values.set('help', true);
			continue;
		}
		const match = argument.match(/^--output=(.+)$/u);
		if (!match) throw new Error(`Unknown argument: ${argument}`);
		if (values.has('output')) throw new Error('Duplicate --output option.');
		values.set('output', match[1]);
	}
	return {
		help: Boolean(values.get('help')),
		output: String(values.get('output') ?? 'tmp/challenge-catalog/current-source.json')
	};
}

function usage() {
	return `Usage: node scripts/export-challenge-catalog-source.mjs [options]

Export the active D1 catalogue as canonical authoring records under ignored tmp/.

Options:
  --output=<tmp/.../challenge-catalog-source.json>
  --help`;
}
