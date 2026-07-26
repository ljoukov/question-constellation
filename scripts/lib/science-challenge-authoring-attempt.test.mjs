import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	findBoundToolFreeScienceChallengeAuthoringAttempt,
	scienceChallengeAuthoringInputPath,
	validateScienceChallengeAuthoringAttemptEvidence,
	validateScienceChallengeAuthoringInputEvidence
} from './science-challenge-authoring-attempt.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	challengeBatchOutputSchema,
	stableStringify
} from './science-challenge-release.mjs';
import { runDirectScienceChallengePromptJsonTurn } from './science-challenge-direct-prompt-json-runner.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';
import { SCIENCE_CHALLENGE_VERIFICATION_REPAIR_AUTHORITY_SCHEMA } from './science-challenge-verification-repair-transaction.mjs';

test('resume evidence requires a byte-bound tool-free authoring attempt', () => {
	const fixture = cleanFixture();
	assert.equal(validateScienceChallengeAuthoringAttemptEvidence(fixture).status, 'passed');

	const root = mkdtempSync(path.join(tmpdir(), 'science-authoring-resume-test-'));
	try {
		writeAttempt(path.join(root, 'attempt-01'), fixture);
		assert.equal(
			findBoundToolFreeScienceChallengeAuthoringAttempt({
				shardDir: root,
				acceptedCandidate: fixture.acceptedCandidate,
				acceptedValidation: fixture.acceptedValidation,
				responseMode: null
			}).status,
			'passed'
		);

		const unsafe = cleanFixture({ command: true });
		writeAttempt(path.join(root, 'attempt-01'), unsafe);
		const result = findBoundToolFreeScienceChallengeAuthoringAttempt({
			shardDir: root,
			acceptedCandidate: unsafe.acceptedCandidate,
			acceptedValidation: unsafe.acceptedValidation
		});
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /commandActions must be 0|forbidden or out of order/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('resume evidence rejects stale candidate and validation bytes', () => {
	const fixture = cleanFixture();
	const staleCandidate = structuredClone(fixture.acceptedCandidate);
	staleCandidate.challenges = [{ definition: { id: 'stale' } }];
	assert.match(
		validateScienceChallengeAuthoringAttemptEvidence({
			...fixture,
			acceptedCandidate: staleCandidate
		}).issues.join('\n'),
		/does not equal the accepted candidate/
	);

	const staleValidation = { ...fixture.acceptedValidation, inputSha256: 'f'.repeat(64) };
	assert.match(
		validateScienceChallengeAuthoringAttemptEvidence({
			...fixture,
			acceptedValidation: staleValidation
		}).issues.join('\n'),
		/does not equal the accepted validation/
	);
});

test('resume evidence requires the exact attempt prompt and verifies persisted prompt hashes', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-authoring-prompt-test-'));
	try {
		const fixture = cleanFixture();
		const attemptDir = path.join(root, 'attempt-02');
		writeAttempt(attemptDir, fixture);
		const promptPath = path.join(root, 'prompt-attempt-2.txt');
		rmSync(promptPath);
		assert.match(
			findBoundToolFreeScienceChallengeAuthoringAttempt({
				shardDir: root,
				acceptedCandidate: fixture.acceptedCandidate,
				acceptedValidation: fixture.acceptedValidation
			}).issues.join('\n'),
			/attempt-02: missing required prompt authoring evidence/
		);

		writeAttempt(attemptDir, fixture);
		writeFileSync(promptPath, 'stale prompt bytes\n');
		assert.match(
			findBoundToolFreeScienceChallengeAuthoringAttempt({
				shardDir: root,
				acceptedCandidate: fixture.acceptedCandidate,
				acceptedValidation: fixture.acceptedValidation
			}).issues.join('\n'),
			/attempt validation does not bind the attempt prompt bytes/
		);

		const legacyFixture = cleanFixture();
		delete legacyFixture.validation.promptSha256;
		delete legacyFixture.validation.promptVersion;
		legacyFixture.acceptedValidation = legacyFixture.validation;
		writeAttempt(attemptDir, legacyFixture);
		assert.equal(
			findBoundToolFreeScienceChallengeAuthoringAttempt({
				shardDir: root,
				acceptedCandidate: legacyFixture.acceptedCandidate,
				acceptedValidation: legacyFixture.acceptedValidation
			}).status,
			'passed'
		);

		const substituted = cleanFixture();
		substituted.promptBytes = Buffer.from('substituted prompt with matching self-hashes\n');
		substituted.validation = {
			...substituted.validation,
			promptSha256: sha256(substituted.promptBytes)
		};
		substituted.acceptedValidation = substituted.validation;
		writeAttempt(attemptDir, substituted);
		assert.match(
			findBoundToolFreeScienceChallengeAuthoringAttempt({
				shardDir: root,
				acceptedCandidate: substituted.acceptedCandidate,
				acceptedValidation: substituted.acceptedValidation,
				resolveExpectedPromptBytes: () => fixture.promptBytes
			}).issues.join('\n'),
			/deterministically reconstructed prompt/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('attempt evidence rejects internally drifted candidate bindings even when accepted bytes are relabelled', () => {
	const fixture = cleanFixture();
	const driftedValidation = {
		...fixture.validation,
		candidateSha256: 'f'.repeat(64),
		rawCandidateSha256: 'e'.repeat(64)
	};
	const result = validateScienceChallengeAuthoringAttemptEvidence({
		...fixture,
		validation: driftedValidation,
		acceptedValidation: driftedValidation
	});
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /does not bind its normalized candidate/);
	assert.match(result.issues.join('\n'), /does not bind the raw model candidate/);
});

test('v3 authoring input evidence binds exact normal and verification-repair envelopes', () => {
	const inputs = [{ id: 'challenge-001', officialEvidenceSha256: 'a'.repeat(64) }];
	const normalValidation = {
		verificationRepairSha256: null,
		priorCandidateSha256: null,
		inputSha256: canonicalHash({ promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION, inputs })
	};
	assert.equal(
		validateScienceChallengeAuthoringInputEvidence({
			inputs,
			validation: normalValidation
		}).status,
		'passed'
	);

	const repairValidation = {
		verificationRepairSha256: 'b'.repeat(64),
		priorCandidateSha256: 'c'.repeat(64),
		inputSha256: canonicalHash({
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			inputs,
			priorCandidateSha256: 'c'.repeat(64),
			verificationSummarySha256: 'b'.repeat(64)
		})
	};
	assert.equal(
		validateScienceChallengeAuthoringInputEvidence({
			inputs,
			validation: repairValidation
		}).status,
		'passed'
	);
	repairValidation.inputSha256 = canonicalHash(inputs);
	assert.match(
		validateScienceChallengeAuthoringInputEvidence({
			inputs,
			validation: repairValidation
		}).issues.join('\n'),
		/does not bind the exact v3 input envelope/
	);

	const mutableChallengeIds = ['challenge-001'];
	const collectionRemediations = [
		{
			issue: 'challenge-001 duplicates a frozen peer opening.',
			preferredChallengeId: 'challenge-001'
		}
	];
	const authority = {
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_AUTHORITY_SCHEMA,
		parent: {
			disposition: 'deterministic-parent-bound-review-rebase',
			rebaseId: 'd'.repeat(64),
			manifestSha256: 'e'.repeat(64),
			verificationSha256: 'b'.repeat(64),
			planSha256: 'f'.repeat(64),
			candidateSetSha256: '1'.repeat(64),
			collectionValidationSha256: '2'.repeat(64),
			collectionRemediationSetSha256: canonicalHash(collectionRemediations),
			collectionRemediationTargetSetSha256: canonicalHash(mutableChallengeIds)
		},
		independentRejectedChallengeIds: mutableChallengeIds,
		independentRejectedChallengeSetSha256: canonicalHash(mutableChallengeIds),
		collectionRemediations,
		collectionRemediationTargetIds: mutableChallengeIds,
		collectionRemediationTargetSetSha256: canonicalHash(mutableChallengeIds),
		mutableChallengeIds,
		mutableChallengeSetSha256: canonicalHash(mutableChallengeIds)
	};
	const authoritySha256 = canonicalHash(authority);
	const typedRepairValidation = {
		verificationRepairSha256: 'b'.repeat(64),
		priorCandidateSha256: 'c'.repeat(64),
		verificationRepairAuthority: authority,
		verificationRepairAuthoritySha256: authoritySha256,
		inputSha256: canonicalHash({
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			inputs,
			priorCandidateSha256: 'c'.repeat(64),
			verificationSummarySha256: 'b'.repeat(64),
			verificationRepairAuthoritySha256: authoritySha256
		})
	};
	assert.equal(
		validateScienceChallengeAuthoringInputEvidence({
			inputs,
			validation: typedRepairValidation
		}).status,
		'passed'
	);
	const partialAuthority = structuredClone(typedRepairValidation);
	delete partialAuthority.verificationRepairAuthoritySha256;
	assert.match(
		validateScienceChallengeAuthoringInputEvidence({
			inputs,
			validation: partialAuthority
		}).issues.join('\n'),
		/must include both verification-repair authority and its hash/
	);
	assert.match(
		validateScienceChallengeAuthoringInputEvidence({
			inputs,
			validation: {
				...typedRepairValidation,
				verificationRepairAuthoritySha256: '0'.repeat(64)
			}
		}).issues.join('\n'),
		/authority hash differs/
	);
});

test('repair attempt replay prefers its immutable objective-local input snapshot', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-authoring-objective-input-'));
	const repairSha256 = 'b'.repeat(64);
	const repairDirectory = path.join(root, `verification-repair-${repairSha256.slice(0, 12)}`);
	try {
		writeFileSync(path.join(root, 'input.json'), `${stableStringify([{ id: 'predecessor' }])}\n`);
		mkdirSync(repairDirectory, { recursive: true });
		writeFileSync(
			path.join(repairDirectory, 'input.json'),
			`${stableStringify([{ id: 'successor' }])}\n`
		);
		assert.equal(
			scienceChallengeAuthoringInputPath({
				shardDir: root,
				attemptDirectory: `verification-repair-${repairSha256.slice(0, 12)}-attempt-01`
			}),
			path.join(repairDirectory, 'input.json')
		);
		assert.equal(
			scienceChallengeAuthoringInputPath({
				shardDir: root,
				repairSha256
			}),
			path.join(repairDirectory, 'input.json')
		);
		assert.equal(
			scienceChallengeAuthoringInputPath({
				shardDir: root,
				attemptDirectory: 'attempt-01'
			}),
			path.join(root, 'input.json')
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('resume requires the exact requested direct response mode', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-authoring-prompt-json-resume-'));
	const attemptDir = path.join(root, 'attempt-01');
	const prompt = 'Return an empty, release-grade science challenge batch.';
	const promptBytes = Buffer.from(`${prompt}\n`);
	const candidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: []
	};
	const rawText = JSON.stringify(candidate);
	const thoughts = 'Checked the local prompt-JSON contract.';
	const usage = {
		promptTokens: 20,
		responseTokens: 10,
		thinkingTokens: 5,
		totalTokens: 35
	};
	const modelVersion = 'chatgpt-gpt-5.6-sol-2026-07-23';
	const paths = {
		eventsPath: path.join(attemptDir, 'events.jsonl'),
		lastMessagePath: path.join(attemptDir, 'last-message.json'),
		thoughtsPath: path.join(attemptDir, 'thoughts.txt'),
		requestPath: path.join(attemptDir, 'request.json'),
		resultMetadataPath: path.join(attemptDir, 'result-metadata.json'),
		summaryPath: path.join(attemptDir, 'run-summary.json')
	};
	try {
		await runDirectScienceChallengePromptJsonTurn({
			prompt,
			outputSchema: challengeBatchOutputSchema(0),
			...paths,
			authMode: 'configured-proxy',
			thinkingLevel: 'high',
			streamTextImpl: () => ({
				events: {
					async *[Symbol.asyncIterator]() {
						yield { type: 'delta', channel: 'thought', text: thoughts };
						yield { type: 'delta', channel: 'response', text: rawText };
						yield { type: 'model', modelVersion };
						yield { type: 'usage', usage, costUsd: 0.001, modelVersion };
					}
				},
				result: Promise.resolve({
					provider: 'chatgpt',
					model: 'chatgpt-gpt-5.6-sol',
					modelVersion,
					text: rawText,
					thoughts,
					blocked: false,
					usage,
					costUsd: 0.001
				}),
				abort() {}
			})
		});
		const summary = JSON.parse(readFileSync(paths.summaryPath, 'utf8'));
		const validation = {
			status: 'passed',
			issues: [],
			inputSha256: 'a'.repeat(64),
			rawCandidateSha256: canonicalHash(candidate),
			normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
			candidateSha256: canonicalHash(candidate),
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			promptSha256: sha256(promptBytes),
			runSummarySha256: canonicalHash(summary),
			transport: summary.transport,
			transportVersion: summary.transportVersion,
			responseMode: summary.responseMode,
			providerSchemaApplied: summary.providerSchemaApplied,
			provider: summary.provider,
			model: summary.model,
			modelVersion: summary.modelVersion,
			thinkingLevel: summary.thinkingLevel
		};
		writeFileSync(path.join(root, 'prompt-attempt-1.txt'), promptBytes);
		writeFileSync(path.join(attemptDir, 'candidate.json'), `${stableStringify(candidate)}\n`);
		writeFileSync(path.join(attemptDir, 'validation.json'), `${stableStringify(validation)}\n`);

		assert.equal(
			findBoundToolFreeScienceChallengeAuthoringAttempt({
				shardDir: root,
				acceptedCandidate: candidate,
				acceptedValidation: validation,
				responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
			}).status,
			'passed'
		);
		const mismatch = findBoundToolFreeScienceChallengeAuthoringAttempt({
			shardDir: root,
			acceptedCandidate: candidate,
			acceptedValidation: validation,
			responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
		});
		assert.equal(mismatch.status, 'failed');
		assert.match(
			mismatch.issues.join('\n'),
			/responseMode prompt-json differs from requested structured-json/
		);

		for (const thinkingLevel of ['xhigh', 'medium', 'low']) {
			const mismatchedSummary = { ...summary, thinkingLevel };
			const mismatchedValidation = {
				...validation,
				thinkingLevel,
				runSummarySha256: canonicalHash(mismatchedSummary)
			};
			writeFileSync(paths.summaryPath, `${stableStringify(mismatchedSummary)}\n`);
			writeFileSync(
				path.join(attemptDir, 'validation.json'),
				`${stableStringify(mismatchedValidation)}\n`
			);
			const replay = findBoundToolFreeScienceChallengeAuthoringAttempt({
				shardDir: root,
				acceptedCandidate: candidate,
				acceptedValidation: mismatchedValidation,
				responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
			});
			assert.equal(replay.status, 'failed', thinkingLevel);
			assert.match(
				replay.issues.join('\n'),
				/prompt-json authoring attempt thinkingLevel must be max or high/,
				thinkingLevel
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('SDK and structured authoring accept only max thinking', () => {
	for (const thinkingLevel of ['high', 'xhigh', 'medium', 'low']) {
		const fixture = cleanFixture();
		fixture.summary = { ...fixture.summary, thinkingLevel };
		const result = validateScienceChallengeAuthoringAttemptEvidence(fixture);
		assert.equal(result.status, 'failed', thinkingLevel);
		assert.match(
			result.issues.join('\n'),
			/structured\/SDK authoring attempt thinkingLevel must be max/,
			thinkingLevel
		);
	}
});

function cleanFixture({ command = false } = {}) {
	const rawCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: []
	};
	const lastMessageBytes = Buffer.from(JSON.stringify(rawCandidate));
	const promptBytes = Buffer.from('Release-grade science challenge authoring prompt.\n');
	const candidate = structuredClone(rawCandidate);
	const validation = {
		status: 'passed',
		issues: [],
		inputSha256: 'a'.repeat(64),
		rawCandidateSha256: canonicalHash(rawCandidate),
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		candidateSha256: canonicalHash(candidate),
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		promptSha256: sha256(promptBytes)
	};
	const events = [
		{ type: 'thread.started', thread_id: 'thread-1' },
		{ type: 'turn.started' },
		...(command
			? [
					{
						type: 'item.completed',
						item: {
							type: 'command_execution',
							command: 'pwd',
							status: 'completed',
							exit_code: 0
						}
					}
				]
			: []),
		{
			type: 'item.completed',
			item: { type: 'agent_message', text: lastMessageBytes.toString('utf8') }
		},
		{ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }
	];
	const eventLogBytes = Buffer.from(`${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
	const summary = {
		status: 'passed',
		error: null,
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max',
		commandActions: command ? 1 : 0,
		failedCommandActions: 0,
		webSearches: 0,
		fileChanges: 0,
		events: events.length,
		agentMessages: 1,
		eventLogSha256: sha256(eventLogBytes),
		finalResponseSha256: sha256(lastMessageBytes),
		lastMessageFileSha256: sha256(lastMessageBytes)
	};
	return {
		summary,
		eventLogBytes,
		lastMessageBytes,
		promptBytes,
		candidate,
		validation,
		acceptedCandidate: candidate,
		acceptedValidation: validation
	};
}

function writeAttempt(attemptDir, fixture) {
	mkdirSync(attemptDir, { recursive: true });
	writeFileSync(path.join(attemptDir, 'run-summary.json'), `${stableStringify(fixture.summary)}\n`);
	writeFileSync(path.join(attemptDir, 'candidate.json'), `${stableStringify(fixture.candidate)}\n`);
	writeFileSync(
		path.join(attemptDir, 'validation.json'),
		`${stableStringify(fixture.validation)}\n`
	);
	writeFileSync(path.join(attemptDir, 'events.jsonl'), fixture.eventLogBytes);
	writeFileSync(path.join(attemptDir, 'last-message.json'), fixture.lastMessageBytes);
	const attemptDirectory = path.basename(attemptDir);
	const repairMatch = attemptDirectory.match(
		/^verification-repair-([a-f0-9]{12})-attempt-(\d{2})$/
	);
	const attempt = Number(repairMatch?.[2] ?? attemptDirectory.match(/^attempt-(\d{2})$/)?.[1]);
	const promptName = repairMatch
		? `verification-repair-${repairMatch[1]}-prompt-attempt-${attempt}.txt`
		: `prompt-attempt-${attempt}.txt`;
	writeFileSync(path.join(path.dirname(attemptDir), promptName), fixture.promptBytes);
}

function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}
