import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	challengeBatchOutputSchema,
	normalizeGeneratedChallengeBatch,
	sha256
} from './science-challenge-release.mjs';
import {
	isScienceChallengeDirectMultipartRunSummary,
	isScienceChallengeDirectSingleRunSummary,
	requireScienceChallengeAuthoringRunPolicy
} from './science-challenge-authoring-run-policy.mjs';
import { readScienceChallengeDirectMultipartEvidence } from './science-challenge-authoring-parts.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';
import { validateScienceChallengeVerificationRepairAuthority } from './science-challenge-verification-repair-transaction.mjs';

const ATTEMPT_DIRECTORY = /^(?:attempt-\d{2}|verification-repair-[a-f0-9]{12}-attempt-\d{2})$/;
const STRUCTURED_OR_SDK_THINKING_LEVEL = 'max';

export function validateScienceChallengeAuthoringInputEvidence({ inputs, validation }) {
	if (!Array.isArray(inputs)) {
		return {
			status: 'failed',
			issues: ['authoring input.json must contain the exact ordered inputs array.'],
			envelope: null,
			inputSha256: null
		};
	}
	const issues = [];
	const verificationSummarySha256 = validation?.verificationRepairSha256;
	const priorCandidateSha256 = validation?.priorCandidateSha256;
	const authorityPresent = validation?.verificationRepairAuthority !== undefined;
	const authorityHashPresent = validation?.verificationRepairAuthoritySha256 !== undefined;
	const normal =
		(verificationSummarySha256 === null || verificationSummarySha256 === undefined) &&
		(priorCandidateSha256 === null || priorCandidateSha256 === undefined);
	const repair = sha256String(verificationSummarySha256) && sha256String(priorCandidateSha256);
	if (!normal && !repair) {
		issues.push(
			'authoring validation must claim either no repair evidence or both repair evidence hashes.'
		);
	}
	if (authorityPresent !== authorityHashPresent) {
		issues.push(
			'authoring validation must include both verification-repair authority and its hash, or neither.'
		);
	}
	if ((authorityPresent || authorityHashPresent) && !repair) {
		issues.push(
			'typed verification-repair authority is valid only for a complete repair envelope.'
		);
	}
	if (authorityPresent && authorityHashPresent) {
		const authorityValidation = validateScienceChallengeVerificationRepairAuthority({
			authority: validation.verificationRepairAuthority
		});
		issues.push(
			...authorityValidation.issues.map((issue) => `verification-repair authority: ${issue}`)
		);
		if (
			validation.verificationRepairAuthoritySha256 !==
			canonicalHash(validation.verificationRepairAuthority)
		) {
			issues.push('verification-repair authority hash differs from the complete authority.');
		}
	}
	const envelope = repair
		? {
				promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
				inputs,
				priorCandidateSha256,
				verificationSummarySha256,
				...(authorityPresent && authorityHashPresent
					? {
							verificationRepairAuthoritySha256: validation.verificationRepairAuthoritySha256
						}
					: {})
			}
		: {
				promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
				inputs
			};
	const inputSha256 = canonicalHash(envelope);
	if (validation?.inputSha256 !== inputSha256) {
		issues.push('authoring validation inputSha256 does not bind the exact v3 input envelope.');
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		envelope,
		inputSha256
	};
}

export function validateScienceChallengeAuthoringAttemptEvidence({
	summary,
	eventLogBytes,
	lastMessageBytes,
	promptBytes,
	requestBytes,
	thoughtsBytes,
	resultMetadataBytes,
	multipartEvidence,
	expectedPartPrompts,
	inputs,
	candidate,
	validation,
	acceptedCandidate,
	acceptedValidation,
	expectedResponseMode,
	expectedPromptBytes
}) {
	const issues = [];
	const summaryResponseMode = scienceChallengeAuthoringResponseMode(summary);
	const validThinkingLevel =
		summary?.thinkingLevel === STRUCTURED_OR_SDK_THINKING_LEVEL ||
		(summaryResponseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
			summary?.thinkingLevel === 'high');
	if (!validThinkingLevel) {
		issues.push(
			summaryResponseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
				? 'prompt-json authoring attempt thinkingLevel must be max or high.'
				: 'structured/SDK authoring attempt thinkingLevel must be max.'
		);
	}
	if (
		expectedResponseMode !== undefined &&
		expectedResponseMode !== null &&
		summaryResponseMode !== expectedResponseMode
	) {
		issues.push(
			`authoring attempt responseMode ${String(summaryResponseMode)} differs from requested ${expectedResponseMode}.`
		);
	}
	const challengeCount = Array.isArray(candidate?.challenges) ? candidate.challenges.length : null;
	let rawCandidate = null;
	try {
		rawCandidate = JSON.parse(Buffer.from(lastMessageBytes).toString('utf8'));
	} catch {
		issues.push('raw last message is not valid JSON.');
	}
	try {
		requireScienceChallengeAuthoringRunPolicy({
			summary,
			eventLogBytes,
			lastMessageBytes,
			promptBytes,
			requestBytes,
			thoughtsBytes,
			resultMetadataBytes,
			expectedResponseJsonSchema:
				(isScienceChallengeDirectSingleRunSummary(summary) ||
					isScienceChallengeDirectMultipartRunSummary(summary)) &&
				challengeCount !== null
					? challengeBatchOutputSchema(challengeCount)
					: undefined,
			expectedInputs: inputs,
			expectedInputSha256: validation?.inputSha256,
			multipartEvidence,
			expectedPartPrompts
		});
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}

	const candidateSha256 = canonicalHash(candidate);
	const validationSha256 = canonicalHash(validation);
	const acceptedCandidateSha256 = canonicalHash(acceptedCandidate);
	const acceptedValidationSha256 = canonicalHash(acceptedValidation);
	if (validation?.status !== 'passed') issues.push('attempt validation status must be passed.');
	if (candidateSha256 !== acceptedCandidateSha256) {
		issues.push('attempt candidate does not equal the accepted candidate.');
	}
	if (validationSha256 !== acceptedValidationSha256) {
		issues.push('attempt validation does not equal the accepted validation.');
	}
	if (validation?.candidateSha256 !== candidateSha256) {
		issues.push('attempt validation does not bind its normalized candidate.');
	}
	if (validation?.normalizationVersion !== SCIENCE_CHALLENGE_NORMALIZATION_VERSION) {
		issues.push('attempt validation uses an unsupported normalization version.');
	}
	if (rawCandidate !== null) {
		if (validation?.rawCandidateSha256 !== canonicalHash(rawCandidate)) {
			issues.push('attempt validation does not bind the raw model candidate.');
		}
		if (canonicalHash(normalizeGeneratedChallengeBatch(rawCandidate)) !== candidateSha256) {
			issues.push('raw model candidate does not normalize to the attempt candidate.');
		}
	}
	const eventLogSha256 = sha256(Buffer.from(eventLogBytes));
	const lastMessageSha256 = sha256(Buffer.from(lastMessageBytes));
	const promptBuffer = promptBytes === undefined ? null : Buffer.from(promptBytes);
	const promptSha256 = promptBuffer ? sha256(promptBuffer) : null;
	if (!promptBuffer || !promptBuffer.toString('utf8').trim()) {
		issues.push('attempt prompt bytes must be present and non-empty.');
	}
	if (
		expectedPromptBytes !== undefined &&
		(!promptBuffer || !promptBuffer.equals(Buffer.from(expectedPromptBytes)))
	) {
		issues.push('attempt prompt bytes differ from the deterministically reconstructed prompt.');
	}
	if (validation?.promptVersion !== SCIENCE_CHALLENGE_PROMPT_VERSION) {
		issues.push('attempt validation uses a stale or missing authoring prompt version.');
	}
	if (!/^[a-f0-9]{64}$/.test(String(validation?.promptSha256 ?? ''))) {
		issues.push('attempt validation promptSha256 must be a lowercase SHA-256 hash.');
	} else if (validation.promptSha256 !== promptSha256) {
		issues.push('attempt validation does not bind the attempt prompt bytes.');
	}
	const directTransport =
		isScienceChallengeDirectSingleRunSummary(summary) ||
		isScienceChallengeDirectMultipartRunSummary(summary);
	if (
		validation?.runSummarySha256 !== undefined &&
		validation.runSummarySha256 !== canonicalHash(summary)
	) {
		issues.push('attempt validation does not bind the persisted run summary.');
	}
	if (directTransport && validation?.runSummarySha256 !== canonicalHash(summary)) {
		issues.push('direct attempt validation must bind the persisted run summary.');
	}
	if (validation?.transport !== summary?.transport) {
		issues.push('attempt validation transport differs from the run summary.');
	}
	if (
		validation?.thinkingLevel !== undefined &&
		validation.thinkingLevel !== summary?.thinkingLevel
	) {
		issues.push('attempt validation thinkingLevel differs from the run summary.');
	}
	if (directTransport) {
		if (validation?.transportVersion !== summary?.transportVersion) {
			issues.push('direct attempt validation transportVersion differs from the run summary.');
		}
		for (const field of ['responseMode', 'providerSchemaApplied']) {
			if (validation?.[field] !== summary?.[field]) {
				issues.push(`direct attempt validation ${field} differs from the run summary.`);
			}
		}
		for (const field of ['provider', 'model', 'modelVersion']) {
			if (validation?.[field] !== summary?.[field]) {
				issues.push(`direct attempt validation ${field} differs from the run summary.`);
			}
		}
		if (
			isScienceChallengeDirectMultipartRunSummary(summary) &&
			(canonicalHash(validation?.modelVersions ?? null) !==
				canonicalHash(summary.modelVersions ?? null) ||
				validation?.directPartSize !== summary.partSize)
		) {
			issues.push('multipart attempt validation modelVersions or part size differs.');
		}
	}
	if (summary?.eventLogSha256 !== eventLogSha256) {
		issues.push('run summary does not bind the event-log bytes.');
	}
	if (
		summary?.finalResponseSha256 !== lastMessageSha256 ||
		summary?.lastMessageFileSha256 !== lastMessageSha256
	) {
		issues.push('run summary does not bind the raw last-message bytes.');
	}

	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		toolFree: issues.length === 0,
		candidateSha256,
		validationSha256,
		promptSha256
	};
}

export function findBoundToolFreeScienceChallengeAuthoringAttempt({
	shardDir,
	acceptedCandidate,
	acceptedValidation,
	resolveExpectedMultipartPartPrompts,
	resolveExpectedPromptBytes,
	responseMode
}) {
	if (
		responseMode !== undefined &&
		responseMode !== null &&
		![
			SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
			SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
		].includes(responseMode)
	) {
		return {
			status: 'failed',
			issues: [`unsupported requested authoring responseMode ${String(responseMode)}.`]
		};
	}
	if (!existsSync(shardDir)) {
		return { status: 'failed', issues: ['authoring shard directory does not exist.'] };
	}
	const issues = [];
	const attemptDirectories = readdirSync(shardDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && ATTEMPT_DIRECTORY.test(entry.name))
		.map((entry) => entry.name)
		.sort();
	for (const attemptDirectory of attemptDirectories) {
		const attemptDir = path.join(shardDir, attemptDirectory);
		const promptPath = authoringPromptPath(shardDir, attemptDirectory);
		const paths = {
			summary: path.join(attemptDir, 'run-summary.json'),
			candidate: path.join(attemptDir, 'candidate.json'),
			validation: path.join(attemptDir, 'validation.json'),
			eventLog: path.join(attemptDir, 'events.jsonl'),
			lastMessage: path.join(attemptDir, 'last-message.json'),
			prompt: promptPath
		};
		const inputPath = scienceChallengeAuthoringInputPath({
			shardDir,
			attemptDirectory
		});
		let summary = null;
		if (existsSync(paths.summary)) {
			try {
				summary = JSON.parse(readFileSync(paths.summary, 'utf8'));
			} catch {
				// The normal evidence validation below reports malformed summary JSON.
			}
		}
		if (isScienceChallengeDirectSingleRunSummary(summary)) {
			paths.request = path.join(attemptDir, 'request.json');
			paths.thoughts = path.join(attemptDir, 'thoughts.txt');
			paths.resultMetadata = path.join(attemptDir, 'result-metadata.json');
		}
		const multipart = isScienceChallengeDirectMultipartRunSummary(summary);
		const missing = Object.entries(paths)
			.filter(([, filePath]) => !existsSync(filePath))
			.map(([name]) => name);
		if (missing.length > 0) {
			issues.push(
				`${attemptDirectory}: missing required ${missing.join(', ')} authoring evidence.`
			);
			continue;
		}
		try {
			const multipartEvidence = multipart
				? readScienceChallengeDirectMultipartEvidence({ attemptDir, summary })
				: undefined;
			const inputs = existsSync(inputPath)
				? JSON.parse(readFileSync(inputPath, 'utf8'))
				: undefined;
			const validation = JSON.parse(readFileSync(paths.validation, 'utf8'));
			const expectedPartPrompts = multipart
				? resolveExpectedMultipartPartPrompts?.({
						attemptDirectory,
						attemptDir,
						summary,
						inputs,
						validation
					})
				: undefined;
			const expectedPromptBytes = resolveExpectedPromptBytes?.({
				attemptDirectory,
				attemptDir,
				summary,
				inputs,
				validation
			});
			const evidence = validateScienceChallengeAuthoringAttemptEvidence({
				summary: summary ?? JSON.parse(readFileSync(paths.summary, 'utf8')),
				eventLogBytes: readFileSync(paths.eventLog),
				lastMessageBytes: readFileSync(paths.lastMessage),
				promptBytes: readFileSync(paths.prompt),
				...(paths.request
					? {
							requestBytes: readFileSync(paths.request),
							thoughtsBytes: readFileSync(paths.thoughts),
							resultMetadataBytes: readFileSync(paths.resultMetadata)
						}
					: {}),
				multipartEvidence,
				expectedPartPrompts,
				inputs,
				candidate: JSON.parse(readFileSync(paths.candidate, 'utf8')),
				validation,
				acceptedCandidate,
				acceptedValidation,
				expectedResponseMode: responseMode,
				expectedPromptBytes
			});
			if (evidence.status === 'passed') {
				return { ...evidence, attemptDirectory };
			}
			issues.push(...evidence.issues.map((issue) => `${attemptDirectory}: ${issue}`));
		} catch (error) {
			issues.push(`${attemptDirectory}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	if (issues.length === 0) issues.push('no complete authoring attempt evidence was found.');
	return { status: 'failed', issues };
}

/**
 * Verification repairs author against an objective-local input snapshot. Ordinary attempts use
 * the shard input; repair attempts use the matching repair-scoped input when one exists.
 */
export function scienceChallengeAuthoringInputPath({
	shardDir,
	attemptDirectory = null,
	repairSha256 = null
}) {
	let repairPrefix = null;
	if (attemptDirectory !== null) {
		repairPrefix = String(attemptDirectory).match(
			/^verification-repair-([a-f0-9]{12})(?:-attempt-\d{2})?$/
		)?.[1];
	}
	if (repairPrefix === null && repairSha256 !== null) {
		const value = String(repairSha256);
		if (!/^[a-f0-9]{12}(?:[a-f0-9]{52})?$/.test(value)) {
			throw new Error('Verification-repair input lookup requires a lowercase SHA-256 or prefix.');
		}
		repairPrefix = value.slice(0, 12);
	}
	if (repairPrefix !== null) {
		const scoped = path.join(shardDir, `verification-repair-${repairPrefix}`, 'input.json');
		if (existsSync(scoped)) return scoped;
	}
	return path.join(shardDir, 'input.json');
}

function scienceChallengeAuthoringResponseMode(summary) {
	return summary?.responseMode ?? null;
}

function authoringPromptPath(shardDir, attemptDirectory) {
	const repairMatch = attemptDirectory.match(
		/^verification-repair-([a-f0-9]{12})-attempt-(\d{2})$/
	);
	if (repairMatch) {
		return path.join(
			shardDir,
			`verification-repair-${repairMatch[1]}-prompt-attempt-${Number(repairMatch[2])}.txt`
		);
	}
	const ordinaryMatch = attemptDirectory.match(/^attempt-(\d{2})$/);
	return path.join(shardDir, `prompt-attempt-${Number(ordinaryMatch[1])}.txt`);
}

function sha256String(value) {
	return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
