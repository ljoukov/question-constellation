import assert from 'node:assert/strict';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_EVIDENCE_SCHEMA,
	SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA,
	prepareScienceChallengeReviewRebaseEvidence,
	publishScienceChallengeReviewRebaseEvidence,
	readScienceChallengeReviewRebaseEvidence
} from './science-challenge-review-rebase-evidence.mjs';
import { SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA } from './science-challenge-review-rebase.mjs';
import {
	SCIENCE_CHALLENGE_BATCH_SCHEMA,
	canonicalHash,
	stableStringify
} from './science-challenge-release.mjs';

const collectionIssue =
	'biology-cell-structure-02 opening duplicates biology-cell-structure-01 transfer.';

test('dry-run is write-free, publication is atomic, and every artifact replays byte-for-byte', () => {
	const fixture = filesystemFixture();
	try {
		const planned = prepareScienceChallengeReviewRebaseEvidence(fixture.options);
		assert.equal(planned.status, 'passed', planned.issues?.join('\n'));
		assert.equal(planned.action, 'publish-prepared');
		assert.equal(existsSync(path.join(fixture.root, 'out')), false);
		assert.equal(planned.manifest.releaseEligible, false);
		assert.equal(planned.manifest.requiresFreshFullVerification, true);
		assert.equal(
			planned.manifest.evidence.schemaVersion,
			SCIENCE_CHALLENGE_REVIEW_REBASE_EVIDENCE_SCHEMA
		);
		assert.equal(planned.manifest.evidence.inputs.existingDefinitions.count, 0);
		assert.equal(
			JSON.stringify(planned.manifest).includes(fixture.root),
			false,
			'evidence must not record an absolute repository path'
		);

		const published = publishScienceChallengeReviewRebaseEvidence(fixture.options);
		assert.equal(published.status, 'passed', published.issues?.join('\n'));
		assert.equal(published.action, 'replayed');
		assert.deepEqual(listFiles(path.join(fixture.root, 'out')), [
			'collection-validation.json',
			'manifest.json',
			'plan-validation.json',
			'plan.json',
			'shards/science-001/candidate.json',
			'shards/science-001/validation.json'
		]);
		assert.equal(
			published.candidateBatches.get('science-001').challenges[1].definition.title,
			'Alternative rejected row'
		);
		const replay = readScienceChallengeReviewRebaseEvidence({
			repositoryRoot: fixture.root,
			manifestPath: 'out/manifest.json',
			existingDefinitions: [],
			...fixture.validators
		});
		assert.equal(replay.status, 'passed', replay.issues?.join('\n'));
		assert.deepEqual(replay.manifest, published.manifest);
	} finally {
		fixture.cleanup();
	}
});

for (const [label, relativePath, mutation] of [
	['effective plan', 'out/plan.json', (value) => ({ ...value, planId: 'tampered' })],
	[
		'shard candidate',
		'out/shards/science-001/candidate.json',
		(value) => {
			value.challenges[1].definition.title = 'Tampered output';
			return value;
		}
	],
	[
		'shard validation',
		'out/shards/science-001/validation.json',
		(value) => ({ ...value, releaseEligible: true })
	],
	['collection report', 'out/collection-validation.json', (value) => ({ ...value, issues: [] })],
	['manifest', 'out/manifest.json', (value) => ({ ...value, releaseEligible: true })]
]) {
	test(`replay rejects tampered ${label} bytes`, () => {
		const fixture = filesystemFixture();
		try {
			const published = publishScienceChallengeReviewRebaseEvidence(fixture.options);
			assert.equal(published.status, 'passed', published.issues?.join('\n'));
			const filePath = path.join(fixture.root, relativePath);
			writeJson(filePath, mutation(JSON.parse(readFileSync(filePath, 'utf8'))));
			const replay = readScienceChallengeReviewRebaseEvidence({
				repositoryRoot: fixture.root,
				manifestPath: 'out/manifest.json',
				existingDefinitions: [],
				...fixture.validators
			});
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /bytes differ|manifest path|non-release|output tree/u);
		} finally {
			fixture.cleanup();
		}
	});
}

test('replay rejects stale, missing, extra, and symlinked input or output evidence', async (t) => {
	await t.test('stale selected source', () => {
		const fixture = filesystemFixture();
		try {
			assert.equal(publishScienceChallengeReviewRebaseEvidence(fixture.options).status, 'passed');
			const selectedPath = path.join(fixture.root, 'inputs/selected-candidate.json');
			const selected = JSON.parse(readFileSync(selectedPath, 'utf8'));
			selected.challenges[1].definition.title = 'Changed after publication';
			writeJson(selectedPath, selected);
			const replay = replayFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /candidate SHA-256 is stale|manifest bytes differ/u);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('missing input', () => {
		const fixture = filesystemFixture();
		try {
			rmSync(path.join(fixture.root, 'inputs/selected-validation.json'));
			const prepared = prepareScienceChallengeReviewRebaseEvidence(fixture.options);
			assert.equal(prepared.status, 'failed');
			assert.match(prepared.issues.join('\n'), /missing/u);
			assert.equal(existsSync(path.join(fixture.root, 'out')), false);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('symlinked input', () => {
		const fixture = filesystemFixture();
		try {
			const realPath = path.join(fixture.root, 'inputs/selected-validation-real.json');
			const linkPath = path.join(fixture.root, 'inputs/selected-validation.json');
			writeFileSync(realPath, readFileSync(linkPath));
			rmSync(linkPath);
			symlinkSync(realPath, linkPath);
			const prepared = prepareScienceChallengeReviewRebaseEvidence(fixture.options);
			assert.equal(prepared.status, 'failed');
			assert.match(prepared.issues.join('\n'), /symbolic link/u);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('unexpected output file', () => {
		const fixture = filesystemFixture();
		try {
			assert.equal(publishScienceChallengeReviewRebaseEvidence(fixture.options).status, 'passed');
			writeFileSync(path.join(fixture.root, 'out/unexpected.txt'), 'unexpected');
			const replay = replayFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /unexpected artifacts/u);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('symlinked output', () => {
		const fixture = filesystemFixture();
		try {
			assert.equal(publishScienceChallengeReviewRebaseEvidence(fixture.options).status, 'passed');
			symlinkSync(
				path.join(fixture.root, 'out/plan.json'),
				path.join(fixture.root, 'out/linked-plan.json')
			);
			const replay = replayFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /symbolic link/u);
		} finally {
			fixture.cleanup();
		}
	});
});

test('fails closed for path escapes, stale parent assignments, catalog drift, and existing roots', async (t) => {
	await t.test('path escape', () => {
		const fixture = filesystemFixture();
		try {
			const options = { ...fixture.options, specPath: '../outside.json' };
			const prepared = prepareScienceChallengeReviewRebaseEvidence(options);
			assert.equal(prepared.status, 'failed');
			assert.match(prepared.issues.join('\n'), /repository-relative path/u);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('stale parent assignment', () => {
		const fixture = filesystemFixture();
		try {
			const assignment = JSON.parse(
				readFileSync(path.join(fixture.root, 'inputs/parent-assignment.json'), 'utf8')
			);
			assignment.items[0].candidate.definition.title = 'Changed parent';
			writeJson(path.join(fixture.root, 'inputs/parent-assignment.json'), assignment);
			const prepared = prepareScienceChallengeReviewRebaseEvidence(fixture.options);
			assert.equal(prepared.status, 'failed');
			assert.match(prepared.issues.join('\n'), /parent assignment SHA-256 is stale/u);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('catalog drift', () => {
		const fixture = filesystemFixture();
		try {
			const prepared = prepareScienceChallengeReviewRebaseEvidence({
				...fixture.options,
				existingDefinitions: [{ id: 'unexpected-existing-row' }]
			});
			assert.equal(prepared.status, 'failed');
			assert.match(prepared.issues.join('\n'), /catalogue record count bound into the base plan/u);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('pre-existing output root', () => {
		const fixture = filesystemFixture();
		try {
			mkdirSync(path.join(fixture.root, 'out'));
			const prepared = prepareScienceChallengeReviewRebaseEvidence(fixture.options);
			assert.equal(prepared.status, 'failed');
			assert.match(prepared.issues.join('\n'), /must be absent/u);
			const published = publishScienceChallengeReviewRebaseEvidence(fixture.options);
			assert.equal(published.status, 'failed');
			assert.match(published.issues.join('\n'), /must be absent/u);
		} finally {
			fixture.cleanup();
		}
	});
});

function filesystemFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'science-review-rebase-evidence-'));
	mkdirSync(path.join(root, 'inputs'), { recursive: true });
	const acceptedId = 'biology-cell-structure-01';
	const rejectedId = 'biology-cell-structure-02';
	const sourceSnapshot = {
		questions: [
			{ id: 'source-01', contentSha256: '1'.repeat(64) },
			{ id: 'source-02', contentSha256: '2'.repeat(64) }
		]
	};
	const curriculumEvidence = {
		components: [{ componentId: 'biology-cell-structure' }]
	};
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v2',
		planId: 'fixture-plan',
		baseCatalogContentSha256: '0'.repeat(64),
		baseCatalogRecordCount: 0,
		rows: [
			planRow(acceptedId, 'starter', sourceSnapshot.questions[0]),
			planRow(rejectedId, 'stretch', sourceSnapshot.questions[1])
		]
	};
	const parentBatch = batch([
		challenge(acceptedId, 'starter', sourceSnapshot.questions[0], 'Accepted parent row'),
		challenge(rejectedId, 'stretch', sourceSnapshot.questions[1], 'Rejected parent row')
	]);
	const parentCandidates = parentBatch.challenges;
	const parentVerification = {
		status: 'failed',
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: canonicalHash(parentCandidates),
		reviewCount: 2,
		reviews: [
			{ id: acceptedId, accepted: true, issues: [] },
			{
				id: rejectedId,
				accepted: false,
				issues: [
					{
						field: 'definition.difficulty',
						repair: 'Set definition.difficulty to standard.'
					},
					{
						field: 'definition.opening',
						repair: 'Rewrite the duplicated opening.'
					}
				]
			}
		]
	};
	const parentVerificationSha256 = canonicalHash(parentVerification);
	const parentRepair = {
		status: 'failed',
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		verificationRepairSha256: parentVerificationSha256,
		verificationRepairExecutionIdentity: {
			verificationSha256: parentVerificationSha256,
			planSha256: canonicalHash(basePlan),
			priorCandidateSetSha256: parentVerification.candidateSetSha256,
			objectiveId: 'e'.repeat(64),
			executionId: 'f'.repeat(64)
		},
		results: []
	};
	const spec = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA,
		parent: {
			planSha256: canonicalHash(basePlan),
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			verificationSha256: canonicalHash(parentVerification),
			repairSha256: canonicalHash(parentRepair),
			candidateSetSha256: parentVerification.candidateSetSha256,
			objectiveId: parentRepair.verificationRepairExecutionIdentity.objectiveId,
			executionId: parentRepair.verificationRepairExecutionIdentity.executionId
		},
		approval: {
			decision: 'approved',
			scope: 'fresh-full-review-only',
			rationale: 'Fixture authorization for a new independent full review.',
			authorizedMutationKeys: [`${rejectedId}:definition.difficulty`, `${rejectedId}:difficulty`],
			authorizedCollectionRemediationKeys: [`${rejectedId}:${canonicalHash(collectionIssue)}`]
		},
		planMutations: [
			{
				challengeId: rejectedId,
				field: 'difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		candidateMutations: [
			{
				challengeId: rejectedId,
				field: 'definition.difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		collectionRemediations: [{ issue: collectionIssue, preferredChallengeId: rejectedId }]
	};
	const parentAssignment = {
		assignmentId: 'science-001',
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		items: parentCandidates.map((candidate) => ({ candidate }))
	};
	const selectedBatch = batch([
		structuredClone(parentCandidates[0]),
		challenge(rejectedId, 'stretch', sourceSnapshot.questions[1], 'Selected rejected row')
	]);
	const selectedValidation = { status: 'failed', issues: ['Selected repair candidate.'] };
	const alternativeBatch = structuredClone(selectedBatch);
	alternativeBatch.challenges[1].definition.title = 'Alternative rejected row';
	const alternativeValidation = { status: 'failed', issues: ['Alternative whole row.'] };

	for (const [name, value] of [
		['spec.json', spec],
		['base-plan.json', basePlan],
		['source.json', sourceSnapshot],
		['curriculum.json', curriculumEvidence],
		['parent-verification.json', parentVerification],
		['parent-repair.json', parentRepair],
		['parent-assignment.json', parentAssignment],
		['selected-candidate.json', selectedBatch],
		['selected-validation.json', selectedValidation],
		['alternative-candidate.json', alternativeBatch],
		['alternative-validation.json', alternativeValidation]
	]) {
		writeJson(path.join(root, 'inputs', name), value);
	}
	const selectionIndex = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA,
		parentCandidateSources: [
			{
				shardId: 'science-001',
				assignmentPath: 'inputs/parent-assignment.json',
				assignmentSha256: canonicalHash(parentAssignment)
			}
		],
		selections: [
			{
				shardId: 'science-001',
				disposition: 'immutable-parent-repair-candidate',
				candidatePath: 'inputs/selected-candidate.json',
				candidateSha256: canonicalHash(selectedBatch),
				validationPath: 'inputs/selected-validation.json',
				validationSha256: canonicalHash(selectedValidation),
				rowOverrides: [
					{
						challengeId: rejectedId,
						rowSha256: canonicalHash(alternativeBatch.challenges[1]),
						candidatePath: 'inputs/alternative-candidate.json',
						candidateSha256: canonicalHash(alternativeBatch),
						validationPath: 'inputs/alternative-validation.json',
						validationSha256: canonicalHash(alternativeValidation)
					}
				]
			}
		]
	};
	writeJson(path.join(root, 'inputs/selections.json'), selectionIndex);
	const validators = {
		validatePlan: () => ({ status: 'passed', issues: [] }),
		validateBatch: () => ({ status: 'passed', issues: [] }),
		validateCollection: () => ({ status: 'failed', issues: [collectionIssue] })
	};
	return {
		root,
		validators,
		options: {
			repositoryRoot: root,
			outputRoot: 'out',
			specPath: 'inputs/spec.json',
			basePlanPath: 'inputs/base-plan.json',
			sourceSnapshotPath: 'inputs/source.json',
			curriculumEvidencePath: 'inputs/curriculum.json',
			parentVerificationPath: 'inputs/parent-verification.json',
			parentRepairPath: 'inputs/parent-repair.json',
			selectionIndexPath: 'inputs/selections.json',
			existingDefinitions: [],
			...validators
		},
		cleanup: () => rmSync(root, { recursive: true, force: true })
	};
}

function replayFixture(fixture) {
	return readScienceChallengeReviewRebaseEvidence({
		repositoryRoot: fixture.root,
		manifestPath: 'out/manifest.json',
		existingDefinitions: [],
		...fixture.validators
	});
}

function planRow(id, difficulty, source) {
	return {
		id,
		shard: 'science-001',
		difficulty,
		taskShape: 'recall',
		calibrationQuestionId: source.id,
		calibrationQuestionSha256: source.contentSha256
	};
}

function challenge(id, difficulty, source, title) {
	return {
		definition: {
			id,
			title,
			sourceQuestionId: source.id,
			marks: 2,
			difficulty
		},
		grounding: {
			calibrationQuestionId: source.id,
			calibrationQuestionSha256: source.contentSha256
		}
	};
}

function batch(challenges) {
	return { schemaVersion: SCIENCE_CHALLENGE_BATCH_SCHEMA, challenges };
}

function writeJson(filePath, value) {
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function listFiles(root) {
	const result = [];
	const visit = (directory, prefix = '') => {
		for (const entry of readdirSorted(directory)) {
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
			else result.push(relative);
		}
	};
	visit(root);
	return result.sort();
}

function readdirSorted(directory) {
	return readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
		left.name.localeCompare(right.name)
	);
}
