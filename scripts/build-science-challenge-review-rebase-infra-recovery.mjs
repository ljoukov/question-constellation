#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createServer } from 'vite';

import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT,
	stageScienceChallengeReviewRebaseInfrastructureRecovery
} from './lib/science-challenge-review-rebase-infra-recovery.mjs';

if (isMainModule()) {
	await main();
}

export async function main(argv = process.argv.slice(2)) {
	const args = parseArgs(argv);
	if (args.help) {
		console.log(usage());
		return;
	}
	const catalog = await loadExistingCatalog(args.catalogRoot);
	const result = stageScienceChallengeReviewRebaseInfrastructureRecovery({
		workspaceRoot: args.workspaceRoot,
		reviewRebaseManifestPath: args.reviewRebaseManifest,
		verificationSummaryPath: args.verificationSummary,
		failedRoot: args.failedRoot,
		successorRoot: args.successorRoot,
		existingDefinitions: catalog,
		dryRun: args.dryRun
	});
	console.log(JSON.stringify(buildCliOutput({ result, dryRun: args.dryRun }), null, 2));
}

export function buildCliOutput({ result, dryRun }) {
	const manifest = result?.manifest ?? result?.prepared?.manifest;
	if (!manifest) throw new Error('Infrastructure recovery returned no authenticated manifest.');
	const manifestPath = path.posix.join(
		manifest.successor.path,
		'verification-repair-infrastructure-recovery.json'
	);
	return {
		status: result.status,
		dryRun,
		action: result.action,
		manifestPath,
		manifestSha256: result.manifestSha256,
		recoveryId: manifest.recoveryId,
		recoveryExecutionId: manifest.recoveryExecutionId,
		contentNamespaceId: manifest.contentNamespaceId,
		failedRootInventorySha256: manifest.failedRootInventorySha256,
		baselineLogicalLedgerSha256: manifest.baselineLogicalLedgerSha256,
		preservedProposalSetSha256: manifest.preservedProposalSetSha256,
		directChildRegistration: manifest.directChildRegistration,
		counts: manifest.counts,
		shards: [...manifest.shards]
			.sort((left, right) => left.shardId.localeCompare(right.shardId))
			.map((shard) => ({
				shardId: shard.shardId,
				status: shard.status,
				sourceAttemptCount: shard.sourceAttempts.length,
				preModelExemptAttemptCount: shard.sourceAttempts.filter(
					(attempt) =>
						attempt.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT
				).length,
				consumedLogicalContentAttempts: shard.consumedLogicalContentAttempts,
				nextLogicalContentOrdinal: shard.nextLogicalContentOrdinal,
				remainingLogicalContentAttempts: shard.remainingLogicalContentAttempts
			})),
		plannedWrites: result.plannedWrites ?? []
	};
}

export function parseArgs(argv) {
	const values = new Map();
	const booleans = new Set(['help', 'dry-run']);
	const allowedValues = new Set([
		'workspace-root',
		'catalog-root',
		'review-rebase-manifest',
		'verification-summary',
		'repair-verification',
		'failed-root',
		'successor-root'
	]);
	for (const arg of argv) {
		const boolean = arg === '-h' ? 'help' : arg.startsWith('--') ? arg.slice(2) : null;
		if (boolean && booleans.has(boolean)) {
			if (values.has(boolean)) throw new Error(`Duplicate --${boolean} flag.`);
			values.set(boolean, true);
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
		const [key, ...parts] = arg.slice(2).split('=');
		const value = parts.join('=');
		if (!allowedValues.has(key)) throw new Error(`Unknown option --${key}.`);
		if (!value) throw new Error(`--${key} requires a value.`);
		if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
		values.set(key, value);
	}
	if (values.has('help')) {
		return {
			help: true,
			dryRun: Boolean(values.get('dry-run'))
		};
	}
	if (values.has('verification-summary') && values.has('repair-verification')) {
		throw new Error('Use only one of --verification-summary or its --repair-verification alias.');
	}
	const verificationSummary =
		values.get('verification-summary') ?? values.get('repair-verification');
	for (const key of ['review-rebase-manifest', 'failed-root', 'successor-root']) {
		if (!values.has(key)) throw new Error(`--${key} is required.`);
	}
	if (!verificationSummary) throw new Error('--verification-summary is required.');
	return {
		help: false,
		dryRun: Boolean(values.get('dry-run')),
		workspaceRoot: path.resolve(values.get('workspace-root') ?? process.cwd()),
		catalogRoot: path.resolve(values.get('catalog-root') ?? process.cwd()),
		reviewRebaseManifest: values.get('review-rebase-manifest'),
		verificationSummary,
		failedRoot: values.get('failed-root'),
		successorRoot: values.get('successor-root')
	};
}

export function usage() {
	return [
		'Usage: node scripts/build-science-challenge-review-rebase-infra-recovery.mjs [options]',
		'',
		'--workspace-root=<evidence workspace; defaults to cwd>',
		'--catalog-root=<repo containing src/lib/challenges/catalog.ts; defaults to cwd>',
		'--review-rebase-manifest=<B0 manifest path inside workspace>',
		'--verification-summary=<V1 summary path inside workspace>',
		'--failed-root=<failed S1 root inside workspace>',
		'--successor-root=<new or exact existing recovery root inside workspace>',
		'--dry-run   Authenticate and report the exact plan without writing',
		'--help'
	].join('\n');
}

async function loadExistingCatalog(catalogRoot) {
	const server = await createServer({
		root: catalogRoot,
		server: { middlewareMode: true },
		appType: 'custom',
		logLevel: 'silent'
	});
	try {
		const module = await server.ssrLoadModule('/src/lib/challenges/catalog.ts');
		if (!Array.isArray(module.challengeCatalog)) {
			throw new Error('Current challenge catalog did not export challengeCatalog.');
		}
		return module.challengeCatalog;
	} finally {
		await server.close();
	}
}

function isMainModule() {
	if (!process.argv[1]) return false;
	return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}
