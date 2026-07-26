import assert from 'node:assert/strict';
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	canonicalHash,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';
import {
	discoverScienceChallengeEffectiveCohortManifest,
	readScienceChallengeEffectiveCohort,
	scienceChallengeEffectiveCohortAttemptBudgetByShard,
	scienceChallengeEffectiveCohortManifestPath,
	stageScienceChallengeEffectiveCohort,
	stageScienceChallengeEffectiveCohortSuccessor
} from './science-challenge-effective-cohort.mjs';
import { validateScienceChallengeEffectiveReleaseGate } from './science-challenge-effective-release-gate.mjs';

test('keeps generator, prepare, materializer and archive on one exact 51/408 cohort through source cleanup', () => {
	const fixture = buildCohortFixture();
	const rootSnapshots = fixture.rootFiles.map((filePath) => ({
		filePath,
		sha256: sha256(readFileSync(filePath))
	}));
	const staged = stageScienceChallengeEffectiveCohort(fixture.options);
	assert.equal(staged.status, 'passed', staged.issues.join('\n'));
	assert.equal(staged.manifest.shardCount, 51);
	assert.equal(staged.manifest.candidateCount, 408);
	assert.equal(staged.manifest.shards[0].disposition, 'descendant-remap');
	assert.equal(staged.manifest.shards.at(-1).disposition, 'unchanged-verified-fallback');
	assert.equal(
		staged.manifest.shards.filter((shard) => shard.disposition === 'ordinary-repair-proposal')
			.length,
		49
	);
	for (const snapshot of rootSnapshots) {
		assert.equal(sha256(readFileSync(snapshot.filePath)), snapshot.sha256);
	}
	assert.equal(
		staged.candidateSet.filter((entry) => entry.definition.cohortVersion === 'ordinary-staged')
			.length,
		49 * 8
	);
	assert.equal(
		staged.candidateSet.find((entry) => entry.definition.id === 'science-row-001').grounding
			.curriculumComponentId,
		fixture.leafId
	);
	const prepareReplay = readScienceChallengeEffectiveCohort({
		...fixture.expected,
		manifestPath: scienceChallengeEffectiveCohortManifestPath(fixture.options),
		referenceRoot: fixture.outputRoot,
		validateCollectionCandidate: fixture.options.validateCollectionCandidate
	});
	assert.equal(prepareReplay.status, 'passed', prepareReplay.issues.join('\n'));
	const verifierInputSha256 = hash('rich verifier input');
	const curriculumRemapDurableReceipt = durableReceiptForCohort({
		cohort: staged,
		verifierInputSha256
	});
	const contentVerification = acceptedContentVerification({
		fixture,
		cohort: staged,
		curriculumRemapDurableReceipt
	});
	const materializerGate = validateScienceChallengeEffectiveReleaseGate({
		effectiveCohort: prepareReplay,
		basePlan: fixture.options.basePlan,
		effectivePlan: fixture.options.effectivePlan,
		contentVerification,
		curriculumRemapVerifierInputSha256: verifierInputSha256
	});
	assert.equal(materializerGate.status, 'passed', materializerGate.issues.join('\n'));
	assert.equal(materializerGate.candidateSetSha256, staged.candidateSetSha256);
	const incompleteReview = structuredClone(contentVerification);
	incompleteReview.reviews.pop();
	assert.equal(
		validateScienceChallengeEffectiveReleaseGate({
			effectiveCohort: prepareReplay,
			basePlan: fixture.options.basePlan,
			effectivePlan: fixture.options.effectivePlan,
			contentVerification: incompleteReview,
			curriculumRemapVerifierInputSha256: verifierInputSha256
		}).status,
		'failed'
	);
	const falseReceiptReview = structuredClone(contentVerification);
	const falseReceipt = falseReceiptReview.curriculumRemapDurableReceipt;
	falseReceipt.remaps[0].decision.accepted = false;
	falseReceipt.remaps[0].decisionSha256 = canonicalHash(falseReceipt.remaps[0].decision);
	falseReceipt.decisionSetSha256 = canonicalHash(
		falseReceipt.remaps.map((remap) => remap.decision)
	);
	const falseReceiptCore = structuredClone(falseReceipt);
	delete falseReceiptCore.receiptSha256;
	falseReceipt.receiptSha256 = canonicalHash(falseReceiptCore);
	falseReceiptReview.curriculumRemapDurableReceiptSha256 = canonicalHash(falseReceipt);
	assert.equal(
		validateScienceChallengeEffectiveReleaseGate({
			effectiveCohort: prepareReplay,
			basePlan: fixture.options.basePlan,
			effectivePlan: fixture.options.effectivePlan,
			contentVerification: falseReceiptReview,
			curriculumRemapVerifierInputSha256: verifierInputSha256
		}).status,
		'failed'
	);

	const archiveRoot = path.join(fixture.root, 'durable-copy');
	cpSync(fixture.outputRoot, archiveRoot, { recursive: true });
	rmSync(fixture.outputRoot, { recursive: true, force: true });
	const replay = readScienceChallengeEffectiveCohort({
		...fixture.expected,
		manifestPath: path.join(
			archiveRoot,
			path.relative(
				fixture.outputRoot,
				scienceChallengeEffectiveCohortManifestPath(fixture.options)
			)
		),
		referenceRoot: archiveRoot,
		validateCollectionCandidate: fixture.options.validateCollectionCandidate
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	assert.equal(replay.candidateSetSha256, staged.candidateSetSha256);
	assert.equal(replay.candidateSetSha256, prepareReplay.candidateSetSha256);
	assert.equal(replay.candidateSetSha256, materializerGate.candidateSetSha256);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('freezes one exact 51/408 cohort with curriculum and difficulty recovery semantics kept distinct', () => {
	const fixture = buildCohortFixture({ withDifficultyAdjustment: true });
	const staged = stageScienceChallengeEffectiveCohort(fixture.options);
	assert.equal(staged.status, 'passed', staged.issues.join('\n'));
	assert.equal(staged.manifest.shardCount, 51);
	assert.equal(staged.manifest.candidateCount, 408);
	assert.equal(staged.manifest.remapCount, 1);
	assert.equal(staged.manifest.difficultyAdjustmentCount, 1);
	assert.equal(staged.remapManifests.length, 1);
	assert.equal(staged.difficultyAdjustmentManifests.length, 1);
	assert.equal(
		staged.manifest.shards.filter((shard) => shard.disposition === 'descendant-remap').length,
		1
	);
	assert.equal(
		staged.manifest.shards.filter((shard) => shard.disposition === 'difficulty-plan-adjustment')
			.length,
		1
	);
	assert.equal(staged.effectivePlan.rows[0].curriculumComponentId, fixture.leafId);
	assert.equal(staged.effectivePlan.rows[8].difficulty, 'standard');
	assert.equal(staged.candidateSet[8].definition.difficulty, 'standard');
	const replay = readScienceChallengeEffectiveCohort({
		...fixture.expected,
		manifestPath: scienceChallengeEffectiveCohortManifestPath(fixture.options),
		referenceRoot: fixture.outputRoot,
		validateCollectionCandidate: fixture.options.validateCollectionCandidate
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('atomically composes the two science-021 corrections with the science-044 descendant remap in one 51/408 cohort', () => {
	const fixture = buildCohortFixture({ withDifficultyAdjustmentSet: true });
	const staged = stageScienceChallengeEffectiveCohort(fixture.options);
	assert.equal(staged.status, 'passed', staged.issues.join('\n'));
	assert.equal(staged.manifest.shardCount, 51);
	assert.equal(staged.manifest.challengeCount, 408);
	assert.equal(staged.manifest.candidateCount, 408);
	assert.equal(staged.manifest.remapCount, 1);
	assert.equal(staged.manifest.difficultyAdjustmentManifestCount, 1);
	assert.equal(staged.manifest.difficultyAdjustmentCount, 2);
	assert.equal(staged.manifest.recoveryCount, 3);
	assert.equal(staged.recoveries.length, 2);
	assert.equal(staged.manifest.recoverySetSha256, canonicalHash(staged.recoveries));
	assert.equal(staged.difficultyAdjustmentManifests.length, 1);
	assert.equal(staged.difficultyAdjustmentManifests[0].adjustmentCount, 2);
	assert.deepEqual(
		staged.difficultyAdjustmentManifests[0].adjustments.map(({ challengeId, field, from, to }) => ({
			challengeId,
			field,
			from,
			to
		})),
		[
			{
				challengeId: 'science-row-009',
				field: 'definition.difficulty',
				from: 'starter',
				to: 'standard'
			},
			{
				challengeId: 'science-row-010',
				field: 'definition.difficulty',
				from: 'stretch',
				to: 'standard'
			}
		]
	);
	assert.equal(staged.effectivePlan.rows[0].curriculumComponentId, fixture.leafId);
	assert.equal(staged.effectivePlan.rows[8].difficulty, 'standard');
	assert.equal(staged.effectivePlan.rows[9].difficulty, 'standard');
	assert.equal(staged.candidateSet[8].definition.difficulty, 'standard');
	assert.equal(staged.candidateSet[9].definition.difficulty, 'standard');
	assert.equal(staged.candidateSet[8].definition.contentRevision, 'terminal-reviewed');
	assert.equal(
		staged.candidateSetSha256,
		canonicalHash(staged.candidateSet),
		'candidate set remains the exact selected terminal bytes'
	);
	const replay = readScienceChallengeEffectiveCohort({
		...fixture.expected,
		manifestPath: scienceChallengeEffectiveCohortManifestPath(fixture.options),
		referenceRoot: fixture.outputRoot,
		validateCollectionCandidate: fixture.options.validateCollectionCandidate
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	assert.equal(replay.candidateSetSha256, staged.candidateSetSha256);
	assert.deepEqual(replay.recoveries, staged.recoveries);

	const manifestPath = scienceChallengeEffectiveCohortManifestPath(fixture.options);
	const reboundManifest = readJson(manifestPath);
	reboundManifest.recoverySetSha256 = hash('different recovery wrappers');
	const reboundCore = structuredClone(reboundManifest);
	delete reboundCore.manifestCoreSha256;
	reboundManifest.manifestCoreSha256 = canonicalHash(reboundCore);
	writeJson(manifestPath, reboundManifest);
	const reboundReplay = readScienceChallengeEffectiveCohort({
		...fixture.expected,
		manifestPath,
		referenceRoot: fixture.outputRoot,
		validateCollectionCandidate: fixture.options.validateCollectionCandidate
	});
	assert.equal(reboundReplay.status, 'failed');
	assert.match(reboundReplay.issues.join('\n'), /exact combined typed recovery projection/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects incomplete, competing and stale effective-cohort selections', () => {
	const undersized = buildCohortFixture();
	undersized.options.basePlan = {
		...undersized.options.basePlan,
		rows: undersized.options.basePlan.rows.slice(0, 400)
	};
	undersized.options.effectivePlan = {
		...undersized.options.effectivePlan,
		rows: undersized.options.effectivePlan.rows.slice(0, 400)
	};
	undersized.options.shardSelections = undersized.options.shardSelections.slice(0, 50);
	assert.throws(
		() => stageScienceChallengeEffectiveCohort(undersized.options),
		/exactly 51 shards and 408 challenges/
	);
	rmSync(undersized.root, { recursive: true, force: true });

	const reboundRemap = buildCohortFixture();
	const remapSelection = reboundRemap.options.shardSelections[0];
	const remapManifest = readJson(remapSelection.remapManifestPath);
	remapManifest.repairSha256 = hash('coherent but stale repair');
	remapManifest.firstReview.summarySha256 = remapManifest.repairSha256;
	const reboundCore = structuredClone(remapManifest);
	delete reboundCore.manifestCoreSha256;
	remapManifest.manifestCoreSha256 = canonicalHash(reboundCore);
	writeJson(remapSelection.remapManifestPath, remapManifest);
	assert.throws(
		() => stageScienceChallengeEffectiveCohort(reboundRemap.options),
		/must bind the effective cohort repair, first review/
	);
	rmSync(reboundRemap.root, { recursive: true, force: true });

	const reboundOrdinary = buildCohortFixture();
	const ordinarySelection = reboundOrdinary.options.shardSelections.find(
		(selection) => selection.disposition === 'ordinary-repair-proposal'
	);
	ordinarySelection.proposal.candidateSha256 = hash('another ordinary candidate');
	assert.throws(
		() => stageScienceChallengeEffectiveCohort(reboundOrdinary.options),
		/ordinary proposal lineage does not bind the selected candidate and validation/
	);
	rmSync(reboundOrdinary.root, { recursive: true, force: true });

	const reboundFallback = buildCohortFixture();
	const fallbackSelection = reboundFallback.options.shardSelections.find(
		(selection) => selection.disposition === 'unchanged-verified-fallback'
	);
	fallbackSelection.firstReviewValidationSha256 = hash('another fallback validation');
	assert.throws(
		() => stageScienceChallengeEffectiveCohort(reboundFallback.options),
		/fallback is not bound to the first review/
	);
	rmSync(reboundFallback.root, { recursive: true, force: true });

	const missing = buildCohortFixture();
	assert.throws(
		() =>
			stageScienceChallengeEffectiveCohort({
				...missing.options,
				shardSelections: missing.options.shardSelections.slice(1)
			}),
		/exactly one selection for every shard/
	);
	rmSync(missing.root, { recursive: true, force: true });

	const competing = buildCohortFixture();
	competing.options.shardSelections[1].competingLineage = true;
	assert.throws(
		() => stageScienceChallengeEffectiveCohort(competing.options),
		/competing recovery lineage/
	);
	rmSync(competing.root, { recursive: true, force: true });

	const stale = buildCohortFixture();
	const candidatePath = stale.options.shardSelections[1].candidatePath;
	const candidate = readJson(candidatePath);
	candidate.challenges[0].definition.cohortVersion = 'tampered';
	writeJson(candidatePath, candidate);
	assert.throws(
		() => stageScienceChallengeEffectiveCohort(stale.options),
		/differs from its binding/
	);
	rmSync(stale.root, { recursive: true, force: true });
});

test('existing effective-cohort reuse fails closed on changed execution, evidence or selected candidate', () => {
	for (const [label, mutate] of [
		[
			'execution',
			(fixture) => {
				fixture.options.executionId = hash('another execution');
			}
		],
		[
			'evidence',
			(fixture) => {
				fixture.options.sourceSnapshotSha256 = hash('another source snapshot');
			}
		],
		[
			'candidate',
			(fixture) => {
				const selection = fixture.options.shardSelections.find(
					(candidate) => candidate.disposition === 'ordinary-repair-proposal'
				);
				const candidate = readJson(selection.candidatePath);
				candidate.challenges[0].definition.revision = 'v2';
				const alternativeRoot = path.join(
					fixture.outputRoot,
					'alternative-selection',
					selection.shardId
				);
				const candidatePath = path.join(alternativeRoot, 'candidate.json');
				const validation = passedValidation(candidate);
				const validationPath = path.join(alternativeRoot, 'validation.json');
				writeJson(candidatePath, candidate);
				writeJson(validationPath, validation);
				selection.candidatePath = candidatePath;
				selection.validationPath = validationPath;
				selection.candidateSha256 = canonicalHash(candidate);
				selection.validationSha256 = canonicalHash(validation);
				selection.proposal = {
					...selection.proposal,
					candidatePath,
					validationPath,
					candidateSha256: canonicalHash(candidate),
					validationSha256: canonicalHash(validation)
				};
			}
		]
	]) {
		const fixture = buildCohortFixture();
		const first = stageScienceChallengeEffectiveCohort(fixture.options);
		assert.equal(first.status, 'passed', `${label}: ${first.issues.join('\n')}`);
		mutate(fixture);
		const replay = stageScienceChallengeEffectiveCohort(fixture.options);
		assert.equal(replay.status, 'failed', label);
		assert.match(
			replay.issues.join('\n'),
			/effective-cohort|expected evidence|freshly prepared exact cohort/i,
			label
		);
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('stages and relocatably replays one immutable successor after a complete failed fresh review', () => {
	const fixture = buildCohortFixture();
	const predecessor = stageScienceChallengeEffectiveCohort(fixture.options);
	assert.equal(predecessor.status, 'passed', predecessor.issues.join('\n'));
	const rejectedRow = fixture.options.effectivePlan.rows[0];
	const reviews = fixture.options.effectivePlan.rows.map((row) => {
		const review = fullReviewRow(row.id);
		if (row.id === rejectedRow.id) {
			review.precisionAndSpecificity = false;
			review.accepted = false;
			review.issues = [
				{
					field: 'definition.prompt',
					category: 'precision',
					evidence: 'The prompt leaves the required comparison ambiguous.',
					repair: 'Name the exact comparison without changing any accepted sibling.'
				}
			];
		}
		return review;
	});
	const reviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planId: fixture.options.effectivePlan.planId,
		planSha256: canonicalHash(fixture.options.effectivePlan),
		basePlanSha256: canonicalHash(fixture.options.basePlan),
		effectivePlanSha256: canonicalHash(fixture.options.effectivePlan),
		sourceSnapshotSha256: fixture.expected.expectedSourceSnapshotSha256,
		curriculumEvidenceSha256: fixture.expected.expectedCurriculumEvidenceSha256,
		candidateSetSha256: predecessor.candidateSetSha256,
		recoverySetSha256: predecessor.manifest.recoverySetSha256,
		assignmentCount: 51,
		reviewCount: 408,
		acceptedCount: 407,
		rejectedCount: 1,
		assignmentResults: predecessor.manifest.shards.map(({ shardId: assignmentId }) => ({
			assignmentId,
			status: 'passed'
		})),
		reviews,
		issues: []
	};
	const repairSha256 = canonicalHash(reviewSummary);
	const shardId = rejectedRow.shard;
	const priorCandidate = predecessor.candidateBatches.get(shardId);
	const candidate = structuredClone(priorCandidate);
	candidate.challenges[0].definition.repairCycle = 'fresh-review-objective-2';
	const validation = passedValidation(candidate);
	const proposalRoot = path.join(
		fixture.outputRoot,
		'shards',
		shardId,
		`verification-repair-${repairSha256.slice(0, 12)}-attempt-01`
	);
	const candidatePath = path.join(proposalRoot, 'candidate.json');
	const validationPath = path.join(proposalRoot, 'validation.json');
	writeJson(candidatePath, candidate);
	writeJson(validationPath, validation);
	const proposal = {
		shardId,
		attempt: 1,
		candidatePath,
		validationPath,
		candidateSha256: canonicalHash(candidate),
		validationSha256: canonicalHash(validation)
	};
	assert.throws(
		() =>
			stageScienceChallengeEffectiveCohortSuccessor({
				workspaceRoot: fixture.root,
				outputRoot: fixture.outputRoot,
				repairSha256: hash('wrong fresh review hash'),
				objectiveId: hash('fresh review objective 2'),
				executionId: hash('fresh review execution 2'),
				reviewSummary,
				reviewEffectiveCohortManifestSha256: canonicalHash(predecessor.manifest),
				predecessor,
				proposals: [proposal],
				validateCollectionCandidate: fixture.options.validateCollectionCandidate
			}),
		/review hash differs/
	);
	const changedAcceptedCandidate = structuredClone(candidate);
	changedAcceptedCandidate.challenges[1].definition.repairCycle =
		'illegally changed accepted sibling';
	const changedAcceptedValidation = passedValidation(changedAcceptedCandidate);
	const changedAcceptedRoot = path.join(fixture.outputRoot, 'changed-accepted-proposal');
	const changedAcceptedCandidatePath = path.join(changedAcceptedRoot, 'candidate.json');
	const changedAcceptedValidationPath = path.join(changedAcceptedRoot, 'validation.json');
	writeJson(changedAcceptedCandidatePath, changedAcceptedCandidate);
	writeJson(changedAcceptedValidationPath, changedAcceptedValidation);
	assert.throws(
		() =>
			stageScienceChallengeEffectiveCohortSuccessor({
				workspaceRoot: fixture.root,
				outputRoot: fixture.outputRoot,
				repairSha256,
				objectiveId: hash('fresh review objective 2'),
				executionId: hash('fresh review execution 2'),
				reviewSummary,
				reviewEffectiveCohortManifestSha256: canonicalHash(predecessor.manifest),
				predecessor,
				proposals: [
					{
						...proposal,
						candidatePath: changedAcceptedCandidatePath,
						validationPath: changedAcceptedValidationPath,
						candidateSha256: canonicalHash(changedAcceptedCandidate),
						validationSha256: canonicalHash(changedAcceptedValidation)
					}
				],
				validateCollectionCandidate: fixture.options.validateCollectionCandidate
			}),
		/stale or changed accepted rows/
	);
	const predecessorBytes = readFileSync(predecessor.manifestPath);
	const tamperedPredecessor = JSON.parse(predecessorBytes.toString('utf8'));
	tamperedPredecessor.executionId = hash('tampered predecessor execution');
	const tamperedPredecessorCore = structuredClone(tamperedPredecessor);
	delete tamperedPredecessorCore.manifestCoreSha256;
	tamperedPredecessor.manifestCoreSha256 = canonicalHash(tamperedPredecessorCore);
	writeJson(predecessor.manifestPath, tamperedPredecessor);
	assert.throws(
		() =>
			stageScienceChallengeEffectiveCohortSuccessor({
				workspaceRoot: fixture.root,
				outputRoot: fixture.outputRoot,
				repairSha256,
				objectiveId: hash('fresh review objective 2'),
				executionId: hash('fresh review execution 2'),
				reviewSummary,
				reviewEffectiveCohortManifestSha256: canonicalHash(predecessor.manifest),
				predecessor,
				proposals: [proposal],
				validateCollectionCandidate: fixture.options.validateCollectionCandidate
			}),
		/tampered after its authenticated replay/
	);
	writeFileSync(predecessor.manifestPath, predecessorBytes);
	const successor = stageScienceChallengeEffectiveCohortSuccessor({
		workspaceRoot: fixture.root,
		outputRoot: fixture.outputRoot,
		repairSha256,
		objectiveId: hash('fresh review objective 2'),
		executionId: hash('fresh review execution 2'),
		reviewSummary,
		reviewEffectiveCohortManifestSha256: canonicalHash(predecessor.manifest),
		predecessor,
		proposals: [proposal],
		validateCollectionCandidate: fixture.options.validateCollectionCandidate
	});
	assert.equal(successor.status, 'passed', successor.issues.join('\n'));
	assert.equal(
		realpathSync(discoverScienceChallengeEffectiveCohortManifest(fixture.outputRoot)),
		realpathSync(successor.manifestPath)
	);
	assert.equal(
		successor.manifest.predecessor.manifestCanonicalSha256,
		canonicalHash(predecessor.manifest)
	);
	assert.equal(
		successor.manifest.attemptBudget.shards.find((row) => row.shardId === shardId)
			.predecessorObjectiveAttempts,
		3,
		'the predecessor objective budget remains visible'
	);
	assert.equal(
		scienceChallengeEffectiveCohortAttemptBudgetByShard(successor).get(shardId),
		1,
		'the fresh hash-bound review owns a new immutable attempt-1 budget'
	);
	const terminalVerifierInputSha256 = hash('fresh terminal verifier input');
	const terminalDurableReceipt = durableReceiptForCohort({
		cohort: successor,
		verifierInputSha256: terminalVerifierInputSha256
	});
	const terminalContentVerification = acceptedContentVerification({
		fixture,
		cohort: successor,
		curriculumRemapDurableReceipt: terminalDurableReceipt
	});
	const terminalReleaseGate = validateScienceChallengeEffectiveReleaseGate({
		effectiveCohort: successor,
		basePlan: fixture.options.basePlan,
		effectivePlan: fixture.options.effectivePlan,
		contentVerification: terminalContentVerification,
		curriculumRemapVerifierInputSha256: terminalVerifierInputSha256
	});
	assert.equal(terminalReleaseGate.status, 'passed', terminalReleaseGate.issues.join('\n'));
	assert.equal(terminalReleaseGate.candidateSetSha256, successor.candidateSetSha256);
	for (const row of fixture.options.effectivePlan.rows.slice(1)) {
		const before = predecessor.candidateSet.find((entry) => entry.definition.id === row.id);
		const after = successor.candidateSet.find((entry) => entry.definition.id === row.id);
		assert.equal(canonicalHash(after), canonicalHash(before), `${row.id} accepted bytes changed`);
	}
	const competingRepair = hash('unrelated competing effective cohort');
	const competingDirectory = path.dirname(
		scienceChallengeEffectiveCohortManifestPath({
			outputRoot: fixture.outputRoot,
			repairSha256: competingRepair
		})
	);
	const competingManifest = structuredClone(predecessor.manifest);
	competingManifest.repairSha256 = competingRepair;
	const competingCore = structuredClone(competingManifest);
	delete competingCore.manifestCoreSha256;
	competingManifest.manifestCoreSha256 = canonicalHash(competingCore);
	writeJson(path.join(competingDirectory, 'manifest.json'), competingManifest);
	assert.throws(
		() => discoverScienceChallengeEffectiveCohortManifest(fixture.outputRoot),
		/multiple competing|unrelated competing/
	);
	rmSync(competingDirectory, { recursive: true, force: true });
	assert.throws(
		() =>
			stageScienceChallengeEffectiveCohortSuccessor({
				workspaceRoot: fixture.root,
				outputRoot: fixture.outputRoot,
				repairSha256,
				objectiveId: hash('fresh review objective 2'),
				executionId: hash('fresh review execution 2'),
				reviewSummary,
				reviewEffectiveCohortManifestSha256: canonicalHash(predecessor.manifest),
				predecessor,
				proposals: [proposal],
				validateCollectionCandidate: fixture.options.validateCollectionCandidate
			}),
		/single discoverable terminal cohort|already exists/
	);
	const durableRoot = path.join(fixture.root, 'durable-successor');
	cpSync(fixture.outputRoot, durableRoot, { recursive: true });
	rmSync(fixture.outputRoot, { recursive: true, force: true });
	const relocatedManifestPath = path.join(
		durableRoot,
		path.basename(path.dirname(successor.manifestPath)),
		'manifest.json'
	);
	const relocated = readScienceChallengeEffectiveCohort({
		manifestPath: relocatedManifestPath,
		referenceRoot: durableRoot,
		basePlan: fixture.options.basePlan,
		effectivePlan: fixture.options.effectivePlan,
		expectedRepairSha256: repairSha256,
		expectedObjectiveId: hash('fresh review objective 2'),
		expectedExecutionId: hash('fresh review execution 2'),
		expectedFirstReviewSha256: repairSha256,
		expectedSourceSnapshotSha256: fixture.expected.expectedSourceSnapshotSha256,
		expectedCurriculumEvidenceSha256: fixture.expected.expectedCurriculumEvidenceSha256,
		expectedCurriculumCatalogSha256: fixture.expected.expectedCurriculumCatalogSha256,
		validateCollectionCandidate: fixture.options.validateCollectionCandidate
	});
	assert.equal(relocated.status, 'passed', relocated.issues.join('\n'));
	assert.equal(relocated.candidateSetSha256, successor.candidateSetSha256);
	const relocatedReleaseGate = validateScienceChallengeEffectiveReleaseGate({
		effectiveCohort: relocated,
		basePlan: fixture.options.basePlan,
		effectivePlan: fixture.options.effectivePlan,
		contentVerification: terminalContentVerification,
		curriculumRemapVerifierInputSha256: terminalVerifierInputSha256
	});
	assert.equal(relocatedReleaseGate.status, 'passed', relocatedReleaseGate.issues.join('\n'));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('stages a review-rebase successor from the exact V0/R0/B0/V1 mutable union and gates only fresh bound V2', () => {
	const fixture = buildReviewRebaseSuccessorFixture();
	const successor = stageScienceChallengeEffectiveCohortSuccessor(fixture.stageOptions);
	assert.equal(successor.status, 'passed', successor.issues.join('\n'));
	assert.equal(successor.manifest.parent.kind, 'review-rebase');
	assert.equal(successor.manifest.parentChain.kind, 'review-rebase-successor');
	assert.equal(
		successor.manifest.parentChain.parentVerificationSha256,
		canonicalHash(fixture.parentVerification)
	);
	assert.equal(
		successor.manifest.parentChain.parentRepairSha256,
		canonicalHash(fixture.parentRepair)
	);
	assert.equal(
		successor.manifest.parentChain.firstVerificationSha256,
		canonicalHash(fixture.reviewSummary)
	);
	assert.deepEqual(successor.manifest.review.mutableTargetIds, fixture.mutableIds);
	assert.equal(successor.manifest.attemptBudget.predecessorObjectiveId, null);
	assert.equal(successor.manifest.recoveryCount, 0);
	assert.equal(successor.collectionValidation.status, 'passed');
	assert.equal(successor.collectionValidation.issues.length, 0);
	assert.equal(
		scienceChallengeEffectiveCohortAttemptBudgetByShard(successor).get(fixture.mutableShardId),
		1
	);
	for (const row of fixture.effectivePlan.rows) {
		const before = fixture.reviewRebaseEvidence.orderedCandidates.find(
			(entry) => entry.definition.id === row.id
		);
		const after = successor.candidateSet.find((entry) => entry.definition.id === row.id);
		if (fixture.mutableIds.includes(row.id)) {
			assert.notEqual(canonicalHash(after), canonicalHash(before), `${row.id} did not change`);
		} else {
			assert.equal(canonicalHash(after), canonicalHash(before), `${row.id} frozen bytes changed`);
		}
	}

	const missingParentReplay = readScienceChallengeEffectiveCohort({
		manifestPath: successor.manifestPath,
		referenceRoot: fixture.outputRoot,
		basePlan: fixture.basePlan,
		effectivePlan: fixture.effectivePlan,
		validateCollectionCandidate: fixture.validateCollectionCandidate
	});
	assert.equal(missingParentReplay.status, 'failed');
	assert.match(missingParentReplay.issues.join('\n'), /complete replayed B0/);

	const v2 = acceptedReviewRebaseSuccessorVerification({ fixture, successor });
	const gate = validateScienceChallengeEffectiveReleaseGate({
		effectiveCohort: successor,
		basePlan: fixture.basePlan,
		effectivePlan: fixture.effectivePlan,
		contentVerification: v2,
		reviewRebaseEvidence: fixture.reviewRebaseEvidence
	});
	assert.equal(gate.status, 'passed', gate.issues.join('\n'));
	assert.equal(gate.contentParentLineageSha256, canonicalHash(successor.manifest.parentChain));
	assert.deepEqual(gate.contentParentLineage, successor.manifest.parentChain);

	const unboundV2 = structuredClone(v2);
	delete unboundV2.effectiveCohortManifestSha256;
	assert.equal(
		validateScienceChallengeEffectiveReleaseGate({
			effectiveCohort: successor,
			basePlan: fixture.basePlan,
			effectivePlan: fixture.effectivePlan,
			contentVerification: unboundV2,
			reviewRebaseEvidence: fixture.reviewRebaseEvidence
		}).status,
		'failed'
	);
	assert.equal(
		validateScienceChallengeEffectiveReleaseGate({
			effectiveCohort: successor,
			basePlan: fixture.basePlan,
			effectivePlan: fixture.effectivePlan,
			contentVerification: fixture.reviewSummary,
			reviewRebaseEvidence: fixture.reviewRebaseEvidence
		}).status,
		'failed',
		'V1 cannot be reused as V2'
	);
	assert.equal(
		validateScienceChallengeEffectiveReleaseGate({
			effectiveCohort: successor,
			basePlan: fixture.basePlan,
			effectivePlan: fixture.effectivePlan,
			contentVerification: v2
		}).status,
		'failed',
		'B0 replay is mandatory at release'
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('inherits authenticated review-rebase ancestry through S2 and releases only terminal-bound V3', () => {
	const fixture = buildReviewRebaseSuccessorFixture();
	const s1 = stageScienceChallengeEffectiveCohortSuccessor(fixture.stageOptions);
	assert.equal(s1.status, 'passed', s1.issues.join('\n'));
	const rejectedRow = fixture.effectivePlan.rows[9];
	const v2Reviews = fixture.effectivePlan.rows.map((row) => {
		const review = fullReviewRow(row.id);
		if (row.id === rejectedRow.id) {
			review.precisionAndSpecificity = false;
			review.accepted = false;
			review.issues = [
				{
					field: 'definition.prompt',
					category: 'precision',
					evidence: 'The second-cycle prompt is ambiguous.',
					repair: 'State the exact second-cycle comparison.'
				}
			];
		}
		return review;
	});
	const shardIds = [...new Set(fixture.effectivePlan.rows.map((row) => row.shard))];
	const v2 = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planId: fixture.effectivePlan.planId,
		planSha256: canonicalHash(fixture.effectivePlan),
		basePlanSha256: canonicalHash(fixture.basePlan),
		effectivePlanSha256: canonicalHash(fixture.effectivePlan),
		sourceSnapshotSha256: s1.manifest.sourceSnapshotSha256,
		curriculumEvidenceSha256: s1.manifest.curriculumEvidenceSha256,
		candidateSetSha256: s1.candidateSetSha256,
		effectiveCohortManifestSha256: canonicalHash(s1.manifest),
		recoverySetSha256: s1.manifest.recoverySetSha256,
		assignmentCount: shardIds.length,
		reviewCount: fixture.effectivePlan.rows.length,
		acceptedCount: fixture.effectivePlan.rows.length - 1,
		rejectedCount: 1,
		assignmentResults: shardIds.map((assignmentId) => ({
			assignmentId,
			status: 'passed'
		})),
		reviews: v2Reviews,
		issues: []
	};
	const v2Sha256 = canonicalHash(v2);
	const priorCandidate = s1.candidateBatches.get(rejectedRow.shard);
	const priorShard = s1.manifest.shards.find((shard) => shard.shardId === rejectedRow.shard);
	const priorValidation = readJson(path.resolve(fixture.outputRoot, priorShard.validation.path));
	const candidate = structuredClone(priorCandidate);
	const targetIndex = candidate.challenges.findIndex(
		(entry) => entry.definition.id === rejectedRow.id
	);
	candidate.challenges[targetIndex].definition.cohortVersion = 'second-cycle-repaired';
	const validation = passedValidation(candidate);
	const proposalRoot = path.join(
		fixture.outputRoot,
		'shards',
		rejectedRow.shard,
		`verification-repair-${v2Sha256.slice(0, 12)}-attempt-01`
	);
	const candidatePath = path.join(proposalRoot, 'candidate.json');
	const validationPath = path.join(proposalRoot, 'validation.json');
	writeJson(candidatePath, candidate);
	writeJson(validationPath, validation);
	const s2 = stageScienceChallengeEffectiveCohortSuccessor({
		workspaceRoot: fixture.root,
		outputRoot: fixture.outputRoot,
		repairSha256: v2Sha256,
		objectiveId: hash('review-rebase successor objective S2'),
		executionId: hash('review-rebase successor execution S2'),
		reviewSummary: v2,
		reviewEffectiveCohortManifestSha256: canonicalHash(s1.manifest),
		predecessor: s1,
		reviewRebaseEvidence: fixture.reviewRebaseEvidence,
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
		validateCollectionCandidate: fixture.validateCollectionCandidate
	});
	assert.equal(s2.status, 'passed', s2.issues.join('\n'));
	assert.equal(canonicalHash(s2.manifest.parentChain), canonicalHash(s1.manifest.parentChain));
	assert.equal(s2.predecessor.manifestFileSha256, s1.manifestFileSha256);
	assert.equal(s2.reviewSummary.effectiveCohortManifestSha256, canonicalHash(s1.manifest));

	const v3 = acceptedReviewRebaseSuccessorVerification({ fixture, successor: s2 });
	const gate = validateScienceChallengeEffectiveReleaseGate({
		effectiveCohort: s2,
		basePlan: fixture.basePlan,
		effectivePlan: fixture.effectivePlan,
		contentVerification: v3,
		reviewRebaseEvidence: fixture.reviewRebaseEvidence
	});
	assert.equal(gate.status, 'passed', gate.issues.join('\n'));
	assert.equal(gate.contentParentLineageSha256, canonicalHash(s1.manifest.parentChain));
	const stalePassedV2 = acceptedReviewRebaseSuccessorVerification({
		fixture,
		successor: s1
	});
	for (const staleReview of [fixture.reviewSummary, v2, stalePassedV2]) {
		assert.equal(
			validateScienceChallengeEffectiveReleaseGate({
				effectiveCohort: s2,
				basePlan: fixture.basePlan,
				effectivePlan: fixture.effectivePlan,
				contentVerification: staleReview,
				reviewRebaseEvidence: fixture.reviewRebaseEvidence
			}).status,
			'failed'
		);
	}

	const s2ManifestBytes = readFileSync(s2.manifestPath);
	for (const mutation of ['missing', 'tampered']) {
		const changed = JSON.parse(s2ManifestBytes.toString('utf8'));
		if (mutation === 'missing') delete changed.parentChain;
		else changed.parentChain.mutableTargetSetSha256 = hash('tampered inherited parent chain');
		const changedCore = structuredClone(changed);
		delete changedCore.manifestCoreSha256;
		changed.manifestCoreSha256 = canonicalHash(changedCore);
		writeJson(s2.manifestPath, changed);
		const replay = readScienceChallengeEffectiveCohort({
			manifestPath: s2.manifestPath,
			referenceRoot: fixture.outputRoot,
			basePlan: fixture.basePlan,
			effectivePlan: fixture.effectivePlan,
			validateCollectionCandidate: fixture.validateCollectionCandidate,
			reviewRebaseEvidence: fixture.reviewRebaseEvidence
		});
		assert.equal(replay.status, 'failed', mutation);
		writeFileSync(s2.manifestPath, s2ManifestBytes);
	}
	rmSync(fixture.root, { recursive: true, force: true });
});

test('review-rebase successor rejects authority shrinkage, unchanged remediation targets and non-target mutation', () => {
	for (const mutation of [
		'authority-shrinkage',
		'unchanged-remediation-target',
		'non-target-mutation'
	]) {
		const fixture = buildReviewRebaseSuccessorFixture({ mutation });
		assert.throws(
			() => stageScienceChallengeEffectiveCohortSuccessor(fixture.stageOptions),
			/authority|mutable|stale|changed|target/i,
			mutation
		);
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

function buildReviewRebaseSuccessorFixture({ mutation = null } = {}) {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-review-rebase-successor-'));
	const outputRoot = path.join(root, 'generation');
	const rebaseRoot = path.join(root, 'review-rebase');
	mkdirSync(outputRoot, { recursive: true });
	mkdirSync(rebaseRoot, { recursive: true });
	const sourceSnapshotSha256 = hash('review-rebase source');
	const curriculumEvidenceSha256 = hash('review-rebase curriculum evidence');
	const curriculumCatalogSha256 = hash('review-rebase curriculum catalog');
	const rows = Array.from({ length: 408 }, (_, index) => ({
		id: `science-rebase-row-${String(index + 1).padStart(3, '0')}`,
		shard: `science-${String(Math.floor(index / 8) + 1).padStart(3, '0')}`,
		curriculumComponentId: `component-${index + 1}`,
		difficulty: 'standard'
	}));
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-review-rebase-successor-v1',
		curriculumCatalogSha256,
		rows
	};
	const effectivePlan = structuredClone(basePlan);
	const shardIds = [...new Set(rows.map((row) => row.shard))];
	const candidateBatches = new Map();
	const outputValidations = new Map();
	const selections = [];
	const orderedCandidates = [];
	for (const shardId of shardIds) {
		const candidate = batchForRows(
			rows.filter((row) => row.shard === shardId),
			'review-rebase-b0'
		);
		const validation = {
			schemaVersion: 'science-challenge-review-rebase-validation/v1',
			status: 'passed',
			contentStatus: 'review-pending',
			issues: [],
			releaseEligible: false,
			candidateSha256: canonicalHash(candidate)
		};
		candidateBatches.set(shardId, candidate);
		outputValidations.set(shardId, validation);
		orderedCandidates.push(...candidate.challenges);
		selections.push({
			shardId,
			source: {
				candidatePath: `inputs/${shardId}/candidate.json`,
				candidateSha256: canonicalHash(candidate),
				validationPath: `inputs/${shardId}/validation.json`,
				validationSha256: hash(`${shardId} source validation`)
			},
			candidateSha256: canonicalHash(candidate),
			validationSha256: canonicalHash(validation)
		});
	}
	const collectionIssue = 'Opening and transfer contexts collide for one reviewed pair.';
	const collectionRemediations = [
		{
			issue: collectionIssue,
			preferredChallengeId: rows[1].id
		}
	];
	const b0CollectionValidation = {
		status: 'failed',
		issues: [collectionIssue],
		repairTargets: [{ challengeId: rows[1].id }],
		candidateCount: orderedCandidates.length,
		candidateSetSha256: canonicalHash(orderedCandidates),
		effectivePlanSha256: canonicalHash(effectivePlan)
	};
	const parentVerification = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		candidateSetSha256: canonicalHash(orderedCandidates)
	};
	const parentRepair = {
		schemaVersion: 'science-challenge-verification-repair-summary/v1',
		status: 'failed',
		verificationRepairExecutionIdentity: {
			objectiveId: hash('review-rebase parent objective'),
			executionId: hash('review-rebase parent execution')
		}
	};
	const basePlanPath = path.join(root, 'inputs', 'base-plan.json');
	const parentVerificationPath = path.join(root, 'inputs', 'v0.json');
	const parentRepairPath = path.join(root, 'inputs', 'r0.json');
	writeJson(basePlanPath, basePlan);
	writeJson(parentVerificationPath, parentVerification);
	writeJson(parentRepairPath, parentRepair);
	const inputBinding = (filePath, value) => ({
		path: path.relative(root, filePath).split(path.sep).join('/'),
		fileSha256: sha256(readFileSync(filePath)),
		canonicalSha256: canonicalHash(value)
	});
	const coreManifestWithoutHash = {
		schemaVersion: 'science-challenge-review-rebase-manifest/v1',
		status: 'review-pending',
		disposition: 'deterministic-parent-bound-review-rebase',
		rebaseId: hash('review-rebase B0'),
		basePlanSha256: canonicalHash(basePlan),
		planSha256: canonicalHash(effectivePlan),
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		parent: {
			verificationSha256: canonicalHash(parentVerification),
			repairSha256: canonicalHash(parentRepair),
			candidateSetSha256: parentVerification.candidateSetSha256,
			objectiveId: parentRepair.verificationRepairExecutionIdentity.objectiveId,
			executionId: parentRepair.verificationRepairExecutionIdentity.executionId
		},
		selections,
		selectionSetSha256: canonicalHash(selections),
		candidateCount: orderedCandidates.length,
		candidateSetSha256: canonicalHash(orderedCandidates),
		collectionValidation: b0CollectionValidation,
		collectionValidationSha256: canonicalHash(b0CollectionValidation),
		collectionRemediations,
		collectionRemediationSetSha256: canonicalHash(collectionRemediations),
		requiresFreshFullVerification: true,
		releaseEligible: false
	};
	const coreManifest = {
		...coreManifestWithoutHash,
		manifestCoreSha256: canonicalHash(coreManifestWithoutHash)
	};
	const manifestPathRelative = 'review-rebase/manifest.json';
	const manifest = {
		...coreManifest,
		evidence: {
			schemaVersion: 'science-challenge-review-rebase-filesystem-evidence/v1',
			outputRoot: 'review-rebase',
			manifestPath: manifestPathRelative,
			inputs: {
				basePlan: inputBinding(basePlanPath, basePlan),
				parentVerification: inputBinding(parentVerificationPath, parentVerification),
				parentRepair: inputBinding(parentRepairPath, parentRepair)
			}
		}
	};
	const manifestPath = path.join(root, manifestPathRelative);
	writeJson(manifestPath, manifest);
	const reviewRebaseEvidence = {
		status: 'passed',
		issues: [],
		action: 'replayed',
		repositoryRoot: root,
		outputRoot: rebaseRoot,
		manifestPath,
		manifestPathRelative,
		manifest,
		coreManifest,
		plan: effectivePlan,
		candidateBatches,
		outputValidations,
		collectionValidation: b0CollectionValidation,
		orderedCandidates
	};
	const reviews = rows.map((row) => fullReviewRow(row.id));
	reviews[0] = {
		...reviews[0],
		precisionAndSpecificity: false,
		accepted: false,
		issues: [
			{
				field: 'definition.prompt',
				category: 'precision',
				evidence: 'The exact comparison is ambiguous.',
				repair: 'Name the exact comparison.'
			}
		]
	};
	const reviewRebaseCollectionRemediationTargetIds = [rows[1].id];
	const reviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planId: effectivePlan.planId,
		planSha256: canonicalHash(effectivePlan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		candidateSetSha256: canonicalHash(orderedCandidates),
		reviewRebaseManifestSha256: canonicalHash(manifest),
		reviewRebaseId: coreManifest.rebaseId,
		reviewRebaseCandidateSetSha256: coreManifest.candidateSetSha256,
		reviewRebaseCollectionValidationSha256: coreManifest.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256: coreManifest.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediations: collectionRemediations,
		reviewRebaseCollectionRemediationTargetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(
			reviewRebaseCollectionRemediationTargetIds
		),
		assignmentCount: shardIds.length,
		reviewCount: rows.length,
		acceptedCount: rows.length - 1,
		rejectedCount: 1,
		assignmentResults: shardIds.map((assignmentId) => ({
			assignmentId,
			status: 'passed'
		})),
		reviews,
		issues: []
	};
	const mutableIds = [rows[0].id, rows[1].id].sort();
	const mutableShardId = rows[0].shard;
	const priorCandidate = candidateBatches.get(mutableShardId);
	const priorValidation = outputValidations.get(mutableShardId);
	const candidate = structuredClone(priorCandidate);
	candidate.challenges[0].definition.cohortVersion = 'review-rebase-repaired';
	if (mutation !== 'unchanged-remediation-target') {
		candidate.challenges[1].definition.cohortVersion = 'review-rebase-repaired';
	}
	if (mutation === 'non-target-mutation') {
		candidate.challenges[2].definition.cohortVersion = 'illegally-mutated';
	}
	const validation = passedValidation(candidate);
	const repairSha256 = canonicalHash(reviewSummary);
	const proposalRoot = path.join(
		outputRoot,
		'shards',
		mutableShardId,
		`verification-repair-${repairSha256.slice(0, 12)}-attempt-01`
	);
	const candidatePath = path.join(proposalRoot, 'candidate.json');
	const validationPath = path.join(proposalRoot, 'validation.json');
	writeJson(candidatePath, candidate);
	writeJson(validationPath, validation);
	const proposal = {
		shardId: mutableShardId,
		attempt: 1,
		candidatePath,
		validationPath,
		candidateSha256: canonicalHash(candidate),
		validationSha256: canonicalHash(validation),
		expectedTargetCandidateSha256: canonicalHash(priorCandidate),
		expectedTargetValidationSha256: canonicalHash(priorValidation)
	};
	const suppliedAuthority =
		mutation === 'authority-shrinkage'
			? {
					schemaVersion: 'science-challenge-verification-repair-authority/v1',
					parent: {
						disposition: 'deterministic-parent-bound-review-rebase',
						rebaseId: coreManifest.rebaseId,
						manifestSha256: canonicalHash(manifest),
						verificationSha256: canonicalHash(reviewSummary),
						planSha256: canonicalHash(effectivePlan),
						candidateSetSha256: canonicalHash(orderedCandidates),
						collectionValidationSha256: coreManifest.collectionValidationSha256,
						collectionRemediationSetSha256: coreManifest.collectionRemediationSetSha256,
						collectionRemediationTargetSetSha256: canonicalHash([])
					},
					independentRejectedChallengeIds: [rows[0].id],
					independentRejectedChallengeSetSha256: canonicalHash([rows[0].id]),
					collectionRemediations: [],
					collectionRemediationTargetIds: [],
					collectionRemediationTargetSetSha256: canonicalHash([]),
					mutableChallengeIds: [rows[0].id],
					mutableChallengeSetSha256: canonicalHash([rows[0].id])
				}
			: null;
	const validateCollectionCandidate = ({ candidateSet, effectivePlan: candidatePlan }) => {
		const issues = [];
		if (
			candidateSet.length !== rows.length ||
			candidateSet[0]?.definition?.cohortVersion !== 'review-rebase-repaired' ||
			candidateSet[1]?.definition?.cohortVersion !== 'review-rebase-repaired' ||
			candidateSet.slice(2).some((entry, offset) => {
				const index = offset + 2;
				const version = entry?.definition?.cohortVersion;
				return index === 9
					? !['review-rebase-b0', 'second-cycle-repaired'].includes(version)
					: version !== 'review-rebase-b0';
			})
		) {
			issues.push('Review-rebase successor collection remains unrepaired or changed frozen rows.');
		}
		return {
			status: issues.length ? 'failed' : 'passed',
			issues,
			repairTargets: [],
			candidateCount: candidateSet.length,
			candidateSetSha256: canonicalHash(candidateSet),
			effectivePlanSha256: canonicalHash(candidatePlan)
		};
	};
	return {
		root,
		outputRoot,
		basePlan,
		effectivePlan,
		parentVerification,
		parentRepair,
		reviewRebaseEvidence,
		reviewSummary,
		mutableIds,
		mutableShardId,
		validateCollectionCandidate,
		stageOptions: {
			workspaceRoot: root,
			outputRoot,
			repairSha256,
			objectiveId: hash('review-rebase successor objective'),
			executionId: hash('review-rebase successor execution'),
			reviewSummary,
			reviewRebaseEvidence,
			verificationRepairAuthority: suppliedAuthority,
			proposals: [proposal],
			validateCollectionCandidate
		}
	};
}

function acceptedReviewRebaseSuccessorVerification({ fixture, successor }) {
	const shardIds = [...new Set(fixture.effectivePlan.rows.map((row) => row.shard))];
	return {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'passed',
		planId: fixture.effectivePlan.planId,
		planSha256: canonicalHash(fixture.effectivePlan),
		basePlanSha256: canonicalHash(fixture.basePlan),
		effectivePlanSha256: canonicalHash(fixture.effectivePlan),
		sourceSnapshotSha256: successor.manifest.sourceSnapshotSha256,
		curriculumEvidenceSha256: successor.manifest.curriculumEvidenceSha256,
		candidateSetSha256: successor.candidateSetSha256,
		effectiveCohortManifestSha256: canonicalHash(successor.manifest),
		assignmentCount: shardIds.length,
		reviewCount: fixture.effectivePlan.rows.length,
		acceptedCount: fixture.effectivePlan.rows.length,
		rejectedCount: 0,
		assignmentResults: shardIds.map((assignmentId) => ({
			assignmentId,
			status: 'passed'
		})),
		reviews: fixture.effectivePlan.rows.map((row) => ({
			id: row.id,
			accepted: true
		})),
		issues: []
	};
}

function buildCohortFixture({
	withDifficultyAdjustment = false,
	withDifficultyAdjustmentSet = false
} = {}) {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-effective-cohort-'));
	const outputRoot = path.join(root, 'generation');
	mkdirSync(outputRoot, { recursive: true });
	const parentId = 'aqa-biology:cell-transport';
	const leafId = 'aqa-biology:cell-transport:osmosis';
	const specificationSha256 = hash('specification');
	const rows = Array.from({ length: 408 }, (_, index) => {
		const shardIndex = Math.floor(index / 8) + 1;
		return {
			id: `science-row-${String(index + 1).padStart(3, '0')}`,
			shard: `science-${String(shardIndex).padStart(3, '0')}`,
			curriculumComponentId: index === 0 ? parentId : `component-${index + 1}`,
			curriculumCode: index === 0 ? '4.1.3' : `code-${index + 1}`,
			curriculumTitle: index === 0 ? 'Transport in cells' : `Topic ${index + 1}`,
			curriculumPageStart: index + 1,
			curriculumPageEnd: index + 1,
			specificationId: 'aqa-biology',
			specificationSha256,
			difficulty:
				index === 8
					? withDifficultyAdjustmentSet
						? 'starter'
						: 'stretch'
					: withDifficultyAdjustmentSet && index === 9
						? 'stretch'
						: 'standard'
		};
	});
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-effective-cohort-v1',
		rows
	};
	const effectivePlan = structuredClone(basePlan);
	Object.assign(effectivePlan.rows[0], {
		curriculumComponentId: leafId,
		curriculumCode: '4.1.3.2',
		curriculumTitle: 'Osmosis',
		curriculumPageStart: 2,
		curriculumPageEnd: 2
	});
	if (withDifficultyAdjustment || withDifficultyAdjustmentSet) {
		effectivePlan.rows[8].difficulty = 'standard';
	}
	if (withDifficultyAdjustmentSet) effectivePlan.rows[9].difficulty = 'standard';
	const shardIds = [...new Set(rows.map((row) => row.shard))];
	const rootFiles = [];
	const priorBatches = new Map();
	const rootValidations = new Map();
	for (const shardId of shardIds) {
		const shardRows = rows.filter((row) => row.shard === shardId);
		const candidate = batchForRows(shardRows, 'verified-root');
		const validation = passedValidation(candidate);
		const shardRoot = path.join(outputRoot, 'shards', shardId);
		writeJson(path.join(shardRoot, 'candidate.json'), candidate);
		writeJson(path.join(shardRoot, 'validation.json'), validation);
		rootFiles.push(path.join(shardRoot, 'candidate.json'), path.join(shardRoot, 'validation.json'));
		priorBatches.set(shardId, candidate);
		rootValidations.set(shardId, validation);
	}
	const repairSha256 = hash('first failed review');
	const objectiveId = hash('objective');
	const executionId = hash('execution');
	const remapShardId = shardIds[0];
	const remapRoot = path.join(
		outputRoot,
		'shards',
		remapShardId,
		`verification-repair-${repairSha256.slice(0, 12)}-descendant-remap`
	);
	const priorRemapCandidate = priorBatches.get(remapShardId);
	const remapCandidate = structuredClone(priorRemapCandidate);
	remapCandidate.challenges[0].grounding.curriculumComponentId = leafId;
	const remapValidation = {
		status: 'review-pending',
		issues: ['fresh full review required'],
		candidateSha256: canonicalHash(remapCandidate)
	};
	const remap = {
		challengeId: rows[0].id,
		field: 'grounding.curriculumComponentId',
		from: parentId,
		to: leafId
	};
	const inverseRemap = {
		challengeId: rows[0].id,
		field: remap.field,
		from: leafId,
		to: parentId
	};
	const baseComponent = componentTuple(basePlan.rows[0]);
	const effectiveComponent = componentTuple(effectivePlan.rows[0]);
	const remapOnlyPlan = structuredClone(basePlan);
	Object.assign(remapOnlyPlan.rows[0], effectiveComponent);
	const manifestCore = {
		schemaVersion: 'science-challenge-verifier-directed-descendant-remap/v1',
		disposition: 'deterministic-verifier-directed-descendant-remap',
		shardId: remapShardId,
		repairSha256,
		challengeId: rows[0].id,
		field: remap.field,
		base: {
			planSha256: canonicalHash(basePlan),
			planRowIndex: 0,
			planRowSha256: canonicalHash(basePlan.rows[0]),
			component: baseComponent,
			componentSha256: canonicalHash(baseComponent)
		},
		effective: {
			planSha256: canonicalHash(remapOnlyPlan),
			planRowIndex: 0,
			planRowSha256: canonicalHash(remapOnlyPlan.rows[0]),
			component: effectiveComponent,
			componentSha256: canonicalHash(effectiveComponent)
		},
		firstReview: {
			summarySha256: repairSha256
		},
		sourceAttempt: { attempt: 3, status: 'failed' },
		attemptBudget: {
			maxAttempts: 4,
			exhausted: true,
			selectedAttempt: 3,
			attempts: [1, 2, 3, 4].map((attempt) => ({
				attempt,
				status: 'failed',
				invalidated: false
			}))
		},
		priorCandidateSha256: canonicalHash(priorRemapCandidate),
		candidateSha256: canonicalHash(remapCandidate),
		remap,
		remapSha256: canonicalHash(remap),
		inverseRemap,
		inverseRemapSha256: canonicalHash(inverseRemap),
		priorTargetSha256: canonicalHash(priorRemapCandidate.challenges[0]),
		candidateTargetSha256: canonicalHash(remapCandidate.challenges[0]),
		inverseTargetSha256: canonicalHash(priorRemapCandidate.challenges[0])
	};
	const remapManifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	writeJson(path.join(remapRoot, 'manifest.json'), remapManifest);
	writeJson(path.join(remapRoot, 'candidate.json'), remapCandidate);
	writeJson(path.join(remapRoot, 'validation.json'), remapValidation);
	writeJson(path.join(remapRoot, 'prior-candidate.json'), priorRemapCandidate);

	const shardSelections = [
		{
			shardId: remapShardId,
			disposition: 'descendant-remap',
			candidatePath: path.join(remapRoot, 'candidate.json'),
			validationPath: path.join(remapRoot, 'validation.json'),
			candidateSha256: canonicalHash(remapCandidate),
			validationSha256: canonicalHash(remapValidation),
			remapManifestPath: path.join(remapRoot, 'manifest.json'),
			priorCandidatePath: path.join(remapRoot, 'prior-candidate.json')
		}
	];
	if (withDifficultyAdjustment) {
		const difficultyShardId = shardIds[1];
		const difficultyIndex = 8;
		const difficultyRoot = path.join(
			outputRoot,
			'shards',
			difficultyShardId,
			`verification-repair-${repairSha256.slice(0, 12)}-difficulty-plan-adjustment`
		);
		const priorDifficultyCandidate = priorBatches.get(difficultyShardId);
		const difficultyCandidate = structuredClone(priorDifficultyCandidate);
		difficultyCandidate.challenges[0].definition.difficulty = 'standard';
		const difficultyValidation = {
			status: 'review-pending',
			issues: ['fresh full review required'],
			candidateSha256: canonicalHash(difficultyCandidate)
		};
		const difficultyOnlyPlan = structuredClone(basePlan);
		difficultyOnlyPlan.rows[difficultyIndex].difficulty = 'standard';
		const adjustment = {
			challengeId: rows[difficultyIndex].id,
			field: 'definition.difficulty',
			from: 'stretch',
			to: 'standard'
		};
		const inverseAdjustment = {
			challengeId: adjustment.challengeId,
			field: adjustment.field,
			from: adjustment.to,
			to: adjustment.from
		};
		const siblingReviewBindings = priorDifficultyCandidate.challenges
			.slice(1)
			.map((entry, index) => ({
				challengeId: entry.definition.id,
				accepted: true,
				priorSha256: canonicalHash(entry),
				candidateSha256: canonicalHash(difficultyCandidate.challenges[index + 1])
			}));
		const difficultyManifestCore = {
			schemaVersion: 'science-challenge-verifier-directed-difficulty-plan-adjustment/v1',
			disposition: 'deterministic-verifier-directed-difficulty-plan-adjustment',
			shardId: difficultyShardId,
			repairSha256,
			challengeId: adjustment.challengeId,
			field: adjustment.field,
			base: {
				planSha256: canonicalHash(basePlan),
				planRowIndex: difficultyIndex,
				planRowSha256: canonicalHash(basePlan.rows[difficultyIndex]),
				difficulty: 'stretch'
			},
			effective: {
				planSha256: canonicalHash(difficultyOnlyPlan),
				planRowIndex: difficultyIndex,
				planRowSha256: canonicalHash(difficultyOnlyPlan.rows[difficultyIndex]),
				difficulty: 'standard'
			},
			firstReview: { summarySha256: repairSha256 },
			sourceAttempt: {
				attempt: 4,
				status: 'failed',
				sourceKind: 'direct-terminal-candidate',
				selectionPolicy: 'complete-terminal-attempt-04-only'
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
			siblingReviewBindings,
			siblingReviewBindingsSha256: canonicalHash(siblingReviewBindings),
			adjustment,
			adjustmentSha256: canonicalHash(adjustment),
			inverseAdjustment,
			inverseAdjustmentSha256: canonicalHash(inverseAdjustment),
			priorTargetSha256: canonicalHash(priorDifficultyCandidate.challenges[0]),
			candidateTargetSha256: canonicalHash(difficultyCandidate.challenges[0]),
			inverseTargetSha256: canonicalHash(priorDifficultyCandidate.challenges[0]),
			collectionValidationSha256: hash('isolated difficulty collection validation')
		};
		const difficultyManifest = {
			...difficultyManifestCore,
			manifestCoreSha256: canonicalHash(difficultyManifestCore)
		};
		writeJson(path.join(difficultyRoot, 'manifest.json'), difficultyManifest);
		writeJson(path.join(difficultyRoot, 'candidate.json'), difficultyCandidate);
		writeJson(path.join(difficultyRoot, 'validation.json'), difficultyValidation);
		writeJson(path.join(difficultyRoot, 'prior-candidate.json'), priorDifficultyCandidate);
		shardSelections.push({
			shardId: difficultyShardId,
			disposition: 'difficulty-plan-adjustment',
			candidatePath: path.join(difficultyRoot, 'candidate.json'),
			validationPath: path.join(difficultyRoot, 'validation.json'),
			candidateSha256: canonicalHash(difficultyCandidate),
			validationSha256: canonicalHash(difficultyValidation),
			adjustmentManifestPath: path.join(difficultyRoot, 'manifest.json'),
			priorCandidatePath: path.join(difficultyRoot, 'prior-candidate.json')
		});
	}
	if (withDifficultyAdjustmentSet) {
		const difficultyShardId = shardIds[1];
		const difficultyIndexes = [8, 9];
		const difficultyRoot = path.join(
			outputRoot,
			'shards',
			difficultyShardId,
			`verification-repair-${repairSha256.slice(0, 12)}-difficulty-plan-adjustment-set`
		);
		const priorDifficultyCandidate = priorBatches.get(difficultyShardId);
		const difficultyCandidate = structuredClone(priorDifficultyCandidate);
		difficultyCandidate.challenges[0].definition.difficulty = 'standard';
		difficultyCandidate.challenges[0].definition.contentRevision = 'terminal-reviewed';
		difficultyCandidate.challenges[1].definition.difficulty = 'standard';
		const difficultyValidation = {
			status: 'review-pending',
			issues: ['fresh full review required'],
			candidateSha256: canonicalHash(difficultyCandidate)
		};
		const difficultySetOnlyPlan = structuredClone(basePlan);
		for (const index of difficultyIndexes) {
			difficultySetOnlyPlan.rows[index].difficulty = 'standard';
		}
		const requestedAdjustments = [
			{
				challengeId: rows[difficultyIndexes[0]].id,
				field: 'definition.difficulty',
				from: 'starter',
				to: 'standard'
			},
			{
				challengeId: rows[difficultyIndexes[1]].id,
				field: 'definition.difficulty',
				from: 'stretch',
				to: 'standard'
			}
		];
		const mixedDifficultyIssue = {
			field: 'definition.difficulty',
			category: 'calibration',
			evidence: 'The repaired task is not credibly labelled starter.',
			repair: 'Raise the difficulty to standard.'
		};
		const exactDifficultyIssue = {
			field: 'definition.difficulty',
			category: 'calibration',
			evidence: 'The direct task does not support the stretch label.',
			repair: 'Label the challenge standard rather than stretch.'
		};
		const targetReviews = [
			{
				...fullReviewRow(requestedAdjustments[0].challengeId),
				contextsDistinct: false,
				difficultyCalibrated: false,
				accepted: false,
				issues: [
					{
						field: 'definition.transferPromptLead',
						category: 'distinctness',
						evidence: 'The old transfer repeated the opening.',
						repair: 'Use the reviewed distinct transfer.'
					},
					mixedDifficultyIssue
				]
			},
			{
				...fullReviewRow(requestedAdjustments[1].challengeId),
				difficultyCalibrated: false,
				accepted: false,
				issues: [exactDifficultyIssue]
			}
		];
		const adjustmentRecords = requestedAdjustments.map((adjustment, offset) => {
			const planRowIndex = difficultyIndexes[offset];
			const basePlanRow = basePlan.rows[planRowIndex];
			const effectivePlanRow = difficultySetOnlyPlan.rows[planRowIndex];
			const priorTarget = priorDifficultyCandidate.challenges[offset];
			const candidateTarget = difficultyCandidate.challenges[offset];
			const candidateWithoutAdjustment = structuredClone(candidateTarget);
			candidateWithoutAdjustment.definition.difficulty = adjustment.from;
			const issue = offset === 0 ? mixedDifficultyIssue : exactDifficultyIssue;
			return {
				...adjustment,
				basePlanRowIndex: planRowIndex,
				basePlanRowSha256: canonicalHash(basePlanRow),
				effectivePlanRowSha256: canonicalHash(effectivePlanRow),
				review: targetReviews[offset],
				reviewSha256: canonicalHash(targetReviews[offset]),
				issue,
				issueSha256: canonicalHash(issue),
				priorTargetSha256: canonicalHash(priorTarget),
				candidateTargetSha256: canonicalHash(candidateTarget),
				candidateWithoutAdjustmentSha256: canonicalHash(candidateWithoutAdjustment)
			};
		});
		const rowReviewBindings = priorDifficultyCandidate.challenges.map((entry, index) => {
			const review = targetReviews[index] ?? fullReviewRow(entry.definition.id);
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
			repairSha256,
			objectiveId,
			executionId,
			field: 'definition.difficulty',
			base: {
				planSha256: canonicalHash(basePlan),
				shardRowsSha256: canonicalHash(
					basePlan.rows.filter((row) => row.shard === difficultyShardId)
				)
			},
			effective: {
				planSha256: canonicalHash(difficultySetOnlyPlan),
				shardRowsSha256: canonicalHash(
					difficultySetOnlyPlan.rows.filter((row) => row.shard === difficultyShardId)
				)
			},
			firstReview: {
				summarySha256: repairSha256,
				resultSha256: hash('science-021 review result'),
				assignmentSha256: hash('science-021 assignment'),
				dispatchLedgerSha256: hash('science-021 dispatch')
			},
			sourceAttempt: {
				attempt: 4,
				status: 'failed',
				sourceKind: 'direct-terminal-candidate',
				selectionPolicy: 'complete-terminal-attempt-04-only',
				runSummarySha256: hash('science-021 run summary'),
				sourceValidationSha256: hash('science-021 source validation'),
				sourceCandidateSha256: canonicalHash(difficultyCandidate),
				runPolicySha256: hash('science-021 run policy'),
				exactFileBindingsSha256: hash('science-021 file bindings')
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
			collectionValidationSha256: hash('combined difficulty collection validation')
		};
		const difficultyManifest = {
			...difficultyManifestCore,
			manifestCoreSha256: canonicalHash(difficultyManifestCore)
		};
		writeJson(path.join(difficultyRoot, 'manifest.json'), difficultyManifest);
		writeJson(path.join(difficultyRoot, 'candidate.json'), difficultyCandidate);
		writeJson(path.join(difficultyRoot, 'validation.json'), difficultyValidation);
		writeJson(path.join(difficultyRoot, 'prior-candidate.json'), priorDifficultyCandidate);
		shardSelections.push({
			shardId: difficultyShardId,
			disposition: 'difficulty-plan-adjustment',
			candidatePath: path.join(difficultyRoot, 'candidate.json'),
			validationPath: path.join(difficultyRoot, 'validation.json'),
			candidateSha256: canonicalHash(difficultyCandidate),
			validationSha256: canonicalHash(difficultyValidation),
			adjustmentManifestPath: path.join(difficultyRoot, 'manifest.json'),
			priorCandidatePath: path.join(difficultyRoot, 'prior-candidate.json')
		});
	}
	for (const shardId of shardIds.slice(1, -1)) {
		if ((withDifficultyAdjustment || withDifficultyAdjustmentSet) && shardId === shardIds[1]) {
			continue;
		}
		const shardRows = rows.filter((row) => row.shard === shardId);
		const candidate = batchForRows(shardRows, 'ordinary-staged');
		const validation = passedValidation(candidate);
		const proposalRoot = path.join(
			outputRoot,
			'shards',
			shardId,
			`verification-repair-${repairSha256.slice(0, 12)}-attempt-01`
		);
		writeJson(path.join(proposalRoot, 'candidate.json'), candidate);
		writeJson(path.join(proposalRoot, 'validation.json'), validation);
		const proposal = {
			shardId,
			attempt: 1,
			candidatePath: path.join(proposalRoot, 'candidate.json'),
			validationPath: path.join(proposalRoot, 'validation.json'),
			candidateSha256: canonicalHash(candidate),
			validationSha256: canonicalHash(validation),
			expectedTargetCandidateSha256: canonicalHash(priorBatches.get(shardId)),
			expectedTargetValidationSha256: canonicalHash(rootValidations.get(shardId))
		};
		shardSelections.push({
			shardId,
			disposition: 'ordinary-repair-proposal',
			candidatePath: proposal.candidatePath,
			validationPath: proposal.validationPath,
			candidateSha256: proposal.candidateSha256,
			validationSha256: proposal.validationSha256,
			proposal
		});
	}
	const fallbackShardId = shardIds.at(-1);
	shardSelections.push({
		shardId: fallbackShardId,
		disposition: 'unchanged-verified-fallback',
		candidatePath: path.join(outputRoot, 'shards', fallbackShardId, 'candidate.json'),
		validationPath: path.join(outputRoot, 'shards', fallbackShardId, 'validation.json'),
		candidateSha256: canonicalHash(priorBatches.get(fallbackShardId)),
		validationSha256: canonicalHash(rootValidations.get(fallbackShardId)),
		firstReviewCandidateSha256: canonicalHash(priorBatches.get(fallbackShardId)),
		firstReviewValidationSha256: canonicalHash(rootValidations.get(fallbackShardId))
	});
	const expected = {
		basePlan,
		effectivePlan,
		expectedRepairSha256: repairSha256,
		expectedObjectiveId: objectiveId,
		expectedExecutionId: executionId,
		expectedFirstReviewSha256: repairSha256,
		expectedSourceSnapshotSha256: hash('source snapshot'),
		expectedCurriculumEvidenceSha256: hash('curriculum evidence'),
		expectedCurriculumCatalogSha256: hash('curriculum catalog')
	};
	const validateCollectionCandidate = ({ candidateSet, effectivePlan: candidatePlan }) => {
		const issues = [];
		const preservedShardIndexes = new Set([
			0,
			...(withDifficultyAdjustment || withDifficultyAdjustmentSet ? [1] : []),
			50
		]);
		if (
			candidateSet.length !== 408 ||
			candidateSet[0]?.grounding?.curriculumComponentId !== leafId ||
			candidateSet.some((entry, index) => {
				const shardIndex = Math.floor(index / 8);
				const expectedVersion = preservedShardIndexes.has(shardIndex)
					? 'verified-root'
					: 'ordinary-staged';
				return entry?.definition?.cohortVersion !== expectedVersion;
			}) ||
			candidateSet.some(
				(entry, index) => entry?.definition?.difficulty !== candidatePlan.rows[index]?.difficulty
			) ||
			(withDifficultyAdjustmentSet &&
				candidateSet[8]?.definition?.contentRevision !== 'terminal-reviewed')
		) {
			issues.push('Collection differs from the exact staged/fallback overlay.');
		}
		return {
			status: issues.length ? 'failed' : 'passed',
			issues,
			repairTargets: [],
			candidateCount: candidateSet.length,
			candidateSetSha256: canonicalHash(candidateSet),
			effectivePlanSha256: canonicalHash(candidatePlan)
		};
	};
	const selectedCandidateByShard = new Map(
		shardSelections.map((selection) => [selection.shardId, readJson(selection.candidatePath)])
	);
	const exactCandidateSet = effectivePlan.rows.map((row) =>
		selectedCandidateByShard
			.get(row.shard)
			.challenges.find((entry) => entry.definition.id === row.id)
	);
	const exactCollectionValidation = validateCollectionCandidate({
		candidateSet: exactCandidateSet,
		effectivePlan
	});
	remapManifest.collectionValidationSha256 = canonicalHash(exactCollectionValidation);
	const updatedManifestCore = structuredClone(remapManifest);
	delete updatedManifestCore.manifestCoreSha256;
	remapManifest.manifestCoreSha256 = canonicalHash(updatedManifestCore);
	writeJson(path.join(remapRoot, 'manifest.json'), remapManifest);
	return {
		root,
		outputRoot,
		rootFiles,
		leafId,
		expected,
		options: {
			workspaceRoot: root,
			outputRoot,
			repairSha256,
			objectiveId: expected.expectedObjectiveId,
			executionId: expected.expectedExecutionId,
			firstReviewSha256: repairSha256,
			basePlan,
			effectivePlan,
			sourceSnapshotSha256: expected.expectedSourceSnapshotSha256,
			curriculumEvidenceSha256: expected.expectedCurriculumEvidenceSha256,
			curriculumCatalogSha256: expected.expectedCurriculumCatalogSha256,
			shardSelections,
			validateCollectionCandidate
		}
	};
}

function durableReceiptForCohort({ cohort, verifierInputSha256 }) {
	const manifest = cohort.remapManifests[0];
	const decision = { ...manifest.remap, accepted: true };
	const proposal = {
		challengeId: manifest.challengeId,
		field: manifest.remap.field,
		from: manifest.remap.from,
		to: manifest.remap.to,
		proposalSha256: hash('remap proposal'),
		basePlanSha256: cohort.manifest.basePlanSha256,
		effectivePlanSha256: cohort.manifest.effectivePlanSha256,
		curriculumEvidenceSha256: cohort.manifest.curriculumEvidenceSha256,
		targetCandidateSha256: manifest.candidateTargetSha256,
		batchCandidateSha256: manifest.candidateSha256,
		baseReviewSha256: manifest.firstReview?.summarySha256 ?? hash('base review'),
		manifestSha256: canonicalHash(manifest)
	};
	const packetSha256 = hash('packet');
	const remap = {
		challengeId: manifest.challengeId,
		field: manifest.remap.field,
		from: manifest.remap.from,
		to: manifest.remap.to,
		fromTitle: manifest.base.component.curriculumTitle,
		toTitle: manifest.effective.component.curriculumTitle,
		fromSourceTextSha256: hash('from source text'),
		toSourceTextSha256: hash('to source text'),
		ancestryChain: [
			{
				componentId: manifest.remap.from,
				title: manifest.base.component.curriculumTitle
			},
			{
				componentId: manifest.remap.to,
				title: manifest.effective.component.curriculumTitle
			}
		],
		proposalSha256: proposal.proposalSha256,
		targetCandidateSha256: proposal.targetCandidateSha256,
		batchCandidateSha256: proposal.batchCandidateSha256,
		baseReviewSha256: proposal.baseReviewSha256,
		manifestSha256: proposal.manifestSha256,
		assignmentId: manifest.shardId,
		assignmentSha256: hash('assignment'),
		packetSha256,
		resultSha256: hash('result'),
		decision,
		decisionSha256: canonicalHash(decision)
	};
	const core = {
		schemaVersion: 'science-challenge-curriculum-remap-durable-receipt/v1',
		basePlanSha256: cohort.manifest.basePlanSha256,
		effectivePlanSha256: cohort.manifest.effectivePlanSha256,
		curriculumEvidenceSha256: cohort.manifest.curriculumEvidenceSha256,
		curriculumCatalogSha256: cohort.manifest.curriculumCatalogSha256,
		effectiveCohortManifestSha256: canonicalHash(cohort.manifest),
		candidateCount: cohort.manifest.candidateCount,
		candidateSetSha256: cohort.candidateSetSha256,
		remapManifestSetSha256: cohort.manifest.remapManifestSetSha256,
		recoverySetSha256: cohort.manifest.recoverySetSha256,
		verifierInputSha256,
		packetManifestSha256: hash('packet manifest'),
		proposalSetSha256: canonicalHash([proposal]),
		decisionSetSha256: canonicalHash([decision]),
		packetSetSha256: canonicalHash([packetSha256]),
		remaps: [remap]
	};
	return { ...core, receiptSha256: canonicalHash(core) };
}

function acceptedContentVerification({ fixture, cohort, curriculumRemapDurableReceipt }) {
	const shardIds = [...new Set(fixture.options.effectivePlan.rows.map((row) => row.shard))];
	return {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'passed',
		planId: fixture.options.effectivePlan.planId,
		planSha256: canonicalHash(fixture.options.effectivePlan),
		basePlanSha256: canonicalHash(fixture.options.basePlan),
		effectivePlanSha256: canonicalHash(fixture.options.effectivePlan),
		candidateSetSha256: cohort.candidateSetSha256,
		assignmentCount: shardIds.length,
		reviewCount: fixture.options.effectivePlan.rows.length,
		acceptedCount: fixture.options.effectivePlan.rows.length,
		rejectedCount: 0,
		assignmentResults: shardIds.map((assignmentId) => ({
			assignmentId,
			status: 'passed'
		})),
		reviews: fixture.options.effectivePlan.rows.map((row) => ({
			id: row.id,
			accepted: true
		})),
		issues: [],
		curriculumRemapDurableReceipt,
		curriculumRemapDurableReceiptSha256: canonicalHash(curriculumRemapDurableReceipt)
	};
}

function batchForRows(rows, cohortVersion) {
	return {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: rows.map((row) => ({
			definition: { id: row.id, cohortVersion, difficulty: row.difficulty },
			grounding: { curriculumComponentId: row.curriculumComponentId }
		}))
	};
}

function passedValidation(candidate) {
	return {
		status: 'passed',
		issues: [],
		candidateSha256: canonicalHash(candidate)
	};
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

function componentTuple(row) {
	return {
		curriculumComponentId: row.curriculumComponentId,
		curriculumCode: row.curriculumCode,
		curriculumTitle: row.curriculumTitle,
		curriculumPageStart: row.curriculumPageStart,
		curriculumPageEnd: row.curriculumPageEnd,
		specificationId: row.specificationId,
		specificationSha256: row.specificationSha256
	};
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function hash(value) {
	return canonicalHash(String(value));
}
