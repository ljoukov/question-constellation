import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

import { streamText } from '@ljoukov/llm';
import { canonicalHash, stableStringify } from './science-challenge-release.mjs';
import { scienceChallengeAuthoringProviderSchema } from './science-challenge-authoring-provider-schema.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_REQUEST_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_RESULT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
} from './science-challenge-authoring-transport.mjs';

export function buildScienceChallengePromptJsonProviderPrompt(prompt, outputSchema) {
	if (typeof prompt !== 'string' || !prompt.trim()) {
		throw new Error('Prompt-JSON authoring prompt must be non-empty.');
	}
	if (!outputSchema || typeof outputSchema !== 'object' || Array.isArray(outputSchema)) {
		throw new Error('Prompt-JSON authoring requires a local JSON object response schema.');
	}
	return `${prompt}

PROMPT-JSON LOCAL RESPONSE CONTRACT
Return exactly one JSON object and nothing else: no Markdown fence, preamble or trailing note.
The provider is not applying a response schema. You must satisfy this exact local JSON Schema:
${stableStringify(outputSchema)}`;
}

export async function runDirectScienceChallengePromptJsonTurn({
	prompt,
	outputSchema,
	eventsPath,
	lastMessagePath,
	thoughtsPath,
	requestPath,
	resultMetadataPath,
	summaryPath,
	model = SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	thinkingLevel = 'max',
	timeoutMs = 7_200_000,
	authMode = 'default-chatgpt-profile',
	streamTextImpl = streamText
}) {
	const providerPrompt = buildScienceChallengePromptJsonProviderPrompt(prompt, outputSchema);
	for (const [label, filePath] of [
		['eventsPath', eventsPath],
		['lastMessagePath', lastMessagePath],
		['thoughtsPath', thoughtsPath],
		['requestPath', requestPath],
		['resultMetadataPath', resultMetadataPath],
		['summaryPath', summaryPath]
	]) {
		if (typeof filePath !== 'string' || !filePath.trim()) {
			throw new Error(`${label} must be a non-empty path.`);
		}
		mkdirSync(path.dirname(filePath), { recursive: true });
	}
	if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
		throw new Error('Prompt-JSON authoring timeoutMs must be a positive integer.');
	}
	if (!['max', 'high'].includes(thinkingLevel)) {
		throw new Error('Prompt-JSON authoring thinkingLevel must be max or high.');
	}
	const localResponseSchemaSha256 = canonicalHash(outputSchema);
	const request = {
		schemaVersion: SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_REQUEST_SCHEMA,
		transport: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
		transportVersion: SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
		responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
		providerSchemaApplied: false,
		operation: 'streamText',
		provider: SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
		model,
		thinkingLevel,
		tools: [],
		responsesWebSocketMode: 'off',
		telemetry: false,
		sourcePromptSha256: sha256(`${prompt}\n`),
		providerPromptSha256: sha256(providerPrompt),
		localResponseSchemaSha256,
		input: providerPrompt
	};
	writeJson(requestPath, request);
	writeFileSync(eventsPath, '');
	writeFileSync(lastMessagePath, '');
	writeFileSync(thoughtsPath, '');
	writeFileSync(resultMetadataPath, '');

	const controller = new AbortController();
	let activeCall = null;
	let activeCallAborted = false;
	const abortActiveCall = () => {
		if (!activeCall || activeCallAborted) return;
		activeCallAborted = true;
		activeCall.abort();
	};
	const timer = setTimeout(() => {
		controller.abort(new Error(`Prompt-JSON authoring timed out after ${timeoutMs} ms.`));
		abortActiveCall();
	}, timeoutMs);
	const startedAt = new Date().toISOString();
	const started = performance.now();
	const events = [];
	let responseText = '';
	let thoughts = '';
	let output = null;
	let parsedValue = null;
	let localValidationError = null;
	let failedError = null;
	try {
		activeCall = streamTextImpl({
			model,
			thinkingLevel,
			tools: [],
			telemetry: false,
			signal: controller.signal,
			input: providerPrompt
		});
		const observedResult = observePromiseResult(activeCall.result);
		const observedEvents = observePromiseResult(
			(async () => {
				for await (const event of activeCall.events) {
					events.push(event);
					writeFileSync(eventsPath, `${JSON.stringify(event)}\n`, { flag: 'a' });
					if (event?.type === 'delta' && event.channel === 'response') {
						responseText += event.text ?? '';
						writeFileSync(lastMessagePath, responseText);
					}
					if (event?.type === 'delta' && event.channel === 'thought') {
						thoughts += event.text ?? '';
						writeFileSync(thoughtsPath, thoughts);
					}
				}
			})()
		);
		const firstOutcome = await Promise.race([
			observedResult.then((outcome) => ({ source: 'result', outcome })),
			observedEvents.then((outcome) => ({ source: 'events', outcome }))
		]);
		if (!firstOutcome.outcome.ok) abortActiveCall();
		const [eventOutcome, resultOutcome] = await Promise.all([observedEvents, observedResult]);
		if (!resultOutcome.ok) throw resultOutcome.error;
		if (!eventOutcome.ok) throw eventOutcome.error;
		output = resultOutcome.value;
		if (!output || typeof output !== 'object' || typeof output.text !== 'string') {
			throw new Error('Prompt-JSON authoring returned no text result.');
		}
		if (
			output.text.trim() !== responseText.trim() ||
			String(output.thoughts ?? '').trim() !== thoughts.trim()
		) {
			throw new Error('Prompt-JSON result text differs from its raw streamed deltas.');
		}
		try {
			const rawParsedValue = JSON.parse(responseText);
			parsedValue = scienceChallengeAuthoringProviderSchema(outputSchema).parse(rawParsedValue);
		} catch (error) {
			localValidationError = error instanceof Error ? error.message : String(error);
			throw new Error(`Prompt-JSON local response validation failed: ${localValidationError}`, {
				cause: error
			});
		}
	} catch (error) {
		abortActiveCall();
		failedError = error instanceof Error ? error.message : String(error);
	} finally {
		clearTimeout(timer);
	}

	const finishedAt = new Date().toISOString();
	const durationMilliseconds = Math.max(0, Math.round(performance.now() - started));
	const lastMessageBytes = readFileSync(lastMessagePath);
	const thoughtsBytes = readFileSync(thoughtsPath);
	const eventLogBytes = readFileSync(eventsPath);
	const requestBytes = readFileSync(requestPath);
	const resultMetadata = output
		? {
				schemaVersion: SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_RESULT_SCHEMA,
				transport: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
				transportVersion: SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
				responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
				providerSchemaApplied: false,
				provider: output.provider ?? null,
				model: output.model ?? null,
				modelVersion: output.modelVersion ?? null,
				thinkingLevel,
				blocked: output.blocked ?? null,
				usage: output.usage ?? null,
				costUsd: output.costUsd ?? null,
				rawTextSha256: sha256(lastMessageBytes),
				thoughtsSha256: sha256(thoughtsBytes),
				localResponseSchemaSha256,
				localValidationStatus: parsedValue === null ? 'failed' : 'passed',
				localValidationError,
				valueCanonicalSha256: parsedValue === null ? null : canonicalHash(parsedValue),
				startedAt,
				finishedAt,
				durationMilliseconds
			}
		: null;
	if (resultMetadata) writeJson(resultMetadataPath, resultMetadata);
	const resultMetadataBytes = resultMetadata ? readFileSync(resultMetadataPath) : Buffer.alloc(0);
	const summary = {
		status: failedError ? 'failed' : 'passed',
		error: failedError,
		transport: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
		transportVersion: SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
		responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
		providerSchemaApplied: false,
		authMode,
		provider: output?.provider ?? null,
		model,
		modelVersion: output?.modelVersion ?? null,
		thinkingLevel,
		blocked: output?.blocked ?? null,
		usage: output?.usage ?? null,
		costUsd: output?.costUsd ?? null,
		commandActions: 0,
		failedCommandActions: 0,
		webSearches: 0,
		fileChanges: 0,
		toolCalls: 0,
		hostedTools: 0,
		events: events.length,
		responseDeltas: events.filter(
			(event) => event?.type === 'delta' && event.channel === 'response'
		).length,
		thoughtDeltas: events.filter((event) => event?.type === 'delta' && event.channel === 'thought')
			.length,
		modelEvents: events.filter((event) => event?.type === 'model').length,
		usageEvents: events.filter((event) => event?.type === 'usage').length,
		finalJsonEvents: 0,
		startedAt,
		finishedAt,
		durationMilliseconds,
		durationSeconds: Number((durationMilliseconds / 1000).toFixed(3)),
		requestSha256: sha256(requestBytes),
		requestCanonicalSha256: canonicalHash(request),
		responseSchemaSha256: localResponseSchemaSha256,
		localResponseSchemaSha256,
		eventLogSha256: sha256(eventLogBytes),
		finalResponseSha256: sha256(lastMessageBytes),
		lastMessageFileSha256: sha256(lastMessageBytes),
		thoughtsSha256: sha256(thoughtsBytes),
		resultMetadataSha256: resultMetadata ? sha256(resultMetadataBytes) : null,
		inputEvidence: {
			mode: 'text',
			responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
			promptSha256: sha256(`${prompt}\n`),
			providerPromptSha256: sha256(providerPrompt),
			requestSha256: sha256(requestBytes),
			responseSchemaSha256: localResponseSchemaSha256
		}
	};
	writeJson(summaryPath, summary);
	if (failedError) throw new Error(failedError);
	return { ...summary, finalResponse: responseText };
}

function writeJson(filePath, value) {
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function observePromiseResult(promise) {
	return Promise.resolve(promise).then(
		(value) => ({ ok: true, value }),
		(error) => ({ ok: false, error })
	);
}
