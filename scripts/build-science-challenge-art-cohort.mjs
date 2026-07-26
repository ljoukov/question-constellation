#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createServer } from 'vite';

import {
	buildScienceChallengeArtCohort,
	publishScienceChallengeArtCohort,
	resolveScienceChallengeArtCohortOutput
} from './lib/science-challenge-art-cohort.mjs';
import { canonicalHash } from './lib/science-challenge-release.mjs';

const VALUE_OPTIONS = Object.freeze(['source-art-manifest', 'verification-summary', 'output']);
const BOOLEAN_OPTIONS = Object.freeze(['dry-run', 'help']);

export async function main(argv = process.argv.slice(2), repositoryRoot = process.cwd()) {
	const args = parseArgs(argv);
	if (args.help) {
		console.log(usage());
		return;
	}

	const root = realpathSync(repositoryRoot);
	const output = resolveScienceChallengeArtCohortOutput(root, args.output);
	if (existsSync(output.absolute)) {
		throw new Error(`Art cohort output already exists and is immutable: ${output.relative}`);
	}
	const sourceArtManifest = readRepoJson(root, args.sourceArtManifest, 'source art manifest');
	const verificationSummary = readRepoJson(root, args.verificationSummary, 'verification summary');
	const existingExpansionIds = await loadExistingExpansionIds(root);
	const manifest = buildScienceChallengeArtCohort({
		sourceArtManifest,
		verificationSummary,
		existingExpansionIds
	});
	const manifestSha256 = canonicalHash(manifest);
	const publication = args.dryRun
		? null
		: publishScienceChallengeArtCohort({
				repositoryRoot: root,
				outputPath: output.relative,
				manifest
			});

	console.log(
		JSON.stringify(
			{
				status: args.dryRun ? 'planned' : publication.status,
				dryRun: args.dryRun,
				releaseId: manifest.releaseId,
				pairPolicy: manifest.cohort.pairPolicy,
				ownerCount: manifest.cohort.ownerCount,
				pairCount: manifest.cohort.pairCount,
				fileCount: manifest.cohort.fileCount,
				acceptedNewOwnerCount: manifest.cohort.acceptedNewOwnerCount,
				existingReplacementOwnerCount: manifest.cohort.existingReplacementOwnerCount,
				output: output.relative,
				manifestSha256,
				source: manifest.cohort.source,
				acceptedNewOwnerIdsSha256: manifest.cohort.acceptedNewOwnerIdsSha256,
				existingReplacementOwnerIdsSha256: manifest.cohort.existingReplacementOwnerIdsSha256,
				ownerIdsSha256: manifest.cohort.ownerIdsSha256
			},
			null,
			2
		)
	);
}

export function parseArgs(argv) {
	const values = new Map();
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			setBoolean(values, 'help');
			continue;
		}
		if (arg === '--dry-run') {
			setBoolean(values, 'dry-run');
			continue;
		}
		if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...valueParts] = arg.slice(2).split('=');
			if (BOOLEAN_OPTIONS.includes(key)) {
				throw new Error(`--${key} is a boolean flag and does not accept a value.`);
			}
			if (!VALUE_OPTIONS.includes(key)) throw new Error(`Unknown option --${key}.`);
			const value = valueParts.join('=');
			if (!value) throw new Error(`--${key} requires a value.`);
			if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
			values.set(key, value);
			continue;
		}
		if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}.`);
		throw new Error(`Unexpected positional argument ${arg}.`);
	}
	if (values.has('help')) {
		return { help: true, dryRun: Boolean(values.get('dry-run')) };
	}
	for (const key of VALUE_OPTIONS) {
		if (!values.has(key)) throw new Error(`--${key} is required.`);
	}
	return {
		help: false,
		dryRun: Boolean(values.get('dry-run')),
		sourceArtManifest: values.get('source-art-manifest'),
		verificationSummary: values.get('verification-summary'),
		output: values.get('output')
	};
}

export function usage() {
	return [
		'Usage: node scripts/build-science-challenge-art-cohort.mjs [options]',
		'',
		'--source-art-manifest=<repo-relative authoritative 1,000-spec JSON>',
		'--verification-summary=<repo-relative independent verification summary JSON>',
		'--output=<absent repo-relative JSON>',
		'--dry-run   Validate and report the immutable cohort without writing',
		'--help'
	].join('\n');
}

function setBoolean(values, key) {
	if (values.has(key)) throw new Error(`Duplicate --${key} flag.`);
	values.set(key, true);
}

function readRepoJson(root, relativePath, label) {
	const resolved = resolveRepoInput(root, relativePath, label);
	try {
		return JSON.parse(readFileSync(resolved.absolute, 'utf8'));
	} catch (error) {
		throw new Error(
			`${label} is not valid JSON (${resolved.relative}): ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error }
		);
	}
}

function resolveRepoInput(root, relativePath, label) {
	if (
		typeof relativePath !== 'string' ||
		path.isAbsolute(relativePath) ||
		relativePath.includes('\\')
	) {
		throw new Error(`${label} must be a repo-relative path.`);
	}
	const segments = relativePath.split('/');
	if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
		throw new Error(`${label} must not contain empty, dot or parent path segments.`);
	}
	const relative = segments.join('/');
	const absolute = path.resolve(root, relative);
	if (!isInside(root, absolute)) throw new Error(`${label} must remain inside the repository.`);
	if (!existsSync(absolute)) throw new Error(`${label} does not exist: ${relative}`);
	const metadata = lstatSync(absolute);
	if (metadata.isSymbolicLink() || !metadata.isFile()) {
		throw new Error(`${label} must be a regular non-symlink file: ${relative}`);
	}
	const real = realpathSync(absolute);
	if (!isInside(root, real)) throw new Error(`${label} resolves outside the repository.`);
	return { absolute: real, relative };
}

async function loadExistingExpansionIds(root) {
	const server = await createServer({
		root,
		configFile: false,
		server: { middlewareMode: true },
		appType: 'custom',
		logLevel: 'silent'
	});
	try {
		const modules = await Promise.all([
			server.ssrLoadModule('/src/lib/challenges/expansions/biology.ts'),
			server.ssrLoadModule('/src/lib/challenges/expansions/chemistry.ts'),
			server.ssrLoadModule('/src/lib/challenges/expansions/physics.ts')
		]);
		const exports = [
			['biologyExpansion', modules[0].biologyExpansion],
			['chemistryExpansion', modules[1].chemistryExpansion],
			['physicsExpansion', modules[2].physicsExpansion]
		];
		const ids = [];
		for (const [name, entries] of exports) {
			if (!Array.isArray(entries)) throw new Error(`${name} must export an array.`);
			for (const entry of entries) ids.push(entry?.id);
		}
		return ids;
	} finally {
		await server.close();
	}
}

function isInside(root, candidate) {
	return candidate.startsWith(`${root}${path.sep}`) && candidate !== root;
}

function isMainModule() {
	if (!process.argv[1]) return false;
	return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
