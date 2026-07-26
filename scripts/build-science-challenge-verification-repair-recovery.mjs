#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
	SCIENCE_CHALLENGE_CODEX_SDK_MODEL,
	SCIENCE_CHALLENGE_CODEX_SDK_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './lib/science-challenge-authoring-transport.mjs';
import { canonicalHash } from './lib/science-challenge-release.mjs';
import {
	buildVerificationRepairRecoveryManifest,
	commitVerificationRepairRecovery,
	scienceChallengeVerificationRepairExecutionIdentity,
	validateVerificationRepairRecoveryObjective,
	validateVerificationRepairRecoveryPolicy,
	validateVerificationRepairRecoveryManifest,
	verificationRepairExecutionLedgerRoot
} from './lib/science-challenge-verification-repair-lineage.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}

const planPath = path.resolve(rootDir, args.plan);
const verificationPath = path.resolve(rootDir, args.repairVerification);
const successorRoot = path.resolve(rootDir, args.successorRoot);
const plan = readJson(planPath);
const verification = readJson(verificationPath);
const preflight = readJson(path.resolve(rootDir, args.preflight));
const planSha256 = canonicalHash(plan);
const verificationSha256 = canonicalHash(verification);
const identity = scienceChallengeVerificationRepairExecutionIdentity({
	planSha256,
	verificationSha256,
	priorCandidateSetSha256: verification.candidateSetSha256,
	model: args.model,
	transport: args.transport,
	responseMode: args.responseMode,
	thinkingLevel: args.thinkingLevel,
	directPartSize: args.directPartSize
});
const objectiveValidation = validateVerificationRepairRecoveryObjective({
	workspaceRoot: rootDir,
	planPath,
	verificationPath,
	plan,
	verification,
	identity
});
if (objectiveValidation.status !== 'passed') {
	throw new Error(
		`Recovery repair-review objective validation failed:\n${objectiveValidation.issues.join('\n')}`
	);
}
const manifest = buildVerificationRepairRecoveryManifest({
	planPath,
	planSha256,
	verificationSha256,
	priorCandidateSetSha256: verification.candidateSetSha256,
	identity,
	preModelRoots: args.preModelRoots.map((value) => path.resolve(rootDir, value)),
	successorRoot,
	preflight
});
const validation = validateVerificationRepairRecoveryManifest({
	manifest,
	planPath,
	generationRoot: successorRoot
});
if (validation.status !== 'passed') {
	throw new Error(`Recovery manifest validation failed:\n${validation.issues.join('\n')}`);
}

const ledgerRoot = verificationRepairExecutionLedgerRoot(rootDir, identity.objectiveId);
const outputPath = args.output ? path.resolve(rootDir, args.output) : null;
const commit = commitVerificationRepairRecovery({
	ledgerRoot,
	identity,
	manifest,
	successorRoot,
	outputPath,
	dryRun: args.dryRun
});

console.log(
	JSON.stringify(
		{
			status: args.dryRun ? 'planned' : 'passed',
			dryRun: args.dryRun,
			objectiveId: identity.objectiveId,
			executionId: identity.executionId,
			recoveryManifest: path.relative(rootDir, path.join(ledgerRoot, 'recovery-manifest.json')),
			requestedOutput: outputPath ? path.relative(rootDir, outputPath) : null,
			recoveryManifestSha256: canonicalHash(manifest),
			ledgerRoot: path.relative(rootDir, ledgerRoot),
			preModelAttempts: manifest.preModelAttemptCount,
			plannedModelBearingAttemptImports: commit.importedAttempts,
			importedModelBearingAttempts: args.dryRun ? 0 : commit.importedAttempts.length,
			plannedMutations: {
				initializeObjectiveLedger: true,
				importGlobalClaims: commit.importedAttempts,
				writeCanonicalRecoveryManifest: true,
				bindSuccessorRoot: true,
				writeRequestedOutput: outputPath !== null,
				commitRecoveryTransaction: true
			}
		},
		null,
		2
	)
);

function parseArgs(argv) {
	const values = new Map();
	const preModelRoots = [];
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			if (values.has('help')) throw new Error('Duplicate --help flag.');
			values.set('help', true);
		} else if (arg === '--dry-run') {
			if (values.has('dry-run')) throw new Error('Duplicate --dry-run flag.');
			values.set('dry-run', true);
		} else if (arg === '--') {
			continue;
		} else if (arg === '--help=' || arg === '--dry-run=') {
			throw new Error(`${arg.slice(0, -1)} is a boolean flag and does not accept a value.`);
		} else if (arg.startsWith('--help=') || arg.startsWith('--dry-run=')) {
			throw new Error(`${arg.split('=')[0]} is a boolean flag and does not accept a value.`);
		} else if (arg.startsWith('--pre-model-root=')) {
			const value = arg.slice('--pre-model-root='.length);
			if (!value) throw new Error('--pre-model-root requires a value.');
			preModelRoots.push(value);
		} else if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			const value = rest.join('=');
			if (!value) throw new Error(`--${key} requires a value.`);
			if (
				![
					'plan',
					'repair-verification',
					'successor-root',
					'preflight',
					'model',
					'transport',
					'response-mode',
					'thinking-level',
					'direct-part-size',
					'output'
				].includes(key)
			) {
				throw new Error(`Unknown option --${key}.`);
			}
			if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
			values.set(key, value);
		} else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}.`);
		else throw new Error(`Unexpected positional argument ${arg}.`);
	}
	const required = ['plan', 'repair-verification', 'successor-root', 'preflight'];
	for (const key of required) {
		if (!values.has(key) && !values.has('help')) throw new Error(`--${key} is required.`);
	}
	if (!values.has('help') && preModelRoots.length === 0) {
		throw new Error('At least one --pre-model-root is required.');
	}
	if (values.has('help')) {
		return {
			help: true,
			dryRun: Boolean(values.get('dry-run')),
			preModelRoots
		};
	}
	const transport = String(values.get('transport') ?? SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT);
	const responseMode =
		transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT
			? String(values.get('response-mode') ?? SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON)
			: null;
	if (transport === SCIENCE_CHALLENGE_CODEX_SDK_TRANSPORT && values.has('response-mode')) {
		throw new Error('--response-mode is valid only with --transport=llm-direct.');
	}
	if (transport === SCIENCE_CHALLENGE_CODEX_SDK_TRANSPORT && values.has('direct-part-size')) {
		throw new Error('--direct-part-size is valid only with --transport=llm-direct.');
	}
	const directPartSize =
		transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT
			? integer(values.get('direct-part-size') ?? 2, '--direct-part-size', 1, 7)
			: null;
	const model = String(
		values.get('model') ??
			(transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT
				? SCIENCE_CHALLENGE_DIRECT_JSON_MODEL
				: SCIENCE_CHALLENGE_CODEX_SDK_MODEL)
	);
	const thinkingLevel = String(
		values.get('thinking-level') ??
			(responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ? 'high' : 'max')
	);
	const policyValidation = validateVerificationRepairRecoveryPolicy({
		model,
		transport,
		responseMode,
		thinkingLevel,
		directPartSize
	});
	if (policyValidation.status !== 'passed') {
		throw new Error(policyValidation.issues.join('\n'));
	}
	return {
		help: false,
		dryRun: Boolean(values.get('dry-run')),
		plan: values.get('plan'),
		repairVerification: values.get('repair-verification'),
		successorRoot: values.get('successor-root'),
		preflight: values.get('preflight'),
		preModelRoots,
		model,
		transport,
		responseMode,
		thinkingLevel,
		directPartSize,
		output: values.get('output') ?? null
	};
}

function integer(value, label, minimum, maximum) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
	}
	return parsed;
}

function readJson(filePath) {
	if (!existsSync(filePath)) throw new Error(`Required JSON does not exist: ${filePath}`);
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function usage() {
	return [
		'Usage: node scripts/build-science-challenge-verification-repair-recovery.mjs [options]',
		'',
		'--plan=<plan.json>',
		'--repair-verification=<summary.json>',
		'--pre-model-root=<directory>  Repeat for each exhausted infrastructure-failure root',
		'--successor-root=<directory>',
		'--preflight=<passed-preflight.json>',
		'--model=<model>',
		'--transport=<transport>',
		'--response-mode=<mode>',
		'--thinking-level=<level>',
		'--direct-part-size=<1-7>   llm-direct only; default 2',
		'--output=<manifest.json>',
		'--dry-run                  Validate evidence and print every planned mutation without writes',
		'',
		`codex-sdk requires ${SCIENCE_CHALLENGE_CODEX_SDK_MODEL}, max, no response mode or part size.`,
		`${SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT} requires ${SCIENCE_CHALLENGE_DIRECT_JSON_MODEL};`,
		`  response mode is ${SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON} or ${SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON};`,
		'  thinking is max, or high only with prompt-json.'
	].join('\n');
}
