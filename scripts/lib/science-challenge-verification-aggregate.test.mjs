import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalHash, stableStringify } from './science-challenge-release.mjs';
import {
	buildScienceChallengeCurriculumRemapProposal,
	buildScienceChallengeCurriculumRemapVerifierInput
} from './science-challenge-curriculum-remap-review.mjs';
import { findScienceChallengeCurriculumRemapDurableLeaks } from './science-challenge-curriculum-remap-durable.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
	buildScienceChallengeDifficultyPlanAdjustmentSet
} from './science-challenge-difficulty-plan-adjustment.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY,
	buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts
} from './science-challenge-difficulty-plan-adjustment-review.mjs';
import { buildScienceChallengeVerifierPacketBundle } from './science-challenge-verifier-packets.mjs';
import {
	buildSameCurriculumComponentPeerEvidence,
	SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA
} from './science-challenge-verification-peers.mjs';

const aggregateScript = fileURLToPath(
	new URL('../aggregate-science-challenge-verification.mjs', import.meta.url)
);
const difficultyShardId = 'science-021';
const mixedDifficultyTargetId = 'chemistry-giant-covalent-structures-01';
const exactDifficultyTargetId = 'chemistry-metals-as-conductors-01';

test('aggregate accepts three canonical task names covering 17 assignments each', () => {
	const fixture = aggregateFixture();
	try {
		runAggregate(fixture);
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'passed', summary.issues.join('\n'));
		assert.equal(summary.assignmentCount, 51);
		assert.equal(summary.reviewCount, 408);
		assert.equal(summary.acceptedCount, 408);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate preserves the authenticated successor canonical empty recovery binding', () => {
	const fixture = aggregateFixture({ withEmptyReviewRebaseSuccessor: true });
	try {
		runAggregate(fixture);
		const index = readJson(path.join(fixture.rootDir, 'verification/assignment-index.json'));
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'passed', summary.issues.join('\n'));
		assert.equal(summary.effectiveCohortManifestSha256, index.effectiveCohortManifestSha256);
		assert.equal(summary.recoverySetSha256, canonicalHash([]));
		assert.equal(summary.recoverySetSha256, index.recoverySetSha256);
		assert.equal(summary.indexSha256, canonicalHash(index));
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate preserves infrastructure recovery as an effective-successor binding', () => {
	const fixture = aggregateFixture({ withInfrastructureRecoverySuccessor: true });
	try {
		runAggregate(fixture);
		const index = readJson(path.join(fixture.rootDir, 'verification/assignment-index.json'));
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'passed', summary.issues.join('\n'));
		assert.equal(
			summary.reviewRebaseInfrastructureRecoveryManifestSha256,
			index.reviewRebaseInfrastructureRecoveryManifestSha256
		);
		assert.equal(
			summary.reviewRebaseInfrastructureRecoveryId,
			index.reviewRebaseInfrastructureRecoveryId
		);
		assert.equal(summary.recoverySetSha256, canonicalHash([]));
		assert.equal(summary.indexSha256, canonicalHash(index));

		delete index.reviewRebaseInfrastructureRecoveryId;
		writeJson(path.join(fixture.rootDir, 'verification/assignment-index.json'), index);
		rmSync(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.throws(() => runAggregate(fixture), /Command failed/);
		assert.equal(existsSync(path.join(fixture.rootDir, 'verification/summary.json')), false);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate requires manifest authority exactly for typed review-rebase indexes', () => {
	const fixture = aggregateFixture();
	try {
		const indexPath = path.join(fixture.rootDir, 'verification/assignment-index.json');
		const index = readJson(indexPath);
		const targetId = index.assignments[0].ids[0];
		const remediations = [
			{
				issue: `${targetId} has a deterministic collection collision.`,
				preferredChallengeId: targetId
			}
		];
		const targetIds = [targetId];
		const shared = {
			reviewRebaseManifestSha256: '1'.repeat(64),
			reviewRebaseId: '2'.repeat(64),
			reviewRebaseCandidateSetSha256: index.candidateSetSha256,
			reviewRebaseCollectionValidationSha256: '3'.repeat(64),
			reviewRebaseCollectionRemediationSetSha256: canonicalHash(remediations),
			reviewRebaseCollectionRemediations: remediations,
			reviewRebaseCollectionRemediationTargetIds: targetIds,
			reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
		};
		Object.assign(index, shared);
		for (const assignment of index.assignments) {
			Object.assign(assignment, {
				reviewRebaseManifestSha256: shared.reviewRebaseManifestSha256,
				reviewRebaseId: shared.reviewRebaseId,
				reviewRebaseCandidateSetSha256: shared.reviewRebaseCandidateSetSha256,
				reviewRebaseCollectionRemediationSetSha256:
					shared.reviewRebaseCollectionRemediationSetSha256,
				reviewRebaseCollectionRemediations: assignment.ids.includes(targetId) ? remediations : []
			});
		}
		writeJson(indexPath, index);
		assert.throws(() => runAggregate(fixture), /Command failed/);
		assert.equal(existsSync(path.join(fixture.rootDir, 'verification/summary.json')), false);

		assert.throws(
			() =>
				execFileSync(
					process.execPath,
					[
						aggregateScript,
						'--index=verification/assignment-index.json',
						'--review-root=verification/reviews',
						'--output=verification/summary.json',
						'--dispatch-ledger=verification/dispatch-ledger.json',
						'--packet-manifest=verification/verifier-packets/manifest.json',
						'--review-rebase-manifest=missing-review-rebase.json',
						'--curriculum-remap-input=verification/curriculum-remap-verifier-input.json'
					],
					{ cwd: fixture.rootDir, encoding: 'utf8' }
				),
			/Command failed/
		);
		assert.equal(existsSync(path.join(fixture.rootDir, 'verification/summary.json')), false);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate rejects a result that does not bind the final three-verifier ledger hash', () => {
	const fixture = aggregateFixture();
	try {
		const reviewPath = path.join(fixture.rootDir, 'verification/reviews/science-001.json');
		const review = readJson(reviewPath);
		review.verifier.provenance.dispatchLedgerSha256 = 'f'.repeat(64);
		writeJson(reviewPath, review);
		assert.throws(() => runAggregate(fixture));
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'failed');
		assert.match(summary.issues.join('\n'), /Verifier provenance does not match/);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate rejects a canonical task name that differs from its dispatch row', () => {
	const fixture = aggregateFixture();
	try {
		const reviewPath = path.join(fixture.rootDir, 'verification/reviews/science-001.json');
		const review = readJson(reviewPath);
		review.verifier.provenance.taskName = '/root/science_verify_002';
		writeJson(reviewPath, review);
		assert.throws(() => runAggregate(fixture));
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'failed');
		assert.match(summary.issues.join('\n'), /Verifier provenance does not match/);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate preserves an exact proposal-bound descendant-remap decision', () => {
	const fixture = aggregateFixture({ withRemap: true });
	try {
		runAggregate(fixture);
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.deepEqual(summary.reviews[0].curriculumRemapDecisions, [
			{
				challengeId: 'challenge-001',
				field: 'grounding.curriculumComponentId',
				from: 'fixture-component-shared',
				to: 'fixture-component-shared-descendant',
				accepted: true
			}
		]);
		assert.deepEqual(
			findScienceChallengeCurriculumRemapDurableLeaks(summary.curriculumRemapDurableReceipt),
			[]
		);
		assert.doesNotMatch(
			JSON.stringify(summary.curriculumRemapDurableReceipt),
			/The broad parent component excerpt|The exact descendant component excerpt/
		);
		assert.equal(
			summary.curriculumRemapDurableReceiptSha256,
			canonicalHash(summary.curriculumRemapDurableReceipt)
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate rejects stale and unassigned remap decisions in OS-temp evidence', () => {
	for (const [withRemap, mutate, expected] of [
		[
			true,
			(review) => {
				review.reviews[0].curriculumRemapDecisions[0].to = 'fixture-component-stale';
			},
			/does not exactly match/
		],
		[
			false,
			(review) => {
				review.reviews[0].curriculumRemapDecisions = [
					{
						challengeId: review.reviews[0].id,
						field: 'grounding.curriculumComponentId',
						from: 'fixture-component-parent',
						to: 'fixture-component-descendant',
						accepted: false
					}
				];
			},
			/no assigned proposal/
		]
	]) {
		const fixture = aggregateFixture({ withRemap });
		try {
			const reviewPath = path.join(fixture.rootDir, 'verification/reviews/science-001.json');
			const review = readJson(reviewPath);
			mutate(review);
			writeJson(reviewPath, review);
			assert.throws(() => runAggregate(fixture));
			const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
			assert.match(summary.issues.join('\n'), expected);
		} finally {
			rmSync(fixture.rootDir, { recursive: true, force: true });
		}
	}
});

test('aggregate fails the full summary when an assigned remap is declined', () => {
	const fixture = aggregateFixture({ withRemap: true });
	try {
		const reviewPath = path.join(fixture.rootDir, 'verification/reviews/science-001.json');
		const review = readJson(reviewPath);
		review.reviews[0].curriculumRemapDecisions[0].accepted = false;
		writeJson(reviewPath, review);
		assert.throws(() => runAggregate(fixture));
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.acceptedCount, 408);
		assert.equal(summary.rejectedCount, 0);
		assert.equal(summary.acceptedRemapDecisionCount, 0);
		assert.equal(summary.rejectedRemapDecisionCount, 1);
		assert.equal(summary.status, 'failed');
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate rejects a hand-built proposal index without verifier-input authority', () => {
	const fixture = aggregateFixture({ withRemap: true });
	try {
		const indexPath = path.join(fixture.rootDir, 'verification/assignment-index.json');
		const ledgerPath = path.join(fixture.rootDir, 'verification/dispatch-ledger.json');
		const index = readJson(indexPath);
		delete index.curriculumRemapVerifierInputSha256;
		writeJson(indexPath, index);
		const ledger = readJson(ledgerPath);
		ledger.indexSha256 = canonicalHash(index);
		writeJson(ledgerPath, ledger);
		assert.throws(() => runAggregate(fixture), /Command failed/);
		assert.equal(existsSync(path.join(fixture.rootDir, 'verification/summary.json')), false);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate accepts two exact same-shard difficulty-plan decisions and all durable bindings', () => {
	const fixture = aggregateFixture({ withDifficulty: true });
	try {
		runAggregate(fixture);
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'passed', summary.issues.join('\n'));
		assert.equal(summary.acceptedDifficultyPlanAdjustmentDecisionCount, 2);
		assert.equal(summary.rejectedDifficultyPlanAdjustmentDecisionCount, 0);
		assert.equal(
			summary.difficultyPlanAdjustmentVerifierInputSha256,
			canonicalHash(
				readJson(
					path.join(fixture.rootDir, 'verification/difficulty-plan-adjustment-verifier-input.json')
				)
			)
		);
		assert.equal(
			summary.recoverySetSha256,
			readJson(
				path.join(fixture.rootDir, 'verification/difficulty-plan-adjustment-verifier-input.json')
			).recoverySetSha256
		);
		assert.deepEqual(
			summary.reviews
				.filter((review) => [mixedDifficultyTargetId, exactDifficultyTargetId].includes(review.id))
				.flatMap(
					(review) => review[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY]
				),
			[
				{
					challengeId: mixedDifficultyTargetId,
					field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
					from: 'starter',
					to: 'standard',
					accepted: true
				},
				{
					challengeId: exactDifficultyTargetId,
					field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
					from: 'stretch',
					to: 'standard',
					accepted: true
				}
			]
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate fails the full summary when one assigned difficulty-plan adjustment is declined', () => {
	const fixture = aggregateFixture({ withDifficulty: true });
	try {
		const reviewPath = path.join(fixture.rootDir, `verification/reviews/${difficultyShardId}.json`);
		const review = readJson(reviewPath);
		const targetReview = review.reviews.find((row) => row.id === exactDifficultyTargetId);
		targetReview[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY][0].accepted =
			false;
		writeJson(reviewPath, review);
		assert.throws(() => runAggregate(fixture));
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'failed');
		assert.equal(summary.acceptedCount, 408);
		assert.equal(summary.rejectedCount, 0);
		assert.equal(summary.acceptedDifficultyPlanAdjustmentDecisionCount, 1);
		assert.equal(summary.rejectedDifficultyPlanAdjustmentDecisionCount, 1);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate rejects a stale difficulty verifier-input hash before writing a summary', () => {
	const fixture = aggregateFixture({ withDifficulty: true });
	try {
		const inputPath = path.join(
			fixture.rootDir,
			'verification/difficulty-plan-adjustment-verifier-input.json'
		);
		const input = readJson(inputPath);
		input.effectiveCohortManifestSha256 = 'f'.repeat(64);
		writeJson(inputPath, input);
		assert.throws(() => runAggregate(fixture), /Command failed/);
		assert.equal(existsSync(path.join(fixture.rootDir, 'verification/summary.json')), false);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate rejects stale assignment difficulty proposals after all outer hashes are rebound', () => {
	const fixture = aggregateFixture({ withDifficulty: true });
	try {
		rebindAssignmentEvidence(fixture, difficultyShardId, (assignment) => {
			assignment[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY][0].to = 'starter';
		});
		assert.throws(() => runAggregate(fixture));
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'failed');
		assert.match(
			summary.issues.join('\n'),
			/difficulty-plan adjustment proposals|proposal.*differs|proposal\.proposalSha256/i
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate rejects stale reviewer-visible difficulty evidence after outer hashes are rebound', () => {
	const fixture = aggregateFixture({ withDifficulty: true });
	try {
		rebindAssignmentEvidence(fixture, difficultyShardId, (assignment) => {
			assignment[
				SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY
			][0].originalSingleIssueGate.repair = 'A stale but syntactically valid repair.';
		});
		assert.throws(() => runAggregate(fixture));
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'failed');
		assert.match(
			summary.issues.join('\n'),
			/reviewer-visible difficulty-plan adjustment evidence differs/i
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('aggregate rejects a packet wave with a stale difficulty proposal binding', () => {
	const fixture = aggregateFixture({ withDifficulty: true });
	try {
		const packetManifestPath = path.join(
			fixture.rootDir,
			'verification/verifier-packets/manifest.json'
		);
		const packetManifest = readJson(packetManifestPath);
		const manifestRow = packetManifest.packets.find((record) => {
			const packet = readJson(path.join(fixture.rootDir, record.packetPath));
			return packet.waves.some((wave) => wave.assignmentId === difficultyShardId);
		});
		const packetPath = path.join(fixture.rootDir, manifestRow.packetPath);
		const packet = readJson(packetPath);
		const wave = packet.waves.find(
			(candidateWave) => candidateWave.assignmentId === difficultyShardId
		);
		wave[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] = [];
		writeJson(packetPath, packet);
		manifestRow.packetSha256 = canonicalHash(packet);
		writeJson(packetManifestPath, packetManifest);
		assert.throws(() => runAggregate(fixture));
		const summary = readJson(path.join(fixture.rootDir, 'verification/summary.json'));
		assert.equal(summary.status, 'failed');
		assert.match(
			summary.issues.join('\n'),
			/difficulty-plan adjustment packet binding.*missing or stale/i
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

function aggregateFixture({
	withRemap = false,
	withDifficulty = false,
	withEmptyReviewRebaseSuccessor = false,
	withInfrastructureRecoverySuccessor = false
} = {}) {
	if (
		(withEmptyReviewRebaseSuccessor || withInfrastructureRecoverySuccessor) &&
		(withRemap || withDifficulty)
	) {
		throw new Error('Empty review-rebase successor fixture cannot contain typed recoveries.');
	}
	const rootDir = mkdtempSync(path.join(tmpdir(), 'science-verification-aggregate-'));
	const verificationRoot = path.join(rootDir, 'verification');
	const assignmentRoot = path.join(verificationRoot, 'assignments');
	const reviewRoot = path.join(verificationRoot, 'reviews');
	mkdirSync(assignmentRoot, { recursive: true });
	mkdirSync(reviewRoot, { recursive: true });
	const sourceSnapshotSha256 = 'b'.repeat(64);
	const curriculumEvidenceSha256 = 'c'.repeat(64);
	const assignments = [];
	const assignmentValues = new Map();
	const planRows = Array.from({ length: 408 }, (_unused, planRowIndex) => {
		const assignmentIndex = Math.floor(planRowIndex / 8);
		const assignmentId = `science-${String(assignmentIndex + 1).padStart(3, '0')}`;
		const id =
			planRowIndex === 160
				? mixedDifficultyTargetId
				: planRowIndex === 161
					? exactDifficultyTargetId
					: `challenge-${String(planRowIndex + 1).padStart(3, '0')}`;
		return {
			id,
			shard: assignmentId,
			curriculumComponentId:
				planRowIndex === 0 && withRemap
					? 'fixture-component-shared-descendant'
					: planRowIndex === 0 || planRowIndex === 8
						? 'fixture-component-shared'
						: `fixture-component-${String(planRowIndex + 1).padStart(3, '0')}`,
			difficulty: 'standard',
			taskShape: 'explanation',
			arc: 'connect-cause-to-effect',
			mechanic: 'missing-link'
		};
	});
	const effectivePlan = { planId: 'science-fixture-v1', rows: planRows };
	const basePlan = structuredClone(effectivePlan);
	if (withRemap) basePlan.rows[0].curriculumComponentId = 'fixture-component-shared';
	if (withDifficulty) {
		basePlan.rows[160].difficulty = 'starter';
		basePlan.rows[161].difficulty = 'stretch';
	}
	const planSha256 = canonicalHash(effectivePlan);
	const basePlanSha256 = canonicalHash(basePlan);
	const candidateById = new Map(
		planRows.map((row) => [
			row.id,
			{
				definition: {
					id: row.id,
					title: `Fixture ${row.id}?`,
					previewQuestion: `Opening context for ${row.id}.`,
					transferPromptLead: `Transfer context for ${row.id}.`,
					difficulty: row.difficulty
				},
				grounding: { curriculumComponentId: row.curriculumComponentId }
			}
		])
	);
	const difficultyArtifacts = withDifficulty
		? buildDifficultySetRecovery({
				basePlan,
				curriculumEvidenceSha256,
				candidateById
			})
		: null;
	for (const candidate of difficultyArtifacts?.candidate?.challenges ?? []) {
		candidateById.set(candidate.definition.id, candidate);
	}
	const candidates = planRows.map((row) => candidateById.get(row.id));
	const candidateSetSha256 = canonicalHash(candidates);
	const difficultyRecoveries = difficultyArtifacts
		? [
				{
					manifest: difficultyArtifacts.manifest,
					priorCandidate: difficultyArtifacts.priorCandidate,
					candidate: difficultyArtifacts.candidate
				}
			]
		: [];
	const difficultyEffectiveCohortManifest = difficultyArtifacts
		? {
				schemaVersion: 'science-challenge-effective-cohort/v1',
				planId: effectivePlan.planId,
				basePlanSha256: canonicalHash(basePlan),
				effectivePlanSha256: canonicalHash(effectivePlan),
				candidateCount: effectivePlan.rows.length,
				candidateSetSha256,
				difficultyAdjustmentManifestSetSha256: canonicalHash([difficultyArtifacts.manifest]),
				recoverySetSha256: canonicalHash(difficultyRecoveries)
			}
		: null;
	const difficultyVerifierInput = difficultyArtifacts
		? buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts({
				basePlan,
				effectivePlan,
				effectiveCohortManifest: difficultyEffectiveCohortManifest,
				effectiveCohortManifestSha256: canonicalHash(difficultyEffectiveCohortManifest),
				recoveries: [difficultyArtifacts]
			})
		: null;
	let remapArtifacts = null;

	for (let assignmentIndex = 0; assignmentIndex < 51; assignmentIndex += 1) {
		const assignmentId = `science-${String(assignmentIndex + 1).padStart(3, '0')}`;
		const rows = planRows.filter((row) => row.shard === assignmentId);
		const ids = rows.map((row) => row.id);
		const items = rows.map((row) => ({
			planRowIndex: planRows.indexOf(row),
			plan: row,
			candidate: candidateById.get(row.id),
			sameCurriculumComponentPeerEvidence: buildSameCurriculumComponentPeerEvidence({
				currentRow: row,
				planRows,
				candidateById
			})
		}));
		const assignmentCore = {
			schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA,
			assignmentId,
			planSha256,
			basePlanSha256,
			effectivePlanSha256: planSha256,
			sourceSnapshotSha256,
			curriculumEvidenceSha256,
			items
		};
		if (withRemap && assignmentIndex === 0) {
			const stagedCandidate = {
				schemaVersion: 'science-challenge-batch/v1',
				challenges: rows.map((row) => candidateById.get(row.id))
			};
			const priorCandidate = structuredClone(stagedCandidate);
			priorCandidate.challenges[0].grounding.curriculumComponentId =
				basePlan.rows[0].curriculumComponentId;
			const remapEffectivePlan = structuredClone(basePlan);
			remapEffectivePlan.rows[0].curriculumComponentId =
				effectivePlan.rows[0].curriculumComponentId;
			const manifest = remapManifest({
				basePlan,
				effectivePlan: remapEffectivePlan,
				priorCandidate,
				candidate: stagedCandidate,
				challengeId: rows[0].id,
				shardId: assignmentId,
				from: basePlan.rows[0].curriculumComponentId,
				to: rows[0].curriculumComponentId,
				planRowIndex: 0,
				curriculumEvidenceSha256
			});
			const proposal = buildScienceChallengeCurriculumRemapProposal({
				challengeId: rows[0].id,
				field: 'grounding.curriculumComponentId',
				from: manifest.remap.from,
				to: manifest.remap.to,
				basePlanSha256,
				effectivePlanSha256: planSha256,
				curriculumEvidenceSha256,
				targetCandidateSha256: canonicalHash(candidateById.get(rows[0].id)),
				batchCandidateSha256: canonicalHash(stagedCandidate),
				baseReviewSha256: '6'.repeat(64),
				manifestSha256: canonicalHash(manifest)
			});
			remapArtifacts = { stagedCandidate, priorCandidate, manifest };
			assignmentCore.curriculumRemapProposals = [proposal];
			assignmentCore.curriculumRemapProposalEvidence = [remapDisplayEvidence(proposal)];
		}
		if (withDifficulty && assignmentId === difficultyShardId) {
			assignmentCore[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] =
				difficultyVerifierInput.proposals.filter((proposal) => ids.includes(proposal.challengeId));
			assignmentCore[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] =
				difficultyVerifierInput.proposalEvidence.filter((evidence) =>
					ids.includes(evidence.challengeId)
				);
		}
		const assignment = {
			...assignmentCore,
			evidenceSha256: canonicalHash(assignmentCore)
		};
		const assignmentPath = path.join(assignmentRoot, `${assignmentId}.json`);
		writeJson(assignmentPath, assignment);
		assignmentValues.set(assignmentId, assignment);
		const assignmentRecord = {
			assignmentId,
			path: path.relative(rootDir, assignmentPath),
			sha256: canonicalHash(assignment),
			ids
		};
		if (assignmentCore.curriculumRemapProposals) {
			assignmentRecord.curriculumRemapProposals = assignmentCore.curriculumRemapProposals;
			assignmentRecord.curriculumRemapProposalEvidence =
				assignmentCore.curriculumRemapProposalEvidence;
		}
		if (assignmentCore[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY]) {
			assignmentRecord[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY] =
				assignmentCore[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY];
			assignmentRecord[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY] =
				assignmentCore[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_EVIDENCE_PROPERTY];
		}
		assignments.push(assignmentRecord);
	}

	const combinedRecoveries = [
		...(remapArtifacts
			? [
					{
						manifest: remapArtifacts.manifest,
						priorCandidate: remapArtifacts.priorCandidate,
						candidate: remapArtifacts.stagedCandidate
					}
				]
			: []),
		...(difficultyArtifacts
			? [
					{
						manifest: difficultyArtifacts.manifest,
						priorCandidate: difficultyArtifacts.priorCandidate,
						candidate: difficultyArtifacts.candidate
					}
				]
			: [])
	];
	const recoverySetSha256 = combinedRecoveries.length
		? canonicalHash(combinedRecoveries)
		: withEmptyReviewRebaseSuccessor || withInfrastructureRecoverySuccessor
			? canonicalHash([])
			: null;
	const remapVerifierInput = withRemap
		? buildScienceChallengeCurriculumRemapVerifierInput({
				basePlan,
				basePlanSha256,
				effectivePlan,
				curriculumCatalogSha256: 'd'.repeat(64),
				effectiveCohortManifestSha256: 'e'.repeat(64),
				candidateCount: effectivePlan.rows.length,
				candidateSetSha256,
				remapManifestSetSha256: canonicalHash([remapArtifacts.manifest]),
				recoveries: combinedRecoveries,
				recoverySetSha256,
				candidateOverrides: [
					{
						shardId: 'science-001',
						manifest: remapArtifacts.manifest,
						candidate: remapArtifacts.stagedCandidate,
						priorCandidate: remapArtifacts.priorCandidate,
						candidateSha256: canonicalHash(remapArtifacts.stagedCandidate),
						manifestSha256: canonicalHash(remapArtifacts.manifest)
					}
				],
				proposals: assignments.flatMap((assignment) => assignment.curriculumRemapProposals ?? []),
				evidence: assignments.flatMap(
					(assignment) => assignment.curriculumRemapProposalEvidence ?? []
				)
			})
		: null;
	const index = {
		schemaVersion: 'science-challenge-verification-assignment-index/v1',
		planId: 'science-fixture-v1',
		planSha256,
		basePlanSha256,
		effectivePlanSha256: planSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		candidateCount: effectivePlan.rows.length,
		candidateSetSha256,
		...(recoverySetSha256 ? { recoverySetSha256 } : {}),
		...(withEmptyReviewRebaseSuccessor || withInfrastructureRecoverySuccessor
			? { effectiveCohortManifestSha256: '6'.repeat(64) }
			: {}),
		...(withInfrastructureRecoverySuccessor
			? {
					reviewRebaseInfrastructureRecoveryManifestSha256: '7'.repeat(64),
					reviewRebaseInfrastructureRecoveryId: '8'.repeat(64)
				}
			: {}),
		...(remapVerifierInput
			? {
					curriculumCatalogSha256: remapVerifierInput.curriculumCatalogSha256,
					effectiveCohortManifestSha256: remapVerifierInput.effectiveCohortManifestSha256,
					remapManifestSetSha256: remapVerifierInput.remapManifestSetSha256
				}
			: {}),
		...(difficultyVerifierInput
			? {
					effectiveCohortManifestSha256: difficultyVerifierInput.effectiveCohortManifestSha256,
					difficultyAdjustmentManifestSetSha256: difficultyVerifierInput.adjustmentManifestSetSha256
				}
			: {}),
		assignments
	};
	if (withRemap) {
		index.curriculumRemapVerifierInputSha256 = canonicalHash(remapVerifierInput);
		writeJson(
			path.join(verificationRoot, 'curriculum-remap-verifier-input.json'),
			remapVerifierInput
		);
	}
	if (withDifficulty) {
		index.difficultyPlanAdjustmentVerifierInputSha256 = canonicalHash(difficultyVerifierInput);
		writeJson(
			path.join(verificationRoot, 'difficulty-plan-adjustment-verifier-input.json'),
			difficultyVerifierInput
		);
	}
	writeJson(path.join(verificationRoot, 'assignment-index.json'), index);
	const dispatches = assignments.map((assignment, assignmentIndex) => {
		const verifierIndex = Math.floor(assignmentIndex / 17) + 1;
		return {
			assignmentId: assignment.assignmentId,
			assignmentPath: assignment.path,
			assignmentSha256: assignment.sha256,
			orchestrator: 'codex-collaboration',
			taskName: `/root/science_verify_${String(verifierIndex).padStart(3, '0')}`,
			forkTurns: 'none',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max'
		};
	});
	const ledger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		orchestrator: 'codex-collaboration',
		indexSha256: canonicalHash(index),
		createdAt: '2026-07-22T00:00:00.000Z',
		dispatches
	};
	writeJson(path.join(verificationRoot, 'dispatch-ledger.json'), ledger);
	const ledgerSha256 = canonicalHash(ledger);
	if (withRemap || withDifficulty || withInfrastructureRecoverySuccessor) {
		const packetRoot = path.join(verificationRoot, 'verifier-packets');
		const packetBundle = buildScienceChallengeVerifierPacketBundle({
			assignmentIndex: index,
			dispatchLedger: ledger,
			assignmentIndexPath: path.relative(
				rootDir,
				path.join(verificationRoot, 'assignment-index.json')
			),
			dispatchLedgerPath: path.relative(
				rootDir,
				path.join(verificationRoot, 'dispatch-ledger.json')
			),
			packetRootPath: path.relative(rootDir, packetRoot),
			reviewRootPath: path.relative(rootDir, reviewRoot)
		});
		for (const artifact of packetBundle.artifacts) {
			writeJson(path.join(packetRoot, artifact.relativePath), artifact.value);
		}
		writeJson(path.join(packetRoot, 'manifest.json'), packetBundle.manifest);
	}

	for (const [assignmentIndex, assignment] of assignments.entries()) {
		const dispatch = dispatches[assignmentIndex];
		const assignmentReviews = assignment.ids.map(acceptedReview);
		if (withRemap && assignmentIndex === 0) {
			const proposal = assignment.curriculumRemapProposals[0];
			assignmentReviews[0].curriculumRemapDecisions = [
				{
					challengeId: proposal.challengeId,
					field: proposal.field,
					from: proposal.from,
					to: proposal.to,
					accepted: true
				}
			];
		}
		if (withDifficulty && assignment.assignmentId === difficultyShardId) {
			for (const proposal of assignment[
				SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_PROPOSAL_PROPERTY
			]) {
				const targetReview = assignmentReviews.find((review) => review.id === proposal.challengeId);
				targetReview[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY] = [
					{
						challengeId: proposal.challengeId,
						field: proposal.field,
						from: proposal.from,
						to: proposal.to,
						accepted: true
					}
				];
			}
		}
		writeJson(path.join(reviewRoot, `${assignment.assignmentId}.json`), {
			schemaVersion: 'science-challenge-independent-verification/v1',
			assignmentId: assignment.assignmentId,
			assignmentEvidenceSha256: assignmentValues.get(assignment.assignmentId).evidenceSha256,
			verifier: {
				context: 'empty',
				model: 'gpt-5.6-sol',
				reasoningEffort: 'max',
				reviewedAt: '2026-07-22T01:00:00.000Z',
				provenance: {
					orchestrator: 'codex-collaboration',
					taskName: dispatch.taskName,
					forkTurns: 'none',
					dispatchLedgerSha256: ledgerSha256
				}
			},
			reviews: assignmentReviews
		});
	}
	return { rootDir };
}

function acceptedReview(id) {
	return {
		id,
		accepted: true,
		curriculumGrounded: true,
		paperCalibrated: true,
		scientificallyCorrect: true,
		contextsDistinct: true,
		selfContained: true,
		flowCoherent: true,
		choicesFair: true,
		difficultyCalibrated: true,
		learnerCopyClean: true,
		artBriefsSafe: true,
		heroTeaserSafe: true,
		checkedCalculations: [],
		issues: []
	};
}

function buildDifficultySetRecovery({ basePlan, curriculumEvidenceSha256, candidateById }) {
	const shardRows = basePlan.rows.filter((row) => row.shard === difficultyShardId);
	const priorCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: shardRows.map((row) => {
			const candidate = structuredClone(candidateById.get(row.id));
			candidate.definition.difficulty = row.difficulty;
			return candidate;
		})
	};
	const priorValidation = {
		status: 'passed',
		issues: [],
		candidateSha256: canonicalHash(priorCandidate)
	};
	const mixedDifficultyIssue = {
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		category: 'calibration',
		evidence: 'The multi-link giant covalent task is not credibly labelled starter.',
		repair: 'Raise the difficulty to standard.'
	};
	const exactDifficultyIssue = {
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		category: 'calibration',
		evidence: 'The direct two-mark conductor explanation does not support the stretch label.',
		repair: 'Label the challenge standard rather than stretch.'
	};
	const reviews = basePlan.rows.map((row) => {
		const review = acceptedReview(row.id);
		if (row.id === mixedDifficultyTargetId) {
			review.contextsDistinct = false;
			review.difficultyCalibrated = false;
			review.accepted = false;
			review.issues = [
				{
					field: 'definition.transferPromptLead',
					category: 'distinctness',
					evidence: 'Opening and transfer repeat the same high-melting explanation.',
					repair: 'Use a materially different transfer property.'
				},
				mixedDifficultyIssue
			];
		}
		if (row.id === exactDifficultyTargetId) {
			review.difficultyCalibrated = false;
			review.accepted = false;
			review.issues = [exactDifficultyIssue];
		}
		return review;
	});
	const assignmentCore = {
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA,
		assignmentId: difficultyShardId,
		planId: basePlan.planId,
		planSha256: canonicalHash(basePlan),
		curriculumEvidenceSha256,
		items: shardRows.map((row) => ({
			planRowIndex: basePlan.rows.findIndex((candidateRow) => candidateRow.id === row.id),
			plan: row,
			candidate: priorCandidate.challenges.find((candidate) => candidate.definition.id === row.id)
		}))
	};
	const firstAssignment = {
		...assignmentCore,
		evidenceSha256: canonicalHash(assignmentCore)
	};
	const dispatchLedger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		dispatches: [
			{
				assignmentId: difficultyShardId,
				assignmentSha256: canonicalHash(firstAssignment),
				taskName: '/root/blind_verifier_beta',
				orchestrator: 'codex-collaboration',
				forkTurns: 'none',
				model: 'gpt-5.6-sol',
				reasoningEffort: 'max'
			}
		]
	};
	const dispatchLedgerSha256 = canonicalHash(dispatchLedger);
	const firstReviewResult = {
		schemaVersion: 'science-challenge-independent-verification/v1',
		assignmentId: difficultyShardId,
		assignmentEvidenceSha256: firstAssignment.evidenceSha256,
		verifier: {
			context: 'empty',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max',
			reviewedAt: '2026-07-23T00:00:00.000Z',
			provenance: {
				orchestrator: 'codex-collaboration',
				taskName: '/root/blind_verifier_beta',
				forkTurns: 'none',
				dispatchLedgerSha256
			}
		},
		reviews: reviews.filter((review) => shardRows.some((row) => row.id === review.id))
	};
	const firstReviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: basePlan.planId,
		planSha256: canonicalHash(basePlan),
		curriculumEvidenceSha256,
		dispatchLedgerSha256,
		status: 'failed',
		reviewCount: reviews.length,
		acceptedCount: reviews.filter((review) => review.accepted).length,
		rejectedCount: reviews.filter((review) => !review.accepted).length,
		issues: [],
		assignmentResults: [
			{
				assignmentId: difficultyShardId,
				sha256: canonicalHash(firstReviewResult),
				status: 'passed',
				issues: []
			}
		],
		reviews
	};
	const terminalCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: shardRows.map((row) => structuredClone(candidateById.get(row.id)))
	};
	terminalCandidate.challenges.find(
		(candidate) => candidate.definition.id === mixedDifficultyTargetId
	).definition.title = 'Repaired giant covalent transfer';
	const attempts = [1, 2, 3, 4].map((attempt) => {
		const candidate =
			attempt === 4 ? structuredClone(terminalCandidate) : structuredClone(priorCandidate);
		const runSummary = { status: 'passed', attempt };
		return {
			attempt,
			status: 'failed',
			candidate,
			runSummary,
			sourceValidation: {
				status: 'failed',
				issues: ['Synthetic immutable failed repair attempt.'],
				candidateSha256: canonicalHash(candidate),
				runSummarySha256: canonicalHash(runSummary),
				verificationRepairCohortIssues: []
			},
			runPolicy: { status: 'passed', issues: [] },
			fileBindings: {
				attemptDirectory: `attempt-${String(attempt).padStart(2, '0')}`,
				candidateSha256: canonicalHash(candidate)
			}
		};
	});
	const result = buildScienceChallengeDifficultyPlanAdjustmentSet({
		plan: basePlan,
		shardId: difficultyShardId,
		repairSha256: canonicalHash(firstReviewSummary),
		curriculumEvidenceSha256,
		objectiveId: 'd'.repeat(64),
		executionId: 'e'.repeat(64),
		requestedAdjustments: [
			{
				challengeId: mixedDifficultyTargetId,
				field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
				from: 'starter',
				to: 'standard'
			},
			{
				challengeId: exactDifficultyTargetId,
				field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
				from: 'stretch',
				to: 'standard'
			}
		],
		priorCandidate,
		priorValidation,
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger,
		attempts,
		validateBatchCandidate: difficultyValidationAdapter()
	});
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	return {
		manifest: result.manifest,
		candidate: result.candidate,
		priorCandidate,
		firstReviewSummary
	};
}

function difficultyValidationAdapter() {
	return (candidate, rows, context) => {
		const status = context.validationMode === 'base-plan-negative-control' ? 'failed' : 'passed';
		return {
			status,
			issues: status === 'passed' ? [] : ['definition.difficulty differs from the plan row.'],
			candidateSha256: canonicalHash(candidate),
			planRowsSha256: canonicalHash(rows),
			planSha256: canonicalHash(context.effectivePlan ?? context.basePlan),
			candidateCount: candidate.challenges.length
		};
	};
}

function remapDisplayEvidence(proposal) {
	return {
		challengeId: proposal.challengeId,
		proposalSha256: proposal.proposalSha256,
		field: proposal.field,
		from: {
			componentId: proposal.from,
			title: 'Shared component',
			sourceTextSha256: '1'.repeat(64),
			substantiveExcerpt: 'The broad parent component excerpt.'
		},
		to: {
			componentId: proposal.to,
			title: 'Exact descendant',
			sourceTextSha256: '2'.repeat(64),
			substantiveExcerpt: 'The exact descendant component excerpt.'
		},
		ancestryChain: [
			{ componentId: proposal.from, title: 'Shared component' },
			{ componentId: proposal.to, title: 'Exact descendant' }
		],
		targetRowDiffStatement: 'Only the curriculum component id changes.',
		originalSingleIssueGate: {
			field: proposal.field,
			category: 'curriculum',
			evidence: 'The original component was too broad.',
			repair: 'Use the exact descendant.'
		}
	};
}

function remapManifest({
	basePlan,
	effectivePlan,
	priorCandidate,
	candidate,
	challengeId,
	shardId,
	from,
	to,
	planRowIndex,
	curriculumEvidenceSha256
}) {
	const remap = {
		challengeId,
		field: 'grounding.curriculumComponentId',
		from,
		to
	};
	const inverseRemap = {
		challengeId,
		field: remap.field,
		from: to,
		to: from
	};
	const priorTarget = priorCandidate.challenges.find(
		(entry) => entry.definition.id === challengeId
	);
	const candidateTarget = candidate.challenges.find((entry) => entry.definition.id === challengeId);
	const manifestCore = {
		schemaVersion: 'science-challenge-verifier-directed-descendant-remap/v1',
		disposition: 'deterministic-verifier-directed-descendant-remap',
		shardId,
		challengeId,
		field: 'grounding.curriculumComponentId',
		base: {
			planSha256: canonicalHash(basePlan),
			planRowIndex,
			planRowSha256: canonicalHash(basePlan.rows[planRowIndex]),
			component: { curriculumComponentId: from },
			componentSha256: canonicalHash({ curriculumComponentId: from })
		},
		effective: {
			planSha256: canonicalHash(effectivePlan),
			planRowIndex,
			planRowSha256: canonicalHash(effectivePlan.rows[planRowIndex]),
			component: { curriculumComponentId: to },
			componentSha256: canonicalHash({ curriculumComponentId: to })
		},
		evidence: { curriculumEvidenceSha256 },
		firstReview: {
			summarySha256: '6'.repeat(64),
			reviewSha256: '5'.repeat(64)
		},
		sourceAttempt: { status: 'failed', attempt: 4 },
		attemptBudget: {
			maxAttempts: 4,
			exhausted: true,
			selectedAttempt: 4,
			attempts: [1, 2, 3, 4].map((attempt) => ({ attempt, status: 'failed' }))
		},
		priorCandidateSha256: canonicalHash(priorCandidate),
		candidateSha256: canonicalHash(candidate),
		remap,
		remapSha256: canonicalHash(remap),
		inverseRemap,
		inverseRemapSha256: canonicalHash(inverseRemap),
		priorTargetSha256: canonicalHash(priorTarget),
		candidateTargetSha256: canonicalHash(candidateTarget),
		inverseTargetSha256: canonicalHash(priorTarget)
	};
	return {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
}

function runAggregate(fixture) {
	const packetManifestPath = path.join(
		fixture.rootDir,
		'verification/verifier-packets/manifest.json'
	);
	execFileSync(
		process.execPath,
		[
			aggregateScript,
			'--index=verification/assignment-index.json',
			'--review-root=verification/reviews',
			'--output=verification/summary.json',
			'--dispatch-ledger=verification/dispatch-ledger.json',
			'--curriculum-remap-input=verification/curriculum-remap-verifier-input.json',
			'--difficulty-plan-adjustment-input=verification/difficulty-plan-adjustment-verifier-input.json',
			...(existsSync(packetManifestPath)
				? ['--packet-manifest=verification/verifier-packets/manifest.json']
				: [])
		],
		{ cwd: fixture.rootDir, encoding: 'utf8' }
	);
}

function rebindAssignmentEvidence(fixture, assignmentId, mutate) {
	const verificationRoot = path.join(fixture.rootDir, 'verification');
	const assignmentPath = path.join(verificationRoot, 'assignments', `${assignmentId}.json`);
	const assignment = readJson(assignmentPath);
	mutate(assignment);
	const { evidenceSha256: _priorEvidenceSha256, ...assignmentCore } = assignment;
	assignment.evidenceSha256 = canonicalHash(assignmentCore);
	writeJson(assignmentPath, assignment);

	const indexPath = path.join(verificationRoot, 'assignment-index.json');
	const index = readJson(indexPath);
	const assignmentRecord = index.assignments.find((record) => record.assignmentId === assignmentId);
	assignmentRecord.sha256 = canonicalHash(assignment);
	writeJson(indexPath, index);

	const ledgerPath = path.join(verificationRoot, 'dispatch-ledger.json');
	const ledger = readJson(ledgerPath);
	ledger.indexSha256 = canonicalHash(index);
	ledger.dispatches.find((dispatch) => dispatch.assignmentId === assignmentId).assignmentSha256 =
		assignmentRecord.sha256;
	writeJson(ledgerPath, ledger);
	const dispatchLedgerSha256 = canonicalHash(ledger);

	for (const record of index.assignments) {
		const reviewPath = path.join(verificationRoot, 'reviews', `${record.assignmentId}.json`);
		const review = readJson(reviewPath);
		review.verifier.provenance.dispatchLedgerSha256 = dispatchLedgerSha256;
		if (record.assignmentId === assignmentId) {
			review.assignmentEvidenceSha256 = assignment.evidenceSha256;
		}
		writeJson(reviewPath, review);
	}

	const packetRoot = path.join(verificationRoot, 'verifier-packets');
	const packetBundle = buildScienceChallengeVerifierPacketBundle({
		assignmentIndex: index,
		dispatchLedger: ledger,
		assignmentIndexPath: path.relative(fixture.rootDir, indexPath),
		dispatchLedgerPath: path.relative(fixture.rootDir, ledgerPath),
		packetRootPath: path.relative(fixture.rootDir, packetRoot),
		reviewRootPath: path.relative(fixture.rootDir, path.join(verificationRoot, 'reviews'))
	});
	for (const artifact of packetBundle.artifacts) {
		writeJson(path.join(packetRoot, artifact.relativePath), artifact.value);
	}
	writeJson(path.join(packetRoot, 'manifest.json'), packetBundle.manifest);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}
