import {
	canonicalHash,
	validateIndependentContentReviewRow
} from './science-challenge-release.mjs';
import { validateScienceChallengeDescendantRemapManifest } from './science-challenge-descendant-remap.mjs';
import { projectScienceChallengeEffectiveRecoveryPlan } from './science-challenge-effective-plan-recovery.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY,
	validateScienceChallengeDifficultyPlanAdjustmentReviewDecision
} from './science-challenge-difficulty-plan-adjustment-review.mjs';

export const SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD = 'grounding.curriculumComponentId';
export const SCIENCE_CHALLENGE_CURRICULUM_REMAP_VERIFIER_INPUT_SCHEMA =
	'science-challenge-curriculum-remap-verifier-input/v1';
export const SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY = 'curriculumRemapProposals';
export const SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY =
	'curriculumRemapProposalEvidence';
export const SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY = 'curriculumRemapDecisions';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CHALLENGE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const COMPONENT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;
const PROPOSAL_FIELDS = Object.freeze([
	'challengeId',
	'field',
	'from',
	'to',
	'proposalSha256',
	'basePlanSha256',
	'effectivePlanSha256',
	'curriculumEvidenceSha256',
	'targetCandidateSha256',
	'batchCandidateSha256',
	'baseReviewSha256',
	'manifestSha256'
]);
const DECISION_FIELDS = Object.freeze(['challengeId', 'field', 'from', 'to', 'accepted']);
const DISPLAY_EVIDENCE_FIELDS = Object.freeze([
	'challengeId',
	'proposalSha256',
	'field',
	'from',
	'to',
	'ancestryChain',
	'targetRowDiffStatement',
	'originalSingleIssueGate'
]);
const COMPONENT_EVIDENCE_FIELDS = Object.freeze([
	'componentId',
	'title',
	'sourceTextSha256',
	'substantiveExcerpt'
]);
const ANCESTRY_FIELDS = Object.freeze(['componentId', 'title']);
const REVIEW_FIELDS = Object.freeze([
	'id',
	'accepted',
	'curriculumGrounded',
	'paperCalibrated',
	'scientificallyCorrect',
	'contextsDistinct',
	'selfContained',
	'flowCoherent',
	'choicesFair',
	'difficultyCalibrated',
	'learnerCopyClean',
	'artBriefsSafe',
	'heroTeaserSafe',
	'checkedCalculations',
	'issues',
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY
]);
const ISSUE_FIELDS = Object.freeze(['field', 'category', 'evidence', 'repair']);
const VERIFIER_INPUT_FIELDS = Object.freeze([
	'schemaVersion',
	'basePlan',
	'basePlanSha256',
	'effectivePlan',
	'effectivePlanSha256',
	'curriculumCatalogSha256',
	'effectiveCohortManifestSha256',
	'candidateCount',
	'candidateSetSha256',
	'remapManifestSetSha256',
	'recoveries',
	'recoverySetSha256',
	'candidateOverrides',
	'proposals',
	'evidence'
]);
const CANDIDATE_OVERRIDE_FIELDS = Object.freeze([
	'shardId',
	'manifest',
	'candidate',
	'priorCandidate',
	'candidateSha256',
	'manifestSha256'
]);
const RECOVERY_ARTIFACT_FIELDS = Object.freeze(['manifest', 'priorCandidate', 'candidate']);

export function buildScienceChallengeCurriculumRemapProposal(value) {
	const proposalCore = selectFields(
		value,
		PROPOSAL_FIELDS.filter((field) => field !== 'proposalSha256')
	);
	const proposal = {
		...proposalCore,
		proposalSha256: canonicalHash(proposalCore)
	};
	const validation = validateScienceChallengeCurriculumRemapProposal(proposal);
	if (validation.status !== 'passed') {
		throw new Error(`curriculum remap proposal is invalid:\n- ${validation.issues.join('\n- ')}`);
	}
	return selectFields(proposal, PROPOSAL_FIELDS);
}

export function validateScienceChallengeCurriculumRemapProposal(
	proposal,
	{
		challengeId,
		basePlanSha256,
		effectivePlanSha256,
		curriculumEvidenceSha256,
		targetCandidateSha256,
		batchCandidateSha256
	} = {}
) {
	const issues = [];
	if (!isRecord(proposal)) return failed(['must be an object.']);
	rejectUnknownOrMissingFields(proposal, PROPOSAL_FIELDS, issues);
	if (!validChallengeId(proposal.challengeId)) issues.push('challengeId must be a canonical id.');
	if (proposal.field !== SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD) {
		issues.push(`field must be ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD}.`);
	}
	if (!validComponentId(proposal.from)) {
		issues.push('from must be a canonical curriculum component id.');
	}
	if (!validComponentId(proposal.to)) {
		issues.push('to must be a canonical curriculum component id.');
	}
	if (proposal.from === proposal.to) issues.push('from and to must differ.');
	for (const field of PROPOSAL_FIELDS.filter((field) => field.endsWith('Sha256'))) {
		if (!SHA256_PATTERN.test(String(proposal[field] ?? ''))) {
			issues.push(`${field} must be a lowercase SHA-256.`);
		}
	}
	const proposalCore = selectFields(
		proposal,
		PROPOSAL_FIELDS.filter((field) => field !== 'proposalSha256')
	);
	if (proposal.proposalSha256 !== canonicalHash(proposalCore)) {
		issues.push('proposalSha256 does not match the canonical proposal core.');
	}
	for (const [field, expected] of [
		['challengeId', challengeId],
		['basePlanSha256', basePlanSha256],
		['effectivePlanSha256', effectivePlanSha256],
		['curriculumEvidenceSha256', curriculumEvidenceSha256],
		['targetCandidateSha256', targetCandidateSha256],
		['batchCandidateSha256', batchCandidateSha256]
	]) {
		if (expected !== undefined && proposal[field] !== expected) {
			issues.push(`${field} does not match its bound evidence.`);
		}
	}
	return issues.length ? failed(issues) : passed();
}

export function validateScienceChallengeCurriculumRemapProposals(
	proposals,
	{
		assignedChallengeIds,
		basePlanSha256,
		effectivePlanSha256,
		curriculumEvidenceSha256,
		candidateById,
		batchCandidateSha256,
		batchCandidateById
	} = {}
) {
	const issues = [];
	if (proposals === undefined) return passed();
	if (!Array.isArray(proposals)) return failed(['must be an array when present.']);
	const proposalByChallengeId = new Map();
	const assignedIds = assignedChallengeIds ? new Set(assignedChallengeIds) : null;
	for (const [index, proposal] of proposals.entries()) {
		const candidate = candidateById?.get(proposal?.challengeId);
		const batchCandidate = batchCandidateById?.get(proposal?.challengeId) ?? batchCandidateSha256;
		const validation = validateScienceChallengeCurriculumRemapProposal(proposal, {
			basePlanSha256,
			effectivePlanSha256,
			curriculumEvidenceSha256,
			targetCandidateSha256: candidate === undefined ? undefined : candidate,
			batchCandidateSha256: batchCandidate
		});
		for (const issue of validation.issues) issues.push(`[${index}].${issue}`);
		if (assignedIds && !assignedIds.has(proposal?.challengeId)) {
			issues.push(`[${index}].challengeId is not assigned to this verifier result.`);
		}
		if (proposalByChallengeId.has(proposal?.challengeId)) {
			issues.push(`[${index}] creates multiple or ambiguous proposals for one challenge.`);
		} else if (typeof proposal?.challengeId === 'string') {
			proposalByChallengeId.set(proposal.challengeId, proposal);
		}
	}
	return issues.length ? failed(issues) : { ...passed(), proposalByChallengeId };
}

export function buildScienceChallengeCurriculumRemapProposalEvidence(value, proposal) {
	const validation = validateScienceChallengeCurriculumRemapProposalEvidence(value, {
		proposal
	});
	if (validation.status !== 'passed') {
		throw new Error(
			`curriculum remap proposal evidence is invalid:\n- ${validation.issues.join('\n- ')}`
		);
	}
	return {
		challengeId: value.challengeId,
		proposalSha256: value.proposalSha256,
		field: value.field,
		from: selectFields(value.from, COMPONENT_EVIDENCE_FIELDS),
		to: selectFields(value.to, COMPONENT_EVIDENCE_FIELDS),
		ancestryChain: value.ancestryChain.map((entry) => selectFields(entry, ANCESTRY_FIELDS)),
		targetRowDiffStatement: value.targetRowDiffStatement,
		originalSingleIssueGate: selectFields(value.originalSingleIssueGate, ISSUE_FIELDS)
	};
}

export function validateScienceChallengeCurriculumRemapProposalEvidence(
	evidence,
	{ proposal } = {}
) {
	const issues = [];
	if (!isRecord(evidence)) return failed(['must be an object.']);
	rejectUnknownOrMissingFields(evidence, DISPLAY_EVIDENCE_FIELDS, issues);
	if (!validChallengeId(evidence.challengeId)) {
		issues.push('challengeId must be a canonical id.');
	}
	if (!SHA256_PATTERN.test(String(evidence.proposalSha256 ?? ''))) {
		issues.push('proposalSha256 must be a lowercase SHA-256.');
	}
	if (evidence.field !== SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD) {
		issues.push(`field must be ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD}.`);
	}
	validateComponentEvidence(evidence.from, 'from', issues);
	validateComponentEvidence(evidence.to, 'to', issues);
	validateAncestryChain(evidence, issues);
	if (!nonEmpty(evidence.targetRowDiffStatement)) {
		issues.push('targetRowDiffStatement must be non-empty.');
	}
	validateOriginalIssue(evidence.originalSingleIssueGate, issues);
	if (proposal) {
		for (const field of ['challengeId', 'proposalSha256', 'field']) {
			if (evidence[field] !== proposal[field]) {
				issues.push(`${field} does not match the immutable proposal.`);
			}
		}
		if (evidence.from?.componentId !== proposal.from) {
			issues.push('from.componentId does not match the immutable proposal.');
		}
		if (evidence.to?.componentId !== proposal.to) {
			issues.push('to.componentId does not match the immutable proposal.');
		}
	}
	return issues.length ? failed(issues) : passed();
}

export function validateScienceChallengeCurriculumRemapProposalEvidenceList(
	evidenceList,
	{ proposals } = {}
) {
	const issues = [];
	if (evidenceList === undefined && (proposals?.length ?? 0) === 0) return passed();
	if (!Array.isArray(evidenceList)) return failed(['must be an array when proposals exist.']);
	const proposalByChallengeId = new Map(
		(proposals ?? []).map((proposal) => [proposal.challengeId, proposal])
	);
	const seen = new Set();
	for (const [index, evidence] of evidenceList.entries()) {
		const proposal = proposalByChallengeId.get(evidence?.challengeId);
		const validation = validateScienceChallengeCurriculumRemapProposalEvidence(evidence, {
			proposal
		});
		for (const issue of validation.issues) issues.push(`[${index}].${issue}`);
		if (!proposal) issues.push(`[${index}] has no assigned immutable proposal.`);
		if (seen.has(evidence?.challengeId)) {
			issues.push(`[${index}] duplicates reviewer-visible evidence for one challenge.`);
		}
		seen.add(evidence?.challengeId);
	}
	for (const proposal of proposals ?? []) {
		if (!seen.has(proposal.challengeId)) {
			issues.push(`is missing reviewer-visible evidence for ${proposal.challengeId}.`);
		}
	}
	return issues.length ? failed(issues) : passed();
}

export function buildScienceChallengeCurriculumRemapVerifierInput({
	basePlanSha256,
	basePlan,
	effectivePlan,
	curriculumCatalogSha256,
	effectiveCohortManifestSha256,
	candidateCount,
	candidateSetSha256,
	remapManifestSetSha256,
	recoveries,
	recoverySetSha256,
	candidateOverrides,
	proposals,
	evidence
}) {
	const value = {
		schemaVersion: SCIENCE_CHALLENGE_CURRICULUM_REMAP_VERIFIER_INPUT_SCHEMA,
		basePlan,
		basePlanSha256,
		effectivePlan,
		effectivePlanSha256: canonicalHash(effectivePlan),
		curriculumCatalogSha256,
		effectiveCohortManifestSha256,
		candidateCount,
		candidateSetSha256,
		remapManifestSetSha256,
		recoveries:
			recoveries ??
			uniqueRecoveryArtifacts(
				candidateOverrides?.map((override) => ({
					manifest: override.manifest,
					priorCandidate: override.priorCandidate,
					candidate: override.candidate
				}))
			),
		recoverySetSha256:
			recoverySetSha256 ??
			canonicalHash(
				recoveries ??
					uniqueRecoveryArtifacts(
						candidateOverrides?.map((override) => ({
							manifest: override.manifest,
							priorCandidate: override.priorCandidate,
							candidate: override.candidate
						}))
					)
			),
		candidateOverrides,
		proposals,
		evidence
	};
	const validation = validateScienceChallengeCurriculumRemapVerifierInput(value);
	if (validation.status !== 'passed') {
		throw new Error(
			`curriculum remap verifier input is invalid:\n- ${validation.issues.join('\n- ')}`
		);
	}
	return value;
}

export function validateScienceChallengeCurriculumRemapVerifierInput(value, proposalOptions = {}) {
	const issues = [];
	if (!isRecord(value)) return failed(['must be an object.']);
	rejectUnknownOrMissingFields(value, VERIFIER_INPUT_FIELDS, issues);
	if (value.schemaVersion !== SCIENCE_CHALLENGE_CURRICULUM_REMAP_VERIFIER_INPUT_SCHEMA) {
		issues.push(
			`schemaVersion must be ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_VERIFIER_INPUT_SCHEMA}.`
		);
	}
	if (!SHA256_PATTERN.test(String(value.basePlanSha256 ?? ''))) {
		issues.push('basePlanSha256 must be a lowercase SHA-256.');
	}
	if (!isRecord(value.basePlan) || value.basePlanSha256 !== canonicalHash(value.basePlan)) {
		issues.push('basePlanSha256 must bind the canonical basePlan.');
	}
	if (!isRecord(value.effectivePlan)) issues.push('effectivePlan must be an object.');
	if (
		!SHA256_PATTERN.test(String(value.effectivePlanSha256 ?? '')) ||
		value.effectivePlanSha256 !== canonicalHash(value.effectivePlan)
	) {
		issues.push('effectivePlanSha256 must bind the canonical effectivePlan.');
	}
	if (
		proposalOptions.basePlanSha256 !== undefined &&
		value.basePlanSha256 !== proposalOptions.basePlanSha256
	) {
		issues.push('basePlanSha256 does not match the expected base plan.');
	}
	for (const field of [
		'curriculumCatalogSha256',
		'effectiveCohortManifestSha256',
		'candidateSetSha256',
		'remapManifestSetSha256',
		'recoverySetSha256'
	]) {
		if (!SHA256_PATTERN.test(String(value[field] ?? ''))) {
			issues.push(`${field} must be a lowercase SHA-256.`);
		}
	}
	if (
		!Number.isSafeInteger(value.candidateCount) ||
		value.candidateCount <= 0 ||
		value.candidateCount !== value.effectivePlan?.rows?.length
	) {
		issues.push('candidateCount must equal the positive effective-plan row count.');
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
				'effectivePlan differs from the exact combined typed recovery projection.',
				...(projection.issues ?? []).map((issue) => `effectivePlan projection: ${issue}`)
			);
		}
	}
	if (!Array.isArray(value.candidateOverrides) || value.candidateOverrides.length === 0) {
		issues.push('candidateOverrides must contain at least one staged shard candidate.');
	} else {
		const shardIds = new Set();
		const manifestIds = new Set();
		const remappedChallengeIds = new Set();
		for (const [index, override] of value.candidateOverrides.entries()) {
			if (!isRecord(override)) {
				issues.push(`candidateOverrides[${index}] must be an object.`);
				continue;
			}
			rejectUnknownOrMissingFields(
				override,
				CANDIDATE_OVERRIDE_FIELDS,
				issues,
				`candidateOverrides[${index}]`
			);
			if (!validChallengeId(override.shardId)) {
				issues.push(`candidateOverrides[${index}].shardId must be a canonical id.`);
			}
			if (shardIds.has(override.shardId)) {
				issues.push(`candidateOverrides[${index}] duplicates a shard.`);
			}
			shardIds.add(override.shardId);
			if (manifestIds.has(override.manifestSha256)) {
				issues.push(`candidateOverrides[${index}] duplicates a remap manifest.`);
			}
			manifestIds.add(override.manifestSha256);
			if (!isRecord(override.candidate)) {
				issues.push(`candidateOverrides[${index}].candidate must be an object.`);
			}
			if (!isRecord(override.priorCandidate)) {
				issues.push(`candidateOverrides[${index}].priorCandidate must be an object.`);
			}
			if (
				!SHA256_PATTERN.test(String(override.candidateSha256 ?? '')) ||
				override.candidateSha256 !== canonicalHash(override.candidate)
			) {
				issues.push(`candidateOverrides[${index}].candidateSha256 must bind the staged candidate.`);
			}
			if (!SHA256_PATTERN.test(String(override.manifestSha256 ?? ''))) {
				issues.push(`candidateOverrides[${index}].manifestSha256 must be a lowercase SHA-256.`);
			}
			if (
				!isRecord(override.manifest) ||
				override.manifestSha256 !== canonicalHash(override.manifest)
			) {
				issues.push(`candidateOverrides[${index}].manifestSha256 must bind the remap manifest.`);
			} else {
				const manifestValidation = validateScienceChallengeDescendantRemapManifest({
					manifest: override.manifest,
					plan: value.basePlan,
					priorCandidate: override.priorCandidate,
					candidate: override.candidate
				});
				for (const issue of manifestValidation.issues) {
					issues.push(`candidateOverrides[${index}].manifest: ${issue}`);
				}
				if (override.manifest.shardId !== override.shardId) {
					issues.push(`candidateOverrides[${index}].shardId differs from its validated manifest.`);
				}
				if (remappedChallengeIds.has(override.manifest.challengeId)) {
					issues.push(`candidateOverrides[${index}] duplicates a remapped challenge.`);
				}
				remappedChallengeIds.add(override.manifest.challengeId);
			}
		}
	}
	const proposalValidation = validateScienceChallengeCurriculumRemapProposals(value.proposals, {
		...proposalOptions,
		basePlanSha256: value.basePlanSha256,
		effectivePlanSha256: value.effectivePlanSha256
	});
	issues.push(...proposalValidation.issues.map((issue) => `proposals${issue}`));
	if (Array.isArray(value.proposals) && Array.isArray(value.candidateOverrides)) {
		if (
			value.remapManifestSetSha256 !==
			canonicalHash(value.candidateOverrides.map((override) => override?.manifest))
		) {
			issues.push('remapManifestSetSha256 differs from the ordered remap manifests.');
		}
		const bijectionValidation =
			validateScienceChallengeCurriculumRemapProposalOverrideBijection(value);
		issues.push(...bijectionValidation.issues);
		const recoveryManifestHashes = new Set(
			(value.recoveries ?? []).map((recovery) => canonicalHash(recovery?.manifest))
		);
		for (const [index, override] of value.candidateOverrides.entries()) {
			if (!recoveryManifestHashes.has(canonicalHash(override?.manifest))) {
				issues.push(
					`candidateOverrides[${index}] manifest is absent from the combined recovery set.`
				);
			}
		}
	}
	const displayValidation = validateScienceChallengeCurriculumRemapProposalEvidenceList(
		value.evidence,
		{
			proposals: Array.isArray(value.proposals) ? value.proposals : []
		}
	);
	issues.push(...displayValidation.issues.map((issue) => `evidence${issue}`));
	return issues.length ? failed(issues) : passed();
}

export function buildScienceChallengeCurriculumRemapVerifierInputFromArtifacts({
	basePlan,
	effectivePlan,
	recoveries,
	curriculumEvidence,
	curriculumCatalog,
	firstReviewSummary,
	effectiveCohortManifest,
	effectiveCohortManifestSha256,
	combinedRecoveries,
	recoverySetSha256
}) {
	if (!Array.isArray(recoveries) || recoveries.length === 0) {
		throw new Error('At least one replayed descendant-remap recovery is required.');
	}
	if (
		!isRecord(effectiveCohortManifest) ||
		effectiveCohortManifest.schemaVersion !== 'science-challenge-effective-cohort/v1' ||
		effectiveCohortManifestSha256 !== canonicalHash(effectiveCohortManifest)
	) {
		throw new Error('A canonical validated effective-cohort manifest is required.');
	}
	const candidateOverrides = [];
	const proposals = [];
	const evidence = [];
	for (const recovery of recoveries) {
		if (recovery?.status !== 'passed') {
			throw new Error('Descendant-remap recovery must be a passed deterministic replay.');
		}
		const validation = validateScienceChallengeDescendantRemapManifest({
			manifest: recovery.manifest,
			plan: basePlan,
			priorCandidate: recovery.priorCandidate,
			candidate: recovery.candidate
		});
		if (validation.status !== 'passed') {
			throw new Error(
				`replayed descendant-remap manifest is invalid:\n- ${validation.issues.join('\n- ')}`
			);
		}
		const manifest = recovery.manifest;
		if (
			manifest.evidence.curriculumEvidenceSha256 !== canonicalHash(curriculumEvidence) ||
			manifest.evidence.curriculumCatalogSha256 !== canonicalHash(curriculumCatalog) ||
			manifest.firstReview.summarySha256 !== canonicalHash(firstReviewSummary)
		) {
			throw new Error(
				'Descendant-remap reviewer evidence differs from the manifest-bound curriculum or first review.'
			);
		}
		const baseEvidence = curriculumEvidence.components?.find(
			(component) => component.componentId === manifest.base.component.curriculumComponentId
		);
		const effectiveEvidence = curriculumEvidence.components?.find(
			(component) => component.componentId === manifest.effective.component.curriculumComponentId
		);
		if (
			!baseEvidence ||
			!effectiveEvidence ||
			manifest.evidence.baseEvidenceSha256 !== canonicalHash(baseEvidence) ||
			manifest.evidence.effectiveEvidenceSha256 !== canonicalHash(effectiveEvidence) ||
			baseEvidence.sourceTextSha256 !== canonicalHash(baseEvidence.sourceText) ||
			effectiveEvidence.sourceTextSha256 !== canonicalHash(effectiveEvidence.sourceText)
		) {
			throw new Error(
				'Descendant-remap component excerpts differ from the manifest-bound evidence.'
			);
		}
		const firstReview = firstReviewSummary.reviews?.find(
			(review) => review.id === manifest.challengeId
		);
		if (
			!firstReview ||
			canonicalHash(firstReview) !== manifest.firstReview.reviewSha256 ||
			firstReview.issues?.length !== 1 ||
			firstReview.issues[0]?.field !== SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD
		) {
			throw new Error('Descendant-remap original single-issue gate is missing or stale.');
		}
		const proposal = buildScienceChallengeCurriculumRemapProposal({
			challengeId: manifest.challengeId,
			field: manifest.remap.field,
			from: manifest.remap.from,
			to: manifest.remap.to,
			basePlanSha256: manifest.base.planSha256,
			effectivePlanSha256: canonicalHash(effectivePlan),
			curriculumEvidenceSha256: manifest.evidence.curriculumEvidenceSha256,
			targetCandidateSha256: manifest.candidateTargetSha256,
			batchCandidateSha256: manifest.candidateSha256,
			baseReviewSha256: manifest.firstReview.summarySha256,
			manifestSha256: canonicalHash(manifest)
		});
		candidateOverrides.push({
			shardId: manifest.shardId,
			manifest,
			candidate: recovery.candidate,
			priorCandidate: recovery.priorCandidate,
			candidateSha256: canonicalHash(recovery.candidate),
			manifestSha256: canonicalHash(manifest)
		});
		proposals.push(proposal);
		evidence.push(
			buildScienceChallengeCurriculumRemapProposalEvidence(
				{
					challengeId: proposal.challengeId,
					proposalSha256: proposal.proposalSha256,
					field: proposal.field,
					from: componentDisplayEvidence(baseEvidence),
					to: componentDisplayEvidence(effectiveEvidence),
					ancestryChain: curriculumAncestry(curriculumCatalog, proposal.from, proposal.to),
					targetRowDiffStatement:
						'Only grounding.curriculumComponentId changes on the selected challenge row; all other candidate bytes remain identical.',
					originalSingleIssueGate: firstReview.issues[0]
				},
				proposal
			)
		);
	}
	const remapManifestSetSha256 = canonicalHash(
		candidateOverrides.map((override) => override.manifest)
	);
	const selectedRecoveries =
		combinedRecoveries ??
		uniqueRecoveryArtifacts(
			recoveries.map((recovery) => ({
				manifest: recovery.manifest,
				priorCandidate: recovery.priorCandidate,
				candidate: recovery.candidate
			}))
		);
	const selectedRecoverySetSha256 = canonicalHash(selectedRecoveries);
	if (
		effectiveCohortManifest.planId !== effectivePlan.planId ||
		effectiveCohortManifest.basePlanSha256 !== canonicalHash(basePlan) ||
		effectiveCohortManifest.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		effectiveCohortManifest.curriculumEvidenceSha256 !== canonicalHash(curriculumEvidence) ||
		effectiveCohortManifest.curriculumCatalogSha256 !== canonicalHash(curriculumCatalog) ||
		effectiveCohortManifest.remapManifestSetSha256 !== remapManifestSetSha256 ||
		effectiveCohortManifest.recoverySetSha256 !== selectedRecoverySetSha256 ||
		(recoverySetSha256 !== undefined && recoverySetSha256 !== selectedRecoverySetSha256) ||
		!Number.isSafeInteger(effectiveCohortManifest.candidateCount) ||
		effectiveCohortManifest.candidateCount !== effectivePlan.rows?.length ||
		!SHA256_PATTERN.test(String(effectiveCohortManifest.candidateSetSha256 ?? ''))
	) {
		throw new Error(
			'Effective-cohort manifest differs from the verifier plans, curriculum, remaps, or candidate set.'
		);
	}
	return buildScienceChallengeCurriculumRemapVerifierInput({
		basePlan,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlan,
		curriculumCatalogSha256: effectiveCohortManifest.curriculumCatalogSha256,
		effectiveCohortManifestSha256,
		candidateCount: effectiveCohortManifest.candidateCount,
		candidateSetSha256: effectiveCohortManifest.candidateSetSha256,
		remapManifestSetSha256,
		recoveries: selectedRecoveries,
		recoverySetSha256: selectedRecoverySetSha256,
		candidateOverrides,
		proposals,
		evidence
	});
}

function componentDisplayEvidence(component) {
	return {
		componentId: component.componentId,
		title: component.title,
		sourceTextSha256: component.sourceTextSha256,
		substantiveExcerpt: component.sourceText
	};
}

export function validateScienceChallengeCurriculumRemapProposalOverrideBijection(value) {
	const issues = [];
	if (
		!isRecord(value) ||
		!Array.isArray(value.proposals) ||
		!Array.isArray(value.candidateOverrides)
	) {
		return failed(['proposals and candidateOverrides must both be arrays.']);
	}
	if (value.proposals.length !== value.candidateOverrides.length) {
		issues.push(
			'proposals and candidateOverrides must form a one-to-one set with identical counts.'
		);
	}
	const proposalIndexesByManifest = new Map();
	for (const [proposalIndex, proposal] of value.proposals.entries()) {
		const indexes = proposalIndexesByManifest.get(proposal?.manifestSha256) ?? [];
		indexes.push(proposalIndex);
		proposalIndexesByManifest.set(proposal?.manifestSha256, indexes);
	}
	const consumedProposalIndexes = new Set();
	for (const [overrideIndex, override] of value.candidateOverrides.entries()) {
		if (!isRecord(override) || !isRecord(override.manifest)) continue;
		const manifest = override.manifest;
		const matchingProposalIndexes = proposalIndexesByManifest.get(override.manifestSha256) ?? [];
		if (matchingProposalIndexes.length !== 1) {
			issues.push(
				`candidateOverrides[${overrideIndex}] must bind exactly one proposal by manifestSha256.`
			);
			continue;
		}
		const proposalIndex = matchingProposalIndexes[0];
		consumedProposalIndexes.add(proposalIndex);
		const proposal = value.proposals[proposalIndex];
		const expected = {
			challengeId: manifest.challengeId,
			field: manifest.remap?.field,
			from: manifest.remap?.from,
			to: manifest.remap?.to,
			basePlanSha256: manifest.base?.planSha256,
			effectivePlanSha256: value.effectivePlanSha256 ?? manifest.effective?.planSha256,
			curriculumEvidenceSha256: manifest.evidence?.curriculumEvidenceSha256,
			targetCandidateSha256: manifest.candidateTargetSha256,
			batchCandidateSha256: manifest.candidateSha256,
			baseReviewSha256: manifest.firstReview?.summarySha256,
			manifestSha256: override.manifestSha256
		};
		for (const [field, expectedValue] of Object.entries(expected)) {
			if (proposal?.[field] !== expectedValue) {
				issues.push(
					`proposals[${proposalIndex}].${field} differs from candidateOverrides[${overrideIndex}] manifest-derived identity.`
				);
			}
		}
		if (override.candidateSha256 !== manifest.candidateSha256) {
			issues.push(
				`candidateOverrides[${overrideIndex}].candidateSha256 differs from its manifest candidateSha256.`
			);
		}
		const baseRow = value.basePlan?.rows?.[manifest.base?.planRowIndex];
		const effectiveRow = value.effectivePlan?.rows?.[manifest.effective?.planRowIndex];
		if (
			baseRow?.id !== manifest.challengeId ||
			effectiveRow?.id !== manifest.challengeId ||
			baseRow?.shard !== override.shardId ||
			effectiveRow?.shard !== override.shardId
		) {
			issues.push(
				`candidateOverrides[${overrideIndex}] challenge and shard identity differ from the base/effective plans.`
			);
		}
	}
	for (const [proposalIndex] of value.proposals.entries()) {
		if (!consumedProposalIndexes.has(proposalIndex)) {
			issues.push(`proposals[${proposalIndex}] has no unique candidateOverride.`);
		}
	}
	return issues.length ? failed(issues) : passed();
}

function curriculumAncestry(catalog, from, to) {
	const specifications = Array.isArray(catalog?.specifications)
		? catalog.specifications
		: [catalog];
	const components = specifications.flatMap((specification) =>
		Array.isArray(specification?.components) ? specification.components : []
	);
	const byId = new Map(components.map((component) => [component.id, component]));
	const reverse = [];
	const seen = new Set();
	let current = byId.get(to);
	while (current && !seen.has(current.id)) {
		reverse.push({ componentId: current.id, title: current.title });
		if (current.id === from) break;
		seen.add(current.id);
		current = byId.get(current.parentId);
	}
	const ancestry = reverse.reverse();
	if (ancestry[0]?.componentId !== from || ancestry.at(-1)?.componentId !== to) {
		throw new Error('Descendant-remap catalog ancestry does not connect from to target.');
	}
	return ancestry;
}

export function validateScienceChallengeContentReviewRow(
	review,
	{ proposal, difficultyProposal } = {}
) {
	const issues = [];
	const shared = validateIndependentContentReviewRow(review);
	issues.push(...shared.issues);
	if (!isRecord(review)) return failed(issues);
	rejectUnknownFields(review, REVIEW_FIELDS, issues, 'review');
	if (Array.isArray(review.issues)) {
		for (const [index, issue] of review.issues.entries()) {
			if (isRecord(issue)) rejectUnknownFields(issue, ISSUE_FIELDS, issues, `issues[${index}]`);
		}
	}

	const decisions = review[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY];
	if (decisions !== undefined && !Array.isArray(decisions)) {
		issues.push(`${SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY} must be an array.`);
		return failed(issues);
	}
	if ((decisions?.length ?? 0) > 1) {
		issues.push(
			`${SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY} must contain at most one decision.`
		);
	}
	if (proposal && decisions?.length !== 1) {
		issues.push('The assigned curriculum remap proposal requires exactly one decision.');
	}
	if (!proposal && (decisions?.length ?? 0) !== 0) {
		issues.push('A curriculum remap decision has no assigned proposal.');
	}
	for (const [index, decision] of (decisions ?? []).entries()) {
		const decisionIssues = validateDecision(decision, { review, proposal });
		for (const issue of decisionIssues) {
			issues.push(`${SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY}[${index}].${issue}`);
		}
	}
	const difficultyDecisionValidation =
		validateScienceChallengeDifficultyPlanAdjustmentReviewDecision(review, {
			proposal: difficultyProposal
		});
	issues.push(...difficultyDecisionValidation.issues);
	return issues.length ? failed(issues) : passed();
}

export function exactCurriculumRemapProposalMatch(left, right) {
	return (
		isRecord(left) &&
		isRecord(right) &&
		PROPOSAL_FIELDS.every((field) => left[field] === right[field]) &&
		Object.keys(left).length === PROPOSAL_FIELDS.length &&
		Object.keys(right).length === PROPOSAL_FIELDS.length
	);
}

function validateDecision(decision, { review, proposal }) {
	const issues = [];
	if (!isRecord(decision)) return ['must be an object.'];
	rejectUnknownOrMissingFields(decision, DECISION_FIELDS, issues);
	if (!validChallengeId(decision.challengeId)) issues.push('challengeId must be a canonical id.');
	if (decision.challengeId !== review.id) issues.push('challengeId must equal the review id.');
	if (decision.field !== SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD) {
		issues.push(`field must be ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD}.`);
	}
	if (!validComponentId(decision.from)) {
		issues.push('from must be a canonical curriculum component id.');
	}
	if (!validComponentId(decision.to)) {
		issues.push('to must be a canonical curriculum component id.');
	}
	if (decision.from === decision.to) issues.push('from and to must differ.');
	if (typeof decision.accepted !== 'boolean') issues.push('accepted must be boolean.');
	if (
		proposal &&
		!['challengeId', 'field', 'from', 'to'].every((field) => decision[field] === proposal[field])
	) {
		issues.push('does not exactly match the assigned immutable proposal.');
	}
	if (
		decision.accepted === true &&
		(review.accepted !== true || review.curriculumGrounded !== true)
	) {
		issues.push(
			'an accepted remap requires overall challenge acceptance and curriculumGrounded=true.'
		);
	}
	return issues;
}

function rejectUnknownOrMissingFields(value, expectedFields, issues, label) {
	rejectUnknownFields(value, expectedFields, issues, label);
	for (const field of expectedFields) {
		if (!Object.hasOwn(value, field)) {
			issues.push(`${label ? `${label}.` : ''}${field} is required.`);
		}
	}
}

function rejectUnknownFields(value, expectedFields, issues, label) {
	const allowed = new Set(expectedFields);
	for (const field of Object.keys(value)) {
		if (!allowed.has(field)) issues.push(`${label ? `${label}.` : ''}${field} is unknown.`);
	}
}

function validateComponentEvidence(component, label, issues) {
	if (!isRecord(component)) {
		issues.push(`${label} must be an object.`);
		return;
	}
	rejectUnknownOrMissingFields(component, COMPONENT_EVIDENCE_FIELDS, issues, label);
	if (!validComponentId(component.componentId)) {
		issues.push(`${label}.componentId must be a canonical id.`);
	}
	for (const field of ['title', 'substantiveExcerpt']) {
		if (!nonEmpty(component[field])) issues.push(`${label}.${field} must be non-empty.`);
	}
	if (!SHA256_PATTERN.test(String(component.sourceTextSha256 ?? ''))) {
		issues.push(`${label}.sourceTextSha256 must be a lowercase SHA-256.`);
	}
}

function validateAncestryChain(evidence, issues) {
	if (!Array.isArray(evidence.ancestryChain) || evidence.ancestryChain.length < 2) {
		issues.push('ancestryChain must contain at least the from and to components.');
		return;
	}
	const seen = new Set();
	for (const [index, component] of evidence.ancestryChain.entries()) {
		const label = `ancestryChain[${index}]`;
		if (!isRecord(component)) {
			issues.push(`${label} must be an object.`);
			continue;
		}
		rejectUnknownOrMissingFields(component, ANCESTRY_FIELDS, issues, label);
		if (!validComponentId(component.componentId)) {
			issues.push(`${label}.componentId must be a canonical id.`);
		}
		if (!nonEmpty(component.title)) issues.push(`${label}.title must be non-empty.`);
		if (seen.has(component.componentId)) issues.push(`${label} repeats a component id.`);
		seen.add(component.componentId);
	}
	const first = evidence.ancestryChain[0];
	const last = evidence.ancestryChain.at(-1);
	if (first?.componentId !== evidence.from?.componentId) {
		issues.push('ancestryChain must start with the from component.');
	}
	if (last?.componentId !== evidence.to?.componentId) {
		issues.push('ancestryChain must end with the to component.');
	}
	if (first?.title !== evidence.from?.title) {
		issues.push('ancestryChain from title differs from the from evidence.');
	}
	if (last?.title !== evidence.to?.title) {
		issues.push('ancestryChain to title differs from the to evidence.');
	}
}

function validateOriginalIssue(issue, issues) {
	if (!isRecord(issue)) {
		issues.push('originalSingleIssueGate must be an object.');
		return;
	}
	rejectUnknownOrMissingFields(issue, ISSUE_FIELDS, issues, 'originalSingleIssueGate');
	for (const field of ISSUE_FIELDS) {
		if (!nonEmpty(issue[field])) {
			issues.push(`originalSingleIssueGate.${field} must be non-empty.`);
		}
	}
	if (issue.field !== SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD) {
		issues.push(
			`originalSingleIssueGate.field must be ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_FIELD}.`
		);
	}
}

function selectFields(value, fields) {
	return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function validChallengeId(value) {
	return typeof value === 'string' && CHALLENGE_ID_PATTERN.test(value);
}

function validComponentId(value) {
	return typeof value === 'string' && COMPONENT_ID_PATTERN.test(value);
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
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
		return failed(['recoveries must be a non-empty canonical array bound by recoverySetSha256.']);
	}
	const seen = new Set();
	for (const [index, recovery] of recoveries.entries()) {
		if (isRecord(recovery)) {
			rejectUnknownOrMissingFields(
				recovery,
				RECOVERY_ARTIFACT_FIELDS,
				issues,
				`recoveries[${index}]`
			);
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

function failed(issues) {
	return { status: 'failed', issues };
}

function passed() {
	return { status: 'passed', issues: [] };
}
