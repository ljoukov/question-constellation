import assert from 'node:assert/strict';
import test from 'node:test';

import { recoverExhaustedScienceChallengeDescendantRemap } from './science-challenge-descendant-remap-generator.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

test('dry-run inspects without staging, writes or model calls', () => {
	let inspectCalls = 0;
	let stageCalls = 0;
	const result = recoverExhaustedScienceChallengeDescendantRemap({
		dryRun: true,
		replayOptions: { exact: true },
		inspect: (options) => {
			inspectCalls += 1;
			assert.deepEqual(options, { exact: true });
			return recovery('stage-review-pending-descendant-remap');
		},
		stage: () => {
			stageCalls += 1;
			throw new Error('stage must not run during dry-run');
		}
	});
	assert.equal(result.status, 'planned');
	assert.equal(result.action, 'stage-verifier-directed-descendant-remap');
	assert.equal(result.modelCalls, 0);
	assert.equal(result.writes, 0);
	assert.equal(inspectCalls, 1);
	assert.equal(stageCalls, 0);
});

test('actual recovery stages review-pending evidence without any model callback', () => {
	let stageCalls = 0;
	const result = recoverExhaustedScienceChallengeDescendantRemap({
		dryRun: false,
		replayOptions: { exact: true },
		inspect: () => {
			throw new Error('inspect adapter must not replace actual staging');
		},
		stage: () => {
			stageCalls += 1;
			return recovery('reused');
		}
	});
	assert.equal(result.status, 'review-pending');
	assert.equal(result.action, 'verification-repair-descendant-remap-review-pending');
	assert.equal(result.sourceAttempt, 3);
	assert.equal(result.candidateSha256, canonicalHash(result.candidate));
	assert.equal(result.requiresFreshFullVerification, true);
	assert.equal(result.modelCalls, 0);
	assert.equal(result.writes, 1);
	assert.equal(stageCalls, 1);
});

test('dry-run reports reuse for an already staged deterministic recovery', () => {
	const result = recoverExhaustedScienceChallengeDescendantRemap({
		dryRun: true,
		replayOptions: {},
		inspect: () => recovery('reuse-staged-descendant-remap'),
		stage: () => {
			throw new Error('unexpected stage');
		}
	});
	assert.equal(result.status, 'planned');
	assert.equal(result.action, 'reuse-verifier-directed-descendant-remap');
	assert.equal(result.writes, 0);
});

test('ambiguous or invalid recovery evidence remains failed and cannot become review-pending', () => {
	const failed = {
		status: 'failed',
		issues: ['ambiguous descendant-remap and multipart recovery lineage']
	};
	for (const dryRun of [true, false]) {
		const result = recoverExhaustedScienceChallengeDescendantRemap({
			dryRun,
			replayOptions: {},
			inspect: () => failed,
			stage: () => failed
		});
		assert.deepEqual(result, failed);
	}
});

function recovery(action) {
	const candidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [{ definition: { id: 'physics-newtons-second-law-01' } }]
	};
	return {
		status: 'passed',
		action,
		sourceAttempt: 3,
		candidate,
		manifest: {
			sourceAttempt: { attempt: 3 },
			base: { planSha256: 'a'.repeat(64) },
			effective: { planSha256: 'b'.repeat(64) }
		}
	};
}
