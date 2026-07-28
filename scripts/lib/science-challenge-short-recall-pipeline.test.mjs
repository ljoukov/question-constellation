import assert from 'node:assert/strict';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	parseGenerateScienceChallengeShortRecallArgs,
	runGenerateScienceChallengeShortRecallCli
} from '../generate-science-challenge-short-recall.mjs';
import {
	parseReviewScienceChallengeShortRecallArgs,
	runReviewScienceChallengeShortRecallCli
} from '../review-science-challenge-short-recall.mjs';
import { validateScienceChallengeDirectPromptJsonRunPolicy } from './science-challenge-authoring-run-policy.mjs';
import { runDirectScienceChallengePromptJsonTurn } from './science-challenge-direct-prompt-json-runner.mjs';
import {
	runScienceChallengeShortRecallAuthoring,
	runScienceChallengeShortRecallAuthoringForTest,
	runScienceChallengeShortRecallReview,
	runScienceChallengeShortRecallReviewForTest
} from './science-challenge-short-recall-pipeline.mjs';
import {
	SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_BATCH_SCHEMA,
	SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_BATCH_SCHEMA,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES,
	evidenceRunSha256,
	validateAcceptedScienceChallengeShortRecallArtifacts
} from './science-challenge-short-recall.mjs';
import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';

function candidates(count) {
	return {
		schemaVersion: 'science-challenge-accepted-set/test',
		records: Array.from({ length: count }, (_unused, index) => {
			const suffix = String(index + 1).padStart(3, '0');
			return {
				definition: {
					id: `biology-short-recall-${suffix}`,
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
					calibrationQuestionId: `calibration-${suffix}`
				}
			};
		})
	};
}

function authenticatedCandidates(count) {
	const candidateValue = candidates(count);
	const unsigned = {
		schemaVersion: 'challenge-catalog-candidate-set/v1',
		releaseId: `science-dynamic-${count}`,
		sourceContentSha256: 'a'.repeat(64),
		records: candidateValue.records
	};
	return { ...unsigned, contentSha256: canonicalHash(unsigned) };
}

function mockTransport({ rejectedIds = new Set() } = {}) {
	const state = { calls: 0, active: 0, maximumActive: 0, batches: [] };
	return {
		state,
		transport: async ({
			stage,
			batch,
			batchInput,
			model,
			thinkingLevel,
			attempt,
			prompt,
			outputSchema,
			transportRoot
		}) => {
			state.calls += 1;
			state.active += 1;
			state.maximumActive = Math.max(state.maximumActive, state.active);
			state.batches.push({
				stage,
				batchId: batch.batchId,
				rowCount: batchInput.rows.length,
				attempt
			});
			try {
				await new Promise((resolve) => setImmediate(resolve));
				const output =
					stage === 'authoring'
						? {
								schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_BATCH_SCHEMA,
								batchId: batchInput.batchId,
								batchInputSha256: batchInput.batchInputSha256,
								prompts: batchInput.rows.map((row) => ({
									challengeId: row.challengeId,
									candidateSha256: row.candidateSha256,
									stem:
										batchInput.mode === 'repair'
											? `For cell sample ${row.position + 1}, the revised measurement supports the ___.`
											: `For cell sample ${row.position + 1}, the measured evidence supports the ___.`,
									canonicalAnswer: batchInput.mode === 'repair' ? 'outcome' : 'conclusion',
									acceptedAliases: [],
									preferredHiddenStepIndex: 2,
									contentVersion: SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION
								}))
							}
						: {
								schemaVersion: SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_BATCH_SCHEMA,
								batchId: batchInput.batchId,
								batchInputSha256: batchInput.batchInputSha256,
								reviews: batchInput.rows.map((row) => {
									const accepted = !rejectedIds.has(row.challengeId);
									return {
										challengeId: row.challengeId,
										candidateSha256: row.candidateSha256,
										promptSha256: row.promptSha256,
										accepted,
										gates: Object.fromEntries(
											SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_GATES.map((gate) => [
												gate,
												accepted || gate !== 'questionSpecific'
											])
										),
										issues: accepted
											? []
											: [
													{
														field: 'stem',
														category: 'stem',
														evidence:
															'The cue does not retrieve this challenge-specific scientific move.',
														repair:
															'Re-author the cue around the exact measured evidence in this challenge.'
													}
												]
									};
								})
							};
				return writeMockPromptJsonEvidence({
					rawText: JSON.stringify(output),
					prompt,
					outputSchema,
					transportRoot,
					model,
					thinkingLevel
				});
			} finally {
				state.active -= 1;
			}
		}
	};
}

async function writeMockPromptJsonEvidence({
	rawText,
	prompt,
	outputSchema,
	transportRoot,
	model,
	thinkingLevel
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
	const modelVersion = `${model}-mock-2026-07-24`;
	const usage = { promptTokens: 10, responseTokens: 10, thinkingTokens: 10, totalTokens: 30 };
	let error = null;
	try {
		await runDirectScienceChallengePromptJsonTurn({
			prompt,
			outputSchema,
			...paths,
			model,
			thinkingLevel,
			authMode: 'default-chatgpt-profile',
			streamTextImpl: () => ({
				events: {
					async *[Symbol.asyncIterator]() {
						yield { type: 'delta', channel: 'thought', text: 'Checked the exact contract.' };
						yield { type: 'delta', channel: 'response', text: rawText };
						yield { type: 'model', modelVersion };
						yield { type: 'usage', usage, costUsd: 0, modelVersion };
					}
				},
				result: Promise.resolve({
					provider: 'chatgpt',
					model,
					modelVersion,
					text: rawText,
					thoughts: 'Checked the exact contract.',
					blocked: false,
					usage,
					costUsd: 0
				}),
				abort() {}
			})
		});
	} catch (caught) {
		error = caught instanceof Error ? caught.message : String(caught);
	}
	const summary = readJson(paths.summaryPath);
	const durableRawText = readFileSync(paths.lastMessagePath, 'utf8');
	const policy =
		summary.status === 'passed'
			? validateScienceChallengeDirectPromptJsonRunPolicy({
					summary,
					eventLogBytes: readFileSync(paths.eventsPath),
					lastMessageBytes: readFileSync(paths.lastMessagePath),
					promptBytes: Buffer.from(`${prompt}\n`),
					requestBytes: readFileSync(paths.requestPath),
					thoughtsBytes: readFileSync(paths.thoughtsPath),
					resultMetadataBytes: readFileSync(paths.resultMetadataPath),
					expectedResponseJsonSchema: outputSchema
				})
			: { status: 'failed', issues: ['Mock prompt-JSON transport did not pass.'] };
	return { rawText: durableRawText, summary, policy, error };
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function rebindCompletionJournal(outputRoot) {
	const completionPath = path.join(outputRoot, 'completion.json');
	const completion = readJson(completionPath);
	for (const record of completion.files) {
		record.value = readJson(path.join(outputRoot, record.name));
		record.canonicalSha256 = canonicalHash(record.value);
	}
	writeFileSync(completionPath, `${stableStringify(completion)}\n`);
}

test('release CLIs require explicit evidence paths and fix model, thinking, attempts, and concurrency', () => {
	assert.throws(
		() => parseGenerateScienceChallengeShortRecallArgs([]),
		/--candidate-set is required/
	);
	assert.throws(
		() => parseReviewScienceChallengeShortRecallArgs([]),
		/--candidate-set is required/
	);
	assert.equal(parseGenerateScienceChallengeShortRecallArgs(['--help']).help, true);
	assert.equal(parseReviewScienceChallengeShortRecallArgs(['--help']).help, true);
	assert.throws(
		() => parseGenerateScienceChallengeShortRecallArgs(['--concurrency=5']),
		/must be exactly 6/
	);
	assert.throws(
		() => parseGenerateScienceChallengeShortRecallArgs(['--thinking-level=max']),
		/must be exactly high/
	);
	assert.throws(
		() => parseReviewScienceChallengeShortRecallArgs(['--concurrency=5']),
		/must be exactly 6/
	);
	assert.throws(
		() => parseReviewScienceChallengeShortRecallArgs(['--thinking-level=high']),
		/must be exactly max/
	);
	assert.throws(
		() => parseReviewScienceChallengeShortRecallArgs(['--max-attempts=3']),
		/must be exactly 4/
	);
});

test('public pipeline derives arbitrary release geometry from authenticated evidence', async () => {
	await assert.rejects(
		runScienceChallengeShortRecallAuthoring({
			candidateValue: candidates(8),
			expectedCount: 8,
			outputRoot: '/unused'
		}),
		/derives its count from the authenticated candidate set/
	);
	await assert.rejects(
		runScienceChallengeShortRecallReview({
			candidateValue: candidates(8),
			expectedCount: 8,
			prompts: [],
			authoringEvidence: {},
			outputRoot: '/unused'
		}),
		/derives its count from the authenticated candidate set/
	);
	await assert.rejects(
		runScienceChallengeShortRecallAuthoring({
			candidateValue: candidates(8).records,
			outputRoot: '/unused',
			dryRun: true
		}),
		/authenticated candidate-set object, not a bare array/
	);
	await assert.rejects(
		runScienceChallengeShortRecallAuthoring({
			candidateValue: candidates(8),
			outputRoot: '/unused',
			dryRun: true
		}),
		/must use challenge-catalog-candidate-set\/v1/
	);
	const planned = await runScienceChallengeShortRecallAuthoring({
		candidateValue: authenticatedCandidates(9),
		outputRoot: '/unused',
		dryRun: true
	});
	assert.equal(planned.status, 'planned');
	assert.equal(planned.candidateCount, 9);
	assert.equal(planned.batchCount, 2);
});

test('runs an arbitrary candidate set in derived batches and resumes without calls', async (t) => {
	const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'science-short-recall-dynamic-'));
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(17);
	const candidatePath = path.join(temporaryRoot, 'candidates.json');
	writeFileSync(candidatePath, `${JSON.stringify(candidateValue)}\n`);
	const authorRoot = path.join(temporaryRoot, 'nested', 'author');
	const authorMock = mockTransport();
	const author = await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 17,
		outputRoot: authorRoot,
		transport: authorMock.transport,
		now: () => '2026-07-24T00:00:00.000Z'
	});
	assert.equal(author.status, 'passed');
	assert.equal(author.authoredCount, 17);
	assert.equal(author.executedBatchCount, 3);
	assert.equal(authorMock.state.calls, 3);
	assert.equal(authorMock.state.maximumActive, 3);
	assert.deepEqual(
		authorMock.state.batches.map((batch) => batch.rowCount),
		[8, 8, 1]
	);

	const prompts = readJson(path.join(authorRoot, 'candidate-prompts.json'));
	const authoringEvidence = readJson(path.join(authorRoot, 'authoring-evidence.json'));
	assert.equal(prompts.length, 17);
	assert.ok(
		prompts.every(
			(prompt) =>
				prompt.contentVersion === SCIENCE_CHALLENGE_SHORT_RECALL_CONTENT_VERSION &&
				(prompt.stem.match(/___/gu) ?? []).length === 1
		)
	);
	const resumed = await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 17,
		outputRoot: authorRoot,
		resume: true,
		transport: async () => {
			throw new Error('resume unexpectedly called the model');
		}
	});
	assert.equal(resumed.resumed, true);
	assert.equal(resumed.modelCalls, 0);

	let configured = false;
	const dryAuthorRoot = path.join(temporaryRoot, 'dry-author');
	await assert.rejects(
		runGenerateScienceChallengeShortRecallCli({
			cwd: temporaryRoot,
			argv: [
				`--candidate-set=${path.basename(candidatePath)}`,
				`--output-root=${path.basename(dryAuthorRoot)}`,
				'--dry-run'
			],
			configureTransport: () => {
				configured = true;
				throw new Error('dry-run configured transport');
			}
		}),
		/must use challenge-catalog-candidate-set\/v1/
	);
	assert.equal(configured, false);
	assert.equal(existsSync(dryAuthorRoot), false);

	const reviewRoot = path.join(temporaryRoot, 'review');
	const reviewMock = mockTransport();
	const review = await runScienceChallengeShortRecallReviewForTest({
		candidateValue,
		expectedCount: 17,
		prompts,
		authoringEvidence,
		outputRoot: reviewRoot,
		transport: reviewMock.transport,
		now: () => '2026-07-24T00:01:00.000Z'
	});
	assert.equal(review.status, 'passed');
	assert.equal(review.reviewCount, 17);
	assert.equal(review.acceptedCount, 17);
	assert.equal(reviewMock.state.calls, 3);
	assert.equal(reviewMock.state.maximumActive, 3);
	assert.deepEqual(
		reviewMock.state.batches.map((batch) => batch.rowCount),
		[8, 8, 1]
	);
	const finalPrompts = readJson(path.join(reviewRoot, 'short-recall-prompts.json'));
	const reviewEvidence = readJson(path.join(reviewRoot, 'review-evidence.json'));
	assert.deepEqual(finalPrompts, prompts);
	assert.equal(reviewEvidence.authoring.thinkingLevel, 'high');
	assert.equal(reviewEvidence.reviewer.thinkingLevel, 'max');
	assert.equal(reviewEvidence.reviewer.toolFree, true);
	assert.equal(
		validateAcceptedScienceChallengeShortRecallArtifacts({
			candidateEntries: candidateValue,
			prompts: finalPrompts,
			authoringEvidence,
			reviewEvidence
		}).status,
		'passed'
	);

	configured = false;
	const reviewDryRoot = path.join(temporaryRoot, 'dry-review');
	await assert.rejects(
		runReviewScienceChallengeShortRecallCli({
			cwd: temporaryRoot,
			argv: [
				`--candidate-set=${path.basename(candidatePath)}`,
				`--prompt-bundle=${path.relative(temporaryRoot, path.join(authorRoot, 'candidate-prompts.json'))}`,
				`--authoring-evidence=${path.relative(
					temporaryRoot,
					path.join(authorRoot, 'authoring-evidence.json')
				)}`,
				`--output-root=${path.basename(reviewDryRoot)}`,
				'--dry-run'
			],
			configureTransport: () => {
				configured = true;
				throw new Error('dry-run configured transport');
			}
		}),
		/must use challenge-catalog-candidate-set\/v1/
	);
	assert.equal(configured, false);
	assert.equal(existsSync(reviewDryRoot), false);
});

test('completion journals replay every missing authoring and review sibling without model calls', async (t) => {
	const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'science-short-recall-completion-'));
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(8);
	const authorRoot = path.join(temporaryRoot, 'author');
	await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 8,
		outputRoot: authorRoot,
		transport: mockTransport().transport,
		now: () => '2026-07-24T00:30:00.000Z'
	});

	const authorFiles = ['candidate-prompts.json', 'authoring-evidence.json'];
	const expectedAuthorBytes = new Map(
		authorFiles.map((name) => [name, readFileSync(path.join(authorRoot, name))])
	);
	const authorCompletion = readJson(path.join(authorRoot, 'completion.json'));
	assert.equal(authorCompletion.stage, 'authoring');
	assert.equal(authorCompletion.status, 'passed');
	assert.deepEqual(authorCompletion.files.map((record) => record.name).sort(), [
		'authoring-evidence.json',
		'candidate-prompts.json'
	]);

	for (const missingNames of [authorFiles, [authorFiles[0]], [authorFiles[1]]]) {
		for (const name of missingNames) rmSync(path.join(authorRoot, name));
		const resumed = await runScienceChallengeShortRecallAuthoringForTest({
			candidateValue,
			expectedCount: 8,
			outputRoot: authorRoot,
			resume: true,
			transport: async () => {
				throw new Error('authoring completion replay unexpectedly called the model');
			}
		});
		assert.equal(resumed.modelCalls, 0);
		for (const name of authorFiles) {
			assert.equal(
				readFileSync(path.join(authorRoot, name)).equals(expectedAuthorBytes.get(name)),
				true
			);
		}
	}

	const prompts = readJson(path.join(authorRoot, 'candidate-prompts.json'));
	const authoringEvidence = readJson(path.join(authorRoot, 'authoring-evidence.json'));
	const reviewRoot = path.join(temporaryRoot, 'review');
	await runScienceChallengeShortRecallReviewForTest({
		candidateValue,
		expectedCount: 8,
		prompts,
		authoringEvidence,
		outputRoot: reviewRoot,
		transport: mockTransport().transport,
		now: () => '2026-07-24T00:31:00.000Z'
	});

	const reviewFiles = ['short-recall-prompts.json', 'review-evidence.json'];
	const expectedReviewBytes = new Map(
		reviewFiles.map((name) => [name, readFileSync(path.join(reviewRoot, name))])
	);
	const reviewCompletion = readJson(path.join(reviewRoot, 'completion.json'));
	assert.equal(reviewCompletion.stage, 'review');
	assert.equal(reviewCompletion.status, 'passed');
	assert.deepEqual(reviewCompletion.files.map((record) => record.name).sort(), [
		'review-evidence.json',
		'short-recall-prompts.json'
	]);

	for (const missingNames of [reviewFiles, [reviewFiles[0]], [reviewFiles[1]]]) {
		for (const name of missingNames) rmSync(path.join(reviewRoot, name));
		const resumed = await runScienceChallengeShortRecallReviewForTest({
			candidateValue,
			expectedCount: 8,
			prompts,
			authoringEvidence,
			outputRoot: reviewRoot,
			resume: true,
			transport: async () => {
				throw new Error('review completion replay unexpectedly called the model');
			}
		});
		assert.equal(resumed.modelCalls, 0);
		for (const name of reviewFiles) {
			assert.equal(
				readFileSync(path.join(reviewRoot, name)).equals(expectedReviewBytes.get(name)),
				true
			);
		}
	}
});

test('resume recovers an orphaned manifest temp from a pre-link crash', async (t) => {
	const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'science-short-recall-manifest-'));
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(8);
	const outputRoot = path.join(temporaryRoot, 'author');
	mkdirSync(outputRoot);
	const orphanName = 'manifest.json.immutable-123-456-deadbeef.tmp';
	writeFileSync(path.join(outputRoot, orphanName), '{"partial":');

	const mocked = mockTransport();
	const resumed = await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 8,
		outputRoot,
		resume: true,
		transport: mocked.transport,
		now: () => '2026-07-24T00:45:00.000Z'
	});
	assert.equal(resumed.status, 'passed');
	assert.equal(mocked.state.calls, 1);
	assert.equal(existsSync(path.join(outputRoot, 'manifest.json')), true);
	assert.equal(existsSync(path.join(outputRoot, orphanName)), false);
});

test('targeted repair rewrites only rejected rows and requires a fresh full review', async (t) => {
	const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'science-short-recall-repair-'));
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(16);
	const initialAuthorRoot = path.join(temporaryRoot, 'author-initial');
	await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 16,
		outputRoot: initialAuthorRoot,
		transport: mockTransport().transport,
		now: () => '2026-07-24T01:00:00.000Z'
	});
	const priorPrompts = readJson(path.join(initialAuthorRoot, 'candidate-prompts.json'));
	const initialAuthorEvidence = readJson(path.join(initialAuthorRoot, 'authoring-evidence.json'));

	const rejectedIds = new Set(['biology-short-recall-002', 'biology-short-recall-010']);
	const rejectedReviewRoot = path.join(temporaryRoot, 'review-rejected');
	const rejectedReview = await runScienceChallengeShortRecallReviewForTest({
		candidateValue,
		expectedCount: 16,
		prompts: priorPrompts,
		authoringEvidence: initialAuthorEvidence,
		outputRoot: rejectedReviewRoot,
		transport: mockTransport({ rejectedIds }).transport,
		now: () => '2026-07-24T01:01:00.000Z'
	});
	assert.equal(rejectedReview.status, 'rejected');
	assert.equal(rejectedReview.rejectedCount, 2);
	assert.equal(existsSync(path.join(rejectedReviewRoot, 'short-recall-prompts.json')), false);
	const rejectedEvidence = readJson(path.join(rejectedReviewRoot, 'review-evidence.json'));
	rmSync(path.join(rejectedReviewRoot, 'review-evidence.json'));
	const resumedRejected = await runScienceChallengeShortRecallReviewForTest({
		candidateValue,
		expectedCount: 16,
		prompts: priorPrompts,
		authoringEvidence: initialAuthorEvidence,
		outputRoot: rejectedReviewRoot,
		resume: true,
		transport: async () => {
			throw new Error('rejected review completion replay unexpectedly called the model');
		}
	});
	assert.equal(resumedRejected.status, 'rejected');
	assert.equal(resumedRejected.modelCalls, 0);

	rmSync(path.join(rejectedReviewRoot, 'completion.json'));
	rmSync(path.join(rejectedReviewRoot, 'review-evidence.json'));
	writeFileSync(
		path.join(rejectedReviewRoot, 'short-recall-prompts.json'),
		`${stableStringify(priorPrompts)}\n`
	);
	await assert.rejects(
		runScienceChallengeShortRecallReviewForTest({
			candidateValue,
			expectedCount: 16,
			prompts: priorPrompts,
			authoringEvidence: initialAuthorEvidence,
			outputRoot: rejectedReviewRoot,
			resume: true,
			transport: async () => {
				throw new Error('stale rejected review unexpectedly called the model');
			}
		}),
		/must not expose a final prompt array/
	);

	const forgedRepairEvidence = structuredClone(rejectedEvidence);
	forgedRepairEvidence.batchCount = 0;
	forgedRepairEvidence.runSha256 = evidenceRunSha256(forgedRepairEvidence);
	await assert.rejects(
		runScienceChallengeShortRecallAuthoringForTest({
			candidateValue,
			expectedCount: 16,
			outputRoot: path.join(temporaryRoot, 'forged-repair'),
			priorPrompts,
			repairReview: forgedRepairEvidence,
			repairAuthoringEvidence: initialAuthorEvidence,
			dryRun: true,
			transport: mockTransport().transport
		}),
		/repair preflight failed/i
	);

	const repairRoot = path.join(temporaryRoot, 'author-repair');
	const repairMock = mockTransport();
	const repair = await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 16,
		outputRoot: repairRoot,
		priorPrompts,
		repairReview: rejectedEvidence,
		repairAuthoringEvidence: initialAuthorEvidence,
		transport: repairMock.transport,
		now: () => '2026-07-24T01:02:00.000Z'
	});
	assert.equal(repair.status, 'passed');
	assert.equal(repair.authoredCount, 2);
	assert.equal(repair.preservedCount, 14);
	assert.equal(repair.executedBatchCount, 2);
	assert.equal(repairMock.state.calls, 2);
	assert.deepEqual(
		repairMock.state.batches.map((batch) => batch.rowCount),
		[1, 1]
	);

	const repairedPrompts = readJson(path.join(repairRoot, 'candidate-prompts.json'));
	const repairAuthorEvidence = readJson(path.join(repairRoot, 'authoring-evidence.json'));
	assert.equal(
		repairAuthorEvidence.repairPredecessorSha256,
		canonicalHash(repairAuthorEvidence.repairPredecessor)
	);
	assert.deepEqual(repairAuthorEvidence.repairPredecessor.prompts, priorPrompts);
	assert.deepEqual(repairAuthorEvidence.repairPredecessor.authoringEvidence, initialAuthorEvidence);
	assert.deepEqual(repairAuthorEvidence.repairPredecessor.reviewEvidence, rejectedEvidence);
	for (const [index, prompt] of repairedPrompts.entries()) {
		if (rejectedIds.has(prompt.challengeId)) {
			assert.notDeepEqual(prompt, priorPrompts[index]);
		} else {
			assert.deepEqual(prompt, priorPrompts[index]);
			assert.equal(JSON.stringify(prompt), JSON.stringify(priorPrompts[index]));
		}
	}
	assert.equal(
		validateAcceptedScienceChallengeShortRecallArtifacts({
			candidateEntries: candidateValue,
			prompts: repairedPrompts,
			authoringEvidence: repairAuthorEvidence,
			reviewEvidence: rejectedEvidence,
			expectedCount: 16
		}).status,
		'failed'
	);

	const freshReviewRoot = path.join(temporaryRoot, 'review-fresh');
	const freshReviewMock = mockTransport();
	const freshReview = await runScienceChallengeShortRecallReviewForTest({
		candidateValue,
		expectedCount: 16,
		prompts: repairedPrompts,
		authoringEvidence: repairAuthorEvidence,
		outputRoot: freshReviewRoot,
		transport: freshReviewMock.transport,
		now: () => '2026-07-24T01:03:00.000Z'
	});
	assert.equal(freshReview.status, 'passed');
	assert.equal(freshReview.reviewCount, 16);
	assert.equal(freshReviewMock.state.calls, 2);
	assert.deepEqual(
		freshReviewMock.state.batches.map((batch) => batch.rowCount),
		[8, 8]
	);
	const freshReviewEvidence = readJson(path.join(freshReviewRoot, 'review-evidence.json'));
	assert.equal(
		validateAcceptedScienceChallengeShortRecallArtifacts({
			candidateEntries: candidateValue,
			prompts: repairedPrompts,
			authoringEvidence: repairAuthorEvidence,
			reviewEvidence: freshReviewEvidence,
			expectedCount: 16
		}).status,
		'passed'
	);
});

test('malformed model output consumes exactly four immutable attempts and resume cannot exceed the ceiling', async (t) => {
	const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'science-short-recall-attempts-'));
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(8);
	const outputRoot = path.join(temporaryRoot, 'author');
	let calls = 0;
	const malformedTransport = async ({
		model,
		thinkingLevel,
		prompt,
		outputSchema,
		transportRoot
	}) => {
		calls += 1;
		return writeMockPromptJsonEvidence({
			rawText: '{not-json',
			prompt,
			outputSchema,
			transportRoot,
			model,
			thinkingLevel
		});
	};
	await assert.rejects(
		runScienceChallengeShortRecallAuthoringForTest({
			candidateValue,
			expectedCount: 8,
			outputRoot,
			transport: malformedTransport,
			now: () => '2026-07-24T02:00:00.000Z'
		}),
		/exhausted its immutable attempt budget/
	);
	assert.equal(calls, 4);
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		assert.equal(
			existsSync(
				path.join(
					outputRoot,
					'batches',
					'short-recall-001',
					`attempt-${String(attempt).padStart(2, '0')}`,
					'attempt.json'
				)
			),
			true
		);
	}
	await assert.rejects(
		runScienceChallengeShortRecallAuthoringForTest({
			candidateValue,
			expectedCount: 8,
			outputRoot,
			resume: true,
			transport: async () => {
				throw new Error('exhausted resume unexpectedly called the model');
			}
		}),
		/exhausted its immutable attempt budget/
	);
	assert.equal(calls, 4);
});

test('an interrupted staging directory is preserved and consumes its attempt before resume', async (t) => {
	const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'science-short-recall-interrupted-'));
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(8);
	const outputRoot = path.join(temporaryRoot, 'author');
	await assert.rejects(
		runScienceChallengeShortRecallAuthoringForTest({
			candidateValue,
			expectedCount: 8,
			outputRoot,
			transport: async () => {
				throw new Error('simulated process interruption after transport entry');
			},
			now: () => '2026-07-24T03:00:00.000Z'
		}),
		/staging evidence is preserved/
	);
	const batchRoot = path.join(outputRoot, 'batches', 'short-recall-001');
	assert.equal(
		readdirSync(batchRoot).some((name) => name.startsWith('.attempt-01-staging-')),
		true
	);

	const resumedMock = mockTransport();
	const resumed = await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 8,
		outputRoot,
		resume: true,
		transport: resumedMock.transport,
		now: () => '2026-07-24T03:01:00.000Z'
	});
	assert.equal(resumed.status, 'passed');
	assert.equal(resumedMock.state.calls, 1);
	assert.equal(existsSync(path.join(batchRoot, 'attempt-01', 'interruption.json')), true);
	assert.equal(readJson(path.join(batchRoot, 'attempt-01', 'attempt.json')).interrupted, true);
	assert.equal(readJson(path.join(batchRoot, 'attempt-02', 'attempt.json')).interrupted, false);
	assert.equal(
		readdirSync(batchRoot).some((name) => name.includes('-staging-')),
		false
	);
});

test('resume finalizes a fully written staged attempt without another model call', async (t) => {
	const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'science-short-recall-finalize-'));
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(8);
	const outputRoot = path.join(temporaryRoot, 'author');
	await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 8,
		outputRoot,
		transport: mockTransport().transport,
		now: () => '2026-07-24T03:30:00.000Z'
	});
	const batchRoot = path.join(outputRoot, 'batches', 'short-recall-001');
	renameSync(
		path.join(batchRoot, 'attempt-01'),
		path.join(batchRoot, '.attempt-01-staging-simulated-crash')
	);
	rmSync(path.join(outputRoot, 'candidate-prompts.json'));
	rmSync(path.join(outputRoot, 'authoring-evidence.json'));
	rmSync(path.join(outputRoot, 'completion.json'));

	const resumed = await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 8,
		outputRoot,
		resume: true,
		transport: async () => {
			throw new Error('fully written staging unexpectedly called the model');
		},
		now: () => '2026-07-24T03:31:00.000Z'
	});
	assert.equal(resumed.status, 'passed');
	assert.equal(resumed.modelCalls, 0);
	assert.equal(existsSync(path.join(batchRoot, 'attempt-01', 'attempt.json')), true);
});

test('completion replay rejects more than four immutable attempt directories', async (t) => {
	const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'science-short-recall-overflow-'));
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(8);
	const outputRoot = path.join(temporaryRoot, 'author');
	await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 8,
		outputRoot,
		transport: mockTransport().transport,
		now: () => '2026-07-24T03:40:00.000Z'
	});
	const batchRoot = path.join(outputRoot, 'batches', 'short-recall-001');
	for (let attempt = 2; attempt <= 5; attempt += 1) {
		mkdirSync(path.join(batchRoot, `attempt-${String(attempt).padStart(2, '0')}`));
	}
	await assert.rejects(
		runScienceChallengeShortRecallAuthoringForTest({
			candidateValue,
			expectedCount: 8,
			outputRoot,
			resume: true,
			transport: async () => {
				throw new Error('overflow replay unexpectedly called the model');
			}
		}),
		/four-attempt ceiling/
	);
});

test('coherent derived-file rehash cannot override the archived model event stream', async (t) => {
	const temporaryRoot = mkdtempSync(
		path.join(os.tmpdir(), 'science-short-recall-transport-tamper-')
	);
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(8);
	const outputRoot = path.join(temporaryRoot, 'author');
	await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 8,
		outputRoot,
		transport: mockTransport().transport,
		now: () => '2026-07-24T03:50:00.000Z'
	});

	const attemptRoot = path.join(outputRoot, 'batches', 'short-recall-001', 'attempt-01');
	const outputPath = path.join(attemptRoot, 'candidate.json');
	const rawOutputPath = path.join(attemptRoot, 'raw-output.json');
	const validationPath = path.join(attemptRoot, 'validation.json');
	const attemptPath = path.join(attemptRoot, 'attempt.json');
	const transportRoot = path.join(attemptRoot, 'transport');
	const eventsPath = path.join(transportRoot, 'events.jsonl');
	const lastMessagePath = path.join(transportRoot, 'last-message.json');
	const resultMetadataPath = path.join(transportRoot, 'result-metadata.json');
	const runSummaryPath = path.join(transportRoot, 'run-summary.json');
	const transportSummaryPath = path.join(attemptRoot, 'transport-summary.json');
	const transportPolicyPath = path.join(attemptRoot, 'transport-policy.json');
	const originalEventBytes = readFileSync(eventsPath);
	const substituted = readJson(outputPath);
	substituted.prompts[0].stem = 'For cell sample 1, the sampled measurement supports the ___.';
	const substitutedRawText = stableStringify(substituted);
	const substitutedRawBytes = Buffer.from(substitutedRawText);
	writeFileSync(rawOutputPath, substitutedRawBytes);
	writeFileSync(outputPath, `${stableStringify(substituted)}\n`);
	writeFileSync(lastMessagePath, substitutedRawBytes);

	const resultMetadata = readJson(resultMetadataPath);
	resultMetadata.rawTextSha256 = sha256(substitutedRawBytes);
	resultMetadata.valueCanonicalSha256 = canonicalHash(substituted);
	writeFileSync(resultMetadataPath, `${stableStringify(resultMetadata)}\n`);

	const summary = readJson(runSummaryPath);
	summary.finalResponseSha256 = sha256(substitutedRawBytes);
	summary.lastMessageFileSha256 = sha256(substitutedRawBytes);
	summary.resultMetadataSha256 = sha256(readFileSync(resultMetadataPath));
	writeFileSync(runSummaryPath, `${stableStringify(summary)}\n`);
	writeFileSync(transportSummaryPath, `${stableStringify(summary)}\n`);

	const policy = readJson(transportPolicyPath);
	policy.status = 'passed';
	policy.issues = [];
	policy.hashes.lastMessageSha256 = sha256(substitutedRawBytes);
	policy.hashes.resultMetadataSha256 = sha256(readFileSync(resultMetadataPath));
	policy.responseDeltas = [substitutedRawText];
	policy.events = policy.events.map((event) =>
		event.type === 'delta' && event.channel === 'response'
			? { ...event, text: substitutedRawText }
			: event
	);
	writeFileSync(transportPolicyPath, `${stableStringify(policy)}\n`);

	const validation = readJson(validationPath);
	validation.outputSha256 = canonicalHash(substituted);
	validation.transportSummarySha256 = canonicalHash(summary);
	validation.transportPolicySha256 = canonicalHash(policy);
	writeFileSync(validationPath, `${stableStringify(validation)}\n`);
	const attempt = readJson(attemptPath);
	attempt.outputSha256 = validation.outputSha256;
	attempt.transportSummarySha256 = validation.transportSummarySha256;
	attempt.transportPolicySha256 = validation.transportPolicySha256;
	for (const relativePath of Object.keys(attempt.fileHashes)) {
		attempt.fileHashes[relativePath] = sha256(
			readFileSync(path.join(attemptRoot, ...relativePath.split('/')))
		);
	}
	writeFileSync(attemptPath, `${stableStringify(attempt)}\n`);

	const promptPath = path.join(outputRoot, 'candidate-prompts.json');
	const prompts = readJson(promptPath);
	prompts[0].stem = substituted.prompts[0].stem;
	writeFileSync(promptPath, `${stableStringify(prompts)}\n`);
	const collectionCheckPath = path.join(outputRoot, 'collection-checks', 'check-01.json');
	const collectionCheck = readJson(collectionCheckPath);
	collectionCheck.promptSetSha256 = canonicalHash(prompts);
	writeFileSync(collectionCheckPath, `${stableStringify(collectionCheck)}\n`);
	const evidencePath = path.join(outputRoot, 'authoring-evidence.json');
	const evidence = readJson(evidencePath);
	evidence.promptSetSha256 = canonicalHash(prompts);
	evidence.batches[0].outputSha256 = canonicalHash(substituted);
	evidence.batches[0].attemptSha256 = canonicalHash(attempt);
	evidence.runSha256 = evidenceRunSha256(evidence);
	writeFileSync(evidencePath, `${stableStringify(evidence)}\n`);
	rebindCompletionJournal(outputRoot);
	assert.equal(readFileSync(eventsPath).equals(originalEventBytes), true);

	await assert.rejects(
		runScienceChallengeShortRecallAuthoringForTest({
			candidateValue,
			expectedCount: 8,
			outputRoot,
			resume: true,
			transport: async () => {
				throw new Error('transport tamper replay unexpectedly called the model');
			}
		}),
		/attempt validation differs/
	);
});

test('self-rehashed completion tampering cannot bypass authoring or review resume validation', async (t) => {
	const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), 'science-short-recall-tamper-'));
	t.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
	const candidateValue = candidates(8);

	const tamperedAuthorRoot = path.join(temporaryRoot, 'author-tampered');
	await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 8,
		outputRoot: tamperedAuthorRoot,
		transport: mockTransport().transport,
		now: () => '2026-07-24T04:00:00.000Z'
	});
	const tamperedAuthorEvidencePath = path.join(tamperedAuthorRoot, 'authoring-evidence.json');
	const tamperedAuthorEvidence = readJson(tamperedAuthorEvidencePath);
	tamperedAuthorEvidence.modelVersions = ['forged-model-version'];
	tamperedAuthorEvidence.runSha256 = evidenceRunSha256(tamperedAuthorEvidence);
	writeFileSync(tamperedAuthorEvidencePath, `${stableStringify(tamperedAuthorEvidence)}\n`);
	rebindCompletionJournal(tamperedAuthorRoot);
	await assert.rejects(
		runScienceChallengeShortRecallAuthoringForTest({
			candidateValue,
			expectedCount: 8,
			outputRoot: tamperedAuthorRoot,
			resume: true,
			transport: async () => {
				throw new Error('tampered author resume unexpectedly called the model');
			}
		}),
		/stale or tampered/
	);

	const authorRoot = path.join(temporaryRoot, 'author');
	await runScienceChallengeShortRecallAuthoringForTest({
		candidateValue,
		expectedCount: 8,
		outputRoot: authorRoot,
		transport: mockTransport().transport,
		now: () => '2026-07-24T04:01:00.000Z'
	});
	const prompts = readJson(path.join(authorRoot, 'candidate-prompts.json'));
	const authoringEvidence = readJson(path.join(authorRoot, 'authoring-evidence.json'));
	const reviewRoot = path.join(temporaryRoot, 'review-tampered');
	await runScienceChallengeShortRecallReviewForTest({
		candidateValue,
		expectedCount: 8,
		prompts,
		authoringEvidence,
		outputRoot: reviewRoot,
		transport: mockTransport().transport,
		now: () => '2026-07-24T04:02:00.000Z'
	});
	const reviewEvidencePath = path.join(reviewRoot, 'review-evidence.json');
	const tamperedReviewEvidence = readJson(reviewEvidencePath);
	tamperedReviewEvidence.reviewCount = 0;
	tamperedReviewEvidence.runSha256 = evidenceRunSha256(tamperedReviewEvidence);
	writeFileSync(reviewEvidencePath, `${stableStringify(tamperedReviewEvidence)}\n`);
	rebindCompletionJournal(reviewRoot);
	await assert.rejects(
		runScienceChallengeShortRecallReviewForTest({
			candidateValue,
			expectedCount: 8,
			prompts,
			authoringEvidence,
			outputRoot: reviewRoot,
			resume: true,
			transport: async () => {
				throw new Error('tampered review resume unexpectedly called the model');
			}
		}),
		/stale or tampered/
	);
});
