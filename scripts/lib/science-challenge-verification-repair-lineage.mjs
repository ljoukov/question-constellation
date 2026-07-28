import {
	existsSync,
	linkSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { canonicalHash, sha256, stableStringify } from './science-challenge-release.mjs';
import { validateScienceChallengeVerificationRepairAuthority } from './science-challenge-verification-repair-transaction.mjs';

export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_SCHEMA =
	'science-challenge-verification-repair-execution/v2';
export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_OBJECTIVE_SCHEMA =
	'science-challenge-verification-repair-objective/v1';
export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA =
	'science-challenge-verification-repair-execution-marker/v1';

const HASH = /^[a-f0-9]{64}$/;
const SAFE_SHARD = /^science-\d{3}$/;
const REPAIR_ATTEMPT_LIMIT = 4;
const OBJECTIVE_LEDGER_DIRECTORY = 'science-challenge-verification-repair-ledgers';
const OBJECTIVE_LOCK_DIRECTORY = '.objective.lock';
const OBJECTIVE_TRANSACTION_DIRECTORY = 'attempt-transactions';
const OBJECTIVE_EXECUTION_MARKER = 'execution.json';
const TYPED_REBASE_GENERATION_FIELDS = [
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'reviewRebaseCandidateSetSha256',
	'reviewRebaseCollectionValidationSha256',
	'reviewRebaseCollectionRemediationSetSha256',
	'reviewRebaseCollectionRemediations',
	'reviewRebaseCollectionRemediationTargetIds',
	'reviewRebaseCollectionRemediationTargetSetSha256',
	'verificationRepairAuthority',
	'verificationRepairAuthoritySha256',
	'verificationRepairParent',
	'verificationRepairMutableChallengeIds',
	'verificationRepairMutableChallengeSetSha256'
];
const VERIFICATION_REPAIR_AUTHORITY_FIELDS = [
	'collectionRemediationTargetIds',
	'collectionRemediationTargetSetSha256',
	'collectionRemediations',
	'independentRejectedChallengeIds',
	'independentRejectedChallengeSetSha256',
	'mutableChallengeIds',
	'mutableChallengeSetSha256',
	'parent',
	'schemaVersion'
].sort();
const VERIFICATION_REPAIR_AUTHORITY_PARENT_FIELDS = [
	'candidateSetSha256',
	'collectionRemediationSetSha256',
	'collectionRemediationTargetSetSha256',
	'collectionValidationSha256',
	'disposition',
	'manifestSha256',
	'planSha256',
	'rebaseId',
	'verificationSha256'
].sort();
const REVIEW_REBASE_REPAIR_PARENT_FIELDS = [
	'basePlanSha256',
	'candidateSetSha256',
	'collectionRemediationSetSha256',
	'collectionRemediationTargetIds',
	'collectionRemediationTargetSetSha256',
	'collectionRemediations',
	'collectionValidationSha256',
	'curriculumEvidenceSha256',
	'mutableChallengeIds',
	'mutableChallengeSetSha256',
	'planSha256',
	'reviewRebaseId',
	'reviewRebaseManifestPath',
	'reviewRebaseManifestSha256',
	'schemaVersion',
	'sourceOutputSetSha256',
	'sourceOutputs',
	'sourceSnapshotSha256',
	'verificationAssignmentIndexPath',
	'verificationAssignmentIndexSha256',
	'verificationRepairAuthority',
	'verificationRepairAuthoritySha256',
	'verificationSummaryPath',
	'verificationSummarySha256'
].sort();

export function scienceChallengeVerificationRepairObjectiveIdentity({
	planSha256,
	verificationSha256,
	priorCandidateSetSha256
}) {
	const objective = {
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_OBJECTIVE_SCHEMA,
		planSha256: requireHash(planSha256, 'plan SHA-256'),
		verificationSha256: requireHash(verificationSha256, 'verification SHA-256'),
		priorCandidateSetSha256: requireHash(priorCandidateSetSha256, 'prior candidate-set SHA-256')
	};
	return { ...objective, objectiveId: canonicalHash(objective) };
}

export function scienceChallengeVerificationRepairExecutionIdentity({
	planSha256,
	verificationSha256,
	priorCandidateSetSha256,
	model,
	transport,
	responseMode,
	thinkingLevel,
	directPartSize
}) {
	const objective = scienceChallengeVerificationRepairObjectiveIdentity({
		planSha256,
		verificationSha256,
		priorCandidateSetSha256
	});
	const policy = {
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_SCHEMA,
		planSha256: objective.planSha256,
		verificationSha256: objective.verificationSha256,
		priorCandidateSetSha256: objective.priorCandidateSetSha256,
		objectiveId: objective.objectiveId,
		model: requireText(model, 'model'),
		transport: requireText(transport, 'transport'),
		responseMode: responseMode === null ? null : requireText(responseMode, 'response mode'),
		thinkingLevel: requireText(thinkingLevel, 'thinking level'),
		directPartSize:
			directPartSize === null ? null : requirePositiveInteger(directPartSize, 'direct part size')
	};
	return { ...policy, executionId: canonicalHash(policy) };
}

export function requireMatchingVerificationRepairExecutionIdentity({
	expected,
	actual,
	label = 'Verification-repair execution identity'
}) {
	validateExecutionIdentity(expected);
	validateExecutionIdentity(actual);
	if (canonicalHash(expected) !== canonicalHash(actual)) {
		throw new Error(`${label} differs from its immutable execution identity.`);
	}
	return actual;
}

export function verificationRepairExecutionLedgerRoot(workspaceRoot, objectiveId) {
	requireHash(objectiveId, 'repair objective id');
	return path.join(path.resolve(workspaceRoot), 'tmp', OBJECTIVE_LEDGER_DIRECTORY, objectiveId);
}

export function initializeVerificationRepairExecutionLedger({ ledgerRoot, identity }) {
	validateExecutionIdentity(identity);
	const resolvedRoot = path.resolve(ledgerRoot);
	mkdirSync(resolvedRoot, { recursive: true });
	const metadataPath = path.join(resolvedRoot, 'objective.json');
	const objective = objectiveFromExecutionIdentity(identity);
	const bytes = Buffer.from(`${stableStringify(objective)}\n`);
	if (existsSync(metadataPath)) {
		if (!readFileSync(metadataPath).equals(bytes)) {
			throw new Error('Verification-repair objective ledger identity differs.');
		}
	} else {
		writeImmutableFile(metadataPath, bytes);
	}
	return { ledgerRoot: resolvedRoot, metadataPath, objective };
}

export function bindVerificationRepairExecutionMarker({
	workspaceRoot,
	ledgerRoot,
	identity,
	outputRoot
}) {
	const initialized = initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	const marker = verificationRepairExecutionMarker({
		workspaceRoot,
		ledgerRoot: initialized.ledgerRoot,
		identity,
		outputRoot
	});
	const markerPath = path.join(initialized.ledgerRoot, OBJECTIVE_EXECUTION_MARKER);
	writeImmutableFile(markerPath, Buffer.from(`${stableStringify(marker)}\n`));
	return readVerificationRepairExecutionMarker({
		workspaceRoot,
		ledgerRoot: initialized.ledgerRoot,
		identity
	});
}

export function readVerificationRepairExecutionMarker({
	workspaceRoot,
	ledgerRoot,
	identity = null
}) {
	if (identity) validateExecutionIdentity(identity);
	const resolvedLedgerRoot = path.resolve(ledgerRoot);
	const markerPath = path.join(resolvedLedgerRoot, OBJECTIVE_EXECUTION_MARKER);
	if (!existsSync(markerPath)) return null;
	const markerBytes = readFileSync(markerPath);
	const marker = JSON.parse(markerBytes.toString('utf8'));
	if (!markerBytes.equals(Buffer.from(`${stableStringify(marker)}\n`))) {
		throw new Error('Verification-repair execution marker bytes are not canonical.');
	}
	const expectedFields = [
		'executionId',
		'executionIdentity',
		'executionIdentitySha256',
		'objectiveId',
		'outputRootBindingSha256',
		'outputRootRelativePath',
		'schemaVersion'
	].sort();
	if (
		!jsonRecord(marker) ||
		canonicalHash(Object.keys(marker).sort()) !== canonicalHash(expectedFields) ||
		marker.schemaVersion !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA
	) {
		throw new Error('Verification-repair execution marker schema is invalid.');
	}
	validateExecutionIdentity(marker.executionIdentity);
	const markerIdentity = marker.executionIdentity;
	requirePortableRelativeEvidencePath(
		marker.outputRootRelativePath,
		'Verification-repair execution marker outputRootRelativePath'
	);
	const binding = {
		kind: 'repository-relative',
		path: marker.outputRootRelativePath
	};
	if (
		marker.objectiveId !== markerIdentity.objectiveId ||
		marker.executionId !== markerIdentity.executionId ||
		marker.executionIdentitySha256 !== canonicalHash(markerIdentity) ||
		marker.outputRootBindingSha256 !== canonicalHash(binding) ||
		(identity && canonicalHash(markerIdentity) !== canonicalHash(identity))
	) {
		throw new Error('Verification-repair execution marker binding is invalid.');
	}
	const workspace = requireCanonicalExecutionMarkerDirectory(
		workspaceRoot,
		'Execution-marker workspace root'
	);
	const expectedLedgerRoot = path.join(
		workspace,
		'tmp',
		OBJECTIVE_LEDGER_DIRECTORY,
		marker.objectiveId
	);
	if (
		requireCanonicalExecutionMarkerDirectory(
			resolvedLedgerRoot,
			'Execution-marker objective ledger'
		) !== expectedLedgerRoot
	) {
		throw new Error('Verification-repair execution marker is outside its objective ledger.');
	}
	const objectivePath = path.join(resolvedLedgerRoot, 'objective.json');
	const objective = objectiveFromExecutionIdentity(markerIdentity);
	if (
		!existsSync(objectivePath) ||
		!readFileSync(objectivePath).equals(Buffer.from(`${stableStringify(objective)}\n`))
	) {
		throw new Error('Verification-repair execution marker objective differs.');
	}
	const outputRoot = path.resolve(workspace, ...marker.outputRootRelativePath.split('/'));
	if (
		requireCanonicalExecutionMarkerDirectory(outputRoot, 'Execution-marker output root') !==
		outputRoot
	) {
		throw new Error('Verification-repair execution marker output root is aliased.');
	}
	return { marker, markerPath, outputRoot };
}

export function inspectVerificationRepairExecutionAttempts({ ledgerRoot, identity, shardId }) {
	validateExecutionIdentity(identity);
	requireShardId(shardId);
	const metadataPath = path.join(path.resolve(ledgerRoot), 'objective.json');
	if (!existsSync(metadataPath)) {
		return { attempts: [], nextAttempt: 1, exhausted: false, initialized: false };
	}
	const objective = objectiveFromExecutionIdentity(identity);
	if (canonicalHash(readJson(metadataPath)) !== canonicalHash(objective)) {
		throw new Error('Verification-repair objective ledger identity was changed.');
	}
	const shardRoot = path.join(path.resolve(ledgerRoot), 'shards', shardId);
	const attempts = existsSync(shardRoot)
		? readdirSync(shardRoot, { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && !entry.name.startsWith('.claim-preparing-'))
				.map((entry) => {
					const match = entry.name.match(/^attempt-(\d{2})$/);
					if (!match) {
						throw new Error(`Malformed global repair-attempt directory ${entry.name}.`);
					}
					const attempt = Number(match[1]);
					const claimPath = path.join(shardRoot, entry.name, 'claim.json');
					if (!existsSync(claimPath)) {
						throw new Error(`${shardId} global repair attempt ${attempt} has no claim.`);
					}
					const claim = readJson(claimPath);
					validateClaim({ claim, objective, shardId, attempt });
					return { attempt, path: path.dirname(claimPath), claim };
				})
				.sort((left, right) => left.attempt - right.attempt)
		: [];
	for (const [index, record] of attempts.entries()) {
		if (record.attempt !== index + 1) {
			throw new Error(`${shardId} global repair attempts are not contiguous from 1.`);
		}
	}
	return {
		attempts,
		nextAttempt: attempts.length + 1,
		exhausted: attempts.length >= REPAIR_ATTEMPT_LIMIT,
		initialized: true
	};
}

export function requireMatchingVerificationRepairAttemptLedgers({
	localAttempts,
	globalAttempts,
	shardId,
	outputRoot
}) {
	const local = localAttempts.map((row) => row.attempt);
	const global = globalAttempts.map((row) => row.attempt);
	if (canonicalHash(local) !== canonicalHash(global)) {
		throw new Error(
			`${shardId} local repair attempts differ from the workspace objective ledger; cloning cannot reset the attempt budget.`
		);
	}
	const outputRootSha256 = canonicalHash(path.resolve(requireText(outputRoot, 'output root')));
	for (const record of globalAttempts) {
		if (record.claim?.outputRootSha256 !== outputRootSha256) {
			throw new Error(
				`${shardId} global repair attempt ${record.attempt} belongs to another output root; cloned repair roots are not supported.`
			);
		}
	}
}

export function claimVerificationRepairExecutionAttempt({
	ledgerRoot,
	identity,
	shardId,
	attempt,
	outputRoot
}) {
	requireShardId(shardId);
	requirePositiveInteger(attempt, 'repair attempt');
	const initialized = initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	return withObjectiveLedgerLock(initialized.ledgerRoot, () =>
		claimVerificationRepairExecutionAttemptUnlocked({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			shardId,
			attempt,
			outputRoot
		})
	);
}

export function claimVerificationRepairAttemptPair({
	ledgerRoot,
	identity,
	shardId,
	attempt,
	outputRoot
}) {
	requireShardId(shardId);
	requirePositiveInteger(attempt, 'repair attempt');
	const initialized = initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	const resolvedOutputRoot = path.resolve(outputRoot);
	return withObjectiveLedgerLock(initialized.ledgerRoot, () => {
		reconcileAttemptTransactionsUnlocked({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			outputRoot: resolvedOutputRoot
		});
		const localAttempts = inspectLocalVerificationRepairAttempts({
			outputRoot: resolvedOutputRoot,
			identity,
			shardId
		});
		const global = inspectVerificationRepairExecutionAttempts({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			shardId
		});
		requireMatchingVerificationRepairAttemptLedgers({
			localAttempts,
			globalAttempts: global.attempts,
			shardId,
			outputRoot: resolvedOutputRoot
		});
		if (global.exhausted) {
			throw new Error('Global verification-repair attempt budget is exhausted.');
		}
		if (attempt !== global.nextAttempt) {
			throw new Error(
				`Global verification-repair attempt ${attempt} is not the next attempt ${global.nextAttempt}.`
			);
		}
		const transaction = attemptTransaction({
			identity,
			shardId,
			attempt,
			outputRoot: resolvedOutputRoot
		});
		const transactionPath = attemptTransactionPath(initialized.ledgerRoot, shardId, attempt);
		writeImmutableFile(transactionPath, Buffer.from(`${stableStringify(transaction)}\n`));
		const claimed = claimVerificationRepairExecutionAttemptUnlocked({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			shardId,
			attempt,
			outputRoot: resolvedOutputRoot
		});
		const attemptDir = localAttemptPath(resolvedOutputRoot, identity, shardId, attempt);
		mkdirSync(path.dirname(attemptDir), { recursive: true });
		if (!existsSync(attemptDir)) mkdirSync(attemptDir);
		commitAttemptTransaction(transactionPath, transaction);
		return { ...claimed, attemptDir };
	});
}

export function reconcileVerificationRepairAttemptTransactions({
	ledgerRoot,
	identity,
	outputRoot
}) {
	const initialized = initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	return withObjectiveLedgerLock(initialized.ledgerRoot, () =>
		reconcileAttemptTransactionsUnlocked({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			outputRoot: path.resolve(outputRoot)
		})
	);
}

function claimVerificationRepairExecutionAttemptUnlocked({
	ledgerRoot,
	identity,
	shardId,
	attempt,
	outputRoot
}) {
	const ledger = inspectVerificationRepairExecutionAttempts({
		ledgerRoot,
		identity,
		shardId
	});
	if (ledger.exhausted) throw new Error('Global verification-repair attempt budget is exhausted.');
	if (attempt !== ledger.nextAttempt) {
		throw new Error(
			`Global verification-repair attempt ${attempt} is not the next attempt ${ledger.nextAttempt}.`
		);
	}
	const attemptRoot = path.join(
		path.resolve(ledgerRoot),
		'shards',
		shardId,
		`attempt-${String(attempt).padStart(2, '0')}`
	);
	const claim = {
		schemaVersion: 'science-challenge-verification-repair-attempt-claim/v2',
		objectiveId: identity.objectiveId,
		executionId: identity.executionId,
		policy: executionPolicyFromIdentity(identity),
		policySha256: canonicalHash(executionPolicyFromIdentity(identity)),
		shardId,
		attempt,
		outputRootSha256: canonicalHash(path.resolve(outputRoot))
	};
	writeAtomicClaimDirectory(attemptRoot, claim);
	return { attemptRoot, claim };
}

export function inspectVerificationRepairGenerationEvidence({
	generationRoot,
	terminalEffectiveCohortManifestPath = null
}) {
	const resolved = path.resolve(generationRoot);
	const effectiveCohortObjectiveChain = terminalEffectiveCohortManifestPath
		? readEffectiveCohortObjectiveChain({
				generationRoot: resolved,
				terminalManifestPath: terminalEffectiveCohortManifestPath
			})
		: null;
	const summaryPaths = existsSync(resolved)
		? readdirSync(resolved, { withFileTypes: true })
				.filter(
					(entry) =>
						entry.isFile() && /^verification-repair-[a-f0-9]{12}-summary\.json$/.test(entry.name)
				)
				.map((entry) => path.join(resolved, entry.name))
				.sort()
		: [];
	const identities = [];
	const authorityByObjectiveId = new Map();
	for (const summaryPath of summaryPaths) {
		const summary = readJson(summaryPath);
		validateExecutionIdentity(summary?.verificationRepairExecutionIdentity);
		const identity = summary.verificationRepairExecutionIdentity;
		const verificationRepairAuthority = requireGenerationSummaryRepairAuthority({
			summary,
			identity,
			label: path.basename(summaryPath)
		});
		const filenameVerificationPrefix = path
			.basename(summaryPath)
			.match(/^verification-repair-([a-f0-9]{12})-summary\.json$/)?.[1];
		const committedOrdinaryRepair =
			summary.status === 'passed' && summary.publication?.journal?.status === 'committed';
		const frozenReviewPendingRepair =
			summary.status === 'review-pending' &&
			summary.publication === null &&
			Number.isSafeInteger(summary.reviewPendingCount) &&
			summary.reviewPendingCount > 0 &&
			summary.effectiveCohort !== null &&
			typeof summary.effectiveCohort === 'object' &&
			!Array.isArray(summary.effectiveCohort) &&
			HASH.test(String(summary.effectiveCohort.manifestSha256 ?? '')) &&
			HASH.test(String(summary.effectiveCohort.candidateSetSha256 ?? ''));
		if (
			summary.schemaVersion !== 'science-challenge-generation-summary/v1' ||
			(!committedOrdinaryRepair && !frozenReviewPendingRepair) ||
			summary.verificationRepairSha256 !== identity.verificationSha256 ||
			summary.planSha256 !== identity.planSha256 ||
			filenameVerificationPrefix !== identity.verificationSha256.slice(0, 12)
		) {
			throw new Error(
				'Verification-repair generation summary is not a committed objective-bound successor.'
			);
		}
		if (verificationRepairAuthority) {
			authorityByObjectiveId.set(identity.objectiveId, verificationRepairAuthority);
		}
		identities.push(identity);
	}
	const repairArtifacts = [];
	for (const shardId of sortedDirectories(path.join(resolved, 'shards'))) {
		const shardRoot = path.join(resolved, 'shards', shardId);
		for (const entry of readdirSync(shardRoot, { withFileTypes: true })) {
			if (
				(entry.isDirectory() &&
					/^verification-repair-[a-f0-9]{12}(?:-attempt-\d{2})?$/.test(entry.name)) ||
				(entry.isFile() &&
					/^verification-repair-[a-f0-9]{12}-prompt-attempt-\d+\.txt$/.test(entry.name))
			) {
				repairArtifacts.push(path.join(shardRoot, entry.name));
			}
		}
	}
	const required = summaryPaths.length > 0 || repairArtifacts.length > 0;
	if (!required) {
		return {
			required: false,
			identity: null,
			objectiveId: null,
			verificationRepairAuthority: null,
			summaryPaths: [],
			repairArtifacts: []
		};
	}
	if (identities.length === 0) {
		throw new Error(
			'Generation root contains verification-repair evidence but no objective-bound generation summary.'
		);
	}
	const objectiveIds = [...new Set(identities.map((identity) => identity.objectiveId))];
	if (!effectiveCohortObjectiveChain && objectiveIds.length !== 1) {
		throw new Error('Generation root contains multiple verification-repair objectives.');
	}
	if (effectiveCohortObjectiveChain) {
		const allowedByObjective = new Map(
			effectiveCohortObjectiveChain.map((identity) => [identity.objectiveId, identity])
		);
		if (
			identities.length !== allowedByObjective.size ||
			identities.some((identity) => {
				const allowed = allowedByObjective.get(identity.objectiveId);
				return (
					!allowed ||
					allowed.executionId !== identity.executionId ||
					allowed.verificationSha256 !== identity.verificationSha256
				);
			})
		) {
			throw new Error(
				'Generation verification-repair objectives differ from the effective-cohort predecessor chain.'
			);
		}
	}
	const identity = effectiveCohortObjectiveChain
		? identities.find(
				(candidate) => candidate.objectiveId === effectiveCohortObjectiveChain[0].objectiveId
			)
		: identities.at(-1);
	if (!identity) {
		throw new Error('Terminal effective cohort has no matching verification-repair summary.');
	}
	const allowedPrefixes = new Set(
		(effectiveCohortObjectiveChain ?? [identity]).map((entry) =>
			entry.verificationSha256.slice(0, 12)
		)
	);
	if (
		repairArtifacts.some((artifact) => {
			const match = path.basename(artifact).match(/^verification-repair-([a-f0-9]{12})/);
			return !allowedPrefixes.has(match?.[1]);
		})
	) {
		throw new Error('Generation repair artifacts differ from their objective verification hash.');
	}
	return {
		required: true,
		identity,
		objectiveId: identity.objectiveId,
		verificationRepairAuthority: authorityByObjectiveId.get(identity.objectiveId) ?? null,
		summaryPaths,
		repairArtifacts
	};
}

function requireGenerationSummaryRepairAuthority({ summary, identity, label }) {
	const presentTypedFields = TYPED_REBASE_GENERATION_FIELDS.filter(
		(field) => summary?.[field] !== undefined
	);
	if (presentTypedFields.length === 0) {
		if (summary?.verificationRepairParent !== undefined) {
			throw new Error(`${label} has a verification-repair parent without typed authority.`);
		}
		return null;
	}
	const missing = TYPED_REBASE_GENERATION_FIELDS.filter((field) => summary?.[field] === undefined);
	if (missing.length > 0) {
		throw new Error(
			`${label} has partial typed verification-repair authority; missing ${missing.join(', ')}.`
		);
	}
	const authority = summary.verificationRepairAuthority;
	requireCanonicalVerificationRepairAuthorityShape(authority, label);
	const validation = validateScienceChallengeVerificationRepairAuthority({ authority });
	if (validation.status !== 'passed') {
		throw new Error(
			`${label} verification-repair authority is invalid:\n${validation.issues.join('\n')}`
		);
	}
	if (summary.verificationRepairAuthoritySha256 !== canonicalHash(authority)) {
		throw new Error(`${label} verification-repair authority hash is stale.`);
	}
	if (
		authority.parent.verificationSha256 !== identity.verificationSha256 ||
		authority.parent.verificationSha256 !== summary.verificationRepairSha256 ||
		authority.parent.planSha256 !== identity.planSha256 ||
		authority.parent.planSha256 !== summary.planSha256 ||
		authority.parent.candidateSetSha256 !== identity.priorCandidateSetSha256
	) {
		throw new Error(
			`${label} verification-repair authority differs from its fresh objective identity.`
		);
	}
	const scalarBindings = [
		['reviewRebaseManifestSha256', authority.parent.manifestSha256],
		['reviewRebaseId', authority.parent.rebaseId],
		['reviewRebaseCandidateSetSha256', authority.parent.candidateSetSha256],
		['reviewRebaseCollectionValidationSha256', authority.parent.collectionValidationSha256],
		['reviewRebaseCollectionRemediationSetSha256', authority.parent.collectionRemediationSetSha256],
		[
			'reviewRebaseCollectionRemediationTargetSetSha256',
			authority.parent.collectionRemediationTargetSetSha256
		],
		['verificationRepairMutableChallengeSetSha256', authority.mutableChallengeSetSha256]
	];
	for (const [field, expected] of scalarBindings) {
		if (summary[field] !== expected) {
			throw new Error(`${label} ${field} differs from its verification-repair authority.`);
		}
	}
	for (const [field, expected] of [
		['reviewRebaseCollectionRemediations', authority.collectionRemediations],
		['reviewRebaseCollectionRemediationTargetIds', authority.collectionRemediationTargetIds],
		['verificationRepairMutableChallengeIds', authority.mutableChallengeIds]
	]) {
		if (canonicalHash(summary[field]) !== canonicalHash(expected)) {
			throw new Error(`${label} ${field} differs from its verification-repair authority.`);
		}
	}
	requireReviewRebaseRepairParentBinding({
		parent: summary.verificationRepairParent,
		authority,
		identity,
		label
	});
	return authority;
}

function requireCanonicalVerificationRepairAuthorityShape(authority, label) {
	if (
		!jsonRecord(authority) ||
		canonicalHash(Object.keys(authority).sort()) !==
			canonicalHash(VERIFICATION_REPAIR_AUTHORITY_FIELDS) ||
		!jsonRecord(authority.parent) ||
		canonicalHash(Object.keys(authority.parent).sort()) !==
			canonicalHash(VERIFICATION_REPAIR_AUTHORITY_PARENT_FIELDS)
	) {
		throw new Error(`${label} verification-repair authority shape is not canonical.`);
	}
}

function requireReviewRebaseRepairParentBinding({ parent, authority, identity, label }) {
	if (
		!jsonRecord(parent) ||
		parent.schemaVersion !== 'science-challenge-review-rebase-repair-parent/v1' ||
		canonicalHash(Object.keys(parent).sort()) !== canonicalHash(REVIEW_REBASE_REPAIR_PARENT_FIELDS)
	) {
		throw new Error(`${label} verificationRepairParent shape is not canonical.`);
	}
	for (const field of [
		'basePlanSha256',
		'planSha256',
		'sourceSnapshotSha256',
		'curriculumEvidenceSha256',
		'candidateSetSha256',
		'collectionValidationSha256',
		'collectionRemediationSetSha256',
		'collectionRemediationTargetSetSha256',
		'verificationSummarySha256',
		'verificationAssignmentIndexSha256',
		'verificationRepairAuthoritySha256',
		'mutableChallengeSetSha256',
		'sourceOutputSetSha256',
		'reviewRebaseManifestSha256',
		'reviewRebaseId'
	]) {
		if (!HASH.test(String(parent[field] ?? ''))) {
			throw new Error(`${label} verificationRepairParent.${field} must be a SHA-256.`);
		}
	}
	for (const field of [
		'reviewRebaseManifestPath',
		'verificationSummaryPath',
		'verificationAssignmentIndexPath'
	]) {
		requirePortableRelativeEvidencePath(
			parent[field],
			`${label} verificationRepairParent.${field}`
		);
	}
	if (
		parent.reviewRebaseManifestSha256 !== authority.parent.manifestSha256 ||
		parent.reviewRebaseId !== authority.parent.rebaseId ||
		parent.planSha256 !== authority.parent.planSha256 ||
		parent.planSha256 !== identity.planSha256 ||
		parent.candidateSetSha256 !== authority.parent.candidateSetSha256 ||
		parent.candidateSetSha256 !== identity.priorCandidateSetSha256 ||
		parent.collectionValidationSha256 !== authority.parent.collectionValidationSha256 ||
		parent.collectionRemediationSetSha256 !== authority.parent.collectionRemediationSetSha256 ||
		parent.collectionRemediationTargetSetSha256 !==
			authority.parent.collectionRemediationTargetSetSha256 ||
		parent.verificationSummarySha256 !== authority.parent.verificationSha256 ||
		parent.verificationSummarySha256 !== identity.verificationSha256 ||
		parent.verificationRepairAuthoritySha256 !== canonicalHash(authority) ||
		parent.mutableChallengeSetSha256 !== authority.mutableChallengeSetSha256 ||
		canonicalHash(parent.verificationRepairAuthority) !== canonicalHash(authority) ||
		canonicalHash(parent.collectionRemediations) !==
			canonicalHash(authority.collectionRemediations) ||
		canonicalHash(parent.collectionRemediationTargetIds) !==
			canonicalHash(authority.collectionRemediationTargetIds) ||
		canonicalHash(parent.mutableChallengeIds) !== canonicalHash(authority.mutableChallengeIds)
	) {
		throw new Error(
			`${label} verificationRepairParent differs from its complete verification-repair authority.`
		);
	}
	if (
		!Array.isArray(parent.sourceOutputs) ||
		parent.sourceOutputs.length === 0 ||
		parent.sourceOutputSetSha256 !== canonicalHash(parent.sourceOutputs)
	) {
		throw new Error(`${label} verificationRepairParent source-output set is stale.`);
	}
	const shardIds = [];
	for (const output of parent.sourceOutputs) {
		if (!jsonRecord(output) || !SAFE_SHARD.test(String(output.shardId ?? ''))) {
			throw new Error(`${label} verificationRepairParent has an invalid source-output shard.`);
		}
		shardIds.push(output.shardId);
		for (const kind of ['candidate', 'validation']) {
			const binding = output[kind];
			if (
				!jsonRecord(binding) ||
				!HASH.test(String(binding.fileSha256 ?? '')) ||
				!HASH.test(String(binding.canonicalSha256 ?? ''))
			) {
				throw new Error(
					`${label} verificationRepairParent ${output.shardId}.${kind} binding is invalid.`
				);
			}
			requirePortableRelativeEvidencePath(
				binding.path,
				`${label} verificationRepairParent ${output.shardId}.${kind}.path`
			);
		}
	}
	const sortedShardIds = [...shardIds].sort();
	if (
		new Set(shardIds).size !== shardIds.length ||
		canonicalHash(shardIds) !== canonicalHash(sortedShardIds)
	) {
		throw new Error(
			`${label} verificationRepairParent source outputs must be unique and shard-sorted.`
		);
	}
}

function requirePortableRelativeEvidencePath(value, label) {
	if (
		typeof value !== 'string' ||
		!value.trim() ||
		path.isAbsolute(value) ||
		value.includes('\\') ||
		value.includes('\0')
	) {
		throw new Error(`${label} must be a portable relative path.`);
	}
	const normalized = path.posix.normalize(value);
	if (
		normalized !== value ||
		normalized === '.' ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		normalized.split('/').some((part) => !part || part === '.' || part === '..')
	) {
		throw new Error(`${label} must be a normalized portable relative path.`);
	}
}

function readEffectiveCohortObjectiveChain({ generationRoot, terminalManifestPath }) {
	const root = realpathSync(generationRoot);
	let cursor = safeExistingFileWithinRoot(
		terminalManifestPath,
		root,
		'terminal effective-cohort manifest'
	);
	const chain = [];
	const seen = new Set();
	while (cursor) {
		const manifest = readJson(cursor);
		const manifestSha256 = canonicalHash(manifest);
		if (seen.has(manifestSha256)) {
			throw new Error('Effective-cohort predecessor chain contains a cycle.');
		}
		seen.add(manifestSha256);
		for (const [value, label] of [
			[manifest.effectivePlanSha256, 'effective plan'],
			[manifest.repairSha256, 'repair'],
			[
				manifest.predecessor?.candidateSetSha256 ?? manifest.candidateSetSha256,
				'prior candidate set'
			],
			[manifest.objectiveId, 'objective'],
			[manifest.executionId, 'execution']
		]) {
			if (!HASH.test(String(value ?? ''))) {
				throw new Error(`Effective-cohort ${label} identity is invalid.`);
			}
		}
		chain.push({
			planSha256: manifest.effectivePlanSha256,
			verificationSha256: manifest.repairSha256,
			priorCandidateSetSha256:
				manifest.predecessor?.candidateSetSha256 ?? manifest.candidateSetSha256,
			objectiveId: manifest.objectiveId,
			executionId: manifest.executionId
		});
		if (!manifest.predecessor) break;
		const predecessorPath = safeExistingFileWithinRoot(
			path.resolve(root, manifest.predecessor.manifest?.path ?? ''),
			root,
			'effective-cohort predecessor manifest'
		);
		const predecessor = readJson(predecessorPath);
		if (
			canonicalHash(predecessor) !== manifest.predecessor.manifestCanonicalSha256 ||
			sha256(readFileSync(predecessorPath)) !== manifest.predecessor.manifest?.sha256
		) {
			throw new Error('Effective-cohort predecessor reference differs from its bound bytes.');
		}
		cursor = predecessorPath;
	}
	return chain;
}

function validateExecutionIdentity(identity) {
	if (
		!identity ||
		identity.schemaVersion !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_SCHEMA
	) {
		throw new Error('Verification-repair execution identity schema is invalid.');
	}
	const rebuilt = scienceChallengeVerificationRepairExecutionIdentity(identity);
	if (canonicalHash(rebuilt) !== canonicalHash(identity)) {
		throw new Error('Verification-repair execution identity is not canonical.');
	}
}

function objectiveFromExecutionIdentity(identity) {
	validateExecutionIdentityShape(identity);
	return scienceChallengeVerificationRepairObjectiveIdentity(identity);
}

function verificationRepairExecutionMarker({ workspaceRoot, ledgerRoot, identity, outputRoot }) {
	validateExecutionIdentity(identity);
	const workspace = requireCanonicalExecutionMarkerDirectory(
		workspaceRoot,
		'Execution-marker workspace root'
	);
	const canonicalLedgerRoot = requireCanonicalExecutionMarkerDirectory(
		ledgerRoot,
		'Execution-marker objective ledger'
	);
	const expectedLedgerRoot = path.join(
		workspace,
		'tmp',
		OBJECTIVE_LEDGER_DIRECTORY,
		identity.objectiveId
	);
	if (canonicalLedgerRoot !== expectedLedgerRoot) {
		throw new Error('Verification-repair execution marker is outside its objective ledger.');
	}
	const canonicalOutputRoot = requireCanonicalExecutionMarkerDirectory(
		outputRoot,
		'Execution-marker output root'
	);
	const relative = path.relative(workspace, canonicalOutputRoot);
	if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) {
		throw new Error(
			'Verification-repair execution marker output root must be inside its linked worktree.'
		);
	}
	const outputRootRelativePath = relative.split(path.sep).join('/');
	requirePortableRelativeEvidencePath(
		outputRootRelativePath,
		'Verification-repair execution marker outputRootRelativePath'
	);
	const binding = {
		kind: 'repository-relative',
		path: outputRootRelativePath
	};
	return {
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA,
		executionIdentity: structuredClone(identity),
		executionIdentitySha256: canonicalHash(identity),
		objectiveId: identity.objectiveId,
		executionId: identity.executionId,
		outputRootRelativePath,
		outputRootBindingSha256: canonicalHash(binding)
	};
}

function requireCanonicalExecutionMarkerDirectory(directory, label) {
	const resolved = path.resolve(requireText(directory, label));
	if (!existsSync(resolved)) throw new Error(`${label} does not exist.`);
	const entry = lstatSync(resolved);
	if (entry.isSymbolicLink() || !entry.isDirectory()) {
		throw new Error(`${label} must be a real directory.`);
	}
	return realpathSync(resolved);
}

function executionPolicyFromIdentity(identity) {
	return {
		schemaVersion: 'science-challenge-verification-repair-attempt-policy/v1',
		objectiveId: identity.objectiveId,
		executionId: identity.executionId,
		model: identity.model,
		transport: identity.transport,
		responseMode: identity.responseMode,
		thinkingLevel: identity.thinkingLevel,
		directPartSize: identity.directPartSize
	};
}

function validateExecutionIdentityShape(identity) {
	if (
		!identity ||
		identity.schemaVersion !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_SCHEMA
	) {
		throw new Error('Verification-repair execution identity schema is invalid.');
	}
}

function validateClaim({ claim, objective, shardId, attempt }) {
	const policy = claim?.policy;
	const rebuiltIdentity =
		policy &&
		scienceChallengeVerificationRepairExecutionIdentity({
			...objective,
			...policy
		});
	if (
		claim?.schemaVersion !== 'science-challenge-verification-repair-attempt-claim/v2' ||
		claim.objectiveId !== objective.objectiveId ||
		policy?.schemaVersion !== 'science-challenge-verification-repair-attempt-policy/v1' ||
		policy?.objectiveId !== objective.objectiveId ||
		policy?.executionId !== claim.executionId ||
		rebuiltIdentity?.executionId !== claim.executionId ||
		claim.policySha256 !== canonicalHash(policy) ||
		claim.shardId !== shardId ||
		claim.attempt !== attempt ||
		!HASH.test(String(claim.outputRootSha256 ?? ''))
	) {
		throw new Error(`${shardId} global repair attempt ${attempt} claim is invalid.`);
	}
}

function safeExistingFileWithinRoot(filePath, root, label) {
	const resolvedRoot = realpathSync(path.resolve(root));
	const resolved = realpathSync(path.resolve(filePath));
	if (!resolved.startsWith(`${resolvedRoot}${path.sep}`) || !statSync(resolved).isFile()) {
		throw new Error(`${label} is missing, unsafe or not a regular file.`);
	}
	return resolved;
}

function inspectLocalVerificationRepairAttempts({ outputRoot, identity, shardId }) {
	const shardRoot = path.join(path.resolve(outputRoot), 'shards', shardId);
	const attempts = sortedDirectories(shardRoot)
		.map((name) => {
			const match = name.match(/^verification-repair-([a-f0-9]{12})-attempt-(\d{2})$/);
			if (!match) return null;
			if (match[1] !== identity.verificationSha256.slice(0, 12)) {
				return null;
			}
			return {
				name,
				attempt: Number(match[2]),
				path: path.join(shardRoot, name)
			};
		})
		.filter(Boolean)
		.sort((left, right) => left.attempt - right.attempt);
	for (const [index, record] of attempts.entries()) {
		if (record.attempt !== index + 1) {
			throw new Error(`${shardId} local repair attempts are not contiguous from 1.`);
		}
		if (record.attempt > REPAIR_ATTEMPT_LIMIT) {
			throw new Error(
				`${shardId} local repair attempt ${record.attempt} exceeds the immutable ${REPAIR_ATTEMPT_LIMIT}-attempt ceiling.`
			);
		}
	}
	return attempts;
}

function localAttemptPath(outputRoot, identity, shardId, attempt) {
	return path.join(
		path.resolve(outputRoot),
		'shards',
		shardId,
		`verification-repair-${identity.verificationSha256.slice(0, 12)}-attempt-${String(
			attempt
		).padStart(2, '0')}`
	);
}

function attemptTransaction({ identity, shardId, attempt, outputRoot }) {
	return {
		schemaVersion: 'science-challenge-verification-repair-attempt-transaction/v1',
		status: 'preparing',
		objectiveId: identity.objectiveId,
		executionIdentity: identity,
		shardId,
		attempt,
		outputRootPath: path.resolve(outputRoot),
		outputRootSha256: canonicalHash(path.resolve(outputRoot))
	};
}

function attemptTransactionPath(ledgerRoot, shardId, attempt) {
	return path.join(
		path.resolve(ledgerRoot),
		OBJECTIVE_TRANSACTION_DIRECTORY,
		`${shardId}-attempt-${String(attempt).padStart(2, '0')}.json`
	);
}

function commitAttemptTransaction(transactionPath, transaction) {
	atomicWriteFile(
		transactionPath,
		Buffer.from(
			`${stableStringify({
				...transaction,
				status: 'committed'
			})}\n`
		)
	);
}

function reconcileAttemptTransactionsUnlocked({ ledgerRoot, identity, outputRoot }) {
	const transactionRoot = path.join(path.resolve(ledgerRoot), OBJECTIVE_TRANSACTION_DIRECTORY);
	if (!existsSync(transactionRoot)) return [];
	const reconciled = [];
	for (const name of readdirSync(transactionRoot).sort()) {
		if (name.startsWith('.immutable-') || name.startsWith('.temporary-')) continue;
		if (!name.endsWith('.json')) {
			throw new Error(`Malformed objective attempt transaction ${name}.`);
		}
		const transactionPath = path.join(transactionRoot, name);
		const transaction = readJson(transactionPath);
		validateAttemptTransaction(transaction, identity);
		if (transaction.outputRootSha256 !== canonicalHash(path.resolve(outputRoot))) continue;
		const global = inspectVerificationRepairExecutionAttempts({
			ledgerRoot,
			identity: transaction.executionIdentity,
			shardId: transaction.shardId
		});
		const existing = global.attempts.find((record) => record.attempt === transaction.attempt);
		if (!existing) {
			claimVerificationRepairExecutionAttemptUnlocked({
				ledgerRoot,
				identity: transaction.executionIdentity,
				shardId: transaction.shardId,
				attempt: transaction.attempt,
				outputRoot: transaction.outputRootPath
			});
		}
		const attemptDir = localAttemptPath(
			transaction.outputRootPath,
			transaction.executionIdentity,
			transaction.shardId,
			transaction.attempt
		);
		if (transaction.status === 'committed' && !existsSync(attemptDir)) {
			throw new Error(
				`${transaction.shardId} committed attempt ${transaction.attempt} local evidence was removed.`
			);
		}
		if (!existsSync(attemptDir)) {
			mkdirSync(path.dirname(attemptDir), { recursive: true });
			mkdirSync(attemptDir);
		}
		if (transaction.status === 'preparing') {
			commitAttemptTransaction(transactionPath, transaction);
			reconciled.push({ shardId: transaction.shardId, attempt: transaction.attempt });
		}
	}
	return reconciled;
}

function validateAttemptTransaction(transaction, identity) {
	if (
		transaction?.schemaVersion !== 'science-challenge-verification-repair-attempt-transaction/v1' ||
		!['preparing', 'committed'].includes(transaction.status) ||
		transaction.objectiveId !== identity.objectiveId ||
		transaction.outputRootSha256 !==
			canonicalHash(path.resolve(transaction.outputRootPath ?? '')) ||
		!SAFE_SHARD.test(String(transaction.shardId ?? '')) ||
		!Number.isInteger(transaction.attempt) ||
		transaction.attempt < 1 ||
		transaction.attempt > REPAIR_ATTEMPT_LIMIT
	) {
		throw new Error('Verification-repair attempt transaction is invalid.');
	}
	validateExecutionIdentity(transaction.executionIdentity);
	if (transaction.executionIdentity.objectiveId !== identity.objectiveId) {
		throw new Error('Verification-repair attempt transaction targets another objective.');
	}
}

function writeAtomicClaimDirectory(attemptRoot, claim) {
	if (existsSync(attemptRoot)) {
		const claimPath = path.join(attemptRoot, 'claim.json');
		if (!existsSync(claimPath) || canonicalHash(readJson(claimPath)) !== canonicalHash(claim)) {
			throw new Error(`Immutable global repair-attempt claim differs at ${attemptRoot}.`);
		}
		return;
	}
	mkdirSync(path.dirname(attemptRoot), { recursive: true });
	const staging = path.join(
		path.dirname(attemptRoot),
		`.claim-preparing-${path.basename(attemptRoot)}-${process.pid}-${Date.now()}-${Math.random()
			.toString(16)
			.slice(2)}`
	);
	mkdirSync(staging);
	try {
		writeFileSync(path.join(staging, 'claim.json'), `${stableStringify(claim)}\n`, { flag: 'wx' });
		renameSync(staging, attemptRoot);
	} finally {
		if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
	}
}

function writeImmutableFile(filePath, bytes) {
	const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes));
	if (existsSync(filePath)) {
		if (!readFileSync(filePath).equals(buffer)) {
			throw new Error(`Immutable verification-repair evidence differs at ${filePath}.`);
		}
		return;
	}
	mkdirSync(path.dirname(filePath), { recursive: true });
	const temporaryPath = path.join(
		path.dirname(filePath),
		`.immutable-${path.basename(filePath)}-${process.pid}-${Date.now()}-${Math.random()
			.toString(16)
			.slice(2)}`
	);
	writeFileSync(temporaryPath, buffer, { flag: 'wx' });
	try {
		linkSync(temporaryPath, filePath);
	} catch (error) {
		if (error?.code !== 'EEXIST' || !readFileSync(filePath).equals(buffer)) throw error;
	} finally {
		if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
	}
}

function atomicWriteFile(filePath, bytes) {
	const temporaryPath = path.join(
		path.dirname(filePath),
		`.temporary-${path.basename(filePath)}-${process.pid}-${Date.now()}-${Math.random()
			.toString(16)
			.slice(2)}`
	);
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(temporaryPath, bytes, { flag: 'wx' });
	renameSync(temporaryPath, filePath);
}

function withObjectiveLedgerLock(ledgerRoot, callback) {
	const lockPath = path.join(path.resolve(ledgerRoot), OBJECTIVE_LOCK_DIRECTORY);
	const owner = acquireDirectoryLock(lockPath);
	try {
		return callback();
	} finally {
		releaseDirectoryLock(lockPath, owner);
	}
}

function acquireDirectoryLock(lockPath) {
	mkdirSync(path.dirname(lockPath), { recursive: true });
	const owner = {
		schemaVersion: 'science-challenge-exclusive-lock/v1',
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
			const existing = readLockOwner(lockPath);
			if (existing ? processIsAlive(existing.pid) : lockIsFresh(lockPath)) {
				throw new Error('Verification-repair objective ledger is locked by another process.', {
					cause: error
				});
			}
			const stalePath = `${lockPath}.stale-${process.pid}-${Date.now()}`;
			renameSync(lockPath, stalePath);
			rmSync(stalePath, { recursive: true, force: true });
		}
	}
	throw new Error('Could not acquire verification-repair objective ledger lock.');
}

function releaseDirectoryLock(lockPath, owner) {
	const existing = readLockOwner(lockPath);
	if (!existing || existing.token !== owner.token) {
		throw new Error('Verification-repair objective lock ownership changed.');
	}
	rmSync(lockPath, { recursive: true, force: true });
}

function readLockOwner(lockPath) {
	const ownerPath = path.join(lockPath, 'owner.json');
	if (!existsSync(ownerPath)) return null;
	try {
		return readJson(ownerPath);
	} catch {
		return null;
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

function lockIsFresh(lockPath) {
	try {
		return Date.now() - statSync(lockPath).mtimeMs < 30_000;
	} catch {
		return true;
	}
}

function sortedDirectories(directory) {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort();
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function jsonRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireHash(value, label) {
	if (!HASH.test(String(value ?? ''))) throw new Error(`${label} is invalid.`);
	return value;
}

function requireText(value, label) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid.`);
	return value;
}

function requirePositiveInteger(value, label) {
	if (!Number.isInteger(value) || value < 1) throw new Error(`${label} is invalid.`);
	return value;
}

function requireShardId(value) {
	if (!SAFE_SHARD.test(String(value ?? ''))) throw new Error('Repair shard id is invalid.');
}
