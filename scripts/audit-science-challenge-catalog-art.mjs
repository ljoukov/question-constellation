#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createServer } from 'vite';

import {
	SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS,
	buildScienceChallengeCatalogArtAudit,
	publishScienceChallengeCatalogArtAudit,
	resolveScienceChallengeCatalogArtAuditOutput
} from './lib/science-challenge-catalog-art-audit.mjs';
import { canonicalHash } from './lib/science-challenge-release.mjs';

const DEFAULT_ACCEPTED_SUBSET =
	'tmp/science-challenges/science-179-v1/accepted-subset-evidence/accepted-subset.json';
const DEFAULT_ART_MANIFEST = 'tmp/science-challenges/science-179-v1/compiled/art-manifest.json';
const DEFAULT_RETAINED_STATIC_MANIFEST =
	'tmp/science-challenges/science-179-v1-retained-static-final-v1/art-manifest.json';
const DEFAULT_RETAINED_STATIC_REVIEW =
	'tmp/science-challenges/science-179-v1-retained-static-final-v1/art-review/review-summary.json';
const DEFAULT_OUTPUT = 'tmp/science-challenges/science-179-v1/catalog-art-audit.json';
const VALUE_OPTIONS = Object.freeze([
	'accepted-subset',
	'art-evidence-root',
	'art-manifest',
	'retained-static-manifest',
	'retained-static-review',
	'output'
]);
const BOOLEAN_OPTIONS = Object.freeze(['dry-run', 'help']);

export async function main(
	argv = process.argv.slice(2),
	repositoryRoot = process.cwd(),
	dependencies = {}
) {
	const args = parseArgs(argv);
	if (args.help) {
		console.log(usage());
		return;
	}
	const root = realpathSync(repositoryRoot);
	const output = resolveScienceChallengeCatalogArtAuditOutput(root, args.output);
	if (existsSync(output.absolute)) {
		throw new Error(`Catalog art audit already exists and is immutable: ${output.relative}`);
	}

	const readJson = dependencies.readRepoJson ?? readRepoJson;
	const loadAuthored = dependencies.loadAuthoredCatalogAndVisuals ?? loadAuthoredCatalogAndVisuals;
	const buildAudit =
		dependencies.buildScienceChallengeCatalogArtAudit ?? buildScienceChallengeCatalogArtAudit;
	const publishAudit =
		dependencies.publishScienceChallengeCatalogArtAudit ?? publishScienceChallengeCatalogArtAudit;
	const artEvidenceRoot = resolveArtEvidenceRoot(root, args.artEvidenceRoot);
	const acceptedSubset = readJson(root, args.acceptedSubset, 'accepted subset');
	const artManifest = readJson(artEvidenceRoot, args.artManifest, 'art manifest');
	const retainedStaticManifest = readJson(
		root,
		args.retainedStaticManifest,
		'retained static art manifest'
	);
	const retainedStaticReview = readJson(
		root,
		args.retainedStaticReview,
		'retained static art review'
	);
	const { definitions: authoredDefinitions, visuals: authoredVisuals } = await loadAuthored(root);
	const audit = buildAudit({
		repositoryRoot: root,
		acceptedSubset,
		acceptedSubsetPath: args.acceptedSubset,
		artManifest,
		artManifestPath: args.artManifest,
		retainedStaticManifest,
		retainedStaticManifestPath: args.retainedStaticManifest,
		retainedStaticReview,
		retainedStaticReviewPath: args.retainedStaticReview,
		authoredDefinitions,
		authoredVisuals
	});
	const summary = {
		status: audit.status,
		dryRun: args.dryRun,
		releaseId: audit.releaseId,
		output: output.relative,
		auditSha256: canonicalHash(audit),
		counts: audit.counts,
		hashes: audit.hashes,
		perceptualCollisions: audit.perceptualAudit.collisions,
		functionalDiagramRequirements: audit.functionalDiagramAudit.requirements,
		questionAuthorityFindings: audit.questionAuthorityAudit.findings,
		retainedStaticReview: audit.retainedStaticReviewAudit
	};
	console.log(JSON.stringify(summary, null, 2));
	if (audit.status !== 'passed') {
		const failures = [];
		if (audit.perceptualAudit.collisionCount) {
			failures.push(
				`${audit.perceptualAudit.collisionCount} cross-challenge perceptual collision(s)`
			);
		}
		if (audit.functionalDiagramAudit.unresolvedCount) {
			failures.push(
				`${audit.functionalDiagramAudit.unresolvedCount} unresolved functional diagram requirement(s)`
			);
		}
		if (audit.questionAuthorityAudit.majorMismatchCount) {
			failures.push(
				`${audit.questionAuthorityAudit.majorMismatchCount} learner-question/art authority contradiction(s)`
			);
		}
		if (audit.retainedStaticReviewAudit.status !== 'passed') {
			failures.push('retained authored-static semantic review did not pass');
		}
		throw new Error(`Catalog art audit failed: ${failures.join('; ')}.`);
	}
	if (!args.dryRun) {
		publishAudit({
			repositoryRoot: root,
			outputPath: output.relative,
			audit,
			expectations: SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS
		});
	}
	return { audit, summary };
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
	return {
		help: false,
		dryRun: Boolean(values.get('dry-run')),
		acceptedSubset: values.get('accepted-subset') ?? DEFAULT_ACCEPTED_SUBSET,
		artEvidenceRoot: values.get('art-evidence-root') ?? '.',
		artManifest: values.get('art-manifest') ?? DEFAULT_ART_MANIFEST,
		retainedStaticManifest:
			values.get('retained-static-manifest') ?? DEFAULT_RETAINED_STATIC_MANIFEST,
		retainedStaticReview: values.get('retained-static-review') ?? DEFAULT_RETAINED_STATIC_REVIEW,
		output: values.get('output') ?? DEFAULT_OUTPUT
	};
}

export function usage() {
	return [
		'Usage: node scripts/audit-science-challenge-catalog-art.mjs [options]',
		'',
		`--accepted-subset=<repo-relative JSON>  Default: ${DEFAULT_ACCEPTED_SUBSET}`,
		'--art-evidence-root=<checkout>           Default: current repository',
		`--art-manifest=<repo-relative JSON>     Default: ${DEFAULT_ART_MANIFEST}`,
		`--retained-static-manifest=<JSON>       Default: ${DEFAULT_RETAINED_STATIC_MANIFEST}`,
		`--retained-static-review=<JSON>         Default: ${DEFAULT_RETAINED_STATIC_REVIEW}`,
		`--output=<absent repo-relative JSON>    Default: ${DEFAULT_OUTPUT}`,
		'--dry-run   Run every ownership, byte, semantic-review, perceptual and diagram gate without writing',
		'--help'
	].join('\n');
}

export function resolveArtEvidenceRoot(repositoryRoot, evidenceRoot) {
	if (
		typeof evidenceRoot !== 'string' ||
		!evidenceRoot.trim() ||
		path.isAbsolute(evidenceRoot) ||
		evidenceRoot.includes('\\')
	) {
		throw new Error('Art evidence root must be a relative checkout directory.');
	}
	const candidate = path.resolve(repositoryRoot, evidenceRoot);
	if (!existsSync(candidate)) {
		throw new Error('Art evidence root does not exist.');
	}
	const metadata = lstatSync(candidate);
	if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
		throw new Error('Art evidence root must be a real non-symlink directory.');
	}
	return realpathSync(candidate);
}

export async function loadAuthoredCatalogAndVisuals(repositoryRoot) {
	const server = await createServer({
		root: repositoryRoot,
		server: { middlewareMode: true },
		appType: 'custom',
		logLevel: 'silent'
	});
	try {
		const [catalogModule, identityModule, visualsModule] = await Promise.all([
			server.ssrLoadModule('/src/lib/challenges/catalog.ts'),
			server.ssrLoadModule('/src/lib/challenges/catalogIdentity.ts'),
			server.ssrLoadModule('/src/lib/challenges/visuals.ts')
		]);
		if (
			!Array.isArray(catalogModule.challengeCatalog) ||
			!Array.isArray(identityModule.authoredChallengeIds) ||
			typeof visualsModule.challengeVisual !== 'function'
		) {
			throw new Error('Vite challenge catalog/visual exports are incomplete.');
		}
		const catalogById = new Map(
			catalogModule.challengeCatalog.map((definition) => [definition.id, definition])
		);
		const definitions = identityModule.authoredChallengeIds.map((id) => {
			const definition = catalogById.get(id);
			if (!definition) throw new Error(`Vite authored catalog is missing ${id}.`);
			return definition;
		});
		const visuals = definitions.map((definition) => ({
			challengeId: definition.id,
			visual: visualsModule.challengeVisual(definition)
		}));
		return { definitions, visuals };
	} finally {
		await server.close();
	}
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
	if (!isInside(root, absolute) || !existsSync(absolute)) {
		throw new Error(`${label} does not exist: ${relative}`);
	}
	const metadata = lstatSync(absolute);
	if (!metadata.isFile() || metadata.isSymbolicLink()) {
		throw new Error(`${label} must be a regular non-symlink file: ${relative}`);
	}
	const real = realpathSync(absolute);
	if (!isInside(root, real)) throw new Error(`${label} resolves outside the repository.`);
	return { absolute: real, relative };
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
