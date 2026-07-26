import assert from 'node:assert/strict';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_COLLECTION_POLICY,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DISPOSITION,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA,
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY,
	buildScienceChallengeDifficultyPlanAdjustment,
	buildScienceChallengeDifficultyPlanAdjustmentSet,
	difficultyPlanAdjustmentDecision,
	difficultyPlanAdjustmentSetDecisions,
	projectScienceChallengeDifficultyPlanAdjustments,
	validateScienceChallengeDifficultyPlanAdjustmentManifest,
	validateScienceChallengeDifficultyPlanAdjustmentSetManifest
} from './science-challenge-difficulty-plan-adjustment.mjs';
import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	canonicalHash
} from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY,
	buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts,
	validateScienceChallengeDifficultyPlanAdjustmentReviewRow,
	validateScienceChallengeDifficultyPlanAdjustmentVerifierInput
} from './science-challenge-difficulty-plan-adjustment-review.mjs';
import { deriveScienceChallengeDifficultyPlanAdjustments } from './science-challenge-difficulty-plan-adjustment-evidence.mjs';
import {
	SCIENCE_CHALLENGE_DESCENDANT_REMAP_DISPOSITION,
	SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
	SCIENCE_CHALLENGE_DESCENDANT_REMAP_SCHEMA
} from './science-challenge-descendant-remap.mjs';
import { projectScienceChallengeEffectiveRecoveryPlan } from './science-challenge-effective-plan-recovery.mjs';

const targetId = 'biology-plant-defence-responses-01';
const acceptedId = 'biology-pathogens-01';
const mixedTargetId = 'chemistry-giant-covalent-structures-01';
const exactTargetId = 'chemistry-metals-as-conductors-01';
const adjustmentSetShardId = 'science-021';
const shardId = 'science-005';
const curriculumEvidenceSha256 = 'c'.repeat(64);

test('uses only complete immutable terminal attempt-04 for a review-pending difficulty plan', () => {
	const fixture = difficultyFixture();
	const result = buildScienceChallengeDifficultyPlanAdjustment(fixture);

	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(
		result.manifest.disposition,
		SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DISPOSITION
	);
	assert.equal(result.manifest.sourceAttempt.attempt, 4);
	assert.equal(
		result.manifest.sourceAttempt.selectionPolicy,
		SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SOURCE_POLICY
	);
	assert.equal(result.manifest.attemptBudget.selectedAttempt, 4);
	assert.equal(result.validation.status, 'review-pending');
	assert.equal(result.effectivePlan.rows[1].difficulty, 'standard');
	assert.equal(result.candidate.challenges[1].definition.difficulty, 'standard');
	assert.equal(
		canonicalHash(result.candidate.challenges[0]),
		canonicalHash(fixture.priorCandidate.challenges[0])
	);
	assert.deepEqual(difficultyPlanAdjustmentDecision(result.manifest, true), {
		challengeId: targetId,
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		from: 'stretch',
		to: 'standard',
		accepted: true
	});
	const replay = validateScienceChallengeDifficultyPlanAdjustmentManifest({
		manifest: result.manifest,
		plan: fixture.plan,
		priorCandidate: fixture.priorCandidate,
		candidate: result.candidate
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	const projection = projectScienceChallengeDifficultyPlanAdjustments(fixture.plan, [
		{
			manifest: result.manifest,
			priorCandidate: fixture.priorCandidate,
			candidate: result.candidate
		}
	]);
	assert.equal(projection.status, 'passed', projection.issues.join('\n'));
	assert.equal(projection.plan.rows[1].difficulty, 'standard');
	assert.equal(canonicalHash(projection.plan), canonicalHash(result.effectivePlan));
});

test('never selects an earlier matching attempt when terminal attempt-04 is invalid', () => {
	const fixture = difficultyFixture();
	fixture.attempts[2].candidate.challenges[1].definition.difficulty = 'standard';
	rebindAttempt(fixture.attempts[2]);
	fixture.attempts[3].candidate = structuredClone(fixture.priorCandidate);
	rebindAttempt(fixture.attempts[3]);

	const result = buildScienceChallengeDifficultyPlanAdjustment(fixture);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /terminal attempt-04/i);
});

test('rejects attempt five, gaps, invalidation and a non-terminal source selection', () => {
	for (const mutate of [
		(fixture) => {
			fixture.attempts.push(attempt(5, fixture.priorCandidate, true));
		},
		(fixture) => {
			fixture.attempts[2].attempt = 4;
		},
		(fixture) => {
			fixture.attempts[3].invalidated = true;
		},
		(fixture) => {
			fixture.attempts[3].runPolicy.status = 'failed';
			fixture.attempts[3].runPolicy.issues = ['tool use'];
		}
	]) {
		const fixture = difficultyFixture();
		mutate(fixture);
		const result = buildScienceChallengeDifficultyPlanAdjustment(fixture);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /four|attempt|terminal/i);
	}
});

test('rejects accepted-sibling drift and every non-difficulty target edit', () => {
	const acceptedDrift = difficultyFixture();
	acceptedDrift.attempts[3].candidate.challenges[0].definition.title = 'Changed accepted row';
	rebindAttempt(acceptedDrift.attempts[3]);
	const acceptedResult = buildScienceChallengeDifficultyPlanAdjustment(acceptedDrift);
	assert.equal(acceptedResult.status, 'failed');
	assert.match(
		acceptedResult.issues.join('\n'),
		/difficulty adjustment|accepted\/rejected row preservation/i
	);

	const targetDrift = difficultyFixture();
	targetDrift.attempts[3].candidate.challenges[1].definition.title = 'Changed target title as well';
	rebindAttempt(targetDrift.attempts[3]);
	const targetResult = buildScienceChallengeDifficultyPlanAdjustment(targetDrift);
	assert.equal(targetResult.status, 'failed');
	assert.match(targetResult.issues.join('\n'), /difficulty adjustment/i);
});

test('requires one exact difficulty-only first-review rejection with explicit values', () => {
	const staleWording = difficultyFixture();
	staleWording.firstReviewSummary.reviews[1].issues[0].repair = 'Choose a more suitable level.';
	rebindReview(staleWording);
	let result = buildScienceChallengeDifficultyPlanAdjustment(staleWording);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /does not explicitly authorize/i);

	const ambiguous = difficultyFixture();
	ambiguous.firstReviewSummary.reviews[0] = {
		...reviewRow(acceptedId),
		difficultyCalibrated: false,
		accepted: false,
		issues: [difficultyIssue()]
	};
	ambiguous.firstReviewResult.reviews = structuredClone(ambiguous.firstReviewSummary.reviews);
	rebindReview(ambiguous);
	result = buildScienceChallengeDifficultyPlanAdjustment(ambiguous);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /exactly one verifier-directed difficulty adjustment/i);

	const mixedIssue = difficultyFixture();
	mixedIssue.firstReviewSummary.reviews[1].issues.push({
		field: 'definition.title',
		category: 'copy',
		evidence: 'Title issue.',
		repair: 'Repair title.'
	});
	mixedIssue.firstReviewResult.reviews = structuredClone(mixedIssue.firstReviewSummary.reviews);
	rebindReview(mixedIssue);
	result = buildScienceChallengeDifficultyPlanAdjustment(mixedIssue);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /exactly one verifier-directed difficulty adjustment/i);
});

test('allows other rejected siblings to change and ignores their mixed difficulty issues', () => {
	const fixture = difficultyFixture();
	fixture.firstReviewSummary.reviews[0] = {
		...reviewRow(acceptedId),
		difficultyCalibrated: false,
		learnerCopyClean: false,
		accepted: false,
		issues: [
			difficultyIssue(),
			{
				field: 'definition.title',
				category: 'copy',
				evidence: 'The sibling title is unclear.',
				repair: 'Repair only the sibling title.'
			}
		]
	};
	fixture.attempts[3].candidate.challenges[0].definition.title = 'Repaired rejected sibling';
	rebindAttempt(fixture.attempts[3]);
	rebindReview(fixture);
	const result = buildScienceChallengeDifficultyPlanAdjustment(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(result.candidate.challenges[0].definition.title, 'Repaired rejected sibling');
	assert.equal(result.manifest.siblingReviewBindings[0].accepted, false);
});

test('composes a helper-approved failed-merge attempt-04 with only the target difficulty inversion', () => {
	const fixture = difficultyFixture();
	fixture.firstReviewSummary.reviews[0] = {
		...reviewRow(acceptedId),
		learnerCopyClean: false,
		accepted: false,
		issues: [
			{
				field: 'definition.title',
				category: 'copy',
				evidence: 'The sibling title needs repair.',
				repair: 'Repair the sibling title.'
			}
		]
	};
	const terminal = fixture.attempts[3];
	terminal.candidate.challenges[0].definition.title = 'Helper-retained sibling repair';
	const helperCandidate = structuredClone(terminal.candidate);
	helperCandidate.challenges[1].definition.difficulty = 'stretch';
	const corrections = [
		{
			kind: 'definition.id',
			absoluteRowIndex: 0,
			from: `${acceptedId}x`,
			to: acceptedId
		},
		{
			kind: 'definition.difficulty',
			absoluteRowIndex: 1,
			from: 'standard',
			to: 'stretch'
		}
	];
	terminal.sourceKind = 'helper-approved-multipart-salvage';
	terminal.runSummary.status = 'failed';
	terminal.helperSalvage = {
		sourceRunStatus: 'failed',
		candidate: helperCandidate,
		manifest: {
			schemaVersion: 'science-challenge-multipart-plan-salvage-evidence/v2',
			sourceAttempt: { attempt: 4, status: 'failed' },
			salvage: {
				candidateSha256: canonicalHash(helperCandidate),
				corrections
			},
			candidateSha256: canonicalHash(helperCandidate)
		}
	};
	rebindAttempt(terminal);
	rebindReview(fixture);
	const result = buildScienceChallengeDifficultyPlanAdjustment(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(result.manifest.sourceAttempt.sourceKind, 'helper-approved-multipart-salvage');
	assert.equal(result.manifest.sourceAttempt.runStatus, 'failed');
	assert.equal(result.candidate.challenges[0].definition.title, 'Helper-retained sibling repair');
	assert.equal(result.candidate.challenges[1].definition.difficulty, 'standard');
	assert.match(result.manifest.sourceAttempt.helperSalvageCorrectionsSha256, /^[a-f0-9]{64}$/);
	const replay = validateScienceChallengeDifficultyPlanAdjustmentManifest({
		manifest: result.manifest,
		plan: fixture.plan,
		priorCandidate: fixture.priorCandidate,
		candidate: result.candidate
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	const projection = projectScienceChallengeEffectiveRecoveryPlan(fixture.plan, [
		{
			manifest: result.manifest,
			priorCandidate: fixture.priorCandidate,
			candidate: result.candidate
		}
	]);
	assert.equal(projection.status, 'passed', projection.issues.join('\n'));
	assert.equal(projection.effectivePlan.rows[1].difficulty, 'standard');
});

test('requires local negative/positive controls and defers the final collection gate', () => {
	const basePass = difficultyFixture();
	basePass.validateBatchCandidate = validationAdapter({ baseStatus: 'passed' });
	let result = buildScienceChallengeDifficultyPlanAdjustment(basePass);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /must fail the frozen plan/i);

	const effectiveFail = difficultyFixture();
	effectiveFail.validateBatchCandidate = validationAdapter({ effectiveStatus: 'failed' });
	result = buildScienceChallengeDifficultyPlanAdjustment(effectiveFail);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /pass the exact effective difficulty plan/i);

	const collectionFail = difficultyFixture();
	let collectionCalls = 0;
	collectionFail.validateCollectionCandidate = () => {
		collectionCalls += 1;
		throw new Error('typed adjustment must not evaluate an incomplete peer cohort');
	};
	result = buildScienceChallengeDifficultyPlanAdjustment(collectionFail);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(collectionCalls, 0);
	assert.equal(result.collectionValidation.status, 'deferred');
	assert.equal(
		result.manifest.collectionValidationPolicy,
		SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_COLLECTION_POLICY
	);
});

test('manifest replay rejects self-binding, source-policy and inverse tampering', () => {
	const fixture = difficultyFixture();
	const result = buildScienceChallengeDifficultyPlanAdjustment(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	for (const mutate of [
		(manifest) => {
			manifest.adjustment.to = 'starter';
		},
		(manifest) => {
			manifest.attemptBudget.selectedAttempt = 3;
		},
		(manifest) => {
			manifest.attemptBudget.selectionPolicy = 'latest-matching';
		},
		(manifest) => {
			manifest.inverseAdjustment.to = 'standard';
		}
	]) {
		const manifest = structuredClone(result.manifest);
		mutate(manifest);
		const replay = validateScienceChallengeDifficultyPlanAdjustmentManifest({
			manifest,
			plan: fixture.plan,
			priorCandidate: fixture.priorCandidate,
			candidate: result.candidate
		});
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /self-binding|attempt|patch|inverse/i);
	}
});

test('builds exact typed verifier proposals and requires a matching fresh decision', () => {
	const fixture = difficultyFixture();
	const result = buildScienceChallengeDifficultyPlanAdjustment(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	const recovery = {
		manifest: result.manifest,
		candidate: result.candidate,
		priorCandidate: fixture.priorCandidate,
		firstReviewSummary: fixture.firstReviewSummary
	};
	const effectiveCohortManifest = difficultyEffectiveCohortManifest(
		fixture.plan,
		result.effectivePlan,
		recovery
	);
	const verifierInput = buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts({
		basePlan: fixture.plan,
		effectivePlan: result.effectivePlan,
		effectiveCohortManifest,
		effectiveCohortManifestSha256: canonicalHash(effectiveCohortManifest),
		recoveries: [recovery]
	});
	const validation = validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(verifierInput, {
		basePlan: fixture.plan,
		effectivePlan: result.effectivePlan
	});
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));
	const proposal = verifierInput.proposals[0];
	const review = {
		...reviewRow(targetId),
		[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY]: [
			{
				challengeId: proposal.challengeId,
				field: proposal.field,
				from: proposal.from,
				to: proposal.to,
				accepted: true
			}
		]
	};
	assert.equal(
		validateScienceChallengeDifficultyPlanAdjustmentReviewRow(review, { proposal }).status,
		'passed'
	);
});

test('typed difficulty decisions fail closed on missing, stale, false, ambiguous and unassigned data', () => {
	const fixture = difficultyFixture();
	const result = buildScienceChallengeDifficultyPlanAdjustment(fixture);
	const recovery = {
		manifest: result.manifest,
		candidate: result.candidate,
		priorCandidate: fixture.priorCandidate,
		firstReviewSummary: fixture.firstReviewSummary
	};
	const effectiveCohortManifest = difficultyEffectiveCohortManifest(
		fixture.plan,
		result.effectivePlan,
		recovery
	);
	const verifierInput = buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts({
		basePlan: fixture.plan,
		effectivePlan: result.effectivePlan,
		effectiveCohortManifest,
		effectiveCohortManifestSha256: canonicalHash(effectiveCohortManifest),
		recoveries: [recovery]
	});
	const proposal = verifierInput.proposals[0];
	const matchingDecision = {
		challengeId: proposal.challengeId,
		field: proposal.field,
		from: proposal.from,
		to: proposal.to,
		accepted: true
	};
	for (const [label, review] of [
		['missing', reviewRow(targetId)],
		[
			'stale',
			{
				...reviewRow(targetId),
				[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY]: [
					{ ...matchingDecision, from: 'standard' }
				]
			}
		],
		[
			'false-with-passing-review',
			{
				...reviewRow(targetId),
				[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY]: [
					{ ...matchingDecision, accepted: false }
				]
			}
		],
		[
			'ambiguous',
			{
				...reviewRow(targetId),
				[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY]: [
					matchingDecision,
					matchingDecision
				]
			}
		]
	]) {
		const validation = validateScienceChallengeDifficultyPlanAdjustmentReviewRow(review, {
			proposal
		});
		if (label === 'false-with-passing-review') {
			assert.equal(validation.status, 'passed');
		} else {
			assert.equal(validation.status, 'failed', label);
		}
	}
	const rejectedReview = {
		...reviewRow(targetId),
		accepted: false,
		difficultyCalibrated: false,
		issues: [difficultyIssue()],
		[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY]: [matchingDecision]
	};
	assert.equal(
		validateScienceChallengeDifficultyPlanAdjustmentReviewRow(rejectedReview, { proposal }).status,
		'failed'
	);
	const unassigned = {
		...reviewRow(acceptedId),
		[SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_DECISION_PROPERTY]: [matchingDecision]
	};
	assert.equal(
		validateScienceChallengeDifficultyPlanAdjustmentReviewRow(unassigned).status,
		'failed'
	);

	const staleInput = structuredClone(verifierInput);
	staleInput.proposals[0].effectivePlanSha256 = 'f'.repeat(64);
	assert.equal(
		validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(staleInput).status,
		'failed'
	);
});

test('binds both science-021 verifier-authorized difficulty corrections without rewriting terminal content', () => {
	const fixture = difficultySetFixture();
	for (const attemptIndex of [0, 2]) {
		delete fixture.attempts[attemptIndex].candidate;
		delete fixture.attempts[attemptIndex].runPolicy;
	}
	const terminalCandidateSha256 = canonicalHash(fixture.attempts[3].candidate);
	const result = buildScienceChallengeDifficultyPlanAdjustmentSet(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(
		result.manifest.schemaVersion,
		SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA
	);
	assert.equal(result.manifest.shardId, adjustmentSetShardId);
	assert.equal(result.manifest.adjustmentCount, 2);
	assert.deepEqual(result.adjustments, fixture.requestedAdjustments);
	assert.equal(result.effectivePlan.rows[0].difficulty, 'standard');
	assert.equal(result.effectivePlan.rows[1].difficulty, 'standard');
	assert.equal(canonicalHash(result.candidate), terminalCandidateSha256);
	assert.equal(result.candidate.challenges[0].definition.title, 'Repaired giant covalent transfer');
	assert.notEqual(
		result.manifest.adjustments[0].candidateWithoutAdjustmentSha256,
		result.manifest.adjustments[0].priorTargetSha256
	);
	assert.deepEqual(difficultyPlanAdjustmentSetDecisions(result.manifest, true), [
		{ ...fixture.requestedAdjustments[0], accepted: true },
		{ ...fixture.requestedAdjustments[1], accepted: true }
	]);
	const replay = validateScienceChallengeDifficultyPlanAdjustmentSetManifest({
		manifest: result.manifest,
		plan: fixture.plan,
		priorCandidate: fixture.priorCandidate,
		candidate: result.candidate
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	const projection = projectScienceChallengeEffectiveRecoveryPlan(fixture.plan, [
		{
			manifest: result.manifest,
			priorCandidate: fixture.priorCandidate,
			candidate: result.candidate
		}
	]);
	assert.equal(projection.status, 'passed', projection.issues.join('\n'));
	assert.equal(projection.recoveryCount, 2);
	assert.equal(canonicalHash(projection.effectivePlan), canonicalHash(result.effectivePlan));
	const recovery = {
		manifest: result.manifest,
		candidate: result.candidate,
		priorCandidate: fixture.priorCandidate,
		firstReviewSummary: fixture.firstReviewSummary
	};
	const effectiveCohortManifest = difficultyEffectiveCohortManifest(
		fixture.plan,
		result.effectivePlan,
		recovery
	);
	const verifierInput = buildScienceChallengeDifficultyPlanAdjustmentVerifierInputFromArtifacts({
		basePlan: fixture.plan,
		effectivePlan: result.effectivePlan,
		effectiveCohortManifest,
		effectiveCohortManifestSha256: canonicalHash(effectiveCohortManifest),
		recoveries: [recovery]
	});
	assert.equal(verifierInput.proposals.length, 2);
	assert.equal(verifierInput.candidateOverrides.length, 2);
	assert.deepEqual(
		verifierInput.proposals.map(({ challengeId, from, to }) => ({
			challengeId,
			from,
			to
		})),
		[
			{ challengeId: mixedTargetId, from: 'starter', to: 'standard' },
			{ challengeId: exactTargetId, from: 'stretch', to: 'standard' }
		]
	);
	assert.equal(
		validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(verifierInput, {
			basePlan: fixture.plan,
			effectivePlan: result.effectivePlan
		}).status,
		'passed'
	);
	const missingOverride = structuredClone(verifierInput);
	missingOverride.candidateOverrides.pop();
	assert.equal(
		validateScienceChallengeDifficultyPlanAdjustmentVerifierInput(missingOverride, {
			basePlan: fixture.plan,
			effectivePlan: result.effectivePlan
		}).status,
		'failed'
	);
});

test('discovers the exact science-021 terminal adjustment set in frozen row order', () => {
	const fixture = difficultySetFixture();
	const terminal = fixture.attempts.find((attempt) => attempt.attempt === 4).candidate;
	assert.deepEqual(
		deriveScienceChallengeDifficultyPlanAdjustments({
			plan: fixture.plan,
			shardId: fixture.shardId,
			terminalCandidate: terminal
		}),
		fixture.requestedAdjustments
	);
	assert.deepEqual(
		deriveScienceChallengeDifficultyPlanAdjustments({
			plan: fixture.plan,
			shardId: fixture.shardId,
			terminalCandidate: fixture.priorCandidate
		}),
		[]
	);
});

test('science-021 adjustment set rejects stale, duplicate, wrong-target and competing corrections', () => {
	for (const [label, mutate, pattern] of [
		[
			'duplicate',
			(fixture) => {
				fixture.requestedAdjustments[1] = structuredClone(fixture.requestedAdjustments[0]);
			},
			/duplicate|competing/i
		],
		[
			'wrong target',
			(fixture) => {
				fixture.requestedAdjustments[1].challengeId = 'chemistry-wrong-target-01';
			},
			/wrong-shard|target|terminal candidate/i
		],
		[
			'stale value',
			(fixture) => {
				fixture.requestedAdjustments[0].from = 'stretch';
			},
			/frozen plan|terminal candidate|requested/i
		]
	]) {
		const fixture = difficultySetFixture();
		mutate(fixture);
		const result = buildScienceChallengeDifficultyPlanAdjustmentSet(fixture);
		assert.equal(result.status, 'failed', label);
		assert.match(result.issues.join('\n'), pattern, label);
	}

	const fixture = difficultySetFixture();
	const result = buildScienceChallengeDifficultyPlanAdjustmentSet(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	const wrongShardManifest = structuredClone(result.manifest);
	wrongShardManifest.shardId = 'science-022';
	const { manifestCoreSha256: _wrongShardHash, ...wrongShardCore } = wrongShardManifest;
	wrongShardManifest.manifestCoreSha256 = canonicalHash(wrongShardCore);
	assert.equal(
		validateScienceChallengeDifficultyPlanAdjustmentSetManifest({
			manifest: wrongShardManifest,
			plan: fixture.plan,
			priorCandidate: fixture.priorCandidate,
			candidate: result.candidate
		}).status,
		'failed'
	);
	const competing = projectScienceChallengeEffectiveRecoveryPlan(fixture.plan, [
		{
			manifest: result.manifest,
			priorCandidate: fixture.priorCandidate,
			candidate: result.candidate
		},
		{
			manifest: result.manifest,
			priorCandidate: fixture.priorCandidate,
			candidate: result.candidate
		}
	]);
	assert.equal(competing.status, 'failed');
	assert.match(competing.issues.join('\n'), /ambiguous duplicate/i);
});

test('composes difficulty and curriculum recoveries over one base plan and rejects ambiguity', () => {
	const fixture = difficultyFixture();
	const difficulty = buildScienceChallengeDifficultyPlanAdjustment(fixture);
	assert.equal(difficulty.status, 'passed', difficulty.issues.join('\n'));
	const remap = syntheticDescendantRecovery(fixture);
	const projection = projectScienceChallengeEffectiveRecoveryPlan(fixture.plan, [
		{
			manifest: difficulty.manifest,
			priorCandidate: fixture.priorCandidate,
			candidate: difficulty.candidate
		},
		remap
	]);
	assert.equal(projection.status, 'passed', projection.issues.join('\n'));
	assert.equal(projection.effectivePlan.rows[1].difficulty, 'standard');
	assert.equal(projection.effectivePlan.rows[0].curriculumComponentId, 'bio-infection-response');

	const ambiguous = projectScienceChallengeEffectiveRecoveryPlan(fixture.plan, [
		{
			manifest: difficulty.manifest,
			priorCandidate: fixture.priorCandidate,
			candidate: difficulty.candidate
		},
		{
			manifest: difficulty.manifest,
			priorCandidate: fixture.priorCandidate,
			candidate: difficulty.candidate
		}
	]);
	assert.equal(ambiguous.status, 'failed');
	assert.match(ambiguous.issues.join('\n'), /ambiguous duplicate/i);
});

function difficultyFixture() {
	const plan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-test-v1',
		rows: [
			{
				id: acceptedId,
				shard: shardId,
				difficulty: 'standard',
				curriculumComponentId: 'bio-infection',
				curriculumCode: '4.3.1',
				curriculumTitle: 'Infection and response',
				curriculumPageStart: 10,
				curriculumPageEnd: 11,
				specificationId: 'aqa-biology',
				specificationSha256: 'a'.repeat(64)
			},
			{
				id: targetId,
				shard: shardId,
				difficulty: 'stretch'
			}
		]
	};
	const priorCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [
			{
				definition: {
					id: acceptedId,
					title: 'Accepted sibling',
					difficulty: 'standard'
				},
				grounding: { curriculumComponentId: 'bio-infection' }
			},
			{
				definition: {
					id: targetId,
					title: 'Plant defence response challenge',
					difficulty: 'stretch'
				}
			}
		]
	};
	const priorValidation = {
		status: 'passed',
		issues: [],
		candidateSha256: canonicalHash(priorCandidate)
	};
	const reviews = [
		reviewRow(acceptedId),
		{
			...reviewRow(targetId),
			difficultyCalibrated: false,
			accepted: false,
			issues: [difficultyIssue()]
		}
	];
	const assignmentCore = {
		schemaVersion: 'science-challenge-verification-assignment/v2',
		assignmentId: shardId,
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		curriculumEvidenceSha256,
		items: plan.rows.map((row, index) => ({
			planRowIndex: index,
			plan: row,
			candidate: priorCandidate.challenges[index]
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
				taskName: '/root/blind_verifier_alpha',
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
			reviewedAt: '2026-07-23T00:00:00.000Z',
			provenance: {
				orchestrator: 'codex-collaboration',
				taskName: '/root/blind_verifier_alpha',
				forkTurns: 'none',
				dispatchLedgerSha256
			}
		},
		reviews: structuredClone(reviews)
	};
	const firstReviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		curriculumEvidenceSha256,
		dispatchLedgerSha256,
		status: 'failed',
		reviewCount: reviews.length,
		acceptedCount: 1,
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
		reviews
	};
	const attempts = [1, 2, 3, 4].map((attemptNumber) =>
		attempt(attemptNumber, priorCandidate, attemptNumber === 4)
	);
	return {
		plan,
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
		validateBatchCandidate: validationAdapter(),
		validateCollectionCandidate: (candidate, effectivePlan) => {
			const candidateSet = effectivePlan.rows.map((row) =>
				candidate.challenges.find((entry) => entry.definition.id === row.id)
			);
			return {
				status: 'passed',
				issues: [],
				candidateSet,
				candidateCount: candidateSet.length,
				candidateSetSha256: canonicalHash(candidateSet),
				effectivePlanSha256: canonicalHash(effectivePlan)
			};
		}
	};
}

function difficultySetFixture() {
	const plan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-500-v1',
		rows: [
			{
				id: mixedTargetId,
				shard: adjustmentSetShardId,
				difficulty: 'starter'
			},
			{
				id: exactTargetId,
				shard: adjustmentSetShardId,
				difficulty: 'stretch'
			}
		]
	};
	const priorCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [
			{
				definition: {
					id: mixedTargetId,
					title: 'Prior giant covalent transfer',
					difficulty: 'starter'
				}
			},
			{
				definition: {
					id: exactTargetId,
					title: 'Metals as conductors',
					difficulty: 'stretch'
				}
			}
		]
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
	const reviews = [
		{
			...reviewRow(mixedTargetId),
			contextsDistinct: false,
			difficultyCalibrated: false,
			accepted: false,
			issues: [
				{
					field: 'definition.transferPromptLead',
					category: 'distinctness',
					evidence: 'Opening and transfer repeat the same high-melting explanation.',
					repair: 'Use a materially different transfer property.'
				},
				mixedDifficultyIssue
			]
		},
		{
			...reviewRow(exactTargetId),
			difficultyCalibrated: false,
			accepted: false,
			issues: [exactDifficultyIssue]
		}
	];
	const assignmentCore = {
		schemaVersion: 'science-challenge-verification-assignment/v2',
		assignmentId: adjustmentSetShardId,
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		curriculumEvidenceSha256,
		items: plan.rows.map((row, index) => ({
			planRowIndex: index,
			plan: row,
			candidate: priorCandidate.challenges[index]
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
				assignmentId: adjustmentSetShardId,
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
		assignmentId: adjustmentSetShardId,
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
		reviews: structuredClone(reviews)
	};
	const firstReviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		curriculumEvidenceSha256,
		dispatchLedgerSha256,
		status: 'failed',
		reviewCount: reviews.length,
		acceptedCount: 0,
		rejectedCount: 2,
		issues: [],
		assignmentResults: [
			{
				assignmentId: adjustmentSetShardId,
				sha256: canonicalHash(firstReviewResult),
				status: 'passed',
				issues: []
			}
		],
		reviews
	};
	const terminalCandidate = structuredClone(priorCandidate);
	terminalCandidate.challenges[0].definition.title = 'Repaired giant covalent transfer';
	terminalCandidate.challenges[0].definition.difficulty = 'standard';
	terminalCandidate.challenges[1].definition.difficulty = 'standard';
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
				issues: ['Synthetic immutable failed repair attempt.'],
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
	const requestedAdjustments = [
		{
			challengeId: mixedTargetId,
			field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
			from: 'starter',
			to: 'standard'
		},
		{
			challengeId: exactTargetId,
			field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
			from: 'stretch',
			to: 'standard'
		}
	];
	return {
		plan,
		shardId: adjustmentSetShardId,
		repairSha256: canonicalHash(firstReviewSummary),
		curriculumEvidenceSha256,
		objectiveId: 'd'.repeat(64),
		executionId: 'e'.repeat(64),
		requestedAdjustments,
		priorCandidate,
		priorValidation,
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger,
		attempts,
		validateBatchCandidate: validationAdapter(),
		validateCollectionCandidate: (candidate, effectivePlan) => {
			const candidateSet = effectivePlan.rows.map((row) =>
				candidate.challenges.find((entry) => entry.definition.id === row.id)
			);
			return {
				status: 'passed',
				issues: [],
				candidateSet,
				candidateCount: candidateSet.length,
				candidateSetSha256: canonicalHash(candidateSet),
				effectivePlanSha256: canonicalHash(effectivePlan)
			};
		}
	};
}

function difficultyEffectiveCohortManifest(basePlan, effectivePlan, recovery) {
	const recoveries = [
		{
			manifest: recovery.manifest,
			priorCandidate: recovery.priorCandidate,
			candidate: recovery.candidate
		}
	];
	return {
		schemaVersion: 'science-challenge-effective-cohort/v1',
		planId: effectivePlan.planId,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		candidateCount: effectivePlan.rows.length,
		candidateSetSha256: canonicalHash(recovery.candidate.challenges),
		difficultyAdjustmentManifestSetSha256: canonicalHash([recovery.manifest]),
		recoverySetSha256: canonicalHash(recoveries)
	};
}

function syntheticDescendantRecovery(fixture) {
	const baseRow = fixture.plan.rows[0];
	const baseComponent = {
		curriculumComponentId: baseRow.curriculumComponentId,
		curriculumCode: baseRow.curriculumCode,
		curriculumTitle: baseRow.curriculumTitle,
		curriculumPageStart: baseRow.curriculumPageStart,
		curriculumPageEnd: baseRow.curriculumPageEnd,
		specificationId: baseRow.specificationId,
		specificationSha256: baseRow.specificationSha256
	};
	const effectiveComponent = {
		...baseComponent,
		curriculumComponentId: 'bio-infection-response',
		curriculumCode: '4.3.1.1',
		curriculumTitle: 'Communicable diseases'
	};
	const effectivePlan = structuredClone(fixture.plan);
	Object.assign(effectivePlan.rows[0], effectiveComponent);
	const candidate = structuredClone(fixture.priorCandidate);
	candidate.challenges[0].grounding.curriculumComponentId =
		effectiveComponent.curriculumComponentId;
	const priorTarget = fixture.priorCandidate.challenges[0];
	const candidateTarget = candidate.challenges[0];
	const remap = {
		challengeId: acceptedId,
		field: SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
		from: baseComponent.curriculumComponentId,
		to: effectiveComponent.curriculumComponentId
	};
	const inverseRemap = {
		challengeId: acceptedId,
		field: SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
		from: remap.to,
		to: remap.from
	};
	const core = {
		schemaVersion: SCIENCE_CHALLENGE_DESCENDANT_REMAP_SCHEMA,
		disposition: SCIENCE_CHALLENGE_DESCENDANT_REMAP_DISPOSITION,
		shardId,
		challengeId: acceptedId,
		field: SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
		base: {
			planSha256: canonicalHash(fixture.plan),
			planRowIndex: 0,
			planRowSha256: canonicalHash(baseRow),
			component: baseComponent,
			componentSha256: canonicalHash(baseComponent)
		},
		effective: {
			planSha256: canonicalHash(effectivePlan),
			planRowIndex: 0,
			planRowSha256: canonicalHash(effectivePlan.rows[0]),
			component: effectiveComponent,
			componentSha256: canonicalHash(effectiveComponent)
		},
		sourceAttempt: { attempt: 4, status: 'failed' },
		attemptBudget: {
			selectedAttempt: 4,
			maxAttempts: 4,
			exhausted: true,
			attempts: [1, 2, 3, 4].map((attemptNumber) => ({
				attempt: attemptNumber,
				status: 'failed',
				invalidated: false
			}))
		},
		priorCandidateSha256: canonicalHash(fixture.priorCandidate),
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
		manifest: { ...core, manifestCoreSha256: canonicalHash(core) },
		priorCandidate: fixture.priorCandidate,
		candidate
	};
}

function attempt(attemptNumber, priorCandidate, adjusted) {
	const candidate = structuredClone(priorCandidate);
	if (adjusted) candidate.challenges[1].definition.difficulty = 'standard';
	const runSummary = { status: 'passed', attempt: attemptNumber };
	const value = {
		attempt: attemptNumber,
		status: 'failed',
		candidate,
		runSummary,
		sourceValidation: {
			status: 'failed',
			issues: adjusted
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
	return value;
}

function rebindAttempt(value) {
	value.sourceValidation.candidateSha256 = canonicalHash(value.candidate);
	value.sourceValidation.runSummarySha256 = canonicalHash(value.runSummary);
	value.fileBindings.candidateSha256 = canonicalHash(value.candidate);
}

function rebindReview(fixture) {
	fixture.firstReviewResult.reviews = structuredClone(fixture.firstReviewSummary.reviews);
	fixture.firstReviewSummary.reviewCount = fixture.firstReviewSummary.reviews.length;
	fixture.firstReviewSummary.acceptedCount = fixture.firstReviewSummary.reviews.filter(
		(review) => review.accepted
	).length;
	fixture.firstReviewSummary.rejectedCount =
		fixture.firstReviewSummary.reviews.length - fixture.firstReviewSummary.acceptedCount;
	fixture.firstReviewSummary.assignmentResults[0].sha256 = canonicalHash(fixture.firstReviewResult);
	fixture.repairSha256 = canonicalHash(fixture.firstReviewSummary);
}

function validationAdapter({ baseStatus = 'failed', effectiveStatus = 'passed' } = {}) {
	return (candidate, rows, context) => {
		const status =
			context.validationMode === 'base-plan-negative-control'
				? baseStatus
				: context.validationMode === 'effective-row'
					? effectiveStatus
					: 'passed';
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

function difficultyIssue() {
	return {
		field: SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_FIELD,
		category: 'difficulty',
		evidence: 'The planned stretch tier is too high for this otherwise secure task.',
		repair: 'Use standard rather than stretch for this exact challenge.'
	};
}

function reviewRow(id) {
	return {
		id,
		...Object.fromEntries(SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])),
		checkedCalculations: [],
		issues: [],
		accepted: true
	};
}
