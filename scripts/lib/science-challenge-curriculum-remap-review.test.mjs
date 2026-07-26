import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalHash } from './science-challenge-release.mjs';
import {
	buildScienceChallengeCurriculumRemapProposal,
	buildScienceChallengeCurriculumRemapProposalEvidence,
	validateScienceChallengeContentReviewRow,
	validateScienceChallengeCurriculumRemapProposalOverrideBijection,
	validateScienceChallengeCurriculumRemapProposalEvidenceList,
	validateScienceChallengeCurriculumRemapProposals
} from './science-challenge-curriculum-remap-review.mjs';

test('accepts an exact assigned proposal decision without replacing the full review', () => {
	const proposal = remapProposal();
	const displayEvidence = remapDisplayEvidence(proposal);
	assert.equal(
		validateScienceChallengeCurriculumRemapProposals([proposal], {
			assignedChallengeIds: [proposal.challengeId],
			basePlanSha256: proposal.basePlanSha256,
			curriculumEvidenceSha256: proposal.curriculumEvidenceSha256,
			candidateById: new Map([[proposal.challengeId, proposal.targetCandidateSha256]]),
			batchCandidateSha256: proposal.batchCandidateSha256
		}).status,
		'passed'
	);
	assert.deepEqual(buildScienceChallengeCurriculumRemapProposal(proposal), proposal);
	assert.deepEqual(
		buildScienceChallengeCurriculumRemapProposalEvidence(displayEvidence, proposal),
		displayEvidence
	);
	assert.equal(
		validateScienceChallengeCurriculumRemapProposalEvidenceList([displayEvidence], {
			proposals: [proposal]
		}).status,
		'passed'
	);
	assert.equal(
		validateScienceChallengeContentReviewRow(acceptedReview(proposal), { proposal }).status,
		'passed'
	);
});

test('rejects unknown fields, malformed ids, ambiguous decisions and unassigned decisions', () => {
	const proposal = remapProposal();
	for (const [review, assignedProposal, expected] of [
		[{ ...acceptedReview(proposal), unexpected: true }, proposal, /review\.unexpected is unknown/],
		[
			{
				...acceptedReview(proposal),
				curriculumRemapDecisions: [
					...acceptedReview(proposal).curriculumRemapDecisions,
					...acceptedReview(proposal).curriculumRemapDecisions
				]
			},
			proposal,
			/at most one decision/
		],
		[
			{
				...acceptedReview(proposal),
				curriculumRemapDecisions: [
					{
						...acceptedReview(proposal).curriculumRemapDecisions[0],
						challengeId: 'Not canonical'
					}
				]
			},
			proposal,
			/canonical id/
		],
		[acceptedReview(proposal), undefined, /no assigned proposal/]
	]) {
		const validation = validateScienceChallengeContentReviewRow(review, {
			proposal: assignedProposal
		});
		assert.equal(validation.status, 'failed');
		assert.match(validation.issues.join('\n'), expected);
	}
});

test('rejects another field, stale proposal identity and remap acceptance without content acceptance', () => {
	const proposal = remapProposal();
	const wrongField = acceptedReview(proposal);
	wrongField.curriculumRemapDecisions[0].field = 'definition.id';
	assert.match(
		validateScienceChallengeContentReviewRow(wrongField, { proposal }).issues.join('\n'),
		/field must be grounding\.curriculumComponentId/
	);

	const stale = acceptedReview(proposal);
	stale.curriculumRemapDecisions[0].to = 'biology-topic-another-leaf';
	assert.match(
		validateScienceChallengeContentReviewRow(stale, { proposal }).issues.join('\n'),
		/does not exactly match/
	);

	const rejected = acceptedReview(proposal);
	rejected.accepted = false;
	rejected.curriculumGrounded = false;
	rejected.issues = [
		{
			field: 'grounding.curriculumComponentId',
			category: 'curriculum',
			evidence: 'The challenge is not grounded.',
			repair: 'Use the assigned component.'
		}
	];
	assert.match(
		validateScienceChallengeContentReviewRow(rejected, { proposal }).issues.join('\n'),
		/requires overall challenge acceptance/
	);
});

test('rejects malformed, duplicate and stale proposal bindings', () => {
	const proposal = remapProposal();
	for (const [proposals, options, expected] of [
		[
			[{ ...proposal, challengeId: 'Not canonical' }],
			{ assignedChallengeIds: [proposal.challengeId] },
			/canonical id/
		],
		[
			[proposal, proposal],
			{ assignedChallengeIds: [proposal.challengeId] },
			/multiple or ambiguous/
		],
		[[proposal], { assignedChallengeIds: ['biology-another-challenge'] }, /not assigned/],
		[
			[proposal],
			{ candidateById: new Map([[proposal.challengeId, 'f'.repeat(64)]]) },
			/targetCandidateSha256 does not match/
		]
	]) {
		const validation = validateScienceChallengeCurriculumRemapProposals(proposals, options);
		assert.equal(validation.status, 'failed');
		assert.match(validation.issues.join('\n'), expected);
	}
});

test('requires an exact manifest-derived proposal and candidate-override bijection', () => {
	const proposal = remapProposal();
	const basePlan = {
		rows: [
			{
				id: proposal.challengeId,
				shard: 'science-001',
				curriculumComponentId: proposal.from
			}
		]
	};
	const effectivePlan = {
		rows: [
			{
				id: proposal.challengeId,
				shard: 'science-001',
				curriculumComponentId: proposal.to
			}
		]
	};
	const manifest = {
		shardId: 'science-001',
		challengeId: proposal.challengeId,
		remap: { field: proposal.field, from: proposal.from, to: proposal.to },
		base: { planSha256: proposal.basePlanSha256, planRowIndex: 0 },
		effective: { planSha256: proposal.effectivePlanSha256, planRowIndex: 0 },
		evidence: { curriculumEvidenceSha256: proposal.curriculumEvidenceSha256 },
		candidateTargetSha256: proposal.targetCandidateSha256,
		candidateSha256: proposal.batchCandidateSha256,
		firstReview: { summarySha256: proposal.baseReviewSha256 }
	};
	const override = {
		shardId: manifest.shardId,
		manifest,
		manifestSha256: proposal.manifestSha256,
		candidateSha256: proposal.batchCandidateSha256
	};
	const exact = {
		basePlan,
		effectivePlan,
		proposals: [proposal],
		candidateOverrides: [override]
	};
	assert.equal(
		validateScienceChallengeCurriculumRemapProposalOverrideBijection(exact).status,
		'passed'
	);

	const sibling = buildScienceChallengeCurriculumRemapProposal({
		...proposal,
		challengeId: 'biology-fixture-sibling'
	});
	for (const [value, expected] of [
		[{ ...exact, proposals: [sibling] }, /challengeId differs/],
		[{ ...exact, proposals: [] }, /one-to-one set|exactly one proposal/],
		[{ ...exact, proposals: [proposal, sibling] }, /one-to-one set|unique candidateOverride/],
		[
			{
				...exact,
				candidateOverrides: [
					override,
					{
						...override,
						shardId: 'science-002',
						manifestSha256: '9'.repeat(64),
						manifest: { ...manifest, shardId: 'science-002' }
					}
				]
			},
			/one-to-one set|exactly one proposal/
		],
		[
			{
				...exact,
				proposals: [
					buildScienceChallengeCurriculumRemapProposal({
						...proposal,
						to: 'aqa-gcse-biology-8461-v1.1:4-1-1-3'
					})
				]
			},
			/to differs/
		]
	]) {
		const validation = validateScienceChallengeCurriculumRemapProposalOverrideBijection(value);
		assert.equal(validation.status, 'failed');
		assert.match(validation.issues.join('\n'), expected);
	}
});

function remapProposal() {
	return buildScienceChallengeCurriculumRemapProposal({
		challengeId: 'biology-fixture-challenge',
		field: 'grounding.curriculumComponentId',
		from: 'aqa-gcse-biology-8461-v1.1:4-1-1',
		to: 'aqa-gcse-biology-8461-v1.1:4-1-1-2',
		basePlanSha256: '2'.repeat(64),
		effectivePlanSha256: '3'.repeat(64),
		curriculumEvidenceSha256: '4'.repeat(64),
		targetCandidateSha256: '5'.repeat(64),
		batchCandidateSha256: canonicalHash(remapBatchCandidate()),
		baseReviewSha256: '7'.repeat(64),
		manifestSha256: '8'.repeat(64)
	});
}

function remapBatchCandidate() {
	return {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [{ definition: { id: 'biology-fixture-challenge' } }]
	};
}

function remapDisplayEvidence(proposal) {
	return {
		challengeId: proposal.challengeId,
		proposalSha256: proposal.proposalSha256,
		field: proposal.field,
		from: {
			componentId: proposal.from,
			title: 'Cell biology',
			sourceTextSha256: 'a'.repeat(64),
			substantiveExcerpt: 'Students should understand cells and their structures.'
		},
		to: {
			componentId: proposal.to,
			title: 'Cell specialisation',
			sourceTextSha256: 'b'.repeat(64),
			substantiveExcerpt: 'Students should explain how specialised cells are adapted.'
		},
		ancestryChain: [
			{ componentId: proposal.from, title: 'Cell biology' },
			{ componentId: proposal.to, title: 'Cell specialisation' }
		],
		targetRowDiffStatement:
			'Only grounding.curriculumComponentId changes from the parent to its descendant.',
		originalSingleIssueGate: {
			field: proposal.field,
			category: 'curriculum',
			evidence: 'The original review identified only an overly broad component.',
			repair: 'Use the exact supported descendant component.'
		}
	};
}

function acceptedReview(proposal) {
	return {
		id: proposal.challengeId,
		accepted: true,
		curriculumGrounded: true,
		paperCalibrated: true,
		scientificallyCorrect: true,
		contextsDistinct: true,
		selfContained: true,
		flowCoherent: true,
		choicesFair: true,
		difficultyCalibrated: true,
		learnerCopyClean: true,
		artBriefsSafe: true,
		heroTeaserSafe: true,
		checkedCalculations: [],
		issues: [],
		curriculumRemapDecisions: [
			{
				challengeId: proposal.challengeId,
				field: proposal.field,
				from: proposal.from,
				to: proposal.to,
				accepted: true
			}
		]
	};
}
