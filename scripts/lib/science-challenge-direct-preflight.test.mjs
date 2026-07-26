import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_PROMPT,
	SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN,
	SCIENCE_CHALLENGE_DIRECT_STRUCTURED_PREFLIGHT_PROMPT,
	runScienceChallengeDirectTransportPreflight,
	runScienceChallengeGenerationBehindPreflight
} from './science-challenge-direct-preflight.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';

test('direct preflight sends one minimal schema-free canary and accepts the exact token', async () => {
	const requests = [];
	const result = await runScienceChallengeDirectTransportPreflight({
		model: 'chatgpt-gpt-5.6-sol',
		thinkingLevel: 'high',
		authMode: 'configured-proxy',
		responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
		streamTextImpl: (request) => {
			requests.push(request);
			return fakeCall(SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN);
		}
	});

	assert.equal(requests.length, 1);
	assert.deepEqual(
		{
			model: requests[0].model,
			thinkingLevel: requests[0].thinkingLevel,
			tools: requests[0].tools,
			telemetry: requests[0].telemetry,
			input: requests[0].input
		},
		{
			model: 'chatgpt-gpt-5.6-sol',
			thinkingLevel: 'high',
			tools: [],
			telemetry: false,
			input: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_PROMPT
		}
	);
	for (const forbidden of ['schema', 'responseJsonSchema', 'openAiSchemaName', 'maxAttempts']) {
		assert.equal(Object.hasOwn(requests[0], forbidden), false);
	}
	assert.equal(result.status, 'passed');
	assert.equal(result.token, SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN);
	assert.equal(result.authMode, 'configured-proxy');
	assert.equal(result.responseMode, SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON);
});

test('structured direct preflight uses the schema-constrained streamJson path', async () => {
	const requests = [];
	let textCalls = 0;
	const result = await runScienceChallengeDirectTransportPreflight({
		model: 'chatgpt-gpt-5.6-sol',
		thinkingLevel: 'max',
		authMode: 'configured-proxy',
		responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
		streamTextImpl: () => {
			textCalls += 1;
			throw new Error('wrong path');
		},
		streamJsonImpl: (request) => {
			requests.push(request);
			return fakeStructuredCall();
		}
	});

	assert.equal(textCalls, 0);
	assert.equal(requests.length, 1);
	assert.deepEqual(
		{
			model: requests[0].model,
			thinkingLevel: requests[0].thinkingLevel,
			tools: requests[0].tools,
			telemetry: requests[0].telemetry,
			openAiSchemaName: requests[0].openAiSchemaName,
			maxAttempts: requests[0].maxAttempts,
			streamMode: requests[0].streamMode,
			input: requests[0].input
		},
		{
			model: 'chatgpt-gpt-5.6-sol',
			thinkingLevel: 'max',
			tools: [],
			telemetry: false,
			openAiSchemaName: 'science_challenge_preflight',
			maxAttempts: 1,
			streamMode: 'final',
			input: SCIENCE_CHALLENGE_DIRECT_STRUCTURED_PREFLIGHT_PROMPT
		}
	);
	assert.deepEqual(requests[0].schema.parse({ token: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN }), {
		token: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN
	});
	assert.equal(
		requests[0].schema.safeParse({ token: `${SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN}.` }).success,
		false
	);
	assert.equal(result.status, 'passed');
	assert.equal(result.token, SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN);
	assert.equal(result.responseMode, SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON);
	assert.equal(result.authMode, 'configured-proxy');
});

test('direct preflight rejects unsupported response modes before either transport runs', async () => {
	let calls = 0;
	await assert.rejects(
		() =>
			runScienceChallengeDirectTransportPreflight({
				responseMode: 'automatic',
				streamTextImpl: () => {
					calls += 1;
				},
				streamJsonImpl: () => {
					calls += 1;
				}
			}),
		/Unsupported direct authoring preflight response mode automatic/
	);
	assert.equal(calls, 0);
});

test('direct preflight fails clearly on transport failure or an inexact response', async () => {
	await assert.rejects(
		() =>
			runScienceChallengeDirectTransportPreflight({
				streamTextImpl: () => {
					throw new Error('fetch failed');
				}
			}),
		/preflight failed before any authoring or repair attempt was allocated: fetch failed/
	);
	await assert.rejects(
		() =>
			runScienceChallengeDirectTransportPreflight({
				streamTextImpl: () => fakeCall(`${SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN}.`)
			}),
		/model did not return the exact preflight token/
	);
});

test('direct preflight enforces its deadline when the transport ignores abort', async () => {
	const never = new Promise(() => {});
	let abortCalls = 0;
	const started = performance.now();
	await assert.rejects(
		() =>
			runScienceChallengeDirectTransportPreflight({
				timeoutMs: 10,
				streamTextImpl: () => ({
					result: never,
					events: {
						[Symbol.asyncIterator]() {
							return this;
						},
						next() {
							return never;
						}
					},
					abort() {
						abortCalls += 1;
						throw new Error('cleanup failed');
					}
				})
			}),
		/timed out after 10 ms/
	);
	assert.equal(abortCalls, 1);
	assert.ok(performance.now() - started < 1_000);
});

test('direct preflight rejects mismatched non-null provider and model metadata', async () => {
	await assert.rejects(
		() =>
			runScienceChallengeDirectTransportPreflight({
				streamTextImpl: () =>
					fakeCall(SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN, {
						provider: 'unexpected-provider'
					})
			}),
		/reported provider unexpected-provider instead of chatgpt/
	);
	await assert.rejects(
		() =>
			runScienceChallengeDirectTransportPreflight({
				model: 'chatgpt-gpt-5.6-sol',
				streamTextImpl: () =>
					fakeCall(SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN, {
						model: 'chatgpt-other-model'
					})
			}),
		/reported model chatgpt-other-model instead of requested chatgpt-gpt-5.6-sol/
	);
});

test('preflight gate never enters generation after a failed canary', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-direct-preflight-gate-'));
	const attemptDir = path.join(root, 'verification-repair-test-attempt-01');
	let generated = 0;
	try {
		await assert.rejects(
			() =>
				runScienceChallengeGenerationBehindPreflight({
					preflight: async () => {
						throw new Error('offline');
					},
					generate: async () => {
						generated += 1;
						mkdirSync(attemptDir, { recursive: true });
					}
				}),
			/offline/
		);
		assert.equal(generated, 0);
		assert.equal(existsSync(attemptDir), false);

		await assert.rejects(
			() =>
				runScienceChallengeGenerationBehindPreflight({
					preflight: async () => ({ status: 'failed' }),
					generate: async () => {
						generated += 1;
						mkdirSync(attemptDir, { recursive: true });
					}
				}),
			/requires an explicitly passed preflight/
		);
		assert.equal(generated, 0);
		assert.equal(existsSync(attemptDir), false);

		const passed = await runScienceChallengeGenerationBehindPreflight({
			preflight: async () => ({ status: 'passed' }),
			generate: async () => {
				generated += 1;
				mkdirSync(attemptDir, { recursive: true });
				return ['generated'];
			}
		});
		assert.equal(generated, 1);
		assert.equal(existsSync(attemptDir), true);
		assert.deepEqual(passed.result, ['generated']);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

function fakeCall(text, overrides = {}) {
	return {
		result: Promise.resolve({
			text,
			provider: 'chatgpt',
			model: 'chatgpt-gpt-5.6-sol',
			modelVersion: 'test-version',
			...overrides
		}),
		events: (async function* () {
			yield { type: 'delta', channel: 'response', text };
		})(),
		abort() {}
	};
}

function fakeStructuredCall(overrides = {}) {
	const value = { token: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN };
	const rawText = JSON.stringify(value);
	return {
		result: Promise.resolve({
			rawText,
			value,
			result: {
				provider: 'chatgpt',
				model: 'chatgpt-gpt-5.6-sol',
				modelVersion: 'test-version',
				...overrides
			}
		}),
		events: (async function* () {
			yield { type: 'delta', channel: 'response', text: rawText };
		})(),
		abort() {}
	};
}
