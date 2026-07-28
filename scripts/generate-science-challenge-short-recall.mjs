#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadDefaultEnv } from './lib/codex-sdk-runner.mjs';
import { configureScienceChallengeDirectJsonTransport } from './lib/science-challenge-direct-json-runner.mjs';
import { runScienceChallengeShortRecallAuthoring } from './lib/science-challenge-short-recall-pipeline.mjs';
import {
	SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING,
	SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE,
	SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS,
	SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
	readAuthenticatedScienceChallengeShortRecallCandidateSet
} from './lib/science-challenge-short-recall.mjs';

export async function runGenerateScienceChallengeShortRecallCli({
	argv = process.argv.slice(2),
	cwd = process.cwd(),
	transport,
	configureTransport = configureScienceChallengeDirectJsonTransport
} = {}) {
	const args = parseGenerateScienceChallengeShortRecallArgs(argv);
	if (args.help) return { help: usage(), exitCode: 0 };
	const candidatePath = path.resolve(cwd, args.candidateSet);
	requireFile(candidatePath, '--candidate-set');
	const candidateValue = readJson(candidatePath);
	readAuthenticatedScienceChallengeShortRecallCandidateSet(candidateValue);
	let priorPrompts = null;
	let repairReview = null;
	let repairAuthoringEvidence = null;
	if (args.priorBundle || args.repairReview || args.repairAuthoringEvidence) {
		if (!args.priorBundle || !args.repairReview || !args.repairAuthoringEvidence) {
			throw new Error(
				'--prior-bundle, --repair-review, and --repair-authoring-evidence must be supplied together.'
			);
		}
		const priorPath = path.resolve(cwd, args.priorBundle);
		const reviewPath = path.resolve(cwd, args.repairReview);
		const authoringEvidencePath = path.resolve(cwd, args.repairAuthoringEvidence);
		requireFile(priorPath, '--prior-bundle');
		requireFile(reviewPath, '--repair-review');
		requireFile(authoringEvidencePath, '--repair-authoring-evidence');
		priorPrompts = readJson(priorPath);
		repairReview = readJson(reviewPath);
		repairAuthoringEvidence = readJson(authoringEvidencePath);
	}
	let authMode = 'dry-run';
	if (!args.dryRun) {
		loadDefaultEnv(cwd);
		authMode = configureTransport();
	}
	const outputRoot = path.resolve(cwd, args.outputRoot);
	const result = await runScienceChallengeShortRecallAuthoring({
		candidateValue,
		outputRoot,
		resume: args.resume,
		dryRun: args.dryRun,
		concurrency: args.concurrency,
		timeoutMs: args.timeoutMs,
		authMode,
		priorPrompts,
		repairReview,
		repairAuthoringEvidence,
		...(transport ? { transport } : {})
	});
	return {
		...result,
		artifacts:
			result.status === 'passed'
				? {
						candidatePrompts: relative(cwd, path.join(outputRoot, 'candidate-prompts.json')),
						authoringEvidence: relative(cwd, path.join(outputRoot, 'authoring-evidence.json'))
					}
				: null,
		exitCode: result.status === 'passed' || result.status === 'planned' ? 0 : 1
	};
}

export function parseGenerateScienceChallengeShortRecallArgs(argv) {
	const values = strictOptions(argv, {
		boolean: ['help', 'resume', 'dry-run'],
		value: [
			'candidate-set',
			'output-root',
			'prior-bundle',
			'repair-review',
			'repair-authoring-evidence',
			'concurrency',
			'timeout-ms',
			'max-attempts',
			'batch-size',
			'model',
			'thinking-level'
		]
	});
	const maxAttempts = integer(
		values.get('max-attempts') ?? SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS,
		'--max-attempts',
		1,
		SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS
	);
	if (maxAttempts !== SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS) {
		throw new Error(
			`--max-attempts must be exactly ${SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS}.`
		);
	}
	const batchSize = integer(
		values.get('batch-size') ?? SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE,
		'--batch-size',
		1,
		SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE
	);
	if (batchSize !== SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE) {
		throw new Error(`--batch-size must be exactly ${SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE}.`);
	}
	const model = String(values.get('model') ?? SCIENCE_CHALLENGE_SHORT_RECALL_MODEL);
	if (model !== SCIENCE_CHALLENGE_SHORT_RECALL_MODEL) {
		throw new Error(`--model must be exactly ${SCIENCE_CHALLENGE_SHORT_RECALL_MODEL}.`);
	}
	const thinkingLevel = String(
		values.get('thinking-level') ?? SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING
	);
	if (thinkingLevel !== SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING) {
		throw new Error(
			`--thinking-level must be exactly ${SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING}.`
		);
	}
	const concurrency = integer(values.get('concurrency') ?? 6, '--concurrency', 1, 6);
	if (concurrency !== 6) throw new Error('--concurrency must be exactly 6.');
	const help = Boolean(values.get('help'));
	if (!help) {
		for (const name of ['candidate-set', 'output-root']) {
			if (!values.has(name)) throw new Error(`--${name} is required.`);
		}
	}
	return {
		help,
		resume: Boolean(values.get('resume')),
		dryRun: Boolean(values.get('dry-run')),
		candidateSet: String(values.get('candidate-set') ?? ''),
		outputRoot: String(values.get('output-root') ?? ''),
		priorBundle: values.has('prior-bundle') ? String(values.get('prior-bundle')) : null,
		repairReview: values.has('repair-review') ? String(values.get('repair-review')) : null,
		repairAuthoringEvidence: values.has('repair-authoring-evidence')
			? String(values.get('repair-authoring-evidence'))
			: null,
		concurrency,
		timeoutMs: integer(values.get('timeout-ms') ?? 7_200_000, '--timeout-ms', 1, 14_400_000),
		maxAttempts,
		batchSize,
		model,
		thinkingLevel
	};
}

function strictOptions(argv, allowed) {
	const values = new Map();
	const boolean = new Set(allowed.boolean);
	const value = new Set(allowed.value);
	for (const argument of argv) {
		if (argument === '-h') {
			if (values.has('help')) throw new Error('Duplicate --help option.');
			values.set('help', true);
		} else if (argument.startsWith('--') && argument.includes('=')) {
			const [key, ...parts] = argument.slice(2).split('=');
			if (boolean.has(key)) throw new Error(`--${key} is a Boolean flag.`);
			if (!value.has(key)) throw new Error(`Unknown option --${key}.`);
			if (values.has(key)) throw new Error(`Duplicate --${key} option.`);
			const optionValue = parts.join('=');
			if (!optionValue) throw new Error(`--${key} requires a non-empty value.`);
			values.set(key, optionValue);
		} else if (argument.startsWith('--')) {
			const key = argument.slice(2);
			if (value.has(key)) throw new Error(`--${key} requires a non-empty value.`);
			if (!boolean.has(key)) throw new Error(`Unknown option --${key}.`);
			if (values.has(key)) throw new Error(`Duplicate --${key} option.`);
			values.set(key, true);
		} else {
			throw new Error(`Unexpected positional argument ${argument}.`);
		}
	}
	return values;
}

function integer(value, label, minimum, maximum) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
	}
	return parsed;
}

function requireFile(filePath, label) {
	if (!existsSync(filePath)) throw new Error(`${label} does not exist: ${filePath}`);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function relative(cwd, filePath) {
	return path.relative(cwd, filePath).split(path.sep).join('/');
}

function usage() {
	return [
		'Usage: node scripts/generate-science-challenge-short-recall.mjs [options]',
		'',
		'--candidate-set=<json>       Required hash-bound challenge-catalog-candidate-set/v1',
		'--output-root=<directory>    Required fresh immutable run root under ignored tmp/',
		'--concurrency=6              Fixed release concurrency',
		'--timeout-ms=<1-14400000>    Per model turn; default 7200000',
		'--resume                     Reuse exact passed attempts; never raises the four-attempt ceiling',
		'--dry-run                    Validate the derived complete batch plan without writes or model calls',
		'--prior-bundle=<json>        Prior full prompt array for targeted repair',
		'--repair-review=<json>       Full rejected review evidence; required with --prior-bundle',
		'--repair-authoring-evidence=<json>  Exact authoring evidence bound by --repair-review',
		`--max-attempts=4             Fixed immutable ceiling`,
		`--batch-size=8               Full batches of 8; only the final candidate batch is shorter`,
		`--model=${SCIENCE_CHALLENGE_SHORT_RECALL_MODEL}`,
		`--thinking-level=${SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING}`,
		'--help, -h'
	].join('\n');
}

const isMain =
	process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
	try {
		const result = await runGenerateScienceChallengeShortRecallCli();
		if (result.help) console.log(result.help);
		else {
			const output = { ...result };
			delete output.exitCode;
			console.log(JSON.stringify(output, null, 2));
		}
		process.exitCode = result.exitCode;
	} catch (error) {
		console.error(
			`Science short-recall authoring failed: ${error instanceof Error ? error.message : String(error)}`
		);
		process.exitCode = 1;
	}
}
