import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	configureScienceChallengeDirectJsonTransport,
	runDirectScienceChallengeJsonTurn
} from './science-challenge-direct-json-runner.mjs';
import {
	validateScienceChallengeAuthoringRunPolicy,
	validateScienceChallengeDirectJsonRunPolicy
} from './science-challenge-authoring-run-policy.mjs';
import { findBoundToolFreeScienceChallengeAuthoringAttempt } from './science-challenge-authoring-attempt.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	challengeBatchOutputSchema,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';

test('persists and validates truthful inherently tool-free direct JSON evidence', async () => {
	const fixture = await createFixture();
	try {
		const validation = validateScienceChallengeAuthoringRunPolicy(policyInput(fixture));
		assert.equal(validation.status, 'passed', validation.issues.join('\n'));
		assert.equal(fixture.summary.transport, SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT);
		assert.equal(fixture.summary.provider, 'chatgpt');
		assert.equal(fixture.summary.model, SCIENCE_CHALLENGE_DIRECT_JSON_MODEL);
		assert.equal(fixture.summary.thinkingLevel, 'max');
		assert.equal(fixture.summary.toolCalls, 0);
		assert.equal(fixture.summary.hostedTools, 0);
		assert.deepEqual(fixture.request.tools, []);
		assert.equal(fixture.request.maxAttempts, 1);
		assert.equal(fixture.request.streamMode, 'final');
		assert.equal(fixture.resultMetadata.provider, 'chatgpt');
		assert.equal(fixture.resultMetadata.modelVersion, 'chatgpt-gpt-5.6-sol-2026-07-23');
		assert.deepEqual(fixture.summary.usage, {
			promptTokens: 120,
			responseTokens: 40,
			thinkingTokens: 30,
			totalTokens: 190
		});
		assert.equal(readFileSync(fixture.paths.lastMessage, 'utf8'), fixture.rawText);
		assert.equal(readFileSync(fixture.paths.thoughts, 'utf8'), fixture.thoughts);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('rejects tampered request, output, thoughts, events and result metadata', async () => {
	const fixture = await createFixture();
	try {
		for (const [field, value, expected] of [
			[
				'requestBytes',
				Buffer.from(`${stableStringify({ ...fixture.request, tools: ['web'] })}\n`),
				/request/
			],
			[
				'lastMessageBytes',
				Buffer.from('{"schemaVersion":"tampered","challenges":[]}'),
				/last-message|response deltas|raw output/
			],
			['thoughtsBytes', Buffer.from('different thoughts'), /thought deltas|thought bytes/],
			[
				'eventLogBytes',
				Buffer.concat([
					fixture.eventLogBytes,
					Buffer.from('{"type":"tool_call","phase":"started","toolName":"web","toolId":"1"}\n')
				]),
				/forbidden tool_call/
			],
			[
				'resultMetadataBytes',
				Buffer.from(`${stableStringify({ ...fixture.resultMetadata, provider: 'openai' })}\n`),
				/result metadata/
			],
			[
				'requestBytes',
				Buffer.from(
					`${stableStringify({
						...fixture.request,
						responseJsonSchema: { type: 'object', additionalProperties: true }
					})}\n`
				),
				/expected structured response schema/
			]
		]) {
			const input = policyInput(fixture);
			input[field] = value;
			const validation = validateScienceChallengeDirectJsonRunPolicy(input);
			assert.equal(validation.status, 'failed', field);
			assert.match(validation.issues.join('\n'), expected, field);
		}
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('rejects missing direct evidence and provider/model/thinking mismatches', async () => {
	const fixture = await createFixture();
	try {
		for (const missingField of [
			'requestBytes',
			'thoughtsBytes',
			'resultMetadataBytes',
			'eventLogBytes',
			'lastMessageBytes',
			'promptBytes'
		]) {
			const input = policyInput(fixture);
			delete input[missingField];
			const validation = validateScienceChallengeDirectJsonRunPolicy(input);
			assert.equal(validation.status, 'failed', missingField);
		}
		for (const [field, value, expected] of [
			['provider', 'openai', /provider must be chatgpt/],
			['model', 'gpt-5.6-sol', /model must be chatgpt-gpt-5.6-sol/],
			['thinkingLevel', 'high', /thinkingLevel must be max/],
			['authMode', 'api-key', /authMode is invalid/]
		]) {
			const input = policyInput(fixture);
			input.summary = { ...input.summary, [field]: value };
			const validation = validateScienceChallengeDirectJsonRunPolicy(input);
			assert.equal(validation.status, 'failed');
			assert.match(validation.issues.join('\n'), expected);
		}
		const stalePromptBinding = policyInput(fixture);
		stalePromptBinding.summary = {
			...stalePromptBinding.summary,
			inputEvidence: {
				...stalePromptBinding.summary.inputEvidence,
				promptSha256: '0'.repeat(64)
			}
		};
		assert.match(
			validateScienceChallengeDirectJsonRunPolicy(stalePromptBinding).issues.join('\n'),
			/inputEvidence does not bind/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('proxy configuration fails closed on half-configured credentials without a model call', () => {
	assert.throws(
		() =>
			configureScienceChallengeDirectJsonTransport({
				CHATGPT_CODEX_PROXY_URL: 'https://example.test/proxy'
			}),
		/must either both be set or both be absent/
	);
	assert.equal(configureScienceChallengeDirectJsonTransport({}), 'default-chatgpt-profile');
});

test('direct transport requests cancellation and retains failed-run evidence on timeout', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-direct-json-timeout-'));
	const attemptRoot = path.join(root, 'attempt-01');
	const paths = {
		eventsPath: path.join(attemptRoot, 'events.jsonl'),
		lastMessagePath: path.join(attemptRoot, 'last-message.json'),
		thoughtsPath: path.join(attemptRoot, 'thoughts.txt'),
		requestPath: path.join(attemptRoot, 'request.json'),
		resultMetadataPath: path.join(attemptRoot, 'result-metadata.json'),
		summaryPath: path.join(attemptRoot, 'run-summary.json')
	};
	let abortCalls = 0;
	try {
		await assert.rejects(
			() =>
				runDirectScienceChallengeJsonTurn({
					prompt: 'Author one release-grade science challenge.',
					outputSchema: challengeBatchOutputSchema(0),
					...paths,
					timeoutMs: 5,
					streamJsonImpl: (request) => {
						let rejectResult;
						const result = new Promise((_, reject) => {
							rejectResult = reject;
						});
						request.signal.addEventListener('abort', () => rejectResult(request.signal.reason), {
							once: true
						});
						return {
							events: {
								async *[Symbol.asyncIterator]() {
									await result;
									yield { type: 'blocked' };
								}
							},
							result,
							abort() {
								abortCalls += 1;
							}
						};
					}
				}),
			/timed out/
		);
		const summary = JSON.parse(readFileSync(paths.summaryPath, 'utf8'));
		assert.equal(summary.status, 'failed');
		assert.match(summary.error, /timed out/);
		assert.equal(summary.transport, SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT);
		assert.equal(summary.resultMetadataSha256, null);
		assert.equal(abortCalls, 1);
		assert.equal(JSON.parse(readFileSync(paths.requestPath, 'utf8')).tools.length, 0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('observes an early rejected result while draining slower events and persists partial evidence', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-direct-json-early-rejection-'));
	const attemptRoot = path.join(root, 'attempt-01');
	const paths = {
		eventsPath: path.join(attemptRoot, 'events.jsonl'),
		lastMessagePath: path.join(attemptRoot, 'last-message.json'),
		thoughtsPath: path.join(attemptRoot, 'thoughts.txt'),
		requestPath: path.join(attemptRoot, 'request.json'),
		resultMetadataPath: path.join(attemptRoot, 'result-metadata.json'),
		summaryPath: path.join(attemptRoot, 'run-summary.json')
	};
	const unhandled = [];
	const onUnhandled = (error) => unhandled.push(error);
	process.on('unhandledRejection', onUnhandled);
	let abortCalls = 0;
	try {
		await assert.rejects(
			() =>
				runDirectScienceChallengeJsonTurn({
					prompt: 'Author one release-grade science challenge.',
					outputSchema: challengeBatchOutputSchema(0),
					...paths,
					timeoutMs: 1_000,
					streamJsonImpl: () => ({
						events: {
							async *[Symbol.asyncIterator]() {
								yield { type: 'delta', channel: 'thought', text: 'Partial thought.' };
								await new Promise((resolve) => setTimeout(resolve, 15));
								yield {
									type: 'model',
									modelVersion: 'chatgpt-gpt-5.6-sol-2026-07-23'
								};
							}
						},
						result: Promise.reject(
							new Error('LLM JSON call failed after 1 attempt: rawText was empty')
						),
						abort() {
							abortCalls += 1;
						}
					})
				}),
			/rawText was empty/
		);
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(unhandled, []);
		const summary = JSON.parse(readFileSync(paths.summaryPath, 'utf8'));
		assert.equal(summary.status, 'failed');
		assert.match(summary.error, /rawText was empty/);
		assert.equal(summary.events, 2);
		assert.equal(summary.thoughtDeltas, 1);
		assert.equal(readFileSync(paths.thoughtsPath, 'utf8'), 'Partial thought.');
		assert.equal(readFileSync(paths.lastMessagePath, 'utf8'), '');
		assert.equal(summary.resultMetadataSha256, null);
		assert.equal(abortCalls, 1);
	} finally {
		process.off('unhandledRejection', onUnhandled);
		rmSync(root, { recursive: true, force: true });
	}
});

test('resume discovery accepts a bound direct attempt and rejects missing direct files', async () => {
	const fixture = await createFixture();
	try {
		const validation = {
			status: 'passed',
			issues: [],
			inputSha256: 'a'.repeat(64),
			rawCandidateSha256: canonicalHash(fixture.candidate),
			normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
			candidateSha256: canonicalHash(fixture.candidate),
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			promptSha256: sha256(fixture.promptBytes),
				runSummarySha256: canonicalHash(fixture.summary),
				transport: fixture.summary.transport,
				transportVersion: fixture.summary.transportVersion,
				responseMode: fixture.summary.responseMode,
				providerSchemaApplied: fixture.summary.providerSchemaApplied,
				provider: fixture.summary.provider,
			model: fixture.summary.model,
			modelVersion: fixture.summary.modelVersion,
			thinkingLevel: fixture.summary.thinkingLevel
		};
		writeFileSync(
			path.join(fixture.attemptRoot, 'candidate.json'),
			`${stableStringify(fixture.candidate)}\n`
		);
		writeFileSync(
			path.join(fixture.attemptRoot, 'validation.json'),
			`${stableStringify(validation)}\n`
		);
		writeFileSync(path.join(fixture.root, 'prompt-attempt-1.txt'), fixture.promptBytes);
		assert.equal(
			findBoundToolFreeScienceChallengeAuthoringAttempt({
				shardDir: fixture.root,
				acceptedCandidate: fixture.candidate,
				acceptedValidation: validation
			}).status,
			'passed'
		);

		rmSync(fixture.paths.thoughts);
		const missing = findBoundToolFreeScienceChallengeAuthoringAttempt({
			shardDir: fixture.root,
			acceptedCandidate: fixture.candidate,
			acceptedValidation: validation
		});
		assert.equal(missing.status, 'failed');
		assert.match(missing.issues.join('\n'), /missing required thoughts authoring evidence/);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

async function createFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'science-direct-json-'));
	const attemptRoot = path.join(root, 'attempt-01');
	const paths = {
		events: path.join(attemptRoot, 'events.jsonl'),
		lastMessage: path.join(attemptRoot, 'last-message.json'),
		thoughts: path.join(attemptRoot, 'thoughts.txt'),
		request: path.join(attemptRoot, 'request.json'),
		resultMetadata: path.join(attemptRoot, 'result-metadata.json'),
		summary: path.join(attemptRoot, 'run-summary.json')
	};
	const prompt = 'Author one release-grade science challenge.';
	const candidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: []
	};
	const outputSchema = challengeBatchOutputSchema(0);
	const rawText = JSON.stringify(candidate);
	const thoughts = 'Checked the exact curriculum and structured-output contract.';
	const usage = {
		promptTokens: 120,
		responseTokens: 40,
		thinkingTokens: 30,
		totalTokens: 190
	};
	const modelVersion = 'chatgpt-gpt-5.6-sol-2026-07-23';
	const events = [
		{ type: 'delta', channel: 'thought', text: thoughts },
		{ type: 'delta', channel: 'response', text: rawText.slice(0, 24) },
		{ type: 'delta', channel: 'response', text: rawText.slice(24) },
		{ type: 'model', modelVersion },
		{ type: 'usage', usage, costUsd: 0.0123, modelVersion },
		{ type: 'json', stage: 'final', value: candidate }
	];
	const streamJsonImpl = (request) => {
		assert.equal(request.model, SCIENCE_CHALLENGE_DIRECT_JSON_MODEL);
		assert.equal(request.thinkingLevel, 'max');
		assert.deepEqual(request.tools, []);
		assert.equal(request.maxAttempts, 1);
		assert.equal(request.streamMode, 'final');
		assert.deepEqual(request.schema.parse(candidate), candidate);
		return {
			events: {
				async *[Symbol.asyncIterator]() {
					for (const event of events) yield event;
				}
			},
			result: Promise.resolve({
				value: candidate,
				rawText,
				result: {
					provider: 'chatgpt',
					model: SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
					modelVersion,
					text: rawText,
					thoughts,
					blocked: false,
					usage,
					costUsd: 0.0123
				}
			}),
			abort() {}
		};
	};
	const run = await runDirectScienceChallengeJsonTurn({
		prompt,
		outputSchema,
		eventsPath: paths.events,
		lastMessagePath: paths.lastMessage,
		thoughtsPath: paths.thoughts,
		requestPath: paths.request,
		resultMetadataPath: paths.resultMetadata,
		summaryPath: paths.summary,
		authMode: 'configured-proxy',
		streamJsonImpl
	});
	return {
		root,
		attemptRoot,
		paths,
		prompt,
		outputSchema,
		candidate,
		rawText,
		thoughts,
		run,
		summary: JSON.parse(readFileSync(paths.summary, 'utf8')),
		request: JSON.parse(readFileSync(paths.request, 'utf8')),
		resultMetadata: JSON.parse(readFileSync(paths.resultMetadata, 'utf8')),
		eventLogBytes: readFileSync(paths.events),
		lastMessageBytes: readFileSync(paths.lastMessage),
		thoughtsBytes: readFileSync(paths.thoughts),
		requestBytes: readFileSync(paths.request),
		resultMetadataBytes: readFileSync(paths.resultMetadata),
		promptBytes: Buffer.from(`${prompt}\n`)
	};
}

function policyInput(fixture) {
	return {
		summary: fixture.summary,
		eventLogBytes: fixture.eventLogBytes,
		lastMessageBytes: fixture.lastMessageBytes,
		promptBytes: fixture.promptBytes,
		requestBytes: fixture.requestBytes,
		thoughtsBytes: fixture.thoughtsBytes,
		resultMetadataBytes: fixture.resultMetadataBytes,
		expectedResponseJsonSchema: fixture.outputSchema
	};
}
