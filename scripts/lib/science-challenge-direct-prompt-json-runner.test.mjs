import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	buildScienceChallengePromptJsonProviderPrompt,
	runDirectScienceChallengePromptJsonTurn
} from './science-challenge-direct-prompt-json-runner.mjs';
import {
	validateScienceChallengeAuthoringRunPolicy,
	validateScienceChallengeDirectPromptJsonRunPolicy
} from './science-challenge-authoring-run-policy.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
} from './science-challenge-authoring-transport.mjs';
import {
	canonicalHash,
	challengeBatchOutputSchema,
	stableStringify
} from './science-challenge-release.mjs';

test('prompt-json uses exact schema-free streamText call and validates raw JSON locally', async () => {
	const fixture = await createFixture({ whitespace: true });
	try {
		const policy = validateScienceChallengeAuthoringRunPolicy(policyInput(fixture));
		assert.equal(policy.status, 'passed', policy.issues.join('\n'));
		assert.equal(fixture.summary.responseMode, SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON);
		assert.equal(
			fixture.summary.transportVersion,
			SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION
		);
		assert.equal(fixture.summary.providerSchemaApplied, false);
		assert.equal(fixture.request.operation, 'streamText');
		assert.equal(fixture.request.input, fixture.providerPrompt);
		for (const forbidden of [
			'schema',
			'openAiSchemaName',
			'maxAttempts',
			'streamMode',
			'normalizeJson',
			'onEvent',
			'responseJsonSchema',
			'responseMimeType',
			'openAiTextFormat'
		]) {
			assert.equal(Object.hasOwn(fixture.callRequest, forbidden), false, forbidden);
			assert.equal(Object.hasOwn(fixture.request, forbidden), false, `evidence ${forbidden}`);
		}
		assert.equal(readFileSync(fixture.paths.lastMessagePath, 'utf8'), fixture.rawText);
		assert.equal(fixture.summary.finalJsonEvents, 0);
		assert.equal(fixture.resultMetadata.localValidationStatus, 'passed');
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('prompt-json rejects malformed and locally schema-invalid text without fallback', async () => {
	for (const rawText of [
		'```json\n{"schemaVersion":"science-challenge-batch/v1","challenges":[]}\n```',
		'{"schemaVersion":"wrong","challenges":[]}'
	]) {
		const root = mkdtempSync(path.join(tmpdir(), 'science-prompt-json-invalid-'));
		const paths = evidencePaths(root);
		let calls = 0;
		try {
			await assert.rejects(
				() =>
					runDirectScienceChallengePromptJsonTurn({
						prompt: 'Author no challenges.',
						outputSchema: challengeBatchOutputSchema(0),
						...paths,
						streamTextImpl: () => {
							calls += 1;
							return fakeCall(rawText);
						}
					}),
				/local response validation failed/
			);
			assert.equal(calls, 1);
			const summary = JSON.parse(readFileSync(paths.summaryPath, 'utf8'));
			assert.equal(summary.status, 'failed');
			assert.equal(summary.responseMode, SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON);
			assert.equal(
				JSON.parse(readFileSync(paths.resultMetadataPath, 'utf8')).localValidationStatus,
				'failed'
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
});

test('prompt-json rejects an omitted required nullable questionPresentation', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-prompt-json-required-nullable-'));
	const paths = evidencePaths(root);
	const rawValue = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [{ definition: { id: 'science-required-nullable' } }]
	};
	const rawText = JSON.stringify(rawValue);
	try {
		await assert.rejects(
			() =>
				runDirectScienceChallengePromptJsonTurn({
					prompt: 'Author one minimal schema fixture.',
					outputSchema: nullablePresentationSchema(),
					...paths,
					streamTextImpl: () => fakeCall(rawText)
				}),
			/local response validation failed/
		);
		const resultMetadata = JSON.parse(readFileSync(paths.resultMetadataPath, 'utf8'));

		assert.equal(readFileSync(paths.lastMessagePath, 'utf8'), rawText);
		assert.equal(resultMetadata.localValidationStatus, 'failed');
		assert.equal(resultMetadata.valueCanonicalSha256, null);
		assert.equal(Object.hasOwn(rawValue.challenges[0].definition, 'questionPresentation'), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('prompt-json policy rejects tamper, forbidden events and response-mode relabeling', async () => {
	const fixture = await createFixture();
	try {
		for (const mutate of [
			(input) => {
				input.requestBytes = Buffer.from(
					`${stableStringify({ ...fixture.request, responseJsonSchema: fixture.outputSchema })}\n`
				);
			},
			(input) => {
				input.eventLogBytes = Buffer.concat([
					fixture.eventLogBytes,
					Buffer.from('{"type":"json","stage":"final","value":{}}\n')
				]);
			},
			(input) => {
				input.lastMessageBytes = Buffer.from('{}');
			},
			(input) => {
				input.summary = {
					...input.summary,
					responseMode: 'structured-json'
				};
			}
		]) {
			const input = policyInput(fixture);
			mutate(input);
			const result = validateScienceChallengeDirectPromptJsonRunPolicy(input);
			assert.equal(result.status, 'failed');
		}
		const relabeled = {
			...fixture.summary,
			transportVersion: 'science-challenge-llm-direct-json/v1',
			responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
		};
		assert.equal(
			validateScienceChallengeAuthoringRunPolicy({
				...policyInput(fixture),
				summary: relabeled
			}).status,
			'failed'
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('prompt-json persists explicit high thinking and rejects every other alternate tier', async () => {
	const fixture = await createFixture({ thinkingLevel: 'high' });
	try {
		const validation = validateScienceChallengeDirectPromptJsonRunPolicy(policyInput(fixture));
		assert.equal(validation.status, 'passed', validation.issues.join('\n'));
		assert.equal(fixture.callRequest.thinkingLevel, 'high');
		assert.equal(fixture.request.thinkingLevel, 'high');
		assert.equal(fixture.summary.thinkingLevel, 'high');
		assert.equal(fixture.resultMetadata.thinkingLevel, 'high');
		for (const thinkingLevel of ['xhigh', 'medium', 'low']) {
			const root = mkdtempSync(path.join(tmpdir(), 'science-prompt-json-tier-'));
			try {
				await assert.rejects(
					() =>
						runDirectScienceChallengePromptJsonTurn({
							prompt: fixture.prompt,
							outputSchema: fixture.outputSchema,
							...evidencePaths(root),
							thinkingLevel,
							streamTextImpl: () => {
								throw new Error('must reject before streamText');
							}
						}),
					/thinkingLevel must be max or high/
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		}
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

async function createFixture({ whitespace = false, thinkingLevel = 'max' } = {}) {
	const root = mkdtempSync(path.join(tmpdir(), 'science-prompt-json-'));
	const paths = evidencePaths(root);
	const prompt = 'Author no release-grade science challenges.';
	const outputSchema = challengeBatchOutputSchema(0);
	const candidate = { schemaVersion: 'science-challenge-batch/v1', challenges: [] };
	const core = JSON.stringify(candidate);
	const rawText = whitespace ? ` \n${core}\n ` : core;
	const thoughts = 'Checked the local contract.';
	const usage = {
		promptTokens: 100,
		responseTokens: 20,
		thinkingTokens: 10,
		totalTokens: 130
	};
	const modelVersion = 'chatgpt-gpt-5.6-sol-2026-07-23';
	let callRequest = null;
	const streamTextImpl = (request) => {
		callRequest = request;
		assert.deepEqual(Object.keys(request).sort(), [
			'input',
			'model',
			'signal',
			'telemetry',
			'thinkingLevel',
			'tools'
		]);
		return {
			events: {
				async *[Symbol.asyncIterator]() {
					yield { type: 'delta', channel: 'thought', text: thoughts };
					yield { type: 'delta', channel: 'response', text: rawText.slice(0, 12) };
					yield { type: 'delta', channel: 'response', text: rawText.slice(12) };
					yield { type: 'model', modelVersion };
					yield { type: 'usage', usage, costUsd: 0.01, modelVersion };
				}
			},
			result: Promise.resolve({
				provider: 'chatgpt',
				model: SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
				modelVersion,
				text: rawText.trim(),
				thoughts,
				blocked: false,
				usage,
				costUsd: 0.01
			}),
			abort() {}
		};
	};
	await runDirectScienceChallengePromptJsonTurn({
		prompt,
		outputSchema,
		...paths,
		authMode: 'configured-proxy',
		thinkingLevel,
		streamTextImpl
	});
	return {
		root,
		paths,
		prompt,
		outputSchema,
		providerPrompt: buildScienceChallengePromptJsonProviderPrompt(prompt, outputSchema),
		rawText,
		callRequest,
		summary: JSON.parse(readFileSync(paths.summaryPath, 'utf8')),
		request: JSON.parse(readFileSync(paths.requestPath, 'utf8')),
		resultMetadata: JSON.parse(readFileSync(paths.resultMetadataPath, 'utf8')),
		eventLogBytes: readFileSync(paths.eventsPath),
		lastMessageBytes: readFileSync(paths.lastMessagePath),
		thoughtsBytes: readFileSync(paths.thoughtsPath),
		requestBytes: readFileSync(paths.requestPath),
		resultMetadataBytes: readFileSync(paths.resultMetadataPath),
		promptBytes: Buffer.from(`${prompt}\n`)
	};
}

function evidencePaths(root) {
	return {
		eventsPath: path.join(root, 'events.jsonl'),
		lastMessagePath: path.join(root, 'last-message.json'),
		thoughtsPath: path.join(root, 'thoughts.txt'),
		requestPath: path.join(root, 'request.json'),
		resultMetadataPath: path.join(root, 'result-metadata.json'),
		summaryPath: path.join(root, 'run-summary.json')
	};
}

function fakeCall(rawText) {
	const modelVersion = 'chatgpt-gpt-5.6-sol-2026-07-23';
	const usage = { promptTokens: 1, responseTokens: 1, thinkingTokens: 1, totalTokens: 3 };
	return {
		events: {
			async *[Symbol.asyncIterator]() {
				yield { type: 'delta', channel: 'response', text: rawText };
				yield { type: 'model', modelVersion };
				yield { type: 'usage', usage, costUsd: 0, modelVersion };
			}
		},
		result: Promise.resolve({
			provider: 'chatgpt',
			model: SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
			modelVersion,
			text: rawText,
			thoughts: '',
			blocked: false,
			usage,
			costUsd: 0
		}),
		abort() {}
	};
}

function nullablePresentationSchema() {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['schemaVersion', 'challenges'],
		properties: {
			schemaVersion: { type: 'string', const: 'science-challenge-batch/v1' },
			challenges: {
				type: 'array',
				minItems: 1,
				maxItems: 1,
				items: {
					type: 'object',
					additionalProperties: false,
					required: ['definition'],
					properties: {
						definition: {
							type: 'object',
							additionalProperties: false,
							required: ['id', 'questionPresentation'],
							properties: {
								id: { type: 'string', minLength: 1 },
								questionPresentation: { type: ['object', 'null'] }
							}
						}
					}
				}
			}
		}
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
