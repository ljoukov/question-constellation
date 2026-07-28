import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	buildScienceChallengeAuthoringParts,
	readScienceChallengeDirectMultipartEvidence
} from './science-challenge-authoring-parts.mjs';
import { validateScienceChallengeDirectMultipartRunPolicy } from './science-challenge-authoring-run-policy.mjs';
import { runDirectScienceChallengeJsonTurn } from './science-challenge-direct-json-runner.mjs';
import { runDirectScienceChallengeMultipartTurn } from './science-challenge-direct-multipart-runner.mjs';
import { canonicalHash, challengeBatchOutputSchema } from './science-challenge-release.mjs';
import { providerScienceChallengeFixture } from './science-challenge-test-fixtures.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';

test('multipart runner writes a compact one-object-per-line root event index', async () => {
	const fixture = await createMultipartFixture();
	try {
		const text = readFileSync(path.join(fixture.attemptDir, 'events.jsonl'), 'utf8');
		const physicalLines = text.trimEnd().split('\n');
		const events = physicalLines.map((line) => JSON.parse(line));

		assert.equal(physicalLines.length, 3);
		assert.ok(
			physicalLines.every(
				(line) => line.startsWith('{') && line.endsWith('}') && !line.includes('\n')
			)
		);
		assert.deepEqual(
			events.map((event) => event.type),
			['part.finished', 'part.finished', 'multipart.completed']
		);
		assert.deepEqual(
			events.slice(0, 2).map((event) => event.partId),
			['part-01', 'part-02']
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('multipart runner preserves a pre-existing recovery claim beside its evidence', async () => {
	const fixture = multipartFixtureDefinition();
	const claim = {
		schemaVersion: 'science-challenge-review-rebase-recovery-invocation-claim/v1',
		shardId: 'science-008',
		logicalContentOrdinal: 4,
		infrastructureInvocationOrdinal: 1
	};
	const claimBytes = `${JSON.stringify(claim)}\n`;
	try {
		mkdirSync(fixture.attemptDir, { recursive: true });
		writeFileSync(path.join(fixture.attemptDir, 'claim.json'), claimBytes, {
			flag: 'wx'
		});
		const run = await runFixture(fixture);
		assert.equal(run.status, 'passed');
		assert.equal(readFileSync(path.join(fixture.attemptDir, 'claim.json'), 'utf8'), claimBytes);
		assert.equal(
			JSON.parse(readFileSync(path.join(fixture.attemptDir, 'run-summary.json'), 'utf8')).status,
			'passed'
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('a second-part failure persists the failed composite and no merged output', async () => {
	const fixture = multipartFixtureDefinition();
	try {
		await assert.rejects(
			() =>
				runFixture({
					...fixture,
					failPartIndex: 1
				}),
			/synthetic part failure/
		);

		const summary = JSON.parse(
			readFileSync(path.join(fixture.attemptDir, 'run-summary.json'), 'utf8')
		);
		const rootEvents = readFileSync(path.join(fixture.attemptDir, 'events.jsonl'), 'utf8')
			.trimEnd()
			.split('\n')
			.map((line) => JSON.parse(line));
		assert.equal(summary.status, 'failed');
		assert.match(summary.error, /synthetic part failure/);
		assert.equal(summary.expectedPartCount, 2);
		assert.equal(summary.attemptedPartCount, 2);
		assert.equal(summary.completedPartCount, 1);
		assert.equal(summary.parts[0].status, 'passed');
		assert.equal(summary.parts[1].status, 'failed');
		assert.equal(summary.mergedCandidateSha256, null);
		assert.equal(readFileSync(path.join(fixture.attemptDir, 'last-message.json'), 'utf8'), '');
		assert.deepEqual(
			rootEvents.map((event) => event.type),
			['part.finished', 'part.finished']
		);
		assert.equal(
			rootEvents.some((event) => event.type === 'multipart.completed'),
			false
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('multipart policy rejects a fully rehashed substituted part prompt', async () => {
	const fixture = multipartFixtureDefinition();
	const canonicalPrompts = fixture.parts.map(
		(part) => `Canonical prompt for ${part.partId}: ${part.rowIds.join(', ')}.`
	);
	const substitutedPrompts = [...canonicalPrompts];
	substitutedPrompts[1] = 'Substituted prompt with a completely re-authored instruction envelope.';
	try {
		const run = await runFixture({
			...fixture,
			partPrompts: substitutedPrompts
		});
		const summary = JSON.parse(
			readFileSync(path.join(fixture.attemptDir, 'run-summary.json'), 'utf8')
		);
		const multipartEvidence = readScienceChallengeDirectMultipartEvidence({
			attemptDir: fixture.attemptDir,
			summary
		});
		const commonPolicyInput = {
			summary,
			eventLogBytes: readFileSync(path.join(fixture.attemptDir, 'events.jsonl')),
			lastMessageBytes: readFileSync(path.join(fixture.attemptDir, 'last-message.json')),
			promptBytes: Buffer.from(`${fixture.orchestrationPrompt}\n`),
			multipartEvidence,
			expectedResponseJsonSchema: challengeBatchOutputSchema(fixture.inputs.length),
			expectedInputs: fixture.inputs,
			expectedInputSha256: fixture.inputSha256
		};

		const internallyConsistent = validateScienceChallengeDirectMultipartRunPolicy({
			...commonPolicyInput,
			expectedPartPrompts: substitutedPrompts
		});
		assert.equal(internallyConsistent.status, 'passed', internallyConsistent.issues.join('\n'));
		assert.equal(run.status, 'passed');

		const canonicalReplay = validateScienceChallengeDirectMultipartRunPolicy({
			...commonPolicyInput,
			expectedPartPrompts: canonicalPrompts
		});
		assert.equal(canonicalReplay.status, 'failed');
		assert.match(
			canonicalReplay.issues.join('\n'),
			/multipart part-02 prompt differs from the canonical part inputs, repair evidence or retry state/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('multipart high thinking is accepted only for prompt-json before any part call', async () => {
	for (const [responseMode, thinkingLevel] of [
		[SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON, 'high'],
		[SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON, 'xhigh'],
		[SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON, 'medium'],
		[SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON, 'low']
	]) {
		const fixture = multipartFixtureDefinition();
		let calls = 0;
		try {
			await assert.rejects(
				() =>
					runDirectScienceChallengeMultipartTurn({
						...fixture,
						parts: fixture.parts.map((part) => ({ ...part, prompt: `Prompt ${part.partId}` })),
						responseMode,
						thinkingLevel,
						runPartImpl: async () => {
							calls += 1;
						}
					}),
				/only prompt-json may explicitly use high/
			);
			assert.equal(calls, 0);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

async function createMultipartFixture(options = {}) {
	const fixture = multipartFixtureDefinition();
	try {
		const run = await runFixture({ ...fixture, ...options });
		return { ...fixture, run };
	} catch (error) {
		rmSync(fixture.root, { recursive: true, force: true });
		throw error;
	}
}

function multipartFixtureDefinition() {
	const root = mkdtempSync(path.join(tmpdir(), 'science-direct-multipart-'));
	const attemptDir = path.join(root, 'attempt-01');
	const rows = Array.from({ length: 4 }, (_, index) => ({
		id: `challenge-${String(index + 1).padStart(2, '0')}`
	}));
	const inputs = rows.map((row, index) => ({
		plan: {
			...row,
			expectedAnswerPositions: {
				strongerAnswer: index % 2 === 0 ? 'a' : 'b',
				diagnosisCorrectIndex: index % 3,
				repairCorrectIndex: (index + 1) % 3,
				transferCorrectIndex: (index + 2) % 3
			}
		},
		officialEvidenceSha256: String(index + 1).padStart(64, '0')
	}));
	const parts = buildScienceChallengeAuthoringParts({ rows, inputs, partSize: 2 });
	const orchestrationPrompt = 'Canonical multipart orchestration prompt.';
	const inputSha256 = canonicalHash({
		mode: 'test-fixture',
		inputs
	});
	return {
		root,
		attemptDir,
		rows,
		inputs,
		parts,
		partSize: 2,
		orchestrationPrompt,
		inputSha256
	};
}

async function runFixture({
	parts,
	partSize,
	attemptDir,
	orchestrationPrompt,
	inputSha256,
	partPrompts = parts.map(
		(part) => `Canonical prompt for ${part.partId}: ${part.rowIds.join(', ')}.`
	),
	failPartIndex = -1
}) {
	const promptedParts = parts.map((part, index) => ({
		...part,
		prompt: partPrompts[index]
	}));
	let partIndex = 0;
	return runDirectScienceChallengeMultipartTurn({
		parts: promptedParts,
		partSize,
		attemptDir,
		orchestrationPrompt,
		inputSha256,
		runPartImpl: async (args) => {
			const currentPartIndex = partIndex;
			partIndex += 1;
			const batch = {
				schemaVersion: 'science-challenge-batch/v1',
				challenges: promptedParts[currentPartIndex].rowIds.map((id, index) =>
					providerScienceChallengeFixture(
						id,
						promptedParts[currentPartIndex].start + index
					)
				)
			};
			return runDirectScienceChallengeJsonTurn({
				...args,
				streamJsonImpl:
					currentPartIndex === failPartIndex
						? failedDirectStream
						: successfulDirectStream(batch, currentPartIndex)
			});
		}
	});
}

function successfulDirectStream(batch, partIndex) {
	const rawText = JSON.stringify(batch);
	const thoughts = `Checked deterministic evidence for part ${partIndex + 1}.`;
	const modelVersion = `chatgpt-gpt-5.6-sol-test-part-${partIndex + 1}`;
	const usage = {
		promptTokens: 10 + partIndex,
		responseTokens: 5,
		thinkingTokens: 3,
		totalTokens: 18 + partIndex
	};
	const events = [
		{ type: 'delta', channel: 'thought', text: thoughts },
		{ type: 'delta', channel: 'response', text: rawText },
		{ type: 'model', modelVersion },
		{ type: 'usage', usage, costUsd: 0.001 + partIndex * 0.001, modelVersion },
		{ type: 'json', stage: 'final', value: batch }
	];
	return () => ({
		events: {
			async *[Symbol.asyncIterator]() {
				for (const event of events) yield event;
			}
		},
		result: Promise.resolve({
			value: batch,
			rawText,
			result: {
				provider: 'chatgpt',
				model: 'chatgpt-gpt-5.6-sol',
				modelVersion,
				text: rawText,
				thoughts,
				blocked: false,
				usage,
				costUsd: 0.001 + partIndex * 0.001
			}
		}),
		abort() {}
	});
}

function failedDirectStream() {
	return {
		events: {
			async *[Symbol.asyncIterator]() {
				yield {
					type: 'delta',
					channel: 'thought',
					text: 'Partial evidence before the synthetic failure.'
				};
			}
		},
		result: Promise.reject(new Error('synthetic part failure')),
		abort() {}
	};
}
