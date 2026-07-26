import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_SUCCESSOR_EMPTY_RECOVERY_BINDING_SCHEMA,
	buildArtReviewModelTurn,
	buildArtReviewRequest,
	requireArtReviewEvidence,
	requireContentVerificationEvidence
} from './science-challenge-review-evidence.mjs';
import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';
import {
	buildScienceChallengeCurriculumRemapProposal,
	buildScienceChallengeCurriculumRemapVerifierInput
} from './science-challenge-curriculum-remap-review.mjs';
import {
	buildScienceChallengeCurriculumRemapDurableReceipt,
	findScienceChallengeCurriculumRemapDurableLeaks
} from './science-challenge-curriculum-remap-durable.mjs';
import { buildScienceChallengeVerifierPacketBundle } from './science-challenge-verifier-packets.mjs';
import {
	buildSameCurriculumComponentPeerEvidence,
	SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA
} from './science-challenge-verification-peers.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
	buildScienceChallengeDifficultyPlanAdjustment
} from './science-challenge-difficulty-plan-adjustment.mjs';
import { buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts } from './science-challenge-difficulty-plan-adjustment-review.mjs';

test('art review transport keeps the text prompt separate from structured image input', () => {
	const prompt = 'Review these exact question-art pairs.';
	const structuredInput = [
		{ type: 'text', text: prompt },
		{ type: 'text', text: 'PAIR 1 / dark' },
		{ type: 'local_image', path: '/tmp/dark.webp' }
	];
	assert.deepEqual(
		buildArtReviewModelTurn({
			prompt,
			structuredInput,
			model: 'gpt-5.6-sol'
		}),
		{
			prompt,
			structuredInput,
			model: 'gpt-5.6-sol'
		}
	);
	assert.throws(
		() => buildArtReviewModelTurn({ prompt: structuredInput, structuredInput }),
		/non-empty text prompt/
	);
	assert.throws(
		() =>
			buildArtReviewModelTurn({
				prompt,
				structuredInput: [{ type: 'text', text: prompt }]
			}),
		/requires structured text plus local-image input/
	);
});

test('content verification replay accepts three canonical task names and rejects an edited aggregate', () => {
	const fixture = contentFixture();
	try {
		assert.equal(
			requireContentVerificationEvidence({
				...fixture.context,
				summary: fixture.summary,
				requiredStatus: 'passed'
			}).status,
			'passed'
		);
		const edited = structuredClone(fixture.summary);
		edited.reviews[0].accepted = false;
		edited.acceptedCount = 0;
		edited.rejectedCount = 1;
		edited.status = 'failed';
		const replay = requireContentVerificationEvidence({
			...fixture.context,
			summary: edited,
			requiredStatus: 'failed'
		});
		assert.equal(replay.status, 'failed');
		assert.match(
			replay.issues.join('\n'),
			/summary reviews differ from the bound raw verifier results/
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('content replay authenticates difficulty-plan proposals and rejects a rebound stale raw decision', () => {
	const fixture = contentFixture({ withDifficulty: true });
	try {
		const replay = requireContentVerificationEvidence({
			...fixture.context,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));
		assert.deepEqual(replay.difficultyPlanAdjustmentDecisions, [
			{
				challengeId: fixture.context.plan.rows[0].id,
				field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
				from: 'stretch',
				to: 'standard',
				accepted: true
			}
		]);

		const resultPath = path.join(fixture.rootDir, 'verification/reviews/science-001.json');
		const result = JSON.parse(readFileSync(resultPath, 'utf8'));
		result.reviews[0].difficultyPlanAdjustmentDecisions[0].from = 'starter';
		writeJson(resultPath, result);
		fixture.summary.assignmentResults[0].sha256 = canonicalHash(result);
		fixture.summary.reviews[0] = structuredClone(result.reviews[0]);
		const staleReplay = requireContentVerificationEvidence({
			...fixture.context,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(staleReplay.status, 'failed');
		assert.match(
			staleReplay.issues.join('\n'),
			/Difficulty-plan adjustment decision differs from the assigned proposal/
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('content replay rejects fully rehashed stale difficulty packet and wave bindings', () => {
	for (const mutate of [
		(packet) => {
			packet.waves[1].difficultyPlanAdjustmentVerifierInputSha256 = 'f'.repeat(64);
		},
		(packet) => {
			delete packet.waves[0].difficultyPlanAdjustmentProposalEvidence;
		}
	]) {
		const fixture = contentFixture({ withDifficulty: true });
		try {
			const manifestPath = path.join(
				fixture.rootDir,
				'verification/verifier-packets/manifest.json'
			);
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			const packetRecord = manifest.packets[0];
			const packetPath = path.resolve(fixture.rootDir, packetRecord.packetPath);
			const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
			mutate(packet);
			writeJson(packetPath, packet);
			packetRecord.packetSha256 = canonicalHash(packet);
			writeJson(manifestPath, manifest);

			const replay = requireContentVerificationEvidence({
				...fixture.context,
				summary: fixture.summary,
				requiredStatus: 'passed'
			});
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /typed-recovery verifier (packet manifest|artifact)/);
		} finally {
			rmSync(fixture.rootDir, { recursive: true, force: true });
		}
	}
});

test('content replay rejects fully rehashed remap followup instruction, proposal and evidence tampering', () => {
	for (const tamper of [
		{
			assignmentId: 'science-044',
			mutate(payload) {
				const instruction =
					'Do not add curriculumRemapDecisions; an empty array is also valid because this assignment has no remap proposal.';
				assert.ok(payload.message.includes(instruction));
				payload.message = payload.message.replace(`\n${instruction}`, '');
			}
		},
		{
			assignmentId: 'science-001',
			mutate(payload, fixture) {
				const proposalSha256 =
					fixture.context.expectedCurriculumRemapVerifierInput.proposals[0].proposalSha256;
				assert.ok(payload.message.includes(proposalSha256));
				payload.message = payload.message.replace(proposalSha256, 'd'.repeat(64));
			}
		},
		{
			assignmentId: 'science-001',
			mutate(payload, fixture) {
				const sourceTextSha256 =
					fixture.context.expectedCurriculumRemapVerifierInput.evidence[0].from.sourceTextSha256;
				assert.ok(payload.message.includes(sourceTextSha256));
				payload.message = payload.message.replace(sourceTextSha256, 'e'.repeat(64));
			}
		}
	]) {
		const fixture = contentFixture({ withRemap: true });
		try {
			const manifestPath = path.join(
				fixture.rootDir,
				'verification/verifier-packets/manifest.json'
			);
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			let target = null;
			for (const packetRecord of manifest.packets) {
				const packetPath = path.resolve(fixture.rootDir, packetRecord.packetPath);
				const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
				const wave = packet.waves.find(
					(candidate) => candidate.assignmentId === tamper.assignmentId
				);
				if (wave) {
					target = { packetRecord, packetPath, packet, wave };
					break;
				}
			}
			assert.ok(target, `${tamper.assignmentId} verifier wave must exist`);
			const payloadPath = path.resolve(fixture.rootDir, target.wave.followupPayloadPath);
			const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
			tamper.mutate(payload, fixture);
			writeJson(payloadPath, payload);
			target.wave.followupPayloadSha256 = canonicalHash(payload);
			writeJson(target.packetPath, target.packet);
			target.packetRecord.packetSha256 = canonicalHash(target.packet);
			writeJson(manifestPath, manifest);

			const replay = requireContentVerificationEvidence({
				...fixture.context,
				summary: fixture.summary,
				requiredStatus: 'passed'
			});
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /typed-recovery verifier (packet manifest|artifact)/);
		} finally {
			rmSync(fixture.rootDir, { recursive: true, force: true });
		}
	}
});

test('content replay rejects stale difficulty aggregate and recovery-set authorities', () => {
	const aggregateFixture = contentFixture({ withDifficulty: true });
	try {
		aggregateFixture.summary.acceptedDifficultyPlanAdjustmentDecisionCount = 0;
		const replay = requireContentVerificationEvidence({
			...aggregateFixture.context,
			summary: aggregateFixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /status and counts/);
	} finally {
		rmSync(aggregateFixture.rootDir, { recursive: true, force: true });
	}

	const authorityFixture = contentFixture({ withDifficulty: true });
	try {
		const staleAuthority = structuredClone(
			authorityFixture.context.expectedDifficultyPlanAdjustmentVerifierInput
		);
		staleAuthority.recoverySetSha256 = 'e'.repeat(64);
		const replay = requireContentVerificationEvidence({
			...authorityFixture.context,
			expectedDifficultyPlanAdjustmentVerifierInput: staleAuthority,
			summary: authorityFixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /difficulty-plan adjustment verifier input|recovery/);
	} finally {
		rmSync(authorityFixture.rootDir, { recursive: true, force: true });
	}
});

test('content replay preserves a proposal-bound decision and rejects stale raw decision evidence', () => {
	const fixture = contentFixture({ withRemap: true });
	try {
		const replay = requireContentVerificationEvidence({
			...fixture.context,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));
		assert.deepEqual(
			findScienceChallengeCurriculumRemapDurableLeaks(replay.curriculumRemapDurableReceipt),
			[]
		);
		assert.doesNotMatch(
			JSON.stringify(replay.curriculumRemapDurableReceipt),
			/The broad parent component excerpt|The exact descendant component excerpt/
		);
		assert.equal(replay.rawCurriculumRemapProposalEvidence, undefined);
		assert.deepEqual(replay.rawReviews[0].curriculumRemapDecisions, [
			{
				challengeId: fixture.context.plan.rows[0].id,
				field: 'grounding.curriculumComponentId',
				from: fixture.context.basePlan.rows[0].curriculumComponentId,
				to: fixture.context.plan.rows[0].curriculumComponentId,
				accepted: true
			}
		]);
		const omittedAuthority = requireContentVerificationEvidence({
			...fixture.context,
			expectedCurriculumRemapVerifierInput: null,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(omittedAuthority.status, 'failed');
		assert.match(
			omittedAuthority.issues.join('\n'),
			/expected curriculum remap verifier input is required/
		);
		const leaked = structuredClone(fixture.summary);
		leaked.curriculumRemapDurableReceipt.remaps[0].ancestryChain[0].substantiveExcerpt =
			'Leaked specification source text.';
		const leakedCore = structuredClone(leaked.curriculumRemapDurableReceipt);
		delete leakedCore.receiptSha256;
		leaked.curriculumRemapDurableReceipt.receiptSha256 = canonicalHash(leakedCore);
		leaked.curriculumRemapDurableReceiptSha256 = canonicalHash(
			leaked.curriculumRemapDurableReceipt
		);
		const leakedReplay = requireContentVerificationEvidence({
			...fixture.context,
			summary: leaked,
			requiredStatus: 'passed'
		});
		assert.equal(leakedReplay.status, 'failed');
		assert.match(
			leakedReplay.issues.join('\n'),
			/substantiveExcerpt is unknown|forbidden source-rich field/
		);
		const reboundTamper = structuredClone(fixture.summary);
		reboundTamper.curriculumRemapDurableReceipt.remaps[0].toTitle = 'Rebound but stale title';
		const tamperedCore = structuredClone(reboundTamper.curriculumRemapDurableReceipt);
		delete tamperedCore.receiptSha256;
		reboundTamper.curriculumRemapDurableReceipt.receiptSha256 = canonicalHash(tamperedCore);
		reboundTamper.curriculumRemapDurableReceiptSha256 = canonicalHash(
			reboundTamper.curriculumRemapDurableReceipt
		);
		const reboundTamperReplay = requireContentVerificationEvidence({
			...fixture.context,
			summary: reboundTamper,
			requiredStatus: 'passed'
		});
		assert.equal(reboundTamperReplay.status, 'failed');
		assert.match(
			reboundTamperReplay.issues.join('\n'),
			/differs from the exact sanitized projection/
		);

		const resultPath = path.join(fixture.rootDir, 'verification/reviews/science-001.json');
		const result = JSON.parse(readFileSync(resultPath, 'utf8'));
		result.reviews[0].curriculumRemapDecisions[0].to = 'fixture-component-stale';
		writeJson(resultPath, result);
		const staleReplay = requireContentVerificationEvidence({
			...fixture.context,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(staleReplay.status, 'failed');
		assert.match(staleReplay.issues.join('\n'), /does not exactly match/);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('content replay authenticates a fresh full review that declines its assigned remap', () => {
	const fixture = contentFixture({ withRemap: true });
	try {
		const resultPath = path.join(fixture.rootDir, 'verification/reviews/science-001.json');
		const result = JSON.parse(readFileSync(resultPath, 'utf8'));
		result.reviews[0].curriculumRemapDecisions[0].accepted = false;
		writeJson(resultPath, result);
		const summary = structuredClone(fixture.summary);
		summary.reviews[0].curriculumRemapDecisions[0].accepted = false;
		summary.acceptedRemapDecisionCount = 0;
		summary.rejectedRemapDecisionCount = 1;
		summary.status = 'failed';
		summary.assignmentResults[0].sha256 = canonicalHash(result);
		summary.curriculumRemapDurableReceipt.remaps[0].decision.accepted = false;
		summary.curriculumRemapDurableReceipt.remaps[0].decisionSha256 = canonicalHash(
			summary.curriculumRemapDurableReceipt.remaps[0].decision
		);
		summary.curriculumRemapDurableReceipt.remaps[0].resultSha256 = canonicalHash(result);
		summary.curriculumRemapDurableReceipt.decisionSetSha256 = canonicalHash([
			summary.curriculumRemapDurableReceipt.remaps[0].decision
		]);
		const receiptCore = structuredClone(summary.curriculumRemapDurableReceipt);
		delete receiptCore.receiptSha256;
		summary.curriculumRemapDurableReceipt.receiptSha256 = canonicalHash(receiptCore);
		summary.curriculumRemapDurableReceiptSha256 = canonicalHash(
			summary.curriculumRemapDurableReceipt
		);
		const replay = requireContentVerificationEvidence({
			...fixture.context,
			summary,
			requiredStatus: 'failed'
		});
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('content replay accepts collection-only failed review only with exact review-rebase replay', () => {
	const fixture = contentFixture({ withReviewRebase: true });
	try {
		const replay = requireContentVerificationEvidence({
			...fixture.context,
			summary: fixture.summary,
			requiredStatus: 'failed'
		});
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));
		assert.equal(replay.rawReviews.length, 408);
		assert.equal(fixture.summary.acceptedCount, 408);
		assert.equal(fixture.summary.rejectedCount, 0);
		assert.deepEqual(fixture.summary.issues, []);

		const omitted = requireContentVerificationEvidence({
			...fixture.context,
			expectedReviewRebaseEvidence: null,
			summary: fixture.summary,
			requiredStatus: 'failed'
		});
		assert.equal(omitted.status, 'failed');
		assert.match(omitted.issues.join('\n'), /exact replayed review-rebase evidence is required/i);

		const staleAuthority = structuredClone(fixture.context.expectedReviewRebaseEvidence);
		staleAuthority.manifest.rebaseId = 'f'.repeat(64);
		const stale = requireContentVerificationEvidence({
			...fixture.context,
			expectedReviewRebaseEvidence: staleAuthority,
			summary: fixture.summary,
			requiredStatus: 'failed'
		});
		assert.equal(stale.status, 'failed');
		assert.match(stale.issues.join('\n'), /review-rebase .*differs from exact replay/i);

		const relabelledPassed = structuredClone(fixture.summary);
		relabelledPassed.status = 'passed';
		const passed = requireContentVerificationEvidence({
			...fixture.context,
			summary: relabelledPassed,
			requiredStatus: 'passed'
		});
		assert.equal(passed.status, 'failed');
		assert.match(passed.issues.join('\n'), /status and counts/i);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('content replay accepts only a trusted exact empty-recovery review-rebase successor binding', () => {
	const fixture = contentFixture({ withEmptyReviewRebaseSuccessor: true });
	try {
		const replay = requireContentVerificationEvidence({
			...fixture.context,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));

		const omittedAuthority = requireContentVerificationEvidence({
			...fixture.context,
			expectedReviewRebaseSuccessorEmptyRecoveryBinding: null,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(omittedAuthority.status, 'failed');
		assert.match(
			omittedAuthority.issues.join('\n'),
			/ordinary verification must not contain an effective-cohort or typed recovery-set binding/i
		);

		const staleManifestAuthority = structuredClone(
			fixture.context.expectedReviewRebaseSuccessorEmptyRecoveryBinding
		);
		staleManifestAuthority.effectiveCohortManifestSha256 = 'e'.repeat(64);
		const staleManifestReplay = requireContentVerificationEvidence({
			...fixture.context,
			expectedReviewRebaseSuccessorEmptyRecoveryBinding: staleManifestAuthority,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(staleManifestReplay.status, 'failed');
		assert.match(
			staleManifestReplay.issues.join('\n'),
			/empty recovery binding differs from the replayed effective cohort/i
		);

		const nonEmptyAuthority = {
			...fixture.context.expectedReviewRebaseSuccessorEmptyRecoveryBinding,
			recoverySetSha256: canonicalHash([{ kind: 'forged-recovery' }])
		};
		const nonEmptyReplay = requireContentVerificationEvidence({
			...fixture.context,
			expectedReviewRebaseSuccessorEmptyRecoveryBinding: nonEmptyAuthority,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(nonEmptyReplay.status, 'failed');
		assert.match(nonEmptyReplay.issues.join('\n'), /canonical empty recovery-set SHA-256/i);

		const tamperedSummary = structuredClone(fixture.summary);
		tamperedSummary.recoverySetSha256 = 'f'.repeat(64);
		const tamperedSummaryReplay = requireContentVerificationEvidence({
			...fixture.context,
			summary: tamperedSummary,
			requiredStatus: 'passed'
		});
		assert.equal(tamperedSummaryReplay.status, 'failed');
		assert.match(
			tamperedSummaryReplay.issues.join('\n'),
			/assignment index provenance|empty recovery binding differs/i
		);

		const indexPath = path.join(fixture.rootDir, 'verification/assignment-index.json');
		const manifestOnlyIndex = JSON.parse(readFileSync(indexPath, 'utf8'));
		delete manifestOnlyIndex.recoverySetSha256;
		writeJson(indexPath, manifestOnlyIndex);
		const manifestOnlySummary = structuredClone(fixture.summary);
		delete manifestOnlySummary.recoverySetSha256;
		manifestOnlySummary.indexSha256 = canonicalHash(manifestOnlyIndex);
		const manifestOnlyReplay = requireContentVerificationEvidence({
			...fixture.context,
			expectedReviewRebaseSuccessorEmptyRecoveryBinding: null,
			summary: manifestOnlySummary,
			requiredStatus: 'passed'
		});
		assert.equal(manifestOnlyReplay.status, 'failed');
		assert.match(
			manifestOnlyReplay.issues.join('\n'),
			/ordinary verification must not contain an effective-cohort or typed recovery-set binding/i
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('content replay authenticates infrastructure recovery as an effective-successor binding', () => {
	const fixture = contentFixture({ withInfrastructureRecoverySuccessor: true });
	try {
		const replay = requireContentVerificationEvidence({
			...fixture.context,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));

		const partialAuthority = structuredClone(
			fixture.context.expectedReviewRebaseSuccessorEmptyRecoveryBinding
		);
		delete partialAuthority.reviewRebaseInfrastructureRecoveryId;
		const partialReplay = requireContentVerificationEvidence({
			...fixture.context,
			expectedReviewRebaseSuccessorEmptyRecoveryBinding: partialAuthority,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(partialReplay.status, 'failed');
		assert.match(partialReplay.issues.join('\n'), /present all-or-none/i);

		const packetPath = path.join(
			fixture.rootDir,
			'verification/verifier-packets/verifier-01/packet.json'
		);
		const packetManifestPath = path.join(
			fixture.rootDir,
			'verification/verifier-packets/manifest.json'
		);
		const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
		packet.reviewRebaseInfrastructureRecoveryId = 'f'.repeat(64);
		writeJson(packetPath, packet);
		const packetManifest = JSON.parse(readFileSync(packetManifestPath, 'utf8'));
		packetManifest.packets[0].packetSha256 = canonicalHash(packet);
		writeJson(packetManifestPath, packetManifest);
		const packetReplay = requireContentVerificationEvidence({
			...fixture.context,
			summary: fixture.summary,
			requiredStatus: 'passed'
		});
		assert.equal(packetReplay.status, 'failed');
		assert.match(packetReplay.issues.join('\n'), /packet|infrastructure/i);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('empty successor authority cannot be mixed into typed or direct review-rebase verification', () => {
	for (const options of [{ withDifficulty: true }, { withReviewRebase: true }]) {
		const fixture = contentFixture(options);
		try {
			const replay = requireContentVerificationEvidence({
				...fixture.context,
				expectedReviewRebaseSuccessorEmptyRecoveryBinding: {
					schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SUCCESSOR_EMPTY_RECOVERY_BINDING_SCHEMA,
					effectiveCohortManifestSha256:
						fixture.summary.effectiveCohortManifestSha256 ?? 'd'.repeat(64),
					recoverySetSha256: canonicalHash([])
				},
				summary: fixture.summary,
				requiredStatus: fixture.summary.status
			});
			assert.equal(replay.status, 'failed');
			assert.match(
				replay.issues.join('\n'),
				/cannot be combined with typed recovery authority|direct review-rebase verification cannot contain/i
			);
		} finally {
			rmSync(fixture.rootDir, { recursive: true, force: true });
		}
	}
});

test('content replay rejects a rebound review-rebase payload with the non-forcing notice removed', () => {
	const fixture = contentFixture({ withReviewRebase: true });
	try {
		const manifestPath = path.join(fixture.rootDir, 'verification/verifier-packets/manifest.json');
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		const packetRecord = manifest.packets[0];
		const packetPath = path.resolve(fixture.rootDir, packetRecord.packetPath);
		const packet = JSON.parse(readFileSync(packetPath, 'utf8'));
		const wave = packet.waves[0];
		const payloadPath = path.resolve(fixture.rootDir, wave.followupPayloadPath);
		const payload = JSON.parse(readFileSync(payloadPath, 'utf8'));
		assert.match(payload.message, /Do not reject solely because this notice exists/i);
		payload.message = payload.message.replace(
			'Do not reject solely because this notice exists.',
			''
		);
		writeJson(payloadPath, payload);
		wave.followupPayloadSha256 = canonicalHash(payload);
		writeJson(packetPath, packet);
		packetRecord.packetSha256 = canonicalHash(packet);
		writeJson(manifestPath, manifest);

		const replay = requireContentVerificationEvidence({
			...fixture.context,
			summary: fixture.summary,
			requiredStatus: 'failed'
		});
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /verifier (packet manifest|artifact)/i);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('durable receipt rejects a rehashed sibling proposal in place of the manifest target', () => {
	const fixture = contentFixture({ withRemap: true });
	try {
		const verifierInput = structuredClone(fixture.durableInputs.verifierInput);
		const original = verifierInput.proposals[0];
		const sibling = verifierInput.candidateOverrides[0].candidate.challenges[1];
		const forgedProposal = buildScienceChallengeCurriculumRemapProposal({
			...original,
			challengeId: sibling.definition.id,
			targetCandidateSha256: canonicalHash(sibling)
		});
		verifierInput.proposals = [forgedProposal];
		verifierInput.evidence = [
			{
				...verifierInput.evidence[0],
				challengeId: forgedProposal.challengeId,
				proposalSha256: forgedProposal.proposalSha256
			}
		];
		assert.throws(
			() =>
				buildScienceChallengeCurriculumRemapDurableReceipt({
					...fixture.durableInputs,
					verifierInput
				}),
			/manifest-derived identity/
		);

		const rebound = structuredClone(fixture.durableInputs.verifierInput);
		const changed = buildScienceChallengeCurriculumRemapProposal({
			...rebound.proposals[0],
			baseReviewSha256: 'f'.repeat(64)
		});
		rebound.proposals = [changed];
		rebound.evidence[0].proposalSha256 = changed.proposalSha256;
		assert.throws(
			() =>
				buildScienceChallengeCurriculumRemapDurableReceipt({
					...fixture.durableInputs,
					verifierInput: rebound
				}),
			/baseReviewSha256 differs from .*manifest-derived identity/
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('art review replay requires a passed raw model run bound to its event log and response', () => {
	const fixture = artFixture();
	try {
		assert.equal(
			requireArtReviewEvidence({
				...fixture.context,
				review: fixture.review,
				requiredStatus: 'passed'
			}).status,
			'passed'
		);
		const batch = fixture.review.batches[0];
		const runSummaryPath = path.resolve(fixture.rootDir, batch.runSummaryPath);
		const runSummary = JSON.parse(readFileSync(runSummaryPath, 'utf8'));
		runSummary.status = 'failed';
		writeJson(runSummaryPath, runSummary);
		batch.runSummarySha256 = canonicalHash(runSummary);
		const replay = requireArtReviewEvidence({
			...fixture.context,
			review: fixture.review,
			requiredStatus: 'passed'
		});
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /raw input\/result\/model provenance is invalid/);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('art review replay rejects a fully rehashed model run that used a command tool', () => {
	const fixture = artFixture();
	try {
		const batch = fixture.review.batches[0];
		const eventPath = path.resolve(fixture.rootDir, batch.eventLogPath);
		const lastMessagePath = path.resolve(fixture.rootDir, batch.lastMessagePath);
		const rawResponse = readFileSync(lastMessagePath, 'utf8');
		const events = cleanModelEvents(rawResponse, [
			{
				type: 'item.completed',
				item: {
					type: 'command_execution',
					command: 'find .. -type f',
					status: 'passed'
				}
			}
		]);
		writeFileSync(eventPath, eventJsonLines(events));
		batch.eventLogSha256 = sha256(readFileSync(eventPath));

		const runSummaryPath = path.resolve(fixture.rootDir, batch.runSummaryPath);
		const runSummary = JSON.parse(readFileSync(runSummaryPath, 'utf8'));
		runSummary.commandActions = 1;
		runSummary.events = events.length;
		runSummary.eventLogSha256 = batch.eventLogSha256;
		writeJson(runSummaryPath, runSummary);
		batch.runSummarySha256 = canonicalHash(runSummary);

		const replay = requireArtReviewEvidence({
			...fixture.context,
			review: fixture.review,
			requiredStatus: 'passed'
		});
		assert.equal(replay.status, 'failed');
		assert.match(
			replay.issues.join('\n'),
			/model run policy:.*(?:commandActions must be 0|command_execution)/s
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('art review replay rejects a stale accepting response relabelled to changed image bytes', () => {
	const fixture = artFixture();
	try {
		const batch = fixture.review.batches[0];
		const spec = fixture.context.manifest.specs[0];
		writeFileSync(path.resolve(fixture.rootDir, spec.output.darkPath), 'changed-dark-fixture');
		const inputPath = path.resolve(fixture.rootDir, batch.inputPath);
		const input = JSON.parse(readFileSync(inputPath, 'utf8'));
		input.assets[0].darkSha256 = sha256(
			readFileSync(path.resolve(fixture.rootDir, spec.output.darkPath))
		);
		writeJson(inputPath, input);
		batch.inputSha256 = canonicalHash(input);
		batch.inputFileSha256 = sha256(readFileSync(inputPath));
		fixture.review.assetInventorySha256 = canonicalHash(input.assets);

		const request = buildArtReviewRequest({
			specs: [spec],
			assetInventory: input.assets
		});
		const requestSha256 = canonicalHash(request);
		const requestPath = path.resolve(fixture.rootDir, batch.requestPath);
		writeJson(requestPath, request);
		batch.requestSha256 = requestSha256;
		batch.requestFileSha256 = sha256(readFileSync(requestPath));

		const resultPath = path.resolve(fixture.rootDir, batch.resultPath);
		const result = JSON.parse(readFileSync(resultPath, 'utf8'));
		result.requestSha256 = requestSha256;
		result.provenance.inputSha256 = canonicalHash(input);
		result.provenance.requestSha256 = requestSha256;
		writeJson(resultPath, result);
		batch.resultSha256 = canonicalHash(result);
		const promptPath = path.resolve(fixture.rootDir, batch.promptPath);
		writeFileSync(promptPath, `Review changed fixture. Request: ${requestSha256}\n`);
		batch.promptSha256 = sha256(readFileSync(promptPath));

		const replay = requireArtReviewEvidence({
			...fixture.context,
			review: fixture.review,
			requiredStatus: 'passed'
		});
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /raw input\/result\/model provenance is invalid/);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

function contentFixture({
	withRemap = false,
	withDifficulty = false,
	withReviewRebase = false,
	withEmptyReviewRebaseSuccessor = false,
	withInfrastructureRecoverySuccessor = false
} = {}) {
	if (
		[
			withRemap,
			withDifficulty,
			withReviewRebase,
			withEmptyReviewRebaseSuccessor,
			withInfrastructureRecoverySuccessor
		].filter(Boolean).length > 1
	) {
		throw new Error('The focused fixture stages one typed recovery at a time.');
	}
	const rootDir = mkdtempSync(path.join(tmpdir(), 'science-content-review-evidence-'));
	const verificationRoot = path.join(rootDir, 'verification');
	const assignmentRoot = path.join(verificationRoot, 'assignments');
	const reviewRoot = path.join(verificationRoot, 'reviews');
	mkdirSync(assignmentRoot, { recursive: true });
	mkdirSync(reviewRoot, { recursive: true });
	const planRows = Array.from({ length: 51 }, (_unused, assignmentIndex) => {
		const assignmentId = `science-${String(assignmentIndex + 1).padStart(3, '0')}`;
		return Array.from({ length: 8 }, (_unusedItem, itemIndex) => ({
			id: `biology-fixture-${String(assignmentIndex * 8 + itemIndex + 1).padStart(3, '0')}`,
			shard: assignmentId,
			difficulty: assignmentIndex === 0 && itemIndex === 0 ? 'stretch' : 'standard',
			curriculumComponentId: `fixture-component-${String(
				assignmentIndex * 8 + itemIndex + 1
			).padStart(3, '0')}`
		}));
	}).flat();
	const basePlan = {
		planId: 'science-fixture-v1',
		rows: planRows
	};
	const plan = structuredClone(basePlan);
	if (withRemap) {
		plan.rows[0].curriculumComponentId = `${basePlan.rows[0].curriculumComponentId}-descendant`;
	}
	if (withDifficulty) {
		plan.rows[0].difficulty = 'standard';
	}
	const sourceSnapshot = { schemaVersion: 'fixture-source/v1' };
	const curriculumEvidence = { schemaVersion: 'fixture-curriculum/v1' };
	const candidateById = new Map(
		plan.rows.map((row) => [
			row.id,
			{
				definition: { id: row.id, difficulty: row.difficulty },
				grounding: { curriculumComponentId: row.curriculumComponentId }
			}
		])
	);
	const candidateSetSha256 = canonicalHash(plan.rows.map((row) => candidateById.get(row.id)));
	const reviewRebaseCollectionRemediations = withReviewRebase
		? [
				{
					issue: `${plan.rows[0].id} has a deterministic cohort-level context collision.`,
					preferredChallengeId: plan.rows[0].id
				}
			]
		: null;
	const reviewRebaseCollectionValidation = withReviewRebase
		? {
				status: 'failed',
				issues: reviewRebaseCollectionRemediations.map((item) => item.issue)
			}
		: null;
	const reviewRebaseCoreManifest = withReviewRebase
		? {
				status: 'review-pending',
				rebaseId: '7'.repeat(64),
				basePlanSha256: canonicalHash(basePlan),
				planSha256: canonicalHash(plan),
				sourceSnapshotSha256: canonicalHash(sourceSnapshot),
				curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
				candidateCount: plan.rows.length,
				candidateSetSha256,
				collectionValidationSha256: canonicalHash(reviewRebaseCollectionValidation),
				collectionRemediations: reviewRebaseCollectionRemediations,
				collectionRemediationSetSha256: canonicalHash(reviewRebaseCollectionRemediations),
				requiresFreshFullVerification: true,
				releaseEligible: false
			}
		: null;
	const reviewRebaseManifest = withReviewRebase
		? {
				...reviewRebaseCoreManifest,
				evidence: { schemaVersion: 'science-challenge-review-rebase-filesystem-evidence/v1' }
			}
		: null;
	const reviewRebaseTargetIds = withReviewRebase ? [plan.rows[0].id] : null;
	const reviewRebaseBindings = withReviewRebase
		? {
				reviewRebaseManifestSha256: canonicalHash(reviewRebaseManifest),
				reviewRebaseId: reviewRebaseCoreManifest.rebaseId,
				reviewRebaseCandidateSetSha256: candidateSetSha256,
				reviewRebaseCollectionValidationSha256: reviewRebaseCoreManifest.collectionValidationSha256,
				reviewRebaseCollectionRemediationSetSha256:
					reviewRebaseCoreManifest.collectionRemediationSetSha256,
				reviewRebaseCollectionRemediations,
				reviewRebaseCollectionRemediationTargetIds: reviewRebaseTargetIds,
				reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(reviewRebaseTargetIds)
			}
		: null;
	const reviewRebaseCandidateBatches = withReviewRebase
		? new Map(
				[...new Set(plan.rows.map((row) => row.shard))].map((shardId) => [
					shardId,
					{
						challenges: plan.rows
							.filter((row) => row.shard === shardId)
							.map((row) => candidateById.get(row.id))
					}
				])
			)
		: null;
	const expectedReviewRebaseEvidence = withReviewRebase
		? {
				status: 'passed',
				coreManifest: reviewRebaseCoreManifest,
				manifest: reviewRebaseManifest,
				plan,
				candidateBatches: reviewRebaseCandidateBatches,
				collectionValidation: reviewRebaseCollectionValidation
			}
		: null;
	const expectedReviewRebaseSuccessorEmptyRecoveryBinding =
		withEmptyReviewRebaseSuccessor || withInfrastructureRecoverySuccessor
			? {
					schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SUCCESSOR_EMPTY_RECOVERY_BINDING_SCHEMA,
					effectiveCohortManifestSha256: '6'.repeat(64),
					recoverySetSha256: canonicalHash([]),
					...(withInfrastructureRecoverySuccessor
						? {
								reviewRebaseInfrastructureRecoveryManifestSha256: '7'.repeat(64),
								reviewRebaseInfrastructureRecoveryId: '8'.repeat(64)
							}
						: {})
				}
			: null;
	const planRowIndexById = new Map(plan.rows.map((row, planRowIndex) => [row.id, planRowIndex]));
	const assignmentValues = new Map();
	let remapArtifacts = null;
	const difficultyArtifacts = withDifficulty
		? buildDifficultyRecoveryFixture({
				basePlan,
				effectivePlan: plan,
				candidateById,
				curriculumEvidenceSha256: canonicalHash(curriculumEvidence)
			})
		: null;
	const difficultyRecoveries = difficultyArtifacts ? [difficultyArtifacts.recovery] : [];
	const difficultyEffectiveCohortManifest = difficultyArtifacts
		? {
				schemaVersion: 'science-challenge-effective-cohort/v1',
				planId: plan.planId,
				basePlanSha256: canonicalHash(basePlan),
				effectivePlanSha256: canonicalHash(plan),
				candidateCount: plan.rows.length,
				candidateSetSha256,
				difficultyAdjustmentManifestSetSha256: canonicalHash([
					difficultyArtifacts.recovery.manifest
				]),
				recoverySetSha256: canonicalHash(difficultyRecoveries)
			}
		: null;
	const expectedDifficultyPlanAdjustmentVerifierInput = difficultyArtifacts
		? buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts({
				basePlan,
				effectivePlan: plan,
				effectiveCohortManifest: difficultyEffectiveCohortManifest,
				effectiveCohortManifestSha256: canonicalHash(difficultyEffectiveCohortManifest),
				recoveries: [
					{
						...difficultyArtifacts.recovery,
						firstReviewSummary: difficultyArtifacts.firstReviewSummary
					}
				],
				combinedRecoveries: difficultyRecoveries,
				recoverySetSha256: canonicalHash(difficultyRecoveries)
			})
		: null;
	const assignments = [...new Set(plan.rows.map((row) => row.shard))].map((assignmentId) => {
		const rows = plan.rows.filter((row) => row.shard === assignmentId);
		const assignmentCore = {
			schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA,
			assignmentId,
			planSha256: canonicalHash(plan),
			basePlanSha256: canonicalHash(basePlan),
			effectivePlanSha256: canonicalHash(plan),
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			...(reviewRebaseBindings
				? {
						reviewRebaseManifestSha256: reviewRebaseBindings.reviewRebaseManifestSha256,
						reviewRebaseId: reviewRebaseBindings.reviewRebaseId,
						reviewRebaseCandidateSetSha256: reviewRebaseBindings.reviewRebaseCandidateSetSha256,
						reviewRebaseCollectionRemediationSetSha256:
							reviewRebaseBindings.reviewRebaseCollectionRemediationSetSha256,
						reviewRebaseCollectionRemediations: reviewRebaseCollectionRemediations.filter((item) =>
							rows.some((row) => row.id === item.preferredChallengeId)
						)
					}
				: {}),
			items: rows.map((row) => ({
				planRowIndex: planRowIndexById.get(row.id),
				plan: row,
				candidate: candidateById.get(row.id),
				sameCurriculumComponentPeerEvidence: buildSameCurriculumComponentPeerEvidence({
					currentRow: row,
					planRows: plan.rows,
					candidateById
				})
			}))
		};
		if (withRemap && assignmentId === 'science-001') {
			const stagedCandidate = {
				schemaVersion: 'science-challenge-batch/v1',
				challenges: rows.map((row) => candidateById.get(row.id))
			};
			const priorCandidate = structuredClone(stagedCandidate);
			priorCandidate.challenges[0].grounding.curriculumComponentId =
				basePlan.rows[0].curriculumComponentId;
			const manifest = remapManifest({
				basePlan,
				effectivePlan: plan,
				priorCandidate,
				candidate: stagedCandidate,
				challengeId: rows[0].id,
				shardId: assignmentId,
				from: basePlan.rows[0].curriculumComponentId,
				to: rows[0].curriculumComponentId,
				planRowIndex: 0,
				curriculumEvidenceSha256: canonicalHash(curriculumEvidence)
			});
			const proposal = buildScienceChallengeCurriculumRemapProposal({
				challengeId: rows[0].id,
				field: 'grounding.curriculumComponentId',
				from: manifest.remap.from,
				to: manifest.remap.to,
				basePlanSha256: canonicalHash(basePlan),
				effectivePlanSha256: canonicalHash(plan),
				curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
				targetCandidateSha256: canonicalHash(candidateById.get(rows[0].id)),
				batchCandidateSha256: canonicalHash(stagedCandidate),
				baseReviewSha256: manifest.firstReview.summarySha256,
				manifestSha256: canonicalHash(manifest)
			});
			remapArtifacts = { stagedCandidate, priorCandidate, manifest };
			assignmentCore.curriculumRemapProposals = [proposal];
			assignmentCore.curriculumRemapProposalEvidence = [remapDisplayEvidence(proposal)];
		}
		if (withDifficulty && assignmentId === 'science-001') {
			assignmentCore.difficultyPlanAdjustmentProposals =
				expectedDifficultyPlanAdjustmentVerifierInput.proposals;
			assignmentCore.difficultyPlanAdjustmentProposalEvidence =
				expectedDifficultyPlanAdjustmentVerifierInput.proposalEvidence;
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
			ids: rows.map((row) => row.id),
			...(reviewRebaseBindings
				? {
						reviewRebaseManifestSha256: assignmentCore.reviewRebaseManifestSha256,
						reviewRebaseId: assignmentCore.reviewRebaseId,
						reviewRebaseCandidateSetSha256: assignmentCore.reviewRebaseCandidateSetSha256,
						reviewRebaseCollectionRemediationSetSha256:
							assignmentCore.reviewRebaseCollectionRemediationSetSha256,
						reviewRebaseCollectionRemediations: assignmentCore.reviewRebaseCollectionRemediations
					}
				: {})
		};
		if (assignmentCore.curriculumRemapProposals) {
			assignmentRecord.curriculumRemapProposals = assignmentCore.curriculumRemapProposals;
			assignmentRecord.curriculumRemapProposalEvidence =
				assignmentCore.curriculumRemapProposalEvidence;
		}
		if (assignmentCore.difficultyPlanAdjustmentProposals) {
			assignmentRecord.difficultyPlanAdjustmentProposals =
				assignmentCore.difficultyPlanAdjustmentProposals;
			assignmentRecord.difficultyPlanAdjustmentProposalEvidence =
				assignmentCore.difficultyPlanAdjustmentProposalEvidence;
		}
		return assignmentRecord;
	});
	const remapManifestSetSha256 = remapArtifacts ? canonicalHash([remapArtifacts.manifest]) : null;
	const expectedCurriculumRemapVerifierInput = withRemap
		? buildScienceChallengeCurriculumRemapVerifierInput({
				basePlan,
				basePlanSha256: canonicalHash(basePlan),
				effectivePlan: plan,
				curriculumCatalogSha256: '9'.repeat(64),
				effectiveCohortManifestSha256: 'a'.repeat(64),
				candidateCount: plan.rows.length,
				candidateSetSha256,
				remapManifestSetSha256,
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
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(plan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateCount: plan.rows.length,
		candidateSetSha256,
		...(reviewRebaseBindings ?? {}),
		...(expectedCurriculumRemapVerifierInput
			? {
					curriculumCatalogSha256: expectedCurriculumRemapVerifierInput.curriculumCatalogSha256,
					effectiveCohortManifestSha256:
						expectedCurriculumRemapVerifierInput.effectiveCohortManifestSha256,
					remapManifestSetSha256: expectedCurriculumRemapVerifierInput.remapManifestSetSha256,
					recoverySetSha256: expectedCurriculumRemapVerifierInput.recoverySetSha256
				}
			: {}),
		...(expectedDifficultyPlanAdjustmentVerifierInput
			? {
					effectiveCohortManifestSha256:
						expectedDifficultyPlanAdjustmentVerifierInput.effectiveCohortManifestSha256,
					difficultyAdjustmentManifestSetSha256:
						expectedDifficultyPlanAdjustmentVerifierInput.adjustmentManifestSetSha256,
					recoverySetSha256: expectedDifficultyPlanAdjustmentVerifierInput.recoverySetSha256
				}
			: {}),
		...(expectedReviewRebaseSuccessorEmptyRecoveryBinding
			? {
					effectiveCohortManifestSha256:
						expectedReviewRebaseSuccessorEmptyRecoveryBinding.effectiveCohortManifestSha256,
					recoverySetSha256: expectedReviewRebaseSuccessorEmptyRecoveryBinding.recoverySetSha256,
					...(withInfrastructureRecoverySuccessor
						? {
								reviewRebaseInfrastructureRecoveryManifestSha256:
									expectedReviewRebaseSuccessorEmptyRecoveryBinding.reviewRebaseInfrastructureRecoveryManifestSha256,
								reviewRebaseInfrastructureRecoveryId:
									expectedReviewRebaseSuccessorEmptyRecoveryBinding.reviewRebaseInfrastructureRecoveryId
							}
						: {})
				}
			: {}),
		assignments
	};
	if (expectedCurriculumRemapVerifierInput) {
		index.curriculumRemapVerifierInputSha256 = canonicalHash(expectedCurriculumRemapVerifierInput);
	}
	if (expectedDifficultyPlanAdjustmentVerifierInput) {
		index.difficultyPlanAdjustmentVerifierInputSha256 = canonicalHash(
			expectedDifficultyPlanAdjustmentVerifierInput
		);
	}
	writeJson(path.join(verificationRoot, 'assignment-index.json'), index);
	const dispatches = index.assignments.map((assignment, assignmentIndex) => {
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
		createdAt: '2026-07-21T00:00:00.000Z',
		dispatches
	};
	writeJson(path.join(verificationRoot, 'dispatch-ledger.json'), ledger);
	let remapPacketManifest = null;
	let remapPacketArtifacts = null;
	if (withRemap || withDifficulty || withReviewRebase || withInfrastructureRecoverySuccessor) {
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
		remapPacketManifest = packetBundle.manifest;
		remapPacketArtifacts = packetBundle.manifest.packets.map((packetRecord) => ({
			packetPath: packetRecord.packetPath,
			packet: readJsonWithinFixture(rootDir, packetRecord.packetPath)
		}));
	}
	const reviews = [];
	const assignmentResults = index.assignments.map((assignment, assignmentIndex) => {
		const assignmentValue = assignmentValues.get(assignment.assignmentId);
		const dispatch = dispatches[assignmentIndex];
		const assignmentReviews = assignment.ids.map((id) => acceptedContentReview(id));
		if (withRemap && assignment.assignmentId === 'science-001') {
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
		if (withDifficulty && assignment.assignmentId === 'science-001') {
			const proposal = assignment.difficultyPlanAdjustmentProposals[0];
			assignmentReviews[0].difficultyPlanAdjustmentDecisions = [
				{
					challengeId: proposal.challengeId,
					field: proposal.field,
					from: proposal.from,
					to: proposal.to,
					accepted: true
				}
			];
		}
		reviews.push(...assignmentReviews);
		const verifier = {
			context: 'empty',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max',
			reviewedAt: '2026-07-21T01:00:00.000Z',
			provenance: {
				orchestrator: 'codex-collaboration',
				taskName: dispatch.taskName,
				forkTurns: 'none',
				dispatchLedgerSha256: canonicalHash(ledger)
			}
		};
		const result = {
			schemaVersion: 'science-challenge-independent-verification/v1',
			assignmentId: assignment.assignmentId,
			assignmentEvidenceSha256: assignmentValue.evidenceSha256,
			verifier,
			reviews: assignmentReviews
		};
		const resultPath = path.join(reviewRoot, `${assignment.assignmentId}.json`);
		writeJson(resultPath, result);
		return {
			assignmentId: assignment.assignmentId,
			path: path.relative(rootDir, resultPath),
			sha256: canonicalHash(result),
			verifier,
			status: 'passed',
			issues: []
		};
	});
	const curriculumRemapDurableReceipt = withRemap
		? buildScienceChallengeCurriculumRemapDurableReceipt({
				verifierInput: expectedCurriculumRemapVerifierInput,
				assignmentIndex: index,
				packetManifest: remapPacketManifest,
				packets: remapPacketArtifacts,
				assignmentResults,
				decisions: reviews.flatMap((review) => review.curriculumRemapDecisions ?? [])
			})
		: null;
	const summary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(plan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256,
		...(index.effectiveCohortManifestSha256
			? { effectiveCohortManifestSha256: index.effectiveCohortManifestSha256 }
			: {}),
		...(withRemap
			? {
					curriculumRemapVerifierInputSha256: index.curriculumRemapVerifierInputSha256,
					recoverySetSha256: index.recoverySetSha256,
					curriculumRemapDurableReceipt,
					curriculumRemapDurableReceiptSha256: canonicalHash(curriculumRemapDurableReceipt)
				}
			: {}),
		...(withDifficulty
			? {
					difficultyPlanAdjustmentVerifierInputSha256:
						index.difficultyPlanAdjustmentVerifierInputSha256,
					recoverySetSha256: index.recoverySetSha256
				}
			: {}),
		...(expectedReviewRebaseSuccessorEmptyRecoveryBinding
			? {
					effectiveCohortManifestSha256:
						expectedReviewRebaseSuccessorEmptyRecoveryBinding.effectiveCohortManifestSha256,
					recoverySetSha256: expectedReviewRebaseSuccessorEmptyRecoveryBinding.recoverySetSha256,
					...(withInfrastructureRecoverySuccessor
						? {
								reviewRebaseInfrastructureRecoveryManifestSha256:
									expectedReviewRebaseSuccessorEmptyRecoveryBinding.reviewRebaseInfrastructureRecoveryManifestSha256,
								reviewRebaseInfrastructureRecoveryId:
									expectedReviewRebaseSuccessorEmptyRecoveryBinding.reviewRebaseInfrastructureRecoveryId
							}
						: {})
				}
			: {}),
		indexSha256: canonicalHash(index),
		dispatchLedgerSha256: canonicalHash(ledger),
		...(reviewRebaseBindings ?? {}),
		status: withReviewRebase ? 'failed' : 'passed',
		assignmentCount: 51,
		reviewCount: 408,
		acceptedCount: 408,
		rejectedCount: 0,
		acceptedRemapDecisionCount: withRemap ? 1 : 0,
		rejectedRemapDecisionCount: 0,
		acceptedDifficultyPlanAdjustmentDecisionCount: withDifficulty ? 1 : 0,
		rejectedDifficultyPlanAdjustmentDecisionCount: 0,
		issues: [],
		assignmentResults,
		reviews
	};
	return {
		rootDir,
		summary,
		durableInputs: {
			verifierInput: expectedCurriculumRemapVerifierInput,
			assignmentIndex: index,
			packetManifest: remapPacketManifest,
			packets: remapPacketArtifacts,
			assignmentResults,
			decisions: reviews.flatMap((review) => review.curriculumRemapDecisions ?? [])
		},
		context: {
			summaryPath: path.join(verificationRoot, 'summary.json'),
			plan,
			basePlan,
			expectedCurriculumRemapVerifierInput,
			expectedDifficultyPlanAdjustmentVerifierInput,
			expectedReviewRebaseEvidence,
			expectedReviewRebaseSuccessorEmptyRecoveryBinding,
			sourceSnapshot,
			curriculumEvidence,
			rootDir,
			expectedCount: 408
		}
	};
}

function artFixture() {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'science-art-review-evidence-'));
	const assetRoot = path.join(rootDir, 'assets');
	const batchRoot = path.join(rootDir, 'review', 'batches', 'art-review-001');
	mkdirSync(assetRoot, { recursive: true });
	mkdirSync(batchRoot, { recursive: true });
	const darkPath = path.join(assetRoot, 'fixture-dark.webp');
	const lightPath = path.join(assetRoot, 'fixture-light.webp');
	writeFileSync(darkPath, 'dark-fixture');
	writeFileSync(lightPath, 'light-fixture');
	const spec = {
		id: 'biology-fixture-opening',
		output: {
			darkPath: path.relative(rootDir, darkPath),
			lightPath: path.relative(rootDir, lightPath)
		}
	};
	const manifest = { releaseId: 'science-fixture-v1', specs: [spec] };
	const input = {
		schemaVersion: 'science-question-art-review-input/v2',
		manifestSpecsSha256: canonicalHash([spec]),
		assets: [
			{
				id: spec.id,
				darkSha256: sha256(readFileSync(darkPath)),
				lightSha256: sha256(readFileSync(lightPath))
			}
		]
	};
	const inputPath = path.join(batchRoot, 'review-input.json');
	writeJson(inputPath, input);
	const request = buildArtReviewRequest({
		specs: [spec],
		assetInventory: input.assets
	});
	const requestSha256 = canonicalHash(request);
	const requestPath = path.join(batchRoot, 'review-request.json');
	writeJson(requestPath, request);
	const row = acceptedArtReview(spec.id);
	const rawResult = { requestSha256, reviews: [row] };
	const rawResponse = JSON.stringify(rawResult);
	const lastMessagePath = path.join(batchRoot, 'last-message.json');
	writeFileSync(lastMessagePath, rawResponse);
	const eventPath = path.join(batchRoot, 'events.jsonl');
	const events = cleanModelEvents(rawResponse);
	writeFileSync(eventPath, eventJsonLines(events));
	const promptPath = path.join(batchRoot, 'prompt.txt');
	writeFileSync(promptPath, `Review this fixture. Request: ${requestSha256}\n`);
	const runSummary = {
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max',
		status: 'passed',
		error: null,
		events: events.length,
		commandActions: 0,
		failedCommandActions: 0,
		agentMessages: 1,
		webSearches: 0,
		fileChanges: 0,
		finalResponseSha256: sha256(Buffer.from(rawResponse)),
		lastMessageFileSha256: sha256(readFileSync(lastMessagePath)),
		eventLogSha256: sha256(readFileSync(eventPath))
	};
	const runSummaryPath = path.join(batchRoot, 'run-summary.json');
	writeJson(runSummaryPath, runSummary);
	const result = {
		requestSha256,
		reviews: [row],
		provenance: {
			inputSha256: canonicalHash(input),
			requestSha256,
			model: 'gpt-5.6-sol',
			thinkingLevel: 'max'
		}
	};
	const resultPath = path.join(batchRoot, 'result.json');
	writeJson(resultPath, result);
	const batch = {
		batchId: 'art-review-001',
		status: 'passed',
		ids: [spec.id],
		inputSha256: canonicalHash(input),
		inputPath: path.relative(rootDir, inputPath),
		inputFileSha256: sha256(readFileSync(inputPath)),
		requestPath: path.relative(rootDir, requestPath),
		requestSha256,
		requestFileSha256: sha256(readFileSync(requestPath)),
		resultPath: path.relative(rootDir, resultPath),
		resultSha256: canonicalHash(result),
		runSummaryPath: path.relative(rootDir, runSummaryPath),
		runSummarySha256: canonicalHash(runSummary),
		eventLogPath: path.relative(rootDir, eventPath),
		eventLogSha256: sha256(readFileSync(eventPath)),
		lastMessagePath: path.relative(rootDir, lastMessagePath),
		lastMessageSha256: sha256(readFileSync(lastMessagePath)),
		promptPath: path.relative(rootDir, promptPath),
		promptSha256: sha256(readFileSync(promptPath)),
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max'
	};
	const review = {
		schemaVersion: 'science-question-art-review-summary/v2',
		releaseId: manifest.releaseId,
		manifestSha256: canonicalHash(manifest),
		assetInventorySha256: canonicalHash(input.assets),
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max',
		selectedCount: 1,
		acceptedCount: 1,
		cleanAcceptedCount: 1,
		annotatedAcceptedCount: 0,
		rejectedCount: 0,
		majorRejectedCount: 0,
		missingCount: 0,
		invalidBatchCount: 0,
		batchCount: 1,
		status: 'passed',
		reviews: [row],
		batches: [batch]
	};
	return {
		rootDir,
		review,
		context: {
			reviewPath: path.join(rootDir, 'review', 'review-summary.json'),
			manifest,
			rootDir,
			expectedCount: 1
		}
	};
}

function cleanModelEvents(rawResponse, beforeAgent = []) {
	return [
		{ type: 'thread.started', thread_id: 'thread-fixture' },
		{ type: 'turn.started' },
		...beforeAgent,
		{
			type: 'item.completed',
			item: { type: 'agent_message', text: rawResponse }
		},
		{ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 20 } }
	];
}

function eventJsonLines(events) {
	return `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

function acceptedContentReview(id) {
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

function buildDifficultyRecoveryFixture({
	basePlan,
	effectivePlan,
	candidateById,
	curriculumEvidenceSha256
}) {
	const shardId = 'science-001';
	const targetId = basePlan.rows[0].id;
	const shardRows = basePlan.rows.filter((row) => row.shard === shardId);
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
	const firstReviews = basePlan.rows.map((row) => acceptedContentReview(row.id));
	firstReviews[0] = {
		...firstReviews[0],
		accepted: false,
		difficultyCalibrated: false,
		issues: [
			{
				field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
				category: 'difficulty',
				evidence: 'The planned stretch tier is too high for this otherwise secure task.',
				repair: 'Use standard rather than stretch for this exact challenge.'
			}
		]
	};
	const assignmentCore = {
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA,
		assignmentId: shardId,
		planId: basePlan.planId,
		planSha256: canonicalHash(basePlan),
		curriculumEvidenceSha256,
		items: shardRows.map((row) => ({
			planRowIndex: basePlan.rows.findIndex((candidate) => candidate.id === row.id),
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
				assignmentId: shardId,
				assignmentSha256: canonicalHash(firstAssignment),
				taskName: '/root/blind_verifier_difficulty',
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
		assignmentId: shardId,
		assignmentEvidenceSha256: firstAssignment.evidenceSha256,
		verifier: {
			context: 'empty',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max',
			reviewedAt: '2026-07-20T00:00:00.000Z',
			provenance: {
				orchestrator: 'codex-collaboration',
				taskName: '/root/blind_verifier_difficulty',
				forkTurns: 'none',
				dispatchLedgerSha256
			}
		},
		reviews: firstReviews.filter((review) => shardRows.some((row) => row.id === review.id))
	};
	const firstReviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: basePlan.planId,
		planSha256: canonicalHash(basePlan),
		curriculumEvidenceSha256,
		dispatchLedgerSha256,
		status: 'failed',
		reviewCount: firstReviews.length,
		acceptedCount: firstReviews.length - 1,
		rejectedCount: 1,
		issues: [],
		assignmentResults: [
			{
				assignmentId: shardId,
				sha256: canonicalHash(firstReviewResult),
				status: 'passed',
				issues: []
			}
		],
		reviews: firstReviews
	};
	const terminalCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: shardRows.map((row) => structuredClone(candidateById.get(row.id)))
	};
	const attempts = [1, 2, 3, 4].map((attemptNumber) => {
		const candidate =
			attemptNumber === 4 ? structuredClone(terminalCandidate) : structuredClone(priorCandidate);
		const runSummary = { status: 'passed', attempt: attemptNumber };
		return {
			attempt: attemptNumber,
			status: 'failed',
			candidate,
			runSummary,
			sourceValidation: {
				status: 'failed',
				issues:
					attemptNumber === 4
						? [`${targetId}: definition.difficulty differs from the plan row.`]
						: [`${targetId}: rejected content was returned unchanged.`],
				candidateSha256: canonicalHash(candidate),
				runSummarySha256: canonicalHash(runSummary),
				verificationRepairCohortIssues: []
			},
			runPolicy: { status: 'passed', issues: [] },
			fileBindings: {
				attemptDirectory: `attempt-${String(attemptNumber).padStart(2, '0')}`,
				candidateSha256: canonicalHash(candidate)
			}
		};
	});
	const result = buildScienceChallengeDifficultyPlanAdjustment({
		plan: basePlan,
		shardId,
		repairSha256: canonicalHash(firstReviewSummary),
		curriculumEvidenceSha256,
		priorCandidate,
		priorValidation,
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger,
		attempts,
		validateBatchCandidate: (candidate, rows, context) => {
			const status = context.validationMode === 'base-plan-negative-control' ? 'failed' : 'passed';
			return {
				status,
				issues: status === 'passed' ? [] : ['definition.difficulty differs from the plan row.'],
				candidateSha256: canonicalHash(candidate),
				planRowsSha256: canonicalHash(rows),
				planSha256: canonicalHash(context.effectivePlan ?? context.basePlan),
				candidateCount: candidate.challenges.length
			};
		},
		validateCollectionCandidate: (candidate, projectedPlan) => {
			const stagedById = new Map(
				candidate.challenges.map((challenge) => [challenge.definition.id, challenge])
			);
			const candidateSet = projectedPlan.rows.map(
				(row) => stagedById.get(row.id) ?? candidateById.get(row.id)
			);
			return {
				status: 'passed',
				issues: [],
				candidateSet,
				candidateCount: candidateSet.length,
				candidateSetSha256: canonicalHash(candidateSet),
				effectivePlanSha256: canonicalHash(projectedPlan)
			};
		}
	});
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(canonicalHash(result.effectivePlan), canonicalHash(effectivePlan));
	return {
		recovery: {
			manifest: result.manifest,
			priorCandidate,
			candidate: result.candidate
		},
		firstReviewSummary
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
			sourceTextSha256: 'b'.repeat(64),
			substantiveExcerpt: 'The broad parent component excerpt.'
		},
		to: {
			componentId: proposal.to,
			title: 'Exact descendant',
			sourceTextSha256: 'c'.repeat(64),
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
		field: remap.field,
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
			summarySha256: '1'.repeat(64),
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
		candidateTargetSha256: canonicalHash(candidateTarget),
		inverseTargetSha256: canonicalHash(priorTarget)
	};
	return {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
}

function acceptedArtReview(id) {
	return {
		id,
		accepted: true,
		disposition: 'accept',
		score: 20,
		scientificallyAccurate: true,
		exactlyRelevant: true,
		briefConsistentWithQuestion: true,
		visibleNotationMatchesQuestion: true,
		answerNeutral: true,
		textClean: true,
		themeConsistent: true,
		visuallyPolished: true,
		mobileSafe: true,
		accessibleAlt: true,
		visibleTakeaway: 'A precise question-specific scene.',
		issues: []
	};
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function readJsonWithinFixture(rootDir, relativePath) {
	return JSON.parse(readFileSync(path.resolve(rootDir, relativePath), 'utf8'));
}
