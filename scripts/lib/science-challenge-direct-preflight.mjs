import { performance } from 'node:perf_hooks';

import { streamJson, streamText } from '@ljoukov/llm';
import { z } from 'zod';

import {
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';

export const SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_SCHEMA =
	'science-challenge-llm-direct-preflight/v1';
export const SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN = 'SCIENCE_CHALLENGE_PREFLIGHT_OK';
export const SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_PROMPT = `Reply with exactly ${SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN} and nothing else.`;
export const SCIENCE_CHALLENGE_DIRECT_STRUCTURED_PREFLIGHT_PROMPT =
	'Return the required content-free transport preflight object.';
export const SCIENCE_CHALLENGE_DIRECT_STRUCTURED_PREFLIGHT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		token: {
			type: 'string',
			const: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN
		}
	},
	required: ['token']
};

export async function runScienceChallengeDirectTransportPreflight({
	model = SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	thinkingLevel = 'max',
	timeoutMs = 120_000,
	authMode = 'default-chatgpt-profile',
	responseMode = SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	streamTextImpl = streamText,
	streamJsonImpl = streamJson
} = {}) {
	if (typeof model !== 'string' || !model.trim()) {
		throw new Error('Direct authoring preflight model must be non-empty.');
	}
	if (!['max', 'high'].includes(thinkingLevel)) {
		throw new Error('Direct authoring preflight thinkingLevel must be max or high.');
	}
	if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
		throw new Error('Direct authoring preflight timeoutMs must be a positive integer.');
	}
	if (
		![
			SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
			SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
		].includes(responseMode)
	) {
		throw new Error(
			`Unsupported direct authoring preflight response mode ${String(responseMode)}.`
		);
	}
	if (
		responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
		typeof streamTextImpl !== 'function'
	) {
		throw new Error('Direct authoring preflight requires a streamText implementation.');
	}
	if (
		responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON &&
		typeof streamJsonImpl !== 'function'
	) {
		throw new Error('Structured direct authoring preflight requires a streamJson implementation.');
	}

	const controller = new AbortController();
	let activeCall = null;
	let activeCallAborted = false;
	const abortActiveCall = () => {
		if (!activeCall || activeCallAborted || typeof activeCall.abort !== 'function') return;
		activeCallAborted = true;
		try {
			activeCall.abort();
		} catch {
			// The timeout/error path must still settle even if transport cleanup itself fails.
		}
	};
	const timeoutError = new Error(`Direct authoring preflight timed out after ${timeoutMs} ms.`);
	let timer;
	const timeout = new Promise((_, reject) => {
		timer = setTimeout(() => {
			try {
				controller.abort(timeoutError);
			} catch {
				// Continue to reject the hard timeout even if an AbortSignal implementation fails.
			}
			abortActiveCall();
			reject(timeoutError);
		}, timeoutMs);
	});
	const started = performance.now();
	let responseText = '';
	try {
		activeCall =
			responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
				? streamJsonImpl({
						model,
						thinkingLevel,
						tools: [],
						telemetry: false,
						signal: controller.signal,
						schema: z.fromJSONSchema(SCIENCE_CHALLENGE_DIRECT_STRUCTURED_PREFLIGHT_SCHEMA),
						openAiSchemaName: 'science_challenge_preflight',
						maxAttempts: 1,
						streamMode: 'final',
						input: SCIENCE_CHALLENGE_DIRECT_STRUCTURED_PREFLIGHT_PROMPT
					})
				: streamTextImpl({
						model,
						thinkingLevel,
						tools: [],
						telemetry: false,
						signal: controller.signal,
						input: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_PROMPT
					});
		if (!activeCall || typeof activeCall !== 'object' || !activeCall.result || !activeCall.events) {
			throw new Error('transport returned no active stream');
		}
		const observedResult = observePromiseResult(activeCall.result);
		const observedEvents = observePromiseResult(
			(async () => {
				for await (const event of activeCall.events) {
					if (event?.type === 'delta' && event.channel === 'response') {
						responseText += event.text ?? '';
					}
				}
			})()
		);
		const completion = (async () => {
			const firstOutcome = await Promise.race([
				observedResult.then((outcome) => ({ source: 'result', outcome })),
				observedEvents.then((outcome) => ({ source: 'events', outcome }))
			]);
			if (!firstOutcome.outcome.ok) abortActiveCall();
			return await Promise.all([observedEvents, observedResult]);
		})();
		const [eventOutcome, resultOutcome] = await Promise.race([completion, timeout]);
		if (!resultOutcome.ok) throw resultOutcome.error;
		if (!eventOutcome.ok) throw eventOutcome.error;
		const output = resultOutcome.value;
		const resultMetadata =
			responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
				? output?.result
				: output;
		validatePreflightOutput({ output, responseMode, responseText });
		if (
			resultMetadata?.provider !== undefined &&
			resultMetadata.provider !== null &&
			resultMetadata.provider !== SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER
		) {
			throw new Error(
				`transport reported provider ${String(resultMetadata.provider)} instead of ${SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER}`
			);
		}
		if (
			resultMetadata?.model !== undefined &&
			resultMetadata.model !== null &&
			resultMetadata.model !== model
		) {
			throw new Error(
				`transport reported model ${String(resultMetadata.model)} instead of requested ${model}`
			);
		}
		return {
			schemaVersion: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_SCHEMA,
			status: 'passed',
			token: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN,
			transport: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
			authMode,
			responseMode,
			provider: resultMetadata?.provider ?? SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
			model: resultMetadata?.model ?? model,
			modelVersion: resultMetadata?.modelVersion ?? null,
			thinkingLevel,
			durationMilliseconds: Math.max(0, Math.round(performance.now() - started))
		};
	} catch (error) {
		abortActiveCall();
		throw new Error(
			`Direct authoring preflight failed before any authoring or repair attempt was allocated: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error }
		);
	} finally {
		clearTimeout(timer);
	}
}

function validatePreflightOutput({ output, responseMode, responseText }) {
	if (responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON) {
		if (!output || typeof output !== 'object' || typeof output.text !== 'string') {
			throw new Error('transport returned no text result');
		}
		if (
			output.text.trim() !== SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN ||
			responseText.trim() !== SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN
		) {
			throw new Error('model did not return the exact preflight token');
		}
		return;
	}
	if (
		!output ||
		typeof output !== 'object' ||
		typeof output.rawText !== 'string' ||
		!output.value ||
		typeof output.value !== 'object' ||
		Array.isArray(output.value)
	) {
		throw new Error('structured transport returned no JSON result');
	}
	if (
		Object.keys(output.value).length !== 1 ||
		output.value.token !== SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN
	) {
		throw new Error('model did not return the exact structured preflight object');
	}
	let rawValue;
	try {
		rawValue = JSON.parse(output.rawText);
	} catch {
		throw new Error('structured transport returned invalid raw JSON');
	}
	if (
		!rawValue ||
		typeof rawValue !== 'object' ||
		Array.isArray(rawValue) ||
		Object.keys(rawValue).length !== 1 ||
		rawValue.token !== SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN
	) {
		throw new Error('structured transport raw JSON differs from the preflight object');
	}
}

export async function runScienceChallengeGenerationBehindPreflight({ preflight, generate }) {
	if (typeof preflight !== 'function' || typeof generate !== 'function') {
		throw new Error('Science challenge preflight gate requires preflight and generate functions.');
	}
	const preflightResult = await preflight();
	if (preflightResult?.status !== 'passed') {
		throw new Error('Science challenge generation requires an explicitly passed preflight.');
	}
	const result = await generate();
	return { preflight: preflightResult, result };
}

function observePromiseResult(promise) {
	return Promise.resolve(promise).then(
		(value) => ({ ok: true, value }),
		(error) => ({ ok: false, error })
	);
}
