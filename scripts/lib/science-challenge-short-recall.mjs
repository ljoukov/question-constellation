import { canonicalHash, stableStringify } from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION =
	'science-challenge-short-recall-pipeline/v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION = 'generated-science-short-recall-v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_BATCH_SCHEMA =
	'science-challenge-short-recall-authoring-batch/v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_BATCH_SCHEMA =
	'science-challenge-short-recall-review-batch/v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_EVIDENCE_SCHEMA =
	'science-challenge-short-recall-authoring-evidence/v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_EVIDENCE_SCHEMA =
	'science-challenge-short-recall-review-evidence/v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_RUN_MANIFEST_SCHEMA =
	'science-challenge-short-recall-run-manifest/v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_INPUT_SCHEMA =
	'science-challenge-short-recall-batch-input/v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_ACCEPTED_SUBSET_SCHEMA =
	'science-challenge-accepted-subset/v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_RELEASE_ID = 'science-179-v1';
export const SCIENCE_CHALLENGE_SHORT_RECALL_REVIEWED_COUNT = 408;
export const SCIENCE_CHALLENGE_SHORT_RECALL_EXPECTED_COUNT = 179;
export const SCIENCE_CHALLENGE_SHORT_RECALL_REJECTED_COUNT =
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEWED_COUNT - SCIENCE_CHALLENGE_SHORT_RECALL_EXPECTED_COUNT;
export const SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE = 8;
export const SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_COUNT = Math.ceil(
	SCIENCE_CHALLENGE_SHORT_RECALL_EXPECTED_COUNT / SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE
);
export const SCIENCE_CHALLENGE_SHORT_RECALL_REVIEWED_CANDIDATE_SET_SHA256 =
	'a952fb3eaeea0a17ead1e14c8f47d1fdfe040185d13015f6ab3c458bf2a99202';
export const SCIENCE_CHALLENGE_SHORT_RECALL_ACCEPTED_CANDIDATE_SET_SHA256 =
	'e8d5366939295208d1f56eb6b2c64f7d71cb015989d2cd65614434512a582eba';
export const SCIENCE_CHALLENGE_SHORT_RECALL_ACCEPTED_ID_SET_SHA256 =
	'b63211399bbed340786c2d8642108bc48c0a26abcb01dd3bcd4c65801227cbfa';
export const SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_SET_SHA256 =
	'e391880a8f35e447f2574e1b00c25b0336957b7fcbafa9f720e7f5ad7063175c';
export const SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS = 4;
export const SCIENCE_CHALLENGE_SHORT_RECALL_MODEL = 'chatgpt-gpt-5.6-sol';
export const SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING = 'high';
export const SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING = 'max';

export const SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES = Object.freeze([
	'questionSpecific',
	'scientificallyCorrect',
	'blankContract',
	'answerContract',
	'aliasesComplete',
	'hiddenStepAppropriate',
	'unambiguous',
	'nonGeneric',
	'noDuplicate',
	'noLeak',
	'd1Safe'
]);

const MEMORY_HANDLE_SEPARATOR = /\s*(?:→|⟶)\s*/u;
const SAFE_CHALLENGE_ID = /^[a-z0-9][a-z0-9-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TERMINAL_PUNCTUATION = /[.!?]$/u;
const UNDERSCORE_RUN = /_+/gu;
const GENERIC_STEM_PATTERNS = [
	/^(?:complete|fill in|fill|type|enter|write|supply)\b.*___/iu,
	/^(?:the\s+)?(?:missing|correct)\s+(?:word|term|answer)\b/iu,
	/^(?:the\s+)?answer\s+(?:is|should be)\s+___/iu,
	/^___\s+(?:is|are|means|goes here)[.!?]?$/iu
];
const PATH_OR_USER_LEAKS = [
	/(?:^|[\s"'(])\/Users\/[^/\s]+(?:\/|$)/u,
	/(?:^|[\s"'(])\/home\/[^/\s]+(?:\/|$)/u,
	/(?:^|[\s"'(])\/(?!\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._~@+-]+)+/u,
	/\b[A-Za-z]:\\Users\\[^\\\s]+\\/u,
	/\bfile:\/\//iu,
	/(?:^|[\s"'(])(?:\.{0,2}\/)?tmp\/[^\s"')]+/iu
];
const FUNCTION_WORDS = new Set([
	'a',
	'all',
	'an',
	'and',
	'another',
	'any',
	'are',
	'as',
	'at',
	'be',
	'been',
	'being',
	'both',
	'but',
	'by',
	'can',
	'could',
	'did',
	'do',
	'does',
	'each',
	'either',
	'every',
	'for',
	'from',
	'had',
	'has',
	'have',
	'how',
	'if',
	'in',
	'is',
	'it',
	'its',
	'least',
	'less',
	'many',
	'may',
	'might',
	'more',
	'most',
	'must',
	'neither',
	'no',
	'not',
	'of',
	'on',
	'or',
	'other',
	'should',
	'some',
	'than',
	'that',
	'the',
	'then',
	'these',
	'this',
	'those',
	'to',
	'was',
	'were',
	'what',
	'when',
	'where',
	'which',
	'who',
	'why',
	'will',
	'with',
	'would',
	'yes'
]);
const STEM_STOP_WORDS = new Set([
	...FUNCTION_WORDS,
	'answer',
	'blank',
	'correct',
	'given',
	'missing',
	'term',
	'word'
]);
const REVIEW_ISSUE_CATEGORIES = new Set([
	'science',
	'stem',
	'answer',
	'alias',
	'hidden-step',
	'ambiguity',
	'duplication',
	'privacy',
	'storage',
	'format'
]);

export function readScienceChallengeShortRecallCandidateSet(
	value,
	{ expectedCount = SCIENCE_CHALLENGE_SHORT_RECALL_EXPECTED_COUNT } = {}
) {
	const entries = Array.isArray(value)
		? value
		: Array.isArray(value?.challenges)
			? value.challenges
			: null;
	if (!entries) {
		throw new Error(
			'Short-recall candidate input must be a JSON array or an object with a challenges array.'
		);
	}
	if (entries.length !== expectedCount) {
		throw new Error(
			`Short-recall candidate input must contain exactly ${expectedCount} challenges; found ${entries.length}.`
		);
	}

	const ids = new Set();
	const rows = entries.map((entry, index) => {
		const definition = candidateDefinition(entry);
		const challengeId = definition?.id;
		if (
			typeof challengeId !== 'string' ||
			!SAFE_CHALLENGE_ID.test(challengeId) ||
			challengeId.length < 3 ||
			challengeId.length > 160
		) {
			throw new Error(`Short-recall candidate ${index + 1} has an unsafe challenge id.`);
		}
		if (ids.has(challengeId)) {
			throw new Error(`Short-recall candidate id is duplicated: ${challengeId}.`);
		}
		ids.add(challengeId);
		const memorySteps = memoryHandleSteps(definition.memoryHandle, { challengeId });
		requireCandidateAuthoringContext(definition, challengeId);
		requireLeakSafeCandidateSources(entry, definition, challengeId);
		return {
			index,
			challengeId,
			candidateSha256: canonicalHash(entry),
			entry,
			definition,
			memorySteps,
			authoringContext: buildAuthoringContext(entry, definition, memorySteps)
		};
	});

	return {
		sourceArtifactSha256: canonicalHash(value),
		candidateSetSha256: canonicalHash(entries),
		entries,
		rows
	};
}

/**
 * Production authoring and review accept only the authenticated science-179-v1 projection.
 * Small bare arrays remain supported by the generic reader and the explicit test entry points.
 */
export function readAuthenticatedScienceChallengeShortRecallCandidateSet(value) {
	if (!isRecord(value) || Array.isArray(value)) {
		throw new Error(
			'Release short-recall input must be an authenticated accepted-subset object, not a bare candidate array.'
		);
	}
	if (value.schemaVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_ACCEPTED_SUBSET_SCHEMA) {
		throw new Error(
			`Release short-recall input must use ${SCIENCE_CHALLENGE_SHORT_RECALL_ACCEPTED_SUBSET_SCHEMA}.`
		);
	}
	if (value.releaseId !== SCIENCE_CHALLENGE_SHORT_RECALL_RELEASE_ID) {
		throw new Error(
			`Release short-recall input must target ${SCIENCE_CHALLENGE_SHORT_RECALL_RELEASE_ID}.`
		);
	}
	if (!isRecord(value.selection) && !isRecord(value.evidence)) {
		throw new Error('Release short-recall input must include accepted-subset selection evidence.');
	}

	const candidateSet = readScienceChallengeShortRecallCandidateSet(value, {
		expectedCount: SCIENCE_CHALLENGE_SHORT_RECALL_EXPECTED_COUNT
	});
	if (
		candidateSet.candidateSetSha256 !== SCIENCE_CHALLENGE_SHORT_RECALL_ACCEPTED_CANDIDATE_SET_SHA256
	) {
		throw new Error(
			'Release short-recall candidates differ from the pinned accepted candidate set.'
		);
	}
	const acceptedIdsSha256 = canonicalHash(
		candidateSet.rows.map((candidate) => candidate.challengeId)
	);
	if (acceptedIdsSha256 !== SCIENCE_CHALLENGE_SHORT_RECALL_ACCEPTED_ID_SET_SHA256) {
		throw new Error(
			'Release short-recall candidate order differs from the pinned accepted selection.'
		);
	}

	const authenticationSources = acceptedSubsetAuthenticationSources(value);
	requireAcceptedSubsetBinding(authenticationSources, {
		label: 'reviewed count',
		keys: ['reviewedCount', 'reviewCount', 'reviewed'],
		expected: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEWED_COUNT
	});
	requireAcceptedSubsetBinding(authenticationSources, {
		label: 'accepted count',
		keys: ['acceptedCount', 'accepted'],
		expected: SCIENCE_CHALLENGE_SHORT_RECALL_EXPECTED_COUNT
	});
	requireAcceptedSubsetBinding(authenticationSources, {
		label: 'rejected count',
		keys: ['rejectedCount', 'rejected'],
		expected: SCIENCE_CHALLENGE_SHORT_RECALL_REJECTED_COUNT
	});
	requireAcceptedSubsetBinding(authenticationSources, {
		label: 'reviewed candidate-set hash',
		keys: [
			'reviewedCandidateSetSha256',
			'fullCandidateSetSha256',
			'sourceCandidateSetSha256',
			'b0CandidateSetSha256'
		],
		expected: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEWED_CANDIDATE_SET_SHA256
	});
	requireAcceptedSubsetBinding(authenticationSources, {
		label: 'accepted candidate-set hash',
		keys: ['acceptedCandidateSetSha256', 'candidateSetSha256'],
		expected: SCIENCE_CHALLENGE_SHORT_RECALL_ACCEPTED_CANDIDATE_SET_SHA256
	});
	requireAcceptedSubsetBinding(authenticationSources, {
		label: 'accepted id-set hash',
		keys: [
			'acceptedIdSetSha256',
			'acceptedIdsSha256',
			'acceptedSelectionSha256',
			'selectionSha256'
		],
		expected: SCIENCE_CHALLENGE_SHORT_RECALL_ACCEPTED_ID_SET_SHA256
	});
	requireAcceptedSubsetBinding(authenticationSources, {
		label: 'review-set hash',
		keys: ['reviewSetSha256', 'reviewRowsSha256', 'reviewsSha256'],
		expected: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_SET_SHA256
	});
	return candidateSet;
}

export function memoryHandleSteps(memoryHandle, { challengeId = 'candidate' } = {}) {
	if (typeof memoryHandle !== 'string' || !memoryHandle.trim()) {
		throw new Error(`Short-recall memory handle is missing for ${challengeId}.`);
	}
	const rawSteps = memoryHandle.split(MEMORY_HANDLE_SEPARATOR);
	const steps = rawSteps.map((step) => step.trim());
	if (steps.length < 3 || steps.length > 5 || steps.some((step) => !step || step.length > 160)) {
		throw new Error(
			`Short-recall memory handle for ${challengeId} must contain 3-5 non-empty concise steps.`
		);
	}
	return steps;
}

export function buildScienceChallengeShortRecallBatches(
	candidateSet,
	{ batchSize = SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE } = {}
) {
	if (!candidateSet || !Array.isArray(candidateSet.rows)) {
		throw new Error('Short-recall batching requires a validated candidate set.');
	}
	if (!Number.isInteger(batchSize) || batchSize < 1) {
		throw new Error('Short-recall batch size must be a positive integer.');
	}
	return Array.from(
		{ length: Math.ceil(candidateSet.rows.length / batchSize) },
		(_unused, index) => {
			const start = index * batchSize;
			const rows = candidateSet.rows.slice(start, start + batchSize);
			return {
				batchId: `short-recall-${String(index + 1).padStart(3, '0')}`,
				index: index + 1,
				start,
				end: start + rows.length,
				rows
			};
		}
	);
}

export function buildScienceChallengeShortRecallAuthoringBatchInput({
	candidateSet,
	batch,
	priorPromptById = null,
	reviewById = null
}) {
	const repair = priorPromptById instanceof Map || reviewById instanceof Map;
	if (repair && (!(priorPromptById instanceof Map) || !(reviewById instanceof Map))) {
		throw new Error('Short-recall repair requires both prior prompts and review rows.');
	}
	const sourceRows = repair
		? batch.rows.filter((row) => reviewById.get(row.challengeId)?.accepted === false)
		: batch.rows;
	if (sourceRows.length === 0) return null;
	const envelope = {
		schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_INPUT_SCHEMA,
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		mode: repair ? 'repair' : 'author',
		batchId: batch.batchId,
		candidateSetSha256: candidateSet.candidateSetSha256,
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
		rows: sourceRows.map((row) => ({
			position: row.index,
			challengeId: row.challengeId,
			candidateSha256: row.candidateSha256,
			candidate: row.authoringContext,
			...(repair
				? {
						priorPrompt: priorPromptById.get(row.challengeId),
						reviewIssues: reviewById.get(row.challengeId).issues
					}
				: {})
		}))
	};
	return {
		...envelope,
		batchInputSha256: canonicalHash(envelope)
	};
}

export function buildScienceChallengeShortRecallAuthoringPrompt(batchInput, retry = null) {
	const repair = batchInput?.mode === 'repair';
	const retrySection =
		retry && Array.isArray(retry.issues) && retry.issues.length > 0
			? `

RETRY EVIDENCE
The previous immutable attempt failed these gates. Return a complete corrected batch; do not discuss
the failure:
${stableStringify(retry, 2)}`
			: '';
	return `You are authoring a reviewed offline GCSE Science short-recall beat.

Use only the supplied challenge content. Return exactly one prompt for every supplied row, in the
same order. Copy batchId, batchInputSha256, challengeId and candidateSha256 exactly.

AUTHORING CONTRACT
- Write a genuinely question-specific retrieval stem, not a mechanical fragment of memoryHandle.
- The stem must contain exactly one standalone literal ___, no other underscore run, and finish with
  normal sentence punctuation.
- The missing completion must have exactly one scientifically defensible answer in this context.
- canonicalAnswer must be one or two ordinary answer words, never a function word.
- acceptedAliases must explicitly list every ordinary interchangeable answer a capable GCSE learner
  should receive credit for. Use [] only when there is genuinely no ordinary alias. Do not list
  misspellings, explanations, leading articles, or the canonical answer again.
- Choose preferredHiddenStepIndex because the recalled fact or move belongs with that displayed
  3-5-step memory handle. It is a display binding, not a command to blank a handle token.
- Use British English. Do not reveal the answer elsewhere in the stem.
- Reject generic completion cues, grammar-only cues, ambiguous completions, internal ids, paths,
  usernames, examiner inventions, or content unsupported by the supplied challenge.
- D1 limits are hard: challengeId 1-160 characters, stem 8-320, each answer 1-80, hidden index 0-31.
- contentVersion must be exactly ${SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION}.
${
	repair
		? '- This is targeted repair. Rewrite only the supplied rejected rows. The caller preserves every accepted row byte-identically.'
		: ''
}

HASH-BOUND INPUT
${stableStringify(batchInput, 2)}${retrySection}`;
}

export function buildScienceChallengeShortRecallReviewBatchInput({
	candidateSet,
	batch,
	promptById,
	promptSetSha256,
	globalPromptIndex
}) {
	const envelope = {
		schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_INPUT_SCHEMA,
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		mode: 'review',
		batchId: batch.batchId,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256,
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
		rows: batch.rows.map((row) => {
			const prompt = promptById.get(row.challengeId);
			return {
				position: row.index,
				challengeId: row.challengeId,
				candidateSha256: row.candidateSha256,
				promptSha256: canonicalHash(prompt),
				candidate: row.authoringContext,
				prompt
			};
		}),
		globalPromptIndex
	};
	return {
		...envelope,
		batchInputSha256: canonicalHash(envelope)
	};
}

export function buildScienceChallengeShortRecallReviewPrompt(batchInput, retry = null) {
	const retrySection =
		retry && Array.isArray(retry.issues) && retry.issues.length > 0
			? `

TRANSPORT RETRY EVIDENCE
The previous immutable response was malformed or broke the output contract. Re-run the complete
independent review; do not repair prompts:
${stableStringify(retry, 2)}`
			: '';
	return `You are the independent final reviewer for offline GCSE Science short-recall prompts.
You did not author these prompts. Review every supplied row from scratch. Do not rewrite a prompt.
Copy all hash and identity fields exactly.

Set each named gate independently:
- questionSpecific: the stem retrieves a concrete fact or scoring move from this exact challenge.
- scientificallyCorrect: the stem, answer and aliases are scientifically correct.
- blankContract: exactly one standalone ___, no other underscore run, natural punctuation, and no
  blank-only or grammar-only cue.
- answerContract: the canonical answer is one or two content words and is not exposed in the stem.
- aliasesComplete: all ordinary interchangeable answers are credited and no non-equivalent form is.
- hiddenStepAppropriate: the index is in range and the recalled knowledge belongs at that handle step.
- unambiguous: the supplied accepted forms exhaust the defensible one/two-word completions.
- nonGeneric: the stem is not reusable filler, a bare definition shell, or a memory-handle projection.
- noDuplicate: it is not an exact or semantic duplicate of another prompt in globalPromptIndex.
- noLeak: there are no internal ids, paths, usernames, private notes, or invented examiner comments.
- d1Safe: all D1 character and index limits are satisfied.

accepted must equal all eleven gates being true and issues being empty. A false gate requires at
least one concrete issue with field, category, evidence and minimal repair. Do not include private
reasoning; include only auditable issue evidence.

HASH-BOUND INPUT
${stableStringify(batchInput, 2)}${retrySection}`;
}

export function scienceChallengeShortRecallAuthoringOutputSchema(expectedCount) {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['schemaVersion', 'batchId', 'batchInputSha256', 'prompts'],
		properties: {
			schemaVersion: {
				type: 'string',
				const: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_BATCH_SCHEMA
			},
			batchId: { type: 'string' },
			batchInputSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
			prompts: {
				type: 'array',
				minItems: expectedCount,
				maxItems: expectedCount,
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'challengeId',
						'candidateSha256',
						'stem',
						'canonicalAnswer',
						'acceptedAliases',
						'preferredHiddenStepIndex',
						'contentVersion'
					],
					properties: {
						challengeId: { type: 'string' },
						candidateSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
						stem: { type: 'string' },
						canonicalAnswer: { type: 'string' },
						acceptedAliases: {
							type: 'array',
							items: { type: 'string' },
							maxItems: 8
						},
						preferredHiddenStepIndex: { type: 'integer', minimum: 0, maximum: 31 },
						contentVersion: {
							type: 'string',
							const: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION
						}
					}
				}
			}
		}
	};
}

export function scienceChallengeShortRecallReviewOutputSchema(expectedCount) {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['schemaVersion', 'batchId', 'batchInputSha256', 'reviews'],
		properties: {
			schemaVersion: {
				type: 'string',
				const: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_BATCH_SCHEMA
			},
			batchId: { type: 'string' },
			batchInputSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
			reviews: {
				type: 'array',
				minItems: expectedCount,
				maxItems: expectedCount,
				items: {
					type: 'object',
					additionalProperties: false,
					required: [
						'challengeId',
						'candidateSha256',
						'promptSha256',
						'accepted',
						'gates',
						'issues'
					],
					properties: {
						challengeId: { type: 'string' },
						candidateSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
						promptSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
						accepted: { type: 'boolean' },
						gates: {
							type: 'object',
							additionalProperties: false,
							required: [...SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES],
							properties: Object.fromEntries(
								SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.map((gate) => [
									gate,
									{ type: 'boolean' }
								])
							)
						},
						issues: {
							type: 'array',
							items: {
								type: 'object',
								additionalProperties: false,
								required: ['field', 'category', 'evidence', 'repair'],
								properties: {
									field: { type: 'string' },
									category: {
										type: 'string',
										enum: [...REVIEW_ISSUE_CATEGORIES]
									},
									evidence: { type: 'string' },
									repair: { type: 'string' }
								}
							}
						}
					}
				}
			}
		}
	};
}

export function validateScienceChallengeShortRecallAuthoringBatch(
	output,
	{ batchInput, candidateRowsById }
) {
	const issues = [];
	if (!isRecord(output))
		return failedIssue('batch', 'format', 'Authoring output must be an object.');
	if (!hasExactKeys(output, ['schemaVersion', 'batchId', 'batchInputSha256', 'prompts'])) {
		issues.push(
			issue(null, '$', 'format', 'Authoring output contains missing or unexpected fields.')
		);
	}
	if (output.schemaVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_BATCH_SCHEMA) {
		issues.push(issue(null, 'schemaVersion', 'format', 'Authoring schemaVersion is invalid.'));
	}
	if (output.batchId !== batchInput.batchId) {
		issues.push(issue(null, 'batchId', 'format', 'Authoring batchId differs from its input.'));
	}
	if (output.batchInputSha256 !== batchInput.batchInputSha256) {
		issues.push(
			issue(null, 'batchInputSha256', 'format', 'Authoring output does not bind its exact input.')
		);
	}
	if (!Array.isArray(output.prompts) || output.prompts.length !== batchInput.rows.length) {
		issues.push(
			issue(
				null,
				'prompts',
				'format',
				`Authoring output must contain exactly ${batchInput.rows.length} prompts.`
			)
		);
		return { status: 'failed', issues, prompts: null };
	}

	const prompts = [];
	const suppliedSourceStrings = [
		batchInput.batchId,
		batchInput.batchInputSha256,
		batchInput.candidateSetSha256,
		...batchInput.rows.flatMap((expected) =>
			suppliedInternalSourceStrings(candidateRowsById.get(expected.challengeId), [
				expected.challengeId,
				expected.candidateSha256
			])
		)
	];
	for (const [index, expected] of batchInput.rows.entries()) {
		const row = output.prompts[index];
		const candidateRow = candidateRowsById.get(expected.challengeId);
		if (!isRecord(row)) {
			issues.push(
				issue(expected.challengeId, `prompts[${index}]`, 'format', 'Prompt must be an object.')
			);
			continue;
		}
		if (
			!hasExactKeys(row, [
				'challengeId',
				'candidateSha256',
				'stem',
				'canonicalAnswer',
				'acceptedAliases',
				'preferredHiddenStepIndex',
				'contentVersion'
			])
		) {
			issues.push(
				issue(
					expected.challengeId,
					`prompts[${index}]`,
					'format',
					'Authoring prompt contains missing or unexpected fields.'
				)
			);
		}
		if (row.challengeId !== expected.challengeId) {
			issues.push(
				issue(
					expected.challengeId,
					`prompts[${index}].challengeId`,
					'format',
					'Prompt order or challengeId differs from the batch input.'
				)
			);
		}
		if (row.candidateSha256 !== expected.candidateSha256) {
			issues.push(
				issue(
					expected.challengeId,
					`prompts[${index}].candidateSha256`,
					'format',
					'Prompt does not bind the exact challenge candidate.'
				)
			);
		}
		const prompt = publicPrompt(row);
		const validation = validateScienceChallengeShortRecallPrompt(prompt, candidateRow, {
			suppliedSourceStrings
		});
		issues.push(...validation.issues);
		prompts.push(prompt);
	}
	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		issues,
		prompts
	};
}

export function validateScienceChallengeShortRecallPrompt(
	prompt,
	candidateRow,
	{ suppliedSourceStrings = [] } = {}
) {
	const challengeId =
		typeof prompt?.challengeId === 'string'
			? prompt.challengeId
			: (candidateRow?.challengeId ?? null);
	const issues = [];
	if (!isRecord(prompt)) {
		return failedIssue(challengeId, 'format', 'Short-recall prompt must be an object.');
	}
	if (
		!hasExactKeys(prompt, [
			'challengeId',
			'stem',
			'canonicalAnswer',
			'acceptedAliases',
			'preferredHiddenStepIndex',
			'contentVersion'
		])
	) {
		issues.push(
			issue(
				challengeId,
				'$',
				'format',
				'Short-recall prompt contains missing or unexpected fields.'
			)
		);
	}
	if (
		typeof prompt.challengeId !== 'string' ||
		!SAFE_CHALLENGE_ID.test(prompt.challengeId) ||
		prompt.challengeId.length > 160 ||
		prompt.challengeId !== candidateRow?.challengeId
	) {
		issues.push(issue(challengeId, 'challengeId', 'format', 'challengeId is missing or unbound.'));
	}
	const stem = prompt.stem;
	if (
		typeof stem !== 'string' ||
		stem !== stem.trim() ||
		stem.length < 8 ||
		stem.length > 320 ||
		/[\r\n]/u.test(stem) ||
		!hasExactlyOneStandaloneBlank(stem)
	) {
		issues.push(
			issue(
				challengeId,
				'stem',
				'storage',
				'Stem must be trimmed, 8-320 characters, and contain exactly one ___.'
			)
		);
	} else {
		const withoutBlank = stem
			.replace('___', ' ')
			.replace(/[^\p{L}\p{N}]+/gu, ' ')
			.trim();
		const tokens = normalizedWords(withoutBlank);
		const contentTokens = tokens.filter((token) => !STEM_STOP_WORDS.has(token));
		if (!withoutBlank || tokens.length < 3 || contentTokens.length < 2) {
			issues.push(
				issue(
					challengeId,
					'stem',
					'stem',
					'Stem is blank-only, grammar-only, or lacks question-specific content.'
				)
			);
		}
		if (!TERMINAL_PUNCTUATION.test(stem)) {
			issues.push(
				issue(challengeId, 'stem', 'stem', 'Stem must finish with normal sentence punctuation.')
			);
		}
		if (GENERIC_STEM_PATTERNS.some((pattern) => pattern.test(stem))) {
			issues.push(
				issue(challengeId, 'stem', 'stem', 'Stem uses a generic fill-the-blank instruction.')
			);
		}
	}

	const canonicalValidation = validateAnswer(prompt.canonicalAnswer, {
		challengeId,
		field: 'canonicalAnswer',
		allowFunctionWord: false
	});
	issues.push(...canonicalValidation.issues);
	if (!Array.isArray(prompt.acceptedAliases) || prompt.acceptedAliases.length > 8) {
		issues.push(
			issue(
				challengeId,
				'acceptedAliases',
				'alias',
				'acceptedAliases must be an explicit array with no more than eight entries.'
			)
		);
	} else {
		const seen = new Set();
		const canonicalNormalized = normalizeScienceChallengeShortRecallAnswer(prompt.canonicalAnswer);
		for (const [index, alias] of prompt.acceptedAliases.entries()) {
			const validation = validateAnswer(alias, {
				challengeId,
				field: `acceptedAliases[${index}]`,
				allowFunctionWord: false
			});
			issues.push(...validation.issues);
			const normalized = normalizeScienceChallengeShortRecallAnswer(alias);
			if (normalized === canonicalNormalized || seen.has(normalized)) {
				issues.push(
					issue(
						challengeId,
						`acceptedAliases[${index}]`,
						'alias',
						'Alias duplicates the canonical answer or another alias.'
					)
				);
			}
			if (normalized) seen.add(normalized);
		}
	}

	if (
		!Number.isInteger(prompt.preferredHiddenStepIndex) ||
		prompt.preferredHiddenStepIndex < 0 ||
		prompt.preferredHiddenStepIndex > 31 ||
		prompt.preferredHiddenStepIndex >= (candidateRow?.memorySteps?.length ?? 0)
	) {
		issues.push(
			issue(
				challengeId,
				'preferredHiddenStepIndex',
				'hidden-step',
				'Hidden step index is outside the candidate memory handle.'
			)
		);
	}
	if (
		typeof prompt.contentVersion !== 'string' ||
		prompt.contentVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION ||
		prompt.contentVersion.length > 80
	) {
		issues.push(
			issue(
				challengeId,
				'contentVersion',
				'storage',
				`contentVersion must be ${SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION}.`
			)
		);
	}

	if (typeof stem === 'string') {
		for (const answer of [
			prompt.canonicalAnswer,
			...(Array.isArray(prompt.acceptedAliases) ? prompt.acceptedAliases : [])
		]) {
			if (answerPhraseAppearsInStem(answer, stem)) {
				issues.push(
					issue(
						challengeId,
						'stem',
						'answer',
						'Stem exposes one of its accepted answers outside the blank.'
					)
				);
			}
		}
	}
	const internalSourceStrings = suppliedInternalSourceStrings(candidateRow, suppliedSourceStrings);
	for (const [field, value] of [
		['stem', prompt.stem],
		['canonicalAnswer', prompt.canonicalAnswer],
		...(Array.isArray(prompt.acceptedAliases)
			? prompt.acceptedAliases.map((value, index) => [`acceptedAliases[${index}]`, value])
			: [])
	]) {
		if (typeof value === 'string' && containsPathOrUserLeak(value)) {
			issues.push(
				issue(challengeId, field, 'privacy', 'Prompt contains a local path or username leak.')
			);
		}
		if (
			typeof value === 'string' &&
			internalSourceStrings.some((sourceString) =>
				containsInternalSourceString(value, sourceString)
			)
		) {
			issues.push(
				issue(
					challengeId,
					field,
					'privacy',
					'Prompt exposes an internal challenge, curriculum, specification, calibration, or source identifier.'
				)
			);
		}
	}
	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		issues,
		prompt
	};
}

export function validateScienceChallengeShortRecallPromptCollection(
	prompts,
	candidateSet,
	{ expectedCount = candidateSet?.rows?.length } = {}
) {
	const issues = [];
	if (!Array.isArray(prompts) || prompts.length !== expectedCount) {
		return {
			status: 'failed',
			issues: [
				issue(
					null,
					'prompts',
					'format',
					`Prompt collection must contain exactly ${expectedCount} rows.`
				)
			],
			prompts: null,
			promptSetSha256: null
		};
	}
	const rowById = new Map(candidateSet.rows.map((row) => [row.challengeId, row]));
	const suppliedSourceStrings = candidateSet.rows.flatMap((row) =>
		suppliedInternalSourceStrings(row, [])
	);
	const seenIds = new Set();
	const stemOwners = new Map();
	for (const [index, prompt] of prompts.entries()) {
		const expected = candidateSet.rows[index];
		if (prompt?.challengeId !== expected?.challengeId) {
			issues.push(
				issue(
					expected?.challengeId ?? null,
					`prompts[${index}].challengeId`,
					'format',
					'Prompt order differs from the exact candidate-set order.'
				)
			);
		}
		if (seenIds.has(prompt?.challengeId)) {
			issues.push(
				issue(
					prompt?.challengeId ?? null,
					'challengeId',
					'duplication',
					'challengeId is duplicated.'
				)
			);
		}
		if (typeof prompt?.challengeId === 'string') seenIds.add(prompt.challengeId);
		const validation = validateScienceChallengeShortRecallPrompt(
			prompt,
			rowById.get(prompt?.challengeId),
			{ suppliedSourceStrings }
		);
		issues.push(...validation.issues);
		if (typeof prompt?.stem === 'string') {
			const stemKey = normalizeScienceChallengeShortRecallStem(prompt.stem);
			const owner = stemOwners.get(stemKey);
			if (owner) {
				issues.push(
					issue(
						prompt.challengeId,
						'stem',
						'duplication',
						`Stem duplicates the normalized prompt for ${owner}.`
					)
				);
				issues.push(
					issue(
						owner,
						'stem',
						'duplication',
						`Stem duplicates the normalized prompt for ${prompt.challengeId}.`
					)
				);
			} else if (stemKey) {
				stemOwners.set(stemKey, prompt.challengeId);
			}
		}
	}
	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		issues,
		prompts,
		promptSetSha256: canonicalHash(prompts)
	};
}

export function validateScienceChallengeShortRecallReviewBatch(
	output,
	{ batchInput, candidateRowsById, promptById }
) {
	const issues = [];
	if (!isRecord(output)) return failedIssue('batch', 'format', 'Review output must be an object.');
	if (!hasExactKeys(output, ['schemaVersion', 'batchId', 'batchInputSha256', 'reviews'])) {
		issues.push(issue(null, '$', 'format', 'Review output contains missing or unexpected fields.'));
	}
	if (output.schemaVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_BATCH_SCHEMA) {
		issues.push(issue(null, 'schemaVersion', 'format', 'Review schemaVersion is invalid.'));
	}
	if (output.batchId !== batchInput.batchId) {
		issues.push(issue(null, 'batchId', 'format', 'Review batchId differs from its input.'));
	}
	if (output.batchInputSha256 !== batchInput.batchInputSha256) {
		issues.push(
			issue(null, 'batchInputSha256', 'format', 'Review output does not bind its exact input.')
		);
	}
	if (!Array.isArray(output.reviews) || output.reviews.length !== batchInput.rows.length) {
		issues.push(
			issue(
				null,
				'reviews',
				'format',
				`Review output must contain exactly ${batchInput.rows.length} rows.`
			)
		);
		return { status: 'failed', issues, reviews: null };
	}
	for (const [index, expected] of batchInput.rows.entries()) {
		const review = output.reviews[index];
		const prefix = `reviews[${index}]`;
		if (!isRecord(review)) {
			issues.push(issue(expected.challengeId, prefix, 'format', 'Review row must be an object.'));
			continue;
		}
		if (
			!hasExactKeys(review, [
				'challengeId',
				'candidateSha256',
				'promptSha256',
				'accepted',
				'gates',
				'issues'
			])
		) {
			issues.push(
				issue(
					expected.challengeId,
					prefix,
					'format',
					'Review row contains missing or unexpected fields.'
				)
			);
		}
		const prompt = promptById.get(expected.challengeId);
		const candidate = candidateRowsById.get(expected.challengeId);
		for (const [field, expectedValue] of [
			['challengeId', expected.challengeId],
			['candidateSha256', candidate?.candidateSha256],
			['promptSha256', canonicalHash(prompt)]
		]) {
			if (review[field] !== expectedValue) {
				issues.push(
					issue(
						expected.challengeId,
						`${prefix}.${field}`,
						'format',
						`${field} differs from the exact review input.`
					)
				);
			}
		}
		if (!isRecord(review.gates)) {
			issues.push(
				issue(expected.challengeId, `${prefix}.gates`, 'format', 'Review gates are missing.')
			);
		} else {
			for (const gate of SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES) {
				if (typeof review.gates[gate] !== 'boolean') {
					issues.push(
						issue(
							expected.challengeId,
							`${prefix}.gates.${gate}`,
							'format',
							'Review gate must be Boolean.'
						)
					);
				}
			}
			const unexpected = Object.keys(review.gates).filter(
				(gate) => !SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.includes(gate)
			);
			if (unexpected.length) {
				issues.push(
					issue(
						expected.challengeId,
						`${prefix}.gates`,
						'format',
						'Review row contains unexpected gates.'
					)
				);
			}
		}
		const rowIssues = Array.isArray(review.issues) ? review.issues : null;
		if (!rowIssues) {
			issues.push(
				issue(expected.challengeId, `${prefix}.issues`, 'format', 'Review issues must be an array.')
			);
		} else {
			for (const [issueIndex, rowIssue] of rowIssues.entries()) {
				if (
					!isRecord(rowIssue) ||
					!hasExactKeys(rowIssue, ['field', 'category', 'evidence', 'repair']) ||
					!nonEmpty(rowIssue.field) ||
					!REVIEW_ISSUE_CATEGORIES.has(rowIssue.category) ||
					!nonEmpty(rowIssue.evidence) ||
					!nonEmpty(rowIssue.repair)
				) {
					issues.push(
						issue(
							expected.challengeId,
							`${prefix}.issues[${issueIndex}]`,
							'format',
							'Review issue is incomplete or has an invalid category.'
						)
					);
				}
			}
		}
		const shouldAccept =
			SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.every((gate) => review.gates?.[gate] === true) &&
			rowIssues?.length === 0;
		if (review.accepted !== shouldAccept) {
			issues.push(
				issue(
					expected.challengeId,
					`${prefix}.accepted`,
					'format',
					'accepted must equal the conjunction of all gates and an empty issue list.'
				)
			);
		}
		if (!shouldAccept && rowIssues?.length === 0) {
			issues.push(
				issue(
					expected.challengeId,
					`${prefix}.issues`,
					'format',
					'A rejected review must include a concrete repair issue.'
				)
			);
		}
	}
	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		issues,
		reviews: output.reviews
	};
}

export function validateScienceChallengeShortRecallRepairEvidence({
	reviewEvidence,
	authoringEvidence,
	priorPrompts,
	candidateSet
}) {
	const issues = [];
	const promptValidation = validateScienceChallengeShortRecallPromptCollection(
		priorPrompts,
		candidateSet
	);
	issues.push(...promptValidation.issues);
	const fullReviewValidation = validateScienceChallengeShortRecallReviewEvidence({
		reviewEvidence,
		authoringEvidence,
		candidateSet,
		prompts: priorPrompts,
		expectedCount: candidateSet.rows.length
	});
	issues.push(...fullReviewValidation.issues);
	if (
		!isRecord(reviewEvidence) ||
		reviewEvidence.schemaVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_EVIDENCE_SCHEMA
	) {
		issues.push(issue(null, 'reviewEvidence', 'format', 'Repair review evidence is invalid.'));
		return { status: 'failed', issues, reviewById: null, rejectedIds: [] };
	}
	if (
		reviewEvidence.candidateSetSha256 !== candidateSet.candidateSetSha256 ||
		reviewEvidence.promptSetSha256 !== promptValidation.promptSetSha256
	) {
		issues.push(
			issue(
				null,
				'reviewEvidence',
				'format',
				'Repair review does not bind current candidates/prompts.'
			)
		);
	}
	if (
		reviewEvidence.pipelineVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION ||
		reviewEvidence.contentVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION ||
		reviewEvidence.candidateArtifactSha256 !== candidateSet.sourceArtifactSha256 ||
		!SHA256.test(String(reviewEvidence.authoringEvidenceSha256 ?? '')) ||
		reviewEvidence.runSha256 !== evidenceRunSha256(reviewEvidence)
	) {
		issues.push(
			issue(
				null,
				'reviewEvidence',
				'format',
				'Repair review pipeline, artifact, authoring, or run hash binding is invalid.'
			)
		);
	}
	validateEvidenceModelBinding(reviewEvidence.authoring, {
		label: 'repair authoring',
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING,
		issues
	});
	validateEvidenceModelBinding(reviewEvidence.reviewer, {
		label: 'repair reviewer',
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
		issues
	});
	if (
		!Array.isArray(reviewEvidence.reviews) ||
		reviewEvidence.reviews.length !== priorPrompts.length
	) {
		issues.push(
			issue(
				null,
				'reviewEvidence.reviews',
				'format',
				'Repair review must cover every prior prompt.'
			)
		);
		return { status: 'failed', issues, reviewById: null, rejectedIds: [] };
	}
	const reviewById = new Map();
	const rejectedIds = [];
	for (const [index, review] of reviewEvidence.reviews.entries()) {
		const prompt = priorPrompts[index];
		const candidate = candidateSet.rows[index];
		if (
			review?.challengeId !== candidate.challengeId ||
			review?.candidateSha256 !== candidate.candidateSha256 ||
			review?.promptSha256 !== canonicalHash(prompt) ||
			typeof review?.accepted !== 'boolean' ||
			!isRecord(review?.gates) ||
			!SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.every(
				(gate) => typeof review.gates[gate] === 'boolean'
			) ||
			!Array.isArray(review?.issues)
		) {
			issues.push(
				issue(
					candidate.challengeId,
					`reviewEvidence.reviews[${index}]`,
					'format',
					'Repair review row is missing or unbound.'
				)
			);
			continue;
		}
		const acceptedByEvidence =
			SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.every((gate) => review.gates[gate] === true) &&
			review.issues.length === 0;
		if (review.accepted !== acceptedByEvidence) {
			issues.push(
				issue(
					candidate.challengeId,
					`reviewEvidence.reviews[${index}].accepted`,
					'format',
					'Repair review acceptance differs from its structured gates/issues.'
				)
			);
		}
		reviewById.set(review.challengeId, review);
		if (!review.accepted) {
			if (!Array.isArray(review.issues) || review.issues.length === 0) {
				issues.push(
					issue(
						review.challengeId,
						`reviewEvidence.reviews[${index}].issues`,
						'format',
						'Rejected repair target has no concrete issue.'
					)
				);
			}
			rejectedIds.push(review.challengeId);
		}
	}
	if (rejectedIds.length === 0) {
		issues.push(
			issue(null, 'reviewEvidence', 'format', 'Repair requires at least one rejected prompt.')
		);
	}
	if (
		reviewEvidence.status !== 'rejected' ||
		reviewEvidence.concurrency !== 6 ||
		reviewEvidence.rejectedCount !== rejectedIds.length ||
		reviewEvidence.acceptedCount + reviewEvidence.rejectedCount !== priorPrompts.length
	) {
		issues.push(
			issue(null, 'reviewEvidence', 'format', 'Repair review status/counts are inconsistent.')
		);
	}
	const expectedReviewerRunSha256 = reviewerRunSha256(reviewEvidence);
	if (reviewEvidence.reviewer?.runSha256 !== expectedReviewerRunSha256) {
		issues.push(
			issue(null, 'reviewEvidence.reviewer', 'format', 'Repair reviewer run hash is invalid.')
		);
	}
	if (findPathOrUserLeaks(reviewEvidence).length > 0) {
		issues.push(
			issue(null, 'reviewEvidence', 'privacy', 'Repair review contains a local path or username.')
		);
	}
	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		issues,
		reviewById,
		rejectedIds
	};
}

export function mergeScienceChallengeShortRecallRepair({
	priorPrompts,
	replacementById,
	rejectedIds,
	candidateSet
}) {
	const rejected = new Set(rejectedIds);
	const changedIds = new Set();
	const prompts = priorPrompts.map((prompt) => {
		if (!rejected.has(prompt.challengeId)) return prompt;
		const replacement = replacementById.get(prompt.challengeId);
		if (!replacement) {
			throw new Error(`Short-recall repair omitted replacement ${prompt.challengeId}.`);
		}
		if (canonicalHash(replacement) === canonicalHash(prompt)) {
			throw new Error(`Short-recall repair did not change rejected prompt ${prompt.challengeId}.`);
		}
		changedIds.add(prompt.challengeId);
		return replacement;
	});
	if (changedIds.size !== rejected.size) {
		throw new Error('Short-recall repair did not replace every rejected prompt exactly once.');
	}
	for (const prompt of prompts) {
		if (!rejected.has(prompt.challengeId)) {
			const prior = priorPrompts.find((candidate) => candidate.challengeId === prompt.challengeId);
			if (stableStringify(prior, 0) !== stableStringify(prompt, 0)) {
				throw new Error(`Accepted prompt changed during repair: ${prompt.challengeId}.`);
			}
		}
	}
	const validation = validateScienceChallengeShortRecallPromptCollection(prompts, candidateSet);
	return { ...validation, changedIds: [...changedIds] };
}

export function buildScienceChallengeShortRecallGlobalPromptIndex(prompts, candidateSet) {
	return prompts.map((prompt, index) => ({
		challengeId: prompt.challengeId,
		candidateSha256: candidateSet.rows[index].candidateSha256,
		promptSha256: canonicalHash(prompt),
		stem: prompt.stem,
		canonicalAnswer: prompt.canonicalAnswer,
		acceptedAliases: prompt.acceptedAliases
	}));
}

export function validateScienceChallengeShortRecallAuthoringEvidence({
	authoringEvidence,
	candidateSet,
	prompts,
	expectedCount = candidateSet?.rows?.length
}) {
	const issues = [];
	const promptValidation = validateScienceChallengeShortRecallPromptCollection(
		prompts,
		candidateSet,
		{ expectedCount }
	);
	issues.push(...promptValidation.issues.map(formatIssue));
	if (
		!isRecord(authoringEvidence) ||
		authoringEvidence.schemaVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_EVIDENCE_SCHEMA
	) {
		issues.push('Short-recall authoring evidence schema is invalid.');
		return { status: 'failed', issues };
	}
	const expectedBatchCount = Math.ceil(expectedCount / SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE);
	if (
		authoringEvidence.pipelineVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION ||
		authoringEvidence.status !== 'passed' ||
		authoringEvidence.contentVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION ||
		authoringEvidence.candidateArtifactSha256 !== candidateSet.sourceArtifactSha256 ||
		authoringEvidence.candidateSetSha256 !== candidateSet.candidateSetSha256 ||
		authoringEvidence.promptSetSha256 !== promptValidation.promptSetSha256 ||
		authoringEvidence.candidateCount !== expectedCount ||
		authoringEvidence.batchCount !== expectedBatchCount ||
		authoringEvidence.batchSize !== SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE ||
		authoringEvidence.concurrency !== 6 ||
		authoringEvidence.maxAttempts !== SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS ||
		authoringEvidence.model !== SCIENCE_CHALLENGE_SHORT_RECALL_MODEL ||
		authoringEvidence.thinkingLevel !== SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING ||
		authoringEvidence.toolFree !== true
	) {
		issues.push('Short-recall authoring identity, model, geometry, or content binding is invalid.');
	}
	const targetIds = Array.isArray(authoringEvidence.targetIds) ? authoringEvidence.targetIds : [];
	const candidateIds = candidateSet.rows.map((row) => row.challengeId);
	const targetSet = new Set(targetIds);
	const orderedTargets = candidateIds.filter((challengeId) => targetSet.has(challengeId));
	if (
		targetIds.length === 0 ||
		targetSet.size !== targetIds.length ||
		canonicalHash(targetIds) !== canonicalHash(orderedTargets) ||
		authoringEvidence.targetSetSha256 !== canonicalHash(targetIds) ||
		authoringEvidence.authoredCount !== targetIds.length ||
		authoringEvidence.preservedCount !== expectedCount - targetIds.length
	) {
		issues.push('Short-recall authoring target membership/count binding is invalid.');
	}
	if (
		(authoringEvidence.mode === 'author' &&
			(canonicalHash(targetIds) !== canonicalHash(candidateIds) ||
				authoringEvidence.priorPromptSetSha256 !== null ||
				authoringEvidence.repairReviewSha256 !== null ||
				authoringEvidence.repairAuthoringEvidenceSha256 !== null ||
				authoringEvidence.repairPredecessorSha256 !== null ||
				authoringEvidence.repairPredecessor !== null)) ||
		(authoringEvidence.mode === 'repair' &&
			(!SHA256.test(String(authoringEvidence.priorPromptSetSha256 ?? '')) ||
				!SHA256.test(String(authoringEvidence.repairReviewSha256 ?? '')) ||
				!SHA256.test(String(authoringEvidence.repairAuthoringEvidenceSha256 ?? '')) ||
				!SHA256.test(String(authoringEvidence.repairPredecessorSha256 ?? '')) ||
				!isRecord(authoringEvidence.repairPredecessor))) ||
		!['author', 'repair'].includes(authoringEvidence.mode)
	) {
		issues.push('Short-recall authoring mode or predecessor binding is invalid.');
	}
	if (authoringEvidence.mode === 'repair' && isRecord(authoringEvidence.repairPredecessor)) {
		const predecessor = authoringEvidence.repairPredecessor;
		const predecessorPrompts = predecessor.prompts;
		const predecessorAuthoringEvidence = predecessor.authoringEvidence;
		const predecessorReviewEvidence = predecessor.reviewEvidence;
		if (
			!Array.isArray(predecessorPrompts) ||
			!isRecord(predecessorAuthoringEvidence) ||
			!isRecord(predecessorReviewEvidence)
		) {
			issues.push('Short-recall repair predecessor artifacts are malformed.');
		} else if (
			authoringEvidence.repairPredecessorSha256 !== canonicalHash(predecessor) ||
			authoringEvidence.priorPromptSetSha256 !== canonicalHash(predecessorPrompts) ||
			authoringEvidence.repairAuthoringEvidenceSha256 !==
				canonicalHash(predecessorAuthoringEvidence) ||
			authoringEvidence.repairReviewSha256 !== canonicalHash(predecessorReviewEvidence)
		) {
			issues.push('Short-recall repair predecessor artifact hashes are invalid.');
		} else {
			const predecessorValidation = validateScienceChallengeShortRecallReviewEvidence({
				reviewEvidence: predecessorReviewEvidence,
				authoringEvidence: predecessorAuthoringEvidence,
				candidateSet,
				prompts: predecessorPrompts,
				expectedCount
			});
			if (
				predecessorValidation.status !== 'passed' ||
				predecessorReviewEvidence.status !== 'rejected' ||
				predecessorReviewEvidence.rejectedCount < 1
			) {
				issues.push(
					'Short-recall repair predecessor is not an exact independently rejected review.'
				);
			} else {
				const rejectedIds = predecessorReviewEvidence.reviews
					.filter((review) => review.accepted === false)
					.map((review) => review.challengeId);
				if (canonicalHash(rejectedIds) !== canonicalHash(targetIds)) {
					issues.push('Short-recall repair targets differ from the predecessor review rejections.');
				}
				if (!Array.isArray(prompts)) {
					issues.push('Short-recall repaired prompt collection is malformed.');
				} else {
					for (const [index, prompt] of prompts.entries()) {
						const wasRejected = predecessorReviewEvidence.reviews[index]?.accepted === false;
						const unchanged =
							stableStringify(prompt, 0) === stableStringify(predecessorPrompts[index], 0);
						if ((!wasRejected && !unchanged) || (wasRejected && unchanged)) {
							issues.push(`Short-recall repair preservation differs at ${candidateIds[index]}.`);
						}
					}
				}
			}
		}
	}
	const expectedBatchChallengeIds = [];
	for (
		let start = 0;
		start < candidateIds.length;
		start += SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE
	) {
		const challengeIds = candidateIds
			.slice(start, start + SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE)
			.filter((challengeId) => targetSet.has(challengeId));
		if (challengeIds.length) {
			expectedBatchChallengeIds.push({
				batchId: `short-recall-${String(start / SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE + 1).padStart(3, '0')}`,
				challengeIds
			});
		}
	}
	if (
		authoringEvidence.executedBatchCount !== expectedBatchChallengeIds.length ||
		!Array.isArray(authoringEvidence.batches) ||
		authoringEvidence.batches.length !== expectedBatchChallengeIds.length
	) {
		issues.push('Short-recall authoring executed-batch count is invalid.');
	} else {
		for (const [index, expected] of expectedBatchChallengeIds.entries()) {
			if (!validEvidenceBatchRecord(authoringEvidence.batches[index], expected)) {
				issues.push(`Short-recall authoring batch evidence is invalid: ${expected.batchId}.`);
			}
		}
	}
	const expectedModelVersions = uniqueSortedStrings(
		(authoringEvidence.batches ?? []).map((batch) => batch?.modelVersion)
	);
	if (
		!Array.isArray(authoringEvidence.modelVersions) ||
		canonicalHash(authoringEvidence.modelVersions) !== canonicalHash(expectedModelVersions) ||
		authoringEvidence.modelVersions.length === 0
	) {
		issues.push('Short-recall authoring model-version set is invalid.');
	}
	if (
		!nonEmpty(authoringEvidence.createdAt) ||
		!SHA256.test(String(authoringEvidence.runSha256 ?? '')) ||
		authoringEvidence.runSha256 !== evidenceRunSha256(authoringEvidence)
	) {
		issues.push('Short-recall authoring timestamp or run hash is invalid.');
	}
	const leaks = findPathOrUserLeaks(authoringEvidence);
	if (leaks.length) {
		issues.push(`Short-recall authoring evidence contains path/user leaks: ${leaks.join(', ')}.`);
	}
	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		issues,
		promptSetSha256: promptValidation.promptSetSha256
	};
}

export function validateScienceChallengeShortRecallReviewEvidence({
	reviewEvidence,
	authoringEvidence,
	candidateSet,
	prompts,
	expectedCount = candidateSet?.rows?.length,
	requirePassed = false
}) {
	const issues = [];
	const authoringValidation = validateScienceChallengeShortRecallAuthoringEvidence({
		authoringEvidence,
		candidateSet,
		prompts,
		expectedCount
	});
	issues.push(...authoringValidation.issues);
	if (
		!isRecord(reviewEvidence) ||
		reviewEvidence.schemaVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_EVIDENCE_SCHEMA
	) {
		issues.push('Short-recall review evidence schema is invalid.');
		return { status: 'failed', issues };
	}
	const expectedBatchCount = Math.ceil(expectedCount / SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE);
	const exactAuthoringEvidenceSha256 = isRecord(authoringEvidence)
		? canonicalHash(authoringEvidence)
		: null;
	if (
		reviewEvidence.pipelineVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION ||
		reviewEvidence.contentVersion !== SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION ||
		reviewEvidence.candidateArtifactSha256 !== candidateSet.sourceArtifactSha256 ||
		reviewEvidence.candidateSetSha256 !== candidateSet.candidateSetSha256 ||
		reviewEvidence.promptSetSha256 !== authoringValidation.promptSetSha256 ||
		reviewEvidence.authoringEvidenceSha256 !== exactAuthoringEvidenceSha256 ||
		reviewEvidence.batchCount !== expectedBatchCount ||
		reviewEvidence.batchSize !== SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE ||
		reviewEvidence.concurrency !== 6 ||
		reviewEvidence.maxAttempts !== SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS
	) {
		issues.push('Short-recall review identity, predecessor, or batch binding is invalid.');
	}
	const expectedAuthoringSummary = isRecord(authoringEvidence)
		? authoringEvidenceSummary(authoringEvidence)
		: null;
	if (
		!isRecord(reviewEvidence.authoring) ||
		canonicalHash(reviewEvidence.authoring) !== canonicalHash(expectedAuthoringSummary)
	) {
		issues.push('Short-recall review embeds a different authoring evidence summary.');
	}
	validateEvidenceModelBinding(reviewEvidence.reviewer, {
		label: 'reviewer',
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
		issues
	});
	const candidateIds = candidateSet.rows.map((row) => row.challengeId);
	if (
		!Array.isArray(reviewEvidence.batches) ||
		reviewEvidence.batches.length !== expectedBatchCount
	) {
		issues.push('Short-recall review batch evidence is incomplete.');
	} else {
		for (let index = 0; index < expectedBatchCount; index += 1) {
			const start = index * SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE;
			const expected = {
				batchId: `short-recall-${String(index + 1).padStart(3, '0')}`,
				challengeIds: candidateIds.slice(start, start + SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE)
			};
			if (!validEvidenceBatchRecord(reviewEvidence.batches[index], expected)) {
				issues.push(`Short-recall review batch evidence is invalid: ${expected.batchId}.`);
			}
		}
	}
	const reviewerModelVersions = uniqueSortedStrings(
		(reviewEvidence.batches ?? []).map((batch) => batch?.modelVersion)
	);
	if (
		!Array.isArray(reviewEvidence.reviewer?.modelVersions) ||
		canonicalHash(reviewEvidence.reviewer?.modelVersions) !==
			canonicalHash(reviewerModelVersions) ||
		reviewerModelVersions.length === 0
	) {
		issues.push('Short-recall reviewer model-version set is invalid.');
	}
	let acceptedCount = 0;
	if (!Array.isArray(reviewEvidence.reviews) || reviewEvidence.reviews.length !== expectedCount) {
		issues.push('Short-recall review evidence must contain every review row.');
	} else {
		const promptRows = Array.isArray(prompts) ? prompts : [];
		for (const [index, review] of reviewEvidence.reviews.entries()) {
			const candidate = candidateSet.rows[index];
			const prompt = promptRows[index] ?? null;
			const rowIssues = Array.isArray(review?.issues) ? review.issues : null;
			const validGates =
				isRecord(review?.gates) &&
				Object.keys(review.gates).length === SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.length &&
				SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.every(
					(gate) => typeof review.gates[gate] === 'boolean'
				);
			const accepted =
				validGates &&
				SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.every((gate) => review.gates[gate] === true) &&
				rowIssues?.length === 0;
			if (accepted) acceptedCount += 1;
			if (
				review?.challengeId !== candidate.challengeId ||
				review?.candidateSha256 !== candidate.candidateSha256 ||
				review?.promptSha256 !== canonicalHash(prompt) ||
				typeof review?.accepted !== 'boolean' ||
				review.accepted !== accepted ||
				!validGates ||
				!rowIssues ||
				rowIssues.some((value) => !validReviewIssue(value)) ||
				(!accepted && rowIssues.length === 0)
			) {
				issues.push(`Short-recall review row is invalid: ${candidate.challengeId}.`);
			}
		}
	}
	const rejectedCount = expectedCount - acceptedCount;
	const expectedStatus = rejectedCount === 0 ? 'passed' : 'rejected';
	if (
		reviewEvidence.status !== expectedStatus ||
		reviewEvidence.reviewCount !== expectedCount ||
		reviewEvidence.acceptedCount !== acceptedCount ||
		reviewEvidence.rejectedCount !== rejectedCount ||
		(requirePassed && expectedStatus !== 'passed')
	) {
		issues.push(
			requirePassed
				? `Short-recall review must pass ${expectedCount}/${expectedCount} prompts.`
				: 'Short-recall review status/counts are inconsistent.'
		);
	}
	if (
		reviewEvidence.reviewer?.runSha256 !== reviewerRunSha256(reviewEvidence) ||
		!SHA256.test(String(reviewEvidence.runSha256 ?? '')) ||
		reviewEvidence.runSha256 !== evidenceRunSha256(reviewEvidence) ||
		!nonEmpty(reviewEvidence.createdAt)
	) {
		issues.push('Short-recall reviewer or complete evidence run hash is invalid.');
	}
	const leaks = findPathOrUserLeaks(reviewEvidence);
	if (leaks.length) {
		issues.push(`Short-recall review evidence contains path/user leaks: ${leaks.join(', ')}.`);
	}
	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		issues,
		promptSetSha256: authoringValidation.promptSetSha256,
		acceptedCount,
		rejectedCount
	};
}

export function validateAcceptedScienceChallengeShortRecallArtifacts({
	candidateEntries,
	prompts,
	authoringEvidence,
	reviewEvidence,
	expectedCount = SCIENCE_CHALLENGE_SHORT_RECALL_EXPECTED_COUNT
}) {
	const issues = [];
	let candidateSet;
	try {
		candidateSet = readScienceChallengeShortRecallCandidateSet(candidateEntries, {
			expectedCount
		});
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
		return { status: 'failed', issues, candidateSet: null, promptSetSha256: null };
	}
	const evidenceValidation = validateScienceChallengeShortRecallReviewEvidence({
		reviewEvidence,
		authoringEvidence,
		candidateSet,
		prompts,
		expectedCount,
		requirePassed: true
	});
	issues.push(...evidenceValidation.issues);
	return {
		status: issues.length === 0 ? 'passed' : 'failed',
		issues,
		candidateSet,
		promptSetSha256: evidenceValidation.promptSetSha256
	};
}

export function evidenceRunSha256(evidence) {
	if (!isRecord(evidence)) return null;
	const copy = structuredClone(evidence);
	delete copy.runSha256;
	return canonicalHash(copy);
}

function hasExactlyOneStandaloneBlank(value) {
	if (typeof value !== 'string') return false;
	const underscoreRuns = value.match(UNDERSCORE_RUN) ?? [];
	if (underscoreRuns.length !== 1 || underscoreRuns[0] !== '___') return false;
	const blankIndex = value.indexOf('___');
	const before = Array.from(value.slice(0, blankIndex)).at(-1) ?? '';
	const after = Array.from(value.slice(blankIndex + 3))[0] ?? '';
	return !/[\p{L}\p{N}\p{M}\p{Cf}_]/u.test(before) && !/[\p{L}\p{N}\p{M}\p{Cf}_]/u.test(after);
}

function suppliedInternalSourceStrings(candidateRow, additionalValues) {
	const values = new Set();
	for (const value of [
		candidateRow?.challengeId,
		candidateRow?.candidateSha256,
		candidateRow?.definition?.id,
		candidateRow?.authoringContext?.id,
		...(Array.isArray(additionalValues) ? additionalValues : [])
	]) {
		if (typeof value === 'string' && value.length > 0) values.add(value);
	}
	collectStringLeaves(candidateRow?.entry?.grounding, values);
	collectStringLeaves(candidateRow?.authoringContext?.grounding, values);
	collectTopLevelIdentifierSourceStrings(candidateRow?.definition, values);
	collectIdentifierSourceStrings(candidateRow?.authoringContext, values);
	return [...values];
}

function collectStringLeaves(value, target) {
	if (typeof value === 'string') {
		if (value.length > 0) target.add(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const child of value) collectStringLeaves(child, target);
		return;
	}
	if (isRecord(value)) {
		for (const child of Object.values(value)) collectStringLeaves(child, target);
	}
}

function collectIdentifierSourceStrings(value, target) {
	if (Array.isArray(value)) {
		for (const child of value) collectIdentifierSourceStrings(child, target);
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, child] of Object.entries(value)) {
		if (isIdentifierOrSourceKey(key)) {
			collectStringLeaves(child, target);
		}
		if (isRecord(child) || Array.isArray(child)) collectIdentifierSourceStrings(child, target);
	}
}

function collectTopLevelIdentifierSourceStrings(value, target) {
	if (!isRecord(value)) return;
	for (const [key, child] of Object.entries(value)) {
		if (isIdentifierOrSourceKey(key)) collectStringLeaves(child, target);
	}
}

function isIdentifierOrSourceKey(key) {
	return (
		/^(?:id|ids|identifier|identifiers|sha256|path|paths|source|sources|reference|references)$/iu.test(
			key
		) ||
		/(?:Id|Ids|ID|IDs|Identifier|Identifiers|Sha256|Path|Paths|Source|Sources|Reference|References)$/u.test(
			key
		) ||
		/(?:^|[_-])(?:id|ids|identifier|identifiers|sha256|path|paths|source|sources|reference|references)$/iu.test(
			key
		)
	);
}

function containsInternalSourceString(value, sourceString) {
	if (typeof value !== 'string' || typeof sourceString !== 'string' || !sourceString) return false;
	const comparableValue = value.normalize('NFKC').toLocaleLowerCase('en');
	const comparableSource = sourceString.normalize('NFKC').toLocaleLowerCase('en');
	if (comparableSource.length >= 8 || /[\p{N}_-]/u.test(comparableSource)) {
		return comparableValue.includes(comparableSource);
	}
	const sourceCharacters = Array.from(comparableSource);
	const sourceStartsWithWord = /[\p{L}\p{N}\p{M}\p{Cf}_]/u.test(sourceCharacters[0]);
	const sourceEndsWithWord = /[\p{L}\p{N}\p{M}\p{Cf}_]/u.test(sourceCharacters.at(-1));
	let offset = 0;
	while (offset <= comparableValue.length - comparableSource.length) {
		const index = comparableValue.indexOf(comparableSource, offset);
		if (index < 0) return false;
		const before = Array.from(comparableValue.slice(0, index)).at(-1) ?? '';
		const after = Array.from(comparableValue.slice(index + comparableSource.length))[0] ?? '';
		const boundedBefore = !sourceStartsWithWord || !/[\p{L}\p{N}\p{M}\p{Cf}_]/u.test(before);
		const boundedAfter = !sourceEndsWithWord || !/[\p{L}\p{N}\p{M}\p{Cf}_]/u.test(after);
		if (boundedBefore && boundedAfter) return true;
		offset = index + 1;
	}
	return false;
}

export function normalizeScienceChallengeShortRecallAnswer(value) {
	if (typeof value !== 'string') return '';
	const tokens = semanticAnswerWords(value);
	while (tokens.length > 1 && ['a', 'an', 'the'].includes(tokens[0])) tokens.shift();
	if (tokens.length > 2 && tokens[0] === 'it' && tokens[1] === 'is') tokens.splice(0, 2);
	return tokens.join(' ');
}

export function normalizeScienceChallengeShortRecallStem(value) {
	if (typeof value !== 'string') return '';
	return value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[\u0300-\u036f]/gu, '')
		.replace(/___/gu, ' <blank> ')
		.replace(/[^\p{L}\p{N}<>]+/gu, ' ')
		.trim()
		.replace(/\s+/gu, ' ');
}

export function containsPathOrUserLeak(value) {
	return typeof value === 'string' && PATH_OR_USER_LEAKS.some((pattern) => pattern.test(value));
}

export function findPathOrUserLeaks(value, prefix = '$') {
	const leaks = [];
	if (typeof value === 'string') {
		if (containsPathOrUserLeak(value)) leaks.push(prefix);
		return leaks;
	}
	if (Array.isArray(value)) {
		for (const [index, child] of value.entries()) {
			leaks.push(...findPathOrUserLeaks(child, `${prefix}[${index}]`));
		}
		return leaks;
	}
	if (isRecord(value)) {
		for (const [key, child] of Object.entries(value)) {
			leaks.push(...findPathOrUserLeaks(child, `${prefix}.${key}`));
		}
	}
	return leaks;
}

export function formatScienceChallengeShortRecallIssues(issues) {
	return (issues ?? []).map(formatIssue);
}

function buildAuthoringContext(entry, definition, memorySteps) {
	return {
		id: definition.id,
		subject: definition.subject,
		title: definition.title,
		topic: definition.topic,
		memoryHandle: definition.memoryHandle,
		memorySteps,
		previewQuestion: definition.previewQuestion,
		staticAnswers: definition.staticAnswers,
		strongerAnswer: definition.strongerAnswer,
		showdownExplanation: definition.showdownExplanation,
		commandWordLesson: definition.commandWordLesson,
		repairSuccess: definition.repairSuccess,
		transferPromptLead: definition.transferPromptLead,
		transferExplanation: definition.transferExplanation,
		grounding: isRecord(entry?.grounding)
			? {
					curriculumComponentId: entry.grounding.curriculumComponentId,
					specificationId: entry.grounding.specificationId,
					calibrationQuestionId: entry.grounding.calibrationQuestionId
				}
			: null
	};
}

function candidateDefinition(entry) {
	if (isRecord(entry?.definition)) return entry.definition;
	if (isRecord(entry)) return entry;
	return null;
}

function requireCandidateAuthoringContext(definition, challengeId) {
	for (const field of [
		'subject',
		'title',
		'topic',
		'previewQuestion',
		'showdownExplanation',
		'commandWordLesson',
		'repairSuccess',
		'transferPromptLead',
		'transferExplanation'
	]) {
		if (!nonEmpty(definition?.[field])) {
			throw new Error(`Short-recall candidate ${challengeId} is missing definition.${field}.`);
		}
	}
	if (
		!isRecord(definition.staticAnswers) ||
		!nonEmpty(definition.staticAnswers.a) ||
		!nonEmpty(definition.staticAnswers.b) ||
		!['a', 'b'].includes(definition.strongerAnswer)
	) {
		throw new Error(`Short-recall candidate ${challengeId} has malformed reviewed answers.`);
	}
}

function requireLeakSafeCandidateSources(entry, definition, challengeId) {
	const internalSources = new Set();
	collectGroundingSourceStrings(entry?.grounding, internalSources, challengeId);
	collectTopLevelIdentifierSourceStrings(definition, internalSources);
	if ([...internalSources].some((value) => Array.from(value.trim()).length < 3)) {
		throw new Error(
			`Short-recall candidate ${challengeId} has an internal identifier or source string shorter than three characters.`
		);
	}
}

function collectGroundingSourceStrings(value, target, challengeId) {
	if (value === null || value === undefined) return;
	if (typeof value === 'string') {
		target.add(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const child of value) collectGroundingSourceStrings(child, target, challengeId);
		return;
	}
	if (isRecord(value)) {
		for (const child of Object.values(value)) {
			collectGroundingSourceStrings(child, target, challengeId);
		}
		return;
	}
	throw new Error(
		`Short-recall candidate ${challengeId} has a non-string grounding identifier or source value.`
	);
}

function publicPrompt(row) {
	return {
		challengeId: row.challengeId,
		stem: row.stem,
		canonicalAnswer: row.canonicalAnswer,
		acceptedAliases: row.acceptedAliases,
		preferredHiddenStepIndex: row.preferredHiddenStepIndex,
		contentVersion: row.contentVersion
	};
}

function validateAnswer(value, { challengeId, field, allowFunctionWord }) {
	const issues = [];
	if (
		typeof value !== 'string' ||
		value !== value.trim() ||
		value.length < 1 ||
		value.length > 80 ||
		/[\r\n]/u.test(value)
	) {
		issues.push(
			issue(
				challengeId,
				field,
				'storage',
				'Answer must be trimmed, single-line, and 1-80 characters.'
			)
		);
		return { status: 'failed', issues };
	}
	const storedWords = storedAnswerWords(value);
	if (storedWords.length < 1 || storedWords.length > 2) {
		issues.push(
			issue(challengeId, field, 'answer', 'Stored answer must contain exactly one or two words.')
		);
	}
	if (!storedAnswerShapeIsSafe(value, storedWords)) {
		issues.push(
			issue(
				challengeId,
				field,
				'answer',
				'Stored answer uses punctuation to join more than two answer words.'
			)
		);
	}
	const normalized = normalizeScienceChallengeShortRecallAnswer(value);
	const words = normalized.split(' ').filter(Boolean);
	if (!allowFunctionWord && words.length > 0 && words.every((word) => FUNCTION_WORDS.has(word))) {
		issues.push(
			issue(challengeId, field, 'answer', 'Answer cannot consist only of function words.')
		);
	}
	if (!/[\p{L}\p{N}]/u.test(value)) {
		issues.push(issue(challengeId, field, 'answer', 'Answer has no usable letter or number.'));
	}
	return { status: issues.length === 0 ? 'passed' : 'failed', issues };
}

function storedAnswerWords(value) {
	if (typeof value !== 'string') return [];
	return (
		value
			.normalize('NFKD')
			.toLowerCase()
			.replace(/[\u0300-\u036f]/gu, '')
			.match(/[\p{L}\p{N}]+(?:[\p{Pd}’'][\p{L}\p{N}]+)*/gu) ?? []
	);
}

function storedAnswerShapeIsSafe(value, storedWords) {
	const semanticWords = semanticAnswerWords(value);
	let hyphenatedWordCount = 0;
	for (const word of storedWords) {
		const connectors = word.match(/[\p{Pd}’']/gu) ?? [];
		if (connectors.length > 1) return false;
		if (connectors.some((connector) => /\p{Pd}/u.test(connector))) {
			hyphenatedWordCount += 1;
			const segments = word.split(/\p{Pd}/u);
			if (
				['a', 'an', 'the'].includes(segments[0]) ||
				(segments.length === 2 && segments[0] === 'it' && segments[1] === 'is')
			) {
				return false;
			}
		}
	}
	if (semanticWords.length <= 2) return true;
	return storedWords.length === 2 && semanticWords.length === 3 && hyphenatedWordCount === 1;
}

function semanticAnswerWords(value) {
	if (typeof value !== 'string') return [];
	return value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[\u0300-\u036f]/gu, '')
		.replace(/[’']/gu, '')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

function answerPhraseAppearsInStem(answer, stem) {
	const answerWords = normalizedWords(normalizeScienceChallengeShortRecallAnswer(answer));
	if (answerWords.length === 0) return false;
	const stemWords = normalizedWords(stem.replace('___', ' '));
	for (let index = 0; index <= stemWords.length - answerWords.length; index += 1) {
		if (answerWords.every((word, offset) => stemWords[index + offset] === word)) return true;
	}
	return false;
}

function normalizedWords(value) {
	return String(value ?? '')
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[\u0300-\u036f]/gu, '')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

function authoringEvidenceSummary(authoringEvidence) {
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

function validEvidenceBatchRecord(value, expected) {
	return (
		isRecord(value) &&
		value.batchId === expected.batchId &&
		Array.isArray(value.challengeIds) &&
		canonicalHash(value.challengeIds) === canonicalHash(expected.challengeIds) &&
		value.rowCount === expected.challengeIds.length &&
		Number.isInteger(value.attempt) &&
		value.attempt >= 1 &&
		value.attempt <= SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS &&
		value.toolFree === true &&
		nonEmpty(value.modelVersion) &&
		[
			value.batchInputSha256,
			value.attemptSha256,
			value.transportRunSha256,
			value.transportPolicySha256,
			value.outputSha256
		].every((hash) => SHA256.test(String(hash ?? '')))
	);
}

function validReviewIssue(value) {
	return (
		isRecord(value) &&
		nonEmpty(value.field) &&
		REVIEW_ISSUE_CATEGORIES.has(value.category) &&
		nonEmpty(value.evidence) &&
		nonEmpty(value.repair)
	);
}

function uniqueSortedStrings(values) {
	return [...new Set(values.filter(nonEmpty))].sort();
}

function validateEvidenceModelBinding(value, { label, thinkingLevel, issues }) {
	if (
		!isRecord(value) ||
		value.model !== SCIENCE_CHALLENGE_SHORT_RECALL_MODEL ||
		value.thinkingLevel !== thinkingLevel ||
		value.toolFree !== true ||
		!SHA256.test(String(value.runSha256 ?? '')) ||
		!Array.isArray(value.modelVersions) ||
		value.modelVersions.length < 1 ||
		value.modelVersions.some((version) => !nonEmpty(version))
	) {
		issues.push(`Short-recall ${label} model/version/run binding is invalid.`);
	}
}

function reviewerRunSha256(reviewEvidence) {
	if (!isRecord(reviewEvidence)) return null;
	return canonicalHash({
		pipelineVersion: reviewEvidence.pipelineVersion,
		candidateSetSha256: reviewEvidence.candidateSetSha256,
		promptSetSha256: reviewEvidence.promptSetSha256,
		model: reviewEvidence.reviewer?.model,
		thinkingLevel: reviewEvidence.reviewer?.thinkingLevel,
		batches: reviewEvidence.batches,
		reviews: reviewEvidence.reviews
	});
}

function issue(challengeId, field, category, message) {
	return { challengeId, field, category, message };
}

function failedIssue(challengeId, category, message) {
	return {
		status: 'failed',
		issues: [issue(challengeId, '$', category, message)],
		prompts: null,
		reviews: null
	};
}

function formatIssue(value) {
	if (typeof value === 'string') return value;
	const owner = value?.challengeId ? `${value.challengeId}: ` : '';
	const field = value?.field ? `${value.field}: ` : '';
	return `${owner}${field}${value?.message ?? 'invalid short-recall evidence'}`;
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function acceptedSubsetAuthenticationSources(value) {
	const roots = [value.selection, value.evidence].filter(isRecord);
	return roots.flatMap((root) => [
		root,
		...['counts', 'hashes', 'bindings', 'source'].map((key) => root[key]).filter(isRecord)
	]);
}

function requireAcceptedSubsetBinding(sources, { label, keys, expected }) {
	for (const source of sources) {
		for (const key of keys) {
			if (!Object.hasOwn(source, key)) continue;
			if (source[key] !== expected) {
				throw new Error(
					`Release short-recall accepted-subset ${label} must equal ${expected}; found ${String(source[key])}.`
				);
			}
			return;
		}
	}
	throw new Error(
		`Release short-recall accepted-subset is missing its ${label} (${keys.join(' or ')}).`
	);
}

function hasExactKeys(value, expectedKeys) {
	if (!isRecord(value)) return false;
	const actual = Object.keys(value).sort();
	const expected = [...expectedKeys].sort();
	return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
