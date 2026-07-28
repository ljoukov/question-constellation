import assert from 'node:assert/strict';
import test from 'node:test';

import {
	artReviewAttemptName,
	artReviewRetryDelayMs,
	classifyRetryableArtReviewTransportFailure,
	nextArtReviewAttemptNumber
} from './science-question-art-review-retry.mjs';

test('review transport retry classification covers observed stream failures', () => {
	assert.deepEqual(
		classifyRetryableArtReviewTransportFailure(
			new Error(
				'stream disconnected before completion: error sending request for url (https://chatgpt.com)'
			)
		),
		{
			kind: 'stream-disconnected',
			message:
				'stream disconnected before completion: error sending request for url (https://chatgpt.com)'
		}
	);
	assert.equal(
		classifyRetryableArtReviewTransportFailure(new Error('invalid structured-output schema')),
		null
	);
});

test('review retry backoff is bounded and deterministic', () => {
	assert.deepEqual(
		[1, 2, 3, 4, 5].map((attempt) => artReviewRetryDelayMs(attempt)),
		[2_000, 4_000, 8_000, 8_000, 8_000]
	);
	assert.throws(() => artReviewRetryDelayMs(0), /positive integer/);
});

test('review attempt directories are append-only across resume runs', () => {
	assert.equal(artReviewAttemptName(1), 'attempt-0001');
	assert.equal(artReviewAttemptName(27), 'attempt-0027');
	assert.equal(
		nextArtReviewAttemptNumber(['prompt.txt', 'attempt-0001', 'attempt-0004', 'attempt-bad']),
		5
	);
});
