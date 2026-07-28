#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadChallengeCatalogSource } from './lib/challenge-catalog-source.mjs';

import { canonicalHash, stableStringify } from './lib/science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY,
	validateScienceChallengeContentReviewRow,
	validateScienceChallengeCurriculumRemapProposalEvidenceList,
	validateScienceChallengeCurriculumRemapProposals,
	validateScienceChallengeCurriculumRemapVerifierInput
} from './lib/science-challenge-curriculum-remap-review.mjs';
import {
	buildScienceChallengeCurriculumRemapDurableReceipt,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY,
	SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY
} from './lib/science-challenge-curriculum-remap-durable.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY,
	validateScienceChallengeDifficultyPlanAdjustmentProposalEvidenceList,
	validateScienceChallengeDifficultyPlanAdjustmentProposals,
	validateScienceChallengeDifficultyPlanAdjustmentVerifierInput
} from './lib/science-challenge-difficulty-plan-adjustment-review.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA,
	validateScienceChallengeAssignmentPeerEvidence
} from './lib/science-challenge-verification-peers.mjs';
import { validateScienceChallengeVerifierDispatchLedger } from './lib/science-challenge-verifier-dispatch.mjs';
import { readScienceChallengeReviewRebaseEvidence } from './lib/science-challenge-review-rebase-evidence.mjs';
import {
	buildScienceChallengeVerifierPacketBundle,
	validateScienceChallengeReviewRebaseIndexBindings,
	validateScienceChallengeReviewRebaseInfrastructureRecoveryIndexBinding
} from './lib/science-challenge-verifier-packets.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
const index = readJson(args.index);
if (index.schemaVersion !== 'science-challenge-verification-assignment-index/v1') {
	throw new Error('Verification assignment index has an invalid schemaVersion.');
}
if (!/^[a-f0-9]{64}$/.test(String(index.planSha256 ?? ''))) {
	throw new Error('Verification assignment index does not bind its plan.');
}
if (!/^[a-f0-9]{64}$/.test(String(index.candidateSetSha256 ?? ''))) {
	throw new Error('Verification assignment index does not bind its candidate set.');
}
if (!Number.isInteger(index.candidateCount) || index.candidateCount < 1) {
	throw new Error('Verification assignment index does not bind a positive candidate count.');
}
for (const field of ['sourceSnapshotSha256', 'curriculumEvidenceSha256']) {
	if (!/^[a-f0-9]{64}$/.test(String(index[field] ?? ''))) {
		throw new Error(`Verification assignment index does not bind ${field}.`);
	}
}
const reviewRebaseIndexValidation = validateScienceChallengeReviewRebaseIndexBindings(index);
if (reviewRebaseIndexValidation.status !== 'passed') {
	throw new Error(
		`Verification assignment index has invalid review-rebase bindings:\n${reviewRebaseIndexValidation.issues.join(
			'\n'
		)}`
	);
}
const reviewRebaseMode = reviewRebaseIndexValidation.rebaseMode;
const infrastructureRecoveryIndexValidation =
	validateScienceChallengeReviewRebaseInfrastructureRecoveryIndexBinding(index);
if (infrastructureRecoveryIndexValidation.status !== 'passed') {
	throw new Error(
		`Verification assignment index has invalid review-rebase infrastructure-recovery bindings:\n${infrastructureRecoveryIndexValidation.issues.join(
			'\n'
		)}`
	);
}
const infrastructureRecoveryMode = infrastructureRecoveryIndexValidation.infrastructureRecoveryMode;
if (reviewRebaseMode !== Boolean(args.reviewRebaseManifest)) {
	throw new Error(
		'--review-rebase-manifest must be supplied if and only if the assignment index contains review-rebase bindings.'
	);
}
if (
	reviewRebaseMode &&
	(!args.packetManifest ||
		args.curriculumRemapInputProvided ||
		args.difficultyPlanAdjustmentInputProvided)
) {
	throw new Error(
		'Review-rebase aggregation requires an explicit --packet-manifest and cannot be combined with exceptional-recovery verifier inputs.'
	);
}
if (infrastructureRecoveryMode && !args.packetManifest) {
	throw new Error(
		'Review-rebase infrastructure-recovery aggregation requires an explicit --packet-manifest.'
	);
}
const reviewRebase = reviewRebaseMode
	? readScienceChallengeReviewRebaseEvidence({
			repositoryRoot: rootDir,
			manifestPath: args.reviewRebaseManifest,
			existingDefinitions: await loadExistingCatalog()
		})
	: null;
if (reviewRebase && reviewRebase.status !== 'passed') {
	throw new Error(`Review-rebase replay failed:\n${(reviewRebase.issues ?? []).join('\n')}`);
}
const reviewRebaseBindings = reviewRebase
	? buildReviewRebaseBindings(reviewRebase, index.candidateSetSha256)
	: null;
if (reviewRebaseBindings) {
	const expectedIndexBindings = {
		planId: reviewRebase.plan.planId,
		planSha256: reviewRebase.coreManifest.planSha256,
		basePlanSha256: reviewRebase.coreManifest.basePlanSha256,
		effectivePlanSha256: reviewRebase.coreManifest.planSha256,
		sourceSnapshotSha256: reviewRebase.coreManifest.sourceSnapshotSha256,
		curriculumEvidenceSha256: reviewRebase.coreManifest.curriculumEvidenceSha256,
		candidateCount: reviewRebase.coreManifest.candidateCount,
		candidateSetSha256: reviewRebase.coreManifest.candidateSetSha256,
		...reviewRebaseBindings
	};
	for (const [field, expected] of Object.entries(expectedIndexBindings)) {
		if (canonicalHash(index[field]) !== canonicalHash(expected)) {
			throw new Error(`Review-rebase assignment index ${field} differs from exact replay.`);
		}
	}
}
const dispatchLedger = readJson(args.dispatchLedger);
const indexedRemapProposalCount = index.assignments.reduce(
	(sum, assignment) =>
		sum + (assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY]?.length ?? 0),
	0
);
const indexedDifficultyAdjustmentProposalCount = index.assignments.reduce(
	(sum, assignment) =>
		sum +
		(assignment?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY]?.length ?? 0),
	0
);
if (
	indexedRemapProposalCount > 0 !==
	/^[a-f0-9]{64}$/.test(String(index.curriculumRemapVerifierInputSha256 ?? ''))
) {
	throw new Error(
		'Remap proposals and curriculumRemapVerifierInputSha256 must be present together.'
	);
}
if (
	indexedDifficultyAdjustmentProposalCount > 0 !==
	/^[a-f0-9]{64}$/.test(String(index.difficultyPlanAdjustmentVerifierInputSha256 ?? ''))
) {
	throw new Error(
		'Difficulty-plan adjustment proposals and difficultyPlanAdjustmentVerifierInputSha256 must be present together.'
	);
}
const dispatchValidation = validateScienceChallengeVerifierDispatchLedger(dispatchLedger, index);
if (dispatchValidation.status !== 'passed') {
	throw new Error(`Verifier dispatch ledger is invalid:\n${dispatchValidation.issues.join('\n')}`);
}
const dispatchLedgerSha256 = canonicalHash(dispatchLedger);
const dispatchByAssignment = new Map(
	dispatchLedger.dispatches.map((dispatch) => [dispatch.assignmentId, dispatch])
);
const reviewRoot = path.resolve(rootDir, args.reviewRoot);
const issues = [];
const reviews = [];
const assignmentResults = [];
const assignmentEvidenceValues = [];
let reviewPacketManifest = null;
let reviewPackets = null;
if (
	indexedRemapProposalCount > 0 ||
	indexedDifficultyAdjustmentProposalCount > 0 ||
	reviewRebaseMode ||
	infrastructureRecoveryMode
) {
	const packetManifestPath = path.resolve(
		rootDir,
		args.packetManifest ?? path.join(path.dirname(args.index), 'verifier-packets', 'manifest.json')
	);
	if (!packetManifestPath.startsWith(`${rootDir}${path.sep}`) || !existsSync(packetManifestPath)) {
		throw new Error('Exceptional-recovery verification requires a safe verifier packet manifest.');
	}
	reviewPacketManifest = JSON.parse(readFileSync(packetManifestPath, 'utf8'));
	reviewPackets = (reviewPacketManifest.packets ?? []).map((packet) => {
		const packetPath = path.resolve(rootDir, String(packet.packetPath ?? ''));
		if (!packetPath.startsWith(`${rootDir}${path.sep}`) || !existsSync(packetPath)) {
			throw new Error(`Missing or unsafe verifier packet ${String(packet.packetPath ?? '')}.`);
		}
		return {
			packetPath: packet.packetPath,
			packet: JSON.parse(readFileSync(packetPath, 'utf8')),
			payloads: (JSON.parse(readFileSync(packetPath, 'utf8')).waves ?? []).map((wave) => {
				const payloadPath = path.resolve(rootDir, String(wave.followupPayloadPath ?? ''));
				if (!payloadPath.startsWith(`${rootDir}${path.sep}`) || !existsSync(payloadPath)) {
					throw new Error(
						`Missing or unsafe verifier followup payload ${String(wave.followupPayloadPath ?? '')}.`
					);
				}
				return {
					payloadPath: wave.followupPayloadPath,
					payload: JSON.parse(readFileSync(payloadPath, 'utf8'))
				};
			})
		};
	});
}
let curriculumRemapInput = null;
if (indexedRemapProposalCount > 0) {
	const inputPath = path.resolve(rootDir, args.curriculumRemapInput);
	if (!inputPath.startsWith(`${rootDir}${path.sep}`) || !existsSync(inputPath)) {
		throw new Error('Curriculum remap verification requires a safe verifier-input artifact.');
	}
	curriculumRemapInput = JSON.parse(readFileSync(inputPath, 'utf8'));
	const inputValidation =
		validateScienceChallengeCurriculumRemapVerifierInput(curriculumRemapInput);
	const indexProposals = index.assignments.flatMap(
		(assignment) => assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] ?? []
	);
	const indexProposalEvidence = index.assignments.flatMap(
		(assignment) =>
			assignment?.[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] ?? []
	);
	if (
		inputValidation.status !== 'passed' ||
		index.curriculumRemapVerifierInputSha256 !== canonicalHash(curriculumRemapInput) ||
		index.basePlanSha256 !== curriculumRemapInput.basePlanSha256 ||
		index.effectivePlanSha256 !== curriculumRemapInput.effectivePlanSha256 ||
		index.effectiveCohortManifestSha256 !== curriculumRemapInput.effectiveCohortManifestSha256 ||
		index.candidateCount !== curriculumRemapInput.candidateCount ||
		index.candidateSetSha256 !== curriculumRemapInput.candidateSetSha256 ||
		index.remapManifestSetSha256 !== curriculumRemapInput.remapManifestSetSha256 ||
		index.recoverySetSha256 !== curriculumRemapInput.recoverySetSha256 ||
		canonicalHash(indexProposals) !== canonicalHash(curriculumRemapInput.proposals) ||
		canonicalHash(indexProposalEvidence) !== canonicalHash(curriculumRemapInput.evidence)
	) {
		throw new Error(
			`Curriculum remap verifier input differs from the assignment index:\n${inputValidation.issues.join(
				'\n'
			)}`
		);
	}
}
let difficultyAdjustmentInput = null;
if (indexedDifficultyAdjustmentProposalCount > 0) {
	const inputPath = path.resolve(rootDir, args.difficultyPlanAdjustmentInput);
	if (!inputPath.startsWith(`${rootDir}${path.sep}`) || !existsSync(inputPath)) {
		throw new Error(
			'Difficulty-plan adjustment verification requires a safe verifier-input artifact.'
		);
	}
	difficultyAdjustmentInput = JSON.parse(readFileSync(inputPath, 'utf8'));
	const inputValidation =
		validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(difficultyAdjustmentInput);
	const indexProposals = index.assignments.flatMap(
		(assignment) =>
			assignment?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] ?? []
	);
	const indexProposalEvidence = index.assignments.flatMap(
		(assignment) =>
			assignment?.[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] ?? []
	);
	if (
		inputValidation.status !== 'passed' ||
		index.difficultyPlanAdjustmentVerifierInputSha256 !==
			canonicalHash(difficultyAdjustmentInput) ||
		index.basePlanSha256 !== difficultyAdjustmentInput.basePlanSha256 ||
		index.effectivePlanSha256 !== difficultyAdjustmentInput.effectivePlanSha256 ||
		index.effectiveCohortManifestSha256 !==
			difficultyAdjustmentInput.effectiveCohortManifestSha256 ||
		index.candidateCount !== difficultyAdjustmentInput.candidateCount ||
		index.candidateSetSha256 !== difficultyAdjustmentInput.candidateSetSha256 ||
		index.difficultyAdjustmentManifestSetSha256 !==
			difficultyAdjustmentInput.adjustmentManifestSetSha256 ||
		index.recoverySetSha256 !== difficultyAdjustmentInput.recoverySetSha256 ||
		canonicalHash(indexProposals) !== canonicalHash(difficultyAdjustmentInput.proposals) ||
		canonicalHash(indexProposalEvidence) !==
			canonicalHash(difficultyAdjustmentInput.proposalEvidence)
	) {
		throw new Error(
			`Difficulty-plan adjustment verifier input differs from the assignment index:\n${inputValidation.issues.join(
				'\n'
			)}`
		);
	}
	for (const issue of validateDifficultyPlanAdjustmentPacketBindings({
		assignmentIndex: index,
		dispatchLedger,
		packetManifest: reviewPacketManifest,
		packets: reviewPackets,
		verifierInput: difficultyAdjustmentInput
	})) {
		issues.push(`Difficulty-plan adjustment packet binding: ${issue}`);
	}
}
if (
	curriculumRemapInput &&
	difficultyAdjustmentInput &&
	(canonicalHash(curriculumRemapInput.recoveries) !==
		canonicalHash(difficultyAdjustmentInput.recoveries) ||
		curriculumRemapInput.recoverySetSha256 !== difficultyAdjustmentInput.recoverySetSha256)
) {
	throw new Error(
		'Curriculum-remap and difficulty-plan adjustment verifier inputs bind different recovery manifests.'
	);
}
if (reviewRebaseMode || infrastructureRecoveryMode) {
	for (const issue of validateReviewRebasePacketBindings({
		assignmentIndex: index,
		dispatchLedger,
		packetManifest: reviewPacketManifest,
		packets: reviewPackets,
		assignmentIndexPath: path.relative(rootDir, path.resolve(rootDir, args.index)),
		dispatchLedgerPath: path.relative(rootDir, path.resolve(rootDir, args.dispatchLedger)),
		packetRootPath: path.relative(
			rootDir,
			path.dirname(path.resolve(rootDir, args.packetManifest))
		),
		reviewRootPath: path.relative(rootDir, reviewRoot)
	})) {
		issues.push(
			`${infrastructureRecoveryMode ? 'Review-rebase infrastructure-recovery' : 'Review-rebase'} packet binding: ${issue}`
		);
	}
}

for (const assignment of index.assignments) {
	const assignmentPath = path.resolve(rootDir, assignment.path);
	if (!assignmentPath.startsWith(`${rootDir}${path.sep}`) || !existsSync(assignmentPath)) {
		issues.push(`Missing or unsafe assignment evidence ${assignment.assignmentId}.`);
		continue;
	}
	const assignmentEvidence = JSON.parse(readFileSync(assignmentPath, 'utf8'));
	if (canonicalHash(assignmentEvidence) !== assignment.sha256) {
		issues.push(`Assignment evidence hash mismatch for ${assignment.assignmentId}.`);
		continue;
	}
	const { evidenceSha256, ...assignmentCore } = assignmentEvidence;
	if (evidenceSha256 !== canonicalHash(assignmentCore)) {
		issues.push(`Assignment self-binding hash mismatch for ${assignment.assignmentId}.`);
		continue;
	}
	const evidenceIds =
		assignmentEvidence.items?.map((item) => item?.candidate?.definition?.id) ?? [];
	if (
		assignmentEvidence.schemaVersion !== SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA ||
		assignmentEvidence.assignmentId !== assignment.assignmentId ||
		assignmentEvidence.planSha256 !== index.planSha256 ||
		(assignmentEvidence.basePlanSha256 ?? assignmentEvidence.planSha256) !==
			(index.basePlanSha256 ?? index.planSha256) ||
		(assignmentEvidence.effectivePlanSha256 ?? assignmentEvidence.planSha256) !==
			(index.effectivePlanSha256 ?? index.planSha256) ||
		assignmentEvidence.sourceSnapshotSha256 !== index.sourceSnapshotSha256 ||
		assignmentEvidence.curriculumEvidenceSha256 !== index.curriculumEvidenceSha256 ||
		(reviewRebaseMode &&
			(canonicalHash(
				Object.fromEntries(
					[
						'reviewRebaseManifestSha256',
						'reviewRebaseId',
						'reviewRebaseCandidateSetSha256',
						'reviewRebaseCollectionRemediationSetSha256',
						'reviewRebaseCollectionRemediations'
					].map((field) => [field, assignmentEvidence[field]])
				)
			) !==
				canonicalHash(
					Object.fromEntries(
						[
							'reviewRebaseManifestSha256',
							'reviewRebaseId',
							'reviewRebaseCandidateSetSha256',
							'reviewRebaseCollectionRemediationSetSha256',
							'reviewRebaseCollectionRemediations'
						].map((field) => [field, assignment[field]])
					)
				) ||
				!assignmentEvidence.items.every((item) =>
					reviewRebaseItemMatchesReplay(item, reviewRebase)
				))) ||
		evidenceIds.length !== assignment.ids.length ||
		evidenceIds.some((id, index) => id !== assignment.ids[index])
	) {
		issues.push(`Assignment evidence membership mismatch for ${assignment.assignmentId}.`);
		continue;
	}
	const indexProposals = assignment[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] ?? [];
	const evidenceProposals =
		assignmentEvidence[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY] ?? [];
	const candidateSha256ById = new Map(
		(assignmentEvidence.items ?? []).map((item) => [
			item?.candidate?.definition?.id,
			canonicalHash(item?.candidate)
		])
	);
	for (const override of curriculumRemapInput?.candidateOverrides ?? []) {
		const challengeId = override?.manifest?.challengeId;
		if (!assignment.ids.includes(challengeId)) continue;
		const historicalTarget = override?.candidate?.challenges?.find(
			(entry) => entry?.definition?.id === challengeId
		);
		if (historicalTarget) {
			candidateSha256ById.set(challengeId, canonicalHash(historicalTarget));
		}
	}
	let proposalsValid = true;
	if (
		(indexProposals.length > 0 || evidenceProposals.length > 0) &&
		(!index.basePlanSha256 ||
			!index.effectivePlanSha256 ||
			!assignmentEvidence.basePlanSha256 ||
			!assignmentEvidence.effectivePlanSha256)
	) {
		issues.push(
			`${assignment.assignmentId}: remap verification requires explicit basePlanSha256 and effectivePlanSha256 bindings.`
		);
		proposalsValid = false;
	}
	for (const [label, proposals] of [
		['assignment index', indexProposals],
		['assignment evidence', evidenceProposals]
	]) {
		const proposalValidation = validateScienceChallengeCurriculumRemapProposals(proposals, {
			assignedChallengeIds: assignment.ids,
			basePlanSha256: index.basePlanSha256 ?? index.planSha256,
			effectivePlanSha256: index.effectivePlanSha256 ?? index.planSha256,
			curriculumEvidenceSha256: index.curriculumEvidenceSha256,
			candidateById: candidateSha256ById
		});
		if (proposalValidation.status !== 'passed') proposalsValid = false;
		for (const issue of proposalValidation.issues) {
			issues.push(
				`${assignment.assignmentId}: ${label} ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_PROPERTY}${issue}`
			);
		}
	}
	if (canonicalHash(indexProposals) !== canonicalHash(evidenceProposals)) {
		issues.push(
			`${assignment.assignmentId}: assignment remap proposals differ from their bound index row.`
		);
		continue;
	}
	const indexProposalEvidence =
		assignment[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] ?? [];
	const assignmentProposalEvidence =
		assignmentEvidence[SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY] ?? [];
	for (const [label, proposalEvidence] of [
		['assignment index', indexProposalEvidence],
		['assignment evidence', assignmentProposalEvidence]
	]) {
		const displayValidation = validateScienceChallengeCurriculumRemapProposalEvidenceList(
			proposalEvidence,
			{
				proposals: evidenceProposals
			}
		);
		if (displayValidation.status !== 'passed') proposalsValid = false;
		for (const issue of displayValidation.issues) {
			issues.push(
				`${assignment.assignmentId}: ${label} ${SCIENCE_CHALLENGE_CURRICULUM_REMAP_PROPOSAL_EVIDENCE_PROPERTY}${issue}`
			);
		}
	}
	if (canonicalHash(indexProposalEvidence) !== canonicalHash(assignmentProposalEvidence)) {
		issues.push(
			`${assignment.assignmentId}: reviewer-visible remap proposal evidence differs from its bound index row.`
		);
		proposalsValid = false;
	}
	if (!proposalsValid) continue;
	const indexDifficultyProposals =
		assignment[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] ?? [];
	const evidenceDifficultyProposals =
		assignmentEvidence[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] ?? [];
	let difficultyProposalsValid = true;
	for (const [label, proposals] of [
		['assignment index', indexDifficultyProposals],
		['assignment evidence', evidenceDifficultyProposals]
	]) {
		const proposalValidation = validateScienceChallengeDifficultyPlanAdjustmentProposals(
			proposals,
			{
				assignedChallengeIds: assignment.ids,
				basePlanSha256: index.basePlanSha256 ?? index.planSha256,
				effectivePlanSha256: index.effectivePlanSha256 ?? index.planSha256
			}
		);
		if (proposalValidation.status !== 'passed') difficultyProposalsValid = false;
		for (const issue of proposalValidation.issues) {
			issues.push(
				`${assignment.assignmentId}: ${label} ${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY}: ${issue}`
			);
		}
	}
	if (canonicalHash(indexDifficultyProposals) !== canonicalHash(evidenceDifficultyProposals)) {
		issues.push(
			`${assignment.assignmentId}: assignment difficulty-plan adjustment proposals differ from their bound index row.`
		);
		difficultyProposalsValid = false;
	}
	const indexDifficultyProposalEvidence =
		assignment[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] ?? [];
	const assignmentDifficultyProposalEvidence =
		assignmentEvidence[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] ??
		[];
	for (const [label, proposalEvidence] of [
		['assignment index', indexDifficultyProposalEvidence],
		['assignment evidence', assignmentDifficultyProposalEvidence]
	]) {
		const displayValidation = validateScienceChallengeDifficultyPlanAdjustmentProposalEvidenceList(
			proposalEvidence,
			{ proposals: evidenceDifficultyProposals }
		);
		if (displayValidation.status !== 'passed') difficultyProposalsValid = false;
		for (const issue of displayValidation.issues) {
			issues.push(
				`${assignment.assignmentId}: ${label} ${SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY}: ${issue}`
			);
		}
	}
	if (
		canonicalHash(indexDifficultyProposalEvidence) !==
		canonicalHash(assignmentDifficultyProposalEvidence)
	) {
		issues.push(
			`${assignment.assignmentId}: reviewer-visible difficulty-plan adjustment evidence differs from its bound index row.`
		);
		difficultyProposalsValid = false;
	}
	if (!difficultyProposalsValid) continue;
	assignmentEvidenceValues.push(assignmentEvidence);
	const reviewPath = path.join(reviewRoot, `${assignment.assignmentId}.json`);
	if (!existsSync(reviewPath)) {
		issues.push(`Missing review ${assignment.assignmentId}.`);
		continue;
	}
	const result = JSON.parse(readFileSync(reviewPath, 'utf8'));
	const dispatch = dispatchByAssignment.get(assignment.assignmentId);
	const validation = validateReview(
		result,
		assignment,
		assignmentEvidence,
		dispatch,
		dispatchLedgerSha256,
		evidenceProposals,
		evidenceDifficultyProposals
	);
	assignmentResults.push({
		assignmentId: assignment.assignmentId,
		path: path.relative(rootDir, reviewPath),
		sha256: canonicalHash(result),
		verifier: result.verifier,
		status: validation.status,
		issues: validation.issues
	});
	for (const issue of validation.issues) issues.push(`${assignment.assignmentId}: ${issue}`);
	if (validation.status === 'passed') reviews.push(...result.reviews);
}

const peerValidation = validateScienceChallengeAssignmentPeerEvidence({
	assignments: assignmentEvidenceValues
});
for (const issue of peerValidation.issues) {
	issues.push(`Assignment peer evidence: ${issue}`);
}

const acceptedCount = reviews.filter((review) => review.accepted).length;
const rejectedCount = reviews.filter((review) => !review.accepted).length;
const remapDecisions = reviews.flatMap(
	(review) => review[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DECISION_PROPERTY] ?? []
);
const acceptedRemapDecisionCount = remapDecisions.filter(
	(decision) => decision.accepted === true
).length;
const rejectedRemapDecisionCount = remapDecisions.filter(
	(decision) => decision.accepted === false
).length;
const difficultyAdjustmentDecisions = reviews.flatMap(
	(review) => review[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY] ?? []
);
const acceptedDifficultyPlanAdjustmentDecisionCount = difficultyAdjustmentDecisions.filter(
	(decision) => decision.accepted === true
).length;
const rejectedDifficultyPlanAdjustmentDecisionCount = difficultyAdjustmentDecisions.filter(
	(decision) => decision.accepted === false
).length;
let curriculumRemapDurableReceipt = null;
if (indexedRemapProposalCount > 0) {
	try {
		curriculumRemapDurableReceipt = buildScienceChallengeCurriculumRemapDurableReceipt({
			verifierInput: curriculumRemapInput,
			assignmentIndex: index,
			packetManifest: reviewPacketManifest,
			packets: reviewPackets,
			assignmentResults,
			decisions: remapDecisions
		});
	} catch (error) {
		issues.push(
			`Curriculum remap durable receipt failed: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}
}
if (reviews.length !== index.candidateCount) {
	issues.push(`Expected ${index.candidateCount} validated reviews; found ${reviews.length}.`);
}
const summary = {
	schemaVersion: 'science-challenge-independent-verification-summary/v1',
	planId: index.planId,
	planSha256: index.planSha256,
	basePlanSha256: index.basePlanSha256 ?? index.planSha256,
	effectivePlanSha256: index.effectivePlanSha256 ?? index.planSha256,
	sourceSnapshotSha256: index.sourceSnapshotSha256,
	curriculumEvidenceSha256: index.curriculumEvidenceSha256,
	candidateSetSha256: index.candidateSetSha256,
	...(index.effectiveCohortManifestSha256
		? { effectiveCohortManifestSha256: index.effectiveCohortManifestSha256 }
		: {}),
	...(reviewRebaseBindings ?? {}),
	...(index.recoverySetSha256 ? { recoverySetSha256: index.recoverySetSha256 } : {}),
	...(infrastructureRecoveryMode
		? {
				reviewRebaseInfrastructureRecoveryManifestSha256:
					index.reviewRebaseInfrastructureRecoveryManifestSha256,
				reviewRebaseInfrastructureRecoveryId: index.reviewRebaseInfrastructureRecoveryId
			}
		: {}),
	...(index.curriculumRemapVerifierInputSha256
		? {
				curriculumRemapVerifierInputSha256: index.curriculumRemapVerifierInputSha256,
				...(curriculumRemapDurableReceipt
					? {
							[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_PROPERTY]:
								curriculumRemapDurableReceipt,
							[SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SHA256_PROPERTY]: canonicalHash(
								curriculumRemapDurableReceipt
							)
						}
					: {})
			}
		: {}),
	...(index.difficultyPlanAdjustmentVerifierInputSha256
		? {
				difficultyPlanAdjustmentVerifierInputSha256:
					index.difficultyPlanAdjustmentVerifierInputSha256
			}
		: {}),
	indexSha256: canonicalHash(index),
	dispatchLedgerSha256,
	status:
		issues.length ||
		rejectedCount ||
		rejectedRemapDecisionCount ||
		rejectedDifficultyPlanAdjustmentDecisionCount ||
		(reviewRebaseBindings?.reviewRebaseCollectionRemediations.length ?? 0)
			? 'failed'
			: 'passed',
	assignmentCount: index.assignments.length,
	reviewCount: reviews.length,
	acceptedCount,
	rejectedCount,
	acceptedRemapDecisionCount,
	rejectedRemapDecisionCount,
	acceptedDifficultyPlanAdjustmentDecisionCount,
	rejectedDifficultyPlanAdjustmentDecisionCount,
	issues,
	assignmentResults,
	reviews
};
const outputPath = path.resolve(rootDir, args.output);
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${stableStringify(summary)}\n`);
console.log(JSON.stringify({ ...summary, reviews: undefined }, null, 2));
if (summary.status !== 'passed') process.exit(1);

function validateReview(
	result,
	assignment,
	assignmentEvidence,
	dispatch,
	dispatchLedgerSha256,
	curriculumRemapProposals,
	difficultyPlanAdjustmentProposals
) {
	const reviewIssues = [];
	if (result.schemaVersion !== 'science-challenge-independent-verification/v1') {
		reviewIssues.push('Invalid schemaVersion.');
	}
	if (result.assignmentId !== assignment.assignmentId) reviewIssues.push('assignmentId mismatch.');
	if (result.assignmentEvidenceSha256 !== assignmentEvidence.evidenceSha256) {
		reviewIssues.push('assignmentEvidenceSha256 mismatch.');
	}
	if (result.verifier?.context !== 'empty') reviewIssues.push('Verifier context must be empty.');
	if (
		result.verifier?.model !== 'gpt-5.6-sol' ||
		result.verifier?.reasoningEffort !== 'max' ||
		!result.verifier?.reviewedAt ||
		Number.isNaN(Date.parse(result.verifier.reviewedAt))
	)
		reviewIssues.push('Verifier metadata is incomplete.');
	if (
		!dispatch ||
		result.verifier?.provenance?.orchestrator !== 'codex-collaboration' ||
		result.verifier?.provenance?.taskName !== dispatch.taskName ||
		result.verifier?.provenance?.forkTurns !== 'none' ||
		result.verifier?.provenance?.dispatchLedgerSha256 !== dispatchLedgerSha256
	) {
		reviewIssues.push('Verifier provenance does not match the empty-context dispatch ledger.');
	}
	if (!Array.isArray(result.reviews) || result.reviews.length !== assignment.ids.length) {
		reviewIssues.push(`Expected ${assignment.ids.length} reviews.`);
		return { status: 'failed', issues: reviewIssues };
	}
	const byId = new Map(result.reviews.map((review) => [review.id, review]));
	const proposalByChallengeId = new Map(
		curriculumRemapProposals.map((proposal) => [proposal.challengeId, proposal])
	);
	const difficultyProposalByChallengeId = new Map(
		difficultyPlanAdjustmentProposals.map((proposal) => [proposal.challengeId, proposal])
	);
	if (byId.size !== result.reviews.length) reviewIssues.push('Review ids must be unique.');
	const booleanFields = [
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
		'heroTeaserSafe'
	];
	for (const id of assignment.ids) {
		const review = byId.get(id);
		if (!review) {
			reviewIssues.push(`Missing review for ${id}.`);
			continue;
		}
		const sharedValidation = validateScienceChallengeContentReviewRow(review, {
			proposal: proposalByChallengeId.get(id),
			difficultyProposal: difficultyProposalByChallengeId.get(id)
		});
		for (const issue of sharedValidation.issues) reviewIssues.push(`${id}.${issue}`);
		for (const field of booleanFields) {
			if (typeof review[field] !== 'boolean') reviewIssues.push(`${id}.${field} must be boolean.`);
		}
		if (
			!Array.isArray(review.checkedCalculations) ||
			review.checkedCalculations.some(
				(calculation) => typeof calculation !== 'string' || !calculation.trim()
			)
		) {
			reviewIssues.push(`${id}.checkedCalculations must be an array of non-empty strings.`);
		}
		const itemIssues = Array.isArray(review.issues) ? review.issues : null;
		if (!itemIssues) reviewIssues.push(`${id}.issues must be an array.`);
		else {
			for (const [issueIndex, issue] of itemIssues.entries()) {
				if (
					typeof issue?.field !== 'string' ||
					!issue.field.trim() ||
					typeof issue?.category !== 'string' ||
					!issue.category.trim() ||
					typeof issue?.evidence !== 'string' ||
					!issue.evidence.trim() ||
					typeof issue?.repair !== 'string' ||
					!issue.repair.trim()
				) {
					reviewIssues.push(`${id}.issues[${issueIndex}] is incomplete.`);
				}
			}
		}
		if (typeof review.accepted !== 'boolean') reviewIssues.push(`${id}.accepted must be boolean.`);
		const shouldAccept =
			booleanFields.every((field) => review[field] === true) && itemIssues?.length === 0;
		if (review.accepted !== shouldAccept)
			reviewIssues.push(`${id}.accepted violates the hard gate.`);
		if (!shouldAccept && itemIssues?.length === 0) {
			reviewIssues.push(`${id} is rejected but has no concrete repair issue.`);
		}
	}
	return { status: reviewIssues.length ? 'failed' : 'passed', issues: reviewIssues };
}

function validateDifficultyPlanAdjustmentPacketBindings({
	assignmentIndex,
	dispatchLedger,
	packetManifest,
	packets,
	verifierInput
}) {
	const packetIssues = [];
	if (
		packetManifest?.schemaVersion !== 'science-challenge-verifier-work-packet-manifest/v1' ||
		packetManifest.assignmentIndexSha256 !== canonicalHash(assignmentIndex) ||
		packetManifest.dispatchLedgerSha256 !== canonicalHash(dispatchLedger) ||
		!Array.isArray(packetManifest.packets)
	) {
		return ['packet manifest does not bind the exact assignment index and dispatch ledger.'];
	}
	const packetByPath = new Map(
		(packets ?? []).map((artifact) => [artifact?.packetPath, artifact?.packet])
	);
	const waveByAssignmentId = new Map();
	for (const [packetIndex, manifestPacket] of packetManifest.packets.entries()) {
		const packet = packetByPath.get(manifestPacket?.packetPath);
		if (
			!packet ||
			packet.schemaVersion !== 'science-challenge-verifier-work-packet/v1' ||
			canonicalHash(packet) !== manifestPacket?.packetSha256 ||
			packet.assignmentIndexSha256 !== canonicalHash(assignmentIndex) ||
			packet.dispatchLedgerSha256 !== canonicalHash(dispatchLedger) ||
			packet.difficultyPlanAdjustmentVerifierInputSha256 !== canonicalHash(verifierInput) ||
			!Array.isArray(packet.waves)
		) {
			packetIssues.push(`packet manifest row ${packetIndex} does not bind its exact packet.`);
			continue;
		}
		for (const wave of packet.waves) {
			if (!wave?.assignmentId || waveByAssignmentId.has(wave.assignmentId)) {
				packetIssues.push(`packet manifest row ${packetIndex} has a duplicate assignment wave.`);
				continue;
			}
			waveByAssignmentId.set(wave.assignmentId, wave);
		}
	}
	if (packetByPath.size !== packetManifest.packets.length) {
		packetIssues.push('packet artifacts differ from packet-manifest membership.');
	}
	for (const assignment of assignmentIndex.assignments) {
		const wave = waveByAssignmentId.get(assignment.assignmentId);
		if (
			!wave ||
			wave.assignmentPath !== assignment.path ||
			wave.assignmentSha256 !== assignment.sha256 ||
			wave.difficultyPlanAdjustmentVerifierInputSha256 !== canonicalHash(verifierInput) ||
			canonicalHash(wave[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] ?? []) !==
				canonicalHash(
					assignment[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] ?? []
				) ||
			canonicalHash(
				wave[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] ?? []
			) !==
				canonicalHash(
					assignment[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] ?? []
				)
		) {
			packetIssues.push(
				`${assignment.assignmentId} difficulty-plan adjustment packet binding is missing or stale.`
			);
		}
	}
	if (waveByAssignmentId.size !== assignmentIndex.assignments.length) {
		packetIssues.push('packet assignment-wave membership differs from the assignment index.');
	}
	return packetIssues;
}

function validateReviewRebasePacketBindings({
	assignmentIndex,
	dispatchLedger,
	packetManifest,
	packets,
	assignmentIndexPath,
	dispatchLedgerPath,
	packetRootPath,
	reviewRootPath
}) {
	const packetIssues = [];
	let expectedBundle;
	try {
		expectedBundle = buildScienceChallengeVerifierPacketBundle({
			assignmentIndex,
			dispatchLedger,
			assignmentIndexPath,
			dispatchLedgerPath,
			packetRootPath,
			reviewRootPath
		});
	} catch (error) {
		return [
			`canonical packet replay failed: ${error instanceof Error ? error.message : String(error)}`
		];
	}
	if (canonicalHash(packetManifest) !== canonicalHash(expectedBundle.manifest)) {
		packetIssues.push('packet manifest differs from the exact canonical packet bundle.');
	}
	const actualByPath = new Map();
	for (const artifact of packets ?? []) {
		if (!artifact?.packetPath || actualByPath.has(artifact.packetPath)) {
			packetIssues.push('packet artifacts are missing or duplicated.');
			continue;
		}
		actualByPath.set(artifact.packetPath, artifact.packet);
		for (const payload of artifact.payloads ?? []) {
			if (!payload?.payloadPath || actualByPath.has(payload.payloadPath)) {
				packetIssues.push('followup payload artifacts are missing or duplicated.');
				continue;
			}
			actualByPath.set(payload.payloadPath, payload.payload);
		}
	}
	for (const artifact of expectedBundle.artifacts) {
		const artifactPath = path.join(packetRootPath, artifact.relativePath);
		if (
			!actualByPath.has(artifactPath) ||
			canonicalHash(actualByPath.get(artifactPath)) !== canonicalHash(artifact.value)
		) {
			packetIssues.push(`${artifactPath} differs from exact canonical packet replay.`);
		}
	}
	if (actualByPath.size !== expectedBundle.artifacts.length) {
		packetIssues.push('packet and followup-payload membership differs from canonical replay.');
	}
	return packetIssues;
}

function reviewRebaseItemMatchesReplay(item, replay) {
	const id = item?.candidate?.definition?.id;
	if (!id) return false;
	const planRowIndex = replay.plan.rows.findIndex((row) => row.id === id);
	if (planRowIndex < 0 || item.planRowIndex !== planRowIndex) return false;
	const expectedCandidate = replay.candidateBatches
		.get(replay.plan.rows[planRowIndex].shard)
		?.challenges?.find((candidate) => candidate?.definition?.id === id);
	return (
		canonicalHash(item.plan) === canonicalHash(replay.plan.rows[planRowIndex]) &&
		canonicalHash(item.candidate) === canonicalHash(expectedCandidate)
	);
}

function buildReviewRebaseBindings(reviewRebase, candidateSetSha256) {
	const core = reviewRebase.coreManifest;
	const remediations = structuredClone(core.collectionRemediations);
	const targetIds = [...new Set(remediations.map((item) => item.preferredChallengeId))].sort();
	if (
		core.status !== 'review-pending' ||
		core.requiresFreshFullVerification !== true ||
		core.releaseEligible !== false ||
		core.candidateSetSha256 !== candidateSetSha256 ||
		core.collectionValidationSha256 !== canonicalHash(reviewRebase.collectionValidation) ||
		core.collectionRemediationSetSha256 !== canonicalHash(remediations) ||
		canonicalHash(reviewRebase.collectionValidation.issues) !==
			canonicalHash(remediations.map((item) => item.issue))
	) {
		throw new Error('Review-rebase replay has stale candidate or collection bindings.');
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
	return (await loadChallengeCatalogSource({ rootDir })).definitions;
}

function readJson(relativePath) {
	const filePath = path.resolve(rootDir, relativePath);
	if (!existsSync(filePath)) throw new Error(`Missing JSON: ${filePath}`);
	return JSON.parse(readFileSync(filePath, 'utf8'));
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
					'index',
					'review-root',
					'output',
					'dispatch-ledger',
					'packet-manifest',
					'review-rebase-manifest',
					'curriculum-remap-input',
					'difficulty-plan-adjustment-input'
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
		index: String(
			values.get('index') ??
				'tmp/science-challenges/candidate-release/verification/assignment-index.json'
		),
		reviewRoot: String(
			values.get('review-root') ?? 'tmp/science-challenges/candidate-release/verification/reviews'
		),
		output: String(
			values.get('output') ?? 'tmp/science-challenges/candidate-release/verification/summary.json'
		),
		dispatchLedger: String(
			values.get('dispatch-ledger') ??
				'tmp/science-challenges/candidate-release/verification/dispatch-ledger.json'
		),
		packetManifest: values.has('packet-manifest')
			? String(values.get('packet-manifest'))
			: undefined,
		reviewRebaseManifest: values.has('review-rebase-manifest')
			? String(values.get('review-rebase-manifest'))
			: undefined,
		curriculumRemapInputProvided: values.has('curriculum-remap-input'),
		difficultyPlanAdjustmentInputProvided: values.has('difficulty-plan-adjustment-input'),
		curriculumRemapInput: String(
			values.get('curriculum-remap-input') ??
				'tmp/science-challenges/candidate-release/verification/curriculum-remap-verifier-input.json'
		),
		difficultyPlanAdjustmentInput: String(
			values.get('difficulty-plan-adjustment-input') ??
				'tmp/science-challenges/candidate-release/verification/difficulty-plan-adjustment-verifier-input.json'
		)
	};
}

function usage() {
	return [
		'Usage: node scripts/aggregate-science-challenge-verification.mjs [options]',
		'',
		'--index=<assignment-index.json>',
		'--dispatch-ledger=<dispatch-ledger.json>',
		'--packet-manifest=<verifier-packets/manifest.json>',
		'--review-rebase-manifest=<repo-relative review-rebase manifest.json>',
		'--curriculum-remap-input=<curriculum-remap-verifier-input.json>',
		'--difficulty-plan-adjustment-input=<difficulty-plan-adjustment-verifier-input.json>',
		'--review-root=<directory>',
		'--output=<summary.json>'
	].join('\n');
}
