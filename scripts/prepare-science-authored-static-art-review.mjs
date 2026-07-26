#!/usr/bin/env node

import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createServer } from 'vite';

import {
	SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
	canonicalHash,
	scienceQuestionArtLocalPath,
	sha256,
	stableStringify,
	validateQuestionArtManifest
} from './lib/science-challenge-release.mjs';

const COHORT_SCHEMA = 'science-authored-static-art-review-cohort/v1';
const SAFE_RELEASE_ID = /^[a-z0-9][a-z0-9-]*$/u;

export async function main(argv = process.argv.slice(2), repositoryRoot = process.cwd()) {
	const args = parseArgs(argv);
	if (args.help) {
		console.log(usage());
		return;
	}
	const root = realpathSync(repositoryRoot);
	const releaseRoot = path.join(root, 'tmp', 'science-challenges', args.releaseId);
	if (existsSync(releaseRoot)) {
		throw new Error(
			`Authored-static review release already exists and is immutable: tmp/science-challenges/${args.releaseId}`
		);
	}
	const availableRows = await loadAuthoredStaticRows(root);
	const availableIds = new Set(availableRows.map((row) => row.definition.id));
	for (const id of args.ids) {
		if (!availableIds.has(id)) throw new Error(`Unknown authored-static challenge id: ${id}`);
	}
	const rows =
		args.ids.length > 0
			? availableRows.filter((row) => args.ids.includes(row.definition.id))
			: availableRows;
	const manifest = buildAuthoredStaticReviewManifest({
		repositoryRoot: root,
		releaseId: args.releaseId,
		rows
	});
	const validation = validateQuestionArtManifest(manifest, { expectedCount: rows.length });
	if (validation.status !== 'passed') {
		throw new Error(`Authored-static review manifest is invalid:\n${validation.issues.join('\n')}`);
	}
	const summary = {
		status: args.dryRun ? 'planned' : 'published',
		dryRun: args.dryRun,
		mode: args.generationCandidate ? 'fresh-generation-candidate' : 'existing-pixel-audit',
		releaseId: args.releaseId,
		retainedStaticPairCount: rows.length,
		assetCount: rows.length * 2,
		manifest: `tmp/science-challenges/${args.releaseId}/art-manifest.json`,
		manifestSha256: canonicalHash(manifest),
		sourceBindingsSha256: manifest.cohort.sourceBindingsSha256
	};
	if (!args.dryRun) {
		if (!args.generationCandidate) {
			for (const binding of manifest.cohort.sourceBindings) {
				for (const theme of ['dark', 'light']) {
					const source = path.resolve(root, binding[`${theme}SourcePath`]);
					const destination = path.resolve(root, binding[`${theme}ReviewPath`]);
					mkdirSync(path.dirname(destination), { recursive: true });
					copyFileSync(source, destination);
					if (sha256(readFileSync(destination)) !== binding[`${theme}SourceSha256`]) {
						throw new Error(`${binding.challengeId} ${theme} review copy changed in transit.`);
					}
				}
			}
		}
		mkdirSync(releaseRoot, { recursive: true });
		writeFileSync(path.join(releaseRoot, 'art-manifest.json'), `${stableStringify(manifest)}\n`, {
			flag: 'wx'
		});
	}
	console.log(JSON.stringify(summary, null, 2));
	return { manifest, summary };
}

export function buildAuthoredStaticReviewManifest({ repositoryRoot, releaseId, rows }) {
	if (!SAFE_RELEASE_ID.test(String(releaseId ?? ''))) {
		throw new Error('Review release id must be kebab-case.');
	}
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new Error('Authored-static review rows must be a non-empty array.');
	}
	const sourceBindings = [];
	const specs = [];
	for (const row of rows) {
		const id = `${row.definition.id}-opening`;
		const output = {
			darkPath: scienceQuestionArtLocalPath(releaseId, id, 'dark'),
			lightPath: scienceQuestionArtLocalPath(releaseId, id, 'light')
		};
		const dark = resolveStaticSource(repositoryRoot, row.visual.cardArt.darkSrc, `${id} dark`);
		const light = resolveStaticSource(repositoryRoot, row.visual.cardArt.src, `${id} light`);
		const altText = String(row.visual.cardArt.alt ?? '').trim();
		if (!altText) throw new Error(`${row.definition.id} has no card-art alt text.`);
		specs.push({
			schemaVersion: 'science-question-art/v1',
			id,
			challengeId: row.definition.id,
			context: 'opening',
			subject: row.definition.subject,
			question: row.definition.previewQuestion,
			scene: altText,
			visualAnchor: altText,
			altText,
			approvedMeaning:
				'The exact question-specific starting setup or blank working structure is visible while the answer remains unresolved.',
			accuracyConstraints: [
				'Every visible variable, allele, formula, unit, count, label, material, direction and apparatus state must exactly match the learner-facing question.',
				'Keep the scientific result, completed reasoning, winning option and numerical conclusion unresolved.'
			],
			forbiddenDetails: [
				'No answer, highlighted solution, completed outcome, causal conclusion, probability label or numerical result.',
				'No notation, material, object, direction, label or apparatus state borrowed from a different example.'
			],
			output
		});
		sourceBindings.push({
			challengeId: row.definition.id,
			artId: id,
			darkSourcePath: dark.relative,
			darkSourceSha256: dark.sha256,
			darkReviewPath: output.darkPath,
			lightSourcePath: light.relative,
			lightSourceSha256: light.sha256,
			lightReviewPath: output.lightPath
		});
	}
	sourceBindings.sort((left, right) => left.challengeId.localeCompare(right.challengeId));
	specs.sort((left, right) => left.challengeId.localeCompare(right.challengeId));
	return {
		schemaVersion: SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
		releaseId,
		width: 960,
		height: 540,
		cohort: {
			schemaVersion: COHORT_SCHEMA,
			pairPolicy: 'one-pair-per-challenge',
			sourceKind: 'vite-authored-static',
			ownerCount: specs.length,
			sourceBindingsSha256: canonicalHash(sourceBindings),
			sourceBindings
		},
		specs
	};
}

export async function loadAuthoredStaticRows(repositoryRoot) {
	const server = await createServer({
		root: repositoryRoot,
		server: { middlewareMode: true },
		appType: 'custom',
		logLevel: 'silent'
	});
	try {
		const [catalog, identity, visuals, biology, chemistry, physics] = await Promise.all([
			server.ssrLoadModule('/src/lib/challenges/catalog.ts'),
			server.ssrLoadModule('/src/lib/challenges/catalogIdentity.ts'),
			server.ssrLoadModule('/src/lib/challenges/visuals.ts'),
			server.ssrLoadModule('/src/lib/challenges/expansions/biology.ts'),
			server.ssrLoadModule('/src/lib/challenges/expansions/chemistry.ts'),
			server.ssrLoadModule('/src/lib/challenges/expansions/physics.ts')
		]);
		const replacementIds = new Set(
			[
				...biology.biologyExpansion,
				...chemistry.chemistryExpansion,
				...physics.physicsExpansion
			].map((definition) => definition.id)
		);
		const definitionById = new Map(
			catalog.challengeCatalog.map((definition) => [definition.id, definition])
		);
		return identity.authoredChallengeIds
			.filter((id) => !replacementIds.has(id))
			.map((id) => {
				const definition = definitionById.get(id);
				const visual = definition ? visuals.challengeVisual(definition) : null;
				if (!definition || !visual?.cardArt?.src || !visual.cardArt.darkSrc) {
					throw new Error(`Authored-static review cannot resolve ${id}.`);
				}
				return { definition, visual };
			});
	} finally {
		await server.close();
	}
}

export function parseArgs(argv) {
	let releaseId = null;
	let dryRun = false;
	let help = false;
	let generationCandidate = false;
	const ids = [];
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') help = true;
		else if (arg === '--dry-run') dryRun = true;
		else if (arg === '--generation-candidate') generationCandidate = true;
		else if (arg.startsWith('--id=')) {
			const id = arg.slice('--id='.length);
			if (!SAFE_RELEASE_ID.test(id)) throw new Error('--id values must be kebab-case.');
			if (ids.includes(id)) throw new Error(`Duplicate --id=${id}.`);
			ids.push(id);
		} else if (arg.startsWith('--release-id=')) {
			if (releaseId !== null) throw new Error('Duplicate --release-id.');
			releaseId = arg.slice('--release-id='.length);
		} else {
			throw new Error(`Unknown option ${arg}.`);
		}
	}
	if (!help && !SAFE_RELEASE_ID.test(String(releaseId ?? ''))) {
		throw new Error('--release-id=<kebab-case immutable id> is required.');
	}
	if (!help && generationCandidate && ids.length === 0) {
		throw new Error('--generation-candidate requires at least one explicit --id.');
	}
	return { releaseId, dryRun, generationCandidate, ids, help };
}

export function usage() {
	return [
		'Usage: node scripts/prepare-science-authored-static-art-review.mjs --release-id=<id> [options]',
		'',
		'--release-id=<id>  Immutable review cohort id under tmp/science-challenges/',
		'--id=<challenge-id>  Limit to an authored-static challenge; repeatable',
		'--generation-candidate  Write an empty-output manifest for fresh generation; requires --id',
		'--dry-run          Validate and print hashes without copying or writing',
		'--help'
	].join('\n');
}

function resolveStaticSource(root, source, label) {
	const webPath = String(source ?? '').split(/[?#]/u)[0];
	if (!webPath.startsWith('/') || webPath.includes('\\')) {
		throw new Error(`${label} source must be a root-relative web path.`);
	}
	const relative = `static/${webPath.slice(1)}`;
	const absolute = path.resolve(root, relative);
	if (!absolute.startsWith(`${root}${path.sep}`) || !existsSync(absolute)) {
		throw new Error(`${label} source does not exist: ${relative}`);
	}
	const metadata = lstatSync(absolute);
	if (!metadata.isFile() || metadata.isSymbolicLink()) {
		throw new Error(`${label} source must be a regular non-symlink file.`);
	}
	const real = realpathSync(absolute);
	if (!real.startsWith(`${root}${path.sep}`)) {
		throw new Error(`${label} source resolves outside the repository.`);
	}
	return {
		relative,
		sha256: sha256(readFileSync(real))
	};
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
