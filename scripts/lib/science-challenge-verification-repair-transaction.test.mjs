import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scienceChallengeEffectiveCohortDirectory } from './science-challenge-effective-cohort.mjs';
import { canonicalHash, stableStringify } from './science-challenge-release.mjs';
import { evaluateScienceChallengeVerificationRepairOverlay } from './science-challenge-verification-repair-overlay.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_AUTHORITY_SCHEMA,
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_COHORT_SCHEMA,
	buildScienceChallengeVerificationRepairAuthority,
	claimVerificationRepairAttempt,
	inspectVerificationRepairAttempts,
	invalidatedVerificationRepairAttempts,
	planVerificationRepairResume,
	publishVerificationRepairCohort,
	readVerificationRepairCohortState,
	readVerificationRepairPublication,
	recordVerificationRepairCollectionFailure,
	recordVerificationRepairCollectionPass,
	recoverVerificationRepairPublication,
	requireCompleteVerificationRepairCohort,
	validateScienceChallengeVerificationRepairAuthority,
	validateVerificationRepairCandidate,
	validateVerificationRepairCollectionTargets,
	verificationRepairTransactionRoot
} from './science-challenge-verification-repair-transaction.mjs';

const repairSha256 = 'a'.repeat(64);

test('verification-repair attempt evidence is monotonic, immutable and capped at four', () => {
	const root = temporaryRoot();
	const shardDir = path.join(root, 'shards', 'science-001');
	try {
		for (let attempt = 1; attempt <= 4; attempt += 1) {
			const claimed = claimVerificationRepairAttempt({
				shardDir,
				repairSha256,
				attempt
			});
			writeFileSync(path.join(claimed.attemptDir, 'validation.json'), '{"status":"failed"}\n');
		}
		assert.deepEqual(
			inspectVerificationRepairAttempts({ shardDir, repairSha256 }).attempts.map(
				(row) => row.attempt
			),
			[1, 2, 3, 4]
		);
		assert.throws(
			() =>
				claimVerificationRepairAttempt({
					shardDir,
					repairSha256,
					attempt: 4
				}),
			/exhausted|immutable/
		);
		assert.throws(
			() =>
				claimVerificationRepairAttempt({
					shardDir,
					repairSha256,
					attempt: 5
				}),
			/exhausted|ceiling/
		);
		assert.equal(
			readFileSync(
				path.join(shardDir, 'verification-repair-aaaaaaaaaaaa-attempt-01', 'validation.json'),
				'utf8'
			),
			'{"status":"failed"}\n'
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('verification-repair attempt discovery rejects gaps and relabelled evidence', () => {
	const root = temporaryRoot();
	const shardDir = path.join(root, 'shards', 'science-001');
	try {
		mkdirSync(path.join(shardDir, 'verification-repair-aaaaaaaaaaaa-attempt-02'), {
			recursive: true
		});
		assert.throws(
			() => inspectVerificationRepairAttempts({ shardDir, repairSha256 }),
			/contiguous/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('partial cohort resume reuses a passed bound attempt and advances only the failed shard', () => {
	const passedLedger = {
		attempts: [{ attempt: 1, directory: 'attempt-01' }],
		nextAttempt: 2,
		exhausted: false
	};
	const failedLedger = structuredClone(passedLedger);
	let passedReads = 0;
	const passed = planVerificationRepairResume({
		attemptLedger: passedLedger,
		resume: true,
		readReusableAttempt: (record) => {
			passedReads += 1;
			return { candidateSha256: 'b'.repeat(64), attempt: record.attempt };
		}
	});
	const failed = planVerificationRepairResume({
		attemptLedger: failedLedger,
		resume: true,
		readReusableAttempt: () => null
	});
	assert.equal(passed.action, 'reuse');
	assert.equal(passed.reusable.candidateSha256, 'b'.repeat(64));
	assert.equal(passedReads, 1);
	assert.deepEqual(failed, { action: 'run', attempt: 2 });

	const cohortRejected = planVerificationRepairResume({
		attemptLedger: passedLedger,
		invalidatedAttempts: new Set([1]),
		resume: true,
		readReusableAttempt: () => {
			throw new Error('invalidated attempts must not be considered reusable');
		}
	});
	assert.deepEqual(cohortRejected, { action: 'run', attempt: 2 });
});

test('resume derives exhaustion from immutable attempts and never plans attempt five', () => {
	const staleLedger = {
		attempts: Array.from({ length: 4 }, (_, index) => ({
			attempt: index + 1,
			directory: `attempt-${String(index + 1).padStart(2, '0')}`
		})),
		nextAttempt: 5,
		exhausted: false
	};
	assert.deepEqual(
		planVerificationRepairResume({
			attemptLedger: staleLedger,
			invalidatedAttempts: new Set([1, 2, 3, 4]),
			resume: true,
			readReusableAttempt: () => {
				throw new Error('invalidated attempts must not be considered reusable');
			}
		}),
		{
			action: 'exhausted',
			issue: 'Verification repair exhausted its immutable attempt budget.'
		}
	);
});

test('targeted repair preserves every independently accepted challenge exactly', () => {
	const accepted = challenge('accepted', 'keep me');
	const rejected = challenge('rejected', 'repair me');
	const priorCandidate = batch([accepted, rejected]);
	const validCandidate = batch([structuredClone(accepted), challenge('rejected', 'fixed')]);
	const changedAccepted = batch([challenge('accepted', 'changed'), challenge('rejected', 'fixed')]);
	const reviews = [
		{ id: 'accepted', accepted: true },
		{ id: 'rejected', accepted: false }
	];
	const rows = [{ id: 'accepted' }, { id: 'rejected' }];
	assert.equal(
		validateVerificationRepairCandidate({
			candidate: validCandidate,
			priorCandidate,
			rows,
			reviews
		}).status,
		'passed'
	);
	assert.match(
		validateVerificationRepairCandidate({
			candidate: changedAccepted,
			priorCandidate,
			rows,
			reviews
		}).issues.join('\n'),
		/accepted content changed/
	);
	assert.match(
		validateVerificationRepairCandidate({
			candidate: priorCandidate,
			priorCandidate,
			rows,
			reviews
		}).issues.join('\n'),
		/rejected content was returned unchanged/
	);
	assert.match(
		validateVerificationRepairCandidate({
			candidate: batch([challenge('rejected', 'fixed'), structuredClone(accepted)]),
			priorCandidate,
			rows,
			reviews
		}).issues.join('\n'),
		/exact verifier-bound row order/
	);
});

test('typed review-rebase authority freezes the union of independent and cohort repair targets', () => {
	const fixture = typedAuthorityFixture();
	assert.throws(
		() =>
			buildScienceChallengeVerificationRepairAuthority({
				verificationSummary: fixture.summary
			}),
		/manifestless derivation is reserved for authenticated provenance replay/
	);
	assert.doesNotThrow(() =>
		buildScienceChallengeVerificationRepairAuthority({
			verificationSummary: fixture.summary,
			allowManifestlessReplay: true
		})
	);
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary: fixture.summary,
		reviewRebaseManifest: fixture.manifest
	});
	assert.equal(authority.schemaVersion, SCIENCE_CHALLENGE_VERIFICATION_REPAIR_AUTHORITY_SCHEMA);
	assert.deepEqual(authority.independentRejectedChallengeIds, ['independent-rejected']);
	assert.deepEqual(authority.collectionRemediationTargetIds, ['collection-preferred']);
	assert.deepEqual(authority.mutableChallengeIds, ['collection-preferred', 'independent-rejected']);
	assert.equal(authority.mutableChallengeSetSha256, canonicalHash(authority.mutableChallengeIds));
	assert.equal(Object.isFrozen(authority), true);
	assert.equal(Object.isFrozen(authority.mutableChallengeIds), true);
	assert.deepEqual(
		validateScienceChallengeVerificationRepairAuthority({
			authority,
			verificationSummary: fixture.summary,
			reviewRebaseManifest: fixture.manifest
		}),
		{ status: 'passed', issues: [] }
	);
	for (const tampered of [
		{ ...structuredClone(authority), extra: true },
		{
			...structuredClone(authority),
			parent: { ...structuredClone(authority.parent), extra: true }
		},
		{
			...structuredClone(authority),
			collectionRemediations: [
				{ ...structuredClone(authority.collectionRemediations[0]), extra: true }
			]
		}
	]) {
		assert.equal(
			validateScienceChallengeVerificationRepairAuthority({ authority: tampered }).status,
			'failed'
		);
	}

	const suppliedMismatch = structuredClone(authority);
	suppliedMismatch.mutableChallengeIds = ['independent-rejected'];
	suppliedMismatch.mutableChallengeSetSha256 = canonicalHash(suppliedMismatch.mutableChallengeIds);
	assert.throws(
		() =>
			buildScienceChallengeVerificationRepairAuthority({
				verificationSummary: fixture.summary,
				reviewRebaseManifest: fixture.manifest,
				suppliedAuthority: suppliedMismatch
			}),
		/independently derived authority/
	);
	const partial = structuredClone(fixture.summary);
	delete partial.reviewRebaseCollectionValidationSha256;
	assert.throws(
		() =>
			buildScienceChallengeVerificationRepairAuthority({
				verificationSummary: partial
			}),
		/Typed review-rebase verification summary is incomplete/
	);
	const wrongParent = structuredClone(fixture.manifest);
	wrongParent.collectionValidationSha256 = 'f'.repeat(64);
	assert.throws(
		() =>
			buildScienceChallengeVerificationRepairAuthority({
				verificationSummary: fixture.summary,
				reviewRebaseManifest: wrongParent
			}),
		/exact review-rebase parent manifest/
	);
});

test('typed repair changes every mutable row and preserves every other row in the same shard', () => {
	const fixture = typedAuthorityFixture();
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary: fixture.summary,
		reviewRebaseManifest: fixture.manifest
	});
	const priorCandidate = batch([
		challenge('accepted-frozen', 'keep me'),
		challenge('independent-rejected', 'repair independent defect'),
		challenge('collection-preferred', 'repair deterministic collision')
	]);
	const rows = priorCandidate.challenges.map((entry) => ({ id: entry.definition.id }));
	const repaired = batch([
		structuredClone(priorCandidate.challenges[0]),
		challenge('independent-rejected', 'independent defect repaired'),
		challenge('collection-preferred', 'deterministic collision repaired')
	]);
	assert.deepEqual(
		validateVerificationRepairCandidate({
			candidate: repaired,
			priorCandidate,
			rows,
			reviews: fixture.summary.reviews,
			verificationRepairAuthority: authority
		}),
		{ status: 'passed', issues: [] }
	);
	const unchangedCollectionTarget = structuredClone(repaired);
	unchangedCollectionTarget.challenges[2] = structuredClone(priorCandidate.challenges[2]);
	assert.match(
		validateVerificationRepairCandidate({
			candidate: unchangedCollectionTarget,
			priorCandidate,
			rows,
			reviews: fixture.summary.reviews,
			verificationRepairAuthority: authority
		}).issues.join('\n'),
		/collection-preferred: mutable content was returned unchanged/
	);
	const changedFrozen = structuredClone(repaired);
	changedFrozen.challenges[0].definition.text = 'not allowed';
	assert.match(
		validateVerificationRepairCandidate({
			candidate: changedFrozen,
			priorCandidate,
			rows,
			reviews: fixture.summary.reviews,
			verificationRepairAuthority: authority
		}).issues.join('\n'),
		/accepted-frozen: content outside the frozen mutable challenge set changed/
	);
});

test('collection-only mutation authority requires typed rebase bindings and cannot expand targets', () => {
	const fixture = typedAuthorityFixture({
		reviews: [
			{ id: 'accepted-frozen', accepted: true },
			{ id: 'collection-preferred', accepted: true }
		]
	});
	const ordinarySummary = {
		...fixture.summary,
		reviews: fixture.summary.reviews,
		rejectedCount: 0
	};
	for (const field of [
		'reviewRebaseManifestSha256',
		'reviewRebaseId',
		'reviewRebaseCandidateSetSha256',
		'reviewRebaseCollectionValidationSha256',
		'reviewRebaseCollectionRemediationSetSha256',
		'reviewRebaseCollectionRemediations',
		'reviewRebaseCollectionRemediationTargetIds',
		'reviewRebaseCollectionRemediationTargetSetSha256'
	]) {
		delete ordinarySummary[field];
	}
	assert.equal(
		buildScienceChallengeVerificationRepairAuthority({
			verificationSummary: ordinarySummary
		}),
		null
	);
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary: fixture.summary,
		reviewRebaseManifest: fixture.manifest
	});
	assert.deepEqual(authority.independentRejectedChallengeIds, []);
	assert.deepEqual(authority.mutableChallengeIds, ['collection-preferred']);
	assert.deepEqual(
		validateVerificationRepairCollectionTargets({
			collectionValidation: {
				status: 'failed',
				issues: ['collection-preferred collides with accepted-frozen'],
				repairTargets: [
					{
						challengeId: 'collection-preferred',
						shardId: 'science-001',
						issues: ['repair the preferred target']
					}
				]
			},
			verificationRepairAuthority: authority
		}),
		{ status: 'passed', issues: [] }
	);
	assert.match(
		validateVerificationRepairCollectionTargets({
			collectionValidation: {
				status: 'failed',
				issues: ['collision'],
				repairTargets: [
					{
						challengeId: 'accepted-frozen',
						shardId: 'science-001',
						issues: ['expand authority']
					}
				]
			},
			verificationRepairAuthority: authority
		}).issues.join('\n'),
		/outside the frozen mutable challenge set/
	);
});

test('typed selected overlay enforces row-level authority and refuses expanded collection targets', () => {
	const fixture = typedAuthorityFixture();
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary: fixture.summary,
		reviewRebaseManifest: fixture.manifest
	});
	const prior = batch([
		challenge('accepted-frozen', 'keep me'),
		challenge('independent-rejected', 'repair me'),
		challenge('collection-preferred', 'remove collision')
	]);
	const selected = batch([
		structuredClone(prior.challenges[0]),
		challenge('independent-rejected', 'repaired'),
		challenge('collection-preferred', 'collision removed')
	]);
	const baseOptions = {
		priorCandidateByShard: new Map([['science-001', prior]]),
		selectedCandidateByShard: new Map([['science-001', selected]]),
		proposals: [{ shardId: 'science-001', attempt: 1 }],
		lastAttemptByShard: new Map([['science-001', 1]]),
		verificationRepairAuthority: authority
	};
	const expanded = evaluateScienceChallengeVerificationRepairOverlay({
		...baseOptions,
		validateCandidateBatches: () => ({
			status: 'failed',
			issues: ['accepted-frozen collides with another row'],
			repairTargets: [
				{
					challengeId: 'accepted-frozen',
					shardId: 'science-001',
					issues: ['unauthorized target']
				}
			]
		})
	});
	assert.equal(expanded.canRecordCollectionFailure, false);
	assert.match(expanded.collectionAuthorityIssues.join('\n'), /outside the frozen mutable/);

	const changedFrozen = structuredClone(selected);
	changedFrozen.challenges[0].definition.text = 'changed';
	assert.throws(
		() =>
			evaluateScienceChallengeVerificationRepairOverlay({
				...baseOptions,
				selectedCandidateByShard: new Map([['science-001', changedFrozen]]),
				validateCandidateBatches: () => ({
					status: 'passed',
					issues: [],
					repairTargets: []
				})
			}),
		/accepted-frozen: selected overlay changed content outside the frozen mutable set/
	);
	const unchangedMutable = structuredClone(selected);
	unchangedMutable.challenges[2] = structuredClone(prior.challenges[2]);
	assert.throws(
		() =>
			evaluateScienceChallengeVerificationRepairOverlay({
				...baseOptions,
				selectedCandidateByShard: new Map([['science-001', unchangedMutable]]),
				validateCandidateBatches: () => ({
					status: 'passed',
					issues: [],
					repairTargets: []
				})
			}),
		/collection-preferred: mutable content was returned unchanged/
	);
});

test('subset repair cannot publish while any rejected shard is omitted', () => {
	assert.throws(
		() =>
			requireCompleteVerificationRepairCohort({
				selectedShardIds: ['science-001'],
				rejectedShardIds: ['science-001', 'science-002']
			}),
		/Omitted rejected shards: science-002/
	);
	assert.deepEqual(
		requireCompleteVerificationRepairCohort({
			selectedShardIds: ['science-002', 'science-001', 'science-001'],
			rejectedShardIds: ['science-001', 'science-002']
		}),
		['science-001', 'science-002']
	);
});

test('collection failure invalidates only implicated proposals and never changes root candidates', () => {
	const root = temporaryRoot();
	try {
		const fixtures = preparePublicationFixtures(root, ['science-001', 'science-002']);
		const originalBytes = fixtures.map((fixture) => readFileSync(fixture.targetCandidate));
		const failure = {
			status: 'failed',
			issues: ['challenge-001:opening duplicates challenge-002:opening.'],
			repairTargets: [
				{
					challengeId: 'challenge-001',
					shardId: 'science-001',
					issues: ['challenge-001:opening duplicates challenge-002:opening.']
				},
				{
					challengeId: 'challenge-003',
					shardId: 'science-001',
					issues: ['challenge-003:transfer duplicates challenge-004:transfer.']
				}
			]
		};
		recordVerificationRepairCollectionFailure({
			outputRoot: root,
			repairSha256,
			collectionValidation: failure,
			proposals: fixtures.map((fixture) => fixture.proposal)
		});
		const { state } = readVerificationRepairCohortState({
			outputRoot: root,
			repairSha256
		});
		assert.deepEqual([...invalidatedVerificationRepairAttempts(state, 'science-001')], [1]);
		assert.equal(state.invalidatedAttempts['science-001'][0].issues.length, 2);
		assert.deepEqual([...invalidatedVerificationRepairAttempts(state, 'science-002')], []);
		fixtures.forEach((fixture, index) => {
			assert.ok(readFileSync(fixture.targetCandidate).equals(originalBytes[index]));
		});

		const statePath = path.join(
			root,
			'verification-repair-aaaaaaaaaaaa-transaction',
			'cohort-state.json'
		);
		const tampered = JSON.parse(readFileSync(statePath, 'utf8'));
		tampered.invalidatedAttempts['science-001'][0].issues = ['hide the real issue'];
		writeFileSync(statePath, `${stableStringify(tampered)}\n`);
		assert.throws(
			() => readVerificationRepairCohortState({ outputRoot: root, repairSha256 }),
			/self-binding hash mismatch/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('failed remap recovery records only exact selected-overlay targets and ignores stale roots', () => {
	const root = temporaryRoot();
	try {
		const fixtures = preparePublicationFixtures(root, [
			'science-017',
			'science-030',
			'science-038'
		]);
		const fixtureByShard = new Map(fixtures.map((fixture) => [fixture.proposal.shardId, fixture]));
		const priorCandidateByShard = new Map(
			fixtures.map((fixture) => [
				fixture.proposal.shardId,
				JSON.parse(readFileSync(fixture.targetCandidate, 'utf8'))
			])
		);
		const selectedCandidateByShard = new Map(
			['science-017', 'science-030'].map((shardId) => [
				shardId,
				JSON.parse(readFileSync(fixtureByShard.get(shardId).proposal.candidatePath, 'utf8'))
			])
		);
		const staleRootIssues = Array.from(
			{ length: 11 },
			(_, index) => `science-038 stale root issue ${index + 1}`
		);
		writeJson(
			fixtureByShard.get('science-038').targetCandidate,
			batch([challenge('science-038-stale', staleRootIssues.join('; '))])
		);
		recordVerificationRepairCollectionFailure({
			outputRoot: root,
			repairSha256,
			collectionValidation: {
				status: 'failed',
				issues: ['prior selected-overlay collision'],
				repairTargets: ['science-017', 'science-030'].map((shardId) => ({
					challengeId: `${shardId}-prior`,
					shardId,
					issues: ['prior selected-overlay collision']
				}))
			},
			proposals: ['science-017', 'science-030'].map(
				(shardId) => fixtureByShard.get(shardId).proposal
			)
		});
		const proposals = ['science-017', 'science-030'].map((shardId) => ({
			...fixtureByShard.get(shardId).proposal,
			attempt: 2
		}));
		const lastAttemptByShard = new Map([
			['science-017', 2],
			['science-030', 2],
			['science-038', 0]
		]);
		const collisionIssues = [
			'science-017:selected overlay collides with science-030:selected overlay.',
			'science-030:selected overlay collides with science-017:selected overlay.'
		];
		const overlay = evaluateScienceChallengeVerificationRepairOverlay({
			priorCandidateByShard,
			selectedCandidateByShard,
			proposals,
			lastAttemptByShard,
			validateCandidateBatches: (candidateBatches) => {
				assert.equal(
					canonicalHash(candidateBatches.get('science-038')),
					canonicalHash(priorCandidateByShard.get('science-038'))
				);
				return {
					status: 'failed',
					issues: collisionIssues,
					repairTargets: [
						{
							challengeId: 'science-017-selected',
							shardId: 'science-017',
							issues: [collisionIssues[0]]
						},
						{
							challengeId: 'science-030-selected',
							shardId: 'science-030',
							issues: [collisionIssues[1]]
						}
					]
				};
			}
		});
		assert.equal(overlay.canRecordCollectionFailure, true);
		assert.equal(
			evaluateScienceChallengeVerificationRepairOverlay({
				priorCandidateByShard,
				selectedCandidateByShard,
				proposals: proposals.map((proposal) =>
					proposal.shardId === 'science-030' ? { ...proposal, attempt: 4 } : proposal
				),
				lastAttemptByShard: new Map(lastAttemptByShard).set('science-030', 4),
				validateCandidateBatches: () => structuredClone(overlay.collectionValidation)
			}).canRecordCollectionFailure,
			false
		);
		assert.equal(
			evaluateScienceChallengeVerificationRepairOverlay({
				priorCandidateByShard,
				selectedCandidateByShard,
				proposals: proposals.filter((proposal) => proposal.shardId !== 'science-030'),
				lastAttemptByShard,
				validateCandidateBatches: () => structuredClone(overlay.collectionValidation)
			}).canRecordCollectionFailure,
			false
		);
		assert.equal(
			evaluateScienceChallengeVerificationRepairOverlay({
				priorCandidateByShard,
				selectedCandidateByShard,
				proposals,
				lastAttemptByShard: new Map(lastAttemptByShard).set('science-030', 4),
				validateCandidateBatches: () => structuredClone(overlay.collectionValidation)
			}).canRecordCollectionFailure,
			false,
			'a stale attempt-2 proposal cannot invalidate a shard whose exact ledger is already at 4'
		);
		assert.throws(
			() =>
				evaluateScienceChallengeVerificationRepairOverlay({
					priorCandidateByShard,
					selectedCandidateByShard,
					proposals,
					lastAttemptByShard,
					maxAttempts: 5,
					validateCandidateBatches: () => structuredClone(overlay.collectionValidation)
				}),
			/maxAttempts must be from 1 to 4/
		);
		assert.throws(
			() =>
				evaluateScienceChallengeVerificationRepairOverlay({
					priorCandidateByShard,
					selectedCandidateByShard,
					proposals: [...proposals, structuredClone(proposals[0])],
					lastAttemptByShard,
					validateCandidateBatches: () => structuredClone(overlay.collectionValidation)
				}),
			/proposals must have unique shard ids/
		);
		recordVerificationRepairCollectionFailure({
			outputRoot: root,
			repairSha256,
			collectionValidation: overlay.collectionValidation,
			proposals
		});
		const { state } = readVerificationRepairCohortState({ outputRoot: root, repairSha256 });
		assert.deepEqual([...invalidatedVerificationRepairAttempts(state, 'science-017')], [1, 2]);
		assert.deepEqual([...invalidatedVerificationRepairAttempts(state, 'science-030')], [1, 2]);
		assert.deepEqual([...invalidatedVerificationRepairAttempts(state, 'science-038')], []);
		assert.equal(
			JSON.stringify(state.collectionValidation).includes('science-038 stale root issue'),
			false
		);
		assert.deepEqual(
			planVerificationRepairResume({
				attemptLedger: {
					attempts: [
						{ attempt: 1, directory: 'attempt-01' },
						{ attempt: 2, directory: 'attempt-02' }
					],
					nextAttempt: 3,
					exhausted: false
				},
				invalidatedAttempts: invalidatedVerificationRepairAttempts(state, 'science-017'),
				resume: true,
				readReusableAttempt: () => {
					throw new Error('invalidated attempts must not be reused');
				}
			}),
			{ action: 'run', attempt: 3 }
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('review-pending effective cohort invalidates only its retriable ordinary target', () => {
	const root = temporaryRoot();
	try {
		const fixtures = preparePublicationFixtures(root, [
			'science-retry',
			'science-four',
			'science-typed-recovery'
		]);
		const fixtureByShard = new Map(fixtures.map((fixture) => [fixture.proposal.shardId, fixture]));
		const priorCandidateByShard = new Map(
			fixtures.map((fixture) => [
				fixture.proposal.shardId,
				JSON.parse(readFileSync(fixture.targetCandidate, 'utf8'))
			])
		);
		const results = [
			{
				shardId: 'science-retry',
				status: 'passed',
				proposal: { ...fixtureByShard.get('science-retry').proposal, attempt: 2 }
			},
			{
				shardId: 'science-four',
				status: 'passed',
				proposal: { ...fixtureByShard.get('science-four').proposal, attempt: 4 }
			},
			{
				shardId: 'science-typed-recovery',
				status: 'review-pending',
				recoveryKind: 'difficulty-plan-adjustment'
			}
		];
		const ordinaryProposals = results
			.filter((result) => result.status === 'passed' && result.proposal)
			.map((result) => result.proposal);
		const selectedCandidateByShard = new Map(
			fixtures.map((fixture) => [
				fixture.proposal.shardId,
				JSON.parse(readFileSync(fixture.proposal.candidatePath, 'utf8'))
			])
		);
		const issue = 'science-retry:selected overlay duplicates another challenge context.';
		const overlay = evaluateScienceChallengeVerificationRepairOverlay({
			priorCandidateByShard,
			selectedCandidateByShard,
			proposals: ordinaryProposals,
			lastAttemptByShard: new Map([
				['science-retry', 2],
				['science-four', 4],
				['science-typed-recovery', 4]
			]),
			validateCandidateBatches: (candidateBatches) => {
				assert.deepEqual(
					[...candidateBatches.keys()],
					['science-retry', 'science-four', 'science-typed-recovery']
				);
				return {
					status: 'failed',
					issues: [issue],
					repairTargets: [
						{
							challengeId: 'science-retry-selected',
							shardId: 'science-retry',
							issues: [issue]
						}
					]
				};
			}
		});
		assert.equal(overlay.canRecordCollectionFailure, true);
		assert.deepEqual(overlay.repairTargetShardIds, ['science-retry']);
		assert.throws(
			() =>
				recordVerificationRepairCollectionFailure({
					outputRoot: root,
					repairSha256,
					collectionValidation: overlay.collectionValidation,
					proposals: ordinaryProposals
				}),
			/science-four attempt 4 cannot allocate a fifth attempt/
		);

		const targetShardIds = new Set(overlay.repairTargetShardIds);
		const implicatedOrdinaryProposals = ordinaryProposals.filter((proposal) =>
			targetShardIds.has(proposal.shardId)
		);
		assert.deepEqual(
			implicatedOrdinaryProposals.map(({ shardId, attempt }) => ({ shardId, attempt })),
			[{ shardId: 'science-retry', attempt: 2 }]
		);
		assert.doesNotThrow(() =>
			recordVerificationRepairCollectionFailure({
				outputRoot: root,
				repairSha256,
				collectionValidation: overlay.collectionValidation,
				proposals: implicatedOrdinaryProposals
			})
		);
		const { state } = readVerificationRepairCohortState({ outputRoot: root, repairSha256 });
		assert.deepEqual([...invalidatedVerificationRepairAttempts(state, 'science-retry')], [2]);
		assert.deepEqual([...invalidatedVerificationRepairAttempts(state, 'science-four')], []);
		assert.deepEqual(
			[...invalidatedVerificationRepairAttempts(state, 'science-typed-recovery')],
			[]
		);
		assert.deepEqual(
			planVerificationRepairResume({
				attemptLedger: {
					attempts: [1, 2, 3, 4].map((attempt) => ({ attempt })),
					nextAttempt: 5,
					exhausted: false
				},
				invalidatedAttempts: invalidatedVerificationRepairAttempts(state, 'science-four'),
				resume: true,
				readReusableAttempt: (record) => (record.attempt === 4 ? results[1].proposal : null)
			}).action,
			'reuse'
		);
		assert.equal(
			existsSync(scienceChallengeEffectiveCohortDirectory({ outputRoot: root, repairSha256 })),
			false
		);

		const generatorSource = readFileSync(
			new URL('../generate-science-challenges.mjs', import.meta.url),
			'utf8'
		);
		const reviewPendingBranch = generatorSource.slice(
			generatorSource.indexOf('} else if (verificationRepair && failures.length === 0) {'),
			generatorSource.indexOf(
				'} else if (verificationRepair) {',
				generatorSource.indexOf('} else if (verificationRepair && failures.length === 0) {')
			)
		);
		assert.match(
			reviewPendingBranch,
			/if \(collectionValidation\.status === 'failed'\)[\s\S]*proposals: ordinaryProposals\.filter\([\s\S]*\} else \{\s*const staged = stageScienceChallengeEffectiveCohort/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('collection mutation boundaries allow a fourth pass but reject every fifth-attempt path', () => {
	const failureRoot = temporaryRoot();
	const passRoot = temporaryRoot();
	const fifthPassRoot = temporaryRoot();
	const staleStateRoot = temporaryRoot();
	try {
		const [failureFixture] = preparePublicationFixtures(failureRoot, ['science-017']);
		const collectionFailure = {
			status: 'failed',
			issues: ['science-017 still collides with science-030.'],
			repairTargets: [
				{
					challengeId: 'science-017-selected',
					shardId: 'science-017',
					issues: ['science-017 still collides with science-030.']
				}
			]
		};
		for (const attempt of [4, 5]) {
			assert.throws(
				() =>
					recordVerificationRepairCollectionFailure({
						outputRoot: failureRoot,
						repairSha256,
						collectionValidation: collectionFailure,
						proposals: [{ ...failureFixture.proposal, attempt }]
					}),
				/cannot allocate a fifth attempt|must be from 1 to 4/
			);
		}
		assert.equal(
			readVerificationRepairCohortState({
				outputRoot: failureRoot,
				repairSha256
			}).state.status,
			'collecting'
		);

		const [passFixture] = preparePublicationFixtures(passRoot, ['science-030']);
		assert.equal(
			recordVerificationRepairCollectionPass({
				outputRoot: passRoot,
				repairSha256,
				collectionValidation: { status: 'passed', issues: [], repairTargets: [] },
				proposals: [{ ...passFixture.proposal, attempt: 4 }]
			}).status,
			'collection-passed'
		);

		const [fifthPassFixture] = preparePublicationFixtures(fifthPassRoot, ['science-030']);
		assert.throws(
			() =>
				recordVerificationRepairCollectionPass({
					outputRoot: fifthPassRoot,
					repairSha256,
					collectionValidation: { status: 'passed', issues: [], repairTargets: [] },
					proposals: [{ ...fifthPassFixture.proposal, attempt: 5 }]
				}),
			/must be from 1 to 4/
		);

		const staleStateCore = {
			schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_COHORT_SCHEMA,
			repairSha256,
			status: 'collection-failed',
			invalidatedAttempts: {
				'science-017': [
					{
						attempt: 5,
						candidateSha256: 'b'.repeat(64),
						issues: ['stale state attempted to allocate a fifth repair.']
					}
				]
			},
			collectionValidation: collectionFailure
		};
		writeJson(
			path.join(
				verificationRepairTransactionRoot(staleStateRoot, repairSha256),
				'cohort-state.json'
			),
			{
				...staleStateCore,
				stateSha256: canonicalHash(staleStateCore)
			}
		);
		assert.throws(
			() =>
				readVerificationRepairCohortState({
					outputRoot: staleStateRoot,
					repairSha256
				}),
			/invalidation for science-017 is malformed/
		);
	} finally {
		rmSync(failureRoot, { recursive: true, force: true });
		rmSync(passRoot, { recursive: true, force: true });
		rmSync(fifthPassRoot, { recursive: true, force: true });
		rmSync(staleStateRoot, { recursive: true, force: true });
	}
});

test('cohort mutation refuses a live concurrent lock and recovers an abandoned lock', () => {
	const root = temporaryRoot();
	const lockPath = path.join(
		verificationRepairTransactionRoot(root, repairSha256),
		'.exclusive.lock'
	);
	const recordFailure = () =>
		recordVerificationRepairCollectionFailure({
			outputRoot: root,
			repairSha256,
			collectionValidation: { status: 'failed', issues: [], repairTargets: [] },
			proposals: []
		});
	try {
		mkdirSync(lockPath, { recursive: true });
		writeFileSync(
			path.join(lockPath, 'owner.json'),
			`${stableStringify({ pid: process.pid, token: 'live-owner' })}\n`
		);
		assert.throws(recordFailure, /locked by another process/);
		rmSync(lockPath, { recursive: true, force: true });

		mkdirSync(lockPath, { recursive: true });
		writeFileSync(
			path.join(lockPath, 'owner.json'),
			`${stableStringify({ pid: 2_147_483_647, token: 'abandoned-owner' })}\n`
		);
		assert.equal(recordFailure().status, 'collection-failed');
		assert.equal(
			readVerificationRepairCohortState({ outputRoot: root, repairSha256 }).state.status,
			'collection-failed'
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('mid-publication failure rolls every shard back and the exact cohort can resume', () => {
	const root = temporaryRoot();
	try {
		const fixtures = preparePublicationFixtures(root, ['science-001', 'science-002']);
		const original = fixtures.map((fixture) => ({
			candidate: readFileSync(fixture.targetCandidate),
			validation: readFileSync(fixture.targetValidation)
		}));
		recordVerificationRepairCollectionPass({
			outputRoot: root,
			repairSha256,
			collectionValidation: { status: 'passed', issues: [], repairTargets: [] },
			proposals: fixtures.map((fixture) => fixture.proposal)
		});
		assert.throws(
			() =>
				publishVerificationRepairCohort({
					outputRoot: root,
					repairSha256,
					proposals: fixtures.map((fixture) => fixture.proposal),
					injectFailure: ({ phase, writeIndex }) => {
						if (phase === 'after-write' && writeIndex === 3) {
							throw new Error('simulated process failure');
						}
					}
				}),
			/simulated process failure/
		);
		fixtures.forEach((fixture, index) => {
			assert.ok(readFileSync(fixture.targetCandidate).equals(original[index].candidate));
			assert.ok(readFileSync(fixture.targetValidation).equals(original[index].validation));
		});
		assert.equal(
			readVerificationRepairPublication({ outputRoot: root, repairSha256 }).journal.status,
			'rolled-back'
		);

		const published = publishVerificationRepairCohort({
			outputRoot: root,
			repairSha256,
			proposals: fixtures.map((fixture) => fixture.proposal)
		});
		assert.equal(published.action, 'published');
		fixtures.forEach((fixture) => {
			assert.equal(
				canonicalHash(JSON.parse(readFileSync(fixture.targetCandidate, 'utf8'))),
				fixture.proposal.candidateSha256
			);
			assert.equal(
				canonicalHash(JSON.parse(readFileSync(fixture.targetValidation, 'utf8'))),
				fixture.proposal.validationSha256
			);
		});
		assert.equal(
			publishVerificationRepairCohort({
				outputRoot: root,
				repairSha256,
				proposals: fixtures.map((fixture) => fixture.proposal)
			}).action,
			'resumed'
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('publication recovery rejects tampered frozen proposal evidence', () => {
	const root = temporaryRoot();
	try {
		const [fixture] = preparePublicationFixtures(root, ['science-043']);
		recordVerificationRepairCollectionPass({
			outputRoot: root,
			repairSha256,
			collectionValidation: { status: 'passed', issues: [], repairTargets: [] },
			proposals: [fixture.proposal]
		});
		assert.throws(
			() =>
				publishVerificationRepairCohort({
					outputRoot: root,
					repairSha256,
					proposals: [fixture.proposal],
					injectFailure: () => {
						throw new Error('rollback first');
					}
				}),
			/rollback first/
		);
		const { publicationRoot } = readVerificationRepairPublication({
			outputRoot: root,
			repairSha256
		});
		writeFileSync(
			path.join(publicationRoot, 'proposals', 'science-043', 'candidate.json'),
			'{"tampered":true}\n'
		);
		assert.throws(
			() => recoverVerificationRepairPublication({ outputRoot: root, repairSha256 }),
			/hash mismatch/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('publication refuses to run without the exact frozen collection-pass cohort', () => {
	const root = temporaryRoot();
	try {
		const [fixture] = preparePublicationFixtures(root, ['science-001']);
		assert.throws(
			() =>
				publishVerificationRepairCohort({
					outputRoot: root,
					repairSha256,
					proposals: [fixture.proposal]
				}),
			/collection-pass cohort/
		);
		recordVerificationRepairCollectionPass({
			outputRoot: root,
			repairSha256,
			collectionValidation: { status: 'passed', issues: [], repairTargets: [] },
			proposals: [fixture.proposal]
		});
		const changedProposal = {
			...fixture.proposal,
			candidateSha256: 'b'.repeat(64)
		};
		assert.throws(
			() =>
				publishVerificationRepairCohort({
					outputRoot: root,
					repairSha256,
					proposals: [changedProposal]
				}),
			/differ from the collection-pass cohort/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('publication rollback fails closed rather than overwriting an unexpected target', () => {
	const root = temporaryRoot();
	try {
		const [fixture] = preparePublicationFixtures(root, ['science-001']);
		recordVerificationRepairCollectionPass({
			outputRoot: root,
			repairSha256,
			collectionValidation: { status: 'passed', issues: [], repairTargets: [] },
			proposals: [fixture.proposal]
		});
		const unexpectedBytes = '{"external":"change"}\n';
		assert.throws(
			() =>
				publishVerificationRepairCohort({
					outputRoot: root,
					repairSha256,
					proposals: [fixture.proposal],
					injectFailure: ({ phase, writeIndex }) => {
						if (phase === 'after-write' && writeIndex === 1) {
							writeFileSync(fixture.targetCandidate, unexpectedBytes);
							throw new Error('simulated crash after an external write');
						}
					}
				}),
			(error) =>
				error instanceof AggregateError &&
				error.errors.some((failure) => /refusing destructive recovery/.test(failure.message))
		);
		assert.equal(readFileSync(fixture.targetCandidate, 'utf8'), unexpectedBytes);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('publication refuses to snapshot a target changed after collection validation', () => {
	const root = temporaryRoot();
	try {
		const [fixture] = preparePublicationFixtures(root, ['science-001']);
		recordVerificationRepairCollectionPass({
			outputRoot: root,
			repairSha256,
			collectionValidation: { status: 'passed', issues: [], repairTargets: [] },
			proposals: [fixture.proposal]
		});
		writeJson(fixture.targetCandidate, batch([challenge('external-edit', 'preserve me')]));
		const editedBytes = readFileSync(fixture.targetCandidate);
		assert.throws(
			() =>
				publishVerificationRepairCohort({
					outputRoot: root,
					repairSha256,
					proposals: [fixture.proposal]
				}),
			/target changed after collection validation/
		);
		assert.ok(readFileSync(fixture.targetCandidate).equals(editedBytes));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('collection failure cannot replace a frozen or committed pass state', () => {
	const root = temporaryRoot();
	try {
		const [fixture] = preparePublicationFixtures(root, ['science-001']);
		recordVerificationRepairCollectionPass({
			outputRoot: root,
			repairSha256,
			collectionValidation: { status: 'passed', issues: [], repairTargets: [] },
			proposals: [fixture.proposal]
		});
		assert.throws(
			() =>
				recordVerificationRepairCollectionFailure({
					outputRoot: root,
					repairSha256,
					collectionValidation: {
						status: 'failed',
						issues: ['science-001: changed result'],
						repairTargets: []
					},
					proposals: [fixture.proposal]
				}),
			/cannot be replaced/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

function typedAuthorityFixture({
	reviews = [
		{ id: 'accepted-frozen', accepted: true },
		{
			id: 'independent-rejected',
			accepted: false,
			issues: [{ field: 'definition.difficulty', problem: 'Mismatch', repair: 'Use standard.' }]
		},
		{ id: 'collection-preferred', accepted: true }
	]
} = {}) {
	const planSha256 = '1'.repeat(64);
	const candidateSetSha256 = '2'.repeat(64);
	const rebaseId = '3'.repeat(64);
	const collectionValidationSha256 = '4'.repeat(64);
	const collectionRemediations = [
		{
			issue: 'collection-preferred:opening is too similar to independent-rejected:transfer.',
			preferredChallengeId: 'collection-preferred'
		}
	];
	const collectionRemediationTargetIds = ['collection-preferred'];
	const manifest = {
		schemaVersion: 'science-challenge-review-rebase-manifest/v1',
		status: 'review-pending',
		disposition: 'deterministic-parent-bound-review-rebase',
		rebaseId,
		planSha256,
		candidateSetSha256,
		collectionValidationSha256,
		collectionRemediationSetSha256: canonicalHash(collectionRemediations),
		collectionRemediations,
		requiresFreshFullVerification: true,
		releaseEligible: false
	};
	const summary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planSha256,
		candidateSetSha256,
		status: 'failed',
		reviewCount: reviews.length,
		acceptedCount: reviews.filter((review) => review.accepted === true).length,
		rejectedCount: reviews.filter((review) => review.accepted === false).length,
		reviews,
		reviewRebaseManifestSha256: canonicalHash(manifest),
		reviewRebaseId: rebaseId,
		reviewRebaseCandidateSetSha256: candidateSetSha256,
		reviewRebaseCollectionValidationSha256: collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256: canonicalHash(collectionRemediations),
		reviewRebaseCollectionRemediations: collectionRemediations,
		reviewRebaseCollectionRemediationTargetIds: collectionRemediationTargetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(collectionRemediationTargetIds)
	};
	return { summary, manifest };
}

function preparePublicationFixtures(root, shardIds) {
	return shardIds.map((shardId, index) => {
		const shardRoot = path.join(root, 'shards', shardId);
		const attemptRoot = path.join(shardRoot, 'verification-repair-aaaaaaaaaaaa-attempt-01');
		mkdirSync(attemptRoot, { recursive: true });
		const originalCandidate = batch([challenge(`${shardId}-accepted`, `original-${index}`)]);
		const originalValidation = {
			status: 'passed',
			candidateSha256: canonicalHash(originalCandidate)
		};
		const proposedCandidate = batch([challenge(`${shardId}-accepted`, `proposed-${index}`)]);
		const proposedValidation = {
			status: 'passed',
			candidateSha256: canonicalHash(proposedCandidate),
			verificationRepairSha256: repairSha256
		};
		const targetCandidate = path.join(shardRoot, 'candidate.json');
		const targetValidation = path.join(shardRoot, 'validation.json');
		const proposedCandidatePath = path.join(attemptRoot, 'candidate.json');
		const proposedValidationPath = path.join(attemptRoot, 'validation.json');
		writeJson(targetCandidate, originalCandidate);
		writeJson(targetValidation, originalValidation);
		writeJson(proposedCandidatePath, proposedCandidate);
		writeJson(proposedValidationPath, proposedValidation);
		return {
			targetCandidate,
			targetValidation,
			proposal: {
				shardId,
				attempt: 1,
				candidatePath: proposedCandidatePath,
				validationPath: proposedValidationPath,
				candidateSha256: canonicalHash(proposedCandidate),
				validationSha256: canonicalHash(proposedValidation),
				expectedTargetCandidateSha256: canonicalHash(originalCandidate),
				expectedTargetValidationSha256: canonicalHash(originalValidation)
			}
		};
	});
}

function challenge(id, text) {
	return { definition: { id, text } };
}

function batch(challenges) {
	return { schemaVersion: 'science-challenge-batch/v1', challenges };
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function temporaryRoot() {
	return mkdtempSync(path.join(tmpdir(), 'science-verification-repair-transaction-'));
}
