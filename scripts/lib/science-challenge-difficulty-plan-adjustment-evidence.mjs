import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync
} from 'node:fs';
import path from 'node:path';

import { readScienceChallengeDirectMultipartEvidence } from './science-challenge-authoring-parts.mjs';
import {
	isScienceChallengeDirectMultipartRunSummary,
	validateScienceChallengeDirectMultipartRunPolicy
} from './science-challenge-authoring-run-policy.mjs';
import { SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON } from './science-challenge-authoring-transport.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_DISPOSITION,
	buildScienceChallengeDifficultyPlanAdjustment,
	buildScienceChallengeDifficultyPlanAdjustmentSet
} from './science-challenge-difficulty-plan-adjustment.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	challengeBatchOutputSchema,
	normalizeGeneratedChallengeBatch,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';
import { replayScienceChallengeMultipartDifficultyAttempt } from './science-challenge-multipart-plan-salvage-evidence.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
	inspectVerificationRepairAttempts,
	invalidatedVerificationRepairAttempts,
	readVerificationRepairCohortState,
	scienceChallengeVerificationRepairRunId,
	writeImmutableRepairJson
} from './science-challenge-verification-repair-transaction.mjs';
import {
	inspectVerificationRepairExecutionAttempts,
	requireMatchingVerificationRepairAttemptLedgers,
	scienceChallengeVerificationRepairObjectiveIdentity,
	verificationRepairExecutionLedgerRoot
} from './science-challenge-verification-repair-lineage.mjs';

export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_EVIDENCE_SCHEMA =
	'science-challenge-verifier-directed-difficulty-plan-adjustment-evidence/v1';

const HASH = /^[a-f0-9]{64}$/u;

export function deriveScienceChallengeDifficultyPlanAdjustments({
	plan,
	shardId,
	terminalCandidate
}) {
	if (
		!isRecord(plan) ||
		!Array.isArray(plan.rows) ||
		!nonEmpty(shardId) ||
		!isRecord(terminalCandidate) ||
		!Array.isArray(terminalCandidate.challenges)
	) {
		return [];
	}
	const terminalById = new Map(
		terminalCandidate.challenges.map((entry) => [entry?.definition?.id, entry])
	);
	return plan.rows
		.filter((row) => row?.shard === shardId)
		.map((row) => {
			const terminalDifficulty = terminalById.get(row.id)?.definition?.difficulty;
			return terminalDifficulty === undefined || terminalDifficulty === row.difficulty
				? null
				: {
						challengeId: row.id,
						field: 'definition.difficulty',
						from: row.difficulty,
						to: terminalDifficulty
					};
		})
		.filter(Boolean);
}

export function scienceChallengeDifficultyPlanAdjustmentDirectory({ shardDir, repairSha256 }) {
	requireHash(repairSha256, 'verification-repair SHA-256');
	return path.join(
		path.resolve(shardDir),
		`verification-repair-${scienceChallengeVerificationRepairRunId(
			repairSha256
		)}-difficulty-plan-adjustment`
	);
}

export function stageScienceChallengeDifficultyPlanAdjustment(options) {
	const precondition = inspectPreconditions(options);
	if (precondition.status !== 'passed') return precondition;
	if (options.resume !== true) {
		return failed('Difficulty-plan adjustment is available only during an explicit --resume run.');
	}
	const directory = scienceChallengeDifficultyPlanAdjustmentDirectory(options);
	const artifactPaths = difficultyAdjustmentArtifactPaths(directory);
	const present = Object.values(artifactPaths).filter((filePath) => existsSync(filePath));
	if (present.length > 0) {
		if (present.length !== Object.keys(artifactPaths).length) {
			return failed('Difficulty-plan adjustment evidence is only partially present.');
		}
		return readScienceChallengeDifficultyPlanAdjustment(options);
	}
	const prepared = prepareEvidence(options, precondition);
	if (prepared.status !== 'passed') return prepared;
	publishPreparedEvidenceAtomically(directory, prepared);
	return readScienceChallengeDifficultyPlanAdjustment(options);
}

export function inspectScienceChallengeDifficultyPlanAdjustment(options) {
	const precondition = inspectPreconditions(options);
	if (precondition.status !== 'passed') return precondition;
	if (options.resume !== true) {
		return failed('Difficulty-plan adjustment is available only during an explicit --resume run.');
	}
	const directory = scienceChallengeDifficultyPlanAdjustmentDirectory(options);
	const artifactPaths = difficultyAdjustmentArtifactPaths(directory);
	const present = Object.values(artifactPaths).filter((filePath) => existsSync(filePath));
	if (present.length > 0) {
		if (present.length !== Object.keys(artifactPaths).length) {
			return failed('Difficulty-plan adjustment evidence is only partially present.');
		}
		const replay = readScienceChallengeDifficultyPlanAdjustment(options);
		return replay.status === 'passed'
			? { ...replay, action: 'reuse-staged-difficulty-plan-adjustment' }
			: replay;
	}
	const prepared = prepareEvidence(options, precondition);
	if (prepared.status !== 'passed') return prepared;
	return {
		status: 'passed',
		issues: [],
		action: 'stage-review-pending-difficulty-plan-adjustment',
		sourceAttempt: prepared.manifest.sourceAttempt.attempt,
		artifactPaths,
		manifest: prepared.manifest,
		candidate: prepared.candidate,
		validation: prepared.validation,
		effectivePlan: prepared.effectivePlan
	};
}

export function readScienceChallengeDifficultyPlanAdjustment(options) {
	const precondition = inspectPreconditions(options);
	if (precondition.status !== 'passed') return precondition;
	const artifactPaths = difficultyAdjustmentArtifactPaths(
		scienceChallengeDifficultyPlanAdjustmentDirectory(options)
	);
	const missing = Object.entries(artifactPaths)
		.filter(([, filePath]) => !existsSync(filePath))
		.map(([name]) => name);
	if (missing.length) {
		return failed(`Difficulty-plan adjustment is missing ${missing.join(', ')} evidence.`);
	}
	const prepared = prepareEvidence(options, precondition);
	if (prepared.status !== 'passed') return prepared;
	for (const [field, value] of [
		['manifest', prepared.manifest],
		['candidate', prepared.candidate],
		['validation', prepared.validation],
		['effectivePlan', prepared.effectivePlan],
		['provenance', prepared.provenance],
		['priorCandidate', prepared.priorCandidate],
		['priorValidation', prepared.priorValidation],
		['firstReviewSummary', prepared.firstReviewSummary],
		['firstReviewResult', prepared.firstReviewResult],
		['firstAssignment', prepared.firstAssignment],
		['firstDispatchLedger', prepared.firstDispatchLedger],
		['priorBaseBatchValidation', prepared.priorBaseBatchValidation],
		['baseBatchValidation', prepared.baseBatchValidation],
		['effectiveBatchValidation', prepared.effectiveBatchValidation],
		['collectionValidation', prepared.collectionValidation],
		['repairValidation', prepared.repairValidation]
	]) {
		if (!readFileSync(artifactPaths[field]).equals(stableJsonBytes(value))) {
			return failed(`Difficulty-plan adjustment ${field} bytes differ from deterministic replay.`);
		}
	}
	return {
		status: 'passed',
		issues: [],
		action: 'reused',
		artifactPaths,
		...prepared,
		lineage: buildLineage({ artifactPaths, prepared, precondition })
	};
}

function inspectPreconditions(options) {
	const issues = [];
	if (!isRecord(options)) return failed('Difficulty-plan adjustment options must be an object.');
	for (const [field, label] of [
		['shardId', 'shardId'],
		['shardDir', 'shard directory'],
		['outputRoot', 'output root'],
		['workspaceRoot', 'workspace root']
	]) {
		if (!nonEmpty(options[field])) {
			issues.push(`Difficulty-plan adjustment requires ${label}.`);
		}
	}
	for (const field of ['repairSha256', 'expectedPlanSha256']) {
		if (!HASH.test(String(options[field] ?? ''))) {
			issues.push(`Difficulty-plan adjustment ${field} is invalid.`);
		}
	}
	if (!isRecord(options.plan) || canonicalHash(options.plan) !== options.expectedPlanSha256) {
		issues.push('Difficulty-plan adjustment plan differs from expectedPlanSha256.');
	}
	if (
		!isRecord(options.firstReviewSummary) ||
		canonicalHash(options.firstReviewSummary) !== options.repairSha256
	) {
		issues.push('Difficulty-plan adjustment first review differs from repairSha256.');
	}
	for (const field of [
		'priorCandidate',
		'priorValidation',
		'curriculumEvidence',
		'firstReviewResult',
		'firstAssignment',
		'dispatchLedger',
		'expectedExecutionIdentity'
	]) {
		if (!isRecord(options[field])) {
			issues.push(`Difficulty-plan adjustment requires ${field}.`);
		}
	}
	if (!Array.isArray(options.inputs) || !Array.isArray(options.rows)) {
		issues.push('Difficulty-plan adjustment requires exact authoring rows and inputs.');
	} else {
		const shardRows = options.plan?.rows?.filter((row) => row?.shard === options.shardId) ?? [];
		if (
			canonicalHash(options.rows) !== canonicalHash(shardRows) ||
			options.inputs.length !== shardRows.length ||
			options.inputs.some(
				(input, index) => !authoringInputBindsPlanRow(input, shardRows[index], options.plan, index)
			)
		) {
			issues.push(
				'Difficulty-plan adjustment authoring rows or inputs differ from the frozen shard plan.'
			);
		}
	}
	for (const field of ['reconstructSourceEvidence', 'validateBatchCandidate']) {
		if (typeof options[field] !== 'function') {
			issues.push(`Difficulty-plan adjustment requires ${field}.`);
		}
	}
	if (
		options.expectedExecutionIdentity?.verificationSha256 !== options.repairSha256 ||
		options.expectedExecutionIdentity?.planSha256 !== options.expectedPlanSha256 ||
		options.expectedExecutionIdentity?.priorCandidateSetSha256 !==
			options.firstReviewSummary?.candidateSetSha256
	) {
		issues.push(
			'Difficulty-plan adjustment execution identity targets another plan, first review, or prior candidate set.'
		);
	}
	if (
		options.inputSha256 !==
		canonicalHash({
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			inputs: options.inputs,
			priorCandidateSha256: canonicalHash(options.priorCandidate),
			verificationSummarySha256: options.repairSha256
		})
	) {
		issues.push('Difficulty-plan adjustment inputSha256 does not bind the repair envelope.');
	}
	if (issues.length) return failed(issues);

	try {
		const shardDir = path.resolve(options.shardDir);
		const outputRoot = path.resolve(options.outputRoot);
		if (shardDir !== path.join(outputRoot, 'shards', options.shardId)) {
			return failed(
				'Difficulty-plan adjustment shard directory is outside the claimed output root.'
			);
		}
		const competingRecoveryDirectories = readdirSync(shardDir, { withFileTypes: true })
			.filter(
					(entry) =>
						entry.isDirectory() &&
						(/verification-repair-[a-f0-9]{12}-multipart-plan-salvage$/u.test(entry.name) ||
							/verification-repair-[a-f0-9]{12}-descendant-remap$/u.test(entry.name))
			)
			.map((entry) => entry.name);
			if (competingRecoveryDirectories.length > 0) {
				return failed(
					'Difficulty-plan adjustment cannot coexist with salvage or descendant-remap lineage.'
				);
		}
		const localLedger = inspectVerificationRepairAttempts({
			shardDir,
			repairSha256: options.repairSha256,
			maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
		});
		const executionLedgerRoot = verificationRepairExecutionLedgerRoot(
			options.workspaceRoot,
			options.expectedExecutionIdentity.objectiveId
		);
		const globalLedger = inspectVerificationRepairExecutionAttempts({
			ledgerRoot: executionLedgerRoot,
			identity: options.expectedExecutionIdentity,
			shardId: options.shardId
		});
		requireMatchingVerificationRepairAttemptLedgers({
			localAttempts: localLedger.attempts,
			globalAttempts: globalLedger.attempts,
			shardId: options.shardId,
			outputRoot
		});
		if (
			!localLedger.exhausted ||
			!globalLedger.exhausted ||
			localLedger.attempts.length !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
			globalLedger.attempts.length !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
		) {
			return failed(
				'Difficulty-plan adjustment requires matching exhausted local/global four-attempt ledgers.'
			);
		}
		const identityPath = path.join(executionLedgerRoot, 'objective.json');
		if (
			!existsSync(identityPath) ||
			canonicalHash(readJson(identityPath)) !==
				canonicalHash(
					scienceChallengeVerificationRepairObjectiveIdentity(options.expectedExecutionIdentity)
				)
		) {
			return failed('Difficulty-plan adjustment global execution identity is missing or stale.');
		}
		const cohortState = readVerificationRepairCohortState({
			outputRoot,
			repairSha256: options.repairSha256
		}).state;
		const invalidatedAttempts = invalidatedVerificationRepairAttempts(cohortState, options.shardId);
		if (
			options.invalidatedAttempts !== undefined &&
			(!(options.invalidatedAttempts instanceof Set) ||
				canonicalHash([...options.invalidatedAttempts].sort(compareNumber)) !==
					canonicalHash([...invalidatedAttempts].sort(compareNumber)))
		) {
			return failed(
				'Difficulty-plan adjustment caller invalidations differ from persisted cohort state.'
			);
		}
		if (invalidatedAttempts.has(SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS)) {
			return failed('Terminal attempt-04 was invalidated and cannot be selected.');
		}
		const repairEvidence = exactRepairEvidence(options, shardDir);
		if (repairEvidence.status !== 'passed') return repairEvidence;
		return {
			status: 'passed',
			issues: [],
			shardDir,
			outputRoot,
			localLedger,
			globalLedger,
			executionLedgerRoot,
			identityPath,
			cohortState,
			invalidatedAttempts,
			recoveryBinding,
			recoveryManifest,
			recoveryManifestPath,
			repairEvidence
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

function prepareEvidence(options, precondition) {
	const attempts = [];
	for (const record of precondition.localLedger.attempts) {
		let replay = replaySourceAttempt({ options, precondition, record });
		if (replay.status !== 'passed') {
			const helperReplay = replayScienceChallengeMultipartDifficultyAttempt({
				...options,
				precondition,
				record
			});
			if (helperReplay.status === 'passed') {
				replay = helperReplay;
			} else if (record.attempt === SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS) {
				replay = helperReplay;
			} else if (record.attempt < SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS) {
				const runSummaryPath = path.join(record.path, 'run-summary.json');
				const runSummary = existsSync(runSummaryPath) ? readJson(runSummaryPath) : null;
				if (runSummary?.status === 'failed') {
					replay = replayFailedBudgetAttempt({
						options,
						precondition,
						record,
						repairRunId: scienceChallengeVerificationRepairRunId(options.repairSha256),
						runSummary
					});
				}
			}
		}
		if (replay.status !== 'passed') return replay;
		attempts.push({
			...replay.attempt,
			invalidated: precondition.invalidatedAttempts.has(record.attempt)
		});
	}
	const buildInput = {
		plan: options.plan,
		shardId: options.shardId,
		repairSha256: options.repairSha256,
		curriculumEvidenceSha256: canonicalHash(options.curriculumEvidence),
		priorCandidate: options.priorCandidate,
		priorValidation: options.priorValidation,
		firstReviewSummary: options.firstReviewSummary,
		firstReviewResult: options.firstReviewResult,
		firstAssignment: options.firstAssignment,
		dispatchLedger: options.dispatchLedger,
		attempts,
		validateBatchCandidate: options.validateBatchCandidate
	};
	const requestedAdjustments =
		options.requestedAdjustments ??
		deriveScienceChallengeDifficultyPlanAdjustments({
			plan: options.plan,
			shardId: options.shardId,
			terminalCandidate: attempts.find(
				(attempt) => attempt.attempt === SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
			)?.candidate
		});
	const built =
		Array.isArray(requestedAdjustments) && requestedAdjustments.length > 1
			? buildScienceChallengeDifficultyPlanAdjustmentSet({
					...buildInput,
					objectiveId: options.expectedExecutionIdentity.objectiveId,
					executionId: options.expectedExecutionIdentity.executionId,
					requestedAdjustments
				})
			: buildScienceChallengeDifficultyPlanAdjustment(buildInput);
	if (built.status !== 'passed') return built;
	const evidenceCore = {
		schemaVersion: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_EVIDENCE_SCHEMA,
		recovery: built.manifest,
		recoverySha256: canonicalHash(built.manifest),
		executionId: options.expectedExecutionIdentity.executionId,
		executionIdentity: options.expectedExecutionIdentity,
		executionIdentitySha256: canonicalHash(options.expectedExecutionIdentity),
		repairEvidence: precondition.repairEvidence.binding,
		globalObjectiveSha256: canonicalHash(readJson(precondition.identityPath)),
		globalObjectiveFileSha256: sha256(readFileSync(precondition.identityPath)),
		recoveryManifestSha256: canonicalHash(precondition.recoveryManifest),
		recoveryBindingSha256: canonicalHash(precondition.recoveryBinding.binding)
	};
	const provenance = {
		...evidenceCore,
		provenanceCoreSha256: canonicalHash(evidenceCore)
	};
	return {
		status: 'passed',
		issues: [],
		manifest: built.manifest,
		candidate: built.candidate,
		validation: built.validation,
		effectivePlan: built.effectivePlan,
		effectivePlanRow: built.effectivePlanRow,
		adjustment: built.adjustment,
		adjustments: built.adjustments,
		canonicalVerifier: built.canonicalVerifier,
		provenance,
		priorCandidate: options.priorCandidate,
		priorValidation: options.priorValidation,
		firstReviewSummary: options.firstReviewSummary,
		firstReviewResult: options.firstReviewResult,
		firstAssignment: options.firstAssignment,
		firstDispatchLedger: options.dispatchLedger,
		priorBaseBatchValidation: built.priorBaseBatchValidation,
		baseBatchValidation: built.baseBatchValidation,
		effectiveBatchValidation: built.effectiveBatchValidation,
		collectionValidation: built.collectionValidation,
		repairValidation: built.repairValidation,
		attempts
	};
}

function replaySourceAttempt({ options, precondition, record }) {
	const repairRunId = scienceChallengeVerificationRepairRunId(options.repairSha256);
	const promptPath = path.join(
		precondition.shardDir,
		`verification-repair-${repairRunId}-prompt-attempt-${record.attempt}.txt`
	);
	const paths = {
		runSummary: path.join(record.path, 'run-summary.json'),
		validation: path.join(record.path, 'validation.json'),
		candidate: path.join(record.path, 'candidate.json'),
		eventLog: path.join(record.path, 'events.jsonl'),
		lastMessage: path.join(record.path, 'last-message.json'),
		prompt: promptPath
	};
	const missing = Object.entries(paths)
		.filter(([, filePath]) => !existsSync(filePath))
		.map(([field]) => field);
	if (missing.length) {
		return failed(`Source attempt ${record.attempt} is missing ${missing.join(', ')} evidence.`);
	}
	try {
		const runSummary = readJson(paths.runSummary);
		const sourceValidation = readJson(paths.validation);
		if (
			!isScienceChallengeDirectMultipartRunSummary(runSummary) ||
			runSummary.status !== 'passed'
		) {
			return failed(`Source attempt ${record.attempt} is not a passed multipart model run.`);
		}
		if (sourceValidation?.status !== 'failed') {
			return failed(
				'Difficulty-plan adjustment requires every source attempt to retain failed validation status.'
			);
		}
		const promptBytes = readFileSync(paths.prompt);
		const reconstruction = options.reconstructSourceEvidence({
			attempt: record.attempt,
			attemptDirectory: record.directory,
			attemptDir: record.path,
			summary: runSummary,
			sourceValidation
		});
		if (
			!promptBytes.equals(Buffer.from(reconstruction?.expectedPromptBytes ?? [])) ||
			!Array.isArray(reconstruction?.expectedPartPrompts)
		) {
			return failed(`Source attempt ${record.attempt} prompt reconstruction is missing or stale.`);
		}
		const multipartEvidence = readScienceChallengeDirectMultipartEvidence({
			attemptDir: record.path,
			summary: runSummary
		});
		const lastMessageBytes = readFileSync(paths.lastMessage);
		const rawCandidate = JSON.parse(lastMessageBytes.toString('utf8'));
		const reconstructedCandidate = normalizeGeneratedChallengeBatch(rawCandidate);
		const candidate = readJson(paths.candidate);
		if (canonicalHash(candidate) !== canonicalHash(reconstructedCandidate)) {
			return failed(
				`Source attempt ${record.attempt} candidate differs from its normalized raw output.`
			);
		}
		const runPolicy = validateScienceChallengeDirectMultipartRunPolicy({
			summary: runSummary,
			eventLogBytes: readFileSync(paths.eventLog),
			lastMessageBytes,
			promptBytes,
			multipartEvidence,
			expectedResponseJsonSchema: challengeBatchOutputSchema(options.inputs.length),
			expectedInputs: options.inputs,
			expectedInputSha256: options.inputSha256,
			expectedPartPrompts: reconstruction.expectedPartPrompts
		});
		const exactSourceBinding =
			sourceValidation.status === 'failed' &&
			sourceValidation.inputSha256 === options.inputSha256 &&
			sourceValidation.verificationRepairSha256 === options.repairSha256 &&
			sourceValidation.priorCandidateSha256 === canonicalHash(options.priorCandidate) &&
			sourceValidation.runSummarySha256 === canonicalHash(runSummary) &&
			sourceValidation.candidateSha256 === canonicalHash(candidate) &&
			sourceValidation.rawCandidateSha256 === canonicalHash(rawCandidate) &&
			sourceValidation.promptSha256 === sha256(promptBytes) &&
			sourceValidation.normalizationVersion === SCIENCE_CHALLENGE_NORMALIZATION_VERSION &&
			sourceValidation.promptVersion === SCIENCE_CHALLENGE_PROMPT_VERSION &&
			sourceValidation.transport === runSummary.transport &&
			sourceValidation.transportVersion === runSummary.transportVersion &&
			sourceValidation.responseMode === runSummary.responseMode &&
			sourceValidation.providerSchemaApplied === runSummary.providerSchemaApplied &&
			sourceValidation.provider === runSummary.provider &&
			sourceValidation.model === runSummary.model &&
			sourceValidation.thinkingLevel === runSummary.thinkingLevel &&
			sourceValidation.directPartSize === runSummary.partSize &&
			sourceValidation.transportError === null &&
			Array.isArray(sourceValidation.verificationRepairCohortIssues) &&
			runSummary.inputSha256 === options.inputSha256;
		if (!exactSourceBinding) {
			return failed(
				`Source attempt ${record.attempt} validation is not bound to the immutable multipart output.`
			);
		}
		const summaryResponseMode =
			runSummary.responseMode ?? SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON;
		for (const [field, actual] of [
			['model', runSummary.model],
			['transport', runSummary.transport],
			['responseMode', summaryResponseMode],
			['thinkingLevel', runSummary.thinkingLevel],
			['directPartSize', runSummary.partSize]
		]) {
			if (options.expectedExecutionIdentity[field] !== actual) {
				return failed(
					`Source attempt ${record.attempt} ${field} differs from the execution identity.`
				);
			}
		}
		return {
			status: 'passed',
			issues: [],
			attempt: {
				attempt: record.attempt,
				status: 'failed',
				candidate,
				rawCandidateSha256: canonicalHash(rawCandidate),
				runSummary,
				sourceValidation,
				runPolicy,
				fileBindings: {
					attemptDirectory: record.directory,
					runSummary: jsonBinding(paths.runSummary, precondition.shardDir),
					validation: jsonBinding(paths.validation, precondition.shardDir),
					candidate: jsonBinding(paths.candidate, precondition.shardDir),
					eventLog: byteBinding(paths.eventLog, precondition.shardDir),
					lastMessage: byteBinding(paths.lastMessage, precondition.shardDir),
					prompt: byteBinding(paths.prompt, precondition.shardDir),
					parts: multipartEvidence.parts.map((part) => ({
						partId: part.record.partId,
						runSummarySha256: canonicalHash(part.summary),
						lastMessageSha256: sha256(part.lastMessageBytes),
						rawCandidateSha256: canonicalHash(JSON.parse(part.lastMessageBytes.toString('utf8')))
					}))
				}
			}
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

function replayFailedBudgetAttempt({ options, precondition, record, repairRunId, runSummary }) {
	const paths = {
		runSummary: path.join(record.path, 'run-summary.json'),
		validation: path.join(record.path, 'validation.json'),
		eventLog: path.join(record.path, 'events.jsonl'),
		lastMessage: path.join(record.path, 'last-message.json'),
		prompt: path.join(
			precondition.shardDir,
			`verification-repair-${repairRunId}-prompt-attempt-${record.attempt}.txt`
		)
	};
	const missing = Object.entries(paths)
		.filter(([, filePath]) => !existsSync(filePath))
		.map(([field]) => field);
	if (missing.length) {
		return failed(
			`Source attempt ${record.attempt} failed before a candidate and is missing ${missing.join(', ')} evidence.`
		);
	}
	try {
		const sourceValidation = readJson(paths.validation);
		const promptBytes = readFileSync(paths.prompt);
		const eventLogBytes = readFileSync(paths.eventLog);
		const lastMessageBytes = readFileSync(paths.lastMessage);
		const reconstruction = options.reconstructSourceEvidence({
			attempt: record.attempt,
			attemptDirectory: record.directory,
			attemptDir: record.path,
			summary: runSummary,
			sourceValidation
		});
		const multipartEvidence = readScienceChallengeDirectMultipartEvidence({
			attemptDir: record.path,
			summary: runSummary
		});
		const expectedPartPrompts = reconstruction?.expectedPartPrompts;
		const exactPartBindings = multipartEvidence.parts.every(({ record: part, summary }) => {
			const evidence = multipartEvidence.parts.find(
				(candidate) => candidate.record.partId === part.partId
			);
			return (
				part.runSummarySha256 === canonicalHash(summary) &&
				part.promptSha256 === sha256(evidence.promptBytes) &&
				part.requestSha256 === sha256(evidence.requestBytes) &&
				part.eventLogSha256 === sha256(evidence.eventLogBytes) &&
				part.rawOutputSha256 === sha256(evidence.lastMessageBytes) &&
				part.thoughtsSha256 === sha256(evidence.thoughtsBytes) &&
				part.resultMetadataSha256 === sha256(evidence.resultMetadataBytes)
			);
		});
		const exactSourceBinding =
			isScienceChallengeDirectMultipartRunSummary(runSummary) &&
			runSummary.status === 'failed' &&
			runSummary.inputSha256 === options.inputSha256 &&
			runSummary.orchestrationPromptSha256 === sha256(promptBytes) &&
			runSummary.eventLogSha256 === sha256(eventLogBytes) &&
			runSummary.lastMessageFileSha256 === sha256(lastMessageBytes) &&
			runSummary.partsSha256 === canonicalHash(runSummary.parts) &&
			runSummary.attemptedPartCount === runSummary.parts.length &&
			runSummary.completedPartCount < runSummary.expectedPartCount &&
			runSummary.expectedPartCount === expectedPartPrompts?.length &&
			canonicalHash(runSummary.rowIds) === canonicalHash(options.rows.map((row) => row.id)) &&
			promptBytes.equals(Buffer.from(reconstruction?.expectedPromptBytes ?? [])) &&
			exactPartBindings &&
			sourceValidation?.status === 'failed' &&
			sourceValidation.inputSha256 === options.inputSha256 &&
			sourceValidation.verificationRepairSha256 === options.repairSha256 &&
			sourceValidation.priorCandidateSha256 === canonicalHash(options.priorCandidate) &&
			sourceValidation.runSummarySha256 === canonicalHash(runSummary) &&
			sourceValidation.candidateSha256 === null &&
			sourceValidation.rawCandidateSha256 === null &&
			sourceValidation.promptSha256 === sha256(promptBytes) &&
			sourceValidation.normalizationVersion === SCIENCE_CHALLENGE_NORMALIZATION_VERSION &&
			sourceValidation.promptVersion === SCIENCE_CHALLENGE_PROMPT_VERSION &&
			sourceValidation.transport === runSummary.transport &&
			sourceValidation.provider === runSummary.provider &&
			sourceValidation.model === runSummary.model &&
			sourceValidation.thinkingLevel === runSummary.thinkingLevel &&
			nonEmpty(sourceValidation.transportError) &&
			Array.isArray(sourceValidation.verificationRepairCohortIssues);
		for (const [field, actual] of [
			['model', runSummary.model],
			['transport', runSummary.transport],
			[
				'responseMode',
				runSummary.responseMode ?? SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
			],
			['thinkingLevel', runSummary.thinkingLevel],
			['directPartSize', runSummary.partSize]
		]) {
			if (options.expectedExecutionIdentity[field] !== actual) {
				return failed(
					`Source attempt ${record.attempt} ${field} differs from the execution identity.`
				);
			}
		}
		if (!exactSourceBinding) {
			return failed(
				`Source attempt ${record.attempt} failed before a candidate but its immutable budget evidence is stale.`
			);
		}
		return {
			status: 'passed',
			issues: [],
			attempt: {
				attempt: record.attempt,
				status: 'failed',
				sourceKind: 'failed-budget-record',
				runSummary,
				sourceValidation,
				fileBindings: {
					attemptDirectory: record.directory,
					runSummary: jsonBinding(paths.runSummary, precondition.shardDir),
					validation: jsonBinding(paths.validation, precondition.shardDir),
					eventLog: byteBinding(paths.eventLog, precondition.shardDir),
					lastMessage: byteBinding(paths.lastMessage, precondition.shardDir),
					prompt: byteBinding(paths.prompt, precondition.shardDir),
					parts: multipartEvidence.parts.map((part) => ({
						partId: part.record.partId,
						status: part.record.status,
						runSummarySha256: canonicalHash(part.summary),
						lastMessageSha256: sha256(part.lastMessageBytes),
						rawCandidateSha256: part.record.rawCandidateSha256
					}))
				}
			}
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

function exactRepairEvidence(options, shardDir) {
	const repairDir = path.join(
		shardDir,
		`verification-repair-${scienceChallengeVerificationRepairRunId(options.repairSha256)}`
	);
	const files = {
		verificationSummary: path.join(repairDir, 'verification-summary.json'),
		priorCandidate: path.join(repairDir, 'prior-candidate.json'),
		priorValidation: path.join(repairDir, 'prior-validation.json')
	};
	const missing = Object.entries(files)
		.filter(([, filePath]) => !existsSync(filePath))
		.map(([field]) => field);
	if (missing.length) {
		return failed(`Difficulty-plan adjustment is missing ${missing.join(', ')} repair snapshots.`);
	}
	try {
		if (
			canonicalHash(readJson(files.verificationSummary)) !== options.repairSha256 ||
			canonicalHash(readJson(files.priorCandidate)) !== canonicalHash(options.priorCandidate) ||
			canonicalHash(readJson(files.priorValidation)) !== canonicalHash(options.priorValidation)
		) {
			return failed(
				'Difficulty-plan adjustment repair snapshots differ from exact current inputs.'
			);
		}
		return {
			status: 'passed',
			issues: [],
			binding: Object.fromEntries(
				Object.entries(files).map(([field, filePath]) => [field, jsonBinding(filePath, shardDir)])
			)
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

function buildLineage({ artifactPaths, prepared, precondition }) {
	const isAdjustmentSet =
		prepared.manifest.disposition === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_DISPOSITION;
	return {
		schemaVersion: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_EVIDENCE_SCHEMA,
		disposition: prepared.manifest.disposition,
		manifestPath: artifactPaths.manifest,
		manifestSha256: canonicalHash(prepared.manifest),
		manifestFileSha256: sha256(readFileSync(artifactPaths.manifest)),
		candidatePath: artifactPaths.candidate,
		candidateSha256: canonicalHash(prepared.candidate),
		candidateFileSha256: sha256(readFileSync(artifactPaths.candidate)),
		validationPath: artifactPaths.validation,
		validationSha256: canonicalHash(prepared.validation),
		validationFileSha256: sha256(readFileSync(artifactPaths.validation)),
		effectivePlanPath: artifactPaths.effectivePlan,
		effectivePlanSha256: canonicalHash(prepared.effectivePlan),
		effectivePlanFileSha256: sha256(readFileSync(artifactPaths.effectivePlan)),
		provenancePath: artifactPaths.provenance,
		provenanceSha256: canonicalHash(prepared.provenance),
		provenanceFileSha256: sha256(readFileSync(artifactPaths.provenance)),
		priorCandidatePath: artifactPaths.priorCandidate,
		priorCandidateSha256: canonicalHash(prepared.priorCandidate),
		priorValidationPath: artifactPaths.priorValidation,
		priorValidationSha256: canonicalHash(prepared.priorValidation),
		firstReviewSummaryPath: artifactPaths.firstReviewSummary,
		firstReviewSummarySha256: canonicalHash(prepared.firstReviewSummary),
		firstReviewResultPath: artifactPaths.firstReviewResult,
		firstReviewResultSha256: canonicalHash(prepared.firstReviewResult),
		firstAssignmentPath: artifactPaths.firstAssignment,
		firstAssignmentSha256: canonicalHash(prepared.firstAssignment),
		firstDispatchLedgerPath: artifactPaths.firstDispatchLedger,
		firstDispatchLedgerSha256: canonicalHash(prepared.firstDispatchLedger),
		priorBaseBatchValidationPath: artifactPaths.priorBaseBatchValidation,
		priorBaseBatchValidationSha256: canonicalHash(prepared.priorBaseBatchValidation),
		baseBatchValidationPath: artifactPaths.baseBatchValidation,
		baseBatchValidationSha256: canonicalHash(prepared.baseBatchValidation),
		effectiveBatchValidationPath: artifactPaths.effectiveBatchValidation,
		effectiveBatchValidationSha256: canonicalHash(prepared.effectiveBatchValidation),
		collectionValidationPath: artifactPaths.collectionValidation,
		collectionValidationSha256: canonicalHash(prepared.collectionValidation),
		repairValidationPath: artifactPaths.repairValidation,
		repairValidationSha256: canonicalHash(prepared.repairValidation),
		basePlanSha256: prepared.manifest.base.planSha256,
		...(isAdjustmentSet
			? {
					adjustmentCount: prepared.manifest.adjustmentCount,
					adjustmentSetSha256: prepared.manifest.adjustmentSetSha256
				}
			: { adjustmentSha256: prepared.manifest.adjustmentSha256 }),
		sourceAttempt: prepared.manifest.sourceAttempt,
		sourceAttemptStatus: 'failed',
		canonicalVerifier: prepared.canonicalVerifier,
		execution: {
			executionId: prepared.provenance.executionId,
			identity: prepared.provenance.executionIdentity,
			objectivePath: precondition.identityPath,
			objectiveSha256: canonicalHash(readJson(precondition.identityPath)),
			objectiveFileSha256: sha256(readFileSync(precondition.identityPath)),
			claims: precondition.globalLedger.attempts.map((record) => ({
				attempt: record.attempt,
				path: path.join(record.path, 'claim.json'),
				sha256: canonicalHash(record.claim),
				fileSha256: sha256(readFileSync(path.join(record.path, 'claim.json')))
			}))
		}
	};
}

function difficultyAdjustmentArtifactPaths(directory) {
	return {
		manifest: path.join(directory, 'manifest.json'),
		candidate: path.join(directory, 'candidate.json'),
		validation: path.join(directory, 'validation.json'),
		effectivePlan: path.join(directory, 'effective-plan.json'),
		provenance: path.join(directory, 'provenance.json'),
		priorCandidate: path.join(directory, 'prior-candidate.json'),
		priorValidation: path.join(directory, 'prior-validation.json'),
		firstReviewSummary: path.join(directory, 'first-review-summary.json'),
		firstReviewResult: path.join(directory, 'first-review-result.json'),
		firstAssignment: path.join(directory, 'first-assignment.json'),
		firstDispatchLedger: path.join(directory, 'first-dispatch-ledger.json'),
		priorBaseBatchValidation: path.join(directory, 'prior-base-batch-validation.json'),
		baseBatchValidation: path.join(directory, 'base-batch-validation.json'),
		effectiveBatchValidation: path.join(directory, 'effective-batch-validation.json'),
		collectionValidation: path.join(directory, 'collection-validation.json'),
		repairValidation: path.join(directory, 'repair-validation.json')
	};
}

function publishPreparedEvidenceAtomically(directory, prepared) {
	const resolvedDirectory = path.resolve(directory);
	const parent = path.dirname(resolvedDirectory);
	mkdirSync(parent, { recursive: true });
	const temporary = mkdtempSync(
		path.join(parent, `.${path.basename(resolvedDirectory)}.preparing-`)
	);
	try {
		const temporaryPaths = difficultyAdjustmentArtifactPaths(temporary);
		for (const [field, value] of [
			['candidate', prepared.candidate],
			['effectivePlan', prepared.effectivePlan],
			['validation', prepared.validation],
			['manifest', prepared.manifest],
			['provenance', prepared.provenance],
			['priorCandidate', prepared.priorCandidate],
			['priorValidation', prepared.priorValidation],
			['firstReviewSummary', prepared.firstReviewSummary],
			['firstReviewResult', prepared.firstReviewResult],
			['firstAssignment', prepared.firstAssignment],
			['firstDispatchLedger', prepared.firstDispatchLedger],
			['priorBaseBatchValidation', prepared.priorBaseBatchValidation],
			['baseBatchValidation', prepared.baseBatchValidation],
			['effectiveBatchValidation', prepared.effectiveBatchValidation],
			['collectionValidation', prepared.collectionValidation],
			['repairValidation', prepared.repairValidation]
		]) {
			writeImmutableRepairJson(temporaryPaths[field], value);
		}
		renameSync(temporary, resolvedDirectory);
	} catch (error) {
		if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
		throw error;
	}
}

function jsonBinding(filePath, relativeRoot) {
	return {
		path: portableRelative(relativeRoot, filePath),
		sha256: sha256(readFileSync(filePath)),
		canonicalSha256: canonicalHash(readJson(filePath))
	};
}

function byteBinding(filePath, relativeRoot) {
	return {
		path: portableRelative(relativeRoot, filePath),
		sha256: sha256(readFileSync(filePath))
	};
}

function portableRelative(root, filePath) {
	return path.relative(root, filePath).split(path.sep).join('/');
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function stableJsonBytes(value) {
	return Buffer.from(`${stableStringify(value)}\n`);
}

function compareNumber(left, right) {
	return left - right;
}

function requireHash(value, label) {
	if (!HASH.test(String(value ?? ''))) throw new Error(`${label} is invalid.`);
	return value;
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function authoringInputBindsPlanRow(input, row, plan, shardIndex) {
	if (!isRecord(input) || !isRecord(input.plan) || !isRecord(row)) return false;
	const { expectedAnswerPositions, ...inputPlanRow } = input.plan;
	const globalIndex = plan.rows.findIndex((candidate) => candidate?.id === row.id);
	const expectedPositions = {
		strongerAnswer: globalIndex % 2 === 0 ? 'a' : 'b',
		diagnosisCorrectIndex: globalIndex % 3,
		repairCorrectIndex: (globalIndex + 1) % 3,
		transferCorrectIndex: (globalIndex + 2) % 3
	};
	return (
		globalIndex >= 0 &&
		input.shardIndex === shardIndex &&
		canonicalHash(inputPlanRow) === canonicalHash(row) &&
		canonicalHash(expectedAnswerPositions) === canonicalHash(expectedPositions)
	);
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function failed(value) {
	return {
		status: 'failed',
		issues: Array.isArray(value) ? value : [value],
		manifest: null,
		candidate: null,
		validation: null
	};
}
