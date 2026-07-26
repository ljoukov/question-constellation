import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { readScienceChallengeDirectMultipartEvidence } from './science-challenge-authoring-parts.mjs';
import {
	isScienceChallengeDirectMultipartRunSummary,
	validateScienceChallengeDirectMultipartRunPolicy
} from './science-challenge-authoring-run-policy.mjs';
import { SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON } from './science-challenge-authoring-transport.mjs';
import {
	SCIENCE_CHALLENGE_FAILED_MERGE_PLAN_SALVAGE_PATHWAY,
	SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SCHEMA,
	salvageScienceChallengeMergedCandidatePlanDifficultyDrift,
	salvageScienceChallengeMultipartPlanDrift,
	salvageScienceChallengeQuestionPresentationNullDefaults
} from './science-challenge-multipart-plan-salvage.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	canonicalHash,
	challengeBatchOutputSchema,
	normalizeGeneratedChallengeBatch,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
	inspectVerificationRepairAttempts,
	invalidatedVerificationRepairAttempts,
	readVerificationRepairCohortState,
	scienceChallengeVerificationRepairRunId,
	validateVerificationRepairCandidate,
	writeImmutableRepairJson
} from './science-challenge-verification-repair-transaction.mjs';
import {
	inspectVerificationRepairExecutionAttempts,
	requireMatchingVerificationRepairAttemptLedgers,
	scienceChallengeVerificationRepairObjectiveIdentity,
	verificationRepairExecutionLedgerRoot
} from './science-challenge-verification-repair-lineage.mjs';

export const SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_EVIDENCE_SCHEMA =
	'science-challenge-multipart-plan-salvage-evidence/v2';
export const SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_VALIDATION_SCHEMA =
	'science-challenge-multipart-plan-salvage-validation/v1';
export const SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SOURCE_SELECTION_SCHEMA =
	'science-challenge-multipart-plan-salvage-source-selection/v1';
export const SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SOURCE_APPROVAL_SCHEMA =
	'science-challenge-multipart-plan-salvage-source-approval/v1';
export const SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SOURCE_APPROVAL_DECISION =
	'select-terminal-attempt-for-fresh-full-cohort-verification';

const HASH = /^[a-f0-9]{64}$/;

export function scienceChallengeMultipartPlanSalvageDirectory({ shardDir, repairSha256 }) {
	requireHash(repairSha256, 'verification-repair SHA-256');
	return path.join(
		path.resolve(shardDir),
		`verification-repair-${scienceChallengeVerificationRepairRunId(
			repairSha256
		)}-multipart-plan-salvage`
	);
}

/**
 * Stage one deterministic recovery from an immutable failed multipart attempt.
 *
 * The recovery directory is deliberately not an attempt directory. It neither creates a local
 * attempt nor claims a global attempt. Existing recovery evidence is replayed instead of replaced.
 */
export function stageScienceChallengeMultipartPlanSalvage(options) {
	const precondition = inspectSalvagePreconditions(options);
	if (precondition.status !== 'passed') return precondition;
	if (options.resume !== true) {
		return failed(
			'Multipart plan-drift salvage is available only during an explicit --resume run.'
		);
	}

	const salvageDir = scienceChallengeMultipartPlanSalvageDirectory(options);
	const artifactPaths = salvageArtifactPaths(salvageDir);
	if (Object.values(artifactPaths).every((filePath) => existsSync(filePath))) {
		return readScienceChallengeMultipartPlanSalvage(options);
	}

	const eligibility = inspectEligibleSourceAttempts(options, precondition);
	if (eligibility.status !== 'passed') return eligibility;

	const prepared = prepareEvidence({
		...options,
		precondition,
		replay: eligibility.replay,
		sourceSelection: eligibility.sourceSelection
	});
	if (prepared.status !== 'passed') return prepared;
	writeImmutableRepairJson(artifactPaths.candidate, prepared.candidate);
	writeImmutableRepairJson(artifactPaths.validation, prepared.validation);
	writeImmutableRepairJson(artifactPaths.manifest, prepared.manifest);
	return readScienceChallengeMultipartPlanSalvage(options);
}

/**
 * Read-only planning inspection. This performs the same ledger, cohort-state and source-attempt
 * replay checks as staging, but never creates the salvage directory or any evidence files.
 */
export function inspectScienceChallengeMultipartPlanSalvage(options) {
	const precondition = inspectSalvagePreconditions(options);
	if (precondition.status !== 'passed') return precondition;
	if (options.resume !== true) {
		return failed(
			'Multipart plan-drift salvage is available only during an explicit --resume run.'
		);
	}
	const salvageDir = scienceChallengeMultipartPlanSalvageDirectory(options);
	const artifactPaths = salvageArtifactPaths(salvageDir);
	const present = Object.values(artifactPaths).filter((filePath) => existsSync(filePath));
	if (present.length > 0) {
		if (present.length !== Object.keys(artifactPaths).length) {
			return failed('Multipart plan-drift salvage evidence is only partially present.');
		}
		const replay = readScienceChallengeMultipartPlanSalvage(options);
		return replay.status === 'passed' ? { ...replay, action: 'reuse-staged-salvage' } : replay;
	}
	const eligibility = inspectEligibleSourceAttempts(options, precondition);
	if (eligibility.status !== 'passed') return eligibility;
	return {
		status: 'passed',
		issues: [],
		action: 'stage-salvage',
		sourceAttempt: eligibility.replay.record.attempt,
		sourceSelection: eligibility.sourceSelection,
		salvageDir,
		artifactPaths
	};
}

/**
 * Read-only discovery for an exhausted shard whose immutable attempts may contain more than one
 * helper-approved salvage. The returned approval template is not acceptance of the content: it
 * authorizes only the terminal candidate to enter a fresh full-cohort verification pass.
 */
export function inspectScienceChallengeMultipartPlanSalvageSourceSelection(options) {
	const precondition = inspectSalvagePreconditions(options);
	if (precondition.status !== 'passed') return precondition;
	if (options.resume !== true) {
		return failed(
			'Multipart plan-drift salvage source inspection requires an explicit --resume run.'
		);
	}
	const collection = collectHelperApprovedSourceAttempts(options, precondition);
	if (collection.eligible.length === 0) {
		return failed([
			'No helper-approved failed multipart source attempt is available.',
			...collection.rejected.flatMap((row) =>
				row.issues.map((issue) => `attempt ${row.attempt}: ${issue}`)
			)
		]);
	}
	const eligibleSources = collection.eligible.map(sourceSelectionBinding);
	const eligibleSourcesSha256 = canonicalHash(eligibleSources);
	const terminalAttempt = SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS;
	const terminalReplay = collection.eligible.find(
		(replay) => replay.record.attempt === terminalAttempt
	);
	return {
		status: 'passed',
		issues: [],
		requiresApproval: collection.eligible.length > 1,
		eligibleSources,
		eligibleSourcesSha256,
		terminalAttemptEligible: Boolean(terminalReplay),
		approvalTemplate:
			collection.eligible.length > 1 && terminalReplay
				? {
						schemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SOURCE_APPROVAL_SCHEMA,
						decision: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SOURCE_APPROVAL_DECISION,
						shardId: options.shardId,
						repairSha256: options.repairSha256,
						objectiveId: options.expectedExecutionIdentity.objectiveId,
						executionId: options.expectedExecutionIdentity.executionId,
						eligibleSourcesSha256,
						selectedAttempt: terminalAttempt,
						selectedCandidateSha256: terminalReplay.salvage.candidateSha256
					}
				: null
	};
}

/**
 * Replay and validate an already staged recovery. Every source binding, ledger claim, correction,
 * candidate byte set and validation byte set is recomputed; no manifest assertion is trusted.
 */
export function readScienceChallengeMultipartPlanSalvage(options) {
	const precondition = inspectSalvagePreconditions(options);
	if (precondition.status !== 'passed') return precondition;
	const salvageDir = scienceChallengeMultipartPlanSalvageDirectory(options);
	const artifactPaths = salvageArtifactPaths(salvageDir);
	const missing = Object.entries(artifactPaths)
		.filter(([, filePath]) => !existsSync(filePath))
		.map(([name]) => name);
	if (missing.length) {
		return failed(`Multipart plan-drift salvage is missing ${missing.join(', ')} evidence.`);
	}

	let manifest;
	let candidate;
	let validation;
	try {
		manifest = readJson(artifactPaths.manifest);
		candidate = readJson(artifactPaths.candidate);
		validation = readJson(artifactPaths.validation);
	} catch (error) {
		return failed(errorMessage(error));
	}
	if (manifest?.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_EVIDENCE_SCHEMA) {
		return failed('Multipart plan-drift salvage manifest schema is invalid.');
	}
	const sourceAttempt = manifest.sourceAttempt?.attempt;
	const record = precondition.localLedger.attempts.find(
		(candidateRecord) => candidateRecord.attempt === sourceAttempt
	);
	if (!record) {
		return failed('Multipart plan-drift salvage source attempt is absent from the local ledger.');
	}
	if (precondition.invalidatedAttempts.has(sourceAttempt)) {
		return failed(
			`Multipart plan-drift salvage source attempt ${sourceAttempt} was invalidated by collection validation.`
		);
	}
	const eligibility = inspectEligibleSourceAttempts(
		{
			...options,
			sourceSelectionApproval:
				options.sourceSelectionApproval ?? manifest.sourceSelection?.approval ?? undefined
		},
		precondition
	);
	if (eligibility.status !== 'passed') return eligibility;
	const replay = eligibility.replay;
	if (replay.record.attempt !== record.attempt) {
		return failed('Multipart plan-drift salvage manifest selects another eligible source attempt.');
	}
	const prepared = prepareEvidence({
		...options,
		precondition,
		replay,
		sourceSelection: eligibility.sourceSelection
	});
	if (prepared.status !== 'passed') return prepared;
	if (
		!readFileSync(artifactPaths.candidate).equals(stableJsonBytes(prepared.candidate)) ||
		!readFileSync(artifactPaths.validation).equals(stableJsonBytes(prepared.validation)) ||
		!readFileSync(artifactPaths.manifest).equals(stableJsonBytes(prepared.manifest))
	) {
		return failed(
			'Multipart plan-drift salvage candidate, validation or manifest bytes differ from deterministic replay.'
		);
	}
	return {
		status: 'passed',
		issues: [],
		action: 'reused',
		salvageDir,
		artifactPaths,
		manifest,
		candidate,
		validation,
		proposal: {
			shardId: options.shardId,
			attempt: sourceAttempt,
			candidatePath: artifactPaths.candidate,
			validationPath: artifactPaths.validation,
			candidateSha256: canonicalHash(candidate),
			validationSha256: canonicalHash(validation),
			expectedTargetCandidateSha256: canonicalHash(options.priorCandidate),
			expectedTargetValidationSha256: canonicalHash(options.priorValidation)
		},
		sourceSelection: prepared.sourceSelection,
		lineage: buildLineage({
			artifactPaths,
			manifest,
			replay,
			precondition,
			candidate,
			validation
		})
	};
}

function inspectEligibleSourceAttempts(options, precondition) {
	const { eligible, rejected } = collectHelperApprovedSourceAttempts(options, precondition);
	if (eligible.length === 0) {
		return failed([
			'No helper-approved failed multipart source attempt is available.',
			...rejected.flatMap((row) => row.issues.map((issue) => `attempt ${row.attempt}: ${issue}`))
		]);
	}
	const eligibleSources = eligible.map(sourceSelectionBinding);
	const eligibleSourcesSha256 = canonicalHash(eligibleSources);
	if (eligible.length === 1) {
		if (options.sourceSelectionApproval !== undefined) {
			const staleApproval = validateExplicitTerminalSourceApproval({
				approval: options.sourceSelectionApproval,
				options,
				precondition,
				eligible,
				eligibleSourcesSha256
			});
			return failed([
				'Explicit multipart salvage source approval is stale because the eligible source set is no longer ambiguous.',
				...staleApproval.issues
			]);
		}
		return {
			status: 'passed',
			issues: [],
			replay: eligible[0],
			sourceSelection: {
				schemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SOURCE_SELECTION_SCHEMA,
				policy: 'sole-helper-approved-source',
				eligibleSources,
				eligibleSourcesSha256,
				selectedAttempt: eligible[0].record.attempt,
				selectedCandidateSha256: eligible[0].salvage.candidateSha256,
				approval: null
			}
		};
	}

	const approval = validateExplicitTerminalSourceApproval({
		approval: options.sourceSelectionApproval,
		options,
		precondition,
		eligible,
		eligibleSourcesSha256
	});
	if (approval.status !== 'passed') {
		return failed([
			`Found ${eligible.length} helper-approved failed multipart source attempts; explicit terminal-source approval is required.`,
			...approval.issues
		]);
	}
	const replay = eligible.find(
		(candidateReplay) => candidateReplay.record.attempt === approval.approval.selectedAttempt
	);
	return {
		status: 'passed',
		issues: [],
		replay,
		sourceSelection: {
			schemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SOURCE_SELECTION_SCHEMA,
			policy: 'explicit-terminal-attempt-for-fresh-full-cohort-verification',
			eligibleSources,
			eligibleSourcesSha256,
			selectedAttempt: replay.record.attempt,
			selectedCandidateSha256: replay.salvage.candidateSha256,
			approval: approval.approval
		}
	};
}

function collectHelperApprovedSourceAttempts(options, precondition) {
	const eligible = [];
	const rejected = [];
	for (const record of precondition.localLedger.attempts) {
		if (precondition.invalidatedAttempts.has(record.attempt)) {
			rejected.push({
				attempt: record.attempt,
				issues: ['attempt was invalidated by collection validation']
			});
			continue;
		}
		const replay = replayScienceChallengeMultipartPlanSalvageSourceAttempt({
			...options,
			record,
			precondition
		});
		if (replay.status === 'passed') eligible.push(replay);
		else rejected.push({ attempt: record.attempt, issues: replay.issues });
	}
	return { eligible, rejected };
}

function sourceSelectionBinding(replay) {
	return {
		attempt: replay.record.attempt,
		runSummarySha256: canonicalHash(replay.summary),
		sourceValidationSha256: canonicalHash(replay.sourceValidation),
		sourceCandidateSha256: replay.sourceCandidate ? canonicalHash(replay.sourceCandidate) : null,
		salvagePathway: replay.salvage.pathway,
		salvageSourceSha256: canonicalHash(replay.salvage.source),
		correctionsSha256: canonicalHash(replay.salvage.corrections),
		recoveredCandidateSha256: replay.salvage.candidateSha256,
		deterministicValidationSha256: canonicalHash(replay.deterministicValidation),
		repairValidationSha256: canonicalHash(replay.repairValidation)
	};
}

function validateExplicitTerminalSourceApproval({
	approval,
	options,
	precondition,
	eligible,
	eligibleSourcesSha256
}) {
	const issues = [];
	const terminalAttempt = SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS;
	const terminalReplay = eligible.find((replay) => replay.record.attempt === terminalAttempt);
	if (!approval || typeof approval !== 'object' || Array.isArray(approval)) {
		return failed('Multipart plan-drift salvage source approval is absent.');
	}
	if (approval.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SOURCE_APPROVAL_SCHEMA) {
		issues.push('Multipart plan-drift salvage source approval schema is invalid.');
	}
	if (approval.decision !== SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SOURCE_APPROVAL_DECISION) {
		issues.push(
			'Multipart plan-drift salvage source approval does not limit selection to fresh full-cohort verification.'
		);
	}
	if (
		approval.shardId !== options.shardId ||
		approval.repairSha256 !== options.repairSha256 ||
		approval.objectiveId !== options.expectedExecutionIdentity.objectiveId ||
		approval.executionId !== options.expectedExecutionIdentity.executionId
	) {
		issues.push('Multipart plan-drift salvage source approval uses another repair execution.');
	}
	if (approval.eligibleSourcesSha256 !== eligibleSourcesSha256) {
		issues.push('Multipart plan-drift salvage source approval has stale eligible-source evidence.');
	}
	if (
		approval.selectedAttempt !== terminalAttempt ||
		!terminalReplay ||
		precondition.invalidatedAttempts.has(terminalAttempt)
	) {
		issues.push(
			'Multipart plan-drift salvage source approval must select the eligible, non-invalidated terminal attempt.'
		);
	}
	if (
		!terminalReplay ||
		approval.selectedCandidateSha256 !== terminalReplay.salvage.candidateSha256
	) {
		issues.push(
			'Multipart plan-drift salvage source approval has a stale selected candidate hash.'
		);
	}
	const expectedKeys = [
		'decision',
		'eligibleSourcesSha256',
		'executionId',
		'objectiveId',
		'repairSha256',
		'schemaVersion',
		'selectedAttempt',
		'selectedCandidateSha256',
		'shardId'
	].sort(compareText);
	if (canonicalHash(Object.keys(approval).sort(compareText)) !== canonicalHash(expectedKeys)) {
		issues.push('Multipart plan-drift salvage source approval contains unbound fields.');
	}
	return issues.length
		? failed(issues)
		: { status: 'passed', issues: [], approval: structuredClone(approval) };
}

export function validateScienceChallengeMultipartPlanSalvageAcceptance({
	acceptedCandidate,
	acceptedValidation,
	replayOptions
}) {
	const issues = [];
	if (acceptedValidation?.authoringDisposition !== 'deterministic-multipart-plan-drift-salvage') {
		issues.push('Accepted validation strips the staged plan-drift salvage disposition.');
	}
	if (acceptedValidation?.sourceAttemptStatus !== 'failed') {
		issues.push('Accepted plan-drift salvage validation relabels its source model attempt.');
	}
	const replay = readScienceChallengeMultipartPlanSalvage(replayOptions);
	if (replay.status !== 'passed') {
		issues.push(
			'Accepted plan-drift salvage has no complete replayed provenance.',
			...replay.issues
		);
		return { status: 'failed', issues, lineage: null, replay };
	}
	if (replay.lineage.candidateSha256 !== canonicalHash(acceptedCandidate)) {
		issues.push('Accepted plan-drift salvage lineage does not bind the accepted candidate.');
	}
	if (replay.lineage.validationSha256 !== canonicalHash(acceptedValidation)) {
		issues.push('Accepted plan-drift salvage lineage does not bind the accepted validation.');
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		lineage: issues.length ? null : replay.lineage,
		replay
	};
}

function inspectSalvagePreconditions(options) {
	const issues = [];
	if (!options || typeof options !== 'object' || Array.isArray(options)) {
		return failed('Multipart plan-drift salvage options must be an object.');
	}
	if (typeof options.shardId !== 'string' || !options.shardId.trim()) {
		issues.push('Multipart plan-drift salvage shardId is required.');
	}
	if (!HASH.test(String(options.repairSha256 ?? ''))) {
		issues.push('Multipart plan-drift salvage repairSha256 is invalid.');
	}
	if (!HASH.test(String(options.expectedPlanSha256 ?? ''))) {
		issues.push('Multipart plan-drift salvage expectedPlanSha256 is invalid.');
	}
	if (typeof options.validateBatchCandidate !== 'function') {
		issues.push('Multipart plan-drift salvage requires current batch validation.');
	}
	if (typeof options.reconstructSourceEvidence !== 'function') {
		issues.push('Multipart plan-drift salvage requires deterministic source reconstruction.');
	}
	if (!Array.isArray(options.rows) || !Array.isArray(options.inputs)) {
		issues.push('Multipart plan-drift salvage requires exact rows and inputs.');
	}
	if (!Array.isArray(options.expectedReviewIds) || !Array.isArray(options.reviews)) {
		issues.push('Multipart plan-drift salvage requires exact verifier review coverage.');
	} else {
		const expectedReviewIds = [...options.expectedReviewIds].sort(compareText);
		const reviewIds = options.reviews.map((review) => review?.id).sort(compareText);
		if (
			new Set(expectedReviewIds).size !== expectedReviewIds.length ||
			new Set(reviewIds).size !== reviewIds.length ||
			canonicalHash(reviewIds) !== canonicalHash(expectedReviewIds) ||
			options.reviews.some((review) => typeof review?.accepted !== 'boolean') ||
			options.rows.some((row) => !reviewIds.includes(row?.id))
		) {
			issues.push(
				'Multipart plan-drift salvage verifier reviews must cover every expected id exactly once with a boolean decision.'
			);
		}
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
		issues.push(
			'Multipart plan-drift salvage inputSha256 does not bind the exact repair envelope.'
		);
	}
	if (typeof options.outputRoot !== 'string' || !options.outputRoot.trim()) {
		issues.push('Multipart plan-drift salvage requires the exact output root.');
	}
	if (typeof options.workspaceRoot !== 'string' || !options.workspaceRoot.trim()) {
		issues.push('Multipart plan-drift salvage requires the exact workspace root.');
	}
	if (!options.expectedExecutionIdentity || typeof options.expectedExecutionIdentity !== 'object') {
		issues.push('Multipart plan-drift salvage requires an execution identity.');
	} else if (options.expectedExecutionIdentity.verificationSha256 !== options.repairSha256) {
		issues.push('Multipart plan-drift salvage execution identity uses another review summary.');
	} else if (options.expectedExecutionIdentity.planSha256 !== options.expectedPlanSha256) {
		issues.push('Multipart plan-drift salvage execution identity uses another challenge plan.');
	}
	if (issues.length) return failed(issues);

	try {
		const shardDir = path.resolve(options.shardDir);
		const expectedShardDir = path.join(path.resolve(options.outputRoot), 'shards', options.shardId);
		if (shardDir !== expectedShardDir) {
			return failed(
				'Multipart plan-drift salvage shard directory is not the claimed output-root shard.'
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
			outputRoot: options.outputRoot
		});
		const cohortState = readVerificationRepairCohortState({
			outputRoot: options.outputRoot,
			repairSha256: options.repairSha256
		}).state;
		const invalidatedAttempts = invalidatedVerificationRepairAttempts(cohortState, options.shardId);
		if (
			options.invalidatedAttempts !== undefined &&
			(!(options.invalidatedAttempts instanceof Set) ||
				canonicalHash([...options.invalidatedAttempts].sort((left, right) => left - right)) !==
					canonicalHash([...invalidatedAttempts].sort((left, right) => left - right)))
		) {
			return failed(
				'Multipart plan-drift salvage caller invalidations differ from persisted cohort state.'
			);
		}
		if (
			!localLedger.exhausted ||
			!globalLedger.exhausted ||
			localLedger.attempts.length !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
			globalLedger.attempts.length !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
		) {
			return failed(
				'Multipart plan-drift salvage requires the matching local and global four-attempt ledgers to be exhausted.'
			);
		}
		const identityPath = path.join(executionLedgerRoot, 'objective.json');
		const expectedObjective = scienceChallengeVerificationRepairObjectiveIdentity(
			options.expectedExecutionIdentity
		);
		if (
			!existsSync(identityPath) ||
			canonicalHash(readJson(identityPath)) !== canonicalHash(expectedObjective)
		) {
			return failed(
				'Multipart plan-drift salvage execution identity evidence is missing or changed.'
			);
		}
		return {
			status: 'passed',
			issues: [],
			shardDir,
			localLedger,
			globalLedger,
			cohortState,
			invalidatedAttempts,
			executionLedgerRoot,
			identityPath
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

export function replayScienceChallengeMultipartPlanSalvageSourceAttempt(options) {
	const { record, precondition, inputs, rows, priorCandidate, priorValidation, repairSha256 } =
		options;
	const attemptDir = record.path;
	const repairRunId = scienceChallengeVerificationRepairRunId(repairSha256);
	const promptPath = path.join(
		precondition.shardDir,
		`verification-repair-${repairRunId}-prompt-attempt-${record.attempt}.txt`
	);
	const paths = {
		runSummary: path.join(attemptDir, 'run-summary.json'),
		eventLog: path.join(attemptDir, 'events.jsonl'),
		lastMessage: path.join(attemptDir, 'last-message.json'),
		validation: path.join(attemptDir, 'validation.json'),
		prompt: promptPath
	};
	const missing = Object.entries(paths)
		.filter(([, filePath]) => !existsSync(filePath))
		.map(([name]) => name);
	if (missing.length) {
		return failed(`Source attempt ${record.attempt} is missing ${missing.join(', ')} evidence.`);
	}
	try {
		const summary = readJson(paths.runSummary);
		const sourceValidation = readJson(paths.validation);
		if (!isScienceChallengeDirectMultipartRunSummary(summary)) {
			return failed(`Source attempt ${record.attempt} is not a multipart model run.`);
		}
		const sourceCandidatePath = path.join(attemptDir, 'candidate.json');
		const sourceCandidate = existsSync(sourceCandidatePath) ? readJson(sourceCandidatePath) : null;
		const failedMerge =
			summary.status === 'failed' &&
			typeof summary.error === 'string' &&
			summary.error.startsWith('Direct multipart merge failed:');
		const questionPresentationDefault =
			summary.status === 'failed' &&
			typeof summary.error === 'string' &&
			summary.error.startsWith('Prompt-JSON local response validation failed: ');
		const mergedDifficulty = summary.status === 'passed' && sourceCandidate !== null;
		if (
			Number(failedMerge) + Number(questionPresentationDefault) + Number(mergedDifficulty) !==
			1
		) {
			return failed(
				`Source attempt ${record.attempt} is not one exact permitted multipart salvage shape.`
			);
		}
		const transportError =
			failedMerge || questionPresentationDefault
				? `Authoring transport failed: ${summary.error}`
				: null;
		const expectedTransportValidationIssues =
			failedMerge || questionPresentationDefault
				? [
						transportError,
						`schemaVersion must be ${challengeBatchOutputSchema(inputs.length).properties.schemaVersion.const}.`,
						`Batch must contain exactly ${inputs.length} challenges.`
					]
				: null;
		if (
			sourceValidation.status !== 'failed' ||
			sourceValidation.inputSha256 !== options.inputSha256 ||
			sourceValidation.verificationRepairSha256 !== options.repairSha256 ||
			sourceValidation.priorCandidateSha256 !== canonicalHash(priorCandidate) ||
			sourceValidation.runSummarySha256 !== canonicalHash(summary) ||
			sourceValidation.normalizationVersion !== SCIENCE_CHALLENGE_NORMALIZATION_VERSION ||
			sourceValidation.promptVersion !== SCIENCE_CHALLENGE_PROMPT_VERSION ||
			sourceValidation.transport !== summary.transport ||
			sourceValidation.provider !== summary.provider ||
			sourceValidation.model !== summary.model ||
			sourceValidation.modelVersion !== null ||
			sourceValidation.thinkingLevel !== summary.thinkingLevel ||
			canonicalHash(sourceValidation.verificationRepairCohortIssues) !== canonicalHash([]) ||
			((failedMerge || questionPresentationDefault) &&
				(sourceCandidate !== null ||
					sourceValidation.candidateSha256 !== null ||
					sourceValidation.rawCandidateSha256 !== null ||
					sourceValidation.transportVersion !== null ||
					!nullableTransportFieldMatches(sourceValidation, 'responseMode', {
						allowLegacyOmission: options.allowLegacyNullableTransportOmissions === true
					}) ||
					!nullableTransportFieldMatches(sourceValidation, 'providerSchemaApplied', {
						allowLegacyOmission: options.allowLegacyNullableTransportOmissions === true
					}) ||
					sourceValidation.modelVersions !== null ||
					sourceValidation.directPartSize !== null ||
					sourceValidation.transportError !== transportError ||
					canonicalHash(sourceValidation.issues) !==
						canonicalHash(expectedTransportValidationIssues))) ||
			(mergedDifficulty &&
				(sourceValidation.candidateSha256 !== canonicalHash(sourceCandidate) ||
					sourceValidation.rawCandidateSha256 !==
						canonicalHash(JSON.parse(readFileSync(paths.lastMessage, 'utf8'))) ||
					sourceValidation.transportVersion !== summary.transportVersion ||
					sourceValidation.responseMode !== summary.responseMode ||
					sourceValidation.providerSchemaApplied !== summary.providerSchemaApplied ||
					canonicalHash(sourceValidation.modelVersions) !== canonicalHash(summary.modelVersions) ||
					sourceValidation.directPartSize !== summary.partSize ||
					sourceValidation.transportError !== null))
		) {
			return failed(
				`Source attempt ${record.attempt} failed validation is not bound to the exact repair invocation and run.`
			);
		}
		if (summary.inputSha256 !== options.inputSha256) {
			return failed(`Source attempt ${record.attempt} is not bound to the current repair input.`);
		}
		const summaryResponseMode =
			summary.responseMode ?? SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON;
		for (const [field, actual] of [
			['model', summary.model],
			['transport', summary.transport],
			['responseMode', summaryResponseMode],
			['thinkingLevel', summary.thinkingLevel],
			['directPartSize', summary.partSize]
		]) {
			if (options.expectedExecutionIdentity[field] !== actual) {
				return failed(
					`Source attempt ${record.attempt} ${field} differs from the exhausted execution identity.`
				);
			}
		}
		const reconstruction = options.reconstructSourceEvidence({
			attempt: record.attempt,
			attemptDirectory: record.directory,
			attemptDir,
			summary,
			sourceValidation
		});
		const expectedPromptBytes = Buffer.from(reconstruction?.expectedPromptBytes ?? []);
		const promptBytes = readFileSync(paths.prompt);
		if (!promptBytes.equals(expectedPromptBytes)) {
			return failed(
				`Source attempt ${record.attempt} prompt differs from deterministic reconstruction.`
			);
		}
		if (sourceValidation.promptSha256 !== sha256(promptBytes)) {
			return failed(
				`Source attempt ${record.attempt} failed validation does not bind its prompt bytes.`
			);
		}
		const expectedPartPrompts = reconstruction?.expectedPartPrompts;
		if (!Array.isArray(expectedPartPrompts)) {
			return failed(`Source attempt ${record.attempt} has no reconstructed multipart prompts.`);
		}
		const multipartEvidence = readScienceChallengeDirectMultipartEvidence({
			attemptDir,
			summary
		});
		const policyInput = {
			summary,
			eventLogBytes: readFileSync(paths.eventLog),
			lastMessageBytes: readFileSync(paths.lastMessage),
			promptBytes,
			multipartEvidence,
			expectedResponseJsonSchema: challengeBatchOutputSchema(inputs.length),
			expectedInputs: inputs,
			expectedInputSha256: options.inputSha256,
			expectedPartPrompts
		};
		const salvage = failedMerge
			? salvageScienceChallengeMultipartPlanDrift(policyInput)
			: mergedDifficulty
				? salvageScienceChallengeMergedCandidatePlanDifficultyDrift({
						...policyInput,
						sourceCandidate,
						sourceValidation
					})
				: salvageScienceChallengeQuestionPresentationNullDefaults(policyInput);
		if (salvage.status !== 'passed') return salvage;
		const helperCandidateSha256 = canonicalHash(salvage.candidate);
		if (helperCandidateSha256 !== salvage.candidateSha256) {
			return failed('Helper-approved candidate does not bind its declared SHA-256.');
		}
		const deterministicValidation = options.validateBatchCandidate(
			structuredClone(salvage.candidate),
			structuredClone(rows),
			{
				basePlan: structuredClone(options.plan ?? { rows }),
				effectivePlan: null,
				effectivePlanRows: [],
				validationMode: 'base-plan-helper-positive-control'
			}
		);
		if (
			canonicalHash(salvage.candidate) !== helperCandidateSha256 ||
			salvage.candidateSha256 !== helperCandidateSha256
		) {
			return failed('Current deterministic validation mutated the helper-approved candidate.');
		}
		if (
			deterministicValidation?.status !== 'passed' ||
			(deterministicValidation.issues?.length ?? 0) > 0
		) {
			return failed([
				'Recovered candidate failed current deterministic validation.',
				...(deterministicValidation?.issues ?? [])
			]);
		}
		const repairValidation = validateVerificationRepairCandidate({
			candidate: salvage.candidate,
			priorCandidate,
			rows,
			reviews: options.reviews
		});
		if (
			repairValidation.status !== 'passed' &&
			options.deferRepairValidationForDifficultyComposition !== true
		) {
			return failed([
				'Recovered candidate failed current verification-repair validation.',
				...repairValidation.issues
			]);
		}
		if (
			priorValidation?.status !== 'passed' ||
			priorValidation.candidateSha256 !== canonicalHash(priorCandidate)
		) {
			return failed('Recovered candidate prior validation is not verifier-bound and passed.');
		}
		return {
			status: 'passed',
			issues: [],
			record,
			attemptDir,
			paths,
			summary,
			sourceValidation,
			sourceCandidate,
			sourceCandidatePath: sourceCandidate ? sourceCandidatePath : null,
			multipartEvidence,
			expectedPartPrompts,
			salvage,
			deterministicValidation,
			repairValidation,
			legacyNullableOmissions: legacyNullableTransportOmissions(sourceValidation)
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

/**
 * Replay one exhausted difficulty-adjustment attempt without claiming another model slot.
 *
 * Attempts 1-3 are immutable budget evidence only. Attempt 4 is the sole selectable source and
 * must be the exact failed-merge helper shape: one conservative position-bound id typo plus one
 * verifier-authorized stretch-to-standard difficulty change. The standalone helper candidate
 * remains frozen-plan-valid but is never returned as publishable content; the returned terminal
 * candidate keeps the model's reviewed standard difficulty for the typed effective-plan gate.
 */
export function replayScienceChallengeMultipartDifficultyAttempt(options) {
	const attempt = options?.record?.attempt;
	if (!Number.isInteger(attempt) || attempt < 1 || attempt > 4) {
		return failed('Multipart difficulty replay requires one bounded attempt from 1 through 4.');
	}
	const reviews = options.reviews ?? options.firstReviewSummary?.reviews;
	if (!Array.isArray(reviews)) {
		return failed('Multipart difficulty replay requires the exact first-review rows.');
	}
	if (attempt < SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS) {
		return replayScienceChallengeMultipartDifficultyBudgetAttempt({
			...options,
			reviews
		});
	}
	const replay = replayScienceChallengeMultipartPlanSalvageSourceAttempt({
		...options,
		reviews,
		deferRepairValidationForDifficultyComposition: true,
		allowLegacyNullableTransportOmissions: true
	});
	if (replay.status !== 'passed') return replay;
	if (
		replay.record.attempt !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
		replay.summary.status !== 'failed' ||
		replay.salvage.pathway !== SCIENCE_CHALLENGE_FAILED_MERGE_PLAN_SALVAGE_PATHWAY
	) {
		return failed(
			'Terminal multipart difficulty composition requires the exact failed-merge attempt-04 pathway.'
		);
	}

	const idCorrections = replay.salvage.corrections.filter(
		(correction) => correction?.kind === 'definition.id'
	);
	const difficultyCorrections = replay.salvage.corrections.filter(
		(correction) => correction?.kind === 'definition.difficulty'
	);
	if (
		replay.salvage.corrections.length !== 2 ||
		idCorrections.length !== 1 ||
		difficultyCorrections.length !== 1
	) {
		return failed(
			'Terminal multipart difficulty composition requires exactly one id typo and one difficulty restoration.'
		);
	}
	const difficultyCorrection = difficultyCorrections[0];
	if (
		difficultyCorrection.from !== 'standard' ||
		difficultyCorrection.to !== 'stretch' ||
		!Number.isInteger(difficultyCorrection.absoluteRowIndex)
	) {
		return failed(
			'Terminal multipart difficulty composition requires the exact reviewed standard-to-base-stretch inversion.'
		);
	}
	const row = options.rows?.[difficultyCorrection.absoluteRowIndex];
	const challengeId = row?.id;
	const review = reviews.find((candidateReview) => candidateReview?.id === challengeId);
	if (
		row?.difficulty !== difficultyCorrection.to ||
		!isExactVerifierDirectedDifficultyReview(review, difficultyCorrection)
	) {
		return failed(
			'Terminal multipart difficulty composition is not authorized by one exact difficulty-only verifier review.'
		);
	}

	const candidate = structuredClone(replay.salvage.candidate);
	const target = candidate.challenges?.[difficultyCorrection.absoluteRowIndex];
	if (
		target?.definition?.id !== challengeId ||
		target.definition.difficulty !== difficultyCorrection.to
	) {
		return failed(
			'Terminal multipart difficulty composition target differs from the position-bound helper candidate.'
		);
	}
	target.definition.difficulty = difficultyCorrection.from;
	const restored = structuredClone(candidate);
	restored.challenges[difficultyCorrection.absoluteRowIndex].definition.difficulty =
		difficultyCorrection.to;
	if (canonicalHash(restored) !== canonicalHash(replay.salvage.candidate)) {
		return failed(
			'Terminal multipart difficulty composition changes fields outside the typed difficulty inversion.'
		);
	}

	const baseValidation = options.validateBatchCandidate(
		structuredClone(candidate),
		structuredClone(options.rows),
		{
			basePlan: structuredClone(options.plan ?? { rows: options.rows }),
			effectivePlan: null,
			effectivePlanRows: [],
			validationMode: 'base-plan-negative-control'
		}
	);
	const expectedBaseIssue = `${challengeId}: definition.difficulty differs from the plan row.`;
	if (
		baseValidation?.status !== 'failed' ||
		canonicalHash(baseValidation.issues) !== canonicalHash([expectedBaseIssue])
	) {
		return failed([
			'Terminal multipart difficulty candidate must fail the frozen plan only on its reviewed difficulty.',
			...(baseValidation?.issues ?? [])
		]);
	}
	const repairValidation = validateVerificationRepairCandidate({
		candidate,
		priorCandidate: options.priorCandidate,
		rows: options.rows,
		reviews
	});
	if (repairValidation.status !== 'passed' || repairValidation.issues.length !== 0) {
		return failed([
			'Terminal multipart difficulty candidate failed targeted repair preservation.',
			...repairValidation.issues
		]);
	}
	const expectedStandaloneIssue = `${challengeId}: rejected content was returned unchanged.`;
	if (
		replay.repairValidation.status !== 'failed' ||
		canonicalHash(replay.repairValidation.issues) !== canonicalHash([expectedStandaloneIssue])
	) {
		return failed(
			'Base-restored multipart helper must remain non-publishable for exactly the unchanged reviewed difficulty row.'
		);
	}

	const compositionValidation = {
		status: 'source-only',
		issues: [expectedStandaloneIssue],
		candidateSha256: canonicalHash(replay.salvage.candidate),
		baseValidationSha256: canonicalHash(replay.deterministicValidation),
		repairValidationSha256: canonicalHash(replay.repairValidation),
		intendedCandidateSha256: canonicalHash(candidate),
		intendedBaseValidationSha256: canonicalHash(baseValidation),
		intendedRepairValidationSha256: canonicalHash(repairValidation),
		standalonePublishable: false,
		requiresTypedEffectivePlan: true,
		requiresFreshFullVerification: true
	};
	const fileBindings = sourceAttemptBinding(replay, options.precondition.shardDir);
	const helperManifest = {
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_EVIDENCE_SCHEMA,
		disposition: 'difficulty-composition-source-only',
		shardId: options.shardId,
		repairSha256: options.repairSha256,
		executionId: options.expectedExecutionIdentity.executionId,
		executionIdentitySha256: canonicalHash(options.expectedExecutionIdentity),
		sourceAttempt: fileBindings,
		legacyNullableOmissions: replay.legacyNullableOmissions,
		salvage: {
			schemaVersion: replay.salvage.schemaVersion,
			pathway: replay.salvage.pathway,
			normalizationVersion: replay.salvage.normalizationVersion,
			source: replay.salvage.source,
			corrections: replay.salvage.corrections,
			candidateSha256: replay.salvage.candidateSha256
		},
		candidateSha256: canonicalHash(replay.salvage.candidate),
		intendedCandidateSha256: canonicalHash(candidate),
		compositionValidationSha256: canonicalHash(compositionValidation)
	};
	return {
		status: 'passed',
		issues: [],
		attempt: {
			attempt: replay.record.attempt,
			status: 'failed',
			sourceKind: 'helper-approved-multipart-salvage',
			candidate,
			rawCandidateSha256: mergedMultipartRawCandidateSha256(replay.multipartEvidence),
			runSummary: replay.summary,
			sourceValidation: replay.sourceValidation,
			fileBindings,
			helperSalvage: {
				sourceRunStatus: replay.summary.status,
				candidate: replay.salvage.candidate,
				manifest: helperManifest,
				validation: compositionValidation
			}
		}
	};
}

function replayScienceChallengeMultipartDifficultyBudgetAttempt(options) {
	const { record, precondition } = options;
	if (
		!Number.isInteger(record?.attempt) ||
		record.attempt < 1 ||
		record.attempt >= SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
	) {
		return failed('Multipart difficulty budget evidence is limited to attempts 1 through 3.');
	}
	const repairRunId = scienceChallengeVerificationRepairRunId(options.repairSha256);
	const paths = {
		runSummary: path.join(record.path, 'run-summary.json'),
		validation: path.join(record.path, 'validation.json'),
		candidate: path.join(record.path, 'candidate.json'),
		eventLog: path.join(record.path, 'events.jsonl'),
		lastMessage: path.join(record.path, 'last-message.json'),
		prompt: path.join(
			precondition.shardDir,
			`verification-repair-${repairRunId}-prompt-attempt-${record.attempt}.txt`
		)
	};
	const requiredPaths = Object.entries(paths)
		.filter(([field]) => field !== 'candidate')
		.filter(([, filePath]) => !existsSync(filePath))
		.map(([field]) => field);
	if (requiredPaths.length) {
		return failed(
			`Multipart difficulty attempt ${record.attempt} is missing ${requiredPaths.join(', ')} evidence.`
		);
	}
	try {
		const runSummary = readJson(paths.runSummary);
		const sourceValidation = readJson(paths.validation);
		if (!isScienceChallengeDirectMultipartRunSummary(runSummary)) {
			return failed(`Multipart difficulty attempt ${record.attempt} is not a multipart run.`);
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
			!Array.isArray(reconstruction?.expectedPartPrompts) ||
			sourceValidation.promptSha256 !== sha256(promptBytes)
		) {
			return failed(
				`Multipart difficulty attempt ${record.attempt} prompt reconstruction is missing or stale.`
			);
		}
		const commonBindingIssues = exactDifficultyBudgetCommonBindingIssues({
			options,
			runSummary,
			sourceValidation,
			promptBytes
		});
		if (commonBindingIssues.length) return failed(commonBindingIssues);

		const multipartEvidence = readScienceChallengeDirectMultipartEvidence({
			attemptDir: record.path,
			summary: runSummary
		});
		const lastMessageBytes = readFileSync(paths.lastMessage);
		const policyInput = {
			summary: runSummary,
			eventLogBytes: readFileSync(paths.eventLog),
			lastMessageBytes,
			promptBytes,
			multipartEvidence,
			expectedResponseJsonSchema: challengeBatchOutputSchema(options.inputs.length),
			expectedInputs: options.inputs,
			expectedInputSha256: options.inputSha256,
			expectedPartPrompts: reconstruction.expectedPartPrompts
		};
		const runPolicy = validateScienceChallengeDirectMultipartRunPolicy(policyInput);
		let candidate;
		let rawCandidateSha256 = null;
		if (runSummary.status === 'passed') {
			if (!existsSync(paths.candidate)) {
				return failed(
					`Multipart difficulty attempt ${record.attempt} passed transport without a candidate.`
				);
			}
			const rawCandidate = JSON.parse(lastMessageBytes.toString('utf8'));
			candidate = readJson(paths.candidate);
			if (
				canonicalHash(candidate) !==
					canonicalHash(normalizeGeneratedChallengeBatch(rawCandidate)) ||
				runPolicy.status !== 'passed' ||
				runPolicy.issues.length !== 0 ||
				!exactPassedDifficultyBudgetValidation({
					options,
					runSummary,
					sourceValidation,
					candidate,
					rawCandidate
				})
			) {
				return failed(
					`Multipart difficulty attempt ${record.attempt} passed-run evidence is not exact.`
				);
			}
			rawCandidateSha256 = canonicalHash(rawCandidate);
		} else {
			const transportError = `Authoring transport failed: ${runSummary.error}`;
			const expectedIssues = [
				transportError,
				`schemaVersion must be ${challengeBatchOutputSchema(options.inputs.length).properties.schemaVersion.const}.`,
				`Batch must contain exactly ${options.inputs.length} challenges.`
			];
			if (
				existsSync(paths.candidate) ||
				sourceValidation.candidateSha256 !== null ||
				sourceValidation.rawCandidateSha256 !== null ||
				sourceValidation.transportVersion !== null ||
				!nullableTransportFieldMatches(sourceValidation, 'responseMode', {
					allowLegacyOmission: true
				}) ||
				!nullableTransportFieldMatches(sourceValidation, 'providerSchemaApplied', {
					allowLegacyOmission: true
				}) ||
				sourceValidation.modelVersions !== null ||
				sourceValidation.directPartSize !== null ||
				sourceValidation.transportError !== transportError ||
				canonicalHash(sourceValidation.issues) !== canonicalHash(expectedIssues)
			) {
				return failed(
					`Multipart difficulty attempt ${record.attempt} failed-run evidence is not exact.`
				);
			}
		}
		return {
			status: 'passed',
			issues: [],
			attempt: {
				attempt: record.attempt,
				status: 'failed',
				...(candidate === undefined ? {} : { candidate }),
				rawCandidateSha256,
				runSummary,
				sourceValidation,
				runPolicy,
				fileBindings: difficultyBudgetFileBindings({
					record,
					paths,
					multipartEvidence,
					shardDir: precondition.shardDir
				}),
				legacyNullableOmissions: legacyNullableTransportOmissions(sourceValidation)
			}
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

function prepareEvidence(options) {
	const { replay, precondition, sourceSelection } = options;
	const repairEvidence = repairEvidenceFiles(options);
	if (repairEvidence.status !== 'passed') return repairEvidence;
	const sourceAttempt = sourceAttemptBinding(replay, precondition.shardDir);
	const attemptBudget = attemptBudgetBinding(precondition);
	const candidate = replay.salvage.candidate;
	const validation = {
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_VALIDATION_SCHEMA,
		status: 'passed',
		issues: [],
		inputSha256: options.inputSha256,
		verificationRepairSha256: options.repairSha256,
		verificationRepairCohortIssues: [],
		priorCandidateSha256: canonicalHash(options.priorCandidate),
		rawCandidateSha256: null,
		candidateSha256: canonicalHash(candidate),
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		promptSha256: sha256(readFileSync(replay.paths.prompt)),
		runSummarySha256: canonicalHash(replay.summary),
		transport: replay.summary.transport,
		transportVersion: replay.summary.transportVersion,
		responseMode: replay.summary.responseMode,
		providerSchemaApplied: replay.summary.providerSchemaApplied,
		provider: replay.summary.provider,
		model: replay.summary.model,
		modelVersion: null,
		modelVersions: replay.summary.modelVersions,
		directPartSize: replay.summary.partSize,
		thinkingLevel: replay.summary.thinkingLevel,
		transportError: null,
		authoringDisposition: 'deterministic-multipart-plan-drift-salvage',
		salvagePathway: replay.salvage.pathway,
		sourceAttempt: replay.record.attempt,
		sourceAttemptStatus: 'failed',
		salvageSchemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SCHEMA,
		salvageSourceSha256: canonicalHash(replay.salvage.source),
		correctionsSha256: canonicalHash(replay.salvage.corrections),
		deterministicValidationSha256: canonicalHash(replay.deterministicValidation),
		repairValidationSha256: canonicalHash(replay.repairValidation)
	};
	const manifest = {
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_EVIDENCE_SCHEMA,
		shardId: options.shardId,
		repairSha256: options.repairSha256,
		executionId: options.expectedExecutionIdentity.executionId,
		executionIdentity: options.expectedExecutionIdentity,
		executionIdentitySha256: canonicalHash(options.expectedExecutionIdentity),
		attemptBudget,
		sourceAttempt,
		sourceSelection,
		repairEvidence: repairEvidence.binding,
		salvage: {
			schemaVersion: replay.salvage.schemaVersion,
			pathway: replay.salvage.pathway,
			normalizationVersion: replay.salvage.normalizationVersion,
			source: replay.salvage.source,
			corrections: replay.salvage.corrections,
			candidateSha256: replay.salvage.candidateSha256
		},
		candidateSha256: canonicalHash(candidate),
		validationSha256: canonicalHash(validation)
	};
	return { status: 'passed', issues: [], manifest, candidate, validation, sourceSelection };
}

function repairEvidenceFiles(options) {
	const repairDir = path.join(
		path.resolve(options.shardDir),
		`verification-repair-${scienceChallengeVerificationRepairRunId(options.repairSha256)}`
	);
	const files = {
		verificationSummary: path.join(repairDir, 'verification-summary.json'),
		priorCandidate: path.join(repairDir, 'prior-candidate.json'),
		priorValidation: path.join(repairDir, 'prior-validation.json')
	};
	const missing = Object.entries(files)
		.filter(([, filePath]) => !existsSync(filePath))
		.map(([name]) => name);
	if (missing.length) {
		return failed(`Multipart plan-drift salvage is missing ${missing.join(', ')} repair evidence.`);
	}
	try {
		const summary = readJson(files.verificationSummary);
		const priorCandidate = readJson(files.priorCandidate);
		const priorValidation = readJson(files.priorValidation);
		if (
			canonicalHash(summary) !== options.repairSha256 ||
			summary.candidateSetSha256 !== options.expectedExecutionIdentity.priorCandidateSetSha256 ||
			canonicalHash(summary.reviews) !== canonicalHash(options.reviews) ||
			canonicalHash(priorCandidate) !== canonicalHash(options.priorCandidate) ||
			canonicalHash(priorValidation) !== canonicalHash(options.priorValidation)
		) {
			return failed('Multipart plan-drift salvage repair evidence differs from current bindings.');
		}
		return {
			status: 'passed',
			issues: [],
			files,
			binding: {
				verificationSummary: jsonFileBinding(
					files.verificationSummary,
					path.resolve(options.shardDir)
				),
				priorCandidate: jsonFileBinding(files.priorCandidate, path.resolve(options.shardDir)),
				priorValidation: jsonFileBinding(files.priorValidation, path.resolve(options.shardDir))
			}
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

function sourceAttemptBinding(replay, shardDir) {
	return {
		attempt: replay.record.attempt,
		directory: replay.record.directory,
		status: 'failed',
		runSummary: jsonFileBinding(replay.paths.runSummary, shardDir),
		validation: jsonFileBinding(replay.paths.validation, shardDir),
		eventLog: byteFileBinding(replay.paths.eventLog, shardDir),
		lastMessage: byteFileBinding(replay.paths.lastMessage, shardDir),
		prompt: byteFileBinding(replay.paths.prompt, shardDir),
		candidate: replay.sourceCandidatePath
			? jsonFileBinding(replay.sourceCandidatePath, shardDir)
			: null,
		parts: replay.multipartEvidence.parts.map((part) => ({
			partId: part.record.partId,
			rawOutputSha256: sha256(part.lastMessageBytes),
			rawCandidateSha256: canonicalHash(JSON.parse(part.lastMessageBytes.toString('utf8'))),
			runSummarySha256: canonicalHash(part.summary)
		}))
	};
}

function attemptBudgetBinding(precondition) {
	return {
		maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
		exhausted: true,
		localAttempts: precondition.localLedger.attempts.map((record) => ({
			attempt: record.attempt,
			directory: record.directory
		})),
		globalObjectiveSha256: canonicalHash(readJson(precondition.identityPath)),
		globalObjectiveByteSha256: sha256(readFileSync(precondition.identityPath)),
		globalAttempts: precondition.globalLedger.attempts.map((record) => ({
			attempt: record.attempt,
			claimSha256: canonicalHash(record.claim),
			claimByteSha256: sha256(readFileSync(path.join(record.path, 'claim.json')))
		}))
	};
}

function isExactVerifierDirectedDifficultyReview(review, correction) {
	if (
		review?.accepted !== false ||
		review?.difficultyCalibrated !== false ||
		!Array.isArray(review?.issues) ||
		review.issues.length !== 1 ||
		review.issues[0]?.field !== 'definition.difficulty' ||
		SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.filter((field) => field !== 'difficultyCalibrated').some(
			(field) => review[field] !== true
		)
	) {
		return false;
	}
	const statement =
		`${review.issues[0].evidence ?? ''} ${review.issues[0].repair ?? ''}`.toLowerCase();
	return (
		new RegExp(`\\b${escapeRegExp(correction.to)}\\b`, 'u').test(statement) &&
		new RegExp(`\\b${escapeRegExp(correction.from)}\\b`, 'u').test(statement)
	);
}

function exactDifficultyBudgetCommonBindingIssues({
	options,
	runSummary,
	sourceValidation,
	promptBytes
}) {
	const issues = [];
	if (
		sourceValidation.status !== 'failed' ||
		sourceValidation.inputSha256 !== options.inputSha256 ||
		sourceValidation.verificationRepairSha256 !== options.repairSha256 ||
		sourceValidation.priorCandidateSha256 !== canonicalHash(options.priorCandidate) ||
		sourceValidation.runSummarySha256 !== canonicalHash(runSummary) ||
		sourceValidation.promptSha256 !== sha256(promptBytes) ||
		sourceValidation.normalizationVersion !== SCIENCE_CHALLENGE_NORMALIZATION_VERSION ||
		sourceValidation.promptVersion !== SCIENCE_CHALLENGE_PROMPT_VERSION ||
		sourceValidation.transport !== runSummary.transport ||
		sourceValidation.provider !== runSummary.provider ||
		sourceValidation.model !== runSummary.model ||
		sourceValidation.modelVersion !== null ||
		sourceValidation.thinkingLevel !== runSummary.thinkingLevel ||
		canonicalHash(sourceValidation.verificationRepairCohortIssues) !== canonicalHash([]) ||
		runSummary.inputSha256 !== options.inputSha256
	) {
		issues.push('Multipart difficulty budget validation does not bind the exact repair run.');
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
		if (options.expectedExecutionIdentity?.[field] !== actual) {
			issues.push(`Multipart difficulty budget ${field} differs from the execution identity.`);
		}
	}
	return issues;
}

function exactPassedDifficultyBudgetValidation({
	options,
	runSummary,
	sourceValidation,
	candidate,
	rawCandidate
}) {
	return (
		sourceValidation.candidateSha256 === canonicalHash(candidate) &&
		sourceValidation.rawCandidateSha256 === canonicalHash(rawCandidate) &&
		sourceValidation.transportVersion === runSummary.transportVersion &&
		sourceValidation.responseMode === runSummary.responseMode &&
		sourceValidation.providerSchemaApplied === runSummary.providerSchemaApplied &&
		canonicalHash(sourceValidation.modelVersions) === canonicalHash(runSummary.modelVersions) &&
		sourceValidation.directPartSize === runSummary.partSize &&
		sourceValidation.transportError === null &&
		sourceValidation.inputSha256 === options.inputSha256
	);
}

function difficultyBudgetFileBindings({ record, paths, multipartEvidence, shardDir }) {
	return {
		attemptDirectory: record.directory,
		runSummary: jsonFileBinding(paths.runSummary, shardDir),
		validation: jsonFileBinding(paths.validation, shardDir),
		candidate: existsSync(paths.candidate) ? jsonFileBinding(paths.candidate, shardDir) : null,
		eventLog: byteFileBinding(paths.eventLog, shardDir),
		lastMessage: byteFileBinding(paths.lastMessage, shardDir),
		prompt: byteFileBinding(paths.prompt, shardDir),
		parts: multipartEvidence.parts.map((part) => ({
			partId: part.record.partId,
			runSummarySha256: canonicalHash(part.summary),
			lastMessageSha256: sha256(part.lastMessageBytes),
			rawCandidateSha256: safeRawCandidateCanonicalHash(part.lastMessageBytes)
		}))
	};
}

function safeRawCandidateCanonicalHash(bytes) {
	try {
		return canonicalHash(JSON.parse(bytes.toString('utf8')));
	} catch {
		return null;
	}
}

function mergedMultipartRawCandidateSha256(multipartEvidence) {
	const batches = multipartEvidence.parts.map((part) =>
		JSON.parse(part.lastMessageBytes.toString('utf8'))
	);
	return canonicalHash({
		schemaVersion: batches[0]?.schemaVersion,
		challenges: batches.flatMap((batch) => batch.challenges)
	});
}

function nullableTransportFieldMatches(record, field, { allowLegacyOmission = false } = {}) {
	return (
		(allowLegacyOmission && !Object.prototype.hasOwnProperty.call(record, field)) ||
		record[field] === null
	);
}

function legacyNullableTransportOmissions(record) {
	return ['providerSchemaApplied', 'responseMode'].filter(
		(field) => !Object.prototype.hasOwnProperty.call(record, field)
	);
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function buildLineage({ artifactPaths, manifest, replay, precondition, candidate, validation }) {
	return {
		schemaVersion: manifest.schemaVersion,
		salvagePathway: manifest.salvage.pathway,
		manifestPath: artifactPaths.manifest,
		manifestSha256: canonicalHash(manifest),
		manifestFileSha256: sha256(readFileSync(artifactPaths.manifest)),
		candidatePath: artifactPaths.candidate,
		candidateSha256: canonicalHash(candidate),
		candidateFileSha256: sha256(readFileSync(artifactPaths.candidate)),
		validationPath: artifactPaths.validation,
		validationSha256: canonicalHash(validation),
		validationFileSha256: sha256(readFileSync(artifactPaths.validation)),
		execution: {
			executionId: manifest.executionId,
			identity: manifest.executionIdentity,
			objectivePath: precondition.identityPath,
			objectiveSha256: canonicalHash(readJson(precondition.identityPath)),
			objectiveByteSha256: sha256(readFileSync(precondition.identityPath)),
			claims: precondition.globalLedger.attempts.map((record) => ({
				attempt: record.attempt,
				path: path.join(record.path, 'claim.json'),
				sha256: canonicalHash(record.claim),
				byteSha256: sha256(readFileSync(path.join(record.path, 'claim.json')))
			}))
		},
		sourceAttempt: {
			attempt: replay.record.attempt,
			status: 'failed',
			runSummaryPath: replay.paths.runSummary,
			runSummarySha256: canonicalHash(replay.summary),
			runSummaryFileSha256: sha256(readFileSync(replay.paths.runSummary)),
			validationPath: replay.paths.validation,
			validationSha256: canonicalHash(replay.sourceValidation),
			validationFileSha256: sha256(readFileSync(replay.paths.validation)),
			eventLogPath: replay.paths.eventLog,
			eventLogSha256: sha256(readFileSync(replay.paths.eventLog)),
			lastMessagePath: replay.paths.lastMessage,
			lastMessageSha256: sha256(readFileSync(replay.paths.lastMessage)),
			promptPath: replay.paths.prompt,
			promptSha256: sha256(readFileSync(replay.paths.prompt)),
			candidatePath: replay.sourceCandidatePath,
			candidateSha256: replay.sourceCandidate ? canonicalHash(replay.sourceCandidate) : null,
			candidateFileSha256: replay.sourceCandidatePath
				? sha256(readFileSync(replay.sourceCandidatePath))
				: null,
			attemptDir: replay.attemptDir,
			partRecords: replay.summary.parts,
			responseMode: replay.summary.responseMode,
			providerSchemaApplied: replay.summary.providerSchemaApplied
		},
		repairEvidence: {
			verificationSummaryPath: path.resolve(
				precondition.shardDir,
				manifest.repairEvidence.verificationSummary.path
			),
			verificationSummarySha256: manifest.repairEvidence.verificationSummary.canonicalSha256,
			verificationSummaryFileSha256: manifest.repairEvidence.verificationSummary.sha256,
			priorCandidatePath: path.resolve(
				precondition.shardDir,
				manifest.repairEvidence.priorCandidate.path
			),
			priorCandidateSha256: manifest.repairEvidence.priorCandidate.canonicalSha256,
			priorCandidateFileSha256: manifest.repairEvidence.priorCandidate.sha256,
			priorValidationPath: path.resolve(
				precondition.shardDir,
				manifest.repairEvidence.priorValidation.path
			),
			priorValidationSha256: manifest.repairEvidence.priorValidation.canonicalSha256,
			priorValidationFileSha256: manifest.repairEvidence.priorValidation.sha256
		},
		sourceSelection: manifest.sourceSelection,
		sourceSelectionSha256: canonicalHash(manifest.sourceSelection),
		corrections: manifest.salvage.corrections,
		salvageSourceSha256: canonicalHash(manifest.salvage.source)
	};
}

function salvageArtifactPaths(salvageDir) {
	return {
		manifest: path.join(salvageDir, 'manifest.json'),
		candidate: path.join(salvageDir, 'candidate.json'),
		validation: path.join(salvageDir, 'validation.json')
	};
}

function jsonFileBinding(filePath, relativeRoot) {
	return {
		path: path.relative(relativeRoot, filePath).split(path.sep).join('/'),
		sha256: sha256(readFileSync(filePath)),
		canonicalSha256: canonicalHash(readJson(filePath))
	};
}

function byteFileBinding(filePath, relativeRoot) {
	return {
		path: path.relative(relativeRoot, filePath).split(path.sep).join('/'),
		sha256: sha256(readFileSync(filePath))
	};
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function stableJsonBytes(value) {
	return Buffer.from(`${stableStringify(value)}\n`);
}

function requireHash(value, label) {
	if (!HASH.test(String(value ?? ''))) throw new Error(`${label} is invalid.`);
	return value;
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function compareText(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function failed(value) {
	return {
		status: 'failed',
		issues: Array.isArray(value) ? value : [value],
		candidate: null,
		validation: null,
		manifest: null
	};
}
