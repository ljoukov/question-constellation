#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Prepared queue JSON is validated fail closed before execution.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import {
	hashStudyCardArtifact,
	stableStringify,
	validateStudyCardBundle
} from './lib/study-card-artifact.mjs';
import { assertStudyCardCurriculumScope } from './lib/study-card-import.mjs';
import { materializeStudyCardModelLineage } from './lib/study-card-model-lineage.mjs';
import {
	assertPreparedStudyCardSourcePdfLock,
	quarantineIncompletePreparedStudyCardRelease,
	requeuePreparedStudyCardJobWithMissingArtifact,
	writePreparedStudyCardStateAtomically
} from './lib/prepared-study-card-completion-state.mjs';

const EXPECTED_STANDARD_PHYSICAL_BATCHES = 26;
const EXPECTED_STANDARD_GENERATION_BATCHES = 24;
const EXPECTED_RECOVERY_PHYSICAL_BATCHES = 2;
const EXPECTED_STANDARD_TARGETS = 438;
const EXPECTED_STANDARD_PROMPT_VERSION = 'standard-study-card-descendant-coverage-v2';
const EXPECTED_ARCHIVED_RECOVERY_PROMPT_VERSION = 'standard-study-card-descendant-coverage-v1';
const EXPECTED_LITERATURE_SHARDS = 13;
const EXPECTED_LITERATURE_CARDS = 171;
const EXECUTE_COMMAND = 'node scripts/run-prepared-study-card-completion.mjs --execute';
const STANDARD_PUBLICATION_FILES = Object.freeze([
	'plan.json',
	'source-evidence.json',
	'generation-prompt.txt',
	'generation-model-output.json',
	'generation-events.jsonl',
	'generation-codex-run-summary.json',
	'raw-candidate-cards.json',
	'candidate-cards.json',
	'failure-diagnostics.json',
	'review-prompt.txt',
	'review-model-output.json',
	'review-events.jsonl',
	'review-codex-run-summary.json',
	'review.json',
	'coverage.json',
	'generation-run.json'
]);
const LITERATURE_PUBLICATION_FILES = Object.freeze([
	'plan.json',
	'source-plan.json',
	'source-evidence.json',
	'generation-prompt.txt',
	'generation-model-output.json',
	'generation-events.jsonl',
	'generation-codex-run-summary.json',
	'raw-candidate-cards.json',
	'candidate-cards.json',
	'review-prompt.txt',
	'review-model-output.json',
	'review-events.jsonl',
	'review-codex-run-summary.json',
	'review.json',
	'coverage-mode-matrix.json',
	'rejected-cards.json',
	'generation-run.json'
]);
const ARCHIVED_RECOVERY_PUBLICATION_FILES = Object.freeze([
	'plan.json',
	'source-evidence.json',
	'candidate-cards.json',
	'review.json',
	'coverage.json',
	'recovery-evidence.json',
	'generation-run.json',
	'fresh-review-prompt.txt',
	'fresh-review-model-output.json',
	'fresh-review-events.jsonl',
	'fresh-review-codex-run-summary.json',
	'queue-terminal-evidence.json'
]);

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
const evidenceDir = path.join(rootDir, 'docs/release-evidence/study-card-prepared-completion');
const logDir = path.join(rootDir, 'tmp/study-card-generation/prepared-completion-logs');
const incompleteReleaseQuarantineDir = path.join(
	rootDir,
	'tmp/study-card-generation/preserved-incomplete-releases'
);
const executionQueuePath = path.join(
	rootDir,
	'docs/release-evidence/study-card-descendant-coverage/tier-safe-execution-queue.json'
);
const literatureQueuePath = path.join(
	rootDir,
	'docs/release-evidence/english-literature-deepening/queue-preflight.json'
);
const coverageLedgerPath = path.join(
	rootDir,
	'docs/release-evidence/study-card-coverage-ledger.json'
);
const sourcePreflightPath = path.join(
	rootDir,
	'docs/release-evidence/english-literature-deepening/source-preflight.json'
);
const lockPath = path.join(evidenceDir, 'prepared-run-lock.json');
const dryRunPath = path.join(evidenceDir, 'orchestrator-dry-run.json');
const statePath = path.join(evidenceDir, 'queue-state.json');
const catalog = readJson(path.join(rootDir, 'data/curricula/curriculum-catalog.json'));

mkdirSync(evidenceDir, { recursive: true });
mkdirSync(logDir, { recursive: true });
const executionQueue = readJson(executionQueuePath);
const literatureQueue = readJson(literatureQueuePath);
const coverageLedger = readJson(coverageLedgerPath);
const sourcePreflight = readJson(sourcePreflightPath);
const prepared = validatePreparedQueues();
const lock = buildLock(prepared);
if (args.prepareNewLock && args.execute) {
	throw new Error('--prepare-new-lock cannot be combined with --execute.');
}
if (existsSync(lockPath)) {
	const existing = readJson(lockPath);
	if (stableStringify(existing) !== stableStringify(lock)) {
		if (!args.prepareNewLock) {
			throw new Error(
				'Prepared completion lock differs from the current queue/source files; inspect the deterministic queue diff, then rerun with --prepare-new-lock before execution.'
			);
		}
		if (existsSync(statePath)) {
			throw new Error('Refusing to replace a prepared lock while completion state exists.');
		}
		writeJson(lockPath, lock);
	}
} else {
	writeJson(lockPath, lock);
}

const dryRun = buildDryRun(prepared, lock);
writeJson(dryRunPath, dryRun);
if (!args.execute) {
	console.log(JSON.stringify(dryRun, null, 2));
	process.exit(0);
}

const state = loadOrCreateState(lock, prepared);
reconcileAcceptedOutputs(state, prepared);
state.status = 'running-standard-study-cards';
writeState(state);
await runStandardStage(state, prepared);
if (state.standard.jobs.some((job) => job.status !== 'accepted')) {
	state.status = 'standard-stage-incomplete';
	writeState(state);
	throw new Error(
		`Prepared standard stage is incomplete; rerun ${EXECUTE_COMMAND} to resume failed or interrupted work.`
	);
}

assertStandardStageClosed();
state.standard.finishedAt ??= new Date().toISOString();
state.status = 'running-english-literature';
state.literature.startedAt ??= new Date().toISOString();
writeState(state);
await runLiteratureStage(state, prepared);
if (state.literature.jobs.some((job) => job.status !== 'accepted')) {
	state.status = 'literature-stage-incomplete';
	writeState(state);
	throw new Error(
		`Prepared Literature stage is incomplete; rerun ${EXECUTE_COMMAND} to resume failed or interrupted work.`
	);
}

state.literature.finishedAt ??= new Date().toISOString();
state.finishedAt = new Date().toISOString();
state.status = 'complete';
state.counts = stateCounts(state);
writeState(state);
console.log(JSON.stringify(state, null, 2));

function validatePreparedQueues() {
	if (
		executionQueue.schemaVersion !== 'study-card-tier-safe-execution-queue-v1' ||
		executionQueue.physicalBatches?.length !== EXPECTED_STANDARD_PHYSICAL_BATCHES ||
		executionQueue.modelCallsDuringPreparation !== 0
	) {
		throw new Error('Prepared tier-safe execution queue contract drifted.');
	}
	const standardBatches = executionQueue.physicalBatches.filter(
		(batch) => batch.executionKind === 'standard-generation-review'
	);
	const recoveryBatches = executionQueue.physicalBatches.filter(
		(batch) => batch.executionKind === 'archived-output-fresh-review-only'
	);
	const targetIds = executionQueue.physicalBatches.flatMap((batch) => batch.componentIds);
	if (
		standardBatches.length !== EXPECTED_STANDARD_GENERATION_BATCHES ||
		recoveryBatches.length !== EXPECTED_RECOVERY_PHYSICAL_BATCHES ||
		targetIds.length !== EXPECTED_STANDARD_TARGETS ||
		new Set(targetIds).size !== EXPECTED_STANDARD_TARGETS ||
		executionQueue.physicalBatches.some(
			(batch) => batch.componentCount !== batch.componentIds.length || batch.componentCount > 20
		)
	) {
		throw new Error('Prepared 24 + 2 physical batch union drifted from 438 unique targets.');
	}
	const recoveryGroups = new Map();
	for (const batch of recoveryBatches) {
		if (!batch.executionGroupId) {
			throw new Error(`${batch.physicalBatchId} lacks an atomic recovery execution group.`);
		}
		const rows = recoveryGroups.get(batch.executionGroupId) ?? [];
		rows.push(batch);
		recoveryGroups.set(batch.executionGroupId, rows);
	}
	if (
		recoveryGroups.size !== 1 ||
		[...recoveryGroups.values()][0].length !== 2 ||
		new Set([...recoveryGroups.values()][0].map((batch) => stableStringify(batch.command))).size !==
			1
	) {
		throw new Error('The two fresh-review physical batches are not one atomic command group.');
	}
	for (const batch of standardBatches) validateStandardDryCommand(batch);
	const recoveryPlan = runJson([process.execPath, 'scripts/recover-reviewed-study-card-split.mjs']);
	if (
		recoveryPlan.zeroRegeneration !== true ||
		recoveryPlan.cohorts?.length !== 2 ||
		recoveryPlan.cohorts.reduce((sum, cohort) => sum + cohort.expectedCardCount, 0) !== 3 ||
		recoveryPlan.cohorts.reduce((sum, cohort) => sum + cohort.freshReviewDecisions, 0) !== 3
	) {
		throw new Error('Atomic Combined Physics fresh-review recovery preflight drifted.');
	}

	if (
		literatureQueue.schemaVersion !== 'ocr-j352-literature-deepening-queue-preflight-v1' ||
		literatureQueue.status !== 'passed-no-model-execution' ||
		literatureQueue.jobs?.length !== EXPECTED_LITERATURE_SHARDS ||
		literatureQueue.jobs.reduce((sum, job) => sum + job.expectedCardCount, 0) !==
			EXPECTED_LITERATURE_CARDS ||
		literatureQueue.sourcePreflight?.status !== 'passed' ||
		sourcePreflight.status !== 'passed' ||
		sourcePreflight.counts?.sources !== 25 ||
		sourcePreflight.counts?.evidence !== EXPECTED_LITERATURE_CARDS
	) {
		throw new Error('Prepared 13-shard Literature queue/source contract drifted.');
	}
	for (const job of literatureQueue.jobs) {
		if (
			sha256(readFileSync(path.join(rootDir, job.sourcePlanPath))) !== job.sourcePlanHash ||
			job.dryPlanStatus !== 'passed' ||
			job.command[0] !== 'node' ||
			job.command[1] !== 'scripts/generate-english-literature-study-deck.mjs' ||
			!job.command.includes('--generate')
		) {
			throw new Error(`${job.releaseId} Literature execution command drifted.`);
		}
	}
	if (
		coverageLedger.canonical?.eligible !== 789 ||
		coverageLedger.canonical?.covered !== 351 ||
		coverageLedger.canonical?.uncovered !== EXPECTED_STANDARD_TARGETS
	) {
		throw new Error('Coverage ledger no longer describes the prepared 351/438 boundary.');
	}
	return { standardBatches, recoveryBatches, recoveryGroups, targetIds };
}

function validateStandardDryCommand(batch) {
	if (
		batch.command?.[0] !== 'node' ||
		batch.command?.[1] !== 'scripts/generate-standard-study-card-batch.mjs' ||
		!batch.command.includes('--generate')
	) {
		throw new Error(`${batch.physicalBatchId} is not an exact standard generator command.`);
	}
	const dryCommand = batch.command.filter((argument) => argument !== '--generate');
	const plan = runJson([process.execPath, ...dryCommand.slice(1)]);
	assertPreparedStudyCardSourcePdfLock(
		plan.sourcePdf,
		batch.dryPlan?.sourcePdf,
		batch.physicalBatchId
	);
	if (
		plan.batchId !== batch.physicalBatchId ||
		plan.promptVersion !== EXPECTED_STANDARD_PROMPT_VERSION ||
		batch.dryPlan?.promptVersion !== EXPECTED_STANDARD_PROMPT_VERSION ||
		plan.expectedCardCount !== batch.componentCount ||
		stableStringify(plan.requiredComponentIds) !== stableStringify(batch.componentIds) ||
		stableStringify(plan.offeringIds) !== stableStringify(batch.offeringIds)
	) {
		throw new Error(`${batch.physicalBatchId} no-model dry command drifted.`);
	}
}

function buildLock(preparedInput) {
	const inputs = {
		executionQueue: fileLock(executionQueuePath),
		literatureQueue: fileLock(literatureQueuePath),
		coverageLedger: fileLock(coverageLedgerPath),
		literatureSourcePreflight: fileLock(sourcePreflightPath),
		counts: {
			standardPhysicalBatches: executionQueue.physicalBatches.length,
			standardGenerationBatches: preparedInput.standardBatches.length,
			archivedFreshReviewPhysicalBatches: preparedInput.recoveryBatches.length,
			atomicStandardExecutionUnits:
				preparedInput.standardBatches.length + preparedInput.recoveryGroups.size,
			standardTargets: preparedInput.targetIds.length,
			literatureShards: literatureQueue.jobs.length,
			literatureCards: literatureQueue.jobs.reduce((sum, job) => sum + job.expectedCardCount, 0)
		},
		maxModelConcurrency: 2,
		stageOrder: ['standard-study-cards', 'english-literature'],
		executeCommand: EXECUTE_COMMAND
	};
	return {
		schemaVersion: 'prepared-study-card-completion-lock-v1',
		...inputs,
		lockFingerprint: sha256(stableStringify(inputs))
	};
}

function buildDryRun(preparedInput, lockInput) {
	const standardExisting = executionQueue.physicalBatches.filter((batch) =>
		existsSync(artifactPath(batch.physicalBatchId))
	);
	for (const batch of standardExisting) validatePhysicalArtifact(batch);
	const literatureExisting = literatureQueue.jobs.filter((job) =>
		existsSync(artifactPath(job.releaseId))
	);
	for (const job of literatureExisting) validateLiteratureArtifact(job);
	return {
		schemaVersion: 'prepared-study-card-completion-orchestrator-preflight-v1',
		status: 'passed-no-model-execution',
		lockPath: relative(lockPath),
		lockFingerprint: lockInput.lockFingerprint,
		statePath: relative(statePath),
		maxModelConcurrency: 2,
		standardStage: {
			physicalBatches: executionQueue.physicalBatches.length,
			standardGenerationBatches: preparedInput.standardBatches.length,
			archivedFreshReviewPhysicalBatches: preparedInput.recoveryBatches.length,
			atomicExecutionUnits:
				preparedInput.standardBatches.length + preparedInput.recoveryGroups.size,
			targets: preparedInput.targetIds.length,
			uniqueTargets: new Set(preparedInput.targetIds).size,
			existingImmutableOutputsValidated: standardExisting.length
		},
		transitionGate: {
			requiresAllStandardPhysicalBatchesAccepted: true,
			requiresRemainingPlannerTargets: 0,
			then: 'run-the-13-hash-locked-literature-shards'
		},
		literatureStage: {
			shards: literatureQueue.jobs.length,
			cards: literatureQueue.jobs.reduce((sum, job) => sum + job.expectedCardCount, 0),
			sources: sourcePreflight.counts.sources,
			existingImmutableOutputsValidated: literatureExisting.length
		},
		atomicRecoveryPolicy:
			'The two Combined Physics fresh-review physical batches share one executionGroupId and are launched once; both resulting artifacts are validated and mapped back to their physical batch ids.',
		acceptedOutputPolicy:
			'An existing immutable artifact is validated and reused. It is never regenerated.',
		executeCommand: EXECUTE_COMMAND,
		modelCallsDuringDryRun: 0
	};
}

function loadOrCreateState(lockInput, preparedInput) {
	if (existsSync(statePath)) {
		const saved = readJson(statePath);
		if (
			saved.schemaVersion !== 'prepared-study-card-completion-state-v1' ||
			saved.lockFingerprint !== lockInput.lockFingerprint
		) {
			throw new Error('Saved prepared completion state does not match the hash lock.');
		}
		return saved;
	}
	const now = new Date().toISOString();
	return {
		schemaVersion: 'prepared-study-card-completion-state-v1',
		status: 'ready',
		lockPath: relative(lockPath),
		lockFingerprint: lockInput.lockFingerprint,
		maxModelConcurrency: args.maxConcurrent,
		startedAt: now,
		finishedAt: null,
		standard: {
			startedAt: now,
			finishedAt: null,
			physicalBatchCount: executionQueue.physicalBatches.length,
			jobs: executionQueue.physicalBatches.map((batch) => stateJob(batch.physicalBatchId))
		},
		literature: {
			startedAt: null,
			finishedAt: null,
			shardCount: literatureQueue.jobs.length,
			jobs: literatureQueue.jobs.map((job) => stateJob(job.releaseId))
		},
		counts: {
			standardAccepted: 0,
			literatureAccepted: 0
		},
		executeCommand: EXECUTE_COMMAND,
		preparedExecutionUnits: preparedInput.standardBatches.length + preparedInput.recoveryGroups.size
	};
}

function stateJob(id) {
	return { id, status: 'queued', attempts: 0, artifactHash: null, logPath: null };
}

function reconcileAcceptedOutputs(stateInput) {
	for (const batch of executionQueue.physicalBatches) {
		const row = stateInput.standard.jobs.find((job) => job.id === batch.physicalBatchId);
		quarantinePartialPublication({
			releaseId: batch.physicalBatchId,
			requiredEvidenceFiles:
				batch.executionKind === 'archived-output-fresh-review-only'
					? ARCHIVED_RECOVERY_PUBLICATION_FILES
					: STANDARD_PUBLICATION_FILES,
			row
		});
		if (existsSync(artifactPath(batch.physicalBatchId))) {
			const artifact = validatePhysicalArtifact(batch);
			markAccepted(row, artifact, 'existing-immutable-output-validated-and-reused');
		} else requeuePreparedStudyCardJobWithMissingArtifact(row);
	}
	for (const job of literatureQueue.jobs) {
		const row = stateInput.literature.jobs.find((entry) => entry.id === job.releaseId);
		quarantinePartialPublication({
			releaseId: job.releaseId,
			requiredEvidenceFiles: LITERATURE_PUBLICATION_FILES,
			row
		});
		if (existsSync(artifactPath(job.releaseId))) {
			const artifact = validateLiteratureArtifact(job);
			markAccepted(row, artifact, 'existing-immutable-output-validated-and-reused');
		} else requeuePreparedStudyCardJobWithMissingArtifact(row);
	}
	stateInput.counts = stateCounts(stateInput);
	writeState(stateInput);
}

function quarantinePartialPublication({ releaseId, requiredEvidenceFiles, row }) {
	const releaseDir = path.join(rootDir, 'data/study-cards/releases', releaseId);
	const preserved = quarantineIncompletePreparedStudyCardRelease({
		releaseDir,
		requiredEvidenceFiles,
		quarantineRoot: incompleteReleaseQuarantineDir
	});
	if (!preserved) return;
	row.preservedIncompleteReleaseDirs ??= [];
	row.preservedIncompleteReleaseDirs.push(relative(preserved));
	row.note = 'incomplete-durable-publication-preserved-before-resume';
}

async function runStandardStage(stateInput, preparedInput) {
	const units = [
		...preparedInput.recoveryGroups.entries().map(([id, batches]) => ({
			id,
			kind: 'atomic-recovery-group',
			batches,
			command: batches[0].command
		})),
		...preparedInput.standardBatches.map((batch) => ({
			id: batch.physicalBatchId,
			kind: 'standard-generation-review',
			batches: [batch],
			command: batch.command
		}))
	].filter((unit) =>
		unit.batches.some(
			(batch) =>
				stateInput.standard.jobs.find((job) => job.id === batch.physicalBatchId).status !==
				'accepted'
		)
	);
	await runConcurrent(units, async (unit) => {
		const rows = unit.batches.map((batch) =>
			stateInput.standard.jobs.find((job) => job.id === batch.physicalBatchId)
		);
		if (rows.every((row) => row.status === 'accepted')) return;
		const logPath = path.join(logDir, `${slug(unit.id)}.log`);
		for (const row of rows) {
			row.status = 'running';
			row.attempts += 1;
			row.startedAt = new Date().toISOString();
			row.logPath = relative(logPath);
		}
		writeState(stateInput);
		try {
			const command =
				unit.kind === 'standard-generation-review'
					? resumableStandardCommand(unit.batches[0], rows[0])
					: unit.command;
			const exitCode = await runLogged(command, logPath);
			if (exitCode !== 0) throw new Error(`process exited ${exitCode}`);
			for (const [index, batch] of unit.batches.entries()) {
				const artifact = validatePhysicalArtifact(batch);
				markAccepted(rows[index], artifact, 'new-immutable-output-validated');
			}
		} catch (error) {
			for (const row of rows.filter((entry) => entry.status !== 'accepted')) {
				row.status = 'failed';
				row.finishedAt = new Date().toISOString();
				row.error = error instanceof Error ? error.message : String(error);
			}
		}
		stateInput.counts = stateCounts(stateInput);
		writeState(stateInput);
	});
}

async function runLiteratureStage(stateInput) {
	const jobs = literatureQueue.jobs.filter(
		(job) =>
			stateInput.literature.jobs.find((row) => row.id === job.releaseId).status !== 'accepted'
	);
	await runConcurrent(jobs, async (job) => {
		const row = stateInput.literature.jobs.find((entry) => entry.id === job.releaseId);
		const logPath = path.join(logDir, `${job.releaseId}.log`);
		row.status = 'running';
		row.attempts += 1;
		row.startedAt = new Date().toISOString();
		row.logPath = relative(logPath);
		writeState(stateInput);
		try {
			preserveIncompleteWorkDir(
				path.join(rootDir, 'tmp/study-card-generation', job.releaseId),
				row
			);
			const exitCode = await runLogged(job.command, logPath);
			if (exitCode !== 0) throw new Error(`process exited ${exitCode}`);
			const artifact = validateLiteratureArtifact(job);
			markAccepted(row, artifact, 'new-immutable-output-validated');
		} catch (error) {
			row.status = 'failed';
			row.finishedAt = new Date().toISOString();
			row.error = error instanceof Error ? error.message : String(error);
		}
		stateInput.counts = stateCounts(stateInput);
		writeState(stateInput);
	});
}

function resumableStandardCommand(batch, stateRow) {
	const command = [...batch.command];
	const workDir = path.join(rootDir, 'tmp/study-card-generation', batch.physicalBatchId);
	if (!existsSync(workDir)) return command;
	const planPath = path.join(workDir, 'plan.json');
	if (!existsSync(planPath)) {
		preserveIncompleteWorkDir(workDir, stateRow);
		return command;
	}
	const savedPlan = readJson(planPath);
	if (
		savedPlan.batchId !== batch.physicalBatchId ||
		stableStringify(savedPlan.requiredComponentIds) !== stableStringify(batch.componentIds) ||
		stableStringify(savedPlan.offeringIds) !== stableStringify(batch.offeringIds)
	) {
		preserveIncompleteWorkDir(workDir, stateRow);
		return command;
	}
	if (passedSummary(path.join(workDir, 'review/codex-run-summary.json'))) {
		return [...command, '--resume-reviewed'];
	}
	if (
		passedSummary(path.join(workDir, 'generation/codex-run-summary.json')) &&
		existsSync(path.join(workDir, 'candidate-cards.json')) &&
		existsSync(path.join(workDir, 'failure-diagnostics.json')) &&
		!existsSync(path.join(workDir, 'review'))
	) {
		return [...command, '--resume-generated'];
	}
	preserveIncompleteWorkDir(workDir, stateRow);
	return command;
}

function preserveIncompleteWorkDir(workDir, stateRow) {
	if (!existsSync(workDir)) return;
	const suffix = `${Date.now()}-${sha256(relative(workDir)).slice(0, 8)}`;
	const preserved = `${workDir}-preserved-${suffix}`;
	renameSync(workDir, preserved);
	stateRow.preservedIncompleteWorkDirs ??= [];
	stateRow.preservedIncompleteWorkDirs.push(relative(preserved));
}

function passedSummary(filePath) {
	if (!existsSync(filePath)) return false;
	try {
		return readJson(filePath).status === 'passed';
	} catch {
		return false;
	}
}

function validatePhysicalArtifact(batch) {
	const filePath = artifactPath(batch.physicalBatchId);
	if (!existsSync(filePath)) throw new Error(`${batch.physicalBatchId} artifact is missing.`);
	const bundle = validateStudyCardBundle(readJson(filePath));
	assertStudyCardCurriculumScope(bundle, catalog);
	const componentIds = new Set(
		bundle.cards.flatMap((card) => card.targets.map((target) => target.curriculumComponentId))
	);
	const offeringIds = new Set(
		bundle.cards.flatMap((card) => card.targets.map((target) => target.offeringId))
	);
	const expectedPromptVersion =
		batch.executionKind === 'standard-generation-review'
			? EXPECTED_STANDARD_PROMPT_VERSION
			: EXPECTED_ARCHIVED_RECOVERY_PROMPT_VERSION;
	if (
		bundle.release.id !== batch.physicalBatchId ||
		bundle.release.promptVersion !== expectedPromptVersion ||
		bundle.cards.length !== batch.componentCount ||
		stableStringify([...componentIds].sort()) !== stableStringify([...batch.componentIds].sort()) ||
		[...offeringIds].some((id) => !batch.offeringIds.includes(id))
	) {
		throw new Error(`${batch.physicalBatchId} immutable artifact differs from its physical batch.`);
	}
	const lineage = materializeStudyCardModelLineage({
		releaseDir: path.dirname(filePath),
		rootDir
	});
	return {
		artifactPath: relative(filePath),
		artifactHash: hashStudyCardArtifact(bundle),
		cards: bundle.cards.length,
		lineageManifestPath: lineage.manifestPath,
		lineageManifestSha256: lineage.manifestSha256
	};
}

function validateLiteratureArtifact(job) {
	const filePath = artifactPath(job.releaseId);
	if (!existsSync(filePath)) throw new Error(`${job.releaseId} artifact is missing.`);
	const bundle = validateStudyCardBundle(readJson(filePath));
	assertStudyCardCurriculumScope(bundle, catalog);
	const sourcePlan = readJson(path.join(rootDir, job.sourcePlanPath));
	const evidence = sourcePlan.topics.flatMap((topic) => topic.evidence);
	const expectedCardIds = evidence.map((row) => `ocr-j352-card-${row.id}`).sort();
	if (
		bundle.release.id !== job.releaseId ||
		bundle.cards.length !== job.expectedCardCount ||
		stableStringify(bundle.cards.map((card) => card.id).sort()) !== stableStringify(expectedCardIds)
	) {
		throw new Error(`${job.releaseId} immutable artifact differs from its Literature shard.`);
	}
	const releaseDir = path.dirname(filePath);
	if (job.index === 13) validatePoetryRuntimeContract(bundle, releaseDir, sourcePlan);
	const lineage = materializeStudyCardModelLineage({ releaseDir, rootDir });
	return {
		artifactPath: relative(filePath),
		artifactHash: hashStudyCardArtifact(bundle),
		cards: bundle.cards.length,
		lineageManifestPath: lineage.manifestPath,
		lineageManifestSha256: lineage.manifestSha256
	};
}

function validatePoetryRuntimeContract(bundle, releaseDir, sourcePlan) {
	const matrixPath = path.join(releaseDir, 'coverage-mode-matrix.json');
	if (!existsSync(matrixPath)) throw new Error('Poetry release lacks mode-matrix provenance.');
	const matrix = readJson(matrixPath).matrix;
	for (const topic of sourcePlan.topics.filter((entry) => entry.evidence.length)) {
		const topicCards = bundle.cards.filter((card) =>
			card.targets.some((target) => target.topicComponentId === topic.topicComponentId)
		);
		const coverage = bundle.coverage.find((row) => row.topicComponentId === topic.topicComponentId);
		const quotation = matrix.find(
			(row) => row.topicComponentId === topic.topicComponentId && row.mode === 'quotation'
		);
		const method = matrix.find(
			(row) => row.topicComponentId === topic.topicComponentId && row.mode === 'method'
		);
		if (
			topicCards.length !== 5 ||
			topicCards.filter((card) => card.kind === 'quotation').length !== 4 ||
			topicCards.filter((card) => card.kind === 'method').length !== 1 ||
			coverage?.status !== 'ready' ||
			coverage.cardCount !== 5 ||
			quotation?.status !== 'withheld' ||
			quotation.cardCount !== 4 ||
			method?.status !== 'ready' ||
			method.cardCount !== 1
		) {
			throw new Error(`${topic.title} poetry runtime/mode-matrix contract failed.`);
		}
	}
}

function markAccepted(row, artifact, note) {
	row.status = 'accepted';
	row.finishedAt = new Date().toISOString();
	row.artifactPath = artifact.artifactPath;
	row.artifactHash = artifact.artifactHash;
	row.acceptedCardCount = artifact.cards;
	row.lineageManifestPath = artifact.lineageManifestPath;
	row.lineageManifestSha256 = artifact.lineageManifestSha256;
	row.note = note;
	delete row.error;
}

function assertStandardStageClosed() {
	const planner = runJson([process.execPath, 'scripts/plan-study-card-descendant-coverage.mjs']);
	const remaining = planner.plans.reduce((sum, plan) => sum + plan.uncoveredComponentCount, 0);
	if (remaining !== 0) {
		throw new Error(
			`All 26 physical outputs exist but the descendant planner still reports ${remaining} uncovered targets; refusing Literature transition.`
		);
	}
}

async function runConcurrent(items, worker) {
	let next = 0;
	async function loop() {
		while (next < items.length) {
			const item = items[next];
			next += 1;
			await worker(item);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(args.maxConcurrent, items.length) }, () => loop())
	);
}

function runLogged(command, logPath) {
	return new Promise((resolve, reject) => {
		mkdirSync(path.dirname(logPath), { recursive: true });
		const output = createWriteStream(logPath, { flags: 'a' });
		const executable = command[0] === 'node' ? process.execPath : command[0];
		const child = spawn(executable, command.slice(1), {
			cwd: rootDir,
			env: process.env,
			stdio: ['ignore', 'pipe', 'pipe']
		});
		child.stdout.pipe(output, { end: false });
		child.stderr.pipe(output, { end: false });
		child.on('error', (error) => {
			output.end();
			reject(error);
		});
		child.on('close', (code) => {
			output.end();
			resolve(code ?? 1);
		});
	});
}

function runJson(command) {
	const result = spawnSync(command[0], command.slice(1), {
		cwd: rootDir,
		encoding: 'utf8',
		maxBuffer: 128 * 1024 * 1024
	});
	if (result.status !== 0) {
		throw new Error(
			`${command.join(' ')} failed during no-model preflight: ${result.stderr || result.stdout}`
		);
	}
	return JSON.parse(result.stdout);
}

function stateCounts(stateInput) {
	return {
		standardAccepted: stateInput.standard.jobs.filter((job) => job.status === 'accepted').length,
		standardFailed: stateInput.standard.jobs.filter((job) => job.status === 'failed').length,
		standardQueued: stateInput.standard.jobs.filter((job) => job.status === 'queued').length,
		literatureAccepted: stateInput.literature.jobs.filter((job) => job.status === 'accepted')
			.length,
		literatureFailed: stateInput.literature.jobs.filter((job) => job.status === 'failed').length,
		literatureQueued: stateInput.literature.jobs.filter((job) => job.status === 'queued').length
	};
}

function writeState(stateInput) {
	stateInput.counts = stateCounts(stateInput);
	writePreparedStudyCardStateAtomically(statePath, stateInput);
}

function fileLock(filePath) {
	return { path: relative(filePath), sha256: sha256(readFileSync(filePath)) };
}

function artifactPath(releaseId) {
	return path.join(rootDir, 'data/study-cards/releases', releaseId, 'accepted-study-cards.json');
}

function parseArgs(argv) {
	const integerValue = (name, fallback) => {
		const raw =
			argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ??
			String(fallback);
		const parsed = Number(raw);
		if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2) {
			throw new Error(`--${name} must be 1 or 2.`);
		}
		return parsed;
	};
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		execute: argv.includes('--execute'),
		prepareNewLock: argv.includes('--prepare-new-lock'),
		maxConcurrent: integerValue('max-concurrent', 2)
	};
}

function usage() {
	return `Usage:
node scripts/run-prepared-study-card-completion.mjs [--prepare-new-lock]
  [--execute] [--max-concurrent=2]

The default performs a no-model dry run and hash-locks the exact prepared
26-physical-batch / 438-target queue plus the 13 Literature shards. --execute
runs no more than two model-producing processes concurrently, resumes or
preserves incomplete work, reuses accepted immutable artifacts, launches the
two Combined Physics fresh-review outputs once as one atomic execution group,
and starts Literature only after all standard descendant targets are covered.
--prepare-new-lock replaces a drifted lock only when no execution state exists.`;
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function relative(filePath) {
	return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function slug(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
