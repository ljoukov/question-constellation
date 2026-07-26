import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
	SCIENCE_CHALLENGE_REVIEW_REBASE_DIRECT_REPAIR_KIND,
	authenticateScienceChallengeReviewRebaseChildEvidence,
	commitScienceChallengeReviewRebaseChild,
	inspectScienceChallengeReviewRebaseChildRegistration,
	registerScienceChallengeReviewRebaseChild,
	reserveScienceChallengeReviewRebaseChild
} from './science-challenge-review-rebase-child-registry.mjs';
import { canonicalHash, stableStringify } from './science-challenge-release.mjs';
import {
	bindVerificationRepairExecutionMarker,
	scienceChallengeVerificationRepairExecutionIdentity,
	scienceChallengeVerificationRepairObjectiveIdentity
} from './science-challenge-verification-repair-lineage.mjs';
import { buildScienceChallengeVerificationRepairAuthority } from './science-challenge-verification-repair-transaction.mjs';

test('authenticates exact evidence under a fixed Git-common-dir authority without leaking paths', (t) => {
	const fixture = makeFixture(t);
	const authenticated = authenticateScienceChallengeReviewRebaseChildEvidence(fixture.options);
	assert.equal(authenticated.status, 'passed');
	assert.equal(authenticated.authorityLabel, SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL);
	assert.equal(Object.keys(authenticated).includes('_internal'), false);
	const serialized = JSON.stringify(authenticated);
	assert.equal(serialized.includes(fixture.tempRoot), false);
	assert.equal(serialized.includes(process.env.USER ?? '__no-user__'), false);

	for (const extra of ['registryRoot', 'discoveryRoot', 'lineage']) {
		const narrowed = structuredClone(fixture.options);
		narrowed[extra] = fixture.mainRoot;
		assert.throws(
			() => authenticateScienceChallengeReviewRebaseChildEvidence(narrowed),
			/unsupported fields/u
		);
	}

	const reordered = structuredClone(fixture.options);
	reordered.evidence.b0Candidates.reverse();
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseChildEvidence(reordered),
		/exact review-rebase plan order/u
	);

	const arbitraryIdentity = structuredClone(fixture.options);
	arbitraryIdentity.evidence.executionIdentity.executionId = hash('arbitrary execution');
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseChildEvidence(arbitraryIdentity),
		/differs from recomputation/u
	);
});

test('reserves pending, commits exact parent plus objective before attempts, and keeps one commit hash', (t) => {
	const fixture = makeFixture(t);
	const fresh = inspectScienceChallengeReviewRebaseChildRegistration(fixture.options);
	assert.equal(fresh.action, 'create');
	assert.equal(fresh.status, 'planned');
	assert.equal(fresh.commitSha256, undefined);
	assert.equal(existsSync(registryRoot(fixture)), false);

	assert.throws(
		() => commitScienceChallengeReviewRebaseChild(fixture.options),
		/cannot commit before exact S1 evidence is seeded/u
	);
	assert.equal(existsSync(registryRoot(fixture)), false);

	const reserved = reserveScienceChallengeReviewRebaseChild(fixture.options);
	assert.equal(reserved.action, 'reserved');
	assert.equal(reserved.status, 'pending');
	assert.equal(
		inspectScienceChallengeReviewRebaseChildRegistration(fixture.options).action,
		'resume'
	);

	stageParentAndObjective(fixture);
	assert.equal(
		inspectScienceChallengeReviewRebaseChildRegistration(fixture.options).action,
		'seed-ready'
	);
	assert.throws(
		() => commitScienceChallengeReviewRebaseChild(fixture.options),
		/cannot commit before exact S1 evidence is seeded/u
	);
	stageExecutionMarker(fixture);
	const ready = inspectScienceChallengeReviewRebaseChildRegistration(fixture.options);
	assert.equal(ready.action, 'commit-ready');
	assert.match(ready.commitSha256, /^[a-f0-9]{64}$/u);

	const committed = commitScienceChallengeReviewRebaseChild(fixture.options);
	assert.equal(committed.action, 'committed');
	assert.equal(committed.status, 'committed');
	assert.equal(committed.commitSha256, ready.commitSha256);

	stageAttempt(fixture);
	const replay = inspectScienceChallengeReviewRebaseChildRegistration(fixture.options);
	assert.equal(replay.action, 'committed');
	assert.equal(replay.commitSha256, ready.commitSha256);
});

test('discovers and backfills an existing S1 in another linked worktree', (t) => {
	const fixture = makeFixture(t, { invoking: 'main', output: 'sibling' });
	stageParentAndObjective(fixture);
	stageExecutionMarker(fixture);
	const planned = inspectScienceChallengeReviewRebaseChildRegistration(fixture.options);
	assert.equal(planned.action, 'backfill');
	assert.match(planned.commitSha256, /^[a-f0-9]{64}$/u);

	const committed = registerScienceChallengeReviewRebaseChild(fixture.options);
	assert.equal(committed.action, 'committed');
	assert.equal(committed.commitSha256, planned.commitSha256);

	const siblingOptions = structuredClone(fixture.options);
	siblingOptions.workspaceRoot = fixture.siblingRoot;
	const fromSibling = inspectScienceChallengeReviewRebaseChildRegistration(siblingOptions);
	assert.equal(fromSibling.action, 'committed');
	assert.equal(fromSibling.commitSha256, planned.commitSha256);
});

test('rejects a disconnected execution sibling even after all registry files are deleted', (t) => {
	const fixture = makeFixture(t);
	stageParentAndObjective(fixture);
	stageExecutionMarker(fixture);
	const committed = registerScienceChallengeReviewRebaseChild(fixture.options);
	for (const filePath of authorityFiles(fixture, committed)) unlinkSync(filePath);

	const sibling = withExecution(fixture.options, { model: 'another-exact-model' });
	assert.throws(
		() => inspectScienceChallengeReviewRebaseChildRegistration(sibling),
		/already has another direct child/u
	);

	const restored = registerScienceChallengeReviewRebaseChild(fixture.options);
	assert.equal(restored.action, 'committed');
	assert.equal(restored.commitSha256, committed.commitSha256);
});

test('repairs one missing slot or replica on mutating replay and rejects rewritten authority', (t) => {
	const fixture = makeFixture(t);
	stageParentAndObjective(fixture);
	stageExecutionMarker(fixture);
	const committed = registerScienceChallengeReviewRebaseChild(fixture.options);
	const paths = authorityPaths(fixture, committed);
	unlinkSync(paths.reservationReplica);
	assert.equal(
		inspectScienceChallengeReviewRebaseChildRegistration(fixture.options).action,
		'committed'
	);
	assert.equal(existsSync(paths.reservationReplica), false, 'inspection must remain write-free');
	assert.equal(reserveScienceChallengeReviewRebaseChild(fixture.options).action, 'committed');
	assert.equal(existsSync(paths.reservationReplica), true);

	unlinkSync(paths.commitSlot);
	assert.equal(commitScienceChallengeReviewRebaseChild(fixture.options).action, 'committed');
	assert.equal(existsSync(paths.commitSlot), true);
	assert.equal(statSync(paths.commitSlot).ino, statSync(paths.commitReplica).ino);

	const reservation = JSON.parse(readFileSync(paths.reservationSlot, 'utf8'));
	unlinkSync(paths.reservationSlot);
	reservation.child.executionId = hash('rewritten execution');
	const core = structuredClone(reservation);
	delete core.reservationSha256;
	reservation.reservationSha256 = canonicalHash(core);
	writeCanonicalJson(paths.reservationSlot, reservation);
	chmodSync(paths.reservationSlot, 0o444);
	assert.throws(
		() => inspectScienceChallengeReviewRebaseChildRegistration(fixture.options),
		/slot and replica bytes diverge/u
	);
});

test('a matching V2-or-later objective without a direct parent does not block a fresh direct lineage', (t) => {
	const fixture = makeFixture(t);
	const alternateVerification = hash('unrelated later verification');
	const objective = scienceChallengeVerificationRepairObjectiveIdentity({
		planSha256: canonicalHash(fixture.plan),
		verificationSha256: alternateVerification,
		priorCandidateSetSha256: canonicalHash(fixture.candidates)
	});
	const root = path.join(
		fixture.siblingRoot,
		'tmp',
		'science-challenge-verification-repair-ledgers',
		objective.objectiveId
	);
	mkdirSync(root, { recursive: true });
	writeCanonicalJson(path.join(root, 'objective.json'), objective);
	assert.equal(
		inspectScienceChallengeReviewRebaseChildRegistration(fixture.options).action,
		'create'
	);
});

test('fails closed on parent, objective, authority, and transaction replay drift', (t) => {
	for (const drift of ['authority', 'objective', 'execution-marker', 'transaction']) {
		const fixture = makeFixture(t);
		stageParentAndObjective(fixture);
		stageExecutionMarker(fixture);
		if (drift === 'authority') {
			const parentPath = path.join(fixture.outputRoot, 'verification-repair-parent.json');
			const parent = JSON.parse(readFileSync(parentPath, 'utf8'));
			parent.verificationRepairAuthority.mutableChallengeIds = [];
			parent.verificationRepairAuthoritySha256 = canonicalHash(parent.verificationRepairAuthority);
			writeCanonicalJson(parentPath, parent);
		}
		if (drift === 'objective') {
			const objectivePath = path.join(fixture.ledgerRoot, 'objective.json');
			const objective = JSON.parse(readFileSync(objectivePath, 'utf8'));
			objective.verificationSha256 = hash('rewritten verification');
			writeCanonicalJson(objectivePath, objective);
		}
		if (drift === 'execution-marker') {
			const markerPath = path.join(fixture.ledgerRoot, 'execution.json');
			const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
			marker.outputRootBindingSha256 = hash('rewritten marker output');
			chmodSync(markerPath, 0o644);
			writeCanonicalJson(markerPath, marker);
		}
		if (drift === 'transaction') {
			stageAttempt(fixture);
			const transactionPath = path.join(
				fixture.ledgerRoot,
				'attempt-transactions',
				'science-001-attempt-01.json'
			);
			const transaction = JSON.parse(readFileSync(transactionPath, 'utf8'));
			transaction.outputRootSha256 = hash('rewritten output root');
			writeCanonicalJson(transactionPath, transaction);
		}
		assert.throws(
			() => inspectScienceChallengeReviewRebaseChildRegistration(fixture.options),
			/replay|rewritten|invalid|differs/u,
			drift
		);
	}
});

test('refuses a pre-existing requested output root without direct parent evidence', (t) => {
	const fixture = makeFixture(t);
	mkdirSync(fixture.outputRoot, { recursive: true });
	assert.throws(
		() => reserveScienceChallengeReviewRebaseChild(fixture.options),
		/lacks authenticated direct parent/u
	);
	assert.equal(existsSync(registryRoot(fixture)), false);
});

function makeFixture(t, { invoking = 'main', output = 'sibling' } = {}) {
	const tempRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-child-registry-v2-')));
	const mainRoot = path.join(tempRoot, 'main');
	const siblingRoot = path.join(tempRoot, 'sibling');
	mkdirSync(mainRoot);
	git(mainRoot, ['init', '-b', 'main']);
	git(mainRoot, ['config', 'user.email', 'fixture@example.test']);
	git(mainRoot, ['config', 'user.name', 'Fixture']);
	writeFileSync(path.join(mainRoot, 'seed.txt'), 'seed\n');
	git(mainRoot, ['add', 'seed.txt']);
	git(mainRoot, ['commit', '-m', 'seed']);
	git(mainRoot, ['worktree', 'add', '--detach', siblingRoot, 'HEAD']);
	t.after(() => rmSync(tempRoot, { recursive: true, force: true }));

	const basePlan = { schemaVersion: 'fixture-base-plan/v1', rows: ['challenge-1'] };
	const plan = {
		schemaVersion: 'fixture-review-rebase-plan/v1',
		rows: [{ id: 'challenge-1' }, { id: 'challenge-2' }]
	};
	const candidates = [
		{ definition: { id: 'challenge-1' }, question: 'First exact candidate' },
		{ definition: { id: 'challenge-2' }, question: 'Second exact candidate' }
	];
	const sourceSnapshot = { schemaVersion: 'fixture-source-snapshot/v1', sources: ['A'] };
	const curriculumEvidence = {
		schemaVersion: 'fixture-curriculum-evidence/v1',
		components: ['B']
	};
	const collectionRemediations = [
		{
			issue: 'Fixture collection issue requires deterministic cohort repair.',
			preferredChallengeId: 'challenge-2'
		}
	];
	const manifestCore = {
		schemaVersion: 'science-challenge-review-rebase-manifest/v1',
		basePlanSha256: canonicalHash(basePlan),
		planSha256: canonicalHash(plan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		parentVerificationSha256: hash('parent verification'),
		parentRepairSha256: hash('parent repair'),
		approvalSha256: hash('approval'),
		specSha256: hash('spec'),
		selectionSourceSetSha256: hash('selection sources'),
		candidateSetSha256: canonicalHash(candidates),
		collectionValidationSha256: hash('collection validation')
	};
	const manifest = {
		schemaVersion: manifestCore.schemaVersion,
		status: 'review-pending',
		disposition: 'deterministic-parent-bound-review-rebase',
		requiresFreshFullVerification: true,
		releaseEligible: false,
		rebaseId: canonicalHash(manifestCore),
		planSha256: manifestCore.planSha256,
		basePlanSha256: manifestCore.basePlanSha256,
		candidateSetSha256: manifestCore.candidateSetSha256,
		sourceSnapshotSha256: manifestCore.sourceSnapshotSha256,
		curriculumEvidenceSha256: manifestCore.curriculumEvidenceSha256,
		parent: {
			verificationSha256: manifestCore.parentVerificationSha256,
			repairSha256: manifestCore.parentRepairSha256
		},
		approvalSha256: manifestCore.approvalSha256,
		specSha256: manifestCore.specSha256,
		selectionSourceSetSha256: manifestCore.selectionSourceSetSha256,
		collectionValidationSha256: manifestCore.collectionValidationSha256,
		collectionRemediations,
		collectionRemediationSetSha256: canonicalHash(collectionRemediations)
	};
	const targetIds = ['challenge-2'];
	const summary = {
		schemaVersion: 'science-challenge-independent-verification-summary/v1',
		status: 'failed',
		planSha256: canonicalHash(plan),
		effectivePlanSha256: canonicalHash(plan),
		basePlanSha256: canonicalHash(basePlan),
		candidateSetSha256: canonicalHash(candidates),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		reviews: [
			{ id: 'challenge-1', accepted: false },
			{ id: 'challenge-2', accepted: true }
		],
		reviewCount: 2,
		acceptedCount: 1,
		rejectedCount: 1,
		reviewRebaseManifestSha256: canonicalHash(manifest),
		reviewRebaseId: manifest.rebaseId,
		reviewRebaseCandidateSetSha256: canonicalHash(candidates),
		reviewRebaseCollectionValidationSha256: manifest.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256: manifest.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediations: collectionRemediations,
		reviewRebaseCollectionRemediationTargetIds: targetIds,
		reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
	};
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary: summary,
		reviewRebaseManifest: manifest
	});
	const execution = scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: canonicalHash(plan),
		verificationSha256: canonicalHash(summary),
		priorCandidateSetSha256: canonicalHash(candidates),
		model: 'chatgpt-gpt-5.6-sol',
		transport: 'llm-direct',
		responseMode: 'prompt-json',
		thinkingLevel: 'high',
		directPartSize: 2
	});
	const outputWorktree = output === 'main' ? mainRoot : siblingRoot;
	const outputRoot = path.join(outputWorktree, 'tmp', 'science-challenges', 'direct-s1');
	const workspaceRoot = invoking === 'sibling' ? siblingRoot : mainRoot;
	const evidence = {
		reviewRebaseManifest: manifest,
		reviewRebasePlan: plan,
		basePlan,
		b0Candidates: candidates,
		sourceSnapshot,
		curriculumEvidence,
		verificationSummary: summary,
		verificationRepairAuthority: authority,
		executionIdentity: execution,
		outputRoot
	};
	return {
		tempRoot,
		mainRoot,
		siblingRoot,
		workspaceRoot,
		outputWorktree,
		outputRoot,
		plan,
		candidates,
		manifest,
		summary,
		authority,
		execution,
		options: {
			repairKind: SCIENCE_CHALLENGE_REVIEW_REBASE_DIRECT_REPAIR_KIND,
			workspaceRoot,
			evidence
		}
	};
}

function stageParentAndObjective(fixture) {
	const evidenceRoot = path.join(
		fixture.outputWorktree,
		'tmp',
		'science-challenges',
		'direct-child-inputs'
	);
	mkdirSync(evidenceRoot, { recursive: true });
	const manifestPath = path.join(evidenceRoot, 'manifest.json');
	const summaryPath = path.join(evidenceRoot, 'summary.json');
	const assignmentPath = path.join(evidenceRoot, 'assignment-index.json');
	const assignment = { schemaVersion: 'fixture-assignment-index/v1', assignments: [] };
	writeCanonicalJson(manifestPath, fixture.manifest);
	writeCanonicalJson(summaryPath, fixture.summary);
	writeCanonicalJson(assignmentPath, assignment);
	mkdirSync(fixture.outputRoot, { recursive: true });
	const relative = (filePath) =>
		path.relative(fixture.outputWorktree, filePath).split(path.sep).join('/');
	const parent = {
		schemaVersion: 'science-challenge-review-rebase-repair-parent/v1',
		reviewRebaseManifestSha256: canonicalHash(fixture.manifest),
		reviewRebaseId: fixture.manifest.rebaseId,
		planSha256: canonicalHash(fixture.plan),
		basePlanSha256: canonicalHash(fixture.options.evidence.basePlan),
		candidateSetSha256: canonicalHash(fixture.candidates),
		sourceSnapshotSha256: canonicalHash(fixture.options.evidence.sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(fixture.options.evidence.curriculumEvidence),
		verificationSummarySha256: canonicalHash(fixture.summary),
		verificationRepairAuthority: fixture.authority,
		verificationRepairAuthoritySha256: canonicalHash(fixture.authority),
		verificationAssignmentIndexSha256: canonicalHash(assignment),
		reviewRebaseManifestPath: relative(manifestPath),
		verificationSummaryPath: relative(summaryPath),
		verificationAssignmentIndexPath: relative(assignmentPath)
	};
	writeCanonicalJson(path.join(fixture.outputRoot, 'verification-repair-parent.json'), parent);
	const objective = scienceChallengeVerificationRepairObjectiveIdentity({
		planSha256: canonicalHash(fixture.plan),
		verificationSha256: canonicalHash(fixture.summary),
		priorCandidateSetSha256: canonicalHash(fixture.candidates)
	});
	fixture.ledgerRoot = path.join(
		fixture.outputWorktree,
		'tmp',
		'science-challenge-verification-repair-ledgers',
		objective.objectiveId
	);
	mkdirSync(fixture.ledgerRoot, { recursive: true });
	writeCanonicalJson(path.join(fixture.ledgerRoot, 'objective.json'), objective);
}

function stageAttempt(fixture) {
	const root = path.join(fixture.ledgerRoot, 'attempt-transactions');
	mkdirSync(root, { recursive: true });
	writeCanonicalJson(path.join(root, 'science-001-attempt-01.json'), {
		schemaVersion: 'science-challenge-verification-repair-attempt-transaction/v1',
		status: 'preparing',
		objectiveId: fixture.execution.objectiveId,
		executionIdentity: fixture.execution,
		shardId: 'science-001',
		attempt: 1,
		outputRootPath: fixture.outputRoot,
		outputRootSha256: canonicalHash(path.resolve(fixture.outputRoot))
	});
}

function stageExecutionMarker(fixture) {
	bindVerificationRepairExecutionMarker({
		workspaceRoot: fixture.outputWorktree,
		ledgerRoot: fixture.ledgerRoot,
		identity: fixture.execution,
		outputRoot: fixture.outputRoot
	});
}

function withExecution(options, { model }) {
	const changed = structuredClone(options);
	const current = changed.evidence.executionIdentity;
	changed.evidence.executionIdentity = scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: current.planSha256,
		verificationSha256: current.verificationSha256,
		priorCandidateSetSha256: current.priorCandidateSetSha256,
		model,
		transport: current.transport,
		responseMode: current.responseMode,
		thinkingLevel: current.thinkingLevel,
		directPartSize: current.directPartSize
	});
	return changed;
}

function authorityPaths(fixture, reference) {
	const root = registryRoot(fixture);
	const key = reference.lineageKeySha256;
	return {
		reservationSlot: path.join(root, 'reservation-slots', `${key}.json`),
		reservationReplica: path.join(root, 'reservations', key, `${reference.reservationSha256}.json`),
		commitSlot: path.join(root, 'commit-slots', `${key}.json`),
		commitReplica: path.join(root, 'commits', key, `${reference.commitSha256}.json`)
	};
}

function authorityFiles(fixture, reference) {
	return Object.values(authorityPaths(fixture, reference));
}

function registryRoot(fixture) {
	const common = git(fixture.mainRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
	return path.join(
		common,
		'codex-evidence',
		'science-challenge-review-rebase-child-registry',
		'v2'
	);
}

function writeCanonicalJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function git(cwd, args) {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	}).trim();
}

function hash(value) {
	return canonicalHash({ value });
}
