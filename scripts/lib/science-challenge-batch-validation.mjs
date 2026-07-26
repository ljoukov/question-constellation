import {
	SCIENCE_CHALLENGE_BATCH_SCHEMA,
	canonicalHash,
	validateGeneratedChallenge,
	validateGeneratedChallengeCollection
} from './science-challenge-release.mjs';

/**
 * Deterministic ordinary authoring validation shared by generation and release replay.
 */
export function validateScienceChallengeGeneratedBatch(
	candidate,
	rows,
	{ sourceById, curriculumById, existingDefinitions, planRows }
) {
	const issues = [];
	if (!candidate || candidate.schemaVersion !== SCIENCE_CHALLENGE_BATCH_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_CHALLENGE_BATCH_SCHEMA}.`);
	}
	if (!Array.isArray(candidate?.challenges) || candidate.challenges.length !== rows.length) {
		issues.push(`Batch must contain exactly ${rows.length} challenges.`);
		return { status: 'failed', issues };
	}
	const candidateIds = candidate.challenges.map((entry) => entry?.definition?.id);
	const expectedIds = rows.map((row) => row.id);
	if (canonicalHash(candidateIds) !== canonicalHash(expectedIds)) {
		issues.push('Batch challenges must preserve the exact planned row order and membership.');
	}
	const entryById = new Map(candidate.challenges.map((entry) => [entry?.definition?.id, entry]));
	for (const row of rows) {
		const entry = entryById.get(row.id);
		if (!entry) {
			issues.push(`Missing planned challenge ${row.id}.`);
			continue;
		}
		const sourceQuestion = sourceById.get(row.calibrationQuestionId);
		const curriculum = curriculumById.get(row.curriculumComponentId);
		const validation = validateGeneratedChallenge(entry, {
			planRow: row,
			sourceQuestion: {
				id: sourceQuestion.id,
				contentSha256: sourceQuestion.contentSha256
			},
			curriculum: {
				id: curriculum.componentId,
				specificationId: curriculum.specificationId,
				specificationSha256: curriculum.specificationSha256
			}
		});
		for (const issue of validation.issues) issues.push(`${row.id}: ${issue}`);
		assertAnswerPositions(
			entry.definition,
			expectedAnswerPositions(planRows, row.id),
			issues,
			row.id
		);
	}
	const slugs = candidate.challenges.map(
		(entry) => `${entry.definition?.subject}/${entry.definition?.slug}`
	);
	if (new Set(slugs).size !== slugs.length) {
		issues.push('Route slugs must be unique within the batch.');
	}
	const artIds = candidate.challenges.flatMap((entry) => [
		entry.art?.opening?.id,
		entry.art?.transfer?.id
	]);
	if (new Set(artIds).size !== artIds.length) {
		issues.push('Every question context needs a unique art id.');
	}
	issues.push(
		...validateGeneratedChallengeCollection(candidate.challenges, {
			existingDefinitions
		}).issues
	);
	return { status: issues.length ? 'failed' : 'passed', issues };
}

function expectedAnswerPositions(planRows, challengeId) {
	const globalIndex = planRows.findIndex((row) => row.id === challengeId);
	return {
		strongerAnswer: globalIndex % 2 === 0 ? 'a' : 'b',
		diagnosisCorrectIndex: globalIndex % 3,
		repairCorrectIndex: (globalIndex + 1) % 3,
		transferCorrectIndex: (globalIndex + 2) % 3
	};
}

function assertAnswerPositions(definition, expected, issues, id) {
	if (definition.strongerAnswer !== expected.strongerAnswer) {
		issues.push(`${id}: strongerAnswer must be ${expected.strongerAnswer}.`);
	}
	for (const [field, expectedIndex] of [
		['diagnosisChoices', expected.diagnosisCorrectIndex],
		['repairChoices', expected.repairCorrectIndex],
		['transferChoices', expected.transferCorrectIndex]
	]) {
		if (definition[field]?.findIndex((choice) => choice.correct) !== expectedIndex) {
			issues.push(`${id}: ${field} correct choice must be at zero-based index ${expectedIndex}.`);
		}
	}
}
