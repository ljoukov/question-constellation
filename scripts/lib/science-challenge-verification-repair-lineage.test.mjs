import assert from 'node:assert/strict';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';
import { buildScienceChallengeVerificationRepairAuthority } from './science-challenge-verification-repair-transaction.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA,
	bindVerificationRepairExecutionMarker,
	claimVerificationRepairAttemptPair,
	initializeVerificationRepairExecutionLedger,
	inspectVerificationRepairExecutionAttempts,
	inspectVerificationRepairGenerationEvidence,
	readVerificationRepairExecutionMarker,
	reconcileVerificationRepairAttemptTransactions,
	requireMatchingVerificationRepairAttemptLedgers,
	requireMatchingVerificationRepairExecutionIdentity,
	scienceChallengeVerificationRepairExecutionIdentity,
	verificationRepairExecutionLedgerRoot
} from './science-challenge-verification-repair-lineage.mjs';

const hashes = {
	plan: canonicalHash({}),
	verification: 'b'.repeat(64),
	candidates: 'c'.repeat(64)
};

test('execution identity separates invocation policy from the stable repair objective', () => {
	const original = makeIdentity();
	for (const [field, value] of [
		['model', 'chatgpt-gpt-5.6-sol-new-snapshot'],
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
			/immutable execution identity/,
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

test('one objective ledger enforces a four-attempt cap across invocation policies', () => {
	const fixture = makeFixture();
	try {
		const firstPolicy = makeIdentity();
		const secondPolicy = makeIdentity({
			model: 'chatgpt-gpt-5.6-sol-new-snapshot',
			thinkingLevel: 'max',
			directPartSize: 7
		});
		const ledgerRoot = verificationRepairExecutionLedgerRoot(
			fixture.root,
			firstPolicy.objectiveId
		);
		for (let attempt = 1; attempt <= 4; attempt += 1) {
			claimVerificationRepairAttemptPair({
				ledgerRoot,
				identity: attempt % 2 === 1 ? firstPolicy : secondPolicy,
				shardId: 'science-001',
				attempt,
				outputRoot: fixture.outputRoot
			});
		}
		const global = inspectVerificationRepairExecutionAttempts({
			ledgerRoot,
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
		assert.equal(global.exhausted, true);
		assert.throws(
			() =>
				claimVerificationRepairAttemptPair({
					ledgerRoot,
					identity: firstPolicy,
					shardId: 'science-001',
					attempt: 5,
					outputRoot: fixture.outputRoot
				}),
			/budget is exhausted/
		);

		const otherOutputRoot = path.join(fixture.root, 'other-output');
		mkdirSync(otherOutputRoot);
		assert.throws(
			() =>
				requireMatchingVerificationRepairAttemptLedgers({
					localAttempts: global.attempts.map(({ attempt }) => ({ attempt })),
					globalAttempts: global.attempts,
					shardId: 'science-001',
					outputRoot: otherOutputRoot
				}),
			/belongs to another output root/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('the execution marker binds one policy to a portable worktree-relative output root', () => {
	const fixture = makeFixture();
	const outsideRoot = mkdtempSync(path.join(tmpdir(), 'science-repair-marker-outside-'));
	try {
		const identity = makeIdentity();
		const ledgerRoot = verificationRepairExecutionLedgerRoot(
			fixture.root,
			identity.objectiveId
		);
		const first = bindVerificationRepairExecutionMarker({
			workspaceRoot: fixture.root,
			ledgerRoot,
			identity,
			outputRoot: fixture.outputRoot
		});
		const replay = bindVerificationRepairExecutionMarker({
			workspaceRoot: fixture.root,
			ledgerRoot,
			identity,
			outputRoot: fixture.outputRoot
		});
		assert.deepEqual(replay, first);
		assert.equal(
			first.marker.schemaVersion,
			SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA
		);
		assert.equal(first.marker.executionIdentitySha256, canonicalHash(identity));
		assert.equal(first.marker.outputRootRelativePath, 'generation-output');
		assert.equal(path.isAbsolute(first.marker.outputRootRelativePath), false);
		assert.equal(readFileSync(first.markerPath, 'utf8').includes(fixture.root), false);
		assert.deepEqual(
			readVerificationRepairExecutionMarker({
				workspaceRoot: fixture.root,
				ledgerRoot,
				identity
			}),
			first
		);

		const competingRoot = path.join(fixture.root, 'competing-output');
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

test('execution marker replay rejects noncanonical and identity-tampered bytes', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		const ledgerRoot = verificationRepairExecutionLedgerRoot(
			fixture.root,
			identity.objectiveId
		);
		const bound = bindVerificationRepairExecutionMarker({
			workspaceRoot: fixture.root,
			ledgerRoot,
			identity,
			outputRoot: fixture.outputRoot
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
			`${stableStringify({ ...bound.marker, executionId: 'f'.repeat(64) })}\n`
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

test('a preparing paired-attempt transaction reconciles both ledgers after interruption', () => {
	const fixture = makeFixture();
	try {
		const identity = makeIdentity();
		const ledgerRoot = verificationRepairExecutionLedgerRoot(
			fixture.root,
			identity.objectiveId
		);
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
				outputRootPath: path.resolve(fixture.outputRoot),
				outputRootSha256: canonicalHash(path.resolve(fixture.outputRoot))
			})}\n`
		);
		assert.deepEqual(
			reconcileVerificationRepairAttemptTransactions({
				ledgerRoot,
				identity,
				outputRoot: fixture.outputRoot
			}),
			[{ shardId: 'science-001', attempt: 1 }]
		);
		assert.equal(JSON.parse(readFileSync(transactionPath, 'utf8')).status, 'committed');
		assert.equal(
			inspectVerificationRepairExecutionAttempts({
				ledgerRoot,
				identity,
				shardId: 'science-001'
			}).attempts.length,
			1
		);
		assert.equal(
			existsSync(
				path.join(
					fixture.outputRoot,
					'shards/science-001',
					`verification-repair-${identity.verificationSha256.slice(0, 12)}-attempt-01`
				)
			),
			true
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('generation evidence requires a committed objective-bound summary', () => {
	const fixture = makeFixture();
	try {
		assert.deepEqual(
			inspectVerificationRepairGenerationEvidence({
				generationRoot: fixture.outputRoot
			}),
			{
				required: false,
				identity: null,
				objectiveId: null,
				verificationRepairAuthority: null,
				summaryPaths: [],
				repairArtifacts: []
			}
		);
		const repairArtifact = path.join(
			fixture.outputRoot,
			'shards/science-001/verification-repair-bbbbbbbbbbbb-attempt-01'
		);
		mkdirSync(repairArtifact, { recursive: true });
		assert.throws(
			() =>
				inspectVerificationRepairGenerationEvidence({
					generationRoot: fixture.outputRoot
				}),
			/no objective-bound generation summary/
		);

		const identity = makeIdentity();
		writeGenerationSummary(fixture.outputRoot, identity, {
			status: 'passed',
			publication: { journal: { status: 'committed' } }
		});
		const inspected = inspectVerificationRepairGenerationEvidence({
			generationRoot: fixture.outputRoot
		});
		assert.equal(inspected.required, true);
		assert.equal(inspected.objectiveId, identity.objectiveId);
		assert.equal(inspected.repairArtifacts.length, 1);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('generation evidence authenticates the complete typed review-rebase authority', () => {
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
		const summaryPath = writeGenerationSummary(fixture.outputRoot, identity, {
			status: 'passed',
			publication: { journal: { status: 'committed' } },
			...generationAuthorityBindings(authority)
		});
		const inspected = inspectVerificationRepairGenerationEvidence({
			generationRoot: fixture.outputRoot
		});
		assert.deepEqual(inspected.verificationRepairAuthority, authority);

		const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
		summary.verificationRepairMutableChallengeIds = ['challenge-rejected'];
		writeFileSync(summaryPath, `${stableStringify(summary)}\n`);
		assert.throws(
			() =>
				inspectVerificationRepairGenerationEvidence({
					generationRoot: fixture.outputRoot
				}),
			/MutableChallengeIds differs|mutable.*differs/i
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('generation evidence selects the terminal identity from a bound effective-cohort chain', () => {
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
			fixture.outputRoot,
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
					path: path.relative(fixture.outputRoot, firstManifestPath),
					sha256: sha256(firstManifestBytes),
					canonicalSha256: canonicalHash(firstManifest)
				},
				manifestCanonicalSha256: canonicalHash(firstManifest),
				candidateSetSha256: firstCandidateSetSha256
			}
		};
		const secondDirectory = path.join(
			fixture.outputRoot,
			`verification-repair-${second.verificationSha256.slice(0, 12)}-effective-cohort`
		);
		mkdirSync(secondDirectory, { recursive: true });
		const secondManifestPath = path.join(secondDirectory, 'manifest.json');
		writeFileSync(secondManifestPath, `${stableStringify(secondManifest)}\n`);

		for (const [identity, manifest] of [
			[first, firstManifest],
			[second, secondManifest]
		]) {
			writeGenerationSummary(fixture.outputRoot, identity, {
				status: 'review-pending',
				publication: null,
				reviewPendingCount: 1,
				effectiveCohort: {
					manifestSha256: canonicalHash(manifest),
					candidateSetSha256: manifest.candidateSetSha256
				}
			});
		}
		const inspected = inspectVerificationRepairGenerationEvidence({
			generationRoot: fixture.outputRoot,
			terminalEffectiveCohortManifestPath: secondManifestPath
		});
		assert.equal(inspected.objectiveId, second.objectiveId);
		assert.equal(inspected.identity.executionId, second.executionId);
		assert.equal(inspected.summaryPaths.length, 2);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

function makeFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'science-repair-lineage-'));
	const outputRoot = path.join(root, 'generation-output');
	mkdirSync(outputRoot, { recursive: true });
	return { root, outputRoot };
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

function writeGenerationSummary(outputRoot, identity, fields) {
	const summaryPath = path.join(
		outputRoot,
		`verification-repair-${identity.verificationSha256.slice(0, 12)}-summary.json`
	);
	writeFileSync(
		summaryPath,
		`${stableStringify({
			schemaVersion: 'science-challenge-generation-summary/v1',
			planSha256: identity.planSha256,
			verificationRepairSha256: identity.verificationSha256,
			verificationRepairExecutionIdentity: identity,
			...fields
		})}\n`
	);
	return summaryPath;
}

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
			collectionRemediationTargetSetSha256:
				authority.parent.collectionRemediationTargetSetSha256,
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
