import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalHash } from './science-challenge-release.mjs';
import { buildScienceChallengeCurriculumRemapProposal } from './science-challenge-curriculum-remap-review.mjs';
import {
	buildScienceChallengeDifficultyPlanAdjustmentProposal,
	buildScienceChallengeDifficultyPlanAdjustmentProposalEvidence
} from './science-challenge-difficulty-plan-adjustment-review.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY
} from './science-challenge-difficulty-plan-adjustment.mjs';
import {
	buildScienceChallengeVerifierPacketBundle,
	validateScienceChallengeVerifierPacketInputs
} from './science-challenge-verifier-packets.mjs';

const ASSIGNMENT_COUNT = 7;
const VERIFIER_ASSIGNMENT_COUNTS = [3, 2, 2];

test('builds balanced ordered packets bound to one complete arbitrary-sized ledger', () => {
	const fixture = packetFixture();
	const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));

	const bundle = buildScienceChallengeVerifierPacketBundle({
		assignmentIndex: fixture.index,
		dispatchLedger: fixture.ledger,
		assignmentIndexPath: 'verification/assignment-index.json',
		dispatchLedgerPath: 'verification/dispatch-ledger.json',
		packetRootPath: 'verification/verifier-packets',
		reviewRootPath: 'verification/reviews'
	});
	assert.equal(bundle.manifest.packetCount, 3);
	assert.equal(bundle.manifest.waveCount, ASSIGNMENT_COUNT);
	assert.equal(bundle.artifacts.length, ASSIGNMENT_COUNT + VERIFIER_ASSIGNMENT_COUNTS.length);
	assert.deepEqual(
		bundle.manifest.packets.map((packet) => [packet.firstAssignmentId, packet.lastAssignmentId]),
		[
			['science-001', 'science-003'],
			['science-004', 'science-005'],
			['science-006', 'science-007']
		]
	);
});

test('rejects reordered ids even if index and ledger are rehashed together', () => {
	const fixture = packetFixture();
	[fixture.index.assignments[0], fixture.index.assignments[1]] = [
		fixture.index.assignments[1],
		fixture.index.assignments[0]
	];
	[fixture.ledger.dispatches[0], fixture.ledger.dispatches[1]] = [
		fixture.ledger.dispatches[1],
		fixture.ledger.dispatches[0]
	];
	fixture.ledger.indexSha256 = canonicalHash(fixture.index);

	const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /assignment row 1 must be science-001/);
});

test('rejects duplicate challenge membership hidden behind otherwise valid dispatch rows', () => {
	const fixture = packetFixture();
	fixture.index.assignments[1].ids[0] = fixture.index.assignments[0].ids[0];
	fixture.ledger.indexSha256 = canonicalHash(fixture.index);
	const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /invalid or duplicate challenge id/);
});

test('presents immutable remap proposal hashes and keeps the decision separate from full acceptance', () => {
	const fixture = packetFixture();
	fixture.index.basePlanSha256 = fixture.index.planSha256;
	fixture.index.effectivePlanSha256 = fixture.index.planSha256;
	fixture.index.curriculumRemapVerifierInputSha256 = '8'.repeat(64);
	const challengeId = fixture.index.assignments[0].ids[0];
	const proposal = remapProposal(challengeId, fixture.index);
	fixture.index.assignments[0].curriculumRemapProposals = [proposal];
	fixture.index.assignments[0].curriculumRemapProposalEvidence = [remapDisplayEvidence(proposal)];
	fixture.ledger.indexSha256 = canonicalHash(fixture.index);

	const bundle = buildScienceChallengeVerifierPacketBundle({
		assignmentIndex: fixture.index,
		dispatchLedger: fixture.ledger,
		assignmentIndexPath: 'verification/assignment-index.json',
		dispatchLedgerPath: 'verification/dispatch-ledger.json',
		packetRootPath: 'verification/verifier-packets',
		reviewRootPath: 'verification/reviews'
	});
	const packet = bundle.artifacts.find(
		(artifact) => artifact.relativePath === 'verifier-01/packet.json'
	).value;
	assert.deepEqual(packet.waves[0].curriculumRemapProposals, [proposal]);
	const payload = bundle.artifacts.find(
		(artifact) => artifact.relativePath === 'verifier-01/wave-01.json'
	).value;
	for (const hash of [
		proposal.proposalSha256,
		proposal.basePlanSha256,
		proposal.effectivePlanSha256,
		proposal.curriculumEvidenceSha256,
		proposal.targetCandidateSha256,
		proposal.batchCandidateSha256,
		proposal.baseReviewSha256,
		proposal.manifestSha256
	]) {
		assert.match(payload.message, new RegExp(hash));
	}
	assert.match(payload.message, /does not accept the rest of a challenge/);
	assert.match(payload.message, /curriculumRemapDecisions/);
});

test('rejects malformed, duplicate and out-of-assignment remap proposals', () => {
	for (const mutate of [
		(proposal) => ({ ...proposal, to: 'Not canonical' }),
		(proposal) => [proposal, proposal],
		(proposal) => ({ ...proposal, challengeId: 'challenge-999-1' })
	]) {
		const fixture = packetFixture();
		fixture.index.basePlanSha256 = fixture.index.planSha256;
		fixture.index.effectivePlanSha256 = fixture.index.planSha256;
		fixture.index.curriculumRemapVerifierInputSha256 = '8'.repeat(64);
		const challengeId = fixture.index.assignments[0].ids[0];
		const proposal = remapProposal(challengeId, fixture.index);
		const mutated = mutate(proposal);
		fixture.index.assignments[0].curriculumRemapProposals = Array.isArray(mutated)
			? mutated
			: [mutated];
		fixture.index.assignments[0].curriculumRemapProposalEvidence = [remapDisplayEvidence(proposal)];
		fixture.ledger.indexSha256 = canonicalHash(fixture.index);
		const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
		assert.equal(validation.status, 'failed');
	}
});

test('binds two typed difficulty adjustments in one wave and preserves remap instructions', () => {
	const fixture = packetFixture();
	fixture.index.basePlanSha256 = fixture.index.planSha256;
	fixture.index.effectivePlanSha256 = 'e'.repeat(64);
	fixture.index.curriculumRemapVerifierInputSha256 = '8'.repeat(64);
	fixture.index.difficultyPlanAdjustmentVerifierInputSha256 = '9'.repeat(64);
	const [firstId, secondId, thirdId] = fixture.index.assignments[0].ids;
	const difficultyProposals = [
		difficultyProposal(firstId, fixture.index, {
			from: 'starter',
			targetCandidateSha256: '1'.repeat(64)
		}),
		difficultyProposal(secondId, fixture.index, {
			from: 'stretch',
			targetCandidateSha256: '2'.repeat(64)
		})
	];
	fixture.index.assignments[0].difficultyPlanAdjustmentProposals = difficultyProposals;
	fixture.index.assignments[0].difficultyPlanAdjustmentProposalEvidence =
		difficultyProposals.map(difficultyDisplayEvidence);
	const remap = remapProposal(thirdId, fixture.index);
	fixture.index.assignments[0].curriculumRemapProposals = [remap];
	fixture.index.assignments[0].curriculumRemapProposalEvidence = [remapDisplayEvidence(remap)];
	fixture.ledger.indexSha256 = canonicalHash(fixture.index);

	const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));
	const bundle = buildScienceChallengeVerifierPacketBundle({
		assignmentIndex: fixture.index,
		dispatchLedger: fixture.ledger,
		assignmentIndexPath: 'verification/assignment-index.json',
		dispatchLedgerPath: 'verification/dispatch-ledger.json',
		packetRootPath: 'verification/verifier-packets',
		reviewRootPath: 'verification/reviews'
	});
	const packet = bundle.artifacts.find(
		(artifact) => artifact.relativePath === 'verifier-01/packet.json'
	).value;
	assert.deepEqual(packet.waves[0].difficultyPlanAdjustmentProposals, difficultyProposals);
	assert.equal(
		packet.difficultyPlanAdjustmentVerifierInputSha256,
		fixture.index.difficultyPlanAdjustmentVerifierInputSha256
	);
	const payload = bundle.artifacts.find(
		(artifact) => artifact.relativePath === 'verifier-01/wave-01.json'
	).value;
	for (const artifact of bundle.artifacts.filter((candidate) =>
		/\/wave-\d+\.json$/u.test(candidate.relativePath)
	)) {
		assert.match(
			artifact.value.message,
			new RegExp(fixture.index.curriculumRemapVerifierInputSha256)
		);
		assert.match(
			artifact.value.message,
			new RegExp(fixture.index.difficultyPlanAdjustmentVerifierInputSha256)
		);
	}
	for (const proposal of difficultyProposals) {
		assert.match(payload.message, new RegExp(proposal.proposalSha256));
		assert.match(
			payload.message,
			new RegExp(`${proposal.field} ${proposal.from} -> ${proposal.to}`)
		);
	}
	assert.match(payload.message, /difficultyPlanAdjustmentDecisions/);
	assert.match(payload.message, /curriculumRemapDecisions/);
	assert.match(payload.message, /does not accept the rest of a challenge/);
});

test('rejects duplicate, stale and out-of-assignment difficulty adjustment evidence', () => {
	for (const mutate of [
		({ proposals }) => [proposals[0], proposals[0]],
		({ proposals }) => [{ ...proposals[0], challengeId: 'challenge-999-1' }],
		({ evidence }) => [{ ...evidence[0], proposalSha256: 'f'.repeat(64) }]
	]) {
		const fixture = packetFixture();
		fixture.index.basePlanSha256 = fixture.index.planSha256;
		fixture.index.effectivePlanSha256 = 'e'.repeat(64);
		fixture.index.difficultyPlanAdjustmentVerifierInputSha256 = '9'.repeat(64);
		const proposal = difficultyProposal(fixture.index.assignments[0].ids[0], fixture.index, {
			from: 'starter'
		});
		const proposals = [proposal];
		const evidence = [difficultyDisplayEvidence(proposal)];
		const mutated = mutate({ proposals, evidence });
		if (mutated[0]?.proposalSha256 === 'f'.repeat(64)) {
			fixture.index.assignments[0].difficultyPlanAdjustmentProposals = proposals;
			fixture.index.assignments[0].difficultyPlanAdjustmentProposalEvidence = mutated;
		} else {
			fixture.index.assignments[0].difficultyPlanAdjustmentProposals = mutated;
			fixture.index.assignments[0].difficultyPlanAdjustmentProposalEvidence = evidence;
		}
		fixture.ledger.indexSha256 = canonicalHash(fixture.index);
		const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
		assert.equal(validation.status, 'failed');
	}
});

test('binds ordered review-rebase remediation slices and gives non-forcing reviewer notice', () => {
	const fixture = packetFixture();
	const firstTarget = fixture.index.assignments[0].ids[0];
	const secondTarget = fixture.index.assignments[3].ids[1];
	addReviewRebaseBindings(fixture.index, [
		{
			issue: `${firstTarget} opening context is too similar to its peer.`,
			preferredChallengeId: firstTarget
		},
		{
			issue: `${secondTarget} transfer context is too similar to its peer.`,
			preferredChallengeId: secondTarget
		}
	]);
	fixture.ledger.indexSha256 = canonicalHash(fixture.index);
	const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));

	const bundle = buildScienceChallengeVerifierPacketBundle({
		assignmentIndex: fixture.index,
		dispatchLedger: fixture.ledger,
		assignmentIndexPath: 'verification/assignment-index.json',
		dispatchLedgerPath: 'verification/dispatch-ledger.json',
		packetRootPath: 'verification/verifier-packets',
		reviewRootPath: 'verification/reviews'
	});
	const targeted = bundle.artifacts.find(
		(artifact) => artifact.relativePath === 'verifier-01/wave-01.json'
	).value;
	const untargeted = bundle.artifacts.find(
		(artifact) => artifact.relativePath === 'verifier-01/wave-02.json'
	).value;
	assert.match(targeted.message, new RegExp(fixture.index.reviewRebaseId));
	assert.match(targeted.message, new RegExp(fixture.index.reviewRebaseManifestSha256));
	assert.match(targeted.message, /evidence to investigate, not a reviewer verdict/i);
	assert.match(targeted.message, /Do not reject solely because this notice exists/i);
	assert.match(targeted.message, /preferred target is repair routing, not forced blame/i);
	assert.match(targeted.message, new RegExp(firstTarget));
	assert.match(untargeted.message, /no preferred remediation target/i);
	const packet = bundle.artifacts.find(
		(artifact) => artifact.relativePath === 'verifier-01/packet.json'
	).value;
	assert.equal(
		packet.reviewRebaseCollectionValidationSha256,
		fixture.index.reviewRebaseCollectionValidationSha256
	);
	assert.deepEqual(packet.waves[0].reviewRebaseCollectionRemediations, [
		fixture.index.reviewRebaseCollectionRemediations[0]
	]);
	assert.deepEqual(packet.waves[1].reviewRebaseCollectionRemediations, []);
});

test('rejects stale review-rebase hashes, targets, ordering, slices and mixed recovery evidence', () => {
	for (const mutate of [
		(index) => {
			index.reviewRebaseCollectionRemediationSetSha256 = 'f'.repeat(64);
		},
		(index) => {
			index.reviewRebaseCollectionRemediationTargetIds = ['not-assigned'];
			index.reviewRebaseCollectionRemediationTargetSetSha256 = canonicalHash(['not-assigned']);
		},
		(index) => {
			index.reviewRebaseCollectionRemediations.reverse();
		},
		(index) => {
			index.assignments[0].reviewRebaseCollectionRemediations = [];
		},
		(index) => {
			index.curriculumRemapVerifierInputSha256 = '8'.repeat(64);
		}
	]) {
		const fixture = packetFixture();
		addReviewRebaseBindings(fixture.index, [
			{
				issue: 'First deterministic collection issue.',
				preferredChallengeId: fixture.index.assignments[0].ids[0]
			},
			{
				issue: 'Second deterministic collection issue.',
				preferredChallengeId: fixture.index.assignments[1].ids[0]
			}
		]);
		mutate(fixture.index);
		fixture.ledger.indexSha256 = canonicalHash(fixture.index);
		const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
		assert.equal(validation.status, 'failed');
	}
});

test('propagates an effective-successor infrastructure-recovery binding without direct B0 authority', () => {
	const fixture = packetFixture();
	fixture.index.effectiveCohortManifestSha256 = '4'.repeat(64);
	fixture.index.recoverySetSha256 = canonicalHash([]);
	fixture.index.reviewRebaseInfrastructureRecoveryManifestSha256 = '5'.repeat(64);
	fixture.index.reviewRebaseInfrastructureRecoveryId = '6'.repeat(64);
	fixture.ledger.indexSha256 = canonicalHash(fixture.index);

	const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));
	const bundle = buildScienceChallengeVerifierPacketBundle({
		assignmentIndex: fixture.index,
		dispatchLedger: fixture.ledger,
		assignmentIndexPath: 'verification/assignment-index.json',
		dispatchLedgerPath: 'verification/dispatch-ledger.json',
		packetRootPath: 'verification/verifier-packets',
		reviewRootPath: 'verification/reviews'
	});
	const packet = bundle.artifacts.find(
		(artifact) => artifact.relativePath === 'verifier-01/packet.json'
	).value;
	const payload = bundle.artifacts.find(
		(artifact) => artifact.relativePath === 'verifier-01/wave-01.json'
	).value;
	assert.equal(
		bundle.manifest.reviewRebaseInfrastructureRecoveryManifestSha256,
		fixture.index.reviewRebaseInfrastructureRecoveryManifestSha256
	);
	assert.equal(
		bundle.manifest.reviewRebaseInfrastructureRecoveryId,
		fixture.index.reviewRebaseInfrastructureRecoveryId
	);
	for (const value of [
		fixture.index.reviewRebaseInfrastructureRecoveryManifestSha256,
		fixture.index.reviewRebaseInfrastructureRecoveryId
	]) {
		assert.match(payload.message, new RegExp(value));
	}
	assert.equal(
		packet.reviewRebaseInfrastructureRecoveryManifestSha256,
		fixture.index.reviewRebaseInfrastructureRecoveryManifestSha256
	);
	assert.equal(
		packet.waves[0].reviewRebaseInfrastructureRecoveryId,
		fixture.index.reviewRebaseInfrastructureRecoveryId
	);
	assert.equal(packet.reviewRebaseManifestSha256, undefined);
});

test('rejects partial, stale-mode and mixed infrastructure-recovery packet bindings', () => {
	for (const mutate of [
		(index) => {
			delete index.reviewRebaseInfrastructureRecoveryId;
		},
		(index) => {
			index.recoverySetSha256 = 'f'.repeat(64);
		},
		(index) => {
			addReviewRebaseBindings(index, [
				{
					issue: 'Direct B0 authority must stay separate.',
					preferredChallengeId: index.assignments[0].ids[0]
				}
			]);
		},
		(index) => {
			index.curriculumRemapVerifierInputSha256 = '8'.repeat(64);
		}
	]) {
		const fixture = packetFixture();
		fixture.index.effectiveCohortManifestSha256 = '4'.repeat(64);
		fixture.index.recoverySetSha256 = canonicalHash([]);
		fixture.index.reviewRebaseInfrastructureRecoveryManifestSha256 = '5'.repeat(64);
		fixture.index.reviewRebaseInfrastructureRecoveryId = '6'.repeat(64);
		mutate(fixture.index);
		fixture.ledger.indexSha256 = canonicalHash(fixture.index);
		const validation = validateScienceChallengeVerifierPacketInputs(fixture.index, fixture.ledger);
		assert.equal(validation.status, 'failed');
		assert.match(validation.issues.join('\n'), /infrastructure recovery|infrastructure-recovery/i);
	}
});

function packetFixture() {
	const assignments = Array.from({ length: ASSIGNMENT_COUNT }, (_unused, index) => {
		const ordinal = String(index + 1).padStart(3, '0');
		return {
			assignmentId: `science-${ordinal}`,
			path: `verification/assignments/science-${ordinal}.json`,
			sha256: String(index + 1).padStart(64, '0'),
			ids: Array.from(
				{ length: 8 },
				(_unusedId, challengeIndex) => `challenge-${ordinal}-${challengeIndex + 1}`
			)
		};
	});
	const index = {
		schemaVersion: 'science-challenge-verification-assignment-index/v1',
		planId: 'science-fixture-v1',
		planSha256: 'a'.repeat(64),
		sourceSnapshotSha256: 'b'.repeat(64),
		curriculumEvidenceSha256: 'c'.repeat(64),
		candidateSetSha256: 'd'.repeat(64),
		candidateCount: assignments.reduce((sum, assignment) => sum + assignment.ids.length, 0),
		assignments
	};
	return {
		index,
		ledger: {
			schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
			orchestrator: 'codex-collaboration',
			indexSha256: canonicalHash(index),
			createdAt: '2026-07-23T00:00:00.000Z',
			dispatches: assignments.map((assignment, assignmentIndex) => ({
				assignmentId: assignment.assignmentId,
				assignmentPath: assignment.path,
				assignmentSha256: assignment.sha256,
				orchestrator: 'codex-collaboration',
				taskName: verifierTaskName(assignmentIndex),
				forkTurns: 'none',
				model: 'gpt-5.6-sol',
				reasoningEffort: 'max'
			}))
		}
	};
}

function verifierTaskName(assignmentIndex) {
	let upperBound = 0;
	for (const [verifierIndex, count] of VERIFIER_ASSIGNMENT_COUNTS.entries()) {
		upperBound += count;
		if (assignmentIndex < upperBound) {
			return `/root/science_verify_${String(verifierIndex + 1).padStart(3, '0')}`;
		}
	}
	throw new Error(`No verifier allocation for assignment index ${assignmentIndex}.`);
}

function addReviewRebaseBindings(index, remediations) {
	const targetIds = [...new Set(remediations.map((item) => item.preferredChallengeId))].sort();
	const shared = {
		reviewRebaseManifestSha256: '1'.repeat(64),
		reviewRebaseId: '2'.repeat(64),
		reviewRebaseCandidateSetSha256: index.candidateSetSha256,
		reviewRebaseCollectionValidationSha256: '3'.repeat(64),
		reviewRebaseCollectionRemediationSetSha256: canonicalHash(remediations),
		reviewRebaseCollectionRemediations: remediations,
		reviewRebaseCollectionRemediationTargetIds: targetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
	};
	Object.assign(index, shared);
	for (const assignment of index.assignments) {
		Object.assign(assignment, {
			reviewRebaseManifestSha256: shared.reviewRebaseManifestSha256,
			reviewRebaseId: shared.reviewRebaseId,
			reviewRebaseCandidateSetSha256: shared.reviewRebaseCandidateSetSha256,
			reviewRebaseCollectionRemediationSetSha256: shared.reviewRebaseCollectionRemediationSetSha256,
			reviewRebaseCollectionRemediations: remediations.filter((item) =>
				assignment.ids.includes(item.preferredChallengeId)
			)
		});
	}
}

function remapProposal(challengeId, index) {
	return buildScienceChallengeCurriculumRemapProposal({
		challengeId,
		field: 'grounding.curriculumComponentId',
		from: 'aqa-gcse-biology-8461-v1.1:4-1-1',
		to: 'aqa-gcse-biology-8461-v1.1:4-1-1-2',
		basePlanSha256: index.planSha256,
		effectivePlanSha256: index.effectivePlanSha256 ?? index.planSha256,
		curriculumEvidenceSha256: index.curriculumEvidenceSha256,
		targetCandidateSha256: '5'.repeat(64),
		batchCandidateSha256: index.candidateSetSha256,
		baseReviewSha256: '6'.repeat(64),
		manifestSha256: '7'.repeat(64)
	});
}

function remapDisplayEvidence(proposal) {
	return {
		challengeId: proposal.challengeId,
		proposalSha256: proposal.proposalSha256,
		field: proposal.field,
		from: {
			componentId: proposal.from,
			title: 'Cell biology',
			sourceTextSha256: '1'.repeat(64),
			substantiveExcerpt: 'The broad parent component excerpt.'
		},
		to: {
			componentId: proposal.to,
			title: 'Cell specialisation',
			sourceTextSha256: '2'.repeat(64),
			substantiveExcerpt: 'The exact descendant component excerpt.'
		},
		ancestryChain: [
			{ componentId: proposal.from, title: 'Cell biology' },
			{ componentId: proposal.to, title: 'Cell specialisation' }
		],
		targetRowDiffStatement: 'Only the curriculum component id changes.',
		originalSingleIssueGate: {
			field: proposal.field,
			category: 'curriculum',
			evidence: 'The original component was too broad.',
			repair: 'Use the exact descendant.'
		}
	};
}

function difficultyProposal(
	challengeId,
	index,
	{ from = 'stretch', targetCandidateSha256 = '1'.repeat(64) } = {}
) {
	return buildScienceChallengeDifficultyPlanAdjustmentProposal({
		challengeId,
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		from,
		to: 'standard',
		sourceAttempt: 4,
		sourcePolicy: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY,
		basePlanSha256: index.basePlanSha256,
		effectivePlanSha256: index.effectivePlanSha256,
		targetCandidateSha256,
		batchCandidateSha256: '3'.repeat(64),
		baseReviewSha256: '4'.repeat(64),
		manifestSha256: '5'.repeat(64)
	});
}

function difficultyDisplayEvidence(proposal) {
	return buildScienceChallengeDifficultyPlanAdjustmentProposalEvidence(
		{
			challengeId: proposal.challengeId,
			field: proposal.field,
			from: proposal.from,
			to: proposal.to,
			sourceAttempt: proposal.sourceAttempt,
			sourcePolicy: proposal.sourcePolicy,
			targetRowDiffStatement:
				'The typed plan projection changes only definition.difficulty; terminal content remains byte-identical.',
			originalSingleIssueGate: {
				field: proposal.field,
				category: 'difficulty',
				evidence: `${proposal.challengeId} is miscalibrated.`,
				repair: `Change ${proposal.from} to ${proposal.to}.`
			}
		},
		proposal
	);
}
