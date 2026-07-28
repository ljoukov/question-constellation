import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { findBoundToolFreeScienceChallengeAuthoringAttempt } from './science-challenge-authoring-attempt.mjs';
import { buildScienceChallengeAuthoringParts } from './science-challenge-authoring-parts.mjs';
import { runDirectScienceChallengeJsonTurn } from './science-challenge-direct-json-runner.mjs';
import { runDirectScienceChallengeMultipartTurn } from './science-challenge-direct-multipart-runner.mjs';
import {
	buildScienceChallengeMultipartAttemptParts,
	buildScienceChallengeVerificationRepairPrompt,
	reconstructScienceChallengeAuthoringAttemptPrompt,
	reconstructScienceChallengeMultipartAttemptParts
} from './science-challenge-authoring-prompts.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	normalizeGeneratedChallengeBatch,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';
import { providerScienceChallengeFixture } from './science-challenge-test-fixtures.mjs';
import { buildScienceChallengeVerificationRepairAuthority } from './science-challenge-verification-repair-transaction.mjs';

test('resume accepts exact multipart evidence and rejects a missing part file', async () => {
	const fixture = await multipartResumeFixture();
	try {
		assert.equal(resume(fixture).status, 'passed', resume(fixture).issues?.join('\n'));
		rmSync(path.join(fixture.attemptDir, 'parts', 'part-02', 'thoughts.txt'));
		const replay = resume(fixture);
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /missing multipart evidence: thoughts/);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('resume rejects reordered or cross-part-substituted evidence even after root hashes are updated', async () => {
	const reordered = await multipartResumeFixture();
	try {
		const summaryPath = path.join(reordered.attemptDir, 'run-summary.json');
		const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
		summary.parts.reverse();
		summary.partsSha256 = canonicalHash(summary.parts);
		writeFileSync(summaryPath, `${stableStringify(summary)}\n`);
		reordered.validation.runSummarySha256 = canonicalHash(summary);
		reordered.acceptedValidation = reordered.validation;
		writeFileSync(
			path.join(reordered.attemptDir, 'validation.json'),
			`${stableStringify(reordered.validation)}\n`
		);
		const replay = resume(reordered);
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /part-01|ordered|substituted/);
	} finally {
		rmSync(reordered.root, { recursive: true, force: true });
	}

	const substituted = await multipartResumeFixture();
	try {
		const first = path.join(substituted.attemptDir, 'parts', 'part-01', 'last-message.json');
		const second = path.join(substituted.attemptDir, 'parts', 'part-02', 'last-message.json');
		const firstBytes = readFileSync(first);
		writeFileSync(first, readFileSync(second));
		writeFileSync(second, firstBytes);
		const replay = resume(substituted);
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /does not bind its evidence bytes|expected .* found/);
	} finally {
		rmSync(substituted.root, { recursive: true, force: true });
	}
});

test('repair replay includes collection-level invalidation issues in root and multipart prompts', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-multipart-cohort-replay-'));
	const repairRunId = 'a'.repeat(12);
	const attemptDirectory = `verification-repair-${repairRunId}-attempt-02`;
	const rows = [{ id: 'challenge-1' }, { id: 'challenge-2' }];
	const inputs = rows.map((row) => ({ plan: { id: row.id } }));
	const priorCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: rows.map((row) => ({ definition: { id: row.id } }))
	};
	const previousCandidate = structuredClone(priorCandidate);
	const collectionIssue = 'challenge-2:transfer still duplicates a peer transfer.';
	try {
		const repairRoot = path.join(root, `verification-repair-${repairRunId}`);
		const previousRoot = path.join(root, `verification-repair-${repairRunId}-attempt-01`);
		const currentRoot = path.join(root, attemptDirectory);
		mkdirSync(repairRoot, { recursive: true });
		mkdirSync(previousRoot, { recursive: true });
		mkdirSync(currentRoot, { recursive: true });
		writeJson(path.join(repairRoot, 'verification-summary.json'), {
			reviews: rows.map((row) => ({
				id: row.id,
				accepted: false,
				issues: [{ field: 'definition', category: 'quality', evidence: 'x', repair: 'y' }]
			}))
		});
		writeJson(path.join(repairRoot, 'prior-candidate.json'), priorCandidate);
		writeJson(path.join(previousRoot, 'candidate.json'), previousCandidate);
		writeJson(path.join(previousRoot, 'validation.json'), {
			issues: ['previous deterministic issue']
		});
		writeJson(path.join(currentRoot, 'validation.json'), {
			verificationRepairCohortIssues: [collectionIssue]
		});

		const rootPrompt = reconstructScienceChallengeAuthoringAttemptPrompt({
			shardDir: root,
			attemptDirectory,
			rows,
			inputs,
			existingChallengeDefinitions: []
		});
		assert.match(rootPrompt, new RegExp(collectionIssue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

		const partPrompts = reconstructScienceChallengeMultipartAttemptParts({
			shardDir: root,
			attemptDirectory,
			rows,
			inputs,
			partSize: 1,
			existingChallengeDefinitions: [],
			allPlanIds: rows.map((row) => row.id)
		}).map((part) => part.prompt);
		assert.ok(partPrompts.some((prompt) => prompt.includes(collectionIssue)));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('typed repair prompts keep independent defects separate from cohort remediation and replay byte-exact', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-typed-repair-prompt-replay-'));
	const repairRunId = 'b'.repeat(12);
	const attemptDirectory = `verification-repair-${repairRunId}-attempt-01`;
	const rows = [
		{ id: 'accepted-frozen' },
		{ id: 'independent-rejected' },
		{ id: 'collection-preferred' }
	];
	const inputs = rows.map((row) => ({ plan: { id: row.id } }));
	const priorCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: rows.map((row) => ({ definition: { id: row.id, title: row.id } }))
	};
	const reviews = [
		{ id: 'accepted-frozen', accepted: true, issues: [] },
		{
			id: 'independent-rejected',
			accepted: false,
			definitionCorrect: false,
			issues: [
				{
					field: 'definition.previewQuestion',
					problem: 'The task is ambiguous.',
					repair: 'Make the task independently solvable.'
				}
			]
		},
		{ id: 'collection-preferred', accepted: true, issues: [] }
	];
	const collectionRemediations = [
		{
			issue: 'collection-preferred:opening is too similar to accepted-frozen:transfer.',
			preferredChallengeId: 'collection-preferred'
		}
	];
	const targetIds = ['collection-preferred'];
	const verificationSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planSha256: '1'.repeat(64),
		candidateSetSha256: '2'.repeat(64),
		status: 'failed',
		reviewCount: reviews.length,
		acceptedCount: 2,
		rejectedCount: 1,
		reviews,
		reviewRebaseManifestSha256: '3'.repeat(64),
		reviewRebaseId: '4'.repeat(64),
		reviewRebaseCandidateSetSha256: '2'.repeat(64),
		reviewRebaseCollectionValidationSha256: '5'.repeat(64),
		reviewRebaseCollectionRemediationSetSha256: canonicalHash(collectionRemediations),
		reviewRebaseCollectionRemediations: collectionRemediations,
		reviewRebaseCollectionRemediationTargetIds: targetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
	};
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary,
		allowManifestlessReplay: true
	});
	try {
		const repairRoot = path.join(root, `verification-repair-${repairRunId}`);
		mkdirSync(repairRoot, { recursive: true });
		writeJson(path.join(repairRoot, 'verification-summary.json'), verificationSummary);
		writeJson(path.join(repairRoot, 'prior-candidate.json'), priorCandidate);

		const directPrompt = buildScienceChallengeVerificationRepairPrompt({
			inputs,
			priorCandidate,
			rows,
			verificationReviews: reviews,
			existingChallengeDefinitions: [],
			verificationRepairAuthority: authority
		});
		assert.match(directPrompt, /INDEPENDENT REVIEW DEFECTS/);
		assert.match(directPrompt, /DETERMINISTIC COHORT REMEDIATIONS/);
		assert.match(directPrompt, /FROZEN MUTABLE CHALLENGE IDS/);
		const mutableSection = directPrompt
			.split('FROZEN MUTABLE CHALLENGE IDS\n')[1]
			.split('\n\nPRIOR BATCH')[0];
		assert.deepEqual(JSON.parse(mutableSection), ['collection-preferred', 'independent-rejected']);
		assert.equal(mutableSection.includes('accepted-frozen'), false);
		const frozenOnlyPrompt = buildScienceChallengeVerificationRepairPrompt({
			inputs: inputs.slice(0, 1),
			priorCandidate: {
				schemaVersion: priorCandidate.schemaVersion,
				challenges: priorCandidate.challenges.slice(0, 1)
			},
			rows: rows.slice(0, 1),
			verificationReviews: reviews,
			existingChallengeDefinitions: [],
			verificationRepairAuthority: authority
		});
		assert.match(
			frozenOnlyPrompt,
			/If the local frozen\s+list is empty, return the exact prior rows unchanged/u
		);
		assert.deepEqual(
			JSON.parse(
				frozenOnlyPrompt.split('FROZEN MUTABLE CHALLENGE IDS\n')[1].split('\n\nPRIOR BATCH')[0]
			),
			[]
		);
		assert.equal(
			reconstructScienceChallengeAuthoringAttemptPrompt({
				shardDir: root,
				attemptDirectory,
				rows,
				inputs,
				existingChallengeDefinitions: []
			}),
			directPrompt
		);

		const parts = buildScienceChallengeAuthoringParts({ rows, inputs, partSize: 2 });
		const directParts = buildScienceChallengeMultipartAttemptParts({
			parts,
			allRowIds: rows.map((row) => row.id),
			existingChallengeDefinitions: [],
			verificationRepair: true,
			verificationReviews: reviews,
			verificationRepairAuthority: authority,
			priorCandidate,
			attempt: 1,
			allPlanIds: rows.map((row) => row.id)
		});
		const replayedParts = reconstructScienceChallengeMultipartAttemptParts({
			shardDir: root,
			attemptDirectory,
			rows,
			inputs,
			partSize: 2,
			existingChallengeDefinitions: [],
			allPlanIds: rows.map((row) => row.id)
		});
		assert.deepEqual(
			replayedParts.map((part) => part.prompt),
			directParts.map((part) => part.prompt)
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

async function multipartResumeFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'science-multipart-resume-'));
	const attemptDir = path.join(root, 'attempt-01');
	const rows = Array.from({ length: 4 }, (_, index) => ({ id: `challenge-${index + 1}` }));
	const inputs = rows.map((row, index) => ({
		plan: {
			id: row.id,
			expectedAnswerPositions: {
				strongerAnswer: index % 2 ? 'b' : 'a',
				diagnosisCorrectIndex: index % 3,
				repairCorrectIndex: (index + 1) % 3,
				transferCorrectIndex: (index + 2) % 3
			}
		}
	}));
	const canonicalParts = buildScienceChallengeAuthoringParts({ rows, inputs, partSize: 2 });
	const partPrompts = canonicalParts.map(
		(part) => `Canonical prompt for ${part.partId}: ${part.rowIds.join(', ')}`
	);
	const parts = canonicalParts.map((part, index) => ({ ...part, prompt: partPrompts[index] }));
	const partCandidates = canonicalParts.map((part) => ({
		schemaVersion: 'science-challenge-batch/v1',
		challenges: part.rowIds.map((id, index) =>
			providerScienceChallengeFixture(id, part.start + index)
		)
	}));
	let callIndex = 0;
	const runPartImpl = (options) => {
		const candidate = partCandidates[callIndex];
		callIndex += 1;
		return runDirectScienceChallengeJsonTurn({
			...options,
			streamJsonImpl: fakeStream(candidate)
		});
	};
	const orchestrationPrompt = 'Canonical full-shard orchestration prompt.';
	const inputSha256 = 'a'.repeat(64);
	const run = await runDirectScienceChallengeMultipartTurn({
		parts,
		partSize: 2,
		attemptDir,
		orchestrationPrompt,
		inputSha256,
		authMode: 'configured-proxy',
		runPartImpl
	});
	const summary = JSON.parse(readFileSync(path.join(attemptDir, 'run-summary.json'), 'utf8'));
	const rawCandidate = JSON.parse(readFileSync(path.join(attemptDir, 'last-message.json'), 'utf8'));
	const candidate = normalizeGeneratedChallengeBatch(rawCandidate);
	const promptBytes = Buffer.from(`${orchestrationPrompt}\n`);
	const validation = {
		status: 'passed',
		issues: [],
		inputSha256,
		verificationRepairSha256: null,
		priorCandidateSha256: null,
		rawCandidateSha256: canonicalHash(rawCandidate),
		candidateSha256: canonicalHash(candidate),
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
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
		modelVersions: summary.modelVersions,
		directPartSize: summary.partSize,
		thinkingLevel: summary.thinkingLevel
	};
	writeFileSync(path.join(root, 'input.json'), `${stableStringify(inputs)}\n`);
	writeFileSync(path.join(root, 'prompt-attempt-1.txt'), promptBytes);
	writeFileSync(path.join(attemptDir, 'candidate.json'), `${stableStringify(candidate)}\n`);
	writeFileSync(path.join(attemptDir, 'validation.json'), `${stableStringify(validation)}\n`);
	return {
		root,
		attemptDir,
		inputs,
		partPrompts,
		candidate,
		acceptedCandidate: candidate,
		validation,
		acceptedValidation: validation,
		run
	};
}

function resume(fixture) {
	return findBoundToolFreeScienceChallengeAuthoringAttempt({
		shardDir: fixture.root,
		acceptedCandidate: fixture.acceptedCandidate,
		acceptedValidation: fixture.acceptedValidation,
		resolveExpectedMultipartPartPrompts: () => fixture.partPrompts
	});
}

function fakeStream(candidate) {
	const rawText = JSON.stringify(candidate);
	const thoughts = 'Checked the canonical part evidence.';
	const usage = {
		promptTokens: 20,
		responseTokens: 10,
		thinkingTokens: 5,
		totalTokens: 35
	};
	const modelVersion = 'chatgpt-gpt-5.6-sol-2026-07-23';
	const events = [
		{ type: 'delta', channel: 'thought', text: thoughts },
		{ type: 'delta', channel: 'response', text: rawText },
		{ type: 'model', modelVersion },
		{ type: 'usage', usage, costUsd: 0.001, modelVersion },
		{ type: 'json', stage: 'final', value: candidate }
	];
	return () => ({
		events: {
			async *[Symbol.asyncIterator]() {
				for (const event of events) yield event;
			}
		},
		result: Promise.resolve({
			value: candidate,
			rawText,
			result: {
				provider: 'chatgpt',
				model: 'chatgpt-gpt-5.6-sol',
				modelVersion,
				thoughts,
				blocked: false,
				usage,
				costUsd: 0.001
			}
		}),
		abort() {}
	});
}

function writeJson(filePath, value) {
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}
