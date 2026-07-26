import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED,
	SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT,
	SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_BINDING_FIELDS,
	SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA,
	SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED,
	buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding,
	claimScienceChallengeReviewRebaseRecoveryInvocation,
	completeScienceChallengeReviewRebaseRecoveryInvocation,
	inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal,
	inspectScienceChallengeReviewRebaseRecoveryInvocations,
	scienceChallengeReviewRebaseRecoveryInvocationName,
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding,
	validateScienceChallengeReviewRebaseInfrastructureRecoverySuccessorArtifactPath
} from './science-challenge-review-rebase-infra-recovery.mjs';
import { runDirectScienceChallengeMultipartTurn } from './science-challenge-direct-multipart-runner.mjs';
import { runDirectScienceChallengePromptJsonTurn } from './science-challenge-direct-prompt-json-runner.mjs';
import { canonicalHash, stableStringify } from './science-challenge-release.mjs';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

test('recovery invocation names are disjoint, bounded, and have no attempt-05', () => {
	assert.equal(
		scienceChallengeReviewRebaseRecoveryInvocationName({
			logicalContentOrdinal: 1,
			infrastructureInvocationOrdinal: 1
		}),
		'recovery-content-attempt-01-invocation-01'
	);
	assert.equal(
		scienceChallengeReviewRebaseRecoveryInvocationName({
			logicalContentOrdinal: 4,
			infrastructureInvocationOrdinal: 4
		}),
		'recovery-content-attempt-04-invocation-04'
	);
	assert.throws(
		() =>
			scienceChallengeReviewRebaseRecoveryInvocationName({
				logicalContentOrdinal: 5,
				infrastructureInvocationOrdinal: 1
			}),
		/integer from 1 to 4/u
	);
	assert.throws(
		() =>
			scienceChallengeReviewRebaseRecoveryInvocationName({
				logicalContentOrdinal: 1,
				infrastructureInvocationOrdinal: 5
			}),
		/integer from 1 to 4/u
	);
});

test('effective-cohort recovery binding has exactly nine safe fields', () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-recovery-binding-'));
	try {
		const manifestPath = path.join(root, 'recovery', 'manifest.json');
		const terminal = {
			status: 'passed',
			manifestPath,
			manifestPathRelative: 'recovery/manifest.json',
			workspaceRoot: root,
			manifestSha256: HASH_A,
			recoveryId: HASH_B,
			recoveryExecutionId: HASH_C,
			failedRootInventorySha256: HASH_A,
			logicalLedgerSha256: HASH_B,
			preservedProposalSetSha256: HASH_C,
			finalProposalSetSha256: HASH_A,
			contentNamespaceId: HASH_B
		};
		const binding = buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
			evidence: terminal,
			referenceRoot: root
		});
		assert.deepEqual(
			Object.keys(binding).sort(),
			[...SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_BINDING_FIELDS].sort()
		);
		assert.equal(binding.manifestPath, 'recovery/manifest.json');
		assert.deepEqual(validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(binding), {
			status: 'passed',
			issues: []
		});
		assert.throws(
			() =>
				validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
					...binding,
					schemaVersion: 'forbidden'
				}),
			/exact nine-field shape/u
		);
		assert.throws(
			() =>
				validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
					...binding,
					manifestPath
				}),
			/reference-root-relative/u
		);
		assert.throws(
			() =>
				buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
					evidence: terminal,
					referenceRoot: path.join(root, 'outside')
				}),
			/authenticated workspace-relative/u
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('terminal aggregation rejects unauthenticated state before reading proposals', () => {
	assert.throws(
		() =>
			inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
				evidence: {
					schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA
				}
			}),
		/authenticated replay state/u
	);
});

test('immutable recovery successor rejects downstream collection and publication artifacts', () => {
	for (const relativePath of [
		'generation-summary.json',
		'verification-repair-0123456789ab-summary.json',
		'verification-repair-0123456789ab-effective-cohort/manifest.json',
		'verification-repair-0123456789ab-transaction/cohort-state.json',
		'publication/proposals/science-001/candidate.json',
		'publication/journal.json',
		'journal.json'
	]) {
		assert.throws(
			() =>
				validateScienceChallengeReviewRebaseInfrastructureRecoverySuccessorArtifactPath(
					relativePath
				),
			/forbidden downstream artifact/u,
			relativePath
		);
	}
	assert.deepEqual(
		validateScienceChallengeReviewRebaseInfrastructureRecoverySuccessorArtifactPath(
			'shards/science-001/infrastructure-recovery/recovery-content-attempt-01-invocation-01/events.jsonl'
		),
		{ status: 'passed', issues: [] }
	);
});

test('claim-only crash completion is conservative, replay-safe, and capped at four logical slots', () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-recovery-claim-'));
	try {
		const state = recoveryStateFixture(root);
		for (let logicalContentOrdinal = 1; logicalContentOrdinal <= 4; logicalContentOrdinal += 1) {
			const claim = claimScienceChallengeReviewRebaseRecoveryInvocation({
				state,
				shardId: 'science-001'
			});
			assert.equal(claim.claim.logicalContentOrdinal, logicalContentOrdinal);
			assert.equal(claim.claim.infrastructureInvocationOrdinal, 1);
			assert.equal(
				claim.directoryName,
				`recovery-content-attempt-${String(logicalContentOrdinal).padStart(2, '0')}-invocation-01`
			);
			assert.throws(
				() =>
					claimScienceChallengeReviewRebaseRecoveryInvocation({
						state,
						shardId: 'science-001'
					}),
				/incomplete recovery invocation/u
			);
			const completed = completeScienceChallengeReviewRebaseRecoveryInvocation({
				state,
				shardId: 'science-001',
				directory: claim.directory
			});
			assert.equal(
				completed.completion.classification,
				SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED
			);
			assert.equal(completed.completion.indeterminate, true);
			const replay = completeScienceChallengeReviewRebaseRecoveryInvocation({
				state,
				shardId: 'science-001',
				directory: claim.directory
			});
			assert.equal(replay.completion.completionSha256, completed.completion.completionSha256);
		}
		const inspected = inspectScienceChallengeReviewRebaseRecoveryInvocations({
			state,
			shardId: 'science-001'
		});
		assert.equal(inspected.invocations.length, 4);
		assert.equal(inspected.remainingLogicalContentAttempts, 0);
		assert.equal(inspected.nextLogicalContentOrdinal, 5);
		assert.equal(
			inspected.invocations.some((record) => record.directoryName.includes('attempt-05')),
			false
		);
		assert.throws(
			() =>
				claimScienceChallengeReviewRebaseRecoveryInvocation({
					state,
					shardId: 'science-001'
				}),
			/exhausted its four logical content attempts/u
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('claim and completion tamper fail closed on replay', () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-recovery-tamper-'));
	try {
		const state = recoveryStateFixture(root);
		const claimed = claimScienceChallengeReviewRebaseRecoveryInvocation({
			state,
			shardId: 'science-001'
		});
		completeScienceChallengeReviewRebaseRecoveryInvocation({
			state,
			shardId: 'science-001',
			directory: claimed.directory
		});
		const completionPath = path.join(claimed.directory, 'completion.json');
		const completion = JSON.parse(readFileSync(completionPath, 'utf8'));
		completion.indeterminateReason = 'tampered';
		chmodSync(completionPath, 0o644);
		writeFileSync(completionPath, `${stableStringify(completion)}\n`);
		assert.throws(
			() =>
				inspectScienceChallengeReviewRebaseRecoveryInvocations({
					state,
					shardId: 'science-001'
				}),
			/recovery invocation completion is invalid/u
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('four strict pre-model multipart invocations stay in one logical slot and exhaust only infrastructure retries', async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-recovery-premodel-'));
	try {
		const state = recoveryStateFixture(root, { withAttemptSource: true });
		for (
			let infrastructureInvocationOrdinal = 1;
			infrastructureInvocationOrdinal <= 4;
			infrastructureInvocationOrdinal += 1
		) {
			const claimed = claimScienceChallengeReviewRebaseRecoveryInvocation({
				state,
				shardId: 'science-001'
			});
			assert.equal(claimed.claim.logicalContentOrdinal, 1);
			assert.equal(claimed.claim.infrastructureInvocationOrdinal, infrastructureInvocationOrdinal);
			await writeMultipartAttempt({
				state,
				directory: claimed.directory,
				mode: 'pre-model'
			});
			const completed = completeScienceChallengeReviewRebaseRecoveryInvocation({
				state,
				shardId: 'science-001',
				directory: claimed.directory
			});
			assert.equal(
				completed.completion.classification,
				SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT
			);
		}
		const replay = inspectScienceChallengeReviewRebaseRecoveryInvocations({
			state,
			shardId: 'science-001'
		});
		assert.equal(replay.nextLogicalContentOrdinal, 1);
		assert.equal(replay.nextInfrastructureInvocationOrdinal, 5);
		assert.equal(replay.infrastructureSlotExhausted, true);
		assert.equal(replay.remainingLogicalContentAttempts, 4);
		assert.throws(
			() =>
				claimScienceChallengeReviewRebaseRecoveryInvocation({
					state,
					shardId: 'science-001'
				}),
			/exhausted four infrastructure invocations/u
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('a content-bearing multipart failure advances the logical ordinal exactly once', async () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-recovery-content-'));
	try {
		const state = recoveryStateFixture(root, { withAttemptSource: true });
		const claimed = claimScienceChallengeReviewRebaseRecoveryInvocation({
			state,
			shardId: 'science-001'
		});
		await writeMultipartAttempt({
			state,
			directory: claimed.directory,
			mode: 'content-failure'
		});
		const completed = completeScienceChallengeReviewRebaseRecoveryInvocation({
			state,
			shardId: 'science-001',
			directory: claimed.directory
		});
		assert.equal(
			completed.completion.classification,
			SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED
		);
		assert.equal(completed.completion.indeterminate, undefined);
		const replay = inspectScienceChallengeReviewRebaseRecoveryInvocations({
			state,
			shardId: 'science-001'
		});
		assert.equal(replay.nextLogicalContentOrdinal, 2);
		assert.equal(replay.nextInfrastructureInvocationOrdinal, 1);
		assert.equal(replay.remainingLogicalContentAttempts, 3);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('an open claim rejects unknown crash artifacts instead of silently consuming them', () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-recovery-open-tamper-'));
	try {
		const state = recoveryStateFixture(root, { withAttemptSource: true });
		const claimed = claimScienceChallengeReviewRebaseRecoveryInvocation({
			state,
			shardId: 'science-001'
		});
		const unexpected = path.join(claimed.directory, 'unbound-output.json');
		writeFileSync(unexpected, '{}\n');
		assert.throws(
			() =>
				inspectScienceChallengeReviewRebaseRecoveryInvocations({
					state,
					shardId: 'science-001'
				}),
			/unexpected artifact/u
		);
		unlinkSync(unexpected);
		const completed = completeScienceChallengeReviewRebaseRecoveryInvocation({
			state,
			shardId: 'science-001',
			directory: claimed.directory
		});
		assert.equal(completed.completion.indeterminate, true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

function recoveryStateFixture(root, { withAttemptSource = false } = {}) {
	const successorRoot = path.join(root, 'successor');
	const authority = {
		schemaVersion: 'science-challenge-recovery-test-authority/v1',
		shardIds: ['science-001']
	};
	const authoritySha256 = canonicalHash(authority);
	const baselineCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: []
	};
	const originalExecutionIdentity = {
		objectiveId: HASH_A,
		executionId: HASH_B,
		transport: 'llm-direct',
		responseMode: 'prompt-json',
		model: 'chatgpt-gpt-5.6-sol',
		thinkingLevel: 'high',
		directPartSize: 1
	};
	const manifest = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA,
		originalExecutionIdentity
	};
	const shard = {
		shardId: 'science-001',
		status: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED,
		mutable: true,
		baseline: {},
		sourceAttempts: [],
		consumedLogicalContentAttempts: 0,
		remainingLogicalContentAttempts: 4,
		nextLogicalContentOrdinal: 1,
		proposal: null
	};
	const state = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA,
		recoveryExecutionId: HASH_C,
		manifest,
		manifestSha256: canonicalHash(manifest),
		successorRoot,
		successorRootPath: 'successor',
		shards: new Map([[shard.shardId, shard]])
	};
	if (withAttemptSource) {
		state.source = {
			workspaceRoot: root,
			identity: originalExecutionIdentity,
			verificationSha256: HASH_A,
			authority,
			authoritySha256,
			baselineByShard: new Map([
				[
					shard.shardId,
					{
						candidate: baselineCandidate
					}
				]
			]),
			reviewRebase: {
				plan: {
					rows: [
						{ id: 'science-001-a', shard: 'science-001' },
						{ id: 'science-001-b', shard: 'science-001' }
					]
				}
			}
		};
	}
	return state;
}

async function writeMultipartAttempt({ state, directory, mode }) {
	const parts = [
		{
			partId: 'part-01',
			index: 1,
			rowIds: ['science-001-a'],
			prompt: 'Repair the first deterministic recovery fixture row.'
		},
		{
			partId: 'part-02',
			index: 2,
			rowIds: ['science-001-b'],
			prompt: 'Repair the second deterministic recovery fixture row.'
		}
	];
	await assert.rejects(
		() =>
			runDirectScienceChallengeMultipartTurn({
				parts,
				partSize: 1,
				attemptDir: directory,
				orchestrationPrompt: 'Deterministic recovery multipart fixture.',
				inputSha256: canonicalHash({ fixture: 'infrastructure-recovery', mode }),
				responseMode: 'prompt-json',
				thinkingLevel: 'high',
				runPartImpl: (args) =>
					runDirectScienceChallengePromptJsonTurn({
						...args,
						streamTextImpl:
							mode === 'pre-model'
								? () => {
										throw new TypeError('fetch failed');
									}
								: () => ({
										events: {
											async *[Symbol.asyncIterator]() {
												yield {
													type: 'delta',
													channel: 'thought',
													text: 'Model work began before the synthetic failure.'
												};
											}
										},
										result: Promise.reject(new Error('synthetic content-bearing failure')),
										abort() {}
									})
					})
			}),
		mode === 'pre-model' ? /fetch failed/u : /synthetic content-bearing failure/u
	);
	const summary = JSON.parse(readFileSync(path.join(directory, 'run-summary.json'), 'utf8'));
	const baseline = state.source.baselineByShard.get('science-001').candidate;
	const validation = {
		status: 'failed',
		issues: [summary.error],
		verificationRepairSha256: state.source.verificationSha256,
		verificationRepairAuthoritySha256: state.source.authoritySha256,
		verificationRepairAuthority: state.source.authority,
		priorCandidateSha256: canonicalHash(baseline),
		runSummarySha256: canonicalHash(summary),
		transport: summary.transport,
		transportVersion: summary.transportVersion,
		responseMode: summary.responseMode,
		directPartSize: summary.partSize,
		model: summary.model,
		modelVersion: summary.modelVersion,
		thinkingLevel: summary.thinkingLevel,
		rawCandidateSha256: null,
		candidateSha256: null
	};
	writeFileSync(path.join(directory, 'validation.json'), `${stableStringify(validation)}\n`);
}
