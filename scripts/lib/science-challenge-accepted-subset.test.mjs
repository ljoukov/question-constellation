import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildScienceChallengeAcceptedSubsetArtifacts,
	findScienceChallengeAcceptedSubsetLeaks,
	validateScienceChallengeAcceptedSubsetArtifacts
} from './science-challenge-accepted-subset.mjs';
import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	canonicalHash
} from './science-challenge-release.mjs';

const passingCollectionValidator = () => ({ status: 'passed', issues: [] });

test('projects only accepted candidates in source-plan order and emits a complete hash tree', () => {
	const fixture = makeFixture();
	const built = buildFixture(fixture);

	assert.deepEqual(
		built.acceptedCandidates.map((candidate) => candidate.definition.id),
		['biology-fixture-01', 'physics-fixture-01']
	);
	assert.deepEqual(built.acceptedSubset.selection.acceptedIds, [
		'biology-fixture-01',
		'physics-fixture-01'
	]);
	assert.deepEqual(built.acceptedSubset.selection.rejectedIds, [
		'chemistry-fixture-01',
		'biology-fixture-02'
	]);
	assert.deepEqual(Object.keys(built.acceptedSubset.selection), [
		'ordering',
		'reviewedCount',
		'acceptedCount',
		'rejectedCount',
		'fullCandidateSetSha256',
		'acceptedCandidateSetSha256',
		'acceptedIdSetSha256',
		'reviewSetSha256',
		'acceptedReviewSetSha256',
		'acceptedIds',
		'rejectedIds',
		'decisions'
	]);
	assert.equal(built.holdoutLedger.heldOutCount, 2);
	assert.equal(built.holdoutLedger.holdouts[0].issues[0].repair, 'Add the missing link.');
	assert.deepEqual(
		[...built.fileBytes.keys()].sort(),
		[
			'accepted-subset.json',
			'collection-validation.json',
			'evidence-projection.json',
			'hash-receipt.json',
			'holdout-ledger.json',
			'manifest.json'
		].sort()
	);
	assert.deepEqual(
		built.manifest.companionFiles.map((record) => record.path).sort(),
		[
			'accepted-subset.json',
			'collection-validation.json',
			'evidence-projection.json',
			'hash-receipt.json',
			'holdout-ledger.json'
		].sort()
	);
	assert.deepEqual(findScienceChallengeAcceptedSubsetLeaks(replayValues(built)), []);
});

test('treats collection validation as a hard release gate', () => {
	const fixture = makeFixture();
	assert.throws(
		() =>
			buildScienceChallengeAcceptedSubsetArtifacts({
				...fixture,
				validateCollection: () => ({
					status: 'failed',
					issues: ['duplicate retained title']
				})
			}),
		/collection validation failed.*duplicate retained title/iu
	);
});

test('rejects accepted reviews with any unresolved semantic gate', () => {
	const fixture = makeFixture();
	fixture.reviews[0].scientificallyCorrect = false;
	assert.throws(
		() => buildFixture(fixture),
		/Semantic review biology-fixture-01 is malformed.*hard gate/iu
	);
});

test('cannot retain a B0 collection-remediation target', () => {
	const fixture = makeFixture();
	fixture.sourceBindings.reviewRebaseCollectionRemediationTargetIds = ['biology-fixture-01'];
	assert.throws(() => buildFixture(fixture), /remains a B0 collection-remediation target/iu);
});

test('replay validation rejects a rehashed-looking selection mutation', () => {
	const fixture = makeFixture();
	const built = buildFixture(fixture);
	const values = structuredClone(replayValues(built));
	values.acceptedSubset.selection.acceptedIds.reverse();
	assert.throws(
		() =>
			validateScienceChallengeAcceptedSubsetArtifacts(values, {
				validateCollection: passingCollectionValidator,
				expectedBindings: fixture.expectedBindings
			}),
		/not the exact plan-order review projection/iu
	);
});

test('leak scanner catches machine paths, usernames, and verifier task labels', () => {
	const leaks = findScienceChallengeAcceptedSubsetLeaks({
		mac: '/Users/example/private.json',
		linux: '/home/example/review.json',
		taskName: '/root/science_verify_01',
		user: 'yaroslav_volovich'
	});
	assert.equal(leaks.length, 5);
	assert.ok(leaks.some((leak) => leak.includes('machine path')));
	assert.ok(leaks.some((leak) => leak.includes('task-name field')));
});

function buildFixture(fixture) {
	return buildScienceChallengeAcceptedSubsetArtifacts({
		...fixture,
		validateCollection: passingCollectionValidator
	});
}

function makeFixture() {
	const rows = [
		makeRow('biology-fixture-01', 'biology', 'component-biology-01', 'a'),
		makeRow('chemistry-fixture-01', 'chemistry', 'component-chemistry-01', 'b'),
		makeRow('physics-fixture-01', 'physics', 'component-physics-01', 'c'),
		makeRow('biology-fixture-02', 'biology', 'component-biology-02', 'd')
	];
	const plan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'fixture-plan',
		targetFinalCatalogueRounds: 6,
		rows
	};
	const candidates = rows.map((row) => ({
		definition: {
			id: row.id,
			title: `Title for ${row.id}`
		},
		grounding: {
			curriculumComponentId: row.curriculumComponentId
		}
	}));
	const reviews = [
		makeReview(rows[0].id, true),
		makeReview(rows[1].id, false),
		makeReview(rows[2].id, true),
		makeReview(rows[3].id, false)
	];
	const existingDefinitions = [
		{ id: 'authored-01', title: 'Authored one' },
		{ id: 'authored-02', title: 'Authored two' }
	];
	const curriculumEvidence = {
		components: rows.map((row, index) => ({
			componentId: row.curriculumComponentId,
			sourceTextSha256: String(index + 1).repeat(64)
		}))
	};
	const sourceBindings = {
		sourcePlanSha256: canonicalHash(plan),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		verificationSummarySha256: 'e'.repeat(64),
		verificationSummaryFileSha256: 'f'.repeat(64),
		reviewRebaseCollectionRemediationTargetIds: []
	};
	const assignmentRecords = [
		{
			alias: 'assignment-001',
			shardId: 'science-fixture-001',
			candidateIds: rows.map((row) => row.id),
			candidateSetSha256: canonicalHash(candidates),
			semanticReviewSetSha256: canonicalHash(reviews),
			acceptedCount: 2,
			rejectedCount: 2,
			assignmentFileSha256: '1'.repeat(64),
			assignmentCanonicalSha256: '2'.repeat(64),
			semanticReviewFileSha256: '3'.repeat(64),
			semanticReviewFileCanonicalSha256: '4'.repeat(64),
			verifier: {
				alias: 'verifier-001',
				model: 'fixture-model',
				reasoningEffort: 'high',
				context: 'empty',
				forkTurns: 'none',
				orchestrator: 'fixture-orchestrator',
				reviewedAt: '2026-07-25T00:00:00.000Z'
			}
		}
	];
	const acceptedCandidates = [candidates[0], candidates[2]];
	const rejectedCandidates = [candidates[1], candidates[3]];
	const acceptedReviews = [reviews[0], reviews[2]];
	const expectedBindings = {
		sourcePlanId: plan.planId,
		sourcePlanSha256: canonicalHash(plan),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		reviewedCount: candidates.length,
		acceptedCount: acceptedCandidates.length,
		rejectedCount: rejectedCandidates.length,
		existingDefinitionCount: existingDefinitions.length,
		projectedCatalogueCount: existingDefinitions.length + acceptedCandidates.length,
		fullCandidateSetSha256: canonicalHash(candidates),
		acceptedCandidateSetSha256: canonicalHash(acceptedCandidates),
		rejectedCandidateSetSha256: canonicalHash(rejectedCandidates),
		acceptedIdSetSha256: canonicalHash(acceptedCandidates.map((value) => value.definition.id)),
		reviewSetSha256: canonicalHash(reviews),
		acceptedReviewSetSha256: canonicalHash(acceptedReviews),
		existingDefinitionSetSha256: canonicalHash(existingDefinitions)
	};
	return {
		plan,
		candidates,
		reviews,
		existingDefinitions,
		curriculumEvidence,
		assignmentRecords,
		sourceBindings,
		expectedBindings
	};
}

function makeRow(id, subject, curriculumComponentId, hashCharacter) {
	return {
		id,
		subject,
		shard: 'science-fixture-001',
		calibrationQuestionId: `question-${id}`,
		calibrationQuestionSha256: hashCharacter.repeat(64),
		curriculumComponentId,
		specificationId: `specification-${subject}`,
		specificationSha256: hashCharacter.repeat(64)
	};
}

function makeReview(id, accepted) {
	const review = Object.fromEntries(
		SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])
	);
	return {
		id,
		...review,
		checkedCalculations: [],
		issues: accepted
			? []
			: [
					{
						field: 'definition.answerChain',
						category: 'coherence',
						evidence: 'A causal step is missing.',
						repair: 'Add the missing link.'
					}
				],
		...(accepted ? {} : { flowCoherent: false }),
		accepted
	};
}

function replayValues(built) {
	return {
		acceptedSubset: built.acceptedSubset,
		evidenceProjection: built.evidenceProjection,
		collectionValidation: built.collectionValidation,
		holdoutLedger: built.holdoutLedger,
		hashReceipt: built.hashReceipt
	};
}
