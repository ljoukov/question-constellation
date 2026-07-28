import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

import { configureChatGptCodexProxy, streamJson } from '@ljoukov/llm';
import { canonicalHash, stableStringify } from './science-challenge-release.mjs';
import { scienceChallengeAuthoringProviderSchema } from './science-challenge-authoring-provider-schema.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
	SCIENCE_CHALLENGE_DIRECT_JSON_REQUEST_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_JSON_RESULT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';

export {
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
	SCIENCE_CHALLENGE_DIRECT_JSON_REQUEST_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_JSON_RESULT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION
} from './science-challenge-authoring-transport.mjs';

export function configureScienceChallengeDirectJsonTransport(environment = process.env) {
	const url = environment.CHATGPT_CODEX_PROXY_URL;
	const apiKey = environment.CHATGPT_CODEX_PROXY_API_KEY;
	if (Boolean(url) !== Boolean(apiKey)) {
		throw new Error(
			'CHATGPT_CODEX_PROXY_URL and CHATGPT_CODEX_PROXY_API_KEY must either both be set or both be absent.'
		);
	}
	environment.CHATGPT_RESPONSES_WEBSOCKET_MODE = 'off';
	if (url && apiKey) {
		configureChatGptCodexProxy({ url, apiKey });
		return 'configured-proxy';
	}
	return 'default-chatgpt-profile';
}

export async function runDirectScienceChallengeJsonTurn({
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
	streamJsonImpl = streamJson
}) {
	if (typeof prompt !== 'string' || !prompt.trim()) {
		throw new Error('Direct JSON authoring prompt must be non-empty.');
	}
	if (!outputSchema || typeof outputSchema !== 'object' || Array.isArray(outputSchema)) {
		throw new Error('Direct JSON authoring requires a JSON object response schema.');
	}
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
		throw new Error('Direct JSON authoring timeoutMs must be a positive integer.');
	}

	const request = {
		schemaVersion: SCIENCE_CHALLENGE_DIRECT_JSON_REQUEST_SCHEMA,
		transport: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
		transportVersion: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
		responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
		providerSchemaApplied: true,
		operation: 'streamJson',
		provider: SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
		model,
		thinkingLevel,
		tools: [],
		maxAttempts: 1,
		streamMode: 'final',
		responsesWebSocketMode: 'off',
		telemetry: false,
		input: prompt,
		responseJsonSchema: outputSchema
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
		controller.abort(new Error(`Direct JSON authoring timed out after ${timeoutMs} ms.`));
		abortActiveCall();
	}, timeoutMs);
	const startedAt = new Date().toISOString();
	const started = performance.now();
	const events = [];
	let responseText = '';
	let thoughts = '';
	let output = null;
	let failedError = null;
	try {
		activeCall = streamJsonImpl({
			model,
			thinkingLevel,
			tools: [],
			telemetry: false,
			signal: controller.signal,
			schema: scienceChallengeAuthoringProviderSchema(outputSchema),
			openAiSchemaName: 'science_challenge_batch',
			maxAttempts: 1,
			streamMode: 'final',
			input: prompt
		});
		const observedResult = observePromiseResult(activeCall.result);
		const observedEvents = observePromiseResult(
			(async () => {
				for await (const providerEvent of activeCall.events) {
					const event = providerEvent;
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
		if (!output || typeof output !== 'object') {
			throw new Error('Direct JSON authoring returned no result.');
		}
		if (typeof output.rawText !== 'string') {
			throw new Error('Direct JSON authoring result omitted rawText.');
		}
		responseText = output.rawText;
		thoughts = String(output.result?.thoughts ?? '');
		writeFileSync(lastMessagePath, responseText);
		writeFileSync(thoughtsPath, thoughts);
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
				schemaVersion: SCIENCE_CHALLENGE_DIRECT_JSON_RESULT_SCHEMA,
				transport: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
				transportVersion: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
				responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
				providerSchemaApplied: true,
				provider: output.result?.provider ?? null,
				model: output.result?.model ?? null,
				modelVersion: output.result?.modelVersion ?? null,
				blocked: output.result?.blocked ?? null,
				usage: output.result?.usage ?? null,
				costUsd: output.result?.costUsd ?? null,
				rawTextSha256: sha256(lastMessageBytes),
				thoughtsSha256: sha256(thoughtsBytes),
				valueCanonicalSha256: canonicalHash(output.value),
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
		transportVersion: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
		responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
		providerSchemaApplied: true,
		authMode,
		provider: output?.result?.provider ?? null,
		model,
		modelVersion: output?.result?.modelVersion ?? null,
		thinkingLevel,
		blocked: output?.result?.blocked ?? null,
		usage: output?.result?.usage ?? null,
		costUsd: output?.result?.costUsd ?? null,
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
		finalJsonEvents: events.filter((event) => event?.type === 'json' && event.stage === 'final')
			.length,
		startedAt,
		finishedAt,
		durationMilliseconds,
		durationSeconds: Number((durationMilliseconds / 1000).toFixed(3)),
		requestSha256: sha256(requestBytes),
		requestCanonicalSha256: canonicalHash(request),
		responseSchemaSha256: canonicalHash(outputSchema),
		eventLogSha256: sha256(eventLogBytes),
		finalResponseSha256: sha256(lastMessageBytes),
		lastMessageFileSha256: sha256(lastMessageBytes),
		thoughtsSha256: sha256(thoughtsBytes),
		resultMetadataSha256: resultMetadata ? sha256(resultMetadataBytes) : null,
		inputEvidence: {
			mode: 'text',
			promptSha256: sha256(Buffer.from(`${prompt}\n`)),
			requestSha256: sha256(requestBytes),
			responseSchemaSha256: canonicalHash(outputSchema)
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
