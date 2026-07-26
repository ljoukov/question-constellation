#!/usr/bin/env node

import path from 'node:path';

import { createServer } from 'vite';

import {
	SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_OUTPUT_ROOT,
	SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_REBASE_MANIFEST,
	SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_VERIFICATION_SUMMARY,
	SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
	prepareScienceChallengeAcceptedSubset,
	publishScienceChallengeAcceptedSubset
} from './lib/science-challenge-accepted-subset.mjs';
import { canonicalHash } from './lib/science-challenge-release.mjs';

const DEFAULT_EVIDENCE_ROOT = '../question-constellation-evi-ui-takeover';
const OUTPUT_FILES = [
	'accepted-subset.json',
	'evidence-projection.json',
	'collection-validation.json',
	'holdout-ledger.json',
	'hash-receipt.json',
	'manifest.json'
];

main().catch((error) => {
	console.error(`Accepted-subset projection failed: ${sanitizeDiagnostic(error)}`);
	process.exitCode = 1;
});

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(usage());
		return;
	}
	const repositoryRoot = process.cwd();
	const evidenceRepositoryRoot = path.resolve(repositoryRoot, args.evidenceRoot);
	const existingDefinitions = await loadHistoricalCatalog(evidenceRepositoryRoot);
	const options = {
		repositoryRoot,
		evidenceRepositoryRoot,
		outputRoot: args.outputRoot,
		reviewRebaseManifestPath: args.reviewRebaseManifest,
		verificationSummaryPath: args.verificationSummary,
		existingDefinitions
	};
	const result = args.dryRun
		? prepareScienceChallengeAcceptedSubset(options)
		: publishScienceChallengeAcceptedSubset(options);
	if (result.status !== 'passed') {
		throw new Error((result.issues ?? ['Unknown projection failure.']).join(' '));
	}
	const selection = result.acceptedSubset.selection;
	console.log(
		JSON.stringify(
			{
				status: args.dryRun ? 'planned' : 'passed',
				dryRun: args.dryRun,
				releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
				outputRoot: args.outputRoot,
				acceptedSubsetPath: `${args.outputRoot}/accepted-subset.json`,
				manifestPath: `${args.outputRoot}/manifest.json`,
				manifestSha256: canonicalHash(result.manifest),
				reviewedCount: selection.reviewedCount,
				acceptedCount: selection.acceptedCount,
				rejectedCount: selection.rejectedCount,
				fullCandidateSetSha256: selection.fullCandidateSetSha256,
				acceptedCandidateSetSha256: selection.acceptedCandidateSetSha256,
				acceptedIdSetSha256: selection.acceptedIdSetSha256,
				reviewSetSha256: selection.reviewSetSha256,
				acceptedReviewSetSha256: selection.acceptedReviewSetSha256,
				plannedWrites: args.dryRun ? [] : OUTPUT_FILES.map((name) => `${args.outputRoot}/${name}`)
			},
			null,
			2
		)
	);
}

function parseArgs(argv) {
	const values = new Map();
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			addFlag(values, 'help', '--help');
			continue;
		}
		if (arg === '--dry-run') {
			addFlag(values, 'dry-run', '--dry-run');
			continue;
		}
		if (arg.startsWith('--help=') || arg.startsWith('--dry-run=')) {
			throw new Error(`${arg.split('=')[0]} is a boolean flag and does not accept a value.`);
		}
		if (!arg.startsWith('--') || !arg.includes('=')) {
			throw new Error(
				arg.startsWith('-') ? `Unknown option ${arg}.` : `Unexpected positional argument ${arg}.`
			);
		}
		const [key, ...valueParts] = arg.slice(2).split('=');
		const value = valueParts.join('=');
		if (
			!['evidence-root', 'output-root', 'review-rebase-manifest', 'verification-summary'].includes(
				key
			)
		) {
			throw new Error(`Unknown option --${key}.`);
		}
		if (!value) throw new Error(`--${key} requires a value.`);
		if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
		values.set(key, value);
	}
	return {
		help: Boolean(values.get('help')),
		dryRun: Boolean(values.get('dry-run')),
		evidenceRoot: values.get('evidence-root') ?? DEFAULT_EVIDENCE_ROOT,
		outputRoot: values.get('output-root') ?? SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_OUTPUT_ROOT,
		reviewRebaseManifest:
			values.get('review-rebase-manifest') ??
			SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_REBASE_MANIFEST,
		verificationSummary:
			values.get('verification-summary') ??
			SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_VERIFICATION_SUMMARY
	};
}

function addFlag(values, key, label) {
	if (values.has(key)) throw new Error(`Duplicate ${label} flag.`);
	values.set(key, true);
}

async function loadHistoricalCatalog(evidenceRepositoryRoot) {
	let server;
	try {
		server = await createServer({
			root: evidenceRepositoryRoot,
			configFile: false,
			server: { middlewareMode: true },
			appType: 'custom',
			logLevel: 'silent'
		});
		const module = await server.ssrLoadModule('/src/lib/challenges/catalog.ts');
		if (!Array.isArray(module.challengeCatalog)) {
			throw new Error('challengeCatalog export is missing.');
		}
		return structuredClone(module.challengeCatalog);
	} catch (error) {
		throw new Error(`Historical catalog load failed: ${sanitizeDiagnostic(error)}`, {
			cause: error
		});
	} finally {
		await server?.close();
	}
}

function sanitizeDiagnostic(error) {
	const message = error instanceof Error ? error.message : String(error);
	return message
		.replaceAll(/\/Users\/[^/\s]+\/[^\s]*/gu, '<machine-path>')
		.replaceAll(/\/home\/[^/\s]+\/[^\s]*/gu, '<machine-path>')
		.replaceAll(/\/root\/[^\s]*/gu, '<verifier-alias>');
}

function usage() {
	return [
		'Usage: node scripts/build-science-challenge-accepted-subset.mjs [options]',
		'',
		`--evidence-root=<checkout>               Historical evidence checkout (default: ${DEFAULT_EVIDENCE_ROOT})`,
		`--output-root=<absent repo-relative dir> Immutable projection directory (default: ${SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_OUTPUT_ROOT})`,
		'--review-rebase-manifest=<repo-relative B0 manifest>',
		'--verification-summary=<repo-relative V1 summary>',
		'--dry-run                                Authenticate and validate without writing',
		'--help'
	].join('\n');
}
