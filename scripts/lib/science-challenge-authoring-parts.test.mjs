import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildScienceChallengeAuthoringParts,
	mergeScienceChallengeAuthoringPartBatches
} from './science-challenge-authoring-parts.mjs';
import { buildScienceChallengeRepairPrompt } from './science-challenge-authoring-prompts.mjs';
import {
	isScienceChallengeDirectJsonRunSummary,
	isScienceChallengeDirectMultipartRunSummary,
	validateScienceChallengeAuthoringRunPolicy
} from './science-challenge-authoring-run-policy.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

test('partitions eight rows into ordered 4 + 4 parts without rebasing global answer positions', () => {
	const { rows, inputs } = authoringInputs(8);
	const expectedAnswerPositions = inputs.map((input) => input.plan.expectedAnswerPositions);

	const parts = buildScienceChallengeAuthoringParts({ rows, inputs, partSize: 4 });

	assert.deepEqual(
		parts.map(({ partId, index, start, end, rowIds }) => ({
			partId,
			index,
			start,
			end,
			rowIds
		})),
		[
			{
				partId: 'part-01',
				index: 1,
				start: 0,
				end: 4,
				rowIds: rows.slice(0, 4).map((row) => row.id)
			},
			{
				partId: 'part-02',
				index: 2,
				start: 4,
				end: 8,
				rowIds: rows.slice(4).map((row) => row.id)
			}
		]
	);
	assert.deepEqual(
		parts.map((part) => part.rows.length),
		[4, 4]
	);
	assert.deepEqual(
		parts.map((part) => part.inputs.length),
		[4, 4]
	);
	assert.deepEqual(
		parts.flatMap((part) => part.inputs),
		inputs
	);
	for (const [index, input] of parts.flatMap((part) => part.inputs).entries()) {
		assert.strictEqual(input, inputs[index], `input ${index + 1} must be the exact source object`);
	}
	assert.deepEqual(
		parts.flatMap((part) => part.inputs).map((input) => input.plan.expectedAnswerPositions),
		expectedAnswerPositions
	);
	assert.equal(parts[0].inputSha256, canonicalHash(inputs.slice(0, 4)));
	assert.equal(parts[1].inputSha256, canonicalHash(inputs.slice(4)));
});

test('keeps an uneven final partition ordered and complete', () => {
	const { rows, inputs } = authoringInputs(10);

	const parts = buildScienceChallengeAuthoringParts({ rows, inputs, partSize: 4 });

	assert.deepEqual(
		parts.map(({ start, end, rowIds }) => ({ start, end, rowIds })),
		[
			{ start: 0, end: 4, rowIds: rows.slice(0, 4).map((row) => row.id) },
			{ start: 4, end: 8, rowIds: rows.slice(4, 8).map((row) => row.id) },
			{ start: 8, end: 10, rowIds: rows.slice(8).map((row) => row.id) }
		]
	);
	assert.deepEqual(
		parts.map((part) => part.inputs.length),
		[4, 4, 2]
	);
	assert.deepEqual(
		parts.flatMap((part) => part.rowIds),
		rows.map((row) => row.id)
	);
});

test('rejects reordered rows and duplicate challenge ids crossing part boundaries', () => {
	const { rows, inputs } = authoringInputs(4);
	const parts = buildScienceChallengeAuthoringParts({ rows, inputs, partSize: 2 });
	const ordered = (ids) => ({
		schemaVersion: 'science-challenge-batch/v1',
		challenges: ids.map((id) => ({ definition: { id } }))
	});

	const reordered = mergeScienceChallengeAuthoringPartBatches({
		parts,
		batches: [ordered([rows[1].id, rows[0].id]), ordered([rows[2].id, rows[3].id])]
	});
	assert.equal(reordered.status, 'failed');
	assert.match(reordered.issues.join('\n'), /row 1 expected challenge-01, found challenge-02/);
	assert.match(reordered.issues.join('\n'), /row 2 expected challenge-02, found challenge-01/);

	const duplicateAcrossParts = mergeScienceChallengeAuthoringPartBatches({
		parts,
		batches: [ordered([rows[0].id, rows[1].id]), ordered([rows[1].id, rows[3].id])]
	});
	assert.equal(duplicateAcrossParts.status, 'failed');
	assert.match(
		duplicateAcrossParts.issues.join('\n'),
		/part-02 row 1 expected challenge-03, found challenge-02/
	);
	assert.match(
		duplicateAcrossParts.issues.join('\n'),
		/part-02 duplicates challenge id challenge-02 across parts/
	);
});

test('an unknown llm-direct transport version is neither current direct nor multipart and is rejected', () => {
	const summary = {
		transport: 'llm-direct',
		transportVersion: 'science-challenge-llm-direct-json/v999'
	};

	assert.equal(isScienceChallengeDirectJsonRunSummary(summary), false);
	assert.equal(isScienceChallengeDirectMultipartRunSummary(summary), false);
	const validation = validateScienceChallengeAuthoringRunPolicy({ summary });
	assert.equal(validation.status, 'failed');
	assert.match(
		validation.issues.join('\n'),
		/Unsupported science challenge authoring transport llm-direct/
	);
});

test('final-attempt similarity guidance is explicit without changing earlier repair prompts', () => {
	const options = {
		basePrompt: 'BASE',
		candidate: { schemaVersion: 'science-challenge-batch/v1', challenges: [] },
		issues: [
			'biology-land-use-02:opening is too similar to biology-land-use-01:opening in curriculum component component-land-use (token 0.381, bigram 0.261).'
		]
	};

	const attemptThree = buildScienceChallengeRepairPrompt({ ...options, attempt: 3 });
	const attemptFour = buildScienceChallengeRepairPrompt({ ...options, attempt: 4 });

	assert.doesNotMatch(attemptThree, /FINAL-ATTEMPT COLLECTION SIMILARITY REPAIR/);
	assert.match(attemptFour, /FINAL-ATTEMPT COLLECTION SIMILARITY REPAIR/);
	assert.match(attemptFour, /opening means definition\.previewQuestion/);
	assert.match(attemptFour, /Do not merely substitute a new place, organism, object or number/);
});

function authoringInputs(count) {
	const rows = Array.from({ length: count }, (_, index) => ({
		id: `challenge-${String(index + 1).padStart(2, '0')}`,
		curriculumComponentId: `component-${index + 1}`
	}));
	const inputs = rows.map((row, index) => ({
		plan: {
			...row,
			expectedAnswerPositions: {
				strongerAnswer: index % 2 === 0 ? 'a' : 'b',
				diagnosisCorrectIndex: index % 3,
				repairCorrectIndex: (index + 1) % 3,
				transferCorrectIndex: (index + 2) % 3
			}
		},
		officialEvidence: {
			sourceQuestionId: `source-${index + 1}`,
			sourceQuestionSha256: String(index + 1).padStart(64, '0')
		}
	}));
	return { rows, inputs };
}
