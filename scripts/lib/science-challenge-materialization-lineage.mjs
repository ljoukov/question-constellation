import path from 'node:path';

import { canonicalHash } from './science-challenge-release.mjs';
import { validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding } from './science-challenge-review-rebase-infra-recovery.mjs';

const EXPECTED_RECOVERY_PROPOSAL_COUNT = 49;
const EXPECTED_FROZEN_SHARD_COUNT = 2;

export function workspaceRelativeMaterializationPath(
	rootDir,
	filePath,
	label = 'Materialization path'
) {
	const root = path.resolve(rootDir);
	const absolute = path.resolve(filePath);
	const relative = path.relative(root, absolute);
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error(`${label} must remain within the workspace.`);
	}
	return relative.split(path.sep).join('/');
}

export function relativeMultipartPlanSalvageLineage(lineage, { rootDir, multipartLineageParts }) {
	const relativePath = (filePath) =>
		workspaceRelativeMaterializationPath(rootDir, filePath, 'Multipart salvage lineage path');
	const { attemptDir, partRecords, ...sourceAttempt } = lineage.sourceAttempt;
	const {
		identityPath,
		identitySha256,
		objectivePath: recordedObjectivePath,
		objectiveSha256: recordedObjectiveSha256,
		...execution
	} = lineage.execution;
	const objectivePath = recordedObjectivePath ?? identityPath;
	const objectiveSha256 = recordedObjectiveSha256 ?? identitySha256;
	return {
		...lineage,
		manifestPath: relativePath(lineage.manifestPath),
		candidatePath: relativePath(lineage.candidatePath),
		validationPath: relativePath(lineage.validationPath),
		execution: {
			...execution,
			objectivePath: relativePath(objectivePath),
			objectiveSha256,
			claims: lineage.execution.claims.map((claim) => ({
				...claim,
				path: relativePath(claim.path)
			}))
		},
		sourceAttempt: {
			...sourceAttempt,
			runSummaryPath: relativePath(sourceAttempt.runSummaryPath),
			validationPath: relativePath(sourceAttempt.validationPath),
			eventLogPath: relativePath(sourceAttempt.eventLogPath),
			lastMessagePath: relativePath(sourceAttempt.lastMessagePath),
			promptPath: relativePath(sourceAttempt.promptPath),
			candidatePath: sourceAttempt.candidatePath ? relativePath(sourceAttempt.candidatePath) : null,
			parts: multipartLineageParts({
				attemptDir,
				partRecords,
				responseMode: sourceAttempt.responseMode,
				providerSchemaApplied: sourceAttempt.providerSchemaApplied
			})
		},
		repairEvidence: {
			...lineage.repairEvidence,
			verificationSummaryPath: relativePath(lineage.repairEvidence.verificationSummaryPath),
			priorCandidatePath: relativePath(lineage.repairEvidence.priorCandidatePath),
			priorValidationPath: relativePath(lineage.repairEvidence.priorValidationPath)
		}
	};
}

/**
 * Select the authoritative source for one shard in a recovery-bound effective-cohort chain.
 *
 * The current typed repair wins. Otherwise bytes that still match the immutable terminal
 * recovery proposal use that proposal, while only the two frozen shards may fall back to B0.
 * A later V2+ repair is deliberately not mislabelled as the original recovery proposal.
 */
export function classifyScienceChallengeReviewRebaseMaterializationSource({
	infrastructureRecoveryBinding,
	infrastructureRecoveryTerminal,
	shardId,
	candidate,
	validation,
	hasCurrentTypedRepair = false
}) {
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(infrastructureRecoveryBinding);
	if (
		infrastructureRecoveryTerminal?.status !== 'passed' ||
		canonicalHash(infrastructureRecoveryTerminal.binding) !==
			canonicalHash(infrastructureRecoveryBinding) ||
		!Array.isArray(infrastructureRecoveryTerminal.finalProposals) ||
		infrastructureRecoveryTerminal.finalProposals.length !== EXPECTED_RECOVERY_PROPOSAL_COUNT ||
		infrastructureRecoveryTerminal.finalProposalOriginCounts?.['preserved-source-proposal'] !==
			10 ||
		infrastructureRecoveryTerminal.finalProposalOriginCounts?.['recovery-invocation-proposal'] !==
			39 ||
		!Array.isArray(infrastructureRecoveryTerminal.frozenShardIds) ||
		infrastructureRecoveryTerminal.frozenShardIds.length !== EXPECTED_FROZEN_SHARD_COUNT ||
		(infrastructureRecoveryTerminal.pendingShardIds?.length ?? 0) !== 0
	) {
		throw new Error(
			'Recovery-bound materialization requires the exact terminal 10/39/2 recovery replay.'
		);
	}
	if (typeof shardId !== 'string' || !shardId) {
		throw new Error('Recovery-bound materialization requires a shard id.');
	}
	const proposals = infrastructureRecoveryTerminal.finalProposals.filter(
		(proposal) => proposal?.shardId === shardId
	);
	const frozen = infrastructureRecoveryTerminal.frozenShardIds.filter(
		(frozenShardId) => frozenShardId === shardId
	);
	if (
		proposals.length + frozen.length !== 1 ||
		new Set([
			...infrastructureRecoveryTerminal.finalProposals.map((proposal) => proposal?.shardId),
			...infrastructureRecoveryTerminal.frozenShardIds
		]).size !==
			EXPECTED_RECOVERY_PROPOSAL_COUNT + EXPECTED_FROZEN_SHARD_COUNT
	) {
		throw new Error(`${shardId} is not in the exact terminal mutable/frozen recovery partition.`);
	}
	if (hasCurrentTypedRepair) return 'current-typed-repair';
	if (frozen.length === 1) return 'frozen-review-rebase-source';
	const proposal = proposals[0];
	const candidateSha256 =
		proposal.candidateSha256 ??
		proposal.source?.candidateSha256 ??
		proposal.proposal?.candidateSha256;
	const validationSha256 =
		proposal.validationSha256 ??
		proposal.source?.validationSha256 ??
		proposal.proposal?.validationSha256;
	return candidateSha256 === canonicalHash(candidate) &&
		validationSha256 === canonicalHash(validation)
		? 'terminal-recovery-proposal'
		: 'current-successor-repair';
}

export function scienceChallengeReviewRebaseInfrastructureRecoveryProposalLineage({
	infrastructureRecoveryBinding,
	infrastructureRecoveryTerminal,
	shard,
	candidate,
	validation
}) {
	if (!infrastructureRecoveryBinding || infrastructureRecoveryTerminal?.status !== 'passed') {
		throw new Error(
			'Recovery-origin materialization requires terminal infrastructure-recovery evidence.'
		);
	}
	const matches = infrastructureRecoveryTerminal.finalProposals.filter(
		(proposal) => proposal?.shardId === shard?.shardId
	);
	if (matches.length !== 1) {
		throw new Error(`${shard?.shardId ?? 'Unknown shard'} lacks one terminal recovery proposal.`);
	}
	const proposal = matches[0];
	const candidateSha256 =
		proposal.candidateSha256 ??
		proposal.source?.candidateSha256 ??
		proposal.proposal?.candidateSha256;
	const validationSha256 =
		proposal.validationSha256 ??
		proposal.source?.validationSha256 ??
		proposal.proposal?.validationSha256;
	const logicalContentOrdinal =
		proposal.logicalContentOrdinal ??
		proposal.source?.logicalContentOrdinal ??
		proposal.proposal?.logicalContentOrdinal;
	if (
		candidateSha256 !== canonicalHash(candidate) ||
		validationSha256 !== canonicalHash(validation) ||
		!Number.isInteger(logicalContentOrdinal) ||
		logicalContentOrdinal < 1 ||
		logicalContentOrdinal > 4
	) {
		throw new Error(
			`${shard.shardId} materialized bytes differ from terminal logical recovery proposal.`
		);
	}
	return {
		recoveryId: infrastructureRecoveryBinding.recoveryId,
		recoveryExecutionId: infrastructureRecoveryBinding.recoveryExecutionId,
		manifestSha256: infrastructureRecoveryBinding.manifestSha256,
		logicalLedgerSha256: infrastructureRecoveryBinding.logicalLedgerSha256,
		finalProposalSetSha256: infrastructureRecoveryBinding.finalProposalSetSha256,
		contentNamespaceId: infrastructureRecoveryBinding.contentNamespaceId,
		shardId: shard.shardId,
		logicalContentOrdinal,
		candidateSha256,
		validationSha256,
		terminalProposalSha256: canonicalHash(proposal)
	};
}
