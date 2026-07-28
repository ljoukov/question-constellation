import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalHash } from './science-challenge-release.mjs';
import {
	scienceChallengeVerifierAllocationRanges,
	validateScienceChallengeVerifierDispatchLedger
} from './science-challenge-verifier-dispatch.mjs';

const ASSIGNMENT_COUNT = 7;
const VERIFIER_COUNT = 3;

test('accepts balanced contiguous verifier blocks for the exact assignment count', () => {
	const fixture = dispatchFixture();
	const validation = validateScienceChallengeVerifierDispatchLedger(fixture.ledger, fixture.index);
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));
	assert.equal(validation.assignmentCountByTaskName.size, VERIFIER_COUNT);
	assert.deepEqual([...validation.assignmentCountByTaskName.values()], [3, 2, 2]);
});

test('accepts one verifier identity per assignment without a fixed cohort geometry', () => {
	const fixture = dispatchFixture();
	for (const [index, dispatch] of fixture.ledger.dispatches.entries()) {
		dispatch.taskName = `/root/science_verify_${String(index + 1).padStart(3, '0')}`;
	}
	const validation = validateScienceChallengeVerifierDispatchLedger(fixture.ledger, fixture.index);
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));
	assert.equal(validation.assignmentCountByTaskName.size, ASSIGNMENT_COUNT);
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
	interleaved.ledger.dispatches[3].taskName = '/root/science_verify_001';
	const interleavedValidation = validateScienceChallengeVerifierDispatchLedger(
		interleaved.ledger,
		interleaved.index
	);
	assert.equal(interleavedValidation.status, 'failed');
	assert.match(interleavedValidation.issues.join('\n'), /reopens a completed verifier block/);
});

test('rejects an allocation whose contiguous blocks are not balanced', () => {
	const fixture = dispatchFixture();
	for (const [index, dispatch] of fixture.ledger.dispatches.entries()) {
		dispatch.taskName =
			index < 1
				? '/root/science_verify_001'
				: index < 3
					? '/root/science_verify_002'
					: '/root/science_verify_003';
	}
	const validation = validateScienceChallengeVerifierDispatchLedger(fixture.ledger, fixture.index);
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /balanced to within one assignment/);
});

function dispatchFixture() {
	const assignments = Array.from(
		{ length: ASSIGNMENT_COUNT },
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
		candidateCount: assignments.reduce((sum, assignment) => sum + assignment.ids.length, 0),
		assignments
	};
	const allocations = scienceChallengeVerifierAllocationRanges({
		assignmentCount: assignments.length,
		verifierCount: VERIFIER_COUNT
	});
	const dispatches = assignments.map((assignment, index) => {
		const verifierIndex =
			allocations.findIndex((allocation) => index >= allocation.start && index < allocation.end) +
			1;
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
