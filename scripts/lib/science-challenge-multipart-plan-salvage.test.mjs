import assert from 'node:assert/strict';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	buildScienceChallengeAuthoringParts,
	readScienceChallengeDirectMultipartEvidence
} from './science-challenge-authoring-parts.mjs';
import { runDirectScienceChallengeJsonTurn } from './science-challenge-direct-json-runner.mjs';
import { runDirectScienceChallengeMultipartTurn } from './science-challenge-direct-multipart-runner.mjs';
import {
	inspectScienceChallengeMultipartPlanSalvage,
	inspectScienceChallengeMultipartPlanSalvageSourceSelection,
	readScienceChallengeMultipartPlanSalvage,
	replayScienceChallengeMultipartDifficultyAttempt,
	stageScienceChallengeMultipartPlanSalvage,
	validateScienceChallengeMultipartPlanSalvageAcceptance
} from './science-challenge-multipart-plan-salvage-evidence.mjs';
import {
	SCIENCE_CHALLENGE_MERGED_DIFFICULTY_SALVAGE_PATHWAY,
	salvageScienceChallengeMergedCandidatePlanDifficultyDrift,
	salvageScienceChallengeMultipartPlanDrift
} from './science-challenge-multipart-plan-salvage.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';
import {
	SCIENCE_QUESTION_ART_SCHEMA,
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	canonicalHash,
	challengeBatchOutputSchema,
	normalizeGeneratedChallengeBatch,
	sha256,
	stableStringify,
	validateGeneratedChallenge,
	validateGeneratedChallengeCollection
} from './science-challenge-release.mjs';
import {
	inspectVerificationRepairAttempts,
	recordVerificationRepairCollectionFailure
} from './science-challenge-verification-repair-transaction.mjs';
import {
	scienceChallengeVerificationRepairExecutionIdentity,
	claimVerificationRepairExecutionAttempt,
	initializeVerificationRepairExecutionLedger,
	inspectVerificationRepairExecutionAttempts,
	verificationRepairExecutionLedgerRoot
} from './science-challenge-verification-repair-lineage.mjs';

test('dry-run salvage inspection reports the exact action without writing recovery evidence', async () => {
	const fixture = await exhaustedSalvageFixture();
	try {
		const planned = inspectScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(planned.status, 'passed', planned.issues?.join('\n'));
		assert.equal(planned.action, 'stage-salvage');
		assert.equal(planned.sourceAttempt, 4);
		assert.equal(existsSync(fixture.expectedSalvageDir), false);

		const staged = stageScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(staged.status, 'passed', staged.issues?.join('\n'));
		const reused = inspectScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(reused.status, 'passed', reused.issues?.join('\n'));
		assert.equal(reused.action, 'reuse-staged-salvage');
		assert.equal(reused.proposal.attempt, 4);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

const EXPECTED_ID = 'biology-producing-monoclonal-antibodies-01';
const REAL_TYPO = 'biology-producing-monlonal-antibodies-01';
const DIFFICULTY_ID = 'biology-plant-defence-responses-01';
const SOURCE_HASH = '1'.repeat(64);
const SPECIFICATION_HASH = '2'.repeat(64);

test('salvages the real monoclonal typo and one plan-bound difficulty drift only', async () => {
	const fixture = await failedIdentityFixture();
	try {
		const result = salvageScienceChallengeMultipartPlanDrift(fixture.policyInput);
		assert.equal(result.status, 'passed', result.issues.join('\n'));
		assert.equal(result.corrections.length, 2);
		const idCorrection = result.corrections.find(
			(correction) => correction.kind === 'definition.id'
		);
		assert.deepEqual(
			{
				partId: idCorrection.partId,
				rowIndex: idCorrection.rowIndex,
				from: idCorrection.from,
				to: idCorrection.to,
				editDistance: idCorrection.editDistance
			},
			{
				partId: 'part-01',
				rowIndex: 1,
				from: REAL_TYPO,
				to: EXPECTED_ID,
				editDistance: 2
			}
		);
		const difficultyCorrection = result.corrections.find(
			(correction) => correction.kind === 'definition.difficulty'
		);
		assert.deepEqual(
			{
				partId: difficultyCorrection.partId,
				rowIndex: difficultyCorrection.rowIndex,
				from: difficultyCorrection.from,
				to: difficultyCorrection.to
			},
			{
				partId: 'part-02',
				rowIndex: 1,
				from: 'starter',
				to: 'standard'
			}
		);
		assert.match(result.source.multipartSummarySha256, /^[a-f0-9]{64}$/);
		assert.match(result.source.partOutputsSha256, /^[a-f0-9]{64}$/);
		assert.equal(result.candidateSha256, canonicalHash(result.candidate));

		const sourceCandidate = normalizeGeneratedChallengeBatch({
			schemaVersion: 'science-challenge-batch/v1',
			challenges: fixture.policyInput.multipartEvidence.parts.flatMap(
				(part) => JSON.parse(part.lastMessageBytes.toString('utf8')).challenges
			)
		});
		const restored = structuredClone(result.candidate);
		restored.challenges[0].definition.id = REAL_TYPO;
		restored.challenges[1].definition.difficulty = 'starter';
		assert.deepEqual(restored, sourceCandidate);
		assert.equal(result.candidate.challenges[0].art.opening.id, `${EXPECTED_ID}-opening`);
		assert.equal(
			result.candidate.challenges[0].definition.marks,
			fixture.entries[0].definition.marks
		);
		assert.deepEqual(
			result.candidate.challenges[0].definition.staticAnswers,
			fixture.entries[0].definition.staticAnswers
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('rejects output and usage tampering even when the id still resembles the expected id', async () => {
	const fixture = await failedIdentityFixture();
	try {
		const outputTamper = clonePolicyInput(fixture.policyInput);
		const tamperedBatch = JSON.parse(
			outputTamper.multipartEvidence.parts[0].lastMessageBytes.toString('utf8')
		);
		tamperedBatch.challenges[0].definition.title = 'How is an altered antibody checked?';
		outputTamper.multipartEvidence.parts[0].lastMessageBytes = Buffer.from(
			JSON.stringify(tamperedBatch)
		);
		assertFailed(
			salvageScienceChallengeMultipartPlanDrift(outputTamper),
			/beyond the permitted plan-bound corrections/
		);

		const usageTamper = clonePolicyInput(fixture.policyInput);
		usageTamper.multipartEvidence.parts[0].summary.usage.promptTokens += 1;
		assertFailed(
			salvageScienceChallengeMultipartPlanDrift(usageTamper),
			/beyond the permitted plan-bound corrections/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('rejects distant ids, cross-row ids and more than one correction', async () => {
	for (const options of [
		{ firstObservedId: 'biology-entirely-different-process-01' },
		{ firstObservedId: DIFFICULTY_ID },
		{
			firstObservedId: REAL_TYPO,
			secondObservedId: 'biology-use-of-monoclonal-antibodies-01'
		}
	]) {
		const fixture = await failedIdentityFixture(options);
		try {
			assertFailed(
				salvageScienceChallengeMultipartPlanDrift(fixture.policyInput),
				/near-typo|another position-bound row id|exactly one/
			);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('rejects art and grounding defects rather than laundering them as id repair', async () => {
	for (const options of [
		{ firstArtChallengeId: REAL_TYPO },
		{ firstCurriculumComponentId: 'biology-wrong-curriculum-component' }
	]) {
		const fixture = await failedIdentityFixture(options);
		try {
			assertFailed(
				salvageScienceChallengeMultipartPlanDrift(fixture.policyInput),
				/recovered candidate art\.|recovered candidate grounding\.curriculumComponentId/
			);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('rejects missing or multiple difficulty restorations', async () => {
	for (const options of [
		{ secondObservedDifficulty: 'standard' },
		{ firstObservedDifficulty: 'starter', secondObservedDifficulty: 'stretch' }
	]) {
		const fixture = await failedIdentityFixture(options);
		try {
			assertFailed(
				salvageScienceChallengeMultipartPlanDrift(fixture.policyInput),
				/exactly one position-bound id correction and one difficulty restoration/
			);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('rejects arc, mechanic, answer-position and learner-content drift', async () => {
	for (const [options, pattern] of [
		[{ firstArc: 'complete-the-method' }, /definition\.arc differs from the plan row/],
		[{ firstMechanic: 'first-wrong-step' }, /definition\.mechanic differs from the plan row/],
		[{ firstStrongerAnswer: 'a' }, /stronger-answer position differs from the bound input/],
		[
			{
				firstPreviewQuestion:
					'A diagram shows the antibody-producing cells. Explain which cell should be cloned.'
			},
			/refers to unseen visual evidence/
		]
	]) {
		const fixture = await failedIdentityFixture(options);
		try {
			assertFailed(salvageScienceChallengeMultipartPlanDrift(fixture.policyInput), pattern);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('rejects marks drift in immutable output bytes', async () => {
	const fixture = await failedIdentityFixture();
	try {
		const marksTamper = clonePolicyInput(fixture.policyInput);
		const batch = JSON.parse(
			marksTamper.multipartEvidence.parts[0].lastMessageBytes.toString('utf8')
		);
		batch.challenges[0].definition.marks = 4;
		marksTamper.multipartEvidence.parts[0].lastMessageBytes = Buffer.from(JSON.stringify(batch));
		assertFailed(
			salvageScienceChallengeMultipartPlanDrift(marksTamper),
			/beyond the permitted plan-bound corrections/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('salvages a complete policy-valid candidate whose only failures are plan difficulties', async () => {
	const fixture = await mergedDifficultyFixture();
	try {
		const result = salvageScienceChallengeMergedCandidatePlanDifficultyDrift(fixture.policyInput);
		assert.equal(result.status, 'passed', result.issues.join('\n'));
		assert.equal(result.pathway, SCIENCE_CHALLENGE_MERGED_DIFFICULTY_SALVAGE_PATHWAY);
		assert.deepEqual(
			result.corrections.map(({ kind, absoluteRowIndex, from, to }) => ({
				kind,
				absoluteRowIndex,
				from,
				to
			})),
			[
				{
					kind: 'definition.difficulty',
					absoluteRowIndex: 0,
					from: 'standard',
					to: 'starter'
				},
				{
					kind: 'definition.difficulty',
					absoluteRowIndex: 1,
					from: 'standard',
					to: 'stretch'
				}
			]
		);
		const restored = structuredClone(result.candidate);
		restored.challenges[0].definition.difficulty = 'standard';
		restored.challenges[1].definition.difficulty = 'standard';
		assert.deepEqual(restored, fixture.policyInput.sourceCandidate);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('merged-candidate difficulty salvage rejects any non-difficulty issue or unmanifested drift', async () => {
	const fixture = await mergedDifficultyFixture();
	try {
		for (const issues of [
			[
				...fixture.policyInput.sourceValidation.issues,
				`${EXPECTED_ID}: definition.previewQuestion must be 24-360 characters.`
			],
			[
				fixture.policyInput.sourceValidation.issues[0],
				fixture.policyInput.sourceValidation.issues[0]
			]
		]) {
			const input = clonePolicyInput(fixture.policyInput);
			input.sourceCandidate = structuredClone(fixture.policyInput.sourceCandidate);
			input.sourceValidation = {
				...fixture.policyInput.sourceValidation,
				issues
			};
			assertFailed(
				salvageScienceChallengeMergedCandidatePlanDifficultyDrift(input),
				/bounded non-empty|non-difficulty defect|duplicate/
			);
		}
		const sourceDrift = clonePolicyInput(fixture.policyInput);
		sourceDrift.sourceCandidate = structuredClone(fixture.policyInput.sourceCandidate);
		sourceDrift.sourceCandidate.challenges[0].definition.title = 'Substituted title';
		sourceDrift.sourceValidation = {
			...fixture.policyInput.sourceValidation,
			candidateSha256: canonicalHash(sourceDrift.sourceCandidate)
		};
		assertFailed(
			salvageScienceChallengeMergedCandidatePlanDifficultyDrift(sourceDrift),
			/not bound to the exact multipart output/
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('stages an exhausted plan-drift salvage without mutating or relabelling its failed attempt', async () => {
	const fixture = await exhaustedSalvageFixture();
	try {
		const sourceSummaryBefore = readFileSync(fixture.sourceSummaryPath);
		const sourceValidationBefore = readFileSync(fixture.sourceValidationPath);
		const sourcePartBefore = readFileSync(fixture.sourcePartPath);
		const globalBefore = inspectVerificationRepairExecutionAttempts({
			ledgerRoot: fixture.ledgerRoot,
			identity: fixture.identity,
			shardId: fixture.options.shardId
		});
		const result = stageScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(result.status, 'passed', result.issues.join('\n'));
		assert.match(result.salvageDir, /-multipart-plan-salvage$/);
		assert.doesNotMatch(path.basename(result.salvageDir), /-attempt-\d+$/);
		assert.equal(result.validation.status, 'passed');
		assert.equal(
			result.validation.authoringDisposition,
			'deterministic-multipart-plan-drift-salvage'
		);
		assert.equal(result.validation.sourceAttemptStatus, 'failed');
		assert.equal(result.proposal.attempt, 4);
		assert.deepEqual(readFileSync(fixture.sourceSummaryPath), sourceSummaryBefore);
		assert.deepEqual(readFileSync(fixture.sourceValidationPath), sourceValidationBefore);
		assert.deepEqual(readFileSync(fixture.sourcePartPath), sourcePartBefore);
		assert.equal(JSON.parse(sourceSummaryBefore).status, 'failed');
		assert.equal(JSON.parse(sourceValidationBefore).status, 'failed');
		const globalAfter = inspectVerificationRepairExecutionAttempts({
			ledgerRoot: fixture.ledgerRoot,
			identity: fixture.identity,
			shardId: fixture.options.shardId
		});
		assert.equal(globalAfter.attempts.length, globalBefore.attempts.length);
		assert.equal(globalAfter.nextAttempt, 5);
		assert.equal(globalAfter.exhausted, true);

		const expectedManifest = structuredClone(result.manifest);
		const expectedValidation = structuredClone(result.validation);
		rmSync(result.artifactPaths.manifest);
		rmSync(result.artifactPaths.validation);
		const completedPartial = stageScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(completedPartial.status, 'passed', completedPartial.issues.join('\n'));
		assert.equal(canonicalHash(completedPartial.manifest), canonicalHash(expectedManifest));
		assert.equal(canonicalHash(completedPartial.validation), canonicalHash(expectedValidation));

		const resumed = stageScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(resumed.status, 'passed', resumed.issues.join('\n'));
		assert.equal(canonicalHash(resumed.manifest), canonicalHash(result.manifest));
		assert.equal(canonicalHash(resumed.candidate), canonicalHash(result.candidate));
		assert.equal(canonicalHash(resumed.validation), canonicalHash(result.validation));
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('stages the distinct merged-candidate difficulty pathway after the same exhausted gate', async () => {
	const fixture = await exhaustedSalvageFixture({ sourceKind: 'merged-difficulty' });
	try {
		const sourceCandidatePath = path.join(
			path.dirname(fixture.sourceSummaryPath),
			'candidate.json'
		);
		const sourceCandidateBefore = readFileSync(sourceCandidatePath);
		const result = stageScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(result.status, 'passed', result.issues.join('\n'));
		assert.equal(
			result.validation.salvagePathway,
			SCIENCE_CHALLENGE_MERGED_DIFFICULTY_SALVAGE_PATHWAY
		);
		assert.equal(
			result.manifest.salvage.pathway,
			SCIENCE_CHALLENGE_MERGED_DIFFICULTY_SALVAGE_PATHWAY
		);
		assert.equal(result.lineage.sourceAttempt.status, 'failed');
		assert.equal(result.lineage.sourceAttempt.candidatePath, sourceCandidatePath);
		assert.deepEqual(readFileSync(sourceCandidatePath), sourceCandidateBefore);
		assert.equal(
			inspectVerificationRepairAttempts({
				shardDir: fixture.shardDir,
				repairSha256: fixture.options.repairSha256,
				maxAttempts: 4
			}).attempts.length,
			4
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('composes only terminal failed-merge salvage with the verifier-reviewed difficulty', async () => {
	const fixture = await exhaustedSalvageFixture({
		sourceKind: 'failed-merge-difficulty-composition'
	});
	try {
		const terminal = inspectVerificationRepairAttempts({
			shardDir: fixture.shardDir,
			repairSha256: fixture.options.repairSha256,
			maxAttempts: 4
		}).attempts.at(-1);
		const result = replayScienceChallengeMultipartDifficultyAttempt({
			...fixture.options,
			precondition: { shardDir: fixture.shardDir },
			record: terminal
		});
		assert.equal(result.status, 'passed', result.issues.join('\n'));
		assert.equal(result.attempt.attempt, 4);
		assert.equal(result.attempt.status, 'failed');
		assert.equal(result.attempt.sourceKind, 'helper-approved-multipart-salvage');
		assert.equal(result.attempt.candidate.challenges[1].definition.difficulty, 'standard');
		assert.equal(
			result.attempt.helperSalvage.candidate.challenges[1].definition.difficulty,
			'stretch'
		);
		assert.deepEqual(
			result.attempt.helperSalvage.manifest.salvage.corrections.map(
				(correction) => correction.kind
			),
			['definition.id', 'definition.difficulty']
		);
		assert.equal(result.attempt.helperSalvage.manifest.sourceAttempt.attempt, 4);
		assert.equal(result.attempt.helperSalvage.validation.status, 'source-only');
		assert.equal(result.attempt.helperSalvage.validation.standalonePublishable, false);
		assert.notEqual(result.attempt.rawCandidateSha256, canonicalHash(result.attempt.candidate));
		assert.equal(
			inspectVerificationRepairAttempts({
				shardDir: fixture.shardDir,
				repairSha256: fixture.options.repairSha256,
				maxAttempts: 4
			}).nextAttempt,
			5
		);

		const standalone = stageScienceChallengeMultipartPlanSalvage(fixture.options);
		assertFailed(standalone, /rejected content was returned unchanged/);
		assert.equal(existsSync(fixture.expectedSalvageDir), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('terminal difficulty composition requires explicit transport metadata', async () => {
	const fixture = await exhaustedSalvageFixture({
		sourceKind: 'failed-merge-difficulty-composition'
	});
	try {
		const terminal = inspectVerificationRepairAttempts({
			shardDir: fixture.shardDir,
			repairSha256: fixture.options.repairSha256,
			maxAttempts: 4
		}).attempts.at(-1);
		const sourceValidation = JSON.parse(readFileSync(fixture.sourceValidationPath, 'utf8'));
		delete sourceValidation.responseMode;
		delete sourceValidation.providerSchemaApplied;
		writeFileSync(fixture.sourceValidationPath, `${stableStringify(sourceValidation)}\n`);
		assertFailed(
			replayScienceChallengeMultipartDifficultyAttempt({
				...fixture.options,
				precondition: { shardDir: fixture.shardDir },
				record: terminal
			}),
			/not bound to the exact repair invocation and run/
		);

		const sourceSummary = JSON.parse(
			readFileSync(path.join(terminal.path, 'run-summary.json'), 'utf8')
		);
		sourceValidation.responseMode = sourceSummary.responseMode;
		sourceValidation.providerSchemaApplied = sourceSummary.providerSchemaApplied;
		writeFileSync(fixture.sourceValidationPath, `${stableStringify(sourceValidation)}\n`);
		const replayed = replayScienceChallengeMultipartDifficultyAttempt({
			...fixture.options,
			precondition: { shardDir: fixture.shardDir },
			record: terminal
		});
		assert.equal(replayed.status, 'passed', replayed.issues.join('\n'));
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('refuses salvage before both matching attempt ledgers are exhausted', async () => {
	const fixture = await exhaustedSalvageFixture({ attemptCount: 3 });
	try {
		const result = stageScienceChallengeMultipartPlanSalvage(fixture.options);
		assertFailed(result, /four-attempt ledgers to be exhausted/);
		assert.equal(existsSync(fixture.expectedSalvageDir), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('fails closed on mismatched ledgers, input envelopes and verifier review coverage', async () => {
	const mismatched = await exhaustedSalvageFixture({
		localAttemptCount: 4,
		globalAttemptCount: 3
	});
	try {
		assertFailed(
			stageScienceChallengeMultipartPlanSalvage(mismatched.options),
			/local repair attempts differ from the workspace objective ledger/
		);
	} finally {
		rmSync(mismatched.root, { recursive: true, force: true });
	}
	for (const mutate of [
		(options) => {
			options.inputSha256 = 'f'.repeat(64);
		},
		(options) => {
			options.reviews = options.reviews.slice(0, 1);
		},
		(options) => {
			options.reviews = [...options.reviews, structuredClone(options.reviews[0])];
		},
		(options) => {
			options.reviews = options.reviews.map((review, index) =>
				index === 0 ? { ...review, accepted: 'false' } : review
			);
		}
	]) {
		const fixture = await exhaustedSalvageFixture();
		try {
			const options = { ...fixture.options, reviews: structuredClone(fixture.options.reviews) };
			mutate(options);
			assertFailed(
				stageScienceChallengeMultipartPlanSalvage(options),
				/inputSha256 does not bind|verifier reviews must cover/
			);
			assert.equal(existsSync(fixture.expectedSalvageDir), false);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('requires explicit hash-bound terminal selection when more than one source is eligible', async () => {
	const fixture = await exhaustedSalvageFixture({
		sourceKind: 'merged-difficulty',
		additionalMergedDifficultyAttempt: 3
	});
	try {
		assertFailed(
			stageScienceChallengeMultipartPlanSalvage(fixture.options),
			/explicit terminal-source approval is required/
		);
		const discovery = inspectScienceChallengeMultipartPlanSalvageSourceSelection(fixture.options);
		assert.equal(discovery.status, 'passed', discovery.issues?.join('\n'));
		assert.equal(discovery.requiresApproval, true);
		assert.equal(discovery.eligibleSources.length, 2);
		assert.deepEqual(
			discovery.eligibleSources.map((source) => source.attempt),
			[3, 4]
		);
		assert.notEqual(
			discovery.eligibleSources[0].recoveredCandidateSha256,
			discovery.eligibleSources[1].recoveredCandidateSha256
		);
		assert.equal(discovery.terminalAttemptEligible, true);
		assert.equal(discovery.approvalTemplate.selectedAttempt, 4);
		assert.equal(
			discovery.approvalTemplate.selectedCandidateSha256,
			discovery.eligibleSources.find((source) => source.attempt === 4).recoveredCandidateSha256
		);

		const staleHash = stageScienceChallengeMultipartPlanSalvage({
			...fixture.options,
			sourceSelectionApproval: {
				...discovery.approvalTemplate,
				selectedCandidateSha256: 'f'.repeat(64)
			}
		});
		assertFailed(staleHash, /stale selected candidate hash/);
		const staleEligibleSet = stageScienceChallengeMultipartPlanSalvage({
			...fixture.options,
			sourceSelectionApproval: {
				...discovery.approvalTemplate,
				eligibleSourcesSha256: 'e'.repeat(64)
			}
		});
		assertFailed(staleEligibleSet, /stale eligible-source evidence/);
		const unboundApprovalField = stageScienceChallengeMultipartPlanSalvage({
			...fixture.options,
			sourceSelectionApproval: {
				...discovery.approvalTemplate,
				rationale: 'unbound prose must not influence selection'
			}
		});
		assertFailed(unboundApprovalField, /contains unbound fields/);
		for (const [field, value] of [
			['shardId', 'science-999'],
			['objectiveId', '0'.repeat(64)],
			['executionId', '1'.repeat(64)],
			['decision', 'accept-content-without-fresh-verification']
		]) {
			const wrongBinding = stageScienceChallengeMultipartPlanSalvage({
				...fixture.options,
				sourceSelectionApproval: {
					...discovery.approvalTemplate,
					[field]: value
				}
			});
			assertFailed(
				wrongBinding,
				/another repair execution|does not limit selection to fresh full-cohort verification/
			);
		}

		const nonterminal = stageScienceChallengeMultipartPlanSalvage({
			...fixture.options,
			sourceSelectionApproval: {
				...discovery.approvalTemplate,
				selectedAttempt: 3,
				selectedCandidateSha256: discovery.eligibleSources.find((source) => source.attempt === 3)
					.recoveredCandidateSha256
			}
		});
		assertFailed(nonterminal, /must select the eligible, non-invalidated terminal attempt/);

		const staged = stageScienceChallengeMultipartPlanSalvage({
			...fixture.options,
			sourceSelectionApproval: discovery.approvalTemplate
		});
		assert.equal(staged.status, 'passed', staged.issues?.join('\n'));
		assert.equal(staged.proposal.attempt, 4);
		assert.equal(
			staged.sourceSelection.policy,
			'explicit-terminal-attempt-for-fresh-full-cohort-verification'
		);
		assert.deepEqual(staged.sourceSelection.approval, discovery.approvalTemplate);
		const persistedReuse = inspectScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(persistedReuse.status, 'passed', persistedReuse.issues?.join('\n'));
		assert.equal(persistedReuse.action, 'reuse-staged-salvage');
		assert.deepEqual(persistedReuse.sourceSelection.approval, discovery.approvalTemplate);
		assert.equal(
			inspectVerificationRepairAttempts({
				shardDir: fixture.shardDir,
				repairSha256: fixture.options.repairSha256,
				maxAttempts: 4
			}).attempts.length,
			4
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('terminal source approval cannot be invalidated into an impossible fifth attempt', async () => {
	const fixture = await exhaustedSalvageFixture({
		sourceKind: 'merged-difficulty',
		additionalMergedDifficultyAttempt: 3
	});
	try {
		const discovery = inspectScienceChallengeMultipartPlanSalvageSourceSelection(fixture.options);
		assert.equal(discovery.status, 'passed', discovery.issues?.join('\n'));
		assert.equal(discovery.requiresApproval, true);

		assert.throws(
			() =>
				recordVerificationRepairCollectionFailure({
					outputRoot: fixture.outputRoot,
					repairSha256: fixture.options.repairSha256,
					collectionValidation: {
						status: 'failed',
						issues: ['terminal source became collection-invalid after discovery'],
						repairTargets: [
							{
								shardId: fixture.options.shardId,
								issues: ['terminal source became collection-invalid after discovery']
							}
						]
					},
					proposals: [
						{
							shardId: fixture.options.shardId,
							attempt: 4,
							candidateSha256: discovery.approvalTemplate.selectedCandidateSha256
						}
					]
				}),
			/cannot allocate a fifth attempt/i
		);
		const staged = stageScienceChallengeMultipartPlanSalvage({
			...fixture.options,
			sourceSelectionApproval: discovery.approvalTemplate
		});
		assert.equal(staged.status, 'passed', staged.issues?.join('\n'));
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('refuses exhausted salvage without explicit resume and rejects terminal invalidation', async () => {
	const fixture = await exhaustedSalvageFixture();
	try {
		const result = stageScienceChallengeMultipartPlanSalvage({
			...fixture.options,
			resume: false
		});
		assertFailed(result, /explicit --resume/i);
		assert.equal(existsSync(fixture.expectedSalvageDir), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
	await assert.rejects(
		() => exhaustedSalvageFixture({ invalidateAttempt: 4 }),
		/cannot allocate a fifth attempt/i
	);
});

test('fails closed on source mutation and staged evidence tampering', async () => {
	for (const tamper of [
		'source',
		'source-validation-bytes',
		'repair-summary-bytes',
		'global-claim-bytes',
		'manifest',
		'manifest-bytes',
		'candidate',
		'candidate-bytes',
		'validation-bytes'
	]) {
		const fixture = await exhaustedSalvageFixture();
		try {
			const staged = stageScienceChallengeMultipartPlanSalvage(fixture.options);
			assert.equal(staged.status, 'passed', staged.issues.join('\n'));
			if (tamper === 'source') {
				writeFileSync(fixture.sourcePartPath, `${readFileSync(fixture.sourcePartPath)} `);
			} else if (tamper === 'source-validation-bytes') {
				writeFileSync(
					fixture.sourceValidationPath,
					`${readFileSync(fixture.sourceValidationPath)} `
				);
			} else if (tamper === 'repair-summary-bytes') {
				const repairSummaryPath = path.join(
					fixture.shardDir,
					`verification-repair-${fixture.options.repairSha256.slice(0, 12)}`,
					'verification-summary.json'
				);
				writeFileSync(repairSummaryPath, `${readFileSync(repairSummaryPath)} `);
			} else if (tamper === 'global-claim-bytes') {
				const claimPath = path.join(
					fixture.ledgerRoot,
					'shards',
					fixture.options.shardId,
					'attempt-04',
					'claim.json'
				);
				writeFileSync(claimPath, `${readFileSync(claimPath)} `);
			} else if (tamper === 'manifest') {
				const manifest = JSON.parse(readFileSync(staged.artifactPaths.manifest, 'utf8'));
				manifest.sourceAttempt.attempt = 3;
				writeFileSync(staged.artifactPaths.manifest, `${stableStringify(manifest)}\n`);
			} else if (tamper === 'manifest-bytes') {
				writeFileSync(
					staged.artifactPaths.manifest,
					`${readFileSync(staged.artifactPaths.manifest)} `
				);
			} else {
				if (tamper === 'candidate') {
					const candidate = JSON.parse(readFileSync(staged.artifactPaths.candidate, 'utf8'));
					candidate.challenges[0].definition.marks += 1;
					writeFileSync(staged.artifactPaths.candidate, `${stableStringify(candidate)}\n`);
				} else {
					const target =
						tamper === 'candidate-bytes'
							? staged.artifactPaths.candidate
							: staged.artifactPaths.validation;
					writeFileSync(target, `${readFileSync(target)} `);
				}
			}
			const replay = readScienceChallengeMultipartPlanSalvage(fixture.options);
			assertFailed(
				replay,
				/source attempt|raw output|repair evidence|differ(?:s)? from deterministic replay|helper-approved/i
			);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('does not salvage arbitrary candidate or accepted-row drift', async () => {
	for (const fixtureOptions of [
		{
			validateBatchCandidate: () => ({
				status: 'failed',
				issues: ['current marks, arc, art and collection validation rejected the candidate']
			})
		},
		{ mutateAcceptedPrior: true }
	]) {
		const fixture = await exhaustedSalvageFixture(fixtureOptions);
		try {
			const result = stageScienceChallengeMultipartPlanSalvage(fixture.options);
			assertFailed(result, /current deterministic validation|accepted content changed/i);
			assert.equal(existsSync(fixture.expectedSalvageDir), false);
		} finally {
			rmSync(fixture.root, { recursive: true, force: true });
		}
	}
});

test('passes a clone to current validation so a mutating validator cannot alter staged bytes', async () => {
	const fixture = await exhaustedSalvageFixture({
		validateBatchCandidate: (candidate) => {
			candidate.challenges[0].definition.marks = 99;
			return { status: 'passed', issues: [] };
		}
	});
	try {
		const staged = stageScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(staged.status, 'passed', staged.issues.join('\n'));
		assert.notEqual(staged.candidate.challenges[0].definition.marks, 99);
		assert.equal(staged.proposal.candidateSha256, canonicalHash(staged.candidate));
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('accepted salvage cannot omit, alter or relabel its provenance', async () => {
	const fixture = await exhaustedSalvageFixture();
	try {
		const staged = stageScienceChallengeMultipartPlanSalvage(fixture.options);
		assert.equal(staged.status, 'passed', staged.issues.join('\n'));
		assert.equal(
			validateScienceChallengeMultipartPlanSalvageAcceptance({
				acceptedCandidate: staged.candidate,
				acceptedValidation: staged.validation,
				replayOptions: fixture.options
			}).status,
			'passed'
		);
		for (const [acceptedCandidate, acceptedValidation, pattern] of [
			[
				{ ...staged.candidate, challenges: [] },
				staged.validation,
				/does not bind the accepted candidate/
			],
			[
				staged.candidate,
				{ ...staged.validation, sourceAttemptStatus: 'passed' },
				/relabels its source model attempt/
			],
			[
				staged.candidate,
				{ ...staged.validation, authoringDisposition: null },
				/strips the staged plan-drift salvage disposition/
			]
		]) {
			const result = validateScienceChallengeMultipartPlanSalvageAcceptance({
				acceptedCandidate,
				acceptedValidation,
				replayOptions: fixture.options
			});
			assert.equal(result.status, 'failed');
			assert.match(result.issues.join('\n'), pattern);
		}
		rmSync(staged.artifactPaths.manifest);
		const omitted = validateScienceChallengeMultipartPlanSalvageAcceptance({
			acceptedCandidate: staged.candidate,
			acceptedValidation: staged.validation,
			replayOptions: fixture.options
		});
		assert.equal(omitted.status, 'failed');
		assert.match(omitted.issues.join('\n'), /no complete replayed provenance|missing manifest/);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

async function failedIdentityFixture({
	firstObservedId = REAL_TYPO,
	secondObservedId = DIFFICULTY_ID,
	firstObservedDifficulty = 'standard',
	secondObservedDifficulty = 'starter',
	secondPlanDifficulty = 'standard',
	firstArtChallengeId = EXPECTED_ID,
	firstCurriculumComponentId = 'biology-topic-monoclonal-production',
	firstArc = 'connect-cause-to-effect',
	firstMechanic = 'missing-link',
	firstMarks = 3,
	firstStrongerAnswer = 'b',
	firstPreviewQuestion = 'Explain the biological sequence used in this monoclonal antibody context without skipping the decisive step.',
	inputSha256Factory = null
} = {}) {
	const root = mkdtempSync(path.join(tmpdir(), 'science-plan-salvage-'));
	const attemptDir = path.join(root, 'attempt-01');
	const rows = [
		makePlanRow(EXPECTED_ID, 'biology-topic-monoclonal-production', 'paper-question-001', 0),
		{
			...makePlanRow(DIFFICULTY_ID, 'biology-topic-plant-defence', 'paper-question-002', 1),
			difficulty: secondPlanDifficulty
		}
	];
	const inputs = rows.map((plan, index) => ({
		plan,
		curriculum: {
			componentId: plan.curriculumComponentId,
			specificationId: plan.specificationId,
			specificationSha256: plan.specificationSha256
		},
		calibrationEvidence: {
			id: plan.calibrationQuestionId,
			contentSha256: plan.calibrationQuestionSha256
		},
		shardIndex: index
	}));
	const parts = buildScienceChallengeAuthoringParts({ rows, inputs, partSize: 1 });
	const prompts = parts.map((part) => `Canonical prompt for ${part.partId}: ${part.rowIds[0]}.`);
	const promptedParts = parts.map((part, index) => ({ ...part, prompt: prompts[index] }));
	const entries = [
		makeEntry({
			id: firstObservedId,
			artChallengeId: firstArtChallengeId,
			curriculumComponentId: firstCurriculumComponentId,
			calibrationQuestionId: 'paper-question-001',
			index: 0,
			difficulty: firstObservedDifficulty,
			arc: firstArc,
			mechanic: firstMechanic,
			marks: firstMarks,
			strongerAnswer: firstStrongerAnswer,
			previewQuestion: firstPreviewQuestion
		}),
		makeEntry({
			id: secondObservedId,
			artChallengeId: DIFFICULTY_ID,
			curriculumComponentId: 'biology-topic-plant-defence',
			calibrationQuestionId: 'paper-question-002',
			index: 1,
			difficulty: secondObservedDifficulty
		})
	];
	const orchestrationPrompt = 'Canonical plan-salvage orchestration prompt.';
	const inputSha256 =
		typeof inputSha256Factory === 'function'
			? inputSha256Factory(inputs)
			: canonicalHash({ mode: 'plan-salvage-test', inputs });
	let callIndex = 0;
	try {
		await assert.rejects(
			() =>
				runDirectScienceChallengeMultipartTurn({
					parts: promptedParts,
					partSize: 1,
					attemptDir,
					orchestrationPrompt,
					inputSha256,
					runPartImpl: (options) => {
						const batch = {
							schemaVersion: 'science-challenge-batch/v1',
							challenges: [entries[callIndex]]
						};
						const stream = successfulDirectStream(batch, callIndex);
						callIndex += 1;
						return runDirectScienceChallengeJsonTurn({ ...options, streamJsonImpl: stream });
					}
				}),
			/Direct multipart merge failed/
		);
		const summary = JSON.parse(readFileSync(path.join(attemptDir, 'run-summary.json'), 'utf8'));
		const policyInput = {
			summary,
			eventLogBytes: readFileSync(path.join(attemptDir, 'events.jsonl')),
			lastMessageBytes: readFileSync(path.join(attemptDir, 'last-message.json')),
			promptBytes: Buffer.from(`${orchestrationPrompt}\n`),
			multipartEvidence: readScienceChallengeDirectMultipartEvidence({ attemptDir, summary }),
			expectedResponseJsonSchema: challengeBatchOutputSchema(inputs.length),
			expectedInputs: inputs,
			expectedInputSha256: inputSha256,
			expectedPartPrompts: prompts
		};
		return { root, policyInput, entries };
	} catch (error) {
		rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

async function mergedDifficultyFixture({ inputSha256Factory = null, titleVariant = null } = {}) {
	const root = mkdtempSync(path.join(tmpdir(), 'science-merged-difficulty-salvage-'));
	const attemptDir = path.join(root, 'attempt-01');
	const rows = [
		{
			...makePlanRow(EXPECTED_ID, 'biology-topic-monoclonal-production', 'paper-question-001', 0),
			difficulty: 'starter'
		},
		{
			...makePlanRow(DIFFICULTY_ID, 'biology-topic-plant-defence', 'paper-question-002', 1),
			difficulty: 'stretch'
		}
	];
	const inputs = rows.map((plan, index) => ({
		plan,
		curriculum: {
			componentId: plan.curriculumComponentId,
			specificationId: plan.specificationId,
			specificationSha256: plan.specificationSha256
		},
		calibrationEvidence: {
			id: plan.calibrationQuestionId,
			contentSha256: plan.calibrationQuestionSha256
		},
		shardIndex: index
	}));
	const parts = buildScienceChallengeAuthoringParts({ rows, inputs, partSize: 1 });
	const prompts = parts.map((part) => `Canonical prompt for ${part.partId}: ${part.rowIds[0]}.`);
	const entries = [
		makeEntry({
			id: EXPECTED_ID,
			artChallengeId: EXPECTED_ID,
			curriculumComponentId: 'biology-topic-monoclonal-production',
			calibrationQuestionId: 'paper-question-001',
			index: 0,
			difficulty: 'standard'
		}),
		makeEntry({
			id: DIFFICULTY_ID,
			artChallengeId: DIFFICULTY_ID,
			curriculumComponentId: 'biology-topic-plant-defence',
			calibrationQuestionId: 'paper-question-002',
			index: 1,
			difficulty: 'standard'
		})
	];
	if (titleVariant !== null) {
		entries[0].definition.title = `How is merged difficulty variant ${titleVariant} checked?`;
		entries[0].definition.slug = `merged-difficulty-variant-${titleVariant.toLowerCase()}`;
	}
	const orchestrationPrompt = 'Canonical merged-difficulty orchestration prompt.';
	const inputSha256 =
		typeof inputSha256Factory === 'function'
			? inputSha256Factory(inputs)
			: canonicalHash({ mode: 'merged-difficulty-test', inputs });
	let callIndex = 0;
	try {
		await runDirectScienceChallengeMultipartTurn({
			parts: parts.map((part, index) => ({ ...part, prompt: prompts[index] })),
			partSize: 1,
			attemptDir,
			orchestrationPrompt,
			inputSha256,
			runPartImpl: (options) => {
				const batch = {
					schemaVersion: 'science-challenge-batch/v1',
					challenges: [entries[callIndex]]
				};
				const stream = successfulDirectStream(batch, callIndex);
				callIndex += 1;
				return runDirectScienceChallengeJsonTurn({ ...options, streamJsonImpl: stream });
			}
		});
		const summary = JSON.parse(readFileSync(path.join(attemptDir, 'run-summary.json'), 'utf8'));
		const rawCandidate = JSON.parse(
			readFileSync(path.join(attemptDir, 'last-message.json'), 'utf8')
		);
		const sourceCandidate = normalizeGeneratedChallengeBatch(rawCandidate);
		const sourceValidation = {
			status: 'failed',
			issues: rows.map((row) => `${row.id}: definition.difficulty differs from the plan row.`),
			rawCandidateSha256: canonicalHash(rawCandidate),
			candidateSha256: canonicalHash(sourceCandidate)
		};
		return {
			root,
			policyInput: {
				summary,
				eventLogBytes: readFileSync(path.join(attemptDir, 'events.jsonl')),
				lastMessageBytes: readFileSync(path.join(attemptDir, 'last-message.json')),
				promptBytes: Buffer.from(`${orchestrationPrompt}\n`),
				multipartEvidence: readScienceChallengeDirectMultipartEvidence({
					attemptDir,
					summary
				}),
				expectedResponseJsonSchema: challengeBatchOutputSchema(inputs.length),
				expectedInputs: inputs,
				expectedInputSha256: inputSha256,
				expectedPartPrompts: prompts,
				sourceCandidate,
				sourceValidation
			}
		};
	} catch (error) {
		rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

async function exhaustedSalvageFixture({
	attemptCount = 4,
	localAttemptCount = attemptCount,
	globalAttemptCount = attemptCount,
	validateBatchCandidate = null,
	mutateAcceptedPrior = false,
	invalidateAttempt = null,
	sourceKind = 'failed-merge',
	additionalMergedDifficultyAttempt = null
} = {}) {
	const difficultyComposition = sourceKind === 'failed-merge-difficulty-composition';
	const rejectedPrior = makeEntry({
		id: EXPECTED_ID,
		artChallengeId: EXPECTED_ID,
		curriculumComponentId: 'biology-topic-monoclonal-production',
		calibrationQuestionId: 'paper-question-001',
		index: 0
	});
	if (rejectedPrior && !difficultyComposition) {
		rejectedPrior.definition.title = 'How was the earlier rejected antibody sequence described?';
	}
	const acceptedPrior = makeEntry({
		id: DIFFICULTY_ID,
		artChallengeId: DIFFICULTY_ID,
		curriculumComponentId: 'biology-topic-plant-defence',
		calibrationQuestionId: 'paper-question-002',
		index: 1,
		difficulty: difficultyComposition ? 'stretch' : 'standard'
	});
	if (mutateAcceptedPrior && acceptedPrior) {
		acceptedPrior.definition.hook = 'This accepted row was changed outside the permitted salvage.';
	}
	const priorCandidate = normalizeGeneratedChallengeBatch({
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [rejectedPrior, acceptedPrior]
	});
	const verificationSummary = {
		schemaVersion: 'science-challenge-plan-salvage-review/v1',
		candidateSetSha256: canonicalHash(priorCandidate),
		reviews: difficultyComposition
				? [
						{
							id: EXPECTED_ID,
							accepted: true,
							...Object.fromEntries(
								SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])
							),
							checkedCalculations: [],
							issues: []
						},
						{
							id: DIFFICULTY_ID,
							accepted: false,
							...Object.fromEntries(
								SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])
							),
							difficultyCalibrated: false,
							checkedCalculations: [],
							issues: [
								{
									field: 'definition.difficulty',
									category: 'difficulty',
									evidence: 'The stretch label is too demanding for this direct task.',
									repair: 'Lower the challenge to standard.'
								}
							]
						}
					]
				: [
						{ id: EXPECTED_ID, accepted: false },
						{ id: DIFFICULTY_ID, accepted: sourceKind === 'merged-difficulty' ? false : true }
					]
	};
	const repairSha256 = canonicalHash(verificationSummary);
	const inputSha256Factory = (inputs) =>
		canonicalHash({
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			inputs,
			priorCandidateSha256: canonicalHash(priorCandidate),
			verificationSummarySha256: repairSha256
		});
	const sourceFixture =
		sourceKind === 'merged-difficulty'
			? await mergedDifficultyFixture({ inputSha256Factory })
			: await failedIdentityFixture({
					inputSha256Factory,
					...(difficultyComposition
						? {
								secondObservedDifficulty: 'standard',
								secondPlanDifficulty: 'stretch'
							}
						: {})
				});
	const additionalSourceFixture =
		sourceKind === 'merged-difficulty' && Number.isInteger(additionalMergedDifficultyAttempt)
			? await mergedDifficultyFixture({
					inputSha256Factory,
					titleVariant: 'B'
				})
			: null;
	const root = sourceFixture.root;
	try {
		const shardId = 'science-001';
		const outputRoot = path.join(root, 'generation');
		const shardDir = path.join(outputRoot, 'shards', shardId);
		mkdirSync(shardDir, { recursive: true });
		const repairPrefix = repairSha256.slice(0, 12);
		const sourceAttemptDirectory = `verification-repair-${repairPrefix}-attempt-${String(
			localAttemptCount
		).padStart(2, '0')}`;
		const sourceAttemptDir = path.join(shardDir, sourceAttemptDirectory);
		renameSync(path.join(root, 'attempt-01'), sourceAttemptDir);
		for (let attempt = 1; attempt < localAttemptCount; attempt += 1) {
			mkdirSync(
				path.join(
					shardDir,
					`verification-repair-${repairPrefix}-attempt-${String(attempt).padStart(2, '0')}`
				)
			);
		}
		const sourceSummaryPath = path.join(sourceAttemptDir, 'run-summary.json');
		const sourceSummary = JSON.parse(readFileSync(sourceSummaryPath, 'utf8'));
		const promptPath = path.join(
			shardDir,
			`verification-repair-${repairPrefix}-prompt-attempt-${localAttemptCount}.txt`
		);
		writeFileSync(promptPath, sourceFixture.policyInput.promptBytes);
		const transportError = `Authoring transport failed: ${sourceSummary.error}`;
		const sourceCandidate =
			sourceKind === 'merged-difficulty' ? sourceFixture.policyInput.sourceCandidate : null;
		if (sourceCandidate) {
			writeFileSync(
				path.join(sourceAttemptDir, 'candidate.json'),
				`${stableStringify(sourceCandidate)}\n`
			);
		}
		const sourceValidation = {
			status: 'failed',
			issues:
				sourceKind === 'merged-difficulty'
					? sourceFixture.policyInput.sourceValidation.issues
					: [
							transportError,
							'schemaVersion must be science-challenge-batch/v1.',
							`Batch must contain exactly ${sourceFixture.policyInput.expectedInputs.length} challenges.`
						],
			inputSha256: sourceSummary.inputSha256,
			verificationRepairSha256: repairSha256,
			verificationRepairCohortIssues: [],
			priorCandidateSha256: canonicalHash(priorCandidate),
			rawCandidateSha256:
				sourceKind === 'merged-difficulty'
					? sourceFixture.policyInput.sourceValidation.rawCandidateSha256
					: null,
			candidateSha256: sourceCandidate ? canonicalHash(sourceCandidate) : null,
			normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			promptSha256: sha256(sourceFixture.policyInput.promptBytes),
			runSummarySha256: canonicalHash(sourceSummary),
			transport: sourceSummary.transport,
			transportVersion: sourceSummary.transportVersion,
			responseMode: sourceSummary.responseMode,
			providerSchemaApplied: sourceSummary.providerSchemaApplied,
			provider: sourceSummary.provider,
			model: sourceSummary.model,
			modelVersion: null,
			modelVersions: sourceSummary.modelVersions,
			directPartSize: sourceSummary.partSize,
			thinkingLevel: sourceSummary.thinkingLevel,
			transportError: sourceKind === 'merged-difficulty' ? null : transportError
		};
		const sourceValidationPath = path.join(sourceAttemptDir, 'validation.json');
		writeFileSync(sourceValidationPath, `${stableStringify(sourceValidation)}\n`);
		if (additionalSourceFixture) {
			if (
				additionalMergedDifficultyAttempt < 1 ||
				additionalMergedDifficultyAttempt >= localAttemptCount
			) {
				throw new Error('Additional merged-difficulty attempt must precede the terminal attempt.');
			}
			const additionalAttemptDir = path.join(
				shardDir,
				`verification-repair-${repairPrefix}-attempt-${String(
					additionalMergedDifficultyAttempt
				).padStart(2, '0')}`
			);
			rmSync(additionalAttemptDir, { recursive: true, force: true });
			renameSync(path.join(additionalSourceFixture.root, 'attempt-01'), additionalAttemptDir);
			const additionalSummary = JSON.parse(
				readFileSync(path.join(additionalAttemptDir, 'run-summary.json'), 'utf8')
			);
			const additionalCandidate = additionalSourceFixture.policyInput.sourceCandidate;
			writeFileSync(
				path.join(additionalAttemptDir, 'candidate.json'),
				`${stableStringify(additionalCandidate)}\n`
			);
			writeFileSync(
				path.join(
					shardDir,
					`verification-repair-${repairPrefix}-prompt-attempt-${additionalMergedDifficultyAttempt}.txt`
				),
				additionalSourceFixture.policyInput.promptBytes
			);
			const additionalValidation = {
				status: 'failed',
				issues: additionalSourceFixture.policyInput.sourceValidation.issues,
				inputSha256: additionalSummary.inputSha256,
				verificationRepairSha256: repairSha256,
				verificationRepairCohortIssues: [],
				priorCandidateSha256: canonicalHash(priorCandidate),
				rawCandidateSha256: additionalSourceFixture.policyInput.sourceValidation.rawCandidateSha256,
				candidateSha256: canonicalHash(additionalCandidate),
				normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
				promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
				promptSha256: sha256(additionalSourceFixture.policyInput.promptBytes),
				runSummarySha256: canonicalHash(additionalSummary),
				transport: additionalSummary.transport,
				transportVersion: additionalSummary.transportVersion,
				responseMode: additionalSummary.responseMode,
				providerSchemaApplied: additionalSummary.providerSchemaApplied,
				provider: additionalSummary.provider,
				model: additionalSummary.model,
				modelVersion: null,
				modelVersions: additionalSummary.modelVersions,
				directPartSize: additionalSummary.partSize,
				thinkingLevel: additionalSummary.thinkingLevel,
				transportError: null
			};
			writeFileSync(
				path.join(additionalAttemptDir, 'validation.json'),
				`${stableStringify(additionalValidation)}\n`
			);
			rmSync(additionalSourceFixture.root, { recursive: true, force: true });
		}
		const repairDir = path.join(shardDir, `verification-repair-${repairPrefix}`);
		mkdirSync(repairDir);
		const priorValidation = {
			status: 'passed',
			issues: [],
			candidateSha256: canonicalHash(priorCandidate)
		};
		writeFileSync(
			path.join(repairDir, 'verification-summary.json'),
			`${stableStringify(verificationSummary)}\n`
		);
		writeFileSync(
			path.join(repairDir, 'prior-candidate.json'),
			`${stableStringify(priorCandidate)}\n`
		);
		writeFileSync(
			path.join(repairDir, 'prior-validation.json'),
			`${stableStringify(priorValidation)}\n`
		);
		const planSha256 = '3'.repeat(64);
		const identity = scienceChallengeVerificationRepairExecutionIdentity({
			planSha256,
			verificationSha256: repairSha256,
			priorCandidateSetSha256: verificationSummary.candidateSetSha256,
			model: sourceSummary.model,
			transport: sourceSummary.transport,
			responseMode:
				sourceSummary.responseMode ?? SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON,
			thinkingLevel: sourceSummary.thinkingLevel,
			directPartSize: sourceSummary.partSize
		});
		const ledgerRoot = verificationRepairExecutionLedgerRoot(root, identity.objectiveId);
		initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
		for (let attempt = 1; attempt <= globalAttemptCount; attempt += 1) {
			claimVerificationRepairExecutionAttempt({
				ledgerRoot,
				identity,
				shardId,
				attempt,
				outputRoot
			});
		}
		const rows = sourceFixture.policyInput.expectedInputs.map((input) => input.plan);
		const selectedValidator =
			validateBatchCandidate ??
			((candidate) => {
				const validation = validateFixtureRecoveredCandidate(
					candidate,
					sourceFixture.policyInput.expectedInputs
				);
				return difficultyComposition
					? {
							...validation,
							issues: validation.issues.map((issue) =>
								issue === 'definition.difficulty differs from the plan row.'
									? `${DIFFICULTY_ID}: ${issue}`
									: issue
							)
						}
					: validation;
			});
		if (invalidateAttempt !== null) {
			recordVerificationRepairCollectionFailure({
				outputRoot,
				repairSha256,
				collectionValidation: {
					status: 'failed',
					issues: ['simulated collection collision'],
					repairTargets: [
						{
							shardId,
							issues: ['simulated collection collision']
						}
					]
				},
				proposals: [
					{
						shardId,
						attempt: invalidateAttempt,
						candidateSha256: '4'.repeat(64)
					}
				]
			});
		}
		const options = {
			resume: true,
			shardId,
			shardDir,
			outputRoot,
			workspaceRoot: root,
			repairSha256,
			expectedPlanSha256: planSha256,
			expectedExecutionIdentity: identity,
			inputSha256: sourceSummary.inputSha256,
			inputs: sourceFixture.policyInput.expectedInputs,
			rows,
			priorCandidate,
			priorValidation,
			reviews: verificationSummary.reviews,
			expectedReviewIds: verificationSummary.reviews.map((review) => review.id),
			validateBatchCandidate: selectedValidator,
			reconstructSourceEvidence: () => ({
				expectedPromptBytes: sourceFixture.policyInput.promptBytes,
				expectedPartPrompts: sourceFixture.policyInput.expectedPartPrompts
			})
		};
		return {
			root,
			options,
			identity,
			ledgerRoot,
			outputRoot,
			shardDir,
			sourceSummaryPath,
			sourceValidationPath,
			sourcePartPath: path.join(sourceAttemptDir, sourceSummary.parts[0].rawOutputPath),
			expectedSalvageDir: path.join(
				shardDir,
				`verification-repair-${repairPrefix}-multipart-plan-salvage`
			)
		};
	} catch (error) {
		rmSync(root, { recursive: true, force: true });
		if (additionalSourceFixture) {
			rmSync(additionalSourceFixture.root, { recursive: true, force: true });
		}
		throw error;
	}
}

function validateFixtureRecoveredCandidate(candidate, inputs) {
	const issues = [];
	if (!Array.isArray(candidate?.challenges) || candidate.challenges.length !== inputs.length) {
		return { status: 'failed', issues: ['fixture candidate membership is invalid'] };
	}
	for (const [index, challenge] of candidate.challenges.entries()) {
		const input = inputs[index];
		const result = validateGeneratedChallenge(challenge, {
			planRow: input.plan,
			sourceQuestion: {
				id: input.calibrationEvidence.id,
				contentSha256: input.calibrationEvidence.contentSha256
			},
			curriculum: {
				id: input.curriculum.componentId,
				specificationId: input.curriculum.specificationId,
				specificationSha256: input.curriculum.specificationSha256
			}
		});
		issues.push(...result.issues);
	}
	issues.push(...validateGeneratedChallengeCollection(candidate.challenges).issues);
	return { status: issues.length ? 'failed' : 'passed', issues };
}

function makePlanRow(id, curriculumComponentId, calibrationQuestionId, index) {
	return {
		id,
		subject: 'biology',
		specificationId: 'aqa-gcse-biology-8461-v1-0',
		specificationSha256: SPECIFICATION_HASH,
		curriculumComponentId,
		calibrationQuestionId,
		calibrationQuestionSha256: SOURCE_HASH,
		difficulty: 'standard',
		arc: 'connect-cause-to-effect',
		mechanic: 'missing-link',
		expectedAnswerPositions: {
			strongerAnswer: 'b',
			diagnosisCorrectIndex: 1,
			repairCorrectIndex: 1,
			transferCorrectIndex: 1
		},
		shardIndex: index
	};
}

function makeEntry({
	id,
	artChallengeId,
	curriculumComponentId,
	calibrationQuestionId,
	index,
	difficulty = 'standard',
	arc = 'connect-cause-to-effect',
	mechanic = 'missing-link',
	marks = 3,
	strongerAnswer = 'b',
	previewQuestion = 'Explain the biological sequence used in this monoclonal antibody context without skipping the decisive step.'
}) {
	const noun = index === 0 ? 'production' : 'use';
	return {
		definition: {
			id,
			slug: `monoclonal-antibody-${noun}`,
			subject: 'biology',
			subjectArtTheme: 'regulation-immunity',
			title: `How is monoclonal antibody ${noun} checked?`,
			topic: `Monoclonal antibody ${noun}`,
			hook: 'A precise biological sequence needs every causal step in the correct order.',
			arc,
			mechanic,
			difficulty,
			marks,
			estimatedMinutes: 4,
			previewQuestion,
			questionPresentation: null,
			metaDescription:
				'Practise a calibrated GCSE Biology monoclonal antibody challenge, repair one missing scientific link, and apply the same reasoning again.',
			sourceQuestionId: calibrationQuestionId,
			lastReviewed: '2026-07-21',
			version: 1,
			staticAnswers: {
				a: 'The cells are mixed and an antibody appears without any selection or cloning.',
				b: 'The required cells are selected, cloned and used to produce one specific antibody.'
			},
			strongerAnswer,
			weakAnswer: strongerAnswer === 'b' ? 'a' : 'b',
			weakAnswerKind: 'incomplete',
			showdownExplanation:
				'The stronger answer includes selection and cloning, while the weaker answer omits both controls.',
			commandWordLesson: 'Explain means connect each biological stage to the next result.',
			diagnosisPrompt: 'Which scientific link is missing from the weaker answer?',
			diagnosisChoices: makeChoices('It omits the selection and cloning stage.'),
			repairPrompt: 'Which phrase repairs the weaker answer most precisely?',
			repairChoices: makeChoices('Select the required cell and clone it.'),
			freeTextKeywordGroups: [['select'], ['clone'], ['specific antibody']],
			repairSuccess: 'The repaired answer now includes the selection and cloning stages.',
			transferPromptLead:
				'A laboratory needs many identical cells making one antibody. Which method preserves specificity?',
			transferChoices: makeChoices('Clone one selected antibody-producing cell.'),
			transferExplanation:
				'Cloning one selected antibody-producing cell preserves the required specificity.',
			memoryHandle: 'Select the cell → clone it → collect one specific antibody'
		},
		grounding: {
			curriculumComponentId,
			specificationId: 'aqa-gcse-biology-8461-v1-0',
			specificationSha256: SPECIFICATION_HASH,
			calibrationQuestionId,
			calibrationQuestionSha256: SOURCE_HASH
		},
		art: {
			opening: makeArt(artChallengeId, 'opening', `Monoclonal laboratory setup ${index}`),
			transfer: makeArt(artChallengeId, 'transfer', `Cell culture setup ${index}`)
		}
	};
}

function makeChoices(correctText) {
	return [
		{
			id: 'wrong-before',
			text: 'Use every available cell without selection.',
			feedback: 'This does not preserve antibody specificity.',
			correct: false
		},
		{
			id: 'correct-link',
			text: correctText,
			feedback: 'This supplies the decisive scientific link.',
			correct: true
		},
		{
			id: 'wrong-after',
			text: 'Mix the final antibodies until they become identical.',
			feedback: 'Mixing antibodies does not make them monoclonal.',
			correct: false
		}
	];
}

function makeArt(challengeId, context, scene) {
	return {
		schemaVersion: SCIENCE_QUESTION_ART_SCHEMA,
		id: `${challengeId}-${context}`,
		context,
		scene,
		visualAnchor: `${scene} with one central sealed culture vessel`,
		altText: `${scene} arranged as a text-free laboratory still life.`,
		approvedMeaning: 'The laboratory setting is visible without revealing the correct sequence.',
		accuracyConstraints: ['Show intact laboratory equipment.', 'Keep all culture vessels sealed.'],
		forbiddenDetails: ['Do not show the final answer.', 'Do not add labels or equations.']
	};
}

function successfulDirectStream(batch, partIndex) {
	const rawText = JSON.stringify(batch);
	const thoughts = `Checked immutable identity evidence for part ${partIndex + 1}.`;
	const modelVersion = `chatgpt-gpt-5.6-sol-test-part-${partIndex + 1}`;
	const usage = {
		promptTokens: 20 + partIndex,
		responseTokens: 10,
		thinkingTokens: 5,
		totalTokens: 35 + partIndex
	};
	return () => ({
		events: {
			async *[Symbol.asyncIterator]() {
				yield { type: 'delta', channel: 'thought', text: thoughts };
				yield { type: 'delta', channel: 'response', text: rawText };
				yield { type: 'model', modelVersion };
				yield { type: 'usage', usage, costUsd: 0.001, modelVersion };
				yield { type: 'json', stage: 'final', value: batch };
			}
		},
		result: Promise.resolve({
			value: batch,
			rawText,
			result: {
				provider: 'chatgpt',
				model: 'chatgpt-gpt-5.6-sol',
				modelVersion,
				text: rawText,
				thoughts,
				blocked: false,
				usage,
				costUsd: 0.001
			}
		}),
		abort() {}
	});
}

function clonePolicyInput(input) {
	return {
		...input,
		summary: structuredClone(input.summary),
		multipartEvidence: {
			parts: input.multipartEvidence.parts.map((part) => ({
				...part,
				record: structuredClone(part.record),
				summary: structuredClone(part.summary),
				promptBytes: Buffer.from(part.promptBytes),
				requestBytes: Buffer.from(part.requestBytes),
				eventLogBytes: Buffer.from(part.eventLogBytes),
				lastMessageBytes: Buffer.from(part.lastMessageBytes),
				thoughtsBytes: Buffer.from(part.thoughtsBytes),
				resultMetadataBytes: Buffer.from(part.resultMetadataBytes)
			}))
		}
	};
}

function assertFailed(result, pattern) {
	assert.equal(result.status, 'failed');
	assert.equal(result.candidate, null);
	assert.match(result.issues.join('\n'), pattern);
}
