import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runBoundedScienceChallengeAuthoringAttempts } from './science-challenge-authoring-retry.mjs';

test('retries a first transport failure but records it as unacceptably failed', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-authoring-transport-retry-'));
	const attempts = [];
	try {
		const result = await runBoundedScienceChallengeAuthoringAttempts({
			maxAttempts: 2,
			initialPrompt: 'initial prompt',
			executeAttempt: async ({ attempt, prompt }) => {
				attempts.push({ attempt, prompt });
				const attemptDir = path.join(root, `attempt-${attempt}`);
				mkdirSync(attemptDir, { recursive: true });
				if (attempt === 1) {
					writeFileSync(
						path.join(attemptDir, 'run-summary.json'),
						'{"status":"failed","error":"transport was killed"}\n'
					);
					throw new Error('transport was killed');
				}
				return { finalResponse: '{"candidate":"safe"}' };
			},
			evaluateAttempt: async ({ attempt, run, transportIssue }) => ({
				// Deliberately claim "passed" on the thrown attempt. The bounded runner must
				// still fail it before recordAttempt can persist acceptance evidence.
				status: 'passed',
				issues: [],
				candidate: run ? JSON.parse(run.finalResponse) : null,
				persistedRunSummary:
					attempt === 1
						? JSON.parse(readFileSync(path.join(root, 'attempt-1', 'run-summary.json'), 'utf8'))
						: null,
				observedTransportIssue: transportIssue
			}),
			recordAttempt: async (outcome) => {
				const attemptDir = path.join(root, `attempt-${outcome.attempt}`);
				writeFileSync(
					path.join(attemptDir, 'validation.json'),
					`${JSON.stringify({
						status: outcome.status,
						issues: outcome.issues,
						candidate: outcome.candidate,
						persistedRunSummary: outcome.persistedRunSummary
					})}\n`
				);
			},
			buildRetryPrompt: ({ issues }) => `retry after: ${issues.join('; ')}`,
			recordRetryPrompt: async ({ attempt, prompt }) => {
				writeFileSync(path.join(root, `prompt-attempt-${attempt}.txt`), `${prompt}\n`);
			}
		});

		assert.equal(result.status, 'passed');
		assert.equal(result.attempt, 2);
		assert.deepEqual(
			attempts.map(({ attempt }) => attempt),
			[1, 2]
		);
		assert.match(attempts[1].prompt, /Authoring transport failed: transport was killed/);

		const failedValidation = JSON.parse(
			readFileSync(path.join(root, 'attempt-1', 'validation.json'), 'utf8')
		);
		assert.equal(failedValidation.status, 'failed');
		assert.equal(failedValidation.candidate, null);
		assert.deepEqual(failedValidation.persistedRunSummary, {
			status: 'failed',
			error: 'transport was killed'
		});
		assert.match(failedValidation.issues.join('\n'), /Authoring transport failed/);
		assert.equal(
			readFileSync(path.join(root, 'attempt-1', 'run-summary.json'), 'utf8'),
			'{"status":"failed","error":"transport was killed"}\n'
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('transport retries remain bounded by maxAttempts', async () => {
	let calls = 0;
	const result = await runBoundedScienceChallengeAuthoringAttempts({
		maxAttempts: 3,
		initialPrompt: 'initial prompt',
		executeAttempt: async () => {
			calls += 1;
			throw new Error('hung transport killed');
		},
		evaluateAttempt: async () => ({ status: 'passed', issues: [] }),
		buildRetryPrompt: () => 'retry prompt'
	});
	assert.equal(calls, 3);
	assert.equal(result.status, 'failed');
	assert.equal(result.attempt, 3);
	assert.match(result.issues.join('\n'), /hung transport killed/);
});

test('an explicit resume starts at the next immutable attempt and keeps the global ceiling', async () => {
	const attempts = [];
	const result = await runBoundedScienceChallengeAuthoringAttempts({
		maxAttempts: 4,
		startAttempt: 3,
		initialPrompt: 'resume prompt',
		executeAttempt: async ({ attempt, prompt }) => {
			attempts.push({ attempt, prompt });
			if (attempt === 3) throw new Error('third attempt failed');
			return { finalResponse: '{"candidate":"safe"}' };
		},
		evaluateAttempt: async ({ run }) => ({
			status: run ? 'passed' : 'failed',
			issues: [],
			candidate: run ? JSON.parse(run.finalResponse) : null
		}),
		buildRetryPrompt: ({ issues }) => `fourth attempt after ${issues.join('; ')}`
	});
	assert.equal(result.status, 'passed');
	assert.equal(result.attempt, 4);
	assert.deepEqual(
		attempts.map((row) => row.attempt),
		[3, 4]
	);
	assert.equal(attempts[0].prompt, 'resume prompt');
	assert.match(attempts[1].prompt, /third attempt failed/);
});
