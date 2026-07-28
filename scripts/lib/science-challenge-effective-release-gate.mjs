import {
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY,
	findScienceChallengeCurriculumRemapDurableLeaks,
	validateScienceChallengeCurriculumRemapDurableReceipt
} from './science-challenge-curriculum-remap-durable.mjs';
import {
	SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SCHEMA,
	validateScienceChallengeReviewRebaseSuccessorLineage
} from './science-challenge-effective-cohort.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY,
	validateScienceChallengeDifficultyPlanAdjustmentVerifierInput
} from './science-challenge-difficulty-plan-adjustment-review.mjs';
import { validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding } from './science-challenge-review-rebase-infra-recovery.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

const HASH = /^[a-f0-9]{64}$/u;

/**
 * Final source-safe gate between fresh full-cohort review and materialization.
 * The rich verifier packet is intentionally not an input; only its frozen hash survives.
 */
export function validateScienceChallengeEffectiveReleaseGate({
	effectiveCohort,
	basePlan,
	effectivePlan,
	contentVerification,
	curriculumRemapVerifierInput = null,
	curriculumRemapVerifierInputSha256 = null,
	difficultyPlanAdjustmentVerifierInput = null,
	reviewRebaseEvidence = null,
	reviewRebaseInfrastructureRecoveryEvidence = null,
	reviewRebaseInfrastructureRecoveryArchiveClosure = null
}) {
	const issues = [];
	if (
		effectiveCohort?.status !== 'passed' ||
		effectiveCohort?.manifest?.schemaVersion !== SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SCHEMA ||
		!Array.isArray(effectiveCohort?.candidateSet)
	) {
		return failed('A replayed effective cohort is required.');
	}
	if (!isRecord(basePlan) || !Array.isArray(basePlan.rows)) {
		issues.push('The exact base plan is required.');
	}
	if (!isRecord(effectivePlan) || !Array.isArray(effectivePlan.rows)) {
		issues.push('The exact effective plan is required.');
	}
	if (!isRecord(contentVerification)) {
		issues.push('The fresh full-cohort content verification is required.');
	}
	if (issues.length) return failed(issues);

	const manifest = effectiveCohort.manifest;
	const hasReviewRebaseAncestry = manifest.parentChain?.kind === 'review-rebase-successor';
	const hasReviewRebaseInfrastructureRecovery = isRecord(manifest.infrastructureRecovery);
	let reviewRebaseLineage = null;
	if (hasReviewRebaseInfrastructureRecovery) {
		try {
			validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(
				manifest.infrastructureRecovery
			);
		} catch (error) {
			issues.push(
				`Effective release infrastructure-recovery binding is invalid: ${error instanceof Error ? error.message : String(error)}`
			);
		}
		if (!hasReviewRebaseAncestry) {
			issues.push(
				'Infrastructure-recovery binding is disconnected from review-rebase successor ancestry.'
			);
		}
	}
	if (hasReviewRebaseAncestry) {
		reviewRebaseLineage = validateScienceChallengeReviewRebaseSuccessorLineage({
			effectiveCohort,
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence,
			reviewRebaseInfrastructureRecoveryArchiveClosure
		});
		if (reviewRebaseLineage.status !== 'passed') {
			issues.push(
				'Effective release requires the complete authenticated review-rebase successor chain.',
				...reviewRebaseLineage.issues
			);
		}
		if (
			hasReviewRebaseInfrastructureRecovery &&
			(reviewRebaseLineage.status !== 'passed' ||
				canonicalHash(
					reviewRebaseLineage.rootSuccessor?.manifest?.infrastructureRecovery ?? null
				) !== canonicalHash(manifest.infrastructureRecovery) ||
				canonicalHash(reviewRebaseLineage.infrastructureRecoveryTerminal?.binding ?? null) !==
					canonicalHash(manifest.infrastructureRecovery))
		) {
			issues.push(
				'Effective release requires exact nine-field infrastructure-recovery terminal replay.'
			);
		}
	} else if (
		reviewRebaseEvidence !== null ||
		reviewRebaseInfrastructureRecoveryEvidence !== null ||
		reviewRebaseInfrastructureRecoveryArchiveClosure !== null
	) {
		issues.push('Review-rebase evidence is unassigned to this effective cohort.');
	}
	const boundCurriculumRemapVerifierInputSha256 = curriculumRemapVerifierInput
		? canonicalHash(curriculumRemapVerifierInput)
		: curriculumRemapVerifierInputSha256;
	const difficultyPlanAdjustmentVerifierInputSha256 = difficultyPlanAdjustmentVerifierInput
		? canonicalHash(difficultyPlanAdjustmentVerifierInput)
		: null;
	if (
		manifest.remapCount > 0 &&
		!HASH.test(String(boundCurriculumRemapVerifierInputSha256 ?? ''))
	) {
		issues.push('The curriculum-remap verifier-input hash is required.');
	}
	if (
		manifest.remapCount === 0 &&
		(curriculumRemapVerifierInput !== null || curriculumRemapVerifierInputSha256 !== null)
	) {
		issues.push('A curriculum-remap verifier input is unassigned to this cohort.');
	}
	if (manifest.difficultyAdjustmentCount > 0 && !difficultyPlanAdjustmentVerifierInput) {
		issues.push('The difficulty-plan adjustment verifier input is required.');
	}
	if (manifest.difficultyAdjustmentCount === 0 && difficultyPlanAdjustmentVerifierInput !== null) {
		issues.push('A difficulty-plan adjustment verifier input is unassigned to this cohort.');
	}
	const expectedIds = effectivePlan.rows.map((row) => row.id);
	const candidateIds = effectiveCohort.candidateSet.map((entry) => entry?.definition?.id);
	const expectedChallengeCount = effectivePlan.rows.length;
	const expectedShardCount = new Set(effectivePlan.rows.map((row) => row.shard)).size;
	if (
		expectedChallengeCount === 0 ||
		expectedShardCount === 0 ||
		basePlan.rows.length !== expectedChallengeCount ||
		manifest.shardCount !== expectedShardCount ||
		manifest.challengeCount !== expectedChallengeCount ||
		manifest.candidateCount !== expectedChallengeCount ||
		effectiveCohort.candidateSet.length !== expectedChallengeCount
	) {
		issues.push('Effective release requires the complete non-empty cohort bound by its plans.');
	}
	if (
		manifest.basePlanSha256 !== canonicalHash(basePlan) ||
		manifest.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		effectiveCohort.candidateSetSha256 !== canonicalHash(effectiveCohort.candidateSet) ||
		manifest.candidateSetSha256 !== effectiveCohort.candidateSetSha256 ||
		!Array.isArray(effectiveCohort.recoveries) ||
		manifest.recoverySetSha256 !== canonicalHash(effectiveCohort.recoveries) ||
		candidateIds.some((id, index) => id !== expectedIds[index])
	) {
		issues.push('Effective release cohort differs from its exact plan or candidate binding.');
	}

	if (
		contentVerification.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		contentVerification.status !== 'passed' ||
		contentVerification.planId !== effectivePlan.planId ||
		contentVerification.planSha256 !== canonicalHash(effectivePlan) ||
		(contentVerification.basePlanSha256 ?? contentVerification.planSha256) !==
			canonicalHash(basePlan) ||
		(contentVerification.effectivePlanSha256 ?? contentVerification.planSha256) !==
			canonicalHash(effectivePlan) ||
		contentVerification.candidateSetSha256 !== effectiveCohort.candidateSetSha256 ||
		(hasReviewRebaseAncestry &&
			contentVerification.effectiveCohortManifestSha256 !== canonicalHash(manifest)) ||
		(hasReviewRebaseAncestry &&
			reviewRebaseLineage?.priorVerificationSha256s?.includes(
				canonicalHash(contentVerification)
			)) ||
		(hasReviewRebaseAncestry &&
			[
				'reviewRebaseManifestSha256',
				'reviewRebaseId',
				'reviewRebaseCandidateSetSha256',
				'reviewRebaseCollectionValidationSha256',
				'reviewRebaseCollectionRemediationSetSha256',
				'reviewRebaseCollectionRemediations',
				'reviewRebaseCollectionRemediationTargetIds',
				'reviewRebaseCollectionRemediationTargetSetSha256'
			].some((field) => contentVerification[field] !== undefined)) ||
		(hasReviewRebaseInfrastructureRecovery
			? contentVerification.reviewRebaseInfrastructureRecoveryManifestSha256 !==
					manifest.infrastructureRecovery.manifestSha256 ||
				contentVerification.reviewRebaseInfrastructureRecoveryId !==
					manifest.infrastructureRecovery.recoveryId
			: [
					'reviewRebaseInfrastructureRecoveryManifestSha256',
					'reviewRebaseInfrastructureRecoveryId'
				].some((field) => contentVerification[field] !== undefined)) ||
		contentVerification.assignmentCount !== expectedShardCount ||
		contentVerification.reviewCount !== expectedChallengeCount ||
		contentVerification.acceptedCount !== expectedChallengeCount ||
		contentVerification.rejectedCount !== 0 ||
		!Array.isArray(contentVerification.assignmentResults) ||
		contentVerification.assignmentResults.length !== expectedShardCount ||
		contentVerification.assignmentResults.some((result) => result?.status !== 'passed') ||
		!Array.isArray(contentVerification.reviews) ||
		contentVerification.reviews.length !== expectedChallengeCount ||
		!Array.isArray(contentVerification.issues) ||
		contentVerification.issues.length !== 0
	) {
		issues.push('Fresh content verification is not one complete accepted plan-bound pass.');
	}
	const acceptedIds = new Set();
	for (const review of contentVerification.reviews ?? []) {
		if (
			!review ||
			review.accepted !== true ||
			typeof review.id !== 'string' ||
			acceptedIds.has(review.id)
		) {
			issues.push('Fresh content verification contains a rejected or duplicate review.');
			continue;
		}
		acceptedIds.add(review.id);
	}
	if (
		acceptedIds.size !== expectedChallengeCount ||
		expectedIds.some((id) => !acceptedIds.has(id))
	) {
		issues.push('Fresh content verification does not accept every effective-plan id exactly once.');
	}

	const receipt =
		contentVerification[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY] ?? null;
	if (manifest.remapCount > 0) {
		const receiptValidation = validateScienceChallengeCurriculumRemapDurableReceipt(receipt);
		if (
			receiptValidation.status !== 'passed' ||
			findScienceChallengeCurriculumRemapDurableLeaks(receipt).length > 0 ||
			canonicalHash(receipt) !==
				contentVerification[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY] ||
			receipt.basePlanSha256 !== canonicalHash(basePlan) ||
			receipt.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
			receipt.effectiveCohortManifestSha256 !== canonicalHash(manifest) ||
			receipt.candidateCount !== expectedChallengeCount ||
			receipt.candidateSetSha256 !== effectiveCohort.candidateSetSha256 ||
			receipt.remapManifestSetSha256 !== manifest.remapManifestSetSha256 ||
			receipt.recoverySetSha256 !== manifest.recoverySetSha256 ||
			receipt.verifierInputSha256 !== boundCurriculumRemapVerifierInputSha256 ||
			(difficultyPlanAdjustmentVerifierInput &&
				receipt.recoverySetSha256 !== difficultyPlanAdjustmentVerifierInput.recoverySetSha256) ||
			(curriculumRemapVerifierInput &&
				(receipt.recoverySetSha256 !== curriculumRemapVerifierInput.recoverySetSha256 ||
					curriculumRemapVerifierInput.recoverySetSha256 !==
						canonicalHash(curriculumRemapVerifierInput.recoveries) ||
					curriculumRemapVerifierInput.recoverySetSha256 !== manifest.recoverySetSha256 ||
					canonicalHash(curriculumRemapVerifierInput.recoveries) !==
						canonicalHash(effectiveCohort.recoveries) ||
					curriculumRemapVerifierInput.effectiveCohortManifestSha256 !==
						canonicalHash(manifest))) ||
			receipt.remaps.length !== manifest.remapCount ||
			receipt.remaps.some((remap) => remap.decision?.accepted !== true)
		) {
			issues.push(
				'Sanitized curriculum-remap receipt is missing, stale, source-rich or not fully accepted.',
				...(receiptValidation.issues ?? [])
			);
		}
	} else if (
		receipt !== null ||
		contentVerification[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY] !==
			undefined
	) {
		issues.push('Fresh content verification contains an unassigned curriculum-remap receipt.');
	}

	let difficultyPlanAdjustmentDecisionSetSha256 = null;
	let acceptedDifficultyPlanAdjustmentDecisionCount = 0;
	if (difficultyPlanAdjustmentVerifierInput) {
		const verifierInputValidation = validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(
			difficultyPlanAdjustmentVerifierInput,
			{ basePlan, effectivePlan }
		);
		issues.push(
			...verifierInputValidation.issues.map(
				(issue) => `Difficulty-plan adjustment verifier input: ${issue}`
			)
		);
		const proposals = difficultyPlanAdjustmentVerifierInput.proposals ?? [];
		const decisions = (contentVerification.reviews ?? []).flatMap(
			(review) => review?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY] ?? []
		);
		const decisionsByChallengeId = new Map();
		for (const decision of decisions) {
			const matches = decisionsByChallengeId.get(decision?.challengeId) ?? [];
			matches.push(decision);
			decisionsByChallengeId.set(decision?.challengeId, matches);
		}
		const orderedDecisions = [];
		for (const proposal of proposals) {
			const matches = decisionsByChallengeId.get(proposal.challengeId) ?? [];
			const decision = matches[0];
			if (
				matches.length !== 1 ||
				decision?.challengeId !== proposal.challengeId ||
				decision?.field !== proposal.field ||
				decision?.from !== proposal.from ||
				decision?.to !== proposal.to ||
				decision?.accepted !== true
			) {
				issues.push(
					`Difficulty-plan adjustment ${proposal.challengeId} lacks one exact accepted decision.`
				);
			} else {
				orderedDecisions.push(decision);
			}
		}
		if (
			decisions.length !== proposals.length ||
			orderedDecisions.length !== proposals.length ||
			contentVerification.difficultyPlanAdjustmentVerifierInputSha256 !==
				difficultyPlanAdjustmentVerifierInputSha256 ||
			contentVerification.acceptedDifficultyPlanAdjustmentDecisionCount !== proposals.length ||
			contentVerification.rejectedDifficultyPlanAdjustmentDecisionCount !== 0 ||
			manifest.difficultyAdjustmentCount !== proposals.length ||
			difficultyPlanAdjustmentVerifierInput.effectiveCohortManifestSha256 !==
				canonicalHash(manifest) ||
			difficultyPlanAdjustmentVerifierInput.candidateCount !== expectedChallengeCount ||
			difficultyPlanAdjustmentVerifierInput.candidateSetSha256 !==
				effectiveCohort.candidateSetSha256 ||
			difficultyPlanAdjustmentVerifierInput.adjustmentManifestSetSha256 !==
				manifest.difficultyAdjustmentManifestSetSha256 ||
			difficultyPlanAdjustmentVerifierInput.recoverySetSha256 !== manifest.recoverySetSha256 ||
			difficultyPlanAdjustmentVerifierInput.recoverySetSha256 !==
				canonicalHash(difficultyPlanAdjustmentVerifierInput.recoveries) ||
			canonicalHash(difficultyPlanAdjustmentVerifierInput.recoveries) !==
				canonicalHash(effectiveCohort.recoveries) ||
			contentVerification.recoverySetSha256 !==
				difficultyPlanAdjustmentVerifierInput.recoverySetSha256 ||
			(curriculumRemapVerifierInput &&
				curriculumRemapVerifierInput.recoverySetSha256 !==
					difficultyPlanAdjustmentVerifierInput.recoverySetSha256)
		) {
			issues.push(
				'Fresh content verification does not exactly accept the bound difficulty-plan adjustment set.'
			);
		}
		acceptedDifficultyPlanAdjustmentDecisionCount = orderedDecisions.length;
		difficultyPlanAdjustmentDecisionSetSha256 = canonicalHash(orderedDecisions);
	} else {
		const decisions = (contentVerification.reviews ?? []).flatMap(
			(review) => review?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY] ?? []
		);
		if (
			decisions.length !== 0 ||
			contentVerification.difficultyPlanAdjustmentVerifierInputSha256 !== undefined ||
			(contentVerification.acceptedDifficultyPlanAdjustmentDecisionCount ?? 0) !== 0 ||
			(contentVerification.rejectedDifficultyPlanAdjustmentDecisionCount ?? 0) !== 0
		) {
			issues.push(
				'Fresh content verification contains an unassigned difficulty-plan adjustment decision.'
			);
		}
	}

	return issues.length
		? failed(issues)
		: {
				status: 'passed',
				issues: [],
				candidateSetSha256: effectiveCohort.candidateSetSha256,
				effectiveCohortManifestSha256: canonicalHash(manifest),
				curriculumRemapDurableReceipt: receipt,
				curriculumRemapDurableReceiptSha256: receipt ? canonicalHash(receipt) : null,
				difficultyPlanAdjustmentVerifierInputSha256,
				difficultyPlanAdjustmentDecisionSetSha256,
				acceptedDifficultyPlanAdjustmentDecisionCount,
				contentParentLineage: reviewRebaseLineage?.parentChain ?? null,
				contentParentLineageSha256: reviewRebaseLineage?.parentChainSha256 ?? null,
				infrastructureRecovery:
					reviewRebaseLineage?.rootSuccessor?.manifest?.infrastructureRecovery ?? null,
				infrastructureRecoveryTerminal: reviewRebaseLineage?.infrastructureRecoveryTerminal ?? null
			};
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failed(value) {
	return {
		status: 'failed',
		issues: Array.isArray(value) ? value : [value]
	};
}
