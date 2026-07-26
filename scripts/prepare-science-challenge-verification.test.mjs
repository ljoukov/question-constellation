import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import {
	canonicalHash,
	SCIENCE_CHALLENGE_BATCH_SCHEMA,
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	SCIENCE_QUESTION_ART_SCHEMA,
	validateGeneratedChallengeCollection,
	stableStringify
} from './lib/science-challenge-release.mjs';
import {
	buildScienceChallengeCurriculumRemapProposal,
	buildScienceChallengeCurriculumRemapVerifierInput
} from './lib/science-challenge-curriculum-remap-review.mjs';
import {
	buildScienceChallengeDifficultyPlanAdjustmentProposal,
	buildScienceChallengeDifficultyPlanAdjustmentProposalEvidence,
	buildScienceChallengeDifficultyPlanAdjustmentVerifierInput
} from './lib/science-challenge-difficulty-plan-adjustment-review.mjs';
import {
	stageScienceChallengeEffectiveCohort,
	stageScienceChallengeEffectiveCohortSuccessor
} from './lib/science-challenge-effective-cohort.mjs';
import {
	publishScienceChallengeReviewRebaseEvidence,
	SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA
} from './lib/science-challenge-review-rebase-evidence.mjs';
import { SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA } from './lib/science-challenge-review-rebase.mjs';
import {
	buildScienceChallengeReviewRebaseSuccessorEmptyRecoveryBinding,
	requireContentVerificationEvidence
} from './lib/science-challenge-review-evidence.mjs';
import { validateScienceChallengeAssignmentPeerEvidence } from './lib/science-challenge-verification-peers.mjs';

const cliPath = fileURLToPath(
	new URL('./prepare-science-challenge-verification.mjs', import.meta.url)
);
const aggregateCliPath = fileURLToPath(
	new URL('./aggregate-science-challenge-verification.mjs', import.meta.url)
);
const generatorCliPath = fileURLToPath(
	new URL('./generate-science-challenges.mjs', import.meta.url)
);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

test('includes every same-component peer across shards in deterministic plan order', () => {
	const fixture = createFixture();
	try {
		const firstRun = runCli(fixture);
		assert.equal(firstRun.status, 0, firstRun.stderr);
		const index = readJson(path.join(fixture.outputRoot, 'assignment-index.json'));
		const assignments = readAssignments(fixture, index);
		const validation = validateScienceChallengeAssignmentPeerEvidence({
			assignments,
			planRows: fixture.plan.rows
		});
		assert.equal(validation.status, 'passed', validation.issues.join('\n'));

		for (const assignment of assignments) {
			const indexRow = index.assignments.find(
				(row) => row.assignmentId === assignment.assignmentId
			);
			assert.equal(canonicalHash(assignment), indexRow.sha256);
			const { evidenceSha256, ...assignmentCore } = assignment;
			assert.equal(evidenceSha256, canonicalHash(assignmentCore));
			for (const item of assignment.items) {
				const current = item.plan;
				const expectedPeers = fixture.plan.rows
					.map((row, planRowIndex) => ({ row, planRowIndex }))
					.filter(
						({ row }) =>
							row.id !== current.id && row.curriculumComponentId === current.curriculumComponentId
					);
				const evidence = item.sameCurriculumComponentPeerEvidence;
				assert.equal(evidence.curriculumComponentId, current.curriculumComponentId);
				assert.deepEqual(
					evidence.peers.map((peer) => peer.planSummary.id),
					expectedPeers.map(({ row }) => row.id)
				);
				assert.deepEqual(
					evidence.peers.map((peer) => peer.planSummary.planRowIndex),
					expectedPeers.map(({ planRowIndex }) => planRowIndex)
				);
				for (const peer of evidence.peers) {
					assert.equal(
						peer.candidateSha256,
						canonicalHash(fixture.candidateById.get(peer.planSummary.id))
					);
				}
			}
		}

		const singleton = assignments
			.flatMap((assignment) => assignment.items)
			.find((item) => item.plan.id === 'biology-beta-only');
		assert.deepEqual(singleton.sameCurriculumComponentPeerEvidence.peers, []);

		const firstSnapshot = outputSnapshot(fixture.outputRoot);
		reverseCandidateFileOrder(fixture);
		const secondRun = runCli(fixture);
		assert.equal(secondRun.status, 0, secondRun.stderr);
		assert.deepEqual(outputSnapshot(fixture.outputRoot), firstSnapshot);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('peer edits are exposed by assignment hashes and rejected after local rehashing', () => {
	const fixture = createFixture();
	try {
		const run = runCli(fixture);
		assert.equal(run.status, 0, run.stderr);
		const index = readJson(path.join(fixture.outputRoot, 'assignment-index.json'));
		const assignments = readAssignments(fixture, index);
		const assignmentIndex = assignments.findIndex(
			(assignment) => assignment.assignmentId === 'science-003'
		);
		const indexRow = index.assignments.find(
			(assignment) => assignment.assignmentId === 'science-003'
		);
		const tampered = structuredClone(assignments[assignmentIndex]);
		tampered.items[0].sameCurriculumComponentPeerEvidence.peers[0].candidateSummary.previewQuestion =
			'Tampered peer context.';

		const { evidenceSha256, ...tamperedCore } = tampered;
		assert.notEqual(evidenceSha256, canonicalHash(tamperedCore));
		assert.notEqual(canonicalHash(tampered), indexRow.sha256);

		tampered.evidenceSha256 = canonicalHash(tamperedCore);
		assert.notEqual(canonicalHash(tampered), indexRow.sha256);

		const locallyRehashedAssignments = [...assignments];
		locallyRehashedAssignments[assignmentIndex] = tampered;
		const validation = validateScienceChallengeAssignmentPeerEvidence({
			assignments: locallyRehashedAssignments,
			planRows: fixture.plan.rows
		});
		assert.equal(validation.status, 'failed');
		assert.match(
			validation.issues.join('\n'),
			/biology-alpha-two\.sameCurriculumComponentPeerEvidence is incomplete, reordered or stale/
		);

		const missingPeer = structuredClone(assignments[assignmentIndex]);
		missingPeer.items[0].sameCurriculumComponentPeerEvidence.peers.pop();
		const reboundMissingPeer = rebindAssignment(missingPeer);
		locallyRehashedAssignments[assignmentIndex] = reboundMissingPeer;
		const missingValidation = validateScienceChallengeAssignmentPeerEvidence({
			assignments: locallyRehashedAssignments,
			planRows: fixture.plan.rows
		});
		assert.equal(missingValidation.status, 'failed');
		assert.match(missingValidation.issues.join('\n'), /incomplete, reordered or stale/);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('uses a replayed staged remap candidate and rejects a hand-crafted verifier input', () => {
	const fixture = createFixture({ fullCohort: true });
	try {
		const remap = buildRemapInputFixture(fixture);
		writeJson(remap.inputPath, remap.input);
		const sourceCandidatePath = path.join(
			fixture.generationRoot,
			'shards/science-002/candidate.json'
		);
		const sourceCandidateBefore = readFileSync(sourceCandidatePath, 'utf8');
		const result = runCli(fixture, {
			remapInputPath: remap.inputPath,
			effectiveCohortManifestPath: remap.effectiveCohortManifestPath
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(readFileSync(sourceCandidatePath, 'utf8'), sourceCandidateBefore);

		const index = readJson(path.join(fixture.outputRoot, 'assignment-index.json'));
		assert.equal(index.basePlanSha256, canonicalHash(fixture.plan));
		assert.equal(index.effectivePlanSha256, canonicalHash(remap.effectivePlan));
		assert.equal(index.curriculumRemapVerifierInputSha256, canonicalHash(remap.input));
		assert.equal(index.effectiveCohortManifestSha256, canonicalHash(remap.effectiveCohortManifest));
		const assignmentRecord = index.assignments.find(
			(assignment) => assignment.assignmentId === 'science-002'
		);
		const assignment = readJson(path.join(fixture.rootDir, assignmentRecord.path));
		const item = assignment.items.find(
			(entry) => entry.candidate.definition.id === remap.challengeId
		);
		assert.equal(item.plan.curriculumComponentId, remap.to);
		assert.equal(item.candidate.grounding.curriculumComponentId, remap.to);
		assert.equal(assignment.curriculumRemapProposals.length, 1);

		rmSync(fixture.outputRoot, { recursive: true, force: true });
		const exactProposal = remap.input.proposals[0];
		const siblingCandidate = [...fixture.candidateById.values()].find(
			(candidate) => candidate.definition.id !== remap.challengeId
		);
		const siblingProposal = buildScienceChallengeCurriculumRemapProposal({
			...exactProposal,
			challengeId: siblingCandidate.definition.id,
			targetCandidateSha256: canonicalHash(siblingCandidate)
		});
		const siblingEvidence = {
			...structuredClone(remap.input.evidence[0]),
			challengeId: siblingProposal.challengeId,
			proposalSha256: siblingProposal.proposalSha256
		};
		const reboundTo = buildScienceChallengeCurriculumRemapProposal({
			...exactProposal,
			to: `${exactProposal.to}-forged`
		});
		const reboundEvidence = {
			...structuredClone(remap.input.evidence[0]),
			proposalSha256: reboundTo.proposalSha256,
			to: {
				...remap.input.evidence[0].to,
				componentId: reboundTo.to
			},
			ancestryChain: [
				remap.input.evidence[0].ancestryChain[0],
				{
					...remap.input.evidence[0].ancestryChain.at(-1),
					componentId: reboundTo.to
				}
			]
		};
		for (const forged of [
			{
				...structuredClone(remap.input),
				proposals: [siblingProposal],
				evidence: [siblingEvidence]
			},
			{ ...structuredClone(remap.input), proposals: [], evidence: [] },
			{
				...structuredClone(remap.input),
				proposals: [exactProposal, siblingProposal],
				evidence: [remap.input.evidence[0], siblingEvidence]
			},
			{
				...structuredClone(remap.input),
				candidateOverrides: [
					...remap.input.candidateOverrides,
					structuredClone(remap.input.candidateOverrides[0])
				]
			},
			{
				...structuredClone(remap.input),
				proposals: [reboundTo],
				evidence: [reboundEvidence]
			}
		]) {
			writeJson(remap.inputPath, forged);
			const rejectedBijection = runCli(fixture, {
				remapInputPath: remap.inputPath,
				effectiveCohortManifestPath: remap.effectiveCohortManifestPath
			});
			assert.notEqual(rejectedBijection.status, 0);
			assert.match(
				rejectedBijection.stderr,
				/one-to-one|manifest-derived|exactly one proposal|duplicates a shard|effectivePlan/i
			);
			assert.equal(existsSync(fixture.outputRoot), false);
		}
		const forged = structuredClone(remap.input);
		forged.candidateOverrides[0].manifest.sourceAttempt.status = 'passed';
		forged.candidateOverrides[0].manifestSha256 = canonicalHash(
			forged.candidateOverrides[0].manifest
		);
		writeJson(remap.inputPath, forged);
		const rejected = runCli(fixture, {
			remapInputPath: remap.inputPath,
			effectiveCohortManifestPath: remap.effectiveCohortManifestPath
		});
		assert.notEqual(rejected.status, 0);
		assert.match(
			rejected.stderr,
			/manifest self-binding|source attempt|verifier input is invalid/i
		);
		assert.equal(existsSync(fixture.outputRoot), false);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('prepares the single terminal successor after a second failed full-corpus review', () => {
	const fixture = createFixture({ fullCohort: true });
	try {
		const remap = buildRemapInputFixture(fixture);
		const rejectedRow = remap.effectivePlan.rows.find((row) => row.id === remap.challengeId);
		const reviews = remap.effectivePlan.rows.map((row) => {
			const review = {
				id: row.id,
				...Object.fromEntries(SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])),
				checkedCalculations: [],
				issues: [],
				accepted: true
			};
			if (row.id === rejectedRow.id) {
				review.precisionAndSpecificity = false;
				review.accepted = false;
				review.issues = [
					{
						field: 'definition.previewQuestion',
						category: 'precision',
						evidence: 'The requested comparison is ambiguous.',
						repair: 'Name the exact comparison and preserve every accepted sibling.'
					}
				];
			}
			return review;
		});
		const reviewSummary = {
			schemaVersion: 'science-challenge-independent-verification-summary/v1',
			status: 'failed',
			planId: remap.effectivePlan.planId,
			planSha256: canonicalHash(remap.effectivePlan),
			basePlanSha256: canonicalHash(fixture.plan),
			effectivePlanSha256: canonicalHash(remap.effectivePlan),
			sourceSnapshotSha256: canonicalHash(readJson(fixture.sourcePath)),
			curriculumEvidenceSha256: canonicalHash(fixture.evidence),
			candidateSetSha256: remap.stagedCohort.candidateSetSha256,
			recoverySetSha256: remap.stagedCohort.manifest.recoverySetSha256,
			assignmentCount: 51,
			reviewCount: 408,
			acceptedCount: 407,
			rejectedCount: 1,
			assignmentResults: remap.stagedCohort.manifest.shards.map(({ shardId: assignmentId }) => ({
				assignmentId,
				status: 'passed'
			})),
			reviews,
			issues: []
		};
		const repairSha256 = canonicalHash(reviewSummary);
		const priorCandidate = remap.stagedCohort.candidateBatches.get(rejectedRow.shard);
		const candidate = structuredClone(priorCandidate);
		const target = candidate.challenges.find((entry) => entry.definition.id === rejectedRow.id);
		target.definition.previewQuestion = `${target.definition.previewQuestion} Exact comparison.`;
		const validation = {
			status: 'passed',
			issues: [],
			candidateSha256: canonicalHash(candidate)
		};
		const proposalRoot = path.join(
			fixture.generationRoot,
			'shards',
			rejectedRow.shard,
			`verification-repair-${repairSha256.slice(0, 12)}-attempt-01`
		);
		const candidatePath = path.join(proposalRoot, 'candidate.json');
		const validationPath = path.join(proposalRoot, 'validation.json');
		writeJson(candidatePath, candidate);
		writeJson(validationPath, validation);
		const successor = stageScienceChallengeEffectiveCohortSuccessor({
			workspaceRoot: fixture.rootDir,
			outputRoot: fixture.generationRoot,
			repairSha256,
			objectiveId: '5'.repeat(64),
			executionId: '6'.repeat(64),
			reviewSummary,
			reviewEffectiveCohortManifestSha256: canonicalHash(remap.stagedCohort.manifest),
			predecessor: remap.stagedCohort,
			proposals: [
				{
					shardId: rejectedRow.shard,
					attempt: 1,
					candidatePath,
					validationPath,
					candidateSha256: canonicalHash(candidate),
					validationSha256: canonicalHash(validation)
				}
			],
			validateCollectionCandidate: ({ candidateSet, effectivePlan: replayEffectivePlan }) => ({
				status: 'passed',
				issues: [],
				repairTargets: [],
				candidateSet,
				candidateCount: candidateSet.length,
				candidateSetSha256: canonicalHash(candidateSet),
				effectivePlanSha256: canonicalHash(replayEffectivePlan)
			})
		});
		const successorInput = structuredClone(remap.input);
		successorInput.effectiveCohortManifestSha256 = canonicalHash(successor.manifest);
		successorInput.candidateSetSha256 = successor.candidateSetSha256;
		const successorInputPath = path.join(fixture.rootDir, 'successor-remap-input.json');
		writeJson(successorInputPath, successorInput);
		const result = runCli(fixture, {
			remapInputPath: successorInputPath,
			effectiveCohortManifestPath: path.join(
				fixture.generationRoot,
				path.basename(path.dirname(successor.manifestPath)),
				'manifest.json'
			)
		});
		assert.equal(result.status, 0, result.stderr);
		const index = readJson(path.join(fixture.outputRoot, 'assignment-index.json'));
		assert.equal(index.effectiveCohortManifestSha256, canonicalHash(successor.manifest));
		assert.equal(index.candidateSetSha256, successor.candidateSetSha256);
		writeJson(remap.inputPath, remap.input);
		const stale = runCli(fixture, {
			remapInputPath: remap.inputPath,
			effectiveCohortManifestPath: remap.effectiveCohortManifestPath
		});
		assert.notEqual(stale.status, 0);
		assert.match(stale.stderr, /single discoverable terminal effective cohort/i);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('authenticated empty-recovery successor survives prepare, aggregate, raw replay and generator repair-base replay', async () => {
	const fixture = await buildAuthenticatedEmptyRecoverySuccessorFixture();
	try {
		const prepared = runCli(fixture, {
			effectiveCohortManifestPath: fixture.successor.manifestPath,
			reviewRebaseManifestPath: fixture.reviewRebase.manifestPath
		});
		assert.equal(prepared.status, 0, prepared.stderr);
		const indexPath = path.join(fixture.outputRoot, 'assignment-index.json');
		const index = readJson(indexPath);
		assert.equal(index.effectiveCohortManifestSha256, canonicalHash(fixture.successor.manifest));
		assert.equal(index.recoverySetSha256, canonicalHash([]));
		assert.equal(index.curriculumRemapVerifierInputSha256, undefined);
		assert.equal(index.difficultyPlanAdjustmentVerifierInputSha256, undefined);

		const summary = aggregatePreparedSuccessorFixture(fixture, index);
		assert.equal(summary.status, 'failed');
		assert.equal(summary.recoverySetSha256, canonicalHash([]));
		assert.equal(summary.effectiveCohortManifestSha256, canonicalHash(fixture.successor.manifest));

		const emptyRecoveryBinding = buildScienceChallengeReviewRebaseSuccessorEmptyRecoveryBinding({
			effectiveCohort: fixture.successor,
			reviewRebaseEvidence: fixture.reviewRebase
		});
		const rawEvidence = requireContentVerificationEvidence({
			summary,
			summaryPath: path.join(fixture.outputRoot, 'summary.json'),
			plan: fixture.effectivePlan,
			basePlan: fixture.basePlan,
			expectedReviewRebaseSuccessorEmptyRecoveryBinding: emptyRecoveryBinding,
			sourceSnapshot: fixture.source,
			curriculumEvidence: fixture.evidence,
			rootDir: repositoryRoot,
			requiredStatus: 'failed',
			expectedCount: 408
		});
		assert.equal(rawEvidence.status, 'passed', rawEvidence.issues.join('\n'));

		const generator = spawnSync(
			process.execPath,
			[
				generatorCliPath,
				`--plan=${relativeToRepository(fixture.planPath)}`,
				`--source=${relativeToRepository(fixture.sourcePath)}`,
				`--evidence=${relativeToRepository(fixture.evidencePath)}`,
				`--output-root=${relativeToRepository(fixture.generationRoot)}`,
				`--repair-verification=${relativeToRepository(
					path.join(fixture.outputRoot, 'summary.json')
				)}`,
				`--review-rebase-manifest=${relativeToRepository(fixture.reviewRebase.manifestPath)}`,
				`--shard=${fixture.targetRow.shard}`,
				'--transport=llm-direct',
				'--direct-response-mode=prompt-json',
				'--thinking-level=high',
				'--direct-part-size=2',
				'--max-attempts=4',
				'--dry-run'
			],
			{ cwd: repositoryRoot, encoding: 'utf8' }
		);
		assert.equal(generator.status, 0, generator.stderr);
		assert.match(generator.stdout, /"status": "planned"/);

		const tamperedSummary = structuredClone(summary);
		tamperedSummary.recoverySetSha256 = 'f'.repeat(64);
		const tamperedReplay = requireContentVerificationEvidence({
			summary: tamperedSummary,
			summaryPath: path.join(fixture.outputRoot, 'summary.json'),
			plan: fixture.effectivePlan,
			basePlan: fixture.basePlan,
			expectedReviewRebaseSuccessorEmptyRecoveryBinding: emptyRecoveryBinding,
			sourceSnapshot: fixture.source,
			curriculumEvidence: fixture.evidence,
			rootDir: repositoryRoot,
			requiredStatus: 'failed',
			expectedCount: 408
		});
		assert.equal(tamperedReplay.status, 'failed');
		assert.match(
			tamperedReplay.issues.join('\n'),
			/assignment index provenance|empty recovery binding differs/i
		);
	} finally {
		rmSync(fixture.workRoot, { recursive: true, force: true });
	}
});

test('binds one remap and two atomic difficulty adjustments to one exact effective cohort', () => {
	const fixture = createFixture({ fullCohort: true });
	try {
		const combined = buildCombinedRecoveryInputFixture(fixture);
		writeJson(combined.remapInputPath, combined.remapInput);
		writeJson(combined.difficultyInputPath, combined.difficultyInput);
		const result = runCli(fixture, {
			remapInputPath: combined.remapInputPath,
			difficultyInputPath: combined.difficultyInputPath,
			effectiveCohortManifestPath: combined.effectiveCohortManifestPath
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(
			canonicalHash(
				readJson(path.join(fixture.outputRoot, 'curriculum-remap-verifier-input.json'))
			),
			canonicalHash(combined.remapInput)
		);
		assert.equal(
			canonicalHash(
				readJson(path.join(fixture.outputRoot, 'difficulty-plan-adjustment-verifier-input.json'))
			),
			canonicalHash(combined.difficultyInput)
		);

		const index = readJson(path.join(fixture.outputRoot, 'assignment-index.json'));
		assert.equal(index.basePlanSha256, canonicalHash(fixture.plan));
		assert.equal(index.effectivePlanSha256, canonicalHash(combined.effectivePlan));
		assert.equal(
			index.effectiveCohortManifestSha256,
			canonicalHash(combined.effectiveCohortManifest)
		);
		assert.equal(index.recoverySetSha256, combined.recoverySetSha256);
		assert.equal(index.curriculumRemapVerifierInputSha256, canonicalHash(combined.remapInput));
		assert.equal(
			index.difficultyPlanAdjustmentVerifierInputSha256,
			canonicalHash(combined.difficultyInput)
		);
		assert.equal(
			index.difficultyAdjustmentManifestSetSha256,
			canonicalHash([combined.difficultyManifest])
		);
		assert.deepEqual(combined.remapInput.recoveries, combined.difficultyInput.recoveries);
		assert.equal(combined.remapInput.recoverySetSha256, combined.difficultyInput.recoverySetSha256);

		const remapRecord = index.assignments.find(
			(assignment) => assignment.assignmentId === combined.remapShardId
		);
		const remapAssignment = readJson(path.join(fixture.rootDir, remapRecord.path));
		assert.deepEqual(remapAssignment.curriculumRemapProposals, combined.remapInput.proposals);
		assert.deepEqual(remapRecord.curriculumRemapProposalEvidence, combined.remapInput.evidence);
		const remappedItem = remapAssignment.items.find(
			(item) => item.plan.id === combined.remapChallengeId
		);
		assert.equal(remappedItem.plan.curriculumComponentId, combined.remapTo);
		assert.equal(remappedItem.candidate.grounding.curriculumComponentId, combined.remapTo);

		const difficultyRecord = index.assignments.find(
			(assignment) => assignment.assignmentId === combined.difficultyShardId
		);
		const difficultyAssignment = readJson(path.join(fixture.rootDir, difficultyRecord.path));
		assert.deepEqual(
			difficultyAssignment.difficultyPlanAdjustmentProposals,
			combined.difficultyInput.proposals
		);
		assert.deepEqual(
			difficultyAssignment.difficultyPlanAdjustmentProposalEvidence,
			combined.difficultyInput.proposalEvidence
		);
		assert.deepEqual(
			difficultyRecord.difficultyPlanAdjustmentProposals,
			combined.difficultyInput.proposals
		);
		assert.deepEqual(
			difficultyRecord.difficultyPlanAdjustmentProposalEvidence,
			combined.difficultyInput.proposalEvidence
		);
		assert.deepEqual(
			difficultyAssignment.items
				.filter((item) => combined.difficultyChallengeIds.includes(item.plan.id))
				.map((item) => ({
					id: item.plan.id,
					planDifficulty: item.plan.difficulty,
					candidateDifficulty: item.candidate.definition.difficulty
				})),
			combined.difficultyChallengeIds.map((id) => ({
				id,
				planDifficulty: 'standard',
				candidateDifficulty: 'standard'
			}))
		);

		for (const [label, mutate, pattern] of [
			[
				'stale effective-cohort authority',
				({ difficultyInput }) => {
					difficultyInput.effectiveCohortManifestSha256 = 'f'.repeat(64);
				},
				/effectiveCohortManifestSha256|effective-cohort manifest/i
			],
			[
				'partial difficulty proposal authority',
				({ difficultyInput }) => {
					difficultyInput.proposals.pop();
					difficultyInput.proposalEvidence.pop();
					difficultyInput.candidateOverrides.pop();
				},
				/every proposal|exactly once|adjustment manifest|invalid/i
			],
			[
				'split recovery authority',
				({ difficultyInput }) => {
					difficultyInput.recoveries.reverse();
					difficultyInput.recoverySetSha256 = canonicalHash(difficultyInput.recoveries);
				},
				/different typed recoveries/i
			]
		]) {
			rmSync(fixture.outputRoot, { recursive: true, force: true });
			const remapInput = structuredClone(combined.remapInput);
			const difficultyInput = structuredClone(combined.difficultyInput);
			mutate({ remapInput, difficultyInput });
			writeJson(combined.remapInputPath, remapInput);
			writeJson(combined.difficultyInputPath, difficultyInput);
			const rejected = runCli(fixture, {
				remapInputPath: combined.remapInputPath,
				difficultyInputPath: combined.difficultyInputPath,
				effectiveCohortManifestPath: combined.effectiveCohortManifestPath
			});
			assert.notEqual(rejected.status, 0, label);
			assert.match(rejected.stderr, pattern, label);
			assert.equal(existsSync(fixture.outputRoot), false, label);
		}

		for (const [label, options, pattern] of [
			[
				'missing difficulty verifier authority',
				{ remapInputPath: combined.remapInputPath },
				/no difficulty-plan adjustment verifier input was supplied/i
			],
			[
				'missing curriculum verifier authority',
				{ difficultyInputPath: combined.difficultyInputPath },
				/no curriculum-remap verifier input was supplied/i
			]
		]) {
			rmSync(fixture.outputRoot, { recursive: true, force: true });
			writeJson(combined.remapInputPath, combined.remapInput);
			writeJson(combined.difficultyInputPath, combined.difficultyInput);
			const rejected = runCli(fixture, {
				...options,
				effectiveCohortManifestPath: combined.effectiveCohortManifestPath
			});
			assert.notEqual(rejected.status, 0, label);
			assert.match(rejected.stderr, pattern, label);
			assert.equal(existsSync(fixture.outputRoot), false, label);
		}
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('rejects malformed CLI options and mixed review-rebase recovery mode before writes', () => {
	for (const extraArguments of [
		['--unknown=value'],
		['positional'],
		['--output-root='],
		['--plan=first.json', '--plan=second.json'],
		['--review-rebase-manifest=missing-rebase.json', '--curriculum-remap-input=missing-remap.json']
	]) {
		const fixture = createFixture();
		try {
			const result = spawnSync(
				process.execPath,
				[
					cliPath,
					`--plan=${path.relative(fixture.rootDir, fixture.planPath)}`,
					`--source=${path.relative(fixture.rootDir, fixture.sourcePath)}`,
					`--evidence=${path.relative(fixture.rootDir, fixture.evidencePath)}`,
					`--generation-root=${path.relative(fixture.rootDir, fixture.generationRoot)}`,
					`--output-root=${path.relative(fixture.rootDir, fixture.outputRoot)}`,
					...extraArguments
				],
				{ cwd: fixture.rootDir, encoding: 'utf8' }
			);
			assert.notEqual(result.status, 0);
			assert.equal(existsSync(fixture.outputRoot), false);
		} finally {
			rmSync(fixture.rootDir, { recursive: true, force: true });
		}
	}
});

function createFixture({ fullCohort = false } = {}) {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'science-verification-peers-'));
	const generationRoot = path.join(rootDir, 'generation');
	const outputRoot = path.join(rootDir, 'verification');
	const planPath = path.join(rootDir, 'plan.json');
	const sourcePath = path.join(rootDir, 'source.json');
	const evidencePath = path.join(rootDir, 'curriculum-evidence.json');
	const rowInputs = [
		{
			id: 'biology-alpha-one',
			shard: 'science-002',
			curriculumComponentId: 'component-alpha',
			difficulty: 'starter',
			taskShape: 'recall-or-selection',
			arc: 'read-the-evidence',
			mechanic: 'missing-link'
		},
		{
			id: 'biology-beta-only',
			shard: 'science-001',
			curriculumComponentId: 'component-beta',
			difficulty: 'standard',
			taskShape: 'explanation',
			arc: 'connect-cause-to-effect',
			mechanic: 'first-wrong-step'
		},
		{
			id: 'biology-alpha-two',
			shard: 'science-003',
			curriculumComponentId: 'component-alpha',
			difficulty: 'stretch',
			taskShape: 'quantitative',
			arc: 'mark-the-working',
			mechanic: 'first-wrong-step'
		},
		{
			id: 'biology-alpha-three',
			shard: 'science-001',
			curriculumComponentId: 'component-alpha',
			difficulty: 'standard',
			taskShape: 'practical-or-data',
			arc: 'complete-the-method',
			mechanic: 'missing-link'
		}
	];
	if (fullCohort) {
		let extraIndex = 1;
		for (let shardIndex = 1; shardIndex <= 51; shardIndex += 1) {
			const shard = `science-${String(shardIndex).padStart(3, '0')}`;
			const existingCount = rowInputs.filter((row) => row.shard === shard).length;
			for (let offset = existingCount; offset < 8; offset += 1) {
				rowInputs.push({
					id: `biology-extra-${String(extraIndex).padStart(3, '0')}`,
					shard,
					curriculumComponentId: `component-extra-${extraIndex}`,
					difficulty: 'starter',
					taskShape: 'recall-or-selection',
					arc: 'read-the-evidence',
					mechanic: 'missing-link'
				});
				extraIndex += 1;
			}
		}
		const difficultyRows = rowInputs.filter((row) => row.shard === 'science-021');
		difficultyRows[0].difficulty = 'starter';
		difficultyRows[1].difficulty = 'stretch';
	}
	const sourceQuestions = rowInputs.map((input, index) => {
		const id = `calibration-${index + 1}`;
		return {
			id,
			contentSha256: canonicalHash({ id, promptText: `Calibration ${index + 1}` }),
			promptText: `Calibration ${index + 1}`,
			marks: 2
		};
	});
	const rows = rowInputs.map((input, index) => ({
		...input,
		subject: 'biology',
		specificationId: 'fixture-specification',
		specificationSha256: 'a'.repeat(64),
		chapterId: 'fixture-chapter',
		chapterCode: '1',
		chapterTitle: 'Fixture chapter',
		curriculumCode: input.curriculumComponentId,
		curriculumTitle: `Title for ${input.curriculumComponentId}`,
		calibrationQuestionId: sourceQuestions[index].id,
		calibrationQuestionSha256: sourceQuestions[index].contentSha256
	}));
	const plan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-peer-fixture-v1',
		createdOn: '2026-07-23',
		existingRoundCount: 2,
		generatedRoundCount: rows.length,
		generatedQuestionContextCount: rows.length * 2,
		targetFinalCatalogueRounds: 2 + rows.length,
		targetFinalQuestionContextCount: (2 + rows.length) * 2,
		uniqueIllustrationPairCount: (2 + rows.length) * 2,
		uniqueFinalIllustrationAssetCount: (2 + rows.length) * 4,
		rows
	};
	const source = { questions: sourceQuestions };
	const evidence = {
		components: [...new Set(rows.map((row) => row.curriculumComponentId))].map((componentId) => ({
			componentId,
			title: `Evidence for ${componentId}`,
			sourceText: `Specification evidence for ${componentId}.`
		}))
	};
	const candidateById = new Map(
		rows.map((row, planRowIndex) => [row.id, candidateFor(row, planRowIndex)])
	);

	writeJson(planPath, plan);
	writeJson(sourcePath, source);
	writeJson(evidencePath, evidence);
	for (const shard of [...new Set(rows.map((row) => row.shard))]) {
		const challenges = rows
			.filter((row) => row.shard === shard)
			.map((row) => candidateById.get(row.id));
		writeJson(path.join(generationRoot, 'shards', shard, 'candidate.json'), { challenges });
	}
	return {
		rootDir,
		generationRoot,
		outputRoot,
		planPath,
		sourcePath,
		evidencePath,
		plan,
		evidence,
		candidateById
	};
}

function buildRemapInputFixture(fixture) {
	const challengeId = 'biology-alpha-one';
	const planRowIndex = fixture.plan.rows.findIndex((row) => row.id === challengeId);
	const baseRow = fixture.plan.rows[planRowIndex];
	const to = 'aqa-gcse-biology-8461-v1.1:4-1-1-2';
	const effectiveComponent = {
		curriculumComponentId: to,
		curriculumCode: to,
		curriculumTitle: 'Exact descendant component',
		curriculumPageStart: baseRow.curriculumPageStart,
		curriculumPageEnd: baseRow.curriculumPageEnd,
		specificationId: baseRow.specificationId,
		specificationSha256: baseRow.specificationSha256
	};
	const baseComponent = {
		curriculumComponentId: baseRow.curriculumComponentId,
		curriculumCode: baseRow.curriculumCode,
		curriculumTitle: baseRow.curriculumTitle,
		curriculumPageStart: baseRow.curriculumPageStart,
		curriculumPageEnd: baseRow.curriculumPageEnd,
		specificationId: baseRow.specificationId,
		specificationSha256: baseRow.specificationSha256
	};
	const effectivePlan = structuredClone(fixture.plan);
	Object.assign(effectivePlan.rows[planRowIndex], effectiveComponent);
	fixture.evidence.components.push({
		componentId: to,
		title: effectiveComponent.curriculumTitle,
		sourceText: 'Exact descendant specification evidence.'
	});
	writeJson(fixture.evidencePath, fixture.evidence);

	const priorCandidate = readJson(
		path.join(fixture.generationRoot, 'shards/science-002/candidate.json')
	);
	const candidate = structuredClone(priorCandidate);
	const target = candidate.challenges.find((entry) => entry.definition.id === challengeId);
	target.grounding.curriculumComponentId = to;
	const priorTarget = priorCandidate.challenges.find(
		(entry) => entry.definition.id === challengeId
	);
	const remap = {
		challengeId,
		field: 'grounding.curriculumComponentId',
		from: baseRow.curriculumComponentId,
		to
	};
	const inverseRemap = {
		challengeId,
		field: remap.field,
		from: to,
		to: baseRow.curriculumComponentId
	};
	const repairSha256 = '1'.repeat(64);
	const candidateBatchByShard = new Map(
		[...new Set(fixture.plan.rows.map((row) => row.shard))].map((shardId) => [
			shardId,
			readJson(path.join(fixture.generationRoot, 'shards', shardId, 'candidate.json'))
		])
	);
	candidateBatchByShard.set(baseRow.shard, candidate);
	const candidateSet = effectivePlan.rows.map((row) =>
		candidateBatchByShard.get(row.shard).challenges.find((entry) => entry.definition.id === row.id)
	);
	const collectionValidation = {
		status: 'passed',
		issues: [],
		repairTargets: [],
		candidateSet,
		candidateCount: candidateSet.length,
		candidateSetSha256: canonicalHash(candidateSet),
		effectivePlanSha256: canonicalHash(effectivePlan)
	};
	const manifestCore = {
		schemaVersion: 'science-challenge-verifier-directed-descendant-remap/v1',
		disposition: 'deterministic-verifier-directed-descendant-remap',
		shardId: baseRow.shard,
		repairSha256,
		challengeId,
		field: remap.field,
		base: {
			planSha256: canonicalHash(fixture.plan),
			planRowIndex,
			planRowSha256: canonicalHash(baseRow),
			component: baseComponent,
			componentSha256: canonicalHash(baseComponent)
		},
		effective: {
			planSha256: canonicalHash(effectivePlan),
			planRowIndex,
			planRowSha256: canonicalHash(effectivePlan.rows[planRowIndex]),
			component: effectiveComponent,
			componentSha256: canonicalHash(effectiveComponent)
		},
		evidence: { curriculumEvidenceSha256: canonicalHash(fixture.evidence) },
		firstReview: {
			summarySha256: repairSha256,
			reviewSha256: '2'.repeat(64)
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
		candidateTargetSha256: canonicalHash(target),
		inverseTargetSha256: canonicalHash(priorTarget),
		collectionValidationSha256: canonicalHash(collectionValidation)
	};
	const manifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	const remapRoot = path.join(
		fixture.generationRoot,
		'shards',
		baseRow.shard,
		`verification-repair-${repairSha256.slice(0, 12)}-descendant-remap`
	);
	const remapValidation = {
		status: 'review-pending',
		issues: ['fresh full review required'],
		candidateSha256: canonicalHash(candidate)
	};
	writeJson(path.join(remapRoot, 'manifest.json'), manifest);
	writeJson(path.join(remapRoot, 'candidate.json'), candidate);
	writeJson(path.join(remapRoot, 'validation.json'), remapValidation);
	writeJson(path.join(remapRoot, 'prior-candidate.json'), priorCandidate);
	for (const [shardId, batch] of candidateBatchByShard) {
		if (shardId === baseRow.shard) continue;
		writeJson(path.join(fixture.generationRoot, 'shards', shardId, 'validation.json'), {
			status: 'passed',
			issues: [],
			candidateSha256: canonicalHash(batch)
		});
	}
	const shardSelections = [...new Set(effectivePlan.rows.map((row) => row.shard))].map(
		(shardId) => {
			if (shardId === baseRow.shard) {
				return {
					shardId,
					disposition: 'descendant-remap',
					candidatePath: path.join(remapRoot, 'candidate.json'),
					validationPath: path.join(remapRoot, 'validation.json'),
					candidateSha256: canonicalHash(candidate),
					validationSha256: canonicalHash(remapValidation),
					remapManifestPath: path.join(remapRoot, 'manifest.json'),
					priorCandidatePath: path.join(remapRoot, 'prior-candidate.json')
				};
			}
			const batch = candidateBatchByShard.get(shardId);
			const validationPath = path.join(
				fixture.generationRoot,
				'shards',
				shardId,
				'validation.json'
			);
			const validation = readJson(validationPath);
			return {
				shardId,
				disposition: 'unchanged-verified-fallback',
				candidatePath: path.join(fixture.generationRoot, 'shards', shardId, 'candidate.json'),
				validationPath,
				candidateSha256: canonicalHash(batch),
				validationSha256: canonicalHash(validation),
				firstReviewCandidateSha256: canonicalHash(batch),
				firstReviewValidationSha256: canonicalHash(validation)
			};
		}
	);
	const stagedCohort = stageScienceChallengeEffectiveCohort({
		workspaceRoot: fixture.rootDir,
		outputRoot: fixture.generationRoot,
		repairSha256,
		objectiveId: '3'.repeat(64),
		executionId: '4'.repeat(64),
		firstReviewSha256: repairSha256,
		basePlan: fixture.plan,
		effectivePlan,
		sourceSnapshotSha256: canonicalHash(readJson(fixture.sourcePath)),
		curriculumEvidenceSha256: canonicalHash(fixture.evidence),
		curriculumCatalogSha256: 'c'.repeat(64),
		shardSelections,
		validateCollectionCandidate: ({
			candidateSet: replayCandidateSet,
			effectivePlan: replayEffectivePlan
		}) => ({
			status: 'passed',
			issues: [],
			repairTargets: [],
			candidateSet: replayCandidateSet,
			candidateCount: replayCandidateSet.length,
			candidateSetSha256: canonicalHash(replayCandidateSet),
			effectivePlanSha256: canonicalHash(replayEffectivePlan)
		})
	});
	assert.equal(stagedCohort.status, 'passed', stagedCohort.issues.join('\n'));
	const proposal = buildScienceChallengeCurriculumRemapProposal({
		challengeId,
		field: remap.field,
		from: remap.from,
		to: remap.to,
		basePlanSha256: canonicalHash(fixture.plan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		curriculumEvidenceSha256: canonicalHash(fixture.evidence),
		targetCandidateSha256: canonicalHash(target),
		batchCandidateSha256: canonicalHash(candidate),
		baseReviewSha256: manifest.firstReview.summarySha256,
		manifestSha256: canonicalHash(manifest)
	});
	const displayEvidence = {
		challengeId,
		proposalSha256: proposal.proposalSha256,
		field: proposal.field,
		from: {
			componentId: proposal.from,
			title: baseComponent.curriculumTitle,
			sourceTextSha256: 'a'.repeat(64),
			substantiveExcerpt: 'The original component evidence was too broad.'
		},
		to: {
			componentId: proposal.to,
			title: effectiveComponent.curriculumTitle,
			sourceTextSha256: 'b'.repeat(64),
			substantiveExcerpt: 'Exact descendant specification evidence.'
		},
		ancestryChain: [
			{ componentId: proposal.from, title: baseComponent.curriculumTitle },
			{ componentId: proposal.to, title: effectiveComponent.curriculumTitle }
		],
		targetRowDiffStatement: 'Only grounding.curriculumComponentId changes.',
		originalSingleIssueGate: {
			field: proposal.field,
			category: 'curriculum',
			evidence: 'The original component was too broad.',
			repair: 'Use the exact descendant component.'
		}
	};
	const input = buildScienceChallengeCurriculumRemapVerifierInput({
		basePlan: fixture.plan,
		basePlanSha256: canonicalHash(fixture.plan),
		effectivePlan,
		curriculumCatalogSha256: 'c'.repeat(64),
		effectiveCohortManifestSha256: canonicalHash(stagedCohort.manifest),
		candidateCount: effectivePlan.rows.length,
		candidateSetSha256: stagedCohort.candidateSetSha256,
		remapManifestSetSha256: stagedCohort.manifest.remapManifestSetSha256,
		candidateOverrides: [
			{
				shardId: baseRow.shard,
				manifest,
				candidate,
				priorCandidate,
				candidateSha256: canonicalHash(candidate),
				manifestSha256: canonicalHash(manifest)
			}
		],
		proposals: [proposal],
		evidence: [displayEvidence]
	});
	return {
		challengeId,
		to,
		effectivePlan,
		input,
		manifest,
		proposal,
		displayEvidence,
		remapRoot,
		repairSha256,
		baseRow,
		priorCandidate,
		candidate,
		candidateBatchByShard,
		shardSelections,
		inputPath: path.join(fixture.rootDir, 'curriculum-remap-input.json'),
		stagedCohort,
		effectiveCohortManifest: stagedCohort.manifest,
		effectiveCohortManifestPath: path.join(
			fixture.generationRoot,
			`verification-repair-${repairSha256.slice(0, 12)}-effective-cohort`,
			'manifest.json'
		)
	};
}

function buildCombinedRecoveryInputFixture(fixture) {
	const remap = buildRemapInputFixture(fixture);
	const difficultyShardId = 'science-021';
	const difficultyRows = fixture.plan.rows.filter((row) => row.shard === difficultyShardId);
	assert.equal(difficultyRows.length, 8);
	assert.deepEqual(
		difficultyRows.slice(0, 2).map((row) => row.difficulty),
		['starter', 'stretch']
	);
	const priorDifficultyCandidate = readJson(
		path.join(fixture.generationRoot, 'shards', difficultyShardId, 'candidate.json')
	);
	const difficultyCandidate = structuredClone(priorDifficultyCandidate);
	const requestedAdjustments = difficultyRows.slice(0, 2).map((row) => ({
		challengeId: row.id,
		field: 'definition.difficulty',
		from: row.difficulty,
		to: 'standard'
	}));
	for (const adjustment of requestedAdjustments) {
		const target = difficultyCandidate.challenges.find(
			(entry) => entry.definition.id === adjustment.challengeId
		);
		target.definition.difficulty = adjustment.to;
	}

	const difficultyOnlyPlan = structuredClone(fixture.plan);
	for (const adjustment of requestedAdjustments) {
		difficultyOnlyPlan.rows.find((row) => row.id === adjustment.challengeId).difficulty =
			adjustment.to;
	}
	const effectivePlan = structuredClone(remap.effectivePlan);
	for (const adjustment of requestedAdjustments) {
		effectivePlan.rows.find((row) => row.id === adjustment.challengeId).difficulty = adjustment.to;
	}
	const difficultyIssues = [
		{
			field: 'definition.difficulty',
			category: 'calibration',
			evidence: 'The multi-link task is not credibly labelled starter.',
			repair: 'Raise the difficulty to standard.'
		},
		{
			field: 'definition.difficulty',
			category: 'calibration',
			evidence: 'The direct task does not support the stretch label.',
			repair: 'Label the challenge standard rather than stretch.'
		}
	];
	const targetReviewById = new Map(
		requestedAdjustments.map((adjustment, index) => {
			const review = {
				...fullReviewRow(adjustment.challengeId),
				difficultyCalibrated: false,
				issues: [difficultyIssues[index]],
				accepted: false
			};
			return [adjustment.challengeId, review];
		})
	);
	const adjustmentRecords = requestedAdjustments.map((adjustment, index) => {
		const basePlanRowIndex = fixture.plan.rows.findIndex(
			(row) => row.id === adjustment.challengeId
		);
		const priorTarget = priorDifficultyCandidate.challenges.find(
			(entry) => entry.definition.id === adjustment.challengeId
		);
		const candidateTarget = difficultyCandidate.challenges.find(
			(entry) => entry.definition.id === adjustment.challengeId
		);
		const candidateWithoutAdjustment = structuredClone(candidateTarget);
		candidateWithoutAdjustment.definition.difficulty = adjustment.from;
		const review = targetReviewById.get(adjustment.challengeId);
		const issue = difficultyIssues[index];
		return {
			...adjustment,
			basePlanRowIndex,
			basePlanRowSha256: canonicalHash(fixture.plan.rows[basePlanRowIndex]),
			effectivePlanRowSha256: canonicalHash(difficultyOnlyPlan.rows[basePlanRowIndex]),
			review,
			reviewSha256: canonicalHash(review),
			issue,
			issueSha256: canonicalHash(issue),
			priorTargetSha256: canonicalHash(priorTarget),
			candidateTargetSha256: canonicalHash(candidateTarget),
			candidateWithoutAdjustmentSha256: canonicalHash(candidateWithoutAdjustment)
		};
	});
	const rowReviewBindings = priorDifficultyCandidate.challenges.map((entry, index) => {
		const review = targetReviewById.get(entry.definition.id) ?? fullReviewRow(entry.definition.id);
		const candidateEntry = difficultyCandidate.challenges[index];
		return {
			challengeId: entry.definition.id,
			accepted: review.accepted,
			reviewSha256: canonicalHash(review),
			priorCandidateSha256: canonicalHash(entry),
			candidateSha256: canonicalHash(candidateEntry)
		};
	});
	const difficultyManifestCore = {
		schemaVersion: 'science-challenge-verifier-directed-difficulty-plan-adjustment-set/v1',
		disposition: 'deterministic-verifier-directed-difficulty-plan-adjustment-set',
		shardId: difficultyShardId,
		repairSha256: remap.repairSha256,
		objectiveId: '3'.repeat(64),
		executionId: '4'.repeat(64),
		field: 'definition.difficulty',
		base: {
			planSha256: canonicalHash(fixture.plan),
			shardRowsSha256: canonicalHash(difficultyRows)
		},
		effective: {
			planSha256: canonicalHash(difficultyOnlyPlan),
			shardRowsSha256: canonicalHash(
				difficultyOnlyPlan.rows.filter((row) => row.shard === difficultyShardId)
			)
		},
		firstReview: {
			summarySha256: remap.repairSha256,
			resultSha256: '5'.repeat(64),
			assignmentSha256: '6'.repeat(64),
			dispatchLedgerSha256: '7'.repeat(64)
		},
		sourceAttempt: {
			attempt: 4,
			status: 'failed',
			sourceKind: 'direct-terminal-candidate',
			selectionPolicy: 'complete-terminal-attempt-04-only',
			runSummarySha256: '8'.repeat(64),
			sourceValidationSha256: '9'.repeat(64),
			sourceCandidateSha256: canonicalHash(difficultyCandidate),
			runPolicySha256: 'a'.repeat(64),
			exactFileBindingsSha256: 'b'.repeat(64)
		},
		attemptBudget: {
			maxAttempts: 4,
			exhausted: true,
			selectedAttempt: 4,
			selectionPolicy: 'complete-terminal-attempt-04-only',
			attempts: [1, 2, 3, 4].map((attempt) => ({
				attempt,
				status: 'failed',
				invalidated: false
			}))
		},
		priorCandidateSha256: canonicalHash(priorDifficultyCandidate),
		candidateSha256: canonicalHash(difficultyCandidate),
		adjustmentCount: adjustmentRecords.length,
		adjustments: adjustmentRecords,
		adjustmentSetSha256: canonicalHash(adjustmentRecords),
		requestedAdjustmentSetSha256: canonicalHash(requestedAdjustments),
		rowReviewBindings,
		rowReviewBindingsSha256: canonicalHash(rowReviewBindings),
		collectionValidationSha256: 'c'.repeat(64)
	};
	const difficultyManifest = {
		...difficultyManifestCore,
		manifestCoreSha256: canonicalHash(difficultyManifestCore)
	};
	const difficultyValidation = {
		status: 'review-pending',
		issues: ['fresh full review required'],
		candidateSha256: canonicalHash(difficultyCandidate)
	};
	const difficultyRoot = path.join(
		fixture.generationRoot,
		'shards',
		difficultyShardId,
		`verification-repair-${remap.repairSha256.slice(0, 12)}-difficulty-plan-adjustment-set`
	);
	writeJson(path.join(difficultyRoot, 'manifest.json'), difficultyManifest);
	writeJson(path.join(difficultyRoot, 'candidate.json'), difficultyCandidate);
	writeJson(path.join(difficultyRoot, 'validation.json'), difficultyValidation);
	writeJson(path.join(difficultyRoot, 'prior-candidate.json'), priorDifficultyCandidate);

	const shardSelections = remap.shardSelections.map((selection) =>
		selection.shardId === difficultyShardId
			? {
					shardId: difficultyShardId,
					disposition: 'difficulty-plan-adjustment',
					candidatePath: path.join(difficultyRoot, 'candidate.json'),
					validationPath: path.join(difficultyRoot, 'validation.json'),
					candidateSha256: canonicalHash(difficultyCandidate),
					validationSha256: canonicalHash(difficultyValidation),
					adjustmentManifestPath: path.join(difficultyRoot, 'manifest.json'),
					priorCandidatePath: path.join(difficultyRoot, 'prior-candidate.json')
				}
			: selection
	);
	const combinedCandidateBatchByShard = new Map(remap.candidateBatchByShard);
	combinedCandidateBatchByShard.set(difficultyShardId, difficultyCandidate);
	const candidateSet = effectivePlan.rows.map((row) =>
		combinedCandidateBatchByShard
			.get(row.shard)
			.challenges.find((entry) => entry.definition.id === row.id)
	);
	const collectionValidation = {
		status: 'passed',
		issues: [],
		repairTargets: [],
		candidateSet,
		candidateCount: candidateSet.length,
		candidateSetSha256: canonicalHash(candidateSet),
		effectivePlanSha256: canonicalHash(effectivePlan)
	};
	remap.manifest.collectionValidationSha256 = canonicalHash(collectionValidation);
	const remapManifestCore = structuredClone(remap.manifest);
	delete remapManifestCore.manifestCoreSha256;
	remap.manifest.manifestCoreSha256 = canonicalHash(remapManifestCore);
	writeJson(path.join(remap.remapRoot, 'manifest.json'), remap.manifest);

	rmSync(path.dirname(remap.effectiveCohortManifestPath), {
		recursive: true,
		force: true
	});
	const stagedCohort = stageScienceChallengeEffectiveCohort({
		workspaceRoot: fixture.rootDir,
		outputRoot: fixture.generationRoot,
		repairSha256: remap.repairSha256,
		objectiveId: '3'.repeat(64),
		executionId: '4'.repeat(64),
		firstReviewSha256: remap.repairSha256,
		basePlan: fixture.plan,
		effectivePlan,
		sourceSnapshotSha256: canonicalHash(readJson(fixture.sourcePath)),
		curriculumEvidenceSha256: canonicalHash(fixture.evidence),
		curriculumCatalogSha256: 'c'.repeat(64),
		shardSelections,
		validateCollectionCandidate: ({
			candidateSet: replayCandidateSet,
			effectivePlan: replayEffectivePlan
		}) => ({
			status: 'passed',
			issues: [],
			repairTargets: [],
			candidateSet: replayCandidateSet,
			candidateCount: replayCandidateSet.length,
			candidateSetSha256: canonicalHash(replayCandidateSet),
			effectivePlanSha256: canonicalHash(replayEffectivePlan)
		})
	});
	assert.equal(stagedCohort.status, 'passed', stagedCohort.issues.join('\n'));
	assert.equal(stagedCohort.manifest.recoveryCount, 3);
	assert.equal(stagedCohort.manifest.difficultyAdjustmentCount, 2);

	const combinedRecoveries = [
		{
			manifest: remap.manifest,
			priorCandidate: remap.priorCandidate,
			candidate: remap.candidate
		},
		{
			manifest: difficultyManifest,
			priorCandidate: priorDifficultyCandidate,
			candidate: difficultyCandidate
		}
	];
	const recoverySetSha256 = canonicalHash(combinedRecoveries);
	assert.equal(stagedCohort.manifest.recoverySetSha256, recoverySetSha256);
	const effectiveCohortManifestSha256 = canonicalHash(stagedCohort.manifest);

	const remapProposal = buildScienceChallengeCurriculumRemapProposal({
		challengeId: remap.challengeId,
		field: remap.manifest.remap.field,
		from: remap.manifest.remap.from,
		to: remap.manifest.remap.to,
		basePlanSha256: canonicalHash(fixture.plan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		curriculumEvidenceSha256: canonicalHash(fixture.evidence),
		targetCandidateSha256: remap.manifest.candidateTargetSha256,
		batchCandidateSha256: canonicalHash(remap.candidate),
		baseReviewSha256: remap.manifest.firstReview.summarySha256,
		manifestSha256: canonicalHash(remap.manifest)
	});
	const remapEvidence = {
		...structuredClone(remap.displayEvidence),
		proposalSha256: remapProposal.proposalSha256
	};
	const remapInput = buildScienceChallengeCurriculumRemapVerifierInput({
		basePlan: fixture.plan,
		basePlanSha256: canonicalHash(fixture.plan),
		effectivePlan,
		curriculumCatalogSha256: 'c'.repeat(64),
		effectiveCohortManifestSha256,
		candidateCount: effectivePlan.rows.length,
		candidateSetSha256: stagedCohort.candidateSetSha256,
		remapManifestSetSha256: stagedCohort.manifest.remapManifestSetSha256,
		recoveries: combinedRecoveries,
		recoverySetSha256,
		candidateOverrides: [
			{
				shardId: remap.baseRow.shard,
				manifest: remap.manifest,
				candidate: remap.candidate,
				priorCandidate: remap.priorCandidate,
				candidateSha256: canonicalHash(remap.candidate),
				manifestSha256: canonicalHash(remap.manifest)
			}
		],
		proposals: [remapProposal],
		evidence: [remapEvidence]
	});

	const difficultyProposals = adjustmentRecords.map((adjustment) =>
		buildScienceChallengeDifficultyPlanAdjustmentProposal({
			challengeId: adjustment.challengeId,
			field: adjustment.field,
			from: adjustment.from,
			to: adjustment.to,
			sourceAttempt: 4,
			sourcePolicy: 'complete-terminal-attempt-04-only',
			basePlanSha256: canonicalHash(fixture.plan),
			effectivePlanSha256: canonicalHash(effectivePlan),
			targetCandidateSha256: adjustment.candidateTargetSha256,
			batchCandidateSha256: canonicalHash(difficultyCandidate),
			baseReviewSha256: remap.repairSha256,
			manifestSha256: canonicalHash(difficultyManifest)
		})
	);
	const difficultyProposalEvidence = difficultyProposals.map((proposal, index) =>
		buildScienceChallengeDifficultyPlanAdjustmentProposalEvidence(
			{
				challengeId: proposal.challengeId,
				field: proposal.field,
				from: proposal.from,
				to: proposal.to,
				sourceAttempt: proposal.sourceAttempt,
				sourcePolicy: proposal.sourcePolicy,
				targetRowDiffStatement:
					'The typed plan projection changes only definition.difficulty; terminal content remains byte-identical.',
				originalSingleIssueGate: adjustmentRecords[index].issue
			},
			proposal
		)
	);
	const difficultyCandidateOverrides = adjustmentRecords.map((adjustment) => ({
		shardId: difficultyShardId,
		challengeId: adjustment.challengeId,
		manifest: difficultyManifest,
		manifestSha256: canonicalHash(difficultyManifest),
		candidate: difficultyCandidate,
		candidateSha256: canonicalHash(difficultyCandidate),
		priorCandidate: priorDifficultyCandidate,
		priorCandidateSha256: canonicalHash(priorDifficultyCandidate),
		priorTargetSha256: adjustment.priorTargetSha256
	}));
	const difficultyInput = buildScienceChallengeDifficultyPlanAdjustmentVerifierInput({
		basePlan: fixture.plan,
		effectivePlan,
		effectiveCohortManifestSha256,
		candidateCount: effectivePlan.rows.length,
		candidateSetSha256: stagedCohort.candidateSetSha256,
		adjustmentManifestSetSha256: stagedCohort.manifest.difficultyAdjustmentManifestSetSha256,
		recoveries: combinedRecoveries,
		recoverySetSha256,
		candidateOverrides: difficultyCandidateOverrides,
		proposals: difficultyProposals,
		evidence: difficultyProposalEvidence
	});
	return {
		effectivePlan,
		effectiveCohortManifest: stagedCohort.manifest,
		effectiveCohortManifestPath: remap.effectiveCohortManifestPath,
		recoverySetSha256,
		remapInput,
		remapInputPath: path.join(fixture.rootDir, 'curriculum-remap-input.json'),
		difficultyInput,
		difficultyInputPath: path.join(fixture.rootDir, 'difficulty-plan-adjustment-input.json'),
		difficultyManifest,
		remapShardId: remap.baseRow.shard,
		remapChallengeId: remap.challengeId,
		remapTo: remap.to,
		difficultyShardId,
		difficultyChallengeIds: requestedAdjustments.map((adjustment) => adjustment.challengeId)
	};
}

async function buildAuthenticatedEmptyRecoverySuccessorFixture() {
	mkdirSync(path.join(repositoryRoot, 'tmp'), { recursive: true });
	const workRoot = mkdtempSync(
		path.join(repositoryRoot, 'tmp/science-prepare-empty-successor-test-')
	);
	const generationRoot = path.join(workRoot, 'generation');
	const outputRoot = path.join(workRoot, 'verification');
	const inputRoot = path.join(workRoot, 'inputs');
	const planPath = path.join(inputRoot, 'plan.json');
	const sourcePath = path.join(inputRoot, 'source.json');
	const evidencePath = path.join(inputRoot, 'curriculum-evidence.json');
	const curriculumCatalogPath = path.join(inputRoot, 'curriculum-catalog.json');
	const existingDefinitions = await loadExistingCatalogForTest();
	const curriculumCatalog = {
		schemaVersion: 'science-prepare-empty-successor-curriculum/v1',
		specifications: []
	};
	const sourceQuestions = Array.from({ length: 408 }, (_, index) => {
		const id = `fixture-source-${String(index + 1).padStart(3, '0')}`;
		return {
			id,
			contentSha256: canonicalHash({ id, promptText: `Calibration prompt ${index + 1}.` }),
			promptText: `Calibration prompt ${index + 1}.`,
			marks: 2
		};
	});
	const sharedComponentId = 'fixture-review-rebase-shared-component';
	const targetPlanRowIndex = 8;
	const rows = Array.from({ length: 408 }, (_, index) => {
		const shard = `science-${String(Math.floor(index / 8) + 1).padStart(3, '0')}`;
		const curriculumComponentId =
			index === 0 || index === targetPlanRowIndex
				? sharedComponentId
				: `fixture-review-rebase-component-${index + 1}`;
		return {
			id: `fixture-review-rebase-${String(index + 1).padStart(3, '0')}`,
			shard,
			subject: 'biology',
			specificationId: 'fixture-review-rebase-specification',
			specificationSha256: 'a'.repeat(64),
			chapterId: 'fixture-review-rebase-chapter',
			chapterCode: '1',
			chapterTitle: 'Fixture review rebase chapter',
			curriculumComponentId,
			curriculumCode: curriculumComponentId,
			curriculumTitle: `Fixture component ${index + 1}`,
			difficulty: index === targetPlanRowIndex ? 'stretch' : 'standard',
			taskShape: 'explanation',
			arc: 'connect-cause-to-effect',
			mechanic: 'missing-link',
			calibrationQuestionId: sourceQuestions[index].id,
			calibrationQuestionSha256: sourceQuestions[index].contentSha256
		};
	});
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-empty-successor-fixture-v1',
		createdOn: '2026-07-24',
		existingRoundCount: existingDefinitions.length,
		generatedRoundCount: rows.length,
		generatedQuestionContextCount: rows.length * 2,
		targetFinalCatalogueRounds: existingDefinitions.length + rows.length,
		targetFinalQuestionContextCount: (existingDefinitions.length + rows.length) * 2,
		uniqueIllustrationPairCount: (existingDefinitions.length + rows.length) * 2,
		uniqueFinalIllustrationAssetCount: (existingDefinitions.length + rows.length) * 4,
		curriculumCatalogPath: relativeToRepository(curriculumCatalogPath),
		curriculumCatalogSha256: canonicalHash(curriculumCatalog),
		rows
	};
	const source = { questions: sourceQuestions };
	const componentIds = [...new Set(rows.map((row) => row.curriculumComponentId))];
	const evidence = {
		components: componentIds.map((componentId) => ({
			componentId,
			title: `Evidence for ${componentId}`,
			sourceText: `Specification evidence for ${componentId}.`,
			specificationId: 'fixture-review-rebase-specification',
			specificationSha256: 'a'.repeat(64)
		}))
	};
	const parentCandidateById = new Map(
		rows.map((row, index) => [row.id, validReviewRebaseCandidate(row, index)])
	);
	const collisionPeer = parentCandidateById.get(rows[0].id);
	const targetRow = rows[targetPlanRowIndex];
	const targetParent = parentCandidateById.get(targetRow.id);
	collisionPeer.definition.previewQuestion =
		'Azurite seedlings beside a shaded pond reveal why chloroplast position changes during dawn.';
	collisionPeer.definition.transferPromptLead =
		'Quartz pistons compress a sealed gas while a pressure gauge records the warming cylinder.';
	targetParent.definition.previewQuestion = collisionPeer.definition.previewQuestion;
	targetParent.definition.transferPromptLead =
		'Copper coils rotate through a magnetic field while the voltmeter tracks induced current.';
	const shardIds = [...new Set(rows.map((row) => row.shard))];
	const parentBatches = new Map(
		shardIds.map((shardId) => [
			shardId,
			{
				schemaVersion: SCIENCE_CHALLENGE_BATCH_SCHEMA,
				challenges: rows
					.filter((row) => row.shard === shardId)
					.map((row) => parentCandidateById.get(row.id))
			}
		])
	);
	const parentCandidateSet = rows.map((row) => parentCandidateById.get(row.id));
	const selectedCandidateById = new Map(
		parentCandidateSet.map((candidate) => [candidate.definition.id, structuredClone(candidate)])
	);
	const selectedBatches = new Map(
		shardIds.map((shardId) => [
			shardId,
			{
				schemaVersion: SCIENCE_CHALLENGE_BATCH_SCHEMA,
				challenges: rows
					.filter((row) => row.shard === shardId)
					.map((row) => selectedCandidateById.get(row.id))
			}
		])
	);
	const targetReviewIssue = {
		field: 'definition.difficulty',
		category: 'calibration',
		evidence: 'The selected task does not support the stretch label.',
		repair: 'Set definition.difficulty to standard.'
	};
	const parentReviews = rows.map((row) => ({
		id: row.id,
		accepted: row.id !== targetRow.id,
		issues: row.id === targetRow.id ? [targetReviewIssue] : []
	}));
	const parentVerification = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(source),
		curriculumEvidenceSha256: canonicalHash(evidence),
		candidateSetSha256: canonicalHash(parentCandidateSet),
		reviewCount: rows.length,
		reviews: parentReviews
	};
	const parentVerificationSha256 = canonicalHash(parentVerification);
	const parentRepair = {
		schemaVersion: 'science-challenge-verification-repair-summary/v1',
		status: 'failed',
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(source),
		curriculumEvidenceSha256: canonicalHash(evidence),
		verificationRepairSha256: parentVerificationSha256,
		verificationRepairExecutionIdentity: {
			verificationSha256: parentVerificationSha256,
			planSha256: canonicalHash(basePlan),
			priorCandidateSetSha256: parentVerification.candidateSetSha256,
			objectiveId: '1'.repeat(64),
			executionId: '2'.repeat(64)
		},
		results: []
	};
	const effectivePlan = structuredClone(basePlan);
	effectivePlan.rows[targetPlanRowIndex].difficulty = 'standard';
	const rebasedCandidateSet = structuredClone(parentCandidateSet);
	rebasedCandidateSet[targetPlanRowIndex].definition.difficulty = 'standard';
	const expectedCollectionFailure = validateGeneratedChallengeCollection(rebasedCandidateSet, {
		existingDefinitions
	});
	assert.equal(expectedCollectionFailure.status, 'failed');
	assert.equal(
		expectedCollectionFailure.issues.length,
		1,
		expectedCollectionFailure.issues.join('\n')
	);
	const collectionIssue = expectedCollectionFailure.issues[0];
	assert.match(collectionIssue, new RegExp(targetRow.id));
	const collectionRemediations = [
		{
			issue: collectionIssue,
			preferredChallengeId: targetRow.id
		}
	];
	const spec = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA,
		parent: {
			planSha256: canonicalHash(basePlan),
			sourceSnapshotSha256: canonicalHash(source),
			curriculumEvidenceSha256: canonicalHash(evidence),
			verificationSha256: canonicalHash(parentVerification),
			repairSha256: canonicalHash(parentRepair),
			candidateSetSha256: parentVerification.candidateSetSha256,
			objectiveId: parentRepair.verificationRepairExecutionIdentity.objectiveId,
			executionId: parentRepair.verificationRepairExecutionIdentity.executionId
		},
		approval: {
			decision: 'approved',
			scope: 'fresh-full-review-only',
			rationale: 'Fixture authority for exact full-review successor replay.',
			authorizedMutationKeys: [
				`${targetRow.id}:definition.difficulty`,
				`${targetRow.id}:difficulty`
			].sort(),
			authorizedCollectionRemediationKeys: [`${targetRow.id}:${canonicalHash(collectionIssue)}`]
		},
		planMutations: [
			{
				challengeId: targetRow.id,
				field: 'difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		candidateMutations: [
			{
				challengeId: targetRow.id,
				field: 'definition.difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		collectionRemediations
	};
	const selectionIndex = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA,
		parentCandidateSources: [],
		selections: []
	};
	for (const shardId of shardIds) {
		const parentBatch = parentBatches.get(shardId);
		const selectedBatch = selectedBatches.get(shardId);
		const assignment = {
			assignmentId: shardId,
			planSha256: canonicalHash(basePlan),
			sourceSnapshotSha256: canonicalHash(source),
			curriculumEvidenceSha256: canonicalHash(evidence),
			items: parentBatch.challenges.map((candidate) => ({ candidate }))
		};
		const assignmentPath = path.join(inputRoot, 'parent-assignments', `${shardId}.json`);
		const candidatePath = path.join(inputRoot, 'selected', shardId, 'candidate.json');
		const validationPath = path.join(inputRoot, 'selected', shardId, 'validation.json');
		const validation = {
			status: 'failed',
			issues: ['Selected immutable parent candidate for deterministic review rebase.']
		};
		writeJson(assignmentPath, assignment);
		writeJson(candidatePath, selectedBatch);
		writeJson(validationPath, validation);
		selectionIndex.parentCandidateSources.push({
			shardId,
			assignmentPath: relativeToRepository(assignmentPath),
			assignmentSha256: canonicalHash(assignment)
		});
		selectionIndex.selections.push({
			shardId,
			disposition: 'selected-terminal-repair',
			candidatePath: relativeToRepository(candidatePath),
			candidateSha256: canonicalHash(selectedBatch),
			validationPath: relativeToRepository(validationPath),
			validationSha256: canonicalHash(validation)
		});
	}
	const specPath = path.join(inputRoot, 'review-rebase-spec.json');
	const parentVerificationPath = path.join(inputRoot, 'parent-verification.json');
	const parentRepairPath = path.join(inputRoot, 'parent-repair.json');
	const selectionIndexPath = path.join(inputRoot, 'selection-index.json');
	writeJson(planPath, basePlan);
	writeJson(sourcePath, source);
	writeJson(evidencePath, evidence);
	writeJson(curriculumCatalogPath, curriculumCatalog);
	writeJson(specPath, spec);
	writeJson(parentVerificationPath, parentVerification);
	writeJson(parentRepairPath, parentRepair);
	writeJson(selectionIndexPath, selectionIndex);

	const reviewRebase = publishScienceChallengeReviewRebaseEvidence({
		repositoryRoot,
		outputRoot: relativeToRepository(path.join(workRoot, 'review-rebase')),
		specPath: relativeToRepository(specPath),
		basePlanPath: relativeToRepository(planPath),
		sourceSnapshotPath: relativeToRepository(sourcePath),
		curriculumEvidencePath: relativeToRepository(evidencePath),
		parentVerificationPath: relativeToRepository(parentVerificationPath),
		parentRepairPath: relativeToRepository(parentRepairPath),
		selectionIndexPath: relativeToRepository(selectionIndexPath),
		existingDefinitions
	});
	assert.equal(reviewRebase.status, 'passed', reviewRebase.issues?.join('\n'));

	const firstReviewRows = effectivePlan.rows.map((row) => fullReviewRow(row.id));
	const targetFirstReview = firstReviewRows.find((review) => review.id === targetRow.id);
	targetFirstReview.contextsDistinct = false;
	targetFirstReview.accepted = false;
	targetFirstReview.issues = [
		{
			field: 'definition.previewQuestion',
			category: 'distinctness',
			evidence: 'The opening context duplicates another challenge in the same component.',
			repair: 'Replace only the duplicated opening with a distinct context.'
		}
	];
	const reviewRebaseTargetIds = [targetRow.id];
	const firstReviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planId: effectivePlan.planId,
		planSha256: canonicalHash(effectivePlan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		sourceSnapshotSha256: canonicalHash(source),
		curriculumEvidenceSha256: canonicalHash(evidence),
		candidateSetSha256: reviewRebase.coreManifest.candidateSetSha256,
		reviewRebaseManifestSha256: canonicalHash(reviewRebase.manifest),
		reviewRebaseId: reviewRebase.coreManifest.rebaseId,
		reviewRebaseCandidateSetSha256: reviewRebase.coreManifest.candidateSetSha256,
		reviewRebaseCollectionValidationSha256: reviewRebase.coreManifest.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256:
			reviewRebase.coreManifest.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediations: collectionRemediations,
		reviewRebaseCollectionRemediationTargetIds: reviewRebaseTargetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(reviewRebaseTargetIds),
		assignmentCount: shardIds.length,
		reviewCount: effectivePlan.rows.length,
		acceptedCount: effectivePlan.rows.length - 1,
		rejectedCount: 1,
		assignmentResults: shardIds.map((assignmentId) => ({
			assignmentId,
			status: 'passed'
		})),
		reviews: firstReviewRows,
		issues: []
	};
	const repairSha256 = canonicalHash(firstReviewSummary);
	const priorCandidate = reviewRebase.candidateBatches.get(targetRow.shard);
	const priorValidation = reviewRebase.outputValidations.get(targetRow.shard);
	const candidate = structuredClone(priorCandidate);
	const targetCandidate = candidate.challenges.find(
		(entry) => entry.definition.id === targetRow.id
	);
	targetCandidate.definition.previewQuestion =
		'Quartz marsh spores drift beside copper moss while pupils compare one precise causal claim.';
	const validation = {
		status: 'passed',
		issues: [],
		candidateSha256: canonicalHash(candidate)
	};
	const proposalRoot = path.join(
		generationRoot,
		'shards',
		targetRow.shard,
		`verification-repair-${repairSha256.slice(0, 12)}-attempt-01`
	);
	const candidatePath = path.join(proposalRoot, 'candidate.json');
	const validationPath = path.join(proposalRoot, 'validation.json');
	mkdirSync(generationRoot, { recursive: true });
	writeJson(candidatePath, candidate);
	writeJson(validationPath, validation);
	const validateCollectionCandidate = ({ candidateSet, effectivePlan: candidatePlan }) => {
		const collection = validateGeneratedChallengeCollection(candidateSet, { existingDefinitions });
		return {
			status: collection.status,
			issues: collection.issues,
			repairTargets: [],
			candidateSet,
			candidateCount: candidateSet.length,
			candidateSetSha256: canonicalHash(candidateSet),
			effectivePlanSha256: canonicalHash(candidatePlan)
		};
	};
	const successor = stageScienceChallengeEffectiveCohortSuccessor({
		workspaceRoot: repositoryRoot,
		outputRoot: generationRoot,
		repairSha256,
		objectiveId: '3'.repeat(64),
		executionId: '4'.repeat(64),
		reviewSummary: firstReviewSummary,
		reviewRebaseEvidence: reviewRebase,
		proposals: [
			{
				shardId: targetRow.shard,
				attempt: 1,
				candidatePath,
				validationPath,
				candidateSha256: canonicalHash(candidate),
				validationSha256: canonicalHash(validation),
				expectedTargetCandidateSha256: canonicalHash(priorCandidate),
				expectedTargetValidationSha256: canonicalHash(priorValidation)
			}
		],
		validateCollectionCandidate
	});
	assert.equal(successor.status, 'passed', successor.issues.join('\n'));
	return {
		rootDir: repositoryRoot,
		workRoot,
		generationRoot,
		outputRoot,
		planPath,
		sourcePath,
		evidencePath,
		basePlan,
		effectivePlan,
		source,
		evidence,
		targetRow,
		reviewRebase,
		successor
	};
}

function aggregatePreparedSuccessorFixture(fixture, index) {
	const reviewRoot = path.join(fixture.outputRoot, 'reviews');
	mkdirSync(reviewRoot, { recursive: true });
	const dispatches = index.assignments.map((assignment, assignmentIndex) => {
		const verifierIndex = Math.floor(assignmentIndex / 17) + 1;
		return {
			assignmentId: assignment.assignmentId,
			assignmentPath: assignment.path,
			assignmentSha256: assignment.sha256,
			orchestrator: 'codex-collaboration',
			taskName: `/root/science_empty_successor_${String(verifierIndex).padStart(3, '0')}`,
			forkTurns: 'none',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max'
		};
	});
	const ledger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		orchestrator: 'codex-collaboration',
		indexSha256: canonicalHash(index),
		createdAt: '2026-07-24T12:00:00.000Z',
		dispatches
	};
	const ledgerPath = path.join(fixture.outputRoot, 'dispatch-ledger.json');
	writeJson(ledgerPath, ledger);
	for (const [assignmentIndex, assignmentRecord] of index.assignments.entries()) {
		const assignment = readJson(path.resolve(repositoryRoot, assignmentRecord.path));
		const reviews = assignmentRecord.ids.map((id) => fullReviewRow(id));
		const targetReview = reviews.find((review) => review.id === fixture.targetRow.id);
		if (targetReview) {
			targetReview.contextsDistinct = false;
			targetReview.accepted = false;
			targetReview.issues = [
				{
					field: 'definition.previewQuestion',
					category: 'distinctness',
					evidence: 'The second independent review found one remaining ambiguous context.',
					repair: 'Make the context precise without changing accepted siblings.'
				}
			];
		}
		const verifier = {
			context: 'empty',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max',
			reviewedAt: '2026-07-24T13:00:00.000Z',
			provenance: {
				orchestrator: 'codex-collaboration',
				taskName: dispatches[assignmentIndex].taskName,
				forkTurns: 'none',
				dispatchLedgerSha256: canonicalHash(ledger)
			}
		};
		writeJson(path.join(reviewRoot, `${assignmentRecord.assignmentId}.json`), {
			schemaVersion: 'science-challenge-independent-verification/v1',
			assignmentId: assignmentRecord.assignmentId,
			assignmentEvidenceSha256: assignment.evidenceSha256,
			verifier,
			reviews
		});
	}
	const aggregate = spawnSync(
		process.execPath,
		[
			aggregateCliPath,
			`--index=${relativeToRepository(path.join(fixture.outputRoot, 'assignment-index.json'))}`,
			`--review-root=${relativeToRepository(reviewRoot)}`,
			`--output=${relativeToRepository(path.join(fixture.outputRoot, 'summary.json'))}`,
			`--dispatch-ledger=${relativeToRepository(ledgerPath)}`
		],
		{ cwd: repositoryRoot, encoding: 'utf8' }
	);
	assert.notEqual(aggregate.status, 0, 'one rejected review must keep the aggregate failed');
	const summary = readJson(path.join(fixture.outputRoot, 'summary.json'));
	assert.equal(summary.issues.length, 0, `${aggregate.stderr}\n${summary.issues.join('\n')}`);
	return summary;
}

async function loadExistingCatalogForTest() {
	const server = await createServer({
		root: repositoryRoot,
		server: { middlewareMode: true },
		appType: 'custom',
		logLevel: 'silent'
	});
	try {
		const module = await server.ssrLoadModule('/src/lib/challenges/catalog.ts');
		assert.ok(Array.isArray(module.challengeCatalog));
		return module.challengeCatalog;
	} finally {
		await server.close();
	}
}

function validReviewRebaseCandidate(row, planRowIndex) {
	const ordinal = String(planRowIndex + 1).padStart(3, '0');
	const tokenSet = [
		`azurite${ordinal}`,
		`bracken${ordinal}`,
		`citrine${ordinal}`,
		`dahlia${ordinal}`,
		`ember${ordinal}`,
		`fossil${ordinal}`
	].join(' ');
	const choices = (prefix, correctIndex) =>
		Array.from({ length: 3 }, (_, index) => ({
			id: `${prefix}-${index + 1}`,
			text: `${prefix} option ${index + 1} uses one linked scientific claim`,
			feedback: `${prefix} feedback ${index + 1} identifies the exact reasoning move.`,
			correct: index === correctIndex
		}));
	const strongerAnswer = planRowIndex % 2 === 0 ? 'a' : 'b';
	return {
		definition: {
			id: row.id,
			slug: row.id,
			subject: 'biology',
			subjectArtTheme: 'cells-practical',
			title: `How does fixture process ${ordinal} change?`,
			topic: `Fixture topic ${ordinal}`,
			hook: `A careful comparison exposes the hidden misconception in fixture process ${ordinal}.`,
			arc: row.arc,
			mechanic: row.mechanic,
			difficulty: row.difficulty,
			marks: 2,
			estimatedMinutes: 3,
			previewQuestion: `Opening case ${tokenSet} asks pupils to connect one measured change to its cause.`,
			metaDescription: `Practise a concise GCSE Biology reasoning challenge about fixture process ${ordinal}, then transfer the same causal method to a distinct scientific context.`,
			sourceQuestionId: row.calibrationQuestionId,
			lastReviewed: '2026-07-24',
			version: 1,
			staticAnswers: {
				a: `The first pupil links observation ${ordinal} to one precise scientific cause.`,
				b: `The second pupil links observation ${ordinal} to one broad scientific cause.`
			},
			strongerAnswer,
			weakAnswer: strongerAnswer === 'a' ? 'b' : 'a',
			weakAnswerKind: 'incomplete',
			showdownExplanation: `The stronger response for fixture ${ordinal} makes the required causal link explicit.`,
			commandWordLesson: `Explain means connect the stated observation to a scientifically relevant cause.`,
			diagnosisPrompt: `Which diagnosis identifies the missing link in fixture ${ordinal}?`,
			diagnosisChoices: choices('diagnosis', planRowIndex % 3),
			repairPrompt: `Which repair adds only the missing link in fixture ${ordinal}?`,
			repairChoices: choices('repair', (planRowIndex + 1) % 3),
			repairSuccess: `The repaired response now states the missing causal connection precisely.`,
			transferPromptLead: `Transfer case ${tokenSet} asks pupils to justify a different observation with the reusable causal method.`,
			transferChoices: choices('transfer', (planRowIndex + 2) % 3),
			transferExplanation: `The correct transfer choice applies the same causal reasoning in the new fixture context.`,
			memoryHandle: `Fixture causal link ${ordinal}`,
			freeTextKeywordGroups: [
				[`cause${ordinal}`, `link${ordinal}`],
				[`evidence${ordinal}`, `change${ordinal}`]
			]
		},
		grounding: {
			curriculumComponentId: row.curriculumComponentId,
			specificationId: row.specificationId,
			specificationSha256: row.specificationSha256,
			calibrationQuestionId: row.calibrationQuestionId,
			calibrationQuestionSha256: row.calibrationQuestionSha256
		},
		art: {
			opening: validQuestionArt(row.id, 'opening', ordinal),
			transfer: validQuestionArt(row.id, 'transfer', ordinal)
		}
	};
}

function validQuestionArt(id, context, ordinal) {
	return {
		schemaVersion: SCIENCE_QUESTION_ART_SCHEMA,
		id: `${id}-${context}`,
		context,
		scene: `${context} workspace ${ordinal} with neutral instruments, textured surfaces and balanced lighting.`,
		visualAnchor: `${context} specimen workspace ${ordinal}`,
		accuracyConstraints: [
			'Keep every instrument physically plausible.',
			'Keep the visible arrangement internally consistent.'
		],
		forbiddenDetails: ['No labels or written answers.', 'No arrows that imply a conclusion.'],
		altText: `A neutral ${context} science workspace for fixture ${ordinal}.`,
		approvedMeaning: `A context-specific but answer-neutral workspace for fixture ${ordinal}.`
	};
}

function relativeToRepository(filePath) {
	return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function candidateFor(row, planRowIndex) {
	return {
		definition: {
			id: row.id,
			title: `Fixture challenge ${planRowIndex + 1}?`,
			hook: `A misconception hook for fixture ${planRowIndex + 1}.`,
			difficulty: row.difficulty,
			marks: planRowIndex + 1,
			estimatedMinutes: 3,
			previewQuestion: `Opening context ${planRowIndex + 1} asks for a distinct scientific move.`,
			staticAnswers: {
				a: `Answer A for fixture ${planRowIndex + 1}.`,
				b: `Answer B for fixture ${planRowIndex + 1}.`
			},
			strongerAnswer: 'a',
			weakAnswer: 'b',
			weakAnswerKind: 'incomplete',
			showdownExplanation: `Explanation for fixture ${planRowIndex + 1}.`,
			commandWordLesson: `Command-word lesson for fixture ${planRowIndex + 1}.`,
			diagnosisPrompt: `Diagnose fixture ${planRowIndex + 1}.`,
			diagnosisChoices: [{ id: 'diagnosis', text: 'Diagnosis', correct: true }],
			repairPrompt: `Repair fixture ${planRowIndex + 1}.`,
			repairChoices: [{ id: 'repair', text: 'Repair', correct: true }],
			transferPromptLead: `Transfer context ${planRowIndex + 1} asks for the reusable scientific move.`,
			transferChoices: [{ id: 'transfer', text: 'Transfer', correct: true }],
			transferExplanation: `Transfer explanation for fixture ${planRowIndex + 1}.`,
			memoryHandle: `Memory handle ${planRowIndex + 1}.`
		},
		grounding: {
			curriculumComponentId: row.curriculumComponentId
		},
		art: {
			opening: {
				scene: `Opening art scene ${planRowIndex + 1}.`,
				visualAnchor: `Opening anchor ${planRowIndex + 1}.`,
				approvedMeaning: `Opening meaning ${planRowIndex + 1}.`,
				altText: `Opening alt ${planRowIndex + 1}.`
			},
			transfer: {
				scene: `Transfer art scene ${planRowIndex + 1}.`,
				visualAnchor: `Transfer anchor ${planRowIndex + 1}.`,
				approvedMeaning: `Transfer meaning ${planRowIndex + 1}.`,
				altText: `Transfer alt ${planRowIndex + 1}.`
			}
		}
	};
}

function runCli(
	fixture,
	{
		remapInputPath,
		difficultyInputPath,
		effectiveCohortManifestPath,
		reviewRebaseManifestPath
	} = {}
) {
	return spawnSync(
		process.execPath,
		[
			cliPath,
			`--plan=${path.relative(fixture.rootDir, fixture.planPath)}`,
			`--source=${path.relative(fixture.rootDir, fixture.sourcePath)}`,
			`--evidence=${path.relative(fixture.rootDir, fixture.evidencePath)}`,
			`--generation-root=${path.relative(fixture.rootDir, fixture.generationRoot)}`,
			`--output-root=${path.relative(fixture.rootDir, fixture.outputRoot)}`,
			...(remapInputPath
				? [`--curriculum-remap-input=${path.relative(fixture.rootDir, remapInputPath)}`]
				: []),
			...(difficultyInputPath
				? [
						`--difficulty-plan-adjustment-input=${path.relative(
							fixture.rootDir,
							difficultyInputPath
						)}`
					]
				: []),
			...(effectiveCohortManifestPath
				? [
						`--effective-cohort-manifest=${path.relative(
							fixture.rootDir,
							effectiveCohortManifestPath
						)}`
					]
				: []),
			...(reviewRebaseManifestPath
				? [`--review-rebase-manifest=${path.relative(fixture.rootDir, reviewRebaseManifestPath)}`]
				: [])
		],
		{ cwd: fixture.rootDir, encoding: 'utf8' }
	);
}

function fullReviewRow(id) {
	return {
		id,
		...Object.fromEntries(SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])),
		checkedCalculations: [],
		issues: [],
		accepted: true
	};
}

function readAssignments(fixture, index) {
	return index.assignments.map((assignment) =>
		readJson(path.resolve(fixture.rootDir, assignment.path))
	);
}

function reverseCandidateFileOrder(fixture) {
	const shardRoot = path.join(fixture.generationRoot, 'shards');
	for (const shard of readdirSync(shardRoot)) {
		const candidatePath = path.join(shardRoot, shard, 'candidate.json');
		const candidate = readJson(candidatePath);
		candidate.challenges.reverse();
		writeJson(candidatePath, candidate);
	}
}

function outputSnapshot(outputRoot) {
	const files = [
		'assignment-index.json',
		...readdirSync(path.join(outputRoot, 'assignments')).map((file) =>
			path.join('assignments', file)
		)
	].sort();
	return files.map((file) => [file, readFileSync(path.join(outputRoot, file), 'utf8')]);
}

function rebindAssignment(assignment) {
	const rebound = structuredClone(assignment);
	const core = structuredClone(rebound);
	delete core.evidenceSha256;
	rebound.evidenceSha256 = canonicalHash(core);
	return rebound;
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}
