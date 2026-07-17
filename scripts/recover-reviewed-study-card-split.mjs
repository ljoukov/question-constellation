#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- CLI files and model outputs are validated fail closed at runtime.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import { stableStringify, validateStudyCardBundle } from './lib/study-card-artifact.mjs';
import {
	HIGHER_RELEASE_ID,
	RECOVERY_MODEL,
	RECOVERY_THINKING_LEVEL,
	SHARED_RELEASE_ID,
	SOURCE_BATCH_ID,
	assertReviewedSplitRecoveryQueueTerminal,
	buildReviewedSplitRecoveryArtifacts,
	buildReviewedSplitRecoveryPreflight,
	buildReviewedSplitRecoveryPrompt,
	reviewedSplitRecoveryCollisions,
	reviewedSplitRecoveryReviewSchema,
	validateAcceptedRecoveryReview
} from './lib/reviewed-study-card-split-recovery.mjs';

const ARCHIVED_FILE_HASHES = Object.freeze({
	'plan.json': '953b7d82b14be49a045d323b8a2cafa0ea05d913b0dc35d0696da0c97cb48a0b',
	'candidate-cards.json': 'd1f7616bb32594d5401a669bbb6fb304dda89037d48e73f4f7c97e1d9fda1034',
	'review.json': 'c3db5ff5900cd10ae5bd5b4bb06c51f94cd6de1252e9a752f873c28782fd4ee0',
	'reviewed-repair-generation-1-model-output.json':
		'e5625995d660028d539514a667c1dac6cbdc6c0131f4b706e392b10513e6d2ee',
	'source-evidence.json': 'f0255476152410f713a2226a9a50d24bf7314c3eac0e8c7e8da03630fd76a7b0',
	'recovery-evidence.json': '1bda6c985ec67d81a7fff807eb9644ee87192c9f831e72a699cd0d61f01b8128',
	'generation/codex-run-summary.json':
		'afd2b4bbeec76eacb9418022307dfef12efe93f25022c3b1126f902510e64c36',
	'review/codex-run-summary.json':
		'2e5ccff52c93f3a1859ee88a9ade9cebb7d3384236d75d5e856b7d5e3684a0cd',
	'reviewed-repair-generation-1/codex-run-summary.json':
		'43b54c9f1e9f87c02721c252eecdeb24aed664c785b9335610017ac4b25a7f22'
});

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
const sourceDir = path.resolve(
	rootDir,
	args.sourceDir ?? `data/study-cards/rollout-recovery/${SOURCE_BATCH_ID}`
);
const workDir = path.resolve(
	rootDir,
	args.workDir ?? 'tmp/study-card-generation/combined-physics-reviewed-split-recovery-v1'
);
const queueStatePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/queue-state.json'
);
const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));

assertArchivedFileHashes(sourceDir);
const trace = {
	plan: readJson(path.join(sourceDir, 'plan.json')),
	candidates: readJson(path.join(sourceDir, 'candidate-cards.json')),
	reviews: readJson(path.join(sourceDir, 'review.json')),
	repairCandidates: readJson(
		path.join(sourceDir, 'reviewed-repair-generation-1-model-output.json')
	),
	sourceEvidence: readJson(path.join(sourceDir, 'source-evidence.json')),
	generationSummary: readJson(path.join(sourceDir, 'generation/codex-run-summary.json')),
	originalReviewSummary: readJson(path.join(sourceDir, 'review/codex-run-summary.json')),
	repairGenerationSummary: readJson(
		path.join(sourceDir, 'reviewed-repair-generation-1/codex-run-summary.json')
	),
	catalog
};
const preflight = buildReviewedSplitRecoveryPreflight(trace);
const existingBundles = loadExistingBundles();
const expectedRecoveryIds = new Set([SHARED_RELEASE_ID, HIGHER_RELEASE_ID]);
const existingRecoveryBundles = existingBundles.filter((bundle) =>
	expectedRecoveryIds.has(bundle.release.id)
);
for (const bundle of existingRecoveryBundles) {
	assertExistingRecoveryShape(
		bundle,
		bundle.release.id === SHARED_RELEASE_ID ? preflight.shared : preflight.higher
	);
}
const draftCollisions = reviewedSplitRecoveryCollisions(
	[draftValidatedBundle(preflight.shared), draftValidatedBundle(preflight.higher)],
	existingBundles.filter((bundle) => !expectedRecoveryIds.has(bundle.release.id))
);
const queue = readJson(queueStatePath);
const outputDirs = [SHARED_RELEASE_ID, HIGHER_RELEASE_ID].map((releaseId) =>
	path.join(rootDir, 'data/study-cards/releases', releaseId)
);
const outputDirectoryCollisions = outputDirs
	.filter(
		(directory) =>
			existsSync(directory) && !existsSync(path.join(directory, 'accepted-study-cards.json'))
	)
	.map(relative);
const stablePlan = {
	status: 'ready_for_fresh_review_after_queue_terminal',
	recoveryVersion: preflight.version,
	sourceBatchId: SOURCE_BATCH_ID,
	sourceDir: relative(sourceDir),
	archivedFileHashes: ARCHIVED_FILE_HASHES,
	queue: {
		statePath: relative(queueStatePath),
		terminal: Boolean(queue.finishedAt),
		finishedAt: queue.finishedAt ?? null
	},
	zeroRegeneration: true,
	existingImmutableOutputsValidatedAndReused: existingRecoveryBundles.map(
		(bundle) => bundle.release.id
	),
	cohorts: [
		{
			...preflight.shared.plan,
			preservedOriginalReviewAcceptances: preflight.shared.preservedAcceptedCardIds.length,
			freshReviewDecisions: preflight.shared.freshReviewCards.length
		},
		{
			...preflight.higher.plan,
			preservedOriginalReviewAcceptances: 0,
			freshReviewDecisions: preflight.higher.freshReviewCards.length
		}
	],
	collisions: [...draftCollisions, ...outputDirectoryCollisions],
	executeCommand: 'node scripts/recover-reviewed-study-card-split.mjs --execute',
	outputs: outputDirs.map((directory) =>
		relative(path.join(directory, 'accepted-study-cards.json'))
	)
};

if (!args.execute) {
	emit(stablePlan);
	process.exit(stablePlan.collisions.length ? 1 : 0);
}
assertRecoveryExecutionGate(queue);
if (stablePlan.collisions.length) {
	throw new Error(`Recovery output collision(s): ${stablePlan.collisions.join(', ')}`);
}
if (args.model !== RECOVERY_MODEL || args.thinkingLevel !== RECOVERY_THINKING_LEVEL) {
	throw new Error(`Recovery reviews require ${RECOVERY_MODEL}/${RECOVERY_THINKING_LEVEL}.`);
}

mkdirSync(workDir, { recursive: true });
const planPath = path.join(workDir, 'recovery-plan.json');
if (existsSync(planPath)) {
	const saved = readJson(planPath);
	if (
		stableStringify(recoveryPlanInvariant(saved)) !==
		stableStringify(recoveryPlanInvariant(stablePlan))
	) {
		throw new Error('Saved recovery plan differs from the current fail-closed preflight.');
	}
} else {
	writeJson(planPath, stablePlan);
}

function recoveryPlanInvariant(plan) {
	return {
		...plan,
		existingImmutableOutputsValidatedAndReused: [],
		collisions: []
	};
}
loadDefaultEnv(rootDir);
const sharedRun = await runOrResumeReview('shared-fresh-review', preflight.shared, outputDirs[0]);
const higherRun = await runOrResumeReview('higher-fresh-review', preflight.higher, outputDirs[1]);
const artifacts = buildReviewedSplitRecoveryArtifacts({
	preflight,
	sharedReview: sharedRun.review,
	higherReview: higherRun.review,
	sharedReviewSummary: sharedRun.summary,
	higherReviewSummary: higherRun.summary,
	catalog
});
const finalCollisions = reviewedSplitRecoveryCollisions(
	[artifacts.shared.validated, artifacts.higher.validated],
	loadExistingBundles().filter((bundle) => !expectedRecoveryIds.has(bundle.release.id))
);
if (finalCollisions.length) {
	throw new Error(
		`Recovery output collision(s) appeared after review: ${finalCollisions.join(', ')}`
	);
}

writeOrReuseRecoveryArtifact({
	cohortName: 'shared',
	cohort: preflight.shared,
	artifact: artifacts.shared,
	freshRun: sharedRun,
	trace,
	sourceDir,
	stablePlan
});
writeOrReuseRecoveryArtifact({
	cohortName: 'higher',
	cohort: preflight.higher,
	artifact: artifacts.higher,
	freshRun: higherRun,
	trace,
	sourceDir,
	stablePlan
});

for (const artifactPath of stablePlan.outputs) {
	execFileSync(
		process.execPath,
		[
			path.join(rootDir, 'scripts/import-study-cards.mjs'),
			`--input=${artifactPath}`,
			'--validate-only'
		],
		{ cwd: rootDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
	);
}
emit({
	status: 'accepted_zero_regeneration_split_recovery',
	shared: {
		releaseId: SHARED_RELEASE_ID,
		artifactHash: artifacts.shared.artifactHash,
		cards: artifacts.shared.bundle.cards.length
	},
	higher: {
		releaseId: HIGHER_RELEASE_ID,
		artifactHash: artifacts.higher.artifactHash,
		cards: artifacts.higher.bundle.cards.length
	},
	modelCalls: {
		generation: 0,
		freshReviewDecisions:
			(sharedRun.reusedAcceptedOutput ? 0 : preflight.shared.freshReviewCards.length) +
			(higherRun.reusedAcceptedOutput ? 0 : preflight.higher.freshReviewCards.length),
		reusedAcceptedOutputs: [sharedRun, higherRun].filter((run) => run.reusedAcceptedOutput).length,
		sharedReviewResumed: sharedRun.resumed,
		higherReviewResumed: higherRun.resumed
	}
});

async function runOrResumeReview(stage, cohort, existingReleaseDir) {
	const stageDir = path.join(workDir, stage);
	const promptPath = path.join(workDir, `${stage}-prompt.txt`);
	const outputPath = path.join(workDir, `${stage}-model-output.json`);
	const eventsPath = path.join(stageDir, 'events.jsonl');
	const summaryPath = path.join(stageDir, 'codex-run-summary.json');
	const prompt = buildReviewedSplitRecoveryPrompt(cohort);
	const existingArtifactPath = path.join(existingReleaseDir, 'accepted-study-cards.json');
	if (existsSync(existingArtifactPath)) {
		const existingSummaryPath = path.join(
			existingReleaseDir,
			'fresh-review-codex-run-summary.json'
		);
		const existingOutputPath = path.join(existingReleaseDir, 'fresh-review-model-output.json');
		if (!existsSync(existingSummaryPath) || !existsSync(existingOutputPath)) {
			throw new Error(`${cohort.plan.releaseId} exists without reusable fresh-review evidence.`);
		}
		const summary = readJson(existingSummaryPath);
		const review = parseModelJson(readFileSync(existingOutputPath, 'utf8'));
		validateAcceptedRecoveryReview(review, cohort.freshReviewCards, stage);
		if (
			summary.status !== 'passed' ||
			summary.model !== RECOVERY_MODEL ||
			summary.thinkingLevel !== RECOVERY_THINKING_LEVEL ||
			!summary.threadId
		) {
			throw new Error(`${cohort.plan.releaseId} fresh-review summary is invalid.`);
		}
		return {
			summary,
			review,
			resumed: true,
			reusedAcceptedOutput: true,
			promptPath: path.join(existingReleaseDir, 'fresh-review-prompt.txt'),
			outputPath: existingOutputPath,
			eventsPath: path.join(existingReleaseDir, 'fresh-review-events.jsonl'),
			summaryPath: existingSummaryPath
		};
	}
	if (existsSync(promptPath) && readFileSync(promptPath, 'utf8') !== `${prompt}\n`) {
		throw new Error(`${stage} saved prompt drifted.`);
	}
	if (!existsSync(promptPath)) writeFileSync(promptPath, `${prompt}\n`);

	if (existsSync(summaryPath) || existsSync(outputPath)) {
		if (!existsSync(summaryPath) || !existsSync(outputPath)) {
			throw new Error(`${stage} has a partial saved run; preserve it and choose a new --work-dir.`);
		}
		const summary = readJson(summaryPath);
		const review = parseModelJson(readFileSync(outputPath, 'utf8'));
		validateAcceptedRecoveryReview(review, cohort.freshReviewCards, stage);
		if (
			summary.status !== 'passed' ||
			summary.model !== RECOVERY_MODEL ||
			summary.thinkingLevel !== RECOVERY_THINKING_LEVEL ||
			!summary.threadId
		) {
			throw new Error(`${stage} saved summary is not a passed required review.`);
		}
		return { summary, review, resumed: true, promptPath, outputPath, eventsPath, summaryPath };
	}

	const result = await runCodexSdkTurn({
		prompt,
		workDir: stageDir,
		eventsPath,
		lastMessagePath: path.join(stageDir, 'last-message.json'),
		summaryPath,
		model: args.model,
		thinkingLevel: args.thinkingLevel,
		timeoutMs: args.timeoutMs,
		networkAccessEnabled: false,
		webSearchMode: 'disabled',
		outputSchema: reviewedSplitRecoveryReviewSchema(),
		sandboxMode: 'read-only',
		environmentMode: 'minimal'
	});
	writeFileSync(outputPath, `${result.finalResponse.trim()}\n`);
	const review = parseModelJson(result.finalResponse);
	validateAcceptedRecoveryReview(review, cohort.freshReviewCards, stage);
	return {
		summary: readJson(summaryPath),
		review,
		resumed: false,
		promptPath,
		outputPath,
		eventsPath,
		summaryPath
	};
}

function writeOrReuseRecoveryArtifact(input) {
	const existingPath = path.join(
		rootDir,
		'data/study-cards/releases',
		input.artifact.bundle.release.id,
		'accepted-study-cards.json'
	);
	if (!existsSync(existingPath)) {
		writeRecoveryArtifact(input);
		return;
	}
	const existing = validateStudyCardBundle(readJson(existingPath));
	if (stableStringify(existing) !== stableStringify(input.artifact.validated)) {
		throw new Error(
			`${input.artifact.bundle.release.id} existing immutable output differs from the resumed recovery result.`
		);
	}
}

function writeRecoveryArtifact({
	cohortName,
	cohort,
	artifact,
	freshRun,
	trace,
	sourceDir,
	stablePlan
}) {
	const releaseDir = path.join(rootDir, 'data/study-cards/releases', artifact.bundle.release.id);
	if (existsSync(releaseDir))
		throw new Error(`Recovery output already exists: ${relative(releaseDir)}`);
	mkdirSync(releaseDir, { recursive: true });
	const originalReviewById = new Map(
		trace.reviews.reviews.map((review) => [review.cardId, review])
	);
	const freshReviewById = new Map(freshRun.review.reviews.map((review) => [review.cardId, review]));
	const combinedReviews = cohort.cards.map(
		(card) => freshReviewById.get(card.id) ?? originalReviewById.get(card.id)
	);
	if (combinedReviews.some((review) => !review?.accepted || review.issues.length)) {
		throw new Error(`${cohortName} combined review evidence is incomplete.`);
	}
	const originalRejected = trace.reviews.reviews
		.filter((review) => cohort.cards.some((card) => card.id === review.cardId) && !review.accepted)
		.map((review) => ({
			stage: 'archived-independent-review',
			supersededByFreshCorrectedScopeReview: true,
			card: trace.candidates.cards.find((card) => card.id === review.cardId),
			review
		}));

	writeJson(path.join(releaseDir, 'plan.json'), cohort.plan);
	writeJson(path.join(releaseDir, 'source-evidence.json'), cohort.sourceEvidence);
	writeJson(path.join(releaseDir, 'candidate-cards.json'), { cards: cohort.cards });
	writeJson(path.join(releaseDir, 'review.json'), { reviews: combinedReviews });
	writeJson(path.join(releaseDir, 'rejected-cards.json'), { cards: originalRejected });
	writeJson(path.join(releaseDir, 'coverage.json'), { coverage: artifact.bundle.coverage });
	writeJson(path.join(releaseDir, 'accepted-study-cards.json'), artifact.bundle);
	writeJson(path.join(releaseDir, 'recovery-evidence.json'), {
		recoveryVersion: preflight.version,
		zeroRegeneration: true,
		sourceBatchId: SOURCE_BATCH_ID,
		sourceDir: relative(sourceDir),
		archivedFileHashes: ARCHIVED_FILE_HASHES,
		plan: cohort.plan,
		preservedOriginalReviewAcceptedCardIds: cohort.preservedAcceptedCardIds,
		freshReviewCardIds: cohort.freshReviewCards.map((card) => card.id),
		freshReviewer: freshRun.summary,
		artifactHash: artifact.artifactHash,
		artifactPath: artifact.bundle.release.artifactPath
	});
	writeJson(path.join(releaseDir, 'generation-run.json'), {
		status: 'accepted_after_zero_regeneration_reviewed_split_recovery',
		plan: cohort.plan,
		recovery: {
			version: preflight.version,
			sourceBatchId: SOURCE_BATCH_ID,
			cardsGeneratedDuringRecovery: 0,
			freshReviewDecisions: cohort.freshReviewCards.length,
			freshReviewerRunId: freshRun.summary.threadId
		},
		counts: {
			published: artifact.bundle.cards.length,
			preservedOriginalReviewAcceptances: cohort.preservedAcceptedCardIds.length,
			freshReviewAccepted: cohort.freshReviewCards.length,
			readyCoverageRows: artifact.bundle.coverage.length,
			withheldCoverageRows: 0
		},
		artifactPath: artifact.bundle.release.artifactPath,
		artifactHash: artifact.artifactHash,
		sourceManifestHash: artifact.bundle.release.sourceManifestHash,
		modelUsage: {
			archivedBaseGenerator: trace.generationSummary.usage,
			archivedOriginalReviewer: trace.originalReviewSummary.usage,
			...(cohortName === 'shared'
				? { archivedStoppingRepairGenerator: trace.repairGenerationSummary.usage }
				: {}),
			freshReviewer: freshRun.summary.usage
		}
	});
	writeFileSync(
		path.join(releaseDir, 'fresh-review-prompt.txt'),
		readFileSync(freshRun.promptPath, 'utf8')
	);
	writeFileSync(
		path.join(releaseDir, 'fresh-review-model-output.json'),
		readFileSync(freshRun.outputPath, 'utf8')
	);
	copyFileSync(freshRun.eventsPath, path.join(releaseDir, 'fresh-review-events.jsonl'));
	copyFileSync(freshRun.summaryPath, path.join(releaseDir, 'fresh-review-codex-run-summary.json'));
	for (const [source, destination] of archivedEvidenceCopies(cohortName)) {
		copyFileSync(path.join(sourceDir, source), path.join(releaseDir, destination));
	}
	writeJson(path.join(releaseDir, 'queue-terminal-evidence.json'), stablePlan.queue);
}

function archivedEvidenceCopies(cohortName) {
	return [
		['recovery-evidence.json', 'archived-rollout-recovery-evidence.json'],
		['plan.json', 'archived-failed-plan.json'],
		['candidate-cards.json', 'archived-candidate-cards.json'],
		['review.json', 'archived-review.json'],
		['generation-prompt.txt', 'archived-generation-prompt.txt'],
		['generation-model-output.json', 'archived-generation-model-output.json'],
		['generation/codex-run-summary.json', 'archived-generation-codex-run-summary.json'],
		['review-prompt.txt', 'archived-review-prompt.txt'],
		['review-model-output.json', 'archived-review-model-output.json'],
		['review/codex-run-summary.json', 'archived-review-codex-run-summary.json'],
		...(cohortName === 'shared'
			? [
					['reviewed-repair-generation-1-prompt.txt', 'archived-repair-prompt.txt'],
					['reviewed-repair-generation-1-model-output.json', 'archived-repair-model-output.json'],
					[
						'reviewed-repair-generation-1/codex-run-summary.json',
						'archived-repair-codex-run-summary.json'
					]
				]
			: [])
	];
}

function loadExistingBundles() {
	const releaseRoot = path.join(rootDir, 'data/study-cards/releases');
	if (!existsSync(releaseRoot)) return [];
	return readdirSync(releaseRoot, { withFileTypes: true }).flatMap((entry) => {
		if (!entry.isDirectory()) return [];
		const artifactPath = path.join(releaseRoot, entry.name, 'accepted-study-cards.json');
		return existsSync(artifactPath) ? [validateStudyCardBundle(readJson(artifactPath))] : [];
	});
}

function draftValidatedBundle(cohort) {
	// Preflight already built and validated this exact cohort; use the public
	// identities for collision detection without claiming a durable release.
	return {
		release: { id: cohort.plan.releaseId },
		cards: cohort.cards.map((card) => ({
			id: card.id,
			conceptKey: card.conceptKey,
			board: 'AQA',
			subject: 'Physics'
		}))
	};
}

function assertExistingRecoveryShape(bundle, cohort) {
	const cardIds = bundle.cards.map((card) => card.id).sort();
	const expectedCardIds = cohort.cards.map((card) => card.id).sort();
	const componentIds = [
		...new Set(
			bundle.cards.flatMap((card) => card.targets.map((target) => target.curriculumComponentId))
		)
	].sort();
	if (
		bundle.release.id !== cohort.plan.releaseId ||
		bundle.release.reviewer.independentTurn !== true ||
		stableStringify(cardIds) !== stableStringify(expectedCardIds) ||
		stableStringify(componentIds) !== stableStringify([...cohort.plan.requiredComponentIds].sort())
	) {
		throw new Error(`${cohort.plan.releaseId} existing immutable recovery output drifted.`);
	}
}

function assertArchivedFileHashes(directory) {
	for (const [name, expected] of Object.entries(ARCHIVED_FILE_HASHES)) {
		const filePath = path.join(directory, name);
		if (!existsSync(filePath)) throw new Error(`Archived recovery input is missing ${name}.`);
		const actual = sha256(readFileSync(filePath));
		if (actual !== expected) {
			throw new Error(
				`Archived recovery input ${name} drifted: expected ${expected}, found ${actual}.`
			);
		}
	}
}

function assertRecoveryExecutionGate(queue) {
	if (!args.preparedLock) {
		assertReviewedSplitRecoveryQueueTerminal(queue);
		return;
	}
	const lockPath = path.resolve(rootDir, args.preparedLock);
	const lock = readJson(lockPath);
	const executionQueuePath = path.resolve(rootDir, lock.executionQueue?.path ?? '');
	const statePath = path.join(path.dirname(lockPath), 'queue-state.json');
	const state = readJson(statePath);
	if (
		lock.schemaVersion !== 'prepared-study-card-completion-lock-v1' ||
		lock.maxModelConcurrency !== 2 ||
		lock.executionQueue?.sha256 !== sha256(readFileSync(executionQueuePath)) ||
		state.schemaVersion !== 'prepared-study-card-completion-state-v1' ||
		state.lockFingerprint !== lock.lockFingerprint ||
		state.maxModelConcurrency > 2 ||
		state.status !== 'running-standard-study-cards'
	) {
		throw new Error('Prepared orchestrator recovery gate is absent, drifted or not active.');
	}
}

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	const integer = (name, fallback, minimum, maximum) => {
		const parsed = Number(value(name, String(fallback)));
		if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
			throw new Error(`--${name} must be an integer from ${minimum} to ${maximum}.`);
		}
		return parsed;
	};
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		execute: argv.includes('--execute'),
		sourceDir: value('source-dir'),
		workDir: value('work-dir'),
		output: value('output'),
		preparedLock: value('prepared-lock'),
		model: value('model', RECOVERY_MODEL),
		thinkingLevel: value('thinking-level', RECOVERY_THINKING_LEVEL),
		timeoutMs: integer('timeout-ms', 3_600_000, 60_000, 14_400_000)
	};
}

function usage() {
	return `Usage:
node scripts/recover-reviewed-study-card-split.mjs [--execute]

The default is a no-model, fail-closed preflight of the archived failed Combined
Physics shard. --execute is permitted only after queue-state.json is terminal or
under the active hash-bound prepared completion orchestrator.
It performs zero generation calls, freshly reviews one repaired shared card and
two original Higher-only cards, then writes two immutable accepted releases.

Options:
  --execute                 run or resume the two fresh review turns
  --source-dir=<path>       archived failed trace directory
  --work-dir=<path>         resumable fresh-review evidence directory
  --output=<path>           also write the emitted JSON report
  --prepared-lock=<path>    active prepared-orchestrator lock (orchestrator only)
  --timeout-ms=<integer>    per-review timeout
  --help                    show this help`;
}

function parseModelJson(value) {
	const trimmed = String(value ?? '').trim();
	const unwrapped = trimmed.startsWith('```')
		? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
		: trimmed;
	return JSON.parse(unwrapped);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function emit(value) {
	const json = `${JSON.stringify(value, null, 2)}\n`;
	if (args.output) writeFileSync(path.resolve(rootDir, args.output), json);
	console.log(json.trimEnd());
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
