import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { runDirectScienceChallengePromptJsonTurn } from './science-challenge-direct-prompt-json-runner.mjs';
import { validateScienceChallengeDirectPromptJsonRunPolicy } from './science-challenge-authoring-run-policy.mjs';
import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';
import { writeImmutableRepairJson } from './science-challenge-verification-repair-transaction.mjs';
import {
	SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_EVIDENCE_SCHEMA,
	SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING,
	SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE,
	SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
	SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS,
	SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
	SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_EVIDENCE_SCHEMA,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
	SCIENCE_CHALLENGE_SHORT_RECALL_RUN_MANIFEST_SCHEMA,
	buildScienceChallengeShortRecallAuthoringBatchInput,
	buildScienceChallengeShortRecallAuthoringPrompt,
	buildScienceChallengeShortRecallBatches,
	buildScienceChallengeShortRecallGlobalPromptIndex,
	buildScienceChallengeShortRecallReviewBatchInput,
	buildScienceChallengeShortRecallReviewPrompt,
	evidenceRunSha256,
	findPathOrUserLeaks,
	formatScienceChallengeShortRecallIssues,
	mergeScienceChallengeShortRecallRepair,
	readAuthenticatedScienceChallengeShortRecallCandidateSet,
	readScienceChallengeShortRecallCandidateSet,
	scienceChallengeShortRecallAuthoringOutputSchema,
	scienceChallengeShortRecallReviewOutputSchema,
	validateScienceChallengeShortRecallAuthoringBatch,
	validateScienceChallengeShortRecallAuthoringEvidence,
	validateScienceChallengeShortRecallPromptCollection,
	validateScienceChallengeShortRecallRepairEvidence,
	validateScienceChallengeShortRecallReviewBatch,
	validateScienceChallengeShortRecallReviewEvidence
} from './science-challenge-short-recall.mjs';

const ATTEMPT_SCHEMA = 'science-challenge-short-recall-attempt/v1';
const ATTEMPT_PLAN_SCHEMA = 'science-challenge-short-recall-attempt-plan/v1';
const ATTEMPT_INTERRUPTION_SCHEMA = 'science-challenge-short-recall-attempt-interruption/v1';
const COLLECTION_CHECK_SCHEMA = 'science-challenge-short-recall-collection-check/v1';
const COMPLETION_SCHEMA = 'science-challenge-short-recall-completion/v1';
const COMPLETION_FILE = 'completion.json';
const ATTEMPT_DIRECTORY = /^attempt-(\d{2})$/;
const ATTEMPT_STAGING_DIRECTORY = /^\.attempt-(\d{2})-staging-.+$/;
const SHA256 = /^[a-f0-9]{64}$/;

export async function runScienceChallengeShortRecallAuthoring(options = {}) {
	if (
		Object.hasOwn(options, 'expectedCount') ||
		Object.hasOwn(options, 'requireAuthenticatedCohort')
	) {
		throw new Error(
			'Release short-recall authoring derives its count from the authenticated candidate set.'
		);
	}
	const candidateSet = readAuthenticatedScienceChallengeShortRecallCandidateSet(
		options.candidateValue
	);
	return runScienceChallengeShortRecallAuthoringInternal({
		...options,
		expectedCount: candidateSet.rows.length,
		requireAuthenticatedCohort: true
	});
}

export async function runScienceChallengeShortRecallAuthoringForTest(options = {}) {
	return runScienceChallengeShortRecallAuthoringInternal(options);
}

async function runScienceChallengeShortRecallAuthoringInternal({
	candidateValue,
	outputRoot,
	resume = false,
	dryRun = false,
	concurrency = 6,
	timeoutMs = 7_200_000,
	authMode = 'default-chatgpt-profile',
	priorPrompts = null,
	repairReview = null,
	repairAuthoringEvidence = null,
	expectedCount = null,
	requireAuthenticatedCohort = false,
	transport = defaultScienceChallengeShortRecallPromptJsonTransport,
	now = () => new Date().toISOString()
}) {
	validateInvocation({ outputRoot, resume, dryRun, concurrency, timeoutMs, transport });
	const candidateSet = requireAuthenticatedCohort
		? readAuthenticatedScienceChallengeShortRecallCandidateSet(candidateValue)
		: readScienceChallengeShortRecallCandidateSet(candidateValue, { expectedCount });
	expectedCount ??= candidateSet.rows.length;
	if (candidateSet.rows.length !== expectedCount) {
		throw new Error(
			`Short-recall authenticated cohort count differs from the required ${expectedCount} candidates.`
		);
	}
	const batches = buildScienceChallengeShortRecallBatches(candidateSet);
	requireCanonicalBatchGeometry(batches, expectedCount);
	const repair = priorPrompts !== null || repairReview !== null || repairAuthoringEvidence !== null;
	let priorPromptById = null;
	let reviewById = null;
	let targetIds = candidateSet.rows.map((row) => row.challengeId);
	if (repair) {
		if (!Array.isArray(priorPrompts) || !repairReview || !repairAuthoringEvidence) {
			throw new Error(
				'Short-recall repair requires --prior-bundle, --repair-review, and --repair-authoring-evidence together.'
			);
		}
		const repairValidation = validateScienceChallengeShortRecallRepairEvidence({
			reviewEvidence: repairReview,
			authoringEvidence: repairAuthoringEvidence,
			priorPrompts,
			candidateSet
		});
		if (repairValidation.status !== 'passed') {
			throw new Error(
				`Short-recall repair preflight failed:\n${formatScienceChallengeShortRecallIssues(
					repairValidation.issues
				).join('\n')}`
			);
		}
		priorPromptById = new Map(priorPrompts.map((prompt) => [prompt.challengeId, prompt]));
		reviewById = repairValidation.reviewById;
		targetIds = repairValidation.rejectedIds;
	}

	const batchInputs = batches
		.map((batch) => ({
			batch,
			input: buildScienceChallengeShortRecallAuthoringBatchInput({
				candidateSet,
				batch,
				priorPromptById,
				reviewById
			})
		}))
		.filter((record) => record.input !== null);
	const manifest = {
		schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_RUN_MANIFEST_SCHEMA,
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		stage: 'authoring',
		mode: repair ? 'repair' : 'author',
		candidateArtifactSha256: candidateSet.sourceArtifactSha256,
		candidateSetSha256: candidateSet.candidateSetSha256,
		expectedCount,
		batchSize: SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE,
		batchCount: batches.length,
		executedBatchCount: batchInputs.length,
		concurrency,
		maxAttempts: SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS,
		model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING,
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
		targetIds,
		targetSetSha256: canonicalHash(targetIds),
		priorPromptSetSha256: repair ? canonicalHash(priorPrompts) : null,
		repairReviewSha256: repair ? canonicalHash(repairReview) : null,
		repairAuthoringEvidenceSha256: repair ? canonicalHash(repairAuthoringEvidence) : null
	};
	if (dryRun) {
		return {
			status: 'planned',
			dryRun: true,
			stage: 'authoring',
			mode: manifest.mode,
			candidateCount: candidateSet.rows.length,
			candidateSetSha256: candidateSet.candidateSetSha256,
			batchCount: batches.length,
			executedBatchCount: batchInputs.length,
			targetCount: targetIds.length,
			model: manifest.model,
			thinkingLevel: manifest.thinkingLevel,
			concurrency,
			maxAttempts: manifest.maxAttempts,
			writes: 0,
			modelCalls: 0
		};
	}
	prepareRunRoot(outputRoot, manifest, { resume });
	if (repair) {
		writeImmutableRepairJson(path.join(outputRoot, 'prior-prompts.json'), priorPrompts);
		writeImmutableRepairJson(path.join(outputRoot, 'repair-review-evidence.json'), repairReview);
		writeImmutableRepairJson(
			path.join(outputRoot, 'repair-authoring-evidence.json'),
			repairAuthoringEvidence
		);
	}
	const candidateRowsById = new Map(candidateSet.rows.map((row) => [row.challengeId, row]));
	for (const { batch, input } of batchInputs) {
		prepareBatchDirectory({ outputRoot, batch, input });
	}
	const completed = readCompletedAuthoring({
		outputRoot,
		candidateSet,
		manifest,
		priorPrompts,
		batchInputs,
		candidateRowsById
	});
	if (completed) return { ...completed, resumed: true, modelCalls: 0 };
	const selectedByBatch = new Map();
	let modelCalls = 0;
	const initialResults = await runConcurrent(
		batchInputs.map(({ batch, input }) => async () => {
			const outcome = await ensureLocallyPassedAttempt({
				stage: 'authoring',
				outputRoot,
				batch,
				batchInput: input,
				buildPrompt: buildScienceChallengeShortRecallAuthoringPrompt,
				outputSchema: scienceChallengeShortRecallAuthoringOutputSchema(input.rows.length),
				validateOutput: (output) =>
					validateScienceChallengeShortRecallAuthoringBatch(output, {
						batchInput: input,
						candidateRowsById
					}),
				model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
				thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING,
				timeoutMs,
				authMode,
				transport,
				now
			});
			modelCalls += outcome.modelCalls;
			return { batch, input, outcome };
		}),
		concurrency
	);
	for (const result of initialResults) {
		if (result.outcome.status !== 'passed') {
			throw new Error(
				`Short-recall ${result.batch.batchId} exhausted its immutable attempt budget:\n${formatScienceChallengeShortRecallIssues(
					result.outcome.issues
				).join('\n')}`
			);
		}
		selectedByBatch.set(result.batch.batchId, result.outcome.attempt);
	}

	let finalPrompts;
	let collectionValidation;
	for (let collectionRound = nextCollectionCheckNumber(outputRoot); ; collectionRound += 1) {
		const replacementById = promptMapFromSelectedAttempts({
			stage: 'authoring',
			batchInputs,
			selectedByBatch
		});
		if (repair) {
			const merge = mergeScienceChallengeShortRecallRepair({
				priorPrompts,
				replacementById,
				rejectedIds: targetIds,
				candidateSet
			});
			finalPrompts = merge.prompts;
			collectionValidation = merge;
		} else {
			finalPrompts = candidateSet.rows.map((row) => replacementById.get(row.challengeId));
			collectionValidation = validateScienceChallengeShortRecallPromptCollection(
				finalPrompts,
				candidateSet
			);
		}
		const check = {
			schemaVersion: COLLECTION_CHECK_SCHEMA,
			round: collectionRound,
			selectedAttempts: Object.fromEntries(
				[...selectedByBatch.entries()].sort(([left], [right]) => left.localeCompare(right))
			),
			promptSetSha256: collectionValidation.promptSetSha256,
			status: collectionValidation.status,
			issues: collectionValidation.issues
		};
		writeImmutableRepairJson(
			path.join(
				outputRoot,
				'collection-checks',
				`check-${String(collectionRound).padStart(2, '0')}.json`
			),
			check
		);
		if (collectionValidation.status === 'passed') break;

		const issuesByBatch = collectionIssuesByBatch({
			issues: collectionValidation.issues,
			batches,
			targetIds
		});
		if (issuesByBatch.size === 0) {
			throw new Error(
				`Short-recall collection failed without a safe targeted retry:\n${formatScienceChallengeShortRecallIssues(
					collectionValidation.issues
				).join('\n')}`
			);
		}
		const retries = await runConcurrent(
			[...issuesByBatch.entries()].map(([batchId, issues]) => async () => {
				const record = batchInputs.find((candidate) => candidate.batch.batchId === batchId);
				if (!record) {
					throw new Error(`Collection retry targeted an immutable preserved batch ${batchId}.`);
				}
				const outcome = await ensureLocallyPassedAttempt({
					stage: 'authoring',
					outputRoot,
					batch: record.batch,
					batchInput: record.input,
					buildPrompt: buildScienceChallengeShortRecallAuthoringPrompt,
					outputSchema: scienceChallengeShortRecallAuthoringOutputSchema(record.input.rows.length),
					validateOutput: (output) =>
						validateScienceChallengeShortRecallAuthoringBatch(output, {
							batchInput: record.input,
							candidateRowsById
						}),
					model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
					thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING,
					timeoutMs,
					authMode,
					transport,
					now,
					forceRetry: {
						source: 'collection-validation',
						issues
					}
				});
				modelCalls += outcome.modelCalls;
				return { batchId, outcome };
			}),
			concurrency
		);
		for (const { batchId, outcome } of retries) {
			if (outcome.status !== 'passed') {
				throw new Error(
					`Short-recall ${batchId} exhausted attempts during collection repair:\n${formatScienceChallengeShortRecallIssues(
						outcome.issues
					).join('\n')}`
				);
			}
			selectedByBatch.set(batchId, outcome.attempt);
		}
	}

	const evidence = buildAuthoringEvidence({
		manifest,
		candidateSet,
		prompts: finalPrompts,
		batchInputs,
		selectedByBatch,
		preservedCount: repair ? expectedCount - targetIds.length : 0,
		authoredCount: targetIds.length,
		priorPrompts,
		repairReview,
		repairAuthoringEvidence,
		now
	});
	if (findPathOrUserLeaks(evidence).length > 0) {
		throw new Error('Short-recall authoring evidence contains a local path or username leak.');
	}
	commitCompletion({
		outputRoot,
		stage: 'authoring',
		status: 'passed',
		files: {
			'candidate-prompts.json': finalPrompts,
			'authoring-evidence.json': evidence
		}
	});
	return {
		status: 'passed',
		stage: 'authoring',
		mode: manifest.mode,
		candidateCount: expectedCount,
		authoredCount: targetIds.length,
		preservedCount: repair ? expectedCount - targetIds.length : 0,
		batchCount: batches.length,
		executedBatchCount: batchInputs.length,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: canonicalHash(finalPrompts),
		runSha256: evidence.runSha256,
		modelCalls,
		resumed: false
	};
}

export async function runScienceChallengeShortRecallReview(options = {}) {
	if (
		Object.hasOwn(options, 'expectedCount') ||
		Object.hasOwn(options, 'requireAuthenticatedCohort')
	) {
		throw new Error(
			'Release short-recall review derives its count from the authenticated candidate set.'
		);
	}
	const candidateSet = readAuthenticatedScienceChallengeShortRecallCandidateSet(
		options.candidateValue
	);
	return runScienceChallengeShortRecallReviewInternal({
		...options,
		expectedCount: candidateSet.rows.length,
		requireAuthenticatedCohort: true
	});
}

export async function runScienceChallengeShortRecallReviewForTest(options = {}) {
	return runScienceChallengeShortRecallReviewInternal(options);
}

async function runScienceChallengeShortRecallReviewInternal({
	candidateValue,
	prompts,
	authoringEvidence,
	outputRoot,
	resume = false,
	dryRun = false,
	concurrency = 6,
	timeoutMs = 7_200_000,
	authMode = 'default-chatgpt-profile',
	expectedCount = null,
	requireAuthenticatedCohort = false,
	transport = defaultScienceChallengeShortRecallPromptJsonTransport,
	now = () => new Date().toISOString()
}) {
	validateInvocation({ outputRoot, resume, dryRun, concurrency, timeoutMs, transport });
	const candidateSet = requireAuthenticatedCohort
		? readAuthenticatedScienceChallengeShortRecallCandidateSet(candidateValue)
		: readScienceChallengeShortRecallCandidateSet(candidateValue, { expectedCount });
	expectedCount ??= candidateSet.rows.length;
	if (candidateSet.rows.length !== expectedCount) {
		throw new Error(
			`Short-recall authenticated cohort count differs from the required ${expectedCount} candidates.`
		);
	}
	const promptValidation = validateScienceChallengeShortRecallPromptCollection(
		prompts,
		candidateSet
	);
	if (promptValidation.status !== 'passed') {
		throw new Error(
			`Short-recall review prompt preflight failed:\n${formatScienceChallengeShortRecallIssues(
				promptValidation.issues
			).join('\n')}`
		);
	}
	validateAuthoringEvidenceForReview({
		authoringEvidence,
		candidateSet,
		prompts,
		expectedCount
	});
	const batches = buildScienceChallengeShortRecallBatches(candidateSet);
	requireCanonicalBatchGeometry(batches, expectedCount);
	const promptById = new Map(prompts.map((prompt) => [prompt.challengeId, prompt]));
	const globalPromptIndex = buildScienceChallengeShortRecallGlobalPromptIndex(
		prompts,
		candidateSet
	);
	const batchInputs = batches.map((batch) => ({
		batch,
		input: buildScienceChallengeShortRecallReviewBatchInput({
			candidateSet,
			batch,
			promptById,
			promptSetSha256: promptValidation.promptSetSha256,
			globalPromptIndex
		})
	}));
	const manifest = {
		schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_RUN_MANIFEST_SCHEMA,
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		stage: 'review',
		mode: 'full',
		candidateArtifactSha256: candidateSet.sourceArtifactSha256,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: promptValidation.promptSetSha256,
		authoringEvidenceSha256: canonicalHash(authoringEvidence),
		authoringRunSha256: authoringEvidence.runSha256,
		expectedCount,
		batchSize: SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE,
		batchCount: batches.length,
		concurrency,
		maxAttempts: SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS,
		model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION
	};
	if (dryRun) {
		return {
			status: 'planned',
			dryRun: true,
			stage: 'review',
			candidateCount: expectedCount,
			reviewCount: expectedCount,
			batchCount: batches.length,
			candidateSetSha256: candidateSet.candidateSetSha256,
			promptSetSha256: promptValidation.promptSetSha256,
			authoringRunSha256: authoringEvidence.runSha256,
			model: manifest.model,
			thinkingLevel: manifest.thinkingLevel,
			concurrency,
			maxAttempts: manifest.maxAttempts,
			writes: 0,
			modelCalls: 0
		};
	}
	prepareRunRoot(outputRoot, manifest, { resume });
	writeImmutableRepairJson(path.join(outputRoot, 'prompts-under-review.json'), prompts);
	writeImmutableRepairJson(path.join(outputRoot, 'authoring-evidence.json'), authoringEvidence);
	const candidateRowsById = new Map(candidateSet.rows.map((row) => [row.challengeId, row]));
	for (const { batch, input } of batchInputs) {
		prepareBatchDirectory({ outputRoot, batch, input });
	}
	const completed = readCompletedReview({
		outputRoot,
		candidateSet,
		prompts,
		authoringEvidence,
		manifest,
		batchInputs,
		candidateRowsById,
		promptById
	});
	if (completed) return { ...completed, resumed: true, modelCalls: 0 };
	let modelCalls = 0;
	const results = await runConcurrent(
		batchInputs.map(({ batch, input }) => async () => {
			const outcome = await ensureLocallyPassedAttempt({
				stage: 'review',
				outputRoot,
				batch,
				batchInput: input,
				buildPrompt: buildScienceChallengeShortRecallReviewPrompt,
				outputSchema: scienceChallengeShortRecallReviewOutputSchema(input.rows.length),
				validateOutput: (output) =>
					validateScienceChallengeShortRecallReviewBatch(output, {
						batchInput: input,
						candidateRowsById,
						promptById
					}),
				model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
				thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
				timeoutMs,
				authMode,
				transport,
				now
			});
			modelCalls += outcome.modelCalls;
			return { batch, input, outcome };
		}),
		concurrency
	);
	const selectedByBatch = new Map();
	for (const result of results) {
		if (result.outcome.status !== 'passed') {
			throw new Error(
				`Short-recall review ${result.batch.batchId} exhausted its immutable attempts:\n${formatScienceChallengeShortRecallIssues(
					result.outcome.issues
				).join('\n')}`
			);
		}
		selectedByBatch.set(result.batch.batchId, result.outcome.attempt);
	}
	const reviewById = reviewMapFromSelectedAttempts({
		batchInputs,
		selectedByBatch
	});
	const reviews = candidateSet.rows.map((row) => reviewById.get(row.challengeId));
	const rejected = reviews.filter((review) => review.accepted === false);
	const evidence = buildReviewEvidence({
		manifest,
		candidateSet,
		prompts,
		authoringEvidence,
		reviews,
		batchInputs,
		selectedByBatch,
		now
	});
	if (findPathOrUserLeaks(evidence).length > 0) {
		throw new Error('Short-recall review evidence contains a local path or username leak.');
	}
	const finalPromptPath = path.join(outputRoot, 'short-recall-prompts.json');
	if (rejected.length > 0 && existsSync(finalPromptPath)) {
		throw new Error('Rejected short-recall review must not expose a final prompt array.');
	}
	commitCompletion({
		outputRoot,
		stage: 'review',
		status: rejected.length === 0 ? 'passed' : 'rejected',
		files: {
			'review-evidence.json': evidence,
			...(rejected.length === 0 ? { 'short-recall-prompts.json': prompts } : {})
		}
	});
	return {
		status: rejected.length === 0 ? 'passed' : 'rejected',
		stage: 'review',
		candidateCount: expectedCount,
		reviewCount: reviews.length,
		acceptedCount: reviews.length - rejected.length,
		rejectedCount: rejected.length,
		batchCount: batches.length,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: promptValidation.promptSetSha256,
		runSha256: evidence.runSha256,
		modelCalls,
		resumed: false
	};
}

export async function defaultScienceChallengeShortRecallPromptJsonTransport({
	prompt,
	outputSchema,
	transportRoot,
	model,
	thinkingLevel,
	timeoutMs,
	authMode
}) {
	mkdirSync(transportRoot, { recursive: true });
	const paths = {
		eventsPath: path.join(transportRoot, 'events.jsonl'),
		lastMessagePath: path.join(transportRoot, 'last-message.json'),
		thoughtsPath: path.join(transportRoot, 'thoughts.txt'),
		requestPath: path.join(transportRoot, 'request.json'),
		resultMetadataPath: path.join(transportRoot, 'result-metadata.json'),
		summaryPath: path.join(transportRoot, 'run-summary.json')
	};
	let transportError = null;
	try {
		await runDirectScienceChallengePromptJsonTurn({
			prompt,
			outputSchema,
			...paths,
			model,
			thinkingLevel,
			timeoutMs,
			authMode
		});
	} catch (error) {
		transportError = error instanceof Error ? error.message : String(error);
	}
	const summary = existsSync(paths.summaryPath)
		? JSON.parse(readFileSync(paths.summaryPath, 'utf8'))
		: null;
	const rawText = existsSync(paths.lastMessagePath)
		? readFileSync(paths.lastMessagePath, 'utf8')
		: '';
	let policy = { status: 'failed', issues: ['Prompt-JSON transport did not complete.'] };
	if (summary?.status === 'passed') {
		policy = validateScienceChallengeDirectPromptJsonRunPolicy({
			summary,
			eventLogBytes: readFileSync(paths.eventsPath),
			lastMessageBytes: readFileSync(paths.lastMessagePath),
			promptBytes: Buffer.from(`${prompt}\n`),
			requestBytes: readFileSync(paths.requestPath),
			thoughtsBytes: readFileSync(paths.thoughtsPath),
			resultMetadataBytes: readFileSync(paths.resultMetadataPath),
			expectedResponseJsonSchema: outputSchema
		});
	}
	return {
		rawText,
		summary,
		policy,
		error: transportError
	};
}

async function ensureLocallyPassedAttempt({
	stage,
	outputRoot,
	batch,
	batchInput,
	buildPrompt,
	outputSchema,
	validateOutput,
	model,
	thinkingLevel,
	timeoutMs,
	authMode,
	transport,
	now,
	forceRetry = null
}) {
	const batchDir = path.join(outputRoot, 'batches', batch.batchId);
	finalizeInterruptedAttemptStaging({
		stage,
		batchDir,
		batch,
		batchInput,
		buildPrompt,
		outputSchema,
		model,
		thinkingLevel,
		now
	});
	const attempts = readBatchAttempts({
		stage,
		batchDir,
		batchInput,
		buildPrompt,
		outputSchema,
		validateOutput,
		model,
		thinkingLevel
	});
	let latest = attempts.at(-1) ?? null;
	let modelCalls = 0;
	let retry = forceRetry;
	if (!retry && latest?.validationStatus === 'passed') {
		return { status: 'passed', attempt: latest, issues: [], modelCalls };
	}
	if (!retry && latest) {
		retry = {
			source: 'attempt-validation',
			previousAttempt: latest.attempt,
			issues: latest.issues
		};
	}
	while (attempts.length < SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS) {
		const attemptNumber = attempts.length + 1;
		latest = await runAttempt({
			stage,
			batchDir,
			batch,
			batchInput,
			attemptNumber,
			retry,
			buildPrompt,
			outputSchema,
			validateOutput,
			model,
			thinkingLevel,
			timeoutMs,
			authMode,
			transport,
			now
		});
		attempts.push(latest);
		modelCalls += 1;
		if (latest.validationStatus === 'passed') {
			return { status: 'passed', attempt: latest, issues: [], modelCalls };
		}
		retry = {
			source: 'attempt-validation',
			previousAttempt: latest.attempt,
			issues: latest.issues
		};
	}
	return {
		status: 'failed',
		attempt: latest,
		issues: latest?.issues ?? [
			{ challengeId: null, field: '$', category: 'format', message: 'No usable attempt.' }
		],
		modelCalls
	};
}

async function runAttempt({
	stage,
	batchDir,
	batch,
	batchInput,
	attemptNumber,
	retry,
	buildPrompt,
	outputSchema,
	validateOutput,
	model,
	thinkingLevel,
	timeoutMs,
	authMode,
	transport,
	now
}) {
	const attemptName = `attempt-${String(attemptNumber).padStart(2, '0')}`;
	const finalDir = path.join(batchDir, attemptName);
	if (existsSync(finalDir)) {
		throw new Error(
			`Immutable short-recall attempt already exists: ${batch.batchId}/${attemptName}.`
		);
	}
	const stagingDir = mkdtempSync(path.join(batchDir, `.${attemptName}-staging-`));
	const prompt = buildPrompt(batchInput, retry);
	const transportRoot = path.join(stagingDir, 'transport');
	let output = null;
	try {
		const attemptPlan = {
			schemaVersion: ATTEMPT_PLAN_SCHEMA,
			stage,
			batchId: batch.batchId,
			attempt: attemptNumber,
			retry,
			batchInputSha256: batchInput.batchInputSha256,
			promptSha256: sha256(Buffer.from(`${prompt}\n`)),
			outputSchemaSha256: canonicalHash(outputSchema),
			model,
			thinkingLevel,
			plannedAt: now()
		};
		writeFileSync(path.join(stagingDir, 'attempt-plan.json'), `${stableStringify(attemptPlan)}\n`, {
			flag: 'wx'
		});
		writeFileSync(path.join(stagingDir, 'source-prompt.txt'), `${prompt}\n`, { flag: 'wx' });
		writeFileSync(
			path.join(stagingDir, 'output-schema.json'),
			`${stableStringify(outputSchema)}\n`,
			{ flag: 'wx' }
		);
		const result = await transport({
			stage,
			batch,
			batchInput,
			attempt: attemptNumber,
			retry,
			prompt,
			outputSchema,
			transportRoot,
			model,
			thinkingLevel,
			timeoutMs,
			authMode
		});
		const rawText = typeof result?.rawText === 'string' ? result.rawText : '';
		const summary = isRecord(result?.summary) ? result.summary : null;
		const policy = isRecord(result?.policy)
			? result.policy
			: { status: 'failed', issues: ['Transport omitted zero-tool policy validation.'] };
		const transportError = result?.error ? sanitizeDurableText(result.error) : null;
		writeFileSync(path.join(stagingDir, 'raw-output.json'), rawText, { flag: 'wx' });
		writeFileSync(
			path.join(stagingDir, 'transport-summary.json'),
			`${stableStringify(summary)}\n`,
			{ flag: 'wx' }
		);
		writeFileSync(path.join(stagingDir, 'transport-policy.json'), `${stableStringify(policy)}\n`, {
			flag: 'wx'
		});
		const transportIssues = [
			...validateDurablePromptJsonTransportEvidence({
				transportRoot,
				prompt,
				outputSchema,
				rawText,
				summary,
				policy
			}),
			...validateTransportAttestation(summary, policy, {
				model,
				thinkingLevel,
				transportError
			})
		];
		let parseIssue = null;
		try {
			output = JSON.parse(rawText);
		} catch (error) {
			parseIssue = {
				challengeId: null,
				field: '$',
				category: 'format',
				message: `Model output is not JSON: ${sanitizeDurableText(
					error instanceof Error ? error.message : String(error)
				)}`
			};
		}
		const local = output
			? validateOutput(output)
			: { status: 'failed', issues: parseIssue ? [parseIssue] : [] };
		const issues = [...transportIssues, ...(local.issues ?? [])];
		const validation = {
			status: issues.length === 0 && local.status === 'passed' ? 'passed' : 'failed',
			issues,
			batchInputSha256: batchInput.batchInputSha256,
			promptSha256: sha256(Buffer.from(`${prompt}\n`)),
			outputSha256: output ? canonicalHash(output) : null,
			transportSummarySha256: summary ? canonicalHash(summary) : null,
			transportPolicySha256: canonicalHash(policy)
		};
		if (output) {
			writeFileSync(
				path.join(stagingDir, stage === 'authoring' ? 'candidate.json' : 'review.json'),
				`${stableStringify(output)}\n`,
				{ flag: 'wx' }
			);
		}
		writeFileSync(path.join(stagingDir, 'validation.json'), `${stableStringify(validation)}\n`, {
			flag: 'wx'
		});
		const fileHashes = hashAttemptFiles(stagingDir);
		const record = {
			schemaVersion: ATTEMPT_SCHEMA,
			stage,
			batchId: batch.batchId,
			attempt: attemptNumber,
			retry,
			batchInputSha256: batchInput.batchInputSha256,
			promptSha256: validation.promptSha256,
			outputSchemaSha256: canonicalHash(outputSchema),
			outputSha256: validation.outputSha256,
			model,
			modelVersion: summary?.modelVersion ?? null,
			thinkingLevel,
			toolFree: validation.status === 'passed',
			validationStatus: validation.status,
			issues: validation.issues,
			transportSummarySha256: validation.transportSummarySha256,
			transportPolicySha256: validation.transportPolicySha256,
			transportError,
			fileHashes,
			attemptedAt: attemptPlan.plannedAt,
			interrupted: false,
			interruptionSha256: null
		};
		writeFileSync(path.join(stagingDir, 'attempt.json'), `${stableStringify(record)}\n`, {
			flag: 'wx'
		});
		renameSync(stagingDir, finalDir);
		return { ...record, attemptSha256: canonicalHash(record), output };
	} catch (error) {
		if (existsSync(stagingDir)) {
			const interruptionPath = path.join(stagingDir, 'interruption.json');
			if (!existsSync(interruptionPath)) {
				writeFileSync(
					interruptionPath,
					`${stableStringify({
						schemaVersion: ATTEMPT_INTERRUPTION_SCHEMA,
						status: 'interrupted',
						error: sanitizeDurableText(error instanceof Error ? error.message : String(error)),
						recordedAt: now()
					})}\n`,
					{ flag: 'wx' }
				);
			}
		}
		throw new Error(
			`Short-recall ${batch.batchId}/${attemptName} was interrupted; its staging evidence is preserved and will consume this attempt on --resume.`,
			{ cause: error }
		);
	}
}

function finalizeInterruptedAttemptStaging({
	stage,
	batchDir,
	batch,
	batchInput,
	buildPrompt,
	outputSchema,
	model,
	thinkingLevel,
	now
}) {
	const stagingDirectories = readdirSync(batchDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && ATTEMPT_STAGING_DIRECTORY.test(entry.name))
		.map((entry) => entry.name)
		.sort();
	if (stagingDirectories.length === 0) return;
	if (stagingDirectories.length !== 1) {
		throw new Error(
			`Short-recall ${batch.batchId} has ambiguous interrupted attempt staging; preserve it for operator inspection.`
		);
	}
	const finalAttempts = readdirSync(batchDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && ATTEMPT_DIRECTORY.test(entry.name))
		.map((entry) => entry.name)
		.sort();
	const stagingName = stagingDirectories[0];
	const attemptNumber = Number(stagingName.match(ATTEMPT_STAGING_DIRECTORY)?.[1]);
	const expectedAttemptNumber = finalAttempts.length + 1;
	if (
		!Number.isInteger(attemptNumber) ||
		attemptNumber !== expectedAttemptNumber ||
		attemptNumber > SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS
	) {
		throw new Error(
			`Short-recall ${batch.batchId} interrupted staging is not the next bounded attempt.`
		);
	}
	const attemptName = `attempt-${String(attemptNumber).padStart(2, '0')}`;
	const finalDir = path.join(batchDir, attemptName);
	if (existsSync(finalDir)) {
		throw new Error(
			`Short-recall ${batch.batchId}/${attemptName} exists in final and staging form.`
		);
	}
	const stagingDir = path.join(batchDir, stagingName);
	const planPath = path.join(stagingDir, 'attempt-plan.json');
	if (!existsSync(planPath)) {
		throw new Error(
			`Short-recall ${batch.batchId}/${attemptName} has no immutable pre-call plan; its attempt number will not be reused.`
		);
	}
	const attemptPlan = readJson(planPath);
	const expectedPrompt = buildPrompt(batchInput, attemptPlan.retry);
	if (
		attemptPlan.schemaVersion !== ATTEMPT_PLAN_SCHEMA ||
		attemptPlan.stage !== stage ||
		attemptPlan.batchId !== batch.batchId ||
		attemptPlan.attempt !== attemptNumber ||
		attemptPlan.batchInputSha256 !== batchInput.batchInputSha256 ||
		attemptPlan.promptSha256 !== sha256(Buffer.from(`${expectedPrompt}\n`)) ||
		attemptPlan.outputSchemaSha256 !== canonicalHash(outputSchema) ||
		attemptPlan.model !== model ||
		attemptPlan.thinkingLevel !== thinkingLevel ||
		!nonEmpty(attemptPlan.plannedAt) ||
		readFileSync(path.join(stagingDir, 'source-prompt.txt'), 'utf8') !== `${expectedPrompt}\n` ||
		canonicalHash(readJson(path.join(stagingDir, 'output-schema.json'))) !==
			canonicalHash(outputSchema)
	) {
		throw new Error(
			`Short-recall ${batch.batchId}/${attemptName} interrupted staging differs from its exact plan.`
		);
	}
	if (existsSync(path.join(stagingDir, 'attempt.json'))) {
		renameSync(stagingDir, finalDir);
		return;
	}
	const interruptionPath = path.join(stagingDir, 'interruption.json');
	if (!existsSync(interruptionPath)) {
		writeFileSync(
			interruptionPath,
			`${stableStringify({
				schemaVersion: ATTEMPT_INTERRUPTION_SCHEMA,
				status: 'interrupted',
				error: 'Process ended before immutable attempt finalization.',
				recordedAt: now()
			})}\n`,
			{ flag: 'wx' }
		);
	}
	const interruption = readJson(interruptionPath);
	if (
		interruption.schemaVersion !== ATTEMPT_INTERRUPTION_SCHEMA ||
		interruption.status !== 'interrupted' ||
		!nonEmpty(interruption.error) ||
		!nonEmpty(interruption.recordedAt)
	) {
		throw new Error(
			`Short-recall ${batch.batchId}/${attemptName} has malformed interruption evidence.`
		);
	}
	const outputPath = path.join(
		stagingDir,
		stage === 'authoring' ? 'candidate.json' : 'review.json'
	);
	let outputSha256 = null;
	if (existsSync(outputPath)) {
		try {
			outputSha256 = canonicalHash(readJson(outputPath));
		} catch {
			outputSha256 = null;
		}
	}
	const summary = readOptionalJson(path.join(stagingDir, 'transport-summary.json'));
	const policy = readOptionalJson(path.join(stagingDir, 'transport-policy.json'));
	const record = {
		schemaVersion: ATTEMPT_SCHEMA,
		stage,
		batchId: batch.batchId,
		attempt: attemptNumber,
		retry: attemptPlan.retry,
		batchInputSha256: batchInput.batchInputSha256,
		promptSha256: attemptPlan.promptSha256,
		outputSchemaSha256: attemptPlan.outputSchemaSha256,
		outputSha256,
		model,
		modelVersion: summary?.modelVersion ?? null,
		thinkingLevel,
		toolFree: false,
		validationStatus: 'failed',
		issues: [
			{
				challengeId: null,
				field: '$transport',
				category: 'format',
				message:
					'Interrupted attempt was finalized as consumed; its model-call status cannot be safely replayed.'
			}
		],
		transportSummarySha256: summary ? canonicalHash(summary) : null,
		transportPolicySha256: policy ? canonicalHash(policy) : null,
		transportError: 'interrupted',
		fileHashes: hashAttemptFiles(stagingDir),
		attemptedAt: attemptPlan.plannedAt,
		interrupted: true,
		interruptionSha256: canonicalHash(interruption)
	};
	writeFileSync(path.join(stagingDir, 'attempt.json'), `${stableStringify(record)}\n`, {
		flag: 'wx'
	});
	renameSync(stagingDir, finalDir);
}

function readBatchAttempts({
	stage,
	batchDir,
	batchInput,
	buildPrompt,
	outputSchema,
	validateOutput,
	model,
	thinkingLevel
}) {
	const directories = readdirSync(batchDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && ATTEMPT_DIRECTORY.test(entry.name))
		.map((entry) => entry.name)
		.sort();
	if (directories.length > SCIENCE_CHALLENGE_SHORT_RECALL_MAX_ATTEMPTS) {
		throw new Error(
			`Short-recall ${path.basename(batchDir)} exceeds the immutable four-attempt ceiling.`
		);
	}
	const attempts = [];
	for (const [index, directory] of directories.entries()) {
		const expectedName = `attempt-${String(index + 1).padStart(2, '0')}`;
		if (directory !== expectedName) {
			throw new Error(`Short-recall attempts are not contiguous in ${path.basename(batchDir)}.`);
		}
		const attemptDir = path.join(batchDir, directory);
		const record = readJson(path.join(attemptDir, 'attempt.json'));
		if (
			record.schemaVersion !== ATTEMPT_SCHEMA ||
			record.stage !== stage ||
			record.batchId !== path.basename(batchDir) ||
			record.attempt !== index + 1 ||
			record.batchInputSha256 !== batchInput.batchInputSha256 ||
			record.model !== model ||
			record.thinkingLevel !== thinkingLevel ||
			record.outputSchemaSha256 !== canonicalHash(outputSchema) ||
			typeof record.interrupted !== 'boolean'
		) {
			throw new Error(
				`Short-recall attempt identity differs: ${path.basename(batchDir)}/${directory}.`
			);
		}
		verifyAttemptFiles(attemptDir, record.fileHashes);
		const expectedPrompt = buildPrompt(batchInput, record.retry);
		const attemptPlan = readJson(path.join(attemptDir, 'attempt-plan.json'));
		if (
			attemptPlan.schemaVersion !== ATTEMPT_PLAN_SCHEMA ||
			attemptPlan.stage !== stage ||
			attemptPlan.batchId !== record.batchId ||
			attemptPlan.attempt !== record.attempt ||
			canonicalHash(attemptPlan.retry) !== canonicalHash(record.retry) ||
			attemptPlan.batchInputSha256 !== record.batchInputSha256 ||
			attemptPlan.promptSha256 !== record.promptSha256 ||
			attemptPlan.outputSchemaSha256 !== record.outputSchemaSha256 ||
			attemptPlan.model !== record.model ||
			attemptPlan.thinkingLevel !== record.thinkingLevel ||
			attemptPlan.plannedAt !== record.attemptedAt ||
			readFileSync(path.join(attemptDir, 'source-prompt.txt'), 'utf8') !== `${expectedPrompt}\n` ||
			record.promptSha256 !== sha256(Buffer.from(`${expectedPrompt}\n`))
		) {
			throw new Error(
				`Short-recall attempt prompt differs: ${path.basename(batchDir)}/${directory}.`
			);
		}
		const outputPath = path.join(
			attemptDir,
			stage === 'authoring' ? 'candidate.json' : 'review.json'
		);
		let output = null;
		if (record.interrupted) {
			const interruption = readJson(path.join(attemptDir, 'interruption.json'));
			if (
				record.validationStatus !== 'failed' ||
				record.toolFree !== false ||
				record.interruptionSha256 !== canonicalHash(interruption)
			) {
				throw new Error(
					`Interrupted short-recall attempt differs: ${path.basename(batchDir)}/${directory}.`
				);
			}
			if (existsSync(outputPath) && record.outputSha256) {
				output = readJson(outputPath);
				if (record.outputSha256 !== canonicalHash(output)) {
					throw new Error(
						`Interrupted short-recall output differs: ${path.basename(batchDir)}/${directory}.`
					);
				}
			}
			output = null;
		} else {
			const rawText = readFileSync(path.join(attemptDir, 'raw-output.json'), 'utf8');
			let parseIssue = null;
			try {
				output = JSON.parse(rawText);
			} catch (error) {
				parseIssue = {
					challengeId: null,
					field: '$',
					category: 'format',
					message: `Model output is not JSON: ${sanitizeDurableText(
						error instanceof Error ? error.message : String(error)
					)}`
				};
			}
			if (output && !existsSync(outputPath)) {
				throw new Error(`Parsed short-recall attempt has no bound output file: ${directory}.`);
			}
			if (existsSync(outputPath)) {
				const storedOutput = readJson(outputPath);
				if (!output || canonicalHash(storedOutput) !== canonicalHash(output)) {
					throw new Error(`Short-recall raw and parsed output differ: ${directory}.`);
				}
			}
			const summary = readJson(path.join(attemptDir, 'transport-summary.json'));
			const policy = readJson(path.join(attemptDir, 'transport-policy.json'));
			const transportIssues = [
				...validateDurablePromptJsonTransportEvidence({
					transportRoot: path.join(attemptDir, 'transport'),
					prompt: expectedPrompt,
					outputSchema,
					rawText,
					summary,
					policy
				}),
				...validateTransportAttestation(summary, policy, {
					model,
					thinkingLevel,
					transportError: record.transportError
				})
			];
			const local = output
				? validateOutput(output)
				: { status: 'failed', issues: parseIssue ? [parseIssue] : [] };
			const currentIssues = [...transportIssues, ...(local.issues ?? [])];
			const currentValidation = {
				status: currentIssues.length === 0 && local.status === 'passed' ? 'passed' : 'failed',
				issues: currentIssues,
				batchInputSha256: batchInput.batchInputSha256,
				promptSha256: sha256(Buffer.from(`${expectedPrompt}\n`)),
				outputSha256: output ? canonicalHash(output) : null,
				transportSummarySha256: canonicalHash(summary),
				transportPolicySha256: canonicalHash(policy)
			};
			const storedValidation = readJson(path.join(attemptDir, 'validation.json'));
			if (
				canonicalHash(storedValidation) !== canonicalHash(currentValidation) ||
				record.outputSha256 !== currentValidation.outputSha256 ||
				record.validationStatus !== currentValidation.status ||
				canonicalHash(record.issues) !== canonicalHash(currentValidation.issues) ||
				record.transportSummarySha256 !== currentValidation.transportSummarySha256 ||
				record.transportPolicySha256 !== currentValidation.transportPolicySha256 ||
				record.modelVersion !== summary.modelVersion ||
				record.toolFree !== (currentValidation.status === 'passed') ||
				record.interruptionSha256 !== null
			) {
				throw new Error(
					`Short-recall attempt validation differs: ${path.basename(batchDir)}/${directory}.`
				);
			}
		}
		attempts.push({ ...record, attemptSha256: canonicalHash(record), output });
	}
	return attempts;
}

function commitCompletion({ outputRoot, stage, status, files }) {
	const expectedNames = expectedCompletionFileNames(stage, status);
	const fileRecords = Object.entries(files)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, value]) => ({
			name,
			canonicalSha256: canonicalHash(value),
			value
		}));
	if (canonicalHash(fileRecords.map((record) => record.name)) !== canonicalHash(expectedNames)) {
		throw new Error(`Short-recall ${stage} completion file set is invalid.`);
	}
	const journal = {
		schemaVersion: COMPLETION_SCHEMA,
		stage,
		status,
		files: fileRecords
	};
	writeImmutableRepairJson(path.join(outputRoot, COMPLETION_FILE), journal);
	replayCompletion({ outputRoot, expectedStage: stage });
}

function replayCompletion({ outputRoot, expectedStage }) {
	const journalPath = path.join(outputRoot, COMPLETION_FILE);
	if (!existsSync(journalPath)) return null;
	const journal = readJson(journalPath);
	if (
		!isRecord(journal) ||
		canonicalHash(Object.keys(journal).sort()) !==
			canonicalHash(['files', 'schemaVersion', 'stage', 'status']) ||
		journal.schemaVersion !== COMPLETION_SCHEMA ||
		journal.stage !== expectedStage ||
		!Array.isArray(journal.files)
	) {
		throw new Error(`Short-recall ${expectedStage} completion journal is invalid.`);
	}
	const expectedNames = expectedCompletionFileNames(journal.stage, journal.status);
	const actualNames = journal.files.map((record) => record?.name).sort();
	if (canonicalHash(actualNames) !== canonicalHash(expectedNames)) {
		throw new Error(`Short-recall ${expectedStage} completion journal file set is invalid.`);
	}
	for (const record of journal.files) {
		if (
			!isRecord(record) ||
			canonicalHash(Object.keys(record).sort()) !==
				canonicalHash(['canonicalSha256', 'name', 'value']) ||
			!expectedNames.includes(record.name) ||
			!SHA256.test(String(record.canonicalSha256 ?? '')) ||
			record.canonicalSha256 !== canonicalHash(record.value)
		) {
			throw new Error(`Short-recall ${expectedStage} completion journal entry is invalid.`);
		}
		writeImmutableRepairJson(path.join(outputRoot, record.name), record.value);
	}
	return journal;
}

function expectedCompletionFileNames(stage, status) {
	if (stage === 'authoring' && status === 'passed') {
		return ['authoring-evidence.json', 'candidate-prompts.json'];
	}
	if (stage === 'review' && status === 'passed') {
		return ['review-evidence.json', 'short-recall-prompts.json'];
	}
	if (stage === 'review' && status === 'rejected') {
		return ['review-evidence.json'];
	}
	throw new Error(`Short-recall ${stage} completion status is invalid: ${status}.`);
}

function prepareRunRoot(outputRoot, manifest, { resume }) {
	const manifestPath = path.join(outputRoot, 'manifest.json');
	if (existsSync(outputRoot)) {
		if (!statSync(outputRoot).isDirectory()) {
			throw new Error('Short-recall output root exists but is not a directory.');
		}
		if (!resume) {
			throw new Error('Short-recall output root already exists; use --resume or a fresh root.');
		}
		if (!existsSync(manifestPath)) {
			const rootEntries = readdirSync(outputRoot, { withFileTypes: true });
			const orphanManifestTemps = rootEntries.filter(
				(entry) =>
					entry.isFile() && /^manifest\.json\.immutable-\d+-\d+-[a-f0-9]+\.tmp$/u.test(entry.name)
			);
			if (rootEntries.length === 0 || orphanManifestTemps.length === rootEntries.length) {
				writeImmutableRepairJson(manifestPath, manifest);
				for (const entry of orphanManifestTemps) {
					unlinkSync(path.join(outputRoot, entry.name));
				}
				return;
			}
			throw new Error('Short-recall resume root has no immutable manifest.');
		}
		const existing = readJson(manifestPath);
		if (canonicalHash(existing) !== canonicalHash(manifest)) {
			throw new Error('Short-recall resume manifest differs from the current exact inputs.');
		}
		return;
	}
	if (resume) throw new Error('Short-recall --resume requires an existing output root.');
	mkdirSync(path.dirname(outputRoot), { recursive: true });
	mkdirSync(outputRoot, { recursive: false });
	writeImmutableRepairJson(manifestPath, manifest);
}

function prepareBatchDirectory({ outputRoot, batch, input }) {
	const batchDir = path.join(outputRoot, 'batches', batch.batchId);
	mkdirSync(batchDir, { recursive: true });
	writeImmutableRepairJson(path.join(batchDir, 'input.json'), input);
}

function readCompletedAuthoring({
	outputRoot,
	candidateSet,
	manifest,
	priorPrompts,
	batchInputs,
	candidateRowsById
}) {
	replayCompletion({ outputRoot, expectedStage: 'authoring' });
	const promptPath = path.join(outputRoot, 'candidate-prompts.json');
	const evidencePath = path.join(outputRoot, 'authoring-evidence.json');
	if (!existsSync(promptPath) && !existsSync(evidencePath)) return null;
	if (!existsSync(promptPath) || !existsSync(evidencePath)) {
		if (existsSync(promptPath)) return null;
		throw new Error('Short-recall authoring completion evidence exists without its prompt array.');
	}
	const prompts = readJson(promptPath);
	const evidence = readJson(evidencePath);
	const validation = validateScienceChallengeShortRecallAuthoringEvidence({
		authoringEvidence: evidence,
		candidateSet,
		prompts,
		expectedCount: manifest.expectedCount
	});
	if (
		validation.status !== 'passed' ||
		evidence.mode !== manifest.mode ||
		canonicalHash(evidence.targetIds) !== canonicalHash(manifest.targetIds) ||
		evidence.targetSetSha256 !== manifest.targetSetSha256 ||
		evidence.priorPromptSetSha256 !== manifest.priorPromptSetSha256 ||
		evidence.repairReviewSha256 !== manifest.repairReviewSha256 ||
		evidence.repairAuthoringEvidenceSha256 !== manifest.repairAuthoringEvidenceSha256 ||
		(manifest.mode === 'repair' && evidence.priorPromptSetSha256 !== canonicalHash(priorPrompts))
	) {
		throw new Error('Completed short-recall authoring evidence is stale or tampered.');
	}
	const selectedByBatch = replaySelectedAttempts({
		stage: 'authoring',
		outputRoot,
		batchInputs,
		evidence,
		buildPrompt: buildScienceChallengeShortRecallAuthoringPrompt,
		outputSchemaFor: (input) => scienceChallengeShortRecallAuthoringOutputSchema(input.rows.length),
		validateOutputFor: (input) => (output) =>
			validateScienceChallengeShortRecallAuthoringBatch(output, {
				batchInput: input,
				candidateRowsById
			}),
		model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING
	});
	const replacementById = promptMapFromSelectedAttempts({
		batchInputs,
		selectedByBatch
	});
	const replayedPrompts =
		manifest.mode === 'repair'
			? mergeScienceChallengeShortRecallRepair({
					priorPrompts,
					replacementById,
					rejectedIds: manifest.targetIds,
					candidateSet
				}).prompts
			: candidateSet.rows.map((row) => replacementById.get(row.challengeId));
	if (canonicalHash(replayedPrompts) !== canonicalHash(prompts)) {
		throw new Error('Completed short-recall prompts differ from their selected attempts.');
	}
	commitCompletion({
		outputRoot,
		stage: 'authoring',
		status: 'passed',
		files: {
			'candidate-prompts.json': prompts,
			'authoring-evidence.json': evidence
		}
	});
	return {
		status: 'passed',
		stage: 'authoring',
		mode: evidence.mode,
		candidateCount: prompts.length,
		authoredCount: evidence.authoredCount,
		preservedCount: evidence.preservedCount,
		batchCount: manifest.batchCount,
		executedBatchCount: manifest.executedBatchCount,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: canonicalHash(prompts),
		runSha256: evidence.runSha256
	};
}

function readCompletedReview({
	outputRoot,
	candidateSet,
	prompts,
	authoringEvidence,
	manifest,
	batchInputs,
	candidateRowsById,
	promptById
}) {
	replayCompletion({ outputRoot, expectedStage: 'review' });
	const evidencePath = path.join(outputRoot, 'review-evidence.json');
	if (!existsSync(evidencePath)) return null;
	const evidence = readJson(evidencePath);
	const validation = validateScienceChallengeShortRecallReviewEvidence({
		reviewEvidence: evidence,
		authoringEvidence,
		candidateSet,
		prompts,
		expectedCount: manifest.expectedCount
	});
	if (validation.status !== 'passed') {
		throw new Error('Completed short-recall review evidence is stale or tampered.');
	}
	const selectedByBatch = replaySelectedAttempts({
		stage: 'review',
		outputRoot,
		batchInputs,
		evidence,
		buildPrompt: buildScienceChallengeShortRecallReviewPrompt,
		outputSchemaFor: (input) => scienceChallengeShortRecallReviewOutputSchema(input.rows.length),
		validateOutputFor: (input) => (output) =>
			validateScienceChallengeShortRecallReviewBatch(output, {
				batchInput: input,
				candidateRowsById,
				promptById
			}),
		model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING
	});
	const replayedReviews = candidateSet.rows.map((row) => {
		const attempt = [...selectedByBatch.values()].find((candidate) =>
			candidate.output.reviews.some((review) => review.challengeId === row.challengeId)
		);
		return attempt?.output.reviews.find((review) => review.challengeId === row.challengeId);
	});
	if (canonicalHash(replayedReviews) !== canonicalHash(evidence.reviews)) {
		throw new Error('Completed short-recall reviews differ from their selected attempts.');
	}
	const finalPath = path.join(outputRoot, 'short-recall-prompts.json');
	if (evidence.status === 'passed') {
		if (!existsSync(finalPath)) {
			writeImmutableRepairJson(finalPath, prompts);
		}
		if (canonicalHash(readJson(finalPath)) !== canonicalHash(prompts)) {
			throw new Error('Passed short-recall review is missing its exact final prompt array.');
		}
	} else if (existsSync(finalPath)) {
		throw new Error('Rejected short-recall review must not expose a final prompt array.');
	}
	commitCompletion({
		outputRoot,
		stage: 'review',
		status: evidence.status,
		files: {
			'review-evidence.json': evidence,
			...(evidence.status === 'passed' ? { 'short-recall-prompts.json': prompts } : {})
		}
	});
	return {
		status: evidence.status,
		stage: 'review',
		candidateCount: prompts.length,
		reviewCount: evidence.reviewCount,
		acceptedCount: evidence.acceptedCount,
		rejectedCount: evidence.rejectedCount,
		batchCount: manifest.batchCount,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: canonicalHash(prompts),
		runSha256: evidence.runSha256
	};
}

function replaySelectedAttempts({
	stage,
	outputRoot,
	batchInputs,
	evidence,
	buildPrompt,
	outputSchemaFor,
	validateOutputFor,
	model,
	thinkingLevel
}) {
	const batchRoot = path.join(outputRoot, 'batches');
	const expectedBatchIds = batchInputs.map(({ batch }) => batch.batchId).sort();
	const actualBatchIds = readdirSync(batchRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
	if (canonicalHash(actualBatchIds) !== canonicalHash(expectedBatchIds)) {
		throw new Error('Completed short-recall batch directory set is stale or tampered.');
	}
	const selectedByBatch = new Map();
	for (const [index, { batch, input }] of batchInputs.entries()) {
		const batchDir = path.join(batchRoot, batch.batchId);
		if (
			readdirSync(batchDir, { withFileTypes: true }).some(
				(entry) => entry.isDirectory() && ATTEMPT_STAGING_DIRECTORY.test(entry.name)
			)
		) {
			throw new Error(`Completed short-recall ${batch.batchId} has interrupted staging.`);
		}
		const attempts = readBatchAttempts({
			stage,
			batchDir,
			batchInput: input,
			buildPrompt,
			outputSchema: outputSchemaFor(input),
			validateOutput: validateOutputFor(input),
			model,
			thinkingLevel
		});
		const evidenceBatch = evidence.batches[index];
		const selected = attempts.find((attempt) => attempt.attempt === evidenceBatch.attempt);
		if (
			!selected ||
			selected !== attempts.at(-1) ||
			selected.validationStatus !== 'passed' ||
			canonicalHash(evidenceBatchRecord(batch.batchId, input, selected)) !==
				canonicalHash(evidenceBatch)
		) {
			throw new Error(`Completed short-recall ${batch.batchId} selected attempt is invalid.`);
		}
		selectedByBatch.set(batch.batchId, selected);
	}
	return selectedByBatch;
}

function buildAuthoringEvidence({
	manifest,
	candidateSet,
	prompts,
	batchInputs,
	selectedByBatch,
	preservedCount,
	authoredCount,
	priorPrompts,
	repairReview,
	repairAuthoringEvidence,
	now
}) {
	const batchRuns = batchInputs.map(({ batch, input }) => {
		const attempt = selectedByBatch.get(batch.batchId);
		return evidenceBatchRecord(batch.batchId, input, attempt);
	});
	const modelVersions = uniqueSorted(batchRuns.map((run) => run.modelVersion));
	const repairPredecessor =
		manifest.mode === 'repair'
			? {
					prompts: priorPrompts,
					authoringEvidence: repairAuthoringEvidence,
					reviewEvidence: repairReview
				}
			: null;
	const evidence = {
		schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_EVIDENCE_SCHEMA,
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		status: 'passed',
		mode: manifest.mode,
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
		candidateArtifactSha256: candidateSet.sourceArtifactSha256,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: canonicalHash(prompts),
		priorPromptSetSha256: manifest.priorPromptSetSha256,
		repairReviewSha256: manifest.repairReviewSha256,
		repairAuthoringEvidenceSha256: manifest.repairAuthoringEvidenceSha256,
		repairPredecessorSha256: repairPredecessor ? canonicalHash(repairPredecessor) : null,
		repairPredecessor,
		targetIds: manifest.targetIds,
		targetSetSha256: manifest.targetSetSha256,
		candidateCount: prompts.length,
		authoredCount,
		preservedCount,
		batchCount: manifest.batchCount,
		executedBatchCount: batchInputs.length,
		batchSize: manifest.batchSize,
		concurrency: manifest.concurrency,
		maxAttempts: manifest.maxAttempts,
		model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_THINKING,
		toolFree: true,
		modelVersions,
		batches: batchRuns,
		createdAt: now()
	};
	evidence.runSha256 = evidenceRunSha256(evidence);
	return evidence;
}

function buildReviewEvidence({
	manifest,
	candidateSet,
	prompts,
	authoringEvidence,
	reviews,
	batchInputs,
	selectedByBatch,
	now
}) {
	const batchRuns = batchInputs.map(({ batch, input }) => {
		const attempt = selectedByBatch.get(batch.batchId);
		return evidenceBatchRecord(batch.batchId, input, attempt);
	});
	const modelVersions = uniqueSorted(batchRuns.map((run) => run.modelVersion));
	const rejectedCount = reviews.filter((review) => review.accepted === false).length;
	const reviewerRunSha256 = canonicalHash({
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: canonicalHash(prompts),
		model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
		thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
		batches: batchRuns,
		reviews
	});
	const evidence = {
		schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_EVIDENCE_SCHEMA,
		pipelineVersion: SCIENCE_CHALLENGE_SHORT_RECALL_PIPELINE_VERSION,
		status: rejectedCount === 0 ? 'passed' : 'rejected',
		contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
		candidateArtifactSha256: candidateSet.sourceArtifactSha256,
		candidateSetSha256: candidateSet.candidateSetSha256,
		promptSetSha256: canonicalHash(prompts),
		authoringEvidenceSha256: canonicalHash(authoringEvidence),
		authoring: {
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
		},
		reviewer: {
			model: SCIENCE_CHALLENGE_SHORT_RECALL_MODEL,
			thinkingLevel: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_THINKING,
			toolFree: true,
			runSha256: reviewerRunSha256,
			modelVersions
		},
		reviewCount: reviews.length,
		acceptedCount: reviews.length - rejectedCount,
		rejectedCount,
		batchCount: manifest.batchCount,
		batchSize: manifest.batchSize,
		concurrency: manifest.concurrency,
		maxAttempts: manifest.maxAttempts,
		batches: batchRuns,
		reviews,
		createdAt: now()
	};
	evidence.runSha256 = evidenceRunSha256(evidence);
	return evidence;
}

function evidenceBatchRecord(batchId, input, attempt) {
	if (!attempt || attempt.validationStatus !== 'passed') {
		throw new Error(`Short-recall evidence is missing passed attempt ${batchId}.`);
	}
	return {
		batchId,
		challengeIds: input.rows.map((row) => row.challengeId),
		rowCount: input.rows.length,
		batchInputSha256: input.batchInputSha256,
		attempt: attempt.attempt,
		attemptSha256: attempt.attemptSha256,
		transportRunSha256: attempt.transportSummarySha256,
		transportPolicySha256: attempt.transportPolicySha256,
		outputSha256: attempt.outputSha256,
		modelVersion: attempt.modelVersion,
		toolFree: attempt.toolFree
	};
}

function validateAuthoringEvidenceForReview({
	authoringEvidence,
	candidateSet,
	prompts,
	expectedCount
}) {
	const validation = validateScienceChallengeShortRecallAuthoringEvidence({
		authoringEvidence,
		candidateSet,
		prompts,
		expectedCount
	});
	if (validation.status !== 'passed') {
		throw new Error(
			`Short-recall review requires exact passed authoring evidence:\n${validation.issues.join(
				'\n'
			)}`
		);
	}
}

function promptMapFromSelectedAttempts({ batchInputs, selectedByBatch }) {
	const prompts = new Map();
	for (const { batch } of batchInputs) {
		const attempt = selectedByBatch.get(batch.batchId);
		const output = attempt.output;
		for (const row of output.prompts) {
			const prompt = {
				challengeId: row.challengeId,
				stem: row.stem.trim(),
				canonicalAnswer: row.canonicalAnswer.trim(),
				acceptedAliases: row.acceptedAliases.map((alias) => alias.trim()),
				preferredHiddenStepIndex: row.preferredHiddenStepIndex,
				contentVersion: row.contentVersion
			};
			if (prompts.has(prompt.challengeId)) {
				throw new Error(`Selected authoring attempts duplicate ${prompt.challengeId}.`);
			}
			prompts.set(prompt.challengeId, prompt);
		}
	}
	return prompts;
}

function reviewMapFromSelectedAttempts({ batchInputs, selectedByBatch }) {
	const reviews = new Map();
	for (const { batch } of batchInputs) {
		const attempt = selectedByBatch.get(batch.batchId);
		for (const review of attempt.output.reviews) {
			if (reviews.has(review.challengeId)) {
				throw new Error(`Selected review attempts duplicate ${review.challengeId}.`);
			}
			reviews.set(review.challengeId, review);
		}
	}
	return reviews;
}

function collectionIssuesByBatch({ issues, batches, targetIds }) {
	const targetSet = new Set(targetIds);
	const batchByChallengeId = new Map(
		batches.flatMap((batch) => batch.rows.map((row) => [row.challengeId, batch.batchId]))
	);
	const issuesByBatch = new Map();
	for (const value of issues) {
		const challengeId = value?.challengeId;
		if (!challengeId || !targetSet.has(challengeId)) continue;
		const batchId = batchByChallengeId.get(challengeId);
		const rows = issuesByBatch.get(batchId) ?? [];
		rows.push(value);
		issuesByBatch.set(batchId, rows);
	}
	return issuesByBatch;
}

function nextCollectionCheckNumber(outputRoot) {
	const directory = path.join(outputRoot, 'collection-checks');
	if (!existsSync(directory)) return 1;
	const numbers = readdirSync(directory)
		.map((name) => name.match(/^check-(\d{2})\.json$/)?.[1])
		.filter(Boolean)
		.map(Number);
	return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function validateDurablePromptJsonTransportEvidence({
	transportRoot,
	prompt,
	outputSchema,
	rawText,
	summary,
	policy
}) {
	const failure = (message) => ({
		challengeId: null,
		field: '$transport',
		category: 'format',
		message
	});
	try {
		const requiredFiles = [
			'events.jsonl',
			'last-message.json',
			'request.json',
			'result-metadata.json',
			'run-summary.json',
			'thoughts.txt'
		];
		if (
			!existsSync(transportRoot) ||
			canonicalHash(listFiles(transportRoot)) !== canonicalHash(requiredFiles)
		) {
			return [failure('Prompt-JSON transport evidence file set is incomplete or unexpected.')];
		}
		const durableSummary = readJson(path.join(transportRoot, 'run-summary.json'));
		const lastMessageBytes = readFileSync(path.join(transportRoot, 'last-message.json'));
		if (
			canonicalHash(durableSummary) !== canonicalHash(summary) ||
			!lastMessageBytes.equals(Buffer.from(rawText))
		) {
			return [
				failure(
					'Prompt-JSON transport summary or last-message bytes differ from the attempt output.'
				)
			];
		}
		const replayedPolicy = validateScienceChallengeDirectPromptJsonRunPolicy({
			summary: durableSummary,
			eventLogBytes: readFileSync(path.join(transportRoot, 'events.jsonl')),
			lastMessageBytes,
			promptBytes: Buffer.from(`${prompt}\n`),
			requestBytes: readFileSync(path.join(transportRoot, 'request.json')),
			thoughtsBytes: readFileSync(path.join(transportRoot, 'thoughts.txt')),
			resultMetadataBytes: readFileSync(path.join(transportRoot, 'result-metadata.json')),
			expectedResponseJsonSchema: outputSchema
		});
		if (
			replayedPolicy.status !== 'passed' ||
			canonicalHash(replayedPolicy) !== canonicalHash(policy)
		) {
			return [
				failure('Prompt-JSON transport policy does not replay exactly from its immutable evidence.')
			];
		}
		return [];
	} catch (error) {
		return [
			failure(
				`Prompt-JSON transport evidence replay failed: ${sanitizeDurableText(
					error instanceof Error ? error.message : String(error)
				)}`
			)
		];
	}
}

function validateTransportAttestation(summary, policy, { model, thinkingLevel, transportError }) {
	const issues = [];
	if (
		transportError ||
		!isRecord(summary) ||
		summary.status !== 'passed' ||
		summary.model !== model ||
		summary.thinkingLevel !== thinkingLevel ||
		summary.responseMode !== 'prompt-json' ||
		summary.providerSchemaApplied !== false ||
		!nonEmpty(summary.modelVersion) ||
		summary.toolCalls !== 0 ||
		summary.hostedTools !== 0 ||
		summary.commandActions !== 0 ||
		summary.failedCommandActions !== 0 ||
		summary.webSearches !== 0 ||
		summary.fileChanges !== 0 ||
		policy?.status !== 'passed'
	) {
		issues.push({
			challengeId: null,
			field: '$transport',
			category: 'format',
			message: transportError
				? `Prompt-JSON transport failed: ${transportError}`
				: 'Prompt-JSON model/tool/hash attestation failed.'
		});
	}
	return issues;
}

function hashAttemptFiles(directory) {
	return Object.fromEntries(
		listFiles(directory)
			.filter((relativePath) => relativePath !== 'attempt.json')
			.map((relativePath) => [
				relativePath,
				sha256(readFileSync(path.join(directory, ...relativePath.split('/'))))
			])
	);
}

function verifyAttemptFiles(directory, fileHashes) {
	if (!isRecord(fileHashes) || Object.keys(fileHashes).length === 0) {
		throw new Error(`Short-recall attempt has no file hash manifest: ${directory}.`);
	}
	const actualFiles = listFiles(directory).filter(
		(relativePath) => relativePath !== 'attempt.json'
	);
	const expectedFiles = Object.keys(fileHashes).sort();
	if (canonicalHash(actualFiles) !== canonicalHash(expectedFiles)) {
		throw new Error(`Short-recall attempt file set differs: ${directory}.`);
	}
	for (const relativePath of expectedFiles) {
		const absolutePath = path.join(directory, ...relativePath.split('/'));
		if (
			!SHA256.test(String(fileHashes[relativePath])) ||
			sha256(readFileSync(absolutePath)) !== fileHashes[relativePath]
		) {
			throw new Error(`Short-recall attempt file bytes differ: ${relativePath}.`);
		}
	}
}

function listFiles(directory, prefix = '') {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isSymbolicLink()) {
			throw new Error(`Short-recall evidence contains a symlink: ${relativePath}.`);
		}
		if (entry.isDirectory()) {
			files.push(...listFiles(path.join(directory, entry.name), relativePath));
		} else if (entry.isFile()) {
			files.push(relativePath);
		} else {
			throw new Error(`Short-recall evidence contains a non-file entry: ${relativePath}.`);
		}
	}
	return files.sort();
}

function validateInvocation({ outputRoot, resume, dryRun, concurrency, timeoutMs, transport }) {
	if (typeof outputRoot !== 'string' || !outputRoot.trim()) {
		throw new Error('Short-recall outputRoot must be a non-empty path.');
	}
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 6) {
		throw new Error('Short-recall concurrency must be an integer from 1 to 6.');
	}
	if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 14_400_000) {
		throw new Error('Short-recall timeoutMs must be an integer from 1 to 14400000.');
	}
	if (typeof transport !== 'function')
		throw new Error('Short-recall transport must be a function.');
	if (resume && dryRun) {
		throw new Error('Short-recall --resume and --dry-run cannot be combined.');
	}
}

function requireCanonicalBatchGeometry(batches, expectedCount) {
	const expectedBatchCount = Math.ceil(expectedCount / SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE);
	const expectedFinalBatchSize =
		expectedCount - SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE * Math.max(0, expectedBatchCount - 1);
	const invalidBatchGeometry =
		batches.length !== expectedBatchCount ||
		batches.some(
			(batch, index) =>
				batch.rows.length !==
				(index === expectedBatchCount - 1
					? expectedFinalBatchSize
					: SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE)
		);
	if (invalidBatchGeometry) {
		throw new Error(
			`Release short-recall authoring/review must use exactly ${expectedBatchCount} batches: full batches of ${SCIENCE_CHALLENGE_SHORT_RECALL_BATCH_SIZE} and a final batch of ${expectedFinalBatchSize}.`
		);
	}
}

async function runConcurrent(tasks, concurrency) {
	const results = new Array(tasks.length);
	let cursor = 0;
	async function worker() {
		while (cursor < tasks.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await tasks[index]();
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
	return results;
}

function uniqueSorted(values) {
	return [...new Set(values.filter(nonEmpty))].sort();
}

function sanitizeDurableText(value) {
	return String(value ?? '')
		.replace(/\/Users\/[^/\s]+\/[^\s]*/gu, '<workspace-path>')
		.replace(/\/home\/[^/\s]+\/[^\s]*/gu, '<workspace-path>')
		.replace(/[A-Za-z]:\\Users\\[^\\\s]+\\[^\s]*/gu, '<workspace-path>');
}

function readJson(filePath) {
	if (!existsSync(filePath))
		throw new Error(`Required short-recall evidence is missing: ${filePath}`);
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readOptionalJson(filePath) {
	if (!existsSync(filePath)) return null;
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch {
		return null;
	}
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
