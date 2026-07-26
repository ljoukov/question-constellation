import { canonicalHash, sha256 } from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_EVIDENCE_SCHEMA,
	SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING,
	SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE,
	SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
	SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS,
	SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
	SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_EVIDENCE_SCHEMA,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
	evidenceRunSha256,
	readScienceChallengeShortRecallCandidateSet
} from './science-challenge-short-recall.mjs';

/**
 * Build deterministic, validator-complete short-recall evidence for release test fixtures.
 *
 * This helper is intentionally test-only. It does not invoke a model and must never be used to
 * create production release evidence.
 */
export function buildPassedScienceChallengeShortRecallArtifactsForTest({
	candidateEntries,
	candidateArtifactSha256 = canonicalHash(candidateEntries),
	expectedCount = Array.isArray(candidateEntries)
		? candidateEntries.length
		: candidateEntries?.challenges?.length
}) {
	if (!Number.isInteger(expectedCount) || expectedCount < 1) {
		throw new Error('Test short-recall fixture requires a non-empty candidate collection.');
	}
	const candidateSet = readScienceChallengeShortRecallCandidateSet(candidateEntries, {
		expectedCount
	});
	const prompts = candidateSet.rows.map((row) => ({
		challengeId: row.challengeId,
		stem: `For reviewed science challenge ${row.index + 1}, the measured evidence supports the ___.`,
		canonicalAnswer: 'conclusion',
		acceptedAliases: [],
		preferredHiddenStepIndex: 2,
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION
	}));
	const targetIds = candidateSet.rows.map((row) => row.challengeId);
	const authoringBatches = evidenceBatches(candidateSet, 'authoring');
	const modelVersions = ['gpt-5.6-sol-test'];
	const authoringEvidence = {
		schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_EVIDENCE_SCHEMA,
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		status: 'passed',
		mode: 'author',
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
		candidateArtifactSha256,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: canonicalHash(prompts),
		priorPromptSetSha256: null,
		repairReviewSha256: null,
		repairAuthoringEvidenceSha256: null,
		repairPredecessorSha256: null,
		repairPredecessor: null,
		targetIds,
		targetSetSha256: canonicalHash(targetIds),
		candidateCount: candidateSet.rows.length,
		authoredCount: candidateSet.rows.length,
		preservedCount: 0,
		batchCount: authoringBatches.length,
		executedBatchCount: authoringBatches.length,
		batchSize: SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE,
		concurrency: 6,
		maxAttempts: SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS,
		model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING,
		toolFree: true,
		modelVersions,
		batches: authoringBatches,
		createdAt: '2026-07-24T00:00:00.000Z'
	};
	authoringEvidence.runSha256 = evidenceRunSha256(authoringEvidence);

	const reviewBatches = evidenceBatches(candidateSet, 'review');
	const reviews = candidateSet.rows.map((row, index) => ({
		challengeId: row.challengeId,
		candidateSha256: row.candidateSha256,
		promptSha256: canonicalHash(prompts[index]),
		accepted: true,
		gates: Object.fromEntries(
			SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.map((gate) => [gate, true])
		),
		issues: []
	}));
	const reviewerRunSha256 = canonicalHash({
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: canonicalHash(prompts),
		model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
		batches: reviewBatches,
		reviews
	});
	const reviewEvidence = {
		schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_EVIDENCE_SCHEMA,
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		status: 'passed',
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
		candidateArtifactSha256,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: canonicalHash(prompts),
		authoringEvidenceSha256: canonicalHash(authoringEvidence),
		authoring: authoringSummary(authoringEvidence),
		reviewer: {
			model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
			thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
			toolFree: true,
			runSha256: reviewerRunSha256,
			modelVersions
		},
		reviewCount: reviews.length,
		acceptedCount: reviews.length,
		rejectedCount: 0,
		batchCount: reviewBatches.length,
		batchSize: SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE,
		concurrency: 6,
		maxAttempts: SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS,
		batches: reviewBatches,
		reviews,
		createdAt: '2026-07-24T00:01:00.000Z'
	};
	reviewEvidence.runSha256 = evidenceRunSha256(reviewEvidence);

	return {
		candidateSet,
		prompts,
		authoringEvidence,
		reviewEvidence,
		releaseBindings: {
			shortRecallCandidateArtifactSha256: candidateArtifactSha256,
			shortRecallCandidateSetSha256: candidateSet.candidateSetSha256,
			shortRecallBundleSha256: canonicalHash(prompts),
			shortRecallReviewSha256: canonicalHash(reviewEvidence),
			shortRecallAuthoringEvidenceSha256: canonicalHash(authoringEvidence),
			shortRecallAuthoringRunSha256: authoringEvidence.runSha256,
			shortRecallReviewerRunSha256: reviewEvidence.reviewer.runSha256
		}
	};
}

function evidenceBatches(candidateSet, prefix) {
	const batches = [];
	for (
		let start = 0;
		start < candidateSet.rows.length;
		start += SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE
	) {
		const rows = candidateSet.rows.slice(start, start + SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE);
		const batchNumber = start / SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE + 1;
		const batchId = `short-recall-${String(batchNumber).padStart(3, '0')}`;
		batches.push({
			batchId,
			challengeIds: rows.map((row) => row.challengeId),
			rowCount: rows.length,
			batchInputSha256: fixtureHash(`${prefix} batch input ${batchId}`),
			attempt: 1,
			attemptSha256: fixtureHash(`${prefix} attempt ${batchId}`),
			transportRunSha256: fixtureHash(`${prefix} transport run ${batchId}`),
			transportPolicySha256: fixtureHash(`${prefix} transport policy ${batchId}`),
			outputSha256: fixtureHash(`${prefix} output ${batchId}`),
			modelVersion: 'gpt-5.6-sol-test',
			toolFree: true
		});
	}
	return batches;
}

function authoringSummary(authoringEvidence) {
	return {
		evidenceSha256: canonicalHash(authoringEvidence),
		model: authoringEvidence.model,
		thinkingLevel: authoringEvidence.thinkingLevel,
		toolFree: authoringEvidence.toolFree,
		runSha256: authoringEvidence.runSha256,
		modelVersions: authoringEvidence.modelVersions,
		mode: authoringEvidence.mode,
		contentVersion: authoringEvidence.contentVersion,
		candidateArtifactSha256: authoringEvidence.candidateArtifactSha256,
		candidateSetSha256: authoringEvidence.candidateSetSha256,
		promptSetSha256: authoringEvidence.promptSetSha256,
		candidateCount: authoringEvidence.candidateCount,
		authoredCount: authoringEvidence.authoredCount,
		preservedCount: authoringEvidence.preservedCount,
		batchCount: authoringEvidence.batchCount,
		executedBatchCount: authoringEvidence.executedBatchCount,
		batchSize: authoringEvidence.batchSize,
		concurrency: authoringEvidence.concurrency,
		maxAttempts: authoringEvidence.maxAttempts,
		targetSetSha256: authoringEvidence.targetSetSha256,
		priorPromptSetSha256: authoringEvidence.priorPromptSetSha256,
		repairReviewSha256: authoringEvidence.repairReviewSha256,
		repairAuthoringEvidenceSha256: authoringEvidence.repairAuthoringEvidenceSha256,
		repairPredecessorSha256: authoringEvidence.repairPredecessorSha256
	};
}

function fixtureHash(value) {
	return sha256(Buffer.from(value));
}
