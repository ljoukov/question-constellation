import assert from 'node:assert/strict';
import test from 'node:test';

import * as descendantRemapModule from './science-challenge-descendant-remap.mjs';
import {
	SCIENCE_CHALLENGE_DESCENDANT_REMAP_COLLECTION_POLICY,
	SCIENCE_CHALLENGE_DESCENDANT_REMAP_DISPOSITION,
	SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
	buildScienceChallengeDescendantRemap,
	descendantRemapApprovalDecision,
	projectScienceChallengeDescendantRemapPlan,
	validateScienceChallengeDescendantRemapManifest
} from './science-challenge-descendant-remap.mjs';
import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	canonicalHash
} from './science-challenge-release.mjs';

const targetId = 'physics-newtons-laws-01';
const acceptedId = 'physics-speed-01';
const repairedId = 'physics-acceleration-01';
const parentId = 'spec:4-5-6-2';
const leafId = 'spec:4-5-6-2-2';
const otherLeafId = 'spec:4-5-6-2-3';

test('builds a target-row-only review-pending overlay from latest matching failed attempt', () => {
	const fixture = remapFixture();
	const result = buildScienceChallengeDescendantRemap(fixture);

	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(result.manifest.disposition, SCIENCE_CHALLENGE_DESCENDANT_REMAP_DISPOSITION);
	assert.equal(result.manifest.sourceAttempt.attempt, 3);
	assert.deepEqual(result.manifest.attemptBudget.matchingAttempts, [1, 3]);
	assert.equal(result.validation.status, 'review-pending');
	assert.equal(result.validation.sourceAttemptStatus, 'failed');
	assert.equal(result.candidate.challenges[1].grounding.curriculumComponentId, leafId);
	assert.equal(
		canonicalHash(result.candidate.challenges[0]),
		canonicalHash(fixture.priorCandidate.challenges[0]),
		'the accepted sibling must remain byte-identical'
	);
	assert.equal(
		canonicalHash(result.candidate.challenges[2]),
		canonicalHash(fixture.attempts[2].candidate.challenges[2]),
		'the selected attempt must retain its other rejected-row repair'
	);
	assert.notEqual(
		canonicalHash(result.candidate.challenges[2]),
		canonicalHash(fixture.priorCandidate.challenges[2])
	);
	assert.equal(result.effectivePlanRow.curriculumComponentId, leafId);
	assert.equal(result.effectivePlanRow.curriculumCode, '4.5.6.2.2');
	assert.equal(result.manifest.base.planSha256, canonicalHash(fixture.plan));
	assert.equal(result.manifest.effective.planSha256, canonicalHash(result.effectivePlan));
	assert.notEqual(result.manifest.base.planSha256, result.manifest.effective.planSha256);

	const restoredTarget = structuredClone(result.candidate.challenges[1]);
	restoredTarget.grounding.curriculumComponentId = parentId;
	assert.equal(canonicalHash(restoredTarget), canonicalHash(fixture.priorCandidate.challenges[1]));
});

test('fails closed when the attempted target is not a true terminal curriculum leaf', () => {
	const fixture = remapFixture();
	fixture.curriculumCatalog.specifications[0].components.push({
		id: `${leafId}-1`,
		parentId: leafId,
		code: '4.5.6.2.2.1',
		title: 'Child',
		kind: 'topic',
		sourcePageStart: 54,
		sourcePageEnd: 54
	});
	fixture.plan.curriculumCatalogSha256 = canonicalHash(fixture.curriculumCatalog);
	fixture.curriculumEvidence.catalogSha256 = fixture.plan.curriculumCatalogSha256;
	rebuildFirstAssignment(fixture);
	rebindReviewEnvelope(fixture);
	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /not a true terminal topic leaf/u);
});

test('rejects a forged parent graph not bound by the frozen plan and evidence', () => {
	const fixture = remapFixture();
	fixture.curriculumCatalog.specifications[0].components.find(
		(component) => component.id === leafId
	).parentId = 'spec:4-5-2';
	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /not the exact catalog bound/u);
});

test('rejects ambiguous descendant targets across immutable matching attempts', () => {
	const fixture = remapFixture();
	const target = fixture.attempts[0].candidate.challenges[1];
	target.grounding.curriculumComponentId = otherLeafId;
	fixture.attempts[0].sourceValidation.candidateSha256 = canonicalHash(
		fixture.attempts[0].candidate
	);
	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /unambiguous attempted descendant component/u);
});

test('rejects a source target that changes any non-remap field', () => {
	const fixture = remapFixture();
	for (const attempt of [fixture.attempts[0], fixture.attempts[2]]) {
		attempt.candidate.challenges[1].definition.title = 'Model also rewrote this title';
		attempt.sourceValidation.candidateSha256 = canonicalHash(attempt.candidate);
	}
	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /No immutable failed attempt/u);
});

test('manifest self-binding and inverse replay reject tampering', () => {
	const fixture = remapFixture();
	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	const approval = descendantRemapApprovalDecision(result.manifest, true);
	assert.deepEqual(approval, { ...result.manifest.remap, accepted: true });
	const intact = validateScienceChallengeDescendantRemapManifest({
		manifest: result.manifest,
		plan: fixture.plan,
		priorCandidate: fixture.priorCandidate,
		candidate: result.candidate
	});
	assert.equal(intact.status, 'passed', intact.issues.join('\n'));

	const tamperedManifest = structuredClone(result.manifest);
	tamperedManifest.inverseRemap.to = leafId;
	const tampered = validateScienceChallengeDescendantRemapManifest({
		manifest: tamperedManifest,
		plan: fixture.plan,
		priorCandidate: fixture.priorCandidate,
		candidate: result.candidate
	});
	assert.equal(tampered.status, 'failed');
	assert.match(tampered.issues.join('\n'), /self-binding|inverse/u);
});

test('effective-plan projection counts the terminal leaf instead of the frozen parent', () => {
	const fixture = remapFixture();
	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	const recovery = {
		manifest: result.manifest,
		priorCandidate: fixture.priorCandidate,
		candidate: result.candidate
	};
	const projected = projectScienceChallengeDescendantRemapPlan(fixture.plan, [recovery]);
	assert.equal(projected.status, 'passed', projected.issues.join('\n'));
	const componentCounts = projected.plan.rows.reduce((counts, row) => {
		counts[row.curriculumComponentId] = (counts[row.curriculumComponentId] ?? 0) + 1;
		return counts;
	}, {});
	assert.equal(componentCounts[parentId], undefined);
	assert.equal(componentCounts[leafId], 1);
	assert.equal(
		Object.hasOwn(descendantRemapModule, 'effectiveScienceChallengePlan'),
		false,
		'publication must not be enabled by a caller-supplied passed-status helper'
	);
});

test('binds every first-assignment candidate row to the immutable prior shard', () => {
	const fixture = remapFixture();
	fixture.firstAssignment.items[0].candidate = structuredClone(
		fixture.firstAssignment.items[0].candidate
	);
	fixture.firstAssignment.items[0].candidate.definition.title = 'Forged accepted sibling';
	const assignmentCore = Object.fromEntries(
		Object.entries(fixture.firstAssignment).filter(([field]) => field !== 'evidenceSha256')
	);
	fixture.firstAssignment.evidenceSha256 = canonicalHash(assignmentCore);
	fixture.dispatchLedger.dispatches[0].assignmentSha256 = canonicalHash(fixture.firstAssignment);
	fixture.firstReviewResult.assignmentEvidenceSha256 = fixture.firstAssignment.evidenceSha256;
	const dispatchLedgerSha256 = canonicalHash(fixture.dispatchLedger);
	fixture.firstReviewResult.verifier.provenance.dispatchLedgerSha256 = dispatchLedgerSha256;
	rebindReviewEnvelope(fixture, dispatchLedgerSha256);

	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /complete prior shard candidates/u);
});

test('reruns the immutable prior batch against the frozen base plan', () => {
	const fixture = remapFixture();
	const validate = fixture.validateBatchCandidate;
	fixture.validateBatchCandidate = (candidate, rows, context) =>
		context?.validationMode === 'prior-base-plan-replay'
			? {
					status: 'failed',
					issues: ['synthetic stale prior validation'],
					candidateSha256: canonicalHash(candidate),
					planRowsSha256: canonicalHash(rows),
					planSha256: canonicalHash(context.basePlan),
					candidateCount: candidate.challenges.length
				}
			: validate(candidate, rows, context);

	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /exact current ordinary validation/u);
});

test('defers the full collection gate until the final effective cohort', () => {
	const fixture = remapFixture();
	let collectionCalls = 0;
	fixture.validateCollectionCandidate = () => {
		collectionCalls += 1;
		throw new Error('typed remap must not evaluate an incomplete peer cohort');
	};
	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(collectionCalls, 0);
	assert.equal(result.collectionValidation.status, 'deferred');
	assert.equal(
		result.manifest.collectionValidationPolicy,
		SCIENCE_CHALLENGE_DESCENDANT_REMAP_COLLECTION_POLICY
	);
});

test('real-shaped eight-row shard retains six rejected repairs and preserves two accepted rows', () => {
	const fixture = expandToEightRows(remapFixture());
	const result = buildScienceChallengeDescendantRemap(fixture);
	assert.equal(result.status, 'passed', result.issues.join('\n'));
	assert.equal(result.candidate.challenges.length, 8);
	assert.equal(result.manifest.sourceAttempt.attempt, 3);

	const reviewsById = new Map(
		fixture.firstReviewSummary.reviews.map((review) => [review.id, review])
	);
	for (const [index, prior] of fixture.priorCandidate.challenges.entries()) {
		const current = result.candidate.challenges[index];
		if (reviewsById.get(prior.definition.id).accepted) {
			assert.equal(
				canonicalHash(current),
				canonicalHash(prior),
				`${prior.definition.id} accepted bytes changed`
			);
		} else {
			assert.notEqual(
				canonicalHash(current),
				canonicalHash(prior),
				`${prior.definition.id} rejected repair was discarded`
			);
		}
	}
	assert.equal(
		canonicalHash(result.candidate),
		canonicalHash(fixture.attempts[2].candidate),
		'the latest full repair batch must be retained'
	);
});

function remapFixture() {
	const plan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-test-v1',
		rows: [
			{
				id: acceptedId,
				shard: 'science-044',
				curriculumComponentId: 'spec:4-5-2',
				curriculumCode: '4.5.2',
				curriculumTitle: 'Speed',
				curriculumPageStart: 50,
				curriculumPageEnd: 50,
				specificationId: 'spec',
				specificationSha256: 'a'.repeat(64)
			},
			{
				id: targetId,
				shard: 'science-044',
				curriculumComponentId: parentId,
				curriculumCode: '4.5.6.2',
				curriculumTitle: "Forces, accelerations and Newton's Laws of motion",
				curriculumPageStart: 54,
				curriculumPageEnd: 54,
				specificationId: 'spec',
				specificationSha256: 'a'.repeat(64)
			},
			{
				id: repairedId,
				shard: 'science-044',
				curriculumComponentId: 'spec:4-5-2',
				curriculumCode: '4.5.2',
				curriculumTitle: 'Speed',
				curriculumPageStart: 50,
				curriculumPageEnd: 50,
				specificationId: 'spec',
				specificationSha256: 'a'.repeat(64)
			}
		]
	};
	const curriculumEvidence = {
		components: [
			{
				componentId: 'spec:4-5-2',
				code: '4.5.2',
				title: 'Speed',
				pageStart: 50,
				pageEnd: 50,
				sourceText: 'Speed is distance travelled divided by time taken for the journey.',
				sourceTextSha256: 'b'.repeat(64),
				specificationId: 'spec',
				specificationSha256: 'a'.repeat(64)
			},
			{
				componentId: parentId,
				code: '4.5.6.2',
				title: "Forces, accelerations and Newton's Laws of motion",
				pageStart: 54,
				pageEnd: 54,
				sourceText: "4.5.6.2 Forces, accelerations and Newton's Laws of motion",
				sourceTextSha256: 'c'.repeat(64),
				specificationId: 'spec',
				specificationSha256: 'a'.repeat(64)
			},
			{
				componentId: leafId,
				code: '4.5.6.2.2',
				title: "Newton's Second Law",
				pageStart: 54,
				pageEnd: 54,
				sourceText:
					"4.5.6.2.2 Newton's Second Law\nThe acceleration of an object is proportional to the resultant force acting on it and inversely proportional to the mass of the object.",
				sourceTextSha256: 'd'.repeat(64),
				specificationId: 'spec',
				specificationSha256: 'a'.repeat(64)
			},
			{
				componentId: otherLeafId,
				code: '4.5.6.2.3',
				title: "Newton's Third Law",
				pageStart: 55,
				pageEnd: 55,
				sourceText:
					"4.5.6.2.3 Newton's Third Law\nWhenever two objects interact, the forces they exert on each other are equal and opposite and act on different objects.",
				sourceTextSha256: 'e'.repeat(64),
				specificationId: 'spec',
				specificationSha256: 'a'.repeat(64)
			}
		]
	};
	const curriculumCatalog = {
		specifications: [
			{
				id: 'spec',
				components: [
					component('spec:4', null, '4', 'Physics', 1),
					component('spec:4-5', 'spec:4', '4.5', 'Forces', 2),
					component('spec:4-5-2', 'spec:4-5', '4.5.2', 'Speed', 50),
					component(
						parentId,
						'spec:4-5',
						'4.5.6.2',
						"Forces, accelerations and Newton's Laws of motion",
						54
					),
					component(leafId, parentId, '4.5.6.2.2', "Newton's Second Law", 54),
					component(otherLeafId, parentId, '4.5.6.2.3', "Newton's Third Law", 55)
				]
			}
		]
	};
	plan.curriculumCatalogSha256 = canonicalHash(curriculumCatalog);
	curriculumEvidence.catalogSha256 = plan.curriculumCatalogSha256;
	curriculumEvidence.planId = plan.planId;
	const priorCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [
			{
				definition: { id: acceptedId, title: 'Keep this byte-identical' },
				grounding: { curriculumComponentId: 'spec:4-5-2' }
			},
			{
				definition: { id: targetId, title: 'Newton challenge' },
				grounding: { curriculumComponentId: parentId }
			},
			{
				definition: { id: repairedId, title: 'Repair this rejected sibling' },
				grounding: { curriculumComponentId: 'spec:4-5-2' }
			}
		]
	};
	const priorValidation = {
		status: 'passed',
		candidateSha256: canonicalHash(priorCandidate)
	};
	const firstAssignmentCore = {
		schemaVersion: 'science-challenge-verification-assignment/v2',
		assignmentId: 'science-044',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		items: plan.rows.map((row, index) => ({
			planRowIndex: index,
			plan: row,
			candidate: priorCandidate.challenges[index]
		}))
	};
	const firstAssignment = {
		...firstAssignmentCore,
		evidenceSha256: canonicalHash(firstAssignmentCore)
	};
	const dispatchLedgerCore = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		dispatches: [
			{
				assignmentId: 'science-044',
				assignmentSha256: canonicalHash(firstAssignment),
				taskName: '/root/blind_verifier_gamma',
				orchestrator: 'codex-collaboration',
				forkTurns: 'none',
				model: 'gpt-5.6-sol',
				reasoningEffort: 'max'
			}
		]
	};
	const dispatchLedgerSha256 = canonicalHash(dispatchLedgerCore);
	const reviews = [
		reviewRow(acceptedId, true),
		{
			...reviewRow(targetId, true),
			curriculumGrounded: false,
			accepted: false,
			issues: [
				{
					field: SCIENCE_CHALLENGE_DESCENDANT_REMAP_FIELD,
					category: 'grounding',
					evidence: 'The candidate is specifically grounded in Newton’s Second Law.',
					repair: 'Bind the exact terminal Newton’s Second Law curriculum component.'
				}
			]
		},
		{
			...reviewRow(repairedId, true),
			scientificallyCorrect: false,
			accepted: false,
			issues: [
				{
					field: 'definition.strongerAnswer',
					category: 'science',
					evidence: 'The answer uses the wrong relationship.',
					repair: 'Correct the relationship.'
				}
			]
		}
	];
	const firstReviewResult = {
		schemaVersion: 'science-challenge-independent-verification/v1',
		assignmentId: 'science-044',
		assignmentEvidenceSha256: firstAssignment.evidenceSha256,
		verifier: {
			context: 'empty',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max',
			reviewedAt: '2026-07-23T00:00:00.000Z',
			provenance: {
				orchestrator: 'codex-collaboration',
				taskName: '/root/blind_verifier_gamma',
				forkTurns: 'none',
				dispatchLedgerSha256
			}
		},
		reviews
	};
	const firstReviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		dispatchLedgerSha256,
		status: 'failed',
		reviewCount: reviews.length,
		acceptedCount: reviews.filter((review) => review.accepted).length,
		rejectedCount: reviews.filter((review) => !review.accepted).length,
		issues: [],
		assignmentResults: [
			{
				assignmentId: 'science-044',
				sha256: canonicalHash(firstReviewResult),
				status: 'passed',
				issues: []
			}
		],
		reviews
	};
	const attempts = [1, 2, 3, 4].map((attempt) => {
		const matches = attempt === 1 || attempt === 3;
		const candidate = structuredClone(priorCandidate);
		candidate.challenges[1].grounding.curriculumComponentId = matches ? leafId : parentId;
		candidate.challenges[2].definition.title = `Repaired rejected sibling ${attempt}`;
		const runSummary = { status: 'passed', attempt, output: `immutable-${attempt}` };
		const sourceValidation = {
			status: 'failed',
			issues: matches
				? [
						`${targetId}: grounding.curriculumComponentId differs from the plan row.`,
						`${targetId}: grounding.curriculumComponentId differs from curriculum evidence.`
					]
				: [`${targetId}: rejected content was returned unchanged.`],
			candidateSha256: canonicalHash(candidate),
			runSummarySha256: canonicalHash(runSummary),
			verificationRepairCohortIssues: []
		};
		return {
			attempt,
			status: 'failed',
			candidate,
			runSummary,
			sourceValidation,
			runPolicy: { status: 'passed', issues: [] },
			fileBindings: {
				runSummarySha256: String(attempt).repeat(64).slice(0, 64),
				validationSha256: String(attempt + 4)
					.repeat(64)
					.slice(0, 64)
			}
		};
	});
	return {
		plan,
		curriculumEvidence,
		curriculumCatalog,
		shardId: 'science-044',
		priorCandidate,
		priorValidation,
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		dispatchLedger: dispatchLedgerCore,
		repairSha256: canonicalHash(firstReviewSummary),
		attempts,
		validateBatchCandidate: (candidate, rows, context) => ({
			status: context?.validationMode === 'base-plan-negative-control' ? 'failed' : 'passed',
			issues:
				context?.validationMode === 'base-plan-negative-control' ? ['typed-negative-control'] : [],
			candidateSha256: canonicalHash(candidate),
			planRowsSha256: canonicalHash(rows),
			planSha256: canonicalHash(context.effectivePlan ?? context.basePlan),
			candidateCount: candidate.challenges.length
		}),
		validateCollectionCandidate: (candidate, effectivePlan) => ({
			status: 'passed',
			issues: [],
			candidateSet: effectivePlan.rows.map((row) =>
				candidate.challenges.find((entry) => entry.definition.id === row.id)
			),
			candidateCount: effectivePlan.rows.length,
			candidateSetSha256: canonicalHash(
				effectivePlan.rows.map((row) =>
					candidate.challenges.find((entry) => entry.definition.id === row.id)
				)
			),
			effectivePlanSha256: canonicalHash(effectivePlan)
		})
	};
}

function expandToEightRows(fixture) {
	const additions = [
		{ id: 'physics-rejected-02', accepted: false },
		{ id: 'physics-rejected-03', accepted: false },
		{ id: 'physics-rejected-04', accepted: false },
		{ id: 'physics-rejected-05', accepted: false },
		{ id: 'physics-accepted-02', accepted: true }
	];
	for (const addition of additions) {
		fixture.plan.rows.push({
			...fixture.plan.rows[0],
			id: addition.id
		});
		fixture.priorCandidate.challenges.push({
			definition: { id: addition.id, title: `Prior ${addition.id}` },
			grounding: { curriculumComponentId: 'spec:4-5-2' }
		});
		for (const attempt of fixture.attempts) {
			attempt.candidate.challenges.push({
				definition: {
					id: addition.id,
					title: addition.accepted
						? `Prior ${addition.id}`
						: `Repaired ${addition.id} attempt ${attempt.attempt}`
				},
				grounding: { curriculumComponentId: 'spec:4-5-2' }
			});
		}
	}
	const reviews = [
		...fixture.firstReviewSummary.reviews,
		...additions.map((addition) =>
			addition.accepted
				? reviewRow(addition.id, true)
				: {
						...reviewRow(addition.id, true),
						scientificallyCorrect: false,
						accepted: false,
						issues: [
							{
								field: 'definition.strongerAnswer',
								category: 'science',
								evidence: `Synthetic defect for ${addition.id}.`,
								repair: `Repair ${addition.id}.`
							}
						]
					}
		)
	];
	fixture.priorValidation.candidateSha256 = canonicalHash(fixture.priorCandidate);
	const assignmentCore = {
		schemaVersion: 'science-challenge-verification-assignment/v2',
		assignmentId: fixture.shardId,
		planId: fixture.plan.planId,
		planSha256: canonicalHash(fixture.plan),
		curriculumEvidenceSha256: canonicalHash(fixture.curriculumEvidence),
		items: fixture.plan.rows.map((row, index) => ({
			planRowIndex: index,
			plan: row,
			candidate: fixture.priorCandidate.challenges[index]
		}))
	};
	fixture.firstAssignment = {
		...assignmentCore,
		evidenceSha256: canonicalHash(assignmentCore)
	};
	fixture.dispatchLedger.dispatches[0].assignmentSha256 = canonicalHash(fixture.firstAssignment);
	const dispatchLedgerSha256 = canonicalHash(fixture.dispatchLedger);
	fixture.firstReviewResult.assignmentEvidenceSha256 = fixture.firstAssignment.evidenceSha256;
	fixture.firstReviewResult.verifier.provenance.dispatchLedgerSha256 = dispatchLedgerSha256;
	fixture.firstReviewResult.reviews = reviews;
	fixture.firstReviewSummary.reviews = reviews;
	rebindReviewEnvelope(fixture, dispatchLedgerSha256);
	for (const attempt of fixture.attempts) {
		attempt.sourceValidation.candidateSha256 = canonicalHash(attempt.candidate);
	}
	return fixture;
}

function rebindReviewEnvelope(
	fixture,
	dispatchLedgerSha256 = canonicalHash(fixture.dispatchLedger)
) {
	fixture.firstReviewSummary.planSha256 = canonicalHash(fixture.plan);
	fixture.firstReviewSummary.curriculumEvidenceSha256 = canonicalHash(fixture.curriculumEvidence);
	fixture.firstReviewSummary.reviewCount = fixture.firstReviewSummary.reviews.length;
	fixture.firstReviewSummary.acceptedCount = fixture.firstReviewSummary.reviews.filter(
		(review) => review.accepted
	).length;
	fixture.firstReviewSummary.rejectedCount =
		fixture.firstReviewSummary.reviews.length - fixture.firstReviewSummary.acceptedCount;
	fixture.firstReviewSummary.dispatchLedgerSha256 = dispatchLedgerSha256;
	fixture.firstReviewSummary.assignmentResults[0].sha256 = canonicalHash(fixture.firstReviewResult);
	fixture.repairSha256 = canonicalHash(fixture.firstReviewSummary);
}

function rebuildFirstAssignment(fixture) {
	const assignmentCore = {
		schemaVersion: 'science-challenge-verification-assignment/v2',
		assignmentId: fixture.shardId,
		planId: fixture.plan.planId,
		planSha256: canonicalHash(fixture.plan),
		curriculumEvidenceSha256: canonicalHash(fixture.curriculumEvidence),
		items: fixture.plan.rows.map((row, index) => ({
			planRowIndex: index,
			plan: row,
			candidate: fixture.priorCandidate.challenges[index]
		}))
	};
	fixture.firstAssignment = {
		...assignmentCore,
		evidenceSha256: canonicalHash(assignmentCore)
	};
	fixture.dispatchLedger.dispatches[0].assignmentSha256 = canonicalHash(fixture.firstAssignment);
	fixture.firstReviewResult.assignmentEvidenceSha256 = fixture.firstAssignment.evidenceSha256;
	const dispatchLedgerSha256 = canonicalHash(fixture.dispatchLedger);
	fixture.firstReviewResult.verifier.provenance.dispatchLedgerSha256 = dispatchLedgerSha256;
	fixture.firstReviewSummary.assignmentResults[0].sha256 = canonicalHash(fixture.firstReviewResult);
}

function reviewRow(id, accepted) {
	return {
		id,
		...Object.fromEntries(SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])),
		checkedCalculations: [],
		issues: [],
		accepted
	};
}

function component(id, parentId, code, title, page) {
	return {
		id,
		parentId,
		code,
		title,
		kind: 'topic',
		sourcePageStart: page,
		sourcePageEnd: page
	};
}
