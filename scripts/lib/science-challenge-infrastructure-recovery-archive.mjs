import path from 'node:path';

import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA,
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding
} from './science-challenge-review-rebase-infra-recovery.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_INFRASTRUCTURE_RECOVERY_ARCHIVE_CLOSURE_SCHEMA =
	'science-challenge-review-rebase-infrastructure-recovery-archive-closure/v1';

const HASH = /^[a-f0-9]{64}$/u;
const SAFE_SHARD = /^[a-z0-9][a-z0-9-]*$/u;
const EXPECTED_SHARD_COUNT = 51;
const EXPECTED_MUTABLE_SHARD_COUNT = 49;
const EXPECTED_FROZEN_SHARD_COUNT = 2;
const EXPECTED_PRESERVED_PROPOSAL_COUNT = 10;
const EXPECTED_RECOVERED_PROPOSAL_COUNT = 39;
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
const CLOSURE_FIELDS = Object.freeze([
	'schemaVersion',
	'infrastructureRecovery',
	'infrastructureRecoverySha256',
	'releaseBindingsSha256',
	'sourceLineageSha256',
	'effectiveCohortManifestSha256',
	'acceptedCandidateSetSha256',
	'recoveryId',
	'recoveryExecutionId',
	'manifest',
	'manifestSha256',
	'failedRootInventorySha256',
	'logicalLedger',
	'logicalLedgerSha256',
	'preservedProposalSetSha256',
	'finalProposals',
	'finalProposalSetSha256',
	'finalProposalOriginCounts',
	'contentNamespaceId',
	'frozenShardIds',
	'frozenShardSetSha256',
	'pendingShardIds',
	'shardPartitionSha256',
	'evidencePaths',
	'evidencePathInventorySha256'
]);
const ALLOWED_PATH_FIELDS = Object.freeze([
	/^closure\.infrastructureRecovery\.manifestPath$/u,
	/^closure\.manifest\.reviewRebase\.manifestPath$/u,
	/^closure\.finalProposals\[\d+\]\.(?:candidatePath|validationPath)$/u
]);

/**
 * Project a successful, authenticated live replay into the only infrastructure-recovery
 * representation retained by the provenance archive.
 *
 * Raw claims, event streams, invocation directories and source-root paths are deliberately not
 * copied. The closure retains the exact terminal proposal values needed by later cohort replay,
 * but binds them to the live nine-field recovery binding and release lineage.
 */
export function buildScienceChallengeInfrastructureRecoveryArchiveClosure({
	infrastructureRecoveryBinding,
	terminal,
	releaseBindingsSha256,
	sourceLineageSha256,
	effectiveCohortManifestSha256,
	acceptedCandidateSetSha256
}) {
	const frozenShardIds = [...(terminal?.frozenShardIds ?? [])].sort();
	const mutableShardIds = (terminal?.finalProposals ?? [])
		.map((proposal) => proposal?.shardId)
		.sort();
	const closure = {
		schemaVersion: SCIENCE_CHALLENGE_INFRASTRUCTURE_RECOVERY_ARCHIVE_CLOSURE_SCHEMA,
		infrastructureRecovery: structuredClone(infrastructureRecoveryBinding),
		infrastructureRecoverySha256: canonicalHash(infrastructureRecoveryBinding),
		releaseBindingsSha256,
		sourceLineageSha256,
		effectiveCohortManifestSha256,
		acceptedCandidateSetSha256,
		recoveryId: terminal?.recoveryId,
		recoveryExecutionId: terminal?.recoveryExecutionId,
		manifest: structuredClone(terminal?.manifest),
		manifestSha256: terminal?.manifestSha256,
		failedRootInventorySha256: terminal?.failedRootInventorySha256,
		logicalLedger: structuredClone(terminal?.logicalLedger),
		logicalLedgerSha256: terminal?.logicalLedgerSha256,
		preservedProposalSetSha256: terminal?.preservedProposalSetSha256,
		finalProposals: structuredClone(terminal?.finalProposals),
		finalProposalSetSha256: terminal?.finalProposalSetSha256,
		finalProposalOriginCounts: structuredClone(terminal?.finalProposalOriginCounts),
		contentNamespaceId: terminal?.contentNamespaceId,
		frozenShardIds,
		frozenShardSetSha256: canonicalHash(frozenShardIds),
		pendingShardIds: structuredClone(terminal?.pendingShardIds),
		shardPartitionSha256: canonicalHash({
			mutableShardIds,
			frozenShardIds
		}),
		evidencePaths: structuredClone(terminal?.evidencePaths),
		evidencePathInventorySha256: terminal?.evidencePathInventorySha256
	};
	const validation = validateScienceChallengeInfrastructureRecoveryArchiveClosure({
		closure,
		infrastructureRecoveryBinding,
		releaseBindingsSha256,
		sourceLineageSha256,
		effectiveCohortManifestSha256,
		acceptedCandidateSetSha256
	});
	if (validation.status !== 'passed') {
		throw new Error(
			`Infrastructure-recovery archive closure is invalid:\n${validation.issues.join('\n')}`
		);
	}
	return closure;
}

export function validateScienceChallengeInfrastructureRecoveryArchiveClosure({
	closure,
	infrastructureRecoveryBinding = closure?.infrastructureRecovery,
	releaseBindingsSha256 = closure?.releaseBindingsSha256,
	sourceLineageSha256 = closure?.sourceLineageSha256,
	effectiveCohortManifestSha256 = closure?.effectiveCohortManifestSha256,
	acceptedCandidateSetSha256 = closure?.acceptedCandidateSetSha256
}) {
	const issues = [];
	if (!isRecord(closure)) return failed('Infrastructure-recovery archive closure is required.');
	try {
		validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(
			infrastructureRecoveryBinding
		);
	} catch (error) {
		issues.push(errorMessage(error));
	}
	if (
		closure.schemaVersion !== SCIENCE_CHALLENGE_INFRASTRUCTURE_RECOVERY_ARCHIVE_CLOSURE_SCHEMA ||
		!hasExactFields(closure, CLOSURE_FIELDS)
	) {
		issues.push('Infrastructure-recovery archive closure has stale schema or fields.');
	}
	for (const [label, value] of [
		['nine-field binding', closure.infrastructureRecoverySha256],
		['release bindings', releaseBindingsSha256],
		['source lineage', sourceLineageSha256],
		['effective-cohort manifest', effectiveCohortManifestSha256],
		['accepted candidate set', acceptedCandidateSetSha256]
	]) {
		if (!HASH.test(String(value ?? ''))) {
			issues.push(`Infrastructure-recovery archive ${label} hash is invalid.`);
		}
	}
	if (
		canonicalHash(closure.infrastructureRecovery) !==
			canonicalHash(infrastructureRecoveryBinding) ||
		closure.infrastructureRecoverySha256 !== canonicalHash(infrastructureRecoveryBinding) ||
		closure.releaseBindingsSha256 !== releaseBindingsSha256 ||
		closure.sourceLineageSha256 !== sourceLineageSha256 ||
		closure.effectiveCohortManifestSha256 !== effectiveCohortManifestSha256 ||
		closure.acceptedCandidateSetSha256 !== acceptedCandidateSetSha256
	) {
		issues.push(
			'Infrastructure-recovery archive closure differs from its exact nine-field or release binding.'
		);
	}

	const binding = closure.infrastructureRecovery;
	if (
		closure.recoveryId !== binding?.recoveryId ||
		closure.recoveryExecutionId !== binding?.recoveryExecutionId ||
		closure.manifestSha256 !== binding?.manifestSha256 ||
		closure.failedRootInventorySha256 !== binding?.failedRootInventorySha256 ||
		closure.logicalLedgerSha256 !== binding?.logicalLedgerSha256 ||
		closure.preservedProposalSetSha256 !== binding?.preservedProposalSetSha256 ||
		closure.finalProposalSetSha256 !== binding?.finalProposalSetSha256 ||
		closure.contentNamespaceId !== binding?.contentNamespaceId ||
		canonicalHash(closure.manifest) !== closure.manifestSha256 ||
		canonicalHash(closure.logicalLedger) !== closure.logicalLedgerSha256 ||
		canonicalHash(closure.finalProposals) !== closure.finalProposalSetSha256 ||
		canonicalHash(closure.evidencePaths) !== closure.evidencePathInventorySha256
	) {
		issues.push('Infrastructure-recovery archive terminal hashes are stale.');
	}
	if (
		closure.manifest?.schemaVersion !==
			SCIENCE_CHALLENGE_REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_SCHEMA ||
		closure.manifest?.recoveryId !== closure.recoveryId ||
		closure.manifest?.recoveryExecutionId !== closure.recoveryExecutionId ||
		closure.manifest?.failedRootInventorySha256 !== closure.failedRootInventorySha256 ||
		closure.manifest?.preservedProposalSetSha256 !== closure.preservedProposalSetSha256 ||
		closure.manifest?.contentNamespaceId !== closure.contentNamespaceId
	) {
		issues.push('Infrastructure-recovery archived manifest identity is stale.');
	}

	const finalProposals = Array.isArray(closure.finalProposals) ? closure.finalProposals : [];
	const frozenShardIds = Array.isArray(closure.frozenShardIds) ? closure.frozenShardIds : [];
	const pendingShardIds = Array.isArray(closure.pendingShardIds) ? closure.pendingShardIds : [];
	if (
		!Array.isArray(closure.finalProposals) ||
		finalProposals.length !== EXPECTED_MUTABLE_SHARD_COUNT ||
		!Array.isArray(closure.frozenShardIds) ||
		frozenShardIds.length !== EXPECTED_FROZEN_SHARD_COUNT ||
		new Set(frozenShardIds).size !== EXPECTED_FROZEN_SHARD_COUNT ||
		!isSortedUniqueShardIds(frozenShardIds) ||
		closure.frozenShardSetSha256 !== canonicalHash(frozenShardIds) ||
		!Array.isArray(closure.pendingShardIds) ||
		pendingShardIds.length !== 0 ||
		closure.finalProposalOriginCounts?.['preserved-source-proposal'] !==
			EXPECTED_PRESERVED_PROPOSAL_COUNT ||
		closure.finalProposalOriginCounts?.['recovery-invocation-proposal'] !==
			EXPECTED_RECOVERED_PROPOSAL_COUNT ||
		!hasExactFields(closure.finalProposalOriginCounts, [
			'preserved-source-proposal',
			'recovery-invocation-proposal'
		])
	) {
		issues.push(
			'Infrastructure-recovery archive must contain 49 mutable proposals, two frozen shards and the exact 10/39 origin split.'
		);
	}

	const proposalShardIds = new Set();
	let priorProposalShardId = null;
	for (const proposal of finalProposals) {
		if (
			!isRecord(proposal) ||
			!hasExactFields(proposal, TERMINAL_PROPOSAL_FIELDS) ||
			!SAFE_SHARD.test(String(proposal.shardId ?? '')) ||
			proposalShardIds.has(proposal.shardId) ||
			(priorProposalShardId !== null && proposal.shardId <= priorProposalShardId) ||
			!['preserved-source-proposal', 'recovery-invocation-proposal'].includes(proposal.origin) ||
			!Number.isInteger(proposal.logicalContentOrdinal) ||
			proposal.logicalContentOrdinal < 1 ||
			proposal.logicalContentOrdinal > 4 ||
			!safeRelativePath(proposal.candidatePath) ||
			!safeRelativePath(proposal.validationPath) ||
			proposal.candidateSha256 !== canonicalHash(proposal.candidate) ||
			proposal.validationSha256 !== canonicalHash(proposal.validation) ||
			proposal.validation?.candidateSha256 !== proposal.candidateSha256
		) {
			issues.push(
				`${proposal?.shardId ?? 'Unknown shard'} archived terminal proposal is malformed or stale.`
			);
			continue;
		}
		proposalShardIds.add(proposal.shardId);
		priorProposalShardId = proposal.shardId;
	}
	const frozenSet = new Set(frozenShardIds);
	const mutableShardIds = [...proposalShardIds].sort();
	if (
		[...proposalShardIds].some((shardId) => frozenSet.has(shardId)) ||
		proposalShardIds.size + frozenSet.size !== EXPECTED_SHARD_COUNT ||
		closure.shardPartitionSha256 !== canonicalHash({ mutableShardIds, frozenShardIds })
	) {
		issues.push('Infrastructure-recovery archived mutable/frozen partition is not exact.');
	}

	const ledgerShards = Array.isArray(closure.logicalLedger?.shards)
		? closure.logicalLedger.shards
		: [];
	const ledgerByShard = new Map();
	for (const shard of ledgerShards) {
		if (
			!isRecord(shard) ||
			!SAFE_SHARD.test(String(shard.shardId ?? '')) ||
			ledgerByShard.has(shard.shardId)
		) {
			issues.push('Infrastructure-recovery logical ledger has malformed or duplicate shards.');
			continue;
		}
		ledgerByShard.set(shard.shardId, shard);
	}
	const ledgerFrozenShardIds = [...ledgerByShard.values()]
		.filter((shard) => shard.status === 'frozen-nonmutable')
		.map((shard) => shard.shardId)
		.sort();
	if (
		ledgerByShard.size !== EXPECTED_SHARD_COUNT ||
		canonicalHash(ledgerFrozenShardIds) !== canonicalHash(frozenShardIds)
	) {
		issues.push(
			'Infrastructure-recovery frozen inventory differs from its hash-bound logical ledger.'
		);
	}
	for (const proposal of finalProposals) {
		const ledgerShard = ledgerByShard.get(proposal.shardId);
		if (
			ledgerShard?.status !== 'terminal-passed-proposal' ||
			ledgerShard?.terminalProposalSha256 !== canonicalHash(proposal)
		) {
			issues.push(
				`${proposal.shardId} terminal proposal differs from the hash-bound logical ledger.`
			);
		}
	}

	const evidencePaths = new Set();
	let priorEvidencePath = null;
	for (const record of Array.isArray(closure.evidencePaths) ? closure.evidencePaths : []) {
		if (
			!isRecord(record) ||
			!hasExactFields(record, ['byteLength', 'path', 'sha256']) ||
			!safeRelativePath(record.path) ||
			!Number.isInteger(record.byteLength) ||
			record.byteLength < 0 ||
			!HASH.test(String(record.sha256 ?? '')) ||
			evidencePaths.has(record.path) ||
			(priorEvidencePath !== null && record.path <= priorEvidencePath)
		) {
			issues.push('Infrastructure-recovery archived evidence inventory is malformed.');
			continue;
		}
		evidencePaths.add(record.path);
		priorEvidencePath = record.path;
	}
	if (!Array.isArray(closure.evidencePaths) || !evidencePaths.has(binding?.manifestPath)) {
		issues.push('Infrastructure-recovery archived evidence inventory omits its manifest.');
	}

	const absoluteLeaks = findScienceChallengeInfrastructureRecoveryArchiveAbsolutePathLeaks(closure);
	if (absoluteLeaks.length > 0) {
		issues.push(
			`Infrastructure-recovery archive closure retains absolute paths: ${absoluteLeaks.join(', ')}.`
		);
	}
	const forbiddenPathFields = findForbiddenPathFields(closure);
	if (forbiddenPathFields.length > 0) {
		issues.push(
			`Infrastructure-recovery archive closure retains unapproved *Path fields: ${forbiddenPathFields.join(', ')}.`
		);
	}
	return issues.length ? failed(issues) : { status: 'passed', issues: [], closure };
}

export function findScienceChallengeInfrastructureRecoveryArchiveAbsolutePathLeaks(value) {
	const leaks = [];
	const visit = (current, location) => {
		if (typeof current === 'string') {
			if (
				path.isAbsolute(current) ||
				/^[A-Za-z]:[\\/]/u.test(current) ||
				current.startsWith('file://')
			) {
				leaks.push(location);
			}
			return;
		}
		if (Array.isArray(current)) {
			current.forEach((entry, index) => visit(entry, `${location}[${index}]`));
			return;
		}
		if (!isRecord(current)) return;
		for (const [field, child] of Object.entries(current)) {
			visit(child, location ? `${location}.${field}` : field);
		}
	};
	visit(value, 'closure');
	return leaks;
}

function findForbiddenPathFields(value) {
	const forbidden = [];
	const visit = (current, location) => {
		if (Array.isArray(current)) {
			current.forEach((entry, index) => visit(entry, `${location}[${index}]`));
			return;
		}
		if (!isRecord(current)) return;
		for (const [field, child] of Object.entries(current)) {
			const childLocation = location ? `${location}.${field}` : field;
			if (
				field.endsWith('Path') &&
				!ALLOWED_PATH_FIELDS.some((pattern) => pattern.test(childLocation))
			) {
				forbidden.push(childLocation);
			}
			visit(child, childLocation);
		}
	};
	visit(value, 'closure');
	return forbidden;
}

function safeRelativePath(value) {
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value.includes('\\') ||
		value.includes('\0')
	) {
		return false;
	}
	const normalized = path.posix.normalize(value);
	return (
		normalized === value &&
		normalized !== '.' &&
		normalized !== '..' &&
		!normalized.startsWith('../') &&
		!path.posix.isAbsolute(normalized)
	);
}

function hasExactFields(value, fields) {
	return (
		isRecord(value) &&
		canonicalHash(Object.keys(value).sort()) === canonicalHash([...fields].sort())
	);
}

function isSortedUniqueShardIds(values) {
	return (
		values.every((value) => SAFE_SHARD.test(String(value ?? ''))) &&
		values.every((value, index) => index === 0 || values[index - 1] < value)
	);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function failed(value) {
	return { status: 'failed', issues: Array.isArray(value) ? value : [value] };
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
