import assert from 'node:assert/strict';
import test from 'node:test';

import { recoverExhaustedScienceChallengeDifficultyPlanAdjustment } from './science-challenge-difficulty-plan-adjustment-generator.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

test('difficulty recovery dry-run is inspect-only and model-free', () => {
	let inspectCalls = 0;
	let stageCalls = 0;
	const result = recoverExhaustedScienceChallengeDifficultyPlanAdjustment({
		dryRun: true,
		replayOptions: { exact: true },
		inspect: (options) => {
			inspectCalls += 1;
			assert.deepEqual(options, { exact: true });
			return recovery('stage-review-pending-difficulty-plan-adjustment');
		},
		stage: () => {
			stageCalls += 1;
			throw new Error('stage must not run in dry-run');
		}
	});
	assert.equal(result.status, 'planned');
	assert.equal(result.action, 'stage-verifier-directed-difficulty-plan-adjustment');
	assert.equal(result.recoveryKind, 'difficulty-plan-adjustment');
	assert.equal(result.sourceAttempt, 4);
	assert.equal(result.adjustmentCount, 1);
	assert.equal(result.modelCalls, 0);
	assert.equal(result.writes, 0);
	assert.equal(inspectCalls, 1);
	assert.equal(stageCalls, 0);
});

test('actual difficulty recovery stages a fresh-review proposal without a model callback', () => {
	const result = recoverExhaustedScienceChallengeDifficultyPlanAdjustment({
		dryRun: false,
		replayOptions: {},
		inspect: () => {
			throw new Error('inspect must not replace staging');
		},
		stage: () => recovery('reused')
	});
	assert.equal(result.status, 'review-pending');
	assert.equal(result.action, 'verification-repair-difficulty-plan-adjustment-review-pending');
	assert.equal(result.candidateSha256, canonicalHash(result.candidate));
	assert.equal(result.adjustmentCount, 1);
	assert.equal(result.requiresFreshFullVerification, true);
	assert.equal(result.modelCalls, 0);
	assert.equal(result.writes, 1);
});

test('atomic adjustment sets preserve their exact correction count', () => {
	const result = recoverExhaustedScienceChallengeDifficultyPlanAdjustment({
		dryRun: true,
		replayOptions: {},
		inspect: () => recovery('stage-review-pending-difficulty-plan-adjustment', 2)
	});
	assert.equal(result.status, 'planned');
	assert.equal(result.adjustmentCount, 2);
	assert.equal(result.sourceAttempt, 4);
});

test('invalid or ambiguous terminal evidence remains failed', () => {
	const failed = { status: 'failed', issues: ['terminal attempt-04 is stale'] };
	for (const dryRun of [true, false]) {
		assert.deepEqual(
			recoverExhaustedScienceChallengeDifficultyPlanAdjustment({
				dryRun,
				replayOptions: {},
				inspect: () => failed,
				stage: () => failed
			}),
			failed
		);
	}
});

function recovery(action, adjustmentCount = undefined) {
	const candidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [{ definition: { id: 'biology-plant-defence-responses-01' } }]
	};
	return {
		status: 'passed',
		action,
		sourceAttempt: 4,
		candidate,
		manifest: {
			sourceAttempt: { attempt: 4 },
			base: { planSha256: 'a'.repeat(64) },
			effective: { planSha256: 'b'.repeat(64) },
			...(adjustmentCount === undefined ? {} : { adjustmentCount })
		}
	};
}
