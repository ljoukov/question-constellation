import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildScienceChallengeAuthoringParts } from './science-challenge-authoring-parts.mjs';
import { runDirectScienceChallengeJsonTurn } from './science-challenge-direct-json-runner.mjs';
import { runDirectScienceChallengeMultipartTurn } from './science-challenge-direct-multipart-runner.mjs';
import {
	inspectScienceChallengeDescendantRemap,
	readScienceChallengeDescendantRemap,
	scienceChallengeDescendantRemapDirectory,
	stageScienceChallengeDescendantRemap
} from './science-challenge-descendant-remap-evidence.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	normalizeGeneratedChallengeBatch,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';
import {
	inspectVerificationRepairAttempts,
	scienceChallengeVerificationRepairRunId
} from './science-challenge-verification-repair-transaction.mjs';
import {
	bindVerificationRepairExecutionRecovery,
	claimVerificationRepairExecutionAttempt,
	initializeVerificationRepairExecutionLedger,
	scienceChallengeVerificationRepairExecutionIdentity,
	verificationRepairExecutionLedgerRoot,
	verificationRepairRecoveryManifestPath
} from './science-challenge-verification-repair-lineage.mjs';

const targetId = 'physics-newtons-second-law-01';
const acceptedId = 'physics-speed-01';
const parentId = 'aqa-gcse-physics-test:4-5-6-2';
const leafId = 'aqa-gcse-physics-test:4-5-6-2-2';
const specificationSha256 = 'a'.repeat(64);

test('stages and replays an atomic review-pending remap without attempt 5 or source mutation', async () => {
	const fixture = await descendantRemapEvidenceFixture();
	try {
		const sourceBytes = fixture.sourceFiles.map((filePath) => readFileSync(filePath));
		const inspected = inspectScienceChallengeDescendantRemap(fixture.options);
		assert.equal(inspected.status, 'passed', inspected.issues?.join('\n'));
		assert.equal(inspected.action, 'stage-review-pending-descendant-remap');
		assert.equal(inspected.sourceAttempt, 3);
		assert.equal(existsSync(fixture.recoveryDir), false);

		const staged = stageScienceChallengeDescendantRemap(fixture.options);
		assert.equal(staged.status, 'passed', staged.issues?.join('\n'));
		assert.equal(staged.validation.status, 'review-pending');
		assert.equal(staged.validation.sourceAttemptStatus, 'failed');
		assert.equal(staged.manifest.sourceAttempt.attempt, 3);
		assert.equal(staged.candidate.challenges[1].grounding.curriculumComponentId, leafId);
		assert.equal(staged.lineage.sourceAttemptStatus, 'failed');
		assert.equal(
			inspectVerificationRepairAttempts({
				shardDir: fixture.shardDir,
				repairSha256: fixture.options.repairSha256,
				maxAttempts: 4
			}).attempts.length,
			4
		);
		for (const [index, filePath] of fixture.sourceFiles.entries()) {
			assert.deepEqual(readFileSync(filePath), sourceBytes[index]);
		}

		const replay = readScienceChallengeDescendantRemap(fixture.options);
		assert.equal(replay.status, 'passed', replay.issues?.join('\n'));
		assert.equal(replay.manifest.manifestCoreSha256, staged.manifest.manifestCoreSha256);
		assert.equal(replay.lineage.provenanceSha256, canonicalHash(replay.provenance));
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('fails closed on source candidate and staged artifact tampering', async () => {
	const sourceFixture = await descendantRemapEvidenceFixture();
	try {
		const candidatePath = sourceFixture.sourceCandidatePaths[2];
		const candidate = readJson(candidatePath);
		candidate.challenges[0].definition.title = 'tampered accepted row';
		writeJson(candidatePath, candidate);
		const result = inspectScienceChallengeDescendantRemap(sourceFixture.options);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /candidate\.json differs/u);
		assert.equal(existsSync(sourceFixture.recoveryDir), false);
	} finally {
		rmSync(sourceFixture.root, { recursive: true, force: true });
	}

	const stagedFixture = await descendantRemapEvidenceFixture();
	try {
		const staged = stageScienceChallengeDescendantRemap(stagedFixture.options);
		assert.equal(staged.status, 'passed', staged.issues?.join('\n'));
		writeFileSync(
			staged.artifactPaths.candidate,
			`${readFileSync(staged.artifactPaths.candidate)} `
		);
		const replay = readScienceChallengeDescendantRemap(stagedFixture.options);
		assert.equal(replay.status, 'failed');
		assert.match(replay.issues.join('\n'), /candidate bytes differ/u);
	} finally {
		rmSync(stagedFixture.root, { recursive: true, force: true });
	}
});

test('refuses a pre-existing partial final directory rather than completing it in place', async () => {
	const fixture = await descendantRemapEvidenceFixture();
	try {
		mkdirSync(fixture.recoveryDir);
		writeJson(path.join(fixture.recoveryDir, 'candidate.json'), fixture.priorCandidate);
		const result = stageScienceChallengeDescendantRemap(fixture.options);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /only partially present/u);
		assert.equal(existsSync(path.join(fixture.recoveryDir, 'manifest.json')), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('rejects ambiguous coexistence with multipart recovery lineage', async () => {
	const fixture = await descendantRemapEvidenceFixture();
	try {
		mkdirSync(
			path.join(
				fixture.shardDir,
				`verification-repair-${fixture.options.repairSha256.slice(0, 12)}-multipart-plan-salvage`
			)
		);
		const result = inspectScienceChallengeDescendantRemap(fixture.options);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /cannot coexist/u);
		assert.equal(existsSync(fixture.recoveryDir), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('rejects a source ledger whose fourth validation was already passed', async () => {
	const fixture = await descendantRemapEvidenceFixture();
	try {
		const validationPath = fixture.sourceValidationPaths[3];
		const validation = readJson(validationPath);
		validation.status = 'passed';
		writeJson(validationPath, validation);
		const result = inspectScienceChallengeDescendantRemap(fixture.options);
		assert.equal(result.status, 'failed');
		assert.match(
			result.issues.join('\n'),
			/every exhausted source attempt to retain failed validation status/u
		);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('rejects a stale prior-candidate-set execution identity before source replay', async () => {
	const fixture = await descendantRemapEvidenceFixture();
	try {
		fixture.options.expectedExecutionIdentity = {
			...fixture.options.expectedExecutionIdentity,
			priorCandidateSetSha256: 'f'.repeat(64)
		};
		const result = inspectScienceChallengeDescendantRemap(fixture.options);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /prior candidate set/u);
		assert.equal(existsSync(fixture.recoveryDir), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('rejects authoring rows or answer-position inputs that differ from the frozen shard plan', async () => {
	const rowsFixture = await descendantRemapEvidenceFixture();
	try {
		rowsFixture.options.rows = [...rowsFixture.options.rows].reverse();
		const result = inspectScienceChallengeDescendantRemap(rowsFixture.options);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /authoring rows or inputs differ/u);
	} finally {
		rmSync(rowsFixture.root, { recursive: true, force: true });
	}

	const inputsFixture = await descendantRemapEvidenceFixture();
	try {
		inputsFixture.options.inputs[0].plan.expectedAnswerPositions.strongerAnswer = 'b';
		inputsFixture.options.inputSha256 = canonicalHash({
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			inputs: inputsFixture.options.inputs,
			priorCandidateSha256: canonicalHash(inputsFixture.options.priorCandidate),
			verificationSummarySha256: inputsFixture.options.repairSha256
		});
		const result = inspectScienceChallengeDescendantRemap(inputsFixture.options);
		assert.equal(result.status, 'failed');
		assert.match(result.issues.join('\n'), /authoring rows or inputs differ/u);
	} finally {
		rmSync(inputsFixture.root, { recursive: true, force: true });
	}
});

async function descendantRemapEvidenceFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'science-descendant-remap-'));
	try {
		const outputRoot = path.join(root, 'generation');
		const shardId = 'science-044';
		const shardDir = path.join(outputRoot, 'shards', shardId);
		mkdirSync(shardDir, { recursive: true });
		const curriculumCatalog = {
			schemaVersion: 'curriculum-catalog/v1',
			specifications: [
				{
					id: 'aqa-gcse-physics-test',
					components: [
						catalogComponent('aqa-gcse-physics-test:4', null, '4', 'Physics', 1),
						catalogComponent(
							'aqa-gcse-physics-test:4-5',
							'aqa-gcse-physics-test:4',
							'4.5',
							'Forces',
							50
						),
						catalogComponent(
							'aqa-gcse-physics-test:4-5-2',
							'aqa-gcse-physics-test:4-5',
							'4.5.2',
							'Speed',
							50
						),
						catalogComponent(
							parentId,
							'aqa-gcse-physics-test:4-5',
							'4.5.6.2',
							"Forces, accelerations and Newton's Laws of motion",
							54
						),
						catalogComponent(leafId, parentId, '4.5.6.2.2', "Newton's Second Law", 54)
					]
				}
			]
		};
		const curriculumCatalogSha256 = canonicalHash(curriculumCatalog);
		const plan = {
			schemaVersion: 'science-challenge-plan/v1',
			planId: 'science-remap-test-v1',
			curriculumCatalogSha256,
			rows: [
				planRow(acceptedId, 'aqa-gcse-physics-test:4-5-2', '4.5.2', 'Speed', 50, 0),
				planRow(
					targetId,
					parentId,
					'4.5.6.2',
					"Forces, accelerations and Newton's Laws of motion",
					54,
					1
				)
			]
		};
		const curriculumEvidence = {
			schemaVersion: 'science-challenge-curriculum-evidence/v1',
			planId: plan.planId,
			catalogSha256: curriculumCatalogSha256,
			components: [
				evidenceComponent(
					'aqa-gcse-physics-test:4-5-2',
					'4.5.2',
					'Speed',
					50,
					'Speed is the distance travelled by an object divided by the time taken for the complete journey.',
					'b'
				),
				evidenceComponent(
					parentId,
					'4.5.6.2',
					"Forces, accelerations and Newton's Laws of motion",
					54,
					"4.5.6.2 Forces, accelerations and Newton's Laws of motion",
					'c'
				),
				evidenceComponent(
					leafId,
					'4.5.6.2.2',
					"Newton's Second Law",
					54,
					"4.5.6.2.2 Newton's Second Law\nThe acceleration of an object is proportional to the resultant force acting on it and inversely proportional to its mass.",
					'd'
				)
			]
		};
		const priorCandidate = {
			schemaVersion: 'science-challenge-batch/v1',
			challenges: [
				challenge(acceptedId, 'Speed stays accepted', 'aqa-gcse-physics-test:4-5-2'),
				challenge(targetId, 'Newton target stays otherwise exact', parentId)
			]
		};
		const priorValidation = {
			status: 'passed',
			issues: [],
			candidateSha256: canonicalHash(priorCandidate)
		};
		const firstReviewEnvelope = reviewEnvelope({
			plan,
			curriculumEvidence,
			priorCandidate,
			shardId
		});
		const repairSha256 = canonicalHash(firstReviewEnvelope.summary);
		const inputs = plan.rows.map((row, index) => ({
			plan: {
				...row,
				expectedAnswerPositions: {
					strongerAnswer: index % 2 === 0 ? 'a' : 'b',
					diagnosisCorrectIndex: index % 3,
					repairCorrectIndex: (index + 1) % 3,
					transferCorrectIndex: (index + 2) % 3
				}
			},
			curriculum: curriculumEvidence.components.find(
				(component) => component.componentId === row.curriculumComponentId
			),
			calibrationEvidence: {
				id: row.calibrationQuestionId,
				contentSha256: row.calibrationQuestionSha256
			},
			shardIndex: index
		}));
		const inputSha256 = canonicalHash({
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			inputs,
			priorCandidateSha256: canonicalHash(priorCandidate),
			verificationSummarySha256: repairSha256
		});
		const identity = scienceChallengeVerificationRepairExecutionIdentity({
			planSha256: canonicalHash(plan),
			verificationSha256: repairSha256,
			priorCandidateSetSha256: firstReviewEnvelope.summary.candidateSetSha256,
			model: 'chatgpt-gpt-5.6-sol',
			transport: 'llm-direct',
			responseMode: 'structured-json',
			thinkingLevel: 'max',
			directPartSize: 1
		});
		const ledgerRoot = verificationRepairExecutionLedgerRoot(root, identity.objectiveId);
		initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
		const sourceFiles = [];
		const sourceCandidatePaths = [];
		const sourceValidationPaths = [];
		const promptsByAttempt = new Map();
		for (let attempt = 1; attempt <= 4; attempt += 1) {
			claimVerificationRepairExecutionAttempt({
				ledgerRoot,
				identity,
				shardId,
				attempt,
				outputRoot
			});
			const attemptDirectory = `verification-repair-${repairSha256.slice(
				0,
				12
			)}-attempt-${String(attempt).padStart(2, '0')}`;
			const attemptDir = path.join(shardDir, attemptDirectory);
			const candidate = structuredClone(priorCandidate);
			if (attempt === 1 || attempt === 3) {
				candidate.challenges[1].grounding.curriculumComponentId = leafId;
			}
			const parts = buildScienceChallengeAuthoringParts({
				rows: plan.rows,
				inputs,
				partSize: 1
			});
			const partPrompts = parts.map(
				(part) => `Canonical remap attempt ${attempt} prompt for ${part.partId}.`
			);
			const orchestrationPrompt = `Canonical remap orchestration attempt ${attempt}.`;
			promptsByAttempt.set(attempt, {
				expectedPromptBytes: Buffer.from(`${orchestrationPrompt}\n`),
				expectedPartPrompts: partPrompts
			});
			let partIndex = 0;
			await runDirectScienceChallengeMultipartTurn({
				parts: parts.map((part, index) => ({ ...part, prompt: partPrompts[index] })),
				partSize: 1,
				attemptDir,
				orchestrationPrompt,
				inputSha256,
				responseMode: 'structured-json',
				thinkingLevel: 'max',
				runPartImpl: (options) => {
					const batch = {
						schemaVersion: 'science-challenge-batch/v1',
						challenges: [candidate.challenges[partIndex]]
					};
					const streamJsonImpl = successfulDirectStream(batch, attempt, partIndex);
					partIndex += 1;
					return runDirectScienceChallengeJsonTurn({ ...options, streamJsonImpl });
				}
			});
			const externalPromptPath = path.join(
				shardDir,
				`verification-repair-${repairSha256.slice(0, 12)}-prompt-attempt-${attempt}.txt`
			);
			writeFileSync(externalPromptPath, `${orchestrationPrompt}\n`);
			const runSummaryPath = path.join(attemptDir, 'run-summary.json');
			const runSummary = readJson(runSummaryPath);
			const rawCandidate = readJson(path.join(attemptDir, 'last-message.json'));
			const normalizedCandidate = normalizeGeneratedChallengeBatch(rawCandidate);
			const candidatePath = path.join(attemptDir, 'candidate.json');
			writeJson(candidatePath, normalizedCandidate);
			const validation = {
				status: 'failed',
				issues:
					attempt === 1 || attempt === 3
						? ['typed-base-plan-negative-control', 'typed-evidence-negative-control']
						: ['typed-rejected-row-unchanged'],
				inputSha256,
				verificationRepairSha256: repairSha256,
				verificationRepairCohortIssues: [],
				priorCandidateSha256: canonicalHash(priorCandidate),
				rawCandidateSha256: canonicalHash(rawCandidate),
				candidateSha256: canonicalHash(normalizedCandidate),
				normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
				promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
				promptSha256: sha256(readFileSync(externalPromptPath)),
				runSummarySha256: canonicalHash(runSummary),
				transport: runSummary.transport,
				transportVersion: runSummary.transportVersion,
				responseMode: runSummary.responseMode,
				providerSchemaApplied: runSummary.providerSchemaApplied,
				provider: runSummary.provider,
				model: runSummary.model,
				modelVersion: null,
				modelVersions: runSummary.modelVersions,
				directPartSize: runSummary.partSize,
				thinkingLevel: runSummary.thinkingLevel,
				transportError: null
			};
			const validationPath = path.join(attemptDir, 'validation.json');
			writeJson(validationPath, validation);
			sourceFiles.push(
				runSummaryPath,
				validationPath,
				candidatePath,
				path.join(attemptDir, 'last-message.json'),
				externalPromptPath
			);
			sourceCandidatePaths.push(candidatePath);
			sourceValidationPaths.push(validationPath);
		}
		const recoveryManifest = {
			schemaVersion: 'science-challenge-verification-repair-recovery/v2',
			objectiveId: identity.objectiveId,
			executionId: identity.executionId,
			identity,
			historicalImport: true
		};
		writeJson(verificationRepairRecoveryManifestPath(ledgerRoot), recoveryManifest);
		bindVerificationRepairExecutionRecovery({
			ledgerRoot,
			identity,
			manifest: recoveryManifest,
			successorRoot: outputRoot
		});
		const repairDir = path.join(
			shardDir,
			`verification-repair-${scienceChallengeVerificationRepairRunId(repairSha256)}`
		);
		writeJson(path.join(repairDir, 'verification-summary.json'), firstReviewEnvelope.summary);
		writeJson(path.join(repairDir, 'prior-candidate.json'), priorCandidate);
		writeJson(path.join(repairDir, 'prior-validation.json'), priorValidation);
		const options = {
			resume: true,
			shardId,
			shardDir,
			outputRoot,
			workspaceRoot: root,
			repairSha256,
			expectedPlanSha256: canonicalHash(plan),
			expectedExecutionIdentity: identity,
			inputSha256,
			inputs,
			rows: plan.rows,
			plan,
			curriculumEvidence,
			curriculumCatalog,
			priorCandidate,
			priorValidation,
			firstReviewSummary: firstReviewEnvelope.summary,
			firstReviewResult: firstReviewEnvelope.result,
			firstAssignment: firstReviewEnvelope.assignment,
			dispatchLedger: firstReviewEnvelope.ledger,
			reconstructSourceEvidence: ({ attempt }) => promptsByAttempt.get(attempt),
			validateBatchCandidate: batchValidator,
			validateCollectionCandidate: collectionValidator
		};
		return {
			root,
			outputRoot,
			shardDir,
			priorCandidate,
			options,
			sourceFiles,
			sourceCandidatePaths,
			sourceValidationPaths,
			recoveryDir: scienceChallengeDescendantRemapDirectory({
				shardDir,
				repairSha256
			})
		};
	} catch (error) {
		rmSync(root, { recursive: true, force: true });
		throw error;
	}
}

function batchValidator(candidate, rows, context) {
	const base = context.validationMode === 'base-plan-negative-control';
	return {
		status: base ? 'failed' : 'passed',
		issues: base ? ['typed-base-plan-negative-control'] : [],
		candidateSha256: canonicalHash(candidate),
		planRowsSha256: canonicalHash(rows),
		planSha256: canonicalHash(context.effectivePlan ?? context.basePlan),
		candidateCount: candidate.challenges.length
	};
}

function collectionValidator(candidate, effectivePlan) {
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

function reviewEnvelope({ plan, curriculumEvidence, priorCandidate, shardId }) {
	const assignmentCore = {
		schemaVersion: 'science-challenge-verification-assignment/v2',
		assignmentId: shardId,
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		items: plan.rows.map((row, index) => ({
			planRowIndex: index,
			plan: row,
			candidate: priorCandidate.challenges[index]
		}))
	};
	const assignment = {
		...assignmentCore,
		evidenceSha256: canonicalHash(assignmentCore)
	};
	const ledger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		orchestrator: 'codex-collaboration',
		createdAt: '2026-07-23T00:00:00.000Z',
		dispatches: [
			{
				assignmentId: shardId,
				assignmentSha256: canonicalHash(assignment),
				taskName: '/root/blind_verifier_gamma',
				orchestrator: 'codex-collaboration',
				forkTurns: 'none',
				model: 'gpt-5.6-sol',
				reasoningEffort: 'max'
			}
		]
	};
	const ledgerSha256 = canonicalHash(ledger);
	const reviews = [
		acceptedReview(acceptedId),
		{
			...acceptedReview(targetId),
			curriculumGrounded: false,
			accepted: false,
			issues: [
				{
					field: 'grounding.curriculumComponentId',
					category: 'grounding',
					evidence: 'The row is specifically about Newton’s Second Law.',
					repair: 'Use the terminal Newton’s Second Law component.'
				}
			]
		}
	];
	const verifier = {
		context: 'empty',
		model: 'gpt-5.6-sol',
		reasoningEffort: 'max',
		reviewedAt: '2026-07-23T01:00:00.000Z',
		provenance: {
			orchestrator: 'codex-collaboration',
			taskName: '/root/blind_verifier_gamma',
			forkTurns: 'none',
			dispatchLedgerSha256: ledgerSha256
		}
	};
	const result = {
		schemaVersion: 'science-challenge-independent-verification/v1',
		assignmentId: shardId,
		assignmentEvidenceSha256: assignment.evidenceSha256,
		verifier,
		reviews
	};
	const summary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: canonicalHash(priorCandidate.challenges),
		dispatchLedgerSha256: ledgerSha256,
		status: 'failed',
		assignmentCount: 1,
		reviewCount: 2,
		acceptedCount: 1,
		rejectedCount: 1,
		issues: [],
		assignmentResults: [
			{
				assignmentId: shardId,
				sha256: canonicalHash(result),
				verifier,
				status: 'passed',
				issues: []
			}
		],
		reviews
	};
	return { summary, result, assignment, ledger };
}

function acceptedReview(id) {
	return {
		id,
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
		issues: [],
		accepted: true
	};
}

function planRow(id, componentId, code, title, page, index) {
	return {
		id,
		shard: 'science-044',
		subject: 'physics',
		specificationId: 'aqa-gcse-physics-test',
		specificationSha256,
		curriculumComponentId: componentId,
		curriculumCode: code,
		curriculumTitle: title,
		curriculumPageStart: page,
		curriculumPageEnd: page,
		calibrationQuestionId: `paper-question-${index + 1}`,
		calibrationQuestionSha256: String(index + 1).repeat(64),
		difficulty: 'standard',
		arc: 'track-the-forces',
		mechanic: 'first-wrong-step'
	};
}

function challenge(id, title, curriculumComponentId) {
	return {
		definition: { id, title },
		grounding: {
			curriculumComponentId,
			specificationId: 'aqa-gcse-physics-test',
			specificationSha256,
			calibrationQuestionId: id === acceptedId ? 'paper-question-1' : 'paper-question-2',
			calibrationQuestionSha256: id === acceptedId ? '1'.repeat(64) : '2'.repeat(64)
		}
	};
}

function catalogComponent(id, parentId, code, title, page) {
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

function evidenceComponent(componentId, code, title, page, sourceText, hashCharacter) {
	return {
		componentId,
		code,
		title,
		pageStart: page,
		pageEnd: page,
		sourceText,
		sourceTextSha256: hashCharacter.repeat(64),
		specificationId: 'aqa-gcse-physics-test',
		specificationSha256
	};
}

function successfulDirectStream(batch, attempt, partIndex) {
	const rawText = JSON.stringify(batch);
	const thoughts = `Checked remap attempt ${attempt} part ${partIndex + 1}.`;
	const modelVersion = `chatgpt-gpt-5.6-sol-remap-${attempt}-${partIndex + 1}`;
	const usage = {
		promptTokens: 10 + partIndex,
		responseTokens: 5,
		thinkingTokens: 3,
		totalTokens: 18 + partIndex
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

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}
