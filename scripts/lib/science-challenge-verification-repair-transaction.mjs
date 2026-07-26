import {
	existsSync,
	linkSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS = 4;
export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_COHORT_SCHEMA =
	'science-challenge-verification-repair-cohort/v1';
export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_PUBLICATION_SCHEMA =
	'science-challenge-verification-repair-publication/v1';
export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_AUTHORITY_SCHEMA =
	'science-challenge-verification-repair-authority/v1';

const HASH = /^[a-f0-9]{64}$/;
const REVIEW_REBASE_DISPOSITION = 'deterministic-parent-bound-review-rebase';
const REVIEW_REBASE_MANIFEST_SCHEMA = 'science-challenge-review-rebase-manifest/v1';
const VERIFICATION_SUMMARY_SCHEMA = 'science-challenge-independent-verification-summary/v1';
const REVIEW_REBASE_SUMMARY_FIELDS = [
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'reviewRebaseCandidateSetSha256',
	'reviewRebaseCollectionValidationSha256',
	'reviewRebaseCollectionRemediationSetSha256',
	'reviewRebaseCollectionRemediations',
	'reviewRebaseCollectionRemediationTargetIds',
	'reviewRebaseCollectionRemediationTargetSetSha256'
];

export function scienceChallengeVerificationRepairRunId(repairSha256) {
	requireHash(repairSha256, 'verification repair SHA-256');
	return repairSha256.slice(0, 12);
}

export function verificationRepairTransactionRoot(outputRoot, repairSha256) {
	return path.join(
		path.resolve(outputRoot),
		`verification-repair-${scienceChallengeVerificationRepairRunId(repairSha256)}-transaction`
	);
}

export function inspectVerificationRepairAttempts({
	shardDir,
	repairSha256,
	maxAttempts = SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
}) {
	requireAttemptLimit(maxAttempts);
	const runId = scienceChallengeVerificationRepairRunId(repairSha256);
	const prefix = `verification-repair-${runId}-attempt-`;
	const continuationDirectory = `verification-repair-${runId}-attempt-04-multipart-continuation`;
	const attempts = existsSync(shardDir)
		? readdirSync(shardDir, { withFileTypes: true })
				.filter(
					(entry) =>
						entry.isDirectory() &&
						entry.name.startsWith(prefix) &&
						entry.name !== continuationDirectory
				)
				.map((entry) => {
					const suffix = entry.name.slice(prefix.length);
					if (!/^\d{2}$/.test(suffix)) {
						throw new Error(`Malformed verification-repair attempt directory ${entry.name}.`);
					}
					return {
						attempt: Number(suffix),
						directory: entry.name,
						path: path.join(shardDir, entry.name)
					};
				})
				.sort((left, right) => left.attempt - right.attempt)
		: [];
	for (const [index, record] of attempts.entries()) {
		const expected = index + 1;
		if (record.attempt !== expected) {
			throw new Error(
				`Verification-repair attempts must be contiguous from 1; found ${record.attempt} where ${expected} was expected.`
			);
		}
		if (record.attempt > maxAttempts) {
			throw new Error(
				`Verification-repair attempt ${record.attempt} exceeds the immutable ${maxAttempts}-attempt ceiling.`
			);
		}
	}
	const lastAttempt = attempts.at(-1)?.attempt ?? 0;
	return {
		attempts,
		lastAttempt,
		nextAttempt: lastAttempt + 1,
		exhausted: lastAttempt >= maxAttempts
	};
}

export function claimVerificationRepairAttempt({
	shardDir,
	repairSha256,
	attempt,
	maxAttempts = SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
}) {
	if (!Number.isInteger(attempt) || attempt < 1) {
		throw new Error('Verification-repair attempt number must be a positive integer.');
	}
	const ledger = inspectVerificationRepairAttempts({ shardDir, repairSha256, maxAttempts });
	if (ledger.exhausted) {
		throw new Error(
			`Verification-repair attempt budget is exhausted at ${maxAttempts}; existing evidence is immutable.`
		);
	}
	if (attempt !== ledger.nextAttempt) {
		throw new Error(
			`Verification-repair attempt ${attempt} is not the next monotonic attempt ${ledger.nextAttempt}.`
		);
	}
	const attemptDirectory = `verification-repair-${scienceChallengeVerificationRepairRunId(
		repairSha256
	)}-attempt-${String(attempt).padStart(2, '0')}`;
	const attemptDir = path.join(shardDir, attemptDirectory);
	mkdirSync(shardDir, { recursive: true });
	mkdirSync(attemptDir);
	return { attemptDirectory, attemptDir };
}

export function planVerificationRepairResume({
	attemptLedger,
	invalidatedAttempts = new Set(),
	resume,
	readReusableAttempt
}) {
	if (!isRecord(attemptLedger) || !Array.isArray(attemptLedger.attempts)) {
		throw new Error('Verification-repair resume planning requires an attempt ledger.');
	}
	if (!(invalidatedAttempts instanceof Set)) {
		throw new Error('Verification-repair invalidatedAttempts must be a Set.');
	}
	for (const attempt of invalidatedAttempts) {
		requireVerificationRepairAttempt(attempt, 'Verification-repair invalidated attempt');
	}
	const derivedLedger = deriveVerificationRepairAttemptLedger(attemptLedger.attempts);
	if (attemptLedger.attempts.length > 0 && !resume) {
		return {
			action: 'refused',
			issue: 'Immutable verification-repair attempt evidence already exists; rerun with --resume.'
		};
	}
	if (resume) {
		for (const record of [...attemptLedger.attempts].reverse()) {
			if (invalidatedAttempts.has(record.attempt)) continue;
			const reusable = readReusableAttempt(record);
			if (reusable) return { action: 'reuse', record, reusable };
		}
	}
	if (derivedLedger.exhausted) {
		return {
			action: 'exhausted',
			issue: 'Verification repair exhausted its immutable attempt budget.'
		};
	}
	return { action: 'run', attempt: derivedLedger.nextAttempt };
}

export function writeImmutableRepairEvidence(filePath, bytes) {
	const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes));
	if (existsSync(filePath)) {
		const existing = readFileSync(filePath);
		if (!existing.equals(buffer)) {
			throw new Error(`Immutable verification-repair evidence differs at ${filePath}.`);
		}
		return { action: 'reused', sha256: sha256(existing) };
	}
	mkdirSync(path.dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.immutable-${process.pid}-${Date.now()}-${Math.random()
		.toString(16)
		.slice(2)}.tmp`;
	writeFileSync(temporaryPath, buffer, { flag: 'wx' });
	try {
		linkSync(temporaryPath, filePath);
		return { action: 'created', sha256: sha256(buffer) };
	} catch (error) {
		if (error?.code !== 'EEXIST') throw error;
		const existing = readFileSync(filePath);
		if (!existing.equals(buffer)) {
			throw new Error(`Immutable verification-repair evidence differs at ${filePath}.`, {
				cause: error
			});
		}
		return { action: 'reused', sha256: sha256(existing) };
	} finally {
		if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
	}
}

export function writeImmutableRepairJson(filePath, value) {
	return writeImmutableRepairEvidence(filePath, `${stableStringify(value)}\n`);
}

export function requireCompleteVerificationRepairCohort({ selectedShardIds, rejectedShardIds }) {
	const selected = [...new Set(selectedShardIds)].sort();
	const rejected = [...new Set(rejectedShardIds)].sort();
	if (canonicalHash(selected) !== canonicalHash(rejected)) {
		const omitted = rejected.filter((shardId) => !selected.includes(shardId));
		const unexpected = selected.filter((shardId) => !rejected.includes(shardId));
		throw new Error(
			[
				'Verification repair must stage and publish the complete rejected-shard cohort.',
				omitted.length ? `Omitted rejected shards: ${omitted.join(', ')}.` : null,
				unexpected.length ? `Unexpected shards: ${unexpected.join(', ')}.` : null
			]
				.filter(Boolean)
				.join(' ')
		);
	}
	return rejected;
}

/**
 * Derive the only mutation authority that a parent-bound review-rebase repair may use.
 *
 * A wholly legacy verification summary deliberately returns null so legacy prompt and repair
 * bytes remain unchanged. Once any typed rebase field is present, every field is mandatory and
 * must agree with both its own hashes and the optional replayed parent manifest.
 */
export function buildScienceChallengeVerificationRepairAuthority({
	verificationSummary,
	reviewRebaseManifest = null,
	suppliedAuthority = null,
	allowManifestlessReplay = false
}) {
	if (!isRecord(verificationSummary) || !Array.isArray(verificationSummary.reviews)) {
		throw new Error('Verification-repair authority requires a complete verification summary.');
	}
	const presentTypedFields = REVIEW_REBASE_SUMMARY_FIELDS.filter(
		(field) => verificationSummary[field] !== undefined
	);
	if (presentTypedFields.length === 0) {
		if (suppliedAuthority !== null && suppliedAuthority !== undefined) {
			throw new Error(
				'A verification-repair authority cannot be supplied for a legacy verification summary.'
			);
		}
		if (reviewRebaseManifest !== null && reviewRebaseManifest !== undefined) {
			throw new Error(
				'A review-rebase manifest cannot parent a legacy verification summary without typed bindings.'
			);
		}
		return null;
	}
	if (presentTypedFields.length !== REVIEW_REBASE_SUMMARY_FIELDS.length) {
		const missing = REVIEW_REBASE_SUMMARY_FIELDS.filter(
			(field) => verificationSummary[field] === undefined
		);
		throw new Error(
			`Typed review-rebase verification summary is incomplete; missing ${missing.join(', ')}.`
		);
	}
	if (
		(reviewRebaseManifest === null || reviewRebaseManifest === undefined) &&
		allowManifestlessReplay !== true
	) {
		throw new Error(
			'Typed verification-repair authority requires its replayed review-rebase manifest; manifestless derivation is reserved for authenticated provenance replay.'
		);
	}
	if (
		verificationSummary.schemaVersion !== VERIFICATION_SUMMARY_SCHEMA ||
		verificationSummary.status !== 'failed' ||
		verificationSummary.reviewCount !== verificationSummary.reviews.length
	) {
		throw new Error(
			'Typed review-rebase authority requires a complete failed independent-verification summary.'
		);
	}
	for (const field of [
		'planSha256',
		'candidateSetSha256',
		'reviewRebaseManifestSha256',
		'reviewRebaseId',
		'reviewRebaseCandidateSetSha256',
		'reviewRebaseCollectionValidationSha256',
		'reviewRebaseCollectionRemediationSetSha256',
		'reviewRebaseCollectionRemediationTargetSetSha256'
	]) {
		requireHash(verificationSummary[field], `Verification summary ${field}`);
	}
	if (
		verificationSummary.reviewRebaseCandidateSetSha256 !== verificationSummary.candidateSetSha256
	) {
		throw new Error(
			'Typed review-rebase candidate set differs from the independently reviewed candidate set.'
		);
	}
	const reviewsById = uniqueVerificationReviews(verificationSummary.reviews);
	const independentRejectedChallengeIds = [...reviewsById.values()]
		.filter((review) => review.accepted === false)
		.map((review) => review.id)
		.sort();
	const declaredRejectedCount = verificationSummary.rejectedCount;
	const acceptedCount = [...reviewsById.values()].filter(
		(review) => review.accepted === true
	).length;
	if (
		declaredRejectedCount !== independentRejectedChallengeIds.length ||
		verificationSummary.acceptedCount !== acceptedCount
	) {
		throw new Error(
			'Typed review-rebase decision counts differ from its independent review decisions.'
		);
	}
	const collectionRemediations = normalizeCollectionRemediations(
		verificationSummary.reviewRebaseCollectionRemediations
	);
	if (
		verificationSummary.reviewRebaseCollectionRemediationSetSha256 !==
		canonicalHash(collectionRemediations)
	) {
		throw new Error(
			'Typed review-rebase collection remediations differ from their frozen set hash.'
		);
	}
	const collectionRemediationTargetIds = sortedUnique(
		[
			...new Set(collectionRemediations.map((remediation) => remediation.preferredChallengeId))
		].sort(),
		'collection-remediation target ids'
	);
	const declaredTargetIds = sortedUnique(
		verificationSummary.reviewRebaseCollectionRemediationTargetIds,
		'declared collection-remediation target ids'
	);
	if (
		canonicalHash(declaredTargetIds) !== canonicalHash(collectionRemediationTargetIds) ||
		verificationSummary.reviewRebaseCollectionRemediationTargetSetSha256 !==
			canonicalHash(collectionRemediationTargetIds)
	) {
		throw new Error(
			'Typed review-rebase collection-remediation targets differ from their exact preferred targets.'
		);
	}
	for (const remediation of collectionRemediations) {
		if (!reviewsById.has(remediation.preferredChallengeId)) {
			throw new Error(
				`Collection remediation target ${remediation.preferredChallengeId} is absent from the independent review.`
			);
		}
	}
	if (reviewRebaseManifest !== null && reviewRebaseManifest !== undefined) {
		validateReviewRebaseManifestParent({
			verificationSummary,
			reviewRebaseManifest,
			collectionRemediations,
			collectionRemediationTargetIds
		});
	}
	const mutableChallengeIds = sortedUnique(
		[...new Set([...independentRejectedChallengeIds, ...collectionRemediationTargetIds])].sort(),
		'verification-repair mutable challenge ids'
	);
	if (mutableChallengeIds.length === 0) {
		throw new Error(
			'Typed review-rebase verification has neither independent defects nor deterministic cohort remediation targets.'
		);
	}
	const authority = {
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_AUTHORITY_SCHEMA,
		parent: {
			disposition: REVIEW_REBASE_DISPOSITION,
			rebaseId: verificationSummary.reviewRebaseId,
			manifestSha256: verificationSummary.reviewRebaseManifestSha256,
			verificationSha256: canonicalHash(verificationSummary),
			planSha256: verificationSummary.planSha256,
			candidateSetSha256: verificationSummary.candidateSetSha256,
			collectionValidationSha256: verificationSummary.reviewRebaseCollectionValidationSha256,
			collectionRemediationSetSha256:
				verificationSummary.reviewRebaseCollectionRemediationSetSha256,
			collectionRemediationTargetSetSha256:
				verificationSummary.reviewRebaseCollectionRemediationTargetSetSha256
		},
		independentRejectedChallengeIds,
		independentRejectedChallengeSetSha256: canonicalHash(independentRejectedChallengeIds),
		collectionRemediations,
		collectionRemediationTargetIds,
		collectionRemediationTargetSetSha256: canonicalHash(collectionRemediationTargetIds),
		mutableChallengeIds,
		mutableChallengeSetSha256: canonicalHash(mutableChallengeIds)
	};
	const validation = validateScienceChallengeVerificationRepairAuthority({
		authority
	});
	if (validation.status !== 'passed') {
		throw new Error(`Verification-repair authority is invalid:\n${validation.issues.join('\n')}`);
	}
	if (
		suppliedAuthority !== null &&
		suppliedAuthority !== undefined &&
		canonicalHash(suppliedAuthority) !== canonicalHash(authority)
	) {
		throw new Error(
			'Supplied verification-repair authority differs from the independently derived authority.'
		);
	}
	return deepFreeze(authority);
}

export function validateScienceChallengeVerificationRepairAuthority({
	authority,
	verificationSummary = null,
	reviewRebaseManifest = null
}) {
	const issues = [];
	const authorityFields = [
		'schemaVersion',
		'parent',
		'independentRejectedChallengeIds',
		'independentRejectedChallengeSetSha256',
		'collectionRemediations',
		'collectionRemediationTargetIds',
		'collectionRemediationTargetSetSha256',
		'mutableChallengeIds',
		'mutableChallengeSetSha256'
	];
	if (
		!isRecord(authority) ||
		authority.schemaVersion !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_AUTHORITY_SCHEMA
	) {
		return {
			status: 'failed',
			issues: [
				`Verification-repair authority must use ${SCIENCE_CHALLENGE_VERIFICATION_REPAIR_AUTHORITY_SCHEMA}.`
			]
		};
	}
	if (!hasExactKeys(authority, authorityFields)) {
		issues.push('Verification-repair authority must use the exact canonical top-level shape.');
	}
	const parent = authority.parent;
	const parentFields = [
		'disposition',
		'rebaseId',
		'manifestSha256',
		'verificationSha256',
		'planSha256',
		'candidateSetSha256',
		'collectionValidationSha256',
		'collectionRemediationSetSha256',
		'collectionRemediationTargetSetSha256'
	];
	if (
		!isRecord(parent) ||
		!hasExactKeys(parent, parentFields) ||
		parent.disposition !== REVIEW_REBASE_DISPOSITION ||
		[
			'rebaseId',
			'manifestSha256',
			'verificationSha256',
			'planSha256',
			'candidateSetSha256',
			'collectionValidationSha256',
			'collectionRemediationSetSha256',
			'collectionRemediationTargetSetSha256'
		].some((field) => !HASH.test(String(parent?.[field] ?? '')))
	) {
		issues.push('Verification-repair authority has incomplete typed parent bindings.');
	}
	let independentRejectedChallengeIds = [];
	let collectionRemediations = [];
	let collectionRemediationTargetIds = [];
	let mutableChallengeIds = [];
	try {
		independentRejectedChallengeIds = sortedUnique(
			authority.independentRejectedChallengeIds,
			'independent rejected challenge ids'
		);
		collectionRemediations = normalizeCollectionRemediations(authority.collectionRemediations);
		collectionRemediationTargetIds = sortedUnique(
			authority.collectionRemediationTargetIds,
			'collection-remediation target ids'
		);
		mutableChallengeIds = sortedUnique(
			authority.mutableChallengeIds,
			'verification-repair mutable challenge ids'
		);
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
	const derivedTargetIds = [
		...new Set(collectionRemediations.map((remediation) => remediation.preferredChallengeId))
	].sort();
	const derivedMutableIds = [
		...new Set([...independentRejectedChallengeIds, ...derivedTargetIds])
	].sort();
	for (const [label, actual, expected] of [
		[
			'independent rejected challenge set',
			authority.independentRejectedChallengeSetSha256,
			canonicalHash(independentRejectedChallengeIds)
		],
		[
			'collection remediation set',
			parent?.collectionRemediationSetSha256,
			canonicalHash(collectionRemediations)
		],
		[
			'collection-remediation target ids',
			canonicalHash(collectionRemediationTargetIds),
			canonicalHash(derivedTargetIds)
		],
		[
			'collection-remediation target set',
			authority.collectionRemediationTargetSetSha256,
			canonicalHash(derivedTargetIds)
		],
		[
			'parent collection-remediation target set',
			parent?.collectionRemediationTargetSetSha256,
			canonicalHash(derivedTargetIds)
		],
		['mutable challenge ids', canonicalHash(mutableChallengeIds), canonicalHash(derivedMutableIds)],
		['mutable challenge set', authority.mutableChallengeSetSha256, canonicalHash(derivedMutableIds)]
	]) {
		if (actual !== expected) issues.push(`Verification-repair ${label} binding is stale.`);
	}
	if (verificationSummary) {
		try {
			const expected = buildScienceChallengeVerificationRepairAuthority({
				verificationSummary,
				reviewRebaseManifest,
				allowManifestlessReplay: false
			});
			if (!expected || canonicalHash(expected) !== canonicalHash(authority)) {
				issues.push('Verification-repair authority differs from the typed verification summary.');
			}
		} catch (error) {
			issues.push(error instanceof Error ? error.message : String(error));
		}
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

export function validateVerificationRepairCollectionTargets({
	collectionValidation,
	verificationRepairAuthority
}) {
	if (!verificationRepairAuthority) return { status: 'passed', issues: [] };
	const authorityValidation = validateScienceChallengeVerificationRepairAuthority({
		authority: verificationRepairAuthority
	});
	if (authorityValidation.status !== 'passed') return authorityValidation;
	const mutableIds = new Set(verificationRepairAuthority.mutableChallengeIds);
	const issues = [];
	for (const [index, target] of (collectionValidation?.repairTargets ?? []).entries()) {
		if (!nonEmpty(target?.challengeId) || !mutableIds.has(target.challengeId)) {
			issues.push(
				`Collection repair target ${target?.challengeId ?? `at index ${index}`} is outside the frozen mutable challenge set.`
			);
		}
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

export function validateVerificationRepairCandidate({
	candidate,
	priorCandidate,
	rows,
	reviews,
	verificationRepairAuthority = null
}) {
	const issues = [];
	if (!Array.isArray(candidate?.challenges) || !Array.isArray(priorCandidate?.challenges)) {
		return {
			status: 'failed',
			issues: ['Verification repair requires complete prior and proposed challenge batches.']
		};
	}
	const reviewsById =
		reviews instanceof Map
			? reviews
			: new Map((reviews ?? []).map((review) => [review.id, review]));
	const priorById = new Map(
		priorCandidate.challenges.map((entry) => [entry?.definition?.id, entry])
	);
	const candidateById = new Map(
		candidate.challenges.map((entry) => [entry?.definition?.id, entry])
	);
	const expectedIds = rows.map((row) => row.id);
	const priorIds = priorCandidate.challenges.map((entry) => entry?.definition?.id);
	const candidateIds = candidate.challenges.map((entry) => entry?.definition?.id);
	if (
		canonicalHash(priorIds) !== canonicalHash(expectedIds) ||
		canonicalHash(candidateIds) !== canonicalHash(expectedIds)
	) {
		issues.push(
			'Verification-repair batches must preserve the exact verifier-bound row order and membership.'
		);
	}
	let mutableIds = null;
	if (verificationRepairAuthority) {
		const authorityValidation = validateScienceChallengeVerificationRepairAuthority({
			authority: verificationRepairAuthority
		});
		issues.push(...authorityValidation.issues);
		const rejectedIds = [...reviewsById.values()]
			.filter((review) => review?.accepted === false)
			.map((review) => review.id)
			.sort();
		if (
			canonicalHash(rejectedIds) !==
			canonicalHash(verificationRepairAuthority.independentRejectedChallengeIds ?? [])
		) {
			issues.push(
				'Verification-repair authority independent defects differ from the verifier decisions.'
			);
		}
		mutableIds = new Set(verificationRepairAuthority.mutableChallengeIds ?? []);
	}
	for (const row of rows) {
		const review = reviewsById.get(row.id);
		const proposed = candidateById.get(row.id);
		const prior = priorById.get(row.id);
		if (!proposed || !prior) {
			issues.push(`${row.id}: verification-repair batch membership is incomplete.`);
			continue;
		}
		const candidateSha256 = canonicalHash(proposed);
		const priorSha256 = canonicalHash(prior);
		if (mutableIds) {
			if (mutableIds.has(row.id) && candidateSha256 === priorSha256) {
				issues.push(`${row.id}: mutable content was returned unchanged.`);
			}
			if (!mutableIds.has(row.id) && candidateSha256 !== priorSha256) {
				issues.push(
					`${row.id}: content outside the frozen mutable challenge set changed during targeted repair.`
				);
			}
		} else {
			if (review?.accepted === false && candidateSha256 === priorSha256) {
				issues.push(`${row.id}: rejected content was returned unchanged.`);
			}
			if (review?.accepted === true && candidateSha256 !== priorSha256) {
				issues.push(`${row.id}: independently accepted content changed during targeted repair.`);
			}
		}
	}
	return { status: issues.length ? 'failed' : 'passed', issues };
}

export function readVerificationRepairCohortState({ outputRoot, repairSha256 }) {
	const statePath = path.join(
		verificationRepairTransactionRoot(outputRoot, repairSha256),
		'cohort-state.json'
	);
	if (!existsSync(statePath)) {
		return {
			path: statePath,
			state: bindState({
				schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_COHORT_SCHEMA,
				repairSha256,
				status: 'collecting',
				invalidatedAttempts: {}
			})
		};
	}
	const state = JSON.parse(readFileSync(statePath, 'utf8'));
	validateBoundState(
		state,
		SCIENCE_CHALLENGE_VERIFICATION_REPAIR_COHORT_SCHEMA,
		repairSha256,
		'verification-repair cohort state'
	);
	if (
		!['collecting', 'collection-failed', 'collection-passed', 'committed'].includes(state.status)
	) {
		throw new Error(`Unsupported verification-repair cohort state ${String(state.status)}.`);
	}
	if (!isRecord(state.invalidatedAttempts)) {
		throw new Error('Verification-repair cohort state invalidatedAttempts must be an object.');
	}
	for (const shardId of Object.keys(state.invalidatedAttempts)) {
		if (!nonEmpty(shardId)) {
			throw new Error('Verification-repair cohort invalidation shardId is malformed.');
		}
		invalidatedVerificationRepairAttempts(state, shardId);
	}
	if (state.status === 'collection-passed' || state.status === 'committed') {
		requireVerificationRepairProposals(state.proposals, {
			label: 'Stored collection-pass'
		});
	}
	return { path: statePath, state };
}

export function invalidatedVerificationRepairAttempts(state, shardId) {
	const rows = state?.invalidatedAttempts?.[shardId];
	if (rows === undefined) return new Set();
	if (
		!Array.isArray(rows) ||
		rows.some(
			(row) =>
				!Number.isInteger(row?.attempt) ||
				row.attempt < 1 ||
				row.attempt > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
				!HASH.test(String(row?.candidateSha256 ?? '')) ||
				!Array.isArray(row?.issues) ||
				row.issues.some((issue) => typeof issue !== 'string' || !issue.trim())
		)
	) {
		throw new Error(`Verification-repair cohort invalidation for ${shardId} is malformed.`);
	}
	return new Set(rows.map((row) => row.attempt));
}

export function recordVerificationRepairCollectionFailure({
	outputRoot,
	repairSha256,
	collectionValidation,
	proposals,
	verificationRepairAuthority = null
}) {
	return withVerificationRepairTransactionLock({ outputRoot, repairSha256 }, () =>
		recordVerificationRepairCollectionFailureUnlocked({
			outputRoot,
			repairSha256,
			collectionValidation,
			proposals,
			verificationRepairAuthority
		})
	);
}

function recordVerificationRepairCollectionFailureUnlocked({
	outputRoot,
	repairSha256,
	collectionValidation,
	proposals,
	verificationRepairAuthority
}) {
	if (collectionValidation?.status !== 'failed' || !Array.isArray(collectionValidation.issues)) {
		throw new Error('A collection-failure record requires failed collection validation.');
	}
	const targetValidation = validateVerificationRepairCollectionTargets({
		collectionValidation,
		verificationRepairAuthority
	});
	if (targetValidation.status !== 'passed') {
		throw new Error(
			`Collection failure exceeds verification-repair authority:\n${targetValidation.issues.join(
				'\n'
			)}`
		);
	}
	const { path: statePath, state } = readVerificationRepairCohortState({
		outputRoot,
		repairSha256
	});
	if (state.status === 'collection-passed' || state.status === 'committed') {
		throw new Error(
			`Verification-repair cohort state ${state.status} cannot be replaced by a collection failure.`
		);
	}
	const proposalByShard = requireVerificationRepairProposals(proposals, {
		label: 'Collection-failure',
		retriable: true
	});
	const invalidatedAttempts = structuredClone(state.invalidatedAttempts);
	const issuesByShard = new Map();
	for (const target of collectionValidation.repairTargets ?? []) {
		const issues = issuesByShard.get(target.shardId) ?? [];
		for (const issue of target.issues ?? []) {
			if (!issues.includes(issue)) issues.push(issue);
		}
		issuesByShard.set(target.shardId, issues);
	}
	for (const [shardId, targetIssues] of issuesByShard) {
		const proposal = proposalByShard.get(shardId);
		if (!proposal) {
			throw new Error(`Collection repair target ${shardId} has no proposed repaired candidate.`);
		}
		const existing = Array.isArray(invalidatedAttempts[shardId])
			? invalidatedAttempts[shardId]
			: [];
		const row = {
			attempt: proposal.attempt,
			candidateSha256: proposal.candidateSha256,
			issues: targetIssues
		};
		const sameAttempt = existing.find((candidate) => candidate.attempt === proposal.attempt);
		if (sameAttempt && canonicalHash(sameAttempt) !== canonicalHash(row)) {
			throw new Error(
				`Collection invalidation for ${shardId} attempt ${proposal.attempt} was tampered.`
			);
		}
		if (!sameAttempt) existing.push(row);
		existing.sort((left, right) => left.attempt - right.attempt);
		invalidatedAttempts[shardId] = existing;
	}
	const next = bindState({
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_COHORT_SCHEMA,
		repairSha256,
		status: 'collection-failed',
		invalidatedAttempts,
		collectionValidation
	});
	atomicWriteJson(statePath, next);
	return next;
}

export function recordVerificationRepairCollectionPass({
	outputRoot,
	repairSha256,
	collectionValidation,
	proposals
}) {
	return withVerificationRepairTransactionLock({ outputRoot, repairSha256 }, () =>
		recordVerificationRepairCollectionPassUnlocked({
			outputRoot,
			repairSha256,
			collectionValidation,
			proposals
		})
	);
}

function recordVerificationRepairCollectionPassUnlocked({
	outputRoot,
	repairSha256,
	collectionValidation,
	proposals
}) {
	if (collectionValidation?.status !== 'passed' || collectionValidation.issues?.length) {
		throw new Error('A collection-pass record requires clean collection validation.');
	}
	const { path: statePath, state } = readVerificationRepairCohortState({
		outputRoot,
		repairSha256
	});
	requireVerificationRepairProposals(proposals, { label: 'Collection-pass' });
	const proposalBindings = proposals.map(proposalBinding).sort(compareShard);
	if (
		state.status === 'committed' &&
		canonicalHash(state.proposals ?? []) === canonicalHash(proposalBindings)
	) {
		return state;
	}
	if (state.status === 'committed') {
		throw new Error(
			'Committed verification-repair cohort proposals cannot be replaced by a different set.'
		);
	}
	if (
		state.status === 'collection-passed' &&
		canonicalHash(state.proposals ?? []) !== canonicalHash(proposalBindings)
	) {
		throw new Error(
			'Collection-passed verification-repair proposals are frozen and cannot be replaced.'
		);
	}
	const next = bindState({
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_COHORT_SCHEMA,
		repairSha256,
		status: 'collection-passed',
		invalidatedAttempts: state.invalidatedAttempts,
		collectionValidation,
		proposals: proposalBindings
	});
	atomicWriteJson(statePath, next);
	return next;
}

export function readVerificationRepairPublication({ outputRoot, repairSha256 }) {
	const publicationRoot = path.join(
		verificationRepairTransactionRoot(outputRoot, repairSha256),
		'publication'
	);
	const journalPath = path.join(publicationRoot, 'journal.json');
	if (!existsSync(journalPath)) return { publicationRoot, journalPath, journal: null };
	const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
	validateBoundState(
		journal,
		SCIENCE_CHALLENGE_VERIFICATION_REPAIR_PUBLICATION_SCHEMA,
		repairSha256,
		'verification-repair publication journal'
	);
	validatePublicationRecords(journal.records, outputRoot, publicationRoot);
	return { publicationRoot, journalPath, journal };
}

export function recoverVerificationRepairPublication({ outputRoot, repairSha256 }) {
	return withVerificationRepairTransactionLock({ outputRoot, repairSha256 }, () =>
		recoverVerificationRepairPublicationUnlocked({ outputRoot, repairSha256 })
	);
}

function recoverVerificationRepairPublicationUnlocked({ outputRoot, repairSha256 }) {
	const publication = readVerificationRepairPublication({ outputRoot, repairSha256 });
	if (!publication.journal) return { action: 'none', journal: null };
	const { journalPath } = publication;
	let { journal } = publication;
	if (journal.status === 'committed') {
		assertPublicationTargets(journal.records, 'proposal');
		return { action: 'committed', journal };
	}
	if (journal.status === 'prepared' || journal.status === 'publishing') {
		assertPublicationTargetsRecoverable(journal.records);
		rollbackPublicationRecords(journal.records);
		journal = bindState({
			...withoutStateHash(journal),
			status: 'rolled-back',
			rolledBackAt: new Date().toISOString()
		});
		atomicWriteJson(journalPath, journal);
		return { action: 'rolled-back', journal };
	}
	if (journal.status === 'rolled-back') {
		assertPublicationTargets(journal.records, 'backup');
		return { action: 'rolled-back', journal };
	}
	throw new Error(`Unsupported verification-repair publication status ${String(journal.status)}.`);
}

export function publishVerificationRepairCohort({
	outputRoot,
	repairSha256,
	proposals,
	injectFailure = null
}) {
	return withVerificationRepairTransactionLock({ outputRoot, repairSha256 }, () =>
		publishVerificationRepairCohortUnlocked({
			outputRoot,
			repairSha256,
			proposals,
			injectFailure
		})
	);
}

function publishVerificationRepairCohortUnlocked({
	outputRoot,
	repairSha256,
	proposals,
	injectFailure = null
}) {
	if (!Array.isArray(proposals) || proposals.length === 0) {
		throw new Error('Verification-repair publication requires at least one proposal.');
	}
	const uniqueShards = new Set(proposals.map((proposal) => proposal.shardId));
	if (uniqueShards.size !== proposals.length) {
		throw new Error('Verification-repair publication proposals must have unique shard ids.');
	}
	const { path: cohortStatePath, state: cohortState } = readVerificationRepairCohortState({
		outputRoot,
		repairSha256
	});
	assertCohortReadyForPublication(cohortState, proposals);
	const recovery = recoverVerificationRepairPublicationUnlocked({ outputRoot, repairSha256 });
	if (recovery.action === 'committed') {
		assertProposalSetMatchesJournal(proposals, recovery.journal);
		if (cohortState.status !== 'committed') {
			atomicWriteJson(
				cohortStatePath,
				bindState({
					...withoutStateHash(cohortState),
					status: 'committed',
					publicationSha256: canonicalHash(recovery.journal)
				})
			);
		}
		return { action: 'resumed', journal: recovery.journal };
	}
	const publicationRoot = path.join(
		verificationRepairTransactionRoot(outputRoot, repairSha256),
		'publication'
	);
	const journalPath = path.join(publicationRoot, 'journal.json');
	mkdirSync(publicationRoot, { recursive: true });
	let journal = recovery.journal;
	if (!journal) {
		const records = proposals
			.map((proposal) => preparePublicationRecord({ outputRoot, publicationRoot, proposal }))
			.sort((left, right) => left.shardId.localeCompare(right.shardId));
		journal = bindState({
			schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_PUBLICATION_SCHEMA,
			repairSha256,
			status: 'prepared',
			records
		});
		writeImmutableRepairJson(journalPath, journal);
	} else {
		assertProposalSetMatchesJournal(proposals, journal);
		assertPublicationTargets(journal.records, 'backup');
	}
	journal = bindState({
		...withoutStateHash(journal),
		status: 'publishing',
		publishingAt: new Date().toISOString()
	});
	atomicWriteJson(journalPath, journal);
	let writeIndex = 0;
	try {
		for (const record of journal.records) {
			for (const kind of ['candidate', 'validation']) {
				atomicReplaceFromFile(record[kind].targetPath, record[kind].proposalPath);
				writeIndex += 1;
				injectFailure?.({
					phase: 'after-write',
					writeIndex,
					shardId: record.shardId,
					kind
				});
			}
		}
		assertPublicationTargets(journal.records, 'proposal');
		injectFailure?.({ phase: 'before-commit', writeIndex });
		journal = bindState({
			...withoutStateHash(journal),
			status: 'committed',
			committedAt: new Date().toISOString()
		});
		atomicWriteJson(journalPath, journal);
		atomicWriteJson(
			cohortStatePath,
			bindState({
				...withoutStateHash(cohortState),
				status: 'committed',
				publicationSha256: canonicalHash(journal)
			})
		);
		return { action: 'published', journal };
	} catch (error) {
		let rollbackError = null;
		try {
			assertPublicationTargetsRecoverable(journal.records);
			rollbackPublicationRecords(journal.records);
			journal = bindState({
				...withoutStateHash(journal),
				status: 'rolled-back',
				rolledBackAt: new Date().toISOString()
			});
			atomicWriteJson(journalPath, journal);
		} catch (rollbackFailure) {
			rollbackError = rollbackFailure;
		}
		if (rollbackError) {
			throw new AggregateError(
				[error, rollbackError],
				'Verification-repair publication failed and rollback did not complete.',
				{ cause: error }
			);
		}
		throw error;
	}
}

function preparePublicationRecord({ outputRoot, publicationRoot, proposal }) {
	if (!nonEmpty(proposal?.shardId)) throw new Error('Publication proposal shardId is required.');
	for (const field of [
		'candidatePath',
		'validationPath',
		'candidateSha256',
		'validationSha256',
		'expectedTargetCandidateSha256',
		'expectedTargetValidationSha256'
	]) {
		if (!nonEmpty(proposal[field])) {
			throw new Error(`Publication proposal ${proposal.shardId}.${field} is required.`);
		}
	}
	requireHash(proposal.candidateSha256, `${proposal.shardId} candidate SHA-256`);
	requireHash(proposal.validationSha256, `${proposal.shardId} validation SHA-256`);
	requireHash(
		proposal.expectedTargetCandidateSha256,
		`${proposal.shardId} expected target candidate SHA-256`
	);
	requireHash(
		proposal.expectedTargetValidationSha256,
		`${proposal.shardId} expected target validation SHA-256`
	);
	const shardRoot = path.join(path.resolve(outputRoot), 'shards', proposal.shardId);
	const targetCandidate = path.join(shardRoot, 'candidate.json');
	const targetValidation = path.join(shardRoot, 'validation.json');
	const sourceCandidate = safeExistingPath(
		proposal.candidatePath,
		outputRoot,
		'proposal candidate'
	);
	const sourceValidation = safeExistingPath(
		proposal.validationPath,
		outputRoot,
		'proposal validation'
	);
	const backupRoot = path.join(publicationRoot, 'backups', proposal.shardId);
	const proposalRoot = path.join(publicationRoot, 'proposals', proposal.shardId);
	const record = {
		shardId: proposal.shardId,
		attempt: proposal.attempt,
		candidate: publicationFileRecord({
			targetPath: targetCandidate,
			sourcePath: sourceCandidate,
			backupPath: path.join(backupRoot, 'candidate.json'),
			proposalPath: path.join(proposalRoot, 'candidate.json'),
			expectedBackupCanonicalSha256: proposal.expectedTargetCandidateSha256,
			expectedProposalCanonicalSha256: proposal.candidateSha256
		}),
		validation: publicationFileRecord({
			targetPath: targetValidation,
			sourcePath: sourceValidation,
			backupPath: path.join(backupRoot, 'validation.json'),
			proposalPath: path.join(proposalRoot, 'validation.json'),
			expectedBackupCanonicalSha256: proposal.expectedTargetValidationSha256,
			expectedProposalCanonicalSha256: proposal.validationSha256
		})
	};
	return record;
}

function publicationFileRecord({
	targetPath,
	sourcePath,
	backupPath,
	proposalPath,
	expectedBackupCanonicalSha256,
	expectedProposalCanonicalSha256
}) {
	if (!existsSync(targetPath)) {
		throw new Error(`Verification-repair publication target is missing: ${targetPath}`);
	}
	const backupBytes = readFileSync(targetPath);
	const proposalBytes = readFileSync(sourcePath);
	const backupValue = JSON.parse(backupBytes.toString('utf8'));
	const proposalValue = JSON.parse(proposalBytes.toString('utf8'));
	if (canonicalHash(backupValue) !== expectedBackupCanonicalSha256) {
		throw new Error(
			`Verification-repair target changed after collection validation at ${targetPath}.`
		);
	}
	if (canonicalHash(proposalValue) !== expectedProposalCanonicalSha256) {
		throw new Error(`Verification-repair proposal canonical hash mismatch at ${sourcePath}.`);
	}
	writeImmutableRepairEvidence(backupPath, backupBytes);
	writeImmutableRepairEvidence(proposalPath, proposalBytes);
	return {
		targetPath,
		backupPath,
		backupSha256: sha256(backupBytes),
		backupCanonicalSha256: expectedBackupCanonicalSha256,
		proposalPath,
		proposalSha256: sha256(proposalBytes),
		proposalCanonicalSha256: expectedProposalCanonicalSha256
	};
}

function validatePublicationRecords(records, outputRoot, publicationRoot) {
	if (!Array.isArray(records) || records.length === 0) {
		throw new Error('Verification-repair publication journal records are missing.');
	}
	const outputPrefix = `${path.resolve(outputRoot)}${path.sep}`;
	const publicationPrefix = `${path.resolve(publicationRoot)}${path.sep}`;
	const shardIds = new Set();
	for (const record of records) {
		if (!nonEmpty(record?.shardId) || shardIds.has(record.shardId)) {
			throw new Error('Verification-repair publication journal has invalid shard membership.');
		}
		requireVerificationRepairAttempt(
			record.attempt,
			`Verification-repair publication ${record.shardId} attempt`
		);
		shardIds.add(record.shardId);
		for (const kind of ['candidate', 'validation']) {
			const file = record[kind];
			if (
				!isRecord(file) ||
				!path.resolve(file.targetPath).startsWith(outputPrefix) ||
				!path.resolve(file.backupPath).startsWith(publicationPrefix) ||
				!path.resolve(file.proposalPath).startsWith(publicationPrefix)
			) {
				throw new Error(
					`Verification-repair publication ${record.shardId}.${kind} path is unsafe.`
				);
			}
			for (const field of [
				'backupSha256',
				'backupCanonicalSha256',
				'proposalSha256',
				'proposalCanonicalSha256'
			]) {
				requireHash(file[field], `${record.shardId}.${kind}.${field}`);
			}
			assertFileHash(file.backupPath, file.backupSha256, `${record.shardId} backup ${kind}`);
			assertFileHash(file.proposalPath, file.proposalSha256, `${record.shardId} proposal ${kind}`);
			assertCanonicalJsonHash(
				file.backupPath,
				file.backupCanonicalSha256,
				`${record.shardId} backup ${kind}`
			);
			assertCanonicalJsonHash(
				file.proposalPath,
				file.proposalCanonicalSha256,
				`${record.shardId} proposal ${kind}`
			);
		}
	}
}

function assertProposalSetMatchesJournal(proposals, journal) {
	const actual = proposals.map(proposalBinding).sort(compareShard);
	const expected = journal.records
		.map((record) => ({
			shardId: record.shardId,
			attempt: record.attempt,
			candidateSha256: record.candidate.proposalCanonicalSha256,
			validationSha256: record.validation.proposalCanonicalSha256,
			expectedTargetCandidateSha256: record.candidate.backupCanonicalSha256,
			expectedTargetValidationSha256: record.validation.backupCanonicalSha256
		}))
		.sort(compareShard);
	if (canonicalHash(actual) !== canonicalHash(expected)) {
		throw new Error('Verification-repair publication proposals differ from the frozen journal.');
	}
}

function assertCohortReadyForPublication(state, proposals) {
	if (!['collection-passed', 'committed'].includes(state?.status)) {
		throw new Error(
			'Verification-repair publication requires a clean, frozen collection-pass cohort.'
		);
	}
	const actual = proposals.map(proposalBinding).sort(compareShard);
	const expected = Array.isArray(state.proposals) ? [...state.proposals].sort(compareShard) : [];
	if (canonicalHash(actual) !== canonicalHash(expected)) {
		throw new Error(
			'Verification-repair publication proposals differ from the collection-pass cohort.'
		);
	}
}

function assertPublicationTargets(records, version) {
	for (const record of records) {
		for (const kind of ['candidate', 'validation']) {
			const file = record[kind];
			assertFileHash(
				file.targetPath,
				file[`${version}Sha256`],
				`${record.shardId} published ${kind}`
			);
			assertCanonicalJsonHash(
				file.targetPath,
				file[`${version}CanonicalSha256`],
				`${record.shardId} published ${kind}`
			);
		}
	}
}

function assertPublicationTargetsRecoverable(records) {
	for (const record of records) {
		for (const kind of ['candidate', 'validation']) {
			const file = record[kind];
			const currentSha256 = existsSync(file.targetPath)
				? sha256(readFileSync(file.targetPath))
				: null;
			if (currentSha256 !== file.backupSha256 && currentSha256 !== file.proposalSha256) {
				throw new Error(
					`${record.shardId} published ${kind} is neither the frozen backup nor proposal; refusing destructive recovery.`
				);
			}
		}
	}
}

function rollbackPublicationRecords(records) {
	for (const record of records) {
		for (const kind of ['candidate', 'validation']) {
			atomicReplaceFromFile(record[kind].targetPath, record[kind].backupPath);
		}
	}
	assertPublicationTargets(records, 'backup');
}

function atomicReplaceFromFile(targetPath, sourcePath) {
	const bytes = readFileSync(sourcePath);
	const temporaryPath = `${targetPath}.verification-repair-${process.pid}-${Date.now()}-${Math.random()
		.toString(16)
		.slice(2)}.tmp`;
	writeFileSync(temporaryPath, bytes, { flag: 'wx' });
	renameSync(temporaryPath, targetPath);
}

function atomicWriteJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.${process.pid}-${Date.now()}-${Math.random()
		.toString(16)
		.slice(2)}.tmp`;
	writeFileSync(temporaryPath, `${stableStringify(value)}\n`, { flag: 'wx' });
	renameSync(temporaryPath, filePath);
}

function withVerificationRepairTransactionLock({ outputRoot, repairSha256 }, callback) {
	const lockPath = path.join(
		verificationRepairTransactionRoot(outputRoot, repairSha256),
		'.exclusive.lock'
	);
	const owner = acquireTransactionLock(lockPath);
	try {
		return callback();
	} finally {
		releaseTransactionLock(lockPath, owner);
	}
}

function acquireTransactionLock(lockPath) {
	mkdirSync(path.dirname(lockPath), { recursive: true });
	const owner = {
		schemaVersion: 'science-challenge-verification-repair-lock/v1',
		pid: process.pid,
		token: `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
		createdAt: new Date().toISOString()
	};
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			mkdirSync(lockPath);
			writeFileSync(path.join(lockPath, 'owner.json'), `${stableStringify(owner)}\n`, {
				flag: 'wx'
			});
			return owner;
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;
			const existing = readTransactionLockOwner(lockPath);
			if (existing ? processIsAlive(existing.pid) : lockIsFresh(lockPath)) {
				throw new Error('Verification-repair cohort is locked by another process.', {
					cause: error
				});
			}
			const stalePath = `${lockPath}.stale-${process.pid}-${Date.now()}`;
			renameSync(lockPath, stalePath);
			rmSync(stalePath, { recursive: true, force: true });
		}
	}
	throw new Error('Could not acquire verification-repair cohort lock.');
}

function releaseTransactionLock(lockPath, owner) {
	const existing = readTransactionLockOwner(lockPath);
	if (!existing || existing.token !== owner.token) {
		throw new Error('Verification-repair cohort lock ownership changed.');
	}
	rmSync(lockPath, { recursive: true, force: true });
}

function readTransactionLockOwner(lockPath) {
	const ownerPath = path.join(lockPath, 'owner.json');
	if (!existsSync(ownerPath)) return null;
	try {
		return JSON.parse(readFileSync(ownerPath, 'utf8'));
	} catch {
		return null;
	}
}

function lockIsFresh(lockPath) {
	try {
		return Date.now() - statSync(lockPath).mtimeMs < 30_000;
	} catch {
		return true;
	}
}

function processIsAlive(pid) {
	if (!Number.isInteger(pid) || pid < 1) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error?.code === 'EPERM';
	}
}

function proposalBinding(proposal) {
	requireVerificationRepairAttempt(
		proposal?.attempt,
		`Verification-repair proposal ${proposal?.shardId ?? '<unknown>'} attempt`
	);
	return {
		shardId: proposal.shardId,
		attempt: proposal.attempt,
		candidateSha256: proposal.candidateSha256,
		validationSha256: proposal.validationSha256,
		expectedTargetCandidateSha256: proposal.expectedTargetCandidateSha256,
		expectedTargetValidationSha256: proposal.expectedTargetValidationSha256
	};
}

function requireVerificationRepairProposals(proposals, { label, retriable = false }) {
	if (!Array.isArray(proposals)) {
		throw new Error(`${label} verification-repair proposals must be an array.`);
	}
	const proposalByShard = new Map();
	for (const proposal of proposals) {
		if (!nonEmpty(proposal?.shardId)) {
			throw new Error(`${label} verification-repair proposal shardId is required.`);
		}
		if (proposalByShard.has(proposal.shardId)) {
			throw new Error(`${label} verification-repair proposals must have unique shard ids.`);
		}
		requireVerificationRepairAttempt(
			proposal.attempt,
			`${label} verification-repair proposal ${proposal.shardId} attempt`
		);
		if (retriable && proposal.attempt >= SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS) {
			throw new Error(
				`${label} verification-repair proposal ${proposal.shardId} attempt ${proposal.attempt} cannot allocate a fifth attempt.`
			);
		}
		proposalByShard.set(proposal.shardId, proposal);
	}
	return proposalByShard;
}

function deriveVerificationRepairAttemptLedger(attempts) {
	for (const [index, record] of attempts.entries()) {
		const expectedAttempt = index + 1;
		requireVerificationRepairAttempt(record?.attempt, 'Verification-repair resume ledger attempt');
		if (record.attempt !== expectedAttempt) {
			throw new Error(
				`Verification-repair resume ledger attempts must be contiguous from 1; found ${record.attempt} where ${expectedAttempt} was expected.`
			);
		}
	}
	const lastAttempt = attempts.at(-1)?.attempt ?? 0;
	return {
		lastAttempt,
		nextAttempt: lastAttempt + 1,
		exhausted: lastAttempt >= SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
	};
}

function requireVerificationRepairAttempt(value, label) {
	if (
		!Number.isInteger(value) ||
		value < 1 ||
		value > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
	) {
		throw new Error(
			`${label} must be from 1 to ${SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS}.`
		);
	}
}

function bindState(core) {
	const withoutHash = withoutStateHash(core);
	return { ...withoutHash, stateSha256: canonicalHash(withoutHash) };
}

function validateBoundState(state, schemaVersion, repairSha256, label) {
	if (
		!isRecord(state) ||
		state.schemaVersion !== schemaVersion ||
		state.repairSha256 !== repairSha256 ||
		!HASH.test(String(state.stateSha256 ?? ''))
	) {
		throw new Error(`${label} metadata is incomplete.`);
	}
	if (state.stateSha256 !== canonicalHash(withoutStateHash(state))) {
		throw new Error(`${label} self-binding hash mismatch.`);
	}
}

function withoutStateHash(state) {
	const value = { ...state };
	delete value.stateSha256;
	return value;
}

function safeExistingPath(filePath, root, label) {
	const resolved = path.resolve(filePath);
	if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`) || !existsSync(resolved)) {
		throw new Error(`Unsafe or missing ${label}: ${resolved}`);
	}
	return resolved;
}

function assertFileHash(filePath, expected, label) {
	if (!existsSync(filePath) || sha256(readFileSync(filePath)) !== expected) {
		throw new Error(`${label} byte hash mismatch.`);
	}
}

function assertCanonicalJsonHash(filePath, expected, label) {
	let value;
	try {
		value = JSON.parse(readFileSync(filePath, 'utf8'));
	} catch {
		throw new Error(`${label} is not valid JSON.`);
	}
	if (canonicalHash(value) !== expected) throw new Error(`${label} canonical hash mismatch.`);
}

function requireHash(value, label) {
	if (!HASH.test(String(value ?? '')))
		throw new Error(`${label} must be a lowercase SHA-256 hash.`);
}

function requireAttemptLimit(value) {
	if (
		!Number.isInteger(value) ||
		value < 1 ||
		value > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
	) {
		throw new Error(
			`Verification-repair maxAttempts must be from 1 to ${SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS}.`
		);
	}
}

function uniqueVerificationReviews(reviews) {
	const byId = new Map();
	for (const [index, review] of reviews.entries()) {
		if (!nonEmpty(review?.id) || typeof review.accepted !== 'boolean' || byId.has(review.id)) {
			throw new Error(
				`Verification summary review ${index} has a missing/duplicate id or no boolean decision.`
			);
		}
		byId.set(review.id, review);
	}
	return byId;
}

function normalizeCollectionRemediations(value) {
	if (!Array.isArray(value) || value.length === 0) {
		throw new Error('Typed review-rebase collection remediations must be a non-empty array.');
	}
	const seenIssues = new Set();
	return value.map((remediation, index) => {
		if (
			!isRecord(remediation) ||
			!hasExactKeys(remediation, ['issue', 'preferredChallengeId']) ||
			!nonEmpty(remediation.issue) ||
			!nonEmpty(remediation.preferredChallengeId) ||
			seenIssues.has(remediation.issue)
		) {
			throw new Error(
				`Typed review-rebase collection remediation ${index} is malformed or duplicated.`
			);
		}
		seenIssues.add(remediation.issue);
		return {
			issue: remediation.issue,
			preferredChallengeId: remediation.preferredChallengeId
		};
	});
}

function validateReviewRebaseManifestParent({
	verificationSummary,
	reviewRebaseManifest,
	collectionRemediations,
	collectionRemediationTargetIds
}) {
	if (
		!isRecord(reviewRebaseManifest) ||
		reviewRebaseManifest.schemaVersion !== REVIEW_REBASE_MANIFEST_SCHEMA ||
		reviewRebaseManifest.status !== 'review-pending' ||
		reviewRebaseManifest.disposition !== REVIEW_REBASE_DISPOSITION ||
		reviewRebaseManifest.requiresFreshFullVerification !== true ||
		reviewRebaseManifest.releaseEligible !== false
	) {
		throw new Error(
			'Typed verification summary requires an exact non-release-eligible review-rebase parent manifest.'
		);
	}
	if (
		verificationSummary.reviewRebaseManifestSha256 !== canonicalHash(reviewRebaseManifest) ||
		verificationSummary.reviewRebaseId !== reviewRebaseManifest.rebaseId ||
		verificationSummary.planSha256 !== reviewRebaseManifest.planSha256 ||
		verificationSummary.candidateSetSha256 !== reviewRebaseManifest.candidateSetSha256 ||
		verificationSummary.reviewRebaseCollectionValidationSha256 !==
			reviewRebaseManifest.collectionValidationSha256 ||
		verificationSummary.reviewRebaseCollectionRemediationSetSha256 !==
			reviewRebaseManifest.collectionRemediationSetSha256 ||
		canonicalHash(collectionRemediations) !==
			canonicalHash(reviewRebaseManifest.collectionRemediations) ||
		canonicalHash(collectionRemediationTargetIds) !==
			canonicalHash(
				[
					...new Set(
						(reviewRebaseManifest.collectionRemediations ?? []).map(
							(remediation) => remediation?.preferredChallengeId
						)
					)
				].sort()
			)
	) {
		throw new Error(
			'Typed verification summary differs from its exact review-rebase parent manifest.'
		);
	}
}

function sortedUnique(values, label) {
	if (
		!Array.isArray(values) ||
		values.some((value) => !nonEmpty(value)) ||
		new Set(values).size !== values.length
	) {
		throw new Error(`Verification-repair ${label} must contain unique non-empty strings.`);
	}
	const sorted = [...values].sort();
	if (canonicalHash(sorted) !== canonicalHash(values)) {
		throw new Error(`Verification-repair ${label} must be sorted.`);
	}
	return sorted;
}

function deepFreeze(value) {
	if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const child of Object.values(value)) deepFreeze(child);
	return value;
}

function hasExactKeys(value, expectedKeys) {
	if (!isRecord(value)) return false;
	const actual = Object.keys(value).sort();
	const expected = [...expectedKeys].sort();
	return canonicalHash(actual) === canonicalHash(expected);
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function compareShard(left, right) {
	return left.shardId.localeCompare(right.shardId);
}
