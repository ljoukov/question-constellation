#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';

import {
	canonicalHash,
	stableStringify,
	validateChallengePlan
} from './lib/science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY,
	validateScienceChallengeCurriculumRemapVerifierInput
} from './lib/science-challenge-curriculum-remap-review.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY,
	validateScienceChallengeDifficultyPlanAdjustmentVerifierInput
} from './lib/science-challenge-difficulty-plan-adjustment-review.mjs';
import {
	buildSameCurriculumComponentPeerEvidence,
	SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA
} from './lib/science-challenge-verification-peers.mjs';
import {
	discoverScienceChallengeEffectiveCohortManifest,
	readScienceChallengeEffectiveCohort,
	validateScienceChallengeReviewRebaseSuccessorLineage
} from './lib/science-challenge-effective-cohort.mjs';
import { readScienceChallengeReviewRebaseEvidence } from './lib/science-challenge-review-rebase-evidence.mjs';
import {
	buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding,
	inspectScienceChallengeReviewRebaseInfrastructureRecovery,
	inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal,
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding
} from './lib/science-challenge-review-rebase-infra-recovery.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
const basePlan = readJson(args.plan);
const source = readJson(args.source);
const evidence = readJson(args.evidence);
const basePlanValidation = validateChallengePlan(basePlan, {
	sourceSnapshot: source,
	curriculumEvidence: evidence
});
if (basePlanValidation.status !== 'passed') {
	throw new Error(
		`Plan/source/evidence validation failed:\n${basePlanValidation.issues.join('\n')}`
	);
}
if (
	args.reviewRebaseManifest &&
	(args.curriculumRemapInput || args.difficultyPlanAdjustmentInput)
) {
	throw new Error(
		'--review-rebase-manifest is mutually exclusive with exceptional-recovery verifier inputs.'
	);
}
const remapInput = args.curriculumRemapInput ? readJson(args.curriculumRemapInput) : null;
const difficultyAdjustmentInput = args.difficultyPlanAdjustmentInput
	? readJson(args.difficultyPlanAdjustmentInput)
	: null;
if ((remapInput || difficultyAdjustmentInput) && !args.effectiveCohortManifest) {
	throw new Error(
		'An exceptional-recovery verifier input and --effective-cohort-manifest must be supplied together.'
	);
}
const selectedEffectiveManifest = args.effectiveCohortManifest
	? readJson(args.effectiveCohortManifest)
	: null;
let reviewRebaseInfrastructureRecoveryEvidence = null;
let reviewRebaseInfrastructureRecoveryTerminal = null;
let autoResolvedReviewRebaseManifest = null;
if (selectedEffectiveManifest?.infrastructureRecovery !== undefined) {
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(
		selectedEffectiveManifest.infrastructureRecovery
	);
	const recoveryManifestPath = resolveRepositoryRelativePath(
		rootDir,
		selectedEffectiveManifest.infrastructureRecovery.manifestPath,
		'infrastructure-recovery manifest'
	);
	const recoveryManifest = readJson(recoveryManifestPath);
	if (
		canonicalHash(recoveryManifest) !==
		selectedEffectiveManifest.infrastructureRecovery.manifestSha256
	) {
		throw new Error(
			'Terminal effective cohort infrastructure-recovery manifest hash differs from disk.'
		);
	}
	autoResolvedReviewRebaseManifest = recoveryManifest.reviewRebase?.manifestPath ?? null;
	if (!autoResolvedReviewRebaseManifest) {
		throw new Error(
			'Infrastructure-recovery manifest does not bind its B0 review-rebase manifest.'
		);
	}
	const existingDefinitions = await loadExistingCatalog();
	reviewRebaseInfrastructureRecoveryEvidence =
		inspectScienceChallengeReviewRebaseInfrastructureRecovery({
			workspaceRoot: rootDir,
			reviewRebaseManifestPath: autoResolvedReviewRebaseManifest,
			verificationSummaryPath: recoveryManifest.verification?.summaryPath,
			failedRoot: recoveryManifest.failedRoot?.path,
			successorRoot: recoveryManifest.successor?.path,
			existingDefinitions
		});
	reviewRebaseInfrastructureRecoveryTerminal =
		inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
			evidence: reviewRebaseInfrastructureRecoveryEvidence,
			referenceRoot: rootDir
		});
	if (reviewRebaseInfrastructureRecoveryTerminal.status !== 'passed') {
		throw new Error(
			`Infrastructure-recovery terminal replay failed:\n${(
				reviewRebaseInfrastructureRecoveryTerminal.issues ?? []
			).join('\n')}`
		);
	}
	const expectedInfrastructureRecoveryBinding =
		buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
			evidence: reviewRebaseInfrastructureRecoveryTerminal,
			referenceRoot: rootDir
		});
	if (
		canonicalHash(expectedInfrastructureRecoveryBinding) !==
		canonicalHash(selectedEffectiveManifest.infrastructureRecovery)
	) {
		throw new Error(
			'Terminal effective cohort infrastructure-recovery binding differs from closed-world replay.'
		);
	}
}
if (
	args.reviewRebaseManifest &&
	autoResolvedReviewRebaseManifest &&
	path.resolve(rootDir, args.reviewRebaseManifest) !==
		path.resolve(rootDir, autoResolvedReviewRebaseManifest)
) {
	throw new Error(
		'--review-rebase-manifest differs from the terminal effective cohort recovery ancestry.'
	);
}
const resolvedReviewRebaseManifest = args.reviewRebaseManifest ?? autoResolvedReviewRebaseManifest;
const reviewRebase = resolvedReviewRebaseManifest
	? readScienceChallengeReviewRebaseEvidence({
			repositoryRoot: rootDir,
			manifestPath: resolvedReviewRebaseManifest,
			existingDefinitions: await loadExistingCatalog()
		})
	: null;
if (reviewRebase && reviewRebase.status !== 'passed') {
	throw new Error(`Review-rebase replay failed:\n${(reviewRebase.issues ?? []).join('\n')}`);
}
const directReviewRebase = reviewRebase && !args.effectiveCohortManifest ? reviewRebase : null;
const reviewRebaseAncestry = reviewRebase && args.effectiveCohortManifest ? reviewRebase : null;
if (
	reviewRebase &&
	(reviewRebase.coreManifest.status !== 'review-pending' ||
		reviewRebase.coreManifest.requiresFreshFullVerification !== true ||
		reviewRebase.coreManifest.releaseEligible !== false ||
		reviewRebase.coreManifest.sourceSnapshotSha256 !== canonicalHash(source) ||
		reviewRebase.coreManifest.curriculumEvidenceSha256 !== canonicalHash(evidence) ||
		(directReviewRebase && reviewRebase.coreManifest.basePlanSha256 !== canonicalHash(basePlan)))
) {
	throw new Error(
		'Review-rebase replay does not bind the exact base plan, source, curriculum evidence, or review-pending disposition.'
	);
}
const effectiveCohort = args.effectiveCohortManifest
	? readScienceChallengeEffectiveCohort({
			manifestPath: path.resolve(rootDir, args.effectiveCohortManifest),
			referenceRoot: path.resolve(rootDir, args.generationRoot),
			basePlan,
			expectedSourceSnapshotSha256: canonicalHash(source),
			expectedCurriculumEvidenceSha256: canonicalHash(evidence),
			...(remapInput?.curriculumCatalogSha256
				? { expectedCurriculumCatalogSha256: remapInput.curriculumCatalogSha256 }
				: {}),
			reviewRebaseEvidence: reviewRebaseAncestry,
			reviewRebaseInfrastructureRecoveryEvidence
		})
	: null;
if (effectiveCohort && effectiveCohort.status !== 'passed') {
	throw new Error(`Effective-cohort replay failed:\n${(effectiveCohort.issues ?? []).join('\n')}`);
}
if (effectiveCohort) {
	const generationRoot = path.resolve(rootDir, args.generationRoot);
	const terminalManifestPath = discoverScienceChallengeEffectiveCohortManifest(generationRoot);
	if (
		!terminalManifestPath ||
		realpathSync(terminalManifestPath) !==
			realpathSync(path.resolve(rootDir, args.effectiveCohortManifest))
	) {
		throw new Error(
			'Verification preparation requires the single discoverable terminal effective cohort.'
		);
	}
}
const plan = directReviewRebase?.plan ?? effectiveCohort?.effectivePlan ?? basePlan;
const planValidation = validateChallengePlan(plan, {
	sourceSnapshot: source,
	curriculumEvidence: evidence
});
if (planValidation.status !== 'passed') {
	throw new Error(
		`Effective plan/source/evidence validation failed:\n${planValidation.issues.join('\n')}`
	);
}
const basePlanSha256 = canonicalHash(basePlan);
const planSha256 = canonicalHash(plan);
const sourceSnapshotSha256 = canonicalHash(source);
const curriculumEvidenceSha256 = canonicalHash(evidence);
const sourceById = new Map(source.questions.map((question) => [question.id, question]));
const evidenceById = new Map(
	evidence.components.map((component) => [component.componentId, component])
);
const outputRoot = path.resolve(rootDir, args.outputRoot);
if (reviewRebase && existsSync(outputRoot)) {
	throw new Error(
		'Review-rebase verification requires a fresh absent output root; refusing to reuse prior assignments, ledgers, packets or reviews.'
	);
}
const assignments = [];
const candidateById = new Map();
const candidateShardById = new Map();
const candidateBatchByShard = new Map();
const orderedShardIds = [...new Set(plan.rows.map((row) => row.shard))].sort();
const planRowIndexById = new Map(plan.rows.map((row, planRowIndex) => [row.id, planRowIndex]));

for (const shardId of orderedShardIds) {
	const candidate =
		directReviewRebase?.candidateBatches.get(shardId) ??
		effectiveCohort?.candidateBatches.get(shardId) ??
		readGenerationCandidate({ rootDir, generationRoot: args.generationRoot, shardId });
	candidateBatchByShard.set(shardId, candidate);
	for (const entry of candidate.challenges ?? []) {
		const id = entry?.definition?.id;
		if (!id) throw new Error(`${shardId} contains a candidate without an id.`);
		if (candidateById.has(id)) throw new Error(`Generated candidate id ${id} is duplicated.`);
		candidateById.set(id, entry);
		candidateShardById.set(id, shardId);
	}
}

const missingCandidateIds = plan.rows
	.filter((row) => !candidateById.has(row.id))
	.map((row) => row.id);
if (missingCandidateIds.length) {
	throw new Error(`Generated candidates are incomplete: ${missingCandidateIds.join(', ')}.`);
}
const misplacedCandidateIds = plan.rows
	.filter((row) => candidateShardById.get(row.id) !== row.shard)
	.map((row) => row.id);
if (misplacedCandidateIds.length) {
	throw new Error(
		`Generated candidates are in the wrong shard: ${misplacedCandidateIds.join(', ')}.`
	);
}
const plannedIds = new Set(plan.rows.map((row) => row.id));
const unexpectedCandidateIds = [...candidateById.keys()].filter((id) => !plannedIds.has(id)).sort();
if (unexpectedCandidateIds.length) {
	throw new Error(
		`Generated candidates are not present in the plan: ${unexpectedCandidateIds.join(', ')}.`
	);
}
const candidateSetSha256 = canonicalHash(plan.rows.map((row) => candidateById.get(row.id)));
const reviewRebaseBindings = directReviewRebase
	? buildReviewRebaseBindings(directReviewRebase, candidateSetSha256)
	: null;
const effectiveRecoveries = effectiveCohort?.recoveries ?? [];
const effectiveRemapManifestCount = effectiveCohort?.remapManifests?.length ?? 0;
const effectiveDifficultyAdjustmentManifestCount =
	effectiveCohort?.difficultyAdjustmentManifests?.length ?? 0;
const reviewRebaseSuccessorLineage =
	effectiveCohort?.manifest?.parentChain && reviewRebaseAncestry
		? validateScienceChallengeReviewRebaseSuccessorLineage({
				effectiveCohort,
				reviewRebaseEvidence: reviewRebaseAncestry,
				reviewRebaseInfrastructureRecoveryEvidence
			})
		: null;
if (reviewRebaseSuccessorLineage && reviewRebaseSuccessorLineage.status !== 'passed') {
	throw new Error(
		`Authenticated review-rebase successor ancestry is invalid:\n${(
			reviewRebaseSuccessorLineage.issues ?? []
		).join('\n')}`
	);
}
const authenticatedEmptyReviewRebaseSuccessor = reviewRebaseSuccessorLineage?.status === 'passed';
if (effectiveRemapManifestCount > 0 && !remapInput) {
	throw new Error(
		'The selected effective cohort contains curriculum remaps but no curriculum-remap verifier input was supplied.'
	);
}
if (effectiveDifficultyAdjustmentManifestCount > 0 && !difficultyAdjustmentInput) {
	throw new Error(
		'The selected effective cohort contains difficulty-plan adjustments but no difficulty-plan adjustment verifier input was supplied.'
	);
}
if (
	authenticatedEmptyReviewRebaseSuccessor &&
	(!Array.isArray(effectiveCohort.recoveries) ||
		effectiveCohort.recoveries.length !== 0 ||
		effectiveCohort.manifest.recoveryCount !== 0 ||
		effectiveCohort.manifest.recoverySetSha256 !== canonicalHash([]))
) {
	throw new Error(
		'Authenticated review-rebase successor must bind the canonical empty recovery set.'
	);
}
if (
	effectiveCohort &&
	!remapInput &&
	!difficultyAdjustmentInput &&
	!authenticatedEmptyReviewRebaseSuccessor
) {
	throw new Error(
		'An effective cohort without typed recovery inputs must be an authenticated review-rebase successor.'
	);
}
const recoverySetSha256 =
	remapInput?.recoverySetSha256 ??
	difficultyAdjustmentInput?.recoverySetSha256 ??
	(authenticatedEmptyReviewRebaseSuccessor ? effectiveCohort.manifest.recoverySetSha256 : null);
if (
	effectiveCohort &&
	(remapInput || difficultyAdjustmentInput) &&
	(!Array.isArray(effectiveCohort.recoveries) ||
		effectiveCohort.recoveries.length === 0 ||
		effectiveCohort.manifest.recoverySetSha256 !== canonicalHash(effectiveCohort.recoveries) ||
		recoverySetSha256 !== effectiveCohort.manifest.recoverySetSha256)
) {
	throw new Error(
		'Exceptional-recovery verifier inputs differ from the effective cohort replayable recovery set.'
	);
}
if (
	remapInput &&
	difficultyAdjustmentInput &&
	(remapInput.recoverySetSha256 !== difficultyAdjustmentInput.recoverySetSha256 ||
		canonicalHash(remapInput.recoveries) !== canonicalHash(difficultyAdjustmentInput.recoveries))
) {
	throw new Error(
		'Curriculum-remap and difficulty-plan adjustment verifier inputs bind different typed recoveries.'
	);
}
if (remapInput) {
	const historicalRemapCandidates = historicalRemapCandidateBindings(remapInput);
	const remapValidation = validateScienceChallengeCurriculumRemapVerifierInput(remapInput, {
		assignedChallengeIds: plan.rows.map((row) => row.id),
		basePlanSha256,
		curriculumEvidenceSha256,
		candidateById: new Map(
			plan.rows.map((row) => [
				row.id,
				historicalRemapCandidates.targetById.get(row.id) ?? canonicalHash(candidateById.get(row.id))
			])
		),
		batchCandidateById: new Map(
			plan.rows.map((row) => [
				row.id,
				historicalRemapCandidates.batchByShard.get(row.shard) ??
					canonicalHash(candidateBatchByShard.get(row.shard))
			])
		)
	});
	if (
		remapValidation.status !== 'passed' ||
		canonicalHash(remapInput.recoveries) !== canonicalHash(effectiveRecoveries) ||
		remapInput.effectivePlanSha256 !== planSha256 ||
		remapInput.candidateSetSha256 !== candidateSetSha256 ||
		remapInput.candidateCount !== plan.rows.length ||
		remapInput.effectiveCohortManifestSha256 !== canonicalHash(effectiveCohort.manifest) ||
		remapInput.remapManifestSetSha256 !== effectiveCohort.manifest.remapManifestSetSha256 ||
		remapInput.proposals.length === 0
	) {
		throw new Error(
			`Curriculum remap verifier input is invalid:\n${[
				...remapValidation.issues,
				...(canonicalHash(remapInput.recoveries) === canonicalHash(effectiveRecoveries)
					? []
					: ['recoveries differ from the selected effective-cohort typed recovery manifests.']),
				...(remapInput.effectivePlanSha256 === planSha256
					? []
					: ['effectivePlanSha256 differs from the selected effective plan.']),
				...(remapInput.candidateSetSha256 === candidateSetSha256
					? []
					: ['candidateSetSha256 differs from the selected effective candidate set.']),
				...(remapInput.candidateCount === plan.rows.length
					? []
					: ['candidateCount differs from the selected effective plan.']),
				...(remapInput.effectiveCohortManifestSha256 === canonicalHash(effectiveCohort.manifest)
					? []
					: ['effectiveCohortManifestSha256 differs from the selected manifest.']),
				...(remapInput.remapManifestSetSha256 === effectiveCohort.manifest.remapManifestSetSha256
					? []
					: ['remapManifestSetSha256 differs from the selected manifest.']),
				...(remapInput.proposals.length > 0 ? [] : ['at least one remap proposal is required.'])
			].join('\n')}`
		);
	}
}
if (difficultyAdjustmentInput) {
	const difficultyValidation = validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(
		difficultyAdjustmentInput,
		{
			basePlan,
			effectivePlan: plan
		}
	);
	const expectedManifestSha256 = canonicalHash(effectiveCohort.manifest);
	if (
		difficultyValidation.status !== 'passed' ||
		canonicalHash(difficultyAdjustmentInput.recoveries) !== canonicalHash(effectiveRecoveries) ||
		difficultyAdjustmentInput.effectiveCohortManifestSha256 !== expectedManifestSha256 ||
		difficultyAdjustmentInput.candidateSetSha256 !== candidateSetSha256 ||
		difficultyAdjustmentInput.candidateCount !== plan.rows.length ||
		difficultyAdjustmentInput.adjustmentManifestSetSha256 !==
			effectiveCohort.manifest.difficultyAdjustmentManifestSetSha256 ||
		difficultyAdjustmentInput.proposals.length === 0
	) {
		throw new Error(
			`Difficulty-plan adjustment verifier input is invalid:\n${[
				...difficultyValidation.issues,
				...(canonicalHash(difficultyAdjustmentInput.recoveries) ===
				canonicalHash(effectiveRecoveries)
					? []
					: ['recoveries differ from the selected effective-cohort typed recovery manifests.']),
				...(difficultyAdjustmentInput.effectiveCohortManifestSha256 === expectedManifestSha256
					? []
					: ['effectiveCohortManifestSha256 differs from the selected effective-cohort manifest.']),
				...(difficultyAdjustmentInput.candidateSetSha256 === candidateSetSha256
					? []
					: ['candidateSetSha256 differs from the selected effective candidate set.']),
				...(difficultyAdjustmentInput.candidateCount === plan.rows.length
					? []
					: ['candidateCount differs from the selected effective plan.']),
				...(difficultyAdjustmentInput.adjustmentManifestSetSha256 ===
				effectiveCohort.manifest.difficultyAdjustmentManifestSetSha256
					? []
					: ['adjustmentManifestSetSha256 differs from the selected effective-cohort manifest.']),
				...(difficultyAdjustmentInput.proposals.length > 0
					? []
					: ['at least one difficulty-plan adjustment proposal is required.'])
			].join('\n')}`
		);
	}
}
const proposalByChallengeId = new Map(
	(remapInput?.proposals ?? []).map((proposal) => [proposal.challengeId, proposal])
);
const proposalEvidenceByChallengeId = new Map(
	(remapInput?.evidence ?? []).map((item) => [item.challengeId, item])
);
const difficultyProposalByChallengeId = new Map(
	(difficultyAdjustmentInput?.proposals ?? []).map((proposal) => [proposal.challengeId, proposal])
);
const difficultyProposalEvidenceByChallengeId = new Map(
	(difficultyAdjustmentInput?.proposalEvidence ?? []).map((item) => [item.challengeId, item])
);
mkdirSync(outputRoot, { recursive: true });

for (const shardId of orderedShardIds) {
	const rows = plan.rows.filter((row) => row.shard === shardId);
	const assignmentCore = {
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA,
		assignmentId: shardId,
		rubricPath: 'docs/challenges/generated-science-verification.md',
		planId: plan.planId,
		planSha256,
		basePlanSha256,
		effectivePlanSha256: planSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		...(reviewRebaseBindings
			? {
					reviewRebaseManifestSha256: reviewRebaseBindings.reviewRebaseManifestSha256,
					reviewRebaseId: reviewRebaseBindings.reviewRebaseId,
					reviewRebaseCandidateSetSha256: reviewRebaseBindings.reviewRebaseCandidateSetSha256,
					reviewRebaseCollectionRemediationSetSha256:
						reviewRebaseBindings.reviewRebaseCollectionRemediationSetSha256,
					reviewRebaseCollectionRemediations:
						reviewRebaseBindings.reviewRebaseCollectionRemediations.filter((remediation) =>
							rows.some((row) => row.id === remediation.preferredChallengeId)
						)
				}
			: {}),
		items: rows.map((row) => ({
			planRowIndex: planRowIndexById.get(row.id),
			plan: row,
			curriculum: evidenceById.get(row.curriculumComponentId),
			calibrationEvidence: sourceForReview(sourceById.get(row.calibrationQuestionId)),
			candidate: candidateById.get(row.id),
			sameCurriculumComponentPeerEvidence: buildSameCurriculumComponentPeerEvidence({
				currentRow: row,
				planRows: plan.rows,
				candidateById
			})
		}))
	};
	const shardProposals = rows.map((row) => proposalByChallengeId.get(row.id)).filter(Boolean);
	if (shardProposals.length) {
		assignmentCore[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] = shardProposals;
		assignmentCore[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] =
			shardProposals.map((proposal) => proposalEvidenceByChallengeId.get(proposal.challengeId));
	}
	const shardDifficultyProposals = rows
		.map((row) => difficultyProposalByChallengeId.get(row.id))
		.filter(Boolean);
	if (shardDifficultyProposals.length) {
		assignmentCore[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] =
			shardDifficultyProposals;
		assignmentCore[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] =
			shardDifficultyProposals.map((proposal) =>
				difficultyProposalEvidenceByChallengeId.get(proposal.challengeId)
			);
	}
	const assignment = {
		...assignmentCore,
		evidenceSha256: canonicalHash(assignmentCore)
	};
	if (
		assignment.items.some(
			(item) => !item.curriculum || !item.calibrationEvidence || !item.candidate
		)
	) {
		throw new Error(`${shardId} assignment is incomplete.`);
	}
	const outputPath = path.join(outputRoot, 'assignments', `${shardId}.json`);
	writeJson(outputPath, assignment);
	const assignmentRecord = {
		assignmentId: shardId,
		path: path.relative(rootDir, outputPath),
		sha256: canonicalHash(assignment),
		ids: rows.map((row) => row.id),
		...(reviewRebaseBindings
			? {
					reviewRebaseManifestSha256: assignmentCore.reviewRebaseManifestSha256,
					reviewRebaseId: assignmentCore.reviewRebaseId,
					reviewRebaseCandidateSetSha256: assignmentCore.reviewRebaseCandidateSetSha256,
					reviewRebaseCollectionRemediationSetSha256:
						assignmentCore.reviewRebaseCollectionRemediationSetSha256,
					reviewRebaseCollectionRemediations: assignmentCore.reviewRebaseCollectionRemediations
				}
			: {})
	};
	if (shardProposals.length) {
		assignmentRecord[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] =
			assignmentCore[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY];
		assignmentRecord[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] =
			assignmentCore[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY];
	}
	if (shardDifficultyProposals.length) {
		assignmentRecord[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] =
			assignmentCore[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY];
		assignmentRecord[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] =
			assignmentCore[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY];
	}
	assignments.push(assignmentRecord);
}
if (remapInput) {
	writeJson(path.join(outputRoot, 'curriculum-remap-verifier-input.json'), remapInput);
}
if (difficultyAdjustmentInput) {
	writeJson(
		path.join(outputRoot, 'difficulty-plan-adjustment-verifier-input.json'),
		difficultyAdjustmentInput
	);
}
writeJson(path.join(outputRoot, 'assignment-index.json'), {
	schemaVersion: 'science-challenge-verification-assignment-index/v1',
	planId: plan.planId,
	planSha256,
	basePlanSha256,
	effectivePlanSha256: planSha256,
	sourceSnapshotSha256,
	curriculumEvidenceSha256,
	candidateCount: plan.rows.length,
	candidateSetSha256,
	...(effectiveCohort
		? { effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest) }
		: {}),
	...(effectiveCohort?.manifest?.infrastructureRecovery
		? {
				reviewRebaseInfrastructureRecoveryManifestSha256:
					effectiveCohort.manifest.infrastructureRecovery.manifestSha256,
				reviewRebaseInfrastructureRecoveryId:
					effectiveCohort.manifest.infrastructureRecovery.recoveryId
			}
		: {}),
	...(reviewRebaseBindings ?? {}),
	...(remapInput
		? {
				curriculumCatalogSha256: remapInput.curriculumCatalogSha256,
				effectiveCohortManifestSha256: remapInput.effectiveCohortManifestSha256,
				remapManifestSetSha256: remapInput.remapManifestSetSha256,
				curriculumRemapVerifierInputSha256: canonicalHash(remapInput)
			}
		: {}),
	...(difficultyAdjustmentInput
		? {
				effectiveCohortManifestSha256: difficultyAdjustmentInput.effectiveCohortManifestSha256,
				difficultyAdjustmentManifestSetSha256:
					difficultyAdjustmentInput.adjustmentManifestSetSha256,
				difficultyPlanAdjustmentVerifierInputSha256: canonicalHash(difficultyAdjustmentInput)
			}
		: {}),
	...(recoverySetSha256 ? { recoverySetSha256 } : {}),
	assignments
});
console.log(
	JSON.stringify(
		{
			status: 'passed',
			assignments: assignments.length,
			items: assignments.reduce((sum, assignment) => sum + assignment.ids.length, 0),
			outputRoot: path.relative(rootDir, outputRoot)
		},
		null,
		2
	)
);

function sourceForReview(question) {
	if (!question) return null;
	return {
		id: question.id,
		contentSha256: question.contentSha256 ?? canonicalHash(question),
		promptText: question.promptText,
		selfContainedPromptText: question.selfContainedPromptText,
		contextText: question.contextText,
		commandWord: question.commandWord,
		marks: question.marks,
		answerFormat: question.answerFormat,
		renderingOverlays: question.renderingOverlays,
		markSchemeItems: question.markSchemeItems,
		checklistItems: question.checklistItems,
		modelAnswers: question.modelAnswers,
		fixedAnswerKeys: question.fixedAnswerKeys,
		primaryAnswerChain: question.primaryAnswerChain,
		commonWeakAnswers: question.commonWeakAnswers,
		requiredAssets: question.requiredAssets
	};
}

function readGenerationCandidate({ rootDir, generationRoot, shardId }) {
	const candidatePath = path.resolve(rootDir, generationRoot, 'shards', shardId, 'candidate.json');
	if (!existsSync(candidatePath)) throw new Error(`Missing candidate for ${shardId}.`);
	return JSON.parse(readFileSync(candidatePath, 'utf8'));
}

function historicalRemapCandidateBindings(verifierInput) {
	const targetById = new Map();
	const batchByShard = new Map();
	for (const override of verifierInput?.candidateOverrides ?? []) {
		const challengeId = override?.manifest?.challengeId;
		const target = override?.candidate?.challenges?.find(
			(entry) => entry?.definition?.id === challengeId
		);
		if (challengeId && target) targetById.set(challengeId, canonicalHash(target));
		if (override?.shardId && override?.candidateSha256) {
			batchByShard.set(override.shardId, override.candidateSha256);
		}
	}
	return { targetById, batchByShard };
}

function readJson(relativePath) {
	const filePath = path.resolve(rootDir, relativePath);
	if (!existsSync(filePath)) throw new Error(`Missing JSON: ${filePath}`);
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveRepositoryRelativePath(repositoryRoot, relativePath, label) {
	if (
		typeof relativePath !== 'string' ||
		!relativePath.trim() ||
		path.isAbsolute(relativePath) ||
		relativePath.includes('\\') ||
		relativePath.includes('\0') ||
		path.posix.normalize(relativePath) !== relativePath ||
		relativePath === '..' ||
		relativePath.startsWith('../')
	) {
		throw new Error(`${label} path must be safe and repository-relative.`);
	}
	const resolved = path.resolve(repositoryRoot, ...relativePath.split('/'));
	if (resolved === repositoryRoot || !resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
		throw new Error(`${label} path escapes the repository.`);
	}
	return resolved;
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function buildReviewRebaseBindings(reviewRebase, candidateSetSha256) {
	const core = reviewRebase.coreManifest;
	const remediations = structuredClone(core.collectionRemediations);
	const targetIds = [...new Set(remediations.map((item) => item.preferredChallengeId))].sort();
	if (
		core.candidateSetSha256 !== candidateSetSha256 ||
		core.collectionValidationSha256 !== canonicalHash(reviewRebase.collectionValidation) ||
		core.collectionRemediationSetSha256 !== canonicalHash(remediations) ||
		canonicalHash(reviewRebase.collectionValidation.issues) !==
			canonicalHash(remediations.map((item) => item.issue))
	) {
		throw new Error('Review-rebase replay candidate or collection-remediation bindings are stale.');
	}
	return {
		reviewRebaseManifestSha256: canonicalHash(reviewRebase.manifest),
		reviewRebaseId: core.rebaseId,
		reviewRebaseCandidateSetSha256: core.candidateSetSha256,
		reviewRebaseCollectionValidationSha256: core.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256: core.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediations: remediations,
		reviewRebaseCollectionRemediationTargetIds: targetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
	};
}

async function loadExistingCatalog() {
	const server = await createServer({
		root: rootDir,
		server: { middlewareMode: true },
		appType: 'custom',
		logLevel: 'silent'
	});
	try {
		const module = await server.ssrLoadModule('/src/lib/challenges/catalog.ts');
		if (!Array.isArray(module.challengeCatalog)) {
			throw new Error('Current challenge catalog did not export challengeCatalog.');
		}
		return module.challengeCatalog;
	} finally {
		await server.close();
	}
}

function parseArgs(argv) {
	const values = new Map();
	for (const arg of argv) {
		if (arg === '--help' || arg === '-h') {
			if (values.has('help')) throw new Error('Duplicate --help option.');
			values.set('help', true);
		} else if (arg.startsWith('--') && arg.includes('=')) {
			const [key, ...rest] = arg.slice(2).split('=');
			if (
				![
					'plan',
					'source',
					'evidence',
					'generation-root',
					'curriculum-remap-input',
					'difficulty-plan-adjustment-input',
					'effective-cohort-manifest',
					'review-rebase-manifest',
					'output-root'
				].includes(key)
			) {
				throw new Error(`Unknown option --${key}.`);
			}
			if (values.has(key)) throw new Error(`Duplicate --${key} option.`);
			const value = rest.join('=');
			if (!value) throw new Error(`--${key} requires a non-empty value.`);
			values.set(key, value);
		} else if (arg.startsWith('-')) {
			throw new Error(`Unknown option ${arg}.`);
		} else {
			throw new Error(`Unexpected positional argument ${arg}.`);
		}
	}
	return {
		help: Boolean(values.get('help')),
		plan: String(values.get('plan') ?? 'tmp/science-challenges/science-500-v1/plan.json'),
		source: String(values.get('source') ?? 'tmp/science-challenge-sources-v1.json'),
		evidence: String(
			values.get('evidence') ?? 'tmp/science-challenges/science-500-v1/curriculum-evidence.json'
		),
		generationRoot: String(
			values.get('generation-root') ?? 'tmp/science-challenges/science-500-v1/generation'
		),
		curriculumRemapInput: values.has('curriculum-remap-input')
			? String(values.get('curriculum-remap-input'))
			: null,
		difficultyPlanAdjustmentInput: values.has('difficulty-plan-adjustment-input')
			? String(values.get('difficulty-plan-adjustment-input'))
			: null,
		effectiveCohortManifest: values.has('effective-cohort-manifest')
			? String(values.get('effective-cohort-manifest'))
			: null,
		reviewRebaseManifest: values.has('review-rebase-manifest')
			? String(values.get('review-rebase-manifest'))
			: null,
		outputRoot: String(
			values.get('output-root') ?? 'tmp/science-challenges/science-500-v1/verification'
		)
	};
}

function usage() {
	return [
		'Usage: node scripts/prepare-science-challenge-verification.mjs [options]',
		'--plan=<plan.json>',
		'--source=<source.json>',
		'--evidence=<curriculum-evidence.json>',
		'--generation-root=<directory>',
		'--curriculum-remap-input=<verifier-input.json>',
		'--difficulty-plan-adjustment-input=<verifier-input.json>',
		'--effective-cohort-manifest=<manifest.json>',
		'--review-rebase-manifest=<repo-relative review-rebase manifest.json>',
		'--output-root=<directory>'
	].join('\n');
}
