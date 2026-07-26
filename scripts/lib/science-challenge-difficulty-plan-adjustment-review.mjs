import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SCHEMA,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY,
	validateScienceChallengeDifficultyPlanAdjustmentManifest,
	validateScienceChallengeDifficultyPlanAdjustmentSetManifest
} from './science-challenge-difficulty-plan-adjustment.mjs';
import {
	canonicalHash,
	validateIndependentContentReviewRow
} from './science-challenge-release.mjs';
import { projectScienceChallengeEffectiveRecoveryPlan } from './science-challenge-effective-plan-recovery.mjs';

export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_VERIFIER_INPUT_SCHEMA =
	'science-challenge-difficulty-plan-adjustment-verifier-input/v1';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY =
	'difficultyPlanAdjustmentProposals';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY =
	'difficultyPlanAdjustmentProposalEvidence';
export const SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY =
	'difficultyPlanAdjustmentDecisions';

const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LEGACY_TARGET_DIFF_STATEMENT =
	'Only definition.difficulty changes on the complete terminal attempt-04 target row.';
const COMPOSED_TARGET_DIFF_STATEMENT =
	'The typed plan projection changes only definition.difficulty; terminal content remains byte-identical.';
const PROPOSAL_FIELDS = Object.freeze([
	'challengeId',
	'field',
	'from',
	'to',
	'sourceAttempt',
	'sourcePolicy',
	'proposalSha256',
	'basePlanSha256',
	'effectivePlanSha256',
	'targetCandidateSha256',
	'batchCandidateSha256',
	'baseReviewSha256',
	'manifestSha256'
]);
const DECISION_FIELDS = Object.freeze(['challengeId', 'field', 'from', 'to', 'accepted']);
const CANDIDATE_OVERRIDE_FIELDS = Object.freeze([
	'shardId',
	'challengeId',
	'manifest',
	'manifestSha256',
	'candidate',
	'candidateSha256',
	'priorCandidate',
	'priorCandidateSha256',
	'priorTargetSha256'
]);
const RECOVERY_ARTIFACT_FIELDS = Object.freeze(['manifest', 'priorCandidate', 'candidate']);
const EVIDENCE_FIELDS = Object.freeze([
	'challengeId',
	'proposalSha256',
	'field',
	'from',
	'to',
	'sourceAttempt',
	'sourcePolicy',
	'targetRowDiffStatement',
	'originalSingleIssueGate'
]);

export function buildScienceChallengeDifficultyPlanAdjustmentProposal(value) {
	const core = proposalCore(value);
	const proposal = { ...core, proposalSha256: canonicalHash(core) };
	const validation = validateScienceChallengeDifficultyPlanAdjustmentProposal(proposal);
	if (validation.status !== 'passed') {
		throw new Error(
			`Difficulty-plan adjustment proposal is invalid:\n${validation.issues.join('\n')}`
		);
	}
	return proposal;
}

export function validateScienceChallengeDifficultyPlanAdjustmentProposal(
	value,
	{ basePlanSha256, effectivePlanSha256, baseReviewSha256, manifestSha256, challengeId } = {}
) {
	const issues = [];
	if (!isRecord(value)) return failed('Difficulty-plan adjustment proposal must be an object.');
	rejectUnknownOrMissing(value, PROPOSAL_FIELDS, issues, 'proposal');
	if (!ID.test(String(value.challengeId ?? ''))) issues.push('proposal.challengeId is invalid.');
	if (value.field !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD) {
		issues.push(`proposal.field must be ${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD}.`);
	}
	if (
		!['starter', 'stretch'].includes(value.from) ||
		value.to !== 'standard' ||
		value.from === value.to
	) {
		issues.push(
			'proposal must describe an exact verifier-authorized starter or stretch to standard adjustment.'
		);
	}
	if (value.sourceAttempt !== 4) issues.push('proposal.sourceAttempt must be 4.');
	if (value.sourcePolicy !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY) {
		issues.push('proposal.sourcePolicy is invalid.');
	}
	for (const field of PROPOSAL_FIELDS.filter((field) => field.endsWith('Sha256'))) {
		if (!HASH.test(String(value[field] ?? ''))) {
			issues.push(`proposal.${field} must be a lowercase SHA-256.`);
		}
	}
	const { proposalSha256, ...core } = value;
	if (proposalSha256 !== canonicalHash(core)) {
		issues.push('proposal.proposalSha256 does not bind the exact proposal core.');
	}
	for (const [field, expected] of [
		['basePlanSha256', basePlanSha256],
		['effectivePlanSha256', effectivePlanSha256],
		['baseReviewSha256', baseReviewSha256],
		['manifestSha256', manifestSha256],
		['challengeId', challengeId]
	]) {
		if (expected !== undefined && value[field] !== expected) {
			issues.push(`proposal.${field} differs from expected evidence.`);
		}
	}
	return issues.length ? failed(issues) : passed();
}

export function validateScienceChallengeDifficultyPlanAdjustmentProposals(
	proposals,
	{ assignedChallengeIds, ...options } = {}
) {
	const issues = [];
	if (proposals === undefined) return passed();
	if (!Array.isArray(proposals)) {
		return failed('Difficulty-plan adjustment proposals must be an array.');
	}
	const ids = new Set();
	const assignedIds = assignedChallengeIds ? new Set(assignedChallengeIds) : null;
	for (const [index, proposal] of proposals.entries()) {
		const validation = validateScienceChallengeDifficultyPlanAdjustmentProposal(proposal, options);
		issues.push(
			...validation.issues.map((issue) => `difficultyPlanAdjustmentProposals[${index}]: ${issue}`)
		);
		if (ids.has(proposal?.challengeId)) {
			issues.push(`difficultyPlanAdjustmentProposals[${index}] duplicates a challenge id.`);
		}
		if (assignedIds && !assignedIds.has(proposal?.challengeId)) {
			issues.push(
				`difficultyPlanAdjustmentProposals[${index}] is not assigned to this verifier result.`
			);
		}
		ids.add(proposal?.challengeId);
	}
	return issues.length ? failed(issues) : passed();
}

export function buildScienceChallengeDifficultyPlanAdjustmentProposalEvidence(value, proposal) {
	const evidence = {
		challengeId: value.challengeId,
		proposalSha256: proposal.proposalSha256,
		field: value.field,
		from: value.from,
		to: value.to,
		sourceAttempt: value.sourceAttempt,
		sourcePolicy: value.sourcePolicy,
		targetRowDiffStatement: value.targetRowDiffStatement ?? LEGACY_TARGET_DIFF_STATEMENT,
		originalSingleIssueGate: structuredClone(value.originalSingleIssueGate)
	};
	const validation = validateScienceChallengeDifficultyPlanAdjustmentProposalEvidence(
		evidence,
		proposal
	);
	if (validation.status !== 'passed') {
		throw new Error(
			`Difficulty-plan adjustment proposal evidence is invalid:\n${validation.issues.join('\n')}`
		);
	}
	return evidence;
}

export function validateScienceChallengeDifficultyPlanAdjustmentProposalEvidence(value, proposal) {
	const issues = [];
	if (!isRecord(value)) {
		return failed('Difficulty-plan adjustment proposal evidence must be an object.');
	}
	rejectUnknownOrMissing(value, EVIDENCE_FIELDS, issues, 'proposal evidence');
	if (
		value.challengeId !== proposal?.challengeId ||
		value.proposalSha256 !== proposal?.proposalSha256 ||
		value.field !== proposal?.field ||
		value.from !== proposal?.from ||
		value.to !== proposal?.to ||
		value.sourceAttempt !== proposal?.sourceAttempt ||
		value.sourcePolicy !== proposal?.sourcePolicy
	) {
		issues.push('Proposal evidence identity differs from its proposal.');
	}
	if (
		![LEGACY_TARGET_DIFF_STATEMENT, COMPOSED_TARGET_DIFF_STATEMENT].includes(
			value.targetRowDiffStatement
		)
	) {
		issues.push('Proposal evidence target-row diff statement is invalid.');
	}
	const issue = value.originalSingleIssueGate;
	if (
		!isRecord(issue) ||
		issue.field !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD ||
		!nonEmpty(issue.category) ||
		!nonEmpty(issue.evidence) ||
		!nonEmpty(issue.repair)
	) {
		issues.push('Proposal evidence original issue is invalid.');
	}
	return issues.length ? failed(issues) : passed();
}

export function validateScienceChallengeDifficultyPlanAdjustmentProposalEvidenceList(
	evidenceList,
	{ proposals } = {}
) {
	const issues = [];
	if (evidenceList === undefined && (proposals?.length ?? 0) === 0) return passed();
	if (!Array.isArray(evidenceList)) {
		return failed('Difficulty-plan adjustment proposal evidence must be an array.');
	}
	const proposalByChallengeId = new Map(
		(proposals ?? []).map((proposal) => [proposal.challengeId, proposal])
	);
	const seen = new Set();
	for (const [index, evidence] of evidenceList.entries()) {
		const proposal = proposalByChallengeId.get(evidence?.challengeId);
		const validation = validateScienceChallengeDifficultyPlanAdjustmentProposalEvidence(
			evidence,
			proposal
		);
		issues.push(
			...validation.issues.map(
				(issue) => `difficultyPlanAdjustmentProposalEvidence[${index}]: ${issue}`
			)
		);
		if (!proposal) {
			issues.push(`difficultyPlanAdjustmentProposalEvidence[${index}] has no assigned proposal.`);
		}
		if (seen.has(evidence?.challengeId)) {
			issues.push(`difficultyPlanAdjustmentProposalEvidence[${index}] duplicates a challenge id.`);
		}
		seen.add(evidence?.challengeId);
	}
	for (const proposal of proposals ?? []) {
		if (!seen.has(proposal.challengeId)) {
			issues.push(
				`Difficulty-plan adjustment proposal evidence is missing ${proposal.challengeId}.`
			);
		}
	}
	return issues.length ? failed(issues) : passed();
}

export function buildScienceChallengeDifficultyPlanAdjustmentVerifierInput({
	basePlan,
	effectivePlan,
	effectiveCohortManifestSha256,
	candidateCount,
	candidateSetSha256,
	adjustmentManifestSetSha256,
	recoveries,
	recoverySetSha256,
	candidateOverrides,
	proposals,
	evidence
}) {
	const value = {
		schemaVersion: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_VERIFIER_INPUT_SCHEMA,
		basePlan,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlan,
		effectivePlanSha256: canonicalHash(effectivePlan),
		effectiveCohortManifestSha256,
		candidateCount,
		candidateSetSha256,
		adjustmentManifestSetSha256,
		recoveries:
			recoveries ??
			uniqueRecoveryArtifacts(
				candidateOverrides?.map((entry) => ({
					manifest: entry.manifest,
					priorCandidate: entry.priorCandidate,
					candidate: entry.candidate
				}))
			),
		recoverySetSha256:
			recoverySetSha256 ??
			canonicalHash(
				recoveries ??
					uniqueRecoveryArtifacts(
						candidateOverrides?.map((entry) => ({
							manifest: entry.manifest,
							priorCandidate: entry.priorCandidate,
							candidate: entry.candidate
						}))
					)
			),
		candidateOverrides,
		proposals,
		proposalEvidence: evidence
	};
	const validation = validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(value, {
		basePlan,
		effectivePlan
	});
	if (validation.status !== 'passed') {
		throw new Error(
			`Difficulty-plan adjustment verifier input is invalid:\n${validation.issues.join('\n')}`
		);
	}
	return value;
}

export function validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(
	value,
	{ basePlan, effectivePlan } = {}
) {
	const issues = [];
	if (!isRecord(value)) {
		return failed('Difficulty-plan adjustment verifier input must be an object.');
	}
	const fields = [
		'schemaVersion',
		'basePlan',
		'basePlanSha256',
		'effectivePlan',
		'effectivePlanSha256',
		'effectiveCohortManifestSha256',
		'candidateCount',
		'candidateSetSha256',
		'adjustmentManifestSetSha256',
		'recoveries',
		'recoverySetSha256',
		'candidateOverrides',
		'proposals',
		'proposalEvidence'
	];
	rejectUnknownOrMissing(value, fields, issues, 'verifier input');
	if (value.schemaVersion !== SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_VERIFIER_INPUT_SCHEMA) {
		issues.push(
			`verifier input schemaVersion must be ${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_VERIFIER_INPUT_SCHEMA}.`
		);
	}
	for (const field of fields.filter((field) => field.endsWith('Sha256'))) {
		if (!HASH.test(String(value[field] ?? ''))) {
			issues.push(`verifier input ${field} is invalid.`);
		}
	}
	if (!Number.isSafeInteger(value.candidateCount) || value.candidateCount <= 0) {
		issues.push('verifier input candidateCount must be a positive safe integer.');
	}
	if (!isRecord(value.basePlan) || value.basePlanSha256 !== canonicalHash(value.basePlan)) {
		issues.push('verifier input basePlanSha256 must bind the exact basePlan.');
	}
	if (
		!isRecord(value.effectivePlan) ||
		value.effectivePlanSha256 !== canonicalHash(value.effectivePlan)
	) {
		issues.push('verifier input effectivePlanSha256 must bind the exact effectivePlan.');
	}
	const recoveryValidation = validateRecoveryArtifacts(value.recoveries, value.recoverySetSha256);
	issues.push(...recoveryValidation.issues);
	if (
		recoveryValidation.status === 'passed' &&
		isRecord(value.basePlan) &&
		isRecord(value.effectivePlan)
	) {
		const projection = projectScienceChallengeEffectiveRecoveryPlan(
			value.basePlan,
			value.recoveries
		);
		if (
			projection.status !== 'passed' ||
			projection.effectivePlanSha256 !== value.effectivePlanSha256 ||
			canonicalHash(projection.effectivePlan) !== value.effectivePlanSha256
		) {
			issues.push(
				'verifier input effectivePlan differs from the exact combined typed recovery projection.',
				...(projection.issues ?? []).map((issue) => `recovery projection: ${issue}`)
			);
		}
	}
	const proposalValidation = validateScienceChallengeDifficultyPlanAdjustmentProposals(
		value.proposals,
		{
			basePlanSha256: value.basePlanSha256,
			effectivePlanSha256: value.effectivePlanSha256
		}
	);
	issues.push(...proposalValidation.issues);
	if (!Array.isArray(value.proposals) || value.proposals.length === 0) {
		issues.push('verifier input requires at least one difficulty-plan adjustment proposal.');
	}
	const proposalEvidenceValidation =
		validateScienceChallengeDifficultyPlanAdjustmentProposalEvidenceList(value.proposalEvidence, {
			proposals: value.proposals
		});
	issues.push(...proposalEvidenceValidation.issues);
	if (
		!Array.isArray(value.candidateOverrides) ||
		value.candidateOverrides.length !== value.proposals?.length
	) {
		issues.push('verifier input candidateOverrides must map every proposal exactly once.');
	} else {
		const proposalById = new Map(
			(value.proposals ?? []).map((proposal) => [proposal.challengeId, proposal])
		);
		const seen = new Set();
		const manifestSet = [];
		const seenManifestHashes = new Set();
		for (const [index, override] of value.candidateOverrides.entries()) {
			if (isRecord(override)) {
				rejectUnknownOrMissing(
					override,
					CANDIDATE_OVERRIDE_FIELDS,
					issues,
					`candidateOverrides[${index}]`
				);
			}
			const proposal = proposalById.get(override?.challengeId);
			const setManifest =
				override?.manifest?.schemaVersion ===
				SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA;
			const manifestAdjustment = setManifest
				? override.manifest.adjustments?.find(
						(adjustment) => adjustment?.challengeId === override.challengeId
					)
				: override?.manifest?.adjustment;
			const candidateTarget = override?.candidate?.challenges?.find(
				(entry) => entry?.definition?.id === override?.challengeId
			);
			const priorTarget = override?.priorCandidate?.challenges?.find(
				(entry) => entry?.definition?.id === override?.challengeId
			);
			if (
				!isRecord(override) ||
				seen.has(override.challengeId) ||
				!proposal ||
				override.shardId !== override.manifest?.shardId ||
				![
					SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SCHEMA,
					SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA
				].includes(override.manifest?.schemaVersion) ||
				!manifestAdjustment ||
				override.manifestSha256 !== canonicalHash(override.manifest) ||
				override.candidateSha256 !== canonicalHash(override.candidate) ||
				override.priorCandidateSha256 !== canonicalHash(override.priorCandidate) ||
				override.priorTargetSha256 !== canonicalHash(priorTarget) ||
				proposal.manifestSha256 !== override.manifestSha256 ||
				proposal.batchCandidateSha256 !== override.candidateSha256 ||
				proposal.targetCandidateSha256 !== canonicalHash(candidateTarget) ||
				proposal.challengeId !== manifestAdjustment.challengeId ||
				proposal.field !== manifestAdjustment.field ||
				proposal.from !== manifestAdjustment.from ||
				proposal.to !== manifestAdjustment.to
			) {
				issues.push(`candidateOverrides[${index}] is stale, duplicate or unassigned.`);
			} else if (basePlan) {
				const integrity = setManifest
					? validateScienceChallengeDifficultyPlanAdjustmentSetManifest({
							manifest: override.manifest,
							plan: basePlan,
							priorCandidate: override.priorCandidate,
							candidate: override.candidate
						})
					: validateScienceChallengeDifficultyPlanAdjustmentManifest({
							manifest: override.manifest,
							plan: basePlan,
							priorCandidate: override.priorCandidate,
							candidate: override.candidate
						});
				issues.push(
					...integrity.issues.map((issue) => `candidateOverrides[${index}] manifest: ${issue}`)
				);
			}
			if (isRecord(override?.manifest) && !seenManifestHashes.has(override.manifestSha256)) {
				seenManifestHashes.add(override.manifestSha256);
				manifestSet.push(override.manifest);
			}
			seen.add(override?.challengeId);
		}
		if (value.adjustmentManifestSetSha256 !== canonicalHash(manifestSet)) {
			issues.push(
				'verifier input adjustmentManifestSetSha256 differs from the exact override manifests.'
			);
		}
		const expectedAdjustmentBindings = manifestSet.flatMap((manifest) => {
			const adjustments =
				manifest?.schemaVersion === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA
					? manifest.adjustments
					: [manifest?.adjustment];
			return (adjustments ?? []).map((adjustment) => ({
				manifestSha256: canonicalHash(manifest),
				challengeId: adjustment?.challengeId,
				field: adjustment?.field,
				from: adjustment?.from,
				to: adjustment?.to
			}));
		});
		const actualAdjustmentBindings = value.candidateOverrides.map((override) => ({
			manifestSha256: override?.manifestSha256,
			challengeId: override?.challengeId,
			field: proposalById.get(override?.challengeId)?.field,
			from: proposalById.get(override?.challengeId)?.from,
			to: proposalById.get(override?.challengeId)?.to
		}));
		if (canonicalHash(actualAdjustmentBindings) !== canonicalHash(expectedAdjustmentBindings)) {
			issues.push(
				'verifier input proposals and candidateOverrides must cover every manifest adjustment exactly once in manifest order.'
			);
		}
	}
	const recoveryManifestHashes = new Set(
		(value.recoveries ?? []).map((recovery) => canonicalHash(recovery?.manifest))
	);
	for (const [index, manifest] of uniqueManifests(
		value.candidateOverrides?.map((override) => override?.manifest)
	).entries()) {
		if (!recoveryManifestHashes.has(canonicalHash(manifest))) {
			issues.push(`candidateOverrides manifest ${index} is absent from the combined recovery set.`);
		}
	}
	if (basePlan && value.basePlanSha256 !== canonicalHash(basePlan)) {
		issues.push('verifier input basePlanSha256 differs from the exact base plan.');
	}
	if (effectivePlan && value.effectivePlanSha256 !== canonicalHash(effectivePlan)) {
		issues.push('verifier input effectivePlanSha256 differs from the exact effective plan.');
	}
	return issues.length ? failed(issues) : passed();
}

export function buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts({
	basePlan,
	effectivePlan,
	effectiveCohortManifest,
	effectiveCohortManifestSha256,
	recoveries,
	combinedRecoveries,
	recoverySetSha256
}) {
	if (
		!isRecord(effectiveCohortManifest) ||
		effectiveCohortManifest.schemaVersion !== 'science-challenge-effective-cohort/v1' ||
		effectiveCohortManifestSha256 !== canonicalHash(effectiveCohortManifest)
	) {
		throw new Error('A canonical validated effective-cohort manifest is required.');
	}
	const proposals = [];
	const evidence = [];
	const candidateOverrides = [];
	for (const recovery of recoveries ?? []) {
		const manifest = recovery.manifest;
		const adjustments =
			manifest.schemaVersion === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA
				? manifest.adjustments
				: [manifest.adjustment];
		for (const adjustment of adjustments ?? []) {
			const priorTarget = recovery.priorCandidate.challenges.find(
				(entry) => entry?.definition?.id === adjustment.challengeId
			);
			const candidateTarget = recovery.candidate.challenges.find(
				(entry) => entry?.definition?.id === adjustment.challengeId
			);
			const proposal = buildScienceChallengeDifficultyPlanAdjustmentProposal({
				challengeId: adjustment.challengeId,
				field: adjustment.field,
				from: adjustment.from,
				to: adjustment.to,
				sourceAttempt: manifest.sourceAttempt.attempt,
				sourcePolicy: manifest.sourceAttempt.selectionPolicy,
				basePlanSha256: canonicalHash(basePlan),
				effectivePlanSha256: canonicalHash(effectivePlan),
				targetCandidateSha256: canonicalHash(candidateTarget),
				batchCandidateSha256: canonicalHash(recovery.candidate),
				baseReviewSha256: manifest.firstReview.summarySha256,
				manifestSha256: canonicalHash(manifest)
			});
			proposals.push(proposal);
			const issue =
				manifest.schemaVersion === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA
					? adjustment.issue
					: recovery.firstReviewSummary.reviews.find(
							(review) => review.id === adjustment.challengeId
						)?.issues?.[0];
			evidence.push(
				buildScienceChallengeDifficultyPlanAdjustmentProposalEvidence(
					{
						...adjustment,
						sourceAttempt: manifest.sourceAttempt.attempt,
						sourcePolicy: manifest.sourceAttempt.selectionPolicy,
						targetRowDiffStatement:
							manifest.schemaVersion === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA
								? COMPOSED_TARGET_DIFF_STATEMENT
								: LEGACY_TARGET_DIFF_STATEMENT,
						originalSingleIssueGate: issue
					},
					proposal
				)
			);
			candidateOverrides.push({
				shardId: manifest.shardId,
				challengeId: adjustment.challengeId,
				manifest,
				manifestSha256: canonicalHash(manifest),
				candidate: recovery.candidate,
				candidateSha256: canonicalHash(recovery.candidate),
				priorCandidate: recovery.priorCandidate,
				priorCandidateSha256: canonicalHash(recovery.priorCandidate),
				priorTargetSha256: canonicalHash(priorTarget)
			});
		}
	}
	const selectedRecoveries =
		combinedRecoveries ??
		uniqueRecoveryArtifacts(
			(recoveries ?? []).map((recovery) => ({
				manifest: recovery.manifest,
				priorCandidate: recovery.priorCandidate,
				candidate: recovery.candidate
			}))
		);
	const selectedRecoverySetSha256 = canonicalHash(selectedRecoveries);
	const adjustmentManifestSetSha256 = canonicalHash(
		uniqueManifests((recoveries ?? []).map((recovery) => recovery?.manifest))
	);
	if (
		effectiveCohortManifest.planId !== effectivePlan?.planId ||
		effectiveCohortManifest.basePlanSha256 !== canonicalHash(basePlan) ||
		effectiveCohortManifest.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		effectiveCohortManifest.candidateCount !== effectivePlan?.rows?.length ||
		!HASH.test(String(effectiveCohortManifest.candidateSetSha256 ?? '')) ||
		effectiveCohortManifest.difficultyAdjustmentManifestSetSha256 !== adjustmentManifestSetSha256 ||
		effectiveCohortManifest.recoverySetSha256 !== selectedRecoverySetSha256 ||
		(recoverySetSha256 !== undefined && recoverySetSha256 !== selectedRecoverySetSha256)
	) {
		throw new Error(
			'Effective-cohort manifest differs from the verifier plans, difficulty adjustments, recovery set, or candidate set.'
		);
	}
	return buildScienceChallengeDifficultyPlanAdjustmentVerifierInput({
		basePlan,
		effectivePlan,
		effectiveCohortManifestSha256,
		candidateCount: effectiveCohortManifest.candidateCount,
		candidateSetSha256: effectiveCohortManifest.candidateSetSha256,
		adjustmentManifestSetSha256,
		recoveries: selectedRecoveries,
		recoverySetSha256: selectedRecoverySetSha256,
		candidateOverrides,
		proposals,
		evidence
	});
}

export function validateScienceChallengeDifficultyPlanAdjustmentReviewRow(
	review,
	{ proposal } = {}
) {
	const issues = [...validateIndependentContentReviewRow(review).issues];
	const decisionValidation = validateScienceChallengeDifficultyPlanAdjustmentReviewDecision(
		review,
		{ proposal }
	);
	issues.push(...decisionValidation.issues);
	return issues.length ? failed(issues) : passed();
}

export function validateScienceChallengeDifficultyPlanAdjustmentReviewDecision(
	review,
	{ proposal } = {}
) {
	const issues = [];
	const decisions = review?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY];
	if (!proposal) {
		if (decisions !== undefined && (!Array.isArray(decisions) || decisions.length !== 0)) {
			issues.push(
				`${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY} is unassigned.`
			);
		}
		return issues.length ? failed(issues) : passed();
	}
	const proposalValidation = validateScienceChallengeDifficultyPlanAdjustmentProposal(proposal, {
		challengeId: review?.id
	});
	issues.push(...proposalValidation.issues);
	if (!Array.isArray(decisions) || decisions.length !== 1) {
		issues.push(
			`${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY} must contain one decision.`
		);
	} else {
		validateDecision(decisions[0], { review, proposal, issues });
	}
	return issues.length ? failed(issues) : passed();
}

export function exactDifficultyPlanAdjustmentProposalMatch(left, right) {
	return canonicalHash(left) === canonicalHash(right);
}

function validateDecision(decision, { review, proposal, issues }) {
	if (!isRecord(decision)) {
		issues.push('Difficulty-plan adjustment decision must be an object.');
		return;
	}
	rejectUnknownOrMissing(decision, DECISION_FIELDS, issues, 'decision');
	if (
		decision.challengeId !== proposal.challengeId ||
		decision.field !== proposal.field ||
		decision.from !== proposal.from ||
		decision.to !== proposal.to
	) {
		issues.push('Difficulty-plan adjustment decision differs from the assigned proposal.');
	}
	if (typeof decision.accepted !== 'boolean') {
		issues.push('Difficulty-plan adjustment decision accepted must be boolean.');
	}
	if (decision.accepted === true && review?.accepted !== true) {
		issues.push('An accepted difficulty-plan adjustment requires the full review to pass.');
	}
}

function proposalCore(value) {
	return {
		challengeId: value.challengeId,
		field: value.field,
		from: value.from,
		to: value.to,
		sourceAttempt: value.sourceAttempt,
		sourcePolicy: value.sourcePolicy,
		basePlanSha256: value.basePlanSha256,
		effectivePlanSha256: value.effectivePlanSha256,
		targetCandidateSha256: value.targetCandidateSha256,
		batchCandidateSha256: value.batchCandidateSha256,
		baseReviewSha256: value.baseReviewSha256,
		manifestSha256: value.manifestSha256
	};
}

function rejectUnknownOrMissing(value, fields, issues, label) {
	const allowed = new Set(fields);
	for (const field of Object.keys(value ?? {})) {
		if (!allowed.has(field)) issues.push(`${label}.${field} is unknown.`);
	}
	for (const field of fields) {
		if (!Object.hasOwn(value ?? {}, field)) issues.push(`${label}.${field} is required.`);
	}
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueManifests(values) {
	if (!Array.isArray(values)) return [];
	const seen = new Set();
	const unique = [];
	for (const value of values) {
		if (!isRecord(value)) {
			unique.push(value);
			continue;
		}
		const hash = canonicalHash(value);
		if (seen.has(hash)) continue;
		seen.add(hash);
		unique.push(value);
	}
	return unique;
}

function uniqueRecoveryArtifacts(values) {
	if (!Array.isArray(values)) return [];
	const seen = new Set();
	const unique = [];
	for (const value of values) {
		const manifestHash = isRecord(value?.manifest)
			? canonicalHash(value.manifest)
			: `invalid:${unique.length}`;
		if (seen.has(manifestHash)) continue;
		seen.add(manifestHash);
		unique.push(value);
	}
	return unique;
}

function validateRecoveryArtifacts(recoveries, recoverySetSha256) {
	const issues = [];
	if (
		!Array.isArray(recoveries) ||
		recoveries.length === 0 ||
		recoverySetSha256 !== canonicalHash(recoveries)
	) {
		return failed('recoveries must be a non-empty canonical array bound by recoverySetSha256.');
	}
	const seen = new Set();
	for (const [index, recovery] of recoveries.entries()) {
		if (isRecord(recovery)) {
			rejectUnknownOrMissing(recovery, RECOVERY_ARTIFACT_FIELDS, issues, `recoveries[${index}]`);
		}
		if (
			!isRecord(recovery) ||
			!isRecord(recovery.manifest) ||
			!isRecord(recovery.priorCandidate) ||
			!isRecord(recovery.candidate)
		) {
			issues.push(`recoveries[${index}] is incomplete or stale.`);
			continue;
		}
		const manifestHash = canonicalHash(recovery.manifest);
		if (seen.has(manifestHash)) issues.push(`recoveries[${index}] duplicates a manifest.`);
		seen.add(manifestHash);
	}
	return issues.length ? failed(issues) : passed();
}

function passed() {
	return { status: 'passed', issues: [] };
}

function failed(value) {
	return { status: 'failed', issues: Array.isArray(value) ? value : [value] };
}
