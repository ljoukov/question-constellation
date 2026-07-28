#!/usr/bin/env node

import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadChallengeCatalogSource } from './lib/challenge-catalog-source.mjs';

import { loadDefaultEnv, runCodexSdkTurn } from './lib/codex-sdk-runner.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	configureScienceChallengeDirectJsonTransport,
	runDirectScienceChallengeJsonTurn
} from './lib/science-challenge-direct-json-runner.mjs';
import { runDirectScienceChallengeMultipartTurn } from './lib/science-challenge-direct-multipart-runner.mjs';
import { runDirectScienceChallengePromptJsonTurn } from './lib/science-challenge-direct-prompt-json-runner.mjs';
import {
	runScienceChallengeDirectTransportPreflight,
	runScienceChallengeGenerationBehindPreflight
} from './lib/science-challenge-direct-preflight.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './lib/science-challenge-authoring-transport.mjs';
import {
	buildScienceChallengeAuthoringParts,
	readScienceChallengeDirectMultipartEvidence
} from './lib/science-challenge-authoring-parts.mjs';
import {
	buildScienceChallengeAuthoringPrompt,
	buildScienceChallengeMultipartAttemptParts,
	buildScienceChallengeRepairPrompt,
	buildScienceChallengeVerificationRepairPrompt,
	reconstructScienceChallengeAuthoringAttemptPrompt,
	reconstructScienceChallengeMultipartAttemptParts,
	subsetScienceChallengeCandidate
} from './lib/science-challenge-authoring-prompts.mjs';
import {
	SCIENCE_CHALLENGE_BATCH_SCHEMA,
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	challengeBatchOutputSchema,
	normalizeGeneratedChallengeBatch,
	sha256,
	stableStringify,
	validateGeneratedChallengeCollection,
	validateIndependentContentReviewRow
} from './lib/science-challenge-release.mjs';
import { validateScienceChallengeGeneratedBatch } from './lib/science-challenge-batch-validation.mjs';
import { findBoundToolFreeScienceChallengeAuthoringAttempt } from './lib/science-challenge-authoring-attempt.mjs';
import { runBoundedScienceChallengeAuthoringAttempts } from './lib/science-challenge-authoring-retry.mjs';
import {
	isScienceChallengeDirectMultipartRunSummary,
	requireScienceChallengeAuthoringRunPolicy
} from './lib/science-challenge-authoring-run-policy.mjs';
import {
	inspectScienceChallengeMultipartPlanSalvage,
	inspectScienceChallengeMultipartPlanSalvageSourceSelection,
	readScienceChallengeMultipartPlanSalvage,
	scienceChallengeMultipartPlanSalvageDirectory,
	stageScienceChallengeMultipartPlanSalvage,
	validateScienceChallengeMultipartPlanSalvageAcceptance
} from './lib/science-challenge-multipart-plan-salvage-evidence.mjs';
import { recoverExhaustedScienceChallengeDescendantRemap } from './lib/science-challenge-descendant-remap-generator.mjs';
import { recoverExhaustedScienceChallengeDifficultyPlanAdjustment } from './lib/science-challenge-difficulty-plan-adjustment-generator.mjs';
import {
	discoverScienceChallengeEffectiveCohortManifest,
	readScienceChallengeEffectiveCohort,
	stageScienceChallengeEffectiveCohort,
	stageScienceChallengeEffectiveCohortSuccessor,
	validateScienceChallengeReviewRebaseSuccessorLineage
} from './lib/science-challenge-effective-cohort.mjs';
import { projectScienceChallengeEffectiveRecoveryPlan } from './lib/science-challenge-effective-plan-recovery.mjs';
import {
	assertScienceChallengeMultipartSalvageApprovalsConsumed,
	readScienceChallengeMultipartSalvageSourceApprovals
} from './lib/science-challenge-multipart-salvage-approval-cli.mjs';
import { evaluateScienceChallengeVerificationRepairOverlay } from './lib/science-challenge-verification-repair-overlay.mjs';
import {
	buildScienceChallengeReviewRebaseSuccessorEmptyRecoveryBinding,
	requireContentVerificationEvidence
} from './lib/science-challenge-review-evidence.mjs';
import { readScienceChallengeReviewRebaseEvidence } from './lib/science-challenge-review-rebase-evidence.mjs';
import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_DIRECT_REPAIR_KIND,
	commitScienceChallengeReviewRebaseChild,
	inspectScienceChallengeReviewRebaseChildRegistration,
	reserveScienceChallengeReviewRebaseChild
} from './lib/science-challenge-review-rebase-child-registry.mjs';
import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED,
	SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT,
	SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED,
	SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT,
	SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS,
	SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE,
	SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL,
	SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED,
	claimScienceChallengeReviewRebaseRecoveryInvocation,
	completeScienceChallengeReviewRebaseRecoveryInvocation,
	inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal,
	inspectScienceChallengeReviewRebaseRecoveryInvocations,
	nextScienceChallengeReviewRebaseLogicalOrdinal,
	remainingScienceChallengeReviewRebaseLogicalSlots,
	stageScienceChallengeReviewRebaseInfrastructureRecovery
} from './lib/science-challenge-review-rebase-infra-recovery.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
	buildScienceChallengeVerificationRepairAuthority,
	inspectVerificationRepairAttempts,
	invalidatedVerificationRepairAttempts,
	planVerificationRepairResume,
	publishVerificationRepairCohort,
	readVerificationRepairCohortState,
	readVerificationRepairPublication,
	recoverVerificationRepairPublication,
	recordVerificationRepairCollectionFailure,
	recordVerificationRepairCollectionPass,
	requireCompleteVerificationRepairCohort,
	validateVerificationRepairCollectionTargets,
	validateVerificationRepairCandidate,
	writeImmutableRepairEvidence,
	writeImmutableRepairJson
} from './lib/science-challenge-verification-repair-transaction.mjs';
import {
	bindVerificationRepairExecutionMarker,
	claimVerificationRepairAttemptPair,
	initializeVerificationRepairExecutionLedger,
	inspectVerificationRepairExecutionAttempts,
	reconcileVerificationRepairAttemptTransactions,
	requireMatchingVerificationRepairAttemptLedgers,
	requireMatchingVerificationRepairExecutionIdentity,
	scienceChallengeVerificationRepairExecutionIdentity,
	verificationRepairExecutionLedgerRoot
} from './lib/science-challenge-verification-repair-lineage.mjs';

const CODEX_SDK_TRANSPORT = 'codex-sdk';
const CODEX_SDK_MODEL = 'gpt-5.6-sol';
const THINKING_LEVEL = 'max';
const rootDir = process.cwd();
loadDefaultEnv(rootDir);
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
const expectedModel =
	args.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT
		? SCIENCE_CHALLENGE_DIRECT_JSON_MODEL
		: CODEX_SDK_MODEL;
const validThinkingLevel =
	args.thinkingLevel === THINKING_LEVEL ||
	(args.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
		args.directResponseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
		args.thinkingLevel === 'high');
if (args.model !== expectedModel || !validThinkingLevel) {
	throw new Error(
		`Release-grade ${args.transport} challenge generation requires ${expectedModel}/max; only llm-direct prompt-json may explicitly use high.`
	);
}
let directAuthMode = null;
if (args.preflightOnly) {
	directAuthMode = configureScienceChallengeDirectJsonTransport();
	const preflight = await runScienceChallengeDirectTransportPreflight({
		model: args.model,
		thinkingLevel: args.thinkingLevel,
		timeoutMs: args.timeoutMs,
		authMode: directAuthMode,
		responseMode: args.directResponseMode
	});
	if (args.preflightOutput) {
		const preflightOutput = path.resolve(rootDir, args.preflightOutput);
		mkdirSync(path.dirname(preflightOutput), { recursive: true });
		writeImmutableRepairEvidence(preflightOutput, `${stableStringify(preflight)}\n`);
	}
	console.log(JSON.stringify(preflight, null, 2));
	process.exit(0);
}

const planPath = path.resolve(rootDir, args.plan);
const sourcePath = path.resolve(rootDir, args.source);
const evidencePath = path.resolve(rootDir, args.evidence);
const outputRoot = path.resolve(rootDir, args.outputRoot);
const outputRootInitiallyExists = existsSync(outputRoot);
const requestedReviewRebaseInfrastructureRecovery = args.reviewRebaseInfrastructureRecovery
	? readRequestedReviewRebaseInfrastructureRecovery()
	: null;
for (const requiredPath of [planPath, sourcePath, evidencePath]) {
	if (!existsSync(requiredPath)) throw new Error(`Required input does not exist: ${requiredPath}`);
}
const basePlan = JSON.parse(readFileSync(planPath, 'utf8'));
let plan = basePlan;
const sourceSnapshot = JSON.parse(readFileSync(sourcePath, 'utf8'));
const curriculumEvidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
const sourceById = new Map(
	sourceSnapshot.questions.map((question) => [
		question.id,
		{
			...question,
			contentSha256: question.contentSha256 ?? canonicalHash(question)
		}
	])
);
const sourceDocumentById = new Map(
	(sourceSnapshot.sourceDocuments ?? []).map((document) => [document.id, document])
);
const existingChallengeCatalog = await loadExistingCatalog();
const existingChallengeDefinitions = existingChallengeCatalog.definitions;
if (
	existingChallengeCatalog.contentSha256 !== basePlan.baseCatalogContentSha256 ||
	existingChallengeDefinitions.length !== basePlan.baseCatalogRecordCount
) {
	throw new Error(
		'Active challenge catalogue differs from the exact source bound into the generation plan.'
	);
}
const curriculumById = new Map(
	curriculumEvidence.components.map((component) => [component.componentId, component])
);
const unvalidatedVerificationRepair = args.repairVerification
	? readJson(args.repairVerification)
	: null;
const verificationRepairSha256 = unvalidatedVerificationRepair
	? canonicalHash(unvalidatedVerificationRepair)
	: null;
const unvalidatedVerificationRepairExecutionIdentity = unvalidatedVerificationRepair
	? executionIdentityForVerificationRepair(unvalidatedVerificationRepair, {
			verificationSha256: verificationRepairSha256
		})
	: null;
if (typeof basePlan.curriculumCatalogPath !== 'string' || !basePlan.curriculumCatalogPath.trim()) {
	throw new Error('Plan does not bind a curriculumCatalogPath.');
}
const curriculumCatalogPath = path.resolve(rootDir, basePlan.curriculumCatalogPath);
if (!existsSync(curriculumCatalogPath)) {
	throw new Error(`Plan-bound curriculum catalog does not exist: ${curriculumCatalogPath}`);
}
const curriculumCatalog = JSON.parse(readFileSync(curriculumCatalogPath, 'utf8'));
if (canonicalHash(curriculumCatalog) !== basePlan.curriculumCatalogSha256) {
	throw new Error('Plan-bound curriculum catalog bytes differ from curriculumCatalogSha256.');
}
directAuthMode =
	args.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT
		? configureScienceChallengeDirectJsonTransport()
		: null;
const directGenerationPreflight = { result: null };
const verificationRepairBase = args.repairVerification
	? resolveVerificationRepairBase(args.repairVerification, unvalidatedVerificationRepair)
	: null;
if (verificationRepairBase) plan = verificationRepairBase.plan;
const verificationRepairAuthority = unvalidatedVerificationRepair
	? buildScienceChallengeVerificationRepairAuthority({
			verificationSummary: unvalidatedVerificationRepair,
			reviewRebaseManifest: verificationRepairBase?.effectiveCohort
				? null
				: (verificationRepairBase?.reviewRebase?.manifest ?? null)
		})
	: null;
const verificationRepairAuthoritySha256 = verificationRepairAuthority
	? canonicalHash(verificationRepairAuthority)
	: null;
const verificationRepairParent = verificationRepairAuthority
	? buildReviewRebaseRepairParentBinding({
			repairBase: verificationRepairBase,
			verificationSummary: unvalidatedVerificationRepair,
			verificationSummaryPath: path.resolve(rootDir, args.repairVerification),
			authority: verificationRepairAuthority
		})
	: null;
const verificationRepairParentSha256 = verificationRepairParent
	? canonicalHash(verificationRepairParent)
	: null;
if (verificationRepairParent && outputRootInitiallyExists) {
	requireMatchingReviewRebaseRepairParentBinding(verificationRepairParent);
}
const verificationRepairEvidence = args.repairVerification
	? readAndValidateVerificationRepair(
			args.repairVerification,
			unvalidatedVerificationRepair,
			verificationRepairBase
		)
	: null;
const verificationRepair = verificationRepairEvidence?.summary ?? null;
const verificationRepairPriorCandidateByShard =
	verificationRepairEvidence?.priorCandidateByShard ?? new Map();
const verificationRepairPriorValidationByShard =
	verificationRepairEvidence?.priorValidationByShard ?? new Map();
const verificationRepairPredecessorEffectiveCohort =
	verificationRepairEvidence?.effectiveCohort ?? null;
const verificationRepairSuccessorAncestry = verificationRepairPredecessorEffectiveCohort?.manifest
	?.parentChain
	? validateScienceChallengeReviewRebaseSuccessorLineage({
			effectiveCohort: verificationRepairPredecessorEffectiveCohort,
			reviewRebaseEvidence: verificationRepairEvidence?.reviewRebase ?? null
		})
	: null;
if (
	verificationRepairSuccessorAncestry &&
	verificationRepairSuccessorAncestry.status !== 'passed'
) {
	throw new Error(
		`Authenticated review-rebase successor ancestry is invalid:\n${(
			verificationRepairSuccessorAncestry.issues ?? []
		).join('\n')}`
	);
}
const exhaustedReviewRebaseRepairIsTerminal =
	Boolean(verificationRepairAuthority) || verificationRepairSuccessorAncestry?.status === 'passed';
const verificationReviewById = new Map(
	verificationRepair?.reviews.map((review) => [review.id, review]) ?? []
);
const verificationRepairExecutionIdentity = verificationRepair
	? executionIdentityForVerificationRepair(verificationRepair, {
			verificationSha256: verificationRepairSha256
		})
	: null;
const repairExecutionLedgerRoot = verificationRepairExecutionIdentity
	? verificationRepairExecutionLedgerRoot(rootDir, verificationRepairExecutionIdentity.objectiveId)
	: null;
if (unvalidatedVerificationRepairExecutionIdentity && verificationRepairExecutionIdentity) {
	requireMatchingVerificationRepairExecutionIdentity({
		expected: unvalidatedVerificationRepairExecutionIdentity,
		actual: verificationRepairExecutionIdentity,
		label: 'Validated verification-repair execution identity'
	});
}
const reviewRebaseInfrastructureRecovery = requestedReviewRebaseInfrastructureRecovery
	? stageScienceChallengeReviewRebaseInfrastructureRecovery({
			workspaceRoot: rootDir,
			reviewRebaseManifestPath: args.reviewRebaseManifest,
			verificationSummaryPath: args.repairVerification,
			failedRoot: requestedReviewRebaseInfrastructureRecovery.failedRoot,
			successorRoot: requestedReviewRebaseInfrastructureRecovery.recoveryRoot,
			existingDefinitions: existingChallengeDefinitions,
			dryRun: args.dryRun
		})
	: null;
if (reviewRebaseInfrastructureRecovery) {
	requireMatchingReviewRebaseInfrastructureRecovery();
}
const reviewRebaseChildRegistrationOptions = buildReviewRebaseChildRegistrationOptions();
let reviewRebaseChildRegistration =
	reviewRebaseInfrastructureRecovery?.registration ??
	reviewRebaseInfrastructureRecovery?.state?.source?.registration ??
	null;
if (verificationRepairAuthority && !reviewRebaseInfrastructureRecovery) {
	requireFreshReviewRebaseRepairObjective();
}
const requestedShardIds = selectShardIds(plan.rows, args.shards);
const repairableChallengeIds = verificationRepairAuthority
	? new Set(verificationRepairAuthority.mutableChallengeIds)
	: new Set(
			plan.rows
				.filter((row) => verificationReviewById.get(row.id)?.accepted === false)
				.map((row) => row.id)
		);
const rejectedShardIds = new Set(
	plan.rows.filter((row) => repairableChallengeIds.has(row.id)).map((row) => row.shard)
);
if (verificationRepair && args.shards.some((shardId) => !rejectedShardIds.has(shardId))) {
	throw new Error(
		'Every explicitly selected repair shard must contain a frozen mutable challenge.'
	);
}
const selectedShardIds = verificationRepair
	? requestedShardIds.filter((shardId) => rejectedShardIds.has(shardId))
	: requestedShardIds;
if (verificationRepair && selectedShardIds.length === 0) {
	throw new Error('The supplied verification summary contains no mutable challenges to repair.');
}
if (reviewRebaseInfrastructureRecovery) {
	requireExactReviewRebaseInfrastructureRecoveryCohort(selectedShardIds);
}
if (verificationRepair) {
	requireCompleteVerificationRepairCohort({
		selectedShardIds,
		rejectedShardIds: [...rejectedShardIds]
	});
}
if (reviewRebaseChildRegistrationOptions) {
	reviewRebaseChildRegistration = inspectScienceChallengeReviewRebaseChildRegistration(
		reviewRebaseChildRegistrationOptions
	);
}
if (reviewRebaseChildRegistrationOptions && !args.dryRun) {
	reviewRebaseChildRegistration = reserveScienceChallengeReviewRebaseChild(
		reviewRebaseChildRegistrationOptions
	);
}
if (verificationRepairParent && !outputRootInitiallyExists && !args.dryRun) {
	seedReviewRebaseRepairRoot({
		repairBase: verificationRepairBase,
		parentBinding: verificationRepairParent
	});
}
const multipartSalvageSourceApprovalByShard = readScienceChallengeMultipartSalvageSourceApprovals({
	paths: args.multipartSalvageSourceApprovals,
	rootDir,
	selectedShardIds,
	rejectedShardIds: [...rejectedShardIds]
});
const consumedMultipartSalvageApprovalShardIds = new Set();
const verificationRepairCohortState = verificationRepair
	? readVerificationRepairCohortState({
			outputRoot,
			repairSha256: verificationRepairSha256
		}).state
	: null;
prevalidateMultipartSalvageSourceApprovals();
if (verificationRepairExecutionIdentity && !args.dryRun && !reviewRebaseInfrastructureRecovery) {
	initializeVerificationRepairExecutionLedger({
		ledgerRoot: repairExecutionLedgerRoot,
		identity: verificationRepairExecutionIdentity
	});
	if (reviewRebaseChildRegistrationOptions) {
		bindVerificationRepairExecutionMarker({
			workspaceRoot: rootDir,
			ledgerRoot: repairExecutionLedgerRoot,
			identity: verificationRepairExecutionIdentity,
			outputRoot
		});
	}
}
if (reviewRebaseChildRegistrationOptions && !args.dryRun) {
	reviewRebaseChildRegistration = commitScienceChallengeReviewRebaseChild(
		reviewRebaseChildRegistrationOptions
	);
}
if (
	verificationRepairSha256 &&
	existsSync(outputRoot) &&
	!args.dryRun
) {
	recoverVerificationRepairPublication({
		outputRoot,
		repairSha256: verificationRepairSha256
	});
}
const verificationRepairSelectedCandidateByShard = new Map();
const generationRequiresModelCall = reviewRebaseInfrastructureRecovery
	? selectedShardIds.some((shardId) =>
			reviewRebaseInfrastructureRecoveryShardRequiresModelCall(shardId)
		)
	: !verificationRepair ||
		selectedShardIds.some(
			(shardId) =>
				!inspectVerificationRepairAttempts({
					shardDir: path.join(outputRoot, 'shards', shardId),
					repairSha256: verificationRepairSha256,
					maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
				}).exhausted
		);
if (
	!args.dryRun &&
	generationRequiresModelCall &&
	args.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT
) {
	directGenerationPreflight.result = await runScienceChallengeDirectTransportPreflight({
		model: args.model,
		thinkingLevel: args.thinkingLevel,
		timeoutMs: Math.min(args.timeoutMs, 120_000),
		authMode: directAuthMode,
		responseMode: args.directResponseMode
	});
}
if (args.dryRun) {
	const shards = selectedShardIds.map((shardId) =>
		reviewRebaseInfrastructureRecovery
			? planReviewRebaseInfrastructureRecoveryShard(shardId)
			: planDryRunShard(shardId)
	);
	assertScienceChallengeMultipartSalvageApprovalsConsumed({
		approvalByShard: multipartSalvageSourceApprovalByShard,
		consumedShardIds: consumedMultipartSalvageApprovalShardIds
	});
	const dryRunFailed = shards.some((shard) => shard.status === 'refused');
	console.log(
		JSON.stringify(
			{
				status: dryRunFailed ? 'failed' : 'planned',
				planId: plan.planId,
				planSha256: canonicalHash(plan),
				selectedShardCount: shards.length,
				challengeCount: shards.reduce((total, shard) => total + shard.challengeCount, 0),
				model: args.model,
				thinkingLevel: args.thinkingLevel,
				transport: args.transport,
				directResponseMode: args.directResponseMode,
				directPartSize: args.directPartSize,
				verificationRepairSha256,
				verificationRepairAuthority,
				verificationRepairAuthoritySha256,
				verificationRepairParent,
				verificationRepairParentSha256,
				...reviewRebaseSummaryBindings(),
				...reviewRebaseInfrastructureRecoverySummaryBindings(),
				reviewRebaseChildRegistration: summarizeReviewRebaseChildRegistration(
					reviewRebaseChildRegistration
				),
				generationRequiresModelCall,
				shards
			},
			null,
			2
		)
	);
	process.exit(dryRunFailed ? 1 : 0);
}
const gatedGeneration = await runScienceChallengeGenerationBehindPreflight({
	preflight:
		args.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT && generationRequiresModelCall
			? async () => directGenerationPreflight.result
			: async () => ({
					status: 'passed',
					transport: args.transport,
					skipped: true,
					reason: generationRequiresModelCall
						? 'transport-preflight-not-required'
						: 'all selected verification-repair shards are exhausted'
				}),
	generate: async () => {
		mkdirSync(outputRoot, { recursive: true });
		if (!verificationRepair) {
			const queue = selectedShardIds.map((shardId) => async () => generateShard(shardId));
			return await runConcurrent(queue, args.concurrency);
		}
		if (reviewRebaseInfrastructureRecovery) {
			return await runConcurrent(
				selectedShardIds.map((shardId) => async () => {
					const result = await generateReviewRebaseInfrastructureRecoveryShard(shardId);
					rememberSelectedVerificationRepairCandidate(result);
					return result;
				}),
				args.concurrency
			);
		}
		const exhaustedShardIds = [];
		const ordinaryShardIds = [];
		for (const shardId of selectedShardIds) {
			const attemptLedger = inspectVerificationRepairAttempts({
				shardDir: path.join(outputRoot, 'shards', shardId),
				repairSha256: verificationRepairSha256,
				maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
			});
			(attemptLedger.exhausted ? exhaustedShardIds : ordinaryShardIds).push(shardId);
		}
		const resultByShard = new Map();
		const runAndRemember = async (shardId) => {
			const result = await generateShard(shardId);
			resultByShard.set(shardId, result);
			rememberSelectedVerificationRepairCandidate(result);
			return result;
		};
		await runConcurrent(
			ordinaryShardIds.map((shardId) => async () => runAndRemember(shardId)),
			args.concurrency
		);
		// Exhausted recovery runs only after ordinary proposals are known, so a descendant
		// remap's mandatory collection gate sees the exact staged/fallback overlay.
		for (const shardId of exhaustedShardIds) {
			await runAndRemember(shardId);
		}
		return selectedShardIds.map((shardId) => resultByShard.get(shardId));
	}
});
const results = gatedGeneration.result;
assertScienceChallengeMultipartSalvageApprovalsConsumed({
	approvalByShard: multipartSalvageSourceApprovalByShard,
	consumedShardIds: consumedMultipartSalvageApprovalShardIds
});
const reviewPending = results.filter((result) => result.status === 'review-pending');
const failures = results.filter(
	(result) => result.status !== 'passed' && result.status !== 'review-pending'
);
let collectionValidation;
let publication = null;
let effectiveCohort = null;
let successorReviewPending = false;
if (reviewRebaseInfrastructureRecovery && reviewPending.length > 0) {
	throw new Error(
		'Typed review-rebase infrastructure recovery cannot enter another review-pending recovery.'
	);
}
if (verificationRepair && failures.length === 0 && reviewPending.length === 0) {
	const proposals = results.map((result) => result.proposal);
	if (reviewRebaseInfrastructureRecovery) {
		requireExactReviewRebaseInfrastructureRecoveryTerminal(proposals);
	}
	const proposedCandidates = new Map(
		proposals.map((proposal) => [
			proposal.shardId,
			JSON.parse(readFileSync(proposal.candidatePath, 'utf8'))
		])
	);
	collectionValidation = validateAvailableCandidateCollection(proposedCandidates);
	if (collectionValidation.status === 'passed') {
		recordVerificationRepairCollectionPass({
			outputRoot,
			repairSha256: verificationRepairSha256,
			collectionValidation,
			proposals
		});
		if (reviewRebaseInfrastructureRecovery) {
			const staged = stageScienceChallengeEffectiveCohortSuccessor({
				workspaceRoot: rootDir,
				outputRoot,
				repairSha256: verificationRepairSha256,
				objectiveId: verificationRepairExecutionIdentity.objectiveId,
				executionId: verificationRepairExecutionIdentity.executionId,
				reviewSummary: verificationRepair,
				reviewRebaseEvidence: verificationRepairEvidence.reviewRebase,
				verificationRepairAuthority,
				reviewRebaseInfrastructureRecoveryEvidence: reviewRebaseInfrastructureRecovery,
				proposals,
				validateCollectionCandidate: validateEffectiveCandidateCollection
			});
			collectionValidation = staged.collectionValidation;
			successorReviewPending = true;
			effectiveCohort = {
				manifestPath: path.relative(rootDir, staged.manifestPath),
				manifestSha256: canonicalHash(staged.manifest),
				parentKind: staged.manifest.parent.kind,
				parentManifestSha256: staged.manifest.parent.manifestSha256,
				parentChainSha256: canonicalHash(staged.manifest.parentChain),
				candidateSetSha256: staged.candidateSetSha256,
				candidateCount: staged.manifest.candidateCount,
				basePlanSha256: staged.manifest.basePlanSha256,
				effectivePlanSha256: staged.manifest.effectivePlanSha256,
				remapManifestSetSha256: staged.manifest.remapManifestSetSha256,
				difficultyAdjustmentManifestSetSha256:
					staged.manifest.difficultyAdjustmentManifestSetSha256,
				difficultyAdjustmentCount: staged.manifest.difficultyAdjustmentCount,
				infrastructureRecoverySha256: canonicalHash(staged.manifest.infrastructureRecovery)
			};
			publication = publishVerificationRepairCohort({
				outputRoot,
				repairSha256: verificationRepairSha256,
				proposals
			});
		} else if (
			verificationRepairEvidence.reviewRebase &&
			!verificationRepairPredecessorEffectiveCohort
		) {
			publication = publishVerificationRepairCohort({
				outputRoot,
				repairSha256: verificationRepairSha256,
				proposals
			});
			const staged = stageScienceChallengeEffectiveCohortSuccessor({
				workspaceRoot: rootDir,
				outputRoot,
				repairSha256: verificationRepairSha256,
				objectiveId: verificationRepairExecutionIdentity.objectiveId,
				executionId: verificationRepairExecutionIdentity.executionId,
				reviewSummary: verificationRepair,
				reviewRebaseEvidence: verificationRepairEvidence.reviewRebase,
				verificationRepairAuthority,
				proposals,
				validateCollectionCandidate: validateEffectiveCandidateCollection
			});
			collectionValidation = staged.collectionValidation;
			successorReviewPending = true;
			effectiveCohort = {
				manifestPath: path.relative(rootDir, staged.manifestPath),
				manifestSha256: canonicalHash(staged.manifest),
				parentKind: staged.manifest.parent.kind,
				parentManifestSha256: staged.manifest.parent.manifestSha256,
				parentChainSha256: canonicalHash(staged.manifest.parentChain),
				candidateSetSha256: staged.candidateSetSha256,
				candidateCount: staged.manifest.candidateCount,
				basePlanSha256: staged.manifest.basePlanSha256,
				effectivePlanSha256: staged.manifest.effectivePlanSha256,
				remapManifestSetSha256: staged.manifest.remapManifestSetSha256,
				difficultyAdjustmentManifestSetSha256:
					staged.manifest.difficultyAdjustmentManifestSetSha256,
				difficultyAdjustmentCount: staged.manifest.difficultyAdjustmentCount
			};
		} else if (verificationRepairPredecessorEffectiveCohort) {
			const staged = stageScienceChallengeEffectiveCohortSuccessor({
				workspaceRoot: rootDir,
				outputRoot,
				repairSha256: verificationRepairSha256,
				objectiveId: verificationRepairExecutionIdentity.objectiveId,
				executionId: verificationRepairExecutionIdentity.executionId,
				reviewSummary: verificationRepair,
				reviewEffectiveCohortManifestSha256:
					verificationRepairBase.assignmentIndex.effectiveCohortManifestSha256,
				predecessor: verificationRepairPredecessorEffectiveCohort,
				reviewRebaseEvidence: verificationRepairEvidence.reviewRebase,
				proposals,
				validateCollectionCandidate: validateEffectiveCandidateCollection
			});
			collectionValidation = staged.collectionValidation;
			successorReviewPending = true;
			effectiveCohort = {
				manifestPath: path.relative(rootDir, staged.manifestPath),
				manifestSha256: canonicalHash(staged.manifest),
				predecessorManifestSha256: canonicalHash(
					verificationRepairPredecessorEffectiveCohort.manifest
				),
				...(staged.manifest.parentChain
					? { parentChainSha256: canonicalHash(staged.manifest.parentChain) }
					: {}),
				candidateSetSha256: staged.candidateSetSha256,
				candidateCount: staged.manifest.candidateCount,
				basePlanSha256: staged.manifest.basePlanSha256,
				effectivePlanSha256: staged.manifest.effectivePlanSha256,
				remapManifestSetSha256: staged.manifest.remapManifestSetSha256,
				difficultyAdjustmentManifestSetSha256:
					staged.manifest.difficultyAdjustmentManifestSetSha256,
				difficultyAdjustmentCount: staged.manifest.difficultyAdjustmentCount
			};
		} else {
			publication = publishVerificationRepairCohort({
				outputRoot,
				repairSha256: verificationRepairSha256,
				proposals
			});
		}
	} else if (!reviewRebaseInfrastructureRecovery) {
		recordVerificationRepairCollectionFailure({
			outputRoot,
			repairSha256: verificationRepairSha256,
			collectionValidation,
			verificationRepairAuthority,
			proposals
		});
	}
} else if (verificationRepair && failures.length === 0) {
	const recoveryResults = results.filter((result) => result.status === 'review-pending');
	const recoveryProjection = projectScienceChallengeEffectiveRecoveryPlan(
		plan,
		recoveryResults.map((result) => {
			const recoveryDirectory = path.resolve(rootDir, result.recoveryDirectory);
			return {
				manifest: JSON.parse(readFileSync(path.join(recoveryDirectory, 'manifest.json'), 'utf8')),
				candidate: JSON.parse(readFileSync(path.join(recoveryDirectory, 'candidate.json'), 'utf8')),
				priorCandidate: JSON.parse(
					readFileSync(path.join(recoveryDirectory, 'prior-candidate.json'), 'utf8')
				)
			};
		})
	);
	if (recoveryProjection.status !== 'passed') {
		throw new Error(
			`Review-pending effective-plan composition failed:\n${recoveryProjection.issues.join('\n')}`
		);
	}
	const effectivePlan = recoveryProjection.effectivePlan;
	const ordinaryProposals = results
		.filter((result) => result.status === 'passed' && result.proposal)
		.map((result) => result.proposal);
	const effectiveOverlay = evaluateScienceChallengeVerificationRepairOverlay({
		priorCandidateByShard: verificationRepairPriorCandidateByShard,
		selectedCandidateByShard: verificationRepairSelectedCandidateByShard,
		proposals: ordinaryProposals,
		verificationRepairAuthority,
		lastAttemptByShard: exactVerificationRepairLastAttemptByShard(selectedShardIds),
		maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
		validateCandidateBatches: (candidateBatches) =>
			validateAvailableCandidateCollection(candidateBatches)
	});
	collectionValidation = effectiveOverlay.collectionValidation;
	if (collectionValidation.status === 'failed') {
		if (!effectiveOverlay.canRecordCollectionFailure) {
			throw new Error(
				`Effective-cohort collection failure has no bounded ordinary-repair target:\n${(
					collectionValidation.issues ?? []
				).join('\n')}`
			);
		}
		const targetShardIds = new Set(effectiveOverlay.repairTargetShardIds);
		recordVerificationRepairCollectionFailure({
			outputRoot,
			repairSha256: verificationRepairSha256,
			collectionValidation,
			verificationRepairAuthority,
			proposals: ordinaryProposals.filter((proposal) => targetShardIds.has(proposal.shardId))
		});
	} else {
		const staged = stageScienceChallengeEffectiveCohort({
			workspaceRoot: rootDir,
			outputRoot,
			repairSha256: verificationRepairSha256,
			objectiveId: verificationRepairExecutionIdentity.objectiveId,
			executionId: verificationRepairExecutionIdentity.executionId,
			firstReviewSha256: verificationRepairSha256,
			basePlan: plan,
			effectivePlan,
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			curriculumCatalogSha256: canonicalHash(curriculumCatalog),
			shardSelections: buildEffectiveCohortSelections({
				results,
				effectivePlan
			}),
			validateCollectionCandidate: validateEffectiveCandidateCollection
		});
		if (staged.status !== 'passed') {
			throw new Error(`Effective-cohort staging failed:\n${(staged.issues ?? []).join('\n')}`);
		}
		collectionValidation = staged.collectionValidation;
		effectiveCohort = {
			manifestPath: path.relative(rootDir, staged.manifestPath),
			manifestSha256: canonicalHash(staged.manifest),
			candidateSetSha256: staged.candidateSetSha256,
			candidateCount: staged.manifest.candidateCount,
			basePlanSha256: staged.manifest.basePlanSha256,
			effectivePlanSha256: staged.manifest.effectivePlanSha256,
			remapManifestSetSha256: staged.manifest.remapManifestSetSha256,
			difficultyAdjustmentManifestSetSha256: staged.manifest.difficultyAdjustmentManifestSetSha256,
			difficultyAdjustmentCount: staged.manifest.difficultyAdjustmentCount
		};
	}
} else if (reviewRebaseInfrastructureRecovery) {
	const proposals = results
		.filter((result) => result.status === 'passed' && result.proposal)
		.map((result) => result.proposal);
	const proposedCandidates = new Map(
		proposals.map((proposal) => [
			proposal.shardId,
			JSON.parse(readFileSync(proposal.candidatePath, 'utf8'))
		])
	);
	// Typed infrastructure recovery owns its logical and invocation ceilings. A
	// partial run must leave the exact B0 top-level cohort and ordinary repair
	// transaction ledgers untouched; this read-only projection is summary evidence
	// only and is never eligible for publication.
	collectionValidation = validateAvailableCandidateCollection(proposedCandidates);
} else if (verificationRepair) {
	const proposals = results
		.filter((result) => result.status === 'passed' && result.proposal)
		.map((result) => result.proposal);
	const overlay = evaluateScienceChallengeVerificationRepairOverlay({
		priorCandidateByShard: verificationRepairPriorCandidateByShard,
		selectedCandidateByShard: verificationRepairSelectedCandidateByShard,
		proposals,
		verificationRepairAuthority,
		lastAttemptByShard: exactVerificationRepairLastAttemptByShard(selectedShardIds),
		maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
		validateCandidateBatches: (candidateBatches) =>
			validateAvailableCandidateCollection(candidateBatches)
	});
	collectionValidation = overlay.collectionValidation;
	if (overlay.canRecordCollectionFailure) {
		recordVerificationRepairCollectionFailure({
			outputRoot,
			repairSha256: verificationRepairSha256,
			collectionValidation,
			verificationRepairAuthority,
			proposals
		});
	}
} else {
	collectionValidation = validateAvailableCandidateCollection();
}
const summary = {
	schemaVersion: 'science-challenge-generation-summary/v1',
	promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
	model: args.model,
	thinkingLevel: args.thinkingLevel,
	transport: args.transport,
	directResponseMode: args.directResponseMode,
	directPartSize: args.directPartSize,
	planId: plan.planId,
	planSha256: canonicalHash(plan),
	sourceSnapshotSha256: canonicalHash(sourceSnapshot),
	curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
	verificationRepairSha256,
	verificationRepairAuthority,
	verificationRepairAuthoritySha256,
	verificationRepairParent,
	verificationRepairParentSha256,
	...reviewRebaseSummaryBindings(),
	...reviewRebaseInfrastructureRecoverySummaryBindings(),
	verificationRepairExecutionIdentity,
	reviewRebaseChildRegistration: summarizeReviewRebaseChildRegistration(
		reviewRebaseChildRegistration
	),
	verificationRepairExecutionLedger:
		repairExecutionLedgerRoot === null ? null : path.relative(rootDir, repairExecutionLedgerRoot),
	preflight: directGenerationPreflight.result,
	startedAt: new Date().toISOString(),
	selectedShards: selectedShardIds,
	results,
	reviewPendingCount: reviewPending.length + (successorReviewPending ? 1 : 0),
	collectionValidation,
	publication,
	effectiveCohort,
	status:
		failures.length || collectionValidation.status !== 'passed'
			? 'failed'
			: reviewPending.length || successorReviewPending
				? 'review-pending'
				: 'passed'
};
const generationSummaryName = verificationRepair
	? `verification-repair-${verificationRepairSha256.slice(0, 12)}-summary.json`
	: 'generation-summary.json';
const persistGenerationSummary = !reviewRebaseInfrastructureRecovery;
if (persistGenerationSummary) {
	writeFileSync(path.join(outputRoot, generationSummaryName), `${stableStringify(summary)}\n`);
}
console.log(JSON.stringify(summary, null, 2));
if (failures.length || collectionValidation.status !== 'passed') process.exit(1);

function reviewRebaseBindingsFromReplay(reviewRebase) {
	const remediations = structuredClone(reviewRebase.manifest.collectionRemediations);
	const targetIds = [
		...new Set(remediations.map((remediation) => remediation.preferredChallengeId))
	].sort();
	return {
		reviewRebaseManifestSha256: canonicalHash(reviewRebase.manifest),
		reviewRebaseId: reviewRebase.manifest.rebaseId,
		reviewRebaseCandidateSetSha256: reviewRebase.manifest.candidateSetSha256,
		reviewRebaseCollectionValidationSha256: reviewRebase.manifest.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256:
			reviewRebase.manifest.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediations: remediations,
		reviewRebaseCollectionRemediationTargetIds: targetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
	};
}

function reviewRebaseSummaryBindings() {
	return verificationRepairBase?.reviewRebase && verificationRepairAuthority
		? {
				...reviewRebaseBindingsFromReplay(verificationRepairBase.reviewRebase),
				verificationRepairMutableChallengeIds: structuredClone(
					verificationRepairAuthority.mutableChallengeIds
				),
				verificationRepairMutableChallengeSetSha256:
					verificationRepairAuthority.mutableChallengeSetSha256
			}
		: {};
}

function buildReviewRebaseChildRegistrationOptions({ childOutputRoot = outputRoot } = {}) {
	if (
		!verificationRepairBase?.reviewRebase ||
		verificationRepairPredecessorEffectiveCohort ||
		reviewRebaseInfrastructureRecovery
	) {
		return null;
	}
	if (
		!verificationRepairParent ||
		!verificationRepairAuthoritySha256 ||
		!verificationRepairExecutionIdentity ||
		!verificationRepair
	) {
		throw new Error('Direct B0/V1 repair is missing its child-registration bindings.');
	}
	const reviewRebase = verificationRepairBase.reviewRebase;
	const candidateById = new Map();
	for (const batch of reviewRebase.candidateBatches.values()) {
		for (const candidate of batch.challenges ?? []) {
			const id = candidate?.definition?.id;
			if (typeof id !== 'string' || candidateById.has(id)) {
				throw new Error('Direct B0/V1 child registration has malformed candidate membership.');
			}
			candidateById.set(id, candidate);
		}
	}
	const b0Candidates = reviewRebase.plan.rows.map((row) => {
		const candidate = candidateById.get(row.id);
		if (!candidate) {
			throw new Error(`Direct B0/V1 child registration is missing ${row.id}.`);
		}
		return candidate;
	});
	return {
		repairKind: SCIENCE_CHALLENGE_REVIEW_REBASE_DIRECT_REPAIR_KIND,
		workspaceRoot: rootDir,
		evidence: {
			reviewRebaseManifest: reviewRebase.manifest,
			reviewRebasePlan: reviewRebase.plan,
			basePlan,
			b0Candidates,
			sourceSnapshot,
			curriculumEvidence,
			verificationSummary: verificationRepair,
			verificationRepairAuthority,
			executionIdentity: verificationRepairExecutionIdentity,
			outputRoot: childOutputRoot
		}
	};
}

function summarizeReviewRebaseChildRegistration(registration) {
	if (!registration) return null;
	return {
		status: registration.status,
		action: registration.action,
		...(registration.authorityLabel ? { authorityLabel: registration.authorityLabel } : {}),
		...(registration.lineageKeySha256 ? { lineageKeySha256: registration.lineageKeySha256 } : {}),
		...(registration.reservationSha256
			? { reservationSha256: registration.reservationSha256 }
			: {}),
		...(registration.commitSha256 ? { commitSha256: registration.commitSha256 } : {})
	};
}

function requireMatchingReviewRebaseInfrastructureRecovery() {
	const recovery = reviewRebaseInfrastructureRecovery;
	const state = recovery?.state;
	const manifest = recovery?.manifest;
	if (
		!state ||
		!(state.shards instanceof Map) ||
		!manifest ||
		!['planned', 'passed'].includes(recovery.status) ||
		canonicalHash(requestedReviewRebaseInfrastructureRecovery.manifest) !==
			canonicalHash(manifest) ||
		recovery.manifestSha256 !== canonicalHash(manifest) ||
		recovery.recoveryExecutionId !== manifest.recoveryExecutionId ||
		state.recoveryExecutionId !== manifest.recoveryExecutionId ||
		state.manifestSha256 !== canonicalHash(manifest) ||
		path.resolve(state.successorRoot) !==
			requestedReviewRebaseInfrastructureRecovery.recoveryRoot ||
		canonicalHash(manifest.originalExecutionIdentity) !==
			canonicalHash(verificationRepairExecutionIdentity) ||
		manifest.verification?.summarySha256 !== verificationRepairSha256 ||
		manifest.reviewRebase?.manifestSha256 !==
			canonicalHash(verificationRepairBase.reviewRebase.manifest) ||
		manifest.verificationRepairAuthoritySha256 !== verificationRepairAuthoritySha256 ||
		canonicalHash(manifest.verificationRepairAuthority) !==
			canonicalHash(verificationRepairAuthority) ||
		manifest.limits?.logicalContentAttemptsPerShard !==
			SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS ||
		manifest.limits?.infrastructureInvocationsPerLogicalSlot !==
			SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT
	) {
		throw new Error(
			'Typed review-rebase infrastructure recovery differs from the exact B0/V1 objective, authority, policy or seeded successor.'
		);
	}
}

function reviewRebaseInfrastructureRecoverySummaryBindings() {
	if (!reviewRebaseInfrastructureRecovery) return {};
	return {
		reviewRebaseInfrastructureRecoveryManifestSha256:
			reviewRebaseInfrastructureRecovery.manifestSha256,
		reviewRebaseInfrastructureRecoveryId: reviewRebaseInfrastructureRecovery.manifest.recoveryId,
		reviewRebaseInfrastructureRecoveryExecutionId:
			reviewRebaseInfrastructureRecovery.recoveryExecutionId,
		reviewRebaseInfrastructureRecoveryManifestPath: path.relative(
			rootDir,
			requestedReviewRebaseInfrastructureRecovery.manifestPath
		),
		reviewRebaseInfrastructureRecoveryPreservedProposalSetSha256:
			reviewRebaseInfrastructureRecovery.manifest.preservedProposalSetSha256
	};
}

function requireExactReviewRebaseInfrastructureRecoveryCohort(selectedShardIds) {
	const state = reviewRebaseInfrastructureRecovery.state;
	const shardIds = [...new Set(plan.rows.map((row) => row.shard))].sort();
	const selected = [...selectedShardIds].sort();
	const mutable = [...state.shards.values()]
		.filter(
			(shard) =>
				shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL ||
				shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED
		)
		.map((shard) => shard.shardId)
		.sort();
	const passed = [...state.shards.values()].filter(
		(shard) => shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL
	);
	const unresolved = [...state.shards.values()].filter(
		(shard) => shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED
	);
	const frozen = [...state.shards.values()].filter(
		(shard) => shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE
	);
	const invalidShardState = [...state.shards.values()].some((shard) => {
		const mutableByAuthority = rejectedShardIds.has(shard.shardId);
		const consumed = shard.sourceAttempts.filter(
			(attempt) =>
				attempt.classification !== SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT
		).length;
		const passedProposal =
			shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL;
		const repairRequired =
			shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED;
		const frozenNonmutable =
			shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE;
		return (
			shard.mutable !== mutableByAuthority ||
			(!mutableByAuthority && !frozenNonmutable) ||
			(mutableByAuthority && frozenNonmutable) ||
			shard.consumedLogicalContentAttempts !== consumed ||
			repairRequired !== (mutableByAuthority && !passedProposal) ||
			Boolean(shard.proposal) !== passedProposal ||
			shard.remainingLogicalContentAttempts !==
				(repairRequired
					? SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS - consumed
					: 0) ||
			shard.nextLogicalContentOrdinal !== (repairRequired ? consumed + 1 : null)
		);
	});
	const counts = reviewRebaseInfrastructureRecovery.manifest.counts;
	if (
		state.shards.size !== shardIds.length ||
		canonicalHash([...state.shards.keys()].sort()) !== canonicalHash(shardIds) ||
		canonicalHash(selected) !== canonicalHash(mutable) ||
		passed.length + unresolved.length + frozen.length !== shardIds.length ||
		passed.length !== reviewRebaseInfrastructureRecovery.manifest.recoveryProposals.length ||
		counts?.shardCount !== shardIds.length ||
		counts?.[SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL] !== passed.length ||
		counts?.[SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED] !==
			unresolved.length ||
		counts?.[SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE] !== frozen.length ||
		invalidShardState
	) {
		throw new Error(
			'Typed review-rebase infrastructure recovery does not match the current plan, authority, status counts, or authenticated logical ordinals.'
		);
	}
}

function requireExactReviewRebaseInfrastructureRecoveryTerminal(proposals) {
	const first = inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
		evidence: reviewRebaseInfrastructureRecovery,
		referenceRoot: rootDir
	});
	const replay = inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
		evidence: reviewRebaseInfrastructureRecovery,
		referenceRoot: rootDir
	});
	const preserved = first.finalProposals.filter(
		(proposal) => proposal.origin === 'preserved-source-proposal'
	);
	const recovered = first.finalProposals.filter(
		(proposal) => proposal.origin === 'recovery-invocation-proposal'
	);
	const expectedMutableShardIds = [...reviewRebaseInfrastructureRecovery.state.shards.values()]
		.filter((shard) => shard.mutable)
		.map((shard) => shard.shardId)
		.sort();
	const expectedPreservedShardIds = [...reviewRebaseInfrastructureRecovery.state.shards.values()]
		.filter(
			(shard) => shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL
		)
		.map((shard) => shard.shardId)
		.sort();
	const expectedFrozenShardIds = [...reviewRebaseInfrastructureRecovery.state.shards.values()]
		.filter(
			(shard) => shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE
		)
		.map((shard) => shard.shardId)
		.sort();
	const expectedRecoveredShardIds = expectedMutableShardIds.filter(
		(shardId) => !expectedPreservedShardIds.includes(shardId)
	);
	const proposalByShard = new Map(proposals.map((proposal) => [proposal.shardId, proposal]));
	const terminalMatchesGenerator = first.finalProposals.every((terminal) => {
		const proposal = proposalByShard.get(terminal.shardId);
		return (
			proposal &&
			proposal.attempt === terminal.logicalContentOrdinal &&
			proposal.candidateSha256 === terminal.candidateSha256 &&
			proposal.validationSha256 === terminal.validationSha256
		);
	});
	if (
		first.status !== 'passed' ||
		replay.status !== 'passed' ||
		first.pendingShardIds.length !== 0 ||
		first.finalProposals.length !== expectedMutableShardIds.length ||
		proposals.length !== expectedMutableShardIds.length ||
		proposalByShard.size !== expectedMutableShardIds.length ||
		!terminalMatchesGenerator ||
		canonicalHash(first.finalProposals.map((proposal) => proposal.shardId).sort()) !==
			canonicalHash(expectedMutableShardIds) ||
		canonicalHash([...first.frozenShardIds].sort()) !== canonicalHash(expectedFrozenShardIds) ||
		canonicalHash(preserved.map((proposal) => proposal.shardId).sort()) !==
			canonicalHash(expectedPreservedShardIds) ||
		canonicalHash(recovered.map((proposal) => proposal.shardId).sort()) !==
			canonicalHash(expectedRecoveredShardIds) ||
		first.logicalLedgerSha256 !== replay.logicalLedgerSha256 ||
		first.finalProposalSetSha256 !== replay.finalProposalSetSha256 ||
		canonicalHash(first.finalProposals) !== canonicalHash(replay.finalProposals)
	) {
		throw new Error(
			'Typed review-rebase infrastructure recovery is not replay-stable for the current mutable and frozen shard sets.'
		);
	}
	return first;
}

function reviewRebaseInfrastructureRecoveryShardRequiresModelCall(shardId) {
	const shard = reviewRebaseInfrastructureRecovery.state.shards.get(shardId);
	if (!shard || shard.status !== SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED) {
		return false;
	}
	const invocations = inspectScienceChallengeReviewRebaseRecoveryInvocations({
		state: reviewRebaseInfrastructureRecovery.state,
		shardId
	});
	return Boolean(
		!invocations.closedByPassedProposal &&
		!invocations.infrastructureSlotExhausted &&
		invocations.nextLogicalContentOrdinal !== null &&
		invocations.nextLogicalContentOrdinal <=
			SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS
	);
}

function buildReviewRebaseRepairParentBinding({
	repairBase,
	verificationSummary,
	verificationSummaryPath,
	authority
}) {
	const reviewRebase = repairBase?.reviewRebase;
	if (!reviewRebase || !authority) {
		throw new Error('Review-rebase repair parent binding requires replay and mutation authority.');
	}
	const assignmentIndexPath = repairBase.assignmentIndexPath;
	const assignmentIndex = repairBase.assignmentIndex;
	if (!assignmentIndexPath || !assignmentIndex) {
		throw new Error('Review-rebase repair parent binding requires the fresh assignment index.');
	}
	const sourceOutputs = reviewRebase.manifest.evidence.outputs.shards
		.map((record) => ({
			shardId: record.shardId,
			candidate: structuredClone(record.candidate),
			validation: structuredClone(record.validation)
		}))
		.sort((left, right) => left.shardId.localeCompare(right.shardId));
	for (const output of sourceOutputs) {
		const candidate = reviewRebase.candidateBatches.get(output.shardId);
		const validation = reviewRebase.outputValidations.get(output.shardId);
		if (
			!candidate ||
			!validation ||
			output.candidate.canonicalSha256 !== canonicalHash(candidate) ||
			output.validation.canonicalSha256 !== canonicalHash(validation)
		) {
			throw new Error(`Review-rebase source output binding is stale for ${output.shardId}.`);
		}
	}
	return {
		schemaVersion: 'science-challenge-review-rebase-repair-parent/v1',
		reviewRebaseManifestPath: reviewRebase.manifestPathRelative,
		reviewRebaseManifestSha256: canonicalHash(reviewRebase.manifest),
		reviewRebaseId: reviewRebase.manifest.rebaseId,
		basePlanSha256: canonicalHash(basePlan),
		planSha256: canonicalHash(reviewRebase.plan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: reviewRebase.manifest.candidateSetSha256,
		collectionValidationSha256: reviewRebase.manifest.collectionValidationSha256,
		collectionRemediationSetSha256: reviewRebase.manifest.collectionRemediationSetSha256,
		collectionRemediations: structuredClone(reviewRebase.manifest.collectionRemediations),
		collectionRemediationTargetIds: structuredClone(authority.collectionRemediationTargetIds),
		collectionRemediationTargetSetSha256: authority.collectionRemediationTargetSetSha256,
		verificationSummaryPath: repositoryRelativePath(
			verificationSummaryPath,
			'fresh verification summary'
		),
		verificationSummarySha256: canonicalHash(verificationSummary),
		verificationAssignmentIndexPath: repositoryRelativePath(
			assignmentIndexPath,
			'fresh verification assignment index'
		),
		verificationAssignmentIndexSha256: canonicalHash(assignmentIndex),
		verificationRepairAuthority: structuredClone(authority),
		verificationRepairAuthoritySha256: canonicalHash(authority),
		mutableChallengeIds: structuredClone(authority.mutableChallengeIds),
		mutableChallengeSetSha256: authority.mutableChallengeSetSha256,
		sourceOutputs,
		sourceOutputSetSha256: canonicalHash(sourceOutputs)
	};
}

function requireMatchingReviewRebaseRepairParentBinding(expected) {
	const bindingPath = path.join(outputRoot, 'verification-repair-parent.json');
	if (!existsSync(bindingPath)) {
		throw new Error(
			'Existing review-rebase repair root has no immutable verification-repair-parent.json binding.'
		);
	}
	let actual;
	const actualBytes = readFileSync(bindingPath);
	try {
		actual = JSON.parse(actualBytes.toString('utf8'));
	} catch (error) {
		throw new Error(
			`Review-rebase repair parent binding is invalid JSON: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
	if (
		canonicalHash(actual) !== canonicalHash(expected) ||
		!actualBytes.equals(Buffer.from(`${stableStringify(expected)}\n`))
	) {
		throw new Error(
			'Existing review-rebase repair root belongs to another immutable parent or repair objective.'
		);
	}
}

function seedReviewRebaseRepairRoot({ repairBase, parentBinding }) {
	const reviewRebase = repairBase.reviewRebase;
	if (!reviewRebase || existsSync(outputRoot)) {
		throw new Error('Review-rebase repair seeding requires an absent separate output root.');
	}
	const parentDirectory = path.dirname(outputRoot);
	mkdirSync(parentDirectory, { recursive: true });
	const temporary = mkdtempSync(
		path.join(parentDirectory, `.${path.basename(outputRoot)}.review-rebase-seed-`)
	);
	try {
		mkdirSync(path.join(temporary, 'shards'), { recursive: true });
		const sourceOutputByShard = new Map(
			parentBinding.sourceOutputs.map((output) => [output.shardId, output])
		);
		for (const shardId of [...reviewRebase.candidateBatches.keys()].sort()) {
			const shardDirectory = path.join(temporary, 'shards', shardId);
			mkdirSync(shardDirectory, { recursive: true });
			const candidateBytes = `${stableStringify(reviewRebase.candidateBatches.get(shardId))}\n`;
			const validationBytes = `${stableStringify(reviewRebase.outputValidations.get(shardId))}\n`;
			const sourceOutput = sourceOutputByShard.get(shardId);
			if (
				!sourceOutput ||
				sourceOutput.candidate.fileSha256 !== sha256(candidateBytes) ||
				sourceOutput.validation.fileSha256 !== sha256(validationBytes)
			) {
				throw new Error(`Review-rebase source output byte binding is stale for ${shardId}.`);
			}
			writeFileSync(path.join(shardDirectory, 'candidate.json'), candidateBytes, { flag: 'wx' });
			writeFileSync(path.join(shardDirectory, 'validation.json'), validationBytes, { flag: 'wx' });
		}
		writeFileSync(
			path.join(temporary, 'verification-repair-parent.json'),
			`${stableStringify(parentBinding)}\n`,
			{ flag: 'wx' }
		);
		if (existsSync(outputRoot)) {
			throw new Error('Review-rebase repair output root appeared during atomic seeding.');
		}
		renameSync(temporary, outputRoot);
	} catch (error) {
		if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
		throw error;
	}
	requireMatchingReviewRebaseRepairParentBinding(parentBinding);
}

function requireFreshReviewRebaseRepairObjective() {
	const parent = verificationRepairBase.reviewRebase.manifest.parent;
	if (
		verificationRepairExecutionIdentity.objectiveId === parent.objectiveId ||
		verificationRepairExecutionIdentity.executionId === parent.executionId
	) {
		throw new Error('Fresh review-rebase repair must use a new objective and execution identity.');
	}
	if (!outputRootInitiallyExists) {
		for (const shardId of [
			...new Set(
				plan.rows
					.filter((row) => verificationRepairAuthority.mutableChallengeIds.includes(row.id))
					.map((row) => row.shard)
			)
		].sort()) {
			const globalAttempts = inspectVerificationRepairExecutionAttempts({
				ledgerRoot: repairExecutionLedgerRoot,
				identity: verificationRepairExecutionIdentity,
				shardId
			});
			if (globalAttempts.initialized || globalAttempts.attempts.length > 0) {
				throw new Error(
					'Fresh review-rebase repair cannot import or reset an existing workspace attempt ledger.'
				);
			}
		}
	}
}

function repositoryRelativePath(filePath, label) {
	const relative = path.relative(rootDir, path.resolve(filePath)).split(path.sep).join('/');
	if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
		throw new Error(`${label} must remain inside the repository root.`);
	}
	return relative;
}

function planReviewRebaseInfrastructureRecoveryShard(shardId) {
	const rows = plan.rows.filter((row) => row.shard === shardId);
	const inputs = rows.map((row, index) => buildAuthoringInput(row, index));
	const priorCandidate = verificationRepairPriorCandidateByShard.get(shardId);
	const prompt = verificationRepairPrompt(inputs, priorCandidate, rows);
	const inputSha256 = verificationRepairInputSha256({ inputs, priorCandidate });
	const shard = reviewRebaseInfrastructureRecovery.state.shards.get(shardId);
	const base = {
		shardId,
		status: 'planned',
		challengeCount: rows.length,
		inputSha256,
		rejectedIds: rows.filter((row) => repairableChallengeIds.has(row.id)).map((row) => row.id),
		promptCharacters: prompt.length,
		directPartSize: args.directPartSize,
		directPartCount: Math.ceil(rows.length / args.directPartSize),
		recoveryExecutionId: reviewRebaseInfrastructureRecovery.recoveryExecutionId,
		recoveryManifestSha256: reviewRebaseInfrastructureRecovery.manifestSha256,
		sourceConsumedLogicalContentAttempts: shard.consumedLogicalContentAttempts,
		sourceRemainingLogicalContentAttempts: remainingScienceChallengeReviewRebaseLogicalSlots(
			reviewRebaseInfrastructureRecovery.state,
			shardId
		),
		sourceNextLogicalContentOrdinal: nextScienceChallengeReviewRebaseLogicalOrdinal(
			reviewRebaseInfrastructureRecovery.state,
			shardId
		)
	};
	const proposal = readReviewRebaseInfrastructureRecoveryProposal(shardId);
	if (proposal) {
		return {
			...base,
			action: 'reuse-review-rebase-infrastructure-recovery-proposal',
			logicalContentOrdinal: proposal.attempt,
			candidateSha256: proposal.candidateSha256,
			modelCallsDuringDryRun: false,
			writesDuringDryRun: false
		};
	}
	const invocations = inspectScienceChallengeReviewRebaseRecoveryInvocations({
		state: reviewRebaseInfrastructureRecovery.state,
		shardId
	});
	if (invocations.openInvocation) {
		return {
			...base,
			action: 'replay-open-review-rebase-infrastructure-invocation',
			logicalContentOrdinal: invocations.openInvocation.claim.logicalContentOrdinal,
			infrastructureInvocationOrdinal:
				invocations.openInvocation.claim.infrastructureInvocationOrdinal,
			modelCallsDuringDryRun: false,
			writesDuringDryRun: false
		};
	}
	if (
		invocations.infrastructureSlotExhausted ||
		invocations.nextLogicalContentOrdinal === null ||
		invocations.nextLogicalContentOrdinal >
			SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS
	) {
		return {
			...base,
			status: 'refused',
			action: 'refuse-exhausted-review-rebase-infrastructure-recovery',
			issues: [
				invocations.infrastructureSlotExhausted
					? `Four infrastructure invocations were exhausted for logical content attempt ${invocations.nextLogicalContentOrdinal}.`
					: 'The original B0/V1 content objective exhausted four logical content attempts.'
			],
			modelCallsDuringDryRun: false,
			writesDuringDryRun: false
		};
	}
	return {
		...base,
		action: 'run-review-rebase-infrastructure-recovery-invocation',
		logicalContentOrdinal: invocations.nextLogicalContentOrdinal,
		infrastructureInvocationOrdinal: invocations.nextInfrastructureInvocationOrdinal,
		remainingLogicalContentAttempts: invocations.remainingLogicalContentAttempts,
		infrastructureInvocationCeiling:
			SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT,
		modelCallsDuringDryRun: false,
		writesDuringDryRun: false
	};
}

function verificationRepairInputSha256({ inputs, priorCandidate }) {
	return canonicalHash({
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		inputs,
		priorCandidateSha256: canonicalHash(priorCandidate),
		verificationSummarySha256: verificationRepairSha256,
		verificationRepairAuthoritySha256
	});
}

function readReviewRebaseInfrastructureRecoveryProposal(shardId) {
	const state = reviewRebaseInfrastructureRecovery.state;
	const shard = state.shards.get(shardId);
	if (!shard) throw new Error(`Recovery state is missing ${shardId}.`);
	let logicalContentOrdinal = shard.consumedLogicalContentAttempts;
	let candidatePath;
	let validationPath;
	let candidateSha256;
	let validationSha256;
	if (shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL) {
		if (!shard.proposal) throw new Error(`${shardId} has no preserved recovery proposal.`);
		candidatePath = path.join(state.successorRoot, shard.proposal.staged.candidatePath);
		validationPath = path.join(state.successorRoot, shard.proposal.staged.validationPath);
		candidateSha256 = shard.proposal.candidateSha256;
		validationSha256 = shard.proposal.validationSha256;
	} else {
		const invocations = inspectScienceChallengeReviewRebaseRecoveryInvocations({
			state,
			shardId
		});
		const terminal = invocations.invocations.find(
			(record) =>
				record.completion?.classification ===
				SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED
		);
		if (!terminal) return null;
		logicalContentOrdinal = terminal.claim.logicalContentOrdinal;
		candidatePath = path.resolve(rootDir, terminal.completion.proposal.candidate.path);
		validationPath = path.resolve(rootDir, terminal.completion.proposal.validation.path);
		candidateSha256 = terminal.completion.proposal.candidateSha256;
		validationSha256 = terminal.completion.proposal.validationSha256;
	}
	if (
		!Number.isInteger(logicalContentOrdinal) ||
		logicalContentOrdinal < 1 ||
		logicalContentOrdinal > SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS
	) {
		throw new Error(`${shardId} proposal has an invalid logical content ordinal.`);
	}
	const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
	const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
	if (
		canonicalHash(candidate) !== candidateSha256 ||
		canonicalHash(validation) !== validationSha256
	) {
		throw new Error(`${shardId} recovery proposal bytes differ from their binding.`);
	}
	const priorCandidate = verificationRepairPriorCandidateByShard.get(shardId);
	const priorValidation = verificationRepairPriorValidationByShard.get(shardId);
	return {
		shardId,
		attempt: logicalContentOrdinal,
		candidatePath: path.relative(rootDir, candidatePath),
		validationPath: path.relative(rootDir, validationPath),
		candidateSha256,
		validationSha256,
		expectedTargetCandidateSha256: canonicalHash(priorCandidate),
		expectedTargetValidationSha256: canonicalHash(priorValidation),
		recoveryExecutionId: state.recoveryExecutionId,
		recoveryManifestSha256: state.manifestSha256
	};
}

async function generateReviewRebaseInfrastructureRecoveryShard(shardId) {
	const rows = plan.rows.filter((row) => row.shard === shardId);
	if (rows.length === 0) return { shardId, status: 'failed', issues: ['No plan rows.'] };
	const inputs = rows.map((row, index) => buildAuthoringInput(row, index));
	const priorCandidate = verificationRepairPriorCandidateByShard.get(shardId);
	const priorValidation = verificationRepairPriorValidationByShard.get(shardId);
	if (!priorCandidate || !priorValidation) {
		throw new Error(`${shardId} has no exact B0/V1 repair baseline.`);
	}
	const inputSha256 = verificationRepairInputSha256({ inputs, priorCandidate });
	const basePrompt = verificationRepairPrompt(inputs, priorCandidate, rows);
	const canonicalParts = buildScienceChallengeAuthoringParts({
		rows,
		inputs,
		partSize: args.directPartSize
	});
	const state = reviewRebaseInfrastructureRecovery.state;

	const maximumStateTransitions =
		SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS *
			SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT *
			2 +
		1;
	for (let transition = 0; transition < maximumStateTransitions; transition += 1) {
		const reusable = readReviewRebaseInfrastructureRecoveryProposal(shardId);
		if (reusable) {
			return {
				shardId,
				status: 'passed',
				action:
					state.shards.get(shardId).status ===
					SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL
						? 'review-rebase-infrastructure-recovery-proposal-reused'
						: 'review-rebase-infrastructure-recovery-resumed',
				attempt: reusable.attempt,
				count: rows.length,
				candidateSha256: reusable.candidateSha256,
				proposal: reusable
			};
		}

		let invocations = inspectScienceChallengeReviewRebaseRecoveryInvocations({
			state,
			shardId
		});
		if (invocations.openInvocation) {
			completeScienceChallengeReviewRebaseRecoveryInvocation({
				state,
				shardId,
				directory: invocations.openInvocation.directory
			});
			continue;
		}
		if (
			invocations.infrastructureSlotExhausted ||
			invocations.nextLogicalContentOrdinal === null ||
			invocations.nextLogicalContentOrdinal >
				SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS
		) {
			return {
				shardId,
				status: 'failed',
				action: 'refuse-exhausted-review-rebase-infrastructure-recovery',
				issues: [
					invocations.infrastructureSlotExhausted
						? `Four infrastructure invocations were exhausted for logical content attempt ${invocations.nextLogicalContentOrdinal}.`
						: 'The original B0/V1 content objective exhausted four logical content attempts.'
				]
			};
		}

		const logicalContentOrdinal = invocations.nextLogicalContentOrdinal;
		const previous = readPreviousReviewRebaseInfrastructureContentOutcome({
			shardId,
			invocations
		});
		if (logicalContentOrdinal > 1 && !previous) {
			throw new Error(
				`${shardId} logical content attempt ${logicalContentOrdinal} has no prior content-bearing outcome.`
			);
		}
		const prompt =
			logicalContentOrdinal === 1
				? basePrompt
				: repairPrompt(basePrompt, previous.candidate, previous.issues, logicalContentOrdinal);
		const previousPartCandidates = new Map(
			canonicalParts.map((part) => [
				part.partId,
				readRecoveryPriorMultipartPartCandidate({
					attemptDirectory: previous?.attemptDirectory ?? null,
					partId: part.partId,
					rowIds: part.rowIds,
					evidenceInventory: previous?.evidenceInventory ?? null
				})
			])
		);
		const multipartParts = buildScienceChallengeMultipartAttemptParts({
			parts: canonicalParts,
			allRowIds: rows.map((row) => row.id),
			existingChallengeDefinitions,
			verificationRepair: true,
			verificationReviews: verificationRepair.reviews,
			verificationRepairAuthority,
			priorCandidate,
			attempt: logicalContentOrdinal,
			previousCandidate: previous?.candidate ?? null,
			previousIssues: previous?.issues ?? [],
			previousPartCandidates,
			allPlanIds: plan.rows.map((row) => row.id)
		});
		const claimed = claimScienceChallengeReviewRebaseRecoveryInvocation({
			state,
			shardId
		});
		if (
			claimed.claim.logicalContentOrdinal !== logicalContentOrdinal ||
			claimed.directoryName.includes('attempt-05') ||
			claimed.claim.infrastructureInvocationOrdinal >
				SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT
		) {
			throw new Error(`${shardId} recovery invocation claim exceeded its immutable ceilings.`);
		}

		let run = null;
		let transportIssue = null;
		try {
			run = await runDirectScienceChallengeMultipartTurn({
				parts: multipartParts,
				partSize: args.directPartSize,
				attemptDir: claimed.directory,
				orchestrationPrompt: prompt,
				inputSha256,
				model: args.model,
				thinkingLevel: args.thinkingLevel,
				timeoutMs: args.timeoutMs,
				authMode: directAuthMode,
				responseMode: args.directResponseMode
			});
		} catch (error) {
			transportIssue = `Authoring transport failed: ${
				error instanceof Error ? error.message : String(error)
			}`;
			if (!existsSync(path.join(claimed.directory, 'run-summary.json'))) {
				// The external-call boundary is ambiguous once a claim exists. Let
				// the core bind the exact partial inventory and conservatively
				// consume this logical content ordinal; never rerun the claim or
				// manufacture a validation envelope.
				completeScienceChallengeReviewRebaseRecoveryInvocation({
					state,
					shardId,
					directory: claimed.directory
				});
				continue;
			}
		}
		const outcome = evaluateReviewRebaseInfrastructureRecoveryAttempt({
			shardId,
			rows,
			inputs,
			priorCandidate,
			inputSha256,
			logicalContentOrdinal,
			prompt,
			multipartParts,
			attemptDirectory: claimed.directory,
			run,
			transportIssue
		});
		if (outcome.candidate) {
			writeImmutableRepairEvidence(
				path.join(claimed.directory, 'candidate.json'),
				`${stableStringify(outcome.candidate)}\n`
			);
		}
		writeImmutableRepairEvidence(
			path.join(claimed.directory, 'validation.json'),
			`${stableStringify(validationFromAttemptOutcome(outcome))}\n`
		);
		const completed = completeScienceChallengeReviewRebaseRecoveryInvocation({
			state,
			shardId,
			directory: claimed.directory
		});
		const classification = completed.completion.classification;
		if (
			![
				SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED,
				SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT,
				SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED
			].includes(classification)
		) {
			throw new Error(`${shardId} recovery invocation has an unknown classification.`);
		}
		if (classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED) {
			const proposal = readReviewRebaseInfrastructureRecoveryProposal(shardId);
			if (!proposal) {
				throw new Error(`${shardId} passed recovery completion has no replayable proposal.`);
			}
			return {
				shardId,
				status: 'passed',
				action: 'review-rebase-infrastructure-recovery-staged',
				attempt: proposal.attempt,
				count: rows.length,
				candidateSha256: proposal.candidateSha256,
				run: withoutFinalResponse(run),
				proposal
			};
		}
		invocations = inspectScienceChallengeReviewRebaseRecoveryInvocations({
			state,
			shardId
		});
	}
	throw new Error(`${shardId} recovery exceeded its bounded state-transition count.`);
}

function evaluateReviewRebaseInfrastructureRecoveryAttempt({
	shardId,
	rows,
	inputs,
	priorCandidate,
	inputSha256,
	logicalContentOrdinal,
	prompt,
	multipartParts,
	attemptDirectory,
	run,
	transportIssue
}) {
	const eventLogPath = path.join(attemptDirectory, 'events.jsonl');
	const lastMessagePath = path.join(attemptDirectory, 'last-message.json');
	const runSummaryPath = path.join(attemptDirectory, 'run-summary.json');
	const responseIssues = [];
	let persistedRunSummary = null;
	let persistedRunSummarySha256 = null;
	if (existsSync(runSummaryPath)) {
		try {
			persistedRunSummary = JSON.parse(readFileSync(runSummaryPath, 'utf8'));
			persistedRunSummarySha256 = canonicalHash(persistedRunSummary);
			if (run && persistedRunSummarySha256 !== canonicalHash(withoutFinalResponse(run))) {
				responseIssues.push('Persisted authoring run summary does not match the completed run.');
			}
		} catch (error) {
			responseIssues.push(
				`Persisted authoring run summary was not valid JSON: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	} else {
		responseIssues.push('Authoring run did not persist run-summary.json evidence.');
	}
	if (!transportIssue && run && persistedRunSummary) {
		try {
			requireScienceChallengeAuthoringRunPolicy({
				summary: withoutFinalResponse(run),
				eventLogBytes: readFileSync(eventLogPath),
				lastMessageBytes: readFileSync(lastMessagePath),
				promptBytes: Buffer.from(`${prompt}\n`),
				expectedResponseJsonSchema: challengeBatchOutputSchema(rows.length),
				expectedInputs: inputs,
				expectedInputSha256: inputSha256,
				expectedPartPrompts: multipartParts.map((part) => part.prompt),
				multipartEvidence: readScienceChallengeDirectMultipartEvidence({
					attemptDir: attemptDirectory,
					summary: persistedRunSummary
				})
			});
		} catch (error) {
			responseIssues.push(
				`Authoring run policy failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	} else if (!transportIssue) {
		responseIssues.push('Authoring run returned no result.');
	}

	let candidate = null;
	let rawCandidateSha256 = null;
	if (run && typeof run === 'object') {
		try {
			const rawCandidate = JSON.parse(run.finalResponse);
			rawCandidateSha256 = canonicalHash(rawCandidate);
			candidate = normalizeGeneratedChallengeBatch(rawCandidate);
		} catch (error) {
			responseIssues.push(
				`Model response was not JSON: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
	if (transportIssue && !responseIssues.includes(transportIssue)) {
		responseIssues.unshift(transportIssue);
	}
	const deterministicValidation = validateBatchCandidate(candidate, rows);
	deterministicValidation.issues.push(...responseIssues);
	const repairValidation = Array.isArray(candidate?.challenges)
		? validateVerificationRepairCandidate({
				candidate,
				priorCandidate,
				rows,
				reviews: verificationReviewById,
				verificationRepairAuthority
			})
		: { status: 'failed', issues: [] };
	deterministicValidation.issues.push(...repairValidation.issues);
	const status =
		transportIssue === null && deterministicValidation.issues.length === 0 ? 'passed' : 'failed';
	return {
		...deterministicValidation,
		status,
		issues: deterministicValidation.issues,
		attempt: logicalContentOrdinal,
		prompt,
		run: run ?? persistedRunSummary,
		transportIssue,
		inputSha256,
		verificationRepairSha256,
		verificationRepairAuthority,
		verificationRepairAuthoritySha256,
		verificationRepairCohortIssues: [],
		priorCandidateSha256: canonicalHash(priorCandidate),
		rawCandidateSha256,
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		candidateSha256: candidate ? canonicalHash(candidate) : null,
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		promptSha256: sha256(`${prompt}\n`),
		runSummarySha256: persistedRunSummarySha256,
		candidate
	};
}

function readPreviousReviewRebaseInfrastructureContentOutcome({ shardId, invocations }) {
	for (const record of [...invocations.invocations].reverse()) {
		if (
			record.completion?.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED
		) {
			return readReviewRebaseInfrastructureAttemptOutcome(record.directory, {
				completion: record.completion
			});
		}
	}
	const state = reviewRebaseInfrastructureRecovery.state;
	const shard = state.shards.get(shardId);
	const sourceAttempt = [...shard.sourceAttempts]
		.reverse()
		.find(
			(attempt) =>
				attempt.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED
		);
	if (!sourceAttempt) return null;
	const attemptDirectory = path.join(
		state.source.failedRoot,
		'shards',
		shardId,
		`verification-repair-${verificationRepairSha256.slice(0, 12)}-attempt-${String(
			sourceAttempt.physicalAttempt
		).padStart(2, '0')}`
	);
	return readReviewRebaseInfrastructureAttemptOutcome(attemptDirectory);
}

function readReviewRebaseInfrastructureAttemptOutcome(
	attemptDirectory,
	{ completion = null } = {}
) {
	const candidatePath = path.join(attemptDirectory, 'candidate.json');
	const validationPath = path.join(attemptDirectory, 'validation.json');
	const evidenceInventory = completion?.evidenceInventory ?? null;
	const indeterminate = completion?.indeterminate === true;
	const candidate = readAuthenticatedRecoveryAttemptJson({
		filePath: candidatePath,
		relativePath: 'candidate.json',
		evidenceInventory
	});
	const validation = readAuthenticatedRecoveryAttemptJson({
		filePath: validationPath,
		relativePath: 'validation.json',
		evidenceInventory
	});
	if (indeterminate) {
		const hasAuthenticatedPair = candidate !== null && validation !== null;
		return {
			attemptDirectory,
			candidate: hasAuthenticatedPair ? candidate : null,
			issues: [
				'The prior claimed invocation ended with indeterminate partial infrastructure evidence.',
				...(hasAuthenticatedPair && Array.isArray(validation.issues) ? validation.issues : []),
				...(hasAuthenticatedPair && Array.isArray(validation.verificationRepairCohortIssues)
					? validation.verificationRepairCohortIssues
					: [])
			],
			evidenceInventory
		};
	}
	if (!existsSync(validationPath)) {
		throw new Error(`Recovery content outcome has no validation: ${attemptDirectory}`);
	}
	if (validation === null) {
		throw new Error(
			`Recovery content outcome validation is absent from its authenticated inventory: ${attemptDirectory}`
		);
	}
	return {
		attemptDirectory,
		candidate,
		issues: [
			...(Array.isArray(validation.issues) ? validation.issues : []),
			...(Array.isArray(validation.verificationRepairCohortIssues)
				? validation.verificationRepairCohortIssues
				: [])
		],
		evidenceInventory
	};
}

function readAuthenticatedRecoveryAttemptJson({ filePath, relativePath, evidenceInventory }) {
	if (evidenceInventory) {
		const binding = evidenceInventory.find((record) => record.path === relativePath);
		if (!binding) return null;
		const bytes = readFileSync(filePath);
		if (bytes.length !== binding.byteLength || sha256(bytes) !== binding.sha256) {
			throw new Error(`Authenticated recovery evidence changed at ${relativePath}.`);
		}
		return JSON.parse(bytes.toString('utf8'));
	}
	if (!existsSync(filePath)) return null;
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readRecoveryPriorMultipartPartCandidate({
	attemptDirectory,
	partId,
	rowIds,
	evidenceInventory = null
}) {
	if (!attemptDirectory) return null;
	const outputPath = path.join(attemptDirectory, 'parts', partId, 'last-message.json');
	if (!existsSync(outputPath)) return null;
	try {
		const relativePath = path.posix.join('parts', partId, 'last-message.json');
		const value = readAuthenticatedRecoveryAttemptJson({
			filePath: outputPath,
			relativePath,
			evidenceInventory
		});
		return value === null ? null : subsetScienceChallengeCandidate(value, rowIds);
	} catch {
		return null;
	}
}

function planDryRunShard(shardId) {
	const rows = plan.rows.filter((row) => row.shard === shardId);
	const inputs = rows.map((row, index) => buildAuthoringInput(row, index));
	const priorCandidate = verificationRepair
		? verificationRepairPriorCandidateByShard.get(shardId)
		: null;
	const prompt = verificationRepair
		? verificationRepairPrompt(inputs, priorCandidate, rows)
		: authoringPrompt(inputs);
	const inputSha256 = canonicalHash(
		verificationRepair
			? {
					promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
					inputs,
					priorCandidateSha256: canonicalHash(priorCandidate),
					verificationSummarySha256: verificationRepairSha256,
					...(verificationRepairAuthoritySha256 ? { verificationRepairAuthoritySha256 } : {})
				}
			: { promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION, inputs }
	);
	const base = {
		shardId,
		status: 'planned',
		challengeCount: rows.length,
		inputSha256,
		rejectedIds: rows
			.filter((row) => verificationReviewById.get(row.id)?.accepted === false)
			.map((row) => row.id),
		promptCharacters: prompt.length,
		directPartSize: args.directPartSize,
		directPartCount: args.directPartSize ? Math.ceil(rows.length / args.directPartSize) : null
	};
	if (!verificationRepair) {
		return {
			...base,
			action: args.resume ? 'validate-or-generate-shard' : 'generate-shard'
		};
	}

	const shardDir = path.join(outputRoot, 'shards', shardId);
	requireExclusiveMultipartRecoveryLineage(shardId, shardDir);
	const attemptLedger = inspectVerificationRepairAttempts({
		shardDir,
		repairSha256: verificationRepairSha256,
		maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
	});
	const executionAttemptLedger = inspectVerificationRepairExecutionAttempts({
		ledgerRoot: repairExecutionLedgerRoot,
		identity: verificationRepairExecutionIdentity,
		shardId
	});
	requireMatchingVerificationRepairAttemptLedgers({
		localAttempts: attemptLedger.attempts,
		globalAttempts: executionAttemptLedger.attempts,
		shardId,
		outputRoot
	});
	const priorValidationPath = path.join(
		shardDir,
		`verification-repair-${verificationRepairSha256.slice(0, 12)}`,
		'prior-validation.json'
	);
	const currentValidationPath = path.join(shardDir, 'validation.json');
	const priorValidation = existsSync(priorValidationPath)
		? JSON.parse(readFileSync(priorValidationPath, 'utf8'))
		: existsSync(currentValidationPath)
			? JSON.parse(readFileSync(currentValidationPath, 'utf8'))
			: verificationRepairPriorValidationByShard.get(shardId);
	if (!priorValidation) {
		throw new Error(`${shardId} has no verifier-bound prior validation for dry-run planning.`);
	}
	const invalidatedAttempts = invalidatedVerificationRepairAttempts(
		verificationRepairCohortState,
		shardId
	);
	const resumePlan = planVerificationRepairResume({
		attemptLedger,
		invalidatedAttempts,
		resume: args.resume,
		readReusableAttempt: (record) =>
			readPassedRepairProposal({
				shardId,
				shardDir,
				record,
				rows,
				inputs,
				inputSha256,
				priorCandidate,
				priorValidation
			})
	});
	if (resumePlan.action === 'refused') {
		return { ...base, status: 'refused', action: 'refuse', issues: [resumePlan.issue] };
	}
	if (resumePlan.action === 'reuse') {
		return {
			...base,
			action: 'reuse-verification-repair-attempt',
			attempt: resumePlan.record.attempt,
			candidateSha256: resumePlan.reusable.candidateSha256
		};
	}
	if (resumePlan.action === 'run') {
		return {
			...base,
			action: 'run-verification-repair-attempt',
			attempt: resumePlan.attempt,
			attemptCeiling: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
		};
	}
	if (exhaustedReviewRebaseRepairIsTerminal) {
		return {
			...base,
			status: 'refused',
			action: 'refuse-exhausted-review-rebase-repair',
			issues: [
				'Parent-bound review-rebase repair exhausted its fresh immutable four-attempt budget.'
			]
		};
	}

	const salvageApprovalOptions = multipartSalvageSourceApprovalOptions(shardId);
	const salvageReplayOptions = multipartPlanSalvageReplayOptions({
		resume: args.resume,
		shardId,
		shardDir,
		repairSha256: verificationRepairSha256,
		expectedExecutionIdentity: verificationRepairExecutionIdentity,
		inputSha256,
		inputs,
		rows,
		priorCandidate,
		priorValidation,
		verificationSummary: verificationRepair,
		invalidatedAttempts,
		...salvageApprovalOptions
	});
	const salvage = inspectScienceChallengeMultipartPlanSalvage(salvageReplayOptions);
	if (salvage.status === 'passed') {
		return {
			...base,
			action:
				salvage.action === 'reuse-staged-salvage'
					? 'reuse-multipart-plan-drift-salvage'
					: 'stage-multipart-plan-drift-salvage',
			sourceAttempt: salvage.sourceAttempt ?? salvage.proposal?.attempt,
			writesDuringDryRun: false
		};
	}
	if (salvageApprovalOptions.sourceSelectionApproval === undefined) {
		const sourceSelection =
			inspectScienceChallengeMultipartPlanSalvageSourceSelection(salvageReplayOptions);
		if (sourceSelection.status === 'passed' && sourceSelection.requiresApproval === true) {
			return {
				...base,
				action: 'approve-terminal-multipart-salvage-source',
				requiresApproval: true,
				eligibleSources: sourceSelection.eligibleSources,
				eligibleSourcesSha256: sourceSelection.eligibleSourcesSha256,
				terminalAttemptEligible: sourceSelection.terminalAttemptEligible,
				approvalTemplate: sourceSelection.approvalTemplate,
				writesDuringDryRun: false,
				modelCallsDuringDryRun: false
			};
		}
	}
	const difficultyAdjustment = recoverExhaustedScienceChallengeDifficultyPlanAdjustment({
		dryRun: true,
		replayOptions: difficultyPlanAdjustmentReplayOptions({
			resume: args.resume,
			shardId,
			shardDir,
			repairSha256: verificationRepairSha256,
			expectedExecutionIdentity: verificationRepairExecutionIdentity,
			inputSha256,
			inputs,
			rows,
			priorCandidate,
			priorValidation,
			invalidatedAttempts
		})
	});
	if (difficultyAdjustment.status === 'planned') {
		return {
			...base,
			action: difficultyAdjustment.action,
			recoveryKind: difficultyAdjustment.recoveryKind,
			sourceAttempt: difficultyAdjustment.sourceAttempt,
			adjustmentCount: difficultyAdjustment.adjustmentCount,
			effectivePlanSha256: difficultyAdjustment.effectivePlanSha256,
			requiresFreshFullVerification: difficultyAdjustment.requiresFreshFullVerification,
			writesDuringDryRun: false,
			modelCallsDuringDryRun: difficultyAdjustment.modelCalls > 0
		};
	}
	const descendantRemap = recoverExhaustedScienceChallengeDescendantRemap({
		dryRun: true,
		replayOptions: descendantRemapReplayOptions({
			resume: args.resume,
			shardId,
			shardDir,
			repairSha256: verificationRepairSha256,
			expectedExecutionIdentity: verificationRepairExecutionIdentity,
			inputSha256,
			inputs,
			rows,
			priorCandidate,
			priorValidation,
			invalidatedAttempts
		})
	});
	if (descendantRemap.status === 'planned') {
		return {
			...base,
			action: descendantRemap.action,
			sourceAttempt: descendantRemap.sourceAttempt,
			effectivePlanSha256: descendantRemap.effectivePlanSha256,
			requiresFreshFullVerification: descendantRemap.requiresFreshFullVerification,
			writesDuringDryRun: false,
			modelCallsDuringDryRun: descendantRemap.modelCalls > 0
		};
	}
	return {
		...base,
		status: 'refused',
		action: 'refuse-exhausted-repair',
		issues: [
			resumePlan.issue,
			...salvage.issues.map((issue) => `Salvage: ${issue}`),
			...difficultyAdjustment.issues.map((issue) => `Difficulty adjustment: ${issue}`),
			...descendantRemap.issues.map((issue) => `Descendant remap: ${issue}`)
		]
	};
}

async function generateShard(shardId) {
	const rows = plan.rows.filter((row) => row.shard === shardId);
	if (rows.length === 0) return { shardId, status: 'failed', issues: ['No plan rows.'] };
	const shardDir = path.join(outputRoot, 'shards', shardId);
	if (verificationRepair) requireExclusiveMultipartRecoveryLineage(shardId, shardDir);
	const candidatePath = path.join(shardDir, 'candidate.json');
	const validationPath = path.join(shardDir, 'validation.json');
	const inputs = rows.map((row, index) => buildAuthoringInput(row, index));
	const priorCandidate = verificationRepair
		? verificationRepairPriorCandidateByShard.get(shardId)
		: null;
	let priorValidation = null;
	const repairRunId = verificationRepairSha256?.slice(0, 12) ?? null;
	const inputSha256 = canonicalHash(
		verificationRepair
			? {
					promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
					inputs,
					priorCandidateSha256: canonicalHash(priorCandidate),
					verificationSummarySha256: verificationRepairSha256,
					...(verificationRepairAuthoritySha256 ? { verificationRepairAuthoritySha256 } : {})
				}
			: { promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION, inputs }
	);
	const basePrompt = verificationRepair
		? verificationRepairPrompt(inputs, priorCandidate, rows)
		: authoringPrompt(inputs);
	if (
		!verificationRepair &&
		args.resume &&
		existsSync(candidatePath) &&
		existsSync(validationPath)
	) {
		const existingValidation = JSON.parse(readFileSync(validationPath, 'utf8'));
		const existingCandidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
		const currentValidation = validateBatchCandidate(existingCandidate, rows);
		if (
			existingValidation.status === 'passed' &&
			existingValidation.inputSha256 === inputSha256 &&
			existingValidation.candidateSha256 === canonicalHash(existingCandidate) &&
			currentValidation.status === 'passed' &&
			authoringValidationMatchesInvocation(existingValidation) &&
			findBoundToolFreeScienceChallengeAuthoringAttempt({
				shardDir,
				acceptedCandidate: existingCandidate,
				acceptedValidation: existingValidation,
				responseMode: args.directResponseMode,
				resolveExpectedPromptBytes: ({ attemptDirectory }) =>
					Buffer.from(
						`${reconstructScienceChallengeAuthoringAttemptPrompt({
							shardDir,
							attemptDirectory,
							rows,
							inputs,
							existingChallengeDefinitions
						})}\n`
					),
				resolveExpectedMultipartPartPrompts: ({ attemptDirectory, summary }) =>
					reconstructScienceChallengeMultipartAttemptParts({
						shardDir,
						attemptDirectory,
						rows,
						inputs,
						partSize: summary.partSize,
						existingChallengeDefinitions,
						allPlanIds: plan.rows.map((row) => row.id)
					}).map((part) => part.prompt)
			}).status === 'passed'
		) {
			return {
				shardId,
				status: 'passed',
				action: 'resumed',
				count: rows.length,
				inputSha256,
				candidateSha256: existingValidation.candidateSha256
			};
		}
	}
	mkdirSync(shardDir, { recursive: true });
	if (verificationRepair) {
		const repairDir = path.join(shardDir, `verification-repair-${repairRunId}`);
		writeImmutableRepairJson(path.join(repairDir, 'input.json'), inputs);
		if (!verificationRepairPredecessorEffectiveCohort) {
			writeImmutableRepairJson(path.join(shardDir, 'input.json'), inputs);
		}
	} else {
		writeFileSync(path.join(shardDir, 'input.json'), `${stableStringify(inputs)}\n`);
	}
	if (priorCandidate) {
		const repairDir = path.join(shardDir, `verification-repair-${repairRunId}`);
		writeImmutableRepairJson(path.join(repairDir, 'prior-candidate.json'), priorCandidate);
		writeImmutableRepairJson(path.join(repairDir, 'verification-summary.json'), verificationRepair);
		const priorValidationPath = path.join(repairDir, 'prior-validation.json');
		if (existsSync(priorValidationPath)) {
			priorValidation = JSON.parse(readFileSync(priorValidationPath, 'utf8'));
		} else {
			if (verificationRepairPriorValidationByShard.has(shardId)) {
				priorValidation = structuredClone(verificationRepairPriorValidationByShard.get(shardId));
			} else if (!existsSync(validationPath)) {
				throw new Error(`Verification repair requires prior validation at ${validationPath}.`);
			} else {
				priorValidation = JSON.parse(readFileSync(validationPath, 'utf8'));
			}
			if (
				!['passed', 'review-pending'].includes(priorValidation.status) ||
				priorValidation.candidateSha256 !== canonicalHash(priorCandidate)
			) {
				throw new Error(
					`Verification repair prior validation does not bind ${shardId}'s verifier candidate.`
				);
			}
			writeImmutableRepairJson(priorValidationPath, priorValidation);
		}
		if (
			!['passed', 'review-pending'].includes(priorValidation.status) ||
			priorValidation.candidateSha256 !== canonicalHash(priorCandidate)
		) {
			throw new Error(
				`Verification repair prior validation snapshot does not bind ${shardId}'s verifier candidate.`
			);
		}
	}
	const canonicalParts = args.directPartSize
		? buildScienceChallengeAuthoringParts({
				rows,
				inputs,
				partSize: args.directPartSize
			})
		: null;
	let startAttempt = 1;
	let previousAttemptOutcome = null;
	const invalidatedAttempts = verificationRepair
		? invalidatedVerificationRepairAttempts(verificationRepairCohortState, shardId)
		: new Set();
	const repairAttemptLimit = Math.min(
		args.maxAttempts,
		SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
	);
	if (verificationRepair) {
		if (!args.dryRun) {
			reconcileVerificationRepairAttemptTransactions({
				ledgerRoot: repairExecutionLedgerRoot,
				identity: verificationRepairExecutionIdentity,
				outputRoot
			});
		}
		const attemptLedger = inspectVerificationRepairAttempts({
			shardDir,
			repairSha256: verificationRepairSha256,
			maxAttempts: repairAttemptLimit
		});
		const executionAttemptLedger = inspectVerificationRepairExecutionAttempts({
			ledgerRoot: repairExecutionLedgerRoot,
			identity: verificationRepairExecutionIdentity,
			shardId
		});
		requireMatchingVerificationRepairAttemptLedgers({
			localAttempts: attemptLedger.attempts,
			globalAttempts: executionAttemptLedger.attempts,
			shardId,
			outputRoot
		});
		const resumePlan = planVerificationRepairResume({
			attemptLedger,
			invalidatedAttempts,
			resume: args.resume,
			readReusableAttempt: (record) =>
				readPassedRepairProposal({
					shardId,
					shardDir,
					record,
					rows,
					inputs,
					inputSha256,
					priorCandidate,
					priorValidation
				})
		});
		if (resumePlan.action === 'refused') {
			return {
				shardId,
				status: 'failed',
				issues: [resumePlan.issue]
			};
		}
		if (resumePlan.action === 'reuse') {
			const proposal = resumePlan.reusable;
			return {
				shardId,
				status: 'passed',
				action: 'verification-repair-resumed',
				attempt: resumePlan.record.attempt,
				count: rows.length,
				candidateSha256: proposal.candidateSha256,
				proposal
			};
		}
		if (resumePlan.action === 'exhausted') {
			if (exhaustedReviewRebaseRepairIsTerminal) {
				return {
					shardId,
					status: 'failed',
					action: 'refuse-exhausted-review-rebase-repair',
					issues: [
						'Parent-bound review-rebase repair exhausted its fresh immutable four-attempt budget.'
					]
				};
			}
			const salvageApprovalOptions = multipartSalvageSourceApprovalOptions(shardId);
			const salvageReplayOptions = multipartPlanSalvageReplayOptions({
				resume: args.resume,
				shardId,
				shardDir,
				repairSha256: verificationRepairSha256,
				expectedExecutionIdentity: verificationRepairExecutionIdentity,
				inputSha256,
				inputs,
				rows,
				priorCandidate,
				priorValidation,
				verificationSummary: verificationRepair,
				invalidatedAttempts,
				...salvageApprovalOptions
			});
			const salvage = stageScienceChallengeMultipartPlanSalvage(salvageReplayOptions);
			if (salvage.status === 'passed') {
				const proposal = {
					...salvage.proposal,
					candidatePath: path.relative(rootDir, salvage.proposal.candidatePath),
					validationPath: path.relative(rootDir, salvage.proposal.validationPath)
				};
				return {
					shardId,
					status: 'passed',
					action: 'verification-repair-plan-drift-salvaged',
					attempt: proposal.attempt,
					count: rows.length,
					candidateSha256: proposal.candidateSha256,
					salvageManifestSha256: canonicalHash(salvage.manifest),
					proposal
				};
			}
			if (salvageApprovalOptions.sourceSelectionApproval === undefined) {
				const sourceSelection =
					inspectScienceChallengeMultipartPlanSalvageSourceSelection(salvageReplayOptions);
				if (sourceSelection.status === 'passed' && sourceSelection.requiresApproval === true) {
					return {
						shardId,
						status: 'failed',
						action: 'approve-terminal-multipart-salvage-source',
						issues: [
							'Multiple immutable multipart salvage sources are eligible; supply the exact approvalTemplate with --multipart-salvage-source-approval=<json>.'
						],
						eligibleSources: sourceSelection.eligibleSources,
						eligibleSourcesSha256: sourceSelection.eligibleSourcesSha256,
						terminalAttemptEligible: sourceSelection.terminalAttemptEligible,
						approvalTemplate: sourceSelection.approvalTemplate
					};
				}
			}
			const difficultyAdjustment = recoverExhaustedScienceChallengeDifficultyPlanAdjustment({
				dryRun: false,
				replayOptions: difficultyPlanAdjustmentReplayOptions({
					resume: args.resume,
					shardId,
					shardDir,
					repairSha256: verificationRepairSha256,
					expectedExecutionIdentity: verificationRepairExecutionIdentity,
					inputSha256,
					inputs,
					rows,
					priorCandidate,
					priorValidation,
					invalidatedAttempts
				})
			});
			if (difficultyAdjustment.status === 'review-pending') {
				const adjustments = difficultyAdjustment.manifest.adjustments ?? [
					difficultyAdjustment.manifest.adjustment
				];
				return {
					shardId,
					status: difficultyAdjustment.status,
					recoveryKind: difficultyAdjustment.recoveryKind,
					action: difficultyAdjustment.action,
					attempt: difficultyAdjustment.sourceAttempt,
					count: rows.length,
					candidateSha256: difficultyAdjustment.candidateSha256,
					basePlanSha256: difficultyAdjustment.basePlanSha256,
					effectivePlanSha256: difficultyAdjustment.effectivePlanSha256,
					manifestSha256: difficultyAdjustment.manifestSha256,
					adjustmentCount: adjustments.length,
					recoveryDirectory: path.relative(
						rootDir,
						path.dirname(difficultyAdjustment.artifactPaths.manifest)
					),
					requiresFreshFullVerification: difficultyAdjustment.requiresFreshFullVerification,
					...(difficultyAdjustment.manifest.adjustment
						? {
								adjustment: {
									...difficultyAdjustment.manifest.adjustment,
									accepted: null
								}
							}
						: {}),
					adjustments: adjustments.map((adjustment) => ({
						challengeId: adjustment.challengeId,
						field: adjustment.field,
						from: adjustment.from,
						to: adjustment.to,
						accepted: null
					}))
				};
			}
			const descendantRemap = recoverExhaustedScienceChallengeDescendantRemap({
				dryRun: false,
				replayOptions: descendantRemapReplayOptions({
					resume: args.resume,
					shardId,
					shardDir,
					repairSha256: verificationRepairSha256,
					expectedExecutionIdentity: verificationRepairExecutionIdentity,
					inputSha256,
					inputs,
					rows,
					priorCandidate,
					priorValidation,
					invalidatedAttempts
				})
			});
			if (descendantRemap.status === 'review-pending') {
				return {
					shardId,
					status: descendantRemap.status,
					recoveryKind: 'descendant-remap',
					action: descendantRemap.action,
					attempt: descendantRemap.sourceAttempt,
					count: rows.length,
					candidateSha256: descendantRemap.candidateSha256,
					basePlanSha256: descendantRemap.basePlanSha256,
					effectivePlanSha256: descendantRemap.effectivePlanSha256,
					manifestSha256: descendantRemap.manifestSha256,
					recoveryDirectory: path.relative(
						rootDir,
						path.dirname(descendantRemap.artifactPaths.manifest)
					),
					requiresFreshFullVerification: descendantRemap.requiresFreshFullVerification,
					remap: {
						...descendantRemap.manifest.remap,
						accepted: null
					}
				};
			}
			return {
				shardId,
				status: 'failed',
				issues: [
					`${resumePlan.issue} Ceiling: ${repairAttemptLimit}.`,
					...salvage.issues,
					...difficultyAdjustment.issues.map((issue) => `Difficulty adjustment: ${issue}`),
					...descendantRemap.issues.map((issue) => `Descendant remap: ${issue}`)
				]
			};
		}
		startAttempt = resumePlan.attempt;
		const lastRecord = attemptLedger.attempts.at(-1);
		if (lastRecord) {
			const previousCandidatePath = path.join(lastRecord.path, 'candidate.json');
			const previousValidationPath = path.join(lastRecord.path, 'validation.json');
			const previousValidation = existsSync(previousValidationPath)
				? JSON.parse(readFileSync(previousValidationPath, 'utf8'))
				: null;
			const cohortIssues =
				verificationRepairCohortState?.invalidatedAttempts?.[shardId]
					?.filter((row) => row.attempt === lastRecord.attempt)
					.flatMap((row) => row.issues) ?? [];
			previousAttemptOutcome = {
				candidate: existsSync(previousCandidatePath)
					? JSON.parse(readFileSync(previousCandidatePath, 'utf8'))
					: null,
				issues: [
					...(Array.isArray(previousValidation?.issues) ? previousValidation.issues : []),
					...cohortIssues
				]
			};
		}
	}
	const multipartPartsByAttempt = new Map();
	const verificationRepairCohortIssuesByAttempt = new Map();
	const promptPrefix = repairRunId ? `verification-repair-${repairRunId}-prompt` : 'prompt';
	const initialAttemptPrompt =
		startAttempt === 1
			? basePrompt
			: repairPrompt(
					basePrompt,
					previousAttemptOutcome?.candidate ?? null,
					previousAttemptOutcome?.issues ?? [],
					startAttempt
				);
	if (!verificationRepair) {
		writeFileSync(path.join(shardDir, `${promptPrefix}-attempt-1.txt`), `${basePrompt}\n`);
	}
	const attemptResult = await runBoundedScienceChallengeAuthoringAttempts({
		maxAttempts: verificationRepair ? repairAttemptLimit : args.maxAttempts,
		startAttempt,
		initialPrompt: initialAttemptPrompt,
		executeAttempt: async ({ attempt, prompt }) => {
			const attemptName = repairRunId
				? `verification-repair-${repairRunId}-attempt-${String(attempt).padStart(2, '0')}`
				: `attempt-${String(attempt).padStart(2, '0')}`;
			const attemptDir = path.join(shardDir, attemptName);
			const eventLogPath = path.join(attemptDir, 'events.jsonl');
			const lastMessagePath = path.join(attemptDir, 'last-message.json');
			const cohortIssues =
				verificationRepair && attempt > 1
					? (verificationRepairCohortState?.invalidatedAttempts?.[shardId]
							?.filter((row) => row.attempt === attempt - 1)
							.flatMap((row) => row.issues) ?? [])
					: [];
			verificationRepairCohortIssuesByAttempt.set(attempt, cohortIssues);
			if (verificationRepair) {
				const claimed = claimVerificationRepairAttemptPair({
					ledgerRoot: repairExecutionLedgerRoot,
					identity: verificationRepairExecutionIdentity,
					shardId,
					attempt,
					outputRoot
				});
				if (claimed.attemptDir !== attemptDir) {
					throw new Error('Claimed verification-repair attempt path differs from the run path.');
				}
				writeImmutableRepairEvidence(
					path.join(shardDir, `${promptPrefix}-attempt-${attempt}.txt`),
					`${prompt}\n`
				);
			} else {
				mkdirSync(attemptDir, { recursive: true });
			}
			if (args.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT) {
				if (canonicalParts) {
					const previousPartCandidates = new Map(
						canonicalParts.map((part) => [
							part.partId,
							readPriorMultipartPartCandidate({
								shardDir,
								repairRunId,
								attempt: attempt - 1,
								partId: part.partId,
								rowIds: part.rowIds
							})
						])
					);
					const multipartParts = buildScienceChallengeMultipartAttemptParts({
						parts: canonicalParts,
						allRowIds: rows.map((row) => row.id),
						existingChallengeDefinitions,
						verificationRepair: Boolean(verificationRepair),
						verificationReviews: verificationRepair?.reviews ?? [],
						verificationRepairAuthority,
						priorCandidate,
						attempt,
						previousCandidate: previousAttemptOutcome?.candidate ?? null,
						previousIssues: previousAttemptOutcome?.issues ?? [],
						previousPartCandidates,
						allPlanIds: plan.rows.map((row) => row.id)
					});
					multipartPartsByAttempt.set(attempt, multipartParts);
					return await runDirectScienceChallengeMultipartTurn({
						parts: multipartParts,
						partSize: args.directPartSize,
						attemptDir,
						orchestrationPrompt: prompt,
						inputSha256,
						model: args.model,
						thinkingLevel: args.thinkingLevel,
						timeoutMs: args.timeoutMs,
						authMode: directAuthMode,
						responseMode: args.directResponseMode
					});
				}
				const runDirectSingle =
					args.directResponseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
						? runDirectScienceChallengePromptJsonTurn
						: runDirectScienceChallengeJsonTurn;
				return await runDirectSingle({
					prompt,
					outputSchema: challengeBatchOutputSchema(rows.length),
					eventsPath: eventLogPath,
					lastMessagePath,
					thoughtsPath: path.join(attemptDir, 'thoughts.txt'),
					requestPath: path.join(attemptDir, 'request.json'),
					resultMetadataPath: path.join(attemptDir, 'result-metadata.json'),
					summaryPath: path.join(attemptDir, 'run-summary.json'),
					model: args.model,
					thinkingLevel: args.thinkingLevel,
					timeoutMs: args.timeoutMs,
					authMode: directAuthMode
				});
			}
			const modelWorkDir = mkdtempSync(
				path.join(tmpdir(), 'question-constellation-science-authoring-')
			);
			try {
				const sdkRun = await runCodexSdkTurn({
					prompt,
					workDir: modelWorkDir,
					eventsPath: eventLogPath,
					lastMessagePath,
					summaryPath: path.join(attemptDir, 'run-summary.json'),
					model: args.model,
					thinkingLevel: args.thinkingLevel,
					timeoutMs: args.timeoutMs,
					outputSchema: challengeBatchOutputSchema(rows.length),
					sandboxMode: 'read-only',
					environmentMode: 'minimal'
				});
				const currentRun = {
					...withoutFinalResponse(sdkRun),
					transport: CODEX_SDK_TRANSPORT
				};
				writeFileSync(
					path.join(attemptDir, 'run-summary.json'),
					`${stableStringify(currentRun)}\n`
				);
				return { ...currentRun, finalResponse: sdkRun.finalResponse };
			} finally {
				rmSync(modelWorkDir, { recursive: true, force: true });
			}
		},
		evaluateAttempt: async ({ attempt, prompt, run, transportIssue }) => {
			const attemptName = repairRunId
				? `verification-repair-${repairRunId}-attempt-${String(attempt).padStart(2, '0')}`
				: `attempt-${String(attempt).padStart(2, '0')}`;
			const attemptDir = path.join(shardDir, attemptName);
			const eventLogPath = path.join(attemptDir, 'events.jsonl');
			const lastMessagePath = path.join(attemptDir, 'last-message.json');
			const runSummaryPath = path.join(attemptDir, 'run-summary.json');
			const responseIssues = [];
			let persistedRunSummarySha256 = null;
			let persistedRunSummary = null;
			if (existsSync(runSummaryPath)) {
				try {
					persistedRunSummary = JSON.parse(readFileSync(runSummaryPath, 'utf8'));
					persistedRunSummarySha256 = canonicalHash(persistedRunSummary);
					if (run && persistedRunSummarySha256 !== canonicalHash(withoutFinalResponse(run))) {
						responseIssues.push(
							'Persisted authoring run summary does not match the completed run.'
						);
					}
				} catch (error) {
					responseIssues.push(
						`Persisted authoring run summary was not valid JSON: ${
							error instanceof Error ? error.message : String(error)
						}`
					);
				}
			} else {
				responseIssues.push('Authoring run did not persist run-summary.json evidence.');
			}
			if (!transportIssue && run && typeof run === 'object') {
				try {
					requireScienceChallengeAuthoringRunPolicy({
						summary: withoutFinalResponse(run),
						eventLogBytes: readFileSync(eventLogPath),
						lastMessageBytes: readFileSync(lastMessagePath),
						promptBytes: Buffer.from(`${prompt}\n`),
						...(isScienceChallengeDirectMultipartRunSummary(persistedRunSummary)
							? {
									expectedResponseJsonSchema: challengeBatchOutputSchema(rows.length),
									expectedInputs: inputs,
									expectedInputSha256: inputSha256,
									expectedPartPrompts: (multipartPartsByAttempt.get(attempt) ?? []).map(
										(part) => part.prompt
									),
									multipartEvidence: readScienceChallengeDirectMultipartEvidence({
										attemptDir,
										summary: persistedRunSummary
									})
								}
							: persistedRunSummary?.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT
								? {
										expectedResponseJsonSchema: challengeBatchOutputSchema(rows.length),
										requestBytes: readFileSync(path.join(attemptDir, 'request.json')),
										thoughtsBytes: readFileSync(path.join(attemptDir, 'thoughts.txt')),
										resultMetadataBytes: readFileSync(path.join(attemptDir, 'result-metadata.json'))
									}
								: {})
					});
				} catch (error) {
					responseIssues.push(
						`Authoring run policy failed: ${error instanceof Error ? error.message : String(error)}`
					);
				}
			} else if (!transportIssue) {
				responseIssues.push('Authoring run returned no result.');
			}

			let candidate = null;
			let rawCandidateSha256 = null;
			if (run && typeof run === 'object') {
				try {
					const rawCandidate = JSON.parse(run.finalResponse);
					rawCandidateSha256 = canonicalHash(rawCandidate);
					candidate = normalizeGeneratedChallengeBatch(rawCandidate);
				} catch (error) {
					responseIssues.push(
						`Model response was not JSON: ${error instanceof Error ? error.message : String(error)}`
					);
				}
			}
			const deterministicValidation = validateBatchCandidate(candidate, rows);
			deterministicValidation.issues.push(...responseIssues);
			deterministicValidation.status = deterministicValidation.issues.length ? 'failed' : 'passed';
			if (verificationRepair && Array.isArray(candidate?.challenges)) {
				const repairValidation = validateVerificationRepairCandidate({
					candidate,
					priorCandidate,
					rows,
					reviews: verificationReviewById,
					verificationRepairAuthority
				});
				deterministicValidation.issues.push(...repairValidation.issues);
				deterministicValidation.status = deterministicValidation.issues.length
					? 'failed'
					: 'passed';
			}
			return {
				...deterministicValidation,
				inputSha256,
				verificationRepairSha256,
				...(verificationRepairAuthority
					? {
							verificationRepairAuthority,
							verificationRepairAuthoritySha256
						}
					: {}),
				verificationRepairCohortIssues: verificationRepair
					? (verificationRepairCohortIssuesByAttempt.get(attempt) ?? [])
					: null,
				priorCandidateSha256: priorCandidate ? canonicalHash(priorCandidate) : null,
				rawCandidateSha256,
				normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
				candidateSha256: candidate ? canonicalHash(candidate) : null,
				promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
				promptSha256: sha256(`${prompt}\n`),
				runSummarySha256: persistedRunSummarySha256,
				candidate
			};
		},
		recordAttempt: async (outcome) => {
			const attemptName = repairRunId
				? `verification-repair-${repairRunId}-attempt-${String(outcome.attempt).padStart(2, '0')}`
				: `attempt-${String(outcome.attempt).padStart(2, '0')}`;
			const attemptDir = path.join(shardDir, attemptName);
			mkdirSync(attemptDir, { recursive: true });
			if (outcome.candidate) {
				const bytes = `${stableStringify(outcome.candidate)}\n`;
				if (verificationRepair) {
					writeImmutableRepairEvidence(path.join(attemptDir, 'candidate.json'), bytes);
				} else {
					writeFileSync(path.join(attemptDir, 'candidate.json'), bytes);
				}
			}
			const validationBytes = `${stableStringify(validationFromAttemptOutcome(outcome))}\n`;
			if (verificationRepair) {
				writeImmutableRepairEvidence(path.join(attemptDir, 'validation.json'), validationBytes);
			} else {
				writeFileSync(path.join(attemptDir, 'validation.json'), validationBytes);
			}
		},
		buildRetryPrompt: (outcome) => {
			previousAttemptOutcome = outcome;
			return repairPrompt(basePrompt, outcome.candidate, outcome.issues, outcome.attempt + 1);
		},
		recordRetryPrompt: async ({ attempt, prompt }) => {
			if (!verificationRepair) {
				writeFileSync(path.join(shardDir, `${promptPrefix}-attempt-${attempt}.txt`), `${prompt}\n`);
			}
		}
	});
	const finalValidation = validationFromAttemptOutcome(attemptResult);
	if (attemptResult.status === 'passed') {
		if (verificationRepair) {
			const attemptName = `verification-repair-${repairRunId}-attempt-${String(
				attemptResult.attempt
			).padStart(2, '0')}`;
			const attemptDir = path.join(shardDir, attemptName);
			const proposal = {
				shardId,
				attempt: attemptResult.attempt,
				candidatePath: path.relative(rootDir, path.join(attemptDir, 'candidate.json')),
				validationPath: path.relative(rootDir, path.join(attemptDir, 'validation.json')),
				candidateSha256: canonicalHash(attemptResult.candidate),
				validationSha256: canonicalHash(finalValidation),
				expectedTargetCandidateSha256: canonicalHash(priorCandidate),
				expectedTargetValidationSha256: canonicalHash(priorValidation)
			};
			return {
				shardId,
				status: 'passed',
				action: 'verification-repair-staged',
				attempt: attemptResult.attempt,
				count: rows.length,
				candidateSha256: proposal.candidateSha256,
				run: withoutFinalResponse(attemptResult.run),
				proposal
			};
		}
		writeFileSync(candidatePath, `${stableStringify(attemptResult.candidate)}\n`);
		writeFileSync(validationPath, `${stableStringify(finalValidation)}\n`);
		return {
			shardId,
			status: 'passed',
			action: verificationRepair
				? 'verification-repaired'
				: attemptResult.attempt === 1
					? 'generated'
					: 'repaired',
			attempt: attemptResult.attempt,
			count: rows.length,
			candidateSha256: canonicalHash(attemptResult.candidate),
			run: withoutFinalResponse(attemptResult.run)
		};
	}
	if (!verificationRepair) {
		writeFileSync(validationPath, `${stableStringify(finalValidation)}\n`);
	}
	return {
		shardId,
		status: 'failed',
		count: rows.length,
		issues: attemptResult.issues
	};
}

function validationFromAttemptOutcome(outcome) {
	return {
		status: outcome.status,
		issues: outcome.issues,
		inputSha256: outcome.inputSha256,
		verificationRepairSha256: outcome.verificationRepairSha256,
		...(outcome.verificationRepairAuthority
			? {
					verificationRepairAuthority: outcome.verificationRepairAuthority,
					verificationRepairAuthoritySha256: outcome.verificationRepairAuthoritySha256
				}
			: {}),
		verificationRepairCohortIssues: outcome.verificationRepairCohortIssues,
		priorCandidateSha256: outcome.priorCandidateSha256,
		rawCandidateSha256: outcome.rawCandidateSha256,
		candidateSha256: outcome.candidateSha256,
		normalizationVersion: outcome.normalizationVersion,
		promptVersion: outcome.promptVersion,
		promptSha256: outcome.promptSha256,
		runSummarySha256: outcome.runSummarySha256,
		transport: outcome.run?.transport ?? null,
		transportVersion: outcome.run?.transportVersion ?? null,
		responseMode: outcome.run?.responseMode ?? null,
		providerSchemaApplied: outcome.run?.providerSchemaApplied ?? null,
		provider: outcome.run?.provider ?? null,
		model: outcome.run?.model ?? null,
		modelVersion: outcome.run?.modelVersion ?? null,
		modelVersions: outcome.run?.modelVersions ?? null,
		directPartSize: outcome.run?.partSize ?? null,
		thinkingLevel: outcome.run?.thinkingLevel ?? null,
		transportError: outcome.transportIssue
	};
}

function buildAuthoringInput(row, shardIndex) {
	const source = sourceById.get(row.calibrationQuestionId);
	const curriculum = curriculumById.get(row.curriculumComponentId);
	if (!source) throw new Error(`Missing source question ${row.calibrationQuestionId}.`);
	if (!curriculum) throw new Error(`Missing curriculum evidence ${row.curriculumComponentId}.`);
	const globalIndex = plan.rows.findIndex((candidate) => candidate.id === row.id);
	return {
		plan: {
			...row,
			expectedAnswerPositions: {
				strongerAnswer: globalIndex % 2 === 0 ? 'a' : 'b',
				diagnosisCorrectIndex: globalIndex % 3,
				repairCorrectIndex: (globalIndex + 1) % 3,
				transferCorrectIndex: (globalIndex + 2) % 3
			}
		},
		curriculum: {
			componentId: curriculum.componentId,
			specificationId: curriculum.specificationId,
			specificationSha256: curriculum.specificationSha256,
			code: curriculum.code,
			title: curriculum.title,
			pageStart: curriculum.pageStart,
			pageEnd: curriculum.pageEnd,
			officialPageText: curriculum.sourceText
		},
		calibrationEvidence: sourceEvidenceForPrompt(source),
		shardIndex
	};
}

function executionIdentityForVerificationRepair(
	verificationSummary,
	{
		verificationSha256 = canonicalHash(verificationSummary),
		model = args.model,
		transport = args.transport,
		responseMode = args.directResponseMode,
		thinkingLevel = args.thinkingLevel,
		directPartSize = args.directPartSize
	} = {}
) {
	const summaryPlanSha256 =
		typeof verificationSummary.planSha256 === 'string' &&
		/^[a-f0-9]{64}$/u.test(verificationSummary.planSha256)
			? verificationSummary.planSha256
			: canonicalHash(plan);
	return scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: summaryPlanSha256,
		verificationSha256,
		priorCandidateSetSha256: verificationSummary.candidateSetSha256,
		model,
		transport,
		responseMode,
		thinkingLevel,
		directPartSize
	});
}

function multipartSalvageSourceApprovalOptions(shardId) {
	const approval = multipartSalvageSourceApprovalByShard.get(shardId);
	if (approval === undefined) return {};
	consumedMultipartSalvageApprovalShardIds.add(shardId);
	return { sourceSelectionApproval: approval };
}

function prevalidateMultipartSalvageSourceApprovals() {
	for (const [shardId, sourceSelectionApproval] of multipartSalvageSourceApprovalByShard) {
		const rows = plan.rows.filter((row) => row.shard === shardId);
		const inputs = rows.map((row, index) => buildAuthoringInput(row, index));
		const priorCandidate = verificationRepairPriorCandidateByShard.get(shardId);
		const shardDir = path.join(outputRoot, 'shards', shardId);
		const inputSha256 = canonicalHash({
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			inputs,
			priorCandidateSha256: canonicalHash(priorCandidate),
			verificationSummarySha256: verificationRepairSha256,
			...(verificationRepairAuthoritySha256 ? { verificationRepairAuthoritySha256 } : {})
		});
		requireExclusiveMultipartRecoveryLineage(shardId, shardDir);
		const attemptLedger = inspectVerificationRepairAttempts({
			shardDir,
			repairSha256: verificationRepairSha256,
			maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
		});
		const executionAttemptLedger = inspectVerificationRepairExecutionAttempts({
			ledgerRoot: repairExecutionLedgerRoot,
			identity: verificationRepairExecutionIdentity,
			shardId
		});
		requireMatchingVerificationRepairAttemptLedgers({
			localAttempts: attemptLedger.attempts,
			globalAttempts: executionAttemptLedger.attempts,
			shardId,
			outputRoot
		});
		const priorValidation = readVerificationRepairPriorValidation(shardId, shardDir);
		const invalidatedAttempts = invalidatedVerificationRepairAttempts(
			verificationRepairCohortState,
			shardId
		);
		const resumePlan = planVerificationRepairResume({
			attemptLedger,
			invalidatedAttempts,
			resume: args.resume,
			readReusableAttempt: (record) =>
				readPassedRepairProposal({
					shardId,
					shardDir,
					record,
					rows,
					inputs,
					inputSha256,
					priorCandidate,
					priorValidation
				})
		});
		if (resumePlan.action !== 'exhausted') {
			throw new Error(
				`Multipart salvage source approval for ${shardId} is unused because that shard is not at the exhausted salvage gate.`
			);
		}
		const replay = inspectScienceChallengeMultipartPlanSalvage(
			multipartPlanSalvageReplayOptions({
				resume: args.resume,
				shardId,
				shardDir,
				repairSha256: verificationRepairSha256,
				expectedExecutionIdentity: verificationRepairExecutionIdentity,
				inputSha256,
				inputs,
				rows,
				priorCandidate,
				priorValidation,
				verificationSummary: verificationRepair,
				invalidatedAttempts,
				sourceSelectionApproval
			})
		);
		if (replay.status !== 'passed') {
			throw new Error(
				`Multipart salvage source approval for ${shardId} failed prevalidation:\n${replay.issues.join(
					'\n'
				)}`
			);
		}
	}
}

function readVerificationRepairPriorValidation(shardId, shardDir) {
	const repairSnapshotPath = path.join(
		shardDir,
		`verification-repair-${verificationRepairSha256.slice(0, 12)}`,
		'prior-validation.json'
	);
	const currentValidationPath = path.join(shardDir, 'validation.json');
	const selectedPath = existsSync(repairSnapshotPath) ? repairSnapshotPath : currentValidationPath;
	if (!existsSync(selectedPath)) {
		throw new Error(
			`Verification repair prior validation is missing for ${shardId}: ${selectedPath}`
		);
	}
	return JSON.parse(readFileSync(selectedPath, 'utf8'));
}

function multipartPlanSalvageReplayOptions({
	resume,
	shardId,
	shardDir,
	repairSha256,
	expectedExecutionIdentity,
	inputSha256,
	inputs,
	rows,
	priorCandidate,
	priorValidation,
	verificationSummary,
	invalidatedAttempts,
	sourceSelectionApproval
}) {
	return {
		resume,
		shardId,
		shardDir,
		outputRoot,
		workspaceRoot: rootDir,
		repairSha256,
		expectedPlanSha256: canonicalHash(plan),
		expectedExecutionIdentity,
		inputSha256,
		inputs,
		rows,
		priorCandidate,
		priorValidation,
		reviews: verificationSummary.reviews,
		expectedReviewIds: plan.rows.map((row) => row.id),
		...(invalidatedAttempts === undefined ? {} : { invalidatedAttempts }),
		...(sourceSelectionApproval === undefined ? {} : { sourceSelectionApproval }),
		validateBatchCandidate,
		reconstructSourceEvidence: ({ attemptDirectory, summary }) => ({
			expectedPromptBytes: Buffer.from(
				`${reconstructScienceChallengeAuthoringAttemptPrompt({
					shardDir,
					attemptDirectory,
					rows,
					inputs,
					existingChallengeDefinitions
				})}\n`
			),
			expectedPartPrompts: reconstructScienceChallengeMultipartAttemptParts({
				shardDir,
				attemptDirectory,
				rows,
				inputs,
				partSize: summary.partSize,
				existingChallengeDefinitions,
				allPlanIds: plan.rows.map((row) => row.id)
			}).map((part) => part.prompt)
		})
	};
}

function descendantRemapReplayOptions({
	resume,
	shardId,
	shardDir,
	repairSha256,
	expectedExecutionIdentity,
	inputSha256,
	inputs,
	rows,
	priorCandidate,
	priorValidation,
	invalidatedAttempts
}) {
	const firstReview = readFirstReviewShardEvidence(shardId);
	return {
		resume,
		shardId,
		shardDir,
		outputRoot,
		workspaceRoot: rootDir,
		repairSha256,
		expectedPlanSha256: canonicalHash(plan),
		expectedExecutionIdentity,
		inputSha256,
		inputs,
		rows,
		plan,
		curriculumEvidence,
		curriculumCatalog,
		priorCandidate,
		priorValidation,
		firstReviewSummary: verificationRepair,
		firstReviewResult: firstReview.result,
		firstAssignment: firstReview.assignment,
		dispatchLedger: firstReview.dispatchLedger,
		...(invalidatedAttempts === undefined ? {} : { invalidatedAttempts }),
		validateBatchCandidate: (candidate, candidateRows, context) => {
			const validation = validateBatchCandidate(candidate, candidateRows);
			return {
				...validation,
				candidateSha256: canonicalHash(candidate),
				planRowsSha256: canonicalHash(candidateRows),
				planSha256: canonicalHash(context.effectivePlan ?? context.basePlan),
				candidateCount: candidate?.challenges?.length ?? 0
			};
		},
		reconstructSourceEvidence: ({ attemptDirectory, summary }) => ({
			expectedPromptBytes: Buffer.from(
				`${reconstructScienceChallengeAuthoringAttemptPrompt({
					shardDir,
					attemptDirectory,
					rows,
					inputs,
					existingChallengeDefinitions
				})}\n`
			),
			expectedPartPrompts: reconstructScienceChallengeMultipartAttemptParts({
				shardDir,
				attemptDirectory,
				rows,
				inputs,
				partSize: summary.partSize,
				existingChallengeDefinitions,
				allPlanIds: plan.rows.map((row) => row.id)
			}).map((part) => part.prompt)
		})
	};
}

function difficultyPlanAdjustmentReplayOptions(options) {
	const { curriculumCatalog: _curriculumCatalog, ...replayOptions } =
		descendantRemapReplayOptions(options);
	return replayOptions;
}

function readFirstReviewShardEvidence(shardId) {
	const rawEvidence = verificationRepairEvidence?.rawEvidence;
	const assignmentRecord = rawEvidence?.index?.assignments?.find(
		(record) => record?.assignmentId === shardId
	);
	const resultRecord = verificationRepair?.assignmentResults?.find(
		(record) => record?.assignmentId === shardId
	);
	if (!assignmentRecord?.path || !resultRecord?.path || !rawEvidence?.ledger) {
		throw new Error(`${shardId} lacks replayed first-review assignment/result/dispatch evidence.`);
	}
	return {
		assignment: readJson(assignmentRecord.path),
		result: readJson(resultRecord.path),
		dispatchLedger: rawEvidence.ledger
	};
}

function listMultipartPlanSalvageDirectories(shardDir) {
	if (!existsSync(shardDir)) return [];
	return readdirSync(shardDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				/^verification-repair-[a-f0-9]{12}-multipart-plan-salvage$/.test(entry.name)
		)
		.map((entry) => path.join(shardDir, entry.name))
		.sort();
}

function listDescendantRemapDirectories(shardDir) {
	if (!existsSync(shardDir)) return [];
	return readdirSync(shardDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				/^verification-repair-[a-f0-9]{12}-descendant-remap$/.test(entry.name)
		)
		.map((entry) => path.join(shardDir, entry.name))
		.sort();
}

function requireExclusiveMultipartRecoveryLineage(shardId, shardDir) {
	const salvageDirectories = listMultipartPlanSalvageDirectories(shardDir);
	const descendantRemapDirectories = listDescendantRemapDirectories(shardDir);
	if (salvageDirectories.length > 1) {
		throw new Error(`${shardId} contains ambiguous multipart salvage lineage.`);
	}
	if (descendantRemapDirectories.length > 1) {
		throw new Error(`${shardId} contains ambiguous descendant-remap recovery lineage.`);
	}
	if (
		descendantRemapDirectories.length > 0 &&
		salvageDirectories.length > 0
	) {
		throw new Error(
			`${shardId} contains descendant-remap and multipart recovery lineage; recovery is ambiguous.`
		);
	}
}

function sourceEvidenceForPrompt(source) {
	return {
		id: source.id,
		contentSha256: source.contentSha256,
		sourceDocument: sourceDocumentById.get(source.sourceDocumentId) ?? null,
		sourceQuestionRef: source.sourceQuestionRef ?? source.source_question_ref,
		promptText: source.promptText ?? source.prompt_text,
		selfContainedPromptText: source.selfContainedPromptText ?? source.self_contained_prompt_text,
		contextText: source.contextText ?? source.context_text,
		commandWord: source.commandWord ?? source.command_word,
		marks: source.marks,
		answerFormat: source.answerFormat ?? source.answer_format,
		renderingOverlays: source.renderingOverlays,
		markScheme: source.markScheme ?? source.markSchemeItems,
		checklist: source.checklist ?? source.markChecklistItems,
		modelAnswers: source.modelAnswers,
		answerKeys: source.answerKeys ?? source.fixedAnswerKeys,
		primaryChain: source.primaryChain,
		weakAnswers: source.weakAnswers ?? source.commonWeakAnswers,
		assets: (source.requiredAssets ?? source.assets ?? []).map((asset) => ({
			id: asset.id,
			assetType: asset.assetType ?? asset.asset_type,
			required: asset.required,
			role: asset.role,
			altText: asset.altText ?? asset.alt_text,
			extractedText: asset.extractedText ?? asset.extracted_text
		}))
	};
}

function authoringPrompt(inputs) {
	return buildScienceChallengeAuthoringPrompt({
		inputs,
		existingChallengeDefinitions
	});
}

function verificationRepairPrompt(inputs, priorCandidate, rows) {
	return buildScienceChallengeVerificationRepairPrompt({
		inputs,
		priorCandidate,
		rows,
		verificationReviews: verificationRepair?.reviews ?? [],
		verificationRepairAuthority,
		existingChallengeDefinitions
	});
}

function repairPrompt(basePrompt, candidate, issues, attempt) {
	return buildScienceChallengeRepairPrompt({ basePrompt, candidate, issues, attempt });
}

function readPriorMultipartPartCandidate({ shardDir, repairRunId, attempt, partId, rowIds }) {
	if (!Number.isInteger(attempt) || attempt < 1) return null;
	const attemptName = repairRunId
		? `verification-repair-${repairRunId}-attempt-${String(attempt).padStart(2, '0')}`
		: `attempt-${String(attempt).padStart(2, '0')}`;
	const outputPath = path.join(shardDir, attemptName, 'parts', partId, 'last-message.json');
	if (!existsSync(outputPath)) return null;
	try {
		return subsetScienceChallengeCandidate(JSON.parse(readFileSync(outputPath, 'utf8')), rowIds);
	} catch {
		return null;
	}
}

function readPassedRepairProposal({
	shardId,
	shardDir,
	record,
	rows,
	inputs,
	inputSha256,
	priorCandidate,
	priorValidation
}) {
	const candidatePath = path.join(record.path, 'candidate.json');
	const validationPath = path.join(record.path, 'validation.json');
	if (!existsSync(candidatePath) || !existsSync(validationPath)) return null;
	let candidate;
	let validation;
	try {
		candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
		validation = JSON.parse(readFileSync(validationPath, 'utf8'));
	} catch {
		return null;
	}
	const deterministic = validateBatchCandidate(candidate, rows);
	const repair = validateVerificationRepairCandidate({
		candidate,
		priorCandidate,
		rows,
		reviews: verificationReviewById,
		verificationRepairAuthority
	});
	if (
		validation.status !== 'passed' ||
		validation.inputSha256 !== inputSha256 ||
		validation.verificationRepairSha256 !== verificationRepairSha256 ||
		(validation.verificationRepairAuthoritySha256 ?? null) !== verificationRepairAuthoritySha256 ||
		canonicalHash(validation.verificationRepairAuthority ?? null) !==
			canonicalHash(verificationRepairAuthority) ||
		validation.priorCandidateSha256 !== canonicalHash(priorCandidate) ||
		validation.candidateSha256 !== canonicalHash(candidate) ||
		deterministic.status !== 'passed' ||
		repair.status !== 'passed' ||
		!authoringValidationMatchesInvocation(validation)
	) {
		return null;
	}
	const evidence = findBoundToolFreeScienceChallengeAuthoringAttempt({
		shardDir,
		acceptedCandidate: candidate,
		acceptedValidation: validation,
		resolveExpectedPromptBytes: ({ attemptDirectory }) =>
			Buffer.from(
				`${reconstructScienceChallengeAuthoringAttemptPrompt({
					shardDir,
					attemptDirectory,
					rows,
					inputs,
					existingChallengeDefinitions
				})}\n`
			),
		resolveExpectedMultipartPartPrompts: ({ attemptDirectory, summary }) =>
			reconstructScienceChallengeMultipartAttemptParts({
				shardDir,
				attemptDirectory,
				rows,
				inputs,
				partSize: summary.partSize,
				existingChallengeDefinitions,
				allPlanIds: plan.rows.map((row) => row.id)
			}).map((part) => part.prompt),
		responseMode: args.directResponseMode
	});
	if (evidence.status !== 'passed' || evidence.attemptDirectory !== record.directory) return null;
	return {
		shardId,
		attempt: record.attempt,
		candidatePath: path.relative(rootDir, candidatePath),
		validationPath: path.relative(rootDir, validationPath),
		candidateSha256: canonicalHash(candidate),
		validationSha256: canonicalHash(validation),
		expectedTargetCandidateSha256: canonicalHash(priorCandidate),
		expectedTargetValidationSha256: canonicalHash(priorValidation)
	};
}

function validateBatchCandidate(candidate, rows) {
	return validateScienceChallengeGeneratedBatch(candidate, rows, {
		sourceById,
		curriculumById,
		existingDefinitions: existingChallengeDefinitions,
		planRows: plan.rows
	});
}

function rememberSelectedVerificationRepairCandidate(result) {
	if (
		!verificationRepair ||
		!result ||
		typeof result.shardId !== 'string' ||
		!result.shardId.trim()
	) {
		return;
	}
	let candidatePath = null;
	if (result.status === 'passed' && result.proposal?.candidatePath) {
		candidatePath = path.resolve(rootDir, result.proposal.candidatePath);
	} else if (result.status === 'review-pending' && result.recoveryDirectory) {
		candidatePath = path.resolve(rootDir, result.recoveryDirectory, 'candidate.json');
	}
	if (!candidatePath) return;
	const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
	if (result.candidateSha256 && result.candidateSha256 !== canonicalHash(candidate)) {
		throw new Error(`${result.shardId} selected candidate differs from its result binding.`);
	}
	verificationRepairSelectedCandidateByShard.set(result.shardId, candidate);
}

function exactVerificationRepairLastAttemptByShard(shardIds) {
	if (!verificationRepairExecutionIdentity || !repairExecutionLedgerRoot) {
		throw new Error('Exact verification-repair ledgers are unavailable.');
	}
	return new Map(
		shardIds.map((shardId) => {
			const localLedger = inspectVerificationRepairAttempts({
				shardDir: path.join(outputRoot, 'shards', shardId),
				repairSha256: verificationRepairSha256,
				maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
			});
			const globalLedger = inspectVerificationRepairExecutionAttempts({
				ledgerRoot: repairExecutionLedgerRoot,
				identity: verificationRepairExecutionIdentity,
				shardId
			});
			requireMatchingVerificationRepairAttemptLedgers({
				localAttempts: localLedger.attempts,
				globalAttempts: globalLedger.attempts,
				shardId,
				outputRoot
			});
			return [shardId, localLedger.attempts.at(-1)?.attempt ?? 0];
		})
	);
}

function buildEffectiveCohortSelections({ results, effectivePlan }) {
	const resultByShard = new Map(results.map((result) => [result.shardId, result]));
	const shardIds = [...new Set(effectivePlan.rows.map((row) => row.shard))];
	return shardIds.map((shardId) => {
		const result = resultByShard.get(shardId);
		if (result?.status === 'passed') {
			if (!result.proposal?.candidatePath || !result.proposal?.validationPath) {
				throw new Error(`${shardId} passed repair result has no immutable proposal.`);
			}
			return {
				shardId,
				disposition: 'ordinary-repair-proposal',
				candidatePath: path.resolve(rootDir, result.proposal.candidatePath),
				validationPath: path.resolve(rootDir, result.proposal.validationPath),
				candidateSha256: result.proposal.candidateSha256,
				validationSha256: result.proposal.validationSha256,
				proposal: result.proposal,
				action: result.action
			};
		}
		if (result?.status === 'review-pending') {
			const recoveryDirectory = path.resolve(rootDir, result.recoveryDirectory);
			const difficultyAdjustment = result.recoveryKind === 'difficulty-plan-adjustment';
			return {
				shardId,
				disposition: difficultyAdjustment ? 'difficulty-plan-adjustment' : 'descendant-remap',
				candidatePath: path.join(recoveryDirectory, 'candidate.json'),
				validationPath: path.join(recoveryDirectory, 'validation.json'),
				candidateSha256: result.candidateSha256,
				...(difficultyAdjustment
					? {
							adjustmentManifestPath: path.join(recoveryDirectory, 'manifest.json')
						}
					: {
							remapManifestPath: path.join(recoveryDirectory, 'manifest.json')
						}),
				priorCandidatePath: path.join(recoveryDirectory, 'prior-candidate.json')
			};
		}
		if (result) {
			throw new Error(`${shardId} cannot enter the effective cohort with ${result.status}.`);
		}
		const candidatePath = path.join(outputRoot, 'shards', shardId, 'candidate.json');
		const validationPath = path.join(outputRoot, 'shards', shardId, 'validation.json');
		const candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
		const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
		const firstReviewCandidate = verificationRepairPriorCandidateByShard.get(shardId);
		if (!firstReviewCandidate || canonicalHash(candidate) !== canonicalHash(firstReviewCandidate)) {
			throw new Error(`${shardId} unchanged fallback differs from the first-review candidate.`);
		}
		return {
			shardId,
			disposition: 'unchanged-verified-fallback',
			candidatePath,
			validationPath,
			candidateSha256: canonicalHash(candidate),
			validationSha256: canonicalHash(validation),
			firstReviewCandidateSha256: canonicalHash(firstReviewCandidate),
			firstReviewValidationSha256: canonicalHash(validation)
		};
	});
}

function validateEffectiveCandidateCollection({ candidateSet, candidateBatches, effectivePlan }) {
	const structuralIssues = [];
	const expectedShardIds = [...new Set(effectivePlan.rows.map((row) => row.shard))];
	if (
		!(candidateBatches instanceof Map) ||
		candidateBatches.size !== expectedShardIds.length ||
		expectedShardIds.some((shardId) => !candidateBatches.has(shardId))
	) {
		structuralIssues.push(
			'Effective collection requires exactly one candidate batch for every planned shard.'
		);
	}
	if (
		!Array.isArray(candidateSet) ||
		candidateSet.length !== effectivePlan.rows.length ||
		candidateSet.some((entry) => !entry)
	) {
		structuralIssues.push(
			'Effective collection requires one ordered candidate for every effective plan row.'
		);
	}
	const validation = validateGeneratedChallengeCollection(candidateSet ?? [], {
		existingDefinitions: existingChallengeDefinitions
	});
	const actualIds = (candidateSet ?? []).map((entry) => entry?.definition?.id);
	const expectedIds = effectivePlan.rows.map((row) => row.id);
	if (
		actualIds.length !== expectedIds.length ||
		actualIds.some((id, index) => id !== expectedIds[index]) ||
		new Set(actualIds).size !== expectedIds.length
	) {
		structuralIssues.push('Effective collection candidate order differs from the effective plan.');
	}
	const issues = [...structuralIssues, ...(validation.issues ?? [])];
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		repairTargets: [],
		candidateSet,
		candidateCount: candidateSet?.length ?? 0,
		candidateSetSha256: canonicalHash(candidateSet),
		effectivePlanSha256: canonicalHash(effectivePlan)
	};
}

function validateAvailableCandidateCollection(
	candidateOverrides = new Map(),
	{
		verificationSummary = verificationRepair,
		priorCandidateByShard = verificationRepairPriorCandidateByShard
	} = {}
) {
	const entries = [];
	const structuralIssues = [];
	for (const shardId of [...new Set(plan.rows.map((row) => row.shard))].sort()) {
		let candidate;
		if (candidateOverrides.has(shardId)) {
			candidate = candidateOverrides.get(shardId);
		} else {
			const candidatePath = path.resolve(
				rootDir,
				args.outputRoot,
				'shards',
				shardId,
				'candidate.json'
			);
			if (!existsSync(candidatePath)) {
				structuralIssues.push(`${shardId}: candidate.json is missing from the complete cohort.`);
				continue;
			}
			try {
				candidate = JSON.parse(readFileSync(candidatePath, 'utf8'));
			} catch (error) {
				structuralIssues.push(
					`${shardId}: candidate.json is not valid JSON: ${
						error instanceof Error ? error.message : String(error)
					}.`
				);
				continue;
			}
			const verifierBoundPrior = priorCandidateByShard.get(shardId);
			if (
				verificationSummary &&
				(!verifierBoundPrior || canonicalHash(candidate) !== canonicalHash(verifierBoundPrior))
			) {
				structuralIssues.push(
					`${shardId}: fallback candidate bytes changed after independent verification.`
				);
			}
		}
		if (!Array.isArray(candidate?.challenges)) {
			structuralIssues.push(`${shardId}: candidate batch has no challenges array.`);
			continue;
		}
		entries.push(...candidate.challenges);
	}
	const validation = validateGeneratedChallengeCollection(entries, {
		existingDefinitions: existingChallengeDefinitions
	});
	const actualIds = entries.map((entry) => entry?.definition?.id);
	const expectedIds = plan.rows.map((row) => row.id);
	if (
		actualIds.length !== expectedIds.length ||
		new Set(actualIds).size !== expectedIds.length ||
		expectedIds.some((id) => !actualIds.includes(id))
	) {
		structuralIssues.push(
			`Complete candidate collection must contain exactly ${expectedIds.length} unique planned challenges.`
		);
	}
	const issues = [...structuralIssues, ...validation.issues];
	const issuesById = new Map();
	for (const issue of issues) {
		const challengeId = issue.match(/^([^:]+):/)?.[1];
		const row = plan.rows.find((candidate) => candidate.id === challengeId);
		if (!row) continue;
		const rowIssues = issuesById.get(challengeId) ?? [];
		rowIssues.push(issue);
		issuesById.set(challengeId, rowIssues);
	}
	const repairTargets = [...issuesById.entries()].map(([challengeId, targetIssues]) => ({
		challengeId,
		shardId: plan.rows.find((row) => row.id === challengeId).shard,
		issues: targetIssues
	}));
	const targetValidation = validateVerificationRepairCollectionTargets({
		collectionValidation: { repairTargets },
		verificationRepairAuthority
	});
	if (targetValidation.status !== 'passed') {
		throw new Error(
			`Collection validation attempted to expand the frozen repair authority:\n${targetValidation.issues.join(
				'\n'
			)}`
		);
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		repairTargets
	};
}

function authoringValidationMatchesInvocation(validation) {
	return (
		validation?.transport === args.transport &&
		validation?.model === args.model &&
		validation?.thinkingLevel === args.thinkingLevel &&
		(validation?.responseMode ?? null) === (args.directResponseMode ?? null) &&
		(validation?.directPartSize ?? null) === (args.directPartSize ?? null)
	);
}

async function loadExistingCatalog() {
	return loadChallengeCatalogSource({
		rootDir,
		sourcePath: args.catalogSource
	});
}

function selectShardIds(rows, requested) {
	const available = [...new Set(rows.map((row) => row.shard))].sort();
	if (requested.length === 0) return available;
	for (const requestedId of requested) {
		if (!available.includes(requestedId)) throw new Error(`Unknown shard ${requestedId}.`);
	}
	return requested;
}

function readShardCandidate(shardId) {
	const candidatePath = path.resolve(rootDir, args.outputRoot, 'shards', shardId, 'candidate.json');
	if (!existsSync(candidatePath)) {
		throw new Error(`Verification repair requires the current candidate: ${candidatePath}`);
	}
	return JSON.parse(readFileSync(candidatePath, 'utf8'));
}

function resolveVerificationRepairBase(relativePath, suppliedSummary = null) {
	const summaryPath = path.resolve(rootDir, relativePath);
	if (!existsSync(summaryPath)) {
		throw new Error(`Verification summary does not exist: ${summaryPath}`);
	}
	const summary = suppliedSummary ?? JSON.parse(readFileSync(summaryPath, 'utf8'));
	const basePlanSha256 = canonicalHash(basePlan);
	const reviewRebase = args.reviewRebaseManifest
		? readScienceChallengeReviewRebaseEvidence({
				repositoryRoot: rootDir,
				manifestPath: args.reviewRebaseManifest,
				existingDefinitions: existingChallengeDefinitions
			})
		: null;
	if (reviewRebase) {
		if (reviewRebase.status !== 'passed') {
			throw new Error(
				`Review-rebase repair parent replay failed:\n${reviewRebase.issues.join('\n')}`
			);
		}
		if (
			path.resolve(reviewRebase.outputRoot) === outputRoot ||
			outputRoot.startsWith(`${path.resolve(reviewRebase.outputRoot)}${path.sep}`)
		) {
			throw new Error(
				'Review-rebase repair output must be a separate root outside the immutable rebase tree.'
			);
		}
	}
	const directReviewRebaseRepair =
		reviewRebase && typeof summary?.effectiveCohortManifestSha256 !== 'string';
	if (directReviewRebaseRepair) {
		const indexPath = path.join(path.dirname(summaryPath), 'assignment-index.json');
		if (!existsSync(indexPath)) {
			throw new Error(
				'Review-rebase verification repair requires its fresh hash-bound assignment index.'
			);
		}
		const assignmentIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
		const expectedBindings = reviewRebaseBindingsFromReplay(reviewRebase);
		const bindingIssues = [];
		for (const [field, expected] of Object.entries(expectedBindings)) {
			if (canonicalHash(summary?.[field]) !== canonicalHash(expected)) {
				bindingIssues.push(`verification summary ${field}`);
			}
			if (canonicalHash(assignmentIndex?.[field]) !== canonicalHash(expected)) {
				bindingIssues.push(`assignment index ${field}`);
			}
		}
		if (
			reviewRebase.manifest.basePlanSha256 !== basePlanSha256 ||
			reviewRebase.manifest.planSha256 !== canonicalHash(reviewRebase.plan) ||
			reviewRebase.manifest.sourceSnapshotSha256 !== canonicalHash(sourceSnapshot) ||
			reviewRebase.manifest.curriculumEvidenceSha256 !== canonicalHash(curriculumEvidence) ||
			summary.planSha256 !== canonicalHash(reviewRebase.plan) ||
			summary.basePlanSha256 !== basePlanSha256 ||
			summary.effectivePlanSha256 !== canonicalHash(reviewRebase.plan) ||
			summary.candidateSetSha256 !== reviewRebase.manifest.candidateSetSha256 ||
			assignmentIndex.planSha256 !== canonicalHash(reviewRebase.plan) ||
			assignmentIndex.basePlanSha256 !== basePlanSha256 ||
			assignmentIndex.effectivePlanSha256 !== canonicalHash(reviewRebase.plan) ||
			assignmentIndex.candidateSetSha256 !== reviewRebase.manifest.candidateSetSha256 ||
			assignmentIndex.candidateCount !== reviewRebase.manifest.candidateCount ||
			bindingIssues.length > 0
		) {
			throw new Error(
				[
					'Review-rebase verification summary or assignment index differs from the replayed parent.',
					...(bindingIssues.length
						? [`Stale typed bindings: ${[...new Set(bindingIssues)].join(', ')}.`]
						: [])
				].join(' ')
			);
		}
		for (const forbiddenField of [
			'effectiveCohortManifestSha256',
			'recoverySetSha256',
			'curriculumRemapVerifierInputSha256',
			'difficultyPlanAdjustmentVerifierInputSha256'
		]) {
			if (summary[forbiddenField] !== undefined || assignmentIndex[forbiddenField] !== undefined) {
				throw new Error(
					`Review-rebase repair cannot be combined with typed effective-cohort field ${forbiddenField}.`
				);
			}
		}
		return {
			plan: reviewRebase.plan,
			basePlan,
			effectiveCohort: null,
			reviewRebase,
			assignmentIndex,
			assignmentIndexPath: indexPath,
			curriculumRemapVerifierInput: null,
			difficultyPlanAdjustmentVerifierInput: null
		};
	}
	if (
		summary?.planSha256 === basePlanSha256 &&
		typeof summary?.effectiveCohortManifestSha256 !== 'string'
	) {
		return {
			plan: basePlan,
			basePlan,
			effectiveCohort: null,
			reviewRebase: null,
			assignmentIndex: null,
			curriculumRemapVerifierInput: null,
			difficultyPlanAdjustmentVerifierInput: null
		};
	}
	const verificationRoot = path.dirname(summaryPath);
	const indexPath = path.join(verificationRoot, 'assignment-index.json');
	if (!existsSync(indexPath)) {
		throw new Error(
			'Effective-cohort verification repair requires its hash-bound assignment index.'
		);
	}
	const assignmentIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
	if (
		assignmentIndex.schemaVersion !== 'science-challenge-verification-assignment-index/v1' ||
		assignmentIndex.basePlanSha256 !== basePlanSha256 ||
		assignmentIndex.planSha256 !== summary.planSha256 ||
		assignmentIndex.effectivePlanSha256 !== summary.planSha256 ||
		typeof assignmentIndex.effectiveCohortManifestSha256 !== 'string'
	) {
		throw new Error(
			'Effective-cohort verification assignment index does not bind the current base/effective plan.'
		);
	}
	const manifestPath = discoverScienceChallengeEffectiveCohortManifest(outputRoot);
	if (!manifestPath) {
		throw new Error('Effective-cohort verification repair has no discoverable predecessor cohort.');
	}
	const discoveredManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (canonicalHash(discoveredManifest) !== assignmentIndex.effectiveCohortManifestSha256) {
		throw new Error(
			'Effective-cohort verification review targets a stale or competing predecessor manifest.'
		);
	}
	const readVerifierInput = (fileName, expectedSha256, label) => {
		if (!expectedSha256) return null;
		const filePath = path.join(verificationRoot, fileName);
		if (!existsSync(filePath)) {
			throw new Error(`Effective-cohort repair is missing ${label}: ${filePath}`);
		}
		const value = JSON.parse(readFileSync(filePath, 'utf8'));
		if (canonicalHash(value) !== expectedSha256) {
			throw new Error(`Effective-cohort ${label} differs from its assignment-index hash.`);
		}
		return value;
	};
	const curriculumRemapVerifierInput = readVerifierInput(
		'curriculum-remap-verifier-input.json',
		assignmentIndex.curriculumRemapVerifierInputSha256,
		'curriculum-remap verifier input'
	);
	const difficultyPlanAdjustmentVerifierInput = readVerifierInput(
		'difficulty-plan-adjustment-verifier-input.json',
		assignmentIndex.difficultyPlanAdjustmentVerifierInputSha256,
		'difficulty-plan adjustment verifier input'
	);
	if (!curriculumRemapVerifierInput && !difficultyPlanAdjustmentVerifierInput && !reviewRebase) {
		throw new Error(
			'Effective-cohort repair requires typed recovery input or authenticated review-rebase ancestry.'
		);
	}
	const replayOptions = {
		manifestPath,
		referenceRoot: outputRoot,
		basePlan,
		expectedSourceSnapshotSha256: canonicalHash(sourceSnapshot),
		expectedCurriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		expectedCurriculumCatalogSha256: canonicalHash(curriculumCatalog),
		reviewRebaseEvidence: reviewRebase
	};
	let effectiveCohort = readScienceChallengeEffectiveCohort(replayOptions);
	if (effectiveCohort.status !== 'passed') {
		throw new Error(
			`Effective-cohort repair predecessor replay failed:\n${effectiveCohort.issues.join('\n')}`
		);
	}
	// The collection replay below is plan-sensitive. Select the authenticated effective plan only
	// after the manifest replay has proved its own base/effective references.
	plan = effectiveCohort.effectivePlan;
	effectiveCohort = readScienceChallengeEffectiveCohort({
		...replayOptions,
		effectivePlan: plan,
		validateCollectionCandidate: validateEffectiveCandidateCollection
	});
	if (effectiveCohort.status !== 'passed') {
		throw new Error(
			`Effective-cohort repair collection replay failed:\n${effectiveCohort.issues.join('\n')}`
		);
	}
	if (
		canonicalHash(plan) !== summary.planSha256 ||
		summary.basePlanSha256 !== basePlanSha256 ||
		summary.effectivePlanSha256 !== canonicalHash(plan) ||
		summary.candidateSetSha256 !== effectiveCohort.candidateSetSha256 ||
		assignmentIndex.candidateSetSha256 !== effectiveCohort.candidateSetSha256 ||
		assignmentIndex.recoverySetSha256 !== effectiveCohort.manifest.recoverySetSha256 ||
		summary.recoverySetSha256 !== effectiveCohort.manifest.recoverySetSha256
	) {
		throw new Error(
			'Effective-cohort verification review differs from the replayed plan, candidates or recoveries.'
		);
	}
	return {
		plan,
		basePlan,
		effectiveCohort,
		reviewRebase,
		assignmentIndex,
		curriculumRemapVerifierInput,
		difficultyPlanAdjustmentVerifierInput
	};
}

function readAndValidateVerificationRepair(
	relativePath,
	suppliedSummary = null,
	repairBase = {
		plan: basePlan,
		basePlan,
		effectiveCohort: null,
		reviewRebase: null,
		curriculumRemapVerifierInput: null,
		difficultyPlanAdjustmentVerifierInput: null
	}
) {
	const summaryPath = path.resolve(rootDir, relativePath);
	if (!existsSync(summaryPath)) {
		throw new Error(`Verification summary does not exist: ${summaryPath}`);
	}
	const summary = suppliedSummary ?? JSON.parse(readFileSync(summaryPath, 'utf8'));
	const issues = [];
	const rawEvidence = requireContentVerificationEvidence({
		summary,
		summaryPath,
		plan,
		basePlan: repairBase.basePlan,
		expectedCurriculumRemapVerifierInput: repairBase.curriculumRemapVerifierInput,
		expectedDifficultyPlanAdjustmentVerifierInput: repairBase.difficultyPlanAdjustmentVerifierInput,
		expectedReviewRebaseEvidence: repairBase.effectiveCohort ? null : repairBase.reviewRebase,
		expectedReviewRebaseSuccessorEmptyRecoveryBinding:
			repairBase.effectiveCohort?.manifest?.parentChain && repairBase.reviewRebase
				? buildScienceChallengeReviewRebaseSuccessorEmptyRecoveryBinding({
						effectiveCohort: repairBase.effectiveCohort,
						reviewRebaseEvidence: repairBase.reviewRebase
					})
				: null,
		sourceSnapshot,
		curriculumEvidence,
		rootDir,
		requiredStatus: 'failed'
	});
	issues.push(...rawEvidence.issues.map((issue) => `Raw verifier evidence: ${issue}`));
	if (summary.schemaVersion !== 'science-challenge-independent-verification-summary/v1') {
		issues.push('schemaVersion is not an independent science challenge verification summary.');
	}
	if (summary.planId !== plan.planId || summary.planSha256 !== canonicalHash(plan)) {
		issues.push('The verification summary was produced from a different plan.');
	}
	if (
		summary.sourceSnapshotSha256 !== canonicalHash(sourceSnapshot) ||
		summary.curriculumEvidenceSha256 !== canonicalHash(curriculumEvidence)
	) {
		issues.push('The verification summary was produced from different source evidence.');
	}
	if (
		summary.status !== 'failed' ||
		summary.reviewCount !== plan.rows.length ||
		!Array.isArray(summary.reviews) ||
		summary.reviews.length !== plan.rows.length ||
		summary.assignmentCount !== new Set(plan.rows.map((row) => row.shard)).size ||
		!Array.isArray(summary.assignmentResults) ||
		summary.assignmentResults.length !== new Set(plan.rows.map((row) => row.shard)).size ||
		summary.assignmentResults.some((result) => result.status !== 'passed') ||
		!Array.isArray(summary.issues) ||
		summary.issues.length !== 0
	) {
		issues.push(
			'The repair source must be a complete, structurally valid verification run whose only failure is rejected content or replay-bound review-rebase collection remediation.'
		);
	}
	const priorCandidateByShard = new Map();
	const priorValidationByShard = new Map();
	const rawCandidateById = new Map(
		(rawEvidence.orderedCandidates ?? []).map((entry) => [entry?.definition?.id, entry])
	);
	const publication = readVerificationRepairPublication({
		outputRoot,
		repairSha256: canonicalHash(summary)
	}).journal;
	const allShardIds = [...new Set(plan.rows.map((row) => row.shard))];
	for (const shardId of allShardIds) {
		const expectedEntries = plan.rows
			.filter((row) => row.shard === shardId)
			.map((row) => rawCandidateById.get(row.id));
		if (expectedEntries.some((entry) => !entry)) {
			issues.push(`The verification evidence is missing prior candidate bytes for ${shardId}.`);
			continue;
		}
		priorCandidateByShard.set(shardId, {
			schemaVersion: SCIENCE_CHALLENGE_BATCH_SCHEMA,
			challenges: expectedEntries
		});
	}
	for (const shardId of allShardIds) {
		const expectedCandidate = priorCandidateByShard.get(shardId);
		if (!expectedCandidate) continue;
		if (repairBase.effectiveCohort) {
			const predecessorCandidate = repairBase.effectiveCohort.candidateBatches.get(shardId);
			const predecessorShard = repairBase.effectiveCohort.manifest.shards.find(
				(shard) => shard.shardId === shardId
			);
			let predecessorValidation = null;
			try {
				if (!predecessorShard?.validation?.path) {
					throw new Error('validation reference is missing');
				}
				predecessorValidation = JSON.parse(
					readFileSync(path.resolve(outputRoot, predecessorShard.validation.path), 'utf8')
				);
			} catch (error) {
				issues.push(
					`${shardId} effective-cohort predecessor validation is unreadable: ${
						error instanceof Error ? error.message : String(error)
					}.`
				);
			}
			if (
				!predecessorCandidate ||
				canonicalHash(predecessorCandidate) !== canonicalHash(expectedCandidate) ||
				!predecessorValidation ||
				!['passed', 'review-pending'].includes(predecessorValidation.status) ||
				predecessorValidation.candidateSha256 !== canonicalHash(predecessorCandidate)
			) {
				issues.push(
					`${shardId} effective-cohort predecessor candidate or validation differs from the fresh review.`
				);
			} else {
				priorValidationByShard.set(shardId, predecessorValidation);
			}
			const repairRoot = path.join(
				outputRoot,
				'shards',
				shardId,
				`verification-repair-${canonicalHash(summary).slice(0, 12)}`
			);
			const priorSnapshotPath = path.join(repairRoot, 'prior-candidate.json');
			const summarySnapshotPath = path.join(repairRoot, 'verification-summary.json');
			if (existsSync(priorSnapshotPath)) {
				if (
					canonicalHash(JSON.parse(readFileSync(priorSnapshotPath, 'utf8'))) !==
					canonicalHash(expectedCandidate)
				) {
					issues.push(`${shardId} verification-repair prior candidate snapshot was tampered.`);
				}
				if (
					!existsSync(summarySnapshotPath) ||
					canonicalHash(JSON.parse(readFileSync(summarySnapshotPath, 'utf8'))) !==
						canonicalHash(summary)
				) {
					issues.push(`${shardId} verification-repair summary snapshot was tampered or missing.`);
				}
			}
			continue;
		}
		const rebasePriorCandidate = repairBase.reviewRebase?.candidateBatches.get(shardId) ?? null;
		const rebasePriorValidation = repairBase.reviewRebase?.outputValidations.get(shardId) ?? null;
		if (repairBase.reviewRebase) {
			if (
				!rebasePriorCandidate ||
				canonicalHash(rebasePriorCandidate) !== canonicalHash(expectedCandidate) ||
				!rebasePriorValidation ||
				rebasePriorValidation.status !== 'passed' ||
				rebasePriorValidation.candidateSha256 !== canonicalHash(rebasePriorCandidate)
			) {
				issues.push(
					`${shardId} review-rebase candidate or validation differs from the fresh review.`
				);
			} else {
				priorValidationByShard.set(shardId, rebasePriorValidation);
			}
		}
		const virtualRebaseSeed = Boolean(repairBase.reviewRebase && !outputRootInitiallyExists);
		const currentCandidate = virtualRebaseSeed ? expectedCandidate : readShardCandidate(shardId);
		const currentValidationPath = path.join(outputRoot, 'shards', shardId, 'validation.json');
		let currentValidation = virtualRebaseSeed ? rebasePriorValidation : null;
		if (!virtualRebaseSeed && !existsSync(currentValidationPath)) {
			issues.push(`The current candidate validation is missing for ${shardId}.`);
		} else if (!virtualRebaseSeed) {
			try {
				currentValidation = JSON.parse(readFileSync(currentValidationPath, 'utf8'));
			} catch (error) {
				issues.push(
					`The current candidate validation is invalid JSON for ${shardId}: ${
						error instanceof Error ? error.message : String(error)
					}.`
				);
			}
		}
		const currentIsExactRebaseSeed = Boolean(
			repairBase.reviewRebase &&
			rebasePriorCandidate &&
			rebasePriorValidation &&
			canonicalHash(currentCandidate) === canonicalHash(rebasePriorCandidate) &&
			canonicalHash(currentValidation) === canonicalHash(rebasePriorValidation)
		);
		if (
			repairBase.reviewRebase &&
			rebasePriorCandidate &&
			canonicalHash(currentCandidate) === canonicalHash(rebasePriorCandidate) &&
			!currentIsExactRebaseSeed
		) {
			issues.push(`${shardId} review-rebase seed validation was tampered.`);
		}
		if (
			currentValidation &&
			(currentValidation.status !== 'passed' ||
				currentValidation.candidateSha256 !== canonicalHash(currentCandidate))
		) {
			issues.push(`The current candidate validation does not bind ${shardId}.`);
		}
		if (currentValidation?.status === 'passed') {
			const shardRows = plan.rows.filter((row) => row.shard === shardId);
			const shardInputs = shardRows.map((row, index) => buildAuthoringInput(row, index));
			const shardDir = path.join(outputRoot, 'shards', shardId);
			const salvageDirectories = listMultipartPlanSalvageDirectories(shardDir);
			requireExclusiveMultipartRecoveryLineage(shardId, shardDir);
			const validateOrdinaryAuthoringEvidence = () =>
				findBoundToolFreeScienceChallengeAuthoringAttempt({
					shardDir,
					acceptedCandidate: currentCandidate,
					acceptedValidation: currentValidation,
					resolveExpectedPromptBytes: ({ attemptDirectory }) =>
						Buffer.from(
							`${reconstructScienceChallengeAuthoringAttemptPrompt({
								shardDir,
								attemptDirectory,
								rows: shardRows,
								inputs: shardInputs,
								existingChallengeDefinitions
							})}\n`
						),
					resolveExpectedMultipartPartPrompts: ({ attemptDirectory, summary: runSummary }) =>
						reconstructScienceChallengeMultipartAttemptParts({
							shardDir,
							attemptDirectory,
							rows: shardRows,
							inputs: shardInputs,
							partSize: runSummary.partSize,
							existingChallengeDefinitions,
							allPlanIds: plan.rows.map((row) => row.id)
						}).map((part) => part.prompt)
				});
			let authoringEvidence;
			if (currentIsExactRebaseSeed) {
				authoringEvidence = { status: 'passed', issues: [] };
			} else if (
				currentValidation.authoringDisposition === 'deterministic-multipart-plan-drift-salvage' ||
				salvageDirectories.length > 0
			) {
				const published =
					currentValidation.authoringDisposition === 'deterministic-multipart-plan-drift-salvage';
				const salvageRepairSha256 = published
					? currentValidation.verificationRepairSha256
					: canonicalHash(summary);
				const repairRunId =
					typeof salvageRepairSha256 === 'string' && /^[a-f0-9]{64}$/.test(salvageRepairSha256)
						? salvageRepairSha256.slice(0, 12)
						: null;
				const salvageRepairRoot = repairRunId
					? path.join(shardDir, `verification-repair-${repairRunId}`)
					: null;
				const verificationSummaryPath = salvageRepairRoot
					? path.join(salvageRepairRoot, 'verification-summary.json')
					: null;
				const priorCandidatePath = salvageRepairRoot
					? path.join(salvageRepairRoot, 'prior-candidate.json')
					: null;
				const priorValidationPath = salvageRepairRoot
					? path.join(salvageRepairRoot, 'prior-validation.json')
					: null;
				const expectedSalvageDir = salvageRepairSha256
					? scienceChallengeMultipartPlanSalvageDirectory({
							shardDir,
							repairSha256: salvageRepairSha256
						})
					: null;
				const stagedValidationPath = expectedSalvageDir
					? path.join(expectedSalvageDir, 'validation.json')
					: null;
				if (
					salvageDirectories.length !== 1 ||
					!expectedSalvageDir ||
					path.resolve(salvageDirectories[0]) !== path.resolve(expectedSalvageDir) ||
					!verificationSummaryPath ||
					!priorCandidatePath ||
					!priorValidationPath ||
					!stagedValidationPath ||
					[
						verificationSummaryPath,
						priorCandidatePath,
						priorValidationPath,
						stagedValidationPath
					].some((filePath) => !existsSync(filePath))
				) {
					authoringEvidence = {
						status: 'failed',
						issues: ['Multipart plan-drift salvage repair snapshots are missing.']
					};
				} else {
					const salvageVerificationSummary = JSON.parse(
						readFileSync(verificationSummaryPath, 'utf8')
					);
					const salvagePriorCandidate = JSON.parse(readFileSync(priorCandidatePath, 'utf8'));
					const salvagePriorValidation = JSON.parse(readFileSync(priorValidationPath, 'utf8'));
					const salvageReferenceValidation = published
						? currentValidation
						: JSON.parse(readFileSync(stagedValidationPath, 'utf8'));
					const salvageExecutionIdentity = executionIdentityForVerificationRepair(
						salvageVerificationSummary,
						{
							verificationSha256: salvageRepairSha256,
							model: salvageReferenceValidation.model,
							transport: salvageReferenceValidation.transport,
							responseMode: salvageReferenceValidation.responseMode,
							thinkingLevel: salvageReferenceValidation.thinkingLevel,
							directPartSize: salvageReferenceValidation.directPartSize
						}
					);
					const salvageInputSha256 = published
						? currentValidation.inputSha256
						: canonicalHash({
								promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
								inputs: shardInputs,
								priorCandidateSha256: canonicalHash(salvagePriorCandidate),
								verificationSummarySha256: salvageRepairSha256
							});
					const replayOptions = multipartPlanSalvageReplayOptions({
						resume: true,
						shardId,
						shardDir,
						repairSha256: salvageRepairSha256,
						expectedExecutionIdentity: salvageExecutionIdentity,
						inputSha256: salvageInputSha256,
						inputs: shardInputs,
						rows: shardRows,
						priorCandidate: salvagePriorCandidate,
						priorValidation: salvagePriorValidation,
						verificationSummary: salvageVerificationSummary
					});
					const staged = published
						? {
								status: 'passed',
								candidate: currentCandidate,
								validation: currentValidation
							}
						: readScienceChallengeMultipartPlanSalvage(replayOptions);
					authoringEvidence =
						staged.status === 'passed'
							? validateScienceChallengeMultipartPlanSalvageAcceptance({
									acceptedCandidate: staged.candidate,
									acceptedValidation: staged.validation,
									replayOptions
								})
							: staged;
					if (authoringEvidence.status === 'passed' && !published) {
						authoringEvidence = validateOrdinaryAuthoringEvidence();
					}
				}
			} else authoringEvidence = validateOrdinaryAuthoringEvidence();
			if (authoringEvidence.status !== 'passed') {
				issues.push(
					`${shardId} current candidate lacks exact authoring provenance: ${authoringEvidence.issues.join(
						' '
					)}`
				);
			}
		}
		if (canonicalHash(currentCandidate) !== canonicalHash(expectedCandidate)) {
			const publicationRecord =
				publication?.status === 'committed'
					? publication.records?.find((record) => record.shardId === shardId)
					: null;
			if (
				!publicationRecord ||
				publicationRecord.candidate.backupCanonicalSha256 !== canonicalHash(expectedCandidate) ||
				publicationRecord.candidate.proposalCanonicalSha256 !== canonicalHash(currentCandidate)
			) {
				issues.push(
					`The verification summary does not bind the current or transactionally published candidate bytes for ${shardId}.`
				);
			}
		}
		const repairRoot = path.join(
			outputRoot,
			'shards',
			shardId,
			`verification-repair-${canonicalHash(summary).slice(0, 12)}`
		);
		const priorSnapshotPath = path.join(repairRoot, 'prior-candidate.json');
		const summarySnapshotPath = path.join(repairRoot, 'verification-summary.json');
		if (existsSync(priorSnapshotPath)) {
			const priorSnapshot = JSON.parse(readFileSync(priorSnapshotPath, 'utf8'));
			if (canonicalHash(priorSnapshot) !== canonicalHash(expectedCandidate)) {
				issues.push(`${shardId} verification-repair prior candidate snapshot was tampered.`);
			}
			if (
				!existsSync(summarySnapshotPath) ||
				canonicalHash(JSON.parse(readFileSync(summarySnapshotPath, 'utf8'))) !==
					canonicalHash(summary)
			) {
				issues.push(`${shardId} verification-repair summary snapshot was tampered or missing.`);
			}
		}
	}
	const reviewsById = new Map();
	for (const review of Array.isArray(summary.reviews) ? summary.reviews : []) {
		if (reviewsById.has(review.id)) issues.push(`The summary duplicates review ${review.id}.`);
		const rowValidation = validateIndependentContentReviewRow(review);
		for (const issue of rowValidation.issues) issues.push(`${review.id}: ${issue}`);
		reviewsById.set(review.id, review);
	}
	for (const row of plan.rows) {
		if (!reviewsById.has(row.id)) issues.push(`The summary is missing review ${row.id}.`);
	}
	const rejected = [...reviewsById.values()].filter((review) => review.accepted === false);
	if (
		(rejected.length === 0 && !verificationRepairAuthority) ||
		summary.rejectedCount !== rejected.length ||
		summary.acceptedCount + summary.rejectedCount !== plan.rows.length
	) {
		issues.push('Verification accepted/rejected counts are inconsistent.');
	}
	for (const review of rejected) {
		if (
			!Array.isArray(review.issues) ||
			review.issues.length === 0 ||
			review.issues.some(
				(issue) =>
					typeof issue?.field !== 'string' ||
					!issue.field.trim() ||
					typeof issue?.category !== 'string' ||
					!issue.category.trim() ||
					typeof issue?.evidence !== 'string' ||
					!issue.evidence.trim() ||
					typeof issue?.repair !== 'string' ||
					!issue.repair.trim()
			)
		) {
			issues.push(`${review.id} has no usable independent repair instructions.`);
		}
	}
	if (issues.length) {
		throw new Error(`Invalid verification repair summary:\n${issues.join('\n')}`);
	}
	return {
		summary,
		priorCandidateByShard,
		priorValidationByShard,
		effectiveCohort: repairBase.effectiveCohort,
		reviewRebase: repairBase.reviewRebase,
		rawEvidence
	};
}

async function runConcurrent(tasks, concurrency) {
	const results = new Array(tasks.length);
	let cursor = 0;
	async function worker() {
		while (cursor < tasks.length) {
			const index = cursor;
			cursor += 1;
			try {
				results[index] = await tasks[index]();
			} catch (error) {
				results[index] = {
					status: 'failed',
					error: error instanceof Error ? error.message : String(error)
				};
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
	return results;
}

function withoutFinalResponse(run) {
	const summary = { ...run };
	delete summary.finalResponse;
	return summary;
}

function readJson(relativePath) {
	const filePath = path.resolve(rootDir, relativePath);
	if (!existsSync(filePath)) throw new Error(`Required JSON does not exist: ${filePath}`);
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readRequestedReviewRebaseInfrastructureRecovery() {
	const manifestPath = path.resolve(rootDir, args.reviewRebaseInfrastructureRecovery);
	if (!existsSync(manifestPath)) {
		throw new Error(
			'--review-rebase-infrastructure-recovery must name an existing seeded recovery manifest.'
		);
	}
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (
		typeof manifest?.failedRoot?.path !== 'string' ||
		!manifest.failedRoot.path.trim() ||
		typeof manifest?.successor?.path !== 'string' ||
		!manifest.successor.path.trim()
	) {
		throw new Error('Recovery manifest has no original failed S1 or recovery-successor binding.');
	}
	const recoveryRoot = path.resolve(rootDir, manifest.successor.path);
	if (
		manifestPath !== path.join(recoveryRoot, 'verification-repair-infrastructure-recovery.json')
	) {
		throw new Error(
			'--review-rebase-infrastructure-recovery must be the manifest at its bound recovery successor root.'
		);
	}
	const failedRoot = path.resolve(rootDir, manifest.failedRoot.path);
	requireDisjointDirectories({
		left: recoveryRoot,
		leftLabel: 'review-rebase infrastructure recovery root',
		leftMustExist: true,
		right: outputRoot,
		rightLabel: 'review-rebase infrastructure recovery publication root',
		rightMustExist: false
	});
	requireDisjointDirectories({
		left: failedRoot,
		leftLabel: 'original failed S1 root',
		leftMustExist: true,
		right: outputRoot,
		rightLabel: 'review-rebase infrastructure recovery publication root',
		rightMustExist: false
	});
	return { manifestPath, manifest, recoveryRoot, failedRoot };
}

function requireDisjointDirectories({
	left,
	leftLabel,
	leftMustExist,
	right,
	rightLabel,
	rightMustExist
}) {
	const canonicalLeft = canonicalPotentialDirectory(left, {
		label: leftLabel,
		requireExisting: leftMustExist
	});
	const canonicalRight = canonicalPotentialDirectory(right, {
		label: rightLabel,
		requireExisting: rightMustExist
	});
	if (
		canonicalLeft === canonicalRight ||
		canonicalLeft.startsWith(`${canonicalRight}${path.sep}`) ||
		canonicalRight.startsWith(`${canonicalLeft}${path.sep}`)
	) {
		throw new Error(
			`${leftLabel} and ${rightLabel} must be distinct, non-nested, non-aliased directories.`
		);
	}
}

function canonicalPotentialDirectory(directory, { label, requireExisting }) {
	const resolved = path.resolve(directory);
	let cursor = resolved;
	const missingTail = [];
	while (!existsSync(cursor)) {
		if (path.dirname(cursor) === cursor) {
			throw new Error(`${label} has no existing safe ancestor.`);
		}
		missingTail.unshift(path.basename(cursor));
		cursor = path.dirname(cursor);
	}
	const stat = lstatSync(cursor);
	if (stat.isSymbolicLink() || !stat.isDirectory()) {
		throw new Error(`${label} traverses a symbolic link or non-directory.`);
	}
	const realCursor = realpathSync(cursor);
	if (realCursor !== cursor) {
		throw new Error(`${label} traverses a symbolic-link or aliased directory.`);
	}
	if (requireExisting && missingTail.length > 0) {
		throw new Error(`${label} must already exist.`);
	}
	if (existsSync(resolved)) {
		const resolvedStat = lstatSync(resolved);
		if (resolvedStat.isSymbolicLink() || !resolvedStat.isDirectory()) {
			throw new Error(`${label} must be a real directory, not a link or file.`);
		}
	}
	return path.join(realCursor, ...missingTail);
}

function parseArgs(argv) {
	const values = new Map();
	const shards = [];
	const multipartSalvageSourceApprovals = [];
	const valueOptions = new Set([
		'plan',
		'source',
		'evidence',
		'catalog-source',
		'output-root',
		'concurrency',
		'max-attempts',
		'timeout-ms',
		'transport',
		'direct-response-mode',
		'thinking-level',
		'direct-part-size',
		'model',
		'repair-verification',
		'review-rebase-manifest',
		'review-rebase-infrastructure-recovery',
		'preflight-output'
	]);
	for (const arg of argv) {
		if (arg === '--') {
			throw new Error('Bare -- separator is not accepted by the generator.');
		} else if (arg === '--help' || arg === '-h') {
			if (values.has('help')) throw new Error('Duplicate --help option.');
			values.set('help', true);
		} else if (arg === '--resume') {
			if (values.has('resume')) throw new Error('Duplicate --resume option.');
			values.set('resume', true);
		} else if (arg === '--dry-run') {
			if (values.has('dry-run')) throw new Error('Duplicate --dry-run option.');
			values.set('dry-run', true);
		} else if (arg === '--preflight-only') {
			if (values.has('preflight-only')) {
				throw new Error('Duplicate --preflight-only option.');
			}
			values.set('preflight-only', true);
		} else if (arg.startsWith('--shard=')) {
			const shardId = arg.slice('--shard='.length);
			if (!shardId) throw new Error('--shard requires a non-empty value.');
			shards.push(shardId);
		} else if (arg.startsWith('--multipart-salvage-source-approval=')) {
			const approvalPath = arg.slice('--multipart-salvage-source-approval='.length);
			if (!approvalPath) {
				throw new Error('--multipart-salvage-source-approval requires a non-empty value.');
			}
			multipartSalvageSourceApprovals.push(approvalPath);
		} else if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			if (['help', 'resume', 'dry-run', 'preflight-only'].includes(key)) {
				throw new Error(`--${key} is a boolean flag and does not accept a value.`);
			}
			if (!valueOptions.has(key)) throw new Error(`Unknown option --${key}.`);
			if (values.has(key)) throw new Error(`Duplicate --${key} option.`);
			const value = rest.join('=');
			if (!value) throw new Error(`--${key} requires a non-empty value.`);
			values.set(key, value);
		} else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}.`);
		else throw new Error(`Unexpected positional argument ${arg}.`);
	}
	if (new Set(shards).size !== shards.length) {
		throw new Error('Duplicate --shard values are not allowed.');
	}
	const concurrency = integer(values.get('concurrency') ?? 2, '--concurrency', 1, 6);
	const verificationRepairRequested = values.has('repair-verification');
	const maxAttempts = integer(
		values.get('max-attempts') ??
			(verificationRepairRequested ? SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS : 3),
		'--max-attempts',
		1,
		5
	);
	if (
		verificationRepairRequested &&
		maxAttempts !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
	) {
		throw new Error(
			`--repair-verification requires --max-attempts=${SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS}; omitting it safely uses that immutable ceiling.`
		);
	}
	const reviewRebaseRequested = values.has('review-rebase-manifest');
	if (reviewRebaseRequested && !verificationRepairRequested) {
		throw new Error('--review-rebase-manifest requires --repair-verification.');
	}
	const reviewRebaseInfrastructureRecoveryRequested = values.has(
		'review-rebase-infrastructure-recovery'
	);
	if (
		reviewRebaseInfrastructureRecoveryRequested &&
		(!verificationRepairRequested || !reviewRebaseRequested)
	) {
		throw new Error(
			'--review-rebase-infrastructure-recovery requires --repair-verification and --review-rebase-manifest.'
		);
	}
	const timeoutMs = integer(values.get('timeout-ms') ?? 7_200_000, '--timeout-ms', 1, 14_400_000);
	const transport = String(values.get('transport') ?? CODEX_SDK_TRANSPORT);
	if (![CODEX_SDK_TRANSPORT, SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT].includes(transport)) {
		throw new Error(
			`--transport must be ${CODEX_SDK_TRANSPORT} or ${SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT}.`
		);
	}
	if (values.get('preflight-only') && transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT) {
		throw new Error('--preflight-only is valid only with --transport=llm-direct.');
	}
	if (values.get('preflight-only') && values.get('dry-run')) {
		throw new Error('--preflight-only and --dry-run cannot be combined.');
	}
	if (values.has('preflight-output') && !values.get('preflight-only')) {
		throw new Error('--preflight-output requires --preflight-only.');
	}
	if (
		multipartSalvageSourceApprovals.length > 0 &&
		(!values.has('repair-verification') ||
			!values.get('resume') ||
			values.get('preflight-only'))
	) {
		throw new Error(
			'--multipart-salvage-source-approval requires --repair-verification and --resume, and cannot be combined with preflight.'
		);
	}
	const directPartSize = values.has('direct-part-size')
		? integer(values.get('direct-part-size'), '--direct-part-size', 1, 7)
		: null;
	if (directPartSize !== null && transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT) {
		throw new Error('--direct-part-size is valid only with --transport=llm-direct.');
	}
	if (values.has('direct-response-mode') && transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT) {
		throw new Error('--direct-response-mode is valid only with --transport=llm-direct.');
	}
	const directResponseMode =
		transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT
			? String(
					values.get('direct-response-mode') ??
						SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
				)
			: null;
	if (
		directResponseMode !== null &&
		![
			SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
			SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
		].includes(directResponseMode)
	) {
		throw new Error('--direct-response-mode must be structured-json or prompt-json.');
	}
	const thinkingLevel = String(values.get('thinking-level') ?? THINKING_LEVEL);
	if (
		thinkingLevel !== THINKING_LEVEL &&
		!(
			transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
			directResponseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
			thinkingLevel === 'high'
		)
	) {
		throw new Error(
			'--thinking-level must be max; only llm-direct prompt-json may explicitly use high.'
		);
	}
	if (
		reviewRebaseRequested &&
		(transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
			directResponseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ||
			thinkingLevel !== 'high' ||
			directPartSize !== 2 ||
			maxAttempts !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
			values.get('preflight-only') ||
			multipartSalvageSourceApprovals.length > 0)
	) {
		throw new Error(
			'--review-rebase-manifest repair requires exact --transport=llm-direct, --direct-response-mode=prompt-json, --thinking-level=high, --direct-part-size=2 and --max-attempts=4, and cannot use preflight-only or exhausted-repair recovery flags.'
		);
	}
	if (
		reviewRebaseInfrastructureRecoveryRequested &&
		(!values.get('resume') ||
			values.get('preflight-only') ||
			multipartSalvageSourceApprovals.length > 0 ||
			shards.length > 0)
	) {
		throw new Error(
			'--review-rebase-infrastructure-recovery requires --resume and the complete rejected cohort, and cannot use preflight-only, --shard, multipart salvage approval or exhausted-multipart continuation.'
		);
	}
	return {
		help: Boolean(values.get('help')),
		resume: Boolean(values.get('resume')),
		dryRun: Boolean(values.get('dry-run')),
		preflightOnly: Boolean(values.get('preflight-only')),
		multipartSalvageSourceApprovals,
		preflightOutput: values.has('preflight-output') ? String(values.get('preflight-output')) : null,
		shards,
		plan: String(values.get('plan') ?? 'tmp/science-challenges/candidate-release/plan.json'),
		source: String(values.get('source') ?? 'tmp/science-challenge-sources-v1.json'),
		evidence: String(
			values.get('evidence') ?? 'tmp/science-challenges/candidate-release/curriculum-evidence.json'
		),
		catalogSource: values.has('catalog-source')
			? String(values.get('catalog-source'))
			: (process.env.CHALLENGE_CATALOG_SOURCE ?? null),
		outputRoot: String(
			values.get('output-root') ?? 'tmp/science-challenges/candidate-release/generation'
		),
		repairVerification: values.has('repair-verification')
			? String(values.get('repair-verification'))
			: null,
		reviewRebaseManifest: reviewRebaseRequested
			? String(values.get('review-rebase-manifest'))
			: null,
		reviewRebaseInfrastructureRecovery: reviewRebaseInfrastructureRecoveryRequested
			? String(values.get('review-rebase-infrastructure-recovery'))
			: null,
		transport,
		directResponseMode,
		directPartSize,
		model: String(
			values.get('model') ??
				(transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT
					? SCIENCE_CHALLENGE_DIRECT_JSON_MODEL
					: CODEX_SDK_MODEL)
		),
		thinkingLevel,
		concurrency,
		maxAttempts,
		timeoutMs
	};
}

function integer(value, label, minimum, maximum) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
	}
	return parsed;
}

function usage() {
	return [
		'Usage: node scripts/generate-science-challenges.mjs [options]',
		'',
		'--plan=<plan.json>',
		'--source=<snapshot.json>',
		'--evidence=<curriculum-evidence.json>',
		'--catalog-source=<ignored JSON>  Optional active D1 catalogue export; otherwise read D1',
		'--output-root=<directory>  Typed recovery uses a distinct new/resumable publication sibling',
		'--shard=<id>              Repeat to select shards; default all',
		'--concurrency=<1-6>       Default 2',
		'--max-attempts=<1-5>      Default 3; verification repair requires exactly 4 and defaults to 4',
		'--timeout-ms=<number>',
		'--transport=codex-sdk|llm-direct  Default codex-sdk; never auto-falls back',
		'--direct-response-mode=structured-json|prompt-json  Default structured-json; llm-direct only',
		'--thinking-level=max|high  Default max; high is prompt-json llm-direct only; no fallback',
		'--direct-part-size=<1-7>  Opt-in ordered multipart authoring; llm-direct only',
		'--resume                   Reuse passed evidence or continue within the immutable attempt budget',
		'--repair-verification=<summary.json>  Repair rejected challenges with exactly four total attempts',
		'--review-rebase-manifest=<manifest.json>  Replay the exact B0 parent/ancestry for direct or later terminal-successor repair; requires exact llm-direct prompt-json/high/part-size-2 policy',
		'--review-rebase-infrastructure-recovery=<manifest.json>  Resume immutable recovery evidence into the distinct --output-root; requires --resume and the complete cohort',
		'--multipart-salvage-source-approval=<json>  Repeatable exact shard-bound terminal-source approval; requires repair --resume',
		'--preflight-only           Test direct auth/network/model without reading authoring evidence',
		'--preflight-output=<json>  Immutably retain the passed content-free preflight',
		'--dry-run                  Validate inputs, recovery binding, ledger parity and exact resume action without writes or model calls'
	].join('\n');
}
