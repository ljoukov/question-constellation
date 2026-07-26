import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { validateScienceChallengeDescendantRemapManifest } from './science-challenge-descendant-remap.mjs';
import {
	SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA,
	validateScienceChallengeDifficultyPlanAdjustmentManifest,
	validateScienceChallengeDifficultyPlanAdjustmentSetManifest
} from './science-challenge-difficulty-plan-adjustment.mjs';
import { projectScienceChallengeEffectiveRecoveryPlan } from './science-challenge-effective-plan-recovery.mjs';
import {
	canonicalHash,
	sha256,
	stableStringify,
	validateIndependentContentReviewRow
} from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
	buildScienceChallengeVerificationRepairAuthority,
	validateScienceChallengeVerificationRepairAuthority,
	validateVerificationRepairCandidate
} from './science-challenge-verification-repair-transaction.mjs';
import {
	SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION,
	SCIENCE_CHALLENGE_REVIEW_REBASE_MANIFEST_SCHEMA
} from './science-challenge-review-rebase.mjs';
import {
	buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding,
	inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal,
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding
} from './science-challenge-review-rebase-infra-recovery.mjs';
import { validateScienceChallengeInfrastructureRecoveryArchiveClosure } from './science-challenge-infrastructure-recovery-archive.mjs';

export const SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SCHEMA = 'science-challenge-effective-cohort/v1';
export const SCIENCE_CHALLENGE_EFFECTIVE_COHORT_DISPOSITION = 'review-pending-effective-cohort';
export const SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION =
	'review-pending-effective-cohort-successor';

const HASH = /^[a-f0-9]{64}$/u;
const EXPECTED_SHARD_COUNT = 51;
const EXPECTED_CHALLENGE_COUNT = 408;
const SHARD_DISPOSITIONS = new Set([
	'ordinary-repair-proposal',
	'descendant-remap',
	'difficulty-plan-adjustment',
	'unchanged-verified-fallback'
]);
const REVIEW_REBASE_VERIFICATION_FIELDS = [
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'reviewRebaseCandidateSetSha256',
	'reviewRebaseCollectionValidationSha256',
	'reviewRebaseCollectionRemediationSetSha256',
	'reviewRebaseCollectionRemediations',
	'reviewRebaseCollectionRemediationTargetIds',
	'reviewRebaseCollectionRemediationTargetSetSha256'
];
const REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_VERIFICATION_FIELDS = [
	'reviewRebaseInfrastructureRecoveryManifestSha256',
	'reviewRebaseInfrastructureRecoveryId'
];

export function scienceChallengeEffectiveCohortDirectory({ outputRoot, repairSha256 }) {
	requireHash(repairSha256, 'effective-cohort repair SHA-256');
	return path.join(
		path.resolve(outputRoot),
		`verification-repair-${repairSha256.slice(0, 12)}-effective-cohort`
	);
}

export function scienceChallengeEffectiveCohortManifestPath(options) {
	return path.join(scienceChallengeEffectiveCohortDirectory(options), 'manifest.json');
}

export function listScienceChallengeEffectiveCohortManifestPaths(outputRoot) {
	const root = path.resolve(outputRoot);
	if (!existsSync(root)) return [];
	return readdirSync(root, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isDirectory() &&
				/^verification-repair-[a-f0-9]{12}-effective-cohort$/u.test(entry.name)
		)
		.map((entry) => path.join(root, entry.name, 'manifest.json'))
		.filter((manifestPath) => existsSync(manifestPath))
		.sort();
}

/**
 * Find the only terminal manifest in an immutable predecessor/successor chain.
 * Multiple roots, forks, duplicate manifest identities and cycles all fail closed.
 */
export function discoverScienceChallengeEffectiveCohortManifest(outputRoot) {
	const manifestPaths = listScienceChallengeEffectiveCohortManifestPaths(outputRoot);
	if (manifestPaths.length === 0) return null;
	const records = manifestPaths.map((manifestPath) => {
		const manifest = readJson(manifestPath);
		return {
			manifestPath,
			manifest,
			manifestSha256: canonicalHash(manifest),
			predecessorSha256: manifest?.predecessor?.manifestCanonicalSha256 ?? null
		};
	});
	const byHash = new Map();
	for (const record of records) {
		if (byHash.has(record.manifestSha256)) {
			throw new Error('Generation contains duplicate competing effective-cohort manifests.');
		}
		byHash.set(record.manifestSha256, record);
	}
	const referenced = new Set();
	for (const record of records) {
		if (record.predecessorSha256 === null) continue;
		if (!HASH.test(String(record.predecessorSha256))) {
			throw new Error('Effective-cohort successor has an invalid predecessor hash.');
		}
		if (!byHash.has(record.predecessorSha256)) {
			throw new Error(
				'Effective-cohort successor predecessor is missing from the generation root.'
			);
		}
		if (referenced.has(record.predecessorSha256)) {
			throw new Error('Generation contains competing effective-cohort successor manifests.');
		}
		referenced.add(record.predecessorSha256);
	}
	const leaves = records.filter((record) => !referenced.has(record.manifestSha256));
	if (leaves.length !== 1) {
		throw new Error('Generation contains multiple competing effective-cohort manifests.');
	}
	const seen = new Set();
	let cursor = leaves[0];
	while (cursor) {
		if (seen.has(cursor.manifestSha256)) {
			throw new Error('Effective-cohort predecessor chain contains a cycle.');
		}
		seen.add(cursor.manifestSha256);
		cursor =
			cursor.predecessorSha256 === null ? null : (byHash.get(cursor.predecessorSha256) ?? null);
	}
	if (seen.size !== records.length) {
		throw new Error('Generation contains an unrelated competing effective-cohort manifest.');
	}
	return leaves[0].manifestPath;
}

/**
 * Atomically freeze the one exact cohort that fresh verification and every later consumer use.
 * Candidate roots are never replaced by this operation.
 */
export function stageScienceChallengeEffectiveCohort(options) {
	const prepared = prepareEffectiveCohort(options);
	const directory = scienceChallengeEffectiveCohortDirectory(options);
	const manifestPath = path.join(directory, 'manifest.json');
	if (existsSync(directory)) {
		const replay = readScienceChallengeEffectiveCohort({
			manifestPath,
			referenceRoot: options.outputRoot,
			basePlan: options.basePlan,
			effectivePlan: options.effectivePlan,
			expectedRepairSha256: options.repairSha256,
			expectedObjectiveId: options.objectiveId,
			expectedExecutionId: options.executionId,
			expectedFirstReviewSha256: options.firstReviewSha256,
			expectedSourceSnapshotSha256: options.sourceSnapshotSha256,
			expectedCurriculumEvidenceSha256: options.curriculumEvidenceSha256,
			expectedCurriculumCatalogSha256: options.curriculumCatalogSha256,
			validateCollectionCandidate: options.validateCollectionCandidate
		});
		if (replay.status !== 'passed') return replay;
		if (
			canonicalHash(replay.manifest) !== canonicalHash(prepared.manifest) ||
			replay.candidateSetSha256 !== prepared.candidateSetSha256 ||
			canonicalHash(replay.collectionValidation) !== canonicalHash(prepared.collectionValidation)
		) {
			return failed(
				'Existing effective-cohort directory differs from the freshly prepared exact cohort.'
			);
		}
		return replay;
	}
	const parent = path.dirname(directory);
	mkdirSync(parent, { recursive: true });
	const temporary = mkdtempSync(path.join(parent, `.${path.basename(directory)}.preparing-`));
	try {
		writeJson(path.join(temporary, 'base-plan.json'), prepared.basePlan);
		writeJson(path.join(temporary, 'effective-plan.json'), prepared.effectivePlan);
		writeJson(path.join(temporary, 'collection-validation.json'), prepared.collectionValidation);
		writeJson(path.join(temporary, 'manifest.json'), prepared.manifest);
		renameSync(temporary, directory);
	} catch (error) {
		if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
		throw error;
	}
	return readScienceChallengeEffectiveCohort({
		...options,
		manifestPath,
		referenceRoot: options.outputRoot
	});
}

/**
 * Freeze the next full cohort after a complete failed fresh review of an authenticated effective
 * cohort. The predecessor remains immutable; all terminal candidate/validation bytes are copied
 * into the successor so later consumers never fall back to canonical shard roots.
 */
export function stageScienceChallengeEffectiveCohortSuccessor({
	workspaceRoot,
	outputRoot,
	repairSha256,
	objectiveId,
	executionId,
	reviewSummary,
	reviewEffectiveCohortManifestSha256,
	predecessor = null,
	reviewRebaseEvidence = null,
	reviewRebaseInfrastructureRecoveryEvidence = null,
	verificationRepairAuthority = null,
	proposals,
	validateCollectionCandidate
}) {
	if (reviewRebaseEvidence !== null && predecessor === null) {
		return stageScienceChallengeReviewRebaseSuccessor({
			workspaceRoot,
			outputRoot,
			repairSha256,
			objectiveId,
			executionId,
			reviewSummary,
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence,
			verificationRepairAuthority,
			proposals,
			validateCollectionCandidate
		});
	}
	if (verificationRepairAuthority !== null) {
		throw new Error('Verification-repair authority is only valid for a review-rebase successor.');
	}
	if (predecessor?.status !== 'passed') {
		throw new Error('Effective-cohort successor requires a validated predecessor cohort.');
	}
	const hasReviewRebaseAncestry = isRecord(predecessor.manifest?.parentChain);
	if (hasReviewRebaseAncestry) {
		const ancestry = validateScienceChallengeReviewRebaseSuccessorLineage({
			effectiveCohort: predecessor,
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence
		});
		if (ancestry.status !== 'passed') {
			throw new Error(
				`Effective-cohort successor review-rebase ancestry is invalid:\n${ancestry.issues.join(
					'\n'
				)}`
			);
		}
	} else if (reviewRebaseEvidence !== null || reviewRebaseInfrastructureRecoveryEvidence !== null) {
		throw new Error('Review-rebase evidence is unassigned to this effective-cohort predecessor.');
	}
	for (const [value, label] of [
		[repairSha256, 'repairSha256'],
		[objectiveId, 'objectiveId'],
		[executionId, 'executionId'],
		[reviewEffectiveCohortManifestSha256, 'reviewEffectiveCohortManifestSha256']
	]) {
		requireHash(value, `effective-cohort successor ${label}`);
	}
	if (canonicalHash(reviewSummary) !== repairSha256) {
		throw new Error('Effective-cohort successor review hash differs from the supplied review.');
	}
	if (reviewEffectiveCohortManifestSha256 !== canonicalHash(predecessor.manifest)) {
		throw new Error('Effective-cohort successor review targets another predecessor manifest.');
	}
	if (typeof validateCollectionCandidate !== 'function') {
		throw new Error('Effective-cohort successor requires the ordinary collection validator.');
	}
	const root = requireRealDirectory(outputRoot, 'effective-cohort successor output root');
	const workspace = requireRealDirectory(
		workspaceRoot,
		'effective-cohort successor workspace root'
	);
	if (!isWithin(workspace, root)) {
		throw new Error('Effective-cohort successor output root must remain within the workspace.');
	}
	const discovered = discoverScienceChallengeEffectiveCohortManifest(root);
	if (!discovered || path.resolve(discovered) !== path.resolve(predecessor.manifestPath)) {
		throw new Error(
			'Effective-cohort successor requires the predecessor to be the single discoverable terminal cohort.'
		);
	}
	const predecessorManifestBytes = readFileSync(discovered);
	const predecessorManifestOnDisk = JSON.parse(predecessorManifestBytes.toString('utf8'));
	if (
		canonicalHash(predecessorManifestOnDisk) !== canonicalHash(predecessor.manifest) ||
		sha256(predecessorManifestBytes) !== predecessor.manifestFileSha256
	) {
		throw new Error(
			'Effective-cohort successor predecessor was tampered after its authenticated replay.'
		);
	}
	const directory = scienceChallengeEffectiveCohortDirectory({ outputRoot: root, repairSha256 });
	if (existsSync(directory)) {
		throw new Error('Effective-cohort successor output already exists and cannot be reused.');
	}
	const prepared = prepareEffectiveCohortSuccessor({
		root,
		directory,
		repairSha256,
		objectiveId,
		executionId,
		reviewSummary,
		reviewEffectiveCohortManifestSha256,
		predecessor,
		proposals,
		validateCollectionCandidate
	});
	const temporary = mkdtempSync(path.join(root, `.${path.basename(directory)}.preparing-`));
	try {
		writeJson(path.join(temporary, 'base-plan.json'), predecessor.basePlan);
		writeJson(path.join(temporary, 'effective-plan.json'), predecessor.effectivePlan);
		writeJson(path.join(temporary, 'review-summary.json'), reviewSummary);
		writeJson(path.join(temporary, 'collection-validation.json'), prepared.collectionValidation);
		for (const shard of prepared.shardValues) {
			writeJson(path.join(temporary, 'shards', shard.shardId, 'candidate.json'), shard.candidate);
			writeJson(path.join(temporary, 'shards', shard.shardId, 'validation.json'), shard.validation);
		}
		writeJson(path.join(temporary, 'manifest.json'), prepared.manifest);
		renameSync(temporary, directory);
	} catch (error) {
		if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
		throw error;
	}
	const replay = readScienceChallengeEffectiveCohort({
		manifestPath: path.join(directory, 'manifest.json'),
		referenceRoot: root,
		basePlan: predecessor.basePlan,
		effectivePlan: predecessor.effectivePlan,
		expectedRepairSha256: repairSha256,
		expectedObjectiveId: objectiveId,
		expectedExecutionId: executionId,
		expectedFirstReviewSha256: repairSha256,
		expectedSourceSnapshotSha256: predecessor.manifest.sourceSnapshotSha256,
		expectedCurriculumEvidenceSha256: predecessor.manifest.curriculumEvidenceSha256,
		expectedCurriculumCatalogSha256: predecessor.manifest.curriculumCatalogSha256,
		validateCollectionCandidate,
		reviewRebaseEvidence,
		reviewRebaseInfrastructureRecoveryEvidence
	});
	if (replay.status !== 'passed') {
		throw new Error(`Effective-cohort successor replay failed:\n${replay.issues.join('\n')}`);
	}
	return { ...replay, action: 'staged-effective-cohort-successor' };
}

function stageScienceChallengeReviewRebaseSuccessor({
	workspaceRoot,
	outputRoot,
	repairSha256,
	objectiveId,
	executionId,
	reviewSummary,
	reviewRebaseEvidence,
	reviewRebaseInfrastructureRecoveryEvidence,
	verificationRepairAuthority,
	proposals,
	validateCollectionCandidate
}) {
	for (const [value, label] of [
		[repairSha256, 'repairSha256'],
		[objectiveId, 'objectiveId'],
		[executionId, 'executionId']
	]) {
		requireHash(value, `review-rebase successor ${label}`);
	}
	if (canonicalHash(reviewSummary) !== repairSha256) {
		throw new Error('Review-rebase successor review hash differs from the supplied review.');
	}
	if (typeof validateCollectionCandidate !== 'function') {
		throw new Error('Review-rebase successor requires the ordinary collection validator.');
	}
	const root = requireRealDirectory(outputRoot, 'review-rebase successor output root');
	const workspace = requireRealDirectory(workspaceRoot, 'review-rebase successor workspace root');
	if (!isWithin(workspace, root)) {
		throw new Error('Review-rebase successor output root must remain within the workspace.');
	}
	const parent = requireScienceChallengeReviewRebaseEvidence(reviewRebaseEvidence);
	const infrastructureRecovery = requireScienceChallengeReviewRebaseInfrastructureRecoveryEvidence({
		evidence: reviewRebaseInfrastructureRecoveryEvidence,
		parent,
		proposals
	});
	if (infrastructureRecovery) {
		const recoveryAuthority = buildScienceChallengeVerificationRepairAuthority({
			verificationSummary: reviewSummary,
			reviewRebaseManifest: parent.manifest,
			suppliedAuthority: verificationRepairAuthority
		});
		validateInfrastructureRecoverySuccessorContext({
			infrastructureRecovery,
			reviewSummary,
			authority: recoveryAuthority,
			objectiveId,
			executionId
		});
		const recoveryEvidenceRoot = realpathSync(
			path.dirname(infrastructureRecovery.terminal.manifestPath)
		);
		if (isWithin(recoveryEvidenceRoot, root) || isWithin(root, recoveryEvidenceRoot)) {
			throw new Error(
				'Effective-cohort publication root must be a distinct non-nested sibling of the closed-world infrastructure-recovery evidence root.'
			);
		}
	}
	const directory = scienceChallengeEffectiveCohortDirectory({ outputRoot: root, repairSha256 });
	const prepared = prepareScienceChallengeReviewRebaseSuccessor({
		root,
		directory,
		repairSha256,
		objectiveId,
		executionId,
		reviewSummary,
		parent,
		infrastructureRecovery,
		verificationRepairAuthority,
		proposals,
		validateCollectionCandidate
	});
	const discovered = discoverScienceChallengeEffectiveCohortManifest(root);
	if (discovered !== null) {
		if (
			!infrastructureRecovery ||
			path.resolve(discovered) !== path.resolve(path.join(directory, 'manifest.json'))
		) {
			throw new Error('Review-rebase successor output root contains a competing effective cohort.');
		}
		const replay = readScienceChallengeEffectiveCohort({
			manifestPath: discovered,
			referenceRoot: root,
			basePlan: prepared.basePlan,
			effectivePlan: prepared.effectivePlan,
			expectedRepairSha256: repairSha256,
			expectedObjectiveId: objectiveId,
			expectedExecutionId: executionId,
			expectedFirstReviewSha256: repairSha256,
			expectedSourceSnapshotSha256: parent.coreManifest.sourceSnapshotSha256,
			expectedCurriculumEvidenceSha256: parent.coreManifest.curriculumEvidenceSha256,
			expectedCurriculumCatalogSha256: parent.effectivePlan.curriculumCatalogSha256,
			validateCollectionCandidate,
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence
		});
		if (
			replay.status !== 'passed' ||
			canonicalHash(replay.manifest) !== canonicalHash(prepared.manifest)
		) {
			throw new Error(
				`Existing recovery-bound review-rebase successor differs from exact replay:\n${(
					replay.issues ?? []
				).join('\n')}`
			);
		}
		return { ...replay, action: 'reused-review-rebase-successor' };
	}
	if (existsSync(directory)) {
		throw new Error(
			'Review-rebase successor output exists without its exact discoverable terminal manifest.'
		);
	}
	const temporary = mkdtempSync(path.join(root, `.${path.basename(directory)}.preparing-`));
	try {
		writeJson(path.join(temporary, 'base-plan.json'), prepared.basePlan);
		writeJson(path.join(temporary, 'effective-plan.json'), prepared.effectivePlan);
		writeJson(path.join(temporary, 'review-summary.json'), reviewSummary);
		writeJson(
			path.join(temporary, 'verification-repair-authority.json'),
			prepared.verificationRepairAuthority
		);
		writeJson(path.join(temporary, 'collection-validation.json'), prepared.collectionValidation);
		for (const shard of prepared.shardValues) {
			writeJson(path.join(temporary, 'shards', shard.shardId, 'candidate.json'), shard.candidate);
			writeJson(path.join(temporary, 'shards', shard.shardId, 'validation.json'), shard.validation);
		}
		writeJson(path.join(temporary, 'manifest.json'), prepared.manifest);
		renameSync(temporary, directory);
	} catch (error) {
		if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
		throw error;
	}
	const replay = readScienceChallengeEffectiveCohort({
		manifestPath: path.join(directory, 'manifest.json'),
		referenceRoot: root,
		basePlan: prepared.basePlan,
		effectivePlan: prepared.effectivePlan,
		expectedRepairSha256: repairSha256,
		expectedObjectiveId: objectiveId,
		expectedExecutionId: executionId,
		expectedFirstReviewSha256: repairSha256,
		expectedSourceSnapshotSha256: parent.coreManifest.sourceSnapshotSha256,
		expectedCurriculumEvidenceSha256: parent.coreManifest.curriculumEvidenceSha256,
		expectedCurriculumCatalogSha256: parent.effectivePlan.curriculumCatalogSha256,
		validateCollectionCandidate,
		reviewRebaseEvidence,
		reviewRebaseInfrastructureRecoveryEvidence
	});
	if (replay.status !== 'passed') {
		throw new Error(`Review-rebase successor replay failed:\n${replay.issues.join('\n')}`);
	}
	return { ...replay, action: 'staged-review-rebase-successor' };
}

export function inspectScienceChallengeEffectiveCohort(options) {
	const prepared = prepareEffectiveCohort(options);
	return {
		status: 'passed',
		issues: [],
		action: 'stage-review-pending-effective-cohort',
		manifestPath: scienceChallengeEffectiveCohortManifestPath(options),
		...prepared
	};
}

/**
 * Replay a source or archived manifest. referenceRoot is the root against which every manifest
 * path resolves, allowing the exact manifest to survive after its original generation tree is gone.
 */
export function readScienceChallengeEffectiveCohort({
	manifestPath,
	referenceRoot,
	basePlan = null,
	effectivePlan = null,
	expectedRepairSha256,
	expectedObjectiveId,
	expectedExecutionId,
	expectedFirstReviewSha256,
	expectedSourceSnapshotSha256,
	expectedCurriculumEvidenceSha256,
	expectedCurriculumCatalogSha256,
	validateCollectionCandidate = null,
	reviewRebaseEvidence = null,
	reviewRebaseInfrastructureRecoveryEvidence = null,
	reviewRebaseInfrastructureRecoveryArchiveClosure = null,
	_ancestorManifestHashes = new Set()
}) {
	const issues = [];
	try {
		const root = requireRealDirectory(referenceRoot, 'effective-cohort reference root');
		const manifestFile = requireContainedFile(root, manifestPath, 'effective-cohort manifest');
		const manifest = readJson(manifestFile);
		const manifestSha256 = canonicalHash(manifest);
		if (_ancestorManifestHashes.has(manifestSha256)) {
			return failed('Effective-cohort predecessor chain contains a cycle.');
		}
		const ancestorManifestHashes = new Set(_ancestorManifestHashes);
		ancestorManifestHashes.add(manifestSha256);
		const basePlanValue =
			basePlan ?? readBoundJsonReference(root, manifest?.plans?.base, 'effective-cohort base plan');
		const effectivePlanValue =
			effectivePlan ??
			readBoundJsonReference(root, manifest?.plans?.effective, 'effective-cohort effective plan');
		const replay =
			manifest?.disposition === SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION
				? validateScienceChallengeEffectiveCohortSuccessorManifest({
						manifest,
						referenceRoot: root,
						basePlan: basePlanValue,
						effectivePlan: effectivePlanValue,
						expectedRepairSha256,
						expectedObjectiveId,
						expectedExecutionId,
						expectedFirstReviewSha256,
						expectedSourceSnapshotSha256,
						expectedCurriculumEvidenceSha256,
						expectedCurriculumCatalogSha256,
						validateCollectionCandidate,
						reviewRebaseEvidence,
						reviewRebaseInfrastructureRecoveryEvidence,
						reviewRebaseInfrastructureRecoveryArchiveClosure,
						ancestorManifestHashes
					})
				: validateScienceChallengeEffectiveCohortManifest({
						manifest,
						referenceRoot: root,
						basePlan: basePlanValue,
						effectivePlan: effectivePlanValue,
						expectedRepairSha256,
						expectedObjectiveId,
						expectedExecutionId,
						expectedFirstReviewSha256,
						expectedSourceSnapshotSha256,
						expectedCurriculumEvidenceSha256,
						expectedCurriculumCatalogSha256,
						validateCollectionCandidate
					});
		if (replay.status !== 'passed') return replay;
		return {
			...replay,
			action: 'reused-effective-cohort',
			manifestPath: manifestFile,
			manifestFileSha256: sha256(readFileSync(manifestFile))
		};
	} catch (error) {
		issues.push(errorMessage(error));
		return failed(issues);
	}
}

export function validateScienceChallengeEffectiveCohortManifest({
	manifest,
	referenceRoot,
	basePlan,
	effectivePlan,
	expectedRepairSha256,
	expectedObjectiveId,
	expectedExecutionId,
	expectedFirstReviewSha256,
	expectedSourceSnapshotSha256,
	expectedCurriculumEvidenceSha256,
	expectedCurriculumCatalogSha256,
	validateCollectionCandidate = null
}) {
	const issues = [];
	if (!isRecord(manifest)) return failed('Effective-cohort manifest must be an object.');
	const { manifestCoreSha256, ...manifestCore } = manifest;
	if (
		manifest.schemaVersion !== SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SCHEMA ||
		manifest.disposition !== SCIENCE_CHALLENGE_EFFECTIVE_COHORT_DISPOSITION ||
		!HASH.test(String(manifestCoreSha256 ?? '')) ||
		manifestCoreSha256 !== canonicalHash(manifestCore)
	) {
		issues.push('Effective-cohort manifest schema, disposition or self-binding is invalid.');
	}
	if (
		manifest.parentChain !== undefined ||
		manifest.infrastructureRecovery !== undefined ||
		manifest.requiresFreshFullVerification !== undefined ||
		manifest.releaseEligible !== undefined
	) {
		issues.push(
			'Base effective cohort cannot carry disconnected review-rebase or infrastructure-recovery ancestry.'
		);
	}
	if (!isRecord(basePlan) || !Array.isArray(basePlan.rows)) {
		issues.push('Effective-cohort base plan is invalid.');
	}
	if (!isRecord(effectivePlan) || !Array.isArray(effectivePlan.rows)) {
		issues.push('Effective-cohort effective plan is invalid.');
	}
	if (issues.length) return failed(issues);
	const basePlanSha256 = canonicalHash(basePlan);
	const effectivePlanSha256 = canonicalHash(effectivePlan);
	for (const [field, expected] of [
		['repairSha256', expectedRepairSha256],
		['objectiveId', expectedObjectiveId],
		['executionId', expectedExecutionId],
		['firstReviewSha256', expectedFirstReviewSha256],
		['sourceSnapshotSha256', expectedSourceSnapshotSha256],
		['curriculumEvidenceSha256', expectedCurriculumEvidenceSha256],
		['curriculumCatalogSha256', expectedCurriculumCatalogSha256]
	]) {
		if (!HASH.test(String(manifest[field] ?? ''))) {
			issues.push(`Effective-cohort ${field} must be a lowercase SHA-256.`);
		}
		if (expected !== undefined && manifest[field] !== expected) {
			issues.push(`Effective-cohort ${field} differs from expected evidence.`);
		}
	}
	if (
		manifest.planId !== effectivePlan.planId ||
		manifest.planId !== basePlan.planId ||
		manifest.basePlanSha256 !== basePlanSha256 ||
		manifest.effectivePlanSha256 !== effectivePlanSha256
	) {
		issues.push('Effective-cohort plan identity is stale.');
	}
	if (!isRecord(manifest.plans)) {
		issues.push('Effective-cohort plan references are missing.');
	} else {
		validateJsonReference(
			referenceRoot,
			manifest.plans.base,
			basePlanSha256,
			'effective-cohort base plan',
			issues
		);
		validateJsonReference(
			referenceRoot,
			manifest.plans.effective,
			effectivePlanSha256,
			'effective-cohort effective plan',
			issues
		);
	}
	const orderedShardIds = uniqueInOrder(effectivePlan.rows.map((row) => row?.shard));
	if (
		orderedShardIds.length !== EXPECTED_SHARD_COUNT ||
		effectivePlan.rows.length !== EXPECTED_CHALLENGE_COUNT
	) {
		issues.push(
			`Effective-cohort plan must contain exactly ${EXPECTED_SHARD_COUNT} shards and ${EXPECTED_CHALLENGE_COUNT} challenges.`
		);
	}
	if (
		!Array.isArray(manifest.shards) ||
		manifest.shards.length !== orderedShardIds.length ||
		manifest.shardCount !== orderedShardIds.length
	) {
		issues.push('Effective-cohort shard membership is incomplete.');
		return failed(issues);
	}
	const candidateById = new Map();
	const candidateBatches = new Map();
	const remapManifests = [];
	const difficultyAdjustmentManifests = [];
	const recoveryProjectionInputs = [];
	const seenShards = new Set();
	for (const [shardIndex, shard] of manifest.shards.entries()) {
		const expectedShardId = orderedShardIds[shardIndex];
		const expectedRows = effectivePlan.rows
			.map((row, planRowIndex) => ({ row, planRowIndex }))
			.filter(({ row }) => row.shard === expectedShardId);
		const expectedIds = expectedRows.map(({ row }) => row.id);
		const expectedIndexes = expectedRows.map(({ planRowIndex }) => planRowIndex);
		if (
			!isRecord(shard) ||
			shard.shardId !== expectedShardId ||
			seenShards.has(shard.shardId) ||
			!SHARD_DISPOSITIONS.has(shard.disposition) ||
			canonicalHash(shard.challengeIds) !== canonicalHash(expectedIds) ||
			canonicalHash(shard.planRowIndexes) !== canonicalHash(expectedIndexes)
		) {
			issues.push(`Effective-cohort shard ${shardIndex + 1} identity or order is invalid.`);
			continue;
		}
		seenShards.add(shard.shardId);
		let candidate;
		let validation;
		try {
			candidate = readBoundJsonReference(
				referenceRoot,
				shard.candidate,
				`${shard.shardId} candidate`
			);
			validation = readBoundJsonReference(
				referenceRoot,
				shard.validation,
				`${shard.shardId} validation`
			);
		} catch (error) {
			issues.push(errorMessage(error));
			continue;
		}
		const candidateIds = candidate?.challenges?.map((entry) => entry?.definition?.id);
		if (
			!Array.isArray(candidate?.challenges) ||
			canonicalHash(candidateIds) !== canonicalHash(expectedIds) ||
			validation?.candidateSha256 !== canonicalHash(candidate)
		) {
			issues.push(`${shard.shardId} candidate, validation or planned membership is stale.`);
			continue;
		}
		const expectedValidationStatus = isReviewPendingDisposition(shard.disposition)
			? 'review-pending'
			: 'passed';
		if (validation.status !== expectedValidationStatus) {
			issues.push(`${shard.shardId} validation status must be ${expectedValidationStatus}.`);
		}
		validateShardLineage({
			shard,
			referenceRoot,
			basePlan,
			effectivePlan,
			candidate,
			validation,
			repairSha256: manifest.repairSha256,
			firstReviewSha256: manifest.firstReviewSha256,
			objectiveId: manifest.objectiveId,
			executionId: manifest.executionId,
			remapManifests,
			difficultyAdjustmentManifests,
			recoveryProjectionInputs,
			issues
		});
		candidateBatches.set(shard.shardId, candidate);
		for (const entry of candidate.challenges) {
			const id = entry?.definition?.id;
			if (!id || candidateById.has(id)) {
				issues.push(`${shard.shardId} candidate contains a missing or duplicate id.`);
			} else {
				candidateById.set(id, entry);
			}
		}
	}
	const orderedChallengeIds = effectivePlan.rows.map((row) => row.id);
	const candidateSet = orderedChallengeIds.map((id) => candidateById.get(id));
	if (
		candidateSet.some((entry) => !entry) ||
		manifest.challengeCount !== orderedChallengeIds.length ||
		canonicalHash(manifest.orderedChallengeIds) !== canonicalHash(orderedChallengeIds) ||
		manifest.orderedChallengeIdsSha256 !== canonicalHash(orderedChallengeIds) ||
		manifest.candidateCount !== candidateSet.length ||
		manifest.candidateSetSha256 !== canonicalHash(candidateSet)
	) {
		issues.push('Effective-cohort ordered challenge or candidate-set binding is invalid.');
	}
	if (
		manifest.remapManifestSetSha256 !== canonicalHash(remapManifests) ||
		manifest.remapCount !== remapManifests.length
	) {
		issues.push('Effective-cohort remap manifest set is invalid.');
	}
	const difficultyAdjustmentCount = difficultyAdjustmentManifests.reduce(
		(total, adjustmentManifest) =>
			total +
			(adjustmentManifest.schemaVersion === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA
				? adjustmentManifest.adjustmentCount
				: 1),
		0
	);
	if (
		manifest.difficultyAdjustmentManifestSetSha256 !==
			canonicalHash(difficultyAdjustmentManifests) ||
		manifest.difficultyAdjustmentManifestCount !== difficultyAdjustmentManifests.length ||
		manifest.difficultyAdjustmentCount !== difficultyAdjustmentCount
	) {
		issues.push('Effective-cohort difficulty-adjustment manifest set is invalid.');
	}
	if (recoveryProjectionInputs.length > 0) {
		const projection = projectScienceChallengeEffectiveRecoveryPlan(
			basePlan,
			recoveryProjectionInputs
		);
		if (
			projection.status !== 'passed' ||
			projection.effectivePlanSha256 !== effectivePlanSha256 ||
			canonicalHash(projection.effectivePlan) !== effectivePlanSha256 ||
			manifest.recoverySetSha256 !== canonicalHash(recoveryProjectionInputs) ||
			manifest.recoveryProjectionSha256 !== canonicalHash(projection.applied) ||
			manifest.recoveryCount !== projection.recoveryCount ||
			manifest.recoveryTargetSetSha256 !== canonicalHash(projection.applied.map(recoveryTargetCore))
		) {
			issues.push(
				'Effective-cohort plan is not the exact combined typed recovery projection.',
				...(projection.issues ?? [])
			);
		}
	} else {
		issues.push('Effective-cohort changed plan has no typed recovery lineage.');
	}
	let collectionValidation = null;
	try {
		collectionValidation = readBoundJsonReference(
			referenceRoot,
			manifest.collectionValidation,
			'effective-cohort collection validation'
		);
	} catch (error) {
		issues.push(errorMessage(error));
	}
	if (
		collectionValidation &&
		(collectionValidation.status !== 'passed' ||
			!Array.isArray(collectionValidation.issues) ||
			collectionValidation.issues.length !== 0 ||
			collectionValidation.candidateCount !== candidateSet.length ||
			collectionValidation.candidateSetSha256 !== canonicalHash(candidateSet) ||
			collectionValidation.effectivePlanSha256 !== effectivePlanSha256)
	) {
		issues.push('Effective-cohort collection validation is stale or failed.');
	}
	if (
		collectionValidation &&
		manifest.collectionValidationSha256 !== canonicalHash(collectionValidation)
	) {
		issues.push('Effective-cohort collection validation hash differs.');
	}
	const recoveryManifests = [...remapManifests, ...difficultyAdjustmentManifests];
	if (
		collectionValidation &&
		recoveryManifests.length === 1 &&
		recoveryManifests[0].collectionValidationPolicy !== 'deferred-to-final-effective-cohort' &&
		recoveryManifests[0].collectionValidationSha256 !== canonicalHash(collectionValidation)
	) {
		issues.push(
			'Effective-cohort single recovery does not bind the exact frozen collection report.'
		);
	}
	if (typeof validateCollectionCandidate === 'function' && candidateSet.every(Boolean)) {
		const replay = validateCollectionCandidate({
			candidateSet: structuredClone(candidateSet),
			candidateBatches: new Map(
				[...candidateBatches].map(([shardId, batch]) => [shardId, structuredClone(batch)])
			),
			effectivePlan: structuredClone(effectivePlan)
		});
		if (
			replay?.status !== 'passed' ||
			(replay.issues?.length ?? 0) !== 0 ||
			replay.candidateCount !== candidateSet.length ||
			replay.candidateSetSha256 !== canonicalHash(candidateSet) ||
			replay.effectivePlanSha256 !== effectivePlanSha256 ||
			canonicalHash(replay) !== canonicalHash(collectionValidation)
		) {
			issues.push('Effective-cohort current collection replay differs from the frozen report.');
		}
	}
	return issues.length
		? failed(issues)
		: {
				status: 'passed',
				issues: [],
				manifest,
				basePlan,
				effectivePlan,
				candidateSet,
				candidateBatches,
				collectionValidation,
				remapManifests,
				difficultyAdjustmentManifests,
				recoveries: recoveryProjectionInputs,
				candidateSetSha256: canonicalHash(candidateSet)
			};
}

function validateScienceChallengeEffectiveCohortSuccessorManifest({
	manifest,
	referenceRoot,
	basePlan,
	effectivePlan,
	expectedRepairSha256,
	expectedObjectiveId,
	expectedExecutionId,
	expectedFirstReviewSha256,
	expectedSourceSnapshotSha256,
	expectedCurriculumEvidenceSha256,
	expectedCurriculumCatalogSha256,
	validateCollectionCandidate,
	reviewRebaseEvidence,
	reviewRebaseInfrastructureRecoveryEvidence,
	reviewRebaseInfrastructureRecoveryArchiveClosure,
	ancestorManifestHashes
}) {
	if (manifest?.parent?.kind === 'review-rebase') {
		return validateScienceChallengeReviewRebaseSuccessorManifest({
			manifest,
			referenceRoot,
			basePlan,
			effectivePlan,
			expectedRepairSha256,
			expectedObjectiveId,
			expectedExecutionId,
			expectedFirstReviewSha256,
			expectedSourceSnapshotSha256,
			expectedCurriculumEvidenceSha256,
			expectedCurriculumCatalogSha256,
			validateCollectionCandidate,
			reviewRebaseEvidence,
			reviewRebaseInfrastructureRecoveryEvidence,
			reviewRebaseInfrastructureRecoveryArchiveClosure
		});
	}
	if (
		!isRecord(manifest?.parentChain) &&
		(reviewRebaseEvidence !== null ||
			reviewRebaseInfrastructureRecoveryEvidence !== null ||
			reviewRebaseInfrastructureRecoveryArchiveClosure !== null)
	) {
		return failed(
			'Review-rebase evidence was supplied for an effective-cohort successor with another parent kind.'
		);
	}
	const issues = [];
	const { manifestCoreSha256, ...manifestCore } = isRecord(manifest) ? manifest : {};
	if (
		manifest?.schemaVersion !== SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SCHEMA ||
		manifest?.disposition !== SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION ||
		!HASH.test(String(manifestCoreSha256 ?? '')) ||
		manifestCoreSha256 !== canonicalHash(manifestCore)
	) {
		return failed('Effective-cohort successor schema, disposition or self-binding is invalid.');
	}
	for (const [field, expected] of [
		['repairSha256', expectedRepairSha256],
		['objectiveId', expectedObjectiveId],
		['executionId', expectedExecutionId],
		['firstReviewSha256', expectedFirstReviewSha256],
		['sourceSnapshotSha256', expectedSourceSnapshotSha256],
		['curriculumEvidenceSha256', expectedCurriculumEvidenceSha256],
		['curriculumCatalogSha256', expectedCurriculumCatalogSha256]
	]) {
		if (!HASH.test(String(manifest[field] ?? ''))) {
			issues.push(`Effective-cohort successor ${field} must be a lowercase SHA-256.`);
		}
		if (expected !== undefined && manifest[field] !== expected) {
			issues.push(`Effective-cohort successor ${field} differs from expected evidence.`);
		}
	}
	if (
		!isRecord(basePlan) ||
		!Array.isArray(basePlan.rows) ||
		!isRecord(effectivePlan) ||
		!Array.isArray(effectivePlan.rows) ||
		manifest.planId !== effectivePlan.planId ||
		manifest.planId !== basePlan.planId ||
		manifest.basePlanSha256 !== canonicalHash(basePlan) ||
		manifest.effectivePlanSha256 !== canonicalHash(effectivePlan)
	) {
		issues.push('Effective-cohort successor plan identity is stale.');
	}
	if (!isRecord(manifest.plans)) {
		issues.push('Effective-cohort successor plan references are missing.');
	} else {
		validateJsonReference(
			referenceRoot,
			manifest.plans.base,
			canonicalHash(basePlan),
			'effective-cohort successor base plan',
			issues
		);
		validateJsonReference(
			referenceRoot,
			manifest.plans.effective,
			canonicalHash(effectivePlan),
			'effective-cohort successor effective plan',
			issues
		);
	}
	if (issues.length) return failed(issues);
	let predecessor;
	try {
		const predecessorManifest = readBoundJsonReference(
			referenceRoot,
			manifest.predecessor?.manifest,
			'effective-cohort predecessor manifest'
		);
		if (manifest.predecessor?.manifestCanonicalSha256 !== canonicalHash(predecessorManifest)) {
			issues.push('Effective-cohort successor predecessor hash differs.');
		} else {
			predecessor = readScienceChallengeEffectiveCohort({
				manifestPath: path.resolve(referenceRoot, manifest.predecessor.manifest.path),
				referenceRoot,
				basePlan,
				effectivePlan,
				expectedSourceSnapshotSha256: manifest.sourceSnapshotSha256,
				expectedCurriculumEvidenceSha256: manifest.curriculumEvidenceSha256,
				expectedCurriculumCatalogSha256: manifest.curriculumCatalogSha256,
				validateCollectionCandidate,
				reviewRebaseEvidence,
				reviewRebaseInfrastructureRecoveryEvidence,
				reviewRebaseInfrastructureRecoveryArchiveClosure,
				_ancestorManifestHashes: ancestorManifestHashes
			});
			if (predecessor.status !== 'passed') {
				issues.push(
					'Effective-cohort successor predecessor replay failed.',
					...(predecessor.issues ?? [])
				);
			}
		}
	} catch (error) {
		issues.push(errorMessage(error));
	}
	if (!predecessor || predecessor.status !== 'passed') return failed(issues);
	const hasReviewRebaseAncestry = isRecord(predecessor.manifest.parentChain);
	const hasInfrastructureRecovery = isRecord(predecessor.manifest.infrastructureRecovery);
	if (
		hasReviewRebaseAncestry
			? canonicalHash(manifest.parentChain) !== canonicalHash(predecessor.manifest.parentChain) ||
				manifest.requiresFreshFullVerification !== true ||
				manifest.releaseEligible !== false ||
				(hasInfrastructureRecovery
					? canonicalHash(manifest.infrastructureRecovery) !==
						canonicalHash(predecessor.manifest.infrastructureRecovery)
					: manifest.infrastructureRecovery !== undefined)
			: manifest.parentChain !== undefined ||
				manifest.requiresFreshFullVerification !== undefined ||
				manifest.releaseEligible !== undefined ||
				manifest.infrastructureRecovery !== undefined
	) {
		issues.push(
			'Effective-cohort successor changed or introduced inherited review-rebase ancestry.'
		);
	}
	if (
		manifest.predecessor.candidateSetSha256 !== predecessor.candidateSetSha256 ||
		manifest.review?.effectiveCohortManifestSha256 !== canonicalHash(predecessor.manifest) ||
		manifest.review?.candidateSetSha256 !== predecessor.candidateSetSha256 ||
		manifest.remapCount !== predecessor.manifest.remapCount ||
		manifest.remapManifestSetSha256 !== predecessor.manifest.remapManifestSetSha256 ||
		manifest.difficultyAdjustmentCount !== predecessor.manifest.difficultyAdjustmentCount ||
		manifest.difficultyAdjustmentManifestCount !==
			predecessor.manifest.difficultyAdjustmentManifestCount ||
		manifest.difficultyAdjustmentManifestSetSha256 !==
			predecessor.manifest.difficultyAdjustmentManifestSetSha256 ||
		manifest.recoveryCount !== predecessor.manifest.recoveryCount ||
		manifest.recoverySetSha256 !== predecessor.manifest.recoverySetSha256 ||
		manifest.recoveryTargetSetSha256 !== predecessor.manifest.recoveryTargetSetSha256 ||
		manifest.recoveryProjectionSha256 !== predecessor.manifest.recoveryProjectionSha256
	) {
		issues.push('Effective-cohort successor changed immutable predecessor plan-recovery lineage.');
	}
	let reviewSummary;
	try {
		reviewSummary = readBoundJsonReference(
			referenceRoot,
			manifest.review?.summary,
			'effective-cohort successor review summary'
		);
	} catch (error) {
		issues.push(errorMessage(error));
	}
	const expectedIds = effectivePlan.rows.map((row) => row.id);
	const expectedShardIds = uniqueInOrder(effectivePlan.rows.map((row) => row.shard));
	const reviews = Array.isArray(reviewSummary?.reviews) ? reviewSummary.reviews : [];
	const reviewsById = new Map(reviews.map((review) => [review?.id, review]));
	const rejectedIds = expectedIds.filter((id) => reviewsById.get(id)?.accepted === false);
	const invalidReviewRows = reviews.flatMap((review) =>
		validateIndependentContentReviewRow(review).issues.map(
			(issue) => `${review?.id ?? 'unknown review'}: ${issue}`
		)
	);
	if (
		!reviewSummary ||
		reviewSummary.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		canonicalHash(reviewSummary) !== manifest.repairSha256 ||
		manifest.review?.summarySha256 !== manifest.repairSha256 ||
		reviewSummary.status !== 'failed' ||
		reviewSummary.planId !== effectivePlan.planId ||
		reviewSummary.planSha256 !== canonicalHash(effectivePlan) ||
		reviewSummary.basePlanSha256 !== canonicalHash(basePlan) ||
		reviewSummary.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		reviewSummary.sourceSnapshotSha256 !== manifest.sourceSnapshotSha256 ||
		reviewSummary.curriculumEvidenceSha256 !== manifest.curriculumEvidenceSha256 ||
		reviewSummary.candidateSetSha256 !== predecessor.candidateSetSha256 ||
		(hasReviewRebaseAncestry &&
			reviewSummary.effectiveCohortManifestSha256 !== canonicalHash(predecessor.manifest)) ||
		(hasReviewRebaseAncestry &&
			REVIEW_REBASE_VERIFICATION_FIELDS.some((field) => reviewSummary[field] !== undefined)) ||
		(hasInfrastructureRecovery
			? reviewSummary.reviewRebaseInfrastructureRecoveryManifestSha256 !==
					predecessor.manifest.infrastructureRecovery.manifestSha256 ||
				reviewSummary.reviewRebaseInfrastructureRecoveryId !==
					predecessor.manifest.infrastructureRecovery.recoveryId
			: REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_VERIFICATION_FIELDS.some(
					(field) => reviewSummary[field] !== undefined
				)) ||
		(reviewSummary.recoverySetSha256 ?? null) !==
			(predecessor.manifest.recoverySetSha256 ?? null) ||
		reviews.length !== expectedIds.length ||
		reviewsById.size !== expectedIds.length ||
		expectedIds.some((id) => !reviewsById.has(id)) ||
		invalidReviewRows.length !== 0 ||
		reviewSummary.assignmentCount !== expectedShardIds.length ||
		!Array.isArray(reviewSummary.assignmentResults) ||
		reviewSummary.assignmentResults.length !== expectedShardIds.length ||
		reviewSummary.assignmentResults.some((result) => result?.status !== 'passed') ||
		reviewSummary.reviewCount !== expectedIds.length ||
		reviewSummary.acceptedCount !== expectedIds.length - rejectedIds.length ||
		reviewSummary.rejectedCount !== rejectedIds.length ||
		!Array.isArray(reviewSummary.issues) ||
		reviewSummary.issues.length !== 0 ||
		rejectedIds.length === 0 ||
		canonicalHash(manifest.review?.rejectedIds) !== canonicalHash(rejectedIds) ||
		manifest.review?.rejectedIdsSha256 !== canonicalHash(rejectedIds)
	) {
		issues.push('Effective-cohort successor review binding is stale or incomplete.');
	}
	if (
		!Array.isArray(manifest.shards) ||
		manifest.shards.length !== expectedShardIds.length ||
		manifest.shardCount !== expectedShardIds.length
	) {
		return failed([...issues, 'Effective-cohort successor shard membership is incomplete.']);
	}
	const parentBudget = scienceChallengeEffectiveCohortAttemptBudgetByShard(predecessor);
	const budgetRows = manifest.attemptBudget?.shards;
	const budgetByShard = new Map((budgetRows ?? []).map((row) => [row?.shardId, row]));
	if (
		manifest.attemptBudget?.maxAttempts !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
		manifest.attemptBudget?.objectiveId !== manifest.objectiveId ||
		manifest.attemptBudget?.predecessorObjectiveId !== predecessor.manifest.objectiveId ||
		!Array.isArray(budgetRows) ||
		budgetRows.length !== expectedShardIds.length ||
		budgetByShard.size !== expectedShardIds.length ||
		manifest.attemptBudget?.shardsSha256 !== canonicalHash(budgetRows)
	) {
		issues.push('Effective-cohort successor attempt budget is incomplete.');
	}
	const parentShardById = new Map(
		predecessor.manifest.shards.map((shard) => [shard.shardId, shard])
	);
	const candidateById = new Map();
	const candidateBatches = new Map();
	for (const [index, shard] of manifest.shards.entries()) {
		const shardId = expectedShardIds[index];
		const rows = effectivePlan.rows.filter((row) => row.shard === shardId);
		const expectedRowIndexes = effectivePlan.rows
			.map((row, rowIndex) => ({ row, rowIndex }))
			.filter(({ row }) => row.shard === shardId)
			.map(({ rowIndex }) => rowIndex);
		if (
			shard?.shardId !== shardId ||
			!['successor-repair-proposal', 'successor-unchanged'].includes(shard?.disposition) ||
			canonicalHash(shard?.challengeIds) !== canonicalHash(rows.map((row) => row.id)) ||
			canonicalHash(shard?.planRowIndexes) !== canonicalHash(expectedRowIndexes)
		) {
			issues.push(`Effective-cohort successor shard ${index + 1} identity is invalid.`);
			continue;
		}
		let candidate;
		let validation;
		try {
			candidate = readBoundJsonReference(
				referenceRoot,
				shard.candidate,
				`${shardId} successor candidate`
			);
			validation = readBoundJsonReference(
				referenceRoot,
				shard.validation,
				`${shardId} successor validation`
			);
		} catch (error) {
			issues.push(errorMessage(error));
			continue;
		}
		if (
			canonicalHash(candidate?.challenges?.map((entry) => entry?.definition?.id)) !==
				canonicalHash(rows.map((row) => row.id)) ||
			validation?.candidateSha256 !== canonicalHash(candidate)
		) {
			issues.push(`${shardId} successor candidate or validation is stale.`);
			continue;
		}
		const parentCandidate = predecessor.candidateBatches.get(shardId);
		const parentShard = parentShardById.get(shardId);
		const budget = budgetByShard.get(shardId);
		const previousAttempts = parentBudget.get(shardId);
		if (
			!budget ||
			budget.predecessorObjectiveAttempts !== previousAttempts ||
			!Number.isInteger(budget.currentObjectiveAttempts) ||
			budget.currentObjectiveAttempts < 0 ||
			budget.currentObjectiveAttempts > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
		) {
			issues.push(`${shardId} successor attempt budget is stale or exceeds its objective ceiling.`);
		}
		if (shard.lineage?.predecessorShardSha256 !== canonicalHash(parentShard)) {
			issues.push(`${shardId} successor lineage targets another predecessor shard.`);
		}
		const hasRejectedRow = rows.some((row) => reviewsById.get(row.id)?.accepted === false);
		if (shard.disposition === 'successor-repair-proposal') {
			const targeted = validateVerificationRepairCandidate({
				candidate,
				priorCandidate: parentCandidate,
				rows,
				reviews: reviewsById
			});
			if (
				!hasRejectedRow ||
				targeted.status !== 'passed' ||
				validation.status !== 'passed' ||
				budget?.currentObjectiveAttempts !== shard.lineage?.attempt ||
				!Number.isInteger(shard.lineage?.attempt) ||
				shard.lineage?.candidateSha256 !== canonicalHash(candidate) ||
				shard.lineage?.validationSha256 !== canonicalHash(validation) ||
				shard.lineage?.rejectedIdsSha256 !== canonicalHash(shard.lineage?.rejectedIds)
			) {
				issues.push(`${shardId} successor repair proposal is invalid.`, ...(targeted.issues ?? []));
			}
		} else if (
			hasRejectedRow ||
			budget?.currentObjectiveAttempts !== 0 ||
			canonicalHash(candidate) !== canonicalHash(parentCandidate) ||
			shard.lineage?.predecessorCandidateSha256 !== canonicalHash(parentCandidate) ||
			shard.lineage?.predecessorValidationSha256 !== canonicalHash(validation)
		) {
			issues.push(`${shardId} successor unchanged shard differs from its predecessor.`);
		}
		candidateBatches.set(shardId, candidate);
		for (const entry of candidate.challenges ?? []) {
			const id = entry?.definition?.id;
			if (!id || candidateById.has(id)) issues.push(`${shardId} has a duplicate candidate id.`);
			else candidateById.set(id, entry);
		}
	}
	const candidateSet = expectedIds.map((id) => candidateById.get(id));
	validateSuccessorRecoveryTargets({
		predecessor,
		candidateBatches,
		issues
	});
	if (
		candidateSet.some((entry) => !entry) ||
		manifest.challengeCount !== expectedIds.length ||
		manifest.candidateCount !== expectedIds.length ||
		manifest.orderedChallengeIdsSha256 !== canonicalHash(expectedIds) ||
		canonicalHash(manifest.orderedChallengeIds) !== canonicalHash(expectedIds) ||
		manifest.candidateSetSha256 !== canonicalHash(candidateSet)
	) {
		issues.push('Effective-cohort successor candidate-set binding is invalid.');
	}
	let collectionValidation;
	try {
		collectionValidation = readBoundJsonReference(
			referenceRoot,
			manifest.collectionValidation,
			'effective-cohort successor collection validation'
		);
	} catch (error) {
		issues.push(errorMessage(error));
	}
	if (
		!collectionValidation ||
		collectionValidation.status !== 'passed' ||
		(collectionValidation.issues?.length ?? 0) !== 0 ||
		collectionValidation.candidateSetSha256 !== canonicalHash(candidateSet) ||
		collectionValidation.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		manifest.collectionValidationSha256 !== canonicalHash(collectionValidation)
	) {
		issues.push('Effective-cohort successor collection validation is stale.');
	}
	if (typeof validateCollectionCandidate === 'function' && candidateSet.every(Boolean)) {
		const replay = validateCollectionCandidate({
			candidateSet: structuredClone(candidateSet),
			candidateBatches: new Map(
				[...candidateBatches].map(([shardId, batch]) => [shardId, structuredClone(batch)])
			),
			effectivePlan: structuredClone(effectivePlan)
		});
		if (canonicalHash(replay) !== canonicalHash(collectionValidation)) {
			issues.push('Effective-cohort successor current collection replay differs.');
		}
	}
	return issues.length
		? failed(issues)
		: {
				status: 'passed',
				issues: [],
				manifest,
				basePlan,
				effectivePlan,
				candidateSet,
				candidateBatches,
				collectionValidation,
				remapManifests: predecessor.remapManifests,
				difficultyAdjustmentManifests: predecessor.difficultyAdjustmentManifests,
				recoveries: predecessor.recoveries,
				predecessor,
				reviewSummary,
				...(hasReviewRebaseAncestry
					? {
							reviewRebaseEvidence: predecessor.reviewRebaseEvidence,
							...(hasInfrastructureRecovery
								? {
										reviewRebaseInfrastructureRecoveryEvidence:
											predecessor.reviewRebaseInfrastructureRecoveryEvidence,
										infrastructureRecoveryTerminal: predecessor.infrastructureRecoveryTerminal
									}
								: {}),
							parentChain: manifest.parentChain
						}
					: {}),
				candidateSetSha256: canonicalHash(candidateSet)
			};
}

function prepareEffectiveCohortSuccessor({
	root,
	directory,
	repairSha256,
	objectiveId,
	executionId,
	reviewSummary,
	reviewEffectiveCohortManifestSha256,
	predecessor,
	proposals,
	validateCollectionCandidate
}) {
	const basePlan = predecessor.basePlan;
	const effectivePlan = predecessor.effectivePlan;
	const hasReviewRebaseAncestry = isRecord(predecessor.manifest.parentChain);
	const hasInfrastructureRecovery = isRecord(predecessor.manifest.infrastructureRecovery);
	const expectedIds = effectivePlan.rows.map((row) => row.id);
	const expectedShardIds = uniqueInOrder(effectivePlan.rows.map((row) => row.shard));
	const reviews = Array.isArray(reviewSummary?.reviews) ? reviewSummary.reviews : [];
	const reviewsById = new Map(reviews.map((review) => [review?.id, review]));
	const rejectedIds = expectedIds.filter((id) => reviewsById.get(id)?.accepted === false);
	const rejectedShardIds = new Set(
		effectivePlan.rows
			.filter((row) => reviewsById.get(row.id)?.accepted === false)
			.map((row) => row.shard)
	);
	if (
		reviewSummary?.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		reviewSummary.status !== 'failed' ||
		reviewSummary.planId !== effectivePlan.planId ||
		reviewSummary.planSha256 !== canonicalHash(effectivePlan) ||
		reviewSummary.basePlanSha256 !== canonicalHash(basePlan) ||
		reviewSummary.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		reviewSummary.sourceSnapshotSha256 !== predecessor.manifest.sourceSnapshotSha256 ||
		reviewSummary.curriculumEvidenceSha256 !== predecessor.manifest.curriculumEvidenceSha256 ||
		reviewSummary.candidateSetSha256 !== predecessor.candidateSetSha256 ||
		(hasReviewRebaseAncestry &&
			reviewSummary.effectiveCohortManifestSha256 !== canonicalHash(predecessor.manifest)) ||
		(hasReviewRebaseAncestry &&
			REVIEW_REBASE_VERIFICATION_FIELDS.some((field) => reviewSummary[field] !== undefined)) ||
		(hasInfrastructureRecovery
			? reviewSummary.reviewRebaseInfrastructureRecoveryManifestSha256 !==
					predecessor.manifest.infrastructureRecovery.manifestSha256 ||
				reviewSummary.reviewRebaseInfrastructureRecoveryId !==
					predecessor.manifest.infrastructureRecovery.recoveryId
			: REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_VERIFICATION_FIELDS.some(
					(field) => reviewSummary[field] !== undefined
				)) ||
		(reviewSummary.recoverySetSha256 ?? null) !==
			(predecessor.manifest.recoverySetSha256 ?? null) ||
		reviewSummary.reviewCount !== expectedIds.length ||
		reviews.length !== expectedIds.length ||
		reviewsById.size !== expectedIds.length ||
		expectedIds.some((id) => !reviewsById.has(id)) ||
		reviewSummary.acceptedCount !== expectedIds.length - rejectedIds.length ||
		reviewSummary.rejectedCount !== rejectedIds.length ||
		rejectedIds.length === 0 ||
		!Array.isArray(reviewSummary.assignmentResults) ||
		reviewSummary.assignmentResults.length !== expectedShardIds.length ||
		reviewSummary.assignmentResults.some((result) => result?.status !== 'passed') ||
		!Array.isArray(reviewSummary.issues) ||
		reviewSummary.issues.length !== 0
	) {
		throw new Error(
			'Effective-cohort successor requires one complete failed fresh review of the exact predecessor cohort.'
		);
	}
	const proposalByShard = new Map(
		(proposals ?? []).map((proposal) => [proposal?.shardId, proposal])
	);
	if (
		!Array.isArray(proposals) ||
		proposalByShard.size !== proposals.length ||
		proposalByShard.size !== rejectedShardIds.size ||
		[...rejectedShardIds].some((shardId) => !proposalByShard.has(shardId)) ||
		[...proposalByShard].some(([shardId]) => !rejectedShardIds.has(shardId))
	) {
		throw new Error(
			'Effective-cohort successor requires exactly one proposal for every rejected shard and no others.'
		);
	}
	const predecessorBudget = scienceChallengeEffectiveCohortAttemptBudgetByShard(predecessor);
	const predecessorShardById = new Map(
		predecessor.manifest.shards.map((shard) => [shard.shardId, shard])
	);
	const candidateById = new Map();
	const candidateBatches = new Map();
	const attemptBudgetRows = [];
	const shardValues = [];
	const shards = expectedShardIds.map((shardId) => {
		const rows = effectivePlan.rows.filter((row) => row.shard === shardId);
		const priorCandidate = predecessor.candidateBatches.get(shardId);
		const predecessorShard = predecessorShardById.get(shardId);
		if (!priorCandidate || !predecessorShard) {
			throw new Error(`${shardId} is missing from the effective-cohort predecessor.`);
		}
		const proposal = proposalByShard.get(shardId) ?? null;
		let candidate;
		let validation;
		let disposition;
		let lineage;
		let cycleAttempts = 0;
		if (proposal) {
			const candidatePath = requireContainedFile(
				root,
				proposal.candidatePath,
				`${shardId} successor proposal candidate`
			);
			const validationPath = requireContainedFile(
				root,
				proposal.validationPath,
				`${shardId} successor proposal validation`
			);
			candidate = readJson(candidatePath);
			validation = readJson(validationPath);
			const targetedValidation = validateVerificationRepairCandidate({
				candidate,
				priorCandidate,
				rows,
				reviews: reviewsById
			});
			if (
				targetedValidation.status !== 'passed' ||
				proposal.candidateSha256 !== canonicalHash(candidate) ||
				proposal.validationSha256 !== canonicalHash(validation) ||
				validation.status !== 'passed' ||
				validation.candidateSha256 !== canonicalHash(candidate) ||
				!Number.isInteger(proposal.attempt) ||
				proposal.attempt < 1
			) {
				throw new Error(
					`${shardId} successor proposal is stale or changed accepted rows.${
						targetedValidation.issues.length ? ` ${targetedValidation.issues.join(' ')}` : ''
					}`
				);
			}
			cycleAttempts = proposal.attempt;
			disposition = 'successor-repair-proposal';
			const shardRejectedIds = rows
				.filter((row) => reviewsById.get(row.id)?.accepted === false)
				.map((row) => row.id);
			lineage = {
				predecessorShardSha256: canonicalHash(predecessorShard),
				proposalSha256: canonicalHash(proposal),
				attempt: proposal.attempt,
				candidateSha256: canonicalHash(candidate),
				validationSha256: canonicalHash(validation),
				rejectedIds: shardRejectedIds,
				rejectedIdsSha256: canonicalHash(shardRejectedIds)
			};
		} else {
			candidate = structuredClone(priorCandidate);
			validation = readBoundJsonReference(
				root,
				predecessorShard.validation,
				`${shardId} predecessor validation`
			);
			disposition = 'successor-unchanged';
			lineage = {
				predecessorShardSha256: canonicalHash(predecessorShard),
				predecessorCandidateSha256: canonicalHash(candidate),
				predecessorValidationSha256: canonicalHash(validation)
			};
		}
		const predecessorObjectiveAttempts = predecessorBudget.get(shardId);
		if (
			!Number.isInteger(predecessorObjectiveAttempts) ||
			cycleAttempts > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
		) {
			throw new Error(
				`${shardId} successor exceeds the immutable four-attempt ceiling for this review objective.`
			);
		}
		attemptBudgetRows.push({
			shardId,
			predecessorObjectiveAttempts,
			currentObjectiveAttempts: cycleAttempts
		});
		candidateBatches.set(shardId, candidate);
		for (const entry of candidate.challenges ?? []) {
			if (candidateById.has(entry?.definition?.id)) {
				throw new Error(`${entry?.definition?.id} appears in multiple successor shards.`);
			}
			candidateById.set(entry?.definition?.id, entry);
		}
		const finalCandidatePath = path.join(directory, 'shards', shardId, 'candidate.json');
		const finalValidationPath = path.join(directory, 'shards', shardId, 'validation.json');
		shardValues.push({ shardId, candidate, validation });
		return {
			shardId,
			disposition,
			planRowIndexes: effectivePlan.rows
				.map((row, index) => ({ row, index }))
				.filter(({ row }) => row.shard === shardId)
				.map(({ index }) => index),
			challengeIds: rows.map((row) => row.id),
			candidate: valueReference(root, finalCandidatePath, candidate),
			validation: valueReference(root, finalValidationPath, validation),
			lineage
		};
	});
	const candidateSet = expectedIds.map((id) => candidateById.get(id));
	const recoveryTargetIssues = [];
	validateSuccessorRecoveryTargets({
		predecessor,
		candidateBatches,
		issues: recoveryTargetIssues
	});
	if (recoveryTargetIssues.length > 0) {
		throw new Error(
			`Effective-cohort successor changed an accepted typed recovery:\n${recoveryTargetIssues.join(
				'\n'
			)}`
		);
	}
	if (candidateSet.some((candidate) => !candidate)) {
		throw new Error('Effective-cohort successor candidate set is incomplete.');
	}
	const collectionValidation = validateCollectionCandidate({
		candidateSet: structuredClone(candidateSet),
		candidateBatches: new Map(
			[...candidateBatches].map(([shardId, batch]) => [shardId, structuredClone(batch)])
		),
		effectivePlan: structuredClone(effectivePlan)
	});
	if (
		collectionValidation?.status !== 'passed' ||
		(collectionValidation.issues?.length ?? 0) !== 0 ||
		collectionValidation.candidateCount !== candidateSet.length ||
		collectionValidation.candidateSetSha256 !== canonicalHash(candidateSet) ||
		collectionValidation.effectivePlanSha256 !== canonicalHash(effectivePlan)
	) {
		throw new Error(
			`Effective-cohort successor collection validation failed:\n${(
				collectionValidation?.issues ?? []
			).join('\n')}`
		);
	}
	const predecessorManifestPath = requireContainedFile(
		root,
		predecessor.manifestPath,
		'effective-cohort predecessor manifest'
	);
	const manifestCore = {
		schemaVersion: SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SCHEMA,
		disposition: SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION,
		planId: effectivePlan.planId,
		repairSha256,
		objectiveId,
		executionId,
		firstReviewSha256: repairSha256,
		sourceSnapshotSha256: predecessor.manifest.sourceSnapshotSha256,
		curriculumEvidenceSha256: predecessor.manifest.curriculumEvidenceSha256,
		curriculumCatalogSha256: predecessor.manifest.curriculumCatalogSha256,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		plans: {
			base: valueReference(root, path.join(directory, 'base-plan.json'), basePlan),
			effective: valueReference(root, path.join(directory, 'effective-plan.json'), effectivePlan)
		},
		predecessor: {
			manifest: fileReference(root, predecessorManifestPath),
			manifestCanonicalSha256: canonicalHash(predecessor.manifest),
			candidateSetSha256: predecessor.candidateSetSha256
		},
		...(hasReviewRebaseAncestry
			? {
					parentChain: structuredClone(predecessor.manifest.parentChain),
					...(hasInfrastructureRecovery
						? {
								infrastructureRecovery: structuredClone(predecessor.manifest.infrastructureRecovery)
							}
						: {}),
					requiresFreshFullVerification: true,
					releaseEligible: false
				}
			: {}),
		review: {
			summary: valueReference(root, path.join(directory, 'review-summary.json'), reviewSummary),
			summarySha256: repairSha256,
			effectiveCohortManifestSha256: reviewEffectiveCohortManifestSha256,
			candidateSetSha256: reviewSummary.candidateSetSha256,
			rejectedIds,
			rejectedIdsSha256: canonicalHash(rejectedIds)
		},
		attemptBudget: {
			maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
			objectiveId,
			predecessorObjectiveId: predecessor.manifest.objectiveId,
			shards: attemptBudgetRows,
			shardsSha256: canonicalHash(attemptBudgetRows)
		},
		shardCount: shards.length,
		challengeCount: expectedIds.length,
		orderedChallengeIds: expectedIds,
		orderedChallengeIdsSha256: canonicalHash(expectedIds),
		candidateCount: candidateSet.length,
		candidateSetSha256: canonicalHash(candidateSet),
		remapCount: predecessor.manifest.remapCount,
		remapManifestSetSha256: predecessor.manifest.remapManifestSetSha256,
		difficultyAdjustmentCount: predecessor.manifest.difficultyAdjustmentCount,
		difficultyAdjustmentManifestCount: predecessor.manifest.difficultyAdjustmentManifestCount,
		difficultyAdjustmentManifestSetSha256:
			predecessor.manifest.difficultyAdjustmentManifestSetSha256,
		recoveryCount: predecessor.manifest.recoveryCount,
		recoverySetSha256: predecessor.manifest.recoverySetSha256,
		recoveryTargetSetSha256: predecessor.manifest.recoveryTargetSetSha256,
		recoveryProjectionSha256: predecessor.manifest.recoveryProjectionSha256,
		collectionValidation: valueReference(
			root,
			path.join(directory, 'collection-validation.json'),
			collectionValidation
		),
		collectionValidationSha256: canonicalHash(collectionValidation),
		shards
	};
	return {
		manifest: {
			...manifestCore,
			manifestCoreSha256: canonicalHash(manifestCore)
		},
		shardValues,
		candidateSet,
		candidateBatches,
		collectionValidation
	};
}

function validateScienceChallengeReviewRebaseSuccessorManifest({
	manifest,
	referenceRoot,
	basePlan,
	effectivePlan,
	expectedRepairSha256,
	expectedObjectiveId,
	expectedExecutionId,
	expectedFirstReviewSha256,
	expectedSourceSnapshotSha256,
	expectedCurriculumEvidenceSha256,
	expectedCurriculumCatalogSha256,
	validateCollectionCandidate,
	reviewRebaseEvidence,
	reviewRebaseInfrastructureRecoveryEvidence,
	reviewRebaseInfrastructureRecoveryArchiveClosure
}) {
	const issues = [];
	const { manifestCoreSha256, ...manifestCore } = isRecord(manifest) ? manifest : {};
	if (
		manifest?.schemaVersion !== SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SCHEMA ||
		manifest?.disposition !== SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION ||
		!HASH.test(String(manifestCoreSha256 ?? '')) ||
		manifestCoreSha256 !== canonicalHash(manifestCore) ||
		manifest.requiresFreshFullVerification !== true ||
		manifest.releaseEligible !== false ||
		manifest.predecessor !== undefined
	) {
		return failed(
			'Review-rebase successor schema, disposition, release state or self-binding is invalid.'
		);
	}
	let parent;
	try {
		parent = requireScienceChallengeReviewRebaseEvidence(reviewRebaseEvidence);
	} catch (error) {
		return failed(errorMessage(error));
	}
	let infrastructureRecovery;
	try {
		infrastructureRecovery = requireScienceChallengeReviewRebaseInfrastructureRecoveryEvidence({
			evidence: reviewRebaseInfrastructureRecoveryEvidence,
			archiveClosure: reviewRebaseInfrastructureRecoveryArchiveClosure,
			parent
		});
		if (
			infrastructureRecovery
				? canonicalHash(manifest.infrastructureRecovery) !==
					canonicalHash(infrastructureRecovery.binding)
				: manifest.infrastructureRecovery !== undefined
		) {
			issues.push(
				'Review-rebase successor infrastructure-recovery binding is stale or unassigned.'
			);
		}
	} catch (error) {
		issues.push(errorMessage(error));
	}
	for (const [field, expected] of [
		['repairSha256', expectedRepairSha256],
		['objectiveId', expectedObjectiveId],
		['executionId', expectedExecutionId],
		['firstReviewSha256', expectedFirstReviewSha256],
		['sourceSnapshotSha256', expectedSourceSnapshotSha256],
		['curriculumEvidenceSha256', expectedCurriculumEvidenceSha256],
		['curriculumCatalogSha256', expectedCurriculumCatalogSha256]
	]) {
		if (!HASH.test(String(manifest[field] ?? ''))) {
			issues.push(`Review-rebase successor ${field} must be a lowercase SHA-256.`);
		}
		if (expected !== undefined && manifest[field] !== expected) {
			issues.push(`Review-rebase successor ${field} differs from expected evidence.`);
		}
	}
	if (
		!isRecord(basePlan) ||
		!Array.isArray(basePlan.rows) ||
		!isRecord(effectivePlan) ||
		!Array.isArray(effectivePlan.rows) ||
		canonicalHash(basePlan) !== canonicalHash(parent.basePlan) ||
		canonicalHash(effectivePlan) !== canonicalHash(parent.effectivePlan) ||
		manifest.planId !== effectivePlan.planId ||
		manifest.basePlanSha256 !== canonicalHash(basePlan) ||
		manifest.effectivePlanSha256 !== canonicalHash(effectivePlan)
	) {
		issues.push('Review-rebase successor plan identity differs from B0.');
	}
	if (!isRecord(manifest.plans)) {
		issues.push('Review-rebase successor plan references are missing.');
	} else {
		validateJsonReference(
			referenceRoot,
			manifest.plans.base,
			canonicalHash(basePlan),
			'review-rebase successor base plan',
			issues
		);
		validateJsonReference(
			referenceRoot,
			manifest.plans.effective,
			canonicalHash(effectivePlan),
			'review-rebase successor effective plan',
			issues
		);
	}
	if (issues.length) return failed(issues);

	let reviewSummary;
	let authority;
	try {
		reviewSummary = readBoundJsonReference(
			referenceRoot,
			manifest.review?.summary,
			'review-rebase successor V1 summary'
		);
		authority = readBoundJsonReference(
			referenceRoot,
			manifest.verificationRepairAuthority,
			'review-rebase successor mutation authority'
		);
	} catch (error) {
		issues.push(errorMessage(error));
	}
	if (!reviewSummary || !authority) return failed(issues);
	let expectedAuthority;
	try {
		expectedAuthority = buildScienceChallengeVerificationRepairAuthority({
			verificationSummary: reviewSummary,
			reviewRebaseManifest: parent.manifest,
			suppliedAuthority: authority
		});
	} catch (error) {
		issues.push(errorMessage(error));
	}
	const authorityValidation = validateScienceChallengeVerificationRepairAuthority({
		authority,
		verificationSummary: reviewSummary,
		reviewRebaseManifest: parent.manifest
	});
	issues.push(
		...authorityValidation.issues.map((issue) => `Review-rebase successor authority: ${issue}`)
	);
	if (!expectedAuthority) return failed(issues);
	if (infrastructureRecovery) {
		validateInfrastructureRecoverySuccessorContext({
			infrastructureRecovery,
			reviewSummary,
			authority: expectedAuthority,
			objectiveId: manifest.objectiveId,
			executionId: manifest.executionId,
			issues
		});
	}
	const expectedParent = reviewRebaseParentRecord(parent, expectedAuthority);
	const expectedParentChain = reviewRebaseParentChain({
		parent,
		authority: expectedAuthority,
		firstVerificationSha256: canonicalHash(reviewSummary),
		objectiveId: manifest.objectiveId,
		executionId: manifest.executionId
	});
	if (
		canonicalHash(manifest.parent) !== canonicalHash(expectedParent) ||
		canonicalHash(manifest.parentChain) !== canonicalHash(expectedParentChain) ||
		manifest.verificationRepairAuthoritySha256 !== canonicalHash(authority)
	) {
		issues.push('Review-rebase successor B0/V0/R0/V1/S1 parent chain is stale.');
	}
	const expectedIds = effectivePlan.rows.map((row) => row.id);
	const expectedShardIds = uniqueInOrder(effectivePlan.rows.map((row) => row.shard));
	const reviews = Array.isArray(reviewSummary.reviews) ? reviewSummary.reviews : [];
	const reviewsById = new Map(reviews.map((review) => [review?.id, review]));
	const rejectedIds = expectedIds.filter((id) => reviewsById.get(id)?.accepted === false);
	const invalidReviewRows = reviews.flatMap((review) =>
		validateIndependentContentReviewRow(review).issues.map(
			(issue) => `${review?.id ?? 'unknown review'}: ${issue}`
		)
	);
	if (
		reviewSummary.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		reviewSummary.status !== 'failed' ||
		canonicalHash(reviewSummary) !== manifest.repairSha256 ||
		manifest.review?.summarySha256 !== manifest.repairSha256 ||
		manifest.review?.parentManifestSha256 !== canonicalHash(parent.manifest) ||
		reviewSummary.planId !== effectivePlan.planId ||
		reviewSummary.planSha256 !== canonicalHash(effectivePlan) ||
		reviewSummary.basePlanSha256 !== canonicalHash(basePlan) ||
		reviewSummary.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		reviewSummary.sourceSnapshotSha256 !== manifest.sourceSnapshotSha256 ||
		reviewSummary.curriculumEvidenceSha256 !== manifest.curriculumEvidenceSha256 ||
		reviewSummary.candidateSetSha256 !== parent.coreManifest.candidateSetSha256 ||
		REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_VERIFICATION_FIELDS.some(
			(field) => reviewSummary[field] !== undefined
		) ||
		reviews.length !== expectedIds.length ||
		reviewsById.size !== expectedIds.length ||
		expectedIds.some((id) => !reviewsById.has(id)) ||
		invalidReviewRows.length !== 0 ||
		reviewSummary.assignmentCount !== expectedShardIds.length ||
		!Array.isArray(reviewSummary.assignmentResults) ||
		reviewSummary.assignmentResults.length !== expectedShardIds.length ||
		reviewSummary.assignmentResults.some((result) => result?.status !== 'passed') ||
		reviewSummary.reviewCount !== expectedIds.length ||
		reviewSummary.acceptedCount !== expectedIds.length - rejectedIds.length ||
		reviewSummary.rejectedCount !== rejectedIds.length ||
		!Array.isArray(reviewSummary.issues) ||
		reviewSummary.issues.length !== 0 ||
		canonicalHash(manifest.review?.rejectedIds) !== canonicalHash(rejectedIds) ||
		manifest.review?.rejectedIdsSha256 !== canonicalHash(rejectedIds) ||
		canonicalHash(manifest.review?.mutableTargetIds) !==
			canonicalHash(expectedAuthority.mutableChallengeIds) ||
		manifest.review?.mutableTargetSetSha256 !== expectedAuthority.mutableChallengeSetSha256
	) {
		issues.push('Review-rebase successor V1 review or mutable-target binding is stale.');
	}

	const budgetRows = manifest.attemptBudget?.shards;
	const budgetByShard = new Map((budgetRows ?? []).map((row) => [row?.shardId, row]));
	if (
		manifest.attemptBudget?.maxAttempts !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
		manifest.attemptBudget?.objectiveId !== manifest.objectiveId ||
		manifest.attemptBudget?.predecessorObjectiveId !== null ||
		manifest.attemptBudget?.parentKind !== 'review-rebase' ||
		!Array.isArray(budgetRows) ||
		budgetRows.length !== expectedShardIds.length ||
		budgetByShard.size !== expectedShardIds.length ||
		manifest.attemptBudget?.shardsSha256 !== canonicalHash(budgetRows)
	) {
		issues.push('Review-rebase successor attempt budget is incomplete or traverses before B0.');
	}
	if (
		!Array.isArray(manifest.shards) ||
		manifest.shards.length !== expectedShardIds.length ||
		manifest.shardCount !== expectedShardIds.length
	) {
		return failed([...issues, 'Review-rebase successor shard membership is incomplete.']);
	}
	const parentSelectionByShard = new Map(
		parent.coreManifest.selections.map((selection) => [selection.shardId, selection])
	);
	const mutableIds = new Set(expectedAuthority.mutableChallengeIds);
	if (infrastructureRecovery) {
		validateInfrastructureRecoveryTerminalShardSet({
			infrastructureRecovery,
			mutableShardIds: uniqueInOrder(
				effectivePlan.rows.filter((row) => mutableIds.has(row.id)).map((row) => row.shard)
			),
			frozenShardIds: expectedShardIds.filter(
				(shardId) =>
					!effectivePlan.rows.some((row) => row.shard === shardId && mutableIds.has(row.id))
			),
			issues
		});
	}
	const candidateById = new Map();
	const candidateBatches = new Map();
	for (const [index, shard] of manifest.shards.entries()) {
		const shardId = expectedShardIds[index];
		const rows = effectivePlan.rows.filter((row) => row.shard === shardId);
		const expectedRowIndexes = effectivePlan.rows
			.map((row, rowIndex) => ({ row, rowIndex }))
			.filter(({ row }) => row.shard === shardId)
			.map(({ rowIndex }) => rowIndex);
		if (
			shard?.shardId !== shardId ||
			!['successor-repair-proposal', 'successor-unchanged'].includes(shard?.disposition) ||
			canonicalHash(shard?.challengeIds) !== canonicalHash(rows.map((row) => row.id)) ||
			canonicalHash(shard?.planRowIndexes) !== canonicalHash(expectedRowIndexes)
		) {
			issues.push(`Review-rebase successor shard ${index + 1} identity is invalid.`);
			continue;
		}
		let candidate;
		let validation;
		try {
			candidate = readBoundJsonReference(
				referenceRoot,
				shard.candidate,
				`${shardId} review-rebase successor candidate`
			);
			validation = readBoundJsonReference(
				referenceRoot,
				shard.validation,
				`${shardId} review-rebase successor validation`
			);
		} catch (error) {
			issues.push(errorMessage(error));
			continue;
		}
		const priorCandidate = parent.candidateBatches.get(shardId);
		const priorValidation = parent.outputValidations.get(shardId);
		const parentSelection = parentSelectionByShard.get(shardId);
		const budget = budgetByShard.get(shardId);
		const shardMutableIds = rows.filter((row) => mutableIds.has(row.id)).map((row) => row.id);
		const commonLineageIsExact =
			shard.lineage?.parentKind === 'review-rebase' &&
			shard.lineage?.parentSelectionSha256 === canonicalHash(parentSelection) &&
			shard.lineage?.parentCandidateSha256 === canonicalHash(priorCandidate) &&
			shard.lineage?.parentValidationSha256 === canonicalHash(priorValidation) &&
			shard.lineage?.parentSourceCandidateSha256 === parentSelection?.source?.candidateSha256 &&
			shard.lineage?.parentSourceValidationSha256 === parentSelection?.source?.validationSha256;
		if (
			canonicalHash(candidate?.challenges?.map((entry) => entry?.definition?.id)) !==
				canonicalHash(rows.map((row) => row.id)) ||
			validation?.candidateSha256 !== canonicalHash(candidate) ||
			!budget ||
			budget.predecessorObjectiveAttempts !== 0 ||
			!Number.isInteger(budget.currentObjectiveAttempts) ||
			budget.currentObjectiveAttempts < 0 ||
			budget.currentObjectiveAttempts > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
			!commonLineageIsExact
		) {
			issues.push(`${shardId} review-rebase successor candidate or parent lineage is stale.`);
			continue;
		}
		if (shard.disposition === 'successor-repair-proposal') {
			const targeted = validateVerificationRepairCandidate({
				candidate,
				priorCandidate,
				rows,
				reviews: reviewsById,
				verificationRepairAuthority: expectedAuthority
			});
			if (
				shardMutableIds.length === 0 ||
				targeted.status !== 'passed' ||
				validation.status !== 'passed' ||
				(validation.issues?.length ?? 0) !== 0 ||
				budget.currentObjectiveAttempts !== shard.lineage?.attempt ||
				!Number.isInteger(shard.lineage?.attempt) ||
				shard.lineage?.candidateSha256 !== canonicalHash(candidate) ||
				shard.lineage?.validationSha256 !== canonicalHash(validation) ||
				canonicalHash(shard.lineage?.mutableIds) !== canonicalHash(shardMutableIds) ||
				shard.lineage?.mutableIdsSha256 !== canonicalHash(shardMutableIds)
			) {
				issues.push(
					`${shardId} review-rebase successor repair proposal is invalid.`,
					...(targeted.issues ?? [])
				);
			}
			if (infrastructureRecovery) {
				validateInfrastructureRecoveryTerminalProposal({
					infrastructureRecovery,
					shardId,
					candidateSha256: canonicalHash(candidate),
					validationSha256: canonicalHash(validation),
					logicalContentOrdinal: shard.lineage?.attempt,
					issues
				});
			}
		} else if (
			shardMutableIds.length !== 0 ||
			budget.currentObjectiveAttempts !== 0 ||
			canonicalHash(candidate) !== canonicalHash(priorCandidate) ||
			canonicalHash(validation) !== canonicalHash(priorValidation)
		) {
			issues.push(`${shardId} review-rebase successor changed frozen non-target bytes.`);
		}
		candidateBatches.set(shardId, candidate);
		for (const entry of candidate.challenges ?? []) {
			const id = entry?.definition?.id;
			if (!id || candidateById.has(id)) issues.push(`${shardId} has a duplicate candidate id.`);
			else candidateById.set(id, entry);
		}
	}
	const candidateSet = expectedIds.map((id) => candidateById.get(id));
	if (
		candidateSet.some((entry) => !entry) ||
		manifest.challengeCount !== expectedIds.length ||
		manifest.candidateCount !== expectedIds.length ||
		manifest.orderedChallengeIdsSha256 !== canonicalHash(expectedIds) ||
		canonicalHash(manifest.orderedChallengeIds) !== canonicalHash(expectedIds) ||
		manifest.candidateSetSha256 !== canonicalHash(candidateSet)
	) {
		issues.push('Review-rebase successor candidate-set binding is invalid.');
	}
	if (
		manifest.remapCount !== 0 ||
		manifest.remapManifestSetSha256 !== canonicalHash([]) ||
		manifest.difficultyAdjustmentCount !== 0 ||
		manifest.difficultyAdjustmentManifestCount !== 0 ||
		manifest.difficultyAdjustmentManifestSetSha256 !== canonicalHash([]) ||
		manifest.recoveryCount !== 0 ||
		manifest.recoverySetSha256 !== canonicalHash([]) ||
		manifest.recoveryTargetSetSha256 !== canonicalHash([]) ||
		manifest.recoveryProjectionSha256 !== canonicalHash([])
	) {
		issues.push('Review-rebase successor contains unassigned remap/difficulty recovery lineage.');
	}
	let collectionValidation;
	try {
		collectionValidation = readBoundJsonReference(
			referenceRoot,
			manifest.collectionValidation,
			'review-rebase successor collection validation'
		);
	} catch (error) {
		issues.push(errorMessage(error));
	}
	if (
		!collectionValidation ||
		collectionValidation.status !== 'passed' ||
		(collectionValidation.issues?.length ?? 0) !== 0 ||
		collectionValidation.candidateCount !== expectedIds.length ||
		collectionValidation.candidateSetSha256 !== canonicalHash(candidateSet) ||
		collectionValidation.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		manifest.collectionValidationSha256 !== canonicalHash(collectionValidation)
	) {
		issues.push('Review-rebase successor repaired collection validation is stale.');
	}
	if (
		typeof validateCollectionCandidate === 'function' &&
		candidateSet.every(Boolean) &&
		collectionValidation
	) {
		const replay = validateCollectionCandidate({
			candidateSet: structuredClone(candidateSet),
			candidateBatches: new Map(
				[...candidateBatches].map(([shardId, batch]) => [shardId, structuredClone(batch)])
			),
			effectivePlan: structuredClone(effectivePlan)
		});
		if (canonicalHash(replay) !== canonicalHash(collectionValidation)) {
			issues.push('Review-rebase successor current collection replay differs.');
		}
	}
	return issues.length
		? failed(issues)
		: {
				status: 'passed',
				issues: [],
				manifest,
				basePlan,
				effectivePlan,
				candidateSet,
				candidateBatches,
				collectionValidation,
				remapManifests: [],
				difficultyAdjustmentManifests: [],
				recoveries: [],
				reviewSummary,
				verificationRepairAuthority: authority,
				reviewRebaseEvidence: parent,
				...(infrastructureRecovery
					? {
							reviewRebaseInfrastructureRecoveryEvidence: infrastructureRecovery.evidence,
							infrastructureRecoveryTerminal: infrastructureRecovery.terminal
						}
					: {}),
				parentChain: manifest.parentChain,
				candidateSetSha256: canonicalHash(candidateSet)
			};
}

function requireScienceChallengeReviewRebaseEvidence(evidence) {
	if (
		evidence?.status !== 'passed' ||
		evidence.action !== 'replayed' ||
		!isRecord(evidence.manifest) ||
		!isRecord(evidence.coreManifest) ||
		!isRecord(evidence.plan) ||
		!Array.isArray(evidence.plan.rows) ||
		!(evidence.candidateBatches instanceof Map) ||
		!(evidence.outputValidations instanceof Map) ||
		!isRecord(evidence.collectionValidation)
	) {
		throw new Error(
			'Review-rebase successor requires the complete replayed B0 filesystem evidence.'
		);
	}
	const core = evidence.coreManifest;
	const wrapperCore = structuredClone(evidence.manifest);
	delete wrapperCore.evidence;
	if (
		core.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_MANIFEST_SCHEMA ||
		core.disposition !== SCIENCE_CHALLENGE_REVIEW_REBASE_DISPOSITION ||
		core.status !== 'review-pending' ||
		core.requiresFreshFullVerification !== true ||
		core.releaseEligible !== false ||
		core.manifestCoreSha256 !==
			canonicalHash(
				Object.fromEntries(Object.entries(core).filter(([key]) => key !== 'manifestCoreSha256'))
			) ||
		canonicalHash(wrapperCore) !== canonicalHash(core) ||
		core.planSha256 !== canonicalHash(evidence.plan) ||
		core.collectionValidationSha256 !== canonicalHash(evidence.collectionValidation) ||
		canonicalHash(core.collectionValidation) !== canonicalHash(evidence.collectionValidation) ||
		core.collectionRemediationSetSha256 !== canonicalHash(core.collectionRemediations)
	) {
		throw new Error('Replayed review-rebase B0 manifest or deterministic output binding is stale.');
	}
	const repositoryRoot = requireRealDirectory(
		evidence.repositoryRoot,
		'review-rebase evidence repository root'
	);
	const manifestFile = requireContainedFile(
		repositoryRoot,
		evidence.manifestPath,
		'review-rebase evidence manifest'
	);
	const manifestBytes = readFileSync(manifestFile);
	if (
		JSON.parse(manifestBytes.toString('utf8')) === null ||
		canonicalHash(JSON.parse(manifestBytes.toString('utf8'))) !==
			canonicalHash(evidence.manifest) ||
		sha256(manifestBytes) !== sha256(stableJsonBytes(evidence.manifest)) ||
		evidence.manifestPathRelative !== portableRelative(repositoryRoot, manifestFile) ||
		evidence.manifest.evidence?.manifestPath !== evidence.manifestPathRelative
	) {
		throw new Error('Replayed review-rebase B0 manifest path or exact bytes are stale.');
	}
	const basePlan = readReviewRebaseInput(
		repositoryRoot,
		evidence.manifest.evidence?.inputs?.basePlan,
		'review-rebase base plan'
	);
	const parentVerification = readReviewRebaseInput(
		repositoryRoot,
		evidence.manifest.evidence?.inputs?.parentVerification,
		'review-rebase V0 verification'
	);
	const parentRepair = readReviewRebaseInput(
		repositoryRoot,
		evidence.manifest.evidence?.inputs?.parentRepair,
		'review-rebase R0 repair'
	);
	if (
		core.basePlanSha256 !== canonicalHash(basePlan) ||
		core.parent?.verificationSha256 !== canonicalHash(parentVerification) ||
		core.parent?.repairSha256 !== canonicalHash(parentRepair) ||
		core.parent?.candidateSetSha256 !== parentVerification.candidateSetSha256 ||
		core.parent?.objectiveId !== parentRepair.verificationRepairExecutionIdentity?.objectiveId ||
		core.parent?.executionId !== parentRepair.verificationRepairExecutionIdentity?.executionId
	) {
		throw new Error('Replayed review-rebase B0 does not bind its complete V0/R0 parent chain.');
	}
	const orderedShardIds = uniqueInOrder(evidence.plan.rows.map((row) => row.shard));
	const orderedCandidates = [];
	if (
		evidence.plan.rows.length !== EXPECTED_CHALLENGE_COUNT ||
		orderedShardIds.length !== EXPECTED_SHARD_COUNT ||
		core.candidateCount !== EXPECTED_CHALLENGE_COUNT ||
		!Array.isArray(core.selections) ||
		core.selections.length !== EXPECTED_SHARD_COUNT ||
		core.selectionSetSha256 !== canonicalHash(core.selections)
	) {
		throw new Error('Replayed review-rebase B0 does not contain one complete 51/408 cohort.');
	}
	const selectionByShard = new Map(
		core.selections.map((selection) => [selection?.shardId, selection])
	);
	if (
		selectionByShard.size !== EXPECTED_SHARD_COUNT ||
		orderedShardIds.some((shardId) => !selectionByShard.has(shardId))
	) {
		throw new Error('Replayed review-rebase B0 selection membership is incomplete.');
	}
	for (const shardId of orderedShardIds) {
		const rows = evidence.plan.rows.filter((row) => row.shard === shardId);
		const candidate = evidence.candidateBatches.get(shardId);
		const validation = evidence.outputValidations.get(shardId);
		const selection = selectionByShard.get(shardId);
		if (
			!Array.isArray(candidate?.challenges) ||
			canonicalHash(candidate.challenges.map((entry) => entry?.definition?.id)) !==
				canonicalHash(rows.map((row) => row.id)) ||
			canonicalHash(candidate) !== selection?.candidateSha256 ||
			validation?.status !== 'passed' ||
			validation?.contentStatus !== 'review-pending' ||
			validation?.releaseEligible !== false ||
			validation?.candidateSha256 !== canonicalHash(candidate) ||
			selection?.validationSha256 !== canonicalHash(validation)
		) {
			throw new Error(`${shardId} replayed review-rebase candidate or validation is stale.`);
		}
		orderedCandidates.push(...candidate.challenges);
	}
	if (
		core.candidateSetSha256 !== canonicalHash(orderedCandidates) ||
		evidence.collectionValidation.status !== 'failed' ||
		!Array.isArray(evidence.collectionValidation.issues) ||
		evidence.collectionValidation.issues.length === 0 ||
		!Array.isArray(core.collectionRemediations) ||
		core.collectionRemediations.length === 0
	) {
		throw new Error(
			'Replayed review-rebase B0 candidate set or expected collection failure is stale.'
		);
	}
	return {
		...evidence,
		repositoryRoot,
		manifestPath: manifestFile,
		basePlan,
		effectivePlan: evidence.plan,
		parentVerification,
		parentRepair,
		orderedCandidates
	};
}

function requireScienceChallengeReviewRebaseInfrastructureRecoveryEvidence({
	evidence,
	archiveClosure = null,
	parent,
	proposals = null
}) {
	if (
		evidence !== null &&
		evidence !== undefined &&
		archiveClosure !== null &&
		archiveClosure !== undefined
	) {
		throw new Error(
			'Live infrastructure-recovery evidence and an archive closure are mutually exclusive.'
		);
	}
	if (
		(evidence === null || evidence === undefined) &&
		(archiveClosure === null || archiveClosure === undefined)
	) {
		return null;
	}
	const repositoryRoot = requireRealDirectory(
		parent?.repositoryRoot,
		'review-rebase infrastructure-recovery repository root'
	);
	let terminal;
	let binding;
	let recoveryWorkspaceRoot = repositoryRoot;
	if (archiveClosure !== null && archiveClosure !== undefined) {
		const validation = validateScienceChallengeInfrastructureRecoveryArchiveClosure({
			closure: archiveClosure
		});
		if (validation.status !== 'passed') {
			throw new Error(
				`Review-rebase infrastructure-recovery archive closure is invalid:\n${validation.issues.join('\n')}`
			);
		}
		binding = archiveClosure.infrastructureRecovery;
		terminal = {
			status: 'passed',
			issues: [],
			recoveryId: archiveClosure.recoveryId,
			recoveryExecutionId: archiveClosure.recoveryExecutionId,
			manifest: archiveClosure.manifest,
			manifestSha256: archiveClosure.manifestSha256,
			failedRootInventorySha256: archiveClosure.failedRootInventorySha256,
			logicalLedger: archiveClosure.logicalLedger,
			logicalLedgerSha256: archiveClosure.logicalLedgerSha256,
			preservedProposalSetSha256: archiveClosure.preservedProposalSetSha256,
			finalProposals: archiveClosure.finalProposals,
			finalProposalSetSha256: archiveClosure.finalProposalSetSha256,
			finalProposalOriginCounts: archiveClosure.finalProposalOriginCounts,
			collectionProposalBindings: archiveClosure.collectionProposalBindings,
			collectionProposalSetSha256: archiveClosure.collectionProposalSetSha256,
			collectionPassSha256: archiveClosure.collectionPassSha256,
			contentNamespaceId: archiveClosure.contentNamespaceId,
			frozenShardIds: archiveClosure.frozenShardIds,
			pendingShardIds: archiveClosure.pendingShardIds,
			evidencePaths: archiveClosure.evidencePaths,
			evidencePathInventorySha256: archiveClosure.evidencePathInventorySha256,
			binding
		};
	} else {
		recoveryWorkspaceRoot =
			evidence?.workspaceRoot !== undefined
				? requireRealDirectory(
						evidence.workspaceRoot,
						'review-rebase infrastructure-recovery workspace root'
					)
				: repositoryRoot;
		terminal = inspectScienceChallengeReviewRebaseInfrastructureRecoveryTerminal({
			evidence,
			referenceRoot: recoveryWorkspaceRoot
		});
	}
	if (
		terminal?.status !== 'passed' ||
		!Array.isArray(terminal.finalProposals) ||
		terminal.finalProposals.length !== 49 ||
		!Array.isArray(terminal.frozenShardIds) ||
		terminal.frozenShardIds.length !== 2 ||
		terminal.finalProposalOriginCounts?.['preserved-source-proposal'] !== 10 ||
		terminal.finalProposalOriginCounts?.['recovery-invocation-proposal'] !== 39 ||
		terminal.pendingShardIds?.length !== 0
	) {
		throw new Error(
			`Review-rebase infrastructure recovery is not terminal:${
				terminal?.issues?.length ? `\n${terminal.issues.join('\n')}` : ''
			}`
		);
	}
	if (terminal.manifest?.reviewRebase?.manifestSha256 !== canonicalHash(parent.manifest)) {
		throw new Error('Review-rebase infrastructure recovery is bound to another B0 manifest.');
	}
	binding ??= buildScienceChallengeReviewRebaseInfrastructureRecoveryBinding({
		evidence: terminal,
		referenceRoot: recoveryWorkspaceRoot
	});
	validateScienceChallengeReviewRebaseInfrastructureRecoveryBinding(binding);
	const result = {
		evidence: evidence ?? null,
		terminal,
		binding,
		...(archiveClosure ? { archiveClosure } : {})
	};
	if (proposals !== null) {
		const issues = [];
		if (!Array.isArray(proposals)) {
			issues.push('Recovery-origin successor proposals must be an array.');
		} else {
			const proposalIds = proposals.map((proposal) => proposal?.shardId);
			if (
				new Set(proposalIds).size !== proposalIds.length ||
				proposals.length !== terminal.finalProposals.length
			) {
				issues.push(
					'Recovery-origin successor proposals must contain the exact terminal mutable shard set.'
				);
			}
			for (const proposal of proposals) {
				validateInfrastructureRecoveryTerminalProposal({
					infrastructureRecovery: result,
					shardId: proposal?.shardId,
					candidateSha256: proposal?.candidateSha256,
					validationSha256: proposal?.validationSha256,
					logicalContentOrdinal: proposal?.attempt,
					issues
				});
			}
		}
		if (issues.length > 0) {
			throw new Error(
				`Recovery-origin successor proposals differ from terminal replay:\n${issues.join('\n')}`
			);
		}
	}
	return result;
}

function validateInfrastructureRecoverySuccessorContext({
	infrastructureRecovery,
	reviewSummary,
	authority,
	objectiveId,
	executionId,
	issues = null
}) {
	const manifest = infrastructureRecovery.terminal.manifest;
	const verificationSha256 = canonicalHash(reviewSummary);
	const authoritySha256 = canonicalHash(authority);
	const exact =
		manifest.verification?.summarySha256 === verificationSha256 &&
		manifest.recoveryObjective?.verificationSha256 === verificationSha256 &&
		manifest.recoveryIdentity?.verificationSha256 === verificationSha256 &&
		manifest.verificationRepairAuthoritySha256 === authoritySha256 &&
		canonicalHash(manifest.verificationRepairAuthority) === authoritySha256 &&
		manifest.recoveryObjective?.authoritySha256 === authoritySha256 &&
		manifest.recoveryIdentity?.authoritySha256 === authoritySha256 &&
		manifest.originalExecutionIdentity?.objectiveId === objectiveId &&
		manifest.originalExecutionIdentity?.executionId === executionId &&
		manifest.recoveryObjective?.originalObjectiveId === objectiveId &&
		manifest.recoveryIdentity?.originalObjectiveId === objectiveId &&
		manifest.recoveryIdentity?.originalExecutionId === executionId &&
		manifest.globalLedger?.objectiveId === objectiveId &&
		manifest.globalLedger?.executionId === executionId;
	if (exact) return;
	const message =
		'Review-rebase infrastructure recovery differs from the exact V1, mutation authority or failed S1 execution identity.';
	if (Array.isArray(issues)) issues.push(message);
	else throw new Error(message);
}

function validateInfrastructureRecoveryTerminalShardSet({
	infrastructureRecovery,
	mutableShardIds,
	frozenShardIds,
	issues
}) {
	const terminalMutableShardIds = infrastructureRecovery.terminal.finalProposals
		.map((proposal) => proposal?.shardId)
		.sort();
	if (
		new Set(terminalMutableShardIds).size !== terminalMutableShardIds.length ||
		canonicalHash(terminalMutableShardIds) !== canonicalHash([...mutableShardIds].sort()) ||
		canonicalHash([...infrastructureRecovery.terminal.frozenShardIds].sort()) !==
			canonicalHash([...frozenShardIds].sort())
	) {
		issues.push(
			'Review-rebase infrastructure recovery mutable/frozen shard partition differs from B0 authority.'
		);
	}
}

function validateInfrastructureRecoveryTerminalProposal({
	infrastructureRecovery,
	shardId,
	candidateSha256,
	validationSha256,
	logicalContentOrdinal,
	issues
}) {
	const matching = infrastructureRecovery.terminal.finalProposals.filter(
		(proposal) => proposal?.shardId === shardId
	);
	if (matching.length !== 1) {
		issues.push(`${shardId ?? 'unknown shard'} is not a unique terminal recovery proposal.`);
		return;
	}
	const terminalProposal = matching[0];
	const terminalCandidateSha256 =
		terminalProposal.candidateSha256 ??
		terminalProposal.source?.candidateSha256 ??
		terminalProposal.proposal?.candidateSha256;
	const terminalValidationSha256 =
		terminalProposal.validationSha256 ??
		terminalProposal.source?.validationSha256 ??
		terminalProposal.proposal?.validationSha256;
	const terminalLogicalContentOrdinal =
		terminalProposal.logicalContentOrdinal ??
		terminalProposal.source?.logicalContentOrdinal ??
		terminalProposal.proposal?.logicalContentOrdinal;
	if (
		candidateSha256 !== terminalCandidateSha256 ||
		validationSha256 !== terminalValidationSha256 ||
		logicalContentOrdinal !== terminalLogicalContentOrdinal ||
		!Number.isInteger(logicalContentOrdinal) ||
		logicalContentOrdinal < 1 ||
		logicalContentOrdinal > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
	) {
		issues.push(`${shardId} proposal differs from its terminal logical recovery proposal.`);
	}
}

function readReviewRebaseInput(repositoryRoot, binding, label) {
	if (
		!isRecord(binding) ||
		!nonEmpty(binding.path) ||
		!HASH.test(String(binding.fileSha256 ?? '')) ||
		!HASH.test(String(binding.canonicalSha256 ?? ''))
	) {
		throw new Error(`${label} binding is invalid.`);
	}
	const file = requireContainedFile(
		repositoryRoot,
		path.resolve(repositoryRoot, binding.path),
		label
	);
	const bytes = readFileSync(file);
	const value = JSON.parse(bytes.toString('utf8'));
	if (sha256(bytes) !== binding.fileSha256 || canonicalHash(value) !== binding.canonicalSha256) {
		throw new Error(`${label} differs from its exact B0 input binding.`);
	}
	return value;
}

function reviewRebaseParentRecord(parent, authority) {
	return {
		kind: 'review-rebase',
		manifestPath: parent.manifestPathRelative,
		manifestSha256: canonicalHash(parent.manifest),
		rebaseId: parent.coreManifest.rebaseId,
		planSha256: parent.coreManifest.planSha256,
		candidateSetSha256: parent.coreManifest.candidateSetSha256,
		collectionValidationSha256: parent.coreManifest.collectionValidationSha256,
		collectionRemediationSetSha256: parent.coreManifest.collectionRemediationSetSha256,
		collectionRemediationTargetSetSha256: authority.collectionRemediationTargetSetSha256
	};
}

function reviewRebaseParentChain({
	parent,
	authority,
	firstVerificationSha256,
	objectiveId,
	executionId
}) {
	return {
		kind: 'review-rebase-successor',
		reviewRebaseManifestSha256: canonicalHash(parent.manifest),
		reviewRebaseId: parent.coreManifest.rebaseId,
		parentVerificationSha256: parent.coreManifest.parent.verificationSha256,
		parentRepairSha256: parent.coreManifest.parent.repairSha256,
		reviewRebasePlanSha256: parent.coreManifest.planSha256,
		reviewRebaseCandidateSetSha256: parent.coreManifest.candidateSetSha256,
		reviewRebaseCollectionValidationSha256: parent.coreManifest.collectionValidationSha256,
		reviewRebaseCollectionRemediationSetSha256: parent.coreManifest.collectionRemediationSetSha256,
		reviewRebaseCollectionRemediationTargetSetSha256:
			authority.collectionRemediationTargetSetSha256,
		firstVerificationSha256,
		mutableTargetSetSha256: authority.mutableChallengeSetSha256,
		successorObjectiveId: objectiveId,
		successorExecutionId: executionId
	};
}

function prepareScienceChallengeReviewRebaseSuccessor({
	root,
	directory,
	repairSha256,
	objectiveId,
	executionId,
	reviewSummary,
	parent,
	infrastructureRecovery,
	verificationRepairAuthority,
	proposals,
	validateCollectionCandidate
}) {
	const basePlan = parent.basePlan;
	const effectivePlan = parent.effectivePlan;
	const expectedIds = effectivePlan.rows.map((row) => row.id);
	const expectedShardIds = uniqueInOrder(effectivePlan.rows.map((row) => row.shard));
	const reviews = Array.isArray(reviewSummary?.reviews) ? reviewSummary.reviews : [];
	const reviewsById = new Map(reviews.map((review) => [review?.id, review]));
	const rejectedIds = expectedIds.filter((id) => reviewsById.get(id)?.accepted === false);
	const invalidReviewRows = reviews.flatMap((review) =>
		validateIndependentContentReviewRow(review).issues.map(
			(issue) => `${review?.id ?? 'unknown review'}: ${issue}`
		)
	);
	if (
		reviewSummary?.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
		reviewSummary.status !== 'failed' ||
		reviewSummary.planId !== effectivePlan.planId ||
		reviewSummary.planSha256 !== canonicalHash(effectivePlan) ||
		reviewSummary.basePlanSha256 !== canonicalHash(basePlan) ||
		reviewSummary.effectivePlanSha256 !== canonicalHash(effectivePlan) ||
		reviewSummary.sourceSnapshotSha256 !== parent.coreManifest.sourceSnapshotSha256 ||
		reviewSummary.curriculumEvidenceSha256 !== parent.coreManifest.curriculumEvidenceSha256 ||
		reviewSummary.candidateSetSha256 !== parent.coreManifest.candidateSetSha256 ||
		REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_VERIFICATION_FIELDS.some(
			(field) => reviewSummary[field] !== undefined
		) ||
		reviewSummary.reviewCount !== expectedIds.length ||
		reviews.length !== expectedIds.length ||
		reviewsById.size !== expectedIds.length ||
		expectedIds.some((id) => !reviewsById.has(id)) ||
		invalidReviewRows.length !== 0 ||
		reviewSummary.acceptedCount !== expectedIds.length - rejectedIds.length ||
		reviewSummary.rejectedCount !== rejectedIds.length ||
		!Array.isArray(reviewSummary.assignmentResults) ||
		reviewSummary.assignmentResults.length !== expectedShardIds.length ||
		reviewSummary.assignmentResults.some((result) => result?.status !== 'passed') ||
		!Array.isArray(reviewSummary.issues) ||
		reviewSummary.issues.length !== 0
	) {
		throw new Error(
			'Review-rebase successor requires one complete failed V1 review of the exact B0 cohort.'
		);
	}
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary: reviewSummary,
		reviewRebaseManifest: parent.manifest,
		suppliedAuthority: verificationRepairAuthority
	});
	const authorityValidation = validateScienceChallengeVerificationRepairAuthority({
		authority,
		verificationSummary: reviewSummary,
		reviewRebaseManifest: parent.manifest
	});
	if (authorityValidation.status !== 'passed') {
		throw new Error(
			`Review-rebase successor mutation authority is invalid:\n${authorityValidation.issues.join(
				'\n'
			)}`
		);
	}
	const mutableIds = new Set(authority.mutableChallengeIds);
	const mutableShardIds = new Set(
		effectivePlan.rows.filter((row) => mutableIds.has(row.id)).map((row) => row.shard)
	);
	const proposalByShard = new Map(
		(proposals ?? []).map((proposal) => [proposal?.shardId, proposal])
	);
	if (
		!Array.isArray(proposals) ||
		proposalByShard.size !== proposals.length ||
		proposalByShard.size !== mutableShardIds.size ||
		[...mutableShardIds].some((shardId) => !proposalByShard.has(shardId)) ||
		[...proposalByShard].some(([shardId]) => !mutableShardIds.has(shardId))
	) {
		throw new Error(
			'Review-rebase successor requires exactly one proposal for every mutable shard and no others.'
		);
	}

	const parentSelectionByShard = new Map(
		parent.coreManifest.selections.map((selection) => [selection.shardId, selection])
	);
	const candidateById = new Map();
	const candidateBatches = new Map();
	const attemptBudgetRows = [];
	const shardValues = [];
	const shards = expectedShardIds.map((shardId) => {
		const rows = effectivePlan.rows.filter((row) => row.shard === shardId);
		const priorCandidate = parent.candidateBatches.get(shardId);
		const priorValidation = parent.outputValidations.get(shardId);
		const parentSelection = parentSelectionByShard.get(shardId);
		if (!priorCandidate || !priorValidation || !parentSelection) {
			throw new Error(`${shardId} is missing from the authenticated review-rebase parent.`);
		}
		const proposal = proposalByShard.get(shardId) ?? null;
		let candidate;
		let validation;
		let disposition;
		let lineage;
		let currentObjectiveAttempts = 0;
		if (proposal) {
			const candidatePath = requireContainedFile(
				root,
				proposal.candidatePath,
				`${shardId} review-rebase successor proposal candidate`
			);
			const validationPath = requireContainedFile(
				root,
				proposal.validationPath,
				`${shardId} review-rebase successor proposal validation`
			);
			candidate = readJson(candidatePath);
			validation = readJson(validationPath);
			const targetedValidation = validateVerificationRepairCandidate({
				candidate,
				priorCandidate,
				rows,
				reviews: reviewsById,
				verificationRepairAuthority: authority
			});
			const shardMutableIds = rows.filter((row) => mutableIds.has(row.id)).map((row) => row.id);
			if (
				targetedValidation.status !== 'passed' ||
				proposal.candidateSha256 !== canonicalHash(candidate) ||
				proposal.validationSha256 !== canonicalHash(validation) ||
				proposal.expectedTargetCandidateSha256 !== canonicalHash(priorCandidate) ||
				proposal.expectedTargetValidationSha256 !== canonicalHash(priorValidation) ||
				validation.status !== 'passed' ||
				(validation.issues?.length ?? 0) !== 0 ||
				validation.candidateSha256 !== canonicalHash(candidate) ||
				!Number.isInteger(proposal.attempt) ||
				proposal.attempt < 1 ||
				proposal.attempt > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
				shardMutableIds.length === 0
			) {
				throw new Error(
					`${shardId} review-rebase successor proposal is stale or exceeds its exact mutable authority.${
						targetedValidation.issues.length ? ` ${targetedValidation.issues.join(' ')}` : ''
					}`
				);
			}
			currentObjectiveAttempts = proposal.attempt;
			disposition = 'successor-repair-proposal';
			lineage = {
				parentKind: 'review-rebase',
				parentSelectionSha256: canonicalHash(parentSelection),
				parentCandidateSha256: canonicalHash(priorCandidate),
				parentValidationSha256: canonicalHash(priorValidation),
				parentSourceCandidateSha256: parentSelection.source?.candidateSha256,
				parentSourceValidationSha256: parentSelection.source?.validationSha256,
				proposalSha256: canonicalHash(proposal),
				attempt: proposal.attempt,
				candidateSha256: canonicalHash(candidate),
				validationSha256: canonicalHash(validation),
				mutableIds: shardMutableIds,
				mutableIdsSha256: canonicalHash(shardMutableIds)
			};
		} else {
			candidate = structuredClone(priorCandidate);
			validation = structuredClone(priorValidation);
			disposition = 'successor-unchanged';
			lineage = {
				parentKind: 'review-rebase',
				parentSelectionSha256: canonicalHash(parentSelection),
				parentCandidateSha256: canonicalHash(candidate),
				parentValidationSha256: canonicalHash(validation),
				parentSourceCandidateSha256: parentSelection.source?.candidateSha256,
				parentSourceValidationSha256: parentSelection.source?.validationSha256
			};
		}
		attemptBudgetRows.push({
			shardId,
			predecessorObjectiveAttempts: 0,
			currentObjectiveAttempts
		});
		candidateBatches.set(shardId, candidate);
		for (const entry of candidate.challenges ?? []) {
			if (candidateById.has(entry?.definition?.id)) {
				throw new Error(`${entry?.definition?.id} appears in multiple successor shards.`);
			}
			candidateById.set(entry?.definition?.id, entry);
		}
		const finalCandidatePath = path.join(directory, 'shards', shardId, 'candidate.json');
		const finalValidationPath = path.join(directory, 'shards', shardId, 'validation.json');
		shardValues.push({ shardId, candidate, validation });
		return {
			shardId,
			disposition,
			planRowIndexes: effectivePlan.rows
				.map((row, index) => ({ row, index }))
				.filter(({ row }) => row.shard === shardId)
				.map(({ index }) => index),
			challengeIds: rows.map((row) => row.id),
			candidate: valueReference(root, finalCandidatePath, candidate),
			validation: valueReference(root, finalValidationPath, validation),
			lineage
		};
	});
	const candidateSet = expectedIds.map((id) => candidateById.get(id));
	if (candidateSet.some((candidate) => !candidate)) {
		throw new Error('Review-rebase successor candidate set is incomplete.');
	}
	const collectionValidation = validateCollectionCandidate({
		candidateSet: structuredClone(candidateSet),
		candidateBatches: new Map(
			[...candidateBatches].map(([shardId, batch]) => [shardId, structuredClone(batch)])
		),
		effectivePlan: structuredClone(effectivePlan)
	});
	if (
		collectionValidation?.status !== 'passed' ||
		(collectionValidation.issues?.length ?? 0) !== 0 ||
		collectionValidation.candidateCount !== candidateSet.length ||
		collectionValidation.candidateSetSha256 !== canonicalHash(candidateSet) ||
		collectionValidation.effectivePlanSha256 !== canonicalHash(effectivePlan)
	) {
		throw new Error(
			`Review-rebase successor collection validation failed:\n${(
				collectionValidation?.issues ?? []
			).join('\n')}`
		);
	}

	const parentRecord = reviewRebaseParentRecord(parent, authority);
	const parentChain = reviewRebaseParentChain({
		parent,
		authority,
		firstVerificationSha256: repairSha256,
		objectiveId,
		executionId
	});
	const manifestCore = {
		schemaVersion: SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SCHEMA,
		disposition: SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION,
		planId: effectivePlan.planId,
		repairSha256,
		objectiveId,
		executionId,
		firstReviewSha256: repairSha256,
		sourceSnapshotSha256: parent.coreManifest.sourceSnapshotSha256,
		curriculumEvidenceSha256: parent.coreManifest.curriculumEvidenceSha256,
		curriculumCatalogSha256: effectivePlan.curriculumCatalogSha256,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		plans: {
			base: valueReference(root, path.join(directory, 'base-plan.json'), basePlan),
			effective: valueReference(root, path.join(directory, 'effective-plan.json'), effectivePlan)
		},
		parent: parentRecord,
		parentChain,
		...(infrastructureRecovery
			? {
					infrastructureRecovery: structuredClone(infrastructureRecovery.binding)
				}
			: {}),
		review: {
			summary: valueReference(root, path.join(directory, 'review-summary.json'), reviewSummary),
			summarySha256: repairSha256,
			parentManifestSha256: parentRecord.manifestSha256,
			candidateSetSha256: reviewSummary.candidateSetSha256,
			rejectedIds,
			rejectedIdsSha256: canonicalHash(rejectedIds),
			mutableTargetIds: authority.mutableChallengeIds,
			mutableTargetSetSha256: authority.mutableChallengeSetSha256
		},
		verificationRepairAuthority: valueReference(
			root,
			path.join(directory, 'verification-repair-authority.json'),
			authority
		),
		verificationRepairAuthoritySha256: canonicalHash(authority),
		attemptBudget: {
			maxAttempts: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
			objectiveId,
			predecessorObjectiveId: null,
			parentKind: 'review-rebase',
			shards: attemptBudgetRows,
			shardsSha256: canonicalHash(attemptBudgetRows)
		},
		shardCount: shards.length,
		challengeCount: expectedIds.length,
		orderedChallengeIds: expectedIds,
		orderedChallengeIdsSha256: canonicalHash(expectedIds),
		candidateCount: candidateSet.length,
		candidateSetSha256: canonicalHash(candidateSet),
		remapCount: 0,
		remapManifestSetSha256: canonicalHash([]),
		difficultyAdjustmentCount: 0,
		difficultyAdjustmentManifestCount: 0,
		difficultyAdjustmentManifestSetSha256: canonicalHash([]),
		recoveryCount: 0,
		recoverySetSha256: canonicalHash([]),
		recoveryTargetSetSha256: canonicalHash([]),
		recoveryProjectionSha256: canonicalHash([]),
		collectionValidation: valueReference(
			root,
			path.join(directory, 'collection-validation.json'),
			collectionValidation
		),
		collectionValidationSha256: canonicalHash(collectionValidation),
		requiresFreshFullVerification: true,
		releaseEligible: false,
		shards
	};
	return {
		manifest: {
			...manifestCore,
			manifestCoreSha256: canonicalHash(manifestCore)
		},
		basePlan,
		effectivePlan,
		verificationRepairAuthority: authority,
		shardValues,
		candidateSet,
		candidateBatches,
		collectionValidation
	};
}

function validateSuccessorRecoveryTargets({ predecessor, candidateBatches, issues }) {
	for (const recovery of predecessor.recoveries ?? []) {
		const manifest = recovery?.manifest;
		const targets = manifest?.remap
			? [manifest.remap]
			: Array.isArray(manifest?.adjustments)
				? manifest.adjustments
				: manifest?.adjustment
					? [manifest.adjustment]
					: [];
		const priorBatch = predecessor.candidateBatches.get(manifest?.shardId);
		const currentBatch = candidateBatches.get(manifest?.shardId);
		for (const target of targets) {
			const prior = priorBatch?.challenges?.find(
				(entry) => entry?.definition?.id === target.challengeId
			);
			const current = currentBatch?.challenges?.find(
				(entry) => entry?.definition?.id === target.challengeId
			);
			if (
				!prior ||
				!current ||
				stableStringify(readNestedField(current, target.field)) !==
					stableStringify(readNestedField(prior, target.field))
			) {
				issues.push(
					`${target.challengeId} successor changed typed recovery field ${target.field}.`
				);
			}
		}
	}
}

function readNestedField(value, field) {
	return String(field)
		.split('.')
		.reduce((current, part) => current?.[part], value);
}

export function scienceChallengeEffectiveCohortAttemptBudgetByShard(effectiveCohort) {
	if (effectiveCohort?.status !== 'passed' || !Array.isArray(effectiveCohort?.manifest?.shards)) {
		throw new Error('Attempt-budget replay requires a validated effective cohort.');
	}
	if (
		effectiveCohort.manifest.disposition ===
		SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION
	) {
		const rows = effectiveCohort.manifest.attemptBudget?.shards;
		if (!Array.isArray(rows) || rows.length !== effectiveCohort.manifest.shards.length) {
			throw new Error('Effective-cohort successor attempt budget is incomplete.');
		}
		const byShard = new Map();
		for (const row of rows) {
			if (
				typeof row?.shardId !== 'string' ||
				!Number.isInteger(row.currentObjectiveAttempts) ||
				row.currentObjectiveAttempts < 0 ||
				row.currentObjectiveAttempts > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
				byShard.has(row.shardId)
			) {
				throw new Error('Effective-cohort successor attempt budget is invalid.');
			}
			byShard.set(row.shardId, row.currentObjectiveAttempts);
		}
		return byShard;
	}
	return new Map(
		effectiveCohort.manifest.shards.map((shard) => {
			const attempts =
				shard.disposition === 'ordinary-repair-proposal'
					? shard.lineage?.attempt
					: shard.disposition === 'descendant-remap' ||
						  shard.disposition === 'difficulty-plan-adjustment'
						? shard.lineage?.sourceAttempt
						: 0;
			if (
				!Number.isInteger(attempts) ||
				attempts < 0 ||
				attempts > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS
			) {
				throw new Error(`${shard.shardId} effective-cohort attempt lineage is invalid.`);
			}
			return [shard.shardId, attempts];
		})
	);
}

export function validateScienceChallengeReviewRebaseSuccessorLineage({
	effectiveCohort,
	reviewRebaseEvidence,
	reviewRebaseInfrastructureRecoveryEvidence = null,
	reviewRebaseInfrastructureRecoveryArchiveClosure = null
}) {
	try {
		if (
			effectiveCohort?.status !== 'passed' ||
			effectiveCohort?.manifest?.disposition !==
				SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SUCCESSOR_DISPOSITION ||
			!isRecord(effectiveCohort.manifest.parentChain)
		) {
			return failed(
				'A replayed effective-cohort successor with review-rebase ancestry is required.'
			);
		}
		const terminalParentChain = effectiveCohort.manifest.parentChain;
		const terminalInfrastructureRecovery = effectiveCohort.manifest.infrastructureRecovery ?? null;
		const descendantsNewestFirst = [];
		const seenManifestHashes = new Set();
		let rootSuccessor = effectiveCohort;
		while (rootSuccessor.manifest.parent?.kind !== 'review-rebase') {
			const cursorHash = canonicalHash(rootSuccessor.manifest);
			if (seenManifestHashes.has(cursorHash)) {
				return failed('Review-rebase successor ancestry contains a cycle.');
			}
			seenManifestHashes.add(cursorHash);
			const predecessor = rootSuccessor.predecessor;
			if (
				predecessor?.status !== 'passed' ||
				!isRecord(rootSuccessor.reviewSummary) ||
				canonicalHash(rootSuccessor.manifest.parentChain) !== canonicalHash(terminalParentChain) ||
				canonicalHash(rootSuccessor.manifest.infrastructureRecovery ?? null) !==
					canonicalHash(terminalInfrastructureRecovery) ||
				rootSuccessor.manifest.review?.summarySha256 !==
					canonicalHash(rootSuccessor.reviewSummary) ||
				rootSuccessor.reviewSummary.status !== 'failed' ||
				rootSuccessor.reviewSummary.effectiveCohortManifestSha256 !==
					canonicalHash(predecessor.manifest) ||
				rootSuccessor.manifest.review?.effectiveCohortManifestSha256 !==
					canonicalHash(predecessor.manifest) ||
				REVIEW_REBASE_VERIFICATION_FIELDS.some(
					(field) => rootSuccessor.reviewSummary[field] !== undefined
				) ||
				(terminalInfrastructureRecovery
					? rootSuccessor.reviewSummary.reviewRebaseInfrastructureRecoveryManifestSha256 !==
							terminalInfrastructureRecovery.manifestSha256 ||
						rootSuccessor.reviewSummary.reviewRebaseInfrastructureRecoveryId !==
							terminalInfrastructureRecovery.recoveryId
					: REVIEW_REBASE_INFRASTRUCTURE_RECOVERY_VERIFICATION_FIELDS.some(
							(field) => rootSuccessor.reviewSummary[field] !== undefined
						))
			) {
				return failed(
					'Inherited review-rebase successor ancestry or intermediate review binding is stale.'
				);
			}
			descendantsNewestFirst.push(rootSuccessor);
			rootSuccessor = predecessor;
		}
		if (seenManifestHashes.has(canonicalHash(rootSuccessor.manifest))) {
			return failed('Review-rebase successor ancestry contains a cycle.');
		}
		if (
			!isRecord(rootSuccessor.reviewSummary) ||
			!isRecord(rootSuccessor.verificationRepairAuthority)
		) {
			return failed('Review-rebase ancestry does not terminate at an authenticated S1 root.');
		}
		const parent = requireScienceChallengeReviewRebaseEvidence(reviewRebaseEvidence);
		const infrastructureRecovery =
			requireScienceChallengeReviewRebaseInfrastructureRecoveryEvidence({
				evidence: reviewRebaseInfrastructureRecoveryEvidence,
				archiveClosure: reviewRebaseInfrastructureRecoveryArchiveClosure,
				parent
			});
		const authority = buildScienceChallengeVerificationRepairAuthority({
			verificationSummary: rootSuccessor.reviewSummary,
			reviewRebaseManifest: parent.manifest,
			suppliedAuthority: rootSuccessor.verificationRepairAuthority
		});
		const expectedParent = reviewRebaseParentRecord(parent, authority);
		const expectedParentChain = reviewRebaseParentChain({
			parent,
			authority,
			firstVerificationSha256: canonicalHash(rootSuccessor.reviewSummary),
			objectiveId: rootSuccessor.manifest.objectiveId,
			executionId: rootSuccessor.manifest.executionId
		});
		if (
			canonicalHash(rootSuccessor.manifest.parent) !== canonicalHash(expectedParent) ||
			canonicalHash(rootSuccessor.manifest.parentChain) !== canonicalHash(expectedParentChain) ||
			canonicalHash(terminalParentChain) !== canonicalHash(expectedParentChain) ||
			rootSuccessor.manifest.verificationRepairAuthoritySha256 !== canonicalHash(authority) ||
			rootSuccessor.manifest.review?.summarySha256 !== canonicalHash(rootSuccessor.reviewSummary) ||
			rootSuccessor.manifest.review?.mutableTargetSetSha256 !==
				authority.mutableChallengeSetSha256 ||
			canonicalHash(rootSuccessor.manifest.review?.mutableTargetIds) !==
				canonicalHash(authority.mutableChallengeIds) ||
			(infrastructureRecovery
				? canonicalHash(rootSuccessor.manifest.infrastructureRecovery) !==
						canonicalHash(infrastructureRecovery.binding) ||
					canonicalHash(terminalInfrastructureRecovery) !==
						canonicalHash(infrastructureRecovery.binding)
				: rootSuccessor.manifest.infrastructureRecovery !== undefined ||
					terminalInfrastructureRecovery !== null)
		) {
			return failed('Review-rebase successor parent-chain projection is stale.');
		}
		const successorReviews = [...descendantsNewestFirst]
			.reverse()
			.map((cohort) => cohort.reviewSummary);
		const priorVerificationSha256s = [
			canonicalHash(rootSuccessor.reviewSummary),
			...successorReviews.map((review) => canonicalHash(review))
		];
		return {
			status: 'passed',
			issues: [],
			parentChain: expectedParentChain,
			parentChainSha256: canonicalHash(expectedParentChain),
			verificationRepairAuthority: authority,
			reviewRebaseEvidence: parent,
			...(infrastructureRecovery
				? {
						reviewRebaseInfrastructureRecoveryEvidence: infrastructureRecovery.evidence,
						infrastructureRecoveryTerminal: infrastructureRecovery.terminal
					}
				: {}),
			rootSuccessor,
			successorDepth: descendantsNewestFirst.length + 1,
			successorReviews,
			priorVerificationSha256s
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

function prepareEffectiveCohort({
	workspaceRoot,
	outputRoot,
	repairSha256,
	objectiveId,
	executionId,
	firstReviewSha256,
	basePlan,
	effectivePlan,
	sourceSnapshotSha256,
	curriculumEvidenceSha256,
	curriculumCatalogSha256,
	shardSelections,
	validateCollectionCandidate
}) {
	for (const [value, label] of [
		[repairSha256, 'repairSha256'],
		[objectiveId, 'objectiveId'],
		[executionId, 'executionId'],
		[firstReviewSha256, 'firstReviewSha256'],
		[sourceSnapshotSha256, 'sourceSnapshotSha256'],
		[curriculumEvidenceSha256, 'curriculumEvidenceSha256'],
		[curriculumCatalogSha256, 'curriculumCatalogSha256']
	]) {
		requireHash(value, `effective-cohort ${label}`);
	}
	if (canonicalHash(basePlan) === canonicalHash(effectivePlan)) {
		throw new Error('Review-pending effective cohort requires a changed effective plan.');
	}
	if (typeof validateCollectionCandidate !== 'function') {
		throw new Error('Effective-cohort staging requires the ordinary collection validator.');
	}
	const root = requireRealDirectory(outputRoot, 'effective-cohort output root');
	const workspace = requireRealDirectory(workspaceRoot, 'effective-cohort workspace root');
	if (!isWithin(workspace, root)) {
		throw new Error('Effective-cohort output root must remain within the workspace.');
	}
	const directory = path.join(
		root,
		path.basename(scienceChallengeEffectiveCohortDirectory({ outputRoot, repairSha256 }))
	);
	const orderedShardIds = uniqueInOrder(effectivePlan.rows.map((row) => row.shard));
	if (
		orderedShardIds.length !== EXPECTED_SHARD_COUNT ||
		effectivePlan.rows.length !== EXPECTED_CHALLENGE_COUNT
	) {
		throw new Error(
			`Effective-cohort plan must contain exactly ${EXPECTED_SHARD_COUNT} shards and ${EXPECTED_CHALLENGE_COUNT} challenges.`
		);
	}
	const selectionByShard = new Map(
		(shardSelections ?? []).map((selection) => [selection?.shardId, selection])
	);
	if (
		!Array.isArray(shardSelections) ||
		selectionByShard.size !== orderedShardIds.length ||
		shardSelections.length !== orderedShardIds.length
	) {
		throw new Error('Effective-cohort staging requires exactly one selection for every shard.');
	}
	const candidateById = new Map();
	const candidateBatches = new Map();
	const remapManifests = [];
	const difficultyAdjustmentManifests = [];
	const recoveryProjectionInputs = [];
	const shards = orderedShardIds.map((shardId) => {
		const selection = selectionByShard.get(shardId);
		if (!selection || !SHARD_DISPOSITIONS.has(selection.disposition)) {
			throw new Error(`${shardId} effective-cohort disposition is invalid.`);
		}
		const candidatePath = requireContainedFile(
			root,
			selection.candidatePath,
			`${shardId} candidate`
		);
		const validationPath = requireContainedFile(
			root,
			selection.validationPath,
			`${shardId} validation`
		);
		const candidate = readJson(candidatePath);
		const validation = readJson(validationPath);
		if (
			(selection.candidateSha256 && selection.candidateSha256 !== canonicalHash(candidate)) ||
			(selection.validationSha256 && selection.validationSha256 !== canonicalHash(validation))
		) {
			throw new Error(`${shardId} selected candidate or validation differs from its binding.`);
		}
		const rowRecords = effectivePlan.rows
			.map((row, planRowIndex) => ({ row, planRowIndex }))
			.filter(({ row }) => row.shard === shardId);
		const challengeIds = rowRecords.map(({ row }) => row.id);
		if (
			canonicalHash(candidate.challenges?.map((entry) => entry?.definition?.id)) !==
			canonicalHash(challengeIds)
		) {
			throw new Error(`${shardId} selected candidate order differs from the effective plan.`);
		}
		if (validation.candidateSha256 !== canonicalHash(candidate)) {
			throw new Error(`${shardId} selected validation does not bind its candidate.`);
		}
		const expectedStatus = isReviewPendingDisposition(selection.disposition)
			? 'review-pending'
			: 'passed';
		if (validation.status !== expectedStatus) {
			throw new Error(`${shardId} selected validation status must be ${expectedStatus}.`);
		}
		const lineage = buildSelectionLineage({
			selection,
			outputRoot: root,
			basePlan,
			effectivePlan,
			candidate,
			validation,
			repairSha256,
			firstReviewSha256,
			objectiveId,
			executionId,
			remapManifests,
			difficultyAdjustmentManifests,
			recoveryProjectionInputs
		});
		candidateBatches.set(shardId, candidate);
		for (const entry of candidate.challenges) {
			if (candidateById.has(entry.definition.id)) {
				throw new Error(`${entry.definition.id} appears in multiple selected shards.`);
			}
			candidateById.set(entry.definition.id, entry);
		}
		return {
			shardId,
			disposition: selection.disposition,
			planRowIndexes: rowRecords.map(({ planRowIndex }) => planRowIndex),
			challengeIds,
			candidate: fileReference(root, candidatePath),
			validation: fileReference(root, validationPath),
			lineage
		};
	});
	const orderedChallengeIds = effectivePlan.rows.map((row) => row.id);
	const candidateSet = orderedChallengeIds.map((id) => candidateById.get(id));
	if (candidateSet.some((entry) => !entry)) {
		throw new Error('Effective-cohort selection omits planned candidates.');
	}
	const recoveryProjection = projectScienceChallengeEffectiveRecoveryPlan(
		basePlan,
		recoveryProjectionInputs
	);
	if (
		recoveryProjection.status !== 'passed' ||
		recoveryProjection.effectivePlanSha256 !== canonicalHash(effectivePlan)
	) {
		throw new Error(
			`Effective-cohort plan differs from the exact combined typed recovery projection:\n${(
				recoveryProjection.issues ?? []
			).join('\n')}`
		);
	}
	const collectionValidation = validateCollectionCandidate({
		candidateSet: structuredClone(candidateSet),
		candidateBatches: new Map(
			[...candidateBatches].map(([shardId, batch]) => [shardId, structuredClone(batch)])
		),
		effectivePlan: structuredClone(effectivePlan)
	});
	if (
		collectionValidation?.status !== 'passed' ||
		(collectionValidation.issues?.length ?? 0) !== 0 ||
		collectionValidation.candidateCount !== candidateSet.length ||
		collectionValidation.candidateSetSha256 !== canonicalHash(candidateSet) ||
		collectionValidation.effectivePlanSha256 !== canonicalHash(effectivePlan)
	) {
		throw new Error(
			`Effective-cohort full collection validation failed:\n${(
				collectionValidation?.issues ?? []
			).join('\n')}`
		);
	}
	const basePlanPath = path.join(directory, 'base-plan.json');
	const effectivePlanPath = path.join(directory, 'effective-plan.json');
	const collectionValidationPath = path.join(directory, 'collection-validation.json');
	const manifestCore = {
		schemaVersion: SCIENCE_CHALLENGE_EFFECTIVE_COHORT_SCHEMA,
		disposition: SCIENCE_CHALLENGE_EFFECTIVE_COHORT_DISPOSITION,
		planId: effectivePlan.planId,
		repairSha256,
		objectiveId,
		executionId,
		firstReviewSha256,
		sourceSnapshotSha256,
		curriculumEvidenceSha256,
		curriculumCatalogSha256,
		basePlanSha256: canonicalHash(basePlan),
		effectivePlanSha256: canonicalHash(effectivePlan),
		plans: {
			base: valueReference(root, basePlanPath, basePlan),
			effective: valueReference(root, effectivePlanPath, effectivePlan)
		},
		shardCount: shards.length,
		challengeCount: orderedChallengeIds.length,
		orderedChallengeIds,
		orderedChallengeIdsSha256: canonicalHash(orderedChallengeIds),
		candidateCount: candidateSet.length,
		candidateSetSha256: canonicalHash(candidateSet),
		remapCount: remapManifests.length,
		remapManifestSetSha256: canonicalHash(remapManifests),
		difficultyAdjustmentCount: difficultyAdjustmentManifests.reduce(
			(total, adjustmentManifest) =>
				total +
				(adjustmentManifest.schemaVersion ===
				SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA
					? adjustmentManifest.adjustmentCount
					: 1),
			0
		),
		difficultyAdjustmentManifestCount: difficultyAdjustmentManifests.length,
		difficultyAdjustmentManifestSetSha256: canonicalHash(difficultyAdjustmentManifests),
		recoveryCount: recoveryProjection.recoveryCount,
		recoverySetSha256: canonicalHash(recoveryProjectionInputs),
		recoveryTargetSetSha256: canonicalHash(recoveryProjection.applied.map(recoveryTargetCore)),
		recoveryProjectionSha256: canonicalHash(recoveryProjection.applied),
		collectionValidation: valueReference(root, collectionValidationPath, collectionValidation),
		collectionValidationSha256: canonicalHash(collectionValidation),
		shards
	};
	const manifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	return {
		status: 'passed',
		issues: [],
		manifest,
		basePlan,
		effectivePlan,
		candidateSet,
		candidateBatches,
		candidateSetSha256: canonicalHash(candidateSet),
		collectionValidation,
		remapManifests,
		difficultyAdjustmentManifests,
		recoveries: recoveryProjectionInputs
	};
}

function buildSelectionLineage({
	selection,
	outputRoot,
	basePlan,
	effectivePlan,
	candidate,
	validation,
	repairSha256,
	firstReviewSha256,
	objectiveId,
	executionId,
	remapManifests,
	difficultyAdjustmentManifests,
	recoveryProjectionInputs
}) {
	if (selection.competingLineage === true) {
		throw new Error(`${selection.shardId} selected cohort has competing recovery lineage.`);
	}
	const declaredRecoveryLineages = [
		selection.proposal === undefined ? null : 'ordinary-repair-proposal',
		selection.remapManifestPath === undefined ? null : 'descendant-remap',
		selection.adjustmentManifestPath === undefined ? null : 'difficulty-plan-adjustment'
	].filter(Boolean);
	if (
		declaredRecoveryLineages.length > 1 ||
		(declaredRecoveryLineages.length === 1 && declaredRecoveryLineages[0] !== selection.disposition)
	) {
		throw new Error(`${selection.shardId} selected cohort declares competing recovery lineage.`);
	}
	if (selection.disposition === 'ordinary-repair-proposal') {
		if (
			!isRecord(selection.proposal) ||
			!Number.isInteger(selection.proposal.attempt) ||
			selection.proposal.attempt < 1 ||
			selection.proposal.attempt > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
			selection.proposal.candidateSha256 !== canonicalHash(candidate) ||
			selection.proposal.validationSha256 !== canonicalHash(validation)
		) {
			throw new Error(
				`${selection.shardId} ordinary proposal lineage does not bind the selected candidate and validation.`
			);
		}
		return {
			proposalSha256: canonicalHash(selection.proposal),
			attempt: selection.proposal.attempt,
			candidateSha256: selection.proposal.candidateSha256,
			validationSha256: selection.proposal.validationSha256,
			expectedTargetCandidateSha256: selection.proposal.expectedTargetCandidateSha256,
			expectedTargetValidationSha256: selection.proposal.expectedTargetValidationSha256,
			action: selection.action ?? 'verification-repair-staged'
		};
	}
	if (selection.disposition === 'unchanged-verified-fallback') {
		if (
			selection.firstReviewCandidateSha256 !== canonicalHash(candidate) ||
			selection.firstReviewValidationSha256 !== canonicalHash(validation)
		) {
			throw new Error(`${selection.shardId} fallback is not bound to the first review.`);
		}
		return {
			firstReviewCandidateSha256: selection.firstReviewCandidateSha256,
			firstReviewValidationSha256: selection.firstReviewValidationSha256
		};
	}
	const difficultyAdjustment = selection.disposition === 'difficulty-plan-adjustment';
	const manifestPath = requireContainedFile(
		outputRoot,
		difficultyAdjustment ? selection.adjustmentManifestPath : selection.remapManifestPath,
		`${selection.shardId} ${
			difficultyAdjustment ? 'difficulty-plan adjustment' : 'descendant-remap'
		} manifest`
	);
	const recoveryManifest = readJson(manifestPath);
	const difficultyAdjustmentSet =
		difficultyAdjustment &&
		recoveryManifest.schemaVersion === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA;
	const priorCandidatePath = requireContainedFile(
		outputRoot,
		selection.priorCandidatePath,
		`${selection.shardId} ${
			difficultyAdjustment ? 'difficulty-plan adjustment' : 'descendant-remap'
		} prior candidate`
	);
	const priorCandidate = readJson(priorCandidatePath);
	const recoveryValidation = difficultyAdjustment
		? difficultyAdjustmentSet
			? validateScienceChallengeDifficultyPlanAdjustmentSetManifest({
					manifest: recoveryManifest,
					plan: basePlan,
					priorCandidate,
					candidate
				})
			: validateScienceChallengeDifficultyPlanAdjustmentManifest({
					manifest: recoveryManifest,
					plan: basePlan,
					priorCandidate,
					candidate
				})
		: validateScienceChallengeDescendantRemapManifest({
				manifest: recoveryManifest,
				plan: basePlan,
				priorCandidate,
				candidate
			});
	const effectiveRowsMatch = difficultyAdjustmentSet
		? recoveryManifest.adjustments.every(
				(adjustment) =>
					canonicalHash(effectivePlan.rows[adjustment.basePlanRowIndex]) ===
					adjustment.effectivePlanRowSha256
			)
		: canonicalHash(effectivePlan.rows[recoveryManifest.base?.planRowIndex]) ===
			recoveryManifest.effective?.planRowSha256;
	if (
		recoveryValidation.status !== 'passed' ||
		recoveryManifest.shardId !== selection.shardId ||
		recoveryManifest.repairSha256 !== repairSha256 ||
		recoveryManifest.firstReview?.summarySha256 !== firstReviewSha256 ||
		(difficultyAdjustmentSet
			? recoveryManifest.objectiveId !== objectiveId || recoveryManifest.executionId !== executionId
			: (recoveryManifest.objectiveId !== undefined &&
					recoveryManifest.objectiveId !== objectiveId) ||
				(recoveryManifest.executionId !== undefined &&
					recoveryManifest.executionId !== executionId)) ||
		!effectiveRowsMatch ||
		recoveryManifest.sourceAttempt?.status !== 'failed' ||
		recoveryManifest.attemptBudget?.maxAttempts !== 4 ||
		recoveryManifest.attemptBudget?.exhausted !== true
	) {
		throw new Error(
			`${selection.shardId} ${
				difficultyAdjustment ? 'difficulty-plan adjustment' : 'descendant-remap'
			} lineage is invalid.${
				recoveryValidation.issues?.length ? ` ${recoveryValidation.issues.join(' ')}` : ''
			} The selected recovery must bind the effective cohort repair, first review and any embedded objective/execution identity.`
		);
	}
	if (difficultyAdjustment) difficultyAdjustmentManifests.push(recoveryManifest);
	else remapManifests.push(recoveryManifest);
	recoveryProjectionInputs.push({
		manifest: recoveryManifest,
		priorCandidate,
		candidate
	});
	return {
		manifest: fileReference(outputRoot, manifestPath),
		priorCandidate: fileReference(outputRoot, priorCandidatePath),
		...(difficultyAdjustmentSet
			? {
					adjustmentSetSha256: recoveryManifest.adjustmentSetSha256,
					adjustmentCount: recoveryManifest.adjustmentCount
				}
			: difficultyAdjustment
				? { adjustmentSha256: recoveryManifest.adjustmentSha256 }
				: { remapSha256: recoveryManifest.remapSha256 }),
		sourceAttempt: recoveryManifest.sourceAttempt.attempt,
		sourceAttemptStatus: recoveryManifest.sourceAttempt.status
	};
}

function validateShardLineage({
	shard,
	referenceRoot,
	basePlan,
	effectivePlan,
	candidate,
	validation,
	repairSha256,
	firstReviewSha256,
	objectiveId,
	executionId,
	remapManifests,
	difficultyAdjustmentManifests,
	recoveryProjectionInputs,
	issues
}) {
	if (!isRecord(shard.lineage)) {
		issues.push(`${shard.shardId} selected lineage is missing.`);
		return;
	}
	if (shard.disposition === 'ordinary-repair-proposal') {
		if (
			!HASH.test(String(shard.lineage.proposalSha256 ?? '')) ||
			!Number.isInteger(shard.lineage.attempt) ||
			shard.lineage.attempt < 1 ||
			shard.lineage.attempt > SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS ||
			shard.lineage.candidateSha256 !== canonicalHash(candidate) ||
			shard.lineage.validationSha256 !== canonicalHash(validation) ||
			!HASH.test(String(shard.lineage.expectedTargetCandidateSha256 ?? '')) ||
			!HASH.test(String(shard.lineage.expectedTargetValidationSha256 ?? ''))
		) {
			issues.push(`${shard.shardId} ordinary proposal lineage is invalid.`);
		}
		return;
	}
	if (shard.disposition === 'unchanged-verified-fallback') {
		if (
			shard.lineage.firstReviewCandidateSha256 !== canonicalHash(candidate) ||
			shard.lineage.firstReviewValidationSha256 !== canonicalHash(validation)
		) {
			issues.push(`${shard.shardId} unchanged fallback lineage is invalid.`);
		}
		return;
	}
	const difficultyAdjustment = shard.disposition === 'difficulty-plan-adjustment';
	try {
		const recoveryManifest = readBoundJsonReference(
			referenceRoot,
			shard.lineage.manifest,
			`${shard.shardId} ${
				difficultyAdjustment ? 'difficulty-plan adjustment' : 'descendant-remap'
			} manifest`
		);
		const priorCandidate = readBoundJsonReference(
			referenceRoot,
			shard.lineage.priorCandidate,
			`${shard.shardId} ${
				difficultyAdjustment ? 'difficulty-plan adjustment' : 'descendant-remap'
			} prior candidate`
		);
		const difficultyAdjustmentSet =
			difficultyAdjustment &&
			recoveryManifest.schemaVersion === SCIENCE_CHALLENGE_DIFFICULTY_PLAN_ADJUSTMENT_SET_SCHEMA;
		const recoveryValidation = difficultyAdjustment
			? difficultyAdjustmentSet
				? validateScienceChallengeDifficultyPlanAdjustmentSetManifest({
						manifest: recoveryManifest,
						plan: basePlan,
						priorCandidate,
						candidate
					})
				: validateScienceChallengeDifficultyPlanAdjustmentManifest({
						manifest: recoveryManifest,
						plan: basePlan,
						priorCandidate,
						candidate
					})
			: validateScienceChallengeDescendantRemapManifest({
					manifest: recoveryManifest,
					plan: basePlan,
					priorCandidate,
					candidate
				});
		const effectiveRowsMatch = difficultyAdjustmentSet
			? recoveryManifest.adjustments.every(
					(adjustment) =>
						canonicalHash(effectivePlan.rows[adjustment.basePlanRowIndex]) ===
						adjustment.effectivePlanRowSha256
				)
			: canonicalHash(effectivePlan.rows[recoveryManifest.base?.planRowIndex]) ===
				recoveryManifest.effective?.planRowSha256;
		if (
			recoveryValidation.status !== 'passed' ||
			recoveryManifest.shardId !== shard.shardId ||
			recoveryManifest.repairSha256 !== repairSha256 ||
			recoveryManifest.firstReview?.summarySha256 !== firstReviewSha256 ||
			(difficultyAdjustmentSet
				? recoveryManifest.objectiveId !== objectiveId ||
					recoveryManifest.executionId !== executionId
				: (recoveryManifest.objectiveId !== undefined &&
						recoveryManifest.objectiveId !== objectiveId) ||
					(recoveryManifest.executionId !== undefined &&
						recoveryManifest.executionId !== executionId)) ||
			!effectiveRowsMatch ||
			(difficultyAdjustmentSet
				? shard.lineage.adjustmentSetSha256 !== recoveryManifest.adjustmentSetSha256 ||
					shard.lineage.adjustmentCount !== recoveryManifest.adjustmentCount
				: difficultyAdjustment
					? shard.lineage.adjustmentSha256 !== recoveryManifest.adjustmentSha256
					: shard.lineage.remapSha256 !== recoveryManifest.remapSha256) ||
			shard.lineage.sourceAttempt !== recoveryManifest.sourceAttempt.attempt ||
			shard.lineage.sourceAttemptStatus !== 'failed'
		) {
			issues.push(
				`${shard.shardId} ${
					difficultyAdjustment ? 'difficulty-plan adjustment' : 'descendant-remap'
				} lineage is invalid.`
			);
		}
		if (difficultyAdjustment) difficultyAdjustmentManifests.push(recoveryManifest);
		else remapManifests.push(recoveryManifest);
		recoveryProjectionInputs.push({
			manifest: recoveryManifest,
			priorCandidate,
			candidate
		});
	} catch (error) {
		issues.push(errorMessage(error));
	}
}

function isReviewPendingDisposition(disposition) {
	return disposition === 'descendant-remap' || disposition === 'difficulty-plan-adjustment';
}

function fileReference(root, filePath) {
	const bytes = readFileSync(filePath);
	const value = JSON.parse(bytes.toString('utf8'));
	return {
		path: portableRelative(root, filePath),
		sha256: sha256(bytes),
		canonicalSha256: canonicalHash(value)
	};
}

function valueReference(root, finalPath, value) {
	const bytes = stableJsonBytes(value);
	return {
		path: portableRelative(root, finalPath),
		sha256: sha256(bytes),
		canonicalSha256: canonicalHash(value)
	};
}

function validateJsonReference(root, reference, expectedCanonicalSha256, label, issues) {
	try {
		const value = readBoundJsonReference(root, reference, label);
		if (canonicalHash(value) !== expectedCanonicalSha256) {
			issues.push(`${label} differs from its expected canonical hash.`);
		}
	} catch (error) {
		issues.push(errorMessage(error));
	}
}

function readBoundJsonReference(root, reference, label) {
	if (
		!isRecord(reference) ||
		!nonEmpty(reference.path) ||
		!HASH.test(String(reference.sha256 ?? '')) ||
		!HASH.test(String(reference.canonicalSha256 ?? ''))
	) {
		throw new Error(`${label} reference is invalid.`);
	}
	const filePath = requireContainedFile(root, path.resolve(root, reference.path), label);
	const bytes = readFileSync(filePath);
	const value = JSON.parse(bytes.toString('utf8'));
	if (sha256(bytes) !== reference.sha256 || canonicalHash(value) !== reference.canonicalSha256) {
		throw new Error(`${label} differs from its exact byte/canonical binding.`);
	}
	return value;
}

function requireContainedFile(root, filePath, label) {
	const resolvedRoot = realpathSync(path.resolve(root));
	const resolved = path.resolve(filePath);
	if (!existsSync(resolved)) {
		throw new Error(`${label} is missing or outside its exact artifact root.`);
	}
	const stats = lstatSync(resolved);
	if (stats.isSymbolicLink() || !stats.isFile()) {
		throw new Error(`${label} must be a regular non-symlink file.`);
	}
	const real = realpathSync(resolved);
	if (!isWithin(resolvedRoot, real)) {
		throw new Error(`${label} resolves outside its exact artifact root.`);
	}
	return real;
}

function requireRealDirectory(directory, label) {
	const resolved = path.resolve(directory);
	if (!existsSync(resolved)) {
		throw new Error(`${label} does not exist.`);
	}
	const stats = lstatSync(resolved);
	if (stats.isSymbolicLink() || !stats.isDirectory()) {
		throw new Error(`${label} must be a real directory.`);
	}
	return realpathSync(resolved);
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, stableJsonBytes(value), { flag: 'wx' });
}

function stableJsonBytes(value) {
	return Buffer.from(`${stableStringify(value)}\n`);
}

function portableRelative(root, filePath) {
	const relative = path.relative(path.resolve(root), path.resolve(filePath));
	if (
		!relative ||
		relative === '..' ||
		relative.startsWith(`..${path.sep}`) ||
		path.isAbsolute(relative)
	) {
		throw new Error('Effective-cohort artifact reference escapes its exact root.');
	}
	return relative.split(path.sep).join('/');
}

function uniqueInOrder(values) {
	const seen = new Set();
	const result = [];
	for (const value of values) {
		if (!nonEmpty(value) || seen.has(value)) continue;
		seen.add(value);
		result.push(value);
	}
	return result;
}

function recoveryTargetCore(value) {
	return {
		kind: value.kind,
		challengeId: value.challengeId,
		field: value.field,
		manifestSha256: value.manifestSha256
	};
}

function isWithin(root, target) {
	return target === root || target.startsWith(`${root}${path.sep}`);
}

function requireHash(value, label) {
	if (!HASH.test(String(value ?? ''))) throw new Error(`${label} is invalid.`);
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function failed(value) {
	return {
		status: 'failed',
		issues: Array.isArray(value) ? value : [value]
	};
}
