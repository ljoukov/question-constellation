import assert from 'node:assert/strict';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SCHEMA } from './science-challenge-curriculum-remap-durable.mjs';
import {
	scienceChallengeEffectiveCohortManifestPath,
	stageScienceChallengeEffectiveCohort,
	stageScienceChallengeEffectiveCohortSuccessor
} from './science-challenge-effective-cohort.mjs';
import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	canonicalHash,
	sha256,
	stableStringify,
	validateGeneratedChallengeCollection
} from './science-challenge-release.mjs';
import {
	readScienceChallengeReleaseShortRecallUploadEvidence,
	validateScienceChallengeReleaseUploadEvidence
} from './science-challenge-release-upload.mjs';
import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA,
	publishScienceChallengeReviewRebaseEvidence
} from './science-challenge-review-rebase-evidence.mjs';
import { SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA } from './science-challenge-review-rebase.mjs';
import { buildPassedScienceChallengeShortRecallArtifactsForTest } from './science-challenge-short-recall-test-fixture.mjs';

test('archive-backed upload replay accepts an exact effective remap cohort after source cleanup', () => {
	const fixture = buildRemapFixture();
	try {
		assert.equal(existsSync(fixture.sourceRoot), false);
		const replay = validateFixture(fixture);
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));
		assert.equal(replay.candidateSetSha256, fixture.candidateSetSha256);
		assert.equal(
			replay.effectiveCohortReplay.manifest.basePlanSha256,
			canonicalHash(fixture.basePlan)
		);
		assert.equal(
			replay.effectiveCohortReplay.manifest.effectivePlanSha256,
			canonicalHash(fixture.effectivePlan)
		);
		assert.equal(replay.durableReceipt.remaps[0].decision.accepted, true);
	} finally {
		fixture.cleanup();
	}
});

test('archive-backed upload replay rejects a base-only or stale effective cohort', async (t) => {
	await t.test('base-only plan replay', () => {
		const fixture = buildRemapFixture();
		try {
			rewriteTrackedJson(fixture, 'plans/effective-plan.json', fixture.basePlan);
			fixture.release.release.effectivePlanSha256 = canonicalHash(fixture.basePlan);
			fixture.provenanceManifest.bindings.effectivePlanSha256 = canonicalHash(fixture.basePlan);
			fixture.contentReview.planSha256 = canonicalHash(fixture.basePlan);
			fixture.contentReview.effectivePlanSha256 = canonicalHash(fixture.basePlan);
			rebindContentReview(fixture);

			const replay = validateFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(
				replay.issues.join('\n'),
				/distinct archived base and effective plans|plan identity is stale/
			);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('stale selected candidate bytes', () => {
		const fixture = buildRemapFixture();
		try {
			const candidatePath = path.join(fixture.archiveRoot, fixture.cohortCandidateArchivePath);
			const candidate = readJson(candidatePath);
			candidate.challenges[0].definition.version = 'stale';
			writeJson(candidatePath, candidate);

			const replay = validateFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(
				replay.issues.join('\n'),
				/differs from its exact byte\/canonical binding|candidate.*stale/
			);
		} finally {
			fixture.cleanup();
		}
	});
});

test('archive-backed upload replay rejects a candidate set differing from the accepted release', () => {
	const fixture = buildRemapFixture();
	try {
		fixture.release.challenges[0].definition.version = 'different-accepted-candidate';
		const replay = validateFixture(fixture);
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /exact accepted candidate set/);
	} finally {
		fixture.cleanup();
	}
});

test('archive-backed upload replay rejects a coherently rebound remap from another repair', () => {
	const fixture = buildRemapFixture();
	try {
		rebindCoherentStaleEffectiveCohortRemap(fixture);
		const replay = validateFixture(fixture);
		assert.equal(replay.status, 'failed');
		assert.match(
			replay.issues.join('\n'),
			/selected remap.*repair|descendant-remap lineage is invalid/i
		);
	} finally {
		fixture.cleanup();
	}
});

test('archive-backed upload replay rejects a missing or source-rich durable receipt', async (t) => {
	await t.test('missing receipt', () => {
		const fixture = buildRemapFixture();
		try {
			fixture.provenanceManifest.trackedArtifacts =
				fixture.provenanceManifest.trackedArtifacts.filter(
					(record) => record.kind !== 'curriculum-remap-durable-receipt'
				);
			const replay = validateFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /durable receipt must have exactly one tracked/);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('source-rich receipt', () => {
		const fixture = buildRemapFixture();
		try {
			const receipt = structuredClone(fixture.receipt);
			receipt.remaps[0].ancestryChain[0].sourceText =
				'Source text must never enter durable upload evidence.';
			rebindReceipt(fixture, receipt);
			const replay = validateFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /sourceText is unknown|forbidden source-rich field/);
		} finally {
			fixture.cleanup();
		}
	});
});

test('archive-backed upload replay rejects false or missing remap decisions', async (t) => {
	await t.test('false decision', () => {
		const fixture = buildRemapFixture();
		try {
			const receipt = structuredClone(fixture.receipt);
			receipt.remaps[0].decision.accepted = false;
			receipt.remaps[0].decisionSha256 = canonicalHash(receipt.remaps[0].decision);
			receipt.decisionSetSha256 = canonicalHash([receipt.remaps[0].decision]);
			rebindReceipt(fixture, receipt);
			const replay = validateFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /one exact accepted durable decision/);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('missing decision', () => {
		const fixture = buildRemapFixture();
		try {
			const receipt = structuredClone(fixture.receipt);
			delete receipt.remaps[0].decision;
			delete receipt.remaps[0].decisionSha256;
			receipt.decisionSetSha256 = canonicalHash([undefined]);
			rebindReceipt(fixture, receipt);
			const replay = validateFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(
				replay.issues.join('\n'),
				/decision is required|decision must be an object|one exact accepted durable decision/
			);
		} finally {
			fixture.cleanup();
		}
	});
});

test('archive-backed upload replay remains compatible with an ordinary unchanged cohort', () => {
	const fixture = buildOrdinaryFixture();
	try {
		const replay = validateFixture(fixture);
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));
		assert.equal(replay.effectiveCohortReplay, null);
		assert.equal(replay.durableReceipt, null);
	} finally {
		fixture.cleanup();
	}
});

test('archive-backed upload replay accepts the exact V0/R0/B0/V1/S1/V2 review-rebase successor', () => {
	const fixture = buildReviewRebaseReleaseFixture();
	try {
		const replay = validateFixture(fixture);
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));
		assert.equal(replay.hasEffectiveCohort, true);
		assert.equal(replay.hasTypedRemap, false);
		assert.equal(replay.hasDifficultyAdjustment, false);
		assert.equal(replay.hasReviewRebaseAncestry, true);
		assert.equal(replay.candidateSetSha256, fixture.successor.candidateSetSha256);
		assert.equal(
			canonicalHash(replay.effectiveCohortReplay.parentChain),
			fixture.release.release.contentParentLineageSha256
		);
		assert.equal(replay.reviewRebaseReplay.status, 'passed');
	} finally {
		fixture.cleanup();
	}
});

test('archive-backed upload replay follows inherited review-rebase ancestry through S2 and requires terminal V3', () => {
	const fixture = buildReviewRebaseReleaseFixture({ successorDepth: 2 });
	try {
		const replay = validateFixture(fixture);
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));
		assert.equal(replay.effectiveCohortReplay.predecessor.status, 'passed');
		assert.equal(replay.effectiveCohortReplay.predecessor.manifest.parent.kind, 'review-rebase');
		assert.deepEqual(
			replay.effectiveCohortReplay.manifest.parentChain,
			replay.effectiveCohortReplay.predecessor.manifest.parentChain
		);

		const staleReview = structuredClone(fixture.contentReview);
		staleReview.effectiveCohortManifestSha256 = canonicalHash(fixture.rootSuccessor.manifest);
		staleReview.candidateSetSha256 = fixture.rootSuccessor.candidateSetSha256;
		rewriteTrackedJson(fixture, 'reviews/content/summary.json', staleReview);
		fixture.contentReview = staleReview;
		const staleVerificationSha256 = canonicalHash(staleReview);
		fixture.release.release.contentVerificationSha256 = staleVerificationSha256;
		fixture.provenanceManifest.bindings.contentVerificationSha256 = staleVerificationSha256;
		rebindParentChainIndexReference(
			fixture,
			'contentVerificationRef',
			artifactReference(
				fixture.provenanceManifest.trackedArtifacts.find(
					(record) => record.path === 'reviews/content/summary.json'
				)
			)
		);
		const staleReplay = validateFixture(fixture);
		assert.equal(staleReplay.status, 'failed');
		assert.match(
			staleReplay.issues.join('\n'),
			/exact accepted candidate set|terminal verification/i
		);
	} finally {
		fixture.cleanup();
	}
});

test('archive-backed review-rebase upload rejects direct B0 and missing/tampered chain generations', async (t) => {
	await t.test('direct B0 release', () => {
		const fixture = buildReviewRebaseReleaseFixture();
		try {
			const b0ById = new Map(
				[...fixture.reviewRebaseReplay.candidateBatches.values()].flatMap((batch) =>
					batch.challenges.map((candidate) => [candidate.definition.id, candidate])
				)
			);
			fixture.release.challenges = fixture.effectivePlan.rows.map((row) => b0ById.get(row.id));
			const directB0Sha256 = canonicalHash(fixture.release.challenges);
			fixture.contentReview.candidateSetSha256 = directB0Sha256;
			rewriteTrackedJson(fixture, 'reviews/content/summary.json', fixture.contentReview);
			const contentVerificationSha256 = canonicalHash(fixture.contentReview);
			fixture.release.release.contentVerificationSha256 = contentVerificationSha256;
			fixture.provenanceManifest.bindings.contentVerificationSha256 = contentVerificationSha256;
			const contentReference = artifactReference(
				fixture.provenanceManifest.trackedArtifacts.find(
					(record) => record.path === 'reviews/content/summary.json'
				)
			);
			rebindParentChainIndexReference(fixture, 'contentVerificationRef', contentReference);
			const replay = validateFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(replay.issues.join('\n'), /Direct review-rebase B0 candidates/);
		} finally {
			fixture.cleanup();
		}
	});

	for (const [label, referenceField] of [
		['V0', 'parentVerificationRef'],
		['R0', 'parentRepairRef'],
		['B0', 'reviewRebaseManifestRef'],
		['V1', 'firstVerificationRef'],
		['S1', 'effectiveCohortManifestRef'],
		['target', 'targetCandidateRef'],
		['V2', 'contentVerificationRef']
	]) {
		await t.test(`missing/tampered ${label}`, () => {
			const fixture = buildReviewRebaseReleaseFixture();
			try {
				const reference =
					referenceField === 'targetCandidateRef'
						? fixture.targetCandidateRef
						: fixture.parentChainIndex[referenceField];
				const artifactPath = path.join(fixture.archiveRoot, reference.path);
				const originalBytes = readFileSync(artifactPath);

				const value = JSON.parse(originalBytes.toString('utf8'));
				value.__tamperedReviewRebaseUploadEvidence = label;
				writeJson(artifactPath, value);
				const tamperedReplay = validateFixture(fixture);
				assert.equal(tamperedReplay.status, 'failed');
				assert.match(
					tamperedReplay.issues.join('\n'),
					/differs from its tracked byte\/canonical binding|differs from its exact byte\/canonical binding|replay|stale/i
				);

				writeFileSync(artifactPath, originalBytes);
				rmSync(artifactPath);
				const missingReplay = validateFixture(fixture);
				assert.equal(missingReplay.status, 'failed');
				assert.match(
					missingReplay.issues.join('\n'),
					/missing|regular file|does not exist|replay|required/i
				);
			} finally {
				fixture.cleanup();
			}
		});
	}
});

test('a changed plan without typed recovery or review-rebase ancestry is not inferred to be a remap', () => {
	const fixture = buildOrdinaryFixture();
	try {
		const changedPlan = structuredClone(fixture.release);
		const effectivePlan = readJson(path.join(fixture.archiveRoot, 'plans/effective-plan.json'));
		effectivePlan.rows[0].difficulty = 'stretch';
		rewriteTrackedJson(fixture, 'plans/effective-plan.json', effectivePlan);
		changedPlan.release.effectivePlanSha256 = canonicalHash(effectivePlan);
		fixture.release = changedPlan;
		fixture.provenanceManifest.bindings.effectivePlanSha256 = canonicalHash(effectivePlan);
		fixture.contentReview.planSha256 = canonicalHash(effectivePlan);
		fixture.contentReview.effectivePlanSha256 = canonicalHash(effectivePlan);
		rebindContentReview(fixture);
		const replay = validateFixture(fixture);
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /changed effective plan requires typed remap/i);
		assert.doesNotMatch(
			replay.issues.join('\n'),
			/Accepted remap release requires release\.curriculumRemap/
		);
	} finally {
		fixture.cleanup();
	}
});

test('release upload replay accepts exact 408-row short-recall sibling evidence', () => {
	const fixture = buildShortRecallUploadFixture();
	try {
		const replay = validateShortRecallFixture(fixture);
		assert.equal(replay.status, 'passed', replay.issues.join('\n'));
		assert.equal(replay.candidateSet.rows.length, 408);
		assert.equal(replay.candidateSet.entries, fixture.release.challenges);
		assert.equal(replay.bundleSha256, fixture.release.release.shortRecallBundleSha256);
		assert.equal(replay.reviewSha256, fixture.release.release.shortRecallReviewSha256);
		assert.equal(
			replay.authoringEvidenceSha256,
			fixture.release.release.shortRecallAuthoringEvidenceSha256
		);
	} finally {
		fixture.cleanup();
	}
});

test('release upload replay rejects every missing short-recall sibling', async (t) => {
	for (const [fileName, expectedIssue] of [
		['short-recall-prompts.json', /Short-recall prompt bundle is missing/],
		['short-recall-review-evidence.json', /Short-recall review evidence is missing/],
		['short-recall-authoring-evidence.json', /Short-recall authoring evidence is missing/]
	]) {
		await t.test(fileName, () => {
			const fixture = buildShortRecallUploadFixture();
			try {
				rmSync(path.join(fixture.releaseRoot, fileName));
				const replay = validateShortRecallFixture(fixture);
				assert.equal(replay.status, 'failed');
				assert.match(replay.issues.join('\n'), expectedIssue);
			} finally {
				fixture.cleanup();
			}
		});
	}
});

test('release upload replay rejects every tampered short-recall sibling', async (t) => {
	await t.test('short-recall-prompts.json', () => {
		const fixture = buildShortRecallUploadFixture();
		try {
			const prompts = readJson(fixture.promptPath);
			prompts[0].stem = 'Tampered evidence now points to the ___.';
			writeJson(fixture.promptPath, prompts);
			const replay = validateShortRecallFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(
				replay.issues.join('\n'),
				/prompt bundle differs from release\.shortRecallBundleSha256/
			);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('short-recall-review-evidence.json', () => {
		const fixture = buildShortRecallUploadFixture();
		try {
			const reviewEvidence = readJson(fixture.reviewPath);
			reviewEvidence.createdAt = '2026-07-24T01:00:00.000Z';
			writeJson(fixture.reviewPath, reviewEvidence);
			const replay = validateShortRecallFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(
				replay.issues.join('\n'),
				/review evidence differs from release\.shortRecallReviewSha256/
			);
		} finally {
			fixture.cleanup();
		}
	});

	await t.test('short-recall-authoring-evidence.json', () => {
		const fixture = buildShortRecallUploadFixture();
		try {
			const authoringEvidence = readJson(fixture.authoringPath);
			authoringEvidence.createdAt = '2026-07-24T01:00:00.000Z';
			writeJson(fixture.authoringPath, authoringEvidence);
			const replay = validateShortRecallFixture(fixture);
			assert.equal(replay.status, 'failed');
			assert.match(
				replay.issues.join('\n'),
				/review evidence does not bind the exact sibling authoring evidence/
			);
			assert.match(
				replay.issues.join('\n'),
				/authoring evidence differs from release\.shortRecallAuthoringEvidenceSha256/
			);
		} finally {
			fixture.cleanup();
		}
	});
});

function buildRemapFixture() {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-release-upload-remap-'));
	const sourceRoot = path.join(root, 'source-generation');
	const archiveRoot = path.join(root, 'release', 'provenance');
	mkdirSync(sourceRoot, { recursive: true });
	mkdirSync(archiveRoot, { recursive: true });

	const parentId = 'aqa-biology:cell-transport';
	const leafId = 'aqa-biology:cell-transport:osmosis';
	const specificationSha256 = hash('specification');
	const rows = Array.from({ length: 408 }, (_, index) => ({
		id: `biology-challenge-${String(index + 1).padStart(3, '0')}`,
		shard: `science-${String(Math.floor(index / 8) + 1).padStart(3, '0')}`,
		curriculumComponentId: index === 0 ? parentId : `aqa-biology:component-${index + 1}`,
		curriculumCode: index === 0 ? '4.1.3' : `4.${index + 1}`,
		curriculumTitle: index === 0 ? 'Transport in cells' : `Component ${index + 1}`,
		curriculumPageStart: index + 1,
		curriculumPageEnd: index + 1,
		specificationId: 'aqa-biology',
		specificationSha256
	}));
	const row = rows[0];
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-upload-fixture-v1',
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
	const remapRows = effectivePlan.rows.filter((planRow) => planRow.shard === row.shard);
	const priorCandidate = batchForRows(
		basePlan.rows.filter((planRow) => planRow.shard === row.shard)
	);
	const candidate = batchForRows(remapRows);
	const candidateValidation = {
		status: 'review-pending',
		issues: ['fresh full review required'],
		candidateSha256: canonicalHash(candidate)
	};
	const repairSha256 = hash('repair review');
	const remapRoot = path.join(
		sourceRoot,
		'shards',
		row.shard,
		`verification-repair-${repairSha256.slice(0, 12)}-descendant-remap`
	);
	const candidateByShard = new Map([[row.shard, candidate]]);
	const shardSelections = [
		{
			shardId: row.shard,
			disposition: 'descendant-remap',
			candidatePath: path.join(remapRoot, 'candidate.json'),
			validationPath: path.join(remapRoot, 'validation.json'),
			candidateSha256: canonicalHash(candidate),
			validationSha256: canonicalHash(candidateValidation),
			remapManifestPath: path.join(remapRoot, 'manifest.json'),
			priorCandidatePath: path.join(remapRoot, 'prior-candidate.json')
		}
	];
	for (const shardId of [...new Set(effectivePlan.rows.map((planRow) => planRow.shard))].slice(1)) {
		const fallbackCandidate = batchForRows(
			effectivePlan.rows.filter((planRow) => planRow.shard === shardId)
		);
		const fallbackValidation = {
			status: 'passed',
			issues: [],
			candidateSha256: canonicalHash(fallbackCandidate)
		};
		const shardRoot = path.join(sourceRoot, 'shards', shardId);
		const candidatePath = path.join(shardRoot, 'candidate.json');
		const validationPath = path.join(shardRoot, 'validation.json');
		writeJson(candidatePath, fallbackCandidate);
		writeJson(validationPath, fallbackValidation);
		candidateByShard.set(shardId, fallbackCandidate);
		shardSelections.push({
			shardId,
			disposition: 'unchanged-verified-fallback',
			candidatePath,
			validationPath,
			candidateSha256: canonicalHash(fallbackCandidate),
			validationSha256: canonicalHash(fallbackValidation),
			firstReviewCandidateSha256: canonicalHash(fallbackCandidate),
			firstReviewValidationSha256: canonicalHash(fallbackValidation)
		});
	}
	const candidateById = new Map(
		[...candidateByShard.values()].flatMap((batch) =>
			batch.challenges.map((entry) => [entry.definition.id, entry])
		)
	);
	const candidateSet = effectivePlan.rows.map((planRow) => candidateById.get(planRow.id));
	const remap = {
		challengeId: row.id,
		field: 'grounding.curriculumComponentId',
		from: parentId,
		to: leafId
	};
	const inverseRemap = {
		challengeId: row.id,
		field: remap.field,
		from: leafId,
		to: parentId
	};
	const baseComponent = componentTuple(basePlan.rows[0]);
	const effectiveComponent = componentTuple(effectivePlan.rows[0]);
	const collectionValidation = validateCollectionCandidate({
		candidateSet,
		effectivePlan
	});
	const remapManifestCore = {
		schemaVersion: 'science-challenge-verifier-directed-descendant-remap/v1',
		disposition: 'deterministic-verifier-directed-descendant-remap',
		shardId: row.shard,
		repairSha256,
		challengeId: row.id,
		field: remap.field,
		base: {
			planSha256: canonicalHash(basePlan),
			planRowIndex: 0,
			planRowSha256: canonicalHash(basePlan.rows[0]),
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
		firstReview: {
			summarySha256: repairSha256
		},
		sourceAttempt: { attempt: 4, status: 'failed' },
		attemptBudget: {
			maxAttempts: 4,
			exhausted: true,
			selectedAttempt: 4,
			attempts: [1, 2, 3, 4].map((attempt) => ({
				attempt,
				status: 'failed',
				invalidated: false
			}))
		},
		priorCandidateSha256: canonicalHash(priorCandidate),
		candidateSha256: canonicalHash(candidate),
		remap,
		remapSha256: canonicalHash(remap),
		inverseRemap,
		inverseRemapSha256: canonicalHash(inverseRemap),
		priorTargetSha256: canonicalHash(priorCandidate.challenges[0]),
		candidateTargetSha256: canonicalHash(candidate.challenges[0]),
		inverseTargetSha256: canonicalHash(priorCandidate.challenges[0]),
		collectionValidationSha256: canonicalHash(collectionValidation)
	};
	const remapManifest = {
		...remapManifestCore,
		manifestCoreSha256: canonicalHash(remapManifestCore)
	};
	writeJson(path.join(remapRoot, 'manifest.json'), remapManifest);
	writeJson(path.join(remapRoot, 'candidate.json'), candidate);
	writeJson(path.join(remapRoot, 'validation.json'), candidateValidation);
	writeJson(path.join(remapRoot, 'prior-candidate.json'), priorCandidate);

	const sourceSnapshotSha256 = hash('source snapshot');
	const curriculumEvidenceSha256 = hash('curriculum evidence');
	const curriculumCatalogSha256 = hash('curriculum catalog');
	const staged = stageScienceChallengeEffectiveCohort({
		workspaceRoot: root,
		outputRoot: sourceRoot,
		repairSha256,
		objectiveId: hash('objective'),
		executionId: hash('execution'),
		firstReviewSha256: repairSha256,
		basePlan,
		effectivePlan,
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		curriculumCatalogSha256,
		shardSelections,
		validateCollectionCandidate
	});
	assert.equal(staged.status, 'passed', staged.issues.join('\n'));

	const cohortArchiveRoot = path.join(archiveRoot, 'content', 'effective-cohort');
	cpSync(sourceRoot, cohortArchiveRoot, { recursive: true });
	const stagedManifestRelative = path.relative(
		sourceRoot,
		scienceChallengeEffectiveCohortManifestPath({
			outputRoot: sourceRoot,
			repairSha256
		})
	);
	const stagedManifestArchivePath = portable(
		path.join('content', 'effective-cohort', stagedManifestRelative)
	);
	const cohortCandidateArchivePath = portable(
		path.join(
			'content',
			'effective-cohort',
			path.relative(sourceRoot, path.join(remapRoot, 'candidate.json'))
		)
	);
	rmSync(sourceRoot, { recursive: true, force: true });

	writeJson(path.join(archiveRoot, 'plans/base-plan.json'), basePlan);
	writeJson(path.join(archiveRoot, 'plans/effective-plan.json'), effectivePlan);
	const sourceHashIndex = {
		schemaVersion: 'science-challenge-source-hash-index/v1',
		sourceSnapshotSha256,
		sourceDocumentCount: 0,
		questionCount: effectivePlan.rows.length,
		sourceDocuments: [],
		questions: effectivePlan.rows.map((planRow, index) => ({
			id: `source-question-${index + 1}`,
			sourceDocumentId: 'source-document',
			contentSha256: hash(`source question ${planRow.id}`)
		}))
	};
	const curriculumHashIndex = {
		schemaVersion: 'science-challenge-curriculum-hash-index/v1',
		curriculumEvidenceSha256,
		componentCount: effectivePlan.rows.length,
		components: effectivePlan.rows.map((planRow) => ({
			componentId: planRow.curriculumComponentId,
			specificationId: planRow.specificationId,
			specificationSha256,
			contentSha256: hash(`curriculum component ${planRow.curriculumComponentId}`)
		}))
	};
	writeJson(path.join(archiveRoot, 'indices/source-hashes.json'), sourceHashIndex);
	writeJson(path.join(archiveRoot, 'indices/curriculum-hashes.json'), curriculumHashIndex);

	const candidateSetSha256 = canonicalHash(candidateSet);
	const effectiveCohortManifestSha256 = canonicalHash(staged.manifest);
	const receipt = durableReceipt({
		basePlan,
		effectivePlan,
		curriculumEvidenceSha256,
		curriculumCatalogSha256,
		effectiveCohortManifestSha256,
		candidateSetSha256,
		recoverySetSha256: staged.manifest.recoverySetSha256,
		remapManifest,
		remapCandidate: candidate,
		candidateSet
	});
	const receiptSha256 = canonicalHash(receipt);
	const receiptArchivePath = 'content/curriculum-remap/durable-receipt.json';
	writeJson(path.join(archiveRoot, receiptArchivePath), receipt);
	const manifestRecord = trackedRecord(
		archiveRoot,
		'effective-cohort-manifest',
		stagedManifestArchivePath
	);
	const receiptRecord = trackedRecord(
		archiveRoot,
		'curriculum-remap-durable-receipt',
		receiptArchivePath
	);
	const effectiveCohortIndex = {
		schemaVersion: 'science-challenge-effective-cohort-provenance-index/v1',
		referenceRoot: 'content/effective-cohort',
		manifestPath: portable(stagedManifestRelative),
		manifestSha256: effectiveCohortManifestSha256,
		manifestFileSha256: manifestRecord.sha256,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		candidateCount: candidateSet.length,
		candidateSetSha256,
		remapManifestSetSha256: staged.manifest.remapManifestSetSha256,
		manifestRef: artifactReference(manifestRecord),
		artifactCount: 0,
		artifactRefs: [],
		durableReceiptRef: artifactReference(receiptRecord),
		durableReceiptSha256: receiptSha256
	};
	writeJson(path.join(archiveRoot, 'content/effective-cohort-index.json'), effectiveCohortIndex);
	const contentReview = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: effectivePlan.planId,
		planSha256: canonicalHash(effectivePlan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		candidateSetSha256,
		reviewCount: candidateSet.length,
		curriculumRemapDurableReceipt: receipt,
		curriculumRemapDurableReceiptSha256: receiptSha256
	};
	writeJson(path.join(archiveRoot, 'reviews/content/summary.json'), contentReview);
	const release = {
		release: {
			planSha256: canonicalHash(basePlan),
			basePlanSha256: canonicalHash(basePlan),
			effectivePlanSha256: canonicalHash(effectivePlan),
			sourceSnapshotSha256,
			curriculumEvidenceSha256,
			curriculumCatalogSha256,
			effectiveCohortManifestSha256,
			effectiveCohortCandidateSetSha256: candidateSetSha256,
			curriculumRemapDurableReceiptSha256: receiptSha256,
			curriculumRemapVerifierInputSha256: receipt.verifierInputSha256,
			curriculumRemapDecisionSetSha256: receipt.decisionSetSha256,
			descendantRemapManifestSetSha256: receipt.remapManifestSetSha256,
			contentVerificationSha256: canonicalHash(contentReview)
		},
		challenges: candidateSet
	};
	const provenanceManifest = {
		bindings: {
			basePlanSha256: canonicalHash(basePlan),
			effectivePlanSha256: canonicalHash(effectivePlan),
			effectiveCohortManifestSha256,
			effectiveCohortCandidateSetSha256: candidateSetSha256,
			curriculumRemapDurableReceiptSha256: receiptSha256,
			curriculumRemapVerifierInputSha256: receipt.verifierInputSha256,
			curriculumRemapDecisionSetSha256: receipt.decisionSetSha256,
			descendantRemapManifestSetSha256: receipt.remapManifestSetSha256,
			contentVerificationSha256: canonicalHash(contentReview)
		},
		trackedArtifacts: [
			trackedRecord(archiveRoot, 'base-plan', 'plans/base-plan.json'),
			trackedRecord(archiveRoot, 'effective-plan', 'plans/effective-plan.json'),
			trackedRecord(archiveRoot, 'source-hash-index', 'indices/source-hashes.json'),
			trackedRecord(archiveRoot, 'curriculum-hash-index', 'indices/curriculum-hashes.json'),
			trackedRecord(archiveRoot, 'content-review-summary', 'reviews/content/summary.json'),
			manifestRecord,
			receiptRecord,
			trackedRecord(archiveRoot, 'effective-cohort-index', 'content/effective-cohort-index.json')
		]
	};
	return {
		root,
		sourceRoot,
		archiveRoot,
		basePlan,
		effectivePlan,
		contentReview,
		receipt,
		effectiveCohortIndex,
		release,
		provenanceManifest,
		candidateSetSha256,
		cohortCandidateArchivePath,
		cleanup: () => rmSync(root, { recursive: true, force: true })
	};
}

function buildOrdinaryFixture() {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-release-upload-ordinary-'));
	const archiveRoot = path.join(root, 'release', 'provenance');
	mkdirSync(archiveRoot, { recursive: true });
	const plan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-upload-ordinary-v1',
		rows: [{ id: 'ordinary-challenge', shard: 'science-001' }]
	};
	const challenges = [{ definition: { id: 'ordinary-challenge' } }];
	const candidateSetSha256 = canonicalHash(challenges);
	const sourceSnapshotSha256 = hash('ordinary source');
	const curriculumEvidenceSha256 = hash('ordinary curriculum');
	const contentReview = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		candidateSetSha256,
		reviewCount: 1
	};
	const sourceHashIndex = {
		schemaVersion: 'science-challenge-source-hash-index/v1',
		sourceSnapshotSha256,
		sourceDocumentCount: 0,
		questionCount: 0,
		sourceDocuments: [],
		questions: []
	};
	const curriculumHashIndex = {
		schemaVersion: 'science-challenge-curriculum-hash-index/v1',
		curriculumEvidenceSha256,
		componentCount: 0,
		components: []
	};
	writeJson(path.join(archiveRoot, 'plans/base-plan.json'), plan);
	writeJson(path.join(archiveRoot, 'plans/effective-plan.json'), plan);
	writeJson(path.join(archiveRoot, 'reviews/content/summary.json'), contentReview);
	writeJson(path.join(archiveRoot, 'indices/source-hashes.json'), sourceHashIndex);
	writeJson(path.join(archiveRoot, 'indices/curriculum-hashes.json'), curriculumHashIndex);
	const release = {
		release: {
			planSha256: canonicalHash(plan),
			sourceSnapshotSha256,
			curriculumEvidenceSha256,
			contentVerificationSha256: canonicalHash(contentReview)
		},
		challenges
	};
	const provenanceManifest = {
		bindings: {
			basePlanSha256: canonicalHash(plan),
			effectivePlanSha256: canonicalHash(plan),
			contentVerificationSha256: canonicalHash(contentReview)
		},
		trackedArtifacts: [
			trackedRecord(archiveRoot, 'base-plan', 'plans/base-plan.json'),
			trackedRecord(archiveRoot, 'effective-plan', 'plans/effective-plan.json'),
			trackedRecord(archiveRoot, 'source-hash-index', 'indices/source-hashes.json'),
			trackedRecord(archiveRoot, 'curriculum-hash-index', 'indices/curriculum-hashes.json'),
			trackedRecord(archiveRoot, 'content-review-summary', 'reviews/content/summary.json')
		]
	};
	return {
		root,
		archiveRoot,
		contentReview,
		release,
		provenanceManifest,
		cleanup: () => rmSync(root, { recursive: true, force: true })
	};
}

function buildReviewRebaseReleaseFixture({ successorDepth = 1 } = {}) {
	assert.ok(
		successorDepth === 1 || successorDepth === 2,
		'review-rebase upload fixture supports S1 or S2'
	);
	const root = realpathSync(
		mkdtempSync(path.join(os.tmpdir(), 'science-release-upload-review-rebase-'))
	);
	const archiveRoot = path.join(root, 'release', 'provenance');
	const parentRepositoryRoot = path.join(archiveRoot, 'content', 'parent-chain', 'repository');
	const effectiveCohortRoot = path.join(archiveRoot, 'content', 'effective-cohort');
	mkdirSync(parentRepositoryRoot, { recursive: true });
	mkdirSync(effectiveCohortRoot, { recursive: true });
	const rebaseFixture = writeReviewRebaseRepositoryFixture(parentRepositoryRoot);
	const reviewRebaseReplay = publishScienceChallengeReviewRebaseEvidence(rebaseFixture.options);
	assert.equal(reviewRebaseReplay.status, 'passed', reviewRebaseReplay.issues?.join('\n'));

	const effectivePlan = reviewRebaseReplay.plan;
	const basePlan = rebaseFixture.basePlan;
	const shardIds = [...new Set(effectivePlan.rows.map((row) => row.shard))];
	const reviews = effectivePlan.rows.map((row) => fullContentReviewRow(row.id));
	reviews[0] = {
		...reviews[0],
		precisionAndSpecificity: false,
		accepted: false,
		issues: [
			{
				field: 'definition.previewQuestion',
				category: 'precision',
				evidence: 'The exact comparison is ambiguous.',
				repair: 'Name the exact comparison without changing frozen siblings.'
			}
		]
	};
	const collectionRemediationTargetIds = [
		...new Set(
			reviewRebaseReplay.coreManifest.collectionRemediations.map(
				(remediation) => remediation.preferredChallengeId
			)
		)
	].sort();
	const reviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planId: effectivePlan.planId,
		planSha256: canonicalHash(effectivePlan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		sourceSnapshotSha256: reviewRebaseReplay.coreManifest.sourceSnapshotSha256,
		curriculumEvidenceSha256: reviewRebaseReplay.coreManifest.curriculumEvidenceSha256,
		candidateSetSha256: reviewRebaseReplay.coreManifest.candidateSetSha256,
		reviewRebaseManifestSha256: canonicalHash(reviewRebaseReplay.manifest),
		reviewRebaseId: reviewRebaseReplay.coreManifest.rebaseId,
		reviewRebaseCandidateSetSha256: reviewRebaseReplay.coreManifest.candidateSetSha256,
		reviewRebaseCollectionValidationSha256:
			reviewRebaseReplay.coreManifest.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256:
			reviewRebaseReplay.coreManifest.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediations: reviewRebaseReplay.coreManifest.collectionRemediations,
		reviewRebaseCollectionRemediationTargetIds: collectionRemediationTargetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(collectionRemediationTargetIds),
		assignmentCount: shardIds.length,
		reviewCount: effectivePlan.rows.length,
		acceptedCount: effectivePlan.rows.length - 1,
		rejectedCount: 1,
		assignmentResults: shardIds.map((assignmentId) => ({
			assignmentId,
			status: 'passed'
		})),
		reviews,
		issues: []
	};
	const mutableIds = [effectivePlan.rows[0].id, ...collectionRemediationTargetIds].sort();
	const mutableIdSet = new Set(mutableIds);
	const secondCycleTargetId = effectivePlan.rows[1].id;
	const repairSha256 = canonicalHash(reviewSummary);
	const proposals = [];
	for (const shardId of [
		...new Set(effectivePlan.rows.filter((row) => mutableIdSet.has(row.id)).map((row) => row.shard))
	]) {
		const priorCandidate = reviewRebaseReplay.candidateBatches.get(shardId);
		const priorValidation = reviewRebaseReplay.outputValidations.get(shardId);
		const candidate = structuredClone(priorCandidate);
		for (const entry of candidate.challenges) {
			if (mutableIdSet.has(entry.definition.id)) {
				entry.definition.cohortVersion = 'review-rebase-repaired';
			}
		}
		const validation = {
			status: 'passed',
			issues: [],
			candidateSha256: canonicalHash(candidate)
		};
		const proposalRoot = path.join(
			effectiveCohortRoot,
			'shards',
			shardId,
			`verification-repair-${repairSha256.slice(0, 12)}-attempt-01`
		);
		const candidatePath = path.join(proposalRoot, 'candidate.json');
		const validationPath = path.join(proposalRoot, 'validation.json');
		writeJson(candidatePath, candidate);
		writeJson(validationPath, validation);
		proposals.push({
			shardId,
			attempt: 1,
			candidatePath,
			validationPath,
			candidateSha256: canonicalHash(candidate),
			validationSha256: canonicalHash(validation),
			expectedTargetCandidateSha256: canonicalHash(priorCandidate),
			expectedTargetValidationSha256: canonicalHash(priorValidation)
		});
	}
	const validateSuccessorCollection = ({ candidateSet, effectivePlan: candidatePlan }) => {
		const issues = [];
		for (const entry of candidateSet) {
			const challengeId = entry?.definition?.id;
			const acceptedVersions =
				challengeId === secondCycleTargetId
					? ['review-rebase-b0', 'review-rebase-second-cycle-repaired']
					: [mutableIdSet.has(challengeId) ? 'review-rebase-repaired' : 'review-rebase-b0'];
			if (!acceptedVersions.includes(entry?.definition?.cohortVersion)) {
				issues.push(`${entry?.definition?.id ?? 'unknown'} has stale successor bytes.`);
			}
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
	const rootSuccessor = stageScienceChallengeEffectiveCohortSuccessor({
		workspaceRoot: archiveRoot,
		outputRoot: effectiveCohortRoot,
		repairSha256,
		objectiveId: hash('review-rebase successor objective'),
		executionId: hash('review-rebase successor execution'),
		reviewSummary,
		reviewRebaseEvidence: reviewRebaseReplay,
		verificationRepairAuthority: null,
		proposals,
		validateCollectionCandidate: validateSuccessorCollection
	});
	assert.equal(rootSuccessor.status, 'passed', rootSuccessor.issues.join('\n'));
	let successor = rootSuccessor;
	if (successorDepth === 2) {
		const secondReviews = effectivePlan.rows.map((row) => fullContentReviewRow(row.id));
		const secondReviewIndex = effectivePlan.rows.findIndex((row) => row.id === secondCycleTargetId);
		secondReviews[secondReviewIndex] = {
			...secondReviews[secondReviewIndex],
			precisionAndSpecificity: false,
			accepted: false,
			issues: [
				{
					field: 'definition.previewQuestion',
					category: 'precision',
					evidence: 'The repaired successor still leaves one comparison ambiguous.',
					repair: 'Name that comparison while preserving every accepted candidate.'
				}
			]
		};
		const secondReviewSummary = {
			schemaVersion: 'science-challenge-independent-verification-summary/v1',
			status: 'failed',
			planId: effectivePlan.planId,
			planSha256: canonicalHash(effectivePlan),
			basePlanSha256: canonicalHash(basePlan),
			effectivePlanSha256: canonicalHash(effectivePlan),
			sourceSnapshotSha256: rootSuccessor.manifest.sourceSnapshotSha256,
			curriculumEvidenceSha256: rootSuccessor.manifest.curriculumEvidenceSha256,
			candidateSetSha256: rootSuccessor.candidateSetSha256,
			effectiveCohortManifestSha256: canonicalHash(rootSuccessor.manifest),
			recoverySetSha256: rootSuccessor.manifest.recoverySetSha256,
			assignmentCount: shardIds.length,
			reviewCount: effectivePlan.rows.length,
			acceptedCount: effectivePlan.rows.length - 1,
			rejectedCount: 1,
			assignmentResults: shardIds.map((assignmentId) => ({
				assignmentId,
				status: 'passed'
			})),
			reviews: secondReviews,
			issues: []
		};
		const secondShardId = effectivePlan.rows[secondReviewIndex].shard;
		const priorCandidate = rootSuccessor.candidateBatches.get(secondShardId);
		const secondCandidate = structuredClone(priorCandidate);
		secondCandidate.challenges.find(
			(entry) => entry.definition.id === secondCycleTargetId
		).definition.cohortVersion = 'review-rebase-second-cycle-repaired';
		const secondValidation = {
			status: 'passed',
			issues: [],
			candidateSha256: canonicalHash(secondCandidate)
		};
		const secondProposalRoot = path.join(
			effectiveCohortRoot,
			'second-cycle-proposals',
			secondShardId
		);
		const secondCandidatePath = path.join(secondProposalRoot, 'candidate.json');
		const secondValidationPath = path.join(secondProposalRoot, 'validation.json');
		writeJson(secondCandidatePath, secondCandidate);
		writeJson(secondValidationPath, secondValidation);
		successor = stageScienceChallengeEffectiveCohortSuccessor({
			workspaceRoot: archiveRoot,
			outputRoot: effectiveCohortRoot,
			repairSha256: canonicalHash(secondReviewSummary),
			objectiveId: hash('review-rebase second successor objective'),
			executionId: hash('review-rebase second successor execution'),
			reviewSummary: secondReviewSummary,
			reviewEffectiveCohortManifestSha256: canonicalHash(rootSuccessor.manifest),
			predecessor: rootSuccessor,
			reviewRebaseEvidence: reviewRebaseReplay,
			proposals: [
				{
					shardId: secondShardId,
					attempt: 1,
					candidatePath: secondCandidatePath,
					validationPath: secondValidationPath,
					candidateSha256: canonicalHash(secondCandidate),
					validationSha256: canonicalHash(secondValidation)
				}
			],
			validateCollectionCandidate: validateSuccessorCollection
		});
		assert.equal(successor.status, 'passed', successor.issues.join('\n'));
	}

	const contentReview = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'passed',
		planId: effectivePlan.planId,
		planSha256: canonicalHash(effectivePlan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		sourceSnapshotSha256: successor.manifest.sourceSnapshotSha256,
		curriculumEvidenceSha256: successor.manifest.curriculumEvidenceSha256,
		candidateSetSha256: successor.candidateSetSha256,
		effectiveCohortManifestSha256: canonicalHash(successor.manifest),
		assignmentCount: shardIds.length,
		reviewCount: effectivePlan.rows.length,
		acceptedCount: effectivePlan.rows.length,
		rejectedCount: 0,
		assignmentResults: shardIds.map((assignmentId) => ({
			assignmentId,
			status: 'passed'
		})),
		reviews: effectivePlan.rows.map((row) => fullContentReviewRow(row.id)),
		issues: []
	};
	const sourceHashIndex = {
		schemaVersion: 'science-challenge-source-hash-index/v1',
		sourceSnapshotSha256: successor.manifest.sourceSnapshotSha256,
		questions: []
	};
	const curriculumHashIndex = {
		schemaVersion: 'science-challenge-curriculum-hash-index/v1',
		curriculumEvidenceSha256: successor.manifest.curriculumEvidenceSha256,
		components: []
	};
	for (const [archivePath, value] of [
		['plans/base-plan.json', basePlan],
		['plans/effective-plan.json', effectivePlan],
		['reviews/content/summary.json', contentReview],
		['indices/source-hashes.json', sourceHashIndex],
		['indices/curriculum-hashes.json', curriculumHashIndex]
	]) {
		writeJson(path.join(archiveRoot, archivePath), value);
	}

	const trackedArtifacts = [
		trackedRecord(archiveRoot, 'base-plan', 'plans/base-plan.json'),
		trackedRecord(archiveRoot, 'effective-plan', 'plans/effective-plan.json'),
		trackedRecord(archiveRoot, 'content-review-summary', 'reviews/content/summary.json'),
		trackedRecord(archiveRoot, 'source-hash-index', 'indices/source-hashes.json'),
		trackedRecord(archiveRoot, 'curriculum-hash-index', 'indices/curriculum-hashes.json')
	];
	const terminalManifestArchivePath = portable(path.relative(archiveRoot, successor.manifestPath));
	const terminalManifestRecord = trackedRecord(
		archiveRoot,
		'effective-cohort-manifest',
		terminalManifestArchivePath
	);
	trackedArtifacts.push(terminalManifestRecord);
	const effectiveArtifactPaths = effectiveCohortArtifactPaths(successor);
	const effectiveArtifactRecords = [...new Set(effectiveArtifactPaths)].map((relativePath) => {
		const archivePath = portable(path.join('content/effective-cohort', relativePath));
		const record = trackedRecord(archiveRoot, 'effective-cohort-artifact', archivePath);
		trackedArtifacts.push(record);
		return record;
	});
	const effectiveCohortIndex = {
		schemaVersion: 'science-challenge-effective-cohort-provenance-index/v1',
		referenceRoot: 'content/effective-cohort',
		manifestPath: portable(path.relative(effectiveCohortRoot, successor.manifestPath)),
		manifestSha256: canonicalHash(successor.manifest),
		manifestFileSha256: terminalManifestRecord.sha256,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		candidateCount: successor.candidateSet.length,
		candidateSetSha256: successor.candidateSetSha256,
		remapManifestSetSha256: canonicalHash([]),
		difficultyAdjustmentManifestSetSha256: canonicalHash([]),
		recoverySetSha256: canonicalHash([]),
		manifestRef: artifactReference(terminalManifestRecord),
		artifactCount: effectiveArtifactRecords.length,
		artifactRefs: effectiveArtifactRecords.map(artifactReference),
		durableReceiptRef: null,
		durableReceiptSha256: null
	};
	writeJson(path.join(archiveRoot, 'content/effective-cohort-index.json'), effectiveCohortIndex);
	const effectiveCohortIndexRecord = trackedRecord(
		archiveRoot,
		'effective-cohort-index',
		'content/effective-cohort-index.json'
	);
	trackedArtifacts.push(effectiveCohortIndexRecord);

	const parentRepositoryRecords = listRelativeFiles(parentRepositoryRoot).map((relativePath) => {
		const record = trackedRecord(
			archiveRoot,
			'content-parent-chain-artifact',
			portable(path.join('content/parent-chain/repository', relativePath))
		);
		trackedArtifacts.push(record);
		return record;
	});
	writeJson(path.join(archiveRoot, 'content/parent-chain/existing-definitions.json'), []);
	const existingDefinitionsRecord = trackedRecord(
		archiveRoot,
		'content-parent-chain-existing-definitions',
		'content/parent-chain/existing-definitions.json'
	);
	trackedArtifacts.push(existingDefinitionsRecord);
	const findParentRecord = (relativePath) => {
		const archivePath = portable(path.join('content/parent-chain/repository', relativePath));
		const record = parentRepositoryRecords.find((candidate) => candidate.path === archivePath);
		assert.ok(record, `missing parent-chain record ${archivePath}`);
		return record;
	};
	const findEffectiveRecord = (relativePath) => {
		const archivePath = portable(path.join('content/effective-cohort', relativePath));
		const record = effectiveArtifactRecords.find((candidate) => candidate.path === archivePath);
		assert.ok(record, `missing effective-cohort record ${archivePath}`);
		return record;
	};
	const contentReviewRecord = trackedArtifacts.find(
		(record) => record.path === 'reviews/content/summary.json'
	);
	const firstVerificationRecord = findEffectiveRecord(rootSuccessor.manifest.review.summary.path);
	const parentChainArtifactRecords = [
		...new Map(
			[
				...parentRepositoryRecords,
				existingDefinitionsRecord,
				...effectiveArtifactRecords,
				firstVerificationRecord,
				terminalManifestRecord,
				effectiveCohortIndexRecord,
				contentReviewRecord
			].map((record) => [`${record.kind}:${record.path}`, record])
		).values()
	];
	const parentChainIndex = {
		schemaVersion: 'science-challenge-content-parent-chain-provenance-index/v1',
		referenceRoot: 'content/parent-chain/repository',
		contentParentLineageSha256: canonicalHash(successor.manifest.parentChain),
		parentChain: successor.manifest.parentChain,
		reviewRebaseManifestRef: artifactReference(
			findParentRecord(reviewRebaseReplay.manifestPathRelative)
		),
		existingDefinitionsRef: artifactReference(existingDefinitionsRecord),
		parentVerificationRef: artifactReference(
			findParentRecord(reviewRebaseReplay.manifest.evidence.inputs.parentVerification.path)
		),
		parentRepairRef: artifactReference(
			findParentRecord(reviewRebaseReplay.manifest.evidence.inputs.parentRepair.path)
		),
		firstVerificationRef: artifactReference(firstVerificationRecord),
		effectiveCohortManifestRef: artifactReference(terminalManifestRecord),
		effectiveCohortIndexRef: artifactReference(effectiveCohortIndexRecord),
		contentVerificationRef: artifactReference(contentReviewRecord),
		artifactCount: parentChainArtifactRecords.length,
		artifactRefs: parentChainArtifactRecords.map(artifactReference)
	};
	writeJson(path.join(archiveRoot, 'content/parent-chain/index.json'), parentChainIndex);
	trackedArtifacts.push(
		trackedRecord(archiveRoot, 'content-parent-chain-index', 'content/parent-chain/index.json')
	);
	const contentParentLineageSha256 = canonicalHash(successor.manifest.parentChain);
	const contentVerificationSha256 = canonicalHash(contentReview);
	const release = {
		release: {
			planSha256: canonicalHash(basePlan),
			basePlanSha256: canonicalHash(basePlan),
			effectivePlanSha256: canonicalHash(effectivePlan),
			sourceSnapshotSha256: successor.manifest.sourceSnapshotSha256,
			curriculumEvidenceSha256: successor.manifest.curriculumEvidenceSha256,
			curriculumCatalogSha256: successor.manifest.curriculumCatalogSha256,
			effectiveCohortManifestSha256: canonicalHash(successor.manifest),
			effectiveCohortCandidateSetSha256: successor.candidateSetSha256,
			contentParentLineageSha256,
			contentVerificationSha256
		},
		challenges: successor.candidateSet
	};
	const provenanceManifest = {
		bindings: {
			basePlanSha256: canonicalHash(basePlan),
			effectivePlanSha256: canonicalHash(effectivePlan),
			effectiveCohortManifestSha256: canonicalHash(successor.manifest),
			effectiveCohortCandidateSetSha256: successor.candidateSetSha256,
			contentParentLineageSha256,
			contentVerificationSha256
		},
		lineage: {
			effectiveCohort: {
				parentChain: successor.manifest.parentChain
			}
		},
		trackedArtifacts
	};
	const targetCandidateRef = artifactReference(
		findEffectiveRecord(
			successor.manifest.shards.find((shard) =>
				shard.challengeIds.includes(effectivePlan.rows[0].id)
			).candidate.path
		)
	);
	return {
		root,
		archiveRoot,
		basePlan,
		effectivePlan,
		contentReview,
		release,
		provenanceManifest,
		reviewRebaseReplay,
		rootSuccessor,
		successor,
		parentChainIndex,
		targetCandidateRef,
		cleanup: () => rmSync(root, { recursive: true, force: true })
	};
}

function effectiveCohortArtifactPaths(replay) {
	const paths = new Set();
	let cursor = replay;
	while (cursor?.manifest) {
		const manifest = cursor.manifest;
		for (const referencePath of [
			manifest.plans?.base?.path,
			manifest.plans?.effective?.path,
			manifest.collectionValidation?.path,
			manifest.review?.summary?.path,
			manifest.verificationRepairAuthority?.path,
			manifest.predecessor?.manifest?.path,
			...(manifest.shards ?? []).flatMap((shard) => [shard.candidate?.path, shard.validation?.path])
		]) {
			if (typeof referencePath === 'string' && referencePath) {
				paths.add(referencePath);
			}
		}
		cursor = cursor.predecessor ?? null;
	}
	return [...paths];
}

function writeReviewRebaseRepositoryFixture(repositoryRoot) {
	const specificationSha256 = hash('review-rebase specification');
	const curriculumCatalogSha256 = hash('review-rebase curriculum catalog');
	const rows = Array.from({ length: 408 }, (_unused, index) => {
		const sharedComponent =
			index === 0 || index === 8
				? 'biology-shared-collision-component'
				: `biology-component-${String(index + 1).padStart(3, '0')}`;
		return {
			id: `biology-rebase-${String(index + 1).padStart(3, '0')}`,
			subject: 'biology',
			specificationId: 'aqa-gcse-biology-8461-v1-0',
			specificationSha256,
			chapterId: 'biology-chapter-cell-biology',
			chapterCode: '4.1',
			chapterTitle: 'Cell biology',
			curriculumComponentId: sharedComponent,
			calibrationQuestionId: `paper-question-${String(index + 1).padStart(3, '0')}`,
			calibrationQuestionSha256: hash(`review-rebase source ${index + 1}`),
			difficulty: index === 0 ? 'stretch' : 'standard',
			taskShape: 'explanation',
			arc: 'connect-cause-to-effect',
			mechanic: 'missing-link',
			shard: `science-${String(Math.floor(index / 8) + 1).padStart(3, '0')}`
		};
	});
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-review-rebase-upload-v1',
		createdOn: '2026-07-24',
		curriculumCatalogSha256,
		existingRoundCount: 0,
		generatedRoundCount: rows.length,
		generatedQuestionContextCount: rows.length * 2,
		targetFinalCatalogueRounds: rows.length,
		targetFinalQuestionContextCount: rows.length * 2,
		uniqueIllustrationPairCount: rows.length * 2,
		uniqueFinalIllustrationAssetCount: rows.length * 4,
		rows
	};
	const sourceSnapshot = {
		schemaVersion: 'science-source-snapshot/v1',
		questions: rows.map((row) => ({
			id: row.calibrationQuestionId,
			contentSha256: row.calibrationQuestionSha256
		}))
	};
	const curriculumEvidence = {
		schemaVersion: 'science-curriculum-evidence/v1',
		components: [...new Set(rows.map((row) => row.curriculumComponentId))].map((componentId) => ({
			componentId,
			specificationId: rows[0].specificationId,
			specificationSha256
		}))
	};
	const parentCandidates = rows.map((row, index) => reviewRebaseCandidate(row, index));
	const projectedCandidates = structuredClone(parentCandidates);
	projectedCandidates[0].definition.difficulty = 'standard';
	const collectionValidation = validateGeneratedChallengeCollection(projectedCandidates);
	assert.equal(collectionValidation.status, 'failed');
	assert.ok(collectionValidation.issues.length > 0);
	assert.ok(collectionValidation.issues.every((issue) => issue.includes(rows[8].id)));
	const collectionRemediations = collectionValidation.issues.map((issue) => ({
		issue,
		preferredChallengeId: rows[8].id
	}));
	const parentReviews = rows.map((row) => ({
		id: row.id,
		accepted: true,
		issues: []
	}));
	parentReviews[0] = {
		id: rows[0].id,
		accepted: false,
		issues: [
			{
				field: 'definition.difficulty',
				repair: 'Set definition.difficulty to standard.'
			}
		]
	};
	parentReviews[8] = {
		id: rows[8].id,
		accepted: false,
		issues: [
			{
				field: 'definition.previewQuestion',
				repair: 'Rewrite the duplicated opening.'
			}
		]
	};
	const parentVerification = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: canonicalHash(parentCandidates),
		reviewCount: rows.length,
		reviews: parentReviews
	};
	const parentVerificationSha256 = canonicalHash(parentVerification);
	const parentRepair = {
		schemaVersion: 'science-challenge-verification-repair-summary/v1',
		status: 'failed',
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		verificationRepairSha256: parentVerificationSha256,
		verificationRepairExecutionIdentity: {
			verificationSha256: parentVerificationSha256,
			planSha256: canonicalHash(basePlan),
			priorCandidateSetSha256: parentVerification.candidateSetSha256,
			objectiveId: hash('review-rebase parent objective'),
			executionId: hash('review-rebase parent execution')
		},
		results: []
	};
	const spec = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA,
		parent: {
			planSha256: canonicalHash(basePlan),
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			verificationSha256: parentVerificationSha256,
			repairSha256: canonicalHash(parentRepair),
			candidateSetSha256: parentVerification.candidateSetSha256,
			objectiveId: parentRepair.verificationRepairExecutionIdentity.objectiveId,
			executionId: parentRepair.verificationRepairExecutionIdentity.executionId
		},
		approval: {
			decision: 'approved',
			scope: 'fresh-full-review-only',
			rationale: 'Fixture authorization for one fresh full-cohort review.',
			authorizedMutationKeys: [`${rows[0].id}:definition.difficulty`, `${rows[0].id}:difficulty`],
			authorizedCollectionRemediationKeys: collectionRemediations.map(
				(remediation) => `${remediation.preferredChallengeId}:${canonicalHash(remediation.issue)}`
			)
		},
		planMutations: [
			{
				challengeId: rows[0].id,
				field: 'difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		candidateMutations: [
			{
				challengeId: rows[0].id,
				field: 'definition.difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		collectionRemediations
	};
	for (const [relativePath, value] of [
		['inputs/spec.json', spec],
		['inputs/base-plan.json', basePlan],
		['inputs/source.json', sourceSnapshot],
		['inputs/curriculum.json', curriculumEvidence],
		['inputs/v0.json', parentVerification],
		['inputs/r0.json', parentRepair]
	]) {
		writeJson(path.join(repositoryRoot, relativePath), value);
	}
	const parentCandidateSources = [];
	const selections = [];
	for (const shardId of [...new Set(rows.map((row) => row.shard))]) {
		const shardRows = rows.filter((row) => row.shard === shardId);
		const challenges = shardRows.map(
			(row) => parentCandidates[rows.findIndex((candidate) => candidate.id === row.id)]
		);
		const candidate = {
			schemaVersion: 'science-challenge-batch/v1',
			challenges
		};
		const validation = {
			status: 'failed',
			issues: ['Selected parent repair candidate requires a fresh full review.']
		};
		const assignment = {
			assignmentId: shardId,
			planSha256: canonicalHash(basePlan),
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			items: challenges.map((challenge) => ({ candidate: challenge }))
		};
		const shardRoot = `inputs/shards/${shardId}`;
		writeJson(path.join(repositoryRoot, shardRoot, 'assignment.json'), assignment);
		writeJson(path.join(repositoryRoot, shardRoot, 'candidate.json'), candidate);
		writeJson(path.join(repositoryRoot, shardRoot, 'validation.json'), validation);
		parentCandidateSources.push({
			shardId,
			assignmentPath: `${shardRoot}/assignment.json`,
			assignmentSha256: canonicalHash(assignment)
		});
		selections.push({
			shardId,
			disposition: 'immutable-parent-repair-candidate',
			candidatePath: `${shardRoot}/candidate.json`,
			candidateSha256: canonicalHash(candidate),
			validationPath: `${shardRoot}/validation.json`,
			validationSha256: canonicalHash(validation)
		});
	}
	const selectionIndex = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA,
		parentCandidateSources,
		selections
	};
	writeJson(path.join(repositoryRoot, 'inputs/selections.json'), selectionIndex);
	return {
		basePlan,
		options: {
			repositoryRoot,
			outputRoot: 'review-rebase',
			specPath: 'inputs/spec.json',
			basePlanPath: 'inputs/base-plan.json',
			sourceSnapshotPath: 'inputs/source.json',
			curriculumEvidencePath: 'inputs/curriculum.json',
			parentVerificationPath: 'inputs/v0.json',
			parentRepairPath: 'inputs/r0.json',
			selectionIndexPath: 'inputs/selections.json',
			existingDefinitions: []
		}
	};
}

function buildShortRecallUploadFixture() {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-release-upload-short-recall-'));
	const releaseRoot = path.join(root, 'release');
	mkdirSync(releaseRoot, { recursive: true });
	const challenges = Array.from({ length: 408 }, (_unused, index) => shortRecallCandidate(index));
	const artifacts = buildPassedScienceChallengeShortRecallArtifactsForTest({
		candidateEntries: challenges,
		candidateArtifactSha256: hash('short-recall candidate artifact')
	});
	const { prompts, authoringEvidence, reviewEvidence } = artifacts;

	const release = {
		release: {
			status: 'accepted',
			...artifacts.releaseBindings
		},
		challenges
	};
	const releasePath = path.join(releaseRoot, 'accepted-challenges.json');
	const promptPath = path.join(releaseRoot, 'short-recall-prompts.json');
	const reviewPath = path.join(releaseRoot, 'short-recall-review-evidence.json');
	const authoringPath = path.join(releaseRoot, 'short-recall-authoring-evidence.json');
	writeJson(releasePath, release);
	writeJson(promptPath, prompts);
	writeJson(reviewPath, reviewEvidence);
	writeJson(authoringPath, authoringEvidence);
	return {
		root,
		releaseRoot,
		releasePath,
		promptPath,
		reviewPath,
		authoringPath,
		release,
		cleanup: () => rmSync(root, { recursive: true, force: true })
	};
}

function shortRecallCandidate(index) {
	const suffix = String(index + 1).padStart(3, '0');
	return {
		definition: {
			id: `biology-short-recall-${suffix}`,
			subject: 'Biology',
			title: `Cell investigation ${suffix}`,
			topic: 'Cell biology',
			memoryHandle:
				'Identify the variable → Read the measured evidence → Link the pattern to the conclusion → Check the command word',
			previewQuestion: `A learner compares cell sample ${suffix}. Explain the measured pattern.`,
			staticAnswers: {
				a: 'The measured pattern supports the scientific conclusion.',
				b: 'The measurements are listed without linking them to the conclusion.'
			},
			strongerAnswer: 'a',
			showdownExplanation:
				'Answer A links the measured evidence to the conclusion required by the question.',
			commandWordLesson:
				'Explain requires the measured evidence to be connected to the scientific conclusion.',
			repairSuccess: 'The answer now links evidence to the conclusion.',
			transferPromptLead: 'Apply the same evidence link to a second cell sample.',
			transferExplanation:
				'The second sample is solved by connecting its measured pattern to the conclusion.'
		},
		grounding: {
			curriculumComponentId: `component-${suffix}`,
			specificationId: 'aqa-gcse-biology',
			calibrationQuestionId: `calibration-${suffix}`
		}
	};
}

function reviewRebaseCandidate(row, index) {
	const suffix = String(index + 1).padStart(3, '0');
	const collisionOpening =
		'A crimson beaker beside a sealed cell sample shows the same measured water movement. Explain the membrane process.';
	const opening =
		index === 0 || index === 8
			? collisionOpening
			: `Sample ${suffix} uses marker ${uniqueWord(index, 'opening')} beside a cell preparation. Explain the measured biological change for this exact sample.`;
	const transfer = `A separate investigation ${uniqueWord(index, 'transfer')} records a different cell response under controlled conditions. Explain the evidence link for sample ${suffix}.`;
	const strongerAnswer = index % 2 === 0 ? 'a' : 'b';
	return {
		definition: {
			id: row.id,
			slug: `why-does-water-move-in-sample-${suffix}`,
			subject: 'biology',
			subjectArtTheme: 'cells-practical',
			title: `Why does water move in sample ${suffix}?`,
			topic: 'Cell transport',
			hook: `Sample ${suffix} needs a mechanism before its measured change can be explained clearly.`,
			arc: row.arc,
			mechanic: row.mechanic,
			difficulty: row.difficulty,
			marks: 3,
			estimatedMinutes: 4,
			previewQuestion: opening,
			metaDescription: `Practise a calibrated GCSE Biology challenge for sample ${suffix}, compare two explanations, repair the missing scientific link, and transfer it.`,
			sourceQuestionId: row.calibrationQuestionId,
			lastReviewed: '2026-07-24',
			version: 1,
			cohortVersion: 'review-rebase-b0',
			staticAnswers: {
				a: 'Water moves through the membrane because a concentration gradient drives osmosis.',
				b: 'Water moves around the sample because the visible liquid pushes it.'
			},
			strongerAnswer,
			weakAnswer: strongerAnswer === 'a' ? 'b' : 'a',
			weakAnswerKind: 'incomplete',
			showdownExplanation:
				'The stronger answer names the transport process, the gradient and the membrane.',
			commandWordLesson:
				'Explain means connect the measured direction of movement to the scientific mechanism.',
			diagnosisPrompt: 'Which scientific link is missing from the weaker answer?',
			diagnosisChoices: reviewRebaseChoices(index % 3, 'the membrane transport mechanism'),
			repairPrompt: 'Which phrase repairs the weaker answer most precisely?',
			repairChoices: reviewRebaseChoices(
				(index + 1) % 3,
				'down the relevant concentration gradient'
			),
			freeTextKeywordGroups: [
				['osmosis', 'movement'],
				['gradient', 'concentration'],
				['membrane', 'partially permeable']
			],
			repairSuccess:
				'The repaired answer now names the mechanism and explains the measured direction.',
			transferPromptLead: transfer,
			transferChoices: reviewRebaseChoices(
				(index + 2) % 3,
				'the evidence supports the membrane process'
			),
			transferExplanation:
				'The second setting is solved by linking its measured evidence to the same membrane process.',
			memoryHandle:
				'Name the process → compare the conditions → state the direction → check the membrane'
		},
		grounding: {
			curriculumComponentId: row.curriculumComponentId,
			specificationId: row.specificationId,
			specificationSha256: row.specificationSha256,
			calibrationQuestionId: row.calibrationQuestionId,
			calibrationQuestionSha256: row.calibrationQuestionSha256
		},
		art: {
			opening: reviewRebaseArt(row.id, 'opening', suffix),
			transfer: reviewRebaseArt(row.id, 'transfer', suffix)
		}
	};
}

function reviewRebaseChoices(correctIndex, correctText) {
	return Array.from({ length: 3 }, (_unused, index) => ({
		id: `choice-${index + 1}`,
		text:
			index === correctIndex
				? correctText
				: index === 0
					? 'the sample simply becomes larger'
					: 'the apparatus supplies extra energy',
		feedback:
			index === correctIndex
				? 'This states the decisive scientific link.'
				: 'This does not connect the evidence to the mechanism.',
		correct: index === correctIndex
	}));
}

function reviewRebaseArt(challengeId, context, suffix) {
	const scene =
		context === 'opening'
			? `Unlabelled cell sample ${suffix} beside a sealed beaker`
			: `Unlabelled comparison sample ${suffix} beside a covered tray`;
	return {
		schemaVersion: 'science-question-art/v1',
		id: `${challengeId}-${context}`,
		context,
		scene,
		visualAnchor: `${scene} with one central specimen and neutral apparatus`,
		altText: `${scene} arranged as a text-free classroom still life.`,
		approvedMeaning: 'The starting setup is visible without showing the scientific conclusion.',
		accuracyConstraints: [
			'Show intact biological material.',
			'Keep all apparatus scientifically plausible.'
		],
		forbiddenDetails: ['Do not show the final result.', 'Do not add labels or equations.']
	};
}

function uniqueWord(index, context) {
	return `${context}-${(index + 1).toString(36)}-${(index * 7919 + 104729).toString(36)}`;
}

function fullContentReviewRow(id) {
	return {
		id,
		...Object.fromEntries(SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])),
		checkedCalculations: [],
		accepted: true,
		issues: []
	};
}

function listRelativeFiles(root) {
	const result = [];
	const visit = (directory, prefix = '') => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) visit(path.join(directory, entry.name), relativePath);
			else result.push(relativePath);
		}
	};
	visit(root);
	return result.sort();
}

function validateShortRecallFixture(fixture) {
	return readScienceChallengeReleaseShortRecallUploadEvidence({
		acceptedReleasePath: fixture.releasePath,
		release: fixture.release
	});
}

function rebindParentChainIndexReference(fixture, field, reference) {
	const prior = fixture.parentChainIndex[field];
	fixture.parentChainIndex[field] = reference;
	const artifactIndex = fixture.parentChainIndex.artifactRefs.findIndex(
		(candidate) =>
			candidate.kind === prior.kind &&
			candidate.path === prior.path &&
			candidate.sha256 === prior.sha256
	);
	assert.notEqual(artifactIndex, -1);
	fixture.parentChainIndex.artifactRefs[artifactIndex] = reference;
	rewriteTrackedJson(fixture, 'content/parent-chain/index.json', fixture.parentChainIndex);
}

function durableReceipt({
	basePlan,
	effectivePlan,
	curriculumEvidenceSha256,
	curriculumCatalogSha256,
	effectiveCohortManifestSha256,
	candidateSetSha256,
	recoverySetSha256,
	remapManifest,
	remapCandidate,
	candidateSet
}) {
	const decision = {
		challengeId: remapManifest.challengeId,
		field: remapManifest.remap.field,
		from: remapManifest.remap.from,
		to: remapManifest.remap.to,
		accepted: true
	};
	const remap = {
		challengeId: decision.challengeId,
		field: decision.field,
		from: decision.from,
		to: decision.to,
		fromTitle: 'Transport in cells',
		toTitle: 'Osmosis',
		fromSourceTextSha256: hash('from source text'),
		toSourceTextSha256: hash('to source text'),
		ancestryChain: [
			{ componentId: decision.from, title: 'Transport in cells' },
			{ componentId: decision.to, title: 'Osmosis' }
		],
		proposalSha256: hash('proposal'),
		targetCandidateSha256: canonicalHash(remapCandidate.challenges[0]),
		batchCandidateSha256: canonicalHash(remapCandidate),
		baseReviewSha256: hash('base review'),
		manifestSha256: canonicalHash(remapManifest),
		assignmentId: 'science-001',
		assignmentSha256: hash('assignment'),
		packetSha256: hash('packet'),
		resultSha256: hash('result'),
		decision,
		decisionSha256: canonicalHash(decision)
	};
	const reconstructedProposal = {
		challengeId: remap.challengeId,
		field: remap.field,
		from: remap.from,
		to: remap.to,
		proposalSha256: remap.proposalSha256,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		curriculumEvidenceSha256,
		targetCandidateSha256: remap.targetCandidateSha256,
		batchCandidateSha256: remap.batchCandidateSha256,
		baseReviewSha256: remap.baseReviewSha256,
		manifestSha256: remap.manifestSha256
	};
	const core = {
		schemaVersion: SCIENCE_CHALLENGE_CURRICULUM_REMAP_DURABLE_RECEIPT_SCHEMA,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		curriculumEvidenceSha256,
		curriculumCatalogSha256,
		effectiveCohortManifestSha256,
		candidateCount: candidateSet.length,
		candidateSetSha256,
		remapManifestSetSha256: canonicalHash([remapManifest]),
		recoverySetSha256,
		verifierInputSha256: hash('verifier input'),
		packetManifestSha256: hash('packet manifest'),
		proposalSetSha256: canonicalHash([reconstructedProposal]),
		decisionSetSha256: canonicalHash([decision]),
		packetSetSha256: canonicalHash([remap.packetSha256]),
		remaps: [remap]
	};
	return { ...core, receiptSha256: canonicalHash(core) };
}

function validateFixture(fixture) {
	return validateScienceChallengeReleaseUploadEvidence({
		archiveRoot: fixture.archiveRoot,
		provenanceManifest: fixture.provenanceManifest,
		release: fixture.release
	});
}

function rebindReceipt(fixture, receipt) {
	const core = structuredClone(receipt);
	delete core.receiptSha256;
	receipt.receiptSha256 = canonicalHash(core);
	fixture.receipt = receipt;
	rewriteTrackedJson(fixture, 'content/curriculum-remap/durable-receipt.json', receipt);
	const receiptSha256 = canonicalHash(receipt);
	fixture.contentReview.curriculumRemapDurableReceipt = receipt;
	fixture.contentReview.curriculumRemapDurableReceiptSha256 = receiptSha256;
	fixture.release.release.curriculumRemapDurableReceiptSha256 = receiptSha256;
	fixture.provenanceManifest.bindings.curriculumRemapDurableReceiptSha256 = receiptSha256;
	fixture.release.release.curriculumRemapDecisionSetSha256 = receipt.decisionSetSha256;
	fixture.provenanceManifest.bindings.curriculumRemapDecisionSetSha256 = receipt.decisionSetSha256;
	fixture.effectiveCohortIndex.durableReceiptSha256 = receiptSha256;
	fixture.effectiveCohortIndex.durableReceiptRef = artifactReference(
		fixture.provenanceManifest.trackedArtifacts.find(
			(record) => record.kind === 'curriculum-remap-durable-receipt'
		)
	);
	rewriteTrackedJson(fixture, 'content/effective-cohort-index.json', fixture.effectiveCohortIndex);
	rebindContentReview(fixture);
}

function rebindContentReview(fixture) {
	rewriteTrackedJson(fixture, 'reviews/content/summary.json', fixture.contentReview);
	const contentReviewSha256 = canonicalHash(fixture.contentReview);
	fixture.release.release.contentVerificationSha256 = contentReviewSha256;
	fixture.provenanceManifest.bindings.contentVerificationSha256 = contentReviewSha256;
}

function rebindCoherentStaleEffectiveCohortRemap(fixture) {
	const cohortRoot = path.join(fixture.archiveRoot, fixture.effectiveCohortIndex.referenceRoot);
	const cohortManifestArchivePath = portable(
		path.join(fixture.effectiveCohortIndex.referenceRoot, fixture.effectiveCohortIndex.manifestPath)
	);
	const cohortManifestPath = path.join(fixture.archiveRoot, cohortManifestArchivePath);
	const cohortManifest = readJson(cohortManifestPath);
	const remapShard = cohortManifest.shards.find(
		(shard) => shard.disposition === 'descendant-remap'
	);
	assert.ok(remapShard);
	const remapManifestPath = path.join(cohortRoot, remapShard.lineage.manifest.path);
	const remapManifest = readJson(remapManifestPath);
	remapManifest.repairSha256 = hash('another coherent repair');
	remapManifest.firstReview.summarySha256 = remapManifest.repairSha256;
	const remapCore = { ...remapManifest };
	delete remapCore.manifestCoreSha256;
	remapManifest.manifestCoreSha256 = canonicalHash(remapCore);
	writeJson(remapManifestPath, remapManifest);
	const remapBytes = readFileSync(remapManifestPath);
	remapShard.lineage.manifest = {
		path: remapShard.lineage.manifest.path,
		sha256: sha256(remapBytes),
		canonicalSha256: canonicalHash(remapManifest)
	};
	cohortManifest.remapManifestSetSha256 = canonicalHash([remapManifest]);
	const cohortCore = { ...cohortManifest };
	delete cohortCore.manifestCoreSha256;
	cohortManifest.manifestCoreSha256 = canonicalHash(cohortCore);
	rewriteTrackedJson(fixture, cohortManifestArchivePath, cohortManifest);
	const cohortManifestRecord = fixture.provenanceManifest.trackedArtifacts.find(
		(record) =>
			record.kind === 'effective-cohort-manifest' && record.path === cohortManifestArchivePath
	);
	assert.ok(cohortManifestRecord);
	const cohortManifestSha256 = canonicalHash(cohortManifest);
	fixture.effectiveCohortIndex.manifestSha256 = cohortManifestSha256;
	fixture.effectiveCohortIndex.manifestFileSha256 = cohortManifestRecord.sha256;
	fixture.effectiveCohortIndex.manifestRef = artifactReference(cohortManifestRecord);
	fixture.effectiveCohortIndex.remapManifestSetSha256 = cohortManifest.remapManifestSetSha256;

	const receipt = structuredClone(fixture.receipt);
	const durableRemap = receipt.remaps[0];
	durableRemap.manifestSha256 = canonicalHash(remapManifest);
	receipt.effectiveCohortManifestSha256 = cohortManifestSha256;
	receipt.remapManifestSetSha256 = cohortManifest.remapManifestSetSha256;
	receipt.proposalSetSha256 = canonicalHash([
		{
			challengeId: durableRemap.challengeId,
			field: durableRemap.field,
			from: durableRemap.from,
			to: durableRemap.to,
			proposalSha256: durableRemap.proposalSha256,
			basePlanSha256: receipt.basePlanSha256,
			effectivePlanSha256: receipt.effectivePlanSha256,
			curriculumEvidenceSha256: receipt.curriculumEvidenceSha256,
			targetCandidateSha256: durableRemap.targetCandidateSha256,
			batchCandidateSha256: durableRemap.batchCandidateSha256,
			baseReviewSha256: durableRemap.baseReviewSha256,
			manifestSha256: durableRemap.manifestSha256
		}
	]);
	fixture.release.release.effectiveCohortManifestSha256 = cohortManifestSha256;
	fixture.provenanceManifest.bindings.effectiveCohortManifestSha256 = cohortManifestSha256;
	fixture.release.release.descendantRemapManifestSetSha256 = cohortManifest.remapManifestSetSha256;
	fixture.provenanceManifest.bindings.descendantRemapManifestSetSha256 =
		cohortManifest.remapManifestSetSha256;
	rebindReceipt(fixture, receipt);
}

function rewriteTrackedJson(fixture, archivePath, value) {
	writeJson(path.join(fixture.archiveRoot, archivePath), value);
	const index = fixture.provenanceManifest.trackedArtifacts.findIndex(
		(record) => record.path === archivePath
	);
	assert.notEqual(index, -1);
	fixture.provenanceManifest.trackedArtifacts[index] = trackedRecord(
		fixture.archiveRoot,
		fixture.provenanceManifest.trackedArtifacts[index].kind,
		archivePath
	);
}

function trackedRecord(archiveRoot, kind, archivePath) {
	const bytes = readFileSync(path.join(archiveRoot, archivePath));
	return {
		kind,
		path: portable(archivePath),
		sha256: sha256(bytes),
		canonicalSha256: canonicalHash(JSON.parse(bytes.toString('utf8'))),
		bytes: statSync(path.join(archiveRoot, archivePath)).size
	};
}

function artifactReference(record) {
	return {
		kind: record.kind,
		path: record.path,
		sha256: record.sha256,
		canonicalSha256: record.canonicalSha256,
		bytes: record.bytes
	};
}

function validateCollectionCandidate({ candidateSet, effectivePlan }) {
	const issues =
		candidateSet.length === effectivePlan.rows.length &&
		candidateSet.every(
			(entry, index) =>
				entry?.definition?.id === effectivePlan.rows[index]?.id &&
				entry?.grounding?.curriculumComponentId === effectivePlan.rows[index]?.curriculumComponentId
		)
			? []
			: ['Collection differs from the effective plan.'];
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		repairTargets: [],
		candidateCount: candidateSet.length,
		candidateSetSha256: canonicalHash(candidateSet),
		effectivePlanSha256: canonicalHash(effectivePlan)
	};
}

function batchForRows(rows) {
	return {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: rows.map((row) => ({
			definition: { id: row.id },
			grounding: { curriculumComponentId: row.curriculumComponentId }
		}))
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

function portable(value) {
	return value.split(path.sep).join('/');
}

function hash(value) {
	return canonicalHash(String(value));
}
