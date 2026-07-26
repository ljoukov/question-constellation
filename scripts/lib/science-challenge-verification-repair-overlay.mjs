import { canonicalHash } from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
	validateScienceChallengeVerificationRepairAuthority,
	validateVerificationRepairCollectionTargets
} from './science-challenge-verification-repair-transaction.mjs';

/**
 * Build the exact failed-run overlay from immutable first-review fallbacks plus every candidate
 * selected during this invocation. Root candidate files are intentionally not an input.
 */
export function evaluateScienceChallengeVerificationRepairOverlay({
	priorCandidateByShard,
	selectedCandidateByShard,
	proposals,
	lastAttemptByShard,
	validateCandidateBatches,
	verificationRepairAuthority = null,
	maxAttempts = SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
}) {
	if (
		!(priorCandidateByShard instanceof Map) ||
		!(selectedCandidateByShard instanceof Map) ||
		!(lastAttemptByShard instanceof Map)
	) {
		throw new Error('Verification-repair overlay requires candidate maps.');
	}
	if (!Array.isArray(proposals) || typeof validateCandidateBatches !== 'function') {
		throw new Error('Verification-repair overlay requires proposals and a collection validator.');
	}
	if (
		!Number.isInteger(maxAttempts) ||
		maxAttempts < 1 ||
		maxAttempts > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
	) {
		throw new Error(
			`Verification-repair overlay maxAttempts must be from 1 to ${SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS}.`
		);
	}
	const proposalShardIds = proposals
		.filter((proposal) => proposal && typeof proposal.shardId === 'string')
		.map((proposal) => proposal.shardId);
	if (new Set(proposalShardIds).size !== proposalShardIds.length) {
		throw new Error('Verification-repair overlay proposals must have unique shard ids.');
	}
	const candidateBatches = new Map(
		[...priorCandidateByShard].map(([shardId, candidate]) => [shardId, structuredClone(candidate)])
	);
	for (const [shardId, candidate] of selectedCandidateByShard) {
		if (!candidateBatches.has(shardId)) {
			throw new Error(`${shardId} selected overlay candidate was absent from the first review.`);
		}
		candidateBatches.set(shardId, structuredClone(candidate));
	}
	const challengeShardById = new Map();
	if (verificationRepairAuthority) {
		const authorityValidation = validateScienceChallengeVerificationRepairAuthority({
			authority: verificationRepairAuthority
		});
		if (authorityValidation.status !== 'passed') {
			throw new Error(
				`Verification-repair overlay authority is invalid:\n${authorityValidation.issues.join(
					'\n'
				)}`
			);
		}
		const mutationIssues = validateOverlayMutationBoundary({
			priorCandidateByShard,
			candidateBatches,
			verificationRepairAuthority,
			challengeShardById
		});
		if (mutationIssues.length) {
			throw new Error(
				`Verification-repair overlay exceeds its frozen mutable challenge set:\n${mutationIssues.join(
					'\n'
				)}`
			);
		}
	}
	const frozenCandidateBatchesSha256 = canonicalHash([...candidateBatches]);
	const collectionValidation = validateCandidateBatches(
		new Map(
			[...candidateBatches].map(([shardId, candidate]) => [shardId, structuredClone(candidate)])
		)
	);
	if (canonicalHash([...candidateBatches]) !== frozenCandidateBatchesSha256) {
		throw new Error('Verification-repair overlay validation mutated the frozen candidate batches.');
	}
	const retriableProposalShardIds = new Set(
		proposals
			.filter(
				(proposal) =>
					proposal &&
					typeof proposal.shardId === 'string' &&
					Number.isInteger(proposal.attempt) &&
					proposal.attempt >= 1 &&
					proposal.attempt === lastAttemptByShard.get(proposal.shardId) &&
					proposal.attempt < maxAttempts
			)
			.map((proposal) => proposal.shardId)
	);
	const repairTargetShardIds = [
		...new Set(
			(collectionValidation?.repairTargets ?? [])
				.map((target) => target?.shardId)
				.filter((shardId) => typeof shardId === 'string' && shardId.length > 0)
		)
	];
	const targetAuthorityValidation = validateVerificationRepairCollectionTargets({
		collectionValidation,
		verificationRepairAuthority
	});
	const targetShardIssues = verificationRepairAuthority
		? (collectionValidation?.repairTargets ?? []).flatMap((target) => {
				const expectedShardId = challengeShardById.get(target?.challengeId);
				return expectedShardId && target?.shardId !== expectedShardId
					? [
							`Collection repair target ${target.challengeId} is bound to ${expectedShardId}, not ${String(
								target?.shardId
							)}.`
						]
					: [];
			})
		: [];
	const collectionAuthorityIssues = [...targetAuthorityValidation.issues, ...targetShardIssues];
	return {
		candidateBatches,
		collectionValidation,
		repairTargetShardIds,
		...(verificationRepairAuthority ? { collectionAuthorityIssues } : {}),
		canRecordCollectionFailure:
			collectionValidation?.status === 'failed' &&
			repairTargetShardIds.length > 0 &&
			collectionAuthorityIssues.length === 0 &&
			repairTargetShardIds.every((shardId) => retriableProposalShardIds.has(shardId))
	};
}

function validateOverlayMutationBoundary({
	priorCandidateByShard,
	candidateBatches,
	verificationRepairAuthority,
	challengeShardById
}) {
	const issues = [];
	const mutableIds = new Set(verificationRepairAuthority.mutableChallengeIds);
	const seenIds = new Set();
	for (const [shardId, priorCandidate] of priorCandidateByShard) {
		const candidate = candidateBatches.get(shardId);
		const priorChallenges = Array.isArray(priorCandidate?.challenges)
			? priorCandidate.challenges
			: [];
		const challenges = Array.isArray(candidate?.challenges) ? candidate.challenges : [];
		const priorIds = priorChallenges.map((entry) => entry?.definition?.id);
		const candidateIds = challenges.map((entry) => entry?.definition?.id);
		if (canonicalHash(priorIds) !== canonicalHash(candidateIds)) {
			issues.push(`${shardId}: selected overlay changed challenge order or membership.`);
			continue;
		}
		for (const [index, id] of priorIds.entries()) {
			if (typeof id !== 'string' || !id || seenIds.has(id)) {
				issues.push(`${shardId}: selected overlay has a missing or duplicate challenge id.`);
				continue;
			}
			seenIds.add(id);
			challengeShardById.set(id, shardId);
			const changed = canonicalHash(priorChallenges[index]) !== canonicalHash(challenges[index]);
			if (mutableIds.has(id) && !changed) {
				issues.push(`${id}: mutable content was returned unchanged in the selected overlay.`);
			}
			if (!mutableIds.has(id) && changed) {
				issues.push(`${id}: selected overlay changed content outside the frozen mutable set.`);
			}
		}
	}
	for (const id of mutableIds) {
		if (!seenIds.has(id)) {
			issues.push(`${id}: frozen mutable challenge is absent from the selected overlay cohort.`);
		}
	}
	return issues;
}
