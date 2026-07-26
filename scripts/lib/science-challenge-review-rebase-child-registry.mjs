import { execFileSync } from 'node:child_process';
import {
	closeSync,
	constants as fsConstants,
	existsSync,
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

import { canonicalHash, stableStringify } from './science-challenge-release.mjs';
import {
	buildScienceChallengeVerificationRepairAuthority,
	validateScienceChallengeVerificationRepairAuthority
} from './science-challenge-verification-repair-transaction.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA,
	readVerificationRepairExecutionMarker,
	scienceChallengeVerificationRepairExecutionIdentity
} from './science-challenge-verification-repair-lineage.mjs';

export const SCIENCE_CHALLENGE_REVIEW_REBASE_DIRECT_REPAIR_KIND = 'direct-b0-v1-to-s1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL =
	'git-common-dir:science-challenge-review-rebase-child-registry/v2';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_KEY_SCHEMA =
	'science-challenge-review-rebase-direct-child-key/v2';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_RESERVATION_SCHEMA =
	'science-challenge-review-rebase-direct-child-reservation/v2';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_COMMIT_SCHEMA =
	'science-challenge-review-rebase-direct-child-commit/v2';

const REGISTRY_COMMON_RELATIVE_PATH = [
	'codex-evidence',
	'science-challenge-review-rebase-child-registry',
	'v2'
];
const WORKTREE_SCHEMA = 'science-challenge-linked-worktree/v1';
const REVIEW_REBASE_MANIFEST_SCHEMA = 'science-challenge-review-rebase-manifest/v1';
const VERIFICATION_SUMMARY_SCHEMA = 'science-challenge-independent-verification-summary/v1';
const OBJECTIVE_SCHEMA = 'science-challenge-verification-repair-objective/v1';
const EXECUTION_SCHEMA = 'science-challenge-verification-repair-execution/v2';
const TRANSACTION_SCHEMA = 'science-challenge-verification-repair-attempt-transaction/v1';
const PARENT_SCHEMA = 'science-challenge-review-rebase-repair-parent/v1';
const EXECUTION_BINDING_FILENAME = 'execution.json';
const HASH = /^[a-f0-9]{64}$/u;
const SHARD = /^science-\d{3}$/u;
const OPTION_FIELDS = ['repairKind', 'workspaceRoot', 'evidence'];
const EVIDENCE_FIELDS = [
	'reviewRebaseManifest',
	'reviewRebasePlan',
	'basePlan',
	'b0Candidates',
	'sourceSnapshot',
	'curriculumEvidence',
	'verificationSummary',
	'verificationRepairAuthority',
	'executionIdentity',
	'outputRoot'
];
const LINEAGE_FIELDS = [
	'schemaVersion',
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'planSha256',
	'basePlanSha256',
	'b0CandidateSetSha256',
	'sourceSnapshotSha256',
	'curriculumEvidenceSha256'
];

/**
 * Authenticate the complete direct B0/V1/S1 input bundle.
 *
 * Mutating APIs accept this bundle, never caller-supplied lineage or child
 * hashes. Every identity stored in the shared registry is recomputed here.
 */
export function authenticateScienceChallengeReviewRebaseChildEvidence(options) {
	requireExactRecord(options, OPTION_FIELDS, 'Review-rebase child options');
	if (options.repairKind !== SCIENCE_CHALLENGE_REVIEW_REBASE_DIRECT_REPAIR_KIND) {
		throw new Error('Child registry accepts only direct B0/V1/S1 repairs.');
	}
	requireExactRecord(options.evidence, EVIDENCE_FIELDS, 'Direct-child evidence bundle');
	const context = resolveGitAuthority(options.workspaceRoot);
	const evidence = options.evidence;
	const manifest = requireRecord(evidence.reviewRebaseManifest, 'Review-rebase manifest');
	const plan = requireRecord(evidence.reviewRebasePlan, 'Review-rebase plan');
	const basePlan = requireRecord(evidence.basePlan, 'Review-rebase base plan');
	const sourceSnapshot = requireRecord(evidence.sourceSnapshot, 'Source snapshot');
	const curriculumEvidence = requireRecord(evidence.curriculumEvidence, 'Curriculum evidence');
	const candidates = requireOrderedCandidates(evidence.b0Candidates, plan);
	const manifestSha256 = canonicalHash(manifest);
	const planSha256 = canonicalHash(plan);
	const basePlanSha256 = canonicalHash(basePlan);
	const candidateSetSha256 = canonicalHash(candidates);
	const sourceSnapshotSha256 = canonicalHash(sourceSnapshot);
	const curriculumEvidenceSha256 = canonicalHash(curriculumEvidence);
	validateReviewRebaseManifest({
		manifest,
		manifestSha256,
		planSha256,
		basePlanSha256,
		candidateSetSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256
	});

	const verificationSummary = requireRecord(
		evidence.verificationSummary,
		'V1 verification summary'
	);
	validateVerificationSummary({
		summary: verificationSummary,
		manifest,
		manifestSha256,
		planSha256,
		basePlanSha256,
		candidateSetSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256
	});
	const verificationSha256 = canonicalHash(verificationSummary);
	const derivedAuthority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary,
		reviewRebaseManifest: manifest,
		suppliedAuthority: evidence.verificationRepairAuthority
	});
	const authorityValidation = validateScienceChallengeVerificationRepairAuthority({
		authority: derivedAuthority,
		verificationSummary,
		reviewRebaseManifest: manifest
	});
	if (authorityValidation.status !== 'passed') {
		throw new Error(
			`Direct-child authority replay failed: ${authorityValidation.issues.join(' ')}`
		);
	}
	const authoritySha256 = canonicalHash(derivedAuthority);
	const suppliedExecution = requireRecord(
		evidence.executionIdentity,
		'Verification-repair execution identity'
	);
	const executionIdentity = scienceChallengeVerificationRepairExecutionIdentity({
		planSha256,
		verificationSha256,
		priorCandidateSetSha256: candidateSetSha256,
		model: suppliedExecution.model,
		transport: suppliedExecution.transport,
		responseMode: suppliedExecution.responseMode,
		thinkingLevel: suppliedExecution.thinkingLevel,
		directPartSize: suppliedExecution.directPartSize
	});
	if (canonicalHash(executionIdentity) !== canonicalHash(suppliedExecution)) {
		throw new Error('Supplied verification-repair execution identity differs from recomputation.');
	}
	const outputRoot = resolveEvidenceOutputRoot(
		context,
		context.invokingWorktree,
		evidence.outputRoot
	);
	const lineage = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_KEY_SCHEMA,
		reviewRebaseManifestSha256: manifestSha256,
		reviewRebaseId: manifest.rebaseId,
		planSha256,
		basePlanSha256,
		b0CandidateSetSha256: candidateSetSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256
	};
	const lineageKeySha256 = canonicalHash(lineage);
	const child = {
		verificationSha256,
		authoritySha256,
		objectiveId: executionIdentity.objectiveId,
		executionId: executionIdentity.executionId,
		outputRoot: outputRoot.logical
	};
	const evidenceBundleSha256 = canonicalHash({
		reviewRebaseManifest: manifest,
		reviewRebasePlan: plan,
		basePlan,
		b0Candidates: candidates,
		sourceSnapshot,
		curriculumEvidence,
		verificationSummary,
		verificationRepairAuthority: derivedAuthority,
		executionIdentity
	});
	const reservationCore = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_RESERVATION_SCHEMA,
		state: 'pending',
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
		lineageKeySha256,
		lineage,
		child,
		evidenceBundleSha256
	};
	const reservation = {
		...reservationCore,
		reservationSha256: canonicalHash(reservationCore)
	};
	const authenticated = {
		status: 'passed',
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
		lineageKeySha256,
		reservationSha256: reservation.reservationSha256,
		reservation,
		lineage,
		child,
		diagnostics: publicGitDiagnostics(context)
	};
	Object.defineProperty(authenticated, '_internal', {
		enumerable: false,
		value: {
			context,
			outputRoot,
			manifest,
			plan,
			basePlan,
			candidates,
			sourceSnapshot,
			curriculumEvidence,
			verificationSummary,
			authority: derivedAuthority,
			executionIdentity
		}
	});
	return authenticated;
}

/**
 * Pure inspection used by generator dry-runs and pre-reservation gates.
 */
export function inspectScienceChallengeReviewRebaseChildRegistration(options) {
	const authenticated = authenticateScienceChallengeReviewRebaseChildEvidence(options);
	const state = readRegistryState(authenticated, { repair: false });
	const discovery = discoverDirectChildren(authenticated);
	return planRegistration(authenticated, state, discovery);
}

/**
 * Atomically reserve the single direct-child slot. This writes a pending
 * reservation only; it never claims the S1 is committed before parent/objective
 * evidence exists.
 */
export function reserveScienceChallengeReviewRebaseChild(options) {
	const authenticated = authenticateScienceChallengeReviewRebaseChildEvidence(options);
	const before = planRegistration(
		authenticated,
		readRegistryState(authenticated, { repair: false }),
		discoverDirectChildren(authenticated)
	);
	if (before.action === 'committed') {
		return planRegistration(
			authenticated,
			readRegistryState(authenticated, { repair: true }),
			discoverDirectChildren(authenticated)
		);
	}
	if (
		!['create', 'resume', 'backfill', 'commit-ready', 'seed-ready', 'backfill-seed-ready'].includes(
			before.action
		)
	) {
		throw new Error(`Unsupported child reservation action ${String(before.action)}.`);
	}
	publishReservation(authenticated);
	const after = planRegistration(
		authenticated,
		readRegistryState(authenticated, { repair: true }),
		discoverDirectChildren(authenticated)
	);
	return {
		...serializedResult(authenticated),
		status: 'pending',
		action: ['commit-ready', 'backfill', 'seed-ready', 'backfill-seed-ready'].includes(after.action)
			? after.action
			: 'reserved'
	};
}

/**
 * Commit a pending reservation only after exact S1 parent/objective/execution
 * evidence is discoverable in one linked worktree.
 */
export function commitScienceChallengeReviewRebaseChild(options) {
	const authenticated = authenticateScienceChallengeReviewRebaseChildEvidence(options);
	const discoveryBeforeWrite = discoverDirectChildren(authenticated);
	const stateBeforeWrite = readRegistryState(authenticated, { repair: false });
	const planned = planRegistration(authenticated, stateBeforeWrite, discoveryBeforeWrite);
	if (planned.action === 'committed') {
		return planRegistration(
			authenticated,
			readRegistryState(authenticated, { repair: true }),
			discoverDirectChildren(authenticated)
		);
	}
	if (!['backfill', 'commit-ready'].includes(planned.action)) {
		throw new Error('Direct-child reservation cannot commit before exact S1 evidence is seeded.');
	}
	publishReservation(authenticated);
	const discovery = discoverDirectChildren(authenticated);
	const childEvidence = requireExactDiscoveredChild(authenticated, discovery);
	const commit = buildCommit(authenticated, childEvidence);
	publishCommit(authenticated, commit);
	const replay = planRegistration(
		authenticated,
		readRegistryState(authenticated, { repair: true }),
		discoverDirectChildren(authenticated)
	);
	if (replay.action !== 'committed') {
		throw new Error('Committed direct-child registry failed immediate replay.');
	}
	return replay;
}

/**
 * Convenience lifecycle:
 * - existing authenticated S1: reserve and commit (backfill);
 * - fresh S1: reserve pending and return so the caller can seed then commit.
 */
export function registerScienceChallengeReviewRebaseChild(options) {
	const reserved = reserveScienceChallengeReviewRebaseChild(options);
	if (reserved.action === 'committed') return reserved;
	const inspected = inspectScienceChallengeReviewRebaseChildRegistration(options);
	if (['backfill', 'commit-ready'].includes(inspected.action)) {
		return commitScienceChallengeReviewRebaseChild(options);
	}
	return reserved;
}

/**
 * Replay a registry row. A committed row is never trusted without current
 * authenticated parent/objective/execution evidence.
 */
export function readScienceChallengeReviewRebaseChildRegistration(options) {
	return inspectScienceChallengeReviewRebaseChildRegistration(options);
}

function planRegistration(authenticated, state, discovery) {
	const desired = authenticated.reservation;
	if (state.reservation) {
		if (canonicalHash(state.reservation) !== canonicalHash(desired)) {
			throw childConflict(desired, state.reservation);
		}
	}
	if (discovery.ambiguities.length) {
		throw new Error(
			`Direct-child evidence is ambiguous: ${discovery.ambiguities
				.map((row) => row.kind)
				.join(', ')}.`
		);
	}
	if (discovery.children.length > 1) {
		throw new Error('Multiple direct S1 children exist for one B0 review-rebase lineage.');
	}
	if (discovery.seedableChildren.length > 1) {
		throw new Error('Multiple unbound direct S1 children exist for one B0 review-rebase lineage.');
	}
	if (discovery.children.length === 1) {
		requireExactDiscoveredChild(authenticated, discovery);
	}
	if (discovery.seedableChildren.length === 1) {
		requireExactSeedableChild(authenticated, discovery);
	}
	if (discovery.children.length && discovery.seedableChildren.length) {
		throw new Error('Direct S1 evidence mixes bound and unbound children.');
	}
	if (state.commit) {
		if (!state.reservation) throw new Error('Committed child registry has no reservation.');
		validateCommitAgainstDiscovery(authenticated, state.commit, discovery);
		return {
			...serializedResult(authenticated, state.commit),
			status: 'committed',
			action: 'committed'
		};
	}
	if (state.reservation) {
		const commit =
			discovery.children.length === 1
				? buildCommit(authenticated, requireExactDiscoveredChild(authenticated, discovery))
				: null;
		return {
			...serializedResult(authenticated, commit),
			status: 'pending',
			action:
				discovery.children.length === 1
					? 'commit-ready'
					: discovery.seedableChildren.length === 1
						? 'seed-ready'
						: 'resume'
		};
	}
	if (discovery.children.length === 1) {
		const commit = buildCommit(
			authenticated,
			requireExactDiscoveredChild(authenticated, discovery)
		);
		return {
			...serializedResult(authenticated, commit),
			status: 'planned',
			action: 'backfill'
		};
	}
	if (discovery.seedableChildren.length === 1) {
		return {
			...serializedResult(authenticated),
			status: 'planned',
			action: 'backfill-seed-ready'
		};
	}
	if (authenticated._internal.outputRoot.exists) {
		throw new Error(
			'Pre-existing S1 output root lacks authenticated direct parent/objective evidence.'
		);
	}
	return {
		...serializedResult(authenticated),
		status: 'planned',
		action: 'create'
	};
}

function serializedResult(authenticated, commit = null) {
	return {
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
		lineageKeySha256: authenticated.lineageKeySha256,
		reservationSha256: authenticated.reservationSha256,
		...(commit ? { commitSha256: commit.commitSha256 } : {}),
		diagnostics: authenticated.diagnostics
	};
}

function buildCommit(authenticated, discovered) {
	const evidence = structuredClone(discovered.evidence);
	const core = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_COMMIT_SCHEMA,
		state: 'committed',
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL,
		lineageKeySha256: authenticated.lineageKeySha256,
		reservationSha256: authenticated.reservationSha256,
		childEvidence: evidence,
		childEvidenceSha256: canonicalHash(evidence)
	};
	return { ...core, commitSha256: canonicalHash(core) };
}

function validateCommitAgainstDiscovery(authenticated, commit, discovery) {
	validateCommit(commit, authenticated.lineageKeySha256);
	if (commit.reservationSha256 !== authenticated.reservationSha256) {
		throw new Error('Committed child registry targets another reservation.');
	}
	const discovered = requireExactDiscoveredChild(authenticated, discovery);
	if (
		commit.childEvidenceSha256 !== canonicalHash(discovered.evidence) ||
		canonicalHash(commit.childEvidence) !== canonicalHash(discovered.evidence)
	) {
		throw new Error('Committed child registry differs from authenticated S1 evidence.');
	}
}

function requireExactDiscoveredChild(authenticated, discovery) {
	if (discovery.children.length !== 1) {
		throw new Error('Exact committed S1 evidence is not present.');
	}
	const discovered = discovery.children[0];
	if (canonicalHash(discovered.child) !== canonicalHash(authenticated.child)) {
		throw childConflict(authenticated.reservation, { child: discovered.child });
	}
	return discovered;
}

function requireExactSeedableChild(authenticated, discovery) {
	if (discovery.seedableChildren.length !== 1) {
		throw new Error('Exact unbound S1 parent/objective evidence is not present.');
	}
	const seedable = discovery.seedableChildren[0];
	if (canonicalHash(seedable.child) !== canonicalHash(authenticated.child)) {
		throw childConflict(authenticated.reservation, { child: seedable.child });
	}
	return seedable;
}

function discoverDirectChildren(authenticated) {
	const { context } = authenticated._internal;
	const parents = [];
	for (const worktree of context.worktrees) {
		const searchRoot = path.join(worktree.root, 'tmp', 'science-challenges');
		if (!existsSync(searchRoot)) continue;
		requireSafeDirectoryChain(worktree.root, searchRoot, {
			allowMissingTail: false,
			label: 'science challenge discovery root'
		});
		for (const parentPath of findFilesNamed(searchRoot, 'verification-repair-parent.json')) {
			const parent = loadDirectParent(authenticated, worktree, parentPath);
			if (parent) parents.push(parent);
		}
	}
	const objectives = discoverMatchingObjectives(authenticated);
	const children = [];
	const seedableChildren = [];
	const ambiguities = [];
	const objectiveById = new Map();
	for (const objective of objectives) {
		const rows = objectiveById.get(objective.objective.objectiveId) ?? [];
		rows.push(objective);
		objectiveById.set(objective.objective.objectiveId, rows);
	}
	for (const parent of parents) {
		const objectiveId = objectiveIdFor({
			planSha256: parent.summary.planSha256,
			verificationSha256: parent.parent.verificationSummarySha256,
			priorCandidateSetSha256: parent.summary.candidateSetSha256
		});
		const matches = objectiveById.get(objectiveId) ?? [];
		if (matches.length !== 1) {
			ambiguities.push({
				kind: matches.length ? 'duplicate-objective-ledgers' : 'missing-objective-ledger',
				objectiveId
			});
			continue;
		}
		const objective = matches[0];
		const roots = new Map();
		for (const transaction of objective.transactions) {
			const key = canonicalHash(transaction.outputRoot.logical);
			const rows = roots.get(key) ?? [];
			rows.push(transaction);
			roots.set(key, rows);
		}
		if (roots.size > 1) {
			ambiguities.push({ kind: 'objective-with-multiple-output-roots', objectiveId });
			continue;
		}
		const transactions = roots.size === 1 ? [...roots.values()][0] : [];
		const executionBinding = objective.executionBinding;
		if (
			executionBinding &&
			canonicalHash(executionBinding.outputRoot.logical) !==
				canonicalHash(parent.outputRoot.logical)
		) {
			ambiguities.push({ kind: 'execution-parent-output-mismatch', objectiveId });
			continue;
		}
		if (
			transactions.length > 0 &&
			canonicalHash(transactions[0].outputRoot.logical) !== canonicalHash(parent.outputRoot.logical)
		) {
			ambiguities.push({ kind: 'objective-parent-output-mismatch', objectiveId });
			continue;
		}
		const executionIds = [
			...new Set(transactions.map((row) => row.value.executionIdentity.executionId))
		];
		if (executionIds.length > 1) {
			ambiguities.push({ kind: 'objective-with-multiple-executions', objectiveId });
			continue;
		}
		if (
			executionBinding &&
			transactions.length > 0 &&
			(canonicalHash(executionBinding.value.executionIdentity) !==
				canonicalHash(transactions[0].value.executionIdentity) ||
				canonicalHash(executionBinding.outputRoot.logical) !==
					canonicalHash(transactions[0].outputRoot.logical))
		) {
			ambiguities.push({ kind: 'execution-attempt-evidence-mismatch', objectiveId });
			continue;
		}
		if (!executionBinding && transactions.length === 0) {
			seedableChildren.push(buildSeedableChild(authenticated, parent, objective));
			continue;
		}
		const executionIdentity =
			executionBinding?.value.executionIdentity ?? transactions[0].value.executionIdentity;
		const child = {
			verificationSha256: parent.parent.verificationSummarySha256,
			authoritySha256: parent.parent.verificationRepairAuthoritySha256,
			objectiveId,
			executionId: executionIdentity.executionId,
			outputRoot: parent.outputRoot.logical
		};
		const evidence = {
			worktreeId: parent.outputRoot.logical.worktreeId,
			parentBindingSha256: canonicalHash(parent.parent),
			reviewRebaseManifestSha256: canonicalHash(parent.reviewRebaseManifest),
			verificationSummarySha256: canonicalHash(parent.summary),
			verificationAssignmentIndexSha256: canonicalHash(parent.assignmentIndex),
			objectiveSha256: canonicalHash(objective.objective),
			executionIdentitySha256: canonicalHash(executionIdentity),
			executionOutputBindingSha256: canonicalHash({
				executionIdentity,
				outputRoot: parent.outputRoot.logical
			})
		};
		children.push({ child, evidence });
	}
	children.sort((left, right) =>
		canonicalHash(left.child).localeCompare(canonicalHash(right.child))
	);
	seedableChildren.sort((left, right) =>
		canonicalHash(left.child).localeCompare(canonicalHash(right.child))
	);
	ambiguities.sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
	return { children, seedableChildren, ambiguities };
}

function buildSeedableChild(authenticated, parent, objective) {
	const executionIdentity = authenticated._internal.executionIdentity;
	return {
		child: {
			verificationSha256: parent.parent.verificationSummarySha256,
			authoritySha256: parent.parent.verificationRepairAuthoritySha256,
			objectiveId: objective.objective.objectiveId,
			executionId: executionIdentity.executionId,
			outputRoot: parent.outputRoot.logical
		},
		parent,
		objective,
		executionIdentity
	};
}

function loadDirectParent(authenticated, worktree, parentPath) {
	const parent = readCanonicalJson(parentPath, 'S1 parent binding');
	if (parent.schemaVersion !== PARENT_SCHEMA) return null;
	const lineage = authenticated.lineage;
	for (const [parentField, lineageField] of [
		['reviewRebaseManifestSha256', 'reviewRebaseManifestSha256'],
		['reviewRebaseId', 'reviewRebaseId'],
		['planSha256', 'planSha256'],
		['basePlanSha256', 'basePlanSha256'],
		['candidateSetSha256', 'b0CandidateSetSha256'],
		['sourceSnapshotSha256', 'sourceSnapshotSha256'],
		['curriculumEvidenceSha256', 'curriculumEvidenceSha256']
	]) {
		if (parent[parentField] !== lineage[lineageField]) return null;
	}
	for (const field of [
		'verificationSummarySha256',
		'verificationRepairAuthoritySha256',
		'verificationAssignmentIndexSha256'
	]) {
		requireHash(parent[field], `S1 parent ${field}`);
	}
	if (
		canonicalHash(parent.verificationRepairAuthority) !== parent.verificationRepairAuthoritySha256
	) {
		throw new Error('S1 parent authority bytes were rewritten.');
	}
	const reviewRebaseManifest = readBoundWorktreeJson(
		worktree,
		parent.reviewRebaseManifestPath,
		'S1 parent review-rebase manifest'
	);
	const summary = readBoundWorktreeJson(
		worktree,
		parent.verificationSummaryPath,
		'S1 parent verification summary'
	);
	const assignmentIndex = readBoundWorktreeJson(
		worktree,
		parent.verificationAssignmentIndexPath,
		'S1 parent verification assignment index'
	);
	if (
		canonicalHash(reviewRebaseManifest) !== parent.reviewRebaseManifestSha256 ||
		canonicalHash(summary) !== parent.verificationSummarySha256 ||
		canonicalHash(assignmentIndex) !== parent.verificationAssignmentIndexSha256
	) {
		throw new Error('S1 parent file bindings were rewritten.');
	}
	if (
		summary.reviewRebaseManifestSha256 !== parent.reviewRebaseManifestSha256 ||
		summary.reviewRebaseId !== parent.reviewRebaseId ||
		summary.planSha256 !== parent.planSha256 ||
		summary.candidateSetSha256 !== parent.candidateSetSha256
	) {
		throw new Error('S1 parent verification summary differs from B0 lineage.');
	}
	const replayedAuthority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary: summary,
		reviewRebaseManifest,
		suppliedAuthority: parent.verificationRepairAuthority
	});
	const authorityValidation = validateScienceChallengeVerificationRepairAuthority({
		authority: replayedAuthority,
		verificationSummary: summary,
		reviewRebaseManifest
	});
	if (
		authorityValidation.status !== 'passed' ||
		canonicalHash(replayedAuthority) !== parent.verificationRepairAuthoritySha256
	) {
		throw new Error('S1 parent verification-repair authority failed replay.');
	}
	const outputRoot = resolveEvidenceOutputRoot(
		authenticated._internal.context,
		worktree,
		path.dirname(parentPath)
	);
	return {
		parent,
		reviewRebaseManifest,
		summary,
		assignmentIndex,
		outputRoot
	};
}

function discoverMatchingObjectives(authenticated) {
	const rows = [];
	const lineage = authenticated.lineage;
	for (const worktree of authenticated._internal.context.worktrees) {
		const ledgerRoot = path.join(
			worktree.root,
			'tmp',
			'science-challenge-verification-repair-ledgers'
		);
		if (!existsSync(ledgerRoot)) continue;
		requireSafeDirectoryChain(worktree.root, ledgerRoot, {
			allowMissingTail: false,
			label: 'verification-repair ledger root'
		});
		for (const entry of readdirSync(ledgerRoot, { withFileTypes: true }).sort(compareEntry)) {
			if (entry.isSymbolicLink()) {
				throw new Error('Verification-repair ledger contains a symlink.');
			}
			if (!entry.isDirectory() || !HASH.test(entry.name)) {
				throw new Error('Verification-repair ledger contains an unexpected entry.');
			}
			const objectivePath = path.join(ledgerRoot, entry.name, 'objective.json');
			const objective = readCanonicalJson(objectivePath, 'Verification-repair objective');
			validateObjective(objective, entry.name);
			if (
				objective.planSha256 !== lineage.planSha256 ||
				objective.priorCandidateSetSha256 !== lineage.b0CandidateSetSha256
			) {
				continue;
			}
			const executionBindingPath = path.join(ledgerRoot, entry.name, EXECUTION_BINDING_FILENAME);
			const executionBinding = pathEntryExists(executionBindingPath)
				? {
						path: executionBindingPath,
						value: readCanonicalJson(executionBindingPath, 'Direct-child execution binding'),
						outputRoot: null
					}
				: null;
			if (executionBinding) {
				const replay = readVerificationRepairExecutionMarker({
					workspaceRoot: worktree.root,
					ledgerRoot: path.join(ledgerRoot, entry.name)
				});
				if (!replay || canonicalHash(replay.marker) !== canonicalHash(executionBinding.value)) {
					throw new Error('Direct-child execution marker failed lineage replay.');
				}
				validateExecutionBinding(executionBinding.value, objective);
				executionBinding.outputRoot = resolveEvidenceOutputRoot(
					authenticated._internal.context,
					worktree,
					replay.outputRoot
				);
			}
			const transactionRoot = path.join(ledgerRoot, entry.name, 'attempt-transactions');
			const transactions = [];
			if (existsSync(transactionRoot)) {
				for (const transactionEntry of readdirSync(transactionRoot, {
					withFileTypes: true
				}).sort(compareEntry)) {
					if (transactionEntry.name.startsWith('.') && transactionEntry.isFile()) continue;
					if (
						transactionEntry.isSymbolicLink() ||
						!transactionEntry.isFile() ||
						!transactionEntry.name.endsWith('.json')
					) {
						throw new Error('Attempt transaction ledger contains an unsafe entry.');
					}
					const transactionPath = path.join(transactionRoot, transactionEntry.name);
					const value = readCanonicalJson(
						transactionPath,
						'Verification-repair attempt transaction'
					);
					validateTransaction(value, objective);
					transactions.push({
						name: transactionEntry.name,
						value,
						outputRoot: resolveEvidenceOutputRoot(
							authenticated._internal.context,
							worktree,
							value.outputRootPath
						)
					});
				}
			}
			rows.push({
				objective,
				transactions,
				executionBinding,
				ledgerRoot: path.join(ledgerRoot, entry.name)
			});
		}
	}
	return rows;
}

function readRegistryState(authenticated, { repair }) {
	const paths = registryPaths(authenticated);
	const reservation = readReplicatedRecord({
		context: authenticated._internal.context,
		slotPath: paths.reservationSlot,
		replicaDirectory: paths.reservationReplicas,
		expectedLineageKey: authenticated.lineageKeySha256,
		kind: 'reservation',
		repair
	});
	const commit = readReplicatedRecord({
		context: authenticated._internal.context,
		slotPath: paths.commitSlot,
		replicaDirectory: paths.commitReplicas,
		expectedLineageKey: authenticated.lineageKeySha256,
		kind: 'commit',
		repair
	});
	return { reservation, commit };
}

function publishReservation(authenticated) {
	const paths = registryPaths(authenticated);
	publishReplicatedRecord({
		context: authenticated._internal.context,
		slotPath: paths.reservationSlot,
		replicaPath: path.join(paths.reservationReplicas, `${authenticated.reservationSha256}.json`),
		value: authenticated.reservation,
		label: 'direct-child reservation'
	});
}

function publishCommit(authenticated, commit) {
	const paths = registryPaths(authenticated);
	publishReplicatedRecord({
		context: authenticated._internal.context,
		slotPath: paths.commitSlot,
		replicaPath: path.join(paths.commitReplicas, `${commit.commitSha256}.json`),
		value: commit,
		label: 'direct-child commit'
	});
}

function registryPaths(authenticated) {
	const root = path.join(
		authenticated._internal.context.commonDir,
		...REGISTRY_COMMON_RELATIVE_PATH
	);
	const key = authenticated.lineageKeySha256;
	return {
		root,
		reservationSlot: path.join(root, 'reservation-slots', `${key}.json`),
		reservationReplicas: path.join(root, 'reservations', key),
		commitSlot: path.join(root, 'commit-slots', `${key}.json`),
		commitReplicas: path.join(root, 'commits', key)
	};
}

function readReplicatedRecord({
	context,
	slotPath,
	replicaDirectory,
	expectedLineageKey,
	kind,
	repair
}) {
	const slot = pathEntryExists(slotPath) ? readRegistryJson(slotPath, `${kind} slot`) : null;
	const replicas = [];
	if (existsSync(replicaDirectory)) {
		for (const entry of readdirSync(replicaDirectory, { withFileTypes: true }).sort(compareEntry)) {
			if (entry.name.startsWith('.') && entry.isFile()) continue;
			if (
				entry.isSymbolicLink() ||
				!entry.isFile() ||
				!HASH.test(entry.name.replace(/\.json$/u, '')) ||
				!entry.name.endsWith('.json')
			) {
				throw new Error(`Shared ${kind} replicas contain an unsafe entry.`);
			}
			const value = readRegistryJson(path.join(replicaDirectory, entry.name), `${kind} replica`);
			const hashField = kind === 'reservation' ? 'reservationSha256' : 'commitSha256';
			if (`${value[hashField]}.json` !== entry.name) {
				throw new Error(`Shared ${kind} replica filename differs from its content hash.`);
			}
			replicas.push({ value, path: path.join(replicaDirectory, entry.name) });
		}
	}
	if (replicas.length > 1) {
		throw new Error(`Shared ${kind} authority contains divergent replicas.`);
	}
	const replica = replicas[0] ?? null;
	for (const value of [slot, replica?.value].filter(Boolean)) {
		if (kind === 'reservation') validateReservation(value, expectedLineageKey);
		else validateCommit(value, expectedLineageKey);
	}
	if (slot && replica && canonicalHash(slot) !== canonicalHash(replica.value)) {
		throw new Error(`Shared ${kind} slot and replica bytes diverge.`);
	}
	const value = slot ?? replica?.value ?? null;
	if (repair && value) {
		const hashField = kind === 'reservation' ? 'reservationSha256' : 'commitSha256';
		const paths = registryPathsFromContext(context, expectedLineageKey);
		const expectedReplica =
			kind === 'reservation'
				? path.join(paths.reservationReplicas, `${value[hashField]}.json`)
				: path.join(paths.commitReplicas, `${value[hashField]}.json`);
		const expectedSlot = kind === 'reservation' ? paths.reservationSlot : paths.commitSlot;
		publishReplicatedRecord({
			context,
			slotPath: expectedSlot,
			replicaPath: expectedReplica,
			value,
			label: `direct-child ${kind}`
		});
	}
	return value;
}

function registryPathsFromContext(context, key) {
	const root = path.join(context.commonDir, ...REGISTRY_COMMON_RELATIVE_PATH);
	return {
		reservationSlot: path.join(root, 'reservation-slots', `${key}.json`),
		reservationReplicas: path.join(root, 'reservations', key),
		commitSlot: path.join(root, 'commit-slots', `${key}.json`),
		commitReplicas: path.join(root, 'commits', key)
	};
}

function publishReplicatedRecord({ context, slotPath, replicaPath, value, label }) {
	ensureDurableDirectory(context.commonDir, path.dirname(slotPath));
	ensureDurableDirectory(context.commonDir, path.dirname(replicaPath));
	const bytes = Buffer.from(`${stableStringify(value)}\n`);
	const existingSlot = pathEntryExists(slotPath)
		? readRegistryJson(slotPath, `${label} slot`)
		: null;
	const existingReplica = pathEntryExists(replicaPath)
		? readRegistryJson(replicaPath, `${label} replica`)
		: null;
	for (const existing of [existingSlot, existingReplica].filter(Boolean)) {
		if (canonicalHash(existing) !== canonicalHash(value)) {
			throw new Error(`Immutable ${label} differs from the requested value.`);
		}
	}
	if (!existingSlot && existingReplica) {
		linkOrVerify(replicaPath, slotPath, value, `${label} slot`);
	}
	if (existingSlot && !existingReplica) {
		linkOrVerify(slotPath, replicaPath, value, `${label} replica`);
	}
	if (pathEntryExists(slotPath) && pathEntryExists(replicaPath)) {
		verifyPublishedPair(slotPath, replicaPath, value, label);
		return;
	}
	const temporary = path.join(
		path.dirname(slotPath),
		`.${path.basename(slotPath)}.${process.pid}.${Date.now()}.tmp`
	);
	const descriptor = openSync(
		temporary,
		fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
		0o444
	);
	try {
		writeFileSync(descriptor, bytes);
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
	try {
		try {
			linkSync(temporary, slotPath);
			fsyncDirectory(path.dirname(slotPath));
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;
			const winner = readRegistryJson(slotPath, `${label} slot`);
			if (canonicalHash(winner) !== canonicalHash(value)) {
				throw new Error(`Another immutable ${label} won the shared slot.`, { cause: error });
			}
		}
		if (!pathEntryExists(replicaPath)) {
			linkOrVerify(slotPath, replicaPath, value, `${label} replica`);
		}
		verifyPublishedPair(slotPath, replicaPath, value, label);
	} finally {
		if (pathEntryExists(temporary)) unlinkSync(temporary);
	}
}

function linkOrVerify(sourcePath, targetPath, value, label) {
	try {
		linkSync(sourcePath, targetPath);
		fsyncDirectory(path.dirname(targetPath));
	} catch (error) {
		if (error?.code !== 'EEXIST') throw error;
		const winner = readRegistryJson(targetPath, label);
		if (canonicalHash(winner) !== canonicalHash(value)) {
			throw new Error(`Another immutable ${label} won publication.`, { cause: error });
		}
	}
}

function verifyPublishedPair(slotPath, replicaPath, value, label) {
	const slot = readRegistryJson(slotPath, `${label} slot`);
	const replica = readRegistryJson(replicaPath, `${label} replica`);
	if (
		canonicalHash(slot) !== canonicalHash(value) ||
		canonicalHash(replica) !== canonicalHash(value)
	) {
		throw new Error(`Published ${label} failed readback.`);
	}
}

function validateReservation(value, lineageKey) {
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
		value.lineageKeySha256 !== lineageKey
	) {
		throw new Error('Direct-child reservation authority is invalid.');
	}
	requireExactRecord(value.lineage, LINEAGE_FIELDS, 'Reservation lineage');
	if (canonicalHash(value.lineage) !== lineageKey) {
		throw new Error('Direct-child reservation lineage was rewritten.');
	}
	validateChild(value.child);
	requireHash(value.evidenceBundleSha256, 'Reservation evidence-bundle SHA-256');
	const { reservationSha256, ...core } = value;
	if (reservationSha256 !== canonicalHash(core)) {
		throw new Error('Direct-child reservation self-hash was rewritten.');
	}
}

function validateCommit(value, lineageKey) {
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
	if (
		value.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_COMMIT_SCHEMA ||
		value.state !== 'committed' ||
		value.authorityLabel !== SCIENCE_CHALLENGE_REVIEW_REBASE_CHILD_AUTHORITY_LABEL ||
		value.lineageKeySha256 !== lineageKey ||
		value.childEvidenceSha256 !== canonicalHash(value.childEvidence)
	) {
		throw new Error('Direct-child commit authority is invalid.');
	}
	for (const field of ['reservationSha256', 'childEvidenceSha256']) {
		requireHash(value[field], `Direct-child commit ${field}`);
	}
	const { commitSha256, ...core } = value;
	if (commitSha256 !== canonicalHash(core)) {
		throw new Error('Direct-child commit self-hash was rewritten.');
	}
}

function validateChild(child) {
	requireExactRecord(
		child,
		['verificationSha256', 'authoritySha256', 'objectiveId', 'executionId', 'outputRoot'],
		'Reservation child'
	);
	for (const field of ['verificationSha256', 'authoritySha256', 'objectiveId', 'executionId']) {
		requireHash(child[field], `Reservation child ${field}`);
	}
	requireExactRecord(
		child.outputRoot,
		['worktreeId', 'path', 'canonicalPathSha256'],
		'Reservation output root'
	);
	requireHash(child.outputRoot.worktreeId, 'Reservation output worktree id');
	const relative = normalizeRelativePath(child.outputRoot.path, 'Reservation output root');
	if (
		relative !== child.outputRoot.path ||
		child.outputRoot.canonicalPathSha256 !==
			canonicalHash({ worktreeId: child.outputRoot.worktreeId, path: relative })
	) {
		throw new Error('Reservation output-root binding was rewritten.');
	}
}

function validateReviewRebaseManifest({
	manifest,
	planSha256,
	basePlanSha256,
	candidateSetSha256,
	sourceSnapshotSha256,
	curriculumEvidenceSha256
}) {
	if (
		manifest.schemaVersion !== REVIEW_REBASE_MANIFEST_SCHEMA ||
		manifest.status !== 'review-pending' ||
		manifest.disposition !== 'deterministic-parent-bound-review-rebase' ||
		manifest.requiresFreshFullVerification !== true ||
		manifest.releaseEligible !== false ||
		manifest.planSha256 !== planSha256 ||
		manifest.basePlanSha256 !== basePlanSha256 ||
		manifest.candidateSetSha256 !== candidateSetSha256 ||
		manifest.sourceSnapshotSha256 !== sourceSnapshotSha256 ||
		manifest.curriculumEvidenceSha256 !== curriculumEvidenceSha256
	) {
		throw new Error('Review-rebase manifest differs from exact B0 inputs.');
	}
	for (const field of [
		'rebaseId',
		'collectionValidationSha256',
		'collectionRemediationSetSha256',
		'approvalSha256',
		'specSha256',
		'selectionSourceSetSha256'
	]) {
		requireHash(manifest[field], `Review-rebase manifest ${field}`);
	}
	if (
		canonicalHash(manifest.collectionRemediations ?? []) !== manifest.collectionRemediationSetSha256
	) {
		throw new Error('Review-rebase collection remediation set was rewritten.');
	}
	const expectedRebaseId = canonicalHash({
		schemaVersion: REVIEW_REBASE_MANIFEST_SCHEMA,
		basePlanSha256,
		planSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		parentVerificationSha256: manifest.parent?.verificationSha256,
		parentRepairSha256: manifest.parent?.repairSha256,
		approvalSha256: manifest.approvalSha256,
		specSha256: manifest.specSha256,
		selectionSourceSetSha256: manifest.selectionSourceSetSha256,
		candidateSetSha256,
		collectionValidationSha256: manifest.collectionValidationSha256
	});
	if (manifest.rebaseId !== expectedRebaseId) {
		throw new Error('Review-rebase id differs from deterministic recomputation.');
	}
}

function validateVerificationSummary({
	summary,
	manifest,
	manifestSha256,
	planSha256,
	basePlanSha256,
	candidateSetSha256,
	sourceSnapshotSha256,
	curriculumEvidenceSha256
}) {
	if (
		summary.schemaVersion !== VERIFICATION_SUMMARY_SCHEMA ||
		summary.status !== 'failed' ||
		!Array.isArray(summary.reviews) ||
		summary.reviewCount !== summary.reviews.length ||
		summary.planSha256 !== planSha256 ||
		summary.effectivePlanSha256 !== planSha256 ||
		summary.basePlanSha256 !== basePlanSha256 ||
		summary.candidateSetSha256 !== candidateSetSha256 ||
		summary.sourceSnapshotSha256 !== sourceSnapshotSha256 ||
		summary.curriculumEvidenceSha256 !== curriculumEvidenceSha256 ||
		summary.reviewRebaseManifestSha256 !== manifestSha256 ||
		summary.reviewRebaseId !== manifest.rebaseId ||
		summary.reviewRebaseCandidateSetSha256 !== candidateSetSha256
	) {
		throw new Error('V1 verification summary differs from exact B0 lineage.');
	}
}

function requireOrderedCandidates(value, plan) {
	if (
		!Array.isArray(value) ||
		!Array.isArray(plan.rows) ||
		value.length !== plan.rows.length ||
		value.some((candidate, index) => candidate?.definition?.id !== plan.rows[index]?.id)
	) {
		throw new Error('B0 candidates must match exact review-rebase plan order and membership.');
	}
	return structuredClone(value);
}

function resolveGitAuthority(workspaceRoot) {
	const workspace = requireCanonicalDirectory(workspaceRoot, 'Workspace root');
	const commonDir = requireCanonicalDirectory(
		git(workspace, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
		'Git common directory'
	);
	const blocks = parseWorktreePorcelain(git(workspace, ['worktree', 'list', '--porcelain']));
	const worktrees = [];
	const ignoredPrunable = [];
	for (const block of blocks) {
		if (!pathEntryExists(block.worktree)) {
			if (!block.prunable) {
				throw new Error('Git lists a missing non-prunable worktree.');
			}
			ignoredPrunable.push(canonicalHash(block.worktree));
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
	if (new Set(worktrees.map((row) => row.worktreeId)).size !== worktrees.length) {
		throw new Error('Linked worktree identities are not unique.');
	}
	const invokingWorktree = worktrees.find(
		(row) => workspace === row.root || workspace.startsWith(`${row.root}${path.sep}`)
	);
	if (!invokingWorktree) throw new Error('Invoking workspace is absent from Git worktree list.');
	const registryRoot = path.join(commonDir, ...REGISTRY_COMMON_RELATIVE_PATH);
	requireSafeDirectoryChain(commonDir, registryRoot, {
		allowMissingTail: true,
		label: 'Shared child registry root'
	});
	return {
		commonDir,
		registryRoot,
		worktrees,
		invokingWorktree,
		ignoredPrunableWorktreeCount: ignoredPrunable.length,
		ignoredPrunableWorktreeSetSha256: canonicalHash(ignoredPrunable.sort())
	};
}

function publicGitDiagnostics(context) {
	return {
		liveWorktreeCount: context.worktrees.length,
		liveWorktreeSetSha256: canonicalHash(
			context.worktrees.map((row) => ({
				worktreeId: row.worktreeId,
				gitDir: row.gitDirRelative
			}))
		),
		ignoredPrunableWorktreeCount: context.ignoredPrunableWorktreeCount,
		ignoredPrunableWorktreeSetSha256: context.ignoredPrunableWorktreeSetSha256
	};
}

function resolveEvidenceOutputRoot(context, defaultWorktree, requestedPath) {
	if (typeof requestedPath !== 'string' || !requestedPath.trim() || requestedPath.includes('\0')) {
		throw new Error('S1 output root must be a non-empty path.');
	}
	const absolute = path.isAbsolute(requestedPath)
		? path.resolve(requestedPath)
		: path.resolve(defaultWorktree.root, requestedPath);
	const matches = context.worktrees.filter((worktree) => {
		const fixedRoot = path.join(worktree.root, 'tmp', 'science-challenges');
		return absolute === fixedRoot || absolute.startsWith(`${fixedRoot}${path.sep}`);
	});
	if (matches.length !== 1) {
		throw new Error('S1 output root must belong to one linked worktree science-challenges root.');
	}
	const worktree = matches[0];
	const relative = normalizeRelativeWithin(worktree.root, absolute, 'S1 output root');
	requireSafeDirectoryChain(worktree.root, absolute, {
		allowMissingTail: true,
		label: 'S1 output root'
	});
	const exists = pathEntryExists(absolute);
	if (exists) {
		const stat = lstatSync(absolute);
		if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(absolute) !== absolute) {
			throw new Error('Existing S1 output root must be a canonical non-symlink directory.');
		}
	}
	return {
		absolute,
		exists,
		worktree,
		logical: {
			worktreeId: worktree.worktreeId,
			path: relative,
			canonicalPathSha256: canonicalHash({ worktreeId: worktree.worktreeId, path: relative })
		}
	};
}

function parseWorktreePorcelain(text) {
	const blocks = text
		.trim()
		.split(/\n\n+/u)
		.filter(Boolean)
		.map((raw) => {
			const result = {};
			for (const line of raw.split('\n')) {
				const separator = line.indexOf(' ');
				const key = separator === -1 ? line : line.slice(0, separator);
				const value = separator === -1 ? true : line.slice(separator + 1);
				result[key] = value;
			}
			if (typeof result.worktree !== 'string') {
				throw new Error('Git worktree porcelain record lacks a worktree path.');
			}
			return result;
		});
	if (!blocks.length) throw new Error('Git returned no linked worktrees.');
	return blocks;
}

function validateObjective(objective, directoryName) {
	requireExactRecord(
		objective,
		['schemaVersion', 'planSha256', 'verificationSha256', 'priorCandidateSetSha256', 'objectiveId'],
		'Verification-repair objective'
	);
	const { objectiveId, ...core } = objective;
	if (
		objective.schemaVersion !== OBJECTIVE_SCHEMA ||
		objectiveId !== canonicalHash(core) ||
		objectiveId !== directoryName
	) {
		throw new Error('Verification-repair objective identity was rewritten.');
	}
}

function validateExecutionBinding(binding, objective) {
	requireExactRecord(
		binding,
		[
			'schemaVersion',
			'executionIdentity',
			'executionIdentitySha256',
			'objectiveId',
			'executionId',
			'outputRootRelativePath',
			'outputRootBindingSha256'
		],
		'Verification-repair execution marker'
	);
	const identity = requireRecord(
		binding.executionIdentity,
		'Verification-repair execution marker identity'
	);
	const relative = normalizeRelativePath(
		binding.outputRootRelativePath,
		'Verification-repair execution marker output root'
	);
	if (
		binding.schemaVersion !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA ||
		binding.objectiveId !== objective.objectiveId ||
		binding.executionId !== identity.executionId ||
		binding.executionIdentitySha256 !== canonicalHash(identity) ||
		binding.outputRootRelativePath !== relative ||
		binding.outputRootBindingSha256 !==
			canonicalHash({ kind: 'repository-relative', path: relative })
	) {
		throw new Error('Verification-repair execution marker is invalid.');
	}
	const expected = scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: objective.planSha256,
		verificationSha256: objective.verificationSha256,
		priorCandidateSetSha256: objective.priorCandidateSetSha256,
		model: identity.model,
		transport: identity.transport,
		responseMode: identity.responseMode,
		thinkingLevel: identity.thinkingLevel,
		directPartSize: identity.directPartSize
	});
	if (canonicalHash(expected) !== canonicalHash(identity)) {
		throw new Error('Verification-repair execution marker identity was rewritten.');
	}
}

function validateTransaction(transaction, objective) {
	requireExactRecord(
		transaction,
		[
			'schemaVersion',
			'status',
			'objectiveId',
			'executionIdentity',
			'shardId',
			'attempt',
			'outputRootPath',
			'outputRootSha256'
		],
		'Verification-repair attempt transaction'
	);
	if (
		transaction.schemaVersion !== TRANSACTION_SCHEMA ||
		!['preparing', 'committed'].includes(transaction.status) ||
		transaction.objectiveId !== objective.objectiveId ||
		!SHARD.test(transaction.shardId) ||
		!Number.isInteger(transaction.attempt) ||
		transaction.attempt < 1 ||
		transaction.attempt > 4 ||
		transaction.outputRootSha256 !== canonicalHash(path.resolve(transaction.outputRootPath))
	) {
		throw new Error('Verification-repair attempt transaction is invalid.');
	}
	const identity = transaction.executionIdentity;
	requireRecord(identity, 'Verification-repair execution identity');
	if (
		identity.schemaVersion !== EXECUTION_SCHEMA ||
		identity.objectiveId !== objective.objectiveId ||
		identity.planSha256 !== objective.planSha256 ||
		identity.verificationSha256 !== objective.verificationSha256 ||
		identity.priorCandidateSetSha256 !== objective.priorCandidateSetSha256
	) {
		throw new Error('Attempt transaction execution identity differs from its objective.');
	}
	const expected = scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: objective.planSha256,
		verificationSha256: objective.verificationSha256,
		priorCandidateSetSha256: objective.priorCandidateSetSha256,
		model: identity.model,
		transport: identity.transport,
		responseMode: identity.responseMode,
		thinkingLevel: identity.thinkingLevel,
		directPartSize: identity.directPartSize
	});
	if (canonicalHash(expected) !== canonicalHash(identity)) {
		throw new Error('Attempt transaction execution identity was rewritten.');
	}
}

function objectiveIdFor({ planSha256, verificationSha256, priorCandidateSetSha256 }) {
	const core = {
		schemaVersion: OBJECTIVE_SCHEMA,
		planSha256,
		verificationSha256,
		priorCandidateSetSha256
	};
	return canonicalHash(core);
}

function readBoundWorktreeJson(worktree, relativePath, label) {
	const relative = normalizeRelativePath(relativePath, label);
	const absolute = path.resolve(worktree.root, relative);
	requireSafeDirectoryChain(worktree.root, absolute, {
		allowMissingTail: false,
		label,
		finalMayBeFile: true
	});
	return readCanonicalJson(absolute, label);
}

function readCanonicalJson(filePath, label) {
	const descriptor = openSync(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
	try {
		const before = fstatSync(descriptor);
		if (!before.isFile()) throw new Error(`${label} must be a regular file.`);
		const bytes = readFileSync(descriptor);
		const after = fstatSync(descriptor);
		const current = lstatSync(filePath);
		if (
			before.dev !== after.dev ||
			before.ino !== after.ino ||
			after.dev !== current.dev ||
			after.ino !== current.ino ||
			current.isSymbolicLink()
		) {
			throw new Error(`${label} changed during read.`);
		}
		const value = JSON.parse(bytes.toString('utf8'));
		if (!bytes.equals(Buffer.from(`${stableStringify(value)}\n`))) {
			throw new Error(`${label} bytes are not canonical.`);
		}
		return value;
	} finally {
		closeSync(descriptor);
	}
}

function readRegistryJson(filePath, label) {
	const stat = lstatSync(filePath);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o222) {
		throw new Error(`Shared ${label} must remain a read-only regular file.`);
	}
	return readCanonicalJson(filePath, `Shared ${label}`);
}

function ensureDurableDirectory(base, target) {
	const relative = normalizeRelativeWithin(base, target, 'Shared registry directory');
	let current = base;
	for (const segment of relative.split('/')) {
		const next = path.join(current, segment);
		if (!pathEntryExists(next)) {
			mkdirSync(next, { mode: 0o755 });
			fsyncDirectory(current);
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
		if (stat.isSymbolicLink()) throw new Error(`${label} contains a symlink.`);
		if (!stat.isDirectory() && !(final && finalMayBeFile && stat.isFile())) {
			throw new Error(`${label} contains a non-directory component.`);
		}
	}
}

function findFilesNamed(root, name) {
	const found = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort(compareEntry)) {
			const candidate = path.join(directory, entry.name);
			if (entry.isSymbolicLink()) throw new Error('Discovery tree contains a symlink.');
			if (entry.isDirectory()) visit(candidate);
			else if (entry.isFile() && entry.name === name) found.push(candidate);
		}
	};
	visit(root);
	return found;
}

function childConflict(requested, existing) {
	const conflicts = [];
	for (const field of ['verificationSha256', 'authoritySha256', 'objectiveId', 'executionId']) {
		if (requested.child?.[field] !== existing.child?.[field]) conflicts.push(field);
	}
	if (canonicalHash(requested.child?.outputRoot) !== canonicalHash(existing.child?.outputRoot)) {
		conflicts.push('outputRoot');
	}
	return new Error(
		`B0 review-rebase already has another direct child${
			conflicts.length ? ` (${conflicts.join(', ')})` : ''
		}.`
	);
}

function git(cwd, args) {
	return execFileSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	}).trim();
}

function requireCanonicalDirectory(value, label) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
	const resolved = path.resolve(value);
	if (!existsSync(resolved)) throw new Error(`${label} does not exist.`);
	const stat = lstatSync(resolved);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`${label} must be a non-symlink directory.`);
	}
	const real = realpathSync(resolved);
	if (real !== resolved) throw new Error(`${label} must use its canonical path.`);
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
