import assert from 'node:assert/strict';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION,
	SCIENCE_CHALLENGE_REVIEW_REBASE_MANIFEST_SCHEMA,
	SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA,
	SCIENCE_CHALLENGE_REVIEW_REBASE_VALIDATION_SCHEMA,
	buildScienceChallengeReviewRebase
} from './science-challenge-review-rebase.mjs';
import { SCIENCE_CHALLENGE_BATCH_SCHEMA, canonicalHash } from './science-challenge-release.mjs';

const acceptedBiologyId = 'biology-cell-structure-01';
const rejectedDifficultyId = 'biology-cell-structure-02';
const rejectedCollisionId = 'chemistry-bonding-01';
const acceptedChemistryId = 'chemistry-bonding-02';
const collectionIssue =
	'chemistry-bonding-01 opening duplicates biology-cell-structure-02 transfer.';

test('builds a deterministic review-pending, explicitly non-release-eligible rebase', () => {
	const fixture = reviewRebaseFixture();
	const before = canonicalHash({
		basePlan: fixture.basePlan,
		selections: fixture.selections,
		spec: fixture.spec
	});
	const result = buildScienceChallengeReviewRebase(fixture);

	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(result.manifest.schemaVersion, SCIENCE_CHALLENGE_REVIEW_REBASE_MANIFEST_SCHEMA);
	assert.equal(result.manifest.status, 'review-pending');
	assert.equal(result.manifest.disposition, SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION);
	assert.equal(result.manifest.requiresFreshFullVerification, true);
	assert.equal(result.manifest.releaseEligible, false);
	assert.equal(result.manifest.candidateCount, 4);
	assert.equal(result.plan.rows[1].difficulty, 'standard');
	assert.equal(
		result.candidateBatches
			.get('science-001')
			.challenges.find((entry) => entry.definition.id === rejectedDifficultyId).definition
			.difficulty,
		'standard'
	);
	assert.equal(
		canonicalHash(result.orderedCandidates[0]),
		canonicalHash(fixture.parentCandidateById.get(acceptedBiologyId)),
		'an independently accepted row must be frozen exactly'
	);
	assert.equal(
		canonicalHash(result.orderedCandidates[3]),
		canonicalHash(fixture.parentCandidateById.get(acceptedChemistryId)),
		'an accepted sibling in another shard must also be frozen exactly'
	);
	assert.deepEqual(
		result.orderedCandidates.map((entry) => entry.definition.id),
		fixture.basePlan.rows.map((row) => row.id)
	);
	assert.equal(result.manifest.basePlanSha256, canonicalHash(fixture.basePlan));
	assert.equal(result.manifest.planSha256, canonicalHash(result.plan));
	assert.equal(result.manifest.candidateSetSha256, canonicalHash(result.orderedCandidates));
	assert.equal(
		result.manifest.collectionValidationSha256,
		canonicalHash(result.collectionValidation)
	);
	assert.equal(
		result.manifest.collectionRemediationSetSha256,
		canonicalHash(fixture.spec.collectionRemediations)
	);

	for (const [shardId, validation] of result.outputValidations) {
		assert.deepEqual(validation, {
			schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_VALIDATION_SCHEMA,
			status: 'passed',
			contentStatus: 'review-pending',
			issues: [],
			authoringDisposition: SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION,
			releaseEligible: false,
			rebaseId: result.manifest.rebaseId,
			shardId,
			basePlanSha256: result.manifest.basePlanSha256,
			planSha256: result.manifest.planSha256,
			sourceSnapshotSha256: result.manifest.sourceSnapshotSha256,
			curriculumEvidenceSha256: result.manifest.curriculumEvidenceSha256,
			parentVerificationSha256: result.manifest.parent.verificationSha256,
			parentRepairSha256: result.manifest.parent.repairSha256,
			sourceCandidateSha256: result.manifest.selections.find(
				(selection) => selection.shardId === shardId
			).source.candidateSha256,
			sourceValidationSha256: result.manifest.selections.find(
				(selection) => selection.shardId === shardId
			).source.validationSha256,
			candidateSha256: canonicalHash(result.candidateBatches.get(shardId)),
			mutationSetSha256: result.manifest.selections.find(
				(selection) => selection.shardId === shardId
			).mutationSetSha256,
			requiresFreshFullVerification: true
		});
		assert.equal(
			result.manifest.selections.find((selection) => selection.shardId === shardId)
				.validationSha256,
			canonicalHash(validation)
		);
	}

	const { manifestCoreSha256: _manifestCoreSha256, ...manifestCore } = result.manifest;
	assert.equal(result.manifest.manifestCoreSha256, canonicalHash(manifestCore));
	assert.equal(
		canonicalHash({
			basePlan: fixture.basePlan,
			selections: fixture.selections,
			spec: fixture.spec
		}),
		before,
		'the builder must not mutate any caller-owned input'
	);
});

test('emits stable manifest, candidate, validation, and rebase hashes on replay', () => {
	const fixture = reviewRebaseFixture();
	const first = buildScienceChallengeReviewRebase(fixture);
	const second = buildScienceChallengeReviewRebase(fixture);

	assert.equal(first.status, 'passed', first.issues.join('\n'));
	assert.equal(second.status, 'passed', second.issues.join('\n'));
	assert.deepEqual(second.manifest, first.manifest);
	assert.equal(second.manifest.rebaseId, first.manifest.rebaseId);
	assert.equal(second.manifest.manifestCoreSha256, first.manifest.manifestCoreSha256);
	assert.equal(second.manifest.selectionSetSha256, first.manifest.selectionSetSha256);
	assert.equal(second.manifest.candidateSetSha256, first.manifest.candidateSetSha256);
	assert.deepEqual([...second.candidateBatches], [...first.candidateBatches]);
	assert.deepEqual([...second.outputValidations], [...first.outputValidations]);
});

test('rejects plan or candidate mutation attempts against an accepted parent row', async (t) => {
	await t.test('accepted plan row', () => {
		const fixture = reviewRebaseFixture();
		fixture.spec.planMutations[0] = {
			challengeId: acceptedBiologyId,
			field: 'difficulty',
			from: 'starter',
			to: 'standard',
			authority: 'operator-approved-atomic-source-reallocation'
		};
		rebindApproval(fixture);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /plan mutation target was not rejected/u);
	});

	await t.test('accepted candidate row', () => {
		const fixture = reviewRebaseFixture();
		fixture.spec.candidateMutations[0] = {
			challengeId: acceptedBiologyId,
			field: 'definition.marks',
			from: 2,
			to: 1,
			authority: 'operator-approved-atomic-source-reallocation'
		};
		rebindApproval(fixture);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /candidate mutation target was not rejected/u);
	});
});

test('freezes accepted selected content even when its declared selection hash is valid', () => {
	const fixture = reviewRebaseFixture();
	fixture.selections[0].candidate.challenges[0].definition.title = 'Tampered accepted title';
	rebindSelection(fixture.selections[0]);
	const result = buildScienceChallengeReviewRebase(fixture);

	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /accepted parent content changed during rebase/u);
});

test('composes one whole rejected row from another exact hash-bound source candidate', () => {
	const fixture = reviewRebaseFixture();
	const override = addRowOverride(fixture, rejectedCollisionId);
	const sourceRow = override.candidate.challenges.find(
		(entry) => entry.definition.id === rejectedCollisionId
	);
	const result = buildScienceChallengeReviewRebase(fixture);

	assert.equal(result.status, 'passed', result.issues.join('\n'));
	const outputRow = result.candidateBatches
		.get('science-002')
		.challenges.find((entry) => entry.definition.id === rejectedCollisionId);
	assert.equal(canonicalHash(outputRow), canonicalHash(sourceRow));
	assert.equal(outputRow.definition.title, 'Whole-row source chemistry-bonding-01');
	assert.deepEqual(result.manifest.selections[1].rowOverrides, [
		{
			challengeId: rejectedCollisionId,
			replacedRowSha256: canonicalHash(fixture.selections[1].candidate.challenges[0]),
			sourceRowSha256: override.rowSha256,
			source: {
				candidatePath: override.candidatePath,
				candidateSha256: override.candidateSha256,
				validationPath: override.validationPath,
				validationSha256: override.validationSha256
			}
		}
	]);
	assert.equal(
		result.manifest.selections[1].rowOverrideSetSha256,
		canonicalHash(result.manifest.selections[1].rowOverrides)
	);
});

test('fails closed for accepted, stale, malformed, or unbound whole-row overrides', async (t) => {
	await t.test('accepted target', () => {
		const fixture = reviewRebaseFixture();
		addRowOverride(fixture, acceptedChemistryId);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(
			result.issues.join('\n'),
			/rowOverrides\[0\] is duplicated, absent, or targets accepted content/u
		);
	});

	await t.test('unknown target id', () => {
		const fixture = reviewRebaseFixture();
		const override = addRowOverride(fixture, rejectedCollisionId);
		override.challengeId = 'chemistry-unknown-01';
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /duplicated, absent, or targets accepted content/u);
	});

	await t.test('duplicated target id', () => {
		const fixture = reviewRebaseFixture();
		const override = addRowOverride(fixture, rejectedCollisionId);
		fixture.selections[1].rowOverrides.push(structuredClone(override));
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /duplicated, absent, or targets accepted content/u);
	});

	await t.test('stale source candidate hash', () => {
		const fixture = reviewRebaseFixture();
		const override = addRowOverride(fixture, rejectedCollisionId);
		override.candidateSha256 = '4'.repeat(64);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /stale source paths, hashes, or membership/u);
	});

	await t.test('stale source validation hash', () => {
		const fixture = reviewRebaseFixture();
		const override = addRowOverride(fixture, rejectedCollisionId);
		override.validation.issues.push('Changed after binding.');
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /stale source paths, hashes, or membership/u);
	});

	await t.test('wrong source candidate id', () => {
		const fixture = reviewRebaseFixture();
		const override = addRowOverride(fixture, rejectedCollisionId);
		override.candidate.challenges[0].definition.id = 'chemistry-wrong-01';
		override.candidateSha256 = canonicalHash(override.candidate);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /stale source paths, hashes, or membership/u);
	});

	await t.test('wrong source candidate order', () => {
		const fixture = reviewRebaseFixture();
		const override = addRowOverride(fixture, rejectedCollisionId);
		override.candidate.challenges.reverse();
		override.candidateSha256 = canonicalHash(override.candidate);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /stale source paths, hashes, or membership/u);
	});

	await t.test('unbound source row hash', () => {
		const fixture = reviewRebaseFixture();
		const override = addRowOverride(fixture, rejectedCollisionId);
		override.rowSha256 = canonicalHash(override.candidate.challenges[1]);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /does not bind the exact source row/u);
	});
});

test('permits operator-approved candidate metadata changes only on rejected rows', () => {
	const fixture = reviewRebaseFixture();
	fixture.spec.candidateMutations.push({
		challengeId: rejectedDifficultyId,
		field: 'definition.marks',
		from: 2,
		to: 1,
		authority: 'operator-approved-atomic-source-reallocation'
	});
	rebindApproval(fixture);
	const result = buildScienceChallengeReviewRebase(fixture);

	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(
		result.candidateBatches
			.get('science-001')
			.challenges.find((entry) => entry.definition.id === rejectedDifficultyId).definition.marks,
		1
	);
	assert.deepEqual(
		result.manifest.selections[0].mutations.find(
			(mutation) => mutation.field === 'definition.marks'
		),
		{
			challengeId: rejectedDifficultyId,
			field: 'definition.marks',
			from: 2,
			to: 1,
			authority: 'operator-approved-atomic-source-reallocation'
		}
	);
});

test('requires exact declared from values and exact parent-review authority', async (t) => {
	await t.test('plan from value', () => {
		const fixture = reviewRebaseFixture();
		fixture.spec.planMutations[0].from = 'starter';
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /difficulty differs from the declared source value/u);
	});

	await t.test('candidate from value', () => {
		const fixture = reviewRebaseFixture();
		fixture.spec.candidateMutations[0].from = 'starter';
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(
			result.issues.join('\n'),
			/definition\.difficulty differs from the declared source value/u
		);
	});

	await t.test('review does not authorize a different to value', () => {
		const fixture = reviewRebaseFixture();
		fixture.spec.planMutations[0].to = 'starter';
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /has no exact review or approval authority/u);
	});

	await t.test('parent-review authority cannot authorize an unrelated field', () => {
		const fixture = reviewRebaseFixture();
		fixture.spec.candidateMutations[0] = {
			challengeId: rejectedDifficultyId,
			field: 'definition.marks',
			from: 2,
			to: 1,
			authority: 'parent-review'
		};
		rebindApproval(fixture);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /has no exact review or approval authority/u);
	});
});

test('rejects candidate and validation selection hash tampering', async (t) => {
	await t.test('candidate bytes changed after binding', () => {
		const fixture = reviewRebaseFixture();
		fixture.selections[0].candidate.challenges[1].definition.title = 'Changed after hash';
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /selection source paths or hashes are stale/u);
	});

	await t.test('candidate hash changed after binding', () => {
		const fixture = reviewRebaseFixture();
		fixture.selections[0].candidateSha256 = 'a'.repeat(64);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /selection source paths or hashes are stale/u);
	});

	await t.test('validation bytes changed after binding', () => {
		const fixture = reviewRebaseFixture();
		fixture.selections[1].validation.status = 'passed';
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /selection source paths or hashes are stale/u);
	});

	await t.test('validation hash changed after binding', () => {
		const fixture = reviewRebaseFixture();
		fixture.selections[1].validationSha256 = 'b'.repeat(64);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /selection source paths or hashes are stale/u);
	});
});

test('binds parent summaries, calibration sources, and deterministic plan validation', async (t) => {
	await t.test('spec parent repair hash', () => {
		const fixture = reviewRebaseFixture();
		fixture.spec.parent.repairSha256 = '0'.repeat(64);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /does not bind the exact parent evidence set/u);
	});

	await t.test('spec parent objective id', () => {
		const fixture = reviewRebaseFixture();
		fixture.spec.parent.objectiveId = '9'.repeat(64);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /does not bind the exact parent evidence set/u);
	});

	await t.test('approval target hash', () => {
		const fixture = reviewRebaseFixture();
		fixture.spec.approval.authorizedCollectionRemediationKeys[0] = `${rejectedCollisionId}:${'8'.repeat(64)}`;
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(
			result.issues.join('\n'),
			/does not exactly authorize every collection remediation/u
		);
	});

	await t.test('parent plan hash', () => {
		const fixture = reviewRebaseFixture();
		fixture.parentVerificationSummary.planSha256 = '1'.repeat(64);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /must bind the exact base plan/u);
	});

	await t.test('parent source hash', () => {
		const fixture = reviewRebaseFixture();
		fixture.parentRepairSummary.sourceSnapshotSha256 = '2'.repeat(64);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /bind different source or curriculum evidence/u);
	});

	await t.test('missing calibration source', () => {
		const fixture = reviewRebaseFixture();
		fixture.sourceSnapshot.questions = fixture.sourceSnapshot.questions.filter(
			(question) => question.id !== 'source-biology-02'
		);
		rebindParentEvidence(fixture);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /absent from the source snapshot/u);
	});

	await t.test('stale calibration source hash', () => {
		const fixture = reviewRebaseFixture();
		fixture.basePlan.rows[1].calibrationQuestionSha256 = '3'.repeat(64);
		rebindParentEvidence(fixture);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /calibration question SHA-256 is stale/u);
	});

	await t.test('injected plan validator failure', () => {
		const fixture = reviewRebaseFixture();
		fixture.validatePlan = () => ({
			status: 'failed',
			issues: ['fixture plan invariant failed']
		});
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /Rebased plan failed deterministic validation/u);
		assert.match(result.issues.join('\n'), /fixture plan invariant failed/u);
	});
});

test('requires one hash-bound selection per shard with exact membership and order', async (t) => {
	await t.test('missing shard selection', () => {
		const fixture = reviewRebaseFixture();
		fixture.selections.pop();
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /exactly one candidate selection for every shard/u);
	});

	await t.test('duplicate shard selection', () => {
		const fixture = reviewRebaseFixture();
		fixture.selections.push(structuredClone(fixture.selections[0]));
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(
			result.issues.join('\n'),
			/candidate selection keys must be non-empty and unique/u
		);
	});

	await t.test('reordered candidate membership', () => {
		const fixture = reviewRebaseFixture();
		fixture.selections[0].candidate.challenges.reverse();
		rebindSelection(fixture.selections[0]);
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /selection membership differs from the rebased plan/u);
	});

	await t.test(
		'whole-cohort order is restored from the plan even when shards are interleaved',
		() => {
			const fixture = reviewRebaseFixture();
			fixture.basePlan.rows = [
				fixture.basePlan.rows[0],
				fixture.basePlan.rows[2],
				fixture.basePlan.rows[1],
				fixture.basePlan.rows[3]
			];
			rebindParentEvidence(fixture);
			const result = buildScienceChallengeReviewRebase(fixture);

			assert.equal(result.status, 'passed', result.issues.join('\n'));
			assert.deepEqual(
				result.orderedCandidates.map((entry) => entry.definition.id),
				fixture.basePlan.rows.map((row) => row.id)
			);
		}
	);
});

test('rejects any unexpected collection outcome or unapproved collection issue', async (t) => {
	await t.test('collection unexpectedly passes', () => {
		const fixture = reviewRebaseFixture();
		fixture.validateCollection = () => ({ status: 'passed', issues: [] });
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(
			result.issues.join('\n'),
			/must expose a non-empty deterministic collection failure/u
		);
	});

	await t.test('collection returns a different issue', () => {
		const fixture = reviewRebaseFixture();
		fixture.validateCollection = () => ({
			status: 'failed',
			issues: [collectionIssue, 'unapproved cross-shard duplicate']
		});
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /differ from the approved remediation set/u);
	});

	await t.test('approved issue order differs from validator evidence', () => {
		const fixture = reviewRebaseFixture();
		const secondIssue =
			'biology-cell-structure-02 opening duplicates chemistry-bonding-01 transfer.';
		fixture.spec.collectionRemediations.push({
			issue: secondIssue,
			preferredChallengeId: rejectedDifficultyId
		});
		rebindApproval(fixture);
		fixture.validateCollection = () => ({
			status: 'failed',
			issues: [secondIssue, collectionIssue]
		});
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /differ from the approved remediation set/u);
	});
});

test('requires every collection remediation target to be a rejected issue participant', async (t) => {
	await t.test('accepted target', () => {
		const fixture = reviewRebaseFixture();
		const issue = `${acceptedBiologyId} conflicts with ${rejectedDifficultyId}.`;
		fixture.spec.collectionRemediations[0] = {
			issue,
			preferredChallengeId: acceptedBiologyId
		};
		rebindApproval(fixture);
		fixture.validateCollection = () => ({ status: 'failed', issues: [issue] });
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /not a rejected issue participant/u);
	});

	await t.test('target absent from exact issue text', () => {
		const fixture = reviewRebaseFixture();
		const issue = `${acceptedBiologyId} conflicts with ${rejectedDifficultyId}.`;
		fixture.spec.collectionRemediations[0] = {
			issue,
			preferredChallengeId: rejectedCollisionId
		};
		rebindApproval(fixture);
		fixture.validateCollection = () => ({ status: 'failed', issues: [issue] });
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /not a rejected issue participant/u);
	});

	await t.test('unknown target', () => {
		const fixture = reviewRebaseFixture();
		const issue = 'unknown-challenge-01 conflicts with chemistry-bonding-01.';
		fixture.spec.collectionRemediations[0] = {
			issue,
			preferredChallengeId: 'unknown-challenge-01'
		};
		rebindApproval(fixture);
		fixture.validateCollection = () => ({ status: 'failed', issues: [issue] });
		const result = buildScienceChallengeReviewRebase(fixture);

		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /not a rejected issue participant/u);
	});
});

function reviewRebaseFixture() {
	const sources = [
		sourceQuestion('source-biology-01', 'a'),
		sourceQuestion('source-biology-02', 'b'),
		sourceQuestion('source-chemistry-01', 'c'),
		sourceQuestion('source-chemistry-02', 'd')
	];
	const sourceById = new Map(sources.map((source) => [source.id, source]));
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v2',
		rows: [
			planRow({
				id: acceptedBiologyId,
				shard: 'science-001',
				difficulty: 'starter',
				source: sourceById.get('source-biology-01')
			}),
			planRow({
				id: rejectedDifficultyId,
				shard: 'science-001',
				difficulty: 'stretch',
				source: sourceById.get('source-biology-02')
			}),
			planRow({
				id: rejectedCollisionId,
				shard: 'science-002',
				difficulty: 'standard',
				source: sourceById.get('source-chemistry-01')
			}),
			planRow({
				id: acceptedChemistryId,
				shard: 'science-002',
				difficulty: 'starter',
				source: sourceById.get('source-chemistry-02')
			})
		]
	};
	const sourceSnapshot = {
		schemaVersion: 'science-source-snapshot/v1',
		questions: sources
	};
	const curriculumEvidence = {
		schemaVersion: 'science-curriculum-evidence/v1',
		components: [{ id: 'biology-cell-structure' }, { id: 'chemistry-bonding' }]
	};
	const reviews = [
		review(acceptedBiologyId, true),
		review(rejectedDifficultyId, false, [
			{
				field: 'definition.difficulty',
				category: 'difficulty',
				evidence: 'The selected item is standard rather than stretch.',
				repair: 'Set definition.difficulty to standard.'
			}
		]),
		review(rejectedCollisionId, false, [
			{
				field: 'definition.opening',
				category: 'collection',
				evidence: collectionIssue,
				repair: 'Rewrite only this opening.'
			}
		]),
		review(acceptedChemistryId, true)
	];
	const parentCandidateById = new Map(
		basePlan.rows.map((row) => [
			row.id,
			challenge({
				id: row.id,
				difficulty: row.difficulty,
				sourceId: row.calibrationQuestionId,
				sourceSha256: row.calibrationQuestionSha256,
				title: `Parent ${row.id}`
			})
		])
	);
	const parentVerificationSummary = {
		schemaVersion: 'science-content-verification-summary/v1',
		status: 'failed',
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: canonicalHash([...parentCandidateById.values()]),
		reviewCount: reviews.length,
		reviews
	};
	const parentVerificationSha256 = canonicalHash(parentVerificationSummary);
	const parentRepairSummary = {
		schemaVersion: 'science-content-verification-repair-summary/v1',
		status: 'failed',
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		verificationRepairSha256: parentVerificationSha256,
		verificationRepairExecutionIdentity: {
			verificationSha256: parentVerificationSha256,
			planSha256: canonicalHash(basePlan),
			priorCandidateSetSha256: parentVerificationSummary.candidateSetSha256,
			objectiveId: 'e'.repeat(64),
			executionId: 'f'.repeat(64)
		},
		results: []
	};
	const biologySelection = batch([
		structuredClone(parentCandidateById.get(acceptedBiologyId)),
		{
			...structuredClone(parentCandidateById.get(rejectedDifficultyId)),
			definition: {
				...structuredClone(parentCandidateById.get(rejectedDifficultyId).definition),
				title: 'Selected repaired biology challenge'
			}
		}
	]);
	const chemistrySelection = batch([
		{
			...structuredClone(parentCandidateById.get(rejectedCollisionId)),
			definition: {
				...structuredClone(parentCandidateById.get(rejectedCollisionId).definition),
				title: 'Selected repaired chemistry challenge'
			}
		},
		structuredClone(parentCandidateById.get(acceptedChemistryId))
	]);
	const selections = [
		selection('science-001', biologySelection),
		selection('science-002', chemistrySelection)
	];
	const spec = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA,
		parent: {
			planSha256: canonicalHash(basePlan),
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			verificationSha256: canonicalHash(parentVerificationSummary),
			repairSha256: canonicalHash(parentRepairSummary),
			candidateSetSha256: parentVerificationSummary.candidateSetSha256,
			objectiveId: parentRepairSummary.verificationRepairExecutionIdentity.objectiveId,
			executionId: parentRepairSummary.verificationRepairExecutionIdentity.executionId
		},
		approval: {
			decision: 'approved',
			scope: 'fresh-full-review-only',
			rationale: 'The parent repair budget closed with deterministic metadata issues.',
			authorizedMutationKeys: [
				`${rejectedDifficultyId}:definition.difficulty`,
				`${rejectedDifficultyId}:difficulty`
			],
			authorizedCollectionRemediationKeys: [
				`${rejectedCollisionId}:${canonicalHash(collectionIssue)}`
			]
		},
		planMutations: [
			{
				challengeId: rejectedDifficultyId,
				field: 'difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		candidateMutations: [
			{
				challengeId: rejectedDifficultyId,
				field: 'definition.difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		collectionRemediations: [
			{
				issue: collectionIssue,
				preferredChallengeId: rejectedCollisionId
			}
		]
	};
	return {
		basePlan,
		sourceSnapshot,
		curriculumEvidence,
		parentVerificationSummary,
		parentRepairSummary,
		parentCandidateById,
		selections,
		spec,
		validatePlan: () => ({ status: 'passed', issues: [] }),
		validateBatch: validateFixtureBatch,
		validateCollection: () => ({ status: 'failed', issues: [collectionIssue] })
	};
}

function sourceQuestion(id, marker) {
	return {
		id,
		prompt: `Source question ${marker}`,
		contentSha256: marker.repeat(64)
	};
}

function planRow({ id, shard, difficulty, source }) {
	return {
		id,
		shard,
		difficulty,
		taskShape: 'recall',
		calibrationQuestionId: source.id,
		calibrationQuestionSha256: source.contentSha256
	};
}

function challenge({ id, difficulty, sourceId, sourceSha256, title }) {
	return {
		definition: {
			id,
			title,
			sourceQuestionId: sourceId,
			marks: 2,
			difficulty
		},
		grounding: {
			calibrationQuestionId: sourceId,
			calibrationQuestionSha256: sourceSha256
		},
		content: {
			opening: `Opening for ${id}`,
			transfer: `Transfer for ${id}`
		}
	};
}

function batch(challenges) {
	return {
		schemaVersion: SCIENCE_CHALLENGE_BATCH_SCHEMA,
		challenges
	};
}

function review(id, accepted, issues = []) {
	return {
		id,
		accepted,
		issues
	};
}

function selection(shardId, candidate) {
	const validation = {
		status: 'failed',
		issues: [`Selected immutable failed candidate for ${shardId}.`]
	};
	return {
		shardId,
		disposition: 'immutable-parent-repair-candidate',
		candidate,
		candidatePath: `repair/${shardId}/candidate.json`,
		candidateSha256: canonicalHash(candidate),
		validationPath: `repair/${shardId}/validation.json`,
		validation,
		validationSha256: canonicalHash(validation)
	};
}

function addRowOverride(fixture, challengeId) {
	const selectionValue = fixture.selections.find((candidateSelection) =>
		candidateSelection.candidate.challenges.some((entry) => entry.definition.id === challengeId)
	);
	assert.ok(selectionValue, `fixture selection for ${challengeId}`);
	const candidate = structuredClone(selectionValue.candidate);
	const sourceRow = candidate.challenges.find((entry) => entry.definition.id === challengeId);
	sourceRow.definition.title = `Whole-row source ${challengeId}`;
	const validation = {
		status: 'failed',
		issues: [`Immutable alternative source for ${challengeId}.`]
	};
	const override = {
		challengeId,
		candidate,
		validation,
		candidatePath: `repair-alternative/${selectionValue.shardId}/candidate.json`,
		validationPath: `repair-alternative/${selectionValue.shardId}/validation.json`,
		candidateSha256: canonicalHash(candidate),
		validationSha256: canonicalHash(validation),
		rowSha256: canonicalHash(sourceRow)
	};
	selectionValue.rowOverrides = [override];
	return override;
}

function rebindSelection(value) {
	value.candidateSha256 = canonicalHash(value.candidate);
	value.validationSha256 = canonicalHash(value.validation);
}

function rebindParentPlan(fixture) {
	rebindParentEvidence(fixture);
}

function rebindSourceEvidence(fixture) {
	rebindParentEvidence(fixture);
}

function rebindParentEvidence(fixture) {
	const planSha256 = canonicalHash(fixture.basePlan);
	const sourceSnapshotSha256 = canonicalHash(fixture.sourceSnapshot);
	const curriculumEvidenceSha256 = canonicalHash(fixture.curriculumEvidence);
	fixture.parentVerificationSummary.planSha256 = planSha256;
	fixture.parentVerificationSummary.sourceSnapshotSha256 = sourceSnapshotSha256;
	fixture.parentVerificationSummary.curriculumEvidenceSha256 = curriculumEvidenceSha256;
	fixture.parentVerificationSummary.candidateSetSha256 = canonicalHash(
		fixture.basePlan.rows.map((row) => fixture.parentCandidateById.get(row.id))
	);
	const verificationSha256 = canonicalHash(fixture.parentVerificationSummary);
	fixture.parentRepairSummary.planSha256 = planSha256;
	fixture.parentRepairSummary.sourceSnapshotSha256 = sourceSnapshotSha256;
	fixture.parentRepairSummary.curriculumEvidenceSha256 = curriculumEvidenceSha256;
	fixture.parentRepairSummary.verificationRepairSha256 = verificationSha256;
	fixture.parentRepairSummary.verificationRepairExecutionIdentity = {
		...fixture.parentRepairSummary.verificationRepairExecutionIdentity,
		verificationSha256,
		planSha256,
		priorCandidateSetSha256: fixture.parentVerificationSummary.candidateSetSha256
	};
	fixture.spec.parent = {
		planSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		verificationSha256,
		repairSha256: canonicalHash(fixture.parentRepairSummary),
		candidateSetSha256: fixture.parentVerificationSummary.candidateSetSha256,
		objectiveId: fixture.parentRepairSummary.verificationRepairExecutionIdentity.objectiveId,
		executionId: fixture.parentRepairSummary.verificationRepairExecutionIdentity.executionId
	};
}

function rebindApproval(fixture) {
	fixture.spec.approval.authorizedMutationKeys = [
		...fixture.spec.planMutations,
		...fixture.spec.candidateMutations
	]
		.map((mutation) => `${mutation.challengeId}:${mutation.field}`)
		.sort();
	fixture.spec.approval.authorizedCollectionRemediationKeys = fixture.spec.collectionRemediations
		.map((remediation) => `${remediation.preferredChallengeId}:${canonicalHash(remediation.issue)}`)
		.sort();
}

function validateFixtureBatch(candidate, shardRows) {
	const issues = [];
	if (
		canonicalHash(candidate.challenges.map((entry) => entry.definition.id)) !==
		canonicalHash(shardRows.map((row) => row.id))
	) {
		issues.push('Fixture batch order differs from shard plan order.');
	}
	for (const entry of candidate.challenges) {
		const row = shardRows.find((candidateRow) => candidateRow.id === entry.definition.id);
		if (!row) continue;
		if (entry.definition.difficulty !== row.difficulty) {
			issues.push(`${row.id}: candidate difficulty differs from plan.`);
		}
		if (
			entry.definition.sourceQuestionId !== row.calibrationQuestionId ||
			entry.grounding.calibrationQuestionId !== row.calibrationQuestionId ||
			entry.grounding.calibrationQuestionSha256 !== row.calibrationQuestionSha256
		) {
			issues.push(`${row.id}: candidate source binding differs from plan.`);
		}
	}
	return issues.length ? { status: 'failed', issues } : { status: 'passed', issues: [] };
}
