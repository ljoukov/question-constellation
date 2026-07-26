import {
	buildScienceChallengeAuthoringParts,
	mergeScienceChallengeAuthoringPartBatches
} from './science-challenge-authoring-parts.mjs';
import {
	validateScienceChallengeDirectMultipartRunPolicy,
	validateScienceChallengeDirectPromptJsonRunPolicy
} from './science-challenge-authoring-run-policy.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	canonicalHash,
	challengeBatchOutputSchema,
	normalizeGeneratedChallengeBatch,
	sha256,
	validateGeneratedChallenge,
	validateGeneratedChallengeCollection
} from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SCHEMA =
	'science-challenge-multipart-plan-salvage/v1';
export const SCIENCE_CHALLENGE_FAILED_MERGE_PLAN_SALVAGE_PATHWAY = 'failed-merge-id-and-difficulty';
export const SCIENCE_CHALLENGE_MERGED_DIFFICULTY_SALVAGE_PATHWAY =
	'merged-candidate-plan-difficulty';
export const SCIENCE_CHALLENGE_QUESTION_PRESENTATION_DEFAULT_SALVAGE_PATHWAY =
	'raw-question-presentation-null-default';
export const SCIENCE_CHALLENGE_QUESTION_PRESENTATION_PART_DEFAULT_SCHEMA =
	'science-challenge-question-presentation-part-default/v1';

const MAX_ID_EDIT_DISTANCE = 2;
const MIN_ID_LENGTH = 16;

/**
 * Recover a failed multipart candidate only when it has both:
 * - one small position-bound challenge-id typo; and
 * - one definition.difficulty value that can be restored from its exact position-bound plan row.
 *
 * This function is deliberately pure: it does not read, write, or relabel source evidence.
 */
export function salvageScienceChallengeMultipartPlanDrift(input) {
	const issues = [];
	const expectedInputs = input?.expectedInputs;
	let parts;
	try {
		parts = buildScienceChallengeAuthoringParts({
			rows: Array.isArray(expectedInputs)
				? expectedInputs.map((entry) => ({ id: entry?.plan?.id }))
				: null,
			inputs: expectedInputs,
			partSize: input?.summary?.partSize
		});
	} catch (error) {
		return failed(error instanceof Error ? error.message : String(error));
	}

	const batches = [];
	const sourcePartHashes = [];
	for (const [index, part] of parts.entries()) {
		const evidence = input?.multipartEvidence?.parts?.[index];
		if (!evidence || !Buffer.isBuffer(evidence.lastMessageBytes)) {
			issues.push(`${part.partId} has no immutable raw-output bytes.`);
			continue;
		}
		try {
			batches.push(JSON.parse(evidence.lastMessageBytes.toString('utf8')));
			sourcePartHashes.push({
				partId: part.partId,
				rawOutputSha256: sha256(evidence.lastMessageBytes),
				rawCandidateSha256: canonicalHash(JSON.parse(evidence.lastMessageBytes.toString('utf8')))
			});
		} catch {
			issues.push(`${part.partId} raw output is not valid JSON.`);
		}
	}
	if (issues.length) return failed(issues);

	const originalMerge = mergeScienceChallengeAuthoringPartBatches({ parts, batches });
	if (originalMerge.status !== 'failed' || originalMerge.candidate !== null) {
		return failed('Identity salvage requires an originally failed multipart merge.');
	}

	const correctionResult = correctedBatchesForPlanBoundDrift({
		parts,
		batches,
		expectedInputs
	});
	if (correctionResult.status !== 'passed') return correctionResult;

	const expectedRootError = `Direct multipart merge failed:\n${originalMerge.issues.join('\n')}`;
	if (
		input?.summary?.status !== 'failed' ||
		input.summary.error !== expectedRootError ||
		input.summary.mergedCandidateSha256 !== null
	) {
		return failed('Failed multipart summary is not bound solely to the observed merge defect.');
	}

	const policy = validateScienceChallengeDirectMultipartRunPolicy(input);
	const expectedPolicyIssues = [
		'multipart run summary does not describe a successful required model run.',
		...originalMerge.issues.map((issue) => `multipart merge: ${issue}`),
		'multipart merged last message is not valid JSON.',
		'multipart merged candidate differs from its exact ordered part outputs.'
	];
	if (
		canonicalHash([...policy.issues].sort(compareCodePoints)) !==
		canonicalHash(expectedPolicyIssues.sort(compareCodePoints))
	) {
		return failed([
			'Immutable multipart evidence has defects beyond the permitted plan-bound corrections.',
			...policy.issues
		]);
	}

	const correctedMerge = mergeScienceChallengeAuthoringPartBatches({
		parts,
		batches: correctionResult.batches
	});
	if (correctedMerge.status !== 'passed' || !correctedMerge.candidate) {
		return failed([
			'Position-bound id correction did not produce a valid multipart merge.',
			...correctedMerge.issues
		]);
	}
	const candidate = normalizeGeneratedChallengeBatch(correctedMerge.candidate);
	issues.push(...validateRecoveredCandidate(candidate, expectedInputs));
	if (issues.length) return failed(issues);

	const source = {
		multipartSummarySha256: canonicalHash(input.summary),
		rootEventLogSha256: sha256(input.eventLogBytes),
		rootLastMessageSha256: sha256(input.lastMessageBytes),
		orchestrationPromptSha256: sha256(input.promptBytes),
		expectedInputSha256: input.expectedInputSha256,
		expectedInputsSha256: canonicalHash(input.expectedInputs),
		expectedPartPromptsSha256: canonicalHash(input.expectedPartPrompts),
		expectedResponseJsonSchemaSha256: canonicalHash(input.expectedResponseJsonSchema),
		partOutputsSha256: canonicalHash(sourcePartHashes),
		parts: sourcePartHashes
	};
	const corrections = correctionResult.corrections.map((correction) => {
		const recoveredChallenge = candidate.challenges[correction.absoluteRowIndex] ?? null;
		return {
			...correction,
			recoveredChallengeSha256: canonicalHash(recoveredChallenge)
		};
	});
	return {
		status: 'passed',
		issues: [],
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SCHEMA,
		pathway: SCIENCE_CHALLENGE_FAILED_MERGE_PLAN_SALVAGE_PATHWAY,
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		source,
		corrections,
		candidate,
		candidateSha256: canonicalHash(candidate)
	};
}

/**
 * Recover a complete model-policy-valid multipart candidate only when its persisted deterministic
 * validation failed on one or more exact plan-bound definition.difficulty mismatches and nothing
 * else. The source model candidate and failed validation remain immutable.
 */
export function salvageScienceChallengeMergedCandidatePlanDifficultyDrift(input) {
	const policy = validateScienceChallengeDirectMultipartRunPolicy(input);
	if (policy.status !== 'passed' || policy.issues.length > 0 || !policy.candidate) {
		return failed([
			'Merged-candidate difficulty salvage requires an exact successful multipart policy replay.',
			...policy.issues
		]);
	}
	const sourceCandidate = input?.sourceCandidate;
	const sourceValidation = input?.sourceValidation;
	const expectedInputs = input?.expectedInputs;
	if (
		!sourceCandidate ||
		typeof sourceCandidate !== 'object' ||
		Array.isArray(sourceCandidate) ||
		!Array.isArray(expectedInputs) ||
		sourceValidation?.status !== 'failed'
	) {
		return failed(
			'Merged-candidate difficulty salvage requires the immutable candidate and failed validation.'
		);
	}
	let rawCandidate;
	try {
		rawCandidate = JSON.parse(input.lastMessageBytes.toString('utf8'));
	} catch {
		return failed('Merged multipart last message is not valid JSON.');
	}
	const normalizedRawCandidate = normalizeGeneratedChallengeBatch(rawCandidate);
	if (
		canonicalHash(policy.candidate) !== canonicalHash(rawCandidate) ||
		canonicalHash(sourceCandidate) !== canonicalHash(normalizedRawCandidate) ||
		sourceValidation.rawCandidateSha256 !== canonicalHash(rawCandidate) ||
		sourceValidation.candidateSha256 !== canonicalHash(sourceCandidate)
	) {
		return failed(
			'Merged-candidate difficulty salvage source candidate is not bound to the exact multipart output.'
		);
	}
	const issueRows = exactDifficultyIssueRows(sourceValidation.issues, expectedInputs);
	if (issueRows.status !== 'passed') return issueRows;
	const candidate = structuredClone(sourceCandidate);
	const corrections = [];
	for (const { id, index } of issueRows.rows) {
		const sourceChallenge = sourceCandidate.challenges?.[index];
		const recoveredChallenge = candidate.challenges?.[index];
		const expectedDifficulty = expectedInputs[index]?.plan?.difficulty;
		const observedDifficulty = sourceChallenge?.definition?.difficulty;
		if (
			sourceChallenge?.definition?.id !== id ||
			typeof observedDifficulty !== 'string' ||
			typeof expectedDifficulty !== 'string' ||
			!expectedDifficulty ||
			observedDifficulty === expectedDifficulty
		) {
			return failed(`${id} has no exact position-bound difficulty restoration.`);
		}
		recoveredChallenge.definition.difficulty = expectedDifficulty;
		corrections.push({
			kind: 'definition.difficulty',
			path: `challenges[${index}].definition.difficulty`,
			absoluteRowIndex: index,
			from: observedDifficulty,
			to: expectedDifficulty,
			sourceChallengeSha256: canonicalHash(sourceChallenge),
			recoveredChallengeSha256: canonicalHash(recoveredChallenge)
		});
	}
	const restoredSource = structuredClone(candidate);
	for (const correction of corrections) {
		restoredSource.challenges[correction.absoluteRowIndex].definition.difficulty = correction.from;
	}
	if (canonicalHash(restoredSource) !== canonicalHash(sourceCandidate)) {
		return failed('Difficulty restoration changes fields beyond its exact manifest.');
	}
	const validationIssues = validateRecoveredCandidate(candidate, expectedInputs);
	if (validationIssues.length) return failed(validationIssues);
	const source = {
		multipartSummarySha256: canonicalHash(input.summary),
		sourceValidationSha256: canonicalHash(sourceValidation),
		sourceCandidateSha256: canonicalHash(sourceCandidate),
		rawMergedCandidateSha256: canonicalHash(rawCandidate),
		rootEventLogSha256: sha256(input.eventLogBytes),
		rootLastMessageSha256: sha256(input.lastMessageBytes),
		orchestrationPromptSha256: sha256(input.promptBytes),
		expectedInputSha256: input.expectedInputSha256,
		expectedInputsSha256: canonicalHash(expectedInputs),
		expectedPartPromptsSha256: canonicalHash(input.expectedPartPrompts),
		expectedResponseJsonSchemaSha256: canonicalHash(input.expectedResponseJsonSchema),
		partOutputsSha256: canonicalHash(
			input.multipartEvidence.parts.map((part) => ({
				partId: part.record.partId,
				rawOutputSha256: sha256(part.lastMessageBytes),
				rawCandidateSha256: canonicalHash(JSON.parse(part.lastMessageBytes.toString('utf8')))
			}))
		)
	};
	return {
		status: 'passed',
		issues: [],
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SCHEMA,
		pathway: SCIENCE_CHALLENGE_MERGED_DIFFICULTY_SALVAGE_PATHWAY,
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		source,
		corrections,
		candidate,
		candidateSha256: canonicalHash(candidate)
	};
}

/**
 * Recover a complete multipart response only when its final raw prompt-JSON part failed local
 * schema validation solely because one or more required nullable definition.questionPresentation
 * keys were omitted. No other schema default is permitted.
 */
export function salvageScienceChallengeQuestionPresentationNullDefaults(input) {
	const expectedInputs = input?.expectedInputs;
	let parts;
	try {
		parts = buildScienceChallengeAuthoringParts({
			rows: Array.isArray(expectedInputs)
				? expectedInputs.map((entry) => ({ id: entry?.plan?.id }))
				: null,
			inputs: expectedInputs,
			partSize: input?.summary?.partSize
		});
	} catch (error) {
		return failed(error instanceof Error ? error.message : String(error));
	}
	const evidenceParts = input?.multipartEvidence?.parts;
	if (
		!Array.isArray(evidenceParts) ||
		evidenceParts.length !== parts.length ||
		!Array.isArray(input?.summary?.parts) ||
		input.summary.parts.length !== parts.length
	) {
		return failed(
			'Question-presentation default salvage requires every exact ordered multipart output.'
		);
	}
	const batches = [];
	const correctedBatches = [];
	const corrections = [];
	const failedPartIndices = [];
	const sourcePartHashes = [];
	let absoluteOffset = 0;
	for (const [partIndex, part] of parts.entries()) {
		const evidence = evidenceParts[partIndex];
		if (!evidence || !Buffer.isBuffer(evidence.lastMessageBytes)) {
			return failed(`${part.partId} has no immutable raw-output bytes.`);
		}
		let batch;
		try {
			batch = JSON.parse(evidence.lastMessageBytes.toString('utf8'));
		} catch {
			return failed(`${part.partId} raw output is not valid JSON.`);
		}
		if (!Array.isArray(batch?.challenges) || batch.challenges.length !== part.rowIds.length) {
			return failed(`${part.partId} has a non-canonical batch shape.`);
		}
		batches.push(batch);
		const correctedBatch = structuredClone(batch);
		const localOmissions = parseQuestionPresentationOmissionError(evidence.summary?.error, {
			partId: part.partId,
			challengeCount: part.rowIds.length
		});
		if (evidence.summary?.status === 'failed') {
			if (localOmissions.status !== 'passed') return localOmissions;
			failedPartIndices.push(partIndex);
			for (const localIndex of localOmissions.indices) {
				const sourceChallenge = batch.challenges[localIndex];
				if (
					!sourceChallenge?.definition ||
					Object.prototype.hasOwnProperty.call(sourceChallenge.definition, 'questionPresentation')
				) {
					return failed(
						`${part.partId} challenges[${localIndex}] does not have the exact omitted nullable field.`
					);
				}
				correctedBatch.challenges[localIndex].definition.questionPresentation = null;
				corrections.push({
					kind: 'definition.questionPresentation',
					path: `challenges[${absoluteOffset + localIndex}].definition.questionPresentation`,
					partId: part.partId,
					rowIndex: localIndex + 1,
					absoluteRowIndex: absoluteOffset + localIndex,
					from: 'omitted',
					to: null,
					sourceChallengeSha256: canonicalHash(sourceChallenge),
					recoveredRawChallengeSha256: canonicalHash(correctedBatch.challenges[localIndex])
				});
			}
		} else if (evidence.summary?.status !== 'passed' || evidence.summary?.error !== null) {
			return failed(`${part.partId} has a non-permitted transport status.`);
		} else if (localOmissions.status === 'passed') {
			return failed(`${part.partId} claims omission errors despite a passed part summary.`);
		}
		correctedBatches.push(correctedBatch);
		sourcePartHashes.push({
			partId: part.partId,
			rawOutputSha256: sha256(evidence.lastMessageBytes),
			rawCandidateSha256: canonicalHash(batch)
		});
		absoluteOffset += part.rowIds.length;
	}
	if (
		failedPartIndices.length !== 1 ||
		failedPartIndices[0] !== parts.length - 1 ||
		corrections.length < 1
	) {
		return failed(
			'Question-presentation default salvage requires omissions only in the complete final part.'
		);
	}
	const restoredBatches = structuredClone(correctedBatches);
	for (const correction of corrections) {
		const partIndex = parts.findIndex((part) => part.partId === correction.partId);
		delete restoredBatches[partIndex].challenges[correction.rowIndex - 1].definition
			.questionPresentation;
	}
	if (canonicalHash(restoredBatches) !== canonicalHash(batches)) {
		return failed('Question-presentation defaults change raw fields beyond their exact manifest.');
	}
	const rootError = evidenceParts[failedPartIndices[0]].summary.error;
	if (
		input?.summary?.status !== 'failed' ||
		input.summary.error !== rootError ||
		input.summary.mergedCandidateSha256 !== null
	) {
		return failed(
			'Question-presentation default salvage root summary is not bound solely to the local schema omission.'
		);
	}
	const policy = validateScienceChallengeDirectMultipartRunPolicy(input);
	const failedPartId = parts[failedPartIndices[0]].partId;
	const expectedPolicyIssues = [
		'multipart run summary does not describe a successful required model run.',
		'multipart run summary has invalid complete part counts.',
		`multipart ${failedPartId}: prompt-JSON run summary does not describe the exact successful transport.`,
		`multipart ${failedPartId}: prompt-JSON result metadata has invalid transport/provider/local-validation evidence.`,
		`multipart ${failedPartId}: prompt-JSON result metadata does not bind output/thought/value evidence.`,
		`multipart ${failedPartId} record differs from its direct run summary or raw output.`,
		'multipart merged last message is not valid JSON.',
		'multipart merged candidate differs from its exact ordered part outputs.',
		'multipart composite event index differs from ordered part evidence.'
	];
	if (
		canonicalHash([...policy.issues].sort(compareCodePoints)) !==
		canonicalHash(expectedPolicyIssues.sort(compareCodePoints))
	) {
		return failed([
			'Immutable multipart evidence has defects beyond nullable question-presentation omissions.',
			...policy.issues
		]);
	}
	const correctedMerge = mergeScienceChallengeAuthoringPartBatches({
		parts,
		batches: correctedBatches
	});
	if (correctedMerge.status !== 'passed' || !correctedMerge.candidate) {
		return failed([
			'Question-presentation defaults did not produce a valid multipart merge.',
			...correctedMerge.issues
		]);
	}
	const candidate = normalizeGeneratedChallengeBatch(correctedMerge.candidate);
	const validationIssues = validateRecoveredCandidate(candidate, expectedInputs);
	if (validationIssues.length) return failed(validationIssues);
	const source = {
		multipartSummarySha256: canonicalHash(input.summary),
		rootEventLogSha256: sha256(input.eventLogBytes),
		rootLastMessageSha256: sha256(input.lastMessageBytes),
		orchestrationPromptSha256: sha256(input.promptBytes),
		expectedInputSha256: input.expectedInputSha256,
		expectedInputsSha256: canonicalHash(expectedInputs),
		expectedPartPromptsSha256: canonicalHash(input.expectedPartPrompts),
		expectedResponseJsonSchemaSha256: canonicalHash(input.expectedResponseJsonSchema),
		partOutputsSha256: canonicalHash(sourcePartHashes),
		parts: sourcePartHashes
	};
	return {
		status: 'passed',
		issues: [],
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_PLAN_SALVAGE_SCHEMA,
		pathway: SCIENCE_CHALLENGE_QUESTION_PRESENTATION_DEFAULT_SALVAGE_PATHWAY,
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		source,
		corrections,
		candidate,
		candidateSha256: canonicalHash(candidate)
	};
}

/**
 * Replay one immutable prompt-JSON part whose otherwise valid response omitted only the required
 * nullable `definition.questionPresentation` key. This is intentionally narrower than the full
 * multipart helper: it exists so an exhausted multipart attempt can preserve its failed source
 * part and continue only canonical part slots that were never invoked.
 */
export function salvageScienceChallengeQuestionPresentationNullDefaultPart({
	part,
	evidence,
	expectedPrompt
}) {
	const issues = [];
	if (
		!part ||
		!/^part-\d{2}$/.test(String(part.partId)) ||
		!Number.isInteger(part.index) ||
		part.index < 1 ||
		!Array.isArray(part.rowIds) ||
		part.rowIds.length < 1 ||
		typeof expectedPrompt !== 'string' ||
		!expectedPrompt.trim()
	) {
		return failed('Question-presentation part default requires one exact canonical part.');
	}
	if (
		!evidence ||
		!Buffer.isBuffer(evidence.promptBytes) ||
		!Buffer.isBuffer(evidence.requestBytes) ||
		!Buffer.isBuffer(evidence.eventLogBytes) ||
		!Buffer.isBuffer(evidence.lastMessageBytes) ||
		!Buffer.isBuffer(evidence.thoughtsBytes) ||
		!Buffer.isBuffer(evidence.resultMetadataBytes) ||
		!evidence.summary
	) {
		return failed(`${part.partId} has incomplete immutable prompt-JSON evidence.`);
	}
	const expectedPromptBytes = Buffer.from(`${expectedPrompt}\n`);
	if (!evidence.promptBytes.equals(expectedPromptBytes)) {
		return failed(`${part.partId} prompt differs from deterministic reconstruction.`);
	}
	const omissions = parseQuestionPresentationOmissionError(evidence.summary.error, {
		partId: part.partId,
		challengeCount: part.rowIds.length
	});
	if (omissions.status !== 'passed') return omissions;

	let sourceBatch;
	try {
		sourceBatch = JSON.parse(evidence.lastMessageBytes.toString('utf8'));
	} catch {
		return failed(`${part.partId} raw output is not valid JSON.`);
	}
	if (
		sourceBatch?.schemaVersion !== 'science-challenge-batch/v1' ||
		!Array.isArray(sourceBatch.challenges) ||
		sourceBatch.challenges.length !== part.rowIds.length
	) {
		return failed(`${part.partId} raw output has a non-canonical batch shape.`);
	}
	const correctedBatch = structuredClone(sourceBatch);
	const corrections = [];
	for (const localIndex of omissions.indices) {
		const sourceChallenge = sourceBatch.challenges[localIndex];
		if (
			!sourceChallenge?.definition ||
			Object.prototype.hasOwnProperty.call(sourceChallenge.definition, 'questionPresentation')
		) {
			return failed(
				`${part.partId} challenges[${localIndex}] does not have the exact omitted nullable field.`
			);
		}
		correctedBatch.challenges[localIndex].definition.questionPresentation = null;
		corrections.push({
			kind: 'definition.questionPresentation',
			path: `challenges[${localIndex}].definition.questionPresentation`,
			partId: part.partId,
			rowIndex: localIndex + 1,
			from: 'omitted',
			to: null,
			sourceChallengeSha256: canonicalHash(sourceChallenge),
			recoveredRawChallengeSha256: canonicalHash(correctedBatch.challenges[localIndex])
		});
	}
	const restored = structuredClone(correctedBatch);
	for (const correction of corrections) {
		delete restored.challenges[correction.rowIndex - 1].definition.questionPresentation;
	}
	if (canonicalHash(restored) !== canonicalHash(sourceBatch)) {
		return failed(`${part.partId} nullable default changes fields beyond its exact manifest.`);
	}

	const policy = validateScienceChallengeDirectPromptJsonRunPolicy({
		summary: evidence.summary,
		eventLogBytes: evidence.eventLogBytes,
		lastMessageBytes: evidence.lastMessageBytes,
		promptBytes: evidence.promptBytes,
		requestBytes: evidence.requestBytes,
		thoughtsBytes: evidence.thoughtsBytes,
		resultMetadataBytes: evidence.resultMetadataBytes,
		expectedResponseJsonSchema: challengeBatchOutputSchema(part.rowIds.length)
	});
	const expectedPolicyIssues = [
		'prompt-JSON run summary does not describe the exact successful transport.',
		'prompt-JSON result metadata has invalid transport/provider/local-validation evidence.',
		'prompt-JSON result metadata does not bind output/thought/value evidence.'
	];
	if (
		canonicalHash([...policy.issues].sort(compareCodePoints)) !==
		canonicalHash(expectedPolicyIssues.sort(compareCodePoints))
	) {
		issues.push(
			`${part.partId} immutable evidence has defects beyond the nullable question-presentation omission.`,
			...policy.issues
		);
	}
	for (const [index, expectedId] of part.rowIds.entries()) {
		if (correctedBatch.challenges[index]?.definition?.id !== expectedId) {
			issues.push(
				`${part.partId} row ${index + 1} expected ${expectedId}, found ${String(
					correctedBatch.challenges[index]?.definition?.id
				)}.`
			);
		}
	}
	if (issues.length) return failed(issues);
	return {
		status: 'passed',
		issues: [],
		schemaVersion: SCIENCE_CHALLENGE_QUESTION_PRESENTATION_PART_DEFAULT_SCHEMA,
		partId: part.partId,
		source: {
			promptSha256: sha256(evidence.promptBytes),
			requestSha256: sha256(evidence.requestBytes),
			eventLogSha256: sha256(evidence.eventLogBytes),
			rawOutputSha256: sha256(evidence.lastMessageBytes),
			rawCandidateSha256: canonicalHash(sourceBatch),
			thoughtsSha256: sha256(evidence.thoughtsBytes),
			resultMetadataSha256: sha256(evidence.resultMetadataBytes),
			runSummarySha256: canonicalHash(evidence.summary)
		},
		corrections,
		batch: correctedBatch,
		batchSha256: canonicalHash(correctedBatch)
	};
}

function parseQuestionPresentationOmissionError(error, { partId, challengeCount }) {
	const prefix = 'Prompt-JSON local response validation failed: ';
	if (typeof error !== 'string' || !error.startsWith(prefix)) {
		return failed(`${partId} does not contain exact local response-validation evidence.`);
	}
	let rows;
	try {
		rows = JSON.parse(error.slice(prefix.length));
	} catch {
		return failed(`${partId} local response-validation evidence is not JSON.`);
	}
	if (!Array.isArray(rows) || rows.length < 1 || rows.length > challengeCount) {
		return failed(`${partId} has an invalid nullable-field omission count.`);
	}
	const indices = [];
	for (const row of rows) {
		const index = row?.path?.[1];
		const exact =
			row?.code === 'invalid_union' &&
			row?.message === 'Invalid input' &&
			Array.isArray(row.path) &&
			row.path.length === 4 &&
			row.path[0] === 'challenges' &&
			Number.isInteger(index) &&
			index >= 0 &&
			index < challengeCount &&
			row.path[2] === 'definition' &&
			row.path[3] === 'questionPresentation' &&
			Array.isArray(row.errors) &&
			row.errors.length === 2 &&
			canonicalHash(row.errors) ===
				canonicalHash([
					[
						{
							expected: 'null',
							code: 'invalid_type',
							path: [],
							message: 'Invalid input: expected null, received undefined'
						}
					],
					[
						{
							expected: 'object',
							code: 'invalid_type',
							path: [],
							message: 'Invalid input: expected object, received undefined'
						}
					]
				]);
		if (!exact) {
			return failed(`${partId} local response errors include a non-questionPresentation omission.`);
		}
		indices.push(index);
	}
	if (
		new Set(indices).size !== indices.length ||
		canonicalHash(indices) !== canonicalHash([...indices].sort((left, right) => left - right))
	) {
		return failed(`${partId} omission paths must be unique and ordered.`);
	}
	return { status: 'passed', issues: [], indices };
}

function exactDifficultyIssueRows(issues, expectedInputs) {
	if (!Array.isArray(issues) || issues.length < 1 || issues.length > expectedInputs.length) {
		return failed(
			'Merged-candidate difficulty salvage requires a bounded non-empty validation issue set.'
		);
	}
	const expectedIndexById = new Map(expectedInputs.map((entry, index) => [entry?.plan?.id, index]));
	const rows = [];
	for (const issue of issues) {
		const match =
			typeof issue === 'string'
				? issue.match(/^([^:]+): definition\.difficulty differs from the plan row\.$/)
				: null;
		const id = match?.[1];
		if (!id || !expectedIndexById.has(id)) {
			return failed(
				'Merged-candidate difficulty salvage validation issues contain a non-difficulty defect.'
			);
		}
		rows.push({ id, index: expectedIndexById.get(id) });
	}
	if (new Set(rows.map((row) => row.id)).size !== rows.length) {
		return failed('Merged-candidate difficulty salvage validation issues duplicate a row.');
	}
	const ordered = [...rows].sort((left, right) => left.index - right.index);
	if (canonicalHash(rows) !== canonicalHash(ordered)) {
		return failed(
			'Merged-candidate difficulty salvage validation issues do not preserve plan order.'
		);
	}
	return { status: 'passed', issues: [], rows };
}

function correctedBatchesForPlanBoundDrift({ parts, batches, expectedInputs }) {
	const expectedIds = parts.flatMap((part) => part.rowIds);
	const expectedIdSet = new Set(expectedIds);
	const observedIds = [];
	const corrections = [];
	const corrected = structuredClone(batches);
	let absoluteRowIndex = 0;

	for (const [partIndex, part] of parts.entries()) {
		const batch = batches[partIndex];
		if (
			!batch ||
			typeof batch !== 'object' ||
			Array.isArray(batch) ||
			!Array.isArray(batch.challenges) ||
			batch.challenges.length !== part.rowIds.length
		) {
			return failed(`${part.partId} has a non-identity batch shape defect.`);
		}
		for (const [rowIndex, to] of part.rowIds.entries()) {
			const sourceChallenge = batch.challenges[rowIndex];
			const from = sourceChallenge?.definition?.id;
			if (typeof from !== 'string') {
				return failed(`${part.partId} row ${rowIndex + 1} has no string definition.id.`);
			}
			observedIds.push(from);
			if (from !== to) {
				if (expectedIdSet.has(from)) {
					return failed(`${part.partId} row ${rowIndex + 1} uses another position-bound row id.`);
				}
				const distance = conservativeIdDistance(from, to);
				if (distance === null) {
					return failed(`${part.partId} row ${rowIndex + 1} id is not a conservative near-typo.`);
				}
				corrected[partIndex].challenges[rowIndex].definition.id = to;
				corrections.push({
					kind: 'definition.id',
					path: `challenges[${absoluteRowIndex}].definition.id`,
					partId: part.partId,
					rowIndex: rowIndex + 1,
					absoluteRowIndex,
					from,
					to,
					editDistance: distance,
					sourceChallengeSha256: canonicalHash(sourceChallenge)
				});
			}
			const expectedDifficulty = expectedInputs[absoluteRowIndex]?.plan?.difficulty;
			const observedDifficulty = sourceChallenge?.definition?.difficulty;
			if (observedDifficulty !== expectedDifficulty) {
				if (
					typeof observedDifficulty !== 'string' ||
					typeof expectedDifficulty !== 'string' ||
					!expectedDifficulty
				) {
					return failed(
						`${part.partId} row ${rowIndex + 1} has no exact plan-bound difficulty restoration.`
					);
				}
				corrected[partIndex].challenges[rowIndex].definition.difficulty = expectedDifficulty;
				corrections.push({
					kind: 'definition.difficulty',
					path: `challenges[${absoluteRowIndex}].definition.difficulty`,
					partId: part.partId,
					rowIndex: rowIndex + 1,
					absoluteRowIndex,
					from: observedDifficulty,
					to: expectedDifficulty,
					sourceChallengeSha256: canonicalHash(sourceChallenge)
				});
			}
			absoluteRowIndex += 1;
		}
	}
	if (new Set(observedIds).size !== observedIds.length) {
		return failed('Observed multipart challenge ids contain a collision.');
	}
	const idCorrections = corrections.filter((correction) => correction.kind === 'definition.id');
	const difficultyCorrections = corrections.filter(
		(correction) => correction.kind === 'definition.difficulty'
	);
	if (idCorrections.length !== 1 || difficultyCorrections.length !== 1) {
		return failed(
			'Plan salvage requires exactly one position-bound id correction and one difficulty restoration.'
		);
	}
	const correctedIds = corrected.flatMap((batch) =>
		batch.challenges.map((challenge) => challenge?.definition?.id)
	);
	if (
		new Set(correctedIds).size !== correctedIds.length ||
		canonicalHash(correctedIds) !== canonicalHash(expectedIds)
	) {
		return failed('Corrected multipart challenge ids collide or cross row boundaries.');
	}
	return { status: 'passed', issues: [], batches: corrected, corrections };
}

function conservativeIdDistance(from, to) {
	if (
		from.length < MIN_ID_LENGTH ||
		to.length < MIN_ID_LENGTH ||
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(from) ||
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(to)
	) {
		return null;
	}
	const fromSegments = from.split('-');
	const toSegments = to.split('-');
	if (
		fromSegments[0] !== toSegments[0] ||
		fromSegments.at(-1) !== toSegments.at(-1) ||
		Math.abs(from.length - to.length) > MAX_ID_EDIT_DISTANCE
	) {
		return null;
	}
	const distance = boundedLevenshtein(from, to, MAX_ID_EDIT_DISTANCE);
	return distance <= MAX_ID_EDIT_DISTANCE ? distance : null;
}

function boundedLevenshtein(left, right, limit) {
	let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
		const current = [leftIndex];
		let rowMinimum = current[0];
		for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
			const substitution =
				previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
			const value = Math.min(previous[rightIndex] + 1, current[rightIndex - 1] + 1, substitution);
			current.push(value);
			rowMinimum = Math.min(rowMinimum, value);
		}
		if (rowMinimum > limit) return limit + 1;
		previous = current;
	}
	return previous[right.length];
}

function validateRecoveredCandidate(candidate, expectedInputs) {
	const issues = [];
	if (
		!Array.isArray(candidate?.challenges) ||
		candidate.challenges.length !== expectedInputs.length
	) {
		return ['Recovered candidate does not preserve exact row membership.'];
	}
	for (const [index, challenge] of candidate.challenges.entries()) {
		const expected = expectedInputs[index];
		const result = validateGeneratedChallenge(challenge, {
			planRow: expected.plan,
			sourceQuestion: {
				id: expected.calibrationEvidence?.id,
				contentSha256: expected.calibrationEvidence?.contentSha256
			},
			curriculum: {
				id: expected.curriculum?.componentId,
				specificationId: expected.curriculum?.specificationId,
				specificationSha256: expected.curriculum?.specificationSha256
			}
		});
		issues.push(
			...result.issues.map((issue) => `${expected.plan.id}: recovered candidate ${issue}`)
		);
		issues.push(...answerPositionIssues(challenge.definition, expected.plan, expected.plan.id));
	}
	issues.push(...validateGeneratedChallengeCollection(candidate.challenges).issues);
	return issues;
}

function answerPositionIssues(definition, plan, id) {
	const expected = plan?.expectedAnswerPositions;
	if (!expected || typeof expected !== 'object') {
		return [`${id}: expected answer-position binding is missing.`];
	}
	const issues = [];
	if (definition?.strongerAnswer !== expected.strongerAnswer) {
		issues.push(`${id}: stronger-answer position differs from the bound input.`);
	}
	for (const [field, expectedIndex] of [
		['diagnosisChoices', expected.diagnosisCorrectIndex],
		['repairChoices', expected.repairCorrectIndex],
		['transferChoices', expected.transferCorrectIndex]
	]) {
		const correctIndices = Array.isArray(definition?.[field])
			? definition[field]
					.map((choice, index) => (choice?.correct === true ? index : -1))
					.filter((index) => index >= 0)
			: [];
		if (canonicalHash(correctIndices) !== canonicalHash([expectedIndex])) {
			issues.push(`${id}: ${field} correct position differs from the bound input.`);
		}
	}
	return issues;
}

function compareCodePoints(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

function failed(value) {
	const issues = Array.isArray(value) ? value : [value];
	return { status: 'failed', issues, candidate: null, corrections: [] };
}
