import assert from 'node:assert/strict';
import test from 'node:test';

import { SCIENCE_ART_REVIEW_BOOLEAN_FIELDS, canonicalHash } from './science-challenge-release.mjs';
import {
	SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA,
	buildAdjudicatedArtReview
} from './science-question-art-review-adjudication.mjs';

test('major-only adjudication retains explicit rows without mutating raw review evidence', () => {
	const sourceReview = reviewSummary();
	const sourceBytes = JSON.stringify(sourceReview);
	const adjudication = {
		schemaVersion: SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA,
		sourceReviewSha256: canonicalHash(sourceReview),
		policy: 'major-visible-errors-only',
		adjudicatedAt: '2026-07-26T05:00:00.000Z',
		decisions: [
			{
				id: 'chemistry-alt-only-opening',
				action: 'retain-with-annotation',
				category: 'accessibility',
				rationale: 'The pixels are accurate; only the source alt is generic.',
				annotation: 'Use the exact-pair visible takeaway as runtime alt text.'
			}
		]
	};

	const effective = buildAdjudicatedArtReview({ sourceReview, adjudication });
	assert.equal(JSON.stringify(sourceReview), sourceBytes);
	assert.equal(effective.rejectedCount, 1);
	assert.equal(effective.acceptedCount, 2);
	assert.equal(effective.annotatedAcceptedCount, 2);
	assert.equal(effective.adjudication.retainedCount, 1);
	assert.equal(effective.adjudication.escalatedCount, 0);
	const retained = effective.reviews[0];
	assert.equal(retained.accepted, true);
	assert.equal(retained.disposition, 'retain-with-annotation');
	for (const field of SCIENCE_ART_REVIEW_BOOLEAN_FIELDS) assert.equal(retained[field], true);
	assert.equal(
		retained.issues.every((issue) => issue.severity === 'minor'),
		true
	);
	assert.equal(effective.reviews[1].accepted, false);
});

test('major-only adjudication can escalate an accepted reviewer false negative', () => {
	const sourceReview = reviewSummary();
	const sourceBytes = JSON.stringify(sourceReview);
	const adjudication = {
		schemaVersion: SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA,
		sourceReviewSha256: canonicalHash(sourceReview),
		policy: 'major-visible-errors-only',
		adjudicatedAt: '2026-07-26T05:00:00.000Z',
		decisions: [
			{
				id: 'physics-accepted-opening',
				action: 'fresh-regenerate',
				category: 'science',
				rationale: 'Full-resolution inspection shows a visibly impossible circuit.',
				regenerationInstruction:
					'Create a brand-new dark master with a complete scientifically valid circuit.'
			}
		]
	};
	const effective = buildAdjudicatedArtReview({ sourceReview, adjudication });
	assert.equal(JSON.stringify(sourceReview), sourceBytes);
	assert.equal(effective.rejectedCount, 3);
	assert.equal(effective.acceptedCount, 0);
	assert.equal(effective.adjudication.retainedCount, 0);
	assert.equal(effective.adjudication.escalatedCount, 1);
	assert.deepEqual(effective.adjudication.escalatedIds, ['physics-accepted-opening']);
	const escalated = effective.reviews.find((row) => row.id === 'physics-accepted-opening');
	assert.equal(escalated.accepted, false);
	assert.equal(escalated.disposition, 'fresh-regenerate');
	assert.equal(escalated.scientificallyAccurate, false);
	assert.equal(escalated.issues.at(-1).severity, 'major');
	assert.match(escalated.issues.at(-1).regenerationInstruction, /brand-new dark master/);
});

test('adjudication rejects stale source hashes and attempts to retain accepted rows', () => {
	const sourceReview = reviewSummary();
	for (const decision of [
		{
			id: 'chemistry-alt-only-opening',
			action: 'retain-with-annotation',
			category: 'accessibility',
			rationale: 'Metadata only.',
			annotation: 'Replace the runtime alt.'
		},
		{
			id: 'physics-accepted-opening',
			action: 'retain-with-annotation',
			category: 'science',
			rationale: 'Incorrectly attempted override.',
			annotation: 'Do not allow this.'
		}
	]) {
		assert.throws(
			() =>
				buildAdjudicatedArtReview({
					sourceReview,
					adjudication: {
						schemaVersion: SCIENCE_QUESTION_ART_REVIEW_ADJUDICATION_SCHEMA,
						sourceReviewSha256:
							decision.id === 'chemistry-alt-only-opening'
								? '0'.repeat(64)
								: canonicalHash(sourceReview),
						policy: 'major-visible-errors-only',
						adjudicatedAt: '2026-07-26T05:00:00.000Z',
						decisions: [decision]
					}
				}),
			/Invalid science art review adjudication/
		);
	}
});

function reviewSummary() {
	const falseBooleans = Object.fromEntries(
		SCIENCE_ART_REVIEW_BOOLEAN_FIELDS.map((field) => [field, field !== 'accessibleAlt'])
	);
	const trueBooleans = Object.fromEntries(
		SCIENCE_ART_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])
	);
	return {
		schemaVersion: 'science-question-art-review-summary/v2',
		releaseId: 'test-release',
		manifestSha256: 'a'.repeat(64),
		assetInventorySha256: 'b'.repeat(64),
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max',
		reviewedAt: '2026-07-26T04:00:00.000Z',
		selectedCount: 3,
		acceptedCount: 1,
		cleanAcceptedCount: 0,
		annotatedAcceptedCount: 1,
		rejectedCount: 2,
		majorRejectedCount: 2,
		missingCount: 0,
		invalidBatchCount: 0,
		batchCount: 1,
		status: 'failed',
		batches: [],
		missingIds: [],
		invalidBatches: [],
		reviews: [
			{
				id: 'chemistry-alt-only-opening',
				accepted: false,
				disposition: 'fresh-regenerate',
				score: 18,
				...falseBooleans,
				visibleTakeaway: 'Two accurate apparatus models sit side by side.',
				issues: [
					{
						category: 'accessibility',
						severity: 'major',
						description: 'The source alt is generic.',
						annotation: '',
						regenerationInstruction: 'Regenerate.'
					}
				]
			},
			{
				id: 'physics-real-major-opening',
				accepted: false,
				disposition: 'fresh-regenerate',
				score: 14,
				...trueBooleans,
				scientificallyAccurate: false,
				visibleTakeaway: 'A lead terminates on a magnet.',
				issues: [
					{
						category: 'science',
						severity: 'major',
						description: 'The circuit is visibly wrong.',
						annotation: '',
						regenerationInstruction: 'Generate a fresh correct circuit.'
					}
				]
			},
			{
				id: 'physics-accepted-opening',
				accepted: true,
				disposition: 'retain-with-annotation',
				score: 19,
				...trueBooleans,
				visibleTakeaway: 'A polished apparatus scene appears plausible at first glance.',
				issues: [
					{
						category: 'quality',
						severity: 'minor',
						description: 'One surface is slightly rough.',
						annotation: 'Retain the harmless surface variation.',
						regenerationInstruction: ''
					}
				]
			}
		]
	};
}
