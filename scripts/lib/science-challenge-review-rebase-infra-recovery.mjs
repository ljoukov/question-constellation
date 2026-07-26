import {
	closeSync,
	existsSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { readScienceChallengeReviewRebaseEvidence } from './science-challenge-review-rebase-evidence.mjs';
import { requireContentVerificationEvidence } from './science-challenge-review-evidence.mjs';
import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_DIRECT_REPAIR_KIND,
	inspectScienceChallengeReviewRebaseChildRegistration,
	registerScienceChallengeReviewRebaseChild
} from './science-challenge-review-rebase-child-registry.mjs';
import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_AUTHORITY_LABEL,
	SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_KEY_SCHEMA,
	commitScienceChallengeReviewRebaseRecoveryContinuation,
	inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration,
	reserveScienceChallengeReviewRebaseRecoveryContinuation
} from './science-challenge-review-rebase-recovery-registry.mjs';
import {
	SCIENCE_CHALLENGE_BATCH_SCHEMA,
	canonicalHash,
	challengeBatchOutputSchema,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';
import { validateScienceChallengeDirectPromptJsonRunPolicy } from './science-challenge-authoring-run-policy.mjs';
import {
	readScienceChallengeDirectMultipartEvidence,
	scienceChallengeMultipartPartPaths
} from './science-challenge-authoring-parts.mjs';
import {
	buildScienceChallengeVerificationRepairAuthority,
	inspectVerificationRepairAttempts,
	readVerificationRepairCohortState,
	readVerificationRepairPublication,
	recoverVerificationRepairPublication,
	verificationRepairTransactionRoot,
	validateVerificationRepairCandidate
} from './science-challenge-verification-repair-transaction.mjs';
import {
	inspectVerificationRepairExecutionAttempts,
	requireMatchingVerificationRepairAttemptLedgers,
	scienceChallengeVerificationRepairExecutionIdentity,
	scienceChallengeVerificationRepairObjectiveIdentity,
	verificationRepairExecutionLedgerRoot
} from './science-challenge-verification-repair-lineage.mjs';
import { validateScienceChallengeGeneratedBatch } from './science-challenge-batch-validation.mjs';

export const SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA =
	'science-challenge-review-rebase-infrastructure-recovery/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_PARENT_SCHEMA =
	'science-challenge-review-rebase-infrastructure-recovery-parent/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_PROPOSAL_SCHEMA =
	'science-challenge-review-rebase-infrastructure-recovery-proposal/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_INVOCATION_CLAIM_SCHEMA =
	'science-challenge-review-rebase-recovery-invocation-claim/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_INVOCATION_COMPLETION_SCHEMA =
	'science-challenge-review-rebase-recovery-invocation-completion/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_BINDING_FIELDS = Object.freeze(
	[
		'manifestPath',
		'manifestSha256',
		'recoveryId',
		'recoveryExecutionId',
		'failedRootInventorySha256',
		'logicalLedgerSha256',
		'preservedProposalSetSha256',
		'finalProposalSetSha256',
		'contentNamespaceId'
	]
);
export const SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_EFFECTIVE_COHORT_BINDING_FIELDS =
	SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_BINDING_FIELDS;
export const SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS = 4;
export const SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT = 4;

export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL = 'passed-proposal';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED = 'repair-required';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE =
	'frozen-nonmutable';

export const SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED =
	'validation-passed-terminal-proposal';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT =
	'strict-pre-model-infrastructure-exemption';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED =
	'content-bearing-or-indeterminate';

const MANIFEST_FILE = 'verification-repair-infrastructure-recovery.json';
const PARENT_FILE = 'verification-repair-infrastructure-recovery-parent.json';
const REPAIR_PARENT_FILE = 'verification-repair-parent.json';
const RECOVERY_PROPOSALS_DIRECTORY = 'recovery-proposals';
const RECOVERY_INVOCATIONS_DIRECTORY = 'infrastructure-recovery';
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_SHARD = /^[a-z0-9][a-z0-9-]*$/u;
const EMPTY_SHA256 = sha256(Buffer.alloc(0));
const RECOVERY_INVOCATION_DIRECTORY = /^recovery-content-attempt-(\d{2})-invocation-(\d{2})$/u;
const RECOVERY_INVOCATION_CLAIM_FIELDS = Object.freeze([
	'claimSha256',
	'executionId',
	'infrastructureInvocationOrdinal',
	'logicalContentOrdinal',
	'objectiveId',
	'priorInvocationSetSha256',
	'recoveryExecutionId',
	'recoveryManifestSha256',
	'schemaVersion',
	'shardId',
	'successorRootPathSha256'
]);
const RECOVERY_INVOCATION_COMPLETION_BASE_FIELDS = Object.freeze([
	'claimSha256',
	'classification',
	'completionSha256',
	'evidenceInventory',
	'evidenceInventorySha256',
	'infrastructureInvocationOrdinal',
	'logicalContentOrdinal',
	'recoveryExecutionId',
	'recoveryManifestSha256',
	'schemaVersion',
	'shardId'
]);
const RECOVERY_INVOCATION_COMPLETION_INDETERMINATE_FIELDS = Object.freeze([
	'indeterminate',
	'indeterminateReason'
]);
const ATTEMPT_TOP_LEVEL_EVIDENCE_FILES = Object.freeze([
	'events.jsonl',
	'last-message.json',
	'run-summary.json',
	'validation.json'
]);
const ATTEMPT_OPTIONAL_TOP_LEVEL_EVIDENCE_FILES = Object.freeze(['candidate.json']);
const TERMINAL_PROPOSAL_FIELDS = Object.freeze([
	'shardId',
	'origin',
	'logicalContentOrdinal',
	'candidatePath',
	'candidateSha256',
	'candidate',
	'validationPath',
	'validationSha256',
	'validation'
]);
const INCIDENT_RECOVERY_COUNTS = Object.freeze({
	shardCount: 51,
	[SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL]: 10,
	[SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED]: 39,
	[SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE]: 2,
	preModelExemptAttemptCount: 145,
	consumedLogicalContentAttemptCount: 28
});

/**
 * Replay and authenticate the complete B0 -> V1 -> failed S1 evidence plane.
 *
 * This function is deliberately write-free. It is the source of truth for dry-run,
 * staging, crash replay, and all later generator-facing recovery state.
 */
export function inspectScienceChallengeReviewRebaseInfrastructureRecovery(options) {
	const source = inspectRecoverySource(options);
	const successorRoot = resolveWorkspacePath(source.workspaceRoot, options.successorRoot, {
		label: 'recovery successor root',
		allowMissing: true,
		requireDirectory: true
	});
	if (!existsSync(successorRoot.absolutePath)) {
		const prepared = buildPreparedRecovery({
			source,
			successorRoot
		});
		const continuation = prepared._continuation;
		return {
			status: 'absent',
			action: 'successor-not-staged',
			...source,
			successorRoot: successorRoot.absolutePath,
			successorRootPath: successorRoot.relativePath,
			continuation,
			prepared
		};
	}
	const manifestPath = path.join(successorRoot.absolutePath, MANIFEST_FILE);
	const parentPath = path.join(successorRoot.absolutePath, PARENT_FILE);
	if (!existsSync(manifestPath) || !existsSync(parentPath)) {
		throw new Error(
			'Existing recovery successor root lacks its immutable manifest and recovery-parent binding.'
		);
	}
	const manifestLoaded = readCanonicalJsonFile(manifestPath, 'recovery manifest');
	const parentLoaded = readCanonicalJsonFile(parentPath, 'recovery parent binding');
	const prepared = buildPreparedRecovery({ source, successorRoot });
	const continuation = prepared._continuation;
	if (
		!['commit-direct-child-first', 'backfill', 'commit-ready', 'committed'].includes(
			continuation.action
		)
	) {
		throw new Error(
			'Existing recovery successor lacks its exact shared continuation-registry authority.'
		);
	}
	requireExactCanonicalValue(
		manifestLoaded.value,
		prepared.manifest,
		'recovery manifest differs from exact source replay'
	);
	requireExactCanonicalValue(
		parentLoaded.value,
		prepared.parentBinding,
		'recovery parent binding differs from exact source replay'
	);
	if (!manifestLoaded.bytes.equals(prepared.manifestBytes)) {
		throw new Error('Recovery manifest bytes are not the exact canonical replay.');
	}
	if (!parentLoaded.bytes.equals(prepared.parentBytes)) {
		throw new Error('Recovery parent-binding bytes are not the exact canonical replay.');
	}
	const successorTree = requireExactSuccessorTree({
		source,
		successorRoot,
		prepared,
		allowRecoveryInvocations: true
	});
	const state = buildRuntimeState({
		source,
		successorRoot,
		prepared,
		manifest: manifestLoaded.value
	});
	const downstream = inspectRecoveryDownstreamState(state);
	state.downstream = downstream;
	for (const shardId of [...state.shards.keys()].sort()) {
		inspectScienceChallengeReviewRebaseRecoveryInvocations({ state, shardId });
	}
	validateRecoveryTopLevelPhase({ state, downstream, successorTree });
	return {
		status: 'passed',
		action: 'replayed',
		...source,
		successorRoot: successorRoot.absolutePath,
		successorRootPath: successorRoot.relativePath,
		manifestPath,
		parentPath,
		manifest: manifestLoaded.value,
		manifestSha256: canonicalHash(manifestLoaded.value),
		recoveryExecutionId: manifestLoaded.value.recoveryExecutionId,
		phase: downstream.phase,
		resumeAction: downstream.resumeAction,
		continuation,
		downstream,
		state,
		prepared
	};
}

/**
 * Atomically seed a new successor. Dry-run performs the complete evidence replay
 * but writes neither the child registry nor the successor.
 *
 * A crash after the same-filesystem rename is replay-safe: a subsequent call
 * accepts only the exact manifest/tree that would have been staged.
 */
export function stageScienceChallengeReviewRebaseInfrastructureRecovery(options) {
	let inspected = inspectScienceChallengeReviewRebaseInfrastructureRecovery(options);
	if (options?.dryRun === true) {
		return {
			...inspected,
			status: 'planned',
			action:
				inspected.status === 'absent'
					? 'stage-successor'
					: inspected.resumeAction === 'recover-publication'
						? 'recover-interrupted-publication'
						: 'reuse-successor',
			dryRun: true,
			manifest: inspected.prepared.manifest,
			manifestSha256: canonicalHash(inspected.prepared.manifest),
			recoveryExecutionId: inspected.prepared.manifest.recoveryExecutionId,
			plannedWrites:
				inspected.status === 'absent'
					? plannedRecoveryWrites(inspected.prepared)
					: inspected.resumeAction === 'recover-publication'
						? [`${inspected.successorRootPath}/${inspected.downstream.transactionDirectory}/**`]
						: []
		};
	}
	if (inspected.resumeAction === 'recover-publication') {
		recoverVerificationRepairPublication({
			outputRoot: inspected.successorRoot,
			repairSha256: inspected.manifest.verification.summarySha256
		});
		inspected = inspectScienceChallengeReviewRebaseInfrastructureRecovery(options);
		if (inspected.resumeAction === 'recover-publication') {
			throw new Error('Interrupted recovery publication did not reach a replayable state.');
		}
	}
	if (inspected.status === 'passed') {
		const registration = registerDirectChild(inspected.sourceOptions);
		requireRegistrationMatchesPrepared(registration, inspected.prepared);
		reserveScienceChallengeReviewRebaseRecoveryContinuation(
			inspected.prepared._continuationOptions
		);
		const continuation = commitScienceChallengeReviewRebaseRecoveryContinuation(
			inspected.prepared._continuationOptions
		);
		return {
			...inspected,
			status: 'passed',
			action: 'reused',
			dryRun: false,
			registration,
			continuation
		};
	}

	const source = inspected;
	const prepared = inspected.prepared;
	const registration = registerDirectChild(source.sourceOptions);
	requireRegistrationMatchesPrepared(registration, prepared);
	reserveScienceChallengeReviewRebaseRecoveryContinuation(prepared._continuationOptions);
	const successorParent = path.dirname(prepared.successorRoot);
	requireSafeDirectoryChain(source.workspaceRoot, successorParent, {
		allowMissingTail: true,
		label: 'recovery successor parent'
	});
	mkdirSync(successorParent, { recursive: true });
	requireSafeDirectoryChain(source.workspaceRoot, successorParent, {
		allowMissingTail: false,
		label: 'recovery successor parent'
	});
	const temporary = mkdtempSync(
		path.join(successorParent, `.${path.basename(prepared.successorRoot)}.preparing-`)
	);
	try {
		writePreparedSuccessorTree({ temporary, prepared });
		if (existsSync(prepared.successorRoot)) {
			throw new Error('Recovery successor root appeared during atomic staging.');
		}
		renameSync(temporary, prepared.successorRoot);
		fsyncDirectory(successorParent);
	} catch (error) {
		if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
		throw error;
	}
	const replayed = inspectScienceChallengeReviewRebaseInfrastructureRecovery(options);
	if (replayed.status !== 'passed') {
		throw new Error('Recovery successor failed exact readback after atomic staging.');
	}
	const continuation = commitScienceChallengeReviewRebaseRecoveryContinuation(
		prepared._continuationOptions
	);
	return {
		...replayed,
		status: 'passed',
		action: 'created',
		dryRun: false,
		registration,
		continuation
	};
}

export function remainingScienceChallengeReviewRebaseLogicalSlots(state, shardId) {
	requireRecoveryStateShard(state, shardId);
	return inspectScienceChallengeReviewRebaseRecoveryInvocations({
		state,
		shardId
	}).remainingLogicalContentAttempts;
}

export function nextScienceChallengeReviewRebaseLogicalOrdinal(state, shardId) {
	requireRecoveryStateShard(state, shardId);
	return inspectScienceChallengeReviewRebaseRecoveryInvocations({
		state,
		shardId
	}).nextLogicalContentOrdinal;
}

/**
 * Replay every recovery-only invocation and require the terminal 49-proposal
 * mutable cohort (plus the two frozen B0 shards). The returned evidence-path
 * inventory is closed-world and suitable for archive/materializer binding.
 */
export function inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
	evidence,
	referenceRoot = null
}) {
	const state = recoveryStateFromEvidence(evidence);
	const workspaceRoot = state.source.workspaceRoot;
	if (referenceRoot !== null && path.resolve(referenceRoot) !== path.resolve(workspaceRoot)) {
		throw new Error(
			'Infrastructure recovery terminal referenceRoot must be the authenticated workspace root.'
		);
	}
	const finalProposals = [];
	const logicalLedgerShards = [];
	const pendingShardIds = [];
	for (const shard of [...state.shards.values()].sort((left, right) =>
		left.shardId.localeCompare(right.shardId)
	)) {
		if (shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE) {
			logicalLedgerShards.push({
				shardId: shard.shardId,
				status: shard.status,
				sourceAttempts: shard.sourceAttempts,
				recoveryInvocations: []
			});
			continue;
		}
		const invocations = inspectScienceChallengeReviewRebaseRecoveryInvocations({
			state,
			shardId: shard.shardId
		});
		const invalidations = recoveryInvalidationsForShard(state, shard.shardId);
		const invocationLedger = invocations.invocations.map((record) => {
			const invalidation = completionProposalInvalidation(state, record);
			return {
				logicalContentOrdinal: record.claim.logicalContentOrdinal,
				infrastructureInvocationOrdinal: record.claim.infrastructureInvocationOrdinal,
				claimSha256: canonicalHash(record.claim),
				completionSha256: record.completion ? canonicalHash(record.completion) : null,
				classification: record.completion?.classification ?? null,
				collectionInvalidation: invalidation ? structuredClone(invalidation) : null
			};
		});
		const terminal = [...invocations.invocations]
			.reverse()
			.find(
				(record) =>
					record.completion?.classification ===
						SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED &&
					completionProposalInvalidation(state, record) === null
			);
		const preserved =
			shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL &&
			sourceProposalInvalidation(state, shard) === null
				? resolvedPreservedProposal(state, shard)
				: null;
		const finalProposal = terminal ? resolvedInvocationProposal(state, terminal) : preserved;
		if (!finalProposal) pendingShardIds.push(shard.shardId);
		else finalProposals.push(finalProposal);
		logicalLedgerShards.push({
			shardId: shard.shardId,
			status: finalProposal ? 'terminal-passed-proposal' : 'pending',
			sourceAttempts: shard.sourceAttempts,
			collectionInvalidations: structuredClone(invalidations),
			recoveryInvocations: invocationLedger,
			...(finalProposal
				? {
						terminalProposalSha256: canonicalHash(finalProposal)
					}
				: {})
		});
	}
	finalProposals.sort((left, right) => left.shardId.localeCompare(right.shardId));
	for (const proposal of finalProposals) validateTerminalProposalRecord(proposal);
	const finalProposalOriginCounts = {
		'preserved-source-proposal': finalProposals.filter(
			(proposal) => proposal.origin === 'preserved-source-proposal'
		).length,
		'recovery-invocation-proposal': finalProposals.filter(
			(proposal) => proposal.origin === 'recovery-invocation-proposal'
		).length
	};
	const mutableShardCount = [...state.shards.values()].filter((shard) => shard.mutable).length;
	if (finalProposals.length > mutableShardCount) {
		throw new Error('Infrastructure recovery produced duplicate terminal shard proposals.');
	}
	const finalProposalSetSha256 = canonicalHash(finalProposals);
	const expectedCollectionProposalBindings = terminalCollectionProposalBindings(
		state,
		finalProposals
	);
	const collectionPassMatches =
		pendingShardIds.length === 0 &&
		['collection-passed', 'committed'].includes(state.downstream.cohortStatus) &&
		state.downstream.collectionValidation?.status === 'passed' &&
		(state.downstream.collectionValidation?.issues?.length ?? 0) === 0 &&
		canonicalHash(state.downstream.collectionProposalBindings) ===
			canonicalHash(expectedCollectionProposalBindings);
	const collectionLedger = {
		repairSha256: state.manifest.verification.summarySha256,
		invalidatedAttempts: structuredClone(state.downstream.invalidatedAttempts),
		invalidatedAttemptSetSha256: state.downstream.invalidatedAttemptSetSha256,
		collectionValidationSha256: state.downstream.collectionValidationSha256,
		collectionProposalSetSha256: state.downstream.collectionProposalSetSha256
	};
	const logicalLedger = {
		shards: logicalLedgerShards,
		collection: collectionLedger
	};
	const logicalLedgerSha256 = canonicalHash(logicalLedger);
	const evidencePaths = terminalEvidencePathInventory(state);
	const resultStatus =
		pendingShardIds.length > 0
			? 'pending'
			: collectionPassMatches
				? 'passed'
				: 'ready-for-collection';
	const result = {
		status: resultStatus,
		issues:
			resultStatus === 'passed'
				? []
				: resultStatus === 'ready-for-collection'
					? ['Terminal shard proposals require an authenticated full collection pass.']
					: [`Missing terminal proposals for ${pendingShardIds.join(', ')}.`],
		recoveryId: state.manifest.recoveryId,
		recoveryExecutionId: state.recoveryExecutionId,
		manifest: state.manifest,
		manifestPath: path.join(state.successorRoot, MANIFEST_FILE),
		manifestPathRelative: workspaceRelative(
			workspaceRoot,
			path.join(state.successorRoot, MANIFEST_FILE),
			'infrastructure recovery manifest'
		),
		workspaceRoot,
		manifestSha256: state.manifestSha256,
		failedRootInventorySha256: state.manifest.failedRootInventorySha256,
		logicalLedger,
		collectionLedger,
		logicalLedgerSha256,
		preservedProposalSetSha256: state.manifest.preservedProposalSetSha256,
		finalProposals,
		finalProposalSetSha256,
		finalProposalOriginCounts,
		collectionProposalBindings: expectedCollectionProposalBindings,
		collectionProposalSetSha256: canonicalHash(expectedCollectionProposalBindings),
		collectionPassSha256: collectionPassMatches
			? canonicalHash({
					repairSha256: collectionLedger.repairSha256,
					invalidatedAttemptSetSha256: collectionLedger.invalidatedAttemptSetSha256,
					collectionValidationSha256: collectionLedger.collectionValidationSha256,
					collectionProposalSetSha256: collectionLedger.collectionProposalSetSha256
				})
			: null,
		downstreamPhase: state.downstream.phase,
		contentNamespaceId: state.manifest.contentNamespaceId,
		frozenShardIds: [...state.shards.values()]
			.filter(
				(shard) =>
					shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE
			)
			.map((shard) => shard.shardId)
			.sort(),
		pendingShardIds,
		evidencePaths,
		evidencePathInventorySha256: canonicalHash(evidencePaths)
	};
	if (result.status === 'passed') {
		if (
			mutableShardCount !== 49 ||
			finalProposals.length !== 49 ||
			result.frozenShardIds.length !== 2 ||
			result.frozenShardIds.length + finalProposals.length !== 51
		) {
			throw new Error(
				'Terminal infrastructure recovery requires 49 mutable proposals and two frozen B0 shards.'
			);
		}
		result.binding = buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
			evidence: result,
			referenceRoot: workspaceRoot
		});
		validateRecoveryTerminalDownstreamClosure({ state, terminal: result });
	}
	return result;
}

/**
 * Build the exact nine-field effective-cohort projection agreed by downstream
 * verification/materialization. No schemaVersion or additional field is allowed.
 */
export function buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
	evidence,
	referenceRoot
}) {
	const terminal =
		evidence?.finalProposalSetSha256 && evidence?.logicalLedgerSha256
			? evidence
			: inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
					evidence,
					referenceRoot
				});
	if (terminal.status !== 'passed') {
		throw new Error(
			`Infrastructure recovery is not terminal:\n${(terminal.issues ?? []).join('\n')}`
		);
	}
	if (
		typeof terminal.workspaceRoot !== 'string' ||
		path.resolve(referenceRoot ?? terminal.workspaceRoot) !==
			path.resolve(terminal.workspaceRoot) ||
		path.resolve(terminal.workspaceRoot, terminal.manifestPathRelative ?? '') !==
			path.resolve(terminal.manifestPath)
	) {
		throw new Error(
			'Infrastructure recovery binding must use its authenticated workspace-relative manifest path.'
		);
	}
	const binding = {
		manifestPath: terminal.manifestPathRelative,
		manifestSha256: terminal.manifestSha256,
		recoveryId: terminal.recoveryId,
		recoveryExecutionId: terminal.recoveryExecutionId,
		failedRootInventorySha256: terminal.failedRootInventorySha256,
		logicalLedgerSha256: terminal.logicalLedgerSha256,
		preservedProposalSetSha256: terminal.preservedProposalSetSha256,
		finalProposalSetSha256: terminal.finalProposalSetSha256,
		contentNamespaceId: terminal.contentNamespaceId
	};
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(binding);
	return binding;
}

export function validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(binding) {
	requireRecord(binding, 'Infrastructure recovery binding');
	const keys = Object.keys(binding).sort();
	const expected = [
		...SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_BINDING_FIELDS
	].sort();
	if (canonicalHash(keys) !== canonicalHash(expected)) {
		throw new Error('Infrastructure recovery binding must use the exact nine-field shape.');
	}
	if (
		typeof binding.manifestPath !== 'string' ||
		!binding.manifestPath.trim() ||
		path.isAbsolute(binding.manifestPath) ||
		binding.manifestPath.includes('\\') ||
		binding.manifestPath.includes('\0') ||
		path.posix.normalize(binding.manifestPath) !== binding.manifestPath ||
		binding.manifestPath === '..' ||
		binding.manifestPath.startsWith('../')
	) {
		throw new Error('Infrastructure recovery manifestPath must be safe reference-root-relative.');
	}
	for (const field of expected.filter((field) => field !== 'manifestPath')) {
		if (!HASH.test(String(binding[field] ?? ''))) {
			throw new Error(`Infrastructure recovery ${field} must be a SHA-256.`);
		}
	}
	return { status: 'passed', issues: [] };
}

function recoveryStateFromEvidence(evidence) {
	const state = evidence?.state ?? evidence;
	if (
		!state ||
		state.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA ||
		!(state.shards instanceof Map) ||
		!state.source ||
		!state.manifest ||
		!HASH.test(String(state.manifestSha256 ?? '')) ||
		state.manifestSha256 !== canonicalHash(state.manifest)
	) {
		throw new Error('Terminal infrastructure recovery requires authenticated replay state.');
	}
	const manifest = state.manifest;
	if (
		manifest.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA ||
		manifest.recoveryId !== canonicalHash(manifest.recoveryObjective) ||
		manifest.recoveryExecutionId !== canonicalHash(manifest.recoveryIdentity) ||
		state.recoveryId !== manifest.recoveryId ||
		state.recoveryExecutionId !== manifest.recoveryExecutionId ||
		state.contentNamespaceId !== manifest.contentNamespaceId ||
		manifest.failedRootInventorySha256 !== manifest.failedRoot?.treeSha256 ||
		manifest.failedRootInventorySha256 !== state.source.failedRootTreeSha256 ||
		manifest.preservedProposalSetSha256 !== canonicalHash(manifest.recoveryProposals) ||
		manifest.recoveryProposalSetSha256 !== manifest.preservedProposalSetSha256 ||
		manifest.baselineLogicalLedgerSha256 !== canonicalHash(manifest.baselineLogicalLedger) ||
		manifest.shardStateSetSha256 !== canonicalHash(manifest.shards) ||
		canonicalHash(manifest.counts) !== canonicalHash(recoveryCounts(manifest.shards)) ||
		canonicalHash(manifest.counts) !== canonicalHash(INCIDENT_RECOVERY_COUNTS)
	) {
		throw new Error('Infrastructure recovery manifest identities are stale.');
	}
	const expectedContentNamespaceId = canonicalHash({
		schemaVersion: 'science-challenge-review-rebase-recovery-content-namespace/v1',
		recoveryId: manifest.recoveryId,
		recoveryExecutionId: manifest.recoveryExecutionId,
		successorRootPathSha256: canonicalHash(state.successorRootPath),
		logicalContentAttemptLimit: SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS,
		infrastructureInvocationLimit:
			SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT
	});
	if (
		manifest.contentNamespaceId !== expectedContentNamespaceId ||
		manifest.successor?.path !== state.successorRootPath ||
		manifest.successor?.pathSha256 !== canonicalHash(state.successorRootPath) ||
		state.shards.size !== manifest.shards.length
	) {
		throw new Error('Infrastructure recovery content namespace is stale.');
	}
	for (const shardRecord of manifest.shards) {
		const runtimeShard = state.shards.get(shardRecord.shardId);
		if (!runtimeShard) {
			throw new Error(`Infrastructure recovery state is missing ${shardRecord.shardId}.`);
		}
		const runtimeCore = { ...runtimeShard };
		delete runtimeCore.proposal;
		requireExactCanonicalValue(
			runtimeCore,
			shardRecord,
			`${shardRecord.shardId} runtime recovery state differs from the manifest`
		);
		const expectedProposal = shardRecord.proposalBindingSha256
			? manifest.recoveryProposals.find(
					(proposal) => proposal.proposalBindingSha256 === shardRecord.proposalBindingSha256
				)
			: null;
		requireExactCanonicalValue(
			runtimeShard.proposal ?? null,
			expectedProposal ?? null,
			`${shardRecord.shardId} preserved proposal differs from the manifest`
		);
	}
	const successorRoot = {
		absolutePath: path.resolve(state.successorRoot),
		relativePath: state.successorRootPath
	};
	const prepared = buildPreparedRecovery({ source: state.source, successorRoot });
	if (
		!['commit-direct-child-first', 'backfill', 'commit-ready', 'committed'].includes(
			prepared._continuation.action
		)
	) {
		throw new Error('Recovery state lacks its exact shared continuation-registry authority.');
	}
	requireExactCanonicalValue(
		manifest,
		prepared.manifest,
		'Infrastructure recovery manifest differs from exact source replay'
	);
	const successorTree = requireExactSuccessorTree({
		source: state.source,
		successorRoot,
		prepared,
		allowRecoveryInvocations: true
	});
	const downstream = inspectRecoveryDownstreamState(state);
	state.downstream = downstream;
	for (const shardId of [...state.shards.keys()].sort()) {
		inspectScienceChallengeReviewRebaseRecoveryInvocations({ state, shardId });
	}
	validateRecoveryTopLevelPhase({ state, downstream, successorTree });
	return state;
}

function resolvedPreservedProposal(state, shard) {
	const proposal = shard.proposal;
	if (
		!proposal ||
		proposal.shardId !== shard.shardId ||
		proposal.proposalBindingSha256 !== shard.proposalBindingSha256
	) {
		throw new Error(`${shard.shardId} preserved proposal binding is missing or stale.`);
	}
	const root = path.join(state.successorRoot, RECOVERY_PROPOSALS_DIRECTORY, shard.shardId);
	const bindingLoaded = readCanonicalJsonFile(
		path.join(root, 'binding.json'),
		`${shard.shardId} preserved proposal binding`
	);
	requireExactCanonicalValue(
		bindingLoaded.value,
		proposal,
		`${shard.shardId} preserved proposal binding differs from the recovery manifest`
	);
	const candidate = successorProposalFileBinding(
		state,
		path.join(root, 'candidate.json'),
		`${shard.shardId} preserved candidate`
	);
	const validation = successorProposalFileBinding(
		state,
		path.join(root, 'validation.json'),
		`${shard.shardId} preserved validation`
	);
	if (
		candidate.canonicalSha256 !== proposal.candidateSha256 ||
		validation.canonicalSha256 !== proposal.validationSha256
	) {
		throw new Error(`${shard.shardId} preserved proposal bytes differ from its binding.`);
	}
	return terminalProposalRecord({
		shardId: shard.shardId,
		origin: 'preserved-source-proposal',
		logicalContentOrdinal: proposal.logicalContentOrdinal,
		candidatePath: candidate.path,
		candidateSha256: candidate.canonicalSha256,
		candidate: candidate.value,
		validationPath: validation.path,
		validationSha256: validation.canonicalSha256,
		validation: validation.value
	});
}

function resolvedInvocationProposal(state, terminal) {
	const { claim, completion, directory } = terminal;
	if (
		completion?.classification !== SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED ||
		!completion.proposal
	) {
		throw new Error(`${claim?.shardId ?? 'Recovery shard'} has no terminal proposal.`);
	}
	const candidatePath = path.join(directory, 'candidate.json');
	const validationPath = path.join(directory, 'validation.json');
	const candidate = successorProposalFileBinding(
		state,
		candidatePath,
		`${claim.shardId} terminal recovery candidate`
	);
	const validation = successorProposalFileBinding(
		state,
		validationPath,
		`${claim.shardId} terminal recovery validation`
	);
	const expectedCandidate = fileBinding(state.source.workspaceRoot, candidatePath);
	const expectedValidation = fileBinding(state.source.workspaceRoot, validationPath);
	if (
		canonicalHash(expectedCandidate) !== canonicalHash(completion.proposal.candidate) ||
		canonicalHash(expectedValidation) !== canonicalHash(completion.proposal.validation) ||
		candidate.canonicalSha256 !== completion.proposal.candidateSha256 ||
		validation.canonicalSha256 !== completion.proposal.validationSha256
	) {
		throw new Error(`${claim.shardId} terminal recovery proposal bytes are stale.`);
	}
	return terminalProposalRecord({
		shardId: claim.shardId,
		origin: 'recovery-invocation-proposal',
		logicalContentOrdinal: claim.logicalContentOrdinal,
		candidatePath: candidate.path,
		candidateSha256: candidate.canonicalSha256,
		candidate: candidate.value,
		validationPath: validation.path,
		validationSha256: validation.canonicalSha256,
		validation: validation.value
	});
}

function terminalProposalRecord(record) {
	if (
		canonicalHash(Object.keys(record).sort()) !==
			canonicalHash([...TERMINAL_PROPOSAL_FIELDS].sort()) ||
		!SAFE_SHARD.test(String(record.shardId ?? '')) ||
		!['preserved-source-proposal', 'recovery-invocation-proposal'].includes(record.origin) ||
		!Number.isInteger(record.logicalContentOrdinal) ||
		record.logicalContentOrdinal < 1 ||
		record.logicalContentOrdinal > SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS ||
		!HASH.test(String(record.candidateSha256 ?? '')) ||
		record.candidateSha256 !== canonicalHash(record.candidate) ||
		!HASH.test(String(record.validationSha256 ?? '')) ||
		record.validationSha256 !== canonicalHash(record.validation)
	) {
		throw new Error('Terminal infrastructure recovery proposal shape is invalid.');
	}
	for (const [field, label] of [
		['candidatePath', 'terminal candidate path'],
		['validationPath', 'terminal validation path']
	]) {
		const value = record[field];
		if (
			typeof value !== 'string' ||
			!value ||
			path.isAbsolute(value) ||
			value === '..' ||
			value.startsWith('../') ||
			path.posix.normalize(value) !== value
		) {
			throw new Error(`${label} must be safe recovery-root-relative.`);
		}
	}
	return record;
}

function successorProposalFileBinding(state, filePath, label) {
	const loaded = readCanonicalJsonFile(filePath, label);
	return {
		path: safeReferenceRelative(state.successorRoot, filePath, label),
		fileSha256: sha256(loaded.bytes),
		canonicalSha256: canonicalHash(loaded.value),
		value: loaded.value
	};
}

function validateTerminalProposalRecord(proposal) {
	requireRecord(proposal, 'Terminal recovery proposal');
	if (
		canonicalHash(Object.keys(proposal).sort()) !==
			canonicalHash([...TERMINAL_PROPOSAL_FIELDS].sort()) ||
		!SAFE_SHARD.test(String(proposal.shardId ?? '')) ||
		!['preserved-source-proposal', 'recovery-invocation-proposal'].includes(proposal.origin) ||
		!Number.isInteger(proposal.logicalContentOrdinal) ||
		proposal.logicalContentOrdinal < 1 ||
		proposal.logicalContentOrdinal > SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS ||
		!HASH.test(String(proposal.candidateSha256 ?? '')) ||
		!HASH.test(String(proposal.validationSha256 ?? '')) ||
		canonicalHash(proposal.candidate) !== proposal.candidateSha256 ||
		canonicalHash(proposal.validation) !== proposal.validationSha256
	) {
		throw new Error(`${proposal.shardId ?? 'Recovery shard'} terminal proposal is invalid.`);
	}
	for (const field of ['candidatePath', 'validationPath']) {
		const value = proposal[field];
		if (
			typeof value !== 'string' ||
			!value ||
			path.isAbsolute(value) ||
			value.includes('\\') ||
			value.includes('\0') ||
			path.posix.normalize(value) !== value ||
			value === '..' ||
			value.startsWith('../')
		) {
			throw new Error(`${proposal.shardId} terminal ${field} is not recovery-root-relative.`);
		}
	}
}

function terminalCollectionProposalBindings(state, finalProposals) {
	return finalProposals
		.map((proposal) => {
			const baseline = state.source.baselineByShard.get(proposal.shardId);
			if (!baseline) {
				throw new Error(`${proposal.shardId} terminal proposal has no B0 baseline.`);
			}
			return {
				shardId: proposal.shardId,
				attempt: proposal.logicalContentOrdinal,
				candidateSha256: proposal.candidateSha256,
				validationSha256: proposal.validationSha256,
				expectedTargetCandidateSha256: canonicalHash(baseline.candidate),
				expectedTargetValidationSha256: canonicalHash(baseline.validation)
			};
		})
		.sort((left, right) => left.shardId.localeCompare(right.shardId));
}

function validateRecoveryTerminalDownstreamClosure({ state, terminal }) {
	if (
		canonicalHash(state.downstream.collectionProposalBindings) !==
		canonicalHash(terminal.collectionProposalBindings)
	) {
		throw new Error('Recovery collection-pass proposals differ from terminal proposal replay.');
	}
	if (
		state.downstream.publication &&
		canonicalHash(state.downstream.publication.records) !==
			canonicalHash(terminal.collectionProposalBindings)
	) {
		throw new Error('Recovery publication journal differs from terminal proposal replay.');
	}
	if (state.downstream.effectiveCohort) {
		if (
			canonicalHash(state.downstream.effectiveCohort.infrastructureRecovery) !==
			canonicalHash(terminal.binding)
		) {
			throw new Error('Recovery effective cohort carries a stale infrastructure binding.');
		}
		const byShardKind = new Map(
			state.downstream.effectiveCohort.shardBindings.map((binding) => [
				`${binding.shardId}:${binding.kind}`,
				binding.canonicalSha256
			])
		);
		for (const proposal of terminal.finalProposals) {
			if (
				byShardKind.get(`${proposal.shardId}:candidate`) !== proposal.candidateSha256 ||
				byShardKind.get(`${proposal.shardId}:validation`) !== proposal.validationSha256
			) {
				throw new Error(
					`${proposal.shardId} effective-cohort bytes differ from terminal recovery.`
				);
			}
		}
	}
	if (state.downstream.summary && state.downstream.phase !== 'published-with-summary') {
		throw new Error('Recovery terminal summary exists outside the published summary phase.');
	}
}

function terminalEvidencePathInventory(state) {
	const workspaceRoot = state.source.workspaceRoot;
	const records = new Map();
	const addFile = (filePath, label) => {
		const absolute = path.resolve(filePath);
		if (!existsSync(absolute)) throw new Error(`${label} is missing.`);
		const stat = lstatSync(absolute);
		if (!stat.isFile() || stat.isSymbolicLink()) {
			throw new Error(`${label} must be a regular non-symlink file.`);
		}
		const bytes = readFileSync(absolute);
		const record = {
			path: workspaceRelative(workspaceRoot, absolute, label),
			byteLength: bytes.length,
			sha256: sha256(bytes)
		};
		const previous = records.get(record.path);
		if (previous && canonicalHash(previous) !== canonicalHash(record)) {
			throw new Error(`Terminal evidence path ${record.path} has conflicting bytes.`);
		}
		records.set(record.path, record);
		return record;
	};
	const addBoundInventory = (root, inventory, label) => {
		for (const expected of inventory) {
			const current = addFile(
				path.join(root, ...expected.path.split('/')),
				`${label} ${expected.path}`
			);
			if (current.byteLength !== expected.byteLength || current.sha256 !== expected.sha256) {
				throw new Error(`${label} inventory differs at ${expected.path}.`);
			}
		}
	};
	const addBoundJson = ({ filePath, label, expectedFileSha256, expectedCanonicalSha256 }) => {
		const current = addFile(filePath, label);
		const loaded = readJsonFile(filePath, label);
		if (
			current.sha256 !== expectedFileSha256 ||
			canonicalHash(loaded.value) !== expectedCanonicalSha256
		) {
			throw new Error(`${label} differs from its authenticated source binding.`);
		}
	};

	for (const binding of state.source.reviewEvidence) {
		const current = addFile(
			path.resolve(workspaceRoot, binding.path),
			`review evidence ${binding.path}`
		);
		if (current.byteLength !== binding.byteLength || current.sha256 !== binding.fileSha256) {
			throw new Error(`Review evidence differs at ${binding.path}.`);
		}
	}
	addBoundJson({
		filePath: state.source.reviewRebaseManifestPath,
		label: 'review-rebase manifest',
		expectedFileSha256: sha256(
			Buffer.from(`${stableStringify(state.source.reviewRebase.manifest)}\n`)
		),
		expectedCanonicalSha256: canonicalHash(state.source.reviewRebase.manifest)
	});
	addBoundJson({
		filePath: state.source.verificationSummaryPath,
		label: 'verification summary',
		expectedFileSha256: state.source.verificationSummaryFileSha256,
		expectedCanonicalSha256: state.source.verificationSha256
	});
	addBoundJson({
		filePath: state.source.repairParentPath,
		label: 'verification-repair parent',
		expectedFileSha256: state.source.repairParentFileSha256,
		expectedCanonicalSha256: canonicalHash(state.source.repairParent)
	});
	for (const input of boundInputFileRecords(state.source.reviewRebase.manifest.evidence?.inputs)) {
		addBoundJson({
			filePath: path.resolve(workspaceRoot, input.path),
			label: `B0 input ${input.path}`,
			expectedFileSha256: input.fileSha256,
			expectedCanonicalSha256: input.canonicalSha256
		});
	}
	addBoundInventory(state.source.failedRoot, state.source.failedRootInventory, 'failed S1 root');
	addBoundInventory(state.source.ledgerRoot, state.source.ledgerInventory, 'global attempt ledger');
	const successorInventory = inventoryTree(state.successorRoot);
	addBoundInventory(state.successorRoot, successorInventory, 'recovery successor');
	return [...records.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function boundInputFileRecords(value) {
	const records = [];
	const visit = (current) => {
		if (!current || typeof current !== 'object') return;
		if (
			!Array.isArray(current) &&
			typeof current.path === 'string' &&
			HASH.test(String(current.fileSha256 ?? '')) &&
			HASH.test(String(current.canonicalSha256 ?? ''))
		) {
			records.push({
				path: current.path,
				fileSha256: current.fileSha256,
				canonicalSha256: current.canonicalSha256
			});
		}
		for (const child of Array.isArray(current) ? current : Object.values(current)) {
			visit(child);
		}
	};
	visit(value);
	const unique = new Map();
	for (const record of records) {
		const previous = unique.get(record.path);
		if (previous && canonicalHash(previous) !== canonicalHash(record)) {
			throw new Error(`B0 input ${record.path} has conflicting source bindings.`);
		}
		unique.set(record.path, record);
	}
	return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function safeReferenceRelative(referenceRoot, filePath, label) {
	if (
		typeof referenceRoot !== 'string' ||
		!referenceRoot.trim() ||
		typeof filePath !== 'string' ||
		!filePath.trim()
	) {
		throw new Error(`${label} reference path is required.`);
	}
	const root = path.resolve(referenceRoot);
	const absolute = path.resolve(filePath);
	const relative = path.relative(root, absolute).split(path.sep).join('/');
	if (
		!relative ||
		path.isAbsolute(relative) ||
		relative === '..' ||
		relative.startsWith('../') ||
		relative.includes('\\') ||
		relative.includes('\0') ||
		path.posix.normalize(relative) !== relative ||
		relative.split('/').some((part) => !part || part === '.' || part === '..')
	) {
		throw new Error(`${label} must remain inside its reference root.`);
	}
	return relative;
}

export function scienceChallengeReviewRebaseRecoveryInvocationName({
	logicalContentOrdinal,
	infrastructureInvocationOrdinal
}) {
	requireInteger(
		logicalContentOrdinal,
		'logical content ordinal',
		1,
		SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS
	);
	requireInteger(
		infrastructureInvocationOrdinal,
		'infrastructure invocation ordinal',
		1,
		SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT
	);
	return `recovery-content-attempt-${String(logicalContentOrdinal).padStart(
		2,
		'0'
	)}-invocation-${String(infrastructureInvocationOrdinal).padStart(2, '0')}`;
}

/**
 * The recovery successor is an immutable evidence root. Cohort collection and
 * publication belong to a distinct downstream root and are never valid here.
 */
export function validateScienceChallengeReviewRebaseInfrastructureRecoverySuccessorArtifactPath(
	relativePath
) {
	if (
		typeof relativePath !== 'string' ||
		!relativePath ||
		path.isAbsolute(relativePath) ||
		relativePath.includes('\\') ||
		relativePath.includes('\0') ||
		path.posix.normalize(relativePath) !== relativePath ||
		relativePath === '..' ||
		relativePath.startsWith('../')
	) {
		throw new Error('Recovery successor artifact path must be safe and root-relative.');
	}
	const segments = relativePath.split('/');
	const forbidden = segments.some(
		(segment) =>
			segment.includes('generation-summary') ||
			/^verification-repair-.+-summary\.json$/u.test(segment) ||
			segment.includes('effective-cohort') ||
			segment === 'transaction' ||
			segment.includes('-transaction') ||
			segment === 'publication' ||
			segment.includes('publication-journal') ||
			segment === 'journal' ||
			segment === 'journal.json'
	);
	if (forbidden) {
		throw new Error(`Recovery successor contains forbidden downstream artifact ${relativePath}.`);
	}
	return { status: 'passed', issues: [] };
}

/**
 * Inspect recovery-only claims/completions. This namespace is intentionally
 * disjoint from physical verification-repair attempt-01..04 directories.
 */
export function inspectScienceChallengeReviewRebaseRecoveryInvocations({ state, shardId }) {
	const shard = requireRecoveryStateShard(state, shardId);
	const root = recoveryInvocationRoot(state, shardId);
	const sourceProposalClosesShard =
		shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL;
	const initialLogicalContentOrdinal =
		shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL
			? null
			: shard.nextLogicalContentOrdinal;
	if (!existsSync(root)) {
		const remaining =
			initialLogicalContentOrdinal === null
				? 0
				: Math.max(
						0,
						SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS -
							initialLogicalContentOrdinal +
							1
					);
		return {
			status: 'passed',
			shardId,
			invocations: [],
			openInvocation: null,
			nextLogicalContentOrdinal: initialLogicalContentOrdinal,
			nextInfrastructureInvocationOrdinal: initialLogicalContentOrdinal === null ? null : 1,
			remainingLogicalContentAttempts: remaining,
			closedByPassedProposal: sourceProposalClosesShard,
			infrastructureSlotExhausted: false
		};
	}
	requireSafeDirectoryChain(state.successorRoot, root, {
		allowMissingTail: false,
		label: `${shardId} recovery invocation root`
	});
	if (!shard.mutable || sourceProposalClosesShard) {
		throw new Error(`${shardId} must not have a recovery invocation namespace.`);
	}
	const rootEntries = readdirSync(root, { withFileTypes: true });
	if (rootEntries.length === 0) {
		throw new Error(`${shardId} recovery invocation root must not exist empty.`);
	}
	const records = rootEntries
		.map((entry) => {
			if (entry.isSymbolicLink() || !entry.isDirectory()) {
				throw new Error(`${shardId} recovery invocation root contains a non-directory entry.`);
			}
			const match = entry.name.match(RECOVERY_INVOCATION_DIRECTORY);
			if (!match) {
				throw new Error(`${shardId} recovery invocation directory ${entry.name} is malformed.`);
			}
			const directory = path.join(root, entry.name);
			const claimPath = path.join(directory, 'claim.json');
			if (!existsSync(claimPath)) {
				throw new Error(`${shardId} recovery invocation ${entry.name} has no immutable claim.`);
			}
			const claim = readCanonicalJsonFile(claimPath, `${shardId} recovery claim`).value;
			validateRecoveryInvocationClaim({
				claim,
				state,
				shard,
				directoryName: entry.name
			});
			const completionPath = path.join(directory, 'completion.json');
			const completion = existsSync(completionPath)
				? readCanonicalJsonFile(completionPath, `${shardId} recovery completion`).value
				: null;
			if (completion) {
				validateRecoveryInvocationCompletion({
					completion,
					claim,
					state,
					shard,
					directory
				});
			} else {
				validateScienceChallengeReviewRebaseAttemptEvidenceTree({
					attemptDirectory: directory,
					allowClaimFile: true,
					allowPartial: true,
					expectedPartIds: expectedRecoveryPartIds(state, shard.shardId)
				});
			}
			return {
				directory,
				directoryName: entry.name,
				claimPath,
				claim,
				completionPath: completion ? completionPath : null,
				completion
			};
		})
		.sort(compareRecoveryInvocations);
	validateRecoveryInvocationSequence({ shard, records });
	const open = records.find((record) => record.completion === null) ?? null;
	let logical = initialLogicalContentOrdinal;
	let invocation = 1;
	let closedByPassedProposal = sourceProposalClosesShard;
	for (const record of records) {
		if (!record.completion) break;
		if (
			record.completion.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED
		) {
			closedByPassedProposal = true;
			logical = null;
			invocation = null;
			break;
		}
		if (
			record.completion.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED
		) {
			logical = record.claim.logicalContentOrdinal + 1;
			invocation = 1;
		} else {
			logical = record.claim.logicalContentOrdinal;
			invocation = record.claim.infrastructureInvocationOrdinal + 1;
		}
	}
	const infrastructureSlotExhausted =
		!closedByPassedProposal &&
		invocation > SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT;
	const remaining =
		closedByPassedProposal || logical === null
			? 0
			: Math.max(0, SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS - logical + 1);
	return {
		status: 'passed',
		shardId,
		invocations: records,
		openInvocation: open,
		nextLogicalContentOrdinal: logical,
		nextInfrastructureInvocationOrdinal: invocation,
		remainingLogicalContentAttempts: remaining,
		closedByPassedProposal,
		infrastructureSlotExhausted
	};
}

/**
 * Return only authenticated persisted context from the latest completed
 * invocation. Crash-truncated evidence never fabricates a candidate or
 * validation; callers receive the conservative indeterminate issue instead.
 */
export function readScienceChallengeReviewRebaseRecoveryPreviousOutcome({ state, shardId }) {
	const inspected = inspectScienceChallengeReviewRebaseRecoveryInvocations({
		state,
		shardId
	});
	const latest = [...inspected.invocations].reverse().find((record) => record.completion !== null);
	if (!latest) return null;
	const common = {
		shardId,
		logicalContentOrdinal: latest.claim.logicalContentOrdinal,
		infrastructureInvocationOrdinal: latest.claim.infrastructureInvocationOrdinal,
		classification: latest.completion.classification,
		claimSha256: canonicalHash(latest.claim),
		completionSha256: canonicalHash(latest.completion)
	};
	if (latest.completion.indeterminate === true) {
		return {
			...common,
			status: 'indeterminate',
			candidate: null,
			validation: null,
			issues: ['prior invocation indeterminate']
		};
	}
	const candidatePath = path.join(latest.directory, 'candidate.json');
	const validationPath = path.join(latest.directory, 'validation.json');
	const candidate = existsSync(candidatePath)
		? readCanonicalJsonFile(candidatePath, `${shardId} previous recovery candidate`).value
		: null;
	const validation = existsSync(validationPath)
		? readCanonicalJsonFile(validationPath, `${shardId} previous recovery validation`).value
		: null;
	return {
		...common,
		status: 'persisted',
		candidate,
		validation,
		issues: Array.isArray(validation?.issues) ? [...validation.issues] : []
	};
}

/**
 * Atomically claim the next bounded infrastructure invocation. A claim is not
 * itself evidence that model content was produced; completion classifies the
 * resulting immutable bytes.
 */
export function claimScienceChallengeReviewRebaseRecoveryInvocation({ state, shardId }) {
	const shard = requireRecoveryStateShard(state, shardId);
	if (!shard.mutable) {
		throw new Error(`${shardId} is not eligible for another recovery invocation.`);
	}
	const inspected = inspectScienceChallengeReviewRebaseRecoveryInvocations({ state, shardId });
	if (inspected.openInvocation) {
		throw new Error(
			`${shardId} already has an incomplete recovery invocation ${inspected.openInvocation.directoryName}.`
		);
	}
	if (inspected.closedByPassedProposal) {
		throw new Error(`${shardId} already has a validation-passed terminal proposal.`);
	}
	if (
		inspected.nextLogicalContentOrdinal === null ||
		inspected.nextLogicalContentOrdinal >
			SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS
	) {
		throw new Error(`${shardId} exhausted its four logical content attempts.`);
	}
	if (inspected.infrastructureSlotExhausted) {
		throw new Error(
			`${shardId} exhausted four infrastructure invocations for logical content attempt ${inspected.nextLogicalContentOrdinal}.`
		);
	}
	const directoryName = scienceChallengeReviewRebaseRecoveryInvocationName({
		logicalContentOrdinal: inspected.nextLogicalContentOrdinal,
		infrastructureInvocationOrdinal: inspected.nextInfrastructureInvocationOrdinal
	});
	const root = recoveryInvocationRoot(state, shardId);
	mkdirSync(root, { recursive: true });
	const prior = inspected.invocations.map((record) => ({
		logicalContentOrdinal: record.claim.logicalContentOrdinal,
		infrastructureInvocationOrdinal: record.claim.infrastructureInvocationOrdinal,
		claimSha256: canonicalHash(record.claim),
		completionSha256: record.completion ? canonicalHash(record.completion) : null
	}));
	const core = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_INVOCATION_CLAIM_SCHEMA,
		recoveryExecutionId: state.recoveryExecutionId,
		recoveryManifestSha256: state.manifestSha256,
		objectiveId: state.manifest.originalExecutionIdentity.objectiveId,
		executionId: state.manifest.originalExecutionIdentity.executionId,
		successorRootPathSha256: canonicalHash(state.successorRootPath),
		shardId,
		logicalContentOrdinal: inspected.nextLogicalContentOrdinal,
		infrastructureInvocationOrdinal: inspected.nextInfrastructureInvocationOrdinal,
		priorInvocationSetSha256: canonicalHash(prior)
	};
	const claim = { ...core, claimSha256: canonicalHash(core) };
	const directory = path.join(root, directoryName);
	writeAtomicClaimDirectory(directory, claim);
	const replay = inspectScienceChallengeReviewRebaseRecoveryInvocations({ state, shardId });
	const created = replay.invocations.find((record) => record.directoryName === directoryName);
	if (!created || canonicalHash(created.claim) !== canonicalHash(claim)) {
		throw new Error(`${shardId} recovery invocation claim failed exact readback.`);
	}
	return created;
}

/**
 * Classify and immutably complete one claimed invocation from its persisted
 * evidence bytes. No model is called here.
 */
export function completeScienceChallengeReviewRebaseRecoveryInvocation({
	state,
	shardId,
	directory
}) {
	requireRecoveryStateShard(state, shardId);
	const resolvedDirectory = path.resolve(directory);
	const root = recoveryInvocationRoot(state, shardId);
	if (
		resolvedDirectory === root ||
		!resolvedDirectory.startsWith(`${root}${path.sep}`) ||
		path.dirname(resolvedDirectory) !== root
	) {
		throw new Error('Recovery invocation directory is outside its shard-bound namespace.');
	}
	const inspected = inspectScienceChallengeReviewRebaseRecoveryInvocations({ state, shardId });
	const record = inspected.invocations.find(
		(candidate) => candidate.directory === resolvedDirectory
	);
	if (!record) throw new Error('Recovery invocation is not claimed.');
	if (record.completion) return record;
	const hasCompleteAttemptEvidence = ATTEMPT_TOP_LEVEL_EVIDENCE_FILES.every((name) =>
		existsSync(path.join(resolvedDirectory, name))
	);
	if (!hasCompleteAttemptEvidence) {
		validateScienceChallengeReviewRebaseAttemptEvidenceTree({
			attemptDirectory: resolvedDirectory,
			allowClaimFile: true,
			allowPartial: true,
			expectedPartIds: expectedRecoveryPartIds(state, shardId)
		});
	}
	const classification = hasCompleteAttemptEvidence
		? classifyAttemptDirectory({
				attemptDirectory: resolvedDirectory,
				shardId,
				physicalAttempt: record.claim.logicalContentOrdinal,
				source: state.source,
				baseline: state.source.baselineByShard.get(shardId),
				allowClaimFile: true
			})
		: {
				classification: SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED,
				proposal: null,
				indeterminate: true
			};
	const evidenceInventory = inventoryTree(resolvedDirectory, {
		exclude: new Set(['completion.json'])
	});
	const core = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_INVOCATION_COMPLETION_SCHEMA,
		recoveryExecutionId: state.recoveryExecutionId,
		recoveryManifestSha256: state.manifestSha256,
		claimSha256: canonicalHash(record.claim),
		shardId,
		logicalContentOrdinal: record.claim.logicalContentOrdinal,
		infrastructureInvocationOrdinal: record.claim.infrastructureInvocationOrdinal,
		classification: classification.classification,
		evidenceInventory,
		evidenceInventorySha256: canonicalHash(evidenceInventory),
		...(classification.indeterminate
			? {
					indeterminate: true,
					indeterminateReason:
						'Claimed invocation lacks a complete authenticated attempt envelope; the call boundary is conservatively consumed.'
				}
			: {}),
		...(classification.proposal
			? {
					proposal: classification.proposal
				}
			: {})
	};
	const completion = { ...core, completionSha256: canonicalHash(core) };
	writeImmutableFile(
		path.join(resolvedDirectory, 'completion.json'),
		Buffer.from(`${stableStringify(completion)}\n`)
	);
	const replay = inspectScienceChallengeReviewRebaseRecoveryInvocations({ state, shardId });
	const completed = replay.invocations.find(
		(candidate) => candidate.directory === resolvedDirectory
	);
	if (!completed?.completion) throw new Error('Recovery completion failed exact readback.');
	return completed;
}

function inspectRecoverySource(options) {
	requireRecord(options, 'Recovery options');
	const workspaceRoot = requireWorkspaceRoot(options.workspaceRoot ?? process.cwd());
	if (!Array.isArray(options.existingDefinitions)) {
		throw new Error('Recovery requires the exact current authored challenge catalog.');
	}
	const reviewRebaseManifest = resolveWorkspacePath(
		workspaceRoot,
		options.reviewRebaseManifestPath,
		{
			label: 'B0 review-rebase manifest',
			allowMissing: false,
			requireFile: true
		}
	);
	const verificationSummaryPath = resolveWorkspacePath(
		workspaceRoot,
		options.verificationSummaryPath,
		{
			label: 'V1 verification summary',
			allowMissing: false,
			requireFile: true
		}
	);
	const failedRoot = resolveWorkspacePath(workspaceRoot, options.failedRoot, {
		label: 'failed S1 generation root',
		allowMissing: false,
		requireDirectory: true
	});
	const reviewRebase = readScienceChallengeReviewRebaseEvidence({
		repositoryRoot: workspaceRoot,
		manifestPath: reviewRebaseManifest.relativePath,
		existingDefinitions: options.existingDefinitions
	});
	if (reviewRebase.status !== 'passed') {
		throw new Error(`B0 review-rebase replay failed:\n${(reviewRebase.issues ?? []).join('\n')}`);
	}
	const verificationLoaded = readCanonicalJsonFile(
		verificationSummaryPath.absolutePath,
		'V1 verification summary'
	);
	const summary = verificationLoaded.value;
	const manifest = reviewRebase.manifest;
	const basePlanPath = manifest.evidence?.inputs?.basePlan?.path;
	const sourceSnapshotPath = manifest.evidence?.inputs?.sourceSnapshot?.path;
	const curriculumEvidencePath = manifest.evidence?.inputs?.curriculumEvidence?.path;
	const basePlanLoaded = readBoundWorkspaceJson(workspaceRoot, basePlanPath, 'base plan');
	const sourceSnapshotLoaded = readBoundWorkspaceJson(
		workspaceRoot,
		sourceSnapshotPath,
		'source snapshot'
	);
	const curriculumEvidenceLoaded = readBoundWorkspaceJson(
		workspaceRoot,
		curriculumEvidencePath,
		'curriculum evidence'
	);
	const reviewReplay = requireContentVerificationEvidence({
		summary,
		summaryPath: verificationSummaryPath.relativePath,
		plan: reviewRebase.plan,
		basePlan: basePlanLoaded.value,
		expectedReviewRebaseEvidence: reviewRebase,
		sourceSnapshot: sourceSnapshotLoaded.value,
		curriculumEvidence: curriculumEvidenceLoaded.value,
		rootDir: workspaceRoot,
		requiredStatus: 'failed',
		expectedCount: reviewRebase.plan.rows.length
	});
	if (reviewReplay.status !== 'passed') {
		throw new Error(`V1 raw review replay failed:\n${reviewReplay.issues.join('\n')}`);
	}
	const verificationSha256 = canonicalHash(summary);
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary: summary,
		reviewRebaseManifest: manifest
	});
	if (!authority)
		throw new Error('Typed B0/V1 recovery requires a review-rebase repair authority.');
	const authoritySha256 = canonicalHash(authority);
	const repairParentPath = path.join(failedRoot.absolutePath, REPAIR_PARENT_FILE);
	const repairParentLoaded = readCanonicalJsonFile(
		repairParentPath,
		'failed S1 verification-repair parent'
	);
	const expectedRepairParent = buildExpectedRepairParent({
		workspaceRoot,
		reviewRebase,
		basePlan: basePlanLoaded.value,
		sourceSnapshot: sourceSnapshotLoaded.value,
		curriculumEvidence: curriculumEvidenceLoaded.value,
		verificationSummaryPath,
		summary,
		reviewReplay,
		authority
	});
	requireExactCanonicalValue(
		repairParentLoaded.value,
		expectedRepairParent,
		'Failed S1 verification-repair parent was changed'
	);
	if (!repairParentLoaded.bytes.equals(Buffer.from(`${stableStringify(expectedRepairParent)}\n`))) {
		throw new Error('Failed S1 verification-repair parent bytes are not canonical.');
	}
	const objective = scienceChallengeVerificationRepairObjectiveIdentity({
		planSha256: canonicalHash(reviewRebase.plan),
		verificationSha256,
		priorCandidateSetSha256: manifest.candidateSetSha256
	});
	const ledgerRoot = verificationRepairExecutionLedgerRoot(workspaceRoot, objective.objectiveId);
	const rawPolicy = readSingleLedgerPolicy({
		ledgerRoot,
		objective,
		failedRoot: failedRoot.absolutePath
	});
	const identity = scienceChallengeVerificationRepairExecutionIdentity({
		...objective,
		model: rawPolicy.model,
		transport: rawPolicy.transport,
		responseMode: rawPolicy.responseMode,
		thinkingLevel: rawPolicy.thinkingLevel,
		directPartSize: rawPolicy.directPartSize
	});
	if (identity.executionId !== rawPolicy.executionId) {
		throw new Error('Failed S1 global claims use a stale execution policy.');
	}
	const sourceOptions = {
		repairKind: SCIENCE_CHALLENGE_REVIEW_REBASE_DIRECT_REPAIR_KIND,
		workspaceRoot,
		evidence: {
			reviewRebaseManifest: manifest,
			reviewRebasePlan: reviewRebase.plan,
			basePlan: basePlanLoaded.value,
			b0Candidates: orderedReviewRebaseCandidates(reviewRebase),
			sourceSnapshot: sourceSnapshotLoaded.value,
			curriculumEvidence: curriculumEvidenceLoaded.value,
			verificationSummary: summary,
			verificationRepairAuthority: authority,
			executionIdentity: identity,
			outputRoot: failedRoot.relativePath
		}
	};
	const registration = inspectDirectChildRegistration(sourceOptions);
	const baselineByShard = loadAndAuthenticateBaselines({
		workspaceRoot,
		reviewRebase,
		failedRoot: failedRoot.absolutePath,
		repairParent: expectedRepairParent
	});
	const reviewsById = new Map(summary.reviews.map((review) => [review.id, review]));
	const mutableShardIds = [
		...new Set(
			reviewRebase.plan.rows
				.filter((row) => authority.mutableChallengeIds.includes(row.id))
				.map((row) => row.shard)
		)
	].sort();
	const mutableShardSet = new Set(mutableShardIds);
	const shardIds = [...baselineByShard.keys()].sort();
	const globalShardIds = listDirectories(path.join(ledgerRoot, 'shards'));
	const attemptPrefix = verificationSha256.slice(0, 12);
	const shardStates = [];
	for (const shardId of shardIds) {
		const baseline = baselineByShard.get(shardId);
		const localLedger = inspectVerificationRepairAttempts({
			shardDir: path.join(failedRoot.absolutePath, 'shards', shardId),
			repairSha256: verificationSha256,
			maxAttempts: SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS
		});
		const globalLedger = inspectVerificationRepairExecutionAttempts({
			ledgerRoot,
			identity,
			shardId
		});
		requireMatchingVerificationRepairAttemptLedgers({
			localAttempts: localLedger.attempts,
			globalAttempts: globalLedger.attempts,
			shardId,
			outputRoot: failedRoot.absolutePath
		});
		if (!mutableShardSet.has(shardId) && localLedger.attempts.length > 0) {
			throw new Error(`${shardId} contains repair attempts outside the frozen mutable shard set.`);
		}
		const attempts = localLedger.attempts.map((record, index) => {
			const claim = globalLedger.attempts[index]?.claim;
			if (!claim || claim.executionId !== identity.executionId) {
				throw new Error(`${shardId} physical attempt ${record.attempt} has no exact global claim.`);
			}
			if (!record.directory.startsWith(`verification-repair-${attemptPrefix}-attempt-`)) {
				throw new Error(`${shardId} attempt directory belongs to another V1 repair.`);
			}
			const classified = classifyAttemptDirectory({
				attemptDirectory: record.path,
				shardId,
				physicalAttempt: record.attempt,
				source: {
					workspaceRoot,
					reviewRebase,
					summary,
					verificationSha256,
					authority,
					authoritySha256,
					identity,
					reviewsById,
					existingDefinitions: options.existingDefinitions,
					sourceSnapshot: sourceSnapshotLoaded.value,
					curriculumEvidence: curriculumEvidenceLoaded.value
				},
				baseline
			});
			return {
				physicalAttempt: record.attempt,
				classification: classified.classification,
				attemptTreeSha256: classified.attemptTreeSha256,
				evidenceInventorySha256: classified.evidenceInventorySha256,
				globalClaim: fileBinding(
					workspaceRoot,
					path.join(globalLedger.attempts[index].path, 'claim.json')
				),
				...(classified.proposal ? { proposal: classified.proposal } : {})
			};
		});
		let logicalContentOrdinal = 1;
		for (const attempt of attempts) {
			attempt.logicalContentOrdinal = logicalContentOrdinal;
			if (attempt.classification !== SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT) {
				if (attempt.proposal) {
					attempt.proposal.logicalContentOrdinal = logicalContentOrdinal;
				}
				logicalContentOrdinal += 1;
			}
		}
		const passedIndexes = attempts
			.map((attempt, index) =>
				attempt.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED
					? index
					: -1
			)
			.filter((index) => index >= 0);
		if (
			passedIndexes.length > 1 ||
			(passedIndexes.length === 1 && passedIndexes[0] !== attempts.length - 1)
		) {
			throw new Error(`${shardId} has a non-terminal or duplicate validation-passed proposal.`);
		}
		const consumed = attempts.filter(
			(attempt) =>
				attempt.classification !== SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT
		).length;
		if (consumed > SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS) {
			throw new Error(`${shardId} exceeds the four logical content-attempt ceiling.`);
		}
		const passed = passedIndexes.length === 1;
		const status = !mutableShardSet.has(shardId)
			? SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE
			: passed
				? SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL
				: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED;
		shardStates.push({
			shardId,
			status,
			mutable: mutableShardSet.has(shardId),
			baseline: baseline.manifestBinding,
			sourceAttempts: attempts,
			consumedLogicalContentAttempts: consumed,
			remainingLogicalContentAttempts:
				status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED
					? SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS - consumed
					: 0,
			nextLogicalContentOrdinal:
				status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED
					? consumed + 1
					: null,
			...(passed ? { proposal: attempts.at(-1).proposal } : {})
		});
	}
	const attemptedShardIds = shardStates
		.filter((shard) => shard.sourceAttempts.length > 0)
		.map((shard) => shard.shardId);
	if (canonicalHash(globalShardIds) !== canonicalHash(attemptedShardIds)) {
		throw new Error('Global claim shard membership differs from the failed S1 attempt roots.');
	}
	const failedRootInventory = inventoryTree(failedRoot.absolutePath);
	const reviewEvidence = reviewReplay.evidencePaths.map((filePath) =>
		evidenceFileBinding(workspaceRoot, filePath)
	);
	const source = {
		workspaceRoot,
		reviewRebase,
		reviewRebaseManifestPath: reviewRebaseManifest.absolutePath,
		reviewRebaseManifestPathRelative: reviewRebaseManifest.relativePath,
		summary,
		verificationSummaryPath: verificationSummaryPath.absolutePath,
		verificationSummaryPathRelative: verificationSummaryPath.relativePath,
		verificationSummaryFileSha256: sha256(verificationLoaded.bytes),
		verificationSha256,
		reviewReplay,
		reviewEvidence,
		basePlan: basePlanLoaded.value,
		sourceSnapshot: sourceSnapshotLoaded.value,
		curriculumEvidence: curriculumEvidenceLoaded.value,
		authority,
		authoritySha256,
		repairParent: expectedRepairParent,
		repairParentPath,
		repairParentFileSha256: sha256(repairParentLoaded.bytes),
		failedRoot: failedRoot.absolutePath,
		failedRootPath: failedRoot.relativePath,
		failedRootInventory,
		failedRootTreeSha256: canonicalHash(failedRootInventory),
		ledgerRoot,
		ledgerRootPath: workspaceRelative(workspaceRoot, ledgerRoot, 'ledger root'),
		ledgerInventory: inventoryTree(ledgerRoot),
		identity,
		registration,
		sourceOptions,
		baselineByShard,
		shardStates,
		mutableShardIds,
		existingDefinitions: options.existingDefinitions
	};
	return source;
}

function orderedReviewRebaseCandidates(reviewRebase) {
	const candidatesById = new Map();
	for (const batch of reviewRebase.candidateBatches.values()) {
		for (const candidate of batch.challenges) {
			const id = candidate?.definition?.id;
			if (typeof id !== 'string' || candidatesById.has(id)) {
				throw new Error('B0 review-rebase candidates contain a missing or duplicate id.');
			}
			candidatesById.set(id, candidate);
		}
	}
	const ordered = reviewRebase.plan.rows.map((row) => {
		const candidate = candidatesById.get(row.id);
		if (!candidate) throw new Error(`B0 review-rebase candidate ${row.id} is missing.`);
		return structuredClone(candidate);
	});
	if (ordered.length !== candidatesById.size) {
		throw new Error('B0 review-rebase candidates differ from exact plan membership.');
	}
	return ordered;
}

function buildPreparedRecovery({ source, successorRoot }) {
	const proposalRecords = source.shardStates
		.filter(
			(shard) => shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL
		)
		.map((shard) => {
			const sourceProposal = shard.proposal;
			const destinationRoot = path.posix.join(RECOVERY_PROPOSALS_DIRECTORY, shard.shardId);
			const core = {
				schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_PROPOSAL_SCHEMA,
				shardId: shard.shardId,
				physicalAttempt: sourceProposal.physicalAttempt,
				logicalContentOrdinal: sourceProposal.logicalContentOrdinal,
				candidateSha256: sourceProposal.candidateSha256,
				validationSha256: sourceProposal.validationSha256,
				source: {
					candidate: sourceProposal.candidate,
					validation: sourceProposal.validation
				},
				staged: {
					candidatePath: path.posix.join(destinationRoot, 'candidate.json'),
					validationPath: path.posix.join(destinationRoot, 'validation.json')
				}
			};
			return {
				...core,
				proposalBindingSha256: canonicalHash(core)
			};
		});
	const recoveryObjectiveCore = {
		schemaVersion: 'science-challenge-review-rebase-infrastructure-recovery-objective/v1',
		originalObjectiveId: source.identity.objectiveId,
		reviewRebaseManifestSha256: canonicalHash(source.reviewRebase.manifest),
		verificationSha256: source.verificationSha256,
		authoritySha256: source.authoritySha256,
		failedRootPathSha256: canonicalHash(source.failedRootPath),
		failedRootTreeSha256: source.failedRootTreeSha256
	};
	const recoveryId = canonicalHash(recoveryObjectiveCore);
	const recoveryIdentityCore = {
		schemaVersion: 'science-challenge-review-rebase-infrastructure-recovery-execution/v1',
		recoveryId,
		originalObjectiveId: source.identity.objectiveId,
		originalExecutionId: source.identity.executionId,
		reviewRebaseManifestSha256: canonicalHash(source.reviewRebase.manifest),
		verificationSha256: source.verificationSha256,
		authoritySha256: source.authoritySha256,
		failedRootPathSha256: canonicalHash(source.failedRootPath),
		failedRootTreeSha256: source.failedRootTreeSha256,
		successorRootPathSha256: canonicalHash(successorRoot.relativePath)
	};
	const recoveryExecutionId = canonicalHash(recoveryIdentityCore);
	const shardRecords = source.shardStates.map((shard) => ({
		shardId: shard.shardId,
		status: shard.status,
		mutable: shard.mutable,
		baseline: shard.baseline,
		sourceAttempts: shard.sourceAttempts,
		consumedLogicalContentAttempts: shard.consumedLogicalContentAttempts,
		remainingLogicalContentAttempts: shard.remainingLogicalContentAttempts,
		nextLogicalContentOrdinal: shard.nextLogicalContentOrdinal,
		...(shard.proposal
			? {
					proposalBindingSha256: proposalRecords.find(
						(proposal) => proposal.shardId === shard.shardId
					)?.proposalBindingSha256
				}
			: {})
	}));
	const baselineLogicalLedger = shardRecords.map((shard) => ({
		shardId: shard.shardId,
		status: shard.status,
		mutable: shard.mutable,
		sourceAttempts: shard.sourceAttempts.map((attempt) => ({
			physicalAttempt: attempt.physicalAttempt,
			logicalContentOrdinal: attempt.logicalContentOrdinal,
			classification: attempt.classification,
			attemptTreeSha256: attempt.attemptTreeSha256,
			globalClaimSha256: attempt.globalClaim.canonicalSha256
		})),
		consumedLogicalContentAttempts: shard.consumedLogicalContentAttempts,
		nextLogicalContentOrdinal: shard.nextLogicalContentOrdinal
	}));
	const contentNamespaceId = canonicalHash({
		schemaVersion: 'science-challenge-review-rebase-recovery-content-namespace/v1',
		recoveryId,
		recoveryExecutionId,
		successorRootPathSha256: canonicalHash(successorRoot.relativePath),
		logicalContentAttemptLimit: SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS,
		infrastructureInvocationLimit:
			SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT
	});
	const directChildRegistration = directChildRegistrationReference(source.registration);
	const manifestWithoutContinuation = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA,
		disposition:
			'Parent-bound infrastructure recovery; strict pre-model invocations do not consume logical content attempts.',
		recoveryId,
		recoveryExecutionId,
		recoveryObjective: recoveryObjectiveCore,
		recoveryIdentity: recoveryIdentityCore,
		contentNamespaceId,
		failedRootInventorySha256: source.failedRootTreeSha256,
		originalExecutionIdentity: source.identity,
		limits: {
			logicalContentAttemptsPerShard: SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS,
			infrastructureInvocationsPerLogicalSlot:
				SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT
		},
		reviewRebase: {
			manifestPath: source.reviewRebaseManifestPathRelative,
			manifestSha256: canonicalHash(source.reviewRebase.manifest),
			rebaseId: source.reviewRebase.manifest.rebaseId,
			planSha256: canonicalHash(source.reviewRebase.plan),
			candidateSetSha256: source.reviewRebase.manifest.candidateSetSha256
		},
		verification: {
			summaryPath: source.verificationSummaryPathRelative,
			summaryFileSha256: source.verificationSummaryFileSha256,
			summarySha256: source.verificationSha256,
			assignmentIndexSha256: canonicalHash(source.reviewReplay.index),
			rawEvidenceSetSha256: canonicalHash(source.reviewEvidence)
		},
		verificationRepairAuthority: source.authority,
		verificationRepairAuthoritySha256: source.authoritySha256,
		directChildRegistration,
		failedRoot: {
			path: source.failedRootPath,
			pathSha256: canonicalHash(source.failedRootPath),
			treeSha256: source.failedRootTreeSha256,
			repairParentSha256: canonicalHash(source.repairParent),
			repairParentFileSha256: source.repairParentFileSha256
		},
		globalLedger: {
			path: source.ledgerRootPath,
			treeSha256: canonicalHash(source.ledgerInventory),
			objectiveId: source.identity.objectiveId,
			executionId: source.identity.executionId
		},
		successor: {
			path: successorRoot.relativePath,
			pathSha256: canonicalHash(successorRoot.relativePath),
			baselineCandidateSetSha256: source.reviewRebase.manifest.candidateSetSha256
		},
		shards: shardRecords,
		shardStateSetSha256: canonicalHash(shardRecords),
		recoveryProposals: proposalRecords,
		recoveryProposalSetSha256: canonicalHash(proposalRecords),
		preservedProposalSetSha256: canonicalHash(proposalRecords),
		baselineLogicalLedger,
		baselineLogicalLedgerSha256: canonicalHash(baselineLogicalLedger),
		counts: recoveryCounts(shardRecords)
	};
	const originalObjective = scienceChallengeVerificationRepairObjectiveIdentity({
		planSha256: source.identity.planSha256,
		verificationSha256: source.identity.verificationSha256,
		priorCandidateSetSha256: source.identity.priorCandidateSetSha256
	});
	if (!HASH.test(String(source.registration.commitSha256 ?? ''))) {
		throw new Error('Direct-child backfill projection lacks its deterministic commit hash.');
	}
	const continuationLineage = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_KEY_SCHEMA,
		directChildAuthorityLabel: directChildRegistration.authorityLabel,
		directChildLineageKeySha256: directChildRegistration.lineageKeySha256,
		directChildReservationSha256: directChildRegistration.reservationSha256,
		directChildCommitSha256: source.registration.commitSha256,
		originalObjectiveId: originalObjective.objectiveId,
		originalExecutionId: source.identity.executionId
	};
	const continuationAuthority = {
		authorityLabel: SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_REGISTRY_AUTHORITY_LABEL,
		lineageKeySha256: canonicalHash(continuationLineage),
		directChildCommitSha256: source.registration.commitSha256
	};
	const manifest = {
		...manifestWithoutContinuation,
		continuationAuthority
	};
	const continuationOptions = {
		workspaceRoot: source.workspaceRoot,
		directChildRegistration,
		originalObjective,
		originalExecution: source.identity,
		recoveryManifest: manifest,
		successorRoot: successorRoot.absolutePath
	};
	const continuation =
		source.registration.status === 'committed'
			? inspectScienceChallengeReviewRebaseRecoveryContinuationRegistration(continuationOptions)
			: {
					status: 'planned',
					action: 'commit-direct-child-first',
					...continuationAuthority
				};
	const manifestBytes = Buffer.from(`${stableStringify(manifest)}\n`);
	const parentCore = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_PARENT_SCHEMA,
		recoveryId,
		recoveryExecutionId,
		contentNamespaceId,
		failedRootInventorySha256: manifest.failedRootInventorySha256,
		baselineLogicalLedgerSha256: manifest.baselineLogicalLedgerSha256,
		preservedProposalSetSha256: manifest.preservedProposalSetSha256,
		recoveryManifestSha256: canonicalHash(manifest),
		recoveryManifestFileSha256: sha256(manifestBytes),
		originalObjectiveId: source.identity.objectiveId,
		originalExecutionId: source.identity.executionId,
		failedRootPath: source.failedRootPath,
		failedRootPathSha256: canonicalHash(source.failedRootPath),
		failedRootTreeSha256: source.failedRootTreeSha256,
		successorRootPath: successorRoot.relativePath,
		successorRootPathSha256: canonicalHash(successorRoot.relativePath),
		reviewRebaseManifestSha256: canonicalHash(source.reviewRebase.manifest),
		verificationSummarySha256: source.verificationSha256,
		verificationRepairAuthoritySha256: source.authoritySha256,
		verificationRepairParentSha256: canonicalHash(source.repairParent),
		directChildRegistrationSha256: canonicalHash(directChildRegistration),
		continuationAuthoritySha256: canonicalHash(continuationAuthority),
		continuationLineageKeySha256: continuationAuthority.lineageKeySha256,
		recoveryProposalSetSha256: canonicalHash(proposalRecords)
	};
	const parentBinding = { ...parentCore, parentBindingSha256: canonicalHash(parentCore) };
	const prepared = {
		successorRoot: successorRoot.absolutePath,
		successorRootPath: successorRoot.relativePath,
		manifest,
		manifestBytes,
		parentBinding,
		parentBytes: Buffer.from(`${stableStringify(parentBinding)}\n`),
		proposalRecords
	};
	Object.defineProperty(prepared, '_source', {
		value: source,
		enumerable: false,
		configurable: false,
		writable: false
	});
	Object.defineProperty(prepared, '_continuation', {
		value: continuation,
		enumerable: false,
		configurable: false,
		writable: false
	});
	Object.defineProperty(prepared, '_continuationOptions', {
		value: continuationOptions,
		enumerable: false,
		configurable: false,
		writable: false
	});
	return prepared;
}

function buildRuntimeState({ source, successorRoot, prepared, manifest }) {
	const shards = new Map(
		manifest.shards.map((shard) => [
			shard.shardId,
			{
				...shard,
				proposal: shard.proposalBindingSha256
					? prepared.proposalRecords.find(
							(proposal) => proposal.proposalBindingSha256 === shard.proposalBindingSha256
						)
					: null
			}
		])
	);
	return {
		schemaVersion: manifest.schemaVersion,
		recoveryId: manifest.recoveryId,
		recoveryExecutionId: manifest.recoveryExecutionId,
		contentNamespaceId: manifest.contentNamespaceId,
		manifest,
		manifestSha256: canonicalHash(manifest),
		successorRoot: successorRoot.absolutePath,
		successorRootPath: successorRoot.relativePath,
		source,
		shards
	};
}

function inspectRecoveryDownstreamState(state) {
	const repairSha256 = state.manifest.verification.summarySha256;
	const runId = repairSha256.slice(0, 12);
	const transactionDirectory = `verification-repair-${runId}-transaction`;
	const effectiveCohortDirectory = `verification-repair-${runId}-effective-cohort`;
	const generationSummary = `verification-repair-${runId}-summary.json`;
	const transactionRoot = verificationRepairTransactionRoot(state.successorRoot, repairSha256);
	const effectiveCohortRoot = path.join(state.successorRoot, effectiveCohortDirectory);
	const generationSummaryPath = path.join(state.successorRoot, generationSummary);
	const transactionExists = existsSync(transactionRoot);
	const effectiveCohortExists = existsSync(effectiveCohortRoot);
	const generationSummaryExists = existsSync(generationSummaryPath);
	if (!transactionExists) {
		if (effectiveCohortExists || generationSummaryExists) {
			throw new Error(
				'Recovery successor contains downstream artifacts without an authenticated cohort transaction.'
			);
		}
		return {
			phase: 'recovery-in-progress',
			resumeAction: null,
			transactionDirectory,
			effectiveCohortDirectory,
			generationSummary,
			cohortStatus: 'collecting',
			invalidatedAttempts: {},
			invalidatedAttemptSetSha256: canonicalHash({}),
			collectionValidation: null,
			collectionValidationSha256: null,
			collectionProposalBindings: [],
			collectionProposalSetSha256: canonicalHash([]),
			publication: null,
			effectiveCohort: null,
			summary: null
		};
	}
	requireSafeDirectoryChain(state.successorRoot, transactionRoot, {
		allowMissingTail: false,
		label: 'recovery cohort transaction'
	});
	const cohortStatePath = path.join(transactionRoot, 'cohort-state.json');
	if (!existsSync(cohortStatePath)) {
		throw new Error('Recovery cohort transaction has no immutable cohort-state record.');
	}
	const cohortLoaded = readCanonicalJsonFile(cohortStatePath, 'recovery cohort transaction state');
	const cohortReplay = readVerificationRepairCohortState({
		outputRoot: state.successorRoot,
		repairSha256
	});
	requireExactCanonicalValue(
		cohortReplay.state,
		cohortLoaded.value,
		'Recovery cohort transaction replay differs from its canonical state'
	);
	const cohort = cohortReplay.state;
	const publicationReplay = readVerificationRepairPublication({
		outputRoot: state.successorRoot,
		repairSha256
	});
	const journal = publicationReplay.journal;
	const expectedTransactionFiles = new Set(['cohort-state.json']);
	let publication = null;
	if (journal) {
		expectedTransactionFiles.add('publication/journal.json');
		const journalLoaded = readCanonicalJsonFile(
			publicationReplay.journalPath,
			'recovery publication journal'
		);
		requireExactCanonicalValue(
			journalLoaded.value,
			journal,
			'Recovery publication journal differs from transaction replay'
		);
		const records = [...journal.records].sort((left, right) =>
			left.shardId.localeCompare(right.shardId)
		);
		for (const record of records) {
			requireShardId(record.shardId);
			for (const kind of ['candidate', 'validation']) {
				const expectedTarget = path.join(
					state.successorRoot,
					'shards',
					record.shardId,
					`${kind}.json`
				);
				const expectedBackup = path.join(
					transactionRoot,
					'publication',
					'backups',
					record.shardId,
					`${kind}.json`
				);
				const expectedProposal = path.join(
					transactionRoot,
					'publication',
					'proposals',
					record.shardId,
					`${kind}.json`
				);
				if (
					path.resolve(record[kind].targetPath) !== expectedTarget ||
					path.resolve(record[kind].backupPath) !== expectedBackup ||
					path.resolve(record[kind].proposalPath) !== expectedProposal
				) {
					throw new Error(
						`${record.shardId} recovery publication ${kind} paths are not canonical.`
					);
				}
				expectedTransactionFiles.add(`publication/backups/${record.shardId}/${kind}.json`);
				expectedTransactionFiles.add(`publication/proposals/${record.shardId}/${kind}.json`);
			}
		}
		publication = {
			status: journal.status,
			journalSha256: canonicalHash(journal),
			records: records.map((record) => ({
				shardId: record.shardId,
				attempt: record.attempt,
				candidateSha256: record.candidate.proposalCanonicalSha256,
				validationSha256: record.validation.proposalCanonicalSha256,
				expectedTargetCandidateSha256: record.candidate.backupCanonicalSha256,
				expectedTargetValidationSha256: record.validation.backupCanonicalSha256
			}))
		};
	}
	const transactionFiles = listTreeFiles(transactionRoot);
	if (canonicalHash(transactionFiles) !== canonicalHash([...expectedTransactionFiles].sort())) {
		throw new Error('Recovery cohort transaction contains unexpected or missing artifacts.');
	}
	const effectiveCohort = effectiveCohortExists
		? inspectRecoveryEffectiveCohort(state, effectiveCohortRoot)
		: null;
	let phase;
	let resumeAction = null;
	if (journal && ['prepared', 'publishing'].includes(journal.status)) {
		phase = 'publication-interrupted';
		resumeAction = 'recover-publication';
	} else if (journal?.status === 'committed') {
		if (cohort.status !== 'committed') {
			throw new Error('Committed recovery publication has a non-committed cohort state.');
		}
		if (!effectiveCohort) {
			throw new Error('Committed recovery publication has no staged effective cohort.');
		}
		phase = generationSummaryExists ? 'published-with-summary' : 'published';
	} else if (journal?.status === 'rolled-back') {
		if (!['collection-passed', 'committed'].includes(cohort.status)) {
			throw new Error('Rolled-back recovery publication has an incompatible cohort state.');
		}
		phase = effectiveCohort ? 'publication-rolled-back' : 'collection-passed';
	} else if (cohort.status === 'collection-failed') {
		if (effectiveCohort || generationSummaryExists || journal) {
			throw new Error('Collection-failed recovery contains premature downstream artifacts.');
		}
		phase = 'collection-failed';
	} else if (cohort.status === 'collection-passed') {
		if (generationSummaryExists) {
			throw new Error('Unpublished recovery must not contain a generation summary.');
		}
		phase = effectiveCohort ? 'effective-cohort-staged' : 'collection-passed';
	} else {
		throw new Error(`Unsupported recovery cohort transaction phase ${String(cohort.status)}.`);
	}
	const invalidatedAttempts = structuredClone(cohort.invalidatedAttempts ?? {});
	const downstream = {
		phase,
		resumeAction,
		transactionDirectory,
		effectiveCohortDirectory,
		generationSummary,
		cohortStatus: cohort.status,
		cohortStateSha256: canonicalHash(cohort),
		invalidatedAttempts,
		invalidatedAttemptSetSha256: canonicalHash(invalidatedAttempts),
		collectionValidation: cohort.collectionValidation ?? null,
		collectionValidationSha256:
			cohort.collectionValidation === undefined ? null : canonicalHash(cohort.collectionValidation),
		collectionProposalBindings: structuredClone(cohort.proposals ?? []),
		collectionProposalSetSha256: canonicalHash(cohort.proposals ?? []),
		publication,
		effectiveCohort,
		summary: null
	};
	if (generationSummaryExists) {
		downstream.summary = inspectRecoveryGenerationSummary(state, generationSummaryPath, downstream);
	}
	return downstream;
}

function inspectRecoveryEffectiveCohort(state, directory) {
	requireSafeDirectoryChain(state.successorRoot, directory, {
		allowMissingTail: false,
		label: 'recovery effective cohort'
	});
	const manifestPath = path.join(directory, 'manifest.json');
	const manifestLoaded = readCanonicalJsonFile(manifestPath, 'recovery effective-cohort manifest');
	const manifest = manifestLoaded.value;
	const { manifestCoreSha256, ...manifestCore } = manifest;
	const basePlan = readRecoveryValueReference(
		state.successorRoot,
		manifest.plans?.base,
		'effective-cohort base plan'
	);
	const effectivePlan = readRecoveryValueReference(
		state.successorRoot,
		manifest.plans?.effective,
		'effective-cohort effective plan'
	);
	const reviewSummary = readRecoveryValueReference(
		state.successorRoot,
		manifest.review?.summary,
		'effective-cohort review summary'
	);
	const authority = readRecoveryValueReference(
		state.successorRoot,
		manifest.verificationRepairAuthority,
		'effective-cohort authority'
	);
	const collectionValidation = readRecoveryValueReference(
		state.successorRoot,
		manifest.collectionValidation,
		'effective-cohort collection validation'
	);
	if (
		manifest.schemaVersion !== 'science-challenge-effective-cohort/v1' ||
		manifest.disposition !== 'review-pending-effective-cohort-successor' ||
		manifestCoreSha256 !== canonicalHash(manifestCore) ||
		manifest.repairSha256 !== state.manifest.verification.summarySha256 ||
		manifest.objectiveId !== state.manifest.originalExecutionIdentity.objectiveId ||
		manifest.executionId !== state.manifest.originalExecutionIdentity.executionId ||
		manifest.sourceSnapshotSha256 !== canonicalHash(state.source.sourceSnapshot) ||
		manifest.curriculumEvidenceSha256 !== canonicalHash(state.source.curriculumEvidence) ||
		manifest.basePlanSha256 !== canonicalHash(state.source.basePlan) ||
		manifest.effectivePlanSha256 !== canonicalHash(state.source.reviewRebase.plan) ||
		canonicalHash(basePlan) !== canonicalHash(state.source.basePlan) ||
		canonicalHash(effectivePlan) !== canonicalHash(state.source.reviewRebase.plan) ||
		canonicalHash(reviewSummary) !== canonicalHash(state.source.summary) ||
		canonicalHash(authority) !== canonicalHash(state.source.authority) ||
		manifest.verificationRepairAuthoritySha256 !== canonicalHash(authority) ||
		manifest.collectionValidationSha256 !== canonicalHash(collectionValidation) ||
		collectionValidation?.status !== 'passed' ||
		(collectionValidation?.issues?.length ?? 0) !== 0
	) {
		throw new Error(
			'Recovery effective-cohort identities differ from authenticated source evidence.'
		);
	}
	const expectedShardIds = [...state.shards.keys()].sort();
	const actualShardIds = Array.isArray(manifest.shards)
		? manifest.shards.map((shard) => shard?.shardId).sort()
		: [];
	if (
		actualShardIds.length !== expectedShardIds.length ||
		new Set(actualShardIds).size !== actualShardIds.length ||
		canonicalHash(actualShardIds) !== canonicalHash(expectedShardIds)
	) {
		throw new Error('Recovery effective cohort has duplicate, missing, or unexpected shards.');
	}
	const expectedFiles = new Set([
		'base-plan.json',
		'effective-plan.json',
		'review-summary.json',
		'verification-repair-authority.json',
		'collection-validation.json',
		'manifest.json'
	]);
	const candidateById = new Map();
	const shardBindings = [];
	for (const shard of manifest.shards) {
		for (const kind of ['candidate', 'validation']) {
			const expectedRelative = `${path.basename(directory)}/shards/${shard.shardId}/${kind}.json`;
			if (shard[kind]?.path !== expectedRelative) {
				throw new Error(`${shard.shardId} effective-cohort ${kind} path is not canonical.`);
			}
			const value = readRecoveryValueReference(
				state.successorRoot,
				shard[kind],
				`${shard.shardId} effective-cohort ${kind}`
			);
			if (kind === 'candidate') {
				for (const challenge of value.challenges ?? []) {
					const id = challenge?.definition?.id;
					if (typeof id !== 'string' || candidateById.has(id)) {
						throw new Error('Recovery effective cohort has duplicate or malformed candidates.');
					}
					candidateById.set(id, challenge);
				}
			}
			shardBindings.push({
				shardId: shard.shardId,
				kind,
				canonicalSha256: canonicalHash(value)
			});
			expectedFiles.add(`shards/${shard.shardId}/${kind}.json`);
		}
	}
	const orderedIds = manifest.orderedChallengeIds;
	const candidateSet = Array.isArray(orderedIds)
		? orderedIds.map((id) => candidateById.get(id))
		: [];
	if (
		!Array.isArray(orderedIds) ||
		new Set(orderedIds).size !== orderedIds.length ||
		candidateSet.some((candidate) => candidate === undefined) ||
		candidateSet.length !== candidateById.size ||
		manifest.orderedChallengeIdsSha256 !== canonicalHash(orderedIds) ||
		manifest.candidateSetSha256 !== canonicalHash(candidateSet) ||
		collectionValidation.candidateSetSha256 !== canonicalHash(candidateSet) ||
		collectionValidation.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		canonicalHash(listTreeFiles(directory)) !== canonicalHash([...expectedFiles].sort())
	) {
		throw new Error('Recovery effective-cohort candidate set or closed-world tree is stale.');
	}
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(
		manifest.infrastructureRecovery
	);
	return {
		manifestPath: workspaceRelative(
			state.source.workspaceRoot,
			manifestPath,
			'recovery effective-cohort manifest'
		),
		manifestSha256: canonicalHash(manifest),
		candidateSetSha256: manifest.candidateSetSha256,
		infrastructureRecovery: structuredClone(manifest.infrastructureRecovery),
		collectionValidationSha256: canonicalHash(collectionValidation),
		shardBindings: shardBindings.sort(
			(left, right) =>
				left.shardId.localeCompare(right.shardId) || left.kind.localeCompare(right.kind)
		),
		treeSha256: canonicalHash(inventoryTree(directory))
	};
}

function readRecoveryValueReference(root, reference, label) {
	requireRecord(reference, `${label} reference`);
	if (
		typeof reference.path !== 'string' ||
		!reference.path ||
		!HASH.test(String(reference.sha256 ?? '')) ||
		!HASH.test(String(reference.canonicalSha256 ?? ''))
	) {
		throw new Error(`${label} reference is invalid.`);
	}
	const resolved = resolveWorkspacePath(root, reference.path, {
		label,
		allowMissing: false,
		requireFile: true
	});
	const loaded = readCanonicalJsonFile(resolved.absolutePath, label);
	if (
		sha256(loaded.bytes) !== reference.sha256 ||
		canonicalHash(loaded.value) !== reference.canonicalSha256
	) {
		throw new Error(`${label} differs from its hash binding.`);
	}
	return loaded.value;
}

function inspectRecoveryGenerationSummary(state, summaryPath, downstream) {
	const loaded = readCanonicalJsonFile(summaryPath, 'recovery generation summary');
	const summary = loaded.value;
	const mutableShardIds = [...state.shards.values()]
		.filter((shard) => shard.mutable)
		.map((shard) => shard.shardId)
		.sort();
	if (
		summary.schemaVersion !== 'science-challenge-generation-summary/v1' ||
		summary.verificationRepairSha256 !== state.manifest.verification.summarySha256 ||
		canonicalHash(summary.verificationRepairAuthority) !== state.source.authoritySha256 ||
		summary.verificationRepairAuthoritySha256 !== state.source.authoritySha256 ||
		canonicalHash(summary.verificationRepairExecutionIdentity) !==
			canonicalHash(state.source.identity) ||
		summary.planSha256 !== canonicalHash(state.source.reviewRebase.plan) ||
		summary.sourceSnapshotSha256 !== canonicalHash(state.source.sourceSnapshot) ||
		summary.curriculumEvidenceSha256 !== canonicalHash(state.source.curriculumEvidence) ||
		summary.reviewRebaseInfrastructureRecoveryManifestSha256 !== state.manifestSha256 ||
		summary.reviewRebaseInfrastructureRecoveryId !== state.recoveryId ||
		summary.reviewRebaseInfrastructureRecoveryExecutionId !== state.recoveryExecutionId ||
		summary.reviewRebaseInfrastructureRecoveryPreservedProposalSetSha256 !==
			state.manifest.preservedProposalSetSha256 ||
		summary.reviewRebaseInfrastructureRecoveryManifestPath !==
			workspaceRelative(
				state.source.workspaceRoot,
				path.join(state.successorRoot, MANIFEST_FILE),
				'recovery manifest'
			) ||
		canonicalHash([...(summary.selectedShards ?? [])].sort()) !== canonicalHash(mutableShardIds) ||
		canonicalHash(summary.collectionValidation) !==
			canonicalHash(downstream.collectionValidation) ||
		!downstream.effectiveCohort ||
		!downstream.publication ||
		downstream.publication.status !== 'committed' ||
		!['review-pending', 'passed'].includes(summary.status)
	) {
		throw new Error('Recovery generation summary differs from exact terminal replay.');
	}
	return {
		path: workspaceRelative(state.source.workspaceRoot, summaryPath, 'recovery generation summary'),
		sha256: sha256(loaded.bytes),
		canonicalSha256: canonicalHash(summary),
		status: summary.status
	};
}

function validateRecoveryTopLevelPhase({ state, downstream, successorTree }) {
	const publicationByShard = new Map(
		(downstream.publication?.records ?? []).map((record) => [record.shardId, record])
	);
	const changed = [];
	for (const [shardId] of state.shards) {
		const baseline = state.source.baselineByShard.get(shardId);
		const candidate = readCanonicalJsonFile(
			path.join(state.successorRoot, 'shards', shardId, 'candidate.json'),
			`${shardId} top-level candidate`
		);
		const validation = readCanonicalJsonFile(
			path.join(state.successorRoot, 'shards', shardId, 'validation.json'),
			`${shardId} top-level validation`
		);
		const current = {
			candidateSha256: canonicalHash(candidate.value),
			validationSha256: canonicalHash(validation.value)
		};
		const baselineHashes = {
			candidateSha256: canonicalHash(baseline.candidate),
			validationSha256: canonicalHash(baseline.validation)
		};
		const proposal = publicationByShard.get(shardId);
		const proposalHashes = proposal
			? {
					candidateSha256: proposal.candidateSha256,
					validationSha256: proposal.validationSha256
				}
			: null;
		if (canonicalHash(current) !== canonicalHash(baselineHashes)) changed.push(shardId);
		if (
			downstream.publication?.status === 'committed'
				? proposal
					? canonicalHash(current) !== canonicalHash(proposalHashes)
					: canonicalHash(current) !== canonicalHash(baselineHashes)
				: downstream.publication?.status === 'publishing'
					? ![canonicalHash(baselineHashes), canonicalHash(proposalHashes)].includes(
							canonicalHash(current)
						)
					: canonicalHash(current) !== canonicalHash(baselineHashes)
		) {
			throw new Error(`${shardId} top-level bytes are incompatible with publication phase.`);
		}
	}
	if (canonicalHash(changed.sort()) !== canonicalHash(successorTree.changedTopLevelShardIds)) {
		throw new Error('Recovery top-level shard change inventory is stale.');
	}
}

function buildExpectedRepairParent({
	workspaceRoot,
	reviewRebase,
	basePlan,
	sourceSnapshot,
	curriculumEvidence,
	verificationSummaryPath,
	summary,
	reviewReplay,
	authority
}) {
	const sourceOutputs = reviewRebase.manifest.evidence.outputs.shards
		.map((record) => ({
			shardId: record.shardId,
			candidate: structuredClone(record.candidate),
			validation: structuredClone(record.validation)
		}))
		.sort((left, right) => left.shardId.localeCompare(right.shardId));
	for (const output of sourceOutputs) {
		const candidate = reviewRebase.candidateBatches.get(output.shardId);
		const validation = reviewRebase.outputValidations.get(output.shardId);
		if (
			!candidate ||
			!validation ||
			output.candidate.canonicalSha256 !== canonicalHash(candidate) ||
			output.validation.canonicalSha256 !== canonicalHash(validation)
		) {
			throw new Error(`B0 source output binding is stale for ${output.shardId}.`);
		}
	}
	const assignmentIndexPath = path.join(
		path.dirname(verificationSummaryPath.absolutePath),
		'assignment-index.json'
	);
	return {
		schemaVersion: 'science-challenge-review-rebase-repair-parent/v1',
		reviewRebaseManifestPath: reviewRebase.manifestPathRelative,
		reviewRebaseManifestSha256: canonicalHash(reviewRebase.manifest),
		reviewRebaseId: reviewRebase.manifest.rebaseId,
		basePlanSha256: canonicalHash(basePlan),
		planSha256: canonicalHash(reviewRebase.plan),
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
		candidateSetSha256: reviewRebase.manifest.candidateSetSha256,
		collectionValidationSha256: reviewRebase.manifest.collectionValidationSha256,
		collectionRemediationSetSha256: reviewRebase.manifest.collectionRemediationSetSha256,
		collectionRemediations: structuredClone(reviewRebase.manifest.collectionRemediations),
		collectionRemediationTargetIds: structuredClone(authority.collectionRemediationTargetIds),
		collectionRemediationTargetSetSha256: authority.collectionRemediationTargetSetSha256,
		verificationSummaryPath: verificationSummaryPath.relativePath,
		verificationSummarySha256: canonicalHash(summary),
		verificationAssignmentIndexPath: workspaceRelative(
			workspaceRoot,
			assignmentIndexPath,
			'verification assignment index'
		),
		verificationAssignmentIndexSha256: canonicalHash(reviewReplay.index),
		verificationRepairAuthority: structuredClone(authority),
		verificationRepairAuthoritySha256: canonicalHash(authority),
		mutableChallengeIds: structuredClone(authority.mutableChallengeIds),
		mutableChallengeSetSha256: authority.mutableChallengeSetSha256,
		sourceOutputs,
		sourceOutputSetSha256: canonicalHash(sourceOutputs)
	};
}

function loadAndAuthenticateBaselines({ workspaceRoot, reviewRebase, failedRoot, repairParent }) {
	const result = new Map();
	const parentOutputByShard = new Map(
		repairParent.sourceOutputs.map((output) => [output.shardId, output])
	);
	for (const shardId of [...reviewRebase.candidateBatches.keys()].sort()) {
		const sourceOutput = parentOutputByShard.get(shardId);
		if (!sourceOutput) throw new Error(`${shardId} is absent from repair-parent source outputs.`);
		const sourceCandidatePath = resolveWorkspacePath(workspaceRoot, sourceOutput.candidate.path, {
			label: `${shardId} B0 candidate`,
			allowMissing: false,
			requireFile: true
		}).absolutePath;
		const sourceValidationPath = resolveWorkspacePath(workspaceRoot, sourceOutput.validation.path, {
			label: `${shardId} B0 validation`,
			allowMissing: false,
			requireFile: true
		}).absolutePath;
		const candidateBytes = readFileSync(sourceCandidatePath);
		const validationBytes = readFileSync(sourceValidationPath);
		const candidate = JSON.parse(candidateBytes.toString('utf8'));
		const validation = JSON.parse(validationBytes.toString('utf8'));
		if (
			sha256(candidateBytes) !== sourceOutput.candidate.fileSha256 ||
			canonicalHash(candidate) !== sourceOutput.candidate.canonicalSha256 ||
			sha256(validationBytes) !== sourceOutput.validation.fileSha256 ||
			canonicalHash(validation) !== sourceOutput.validation.canonicalSha256
		) {
			throw new Error(`${shardId} B0 candidate/validation bytes differ from their manifest.`);
		}
		const failedCandidatePath = path.join(failedRoot, 'shards', shardId, 'candidate.json');
		const failedValidationPath = path.join(failedRoot, 'shards', shardId, 'validation.json');
		if (
			!readFileSync(failedCandidatePath).equals(candidateBytes) ||
			!readFileSync(failedValidationPath).equals(validationBytes)
		) {
			throw new Error(
				`${shardId} failed S1 top-level baseline differs from exact B0 bytes; unpublished proposals must not replace it.`
			);
		}
		result.set(shardId, {
			candidate,
			validation,
			candidateBytes,
			validationBytes,
			sourceCandidatePath,
			sourceValidationPath,
			failedCandidatePath,
			failedValidationPath,
			manifestBinding: {
				candidate: structuredClone(sourceOutput.candidate),
				validation: structuredClone(sourceOutput.validation)
			}
		});
	}
	return result;
}

/**
 * Require the closed attempt-envelope namespace used by both historical
 * verification-repair attempts and recovery-only invocations. Partial mode is
 * intentionally structural: it permits a crash-truncated subset of the known
 * files, but never an unrecognised file, directory, symlink, or part id.
 */
export function validateScienceChallengeReviewRebaseAttemptEvidenceTree({
	attemptDirectory,
	summary = null,
	allowClaimFile = false,
	allowCompletionFile = false,
	allowPartial = false,
	expectedPartIds = null
}) {
	const root = path.resolve(attemptDirectory);
	if (!existsSync(root)) throw new Error('Recovery attempt evidence directory is missing.');
	const rootStat = lstatSync(root);
	if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
		throw new Error('Recovery attempt evidence must be a non-symlink directory.');
	}
	const files = [];
	const directories = [];
	const visit = (directory, prefix = '') => {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
			left.name.localeCompare(right.name)
		)) {
			if (entry.isSymbolicLink()) {
				throw new Error('Recovery attempt evidence contains a symbolic link.');
			}
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			const absolute = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				directories.push(relative);
				visit(absolute, relative);
			} else if (entry.isFile()) {
				files.push(relative);
			} else {
				throw new Error('Recovery attempt evidence contains a non-regular filesystem object.');
			}
		}
	};
	visit(root);

	const suppliedPartIds =
		summary === null
			? null
			: Array.isArray(summary?.parts)
				? summary.parts.map((record, index) => {
						const expected = `part-${String(index + 1).padStart(2, '0')}`;
						if (record?.partId !== expected) {
							throw new Error(`Recovery attempt summary part ${index + 1} must be ${expected}.`);
						}
						return expected;
					})
				: (() => {
						throw new Error('Recovery attempt summary has no ordered multipart records.');
					})();
	const allowedPartIds =
		suppliedPartIds ??
		(Array.isArray(expectedPartIds)
			? expectedPartIds.map((partId) => {
					scienceChallengeMultipartPartPaths(partId);
					return partId;
				})
			: []);
	if (
		Array.isArray(expectedPartIds) &&
		suppliedPartIds !== null &&
		canonicalHash(suppliedPartIds) !== canonicalHash(expectedPartIds)
	) {
		throw new Error('Recovery attempt multipart membership differs from its shard-bound policy.');
	}
	const allowedFiles = new Set([
		...ATTEMPT_TOP_LEVEL_EVIDENCE_FILES,
		...ATTEMPT_OPTIONAL_TOP_LEVEL_EVIDENCE_FILES,
		...(allowClaimFile ? ['claim.json'] : []),
		...(allowCompletionFile ? ['completion.json'] : []),
		...allowedPartIds.flatMap((partId) => Object.values(scienceChallengeMultipartPartPaths(partId)))
	]);
	const requiredFiles = new Set(
		allowPartial
			? [...(allowClaimFile ? ['claim.json'] : [])]
			: [
					...ATTEMPT_TOP_LEVEL_EVIDENCE_FILES,
					...(allowClaimFile ? ['claim.json'] : []),
					...(allowCompletionFile ? ['completion.json'] : []),
					...allowedPartIds.flatMap((partId) =>
						Object.values(scienceChallengeMultipartPartPaths(partId))
					)
				]
	);
	for (const relative of files) {
		if (!allowedFiles.has(relative)) {
			throw new Error(`Recovery attempt evidence contains unexpected artifact ${relative}.`);
		}
		requiredFiles.delete(relative);
	}
	if (requiredFiles.size > 0) {
		throw new Error(
			`Recovery attempt evidence is missing artifacts: ${[...requiredFiles].sort().join(', ')}.`
		);
	}
	const allowedDirectories = new Set([
		'parts',
		...allowedPartIds.map((partId) => `parts/${partId}`)
	]);
	for (const relative of directories) {
		if (!allowedDirectories.has(relative)) {
			throw new Error(`Recovery attempt evidence contains unexpected directory ${relative}.`);
		}
	}
	if (!allowPartial) {
		const expectedDirectories =
			allowedPartIds.length === 0
				? new Set()
				: new Set(['parts', ...allowedPartIds.map((partId) => `parts/${partId}`)]);
		if (canonicalHash([...directories].sort()) !== canonicalHash([...expectedDirectories].sort())) {
			throw new Error('Recovery attempt evidence multipart directories are incomplete or stale.');
		}
	}
	return {
		status: 'passed',
		files: [...files].sort(),
		directories: [...directories].sort()
	};
}

function classifyAttemptDirectory({
	attemptDirectory,
	shardId,
	physicalAttempt,
	source,
	baseline,
	allowClaimFile = false,
	allowCompletionFile = false
}) {
	const summaryLoaded = readCanonicalJsonFile(
		path.join(attemptDirectory, 'run-summary.json'),
		`${shardId} attempt ${physicalAttempt} run summary`
	);
	const validationLoaded = readCanonicalJsonFile(
		path.join(attemptDirectory, 'validation.json'),
		`${shardId} attempt ${physicalAttempt} validation`
	);
	const summary = summaryLoaded.value;
	const validation = validationLoaded.value;
	const eventLogBytes = readFileSync(path.join(attemptDirectory, 'events.jsonl'));
	const lastMessageBytes = readFileSync(path.join(attemptDirectory, 'last-message.json'));
	const candidatePath = path.join(attemptDirectory, 'candidate.json');
	const candidateLoaded = existsSync(candidatePath)
		? readCanonicalJsonFile(candidatePath, `${shardId} attempt ${physicalAttempt} candidate`)
		: null;
	validateScienceChallengeReviewRebaseAttemptEvidenceTree({
		attemptDirectory,
		summary,
		allowClaimFile,
		allowCompletionFile,
		allowPartial: false
	});
	const inventory = inventoryTree(attemptDirectory, {
		exclude: allowCompletionFile ? new Set(['completion.json']) : new Set()
	});
	validateAttemptEnvelope({
		shardId,
		physicalAttempt,
		attemptDirectory,
		summary,
		validation,
		eventLogBytes,
		lastMessageBytes,
		candidateLoaded,
		source,
		baseline
	});
	let classification = SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED;
	let proposal = null;
	if (validation.status === 'passed') {
		if (!candidateLoaded) {
			throw new Error(`${shardId} passed attempt ${physicalAttempt} has no candidate bytes.`);
		}
		validatePassedProposal({
			shardId,
			physicalAttempt,
			candidate: candidateLoaded.value,
			validation,
			source,
			baseline
		});
		classification = SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED;
		proposal = {
			physicalAttempt,
			candidateSha256: canonicalHash(candidateLoaded.value),
			validationSha256: canonicalHash(validation),
			candidate: fileBinding(source.workspaceRoot, candidatePath),
			validation: fileBinding(source.workspaceRoot, path.join(attemptDirectory, 'validation.json'))
		};
	} else if (
		isStrictPreModelAttempt({
			summary,
			validation,
			eventLogBytes,
			lastMessageBytes,
			candidateLoaded,
			attemptDirectory
		})
	) {
		classification = SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT;
	}
	return {
		classification,
		proposal,
		evidenceInventory: inventory,
		evidenceInventorySha256: canonicalHash(inventory),
		attemptTreeSha256: canonicalHash(inventory)
	};
}

function expectedRecoveryPartIds(state, shardId) {
	const rows = state.source?.reviewRebase?.plan?.rows?.filter((row) => row.shard === shardId);
	const partSize =
		state.manifest?.originalExecutionIdentity?.directPartSize ??
		state.source?.identity?.directPartSize;
	if (!Array.isArray(rows) || rows.length === 0 || !Number.isInteger(partSize) || partSize < 1) {
		return [];
	}
	return Array.from(
		{ length: Math.ceil(rows.length / partSize) },
		(_, index) => `part-${String(index + 1).padStart(2, '0')}`
	);
}

function validateAttemptEnvelope({
	shardId,
	physicalAttempt,
	attemptDirectory,
	summary,
	validation,
	eventLogBytes,
	lastMessageBytes,
	candidateLoaded,
	source,
	baseline
}) {
	const label = `${shardId} attempt ${physicalAttempt}`;
	if (
		summary?.schemaVersion !== 'science-challenge-llm-direct-json-multipart-summary/v1' ||
		summary.transport !== source.identity.transport ||
		summary.responseMode !== source.identity.responseMode ||
		summary.model !== source.identity.model ||
		summary.thinkingLevel !== source.identity.thinkingLevel ||
		summary.partSize !== source.identity.directPartSize ||
		summary.eventLogSha256 !== sha256(eventLogBytes) ||
		summary.finalResponseSha256 !== sha256(lastMessageBytes) ||
		summary.lastMessageFileSha256 !== sha256(lastMessageBytes)
	) {
		throw new Error(`${label} run summary differs from its claimed execution or top-level bytes.`);
	}
	const validationMismatches = [];
	for (const [field, actual, expected] of [
		['verificationRepairSha256', validation.verificationRepairSha256, source.verificationSha256],
		[
			'verificationRepairAuthoritySha256',
			validation.verificationRepairAuthoritySha256,
			source.authoritySha256
		],
		[
			'verificationRepairAuthority',
			canonicalHash(validation.verificationRepairAuthority),
			source.authoritySha256
		],
		['priorCandidateSha256', validation.priorCandidateSha256, canonicalHash(baseline.candidate)],
		['runSummarySha256', validation.runSummarySha256, canonicalHash(summary)],
		['transport', validation.transport, source.identity.transport],
		['model', validation.model, source.identity.model],
		['thinkingLevel', validation.thinkingLevel, source.identity.thinkingLevel]
	]) {
		if (actual !== expected) validationMismatches.push(field);
	}
	// The earliest historical failed validations predate persistence of these optional
	// invocation fields. Their immutable global claim and run summary still bind the
	// exact policy, so they are conservatively content-bearing/indeterminate. Missing
	// values are never eligible for the strict pre-model exemption or a passed proposal.
	for (const [field, expected] of [
		['responseMode', source.identity.responseMode],
		['directPartSize', source.identity.directPartSize]
	]) {
		const actual = validation[field];
		if (actual !== null && actual !== undefined && actual !== expected) {
			validationMismatches.push(field);
		}
	}
	if (
		validation.transportVersion !== null &&
		validation.transportVersion !== undefined &&
		validation.transportVersion !== summary.transportVersion
	) {
		validationMismatches.push('transportVersion');
	}
	if (validationMismatches.length > 0) {
		throw new Error(
			`${label} validation differs from B0/V1 authority or run evidence: ${validationMismatches.join(
				', '
			)}.`
		);
	}
	if (
		validation.candidateSha256 !== (candidateLoaded ? canonicalHash(candidateLoaded.value) : null)
	) {
		throw new Error(`${label} validation candidate hash differs from candidate presence/bytes.`);
	}
	if (!Array.isArray(summary.parts) || summary.partsSha256 !== canonicalHash(summary.parts)) {
		throw new Error(`${label} multipart records are missing or stale.`);
	}
	const multipart = readScienceChallengeDirectMultipartEvidence({
		attemptDir: attemptDirectory,
		summary
	});
	if (multipart.parts.length !== summary.parts.length) {
		throw new Error(`${label} multipart evidence count is stale.`);
	}
	for (const [index, part] of multipart.parts.entries()) {
		const record = summary.parts[index];
		const hashes = {
			promptSha256: sha256(part.promptBytes),
			requestSha256: sha256(part.requestBytes),
			eventLogSha256: sha256(part.eventLogBytes),
			rawOutputSha256: sha256(part.lastMessageBytes),
			thoughtsSha256: sha256(part.thoughtsBytes),
			resultMetadataSha256: sha256(part.resultMetadataBytes),
			runSummarySha256: canonicalHash(part.summary)
		};
		for (const [field, expected] of Object.entries(hashes)) {
			if (record[field] !== expected) {
				throw new Error(`${label} ${record.partId} ${field} differs from persisted bytes.`);
			}
		}
		const wrapperEvents = parseJsonLines(eventLogBytes, `${label} top-level multipart event log`);
		const wrapper = wrapperEvents[index];
		if (
			!wrapper ||
			wrapper.type !== 'part.finished' ||
			wrapper.partId !== record.partId ||
			wrapper.runSummarySha256 !== record.runSummarySha256 ||
			wrapper.rawOutputSha256 !== record.rawOutputSha256 ||
			wrapper.status !== record.status
		) {
			throw new Error(`${label} ${record.partId} wrapper event binding is stale.`);
		}
		if (record.status === 'passed') {
			const policy = validateScienceChallengeDirectPromptJsonRunPolicy({
				summary: part.summary,
				eventLogBytes: part.eventLogBytes,
				lastMessageBytes: part.lastMessageBytes,
				promptBytes: part.promptBytes,
				requestBytes: part.requestBytes,
				thoughtsBytes: part.thoughtsBytes,
				resultMetadataBytes: part.resultMetadataBytes,
				expectedResponseJsonSchema: challengeBatchOutputSchema(record.rowIds.length)
			});
			if (policy.status !== 'passed') {
				throw new Error(
					`${label} ${record.partId} passed model evidence is invalid:\n${policy.issues.join('\n')}`
				);
			}
		} else {
			validateFailedPartEvidence({ label, record, part });
		}
	}
	const wrapperEvents = parseJsonLines(eventLogBytes, `${label} top-level multipart event log`);
	const expectedWrapperCount = summary.parts.length + (summary.status === 'passed' ? 1 : 0);
	if (wrapperEvents.length !== expectedWrapperCount) {
		throw new Error(`${label} top-level wrapper event count is stale.`);
	}
	if (summary.status === 'passed') {
		const terminal = wrapperEvents.at(-1);
		if (
			terminal.type !== 'multipart.completed' ||
			terminal.mergedCandidateSha256 !== summary.mergedCandidateSha256
		) {
			throw new Error(`${label} multipart completion event is stale.`);
		}
	}
}

function validateFailedPartEvidence({ label, record, part }) {
	const summary = part.summary;
	const mismatches = [];
	if (summary.status !== 'failed') mismatches.push('status');
	if (typeof summary.error !== 'string' || !summary.error.trim()) mismatches.push('error');
	for (const [field, bytes, nullableWhenEmpty = false] of [
		['eventLogSha256', part.eventLogBytes],
		['finalResponseSha256', part.lastMessageBytes],
		['lastMessageFileSha256', part.lastMessageBytes],
		['thoughtsSha256', part.thoughtsBytes],
		['resultMetadataSha256', part.resultMetadataBytes, true],
		['requestSha256', part.requestBytes]
	]) {
		const expected = sha256(bytes);
		if (
			summary[field] !== expected &&
			!(nullableWhenEmpty && bytes.length === 0 && summary[field] === null)
		) {
			mismatches.push(field);
		}
	}
	if (mismatches.length > 0) {
		throw new Error(
			`${label} ${record.partId} failed evidence has stale fields: ${mismatches.join(', ')}.`
		);
	}
	if (
		record.rawOutputSha256 !== sha256(part.lastMessageBytes) ||
		record.thoughtsSha256 !== sha256(part.thoughtsBytes) ||
		record.resultMetadataSha256 !== sha256(part.resultMetadataBytes)
	) {
		throw new Error(`${label} ${record.partId} failed record differs from persisted evidence.`);
	}
}

function validatePassedProposal({
	shardId,
	physicalAttempt,
	candidate,
	validation,
	source,
	baseline
}) {
	const rows = source.reviewRebase.plan.rows.filter((row) => row.shard === shardId);
	const sourceById = new Map(
		source.sourceSnapshot.questions.map((question) => [
			question.id,
			{
				...question,
				contentSha256: question.contentSha256 ?? canonicalHash(question)
			}
		])
	);
	const curriculumById = new Map(
		source.curriculumEvidence.components.map((component) => [component.componentId, component])
	);
	const batchValidation = validateScienceChallengeGeneratedBatch(candidate, rows, {
		sourceById,
		curriculumById,
		existingDefinitions: source.existingDefinitions,
		planRows: source.reviewRebase.plan.rows
	});
	const repairValidation = validateVerificationRepairCandidate({
		candidate,
		priorCandidate: baseline.candidate,
		rows,
		reviews: source.reviewsById,
		verificationRepairAuthority: source.authority
	});
	if (
		candidate.schemaVersion !== SCIENCE_CHALLENGE_BATCH_SCHEMA ||
		validation.status !== 'passed' ||
		!Array.isArray(validation.issues) ||
		validation.issues.length !== 0 ||
		validation.responseMode !== source.identity.responseMode ||
		validation.directPartSize !== source.identity.directPartSize ||
		validation.transportVersion !== 'science-challenge-llm-direct-prompt-json-multipart/v1' ||
		batchValidation.status !== 'passed' ||
		repairValidation.status !== 'passed'
	) {
		throw new Error(
			`${shardId} attempt ${physicalAttempt} terminal proposal fails deterministic validation:\n${[
				...(validation.issues ?? []),
				...batchValidation.issues,
				...repairValidation.issues
			].join('\n')}`
		);
	}
}

function isStrictPreModelAttempt({
	summary,
	validation,
	eventLogBytes,
	lastMessageBytes,
	candidateLoaded,
	attemptDirectory
}) {
	if (
		candidateLoaded !== null ||
		lastMessageBytes.length !== 0 ||
		summary.status !== 'failed' ||
		summary.error !== 'fetch failed' ||
		summary.completedPartCount !== 0 ||
		summary.attemptedPartCount !== 1 ||
		summary.mergedCandidateSha256 !== null ||
		summary.modelVersion !== null ||
		!Array.isArray(summary.modelVersions) ||
		summary.modelVersions.length !== 0 ||
		!isZeroUsage(summary.usage) ||
		summary.costUsd !== 0 ||
		validation.status !== 'failed' ||
		validation.candidateSha256 !== null ||
		validation.rawCandidateSha256 !== null ||
		validation.modelVersion !== null ||
		(validation.responseMode !== null &&
			validation.responseMode !== undefined &&
			validation.responseMode !== summary.responseMode) ||
		(validation.directPartSize !== null &&
			validation.directPartSize !== undefined &&
			validation.directPartSize !== summary.partSize) ||
		(validation.transportVersion !== null &&
			validation.transportVersion !== undefined &&
			validation.transportVersion !== summary.transportVersion)
	) {
		return false;
	}
	if (
		!Array.isArray(summary.parts) ||
		summary.parts.length !== 1 ||
		parseJsonLines(eventLogBytes, 'pre-model multipart wrapper log').length !== 1
	) {
		return false;
	}
	const multipart = readScienceChallengeDirectMultipartEvidence({
		attemptDir: attemptDirectory,
		summary
	});
	const part = multipart.parts[0];
	const record = summary.parts[0];
	const forbiddenKeyValue = findForbiddenOutputIdentity({
		summary,
		record,
		partSummary: part.summary
	});
	return (
		forbiddenKeyValue === null &&
		record.status === 'failed' &&
		record.rawCandidateSha256 === null &&
		record.modelVersion === null &&
		record.provider === null &&
		record.usage === null &&
		record.costUsd === null &&
		part.eventLogBytes.length === 0 &&
		part.lastMessageBytes.length === 0 &&
		part.thoughtsBytes.length === 0 &&
		part.resultMetadataBytes.length === 0 &&
		record.eventLogSha256 === EMPTY_SHA256 &&
		record.rawOutputSha256 === EMPTY_SHA256 &&
		record.thoughtsSha256 === EMPTY_SHA256 &&
		record.resultMetadataSha256 === EMPTY_SHA256 &&
		part.summary.status === 'failed' &&
		part.summary.error === 'fetch failed' &&
		part.summary.modelVersion === null &&
		part.summary.provider === null &&
		isZeroUsage(part.summary.usage) &&
		(part.summary.costUsd === null || part.summary.costUsd === 0) &&
		part.summary.modelEvents === 0 &&
		part.summary.events === 0 &&
		part.summary.thoughtDeltas === 0 &&
		part.summary.responseDeltas === 0 &&
		part.summary.usageEvents === 0 &&
		part.summary.finalJsonEvents === 0
	);
}

function findForbiddenOutputIdentity(value) {
	const forbidden = /^(?:threadId|thread_id|responseId|response_id|modelOutput|output)$/u;
	const visit = (current) => {
		if (!current || typeof current !== 'object') return null;
		for (const [key, child] of Object.entries(current)) {
			if (forbidden.test(key) && child !== null && child !== '' && child !== 0) {
				return { key, value: child };
			}
			const nested = visit(child);
			if (nested) return nested;
		}
		return null;
	};
	return visit(value);
}

function inspectDirectChildRegistration(sourceOptions) {
	const inspected = inspectScienceChallengeReviewRebaseChildRegistration(sourceOptions);
	if (
		!['planned', 'pending', 'committed'].includes(inspected.status) ||
		!['backfill', 'commit-ready', 'committed'].includes(inspected.action)
	) {
		throw new Error(
			'Failed S1 cannot be authenticated as the sole direct child of this B0 lineage.'
		);
	}
	return inspected;
}

function registerDirectChild(sourceOptions) {
	const registered = registerScienceChallengeReviewRebaseChild(sourceOptions);
	if (registered.status !== 'committed' || registered.action !== 'committed') {
		throw new Error('Failed S1 direct-child registry did not reach committed state.');
	}
	return registered;
}

function requireRegistrationMatchesPrepared(registration, prepared) {
	const expected = prepared.manifest.directChildRegistration;
	const actual = directChildRegistrationReference(registration);
	if (canonicalHash(actual) !== canonicalHash(expected)) {
		throw new Error('Direct-child registry write differs from recovery manifest binding.');
	}
}

function directChildRegistrationReference(registration) {
	const reference = {
		authorityLabel: registration.authorityLabel,
		lineageKeySha256: registration.lineageKeySha256,
		reservationSha256: registration.reservationSha256,
		commitSha256: registration.commitSha256,
		diagnostics: structuredClone(registration.diagnostics)
	};
	for (const field of ['lineageKeySha256', 'reservationSha256', 'commitSha256']) {
		if (!HASH.test(String(reference[field] ?? ''))) {
			throw new Error(`Direct-child registry ${field} is invalid.`);
		}
	}
	if (typeof reference.authorityLabel !== 'string' || !reference.authorityLabel.trim()) {
		throw new Error('Direct-child registry reference is invalid.');
	}
	requireRecord(reference.diagnostics, 'Direct-child registry diagnostics');
	if (
		canonicalHash(Object.keys(reference.diagnostics).sort()) !==
			canonicalHash(
				[
					'liveWorktreeCount',
					'liveWorktreeSetSha256',
					'ignoredPrunableWorktreeCount',
					'ignoredPrunableWorktreeSetSha256'
				].sort()
			) ||
		!Number.isInteger(reference.diagnostics.liveWorktreeCount) ||
		reference.diagnostics.liveWorktreeCount < 1 ||
		!Number.isInteger(reference.diagnostics.ignoredPrunableWorktreeCount) ||
		reference.diagnostics.ignoredPrunableWorktreeCount < 0 ||
		!HASH.test(String(reference.diagnostics.liveWorktreeSetSha256 ?? '')) ||
		!HASH.test(String(reference.diagnostics.ignoredPrunableWorktreeSetSha256 ?? ''))
	) {
		throw new Error('Direct-child registry diagnostics are invalid.');
	}
	return reference;
}

function readSingleLedgerPolicy({ ledgerRoot, objective, failedRoot }) {
	const objectivePath = path.join(ledgerRoot, 'objective.json');
	const objectiveLoaded = readCanonicalJsonFile(
		objectivePath,
		'failed S1 objective ledger identity'
	);
	requireExactCanonicalValue(
		objectiveLoaded.value,
		objective,
		'Failed S1 objective ledger differs from B0/V1 identity'
	);
	const claimPaths = listTreeFiles(path.join(ledgerRoot, 'shards'))
		.filter((relative) => relative.endsWith('/claim.json'))
		.map((relative) => path.join(ledgerRoot, 'shards', ...relative.split('/')));
	if (claimPaths.length === 0) throw new Error('Failed S1 has no immutable global attempt claims.');
	let policy = null;
	const outputRootSha256 = canonicalHash(path.resolve(failedRoot));
	for (const claimPath of claimPaths) {
		const claim = readCanonicalJsonFile(claimPath, 'failed S1 global claim').value;
		if (claim.outputRootSha256 !== outputRootSha256) {
			throw new Error('Failed S1 global claim belongs to another generation root.');
		}
		if (policy === null) policy = claim.policy;
		else {
			requireExactCanonicalValue(
				claim.policy,
				policy,
				'Failed S1 global claims contain multiple execution policies'
			);
		}
	}
	return policy;
}

function writePreparedSuccessorTree({ temporary, prepared }) {
	mkdirSync(path.join(temporary, 'shards'), { recursive: true });
	for (const shard of prepared.manifest.shards) {
		const source = preparedSourceForShard(prepared, shard.shardId);
		const destination = path.join(temporary, 'shards', shard.shardId);
		mkdirSync(destination, { recursive: true });
		writeFileSync(path.join(destination, 'candidate.json'), source.candidateBytes, {
			flag: 'wx'
		});
		writeFileSync(path.join(destination, 'validation.json'), source.validationBytes, {
			flag: 'wx'
		});
	}
	const source = prepared._source;
	if (!source) {
		throw new Error('Prepared recovery lacks its private source material.');
	}
	writeFileSync(
		path.join(temporary, REPAIR_PARENT_FILE),
		Buffer.from(`${stableStringify(source.repairParent)}\n`),
		{ flag: 'wx' }
	);
	for (const proposal of prepared.proposalRecords) {
		const destination = path.join(temporary, RECOVERY_PROPOSALS_DIRECTORY, proposal.shardId);
		mkdirSync(destination, { recursive: true });
		const shard = source.shardStates.find((row) => row.shardId === proposal.shardId);
		const original = shard?.proposal;
		if (!original) throw new Error(`${proposal.shardId} recovery proposal source is missing.`);
		writeFileSync(
			path.join(destination, 'candidate.json'),
			readFileSync(path.resolve(source.workspaceRoot, original.candidate.path)),
			{ flag: 'wx' }
		);
		writeFileSync(
			path.join(destination, 'validation.json'),
			readFileSync(path.resolve(source.workspaceRoot, original.validation.path)),
			{ flag: 'wx' }
		);
		writeFileSync(
			path.join(destination, 'binding.json'),
			Buffer.from(`${stableStringify(proposal)}\n`),
			{ flag: 'wx' }
		);
	}
	writeFileSync(path.join(temporary, MANIFEST_FILE), prepared.manifestBytes, { flag: 'wx' });
	writeFileSync(path.join(temporary, PARENT_FILE), prepared.parentBytes, { flag: 'wx' });
	fsyncTree(temporary);
}

function preparedSourceForShard(prepared, shardId) {
	const baseline = prepared._source?.baselineByShard.get(shardId);
	if (!baseline) throw new Error(`${shardId} prepared B0 baseline is missing.`);
	return baseline;
}

function requireExactSuccessorTree({ source, successorRoot, prepared, allowRecoveryInvocations }) {
	const expected = new Set([MANIFEST_FILE, PARENT_FILE, REPAIR_PARENT_FILE]);
	for (const shard of prepared.manifest.shards) {
		expected.add(`shards/${shard.shardId}/candidate.json`);
		expected.add(`shards/${shard.shardId}/validation.json`);
		const baseline = source.baselineByShard.get(shard.shardId);
		if (
			!readFileSync(
				path.join(successorRoot.absolutePath, 'shards', shard.shardId, 'candidate.json')
			).equals(baseline.candidateBytes) ||
			!readFileSync(
				path.join(successorRoot.absolutePath, 'shards', shard.shardId, 'validation.json')
			).equals(baseline.validationBytes)
		) {
			throw new Error(`${shard.shardId} recovery top-level B0 bytes are immutable.`);
		}
	}
	for (const proposal of prepared.proposalRecords) {
		for (const name of ['candidate.json', 'validation.json', 'binding.json']) {
			expected.add(`${RECOVERY_PROPOSALS_DIRECTORY}/${proposal.shardId}/${name}`);
		}
		const root = path.join(
			successorRoot.absolutePath,
			RECOVERY_PROPOSALS_DIRECTORY,
			proposal.shardId
		);
		const binding = readCanonicalJsonFile(
			path.join(root, 'binding.json'),
			`${proposal.shardId} staged proposal binding`
		);
		requireExactCanonicalValue(
			binding.value,
			proposal,
			`${proposal.shardId} staged proposal binding was changed`
		);
		for (const [kind, sourceBinding] of [
			['candidate', proposal.source.candidate],
			['validation', proposal.source.validation]
		]) {
			if (
				!readFileSync(path.join(root, `${kind}.json`)).equals(
					readFileSync(path.resolve(source.workspaceRoot, sourceBinding.path))
				)
			) {
				throw new Error(`${proposal.shardId} staged ${kind} differs from passed proposal.`);
			}
		}
	}
	if (
		!readFileSync(path.join(successorRoot.absolutePath, REPAIR_PARENT_FILE)).equals(
			Buffer.from(`${stableStringify(source.repairParent)}\n`)
		)
	) {
		throw new Error('Staged verification-repair parent differs from failed S1 parent.');
	}
	for (const relative of listTreeFiles(successorRoot.absolutePath)) {
		validateScienceChallengeReviewRebaseInfrastructureRecoverySuccessorArtifactPath(relative);
		if (allowRecoveryInvocations && relative.includes(`/${RECOVERY_INVOCATIONS_DIRECTORY}/`)) {
			continue;
		}
		if (!expected.has(relative)) {
			throw new Error(`Recovery successor contains unexpected artifact ${relative}.`);
		}
		expected.delete(relative);
	}
	if (expected.size > 0) {
		throw new Error(`Recovery successor is missing artifacts: ${[...expected].join(', ')}.`);
	}
}

function plannedRecoveryWrites(prepared) {
	return [
		`${prepared.successorRootPath}/${MANIFEST_FILE}`,
		`${prepared.successorRootPath}/${PARENT_FILE}`,
		`${prepared.successorRootPath}/${REPAIR_PARENT_FILE}`,
		`${prepared.successorRootPath}/shards/*/{candidate.json,validation.json}`,
		...(prepared.proposalRecords.length
			? [
					`${prepared.successorRootPath}/${RECOVERY_PROPOSALS_DIRECTORY}/*/{candidate.json,validation.json,binding.json}`
				]
			: [])
	];
}

function recoveryCounts(shards) {
	const byStatus = Object.fromEntries(
		[
			SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL,
			SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_REPAIR_REQUIRED,
			SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_FROZEN_NONMUTABLE
		].map((status) => [status, shards.filter((shard) => shard.status === status).length])
	);
	const preModelExemptAttemptCount = shards.reduce(
		(total, shard) =>
			total +
			shard.sourceAttempts.filter(
				(attempt) =>
					attempt.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT
			).length,
		0
	);
	const consumedLogicalContentAttemptCount = shards.reduce(
		(total, shard) => total + shard.consumedLogicalContentAttempts,
		0
	);
	return {
		shardCount: shards.length,
		...byStatus,
		preModelExemptAttemptCount,
		consumedLogicalContentAttemptCount
	};
}

function requireRecoveryStateShard(state, shardId) {
	if (
		!state ||
		state.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA ||
		!(state.shards instanceof Map) ||
		!HASH.test(String(state.manifestSha256 ?? ''))
	) {
		throw new Error('Recovery state is missing or unauthenticated.');
	}
	requireShardId(shardId);
	const shard = state.shards.get(shardId);
	if (!shard) throw new Error(`Recovery state has no shard ${shardId}.`);
	return shard;
}

function recoveryInvocationRoot(state, shardId) {
	return path.join(state.successorRoot, 'shards', shardId, RECOVERY_INVOCATIONS_DIRECTORY);
}

function validateRecoveryInvocationClaim({ claim, state, shard, directoryName }) {
	const core = { ...claim };
	delete core.claimSha256;
	if (
		canonicalHash(Object.keys(claim).sort()) !==
		canonicalHash([...RECOVERY_INVOCATION_CLAIM_FIELDS].sort())
	) {
		throw new Error(`${shard.shardId} recovery invocation claim has unexpected fields.`);
	}
	const expectedName = scienceChallengeReviewRebaseRecoveryInvocationName({
		logicalContentOrdinal: claim.logicalContentOrdinal,
		infrastructureInvocationOrdinal: claim.infrastructureInvocationOrdinal
	});
	if (
		claim.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_INVOCATION_CLAIM_SCHEMA ||
		claim.recoveryExecutionId !== state.recoveryExecutionId ||
		claim.recoveryManifestSha256 !== state.manifestSha256 ||
		claim.objectiveId !== state.manifest.originalExecutionIdentity.objectiveId ||
		claim.executionId !== state.manifest.originalExecutionIdentity.executionId ||
		claim.successorRootPathSha256 !== canonicalHash(state.successorRootPath) ||
		claim.shardId !== shard.shardId ||
		claim.claimSha256 !== canonicalHash(core) ||
		directoryName !== expectedName ||
		!HASH.test(String(claim.priorInvocationSetSha256 ?? ''))
	) {
		throw new Error(`${shard.shardId} recovery invocation claim is invalid.`);
	}
}

function validateRecoveryInvocationCompletion({ completion, claim, state, shard, directory }) {
	const core = { ...completion };
	delete core.completionSha256;
	const indeterminate = completion.indeterminate === true;
	const expectedFields = [
		...RECOVERY_INVOCATION_COMPLETION_BASE_FIELDS,
		...(indeterminate ? RECOVERY_INVOCATION_COMPLETION_INDETERMINATE_FIELDS : []),
		...(completion.proposal ? ['proposal'] : [])
	].sort();
	if (canonicalHash(Object.keys(completion).sort()) !== canonicalHash(expectedFields)) {
		throw new Error(`${shard.shardId} recovery invocation completion has unexpected fields.`);
	}
	if (
		completion.schemaVersion !==
			SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_INVOCATION_COMPLETION_SCHEMA ||
		completion.recoveryExecutionId !== state.recoveryExecutionId ||
		completion.recoveryManifestSha256 !== state.manifestSha256 ||
		completion.claimSha256 !== canonicalHash(claim) ||
		completion.shardId !== shard.shardId ||
		completion.logicalContentOrdinal !== claim.logicalContentOrdinal ||
		completion.infrastructureInvocationOrdinal !== claim.infrastructureInvocationOrdinal ||
		![
			SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED,
			SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_PRE_MODEL_EXEMPT,
			SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED
		].includes(completion.classification) ||
		completion.completionSha256 !== canonicalHash(core)
	) {
		throw new Error(`${shard.shardId} recovery invocation completion is invalid.`);
	}
	if (
		indeterminate &&
		(completion.classification !== SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED ||
			completion.proposal !== undefined ||
			typeof completion.indeterminateReason !== 'string' ||
			!completion.indeterminateReason.trim())
	) {
		throw new Error(
			`${shard.shardId} indeterminate recovery completion must consume content without a proposal.`
		);
	}
	if (
		!indeterminate &&
		(completion.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED) !==
			Boolean(completion.proposal)
	) {
		throw new Error(
			`${shard.shardId} recovery completion proposal presence differs from its classification.`
		);
	}
	const inventory = inventoryTree(directory, { exclude: new Set(['completion.json']) });
	if (
		completion.evidenceInventorySha256 !== canonicalHash(inventory) ||
		canonicalHash(completion.evidenceInventory) !== canonicalHash(inventory)
	) {
		throw new Error(`${shard.shardId} recovery completion evidence was changed.`);
	}
	if (indeterminate) {
		validateScienceChallengeReviewRebaseAttemptEvidenceTree({
			attemptDirectory: directory,
			allowClaimFile: true,
			allowCompletionFile: true,
			allowPartial: true,
			expectedPartIds: expectedRecoveryPartIds(state, shard.shardId)
		});
		return;
	}
	const reclassified = classifyAttemptDirectory({
		attemptDirectory: directory,
		shardId: shard.shardId,
		physicalAttempt: claim.logicalContentOrdinal,
		source: state.source,
		baseline: state.source.baselineByShard.get(shard.shardId),
		allowClaimFile: true,
		allowCompletionFile: true
	});
	if (
		reclassified.classification !== completion.classification ||
		canonicalHash(reclassified.proposal ?? null) !== canonicalHash(completion.proposal ?? null)
	) {
		throw new Error(`${shard.shardId} recovery completion classification is stale.`);
	}
}

function validateRecoveryInvocationSequence({ shard, records }) {
	let logical =
		shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL
			? null
			: shard.nextLogicalContentOrdinal;
	let invocation = 1;
	let closed = shard.status === SCIENCE_CHALLENGE_REVIEW_REBASE_RECOVERY_STATUS_PASSED_PROPOSAL;
	const prior = [];
	for (const [index, record] of records.entries()) {
		if (closed)
			throw new Error(`${shard.shardId} has recovery invocations after a passed proposal.`);
		if (record.claim.logicalContentOrdinal !== logical) {
			throw new Error(`${shard.shardId} recovery logical content ordinals are not monotonic.`);
		}
		if (record.claim.infrastructureInvocationOrdinal !== invocation) {
			throw new Error(`${shard.shardId} recovery infrastructure invocations are not contiguous.`);
		}
		if (record.claim.priorInvocationSetSha256 !== canonicalHash(prior)) {
			throw new Error(`${shard.shardId} recovery claim does not bind exact prior invocations.`);
		}
		if (record.completion === null && index !== records.length - 1) {
			throw new Error(`${shard.shardId} has an invocation after an incomplete claim.`);
		}
		prior.push({
			logicalContentOrdinal: record.claim.logicalContentOrdinal,
			infrastructureInvocationOrdinal: record.claim.infrastructureInvocationOrdinal,
			claimSha256: canonicalHash(record.claim),
			completionSha256: record.completion ? canonicalHash(record.completion) : null
		});
		if (!record.completion) continue;
		if (
			record.completion.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_VALIDATION_PASSED
		) {
			closed = true;
		} else if (
			record.completion.classification === SCIENCE_CHALLENGE_REVIEW_REBASE_ATTEMPT_CONTENT_CONSUMED
		) {
			logical += 1;
			invocation = 1;
			if (logical > SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_LOGICAL_CONTENT_ATTEMPTS + 1) {
				throw new Error(`${shard.shardId} recovery exceeds four logical content attempts.`);
			}
		} else {
			invocation += 1;
			if (
				invocation >
				SCIENCE_CHALLENGE_REVIEW_REBASE_MAX_INFRASTRUCTURE_INVOCATIONS_PER_LOGICAL_SLOT + 1
			) {
				throw new Error(`${shard.shardId} recovery exceeds bounded infrastructure retries.`);
			}
		}
	}
}

function compareRecoveryInvocations(left, right) {
	return (
		left.claim.logicalContentOrdinal - right.claim.logicalContentOrdinal ||
		left.claim.infrastructureInvocationOrdinal - right.claim.infrastructureInvocationOrdinal
	);
}

function writeAtomicClaimDirectory(directory, claim) {
	if (existsSync(directory)) {
		const existing = readCanonicalJsonFile(
			path.join(directory, 'claim.json'),
			'recovery invocation claim'
		).value;
		requireExactCanonicalValue(existing, claim, 'Recovery invocation claim conflicts');
		return;
	}
	const parent = path.dirname(directory);
	mkdirSync(parent, { recursive: true });
	const temporary = mkdtempSync(path.join(parent, '.claim-preparing-'));
	try {
		writeFileSync(path.join(temporary, 'claim.json'), Buffer.from(`${stableStringify(claim)}\n`), {
			flag: 'wx'
		});
		fsyncTree(temporary);
		if (existsSync(directory)) throw new Error('Recovery invocation appeared while claiming.');
		renameSync(temporary, directory);
		fsyncDirectory(parent);
	} catch (error) {
		if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
		throw error;
	}
}

function inventoryTree(root, { exclude = new Set() } = {}) {
	const resolved = path.resolve(root);
	if (!existsSync(resolved) || !lstatSync(resolved).isDirectory()) {
		throw new Error(`Evidence tree is missing: ${resolved}`);
	}
	return listTreeFiles(resolved)
		.filter((relativePath) => !exclude.has(relativePath))
		.map((relativePath) => {
			const filePath = path.join(resolved, ...relativePath.split('/'));
			const stat = lstatSync(filePath);
			if (!stat.isFile() || stat.isSymbolicLink()) {
				throw new Error(`Evidence tree contains a non-regular file: ${relativePath}`);
			}
			const bytes = readFileSync(filePath);
			return {
				path: relativePath,
				byteLength: bytes.length,
				sha256: sha256(bytes)
			};
		});
}

function listTreeFiles(root) {
	if (!existsSync(root)) return [];
	const files = [];
	const visit = (directory, prefix = '') => {
		for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name)
		)) {
			if (entry.isSymbolicLink()) throw new Error('Evidence tree contains a symbolic link.');
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			const absolute = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(absolute, relative);
			else if (entry.isFile()) files.push(relative);
			else throw new Error('Evidence tree contains a non-regular filesystem object.');
		}
	};
	visit(root);
	return files;
}

function listDirectories(root) {
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.map((entry) => {
			if (entry.isSymbolicLink() || !entry.isDirectory()) {
				throw new Error('Ledger shard root contains a non-directory entry.');
			}
			requireShardId(entry.name);
			return entry.name;
		})
		.sort();
}

function fileBinding(workspaceRoot, filePath) {
	const absolutePath = path.resolve(filePath);
	const bytes = readFileSync(absolutePath);
	const value = JSON.parse(bytes.toString('utf8'));
	return {
		path: workspaceRelative(workspaceRoot, absolutePath, 'evidence file'),
		fileSha256: sha256(bytes),
		canonicalSha256: canonicalHash(value)
	};
}

function readBoundWorkspaceJson(workspaceRoot, relativePath, label) {
	const resolved = resolveWorkspacePath(workspaceRoot, relativePath, {
		label,
		allowMissing: false,
		requireFile: true
	});
	return readJsonFile(resolved.absolutePath, label);
}

function evidenceFileBinding(workspaceRoot, filePath) {
	const absolutePath = path.resolve(filePath);
	const bytes = readFileSync(absolutePath);
	return {
		path: workspaceRelative(workspaceRoot, absolutePath, 'evidence file'),
		byteLength: bytes.length,
		fileSha256: sha256(bytes)
	};
}

function readJsonFile(filePath, label) {
	if (!existsSync(filePath)) throw new Error(`${label} is missing.`);
	const stat = lstatSync(filePath);
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error(`${label} must be a regular non-symlink file.`);
	}
	const bytes = readFileSync(filePath);
	let value;
	try {
		value = JSON.parse(bytes.toString('utf8'));
	} catch (error) {
		throw new Error(`${label} is invalid JSON.`, { cause: error });
	}
	return { bytes, value };
}

function readCanonicalJsonFile(filePath, label) {
	if (!existsSync(filePath)) throw new Error(`${label} is missing.`);
	const stat = lstatSync(filePath);
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error(`${label} must be a regular non-symlink file.`);
	}
	const bytes = readFileSync(filePath);
	let value;
	try {
		value = JSON.parse(bytes.toString('utf8'));
	} catch (error) {
		throw new Error(`${label} is invalid JSON.`, { cause: error });
	}
	const expected = Buffer.from(`${stableStringify(value)}\n`);
	if (!bytes.equals(expected)) throw new Error(`${label} bytes are not canonical JSON.`);
	return { bytes, value };
}

function parseJsonLines(bytes, label) {
	let text;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch (error) {
		throw new Error(`${label} is not valid UTF-8.`, { cause: error });
	}
	return text
		.split(/\r?\n/u)
		.filter((line) => line.trim())
		.map((line, index) => {
			try {
				const value = JSON.parse(line);
				if (!value || typeof value !== 'object' || Array.isArray(value)) {
					throw new Error('record is not an object');
				}
				return value;
			} catch (error) {
				throw new Error(`${label} line ${index + 1} is invalid JSON.`, { cause: error });
			}
		});
}

function writeImmutableFile(filePath, bytes) {
	const buffer = Buffer.from(bytes);
	if (existsSync(filePath)) {
		if (!readFileSync(filePath).equals(buffer)) {
			throw new Error(`Immutable recovery evidence differs at ${filePath}.`);
		}
		return { action: 'reused', sha256: sha256(buffer) };
	}
	mkdirSync(path.dirname(filePath), { recursive: true });
	const temporary = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
		.toString(16)
		.slice(2)}.tmp`;
	const descriptor = openSync(temporary, 'wx', 0o444);
	try {
		writeFileSync(descriptor, buffer);
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
	try {
		linkSync(temporary, filePath);
		fsyncDirectory(path.dirname(filePath));
	} catch (error) {
		if (error?.code !== 'EEXIST') throw error;
		if (!readFileSync(filePath).equals(buffer)) {
			throw new Error(`Immutable recovery evidence conflicts at ${filePath}.`, {
				cause: error
			});
		}
	} finally {
		if (existsSync(temporary)) unlinkSync(temporary);
	}
	return { action: 'created', sha256: sha256(buffer) };
}

function fsyncTree(root) {
	for (const relative of listTreeFiles(root)) {
		const descriptor = openSync(path.join(root, ...relative.split('/')), 'r');
		try {
			fsyncSync(descriptor);
		} finally {
			closeSync(descriptor);
		}
	}
	const directories = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) visit(path.join(directory, entry.name));
		}
		directories.push(directory);
	};
	visit(root);
	for (const directory of directories) fsyncDirectory(directory);
}

function fsyncFile(filePath) {
	const descriptor = openSync(filePath, 'r');
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function fsyncDirectory(directory) {
	const descriptor = openSync(directory, 'r');
	try {
		fsyncSync(descriptor);
	} finally {
		closeSync(descriptor);
	}
}

function requireWorkspaceRoot(value) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error('Recovery workspace root is required.');
	}
	const resolved = path.resolve(value);
	const stat = lstatSync(resolved);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error('Recovery workspace root must be a non-symlink directory.');
	}
	return realpathSync(resolved);
}

function resolveWorkspacePath(
	workspaceRoot,
	requestedPath,
	{ label, allowMissing, requireFile = false, requireDirectory = false }
) {
	if (typeof requestedPath !== 'string' || !requestedPath.trim() || requestedPath.includes('\0')) {
		throw new Error(`${label} path is required.`);
	}
	const absolutePath = path.resolve(workspaceRoot, requestedPath);
	const relativePath = workspaceRelative(workspaceRoot, absolutePath, label);
	requireSafeDirectoryChain(workspaceRoot, path.dirname(absolutePath), {
		allowMissingTail: allowMissing,
		label: `${label} parent`
	});
	if (!existsSync(absolutePath)) {
		if (!allowMissing) throw new Error(`${label} is missing.`);
		return { absolutePath, relativePath };
	}
	const stat = lstatSync(absolutePath);
	if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symbolic link.`);
	if (requireFile && !stat.isFile()) throw new Error(`${label} must be a regular file.`);
	if (requireDirectory && !stat.isDirectory()) throw new Error(`${label} must be a directory.`);
	if (!realpathSync(absolutePath).startsWith(`${workspaceRoot}${path.sep}`)) {
		throw new Error(`${label} resolves outside the workspace.`);
	}
	return { absolutePath: realpathSync(absolutePath), relativePath };
}

function workspaceRelative(workspaceRoot, filePath, label) {
	const relative = path.relative(workspaceRoot, path.resolve(filePath)).split(path.sep).join('/');
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith('../') ||
		path.posix.normalize(relative) !== relative ||
		relative.split('/').some((part) => !part || part === '.' || part === '..')
	) {
		throw new Error(`${label} must remain inside the workspace.`);
	}
	return relative;
}

function requireSafeDirectoryChain(workspaceRoot, directory, { allowMissingTail, label }) {
	if (path.resolve(directory) === workspaceRoot) return;
	const relative = workspaceRelative(workspaceRoot, directory, label);
	let current = workspaceRoot;
	let missing = false;
	for (const part of relative.split('/')) {
		current = path.join(current, part);
		if (!existsSync(current)) {
			missing = true;
			if (!allowMissingTail) throw new Error(`${label} is missing.`);
			continue;
		}
		if (missing) throw new Error(`${label} has a non-contiguous filesystem path.`);
		const stat = lstatSync(current);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error(`${label} contains a non-directory or symlink.`);
		}
	}
}

function requireExactCanonicalValue(actual, expected, message) {
	if (canonicalHash(actual) !== canonicalHash(expected)) throw new Error(`${message}.`);
}

function requireRecord(value, label) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value;
}

function requireShardId(value) {
	if (!SAFE_SHARD.test(String(value ?? ''))) throw new Error('Recovery shard id is invalid.');
	return value;
}

function requireInteger(value, label, minimum, maximum) {
	if (!Number.isInteger(value) || value < minimum || value > maximum) {
		throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
	}
	return value;
}

function isZeroUsage(value) {
	if (value === null || value === undefined) return true;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.values(value).every((entry) => entry === 0 || entry === null);
}
