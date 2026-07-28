import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import path from 'node:path';

import {
	mergeScienceChallengeAuthoringPartBatches,
	scienceChallengeMultipartPartPaths
} from './science-challenge-authoring-parts.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_EVENT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_SUMMARY_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';
import { runDirectScienceChallengeJsonTurn } from './science-challenge-direct-json-runner.mjs';
import { runDirectScienceChallengePromptJsonTurn } from './science-challenge-direct-prompt-json-runner.mjs';
import { validateScienceChallengeAuthoringRunPolicy } from './science-challenge-authoring-run-policy.mjs';
import {
	canonicalHash,
	challengeBatchOutputSchema,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';

export async function runDirectScienceChallengeMultipartTurn({
	parts,
	partSize,
	attemptDir,
	orchestrationPrompt,
	inputSha256,
	model = SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	thinkingLevel = 'max',
	timeoutMs = 7_200_000,
	authMode = 'default-chatgpt-profile',
	responseMode = SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
	runPartImpl = null
}) {
	if (!Array.isArray(parts) || parts.length < 2) {
		throw new Error('Direct multipart authoring requires at least two ordered parts.');
	}
	if (!Number.isInteger(partSize) || partSize < 1) {
		throw new Error('Direct multipart authoring partSize must be a positive integer.');
	}
	if (typeof attemptDir !== 'string' || !attemptDir.trim()) {
		throw new Error('Direct multipart authoring attemptDir is required.');
	}
	if (typeof orchestrationPrompt !== 'string' || !orchestrationPrompt.trim()) {
		throw new Error('Direct multipart orchestration prompt is required.');
	}
	if (!sha256String(inputSha256)) {
		throw new Error('Direct multipart authoring inputSha256 is invalid.');
	}
	if (
		![
			SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
			SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
		].includes(responseMode)
	) {
		throw new Error(`Unsupported direct response mode ${String(responseMode)}.`);
	}
	if (
		thinkingLevel !== 'max' &&
		!(
			responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
			thinkingLevel === 'high'
		)
	) {
		throw new Error(
			'Direct multipart thinkingLevel must be max; only prompt-json may explicitly use high.'
		);
	}
	const selectedRunPartImpl =
		runPartImpl ??
		(responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
			? runDirectScienceChallengePromptJsonTurn
			: runDirectScienceChallengeJsonTurn);
	mkdirSync(attemptDir, { recursive: true });
	const rootPaths = {
		events: path.join(attemptDir, 'events.jsonl'),
		lastMessage: path.join(attemptDir, 'last-message.json'),
		summary: path.join(attemptDir, 'run-summary.json')
	};
	writeFileSync(rootPaths.events, '');
	writeFileSync(rootPaths.lastMessage, '');

	const startedAt = new Date().toISOString();
	const started = performance.now();
	const partRecords = [];
	const partBatches = [];
	let failure = null;
	for (const [index, part] of parts.entries()) {
		const expectedPartId = `part-${String(index + 1).padStart(2, '0')}`;
		if (
			part?.partId !== expectedPartId ||
			part.index !== index + 1 ||
			!Array.isArray(part.rowIds) ||
			part.rowIds.length === 0 ||
			typeof part.prompt !== 'string' ||
			!part.prompt.trim()
		) {
			failure = new Error(`Direct multipart definition ${index + 1} is invalid.`);
			break;
		}
		const relativePaths = scienceChallengeMultipartPartPaths(expectedPartId);
		const absolutePaths = Object.fromEntries(
			Object.entries(relativePaths).map(([key, relativePath]) => [
				key,
				path.join(attemptDir, ...relativePath.split('/'))
			])
		);
		mkdirSync(path.dirname(absolutePaths.prompt), { recursive: true });
		writeFileSync(absolutePaths.prompt, `${part.prompt}\n`);
		const responseSchema = challengeBatchOutputSchema(part.rowIds.length);
		let run = null;
		let partFailure = null;
		try {
			run = await selectedRunPartImpl({
				prompt: part.prompt,
				outputSchema: responseSchema,
				eventsPath: absolutePaths.events,
				lastMessagePath: absolutePaths.lastMessage,
				thoughtsPath: absolutePaths.thoughts,
				requestPath: absolutePaths.request,
				resultMetadataPath: absolutePaths.resultMetadata,
				summaryPath: absolutePaths.runSummary,
				model,
				thinkingLevel,
				timeoutMs,
				authMode
			});
		} catch (error) {
			partFailure = error instanceof Error ? error : new Error(String(error));
		}
		const record = buildPartRecord({
			part,
			relativePaths,
			absolutePaths,
			responseSchema
		});
		partRecords.push(record);
		appendJsonLine(rootPaths.events, {
			schemaVersion: SCIENCE_CHALLENGE_DIRECT_MULTIPART_EVENT_SCHEMA,
			type: 'part.finished',
			partId: record.partId,
			index: record.index,
			status: record.status,
			promptSha256: record.promptSha256,
			runSummarySha256: record.runSummarySha256,
			rawOutputSha256: record.rawOutputSha256,
			eventLogSha256: record.eventLogSha256,
			responseMode,
			providerSchemaApplied:
				responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
			transportVersion:
				responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
					? SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION
					: record.transportVersion
		});
		if (!partFailure && run) {
			const policy = validateScienceChallengeAuthoringRunPolicy({
				summary: withoutFinalResponse(run),
				eventLogBytes: readFileSync(absolutePaths.events),
				lastMessageBytes: readFileSync(absolutePaths.lastMessage),
				promptBytes: readFileSync(absolutePaths.prompt),
				requestBytes: readFileSync(absolutePaths.request),
				thoughtsBytes: readFileSync(absolutePaths.thoughts),
				resultMetadataBytes: readFileSync(absolutePaths.resultMetadata),
				expectedResponseJsonSchema: responseSchema
			});
			if (policy.status !== 'passed') {
				partFailure = new Error(
					`${expectedPartId} direct run policy failed:\n${policy.issues.join('\n')}`
				);
			}
		}
		if (!partFailure) {
			try {
				partBatches.push(JSON.parse(readFileSync(absolutePaths.lastMessage, 'utf8')));
			} catch (error) {
				partFailure = new Error(
					`${expectedPartId} raw output is not JSON: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		}
		if (partFailure) {
			failure = partFailure;
			break;
		}
	}

	let mergedCandidate = null;
	if (!failure) {
		const merge = mergeScienceChallengeAuthoringPartBatches({
			parts,
			batches: partBatches
		});
		if (merge.status !== 'passed') {
			failure = new Error(`Direct multipart merge failed:\n${merge.issues.join('\n')}`);
		} else {
			mergedCandidate = merge.candidate;
			writeFileSync(rootPaths.lastMessage, stableStringify(mergedCandidate));
			appendJsonLine(rootPaths.events, {
				schemaVersion: SCIENCE_CHALLENGE_DIRECT_MULTIPART_EVENT_SCHEMA,
				type: 'multipart.completed',
				partCount: parts.length,
				rowIds: parts.flatMap((part) => part.rowIds),
				mergedCandidateSha256: canonicalHash(mergedCandidate),
				responseMode,
				providerSchemaApplied:
					responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
				transportVersion:
					responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
						? SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION
						: SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION
			});
		}
	}

	const finishedAt = new Date().toISOString();
	const durationMilliseconds = Math.max(0, Math.round(performance.now() - started));
	const summary = buildCompositeSummary({
		status: failure ? 'failed' : 'passed',
		error: failure?.message ?? null,
		authMode,
		model,
		thinkingLevel,
		partSize,
		parts,
		partRecords,
		inputSha256,
		orchestrationPrompt,
		rootPaths,
		mergedCandidate,
		startedAt,
		finishedAt,
		durationMilliseconds,
		responseMode
	});
	writeJson(rootPaths.summary, summary);
	if (failure) throw failure;
	return { ...summary, finalResponse: stableStringify(mergedCandidate) };
}

function buildPartRecord({ part, relativePaths, absolutePaths, responseSchema }) {
	const runSummary = readOptionalJson(absolutePaths.runSummary);
	const rawOutput = readOptional(absolutePaths.lastMessage);
	let rawCandidateSha256 = null;
	try {
		rawCandidateSha256 = canonicalHash(JSON.parse(rawOutput.toString('utf8')));
	} catch {
		// A failed part may legitimately have no structured output.
	}
	const record = {
		partId: part.partId,
		index: part.index,
		start: part.start,
		end: part.end,
		rowIds: [...part.rowIds],
		inputSha256: part.inputSha256,
		responseSchemaSha256: canonicalHash(responseSchema),
		promptPath: relativePaths.prompt,
		promptSha256: sha256(readOptional(absolutePaths.prompt)),
		requestPath: relativePaths.request,
		requestSha256: hashOptional(absolutePaths.request),
		eventLogPath: relativePaths.events,
		eventLogSha256: hashOptional(absolutePaths.events),
		rawOutputPath: relativePaths.lastMessage,
		rawOutputSha256: sha256(rawOutput),
		rawCandidateSha256,
		thoughtsPath: relativePaths.thoughts,
		thoughtsSha256: hashOptional(absolutePaths.thoughts),
		resultMetadataPath: relativePaths.resultMetadata,
		resultMetadataSha256: hashOptional(absolutePaths.resultMetadata),
		runSummaryPath: relativePaths.runSummary,
		runSummarySha256: runSummary ? canonicalHash(runSummary) : null,
		status: runSummary?.status ?? 'failed',
		provider: runSummary?.provider ?? null,
		model: runSummary?.model ?? null,
			modelVersion: runSummary?.modelVersion ?? null,
			thinkingLevel: runSummary?.thinkingLevel ?? null,
			usage: runSummary?.usage ?? null,
			costUsd: runSummary?.costUsd ?? null,
			transportVersion: runSummary?.transportVersion ?? null,
			responseMode: runSummary?.responseMode ?? null,
			providerSchemaApplied: runSummary?.providerSchemaApplied ?? null
		};
		return record;
}

function buildCompositeSummary({
	status,
	error,
	authMode,
	model,
	thinkingLevel,
	partSize,
	parts,
	partRecords,
	inputSha256,
	orchestrationPrompt,
	rootPaths,
	mergedCandidate,
	startedAt,
	finishedAt,
	durationMilliseconds,
	responseMode
}) {
	const modelVersions = [
		...new Set(partRecords.map((record) => record.modelVersion).filter(nonEmpty))
	].sort();
	const usage = aggregateUsage(partRecords.map((record) => record.usage));
	const costUsd = partRecords.reduce(
		(total, record) =>
			total + (Number.isFinite(record.costUsd) && record.costUsd >= 0 ? record.costUsd : 0),
		0
	);
	const summary = {
		schemaVersion: SCIENCE_CHALLENGE_DIRECT_MULTIPART_SUMMARY_SCHEMA,
		status,
		error,
		transport: SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
		transportVersion:
			responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
				? SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION
				: SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION,
		responseMode,
		providerSchemaApplied:
			responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
		authMode,
		provider: SCIENCE_CHALLENGE_DIRECT_JSON_PROVIDER,
		model,
		modelVersion: null,
		modelVersions,
		thinkingLevel,
		blocked: status === 'passed' ? false : null,
		usage,
		costUsd: Number(costUsd.toFixed(12)),
		commandActions: 0,
		failedCommandActions: 0,
		webSearches: 0,
		fileChanges: 0,
		toolCalls: 0,
		hostedTools: 0,
		partSize,
		expectedPartCount: parts.length,
		attemptedPartCount: partRecords.length,
		completedPartCount: partRecords.filter((record) => record.status === 'passed').length,
		rowIds: parts.flatMap((part) => part.rowIds),
		inputSha256,
		orchestrationPromptSha256: sha256(`${orchestrationPrompt}\n`),
		mergedResponseSchemaSha256: canonicalHash(
			challengeBatchOutputSchema(parts.flatMap((part) => part.rowIds).length)
		),
		partsSha256: canonicalHash(partRecords),
		parts: partRecords,
		startedAt,
		finishedAt,
		durationMilliseconds,
		durationSeconds: Number((durationMilliseconds / 1000).toFixed(3)),
		eventLogSha256: sha256(readOptional(rootPaths.events)),
		finalResponseSha256: sha256(readOptional(rootPaths.lastMessage)),
		lastMessageFileSha256: sha256(readOptional(rootPaths.lastMessage)),
		mergedCandidateSha256: mergedCandidate ? canonicalHash(mergedCandidate) : null
	};
	return summary;
}

function aggregateUsage(values) {
	const totals = {};
	for (const value of values) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
		for (const [key, count] of Object.entries(value)) {
			if (Number.isInteger(count) && count >= 0) totals[key] = (totals[key] ?? 0) + count;
		}
	}
	return totals;
}

function readOptional(filePath) {
	try {
		return readFileSync(filePath);
	} catch {
		return Buffer.alloc(0);
	}
}

function readOptionalJson(filePath) {
	try {
		return JSON.parse(readFileSync(filePath, 'utf8'));
	} catch {
		return null;
	}
}

function hashOptional(filePath) {
	try {
		return sha256(readFileSync(filePath));
	} catch {
		return null;
	}
}

function appendJsonLine(filePath, value) {
	// JSONL is a framing format: one physical line must contain one complete JSON value.
	// Pretty-printing here makes an otherwise valid event impossible to replay line-by-line.
	writeFileSync(filePath, `${stableStringify(value, 0)}\n`, { flag: 'a' });
}

function writeJson(filePath, value) {
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function withoutFinalResponse(run) {
	const summary = { ...run };
	delete summary.finalResponse;
	return summary;
}

function sha256String(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}
