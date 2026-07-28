import { createHash } from 'node:crypto';
import {
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
	SCIENCE_CHALLENGE_DIRECT_JSON_REQUEST_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_JSON_RESULT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_EVENT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_SUMMARY_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_REQUEST_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_RESULT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';
import {
	buildScienceChallengeAuthoringParts,
	mergeScienceChallengeAuthoringPartBatches,
	scienceChallengeMultipartPartPaths
} from './science-challenge-authoring-parts.mjs';
import { scienceChallengeAuthoringProviderSchema } from './science-challenge-authoring-provider-schema.mjs';
import { canonicalHash, challengeBatchOutputSchema } from './science-challenge-release.mjs';
import { buildScienceChallengePromptJsonProviderPrompt } from './science-challenge-direct-prompt-json-runner.mjs';

export const SCIENCE_CHALLENGE_AUTHORING_MODEL = 'gpt-5.6-sol';
export const SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL = 'max';
export const SCIENCE_CHALLENGE_MODEL_RUN_POLICY_VERSION = 'science-challenge-model-run-policy/v1';
export const SCIENCE_CHALLENGE_MODEL_RUN_POLICY_ATTESTATION_SCHEMA =
	'science-challenge-model-run-policy-attestation/v1';
export const SCIENCE_CHALLENGE_MODEL_RUN_ALLOWED_EVENT_VOCABULARY = Object.freeze([
	'thread.started',
	'turn.started',
	'item.completed:agent_message',
	'turn.completed'
]);

const ZERO_SUMMARY_FIELDS = Object.freeze([
	'commandActions',
	'failedCommandActions',
	'webSearches',
	'fileChanges'
]);
const SUMMARY_HASH_FIELDS = Object.freeze([
	['eventLogSha256', 'event log'],
	['finalResponseSha256', 'raw last message'],
	['lastMessageFileSha256', 'raw last message']
]);
const DIRECT_SUMMARY_FIELDS = Object.freeze([
	'status',
	'error',
	'transport',
	'transportVersion',
	'responseMode',
	'providerSchemaApplied',
	'authMode',
	'provider',
	'model',
	'modelVersion',
	'thinkingLevel',
	'blocked',
	'usage',
	'costUsd',
	'commandActions',
	'failedCommandActions',
	'webSearches',
	'fileChanges',
	'toolCalls',
	'hostedTools',
	'events',
	'responseDeltas',
	'thoughtDeltas',
	'modelEvents',
	'usageEvents',
	'finalJsonEvents',
	'startedAt',
	'finishedAt',
	'durationMilliseconds',
	'durationSeconds',
	'requestSha256',
	'requestCanonicalSha256',
	'responseSchemaSha256',
	'eventLogSha256',
	'finalResponseSha256',
	'lastMessageFileSha256',
	'thoughtsSha256',
	'resultMetadataSha256',
	'inputEvidence'
]);
const DIRECT_MULTIPART_SUMMARY_FIELDS = Object.freeze([
	'schemaVersion',
	'status',
	'error',
	'transport',
	'transportVersion',
	'responseMode',
	'providerSchemaApplied',
	'authMode',
	'provider',
	'model',
	'modelVersion',
	'modelVersions',
	'thinkingLevel',
	'blocked',
	'usage',
	'costUsd',
	'commandActions',
	'failedCommandActions',
	'webSearches',
	'fileChanges',
	'toolCalls',
	'hostedTools',
	'partSize',
	'expectedPartCount',
	'attemptedPartCount',
	'completedPartCount',
	'rowIds',
	'inputSha256',
	'orchestrationPromptSha256',
	'mergedResponseSchemaSha256',
	'partsSha256',
	'parts',
	'startedAt',
	'finishedAt',
	'durationMilliseconds',
	'durationSeconds',
	'eventLogSha256',
	'finalResponseSha256',
	'lastMessageFileSha256',
	'mergedCandidateSha256'
]);
const DIRECT_MULTIPART_PART_FIELDS = Object.freeze([
	'partId',
	'index',
	'start',
	'end',
	'rowIds',
	'inputSha256',
	'transportVersion',
	'responseMode',
	'providerSchemaApplied',
	'responseSchemaSha256',
	'promptPath',
	'promptSha256',
	'requestPath',
	'requestSha256',
	'eventLogPath',
	'eventLogSha256',
	'rawOutputPath',
	'rawOutputSha256',
	'rawCandidateSha256',
	'thoughtsPath',
	'thoughtsSha256',
	'resultMetadataPath',
	'resultMetadataSha256',
	'runSummaryPath',
	'runSummarySha256',
	'status',
	'provider',
	'model',
	'modelVersion',
	'thinkingLevel',
	'usage',
	'costUsd'
]);
const DIRECT_PROMPT_JSON_SUMMARY_FIELDS = Object.freeze([
	...DIRECT_SUMMARY_FIELDS,
	'responseMode',
	'providerSchemaApplied',
	'localResponseSchemaSha256'
]);
const DIRECT_PROMPT_JSON_RESULT_METADATA_FIELDS = Object.freeze([
	'schemaVersion',
	'transport',
	'transportVersion',
	'responseMode',
	'providerSchemaApplied',
	'provider',
	'model',
	'modelVersion',
	'thinkingLevel',
	'blocked',
	'usage',
	'costUsd',
	'rawTextSha256',
	'thoughtsSha256',
	'localResponseSchemaSha256',
	'localValidationStatus',
	'localValidationError',
	'valueCanonicalSha256',
	'startedAt',
	'finishedAt',
	'durationMilliseconds'
]);
const DIRECT_RESULT_METADATA_FIELDS = Object.freeze([
	'schemaVersion',
	'transport',
	'transportVersion',
	'responseMode',
	'providerSchemaApplied',
	'provider',
	'model',
	'modelVersion',
	'blocked',
	'usage',
	'costUsd',
	'rawTextSha256',
	'thoughtsSha256',
	'valueCanonicalSha256',
	'startedAt',
	'finishedAt',
	'durationMilliseconds'
]);
const LLM_USAGE_FIELDS = Object.freeze([
	'promptTokens',
	'promptTextTokens',
	'promptImageTokens',
	'cachedTokens',
	'responseTokens',
	'responseTextTokens',
	'responseImageTokens',
	'thinkingTokens',
	'totalTokens',
	'toolUsePromptTokens'
]);

export function parseScienceChallengeModelRunEventLog(eventLogBytes) {
	const issues = [];
	const bytes = asBuffer(eventLogBytes, 'event log', issues);
	if (!bytes) return { status: 'failed', issues, events: [], records: [] };

	let text;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return {
			status: 'failed',
			issues: ['event log must be valid UTF-8.'],
			events: [],
			records: []
		};
	}

	const events = [];
	for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		let event;
		try {
			event = JSON.parse(line);
		} catch {
			issues.push(`event log line ${lineIndex + 1} is not valid JSON.`);
			continue;
		}
		if (!isRecord(event)) {
			issues.push(`event log line ${lineIndex + 1} must contain a JSON object.`);
			continue;
		}
		events.push({ event, line: lineIndex + 1 });
	}

	if (events.length === 0) issues.push('event log must contain at least one event.');
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		events: events.map((record) => record.event),
		records: events
	};
}

export const parseScienceChallengeAuthoringEventLog = parseScienceChallengeModelRunEventLog;

export function parseScienceChallengeDirectJsonEventLog(eventLogBytes) {
	const issues = [];
	const bytes = asBuffer(eventLogBytes, 'direct event log', issues);
	if (!bytes) return { status: 'failed', issues, events: [], records: [] };
	let text;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return {
			status: 'failed',
			issues: ['direct event log must be valid UTF-8.'],
			events: [],
			records: []
		};
	}
	const records = [];
	for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
		if (!line.trim()) continue;
		try {
			const event = JSON.parse(line);
			if (!isRecord(event)) throw new Error('event is not an object');
			records.push({ event, line: lineIndex + 1 });
		} catch {
			issues.push(`direct event log line ${lineIndex + 1} is not a JSON object.`);
		}
	}
	if (records.length === 0) issues.push('direct event log must contain at least one event.');
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		events: records.map((record) => record.event),
		records
	};
}

export function validateScienceChallengeDirectJsonRunPolicy({
	summary,
	eventLogBytes,
	lastMessageBytes,
	promptBytes,
	requestBytes,
	thoughtsBytes,
	resultMetadataBytes,
	expectedResponseJsonSchema
}) {
	const issues = [];
	const eventLog = parseScienceChallengeDirectJsonEventLog(eventLogBytes);
	issues.push(...eventLog.issues);
	const lastMessage = decodeLastMessage(lastMessageBytes, issues);
	const prompt = decodeUtf8(promptBytes, 'attempt prompt', issues);
	const thoughts = decodeUtf8(thoughtsBytes, 'direct thoughts', issues);
	const request = parseJsonBytes(requestBytes, 'direct request', issues);
	const resultMetadata = parseJsonBytes(resultMetadataBytes, 'direct result metadata', issues);

	if (!isRecord(summary)) {
		issues.push('run summary must be a JSON object.');
	} else {
		const extraFields = unexpectedFields(summary, DIRECT_SUMMARY_FIELDS);
		if (extraFields.length) {
			issues.push(`direct run summary contains unexpected fields: ${extraFields.join(', ')}.`);
		}
		if (summary.status !== 'passed') issues.push('run summary status must be passed.');
		if (summary.error !== null && summary.error !== undefined) {
			issues.push('successful run summary must not contain an error.');
		}
		if (summary.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT) {
			issues.push(`run summary transport must be ${SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT}.`);
		}
		if (summary.transportVersion !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION) {
			issues.push('run summary direct transportVersion is invalid.');
		}
		if (
			summary.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON ||
			summary.providerSchemaApplied !== true
		) {
			issues.push('run summary must declare structured JSON with provider schema enforcement.');
		}
		if (!['configured-proxy', 'default-chatgpt-profile'].includes(summary.authMode)) {
			issues.push('run summary authMode is invalid.');
		}
		if (summary.provider !== SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER) {
			issues.push(`run summary provider must be ${SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER}.`);
		}
		if (summary.model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL) {
			issues.push(`run summary model must be ${SCIENCE_CHALLENGE_DIRECT_JSON_MODEL}.`);
		}
		if (summary.thinkingLevel !== SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL) {
			issues.push(
				`run summary thinkingLevel must be ${SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL}.`
			);
		}
		if (!nonEmpty(summary.modelVersion)) {
			issues.push('run summary modelVersion must be non-empty.');
		}
		if (summary.blocked !== false) issues.push('run summary blocked must be false.');
		for (const field of [...ZERO_SUMMARY_FIELDS, 'toolCalls', 'hostedTools']) {
			if (summary[field] !== 0) issues.push(`run summary ${field} must be 0.`);
		}
		if (!validUsage(summary.usage)) issues.push('run summary usage must be a token object.');
		if (!nonNegativeNumber(summary.costUsd)) {
			issues.push('run summary costUsd must be a non-negative number.');
		}
		if (!canonicalTimestamp(summary.startedAt) || !canonicalTimestamp(summary.finishedAt)) {
			issues.push('run summary timing timestamps must be canonical ISO date-times.');
		} else if (Date.parse(summary.finishedAt) < Date.parse(summary.startedAt)) {
			issues.push('run summary finishedAt cannot precede startedAt.');
		}
		if (
			!Number.isInteger(summary.durationMilliseconds) ||
			summary.durationMilliseconds < 0 ||
			summary.durationSeconds !== Number((summary.durationMilliseconds / 1000).toFixed(3))
		) {
			issues.push('run summary duration does not bind millisecond timing.');
		}
		if (
			!isRecord(summary.inputEvidence) ||
			unexpectedFields(summary.inputEvidence, [
				'mode',
				'promptSha256',
				'requestSha256',
				'responseSchemaSha256'
			]).length > 0 ||
			summary.inputEvidence.mode !== 'text'
		) {
			issues.push('run summary inputEvidence has an invalid shape.');
		}
	}

	if (isRecord(request)) {
		const expectedFields = [
			'schemaVersion',
			'transport',
			'transportVersion',
			'responseMode',
			'providerSchemaApplied',
			'operation',
			'provider',
			'model',
			'thinkingLevel',
			'tools',
			'maxAttempts',
			'streamMode',
			'responsesWebSocketMode',
			'telemetry',
			'input',
			'responseJsonSchema'
		];
		const extraFields = Object.keys(request).filter((field) => !expectedFields.includes(field));
		if (extraFields.length) {
			issues.push(`direct request contains unexpected fields: ${extraFields.join(', ')}.`);
		}
		if (
			request.schemaVersion !== SCIENCE_CHALLENGE_DIRECT_JSON_REQUEST_SCHEMA ||
			request.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
			request.transportVersion !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION ||
			request.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON ||
			request.providerSchemaApplied !== true ||
			request.operation !== 'streamJson' ||
			request.provider !== SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER ||
			request.model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL ||
			request.thinkingLevel !== SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL ||
			!Array.isArray(request.tools) ||
			request.tools.length !== 0 ||
			request.maxAttempts !== 1 ||
			request.streamMode !== 'final' ||
			request.responsesWebSocketMode !== 'off' ||
			request.telemetry !== false ||
			typeof request.input !== 'string' ||
			!request.input.trim() ||
			!isRecord(request.responseJsonSchema)
		) {
			issues.push('direct request does not describe the exact inherently tool-free call.');
		}
		if (prompt !== null && `${request.input}\n` !== prompt) {
			issues.push('direct request input does not equal the exact attempt prompt bytes.');
		}
		if (!isRecord(expectedResponseJsonSchema)) {
			issues.push('direct run policy requires the expected response JSON schema.');
		} else if (
			!isRecord(request.responseJsonSchema) ||
			canonicalHash(request.responseJsonSchema) !== canonicalHash(expectedResponseJsonSchema)
		) {
			issues.push('direct request does not equal the expected structured response schema.');
		}
	}

	const responseDeltas = [];
	const thoughtDeltas = [];
	const modelEvents = [];
	const usageEvents = [];
	const finalJsonEvents = [];
	for (const { event, line } of eventLog.records) {
		if (
			event.type === 'delta' &&
			['response', 'thought'].includes(event.channel) &&
			typeof event.text === 'string' &&
			unexpectedFields(event, ['type', 'channel', 'text']).length === 0
		) {
			(event.channel === 'response' ? responseDeltas : thoughtDeltas).push(event.text);
		} else if (
			event.type === 'model' &&
			nonEmpty(event.modelVersion) &&
			unexpectedFields(event, ['type', 'modelVersion']).length === 0
		) {
			modelEvents.push(event);
		} else if (
			event.type === 'usage' &&
			validUsage(event.usage) &&
			nonNegativeNumber(event.costUsd) &&
			nonEmpty(event.modelVersion) &&
			unexpectedFields(event, ['type', 'usage', 'costUsd', 'modelVersion']).length === 0
		) {
			usageEvents.push(event);
		} else if (
			event.type === 'json' &&
			event.stage === 'final' &&
			unexpectedFields(event, ['type', 'stage', 'value']).length === 0
		) {
			finalJsonEvents.push(event);
		} else {
			issues.push(`direct event log line ${line} contains a forbidden ${eventLabel(event)} event.`);
		}
	}
	if (responseDeltas.length === 0) {
		issues.push('direct event log must contain response deltas.');
	}
	if (modelEvents.length < 1) issues.push('direct event log must contain a model event.');
	if (usageEvents.length !== 1) {
		issues.push('direct event log must contain exactly one usage event.');
	}
	if (finalJsonEvents.length !== 1) {
		issues.push('direct event log must contain exactly one final JSON event.');
	}
	if (lastMessage !== null && responseDeltas.join('') !== lastMessage) {
		issues.push('direct response deltas do not equal the raw last-message bytes.');
	}
	if (thoughts !== null && thoughtDeltas.join('') !== thoughts) {
		issues.push('direct thought deltas do not equal the raw thoughts bytes.');
	}
	let parsedLastMessage = null;
	if (lastMessage !== null) {
		try {
			parsedLastMessage = scienceChallengeAuthoringProviderSchema(
				expectedResponseJsonSchema
			).parse(JSON.parse(lastMessage));
		} catch {
			issues.push('raw last message is not exact schema-valid JSON.');
		}
	}
	if (
		parsedLastMessage !== null &&
		finalJsonEvents.length === 1 &&
		canonicalHash(finalJsonEvents[0].value) !== canonicalHash(parsedLastMessage)
	) {
		issues.push('final JSON event does not equal the raw model output.');
	}

	const hashes = {
		requestSha256: hashBytes(requestBytes),
		eventLogSha256: hashBytes(eventLogBytes),
		lastMessageSha256: hashBytes(lastMessageBytes),
		thoughtsSha256: hashBytes(thoughtsBytes),
		resultMetadataSha256: hashBytes(resultMetadataBytes)
	};
	if (isRecord(summary)) {
		for (const [field, expected] of [
			['requestSha256', hashes.requestSha256],
			['eventLogSha256', hashes.eventLogSha256],
			['finalResponseSha256', hashes.lastMessageSha256],
			['lastMessageFileSha256', hashes.lastMessageSha256],
			['thoughtsSha256', hashes.thoughtsSha256],
			['resultMetadataSha256', hashes.resultMetadataSha256]
		]) {
			if (summary[field] !== expected) issues.push(`run summary ${field} does not bind its bytes.`);
		}
		if (isRecord(request)) {
			if (summary.requestCanonicalSha256 !== canonicalHash(request)) {
				issues.push('run summary requestCanonicalSha256 does not bind the direct request.');
			}
			if (
				!isRecord(request.responseJsonSchema) ||
				summary.responseSchemaSha256 !== canonicalHash(request.responseJsonSchema)
			) {
				issues.push('run summary responseSchemaSha256 does not bind the structured schema.');
			}
		}
		if (
			isRecord(summary.inputEvidence) &&
			(summary.inputEvidence.promptSha256 !== hashBytes(promptBytes) ||
				summary.inputEvidence.requestSha256 !== hashes.requestSha256 ||
				!isRecord(request) ||
				!isRecord(request.responseJsonSchema) ||
				summary.inputEvidence.responseSchemaSha256 !== canonicalHash(request.responseJsonSchema))
		) {
			issues.push('run summary inputEvidence does not bind the prompt, request and schema.');
		}
		for (const [field, count] of [
			['events', eventLog.records.length],
			['responseDeltas', responseDeltas.length],
			['thoughtDeltas', thoughtDeltas.length],
			['modelEvents', modelEvents.length],
			['usageEvents', usageEvents.length],
			['finalJsonEvents', finalJsonEvents.length]
		]) {
			if (summary[field] !== count) issues.push(`run summary ${field} does not match events.`);
		}
		const usageEvent = usageEvents[0];
		if (
			usageEvent &&
			(canonicalHash(summary.usage) !== canonicalHash(usageEvent.usage) ||
				summary.costUsd !== usageEvent.costUsd ||
				summary.modelVersion !== usageEvent.modelVersion)
		) {
			issues.push('run summary usage/model version differs from the raw usage event.');
		}
		if (
			modelEvents.length > 0 &&
			!modelEvents.some((event) => event.modelVersion === summary.modelVersion)
		) {
			issues.push('run summary modelVersion does not appear in the raw model events.');
		}
	}

	if (isRecord(resultMetadata)) {
		const extraFields = unexpectedFields(resultMetadata, DIRECT_RESULT_METADATA_FIELDS);
		if (extraFields.length) {
			issues.push(`direct result metadata contains unexpected fields: ${extraFields.join(', ')}.`);
		}
		if (
			resultMetadata.schemaVersion !== SCIENCE_CHALLENGE_DIRECT_JSON_RESULT_SCHEMA ||
			resultMetadata.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
			resultMetadata.transportVersion !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION ||
			resultMetadata.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON ||
			resultMetadata.providerSchemaApplied !== true ||
			resultMetadata.provider !== SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER ||
			resultMetadata.model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL ||
			!nonEmpty(resultMetadata.modelVersion) ||
			resultMetadata.blocked !== false ||
			!validUsage(resultMetadata.usage) ||
			!nonNegativeNumber(resultMetadata.costUsd)
		) {
			issues.push('direct result metadata has invalid provider/model/usage evidence.');
		}
		if (
			resultMetadata.rawTextSha256 !== hashes.lastMessageSha256 ||
			resultMetadata.thoughtsSha256 !== hashes.thoughtsSha256 ||
			parsedLastMessage === null ||
			resultMetadata.valueCanonicalSha256 !== canonicalHash(parsedLastMessage)
		) {
			issues.push('direct result metadata does not bind raw output/thought bytes.');
		}
		if (
			!isRecord(summary) ||
			resultMetadata.provider !== summary.provider ||
			resultMetadata.model !== summary.model ||
			resultMetadata.modelVersion !== summary.modelVersion ||
			canonicalHash(resultMetadata.usage) !== canonicalHash(summary.usage) ||
			resultMetadata.costUsd !== summary.costUsd ||
			resultMetadata.startedAt !== summary.startedAt ||
			resultMetadata.finishedAt !== summary.finishedAt ||
			resultMetadata.durationMilliseconds !== summary.durationMilliseconds
		) {
			issues.push('direct result metadata differs from the run summary.');
		}
	}

	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		events: eventLog.events,
		hashes,
		responseDeltas,
		thoughtDeltas
	};
}

export function validateScienceChallengeDirectPromptJsonRunPolicy({
	summary,
	eventLogBytes,
	lastMessageBytes,
	promptBytes,
	requestBytes,
	thoughtsBytes,
	resultMetadataBytes,
	expectedResponseJsonSchema
}) {
	const issues = [];
	const eventLog = parseScienceChallengeDirectJsonEventLog(eventLogBytes);
	issues.push(...eventLog.issues);
	const lastMessage = decodeLastMessage(lastMessageBytes, issues);
	const prompt = decodeUtf8(promptBytes, 'attempt prompt', issues);
	const thoughts = decodeUtf8(thoughtsBytes, 'direct thoughts', issues);
	const request = parseJsonBytes(requestBytes, 'direct request', issues);
	const resultMetadata = parseJsonBytes(resultMetadataBytes, 'direct result metadata', issues);
	const localSchemaHash = isRecord(expectedResponseJsonSchema)
		? canonicalHash(expectedResponseJsonSchema)
		: null;
	if (!localSchemaHash)
		issues.push('prompt-JSON run policy requires the expected response JSON schema.');

	if (!isRecord(summary)) {
		issues.push('run summary must be a JSON object.');
	} else {
		const extraFields = unexpectedFields(summary, DIRECT_PROMPT_JSON_SUMMARY_FIELDS);
		if (extraFields.length) {
			issues.push(`prompt-JSON run summary contains unexpected fields: ${extraFields.join(', ')}.`);
		}
		if (
			summary.status !== 'passed' ||
			summary.error !== null ||
			summary.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
			summary.transportVersion !== SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION ||
			summary.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ||
			summary.providerSchemaApplied !== false ||
			summary.provider !== SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER ||
			summary.model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL ||
			!validPromptJsonThinkingLevel(summary.thinkingLevel) ||
			!nonEmpty(summary.modelVersion) ||
			summary.blocked !== false
		) {
			issues.push('prompt-JSON run summary does not describe the exact successful transport.');
		}
		if (!['configured-proxy', 'default-chatgpt-profile'].includes(summary.authMode)) {
			issues.push('prompt-JSON run summary authMode is invalid.');
		}
		for (const field of [...ZERO_SUMMARY_FIELDS, 'toolCalls', 'hostedTools']) {
			if (summary[field] !== 0) issues.push(`prompt-JSON run summary ${field} must be 0.`);
		}
		if (!validUsage(summary.usage) || !nonNegativeNumber(summary.costUsd)) {
			issues.push('prompt-JSON run summary usage/cost evidence is invalid.');
		}
		if (
			!canonicalTimestamp(summary.startedAt) ||
			!canonicalTimestamp(summary.finishedAt) ||
			Date.parse(summary.finishedAt) < Date.parse(summary.startedAt) ||
			!Number.isInteger(summary.durationMilliseconds) ||
			summary.durationMilliseconds < 0 ||
			summary.durationSeconds !== Number((summary.durationMilliseconds / 1000).toFixed(3))
		) {
			issues.push('prompt-JSON run summary timing is invalid.');
		}
		if (
			!isRecord(summary.inputEvidence) ||
			unexpectedFields(summary.inputEvidence, [
				'mode',
				'responseMode',
				'promptSha256',
				'providerPromptSha256',
				'requestSha256',
				'responseSchemaSha256'
			]).length > 0 ||
			summary.inputEvidence.mode !== 'text' ||
			summary.inputEvidence.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
		) {
			issues.push('prompt-JSON run summary inputEvidence has an invalid shape.');
		}
	}

	let expectedProviderPrompt = null;
	if (prompt !== null && localSchemaHash) {
		try {
			const sourcePrompt = prompt.endsWith('\n') ? prompt.slice(0, -1) : prompt;
			expectedProviderPrompt = buildScienceChallengePromptJsonProviderPrompt(
				sourcePrompt,
				expectedResponseJsonSchema
			);
		} catch (error) {
			issues.push(error instanceof Error ? error.message : String(error));
		}
	}
	if (isRecord(request)) {
		const allowed = [
			'schemaVersion',
			'transport',
			'transportVersion',
			'responseMode',
			'providerSchemaApplied',
			'operation',
			'provider',
			'model',
			'thinkingLevel',
			'tools',
			'responsesWebSocketMode',
			'telemetry',
			'sourcePromptSha256',
			'providerPromptSha256',
			'localResponseSchemaSha256',
			'input'
		];
		const extraFields = unexpectedFields(request, allowed);
		if (extraFields.length) {
			issues.push(
				`prompt-JSON direct request contains unexpected fields: ${extraFields.join(', ')}.`
			);
		}
		if (
			request.schemaVersion !== SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_REQUEST_SCHEMA ||
			request.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
			request.transportVersion !== SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION ||
			request.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ||
			request.providerSchemaApplied !== false ||
			request.operation !== 'streamText' ||
			request.provider !== SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER ||
			request.model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL ||
			!validPromptJsonThinkingLevel(request.thinkingLevel) ||
			!isRecord(summary) ||
			request.thinkingLevel !== summary.thinkingLevel ||
			!Array.isArray(request.tools) ||
			request.tools.length !== 0 ||
			request.responsesWebSocketMode !== 'off' ||
			request.telemetry !== false ||
			request.input !== expectedProviderPrompt ||
			request.localResponseSchemaSha256 !== localSchemaHash ||
			request.sourcePromptSha256 !== hashBytes(promptBytes) ||
			request.providerPromptSha256 !== hashBytes(Buffer.from(expectedProviderPrompt ?? ''))
		) {
			issues.push('prompt-JSON request does not describe the exact schema-free streamText call.');
		}
	}

	const responseDeltas = [];
	const thoughtDeltas = [];
	const modelEvents = [];
	const usageEvents = [];
	for (const { event, line } of eventLog.records) {
		if (
			event.type === 'delta' &&
			['response', 'thought'].includes(event.channel) &&
			typeof event.text === 'string' &&
			unexpectedFields(event, ['type', 'channel', 'text']).length === 0
		) {
			(event.channel === 'response' ? responseDeltas : thoughtDeltas).push(event.text);
		} else if (
			event.type === 'model' &&
			nonEmpty(event.modelVersion) &&
			unexpectedFields(event, ['type', 'modelVersion']).length === 0
		) {
			modelEvents.push(event);
		} else if (
			event.type === 'usage' &&
			validUsage(event.usage) &&
			nonNegativeNumber(event.costUsd) &&
			nonEmpty(event.modelVersion) &&
			unexpectedFields(event, ['type', 'usage', 'costUsd', 'modelVersion']).length === 0
		) {
			usageEvents.push(event);
		} else {
			issues.push(
				`prompt-JSON event log line ${line} contains a forbidden ${eventLabel(event)} event.`
			);
		}
	}
	if (responseDeltas.length === 0)
		issues.push('prompt-JSON event log must contain response deltas.');
	if (modelEvents.length < 1) issues.push('prompt-JSON event log must contain a model event.');
	if (usageEvents.length !== 1) {
		issues.push('prompt-JSON event log must contain exactly one usage event.');
	}
	if (lastMessage !== null && responseDeltas.join('') !== lastMessage) {
		issues.push('prompt-JSON response deltas do not equal the raw last-message bytes.');
	}
	if (thoughts !== null && thoughtDeltas.join('') !== thoughts) {
		issues.push('prompt-JSON thought deltas do not equal the raw thoughts bytes.');
	}
	let parsedLastMessage = null;
	if (lastMessage !== null) {
		try {
			parsedLastMessage = JSON.parse(lastMessage);
			parsedLastMessage = scienceChallengeAuthoringProviderSchema(expectedResponseJsonSchema).parse(
				parsedLastMessage
			);
		} catch {
			issues.push('prompt-JSON raw last message is not exact schema-valid JSON.');
			parsedLastMessage = null;
		}
	}

	const hashes = {
		requestSha256: hashBytes(requestBytes),
		eventLogSha256: hashBytes(eventLogBytes),
		lastMessageSha256: hashBytes(lastMessageBytes),
		thoughtsSha256: hashBytes(thoughtsBytes),
		resultMetadataSha256: hashBytes(resultMetadataBytes)
	};
	if (isRecord(summary)) {
		for (const [field, expected] of [
			['requestSha256', hashes.requestSha256],
			['eventLogSha256', hashes.eventLogSha256],
			['finalResponseSha256', hashes.lastMessageSha256],
			['lastMessageFileSha256', hashes.lastMessageSha256],
			['thoughtsSha256', hashes.thoughtsSha256],
			['resultMetadataSha256', hashes.resultMetadataSha256]
		]) {
			if (summary[field] !== expected)
				issues.push(`prompt-JSON run summary ${field} does not bind its bytes.`);
		}
		if (
			summary.requestCanonicalSha256 !== canonicalHash(request) ||
			summary.responseSchemaSha256 !== localSchemaHash ||
			summary.localResponseSchemaSha256 !== localSchemaHash
		) {
			issues.push('prompt-JSON run summary does not bind its request/local schema.');
		}
		if (
			!isRecord(summary.inputEvidence) ||
			summary.inputEvidence.promptSha256 !== hashBytes(promptBytes) ||
			summary.inputEvidence.providerPromptSha256 !==
				hashBytes(Buffer.from(expectedProviderPrompt ?? '')) ||
			summary.inputEvidence.requestSha256 !== hashes.requestSha256 ||
			summary.inputEvidence.responseSchemaSha256 !== localSchemaHash
		) {
			issues.push(
				'prompt-JSON inputEvidence does not bind prompt, provider prompt, request and schema.'
			);
		}
		for (const [field, count] of [
			['events', eventLog.records.length],
			['responseDeltas', responseDeltas.length],
			['thoughtDeltas', thoughtDeltas.length],
			['modelEvents', modelEvents.length],
			['usageEvents', usageEvents.length],
			['finalJsonEvents', 0]
		]) {
			if (summary[field] !== count)
				issues.push(`prompt-JSON run summary ${field} does not match events.`);
		}
		const usageEvent = usageEvents[0];
		if (
			usageEvent &&
			(canonicalHash(summary.usage) !== canonicalHash(usageEvent.usage) ||
				summary.costUsd !== usageEvent.costUsd ||
				summary.modelVersion !== usageEvent.modelVersion)
		) {
			issues.push('prompt-JSON summary usage/model version differs from the raw usage event.');
		}
		if (
			modelEvents.length &&
			!modelEvents.some((event) => event.modelVersion === summary.modelVersion)
		) {
			issues.push('prompt-JSON summary modelVersion does not appear in model events.');
		}
	}
	if (isRecord(resultMetadata)) {
		const extraFields = unexpectedFields(resultMetadata, DIRECT_PROMPT_JSON_RESULT_METADATA_FIELDS);
		if (extraFields.length) {
			issues.push(
				`prompt-JSON result metadata contains unexpected fields: ${extraFields.join(', ')}.`
			);
		}
		if (
			resultMetadata.schemaVersion !== SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_RESULT_SCHEMA ||
			resultMetadata.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
			resultMetadata.transportVersion !== SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION ||
			resultMetadata.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ||
			resultMetadata.providerSchemaApplied !== false ||
			resultMetadata.provider !== SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER ||
			resultMetadata.model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL ||
			!validPromptJsonThinkingLevel(resultMetadata.thinkingLevel) ||
			!nonEmpty(resultMetadata.modelVersion) ||
			resultMetadata.blocked !== false ||
			!validUsage(resultMetadata.usage) ||
			!nonNegativeNumber(resultMetadata.costUsd) ||
			resultMetadata.localResponseSchemaSha256 !== localSchemaHash ||
			resultMetadata.localValidationStatus !== 'passed' ||
			resultMetadata.localValidationError !== null
		) {
			issues.push(
				'prompt-JSON result metadata has invalid transport/provider/local-validation evidence.'
			);
		}
		if (
			resultMetadata.rawTextSha256 !== hashes.lastMessageSha256 ||
			resultMetadata.thoughtsSha256 !== hashes.thoughtsSha256 ||
			parsedLastMessage === null ||
			resultMetadata.valueCanonicalSha256 !== canonicalHash(parsedLastMessage)
		) {
			issues.push('prompt-JSON result metadata does not bind output/thought/value evidence.');
		}
		if (
			!isRecord(summary) ||
			resultMetadata.provider !== summary.provider ||
			resultMetadata.model !== summary.model ||
			resultMetadata.modelVersion !== summary.modelVersion ||
			resultMetadata.thinkingLevel !== summary.thinkingLevel ||
			canonicalHash(resultMetadata.usage) !== canonicalHash(summary.usage) ||
			resultMetadata.costUsd !== summary.costUsd ||
			resultMetadata.startedAt !== summary.startedAt ||
			resultMetadata.finishedAt !== summary.finishedAt ||
			resultMetadata.durationMilliseconds !== summary.durationMilliseconds
		) {
			issues.push('prompt-JSON result metadata differs from run summary.');
		}
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		events: eventLog.events,
		hashes,
		responseDeltas,
		thoughtDeltas
	};
}

export function validateScienceChallengeDirectMultipartRunPolicy({
	summary,
	eventLogBytes,
	lastMessageBytes,
	promptBytes,
	multipartEvidence,
	expectedResponseJsonSchema,
	expectedInputs,
	expectedInputSha256,
	expectedPartPrompts
}) {
	const issues = [];
	const eventLog = parseScienceChallengeDirectJsonEventLog(eventLogBytes);
	issues.push(...eventLog.issues);
	const lastMessage = decodeLastMessage(lastMessageBytes, issues);
	const prompt = decodeUtf8(promptBytes, 'multipart orchestration prompt', issues);
	if (!isRecord(summary)) {
		return {
			status: 'failed',
			issues: [...issues, 'multipart run summary must be a JSON object.']
		};
	}
	const extraSummaryFields = unexpectedFields(summary, DIRECT_MULTIPART_SUMMARY_FIELDS);
	if (extraSummaryFields.length) {
		issues.push(
			`multipart run summary contains unexpected fields: ${extraSummaryFields.join(', ')}.`
		);
	}
	const promptJsonMode =
		summary.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON;
	const structuredJsonMode =
		summary.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON;
	if (
		summary.schemaVersion !== SCIENCE_CHALLENGE_DIRECT_MULTIPART_SUMMARY_SCHEMA ||
		summary.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
		(!promptJsonMode && !structuredJsonMode) ||
		(promptJsonMode &&
			(summary.transportVersion !==
				SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION ||
				summary.providerSchemaApplied !== false)) ||
		(structuredJsonMode &&
			(summary.transportVersion !== SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION ||
				summary.providerSchemaApplied !== true))
	) {
		issues.push('multipart run summary transport schema is invalid.');
	}
	if (
		summary.status !== 'passed' ||
		summary.error !== null ||
		summary.provider !== SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER ||
		summary.model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL ||
		summary.modelVersion !== null ||
		(promptJsonMode
			? !validPromptJsonThinkingLevel(summary.thinkingLevel)
			: summary.thinkingLevel !== SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL) ||
		summary.blocked !== false
	) {
		issues.push('multipart run summary does not describe a successful required model run.');
	}
	if (!['configured-proxy', 'default-chatgpt-profile'].includes(summary.authMode)) {
		issues.push('multipart run summary authMode is invalid.');
	}
	for (const field of [...ZERO_SUMMARY_FIELDS, 'toolCalls', 'hostedTools']) {
		if (summary[field] !== 0) issues.push(`multipart run summary ${field} must be 0.`);
	}
	if (
		!Number.isInteger(summary.partSize) ||
		summary.partSize < 1 ||
		!Number.isInteger(summary.expectedPartCount) ||
		summary.expectedPartCount < 2 ||
		summary.attemptedPartCount !== summary.expectedPartCount ||
		summary.completedPartCount !== summary.expectedPartCount
	) {
		issues.push('multipart run summary has invalid complete part counts.');
	}
	if (
		!canonicalTimestamp(summary.startedAt) ||
		!canonicalTimestamp(summary.finishedAt) ||
		Date.parse(summary.finishedAt) < Date.parse(summary.startedAt) ||
		!Number.isInteger(summary.durationMilliseconds) ||
		summary.durationMilliseconds < 0 ||
		summary.durationSeconds !== Number((summary.durationMilliseconds / 1000).toFixed(3))
	) {
		issues.push('multipart run summary timing is invalid.');
	}
	if (!isSha256(expectedInputSha256) || summary.inputSha256 !== expectedInputSha256) {
		issues.push('multipart run summary does not bind the full authoring input envelope.');
	}
	if (prompt === null || summary.orchestrationPromptSha256 !== hashBytes(promptBytes)) {
		issues.push('multipart run summary does not bind the orchestration prompt.');
	}
	if (
		!isRecord(expectedResponseJsonSchema) ||
		summary.mergedResponseSchemaSha256 !== canonicalHash(expectedResponseJsonSchema)
	) {
		issues.push('multipart run summary does not bind the full response schema.');
	}

	let expectedParts = null;
	if (!Array.isArray(expectedInputs) || expectedInputs.length === 0) {
		issues.push('multipart replay requires the exact ordered authoring inputs.');
	} else {
		try {
			expectedParts = buildScienceChallengeAuthoringParts({
				rows: expectedInputs.map((input) => ({ id: input?.plan?.id })),
				inputs: expectedInputs,
				partSize: summary.partSize
			});
		} catch (error) {
			issues.push(error instanceof Error ? error.message : String(error));
		}
	}
	const expectedRowIds = expectedParts?.flatMap((part) => part.rowIds) ?? [];
	if (
		!Array.isArray(summary.rowIds) ||
		canonicalHash(summary.rowIds ?? null) !== canonicalHash(expectedRowIds) ||
		summary.expectedPartCount !== expectedParts?.length
	) {
		issues.push(
			'multipart run summary row order or partition count differs from canonical inputs.'
		);
	}
	if (!Array.isArray(summary.parts) || summary.parts.length !== summary.expectedPartCount) {
		issues.push('multipart run summary must contain every ordered part record.');
	}
	if (Array.isArray(summary.parts) && summary.partsSha256 !== canonicalHash(summary.parts)) {
		issues.push('multipart run summary partsSha256 does not bind its part records.');
	}
	const evidenceParts = Array.isArray(multipartEvidence?.parts) ? multipartEvidence.parts : [];
	if (evidenceParts.length !== summary.expectedPartCount) {
		issues.push('multipart evidence does not contain every ordered part.');
	}
	if (
		!Array.isArray(expectedPartPrompts) ||
		expectedPartPrompts.length !== summary.expectedPartCount ||
		expectedPartPrompts.some((value) => typeof value !== 'string' || !value.trim())
	) {
		issues.push(
			'multipart replay requires every exact deterministically reconstructed part prompt.'
		);
	}

	const batches = [];
	const actualUsages = [];
	const actualCosts = [];
	const actualModelVersions = [];
	for (let index = 0; index < summary.expectedPartCount; index += 1) {
		const record = summary.parts?.[index];
		const evidence = evidenceParts[index];
		const expected = expectedParts?.[index];
		const expectedPartId = `part-${String(index + 1).padStart(2, '0')}`;
		const prefix = `multipart ${expectedPartId}`;
		if (!isRecord(record)) {
			issues.push(`${prefix} record is missing.`);
			continue;
		}
		const extraPartFields = unexpectedFields(record, DIRECT_MULTIPART_PART_FIELDS);
		if (extraPartFields.length) {
			issues.push(`${prefix} contains unexpected fields: ${extraPartFields.join(', ')}.`);
		}
		let expectedPaths = null;
		try {
			expectedPaths = scienceChallengeMultipartPartPaths(expectedPartId);
		} catch (error) {
			issues.push(error instanceof Error ? error.message : String(error));
		}
		if (
			record.partId !== expectedPartId ||
			record.index !== index + 1 ||
			record.start !== expected?.start ||
			record.end !== expected?.end ||
			canonicalHash(record.rowIds ?? null) !== canonicalHash(expected?.rowIds ?? []) ||
				record.inputSha256 !== expected?.inputSha256 ||
				(promptJsonMode
					? record.transportVersion !== SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION ||
						record.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ||
						record.providerSchemaApplied !== false
					: record.transportVersion !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION ||
						record.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON ||
						record.providerSchemaApplied !== true) ||
			record.responseSchemaSha256 !==
				canonicalHash(challengeBatchOutputSchema(expected?.rowIds?.length ?? 0))
		) {
			issues.push(`${prefix} does not match the canonical ordered partition.`);
		}
		for (const [field, pathKey] of [
			['promptPath', 'prompt'],
			['requestPath', 'request'],
			['eventLogPath', 'events'],
			['rawOutputPath', 'lastMessage'],
			['thoughtsPath', 'thoughts'],
			['resultMetadataPath', 'resultMetadata'],
			['runSummaryPath', 'runSummary']
		]) {
			if (record[field] !== expectedPaths?.[pathKey]) {
				issues.push(`${prefix} ${field} is not the canonical evidence path.`);
			}
		}
		if (!evidence || canonicalHash(evidence.record) !== canonicalHash(record)) {
			issues.push(`${prefix} evidence is missing or substituted.`);
			continue;
		}
		const expectedPromptBytes =
			typeof expectedPartPrompts?.[index] === 'string'
				? Buffer.from(`${expectedPartPrompts[index]}\n`)
				: null;
		if (
			!expectedPromptBytes ||
			record.promptSha256 !== hashBytes(expectedPromptBytes) ||
			!byteEqual(evidence.promptBytes, expectedPromptBytes)
		) {
			issues.push(
				`${prefix} prompt differs from the canonical part inputs, repair evidence or retry state.`
			);
		}
		const hashes = {
			promptSha256: hashBytes(evidence.promptBytes),
			requestSha256: hashBytes(evidence.requestBytes),
			eventLogSha256: hashBytes(evidence.eventLogBytes),
			rawOutputSha256: hashBytes(evidence.lastMessageBytes),
			thoughtsSha256: hashBytes(evidence.thoughtsBytes),
			resultMetadataSha256: hashBytes(evidence.resultMetadataBytes),
			runSummarySha256: canonicalHash(evidence.summary)
		};
		for (const [field, expectedHash] of Object.entries(hashes)) {
			if (record[field] !== expectedHash) {
				issues.push(`${prefix} ${field} does not bind its evidence bytes.`);
			}
		}
		const partSchema = challengeBatchOutputSchema(expected?.rowIds?.length ?? 0);
		const partPolicy = (
			promptJsonMode
				? validateScienceChallengeDirectPromptJsonRunPolicy
				: validateScienceChallengeDirectJsonRunPolicy
		)({
			summary: evidence.summary,
			eventLogBytes: evidence.eventLogBytes,
			lastMessageBytes: evidence.lastMessageBytes,
			promptBytes: evidence.promptBytes,
			requestBytes: evidence.requestBytes,
			thoughtsBytes: evidence.thoughtsBytes,
			resultMetadataBytes: evidence.resultMetadataBytes,
			expectedResponseJsonSchema: partSchema
		});
		issues.push(...partPolicy.issues.map((issue) => `${prefix}: ${issue}`));
		let batch = null;
		try {
			batch = JSON.parse(Buffer.from(evidence.lastMessageBytes).toString('utf8'));
			batches.push(batch);
		} catch {
			issues.push(`${prefix} raw output is not valid JSON.`);
		}
		if (
			batch &&
			(record.rawCandidateSha256 !== canonicalHash(batch) ||
				record.status !== 'passed' ||
				record.provider !== evidence.summary.provider ||
					record.model !== evidence.summary.model ||
					record.modelVersion !== evidence.summary.modelVersion ||
					record.thinkingLevel !== evidence.summary.thinkingLevel ||
					record.transportVersion !== evidence.summary.transportVersion ||
					record.responseMode !== evidence.summary.responseMode ||
					record.providerSchemaApplied !== evidence.summary.providerSchemaApplied ||
					record.thinkingLevel !== summary.thinkingLevel ||
				canonicalHash(record.usage ?? null) !== canonicalHash(evidence.summary.usage ?? null) ||
				record.costUsd !== evidence.summary.costUsd)
		) {
			issues.push(`${prefix} record differs from its direct run summary or raw output.`);
		}
		if (isRecord(evidence.summary.usage)) actualUsages.push(evidence.summary.usage);
		if (nonNegativeNumber(evidence.summary.costUsd)) actualCosts.push(evidence.summary.costUsd);
		if (nonEmpty(evidence.summary.modelVersion)) {
			actualModelVersions.push(evidence.summary.modelVersion);
		}
	}

	const merge =
		expectedParts && batches.length === expectedParts.length
			? mergeScienceChallengeAuthoringPartBatches({ parts: expectedParts, batches })
			: { status: 'failed', issues: ['Not every part batch was available.'], candidate: null };
	issues.push(...merge.issues.map((issue) => `multipart merge: ${issue}`));
	let parsedLastMessage = null;
	if (lastMessage !== null) {
		try {
			parsedLastMessage = JSON.parse(lastMessage);
		} catch {
			issues.push('multipart merged last message is not valid JSON.');
		}
	}
	if (
		!merge.candidate ||
		!parsedLastMessage ||
		canonicalHash(merge.candidate) !== canonicalHash(parsedLastMessage) ||
		summary.mergedCandidateSha256 !== canonicalHash(merge.candidate)
	) {
		issues.push('multipart merged candidate differs from its exact ordered part outputs.');
	}
	const rootHashes = {
		eventLogSha256: hashBytes(eventLogBytes),
		finalResponseSha256: hashBytes(lastMessageBytes),
		lastMessageFileSha256: hashBytes(lastMessageBytes)
	};
	for (const [field, expectedHash] of Object.entries(rootHashes)) {
		if (summary[field] !== expectedHash) {
			issues.push(`multipart run summary ${field} does not bind its bytes.`);
		}
	}
	const expectedUsage = aggregateUsage(actualUsages);
	const expectedCost = Number(actualCosts.reduce((total, value) => total + value, 0).toFixed(12));
	const expectedModelVersions = [...new Set(actualModelVersions)].sort();
	if (
		canonicalHash(summary.usage ?? null) !== canonicalHash(expectedUsage) ||
		summary.costUsd !== expectedCost ||
		canonicalHash(summary.modelVersions ?? null) !== canonicalHash(expectedModelVersions)
	) {
		issues.push('multipart aggregate usage, cost or model versions differ from part evidence.');
	}

	const expectedEvents = (summary.parts ?? []).map((record) => ({
		schemaVersion: SCIENCE_CHALLENGE_DIRECT_MULTIPART_EVENT_SCHEMA,
		type: 'part.finished',
		partId: record.partId,
		index: record.index,
		status: record.status,
		promptSha256: record.promptSha256,
			runSummarySha256: record.runSummarySha256,
			rawOutputSha256: record.rawOutputSha256,
			eventLogSha256: record.eventLogSha256,
			responseMode: summary.responseMode,
			providerSchemaApplied: summary.providerSchemaApplied,
			transportVersion: record.transportVersion
		}));
	if (merge.candidate) {
		const completedEvent = {
			schemaVersion: SCIENCE_CHALLENGE_DIRECT_MULTIPART_EVENT_SCHEMA,
			type: 'multipart.completed',
			partCount: summary.expectedPartCount,
			rowIds: expectedRowIds,
			mergedCandidateSha256: canonicalHash(merge.candidate),
			responseMode: summary.responseMode,
			providerSchemaApplied: summary.providerSchemaApplied,
			transportVersion: summary.transportVersion
		};
		expectedEvents.push(completedEvent);
	}
	if (canonicalHash(eventLog.events) !== canonicalHash(expectedEvents)) {
		issues.push('multipart composite event index differs from ordered part evidence.');
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		candidate: merge.candidate,
		parts: evidenceParts
	};
}

export function validateScienceChallengeModelRunPolicy({
	summary,
	eventLogBytes,
	lastMessageBytes,
	expectedModel = SCIENCE_CHALLENGE_AUTHORING_MODEL,
	expectedThinkingLevel = SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL
}) {
	const issues = [];
	if (!isRecord(summary)) {
		issues.push('run summary must be a JSON object.');
	}

	const eventLog = parseScienceChallengeModelRunEventLog(eventLogBytes);
	issues.push(...eventLog.issues);
	const lastMessage = decodeLastMessage(lastMessageBytes, issues);

	if (isRecord(summary)) {
		if (summary.status !== 'passed') issues.push('run summary status must be passed.');
		if (summary.error !== null && summary.error !== undefined) {
			issues.push('successful run summary must not contain an error.');
		}
		if (summary.model !== expectedModel) {
			issues.push(`run summary model must be ${expectedModel}.`);
		}
		if (summary.thinkingLevel !== expectedThinkingLevel) {
			issues.push(`run summary thinkingLevel must be ${expectedThinkingLevel}.`);
		}
		for (const field of ZERO_SUMMARY_FIELDS) {
			if (summary[field] !== 0) issues.push(`run summary ${field} must be 0.`);
		}
	}

	const events = eventLog.records;
	const agentMessages = [];
	for (const [eventIndex, record] of events.entries()) {
		const { event, line } = record;
		const expected =
			eventIndex === 0
				? 'thread.started'
				: eventIndex === 1
					? 'turn.started'
					: eventIndex === events.length - 1
						? 'turn.completed'
						: 'item.completed agent_message';
		if (eventIndex === 0 && event.type === 'thread.started') continue;
		if (eventIndex === 1 && event.type === 'turn.started') continue;
		if (eventIndex === events.length - 1 && event.type === 'turn.completed') continue;
		if (
			event.type === 'item.completed' &&
			event.item?.type === 'agent_message' &&
			typeof event.item.text === 'string'
		) {
			agentMessages.push(event.item.text);
			continue;
		}
		issues.push(
			`event log line ${line} is forbidden or out of order; expected ${expected}, received ${eventLabel(
				event
			)}.`
		);
	}

	if (events[0]?.event?.type !== 'thread.started') {
		issues.push('event log must start with thread.started.');
	}
	if (events[1]?.event?.type !== 'turn.started') {
		issues.push('event log must contain turn.started immediately after thread.started.');
	}
	if (events.at(-1)?.event?.type !== 'turn.completed') {
		issues.push('event log must end with turn.completed.');
	}
	if (agentMessages.length === 0) {
		issues.push('event log must contain at least one completed agent message.');
	}
	if (lastMessage !== null && agentMessages.length > 0 && agentMessages.at(-1) !== lastMessage) {
		issues.push('last completed agent message does not equal the raw last-message bytes.');
	}

	const eventLogBuffer = asBuffer(eventLogBytes, 'event log', []);
	const lastMessageBuffer = asBuffer(lastMessageBytes, 'raw last message', []);
	const hashes = {
		eventLogSha256: eventLogBuffer ? sha256(eventLogBuffer) : null,
		lastMessageSha256: lastMessageBuffer ? sha256(lastMessageBuffer) : null
	};
	if (isRecord(summary)) {
		for (const [field, label] of SUMMARY_HASH_FIELDS) {
			const expected =
				field === 'eventLogSha256' ? hashes.eventLogSha256 : hashes.lastMessageSha256;
			if (!isSha256(summary[field])) {
				issues.push(`run summary ${field} must be a SHA-256 hash.`);
			} else if (summary[field] !== expected) {
				issues.push(`run summary ${field} does not match the supplied ${label} bytes.`);
			}
		}
		if (!Number.isInteger(summary.events) || summary.events !== events.length) {
			issues.push('run summary events does not match the parsed event count.');
		}
		if (
			!Number.isInteger(summary.agentMessages) ||
			summary.agentMessages !== agentMessages.length
		) {
			issues.push('run summary agentMessages does not match the parsed agent-message count.');
		}
	}

	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		events: events.map((record) => record.event),
		agentMessages,
		hashes
	};
}

export function requireScienceChallengeModelRunPolicy({
	policyLabel = 'Science challenge model run',
	...input
}) {
	const validation = validateScienceChallengeModelRunPolicy(input);
	if (validation.status !== 'passed') {
		throw new Error(`${policyLabel} violates policy:\n- ${validation.issues.join('\n- ')}`);
	}
	return validation;
}

export function buildScienceChallengeModelRunPolicyAttestation({
	summary,
	eventLogBytes,
	lastMessageBytes,
	expectedModel = SCIENCE_CHALLENGE_AUTHORING_MODEL,
	expectedThinkingLevel = SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL,
	policyLabel = 'Science challenge model run'
}) {
	const validation = requireScienceChallengeModelRunPolicy({
		summary,
		eventLogBytes,
		lastMessageBytes,
		expectedModel,
		expectedThinkingLevel,
		policyLabel
	});
	return {
		schemaVersion: SCIENCE_CHALLENGE_MODEL_RUN_POLICY_ATTESTATION_SCHEMA,
		policyVersion: SCIENCE_CHALLENGE_MODEL_RUN_POLICY_VERSION,
		status: 'passed',
		model: summary.model,
		thinkingLevel: summary.thinkingLevel,
		eventLogSha256: validation.hashes.eventLogSha256,
		eventCount: validation.events.length,
		allowedEventVocabulary: [...SCIENCE_CHALLENGE_MODEL_RUN_ALLOWED_EVENT_VOCABULARY],
		commandActions: summary.commandActions,
		failedCommandActions: summary.failedCommandActions,
		webSearches: summary.webSearches,
		fileChanges: summary.fileChanges,
		lastMessageSha256: validation.hashes.lastMessageSha256,
		agentMessageCount: validation.agentMessages.length
	};
}

export function validateScienceChallengeModelRunPolicyAttestation({
	attestation,
	summary,
	expectedModel = SCIENCE_CHALLENGE_AUTHORING_MODEL,
	expectedThinkingLevel = SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL,
	eventLogSha256,
	eventCount,
	lastMessageSha256
}) {
	const issues = [];
	if (!isRecord(attestation)) {
		return { status: 'failed', issues: ['model run policy attestation must be an object.'] };
	}
	const allowedFields = [
		'schemaVersion',
		'policyVersion',
		'status',
		'model',
		'thinkingLevel',
		'eventLogSha256',
		'eventCount',
		'allowedEventVocabulary',
		'commandActions',
		'failedCommandActions',
		'webSearches',
		'fileChanges',
		'lastMessageSha256',
		'agentMessageCount'
	];
	const unexpectedFields = Object.keys(attestation).filter(
		(field) => !allowedFields.includes(field)
	);
	if (unexpectedFields.length > 0) {
		issues.push(
			`model run policy attestation contains forbidden fields: ${unexpectedFields.join(', ')}.`
		);
	}
	if (attestation.schemaVersion !== SCIENCE_CHALLENGE_MODEL_RUN_POLICY_ATTESTATION_SCHEMA) {
		issues.push(
			`model run policy attestation schemaVersion must be ${SCIENCE_CHALLENGE_MODEL_RUN_POLICY_ATTESTATION_SCHEMA}.`
		);
	}
	if (attestation.policyVersion !== SCIENCE_CHALLENGE_MODEL_RUN_POLICY_VERSION) {
		issues.push(
			`model run policy attestation policyVersion must be ${SCIENCE_CHALLENGE_MODEL_RUN_POLICY_VERSION}.`
		);
	}
	if (attestation.status !== 'passed') {
		issues.push('model run policy attestation status must be passed.');
	}
	if (attestation.model !== expectedModel) {
		issues.push(`model run policy attestation model must be ${expectedModel}.`);
	}
	if (attestation.thinkingLevel !== expectedThinkingLevel) {
		issues.push(`model run policy attestation thinkingLevel must be ${expectedThinkingLevel}.`);
	}
	if (
		!Array.isArray(attestation.allowedEventVocabulary) ||
		attestation.allowedEventVocabulary.length !==
			SCIENCE_CHALLENGE_MODEL_RUN_ALLOWED_EVENT_VOCABULARY.length ||
		attestation.allowedEventVocabulary.some(
			(value, index) => value !== SCIENCE_CHALLENGE_MODEL_RUN_ALLOWED_EVENT_VOCABULARY[index]
		)
	) {
		issues.push('model run policy attestation allowedEventVocabulary is invalid.');
	}
	for (const field of ZERO_SUMMARY_FIELDS) {
		if (attestation[field] !== 0) {
			issues.push(`model run policy attestation ${field} must be 0.`);
		}
	}
	if (!isSha256(attestation.eventLogSha256)) {
		issues.push('model run policy attestation eventLogSha256 is invalid.');
	}
	if (!Number.isInteger(attestation.eventCount) || attestation.eventCount < 4) {
		issues.push('model run policy attestation eventCount must be at least 4.');
	}
	if (!isSha256(attestation.lastMessageSha256)) {
		issues.push('model run policy attestation lastMessageSha256 is invalid.');
	}
	if (!Number.isInteger(attestation.agentMessageCount) || attestation.agentMessageCount < 1) {
		issues.push('model run policy attestation agentMessageCount must be positive.');
	}
	if (attestation.eventLogSha256 !== eventLogSha256) {
		issues.push('model run policy attestation does not bind the external event log hash.');
	}
	if (attestation.eventCount !== eventCount) {
		issues.push('model run policy attestation does not bind the external event count.');
	}
	if (attestation.lastMessageSha256 !== lastMessageSha256) {
		issues.push('model run policy attestation does not bind the archived last-message hash.');
	}
	if (!isRecord(summary)) {
		issues.push('model run policy attestation requires its archived run summary.');
	} else {
		if (
			summary.status !== 'passed' ||
			(summary.error !== null && summary.error !== undefined) ||
			summary.model !== attestation.model ||
			summary.thinkingLevel !== attestation.thinkingLevel
		) {
			issues.push('model run policy attestation differs from the successful run summary.');
		}
		for (const field of ZERO_SUMMARY_FIELDS) {
			if (summary[field] !== attestation[field]) {
				issues.push(`model run policy attestation ${field} differs from the run summary.`);
			}
		}
		if (
			summary.eventLogSha256 !== attestation.eventLogSha256 ||
			summary.events !== attestation.eventCount
		) {
			issues.push('model run policy attestation event binding differs from the run summary.');
		}
		if (
			summary.finalResponseSha256 !== attestation.lastMessageSha256 ||
			summary.lastMessageFileSha256 !== attestation.lastMessageSha256 ||
			summary.agentMessages !== attestation.agentMessageCount
		) {
			issues.push(
				'model run policy attestation final-message binding differs from the run summary.'
			);
		}
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

export function validateScienceChallengeAuthoringRunPolicy(input) {
	if (isScienceChallengeDirectMultipartRunSummary(input?.summary)) {
		return validateScienceChallengeDirectMultipartRunPolicy(input);
	}
	if (isScienceChallengeDirectPromptJsonRunSummary(input?.summary)) {
		return validateScienceChallengeDirectPromptJsonRunPolicy(input);
	}
	if (isScienceChallengeDirectJsonRunSummary(input?.summary)) {
		return validateScienceChallengeDirectJsonRunPolicy(input);
	}
	if (!isRecord(input?.summary) || input.summary.transport !== 'codex-sdk') {
		return {
			status: 'failed',
			issues: [
				`Unsupported science challenge authoring transport ${String(input?.summary?.transport)}.`
			]
		};
	}
	return validateScienceChallengeModelRunPolicy({
		...input,
		expectedModel: SCIENCE_CHALLENGE_AUTHORING_MODEL,
		expectedThinkingLevel: SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL
	});
}

export function requireScienceChallengeAuthoringRunPolicy(input) {
	if (isScienceChallengeDirectMultipartRunSummary(input?.summary)) {
		const validation = validateScienceChallengeDirectMultipartRunPolicy(input);
		if (validation.status !== 'passed') {
			throw new Error(
				`Science challenge multipart authoring run violates policy:\n- ${validation.issues.join(
					'\n- '
				)}`
			);
		}
		return validation;
	}
	if (isScienceChallengeDirectPromptJsonRunSummary(input?.summary)) {
		const validation = validateScienceChallengeDirectPromptJsonRunPolicy(input);
		if (validation.status !== 'passed') {
			throw new Error(
				`Science challenge prompt-JSON authoring run violates policy:\n- ${validation.issues.join(
					'\n- '
				)}`
			);
		}
		return validation;
	}
	if (isScienceChallengeDirectJsonRunSummary(input?.summary)) {
		const validation = validateScienceChallengeDirectJsonRunPolicy(input);
		if (validation.status !== 'passed') {
			throw new Error(
				`Science challenge authoring run violates policy:\n- ${validation.issues.join('\n- ')}`
			);
		}
		return validation;
	}
	if (!isRecord(input?.summary) || input.summary.transport !== 'codex-sdk') {
		throw new Error(
			`Science challenge authoring run violates policy:\n- Unsupported science challenge authoring transport ${String(
				input?.summary?.transport
			)}.`
		);
	}
	return requireScienceChallengeModelRunPolicy({
		...input,
		expectedModel: SCIENCE_CHALLENGE_AUTHORING_MODEL,
		expectedThinkingLevel: SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL,
		policyLabel: 'Science challenge authoring run'
	});
}

export function isScienceChallengeDirectJsonRunSummary(summary) {
	return (
		isRecord(summary) &&
		summary.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
		summary.transportVersion === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION &&
		summary.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON &&
		summary.providerSchemaApplied === true
	);
}

export function isScienceChallengeDirectPromptJsonRunSummary(summary) {
	return (
		isRecord(summary) &&
		summary.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
		summary.transportVersion === SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION &&
		summary.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
		summary.providerSchemaApplied === false
	);
}

export function isScienceChallengeDirectSingleRunSummary(summary) {
	return (
		isScienceChallengeDirectJsonRunSummary(summary) ||
		isScienceChallengeDirectPromptJsonRunSummary(summary)
	);
}

export function isScienceChallengeDirectMultipartRunSummary(summary) {
	return (
		isRecord(summary) &&
		summary.transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT &&
		((summary.transportVersion === SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION &&
			summary.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON &&
			summary.providerSchemaApplied === true) ||
			(summary.transportVersion ===
				SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION &&
				summary.responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
				summary.providerSchemaApplied === false))
	);
}

function decodeLastMessage(value, issues) {
	const bytes = asBuffer(value, 'raw last message', issues);
	if (!bytes) return null;
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		issues.push('raw last message must be valid UTF-8.');
		return null;
	}
}

function decodeUtf8(value, label, issues) {
	const bytes = asBuffer(value, label, issues);
	if (!bytes) return null;
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		issues.push(`${label} must be valid UTF-8.`);
		return null;
	}
}

function parseJsonBytes(value, label, issues) {
	const text = decodeUtf8(value, label, issues);
	if (text === null) return null;
	try {
		const parsed = JSON.parse(text);
		if (!isRecord(parsed)) throw new Error('not an object');
		return parsed;
	} catch {
		issues.push(`${label} must contain one JSON object.`);
		return null;
	}
}

function asBuffer(value, label, issues) {
	if (Buffer.isBuffer(value)) return value;
	if (typeof value === 'string') return Buffer.from(value);
	if (value instanceof Uint8Array) {
		return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
	}
	issues.push(`${label} bytes must be a string, Buffer or Uint8Array.`);
	return null;
}

function hashBytes(value) {
	const bytes = asBuffer(value, 'evidence', []);
	return bytes ? sha256(bytes) : null;
}

function byteEqual(left, right) {
	const leftBytes = asBuffer(left, 'left evidence', []);
	const rightBytes = asBuffer(right, 'right evidence', []);
	return Boolean(leftBytes && rightBytes && Buffer.compare(leftBytes, rightBytes) === 0);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function isSha256(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function eventLabel(event) {
	if (!isRecord(event)) return 'non-object event';
	if (event.type === 'delta') return `delta:${String(event.channel ?? 'unknown')}`;
	if (event.type === 'json') return `json:${String(event.stage ?? 'unknown')}`;
	if (event.type === 'tool_call') return `tool_call:${String(event.phase ?? 'unknown')}`;
	if (event.type === 'item.completed')
		return `item.completed ${String(event.item?.type ?? 'unknown')}`;
	return String(event.type ?? 'unknown event');
}

function validUsage(value) {
	if (!isRecord(value) || Object.keys(value).length === 0) return false;
	if (unexpectedFields(value, LLM_USAGE_FIELDS).length > 0) return false;
	return Object.values(value).every(
		(tokenCount) => Number.isInteger(tokenCount) && tokenCount >= 0
	);
}

function nonNegativeNumber(value) {
	return Number.isFinite(value) && value >= 0;
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function validPromptJsonThinkingLevel(value) {
	return value === SCIENCE_CHALLENGE_AUTHORING_THINKING_LEVEL || value === 'high';
}

function canonicalTimestamp(value) {
	return (
		typeof value === 'string' &&
		!Number.isNaN(Date.parse(value)) &&
		new Date(value).toISOString() === value
	);
}

function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unexpectedFields(value, allowed) {
	if (!isRecord(value)) return [];
	const allowedFields = new Set(allowed);
	return Object.keys(value).filter((field) => !allowedFields.has(field));
}

function aggregateUsage(values) {
	const totals = {};
	for (const value of values) {
		if (!isRecord(value)) continue;
		for (const [field, count] of Object.entries(value)) {
			if (Number.isInteger(count) && count >= 0) totals[field] = (totals[field] ?? 0) + count;
		}
	}
	return totals;
}
