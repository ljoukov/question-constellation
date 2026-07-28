#!/usr/bin/env node

import {
	prepareScienceChallengeReviewRebaseEvidence,
	publishScienceChallengeReviewRebaseEvidence
} from './lib/science-challenge-review-rebase-evidence.mjs';
import { canonicalHash } from './lib/science-challenge-release.mjs';
import { loadChallengeCatalogSource } from './lib/challenge-catalog-source.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}

const options = {
	repositoryRoot: process.cwd(),
	outputRoot: args.outputRoot,
	specPath: args.spec,
	basePlanPath: args.basePlan,
	sourceSnapshotPath: args.source,
	curriculumEvidencePath: args.evidence,
	parentVerificationPath: args.parentVerification,
	parentRepairPath: args.parentRepair,
	selectionIndexPath: args.selections,
	existingDefinitions: await loadExistingCatalog(args.catalogSource)
};
const result = args.dryRun
	? prepareScienceChallengeReviewRebaseEvidence(options)
	: publishScienceChallengeReviewRebaseEvidence(options);
if (result.status !== 'passed') {
	throw new Error(`Review rebase failed:\n${(result.issues ?? []).join('\n')}`);
}

console.log(
	JSON.stringify(
		{
			status: args.dryRun ? 'planned' : 'passed',
			dryRun: args.dryRun,
			outputRoot: args.outputRoot,
			manifestPath: result.manifestPathRelative,
			rebaseId: result.coreManifest.rebaseId,
			manifestSha256: canonicalHash(result.manifest),
			planSha256: result.coreManifest.planSha256,
			candidateCount: result.coreManifest.candidateCount,
			candidateSetSha256: result.coreManifest.candidateSetSha256,
			requiresFreshFullVerification: true,
			releaseEligible: false,
			plannedWrites: args.dryRun
				? []
				: [
						`${args.outputRoot}/manifest.json`,
						`${args.outputRoot}/plan.json`,
						`${args.outputRoot}/plan-validation.json`,
						`${args.outputRoot}/collection-validation.json`,
						`${args.outputRoot}/shards/*/candidate.json`,
						`${args.outputRoot}/shards/*/validation.json`
					]
		},
		null,
		2
	)
);

function parseArgs(argv) {
	const values = new Map();
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			if (values.has('help')) throw new Error('Duplicate --help flag.');
			values.set('help', true);
			continue;
		}
		if (arg === '--dry-run') {
			if (values.has('dry-run')) throw new Error('Duplicate --dry-run flag.');
			values.set('dry-run', true);
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
			![
				'output-root',
				'catalog-source',
				'spec',
				'base-plan',
				'source',
				'evidence',
				'parent-verification',
				'parent-repair',
				'selections'
			].includes(key)
		) {
			throw new Error(`Unknown option --${key}.`);
		}
		if (!value) throw new Error(`--${key} requires a value.`);
		if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
		values.set(key, value);
	}
	if (values.has('help')) {
		return { help: true, dryRun: Boolean(values.get('dry-run')) };
	}
	for (const key of [
		'output-root',
		'spec',
		'base-plan',
		'source',
		'evidence',
		'parent-verification',
		'parent-repair',
		'selections'
	]) {
		if (!values.has(key)) throw new Error(`--${key} is required.`);
	}
	return {
		help: false,
		dryRun: Boolean(values.get('dry-run')),
		outputRoot: values.get('output-root'),
		catalogSource: values.has('catalog-source') ? values.get('catalog-source') : null,
		spec: values.get('spec'),
		basePlan: values.get('base-plan'),
		source: values.get('source'),
		evidence: values.get('evidence'),
		parentVerification: values.get('parent-verification'),
		parentRepair: values.get('parent-repair'),
		selections: values.get('selections')
	};
}

function usage() {
	return [
		'Usage: node scripts/build-science-challenge-review-rebase.mjs [options]',
		'',
		'--output-root=<absent repo-relative directory>',
		'--catalog-source=<ignored JSON>  Optional active D1 catalogue export; otherwise read D1',
		'--spec=<repo-relative review-rebase spec JSON>',
		'--base-plan=<repo-relative base plan JSON>',
		'--source=<repo-relative source snapshot JSON>',
		'--evidence=<repo-relative curriculum evidence JSON>',
		'--parent-verification=<repo-relative failed full-review summary JSON>',
		'--parent-repair=<repo-relative failed repair summary JSON>',
		'--selections=<repo-relative selection index JSON>',
		'--dry-run   Replay all inputs and report the planned immutable tree without writing',
		'--help'
	].join('\n');
}

async function loadExistingCatalog(sourcePath) {
	return (
		await loadChallengeCatalogSource({
			rootDir: process.cwd(),
			sourcePath
		})
	).definitions;
}
