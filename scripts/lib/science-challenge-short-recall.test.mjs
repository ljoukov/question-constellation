import assert from 'node:assert/strict';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_BATCH_SCHEMA,
	SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_BATCH_SCHEMA,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES,
	buildScienceChallengeShortRecallAuthoringBatchInput,
	buildScienceChallengeShortRecallBatches,
	buildScienceChallengeShortRecallGlobalPromptIndex,
	buildScienceChallengeShortRecallReviewBatchInput,
	memoryHandleSteps,
	readScienceChallengeShortRecallCandidateSet,
	validateScienceChallengeShortRecallAuthoringBatch,
	validateScienceChallengeShortRecallPrompt,
	validateScienceChallengeShortRecallPromptCollection,
	validateScienceChallengeShortRecallReviewBatch
} from './science-challenge-short-recall.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

function candidate(index = 0) {
	const suffix = String(index + 1).padStart(3, '0');
	return {
		definition: {
			id: `biology-short-recall-${suffix}`,
			sourceQuestionId: `definition-source-question-${suffix}`,
			subject: 'Biology',
			title: `Cell investigation ${suffix}`,
			topic: 'Cell biology',
			memoryHandle:
				'Identify the variable → Read the measured evidence → Link the pattern to the conclusion → Check the command word',
			previewQuestion: `A learner compares cell sample ${suffix}. Explain the measured pattern.`,
			staticAnswers: {
				a: 'The measured pattern supports the scientific conclusion.',
				b: 'The measurements are listed without linking them to the conclusion.'
			},
			strongerAnswer: 'a',
			showdownExplanation:
				'Answer A links the measured evidence to the conclusion required by the question.',
			commandWordLesson:
				'Explain requires the measured evidence to be connected to the scientific conclusion.',
			repairSuccess: 'The answer now links evidence to the conclusion.',
			transferPromptLead: 'Apply the same evidence link to a second cell sample.',
			transferExplanation:
				'The second sample is solved by connecting its measured pattern to the conclusion.'
		},
		grounding: {
			curriculumComponentId: `component-${suffix}`,
			specificationId: 'aqa-gcse-biology',
			calibrationQuestionId: `calibration-${suffix}`,
			sourceQuestionId: `grounding-source-question-${suffix}`
		}
	};
}

function promptFor(row, overrides = {}) {
	return {
		challengeId: row.challengeId,
		stem: `For cell sample ${row.index + 1}, the measured evidence supports the ___.`,
		canonicalAnswer: 'conclusion',
		acceptedAliases: [],
		preferredHiddenStepIndex: 2,
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
		...overrides
	};
}

test('requires a reviewed 3-5-step candidate and builds deterministic 8-row batches', () => {
	assert.deepEqual(memoryHandleSteps(candidate().definition.memoryHandle), [
		'Identify the variable',
		'Read the measured evidence',
		'Link the pattern to the conclusion',
		'Check the command word'
	]);
	assert.throws(
		() => memoryHandleSteps('Read the evidence → State the answer'),
		/must contain 3-5/
	);
	const shortChallengeId = candidate();
	shortChallengeId.definition.id = 'a';
	assert.throws(
		() => readScienceChallengeShortRecallCandidateSet([shortChallengeId], { expectedCount: 1 }),
		/unsafe challenge id/
	);
	const shortGroundingId = candidate();
	shortGroundingId.grounding.specificationId = 'a';
	assert.throws(
		() => readScienceChallengeShortRecallCandidateSet([shortGroundingId], { expectedCount: 1 }),
		/shorter than three characters/
	);
	const numericGroundingId = candidate();
	numericGroundingId.grounding.specificationId = 9;
	assert.throws(
		() => readScienceChallengeShortRecallCandidateSet([numericGroundingId], { expectedCount: 1 }),
		/non-string grounding identifier/
	);
	const ordinaryIdSuffix = candidate();
	ordinaryIdSuffix.definition.solid = 'ice';
	const ordinaryIdSet = readScienceChallengeShortRecallCandidateSet([ordinaryIdSuffix], {
		expectedCount: 1
	});
	assert.equal(
		validateScienceChallengeShortRecallPrompt(
			promptFor(ordinaryIdSet.rows[0], { canonicalAnswer: 'ice' }),
			ordinaryIdSet.rows[0]
		).status,
		'passed'
	);

	const candidateSet = readScienceChallengeShortRecallCandidateSet(
		Array.from({ length: 16 }, (_unused, index) => candidate(index)),
		{ expectedCount: 16 }
	);
	const batches = buildScienceChallengeShortRecallBatches(candidateSet);
	assert.deepEqual(
		batches.map((batch) => [batch.batchId, batch.rows.length]),
		[
			['short-recall-001', 8],
			['short-recall-002', 8]
		]
	);
});

test('rejects generic, grammar-only, leaked, function-word, and D1-unsafe prompts', () => {
	const candidateSet = readScienceChallengeShortRecallCandidateSet([candidate()], {
		expectedCount: 1
	});
	const row = candidateSet.rows[0];
	const grounding = row.entry.grounding;
	for (const [overrides, category] of [
		[{ stem: 'Fill in the correct word: ___.' }, 'stem'],
		[{ stem: 'The missing word is ___.' }, 'stem'],
		[{ canonicalAnswer: 'the' }, 'answer'],
		[{ stem: 'The local source /private/var/job/result.json gives ___.' }, 'privacy'],
		[{ stem: `Challenge ${row.challengeId} concludes with ___.` }, 'privacy'],
		[{ stem: `Challenge ${row.challengeId.toUpperCase()} concludes with ___.` }, 'privacy'],
		[{ stem: `Internal prefix-${row.challengeId}-copy concludes with ___.` }, 'privacy'],
		[{ stem: `Curriculum ${grounding.curriculumComponentId} concludes with ___.` }, 'privacy'],
		[{ stem: `Specification ${grounding.specificationId} concludes with ___.` }, 'privacy'],
		[{ stem: `Calibration ${grounding.calibrationQuestionId} concludes with ___.` }, 'privacy'],
		[{ stem: `Source ${grounding.sourceQuestionId} concludes with ___.` }, 'privacy'],
		[
			{
				stem: `Definition source ${row.definition.sourceQuestionId} concludes with ___.`
			},
			'privacy'
		],
		[{ canonicalAnswer: row.candidateSha256 }, 'privacy'],
		[{ acceptedAliases: [grounding.calibrationQuestionId] }, 'privacy'],
		[{ stem: `${'Evidence '.repeat(55)}___.` }, 'storage'],
		[{ canonicalAnswer: ' conclusion' }, 'storage'],
		[{ contentVersion: null }, 'storage'],
		[{ unexpected: true }, 'format'],
		[{ preferredHiddenStepIndex: 4 }, 'hidden-step']
	]) {
		const validation = validateScienceChallengeShortRecallPrompt(promptFor(row, overrides), row);
		assert.equal(validation.status, 'failed');
		assert.ok(
			validation.issues.some((issue) => issue.category === category),
			`expected ${category}: ${JSON.stringify(validation.issues)}`
		);
	}
	const callerSuppliedLeak = validateScienceChallengeShortRecallPrompt(
		promptFor(row, {
			stem: 'The exact-source-token measurement supports the ___.'
		}),
		row,
		{ suppliedSourceStrings: ['exact-source-token'] }
	);
	assert.equal(callerSuppliedLeak.status, 'failed');
	assert.ok(callerSuppliedLeak.issues.some((issue) => issue.category === 'privacy'));
	const shortCallerSuppliedLeak = validateScienceChallengeShortRecallPrompt(
		promptFor(row, {
			stem: 'Internal q source measurements support the ___.'
		}),
		row,
		{ suppliedSourceStrings: ['q'] }
	);
	assert.equal(shortCallerSuppliedLeak.status, 'failed');
	assert.ok(shortCallerSuppliedLeak.issues.some((issue) => issue.category === 'privacy'));
	assert.equal(
		validateScienceChallengeShortRecallPrompt(promptFor(row), row, {
			suppliedSourceStrings: ['ion']
		}).status,
		'passed'
	);
});

test('rejects identifiers copied from any other supplied candidate', () => {
	const candidateSet = readScienceChallengeShortRecallCandidateSet([candidate(0), candidate(1)], {
		expectedCount: 2
	});
	const [firstRow, secondRow] = candidateSet.rows;
	const batch = buildScienceChallengeShortRecallBatches(candidateSet)[0];
	const candidateRowsById = new Map(candidateSet.rows.map((row) => [row.challengeId, row]));
	const authoringInput = buildScienceChallengeShortRecallAuthoringBatchInput({
		candidateSet,
		batch
	});

	for (const leakedValue of [
		secondRow.challengeId,
		secondRow.entry.grounding.curriculumComponentId,
		secondRow.entry.grounding.specificationId,
		secondRow.entry.grounding.calibrationQuestionId,
		secondRow.definition.sourceQuestionId
	]) {
		const prompts = [
			promptFor(firstRow, {
				stem: `Internal source ${leakedValue} says the measurement supports the ___.`
			}),
			promptFor(secondRow)
		];
		const authoring = validateScienceChallengeShortRecallAuthoringBatch(
			{
				schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_BATCH_SCHEMA,
				batchId: batch.batchId,
				batchInputSha256: authoringInput.batchInputSha256,
				prompts: prompts.map((prompt, index) => ({
					...prompt,
					candidateSha256: candidateSet.rows[index].candidateSha256
				}))
			},
			{ batchInput: authoringInput, candidateRowsById }
		);
		assert.equal(authoring.status, 'failed');
		assert.ok(authoring.issues.some((issue) => issue.category === 'privacy'));

		const collection = validateScienceChallengeShortRecallPromptCollection(prompts, candidateSet);
		assert.equal(collection.status, 'failed');
		assert.ok(collection.issues.some((issue) => issue.category === 'privacy'));
	}
});

test('requires one blank, one-to-two-word answers, explicit unique aliases, and unique stems', () => {
	const candidateSet = readScienceChallengeShortRecallCandidateSet([candidate(0), candidate(1)], {
		expectedCount: 2
	});
	const first = promptFor(candidateSet.rows[0]);
	const invalid = promptFor(candidateSet.rows[1], {
		stem: 'For this sample, ___ evidence supports ___.',
		canonicalAnswer: 'a very long answer',
		acceptedAliases: ['conclusion', 'conclusion']
	});
	const invalidValidation = validateScienceChallengeShortRecallPrompt(
		invalid,
		candidateSet.rows[1]
	);
	assert.equal(invalidValidation.status, 'failed');
	assert.ok(invalidValidation.issues.some((issue) => issue.category === 'answer'));
	assert.ok(invalidValidation.issues.some((issue) => issue.category === 'alias'));
	assert.ok(invalidValidation.issues.some((issue) => issue.category === 'storage'));

	for (const stem of [
		'For this sample, the measured evidence supports the ____.',
		'For this sample, the measured evidence supports the _____.',
		'For this sample, _ measured evidence supports the ___.',
		'For this sample, __ measured evidence supports the ___.',
		'For this sample, the measured evidence supports___today.',
		'For this sample, the measured evidence supports\u200d___\u200dtoday.',
		'For this sample, the measured evidence supports\u0301___\u0301today.',
		'For this sample, the measured evidence supports 𝑥___𝑦 today.'
	]) {
		const validation = validateScienceChallengeShortRecallPrompt(
			promptFor(candidateSet.rows[0], { stem }),
			candidateSet.rows[0]
		);
		assert.equal(validation.status, 'failed');
		assert.ok(validation.issues.some((issue) => issue.category === 'storage'));
	}
	for (const overrides of [
		{ canonicalAnswer: 'it is oxygen' },
		{ canonicalAnswer: 'the control group' },
		{ canonicalAnswer: 'it-is-oxygen' },
		{ canonicalAnswer: 'the-control-group' },
		{ canonicalAnswer: "it'is'oxygen" },
		{ canonicalAnswer: 'it-is oxygen' },
		{ canonicalAnswer: 'the-control group' },
		{ acceptedAliases: ['it is acidic'] }
	]) {
		const validation = validateScienceChallengeShortRecallPrompt(
			promptFor(candidateSet.rows[0], overrides),
			candidateSet.rows[0]
		);
		assert.equal(validation.status, 'failed');
		assert.ok(validation.issues.some((issue) => issue.category === 'answer'));
	}
	assert.equal(
		validateScienceChallengeShortRecallPrompt(
			promptFor(candidateSet.rows[0], { canonicalAnswer: 'X-ray detector' }),
			candidateSet.rows[0]
		).status,
		'passed'
	);

	const duplicate = promptFor(candidateSet.rows[1], {
		stem: first.stem
	});
	const collection = validateScienceChallengeShortRecallPromptCollection(
		[first, duplicate],
		candidateSet
	);
	assert.equal(collection.status, 'failed');
	assert.ok(collection.issues.some((issue) => issue.category === 'duplication'));
});

test('batch validators reject unexpected raw model fields', () => {
	const candidateSet = readScienceChallengeShortRecallCandidateSet([candidate()], {
		expectedCount: 1
	});
	const batch = buildScienceChallengeShortRecallBatches(candidateSet)[0];
	const candidateRowsById = new Map(candidateSet.rows.map((row) => [row.challengeId, row]));
	const authoringInput = buildScienceChallengeShortRecallAuthoringBatchInput({
		candidateSet,
		batch
	});
	const prompt = promptFor(candidateSet.rows[0]);
	const authoring = validateScienceChallengeShortRecallAuthoringBatch(
		{
			schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_BATCH_SCHEMA,
			batchId: batch.batchId,
			batchInputSha256: authoringInput.batchInputSha256,
			prompts: [
				{
					...prompt,
					candidateSha256: candidateSet.rows[0].candidateSha256,
					privateNotes: 'must not survive'
				}
			]
		},
		{ batchInput: authoringInput, candidateRowsById }
	);
	assert.equal(authoring.status, 'failed');
	assert.ok(authoring.issues.some((issue) => issue.category === 'format'));

	const leakedBatchBinding = validateScienceChallengeShortRecallAuthoringBatch(
		{
			schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_BATCH_SCHEMA,
			batchId: batch.batchId,
			batchInputSha256: authoringInput.batchInputSha256,
			prompts: [
				{
					...prompt,
					candidateSha256: candidateSet.rows[0].candidateSha256,
					stem: `Batch source ${authoringInput.batchInputSha256} supports the ___.`
				}
			]
		},
		{ batchInput: authoringInput, candidateRowsById }
	);
	assert.equal(leakedBatchBinding.status, 'failed');
	assert.ok(leakedBatchBinding.issues.some((issue) => issue.category === 'privacy'));

	const promptById = new Map([[prompt.challengeId, prompt]]);
	const reviewInput = buildScienceChallengeShortRecallReviewBatchInput({
		candidateSet,
		batch,
		promptById,
		promptSetSha256: canonicalHash([prompt]),
		globalPromptIndex: buildScienceChallengeShortRecallGlobalPromptIndex([prompt], candidateSet)
	});
	const review = validateScienceChallengeShortRecallReviewBatch(
		{
			schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_BATCH_SCHEMA,
			batchId: batch.batchId,
			batchInputSha256: reviewInput.batchInputSha256,
			reviews: [
				{
					challengeId: prompt.challengeId,
					candidateSha256: candidateSet.rows[0].candidateSha256,
					promptSha256: canonicalHash(prompt),
					accepted: true,
					gates: Object.fromEntries(
						SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.map((gate) => [gate, true])
					),
					issues: [],
					privateNotes: 'must not survive'
				}
			]
		},
		{ batchInput: reviewInput, candidateRowsById, promptById }
	);
	assert.equal(review.status, 'failed');
	assert.ok(review.issues.some((issue) => issue.category === 'format'));
});
