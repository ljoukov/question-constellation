import path from 'node:path';

import { canonicalHash } from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY,
	validateScienceChallengeCurriculumRemapProposalEvidenceList,
	validateScienceChallengeCurriculumRemapProposals
} from './science-challenge-curriculum-remap-review.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY,
	validateScienceChallengeDifficultyPlanAdjustmentProposalEvidenceList,
	validateScienceChallengeDifficultyPlanAdjustmentProposals
} from './science-challenge-difficulty-plan-adjustment-review.mjs';
import {
	validateScienceChallengeVerifierDispatchLedger
} from './science-challenge-verifier-dispatch.mjs';

export const SCIENCE_CHALLENGE_VERIFIER_PACKET_MANIFEST_SCHEMA =
	'science-challenge-verifier-work-packet-manifest/v1';
export const SCIENCE_CHALLENGE_VERIFIER_PACKET_SCHEMA = 'science-challenge-verifier-work-packet/v1';

const ASSIGNMENT_INDEX_SCHEMA = 'science-challenge-verification-assignment-index/v1';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REVIEW_RUBRIC_PATH = 'docs/challenges/generated-science-verification.md';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_INDEX_FIELDS = Object.freeze([
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'reviewRebaseCandidateSetSha256',
	'reviewRebaseCollectionValidationSha256',
	'reviewRebaseCollectionRemediationSetSha256',
	'reviewRebaseCollectionRemediations',
	'reviewRebaseCollectionRemediationTargetIds',
	'reviewRebaseCollectionRemediationTargetSetSha256'
]);
export const SCIENCE_CHALLENGE_REVIEW_REBASE_ASSIGNMENT_FIELDS = Object.freeze([
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'reviewRebaseCandidateSetSha256',
	'reviewRebaseCollectionRemediationSetSha256',
	'reviewRebaseCollectionRemediations'
]);
export const SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_INDEX_FIELDS = Object.freeze([
	'reviewRebaseInfrastructureRecoveryManifestSha256',
	'reviewRebaseInfrastructureRecoveryId'
]);

export function validateScienceChallengeReviewRebaseInfrastructureRecoveryIndexBinding(
	assignmentIndex
) {
	const issues = [];
	const presentFields = SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_INDEX_FIELDS.filter(
		(field) => assignmentIndex?.[field] !== undefined
	);
	if (presentFields.length === 0) {
		return { status: 'passed', issues: [], infrastructureRecoveryMode: false };
	}
	if (
		presentFields.length !==
		SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_INDEX_FIELDS.length
	) {
		return {
			status: 'failed',
			issues: [
				'assignment index review-rebase infrastructure-recovery fields must be present all-or-none.'
			],
			infrastructureRecoveryMode: true
		};
	}
	for (const field of SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_INDEX_FIELDS) {
		if (!SHA256_PATTERN.test(String(assignmentIndex?.[field] ?? ''))) {
			issues.push(`assignment index ${field} must be a canonical SHA-256.`);
		}
	}
	if (!SHA256_PATTERN.test(String(assignmentIndex?.effectiveCohortManifestSha256 ?? ''))) {
		issues.push(
			'assignment index review-rebase infrastructure recovery requires an effective-cohort manifest SHA-256.'
		);
	}
	if (assignmentIndex?.recoverySetSha256 !== canonicalHash([])) {
		issues.push(
			'assignment index review-rebase infrastructure recovery requires the canonical empty typed recovery-set SHA-256.'
		);
	}
	const directReviewRebaseFields = SCIENCE_CHALLENGE_REVIEW_REBASE_INDEX_FIELDS.filter(
		(field) => assignmentIndex?.[field] !== undefined
	);
	if (directReviewRebaseFields.length > 0) {
		issues.push(
			'assignment index review-rebase infrastructure recovery is an effective-successor binding and cannot be direct review-rebase authority.'
		);
	}
	if (
		assignmentIndex?.curriculumRemapVerifierInputSha256 !== undefined ||
		assignmentIndex?.difficultyPlanAdjustmentVerifierInputSha256 !== undefined ||
		(assignmentIndex?.assignments ?? []).some(
			(assignment) =>
				(assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY]?.length ?? 0) > 0 ||
				(assignment?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY]?.length ??
					0) > 0
		)
	) {
		issues.push(
			'assignment index review-rebase infrastructure recovery cannot be combined with typed content-recovery authority.'
		);
	}
	return issues.length
		? { status: 'failed', issues, infrastructureRecoveryMode: true }
		: { status: 'passed', issues: [], infrastructureRecoveryMode: true };
}

export function validateScienceChallengeReviewRebaseIndexBindings(assignmentIndex) {
	const issues = [];
	const presentFields = SCIENCE_CHALLENGE_REVIEW_REBASE_INDEX_FIELDS.filter(
		(field) => assignmentIndex?.[field] !== undefined
	);
	if (presentFields.length === 0) {
		for (const assignment of assignmentIndex?.assignments ?? []) {
			const leakedFields = SCIENCE_CHALLENGE_REVIEW_REBASE_ASSIGNMENT_FIELDS.filter(
				(field) => assignment?.[field] !== undefined
			);
			if (leakedFields.length) {
				issues.push(
					`${assignment?.assignmentId ?? 'assignment'} contains review-rebase fields without top-level review-rebase authority.`
				);
			}
		}
		return issues.length
			? { status: 'failed', issues, rebaseMode: false }
			: { status: 'passed', issues: [], rebaseMode: false };
	}
	if (presentFields.length !== SCIENCE_CHALLENGE_REVIEW_REBASE_INDEX_FIELDS.length) {
		issues.push('assignment index review-rebase fields must be present all-or-none.');
		return { status: 'failed', issues, rebaseMode: true };
	}
	for (const field of [
		'reviewRebaseManifestSha256',
		'reviewRebaseId',
		'reviewRebaseCandidateSetSha256',
		'reviewRebaseCollectionValidationSha256',
		'reviewRebaseCollectionRemediationSetSha256',
		'reviewRebaseCollectionRemediationTargetSetSha256'
	]) {
		if (!SHA256_PATTERN.test(String(assignmentIndex[field] ?? ''))) {
			issues.push(`assignment index ${field} must be a canonical SHA-256.`);
		}
	}
	if (assignmentIndex.reviewRebaseCandidateSetSha256 !== assignmentIndex.candidateSetSha256) {
		issues.push('assignment index review-rebase candidate set differs from candidateSetSha256.');
	}
	const remediations = assignmentIndex.reviewRebaseCollectionRemediations;
	const allChallengeIds = new Set(
		(assignmentIndex.assignments ?? []).flatMap((assignment) =>
			Array.isArray(assignment?.ids) ? assignment.ids : []
		)
	);
	if (!Array.isArray(remediations) || remediations.length === 0) {
		issues.push('assignment index review-rebase remediations must be a non-empty array.');
	} else {
		const seenIssues = new Set();
		for (const [index, remediation] of remediations.entries()) {
			if (
				!isExactRemediation(remediation) ||
				seenIssues.has(remediation?.issue) ||
				!allChallengeIds.has(remediation?.preferredChallengeId)
			) {
				issues.push(
					`assignment index review-rebase remediation ${index} is malformed, duplicated or targets an unassigned challenge.`
				);
			}
			if (isExactRemediation(remediation)) seenIssues.add(remediation.issue);
		}
		if (
			assignmentIndex.reviewRebaseCollectionRemediationSetSha256 !== canonicalHash(remediations)
		) {
			issues.push('assignment index review-rebase remediation-set hash is stale.');
		}
	}
	const expectedTargetIds = [
		...new Set(
			(Array.isArray(remediations) ? remediations : []).map(
				(remediation) => remediation?.preferredChallengeId
			)
		)
	]
		.filter((value) => typeof value === 'string')
		.sort();
	if (
		!Array.isArray(assignmentIndex.reviewRebaseCollectionRemediationTargetIds) ||
		canonicalHash(assignmentIndex.reviewRebaseCollectionRemediationTargetIds) !==
			canonicalHash(expectedTargetIds)
	) {
		issues.push(
			'assignment index review-rebase remediation target ids are incomplete or reordered.'
		);
	}
	if (
		assignmentIndex.reviewRebaseCollectionRemediationTargetSetSha256 !==
		canonicalHash(expectedTargetIds)
	) {
		issues.push('assignment index review-rebase remediation target-set hash is stale.');
	}
	const mixedRecoveryFields = [
		'curriculumRemapVerifierInputSha256',
		'difficultyPlanAdjustmentVerifierInputSha256',
		'effectiveCohortManifestSha256',
		'remapManifestSetSha256',
		'difficultyAdjustmentManifestSetSha256',
		'recoverySetSha256'
	].filter((field) => assignmentIndex?.[field] !== undefined);
	const mixedProposalCount = (assignmentIndex.assignments ?? []).reduce(
		(sum, assignment) =>
			sum +
			(assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY]?.length ?? 0) +
			(assignment?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY]?.length ?? 0),
		0
	);
	if (mixedRecoveryFields.length || mixedProposalCount) {
		issues.push('review-rebase verification cannot be combined with typed recovery evidence.');
	}
	for (const assignment of assignmentIndex.assignments ?? []) {
		for (const field of SCIENCE_CHALLENGE_REVIEW_REBASE_ASSIGNMENT_FIELDS.slice(0, -1)) {
			if (assignment?.[field] !== assignmentIndex[field]) {
				issues.push(`${assignment?.assignmentId ?? 'assignment'} ${field} is stale or missing.`);
			}
		}
		const expectedSlice = (Array.isArray(remediations) ? remediations : []).filter((remediation) =>
			assignment?.ids?.includes(remediation.preferredChallengeId)
		);
		if (
			!Array.isArray(assignment?.reviewRebaseCollectionRemediations) ||
			canonicalHash(assignment.reviewRebaseCollectionRemediations) !== canonicalHash(expectedSlice)
		) {
			issues.push(
				`${assignment?.assignmentId ?? 'assignment'} review-rebase remediation slice is incomplete or reordered.`
			);
		}
	}
	return issues.length
		? { status: 'failed', issues, rebaseMode: true }
		: { status: 'passed', issues: [], rebaseMode: true };
}

export function validateScienceChallengeVerifierPacketInputs(assignmentIndex, dispatchLedger) {
	const issues = [];
	const dispatchValidation = validateScienceChallengeVerifierDispatchLedger(
		dispatchLedger,
		assignmentIndex
	);
	issues.push(...dispatchValidation.issues.map((issue) => `dispatch ledger: ${issue}`));

	if (assignmentIndex?.schemaVersion !== ASSIGNMENT_INDEX_SCHEMA) {
		issues.push(`assignment index schemaVersion must be ${ASSIGNMENT_INDEX_SCHEMA}.`);
	}
	if (
		!Array.isArray(assignmentIndex?.assignments) ||
		assignmentIndex.assignments.length === 0
	) {
		issues.push('assignment index must contain at least one assignment.');
		return failed(issues);
	}
	const rebaseValidation = validateScienceChallengeReviewRebaseIndexBindings(assignmentIndex);
	issues.push(...rebaseValidation.issues.map((issue) => `review rebase: ${issue}`));
	const infrastructureRecoveryValidation =
		validateScienceChallengeReviewRebaseInfrastructureRecoveryIndexBinding(assignmentIndex);
	issues.push(
		...infrastructureRecoveryValidation.issues.map(
			(issue) => `review rebase infrastructure recovery: ${issue}`
		)
	);

	const assignmentPaths = new Set();
	const challengeIds = new Set();
	let remapProposalCount = 0;
	let difficultyAdjustmentProposalCount = 0;
	for (const [assignmentIndexPosition, assignment] of assignmentIndex.assignments.entries()) {
		const expectedAssignmentId = `science-${String(assignmentIndexPosition + 1).padStart(3, '0')}`;
		if (assignment?.assignmentId !== expectedAssignmentId) {
			issues.push(
				`assignment row ${assignmentIndexPosition + 1} must be ${expectedAssignmentId}; found ${String(
					assignment?.assignmentId
				)}.`
			);
		}
		if (!safeRelativePath(assignment?.path) || assignmentPaths.has(assignment.path)) {
			issues.push(`${expectedAssignmentId} has an unsafe or duplicate assignment path.`);
		} else {
			assignmentPaths.add(assignment.path);
		}
		if (!SHA256_PATTERN.test(String(assignment?.sha256 ?? ''))) {
			issues.push(`${expectedAssignmentId} has an invalid assignment SHA-256.`);
		}
		if (
			!Array.isArray(assignment?.ids) ||
			assignment.ids.length < 1 ||
			assignment.ids.length > 20
		) {
			issues.push(`${expectedAssignmentId} must bind 1-20 challenge ids.`);
			continue;
		}
		for (const challengeId of assignment.ids) {
			if (
				typeof challengeId !== 'string' ||
				!challengeId.trim() ||
				challengeId !== challengeId.trim() ||
				challengeIds.has(challengeId)
			) {
				issues.push(`${expectedAssignmentId} has an invalid or duplicate challenge id.`);
			} else {
				challengeIds.add(challengeId);
			}
		}
		const remapValidation = validateScienceChallengeCurriculumRemapProposals(
			assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY],
			{
				assignedChallengeIds: assignment?.ids,
				basePlanSha256: assignmentIndex?.basePlanSha256 ?? assignmentIndex?.planSha256,
				effectivePlanSha256: assignmentIndex?.effectivePlanSha256 ?? assignmentIndex?.planSha256,
				curriculumEvidenceSha256: assignmentIndex?.curriculumEvidenceSha256
			}
		);
		remapProposalCount +=
			assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY]?.length ?? 0;
		if (
			(assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY]?.length ?? 0) > 0 &&
			(!assignmentIndex?.basePlanSha256 || !assignmentIndex?.effectivePlanSha256)
		) {
			issues.push(
				`${expectedAssignmentId} remap proposals require explicit index basePlanSha256 and effectivePlanSha256.`
			);
		}
		for (const issue of remapValidation.issues) {
			issues.push(
				`${expectedAssignmentId}.${SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY}${issue}`
			);
		}
		const displayValidation = validateScienceChallengeCurriculumRemapProposalEvidenceList(
			assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY],
			{
				proposals: assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] ?? []
			}
		);
		for (const issue of displayValidation.issues) {
			issues.push(
				`${expectedAssignmentId}.${SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY}${issue}`
			);
		}
		const difficultyProposals =
			assignment?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY];
		const difficultyValidation = validateScienceChallengeDifficultyPlanAdjustmentProposals(
			difficultyProposals,
			{
				assignedChallengeIds: assignment?.ids,
				basePlanSha256: assignmentIndex?.basePlanSha256 ?? assignmentIndex?.planSha256,
				effectivePlanSha256: assignmentIndex?.effectivePlanSha256 ?? assignmentIndex?.planSha256
			}
		);
		difficultyAdjustmentProposalCount += difficultyProposals?.length ?? 0;
		if (
			(difficultyProposals?.length ?? 0) > 0 &&
			(!assignmentIndex?.basePlanSha256 || !assignmentIndex?.effectivePlanSha256)
		) {
			issues.push(
				`${expectedAssignmentId} difficulty-plan adjustment proposals require explicit index basePlanSha256 and effectivePlanSha256.`
			);
		}
		for (const issue of difficultyValidation.issues) {
			issues.push(
				`${expectedAssignmentId}.${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY}: ${issue}`
			);
		}
		const difficultyDisplayValidation =
			validateScienceChallengeDifficultyPlanAdjustmentProposalEvidenceList(
				assignment?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY],
				{ proposals: difficultyProposals ?? [] }
			);
		for (const issue of difficultyDisplayValidation.issues) {
			issues.push(
				`${expectedAssignmentId}.${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY}: ${issue}`
			);
		}
	}
	if (assignmentIndex.candidateCount !== challengeIds.size) {
		issues.push('assignment index candidateCount differs from its exact challenge-id union.');
	}
	if (
		remapProposalCount > 0 !==
		SHA256_PATTERN.test(String(assignmentIndex?.curriculumRemapVerifierInputSha256 ?? ''))
	) {
		issues.push(
			'assignment index remap proposals and curriculumRemapVerifierInputSha256 must be present together.'
		);
	}
	if (
		difficultyAdjustmentProposalCount > 0 !==
		SHA256_PATTERN.test(String(assignmentIndex?.difficultyPlanAdjustmentVerifierInputSha256 ?? ''))
	) {
		issues.push(
			'assignment index difficulty-plan adjustment proposals and difficultyPlanAdjustmentVerifierInputSha256 must be present together.'
		);
	}

	if (
		typeof dispatchLedger?.createdAt !== 'string' ||
		Number.isNaN(Date.parse(dispatchLedger.createdAt)) ||
		new Date(dispatchLedger.createdAt).toISOString() !== dispatchLedger.createdAt
	) {
		issues.push('dispatch ledger createdAt must be a canonical ISO date-time.');
	}

	return issues.length ? failed(issues) : passed();
}

export function buildScienceChallengeVerifierPacketBundle({
	assignmentIndex,
	dispatchLedger,
	assignmentIndexPath,
	dispatchLedgerPath,
	packetRootPath,
	reviewRootPath
}) {
	const validation = validateScienceChallengeVerifierPacketInputs(assignmentIndex, dispatchLedger);
	if (validation.status !== 'passed') {
		throw new Error(`verifier packet inputs are invalid:\n- ${validation.issues.join('\n- ')}`);
	}
	for (const [label, value] of [
		['assignmentIndexPath', assignmentIndexPath],
		['dispatchLedgerPath', dispatchLedgerPath],
		['packetRootPath', packetRootPath],
		['reviewRootPath', reviewRootPath]
	]) {
		if (!safeRelativePath(value)) throw new Error(`${label} must be a safe relative path.`);
	}

	const assignmentIndexSha256 = canonicalHash(assignmentIndex);
	const dispatchLedgerSha256 = canonicalHash(dispatchLedger);
	const rebaseValidation = validateScienceChallengeReviewRebaseIndexBindings(assignmentIndex);
	const reviewRebaseBindings = rebaseValidation.rebaseMode
		? {
				reviewRebaseManifestSha256: assignmentIndex.reviewRebaseManifestSha256,
				reviewRebaseId: assignmentIndex.reviewRebaseId,
				reviewRebaseCandidateSetSha256: assignmentIndex.reviewRebaseCandidateSetSha256,
				reviewRebaseCollectionValidationSha256:
					assignmentIndex.reviewRebaseCollectionValidationSha256,
				reviewRebaseCollectionRemediationSetSha256:
					assignmentIndex.reviewRebaseCollectionRemediationSetSha256,
				reviewRebaseCollectionRemediationTargetSetSha256:
					assignmentIndex.reviewRebaseCollectionRemediationTargetSetSha256
			}
		: {};
	const infrastructureRecoveryValidation =
		validateScienceChallengeReviewRebaseInfrastructureRecoveryIndexBinding(assignmentIndex);
	const reviewRebaseInfrastructureRecoveryBindings =
		infrastructureRecoveryValidation.infrastructureRecoveryMode
			? {
					reviewRebaseInfrastructureRecoveryManifestSha256:
						assignmentIndex.reviewRebaseInfrastructureRecoveryManifestSha256,
					reviewRebaseInfrastructureRecoveryId: assignmentIndex.reviewRebaseInfrastructureRecoveryId
				}
			: {};
	const artifacts = [];
	const manifestPackets = [];
	const dispatchGroups = contiguousDispatchGroups(dispatchLedger.dispatches);

	for (const [verifierIndex, dispatchGroup] of dispatchGroups.entries()) {
		const verifierOrdinal = verifierIndex + 1;
		const verifierDirectory = `verifier-${String(verifierOrdinal).padStart(2, '0')}`;
		const start = dispatchGroup.start;
		const dispatches = dispatchGroup.dispatches;
		const taskName = dispatches[0].taskName;
		const waves = dispatches.map((dispatch, waveIndex) => {
			const waveNumber = waveIndex + 1;
			const assignmentRecord = assignmentIndex.assignments[start + waveIndex];
			const curriculumRemapProposals =
				assignmentRecord[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY];
			const curriculumRemapProposalEvidence =
				assignmentRecord[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY];
			const difficultyPlanAdjustmentProposals =
				assignmentRecord[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY];
			const difficultyPlanAdjustmentProposalEvidence =
				assignmentRecord[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY];
			const reviewRebaseCollectionRemediations =
				assignmentRecord.reviewRebaseCollectionRemediations;
			const resultPath = path.join(reviewRootPath, `${dispatch.assignmentId}.json`);
			const payloadRelativePath = path.join(
				verifierDirectory,
				`wave-${String(waveNumber).padStart(2, '0')}.json`
			);
			const payload = {
				target: taskName,
				message: followupMessage({
					taskName,
					dispatchLedgerSha256,
					dispatch,
					curriculumRemapProposals,
					curriculumRemapProposalEvidence,
					curriculumRemapVerifierInputSha256: assignmentIndex.curriculumRemapVerifierInputSha256,
					difficultyPlanAdjustmentProposals,
					difficultyPlanAdjustmentProposalEvidence,
					difficultyPlanAdjustmentVerifierInputSha256:
						assignmentIndex.difficultyPlanAdjustmentVerifierInputSha256,
					...reviewRebaseBindings,
					...reviewRebaseInfrastructureRecoveryBindings,
					reviewRebaseCollectionRemediations,
					resultPath,
					waveNumber,
					waveCount: dispatches.length,
					candidateCount: assignmentIndex.candidateCount
				})
			};
			artifacts.push({ relativePath: payloadRelativePath, value: payload });
			const wave = {
				waveNumber,
				assignmentId: dispatch.assignmentId,
				assignmentPath: dispatch.assignmentPath,
				assignmentSha256: dispatch.assignmentSha256,
				resultPath,
				followupPayloadPath: path.join(packetRootPath, payloadRelativePath),
				followupPayloadSha256: canonicalHash(payload),
				...reviewRebaseBindings,
				...reviewRebaseInfrastructureRecoveryBindings,
				...(rebaseValidation.rebaseMode ? { reviewRebaseCollectionRemediations } : {})
			};
			if (assignmentIndex.curriculumRemapVerifierInputSha256) {
				wave.curriculumRemapVerifierInputSha256 =
					assignmentIndex.curriculumRemapVerifierInputSha256;
			}
			if (curriculumRemapProposals !== undefined) {
				wave[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] = curriculumRemapProposals;
			}
			if (curriculumRemapProposalEvidence !== undefined) {
				wave[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] =
					curriculumRemapProposalEvidence;
			}
			if (assignmentIndex.difficultyPlanAdjustmentVerifierInputSha256) {
				wave.difficultyPlanAdjustmentVerifierInputSha256 =
					assignmentIndex.difficultyPlanAdjustmentVerifierInputSha256;
			}
			if (difficultyPlanAdjustmentProposals !== undefined) {
				wave[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] =
					difficultyPlanAdjustmentProposals;
			}
			if (difficultyPlanAdjustmentProposalEvidence !== undefined) {
				wave[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] =
					difficultyPlanAdjustmentProposalEvidence;
			}
			return wave;
		});
		const packet = {
			schemaVersion: SCIENCE_CHALLENGE_VERIFIER_PACKET_SCHEMA,
			verifierOrdinal,
			taskName,
			assignmentIndexSha256,
			dispatchLedgerSha256,
			ledgerCreatedAt: dispatchLedger.createdAt,
			...reviewRebaseBindings,
			...reviewRebaseInfrastructureRecoveryBindings,
			...(assignmentIndex.curriculumRemapVerifierInputSha256
				? {
						curriculumRemapVerifierInputSha256: assignmentIndex.curriculumRemapVerifierInputSha256
					}
				: {}),
			...(assignmentIndex.difficultyPlanAdjustmentVerifierInputSha256
				? {
						difficultyPlanAdjustmentVerifierInputSha256:
							assignmentIndex.difficultyPlanAdjustmentVerifierInputSha256
					}
				: {}),
			provenance: {
				orchestrator: dispatches[0].orchestrator,
				forkTurns: dispatches[0].forkTurns,
				model: dispatches[0].model,
				reasoningEffort: dispatches[0].reasoningEffort
			},
			assignmentCount: waves.length,
			waves
		};
		const packetRelativePath = path.join(verifierDirectory, 'packet.json');
		artifacts.push({ relativePath: packetRelativePath, value: packet });
		manifestPackets.push({
			verifierOrdinal,
			taskName,
			packetPath: path.join(packetRootPath, packetRelativePath),
			packetSha256: canonicalHash(packet),
			assignmentCount: waves.length,
			firstAssignmentId: waves[0].assignmentId,
			lastAssignmentId: waves.at(-1).assignmentId
		});
	}

	const manifest = {
		schemaVersion: SCIENCE_CHALLENGE_VERIFIER_PACKET_MANIFEST_SCHEMA,
		assignmentIndexPath,
		assignmentIndexSha256,
		dispatchLedgerPath,
		dispatchLedgerSha256,
		ledgerCreatedAt: dispatchLedger.createdAt,
		...reviewRebaseInfrastructureRecoveryBindings,
		packetCount: manifestPackets.length,
		waveCount: manifestPackets.reduce((sum, packet) => sum + packet.assignmentCount, 0),
		packets: manifestPackets
	};
	return { manifest, artifacts };
}

function followupMessage({
	taskName,
	dispatchLedgerSha256,
	dispatch,
	curriculumRemapProposals,
	curriculumRemapProposalEvidence,
	curriculumRemapVerifierInputSha256,
	difficultyPlanAdjustmentProposals,
	difficultyPlanAdjustmentProposalEvidence,
	difficultyPlanAdjustmentVerifierInputSha256,
	reviewRebaseManifestSha256,
	reviewRebaseId,
	reviewRebaseCandidateSetSha256,
	reviewRebaseCollectionValidationSha256,
	reviewRebaseCollectionRemediationSetSha256,
	reviewRebaseCollectionRemediationTargetSetSha256,
	reviewRebaseCollectionRemediations,
	reviewRebaseInfrastructureRecoveryManifestSha256,
	reviewRebaseInfrastructureRecoveryId,
	resultPath,
	waveNumber,
	waveCount,
	candidateCount
}) {
	const waveLabel = String(waveNumber).padStart(2, '0');
	const lines = [
		`Verifier wave ${waveLabel} of ${waveCount}. Review exactly one assignment in this turn and no later assignment.`,
		'',
		'Frozen provenance:',
		`- canonical verifier task name: ${taskName}`,
		`- dispatch-ledger canonical SHA-256: ${dispatchLedgerSha256}`,
		`- assignment id: ${dispatch.assignmentId}`,
		`- assignment path: ${dispatch.assignmentPath}`,
		`- expected assignment canonical SHA-256: ${dispatch.assignmentSha256}`,
		...(curriculumRemapVerifierInputSha256
			? [
					`- curriculum remap verifier-input canonical SHA-256: ${curriculumRemapVerifierInputSha256}`
				]
			: []),
		...(difficultyPlanAdjustmentVerifierInputSha256
			? [
					`- difficulty-plan adjustment verifier-input canonical SHA-256: ${difficultyPlanAdjustmentVerifierInputSha256}`
				]
			: []),
		...(reviewRebaseManifestSha256
			? [
					`- review-rebase id: ${reviewRebaseId}`,
					`- review-rebase wrapper canonical SHA-256: ${reviewRebaseManifestSha256}`,
					`- review-rebase candidate-set canonical SHA-256: ${reviewRebaseCandidateSetSha256}`,
					`- review-rebase collection-validation canonical SHA-256: ${reviewRebaseCollectionValidationSha256}`,
					`- review-rebase collection-remediation-set canonical SHA-256: ${reviewRebaseCollectionRemediationSetSha256}`,
					`- review-rebase collection-remediation-target-set canonical SHA-256: ${reviewRebaseCollectionRemediationTargetSetSha256}`
				]
			: []),
		...(reviewRebaseInfrastructureRecoveryManifestSha256
			? [
					`- effective-successor review-rebase infrastructure-recovery id: ${reviewRebaseInfrastructureRecoveryId}`,
					`- effective-successor review-rebase infrastructure-recovery manifest canonical SHA-256: ${reviewRebaseInfrastructureRecoveryManifestSha256}`
				]
			: []),
		`- required result path: ${resultPath}`,
		'',
		`Follow ${REVIEW_RUBRIC_PATH}. Before reviewing, verify that the parsed assignment JSON has the expected canonical SHA-256. Review every assigned candidate independently, without authoring or repairing them. Write exactly one result JSON to the required result path using science-challenge-independent-verification/v1.`,
		`Set verifier.context to "empty", model to "gpt-5.6-sol", reasoningEffort to "max", and provenance to orchestrator "codex-collaboration", taskName "${taskName}", forkTurns "none", dispatchLedgerSha256 "${dispatchLedgerSha256}". Copy assignmentEvidenceSha256 from the assignment evidenceSha256 exactly.`,
		`The complete ${candidateCount}-candidate plan-bound content review remains mandatory and independent of any exceptional-recovery decision. An exceptional-recovery decision does not accept the rest of a challenge.`
	];
	if (reviewRebaseManifestSha256) {
		lines.push(
			'',
			'Review-rebase collection notice:',
			'This deterministic cohort-level finding is evidence to investigate, not a reviewer verdict. Do not reject solely because this notice exists. Apply the ordinary rubric independently. If inspection confirms a defect, fail the relevant existing criterion and give a concrete issue. The preferred target is repair routing, not forced blame.'
		);
		if (reviewRebaseCollectionRemediations.length) {
			for (const remediation of reviewRebaseCollectionRemediations) {
				lines.push(
					`- preferred repair target ${remediation.preferredChallengeId}: ${remediation.issue}`
				);
			}
		} else {
			lines.push('- This assignment has no preferred remediation target.');
		}
	}
	if (curriculumRemapProposals?.length) {
		lines.push(
			'',
			`This assignment has ${curriculumRemapProposals.length} immutable curriculum descendant-remap proposal(s). Decide each proposal only in its matching challenge review. Add ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY} with exactly one object shaped {"challengeId","field","from","to","accepted"} that exactly mirrors the proposal identity; do not add proposal hashes to the decision object.`,
			'Immutable proposal bindings:'
		);
		for (const proposal of curriculumRemapProposals) {
			const display = curriculumRemapProposalEvidence.find(
				(evidence) => evidence.challengeId === proposal.challengeId
			);
			lines.push(
				`- ${proposal.challengeId}: ${proposal.field} ${proposal.from} -> ${proposal.to}; proposalSha256 ${proposal.proposalSha256}; basePlanSha256 ${proposal.basePlanSha256}; effectivePlanSha256 ${proposal.effectivePlanSha256}; curriculumEvidenceSha256 ${proposal.curriculumEvidenceSha256}; targetCandidateSha256 ${proposal.targetCandidateSha256}; batchCandidateSha256 ${proposal.batchCandidateSha256}; baseReviewSha256 ${proposal.baseReviewSha256}; manifestSha256 ${proposal.manifestSha256}`,
				`  From component: ${display.from.componentId} — ${display.from.title}. Source-text SHA-256: ${display.from.sourceTextSha256}. Evidence: ${display.from.substantiveExcerpt}`,
				`  To component: ${display.to.componentId} — ${display.to.title}. Source-text SHA-256: ${display.to.sourceTextSha256}. Evidence: ${display.to.substantiveExcerpt}`,
				`  Ancestry: ${display.ancestryChain.map((component) => `${component.componentId} (${component.title})`).join(' -> ')}`,
				`  Target-row diff: ${display.targetRowDiffStatement}`,
				`  Original single issue: ${display.originalSingleIssueGate.field} [${display.originalSingleIssueGate.category}] ${display.originalSingleIssueGate.evidence} Required repair: ${display.originalSingleIssueGate.repair}`
			);
		}
	} else {
		lines.push(
			`Do not add ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY}; an empty array is also valid because this assignment has no remap proposal.`
		);
	}
	if (difficultyPlanAdjustmentProposals?.length) {
		lines.push(
			'',
			`This assignment has ${difficultyPlanAdjustmentProposals.length} immutable difficulty-plan adjustment proposal(s). Decide each proposal only in its matching challenge review. Add ${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY} with exactly one object shaped {"challengeId","field","from","to","accepted"} that exactly mirrors the proposal identity; do not add proposal hashes to the decision object.`,
			'Immutable difficulty-plan adjustment bindings:'
		);
		for (const proposal of difficultyPlanAdjustmentProposals) {
			const display = difficultyPlanAdjustmentProposalEvidence.find(
				(evidence) => evidence.challengeId === proposal.challengeId
			);
			lines.push(
				`- ${proposal.challengeId}: ${proposal.field} ${proposal.from} -> ${proposal.to}; proposalSha256 ${proposal.proposalSha256}; sourceAttempt ${proposal.sourceAttempt}; sourcePolicy ${proposal.sourcePolicy}; basePlanSha256 ${proposal.basePlanSha256}; effectivePlanSha256 ${proposal.effectivePlanSha256}; targetCandidateSha256 ${proposal.targetCandidateSha256}; batchCandidateSha256 ${proposal.batchCandidateSha256}; baseReviewSha256 ${proposal.baseReviewSha256}; manifestSha256 ${proposal.manifestSha256}`,
				`  Target-row diff: ${display.targetRowDiffStatement}`,
				`  Original single issue: ${display.originalSingleIssueGate.field} [${display.originalSingleIssueGate.category}] ${display.originalSingleIssueGate.evidence} Required repair: ${display.originalSingleIssueGate.repair}`
			);
		}
	} else {
		lines.push(
			`Do not add ${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY}; an empty array is also valid because this assignment has no difficulty-plan adjustment proposal.`
		);
	}
	lines.push(
		'After writing the result, report this assignment complete and wait for the next wave. Do not open another assignment yet.'
	);
	return lines.join('\n');
}

function contiguousDispatchGroups(dispatches) {
	const groups = [];
	for (const [index, dispatch] of dispatches.entries()) {
		const current = groups.at(-1);
		if (!current || current.taskName !== dispatch.taskName) {
			groups.push({ taskName: dispatch.taskName, start: index, dispatches: [dispatch] });
		} else {
			current.dispatches.push(dispatch);
		}
	}
	return groups;
}

function safeRelativePath(value) {
	if (
		typeof value !== 'string' ||
		!value ||
		value !== value.trim() ||
		value.includes('\0') ||
		path.isAbsolute(value)
	) {
		return false;
	}
	const segments = value.split(/[\\/]/);
	return !segments.some((segment) => segment === '' || segment === '.' || segment === '..');
}

function isExactRemediation(value) {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.keys(value).sort().join(',') === 'issue,preferredChallengeId' &&
		typeof value.issue === 'string' &&
		value.issue.trim() === value.issue &&
		value.issue.length > 0 &&
		typeof value.preferredChallengeId === 'string' &&
		value.preferredChallengeId.trim() === value.preferredChallengeId &&
		value.preferredChallengeId.length > 0
	);
}

function failed(issues) {
	return { status: 'failed', issues };
}

function passed() {
	return { status: 'passed', issues: [] };
}
