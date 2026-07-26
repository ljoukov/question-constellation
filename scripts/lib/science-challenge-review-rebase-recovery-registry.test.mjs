import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import {
	chmodSync,
	existsSync,
	linkSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
	SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_COMMIT_SCHEMA,
	SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_RESERVATION_SCHEMA
} from './science-challenge-review-rebase-child-registry.mjs';
import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_ROOT,
	authenticateScienceChallengeReviewRebaseRecoveryContinuation,
	commitScienceChallengeReviewRebaseRecoveryContinuation,
	inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration,
	readScienceChallengeReviewRebaseRecoveryContinuationRegistration,
	registerScienceChallengeReviewRebaseRecoveryContinuation,
	reserveScienceChallengeReviewRebaseRecoveryContinuation
} from './science-challenge-review-rebase-recovery-registry.mjs';
import { canonicalHash, stableStringify } from './science-challenge-release.mjs';
import {
	scienceChallengeVerificationRepairExecutionIdentity,
	scienceChallengeVerificationRepairObjectiveIdentity
} from './science-challenge-verification-repair-lineage.mjs';

const modulePath = fileURLToPath(
	new URL('./science-challenge-review-rebase-recovery-registry.mjs', import.meta.url)
);
const RECOVERY_MANIFEST_FILE = 'verification-repair-infrastructure-recovery.json';

test('dry-run is write-free and a fresh reservation commits exactly one staged successor', (t) => {
	const fixture = makeFixture(t);
	const registryRoot = recoveryRegistryRoot(fixture);
	const successorRoot = path.join(fixture.root, ...fixture.successorPath.split('/'));
	const beforeGitTree = treeNames(fixture.commonDir);

	const dryRun = registerScienceChallengeReviewRebaseRecoveryContinuation({
		...fixture.options,
		dryRun: true
	});
	assert.equal(dryRun.status, 'planned');
	assert.equal(dryRun.action, 'create');
	assert.equal(dryRun.dryRun, true);
	assert.equal(existsSync(registryRoot), false);
	assert.equal(existsSync(successorRoot), false);
	assert.deepEqual(treeNames(fixture.commonDir), beforeGitTree);

	const reserved = reserveScienceChallengeReviewRebaseRecoveryContinuation(fixture.options);
	assert.equal(reserved.status, 'pending');
	assert.equal(reserved.action, 'reserved');
	assert.equal(
		inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(fixture.options).action,
		'resume'
	);
	assert.equal(readdirSync(path.join(registryRoot, 'reservations')).length, 1);
	assert.equal(existsSync(path.join(registryRoot, 'commits')), false);

	stageSuccessor(fixture);
	const ready = inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(
		fixture.options
	);
	assert.equal(ready.status, 'pending');
	assert.equal(ready.action, 'commit-ready');
	const committed = commitScienceChallengeReviewRebaseRecoveryContinuation(fixture.options);
	assert.equal(committed.status, 'committed');
	assert.equal(committed.action, 'committed');
	assert.equal(committed.successor.path, fixture.successorPath);
	assert.equal(
		readScienceChallengeReviewRebaseRecoveryContinuationRegistration(fixture.options).action,
		'committed'
	);
	assert.equal(
		registerScienceChallengeReviewRebaseRecoveryContinuation(fixture.options).action,
		'committed'
	);

	const records = registryRecords(registryRoot);
	assert.equal(records.length, 2);
	for (const record of records) {
		assert.equal(lstatSync(record.path).nlink, 1);
		assert.equal(lstatSync(record.path).mode & 0o222, 0);
		const serialized = stableStringify(record.value);
		assert.equal(serialized.includes(fixture.base), false);
		assert.equal(serialized.includes('incident'), false);
	}
});

test('uniquely discovers and atomically backfills an exact same-path successor', (t) => {
	const fixture = makeFixture(t);
	stageSuccessor(fixture);
	const registryRoot = recoveryRegistryRoot(fixture);
	const planned = inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(
		fixture.options
	);
	assert.equal(planned.status, 'planned');
	assert.equal(planned.action, 'backfill');
	assert.equal(existsSync(registryRoot), false);
	const dryRunCommit = commitScienceChallengeReviewRebaseRecoveryContinuation({
		...fixture.options,
		dryRun: true
	});
	assert.equal(dryRunCommit.action, 'backfill');
	assert.equal(dryRunCommit.dryRun, true);
	assert.equal(existsSync(registryRoot), false);

	const registered = registerScienceChallengeReviewRebaseRecoveryContinuation(fixture.options);
	assert.equal(registered.status, 'committed');
	assert.equal(registered.action, 'committed');

	const absoluteAlias = {
		...fixture.options,
		successorRoot: path.join(
			fixture.root,
			'tmp',
			'science-challenges',
			'nested',
			'..',
			'recovery-successor'
		)
	};
	const replay = registerScienceChallengeReviewRebaseRecoveryContinuation(absoluteAlias);
	assert.equal(replay.action, 'committed');
	assert.deepEqual(replay.successor, registered.successor);
});

test('uses Git common-dir authority and worktree ids for linked-worktree backfill', (t) => {
	const fixture = makeFixture(t, { withLinkedWorktree: true });
	const successorPath = 'tmp/science-challenges/linked-recovery-successor';
	const manifest = recoveryManifestFor(fixture, successorPath);
	const successorRoot = path.join(fixture.linkedRoot, ...successorPath.split('/'));
	const options = {
		...fixture.options,
		successorRoot,
		recoveryManifest: manifest
	};
	stageSuccessor(fixture, { root: fixture.linkedRoot, successorPath, manifest });

	const committed = registerScienceChallengeReviewRebaseRecoveryContinuation(options);
	assert.equal(committed.action, 'committed');
	assert.equal(committed.successor.path, successorPath);
	assert.notEqual(committed.successor.worktreeId, fixture.mainWorktreeId);
	assert.equal(stableStringify(committed).includes(fixture.linkedRoot), false);
	assert.equal(recoveryRegistryRoot(fixture).startsWith(fixture.commonDir), true);
});

test('fails closed when two lineage-matching staged successors exist', (t) => {
	const fixture = makeFixture(t);
	stageSuccessor(fixture);
	const alternatePath = 'tmp/science-challenges/alternate-recovery-successor';
	stageSuccessor(fixture, {
		successorPath: alternatePath,
		manifest: recoveryManifestFor(fixture, alternatePath)
	});
	assert.throws(
		() => inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(fixture.options),
		/Multiple typed recovery-continuation successors/u
	);
	assert.equal(existsSync(recoveryRegistryRoot(fixture)), false);
});

test('authenticates the direct child and rejects objective, execution, manifest, and path drift', (t) => {
	const fixture = makeFixture(t);
	const authenticated = authenticateScienceChallengeReviewRebaseRecoveryContinuation(
		fixture.options
	);
	assert.equal(authenticated.status, 'passed');
	assert.equal(stableStringify(authenticated).includes(fixture.root), false);

	const staleObjective = structuredClone(fixture.options);
	staleObjective.originalObjective.verificationSha256 = hash('stale verification');
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseRecoveryContinuation(staleObjective),
		/objective was rewritten/u
	);

	const staleExecution = structuredClone(fixture.options);
	staleExecution.originalExecution.executionId = hash('stale execution');
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseRecoveryContinuation(staleExecution),
		/execution was rewritten/u
	);

	const staleRecovery = structuredClone(fixture.options);
	staleRecovery.recoveryManifest.recoveryExecutionId = hash('stale recovery execution');
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseRecoveryContinuation(staleRecovery),
		/Recovery execution identity/u
	);

	const staleDirectChild = structuredClone(fixture.options);
	staleDirectChild.directChildRegistration.reservationSha256 = hash('stale reservation');
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseRecoveryContinuation(staleDirectChild),
		/missing component|another reservation/u
	);

	const traversal = structuredClone(fixture.options);
	traversal.successorRoot = '../outside';
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseRecoveryContinuation(traversal),
		/must belong to one linked-worktree/u
	);
	assert.equal(existsSync(recoveryRegistryRoot(fixture)), false);
});

test('rejects successor path symlinks, discovery symlinks, and manifest hard-link aliases', (t) => {
	const pathFixture = makeFixture(t);
	const outside = path.join(pathFixture.base, 'outside');
	mkdirSync(outside);
	const scienceRoot = path.join(pathFixture.root, 'tmp', 'science-challenges');
	mkdirSync(scienceRoot, { recursive: true });
	symlinkSync(outside, path.join(scienceRoot, 'linked'));
	const linkedOptions = {
		...pathFixture.options,
		successorRoot: 'tmp/science-challenges/linked/recovery'
	};
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseRecoveryContinuation(linkedOptions),
		/contains a symlink/u
	);

	const discoveryFixture = makeFixture(t);
	const discoveryRoot = path.join(discoveryFixture.root, 'tmp', 'science-challenges');
	mkdirSync(discoveryRoot, { recursive: true });
	symlinkSync(
		path.join(discoveryFixture.base, 'outside-discovery'),
		path.join(discoveryRoot, 'unsafe-link')
	);
	assert.throws(
		() =>
			inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(discoveryFixture.options),
		/discovery tree contains a symlink/u
	);

	const hardLinkFixture = makeFixture(t);
	const manifestPath = stageSuccessor(hardLinkFixture);
	const aliasRoot = path.join(hardLinkFixture.root, 'tmp', 'science-challenges', 'manifest-alias');
	mkdirSync(aliasRoot, { recursive: true });
	linkSync(manifestPath, path.join(aliasRoot, RECOVERY_MANIFEST_FILE));
	assert.throws(
		() =>
			inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(hardLinkFixture.options),
		/hard-link alias/u
	);
});

test('rejects registry tamper, symlink replacement, and arbitrary hard-link aliases', (t) => {
	const hardLinkFixture = makeFixture(t);
	reserveScienceChallengeReviewRebaseRecoveryContinuation(hardLinkFixture.options);
	const hardLinkSlot = singleRegistryReservation(hardLinkFixture);
	const alias = path.join(hardLinkFixture.base, 'registry-alias.json');
	linkSync(hardLinkSlot, alias);
	assert.throws(
		() => readScienceChallengeReviewRebaseRecoveryContinuationRegistration(hardLinkFixture.options),
		/without hard-link aliases/u
	);

	const tamperFixture = makeFixture(t);
	reserveScienceChallengeReviewRebaseRecoveryContinuation(tamperFixture.options);
	const tamperSlot = singleRegistryReservation(tamperFixture);
	const tampered = JSON.parse(readFileSync(tamperSlot, 'utf8'));
	tampered.successor.recoveryExecutionId = hash('tampered recovery execution');
	chmodSync(tamperSlot, 0o644);
	writeFileSync(tamperSlot, `${stableStringify(tampered)}\n`);
	chmodSync(tamperSlot, 0o444);
	assert.throws(
		() => readScienceChallengeReviewRebaseRecoveryContinuationRegistration(tamperFixture.options),
		/self-hash was rewritten/u
	);

	const symlinkFixture = makeFixture(t);
	reserveScienceChallengeReviewRebaseRecoveryContinuation(symlinkFixture.options);
	const symlinkSlot = singleRegistryReservation(symlinkFixture);
	const target = path.join(symlinkFixture.base, 'registry-target.json');
	writeFileSync(target, readFileSync(symlinkSlot));
	unlinkSync(symlinkSlot);
	symlinkSync(target, symlinkSlot);
	assert.throws(
		() => readScienceChallengeReviewRebaseRecoveryContinuationRegistration(symlinkFixture.options),
		/read-only regular file/u
	);
});

test('rejects direct-child authority tamper and unexpected hard-link aliases', (t) => {
	const aliasFixture = makeFixture(t);
	const childReservationSlot = aliasFixture.directChildPaths.reservationSlot;
	linkSync(childReservationSlot, path.join(aliasFixture.base, 'direct-child-alias.json'));
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseRecoveryContinuation(aliasFixture.options),
		/unexpected hard-link aliases/u
	);

	const tamperFixture = makeFixture(t);
	const childCommitSlot = tamperFixture.directChildPaths.commitSlot;
	const commit = JSON.parse(readFileSync(childCommitSlot, 'utf8'));
	commit.reservationSha256 = hash('tampered direct child reservation');
	chmodSync(childCommitSlot, 0o644);
	writeFileSync(childCommitSlot, `${stableStringify(commit)}\n`);
	chmodSync(childCommitSlot, 0o444);
	assert.throws(
		() => authenticateScienceChallengeReviewRebaseRecoveryContinuation(tamperFixture.options),
		/commit authority is invalid/u
	);
});

test('two concurrent conflicting reservations produce one immutable winner', async (t) => {
	const fixture = makeFixture(t);
	const alternatePath = 'tmp/science-challenges/racing-recovery-successor';
	const alternate = {
		...fixture.options,
		successorRoot: alternatePath,
		recoveryManifest: recoveryManifestFor(fixture, alternatePath)
	};
	const firstOptionsPath = path.join(fixture.base, 'first-options.json');
	const secondOptionsPath = path.join(fixture.base, 'second-options.json');
	const barrierPath = path.join(fixture.base, 'race-start');
	writeFileSync(firstOptionsPath, JSON.stringify(fixture.options));
	writeFileSync(secondOptionsPath, JSON.stringify(alternate));

	const first = spawnReservationProcess({
		optionsPath: firstOptionsPath,
		barrierPath,
		cwd: fixture.root
	});
	const second = spawnReservationProcess({
		optionsPath: secondOptionsPath,
		barrierPath,
		cwd: fixture.root
	});
	writeFileSync(barrierPath, 'start');
	const results = await Promise.all([first, second]);
	assert.deepEqual(results.map((result) => result.status).sort(), [0, 2]);
	assert.match(
		results.find((result) => result.status === 2).stderr,
		/another recovery continuation|won the shared slot/u
	);

	const reservations = readdirSync(path.join(recoveryRegistryRoot(fixture), 'reservations'));
	assert.equal(reservations.length, 1);
	const reservationPath = path.join(recoveryRegistryRoot(fixture), 'reservations', reservations[0]);
	assert.equal(statSync(reservationPath).nlink, 1);
	assert.equal(
		readdirSync(path.dirname(reservationPath)).some((name) => name.endsWith('.tmp')),
		false
	);

	const winner = results.find((result) => result.status === 0);
	const winnerOptions = winner.stdout.includes(alternatePath) ? alternate : fixture.options;
	assert.equal(
		inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(winnerOptions).action,
		'resume'
	);
	const loserOptions = winnerOptions === alternate ? fixture.options : alternate;
	assert.throws(
		() => inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(loserOptions),
		/another recovery continuation/u
	);
});

function makeFixture(t, { withLinkedWorktree = false } = {}) {
	const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'science-recovery-registry-')));
	t.after(() => rmSync(base, { recursive: true, force: true }));
	const root = path.join(base, 'main');
	mkdirSync(root);
	git(base, ['init', '-q', root]);
	git(root, ['config', 'user.email', 'registry@example.test']);
	git(root, ['config', 'user.name', 'Registry Fixture']);
	writeFileSync(path.join(root, 'seed.txt'), 'seed\n');
	git(root, ['add', 'seed.txt']);
	git(root, ['commit', '-q', '-m', 'seed']);
	const commonDir = realpathSync(path.join(root, '.git'));
	let linkedRoot = null;
	if (withLinkedWorktree) {
		const requestedLinkedRoot = path.join(base, 'linked');
		git(root, ['worktree', 'add', '--detach', requestedLinkedRoot, 'HEAD']);
		linkedRoot = realpathSync(requestedLinkedRoot);
	}
	const mainWorktreeId = canonicalHash({
		schemaVersion: 'science-challenge-linked-worktree/v1',
		gitDir: '.'
	});
	const planSha256 = hash('plan');
	const verificationSha256 = hash('verification');
	const priorCandidateSetSha256 = hash('candidate set');
	const objective = scienceChallengeVerificationRepairObjectiveIdentity({
		planSha256,
		verificationSha256,
		priorCandidateSetSha256
	});
	const execution = scienceChallengeVerificationRepairExecutionIdentity({
		...objective,
		model: 'chatgpt-gpt-5.6-sol',
		transport: 'llm-direct',
		responseMode: 'prompt-json',
		thinkingLevel: 'high',
		directPartSize: 8
	});
	const directChildLineage = {
		schemaVersion: 'science-challenge-review-rebase-direct-child-key/v2',
		reviewRebaseManifestSha256: hash('review rebase manifest'),
		reviewRebaseId: hash('review rebase id'),
		planSha256,
		basePlanSha256: hash('base plan'),
		b0CandidateSetSha256: priorCandidateSetSha256,
		sourceSnapshotSha256: hash('source snapshot'),
		curriculumEvidenceSha256: hash('curriculum evidence')
	};
	const directChildLineageKey = canonicalHash(directChildLineage);
	const authoritySha256 = hash('authority');
	const failedRootPath = 'tmp/science-challenges/failed-direct-s1';
	const child = {
		verificationSha256,
		authoritySha256,
		objectiveId: objective.objectiveId,
		executionId: execution.executionId,
		outputRoot: {
			worktreeId: mainWorktreeId,
			path: failedRootPath,
			canonicalPathSha256: canonicalHash({
				worktreeId: mainWorktreeId,
				path: failedRootPath
			})
		}
	};
	const reservationCore = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_RESERVATION_SCHEMA,
		state: 'pending',
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
		lineageKeySha256: directChildLineageKey,
		lineage: directChildLineage,
		child,
		evidenceBundleSha256: hash('direct child evidence bundle')
	};
	const directChildReservation = {
		...reservationCore,
		reservationSha256: canonicalHash(reservationCore)
	};
	const childEvidence = {
		worktreeId: mainWorktreeId,
		parentBindingSha256: hash('parent binding')
	};
	const commitCore = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_COMMIT_SCHEMA,
		state: 'committed',
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
		lineageKeySha256: directChildLineageKey,
		reservationSha256: directChildReservation.reservationSha256,
		childEvidence,
		childEvidenceSha256: canonicalHash(childEvidence)
	};
	const directChildCommit = {
		...commitCore,
		commitSha256: canonicalHash(commitCore)
	};
	const directChildPaths = seedDirectChildRegistry({
		commonDir,
		lineageKeySha256: directChildLineageKey,
		reservation: directChildReservation,
		commit: directChildCommit
	});
	const directChildRegistration = {
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
		lineageKeySha256: directChildLineageKey,
		reservationSha256: directChildReservation.reservationSha256
	};
	const successorPath = 'tmp/science-challenges/recovery-successor';
	const fixture = {
		base,
		root,
		linkedRoot,
		commonDir,
		mainWorktreeId,
		objective,
		execution,
		directChildLineage,
		directChildRegistration,
		directChildReservation,
		directChildCommit,
		directChildPaths,
		authoritySha256,
		failedRootPath,
		successorPath
	};
	const recoveryManifest = recoveryManifestFor(fixture, successorPath);
	fixture.options = {
		workspaceRoot: root,
		directChildRegistration,
		originalObjective: objective,
		originalExecution: execution,
		successorRoot: successorPath,
		recoveryManifest
	};
	return fixture;
}

function recoveryManifestFor(fixture, successorPath) {
	const recoveryObjective = {
		schemaVersion: 'science-challenge-review-rebase-infrastructure-recovery-objective/v1',
		originalObjectiveId: fixture.objective.objectiveId,
		reviewRebaseManifestSha256: fixture.directChildLineage.reviewRebaseManifestSha256,
		verificationSha256: fixture.objective.verificationSha256,
		authoritySha256: fixture.authoritySha256,
		failedRootPathSha256: canonicalHash(fixture.failedRootPath),
		failedRootTreeSha256: hash('failed root tree')
	};
	const recoveryId = canonicalHash(recoveryObjective);
	const recoveryIdentity = {
		schemaVersion: 'science-challenge-review-rebase-infrastructure-recovery-execution/v1',
		recoveryId,
		originalObjectiveId: fixture.objective.objectiveId,
		originalExecutionId: fixture.execution.executionId,
		reviewRebaseManifestSha256: fixture.directChildLineage.reviewRebaseManifestSha256,
		verificationSha256: fixture.objective.verificationSha256,
		authoritySha256: fixture.authoritySha256,
		failedRootPathSha256: canonicalHash(fixture.failedRootPath),
		failedRootTreeSha256: hash('failed root tree'),
		successorRootPathSha256: canonicalHash(successorPath)
	};
	return {
		schemaVersion: 'science-challenge-review-rebase-infrastructure-recovery/v1',
		recoveryId,
		recoveryExecutionId: canonicalHash(recoveryIdentity),
		recoveryObjective,
		recoveryIdentity,
		originalExecutionIdentity: fixture.execution,
		directChildRegistration: fixture.directChildRegistration,
		verificationRepairAuthoritySha256: fixture.authoritySha256,
		reviewRebase: {
			manifestSha256: fixture.directChildLineage.reviewRebaseManifestSha256,
			planSha256: fixture.directChildLineage.planSha256,
			candidateSetSha256: fixture.directChildLineage.b0CandidateSetSha256
		},
		verification: {
			summarySha256: fixture.objective.verificationSha256
		},
		failedRoot: {
			path: fixture.failedRootPath,
			pathSha256: canonicalHash(fixture.failedRootPath)
		},
		globalLedger: {
			objectiveId: fixture.objective.objectiveId,
			executionId: fixture.execution.executionId
		},
		successor: {
			path: successorPath,
			pathSha256: canonicalHash(successorPath)
		}
	};
}

function seedDirectChildRegistry({ commonDir, lineageKeySha256, reservation, commit }) {
	const root = path.join(
		commonDir,
		'codex-evidence',
		'science-challenge-review-rebase-child-registry',
		'v2'
	);
	const reservationSlot = path.join(root, 'reservation-slots', `${lineageKeySha256}.json`);
	const reservationReplica = path.join(
		root,
		'reservations',
		lineageKeySha256,
		`${reservation.reservationSha256}.json`
	);
	const commitSlot = path.join(root, 'commit-slots', `${lineageKeySha256}.json`);
	const commitReplica = path.join(root, 'commits', lineageKeySha256, `${commit.commitSha256}.json`);
	writeHardLinkedPair(reservationSlot, reservationReplica, reservation);
	writeHardLinkedPair(commitSlot, commitReplica, commit);
	return {
		root,
		reservationSlot,
		reservationReplica,
		commitSlot,
		commitReplica
	};
}

function writeHardLinkedPair(slot, replica, value) {
	mkdirSync(path.dirname(slot), { recursive: true });
	mkdirSync(path.dirname(replica), { recursive: true });
	writeFileSync(slot, `${stableStringify(value)}\n`, { mode: 0o444 });
	chmodSync(slot, 0o444);
	linkSync(slot, replica);
	assert.equal(lstatSync(slot).nlink, 2);
}

function stageSuccessor(
	fixture,
	{
		root = fixture.root,
		successorPath = fixture.successorPath,
		manifest = fixture.options.recoveryManifest
	} = {}
) {
	const successorRoot = path.join(root, ...successorPath.split('/'));
	mkdirSync(successorRoot, { recursive: true });
	const manifestPath = path.join(successorRoot, RECOVERY_MANIFEST_FILE);
	writeFileSync(manifestPath, `${stableStringify(manifest)}\n`);
	return manifestPath;
}

function recoveryRegistryRoot(fixture) {
	return path.join(
		fixture.commonDir,
		...SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_ROOT.split('/')
	);
}

function singleRegistryReservation(fixture) {
	const directory = path.join(recoveryRegistryRoot(fixture), 'reservations');
	const entries = readdirSync(directory);
	assert.equal(entries.length, 1);
	return path.join(directory, entries[0]);
}

function registryRecords(root) {
	return ['reservations', 'commits'].flatMap((directory) =>
		readdirSync(path.join(root, directory)).map((name) => {
			const filePath = path.join(root, directory, name);
			return {
				path: filePath,
				value: JSON.parse(readFileSync(filePath, 'utf8'))
			};
		})
	);
}

function treeNames(root) {
	const rows = [];
	const visit = (directory, prefix = '') => {
		for (const entry of readdirSync(directory, {
			withFileTypes: true
		}).sort((left, right) => left.name.localeCompare(right.name))) {
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			rows.push(relative);
			if (entry.isDirectory()) visit(path.join(directory, entry.name), relative);
		}
	};
	visit(root);
	return rows;
}

function spawnReservationProcess({ optionsPath, barrierPath, cwd }) {
	const script = `
		import { existsSync, readFileSync } from 'node:fs';
		import { reserveScienceChallengeReviewRebaseRecoveryContinuation } from ${JSON.stringify(
			pathToFileURL(modulePath).href
		)};
		const options = JSON.parse(readFileSync(${JSON.stringify(optionsPath)}, 'utf8'));
		while (!existsSync(${JSON.stringify(barrierPath)})) {
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
		}
		try {
			const result = reserveScienceChallengeReviewRebaseRecoveryContinuation(options);
			process.stdout.write(JSON.stringify(result));
		} catch (error) {
			process.stderr.write(error instanceof Error ? error.message : String(error));
			process.exitCode = 2;
		}
	`;
	const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
		cwd,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	return new Promise((resolve, reject) => {
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('close', (status) => resolve({ status, stdout, stderr }));
	});
}

function git(cwd, args) {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	}).trim();
}

function hash(label) {
	return canonicalHash({ label });
}
