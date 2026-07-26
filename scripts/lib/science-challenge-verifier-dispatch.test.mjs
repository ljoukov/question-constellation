import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalHash } from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER,
	SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT,
	SCIENCE_CHALLENGE_VERIFIER_COUNT,
	validateScienceChallengeVerifierDispatchLedger
} from './science-challenge-verifier-dispatch.mjs';

test('accepts exactly three unique canonical task names covering 17 assignments each', () => {
	const fixture = dispatchFixture();
	const validation = validateScienceChallengeVerifierDispatchLedger(fixture.ledger, fixture.index);
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));
	assert.equal(validation.assignmentCountByTaskName.size, SCIENCE_CHALLENGE_VERIFIER_COUNT);
	assert.deepEqual(
		[...validation.assignmentCountByTaskName.values()],
		Array(SCIENCE_CHALLENGE_VERIFIER_COUNT).fill(SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER)
	);
});

test('rejects one verifier identity per assignment', () => {
	const fixture = dispatchFixture();
	for (const [index, dispatch] of fixture.ledger.dispatches.entries()) {
		dispatch.taskName = `/root/science_verify_${String(index + 1).padStart(3, '0')}`;
	}
	const validation = validateScienceChallengeVerifierDispatchLedger(fixture.ledger, fixture.index);
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /exactly 3 unique canonical task names/);
});

test('rejects a non-canonical task name even when the allocation count is valid', () => {
	const fixture = dispatchFixture();
	fixture.ledger.dispatches[1].taskName = 'root/science_verify_001';
	const validation = validateScienceChallengeVerifierDispatchLedger(fixture.ledger, fixture.index);
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /invalid empty-context dispatch metadata/);
});

test('rejects reordered assignment rows and interleaved verifier blocks', () => {
	const reordered = dispatchFixture();
	[reordered.ledger.dispatches[0], reordered.ledger.dispatches[1]] = [
		reordered.ledger.dispatches[1],
		reordered.ledger.dispatches[0]
	];
	const reorderedValidation = validateScienceChallengeVerifierDispatchLedger(
		reordered.ledger,
		reordered.index
	);
	assert.equal(reorderedValidation.status, 'failed');
	assert.match(reorderedValidation.issues.join('\n'), /differs from assignment-index order/);

	const interleaved = dispatchFixture();
	interleaved.ledger.dispatches[0].taskName = '/root/science_verify_002';
	interleaved.ledger.dispatches[17].taskName = '/root/science_verify_001';
	const interleavedValidation = validateScienceChallengeVerifierDispatchLedger(
		interleaved.ledger,
		interleaved.index
	);
	assert.equal(interleavedValidation.status, 'failed');
	assert.match(interleavedValidation.issues.join('\n'), /deterministic 17-row verifier block/);
});

test('rejects an uneven 16/17/18 assignment allocation', () => {
	const fixture = dispatchFixture();
	fixture.ledger.dispatches[16].taskName = '/root/science_verify_003';
	const validation = validateScienceChallengeVerifierDispatchLedger(fixture.ledger, fixture.index);
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /must cover exactly 17 assignments; found (?:16|18)/);
});

function dispatchFixture() {
	const assignments = Array.from(
		{ length: SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_COUNT },
		(_, index) => {
			const ordinal = String(index + 1).padStart(3, '0');
			return {
				assignmentId: `science-${ordinal}`,
				path: `verification/assignments/science-${ordinal}.json`,
				sha256: String(index + 1).padStart(64, '0'),
				ids: Array.from(
					{ length: 8 },
					(_unused, itemIndex) => `challenge-${ordinal}-${itemIndex + 1}`
				)
			};
		}
	);
	const index = {
		schemaVersion: 'science-challenge-verification-assignment-index/v1',
		planId: 'science-fixture-v1',
		planSha256: 'a'.repeat(64),
		sourceSnapshotSha256: 'b'.repeat(64),
		curriculumEvidenceSha256: 'c'.repeat(64),
		candidateSetSha256: 'd'.repeat(64),
		assignments
	};
	const dispatches = assignments.map((assignment, index) => {
		const verifierIndex = Math.floor(index / SCIENCE_CHALLENGE_ASSIGNMENTS_PER_VERIFIER) + 1;
		return {
			assignmentId: assignment.assignmentId,
			assignmentPath: assignment.path,
			assignmentSha256: assignment.sha256,
			orchestrator: 'codex-collaboration',
			taskName: `/root/science_verify_${String(verifierIndex).padStart(3, '0')}`,
			forkTurns: 'none',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max'
		};
	});
	return {
		index,
		ledger: {
			schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
			orchestrator: 'codex-collaboration',
			indexSha256: canonicalHash(index),
			createdAt: '2026-07-22T00:00:00.000Z',
			dispatches
		}
	};
}
