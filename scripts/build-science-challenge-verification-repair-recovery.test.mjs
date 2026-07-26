import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN
} from './lib/science-challenge-direct-preflight.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA,
	buildSameCurriculumComponentPeerEvidence
} from './lib/science-challenge-verification-peers.mjs';
import { canonicalHash, sha256, stableStringify } from './lib/science-challenge-release.mjs';

const nodePath = process.execPath;
const scriptPath = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'build-science-challenge-verification-repair-recovery.mjs'
);
const emptySha256 = sha256('');

test('recovery CLI help exits before any input read or write', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-recovery-cli-help-'));
	try {
		const result = runCli(root, ['--help']);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /--dry-run/);
		assert.equal(existsSync(path.join(root, 'tmp')), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('recovery CLI rejects invalid options and incompatible policies before reads or writes', () => {
	const cases = [
		[['--direct-part-size=0'], /integer from 1 to 7/],
		[['--direct-part-size=8'], /integer from 1 to 7/],
		[['--transport=codex-sdk', '--response-mode=prompt-json'], /llm-direct/],
		[['--transport=codex-sdk', '--direct-part-size=2'], /llm-direct/],
		[['--model=another-model'], /requires model chatgpt-gpt-5\.6-sol/],
		[['--response-mode=structured-json', '--thinking-level=high'], /thinking level must be max/],
		[['--response-mode=unknown'], /response mode must be prompt-json or structured-json/],
		[['--dry-run=true'], /boolean flag/],
		[['--plan=a.json', '--plan=b.json'], /Duplicate option --plan/]
	];
	for (const [extraArgs, expected] of cases) {
		const root = mkdtempSync(path.join(tmpdir(), 'science-recovery-cli-invalid-'));
		try {
			const result = runCli(root, [
				'--plan=missing-plan.json',
				'--repair-verification=missing-verification.json',
				'--pre-model-root=missing-predecessor',
				'--successor-root=missing-successor',
				'--preflight=missing-preflight.json',
				...extraArgs
			]);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, expected);
			assert.equal(existsSync(path.join(root, 'tmp')), false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	}
});

test('recovery CLI dry-run validates two predecessors and a successor without writes', () => {
	const fixture = makeRecoveryCliFixture();
	try {
		const result = runCli(fixture.root, recoveryArgs(fixture, ['--dry-run']));
		assert.equal(result.status, 0, result.stderr);
		const output = JSON.parse(result.stdout);
		assert.equal(output.status, 'planned');
		assert.equal(output.dryRun, true);
		assert.equal(output.preModelAttempts, 408);
		assert.equal(output.importedModelBearingAttempts, 0);
		assert.deepEqual(output.plannedModelBearingAttemptImports, []);
		assert.equal(output.plannedMutations.bindSuccessorRoot, true);
		assert.equal(existsSync(path.join(fixture.root, 'tmp')), false);
		assert.equal(existsSync(fixture.outputPath), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('recovery CLI rejects edited independent review evidence before creating a global ledger', () => {
	const fixture = makeRecoveryCliFixture();
	try {
		const summary = JSON.parse(readFileSync(fixture.verificationPath, 'utf8'));
		summary.reviews[0].issues[0].repair = 'edited after independent review';
		writeJson(fixture.verificationPath, summary);
		const result = runCli(fixture.root, recoveryArgs(fixture));
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /repair-review objective validation failed/i);
		assert.equal(existsSync(path.join(fixture.root, 'tmp')), false);
		assert.equal(existsSync(fixture.outputPath), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('recovery CLI refuses typed review-rebase clone recovery without full authority replay', () => {
	const fixture = makeRecoveryCliFixture();
	try {
		const summary = JSON.parse(readFileSync(fixture.verificationPath, 'utf8'));
		const firstResultPath = path.resolve(fixture.root, summary.assignmentResults[0].path);
		const firstResult = JSON.parse(readFileSync(firstResultPath, 'utf8'));
		firstResult.reviews = [acceptedReview(summary.reviews[0].id)];
		writeJson(firstResultPath, firstResult);
		summary.assignmentResults[0].sha256 = canonicalHash(firstResult);
		summary.reviews[0] = acceptedReview(summary.reviews[0].id);
		summary.acceptedCount = summary.reviews.length;
		summary.rejectedCount = 0;
		const targetIds = [summary.reviews[0].id];
		const remediations = [
			{
				issue: 'Frozen deterministic collection collision.',
				preferredChallengeId: targetIds[0]
			}
		];
		Object.assign(summary, {
			reviewRebaseManifestSha256: '1'.repeat(64),
			reviewRebaseId: '2'.repeat(64),
			reviewRebaseCandidateSetSha256: summary.candidateSetSha256,
			reviewRebaseCollectionValidationSha256: '3'.repeat(64),
			reviewRebaseCollectionRemediationSetSha256: canonicalHash(remediations),
			reviewRebaseCollectionRemediations: remediations,
			reviewRebaseCollectionRemediationTargetIds: targetIds,
			reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
		});
		writeJson(fixture.verificationPath, summary);
		const result = runCli(fixture.root, recoveryArgs(fixture));
		assert.notEqual(result.status, 0);
		assert.match(
			result.stderr,
			/Typed review-rebase objectives cannot use pre-model clone recovery/
		);
		assert.equal(existsSync(path.join(fixture.root, 'tmp')), false);
		assert.equal(existsSync(fixture.outputPath), false);
	} finally {
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

function runCli(cwd, args) {
	return spawnSync(nodePath, [scriptPath, ...args], {
		cwd,
		encoding: 'utf8'
	});
}

function recoveryArgs(fixture, extras = []) {
	return [
		`--plan=${fixture.planPath}`,
		`--repair-verification=${fixture.verificationPath}`,
		`--pre-model-root=${fixture.firstPredecessor}`,
		`--pre-model-root=${fixture.secondPredecessor}`,
		`--successor-root=${fixture.successorRoot}`,
		`--preflight=${fixture.preflightPath}`,
		`--output=${fixture.outputPath}`,
		...extras
	];
}

function makeRecoveryCliFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'science-recovery-cli-'));
	const planRoot = path.join(root, 'operation');
	const verificationRoot = path.join(root, 'verification');
	const assignmentsRoot = path.join(verificationRoot, 'assignments');
	const reviewsRoot = path.join(verificationRoot, 'reviews');
	const firstPredecessor = path.join(planRoot, 'predecessor-a');
	const secondPredecessor = path.join(planRoot, 'predecessor-b');
	const successorRoot = path.join(planRoot, 'successor');
	mkdirSync(assignmentsRoot, { recursive: true });
	mkdirSync(reviewsRoot, { recursive: true });
	mkdirSync(firstPredecessor, { recursive: true });
	mkdirSync(secondPredecessor, { recursive: true });
	mkdirSync(successorRoot, { recursive: true });

	const sourceSnapshot = {
		schemaVersion: 'science-source-fixture/v1',
		questions: Array.from({ length: 51 }, (_unused, index) => ({
			id: `source-${String(index + 1).padStart(3, '0')}`,
			contentSha256: canonicalHash({ source: index + 1 })
		}))
	};
	const sourcePath = path.join(root, 'source.json');
	writeJson(sourcePath, sourceSnapshot);
	const curriculumEvidence = {
		schemaVersion: 'science-curriculum-evidence/v1',
		planId: 'science-recovery-fixture',
		catalogSha256: 'a'.repeat(64),
		components: Array.from({ length: 51 }, (_unused, index) => ({
			componentId: `component-${String(index + 1).padStart(3, '0')}`
		}))
	};
	const curriculumEvidencePath = path.join(planRoot, 'curriculum-evidence.json');
	writeJson(curriculumEvidencePath, curriculumEvidence);
	const rows = Array.from({ length: 51 }, (_unused, index) => {
		const number = String(index + 1).padStart(3, '0');
		return {
			id: `biology-recovery-${number}`,
			subject: 'biology',
			specificationId: 'aqa-gcse-biology-fixture',
			specificationSha256: 'b'.repeat(64),
			chapterId: `chapter-${number}`,
			chapterCode: `4.${index + 1}`,
			chapterTitle: `Chapter ${index + 1}`,
			curriculumComponentId: `component-${number}`,
			curriculumCode: `4.${index + 1}.1`,
			curriculumTitle: `Component ${index + 1}`,
			calibrationQuestionId: `source-${number}`,
			calibrationQuestionSha256: sourceSnapshot.questions[index].contentSha256,
			difficulty: 'standard',
			taskShape: 'explanation',
			arc: 'connect-cause-to-effect',
			mechanic: 'missing-link',
			shard: `science-${number}`
		};
	});
	const plan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-recovery-fixture',
		createdOn: '2026-07-23',
		targetFinalCatalogueRounds: 51,
		existingRoundCount: 0,
		generatedRoundCount: 51,
		generatedQuestionContextCount: 102,
		targetFinalQuestionContextCount: 102,
		uniqueIllustrationPairCount: 102,
		uniqueFinalIllustrationAssetCount: 204,
		sourceSnapshotPath: path.relative(root, sourcePath),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		rows
	};
	const planPath = path.join(planRoot, 'plan.json');
	writeJson(planPath, plan);
	const candidateById = new Map(rows.map((row) => [row.id, { definition: { id: row.id } }]));
	const assignmentValues = new Map();
	const assignments = rows.map((row, index) => {
		const assignmentCore = {
			schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_ASSIGNMENT_SCHEMA,
			assignmentId: row.shard,
			planSha256: canonicalHash(plan),
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			items: [
				{
					planRowIndex: index,
					plan: row,
					candidate: candidateById.get(row.id),
					sameCurriculumComponentPeerEvidence: buildSameCurriculumComponentPeerEvidence({
						currentRow: row,
						planRows: rows,
						candidateById
					})
				}
			]
		};
		const assignment = {
			...assignmentCore,
			evidenceSha256: canonicalHash(assignmentCore)
		};
		const assignmentPath = path.join(assignmentsRoot, `${row.shard}.json`);
		writeJson(assignmentPath, assignment);
		assignmentValues.set(row.shard, assignment);
		return {
			assignmentId: row.shard,
			path: path.relative(root, assignmentPath),
			sha256: canonicalHash(assignment),
			ids: [row.id]
		};
	});
	const orderedCandidates = rows.map((row) => candidateById.get(row.id));
	const index = {
		schemaVersion: 'science-challenge-verification-assignment-index/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: canonicalHash(orderedCandidates),
		assignments
	};
	writeJson(path.join(verificationRoot, 'assignment-index.json'), index);
	const dispatches = assignments.map((assignment, index) => ({
		assignmentId: assignment.assignmentId,
		assignmentPath: assignment.path,
		assignmentSha256: assignment.sha256,
		orchestrator: 'codex-collaboration',
		taskName: `/root/science_verify_${String(Math.floor(index / 17) + 1).padStart(3, '0')}`,
		forkTurns: 'none',
		model: 'gpt-5.6-sol',
		reasoningEffort: 'max'
	}));
	const ledger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		orchestrator: 'codex-collaboration',
		indexSha256: canonicalHash(index),
		createdAt: '2026-07-23T00:00:00.000Z',
		dispatches
	};
	writeJson(path.join(verificationRoot, 'dispatch-ledger.json'), ledger);
	const reviews = [];
	const assignmentResults = assignments.map((assignment, index) => {
		const row = rows[index];
		const review = index === 0 ? rejectedReview(row.id) : acceptedReview(row.id);
		reviews.push(review);
		const verifier = {
			context: 'empty',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max',
			reviewedAt: '2026-07-23T01:00:00.000Z',
			provenance: {
				orchestrator: 'codex-collaboration',
				taskName: dispatches[index].taskName,
				forkTurns: 'none',
				dispatchLedgerSha256: canonicalHash(ledger)
			}
		};
		const result = {
			schemaVersion: 'science-challenge-independent-verification/v1',
			assignmentId: assignment.assignmentId,
			assignmentEvidenceSha256: assignmentValues.get(assignment.assignmentId).evidenceSha256,
			verifier,
			reviews: [review]
		};
		const resultPath = path.join(reviewsRoot, `${assignment.assignmentId}.json`);
		writeJson(resultPath, result);
		return {
			assignmentId: assignment.assignmentId,
			path: path.relative(root, resultPath),
			sha256: canonicalHash(result),
			verifier,
			status: 'passed',
			issues: []
		};
	});
	const verification = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: canonicalHash(orderedCandidates),
		indexSha256: canonicalHash(index),
		dispatchLedgerSha256: canonicalHash(ledger),
		status: 'failed',
		assignmentCount: assignments.length,
		reviewCount: reviews.length,
		acceptedCount: reviews.length - 1,
		rejectedCount: 1,
		issues: [],
		assignmentResults,
		reviews
	};
	const verificationPath = path.join(verificationRoot, 'summary.json');
	writeJson(verificationPath, verification);
	for (const rootPath of [firstPredecessor, secondPredecessor, successorRoot]) {
		for (const row of rows) {
			writeJson(path.join(rootPath, 'shards', row.shard, 'candidate.json'), {
				challenges: [candidateById.get(row.id)]
			});
		}
	}
	for (const predecessor of [firstPredecessor, secondPredecessor]) {
		writePreModelEvidence(predecessor, rows, canonicalHash(verification));
	}
	const preflight = {
		schemaVersion: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_SCHEMA,
		status: 'passed',
		token: SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN,
		transport: 'llm-direct',
		authMode: 'configured-proxy',
		responseMode: 'prompt-json',
		provider: 'chatgpt',
		model: 'chatgpt-gpt-5.6-sol',
		modelVersion: null,
		thinkingLevel: 'high',
		durationMilliseconds: 1
	};
	const preflightPath = path.join(planRoot, 'preflight.json');
	writeJson(preflightPath, preflight);
	return {
		root,
		planPath,
		verificationPath,
		firstPredecessor,
		secondPredecessor,
		successorRoot,
		preflightPath,
		outputPath: path.join(planRoot, 'requested', 'recovery.json')
	};
}

function writePreModelEvidence(root, rows, verificationSha256) {
	for (const row of rows) {
		for (let attempt = 1; attempt <= 4; attempt += 1) {
			const attemptRoot = path.join(
				root,
				'shards',
				row.shard,
				`verification-repair-${verificationSha256.slice(0, 12)}-attempt-${String(attempt).padStart(
					2,
					'0'
				)}`
			);
			mkdirSync(attemptRoot, { recursive: true });
			const request = {
				model: 'chatgpt-gpt-5.6-sol',
				thinkingLevel: 'high',
				tools: []
			};
			const requestBytes = Buffer.from(`${stableStringify(request)}\n`);
			writeFileSync(path.join(attemptRoot, 'request.json'), requestBytes);
			for (const name of [
				'events.jsonl',
				'last-message.json',
				'thoughts.txt',
				'result-metadata.json'
			]) {
				writeFileSync(path.join(attemptRoot, name), '');
			}
			const summary = {
				status: 'failed',
				error: 'fetch failed: getaddrinfo ENOTFOUND api.openai.com',
				transport: 'llm-direct',
				authMode: 'configured-proxy',
				provider: null,
				model: request.model,
				modelVersion: null,
				thinkingLevel: request.thinkingLevel,
				blocked: null,
				usage: null,
				costUsd: null,
				commandActions: 0,
				failedCommandActions: 0,
				webSearches: 0,
				fileChanges: 0,
				toolCalls: 0,
				hostedTools: 0,
				events: 0,
				responseDeltas: 0,
				thoughtDeltas: 0,
				modelEvents: 0,
				usageEvents: 0,
				finalJsonEvents: 0,
				threadId: null,
				requestSha256: sha256(requestBytes),
				requestCanonicalSha256: canonicalHash(request),
				eventLogSha256: emptySha256,
				finalResponseSha256: emptySha256,
				lastMessageFileSha256: emptySha256,
				thoughtsSha256: emptySha256,
				resultMetadataSha256: null,
				parts: []
			};
			writeJson(path.join(attemptRoot, 'run-summary.json'), summary);
			writeJson(path.join(attemptRoot, 'validation.json'), {
				status: 'failed',
				verificationRepairSha256: verificationSha256,
				runSummarySha256: canonicalHash(summary),
				candidateSha256: null,
				rawCandidateSha256: null
			});
		}
	}
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

function rejectedReview(id) {
	return {
		...acceptedReview(id),
		scientificallyCorrect: false,
		issues: [
			{
				field: 'definition.strongerAnswer',
				category: 'science',
				evidence: 'The candidate contradicts the bound source evidence.',
				repair: 'Correct only the contradicted scientific statement.'
			}
		],
		accepted: false
	};
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}
