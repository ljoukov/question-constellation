import { execFileSync } from 'node:child_process';
import {
	closeSync,
	constants as fsConstants,
	fchmodSync,
	fstatSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	realpathSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
	SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_COMMIT_SCHEMA,
	SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_RESERVATION_SCHEMA
} from './science-challenge-review-rebase-child-registry.mjs';
import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';
import {
	scienceChallengeVerificationRepairExecutionIdentity,
	scienceChallengeVerificationRepairObjectiveIdentity
} from './science-challenge-verification-repair-lineage.mjs';

export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_AUTHORITY_LABEL =
	'git-common-dir:science-challenge-review-rebase-recovery-registry/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_KEY_SCHEMA =
	'science-challenge-review-rebase-recovery-continuation-key/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_RESERVATION_SCHEMA =
	'science-challenge-review-rebase-recovery-continuation-reservation/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_COMMIT_SCHEMA =
	'science-challenge-review-rebase-recovery-continuation-commit/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_ROOT =
	'codex-evidence/science-challenge-review-rebase-recovery-registry/v1';

const REGISTRY_COMMON_RELATIVE_PATH =
	SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_ROOT.split('/');
const DIRECT_CHILD_REGISTRY_COMMON_RELATIVE_PATH = [
	'codex-evidence',
	'science-challenge-review-rebase-child-registry',
	'v2'
];
const WORKTREE_SCHEMA = 'science-challenge-linked-worktree/v1';
const OBJECTIVE_SCHEMA = 'science-challenge-verification-repair-objective/v1';
const EXECUTION_SCHEMA = 'science-challenge-verification-repair-execution/v2';
const RECOVERY_MANIFEST_SCHEMA = 'science-challenge-review-rebase-infrastructure-recovery/v1';
const RECOVERY_OBJECTIVE_SCHEMA =
	'science-challenge-review-rebase-infrastructure-recovery-objective/v1';
const RECOVERY_EXECUTION_SCHEMA =
	'science-challenge-review-rebase-infrastructure-recovery-execution/v1';
const RECOVERY_MANIFEST_FILE = 'verification-repair-infrastructure-recovery.json';
const HASH = /^[a-f0-9]{64}$/u;

const OPTION_FIELDS = [
	'directChildRegistration',
	'dryRun',
	'originalExecution',
	'originalObjective',
	'recoveryManifest',
	'successorRoot',
	'workspaceRoot'
];
const REQUIRED_OPTION_FIELDS = OPTION_FIELDS.filter((field) => field !== 'dryRun');
const DIRECT_CHILD_REFERENCE_FIELDS = ['authorityLabel', 'lineageKeySha256', 'reservationSha256'];
const KEY_FIELDS = [
	'schemaVersion',
	'directChildAuthorityLabel',
	'directChildLineageKeySha256',
	'directChildReservationSha256',
	'directChildCommitSha256',
	'originalObjectiveId',
	'originalExecutionId'
];
const SUCCESSOR_FIELDS = [
	'worktreeId',
	'path',
	'canonicalPathSha256',
	'recoveryId',
	'recoveryExecutionId',
	'manifestSha256'
];

/**
 * Authenticate the exact committed B0/V1/S1 direct child, its original repair
 * objective/execution, and the deterministic typed recovery successor.
 *
 * Claimed recovery ids and hashes are always derived from the supplied
 * manifest. Absolute paths are retained only in the private, non-enumerable
 * runtime context.
 */
export function authenticateScienceChallengeReviewRebaseRecoveryContinuation(options) {
	validateOptions(options);
	const context = resolveGitAuthority(options.workspaceRoot);
	const directChildReference = validateDirectChildReference(options.directChildRegistration);
	const directChild = readAuthenticatedDirectChild(context, directChildReference);
	const originalObjective = validateOriginalObjective(options.originalObjective);
	const originalExecution = validateOriginalExecution(options.originalExecution, originalObjective);
	if (
		directChild.reservation.child.objectiveId !== originalObjective.objectiveId ||
		directChild.reservation.child.executionId !== originalExecution.executionId ||
		directChild.reservation.child.verificationSha256 !== originalObjective.verificationSha256 ||
		directChild.reservation.lineage.planSha256 !== originalObjective.planSha256 ||
		directChild.reservation.lineage.b0CandidateSetSha256 !==
			originalObjective.priorCandidateSetSha256
	) {
		throw new Error('Original objective or execution differs from the committed direct child.');
	}

	const successorRoot = resolveSuccessorRoot(
		context,
		context.invokingWorktree,
		options.successorRoot
	);
	const recoveryManifest = structuredClone(
		requireRecord(options.recoveryManifest, 'Recovery manifest')
	);
	validateRecoveryManifest({
		manifest: recoveryManifest,
		directChildReference,
		directChild,
		originalObjective,
		originalExecution,
		successorRoot
	});
	const manifestSha256 = canonicalHash(recoveryManifest);
	const lineage = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_KEY_SCHEMA,
		directChildAuthorityLabel: directChildReference.authorityLabel,
		directChildLineageKeySha256: directChildReference.lineageKeySha256,
		directChildReservationSha256: directChildReference.reservationSha256,
		directChildCommitSha256: directChild.commit.commitSha256,
		originalObjectiveId: originalObjective.objectiveId,
		originalExecutionId: originalExecution.executionId
	};
	const lineageKeySha256 = canonicalHash(lineage);
	const successor = {
		...successorRoot.logical,
		recoveryId: recoveryManifest.recoveryId,
		recoveryExecutionId: recoveryManifest.recoveryExecutionId,
		manifestSha256
	};
	const evidenceBundleSha256 = canonicalHash({
		directChildRegistration: directChildReference,
		directChildReservationSha256: directChild.reservation.reservationSha256,
		directChildCommitSha256: directChild.commit.commitSha256,
		originalObjective,
		originalExecution,
		recoveryManifest
	});
	const reservationCore = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_RESERVATION_SCHEMA,
		state: 'pending',
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_AUTHORITY_LABEL,
		lineageKeySha256,
		lineage,
		successor,
		evidenceBundleSha256
	};
	const reservation = {
		...reservationCore,
		reservationSha256: canonicalHash(reservationCore)
	};
	const authenticated = {
		status: 'passed',
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_AUTHORITY_LABEL,
		lineageKeySha256,
		reservationSha256: reservation.reservationSha256,
		directChildCommitSha256: directChild.commit.commitSha256,
		successor
	};
	Object.defineProperty(authenticated, '_internal', {
		enumerable: false,
		configurable: false,
		writable: false,
		value: {
			context,
			directChildReference,
			directChild,
			originalObjective,
			originalExecution,
			recoveryManifest,
			successorRoot,
			lineage,
			reservation
		}
	});
	return authenticated;
}

/**
 * Write-free replay and lifecycle planning. This is also the dry-run authority
 * used by every mutating entrypoint.
 */
export function inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(options) {
	const authenticated = authenticateScienceChallengeReviewRebaseRecoveryContinuation(options);
	return planRegistration(
		authenticated,
		readRegistryState(authenticated),
		discoverRecoverySuccessors(authenticated)
	);
}

/**
 * Atomically claim the single successor slot without claiming that its
 * manifest has already been staged.
 */
export function reserveScienceChallengeReviewRebaseRecoveryContinuation(options) {
	const authenticated = authenticateScienceChallengeReviewRebaseRecoveryContinuation(options);
	const before = planRegistration(
		authenticated,
		readRegistryState(authenticated),
		discoverRecoverySuccessors(authenticated)
	);
	if (options.dryRun === true || before.action === 'committed') {
		return options.dryRun === true ? { ...before, dryRun: true } : before;
	}
	if (!['create', 'resume', 'backfill', 'commit-ready'].includes(before.action)) {
		throw new Error(
			`Unsupported recovery-continuation reservation action ${String(before.action)}.`
		);
	}
	publishReservation(authenticated);
	const after = planRegistration(
		authenticated,
		readRegistryState(authenticated),
		discoverRecoverySuccessors(authenticated)
	);
	return {
		...serializedResult(authenticated),
		status: 'pending',
		action:
			after.action === 'backfill' || after.action === 'commit-ready' ? 'commit-ready' : 'reserved'
	};
}

/**
 * Commit only after one exact canonical recovery manifest is discoverable.
 * Backfill uses the same reservation-first ordering as a fresh lifecycle.
 */
export function commitScienceChallengeReviewRebaseRecoveryContinuation(options) {
	const authenticated = authenticateScienceChallengeReviewRebaseRecoveryContinuation(options);
	const before = planRegistration(
		authenticated,
		readRegistryState(authenticated),
		discoverRecoverySuccessors(authenticated)
	);
	if (options.dryRun === true) {
		if (!['backfill', 'commit-ready', 'committed'].includes(before.action)) {
			throw new Error(
				'Recovery-continuation reservation cannot commit before exact successor evidence is staged.'
			);
		}
		return { ...before, dryRun: true };
	}
	if (before.action === 'committed') return before;
	if (!['backfill', 'commit-ready'].includes(before.action)) {
		throw new Error(
			'Recovery-continuation reservation cannot commit before exact successor evidence is staged.'
		);
	}
	publishReservation(authenticated);
	const discovery = discoverRecoverySuccessors(authenticated);
	const discovered = requireExactDiscoveredSuccessor(authenticated, discovery);
	const commit = buildCommit(authenticated, discovered);
	publishCommit(authenticated, commit);
	const replay = planRegistration(
		authenticated,
		readRegistryState(authenticated),
		discoverRecoverySuccessors(authenticated)
	);
	if (replay.action !== 'committed') {
		throw new Error('Committed recovery-continuation registry failed immediate replay.');
	}
	return replay;
}

/**
 * Convenience lifecycle. Fresh successors stop after reservation; a uniquely
 * discoverable existing successor is backfilled through reservation and commit.
 */
export function registerScienceChallengeReviewRebaseRecoveryContinuation(options) {
	if (options?.dryRun === true) {
		return {
			...inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(options),
			dryRun: true
		};
	}
	const reserved = reserveScienceChallengeReviewRebaseRecoveryContinuation(options);
	if (reserved.action === 'committed') return reserved;
	const inspected = inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(options);
	if (['backfill', 'commit-ready'].includes(inspected.action)) {
		return commitScienceChallengeReviewRebaseRecoveryContinuation(options);
	}
	return reserved;
}

export function readScienceChallengeReviewRebaseRecoveryContinuationRegistration(options) {
	return inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(options);
}

function planRegistration(authenticated, state, discovery) {
	const desired = authenticated._internal.reservation;
	if (state.reservation && canonicalHash(state.reservation) !== canonicalHash(desired)) {
		throw recoveryConflict(desired, state.reservation);
	}
	if (discovery.length > 1) {
		throw new Error(
			'Multiple typed recovery-continuation successors exist for one committed direct child.'
		);
	}
	if (discovery.length === 1) {
		requireExactDiscoveredSuccessor(authenticated, discovery);
	}
	if (state.commit) {
		if (!state.reservation) {
			throw new Error('Committed recovery-continuation registry has no reservation.');
		}
		validateCommitAgainstDiscovery(authenticated, state.commit, discovery);
		return {
			...serializedResult(authenticated, state.commit),
			status: 'committed',
			action: 'committed'
		};
	}
	if (state.reservation) {
		const commit =
			discovery.length === 1
				? buildCommit(authenticated, requireExactDiscoveredSuccessor(authenticated, discovery))
				: null;
		return {
			...serializedResult(authenticated, commit),
			status: 'pending',
			action: discovery.length === 1 ? 'commit-ready' : 'resume'
		};
	}
	if (discovery.length === 1) {
		const commit = buildCommit(
			authenticated,
			requireExactDiscoveredSuccessor(authenticated, discovery)
		);
		return {
			...serializedResult(authenticated, commit),
			status: 'planned',
			action: 'backfill'
		};
	}
	if (authenticated._internal.successorRoot.exists) {
		throw new Error('Pre-existing recovery successor root lacks its exact authenticated manifest.');
	}
	return {
		...serializedResult(authenticated),
		status: 'planned',
		action: 'create'
	};
}

function serializedResult(authenticated, commit = null) {
	return {
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_AUTHORITY_LABEL,
		lineageKeySha256: authenticated.lineageKeySha256,
		reservationSha256: authenticated.reservationSha256,
		...(commit ? { commitSha256: commit.commitSha256 } : {}),
		successor: structuredClone(authenticated.successor)
	};
}

function buildCommit(authenticated, discovered) {
	const successorEvidence = structuredClone(discovered.evidence);
	const core = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_COMMIT_SCHEMA,
		state: 'committed',
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_AUTHORITY_LABEL,
		lineageKeySha256: authenticated.lineageKeySha256,
		reservationSha256: authenticated.reservationSha256,
		successorEvidence,
		successorEvidenceSha256: canonicalHash(successorEvidence)
	};
	return { ...core, commitSha256: canonicalHash(core) };
}

function validateCommitAgainstDiscovery(authenticated, commit, discovery) {
	validateRegistryCommit(commit, authenticated.lineageKeySha256);
	if (commit.reservationSha256 !== authenticated.reservationSha256) {
		throw new Error('Committed recovery-continuation record targets another reservation.');
	}
	const discovered = requireExactDiscoveredSuccessor(authenticated, discovery);
	if (
		commit.successorEvidenceSha256 !== canonicalHash(discovered.evidence) ||
		canonicalHash(commit.successorEvidence) !== canonicalHash(discovered.evidence)
	) {
		throw new Error(
			'Committed recovery-continuation record differs from current successor evidence.'
		);
	}
}

function requireExactDiscoveredSuccessor(authenticated, discovery) {
	if (discovery.length !== 1) {
		throw new Error('Exact recovery-continuation successor evidence is not present.');
	}
	const discovered = discovery[0];
	if (
		canonicalHash(discovered.successor) !== canonicalHash(authenticated.successor) ||
		canonicalHash(discovered.manifest) !== authenticated.successor.manifestSha256
	) {
		throw recoveryConflict(authenticated._internal.reservation, {
			successor: discovered.successor
		});
	}
	return discovered;
}

function discoverRecoverySuccessors(authenticated) {
	const discovered = [];
	const { context } = authenticated._internal;
	for (const worktree of context.worktrees) {
		const searchRoot = path.join(worktree.root, 'tmp', 'science-challenges');
		if (!pathEntryExists(searchRoot)) continue;
		requireSafeDirectoryChain(worktree.root, searchRoot, {
			allowMissingTail: false,
			label: 'Recovery discovery root'
		});
		for (const manifestPath of findFilesNamed(searchRoot, RECOVERY_MANIFEST_FILE)) {
			const loaded = readCanonicalJson(manifestPath, 'Recovery-continuation manifest', {
				rejectHardLinks: true
			});
			const manifest = loaded.value;
			if (manifest.schemaVersion !== RECOVERY_MANIFEST_SCHEMA) continue;
			if (!manifestTouchesLineage(authenticated, manifest)) continue;
			const successorRoot = resolveSuccessorRoot(context, worktree, path.dirname(manifestPath));
			validateRecoveryManifest({
				manifest,
				directChildReference: authenticated._internal.directChildReference,
				directChild: authenticated._internal.directChild,
				originalObjective: authenticated._internal.originalObjective,
				originalExecution: authenticated._internal.originalExecution,
				successorRoot
			});
			const manifestSha256 = canonicalHash(manifest);
			const successor = {
				...successorRoot.logical,
				recoveryId: manifest.recoveryId,
				recoveryExecutionId: manifest.recoveryExecutionId,
				manifestSha256
			};
			const manifestRelativePath = normalizeRelativeWithin(
				worktree.root,
				manifestPath,
				'Recovery manifest path'
			);
			const evidence = {
				worktreeId: worktree.worktreeId,
				manifestPath: manifestRelativePath,
				manifestSha256,
				manifestFileSha256: sha256(loaded.bytes),
				recoveryId: manifest.recoveryId,
				recoveryExecutionId: manifest.recoveryExecutionId
			};
			discovered.push({ manifest, successor, evidence });
		}
	}
	discovered.sort((left, right) =>
		stableStringify(left.evidence).localeCompare(stableStringify(right.evidence))
	);
	return discovered;
}

function manifestTouchesLineage(authenticated, manifest) {
	const reference = authenticated._internal.directChildReference;
	const objective = authenticated._internal.originalObjective;
	const execution = authenticated._internal.originalExecution;
	return (
		manifest.directChildRegistration?.lineageKeySha256 === reference.lineageKeySha256 ||
		manifest.directChildRegistration?.reservationSha256 === reference.reservationSha256 ||
		manifest.originalExecutionIdentity?.objectiveId === objective.objectiveId ||
		manifest.originalExecutionIdentity?.executionId === execution.executionId ||
		manifest.recoveryObjective?.originalObjectiveId === objective.objectiveId ||
		manifest.recoveryIdentity?.originalExecutionId === execution.executionId
	);
}

function validateRecoveryManifest({
	manifest,
	directChildReference,
	directChild,
	originalObjective,
	originalExecution,
	successorRoot
}) {
	if (manifest.schemaVersion !== RECOVERY_MANIFEST_SCHEMA) {
		throw new Error('Recovery manifest schema is invalid.');
	}
	for (const field of ['recoveryId', 'recoveryExecutionId']) {
		requireHash(manifest[field], `Recovery manifest ${field}`);
	}
	const recoveryObjective = requireRecord(manifest.recoveryObjective, 'Recovery objective');
	const recoveryIdentity = requireRecord(manifest.recoveryIdentity, 'Recovery execution identity');
	if (
		recoveryObjective.schemaVersion !== RECOVERY_OBJECTIVE_SCHEMA ||
		manifest.recoveryId !== canonicalHash(recoveryObjective) ||
		recoveryObjective.originalObjectiveId !== originalObjective.objectiveId ||
		recoveryObjective.verificationSha256 !== originalObjective.verificationSha256 ||
		recoveryObjective.authoritySha256 !== directChild.reservation.child.authoritySha256
	) {
		throw new Error('Recovery objective differs from the committed direct-child objective.');
	}
	if (
		recoveryIdentity.schemaVersion !== RECOVERY_EXECUTION_SCHEMA ||
		manifest.recoveryExecutionId !== canonicalHash(recoveryIdentity) ||
		recoveryIdentity.recoveryId !== manifest.recoveryId ||
		recoveryIdentity.originalObjectiveId !== originalObjective.objectiveId ||
		recoveryIdentity.originalExecutionId !== originalExecution.executionId ||
		recoveryIdentity.verificationSha256 !== originalObjective.verificationSha256 ||
		recoveryIdentity.authoritySha256 !== directChild.reservation.child.authoritySha256 ||
		recoveryIdentity.successorRootPathSha256 !== canonicalHash(successorRoot.logical.path)
	) {
		throw new Error(
			'Recovery execution identity differs from the original execution or successor path.'
		);
	}
	if (canonicalHash(manifest.originalExecutionIdentity) !== canonicalHash(originalExecution)) {
		throw new Error('Recovery manifest original execution identity was rewritten.');
	}
	if (
		canonicalHash(validateDirectChildReference(manifest.directChildRegistration)) !==
		canonicalHash(directChildReference)
	) {
		throw new Error('Recovery manifest direct-child registration differs from shared authority.');
	}
	const successor = requireRecord(manifest.successor, 'Recovery manifest successor');
	const successorPath = normalizeRelativePath(successor.path, 'Recovery manifest successor path');
	if (
		successorPath !== successorRoot.logical.path ||
		successor.pathSha256 !== canonicalHash(successorPath)
	) {
		throw new Error('Recovery manifest successor path binding is invalid.');
	}
	const failedRoot = requireRecord(manifest.failedRoot, 'Recovery manifest failed root');
	const failedRootPath = normalizeRelativePath(
		failedRoot.path,
		'Recovery manifest failed-root path'
	);
	if (
		failedRootPath !== directChild.reservation.child.outputRoot.path ||
		failedRoot.pathSha256 !== canonicalHash(failedRootPath)
	) {
		throw new Error('Recovery manifest failed root differs from the committed direct child.');
	}
	if (
		manifest.verificationRepairAuthoritySha256 !== directChild.reservation.child.authoritySha256
	) {
		throw new Error('Recovery manifest authority differs from the committed direct child.');
	}
	const reviewRebase = requireRecord(manifest.reviewRebase, 'Recovery manifest review rebase');
	if (
		reviewRebase.manifestSha256 !== directChild.reservation.lineage.reviewRebaseManifestSha256 ||
		reviewRebase.planSha256 !== directChild.reservation.lineage.planSha256 ||
		reviewRebase.candidateSetSha256 !== directChild.reservation.lineage.b0CandidateSetSha256
	) {
		throw new Error('Recovery manifest review-rebase lineage differs from the direct child.');
	}
	const verification = requireRecord(manifest.verification, 'Recovery manifest verification');
	if (verification.summarySha256 !== originalObjective.verificationSha256) {
		throw new Error('Recovery manifest verification differs from the original objective.');
	}
	const globalLedger = requireRecord(manifest.globalLedger, 'Recovery manifest global ledger');
	if (
		globalLedger.objectiveId !== originalObjective.objectiveId ||
		globalLedger.executionId !== originalExecution.executionId
	) {
		throw new Error('Recovery manifest global ledger differs from the original execution.');
	}
}

function validateOriginalObjective(value) {
	requireExactRecord(
		value,
		['schemaVersion', 'planSha256', 'verificationSha256', 'priorCandidateSetSha256', 'objectiveId'],
		'Original verification-repair objective'
	);
	if (value.schemaVersion !== OBJECTIVE_SCHEMA) {
		throw new Error('Original verification-repair objective schema is invalid.');
	}
	const recomputed = scienceChallengeVerificationRepairObjectiveIdentity({
		planSha256: value.planSha256,
		verificationSha256: value.verificationSha256,
		priorCandidateSetSha256: value.priorCandidateSetSha256
	});
	if (canonicalHash(recomputed) !== canonicalHash(value)) {
		throw new Error('Original verification-repair objective was rewritten.');
	}
	return structuredClone(value);
}

function validateOriginalExecution(value, objective) {
	requireExactRecord(
		value,
		[
			'schemaVersion',
			'planSha256',
			'verificationSha256',
			'priorCandidateSetSha256',
			'objectiveId',
			'model',
			'transport',
			'responseMode',
			'thinkingLevel',
			'directPartSize',
			'executionId'
		],
		'Original verification-repair execution'
	);
	if (value.schemaVersion !== EXECUTION_SCHEMA) {
		throw new Error('Original verification-repair execution schema is invalid.');
	}
	const recomputed = scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: objective.planSha256,
		verificationSha256: objective.verificationSha256,
		priorCandidateSetSha256: objective.priorCandidateSetSha256,
		model: value.model,
		transport: value.transport,
		responseMode: value.responseMode,
		thinkingLevel: value.thinkingLevel,
		directPartSize: value.directPartSize
	});
	if (canonicalHash(recomputed) !== canonicalHash(value)) {
		throw new Error('Original verification-repair execution was rewritten.');
	}
	return structuredClone(value);
}

function validateDirectChildReference(value) {
	requireExactRecord(value, DIRECT_CHILD_REFERENCE_FIELDS, 'Direct-child registration reference');
	if (value.authorityLabel !== SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL) {
		throw new Error('Direct-child registration authority is invalid.');
	}
	for (const field of ['lineageKeySha256', 'reservationSha256']) {
		requireHash(value[field], `Direct-child registration ${field}`);
	}
	return structuredClone(value);
}

function readAuthenticatedDirectChild(context, reference) {
	const root = path.join(context.commonDir, ...DIRECT_CHILD_REGISTRY_COMMON_RELATIVE_PATH);
	requireSafeDirectoryChain(context.commonDir, root, {
		allowMissingTail: false,
		label: 'Shared direct-child registry root'
	});
	const reservationSlot = path.join(
		root,
		'reservation-slots',
		`${reference.lineageKeySha256}.json`
	);
	const reservationReplica = path.join(
		root,
		'reservations',
		reference.lineageKeySha256,
		`${reference.reservationSha256}.json`
	);
	const reservation = readHardLinkedAuthorityPair({
		root,
		slotPath: reservationSlot,
		replicaPath: reservationReplica,
		label: 'Direct-child reservation'
	});
	validateDirectChildReservation(reservation, reference.lineageKeySha256);
	if (reservation.reservationSha256 !== reference.reservationSha256) {
		throw new Error('Direct-child registration reference targets another reservation.');
	}
	const commitSlot = path.join(root, 'commit-slots', `${reference.lineageKeySha256}.json`);
	const commitReplicaDirectory = path.join(root, 'commits', reference.lineageKeySha256);
	requireSafeDirectoryChain(root, commitReplicaDirectory, {
		allowMissingTail: false,
		label: 'Direct-child commit replicas'
	});
	const commitEntries = readdirSync(commitReplicaDirectory, {
		withFileTypes: true
	}).filter((entry) => !entry.name.startsWith('.'));
	if (
		commitEntries.length !== 1 ||
		commitEntries[0].isSymbolicLink() ||
		!commitEntries[0].isFile() ||
		!commitEntries[0].name.endsWith('.json')
	) {
		throw new Error('Committed direct-child authority must contain one exact commit replica.');
	}
	const commitReplica = path.join(commitReplicaDirectory, commitEntries[0].name);
	const commit = readHardLinkedAuthorityPair({
		root,
		slotPath: commitSlot,
		replicaPath: commitReplica,
		label: 'Direct-child commit'
	});
	validateDirectChildCommit(commit, reference.lineageKeySha256);
	if (
		`${commit.commitSha256}.json` !== commitEntries[0].name ||
		commit.reservationSha256 !== reservation.reservationSha256
	) {
		throw new Error('Direct-child commit differs from its reservation.');
	}
	return { reservation, commit };
}

function readHardLinkedAuthorityPair({ root, slotPath, replicaPath, label }) {
	for (const filePath of [slotPath, replicaPath]) {
		requireSafeDirectoryChain(root, filePath, {
			allowMissingTail: false,
			label,
			finalMayBeFile: true
		});
	}
	const slot = readCanonicalJson(slotPath, `${label} slot`);
	const replica = readCanonicalJson(replicaPath, `${label} replica`);
	const slotStat = lstatSync(slotPath);
	const replicaStat = lstatSync(replicaPath);
	if (
		slotStat.dev !== replicaStat.dev ||
		slotStat.ino !== replicaStat.ino ||
		slotStat.nlink !== 2 ||
		replicaStat.nlink !== 2 ||
		slotStat.mode & 0o222 ||
		replicaStat.mode & 0o222
	) {
		throw new Error(`${label} has missing, writable, divergent, or unexpected hard-link aliases.`);
	}
	if (canonicalHash(slot.value) !== canonicalHash(replica.value)) {
		throw new Error(`${label} slot and replica bytes diverge.`);
	}
	return slot.value;
}

function validateDirectChildReservation(value, lineageKeySha256) {
	requireExactRecord(
		value,
		[
			'schemaVersion',
			'state',
			'authorityLabel',
			'lineageKeySha256',
			'lineage',
			'child',
			'evidenceBundleSha256',
			'reservationSha256'
		],
		'Direct-child reservation'
	);
	if (
		value.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_RESERVATION_SCHEMA ||
		value.state !== 'pending' ||
		value.authorityLabel !== SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL ||
		value.lineageKeySha256 !== lineageKeySha256 ||
		canonicalHash(value.lineage) !== lineageKeySha256
	) {
		throw new Error('Direct-child reservation authority is invalid.');
	}
	const child = requireRecord(value.child, 'Direct-child reservation child');
	for (const field of ['verificationSha256', 'authoritySha256', 'objectiveId', 'executionId']) {
		requireHash(child[field], `Direct-child child ${field}`);
	}
	const outputRoot = requireRecord(child.outputRoot, 'Direct-child output root');
	const outputPath = normalizeRelativePath(outputRoot.path, 'Direct-child output-root path');
	if (
		!HASH.test(String(outputRoot.worktreeId ?? '')) ||
		outputRoot.canonicalPathSha256 !==
			canonicalHash({
				worktreeId: outputRoot.worktreeId,
				path: outputPath
			})
	) {
		throw new Error('Direct-child output-root binding is invalid.');
	}
	const { reservationSha256, ...core } = value;
	if (
		reservationSha256 !== canonicalHash(core) ||
		!HASH.test(String(value.evidenceBundleSha256 ?? ''))
	) {
		throw new Error('Direct-child reservation self-binding is invalid.');
	}
}

function validateDirectChildCommit(value, lineageKeySha256) {
	requireExactRecord(
		value,
		[
			'schemaVersion',
			'state',
			'authorityLabel',
			'lineageKeySha256',
			'reservationSha256',
			'childEvidence',
			'childEvidenceSha256',
			'commitSha256'
		],
		'Direct-child commit'
	);
	const { commitSha256, ...core } = value;
	if (
		value.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_COMMIT_SCHEMA ||
		value.state !== 'committed' ||
		value.authorityLabel !== SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL ||
		value.lineageKeySha256 !== lineageKeySha256 ||
		value.childEvidenceSha256 !== canonicalHash(value.childEvidence) ||
		commitSha256 !== canonicalHash(core)
	) {
		throw new Error('Direct-child commit authority is invalid.');
	}
	for (const field of ['reservationSha256', 'childEvidenceSha256', 'commitSha256']) {
		requireHash(value[field], `Direct-child commit ${field}`);
	}
}

function readRegistryState(authenticated) {
	const paths = registryPaths(authenticated);
	const reservation = pathEntryExists(paths.reservation)
		? readImmutableRegistryRecord(paths.reservation, 'Recovery-continuation reservation')
		: null;
	const commit = pathEntryExists(paths.commit)
		? readImmutableRegistryRecord(paths.commit, 'Recovery-continuation commit')
		: null;
	if (reservation) {
		validateRegistryReservation(reservation, authenticated.lineageKeySha256);
	}
	if (commit) {
		validateRegistryCommit(commit, authenticated.lineageKeySha256);
	}
	return { reservation, commit };
}

function publishReservation(authenticated) {
	const paths = registryPaths(authenticated);
	publishImmutableSlot({
		context: authenticated._internal.context,
		filePath: paths.reservation,
		value: authenticated._internal.reservation,
		label: 'Recovery-continuation reservation'
	});
}

function publishCommit(authenticated, commit) {
	const paths = registryPaths(authenticated);
	publishImmutableSlot({
		context: authenticated._internal.context,
		filePath: paths.commit,
		value: commit,
		label: 'Recovery-continuation commit'
	});
}

function registryPaths(authenticated) {
	const root = path.join(
		authenticated._internal.context.commonDir,
		...REGISTRY_COMMON_RELATIVE_PATH
	);
	const fileName = `${authenticated.lineageKeySha256}.json`;
	return {
		root,
		reservation: path.join(root, 'reservations', fileName),
		commit: path.join(root, 'commits', fileName)
	};
}

function publishImmutableSlot({ context, filePath, value, label }) {
	ensureDurableDirectory(context.commonDir, path.dirname(filePath));
	if (pathEntryExists(filePath)) {
		const existing = readImmutableRegistryRecord(filePath, label);
		if (canonicalHash(existing) !== canonicalHash(value)) {
			throw new Error(`Another immutable ${label} already owns the shared slot.`);
		}
		return;
	}
	const bytes = Buffer.from(`${stableStringify(value)}\n`);
	const temporary = path.join(
		path.dirname(filePath),
		`.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
	);
	const descriptor = openSync(
		temporary,
		fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
		0o444
	);
	try {
		fchmodSync(descriptor, 0o444);
		writeFileSync(descriptor, bytes);
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
	try {
		try {
			linkSync(temporary, filePath);
			fsyncDirectory(path.dirname(filePath));
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;
			const winner = readImmutableRegistryRecord(filePath, label);
			if (canonicalHash(winner) !== canonicalHash(value)) {
				throw new Error(`Another immutable ${label} won the shared slot.`, {
					cause: error
				});
			}
		}
	} finally {
		if (pathEntryExists(temporary)) unlinkSync(temporary);
	}
	const replay = readImmutableRegistryRecord(filePath, label);
	if (canonicalHash(replay) !== canonicalHash(value)) {
		throw new Error(`Published ${label} failed immediate readback.`);
	}
}

function readImmutableRegistryRecord(filePath, label) {
	let stat = lstatSync(filePath);
	if (
		stat.isFile() &&
		!stat.isSymbolicLink() &&
		stat.nlink === 2 &&
		hasActivePublicationAlias(filePath, stat)
	) {
		for (let retry = 0; retry < 50 && stat.nlink === 2; retry += 1) {
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
			stat = lstatSync(filePath);
		}
	}
	if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o222 || stat.nlink !== 1) {
		throw new Error(`${label} must remain one read-only regular file without hard-link aliases.`);
	}
	return readCanonicalJson(filePath, label).value;
}

function hasActivePublicationAlias(filePath, stat) {
	const prefix = `.${path.basename(filePath)}.`;
	for (const entry of readdirSync(path.dirname(filePath), {
		withFileTypes: true
	})) {
		if (
			!entry.isFile() ||
			entry.isSymbolicLink() ||
			!entry.name.startsWith(prefix) ||
			!entry.name.endsWith('.tmp')
		) {
			continue;
		}
		const candidate = lstatSync(path.join(path.dirname(filePath), entry.name));
		if (candidate.dev === stat.dev && candidate.ino === stat.ino) return true;
	}
	return false;
}

function validateRegistryReservation(value, lineageKeySha256) {
	requireExactRecord(
		value,
		[
			'schemaVersion',
			'state',
			'authorityLabel',
			'lineageKeySha256',
			'lineage',
			'successor',
			'evidenceBundleSha256',
			'reservationSha256'
		],
		'Recovery-continuation reservation'
	);
	if (
		value.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_RESERVATION_SCHEMA ||
		value.state !== 'pending' ||
		value.authorityLabel !== SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_AUTHORITY_LABEL ||
		value.lineageKeySha256 !== lineageKeySha256
	) {
		throw new Error('Recovery-continuation reservation authority is invalid.');
	}
	requireExactRecord(value.lineage, KEY_FIELDS, 'Recovery-continuation reservation lineage');
	if (canonicalHash(value.lineage) !== lineageKeySha256) {
		throw new Error('Recovery-continuation reservation lineage was rewritten.');
	}
	validateRegistrySuccessor(value.successor);
	requireHash(value.evidenceBundleSha256, 'Recovery-continuation evidence bundle');
	const { reservationSha256, ...core } = value;
	if (reservationSha256 !== canonicalHash(core)) {
		throw new Error('Recovery-continuation reservation self-hash was rewritten.');
	}
}

function validateRegistryCommit(value, lineageKeySha256) {
	requireExactRecord(
		value,
		[
			'schemaVersion',
			'state',
			'authorityLabel',
			'lineageKeySha256',
			'reservationSha256',
			'successorEvidence',
			'successorEvidenceSha256',
			'commitSha256'
		],
		'Recovery-continuation commit'
	);
	const { commitSha256, ...core } = value;
	if (
		value.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_COMMIT_SCHEMA ||
		value.state !== 'committed' ||
		value.authorityLabel !== SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_AUTHORITY_LABEL ||
		value.lineageKeySha256 !== lineageKeySha256 ||
		value.successorEvidenceSha256 !== canonicalHash(value.successorEvidence) ||
		commitSha256 !== canonicalHash(core)
	) {
		throw new Error('Recovery-continuation commit authority is invalid.');
	}
	for (const field of ['reservationSha256', 'successorEvidenceSha256', 'commitSha256']) {
		requireHash(value[field], `Recovery-continuation commit ${field}`);
	}
}

function validateRegistrySuccessor(value) {
	requireExactRecord(value, SUCCESSOR_FIELDS, 'Recovery-continuation successor');
	for (const field of ['worktreeId', 'recoveryId', 'recoveryExecutionId', 'manifestSha256']) {
		requireHash(value[field], `Recovery-continuation successor ${field}`);
	}
	const relative = normalizeRelativePath(value.path, 'Recovery-continuation successor path');
	if (
		relative !== value.path ||
		value.canonicalPathSha256 !== canonicalHash({ worktreeId: value.worktreeId, path: relative })
	) {
		throw new Error('Recovery-continuation successor path binding was rewritten.');
	}
}

function recoveryConflict(requested, existing) {
	const conflicts = [];
	for (const field of [
		'worktreeId',
		'path',
		'recoveryId',
		'recoveryExecutionId',
		'manifestSha256'
	]) {
		if (requested.successor?.[field] !== existing.successor?.[field]) {
			conflicts.push(field);
		}
	}
	return new Error(
		`Committed direct child already has another recovery continuation${
			conflicts.length ? ` (${conflicts.join(', ')})` : ''
		}.`
	);
}

function resolveGitAuthority(workspaceRoot) {
	const workspace = requireCanonicalDirectory(workspaceRoot, 'Workspace root');
	const commonDir = requireCanonicalDirectory(
		git(workspace, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
		'Git common directory'
	);
	const worktrees = [];
	for (const block of parseWorktreePorcelain(
		git(workspace, ['worktree', 'list', '--porcelain', '-z'])
	)) {
		if (!pathEntryExists(block.worktree)) {
			if (!block.prunable) {
				throw new Error('Git lists a missing non-prunable worktree.');
			}
			continue;
		}
		const root = requireCanonicalDirectory(block.worktree, 'Linked worktree root');
		const candidateCommon = requireCanonicalDirectory(
			git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
			'Linked worktree common directory'
		);
		if (candidateCommon !== commonDir) {
			throw new Error('Linked worktree resolves to another Git common directory.');
		}
		const gitDir = requireCanonicalDirectory(
			git(root, ['rev-parse', '--path-format=absolute', '--git-dir']),
			'Linked worktree Git directory'
		);
		const gitDirRelative =
			gitDir === commonDir
				? '.'
				: normalizeRelativeWithin(commonDir, gitDir, 'Linked worktree Git directory');
		const worktreeId = canonicalHash({
			schemaVersion: WORKTREE_SCHEMA,
			gitDir: gitDirRelative
		});
		worktrees.push({ root, worktreeId, gitDirRelative });
	}
	worktrees.sort((left, right) => left.worktreeId.localeCompare(right.worktreeId));
	if (
		worktrees.length === 0 ||
		new Set(worktrees.map((row) => row.worktreeId)).size !== worktrees.length
	) {
		throw new Error('Git worktree authority is empty or ambiguous.');
	}
	const invokingWorktree = worktrees.find(
		(row) => workspace === row.root || workspace.startsWith(`${row.root}${path.sep}`)
	);
	if (!invokingWorktree) {
		throw new Error('Invoking workspace is absent from Git worktree authority.');
	}
	const registryRoot = path.join(commonDir, ...REGISTRY_COMMON_RELATIVE_PATH);
	requireSafeDirectoryChain(commonDir, registryRoot, {
		allowMissingTail: true,
		label: 'Shared recovery-continuation registry root'
	});
	return { commonDir, worktrees, invokingWorktree };
}

function resolveSuccessorRoot(context, defaultWorktree, requestedPath) {
	if (typeof requestedPath !== 'string' || !requestedPath.trim() || requestedPath.includes('\0')) {
		throw new Error('Recovery successor root must be a non-empty path.');
	}
	const absolute = path.isAbsolute(requestedPath)
		? path.resolve(requestedPath)
		: path.resolve(defaultWorktree.root, requestedPath);
	const matches = context.worktrees.filter((worktree) => {
		const fixedRoot = path.join(worktree.root, 'tmp', 'science-challenges');
		return absolute.startsWith(`${fixedRoot}${path.sep}`);
	});
	if (matches.length !== 1) {
		throw new Error(
			'Recovery successor root must belong to one linked-worktree science-challenges root.'
		);
	}
	const worktree = matches[0];
	const relative = normalizeRelativeWithin(worktree.root, absolute, 'Recovery successor root');
	requireSafeDirectoryChain(worktree.root, absolute, {
		allowMissingTail: true,
		label: 'Recovery successor root'
	});
	const exists = pathEntryExists(absolute);
	if (exists) {
		const stat = lstatSync(absolute);
		if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(absolute) !== absolute) {
			throw new Error(
				'Existing recovery successor root must be a canonical non-symlink directory.'
			);
		}
	}
	return {
		absolute,
		exists,
		worktree,
		logical: {
			worktreeId: worktree.worktreeId,
			path: relative,
			canonicalPathSha256: canonicalHash({
				worktreeId: worktree.worktreeId,
				path: relative
			})
		}
	};
}

function parseWorktreePorcelain(text) {
	const blocks = text
		.split('\0\0')
		.map((block) => block.replace(/^\0+|\0+$/gu, ''))
		.filter(Boolean)
		.map((raw) => {
			const result = {};
			for (const line of raw.split('\0').filter(Boolean)) {
				const separator = line.indexOf(' ');
				const key = separator === -1 ? line : line.slice(0, separator);
				const value = separator === -1 ? true : line.slice(separator + 1);
				result[key] = value;
			}
			if (typeof result.worktree !== 'string') {
				throw new Error('Git worktree authority contains a record without a path.');
			}
			return result;
		});
	if (!blocks.length) {
		throw new Error('Git returned no linked worktrees.');
	}
	return blocks;
}

function findFilesNamed(root, name) {
	const found = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, {
			withFileTypes: true
		}).sort(compareEntry)) {
			const candidate = path.join(directory, entry.name);
			if (entry.isSymbolicLink()) {
				throw new Error('Recovery discovery tree contains a symlink.');
			}
			if (entry.isDirectory()) visit(candidate);
			else if (entry.isFile() && entry.name === name) found.push(candidate);
		}
	};
	visit(root);
	return found;
}

function readCanonicalJson(filePath, label, { rejectHardLinks = false } = {}) {
	const descriptor = openSync(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
	try {
		const before = fstatSync(descriptor);
		if (!before.isFile()) throw new Error(`${label} must be a regular file.`);
		if (rejectHardLinks && before.nlink !== 1) {
			throw new Error(`${label} has a hard-link alias.`);
		}
		const bytes = readFileSync(descriptor);
		const after = fstatSync(descriptor);
		const current = lstatSync(filePath);
		if (
			before.dev !== after.dev ||
			before.ino !== after.ino ||
			after.dev !== current.dev ||
			after.ino !== current.ino ||
			current.isSymbolicLink() ||
			(rejectHardLinks && current.nlink !== 1)
		) {
			throw new Error(`${label} changed during read.`);
		}
		const value = JSON.parse(bytes.toString('utf8'));
		if (!bytes.equals(Buffer.from(`${stableStringify(value)}\n`))) {
			throw new Error(`${label} bytes are not canonical.`);
		}
		return { value, bytes };
	} finally {
		closeSync(descriptor);
	}
}

function ensureDurableDirectory(base, target) {
	const relative = normalizeRelativeWithin(base, target, 'Shared registry directory');
	let current = base;
	for (const segment of relative.split('/')) {
		const next = path.join(current, segment);
		if (!pathEntryExists(next)) {
			try {
				mkdirSync(next, { mode: 0o755 });
				fsyncDirectory(current);
			} catch (error) {
				if (error?.code !== 'EEXIST') throw error;
			}
		}
		const stat = lstatSync(next);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error('Shared registry directory chain is unsafe.');
		}
		current = next;
	}
}

function requireSafeDirectoryChain(
	base,
	target,
	{ allowMissingTail, label, finalMayBeFile = false }
) {
	const relative = path.relative(base, path.resolve(target));
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`${label} escapes its authority root.`);
	}
	let current = base;
	const segments = relative ? relative.split(path.sep) : [];
	for (const [index, segment] of segments.entries()) {
		current = path.join(current, segment);
		if (!pathEntryExists(current)) {
			if (allowMissingTail) return;
			throw new Error(`${label} contains a missing component.`);
		}
		const stat = lstatSync(current);
		const final = index === segments.length - 1;
		if (stat.isSymbolicLink()) {
			throw new Error(`${label} contains a symlink.`);
		}
		if (!stat.isDirectory() && !(final && finalMayBeFile && stat.isFile())) {
			throw new Error(`${label} contains a non-directory component.`);
		}
	}
}

function fsyncDirectory(directory) {
	const descriptor = openSync(directory, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function pathEntryExists(value) {
	try {
		lstatSync(value);
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

function git(cwd, args) {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		}).replace(/\n$/u, '');
	} catch {
		throw new Error('Git authority query failed.');
	}
}

function requireCanonicalDirectory(value, label) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`${label} is required.`);
	}
	const resolved = path.resolve(value);
	if (!pathEntryExists(resolved)) throw new Error(`${label} does not exist.`);
	const stat = lstatSync(resolved);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`${label} must be a non-symlink directory.`);
	}
	const real = realpathSync(resolved);
	if (real !== resolved) {
		throw new Error(`${label} must use its canonical path.`);
	}
	return real;
}

function normalizeRelativeWithin(base, target, label) {
	const relative = path.relative(base, path.resolve(target)).split(path.sep).join('/');
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith('../') ||
		path.posix.isAbsolute(relative)
	) {
		throw new Error(`${label} must remain below its authority root.`);
	}
	return relative;
}

function normalizeRelativePath(value, label) {
	if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
		throw new Error(`${label} must be a relative path.`);
	}
	const portable = value.split('\\').join('/');
	if (portable.startsWith('/') || /^[a-zA-Z]:\//u.test(portable)) {
		throw new Error(`${label} must be relative.`);
	}
	const normalized = path.posix.normalize(portable);
	if (
		normalized === '.' ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		path.posix.isAbsolute(normalized)
	) {
		throw new Error(`${label} escapes its worktree.`);
	}
	return normalized;
}

function validateOptions(options) {
	requireRecord(options, 'Recovery-continuation registry options');
	for (const field of REQUIRED_OPTION_FIELDS) {
		if (!(field in options)) {
			throw new Error('Recovery-continuation registry options have incomplete fields.');
		}
	}
	for (const field of Object.keys(options)) {
		if (!OPTION_FIELDS.includes(field)) {
			throw new Error('Recovery-continuation registry options contain an unsupported field.');
		}
	}
	if (options.dryRun !== undefined && typeof options.dryRun !== 'boolean') {
		throw new Error('Recovery-continuation dryRun must be boolean.');
	}
}

function requireHash(value, label) {
	if (typeof value !== 'string' || !HASH.test(value)) {
		throw new Error(`${label} must be a lowercase SHA-256 hash.`);
	}
	return value;
}

function requireRecord(value, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value;
}

function requireExactRecord(value, fields, label) {
	requireRecord(value, label);
	if (canonicalHash(Object.keys(value).sort()) !== canonicalHash([...fields].sort())) {
		throw new Error(`${label} has incomplete or unsupported fields.`);
	}
	return value;
}

function compareEntry(left, right) {
	return left.name.localeCompare(right.name);
}
