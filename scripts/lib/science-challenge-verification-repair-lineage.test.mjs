import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN
} from './science-challenge-direct-preflight.mjs';
import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';
import { buildScienceChallengeVerificationRepairAuthority } from './science-challenge-verification-repair-transaction.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA,
	bindVerificationRepairExecutionMarker,
	bindVerificationRepairExecutionRecovery,
	buildVerificationRepairExecutionLedgerSnapshot,
	buildVerificationRepairRecoveryManifest,
	claimVerificationRepairAttemptPair,
	claimVerificationRepairMultipartContinuationPart,
	commitVerificationRepairRecovery,
	discoverVerificationRepairRecoveryBinding,
	importExistingVerificationRepairExecutionAttempts,
	initializeVerificationRepairExecutionLedger,
	inspectVerificationRepairExecutionAttempts,
	inspectVerificationRepairMultipartContinuationClaims,
	inspectVerificationRepairGenerationEvidence,
	reconcileVerificationRepairAttemptTransactions,
	readVerificationRepairExecutionMarker,
	requireMatchingVerificationRepairAttemptLedgers,
	requireMatchingVerificationRepairExecutionIdentity,
	requireVerificationRepairRecoveryArchivePair,
	resolveVerificationRepairRecoveryReviewContext,
	scienceChallengeVerificationRepairExecutionIdentity,
	startVerificationRepairMultipartContinuationInvocation,
	validateVerificationRepairRecoveryManifest,
	verificationRepairExecutionLedgerRoot
} from './science-challenge-verification-repair-lineage.mjs';

const emptySha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const hashes = {
	plan: canonicalHash({}),
	verification: 'b'.repeat(64),
	candidates: 'c'.repeat(64)
};
const localResponseSchemaSha256 = canonicalHash({ type: 'object' });
const codexLocalInfrastructureError =
	'Codex Exec exited with code 1: WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)\n' +
	'Reading prompt from stdin...\n' +
	'Error: failed to initialize in-process app-server client: Operation not permitted (os error 1)\n';

test('recovery review context discovers hash-bound typed inputs and their shared base plan', () => {
	const fixture = makeRecoveryReviewContextFixture();
	try {
		const result = resolveVerificationRepairRecoveryReviewContext(fixture);
		assert.equal(result.status, 'passed', result.issues.join('\n'));
		assert.deepEqual(result.basePlan, fixture.basePlan);
		assert.deepEqual(result.curriculumRemapVerifierInput, fixture.curriculumInput);
		assert.deepEqual(result.difficultyPlanAdjustmentVerifierInput, fixture.difficultyInput);
	} finally {
		rmSync(fixture.workspaceRoot, { recursive: true, force: true });
	}
});

test('recovery review context ignores unbound neighboring typed-input files', () => {
	const fixture = makeRecoveryReviewContextFixture({ ordinary: true });
	try {
		writeFileSync(fixture.curriculumInputPath, 'not json');
		writeFileSync(fixture.difficultyInputPath, 'also not json');
		const result = resolveVerificationRepairRecoveryReviewContext(fixture);
		assert.equal(result.status, 'passed', result.issues.join('\n'));
		assert.strictEqual(result.basePlan, fixture.plan);
		assert.equal(result.curriculumRemapVerifierInput, null);
		assert.equal(result.difficultyPlanAdjustmentVerifierInput, null);
	} finally {
		rmSync(fixture.workspaceRoot, { recursive: true, force: true });
	}
});

test('recovery review context fails closed on missing and canonically tampered typed inputs', () => {
	const missing = makeRecoveryReviewContextFixture({ omitCurriculumInput: true });
	try {
		const result = resolveVerificationRepairRecoveryReviewContext(missing);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /curriculum-remap verifier input is missing/);
	} finally {
		rmSync(missing.workspaceRoot, { recursive: true, force: true });
	}

	const tampered = makeRecoveryReviewContextFixture();
	try {
		writeReviewContextJson(tampered.difficultyInputPath, {
			...tampered.difficultyInput,
			tampered: true
		});
		const result = resolveVerificationRepairRecoveryReviewContext(tampered);
		assert.equal(result.status, 'failed');
		assert.match(
			result.issues.join('\n'),
			/difficulty-plan adjustment verifier input differs from its summary hash/
		);
	} finally {
		rmSync(tampered.workspaceRoot, { recursive: true, force: true });
	}
});

test('recovery review context rejects typed inputs that disagree on the base plan', () => {
	const fixture = makeRecoveryReviewContextFixture();
	try {
		fixture.difficultyInput = {
			...fixture.difficultyInput,
			basePlan: { ...fixture.basePlan, competing: true }
		};
		fixture.difficultyInput.basePlanSha256 = canonicalHash(fixture.difficultyInput.basePlan);
		fixture.verification.difficultyPlanAdjustmentVerifierInputSha256 = canonicalHash(
			fixture.difficultyInput
		);
		writeReviewContextJson(fixture.difficultyInputPath, fixture.difficultyInput);
		writeReviewContextJson(fixture.verificationPath, fixture.verification);
		const result = resolveVerificationRepairRecoveryReviewContext(fixture);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /do not agree on the exact basePlan/);
	} finally {
		rmSync(fixture.workspaceRoot, { recursive: true, force: true });
	}
});

test('recovery review context rejects base and effective plan confusion', () => {
	const fixture = makeRecoveryReviewContextFixture();
	try {
		for (const input of [fixture.curriculumInput, fixture.difficultyInput]) {
			input.effectivePlan = structuredClone(fixture.basePlan);
			input.effectivePlanSha256 = canonicalHash(input.effectivePlan);
		}
		fixture.verification.curriculumRemapVerifierInputSha256 = canonicalHash(
			fixture.curriculumInput
		);
		fixture.verification.difficultyPlanAdjustmentVerifierInputSha256 = canonicalHash(
			fixture.difficultyInput
		);
		writeReviewContextJson(fixture.curriculumInputPath, fixture.curriculumInput);
		writeReviewContextJson(fixture.difficultyInputPath, fixture.difficultyInput);
		writeReviewContextJson(fixture.verificationPath, fixture.verification);
		const result = resolveVerificationRepairRecoveryReviewContext(fixture);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /effectivePlan differs from the recovery plan/);
	} finally {
		rmSync(fixture.workspaceRoot, { recursive: true, force: true });
	}
});

test('recovery review context derives the complete typed review-rebase authority', () => {
	const fixture = makeRecoveryReviewContextFixture({ ordinary: true });
	try {
		fixture.verification = {
			...fixture.verification,
			...makeTypedReviewRebaseSummaryFields({
				planSha256: canonicalHash(fixture.plan),
				candidateSetSha256: hashes.candidates,
				rejectedIds: ['challenge-rejected'],
				collectionTargetIds: ['challenge-collection']
			})
		};
		writeReviewContextJson(fixture.verificationPath, fixture.verification);
		const result = resolveVerificationRepairRecoveryReviewContext(fixture);
		assert.equal(result.status, 'passed', result.issues.join('\n'));
		assert.deepEqual(result.verificationRepairAuthority.mutableChallengeIds, [
			'challenge-collection',
			'challenge-rejected'
		]);

		fixture.verification.reviewRebaseCollectionRemediationTargetSetSha256 = 'f'.repeat(64);
		writeReviewContextJson(fixture.verificationPath, fixture.verification);
		const tampered = resolveVerificationRepairRecoveryReviewContext(fixture);
		assert.equal(tampered.status, 'failed');
		assert.match(tampered.issues.join('\n'), /authority is invalid|targets differ/);
	} finally {
		rmSync(fixture.workspaceRoot, { recursive: true, force: true });
	}
});

test('one workspace objective ledger enforces a four-attempt cap across invocation policies', () => {
	const fixture = makeFixture();
	try {
		const firstPolicy = makeIdentity();
		const secondPolicy = makeIdentity({
			model: 'chatgpt-gpt-5.6-sol-new-snapshot',
			thinkingLevel: 'max',
			directPartSize: 7
		});
		assert.equal(firstPolicy.objectiveId, secondPolicy.objectiveId);
		assert.notEqual(firstPolicy.executionId, secondPolicy.executionId);
		const firstRoot = verificationRepairExecutionLedgerRoot(fixture.root, firstPolicy.objectiveId);
		const secondRoot = verificationRepairExecutionLedgerRoot(
			fixture.root,
			secondPolicy.objectiveId
		);
		assert.equal(firstRoot, secondRoot);
		mkdirSync(path.join(firstRoot, 'shards/science-001/.claim-preparing-crashed-process'), {
			recursive: true
		});
		mkdirSync(path.join(firstRoot, 'attempt-transactions'), { recursive: true });
		writeFileSync(
			path.join(firstRoot, 'attempt-transactions/.temporary-crashed-process'),
			'partial'
		);

		for (let attempt = 1; attempt <= 4; attempt += 1) {
			claimVerificationRepairAttemptPair({
				ledgerRoot: firstRoot,
				identity: attempt % 2 === 1 ? firstPolicy : secondPolicy,
				shardId: 'science-001',
				attempt,
				outputRoot: fixture.successorRoot
			});
		}
		const global = inspectVerificationRepairExecutionAttempts({
			ledgerRoot: firstRoot,
			identity: firstPolicy,
			shardId: 'science-001'
		});
		assert.deepEqual(
			global.attempts.map((row) => row.attempt),
			[1, 2, 3, 4]
		);
		assert.deepEqual(
			global.attempts.map((row) => row.claim.policy.model),
			[firstPolicy.model, secondPolicy.model, firstPolicy.model, secondPolicy.model]
		);
		assert.throws(
			() =>
				claimVerificationRepairAttemptPair({
					ledgerRoot: firstRoot,
					identity: firstPolicy,
					shardId: 'science-001',
					attempt: 5,
					outputRoot: fixture.successorRoot
				}),
			/budget is exhausted/
		);

		const clonedRoot = path.join(fixture.planRoot, 'cloned-successor');
		mkdirSync(clonedRoot, { recursive: true });
		assert.throws(
			() =>
				requireMatchingVerificationRepairAttemptLedgers({
					localAttempts: global.attempts.map(({ attempt }) => ({ attempt })),
					globalAttempts: global.attempts,
					shardId: 'science-001',
					outputRoot: clonedRoot
				}),
			/belongs to another output root/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('execution marker immutably binds one exact policy to a portable worktree-relative output root', () => {
	const fixture = makeFixture();
	const outsideRoot = mkdtempSync(path.join(tmpdir(), 'science-repair-marker-outside-'));
	try {
		const identity = makeIdentity();
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixture.root, identity.objectiveId);
		const first = bindVerificationRepairExecutionMarker({
			workspaceRoot: fixture.root,
			ledgerRoot,
			identity,
			outputRoot: fixture.successorRoot
		});
		const replay = bindVerificationRepairExecutionMarker({
			workspaceRoot: fixture.root,
			ledgerRoot,
			identity,
			outputRoot: fixture.successorRoot
		});
		assert.deepEqual(replay, first);
		assert.equal(
			first.marker.schemaVersion,
			SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA
		);
		assert.equal(first.marker.executionIdentitySha256, canonicalHash(identity));
		assert.equal(first.marker.objectiveId, identity.objectiveId);
		assert.equal(first.marker.executionId, identity.executionId);
		assert.equal(first.marker.outputRootRelativePath, 'science-500-v1/successor-root');
		assert.equal(path.isAbsolute(first.marker.outputRootRelativePath), false);
		const markerBytes = readFileSync(first.markerPath, 'utf8');
		assert.equal(markerBytes.includes(fixture.root), false);
		assert.equal(markerBytes.includes(outsideRoot), false);
		assert.deepEqual(
			readVerificationRepairExecutionMarker({
				workspaceRoot: fixture.root,
				ledgerRoot,
				identity
			}),
			first
		);

		const competingRoot = path.join(fixture.planRoot, 'competing-successor');
		mkdirSync(competingRoot);
		assert.throws(
			() =>
				bindVerificationRepairExecutionMarker({
					workspaceRoot: fixture.root,
					ledgerRoot,
					identity,
					outputRoot: competingRoot
				}),
			/Immutable verification-repair evidence differs/
		);
		assert.throws(
			() =>
				bindVerificationRepairExecutionMarker({
					workspaceRoot: fixture.root,
					ledgerRoot,
					identity,
					outputRoot: outsideRoot
				}),
			/must be inside its linked worktree/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
		rmSync(outsideRoot, { recursive: true, force: true });
	}
});

test('execution marker replay rejects noncanonical or identity-tampered bytes', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixture.root, identity.objectiveId);
		const bound = bindVerificationRepairExecutionMarker({
			workspaceRoot: fixture.root,
			ledgerRoot,
			identity,
			outputRoot: fixture.successorRoot
		});
		writeFileSync(bound.markerPath, ` ${stableStringify(bound.marker)}\n`);
		assert.throws(
			() =>
				readVerificationRepairExecutionMarker({
					workspaceRoot: fixture.root,
					ledgerRoot,
					identity
				}),
			/execution marker bytes are not canonical/
		);
		writeFileSync(
			bound.markerPath,
			`${stableStringify({
				...bound.marker,
				executionId: 'f'.repeat(64)
			})}\n`
		);
		assert.throws(
			() =>
				readVerificationRepairExecutionMarker({
					workspaceRoot: fixture.root,
					ledgerRoot,
					identity
				}),
			/execution marker binding is invalid/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('attempt-4 multipart continuation claims only the untouched contiguous canonical suffix', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixture.root, identity.objectiveId);
		for (let attempt = 1; attempt <= 4; attempt += 1) {
			claimVerificationRepairAttemptPair({
				ledgerRoot,
				identity,
				shardId: 'science-001',
				attempt,
				outputRoot: fixture.successorRoot
			});
		}
		const base = {
			planSha256: identity.planSha256,
			inputSha256: 'd'.repeat(64),
			fullPartPlanSha256: 'e'.repeat(64),
			sourceAttemptSha256: 'f'.repeat(64),
			sourcePartsSha256: '1'.repeat(64),
			sourceAttemptedPartCount: 2,
			expectedPartCount: 4,
			invocationPolicy: {
				schemaVersion: 'science-challenge-verification-repair-multipart-continuation-invocation/v1',
				model: identity.model,
				transport: identity.transport,
				responseMode: identity.responseMode,
				thinkingLevel: identity.thinkingLevel,
				directPartSize: identity.directPartSize,
				authMode: 'configured-proxy',
				operation: 'streamText',
				providerSchemaApplied: false,
				tools: [],
				maxCalls: 1
			}
		};
		base.invocationPolicySha256 = canonicalHash(base.invocationPolicy);
		const first = {
			...base,
			partId: 'part-03',
			partIndex: 3,
			rowIds: ['challenge-5', 'challenge-6'],
			partPlanSha256: '2'.repeat(64),
			promptSha256: '3'.repeat(64),
			responseSchemaSha256: '4'.repeat(64),
			priorContinuationPartsSha256: canonicalHash([]),
			priorContinuationClaimsSha256: canonicalHash([])
		};
		const firstClaim = claimVerificationRepairMultipartContinuationPart({
			ledgerRoot,
			identity,
			shardId: 'science-001',
			attempt: 4,
			outputRoot: fixture.successorRoot,
			partClaim: first
		});
		assert.equal(firstClaim.claim.partId, 'part-03');
		const started = startVerificationRepairMultipartContinuationInvocation({
			ledgerRoot,
			identity,
			shardId: 'science-001',
			attempt: 4,
			outputRoot: fixture.successorRoot,
			partId: 'part-03'
		});
		assert.equal(started.started, true);
		const duplicateStart = startVerificationRepairMultipartContinuationInvocation({
			ledgerRoot,
			identity,
			shardId: 'science-001',
			attempt: 4,
			outputRoot: fixture.successorRoot,
			partId: 'part-03'
		});
		assert.equal(duplicateStart.started, false);
		assert.equal(canonicalHash(duplicateStart.marker), canonicalHash(started.marker));

		const second = {
			...base,
			partId: 'part-04',
			partIndex: 4,
			rowIds: ['challenge-7', 'challenge-8'],
			partPlanSha256: '5'.repeat(64),
			promptSha256: '6'.repeat(64),
			responseSchemaSha256: '7'.repeat(64),
			priorContinuationPartsSha256: canonicalHash([
				{ partId: 'part-03', evidenceSha256: '8'.repeat(64) }
			]),
			priorContinuationClaimsSha256: canonicalHash([
				{ partId: 'part-03', claimSha256: canonicalHash(firstClaim.claim) }
			])
		};
		claimVerificationRepairMultipartContinuationPart({
			ledgerRoot,
			identity,
			shardId: 'science-001',
			attempt: 4,
			outputRoot: fixture.successorRoot,
			partClaim: second
		});
		const inspected = inspectVerificationRepairMultipartContinuationClaims({
			ledgerRoot,
			identity,
			shardId: 'science-001',
			attempt: 4,
			outputRoot: fixture.successorRoot
		});
		assert.deepEqual(
			inspected.claims.map((record) => record.partId),
			['part-03', 'part-04']
		);
		assert.equal(
			inspectVerificationRepairExecutionAttempts({
				ledgerRoot,
				identity,
				shardId: 'science-001'
			}).nextAttempt,
			5
		);
		assert.throws(
			() =>
				claimVerificationRepairMultipartContinuationPart({
					ledgerRoot,
					identity,
					shardId: 'science-001',
					attempt: 4,
					outputRoot: fixture.successorRoot,
					partClaim: { ...second, partId: 'part-05', partIndex: 5 }
				}),
			/outside the canonical missing suffix|next never-attempted/
		);

		const secondClaimPath = path.join(
			ledgerRoot,
			'shards/science-001/attempt-04/multipart-continuation-parts/part-04/claim.json'
		);
		const tampered = JSON.parse(readFileSync(secondClaimPath, 'utf8'));
		tampered.invocationPolicy.model = 'different-model';
		writeFileSync(secondClaimPath, `${stableStringify(tampered)}\n`);
		assert.throws(
			() =>
				inspectVerificationRepairMultipartContinuationClaims({
					ledgerRoot,
					identity,
					shardId: 'science-001',
					attempt: 4,
					outputRoot: fixture.successorRoot
				}),
			/claim is invalid|prior claims|partial, reordered/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('explicit pre-model recovery is deterministic, source-bound and tamper evident', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		writePreModelRoot(fixture.preModelRoot);
		const manifest = buildManifest(fixture, identity);
		assert.equal(manifest.preModelAttemptCount, 4);
		assert.equal(manifest.preModelRoots[0].evidenceFileCount, 29);
		assert.equal(
			validateVerificationRepairRecoveryManifest({
				manifest,
				planPath: fixture.planPath,
				generationRoot: fixture.successorRoot
			}).status,
			'passed'
		);

		const tampered = structuredClone(manifest);
		tampered.preModelRoots[0].attempts[0].error = 'different';
		assert.equal(
			validateVerificationRepairRecoveryManifest({
				manifest: tampered,
				planPath: fixture.planPath,
				generationRoot: fixture.successorRoot
			}).status,
			'failed'
		);

		writeFileSync(fixture.planPath, '{"changed":true}\n');
		assert.equal(
			validateVerificationRepairRecoveryManifest({
				manifest,
				planPath: fixture.planPath,
				generationRoot: fixture.successorRoot
			}).status,
			'failed'
		);
		writeFileSync(fixture.planPath, '{}\n');
		writeFileSync(
			path.join(fixture.preModelRoot, 'shards/science-001/candidate.json'),
			`${stableStringify({ challenges: [{ definition: { id: 'tampered' } }] })}\n`
		);
		assert.equal(
			validateVerificationRepairRecoveryManifest({
				manifest,
				planPath: fixture.planPath,
				generationRoot: fixture.successorRoot
			}).status,
			'failed'
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('pre-model clone recovery refuses a typed review-rebase objective without full authority replay', () => {
	const fixture = makeFixture();
	try {
		const verificationSummary = {
			schemaVersion: 'science-challenge-independent-verification-summary/v1',
			...makeTypedReviewRebaseSummaryFields({
				planSha256: hashes.plan,
				candidateSetSha256: hashes.candidates,
				rejectedIds: [],
				collectionTargetIds: ['science-001-challenge-001']
			})
		};
		const identity = makeIdentity({
			verificationSha256: canonicalHash(verificationSummary)
		});
		const authority = buildScienceChallengeVerificationRepairAuthority({
			verificationSummary,
			allowManifestlessReplay: true
		});
		writePreModelRoot(fixture.preModelRoot, () => {}, {
			identity,
			verificationSummary,
			verificationRepairAuthority: authority
		});
		assert.throws(
			() => buildManifest(fixture, identity),
			/Typed review-rebase objectives cannot use pre-model clone recovery/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('validation-only pre-dispatch recovery accepts an evidenced older-attempt conflict before the current cohort', () => {
	const fixture = makeFixture();
	try {
		const identity = makeValidationOnlyIdentity();
		writeValidationOnlyPreDispatchRoot(fixture.preModelRoot, identity);
		writeCandidate(fixture.preModelRoot, 'science-002');
		writeCandidate(fixture.successorRoot, 'science-002');
		const manifest = buildManifest(fixture, identity);
		assert.equal(manifest.preModelAttemptCount, 4);
		assert.equal(manifest.preModelRoots[0].attempts.length, 4);
		assert.equal(
			manifest.preModelRoots[0].attempts[0].classification,
			'pre-model-validation-only-pre-dispatch-lineage-conflict'
		);
		assert.equal(
			manifest.preModelRoots[0].attempts[0].conflictingAttemptEvidence[0].directory,
			'verification-repair-000000000000-attempt-01'
		);
		assert.equal(manifest.preModelRoots[0].evidenceFileCount, 10);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('validation-only pre-dispatch recovery rejects wrong objective, input and model bindings', () => {
	for (const { label, mutate, expected } of [
		{
			label: 'objective',
			mutate: (validation) => {
				validation.verificationRepairSha256 = 'f'.repeat(64);
			},
			expected: /not the exact validation-only pre-dispatch failure/
		},
		{
			label: 'input',
			mutate: (validation) => {
				validation.inputSha256 = 'e'.repeat(64);
			},
			expected: /differs from its exact objective or authoring input binding/
		},
		{
			label: 'model',
			mutate: (validation) => {
				validation.model = 'another-model';
			},
			expected: /not the exact validation-only pre-dispatch failure/
		}
	]) {
		const fixture = makeFixture();
		try {
			const identity = makeValidationOnlyIdentity();
			writeValidationOnlyPreDispatchRoot(fixture.preModelRoot, identity, {
				mutateValidation: mutate
			});
			assert.throws(() => buildManifest(fixture, identity), expected, label);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('validation-only pre-dispatch recovery rejects a different invocation policy', () => {
	const fixture = makeFixture();
	try {
		const identity = makeValidationOnlyIdentity();
		writeValidationOnlyPreDispatchRoot(fixture.preModelRoot, identity);
		const differentPolicy = scienceChallengeVerificationRepairExecutionIdentity({
			...identity,
			directPartSize: 3
		});
		assert.throws(
			() => buildManifest(fixture, differentPolicy),
			/differs from the exact validation-only pre-dispatch policy/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('validation-only pre-dispatch recovery rejects near-match errors and model artifacts', () => {
	for (const { label, mutateValidation, addArtifact, expected } of [
		{
			label: 'near-match transport error',
			mutateValidation: (validation) => {
				validation.transportError = validation.transportError.replace(
					'unrelated verification-repair attempt',
					'unrelated verification repair attempt'
				);
				validation.issues[0] = validation.transportError;
			},
			expected: /not the exact validation-only pre-dispatch failure/
		},
		{
			label: 'generated response artifact',
			addArtifact: ({ attemptRoot, attempt }) => {
				if (attempt === 1) {
					writeFileSync(path.join(attemptRoot, 'last-message.json'), 'generated response');
				}
			},
			expected: /evidence shape differs/
		}
	]) {
		const fixture = makeFixture();
		try {
			const identity = makeValidationOnlyIdentity();
			writeValidationOnlyPreDispatchRoot(fixture.preModelRoot, identity, {
				mutateValidation,
				addArtifact
			});
			assert.throws(() => buildManifest(fixture, identity), expected, label);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('validation-only pre-dispatch recovery requires a concrete conflicting older attempt', () => {
	const fixture = makeFixture();
	try {
		const identity = makeValidationOnlyIdentity();
		writeValidationOnlyPreDispatchRoot(fixture.preModelRoot, identity, {
			includeConflict: false
		});
		assert.throws(
			() => buildManifest(fixture, identity),
			/has no evidenced conflicting older repair attempt/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('an unrelated attempt is not ignored for ordinary completed pre-model evidence', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		writePreModelRoot(fixture.preModelRoot);
		const unrelatedRoot = path.join(
			fixture.preModelRoot,
			'shards/science-001/verification-repair-aaaaaaaaaaaa-attempt-01'
		);
		mkdirSync(unrelatedRoot, { recursive: true });
		writeFileSync(path.join(unrelatedRoot, 'validation.json'), '{}\n');
		assert.throws(
			() => buildManifest(fixture, identity),
			/contains an unrelated pre-model repair attempt/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('multipart pre-model classification accepts exact local response schema input evidence', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		writeMultipartPreModelRoot(fixture.preModelRoot);
		const manifest = buildManifest(fixture, identity);
		assert.equal(manifest.preModelAttemptCount, 4);
		assert.equal(manifest.preModelRoots[0].attempts.length, 4);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('multipart pre-model classification rejects mismatched or rehashed local response schemas', () => {
	const mutations = [
		{
			label: 'rehashed summary schema',
			mutate: ({ summary }) => {
				summary.localResponseSchemaSha256 = canonicalHash({ type: 'array' });
			}
		},
		{
			label: 'mismatched request schema',
			mutate: ({ request }) => {
				request.localResponseSchemaSha256 = canonicalHash({ type: 'string' });
			}
		},
		{
			label: 'mismatched input-evidence schema',
			mutate: ({ summary }) => {
				summary.inputEvidence.responseSchemaSha256 = canonicalHash({
					type: 'number'
				});
			}
		}
	];
	for (const { label, mutate } of mutations) {
		const fixture = makeFixture();
		try {
			const identity = makeIdentity();
			writeMultipartPreModelRoot(fixture.preModelRoot, mutate);
			assert.throws(
				() => buildManifest(fixture, identity),
				/response schema hash differs from its request or input-evidence binding/,
				label
			);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('structured direct pre-model classification binds input evidence to the request schema', () => {
	const responseJsonSchema = {
		type: 'object',
		additionalProperties: false,
		properties: {
			challenges: { type: 'array' }
		},
		required: ['challenges']
	};
	for (const { label, mutate, expectedError } of [
		{
			label: 'exact binding',
			mutate: () => {},
			expectedError: null
		},
		{
			label: 'mismatched input evidence',
			mutate: ({ summary }) => {
				summary.inputEvidence.responseSchemaSha256 = canonicalHash({ type: 'string' });
			},
			expectedError: /response schema hash differs from its request or input-evidence binding/
		},
		{
			label: 'missing input evidence',
			mutate: ({ summary }) => {
				delete summary.inputEvidence;
			},
			expectedError: /response schema hash differs from its request or input-evidence binding/
		}
	]) {
		const fixture = makeFixture();
		try {
			const identity = makeIdentity({
				responseMode: 'structured-json',
				directPartSize: null
			});
			writePreModelRoot(fixture.preModelRoot, mutate, { responseJsonSchema });
			if (expectedError) {
				assert.throws(() => buildManifest(fixture, identity), expectedError, label);
			} else {
				assert.equal(buildManifest(fixture, identity).preModelAttemptCount, 4, label);
			}
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('codex pre-model classification accepts only the exact known multiline infrastructure error', () => {
	for (const error of [
		codexLocalInfrastructureError,
		codexLocalInfrastructureError.replace(/\n/g, '\r\n')
	]) {
		const fixture = makeFixture();
		try {
			const identity = makeIdentity({
				model: 'gpt-5.6-sol',
				transport: 'codex-sdk',
				responseMode: null,
				thinkingLevel: 'max',
				directPartSize: null
			});
			writeCodexPreModelRoot(fixture.preModelRoot, error);
			assert.equal(buildManifest(fixture, identity).preModelAttemptCount, 4);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('codex pre-model classification rejects near-miss multiline infrastructure errors', () => {
	const nearMisses = [
		codexLocalInfrastructureError.replace(
			'Reading prompt from stdin...',
			'Reading a prompt from stdin...'
		),
		`${codexLocalInfrastructureError}Unexpected extra line\n`,
		codexLocalInfrastructureError.slice(0, -1)
	];
	for (const error of nearMisses) {
		const fixture = makeFixture();
		try {
			const identity = makeIdentity({
				model: 'gpt-5.6-sol',
				transport: 'codex-sdk',
				responseMode: null,
				thinkingLevel: 'max',
				directPartSize: null
			});
			writeCodexPreModelRoot(fixture.preModelRoot, error);
			assert.throws(
				() => buildManifest(fixture, identity),
				/not an approved local infrastructure failure/
			);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('pre-model classification reads immutable bytes and rejects every model-bearing artifact class', () => {
	const mutations = [
		{
			label: 'event bytes',
			mutate: ({ attemptRoot, summary }) => {
				const bytes = Buffer.from('{"type":"model"}\n');
				writeFileSync(path.join(attemptRoot, 'events.jsonl'), bytes);
				summary.eventLogSha256 = sha256(bytes);
			}
		},
		{
			label: 'reasoning bytes',
			mutate: ({ attemptRoot, summary }) => {
				const bytes = Buffer.from('hidden thought');
				writeFileSync(path.join(attemptRoot, 'thoughts.txt'), bytes);
				summary.thoughtsSha256 = sha256(bytes);
			}
		},
		{
			label: 'response bytes',
			mutate: ({ attemptRoot, summary }) => {
				const bytes = Buffer.from('model response');
				writeFileSync(path.join(attemptRoot, 'last-message.json'), bytes);
				summary.finalResponseSha256 = sha256(bytes);
				summary.lastMessageFileSha256 = sha256(bytes);
			}
		},
		{
			label: 'result metadata',
			mutate: ({ attemptRoot, summary }) => {
				const bytes = Buffer.from('{"provider":"chatgpt"}\n');
				writeFileSync(path.join(attemptRoot, 'result-metadata.json'), bytes);
				summary.resultMetadataSha256 = sha256(bytes);
			}
		},
		{
			label: 'tool artifact',
			mutate: ({ attemptRoot }) => {
				writeFileSync(path.join(attemptRoot, 'tool-call.json'), '{}\n');
			}
		},
		{
			label: 'usage',
			mutate: ({ summary }) => {
				summary.usage = { inputTokens: 1 };
			}
		},
		{
			label: 'model version',
			mutate: ({ summary }) => {
				summary.modelVersion = 'served-model-version';
			}
		},
		{
			label: 'unrecognized reasoning artifact',
			mutate: ({ summary }) => {
				summary.reasoningArtifact = 'model-derived reasoning';
			}
		},
		{
			label: 'unrecognized response artifact',
			mutate: ({ summary }) => {
				summary.validationResponsePayload = 'model-derived validation feedback';
			}
		}
	];
	for (const { label, mutate } of mutations) {
		const fixture = makeFixture();
		try {
			const identity = makeIdentity();
			writePreModelRoot(fixture.preModelRoot, mutate);
			assert.throws(() => buildManifest(fixture, identity), undefined, label);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('content or validation failures cannot be relabelled as infrastructure recovery', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		writePreModelRoot(fixture.preModelRoot, ({ summary }) => {
			summary.error = 'candidate failed deterministic validation';
		});
		assert.throws(
			() => buildManifest(fixture, identity),
			/not an approved local infrastructure failure/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('pre-model evidence must bind the full verification objective, not only its path prefix', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		writePreModelRoot(fixture.preModelRoot);
		const validationPath = path.join(
			fixture.preModelRoot,
			'shards/science-001/verification-repair-bbbbbbbbbbbb-attempt-01/validation.json'
		);
		const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
		validation.verificationRepairSha256 = `${hashes.verification.slice(0, 12)}${'f'.repeat(52)}`;
		writeFileSync(validationPath, `${stableStringify(validation)}\n`);
		assert.throws(() => buildManifest(fixture, identity), /content-bearing validation evidence/);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('recovery predecessor roots must be the complete discovered set and cannot be duplicated', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		const secondRoot = path.join(fixture.planRoot, 'second-failed-root');
		writePreModelRoot(fixture.preModelRoot);
		writePreModelRoot(secondRoot);
		assert.throws(() => buildManifest(fixture, identity), /complete discovered root set.*Omitted/);
		assert.throws(
			() =>
				buildManifest(fixture, identity, [fixture.preModelRoot, fixture.preModelRoot, secondRoot]),
			/must be unique/
		);
		const manifest = buildManifest(fixture, identity, [fixture.preModelRoot, secondRoot]);
		assert.equal(manifest.preModelRoots.length, 2);
		assert.equal(manifest.preModelAttemptCount, 8);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('recovery binding is mandatory, output-root-bound, and snapshot-complete', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		writePreModelRoot(fixture.preModelRoot);
		const manifest = buildManifest(fixture, identity);
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixture.root, identity.objectiveId);
		const bindingRecord = bindVerificationRepairExecutionRecovery({
			ledgerRoot,
			identity,
			manifest,
			successorRoot: fixture.successorRoot
		});
		const claimedAttempt = claimVerificationRepairAttemptPair({
			ledgerRoot,
			identity,
			shardId: 'science-001',
			attempt: 1,
			outputRoot: fixture.successorRoot
		});
		writeCompletedAttemptPolicyEvidence(claimedAttempt.attemptDir, identity);
		assert.equal(
			buildVerificationRepairExecutionLedgerSnapshot({
				ledgerRoot,
				identity,
				outputRoot: fixture.successorRoot
			}).claimCount,
			1
		);
		assert.throws(
			() =>
				requireVerificationRepairRecoveryArchivePair({
					bindingRecord,
					manifest: null,
					manifestPath: null,
					recoveryRequired: true
				}),
			/requires a bound recovery manifest/
		);
		assert.throws(
			() =>
				requireVerificationRepairRecoveryArchivePair({
					bindingRecord: null,
					manifest,
					manifestPath: '/manifest.json'
				}),
			/no immutable workspace-objective-ledger/
		);

		const clonedRoot = path.join(fixture.planRoot, 'copied-successor');
		mkdirSync(clonedRoot, { recursive: true });
		assert.throws(
			() =>
				discoverVerificationRepairRecoveryBinding({
					ledgerRoot,
					generationRoot: clonedRoot
				}),
			/cloning cannot erase recovery lineage/
		);

		mkdirSync(
			path.join(
				fixture.successorRoot,
				'shards/science-002/verification-repair-bbbbbbbbbbbb-attempt-01'
			),
			{ recursive: true }
		);
		assert.throws(
			() =>
				buildVerificationRepairExecutionLedgerSnapshot({
					ledgerRoot,
					identity,
					outputRoot: fixture.successorRoot
				}),
			/local repair attempts differ/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('repair evidence cannot make recovery optional by omitting its generation summary', () => {
	const fixture = makeFixture();
	try {
		mkdirSync(
			path.join(
				fixture.successorRoot,
				'shards/science-001/verification-repair-bbbbbbbbbbbb-attempt-01'
			),
			{ recursive: true }
		);
		assert.throws(
			() =>
				inspectVerificationRepairGenerationEvidence({
					generationRoot: fixture.successorRoot
				}),
			/no objective-bound generation summary/
		);
		const identity = makeIdentity();
		writeFileSync(
			path.join(fixture.successorRoot, 'verification-repair-bbbbbbbbbbbb-summary.json'),
			`${stableStringify({
				schemaVersion: 'science-challenge-generation-summary/v1',
				status: 'passed',
				planSha256: identity.planSha256,
				verificationRepairSha256: identity.verificationSha256,
				verificationRepairExecutionIdentity: identity,
				publication: { journal: { status: 'committed' } }
			})}\n`
		);
		assert.equal(
			inspectVerificationRepairGenerationEvidence({
				generationRoot: fixture.successorRoot
			}).objectiveId,
			identity.objectiveId
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('generation evidence retains and authenticates the complete typed review-rebase authority', () => {
	const fixture = makeFixture();
	try {
		const verificationSummary = {
			schemaVersion: 'science-challenge-independent-verification-summary/v1',
			...makeTypedReviewRebaseSummaryFields({
				planSha256: hashes.plan,
				candidateSetSha256: hashes.candidates,
				rejectedIds: ['challenge-rejected'],
				collectionTargetIds: ['challenge-collection']
			})
		};
		const identity = makeIdentity({
			verificationSha256: canonicalHash(verificationSummary)
		});
		const authority = buildScienceChallengeVerificationRepairAuthority({
			verificationSummary,
			allowManifestlessReplay: true
		});
		const summaryPath = path.join(
			fixture.successorRoot,
			`verification-repair-${identity.verificationSha256.slice(0, 12)}-summary.json`
		);
		const summary = {
			schemaVersion: 'science-challenge-generation-summary/v1',
			status: 'passed',
			planSha256: identity.planSha256,
			verificationRepairSha256: identity.verificationSha256,
			verificationRepairExecutionIdentity: identity,
			publication: { journal: { status: 'committed' } },
			...generationAuthorityBindings(authority)
		};
		writeFileSync(summaryPath, `${stableStringify(summary)}\n`);
		const inspected = inspectVerificationRepairGenerationEvidence({
			generationRoot: fixture.successorRoot
		});
		assert.deepEqual(inspected.verificationRepairAuthority, authority);

		summary.verificationRepairMutableChallengeIds = ['challenge-rejected'];
		writeFileSync(summaryPath, `${stableStringify(summary)}\n`);
		assert.throws(
			() =>
				inspectVerificationRepairGenerationEvidence({
					generationRoot: fixture.successorRoot
				}),
			/MutableChallengeIds differs|mutable.*differs/i
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('materialization selects only the terminal identity in an authenticated effective-cohort objective chain', () => {
	const fixture = makeFixture();
	try {
		const first = makeIdentity();
		const firstCandidateSetSha256 = canonicalHash({ cohort: 1 });
		const second = makeIdentity({
			verificationSha256: canonicalHash({ review: 2 }),
			priorCandidateSetSha256: firstCandidateSetSha256
		});
		const firstManifest = {
			schemaVersion: 'science-challenge-effective-cohort/v1',
			disposition: 'review-pending-effective-cohort',
			repairSha256: first.verificationSha256,
			objectiveId: first.objectiveId,
			executionId: first.executionId,
			effectivePlanSha256: first.planSha256,
			candidateSetSha256: firstCandidateSetSha256
		};
		const firstDirectory = path.join(
			fixture.successorRoot,
			`verification-repair-${first.verificationSha256.slice(0, 12)}-effective-cohort`
		);
		mkdirSync(firstDirectory, { recursive: true });
		const firstManifestPath = path.join(firstDirectory, 'manifest.json');
		writeFileSync(firstManifestPath, `${stableStringify(firstManifest)}\n`);
		const firstManifestBytes = readFileSync(firstManifestPath);
		const secondManifest = {
			schemaVersion: 'science-challenge-effective-cohort/v1',
			disposition: 'review-pending-effective-cohort-successor',
			repairSha256: second.verificationSha256,
			objectiveId: second.objectiveId,
			executionId: second.executionId,
			effectivePlanSha256: second.planSha256,
			candidateSetSha256: canonicalHash({ cohort: 2 }),
			predecessor: {
				manifest: {
					path: path.relative(fixture.successorRoot, firstManifestPath),
					sha256: sha256(firstManifestBytes),
					canonicalSha256: canonicalHash(firstManifest)
				},
				manifestCanonicalSha256: canonicalHash(firstManifest),
				candidateSetSha256: firstCandidateSetSha256
			}
		};
		const secondDirectory = path.join(
			fixture.successorRoot,
			`verification-repair-${second.verificationSha256.slice(0, 12)}-effective-cohort`
		);
		mkdirSync(secondDirectory, { recursive: true });
		const secondManifestPath = path.join(secondDirectory, 'manifest.json');
		writeFileSync(secondManifestPath, `${stableStringify(secondManifest)}\n`);
		for (const [identity, manifest] of [
			[first, firstManifest],
			[second, secondManifest]
		]) {
			writeFileSync(
				path.join(
					fixture.successorRoot,
					`verification-repair-${identity.verificationSha256.slice(0, 12)}-summary.json`
				),
				`${stableStringify({
					schemaVersion: 'science-challenge-generation-summary/v1',
					status: 'review-pending',
					planSha256: identity.planSha256,
					verificationRepairSha256: identity.verificationSha256,
					verificationRepairExecutionIdentity: identity,
					publication: null,
					reviewPendingCount: 1,
					effectiveCohort: {
						manifestSha256: canonicalHash(manifest),
						candidateSetSha256: manifest.candidateSetSha256
					}
				})}\n`
			);
		}
		const inspected = inspectVerificationRepairGenerationEvidence({
			generationRoot: fixture.successorRoot,
			terminalEffectiveCohortManifestPath: secondManifestPath
		});
		assert.equal(inspected.objectiveId, second.objectiveId);
		assert.equal(inspected.identity.executionId, second.executionId);
		assert.equal(inspected.summaryPaths.length, 2);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('preparing paired-attempt transactions reconcile both ledgers after a crash', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixture.root, identity.objectiveId);
		initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
		const transactionPath = path.join(
			ledgerRoot,
			'attempt-transactions/science-001-attempt-01.json'
		);
		mkdirSync(path.dirname(transactionPath), { recursive: true });
		writeFileSync(
			transactionPath,
			`${stableStringify({
				schemaVersion: 'science-challenge-verification-repair-attempt-transaction/v1',
				status: 'preparing',
				objectiveId: identity.objectiveId,
				executionIdentity: identity,
				shardId: 'science-001',
				attempt: 1,
				outputRootPath: path.resolve(fixture.successorRoot),
				outputRootSha256: canonicalHash(path.resolve(fixture.successorRoot))
			})}\n`
		);
		assert.deepEqual(
			reconcileVerificationRepairAttemptTransactions({
				ledgerRoot,
				identity,
				outputRoot: fixture.successorRoot
			}),
			[{ shardId: 'science-001', attempt: 1 }]
		);
		const reconciled = JSON.parse(readFileSync(transactionPath, 'utf8'));
		assert.equal(reconciled.status, 'committed');
		assert.equal(
			inspectVerificationRepairExecutionAttempts({
				ledgerRoot,
				identity,
				shardId: 'science-001'
			}).attempts.length,
			1
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('historical import records each immutable local invocation policy instead of caller policy', () => {
	const fixture = makeFixture();
	try {
		const firstPolicy = makeIdentity();
		const secondPolicy = makeIdentity({
			model: 'chatgpt-gpt-5.6-sol-new-snapshot',
			responseMode: 'structured-json',
			thinkingLevel: 'max',
			directPartSize: 4
		});
		for (const [index, identity] of [firstPolicy, secondPolicy].entries()) {
			const attemptRoot = path.join(
				fixture.successorRoot,
				'shards/science-001',
				`verification-repair-bbbbbbbbbbbb-attempt-${String(index + 1).padStart(2, '0')}`
			);
			mkdirSync(attemptRoot, { recursive: true });
			writeCompletedAttemptPolicyEvidence(attemptRoot, identity);
		}
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixture.root, firstPolicy.objectiveId);
		assert.deepEqual(
			importExistingVerificationRepairExecutionAttempts({
				ledgerRoot,
				identity: firstPolicy,
				outputRoot: fixture.successorRoot
			}),
			[
				{ shardId: 'science-001', attempt: 1 },
				{ shardId: 'science-001', attempt: 2 }
			]
		);
		assert.deepEqual(
			inspectVerificationRepairExecutionAttempts({
				ledgerRoot,
				identity: firstPolicy,
				shardId: 'science-001'
			}).attempts.map((attempt) => attempt.claim.executionId),
			[firstPolicy.executionId, secondPolicy.executionId]
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('fresh typed objective imports only authority-bound attempts and never counts parent attempts', () => {
	const fixture = makeFixture();
	try {
		const parentIdentity = makeIdentity();
		const verificationSummary = {
			schemaVersion: 'science-challenge-independent-verification-summary/v1',
			...makeTypedReviewRebaseSummaryFields({
				planSha256: hashes.plan,
				candidateSetSha256: hashes.candidates,
				rejectedIds: [],
				collectionTargetIds: ['challenge-collection']
			})
		};
		const identity = makeIdentity({
			verificationSha256: canonicalHash(verificationSummary)
		});
		const authority = buildScienceChallengeVerificationRepairAuthority({
			verificationSummary,
			allowManifestlessReplay: true
		});
		const shardRoot = path.join(fixture.successorRoot, 'shards/science-001');
		const parentAttemptRoot = path.join(
			shardRoot,
			`verification-repair-${parentIdentity.verificationSha256.slice(0, 12)}-attempt-01`
		);
		mkdirSync(parentAttemptRoot, { recursive: true });
		writeCompletedAttemptPolicyEvidence(parentAttemptRoot, parentIdentity);
		const snapshotRoot = path.join(
			shardRoot,
			`verification-repair-${identity.verificationSha256.slice(0, 12)}`
		);
		mkdirSync(snapshotRoot, { recursive: true });
		writeFileSync(
			path.join(snapshotRoot, 'verification-summary.json'),
			`${stableStringify(verificationSummary)}\n`
		);
		const freshAttemptRoot = path.join(
			shardRoot,
			`verification-repair-${identity.verificationSha256.slice(0, 12)}-attempt-01`
		);
		mkdirSync(freshAttemptRoot, { recursive: true });
		writeCompletedAttemptPolicyEvidence(freshAttemptRoot, identity, authority);
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixture.root, identity.objectiveId);
		assert.deepEqual(
			importExistingVerificationRepairExecutionAttempts({
				ledgerRoot,
				identity,
				outputRoot: fixture.successorRoot
			}),
			[{ shardId: 'science-001', attempt: 1 }]
		);
		assert.equal(
			inspectVerificationRepairExecutionAttempts({
				ledgerRoot,
				identity,
				shardId: 'science-001'
			}).attempts.length,
			1
		);

		const validationPath = path.join(freshAttemptRoot, 'validation.json');
		const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
		validation.verificationRepairAuthoritySha256 = 'f'.repeat(64);
		writeFileSync(validationPath, `${stableStringify(validation)}\n`);
		assert.throws(
			() =>
				importExistingVerificationRepairExecutionAttempts({
					ledgerRoot,
					identity,
					outputRoot: fixture.successorRoot
				}),
			/authority hash|typed authority differs/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('recovery commit is write-free in dry-run mode', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		writePreModelRoot(fixture.preModelRoot);
		const localAttempt = path.join(
			fixture.successorRoot,
			'shards/science-001/verification-repair-bbbbbbbbbbbb-attempt-01'
		);
		mkdirSync(localAttempt, { recursive: true });
		writeCompletedAttemptPolicyEvidence(localAttempt, identity);
		const manifest = buildManifest(fixture, identity);
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixture.root, identity.objectiveId);
		const result = commitVerificationRepairRecovery({
			ledgerRoot,
			identity,
			manifest,
			successorRoot: fixture.successorRoot,
			outputPath: path.join(fixture.planRoot, 'requested/recovery.json'),
			dryRun: true
		});
		assert.equal(result.status, 'planned');
		assert.deepEqual(result.importedAttempts, [{ shardId: 'science-001', attempt: 1 }]);
		assert.equal(existsSync(ledgerRoot), false);
		assert.equal(existsSync(path.join(fixture.planRoot, 'requested')), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('two-predecessor recovery replays atomically after optional output fails post-claim', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		const secondRoot = path.join(fixture.planRoot, 'second-failed-root');
		writePreModelRoot(fixture.preModelRoot);
		writePreModelRoot(secondRoot);
		for (let attempt = 1; attempt <= 2; attempt += 1) {
			const attemptRoot = path.join(
				fixture.successorRoot,
				'shards/science-001',
				`verification-repair-bbbbbbbbbbbb-attempt-${String(attempt).padStart(2, '0')}`
			);
			mkdirSync(attemptRoot, { recursive: true });
			writeCompletedAttemptPolicyEvidence(attemptRoot, identity);
		}
		const manifest = buildManifest(fixture, identity, [fixture.preModelRoot, secondRoot]);
		const ledgerRoot = verificationRepairExecutionLedgerRoot(fixture.root, identity.objectiveId);
		const blockedParent = path.join(fixture.planRoot, 'blocked-output-parent');
		const outputPath = path.join(blockedParent, 'recovery.json');
		writeFileSync(blockedParent, 'not a directory');
		assert.throws(
			() =>
				commitVerificationRepairRecovery({
					ledgerRoot,
					identity,
					manifest,
					successorRoot: fixture.successorRoot,
					outputPath
				}),
			/ENOTDIR|EEXIST|not a directory|file already exists/
		);
		assert.deepEqual(
			inspectVerificationRepairExecutionAttempts({
				ledgerRoot,
				identity,
				shardId: 'science-001'
			}).attempts.map((record) => record.attempt),
			[1, 2]
		);
		assert.equal(existsSync(path.join(ledgerRoot, 'recovery-manifest.json')), true);
		assert.equal(existsSync(path.join(ledgerRoot, 'recovery.json')), true);
		const transactionPath = path.join(
			ledgerRoot,
			'recovery-transactions',
			`${identity.executionId}.json`
		);
		assert.equal(JSON.parse(readFileSync(transactionPath, 'utf8')).status, 'preparing');

		rmSync(blockedParent);
		mkdirSync(blockedParent);
		const replay = commitVerificationRepairRecovery({
			ledgerRoot,
			identity,
			manifest,
			successorRoot: fixture.successorRoot,
			outputPath
		});
		assert.equal(replay.status, 'committed');
		assert.equal(replay.replay, true);
		assert.equal(JSON.parse(readFileSync(transactionPath, 'utf8')).status, 'committed');
		assert.equal(
			canonicalHash(JSON.parse(readFileSync(outputPath, 'utf8'))),
			canonicalHash(manifest)
		);
		assert.deepEqual(
			inspectVerificationRepairExecutionAttempts({
				ledgerRoot,
				identity,
				shardId: 'science-001'
			}).attempts.map((record) => record.attempt),
			[1, 2]
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('execution identity separates policy while objective identity stays stable', () => {
	const original = makeIdentity();
	for (const [field, value] of [
		['model', 'another-model'],
		['transport', 'codex-sdk'],
		['responseMode', 'structured-json'],
		['thinkingLevel', 'max'],
		['directPartSize', 4]
	]) {
		const changed = scienceChallengeVerificationRepairExecutionIdentity({
			...original,
			[field]: value
		});
		assert.notEqual(changed.executionId, original.executionId, field);
		assert.equal(changed.objectiveId, original.objectiveId, field);
		assert.throws(
			() =>
				requireMatchingVerificationRepairExecutionIdentity({
					expected: original,
					actual: changed,
					label: 'Materialized execution identity'
				}),
			/Materialized execution identity differs from its immutable recovery binding/,
			field
		);
	}
	assert.equal(
		requireMatchingVerificationRepairExecutionIdentity({
			expected: original,
			actual: structuredClone(original)
		}).executionId,
		original.executionId
	);
});

function makeTypedReviewRebaseSummaryFields({
	planSha256,
	candidateSetSha256,
	rejectedIds,
	collectionTargetIds
}) {
	const ids = [...new Set([...rejectedIds, ...collectionTargetIds])].sort();
	const rejected = new Set(rejectedIds);
	const collectionRemediations = collectionTargetIds.map((preferredChallengeId, index) => ({
		issue: `Frozen collection issue ${index + 1} for ${preferredChallengeId}.`,
		preferredChallengeId
	}));
	const targetIds = [...new Set(collectionTargetIds)].sort();
	return {
		planSha256,
		candidateSetSha256,
		status: 'failed',
		reviewCount: ids.length,
		acceptedCount: ids.length - rejected.size,
		rejectedCount: rejected.size,
		reviews: ids.map((id) => ({ id, accepted: !rejected.has(id) })),
		reviewRebaseManifestSha256: '1'.repeat(64),
		reviewRebaseId: '2'.repeat(64),
		reviewRebaseCandidateSetSha256: candidateSetSha256,
		reviewRebaseCollectionValidationSha256: '3'.repeat(64),
		reviewRebaseCollectionRemediationSetSha256: canonicalHash(collectionRemediations),
		reviewRebaseCollectionRemediations: collectionRemediations,
		reviewRebaseCollectionRemediationTargetIds: targetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
	};
}

function generationAuthorityBindings(authority) {
	const sourceOutputs = [
		{
			shardId: 'science-001',
			candidate: {
				path: 'tmp/review-rebase/shards/science-001/candidate.json',
				fileSha256: '4'.repeat(64),
				canonicalSha256: '5'.repeat(64)
			},
			validation: {
				path: 'tmp/review-rebase/shards/science-001/validation.json',
				fileSha256: '6'.repeat(64),
				canonicalSha256: '7'.repeat(64)
			}
		}
	];
	return {
		reviewRebaseManifestSha256: authority.parent.manifestSha256,
		reviewRebaseId: authority.parent.rebaseId,
		reviewRebaseCandidateSetSha256: authority.parent.candidateSetSha256,
		reviewRebaseCollectionValidationSha256: authority.parent.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256: authority.parent.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediations: authority.collectionRemediations,
		reviewRebaseCollectionRemediationTargetIds: authority.collectionRemediationTargetIds,
		reviewRebaseCollectionRemediationTargetSetSha256:
			authority.parent.collectionRemediationTargetSetSha256,
		verificationRepairAuthority: authority,
		verificationRepairAuthoritySha256: canonicalHash(authority),
		verificationRepairParent: {
			schemaVersion: 'science-challenge-review-rebase-repair-parent/v1',
			reviewRebaseManifestPath: 'tmp/review-rebase/manifest.json',
			reviewRebaseManifestSha256: authority.parent.manifestSha256,
			reviewRebaseId: authority.parent.rebaseId,
			basePlanSha256: authority.parent.planSha256,
			planSha256: authority.parent.planSha256,
			sourceSnapshotSha256: '8'.repeat(64),
			curriculumEvidenceSha256: '9'.repeat(64),
			candidateSetSha256: authority.parent.candidateSetSha256,
			collectionValidationSha256: authority.parent.collectionValidationSha256,
			collectionRemediationSetSha256: authority.parent.collectionRemediationSetSha256,
			collectionRemediations: authority.collectionRemediations,
			collectionRemediationTargetIds: authority.collectionRemediationTargetIds,
			collectionRemediationTargetSetSha256: authority.collectionRemediationTargetSetSha256,
			verificationSummaryPath: 'tmp/verification/summary.json',
			verificationSummarySha256: authority.parent.verificationSha256,
			verificationAssignmentIndexPath: 'tmp/verification/assignment-index.json',
			verificationAssignmentIndexSha256: 'a'.repeat(64),
			verificationRepairAuthority: authority,
			verificationRepairAuthoritySha256: canonicalHash(authority),
			mutableChallengeIds: authority.mutableChallengeIds,
			mutableChallengeSetSha256: authority.mutableChallengeSetSha256,
			sourceOutputs,
			sourceOutputSetSha256: canonicalHash(sourceOutputs)
		},
		verificationRepairMutableChallengeIds: authority.mutableChallengeIds,
		verificationRepairMutableChallengeSetSha256: authority.mutableChallengeSetSha256
	};
}

function makeFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'science-repair-lineage-'));
	const planRoot = path.join(root, 'science-500-v1');
	const planPath = path.join(planRoot, 'plan.json');
	const preModelRoot = path.join(planRoot, 'failed-root');
	const successorRoot = path.join(planRoot, 'successor-root');
	mkdirSync(preModelRoot, { recursive: true });
	mkdirSync(successorRoot, { recursive: true });
	writeFileSync(planPath, '{}\n');
	writeCandidate(successorRoot);
	return { root, planRoot, planPath, preModelRoot, successorRoot };
}

function makeIdentity(overrides = {}) {
	return scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: hashes.plan,
		verificationSha256: hashes.verification,
		priorCandidateSetSha256: hashes.candidates,
		model: 'chatgpt-gpt-5.6-sol',
		transport: 'llm-direct',
		responseMode: 'prompt-json',
		thinkingLevel: 'high',
		directPartSize: 2,
		...overrides
	});
}

function makePreflight(identity) {
	return {
		schemaVersion: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_SCHEMA,
		status: 'passed',
		token: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN,
		transport: identity.transport,
		authMode: 'configured-proxy',
		responseMode: identity.responseMode,
		provider: 'chatgpt',
		model: identity.model,
		modelVersion: null,
		thinkingLevel: identity.thinkingLevel,
		durationMilliseconds: 1
	};
}

function buildManifest(fixture, identity, preModelRoots = [fixture.preModelRoot]) {
	return buildVerificationRepairRecoveryManifest({
		planPath: fixture.planPath,
		planSha256: identity.planSha256,
		verificationSha256: identity.verificationSha256,
		priorCandidateSetSha256: identity.priorCandidateSetSha256,
		identity,
		preModelRoots,
		successorRoot: fixture.successorRoot,
		preflight: makePreflight(identity)
	});
}

function writeCandidate(root, shardId = 'science-001') {
	const shardRoot = path.join(root, 'shards', shardId);
	mkdirSync(shardRoot, { recursive: true });
	writeFileSync(
		path.join(shardRoot, 'candidate.json'),
		`${stableStringify({ challenges: [{ definition: { id: `${shardId}-challenge-001` } }] })}\n`
	);
}

function makeValidationOnlyIdentity() {
	const verificationSummary = {
		planSha256: hashes.plan,
		candidateSetSha256: hashes.candidates,
		review: 'validation-only-pre-dispatch-fixture'
	};
	return scienceChallengeVerificationRepairExecutionIdentity({
		...makeIdentity(),
		verificationSha256: canonicalHash(verificationSummary)
	});
}

function writeValidationOnlyPreDispatchRoot(
	root,
	identity,
	{ includeConflict = true, mutateValidation = () => {}, addArtifact = () => {} } = {}
) {
	writeCandidate(root);
	const shardId = 'science-001';
	const shardRoot = path.join(root, 'shards', shardId);
	const runId = identity.verificationSha256.slice(0, 12);
	const verificationSummary = {
		planSha256: identity.planSha256,
		candidateSetSha256: identity.priorCandidateSetSha256,
		review: 'validation-only-pre-dispatch-fixture'
	};
	assert.equal(canonicalHash(verificationSummary), identity.verificationSha256);
	const priorCandidate = JSON.parse(readFileSync(path.join(shardRoot, 'candidate.json'), 'utf8'));
	const priorCandidateSha256 = canonicalHash(priorCandidate);
	const inputs = Array.from({ length: 8 }, (_, index) => ({
		plan: {
			id: `${shardId}-challenge-${String(index + 1).padStart(3, '0')}`,
			shard: shardId
		}
	}));
	const inputSha256 = canonicalHash({
		promptVersion: 'science-challenge-authoring-v3',
		inputs,
		priorCandidateSha256,
		verificationSummarySha256: identity.verificationSha256
	});
	const snapshotRoot = path.join(shardRoot, `verification-repair-${runId}`);
	mkdirSync(snapshotRoot, { recursive: true });
	for (const [name, value] of [
		['input.json', inputs],
		['prior-candidate.json', priorCandidate],
		['prior-validation.json', { status: 'passed', candidateSha256: priorCandidateSha256 }],
		['verification-summary.json', verificationSummary]
	]) {
		writeFileSync(path.join(snapshotRoot, name), `${stableStringify(value)}\n`);
	}
	if (includeConflict) {
		const conflictingRoot = path.join(shardRoot, 'verification-repair-000000000000-attempt-01');
		mkdirSync(conflictingRoot, { recursive: true });
		writeFileSync(
			path.join(conflictingRoot, 'validation.json'),
			`${stableStringify({ status: 'failed', priorObjective: true })}\n`
		);
	}
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		const attemptRoot = path.join(
			shardRoot,
			`verification-repair-${runId}-attempt-${String(attempt).padStart(2, '0')}`
		);
		mkdirSync(attemptRoot, { recursive: true });
		const transportError = `Authoring transport failed: ${shardId} contains an unrelated verification-repair attempt.`;
		const validation = {
			status: 'failed',
			issues: [
				transportError,
				'schemaVersion must be science-challenge-batch/v1.',
				'Batch must contain exactly 8 challenges.',
				'Authoring run did not persist run-summary.json evidence.'
			],
			inputSha256,
			verificationRepairSha256: identity.verificationSha256,
			verificationRepairCohortIssues: [],
			priorCandidateSha256,
			rawCandidateSha256: null,
			candidateSha256: null,
			normalizationVersion: 'science-challenge-output-normalization/v1',
			promptVersion: 'science-challenge-authoring-v3',
			promptSha256: 'd'.repeat(64),
			runSummarySha256: null,
			transport: identity.transport,
			transportVersion: null,
			provider: 'chatgpt',
			model: identity.model,
			modelVersion: null,
			modelVersions: null,
			directPartSize: null,
			thinkingLevel: identity.thinkingLevel,
			transportError
		};
		mutateValidation(validation, { attempt, attemptRoot });
		writeFileSync(path.join(attemptRoot, 'validation.json'), `${stableStringify(validation)}\n`);
		addArtifact({ attempt, attemptRoot, validation });
	}
}

function writePreModelRoot(
	root,
	mutate = () => {},
	{
		responseJsonSchema,
		identity = makeIdentity(),
		verificationSummary = null,
		verificationRepairAuthority = null
	} = {}
) {
	writeCandidate(root);
	if (verificationSummary) {
		const snapshotRoot = path.join(
			root,
			'shards',
			'science-001',
			`verification-repair-${identity.verificationSha256.slice(0, 12)}`
		);
		mkdirSync(snapshotRoot, { recursive: true });
		writeFileSync(
			path.join(snapshotRoot, 'verification-summary.json'),
			`${stableStringify(verificationSummary)}\n`
		);
	}
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		const attemptRoot = path.join(
			root,
			'shards',
			'science-001',
			`verification-repair-${identity.verificationSha256.slice(0, 12)}-attempt-${String(
				attempt
			).padStart(2, '0')}`
		);
		mkdirSync(attemptRoot, { recursive: true });
		const request = {
			model: 'chatgpt-gpt-5.6-sol',
			thinkingLevel: 'high',
			tools: [],
			...(responseJsonSchema === undefined
				? {}
				: { responseJsonSchema: structuredClone(responseJsonSchema) })
		};
		const requestBytes = Buffer.from(`${stableStringify(request)}\n`);
		writeFileSync(path.join(attemptRoot, 'request.json'), requestBytes);
		for (const file of [
			'events.jsonl',
			'last-message.json',
			'thoughts.txt',
			'result-metadata.json'
		]) {
			writeFileSync(path.join(attemptRoot, file), '');
		}
		const summary = {
			status: 'failed',
			error: 'fetch failed: getaddrinfo ENOTFOUND api.openai.com',
			transport: 'llm-direct',
			authMode: 'configured-proxy',
			provider: null,
			model: request.model,
			modelVersion: null,
			thinkingLevel: request.thinkingLevel,
			blocked: null,
			usage: null,
			costUsd: null,
			commandActions: 0,
			failedCommandActions: 0,
			webSearches: 0,
			fileChanges: 0,
			toolCalls: 0,
			hostedTools: 0,
			events: 0,
			responseDeltas: 0,
			thoughtDeltas: 0,
			modelEvents: 0,
			usageEvents: 0,
			finalJsonEvents: 0,
			threadId: null,
			requestSha256: sha256(requestBytes),
			requestCanonicalSha256: canonicalHash(request),
			eventLogSha256: emptySha256,
			finalResponseSha256: emptySha256,
			lastMessageFileSha256: emptySha256,
			thoughtsSha256: emptySha256,
			resultMetadataSha256: null,
			...(responseJsonSchema === undefined
				? {}
				: {
						responseSchemaSha256: canonicalHash(responseJsonSchema),
						inputEvidence: {
							responseSchemaSha256: canonicalHash(responseJsonSchema)
						}
					}),
			parts: []
		};
		mutate({ summary, attemptRoot, attempt, request });
		writeFileSync(path.join(attemptRoot, 'run-summary.json'), `${stableStringify(summary)}\n`);
		writeFileSync(
			path.join(attemptRoot, 'validation.json'),
			`${stableStringify({
				status: 'failed',
				verificationRepairSha256: identity.verificationSha256,
				runSummarySha256: canonicalHash(summary),
				candidateSha256: null,
				rawCandidateSha256: null,
				...(verificationRepairAuthority
					? {
							verificationRepairAuthority,
							verificationRepairAuthoritySha256: canonicalHash(verificationRepairAuthority)
						}
					: {})
			})}\n`
		);
	}
}

function writeMultipartPreModelRoot(root, mutatePart = () => {}) {
	writeCandidate(root);
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		const attemptRoot = path.join(
			root,
			'shards',
			'science-001',
			`verification-repair-bbbbbbbbbbbb-attempt-${String(attempt).padStart(2, '0')}`
		);
		const partRoot = path.join(attemptRoot, 'parts', 'part-01');
		mkdirSync(partRoot, { recursive: true });
		const promptBytes = Buffer.from('Author the fixture response.\n');
		const request = {
			model: 'chatgpt-gpt-5.6-sol',
			thinkingLevel: 'high',
			tools: [],
			localResponseSchemaSha256
		};
		const partSummary = {
			status: 'failed',
			error: 'fetch failed',
			transport: 'llm-direct',
			authMode: 'configured-proxy',
			provider: null,
			model: request.model,
			modelVersion: null,
			thinkingLevel: request.thinkingLevel,
			blocked: null,
			usage: null,
			costUsd: null,
			commandActions: 0,
			failedCommandActions: 0,
			webSearches: 0,
			fileChanges: 0,
			toolCalls: 0,
			hostedTools: 0,
			events: 0,
			responseDeltas: 0,
			thoughtDeltas: 0,
			modelEvents: 0,
			usageEvents: 0,
			finalJsonEvents: 0,
			requestSha256: null,
			requestCanonicalSha256: null,
			responseSchemaSha256: localResponseSchemaSha256,
			localResponseSchemaSha256,
			inputEvidence: {
				responseSchemaSha256: localResponseSchemaSha256
			},
			eventLogSha256: emptySha256,
			finalResponseSha256: emptySha256,
			lastMessageFileSha256: emptySha256,
			thoughtsSha256: emptySha256,
			resultMetadataSha256: null,
			parts: []
		};
		mutatePart({ summary: partSummary, request, attempt, attemptRoot, partRoot });
		const requestBytes = Buffer.from(`${stableStringify(request)}\n`);
		partSummary.requestSha256 = sha256(requestBytes);
		partSummary.requestCanonicalSha256 = canonicalHash(request);
		writeFileSync(path.join(partRoot, 'prompt.txt'), promptBytes);
		writeFileSync(path.join(partRoot, 'request.json'), requestBytes);
		for (const name of [
			'events.jsonl',
			'last-message.json',
			'thoughts.txt',
			'result-metadata.json'
		]) {
			writeFileSync(path.join(partRoot, name), '');
		}
		writeFileSync(path.join(partRoot, 'run-summary.json'), `${stableStringify(partSummary)}\n`);
		const partRecord = {
			partId: 'part-01',
			index: 1,
			start: 0,
			end: 1,
			rowIds: ['challenge-001'],
			inputSha256: canonicalHash({ attempt }),
			responseSchemaSha256: localResponseSchemaSha256,
			promptPath: 'parts/part-01/prompt.txt',
			promptSha256: sha256(promptBytes),
			requestPath: 'parts/part-01/request.json',
			requestSha256: sha256(requestBytes),
			eventLogPath: 'parts/part-01/events.jsonl',
			eventLogSha256: emptySha256,
			rawOutputPath: 'parts/part-01/last-message.json',
			rawOutputSha256: emptySha256,
			rawCandidateSha256: null,
			thoughtsPath: 'parts/part-01/thoughts.txt',
			thoughtsSha256: emptySha256,
			resultMetadataPath: 'parts/part-01/result-metadata.json',
			resultMetadataSha256: emptySha256,
			runSummaryPath: 'parts/part-01/run-summary.json',
			runSummarySha256: canonicalHash(partSummary),
			status: 'failed',
			provider: null,
			model: request.model,
			modelVersion: null,
			thinkingLevel: request.thinkingLevel,
			costUsd: null,
			usage: null
		};
		const eventBytes = Buffer.from(
			`${JSON.stringify({
				type: 'part.finished',
				partId: 'part-01',
				status: 'failed',
				rawOutputSha256: emptySha256,
				runSummarySha256: partRecord.runSummarySha256
			})}\n`
		);
		writeFileSync(path.join(attemptRoot, 'events.jsonl'), eventBytes);
		writeFileSync(path.join(attemptRoot, 'last-message.json'), '');
		const summary = {
			status: 'failed',
			error: 'fetch failed',
			transport: 'llm-direct',
			authMode: 'configured-proxy',
			provider: 'chatgpt',
			model: request.model,
			modelVersion: null,
			modelVersions: [],
			thinkingLevel: request.thinkingLevel,
			blocked: null,
			usage: {},
			costUsd: 0,
			commandActions: 0,
			failedCommandActions: 0,
			webSearches: 0,
			fileChanges: 0,
			toolCalls: 0,
			hostedTools: 0,
			eventLogSha256: sha256(eventBytes),
			finalResponseSha256: emptySha256,
			lastMessageFileSha256: emptySha256,
			mergedCandidateSha256: null,
			mergedResponseSchemaSha256: canonicalHash({ challenges: [localResponseSchemaSha256] }),
			parts: [partRecord]
		};
		summary.partsSha256 = canonicalHash(summary.parts);
		writeFileSync(path.join(attemptRoot, 'run-summary.json'), `${stableStringify(summary)}\n`);
		writeFileSync(
			path.join(attemptRoot, 'validation.json'),
			`${stableStringify({
				status: 'failed',
				verificationRepairSha256: hashes.verification,
				runSummarySha256: canonicalHash(summary),
				candidateSha256: null,
				rawCandidateSha256: null
			})}\n`
		);
	}
}

function writeCodexPreModelRoot(root, error) {
	writeCandidate(root);
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		const attemptRoot = path.join(
			root,
			'shards',
			'science-001',
			`verification-repair-bbbbbbbbbbbb-attempt-${String(attempt).padStart(2, '0')}`
		);
		mkdirSync(attemptRoot, { recursive: true });
		writeFileSync(path.join(attemptRoot, 'events.jsonl'), '');
		writeFileSync(path.join(attemptRoot, 'last-message.json'), '');
		const summary = {
			status: 'failed',
			error,
			transport: 'codex-sdk',
			model: 'gpt-5.6-sol',
			thinkingLevel: 'max',
			usage: null,
			commandActions: 0,
			failedCommandActions: 0,
			failedCommands: [],
			webSearches: 0,
			fileChanges: 0,
			toolCalls: 0,
			agentMessages: 0,
			events: 0,
			reasoningSummaries: 0,
			threadId: null,
			eventLogSha256: emptySha256,
			finalResponseSha256: emptySha256,
			lastMessageFileSha256: emptySha256,
			parts: []
		};
		writeFileSync(path.join(attemptRoot, 'run-summary.json'), `${stableStringify(summary)}\n`);
		writeFileSync(
			path.join(attemptRoot, 'validation.json'),
			`${stableStringify({
				status: 'failed',
				verificationRepairSha256: hashes.verification,
				runSummarySha256: canonicalHash(summary),
				candidateSha256: null,
				rawCandidateSha256: null
			})}\n`
		);
	}
}

function writeCompletedAttemptPolicyEvidence(
	attemptRoot,
	identity,
	verificationRepairAuthority = null
) {
	const summary = {
		status: 'failed',
		transport: identity.transport,
		transportVersion:
			identity.responseMode === 'prompt-json'
				? 'science-challenge-llm-direct-prompt-json-multipart/v1'
				: 'science-challenge-llm-direct-json-multipart/v1',
		responseMode: identity.responseMode,
		model: identity.model,
		thinkingLevel: identity.thinkingLevel,
		partSize: identity.directPartSize
	};
	writeFileSync(path.join(attemptRoot, 'run-summary.json'), `${stableStringify(summary)}\n`);
	writeFileSync(
		path.join(attemptRoot, 'validation.json'),
		`${stableStringify({
			status: 'failed',
			verificationRepairSha256: identity.verificationSha256,
			runSummarySha256: canonicalHash(summary),
			transport: identity.transport,
			transportVersion: summary.transportVersion,
			responseMode: identity.responseMode,
			model: identity.model,
			thinkingLevel: identity.thinkingLevel,
			directPartSize: identity.directPartSize,
			...(verificationRepairAuthority
				? {
						verificationRepairAuthority,
						verificationRepairAuthoritySha256: canonicalHash(verificationRepairAuthority)
					}
				: {})
		})}\n`
	);
}

function makeRecoveryReviewContextFixture({ ordinary = false, omitCurriculumInput = false } = {}) {
	const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'science-recovery-review-context-'));
	const verificationRoot = path.join(workspaceRoot, 'verification');
	mkdirSync(verificationRoot, { recursive: true });
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-recovery-review-context',
		rows: [{ id: 'base-row', difficulty: 'starter' }]
	};
	const plan = {
		...basePlan,
		rows: [{ id: 'base-row', difficulty: 'standard' }]
	};
	const typedInput = {
		basePlan,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlan: plan,
		effectivePlanSha256: canonicalHash(plan)
	};
	const curriculumInput = {
		...structuredClone(typedInput),
		schemaVersion: 'science-challenge-curriculum-remap-verifier-input/v1'
	};
	let difficultyInput = {
		...structuredClone(typedInput),
		schemaVersion: 'science-challenge-difficulty-plan-adjustment-verifier-input/v1'
	};
	const verification = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		...(ordinary
			? {}
			: {
					basePlanSha256: canonicalHash(basePlan),
					effectivePlanSha256: canonicalHash(plan),
					curriculumRemapVerifierInputSha256: canonicalHash(curriculumInput),
					difficultyPlanAdjustmentVerifierInputSha256: canonicalHash(difficultyInput)
				})
	};
	const verificationPath = path.join(verificationRoot, 'summary.json');
	const curriculumInputPath = path.join(verificationRoot, 'curriculum-remap-verifier-input.json');
	const difficultyInputPath = path.join(
		verificationRoot,
		'difficulty-plan-adjustment-verifier-input.json'
	);
	writeReviewContextJson(verificationPath, verification);
	if (!omitCurriculumInput) writeReviewContextJson(curriculumInputPath, curriculumInput);
	writeReviewContextJson(difficultyInputPath, difficultyInput);
	return {
		workspaceRoot,
		verificationPath,
		plan,
		verification,
		basePlan,
		curriculumInput,
		difficultyInput,
		curriculumInputPath,
		difficultyInputPath
	};
}

function writeReviewContextJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}
