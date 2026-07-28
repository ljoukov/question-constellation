import {
	buildScienceChallengeAuthoringParts,
	mergeScienceChallengeAuthoringPartBatches
} from './science-challenge-authoring-parts.mjs';
import {
	validateScienceChallengeDirectMultipartRunPolicy
} from './science-challenge-authoring-run-policy.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	canonicalHash,
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
