import { createHash } from 'node:crypto';
import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import {
	buildScienceChallengeModelRunPolicyAttestation,
	isScienceChallengeDirectJsonRunSummary,
	isScienceChallengeDirectMultipartRunSummary,
	validateScienceChallengeModelRunPolicyAttestation
} from './science-challenge-authoring-run-policy.mjs';
import { scienceChallengeAuthoringInputPath } from './science-challenge-authoring-attempt.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';
import {
	SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_EVIDENCE_SCHEMA,
	SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_VALIDATION_SCHEMA
} from './science-challenge-multipart-plan-salvage-evidence.mjs';
import { SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SCHEMA } from './science-challenge-multipart-plan-salvage.mjs';
import {
	SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_PLAN_SCHEMA,
	SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_SCHEMA,
	SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_VALIDATION_SCHEMA
} from './science-challenge-multipart-continuation.mjs';
import { SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MULTIPART_INVOCATION_SCHEMA } from './science-challenge-verification-repair-lineage.mjs';
import { validateScienceChallengeDescendantRemapManifest } from './science-challenge-descendant-remap.mjs';
import {
	findScienceChallengeCurriculumRemapDurableLeaks,
	validateScienceChallengeCurriculumRemapDurableReceipt
} from './science-challenge-curriculum-remap-durable.mjs';
import {
	readScienceChallengeEffectiveCohort,
	validateScienceChallengeReviewRebaseSuccessorLineage
} from './science-challenge-effective-cohort.mjs';
import { validateScienceChallengeEffectiveReleaseGate } from './science-challenge-effective-release-gate.mjs';
import { readScienceChallengeReviewRebaseEvidence } from './science-challenge-review-rebase-evidence.mjs';
import {
	buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding,
	inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal,
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding
} from './science-challenge-review-rebase-infra-recovery.mjs';
import {
	buildScienceChallengeInfrastructureRecoveryArchiveClosure,
	findScienceChallengeInfrastructureRecoveryArchiveAbsolutePathLeaks,
	validateScienceChallengeInfrastructureRecoveryArchiveClosure
} from './science-challenge-infrastructure-recovery-archive.mjs';
import {
	SCIENCE_CHALLENGE_BATCH_SCHEMA,
	canonicalHash,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_PROVENANCE_ARCHIVE_SCHEMA =
	'science-challenge-provenance-archive/v1';
export const SCIENCE_CHALLENGE_SOURCE_HASH_INDEX_SCHEMA = 'science-challenge-source-hash-index/v1';
export const SCIENCE_CHALLENGE_CURRICULUM_HASH_INDEX_SCHEMA =
	'science-challenge-curriculum-hash-index/v1';
export const SCIENCE_CHALLENGE_ASSIGNMENT_HASH_INDEX_SCHEMA =
	'science-challenge-assignment-hash-index/v1';

const REQUIRED_TRACKED_KINDS = Object.freeze([
	'plan',
	'base-plan',
	'effective-plan',
	'source-hash-index',
	'curriculum-hash-index',
	'assignment-hash-index',
	'source-lineage',
	'sanitized-lineage',
	'content-generation-summary',
	'content-prompt',
	'content-final-message',
	'content-validation',
	'content-run-summary',
	'content-review-summary',
	'content-review-result',
	'art-generation-summary',
	'art-generation-prompt',
	'art-generation-job',
	'art-manifest',
	'art-delivery-manifest',
	'runtime-projection',
	'coverage',
	'art-perceptual-audit',
	'art-review-summary',
	'art-review-input',
	'art-review-request',
	'art-review-prompt',
	'art-review-final-message',
	'art-review-validation',
	'art-review-run-summary',
	'art-review-run-policy-attestation',
	'art-review-result'
]);

const REQUIRED_EXTERNAL_KINDS = Object.freeze([
	'full-source-snapshot',
	'full-curriculum-evidence',
	'full-curriculum-catalog',
	'full-verification-assignment',
	'full-content-prompt',
	'codex-event-log',
	'generated-art-image'
]);

const REQUIRED_DESCENDANT_REMAP_TRACKED_KINDS = Object.freeze([
	'curriculum-remap-durable-receipt',
	'effective-cohort-index',
	'effective-cohort-manifest',
	'effective-cohort-artifact',
	'content-descendant-remap-index',
	'content-descendant-remap-manifest',
	'content-descendant-remap-candidate',
	'content-descendant-remap-validation',
	'content-descendant-remap-effective-plan',
	'content-descendant-remap-provenance',
	'content-descendant-remap-first-review-summary',
	'content-descendant-remap-first-review-result',
	'content-descendant-remap-source-run-summary',
	'content-descendant-remap-source-validation',
	'content-descendant-remap-source-candidate',
	'content-descendant-remap-source-final-message',
	'content-descendant-remap-source-run-policy',
	'content-descendant-remap-objective',
	'content-descendant-remap-claim'
]);
const REQUIRED_DIFFICULTY_ADJUSTMENT_TRACKED_KINDS = Object.freeze([
	'effective-cohort-index',
	'effective-cohort-manifest',
	'effective-cohort-artifact',
	'content-difficulty-plan-adjustment-index',
	'content-difficulty-plan-adjustment-manifest',
	'content-difficulty-plan-adjustment-candidate',
	'content-difficulty-plan-adjustment-validation',
	'content-difficulty-plan-adjustment-effective-plan',
	'content-difficulty-plan-adjustment-provenance',
	'content-difficulty-plan-adjustment-first-review-summary',
	'content-difficulty-plan-adjustment-first-review-result',
	'content-difficulty-plan-adjustment-source-run-summary',
	'content-difficulty-plan-adjustment-source-validation',
	'content-difficulty-plan-adjustment-source-candidate',
	'content-difficulty-plan-adjustment-source-final-message',
	'content-difficulty-plan-adjustment-source-run-policy',
	'content-difficulty-plan-adjustment-objective',
	'content-difficulty-plan-adjustment-claim'
]);
const REQUIRED_CONTENT_PARENT_CHAIN_TRACKED_KINDS = Object.freeze([
	'content-parent-chain-index',
	'content-parent-chain-artifact',
	'content-parent-chain-existing-definitions'
]);
const REQUIRED_INFRASTRUCTURE_RECOVERY_TRACKED_KINDS = Object.freeze([
	'content-infrastructure-recovery-index',
	'content-infrastructure-recovery-closure'
]);

const CONTENT_PARENT_CHAIN_INDEX_SCHEMA =
	'science-challenge-content-parent-chain-provenance-index/v1';
const REVIEW_REBASE_SUCCESSOR_PARENT_KIND = 'review-rebase-successor';
const REVIEW_REBASE_PARENT_KIND = 'review-rebase';
const CONTENT_PARENT_CHAIN_REFERENCE_ROOT = 'content/parent-chain/repository';
const INFRASTRUCTURE_RECOVERY_INDEX_SCHEMA =
	'science-challenge-review-rebase-infrastructure-recovery-provenance-index/v1';
const INFRASTRUCTURE_RECOVERY_REFERENCE_ROOT = 'content/infrastructure-recovery';
const INFRASTRUCTURE_RECOVERY_CLOSURE_PATH =
	'content/infrastructure-recovery/terminal-closure.json';
const INFRASTRUCTURE_RECOVERY_INDEX_FIELDS = Object.freeze([
	'schemaVersion',
	'referenceRoot',
	'infrastructureRecovery',
	'infrastructureRecoverySha256',
	'releaseBindingsSha256',
	'sourceLineageSha256',
	'effectiveCohortManifestSha256',
	'acceptedCandidateSetSha256',
	'closureRef',
	'closureSha256',
	'evidencePathInventorySha256',
	'logicalLedgerSha256',
	'finalProposalSetSha256',
	'finalProposalOriginCounts',
	'frozenShardIds',
	'frozenShardSetSha256',
	'pendingShardIds',
	'shardPartitionSha256'
]);

const PROVENANCE_BINDING_FIELDS = Object.freeze([
	'planSha256',
	'basePlanSha256',
	'effectivePlanSha256',
	'sourceSnapshotSha256',
	'curriculumEvidenceSha256',
	'curriculumCatalogSha256',
	'effectiveCohortManifestSha256',
	'effectiveCohortCandidateSetSha256',
	'curriculumRemapVerifierInputSha256',
	'curriculumRemapDurableReceiptSha256',
	'descendantRemapManifestSetSha256',
	'curriculumRemapDecisionSetSha256',
	'difficultyPlanAdjustmentVerifierInputSha256',
	'difficultyAdjustmentManifestSetSha256',
	'recoverySetSha256',
	'difficultyPlanAdjustmentDecisionSetSha256',
	'contentVerificationSha256',
	'verifierDispatchLedgerSha256',
	'artManifestSha256',
	'artReviewSha256',
	'artPerceptualAuditSha256',
	'artDeliveryManifestSha256',
	'runtimeSha256',
	'shortRecallBundleSha256',
	'shortRecallReviewSha256',
	'coverageSha256',
	'lineageSha256',
	'contentGenerationLineageSha256',
	'contentParentLineageSha256',
	'artGenerationLineageSha256'
]);

const MULTIPART_PLAN_SALVAGE_DIRECTORY =
	/^verification-repair-[a-f0-9]{12}-multipart-plan-salvage$/;
const MULTIPART_CONTINUATION_DIRECTORY =
	/^verification-repair-[a-f0-9]{12}-attempt-04-multipart-continuation$/;
const VERIFICATION_REPAIR_ATTEMPT_DIRECTORY =
	/^verification-repair-([a-f0-9]{12})-attempt-(\d{2})$/;
const VERIFICATION_REPAIR_MAX_ATTEMPTS = 4;

export function scienceChallengeProvenanceBindings(metadata) {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
		throw new Error('release metadata must be an object.');
	}
	const bindings = Object.fromEntries(
		PROVENANCE_BINDING_FIELDS.map((field) => [field, metadata[field]])
	);
	validateExpectedBindings(bindings);
	return bindings;
}

function prepareProvenanceArchiveTransaction({ rootDir, archiveRoot }) {
	const workspaceRoot = path.resolve(rootDir);
	const finalRoot = path.resolve(workspaceRoot, archiveRoot);
	if (!isWithin(workspaceRoot, finalRoot)) {
		throw new Error('archiveRoot must stay inside the workspace.');
	}

	if (existsSync(finalRoot)) {
		const stats = lstatSync(finalRoot);
		if (stats.isSymbolicLink() || !stats.isDirectory()) {
			throw new Error('archiveRoot must be an ordinary directory path.');
		}
		if (readdirSync(finalRoot).length > 0) {
			throw new Error('archiveRoot must be empty before provenance is materialized.');
		}
		rmSync(finalRoot, { recursive: true, force: false });
	}

	const parentRoot = path.dirname(finalRoot);
	mkdirSync(parentRoot, { recursive: true });
	const stagingRoot = mkdtempSync(path.join(parentRoot, `.${path.basename(finalRoot)}-staging-`));
	return { finalRoot, stagingRoot };
}

/**
 * Materialize the durable, tracked subset of accepted science-challenge provenance.
 *
 * Full source/curriculum/assignment evidence, raw Codex event streams and image bytes are
 * deliberately not copied. Their byte/canonical hashes remain in externalDependencies.
 */
export function buildScienceChallengeProvenanceArchive(options) {
	const transaction = prepareProvenanceArchiveTransaction({
		rootDir: options?.rootDir,
		archiveRoot: options?.archiveRoot
	});
	try {
		const built = buildScienceChallengeProvenanceArchiveIntoPreparedRoot({
			...options,
			archiveRoot: transaction.stagingRoot
		});
		if (existsSync(transaction.finalRoot)) {
			throw new Error(
				'archiveRoot appeared while provenance was materializing; refusing to replace it.'
			);
		}
		renameSync(transaction.stagingRoot, transaction.finalRoot);
		const validation = validateScienceChallengeProvenanceArchive({
			archiveRoot: transaction.finalRoot,
			expectedBindings: options.expectedBindings,
			reviewRebaseValidators: options.reviewRebaseValidators ?? null
		});
		if (validation.status !== 'passed') {
			throw new Error(
				`Committed provenance archive validation failed:\n${validation.issues.join('\n')}`
			);
		}
		return {
			...built,
			archiveRoot: transaction.finalRoot,
			validation
		};
	} catch (error) {
		if (existsSync(transaction.stagingRoot)) {
			rmSync(transaction.stagingRoot, { recursive: true, force: true });
		}
		throw error;
	}
}

function buildScienceChallengeProvenanceArchiveIntoPreparedRoot({
	rootDir,
	archiveRoot,
	releaseId,
	materializedAt,
	expectedBindings,
	lineage,
	artManifest,
	artDeliveryManifest,
	runtime,
	coverage,
	planPath,
	effectivePlan = null,
	effectiveCohort = null,
	reviewRebaseEvidence = null,
	reviewRebaseInfrastructureRecoveryEvidence = null,
	reviewRebaseInfrastructureRecoveryTerminal = null,
	reviewRebaseExistingDefinitions = null,
	reviewRebaseValidators = null,
	curriculumCatalogPath = null,
	curriculumRemapVerifierInputSha256 = null,
	curriculumRemapDurableReceipt = null,
	descendantRemapRecoveries = [],
	difficultyPlanAdjustmentVerifierInputSha256 = null,
	difficultyPlanAdjustmentRecoveries = [],
	sourceSnapshotPath,
	curriculumEvidencePath,
	assignmentIndexPath,
	verifierDispatchLedgerPath,
	generationRoot,
	contentReviewPath,
	artGenerationRoot,
	artReviewRoot,
	artPerceptualAuditPath,
	repairRecoveryManifestPath = null,
	repairExecutionLedgerSnapshot = null
}) {
	const workspaceRoot = path.resolve(rootDir);
	const outputRoot = resolveArchiveRoot(workspaceRoot, archiveRoot);
	if (!safeId(releaseId)) throw new Error('releaseId must be a safe kebab-case identifier.');
	if (!validIsoDate(materializedAt)) throw new Error('materializedAt must be an ISO date-time.');
	validateExpectedBindings(expectedBindings);
	if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) {
		throw new Error('lineage must be the accepted release lineage object.');
	}
	assertBinding('lineageSha256', canonicalHash(lineage), expectedBindings.lineageSha256);
	assertBinding(
		'contentGenerationLineageSha256',
		canonicalHash(lineage.content),
		expectedBindings.contentGenerationLineageSha256
	);
	assertBinding(
		'artGenerationLineageSha256',
		canonicalHash(lineage.art),
		expectedBindings.artGenerationLineageSha256
	);
	const contentParentChain = lineage.effectiveCohort?.parentChain ?? null;
	const reviewRebaseSuccessorArchiveRequired =
		contentParentChain?.kind === REVIEW_REBASE_SUCCESSOR_PARENT_KIND;
	const infrastructureRecoveryBinding = lineage.effectiveCohort?.infrastructureRecovery ?? null;
	const infrastructureRecoveryArchiveRequired = infrastructureRecoveryBinding !== null;
	if (infrastructureRecoveryArchiveRequired) {
		validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(
			infrastructureRecoveryBinding
		);
	}
	if (
		contentParentChain !== null &&
		(!reviewRebaseSuccessorArchiveRequired ||
			typeof contentParentChain !== 'object' ||
			Array.isArray(contentParentChain))
	) {
		throw new Error(
			`lineage.effectiveCohort.parentChain must be null or kind ${REVIEW_REBASE_SUCCESSOR_PARENT_KIND}.`
		);
	}
	assertBinding(
		'contentParentLineageSha256',
		contentParentChain ? canonicalHash(contentParentChain) : null,
		expectedBindings.contentParentLineageSha256
	);
	if (!artManifest || typeof artManifest !== 'object' || Array.isArray(artManifest)) {
		throw new Error('artManifest must be the exact release art manifest object.');
	}
	if (
		!artDeliveryManifest ||
		typeof artDeliveryManifest !== 'object' ||
		Array.isArray(artDeliveryManifest)
	) {
		throw new Error('artDeliveryManifest must be the exact release delivery manifest object.');
	}
	if (!coverage || typeof coverage !== 'object' || Array.isArray(coverage)) {
		throw new Error('coverage must be the exact release coverage object.');
	}
	if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)) {
		throw new Error('runtime must be the exact release runtime projection object.');
	}
	assertBinding(
		'artManifestSha256',
		canonicalHash(artManifest),
		expectedBindings.artManifestSha256
	);
	assertBinding(
		'artDeliveryManifestSha256',
		canonicalHash(artDeliveryManifest),
		expectedBindings.artDeliveryManifestSha256
	);
	assertBinding('runtimeSha256', canonicalHash(runtime), expectedBindings.runtimeSha256);
	assertBinding('coverageSha256', canonicalHash(coverage), expectedBindings.coverageSha256);

	const planFile = requiredWorkspaceFile(workspaceRoot, planPath, 'plan');
	const sourceFile = requiredWorkspaceFile(workspaceRoot, sourceSnapshotPath, 'source snapshot');
	const curriculumFile = requiredWorkspaceFile(
		workspaceRoot,
		curriculumEvidencePath,
		'curriculum evidence'
	);
	const assignmentIndexFile = requiredWorkspaceFile(
		workspaceRoot,
		assignmentIndexPath,
		'assignment index'
	);
	const dispatchLedgerFile = requiredWorkspaceFile(
		workspaceRoot,
		verifierDispatchLedgerPath,
		'verifier dispatch ledger'
	);
	const contentReviewFile = requiredWorkspaceFile(
		workspaceRoot,
		contentReviewPath,
		'content review summary'
	);
	const artPerceptualAuditFile = requiredWorkspaceFile(
		workspaceRoot,
		artPerceptualAuditPath,
		'art perceptual audit'
	);

	const plan = readJson(planFile);
	const exactEffectivePlan = effectivePlan ?? plan;
	const sourceSnapshot = readJson(sourceFile);
	const curriculumEvidence = readJson(curriculumFile);
	const assignmentIndex = readJson(assignmentIndexFile);
	const dispatchLedger = readJson(dispatchLedgerFile);
	const contentReview = readJson(contentReviewFile);
	const artPerceptualAudit = readJson(artPerceptualAuditFile);
	const artReviewSummary = readJson(
		path.join(
			requiredWorkspaceDirectory(workspaceRoot, artReviewRoot, 'art review root'),
			'review-summary.json'
		)
	);
	const assignmentIndexSha256 = canonicalHash(assignmentIndex);
	const dispatchLedgerSha256 = canonicalHash(dispatchLedger);
	if (
		dispatchLedger.indexSha256 !== assignmentIndexSha256 ||
		contentReview.indexSha256 !== assignmentIndexSha256 ||
		contentReview.dispatchLedgerSha256 !== dispatchLedgerSha256 ||
		contentReview.candidateSetSha256 !== assignmentIndex.candidateSetSha256
	) {
		throw new Error(
			'Assignment index, dispatch ledger and content review do not describe the same verification run.'
		);
	}

	assertBinding('planSha256', canonicalHash(plan), expectedBindings.planSha256);
	assertBinding('basePlanSha256', canonicalHash(plan), expectedBindings.basePlanSha256);
	assertBinding(
		'effectivePlanSha256',
		canonicalHash(exactEffectivePlan),
		expectedBindings.effectivePlanSha256
	);
	const remapArchiveRequired = descendantRemapRecoveries.length > 0;
	const difficultyArchiveRequired = difficultyPlanAdjustmentRecoveries.length > 0;
	const typedRecoveryArchiveRequired = remapArchiveRequired || difficultyArchiveRequired;
	const effectiveCohortArchiveRequired =
		typedRecoveryArchiveRequired || reviewRebaseSuccessorArchiveRequired;
	if (
		effectiveCohortArchiveRequired !== Boolean(effectiveCohort) ||
		remapArchiveRequired !== Boolean(curriculumRemapVerifierInputSha256) ||
		remapArchiveRequired !== Boolean(curriculumRemapDurableReceipt) ||
		difficultyArchiveRequired !== Boolean(difficultyPlanAdjustmentVerifierInputSha256) ||
		reviewRebaseSuccessorArchiveRequired !== Boolean(reviewRebaseEvidence) ||
		reviewRebaseSuccessorArchiveRequired !== Array.isArray(reviewRebaseExistingDefinitions) ||
		infrastructureRecoveryArchiveRequired !== Boolean(reviewRebaseInfrastructureRecoveryEvidence) ||
		infrastructureRecoveryArchiveRequired !== Boolean(reviewRebaseInfrastructureRecoveryTerminal)
	) {
		throw new Error(
			'Effective-cohort ancestry, typed recoveries and their exact verifier evidence must be supplied together.'
		);
	}
	if (typedRecoveryArchiveRequired && reviewRebaseSuccessorArchiveRequired) {
		throw new Error(
			'Review-rebase successor ancestry cannot be combined with typed recovery provenance.'
		);
	}
	if (effectiveCohortArchiveRequired) {
		assertBinding(
			'effectiveCohortManifestSha256',
			canonicalHash(effectiveCohort.manifest),
			expectedBindings.effectiveCohortManifestSha256
		);
		assertBinding(
			'effectiveCohortCandidateSetSha256',
			effectiveCohort.candidateSetSha256,
			expectedBindings.effectiveCohortCandidateSetSha256
		);
		assertBinding(
			'recoverySetSha256',
			effectiveCohort.manifest.recoverySetSha256,
			expectedBindings.recoverySetSha256
		);
		if (
			canonicalHash(effectiveCohort.manifest.infrastructureRecovery ?? null) !==
			canonicalHash(infrastructureRecoveryBinding)
		) {
			throw new Error('Release lineage infrastructure recovery differs from the effective cohort.');
		}
	}
	if (remapArchiveRequired) {
		const receiptValidation = validateScienceChallengeCurriculumRemapDurableReceipt(
			curriculumRemapDurableReceipt
		);
		if (
			receiptValidation.status !== 'passed' ||
			findScienceChallengeCurriculumRemapDurableLeaks(curriculumRemapDurableReceipt).length > 0
		) {
			throw new Error(
				`Curriculum-remap durable receipt is invalid:\n${receiptValidation.issues.join('\n')}`
			);
		}
		assertBinding(
			'curriculumRemapVerifierInputSha256',
			curriculumRemapVerifierInputSha256,
			expectedBindings.curriculumRemapVerifierInputSha256
		);
		assertBinding(
			'curriculumRemapDurableReceiptSha256',
			canonicalHash(curriculumRemapDurableReceipt),
			expectedBindings.curriculumRemapDurableReceiptSha256
		);
		assertBinding(
			'descendantRemapManifestSetSha256',
			canonicalHash(descendantRemapRecoveries.map((recovery) => recovery.manifest)),
			expectedBindings.descendantRemapManifestSetSha256
		);
		const remapDecisions = (contentReview.reviews ?? []).flatMap(
			(review) => review.curriculumRemapDecisions ?? []
		);
		assertBinding(
			'curriculumRemapDecisionSetSha256',
			curriculumRemapDurableReceipt.decisionSetSha256,
			expectedBindings.curriculumRemapDecisionSetSha256
		);
		if (
			curriculumRemapDurableReceipt.verifierInputSha256 !== curriculumRemapVerifierInputSha256 ||
			curriculumRemapDurableReceipt.effectiveCohortManifestSha256 !==
				canonicalHash(effectiveCohort.manifest) ||
			curriculumRemapDurableReceipt.candidateSetSha256 !== effectiveCohort.candidateSetSha256 ||
			curriculumRemapDurableReceipt.recoverySetSha256 !==
				effectiveCohort.manifest.recoverySetSha256 ||
			curriculumRemapDurableReceipt.decisionSetSha256 !== canonicalHash(remapDecisions) ||
			curriculumRemapDurableReceipt.remapManifestSetSha256 !==
				expectedBindings.descendantRemapManifestSetSha256
		) {
			throw new Error(
				'Curriculum-remap durable receipt differs from the accepted review or effective cohort.'
			);
		}
	} else if (
		expectedBindings.curriculumRemapVerifierInputSha256 !== null ||
		expectedBindings.curriculumRemapDurableReceiptSha256 !== null ||
		expectedBindings.descendantRemapManifestSetSha256 !== null ||
		expectedBindings.curriculumRemapDecisionSetSha256 !== null
	) {
		throw new Error('Non-remap provenance bindings must use null descendant-remap hashes.');
	}
	if (difficultyArchiveRequired) {
		assertBinding(
			'difficultyPlanAdjustmentVerifierInputSha256',
			difficultyPlanAdjustmentVerifierInputSha256,
			expectedBindings.difficultyPlanAdjustmentVerifierInputSha256
		);
		assertBinding(
			'difficultyAdjustmentManifestSetSha256',
			canonicalHash(difficultyPlanAdjustmentRecoveries.map((recovery) => recovery.manifest)),
			expectedBindings.difficultyAdjustmentManifestSetSha256
		);
		const difficultyDecisions = (contentReview.reviews ?? []).flatMap(
			(review) => review.difficultyPlanAdjustmentDecisions ?? []
		);
		assertBinding(
			'difficultyPlanAdjustmentDecisionSetSha256',
			canonicalHash(difficultyDecisions),
			expectedBindings.difficultyPlanAdjustmentDecisionSetSha256
		);
		if (
			difficultyDecisions.length === 0 ||
			difficultyDecisions.some((decision) => decision?.accepted !== true) ||
			contentReview.difficultyPlanAdjustmentVerifierInputSha256 !==
				difficultyPlanAdjustmentVerifierInputSha256 ||
			contentReview.acceptedDifficultyPlanAdjustmentDecisionCount !== difficultyDecisions.length ||
			contentReview.rejectedDifficultyPlanAdjustmentDecisionCount !== 0 ||
			contentReview.recoverySetSha256 !== effectiveCohort.manifest.recoverySetSha256 ||
			effectiveCohort.manifest.difficultyAdjustmentManifestSetSha256 !==
				expectedBindings.difficultyAdjustmentManifestSetSha256
		) {
			throw new Error(
				'Difficulty-plan adjustment review differs from the effective cohort or release bindings.'
			);
		}
	} else if (
		expectedBindings.difficultyPlanAdjustmentVerifierInputSha256 !== null ||
		expectedBindings.difficultyAdjustmentManifestSetSha256 !== null ||
		expectedBindings.difficultyPlanAdjustmentDecisionSetSha256 !== null
	) {
		throw new Error(
			'Non-adjustment provenance bindings must use null difficulty-plan adjustment hashes.'
		);
	}
	if (
		!effectiveCohortArchiveRequired &&
		(expectedBindings.effectiveCohortManifestSha256 !== null ||
			expectedBindings.effectiveCohortCandidateSetSha256 !== null ||
			expectedBindings.recoverySetSha256 !== null)
	) {
		throw new Error('Non-cohort provenance bindings must use null effective-cohort hashes.');
	}
	let curriculumCatalogFile = null;
	if (curriculumCatalogPath) {
		curriculumCatalogFile = requiredWorkspaceFile(
			workspaceRoot,
			curriculumCatalogPath,
			'curriculum catalog'
		);
		assertBinding(
			'curriculumCatalogSha256',
			canonicalHash(readJson(curriculumCatalogFile)),
			expectedBindings.curriculumCatalogSha256
		);
	} else {
		throw new Error('curriculumCatalogPath is required for the bound curriculum catalog.');
	}
	assertBinding(
		'sourceSnapshotSha256',
		canonicalHash(sourceSnapshot),
		expectedBindings.sourceSnapshotSha256
	);
	assertBinding(
		'curriculumEvidenceSha256',
		canonicalHash(curriculumEvidence),
		expectedBindings.curriculumEvidenceSha256
	);
	assertBinding(
		'contentVerificationSha256',
		canonicalHash(contentReview),
		expectedBindings.contentVerificationSha256
	);
	assertBinding(
		'verifierDispatchLedgerSha256',
		canonicalHash(dispatchLedger),
		expectedBindings.verifierDispatchLedgerSha256
	);
	assertBinding(
		'artReviewSha256',
		canonicalHash(artReviewSummary),
		expectedBindings.artReviewSha256
	);
	assertBinding(
		'artPerceptualAuditSha256',
		canonicalHash(artPerceptualAudit),
		expectedBindings.artPerceptualAuditSha256
	);

	const trackedArtifacts = [];
	const externalDependencies = [];
	const sourceBindings = new Map();
	const addTracked = (kind, source, destination) => {
		const sourceFilePath = requiredWorkspaceFile(workspaceRoot, source, kind);
		const archivePath = safeArchivePath(destination);
		const existing = trackedArtifacts.find((artifact) => artifact.path === archivePath);
		if (existing) {
			if (existing.sha256 !== sha256(readFileSync(sourceFilePath))) {
				throw new Error(`Archive destination ${archivePath} was reused for different bytes.`);
			}
			bindSource(sourceBindings, sourceFilePath, existing);
			return existing;
		}
		const destinationPath = path.join(outputRoot, archivePath);
		mkdirSync(path.dirname(destinationPath), { recursive: true });
		copyFileSync(sourceFilePath, destinationPath);
		const record = fileRecord(kind, destinationPath, outputRoot);
		trackedArtifacts.push(record);
		bindSource(sourceBindings, sourceFilePath, record);
		return record;
	};
	const writeTrackedJson = (kind, destination, value) => {
		const archivePath = safeArchivePath(destination);
		const destinationPath = path.join(outputRoot, archivePath);
		mkdirSync(path.dirname(destinationPath), { recursive: true });
		writeFileSync(destinationPath, `${stableStringify(value)}\n`);
		const record = fileRecord(kind, destinationPath, outputRoot);
		trackedArtifacts.push(record);
		return record;
	};
	const writeTrackedText = (kind, destination, value, metadata = {}) => {
		const archivePath = safeArchivePath(destination);
		const destinationPath = path.join(outputRoot, archivePath);
		mkdirSync(path.dirname(destinationPath), { recursive: true });
		writeFileSync(destinationPath, value);
		const record = { ...fileRecord(kind, destinationPath, outputRoot), ...metadata };
		trackedArtifacts.push(record);
		return record;
	};
	const addExternal = (kind, id, source, options = {}) => {
		const sourceFilePath = requiredWorkspaceFile(workspaceRoot, source, kind);
		const bytes = readFileSync(sourceFilePath);
		const record = {
			kind,
			id: safeDependencyId(id),
			sha256: sha256(bytes),
			bytes: bytes.length
		};
		if (options.json) record.canonicalSha256 = canonicalHash(JSON.parse(bytes.toString('utf8')));
		if (options.eventLog) record.eventCount = countJsonLines(bytes, sourceFilePath);
		externalDependencies.push(record);
		bindSource(sourceBindings, sourceFilePath, record);
		return record;
	};

	addTracked('plan', planFile, 'plan.json');
	addTracked('base-plan', planFile, 'plans/base-plan.json');
	writeTrackedJson('effective-plan', 'plans/effective-plan.json', exactEffectivePlan);
	writeTrackedJson(
		'source-hash-index',
		'indices/source-hashes.json',
		buildSourceHashIndex(sourceSnapshot)
	);
	writeTrackedJson(
		'curriculum-hash-index',
		'indices/curriculum-hashes.json',
		buildCurriculumHashIndex(curriculumEvidence)
	);
	writeTrackedJson(
		'assignment-hash-index',
		'indices/assignment-hashes.json',
		buildAssignmentHashIndex(assignmentIndex, dispatchLedger)
	);
	writeTrackedJson('art-manifest', 'art/manifest.json', artManifest);
	writeTrackedJson('art-delivery-manifest', 'art/delivery-manifest.json', artDeliveryManifest);
	writeTrackedJson('runtime-projection', 'runtime.json', runtime);
	writeTrackedJson('coverage', 'coverage.json', coverage);
	addTracked('art-perceptual-audit', artPerceptualAuditFile, 'art/perceptual-audit.json');
	addExternal('full-source-snapshot', 'source-snapshot', sourceFile, { json: true });
	addExternal('full-curriculum-evidence', 'curriculum-evidence', curriculumFile, { json: true });
	if (curriculumCatalogFile) {
		addExternal('full-curriculum-catalog', 'curriculum-catalog', curriculumCatalogFile, {
			json: true
		});
	}
	for (const assignment of assignmentIndex.assignments ?? []) {
		addExternal(
			'full-verification-assignment',
			`assignment-${assignment.assignmentId}`,
			assignment.path,
			{ json: true }
		);
	}

	archiveContentGeneration({
		workspaceRoot,
		outputRoot,
		generationRoot,
		lineage,
		addTracked,
		writeTrackedText,
		addExternal
	});
	let effectiveCohortArchive = null;
	if (effectiveCohortArchiveRequired) {
		effectiveCohortArchive = archiveEffectiveCohortEvidence({
			workspaceRoot,
			generationRoot,
			effectiveCohort,
			curriculumRemapDurableReceipt,
			addTracked,
			writeTrackedJson
		});
	}
	if (infrastructureRecoveryArchiveRequired) {
		archiveReviewRebaseInfrastructureRecoveryEvidence({
			workspaceRoot,
			infrastructureRecoveryBinding,
			reviewRebaseInfrastructureRecoveryEvidence,
			reviewRebaseInfrastructureRecoveryTerminal,
			releaseBindingsSha256: canonicalHash(expectedBindings),
			sourceLineageSha256: canonicalHash(lineage),
			effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
			acceptedCandidateSetSha256: effectiveCohort.candidateSetSha256,
			addTracked,
			writeTrackedJson
		});
	}
	if (remapArchiveRequired) {
		archiveDescendantRemapEvidence({
			workspaceRoot,
			lineage,
			curriculumRemapVerifierInputSha256,
			curriculumRemapDurableReceipt,
			effectiveCohort,
			effectiveCohortArchive,
			descendantRemapRecoveries,
			contentReview,
			addTracked,
			writeTrackedJson,
			writeTrackedText,
			addExternal
		});
	}
	if (difficultyArchiveRequired) {
		archiveDifficultyPlanAdjustmentEvidence({
			workspaceRoot,
			lineage,
			difficultyPlanAdjustmentVerifierInputSha256,
			effectiveCohort,
			effectiveCohortArchive,
			difficultyPlanAdjustmentRecoveries,
			contentReview,
			addTracked,
			writeTrackedJson,
			writeTrackedText,
			addExternal
		});
	}
	if (repairRecoveryManifestPath) {
		const recoverySource = requiredWorkspaceFile(
			workspaceRoot,
			repairRecoveryManifestPath,
			'content repair recovery'
		);
		const recoveryManifest = readJson(recoverySource);
		const recovery = addTracked(
			'content-repair-recovery',
			recoverySource,
			'content/verification-repair-recovery.json'
		);
		if (
			lineage.recovery?.sha256 !== recovery.canonicalSha256 ||
			lineage.recovery?.objectiveId !== recoveryManifest.objectiveId ||
			lineage.recovery?.executionId !== recoveryManifest.executionId ||
			lineage.recovery?.executionLedgerSha256 !== canonicalHash(repairExecutionLedgerSnapshot)
		) {
			throw new Error('Release lineage does not bind the verification-repair recovery manifest.');
		}
		archiveVerificationRepairPredecessorEvidence({
			workspaceRoot,
			planFile,
			recoveryManifest,
			addTracked,
			writeTrackedJson
		});
		writeTrackedJson(
			'content-repair-execution-ledger',
			'content/verification-repair-execution-ledger.json',
			repairExecutionLedgerSnapshot
		);
	} else if (lineage.recovery !== null && lineage.recovery !== undefined) {
		throw new Error('Release lineage claims recovery evidence that was not supplied.');
	}

	const contentReviewRecord = addTracked(
		'content-review-summary',
		contentReviewFile,
		'reviews/content/summary.json'
	);
	for (const result of contentReview.assignmentResults ?? []) {
		addTracked(
			'content-review-result',
			result.path,
			`reviews/content/results/${safeFilename(result.assignmentId)}.json`
		);
	}
	if (reviewRebaseSuccessorArchiveRequired) {
		archiveReviewRebaseSuccessorParentChain({
			workspaceRoot,
			contentParentChain,
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence,
			reviewRebaseExistingDefinitions,
			reviewRebaseValidators,
			effectiveCohort,
			effectiveCohortArchive,
			contentReview,
			contentReviewRecord,
			addTracked,
			writeTrackedJson
		});
	}

	archiveArtGeneration({
		workspaceRoot,
		artGenerationRoot,
		addTracked,
		addExternal
	});
	archiveArtReview({
		workspaceRoot,
		artReviewRoot,
		addTracked,
		writeTrackedJson,
		addExternal
	});
	archiveLineageArtifacts({
		workspaceRoot,
		lineage,
		addTracked,
		addExternal,
		writeTrackedText
	});
	writeTrackedJson('source-lineage', 'source-lineage.json', lineage);
	writeTrackedJson(
		'sanitized-lineage',
		'lineage.json',
		buildSanitizedLineage(workspaceRoot, lineage, sourceBindings, trackedArtifacts)
	);

	trackedArtifacts.sort(compareRecords);
	externalDependencies.sort(compareRecords);
	const manifest = {
		schemaVersion: SCIENCE_CHALLENGE_PROVENANCE_ARCHIVE_SCHEMA,
		releaseId,
		materializedAt: new Date(materializedAt).toISOString(),
		bindings: sortBindings(expectedBindings),
		trackedArtifacts,
		externalDependencies
	};
	writeFileSync(path.join(outputRoot, 'manifest.json'), `${stableStringify(manifest)}\n`);

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot: outputRoot,
		expectedBindings,
		reviewRebaseValidators
	});
	if (validation.status !== 'passed') {
		throw new Error(`Provenance archive validation failed:\n${validation.issues.join('\n')}`);
	}
	return { manifest, manifestSha256: canonicalHash(manifest), validation };
}

export function validateScienceChallengeProvenanceArchive({
	archiveRoot,
	expectedBindings,
	reviewRebaseValidators = null
}) {
	const issues = [];
	const bindings =
		expectedBindings && typeof expectedBindings === 'object' && !Array.isArray(expectedBindings)
			? expectedBindings
			: {};
	const outputRoot = path.resolve(archiveRoot);
	const manifestPath = path.join(outputRoot, 'manifest.json');
	if (!existsSync(manifestPath)) return failed(['manifest.json is missing.']);
	let realOutputRoot;
	try {
		const rootStats = lstatSync(outputRoot);
		if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
			return failed(['archiveRoot must be a real directory, not a symlink.']);
		}
		realOutputRoot = realpathSync(outputRoot);
		const manifestStats = lstatSync(manifestPath);
		if (manifestStats.isSymbolicLink() || !manifestStats.isFile()) {
			return failed(['manifest.json must be a regular file, not a symlink.']);
		}
		if (!isWithin(realOutputRoot, realpathSync(manifestPath))) {
			return failed(['manifest.json resolves outside the provenance archive.']);
		}
	} catch (error) {
		return failed([error instanceof Error ? error.message : String(error)]);
	}
	let manifest;
	try {
		manifest = readJson(manifestPath);
	} catch (error) {
		return failed([error instanceof Error ? error.message : String(error)]);
	}
	if (manifest.schemaVersion !== SCIENCE_CHALLENGE_PROVENANCE_ARCHIVE_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_CHALLENGE_PROVENANCE_ARCHIVE_SCHEMA}.`);
	}
	if (!safeId(manifest.releaseId)) issues.push('releaseId must be a safe kebab-case identifier.');
	if (!validIsoDate(manifest.materializedAt))
		issues.push('materializedAt must be an ISO date-time.');

	try {
		validateExpectedBindings(expectedBindings);
		for (const [field, expected] of Object.entries(sortBindings(bindings))) {
			if (manifest.bindings?.[field] !== expected) issues.push(`bindings.${field} differs.`);
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}

	const tracked = Array.isArray(manifest.trackedArtifacts) ? manifest.trackedArtifacts : [];
	if (!Array.isArray(manifest.trackedArtifacts)) issues.push('trackedArtifacts must be an array.');
	const seenPaths = new Set();
	for (const [index, artifact] of tracked.entries()) {
		const prefix = `trackedArtifacts[${index}]`;
		if (!artifact || typeof artifact !== 'object') {
			issues.push(`${prefix} must be an object.`);
			continue;
		}
		if (!nonEmpty(artifact.kind)) issues.push(`${prefix}.kind is required.`);
		let archivePath;
		try {
			archivePath = safeArchivePath(artifact.path);
		} catch (error) {
			issues.push(`${prefix}: ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}
		const archivedVerificationRepairAttempt = archivePath.match(
			/^content\/shards\/[^/]+\/attempts\/verification-repair-[a-f0-9]{12}-attempt-(\d{2})(?:\/|$)/
		);
		if (
			archivedVerificationRepairAttempt &&
			Number(archivedVerificationRepairAttempt[1]) > VERIFICATION_REPAIR_MAX_ATTEMPTS
		) {
			issues.push(`${prefix} records a verification-repair attempt after four.`);
		}
		const approvedPreModelRecoveryEvent =
			artifact.kind === 'content-repair-predecessor-evidence' &&
			archivePath.startsWith('content/recovery-predecessors/');
		if (
			(/\.(?:jsonl|ndjson)$/i.test(archivePath) || /(^|\/)events(?:\.|\/)/i.test(archivePath)) &&
			!approvedPreModelRecoveryEvent
		) {
			issues.push(`${prefix} must not track a raw event stream.`);
		}
		if (seenPaths.has(archivePath)) issues.push(`${prefix}.path is duplicated.`);
		seenPaths.add(archivePath);
		const filePath = path.join(outputRoot, archivePath);
		if (!existsSync(filePath)) {
			issues.push(`${prefix} is missing from the archive.`);
			continue;
		}
		const fileStats = lstatSync(filePath);
		if (
			fileStats.isSymbolicLink() ||
			!fileStats.isFile() ||
			!isWithin(realOutputRoot, realpathSync(filePath))
		) {
			issues.push(`${prefix} must be a regular file contained in the provenance archive.`);
			continue;
		}
		const bytes = readFileSync(filePath);
		if (!sha256String(artifact.sha256) || sha256(bytes) !== artifact.sha256) {
			issues.push(`${prefix}.sha256 differs from the archived bytes.`);
		}
		if (artifact.bytes !== bytes.length)
			issues.push(`${prefix}.bytes differs from the archived file.`);
		if (artifact.kind === 'content-prompt') {
			if (
				artifact.redaction !== 'official-authoring-input' ||
				!sha256String(artifact.sourceSha256) ||
				!nonEmpty(artifact.externalDependencyId)
			) {
				issues.push(`${prefix} has incomplete prompt-redaction provenance.`);
			}
			const prompt = bytes.toString('utf8');
			if (!prompt.includes('official authoring input omitted from tracked archive')) {
				issues.push(`${prefix} does not contain the required input redaction marker.`);
			}
		}
	}
	for (const kind of REQUIRED_TRACKED_KINDS) {
		if (!tracked.some((artifact) => artifact?.kind === kind)) {
			issues.push(`Missing required tracked artifact kind ${kind}.`);
		}
	}
	const descendantRemapBound = sha256String(bindings.curriculumRemapVerifierInputSha256);
	if (descendantRemapBound) {
		for (const kind of REQUIRED_DESCENDANT_REMAP_TRACKED_KINDS) {
			if (!tracked.some((artifact) => artifact?.kind === kind)) {
				issues.push(`Missing required descendant-remap tracked artifact kind ${kind}.`);
			}
		}
	}
	const difficultyAdjustmentBound = sha256String(
		bindings.difficultyPlanAdjustmentVerifierInputSha256
	);
	if (difficultyAdjustmentBound) {
		for (const kind of REQUIRED_DIFFICULTY_ADJUSTMENT_TRACKED_KINDS) {
			if (!tracked.some((artifact) => artifact?.kind === kind)) {
				issues.push(`Missing required difficulty-plan adjustment tracked artifact kind ${kind}.`);
			}
		}
	}
	const contentParentChainBound = sha256String(bindings.contentParentLineageSha256);
	if (contentParentChainBound) {
		for (const kind of REQUIRED_CONTENT_PARENT_CHAIN_TRACKED_KINDS) {
			if (!tracked.some((artifact) => artifact?.kind === kind)) {
				issues.push(`Missing required content-parent-chain tracked artifact kind ${kind}.`);
			}
		}
	}
	const allowedArchiveFiles = new Set([
		'manifest.json',
		...tracked.map((artifact) => artifact.path)
	]);
	try {
		for (const archivePath of listRelativeFiles(outputRoot)) {
			if (!allowedArchiveFiles.has(archivePath)) {
				issues.push(`Untracked file is present in the provenance archive: ${archivePath}.`);
			}
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}

	const external = Array.isArray(manifest.externalDependencies)
		? manifest.externalDependencies
		: [];
	if (!Array.isArray(manifest.externalDependencies)) {
		issues.push('externalDependencies must be an array.');
	}
	const externalIds = new Set();
	for (const [index, dependency] of external.entries()) {
		const prefix = `externalDependencies[${index}]`;
		if (!nonEmpty(dependency?.kind) || !nonEmpty(dependency?.id)) {
			issues.push(`${prefix} requires kind and id.`);
		}
		const key = `${dependency?.kind}:${dependency?.id}`;
		if (externalIds.has(key)) issues.push(`${prefix} is duplicated.`);
		externalIds.add(key);
		if (!sha256String(dependency?.sha256)) issues.push(`${prefix}.sha256 is invalid.`);
		if (!Number.isInteger(dependency?.bytes) || dependency.bytes < 0) {
			issues.push(`${prefix}.bytes is invalid.`);
		}
		if (dependency?.canonicalSha256 !== undefined && !sha256String(dependency.canonicalSha256)) {
			issues.push(`${prefix}.canonicalSha256 is invalid.`);
		}
		if (
			[
				'codex-event-log',
				'direct-json-event-log',
				'direct-json-multipart-event-index',
				'direct-prompt-json-event-log',
				'direct-prompt-json-multipart-event-index'
			].includes(dependency?.kind) &&
			(!Number.isInteger(dependency.eventCount) || dependency.eventCount < 1)
		) {
			issues.push(`${prefix}.eventCount must be a positive integer.`);
		}
		for (const forbiddenField of ['path', 'sourcePath', 'content', 'text', 'events']) {
			if (Object.hasOwn(dependency ?? {}, forbiddenField)) {
				issues.push(`${prefix}.${forbiddenField} must not be retained.`);
			}
		}
	}
	for (const kind of REQUIRED_EXTERNAL_KINDS) {
		if (!external.some((dependency) => dependency?.kind === kind)) {
			issues.push(`Missing required external dependency kind ${kind}.`);
		}
	}
	if (
		descendantRemapBound &&
		!external.some((dependency) => dependency?.kind === 'full-descendant-remap-first-assignment')
	) {
		issues.push(
			'Missing required external dependency kind full-descendant-remap-first-assignment.'
		);
	}
	for (const artifact of tracked.filter((entry) => entry?.kind === 'content-prompt')) {
		const dependency = external.find(
			(entry) => entry.kind === 'full-content-prompt' && entry.id === artifact.externalDependencyId
		);
		if (!dependency || dependency.sha256 !== artifact.sourceSha256) {
			issues.push(`Tracked content prompt ${artifact.path} is not bound to its full prompt hash.`);
		}
	}

	validateSanitizedIndex(
		path.join(outputRoot, 'indices/source-hashes.json'),
		(index) => [
			...validateSourceHashIndex(index),
			...(index.sourceSnapshotSha256 === bindings.sourceSnapshotSha256
				? []
				: ['source hash index does not bind the expected source snapshot.'])
		],
		issues
	);
	validateSanitizedIndex(
		path.join(outputRoot, 'indices/curriculum-hashes.json'),
		(index) => [
			...validateCurriculumHashIndex(index),
			...(index.curriculumEvidenceSha256 === bindings.curriculumEvidenceSha256
				? []
				: ['curriculum hash index does not bind the expected curriculum evidence.'])
		],
		issues
	);
	validateSanitizedIndex(
		path.join(outputRoot, 'indices/assignment-hashes.json'),
		(index) => [
			...validateAssignmentHashIndex(index),
			...(index.planSha256 === bindings.planSha256
				? []
				: ['assignment hash index does not bind the expected plan.']),
			...(index.sourceSnapshotSha256 === bindings.sourceSnapshotSha256
				? []
				: ['assignment hash index does not bind the expected source snapshot.']),
			...(index.curriculumEvidenceSha256 === bindings.curriculumEvidenceSha256
				? []
				: ['assignment hash index does not bind the expected curriculum evidence.'])
		],
		issues
	);
	validateExternalBindings(external, bindings, outputRoot, issues);
	for (const [archivePath, expected, label] of [
		['plan.json', bindings.planSha256, 'plan'],
		['plans/base-plan.json', bindings.basePlanSha256, 'base plan'],
		['plans/effective-plan.json', bindings.effectivePlanSha256, 'effective plan'],
		['reviews/content/summary.json', bindings.contentVerificationSha256, 'content review summary'],
		['art/manifest.json', bindings.artManifestSha256, 'art manifest'],
		['art/delivery-manifest.json', bindings.artDeliveryManifestSha256, 'art delivery manifest'],
		['runtime.json', bindings.runtimeSha256, 'runtime projection'],
		['coverage.json', bindings.coverageSha256, 'coverage'],
		['art/perceptual-audit.json', bindings.artPerceptualAuditSha256, 'art perceptual audit'],
		['reviews/art/summary.json', bindings.artReviewSha256, 'art review summary']
	]) {
		validateTrackedCanonicalBinding(tracked, archivePath, expected, label, issues);
	}
	if (descendantRemapBound) {
		for (const [archivePath, expected, label] of [
			[
				'content/curriculum-remap/durable-receipt.json',
				bindings.curriculumRemapDurableReceiptSha256,
				'curriculum remap durable receipt'
			],
			[
				'content/effective-cohort-index.json',
				tracked.find((artifact) => artifact?.path === 'content/effective-cohort-index.json')
					?.canonicalSha256,
				'effective cohort index'
			]
		]) {
			validateTrackedCanonicalBinding(tracked, archivePath, expected, label, issues);
		}
	}
	validateTrackedCanonicalBinding(
		tracked,
		'source-lineage.json',
		bindings.lineageSha256,
		'source release lineage',
		issues
	);
	let sourceLineage = null;
	try {
		sourceLineage = readJson(path.join(outputRoot, 'source-lineage.json'));
		if (
			canonicalHash(sourceLineage.content) !== bindings.contentGenerationLineageSha256 ||
			canonicalHash(sourceLineage.art) !== bindings.artGenerationLineageSha256
		) {
			issues.push('Tracked source lineage does not bind its content and art lineage roots.');
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
	if (sourceLineage?.effectiveCohort?.infrastructureRecovery) {
		for (const kind of REQUIRED_INFRASTRUCTURE_RECOVERY_TRACKED_KINDS) {
			if (!tracked.some((artifact) => artifact?.kind === kind)) {
				issues.push(`Missing required infrastructure-recovery tracked artifact kind ${kind}.`);
			}
		}
	}
	validateReviewPayloadBindings(outputRoot, tracked, external, issues);
	validateSanitizedLineageArchive({
		filePath: path.join(outputRoot, 'lineage.json'),
		expectedLineageSha256: bindings.lineageSha256,
		expectedContentLineageSha256: bindings.contentGenerationLineageSha256,
		expectedArtLineageSha256: bindings.artGenerationLineageSha256,
		sourceLineage,
		tracked,
		external,
		issues
	});
	validateArchivedVerificationRepairPredecessorEvidence({
		archiveRoot: outputRoot,
		tracked,
		issues
	});
	validateArchivedMultipartPlanSalvageEvidence({
		archiveRoot: outputRoot,
		sourceLineage,
		tracked,
		external,
		issues
	});
	validateArchivedMultipartContinuationEvidence({
		archiveRoot: outputRoot,
		sourceLineage,
		tracked,
		external,
		issues
	});
	validateArchivedDescendantRemapEvidence({
		archiveRoot: outputRoot,
		sourceLineage,
		tracked,
		external,
		expectedBindings: bindings,
		issues
	});
	validateArchivedDifficultyPlanAdjustmentEvidence({
		archiveRoot: outputRoot,
		sourceLineage,
		tracked,
		external,
		expectedBindings: bindings,
		issues
	});
	validateArchivedReviewRebaseSuccessorParentChain({
		archiveRoot: outputRoot,
		sourceLineage,
		tracked,
		external,
		expectedBindings: bindings,
		reviewRebaseValidators,
		issues
	});
	validateArchivedReviewRebaseInfrastructureRecovery({
		archiveRoot: outputRoot,
		sourceLineage,
		tracked,
		expectedBindings: bindings,
		issues
	});

	return issues.length ? failed(issues) : { status: 'passed', issues: [], manifest };
}

function validateArchivedReviewRebaseInfrastructureRecovery({
	archiveRoot,
	sourceLineage,
	tracked,
	expectedBindings,
	issues
}) {
	const binding = sourceLineage?.effectiveCohort?.infrastructureRecovery ?? null;
	const indexPath = path.join(archiveRoot, 'content/infrastructure-recovery/index.json');
	const recoveryClosures = tracked.filter(
		(artifact) => artifact?.kind === 'content-infrastructure-recovery-closure'
	);
	if (binding === null) {
		if (
			existsSync(indexPath) ||
			recoveryClosures.length > 0 ||
			tracked.some((artifact) => artifact?.kind === 'content-infrastructure-recovery-index')
		) {
			issues.push('Infrastructure-recovery archive evidence is unassigned to the release lineage.');
		}
		return;
	}
	try {
		validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(binding);
		if (!existsSync(indexPath)) {
			throw new Error('Infrastructure-recovery provenance index is missing.');
		}
		const index = readJson(indexPath);
		if (
			index.schemaVersion !== INFRASTRUCTURE_RECOVERY_INDEX_SCHEMA ||
			canonicalHash(Object.keys(index).sort()) !==
				canonicalHash([...INFRASTRUCTURE_RECOVERY_INDEX_FIELDS].sort()) ||
			index.referenceRoot !== INFRASTRUCTURE_RECOVERY_REFERENCE_ROOT ||
			canonicalHash(index.infrastructureRecovery) !== canonicalHash(binding) ||
			index.infrastructureRecoverySha256 !== canonicalHash(binding) ||
			index.releaseBindingsSha256 !== canonicalHash(expectedBindings) ||
			index.sourceLineageSha256 !== canonicalHash(sourceLineage) ||
			index.effectiveCohortManifestSha256 !== expectedBindings.effectiveCohortManifestSha256 ||
			index.acceptedCandidateSetSha256 !== expectedBindings.effectiveCohortCandidateSetSha256 ||
			index.logicalLedgerSha256 !== binding.logicalLedgerSha256 ||
			index.finalProposalSetSha256 !== binding.finalProposalSetSha256 ||
			!Array.isArray(index.frozenShardIds) ||
			!Array.isArray(index.pendingShardIds) ||
			index.pendingShardIds.length !== 0 ||
			recoveryClosures.length !== 1 ||
			recoveryClosures[0]?.path !== INFRASTRUCTURE_RECOVERY_CLOSURE_PATH ||
			index.closureRef?.storage !== 'tracked' ||
			index.closureRef?.kind !== 'content-infrastructure-recovery-closure' ||
			index.closureRef?.path !== INFRASTRUCTURE_RECOVERY_CLOSURE_PATH ||
			index.closureRef?.sha256 !== recoveryClosures[0]?.sha256 ||
			index.closureRef?.bytes !== recoveryClosures[0]?.bytes ||
			index.closureRef?.canonicalSha256 !== recoveryClosures[0]?.canonicalSha256
		) {
			throw new Error('Infrastructure-recovery provenance index is stale or incomplete.');
		}
		const closure = readJson(path.join(archiveRoot, INFRASTRUCTURE_RECOVERY_CLOSURE_PATH));
		const closureValidation = validateScienceChallengeInfrastructureRecoveryArchiveClosure({
			closure,
			infrastructureRecoveryBinding: binding,
			releaseBindingsSha256: index.releaseBindingsSha256,
			sourceLineageSha256: canonicalHash(sourceLineage),
			effectiveCohortManifestSha256: index.effectiveCohortManifestSha256,
			acceptedCandidateSetSha256: index.acceptedCandidateSetSha256
		});
		if (
			closureValidation.status !== 'passed' ||
			canonicalHash(closure) !== index.closureSha256 ||
			index.closureRef?.path !== INFRASTRUCTURE_RECOVERY_CLOSURE_PATH ||
			index.closureRef?.canonicalSha256 !== index.closureSha256 ||
			closure.evidencePathInventorySha256 !== index.evidencePathInventorySha256 ||
			closure.logicalLedgerSha256 !== index.logicalLedgerSha256 ||
			closure.finalProposalSetSha256 !== index.finalProposalSetSha256 ||
			canonicalHash(closure.finalProposalOriginCounts) !==
				canonicalHash(index.finalProposalOriginCounts) ||
			canonicalHash(closure.frozenShardIds) !== canonicalHash(index.frozenShardIds) ||
			closure.frozenShardSetSha256 !== index.frozenShardSetSha256 ||
			closure.shardPartitionSha256 !== index.shardPartitionSha256 ||
			findScienceChallengeInfrastructureRecoveryArchiveAbsolutePathLeaks(closure).length > 0
		) {
			throw new Error(
				`Infrastructure-recovery archived closure is stale or disconnected: ${closureValidation.issues.join(' ')}`
			);
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
}

export function buildSourceHashIndex(sourceSnapshot) {
	const sourceDocuments = (sourceSnapshot.sourceDocuments ?? []).map((document) => ({
		id: requiredId(document.id, 'source document id'),
		contentSha256: sourceDocumentHash(document)
	}));
	const questions = (sourceSnapshot.questions ?? []).map((question) => ({
		id: requiredId(question.id, 'source question id'),
		sourceDocumentId: requiredId(
			question.sourceDocumentId ?? question.source_document_id,
			'source question document id'
		),
		contentSha256: explicitOrCanonicalHash(question)
	}));
	return {
		schemaVersion: SCIENCE_CHALLENGE_SOURCE_HASH_INDEX_SCHEMA,
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		sourceDocumentCount: sourceDocuments.length,
		questionCount: questions.length,
		sourceDocuments,
		questions
	};
}

export function buildCurriculumHashIndex(curriculumEvidence) {
	const components = (curriculumEvidence.components ?? []).map((component) => ({
		componentId: requiredId(component.componentId, 'curriculum component id'),
		specificationId: requiredId(component.specificationId, 'specification id'),
		specificationSha256: requiredSha256(component.specificationSha256, 'specificationSha256'),
		contentSha256: canonicalHash(component)
	}));
	return {
		schemaVersion: SCIENCE_CHALLENGE_CURRICULUM_HASH_INDEX_SCHEMA,
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		componentCount: components.length,
		components
	};
}

export function buildAssignmentHashIndex(assignmentIndex, dispatchLedger) {
	const dispatchByAssignment = new Map(
		(dispatchLedger.dispatches ?? []).map((dispatch) => [dispatch.assignmentId, dispatch])
	);
	const assignments = (assignmentIndex.assignments ?? []).map((assignment) => {
		const dispatch = dispatchByAssignment.get(assignment.assignmentId);
		return {
			assignmentId: requiredId(assignment.assignmentId, 'assignment id'),
			assignmentSha256: requiredSha256(assignment.sha256, 'assignment sha256'),
			challengeIdsSha256: canonicalHash(assignment.ids ?? []),
			challengeCount: Array.isArray(assignment.ids) ? assignment.ids.length : 0,
			dispatchSha256: dispatch ? canonicalHash(dispatch) : null,
			taskNameSha256: dispatch?.taskName ? hashIdentifier(dispatch.taskName) : null
		};
	});
	return {
		schemaVersion: SCIENCE_CHALLENGE_ASSIGNMENT_HASH_INDEX_SCHEMA,
		planSha256: requiredSha256(assignmentIndex.planSha256, 'assignment planSha256'),
		sourceSnapshotSha256: requiredSha256(
			assignmentIndex.sourceSnapshotSha256,
			'assignment sourceSnapshotSha256'
		),
		curriculumEvidenceSha256: requiredSha256(
			assignmentIndex.curriculumEvidenceSha256,
			'assignment curriculumEvidenceSha256'
		),
		candidateSetSha256: requiredSha256(
			assignmentIndex.candidateSetSha256,
			'assignment candidateSetSha256'
		),
		assignmentIndexSha256: canonicalHash(assignmentIndex),
		dispatchLedgerSha256: canonicalHash(dispatchLedger),
		assignmentCount: assignments.length,
		assignments
	};
}

function archiveContentGeneration({
	workspaceRoot,
	outputRoot,
	generationRoot,
	lineage,
	addTracked,
	writeTrackedText,
	addExternal
}) {
	const generationDirectory = requiredWorkspaceDirectory(
		workspaceRoot,
		generationRoot,
		'content generation root'
	);
	for (const name of sortedFileNames(generationDirectory)) {
		if (/^(?:generation|verification-repair-[a-f0-9]{12})-summary\.json$/.test(name)) {
			addTracked(
				'content-generation-summary',
				path.join(generationDirectory, name),
				`content/generation-summaries/${name}`
			);
		}
	}
	const shardsRoot = path.join(generationDirectory, 'shards');
	for (const shard of sortedDirectories(shardsRoot)) {
		const shardRoot = path.join(shardsRoot, shard);
		assertMultipartPlanSalvageLineageCoverage({
			workspaceRoot,
			shardRoot,
			shardId: shard,
			sourceShard: (lineage.content ?? []).find((entry) => entry?.shardId === shard)
		});
		const canonicalAuthoringInputPath = path.join(shardRoot, 'input.json');
		if (existsSync(canonicalAuthoringInputPath)) {
			addExternal('full-authoring-input', `content-${shard}-input`, canonicalAuthoringInputPath, {
				json: true
			});
		}
		for (const repairDirectory of sortedDirectories(shardRoot).filter((name) =>
			/^verification-repair-[a-f0-9]{12}$/.test(name)
		)) {
			const repairInputPath = path.join(shardRoot, repairDirectory, 'input.json');
			if (!existsSync(repairInputPath)) continue;
			addExternal(
				'full-authoring-input',
				`content-${shard}-${repairDirectory}-input`,
				repairInputPath,
				{ json: true }
			);
		}
		for (const name of sortedFileNames(shardRoot)) {
			if (/^(?:verification-repair-[a-f0-9]{12}-)?prompt-attempt-\d+\.txt$/.test(name)) {
				const repairPrefix = name.match(
					/^verification-repair-([a-f0-9]{12})-prompt-attempt-\d+\.txt$/
				)?.[1];
				const authoringInputPath = scienceChallengeAuthoringInputPath({
					shardDir: shardRoot,
					repairSha256: repairPrefix ?? null
				});
				if (!existsSync(authoringInputPath)) {
					throw new Error(`${shard} has a prompt but no hashable input.json.`);
				}
				const authoringInputSha256 = canonicalHash(readJson(authoringInputPath));
				const promptPath = path.join(shardRoot, name);
				const dependency = addExternal(
					'full-content-prompt',
					`content-${shard}-${name.replace(/\.txt$/, '')}`,
					promptPath
				);
				writeTrackedText(
					'content-prompt',
					`content/shards/${safeFilename(shard)}/prompts/${name}`,
					sanitizeContentPrompt(readFileSync(promptPath, 'utf8'), authoringInputSha256),
					{
						sourceSha256: dependency.sha256,
						externalDependencyId: dependency.id,
						redaction: 'official-authoring-input'
					}
				);
			} else if (name === 'validation.json') {
				addTracked(
					'content-validation',
					path.join(shardRoot, name),
					`content/shards/${safeFilename(shard)}/accepted-validation.json`
				);
			}
		}
		for (const attempt of sortedDirectories(shardRoot).filter(isAttemptDirectory)) {
			const verificationRepairAttempt = verificationRepairAttemptNumber(attempt);
			if (
				verificationRepairAttempt !== null &&
				verificationRepairAttempt > VERIFICATION_REPAIR_MAX_ATTEMPTS
			) {
				throw new Error(`${shard}/${attempt} is a verification-repair attempt after four.`);
			}
			const attemptRoot = path.join(shardRoot, attempt);
			const destinationRoot = `content/shards/${safeFilename(shard)}/attempts/${safeFilename(attempt)}`;
			const runSummaryPath = path.join(attemptRoot, 'run-summary.json');
			const runSummary = existsSync(runSummaryPath) ? readJson(runSummaryPath) : null;
			const promptJsonTransport = isPromptJsonSingleSummary(runSummary);
			const directTransport =
				isScienceChallengeDirectJsonRunSummary(runSummary) || promptJsonTransport;
			const promptJsonMultipartTransport = isPromptJsonMultipartSummary(runSummary);
			const multipartTransport =
				isScienceChallengeDirectMultipartRunSummary(runSummary) || promptJsonMultipartTransport;
			const requestKind =
				promptJsonTransport || promptJsonMultipartTransport
					? 'direct-prompt-json-request'
					: 'direct-json-request';
			const eventKind =
				promptJsonTransport || promptJsonMultipartTransport
					? 'direct-prompt-json-event-log'
					: 'direct-json-event-log';
			for (const [name, kind] of [
				['last-message.json', 'content-final-message'],
				['validation.json', 'content-validation'],
				['run-summary.json', 'content-run-summary']
			]) {
				if (existsSync(path.join(attemptRoot, name))) {
					addTracked(kind, path.join(attemptRoot, name), `${destinationRoot}/${name}`);
				}
			}
			if (directTransport) {
				addTracked(
					'content-run-result-metadata',
					path.join(attemptRoot, 'result-metadata.json'),
					`${destinationRoot}/result-metadata.json`
				);
				addExternal(
					requestKind,
					`content-${shard}-${attempt}-request`,
					path.join(attemptRoot, 'request.json'),
					{ json: true }
				);
				addExternal(
					'model-thought-log',
					`content-${shard}-${attempt}-thoughts`,
					path.join(attemptRoot, 'thoughts.txt')
				);
			}
			if (multipartTransport) {
				if (!Array.isArray(runSummary.parts) || runSummary.parts.length < 1) {
					throw new Error(`${shard}/${attempt} has no ordered multipart run records.`);
				}
				for (const [index, record] of runSummary.parts.entries()) {
					const partId = `part-${String(index + 1).padStart(2, '0')}`;
					if (record?.partId !== partId || !sha256String(record.inputSha256)) {
						throw new Error(`${shard}/${attempt} has invalid multipart record ${partId}.`);
					}
					const partRoot = path.join(attemptRoot, 'parts', partId);
					const partDestination = `${destinationRoot}/parts/${partId}`;
					const partPromptPath = path.join(partRoot, 'prompt.txt');
					const promptDependency = addExternal(
						'full-content-prompt',
						`content-${shard}-${attempt}-${partId}-prompt`,
						partPromptPath
					);
					writeTrackedText(
						'content-prompt',
						`${partDestination}/prompt.txt`,
						sanitizeContentPrompt(readFileSync(partPromptPath, 'utf8'), record.inputSha256),
						{
							sourceSha256: promptDependency.sha256,
							externalDependencyId: promptDependency.id,
							redaction: 'official-authoring-input'
						}
					);
					for (const [name, kind] of [
						['last-message.json', 'content-part-final-message'],
						['run-summary.json', 'content-part-run-summary'],
						['result-metadata.json', 'content-part-run-result-metadata']
					]) {
						addTracked(kind, path.join(partRoot, name), `${partDestination}/${name}`);
					}
					addExternal(
						requestKind,
						`content-${shard}-${attempt}-${partId}-request`,
						path.join(partRoot, 'request.json'),
						{ json: true }
					);
					addExternal(
						'model-thought-log',
						`content-${shard}-${attempt}-${partId}-thoughts`,
						path.join(partRoot, 'thoughts.txt')
					);
					addExternal(
						eventKind,
						`content-${shard}-${attempt}-${partId}-events`,
						path.join(partRoot, 'events.jsonl'),
						{ eventLog: true }
					);
				}
			}
			const eventsPath = path.join(attemptRoot, 'events.jsonl');
			if (existsSync(eventsPath)) {
				addExternal(
					multipartTransport
						? promptJsonMultipartTransport
							? 'direct-prompt-json-multipart-event-index'
							: 'direct-json-multipart-event-index'
						: directTransport
							? eventKind
							: 'codex-event-log',
					`content-${shard}-${attempt}`,
					eventsPath,
					{ eventLog: true }
				);
			}
		}
	}
	void outputRoot;
}

function assertMultipartPlanSalvageLineageCoverage({
	workspaceRoot,
	shardRoot,
	shardId,
	sourceShard
}) {
	const discovered = sortedDirectories(shardRoot).filter((name) =>
		MULTIPART_PLAN_SALVAGE_DIRECTORY.test(name)
	);
	const salvage = sourceShard?.salvage ?? null;
	if (discovered.length > 1) {
		throw new Error(`${shardId} has multiple multipart plan-drift salvage directories.`);
	}
	if (discovered.length === 0 && salvage) {
		throw new Error(`${shardId} claims multipart plan-drift salvage whose evidence is missing.`);
	}
	if (discovered.length === 1 && !salvage) {
		throw new Error(
			`${shardId} omits discovered multipart plan-drift salvage from release lineage.`
		);
	}
	if (salvage) {
		const manifestPath = requiredWorkspaceFile(
			workspaceRoot,
			salvage.manifestPath,
			`${shardId} multipart plan-drift salvage manifest`
		);
		const expectedDirectory = path.join(shardRoot, discovered[0]);
		if (path.dirname(manifestPath) !== expectedDirectory) {
			throw new Error(`${shardId} multipart plan-drift salvage lineage selects another directory.`);
		}
	}

	const discoveredContinuations = sortedDirectories(shardRoot).filter((name) =>
		MULTIPART_CONTINUATION_DIRECTORY.test(name)
	);
	const continuation = sourceShard?.continuation ?? null;
	if (discoveredContinuations.length > 1) {
		throw new Error(`${shardId} has multiple exhausted multipart continuation directories.`);
	}
	if (discoveredContinuations.length === 0 && continuation) {
		throw new Error(`${shardId} claims multipart continuation whose evidence is missing.`);
	}
	if (discoveredContinuations.length === 1 && !continuation) {
		throw new Error(`${shardId} omits discovered multipart continuation from release lineage.`);
	}
	if (!continuation) return;
	const continuationManifestPath = requiredWorkspaceFile(
		workspaceRoot,
		continuation.manifestPath,
		`${shardId} multipart continuation manifest`
	);
	const expectedContinuationDirectory = path.join(shardRoot, discoveredContinuations[0]);
	if (path.dirname(continuationManifestPath) !== expectedContinuationDirectory) {
		throw new Error(`${shardId} multipart continuation lineage selects another directory.`);
	}
}

function archiveEffectiveCohortEvidence({
	workspaceRoot,
	generationRoot,
	effectiveCohort,
	curriculumRemapDurableReceipt,
	addTracked,
	writeTrackedJson
}) {
	const generationDirectory = requiredWorkspaceDirectory(
		workspaceRoot,
		generationRoot,
		'effective-cohort generation root'
	);
	const realGenerationDirectory = realpathSync(generationDirectory);
	const manifestFile = requiredWorkspaceFile(
		workspaceRoot,
		effectiveCohort.manifestPath,
		'effective-cohort manifest'
	);
	if (!isWithin(realGenerationDirectory, realpathSync(manifestFile))) {
		throw new Error('Effective-cohort manifest is outside its exact generation root.');
	}
	const manifestRelativePath = portableRelative(
		realGenerationDirectory,
		realpathSync(manifestFile),
		'effective-cohort manifest'
	);
	const manifestRecord = addTracked(
		'effective-cohort-manifest',
		manifestFile,
		`content/effective-cohort/${manifestRelativePath}`
	);
	if (
		manifestRecord.canonicalSha256 !== canonicalHash(effectiveCohort.manifest) ||
		manifestRecord.sha256 !== effectiveCohort.manifestFileSha256
	) {
		throw new Error('Effective-cohort manifest differs from exact replay.');
	}
	const referenceByPath = new Map();
	const seenManifestHashes = new Set([canonicalHash(effectiveCohort.manifest)]);
	const collectReference = (reference, label) => {
		if (
			!reference ||
			!nonEmpty(reference.path) ||
			!sha256String(reference.sha256) ||
			!sha256String(reference.canonicalSha256)
		) {
			throw new Error(`Effective-cohort ${label} contains an invalid artifact reference.`);
		}
		const existing = referenceByPath.get(reference.path);
		if (
			existing &&
			(existing.sha256 !== reference.sha256 ||
				existing.canonicalSha256 !== reference.canonicalSha256)
		) {
			throw new Error(
				'Effective-cohort manifest contains competing bindings for one artifact path.'
			);
		}
		referenceByPath.set(reference.path, reference);
	};
	const collectManifestClosure = (manifest) => {
		for (const [reference, label] of [
			[manifest.plans?.base, 'base plan'],
			[manifest.plans?.effective, 'effective plan'],
			[manifest.collectionValidation, 'collection validation'],
			...(manifest.review?.summary ? [[manifest.review.summary, 'fresh review summary']] : []),
			...(manifest.verificationRepairAuthority
				? [[manifest.verificationRepairAuthority, 'verification-repair authority']]
				: []),
			...(manifest.shards ?? []).flatMap((shard) => [
				[shard.candidate, `${shard.shardId} candidate`],
				[shard.validation, `${shard.shardId} validation`],
				...(['descendant-remap', 'difficulty-plan-adjustment'].includes(shard.disposition)
					? [
							[shard.lineage?.manifest, `${shard.shardId} typed recovery manifest`],
							[shard.lineage?.priorCandidate, `${shard.shardId} typed recovery prior candidate`]
						]
					: [])
			])
		]) {
			collectReference(reference, label);
		}
		if (!manifest.predecessor) return;
		const predecessorReference = manifest.predecessor.manifest;
		collectReference(predecessorReference, 'predecessor manifest');
		const predecessorPath = requiredWorkspaceFile(
			workspaceRoot,
			path.join(generationDirectory, predecessorReference.path),
			'effective-cohort predecessor manifest'
		);
		if (!isWithin(realGenerationDirectory, realpathSync(predecessorPath))) {
			throw new Error('Effective-cohort predecessor manifest escapes its generation root.');
		}
		const predecessorBytes = readFileSync(predecessorPath);
		const predecessorManifest = JSON.parse(predecessorBytes.toString('utf8'));
		const predecessorHash = canonicalHash(predecessorManifest);
		if (
			sha256(predecessorBytes) !== predecessorReference.sha256 ||
			predecessorHash !== predecessorReference.canonicalSha256 ||
			predecessorHash !== manifest.predecessor.manifestCanonicalSha256
		) {
			throw new Error('Effective-cohort predecessor manifest differs from its binding.');
		}
		if (seenManifestHashes.has(predecessorHash)) {
			throw new Error('Effective-cohort predecessor chain contains a cycle.');
		}
		seenManifestHashes.add(predecessorHash);
		collectManifestClosure(predecessorManifest);
	};
	collectManifestClosure(effectiveCohort.manifest);
	const artifactRefs = [];
	const recordsByReferencePath = new Map();
	for (const [relativePath, reference] of [...referenceByPath].sort(([left], [right]) =>
		left.localeCompare(right)
	)) {
		const sourcePath = requiredWorkspaceFile(
			workspaceRoot,
			path.join(generationDirectory, relativePath),
			`effective-cohort artifact ${relativePath}`
		);
		if (!isWithin(realGenerationDirectory, realpathSync(sourcePath))) {
			throw new Error(`Effective-cohort artifact escapes its generation root: ${relativePath}.`);
		}
		const bytes = readFileSync(sourcePath);
		const value = JSON.parse(bytes.toString('utf8'));
		if (sha256(bytes) !== reference.sha256 || canonicalHash(value) !== reference.canonicalSha256) {
			throw new Error(`Effective-cohort artifact differs from its binding: ${relativePath}.`);
		}
		const record = addTracked(
			'effective-cohort-artifact',
			sourcePath,
			`content/effective-cohort/${relativePath}`
		);
		recordsByReferencePath.set(relativePath, record);
		artifactRefs.push(artifactReference(record));
	}
	const receiptRecord = curriculumRemapDurableReceipt
		? writeTrackedJson(
				'curriculum-remap-durable-receipt',
				'content/curriculum-remap/durable-receipt.json',
				curriculumRemapDurableReceipt
			)
		: null;
	const index = {
		schemaVersion: 'science-challenge-effective-cohort-provenance-index/v1',
		referenceRoot: 'content/effective-cohort',
		manifestPath: manifestRelativePath,
		manifestSha256: canonicalHash(effectiveCohort.manifest),
		manifestFileSha256: manifestRecord.sha256,
		basePlanSha256: effectiveCohort.manifest.basePlanSha256,
		effectivePlanSha256: effectiveCohort.manifest.effectivePlanSha256,
		candidateCount: effectiveCohort.manifest.candidateCount,
		candidateSetSha256: effectiveCohort.candidateSetSha256,
		remapManifestSetSha256: effectiveCohort.manifest.remapManifestSetSha256,
		difficultyAdjustmentManifestSetSha256:
			effectiveCohort.manifest.difficultyAdjustmentManifestSetSha256,
		recoverySetSha256: effectiveCohort.manifest.recoverySetSha256,
		manifestRef: artifactReference(manifestRecord),
		artifactCount: artifactRefs.length,
		artifactRefs,
		durableReceiptRef: receiptRecord ? artifactReference(receiptRecord) : null,
		durableReceiptSha256: receiptRecord ? canonicalHash(curriculumRemapDurableReceipt) : null
	};
	const indexRecord = writeTrackedJson(
		'effective-cohort-index',
		'content/effective-cohort-index.json',
		index
	);
	return {
		index,
		indexRecord,
		manifestRecord,
		receiptRecord,
		artifactRecords: [...recordsByReferencePath.values()],
		recordsByReferencePath
	};
}

function effectiveCohortArtifactReferencePaths(replay) {
	const paths = new Set();
	let cursor = replay;
	while (cursor?.manifest) {
		const manifest = cursor.manifest;
		for (const referencePath of [
			manifest.plans?.base?.path,
			manifest.plans?.effective?.path,
			manifest.collectionValidation?.path,
			manifest.review?.summary?.path,
			manifest.verificationRepairAuthority?.path,
			...(manifest.shards ?? []).flatMap((shard) => [
				shard.candidate?.path,
				shard.validation?.path,
				...(['descendant-remap', 'difficulty-plan-adjustment'].includes(shard.disposition)
					? [shard.lineage?.manifest?.path, shard.lineage?.priorCandidate?.path]
					: [])
			]),
			manifest.predecessor?.manifest?.path
		]) {
			if (nonEmpty(referencePath)) paths.add(referencePath);
		}
		cursor = cursor.predecessor ?? null;
	}
	return [...paths];
}

function archiveReviewRebaseInfrastructureRecoveryEvidence({
	workspaceRoot,
	infrastructureRecoveryBinding,
	reviewRebaseInfrastructureRecoveryEvidence,
	reviewRebaseInfrastructureRecoveryTerminal,
	releaseBindingsSha256,
	sourceLineageSha256,
	effectiveCohortManifestSha256,
	acceptedCandidateSetSha256,
	writeTrackedJson
}) {
	const replayedTerminal = inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
		evidence: reviewRebaseInfrastructureRecoveryEvidence,
		referenceRoot: workspaceRoot
	});
	if (
		replayedTerminal.status !== 'passed' ||
		canonicalHash(replayedTerminal) !== canonicalHash(reviewRebaseInfrastructureRecoveryTerminal)
	) {
		throw new Error('Infrastructure-recovery terminal evidence differs from closed-world replay.');
	}
	const binding = buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
		evidence: replayedTerminal,
		referenceRoot: workspaceRoot
	});
	if (
		canonicalHash(binding) !== canonicalHash(infrastructureRecoveryBinding) ||
		canonicalHash(replayedTerminal.evidencePaths) !== replayedTerminal.evidencePathInventorySha256
	) {
		throw new Error(
			'Infrastructure-recovery binding or evidence-path inventory differs from replay.'
		);
	}
	const seenSourcePaths = new Set();
	for (const sourceRecord of replayedTerminal.evidencePaths) {
		if (
			!sourceRecord ||
			Object.keys(sourceRecord).sort().join(',') !== 'byteLength,path,sha256' ||
			!nonEmpty(sourceRecord.path) ||
			!Number.isInteger(sourceRecord.byteLength) ||
			sourceRecord.byteLength < 0 ||
			!sha256String(sourceRecord.sha256) ||
			seenSourcePaths.has(sourceRecord.path)
		) {
			throw new Error(
				'Infrastructure-recovery evidence-path inventory is malformed or duplicated.'
			);
		}
		seenSourcePaths.add(sourceRecord.path);
		const sourcePath = requiredWorkspaceFile(
			workspaceRoot,
			sourceRecord.path,
			`infrastructure-recovery evidence ${sourceRecord.path}`
		);
		const bytes = readFileSync(sourcePath);
		if (bytes.length !== sourceRecord.byteLength || sha256(bytes) !== sourceRecord.sha256) {
			throw new Error(
				`Infrastructure-recovery evidence differs from inventory: ${sourceRecord.path}.`
			);
		}
	}
	if (!seenSourcePaths.has(infrastructureRecoveryBinding.manifestPath)) {
		throw new Error(
			'Infrastructure-recovery live evidence inventory does not include its bound manifest.'
		);
	}
	const closure = buildScienceChallengeInfrastructureRecoveryArchiveClosure({
		infrastructureRecoveryBinding,
		terminal: replayedTerminal,
		releaseBindingsSha256,
		sourceLineageSha256,
		effectiveCohortManifestSha256,
		acceptedCandidateSetSha256
	});
	const closureRecord = writeTrackedJson(
		'content-infrastructure-recovery-closure',
		INFRASTRUCTURE_RECOVERY_CLOSURE_PATH,
		closure
	);
	const index = {
		schemaVersion: INFRASTRUCTURE_RECOVERY_INDEX_SCHEMA,
		referenceRoot: INFRASTRUCTURE_RECOVERY_REFERENCE_ROOT,
		infrastructureRecovery: structuredClone(infrastructureRecoveryBinding),
		infrastructureRecoverySha256: canonicalHash(infrastructureRecoveryBinding),
		releaseBindingsSha256,
		sourceLineageSha256,
		effectiveCohortManifestSha256,
		acceptedCandidateSetSha256,
		closureRef: artifactReference(closureRecord),
		closureSha256: canonicalHash(closure),
		evidencePathInventorySha256: replayedTerminal.evidencePathInventorySha256,
		logicalLedgerSha256: replayedTerminal.logicalLedgerSha256,
		finalProposalSetSha256: replayedTerminal.finalProposalSetSha256,
		finalProposalOriginCounts: structuredClone(replayedTerminal.finalProposalOriginCounts),
		frozenShardIds: structuredClone(replayedTerminal.frozenShardIds),
		frozenShardSetSha256: closure.frozenShardSetSha256,
		pendingShardIds: structuredClone(replayedTerminal.pendingShardIds),
		shardPartitionSha256: closure.shardPartitionSha256
	};
	writeTrackedJson(
		'content-infrastructure-recovery-index',
		'content/infrastructure-recovery/index.json',
		index
	);
	return index;
}

function archiveReviewRebaseSuccessorParentChain({
	workspaceRoot,
	contentParentChain,
	reviewRebaseEvidence,
	reviewRebaseInfrastructureRecoveryEvidence,
	reviewRebaseExistingDefinitions,
	reviewRebaseValidators,
	effectiveCohort,
	effectiveCohortArchive,
	contentReview,
	contentReviewRecord,
	addTracked,
	writeTrackedJson
}) {
	validateReviewRebaseSuccessorParentChainShape(contentParentChain);
	if (
		reviewRebaseEvidence?.status !== 'passed' ||
		realpathSync(reviewRebaseEvidence.repositoryRoot) !== realpathSync(workspaceRoot)
	) {
		throw new Error(
			'Review-rebase successor archive requires a live replay from the exact workspace root.'
		);
	}
	const liveReplay = readScienceChallengeReviewRebaseEvidence({
		repositoryRoot: workspaceRoot,
		manifestPath: reviewRebaseEvidence.manifestPathRelative,
		existingDefinitions: reviewRebaseExistingDefinitions,
		...reviewRebaseValidatorOptions(reviewRebaseValidators)
	});
	if (liveReplay.status !== 'passed') {
		throw new Error(
			`Review-rebase parent replay failed before archival:\n${liveReplay.issues.join('\n')}`
		);
	}
	if (canonicalHash(liveReplay.manifest) !== canonicalHash(reviewRebaseEvidence.manifest)) {
		throw new Error('Review-rebase parent changed after its supplied replay.');
	}
	const manifest = liveReplay.manifest;
	const core = liveReplay.coreManifest;
	const existingDefinitionsBinding = manifest.evidence?.inputs?.existingDefinitions;
	if (
		!Array.isArray(reviewRebaseExistingDefinitions) ||
		existingDefinitionsBinding?.count !== reviewRebaseExistingDefinitions.length ||
		existingDefinitionsBinding?.canonicalSha256 !== canonicalHash(reviewRebaseExistingDefinitions)
	) {
		throw new Error('Review-rebase existing definitions differ from the B0 evidence binding.');
	}
	const collectionRemediationTargetIds = reviewRebaseCollectionRemediationTargetIds(manifest);
	for (const [field, actual] of [
		['reviewRebaseManifestSha256', canonicalHash(manifest)],
		['reviewRebaseId', core.rebaseId],
		['parentVerificationSha256', core.parent?.verificationSha256],
		['parentRepairSha256', core.parent?.repairSha256],
		['reviewRebasePlanSha256', canonicalHash(liveReplay.plan)],
		['reviewRebaseCandidateSetSha256', core.candidateSetSha256],
		['reviewRebaseCollectionValidationSha256', core.collectionValidationSha256],
		['reviewRebaseCollectionRemediationSetSha256', core.collectionRemediationSetSha256],
		[
			'reviewRebaseCollectionRemediationTargetSetSha256',
			canonicalHash(collectionRemediationTargetIds)
		]
	]) {
		if (contentParentChain[field] !== actual) {
			throw new Error(`Review-rebase successor parentChain.${field} differs from B0.`);
		}
	}

	const firstVerificationReference = effectiveCohort.manifest.review?.summary;
	const firstVerificationRecord = effectiveCohortArchive.recordsByReferencePath.get(
		firstVerificationReference?.path
	);
	if (!firstVerificationRecord) {
		throw new Error('Review-rebase successor omits its V1 verification summary from S1 closure.');
	}
	const firstVerification = readJson(
		requiredWorkspaceFile(
			workspaceRoot,
			effectiveCohortArtifactSourcePath(effectiveCohort, firstVerificationReference),
			'review-rebase successor V1 verification'
		)
	);
	const mutableTargetIds = reviewRebaseMutableTargetIds({
		firstVerification,
		collectionRemediationTargetIds
	});
	validateReviewRebaseSuccessorChainLinks({
		parentChain: contentParentChain,
		reviewRebase: liveReplay,
		reviewRebaseInfrastructureRecoveryEvidence,
		firstVerification,
		mutableTargetIds,
		effectiveCohort,
		contentReview
	});

	const repositoryRecordsByRole = new Map();
	const repositoryRecordsByPath = new Map();
	const addRepositoryBinding = (role, binding) => {
		if (
			!binding ||
			!nonEmpty(binding.path) ||
			!sha256String(binding.fileSha256) ||
			!sha256String(binding.canonicalSha256)
		) {
			throw new Error(`Review-rebase B0 ${role} binding is incomplete.`);
		}
		const relativePath = normalizedRepositoryRelativePath(binding.path, `B0 ${role}`);
		const sourcePath = requiredWorkspaceFile(workspaceRoot, relativePath, `B0 ${role}`);
		const bytes = readFileSync(sourcePath);
		const value = JSON.parse(bytes.toString('utf8'));
		if (sha256(bytes) !== binding.fileSha256 || canonicalHash(value) !== binding.canonicalSha256) {
			throw new Error(`Review-rebase B0 ${role} differs from its filesystem evidence.`);
		}
		const destination = `${CONTENT_PARENT_CHAIN_REFERENCE_ROOT}/${relativePath}`;
		const existing = repositoryRecordsByPath.get(destination);
		if (
			existing &&
			(existing.sha256 !== binding.fileSha256 ||
				existing.canonicalSha256 !== binding.canonicalSha256)
		) {
			throw new Error('Review-rebase B0 reuses one repository path for competing evidence.');
		}
		const record = existing ?? addTracked('content-parent-chain-artifact', sourcePath, destination);
		repositoryRecordsByPath.set(destination, record);
		repositoryRecordsByRole.set(role, record);
		return record;
	};
	for (const { role, binding } of reviewRebaseFilesystemBindings(manifest)) {
		addRepositoryBinding(role, binding);
	}
	const manifestPath = normalizedRepositoryRelativePath(
		liveReplay.manifestPathRelative,
		'B0 manifest'
	);
	const manifestFile = requiredWorkspaceFile(workspaceRoot, manifestPath, 'B0 manifest');
	const manifestBytes = readFileSync(manifestFile);
	const manifestRecord = addTracked(
		'content-parent-chain-artifact',
		manifestFile,
		`${CONTENT_PARENT_CHAIN_REFERENCE_ROOT}/${manifestPath}`
	);
	if (
		manifestRecord.sha256 !== sha256(manifestBytes) ||
		manifestRecord.canonicalSha256 !== canonicalHash(manifest)
	) {
		throw new Error('Review-rebase B0 manifest differs from its live replay.');
	}
	repositoryRecordsByPath.set(manifestRecord.path, manifestRecord);
	repositoryRecordsByRole.set('review-rebase-manifest', manifestRecord);

	const existingDefinitionsRecord = writeTrackedJson(
		'content-parent-chain-existing-definitions',
		'content/parent-chain/existing-definitions.json',
		reviewRebaseExistingDefinitions
	);
	const chainRecords = uniqueTrackedRecords([
		...repositoryRecordsByPath.values(),
		existingDefinitionsRecord,
		effectiveCohortArchive.manifestRecord,
		...effectiveCohortArchive.artifactRecords,
		effectiveCohortArchive.indexRecord,
		contentReviewRecord
	]);
	const index = {
		schemaVersion: CONTENT_PARENT_CHAIN_INDEX_SCHEMA,
		referenceRoot: CONTENT_PARENT_CHAIN_REFERENCE_ROOT,
		contentParentLineageSha256: canonicalHash(contentParentChain),
		parentChain: structuredClone(contentParentChain),
		reviewRebaseManifestRef: artifactReference(manifestRecord),
		existingDefinitionsRef: artifactReference(existingDefinitionsRecord),
		parentVerificationRef: artifactReference(
			requiredRoleRecord(repositoryRecordsByRole, 'parent-verification')
		),
		parentRepairRef: artifactReference(
			requiredRoleRecord(repositoryRecordsByRole, 'parent-repair')
		),
		firstVerificationRef: artifactReference(firstVerificationRecord),
		effectiveCohortManifestRef: artifactReference(effectiveCohortArchive.manifestRecord),
		effectiveCohortIndexRef: artifactReference(effectiveCohortArchive.indexRecord),
		contentVerificationRef: artifactReference(contentReviewRecord),
		artifactCount: chainRecords.length,
		artifactRefs: chainRecords.map(artifactReference).sort(compareArtifactReferences)
	};
	writeTrackedJson('content-parent-chain-index', 'content/parent-chain/index.json', index);
}

function reviewRebaseFilesystemBindings(manifest) {
	const inputs = manifest.evidence?.inputs;
	const outputs = manifest.evidence?.outputs;
	const records = [
		['spec', inputs?.spec],
		['base-plan', inputs?.basePlan],
		['source-snapshot', inputs?.sourceSnapshot],
		['curriculum-evidence', inputs?.curriculumEvidence],
		['parent-verification', inputs?.parentVerification],
		['parent-repair', inputs?.parentRepair],
		['selection-index', inputs?.selectionIndex],
		['output-plan', outputs?.plan],
		['output-plan-validation', outputs?.planValidation],
		['output-collection-validation', outputs?.collectionValidation]
	];
	for (const source of inputs?.parentCandidateSources ?? []) {
		records.push([`parent-candidate-${source?.shardId}`, source?.assignment]);
	}
	for (const source of inputs?.selectedArtifacts ?? []) {
		records.push(
			[`selected-candidate-${source?.shardId}`, source?.candidate],
			[`selected-validation-${source?.shardId}`, source?.validation]
		);
		for (const [index, override] of (source?.rowOverrides ?? []).entries()) {
			records.push(
				[`selected-override-candidate-${source?.shardId}-${index + 1}`, override?.candidate],
				[`selected-override-validation-${source?.shardId}-${index + 1}`, override?.validation]
			);
		}
	}
	for (const output of outputs?.shards ?? []) {
		records.push(
			[`output-candidate-${output?.shardId}`, output?.candidate],
			[`output-validation-${output?.shardId}`, output?.validation]
		);
	}
	return records.map(([role, binding]) => ({ role, binding }));
}

function effectiveCohortArtifactSourcePath(effectiveCohort, reference) {
	if (!nonEmpty(reference?.path) || !nonEmpty(effectiveCohort?.manifestPath)) {
		throw new Error('Effective-cohort V1 reference is incomplete.');
	}
	const generationRoot = path.dirname(path.dirname(path.resolve(effectiveCohort.manifestPath)));
	return path.resolve(generationRoot, reference.path);
}

function requiredRoleRecord(recordsByRole, role) {
	const record = recordsByRole.get(role);
	if (!record) throw new Error(`Review-rebase B0 archive omits ${role}.`);
	return record;
}

function uniqueTrackedRecords(records) {
	const byPath = new Map();
	for (const record of records) {
		const existing = byPath.get(record?.path);
		if (
			!record?.path ||
			(existing &&
				(existing.sha256 !== record.sha256 || existing.canonicalSha256 !== record.canonicalSha256))
		) {
			throw new Error('Content parent chain contains an invalid or competing artifact record.');
		}
		byPath.set(record.path, record);
	}
	return [...byPath.values()].sort(compareRecords);
}

function compareArtifactReferences(left, right) {
	return String(left?.path ?? left?.id ?? '').localeCompare(String(right?.path ?? right?.id ?? ''));
}

function validateReviewRebaseSuccessorParentChainShape(parentChain) {
	const fields = [
		'kind',
		'reviewRebaseManifestSha256',
		'reviewRebaseId',
		'parentVerificationSha256',
		'parentRepairSha256',
		'reviewRebasePlanSha256',
		'reviewRebaseCandidateSetSha256',
		'reviewRebaseCollectionValidationSha256',
		'reviewRebaseCollectionRemediationSetSha256',
		'reviewRebaseCollectionRemediationTargetSetSha256',
		'firstVerificationSha256',
		'mutableTargetSetSha256',
		'successorObjectiveId',
		'successorExecutionId'
	];
	if (
		!parentChain ||
		typeof parentChain !== 'object' ||
		Array.isArray(parentChain) ||
		Object.keys(parentChain).sort().join('\n') !== fields.sort().join('\n') ||
		parentChain.kind !== REVIEW_REBASE_SUCCESSOR_PARENT_KIND
	) {
		throw new Error('Review-rebase successor parentChain shape is invalid.');
	}
	for (const field of fields.filter((field) => field !== 'kind')) {
		if (!sha256String(parentChain[field])) {
			throw new Error(`Review-rebase successor parentChain.${field} is invalid.`);
		}
	}
}

function reviewRebaseValidatorOptions(validators) {
	if (validators === null || validators === undefined) return {};
	if (!validators || typeof validators !== 'object' || Array.isArray(validators)) {
		throw new Error('Review-rebase replay validators must be an object.');
	}
	for (const field of ['validatePlan', 'validateBatch', 'validateCollection']) {
		if (typeof validators[field] !== 'function') {
			throw new Error(`Review-rebase replay validators.${field} must be a function.`);
		}
	}
	return {
		validatePlan: validators.validatePlan,
		validateBatch: validators.validateBatch,
		validateCollection: validators.validateCollection
	};
}

function normalizedRepositoryRelativePath(value, label) {
	if (
		!nonEmpty(value) ||
		value.includes('\\') ||
		value.includes('\0') ||
		path.posix.isAbsolute(value) ||
		path.posix.normalize(value) !== value ||
		value === '.' ||
		value === '..' ||
		value.startsWith('../') ||
		value.split('/').some((part) => part.length === 0 || part === '.' || part === '..')
	) {
		throw new Error(`${label} path must be a normalized repository-relative path.`);
	}
	return value;
}

function reviewRebaseCollectionRemediationTargetIds(manifest) {
	const remediations = manifest?.collectionRemediations;
	if (!Array.isArray(remediations)) {
		throw new Error('B0 collection remediations must be an array.');
	}
	const ids = remediations.map((remediation, index) => {
		if (!nonEmpty(remediation?.preferredChallengeId)) {
			throw new Error(`B0 collection remediation ${index + 1} has no preferred challenge id.`);
		}
		return remediation.preferredChallengeId;
	});
	return [...new Set(ids)].sort();
}

function reviewRebaseMutableTargetIds({ firstVerification, collectionRemediationTargetIds }) {
	if (!Array.isArray(firstVerification?.reviews)) {
		throw new Error('V1 first verification reviews must be an array.');
	}
	const reviewIds = new Set();
	const rejectedIds = [];
	for (const [index, review] of firstVerification.reviews.entries()) {
		if (!nonEmpty(review?.id) || reviewIds.has(review.id)) {
			throw new Error(`V1 review ${index + 1} has a missing or duplicate id.`);
		}
		reviewIds.add(review.id);
		if (review.accepted === false) rejectedIds.push(review.id);
	}
	const mutableIds = [...new Set([...rejectedIds, ...collectionRemediationTargetIds])].sort();
	if (mutableIds.length === 0) {
		throw new Error('Review-rebase successor has no authenticated mutable target.');
	}
	return mutableIds;
}

function validateReviewRebaseSuccessorChainLinks({
	parentChain,
	reviewRebase,
	reviewRebaseInfrastructureRecoveryEvidence = null,
	reviewRebaseInfrastructureRecoveryArchiveClosure = null,
	firstVerification,
	mutableTargetIds,
	effectiveCohort,
	contentReview
}) {
	const manifest = reviewRebase?.manifest;
	const core = reviewRebase?.coreManifest;
	const cohortManifest = effectiveCohort?.manifest;
	const lineageValidation = validateScienceChallengeReviewRebaseSuccessorLineage({
		effectiveCohort,
		reviewRebaseEvidence: reviewRebase,
		reviewRebaseInfrastructureRecoveryEvidence,
		reviewRebaseInfrastructureRecoveryArchiveClosure
	});
	const releaseGate = validateScienceChallengeEffectiveReleaseGate({
		effectiveCohort,
		basePlan: effectiveCohort?.basePlan,
		effectivePlan: effectiveCohort?.effectivePlan ?? reviewRebase?.plan,
		contentVerification: contentReview,
		reviewRebaseEvidence: reviewRebase,
		reviewRebaseInfrastructureRecoveryEvidence,
		reviewRebaseInfrastructureRecoveryArchiveClosure
	});
	if (
		lineageValidation.status !== 'passed' ||
		canonicalHash(lineageValidation.parentChain) !== canonicalHash(parentChain) ||
		releaseGate.status !== 'passed'
	) {
		throw new Error(
			`Review-rebase V0/R0/B0/V1/S1/V2 lineage is invalid: ${[
				...(lineageValidation.issues ?? []),
				...(releaseGate.issues ?? [])
			].join(' ')}`
		);
	}
	for (const [field, actual] of [
		['reviewRebaseManifestSha256', canonicalHash(manifest)],
		['reviewRebaseId', core?.rebaseId],
		['parentVerificationSha256', core?.parent?.verificationSha256],
		['parentRepairSha256', core?.parent?.repairSha256],
		['reviewRebasePlanSha256', canonicalHash(reviewRebase?.plan)],
		['reviewRebaseCandidateSetSha256', core?.candidateSetSha256],
		['reviewRebaseCollectionValidationSha256', core?.collectionValidationSha256],
		['reviewRebaseCollectionRemediationSetSha256', core?.collectionRemediationSetSha256],
		['firstVerificationSha256', canonicalHash(firstVerification)],
		['mutableTargetSetSha256', canonicalHash(mutableTargetIds)],
		['successorObjectiveId', cohortManifest?.objectiveId],
		['successorExecutionId', cohortManifest?.executionId]
	]) {
		if (parentChain[field] !== actual) {
			throw new Error(`Review-rebase parent-chain ${field} is stale.`);
		}
	}
	const remediationTargetIds = reviewRebaseCollectionRemediationTargetIds(manifest);
	if (
		parentChain.reviewRebaseCollectionRemediationTargetSetSha256 !==
			canonicalHash(remediationTargetIds) ||
		firstVerification.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		firstVerification.status !== 'failed' ||
		cohortManifest?.repairSha256 !== canonicalHash(firstVerification) ||
		cohortManifest?.firstReviewSha256 !== canonicalHash(firstVerification) ||
		contentReview?.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		contentReview.status !== 'passed' ||
		contentReview.candidateSetSha256 !== effectiveCohort.candidateSetSha256 ||
		contentReview.basePlanSha256 !== cohortManifest.basePlanSha256 ||
		contentReview.effectivePlanSha256 !== cohortManifest.effectivePlanSha256 ||
		contentReview.effectiveCohortManifestSha256 !== canonicalHash(cohortManifest)
	) {
		throw new Error('Review-rebase V1/S1/V2 chain is stale or incomplete.');
	}
}

function repositoryRelativeReferencePath(referenceRoot, reference, label) {
	const root = normalizedRepositoryRelativePath(referenceRoot, 'content parent-chain root');
	const referencePath = normalizedRepositoryRelativePath(reference?.path, label);
	const prefix = `${root}/`;
	if (!referencePath.startsWith(prefix)) {
		throw new Error(`${label} is outside the archived repository tree.`);
	}
	return normalizedRepositoryRelativePath(referencePath.slice(prefix.length), label);
}

function trackedRecordAt(tracked, archivePath, label) {
	const matches = tracked.filter((artifact) => artifact?.path === archivePath);
	if (matches.length !== 1) {
		throw new Error(`${label} must have exactly one tracked artifact record.`);
	}
	return matches[0];
}

function archiveDescendantRemapEvidence({
	workspaceRoot,
	lineage,
	curriculumRemapVerifierInputSha256,
	curriculumRemapDurableReceipt,
	effectiveCohort,
	effectiveCohortArchive,
	descendantRemapRecoveries,
	contentReview,
	addTracked,
	writeTrackedJson,
	writeTrackedText,
	addExternal
}) {
	const sourceRemapByShard = new Map(
		(lineage.descendantRemaps ?? []).map((remap) => [
			remap?.sourceAttempt?.shardId ?? remap?.execution?.identity?.shardId ?? null,
			remap
		])
	);
	for (const shard of lineage.content ?? []) {
		if (shard?.descendantRemap) sourceRemapByShard.set(shard.shardId, shard.descendantRemap);
	}
	const remaps = descendantRemapRecoveries.map((recovery) => {
		const shardId = recovery?.manifest?.shardId;
		if (!safeId(shardId)) throw new Error('Descendant-remap recovery has an unsafe shard id.');
		const sourceLineage = sourceRemapByShard.get(shardId);
		if (
			!sourceLineage ||
			sourceLineage.manifestSha256 !== canonicalHash(recovery.manifest) ||
			sourceLineage.candidateSha256 !== canonicalHash(recovery.candidate) ||
			sourceLineage.validationSha256 !== canonicalHash(recovery.validation) ||
			sourceLineage.effectivePlanSha256 !== canonicalHash(recovery.effectivePlan)
		) {
			throw new Error(`${shardId} descendant-remap recovery differs from release lineage.`);
		}
		const destinationRoot = `content/shards/${safeFilename(shardId)}/descendant-remap`;
		const staged = {};
		const stagedKinds = {
			manifest: 'content-descendant-remap-manifest',
			candidate: 'content-descendant-remap-candidate',
			validation: 'content-descendant-remap-validation',
			effectivePlan: 'content-descendant-remap-effective-plan',
			provenance: 'content-descendant-remap-provenance',
			priorCandidate: 'content-descendant-remap-prior-candidate',
			priorValidation: 'content-descendant-remap-prior-validation',
			firstReviewSummary: 'content-descendant-remap-first-review-summary',
			firstReviewResult: 'content-descendant-remap-first-review-result',
			firstAssignment: 'content-descendant-remap-first-assignment',
			firstDispatchLedger: 'content-descendant-remap-first-dispatch-ledger',
			priorBaseBatchValidation: 'content-descendant-remap-prior-base-batch-validation',
			baseBatchValidation: 'content-descendant-remap-base-batch-validation',
			effectiveBatchValidation: 'content-descendant-remap-effective-batch-validation',
			collectionValidation: 'content-descendant-remap-collection-validation',
			repairValidation: 'content-descendant-remap-repair-validation'
		};
		for (const [field, kind] of Object.entries(stagedKinds)) {
			const sourcePath = recovery.artifactPaths?.[field];
			const expectedValue = recovery[field];
			if (!sourcePath || expectedValue === undefined) {
				throw new Error(`${shardId} descendant-remap staged ${field} is missing.`);
			}
			const value = readJson(
				requiredWorkspaceFile(workspaceRoot, sourcePath, `${shardId} descendant-remap ${field}`)
			);
			if (canonicalHash(value) !== canonicalHash(expectedValue)) {
				throw new Error(`${shardId} descendant-remap staged ${field} differs from replay.`);
			}
			const record =
				field === 'firstAssignment'
					? addExternal(
							'full-descendant-remap-first-assignment',
							`descendant-remap-${shardId}-first-assignment`,
							sourcePath,
							{ json: true }
						)
					: addTracked(
							kind,
							sourcePath,
							`${destinationRoot}/staged/${safeFilename(path.basename(sourcePath))}`
						);
			staged[field] = artifactReference(record);
		}

		if (!Array.isArray(recovery.attempts) || recovery.attempts.length !== 4) {
			throw new Error(`${shardId} descendant-remap must retain exactly four source attempts.`);
		}
		const shardDirectory = path.dirname(
			path.dirname(path.resolve(recovery.artifactPaths.manifest))
		);
		const sourceAttempts = recovery.attempts.map((attempt, index) =>
			archiveDescendantRemapSourceAttempt({
				workspaceRoot,
				shardDirectory,
				shardId,
				attempt,
				index,
				destinationRoot,
				addTracked,
				writeTrackedJson,
				writeTrackedText,
				addExternal
			})
		);
		const objective = addBoundDescendantRemapJson({
			workspaceRoot,
			sourcePath: sourceLineage.execution.objectivePath,
			expectedCanonicalSha256: sourceLineage.execution.objectiveSha256,
			expectedFileSha256: sourceLineage.execution.objectiveFileSha256,
			label: `${shardId} descendant-remap objective`,
			kind: 'content-descendant-remap-objective',
			destination: `${destinationRoot}/execution/objective.json`,
			addTracked
		});
		const claims = sourceLineage.execution.claims.map((claim, index) =>
			addBoundDescendantRemapJson({
				workspaceRoot,
				sourcePath: claim.path,
				expectedCanonicalSha256: claim.sha256,
				expectedFileSha256: claim.fileSha256,
				label: `${shardId} descendant-remap claim ${index + 1}`,
				kind: 'content-descendant-remap-claim',
				destination: `${destinationRoot}/execution/claims/attempt-${String(index + 1).padStart(
					2,
					'0'
				)}.json`,
				addTracked
			})
		);
		return {
			shardId,
			manifestSha256: canonicalHash(recovery.manifest),
			basePlanSha256: recovery.manifest.base.planSha256,
			effectivePlanSha256: recovery.manifest.effective.planSha256,
			remapSha256: recovery.manifest.remapSha256,
			selectedSourceAttempt: recovery.manifest.sourceAttempt.attempt,
			staged,
			sourceAttempts,
			objective,
			claims
		};
	});
	const index = {
		schemaVersion: 'science-challenge-descendant-remap-provenance-index/v1',
		basePlanSha256: curriculumRemapDurableReceipt.basePlanSha256,
		effectivePlanSha256: curriculumRemapDurableReceipt.effectivePlanSha256,
		curriculumRemapVerifierInputSha256,
		curriculumRemapDurableReceiptSha256: canonicalHash(curriculumRemapDurableReceipt),
		proposalSetSha256: curriculumRemapDurableReceipt.proposalSetSha256,
		decisionSetSha256: curriculumRemapDurableReceipt.decisionSetSha256,
		effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
		effectiveCohortCandidateSetSha256: effectiveCohort.candidateSetSha256,
		manifestSetSha256: canonicalHash(
			descendantRemapRecoveries.map((recovery) => recovery.manifest)
		),
		durableReceiptRef: artifactReference(effectiveCohortArchive.receiptRecord),
		effectiveCohortIndexSha256: canonicalHash(effectiveCohortArchive.index),
		remapCount: remaps.length,
		remaps
	};
	writeTrackedJson('content-descendant-remap-index', 'content/descendant-remap-index.json', index);
}

function archiveDifficultyPlanAdjustmentEvidence({
	workspaceRoot,
	lineage,
	difficultyPlanAdjustmentVerifierInputSha256,
	effectiveCohort,
	effectiveCohortArchive,
	difficultyPlanAdjustmentRecoveries,
	contentReview,
	addTracked,
	writeTrackedJson,
	writeTrackedText,
	addExternal
}) {
	const sourceByShard = new Map();
	for (const shard of lineage.content ?? []) {
		if (shard?.difficultyPlanAdjustment) {
			sourceByShard.set(shard.shardId, shard.difficultyPlanAdjustment);
		}
	}
	const recoveries = difficultyPlanAdjustmentRecoveries.map((recovery) => {
		const shardId = recovery?.manifest?.shardId;
		if (!safeId(shardId)) {
			throw new Error('Difficulty-plan adjustment recovery has an unsafe shard id.');
		}
		const sourceLineage = sourceByShard.get(shardId);
		if (
			!sourceLineage ||
			sourceLineage.manifestSha256 !== canonicalHash(recovery.manifest) ||
			sourceLineage.candidateSha256 !== canonicalHash(recovery.candidate) ||
			sourceLineage.validationSha256 !== canonicalHash(recovery.validation) ||
			sourceLineage.effectivePlanSha256 !== canonicalHash(recovery.effectivePlan)
		) {
			throw new Error(
				`${shardId} difficulty-plan adjustment recovery differs from release lineage.`
			);
		}
		const destinationRoot = `content/shards/${safeFilename(shardId)}/difficulty-plan-adjustment`;
		const staged = {};
		const stagedKinds = {
			manifest: 'content-difficulty-plan-adjustment-manifest',
			candidate: 'content-difficulty-plan-adjustment-candidate',
			validation: 'content-difficulty-plan-adjustment-validation',
			effectivePlan: 'content-difficulty-plan-adjustment-effective-plan',
			provenance: 'content-difficulty-plan-adjustment-provenance',
			priorCandidate: 'content-difficulty-plan-adjustment-prior-candidate',
			priorValidation: 'content-difficulty-plan-adjustment-prior-validation',
			firstReviewSummary: 'content-difficulty-plan-adjustment-first-review-summary',
			firstReviewResult: 'content-difficulty-plan-adjustment-first-review-result',
			firstAssignment: 'content-difficulty-plan-adjustment-first-assignment',
			firstDispatchLedger: 'content-difficulty-plan-adjustment-first-dispatch-ledger',
			priorBaseBatchValidation: 'content-difficulty-plan-adjustment-prior-base-batch-validation',
			baseBatchValidation: 'content-difficulty-plan-adjustment-base-batch-validation',
			effectiveBatchValidation: 'content-difficulty-plan-adjustment-effective-batch-validation',
			collectionValidation: 'content-difficulty-plan-adjustment-collection-validation',
			repairValidation: 'content-difficulty-plan-adjustment-repair-validation'
		};
		for (const [field, kind] of Object.entries(stagedKinds)) {
			const sourcePath = recovery.artifactPaths?.[field];
			const expectedValue = recovery[field];
			if (!sourcePath || expectedValue === undefined) {
				throw new Error(`${shardId} difficulty-plan adjustment staged ${field} is missing.`);
			}
			const value = readJson(
				requiredWorkspaceFile(
					workspaceRoot,
					sourcePath,
					`${shardId} difficulty-plan adjustment ${field}`
				)
			);
			if (canonicalHash(value) !== canonicalHash(expectedValue)) {
				throw new Error(
					`${shardId} difficulty-plan adjustment staged ${field} differs from replay.`
				);
			}
			const record =
				field === 'firstAssignment'
					? addExternal(
							'full-difficulty-plan-adjustment-first-assignment',
							`difficulty-plan-adjustment-${shardId}-first-assignment`,
							sourcePath,
							{ json: true }
						)
					: addTracked(
							kind,
							sourcePath,
							`${destinationRoot}/staged/${safeFilename(path.basename(sourcePath))}`
						);
			staged[field] = artifactReference(record);
		}
		if (!Array.isArray(recovery.attempts) || recovery.attempts.length !== 4) {
			throw new Error(
				`${shardId} difficulty-plan adjustment must retain exactly four source attempts.`
			);
		}
		const shardDirectory = path.dirname(
			path.dirname(path.resolve(recovery.artifactPaths.manifest))
		);
		const sourceAttempts = recovery.attempts.map((attempt, index) =>
			archiveDescendantRemapSourceAttempt({
				workspaceRoot,
				shardDirectory,
				shardId,
				attempt,
				index,
				destinationRoot,
				addTracked,
				writeTrackedJson,
				writeTrackedText,
				addExternal,
				recoveryKind: 'difficulty-plan-adjustment'
			})
		);
		const objective = addBoundDescendantRemapJson({
			workspaceRoot,
			sourcePath: sourceLineage.execution.objectivePath,
			expectedCanonicalSha256: sourceLineage.execution.objectiveSha256,
			expectedFileSha256: sourceLineage.execution.objectiveFileSha256,
			label: `${shardId} difficulty-plan adjustment objective`,
			kind: 'content-difficulty-plan-adjustment-objective',
			destination: `${destinationRoot}/execution/objective.json`,
			addTracked
		});
		const claims = sourceLineage.execution.claims.map((claim, index) =>
			addBoundDescendantRemapJson({
				workspaceRoot,
				sourcePath: claim.path,
				expectedCanonicalSha256: claim.sha256,
				expectedFileSha256: claim.fileSha256,
				label: `${shardId} difficulty-plan adjustment claim ${index + 1}`,
				kind: 'content-difficulty-plan-adjustment-claim',
				destination: `${destinationRoot}/execution/claims/attempt-${String(index + 1).padStart(
					2,
					'0'
				)}.json`,
				addTracked
			})
		);
		const adjustmentCount = Array.isArray(recovery.manifest.adjustments)
			? recovery.manifest.adjustments.length
			: 1;
		return {
			shardId,
			manifestSha256: canonicalHash(recovery.manifest),
			basePlanSha256: recovery.manifest.base.planSha256,
			effectivePlanSha256: recovery.manifest.effective.planSha256,
			adjustmentCount,
			adjustmentSha256: recovery.manifest.adjustmentSha256 ?? null,
			adjustmentSetSha256: recovery.manifest.adjustmentSetSha256 ?? null,
			selectedSourceAttempt: recovery.manifest.sourceAttempt.attempt,
			staged,
			sourceAttempts,
			objective,
			claims
		};
	});
	const decisions = (contentReview.reviews ?? []).flatMap(
		(review) => review.difficultyPlanAdjustmentDecisions ?? []
	);
	const index = {
		schemaVersion: 'science-challenge-difficulty-plan-adjustment-provenance-index/v1',
		basePlanSha256: contentReview.basePlanSha256,
		effectivePlanSha256: contentReview.effectivePlanSha256,
		difficultyPlanAdjustmentVerifierInputSha256,
		decisionSetSha256: canonicalHash(decisions),
		recoverySetSha256: effectiveCohort.manifest.recoverySetSha256,
		effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
		effectiveCohortCandidateSetSha256: effectiveCohort.candidateSetSha256,
		manifestSetSha256: canonicalHash(
			difficultyPlanAdjustmentRecoveries.map((recovery) => recovery.manifest)
		),
		effectiveCohortIndexSha256: canonicalHash(effectiveCohortArchive.index),
		adjustmentCount: recoveries.reduce((total, recovery) => total + recovery.adjustmentCount, 0),
		recoveryCount: recoveries.length,
		recoveries
	};
	writeTrackedJson(
		'content-difficulty-plan-adjustment-index',
		'content/difficulty-plan-adjustment-index.json',
		index
	);
}

function archiveDescendantRemapSourceAttempt({
	workspaceRoot,
	shardDirectory,
	shardId,
	attempt,
	index,
	destinationRoot,
	addTracked,
	writeTrackedJson,
	writeTrackedText,
	addExternal,
	recoveryKind = 'descendant-remap'
}) {
	const difficultyAdjustment = recoveryKind === 'difficulty-plan-adjustment';
	const label = difficultyAdjustment ? 'difficulty-plan adjustment' : 'descendant-remap';
	const kindPrefix = difficultyAdjustment
		? 'content-difficulty-plan-adjustment'
		: 'content-descendant-remap';
	const dependencyPrefix = difficultyAdjustment ? 'difficulty-plan-adjustment' : 'descendant-remap';
	if (
		attempt?.attempt !== index + 1 ||
		attempt.status !== 'failed' ||
		attempt.sourceValidation?.status !== 'failed' ||
		attempt.runSummary?.status !== 'passed' ||
		!attempt.fileBindings
	) {
		throw new Error(`${shardId} ${label} source attempt ${index + 1} is invalid.`);
	}
	const attemptId = `attempt-${String(attempt.attempt).padStart(2, '0')}`;
	const destination = `${destinationRoot}/source-attempts/${attemptId}`;
	const tracked = {};
	for (const [field, kindSuffix, filename] of [
		['runSummary', 'source-run-summary', 'run-summary.json'],
		['validation', 'source-validation', 'validation.json'],
		['candidate', 'source-candidate', 'candidate.json'],
		['lastMessage', 'source-final-message', 'last-message.json']
	]) {
		const binding = attempt.fileBindings[field];
		const sourcePath = requiredBoundDescendantRemapFile({
			workspaceRoot,
			shardDirectory,
			binding,
			label: `${shardId} ${label} source attempt ${attempt.attempt} ${field}`
		});
		tracked[field] = artifactReference(
			addTracked(`${kindPrefix}-${kindSuffix}`, sourcePath, `${destination}/${filename}`)
		);
	}
	const promptBinding = attempt.fileBindings.prompt;
	const promptPath = requiredBoundDescendantRemapFile({
		workspaceRoot,
		shardDirectory,
		binding: promptBinding,
		label: `${shardId} ${label} source attempt ${attempt.attempt} prompt`
	});
	const promptDependency = addExternal(
		'full-content-prompt',
		`${dependencyPrefix}-${shardId}-${attemptId}-prompt`,
		promptPath
	);
	const promptRecord = writeTrackedText(
		'content-prompt',
		`${destination}/prompt.txt`,
		sanitizeContentPrompt(readFileSync(promptPath, 'utf8'), attempt.runSummary.inputSha256),
		{
			sourceSha256: promptDependency.sha256,
			externalDependencyId: promptDependency.id,
			redaction: 'official-authoring-input'
		}
	);
	const eventBinding = attempt.fileBindings.eventLog;
	const eventPath = requiredBoundDescendantRemapFile({
		workspaceRoot,
		shardDirectory,
		binding: eventBinding,
		label: `${shardId} ${label} source attempt ${attempt.attempt} event log`
	});
	const eventDependency = addExternal(
		'direct-json-multipart-event-index',
		`${dependencyPrefix}-${shardId}-${attemptId}-events`,
		eventPath,
		{ eventLog: true }
	);
	const parts = (attempt.runSummary.parts ?? []).map((part, partIndex) => {
		const partId = `part-${String(partIndex + 1).padStart(2, '0')}`;
		if (part?.partId !== partId) {
			throw new Error(`${shardId} ${attemptId} has unordered multipart source evidence.`);
		}
		const sourceRoot = path.join(
			shardDirectory,
			attempt.fileBindings.attemptDirectory,
			'parts',
			partId
		);
		const partDestination = `${destination}/parts/${partId}`;
		const partPromptPath = requiredWorkspaceFile(
			workspaceRoot,
			path.join(sourceRoot, 'prompt.txt'),
			`${shardId} ${attemptId} ${partId} prompt`
		);
		const partPromptDependency = addExternal(
			'full-content-prompt',
			`${dependencyPrefix}-${shardId}-${attemptId}-${partId}-prompt`,
			partPromptPath
		);
		const partPromptRecord = writeTrackedText(
			'content-prompt',
			`${partDestination}/prompt.txt`,
			sanitizeContentPrompt(readFileSync(partPromptPath, 'utf8'), part.inputSha256),
			{
				sourceSha256: partPromptDependency.sha256,
				externalDependencyId: partPromptDependency.id,
				redaction: 'official-authoring-input'
			}
		);
		const partTracked = {};
		for (const [name, kind] of [
			['last-message.json', 'content-part-final-message'],
			['run-summary.json', 'content-part-run-summary'],
			['result-metadata.json', 'content-part-run-result-metadata']
		]) {
			partTracked[name] = artifactReference(
				addTracked(kind, path.join(sourceRoot, name), `${partDestination}/${name}`)
			);
		}
		const dependencies = {};
		for (const [name, kind, suffix, options] of [
			['request.json', 'direct-json-request', 'request', { json: true }],
			['events.jsonl', 'direct-json-event-log', 'events', { eventLog: true }],
			['thoughts.txt', 'model-thought-log', 'thoughts', {}]
		]) {
			dependencies[name] = artifactReference(
				addExternal(
					kind,
					`${dependencyPrefix}-${shardId}-${attemptId}-${partId}-${suffix}`,
					path.join(sourceRoot, name),
					options
				)
			);
		}
		return {
			partId,
			inputSha256: part.inputSha256,
			promptRef: artifactReference(partPromptRecord),
			tracked: partTracked,
			dependencies
		};
	});
	const runPolicyRecord = writeTrackedJson(
		`${kindPrefix}-source-run-policy`,
		`${destination}/run-policy.json`,
		attempt.runPolicy
	);
	return {
		attempt: attempt.attempt,
		status: attempt.status,
		invalidated: attempt.invalidated === true,
		candidateSha256: canonicalHash(attempt.candidate),
		runSummarySha256: canonicalHash(attempt.runSummary),
		validationSha256: canonicalHash(attempt.sourceValidation),
		runPolicySha256: canonicalHash(attempt.runPolicy),
		tracked,
		promptRef: artifactReference(promptRecord),
		eventRef: artifactReference(eventDependency),
		runPolicyRef: artifactReference(runPolicyRecord),
		parts
	};
}

function requiredBoundDescendantRemapFile({ workspaceRoot, shardDirectory, binding, label }) {
	if (!binding || !nonEmpty(binding.path) || !sha256String(binding.sha256)) {
		throw new Error(`${label} binding is invalid.`);
	}
	const sourcePath = requiredWorkspaceFile(
		workspaceRoot,
		path.resolve(shardDirectory, binding.path),
		label
	);
	const bytes = readFileSync(sourcePath);
	if (
		sha256(bytes) !== binding.sha256 ||
		(binding.canonicalSha256 !== undefined &&
			canonicalHash(JSON.parse(bytes.toString('utf8'))) !== binding.canonicalSha256)
	) {
		throw new Error(`${label} differs from its immutable source-attempt binding.`);
	}
	return sourcePath;
}

function addBoundDescendantRemapJson({
	workspaceRoot,
	sourcePath,
	expectedCanonicalSha256,
	expectedFileSha256,
	label,
	kind,
	destination,
	addTracked
}) {
	const filePath = requiredWorkspaceFile(workspaceRoot, sourcePath, label);
	const bytes = readFileSync(filePath);
	if (
		canonicalHash(JSON.parse(bytes.toString('utf8'))) !== expectedCanonicalSha256 ||
		(expectedFileSha256 !== undefined && sha256(bytes) !== expectedFileSha256)
	) {
		throw new Error(`${label} differs from release lineage.`);
	}
	return artifactReference(addTracked(kind, filePath, destination));
}

function archiveArtGeneration({ workspaceRoot, artGenerationRoot, addTracked, addExternal }) {
	const artRoot = requiredWorkspaceDirectory(
		workspaceRoot,
		artGenerationRoot,
		'art generation root'
	);
	for (const name of sortedFileNames(artRoot)) {
		if (/^(?:generation|repair-[a-f0-9]{12})-summary\.json$/.test(name)) {
			addTracked(
				'art-generation-summary',
				path.join(artRoot, name),
				`art/generation-summaries/${name}`
			);
		}
	}
	for (const artId of sortedDirectories(artRoot)) {
		const artIdRoot = path.join(artRoot, artId);
		for (const name of sortedFileNames(artIdRoot)) {
			if (name === 'job.json' || /^repair-[a-f0-9]{12}-job\.json$/.test(name)) {
				addTracked(
					'art-generation-job',
					path.join(artIdRoot, name),
					`art/generation/${safeFilename(artId)}/${name}`
				);
			}
		}
		for (const attempt of sortedDirectories(artIdRoot).filter(isAttemptDirectory)) {
			const attemptRoot = path.join(artIdRoot, attempt);
			const destinationRoot = `art/generation/${safeFilename(artId)}/${safeFilename(attempt)}`;
			for (const promptName of ['dark-prompt.txt', 'light-prompt.txt']) {
				if (existsSync(path.join(attemptRoot, promptName))) {
					addTracked(
						'art-generation-prompt',
						path.join(attemptRoot, promptName),
						`${destinationRoot}/${promptName}`
					);
				}
			}
			if (existsSync(path.join(attemptRoot, 'failure.json'))) {
				addTracked(
					'art-generation-failure',
					path.join(attemptRoot, 'failure.json'),
					`${destinationRoot}/failure.json`
				);
			}
			for (const imageName of [
				'dark-master.webp',
				'light-master.webp',
				'dark.webp',
				'light.webp'
			]) {
				if (existsSync(path.join(attemptRoot, imageName))) {
					addExternal(
						'generated-art-image',
						`${artId}-${attempt}-${imageName.replace('.webp', '')}`,
						path.join(attemptRoot, imageName)
					);
				}
			}
		}
	}
}

function archiveArtReview({
	workspaceRoot,
	artReviewRoot,
	addTracked,
	writeTrackedJson,
	addExternal
}) {
	const reviewRoot = requiredWorkspaceDirectory(workspaceRoot, artReviewRoot, 'art review root');
	addTracked(
		'art-review-summary',
		path.join(reviewRoot, 'review-summary.json'),
		'reviews/art/summary.json'
	);
	const batchesRoot = path.join(reviewRoot, 'batches');
	for (const batch of sortedDirectories(batchesRoot)) {
		const batchRoot = path.join(batchesRoot, batch);
		const destinationRoot = `reviews/art/batches/${safeFilename(batch)}`;
		for (const [name, kind] of [
			['review-input.json', 'art-review-input'],
			['review-request.json', 'art-review-request'],
			['prompt.txt', 'art-review-prompt'],
			['last-message.json', 'art-review-final-message'],
			['validation.json', 'art-review-validation'],
			['run-summary.json', 'art-review-run-summary'],
			['result.json', 'art-review-result']
		]) {
			addTracked(kind, path.join(batchRoot, name), `${destinationRoot}/${name}`);
		}
		const eventsPath = path.join(batchRoot, 'events.jsonl');
		const runSummary = readJson(path.join(batchRoot, 'run-summary.json'));
		const eventLogBytes = readFileSync(eventsPath);
		const lastMessageBytes = readFileSync(path.join(batchRoot, 'last-message.json'));
		const attestation = buildScienceChallengeModelRunPolicyAttestation({
			summary: runSummary,
			eventLogBytes,
			lastMessageBytes,
			expectedModel: 'gpt-5.6-sol',
			expectedThinkingLevel: 'max',
			policyLabel: `${batch} archived art review run`
		});
		writeTrackedJson(
			'art-review-run-policy-attestation',
			`${destinationRoot}/run-policy.json`,
			attestation
		);
		addExternal('codex-event-log', `art-review-${batch}`, eventsPath, { eventLog: true });
	}
}

function archiveVerificationRepairPredecessorEvidence({
	workspaceRoot,
	planFile,
	recoveryManifest,
	addTracked,
	writeTrackedJson
}) {
	const index = verificationRepairPredecessorArchiveIndex(recoveryManifest);
	const planRoot = path.dirname(planFile);
	const realPlanRoot = realpathSync(planRoot);
	for (const [rootIndex, predecessor] of recoveryManifest.preModelRoots.entries()) {
		const sourceRoot = requiredWorkspaceDirectory(
			workspaceRoot,
			path.resolve(planRoot, predecessor.path),
			`verification-repair predecessor ${rootIndex + 1}`
		);
		if (!isWithin(realPlanRoot, realpathSync(sourceRoot))) {
			throw new Error(
				`Verification-repair predecessor ${rootIndex + 1} escapes the plan directory.`
			);
		}
		for (const [fileIndex, evidence] of predecessor.evidenceInventory.entries()) {
			const relativeEvidencePath = safeArchivePath(evidence.path);
			const sourcePath = path.resolve(sourceRoot, relativeEvidencePath);
			if (!isWithin(sourceRoot, sourcePath)) {
				throw new Error(
					`Verification-repair predecessor ${rootIndex + 1} evidence ${fileIndex + 1} escapes its root.`
				);
			}
			const sourceFile = requiredWorkspaceFile(
				workspaceRoot,
				sourcePath,
				`verification-repair predecessor ${rootIndex + 1} evidence ${fileIndex + 1}`
			);
			const bytes = readFileSync(sourceFile);
			if (sha256(bytes) !== evidence.sha256 || bytes.length !== evidence.bytes) {
				throw new Error(
					`Verification-repair predecessor ${rootIndex + 1} evidence ${evidence.path} differs from the recovery manifest.`
				);
			}
			const record = addTracked(
				'content-repair-predecessor-evidence',
				sourceFile,
				recoveryPredecessorArchivePath(rootIndex, relativeEvidencePath)
			);
			if (record.sha256 !== evidence.sha256 || record.bytes !== evidence.bytes) {
				throw new Error(
					`Archived verification-repair predecessor evidence ${evidence.path} lost its immutable byte binding.`
				);
			}
		}
	}
	writeTrackedJson(
		'content-repair-predecessor-index',
		'content/verification-repair-predecessors.json',
		index
	);
}

function verificationRepairPredecessorArchiveIndex(recoveryManifest) {
	if (
		!Array.isArray(recoveryManifest?.preModelRoots) ||
		recoveryManifest.preModelRoots.length === 0
	) {
		throw new Error('Recovery manifest has no predecessor evidence to archive.');
	}
	const roots = recoveryManifest.preModelRoots.map((predecessor, rootIndex) => {
		if (
			!nonEmpty(predecessor?.path) ||
			!Array.isArray(predecessor.evidenceInventory) ||
			predecessor.evidenceInventory.length === 0
		) {
			throw new Error(`Recovery predecessor ${rootIndex + 1} evidence inventory is invalid.`);
		}
		const seenPaths = new Set();
		const files = predecessor.evidenceInventory.map((evidence, fileIndex) => {
			const evidencePath = safeArchivePath(evidence?.path);
			if (
				evidencePath === '.' ||
				seenPaths.has(evidencePath) ||
				!sha256String(evidence?.sha256) ||
				!Number.isInteger(evidence?.bytes) ||
				evidence.bytes < 0
			) {
				throw new Error(
					`Recovery predecessor ${rootIndex + 1} evidence ${fileIndex + 1} is invalid.`
				);
			}
			seenPaths.add(evidencePath);
			return {
				path: evidencePath,
				archivePath: recoveryPredecessorArchivePath(rootIndex, evidencePath),
				sha256: evidence.sha256,
				bytes: evidence.bytes
			};
		});
		if (
			predecessor.evidenceFileCount !== files.length ||
			predecessor.evidenceBytes !== files.reduce((total, file) => total + file.bytes, 0) ||
			predecessor.evidenceInventorySha256 !==
				canonicalHash(
					files.map(({ path: filePath, sha256: fileSha256, bytes }) => ({
						path: filePath,
						sha256: fileSha256,
						bytes
					}))
				)
		) {
			throw new Error(`Recovery predecessor ${rootIndex + 1} inventory binding is invalid.`);
		}
		return {
			ordinal: rootIndex + 1,
			sourcePath: predecessor.path,
			archiveRoot: recoveryPredecessorArchiveRoot(rootIndex),
			evidenceInventorySha256: predecessor.evidenceInventorySha256,
			evidenceFileCount: predecessor.evidenceFileCount,
			evidenceBytes: predecessor.evidenceBytes,
			files
		};
	});
	return {
		schemaVersion: 'science-challenge-verification-repair-predecessor-archive/v1',
		recoveryManifestSha256: canonicalHash(recoveryManifest),
		rootCount: roots.length,
		fileCount: roots.reduce((total, root) => total + root.evidenceFileCount, 0),
		bytes: roots.reduce((total, root) => total + root.evidenceBytes, 0),
		roots
	};
}

function recoveryPredecessorArchiveRoot(rootIndex) {
	return `content/recovery-predecessors/predecessor-${String(rootIndex + 1).padStart(2, '0')}`;
}

function recoveryPredecessorArchivePath(rootIndex, evidencePath) {
	return safeArchivePath(
		`${recoveryPredecessorArchiveRoot(rootIndex)}/${safeArchivePath(evidencePath)}`
	);
}

function archiveLineageArtifacts({
	workspaceRoot,
	lineage,
	addTracked,
	addExternal,
	writeTrackedText
}) {
	for (const shard of lineage.content ?? []) {
		const shardId = safeFilename(shard.shardId);
		addTracked(
			'content-candidate',
			shard.candidatePath,
			`content/shards/${shardId}/accepted-candidate.json`
		);
		for (const run of shard.runSummaries ?? []) {
			const attemptId = contentAttemptId(run);
			addTracked(
				'content-candidate',
				run.candidatePath,
				`content/shards/${shardId}/attempts/${attemptId}/candidate.json`
			);
			if (run.repairEvidence) {
				addTracked(
					'content-review-summary',
					run.repairEvidence.verificationSummaryPath,
					`content/shards/${shardId}/attempts/${attemptId}/verification-summary.json`
				);
				addTracked(
					'content-prior-candidate',
					run.repairEvidence.priorCandidatePath,
					`content/shards/${shardId}/attempts/${attemptId}/prior-candidate.json`
				);
			}
		}
		if (shard.salvage) {
			archiveMultipartPlanSalvageArtifacts({
				workspaceRoot,
				shardId,
				salvage: shard.salvage,
				addTracked
			});
		}
		if (shard.continuation) {
			archiveMultipartContinuationArtifacts({
				workspaceRoot,
				shardId,
				continuation: shard.continuation,
				addTracked,
				addExternal,
				writeTrackedText
			});
		}
	}
	const archivedRepairEvidence = new Set();
	for (const item of lineage.art ?? []) {
		for (const theme of ['dark', 'light']) {
			const output = item.outputs?.[theme];
			if (output?.path) {
				addExternal('generated-art-image', `accepted-${item.id}-${theme}`, output.path);
			}
		}
		for (const job of item.matchingJobs ?? []) {
			const jobName = path.basename(job.path);
			const jobId = safeFilename(jobName.replace(/\.json$/, ''));
			addTracked(
				'art-generation-job',
				job.path,
				`art/generation/${safeFilename(item.id)}/${safeFilename(jobName)}`
			);
			if (job.repairEvidencePath && !archivedRepairEvidence.has(job.repairEvidencePath)) {
				const repairName = path.basename(job.repairEvidencePath);
				addTracked(
					'art-generation-repair-evidence',
					job.repairEvidencePath,
					`art/repair-evidence/${safeFilename(repairName)}`
				);
				archivedRepairEvidence.add(job.repairEvidencePath);
			}
			for (const [key, artifact] of Object.entries(job.generationArtifacts ?? {})) {
				if (!artifact?.path) continue;
				if (['darkMaster', 'lightMaster', 'darkNormalized', 'lightNormalized'].includes(key)) {
					addExternal('generated-art-image', `${item.id}-${jobId}-${key}`, artifact.path);
				} else {
					const extension = path.extname(artifact.path) || (key === 'spec' ? '.json' : '.txt');
					addTracked(
						key === 'spec' ? 'art-generation-spec' : 'art-generation-prompt',
						artifact.path,
						`art/generation/${safeFilename(item.id)}/lineage/${jobId}/${safeFilename(key)}${extension}`
					);
				}
			}
		}
	}
	void workspaceRoot;
}

function archiveMultipartPlanSalvageArtifacts({ workspaceRoot, shardId, salvage, addTracked }) {
	if (
		!salvage ||
		salvage.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_EVIDENCE_SCHEMA
	) {
		throw new Error(`${shardId} multipart plan-drift salvage lineage schema is invalid.`);
	}
	const destinationRoot = `content/shards/${shardId}/multipart-plan-salvage`;
	addTracked(
		'content-multipart-plan-salvage-manifest',
		salvage.manifestPath,
		`${destinationRoot}/manifest.json`
	);
	addTracked(
		'content-multipart-plan-salvage-candidate',
		salvage.candidatePath,
		`${destinationRoot}/candidate.json`
	);
	addTracked(
		'content-multipart-plan-salvage-validation',
		salvage.validationPath,
		`${destinationRoot}/validation.json`
	);

	const execution = salvage.execution;
	if (
		!execution ||
		!nonEmpty(execution.objectivePath) ||
		!Array.isArray(execution.claims) ||
		execution.claims.length !== VERIFICATION_REPAIR_MAX_ATTEMPTS
	) {
		throw new Error(`${shardId} multipart plan-drift salvage execution lineage is incomplete.`);
	}
	addTracked(
		'content-multipart-plan-salvage-objective',
		execution.objectivePath,
		`${destinationRoot}/execution/objective.json`
	);
	const seenClaimAttempts = new Set();
	for (const claim of execution.claims) {
		if (
			!Number.isInteger(claim?.attempt) ||
			claim.attempt < 1 ||
			claim.attempt > VERIFICATION_REPAIR_MAX_ATTEMPTS ||
			seenClaimAttempts.has(claim.attempt)
		) {
			throw new Error(`${shardId} multipart plan-drift salvage claim lineage is invalid.`);
		}
		seenClaimAttempts.add(claim.attempt);
		addTracked(
			'content-multipart-plan-salvage-claim',
			claim.path,
			`${destinationRoot}/execution/claims/attempt-${String(claim.attempt).padStart(2, '0')}.json`
		);
	}

	const sourceAttempt = salvage.sourceAttempt;
	if (
		!sourceAttempt ||
		sourceAttempt.status !== 'failed' ||
		!Number.isInteger(sourceAttempt.attempt)
	) {
		throw new Error(`${shardId} multipart plan-drift salvage source attempt lineage is invalid.`);
	}
	const sourceAttemptDirectory = safeFilename(
		path.basename(path.dirname(path.resolve(workspaceRoot, sourceAttempt.runSummaryPath)))
	);
	const sourceAttemptRoot = `content/shards/${shardId}/attempts/${sourceAttemptDirectory}`;
	for (const [sourcePath, kind, name] of [
		[sourceAttempt.runSummaryPath, 'content-run-summary', 'run-summary.json'],
		[sourceAttempt.validationPath, 'content-validation', 'validation.json'],
		[sourceAttempt.lastMessagePath, 'content-final-message', 'last-message.json'],
		...(sourceAttempt.candidatePath
			? [[sourceAttempt.candidatePath, 'content-candidate', 'candidate.json']]
			: [])
	]) {
		addTracked(kind, sourcePath, `${sourceAttemptRoot}/${name}`);
	}

	const repairEvidence = salvage.repairEvidence;
	for (const [sourcePath, kind, name] of [
		[
			repairEvidence?.verificationSummaryPath,
			'content-multipart-plan-salvage-repair-summary',
			'verification-summary.json'
		],
		[
			repairEvidence?.priorCandidatePath,
			'content-multipart-plan-salvage-prior-candidate',
			'prior-candidate.json'
		],
		[
			repairEvidence?.priorValidationPath,
			'content-multipart-plan-salvage-prior-validation',
			'prior-validation.json'
		]
	]) {
		addTracked(kind, sourcePath, `${destinationRoot}/repair/${name}`);
	}
}

function archiveMultipartContinuationArtifacts({
	workspaceRoot,
	shardId,
	continuation,
	addTracked,
	addExternal,
	writeTrackedText
}) {
	if (
		!continuation ||
		continuation.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_SCHEMA
	) {
		throw new Error(`${shardId} multipart continuation lineage schema is invalid.`);
	}
	const destinationRoot = `content/shards/${shardId}/multipart-continuation`;
	const manifestPath = requiredWorkspaceFile(
		workspaceRoot,
		continuation.manifestPath,
		`${shardId} multipart continuation manifest`
	);
	const planPath = requiredWorkspaceFile(
		workspaceRoot,
		continuation.planPath,
		`${shardId} multipart continuation plan`
	);
	const candidatePath = requiredWorkspaceFile(
		workspaceRoot,
		continuation.candidatePath,
		`${shardId} multipart continuation candidate`
	);
	const validationPath = requiredWorkspaceFile(
		workspaceRoot,
		continuation.validationPath,
		`${shardId} multipart continuation validation`
	);
	const manifest = readJson(manifestPath);
	const continuationPlan = readJson(planPath);
	const candidate = readJson(candidatePath);
	const validation = readJson(validationPath);
	if (
		manifest.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_SCHEMA ||
		continuationPlan.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_PLAN_SCHEMA ||
		validation.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_VALIDATION_SCHEMA ||
		canonicalHash(manifest) !== continuation.manifestSha256 ||
		canonicalHash(continuationPlan) !== continuation.planSha256 ||
		canonicalHash(candidate) !== continuation.candidateSha256 ||
		canonicalHash(validation) !== continuation.validationSha256 ||
		manifest.planSha256 !== continuation.planSha256 ||
		manifest.candidateSha256 !== continuation.candidateSha256 ||
		manifest.validationSha256 !== continuation.validationSha256 ||
		validation.collectionValidationSha256 !== canonicalHash(manifest.collectionValidation) ||
		validation.priorCollectionFailureSha256 !==
			(manifest.priorCollectionFailure ? canonicalHash(manifest.priorCollectionFailure) : null)
	) {
		throw new Error(`${shardId} multipart continuation final evidence is not internally bound.`);
	}
	for (const [kind, sourcePath, destination] of [
		['content-multipart-continuation-manifest', manifestPath, 'manifest.json'],
		['content-multipart-continuation-plan', planPath, 'plan.json'],
		['content-multipart-continuation-candidate', candidatePath, 'candidate.json'],
		['content-multipart-continuation-validation', validationPath, 'validation.json']
	]) {
		addTracked(kind, sourcePath, `${destinationRoot}/${destination}`);
	}

	const execution = continuation.execution;
	if (
		!execution ||
		!nonEmpty(execution.objectivePath) ||
		!Array.isArray(execution.claims) ||
		execution.claims.length !== continuation.continuationParts.length
	) {
		throw new Error(`${shardId} multipart continuation execution lineage is incomplete.`);
	}
	if (continuation.collectionValidationSnapshot) {
		const snapshotPath = requiredWorkspaceFile(
			workspaceRoot,
			continuation.collectionValidationSnapshot.path,
			`${shardId} multipart continuation collection snapshot`
		);
		const snapshot = readJson(snapshotPath);
		if (
			canonicalHash(snapshot) !== continuation.collectionValidationSnapshot.canonicalSha256 ||
			sha256(readFileSync(snapshotPath)) !== continuation.collectionValidationSnapshot.byteSha256 ||
			snapshot.candidateSha256 !== continuation.candidateSha256 ||
			snapshot.claimSetSha256 !== canonicalHash(execution.claims.map((claim) => claim.sha256)) ||
			canonicalHash(snapshot.collectionValidation) !== canonicalHash(manifest.collectionValidation)
		) {
			throw new Error(`${shardId} multipart continuation collection snapshot binding is invalid.`);
		}
		addTracked(
			'content-multipart-continuation-collection-snapshot',
			snapshotPath,
			`${destinationRoot}/collection-validation.json`
		);
	}
	if (continuation.priorCollectionFailureEvidence) {
		const failurePath = requiredWorkspaceFile(
			workspaceRoot,
			continuation.priorCollectionFailureEvidence.path,
			`${shardId} multipart continuation prior collection failure`
		);
		const failure = readJson(failurePath);
		if (
			manifest.priorCollectionFailure === null ||
			canonicalHash(failure) !== continuation.priorCollectionFailureEvidence.canonicalSha256 ||
			sha256(readFileSync(failurePath)) !==
				continuation.priorCollectionFailureEvidence.byteSha256 ||
			canonicalHash(failure) !== canonicalHash(manifest.priorCollectionFailure)
		) {
			throw new Error(
				`${shardId} multipart continuation prior collection failure binding is invalid.`
			);
		}
		addTracked(
			'content-multipart-continuation-prior-collection-failure',
			failurePath,
			`${destinationRoot}/failure.json`
		);
	}
	const objectivePath = requiredWorkspaceFile(
		workspaceRoot,
		execution.objectivePath,
		`${shardId} multipart continuation objective`
	);
	if (
		canonicalHash(readJson(objectivePath)) !== execution.objectiveSha256 ||
		sha256(readFileSync(objectivePath)) !==
			(execution.objectiveByteSha256 ?? sha256(readFileSync(objectivePath)))
	) {
		throw new Error(`${shardId} multipart continuation objective binding is invalid.`);
	}
	addTracked(
		'content-multipart-continuation-objective',
		objectivePath,
		`${destinationRoot}/execution/objective.json`
	);
	for (const claim of execution.claims) {
		const claimPath = requiredWorkspaceFile(
			workspaceRoot,
			claim.path,
			`${shardId} multipart continuation ${claim.partId} claim`
		);
		const claimValue = readJson(claimPath);
		if (
			canonicalHash(claimValue) !== claim.sha256 ||
			sha256(readFileSync(claimPath)) !== claim.byteSha256
		) {
			throw new Error(`${shardId} multipart continuation ${claim.partId} claim is invalid.`);
		}
		addTracked(
			'content-multipart-continuation-claim',
			claimPath,
			`${destinationRoot}/execution/claims/${safeFilename(claim.partId)}.json`
		);
		const invocationPath = requiredWorkspaceFile(
			workspaceRoot,
			claim.invocationPath,
			`${shardId} multipart continuation ${claim.partId} invocation journal`
		);
		const invocationValue = readJson(invocationPath);
		if (
			invocationValue.schemaVersion !==
				SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MULTIPART_INVOCATION_SCHEMA ||
			invocationValue.partId !== claim.partId ||
			invocationValue.claimSha256 !== canonicalHash(claimValue) ||
			invocationValue.claimByteSha256 !== sha256(readFileSync(claimPath)) ||
			canonicalHash(invocationValue) !== claim.invocationSha256 ||
			sha256(readFileSync(invocationPath)) !== claim.invocationByteSha256
		) {
			throw new Error(
				`${shardId} multipart continuation ${claim.partId} invocation journal is invalid.`
			);
		}
		addTracked(
			'content-multipart-continuation-invocation',
			invocationPath,
			`${destinationRoot}/execution/invocations/${safeFilename(claim.partId)}.json`
		);
	}

	const manifestParts = new Map(
		(manifest.continuationParts ?? []).map((part) => [part.partId, part])
	);
	const plannedParts = new Map((continuationPlan.parts ?? []).map((part) => [part.partId, part]));
	for (const part of continuation.continuationParts) {
		const binding = manifestParts.get(part.partId);
		const planned = plannedParts.get(part.partId);
		if (
			!binding ||
			!planned ||
			canonicalHash(binding) !== part.evidenceSha256 ||
			binding.claimSha256 !== part.claimSha256
		) {
			throw new Error(`${shardId} multipart continuation ${part.partId} lineage is invalid.`);
		}
		const destination = `${destinationRoot}/parts/${safeFilename(part.partId)}`;
		const promptDependency = addExternal(
			'full-content-prompt',
			`content-${shardId}-multipart-continuation-${part.partId}-prompt`,
			part.paths.prompt
		);
		if (promptDependency.sha256 !== binding.prompt?.byteSha256) {
			throw new Error(
				`${shardId} multipart continuation ${part.partId} prompt binding is invalid.`
			);
		}
		writeTrackedText(
			'content-prompt',
			`${destination}/prompt.txt`,
			sanitizeContentPrompt(
				readFileSync(
					requiredWorkspaceFile(workspaceRoot, part.paths.prompt, 'continuation prompt'),
					'utf8'
				),
				planned.inputSha256
			),
			{
				sourceSha256: promptDependency.sha256,
				externalDependencyId: promptDependency.id,
				redaction: 'official-authoring-input'
			}
		);
		for (const [pathKey, bindingKey, kind, id, options] of [
			[
				'request',
				'request',
				'direct-prompt-json-request',
				`content-${shardId}-multipart-continuation-${part.partId}-request`,
				{ json: true }
			],
			[
				'events',
				'eventLog',
				'direct-prompt-json-event-log',
				`content-${shardId}-multipart-continuation-${part.partId}-events`,
				{ eventLog: true }
			],
			[
				'thoughts',
				'thoughts',
				'model-thought-log',
				`content-${shardId}-multipart-continuation-${part.partId}-thoughts`,
				{}
			]
		]) {
			const dependency = addExternal(kind, id, part.paths[pathKey], options);
			if (dependency.sha256 !== binding[bindingKey]?.byteSha256) {
				throw new Error(
					`${shardId} multipart continuation ${part.partId} ${pathKey} binding is invalid.`
				);
			}
		}
		for (const [pathKey, bindingKey, kind, filename] of [
			['lastMessage', 'lastMessage', 'content-part-final-message', 'last-message.json'],
			[
				'resultMetadata',
				'resultMetadata',
				'content-part-run-result-metadata',
				'result-metadata.json'
			],
			['runSummary', 'runSummary', 'content-part-run-summary', 'run-summary.json']
		]) {
			const sourcePath = requiredWorkspaceFile(
				workspaceRoot,
				part.paths[pathKey],
				`${shardId} multipart continuation ${part.partId} ${pathKey}`
			);
			if (sha256(readFileSync(sourcePath)) !== binding[bindingKey]?.byteSha256) {
				throw new Error(
					`${shardId} multipart continuation ${part.partId} ${pathKey} binding is invalid.`
				);
			}
			addTracked(kind, sourcePath, `${destination}/${filename}`);
		}
	}
}

function buildSanitizedLineage(workspaceRoot, lineage, sourceBindings, trackedArtifacts) {
	return {
		schemaVersion: 'science-challenge-sanitized-lineage/v1',
		sourceLineageSha256: canonicalHash(lineage),
		sourceContentLineageSha256: canonicalHash(lineage.content),
		sourceArtLineageSha256: canonicalHash(lineage.art),
		recovery: lineage.recovery ?? null,
		effectiveCohort: lineage.effectiveCohort ?? null,
		curriculumRemap: lineage.curriculumRemap ?? null,
		difficultyPlanAdjustment: lineage.difficultyPlanAdjustment ?? null,
		descendantRemaps: (lineage.content ?? [])
			.filter((shard) => shard?.descendantRemap)
			.map((shard) => ({
				shardId: shard.shardId,
				manifestSha256: shard.descendantRemap.manifestSha256,
				remapSha256: shard.descendantRemap.remapSha256,
				basePlanSha256: shard.descendantRemap.basePlanSha256,
				effectivePlanSha256: shard.descendantRemap.effectivePlanSha256
			})),
		difficultyPlanAdjustments: (lineage.content ?? [])
			.filter((shard) => shard?.difficultyPlanAdjustment)
			.map((shard) => ({
				shardId: shard.shardId,
				manifestSha256: shard.difficultyPlanAdjustment.manifestSha256,
				adjustmentSha256: shard.difficultyPlanAdjustment.adjustmentSha256 ?? null,
				adjustmentSetSha256: shard.difficultyPlanAdjustment.adjustmentSetSha256 ?? null,
				adjustmentCount: shard.difficultyPlanAdjustment.adjustmentCount ?? 1,
				basePlanSha256: shard.difficultyPlanAdjustment.basePlanSha256,
				effectivePlanSha256: shard.difficultyPlanAdjustment.effectivePlanSha256
			})),
		content: (lineage.content ?? []).map((shard) => ({
			shardId: shard.shardId,
			candidateSha256: shard.candidateSha256,
			candidateRef: referenceFor(
				workspaceRoot,
				sourceBindings,
				shard.candidatePath,
				shard.candidateSha256,
				`${shard.shardId} accepted candidate`
			),
			validationSha256: shard.validationSha256,
			validationRef: referenceFor(
				workspaceRoot,
				sourceBindings,
				shard.validationPath,
				shard.validationSha256,
				`${shard.shardId} accepted validation`
			),
			salvage: shard.salvage
				? sanitizedMultipartPlanSalvage({
						workspaceRoot,
						sourceBindings,
						trackedArtifacts,
						shardId: shard.shardId,
						salvage: shard.salvage
					})
				: null,
			continuation: shard.continuation
				? sanitizedMultipartContinuation({
						workspaceRoot,
						sourceBindings,
						trackedArtifacts,
						shardId: shard.shardId,
						continuation: shard.continuation
					})
				: null,
			descendantRemap: shard.descendantRemap
				? sanitizedDescendantRemap({
						workspaceRoot,
						sourceBindings,
						shardId: shard.shardId,
						remap: shard.descendantRemap
					})
				: null,
			difficultyPlanAdjustment: shard.difficultyPlanAdjustment
				? sanitizedDifficultyPlanAdjustment({
						workspaceRoot,
						sourceBindings,
						shardId: shard.shardId,
						adjustment: shard.difficultyPlanAdjustment
					})
				: null,
			runs: (shard.runSummaries ?? []).map((run) => {
				const promptRef = referenceFor(
					workspaceRoot,
					sourceBindings,
					run.promptPath,
					run.promptSha256,
					`${shard.shardId} prompt`
				);
				const sanitizedPrompt = trackedArtifacts.find(
					(artifact) =>
						artifact.kind === 'content-prompt' &&
						artifact.sourceSha256 === run.promptSha256 &&
						artifact.externalDependencyId === promptRef.id
				);
				if (!sanitizedPrompt) {
					throw new Error(`${shard.shardId} has no sanitized prompt bound to its raw prompt.`);
				}
				return {
					kind: run.kind,
					attempt: run.attempt,
					runSummarySha256: run.sha256,
					runSummaryRef: referenceFor(
						workspaceRoot,
						sourceBindings,
						run.path,
						run.sha256,
						`${shard.shardId} run summary`
					),
					eventLogSha256: run.eventLogSha256,
					eventLogRef: referenceFor(
						workspaceRoot,
						sourceBindings,
						run.eventLogPath,
						run.eventLogSha256,
						`${shard.shardId} event log`
					),
					lastMessageSha256: run.lastMessageSha256,
					lastMessageRef: referenceFor(
						workspaceRoot,
						sourceBindings,
						run.lastMessagePath,
						run.lastMessageSha256,
						`${shard.shardId} final message`
					),
					promptSha256: run.promptSha256,
					promptRef,
					sanitizedPromptRef: artifactReference(sanitizedPrompt),
					candidateSha256: run.candidateSha256,
					candidateRef: referenceFor(
						workspaceRoot,
						sourceBindings,
						run.candidatePath,
						run.candidateSha256,
						`${shard.shardId} run candidate`
					),
					validationSha256: run.validationSha256,
					validationRef: referenceFor(
						workspaceRoot,
						sourceBindings,
						run.validationPath,
						run.validationSha256,
						`${shard.shardId} run validation`
					),
					inputSha256: run.inputSha256,
					rawCandidateSha256: run.rawCandidateSha256,
					normalizationVersion: run.normalizationVersion,
					transport: run.transport ?? 'codex-sdk',
					responseMode: run.responseMode ?? null,
					transportVersion: run.transportVersion ?? null,
					provider: run.provider ?? null,
					model: run.model,
					modelVersion: run.modelVersion ?? null,
					thinkingLevel: run.thinkingLevel,
					requestSha256: run.requestSha256 ?? null,
					requestRef: run.requestPath
						? referenceFor(
								workspaceRoot,
								sourceBindings,
								run.requestPath,
								run.requestSha256,
								`${shard.shardId} direct request`
							)
						: null,
					thoughtsSha256: run.thoughtsSha256 ?? null,
					thoughtsRef: run.thoughtsPath
						? referenceFor(
								workspaceRoot,
								sourceBindings,
								run.thoughtsPath,
								run.thoughtsSha256,
								`${shard.shardId} direct thoughts`
							)
						: null,
					resultMetadataSha256: run.resultMetadataSha256 ?? null,
					resultMetadataRef: run.resultMetadataPath
						? referenceFor(
								workspaceRoot,
								sourceBindings,
								run.resultMetadataPath,
								run.resultMetadataSha256,
								`${shard.shardId} direct result metadata`
							)
						: null,
					modelVersions: run.modelVersions ?? null,
					directPartSize: run.directPartSize ?? null,
					rowIds: run.rowIds ?? null,
					parts: Array.isArray(run.parts)
						? run.parts.map((part) =>
								sanitizedMultipartPart({
									workspaceRoot,
									sourceBindings,
									trackedArtifacts,
									shardId: shard.shardId,
									part
								})
							)
						: null,
					status: run.status,
					toolFree: run.toolFree,
					repairEvidence: run.repairEvidence
						? {
								verificationSummarySha256: run.repairEvidence.verificationSummarySha256,
								verificationSummaryRef: referenceFor(
									workspaceRoot,
									sourceBindings,
									run.repairEvidence.verificationSummaryPath,
									run.repairEvidence.verificationSummarySha256,
									`${shard.shardId} verification repair summary`
								),
								priorCandidateSha256: run.repairEvidence.priorCandidateSha256,
								priorCandidateRef: referenceFor(
									workspaceRoot,
									sourceBindings,
									run.repairEvidence.priorCandidatePath,
									run.repairEvidence.priorCandidateSha256,
									`${shard.shardId} prior candidate`
								)
							}
						: null
				};
			})
		})),
		art: (lineage.art ?? []).map((item) => ({
			id: item.id,
			specSha256: item.specSha256,
			outputs: Object.fromEntries(
				['dark', 'light'].map((theme) => {
					const output = item.outputs[theme];
					return [
						theme,
						{
							sha256: output.sha256,
							width: output.width,
							height: output.height,
							ref: referenceFor(
								workspaceRoot,
								sourceBindings,
								output.path,
								output.sha256,
								`${item.id} ${theme} output`
							)
						}
					];
				})
			),
			jobs: (item.matchingJobs ?? []).map((job) => ({
				sha256: job.sha256,
				jobRef: referenceFor(
					workspaceRoot,
					sourceBindings,
					job.path,
					job.sha256,
					`${item.id} art job`
				),
				imageModel: job.imageModel,
				attempt: job.attempt,
				repairReviewSha256: job.repairReviewSha256,
				repairPerceptualAuditSha256: job.repairPerceptualAuditSha256,
				repairEvidenceRef: job.repairEvidencePath
					? referenceFor(
							workspaceRoot,
							sourceBindings,
							job.repairEvidencePath,
							job.repairReviewSha256 ?? job.repairPerceptualAuditSha256,
							`${item.id} art repair evidence`
						)
					: null,
				finishedAt: job.finishedAt,
				artifacts: Object.fromEntries(
					Object.entries(job.generationArtifacts ?? {}).map(([key, artifact]) => [
						key,
						{
							sha256: artifact.sha256,
							size: artifact.size,
							ref: referenceFor(
								workspaceRoot,
								sourceBindings,
								artifact.path,
								artifact.sha256,
								`${item.id} ${key}`
							)
						}
					])
				)
			}))
		}))
	};
}

function sanitizedDescendantRemap({ workspaceRoot, sourceBindings, shardId, remap }) {
	const ref = (sourcePath, expectedSha256, label) =>
		referenceFor(
			workspaceRoot,
			sourceBindings,
			sourcePath,
			expectedSha256,
			`${shardId} descendant remap ${label}`
		);
	const staged = {};
	for (const [name, pathField, hashField] of [
		['manifest', 'manifestPath', 'manifestSha256'],
		['candidate', 'candidatePath', 'candidateSha256'],
		['validation', 'validationPath', 'validationSha256'],
		['effectivePlan', 'effectivePlanPath', 'effectivePlanSha256'],
		['provenance', 'provenancePath', 'provenanceSha256'],
		['priorCandidate', 'priorCandidatePath', 'priorCandidateSha256'],
		['priorValidation', 'priorValidationPath', 'priorValidationSha256'],
		['firstReviewSummary', 'firstReviewSummaryPath', 'firstReviewSummarySha256'],
		['firstReviewResult', 'firstReviewResultPath', 'firstReviewResultSha256'],
		['firstAssignment', 'firstAssignmentPath', 'firstAssignmentSha256'],
		['firstDispatchLedger', 'firstDispatchLedgerPath', 'firstDispatchLedgerSha256'],
		['priorBaseBatchValidation', 'priorBaseBatchValidationPath', 'priorBaseBatchValidationSha256'],
		['baseBatchValidation', 'baseBatchValidationPath', 'baseBatchValidationSha256'],
		['effectiveBatchValidation', 'effectiveBatchValidationPath', 'effectiveBatchValidationSha256'],
		['collectionValidation', 'collectionValidationPath', 'collectionValidationSha256'],
		['repairValidation', 'repairValidationPath', 'repairValidationSha256']
	]) {
		staged[name] = ref(remap[pathField], remap[hashField], name);
	}
	return {
		schemaVersion: remap.schemaVersion,
		disposition: remap.disposition,
		basePlanSha256: remap.basePlanSha256,
		effectivePlanSha256: remap.effectivePlanSha256,
		remapSha256: remap.remapSha256,
		sourceAttempt: descendantRemapSourceAttemptProjection(remap.sourceAttempt),
		sourceAttemptStatus: remap.sourceAttemptStatus,
		canonicalVerifier: remap.canonicalVerifier,
		staged,
		execution: {
			executionId: remap.execution.executionId,
			identity: remap.execution.identity,
			objectiveSha256: remap.execution.objectiveSha256,
			objectiveRef: ref(
				remap.execution.objectivePath,
				remap.execution.objectiveSha256,
				'objective'
			),
			claims: remap.execution.claims.map((claim) => ({
				attempt: claim.attempt,
				sha256: claim.sha256,
				ref: ref(claim.path, claim.sha256, `claim ${claim.attempt}`)
			}))
		}
	};
}

function sanitizedDifficultyPlanAdjustment({ workspaceRoot, sourceBindings, shardId, adjustment }) {
	const ref = (sourcePath, expectedSha256, label) =>
		referenceFor(
			workspaceRoot,
			sourceBindings,
			sourcePath,
			expectedSha256,
			`${shardId} difficulty-plan adjustment ${label}`
		);
	const staged = {};
	for (const [name, pathField, hashField] of [
		['manifest', 'manifestPath', 'manifestSha256'],
		['candidate', 'candidatePath', 'candidateSha256'],
		['validation', 'validationPath', 'validationSha256'],
		['effectivePlan', 'effectivePlanPath', 'effectivePlanSha256'],
		['provenance', 'provenancePath', 'provenanceSha256'],
		['priorCandidate', 'priorCandidatePath', 'priorCandidateSha256'],
		['priorValidation', 'priorValidationPath', 'priorValidationSha256'],
		['firstReviewSummary', 'firstReviewSummaryPath', 'firstReviewSummarySha256'],
		['firstReviewResult', 'firstReviewResultPath', 'firstReviewResultSha256'],
		['firstAssignment', 'firstAssignmentPath', 'firstAssignmentSha256'],
		['firstDispatchLedger', 'firstDispatchLedgerPath', 'firstDispatchLedgerSha256'],
		['priorBaseBatchValidation', 'priorBaseBatchValidationPath', 'priorBaseBatchValidationSha256'],
		['baseBatchValidation', 'baseBatchValidationPath', 'baseBatchValidationSha256'],
		['effectiveBatchValidation', 'effectiveBatchValidationPath', 'effectiveBatchValidationSha256'],
		['collectionValidation', 'collectionValidationPath', 'collectionValidationSha256'],
		['repairValidation', 'repairValidationPath', 'repairValidationSha256']
	]) {
		staged[name] = ref(adjustment[pathField], adjustment[hashField], name);
	}
	return {
		schemaVersion: adjustment.schemaVersion,
		disposition: adjustment.disposition,
		basePlanSha256: adjustment.basePlanSha256,
		effectivePlanSha256: adjustment.effectivePlanSha256,
		adjustmentSha256: adjustment.adjustmentSha256 ?? null,
		adjustmentSetSha256: adjustment.adjustmentSetSha256 ?? null,
		adjustmentCount: adjustment.adjustmentCount ?? 1,
		sourceAttempt: descendantRemapSourceAttemptProjection(adjustment.sourceAttempt),
		sourceAttemptStatus: adjustment.sourceAttemptStatus,
		canonicalVerifier: adjustment.canonicalVerifier,
		staged,
		execution: {
			executionId: adjustment.execution.executionId,
			identity: adjustment.execution.identity,
			objectiveSha256: adjustment.execution.objectiveSha256,
			objectiveRef: ref(
				adjustment.execution.objectivePath,
				adjustment.execution.objectiveSha256,
				'objective'
			),
			claims: adjustment.execution.claims.map((claim) => ({
				attempt: claim.attempt,
				sha256: claim.sha256,
				ref: ref(claim.path, claim.sha256, `claim ${claim.attempt}`)
			}))
		}
	};
}

function sanitizedMultipartContinuation({
	workspaceRoot,
	sourceBindings,
	trackedArtifacts,
	shardId,
	continuation
}) {
	const ref = (sourcePath, expectedSha256, label) =>
		referenceFor(
			workspaceRoot,
			sourceBindings,
			sourcePath,
			expectedSha256,
			`${shardId} multipart continuation ${label}`
		);
	const manifest = readJson(
		requiredWorkspaceFile(workspaceRoot, continuation.manifestPath, 'manifest')
	);
	const manifestParts = new Map(
		(manifest.continuationParts ?? []).map((part) => [part.partId, part])
	);
	const optionalEvidence = (evidence, label) =>
		evidence
			? {
					canonicalSha256: evidence.canonicalSha256,
					byteSha256: evidence.byteSha256,
					ref: ref(evidence.path, evidence.canonicalSha256, label)
				}
			: null;
	const sanitizedPromptReference = (sourcePath, sourceSha256, label) => {
		const rawRef = ref(sourcePath, sourceSha256, label);
		const sanitized = trackedArtifacts.find(
			(artifact) =>
				artifact.kind === 'content-prompt' &&
				artifact.sourceSha256 === sourceSha256 &&
				artifact.externalDependencyId === rawRef.id
		);
		if (!sanitized) {
			throw new Error(`${shardId} multipart continuation ${label} has no sanitized prompt.`);
		}
		return { rawRef, sanitizedRef: artifactReference(sanitized) };
	};
	const sourceAttempt = continuation.sourceAttempt;
	const sourcePrompt = sanitizedPromptReference(
		sourceAttempt.files.prompt,
		sourceAttempt.prompt.byteSha256,
		'source orchestration prompt'
	);
	const sourcePartById = new Map(
		(sourceAttempt.partFiles ?? []).map((part) => [part.partId, part])
	);
	return {
		schemaVersion: continuation.schemaVersion,
		manifestSha256: continuation.manifestSha256,
		manifestRef: ref(continuation.manifestPath, continuation.manifestSha256, 'manifest'),
		planSha256: continuation.planSha256,
		planRef: ref(continuation.planPath, continuation.planSha256, 'plan'),
		candidateSha256: continuation.candidateSha256,
		candidateRef: ref(continuation.candidatePath, continuation.candidateSha256, 'candidate'),
		validationSha256: continuation.validationSha256,
		validationRef: ref(continuation.validationPath, continuation.validationSha256, 'validation'),
		collectionValidationSnapshot: optionalEvidence(
			continuation.collectionValidationSnapshot,
			'collection validation snapshot'
		),
		priorCollectionFailureEvidence: optionalEvidence(
			continuation.priorCollectionFailureEvidence,
			'prior collection failure'
		),
		execution: {
			objectiveSha256: continuation.execution.objectiveSha256,
			objectiveRef: ref(
				continuation.execution.objectivePath,
				continuation.execution.objectiveSha256,
				'execution objective'
			),
			claims: continuation.execution.claims.map((claim) => ({
				partId: claim.partId,
				sha256: claim.sha256,
				byteSha256: claim.byteSha256,
				ref: ref(claim.path, claim.sha256, `${claim.partId} execution claim`),
				invocationSha256: claim.invocationSha256,
				invocationByteSha256: claim.invocationByteSha256,
				invocationRef: ref(
					claim.invocationPath,
					claim.invocationSha256,
					`${claim.partId} invocation journal`
				)
			}))
		},
		sourceAttempt: {
			attempt: sourceAttempt.attempt,
			status: sourceAttempt.status,
			sha256: sourceAttempt.sha256,
			partsSha256: sourceAttempt.partsSha256,
			promptSha256: sourceAttempt.prompt.byteSha256,
			promptRef: sourcePrompt.rawRef,
			sanitizedPromptRef: sourcePrompt.sanitizedRef,
			runSummarySha256: sourceAttempt.runSummary.byteSha256,
			runSummaryRef: ref(
				sourceAttempt.files.runSummary,
				sourceAttempt.runSummary.byteSha256,
				'source run summary'
			),
			eventLogSha256: sourceAttempt.eventLog.byteSha256,
			eventLogRef: ref(
				sourceAttempt.files.eventLog,
				sourceAttempt.eventLog.byteSha256,
				'source event log'
			),
			lastMessageSha256: sourceAttempt.lastMessage.byteSha256,
			lastMessageRef: ref(
				sourceAttempt.files.lastMessage,
				sourceAttempt.lastMessage.byteSha256,
				'source final message'
			),
			validationSha256: sourceAttempt.validation.byteSha256,
			validationRef: ref(
				sourceAttempt.files.validation,
				sourceAttempt.validation.byteSha256,
				'source validation'
			),
			parts: sourceAttempt.parts.map((part) => {
				const files = sourcePartById.get(part.partId);
				if (!files) {
					throw new Error(
						`${shardId} multipart continuation source ${part.partId} file lineage is missing.`
					);
				}
				const prompt = sanitizedPromptReference(
					files.paths.prompt,
					part.prompt.byteSha256,
					`source ${part.partId} prompt`
				);
				return {
					partId: part.partId,
					recordSha256: part.recordSha256,
					promptSha256: part.prompt.byteSha256,
					promptRef: prompt.rawRef,
					sanitizedPromptRef: prompt.sanitizedRef,
					requestSha256: part.request.byteSha256,
					requestRef: ref(
						files.paths.request,
						part.request.byteSha256,
						`source ${part.partId} request`
					),
					eventLogSha256: part.eventLog.byteSha256,
					eventLogRef: ref(
						files.paths.events,
						part.eventLog.byteSha256,
						`source ${part.partId} event log`
					),
					lastMessageSha256: part.lastMessage.byteSha256,
					lastMessageRef: ref(
						files.paths.lastMessage,
						part.lastMessage.byteSha256,
						`source ${part.partId} final message`
					),
					thoughtsSha256: part.thoughts.byteSha256,
					thoughtsRef: ref(
						files.paths.thoughts,
						part.thoughts.byteSha256,
						`source ${part.partId} thoughts`
					),
					resultMetadataSha256: part.resultMetadata.byteSha256,
					resultMetadataRef: ref(
						files.paths.resultMetadata,
						part.resultMetadata.byteSha256,
						`source ${part.partId} result metadata`
					),
					runSummarySha256: part.runSummary.byteSha256,
					runSummaryRef: ref(
						files.paths.runSummary,
						part.runSummary.byteSha256,
						`source ${part.partId} run summary`
					)
				};
			})
		},
		continuationParts: continuation.continuationParts.map((part) => {
			const binding = manifestParts.get(part.partId);
			if (!binding || canonicalHash(binding) !== part.evidenceSha256) {
				throw new Error(
					`${shardId} multipart continuation ${part.partId} manifest binding is missing.`
				);
			}
			const prompt = sanitizedPromptReference(
				part.paths.prompt,
				binding.prompt.byteSha256,
				`${part.partId} prompt`
			);
			return {
				partId: part.partId,
				claimSha256: part.claimSha256,
				claimRef: ref(part.claimPath, part.claimSha256, `${part.partId} claim`),
				evidenceSha256: part.evidenceSha256,
				promptSha256: binding.prompt.byteSha256,
				promptRef: prompt.rawRef,
				sanitizedPromptRef: prompt.sanitizedRef,
				requestSha256: binding.request.byteSha256,
				requestRef: ref(part.paths.request, binding.request.byteSha256, `${part.partId} request`),
				eventLogSha256: binding.eventLog.byteSha256,
				eventLogRef: ref(
					part.paths.events,
					binding.eventLog.byteSha256,
					`${part.partId} event log`
				),
				lastMessageSha256: binding.lastMessage.byteSha256,
				lastMessageRef: ref(
					part.paths.lastMessage,
					binding.lastMessage.byteSha256,
					`${part.partId} final message`
				),
				thoughtsSha256: binding.thoughts.byteSha256,
				thoughtsRef: ref(
					part.paths.thoughts,
					binding.thoughts.byteSha256,
					`${part.partId} thoughts`
				),
				resultMetadataSha256: binding.resultMetadata.byteSha256,
				resultMetadataRef: ref(
					part.paths.resultMetadata,
					binding.resultMetadata.byteSha256,
					`${part.partId} result metadata`
				),
				runSummarySha256: binding.runSummary.byteSha256,
				runSummaryRef: ref(
					part.paths.runSummary,
					binding.runSummary.byteSha256,
					`${part.partId} run summary`
				)
			};
		})
	};
}

function sanitizedMultipartPlanSalvage({
	workspaceRoot,
	sourceBindings,
	trackedArtifacts,
	shardId,
	salvage
}) {
	const ref = (sourcePath, expectedSha256, label) =>
		referenceFor(
			workspaceRoot,
			sourceBindings,
			sourcePath,
			expectedSha256,
			`${shardId} multipart plan-drift salvage ${label}`
		);
	const sourceAttempt = salvage.sourceAttempt;
	const promptRef = ref(
		sourceAttempt.promptPath,
		sourceAttempt.promptSha256,
		'source orchestration prompt'
	);
	const sanitizedPrompt = trackedArtifacts.find(
		(artifact) =>
			artifact.kind === 'content-prompt' &&
			artifact.sourceSha256 === sourceAttempt.promptSha256 &&
			artifact.externalDependencyId === promptRef.id
	);
	if (!sanitizedPrompt) {
		throw new Error(
			`${shardId} multipart plan-drift salvage has no sanitized source prompt binding.`
		);
	}
	return {
		schemaVersion: salvage.schemaVersion,
		salvagePathway: salvage.salvagePathway ?? null,
		manifestSha256: salvage.manifestSha256,
		manifestFileSha256: salvage.manifestFileSha256,
		manifestRef: ref(salvage.manifestPath, salvage.manifestSha256, 'manifest'),
		candidateSha256: salvage.candidateSha256,
		candidateFileSha256: salvage.candidateFileSha256,
		candidateRef: ref(salvage.candidatePath, salvage.candidateSha256, 'candidate'),
		validationSha256: salvage.validationSha256,
		validationFileSha256: salvage.validationFileSha256,
		validationRef: ref(salvage.validationPath, salvage.validationSha256, 'validation'),
		execution: {
			executionId: salvage.execution.executionId,
			identity: salvage.execution.identity,
			objectiveSha256: salvage.execution.objectiveSha256,
			objectiveByteSha256: salvage.execution.objectiveByteSha256,
			objectiveRef: ref(
				salvage.execution.objectivePath,
				salvage.execution.objectiveSha256,
				'execution objective'
			),
			claims: salvage.execution.claims.map((claim) => ({
				attempt: claim.attempt,
				sha256: claim.sha256,
				byteSha256: claim.byteSha256,
				ref: ref(claim.path, claim.sha256, `execution claim ${claim.attempt}`)
			}))
		},
		sourceAttempt: {
			attempt: sourceAttempt.attempt,
			status: sourceAttempt.status,
			runSummarySha256: sourceAttempt.runSummarySha256,
			runSummaryFileSha256: sourceAttempt.runSummaryFileSha256,
			runSummaryRef: ref(
				sourceAttempt.runSummaryPath,
				sourceAttempt.runSummarySha256,
				'source run summary'
			),
			validationSha256: sourceAttempt.validationSha256,
			validationFileSha256: sourceAttempt.validationFileSha256,
			validationRef: ref(
				sourceAttempt.validationPath,
				sourceAttempt.validationSha256,
				'source failed validation'
			),
			eventLogSha256: sourceAttempt.eventLogSha256,
			eventLogRef: ref(
				sourceAttempt.eventLogPath,
				sourceAttempt.eventLogSha256,
				'source event log'
			),
			lastMessageSha256: sourceAttempt.lastMessageSha256,
			lastMessageRef: ref(
				sourceAttempt.lastMessagePath,
				sourceAttempt.lastMessageSha256,
				'source final message'
			),
			candidateSha256: sourceAttempt.candidateSha256 ?? null,
			candidateFileSha256: sourceAttempt.candidateFileSha256 ?? null,
			candidateRef: sourceAttempt.candidatePath
				? ref(
						sourceAttempt.candidatePath,
						sourceAttempt.candidateSha256,
						'source normalized candidate'
					)
				: null,
			promptSha256: sourceAttempt.promptSha256,
			promptRef,
			sanitizedPromptRef: artifactReference(sanitizedPrompt),
			parts: (sourceAttempt.parts ?? sourceAttempt.partRecords ?? []).map((part) =>
				sanitizedMultipartPart({
					workspaceRoot,
					sourceBindings,
					trackedArtifacts,
					shardId,
					part
				})
			),
			responseMode: sourceAttempt.responseMode ?? null,
			providerSchemaApplied: sourceAttempt.providerSchemaApplied ?? null
		},
		repairEvidence: {
			verificationSummarySha256: salvage.repairEvidence.verificationSummarySha256,
			verificationSummaryFileSha256: salvage.repairEvidence.verificationSummaryFileSha256,
			verificationSummaryRef: ref(
				salvage.repairEvidence.verificationSummaryPath,
				salvage.repairEvidence.verificationSummarySha256,
				'repair verification summary'
			),
			priorCandidateSha256: salvage.repairEvidence.priorCandidateSha256,
			priorCandidateFileSha256: salvage.repairEvidence.priorCandidateFileSha256,
			priorCandidateRef: ref(
				salvage.repairEvidence.priorCandidatePath,
				salvage.repairEvidence.priorCandidateSha256,
				'repair prior candidate'
			),
			priorValidationSha256: salvage.repairEvidence.priorValidationSha256,
			priorValidationFileSha256: salvage.repairEvidence.priorValidationFileSha256,
			priorValidationRef: ref(
				salvage.repairEvidence.priorValidationPath,
				salvage.repairEvidence.priorValidationSha256,
				'repair prior validation'
			)
		},
		sourceSelection: salvage.sourceSelection,
		sourceSelectionSha256: salvage.sourceSelectionSha256,
		corrections: salvage.corrections,
		salvageSourceSha256: salvage.salvageSourceSha256
	};
}

function sanitizedMultipartPart({
	workspaceRoot,
	sourceBindings,
	trackedArtifacts,
	shardId,
	part
}) {
	const promptRef = referenceFor(
		workspaceRoot,
		sourceBindings,
		part.promptPath,
		part.promptSha256,
		`${shardId} ${part.partId} prompt`
	);
	const sanitizedPrompt = trackedArtifacts.find(
		(artifact) =>
			artifact.kind === 'content-prompt' &&
			artifact.sourceSha256 === part.promptSha256 &&
			artifact.externalDependencyId === promptRef.id
	);
	if (!sanitizedPrompt) {
		throw new Error(`${shardId} ${part.partId} has no sanitized prompt binding.`);
	}
	const ref = (sourcePath, expectedSha256, label) =>
		referenceFor(
			workspaceRoot,
			sourceBindings,
			sourcePath,
			expectedSha256,
			`${shardId} ${part.partId} ${label}`
		);
	return {
		partId: part.partId,
		index: part.index,
		start: part.start,
		end: part.end,
		rowIds: part.rowIds,
		inputSha256: part.inputSha256,
		responseSchemaSha256: part.responseSchemaSha256,
		promptSha256: part.promptSha256,
		promptRef,
		sanitizedPromptRef: artifactReference(sanitizedPrompt),
		requestSha256: part.requestSha256,
		requestRef: ref(part.requestPath, part.requestSha256, 'request'),
		eventLogSha256: part.eventLogSha256,
		eventLogRef: ref(part.eventLogPath, part.eventLogSha256, 'event log'),
		rawOutputSha256: part.rawOutputSha256,
		rawOutputRef: ref(part.rawOutputPath, part.rawOutputSha256, 'raw output'),
		rawCandidateSha256: part.rawCandidateSha256,
		thoughtsSha256: part.thoughtsSha256,
		thoughtsRef: ref(part.thoughtsPath, part.thoughtsSha256, 'thoughts'),
		resultMetadataSha256: part.resultMetadataSha256,
		resultMetadataRef: ref(part.resultMetadataPath, part.resultMetadataSha256, 'result metadata'),
		runSummarySha256: part.runSummarySha256,
		runSummaryRef: ref(part.runSummaryPath, part.runSummarySha256, 'run summary'),
		status: part.status,
		responseMode: part.responseMode ?? null,
		transportVersion: part.transportVersion ?? null,
		providerSchemaApplied: part.providerSchemaApplied ?? null,
		provider: part.provider,
		model: part.model,
		modelVersion: part.modelVersion,
		thinkingLevel: part.thinkingLevel,
		usage: part.usage,
		costUsd: part.costUsd
	};
}

function validateSourceHashIndex(index) {
	const issues = exactKeys(index, [
		'schemaVersion',
		'sourceSnapshotSha256',
		'sourceDocumentCount',
		'questionCount',
		'sourceDocuments',
		'questions'
	]);
	if (index.schemaVersion !== SCIENCE_CHALLENGE_SOURCE_HASH_INDEX_SCHEMA) {
		issues.push('source index schemaVersion is invalid.');
	}
	if (!sha256String(index.sourceSnapshotSha256)) issues.push('sourceSnapshotSha256 is invalid.');
	if (!Array.isArray(index.sourceDocuments)) issues.push('sourceDocuments must be an array.');
	if (!Array.isArray(index.questions)) issues.push('questions must be an array.');
	for (const document of index.sourceDocuments ?? []) {
		issues.push(...exactKeys(document, ['id', 'contentSha256']));
		if (!nonEmpty(document.id) || !sha256String(document.contentSha256)) {
			issues.push('source document hash row is invalid.');
		}
	}
	for (const question of index.questions ?? []) {
		issues.push(...exactKeys(question, ['id', 'sourceDocumentId', 'contentSha256']));
		if (
			!nonEmpty(question.id) ||
			!nonEmpty(question.sourceDocumentId) ||
			!sha256String(question.contentSha256)
		) {
			issues.push('source question hash row is invalid.');
		}
	}
	if (index.sourceDocumentCount !== (index.sourceDocuments?.length ?? -1)) {
		issues.push('sourceDocumentCount differs from sourceDocuments.');
	}
	if (index.questionCount !== (index.questions?.length ?? -1)) {
		issues.push('questionCount differs from questions.');
	}
	return issues;
}

function validateCurriculumHashIndex(index) {
	const issues = exactKeys(index, [
		'schemaVersion',
		'curriculumEvidenceSha256',
		'componentCount',
		'components'
	]);
	if (index.schemaVersion !== SCIENCE_CHALLENGE_CURRICULUM_HASH_INDEX_SCHEMA) {
		issues.push('curriculum index schemaVersion is invalid.');
	}
	if (!sha256String(index.curriculumEvidenceSha256)) {
		issues.push('curriculumEvidenceSha256 is invalid.');
	}
	if (!Array.isArray(index.components)) issues.push('components must be an array.');
	for (const component of index.components ?? []) {
		issues.push(
			...exactKeys(component, [
				'componentId',
				'specificationId',
				'specificationSha256',
				'contentSha256'
			])
		);
		if (
			!nonEmpty(component.componentId) ||
			!nonEmpty(component.specificationId) ||
			!sha256String(component.specificationSha256) ||
			!sha256String(component.contentSha256)
		) {
			issues.push('curriculum component hash row is invalid.');
		}
	}
	if (index.componentCount !== (index.components?.length ?? -1)) {
		issues.push('componentCount differs from components.');
	}
	return issues;
}

function validateAssignmentHashIndex(index) {
	const issues = exactKeys(index, [
		'schemaVersion',
		'planSha256',
		'sourceSnapshotSha256',
		'curriculumEvidenceSha256',
		'candidateSetSha256',
		'assignmentIndexSha256',
		'dispatchLedgerSha256',
		'assignmentCount',
		'assignments'
	]);
	if (index.schemaVersion !== SCIENCE_CHALLENGE_ASSIGNMENT_HASH_INDEX_SCHEMA) {
		issues.push('assignment index schemaVersion is invalid.');
	}
	for (const field of [
		'planSha256',
		'sourceSnapshotSha256',
		'curriculumEvidenceSha256',
		'candidateSetSha256',
		'assignmentIndexSha256',
		'dispatchLedgerSha256'
	]) {
		if (!sha256String(index[field])) issues.push(`${field} is invalid.`);
	}
	if (!Array.isArray(index.assignments)) issues.push('assignments must be an array.');
	for (const assignment of index.assignments ?? []) {
		issues.push(
			...exactKeys(assignment, [
				'assignmentId',
				'assignmentSha256',
				'challengeIdsSha256',
				'challengeCount',
				'dispatchSha256',
				'taskNameSha256'
			])
		);
		if (
			!nonEmpty(assignment.assignmentId) ||
			!sha256String(assignment.assignmentSha256) ||
			!sha256String(assignment.challengeIdsSha256) ||
			!Number.isInteger(assignment.challengeCount) ||
			assignment.challengeCount < 1 ||
			!nullableSha256(assignment.dispatchSha256) ||
			!nullableSha256(assignment.taskNameSha256)
		) {
			issues.push('assignment hash row is invalid.');
		}
	}
	if (index.assignmentCount !== (index.assignments?.length ?? -1)) {
		issues.push('assignmentCount differs from assignments.');
	}
	return issues;
}

function validateExternalBindings(external, expectedBindings, archiveRoot, issues) {
	const source = external.filter((dependency) => dependency.kind === 'full-source-snapshot');
	if (source.length !== 1 || source[0].canonicalSha256 !== expectedBindings.sourceSnapshotSha256) {
		issues.push('External source snapshot does not bind the expected canonical hash.');
	}
	const curriculum = external.filter(
		(dependency) => dependency.kind === 'full-curriculum-evidence'
	);
	if (
		curriculum.length !== 1 ||
		curriculum[0].canonicalSha256 !== expectedBindings.curriculumEvidenceSha256
	) {
		issues.push('External curriculum evidence does not bind the expected canonical hash.');
	}
	const catalog = external.filter((dependency) => dependency.kind === 'full-curriculum-catalog');
	if (
		catalog.length !== 1 ||
		catalog[0].canonicalSha256 !== expectedBindings.curriculumCatalogSha256
	) {
		issues.push('External curriculum catalog does not bind the expected canonical hash.');
	}
	const assignmentIndexPath = path.join(archiveRoot, 'indices/assignment-hashes.json');
	if (!existsSync(assignmentIndexPath)) return;
	const assignmentIndex = readJson(assignmentIndexPath);
	if (assignmentIndex.dispatchLedgerSha256 !== expectedBindings.verifierDispatchLedgerSha256) {
		issues.push('Assignment hash index does not bind the expected verifier dispatch ledger.');
	}
	const externalAssignments = new Map(
		external
			.filter((dependency) => dependency.kind === 'full-verification-assignment')
			.map((dependency) => [dependency.id.replace(/^assignment-/, ''), dependency])
	);
	for (const assignment of assignmentIndex.assignments ?? []) {
		const dependency = externalAssignments.get(assignment.assignmentId);
		if (!dependency || dependency.canonicalSha256 !== assignment.assignmentSha256) {
			issues.push(
				`External assignment ${assignment.assignmentId} does not bind its sanitized index hash.`
			);
		}
	}
}

function validateTrackedCanonicalBinding(tracked, archivePath, expected, label, issues) {
	const artifact = tracked.find((entry) => entry.path === archivePath);
	if (!artifact || artifact.canonicalSha256 !== expected) {
		issues.push(`Tracked ${label} does not bind the expected canonical hash.`);
	}
}

function validateReviewPayloadBindings(archiveRoot, tracked, external, issues) {
	const contentSummaryPath = path.join(archiveRoot, 'reviews/content/summary.json');
	if (existsSync(contentSummaryPath)) {
		const summary = readJson(contentSummaryPath);
		for (const result of summary.assignmentResults ?? []) {
			const resultPath = path.join(
				archiveRoot,
				'reviews/content/results',
				`${safeFilename(result.assignmentId)}.json`
			);
			if (!existsSync(resultPath) || canonicalHash(readJson(resultPath)) !== result.sha256) {
				issues.push(`Content review result ${result.assignmentId} differs from its summary hash.`);
			}
		}
	}
	const artSummaryPath = path.join(archiveRoot, 'reviews/art/summary.json');
	if (!existsSync(artSummaryPath)) return;
	const summary = readJson(artSummaryPath);
	for (const batch of summary.batches ?? []) {
		const batchRoot = path.join(archiveRoot, 'reviews/art/batches', safeFilename(batch.batchId));
		for (const [name, expected, canonical] of [
			['review-input.json', batch.inputFileSha256, false],
			['review-request.json', batch.requestSha256, true],
			['result.json', batch.resultSha256, true],
			['run-summary.json', batch.runSummarySha256, true],
			['last-message.json', batch.lastMessageSha256, false],
			['prompt.txt', batch.promptSha256, false]
		]) {
			const filePath = path.join(batchRoot, name);
			if (!existsSync(filePath)) {
				issues.push(`Art review batch ${batch.batchId} is missing ${name}.`);
				continue;
			}
			const actual = canonical ? canonicalHash(readJson(filePath)) : sha256(readFileSync(filePath));
			if (expected && actual !== expected) {
				issues.push(`Art review batch ${batch.batchId} ${name} differs from its summary hash.`);
			}
		}
		const eventDependency = external.find(
			(dependency) =>
				dependency.kind === 'codex-event-log' && dependency.id === `art-review-${batch.batchId}`
		);
		if (!eventDependency || eventDependency.sha256 !== batch.eventLogSha256) {
			issues.push(`Art review batch ${batch.batchId} event log differs from its summary hash.`);
		}
		const policyPath = path.join(batchRoot, 'run-policy.json');
		const policyArchivePath = path.relative(archiveRoot, policyPath).split(path.sep).join('/');
		const policyArtifact = tracked.find((artifact) => artifact.path === policyArchivePath);
		if (!existsSync(policyPath) || policyArtifact?.kind !== 'art-review-run-policy-attestation') {
			issues.push(`Art review batch ${batch.batchId} is missing its run policy attestation.`);
			continue;
		}
		const runSummaryPath = path.join(batchRoot, 'run-summary.json');
		const lastMessagePath = path.join(batchRoot, 'last-message.json');
		if (!existsSync(runSummaryPath) || !existsSync(lastMessagePath)) continue;
		const policyValidation = validateScienceChallengeModelRunPolicyAttestation({
			attestation: readJson(policyPath),
			summary: readJson(runSummaryPath),
			expectedModel: 'gpt-5.6-sol',
			expectedThinkingLevel: 'max',
			eventLogSha256: eventDependency?.sha256,
			eventCount: eventDependency?.eventCount,
			lastMessageSha256: sha256(readFileSync(lastMessagePath))
		});
		issues.push(
			...policyValidation.issues.map(
				(issue) => `Art review batch ${batch.batchId} run policy: ${issue}`
			)
		);
	}
}

function validateArchivedVerificationRepairPredecessorEvidence({ archiveRoot, tracked, issues }) {
	const recoveryArtifact = tracked.find(
		(artifact) => artifact?.path === 'content/verification-repair-recovery.json'
	);
	const indexArtifact = tracked.find(
		(artifact) => artifact?.path === 'content/verification-repair-predecessors.json'
	);
	const predecessorArtifacts = tracked.filter(
		(artifact) =>
			artifact?.kind === 'content-repair-predecessor-evidence' ||
			String(artifact?.path ?? '').startsWith('content/recovery-predecessors/')
	);
	if (!recoveryArtifact) {
		if (indexArtifact || predecessorArtifacts.length > 0) {
			issues.push('Predecessor evidence is archived without a recovery manifest.');
		}
		return;
	}
	try {
		const recoveryManifest = readJson(
			path.join(archiveRoot, 'content/verification-repair-recovery.json')
		);
		const expectedIndex = verificationRepairPredecessorArchiveIndex(recoveryManifest);
		if (recoveryArtifact.canonicalSha256 !== canonicalHash(recoveryManifest)) {
			throw new Error('Archived recovery manifest canonical hash is invalid.');
		}
		if (
			!indexArtifact ||
			indexArtifact.kind !== 'content-repair-predecessor-index' ||
			indexArtifact.canonicalSha256 !== canonicalHash(expectedIndex)
		) {
			throw new Error(
				'Archived verification-repair predecessor index does not bind the recovery manifest.'
			);
		}
		const archivedIndex = readJson(
			path.join(archiveRoot, 'content/verification-repair-predecessors.json')
		);
		if (canonicalHash(archivedIndex) !== canonicalHash(expectedIndex)) {
			throw new Error(
				'Archived verification-repair predecessor index differs from its manifest inventory.'
			);
		}
		const expectedFiles = expectedIndex.roots.flatMap((root) => root.files);
		for (const file of expectedFiles) {
			const artifact = tracked.find((candidate) => candidate?.path === file.archivePath);
			if (
				!artifact ||
				artifact.kind !== 'content-repair-predecessor-evidence' ||
				artifact.sha256 !== file.sha256 ||
				artifact.bytes !== file.bytes
			) {
				throw new Error(
					`Archived verification-repair predecessor evidence ${file.archivePath} differs from the recovery manifest.`
				);
			}
		}
		const expectedPaths = new Set(expectedFiles.map((file) => file.archivePath));
		for (const artifact of predecessorArtifacts) {
			if (!expectedPaths.has(artifact.path)) {
				throw new Error(
					`Unexpected verification-repair predecessor evidence is archived at ${artifact.path}.`
				);
			}
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
}

function validateArchivedMultipartPlanSalvageEvidence({
	archiveRoot,
	sourceLineage,
	tracked,
	external,
	issues
}) {
	let sanitizedLineage;
	try {
		sanitizedLineage = readJson(path.join(archiveRoot, 'lineage.json'));
	} catch {
		return;
	}
	const sourceShards = Array.isArray(sourceLineage?.content) ? sourceLineage.content : [];
	const sanitizedShards = Array.isArray(sanitizedLineage?.content) ? sanitizedLineage.content : [];
	const sourceSalvages = sourceShards.filter((shard) => shard?.salvage);
	const archivedSalvageArtifacts = tracked.filter(
		(artifact) =>
			String(artifact?.kind ?? '').startsWith('content-multipart-plan-salvage-') ||
			/(^|\/)multipart-plan-salvage\//.test(String(artifact?.path ?? ''))
	);
	if (sourceSalvages.length === 0) {
		if (archivedSalvageArtifacts.length > 0) {
			issues.push('Multipart plan-drift salvage evidence is archived without source lineage.');
		}
		for (const shard of sanitizedShards) {
			if (shard?.salvage) {
				issues.push(`${shard.shardId} sanitized salvage has no source lineage.`);
			}
		}
		return;
	}

	for (const sourceShard of sourceShards) {
		const sanitizedShard = sanitizedShards.find(
			(candidate) => candidate?.shardId === sourceShard?.shardId
		);
		if (!sourceShard?.salvage) {
			if (sanitizedShard?.salvage) {
				issues.push(`${sourceShard?.shardId} sanitized salvage has no source lineage.`);
			}
			continue;
		}
		if (!sanitizedShard?.salvage) {
			issues.push(`${sourceShard.shardId} archived salvage is omitted from sanitized lineage.`);
			continue;
		}
		try {
			validateOneArchivedMultipartPlanSalvage({
				archiveRoot,
				sourceShard,
				sanitizedShard,
				tracked,
				external
			});
		} catch (error) {
			issues.push(error instanceof Error ? error.message : String(error));
		}
	}
}

function validateArchivedMultipartContinuationEvidence({
	archiveRoot,
	sourceLineage,
	tracked,
	external,
	issues
}) {
	let sanitizedLineage;
	try {
		sanitizedLineage = readJson(path.join(archiveRoot, 'lineage.json'));
	} catch {
		return;
	}
	const sourceShards = Array.isArray(sourceLineage?.content) ? sourceLineage.content : [];
	const sanitizedShards = Array.isArray(sanitizedLineage?.content) ? sanitizedLineage.content : [];
	const sourceContinuations = sourceShards.filter((shard) => shard?.continuation);
	const archived = tracked.filter(
		(artifact) =>
			String(artifact?.kind ?? '').startsWith('content-multipart-continuation-') ||
			/(^|\/)multipart-continuation\//.test(String(artifact?.path ?? ''))
	);
	if (sourceContinuations.length === 0) {
		if (archived.length > 0) {
			issues.push('Multipart continuation evidence is archived without source lineage.');
		}
		for (const shard of sanitizedShards) {
			if (shard?.continuation) {
				issues.push(`${shard.shardId} sanitized continuation has no source lineage.`);
			}
		}
		return;
	}
	for (const sourceShard of sourceShards) {
		const sanitizedShard = sanitizedShards.find(
			(candidate) => candidate?.shardId === sourceShard?.shardId
		);
		if (!sourceShard?.continuation) {
			if (sanitizedShard?.continuation) {
				issues.push(`${sourceShard?.shardId} sanitized continuation has no source lineage.`);
			}
			continue;
		}
		if (!sanitizedShard?.continuation) {
			issues.push(
				`${sourceShard.shardId} archived continuation is omitted from sanitized lineage.`
			);
			continue;
		}
		try {
			const shardId = safeFilename(sourceShard.shardId);
			const source = sourceShard.continuation;
			const sanitized = sanitizedShard.continuation;
			const root = `content/shards/${shardId}/multipart-continuation`;
			const readTracked = (
				relative,
				kind,
				expectedCanonicalSha256,
				label,
				expectedByteSha256 = null
			) =>
				archivedTrackedJson({
					archiveRoot,
					tracked,
					path: `${root}/${relative}`,
					kind,
					expectedCanonicalSha256,
					expectedByteSha256,
					label
				});
			const manifest = readTracked(
				'manifest.json',
				'content-multipart-continuation-manifest',
				source.manifestSha256,
				`${shardId} multipart continuation manifest`
			);
			const continuationPlan = readTracked(
				'plan.json',
				'content-multipart-continuation-plan',
				source.planSha256,
				`${shardId} multipart continuation plan`
			);
			const candidate = readTracked(
				'candidate.json',
				'content-multipart-continuation-candidate',
				source.candidateSha256,
				`${shardId} multipart continuation candidate`
			);
			const validation = readTracked(
				'validation.json',
				'content-multipart-continuation-validation',
				source.validationSha256,
				`${shardId} multipart continuation validation`
			);
			if (
				validation.collectionValidationSha256 !== canonicalHash(manifest.collectionValidation) ||
				validation.priorCollectionFailureSha256 !==
					(manifest.priorCollectionFailure ? canonicalHash(manifest.priorCollectionFailure) : null)
			) {
				throw new Error(
					`${shardId} archived multipart continuation collection bindings are invalid.`
				);
			}
			if (source.collectionValidationSnapshot) {
				const snapshot = readTracked(
					'collection-validation.json',
					'content-multipart-continuation-collection-snapshot',
					source.collectionValidationSnapshot.canonicalSha256,
					`${shardId} multipart continuation collection snapshot`,
					source.collectionValidationSnapshot.byteSha256
				);
				if (
					sanitized.collectionValidationSnapshot?.canonicalSha256 !==
						source.collectionValidationSnapshot.canonicalSha256 ||
					sanitized.collectionValidationSnapshot?.byteSha256 !==
						source.collectionValidationSnapshot.byteSha256 ||
					snapshot.candidateSha256 !== source.candidateSha256 ||
					snapshot.claimSetSha256 !==
						canonicalHash(source.execution.claims.map((claim) => claim.sha256)) ||
					canonicalHash(snapshot.collectionValidation) !==
						canonicalHash(manifest.collectionValidation)
				) {
					throw new Error(
						`${shardId} archived multipart continuation collection snapshot is invalid.`
					);
				}
			} else if (sanitized.collectionValidationSnapshot !== null) {
				throw new Error(`${shardId} sanitized continuation invents a collection snapshot.`);
			}
			if (source.priorCollectionFailureEvidence) {
				const failure = readTracked(
					'failure.json',
					'content-multipart-continuation-prior-collection-failure',
					source.priorCollectionFailureEvidence.canonicalSha256,
					`${shardId} multipart continuation prior collection failure`,
					source.priorCollectionFailureEvidence.byteSha256
				);
				if (
					sanitized.priorCollectionFailureEvidence?.canonicalSha256 !==
						source.priorCollectionFailureEvidence.canonicalSha256 ||
					sanitized.priorCollectionFailureEvidence?.byteSha256 !==
						source.priorCollectionFailureEvidence.byteSha256 ||
					manifest.priorCollectionFailure === null ||
					canonicalHash(failure) !== canonicalHash(manifest.priorCollectionFailure)
				) {
					throw new Error(`${shardId} archived multipart continuation prior failure is invalid.`);
				}
			} else if (sanitized.priorCollectionFailureEvidence !== null) {
				throw new Error(`${shardId} sanitized continuation invents prior failure evidence.`);
			}
			const missingCount =
				continuationPlan.expectedPartCount - continuationPlan.sourceAttemptedPartCount;
			if (
				source.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_SCHEMA ||
				sanitized.schemaVersion !== source.schemaVersion ||
				manifest.schemaVersion !== source.schemaVersion ||
				continuationPlan.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_PLAN_SCHEMA ||
				validation.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_VALIDATION_SCHEMA ||
				validation.authoringDisposition !== 'exhausted-multipart-part-continuation' ||
				validation.sourceAttempt !== VERIFICATION_REPAIR_MAX_ATTEMPTS ||
				validation.sourceAttemptStatus !== 'failed' ||
				source.sourceAttempt?.attempt !== VERIFICATION_REPAIR_MAX_ATTEMPTS ||
				source.sourceAttempt?.status !== 'failed' ||
				!Number.isInteger(missingCount) ||
				missingCount < 1 ||
				source.continuationParts?.length !== missingCount ||
				source.execution?.claims?.length !== missingCount ||
				manifest.continuationParts?.length !== missingCount ||
				canonicalHash(candidate) !== manifest.candidateSha256 ||
				canonicalHash(validation) !== manifest.validationSha256 ||
				canonicalHash(continuationPlan) !== manifest.planSha256 ||
				canonicalHash(manifest.continuationParts) !== manifest.continuationPartsSha256
			) {
				throw new Error(`${shardId} archived multipart continuation envelope is invalid.`);
			}
			for (const [index, part] of source.continuationParts.entries()) {
				const expectedPart =
					continuationPlan.parts[continuationPlan.sourceAttemptedPartCount + index];
				const binding = manifest.continuationParts[index];
				const claim = source.execution.claims[index];
				if (
					part.partId !== expectedPart?.partId ||
					binding?.partId !== part.partId ||
					claim?.partId !== part.partId ||
					canonicalHash(binding) !== part.evidenceSha256 ||
					binding.claimSha256 !== part.claimSha256 ||
					claim.sha256 !== part.claimSha256
				) {
					throw new Error(
						`${shardId} archived multipart continuation part ${index + 1} is reordered or unbound.`
					);
				}
				for (const [relative, kind, expected, expectedBytes] of [
					[
						`execution/claims/${part.partId}.json`,
						'content-multipart-continuation-claim',
						part.claimSha256,
						claim.byteSha256
					],
					[
						`execution/invocations/${part.partId}.json`,
						'content-multipart-continuation-invocation',
						claim.invocationSha256,
						claim.invocationByteSha256
					],
					[
						`parts/${part.partId}/last-message.json`,
						'content-part-final-message',
						binding.rawCandidateSha256,
						binding.lastMessage.byteSha256
					],
					[
						`parts/${part.partId}/result-metadata.json`,
						'content-part-run-result-metadata',
						binding.resultMetadata.canonicalSha256,
						binding.resultMetadata.byteSha256
					],
					[
						`parts/${part.partId}/run-summary.json`,
						'content-part-run-summary',
						binding.runSummary.canonicalSha256,
						binding.runSummary.byteSha256
					]
				]) {
					readTracked(
						relative,
						kind,
						expected,
						`${shardId} multipart continuation ${part.partId} ${relative}`,
						expectedBytes
					);
				}
				const requiredExternalHashes = [
					binding.prompt.byteSha256,
					binding.request.byteSha256,
					binding.eventLog.byteSha256,
					binding.thoughts.byteSha256
				];
				if (
					requiredExternalHashes.some(
						(expectedSha256) => !external.some((dependency) => dependency.sha256 === expectedSha256)
					)
				) {
					throw new Error(
						`${shardId} multipart continuation ${part.partId} omits raw external evidence.`
					);
				}
			}
		} catch (error) {
			issues.push(error instanceof Error ? error.message : String(error));
		}
	}
}

function validateArchivedReviewRebaseSuccessorParentChain({
	archiveRoot,
	sourceLineage,
	tracked,
	external,
	expectedBindings,
	reviewRebaseValidators,
	issues
}) {
	const parentChainBound = sha256String(expectedBindings.contentParentLineageSha256);
	const sourceParentChain = sourceLineage?.effectiveCohort?.parentChain ?? null;
	const archivedParentArtifacts = tracked.filter(
		(artifact) =>
			String(artifact?.kind ?? '').startsWith('content-parent-chain-') ||
			String(artifact?.path ?? '').startsWith('content/parent-chain/')
	);
	if (!parentChainBound) {
		if (sourceParentChain !== null || archivedParentArtifacts.length > 0) {
			issues.push('Content parent-chain provenance is present without its release binding.');
		}
		return;
	}
	try {
		validateReviewRebaseSuccessorParentChainShape(sourceParentChain);
		if (canonicalHash(sourceParentChain) !== expectedBindings.contentParentLineageSha256) {
			throw new Error('Source review-rebase parentChain differs from its release binding.');
		}
		const index = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'content/parent-chain/index.json',
			kind: 'content-parent-chain-index',
			expectedCanonicalSha256: tracked.find(
				(artifact) => artifact?.path === 'content/parent-chain/index.json'
			)?.canonicalSha256,
			label: 'content parent-chain index'
		});
		const expectedIndexFields = [
			'artifactCount',
			'artifactRefs',
			'contentParentLineageSha256',
			'contentVerificationRef',
			'effectiveCohortIndexRef',
			'effectiveCohortManifestRef',
			'existingDefinitionsRef',
			'firstVerificationRef',
			'parentChain',
			'parentRepairRef',
			'parentVerificationRef',
			'referenceRoot',
			'reviewRebaseManifestRef',
			'schemaVersion'
		].sort();
		if (
			Object.keys(index).sort().join('\n') !== expectedIndexFields.join('\n') ||
			index.schemaVersion !== CONTENT_PARENT_CHAIN_INDEX_SCHEMA ||
			index.referenceRoot !== CONTENT_PARENT_CHAIN_REFERENCE_ROOT ||
			index.contentParentLineageSha256 !== expectedBindings.contentParentLineageSha256 ||
			canonicalHash(index.parentChain) !== expectedBindings.contentParentLineageSha256 ||
			canonicalHash(index.parentChain) !== canonicalHash(sourceParentChain)
		) {
			throw new Error('Content parent-chain index is stale or not closed-world.');
		}
		for (const reference of [
			index.reviewRebaseManifestRef,
			index.existingDefinitionsRef,
			index.parentVerificationRef,
			index.parentRepairRef,
			index.firstVerificationRef,
			index.effectiveCohortManifestRef,
			index.effectiveCohortIndexRef,
			index.contentVerificationRef,
			...(index.artifactRefs ?? [])
		]) {
			validateLineageReference(reference, tracked, external, issues);
		}
		const b0Manifest = archivedTrackedJsonReference({
			archiveRoot,
			tracked,
			external,
			reference: index.reviewRebaseManifestRef,
			expectedCanonicalSha256: sourceParentChain.reviewRebaseManifestSha256,
			label: 'B0 review-rebase manifest'
		});
		const existingDefinitions = archivedTrackedJsonReference({
			archiveRoot,
			tracked,
			external,
			reference: index.existingDefinitionsRef,
			expectedCanonicalSha256: b0Manifest.evidence?.inputs?.existingDefinitions?.canonicalSha256,
			label: 'B0 existing definitions'
		});
		if (b0Manifest.evidence?.inputs?.existingDefinitions?.count !== existingDefinitions.length) {
			throw new Error('B0 existing definitions count differs from its evidence binding.');
		}
		const repositoryRoot = path.join(archiveRoot, index.referenceRoot);
		const manifestPath = repositoryRelativeReferencePath(
			index.referenceRoot,
			index.reviewRebaseManifestRef,
			'B0 manifest'
		);
		const reviewRebaseReplay = readScienceChallengeReviewRebaseEvidence({
			repositoryRoot,
			manifestPath,
			existingDefinitions,
			...reviewRebaseValidatorOptions(reviewRebaseValidators)
		});
		if (
			reviewRebaseReplay.status !== 'passed' ||
			canonicalHash(reviewRebaseReplay.manifest) !== sourceParentChain.reviewRebaseManifestSha256
		) {
			throw new Error(
				`Archived B0 review-rebase replay failed: ${(reviewRebaseReplay.issues ?? []).join(' ')}`
			);
		}
		const parentVerification = archivedTrackedJsonReference({
			archiveRoot,
			tracked,
			external,
			reference: index.parentVerificationRef,
			expectedCanonicalSha256: sourceParentChain.parentVerificationSha256,
			label: 'V0 parent verification'
		});
		const parentRepair = archivedTrackedJsonReference({
			archiveRoot,
			tracked,
			external,
			reference: index.parentRepairRef,
			expectedCanonicalSha256: sourceParentChain.parentRepairSha256,
			label: 'R0 parent repair'
		});
		if (
			canonicalHash(parentVerification) !==
				reviewRebaseReplay.coreManifest.parent.verificationSha256 ||
			canonicalHash(parentRepair) !== reviewRebaseReplay.coreManifest.parent.repairSha256
		) {
			throw new Error('B0 replay points at another V0 or R0 parent.');
		}
		const basePlan = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'plans/base-plan.json',
			kind: 'base-plan',
			expectedCanonicalSha256: expectedBindings.basePlanSha256,
			label: 'base plan'
		});
		const effectivePlan = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'plans/effective-plan.json',
			kind: 'effective-plan',
			expectedCanonicalSha256: expectedBindings.effectivePlanSha256,
			label: 'effective plan'
		});
		const effectiveCohortIndex = archivedTrackedJsonReference({
			archiveRoot,
			tracked,
			external,
			reference: index.effectiveCohortIndexRef,
			expectedCanonicalSha256: index.effectiveCohortIndexRef?.canonicalSha256,
			label: 'S1 effective-cohort index'
		});
		if (
			effectiveCohortIndex.schemaVersion !==
				'science-challenge-effective-cohort-provenance-index/v1' ||
			effectiveCohortIndex.referenceRoot !== 'content/effective-cohort' ||
			effectiveCohortIndex.manifestSha256 !== expectedBindings.effectiveCohortManifestSha256 ||
			effectiveCohortIndex.basePlanSha256 !== expectedBindings.basePlanSha256 ||
			effectiveCohortIndex.effectivePlanSha256 !== expectedBindings.effectivePlanSha256 ||
			effectiveCohortIndex.candidateSetSha256 !==
				expectedBindings.effectiveCohortCandidateSetSha256 ||
			effectiveCohortIndex.recoverySetSha256 !== expectedBindings.recoverySetSha256 ||
			effectiveCohortIndex.durableReceiptRef !== null ||
			effectiveCohortIndex.durableReceiptSha256 !== null
		) {
			throw new Error('S1 effective-cohort index is invalid for review-rebase ancestry.');
		}
		const effectiveReferenceRoot = path.join(archiveRoot, effectiveCohortIndex.referenceRoot);
		let infrastructureRecoveryArchiveClosure = null;
		const infrastructureRecoveryBinding =
			sourceLineage?.effectiveCohort?.infrastructureRecovery ?? null;
		if (infrastructureRecoveryBinding) {
			validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(
				infrastructureRecoveryBinding
			);
			infrastructureRecoveryArchiveClosure = archivedTrackedJson({
				archiveRoot,
				tracked,
				path: INFRASTRUCTURE_RECOVERY_CLOSURE_PATH,
				kind: 'content-infrastructure-recovery-closure',
				expectedCanonicalSha256: tracked.find(
					(artifact) => artifact?.path === INFRASTRUCTURE_RECOVERY_CLOSURE_PATH
				)?.canonicalSha256,
				label: 'infrastructure-recovery terminal closure'
			});
		}
		const effectiveReplay = readScienceChallengeEffectiveCohort({
			manifestPath: path.join(effectiveReferenceRoot, effectiveCohortIndex.manifestPath),
			referenceRoot: effectiveReferenceRoot,
			basePlan,
			effectivePlan,
			expectedRepairSha256: sourceParentChain.firstVerificationSha256,
			expectedObjectiveId: sourceParentChain.successorObjectiveId,
			expectedExecutionId: sourceParentChain.successorExecutionId,
			expectedFirstReviewSha256: sourceParentChain.firstVerificationSha256,
			expectedSourceSnapshotSha256: expectedBindings.sourceSnapshotSha256,
			expectedCurriculumEvidenceSha256: expectedBindings.curriculumEvidenceSha256,
			expectedCurriculumCatalogSha256: expectedBindings.curriculumCatalogSha256,
			reviewRebaseEvidence: reviewRebaseReplay,
			reviewRebaseInfrastructureRecoveryArchiveClosure: infrastructureRecoveryArchiveClosure
		});
		if (
			effectiveReplay.status !== 'passed' ||
			canonicalHash(effectiveReplay.manifest) !== expectedBindings.effectiveCohortManifestSha256 ||
			effectiveReplay.candidateSetSha256 !== expectedBindings.effectiveCohortCandidateSetSha256
		) {
			throw new Error(
				`Archived S1 effective-cohort replay failed: ${(effectiveReplay.issues ?? []).join(' ')}`
			);
		}
		const expectedEffectiveArtifactPaths = effectiveCohortArtifactReferencePaths(effectiveReplay)
			.sort()
			.map((relativePath) => `content/effective-cohort/${relativePath}`);
		const indexedEffectiveArtifactPaths = (effectiveCohortIndex.artifactRefs ?? [])
			.map((reference) => reference?.path)
			.sort();
		if (
			effectiveCohortIndex.artifactCount !== expectedEffectiveArtifactPaths.length ||
			indexedEffectiveArtifactPaths.join('\n') !== expectedEffectiveArtifactPaths.join('\n') ||
			(effectiveCohortIndex.artifactRefs ?? []).some(
				(reference) => reference?.kind !== 'effective-cohort-artifact'
			)
		) {
			throw new Error('Archived S1 artifact references are not exact and closed-world.');
		}
		const firstVerification = archivedTrackedJsonReference({
			archiveRoot,
			tracked,
			external,
			reference: index.firstVerificationRef,
			expectedCanonicalSha256: sourceParentChain.firstVerificationSha256,
			label: 'V1 first verification'
		});
		const contentVerification = archivedTrackedJsonReference({
			archiveRoot,
			tracked,
			external,
			reference: index.contentVerificationRef,
			expectedCanonicalSha256: expectedBindings.contentVerificationSha256,
			label: 'V2 content verification'
		});
		const mutableTargetIds = reviewRebaseMutableTargetIds({
			firstVerification,
			collectionRemediationTargetIds: reviewRebaseCollectionRemediationTargetIds(
				reviewRebaseReplay.manifest
			)
		});
		validateReviewRebaseSuccessorChainLinks({
			parentChain: sourceParentChain,
			reviewRebase: reviewRebaseReplay,
			reviewRebaseInfrastructureRecoveryArchiveClosure: infrastructureRecoveryArchiveClosure,
			firstVerification,
			mutableTargetIds,
			effectiveCohort: effectiveReplay,
			contentReview: contentVerification
		});
		const expectedArtifactRecords = [
			...reviewRebaseFilesystemBindings(b0Manifest).map(({ role, binding }) =>
				trackedRecordAt(
					tracked,
					`${index.referenceRoot}/${normalizedRepositoryRelativePath(binding.path, `B0 ${role}`)}`,
					`B0 ${role}`
				)
			),
			trackedRecordAt(tracked, index.reviewRebaseManifestRef.path, 'B0 manifest'),
			trackedRecordAt(tracked, index.existingDefinitionsRef.path, 'B0 existing definitions'),
			trackedRecordAt(tracked, effectiveCohortIndex.manifestRef.path, 'S1 manifest'),
			...(effectiveCohortIndex.artifactRefs ?? []).map((reference) =>
				trackedRecordAt(tracked, reference.path, 'S1 artifact')
			),
			trackedRecordAt(tracked, index.effectiveCohortIndexRef.path, 'S1 effective-cohort index'),
			trackedRecordAt(tracked, index.contentVerificationRef.path, 'V2 content verification')
		];
		const expectedArtifactRefs = uniqueTrackedRecords(expectedArtifactRecords)
			.map(artifactReference)
			.sort(compareArtifactReferences);
		const indexedArtifactRefs = [...(index.artifactRefs ?? [])].sort(compareArtifactReferences);
		if (
			index.artifactCount !== expectedArtifactRefs.length ||
			canonicalHash(indexedArtifactRefs) !== canonicalHash(expectedArtifactRefs)
		) {
			throw new Error('Content parent-chain artifact inventory is not exact and closed-world.');
		}
		for (const [field, expectedReference] of [
			[
				'reviewRebaseManifestRef',
				artifactReference(
					trackedRecordAt(tracked, index.reviewRebaseManifestRef.path, 'B0 manifest')
				)
			],
			[
				'existingDefinitionsRef',
				artifactReference(
					trackedRecordAt(tracked, index.existingDefinitionsRef.path, 'B0 existing definitions')
				)
			],
			[
				'parentVerificationRef',
				artifactReference(
					trackedRecordAt(
						tracked,
						`${index.referenceRoot}/${b0Manifest.evidence.inputs.parentVerification.path}`,
						'V0 parent verification'
					)
				)
			],
			[
				'parentRepairRef',
				artifactReference(
					trackedRecordAt(
						tracked,
						`${index.referenceRoot}/${b0Manifest.evidence.inputs.parentRepair.path}`,
						'R0 parent repair'
					)
				)
			],
			[
				'firstVerificationRef',
				artifactReference(
					trackedRecordAt(
						tracked,
						`content/effective-cohort/${effectiveReplay.manifest.review.summary.path}`,
						'V1 first verification'
					)
				)
			],
			['effectiveCohortManifestRef', effectiveCohortIndex.manifestRef],
			[
				'effectiveCohortIndexRef',
				artifactReference(
					trackedRecordAt(
						tracked,
						'content/effective-cohort-index.json',
						'S1 effective-cohort index'
					)
				)
			],
			[
				'contentVerificationRef',
				artifactReference(
					trackedRecordAt(tracked, 'reviews/content/summary.json', 'V2 content verification')
				)
			]
		]) {
			if (canonicalHash(index[field]) !== canonicalHash(expectedReference)) {
				throw new Error(`Content parent-chain ${field} is stale.`);
			}
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
}

function validateArchivedDescendantRemapEvidence({
	archiveRoot,
	sourceLineage,
	tracked,
	external,
	expectedBindings,
	issues
}) {
	const remapBound = sha256String(expectedBindings.curriculumRemapVerifierInputSha256);
	const sourceRemaps = (sourceLineage?.content ?? []).filter((shard) => shard?.descendantRemap);
	const archivedRemapArtifacts = tracked.filter(
		(artifact) =>
			String(artifact?.kind ?? '').includes('descendant-remap') ||
			/(^|\/)descendant-remap(?:-index)?(?:\/|\.json)/.test(String(artifact?.path ?? ''))
	);
	if (!remapBound) {
		if (
			sourceRemaps.length > 0 ||
			archivedRemapArtifacts.length > 0 ||
			expectedBindings.descendantRemapManifestSetSha256 !== null ||
			expectedBindings.curriculumRemapDecisionSetSha256 !== null
		) {
			issues.push('Descendant-remap provenance is present without complete release bindings.');
		}
		return;
	}
	try {
		if (
			!sha256String(expectedBindings.descendantRemapManifestSetSha256) ||
			!sha256String(expectedBindings.curriculumRemapDecisionSetSha256) ||
			sourceRemaps.length === 0
		) {
			throw new Error('Descendant-remap release bindings or source lineage are incomplete.');
		}
		const durableReceipt = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'content/curriculum-remap/durable-receipt.json',
			kind: 'curriculum-remap-durable-receipt',
			expectedCanonicalSha256: expectedBindings.curriculumRemapDurableReceiptSha256,
			label: 'curriculum remap durable receipt'
		});
		const basePlan = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'plans/base-plan.json',
			kind: 'base-plan',
			expectedCanonicalSha256: expectedBindings.basePlanSha256,
			label: 'base plan'
		});
		const effectivePlan = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'plans/effective-plan.json',
			kind: 'effective-plan',
			expectedCanonicalSha256: expectedBindings.effectivePlanSha256,
			label: 'effective plan'
		});
		const receiptValidation = validateScienceChallengeCurriculumRemapDurableReceipt(durableReceipt);
		if (
			receiptValidation.status !== 'passed' ||
			findScienceChallengeCurriculumRemapDurableLeaks(durableReceipt).length > 0 ||
			durableReceipt.basePlanSha256 !== canonicalHash(basePlan) ||
			durableReceipt.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
			durableReceipt.verifierInputSha256 !== expectedBindings.curriculumRemapVerifierInputSha256 ||
			durableReceipt.decisionSetSha256 !== expectedBindings.curriculumRemapDecisionSetSha256 ||
			durableReceipt.remapManifestSetSha256 !== expectedBindings.descendantRemapManifestSetSha256 ||
			durableReceipt.recoverySetSha256 !== expectedBindings.recoverySetSha256 ||
			durableReceipt.remaps.some((remap) => remap.decision?.accepted !== true)
		) {
			throw new Error('Archived curriculum remap durable receipt is invalid or stale.');
		}
		const effectiveCohortIndex = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'content/effective-cohort-index.json',
			kind: 'effective-cohort-index',
			expectedCanonicalSha256: tracked.find(
				(artifact) => artifact?.path === 'content/effective-cohort-index.json'
			)?.canonicalSha256,
			label: 'effective-cohort provenance index'
		});
		if (
			effectiveCohortIndex.schemaVersion !==
				'science-challenge-effective-cohort-provenance-index/v1' ||
			effectiveCohortIndex.referenceRoot !== 'content/effective-cohort' ||
			effectiveCohortIndex.manifestSha256 !== expectedBindings.effectiveCohortManifestSha256 ||
			effectiveCohortIndex.basePlanSha256 !== expectedBindings.basePlanSha256 ||
			effectiveCohortIndex.effectivePlanSha256 !== expectedBindings.effectivePlanSha256 ||
			effectiveCohortIndex.candidateSetSha256 !==
				expectedBindings.effectiveCohortCandidateSetSha256 ||
			effectiveCohortIndex.remapManifestSetSha256 !==
				expectedBindings.descendantRemapManifestSetSha256 ||
			effectiveCohortIndex.difficultyAdjustmentManifestSetSha256 !==
				(expectedBindings.difficultyAdjustmentManifestSetSha256 ?? canonicalHash([])) ||
			effectiveCohortIndex.recoverySetSha256 !== expectedBindings.recoverySetSha256 ||
			effectiveCohortIndex.durableReceiptSha256 !==
				expectedBindings.curriculumRemapDurableReceiptSha256
		) {
			throw new Error('Archived effective-cohort provenance index is invalid.');
		}
		validateLineageReference(effectiveCohortIndex.manifestRef, tracked, external, issues);
		validateLineageReference(effectiveCohortIndex.durableReceiptRef, tracked, external, issues);
		for (const reference of effectiveCohortIndex.artifactRefs ?? []) {
			validateLineageReference(reference, tracked, external, issues);
		}
		const effectiveReferenceRoot = path.join(archiveRoot, effectiveCohortIndex.referenceRoot);
		const effectiveReplay = readScienceChallengeEffectiveCohort({
			manifestPath: path.join(effectiveReferenceRoot, effectiveCohortIndex.manifestPath),
			referenceRoot: effectiveReferenceRoot,
			basePlan,
			effectivePlan,
			expectedSourceSnapshotSha256: expectedBindings.sourceSnapshotSha256,
			expectedCurriculumEvidenceSha256: expectedBindings.curriculumEvidenceSha256,
			expectedCurriculumCatalogSha256: expectedBindings.curriculumCatalogSha256
		});
		if (
			effectiveReplay.status !== 'passed' ||
			canonicalHash(effectiveReplay.manifest) !== expectedBindings.effectiveCohortManifestSha256 ||
			effectiveReplay.candidateSetSha256 !== expectedBindings.effectiveCohortCandidateSetSha256 ||
			effectiveReplay.candidateSetSha256 !== durableReceipt.candidateSetSha256 ||
			effectiveReplay.manifest.candidateCount !== durableReceipt.candidateCount
		) {
			throw new Error(
				`Archived effective-cohort replay failed: ${(effectiveReplay.issues ?? []).join(' ')}`
			);
		}
		const expectedEffectiveArtifactPaths = effectiveCohortArtifactReferencePaths(effectiveReplay)
			.sort()
			.map((relativePath) => `content/effective-cohort/${relativePath}`);
		const indexedEffectiveArtifactPaths = (effectiveCohortIndex.artifactRefs ?? [])
			.map((reference) => reference?.path)
			.sort();
		if (
			effectiveCohortIndex.artifactCount !== expectedEffectiveArtifactPaths.length ||
			indexedEffectiveArtifactPaths.join('\n') !== expectedEffectiveArtifactPaths.join('\n') ||
			(effectiveCohortIndex.artifactRefs ?? []).some(
				(reference) => reference?.kind !== 'effective-cohort-artifact'
			)
		) {
			throw new Error(
				'Archived effective-cohort artifact references are not exact and closed-world.'
			);
		}
		const index = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'content/descendant-remap-index.json',
			kind: 'content-descendant-remap-index',
			expectedCanonicalSha256: tracked.find(
				(artifact) => artifact?.path === 'content/descendant-remap-index.json'
			)?.canonicalSha256,
			label: 'descendant-remap provenance index'
		});
		if (
			index.schemaVersion !== 'science-challenge-descendant-remap-provenance-index/v1' ||
			index.basePlanSha256 !== expectedBindings.basePlanSha256 ||
			index.effectivePlanSha256 !== expectedBindings.effectivePlanSha256 ||
			index.curriculumRemapVerifierInputSha256 !==
				expectedBindings.curriculumRemapVerifierInputSha256 ||
			index.curriculumRemapDurableReceiptSha256 !==
				expectedBindings.curriculumRemapDurableReceiptSha256 ||
			index.proposalSetSha256 !== durableReceipt.proposalSetSha256 ||
			index.decisionSetSha256 !== durableReceipt.decisionSetSha256 ||
			index.effectiveCohortManifestSha256 !== expectedBindings.effectiveCohortManifestSha256 ||
			index.effectiveCohortCandidateSetSha256 !==
				expectedBindings.effectiveCohortCandidateSetSha256 ||
			index.effectiveCohortIndexSha256 !== canonicalHash(effectiveCohortIndex) ||
			index.manifestSetSha256 !== expectedBindings.descendantRemapManifestSetSha256 ||
			index.remapCount !== sourceRemaps.length ||
			!Array.isArray(index.remaps) ||
			index.remaps.length !== sourceRemaps.length
		) {
			throw new Error('Archived descendant-remap provenance index is invalid.');
		}
		validateLineageReference(index.durableReceiptRef, tracked, external, issues);
		const archivedManifests = [];
		for (const [remapIndex, remap] of index.remaps.entries()) {
			const sourceShard = sourceRemaps.find((shard) => shard.shardId === remap?.shardId);
			if (!sourceShard) {
				throw new Error(`Archived descendant remap ${remapIndex + 1} has no source shard.`);
			}
			const source = sourceShard.descendantRemap;
			const shardId = safeFilename(sourceShard.shardId);
			const root = `content/shards/${shardId}/descendant-remap`;
			if (
				source.schemaVersion !==
					'science-challenge-verifier-directed-descendant-remap-evidence/v1' ||
				source.disposition !== 'deterministic-verifier-directed-descendant-remap' ||
				sourceShard.salvage ||
				sourceShard.continuation
			) {
				throw new Error(`${shardId} source descendant-remap lineage is invalid.`);
			}
			const manifest = archivedTrackedJson({
				archiveRoot,
				tracked,
				path: `${root}/staged/manifest.json`,
				kind: 'content-descendant-remap-manifest',
				expectedCanonicalSha256: source.manifestSha256,
				expectedByteSha256: source.manifestFileSha256,
				label: `${shardId} descendant-remap manifest`
			});
			const candidate = archivedTrackedJson({
				archiveRoot,
				tracked,
				path: `${root}/staged/candidate.json`,
				kind: 'content-descendant-remap-candidate',
				expectedCanonicalSha256: source.candidateSha256,
				expectedByteSha256: source.candidateFileSha256,
				label: `${shardId} descendant-remap candidate`
			});
			const validation = archivedTrackedJson({
				archiveRoot,
				tracked,
				path: `${root}/staged/validation.json`,
				kind: 'content-descendant-remap-validation',
				expectedCanonicalSha256: source.validationSha256,
				expectedByteSha256: source.validationFileSha256,
				label: `${shardId} descendant-remap validation`
			});
			const remapEffectivePlan = archivedTrackedJson({
				archiveRoot,
				tracked,
				path: `${root}/staged/effective-plan.json`,
				kind: 'content-descendant-remap-effective-plan',
				expectedCanonicalSha256: source.effectivePlanSha256,
				expectedByteSha256: source.effectivePlanFileSha256,
				label: `${shardId} descendant-remap effective plan`
			});
			const priorCandidate = archivedTrackedJson({
				archiveRoot,
				tracked,
				path: `${root}/staged/prior-candidate.json`,
				kind: 'content-descendant-remap-prior-candidate',
				expectedCanonicalSha256: source.priorCandidateSha256,
				label: `${shardId} descendant-remap prior candidate`
			});
			const firstReviewSummary = archivedTrackedJson({
				archiveRoot,
				tracked,
				path: `${root}/staged/first-review-summary.json`,
				kind: 'content-descendant-remap-first-review-summary',
				expectedCanonicalSha256: source.firstReviewSummarySha256,
				label: `${shardId} descendant-remap first review summary`
			});
			archivedTrackedJson({
				archiveRoot,
				tracked,
				path: `${root}/staged/first-review-result.json`,
				kind: 'content-descendant-remap-first-review-result',
				expectedCanonicalSha256: source.firstReviewResultSha256,
				label: `${shardId} descendant-remap first review result`
			});
			if (
				firstReviewSummary.status !== 'failed' ||
				validation.status !== 'review-pending' ||
				validation.sourceAttemptStatus !== 'failed' ||
				canonicalHash(remapEffectivePlan) !== canonicalHash(effectivePlan)
			) {
				throw new Error(`${shardId} archived descendant-remap review state is invalid.`);
			}
			const manifestValidation = validateScienceChallengeDescendantRemapManifest({
				manifest,
				plan: basePlan,
				priorCandidate,
				candidate
			});
			if (
				manifestValidation.status !== 'passed' ||
				manifest.base.planSha256 !== expectedBindings.basePlanSha256 ||
				manifest.effective.planSha256 !== expectedBindings.effectivePlanSha256 ||
				manifest.evidence.curriculumCatalogSha256 !== expectedBindings.curriculumCatalogSha256 ||
				remap.manifestSha256 !== canonicalHash(manifest) ||
				remap.remapSha256 !== manifest.remapSha256 ||
				remap.selectedSourceAttempt !== manifest.sourceAttempt.attempt
			) {
				throw new Error(`${shardId} archived descendant-remap manifest is invalid.`);
			}
			archivedManifests.push(manifest);
			if (
				!Array.isArray(remap.sourceAttempts) ||
				remap.sourceAttempts.length !== 4 ||
				remap.sourceAttempts.some(
					(attempt, attemptIndex) =>
						attempt?.attempt !== attemptIndex + 1 ||
						attempt.status !== 'failed' ||
						!Array.isArray(attempt.parts) ||
						attempt.parts.length === 0
				)
			) {
				throw new Error(`${shardId} archived descendant remap omits the four failed attempts.`);
			}
			for (const attempt of remap.sourceAttempts) {
				validateArchivedDescendantRemapAttempt({
					archiveRoot,
					tracked,
					external,
					shardId,
					root,
					attempt
				});
			}
			if (
				tracked.some((artifact) =>
					new RegExp(
						`^content/shards/${escapeRegExp(
							shardId
						)}/descendant-remap/source-attempts/attempt-(?:0[5-9]|[1-9][0-9])(?:/|$)`
					).test(String(artifact?.path ?? ''))
				)
			) {
				throw new Error(`${shardId} archived descendant remap contains an attempt after four.`);
			}
			if (
				!Array.isArray(remap.claims) ||
				remap.claims.length !== 4 ||
				remap.claims.some((reference, index) => {
					const claim = source.execution.claims[index];
					validateLineageReference(reference, tracked, external, issues);
					return (
						reference.canonicalSha256 !== claim?.sha256 || reference.sha256 !== claim?.fileSha256
					);
				})
			) {
				throw new Error(`${shardId} archived descendant-remap claims are incomplete.`);
			}
			validateLineageReference(remap.objective, tracked, external, issues);
			if (
				remap.objective.canonicalSha256 !== source.execution.objectiveSha256 ||
				remap.objective.sha256 !== source.execution.objectiveFileSha256
			) {
				throw new Error(`${shardId} archived descendant-remap objective is stale.`);
			}
			const expectedStagedFields = [
				'manifest',
				'candidate',
				'validation',
				'effectivePlan',
				'provenance',
				'priorCandidate',
				'priorValidation',
				'firstReviewSummary',
				'firstReviewResult',
				'firstAssignment',
				'firstDispatchLedger',
				'priorBaseBatchValidation',
				'baseBatchValidation',
				'effectiveBatchValidation',
				'collectionValidation',
				'repairValidation'
			].sort();
			if (
				Object.keys(remap.staged ?? {})
					.sort()
					.join('\n') !== expectedStagedFields.join('\n')
			) {
				throw new Error(
					`${shardId} archived descendant-remap staged references are not closed-world.`
				);
			}
			for (const reference of Object.values(remap.staged ?? {})) {
				validateLineageReference(reference, tracked, external, issues);
			}
		}
		if (canonicalHash(archivedManifests) !== expectedBindings.descendantRemapManifestSetSha256) {
			throw new Error('Archived descendant-remap manifest set differs from release bindings.');
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
}

function validateArchivedDifficultyPlanAdjustmentEvidence({
	archiveRoot,
	sourceLineage,
	tracked,
	external,
	expectedBindings,
	issues
}) {
	const adjustmentBound = sha256String(
		expectedBindings.difficultyPlanAdjustmentVerifierInputSha256
	);
	const sourceAdjustments = (sourceLineage?.content ?? []).filter(
		(shard) => shard?.difficultyPlanAdjustment
	);
	const archivedAdjustmentArtifacts = tracked.filter(
		(artifact) =>
			String(artifact?.kind ?? '').includes('difficulty-plan-adjustment') ||
			/(^|\/)difficulty-plan-adjustment(?:-index)?(?:\/|\.json)/u.test(String(artifact?.path ?? ''))
	);
	if (!adjustmentBound) {
		if (
			sourceAdjustments.length > 0 ||
			archivedAdjustmentArtifacts.length > 0 ||
			expectedBindings.difficultyAdjustmentManifestSetSha256 !== null ||
			expectedBindings.difficultyPlanAdjustmentDecisionSetSha256 !== null
		) {
			issues.push(
				'Difficulty-plan adjustment provenance is present without complete release bindings.'
			);
		}
		return;
	}
	try {
		if (
			!sha256String(expectedBindings.difficultyAdjustmentManifestSetSha256) ||
			!sha256String(expectedBindings.difficultyPlanAdjustmentDecisionSetSha256) ||
			!sha256String(expectedBindings.recoverySetSha256) ||
			sourceAdjustments.length === 0
		) {
			throw new Error(
				'Difficulty-plan adjustment release bindings or source lineage are incomplete.'
			);
		}
		const index = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'content/difficulty-plan-adjustment-index.json',
			kind: 'content-difficulty-plan-adjustment-index',
			expectedCanonicalSha256: tracked.find(
				(artifact) => artifact?.path === 'content/difficulty-plan-adjustment-index.json'
			)?.canonicalSha256,
			label: 'difficulty-plan adjustment provenance index'
		});
		if (
			index.schemaVersion !== 'science-challenge-difficulty-plan-adjustment-provenance-index/v1' ||
			index.basePlanSha256 !== expectedBindings.basePlanSha256 ||
			index.effectivePlanSha256 !== expectedBindings.effectivePlanSha256 ||
			index.difficultyPlanAdjustmentVerifierInputSha256 !==
				expectedBindings.difficultyPlanAdjustmentVerifierInputSha256 ||
			index.decisionSetSha256 !== expectedBindings.difficultyPlanAdjustmentDecisionSetSha256 ||
			index.recoverySetSha256 !== expectedBindings.recoverySetSha256 ||
			index.effectiveCohortManifestSha256 !== expectedBindings.effectiveCohortManifestSha256 ||
			index.effectiveCohortCandidateSetSha256 !==
				expectedBindings.effectiveCohortCandidateSetSha256 ||
			index.manifestSetSha256 !== expectedBindings.difficultyAdjustmentManifestSetSha256 ||
			index.recoveryCount !== sourceAdjustments.length ||
			!Array.isArray(index.recoveries) ||
			index.recoveries.length !== sourceAdjustments.length
		) {
			throw new Error('Archived difficulty-plan adjustment provenance index is invalid.');
		}
		const basePlan = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'plans/base-plan.json',
			kind: 'base-plan',
			expectedCanonicalSha256: expectedBindings.basePlanSha256,
			label: 'base plan'
		});
		const effectivePlan = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'plans/effective-plan.json',
			kind: 'effective-plan',
			expectedCanonicalSha256: expectedBindings.effectivePlanSha256,
			label: 'effective plan'
		});
		const effectiveCohortIndex = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: 'content/effective-cohort-index.json',
			kind: 'effective-cohort-index',
			expectedCanonicalSha256: tracked.find(
				(artifact) => artifact?.path === 'content/effective-cohort-index.json'
			)?.canonicalSha256,
			label: 'effective-cohort provenance index'
		});
		if (
			effectiveCohortIndex.schemaVersion !==
				'science-challenge-effective-cohort-provenance-index/v1' ||
			effectiveCohortIndex.referenceRoot !== 'content/effective-cohort' ||
			effectiveCohortIndex.manifestSha256 !== expectedBindings.effectiveCohortManifestSha256 ||
			effectiveCohortIndex.basePlanSha256 !== expectedBindings.basePlanSha256 ||
			effectiveCohortIndex.effectivePlanSha256 !== expectedBindings.effectivePlanSha256 ||
			effectiveCohortIndex.candidateSetSha256 !==
				expectedBindings.effectiveCohortCandidateSetSha256 ||
			effectiveCohortIndex.difficultyAdjustmentManifestSetSha256 !==
				expectedBindings.difficultyAdjustmentManifestSetSha256 ||
			effectiveCohortIndex.recoverySetSha256 !== expectedBindings.recoverySetSha256 ||
			index.effectiveCohortIndexSha256 !== canonicalHash(effectiveCohortIndex)
		) {
			throw new Error('Archived effective-cohort difficulty-plan adjustment index is invalid.');
		}
		validateLineageReference(effectiveCohortIndex.manifestRef, tracked, external, issues);
		if (effectiveCohortIndex.durableReceiptRef) {
			validateLineageReference(effectiveCohortIndex.durableReceiptRef, tracked, external, issues);
		}
		for (const reference of effectiveCohortIndex.artifactRefs ?? []) {
			validateLineageReference(reference, tracked, external, issues);
		}
		const effectiveReferenceRoot = path.join(archiveRoot, effectiveCohortIndex.referenceRoot);
		const effectiveReplay = readScienceChallengeEffectiveCohort({
			manifestPath: path.join(effectiveReferenceRoot, effectiveCohortIndex.manifestPath),
			referenceRoot: effectiveReferenceRoot,
			basePlan,
			effectivePlan,
			expectedSourceSnapshotSha256: expectedBindings.sourceSnapshotSha256,
			expectedCurriculumEvidenceSha256: expectedBindings.curriculumEvidenceSha256,
			expectedCurriculumCatalogSha256: expectedBindings.curriculumCatalogSha256
		});
		if (
			effectiveReplay.status !== 'passed' ||
			canonicalHash(effectiveReplay.manifest) !== expectedBindings.effectiveCohortManifestSha256 ||
			effectiveReplay.candidateSetSha256 !== expectedBindings.effectiveCohortCandidateSetSha256 ||
			effectiveReplay.manifest.difficultyAdjustmentManifestSetSha256 !==
				expectedBindings.difficultyAdjustmentManifestSetSha256 ||
			effectiveReplay.manifest.recoverySetSha256 !== expectedBindings.recoverySetSha256
		) {
			throw new Error(
				`Archived effective-cohort difficulty replay failed: ${(effectiveReplay.issues ?? []).join(
					' '
				)}`
			);
		}
		const expectedEffectiveArtifactPaths = effectiveCohortArtifactReferencePaths(effectiveReplay)
			.sort()
			.map((relativePath) => `content/effective-cohort/${relativePath}`);
		const indexedEffectiveArtifactPaths = (effectiveCohortIndex.artifactRefs ?? [])
			.map((reference) => reference?.path)
			.sort();
		if (
			effectiveCohortIndex.artifactCount !== expectedEffectiveArtifactPaths.length ||
			indexedEffectiveArtifactPaths.join('\n') !== expectedEffectiveArtifactPaths.join('\n') ||
			(effectiveCohortIndex.artifactRefs ?? []).some(
				(reference) => reference?.kind !== 'effective-cohort-artifact'
			)
		) {
			throw new Error(
				'Archived effective-cohort difficulty artifact references are not exact and closed-world.'
			);
		}
		const archivedManifests = [];
		for (const [recoveryIndex, recovery] of index.recoveries.entries()) {
			const sourceShard = sourceAdjustments.find((shard) => shard.shardId === recovery?.shardId);
			if (!sourceShard) {
				throw new Error(
					`Archived difficulty-plan adjustment ${recoveryIndex + 1} has no source shard.`
				);
			}
			const source = sourceShard.difficultyPlanAdjustment;
			const shardId = safeFilename(sourceShard.shardId);
			const root = `content/shards/${shardId}/difficulty-plan-adjustment`;
			if (
				source.schemaVersion !==
					'science-challenge-verifier-directed-difficulty-plan-adjustment-evidence/v1' ||
				![
					'deterministic-verifier-directed-difficulty-plan-adjustment',
					'deterministic-verifier-directed-difficulty-plan-adjustment-set'
				].includes(source.disposition) ||
				sourceShard.salvage ||
				sourceShard.continuation ||
				sourceShard.descendantRemap ||
				recovery.manifestSha256 !== source.manifestSha256 ||
				recovery.adjustmentSha256 !== (source.adjustmentSha256 ?? null) ||
				recovery.adjustmentSetSha256 !== (source.adjustmentSetSha256 ?? null) ||
				recovery.adjustmentCount !== (source.adjustmentCount ?? 1) ||
				recovery.basePlanSha256 !== source.basePlanSha256 ||
				recovery.effectivePlanSha256 !== source.effectivePlanSha256 ||
				recovery.sourceAttempts?.length !== 4 ||
				recovery.claims?.length !== 4
			) {
				throw new Error(`${shardId} archived difficulty-plan adjustment lineage is invalid.`);
			}
			for (const reference of Object.values(recovery.staged ?? {})) {
				validateLineageReference(reference, tracked, external, issues);
			}
			for (const reference of [recovery.objective, ...(recovery.claims ?? [])]) {
				validateLineageReference(reference, tracked, external, issues);
			}
			const manifest = archivedTrackedJsonReference({
				archiveRoot,
				tracked,
				external,
				reference: recovery.staged.manifest,
				expectedCanonicalSha256: source.manifestSha256,
				label: `${shardId} difficulty-plan adjustment manifest`
			});
			if (
				canonicalHash(manifest) !== source.manifestSha256 ||
				manifest.shardId !== sourceShard.shardId ||
				![
					'science-challenge-verifier-directed-difficulty-plan-adjustment/v1',
					'science-challenge-verifier-directed-difficulty-plan-adjustment-set/v1'
				].includes(manifest.schemaVersion)
			) {
				throw new Error(`${shardId} archived difficulty-plan adjustment manifest is stale.`);
			}
			archivedManifests.push(manifest);
		}
		if (
			canonicalHash(archivedManifests) !== expectedBindings.difficultyAdjustmentManifestSetSha256
		) {
			throw new Error(
				'Archived difficulty-plan adjustment manifest set differs from release bindings.'
			);
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
}

function validateArchivedDescendantRemapAttempt({
	archiveRoot,
	tracked,
	external,
	shardId,
	root,
	attempt
}) {
	const attemptId = `attempt-${String(attempt.attempt).padStart(2, '0')}`;
	const destination = `${root}/source-attempts/${attemptId}`;
	const runSummary = archivedTrackedJsonReference({
		archiveRoot,
		tracked,
		external,
		reference: attempt.tracked?.runSummary,
		expectedCanonicalSha256: attempt.runSummarySha256,
		label: `${shardId} descendant-remap ${attemptId} run summary`
	});
	const validation = archivedTrackedJsonReference({
		archiveRoot,
		tracked,
		external,
		reference: attempt.tracked?.validation,
		expectedCanonicalSha256: attempt.validationSha256,
		label: `${shardId} descendant-remap ${attemptId} validation`
	});
	const candidate = archivedTrackedJsonReference({
		archiveRoot,
		tracked,
		external,
		reference: attempt.tracked?.candidate,
		expectedCanonicalSha256: attempt.candidateSha256,
		label: `${shardId} descendant-remap ${attemptId} candidate`
	});
	const runPolicy = archivedTrackedJsonReference({
		archiveRoot,
		tracked,
		external,
		reference: attempt.runPolicyRef,
		expectedCanonicalSha256: attempt.runPolicySha256,
		label: `${shardId} descendant-remap ${attemptId} run policy`
	});
	const referenceIssues = [];
	for (const reference of [
		attempt.tracked?.lastMessage,
		attempt.promptRef,
		attempt.eventRef,
		...attempt.parts.flatMap((part) => [
			part.promptRef,
			...Object.values(part.tracked ?? {}),
			...Object.values(part.dependencies ?? {})
		])
	]) {
		validateLineageReference(reference, tracked, external, referenceIssues);
	}
	if (referenceIssues.length > 0) {
		throw new Error(
			`${shardId} archived descendant-remap ${attemptId} has invalid evidence references.`
		);
	}
	if (
		runSummary.status !== 'passed' ||
		validation.status !== 'failed' ||
		canonicalHash(candidate) !== validation.candidateSha256 ||
		runPolicy.status !== 'passed' ||
		!Array.isArray(runPolicy.issues) ||
		runPolicy.issues.length !== 0 ||
		canonicalHash(runPolicy.candidate) !== canonicalHash(candidate) ||
		!Array.isArray(runPolicy.parts) ||
		runPolicy.parts.length !== attempt.parts.length ||
		!attempt.tracked?.runSummary?.path?.startsWith(`${destination}/`)
	) {
		throw new Error(`${shardId} archived descendant-remap ${attemptId} is invalid.`);
	}
}

function validateOneArchivedMultipartPlanSalvage({
	archiveRoot,
	sourceShard,
	sanitizedShard,
	tracked,
	external
}) {
	const shardId = safeFilename(sourceShard.shardId);
	const source = sourceShard.salvage;
	const sanitized = sanitizedShard.salvage;
	const root = `content/shards/${shardId}/multipart-plan-salvage`;
	const pathways = new Set([
		'failed-merge-id-and-difficulty',
		'merged-candidate-plan-difficulty',
		'raw-question-presentation-null-default'
	]);
	if (
		source.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_EVIDENCE_SCHEMA ||
		sanitized.schemaVersion !== source.schemaVersion ||
		!pathways.has(source.salvagePathway) ||
		sanitized.salvagePathway !== source.salvagePathway
	) {
		throw new Error(`${shardId} archived multipart plan-drift salvage lineage is invalid.`);
	}

	const manifest = archivedTrackedJson({
		archiveRoot,
		tracked,
		path: `${root}/manifest.json`,
		kind: 'content-multipart-plan-salvage-manifest',
		expectedCanonicalSha256: source.manifestSha256,
		expectedByteSha256: source.manifestFileSha256,
		label: `${shardId} salvage manifest`
	});
	const candidate = archivedTrackedJson({
		archiveRoot,
		tracked,
		path: `${root}/candidate.json`,
		kind: 'content-multipart-plan-salvage-candidate',
		expectedCanonicalSha256: source.candidateSha256,
		expectedByteSha256: source.candidateFileSha256,
		label: `${shardId} salvage candidate`
	});
	const validation = archivedTrackedJson({
		archiveRoot,
		tracked,
		path: `${root}/validation.json`,
		kind: 'content-multipart-plan-salvage-validation',
		expectedCanonicalSha256: source.validationSha256,
		expectedByteSha256: source.validationFileSha256,
		label: `${shardId} salvage validation`
	});
	const manifestSelection = manifest.sourceSelection;
	const selectedSource = manifestSelection?.eligibleSources?.find(
		(sourceBinding) => sourceBinding?.attempt === manifestSelection?.selectedAttempt
	);
	if (
		manifest.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_EVIDENCE_SCHEMA ||
		manifest.shardId !== shardId ||
		manifest.candidateSha256 !== canonicalHash(candidate) ||
		manifest.validationSha256 !== canonicalHash(validation) ||
		sourceShard.candidateSha256 !== canonicalHash(candidate) ||
		sourceShard.validationSha256 !== canonicalHash(validation) ||
		sanitized.candidateSha256 !== canonicalHash(candidate) ||
		sanitized.validationSha256 !== canonicalHash(validation)
	) {
		throw new Error(`${shardId} archived salvage files do not bind the accepted shard.`);
	}
	if (
		validation.schemaVersion !== SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_VALIDATION_SCHEMA ||
		validation.status !== 'passed' ||
		validation.authoringDisposition !== 'deterministic-multipart-plan-drift-salvage' ||
		validation.sourceAttemptStatus !== 'failed' ||
		validation.salvageSchemaVersion !== SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SCHEMA ||
		validation.salvagePathway !== source.salvagePathway ||
		manifest.salvage?.pathway !== source.salvagePathway ||
		validation.candidateSha256 !== canonicalHash(candidate) ||
		validation.verificationRepairSha256 !== manifest.repairSha256 ||
		validation.sourceAttempt !== manifest.sourceAttempt?.attempt ||
		validation.salvageSourceSha256 !== canonicalHash(manifest.salvage?.source) ||
		validation.correctionsSha256 !== canonicalHash(manifest.salvage?.corrections) ||
		!sha256String(validation.deterministicValidationSha256) ||
		!sha256String(validation.repairValidationSha256) ||
		manifest.salvage?.source?.expectedInputSha256 !== validation.inputSha256 ||
		manifest.salvage?.normalizationVersion !== validation.normalizationVersion ||
		manifest.salvage?.candidateSha256 !== canonicalHash(candidate) ||
		canonicalHash(manifest.executionIdentity) !== manifest.executionIdentitySha256 ||
		canonicalHash(source.execution?.identity) !== manifest.executionIdentitySha256 ||
		canonicalHash(source.corrections) !== canonicalHash(manifest.salvage?.corrections) ||
		source.salvageSourceSha256 !== canonicalHash(manifest.salvage?.source) ||
		source.sourceSelectionSha256 !== canonicalHash(source.sourceSelection) ||
		sanitized.sourceSelectionSha256 !== source.sourceSelectionSha256 ||
		canonicalHash(sanitized.sourceSelection) !== source.sourceSelectionSha256 ||
		canonicalHash(manifestSelection) !== source.sourceSelectionSha256 ||
		!selectedSource ||
		selectedSource.attempt !== manifest.sourceAttempt?.attempt ||
		selectedSource.runSummarySha256 !== manifest.sourceAttempt?.runSummary?.canonicalSha256 ||
		selectedSource.runSummarySha256 !== source.sourceAttempt?.runSummarySha256 ||
		selectedSource.sourceValidationSha256 !== manifest.sourceAttempt?.validation?.canonicalSha256 ||
		selectedSource.sourceValidationSha256 !== source.sourceAttempt?.validationSha256 ||
		selectedSource.sourceCandidateSha256 !==
			(manifest.sourceAttempt?.candidate?.canonicalSha256 ?? null) ||
		selectedSource.sourceCandidateSha256 !== (source.sourceAttempt?.candidateSha256 ?? null) ||
		selectedSource.recoveredCandidateSha256 !== canonicalHash(candidate) ||
		selectedSource.salvagePathway !== source.salvagePathway ||
		selectedSource.salvageSourceSha256 !== source.salvageSourceSha256 ||
		selectedSource.correctionsSha256 !== canonicalHash(source.corrections) ||
		selectedSource.deterministicValidationSha256 !== validation.deterministicValidationSha256 ||
		selectedSource.repairValidationSha256 !== validation.repairValidationSha256
	) {
		throw new Error(`${shardId} archived salvage validation or correction binding is invalid.`);
	}
	const executionIdentity = validateArchivedSalvageAttemptBudget({
		archiveRoot,
		tracked,
		shardId,
		source,
		sanitized,
		manifest
	});
	const sourceEvidence = validateArchivedSalvageSourceAttempt({
		archiveRoot,
		tracked,
		external,
		shardId,
		source,
		sanitized,
		manifest,
		validation,
		executionIdentity
	});
	validateArchivedSalvageRepairEvidence({
		archiveRoot,
		tracked,
		shardId,
		source,
		sanitized,
		manifest,
		validation,
		executionIdentity
	});
	validateArchivedSalvageCorrections({
		shardId,
		pathway: source.salvagePathway,
		candidate,
		manifest,
		sourceCandidate: sourceEvidence.sourceCandidate,
		partCandidates: sourceEvidence.partCandidates
	});
}

function validateArchivedSalvageAttemptBudget({
	archiveRoot,
	tracked,
	shardId,
	source,
	sanitized,
	manifest
}) {
	const budget = manifest.attemptBudget;
	const local = budget?.localAttempts;
	const global = budget?.globalAttempts;
	if (
		budget?.maxAttempts !== VERIFICATION_REPAIR_MAX_ATTEMPTS ||
		budget?.exhausted !== true ||
		!Array.isArray(local) ||
		!Array.isArray(global) ||
		local.length !== VERIFICATION_REPAIR_MAX_ATTEMPTS ||
		global.length !== VERIFICATION_REPAIR_MAX_ATTEMPTS
	) {
		throw new Error(`${shardId} archived salvage omits the exhausted four-attempt budget.`);
	}
	for (let index = 0; index < VERIFICATION_REPAIR_MAX_ATTEMPTS; index += 1) {
		const attempt = index + 1;
		const localRecord = local[index];
		const globalRecord = global[index];
		const directoryMatch = String(localRecord?.directory ?? '').match(
			VERIFICATION_REPAIR_ATTEMPT_DIRECTORY
		);
		if (
			localRecord?.attempt !== attempt ||
			globalRecord?.attempt !== attempt ||
			!directoryMatch ||
			Number(directoryMatch[2]) !== attempt ||
			directoryMatch[1] !== String(manifest.repairSha256 ?? '').slice(0, 12) ||
			!sha256String(globalRecord?.claimSha256) ||
			!sha256String(globalRecord?.claimByteSha256)
		) {
			throw new Error(`${shardId} archived salvage attempt ${attempt} budget row is invalid.`);
		}
		const localRunPath = `content/shards/${shardId}/attempts/${localRecord.directory}/run-summary.json`;
		if (!tracked.some((artifact) => artifact?.path === localRunPath)) {
			throw new Error(`${shardId} archived salvage omits local attempt ${attempt} evidence.`);
		}
	}
	if (manifest.sourceAttempt?.directory !== local[manifest.sourceAttempt?.attempt - 1]?.directory) {
		throw new Error(`${shardId} archived salvage source attempt differs from its local budget.`);
	}

	const objective = archivedTrackedJson({
		archiveRoot,
		tracked,
		path: `content/shards/${shardId}/multipart-plan-salvage/execution/objective.json`,
		kind: 'content-multipart-plan-salvage-objective',
		expectedCanonicalSha256: budget.globalObjectiveSha256,
		expectedByteSha256: budget.globalObjectiveByteSha256,
		label: `${shardId} salvage execution objective`
	});
	const objectiveIdentity = {
		schemaVersion: 'science-challenge-verification-repair-objective/v1',
		planSha256: objective.planSha256,
		verificationSha256: objective.verificationSha256,
		priorCandidateSetSha256: objective.priorCandidateSetSha256
	};
	if (
		objective.schemaVersion !== objectiveIdentity.schemaVersion ||
		objective.objectiveId !== canonicalHash(objectiveIdentity) ||
		objective.planSha256 !== canonicalHash(readJson(path.join(archiveRoot, 'plan.json'))) ||
		objective.verificationSha256 !== manifest.repairSha256 ||
		canonicalHash(objective) !== source.execution?.objectiveSha256 ||
		canonicalHash(objective) !== sanitized.execution?.objectiveSha256 ||
		budget.globalObjectiveByteSha256 !== source.execution?.objectiveByteSha256 ||
		budget.globalObjectiveByteSha256 !== sanitized.execution?.objectiveByteSha256 ||
		manifest.executionId !== source.execution?.executionId ||
		manifest.executionId !== sanitized.execution?.executionId
	) {
		throw new Error(`${shardId} archived salvage execution objective is invalid.`);
	}

	let outputRootSha256 = null;
	let exactExecutionIdentity = null;
	for (let index = 0; index < VERIFICATION_REPAIR_MAX_ATTEMPTS; index += 1) {
		const attempt = index + 1;
		const sourceClaim = source.execution?.claims?.[index];
		const sanitizedClaim = sanitized.execution?.claims?.[index];
		const budgetClaim = global[index];
		const claim = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: `content/shards/${shardId}/multipart-plan-salvage/execution/claims/attempt-${String(
				attempt
			).padStart(2, '0')}.json`,
			kind: 'content-multipart-plan-salvage-claim',
			expectedCanonicalSha256: budgetClaim.claimSha256,
			expectedByteSha256: budgetClaim.claimByteSha256,
			label: `${shardId} salvage claim ${attempt}`
		});
		const policy = claim.policy;
		const executionBase = {
			schemaVersion: 'science-challenge-verification-repair-execution/v2',
			planSha256: objective.planSha256,
			verificationSha256: objective.verificationSha256,
			priorCandidateSetSha256: objective.priorCandidateSetSha256,
			objectiveId: objective.objectiveId,
			model: policy?.model,
			transport: policy?.transport,
			responseMode: policy?.responseMode,
			thinkingLevel: policy?.thinkingLevel,
			directPartSize: policy?.directPartSize
		};
		const executionIdentity = {
			...executionBase,
			executionId: canonicalHash(executionBase)
		};
		if (
			claim.schemaVersion !== 'science-challenge-verification-repair-attempt-claim/v2' ||
			claim.objectiveId !== objective.objectiveId ||
			claim.executionId !== manifest.executionId ||
			claim.executionId !== executionIdentity.executionId ||
			claim.policySha256 !== canonicalHash(policy) ||
			policy?.schemaVersion !== 'science-challenge-verification-repair-attempt-policy/v1' ||
			policy?.objectiveId !== objective.objectiveId ||
			policy?.executionId !== claim.executionId ||
			claim.shardId !== shardId ||
			claim.attempt !== attempt ||
			!sha256String(claim.outputRootSha256) ||
			canonicalHash(executionIdentity) !== manifest.executionIdentitySha256 ||
			canonicalHash(executionIdentity) !== canonicalHash(source.execution?.identity) ||
			canonicalHash(executionIdentity) !== canonicalHash(sanitized.execution?.identity) ||
			sourceClaim?.attempt !== attempt ||
			sourceClaim?.sha256 !== canonicalHash(claim) ||
			sourceClaim?.byteSha256 !== budgetClaim.claimByteSha256 ||
			sanitizedClaim?.attempt !== attempt ||
			sanitizedClaim?.sha256 !== canonicalHash(claim) ||
			sanitizedClaim?.byteSha256 !== budgetClaim.claimByteSha256
		) {
			throw new Error(`${shardId} archived salvage execution claim ${attempt} is invalid.`);
		}
		if (outputRootSha256 && claim.outputRootSha256 !== outputRootSha256) {
			throw new Error(`${shardId} archived salvage claims name different output roots.`);
		}
		outputRootSha256 = claim.outputRootSha256;
		exactExecutionIdentity = executionIdentity;
	}
	return exactExecutionIdentity;
}

function validateArchivedSalvageSourceAttempt({
	archiveRoot,
	tracked,
	external,
	shardId,
	source,
	sanitized,
	manifest,
	validation,
	executionIdentity
}) {
	const manifestSource = manifest.sourceAttempt;
	const sourceAttempt = source.sourceAttempt;
	const sanitizedAttempt = sanitized.sourceAttempt;
	if (
		manifestSource?.status !== 'failed' ||
		sourceAttempt?.status !== 'failed' ||
		sanitizedAttempt?.status !== 'failed' ||
		manifestSource.attempt !== sourceAttempt.attempt ||
		manifestSource.attempt !== sanitizedAttempt.attempt
	) {
		throw new Error(`${shardId} archived salvage relabels its failed source attempt.`);
	}
	const attemptRoot = `content/shards/${shardId}/attempts/${safeFilename(
		manifestSource.directory
	)}`;
	const summary = archivedTrackedJson({
		archiveRoot,
		tracked,
		path: `${attemptRoot}/run-summary.json`,
		kind: 'content-run-summary',
		expectedCanonicalSha256: manifestSource.runSummary?.canonicalSha256,
		expectedByteSha256: manifestSource.runSummary?.sha256,
		label: `${shardId} salvage source run summary`
	});
	const sourceValidation = archivedTrackedJson({
		archiveRoot,
		tracked,
		path: `${attemptRoot}/validation.json`,
		kind: 'content-validation',
		expectedCanonicalSha256: manifestSource.validation?.canonicalSha256,
		expectedByteSha256: manifestSource.validation?.sha256,
		label: `${shardId} salvage source failed validation`
	});
	const lastMessageRecord = archivedReferenceRecord(
		sanitizedAttempt.lastMessageRef,
		tracked,
		external,
		`${shardId} salvage source final message`
	);
	const eventRecord = archivedReferenceRecord(
		sanitizedAttempt.eventLogRef,
		tracked,
		external,
		`${shardId} salvage source event log`
	);
	const promptRecord = archivedReferenceRecord(
		sanitizedAttempt.promptRef,
		tracked,
		external,
		`${shardId} salvage source prompt`
	);
	const expectedSourceRunStatus =
		source.salvagePathway === 'merged-candidate-plan-difficulty' ? 'passed' : 'failed';
	if (
		summary.status !== expectedSourceRunStatus ||
		sourceValidation.status !== 'failed' ||
		sourceAttempt.runSummarySha256 !== canonicalHash(summary) ||
		sourceAttempt.runSummaryFileSha256 !== manifestSource.runSummary?.sha256 ||
		sanitizedAttempt.runSummaryFileSha256 !== manifestSource.runSummary?.sha256 ||
		sanitizedAttempt.runSummarySha256 !== canonicalHash(summary) ||
		sourceAttempt.validationSha256 !== canonicalHash(sourceValidation) ||
		sourceAttempt.validationFileSha256 !== manifestSource.validation?.sha256 ||
		sanitizedAttempt.validationFileSha256 !== manifestSource.validation?.sha256 ||
		sanitizedAttempt.validationSha256 !== canonicalHash(sourceValidation) ||
		sourceAttempt.lastMessageSha256 !== manifestSource.lastMessage?.sha256 ||
		sanitizedAttempt.lastMessageSha256 !== manifestSource.lastMessage?.sha256 ||
		lastMessageRecord.sha256 !== manifestSource.lastMessage?.sha256 ||
		sourceAttempt.eventLogSha256 !== manifestSource.eventLog?.sha256 ||
		sanitizedAttempt.eventLogSha256 !== manifestSource.eventLog?.sha256 ||
		eventRecord.sha256 !== manifestSource.eventLog?.sha256 ||
		sourceAttempt.promptSha256 !== manifestSource.prompt?.sha256 ||
		sanitizedAttempt.promptSha256 !== manifestSource.prompt?.sha256 ||
		promptRecord.sha256 !== manifestSource.prompt?.sha256 ||
		validation.runSummarySha256 !== canonicalHash(summary) ||
		validation.promptSha256 !== manifestSource.prompt?.sha256 ||
		summary.model !== executionIdentity?.model ||
		summary.transport !== executionIdentity?.transport ||
		(summary.responseMode ?? SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON) !==
			executionIdentity?.responseMode ||
		summary.thinkingLevel !== executionIdentity?.thinkingLevel ||
		summary.partSize !== executionIdentity?.directPartSize
	) {
		throw new Error(
			`${shardId} archived failed source evidence differs from its salvage manifest.`
		);
	}

	const sourceCandidateBinding = manifestSource.candidate ?? null;
	let normalizedSourceCandidate = null;
	if (source.salvagePathway === 'merged-candidate-plan-difficulty') {
		const sourceCandidate = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: `${attemptRoot}/candidate.json`,
			kind: 'content-candidate',
			expectedCanonicalSha256: sourceCandidateBinding?.canonicalSha256,
			expectedByteSha256: sourceCandidateBinding?.sha256,
			label: `${shardId} salvage source candidate`
		});
		if (
			sourceAttempt.candidateSha256 !== canonicalHash(sourceCandidate) ||
			sourceAttempt.candidateFileSha256 !== sourceCandidateBinding?.sha256 ||
			sanitizedAttempt.candidateFileSha256 !== sourceCandidateBinding?.sha256 ||
			sanitizedAttempt.candidateSha256 !== canonicalHash(sourceCandidate) ||
			sourceValidation.candidateSha256 !== canonicalHash(sourceCandidate)
		) {
			throw new Error(`${shardId} archived merged source candidate binding is invalid.`);
		}
		normalizedSourceCandidate = sourceCandidate;
	} else if (
		sourceCandidateBinding ||
		(sourceAttempt.candidateSha256 !== null && sourceAttempt.candidateSha256 !== undefined) ||
		sanitizedAttempt.candidateSha256 !== null ||
		(sourceAttempt.candidateFileSha256 !== null &&
			sourceAttempt.candidateFileSha256 !== undefined) ||
		sanitizedAttempt.candidateFileSha256 !== null
	) {
		throw new Error(`${shardId} archived salvage unexpectedly claims a source candidate.`);
	}

	const summaryParts = Array.isArray(summary.parts) ? summary.parts : [];
	const sourceParts = Array.isArray(sourceAttempt.parts)
		? sourceAttempt.parts
		: Array.isArray(sourceAttempt.partRecords)
			? sourceAttempt.partRecords
			: [];
	const sanitizedParts = Array.isArray(sanitizedAttempt.parts) ? sanitizedAttempt.parts : [];
	if (
		summaryParts.length < 2 ||
		sourceParts.length !== summaryParts.length ||
		sanitizedParts.length !== summaryParts.length ||
		canonicalHash(sourceParts.map(sourcePartProjection)) !==
			canonicalHash(summaryParts.map(sourcePartProjection)) ||
		summary.partsSha256 !== canonicalHash(summaryParts)
	) {
		throw new Error(`${shardId} archived salvage multipart source ordering is invalid.`);
	}
	const partCandidates = [];
	const observedPartHashes = [];
	for (const [index, record] of summaryParts.entries()) {
		const part = sanitizedParts[index];
		const rawRecord = archivedReferenceRecord(
			part?.rawOutputRef,
			tracked,
			external,
			`${shardId} salvage ${record?.partId} raw output`
		);
		const partSummary = archivedTrackedJsonReference({
			archiveRoot,
			tracked,
			external,
			reference: part?.runSummaryRef,
			expectedCanonicalSha256: record?.runSummarySha256,
			label: `${shardId} salvage ${record?.partId} run summary`
		});
		const rawOutputPath = path.join(archiveRoot, rawRecord.path);
		const rawBytes = readFileSync(rawOutputPath);
		const rawCandidate = JSON.parse(rawBytes.toString('utf8'));
		if (
			record?.partId !== `part-${String(index + 1).padStart(2, '0')}` ||
			part?.partId !== record.partId ||
			rawRecord.sha256 !== record.rawOutputSha256 ||
			canonicalHash(rawCandidate) !== record.rawCandidateSha256 ||
			canonicalHash(partSummary) !== record.runSummarySha256
		) {
			throw new Error(`${shardId} archived salvage ${record?.partId} evidence is invalid.`);
		}
		observedPartHashes.push({
			partId: record.partId,
			rawOutputSha256: rawRecord.sha256,
			rawCandidateSha256: canonicalHash(rawCandidate)
		});
		partCandidates.push(rawCandidate);
	}
	const manifestParts = manifestSource.parts;
	const sourcePartBindingValid =
		source.salvagePathway === 'merged-candidate-plan-difficulty'
			? manifest.salvage?.source?.parts === undefined
			: canonicalHash(manifest.salvage?.source?.parts) === canonicalHash(observedPartHashes);
	let mergedCandidateBindingValid = true;
	if (source.salvagePathway === 'merged-candidate-plan-difficulty') {
		const rawMergedCandidate = readJson(path.join(archiveRoot, lastMessageRecord.path));
		mergedCandidateBindingValid =
			manifest.salvage?.source?.sourceValidationSha256 === canonicalHash(sourceValidation) &&
			manifest.salvage?.source?.sourceCandidateSha256 ===
				canonicalHash(normalizedSourceCandidate) &&
			manifest.salvage?.source?.rawMergedCandidateSha256 === canonicalHash(rawMergedCandidate);
	}
	if (
		canonicalHash(manifestParts) !==
			canonicalHash(
				summaryParts.map((part) => ({
					partId: part.partId,
					rawOutputSha256: part.rawOutputSha256,
					rawCandidateSha256: part.rawCandidateSha256,
					runSummarySha256: part.runSummarySha256
				}))
			) ||
		manifest.salvage?.source?.multipartSummarySha256 !== canonicalHash(summary) ||
		manifest.salvage?.source?.rootEventLogSha256 !== eventRecord.sha256 ||
		manifest.salvage?.source?.rootLastMessageSha256 !== lastMessageRecord.sha256 ||
		manifest.salvage?.source?.orchestrationPromptSha256 !== promptRecord.sha256 ||
		manifest.salvage?.source?.partOutputsSha256 !== canonicalHash(observedPartHashes) ||
		!sourcePartBindingValid ||
		!mergedCandidateBindingValid
	) {
		throw new Error(`${shardId} archived salvage cannot replay its raw multipart source.`);
	}
	return { summary, sourceValidation, sourceCandidate: normalizedSourceCandidate, partCandidates };
}

function validateArchivedSalvageRepairEvidence({
	archiveRoot,
	tracked,
	shardId,
	source,
	sanitized,
	manifest,
	validation,
	executionIdentity
}) {
	const root = `content/shards/${shardId}/multipart-plan-salvage/repair`;
	const rows = [
		[
			'verificationSummary',
			'verificationSummarySha256',
			'verificationSummaryFileSha256',
			'verification-summary.json',
			'content-multipart-plan-salvage-repair-summary'
		],
		[
			'priorCandidate',
			'priorCandidateSha256',
			'priorCandidateFileSha256',
			'prior-candidate.json',
			'content-multipart-plan-salvage-prior-candidate'
		],
		[
			'priorValidation',
			'priorValidationSha256',
			'priorValidationFileSha256',
			'prior-validation.json',
			'content-multipart-plan-salvage-prior-validation'
		]
	];
	const values = {};
	for (const [manifestKey, lineageKey, lineageFileKey, filename, kind] of rows) {
		const binding = manifest.repairEvidence?.[manifestKey];
		const value = archivedTrackedJson({
			archiveRoot,
			tracked,
			path: `${root}/${filename}`,
			kind,
			expectedCanonicalSha256: binding?.canonicalSha256,
			expectedByteSha256: binding?.sha256,
			label: `${shardId} salvage ${filename}`
		});
		if (
			source.repairEvidence?.[lineageKey] !== canonicalHash(value) ||
			sanitized.repairEvidence?.[lineageKey] !== canonicalHash(value) ||
			source.repairEvidence?.[lineageFileKey] !== binding?.sha256 ||
			sanitized.repairEvidence?.[lineageFileKey] !== binding?.sha256
		) {
			throw new Error(`${shardId} archived salvage ${filename} lineage binding is invalid.`);
		}
		values[manifestKey] = value;
	}
	if (
		canonicalHash(values.verificationSummary) !== manifest.repairSha256 ||
		values.verificationSummary.candidateSetSha256 !== executionIdentity?.priorCandidateSetSha256 ||
		values.priorValidation.status !== 'passed' ||
		values.priorValidation.candidateSha256 !== canonicalHash(values.priorCandidate) ||
		validation.priorCandidateSha256 !== canonicalHash(values.priorCandidate)
	) {
		throw new Error(`${shardId} archived salvage repair snapshots are not verifier-bound.`);
	}
}

function validateArchivedSalvageCorrections({
	shardId,
	pathway,
	candidate,
	manifest,
	sourceCandidate,
	partCandidates
}) {
	const corrections = manifest.salvage?.corrections;
	if (!Array.isArray(corrections) || corrections.length === 0) {
		throw new Error(`${shardId} archived salvage has no exact helper corrections.`);
	}
	const kinds = corrections.map((correction) => correction?.kind).sort();
	const pathwayKindsValid =
		pathway === 'failed-merge-id-and-difficulty'
			? canonicalHash(kinds) === canonicalHash(['definition.difficulty', 'definition.id'])
			: pathway === 'merged-candidate-plan-difficulty'
				? kinds.every((kind) => kind === 'definition.difficulty')
				: kinds.every((kind) => kind === 'definition.questionPresentation');
	if (!pathwayKindsValid) {
		throw new Error(`${shardId} archived salvage corrections differ from its pathway.`);
	}
	const rawChallenges =
		pathway === 'merged-candidate-plan-difficulty'
			? (sourceCandidate?.challenges ?? [])
			: partCandidates.flatMap((batch) =>
					Array.isArray(batch?.challenges) ? batch.challenges : []
				);
	const seenPaths = new Set();
	for (const correction of corrections) {
		if (
			!nonEmpty(correction?.kind) ||
			!nonEmpty(correction?.path) ||
			seenPaths.has(correction.path) ||
			!Number.isInteger(correction.absoluteRowIndex) ||
			correction.absoluteRowIndex < 0
		) {
			throw new Error(`${shardId} archived salvage correction inventory is invalid.`);
		}
		seenPaths.add(correction.path);
		const recovered = candidate?.challenges?.[correction.absoluteRowIndex];
		const raw = rawChallenges[correction.absoluteRowIndex];
		if (!recovered || !raw || correction.sourceChallengeSha256 !== canonicalHash(raw)) {
			throw new Error(`${shardId} archived salvage correction challenge hashes are invalid.`);
		}
		if (
			pathway !== 'raw-question-presentation-null-default' &&
			correction.recoveredChallengeSha256 !== canonicalHash(recovered)
		) {
			throw new Error(`${shardId} archived salvage recovered challenge hash is invalid.`);
		}
		if (correction.kind === 'definition.id') {
			if (
				correction.path !== `challenges[${correction.absoluteRowIndex}].definition.id` ||
				raw.definition?.id !== correction.from ||
				recovered.definition?.id !== correction.to ||
				!Number.isInteger(correction.editDistance) ||
				correction.editDistance < 1 ||
				correction.editDistance > 2
			) {
				throw new Error(`${shardId} archived salvage id correction is invalid.`);
			}
		} else if (correction.kind === 'definition.difficulty') {
			if (
				correction.path !== `challenges[${correction.absoluteRowIndex}].definition.difficulty` ||
				raw.definition?.difficulty !== correction.from ||
				recovered.definition?.difficulty !== correction.to
			) {
				throw new Error(`${shardId} archived salvage difficulty correction is invalid.`);
			}
		} else if (correction.kind === 'definition.questionPresentation') {
			const recoveredRawChallenge = structuredClone(raw);
			recoveredRawChallenge.definition.questionPresentation = null;
			if (
				pathway !== 'raw-question-presentation-null-default' ||
				correction.path !==
					`challenges[${correction.absoluteRowIndex}].definition.questionPresentation` ||
				Object.hasOwn(raw.definition ?? {}, 'questionPresentation') ||
				correction.from !== 'omitted' ||
				correction.to !== null ||
				recovered.definition?.questionPresentation !== null ||
				correction.recoveredRawChallengeSha256 !== canonicalHash(recoveredRawChallenge)
			) {
				throw new Error(`${shardId} archived salvage question-presentation correction is invalid.`);
			}
		} else {
			throw new Error(`${shardId} archived salvage correction kind is invalid.`);
		}
	}
}

function archivedTrackedJson({
	archiveRoot,
	tracked,
	path: archivePath,
	kind,
	expectedCanonicalSha256,
	expectedByteSha256 = null,
	label
}) {
	const record = tracked.find(
		(artifact) => artifact?.path === archivePath && artifact?.kind === kind
	);
	if (!record) throw new Error(`${label} is missing from the archive.`);
	const value = readJson(path.join(archiveRoot, archivePath));
	if (
		!sha256String(expectedCanonicalSha256) ||
		record.canonicalSha256 !== expectedCanonicalSha256 ||
		canonicalHash(value) !== expectedCanonicalSha256 ||
		(expectedByteSha256 !== null &&
			(record.sha256 !== expectedByteSha256 || !sha256String(expectedByteSha256)))
	) {
		throw new Error(`${label} differs from its immutable binding.`);
	}
	return value;
}

function archivedTrackedJsonReference({
	archiveRoot,
	tracked,
	external,
	reference,
	expectedCanonicalSha256,
	label
}) {
	const record = archivedReferenceRecord(reference, tracked, external, label);
	if (reference.storage !== 'tracked' || !record.path) {
		throw new Error(`${label} must be retained as tracked JSON.`);
	}
	const value = readJson(path.join(archiveRoot, record.path));
	if (
		record.canonicalSha256 !== expectedCanonicalSha256 ||
		canonicalHash(value) !== expectedCanonicalSha256
	) {
		throw new Error(`${label} differs from its immutable binding.`);
	}
	return value;
}

function archivedReferenceRecord(reference, tracked, external, label) {
	if (!reference || !['tracked', 'external'].includes(reference.storage)) {
		throw new Error(`${label} has no archived reference.`);
	}
	const record =
		reference.storage === 'tracked'
			? tracked.find(
					(artifact) => artifact?.path === reference.path && artifact?.kind === reference.kind
				)
			: external.find(
					(dependency) => dependency?.id === reference.id && dependency?.kind === reference.kind
				);
	if (!record) throw new Error(`${label} has no archived record.`);
	return record;
}

function validateSanitizedLineageArchive({
	filePath,
	expectedLineageSha256,
	expectedContentLineageSha256,
	expectedArtLineageSha256,
	sourceLineage,
	tracked,
	external,
	issues
}) {
	if (!existsSync(filePath)) return;
	const lineage = readJson(filePath);
	if (
		lineage.schemaVersion !== 'science-challenge-sanitized-lineage/v1' ||
		lineage.sourceLineageSha256 !== expectedLineageSha256 ||
		lineage.sourceContentLineageSha256 !== expectedContentLineageSha256 ||
		lineage.sourceArtLineageSha256 !== expectedArtLineageSha256
	) {
		issues.push('Sanitized lineage does not bind the expected release lineage.');
	}
	if (!Array.isArray(lineage.content) || lineage.content.length === 0) {
		issues.push('Sanitized lineage has no content shards.');
	}
	if (!Array.isArray(lineage.art) || lineage.art.length === 0) {
		issues.push('Sanitized lineage has no art jobs.');
	}
	if (canonicalHash(lineage.recovery ?? null) !== canonicalHash(sourceLineage?.recovery ?? null)) {
		issues.push('Sanitized recovery lineage differs from source lineage.');
	}
	for (const field of ['effectiveCohort', 'curriculumRemap', 'difficultyPlanAdjustment']) {
		if (canonicalHash(lineage[field] ?? null) !== canonicalHash(sourceLineage?.[field] ?? null)) {
			issues.push(`Sanitized ${field} binding differs from source lineage.`);
		}
	}
	const expectedDescendantRemaps = (sourceLineage?.content ?? [])
		.filter((shard) => shard?.descendantRemap)
		.map((shard) => ({
			shardId: shard.shardId,
			manifestSha256: shard.descendantRemap.manifestSha256,
			remapSha256: shard.descendantRemap.remapSha256,
			basePlanSha256: shard.descendantRemap.basePlanSha256,
			effectivePlanSha256: shard.descendantRemap.effectivePlanSha256
		}));
	if (canonicalHash(lineage.descendantRemaps ?? []) !== canonicalHash(expectedDescendantRemaps)) {
		issues.push('Sanitized descendant-remap summary differs from source lineage.');
	}
	const expectedDifficultyAdjustments = (sourceLineage?.content ?? [])
		.filter((shard) => shard?.difficultyPlanAdjustment)
		.map((shard) => ({
			shardId: shard.shardId,
			manifestSha256: shard.difficultyPlanAdjustment.manifestSha256,
			adjustmentSha256: shard.difficultyPlanAdjustment.adjustmentSha256 ?? null,
			adjustmentSetSha256: shard.difficultyPlanAdjustment.adjustmentSetSha256 ?? null,
			adjustmentCount: shard.difficultyPlanAdjustment.adjustmentCount ?? 1,
			basePlanSha256: shard.difficultyPlanAdjustment.basePlanSha256,
			effectivePlanSha256: shard.difficultyPlanAdjustment.effectivePlanSha256
		}));
	if (
		canonicalHash(lineage.difficultyPlanAdjustments ?? []) !==
		canonicalHash(expectedDifficultyAdjustments)
	) {
		issues.push('Sanitized difficulty-plan adjustment summary differs from source lineage.');
	}
	if (lineage.recovery) {
		const recoveryArtifact = tracked.find(
			(artifact) => artifact.path === 'content/verification-repair-recovery.json'
		);
		if (!recoveryArtifact || recoveryArtifact.canonicalSha256 !== lineage.recovery.sha256) {
			issues.push('Recovery lineage is not bound to the archived recovery manifest.');
		}
		const ledgerArtifact = tracked.find(
			(artifact) => artifact.path === 'content/verification-repair-execution-ledger.json'
		);
		if (
			!ledgerArtifact ||
			ledgerArtifact.canonicalSha256 !== lineage.recovery.executionLedgerSha256
		) {
			issues.push('Recovery lineage is not bound to the archived execution ledger.');
		}
	}
	validateSanitizedContentAgainstSource(lineage.content, sourceLineage?.content, issues);
	validateSanitizedDirectResponseModeLineage(lineage.content, issues);
	const visit = (value, parent = null, key = null) => {
		if (Array.isArray(value)) {
			for (const item of value) visit(item, value, null);
			return;
		}
		if (!value || typeof value !== 'object') return;
		for (const field of Object.keys(value)) {
			if (/Path$/.test(field))
				issues.push(`Sanitized lineage retains forbidden path field ${field}.`);
		}
		if (value.storage === 'tracked' || value.storage === 'external') {
			validateLineageReference(value, tracked, external, issues);
			if (key) validateReferenceHashBinding(parent, key, value, issues);
			return;
		}
		for (const [field, child] of Object.entries(value)) visit(child, value, field);
	};
	visit(lineage);
}

function validateSanitizedDirectResponseModeLineage(content, issues) {
	if (!Array.isArray(content)) return;
	for (const shard of content) {
		for (const run of shard?.runs ?? []) {
			if (run?.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT) {
				if (run?.responseMode !== null && run?.responseMode !== undefined) {
					issues.push(
						`${shard?.shardId ?? 'unknown shard'} non-direct run claims a response mode.`
					);
				}
				if (run?.thinkingLevel !== 'max') {
					issues.push(
						`${shard?.shardId ?? 'unknown shard'} non-direct run has an invalid thinkingLevel.`
					);
				}
				continue;
			}
			const multipart = Array.isArray(run.parts);
			const legacyStructured =
				(run.responseMode === null || run.responseMode === undefined) &&
				run.transportVersion ===
					(multipart
						? SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION
						: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION);
			const explicitStructured =
				run.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON &&
				run.transportVersion ===
					(multipart
						? SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION
						: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION);
			const promptJson =
				run.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
				run.transportVersion ===
					(multipart
						? SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION
						: SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION);
			const prefix = `${shard?.shardId ?? 'unknown shard'} direct run`;
			if (!legacyStructured && !explicitStructured && !promptJson) {
				issues.push(`${prefix} has an invalid responseMode/transportVersion tuple.`);
				continue;
			}
			if (run.thinkingLevel !== 'max' && !(promptJson && run.thinkingLevel === 'high')) {
				issues.push(`${prefix} has an invalid thinkingLevel for its response mode.`);
			}
			const expectedRequestKind = promptJson ? 'direct-prompt-json-request' : 'direct-json-request';
			const expectedEventKind = promptJson
				? 'direct-prompt-json-event-log'
				: 'direct-json-event-log';
			if (multipart) {
				const expectedRootEventKind = promptJson
					? 'direct-prompt-json-multipart-event-index'
					: 'direct-json-multipart-event-index';
				if (run.eventLogRef?.kind !== expectedRootEventKind || run.requestRef !== null) {
					issues.push(`${prefix} archive references do not match its multipart response mode.`);
				}
				for (const [index, part] of run.parts.entries()) {
					const exactPartMode = legacyStructured
						? (part?.responseMode === null || part?.responseMode === undefined) &&
							(part?.transportVersion === null || part?.transportVersion === undefined)
						: part?.responseMode === run.responseMode &&
							part?.transportVersion ===
								(promptJson
									? SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION
									: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION);
					if (
						!exactPartMode ||
						part?.thinkingLevel !== run.thinkingLevel ||
						part?.requestRef?.kind !== expectedRequestKind ||
						part?.eventLogRef?.kind !== expectedEventKind
					) {
						issues.push(
							`${prefix} part ${index + 1} does not match its response mode, thinking level or archive kinds.`
						);
					}
				}
			} else if (
				run.requestRef?.kind !== expectedRequestKind ||
				run.eventLogRef?.kind !== expectedEventKind
			) {
				issues.push(`${prefix} archive references do not match its response mode.`);
			}
		}
	}
}

function validateSanitizedContentAgainstSource(sanitizedContent, sourceContent, issues) {
	if (!Array.isArray(sanitizedContent) || !Array.isArray(sourceContent)) return;
	if (sanitizedContent.length !== sourceContent.length) {
		issues.push('Sanitized content lineage differs in shard count from source lineage.');
		return;
	}
	for (const [shardIndex, sourceShard] of sourceContent.entries()) {
		const sanitizedShard = sanitizedContent[shardIndex];
		if (
			sanitizedShard?.shardId !== sourceShard?.shardId ||
			sanitizedShard?.candidateSha256 !== sourceShard?.candidateSha256 ||
			sanitizedShard?.validationSha256 !== sourceShard?.validationSha256
		) {
			issues.push(`Sanitized content shard ${shardIndex + 1} differs from source lineage.`);
			continue;
		}
		if (
			canonicalHash(sanitizedSalvageProjection(sanitizedShard?.salvage)) !==
			canonicalHash(sourceSalvageProjection(sourceShard?.salvage))
		) {
			issues.push(
				`${sourceShard.shardId} sanitized multipart plan-drift salvage differs from source lineage.`
			);
		}
		if (
			canonicalHash(sanitizedContinuationProjection(sanitizedShard?.continuation)) !==
			canonicalHash(sourceContinuationProjection(sourceShard?.continuation))
		) {
			issues.push(
				`${sourceShard.shardId} sanitized multipart continuation differs from source lineage.`
			);
		}
		if (
			canonicalHash(sanitizedDescendantRemapProjection(sanitizedShard?.descendantRemap)) !==
			canonicalHash(sourceDescendantRemapProjection(sourceShard?.descendantRemap))
		) {
			issues.push(`${sourceShard.shardId} sanitized descendant remap differs from source lineage.`);
		}
		if (
			canonicalHash(
				sanitizedDifficultyPlanAdjustmentProjection(sanitizedShard?.difficultyPlanAdjustment)
			) !==
			canonicalHash(sourceDifficultyPlanAdjustmentProjection(sourceShard?.difficultyPlanAdjustment))
		) {
			issues.push(
				`${sourceShard.shardId} sanitized difficulty-plan adjustment differs from source lineage.`
			);
		}
		const sourceRuns = sourceShard.runSummaries ?? [];
		const sanitizedRuns = sanitizedShard.runs ?? [];
		if (!Array.isArray(sanitizedRuns) || sanitizedRuns.length !== sourceRuns.length) {
			issues.push(`${sourceShard.shardId} sanitized run count differs from source lineage.`);
			continue;
		}
		for (const [runIndex, sourceRun] of sourceRuns.entries()) {
			const sanitizedRun = sanitizedRuns[runIndex];
			const comparable = {
				kind: sanitizedRun?.kind,
				attempt: sanitizedRun?.attempt,
				sha256: sanitizedRun?.runSummarySha256,
				eventLogSha256: sanitizedRun?.eventLogSha256,
				lastMessageSha256: sanitizedRun?.lastMessageSha256,
				promptSha256: sanitizedRun?.promptSha256,
				candidateSha256: sanitizedRun?.candidateSha256,
				validationSha256: sanitizedRun?.validationSha256,
				inputSha256: sanitizedRun?.inputSha256,
				rawCandidateSha256: sanitizedRun?.rawCandidateSha256,
				normalizationVersion: sanitizedRun?.normalizationVersion,
				transport: sanitizedRun?.transport,
				responseMode: sanitizedRun?.responseMode ?? null,
				transportVersion: sanitizedRun?.transportVersion,
				provider: sanitizedRun?.provider,
				model: sanitizedRun?.model,
				modelVersion: sanitizedRun?.modelVersion,
				modelVersions: sanitizedRun?.modelVersions,
				directPartSize: sanitizedRun?.directPartSize,
				rowIds: sanitizedRun?.rowIds,
				thinkingLevel: sanitizedRun?.thinkingLevel,
				requestSha256: sanitizedRun?.requestSha256,
				thoughtsSha256: sanitizedRun?.thoughtsSha256,
				resultMetadataSha256: sanitizedRun?.resultMetadataSha256,
				status: sanitizedRun?.status,
				toolFree: sanitizedRun?.toolFree,
				repairEvidence: sanitizedRun?.repairEvidence
					? {
							verificationSummarySha256: sanitizedRun.repairEvidence.verificationSummarySha256,
							priorCandidateSha256: sanitizedRun.repairEvidence.priorCandidateSha256
						}
					: null,
				parts: (sanitizedRun?.parts ?? []).map(sanitizedPartProjection)
			};
			const sourceComparable = {
				kind: sourceRun.kind,
				attempt: sourceRun.attempt,
				sha256: sourceRun.sha256,
				eventLogSha256: sourceRun.eventLogSha256,
				lastMessageSha256: sourceRun.lastMessageSha256,
				promptSha256: sourceRun.promptSha256,
				candidateSha256: sourceRun.candidateSha256,
				validationSha256: sourceRun.validationSha256,
				inputSha256: sourceRun.inputSha256,
				rawCandidateSha256: sourceRun.rawCandidateSha256,
				normalizationVersion: sourceRun.normalizationVersion,
				transport: sourceRun.transport ?? 'codex-sdk',
				responseMode: sourceRun.responseMode ?? null,
				transportVersion: sourceRun.transportVersion ?? null,
				provider: sourceRun.provider ?? null,
				model: sourceRun.model,
				modelVersion: sourceRun.modelVersion ?? null,
				modelVersions: sourceRun.modelVersions ?? null,
				directPartSize: sourceRun.directPartSize ?? null,
				rowIds: sourceRun.rowIds ?? null,
				thinkingLevel: sourceRun.thinkingLevel,
				requestSha256: sourceRun.requestSha256 ?? null,
				thoughtsSha256: sourceRun.thoughtsSha256 ?? null,
				resultMetadataSha256: sourceRun.resultMetadataSha256 ?? null,
				status: sourceRun.status,
				toolFree: sourceRun.toolFree,
				repairEvidence: sourceRun.repairEvidence
					? {
							verificationSummarySha256: sourceRun.repairEvidence.verificationSummarySha256,
							priorCandidateSha256: sourceRun.repairEvidence.priorCandidateSha256
						}
					: null,
				parts: (sourceRun.parts ?? []).map(sourcePartProjection)
			};
			if (canonicalHash(comparable) !== canonicalHash(sourceComparable)) {
				issues.push(
					`${sourceShard.shardId} sanitized run ${runIndex + 1} differs from source lineage.`
				);
			}
		}
	}
}

function sanitizedDescendantRemapProjection(remap) {
	if (!remap) return null;
	return {
		schemaVersion: remap.schemaVersion,
		disposition: remap.disposition,
		basePlanSha256: remap.basePlanSha256,
		effectivePlanSha256: remap.effectivePlanSha256,
		remapSha256: remap.remapSha256,
		sourceAttempt: descendantRemapSourceAttemptProjection(remap.sourceAttempt),
		sourceAttemptStatus: remap.sourceAttemptStatus,
		canonicalVerifier: remap.canonicalVerifier,
		execution: {
			executionId: remap.execution?.executionId,
			identity: remap.execution?.identity,
			objectiveSha256: remap.execution?.objectiveSha256,
			claims: (remap.execution?.claims ?? []).map((claim) => ({
				attempt: claim.attempt,
				sha256: claim.sha256
			}))
		}
	};
}

function sanitizedDifficultyPlanAdjustmentProjection(adjustment) {
	if (!adjustment) return null;
	return {
		schemaVersion: adjustment.schemaVersion,
		disposition: adjustment.disposition,
		basePlanSha256: adjustment.basePlanSha256,
		effectivePlanSha256: adjustment.effectivePlanSha256,
		adjustmentSha256: adjustment.adjustmentSha256 ?? null,
		adjustmentSetSha256: adjustment.adjustmentSetSha256 ?? null,
		adjustmentCount: adjustment.adjustmentCount ?? 1,
		sourceAttempt: descendantRemapSourceAttemptProjection(adjustment.sourceAttempt),
		sourceAttemptStatus: adjustment.sourceAttemptStatus,
		canonicalVerifier: adjustment.canonicalVerifier,
		execution: {
			executionId: adjustment.execution?.executionId,
			identity: adjustment.execution?.identity,
			objectiveSha256: adjustment.execution?.objectiveSha256,
			claims: (adjustment.execution?.claims ?? []).map((claim) => ({
				attempt: claim.attempt,
				sha256: claim.sha256
			}))
		}
	};
}

function sourceDifficultyPlanAdjustmentProjection(adjustment) {
	return sanitizedDifficultyPlanAdjustmentProjection(adjustment);
}

function sourceDescendantRemapProjection(remap) {
	if (!remap) return null;
	return {
		schemaVersion: remap.schemaVersion,
		disposition: remap.disposition,
		basePlanSha256: remap.basePlanSha256,
		effectivePlanSha256: remap.effectivePlanSha256,
		remapSha256: remap.remapSha256,
		sourceAttempt: descendantRemapSourceAttemptProjection(remap.sourceAttempt),
		sourceAttemptStatus: remap.sourceAttemptStatus,
		canonicalVerifier: remap.canonicalVerifier,
		execution: {
			executionId: remap.execution?.executionId,
			identity: remap.execution?.identity,
			objectiveSha256: remap.execution?.objectiveSha256,
			claims: (remap.execution?.claims ?? []).map((claim) => ({
				attempt: claim.attempt,
				sha256: claim.sha256
			}))
		}
	};
}

function descendantRemapSourceAttemptProjection(sourceAttempt) {
	if (!sourceAttempt) return null;
	return {
		attempt: sourceAttempt.attempt,
		status: sourceAttempt.status,
		runStatus: sourceAttempt.runStatus,
		runSummarySha256: sourceAttempt.runSummarySha256,
		sourceValidationSha256: sourceAttempt.sourceValidationSha256,
		sourceCandidateSha256: sourceAttempt.sourceCandidateSha256,
		targetCandidateSha256: sourceAttempt.targetCandidateSha256,
		runPolicySha256: sourceAttempt.runPolicySha256,
		exactFileBindingsSha256: sourceAttempt.exactFileBindingsSha256
	};
}

function sanitizedSalvageProjection(salvage) {
	if (!salvage) return null;
	return {
		schemaVersion: salvage.schemaVersion,
		salvagePathway: salvage.salvagePathway ?? null,
		manifestSha256: salvage.manifestSha256,
		manifestFileSha256: salvage.manifestFileSha256,
		candidateSha256: salvage.candidateSha256,
		candidateFileSha256: salvage.candidateFileSha256,
		validationSha256: salvage.validationSha256,
		validationFileSha256: salvage.validationFileSha256,
		execution: {
			executionId: salvage.execution?.executionId,
			identity: salvage.execution?.identity,
			objectiveSha256: salvage.execution?.objectiveSha256,
			objectiveByteSha256: salvage.execution?.objectiveByteSha256,
			claims: (salvage.execution?.claims ?? []).map((claim) => ({
				attempt: claim.attempt,
				sha256: claim.sha256,
				byteSha256: claim.byteSha256
			}))
		},
		sourceAttempt: {
			attempt: salvage.sourceAttempt?.attempt,
			status: salvage.sourceAttempt?.status,
			runSummarySha256: salvage.sourceAttempt?.runSummarySha256,
			runSummaryFileSha256: salvage.sourceAttempt?.runSummaryFileSha256,
			validationSha256: salvage.sourceAttempt?.validationSha256,
			validationFileSha256: salvage.sourceAttempt?.validationFileSha256,
			eventLogSha256: salvage.sourceAttempt?.eventLogSha256,
			lastMessageSha256: salvage.sourceAttempt?.lastMessageSha256,
			candidateSha256: salvage.sourceAttempt?.candidateSha256 ?? null,
			candidateFileSha256: salvage.sourceAttempt?.candidateFileSha256 ?? null,
			promptSha256: salvage.sourceAttempt?.promptSha256,
			partRecords: (salvage.sourceAttempt?.parts ?? []).map(sanitizedPartProjection),
			responseMode: salvage.sourceAttempt?.responseMode ?? null,
			providerSchemaApplied: salvage.sourceAttempt?.providerSchemaApplied ?? null
		},
		repairEvidence: {
			verificationSummarySha256: salvage.repairEvidence?.verificationSummarySha256,
			verificationSummaryFileSha256: salvage.repairEvidence?.verificationSummaryFileSha256,
			priorCandidateSha256: salvage.repairEvidence?.priorCandidateSha256,
			priorCandidateFileSha256: salvage.repairEvidence?.priorCandidateFileSha256,
			priorValidationSha256: salvage.repairEvidence?.priorValidationSha256,
			priorValidationFileSha256: salvage.repairEvidence?.priorValidationFileSha256
		},
		sourceSelection: salvage.sourceSelection,
		sourceSelectionSha256: salvage.sourceSelectionSha256,
		corrections: salvage.corrections,
		salvageSourceSha256: salvage.salvageSourceSha256
	};
}

function sourceSalvageProjection(salvage) {
	if (!salvage) return null;
	return {
		schemaVersion: salvage.schemaVersion,
		salvagePathway: salvage.salvagePathway ?? null,
		manifestSha256: salvage.manifestSha256,
		manifestFileSha256: salvage.manifestFileSha256,
		candidateSha256: salvage.candidateSha256,
		candidateFileSha256: salvage.candidateFileSha256,
		validationSha256: salvage.validationSha256,
		validationFileSha256: salvage.validationFileSha256,
		execution: {
			executionId: salvage.execution?.executionId,
			identity: salvage.execution?.identity,
			objectiveSha256: salvage.execution?.objectiveSha256,
			objectiveByteSha256: salvage.execution?.objectiveByteSha256,
			claims: (salvage.execution?.claims ?? []).map((claim) => ({
				attempt: claim.attempt,
				sha256: claim.sha256,
				byteSha256: claim.byteSha256
			}))
		},
		sourceAttempt: {
			attempt: salvage.sourceAttempt?.attempt,
			status: salvage.sourceAttempt?.status,
			runSummarySha256: salvage.sourceAttempt?.runSummarySha256,
			runSummaryFileSha256: salvage.sourceAttempt?.runSummaryFileSha256,
			validationSha256: salvage.sourceAttempt?.validationSha256,
			validationFileSha256: salvage.sourceAttempt?.validationFileSha256,
			eventLogSha256: salvage.sourceAttempt?.eventLogSha256,
			lastMessageSha256: salvage.sourceAttempt?.lastMessageSha256,
			candidateSha256: salvage.sourceAttempt?.candidateSha256 ?? null,
			candidateFileSha256: salvage.sourceAttempt?.candidateFileSha256 ?? null,
			promptSha256: salvage.sourceAttempt?.promptSha256,
			partRecords: (salvage.sourceAttempt?.parts ?? salvage.sourceAttempt?.partRecords ?? []).map(
				sourcePartProjection
			),
			responseMode: salvage.sourceAttempt?.responseMode ?? null,
			providerSchemaApplied: salvage.sourceAttempt?.providerSchemaApplied ?? null
		},
		repairEvidence: {
			verificationSummarySha256: salvage.repairEvidence?.verificationSummarySha256,
			verificationSummaryFileSha256: salvage.repairEvidence?.verificationSummaryFileSha256,
			priorCandidateSha256: salvage.repairEvidence?.priorCandidateSha256,
			priorCandidateFileSha256: salvage.repairEvidence?.priorCandidateFileSha256,
			priorValidationSha256: salvage.repairEvidence?.priorValidationSha256,
			priorValidationFileSha256: salvage.repairEvidence?.priorValidationFileSha256
		},
		sourceSelection: salvage.sourceSelection,
		sourceSelectionSha256: salvage.sourceSelectionSha256,
		corrections: salvage.corrections,
		salvageSourceSha256: salvage.salvageSourceSha256
	};
}

function sanitizedContinuationProjection(continuation) {
	if (!continuation) return null;
	return {
		schemaVersion: continuation.schemaVersion,
		manifestSha256: continuation.manifestSha256,
		planSha256: continuation.planSha256,
		candidateSha256: continuation.candidateSha256,
		validationSha256: continuation.validationSha256,
		execution: {
			objectiveSha256: continuation.execution?.objectiveSha256,
			claims: (continuation.execution?.claims ?? []).map((claim) => ({
				partId: claim.partId,
				sha256: claim.sha256,
				byteSha256: claim.byteSha256,
				invocationSha256: claim.invocationSha256,
				invocationByteSha256: claim.invocationByteSha256
			}))
		},
		sourceAttempt: {
			attempt: continuation.sourceAttempt?.attempt,
			status: continuation.sourceAttempt?.status,
			sha256: continuation.sourceAttempt?.sha256,
			partsSha256: continuation.sourceAttempt?.partsSha256
		},
		continuationParts: (continuation.continuationParts ?? []).map((part) => ({
			partId: part.partId,
			claimSha256: part.claimSha256,
			evidenceSha256: part.evidenceSha256
		}))
	};
}

function sourceContinuationProjection(continuation) {
	if (!continuation) return null;
	return {
		schemaVersion: continuation.schemaVersion,
		manifestSha256: continuation.manifestSha256,
		planSha256: continuation.planSha256,
		candidateSha256: continuation.candidateSha256,
		validationSha256: continuation.validationSha256,
		execution: {
			objectiveSha256: continuation.execution?.objectiveSha256,
			claims: (continuation.execution?.claims ?? []).map((claim) => ({
				partId: claim.partId,
				sha256: claim.sha256,
				byteSha256: claim.byteSha256,
				invocationSha256: claim.invocationSha256,
				invocationByteSha256: claim.invocationByteSha256
			}))
		},
		sourceAttempt: {
			attempt: continuation.sourceAttempt?.attempt,
			status: continuation.sourceAttempt?.status,
			sha256: continuation.sourceAttempt?.sha256,
			partsSha256: continuation.sourceAttempt?.partsSha256
		},
		continuationParts: (continuation.continuationParts ?? []).map((part) => ({
			partId: part.partId,
			claimSha256: part.claimSha256,
			evidenceSha256: part.evidenceSha256
		}))
	};
}

function sanitizedPartProjection(part) {
	return {
		partId: part?.partId,
		index: part?.index,
		start: part?.start,
		end: part?.end,
		rowIds: part?.rowIds,
		inputSha256: part?.inputSha256,
		responseSchemaSha256: part?.responseSchemaSha256,
		promptSha256: part?.promptSha256,
		requestSha256: part?.requestSha256,
		eventLogSha256: part?.eventLogSha256,
		rawOutputSha256: part?.rawOutputSha256,
		rawCandidateSha256: part?.rawCandidateSha256,
		thoughtsSha256: part?.thoughtsSha256,
		resultMetadataSha256: part?.resultMetadataSha256,
		runSummarySha256: part?.runSummarySha256,
		status: part?.status,
		responseMode: part?.responseMode ?? null,
		transportVersion: part?.transportVersion ?? null,
		providerSchemaApplied: part?.providerSchemaApplied ?? null,
		provider: part?.provider,
		model: part?.model,
		modelVersion: part?.modelVersion,
		thinkingLevel: part?.thinkingLevel,
		usage: part?.usage,
		costUsd: part?.costUsd
	};
}

function sourcePartProjection(part) {
	return sanitizedPartProjection(part);
}

function validateLineageReference(reference, tracked, external, issues) {
	const record =
		reference.storage === 'tracked'
			? tracked.find(
					(artifact) => artifact.path === reference.path && artifact.kind === reference.kind
				)
			: external.find(
					(dependency) => dependency.id === reference.id && dependency.kind === reference.kind
				);
	if (!record) {
		issues.push(
			`Sanitized lineage reference is missing from the manifest: ${reference.path ?? reference.id}.`
		);
		return;
	}
	for (const field of ['sha256', 'bytes', 'canonicalSha256', 'eventCount']) {
		if (reference[field] !== undefined && reference[field] !== record[field]) {
			issues.push(
				`Sanitized lineage reference ${reference.path ?? reference.id} differs on ${field}.`
			);
		}
	}
}

function validateReferenceHashBinding(parent, key, reference, issues) {
	const base = key.replace(/Ref$/, '');
	const expected =
		parent[`${base}Sha256`] ??
		(key === 'jobRef' ? parent.sha256 : null) ??
		(key === 'ref' ? parent.sha256 : null) ??
		(key === 'repairEvidenceRef'
			? (parent.repairReviewSha256 ?? parent.repairPerceptualAuditSha256)
			: null);
	if (!expected) return;
	if (reference.sha256 !== expected && reference.canonicalSha256 !== expected) {
		issues.push(`Sanitized lineage ${key} does not match its declared SHA-256.`);
	}
}

function validateSanitizedIndex(filePath, validator, issues) {
	if (!existsSync(filePath)) return;
	try {
		issues.push(...validator(readJson(filePath)));
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
}

function exactKeys(value, allowed) {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		return ['row must be an object.'];
	const allowedSet = new Set(allowed);
	return Object.keys(value)
		.filter((key) => !allowedSet.has(key))
		.map((key) => `Forbidden field ${key} appears in a sanitized hash index.`);
}

function sourceDocumentHash(document) {
	for (const field of ['fileHash', 'fileSha256', 'file_hash', 'sha256', 'contentSha256']) {
		if (sha256String(document[field])) return document[field];
	}
	return canonicalHash(document);
}

function sanitizeContentPrompt(prompt, authoringInputSha256) {
	const marker = 'INPUT ROWS\n';
	const start = prompt.indexOf(marker);
	if (start < 0) throw new Error('Content prompt is missing the INPUT ROWS boundary.');
	const returnMarker = `\n\nReturn ${SCIENCE_CHALLENGE_BATCH_SCHEMA} JSON only.`;
	const end = prompt.indexOf(returnMarker, start + marker.length);
	if (end < 0) throw new Error('Content prompt is missing its post-input return instruction.');
	const replacement = `${marker}[official authoring input omitted from tracked archive; canonical SHA-256 ${authoringInputSha256}]`;
	return `${prompt.slice(0, start)}${replacement}${prompt.slice(end)}`;
}

function explicitOrCanonicalHash(value) {
	for (const field of ['contentSha256', 'content_sha256', 'sha256']) {
		if (sha256String(value[field])) return value[field];
	}
	return canonicalHash(value);
}

function sortBindings(bindings) {
	return Object.fromEntries(
		Object.entries(bindings).sort(([left], [right]) => left.localeCompare(right))
	);
}

function validateExpectedBindings(bindings) {
	if (!bindings || typeof bindings !== 'object' || Array.isArray(bindings)) {
		throw new Error('expectedBindings must be an object.');
	}
	for (const field of [
		'effectiveCohortManifestSha256',
		'effectiveCohortCandidateSetSha256',
		'contentParentLineageSha256',
		'curriculumRemapDurableReceiptSha256',
		'difficultyPlanAdjustmentVerifierInputSha256',
		'difficultyAdjustmentManifestSetSha256',
		'recoverySetSha256',
		'difficultyPlanAdjustmentDecisionSetSha256'
	]) {
		if (bindings[field] === undefined) bindings[field] = null;
	}
	const actualFields = Object.keys(bindings).sort();
	const expectedFields = [...PROVENANCE_BINDING_FIELDS].sort();
	if (actualFields.join('\n') !== expectedFields.join('\n')) {
		throw new Error('expectedBindings must contain exactly the provenance binding fields.');
	}
	for (const field of PROVENANCE_BINDING_FIELDS) {
		const optionalRecoveryField = [
			'effectiveCohortManifestSha256',
			'effectiveCohortCandidateSetSha256',
			'contentParentLineageSha256',
			'curriculumRemapVerifierInputSha256',
			'curriculumRemapDurableReceiptSha256',
			'descendantRemapManifestSetSha256',
			'curriculumRemapDecisionSetSha256',
			'difficultyPlanAdjustmentVerifierInputSha256',
			'difficultyAdjustmentManifestSetSha256',
			'recoverySetSha256',
			'difficultyPlanAdjustmentDecisionSetSha256'
		].includes(field);
		if (!(optionalRecoveryField && bindings[field] === null) && !sha256String(bindings[field])) {
			throw new Error(`expectedBindings.${field} is invalid.`);
		}
	}
	const cohortFields = [
		'effectiveCohortManifestSha256',
		'effectiveCohortCandidateSetSha256',
		'recoverySetSha256'
	];
	const remapFields = [
		'curriculumRemapVerifierInputSha256',
		'curriculumRemapDurableReceiptSha256',
		'descendantRemapManifestSetSha256',
		'curriculumRemapDecisionSetSha256'
	];
	const difficultyFields = [
		'difficultyPlanAdjustmentVerifierInputSha256',
		'difficultyAdjustmentManifestSetSha256',
		'difficultyPlanAdjustmentDecisionSetSha256'
	];
	const cohortBindingCount = cohortFields.filter((field) => sha256String(bindings[field])).length;
	const remapBindingCount = remapFields.filter((field) => sha256String(bindings[field])).length;
	const difficultyBindingCount = difficultyFields.filter((field) =>
		sha256String(bindings[field])
	).length;
	const parentChainBound = sha256String(bindings.contentParentLineageSha256);
	if (cohortBindingCount !== 0 && cohortBindingCount !== cohortFields.length) {
		throw new Error('expectedBindings effective-cohort hashes must be null or complete.');
	}
	if (remapBindingCount !== 0 && remapBindingCount !== remapFields.length) {
		throw new Error('expectedBindings descendant-remap hashes must be null or complete.');
	}
	if (difficultyBindingCount !== 0 && difficultyBindingCount !== difficultyFields.length) {
		throw new Error('expectedBindings difficulty-plan adjustment hashes must be null or complete.');
	}
	if (
		Boolean(cohortBindingCount) !==
		Boolean(remapBindingCount || difficultyBindingCount || parentChainBound)
	) {
		throw new Error(
			'expectedBindings effective-cohort hashes and recovery or parent-chain hashes must be present together.'
		);
	}
	if (parentChainBound && (remapBindingCount || difficultyBindingCount)) {
		throw new Error(
			'expectedBindings review-rebase parent-chain and typed recovery hashes are mutually exclusive.'
		);
	}
}

function assertBinding(field, actual, expected) {
	if (actual !== expected) throw new Error(`${field} differs from the expected release binding.`);
}

function portableRelative(root, target, label) {
	const relative = path.relative(path.resolve(root), path.resolve(target));
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error(`${label} is outside its exact root.`);
	}
	return relative.split(path.sep).join('/');
}

function fileRecord(kind, filePath, archiveRoot) {
	const bytes = readFileSync(filePath);
	const record = {
		kind,
		path: path.relative(archiveRoot, filePath).split(path.sep).join('/'),
		sha256: sha256(bytes),
		bytes: bytes.length
	};
	if (path.extname(filePath).toLowerCase() === '.json') {
		try {
			record.canonicalSha256 = canonicalHash(JSON.parse(bytes.toString('utf8')));
		} catch {
			// JSON-shaped final-message files are validated by their owning release phase. A malformed
			// failed-attempt payload remains useful byte evidence but has no canonical JSON hash.
		}
	}
	return record;
}

function bindSource(bindings, sourcePath, record) {
	const key = path.resolve(sourcePath);
	const records = bindings.get(key) ?? [];
	records.push(record);
	bindings.set(key, records);
}

function referenceFor(workspaceRoot, bindings, sourcePath, expectedSha256, label) {
	const key = path.resolve(workspaceRoot, sourcePath);
	const candidates = bindings.get(key) ?? [];
	const record = candidates.find(
		(candidate) =>
			candidate.sha256 === expectedSha256 || candidate.canonicalSha256 === expectedSha256
	);
	if (!record) throw new Error(`${label} has no archived artifact matching ${expectedSha256}.`);
	return artifactReference(record);
}

function artifactReference(record) {
	return record.path
		? {
				storage: 'tracked',
				kind: record.kind,
				path: record.path,
				sha256: record.sha256,
				bytes: record.bytes,
				...(record.canonicalSha256 ? { canonicalSha256: record.canonicalSha256 } : {})
			}
		: {
				storage: 'external',
				kind: record.kind,
				id: record.id,
				sha256: record.sha256,
				bytes: record.bytes,
				...(record.canonicalSha256 ? { canonicalSha256: record.canonicalSha256 } : {}),
				...(record.eventCount !== undefined ? { eventCount: record.eventCount } : {})
			};
}

function contentAttemptId(run) {
	const prefix = run.kind === 'independent-verification-repair' ? 'verification-repair' : 'attempt';
	if (prefix === 'attempt') return `attempt-${String(run.attempt).padStart(2, '0')}`;
	const repairHash = run.repairEvidence?.verificationSummarySha256;
	if (!sha256String(repairHash)) throw new Error('Content repair lineage has no review hash.');
	return `verification-repair-${repairHash.slice(0, 12)}-attempt-${String(run.attempt).padStart(2, '0')}`;
}

function compareRecords(left, right) {
	const leftKey = `${left.kind}:${left.path ?? left.id}`;
	const rightKey = `${right.kind}:${right.path ?? right.id}`;
	return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function countJsonLines(bytes, filePath) {
	const lines = bytes.toString('utf8').split(/\r?\n/).filter(Boolean);
	for (const line of lines) {
		try {
			JSON.parse(line);
		} catch {
			throw new Error(`Event log contains invalid JSONL: ${filePath}`);
		}
	}
	if (lines.length === 0) throw new Error(`Event log is empty: ${filePath}`);
	return lines.length;
}

function sortedFileNames(directory) {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.sort();
}

function sortedDirectories(directory) {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

function isAttemptDirectory(name) {
	return (
		/^attempt-\d{2}$/.test(name) ||
		/^verification-repair-[a-f0-9]{12}-attempt-\d{2}$/.test(name) ||
		/^repair-[a-f0-9]{12}-attempt-\d{2}$/.test(name)
	);
}

function verificationRepairAttemptNumber(name) {
	const match = String(name).match(VERIFICATION_REPAIR_ATTEMPT_DIRECTORY);
	return match ? Number(match[2]) : null;
}

function isPromptJsonSingleSummary(summary) {
	return (
		summary &&
		typeof summary === 'object' &&
		!Array.isArray(summary) &&
		summary.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
		summary.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
		summary.transportVersion === SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION
	);
}

function isPromptJsonMultipartSummary(summary) {
	return (
		summary &&
		typeof summary === 'object' &&
		!Array.isArray(summary) &&
		summary.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
		summary.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
		summary.transportVersion === SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION
	);
}

function resolveArchiveRoot(rootDir, archiveRoot) {
	const resolved = path.resolve(rootDir, archiveRoot);
	if (!isWithin(rootDir, resolved)) throw new Error('archiveRoot must stay inside the workspace.');
	if (existsSync(resolved) && readdirSync(resolved).length > 0) {
		throw new Error('archiveRoot must be empty before provenance is materialized.');
	}
	mkdirSync(resolved, { recursive: true });
	return resolved;
}

function listRelativeFiles(root) {
	const files = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const absolute = path.join(directory, entry.name);
			const relative = path.relative(root, absolute).split(path.sep).join('/');
			if (entry.isSymbolicLink()) {
				throw new Error(`Symlink is forbidden in the provenance archive: ${relative}.`);
			}
			if (entry.isDirectory()) visit(absolute);
			else if (entry.isFile()) files.push(relative);
			else
				throw new Error(`Non-regular entry is forbidden in the provenance archive: ${relative}.`);
		}
	};
	visit(root);
	return files.sort();
}

function requiredWorkspaceFile(rootDir, filePath, label) {
	if (!nonEmpty(filePath)) throw new Error(`${label} path is required.`);
	const resolved = path.resolve(rootDir, filePath);
	if (!existsSync(resolved)) {
		if (!isWithin(path.resolve(rootDir), resolved)) {
			throw new Error(`${label} must stay inside the workspace.`);
		}
		throw new Error(`${label} is missing: ${path.relative(rootDir, resolved)}`);
	}
	const stats = lstatSync(resolved);
	if (
		stats.isSymbolicLink() ||
		!stats.isFile() ||
		!isWithin(realpathSync(rootDir), realpathSync(resolved))
	) {
		throw new Error(`${label} must be a regular file contained in the workspace.`);
	}
	return resolved;
}

function requiredWorkspaceDirectory(rootDir, directory, label) {
	if (!nonEmpty(directory)) throw new Error(`${label} path is required.`);
	const resolved = path.resolve(rootDir, directory);
	if (!existsSync(resolved)) {
		if (!isWithin(path.resolve(rootDir), resolved)) {
			throw new Error(`${label} must stay inside the workspace.`);
		}
		throw new Error(`${label} is missing: ${path.relative(rootDir, resolved)}`);
	}
	const stats = lstatSync(resolved);
	if (
		stats.isSymbolicLink() ||
		!stats.isDirectory() ||
		!isWithin(realpathSync(rootDir), realpathSync(resolved))
	) {
		throw new Error(`${label} must be a real directory contained in the workspace.`);
	}
	return resolved;
}

function safeArchivePath(value) {
	if (!nonEmpty(value)) throw new Error('Archive path is required.');
	const normalized = path.posix.normalize(String(value).replaceAll('\\', '/'));
	if (normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) {
		throw new Error(`Archive path escapes its root: ${value}`);
	}
	return normalized;
}

function safeFilename(value) {
	if (!nonEmpty(value) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
		throw new Error(`Unsafe archive filename: ${value}`);
	}
	return value;
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeDependencyId(value) {
	if (!nonEmpty(value) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
		throw new Error(`Unsafe dependency id: ${value}`);
	}
	return value;
}

function safeId(value) {
	return typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function requiredId(value, label) {
	if (!nonEmpty(value)) throw new Error(`${label} is required.`);
	return String(value);
}

function requiredSha256(value, label) {
	if (!sha256String(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
	return value;
}

function hashIdentifier(value) {
	return createHash('sha256').update(String(value)).digest('hex');
}

function nullableSha256(value) {
	return value === null || sha256String(value);
}

function sha256String(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function validIsoDate(value) {
	return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function isWithin(root, candidate) {
	return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function failed(issues) {
	return { status: 'failed', issues };
}
