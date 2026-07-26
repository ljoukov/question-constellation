import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	canonicalHash,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';
import {
	buildScienceChallengeProvenanceArchive,
	scienceChallengeProvenanceBindings,
	validateScienceChallengeProvenanceArchive
} from './science-challenge-provenance-archive.mjs';
import {
	buildScienceChallengeCurriculumRemapProposal,
	buildScienceChallengeCurriculumRemapVerifierInput
} from './science-challenge-curriculum-remap-review.mjs';
import {
	stageScienceChallengeEffectiveCohort,
	stageScienceChallengeEffectiveCohortSuccessor
} from './science-challenge-effective-cohort.mjs';
import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA,
	publishScienceChallengeReviewRebaseEvidence,
	readScienceChallengeReviewRebaseEvidence
} from './science-challenge-review-rebase-evidence.mjs';
import { SCIENCE_CHALLENGE_REVIEW_REBASE_SPEC_SCHEMA } from './science-challenge-review-rebase.mjs';
import {
	relativeMultipartContinuationLineage,
	relativeMultipartPlanSalvageLineage,
	scienceChallengeReviewRebaseInfrastructureRecoveryProposalLineage
} from './science-challenge-materialization-lineage.mjs';
import { buildPassedScienceChallengeShortRecallArtifactsForTest } from './science-challenge-short-recall-test-fixture.mjs';

test('multipart plan salvage materialization does not invent invocation journals', () => {
	const rootDir = '/tmp/question-constellation';
	const absolute = (suffix) => `${rootDir}/${suffix}`;
	const relative = relativeMultipartPlanSalvageLineage(
		{
			manifestPath: absolute('salvage/manifest.json'),
			candidatePath: absolute('salvage/candidate.json'),
			validationPath: absolute('salvage/validation.json'),
			execution: {
				objectivePath: absolute('execution/objective.json'),
				objectiveSha256: 'a'.repeat(64),
				claims: [{ attempt: 4, path: absolute('execution/claims/attempt-04.json') }]
			},
			sourceAttempt: {
				attemptDir: absolute('generation/science-028/attempt-04'),
				partRecords: [],
				runSummaryPath: absolute('generation/science-028/attempt-04/run-summary.json'),
				validationPath: absolute('generation/science-028/attempt-04/validation.json'),
				eventLogPath: absolute('generation/science-028/attempt-04/events.jsonl'),
				lastMessagePath: absolute('generation/science-028/attempt-04/last-message.json'),
				promptPath: absolute('generation/science-028/prompt-attempt-4.txt'),
				candidatePath: absolute('generation/science-028/attempt-04/candidate.json')
			},
			repairEvidence: {
				verificationSummaryPath: absolute('repair/verification-summary.json'),
				priorCandidatePath: absolute('repair/prior-candidate.json'),
				priorValidationPath: absolute('repair/prior-validation.json')
			}
		},
		{ rootDir, multipartLineageParts: () => [] }
	);

	assert.equal(relative.execution.claims[0].path, 'execution/claims/attempt-04.json');
	assert.equal(Object.hasOwn(relative.execution.claims[0], 'invocationPath'), false);
	assert.equal(JSON.stringify(relative).includes(rootDir), false);
});

test('multipart continuation materialization makes every evidence path release-relative', () => {
	const rootDir = '/tmp/question-constellation';
	const absolute = (suffix) => `${rootDir}/${suffix}`;
	const relative = relativeMultipartContinuationLineage(
		{
			manifestPath: absolute('continuation/manifest.json'),
			planPath: absolute('continuation/plan.json'),
			candidatePath: absolute('continuation/candidate.json'),
			validationPath: absolute('continuation/validation.json'),
			execution: {
				objectivePath: absolute('execution/objective.json'),
				claims: [
					{
						path: absolute('execution/claims/part-03.json'),
						invocationPath: absolute('execution/claims/part-03-invocation.json')
					}
				]
			},
			collectionValidationSnapshot: {
				path: absolute('continuation/collection-validation.json')
			},
			priorCollectionFailureEvidence: {
				path: absolute('continuation/failure.json')
			},
			sourceAttempt: {
				attemptDir: absolute('generation/science-016/attempt-04'),
				files: {
					runSummary: absolute('generation/science-016/attempt-04/run-summary.json')
				},
				partFiles: [
					{
						paths: {
							response: absolute('generation/science-016/attempt-04/parts/part-01/response.json')
						}
					}
				]
			},
			continuationParts: [
				{
					claimPath: absolute('execution/claims/part-03.json'),
					paths: {
						response: absolute('continuation/parts/part-03/response.json')
					}
				}
			]
		},
		{ rootDir }
	);

	assert.equal(
		relative.execution.claims[0].invocationPath,
		'execution/claims/part-03-invocation.json'
	);
	assert.equal(
		relative.collectionValidationSnapshot.path,
		'continuation/collection-validation.json'
	);
	assert.equal(relative.priorCollectionFailureEvidence.path, 'continuation/failure.json');
	assert.equal(JSON.stringify(relative).includes(rootDir), false);
});

test('recovery-origin materialization binds the terminal logical proposal without source paths or attempt five', () => {
	const candidate = { schemaVersion: 'candidate/v1', challenges: [] };
	const validation = {
		schemaVersion: 'validation/v1',
		status: 'passed',
		candidateSha256: canonicalHash(candidate)
	};
	const proposal = {
		shardId: 'science-001',
		origin: 'recovery-invocation-proposal',
		logicalContentOrdinal: 4,
		candidatePath: 'recovery/recovery-proposals/science-001/candidate.json',
		candidateSha256: canonicalHash(candidate),
		candidate,
		validationPath: 'recovery/recovery-proposals/science-001/validation.json',
		validationSha256: canonicalHash(validation),
		validation
	};
	const binding = {
		manifestPath: 'recovery/verification-repair-infrastructure-recovery.json',
		manifestSha256: 'a'.repeat(64),
		recoveryId: 'b'.repeat(64),
		recoveryExecutionId: 'c'.repeat(64),
		failedRootInventorySha256: 'd'.repeat(64),
		logicalLedgerSha256: 'e'.repeat(64),
		preservedProposalSetSha256: 'f'.repeat(64),
		finalProposalSetSha256: '1'.repeat(64),
		contentNamespaceId: '2'.repeat(64)
	};
	const lineage = scienceChallengeReviewRebaseInfrastructureRecoveryProposalLineage({
		infrastructureRecoveryBinding: binding,
		infrastructureRecoveryTerminal: {
			status: 'passed',
			finalProposals: [proposal]
		},
		shard: {
			shardId: 'science-001',
			lineage: { attempt: 4 }
		},
		candidate,
		validation
	});
	assert.equal(lineage.logicalContentOrdinal, 4);
	assert.equal(lineage.terminalProposalSha256, canonicalHash(proposal));
	assert.equal(JSON.stringify(lineage).includes('candidatePath'), false);
	assert.equal(JSON.stringify(lineage).includes('/tmp/'), false);
	assert.throws(
		() =>
			scienceChallengeReviewRebaseInfrastructureRecoveryProposalLineage({
				infrastructureRecoveryBinding: binding,
				infrastructureRecoveryTerminal: {
					status: 'passed',
					finalProposals: [{ ...proposal, logicalContentOrdinal: 5 }]
				},
				shard: {
					shardId: 'science-001',
					lineage: { attempt: 5 }
				},
				candidate,
				validation
			}),
		/terminal logical recovery proposal/
	);
});

test('projects only the exact cycle-free accepted-release bindings', () => {
	const fixture = buildFixture();
	assert.deepEqual(
		scienceChallengeProvenanceBindings({
			...fixture.bindings,
			provenanceArchiveSha256: hash('must not enter its own manifest'),
			materializedAt: '2026-07-21T00:00:00.000Z'
		}),
		fixture.bindings
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects short-recall provenance binding tampering', () => {
	const fixture = buildFixture();
	const archiveRoot = buildFixtureArchive(fixture);
	const manifestPath = path.join(archiveRoot, 'manifest.json');
	const manifest = readJson(manifestPath);
	manifest.bindings.shortRecallBundleSha256 = hash('tampered short-recall bundle');
	manifest.bindings.shortRecallReviewSha256 = hash('tampered short-recall review');
	writeJson(manifestPath, manifest);

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /bindings\.shortRecallBundleSha256 differs/);
	assert.match(validation.issues.join('\n'), /bindings\.shortRecallReviewSha256 differs/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('builds a durable sanitized archive that survives tmp workspace cleanup', () => {
	const fixture = buildFixture();
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	const built = buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});

	assert.equal(built.validation.status, 'passed');
	assert.equal(built.manifestSha256, canonicalHash(built.manifest));
	const serializedManifest = JSON.stringify(built.manifest);
	assert.doesNotMatch(serializedManifest, /licensed source wording/i);
	assert.doesNotMatch(serializedManifest, /agent-secret-123/i);
	assert.doesNotMatch(serializedManifest, /\/root\/science_verify_001/i);
	assert.equal(
		built.manifest.trackedArtifacts.some((artifact) => /events\.jsonl$/.test(artifact.path)),
		false
	);
	assert.equal(
		built.manifest.externalDependencies.filter(
			(dependency) => dependency.kind === 'codex-event-log'
		).length,
		2
	);
	const archivedPrompt = readFileSync(
		path.join(archiveRoot, 'content/shards/science-001/prompts/prompt-attempt-1.txt'),
		'utf8'
	);
	assert.match(archivedPrompt, /official authoring input omitted from tracked archive/);
	assert.doesNotMatch(archivedPrompt, /licensed source wording/i);
	assert.equal(
		built.manifest.externalDependencies.filter(
			(dependency) => dependency.kind === 'full-content-prompt'
		).length,
		1
	);
	const artReviewPolicy = readJson(
		path.join(archiveRoot, 'reviews/art/batches/art-review-001/run-policy.json')
	);
	assert.equal(artReviewPolicy.policyVersion, 'science-challenge-model-run-policy/v1');
	assert.equal(artReviewPolicy.commandActions, 0);
	assert.equal(artReviewPolicy.eventLogSha256, fixture.artReviewEventLogSha256);
	assert.doesNotMatch(JSON.stringify(artReviewPolicy), /thread_id|art-review-thread|"reviews"/);

	const sourceIndex = readJson(path.join(archiveRoot, 'indices/source-hashes.json'));
	assert.deepEqual(Object.keys(sourceIndex.questions[0]).sort(), [
		'contentSha256',
		'id',
		'sourceDocumentId'
	]);
	assert.doesNotMatch(JSON.stringify(sourceIndex), /licensed source wording/i);
	const assignmentIndex = readJson(path.join(archiveRoot, 'indices/assignment-hashes.json'));
	assert.deepEqual(Object.keys(assignmentIndex.assignments[0]).sort(), [
		'assignmentId',
		'assignmentSha256',
		'challengeCount',
		'challengeIdsSha256',
		'dispatchSha256',
		'taskNameSha256'
	]);
	assert.equal(assignmentIndex.assignments[0].taskNameSha256, hash('/root/science_verify_001'));
	const sanitizedLineage = readJson(path.join(archiveRoot, 'lineage.json'));
	assert.equal(sanitizedLineage.sourceLineageSha256, fixture.bindings.lineageSha256);
	assert.doesNotMatch(JSON.stringify(sanitizedLineage), /tmp\//);
	assert.doesNotMatch(JSON.stringify(sanitizedLineage), /"[A-Za-z]+Path"/);

	for (const relative of [
		fixture.paths.generationRoot,
		fixture.paths.artGenerationRoot,
		fixture.paths.artReviewRoot,
		path.dirname(fixture.paths.assignmentIndexPath)
	]) {
		rmSync(path.resolve(fixture.root, relative), { recursive: true, force: true });
	}
	assert.equal(
		validateScienceChallengeProvenanceArchive({
			archiveRoot,
			expectedBindings: fixture.bindings
		}).status,
		'passed'
	);

	rmSync(fixture.root, { recursive: true, force: true });
});

test('archives and replays the closed V0/R0/B0/V1/S1/V2 review-rebase chain after source cleanup', () => {
	const fixture = promoteFixtureToReviewRebaseSuccessor(buildFixture());
	const archiveRoot = buildFixtureArchive(fixture);
	const parentIndex = readJson(path.join(archiveRoot, 'content/parent-chain/index.json'));
	assert.equal(
		parentIndex.schemaVersion,
		'science-challenge-content-parent-chain-provenance-index/v1'
	);
	assert.equal(parentIndex.contentParentLineageSha256, fixture.bindings.contentParentLineageSha256);
	assert.deepEqual(parentIndex.parentChain, fixture.paths.lineage.effectiveCohort.parentChain);
	assert.equal(parentIndex.artifactCount, parentIndex.artifactRefs.length);
	assert.equal(
		new Set(parentIndex.artifactRefs.map((reference) => reference.path)).size,
		parentIndex.artifactCount
	);

	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const replay = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings,
		reviewRebaseValidators: fixture.paths.reviewRebaseValidators
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	const archivedB0 = readScienceChallengeReviewRebaseEvidence({
		repositoryRoot: path.join(archiveRoot, parentIndex.referenceRoot),
		manifestPath: parentIndex.reviewRebaseManifestRef.path.slice(
			`${parentIndex.referenceRoot}/`.length
		),
		existingDefinitions: [],
		...fixture.paths.reviewRebaseValidators
	});
	assert.equal(archivedB0.status, 'passed', archivedB0.issues.join('\n'));

	const omittedRoot = `${archiveRoot}-omitted`;
	cpSync(archiveRoot, omittedRoot, { recursive: true });
	unlinkSync(
		path.join(
			omittedRoot,
			'content/parent-chain/repository/tmp/review-rebase-inputs/selected-science-001.json'
		)
	);
	const omitted = validateScienceChallengeProvenanceArchive({
		archiveRoot: omittedRoot,
		expectedBindings: fixture.bindings,
		reviewRebaseValidators: fixture.paths.reviewRebaseValidators
	});
	assert.equal(omitted.status, 'failed');
	assert.match(omitted.issues.join('\n'), /missing|B0|replay/i);

	const tamperedRoot = `${archiveRoot}-tampered`;
	cpSync(archiveRoot, tamperedRoot, { recursive: true });
	const tamperedCandidatePath =
		'content/parent-chain/repository/tmp/review-rebase/shards/science-001/candidate.json';
	const tamperedCandidate = readJson(path.join(tamperedRoot, tamperedCandidatePath));
	tamperedCandidate.challenges[0].definition.cohortVersion = 'tampered-after-cleanup';
	writeJson(path.join(tamperedRoot, tamperedCandidatePath), tamperedCandidate);
	rebindTrackedArtifact(tamperedRoot, tamperedCandidatePath);
	const tampered = validateScienceChallengeProvenanceArchive({
		archiveRoot: tamperedRoot,
		expectedBindings: fixture.bindings,
		reviewRebaseValidators: fixture.paths.reviewRebaseValidators
	});
	assert.equal(tampered.status, 'failed');
	assert.match(tampered.issues.join('\n'), /B0|replay|binding|bytes differ/i);

	rmSync(fixture.root, { recursive: true, force: true });
});

test('archives repair prompts against their objective-local effective-plan input snapshot', () => {
	const fixture = buildFixture();
	const repairSha256 = 'b'.repeat(64);
	const repairPrefix = repairSha256.slice(0, 12);
	const shardRoot = path.join(fixture.root, fixture.paths.generationRoot, 'shards/science-001');
	const repairInput = [{ id: 'challenge-001', curriculumComponentId: 'effective-component' }];
	writeJson(path.join(shardRoot, `verification-repair-${repairPrefix}`, 'input.json'), repairInput);
	writeFile(
		path.join(shardRoot, `verification-repair-${repairPrefix}-prompt-attempt-1.txt`),
		'Repair generated science content.\n\nINPUT ROWS\n[{"curriculumComponentId":"effective-component"}]\n\nReturn science-challenge-batch/v1 JSON only.\n'
	);
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	const built = buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	assert.equal(built.validation.status, 'passed', built.validation.issues.join('\n'));
	const archivedPrompt = readFileSync(
		path.join(
			archiveRoot,
			`content/shards/science-001/prompts/verification-repair-${repairPrefix}-prompt-attempt-1.txt`
		),
		'utf8'
	);
	assert.match(archivedPrompt, new RegExp(canonicalHash(repairInput)));
	assert.doesNotMatch(archivedPrompt, /effective-component/);
	assert.equal(
		built.manifest.externalDependencies.some(
			(dependency) =>
				dependency.kind === 'full-authoring-input' &&
				dependency.id === `content-science-001-verification-repair-${repairPrefix}-input`
		),
		true
	);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const replay = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('general verification-repair attempt five is rejected during archive construction and replay', () => {
	const fixture = buildFixture();
	const repairPrefix = hash('general verification repair').slice(0, 12);
	const shardRoot = path.join(fixture.root, fixture.paths.generationRoot, 'shards/science-001');
	const sourceAttempt = path.join(shardRoot, 'attempt-01');
	const attemptFiveName = `verification-repair-${repairPrefix}-attempt-05`;
	const attemptFive = path.join(shardRoot, attemptFiveName);
	cpSync(sourceAttempt, attemptFive, { recursive: true });
	const rejectedArchiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance-attempt-five'
	);
	assert.throws(
		() =>
			buildScienceChallengeProvenanceArchive({
				rootDir: fixture.root,
				archiveRoot: rejectedArchiveRoot,
				releaseId: 'science-test-v1',
				materializedAt: '2026-07-21T00:00:00.000Z',
				expectedBindings: fixture.bindings,
				...fixture.paths
			}),
		/verification-repair attempt after four/
	);
	rmSync(rejectedArchiveRoot, { recursive: true, force: true });
	rmSync(attemptFive, { recursive: true, force: true });

	const archiveRoot = buildFixtureArchive(fixture);
	const archivedSourceAttempt = path.join(
		archiveRoot,
		'content/shards/science-001/attempts/attempt-01'
	);
	const archivedAttemptFiveRoot = path.join(
		archiveRoot,
		'content/shards/science-001/attempts',
		attemptFiveName
	);
	cpSync(archivedSourceAttempt, archivedAttemptFiveRoot, { recursive: true });
	const archiveManifestPath = path.join(archiveRoot, 'manifest.json');
	const archiveManifest = readJson(archiveManifestPath);
	for (const [name, kind] of [
		['last-message.json', 'content-final-message'],
		['validation.json', 'content-validation'],
		['run-summary.json', 'content-run-summary']
	]) {
		const filePath = path.join(archivedAttemptFiveRoot, name);
		const bytes = readFileSync(filePath);
		archiveManifest.trackedArtifacts.push({
			kind,
			path: `content/shards/science-001/attempts/${attemptFiveName}/${name}`,
			sha256: sha256(bytes),
			canonicalSha256: canonicalHash(JSON.parse(bytes.toString('utf8'))),
			bytes: bytes.length
		});
	}
	writeJson(archiveManifestPath, archiveManifest);
	const replay = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(replay.status, 'failed');
	assert.match(replay.issues.join('\n'), /verification-repair attempt after four/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('archives and binds exceptional verification-repair recovery evidence', () => {
	const fixture = buildFixture();
	const predecessorRoot = path.join(fixture.root, 'tmp/failed-root');
	const predecessorEvidencePath = path.join(
		predecessorRoot,
		'shards/science-001/verification-repair-test-attempt-01/run-summary.json'
	);
	const predecessorEventsPath = path.join(
		predecessorRoot,
		'shards/science-001/verification-repair-test-attempt-01/events.jsonl'
	);
	writeFile(predecessorEventsPath, '');
	writeJson(predecessorEvidencePath, {
		status: 'failed',
		error: 'fetch failed: getaddrinfo ENOTFOUND api.openai.com'
	});
	const predecessorBytes = readFileSync(predecessorEvidencePath);
	const evidenceInventory = [
		{
			path: 'shards/science-001/verification-repair-test-attempt-01/events.jsonl',
			sha256: sha256(readFileSync(predecessorEventsPath)),
			bytes: 0
		},
		{
			path: 'shards/science-001/verification-repair-test-attempt-01/run-summary.json',
			sha256: sha256(predecessorBytes),
			bytes: predecessorBytes.length
		}
	];
	const recovery = {
		schemaVersion: 'science-challenge-verification-repair-recovery/v2',
		objectiveId: 'e'.repeat(64),
		executionId: 'd'.repeat(64),
		disposition: 'pre-model infrastructure recovery',
		preModelRoots: [
			{
				path: 'failed-root',
				evidenceFileCount: evidenceInventory.length,
				evidenceBytes: evidenceInventory.reduce((total, file) => total + file.bytes, 0),
				evidenceInventorySha256: canonicalHash(evidenceInventory),
				evidenceInventory
			}
		]
	};
	const recoveryPath = path.join(fixture.root, 'tmp/verification-repair-recovery.json');
	writeJson(recoveryPath, recovery);
	const repairExecutionLedgerSnapshot = {
		schemaVersion: 'science-challenge-verification-repair-ledger-snapshot/v1',
		executionId: recovery.executionId,
		claimCount: 1
	};
	fixture.paths.lineage.recovery = {
		schemaVersion: recovery.schemaVersion,
		objectiveId: recovery.objectiveId,
		executionId: recovery.executionId,
		path: path.relative(fixture.root, recoveryPath),
		sha256: canonicalHash(recovery),
		executionLedgerSha256: canonicalHash(repairExecutionLedgerSnapshot)
	};
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	fixture.paths.repairRecoveryManifestPath = path.relative(fixture.root, recoveryPath);
	fixture.paths.repairExecutionLedgerSnapshot = repairExecutionLedgerSnapshot;
	const mismatchedArchiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance-objective-mismatch'
	);
	fixture.paths.lineage.recovery.objectiveId = 'f'.repeat(64);
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	assert.throws(
		() =>
			buildScienceChallengeProvenanceArchive({
				rootDir: fixture.root,
				archiveRoot: mismatchedArchiveRoot,
				releaseId: 'science-test-v1',
				materializedAt: '2026-07-21T00:00:00.000Z',
				expectedBindings: fixture.bindings,
				...fixture.paths
			}),
		/does not bind the verification-repair recovery manifest/
	);
	rmSync(mismatchedArchiveRoot, { recursive: true, force: true });
	fixture.paths.lineage.recovery.objectiveId = recovery.objectiveId;
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	const built = buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	assert.equal(built.validation.status, 'passed');
	assert.equal(
		readJson(path.join(archiveRoot, 'content/verification-repair-recovery.json')).executionId,
		recovery.executionId
	);
	assert.equal(
		readJson(path.join(archiveRoot, 'content/verification-repair-execution-ledger.json'))
			.claimCount,
		1
	);
	assert.ok(
		readFileSync(
			path.join(
				archiveRoot,
				'content/recovery-predecessors/predecessor-01',
				evidenceInventory[1].path
			)
		).equals(predecessorBytes)
	);
	unlinkSync(recoveryPath);
	rmSync(predecessorRoot, { recursive: true, force: true });
	assert.equal(
		validateScienceChallengeProvenanceArchive({
			archiveRoot,
			expectedBindings: fixture.bindings
		}).status,
		'passed'
	);
	const archivedEvidencePath = path.join(
		archiveRoot,
		'content/recovery-predecessors/predecessor-01',
		evidenceInventory[1].path
	);
	writeJson(archivedEvidencePath, { status: 'passed' });
	rebindTrackedArtifact(
		archiveRoot,
		path.relative(archiveRoot, archivedEvidencePath).split(path.sep).join('/')
	);
	const tampered = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(tampered.status, 'failed');
	assert.match(tampered.issues.join('\n'), /differs from the recovery manifest/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('archives a complete descendant-remap recovery and replays it after source cleanup', () => {
	const fixture = buildDescendantRemapFixture();
	const archiveRoot = buildFixtureArchive(fixture);
	assert.equal(
		validateScienceChallengeProvenanceArchive({
			archiveRoot,
			expectedBindings: fixture.bindings
		}).status,
		'passed'
	);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const replay = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	assert.equal(
		readJson(path.join(archiveRoot, 'content/descendant-remap-index.json')).remaps[0].sourceAttempts
			.length,
		4
	);
	assert.equal(
		existsSync(
			path.join(
				archiveRoot,
				'content/shards/science-001/descendant-remap/source-attempts/attempt-05'
			)
		),
		false
	);
	for (const filePath of listFiles(archiveRoot).filter((value) => value.endsWith('.json'))) {
		assert.deepEqual(
			findForbiddenDurableKeys(readJson(filePath)),
			[],
			path.relative(archiveRoot, filePath)
		);
	}
	rmSync(fixture.root, { recursive: true, force: true });
});

test('archives a terminal second-repair cohort with its complete predecessor closure', () => {
	const fixture = promoteDescendantRemapFixtureToSuccessor(buildDescendantRemapFixture());
	const archiveRoot = buildFixtureArchive(fixture);
	const effectiveIndex = readJson(path.join(archiveRoot, 'content/effective-cohort-index.json'));
	assert.equal(
		effectiveIndex.manifestSha256,
		canonicalHash(fixture.paths.effectiveCohort.manifest)
	);
	assert.equal(
		effectiveIndex.artifactRefs.some(
			(reference) =>
				reference.canonicalSha256 === canonicalHash(fixture.successorPredecessor.manifest)
		),
		true
	);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const replay = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('uploader CLI dry-run replays the archived effective cohort after source cleanup', () => {
	const fixture = buildDescendantRemapFixture();
	const shortRecall = buildPassedScienceChallengeShortRecallArtifactsForTest({
		candidateEntries: fixture.paths.effectiveCohort.candidateSet
	});
	fixture.bindings.shortRecallBundleSha256 = shortRecall.releaseBindings.shortRecallBundleSha256;
	fixture.bindings.shortRecallReviewSha256 = shortRecall.releaseBindings.shortRecallReviewSha256;
	const archiveRoot = buildFixtureArchive(fixture);
	const manifest = readJson(path.join(archiveRoot, 'manifest.json'));
	const releasePath = path.join(path.dirname(archiveRoot), 'accepted-challenges.json');
	const release = {
		release: {
			...fixture.bindings,
			...shortRecall.releaseBindings,
			id: 'science-test-v1',
			status: 'accepted',
			materializedAt: '2026-07-21T00:00:00.000Z',
			provenanceArchiveSha256: canonicalHash(manifest)
		},
		challenges: fixture.paths.effectiveCohort.candidateSet
	};
	writeJson(releasePath, release);
	writeJson(path.join(path.dirname(releasePath), 'short-recall-prompts.json'), shortRecall.prompts);
	writeJson(
		path.join(path.dirname(releasePath), 'short-recall-authoring-evidence.json'),
		shortRecall.authoringEvidence
	);
	writeJson(
		path.join(path.dirname(releasePath), 'short-recall-review-evidence.json'),
		shortRecall.reviewEvidence
	);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });

	const uploaderPath = fileURLToPath(
		new URL('../upload-science-challenge-art.mjs', import.meta.url)
	);
	const result = spawnSync(
		process.execPath,
		[uploaderPath, `--release=${releasePath}`, '--release-evidence-only'],
		{
			cwd: fixture.root,
			encoding: 'utf8',
			env: { ...process.env }
		}
	);
	assert.equal(result.status, 0, result.stderr);
	const output = JSON.parse(result.stdout);
	assert.equal(output.status, 'dry-run');
	assert.equal(output.scope, 'release-evidence');
	assert.equal(output.effectivePlanSha256, fixture.bindings.effectivePlanSha256);
	assert.equal(output.candidateSetSha256, fixture.bindings.effectiveCohortCandidateSetSha256);
	assert.equal(existsSync(path.join(fixture.root, 'tmp')), false);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('descendant-remap archive fails closed on an omitted staged artifact', () => {
	const fixture = buildDescendantRemapFixture();
	const archiveRoot = buildFixtureArchive(fixture);
	unlinkSync(
		path.join(
			archiveRoot,
			'content/shards/science-001/descendant-remap/staged/first-review-result.json'
		)
	);
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(
		validation.issues.join('\n'),
		/trackedArtifacts\[\d+\] is missing|first-review-result/i
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('descendant-remap archive rejects a rebound false verifier decision', () => {
	const fixture = buildDescendantRemapFixture();
	const archiveRoot = buildFixtureArchive(fixture);
	const receiptRelativePath = 'content/curriculum-remap/durable-receipt.json';
	const receiptPath = path.join(archiveRoot, receiptRelativePath);
	const receipt = readJson(receiptPath);
	receipt.remaps[0].decision.accepted = false;
	receipt.remaps[0].decisionSha256 = canonicalHash(receipt.remaps[0].decision);
	receipt.decisionSetSha256 = canonicalHash(receipt.remaps.map((remap) => remap.decision));
	const receiptCore = structuredClone(receipt);
	delete receiptCore.receiptSha256;
	receipt.receiptSha256 = canonicalHash(receiptCore);
	writeJson(receiptPath, receipt);
	rebindTrackedArtifact(archiveRoot, receiptRelativePath);
	const archiveManifestPath = path.join(archiveRoot, 'manifest.json');
	const archiveManifest = readJson(archiveManifestPath);
	archiveManifest.bindings.curriculumRemapDurableReceiptSha256 = canonicalHash(receipt);
	archiveManifest.bindings.curriculumRemapDecisionSetSha256 = receipt.decisionSetSha256;
	writeJson(archiveManifestPath, archiveManifest);
	const falseBindings = {
		...fixture.bindings,
		curriculumRemapDurableReceiptSha256: canonicalHash(receipt),
		curriculumRemapDecisionSetSha256: receipt.decisionSetSha256
	};
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: falseBindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /durable receipt|not accepted/i);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('descendant-remap archive rejects a rebound stale manifest', () => {
	const fixture = buildDescendantRemapFixture();
	const archiveRoot = buildFixtureArchive(fixture);
	const manifestPath = path.join(
		archiveRoot,
		'content/shards/science-001/descendant-remap/staged/manifest.json'
	);
	const manifest = readJson(manifestPath);
	manifest.remap.to = 'aqa-biology:stale-leaf';
	writeJson(manifestPath, manifest);
	rebindTrackedArtifact(
		archiveRoot,
		'content/shards/science-001/descendant-remap/staged/manifest.json'
	);
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /manifest|tracked artifact/i);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('descendant-remap archive rejects a selected remap rebound to another repair', () => {
	const fixture = buildDescendantRemapFixture();
	const archiveRoot = buildFixtureArchive(fixture);
	const effectiveIndex = readJson(path.join(archiveRoot, 'content/effective-cohort-index.json'));
	const effectiveManifestRelativePath = path.posix.join(
		effectiveIndex.referenceRoot,
		effectiveIndex.manifestPath
	);
	const effectiveManifestPath = path.join(archiveRoot, effectiveManifestRelativePath);
	const effectiveManifest = readJson(effectiveManifestPath);
	const remapShard = effectiveManifest.shards.find(
		(shard) => shard.disposition === 'descendant-remap'
	);
	assert.ok(remapShard);
	const remapRelativePath = path.posix.join(
		effectiveIndex.referenceRoot,
		remapShard.lineage.manifest.path
	);
	const remapPath = path.join(archiveRoot, remapRelativePath);
	const remapManifest = readJson(remapPath);
	remapManifest.repairSha256 = hash('another coherent repair');
	remapManifest.firstReview.summarySha256 = remapManifest.repairSha256;
	const remapCore = structuredClone(remapManifest);
	delete remapCore.manifestCoreSha256;
	remapManifest.manifestCoreSha256 = canonicalHash(remapCore);
	writeJson(remapPath, remapManifest);
	rebindTrackedArtifact(archiveRoot, remapRelativePath);
	const remapBytes = readFileSync(remapPath);
	remapShard.lineage.manifest = {
		path: remapShard.lineage.manifest.path,
		sha256: sha256(remapBytes),
		canonicalSha256: canonicalHash(remapManifest)
	};
	effectiveManifest.remapManifestSetSha256 = canonicalHash([remapManifest]);
	const effectiveCore = structuredClone(effectiveManifest);
	delete effectiveCore.manifestCoreSha256;
	effectiveManifest.manifestCoreSha256 = canonicalHash(effectiveCore);
	writeJson(effectiveManifestPath, effectiveManifest);
	rebindTrackedArtifact(archiveRoot, effectiveManifestRelativePath);
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /effective-cohort|descendant-remap lineage|repair/i);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('descendant-remap archive rejects any tracked fifth repair attempt', () => {
	const fixture = buildDescendantRemapFixture();
	const archiveRoot = buildFixtureArchive(fixture);
	const manifestPath = path.join(archiveRoot, 'manifest.json');
	const archiveManifest = readJson(manifestPath);
	const attemptFour = archiveManifest.trackedArtifacts.find(
		(artifact) =>
			artifact.kind === 'content-descendant-remap-source-run-summary' &&
			/\/descendant-remap\/source-attempts\/attempt-04\/run-summary\.json$/.test(artifact.path)
	);
	assert.ok(attemptFour);
	const attemptFivePath = attemptFour.path.replace('attempt-04', 'attempt-05');
	mkdirSync(path.dirname(path.join(archiveRoot, attemptFivePath)), { recursive: true });
	cpSync(path.join(archiveRoot, attemptFour.path), path.join(archiveRoot, attemptFivePath));
	const attemptFiveBytes = readFileSync(path.join(archiveRoot, attemptFivePath));
	archiveManifest.trackedArtifacts.push({
		kind: 'content-run-summary',
		path: attemptFivePath,
		sha256: sha256(attemptFiveBytes),
		bytes: attemptFiveBytes.length,
		canonicalSha256: canonicalHash(JSON.parse(attemptFiveBytes.toString('utf8')))
	});
	writeJson(manifestPath, archiveManifest);
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /attempt after four/i);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('descendant-remap archive rejects extra rebound staged references', () => {
	const fixture = buildDescendantRemapFixture();
	const archiveRoot = buildFixtureArchive(fixture);
	const indexRelativePath = 'content/descendant-remap-index.json';
	const indexPath = path.join(archiveRoot, indexRelativePath);
	const index = readJson(indexPath);
	index.remaps[0].staged.unexpected = index.remaps[0].staged.manifest;
	writeJson(indexPath, index);
	rebindTrackedArtifact(archiveRoot, indexRelativePath);
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /closed-world/i);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('archives and independently replays exhausted multipart plan salvage provenance', () => {
	const fixture = buildFixture();
	const salvage = attachMultipartPlanSalvage(fixture);
	const archiveRoot = buildFixtureArchive(fixture);
	const manifest = readJson(path.join(archiveRoot, 'manifest.json'));

	assert.equal(
		manifest.trackedArtifacts.filter(
			(artifact) => artifact.kind === 'content-multipart-plan-salvage-claim'
		).length,
		4
	);
	for (const relativePath of [
		'content/shards/science-001/multipart-plan-salvage/manifest.json',
		'content/shards/science-001/multipart-plan-salvage/candidate.json',
		'content/shards/science-001/multipart-plan-salvage/validation.json',
		'content/shards/science-001/multipart-plan-salvage/execution/objective.json',
		'content/shards/science-001/multipart-plan-salvage/repair/verification-summary.json',
		'content/shards/science-001/multipart-plan-salvage/repair/prior-candidate.json',
		'content/shards/science-001/multipart-plan-salvage/repair/prior-validation.json',
		`content/shards/science-001/attempts/${salvage.sourceAttemptDirectory}/run-summary.json`,
		`content/shards/science-001/attempts/${salvage.sourceAttemptDirectory}/parts/part-01/last-message.json`
	]) {
		assert.equal(existsSync(path.join(archiveRoot, relativePath)), true, relativePath);
	}
	const sanitized = readJson(path.join(archiveRoot, 'lineage.json')).content[0].salvage;
	assert.equal(sanitized.salvagePathway, 'failed-merge-id-and-difficulty');
	assert.equal(sanitized.execution.claims.length, 4);
	assert.equal(sanitized.sourceAttempt.status, 'failed');
	assert.equal(sanitized.sourceAttempt.parts.length, 2);
	assert.equal(sanitized.sourceSelection.policy, 'sole-helper-approved-source');
	assert.equal(sanitized.sourceSelectionSha256, canonicalHash(sanitized.sourceSelection));
	assert.doesNotMatch(JSON.stringify(sanitized), /Path"/);

	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const replay = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(replay.status, 'passed', replay.issues.join('\n'));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects a rehashed sanitized salvage source selection that differs from source and manifest', () => {
	const fixture = buildFixture();
	attachMultipartPlanSalvage(fixture);
	const archiveRoot = buildFixtureArchive(fixture);
	const lineageRelativePath = 'lineage.json';
	const lineagePath = path.join(archiveRoot, lineageRelativePath);
	const lineage = readJson(lineagePath);
	const selection = lineage.content[0].salvage.sourceSelection;
	selection.eligibleSources[0].deterministicValidationSha256 = 'f'.repeat(64);
	selection.eligibleSourcesSha256 = canonicalHash(selection.eligibleSources);
	lineage.content[0].salvage.sourceSelectionSha256 = canonicalHash(selection);
	writeJson(lineagePath, lineage);
	rebindTrackedArtifact(archiveRoot, lineageRelativePath);

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(
		validation.issues.join('\n'),
		/sanitized multipart plan-drift salvage differs|selection|salvage validation/i
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('archives every exhausted multipart continuation source, claim and suffix-part byte', () => {
	const fixture = buildFixture();
	attachMultipartContinuation(fixture);
	const archiveRoot = buildFixtureArchive(fixture);
	const built = readJson(path.join(archiveRoot, 'manifest.json'));
	const sanitized = readJson(path.join(archiveRoot, 'lineage.json')).content[0].continuation;
	assert.equal(sanitized.sourceAttempt.attempt, 4);
	assert.equal(sanitized.sourceAttempt.status, 'failed');
	assert.deepEqual(
		sanitized.continuationParts.map((part) => part.partId),
		['part-03']
	);
	for (const relative of [
		'content/shards/science-001/multipart-continuation/manifest.json',
		'content/shards/science-001/multipart-continuation/plan.json',
		'content/shards/science-001/multipart-continuation/candidate.json',
		'content/shards/science-001/multipart-continuation/validation.json',
		'content/shards/science-001/multipart-continuation/collection-validation.json',
		'content/shards/science-001/multipart-continuation/failure.json',
		'content/shards/science-001/multipart-continuation/execution/objective.json',
		'content/shards/science-001/multipart-continuation/execution/claims/part-03.json',
		'content/shards/science-001/multipart-continuation/execution/invocations/part-03.json',
		'content/shards/science-001/multipart-continuation/parts/part-03/last-message.json',
		'content/shards/science-001/multipart-continuation/parts/part-03/result-metadata.json',
		'content/shards/science-001/multipart-continuation/parts/part-03/run-summary.json'
	]) {
		assert.ok(
			built.trackedArtifacts.some((artifact) => artifact.path === relative),
			relative
		);
	}
	assert.equal(
		built.externalDependencies.filter((dependency) =>
			dependency.id.includes('multipart-continuation-part-03')
		).length,
		4
	);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	assert.equal(
		validateScienceChallengeProvenanceArchive({
			archiveRoot,
			expectedBindings: fixture.bindings
		}).status,
		'passed'
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('archives a valid continuation whose source failed on its first multipart call', () => {
	const fixture = buildFixture();
	attachMultipartContinuation(fixture, {
		sourcePartCount: 1,
		includeCollectionJournals: false
	});
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects omission of discovered multipart plan salvage from release lineage', () => {
	const fixture = buildFixture();
	attachMultipartPlanSalvage(fixture);
	fixture.paths.lineage.content[0].salvage = null;
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	fixture.bindings.contentGenerationLineageSha256 = canonicalHash(fixture.paths.lineage.content);

	assert.throws(
		() => buildFixtureArchive(fixture),
		/omits discovered multipart plan-drift salvage from release lineage/
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('fails closed when one archived salvage claim is omitted after source cleanup', () => {
	const fixture = buildFixture();
	attachMultipartPlanSalvage(fixture);
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	unlinkSync(
		path.join(
			archiveRoot,
			'content/shards/science-001/multipart-plan-salvage/execution/claims/attempt-03.json'
		)
	);

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /missing from the archive|salvage claim 3 is missing/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects rehashed archived salvage claim, repair snapshot and source-part tampering', () => {
	for (const attack of ['claim', 'repair-snapshot', 'source-part']) {
		const fixture = buildFixture();
		const salvage = attachMultipartPlanSalvage(fixture);
		const archiveRoot = buildFixtureArchive(fixture);
		rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
		const relativePath =
			attack === 'claim'
				? 'content/shards/science-001/multipart-plan-salvage/execution/claims/attempt-02.json'
				: attack === 'repair-snapshot'
					? 'content/shards/science-001/multipart-plan-salvage/repair/prior-validation.json'
					: `content/shards/science-001/attempts/${salvage.sourceAttemptDirectory}/parts/part-02/last-message.json`;
		const artifactPath = path.join(archiveRoot, relativePath);
		const value = readJson(artifactPath);
		if (attack === 'claim') value.outputRootSha256 = hash('another output root');
		else if (attack === 'repair-snapshot') value.status = 'failed';
		else value.challenges[0].definition.difficulty = 'stretch';
		writeJson(artifactPath, value);
		rebindTrackedArtifact(archiveRoot, relativePath);

		const validation = validateScienceChallengeProvenanceArchive({
			archiveRoot,
			expectedBindings: fixture.bindings
		});
		assert.equal(validation.status, 'failed', attack);
		assert.match(
			validation.issues.join('\n'),
			/differs from its immutable binding|claim 2 is invalid|repair snapshots are not verifier-bound|raw output differs on sha256|part-02 evidence is invalid/,
			attack
		);
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('archives direct JSON authoring evidence and replays it after source cleanup', () => {
	const fixture = buildFixture();
	const direct = convertFixtureContentToDirect(fixture);
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	const built = buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});

	assert.equal(built.validation.status, 'passed', built.validation.issues.join('\n'));
	assert.equal(
		built.manifest.externalDependencies.filter(
			(dependency) => dependency.kind === 'direct-json-event-log'
		).length,
		1
	);
	assert.equal(
		built.manifest.externalDependencies.filter(
			(dependency) => dependency.kind === 'codex-event-log'
		).length,
		1
	);
	assert.equal(
		built.manifest.externalDependencies.some(
			(dependency) =>
				dependency.kind === 'direct-json-request' && dependency.sha256 === direct.requestSha256
		),
		true
	);
	assert.equal(
		built.manifest.externalDependencies.some(
			(dependency) =>
				dependency.kind === 'model-thought-log' && dependency.sha256 === direct.thoughtsSha256
		),
		true
	);
	assert.equal(
		built.manifest.trackedArtifacts.some(
			(artifact) =>
				artifact.kind === 'content-run-result-metadata' &&
				artifact.sha256 === direct.resultMetadataSha256
		),
		true
	);

	const archivedRun = readJson(path.join(archiveRoot, 'lineage.json')).content[0].runs[0];
	assert.equal(archivedRun.transport, 'llm-direct');
	assert.equal(archivedRun.provider, 'chatgpt');
	assert.equal(archivedRun.model, 'chatgpt-gpt-5.6-sol');
	assert.equal(archivedRun.requestRef.storage, 'external');
	assert.equal(archivedRun.requestRef.kind, 'direct-json-request');
	assert.equal(archivedRun.thoughtsRef.storage, 'external');
	assert.equal(archivedRun.thoughtsRef.kind, 'model-thought-log');
	assert.equal(archivedRun.resultMetadataRef.storage, 'tracked');
	assert.equal(archivedRun.resultMetadataRef.kind, 'content-run-result-metadata');

	rmSync(path.resolve(fixture.root, fixture.paths.generationRoot), {
		recursive: true,
		force: true
	});
	assert.equal(
		validateScienceChallengeProvenanceArchive({
			archiveRoot,
			expectedBindings: fixture.bindings
		}).status,
		'passed'
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('archives prompt JSON authoring with mode-specific dependencies and replays after cleanup', () => {
	const fixture = buildFixture();
	convertFixtureContentToDirect(fixture, {
		responseMode: 'prompt-json',
		thinkingLevel: 'high'
	});
	const archiveRoot = buildFixtureArchive(fixture);

	const manifest = readJson(path.join(archiveRoot, 'manifest.json'));
	assert.equal(
		manifest.externalDependencies.some(
			(dependency) => dependency.kind === 'direct-prompt-json-request'
		),
		true
	);
	assert.equal(
		manifest.externalDependencies.some(
			(dependency) => dependency.kind === 'direct-prompt-json-event-log'
		),
		true
	);
	const archivedRun = readJson(path.join(archiveRoot, 'lineage.json')).content[0].runs[0];
	assert.equal(archivedRun.responseMode, 'prompt-json');
	assert.equal(archivedRun.transportVersion, 'science-challenge-llm-direct-prompt-json/v1');
	assert.equal(archivedRun.thinkingLevel, 'high');
	assert.equal(archivedRun.requestRef.kind, 'direct-prompt-json-request');
	assert.equal(archivedRun.eventLogRef.kind, 'direct-prompt-json-event-log');

	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects a rehashed prompt JSON archive relabel against its accepted source lineage', () => {
	const fixture = buildFixture();
	convertFixtureContentToDirect(fixture, { responseMode: 'prompt-json' });
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });

	const lineagePath = path.join(archiveRoot, 'lineage.json');
	const lineage = readJson(lineagePath);
	lineage.content[0].runs[0].responseMode = 'structured-json';
	lineage.content[0].runs[0].transportVersion = 'science-challenge-llm-direct-json/v1';
	lineage.content[0].runs[0].thinkingLevel = 'high';
	writeJson(lineagePath, lineage);
	rebindTrackedArtifact(archiveRoot, 'lineage.json');

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(
		validation.issues.join('\n'),
		/sanitized run 1 differs from source lineage|archive references do not match its response mode/
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects rehashed unsupported thinking levels in prompt JSON archives', () => {
	for (const thinkingLevel of ['xhigh', 'medium', 'low']) {
		const fixture = buildFixture();
		convertFixtureContentToDirect(fixture, { responseMode: 'prompt-json' });
		const archiveRoot = buildFixtureArchive(fixture);
		rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });

		const lineagePath = path.join(archiveRoot, 'lineage.json');
		const lineage = readJson(lineagePath);
		lineage.content[0].runs[0].thinkingLevel = thinkingLevel;
		writeJson(lineagePath, lineage);
		rebindTrackedArtifact(archiveRoot, 'lineage.json');
		const validation = validateScienceChallengeProvenanceArchive({
			archiveRoot,
			expectedBindings: fixture.bindings
		});
		assert.equal(validation.status, 'failed', thinkingLevel);
		assert.match(
			validation.issues.join('\n'),
			/invalid thinkingLevel|sanitized run 1 differs from source lineage/,
			thinkingLevel
		);
		rmSync(fixture.root, { recursive: true, force: true });
	}
});

test('replays a multipart authoring archive after every tmp source is removed', () => {
	const fixture = buildFixture();
	convertFixtureContentToMultipart(fixture);
	const archiveRoot = buildFixtureArchive(fixture);

	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));

	const archivedRun = readJson(path.join(archiveRoot, 'lineage.json')).content[0].runs[0];
	assert.equal(archivedRun.transportVersion, 'science-challenge-llm-direct-json-multipart/v1');
	assert.deepEqual(
		archivedRun.parts.map((part) => part.partId),
		['part-01', 'part-02']
	);
	assert.equal(
		archivedRun.parts.every(
			(part) =>
				part.rawOutputRef.storage === 'tracked' &&
				part.requestRef.storage === 'external' &&
				part.eventLogRef.storage === 'external'
		),
		true
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('replays prompt JSON multipart lineage with exact root and child mode/version tuples', () => {
	const fixture = buildFixture();
	convertFixtureContentToMultipart(fixture, {
		responseMode: 'prompt-json',
		thinkingLevel: 'high'
	});
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });

	const archivedRun = readJson(path.join(archiveRoot, 'lineage.json')).content[0].runs[0];
	assert.equal(archivedRun.responseMode, 'prompt-json');
	assert.equal(
		archivedRun.transportVersion,
		'science-challenge-llm-direct-prompt-json-multipart/v1'
	);
	assert.equal(archivedRun.thinkingLevel, 'high');
	assert.equal(archivedRun.eventLogRef.kind, 'direct-prompt-json-multipart-event-index');
	assert.equal(
		archivedRun.parts.every(
			(part) =>
				part.responseMode === 'prompt-json' &&
				part.transportVersion === 'science-challenge-llm-direct-prompt-json/v1' &&
				part.thinkingLevel === 'high' &&
				part.requestRef.kind === 'direct-prompt-json-request' &&
				part.eventLogRef.kind === 'direct-prompt-json-event-log'
		),
		true
	);
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'passed', validation.issues.join('\n'));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects rehashed mixed thinking levels inside prompt JSON multipart lineage', () => {
	const fixture = buildFixture();
	convertFixtureContentToMultipart(fixture, {
		responseMode: 'prompt-json',
		thinkingLevel: 'high'
	});
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const lineagePath = path.join(archiveRoot, 'lineage.json');
	const lineage = readJson(lineagePath);
	lineage.content[0].runs[0].parts[0].thinkingLevel = 'max';
	writeJson(lineagePath, lineage);
	rebindTrackedArtifact(archiveRoot, 'lineage.json');

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(
		validation.issues.join('\n'),
		/part 1 does not match its response mode, thinking level or archive kinds|sanitized run 1 differs from source lineage/
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('fails multipart replay when archived part evidence is missing', () => {
	const fixture = buildFixture();
	convertFixtureContentToMultipart(fixture);
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	unlinkSync(
		path.join(
			archiveRoot,
			'content/shards/science-001/attempts/attempt-01/parts/part-02/last-message.json'
		)
	);

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /is missing from the archive/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('fails multipart replay when archived part lineage is reordered and rehashed', () => {
	const fixture = buildFixture();
	convertFixtureContentToMultipart(fixture);
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const lineagePath = path.join(archiveRoot, 'lineage.json');
	const lineage = readJson(lineagePath);
	lineage.content[0].runs[0].parts.reverse();
	writeJson(lineagePath, lineage);
	rebindTrackedArtifact(archiveRoot, 'lineage.json');

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /sanitized run 1 differs from source lineage/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('fails multipart replay when tracked part bytes are tampered', () => {
	const fixture = buildFixture();
	convertFixtureContentToMultipart(fixture);
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const relativePath =
		'content/shards/science-001/attempts/attempt-01/parts/part-02/last-message.json';
	writeJson(path.join(archiveRoot, relativePath), {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: []
	});

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /sha256 differs from the archived bytes/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('fails multipart replay when one part is substituted and its manifest record is rehashed', () => {
	const fixture = buildFixture();
	convertFixtureContentToMultipart(fixture);
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const partRoot = path.join(archiveRoot, 'content/shards/science-001/attempts/attempt-01/parts');
	const substitutedRelativePath =
		'content/shards/science-001/attempts/attempt-01/parts/part-02/last-message.json';
	writeFileSync(
		path.join(archiveRoot, substitutedRelativePath),
		readFileSync(path.join(partRoot, 'part-01/last-message.json'))
	);
	rebindTrackedArtifact(archiveRoot, substitutedRelativePath);

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /part-02\/last-message\.json differs on sha256/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects a fully rehashed multipart manifest attack against the accepted source lineage', () => {
	const fixture = buildFixture();
	convertFixtureContentToMultipart(fixture);
	const archiveRoot = buildFixtureArchive(fixture);
	rmSync(path.join(fixture.root, 'tmp'), { recursive: true, force: true });
	const outputRelativePath =
		'content/shards/science-001/attempts/attempt-01/parts/part-02/last-message.json';
	const outputPath = path.join(archiveRoot, outputRelativePath);
	const forgedOutput = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [{ definition: { id: 'challenge-forged' } }]
	};
	writeJson(outputPath, forgedOutput);

	const lineagePath = path.join(archiveRoot, 'lineage.json');
	const lineage = readJson(lineagePath);
	const attackedPart = lineage.content[0].runs[0].parts[1];
	const outputBytes = readFileSync(outputPath);
	attackedPart.rawOutputSha256 = sha256(outputBytes);
	attackedPart.rawCandidateSha256 = canonicalHash(forgedOutput);
	writeJson(lineagePath, lineage);
	rehashTrackedArtifacts(archiveRoot);
	const manifest = readJson(path.join(archiveRoot, 'manifest.json'));
	const outputRecord = manifest.trackedArtifacts.find(
		(artifact) => artifact.path === outputRelativePath
	);
	attackedPart.rawOutputRef = {
		storage: 'tracked',
		kind: outputRecord.kind,
		path: outputRecord.path,
		sha256: outputRecord.sha256,
		bytes: outputRecord.bytes,
		canonicalSha256: outputRecord.canonicalSha256
	};
	writeJson(lineagePath, lineage);
	rehashTrackedArtifacts(archiveRoot);

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /sanitized run 1 differs from source lineage/);
	assert.doesNotMatch(validation.issues.join('\n'), /sha256 differs from the archived bytes/);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('fails closed when archived bytes change', () => {
	const fixture = buildFixture();
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	writeFileSync(
		path.join(archiveRoot, 'content/shards/science-001/attempts/attempt-01/validation.json'),
		'{}\n'
	);
	const result = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(result.status, 'failed');
	assert.ok(result.issues.some((issue) => issue.includes('sha256 differs')));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects a tracked artifact replaced by a matching external symlink', () => {
	const fixture = buildFixture();
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	const artifactPath = path.join(archiveRoot, 'coverage.json');
	const externalPath = path.join(fixture.root, 'tmp', 'matching-coverage.json');
	writeFileSync(externalPath, readFileSync(artifactPath));
	unlinkSync(artifactPath);
	symlinkSync(externalPath, artifactPath);

	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(validation.status, 'failed');
	assert.match(validation.issues.join('\n'), /symlink|regular file/i);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects a provenance input supplied through a symlink', () => {
	const fixture = buildFixture();
	const planPath = path.join(fixture.root, fixture.paths.planPath);
	const planCopy = path.join(fixture.root, 'tmp', 'plan-copy.json');
	writeFileSync(planCopy, readFileSync(planPath));
	unlinkSync(planPath);
	symlinkSync(planCopy, planPath);
	assert.throws(
		() =>
			buildScienceChallengeProvenanceArchive({
				rootDir: fixture.root,
				archiveRoot: path.join(fixture.root, 'data/challenges/releases/science-test-v1/provenance'),
				releaseId: 'science-test-v1',
				materializedAt: '2026-07-21T00:00:00.000Z',
				expectedBindings: fixture.bindings,
				...fixture.paths
			}),
		/regular file contained in the workspace/
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects source-rich fields even when a sanitized index manifest hash is updated', () => {
	const fixture = buildFixture();
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	const indexPath = path.join(archiveRoot, 'indices/source-hashes.json');
	const index = readJson(indexPath);
	index.questions[0].promptText = 'licensed source wording must not be tracked';
	writeJson(indexPath, index);
	const manifestPath = path.join(archiveRoot, 'manifest.json');
	const manifest = readJson(manifestPath);
	const record = manifest.trackedArtifacts.find(
		(artifact) => artifact.path === 'indices/source-hashes.json'
	);
	const bytes = readFileSync(indexPath);
	record.sha256 = sha256(bytes);
	record.bytes = bytes.length;
	writeJson(manifestPath, manifest);
	const result = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(result.status, 'failed');
	assert.ok(result.issues.some((issue) => issue.includes('Forbidden field promptText')));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects an untracked raw event stream added to the durable archive', () => {
	const fixture = buildFixture();
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	writeFile(path.join(archiveRoot, 'events.jsonl'), '{"type":"sensitive-session-event"}\n');
	const result = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(result.status, 'failed');
	assert.ok(result.issues.some((issue) => issue.includes('Untracked file')));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects a lineage reference relabelled to unrelated archived bytes', () => {
	const fixture = buildFixture();
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	const lineagePath = path.join(archiveRoot, 'lineage.json');
	const lineage = readJson(lineagePath);
	lineage.content[0].runs[0].eventLogSha256 = hash('unrelated event log');
	writeJson(lineagePath, lineage);
	const manifestPath = path.join(archiveRoot, 'manifest.json');
	const manifest = readJson(manifestPath);
	const record = manifest.trackedArtifacts.find((artifact) => artifact.path === 'lineage.json');
	const bytes = readFileSync(lineagePath);
	record.sha256 = sha256(bytes);
	record.bytes = bytes.length;
	record.canonicalSha256 = canonicalHash(lineage);
	writeJson(manifestPath, manifest);
	const result = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(result.status, 'failed');
	assert.ok(result.issues.some((issue) => issue.includes('does not match its declared SHA-256')));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects an art manifest relabelled after its tracked hash is updated', () => {
	const fixture = buildFixture();
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	const artifactPath = path.join(archiveRoot, 'art/manifest.json');
	const artifact = readJson(artifactPath);
	artifact.specs = [];
	writeJson(artifactPath, artifact);
	rebindTrackedArtifact(archiveRoot, 'art/manifest.json');
	const result = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(result.status, 'failed');
	assert.ok(result.issues.some((issue) => issue.includes('Tracked art manifest')));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects a changed art review request even when its manifest record is relabelled', () => {
	const fixture = buildFixture();
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	const relativePath = 'reviews/art/batches/art-review-001/review-request.json';
	const requestPath = path.join(archiveRoot, relativePath);
	const request = readJson(requestPath);
	request.inputSha256 = hash('different reviewed image bytes');
	writeJson(requestPath, request);
	rebindTrackedArtifact(archiveRoot, relativePath);
	const result = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(result.status, 'failed');
	assert.ok(result.issues.some((issue) => issue.includes('review-request.json differs')));
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects a relabelled art review policy attestation after raw tmp evidence is removed', () => {
	const fixture = buildFixture();
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	const relativePath = 'reviews/art/batches/art-review-001/run-policy.json';
	const policyPath = path.join(archiveRoot, relativePath);
	const policy = readJson(policyPath);
	policy.commandActions = 1;
	writeJson(policyPath, policy);
	rebindTrackedArtifact(archiveRoot, relativePath);
	rmSync(path.join(fixture.root, fixture.paths.artReviewRoot), {
		recursive: true,
		force: true
	});

	const result = validateScienceChallengeProvenanceArchive({
		archiveRoot,
		expectedBindings: fixture.bindings
	});
	assert.equal(result.status, 'failed');
	assert.match(result.issues.join('\n'), /run policy:.*commandActions must be 0/s);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('archive construction rejects a fully rehashed art review run that used a tool', () => {
	const fixture = buildFixture();
	const batchRoot = path.join(fixture.root, fixture.paths.artReviewRoot, 'batches/art-review-001');
	const lastMessage = readFileSync(path.join(batchRoot, 'last-message.json'), 'utf8');
	const events = [
		{ type: 'thread.started', thread_id: 'tool-using-review' },
		{ type: 'turn.started' },
		{
			type: 'item.completed',
			item: { type: 'command_execution', command: 'find .. -type f', status: 'passed' }
		},
		{ type: 'item.completed', item: { type: 'agent_message', text: lastMessage } },
		{ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 20 } }
	];
	writeFile(
		path.join(batchRoot, 'events.jsonl'),
		`${events.map((event) => JSON.stringify(event)).join('\n')}\n`
	);
	const runSummaryPath = path.join(batchRoot, 'run-summary.json');
	const runSummary = readJson(runSummaryPath);
	runSummary.commandActions = 1;
	runSummary.events = events.length;
	runSummary.eventLogSha256 = sha256(readFileSync(path.join(batchRoot, 'events.jsonl')));
	writeJson(runSummaryPath, runSummary);
	const reviewSummaryPath = path.join(
		fixture.root,
		fixture.paths.artReviewRoot,
		'review-summary.json'
	);
	const reviewSummary = readJson(reviewSummaryPath);
	reviewSummary.batches[0].eventLogSha256 = runSummary.eventLogSha256;
	reviewSummary.batches[0].runSummarySha256 = canonicalHash(runSummary);
	writeJson(reviewSummaryPath, reviewSummary);
	fixture.bindings.artReviewSha256 = canonicalHash(reviewSummary);

	assert.throws(
		() =>
			buildScienceChallengeProvenanceArchive({
				rootDir: fixture.root,
				archiveRoot: path.join(fixture.root, 'data/challenges/releases/science-test-v1/provenance'),
				releaseId: 'science-test-v1',
				materializedAt: '2026-07-21T00:00:00.000Z',
				expectedBindings: fixture.bindings,
				...fixture.paths
			}),
		/archived art review run violates policy/
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

test('rejects a stale verification assignment index even when its own rows remain valid', () => {
	const fixture = buildFixture();
	const indexPath = path.join(fixture.root, fixture.paths.assignmentIndexPath);
	const index = readJson(indexPath);
	index.candidateSetSha256 = hash('different candidate set');
	writeJson(indexPath, index);
	assert.throws(
		() =>
			buildScienceChallengeProvenanceArchive({
				rootDir: fixture.root,
				archiveRoot: path.join(fixture.root, 'data/challenges/releases/science-test-v1/provenance'),
				releaseId: 'science-test-v1',
				materializedAt: '2026-07-21T00:00:00.000Z',
				expectedBindings: fixture.bindings,
				...fixture.paths
			}),
		/same verification run/
	);
	rmSync(fixture.root, { recursive: true, force: true });
});

function buildDescendantRemapFixture() {
	const fixture = buildFixture();
	const { root } = fixture;
	const shardId = 'science-001';
	const challengeId = 'challenge-001';
	const parentId = 'aqa-biology:cell-transport';
	const leafId = 'aqa-biology:osmosis';
	const specificationSha256 = hash('biology specification');
	const curriculumCatalog = {
		schemaVersion: 'curriculum-catalog/v1',
		specifications: [
			{
				id: 'aqa-biology',
				components: [
					{
						id: parentId,
						parentId: null,
						code: '4.1.3',
						title: 'Transport in cells',
						kind: 'topic',
						sourcePageStart: 12,
						sourcePageEnd: 12
					},
					{
						id: leafId,
						parentId,
						code: '4.1.3.2',
						title: 'Osmosis',
						kind: 'topic',
						sourcePageStart: 13,
						sourcePageEnd: 13
					}
				]
			}
		]
	};
	const componentTuple = (componentId, curriculumCode, curriculumTitle, page) => ({
		curriculumComponentId: componentId,
		curriculumCode,
		curriculumTitle,
		curriculumPageStart: page,
		curriculumPageEnd: page,
		specificationId: 'aqa-biology',
		specificationSha256
	});
	const planRows = Array.from({ length: 408 }, (_, index) => ({
		id: index === 0 ? challengeId : `challenge-${String(index + 1).padStart(3, '0')}`,
		shard: `science-${String(Math.floor(index / 8) + 1).padStart(3, '0')}`,
		calibrationQuestionId: 'q-1',
		...componentTuple(parentId, '4.1.3', 'Transport in cells', 12)
	}));
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-test-v1',
		curriculumCatalogPath: 'tmp/curriculum-catalog.json',
		curriculumCatalogSha256: canonicalHash(curriculumCatalog),
		rows: planRows
	};
	const effectivePlan = structuredClone(basePlan);
	Object.assign(effectivePlan.rows[0], componentTuple(leafId, '4.1.3.2', 'Osmosis', 13));
	const recallReadyDefinition = (row) => ({
		id: row.id,
		subject: 'Biology',
		title: row.id === challengeId ? 'Osmosis challenge' : `Challenge ${row.id}`,
		topic: 'Cell transport',
		memoryHandle:
			'Identify the evidence → State the pattern → Link the pattern to the conclusion → Check the command word',
		previewQuestion: `Explain the reviewed evidence pattern for ${row.id}.`,
		staticAnswers: {
			a: 'The evidence is linked to the scientific conclusion.',
			b: 'The evidence is listed without a scientific conclusion.'
		},
		strongerAnswer: 'a',
		showdownExplanation: 'Answer A links the evidence to the required scientific conclusion.',
		commandWordLesson: 'Explain requires evidence to be linked to a scientific conclusion.',
		repairSuccess: 'The repaired answer now links evidence to the conclusion.',
		transferPromptLead: 'Apply the same evidence link to another result.',
		transferExplanation: 'The transfer uses the same evidence-to-conclusion link.'
	});
	const priorCandidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: basePlan.rows
			.filter((row) => row.shard === shardId)
			.map((row) => ({
				definition: recallReadyDefinition(row),
				grounding: { curriculumComponentId: row.curriculumComponentId }
			}))
	};
	const candidate = structuredClone(priorCandidate);
	const priorTarget = priorCandidate.challenges[0];
	const candidateTarget = candidate.challenges[0];
	candidateTarget.grounding.curriculumComponentId = leafId;
	const remap = {
		challengeId,
		field: 'grounding.curriculumComponentId',
		from: parentId,
		to: leafId
	};
	const inverseRemap = {
		challengeId,
		field: remap.field,
		from: leafId,
		to: parentId
	};
	const firstIssue = {
		field: remap.field,
		category: 'curriculum',
		evidence: 'The challenge is specifically about osmosis.',
		repair: 'Bind the exact terminal osmosis component.'
	};
	const firstReview = {
		id: challengeId,
		accepted: false,
		curriculumGrounded: false,
		issues: [firstIssue]
	};
	const firstReviewSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		reviews: [firstReview]
	};
	const firstReviewResult = {
		schemaVersion: 'science-challenge-independent-verification/v1',
		assignmentId: shardId,
		reviews: [firstReview]
	};
	const firstAssignment = {
		schemaVersion: 'science-challenge-verification-assignment/v2',
		assignmentId: shardId,
		items: [{ candidate: priorTarget }]
	};
	const firstDispatchLedger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		dispatches: [{ assignmentId: shardId }]
	};
	const baseEvidence = {
		componentId: parentId,
		code: '4.1.3',
		title: 'Transport in cells',
		pageStart: 12,
		pageEnd: 12,
		sourceText: 'Transport in cells includes diffusion, osmosis and active transport.',
		sourceTextSha256: hash('parent evidence'),
		specificationId: 'aqa-biology',
		specificationSha256
	};
	const leafEvidence = {
		componentId: leafId,
		code: '4.1.3.2',
		title: 'Osmosis',
		pageStart: 13,
		pageEnd: 13,
		sourceText:
			'Osmosis is the diffusion of water from a dilute solution to a concentrated solution through a partially permeable membrane.',
		sourceTextSha256: hash('leaf evidence'),
		specificationId: 'aqa-biology',
		specificationSha256
	};
	const curriculumEvidence = {
		schemaVersion: 'science-curriculum-evidence/v1',
		planId: basePlan.planId,
		catalogSha256: canonicalHash(curriculumCatalog),
		components: [baseEvidence, leafEvidence]
	};
	const repairSha256 = canonicalHash(firstReviewSummary);
	const candidateByShard = new Map([[shardId, candidate]]);
	const fallbackSelections = [];
	for (const fallbackShardId of [...new Set(effectivePlan.rows.map((row) => row.shard))].slice(1)) {
		const fallbackCandidate = {
			schemaVersion: 'science-challenge-batch/v1',
			challenges: effectivePlan.rows
				.filter((row) => row.shard === fallbackShardId)
				.map((row) => ({
					definition: recallReadyDefinition(row),
					grounding: { curriculumComponentId: row.curriculumComponentId }
				}))
		};
		const fallbackValidation = {
			status: 'passed',
			issues: [],
			candidateSha256: canonicalHash(fallbackCandidate)
		};
		const fallbackRoot = path.join(root, 'tmp/generation/shards', fallbackShardId);
		const candidatePath = path.join(fallbackRoot, 'candidate.json');
		const validationPath = path.join(fallbackRoot, 'validation.json');
		writeJson(candidatePath, fallbackCandidate);
		writeJson(validationPath, fallbackValidation);
		candidateByShard.set(fallbackShardId, fallbackCandidate);
		fallbackSelections.push({
			shardId: fallbackShardId,
			disposition: 'unchanged-verified-fallback',
			candidatePath,
			validationPath,
			candidateSha256: canonicalHash(fallbackCandidate),
			validationSha256: canonicalHash(fallbackValidation),
			firstReviewCandidateSha256: canonicalHash(fallbackCandidate),
			firstReviewValidationSha256: canonicalHash(fallbackValidation)
		});
	}
	const selectedCandidateById = new Map(
		[...candidateByShard.values()].flatMap((batch) =>
			batch.challenges.map((entry) => [entry.definition.id, entry])
		)
	);
	const candidateSet = effectivePlan.rows.map((row) => selectedCandidateById.get(row.id));
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
		shardId,
		repairSha256,
		challengeId,
		base: {
			planSha256: canonicalHash(basePlan),
			planRowIndex: 0,
			planRowSha256: canonicalHash(basePlan.rows[0]),
			component: componentTuple(parentId, '4.1.3', 'Transport in cells', 12),
			componentSha256: canonicalHash(componentTuple(parentId, '4.1.3', 'Transport in cells', 12))
		},
		effective: {
			planSha256: canonicalHash(effectivePlan),
			planRowIndex: 0,
			planRowSha256: canonicalHash(effectivePlan.rows[0]),
			component: componentTuple(leafId, '4.1.3.2', 'Osmosis', 13),
			componentSha256: canonicalHash(componentTuple(leafId, '4.1.3.2', 'Osmosis', 13))
		},
		evidence: {
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			curriculumCatalogSha256: canonicalHash(curriculumCatalog),
			baseEvidenceSha256: canonicalHash(baseEvidence),
			effectiveEvidenceSha256: canonicalHash(leafEvidence)
		},
		firstReview: {
			summarySha256: canonicalHash(firstReviewSummary),
			reviewSha256: canonicalHash(firstReview)
		},
		sourceAttempt: { status: 'failed', attempt: 3 },
		attemptBudget: {
			maxAttempts: 4,
			exhausted: true,
			selectedAttempt: 3,
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
		inverseTargetSha256: canonicalHash(priorTarget),
		collectionValidationSha256: canonicalHash(collectionValidation)
	};
	const manifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	const proposal = buildScienceChallengeCurriculumRemapProposal({
		challengeId,
		field: remap.field,
		from: parentId,
		to: leafId,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		targetCandidateSha256: canonicalHash(candidateTarget),
		batchCandidateSha256: canonicalHash(candidate),
		baseReviewSha256: canonicalHash(firstReviewSummary),
		manifestSha256: canonicalHash(manifest)
	});
	const decision = { ...remap, accepted: true };
	const staged = {
		manifest,
		candidate,
		validation: {
			schemaVersion: 'science-challenge-verifier-directed-descendant-remap-validation/v1',
			status: 'review-pending',
			sourceAttemptStatus: 'failed',
			candidateSha256: canonicalHash(candidate)
		},
		effectivePlan,
		provenance: {
			schemaVersion: 'science-challenge-descendant-remap-provenance/v1',
			executionId: hash('execution'),
			executionIdentity: { shardId }
		},
		priorCandidate,
		priorValidation: { status: 'passed', candidateSha256: canonicalHash(priorCandidate) },
		firstReviewSummary,
		firstReviewResult,
		firstAssignment,
		firstDispatchLedger,
		priorBaseBatchValidation: { status: 'passed', mode: 'prior-base-plan-replay' },
		baseBatchValidation: { status: 'failed', mode: 'base-plan-negative-control' },
		effectiveBatchValidation: { status: 'passed', mode: 'effective-plan-validation' },
		collectionValidation,
		repairValidation: { status: 'failed', sourceAttempt: 3 }
	};
	const recoveryDirectory = path.join(
		root,
		'tmp/generation/shards/science-001/verification-repair-descendant-remap'
	);
	const artifactNames = {
		manifest: 'manifest.json',
		candidate: 'candidate.json',
		validation: 'validation.json',
		effectivePlan: 'effective-plan.json',
		provenance: 'provenance.json',
		priorCandidate: 'prior-candidate.json',
		priorValidation: 'prior-validation.json',
		firstReviewSummary: 'first-review-summary.json',
		firstReviewResult: 'first-review-result.json',
		firstAssignment: 'first-assignment.json',
		firstDispatchLedger: 'first-dispatch-ledger.json',
		priorBaseBatchValidation: 'prior-base-batch-validation.json',
		baseBatchValidation: 'base-batch-validation.json',
		effectiveBatchValidation: 'effective-batch-validation.json',
		collectionValidation: 'collection-validation.json',
		repairValidation: 'repair-validation.json'
	};
	const artifactPaths = {};
	for (const [field, filename] of Object.entries(artifactNames)) {
		artifactPaths[field] = path.join(recoveryDirectory, filename);
		writeJson(artifactPaths[field], staged[field]);
	}
	const effectiveCohort = stageScienceChallengeEffectiveCohort({
		workspaceRoot: root,
		outputRoot: path.join(root, 'tmp/generation'),
		repairSha256,
		objectiveId: hash('effective-cohort objective'),
		executionId: hash('effective-cohort execution'),
		firstReviewSha256: repairSha256,
		basePlan,
		effectivePlan,
		sourceSnapshotSha256: canonicalHash(
			readJson(path.join(root, fixture.paths.sourceSnapshotPath))
		),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		curriculumCatalogSha256: canonicalHash(curriculumCatalog),
		shardSelections: [
			{
				shardId,
				disposition: 'descendant-remap',
				candidatePath: artifactPaths.candidate,
				validationPath: artifactPaths.validation,
				candidateSha256: canonicalHash(candidate),
				validationSha256: canonicalHash(staged.validation),
				remapManifestPath: artifactPaths.manifest,
				priorCandidatePath: artifactPaths.priorCandidate
			},
			...fallbackSelections
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
	assert.equal(effectiveCohort.status, 'passed', effectiveCohort.issues.join('\n'));
	const verifierInput = buildScienceChallengeCurriculumRemapVerifierInput({
		basePlanSha256: canonicalHash(basePlan),
		basePlan,
		effectivePlan,
		curriculumCatalogSha256: canonicalHash(curriculumCatalog),
		effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
		candidateCount: effectivePlan.rows.length,
		candidateSetSha256: effectiveCohort.candidateSetSha256,
		remapManifestSetSha256: effectiveCohort.manifest.remapManifestSetSha256,
		candidateOverrides: [
			{
				shardId,
				manifest,
				candidate,
				priorCandidate,
				candidateSha256: canonicalHash(candidate),
				manifestSha256: canonicalHash(manifest)
			}
		],
		proposals: [proposal],
		evidence: [
			{
				challengeId,
				proposalSha256: proposal.proposalSha256,
				field: remap.field,
				from: {
					componentId: parentId,
					title: baseEvidence.title,
					sourceTextSha256: baseEvidence.sourceTextSha256,
					substantiveExcerpt: baseEvidence.sourceText
				},
				to: {
					componentId: leafId,
					title: leafEvidence.title,
					sourceTextSha256: leafEvidence.sourceTextSha256,
					substantiveExcerpt: leafEvidence.sourceText
				},
				ancestryChain: [
					{ componentId: parentId, title: baseEvidence.title },
					{ componentId: leafId, title: leafEvidence.title }
				],
				targetRowDiffStatement: 'Only grounding.curriculumComponentId changes on the target row.',
				originalSingleIssueGate: firstIssue
			}
		]
	});
	const packetSha256 = hash('durable packet');
	const durableRemap = {
		challengeId,
		field: remap.field,
		from: parentId,
		to: leafId,
		fromTitle: baseEvidence.title,
		toTitle: leafEvidence.title,
		fromSourceTextSha256: baseEvidence.sourceTextSha256,
		toSourceTextSha256: leafEvidence.sourceTextSha256,
		ancestryChain: [
			{ componentId: parentId, title: baseEvidence.title },
			{ componentId: leafId, title: leafEvidence.title }
		],
		proposalSha256: proposal.proposalSha256,
		targetCandidateSha256: proposal.targetCandidateSha256,
		batchCandidateSha256: proposal.batchCandidateSha256,
		baseReviewSha256: proposal.baseReviewSha256,
		manifestSha256: proposal.manifestSha256,
		assignmentId: shardId,
		assignmentSha256: hash('durable assignment'),
		packetSha256,
		resultSha256: hash('durable result'),
		decision,
		decisionSha256: canonicalHash(decision)
	};
	const durableReceiptCore = {
		schemaVersion: 'science-challenge-curriculum-remap-durable-receipt/v1',
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		curriculumCatalogSha256: canonicalHash(curriculumCatalog),
		effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
		candidateCount: effectivePlan.rows.length,
		candidateSetSha256: effectiveCohort.candidateSetSha256,
		remapManifestSetSha256: effectiveCohort.manifest.remapManifestSetSha256,
		recoverySetSha256: verifierInput.recoverySetSha256,
		verifierInputSha256: canonicalHash(verifierInput),
		packetManifestSha256: hash('durable packet manifest'),
		proposalSetSha256: canonicalHash([proposal]),
		decisionSetSha256: canonicalHash([decision]),
		packetSetSha256: canonicalHash([packetSha256]),
		remaps: [durableRemap]
	};
	const curriculumRemapDurableReceipt = {
		...durableReceiptCore,
		receiptSha256: canonicalHash(durableReceiptCore)
	};
	const fileBinding = (filePath, shardRoot) => {
		const bytes = readFileSync(filePath);
		return {
			path: path.relative(shardRoot, filePath),
			sha256: sha256(bytes),
			canonicalSha256:
				path.extname(filePath) === '.json'
					? canonicalHash(JSON.parse(bytes.toString('utf8')))
					: undefined
		};
	};
	const shardRoot = path.join(root, 'tmp/generation/shards/science-001');
	const attempts = [1, 2, 3, 4].map((attempt) => {
		const attemptDirectory = `verification-repair-${hash('repair').slice(
			0,
			12
		)}-attempt-${String(attempt).padStart(2, '0')}`;
		const attemptRoot = path.join(shardRoot, attemptDirectory);
		const partRoot = path.join(attemptRoot, 'parts/part-01');
		const inputSha256 = hash(`attempt-${attempt}-input`);
		const attemptCandidate = structuredClone(candidate);
		const runSummary = {
			status: 'passed',
			attempt,
			inputSha256,
			parts: [{ partId: 'part-01', inputSha256 }]
		};
		const sourceValidation = {
			status: 'failed',
			candidateSha256: canonicalHash(attemptCandidate)
		};
		writeJson(path.join(attemptRoot, 'run-summary.json'), runSummary);
		writeJson(path.join(attemptRoot, 'validation.json'), sourceValidation);
		writeJson(path.join(attemptRoot, 'candidate.json'), attemptCandidate);
		writeJson(path.join(attemptRoot, 'last-message.json'), attemptCandidate);
		writeFile(
			path.join(attemptRoot, 'prompt.txt'),
			`Repair attempt ${attempt}.\nINPUT ROWS\n[]\n\nReturn science-challenge-batch/v1 JSON only.\n`
		);
		writeFile(path.join(attemptRoot, 'events.jsonl'), '{"type":"thread.started"}\n');
		writeFile(
			path.join(partRoot, 'prompt.txt'),
			`Repair part ${attempt}.\nINPUT ROWS\n[]\n\nReturn science-challenge-batch/v1 JSON only.\n`
		);
		writeJson(path.join(partRoot, 'last-message.json'), attemptCandidate);
		writeJson(path.join(partRoot, 'run-summary.json'), {
			status: 'passed',
			inputSha256
		});
		writeJson(path.join(partRoot, 'result-metadata.json'), { status: 'passed' });
		writeJson(path.join(partRoot, 'request.json'), { inputSha256 });
		writeFile(path.join(partRoot, 'events.jsonl'), '{"type":"thread.started"}\n');
		writeFile(path.join(partRoot, 'thoughts.txt'), '');
		const runPolicy = {
			status: 'passed',
			issues: [],
			candidate: attemptCandidate,
			parts: [{}]
		};
		return {
			attempt,
			status: 'failed',
			candidate: attemptCandidate,
			runSummary,
			sourceValidation,
			runPolicy,
			fileBindings: {
				attemptDirectory,
				runSummary: fileBinding(path.join(attemptRoot, 'run-summary.json'), shardRoot),
				validation: fileBinding(path.join(attemptRoot, 'validation.json'), shardRoot),
				candidate: fileBinding(path.join(attemptRoot, 'candidate.json'), shardRoot),
				lastMessage: fileBinding(path.join(attemptRoot, 'last-message.json'), shardRoot),
				prompt: fileBinding(path.join(attemptRoot, 'prompt.txt'), shardRoot),
				eventLog: fileBinding(path.join(attemptRoot, 'events.jsonl'), shardRoot)
			}
		};
	});
	const objectivePath = path.join(root, 'tmp/execution/objective.json');
	const objective = { schemaVersion: 'science-challenge-verification-repair-objective/v1' };
	writeJson(objectivePath, objective);
	const claims = [1, 2, 3, 4].map((attempt) => {
		const claimPath = path.join(root, `tmp/execution/attempt-${attempt}/claim.json`);
		const claim = { schemaVersion: 'science-challenge-verification-repair-claim/v1', attempt };
		writeJson(claimPath, claim);
		return {
			attempt,
			path: claimPath,
			sha256: canonicalHash(claim),
			fileSha256: sha256(readFileSync(claimPath))
		};
	});
	const lineageRemap = {
		schemaVersion: 'science-challenge-verifier-directed-descendant-remap-evidence/v1',
		disposition: 'deterministic-verifier-directed-descendant-remap',
		...Object.fromEntries(
			Object.entries(artifactPaths).map(([field, filePath]) => [
				`${field}Path`,
				path.relative(root, filePath)
			])
		),
		...Object.fromEntries(
			Object.entries(staged).map(([field, value]) => [`${field}Sha256`, canonicalHash(value)])
		),
		manifestFileSha256: sha256(readFileSync(artifactPaths.manifest)),
		candidateFileSha256: sha256(readFileSync(artifactPaths.candidate)),
		validationFileSha256: sha256(readFileSync(artifactPaths.validation)),
		effectivePlanFileSha256: sha256(readFileSync(artifactPaths.effectivePlan)),
		provenanceFileSha256: sha256(readFileSync(artifactPaths.provenance)),
		basePlanSha256: canonicalHash(basePlan),
		remapSha256: canonicalHash(remap),
		sourceAttempt: manifest.sourceAttempt,
		sourceAttemptStatus: 'failed',
		canonicalVerifier: { model: 'gpt-5.6-sol', reasoningEffort: 'max' },
		execution: {
			executionId: staged.provenance.executionId,
			identity: staged.provenance.executionIdentity,
			objectivePath: path.relative(root, objectivePath),
			objectiveSha256: canonicalHash(objective),
			objectiveFileSha256: sha256(readFileSync(objectivePath)),
			claims
		}
	};
	fixture.paths.lineage.content[0] = {
		shardId,
		candidatePath: path.relative(root, artifactPaths.candidate),
		candidateSha256: canonicalHash(candidate),
		validationPath: path.relative(root, artifactPaths.validation),
		validationSha256: canonicalHash(staged.validation),
		runSummaries: [],
		descendantRemap: lineageRemap
	};
	fixture.paths.lineage.descendantRemaps = [lineageRemap];
	fixture.paths.lineage.effectiveCohort = {
		manifestSha256: canonicalHash(effectiveCohort.manifest),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		candidateSetSha256: effectiveCohort.candidateSetSha256,
		candidateCount: effectivePlan.rows.length,
		remapManifestSetSha256: effectiveCohort.manifest.remapManifestSetSha256,
		recoverySetSha256: verifierInput.recoverySetSha256
	};
	fixture.paths.lineage.curriculumRemap = {
		verifierInputSha256: canonicalHash(verifierInput),
		durableReceiptSha256: canonicalHash(curriculumRemapDurableReceipt),
		proposalSetSha256: curriculumRemapDurableReceipt.proposalSetSha256,
		decisionSetSha256: curriculumRemapDurableReceipt.decisionSetSha256
	};
	const contentReviewPath = path.join(root, fixture.paths.contentReviewPath);
	const contentReview = readJson(contentReviewPath);
	contentReview.reviews[0].curriculumRemapDecisions = [decision];
	contentReview.curriculumRemapDurableReceipt = curriculumRemapDurableReceipt;
	contentReview.curriculumRemapDurableReceiptSha256 = canonicalHash(curriculumRemapDurableReceipt);
	const resultPath = path.join(root, contentReview.assignmentResults[0].path);
	const result = readJson(resultPath);
	result.reviews[0].curriculumRemapDecisions = [decision];
	writeJson(resultPath, result);
	contentReview.assignmentResults[0].sha256 = canonicalHash(result);
	writeJson(contentReviewPath, contentReview);
	writeJson(path.join(root, fixture.paths.planPath), basePlan);
	writeJson(path.join(root, fixture.paths.curriculumCatalogPath), curriculumCatalog);
	writeJson(path.join(root, fixture.paths.curriculumEvidencePath), curriculumEvidence);
	const assignmentIndexPath = path.join(root, fixture.paths.assignmentIndexPath);
	const assignmentIndex = readJson(assignmentIndexPath);
	assignmentIndex.planSha256 = canonicalHash(basePlan);
	assignmentIndex.curriculumEvidenceSha256 = canonicalHash(curriculumEvidence);
	assignmentIndex.candidateSetSha256 = effectiveCohort.candidateSetSha256;
	assignmentIndex.recoverySetSha256 = verifierInput.recoverySetSha256;
	writeJson(assignmentIndexPath, assignmentIndex);
	const dispatchLedgerPath = path.join(root, fixture.paths.verifierDispatchLedgerPath);
	const dispatchLedger = readJson(dispatchLedgerPath);
	dispatchLedger.indexSha256 = canonicalHash(assignmentIndex);
	writeJson(dispatchLedgerPath, dispatchLedger);
	contentReview.indexSha256 = canonicalHash(assignmentIndex);
	contentReview.dispatchLedgerSha256 = canonicalHash(dispatchLedger);
	contentReview.planSha256 = canonicalHash(effectivePlan);
	contentReview.basePlanSha256 = canonicalHash(basePlan);
	contentReview.effectivePlanSha256 = canonicalHash(effectivePlan);
	contentReview.sourceSnapshotSha256 = fixture.bindings.sourceSnapshotSha256;
	contentReview.curriculumEvidenceSha256 = canonicalHash(curriculumEvidence);
	contentReview.candidateSetSha256 = effectiveCohort.candidateSetSha256;
	contentReview.reviewCount = effectiveCohort.candidateSet.length;
	writeJson(contentReviewPath, contentReview);
	fixture.paths.effectivePlan = effectivePlan;
	fixture.paths.effectiveCohort = effectiveCohort;
	fixture.paths.curriculumRemapVerifierInputSha256 = canonicalHash(verifierInput);
	fixture.paths.curriculumRemapDurableReceipt = curriculumRemapDurableReceipt;
	fixture.paths.descendantRemapRecoveries = [
		{
			status: 'passed',
			...staged,
			artifactPaths,
			attempts
		}
	];
	fixture.bindings.planSha256 = canonicalHash(basePlan);
	fixture.bindings.basePlanSha256 = canonicalHash(basePlan);
	fixture.bindings.effectivePlanSha256 = canonicalHash(effectivePlan);
	fixture.bindings.curriculumEvidenceSha256 = canonicalHash(curriculumEvidence);
	fixture.bindings.curriculumCatalogSha256 = canonicalHash(curriculumCatalog);
	fixture.bindings.effectiveCohortManifestSha256 = canonicalHash(effectiveCohort.manifest);
	fixture.bindings.effectiveCohortCandidateSetSha256 = effectiveCohort.candidateSetSha256;
	fixture.bindings.curriculumRemapVerifierInputSha256 = canonicalHash(verifierInput);
	fixture.bindings.curriculumRemapDurableReceiptSha256 = canonicalHash(
		curriculumRemapDurableReceipt
	);
	fixture.bindings.descendantRemapManifestSetSha256 = canonicalHash([manifest]);
	fixture.bindings.curriculumRemapDecisionSetSha256 = canonicalHash([decision]);
	fixture.bindings.recoverySetSha256 = verifierInput.recoverySetSha256;
	fixture.bindings.contentVerificationSha256 = canonicalHash(contentReview);
	fixture.bindings.verifierDispatchLedgerSha256 = canonicalHash(dispatchLedger);
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	fixture.bindings.contentGenerationLineageSha256 = canonicalHash(fixture.paths.lineage.content);
	return fixture;
}

function promoteDescendantRemapFixtureToSuccessor(fixture) {
	const predecessor = fixture.paths.effectiveCohort;
	const basePlan = readJson(path.join(fixture.root, fixture.paths.planPath));
	const effectivePlan = fixture.paths.effectivePlan;
	const repairedRow = effectivePlan.rows.find((row) => row.shard === 'science-002');
	const reviews = effectivePlan.rows.map((row) => {
		const review = {
			id: row.id,
			...Object.fromEntries(SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])),
			checkedCalculations: [],
			issues: [],
			accepted: true
		};
		if (row.id === repairedRow.id) {
			review.precisionAndSpecificity = false;
			review.accepted = false;
			review.issues = [
				{
					field: 'definition.title',
					category: 'precision',
					evidence: 'The title is too generic for the exact prompt.',
					repair: 'Make only the rejected title more specific.'
				}
			];
		}
		return review;
	});
	const shardIds = [...new Set(effectivePlan.rows.map((row) => row.shard))];
	const failedReview = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planId: effectivePlan.planId,
		planSha256: canonicalHash(effectivePlan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		sourceSnapshotSha256: predecessor.manifest.sourceSnapshotSha256,
		curriculumEvidenceSha256: predecessor.manifest.curriculumEvidenceSha256,
		candidateSetSha256: predecessor.candidateSetSha256,
		recoverySetSha256: predecessor.manifest.recoverySetSha256,
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
	const repairSha256 = canonicalHash(failedReview);
	const priorCandidate = predecessor.candidateBatches.get(repairedRow.shard);
	const candidate = structuredClone(priorCandidate);
	candidate.challenges.find((entry) => entry.definition.id === repairedRow.id).definition.title =
		'Specific second-cycle title';
	const validation = {
		status: 'passed',
		issues: [],
		candidateSha256: canonicalHash(candidate)
	};
	const proposalRoot = path.join(
		fixture.root,
		fixture.paths.generationRoot,
		'shards',
		repairedRow.shard,
		`verification-repair-${repairSha256.slice(0, 12)}-attempt-01`
	);
	const candidatePath = path.join(proposalRoot, 'candidate.json');
	const validationPath = path.join(proposalRoot, 'validation.json');
	writeJson(candidatePath, candidate);
	writeJson(validationPath, validation);
	const successor = stageScienceChallengeEffectiveCohortSuccessor({
		workspaceRoot: fixture.root,
		outputRoot: path.join(fixture.root, fixture.paths.generationRoot),
		repairSha256,
		objectiveId: hash('second repair objective'),
		executionId: hash('second repair execution'),
		reviewSummary: failedReview,
		reviewEffectiveCohortManifestSha256: canonicalHash(predecessor.manifest),
		predecessor,
		proposals: [
			{
				shardId: repairedRow.shard,
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
	assert.equal(successor.status, 'passed', successor.issues.join('\n'));

	const verifierInputSha256 = hash('second repair terminal curriculum verifier input');
	const receipt = structuredClone(fixture.paths.curriculumRemapDurableReceipt);
	receipt.effectiveCohortManifestSha256 = canonicalHash(successor.manifest);
	receipt.candidateSetSha256 = successor.candidateSetSha256;
	receipt.verifierInputSha256 = verifierInputSha256;
	const receiptCore = structuredClone(receipt);
	delete receiptCore.receiptSha256;
	receipt.receiptSha256 = canonicalHash(receiptCore);
	fixture.paths.curriculumRemapDurableReceipt = receipt;
	fixture.paths.curriculumRemapVerifierInputSha256 = verifierInputSha256;
	fixture.paths.effectiveCohort = successor;
	fixture.paths.lineage.effectiveCohort.manifestSha256 = canonicalHash(successor.manifest);
	fixture.paths.lineage.effectiveCohort.candidateSetSha256 = successor.candidateSetSha256;
	fixture.paths.lineage.curriculumRemap.verifierInputSha256 = verifierInputSha256;
	fixture.paths.lineage.curriculumRemap.durableReceiptSha256 = canonicalHash(receipt);

	const assignmentIndexPath = path.join(fixture.root, fixture.paths.assignmentIndexPath);
	const assignmentIndex = readJson(assignmentIndexPath);
	assignmentIndex.candidateSetSha256 = successor.candidateSetSha256;
	assignmentIndex.effectiveCohortManifestSha256 = canonicalHash(successor.manifest);
	writeJson(assignmentIndexPath, assignmentIndex);
	const dispatchLedgerPath = path.join(fixture.root, fixture.paths.verifierDispatchLedgerPath);
	const dispatchLedger = readJson(dispatchLedgerPath);
	dispatchLedger.indexSha256 = canonicalHash(assignmentIndex);
	writeJson(dispatchLedgerPath, dispatchLedger);
	const contentReviewPath = path.join(fixture.root, fixture.paths.contentReviewPath);
	const contentReview = readJson(contentReviewPath);
	contentReview.candidateSetSha256 = successor.candidateSetSha256;
	contentReview.indexSha256 = canonicalHash(assignmentIndex);
	contentReview.dispatchLedgerSha256 = canonicalHash(dispatchLedger);
	contentReview.curriculumRemapDurableReceipt = receipt;
	contentReview.curriculumRemapDurableReceiptSha256 = canonicalHash(receipt);
	writeJson(contentReviewPath, contentReview);

	fixture.bindings.effectiveCohortManifestSha256 = canonicalHash(successor.manifest);
	fixture.bindings.effectiveCohortCandidateSetSha256 = successor.candidateSetSha256;
	fixture.bindings.curriculumRemapVerifierInputSha256 = verifierInputSha256;
	fixture.bindings.curriculumRemapDurableReceiptSha256 = canonicalHash(receipt);
	fixture.bindings.contentVerificationSha256 = canonicalHash(contentReview);
	fixture.bindings.verifierDispatchLedgerSha256 = canonicalHash(dispatchLedger);
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	fixture.bindings.contentGenerationLineageSha256 = canonicalHash(fixture.paths.lineage.content);
	fixture.successorPredecessor = predecessor;
	return fixture;
}

function promoteFixtureToReviewRebaseSuccessor(fixture) {
	const root = fixture.root;
	const sourceSnapshot = readJson(path.join(root, fixture.paths.sourceSnapshotPath));
	const curriculumEvidence = readJson(path.join(root, fixture.paths.curriculumEvidencePath));
	const curriculumCatalog = readJson(path.join(root, fixture.paths.curriculumCatalogPath));
	const sourceQuestion = sourceSnapshot.questions[0];
	const rows = Array.from({ length: 408 }, (_, index) => ({
		id: `challenge-${String(index + 1).padStart(3, '0')}`,
		shard: `science-${String(Math.floor(index / 8) + 1).padStart(3, '0')}`,
		curriculumComponentId: 'bio-1',
		difficulty: index === 0 ? 'stretch' : 'standard',
		taskShape: 'recall',
		calibrationQuestionId: sourceQuestion.id,
		calibrationQuestionSha256: sourceQuestion.contentSha256
	}));
	const basePlan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-test-v1',
		existingRoundCount: 0,
		curriculumCatalogPath: fixture.paths.curriculumCatalogPath,
		curriculumCatalogSha256: canonicalHash(curriculumCatalog),
		rows
	};
	const shardIds = [...new Set(rows.map((row) => row.shard))];
	const parentBatches = new Map(
		shardIds.map((shardId) => [
			shardId,
			reviewRebaseFixtureBatch(rows.filter((row) => row.shard === shardId))
		])
	);
	const parentCandidates = rows.map((row) =>
		parentBatches.get(row.shard).challenges.find((challenge) => challenge.definition.id === row.id)
	);
	const rejectedId = rows[0].id;
	const parentReviews = rows.map((row) => ({ id: row.id, accepted: true, issues: [] }));
	parentReviews[0] = {
		id: rejectedId,
		accepted: false,
		issues: [
			{
				field: 'definition.difficulty',
				repair: 'Set definition.difficulty to standard.'
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
	const collectionIssues = [
		`${rejectedId} duplicates an already reviewed transfer context.`,
		`${rejectedId} also collides with a second reviewed context.`
	];
	const collectionRemediations = collectionIssues.map((issue) => ({
		issue,
		preferredChallengeId: rejectedId
	}));
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
			rationale: 'Fixture authorization for a fresh full-cohort review.',
			authorizedMutationKeys: [`${rejectedId}:difficulty`, `${rejectedId}:definition.difficulty`],
			authorizedCollectionRemediationKeys: collectionIssues.map(
				(issue) => `${rejectedId}:${canonicalHash(issue)}`
			)
		},
		planMutations: [
			{
				challengeId: rejectedId,
				field: 'difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		candidateMutations: [
			{
				challengeId: rejectedId,
				field: 'definition.difficulty',
				from: 'stretch',
				to: 'standard',
				authority: 'parent-review'
			}
		],
		collectionRemediations
	};
	const inputRoot = path.join(root, 'tmp/review-rebase-inputs');
	for (const [name, value] of [
		['spec.json', spec],
		['base-plan.json', basePlan],
		['source.json', sourceSnapshot],
		['curriculum.json', curriculumEvidence],
		['parent-verification.json', parentVerification],
		['parent-repair.json', parentRepair]
	]) {
		writeJson(path.join(inputRoot, name), value);
	}
	const parentCandidateSources = [];
	const selections = [];
	for (const shardId of shardIds) {
		const candidate = parentBatches.get(shardId);
		const assignment = {
			schemaVersion: 'science-challenge-verification-assignment/v2',
			assignmentId: shardId,
			planSha256: canonicalHash(basePlan),
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			items: candidate.challenges.map((entry) => ({ candidate: entry }))
		};
		const validation = {
			status: 'failed',
			issues: ['Selected exhausted parent candidate.'],
			candidateSha256: canonicalHash(candidate)
		};
		const assignmentPath = path.join(inputRoot, `parent-${shardId}.json`);
		const candidatePath = path.join(inputRoot, `selected-${shardId}.json`);
		const validationPath = path.join(inputRoot, `selected-${shardId}-validation.json`);
		writeJson(assignmentPath, assignment);
		writeJson(candidatePath, candidate);
		writeJson(validationPath, validation);
		parentCandidateSources.push({
			shardId,
			assignmentPath: path.relative(root, assignmentPath),
			assignmentSha256: canonicalHash(assignment)
		});
		selections.push({
			shardId,
			disposition: 'immutable-parent-repair-candidate',
			candidatePath: path.relative(root, candidatePath),
			candidateSha256: canonicalHash(candidate),
			validationPath: path.relative(root, validationPath),
			validationSha256: canonicalHash(validation),
			rowOverrides: []
		});
	}
	const selectionIndex = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA,
		parentCandidateSources,
		selections
	};
	const selectionIndexPath = path.join(inputRoot, 'selections.json');
	writeJson(selectionIndexPath, selectionIndex);
	const reviewRebaseValidators = {
		validatePlan: () => ({ status: 'passed', issues: [] }),
		validateBatch: () => ({ status: 'passed', issues: [] }),
		validateCollection: () => ({
			status: 'failed',
			issues: collectionIssues
		})
	};
	const reviewRebaseEvidence = publishScienceChallengeReviewRebaseEvidence({
		repositoryRoot: root,
		outputRoot: 'tmp/review-rebase',
		specPath: path.relative(root, path.join(inputRoot, 'spec.json')),
		basePlanPath: path.relative(root, path.join(inputRoot, 'base-plan.json')),
		sourceSnapshotPath: path.relative(root, path.join(inputRoot, 'source.json')),
		curriculumEvidencePath: path.relative(root, path.join(inputRoot, 'curriculum.json')),
		parentVerificationPath: path.relative(root, path.join(inputRoot, 'parent-verification.json')),
		parentRepairPath: path.relative(root, path.join(inputRoot, 'parent-repair.json')),
		selectionIndexPath: path.relative(root, selectionIndexPath),
		existingDefinitions: [],
		...reviewRebaseValidators
	});
	assert.equal(reviewRebaseEvidence.status, 'passed', reviewRebaseEvidence.issues.join('\n'));

	const effectivePlan = reviewRebaseEvidence.plan;
	const v1Reviews = effectivePlan.rows.map((row) => completeScienceReviewRow(row.id));
	v1Reviews[0] = {
		...v1Reviews[0],
		precisionAndSpecificity: false,
		accepted: false,
		issues: [
			{
				field: 'definition.title',
				category: 'precision',
				evidence: 'The reviewed title is too generic.',
				repair: 'Make the title specific to the prompt.'
			}
		]
	};
	const firstVerification = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planId: effectivePlan.planId,
		planSha256: canonicalHash(effectivePlan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: reviewRebaseEvidence.coreManifest.candidateSetSha256,
		reviewRebaseManifestSha256: canonicalHash(reviewRebaseEvidence.manifest),
		reviewRebaseId: reviewRebaseEvidence.coreManifest.rebaseId,
		reviewRebaseCandidateSetSha256: reviewRebaseEvidence.coreManifest.candidateSetSha256,
		reviewRebaseCollectionValidationSha256:
			reviewRebaseEvidence.coreManifest.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256:
			reviewRebaseEvidence.coreManifest.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediations: collectionRemediations,
		reviewRebaseCollectionRemediationTargetIds: [rejectedId],
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash([rejectedId]),
		assignmentCount: shardIds.length,
		reviewCount: effectivePlan.rows.length,
		acceptedCount: effectivePlan.rows.length - 1,
		rejectedCount: 1,
		assignmentResults: shardIds.map((assignmentId) => ({
			assignmentId,
			status: 'passed'
		})),
		reviews: v1Reviews,
		issues: []
	};
	const repairSha256 = canonicalHash(firstVerification);
	const repairedShardId = rows[0].shard;
	const priorCandidate = reviewRebaseEvidence.candidateBatches.get(repairedShardId);
	const priorValidation = reviewRebaseEvidence.outputValidations.get(repairedShardId);
	const repairedCandidate = structuredClone(priorCandidate);
	repairedCandidate.challenges[0].definition.cohortVersion = 'review-rebase-successor';
	const repairedValidation = {
		status: 'passed',
		issues: [],
		candidateSha256: canonicalHash(repairedCandidate)
	};
	const proposalRoot = path.join(
		root,
		fixture.paths.generationRoot,
		'shards',
		repairedShardId,
		`verification-repair-${repairSha256.slice(0, 12)}-attempt-01`
	);
	const repairedCandidatePath = path.join(proposalRoot, 'candidate.json');
	const repairedValidationPath = path.join(proposalRoot, 'validation.json');
	writeJson(repairedCandidatePath, repairedCandidate);
	writeJson(repairedValidationPath, repairedValidation);
	const validateCollectionCandidate = ({ candidateSet, effectivePlan: candidatePlan }) => ({
		status: 'passed',
		issues: [],
		repairTargets: [],
		candidateCount: candidateSet.length,
		candidateSetSha256: canonicalHash(candidateSet),
		effectivePlanSha256: canonicalHash(candidatePlan)
	});
	const effectiveCohort = stageScienceChallengeEffectiveCohortSuccessor({
		workspaceRoot: root,
		outputRoot: path.join(root, fixture.paths.generationRoot),
		repairSha256,
		objectiveId: hash('review-rebase successor objective'),
		executionId: hash('review-rebase successor execution'),
		reviewSummary: firstVerification,
		reviewRebaseEvidence,
		verificationRepairAuthority: null,
		proposals: [
			{
				shardId: repairedShardId,
				attempt: 1,
				candidatePath: repairedCandidatePath,
				validationPath: repairedValidationPath,
				candidateSha256: canonicalHash(repairedCandidate),
				validationSha256: canonicalHash(repairedValidation),
				expectedTargetCandidateSha256: canonicalHash(priorCandidate),
				expectedTargetValidationSha256: canonicalHash(priorValidation)
			}
		],
		validateCollectionCandidate
	});
	assert.equal(effectiveCohort.status, 'passed', effectiveCohort.issues.join('\n'));

	writeJson(path.join(root, fixture.paths.planPath), basePlan);
	const assignments = [];
	const dispatches = [];
	const assignmentResults = [];
	const acceptedReviews = effectivePlan.rows.map((row) => ({
		id: row.id,
		accepted: true
	}));
	for (const shardId of shardIds) {
		const shardRows = effectivePlan.rows.filter((row) => row.shard === shardId);
		const candidate = effectiveCohort.candidateBatches.get(shardId);
		const assignment = {
			schemaVersion: 'science-challenge-verification-assignment/v2',
			assignmentId: shardId,
			planSha256: canonicalHash(effectivePlan),
			sourceSnapshotSha256: canonicalHash(sourceSnapshot),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			items: candidate.challenges.map((entry) => ({ candidate: entry }))
		};
		const assignmentPath = `tmp/verification/assignments/${shardId}.json`;
		writeJson(path.join(root, assignmentPath), assignment);
		assignments.push({
			assignmentId: shardId,
			path: assignmentPath,
			sha256: canonicalHash(assignment),
			ids: shardRows.map((row) => row.id)
		});
		dispatches.push({
			assignmentId: shardId,
			assignmentSha256: canonicalHash(assignment),
			taskName: `/root/science_verify_${shardId.slice(-3)}`
		});
		const result = {
			schemaVersion: 'science-challenge-independent-verification/v1',
			assignmentId: shardId,
			reviews: shardRows.map((row) => ({ id: row.id, accepted: true }))
		};
		const resultPath = `tmp/verification/reviews/${shardId}.json`;
		writeJson(path.join(root, resultPath), result);
		assignmentResults.push({
			assignmentId: shardId,
			path: resultPath,
			sha256: canonicalHash(result),
			status: 'passed'
		});
	}
	const assignmentIndex = {
		schemaVersion: 'science-challenge-verification-assignment-index/v1',
		planId: effectivePlan.planId,
		planSha256: canonicalHash(basePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: effectiveCohort.candidateSetSha256,
		effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
		assignments
	};
	const dispatchLedger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		indexSha256: canonicalHash(assignmentIndex),
		dispatches
	};
	const contentVerification = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'passed',
		planId: effectivePlan.planId,
		planSha256: canonicalHash(effectivePlan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: effectiveCohort.candidateSetSha256,
		effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
		indexSha256: canonicalHash(assignmentIndex),
		dispatchLedgerSha256: canonicalHash(dispatchLedger),
		assignmentCount: shardIds.length,
		reviewCount: effectivePlan.rows.length,
		acceptedCount: effectivePlan.rows.length,
		rejectedCount: 0,
		assignmentResults,
		reviews: acceptedReviews,
		issues: []
	};
	writeJson(path.join(root, fixture.paths.assignmentIndexPath), assignmentIndex);
	writeJson(path.join(root, fixture.paths.verifierDispatchLedgerPath), dispatchLedger);
	writeJson(path.join(root, fixture.paths.contentReviewPath), contentVerification);

	fixture.paths.effectivePlan = effectivePlan;
	fixture.paths.effectiveCohort = effectiveCohort;
	fixture.paths.reviewRebaseEvidence = reviewRebaseEvidence;
	fixture.paths.reviewRebaseExistingDefinitions = [];
	fixture.paths.reviewRebaseValidators = reviewRebaseValidators;
	fixture.paths.lineage.effectiveCohort = {
		manifestSha256: canonicalHash(effectiveCohort.manifest),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		candidateSetSha256: effectiveCohort.candidateSetSha256,
		candidateCount: effectiveCohort.candidateSet.length,
		remapManifestSetSha256: effectiveCohort.manifest.remapManifestSetSha256,
		difficultyAdjustmentManifestSetSha256:
			effectiveCohort.manifest.difficultyAdjustmentManifestSetSha256,
		recoverySetSha256: effectiveCohort.manifest.recoverySetSha256,
		parentChain: structuredClone(effectiveCohort.manifest.parentChain)
	};
	Object.assign(fixture.bindings, {
		planSha256: canonicalHash(basePlan),
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		effectiveCohortManifestSha256: canonicalHash(effectiveCohort.manifest),
		effectiveCohortCandidateSetSha256: effectiveCohort.candidateSetSha256,
		recoverySetSha256: effectiveCohort.manifest.recoverySetSha256,
		contentVerificationSha256: canonicalHash(contentVerification),
		verifierDispatchLedgerSha256: canonicalHash(dispatchLedger),
		contentParentLineageSha256: canonicalHash(effectiveCohort.manifest.parentChain)
	});
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	fixture.bindings.contentGenerationLineageSha256 = canonicalHash(fixture.paths.lineage.content);
	return fixture;
}

function reviewRebaseFixtureBatch(rows) {
	return {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: rows.map((row) => ({
			definition: {
				id: row.id,
				title: `Review-rebase ${row.id}`,
				sourceQuestionId: row.calibrationQuestionId,
				marks: 2,
				difficulty: row.difficulty,
				cohortVersion: 'review-rebase-b0'
			},
			grounding: {
				curriculumComponentId: row.curriculumComponentId,
				calibrationQuestionId: row.calibrationQuestionId,
				calibrationQuestionSha256: row.calibrationQuestionSha256
			}
		}))
	};
}

function completeScienceReviewRow(id) {
	return {
		id,
		...Object.fromEntries(SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.map((field) => [field, true])),
		checkedCalculations: [],
		issues: [],
		accepted: true
	};
}

function buildFixture() {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-provenance-'));
	const curriculumCatalog = {
		schemaVersion: '1',
		specifications: [
			{
				id: 'aqa-biology',
				components: [{ id: 'bio-1', parentId: null, title: 'Cell biology' }]
			}
		]
	};
	const plan = {
		schemaVersion: 'science-challenge-plan/v1',
		planId: 'science-test-v1',
		curriculumCatalogPath: 'tmp/curriculum-catalog.json',
		curriculumCatalogSha256: canonicalHash(curriculumCatalog),
		rows: [{ id: 'challenge-001', shard: 'science-001', calibrationQuestionId: 'q-1' }]
	};
	const source = {
		schemaVersion: 'science-source-snapshot/v1',
		sourceDocuments: [
			{
				id: 'paper-1',
				sha256: hash('official PDF bytes'),
				title: 'Licensed paper title'
			}
		],
		questions: [
			{
				id: 'q-1',
				sourceDocumentId: 'paper-1',
				contentSha256: hash('question row'),
				promptText: 'Licensed source wording must remain external.'
			}
		]
	};
	const curriculum = {
		schemaVersion: 'science-curriculum-evidence/v1',
		components: [
			{
				componentId: 'bio-1',
				specificationId: 'aqa-biology',
				specificationSha256: hash('specification PDF'),
				sourceText: 'Licensed source wording must remain external.'
			}
		]
	};
	const assignment = {
		schemaVersion: 'science-challenge-verification-assignment/v2',
		assignmentId: 'science-001',
		evidenceSha256: hash('assignment evidence'),
		items: [{ calibrationEvidence: { promptText: 'Licensed source wording.' } }]
	};
	const assignmentPath = 'tmp/verification/assignments/science-001.json';
	writeJson(path.join(root, assignmentPath), assignment);
	const assignmentIndex = {
		schemaVersion: 'science-challenge-verification-assignment-index/v1',
		planId: plan.planId,
		planSha256: canonicalHash(plan),
		sourceSnapshotSha256: canonicalHash(source),
		curriculumEvidenceSha256: canonicalHash(curriculum),
		candidateSetSha256: hash('candidate set'),
		assignments: [
			{
				assignmentId: 'science-001',
				path: assignmentPath,
				sha256: canonicalHash(assignment),
				ids: ['challenge-001']
			}
		]
	};
	const dispatchLedger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		indexSha256: canonicalHash(assignmentIndex),
		dispatches: [
			{
				assignmentId: 'science-001',
				assignmentSha256: canonicalHash(assignment),
				taskName: '/root/science_verify_001'
			}
		]
	};
	const reviewResultPath = 'tmp/verification/reviews/science-001.json';
	const reviewResult = {
		schemaVersion: 'science-challenge-independent-verification/v1',
		assignmentId: 'science-001',
		reviews: [{ id: 'challenge-001', accepted: true }]
	};
	writeJson(path.join(root, reviewResultPath), reviewResult);
	const contentReview = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'passed',
		candidateSetSha256: assignmentIndex.candidateSetSha256,
		indexSha256: canonicalHash(assignmentIndex),
		dispatchLedgerSha256: canonicalHash(dispatchLedger),
		assignmentResults: [
			{
				assignmentId: 'science-001',
				path: reviewResultPath,
				sha256: canonicalHash(reviewResult)
			}
		],
		reviews: reviewResult.reviews
	};

	writeJson(path.join(root, 'tmp/plan.json'), plan);
	writeJson(path.join(root, 'tmp/curriculum-catalog.json'), curriculumCatalog);
	writeJson(path.join(root, 'tmp/source.json'), source);
	writeJson(path.join(root, 'tmp/curriculum.json'), curriculum);
	writeJson(path.join(root, 'tmp/verification/assignment-index.json'), assignmentIndex);
	writeJson(path.join(root, 'tmp/verification/dispatch-ledger.json'), dispatchLedger);
	writeJson(path.join(root, 'tmp/verification/summary.json'), contentReview);

	const generationRoot = 'tmp/generation';
	writeJson(path.join(root, generationRoot, 'generation-summary.json'), {
		schemaVersion: 'science-challenge-generation-summary/v1',
		status: 'passed'
	});
	const shardRoot = path.join(root, generationRoot, 'shards/science-001');
	writeFile(
		path.join(shardRoot, 'prompt-attempt-1.txt'),
		'Author generated science content.\n\nINPUT ROWS\n[{"promptText":"Licensed source wording must remain external."}]\n\nReturn science-challenge-batch/v1 JSON only.\n'
	);
	writeJson(path.join(shardRoot, 'input.json'), {
		promptText: 'Licensed source wording must remain external.'
	});
	const contentCandidate = { schemaVersion: 'science-challenge-batch/v1', challenges: [] };
	const contentValidation = { status: 'passed' };
	writeJson(path.join(shardRoot, 'candidate.json'), contentCandidate);
	writeJson(path.join(shardRoot, 'validation.json'), contentValidation);
	const contentAttempt = path.join(shardRoot, 'attempt-01');
	writeJson(path.join(contentAttempt, 'last-message.json'), contentCandidate);
	writeJson(path.join(contentAttempt, 'candidate.json'), contentCandidate);
	writeJson(path.join(contentAttempt, 'validation.json'), contentValidation);
	const contentRunSummary = {
		status: 'passed',
		model: 'gpt-5.6-sol'
	};
	writeJson(path.join(contentAttempt, 'run-summary.json'), contentRunSummary);
	writeFile(path.join(contentAttempt, 'events.jsonl'), '{"type":"thread.started"}\n');

	const artGenerationRoot = 'tmp/art-generation';
	writeJson(path.join(root, artGenerationRoot, 'generation-summary.json'), {
		schemaVersion: 'science-question-art-generation-summary/v1',
		status: 'passed'
	});
	const artAttempt = path.join(root, artGenerationRoot, 'challenge-001-opening/attempt-01');
	const artSpec = { id: 'challenge-001-opening', subject: 'biology' };
	writeJson(path.join(root, artGenerationRoot, 'challenge-001-opening/spec.json'), artSpec);
	writeFile(path.join(artAttempt, 'dark-prompt.txt'), 'Generate dark art.\n');
	writeFile(path.join(artAttempt, 'light-prompt.txt'), 'Edit light art.\n');
	writeFile(path.join(artAttempt, 'dark-master.webp'), Buffer.from([7, 8, 9]));
	writeFile(path.join(artAttempt, 'light-master.webp'), Buffer.from([10, 11, 12]));
	writeFile(path.join(artAttempt, 'dark.webp'), Buffer.from([1, 2, 3]));
	writeFile(path.join(artAttempt, 'light.webp'), Buffer.from([4, 5, 6]));
	const artJob = {
		schemaVersion: 'science-question-art-job/v1',
		id: 'challenge-001-opening',
		status: 'passed',
		attempt: 1,
		imageModel: 'chatgpt-gpt-image-2'
	};
	const artJobPath = path.join(root, artGenerationRoot, 'challenge-001-opening/job.json');
	writeJson(artJobPath, artJob);

	const artReviewRoot = 'tmp/art-review';
	const artBatch = path.join(root, artReviewRoot, 'batches/art-review-001');
	const artReviewInput = { schemaVersion: 'science-question-art-review-input/v2', specs: [] };
	const artReviewRequest = {
		schemaVersion: 'science-question-art-review-request/v1',
		inputSha256: canonicalHash(artReviewInput)
	};
	const artReviewResult = { reviews: [] };
	writeJson(path.join(artBatch, 'review-input.json'), artReviewInput);
	writeJson(path.join(artBatch, 'review-request.json'), artReviewRequest);
	writeFile(path.join(artBatch, 'prompt.txt'), 'Review generated art.\n');
	writeJson(path.join(artBatch, 'last-message.json'), artReviewResult);
	writeJson(path.join(artBatch, 'validation.json'), { status: 'passed' });
	writeJson(path.join(artBatch, 'result.json'), artReviewResult);
	const artReviewLastMessage = readFileSync(path.join(artBatch, 'last-message.json'));
	const artReviewEvents = [
		{ type: 'thread.started', thread_id: 'art-review-thread' },
		{ type: 'turn.started' },
		{
			type: 'item.completed',
			item: { type: 'agent_message', text: artReviewLastMessage.toString('utf8') }
		},
		{ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 20 } }
	];
	writeFile(
		path.join(artBatch, 'events.jsonl'),
		`${artReviewEvents.map((event) => JSON.stringify(event)).join('\n')}\n`
	);
	const artReviewEventBytes = readFileSync(path.join(artBatch, 'events.jsonl'));
	const artReviewRunSummary = {
		status: 'passed',
		error: null,
		model: 'gpt-5.6-sol',
		thinkingLevel: 'max',
		events: artReviewEvents.length,
		commandActions: 0,
		failedCommandActions: 0,
		agentMessages: 1,
		reasoningSummaries: 0,
		webSearches: 0,
		fileChanges: 0,
		finalResponseSha256: sha256(artReviewLastMessage),
		eventLogSha256: sha256(artReviewEventBytes),
		lastMessageFileSha256: sha256(artReviewLastMessage),
		failedCommands: []
	};
	writeJson(path.join(artBatch, 'run-summary.json'), artReviewRunSummary);
	const artReviewSummary = {
		schemaVersion: 'science-question-art-review-summary/v2',
		status: 'passed',
		batches: [
			{
				batchId: 'art-review-001',
				inputFileSha256: sha256(readFileSync(path.join(artBatch, 'review-input.json'))),
				requestSha256: canonicalHash(artReviewRequest),
				resultSha256: canonicalHash(artReviewResult),
				runSummarySha256: canonicalHash(artReviewRunSummary),
				eventLogSha256: sha256(readFileSync(path.join(artBatch, 'events.jsonl'))),
				lastMessageSha256: sha256(readFileSync(path.join(artBatch, 'last-message.json'))),
				promptSha256: sha256(readFileSync(path.join(artBatch, 'prompt.txt')))
			}
		]
	};
	writeJson(path.join(root, artReviewRoot, 'review-summary.json'), artReviewSummary);
	const artManifest = { schemaVersion: 'science-question-art-manifest/v1', specs: [artSpec] };
	const artDeliveryManifest = {
		schemaVersion: 'science-question-art-delivery/v1',
		objects: []
	};
	const coverage = { schemaVersion: 'science-challenge-coverage/v1', generatedRounds: 1 };
	const runtime = {
		schemaVersion: 'generated-science-challenge-runtime/v1',
		releaseId: 'science-test-v1',
		definitions: [],
		identities: [],
		curriculum: [],
		visuals: []
	};
	const artPerceptualAudit = {
		schemaVersion: 'science-question-art-perceptual-audit/v1',
		status: 'passed'
	};
	const artPerceptualAuditPath = 'tmp/art-review/perceptual-audit.json';
	writeJson(path.join(root, artPerceptualAuditPath), artPerceptualAudit);

	const relative = (filePath) => path.relative(root, filePath);
	const rawRecord = (filePath) => {
		const bytes = readFileSync(filePath);
		return { path: relative(filePath), sha256: sha256(bytes), size: bytes.length };
	};
	const contentPromptPath = path.join(shardRoot, 'prompt-attempt-1.txt');
	const contentLastMessagePath = path.join(contentAttempt, 'last-message.json');
	const contentEventPath = path.join(contentAttempt, 'events.jsonl');
	const contentRunSummaryPath = path.join(contentAttempt, 'run-summary.json');
	const contentAttemptValidationPath = path.join(contentAttempt, 'validation.json');
	const contentAttemptCandidatePath = path.join(contentAttempt, 'candidate.json');
	const darkOutputPath = path.join(artAttempt, 'dark.webp');
	const lightOutputPath = path.join(artAttempt, 'light.webp');
	const artArtifacts = {
		spec: rawRecord(path.join(root, artGenerationRoot, 'challenge-001-opening/spec.json')),
		darkPrompt: rawRecord(path.join(artAttempt, 'dark-prompt.txt')),
		lightPrompt: rawRecord(path.join(artAttempt, 'light-prompt.txt')),
		darkMaster: rawRecord(path.join(artAttempt, 'dark-master.webp')),
		lightMaster: rawRecord(path.join(artAttempt, 'light-master.webp')),
		darkNormalized: rawRecord(darkOutputPath),
		lightNormalized: rawRecord(lightOutputPath)
	};
	const lineage = {
		schemaVersion: 'science-challenge-release-lineage/v1',
		content: [
			{
				shardId: 'science-001',
				candidatePath: relative(path.join(shardRoot, 'candidate.json')),
				candidateSha256: canonicalHash(contentCandidate),
				validationPath: relative(path.join(shardRoot, 'validation.json')),
				validationSha256: canonicalHash(contentValidation),
				runSummaries: [
					{
						kind: 'generation',
						attempt: 1,
						path: relative(contentRunSummaryPath),
						sha256: canonicalHash(contentRunSummary),
						eventLogPath: relative(contentEventPath),
						eventLogSha256: sha256(readFileSync(contentEventPath)),
						lastMessagePath: relative(contentLastMessagePath),
						lastMessageSha256: sha256(readFileSync(contentLastMessagePath)),
						promptPath: relative(contentPromptPath),
						promptSha256: sha256(readFileSync(contentPromptPath)),
						candidatePath: relative(contentAttemptCandidatePath),
						candidateSha256: canonicalHash(contentCandidate),
						validationPath: relative(contentAttemptValidationPath),
						validationSha256: canonicalHash(contentValidation),
						inputSha256: hash('authoring input'),
						rawCandidateSha256: sha256(readFileSync(contentLastMessagePath)),
						normalizationVersion: 'science-challenge-normalization/v1',
						model: 'gpt-5.6-sol',
						thinkingLevel: 'max',
						status: 'passed',
						toolFree: true,
						repairEvidence: null
					}
				]
			}
		],
		art: [
			{
				id: 'challenge-001-opening',
				specSha256: canonicalHash(artSpec),
				outputs: {
					dark: {
						path: relative(darkOutputPath),
						sha256: sha256(readFileSync(darkOutputPath)),
						width: 960,
						height: 540
					},
					light: {
						path: relative(lightOutputPath),
						sha256: sha256(readFileSync(lightOutputPath)),
						width: 960,
						height: 540
					}
				},
				matchingJobs: [
					{
						path: relative(artJobPath),
						sha256: canonicalHash(artJob),
						imageModel: 'chatgpt-gpt-image-2',
						attempt: 1,
						repairReviewSha256: null,
						repairPerceptualAuditSha256: null,
						repairEvidencePath: null,
						finishedAt: '2026-07-21T00:00:00.000Z',
						generationArtifacts: artArtifacts
					}
				]
			}
		]
	};

	const bindings = {
		planSha256: canonicalHash(plan),
		basePlanSha256: canonicalHash(plan),
		effectivePlanSha256: canonicalHash(plan),
		sourceSnapshotSha256: canonicalHash(source),
		curriculumEvidenceSha256: canonicalHash(curriculum),
		curriculumCatalogSha256: canonicalHash(curriculumCatalog),
		effectiveCohortManifestSha256: null,
		effectiveCohortCandidateSetSha256: null,
		curriculumRemapVerifierInputSha256: null,
		curriculumRemapDurableReceiptSha256: null,
		descendantRemapManifestSetSha256: null,
		curriculumRemapDecisionSetSha256: null,
		difficultyPlanAdjustmentVerifierInputSha256: null,
		difficultyAdjustmentManifestSetSha256: null,
		recoverySetSha256: null,
		difficultyPlanAdjustmentDecisionSetSha256: null,
		contentVerificationSha256: canonicalHash(contentReview),
		verifierDispatchLedgerSha256: canonicalHash(dispatchLedger),
		artManifestSha256: canonicalHash(artManifest),
		artReviewSha256: canonicalHash(artReviewSummary),
		artPerceptualAuditSha256: canonicalHash(artPerceptualAudit),
		artDeliveryManifestSha256: canonicalHash(artDeliveryManifest),
		runtimeSha256: canonicalHash(runtime),
		shortRecallBundleSha256: hash('short-recall bundle'),
		shortRecallReviewSha256: hash('short-recall review'),
		coverageSha256: canonicalHash(coverage),
		lineageSha256: canonicalHash(lineage),
		contentGenerationLineageSha256: canonicalHash(lineage.content),
		contentParentLineageSha256: null,
		artGenerationLineageSha256: canonicalHash(lineage.art)
	};
	return {
		root,
		bindings,
		artReviewEventLogSha256: sha256(artReviewEventBytes),
		paths: {
			lineage,
			artManifest,
			artDeliveryManifest,
			runtime,
			coverage,
			planPath: 'tmp/plan.json',
			effectivePlan: plan,
			curriculumCatalogPath: 'tmp/curriculum-catalog.json',
			sourceSnapshotPath: 'tmp/source.json',
			curriculumEvidencePath: 'tmp/curriculum.json',
			assignmentIndexPath: 'tmp/verification/assignment-index.json',
			verifierDispatchLedgerPath: 'tmp/verification/dispatch-ledger.json',
			generationRoot,
			contentReviewPath: 'tmp/verification/summary.json',
			artGenerationRoot,
			artReviewRoot,
			artPerceptualAuditPath
		}
	};
}

function convertFixtureContentToDirect(
	fixture,
	{ responseMode = null, thinkingLevel = 'max' } = {}
) {
	const run = fixture.paths.lineage.content[0].runSummaries[0];
	const attemptRoot = path.dirname(path.join(fixture.root, run.path));
	const requestPath = path.join(attemptRoot, 'request.json');
	const thoughtsPath = path.join(attemptRoot, 'thoughts.txt');
	const resultMetadataPath = path.join(attemptRoot, 'result-metadata.json');
	const promptJson = responseMode === 'prompt-json';
	const transportVersion = promptJson
		? 'science-challenge-llm-direct-prompt-json/v1'
		: 'science-challenge-llm-direct-json/v1';
	const request = {
		schemaVersion: promptJson
			? 'science-challenge-llm-direct-prompt-json-request/v1'
			: 'science-challenge-direct-json-request/v1',
		transport: 'llm-direct',
		...(responseMode ? { responseMode } : {}),
		transportVersion,
		operation: promptJson ? 'streamText' : 'streamJson',
		provider: 'chatgpt',
		model: 'chatgpt-gpt-5.6-sol',
		thinkingLevel: 'max',
		tools: [],
		maxAttempts: 1,
		streamMode: 'final',
		responsesWebSocketMode: 'off',
		telemetry: false,
		input: 'Author the exact bound science challenge.',
		...(promptJson
			? { expectedResponseJsonSchemaSha256: hash('prompt JSON schema') }
			: { responseJsonSchema: { type: 'object' } })
	};
	const thoughts = 'Checked the curriculum binding and the exact structured-output contract.';
	const resultMetadata = {
		schemaVersion: promptJson
			? 'science-challenge-llm-direct-prompt-json-result/v1'
			: 'science-challenge-direct-json-result/v1',
		transport: 'llm-direct',
		...(responseMode ? { responseMode, transportVersion } : {}),
		provider: 'chatgpt',
		model: 'chatgpt-gpt-5.6-sol',
		modelVersion: 'chatgpt-gpt-5.6-sol-2026-07-23',
		blocked: false
	};
	writeJson(requestPath, request);
	writeFile(thoughtsPath, thoughts);
	writeJson(resultMetadataPath, resultMetadata);

	const runSummaryPath = path.join(fixture.root, run.path);
	const runSummary = {
		...readJson(runSummaryPath),
		error: null,
		transport: 'llm-direct',
		...(responseMode ? { responseMode } : {}),
		transportVersion,
		provider: 'chatgpt',
		model: 'chatgpt-gpt-5.6-sol',
		modelVersion: 'chatgpt-gpt-5.6-sol-2026-07-23',
		thinkingLevel
	};
	writeJson(runSummaryPath, runSummary);
	Object.assign(run, {
		sha256: canonicalHash(runSummary),
		transport: runSummary.transport,
		...(responseMode ? { responseMode } : {}),
		transportVersion: runSummary.transportVersion,
		provider: runSummary.provider,
		model: runSummary.model,
		modelVersion: runSummary.modelVersion,
		thinkingLevel,
		requestPath: path.relative(fixture.root, requestPath),
		requestSha256: sha256(readFileSync(requestPath)),
		thoughtsPath: path.relative(fixture.root, thoughtsPath),
		thoughtsSha256: sha256(readFileSync(thoughtsPath)),
		resultMetadataPath: path.relative(fixture.root, resultMetadataPath),
		resultMetadataSha256: sha256(readFileSync(resultMetadataPath))
	});
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	fixture.bindings.contentGenerationLineageSha256 = canonicalHash(fixture.paths.lineage.content);
	return {
		requestSha256: run.requestSha256,
		thoughtsSha256: run.thoughtsSha256,
		resultMetadataSha256: run.resultMetadataSha256
	};
}

function convertFixtureContentToMultipart(
	fixture,
	{ responseMode = null, thinkingLevel = 'max' } = {}
) {
	const run = fixture.paths.lineage.content[0].runSummaries[0];
	const attemptRoot = path.dirname(path.join(fixture.root, run.path));
	const modelVersion = 'chatgpt-gpt-5.6-sol-2026-07-23';
	const promptJson = responseMode === 'prompt-json';
	const partTransportVersion = promptJson
		? 'science-challenge-llm-direct-prompt-json/v1'
		: 'science-challenge-llm-direct-json/v1';
	const rowIds = ['challenge-001', 'challenge-002'];
	const records = rowIds.map((rowId, index) => {
		const partId = `part-${String(index + 1).padStart(2, '0')}`;
		const relativeRoot = `parts/${partId}`;
		const absoluteRoot = path.join(attemptRoot, relativeRoot);
		const promptPath = path.join(absoluteRoot, 'prompt.txt');
		const requestPath = path.join(absoluteRoot, 'request.json');
		const eventLogPath = path.join(absoluteRoot, 'events.jsonl');
		const rawOutputPath = path.join(absoluteRoot, 'last-message.json');
		const thoughtsPath = path.join(absoluteRoot, 'thoughts.txt');
		const resultMetadataPath = path.join(absoluteRoot, 'result-metadata.json');
		const partRunSummaryPath = path.join(absoluteRoot, 'run-summary.json');
		const inputSha256 = hash(`multipart input ${rowId}`);
		const responseSchemaSha256 = hash(`multipart schema ${rowId}`);
		const candidate = {
			schemaVersion: 'science-challenge-batch/v1',
			challenges: [{ definition: { id: rowId } }]
		};
		const request = { partId, input: `Author ${rowId}.` };
		const resultMetadata = { partId, modelVersion, blocked: false };
		const partRunSummary = {
			status: 'passed',
			transport: 'llm-direct',
			...(responseMode ? { responseMode } : {}),
			transportVersion: partTransportVersion,
			provider: 'chatgpt',
			model: 'chatgpt-gpt-5.6-sol',
			modelVersion,
			thinkingLevel,
			usage: { promptTokens: 10 + index, responseTokens: 5 + index },
			costUsd: 0.001 + index * 0.001
		};
		writeFile(
			promptPath,
			`Author multipart science content.\n\nINPUT ROWS\n[{"id":"${rowId}"}]\n\nReturn science-challenge-batch/v1 JSON only.\n`
		);
		writeJson(requestPath, request);
		writeFile(eventLogPath, `${JSON.stringify({ type: 'json', partId })}\n`);
		writeJson(rawOutputPath, candidate);
		writeFile(thoughtsPath, `Bound ${rowId} to its exact source evidence.`);
		writeJson(resultMetadataPath, resultMetadata);
		writeJson(partRunSummaryPath, partRunSummary);
		return {
			partId,
			index: index + 1,
			start: index,
			end: index + 1,
			rowIds: [rowId],
			inputSha256,
			responseSchemaSha256,
			promptPath: `${relativeRoot}/prompt.txt`,
			promptSha256: sha256(readFileSync(promptPath)),
			requestPath: `${relativeRoot}/request.json`,
			requestSha256: sha256(readFileSync(requestPath)),
			eventLogPath: `${relativeRoot}/events.jsonl`,
			eventLogSha256: sha256(readFileSync(eventLogPath)),
			rawOutputPath: `${relativeRoot}/last-message.json`,
			rawOutputSha256: sha256(readFileSync(rawOutputPath)),
			rawCandidateSha256: canonicalHash(candidate),
			thoughtsPath: `${relativeRoot}/thoughts.txt`,
			thoughtsSha256: sha256(readFileSync(thoughtsPath)),
			resultMetadataPath: `${relativeRoot}/result-metadata.json`,
			resultMetadataSha256: sha256(readFileSync(resultMetadataPath)),
			runSummaryPath: `${relativeRoot}/run-summary.json`,
			runSummarySha256: canonicalHash(partRunSummary),
			status: 'passed',
			...(responseMode ? { responseMode, transportVersion: partTransportVersion } : {}),
			provider: 'chatgpt',
			model: 'chatgpt-gpt-5.6-sol',
			modelVersion,
			thinkingLevel,
			usage: partRunSummary.usage,
			costUsd: partRunSummary.costUsd
		};
	});
	const rootRunSummaryPath = path.join(fixture.root, run.path);
	const rootRunSummary = {
		schemaVersion: 'science-challenge-llm-direct-json-multipart-summary/v1',
		status: 'passed',
		transport: 'llm-direct',
		...(responseMode ? { responseMode } : {}),
		transportVersion: promptJson
			? 'science-challenge-llm-direct-prompt-json-multipart/v1'
			: 'science-challenge-llm-direct-json-multipart/v1',
		model: 'chatgpt-gpt-5.6-sol',
		thinkingLevel,
		partSize: 1,
		rowIds,
		partsSha256: canonicalHash(records),
		parts: records
	};
	writeJson(rootRunSummaryPath, rootRunSummary);
	const lineagePart = (record) => ({
		...record,
		promptPath: path.relative(fixture.root, path.join(attemptRoot, record.promptPath)),
		requestPath: path.relative(fixture.root, path.join(attemptRoot, record.requestPath)),
		eventLogPath: path.relative(fixture.root, path.join(attemptRoot, record.eventLogPath)),
		rawOutputPath: path.relative(fixture.root, path.join(attemptRoot, record.rawOutputPath)),
		thoughtsPath: path.relative(fixture.root, path.join(attemptRoot, record.thoughtsPath)),
		resultMetadataPath: path.relative(
			fixture.root,
			path.join(attemptRoot, record.resultMetadataPath)
		),
		runSummaryPath: path.relative(fixture.root, path.join(attemptRoot, record.runSummaryPath))
	});
	Object.assign(run, {
		sha256: canonicalHash(rootRunSummary),
		transport: rootRunSummary.transport,
		...(responseMode ? { responseMode } : {}),
		transportVersion: rootRunSummary.transportVersion,
		provider: 'chatgpt',
		model: rootRunSummary.model,
		modelVersion: null,
		thinkingLevel,
		modelVersions: [modelVersion],
		directPartSize: 1,
		rowIds,
		requestPath: null,
		requestSha256: null,
		thoughtsPath: null,
		thoughtsSha256: null,
		resultMetadataPath: null,
		resultMetadataSha256: null,
		parts: records.map(lineagePart)
	});
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	fixture.bindings.contentGenerationLineageSha256 = canonicalHash(fixture.paths.lineage.content);
}

function attachMultipartContinuation(
	fixture,
	{ sourcePartCount = 2, includeCollectionJournals = true } = {}
) {
	convertFixtureContentToMultipart(fixture, {
		responseMode: 'prompt-json',
		thinkingLevel: 'high'
	});
	if (![1, 2].includes(sourcePartCount)) {
		throw new Error('Continuation archive fixture sourcePartCount must be 1 or 2.');
	}
	const shard = fixture.paths.lineage.content[0];
	const workspacePath = (relativePath) => path.join(fixture.root, relativePath);
	const relativePath = (filePath) => path.relative(fixture.root, filePath);
	const fileBinding = (filePath, bindingRoot, { json = false } = {}) => {
		const bytes = readFileSync(filePath);
		return {
			path: path.relative(bindingRoot, filePath),
			byteSha256: sha256(bytes),
			bytes: bytes.length,
			...(json ? { canonicalSha256: canonicalHash(JSON.parse(bytes.toString('utf8'))) } : {})
		};
	};
	const run = shard.runSummaries[0];
	const attemptRoot = path.dirname(workspacePath(run.path));
	if (sourcePartCount < run.parts.length) {
		for (const part of run.parts.slice(sourcePartCount)) {
			rmSync(path.dirname(workspacePath(part.promptPath)), { recursive: true, force: true });
		}
		run.parts = run.parts.slice(0, sourcePartCount);
		run.rowIds = run.rowIds.slice(0, sourcePartCount);
		const rootSummary = readJson(workspacePath(run.path));
		rootSummary.parts = rootSummary.parts.slice(0, sourcePartCount);
		rootSummary.rowIds = rootSummary.rowIds.slice(0, sourcePartCount);
		rootSummary.partsSha256 = canonicalHash(rootSummary.parts);
		writeJson(workspacePath(run.path), rootSummary);
		run.sha256 = canonicalHash(rootSummary);
	}
	const sourceFiles = {
		prompt: workspacePath(run.promptPath),
		runSummary: workspacePath(run.path),
		eventLog: workspacePath(run.eventLogPath),
		lastMessage: workspacePath(run.lastMessagePath),
		validation: workspacePath(run.validationPath)
	};
	const sourceParts = run.parts.map((part) => ({
		partId: part.partId,
		recordSha256: canonicalHash(part),
		prompt: fileBinding(workspacePath(part.promptPath), attemptRoot),
		request: fileBinding(workspacePath(part.requestPath), attemptRoot, { json: true }),
		eventLog: fileBinding(workspacePath(part.eventLogPath), attemptRoot),
		lastMessage: fileBinding(workspacePath(part.rawOutputPath), attemptRoot),
		thoughts: fileBinding(workspacePath(part.thoughtsPath), attemptRoot),
		resultMetadata: fileBinding(workspacePath(part.resultMetadataPath), attemptRoot, {
			json: true
		}),
		runSummary: fileBinding(workspacePath(part.runSummaryPath), attemptRoot, { json: true })
	}));
	const sourceAttempt = {
		attempt: 4,
		directory: path.basename(attemptRoot),
		status: 'failed',
		prompt: fileBinding(sourceFiles.prompt, path.dirname(attemptRoot)),
		runSummary: fileBinding(sourceFiles.runSummary, path.dirname(attemptRoot), { json: true }),
		eventLog: fileBinding(sourceFiles.eventLog, path.dirname(attemptRoot)),
		lastMessage: fileBinding(sourceFiles.lastMessage, path.dirname(attemptRoot)),
		validation: fileBinding(sourceFiles.validation, path.dirname(attemptRoot), { json: true }),
		parts: sourceParts,
		partsSha256: canonicalHash(sourceParts)
	};
	sourceAttempt.sha256 = canonicalHash(sourceAttempt);

	const repairSha256 = hash('continuation repair summary');
	const continuationRoot = path.join(
		fixture.root,
		fixture.paths.generationRoot,
		'shards/science-001',
		`verification-repair-${repairSha256.slice(0, 12)}-attempt-04-multipart-continuation`
	);
	const partId = `part-${String(sourcePartCount + 1).padStart(2, '0')}`;
	const partRoot = path.join(continuationRoot, 'parts', partId);
	const partPaths = {
		prompt: path.join(partRoot, 'prompt.txt'),
		request: path.join(partRoot, 'request.json'),
		events: path.join(partRoot, 'events.jsonl'),
		lastMessage: path.join(partRoot, 'last-message.json'),
		thoughts: path.join(partRoot, 'thoughts.txt'),
		resultMetadata: path.join(partRoot, 'result-metadata.json'),
		runSummary: path.join(partRoot, 'run-summary.json')
	};
	writeFile(
		partPaths.prompt,
		`Continue multipart science content.\n\nINPUT ROWS\n[{"id":"challenge-${String(
			sourcePartCount + 1
		).padStart(3, '0')}"}]\n\nReturn science-challenge-batch/v1 JSON only.\n`
	);
	writeJson(partPaths.request, { operation: 'streamText', tools: [], maxCalls: 1 });
	writeFile(partPaths.events, `${JSON.stringify({ type: 'text', partId })}\n`);
	const candidate = readJson(
		path.join(fixture.root, fixture.paths.generationRoot, 'shards/science-001/candidate.json')
	);
	writeJson(partPaths.lastMessage, candidate);
	writeFile(partPaths.thoughts, 'Verified the exact continuation partition.');
	writeJson(partPaths.resultMetadata, {
		modelVersion: 'chatgpt-gpt-5.6-sol-2026-07-23',
		blocked: false
	});
	writeJson(partPaths.runSummary, {
		status: 'passed',
		transport: 'llm-direct',
		responseMode: 'prompt-json',
		transportVersion: 'science-challenge-llm-direct-prompt-json/v1',
		model: 'chatgpt-gpt-5.6-sol',
		thinkingLevel: 'high'
	});
	const claim = {
		schemaVersion: 'science-challenge-verification-repair-multipart-part-claim/v1',
		partId,
		partIndex: sourcePartCount + 1
	};
	const claimPath = path.join(
		fixture.root,
		`tmp/objective-ledger/shards/science-001/attempt-04/multipart-continuation-parts/${partId}/claim.json`
	);
	writeJson(claimPath, claim);
	const invocation = {
		schemaVersion: 'science-challenge-verification-repair-multipart-invocation-start/v1',
		partId,
		claimSha256: canonicalHash(claim),
		claimByteSha256: sha256(readFileSync(claimPath))
	};
	const invocationPath = path.join(path.dirname(claimPath), 'invocation-started.json');
	writeJson(invocationPath, invocation);
	const objective = {
		schemaVersion: 'science-challenge-verification-repair-objective/v1',
		objectiveId: hash('continuation objective')
	};
	const objectivePath = path.join(fixture.root, 'tmp/objective-ledger/objective.json');
	writeJson(objectivePath, objective);
	const continuationPartBinding = {
		partId,
		claimSha256: canonicalHash(claim),
		claimByteSha256: sha256(readFileSync(claimPath)),
		prompt: fileBinding(partPaths.prompt, continuationRoot),
		request: fileBinding(partPaths.request, continuationRoot, { json: true }),
		eventLog: fileBinding(partPaths.events, continuationRoot),
		lastMessage: fileBinding(partPaths.lastMessage, continuationRoot),
		thoughts: fileBinding(partPaths.thoughts, continuationRoot),
		resultMetadata: fileBinding(partPaths.resultMetadata, continuationRoot, { json: true }),
		runSummary: fileBinding(partPaths.runSummary, continuationRoot, { json: true }),
		rawCandidateSha256: canonicalHash(candidate)
	};
	const planParts = Array.from({ length: sourcePartCount + 1 }, (_, index) => ({
		partId: `part-${String(index + 1).padStart(2, '0')}`,
		index: index + 1,
		inputSha256: hash(`continuation part ${index + 1}`)
	}));
	const continuationPlan = {
		schemaVersion: 'science-challenge-exhausted-multipart-continuation-plan/v1',
		sourceAttemptedPartCount: sourcePartCount,
		expectedPartCount: sourcePartCount + 1,
		parts: planParts
	};
	const peerIssue = 'science-099 contains an unrelated first-review duplicate.';
	const collectionValidation = includeCollectionJournals
		? {
				status: 'failed',
				issues: [peerIssue],
				repairTargets: [
					{
						challengeId: 'biology-peer-collection-issue-01',
						shardId: 'science-099',
						issues: [peerIssue]
					}
				]
			}
		: {
				status: 'passed',
				issues: []
			};
	const priorCollectionFailure = includeCollectionJournals
		? {
				schemaVersion: 'science-challenge-exhausted-multipart-continuation-failure/v1',
				shardId: 'science-001',
				attempt: 4,
				partId: null,
				claimSha256: canonicalHash([canonicalHash(claim)]),
				error: `Multipart continuation failed full collection validation.\n${peerIssue}`
			}
		: null;
	const validation = {
		schemaVersion: 'science-challenge-exhausted-multipart-continuation-validation/v1',
		status: 'passed',
		authoringDisposition: 'exhausted-multipart-part-continuation',
		sourceAttempt: 4,
		sourceAttemptStatus: 'failed',
		candidateSha256: canonicalHash(candidate),
		collectionValidationSha256: canonicalHash(collectionValidation),
		priorCollectionFailureSha256: priorCollectionFailure
			? canonicalHash(priorCollectionFailure)
			: null
	};
	const planPath = path.join(continuationRoot, 'plan.json');
	const candidatePath = path.join(continuationRoot, 'candidate.json');
	const validationPath = path.join(continuationRoot, 'validation.json');
	writeJson(planPath, continuationPlan);
	writeJson(candidatePath, candidate);
	writeJson(validationPath, validation);
	const collectionSnapshot = includeCollectionJournals
		? {
				schemaVersion: 'science-challenge-exhausted-multipart-continuation-collection-snapshot/v1',
				shardId: 'science-001',
				attempt: 4,
				claimSetSha256: canonicalHash([canonicalHash(claim)]),
				candidateSha256: canonicalHash(candidate),
				collectionValidation
			}
		: null;
	const collectionSnapshotPath = path.join(continuationRoot, 'collection-validation.json');
	const failurePath = path.join(continuationRoot, 'failure.json');
	if (collectionSnapshot) writeJson(collectionSnapshotPath, collectionSnapshot);
	if (priorCollectionFailure) writeJson(failurePath, priorCollectionFailure);
	const manifest = {
		schemaVersion: 'science-challenge-exhausted-multipart-continuation/v1',
		attempt: 4,
		planSha256: canonicalHash(continuationPlan),
		sourceAttempt,
		continuationParts: [continuationPartBinding],
		continuationPartsSha256: canonicalHash([continuationPartBinding]),
		collectionValidation,
		priorCollectionFailure,
		candidateSha256: canonicalHash(candidate),
		validationSha256: canonicalHash(validation)
	};
	const manifestPath = path.join(continuationRoot, 'manifest.json');
	writeJson(manifestPath, manifest);
	writeJson(
		path.join(fixture.root, fixture.paths.generationRoot, 'shards/science-001/validation.json'),
		validation
	);

	shard.validationSha256 = canonicalHash(validation);
	shard.continuation = {
		schemaVersion: manifest.schemaVersion,
		manifestPath: relativePath(manifestPath),
		manifestSha256: canonicalHash(manifest),
		planPath: relativePath(planPath),
		planSha256: canonicalHash(continuationPlan),
		candidatePath: relativePath(candidatePath),
		candidateSha256: canonicalHash(candidate),
		validationPath: relativePath(validationPath),
		validationSha256: canonicalHash(validation),
		execution: {
			objectivePath: relativePath(objectivePath),
			objectiveSha256: canonicalHash(objective),
			claims: [
				{
					partId,
					path: relativePath(claimPath),
					sha256: canonicalHash(claim),
					byteSha256: sha256(readFileSync(claimPath)),
					invocationPath: relativePath(invocationPath),
					invocationSha256: canonicalHash(invocation),
					invocationByteSha256: sha256(readFileSync(invocationPath))
				}
			]
		},
		sourceAttempt: {
			...sourceAttempt,
			attemptDir: relativePath(attemptRoot),
			files: Object.fromEntries(
				Object.entries(sourceFiles).map(([name, filePath]) => [name, relativePath(filePath)])
			),
			partFiles: run.parts.map((part) => ({
				partId: part.partId,
				paths: {
					prompt: part.promptPath,
					request: part.requestPath,
					events: part.eventLogPath,
					lastMessage: part.rawOutputPath,
					thoughts: part.thoughtsPath,
					resultMetadata: part.resultMetadataPath,
					runSummary: part.runSummaryPath
				}
			}))
		},
		continuationParts: [
			{
				partId,
				claimPath: relativePath(claimPath),
				claimSha256: canonicalHash(claim),
				evidenceSha256: canonicalHash(continuationPartBinding),
				paths: Object.fromEntries(
					Object.entries(partPaths).map(([name, filePath]) => [name, relativePath(filePath)])
				)
			}
		],
		collectionValidationSnapshot: collectionSnapshot
			? {
					path: relativePath(collectionSnapshotPath),
					canonicalSha256: canonicalHash(collectionSnapshot),
					byteSha256: sha256(readFileSync(collectionSnapshotPath))
				}
			: null,
		priorCollectionFailureEvidence: priorCollectionFailure
			? {
					path: relativePath(failurePath),
					canonicalSha256: canonicalHash(priorCollectionFailure),
					byteSha256: sha256(readFileSync(failurePath))
				}
			: null
	};
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	fixture.bindings.contentGenerationLineageSha256 = canonicalHash(fixture.paths.lineage.content);
}

function attachMultipartPlanSalvage(fixture) {
	convertFixtureContentToMultipart(fixture);
	const shard = fixture.paths.lineage.content[0];
	const shardRoot = path.join(fixture.root, fixture.paths.generationRoot, 'shards/science-001');
	const priorCandidate = readJson(path.join(shardRoot, 'candidate.json'));
	const priorValidation = {
		status: 'passed',
		candidateSha256: canonicalHash(priorCandidate)
	};
	const priorCandidateSetSha256 = hash('salvage prior candidate set');
	const verificationSummary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'passed',
		candidateSetSha256: priorCandidateSetSha256,
		reviews: [
			{ id: 'challenge-001', accepted: true },
			{ id: 'challenge-002', accepted: true }
		]
	};
	const repairSha256 = canonicalHash(verificationSummary);
	const repairPrefix = repairSha256.slice(0, 12);
	const repairDirectory = `verification-repair-${repairPrefix}`;
	const repairRoot = path.join(shardRoot, repairDirectory);
	writeJson(path.join(repairRoot, 'verification-summary.json'), verificationSummary);
	writeJson(path.join(repairRoot, 'prior-candidate.json'), priorCandidate);
	writeJson(path.join(repairRoot, 'prior-validation.json'), priorValidation);

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		writeJson(
			path.join(
				shardRoot,
				`verification-repair-${repairPrefix}-attempt-${String(attempt).padStart(2, '0')}`,
				'run-summary.json'
			),
			{
				status: 'failed',
				error: `completed failed repair attempt ${attempt}`,
				model: 'gpt-5.6-sol'
			}
		);
	}
	const ordinaryAttemptRoot = path.join(shardRoot, 'attempt-01');
	const sourceAttemptDirectory = `verification-repair-${repairPrefix}-attempt-04`;
	const sourceAttemptRoot = path.join(shardRoot, sourceAttemptDirectory);
	cpSync(ordinaryAttemptRoot, sourceAttemptRoot, { recursive: true });
	const sourcePromptPath = path.join(
		shardRoot,
		`verification-repair-${repairPrefix}-prompt-attempt-4.txt`
	);
	writeFileSync(sourcePromptPath, readFileSync(path.join(shardRoot, 'prompt-attempt-1.txt')));

	const sourceSummaryPath = path.join(sourceAttemptRoot, 'run-summary.json');
	const sourceSummary = readJson(sourceSummaryPath);
	const rawChallenges = [
		{
			definition: {
				id: 'challenge-00l',
				difficulty: 'standard'
			}
		},
		{
			definition: {
				id: 'challenge-002',
				difficulty: 'starter'
			}
		}
	];
	for (const [index, challenge] of rawChallenges.entries()) {
		const record = sourceSummary.parts[index];
		const partCandidate = {
			schemaVersion: 'science-challenge-batch/v1',
			challenges: [challenge]
		};
		const rawOutputPath = path.join(sourceAttemptRoot, record.rawOutputPath);
		writeJson(rawOutputPath, partCandidate);
		record.rawOutputSha256 = sha256(readFileSync(rawOutputPath));
		record.rawCandidateSha256 = canonicalHash(partCandidate);
	}
	Object.assign(sourceSummary, {
		status: 'failed',
		error: 'Direct multipart merge failed:\nplan-bound identity and difficulty drift',
		mergedCandidateSha256: null,
		partsSha256: canonicalHash(sourceSummary.parts)
	});
	writeJson(sourceSummaryPath, sourceSummary);
	writeJson(path.join(sourceAttemptRoot, 'last-message.json'), {
		error: 'multipart merge failed'
	});
	const sourceValidation = {
		schemaVersion: 'science-challenge-authoring-validation/v1',
		status: 'failed',
		inputSha256: hash('salvage repair input'),
		verificationRepairSha256: repairSha256,
		priorCandidateSha256: canonicalHash(priorCandidate),
		candidateSha256: null,
		rawCandidateSha256: null,
		runSummarySha256: canonicalHash(sourceSummary),
		promptSha256: sha256(readFileSync(sourcePromptPath)),
		normalizationVersion: 'science-challenge-normalization/v1',
		promptVersion: 'science-challenge-prompt/v1',
		transport: sourceSummary.transport,
		model: sourceSummary.model,
		thinkingLevel: sourceSummary.thinkingLevel,
		directPartSize: null,
		transportError: sourceSummary.error
	};
	const sourceValidationPath = path.join(sourceAttemptRoot, 'validation.json');
	writeJson(sourceValidationPath, sourceValidation);

	const candidate = {
		schemaVersion: 'science-challenge-batch/v1',
		challenges: [
			{
				definition: {
					id: 'challenge-001',
					difficulty: 'standard'
				}
			},
			{
				definition: {
					id: 'challenge-002',
					difficulty: 'standard'
				}
			}
		]
	};
	const corrections = [
		{
			kind: 'definition.id',
			path: 'challenges[0].definition.id',
			partId: 'part-01',
			rowIndex: 1,
			absoluteRowIndex: 0,
			from: 'challenge-00l',
			to: 'challenge-001',
			editDistance: 1,
			sourceChallengeSha256: canonicalHash(rawChallenges[0]),
			recoveredChallengeSha256: canonicalHash(candidate.challenges[0])
		},
		{
			kind: 'definition.difficulty',
			path: 'challenges[1].definition.difficulty',
			partId: 'part-02',
			rowIndex: 1,
			absoluteRowIndex: 1,
			from: 'starter',
			to: 'standard',
			sourceChallengeSha256: canonicalHash(rawChallenges[1]),
			recoveredChallengeSha256: canonicalHash(candidate.challenges[1])
		}
	];
	const sourcePartHashes = sourceSummary.parts.map((record) => ({
		partId: record.partId,
		rawOutputSha256: record.rawOutputSha256,
		rawCandidateSha256: record.rawCandidateSha256
	}));
	const salvageSource = {
		multipartSummarySha256: canonicalHash(sourceSummary),
		rootEventLogSha256: sha256(readFileSync(path.join(sourceAttemptRoot, 'events.jsonl'))),
		rootLastMessageSha256: sha256(readFileSync(path.join(sourceAttemptRoot, 'last-message.json'))),
		orchestrationPromptSha256: sha256(readFileSync(sourcePromptPath)),
		expectedInputSha256: sourceValidation.inputSha256,
		expectedInputsSha256: hash('salvage expected inputs'),
		expectedPartPromptsSha256: hash('salvage expected part prompts'),
		expectedResponseJsonSchemaSha256: hash('salvage response schema'),
		partOutputsSha256: canonicalHash(sourcePartHashes),
		parts: sourcePartHashes
	};
	const salvageValidation = {
		schemaVersion: 'science-challenge-multipart-plan-salvage-validation/v1',
		status: 'passed',
		issues: [],
		inputSha256: sourceValidation.inputSha256,
		verificationRepairSha256: repairSha256,
		verificationRepairCohortIssues: [],
		priorCandidateSha256: canonicalHash(priorCandidate),
		rawCandidateSha256: null,
		candidateSha256: canonicalHash(candidate),
		normalizationVersion: 'science-challenge-normalization/v1',
		promptVersion: 'science-challenge-prompt/v1',
		promptSha256: salvageSource.orchestrationPromptSha256,
		runSummarySha256: canonicalHash(sourceSummary),
		transport: sourceSummary.transport,
		transportVersion: sourceSummary.transportVersion,
		responseMode: sourceSummary.responseMode ?? null,
		providerSchemaApplied: sourceSummary.providerSchemaApplied ?? null,
		provider: 'chatgpt',
		model: sourceSummary.model,
		modelVersion: null,
		modelVersions: sourceSummary.modelVersions,
		directPartSize: sourceSummary.partSize,
		thinkingLevel: sourceSummary.thinkingLevel,
		transportError: null,
		authoringDisposition: 'deterministic-multipart-plan-drift-salvage',
		sourceAttempt: 4,
		sourceAttemptStatus: 'failed',
		salvageSchemaVersion: 'science-challenge-multipart-plan-salvage/v1',
		salvagePathway: 'failed-merge-id-and-difficulty',
		salvageSourceSha256: canonicalHash(salvageSource),
		correctionsSha256: canonicalHash(corrections),
		deterministicValidationSha256: hash('current deterministic validation'),
		repairValidationSha256: hash('current repair validation')
	};

	const objectiveBase = {
		schemaVersion: 'science-challenge-verification-repair-objective/v1',
		planSha256: fixture.bindings.planSha256,
		verificationSha256: repairSha256,
		priorCandidateSetSha256
	};
	const objective = { ...objectiveBase, objectiveId: canonicalHash(objectiveBase) };
	const executionBase = {
		schemaVersion: 'science-challenge-verification-repair-execution/v2',
		planSha256: objective.planSha256,
		verificationSha256: objective.verificationSha256,
		priorCandidateSetSha256: objective.priorCandidateSetSha256,
		objectiveId: objective.objectiveId,
		model: sourceSummary.model,
		transport: sourceSummary.transport,
		responseMode: sourceSummary.responseMode ?? 'structured-json',
		thinkingLevel: sourceSummary.thinkingLevel,
		directPartSize: sourceSummary.partSize
	};
	const executionIdentity = {
		...executionBase,
		executionId: canonicalHash(executionBase)
	};
	const ledgerRoot = path.join(
		fixture.root,
		'tmp/science-challenge-verification-repair-ledgers',
		objective.objectiveId
	);
	const objectivePath = path.join(ledgerRoot, 'objective.json');
	writeJson(objectivePath, objective);
	const claims = [];
	for (let attempt = 1; attempt <= 4; attempt += 1) {
		const policy = {
			schemaVersion: 'science-challenge-verification-repair-attempt-policy/v1',
			objectiveId: objective.objectiveId,
			executionId: executionIdentity.executionId,
			model: executionIdentity.model,
			transport: executionIdentity.transport,
			responseMode: executionIdentity.responseMode,
			thinkingLevel: executionIdentity.thinkingLevel,
			directPartSize: executionIdentity.directPartSize
		};
		const claim = {
			schemaVersion: 'science-challenge-verification-repair-attempt-claim/v2',
			objectiveId: objective.objectiveId,
			executionId: executionIdentity.executionId,
			policy,
			policySha256: canonicalHash(policy),
			shardId: 'science-001',
			attempt,
			outputRootSha256: canonicalHash(path.resolve(fixture.root, fixture.paths.generationRoot))
		};
		const claimPath = path.join(
			ledgerRoot,
			'shards/science-001',
			`attempt-${String(attempt).padStart(2, '0')}`,
			'claim.json'
		);
		writeJson(claimPath, claim);
		claims.push({ attempt, claim, path: claimPath });
	}

	const binding = (filePath, relativeRoot = shardRoot) => ({
		path: path.relative(relativeRoot, filePath).split(path.sep).join('/'),
		sha256: sha256(readFileSync(filePath)),
		canonicalSha256: canonicalHash(readJson(filePath))
	});
	const salvageDirectory = path.join(
		shardRoot,
		`verification-repair-${repairPrefix}-multipart-plan-salvage`
	);
	const salvageCandidatePath = path.join(salvageDirectory, 'candidate.json');
	const salvageValidationPath = path.join(salvageDirectory, 'validation.json');
	const salvageManifestPath = path.join(salvageDirectory, 'manifest.json');
	writeJson(salvageCandidatePath, candidate);
	writeJson(salvageValidationPath, salvageValidation);
	const salvageEligibleSource = {
		attempt: 4,
		runSummarySha256: canonicalHash(sourceSummary),
		sourceValidationSha256: canonicalHash(sourceValidation),
		sourceCandidateSha256: null,
		salvagePathway: 'failed-merge-id-and-difficulty',
		salvageSourceSha256: canonicalHash(salvageSource),
		correctionsSha256: canonicalHash(corrections),
		recoveredCandidateSha256: canonicalHash(candidate),
		deterministicValidationSha256: salvageValidation.deterministicValidationSha256,
		repairValidationSha256: salvageValidation.repairValidationSha256
	};
	const salvageSourceSelection = {
		schemaVersion: 'science-challenge-multipart-plan-salvage-source-selection/v1',
		policy: 'sole-helper-approved-source',
		eligibleSources: [salvageEligibleSource],
		eligibleSourcesSha256: canonicalHash([salvageEligibleSource]),
		selectedAttempt: 4,
		selectedCandidateSha256: canonicalHash(candidate),
		approval: null
	};
	const salvageManifest = {
		schemaVersion: 'science-challenge-multipart-plan-salvage-evidence/v2',
		shardId: 'science-001',
		repairSha256,
		executionId: executionIdentity.executionId,
		executionIdentity,
		executionIdentitySha256: canonicalHash(executionIdentity),
		attemptBudget: {
			maxAttempts: 4,
			exhausted: true,
			localAttempts: Array.from({ length: 4 }, (_, index) => ({
				attempt: index + 1,
				directory: `verification-repair-${repairPrefix}-attempt-${String(index + 1).padStart(
					2,
					'0'
				)}`
			})),
			globalObjectiveSha256: canonicalHash(objective),
			globalObjectiveByteSha256: sha256(readFileSync(objectivePath)),
			globalAttempts: claims.map(({ attempt, claim, path: claimPath }) => ({
				attempt,
				claimSha256: canonicalHash(claim),
				claimByteSha256: sha256(readFileSync(claimPath))
			}))
		},
		sourceAttempt: {
			attempt: 4,
			directory: sourceAttemptDirectory,
			status: 'failed',
			runSummary: binding(sourceSummaryPath),
			validation: binding(sourceValidationPath),
			eventLog: {
				path: path.relative(shardRoot, path.join(sourceAttemptRoot, 'events.jsonl')),
				sha256: salvageSource.rootEventLogSha256
			},
			lastMessage: {
				path: path.relative(shardRoot, path.join(sourceAttemptRoot, 'last-message.json')),
				sha256: salvageSource.rootLastMessageSha256
			},
			prompt: {
				path: path.relative(shardRoot, sourcePromptPath),
				sha256: salvageSource.orchestrationPromptSha256
			},
			candidate: null,
			parts: sourceSummary.parts.map((record) => ({
				partId: record.partId,
				rawOutputSha256: record.rawOutputSha256,
				rawCandidateSha256: record.rawCandidateSha256,
				runSummarySha256: record.runSummarySha256
			}))
		},
		sourceSelection: salvageSourceSelection,
		repairEvidence: {
			verificationSummary: binding(path.join(repairRoot, 'verification-summary.json')),
			priorCandidate: binding(path.join(repairRoot, 'prior-candidate.json')),
			priorValidation: binding(path.join(repairRoot, 'prior-validation.json'))
		},
		salvage: {
			schemaVersion: 'science-challenge-multipart-plan-salvage/v1',
			pathway: 'failed-merge-id-and-difficulty',
			normalizationVersion: 'science-challenge-normalization/v1',
			source: salvageSource,
			corrections,
			candidateSha256: canonicalHash(candidate)
		},
		candidateSha256: canonicalHash(candidate),
		validationSha256: canonicalHash(salvageValidation)
	};
	writeJson(salvageManifestPath, salvageManifest);

	const relative = (filePath) => path.relative(fixture.root, filePath);
	const lineageParts = sourceSummary.parts.map((record) => ({
		...record,
		promptPath: relative(path.join(sourceAttemptRoot, record.promptPath)),
		requestPath: relative(path.join(sourceAttemptRoot, record.requestPath)),
		eventLogPath: relative(path.join(sourceAttemptRoot, record.eventLogPath)),
		rawOutputPath: relative(path.join(sourceAttemptRoot, record.rawOutputPath)),
		thoughtsPath: relative(path.join(sourceAttemptRoot, record.thoughtsPath)),
		resultMetadataPath: relative(path.join(sourceAttemptRoot, record.resultMetadataPath)),
		runSummaryPath: relative(path.join(sourceAttemptRoot, record.runSummaryPath))
	}));
	shard.candidatePath = relative(salvageCandidatePath);
	shard.candidateSha256 = canonicalHash(candidate);
	shard.validationPath = relative(salvageValidationPath);
	shard.validationSha256 = canonicalHash(salvageValidation);
	shard.salvage = {
		schemaVersion: salvageManifest.schemaVersion,
		salvagePathway: 'failed-merge-id-and-difficulty',
		manifestPath: relative(salvageManifestPath),
		manifestSha256: canonicalHash(salvageManifest),
		manifestFileSha256: sha256(readFileSync(salvageManifestPath)),
		candidatePath: relative(salvageCandidatePath),
		candidateSha256: canonicalHash(candidate),
		candidateFileSha256: sha256(readFileSync(salvageCandidatePath)),
		validationPath: relative(salvageValidationPath),
		validationSha256: canonicalHash(salvageValidation),
		validationFileSha256: sha256(readFileSync(salvageValidationPath)),
		execution: {
			executionId: executionIdentity.executionId,
			identity: executionIdentity,
			objectivePath: relative(objectivePath),
			objectiveSha256: canonicalHash(objective),
			objectiveByteSha256: sha256(readFileSync(objectivePath)),
			claims: claims.map(({ attempt, claim, path: claimPath }) => ({
				attempt,
				path: relative(claimPath),
				sha256: canonicalHash(claim),
				byteSha256: sha256(readFileSync(claimPath))
			}))
		},
		sourceAttempt: {
			attempt: 4,
			status: 'failed',
			runSummaryPath: relative(sourceSummaryPath),
			runSummarySha256: canonicalHash(sourceSummary),
			runSummaryFileSha256: sha256(readFileSync(sourceSummaryPath)),
			validationPath: relative(sourceValidationPath),
			validationSha256: canonicalHash(sourceValidation),
			validationFileSha256: sha256(readFileSync(sourceValidationPath)),
			eventLogPath: relative(path.join(sourceAttemptRoot, 'events.jsonl')),
			eventLogSha256: salvageSource.rootEventLogSha256,
			lastMessagePath: relative(path.join(sourceAttemptRoot, 'last-message.json')),
			lastMessageSha256: salvageSource.rootLastMessageSha256,
			promptPath: relative(sourcePromptPath),
			promptSha256: salvageSource.orchestrationPromptSha256,
			candidatePath: null,
			candidateSha256: null,
			candidateFileSha256: null,
			parts: lineageParts,
			responseMode: sourceSummary.responseMode ?? null,
			providerSchemaApplied: sourceSummary.providerSchemaApplied ?? null
		},
		repairEvidence: {
			verificationSummaryPath: relative(path.join(repairRoot, 'verification-summary.json')),
			verificationSummarySha256: repairSha256,
			verificationSummaryFileSha256: sha256(
				readFileSync(path.join(repairRoot, 'verification-summary.json'))
			),
			priorCandidatePath: relative(path.join(repairRoot, 'prior-candidate.json')),
			priorCandidateSha256: canonicalHash(priorCandidate),
			priorCandidateFileSha256: sha256(readFileSync(path.join(repairRoot, 'prior-candidate.json'))),
			priorValidationPath: relative(path.join(repairRoot, 'prior-validation.json')),
			priorValidationSha256: canonicalHash(priorValidation),
			priorValidationFileSha256: sha256(
				readFileSync(path.join(repairRoot, 'prior-validation.json'))
			)
		},
		sourceSelection: salvageSourceSelection,
		sourceSelectionSha256: canonicalHash(salvageSourceSelection),
		corrections,
		salvageSourceSha256: canonicalHash(salvageSource)
	};
	fixture.bindings.lineageSha256 = canonicalHash(fixture.paths.lineage);
	fixture.bindings.contentGenerationLineageSha256 = canonicalHash(fixture.paths.lineage.content);
	return { sourceAttemptDirectory, salvageDirectory };
}

function buildFixtureArchive(fixture) {
	const archiveRoot = path.join(
		fixture.root,
		'data/challenges/releases/science-test-v1/provenance'
	);
	buildScienceChallengeProvenanceArchive({
		rootDir: fixture.root,
		archiveRoot,
		releaseId: 'science-test-v1',
		materializedAt: '2026-07-21T00:00:00.000Z',
		expectedBindings: fixture.bindings,
		...fixture.paths
	});
	return archiveRoot;
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function writeFile(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, value);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function listFiles(root) {
	const files = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const filePath = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(filePath);
			else if (entry.isFile()) files.push(filePath);
		}
	};
	visit(root);
	return files;
}

function findForbiddenDurableKeys(value, currentPath = '$', issues = []) {
	if (Array.isArray(value)) {
		value.forEach((entry, index) =>
			findForbiddenDurableKeys(entry, `${currentPath}[${index}]`, issues)
		);
		return issues;
	}
	if (!value || typeof value !== 'object') return issues;
	for (const [key, entry] of Object.entries(value)) {
		const childPath = `${currentPath}.${key}`;
		if (key === 'sourceText' || key === 'substantiveExcerpt') {
			issues.push(childPath);
		}
		findForbiddenDurableKeys(entry, childPath, issues);
	}
	return issues;
}

function rebindTrackedArtifact(archiveRoot, relativePath) {
	const manifestPath = path.join(archiveRoot, 'manifest.json');
	const manifest = readJson(manifestPath);
	const record = manifest.trackedArtifacts.find((artifact) => artifact.path === relativePath);
	const artifactPath = path.join(archiveRoot, relativePath);
	const bytes = readFileSync(artifactPath);
	record.sha256 = sha256(bytes);
	record.bytes = bytes.length;
	record.canonicalSha256 = canonicalHash(readJson(artifactPath));
	writeJson(manifestPath, manifest);
}

function rehashTrackedArtifacts(archiveRoot) {
	const manifestPath = path.join(archiveRoot, 'manifest.json');
	const manifest = readJson(manifestPath);
	for (const record of manifest.trackedArtifacts) {
		const bytes = readFileSync(path.join(archiveRoot, record.path));
		record.sha256 = sha256(bytes);
		record.bytes = bytes.length;
		if (path.extname(record.path).toLowerCase() === '.json') {
			record.canonicalSha256 = canonicalHash(JSON.parse(bytes.toString('utf8')));
		}
	}
	writeJson(manifestPath, manifest);
}

function hash(value) {
	return createHash('sha256').update(String(value)).digest('hex');
}
