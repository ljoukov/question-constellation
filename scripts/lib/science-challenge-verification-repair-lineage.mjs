import { createHash } from 'node:crypto';
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

import {
	SCIENCE_CHALLENGE_CODEX_SDK_TRANSPORT,
	SCIENCE_CHALLENGE_CODEX_SDK_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_JSON_MODEL,
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
} from './science-challenge-authoring-transport.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	sha256,
	stableStringify,
	validateChallengePlan,
	validateIndependentContentReviewRow
} from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN
} from './science-challenge-direct-preflight.mjs';
import { requireContentVerificationEvidence } from './science-challenge-review-evidence.mjs';
import {
	buildScienceChallengeVerificationRepairAuthority,
	validateScienceChallengeVerificationRepairAuthority
} from './science-challenge-verification-repair-transaction.mjs';

export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_SCHEMA =
	'science-challenge-verification-repair-execution/v2';
export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_OBJECTIVE_SCHEMA =
	'science-challenge-verification-repair-objective/v1';
export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_EXECUTION_MARKER_SCHEMA =
	'science-challenge-verification-repair-execution-marker/v1';
export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_RECOVERY_SCHEMA =
	'science-challenge-verification-repair-recovery/v2';
export const SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MULTIPART_INVOCATION_SCHEMA =
	'science-challenge-verification-repair-multipart-invocation-start/v1';

const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const SAFE_SHARD = /^science-\d{3}$/;
const REPAIR_ATTEMPT_LIMIT = 4;
const OBJECTIVE_LEDGER_DIRECTORY = 'science-challenge-verification-repair-ledgers';
const OBJECTIVE_LOCK_DIRECTORY = '.objective.lock';
const OBJECTIVE_TRANSACTION_DIRECTORY = 'attempt-transactions';
const OBJECTIVE_EXECUTION_MARKER = 'execution.json';
const RECOVERY_TRANSACTION_DIRECTORY = 'recovery-transactions';
const MULTIPART_CONTINUATION_DIRECTORY = 'multipart-continuation-parts';
const LOCAL_INFRASTRUCTURE_ERROR =
	/^(?:fetch failed(?:\s*:\s*(?:getaddrinfo\s+)?ENOTFOUND\s+[A-Za-z0-9._-]+)?|(?:getaddrinfo\s+)?ENOTFOUND\s+[A-Za-z0-9._-]+|failed to initialize in-process app-server(?::\s*.*(?:Operation not permitted|EPERM).*)?)$/i;
const CODEX_LOCAL_INFRASTRUCTURE_ERROR =
	'Codex Exec exited with code 1: WARNING: proceeding, even though we could not create PATH aliases: Operation not permitted (os error 1)\n' +
	'Reading prompt from stdin...\n' +
	'Error: failed to initialize in-process app-server client: Operation not permitted (os error 1)\n';
const VALIDATION_ONLY_PRE_DISPATCH_FIELDS = [
	'candidateSha256',
	'directPartSize',
	'inputSha256',
	'issues',
	'model',
	'modelVersion',
	'modelVersions',
	'normalizationVersion',
	'priorCandidateSha256',
	'promptSha256',
	'promptVersion',
	'provider',
	'rawCandidateSha256',
	'runSummarySha256',
	'status',
	'thinkingLevel',
	'transport',
	'transportError',
	'transportVersion',
	'verificationRepairCohortIssues',
	'verificationRepairSha256'
].sort();
const STANDARD_MODEL_ARTIFACT_FIELDS = new Set([
	'agentMessages',
	'blocked',
	'candidateSha256',
	'commandActions',
	'costUsd',
	'eventLogSha256',
	'eventLogPath',
	'events',
	'failedCommandActions',
	'failedCommands',
	'fileChanges',
	'finalJsonEvents',
	'finalResponseSha256',
	'hostedTools',
	'lastMessageFileSha256',
	'localResponseSchemaSha256',
	'mergedCandidateSha256',
	'mergedResponseSchemaSha256',
	'model',
	'modelEvents',
	'modelVersion',
	'modelVersions',
	'provider',
	'providerSchemaApplied',
	'rawCandidateSha256',
	'rawOutputSha256',
	'rawOutputPath',
	'reasoningSummaries',
	'responseDeltas',
	'responseMode',
	'responseSchemaSha256',
	'resultMetadataSha256',
	'threadId',
	'thoughtDeltas',
	'thinkingLevel',
	'thoughtsSha256',
	'thoughtsPath',
	'toolCalls',
	'usage',
	'usageEvents',
	'webSearches'
]);
const UNEXPECTED_MODEL_ARTIFACT_FIELD =
	/(?:analysis|agent.?message|cost|event|model.?version|raw.?output|reasoning|response|thought|tool|usage)/i;
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
const TYPED_REBASE_SUMMARY_FIELDS = [
	'reviewRebaseManifestSha256',
	'reviewRebaseId',
	'reviewRebaseCandidateSetSha256',
	'reviewRebaseCollectionValidationSha256',
	'reviewRebaseCollectionRemediationSetSha256',
	'reviewRebaseCollectionRemediations',
	'reviewRebaseCollectionRemediationTargetIds',
	'reviewRebaseCollectionRemediationTargetSetSha256'
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
		throw new Error(`${label} differs from its immutable recovery binding.`);
	}
	return actual;
}

export function validateVerificationRepairRecoveryPolicy({
	model,
	transport,
	responseMode,
	thinkingLevel,
	directPartSize
}) {
	const issues = [];
	if (transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT) {
		if (model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL) {
			issues.push(`llm-direct recovery requires model ${SCIENCE_CHALLENGE_DIRECT_JSON_MODEL}.`);
		}
		if (
			![
				SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
				SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON
			].includes(responseMode)
		) {
			issues.push('llm-direct recovery response mode must be prompt-json or structured-json.');
		}
		if (
			thinkingLevel !== 'max' &&
			!(
				responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
				thinkingLevel === 'high'
			)
		) {
			issues.push('llm-direct recovery thinking level must be max; only prompt-json may use high.');
		}
		if (!Number.isInteger(directPartSize) || directPartSize < 1 || directPartSize > 7) {
			issues.push('llm-direct recovery direct part size must be an integer from 1 to 7.');
		}
	} else if (transport === SCIENCE_CHALLENGE_CODEX_SDK_TRANSPORT) {
		if (model !== SCIENCE_CHALLENGE_CODEX_SDK_MODEL) {
			issues.push(`codex-sdk recovery requires model ${SCIENCE_CHALLENGE_CODEX_SDK_MODEL}.`);
		}
		if (responseMode !== null) {
			issues.push('codex-sdk recovery does not accept a response mode.');
		}
		if (thinkingLevel !== 'max') {
			issues.push('codex-sdk recovery requires thinking level max.');
		}
		if (directPartSize !== null) {
			issues.push('codex-sdk recovery does not accept a direct part size.');
		}
	} else {
		issues.push(
			`recovery transport must be ${SCIENCE_CHALLENGE_CODEX_SDK_TRANSPORT} or ${SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT}.`
		);
	}
	return issues.length ? { status: 'failed', issues } : { status: 'passed', issues: [] };
}

export function validateVerificationRepairRecoveryObjective({
	workspaceRoot,
	planPath,
	verificationPath,
	plan,
	verification,
	identity
}) {
	const issues = [];
	const resolvedWorkspaceRoot = realpathSync(path.resolve(workspaceRoot));
	const resolvedPlanPath = realpathSync(path.resolve(planPath));
	const resolvedVerificationPath = realpathSync(path.resolve(verificationPath));
	const planSha256 = canonicalHash(plan);
	const verificationSha256 = canonicalHash(verification);
	let sourceSnapshot = null;
	let curriculumEvidence = null;
	let sourcePath = null;
	let curriculumEvidencePath = null;
	try {
		validateExecutionIdentity(identity);
		const policyValidation = validateVerificationRepairRecoveryPolicy(identity);
		if (policyValidation.status !== 'passed') issues.push(...policyValidation.issues);
		if (identity.planSha256 !== planSha256) {
			issues.push('Recovery identity does not bind the current plan bytes.');
		}
		if (identity.verificationSha256 !== verificationSha256) {
			issues.push('Recovery identity does not bind the current verification summary bytes.');
		}
		if (
			!HASH.test(String(verification?.candidateSetSha256 ?? '')) ||
			identity.priorCandidateSetSha256 !== verification.candidateSetSha256
		) {
			issues.push('Recovery identity does not bind a valid prior candidate set.');
		}
		sourcePath = safeExistingFileWithinRoot(
			path.resolve(resolvedWorkspaceRoot, String(plan?.sourceSnapshotPath ?? '')),
			resolvedWorkspaceRoot,
			'plan source snapshot'
		);
		curriculumEvidencePath = safeExistingFileWithinRoot(
			path.join(path.dirname(resolvedPlanPath), 'curriculum-evidence.json'),
			resolvedWorkspaceRoot,
			'plan curriculum evidence'
		);
		sourceSnapshot = readJson(sourcePath);
		curriculumEvidence = readJson(curriculumEvidencePath);
		if (
			!HASH.test(String(plan?.sourceSnapshotSha256 ?? '')) ||
			plan.sourceSnapshotSha256 !== canonicalHash(sourceSnapshot)
		) {
			issues.push('Plan source snapshot hash differs from the current source evidence.');
		}
		const planValidation = validateChallengePlan(plan, {
			sourceSnapshot,
			curriculumEvidence
		});
		for (const issue of planValidation.issues) issues.push(`Plan: ${issue}`);
		const reviewContext = resolveVerificationRepairRecoveryReviewContext({
			workspaceRoot: resolvedWorkspaceRoot,
			verificationPath: resolvedVerificationPath,
			plan,
			verification
		});
		for (const issue of reviewContext.issues) {
			issues.push(`Independent repair-review typed input: ${issue}`);
		}
		if (reviewContext.status === 'passed' && canonicalHash(reviewContext.basePlan) !== planSha256) {
			const basePlanValidation = validateChallengePlan(reviewContext.basePlan, {
				sourceSnapshot,
				curriculumEvidence
			});
			for (const issue of basePlanValidation.issues) issues.push(`Base plan: ${issue}`);
		}
		if (
			verification?.schemaVersion !== 'science-challenge-independent-verification-summary/v1' ||
			verification.planId !== plan.planId ||
			verification.planSha256 !== planSha256 ||
			verification.sourceSnapshotSha256 !== canonicalHash(sourceSnapshot) ||
			verification.curriculumEvidenceSha256 !== canonicalHash(curriculumEvidence)
		) {
			issues.push(
				'Independent repair-review summary does not bind the current plan, source snapshot and curriculum evidence.'
			);
		}
		const verificationRepairAuthority = reviewContext.verificationRepairAuthority;
		if (reviewContext.status === 'passed') {
			const rawEvidence = requireContentVerificationEvidence({
				summary: verification,
				summaryPath: resolvedVerificationPath,
				plan,
				basePlan: reviewContext.basePlan,
				expectedCurriculumRemapVerifierInput: reviewContext.curriculumRemapVerifierInput,
				expectedDifficultyPlanAdjustmentVerifierInput:
					reviewContext.difficultyPlanAdjustmentVerifierInput,
				sourceSnapshot,
				curriculumEvidence,
				rootDir: resolvedWorkspaceRoot,
				requiredStatus: 'failed'
			});
			for (const issue of rawEvidence.issues) {
				issues.push(`Independent repair-review evidence: ${issue}`);
			}
		}
		const reviews = Array.isArray(verification?.reviews) ? verification.reviews : [];
		const expectedIds = Array.isArray(plan?.rows) ? plan.rows.map((row) => row.id) : [];
		if (
			reviews.length !== expectedIds.length ||
			reviews.some((review, index) => review?.id !== expectedIds[index])
		) {
			issues.push('Independent repair-review membership differs from the exact plan order.');
		}
		for (const review of reviews) {
			const validation = validateIndependentContentReviewRow(review);
			for (const issue of validation.issues) {
				issues.push(`${String(review?.id ?? 'unknown review')}: ${issue}`);
			}
		}
		const rejected = reviews.filter((review) => review.accepted === false);
		const exactTypedCollectionOnlyFailure =
			verificationRepairAuthority !== null &&
			rejected.length === 0 &&
			verificationRepairAuthority.independentRejectedChallengeIds.length === 0 &&
			verificationRepairAuthority.collectionRemediations.length > 0 &&
			verificationRepairAuthority.collectionRemediationTargetIds.length > 0 &&
			verification.acceptedCount === reviews.length;
		if (
			verification.status !== 'failed' ||
			(rejected.length === 0 && !exactTypedCollectionOnlyFailure) ||
			verification.reviewCount !== expectedIds.length ||
			verification.acceptedCount !== reviews.length - rejected.length ||
			verification.rejectedCount !== rejected.length ||
			!Array.isArray(verification.assignmentResults) ||
			verification.assignmentResults.some(
				(result) =>
					result?.status !== 'passed' || !Array.isArray(result.issues) || result.issues.length !== 0
			) ||
			!Array.isArray(verification.issues) ||
			verification.issues.length !== 0
		) {
			issues.push(
				'Repair recovery requires a complete independent review whose only failure is rejected content or authenticated typed collection remediation.'
			);
		}
		if (verificationRepairAuthority !== null) {
			issues.push(
				'Typed review-rebase objectives cannot use pre-model clone recovery until the recovery manifest explicitly preserves and replays the complete verification-repair authority.'
			);
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
	if (issues.length) return { status: 'failed', issues };
	return {
		status: 'passed',
		issues: [],
		planSha256,
		verificationSha256,
		priorCandidateSetSha256: verification.candidateSetSha256,
		sourcePath,
		sourceSnapshotSha256: canonicalHash(sourceSnapshot),
		curriculumEvidencePath,
		curriculumEvidenceSha256: canonicalHash(curriculumEvidence)
	};
}

export function resolveVerificationRepairRecoveryReviewContext({
	workspaceRoot,
	verificationPath,
	plan,
	verification
}) {
	const issues = [];
	let resolvedWorkspaceRoot = null;
	let resolvedVerificationPath = null;
	try {
		resolvedWorkspaceRoot = realpathSync(path.resolve(workspaceRoot));
		resolvedVerificationPath = safeExistingFileWithinRoot(
			path.resolve(verificationPath),
			resolvedWorkspaceRoot,
			'verification summary'
		);
	} catch (error) {
		return {
			status: 'failed',
			issues: [error instanceof Error ? error.message : String(error)],
			basePlan: null,
			curriculumRemapVerifierInput: null,
			difficultyPlanAdjustmentVerifierInput: null,
			verificationRepairAuthority: null
		};
	}

	const bindings = [
		{
			hashField: 'curriculumRemapVerifierInputSha256',
			fileName: 'curriculum-remap-verifier-input.json',
			label: 'curriculum-remap verifier input',
			resultField: 'curriculumRemapVerifierInput'
		},
		{
			hashField: 'difficultyPlanAdjustmentVerifierInputSha256',
			fileName: 'difficulty-plan-adjustment-verifier-input.json',
			label: 'difficulty-plan adjustment verifier input',
			resultField: 'difficultyPlanAdjustmentVerifierInput'
		}
	];
	const values = {
		curriculumRemapVerifierInput: null,
		difficultyPlanAdjustmentVerifierInput: null,
		verificationRepairAuthority: null
	};
	if (verificationSummaryHasTypedRebaseFields(verification)) {
		try {
			values.verificationRepairAuthority = buildScienceChallengeVerificationRepairAuthority({
				verificationSummary: verification,
				allowManifestlessReplay: true
			});
		} catch (error) {
			issues.push(
				`verification-repair authority is invalid: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}
	for (const binding of bindings) {
		const expectedSha256 = verification?.[binding.hashField];
		if (expectedSha256 === undefined) continue;
		if (!HASH.test(String(expectedSha256 ?? ''))) {
			issues.push(`${binding.hashField} must be a lowercase SHA-256 when present.`);
			continue;
		}
		let inputPath = null;
		try {
			inputPath = safeExistingFileWithinRoot(
				path.join(path.dirname(resolvedVerificationPath), binding.fileName),
				resolvedWorkspaceRoot,
				binding.label
			);
		} catch {
			issues.push(`${binding.label} is missing, unsafe or not a regular file.`);
			continue;
		}
		try {
			const value = readJson(inputPath);
			if (canonicalHash(value) !== expectedSha256) {
				issues.push(`${binding.label} differs from its summary hash.`);
				continue;
			}
			values[binding.resultField] = value;
		} catch (error) {
			issues.push(
				`${binding.label} is not valid JSON: ${
					error instanceof Error ? error.message : String(error)
				}`
			);
		}
	}

	const typedInputs = bindings
		.map((binding) => values[binding.resultField])
		.filter((value) => value !== null);
	if (typedInputs.length === 0) {
		if (
			verification?.curriculumRemapVerifierInputSha256 !== undefined ||
			verification?.difficultyPlanAdjustmentVerifierInputSha256 !== undefined
		) {
			return {
				status: 'failed',
				issues,
				basePlan: null,
				...values
			};
		}
		return {
			status: issues.length ? 'failed' : 'passed',
			issues,
			basePlan: plan,
			...values
		};
	}

	const planSha256 = canonicalHash(plan);
	let basePlan = null;
	let boundBasePlanSha256 = null;
	for (const input of typedInputs) {
		const label =
			input === values.curriculumRemapVerifierInput
				? 'curriculum-remap verifier input'
				: 'difficulty-plan adjustment verifier input';
		if (!jsonRecord(input.basePlan)) {
			issues.push(`${label} basePlan must be an object.`);
		} else {
			const basePlanSha256 = canonicalHash(input.basePlan);
			if (boundBasePlanSha256 === null) {
				basePlan = input.basePlan;
				boundBasePlanSha256 = basePlanSha256;
			} else if (basePlanSha256 !== boundBasePlanSha256) {
				issues.push('typed verifier inputs do not agree on the exact basePlan.');
			}
			if (!HASH.test(String(input.basePlanSha256 ?? ''))) {
				issues.push(`${label} basePlanSha256 must be a lowercase SHA-256.`);
			} else if (input.basePlanSha256 !== basePlanSha256) {
				issues.push(`${label} basePlanSha256 does not bind its basePlan.`);
			}
		}
		if (!jsonRecord(input.effectivePlan)) {
			issues.push(`${label} effectivePlan must be an object.`);
		} else if (
			!HASH.test(String(input.effectivePlanSha256 ?? '')) ||
			input.effectivePlanSha256 !== canonicalHash(input.effectivePlan)
		) {
			issues.push(`${label} effectivePlanSha256 does not bind its effectivePlan.`);
		} else if (
			input.effectivePlanSha256 !== planSha256 ||
			canonicalHash(input.effectivePlan) !== planSha256
		) {
			issues.push(`${label} effectivePlan differs from the recovery plan.`);
		}
	}

	if (basePlan) {
		const basePlanSha256 = canonicalHash(basePlan);
		if (
			verification?.basePlanSha256 !== basePlanSha256 ||
			verification?.effectivePlanSha256 !== planSha256
		) {
			issues.push(
				'verification summary base/effective plan bindings differ from the typed verifier inputs.'
			);
		}
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		basePlan,
		...values
	};
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

export function bindVerificationRepairExecutionRecovery({
	ledgerRoot,
	identity,
	manifest,
	successorRoot
}) {
	initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	const binding = recoveryBindingValue({ identity, manifest, successorRoot });
	const bindingPath = path.join(path.resolve(ledgerRoot), 'recovery.json');
	const bytes = Buffer.from(`${stableStringify(binding)}\n`);
	if (existsSync(bindingPath)) {
		if (!readFileSync(bindingPath).equals(bytes)) {
			throw new Error('Immutable verification-repair recovery binding differs.');
		}
	} else {
		writeImmutableFile(bindingPath, bytes);
	}
	return { binding, bindingPath };
}

export function readVerificationRepairExecutionRecoveryBinding({ ledgerRoot, identity = null }) {
	if (identity) validateExecutionIdentity(identity);
	const bindingPath = path.join(path.resolve(ledgerRoot), 'recovery.json');
	if (!existsSync(bindingPath)) return null;
	const binding = readJson(bindingPath);
	const bindingIdentity = binding?.executionIdentity;
	validateExecutionIdentity(bindingIdentity);
	if (
		binding?.schemaVersion !== 'science-challenge-verification-repair-recovery-binding/v2' ||
		binding.objectiveId !== bindingIdentity.objectiveId ||
		binding.executionId !== bindingIdentity.executionId ||
		!HASH.test(String(binding.manifestSha256 ?? '')) ||
		!HASH.test(String(binding.successorRootSha256 ?? ''))
	) {
		throw new Error('Verification-repair recovery binding is invalid.');
	}
	if (identity && identity.objectiveId !== binding.objectiveId) {
		throw new Error('Verification-repair recovery binding targets another objective.');
	}
	return { binding, bindingPath, identity: bindingIdentity };
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
				`${shardId} global repair attempt ${record.attempt} belongs to another output root; a cloned root must use explicit bound recovery.`
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

/**
 * Inspect immutable per-part continuation claims nested under an already claimed repair attempt.
 * These claims consume only canonical part slots within that attempt; they never allocate another
 * repair attempt.
 */
export function inspectVerificationRepairMultipartContinuationClaims({
	ledgerRoot,
	identity,
	shardId,
	attempt,
	outputRoot
}) {
	validateExecutionIdentity(identity);
	requireShardId(shardId);
	requirePositiveInteger(attempt, 'continuation source attempt');
	if (attempt !== REPAIR_ATTEMPT_LIMIT) {
		throw new Error('Multipart continuation is restricted to exhausted repair attempt 4.');
	}
	const attempts = inspectVerificationRepairExecutionAttempts({ ledgerRoot, identity, shardId });
	const sourceAttempt = attempts.attempts.find((record) => record.attempt === attempt);
	if (!sourceAttempt || !attempts.exhausted) {
		throw new Error('Multipart continuation requires the exhausted global attempt-4 claim.');
	}
	const outputRootSha256 = canonicalHash(path.resolve(requireText(outputRoot, 'output root')));
	if (sourceAttempt.claim.outputRootSha256 !== outputRootSha256) {
		throw new Error('Multipart continuation output root differs from the attempt-4 claim.');
	}
	const claimsRoot = path.join(sourceAttempt.path, MULTIPART_CONTINUATION_DIRECTORY);
	const claims = existsSync(claimsRoot)
		? readdirSync(claimsRoot, { withFileTypes: true })
				.filter((entry) => !entry.name.startsWith('.claim-preparing-'))
				.map((entry) => {
					if (!entry.isDirectory() || !/^part-\d{2}$/.test(entry.name)) {
						throw new Error(`Malformed multipart continuation claim ${entry.name}.`);
					}
					const claimRoot = path.join(claimsRoot, entry.name);
					const claimPath = path.join(claimRoot, 'claim.json');
					if (!existsSync(claimPath)) {
						throw new Error(`${shardId} ${entry.name} continuation has no immutable claim.`);
					}
					const claim = readJson(claimPath);
					validateMultipartContinuationClaim({
						claim,
						identity,
						shardId,
						attempt,
						outputRootSha256,
						sourceAttemptClaim: sourceAttempt.claim
					});
					if (claim.partId !== entry.name) {
						throw new Error(`${shardId} continuation claim directory and partId differ.`);
					}
					const invocationPath = path.join(claimRoot, 'invocation-started.json');
					const entries = readdirSync(claimRoot, { withFileTypes: true });
					if (
						entries.some(
							(record) =>
								!record.isFile() || !['claim.json', 'invocation-started.json'].includes(record.name)
						)
					) {
						throw new Error(
							`${shardId} ${entry.name} continuation claim journal has unexpected evidence.`
						);
					}
					const invocation = existsSync(invocationPath) ? readJson(invocationPath) : null;
					if (invocation) {
						validateMultipartContinuationInvocationStart({
							invocation,
							identity,
							shardId,
							attempt,
							outputRootSha256,
							claim,
							claimPath
						});
					}
					return {
						partId: claim.partId,
						partIndex: claim.partIndex,
						path: claimPath,
						claim,
						invocationPath,
						invocation
					};
				})
				.sort((left, right) => left.partIndex - right.partIndex)
		: [];
	if (claims.length) {
		const first = claims[0].claim;
		for (const [offset, record] of claims.entries()) {
			const expectedIndex = first.sourceAttemptedPartCount + offset + 1;
			if (
				record.partIndex !== expectedIndex ||
				record.partId !== `part-${String(expectedIndex).padStart(2, '0')}` ||
				record.claim.sourceAttemptedPartCount !== first.sourceAttemptedPartCount ||
				record.claim.expectedPartCount !== first.expectedPartCount ||
				record.claim.fullPartPlanSha256 !== first.fullPartPlanSha256 ||
				record.claim.sourceAttemptSha256 !== first.sourceAttemptSha256 ||
				record.claim.sourcePartsSha256 !== first.sourcePartsSha256
			) {
				throw new Error(
					`${shardId} multipart continuation claims are partial, reordered or cross-bound.`
				);
			}
			const expectedPriorSha256 = canonicalHash(
				claims.slice(0, offset).map((prior) => ({
					partId: prior.partId,
					claimSha256: canonicalHash(prior.claim)
				}))
			);
			if (record.claim.priorContinuationClaimsSha256 !== expectedPriorSha256) {
				throw new Error(
					`${shardId} ${record.partId} continuation claim does not bind its exact prior claims.`
				);
			}
		}
	}
	return {
		claimsRoot,
		sourceAttempt,
		claims,
		nextPartIndex: claims.length ? claims.at(-1).partIndex + 1 : null
	};
}

/**
 * Atomically claim one never-attempted canonical suffix part beneath the immutable global
 * attempt-4 claim. A crashed/incomplete claim is intentionally not reusable for another model
 * invocation: the caller must fail closed rather than risk a duplicate call.
 */
export function claimVerificationRepairMultipartContinuationPart({
	ledgerRoot,
	identity,
	shardId,
	attempt,
	outputRoot,
	partClaim
}) {
	const initialized = initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	return withObjectiveLedgerLock(initialized.ledgerRoot, () => {
		const inspected = inspectVerificationRepairMultipartContinuationClaims({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			shardId,
			attempt,
			outputRoot
		});
		if (!partClaim || typeof partClaim !== 'object' || Array.isArray(partClaim)) {
			throw new Error('Multipart continuation part claim input must be an object.');
		}
		const expectedIndex =
			inspected.claims.length === 0
				? partClaim.sourceAttemptedPartCount + 1
				: inspected.claims.at(-1).partIndex + 1;
		if (
			partClaim.partIndex !== expectedIndex ||
			partClaim.partId !== `part-${String(expectedIndex).padStart(2, '0')}`
		) {
			throw new Error(
				`Multipart continuation may claim only the next never-attempted canonical part ${expectedIndex}.`
			);
		}
		if (
			expectedIndex <= partClaim.sourceAttemptedPartCount ||
			expectedIndex > partClaim.expectedPartCount
		) {
			throw new Error('Multipart continuation part is outside the canonical missing suffix.');
		}
		const priorContinuationClaimsSha256 = canonicalHash(
			inspected.claims.map((record) => ({
				partId: record.partId,
				claimSha256: canonicalHash(record.claim)
			}))
		);
		if (partClaim.priorContinuationClaimsSha256 !== priorContinuationClaimsSha256) {
			throw new Error('Multipart continuation claim does not bind the exact prior claim chain.');
		}
		const claim = {
			schemaVersion: 'science-challenge-verification-repair-multipart-part-claim/v1',
			objectiveId: identity.objectiveId,
			executionId: identity.executionId,
			shardId,
			attempt,
			outputRootSha256: canonicalHash(path.resolve(outputRoot)),
			sourceAttemptClaimSha256: canonicalHash(inspected.sourceAttempt.claim),
			...partClaim
		};
		validateMultipartContinuationClaim({
			claim,
			identity,
			shardId,
			attempt,
			outputRootSha256: canonicalHash(path.resolve(outputRoot)),
			sourceAttemptClaim: inspected.sourceAttempt.claim
		});
		const claimRoot = path.join(inspected.claimsRoot, claim.partId);
		writeAtomicClaimDirectory(claimRoot, claim);
		return {
			claim,
			claimPath: path.join(claimRoot, 'claim.json'),
			claimRoot
		};
	});
}

/**
 * Persist the irreversible invocation boundary for one claimed continuation part. A caller may
 * invoke the model only when this call creates the marker. An existing marker means the prior
 * process may already have invoked the model and must therefore fail closed unless complete local
 * evidence can be replayed without another invocation.
 */
export function startVerificationRepairMultipartContinuationInvocation({
	ledgerRoot,
	identity,
	shardId,
	attempt,
	outputRoot,
	partId
}) {
	const initialized = initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	return withObjectiveLedgerLock(initialized.ledgerRoot, () => {
		const inspected = inspectVerificationRepairMultipartContinuationClaims({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			shardId,
			attempt,
			outputRoot
		});
		const record = inspected.claims.find((candidate) => candidate.partId === partId);
		if (!record) {
			throw new Error(`${shardId} ${String(partId)} cannot start without an immutable claim.`);
		}
		const marker = {
			schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MULTIPART_INVOCATION_SCHEMA,
			objectiveId: identity.objectiveId,
			executionId: identity.executionId,
			shardId,
			attempt,
			partId,
			outputRootSha256: canonicalHash(path.resolve(outputRoot)),
			claimSha256: canonicalHash(record.claim),
			claimByteSha256: sha256(readFileSync(record.path)),
			promptSha256: record.claim.promptSha256,
			responseSchemaSha256: record.claim.responseSchemaSha256
		};
		if (record.invocation) {
			if (canonicalHash(record.invocation) !== canonicalHash(marker)) {
				throw new Error(`${shardId} ${partId} invocation-start journal differs.`);
			}
			return {
				status: 'already-started',
				started: false,
				marker: record.invocation,
				path: record.invocationPath
			};
		}
		writeImmutableFile(record.invocationPath, Buffer.from(`${stableStringify(marker)}\n`));
		return {
			status: 'started',
			started: true,
			marker,
			path: record.invocationPath
		};
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

export function importExistingVerificationRepairExecutionAttempts({
	ledgerRoot,
	identity,
	outputRoot
}) {
	const initialized = initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	const resolvedOutputRoot = path.resolve(outputRoot);
	return withObjectiveLedgerLock(initialized.ledgerRoot, () => {
		const plan = planExistingVerificationRepairExecutionAttempts({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			outputRoot: resolvedOutputRoot
		});
		for (const record of plan.imports) {
			claimVerificationRepairExecutionAttemptUnlocked({
				ledgerRoot: initialized.ledgerRoot,
				identity: record.executionIdentity,
				shardId: record.shardId,
				attempt: record.attempt,
				outputRoot: resolvedOutputRoot
			});
		}
		assertPlannedVerificationRepairImportsCommitted({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			outputRoot: resolvedOutputRoot,
			shardIds: plan.shardIds
		});
		return plan.imports.map(({ shardId, attempt }) => ({ shardId, attempt }));
	});
}

export function planVerificationRepairRecoveryCommit({
	ledgerRoot,
	identity,
	manifest,
	successorRoot,
	outputPath = null
}) {
	validateExecutionIdentity(identity);
	const policyValidation = validateVerificationRepairRecoveryPolicy(identity);
	if (policyValidation.status !== 'passed') {
		throw new Error(`Invalid recovery execution policy:\n${policyValidation.issues.join('\n')}`);
	}
	if (
		manifest.objectiveId !== identity.objectiveId ||
		manifest.executionId !== identity.executionId
	) {
		throw new Error('Recovery manifest differs from the execution identity.');
	}
	const resolvedLedgerRoot = path.resolve(ledgerRoot);
	const resolvedSuccessorRoot = path.resolve(successorRoot);
	const manifestBytes = Buffer.from(`${stableStringify(manifest)}\n`);
	const resolvedOutputPath = outputPath === null ? null : path.resolve(outputPath);
	preflightImmutableTarget(
		verificationRepairRecoveryManifestPath(resolvedLedgerRoot),
		manifestBytes,
		'recovery manifest'
	);
	if (resolvedOutputPath) {
		preflightImmutableTarget(resolvedOutputPath, manifestBytes, 'requested recovery manifest');
	}
	const binding = recoveryBindingValue({
		identity,
		manifest,
		successorRoot: resolvedSuccessorRoot
	});
	const bindingBytes = Buffer.from(`${stableStringify(binding)}\n`);
	preflightImmutableTarget(
		path.join(resolvedLedgerRoot, 'recovery.json'),
		bindingBytes,
		'recovery binding'
	);
	const existingTransaction = readRecoveryTransaction({
		ledgerRoot: resolvedLedgerRoot,
		identity
	});
	if (existingTransaction) {
		validateRecoveryTransactionRequest(existingTransaction, {
			identity,
			manifest,
			successorRoot: resolvedSuccessorRoot,
			outputPath: resolvedOutputPath
		});
		const attemptPlan = planExistingVerificationRepairExecutionAttempts({
			ledgerRoot: resolvedLedgerRoot,
			identity,
			outputRoot: resolvedSuccessorRoot
		});
		validateRecoveryTransactionAttemptEvidence({
			transaction: existingTransaction,
			identity,
			outputRoot: resolvedSuccessorRoot,
			requiredImports: attemptPlan.imports
		});
		return {
			transaction: existingTransaction,
			imports: existingTransaction.imports,
			shardIds: attemptPlan.shardIds,
			replay: true
		};
	}
	const attemptPlan = planExistingVerificationRepairExecutionAttempts({
		ledgerRoot: resolvedLedgerRoot,
		identity,
		outputRoot: resolvedSuccessorRoot
	});
	const transaction = recoveryTransactionValue({
		identity,
		manifest,
		successorRoot: resolvedSuccessorRoot,
		outputPath: resolvedOutputPath,
		imports: attemptPlan.imports
	});
	return {
		transaction,
		imports: transaction.imports,
		shardIds: attemptPlan.shardIds,
		replay: false
	};
}

export function commitVerificationRepairRecovery({
	ledgerRoot,
	identity,
	manifest,
	successorRoot,
	outputPath = null,
	dryRun = false
}) {
	const plan = planVerificationRepairRecoveryCommit({
		ledgerRoot,
		identity,
		manifest,
		successorRoot,
		outputPath
	});
	if (dryRun) {
		return {
			status: 'planned',
			transaction: plan.transaction,
			importedAttempts: plan.imports.map(({ shardId, attempt }) => ({ shardId, attempt })),
			replay: plan.replay
		};
	}
	const initialized = initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	return withObjectiveLedgerLock(initialized.ledgerRoot, () => {
		const transactionPath = recoveryTransactionPath(initialized.ledgerRoot, identity.executionId);
		const current = readRecoveryTransaction({
			ledgerRoot: initialized.ledgerRoot,
			identity
		});
		if (current) {
			validateRecoveryTransactionRequest(current, {
				identity,
				manifest,
				successorRoot: path.resolve(successorRoot),
				outputPath: outputPath === null ? null : path.resolve(outputPath)
			});
		} else {
			writeImmutableFile(transactionPath, Buffer.from(`${stableStringify(plan.transaction)}\n`));
		}
		const transaction = current ?? plan.transaction;
		const manifestBytes = Buffer.from(`${stableStringify(manifest)}\n`);
		writeImmutableFile(
			verificationRepairRecoveryManifestPath(initialized.ledgerRoot),
			manifestBytes
		);
		bindVerificationRepairExecutionRecovery({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			manifest,
			successorRoot: transaction.successorRootPath
		});
		for (const record of transaction.imports) {
			const global = inspectVerificationRepairExecutionAttempts({
				ledgerRoot: initialized.ledgerRoot,
				identity,
				shardId: record.shardId
			});
			const existing = global.attempts.find((attempt) => attempt.attempt === record.attempt);
			if (existing) {
				if (
					existing.claim.executionId !== record.executionIdentity.executionId ||
					existing.claim.outputRootSha256 !== transaction.successorRootSha256
				) {
					throw new Error(
						`${record.shardId} global repair attempt ${record.attempt} differs from the recovery transaction.`
					);
				}
				continue;
			}
			claimVerificationRepairExecutionAttemptUnlocked({
				ledgerRoot: initialized.ledgerRoot,
				identity: record.executionIdentity,
				shardId: record.shardId,
				attempt: record.attempt,
				outputRoot: transaction.successorRootPath
			});
		}
		assertPlannedVerificationRepairImportsCommitted({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			outputRoot: transaction.successorRootPath,
			shardIds: [
				...new Set([...plan.shardIds, ...transaction.imports.map((record) => record.shardId)])
			].sort()
		});
		if (transaction.outputPath) {
			writeImmutableFile(transaction.outputPath, manifestBytes);
		}
		const committed = { ...transaction, status: 'committed' };
		atomicWriteFile(transactionPath, Buffer.from(`${stableStringify(committed)}\n`));
		return {
			status: 'committed',
			transaction: committed,
			importedAttempts: transaction.imports.map(({ shardId, attempt }) => ({
				shardId,
				attempt
			})),
			replay: plan.replay
		};
	});
}

export function buildVerificationRepairRecoveryManifest({
	planPath,
	planSha256,
	verificationSha256,
	priorCandidateSetSha256,
	identity,
	preModelRoots,
	successorRoot,
	preflight
}) {
	validateExecutionIdentity(identity);
	if (canonicalHash(readJson(path.resolve(planPath))) !== planSha256) {
		throw new Error('Recovery plan SHA-256 differs from the current plan file.');
	}
	if (
		identity.planSha256 !== planSha256 ||
		identity.verificationSha256 !== verificationSha256 ||
		identity.priorCandidateSetSha256 !== priorCandidateSetSha256
	) {
		throw new Error('Recovery identity differs from its plan, verification or candidate set.');
	}
	if (!Array.isArray(preModelRoots) || preModelRoots.length === 0) {
		throw new Error('Recovery requires at least one explicit pre-model failure root.');
	}
	validateRecoveryPreflight(preflight, identity);
	const planRoot = path.dirname(path.resolve(planPath));
	const suppliedRoots = preModelRoots.map((root) => canonicalExistingDirectory(root));
	if (new Set(suppliedRoots).size !== suppliedRoots.length) {
		throw new Error('Recovery predecessor roots must be unique.');
	}
	const discoveredRoots = discoverVerificationRepairPredecessorRoots({
		planPath,
		verificationSha256,
		successorRoot
	});
	if (canonicalHash([...suppliedRoots].sort()) !== canonicalHash(discoveredRoots)) {
		const omitted = discoveredRoots.filter((root) => !suppliedRoots.includes(root));
		const unexpected = suppliedRoots.filter((root) => !discoveredRoots.includes(root));
		throw new Error(
			[
				'Recovery predecessor roots differ from the complete discovered root set.',
				omitted.length ? `Omitted: ${omitted.join(', ')}.` : null,
				unexpected.length ? `Unexpected: ${unexpected.join(', ')}.` : null
			]
				.filter(Boolean)
				.join(' ')
		);
	}
	const roots = discoveredRoots.map((root) =>
		inspectPreModelFailureRoot({
			root,
			planRoot,
			verificationSha256,
			priorCandidateSetSha256,
			identity
		})
	);
	const successor = inspectSuccessorRoot({
		root: successorRoot,
		planRoot,
		verificationSha256,
		priorCandidateSetSha256
	});
	for (const root of roots) {
		if (root.candidateInventorySha256 !== successor.baselineCandidateInventorySha256) {
			throw new Error(`${root.path} candidates differ from the verifier-bound successor baseline.`);
		}
	}
	return {
		schemaVersion: SCIENCE_CHALLENGE_VERIFICATION_REPAIR_RECOVERY_SCHEMA,
		objectiveId: identity.objectiveId,
		executionId: identity.executionId,
		identity,
		planSha256,
		verificationSha256,
		priorCandidateSetSha256,
		disposition:
			'Explicit infrastructure recovery: predecessor calls produced no model output or usage and do not consume content-attempt slots.',
		preflight,
		preModelRoots: roots,
		successor,
		preModelAttemptCount: roots.reduce((total, root) => total + root.attemptCount, 0)
	};
}

export function discoverVerificationRepairPredecessorRoots({
	planPath,
	verificationSha256,
	successorRoot
}) {
	requireHash(verificationSha256, 'verification SHA-256');
	const planRoot = canonicalExistingDirectory(path.dirname(path.resolve(planPath)));
	const resolvedSuccessor = canonicalExistingDirectory(successorRoot);
	const prefix = `verification-repair-${verificationSha256.slice(0, 12)}-attempt-`;
	const roots = [];
	const visited = new Set();
	const visit = (directory) => {
		const resolved = canonicalExistingDirectory(directory);
		if (visited.has(resolved)) return;
		visited.add(resolved);
		if (resolved === resolvedSuccessor) return;
		const shardsRoot = path.join(resolved, 'shards');
		if (existsSync(shardsRoot) && statSync(shardsRoot).isDirectory()) {
			const hasRepairAttempt = sortedDirectories(shardsRoot).some((shardId) =>
				sortedDirectories(path.join(shardsRoot, shardId)).some((name) => name.startsWith(prefix))
			);
			if (hasRepairAttempt) roots.push(resolved);
		}
		for (const name of sortedDirectories(resolved)) {
			if (
				name === 'shards' ||
				name === OBJECTIVE_LEDGER_DIRECTORY ||
				name === 'verification-repair-recoveries' ||
				name.startsWith('.')
			) {
				continue;
			}
			visit(path.join(resolved, name));
		}
	};
	visit(planRoot);
	return [...new Set(roots)].sort();
}

export function validateVerificationRepairRecoveryManifest({
	manifest,
	manifestPath = null,
	planPath,
	generationRoot,
	verifySources = true
}) {
	const issues = [];
	try {
		if (
			!manifest ||
			manifest.schemaVersion !== SCIENCE_CHALLENGE_VERIFICATION_REPAIR_RECOVERY_SCHEMA
		) {
			throw new Error('Recovery manifest schema is invalid.');
		}
		validateExecutionIdentity(manifest.identity);
		if (canonicalHash(readJson(path.resolve(planPath))) !== manifest.planSha256) {
			throw new Error('Recovery manifest plan SHA-256 differs from the current plan file.');
		}
		if (
			manifest.objectiveId !== manifest.identity.objectiveId ||
			manifest.executionId !== manifest.identity.executionId
		) {
			throw new Error('Recovery manifest objective or execution id differs from its identity.');
		}
		for (const field of ['planSha256', 'verificationSha256', 'priorCandidateSetSha256']) {
			if (manifest[field] !== manifest.identity[field]) {
				throw new Error(`Recovery manifest ${field} differs from its execution identity.`);
			}
		}
		validateRecoveryPreflight(manifest.preflight, manifest.identity);
		if (!Array.isArray(manifest.preModelRoots) || manifest.preModelRoots.length === 0) {
			throw new Error('Recovery manifest has no predecessor roots.');
		}
		const predecessorPaths = manifest.preModelRoots.map((root) =>
			requireText(root?.path, 'recovery predecessor path')
		);
		if (new Set(predecessorPaths).size !== predecessorPaths.length) {
			throw new Error('Recovery manifest predecessor roots are not unique.');
		}
		const expectedSuccessor = relativeWithinPlanRoot(
			path.dirname(path.resolve(planPath)),
			generationRoot
		);
		if (manifest.successor?.path !== expectedSuccessor) {
			throw new Error('Recovery manifest is bound to another successor generation root.');
		}
		if (verifySources) {
			const rebuilt = buildVerificationRepairRecoveryManifest({
				planPath,
				planSha256: manifest.planSha256,
				verificationSha256: manifest.verificationSha256,
				priorCandidateSetSha256: manifest.priorCandidateSetSha256,
				identity: manifest.identity,
				preModelRoots: manifest.preModelRoots.map((root) =>
					path.join(path.dirname(path.resolve(planPath)), root.path)
				),
				successorRoot: generationRoot,
				preflight: manifest.preflight
			});
			if (canonicalHash(rebuilt) !== canonicalHash(manifest)) {
				throw new Error('Recovery manifest differs from current predecessor/successor evidence.');
			}
		}
		if (manifestPath && !existsSync(manifestPath)) {
			throw new Error('Recovery manifest path does not exist.');
		}
	} catch (error) {
		issues.push(error instanceof Error ? error.message : String(error));
	}
	return issues.length ? { status: 'failed', issues } : { status: 'passed', issues: [] };
}

export function verificationRepairRecoveryManifestPath(ledgerRoot) {
	return path.join(path.resolve(ledgerRoot), 'recovery-manifest.json');
}

export function discoverVerificationRepairRecoveryManifest({ ledgerRoot }) {
	const manifestPath = verificationRepairRecoveryManifestPath(ledgerRoot);
	return existsSync(manifestPath) ? manifestPath : null;
}

export function discoverVerificationRepairRecoveryBinding({
	ledgerRoot,
	generationRoot,
	requireSuccessorMatch = true
}) {
	const record = readVerificationRepairExecutionRecoveryBinding({ ledgerRoot });
	if (!record) return null;
	if (
		requireSuccessorMatch &&
		record.binding.successorRootSha256 !== canonicalHash(path.resolve(generationRoot))
	) {
		throw new Error(
			'The recovered verification-repair objective is bound to another successor generation root; cloning cannot erase recovery lineage.'
		);
	}
	return { ...record, ledgerRoot: path.resolve(ledgerRoot) };
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

export function requireVerificationRepairRecoveryArchivePair({
	bindingRecord,
	manifest,
	manifestPath,
	recoveryRequired = false
}) {
	if (recoveryRequired && (!bindingRecord || !manifest || !manifestPath)) {
		throw new Error(
			'Verification-repair evidence requires a bound recovery manifest and objective ledger.'
		);
	}
	if (bindingRecord && (!manifest || !manifestPath)) {
		throw new Error(
			'The workspace objective ledger requires an archived recovery manifest for this generation root.'
		);
	}
	if (!bindingRecord && (manifest || manifestPath)) {
		throw new Error('The recovery manifest has no immutable workspace-objective-ledger binding.');
	}
	if (!bindingRecord) return;
	if (
		bindingRecord.binding.manifestSha256 !== canonicalHash(manifest) ||
		bindingRecord.binding.objectiveId !== manifest.objectiveId ||
		bindingRecord.identity.executionId !== manifest.executionId
	) {
		throw new Error('Recovery manifest differs from its workspace objective-ledger binding.');
	}
}

export function buildVerificationRepairExecutionLedgerSnapshot({
	ledgerRoot,
	identity,
	outputRoot
}) {
	const initialized = initializeVerificationRepairExecutionLedger({ ledgerRoot, identity });
	const resolvedOutputRoot = path.resolve(outputRoot);
	return withObjectiveLedgerLock(initialized.ledgerRoot, () => {
		reconcileAttemptTransactionsUnlocked({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			outputRoot: resolvedOutputRoot
		});
		return buildVerificationRepairExecutionLedgerSnapshotUnlocked({
			ledgerRoot: initialized.ledgerRoot,
			identity,
			outputRoot: resolvedOutputRoot
		});
	});
}

function buildVerificationRepairExecutionLedgerSnapshotUnlocked({
	ledgerRoot,
	identity,
	outputRoot
}) {
	validateExecutionIdentity(identity);
	const recovery = readVerificationRepairExecutionRecoveryBinding({ ledgerRoot, identity });
	if (!recovery) throw new Error('Recovered execution ledger has no recovery binding.');
	const shards = [];
	const globalShardIds = sortedDirectories(path.join(path.resolve(ledgerRoot), 'shards'));
	const localShardIds = localRepairShardIds(path.resolve(outputRoot), identity);
	const shardIds = [...new Set([...globalShardIds, ...localShardIds])].sort();
	for (const shardId of shardIds) {
		const global = inspectVerificationRepairExecutionAttempts({ ledgerRoot, identity, shardId });
		const localAttempts = inspectLocalVerificationRepairAttempts({
			outputRoot,
			identity,
			shardId
		});
		requireMatchingVerificationRepairAttemptLedgers({
			localAttempts,
			globalAttempts: global.attempts,
			shardId,
			outputRoot
		});
		for (const [index, localAttempt] of localAttempts.entries()) {
			const localIdentity = completedLocalAttemptExecutionIdentity({
				record: localAttempt,
				objectiveIdentity: identity
			});
			if (global.attempts[index]?.claim.executionId !== localIdentity.executionId) {
				throw new Error(
					`${shardId} global repair attempt ${localAttempt.attempt} policy differs from its immutable local run evidence.`
				);
			}
		}
		shards.push({
			shardId,
			attempts: global.attempts.map(({ attempt, claim }) => ({ attempt, claim }))
		});
	}
	if (shards.length === 0) throw new Error('Recovered execution ledger has no model attempts.');
	return {
		schemaVersion: 'science-challenge-verification-repair-ledger-snapshot/v1',
		objectiveId: identity.objectiveId,
		executionId: identity.executionId,
		identity,
		recoveryBinding: recovery.binding,
		shards,
		claimCount: shards.reduce((total, shard) => total + shard.attempts.length, 0)
	};
}

function inspectPreModelFailureRoot({
	root,
	planRoot,
	verificationSha256,
	priorCandidateSetSha256,
	identity
}) {
	const resolved = path.resolve(root);
	const initialEvidenceInventory = recoveryEvidenceInventory(resolved, verificationSha256);
	const attempts = [];
	for (const shardId of sortedDirectories(path.join(resolved, 'shards'))) {
		const shardRoot = path.join(resolved, 'shards', shardId);
		const currentAttemptNames = [];
		const conflictingAttemptNames = [];
		for (const attemptName of sortedDirectories(shardRoot)) {
			const match = attemptName.match(/^verification-repair-([a-f0-9]{12})-attempt-(\d{2})$/);
			if (!match) continue;
			if (match[1] !== verificationSha256.slice(0, 12)) {
				conflictingAttemptNames.push(attemptName);
				continue;
			}
			currentAttemptNames.push(attemptName);
		}
		if (currentAttemptNames.length === 0) continue;
		const validationOnlyCohort = currentAttemptNames.every(
			(attemptName) => !existsSync(path.join(shardRoot, attemptName, 'run-summary.json'))
		);
		if (
			!validationOnlyCohort &&
			currentAttemptNames.some(
				(attemptName) => !existsSync(path.join(shardRoot, attemptName, 'run-summary.json'))
			)
		) {
			throw new Error(`${shardId} mixes completed and validation-only pre-model attempts.`);
		}
		const conflictingAttemptEvidence = conflictingRepairAttemptEvidence({
			shardRoot,
			attemptNames: conflictingAttemptNames
		});
		if (!validationOnlyCohort && conflictingAttemptNames.length > 0) {
			throw new Error(`${shardId} contains an unrelated pre-model repair attempt.`);
		}
		for (const attemptName of currentAttemptNames) {
			const match = attemptName.match(/^verification-repair-([a-f0-9]{12})-attempt-(\d{2})$/);
			const attemptRoot = path.join(shardRoot, attemptName);
			if (validationOnlyCohort) {
				attempts.push(
					requireValidationOnlyPreDispatchFailure({
						attemptRoot,
						attemptName,
						attempt: Number(match[2]),
						shardId,
						shardRoot,
						verificationSha256,
						priorCandidateSetSha256,
						identity,
						conflictingAttemptEvidence
					})
				);
				continue;
			}
			const runSummaryPath = path.join(attemptRoot, 'run-summary.json');
			const summary = readJson(runSummaryPath);
			requirePreModelRecoveryObjectiveIsLegacy({
				attemptRoot,
				shardRoot,
				verificationSha256,
				identity
			});
			requirePreModelFailure({
				summary,
				label: `${shardId}/${attemptName}`,
				attemptRoot,
				objectiveVerificationSha256: verificationSha256
			});
			attempts.push({
				shardId,
				attempt: Number(match[2]),
				runSummarySha256: canonicalHash(summary),
				runSummaryFileSha256: sha256(readFileSync(runSummaryPath)),
				error: requireText(summary.error, `${shardId}/${attemptName} error`),
				classification: 'pre-model-local-infrastructure-failure',
				usage: summary.usage ?? null,
				finalResponseSha256: summary.finalResponseSha256,
				lastMessageFileSha256: summary.lastMessageFileSha256,
				modelVersion: summary.modelVersion ?? null,
				partEvidenceSha256: canonicalHash(
					(summary.parts ?? []).map((part) => ({
						usage: part.usage ?? null,
						rawOutputSha256: part.rawOutputSha256 ?? null,
						modelVersion: part.modelVersion ?? null
					}))
				)
			});
		}
	}
	if (attempts.length === 0) throw new Error(`${resolved} has no pre-model repair failures.`);
	const candidateInventory = candidateInventoryForRoot(resolved, verificationSha256);
	const evidenceInventory = recoveryEvidenceInventory(resolved, verificationSha256);
	if (canonicalHash(initialEvidenceInventory) !== canonicalHash(evidenceInventory)) {
		throw new Error(`${resolved} recovery evidence changed while it was being inspected.`);
	}
	const attemptsByShard = new Map();
	for (const record of attempts) {
		const rows = attemptsByShard.get(record.shardId) ?? [];
		rows.push(record.attempt);
		attemptsByShard.set(record.shardId, rows);
	}
	const candidateShardIds = new Set(candidateInventory.map(({ shardId }) => shardId));
	for (const [shardId, shardAttempts] of attemptsByShard) {
		if (!candidateShardIds.has(shardId)) {
			throw new Error(`${shardId} has pre-model attempts but no baseline candidate.`);
		}
		if (canonicalHash(shardAttempts) !== canonicalHash([1, 2, 3, 4])) {
			throw new Error(`${shardId} is not an exhausted four-attempt pre-model cohort.`);
		}
	}
	return {
		path: relativeWithinPlanRoot(planRoot, resolved),
		verificationSha256,
		priorCandidateSetSha256,
		candidateInventorySha256: candidateInventoryCanonicalHash(candidateInventory),
		evidenceFileCount: evidenceInventory.length,
		evidenceBytes: evidenceInventory.reduce((total, file) => total + file.bytes, 0),
		evidenceInventorySha256: canonicalHash(evidenceInventory),
		evidenceInventory,
		attemptCount: attempts.length,
		attemptsSha256: canonicalHash(attempts),
		attempts
	};
}

function inspectSuccessorRoot({ root, planRoot, verificationSha256, priorCandidateSetSha256 }) {
	const resolved = path.resolve(root);
	const candidateInventory = candidateInventoryForSuccessor(resolved, verificationSha256);
	return {
		path: relativeWithinPlanRoot(planRoot, resolved),
		verificationSha256,
		priorCandidateSetSha256,
		baselineCandidateInventorySha256: candidateInventoryCanonicalHash(candidateInventory),
		shardCount: candidateInventory.length
	};
}

function candidateInventoryForSuccessor(root, verificationSha256) {
	const repairDirectory = `verification-repair-${verificationSha256.slice(0, 12)}`;
	const shardsRoot = path.join(root, 'shards');
	const inventory = [];
	for (const shardId of sortedDirectories(shardsRoot)) {
		const priorPath = path.join(shardsRoot, shardId, repairDirectory, 'prior-candidate.json');
		const candidatePath = existsSync(priorPath)
			? priorPath
			: path.join(shardsRoot, shardId, 'candidate.json');
		if (!existsSync(candidatePath)) continue;
		inventory.push({
			shardId,
			candidateSha256: canonicalHash(readJson(candidatePath)),
			candidateFileSha256: sha256(readFileSync(candidatePath))
		});
	}
	if (inventory.length === 0) throw new Error(`${root} has no successor baseline candidates.`);
	return inventory;
}

function candidateInventoryForRoot(root, verificationSha256) {
	const repairDirectory = `verification-repair-${verificationSha256.slice(0, 12)}`;
	const shardsRoot = path.join(root, 'shards');
	const inventory = [];
	for (const shardId of sortedDirectories(shardsRoot)) {
		const priorPath = path.join(shardsRoot, shardId, repairDirectory, 'prior-candidate.json');
		const candidatePath = existsSync(priorPath)
			? priorPath
			: path.join(shardsRoot, shardId, 'candidate.json');
		if (!existsSync(candidatePath)) continue;
		inventory.push({
			shardId,
			candidateSha256: canonicalHash(readJson(candidatePath)),
			candidateFileSha256: sha256(readFileSync(candidatePath))
		});
	}
	if (inventory.length === 0) throw new Error(`${root} has no shard candidates.`);
	return inventory;
}

function conflictingRepairAttemptEvidence({ shardRoot, attemptNames }) {
	const evidence = [];
	for (const directory of attemptNames) {
		const attemptRoot = path.join(shardRoot, directory);
		const witnesses = [];
		for (const name of ['run-summary.json', 'validation.json']) {
			const filePath = path.join(attemptRoot, name);
			if (!existsSync(filePath)) continue;
			const stats = lstatSync(filePath);
			if (!stats.isFile() || stats.isSymbolicLink()) {
				throw new Error(`${directory}/${name} is not regular conflicting-attempt evidence.`);
			}
			const bytes = readFileSync(filePath);
			witnesses.push({ name, sha256: sha256(bytes), bytes: bytes.length });
		}
		if (witnesses.length > 0) evidence.push({ directory, witnesses });
	}
	return evidence;
}

function requirePreModelRecoveryObjectiveIsLegacy({
	attemptRoot,
	shardRoot,
	verificationSha256,
	identity,
	validation: suppliedValidation = null
}) {
	const validationPath = path.join(attemptRoot, 'validation.json');
	const validation =
		suppliedValidation ?? (existsSync(validationPath) ? readJson(validationPath) : null);
	if (
		validation?.verificationRepairAuthority !== undefined ||
		validation?.verificationRepairAuthoritySha256 !== undefined
	) {
		throw new Error(
			'Typed review-rebase objectives cannot use pre-model clone recovery without a recovery manifest that preserves and replays the complete verification-repair authority.'
		);
	}
	const verificationSummaryPath = path.join(
		shardRoot,
		`verification-repair-${verificationSha256.slice(0, 12)}`,
		'verification-summary.json'
	);
	if (!existsSync(verificationSummaryPath)) return;
	const verificationSummary = readJson(verificationSummaryPath);
	if (canonicalHash(verificationSummary) !== verificationSha256) {
		throw new Error('Pre-model recovery verification-summary snapshot differs from its objective.');
	}
	if (!verificationSummaryHasTypedRebaseFields(verificationSummary)) return;
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary,
		allowManifestlessReplay: true
	});
	if (
		authority.parent.verificationSha256 !== identity.verificationSha256 ||
		authority.parent.planSha256 !== identity.planSha256 ||
		authority.parent.candidateSetSha256 !== identity.priorCandidateSetSha256
	) {
		throw new Error(
			'Pre-model recovery typed authority differs from its immutable execution objective.'
		);
	}
	throw new Error(
		'Typed review-rebase objectives cannot use pre-model clone recovery without a recovery manifest that preserves and replays the complete verification-repair authority.'
	);
}

function requireValidationOnlyPreDispatchFailure({
	attemptRoot,
	attemptName,
	attempt,
	shardId,
	shardRoot,
	verificationSha256,
	priorCandidateSetSha256,
	identity,
	conflictingAttemptEvidence
}) {
	const label = `${shardId}/${attemptName}`;
	assertExactEvidenceEntries({
		directory: attemptRoot,
		required: ['validation.json'],
		label
	});
	if (!Array.isArray(conflictingAttemptEvidence) || conflictingAttemptEvidence.length === 0) {
		throw new Error(`${label} has no evidenced conflicting older repair attempt.`);
	}
	if (
		identity.model !== SCIENCE_CHALLENGE_DIRECT_JSON_MODEL ||
		identity.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
		identity.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ||
		identity.thinkingLevel !== 'high' ||
		identity.directPartSize !== 2
	) {
		throw new Error(`${label} differs from the exact validation-only pre-dispatch policy.`);
	}
	const validationPath = path.join(attemptRoot, 'validation.json');
	const validationBytes = readFileSync(validationPath);
	const validation = JSON.parse(validationBytes.toString('utf8'));
	requirePreModelRecoveryObjectiveIsLegacy({
		attemptRoot,
		shardRoot,
		verificationSha256,
		identity,
		validation
	});
	requireNoUnexpectedModelArtifactFields(validation, `${label} validation`);
	if (
		canonicalHash(Object.keys(validation).sort()) !==
		canonicalHash(VALIDATION_ONLY_PRE_DISPATCH_FIELDS)
	) {
		throw new Error(`${label} validation-only evidence shape differs.`);
	}
	const transportError = `Authoring transport failed: ${shardId} contains an unrelated verification-repair attempt.`;
	const expectedIssues = [
		transportError,
		'schemaVersion must be science-challenge-batch/v1.',
		'Batch must contain exactly 8 challenges.',
		'Authoring run did not persist run-summary.json evidence.'
	];
	if (
		validation.status !== 'failed' ||
		canonicalHash(validation.issues) !== canonicalHash(expectedIssues) ||
		validation.transportError !== transportError ||
		validation.verificationRepairSha256 !== verificationSha256 ||
		validation.model !== identity.model ||
		validation.transport !== identity.transport ||
		validation.thinkingLevel !== identity.thinkingLevel ||
		validation.provider !== 'chatgpt' ||
		validation.normalizationVersion !== SCIENCE_CHALLENGE_NORMALIZATION_VERSION ||
		validation.promptVersion !== SCIENCE_CHALLENGE_PROMPT_VERSION ||
		!HASH.test(String(validation.inputSha256 ?? '')) ||
		!HASH.test(String(validation.priorCandidateSha256 ?? '')) ||
		!HASH.test(String(validation.promptSha256 ?? '')) ||
		validation.candidateSha256 !== null ||
		validation.rawCandidateSha256 !== null ||
		validation.runSummarySha256 !== null ||
		validation.modelVersion !== null ||
		validation.modelVersions !== null ||
		validation.transportVersion !== null ||
		validation.directPartSize !== null ||
		canonicalHash(validation.verificationRepairCohortIssues) !== canonicalHash([])
	) {
		throw new Error(`${label} is not the exact validation-only pre-dispatch failure.`);
	}
	const snapshotRoot = path.join(
		shardRoot,
		`verification-repair-${verificationSha256.slice(0, 12)}`
	);
	assertExactEvidenceEntries({
		directory: snapshotRoot,
		required: [
			'input.json',
			'prior-candidate.json',
			'prior-validation.json',
			'verification-summary.json'
		],
		label: `${shardId} repair snapshot`
	});
	const inputs = readJson(path.join(snapshotRoot, 'input.json'));
	const priorCandidate = readJson(path.join(snapshotRoot, 'prior-candidate.json'));
	const priorValidation = readJson(path.join(snapshotRoot, 'prior-validation.json'));
	const verificationSummary = readJson(path.join(snapshotRoot, 'verification-summary.json'));
	const priorCandidateSha256 = canonicalHash(priorCandidate);
	const inputSha256 = canonicalHash({
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		inputs,
		priorCandidateSha256,
		verificationSummarySha256: verificationSha256
	});
	if (
		!Array.isArray(inputs) ||
		inputs.length !== 8 ||
		inputs.some((input) => input?.plan?.shard !== shardId) ||
		canonicalHash(verificationSummary) !== verificationSha256 ||
		verificationSummary.planSha256 !== identity.planSha256 ||
		verificationSummary.candidateSetSha256 !== priorCandidateSetSha256 ||
		identity.priorCandidateSetSha256 !== priorCandidateSetSha256 ||
		validation.priorCandidateSha256 !== priorCandidateSha256 ||
		priorValidation?.candidateSha256 !== priorCandidateSha256 ||
		validation.inputSha256 !== inputSha256
	) {
		throw new Error(`${label} differs from its exact objective or authoring input binding.`);
	}
	return {
		shardId,
		attempt,
		runSummarySha256: null,
		runSummaryFileSha256: null,
		validationSha256: canonicalHash(validation),
		validationFileSha256: sha256(validationBytes),
		inputSha256,
		promptSha256: validation.promptSha256,
		error: transportError,
		classification: 'pre-model-validation-only-pre-dispatch-lineage-conflict',
		usage: null,
		finalResponseSha256: null,
		lastMessageFileSha256: null,
		modelVersion: null,
		partEvidenceSha256: canonicalHash([]),
		conflictingAttemptEvidence,
		conflictingAttemptEvidenceSha256: canonicalHash(conflictingAttemptEvidence)
	};
}

function candidateInventoryCanonicalHash(inventory) {
	return canonicalHash(
		inventory.map(({ shardId, candidateSha256 }) => ({ shardId, candidateSha256 }))
	);
}

function recoveryEvidenceInventory(root, verificationSha256) {
	const prefix = `verification-repair-${verificationSha256.slice(0, 12)}`;
	const files = [];
	const visit = (absolute, relative) => {
		const stats = lstatSync(absolute);
		if (stats.isSymbolicLink()) {
			throw new Error(`Recovery evidence cannot contain a symbolic link: ${relative}`);
		}
		if (stats.isDirectory()) {
			for (const name of readdirSync(absolute).sort()) {
				visit(path.join(absolute, name), path.join(relative, name));
			}
			return;
		}
		if (!stats.isFile()) {
			throw new Error(`Recovery evidence must be regular files: ${relative}`);
		}
		const bytes = readFileSync(absolute);
		files.push({
			path: relative.split(path.sep).join('/'),
			sha256: sha256(bytes),
			bytes: bytes.length
		});
	};
	for (const shardId of sortedDirectories(path.join(root, 'shards'))) {
		const shardRoot = path.join(root, 'shards', shardId);
		for (const name of readdirSync(shardRoot).sort()) {
			if (!['candidate.json', 'validation.json'].includes(name) && !name.startsWith(prefix)) {
				continue;
			}
			visit(path.join(shardRoot, name), path.join('shards', shardId, name));
		}
	}
	for (const name of readdirSync(root).sort()) {
		if (name.startsWith(prefix)) visit(path.join(root, name), name);
	}
	if (files.length === 0) throw new Error(`${root} has no recoverable repair evidence.`);
	return files.sort((left, right) => left.path.localeCompare(right.path));
}

function requirePreModelFailure({
	summary,
	label,
	attemptRoot,
	allowPrompt = false,
	objectiveVerificationSha256 = null
}) {
	requireNoUnexpectedModelArtifactFields(summary, `${label} run summary`);
	if (summary?.status !== 'failed') throw new Error(`${label} is not a failed attempt.`);
	if (!approvedLocalInfrastructureError(summary.error)) {
		throw new Error(`${label} is not an approved local infrastructure failure.`);
	}
	if (!zeroUsage(summary.usage)) {
		throw new Error(`${label} has model usage and cannot be relabelled as pre-model.`);
	}
	if (summary.costUsd !== undefined && summary.costUsd !== null && summary.costUsd !== 0) {
		throw new Error(`${label} has model cost and cannot be relabelled as pre-model.`);
	}
	if (
		summary.finalResponseSha256 !== EMPTY_SHA256 ||
		summary.lastMessageFileSha256 !== EMPTY_SHA256
	) {
		throw new Error(`${label} has model output and cannot be relabelled as pre-model.`);
	}
	if (summary.modelVersion !== undefined && summary.modelVersion !== null) {
		throw new Error(`${label} reports a model version and cannot be relabelled as pre-model.`);
	}
	if (
		summary.modelVersions !== undefined &&
		(!Array.isArray(summary.modelVersions) || summary.modelVersions.length !== 0)
	) {
		throw new Error(`${label} reports model versions and cannot be relabelled as pre-model.`);
	}
	for (const field of [
		'events',
		'agentMessages',
		'reasoningSummaries',
		'responseDeltas',
		'thoughtDeltas',
		'modelEvents',
		'usageEvents',
		'finalJsonEvents',
		'commandActions',
		'failedCommandActions',
		'webSearches',
		'fileChanges',
		'toolCalls',
		'hostedTools'
	]) {
		if (summary[field] !== undefined && summary[field] !== 0) {
			throw new Error(`${label} contains model, reasoning or tool activity in ${field}.`);
		}
	}
	if (summary.threadId !== undefined && summary.threadId !== null) {
		throw new Error(`${label} allocated a model thread and cannot be relabelled as pre-model.`);
	}
	const parts = summary.parts ?? [];
	if (!Array.isArray(parts)) throw new Error(`${label} parts evidence is malformed.`);
	for (const part of parts) {
		if (
			!zeroUsage(part.usage) ||
			part.rawOutputSha256 !== EMPTY_SHA256 ||
			(part.modelVersion !== undefined && part.modelVersion !== null) ||
			(part.costUsd !== undefined && part.costUsd !== null && part.costUsd !== 0) ||
			part.rawCandidateSha256 !== null ||
			part.status !== 'failed'
		) {
			throw new Error(`${label} contains model-bearing part evidence.`);
		}
	}
	if (existsSync(path.join(attemptRoot, 'candidate.json'))) {
		throw new Error(`${label} contains a candidate and cannot be relabelled as pre-model.`);
	}
	const validationPath = path.join(attemptRoot, 'validation.json');
	if (objectiveVerificationSha256 && !existsSync(validationPath)) {
		throw new Error(`${label} has no full-hash objective validation evidence.`);
	}
	if (existsSync(validationPath)) {
		const validation = readJson(validationPath);
		requireNoUnexpectedModelArtifactFields(validation, `${label} validation`);
		if (
			validation?.status !== 'failed' ||
			validation.candidateSha256 !== null ||
			validation.rawCandidateSha256 !== null ||
			(objectiveVerificationSha256 &&
				(validation.verificationRepairSha256 !== objectiveVerificationSha256 ||
					validation.runSummarySha256 !== canonicalHash(summary)))
		) {
			throw new Error(`${label} contains content-bearing validation evidence.`);
		}
	}
	if (parts.length > 0) {
		requirePreModelMultipartEvidence({ summary, label, attemptRoot });
	} else if (summary.transport === 'llm-direct') {
		requirePreModelDirectEvidence({ summary, label, attemptRoot, allowPrompt });
	} else {
		requirePreModelCodexEvidence({ summary, label, attemptRoot });
	}
}

function requireNoUnexpectedModelArtifactFields(value, label, fieldPath = []) {
	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			requireNoUnexpectedModelArtifactFields(entry, label, [...fieldPath, String(index)]);
		}
		return;
	}
	if (!value || typeof value !== 'object') return;
	for (const [field, child] of Object.entries(value)) {
		const childPath = [...fieldPath, field];
		if (
			UNEXPECTED_MODEL_ARTIFACT_FIELD.test(field) &&
			!STANDARD_MODEL_ARTIFACT_FIELDS.has(field) &&
			!emptyArtifactValue(child)
		) {
			throw new Error(
				`${label} contains an unexpected model-bearing field ${childPath.join('.')}.`
			);
		}
		requireNoUnexpectedModelArtifactFields(child, label, childPath);
	}
}

function emptyArtifactValue(value) {
	if (value === undefined || value === null || value === '' || value === 0 || value === false) {
		return true;
	}
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === 'object') return Object.keys(value).length === 0;
	return false;
}

function requirePreModelDirectEvidence({ summary, label, attemptRoot, allowPrompt = false }) {
	assertExactEvidenceEntries({
		directory: attemptRoot,
		required: [
			'events.jsonl',
			'last-message.json',
			'thoughts.txt',
			'request.json',
			'result-metadata.json',
			'run-summary.json'
		],
		optional: [...(allowPrompt ? ['prompt.txt'] : []), 'validation.json'],
		label
	});
	const eventBytes = requireEmptyFile(path.join(attemptRoot, 'events.jsonl'), `${label} events`);
	const responseBytes = requireEmptyFile(
		path.join(attemptRoot, 'last-message.json'),
		`${label} last message`
	);
	const thoughtBytes = requireEmptyFile(
		path.join(attemptRoot, 'thoughts.txt'),
		`${label} thoughts`
	);
	const resultBytes = requireEmptyFile(
		path.join(attemptRoot, 'result-metadata.json'),
		`${label} result metadata`
	);
	const requestBytes = readFileSync(path.join(attemptRoot, 'request.json'));
	if (requestBytes.length === 0) throw new Error(`${label} request evidence is empty.`);
	const request = JSON.parse(requestBytes.toString('utf8'));
	if (
		!Array.isArray(request.tools) ||
		request.tools.length !== 0 ||
		request.model !== summary.model ||
		request.thinkingLevel !== summary.thinkingLevel
	) {
		throw new Error(`${label} request evidence is not the expected no-tools invocation.`);
	}
	const requestEmbeddedSchemaSha256 =
		request.responseJsonSchema === undefined
			? undefined
			: canonicalHash(request.responseJsonSchema);
	const hasResponseSchemaBinding =
		summary.responseSchemaSha256 !== undefined ||
		summary.localResponseSchemaSha256 !== undefined ||
		request.localResponseSchemaSha256 !== undefined ||
		requestEmbeddedSchemaSha256 !== undefined ||
		summary.inputEvidence?.responseSchemaSha256 !== undefined;
	if (hasResponseSchemaBinding) {
		const requestSchemaSha256 = request.localResponseSchemaSha256 ?? requestEmbeddedSchemaSha256;
		if (
			!HASH.test(String(summary.responseSchemaSha256 ?? '')) ||
			!HASH.test(String(requestSchemaSha256 ?? '')) ||
			summary.responseSchemaSha256 !== requestSchemaSha256 ||
			!summary.inputEvidence ||
			typeof summary.inputEvidence !== 'object' ||
			Array.isArray(summary.inputEvidence) ||
			summary.inputEvidence.responseSchemaSha256 !== summary.responseSchemaSha256 ||
			(requestEmbeddedSchemaSha256 !== undefined &&
				requestEmbeddedSchemaSha256 !== summary.responseSchemaSha256) ||
			(summary.localResponseSchemaSha256 !== undefined ||
			request.localResponseSchemaSha256 !== undefined
				? !HASH.test(String(summary.localResponseSchemaSha256 ?? '')) ||
					summary.localResponseSchemaSha256 !== summary.responseSchemaSha256 ||
					summary.localResponseSchemaSha256 !== request.localResponseSchemaSha256
				: false)
		) {
			throw new Error(
				`${label} response schema hash differs from its request or input-evidence binding.`
			);
		}
	}
	requireHashMatch(summary.eventLogSha256, sha256(eventBytes), `${label} event log`);
	requireHashMatch(summary.finalResponseSha256, sha256(responseBytes), `${label} final response`);
	requireHashMatch(summary.lastMessageFileSha256, sha256(responseBytes), `${label} last message`);
	requireHashMatch(summary.thoughtsSha256, sha256(thoughtBytes), `${label} thoughts`);
	requireHashMatch(summary.requestSha256, sha256(requestBytes), `${label} request`);
	if (
		summary.requestCanonicalSha256 !== undefined &&
		summary.requestCanonicalSha256 !== canonicalHash(request)
	) {
		throw new Error(`${label} request canonical hash differs from its bytes.`);
	}
	if (summary.resultMetadataSha256 !== null || resultBytes.length !== 0) {
		throw new Error(`${label} contains result metadata.`);
	}
	if (
		(summary.provider !== undefined && summary.provider !== null) ||
		(summary.blocked !== undefined && summary.blocked !== null)
	) {
		throw new Error(`${label} contains provider result metadata.`);
	}
}

function requirePreModelCodexEvidence({ summary, label, attemptRoot }) {
	assertExactEvidenceEntries({
		directory: attemptRoot,
		required: ['events.jsonl', 'last-message.json', 'run-summary.json'],
		optional: ['validation.json'],
		label
	});
	const eventBytes = requireEmptyFile(path.join(attemptRoot, 'events.jsonl'), `${label} events`);
	const responseBytes = requireEmptyFile(
		path.join(attemptRoot, 'last-message.json'),
		`${label} last message`
	);
	requireHashMatch(summary.eventLogSha256, sha256(eventBytes), `${label} event log`);
	requireHashMatch(summary.finalResponseSha256, sha256(responseBytes), `${label} final response`);
	requireHashMatch(summary.lastMessageFileSha256, sha256(responseBytes), `${label} last message`);
	if (
		summary.failedCommands !== undefined &&
		canonicalHash(summary.failedCommands) !== canonicalHash([])
	) {
		throw new Error(`${label} contains failed command evidence.`);
	}
}

function requirePreModelMultipartEvidence({ summary, label, attemptRoot }) {
	assertExactEvidenceEntries({
		directory: attemptRoot,
		required: ['events.jsonl', 'last-message.json', 'run-summary.json', 'parts'],
		optional: ['validation.json'],
		label
	});
	const responseBytes = requireEmptyFile(
		path.join(attemptRoot, 'last-message.json'),
		`${label} multipart last message`
	);
	requireHashMatch(summary.finalResponseSha256, sha256(responseBytes), `${label} final response`);
	requireHashMatch(summary.lastMessageFileSha256, sha256(responseBytes), `${label} last message`);
	if (summary.partsSha256 !== canonicalHash(summary.parts)) {
		throw new Error(`${label} multipart parts hash differs from its records.`);
	}
	const eventsPath = path.join(attemptRoot, 'events.jsonl');
	const eventBytes = readFileSync(eventsPath);
	requireHashMatch(summary.eventLogSha256, sha256(eventBytes), `${label} event log`);
	const events = parseJsonLines(eventBytes, `${label} multipart event log`);
	if (events.length !== summary.parts.length) {
		throw new Error(`${label} multipart event count differs from its failed part records.`);
	}
	for (const [index, record] of summary.parts.entries()) {
		const expectedPartId = `part-${String(index + 1).padStart(2, '0')}`;
		if (record.partId !== expectedPartId || record.index !== index + 1) {
			throw new Error(`${label} multipart part order is invalid.`);
		}
		const partRoot = path.join(attemptRoot, 'parts', expectedPartId);
		const runSummaryPath = safeAttemptEvidencePath(
			attemptRoot,
			record.runSummaryPath,
			`${label} ${expectedPartId} run summary`
		);
		if (path.dirname(runSummaryPath) !== partRoot) {
			throw new Error(`${label} ${expectedPartId} run summary path is not canonical.`);
		}
		const partSummary = readJson(runSummaryPath);
		if (record.runSummarySha256 !== canonicalHash(partSummary)) {
			throw new Error(`${label} ${expectedPartId} run summary hash differs.`);
		}
		requirePreModelFailure({
			summary: partSummary,
			label: `${label}/${expectedPartId}`,
			attemptRoot: partRoot,
			allowPrompt: true
		});
		const promptBytes = readFileSync(
			safeAttemptEvidencePath(attemptRoot, record.promptPath, `${label} ${expectedPartId} prompt`)
		);
		const requestBytes = readFileSync(
			safeAttemptEvidencePath(attemptRoot, record.requestPath, `${label} ${expectedPartId} request`)
		);
		const partEventBytes = readFileSync(
			safeAttemptEvidencePath(attemptRoot, record.eventLogPath, `${label} ${expectedPartId} events`)
		);
		const rawOutputBytes = readFileSync(
			safeAttemptEvidencePath(
				attemptRoot,
				record.rawOutputPath,
				`${label} ${expectedPartId} output`
			)
		);
		const thoughtsBytes = readFileSync(
			safeAttemptEvidencePath(
				attemptRoot,
				record.thoughtsPath,
				`${label} ${expectedPartId} thoughts`
			)
		);
		const resultBytes = readFileSync(
			safeAttemptEvidencePath(
				attemptRoot,
				record.resultMetadataPath,
				`${label} ${expectedPartId} result metadata`
			)
		);
		for (const [field, bytes] of [
			['promptSha256', promptBytes],
			['requestSha256', requestBytes],
			['eventLogSha256', partEventBytes],
			['rawOutputSha256', rawOutputBytes],
			['thoughtsSha256', thoughtsBytes],
			['resultMetadataSha256', resultBytes]
		]) {
			requireHashMatch(record[field], sha256(bytes), `${label} ${expectedPartId} ${field}`);
		}
		if (
			partEventBytes.length !== 0 ||
			rawOutputBytes.length !== 0 ||
			thoughtsBytes.length !== 0 ||
			resultBytes.length !== 0
		) {
			throw new Error(`${label} ${expectedPartId} contains model-bearing bytes.`);
		}
		const event = events[index];
		if (
			event?.type !== 'part.finished' ||
			event.partId !== expectedPartId ||
			event.status !== 'failed' ||
			event.rawOutputSha256 !== EMPTY_SHA256 ||
			event.runSummarySha256 !== record.runSummarySha256
		) {
			throw new Error(`${label} multipart event contains unexpected model evidence.`);
		}
	}
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

function validateMultipartContinuationClaim({
	claim,
	identity,
	shardId,
	attempt,
	outputRootSha256,
	sourceAttemptClaim
}) {
	const invocationPolicy = claim?.invocationPolicy;
	const invocationPolicyValid =
		invocationPolicy?.schemaVersion ===
			'science-challenge-verification-repair-multipart-continuation-invocation/v1' &&
		invocationPolicy.model === identity.model &&
		invocationPolicy.transport === identity.transport &&
		invocationPolicy.responseMode === identity.responseMode &&
		invocationPolicy.thinkingLevel === identity.thinkingLevel &&
		invocationPolicy.directPartSize === identity.directPartSize &&
		['configured-proxy', 'default-chatgpt-profile'].includes(invocationPolicy.authMode) &&
		invocationPolicy.operation === 'streamText' &&
		invocationPolicy.providerSchemaApplied === false &&
		Array.isArray(invocationPolicy.tools) &&
		invocationPolicy.tools.length === 0 &&
		invocationPolicy.maxCalls === 1;
	if (
		claim?.schemaVersion !== 'science-challenge-verification-repair-multipart-part-claim/v1' ||
		claim.objectiveId !== identity.objectiveId ||
		claim.executionId !== identity.executionId ||
		claim.shardId !== shardId ||
		claim.attempt !== attempt ||
		attempt !== REPAIR_ATTEMPT_LIMIT ||
		claim.outputRootSha256 !== outputRootSha256 ||
		claim.sourceAttemptClaimSha256 !== canonicalHash(sourceAttemptClaim) ||
		!HASH.test(String(claim.planSha256 ?? '')) ||
		claim.planSha256 !== identity.planSha256 ||
		!HASH.test(String(claim.inputSha256 ?? '')) ||
		!HASH.test(String(claim.fullPartPlanSha256 ?? '')) ||
		!HASH.test(String(claim.partPlanSha256 ?? '')) ||
		!HASH.test(String(claim.sourceAttemptSha256 ?? '')) ||
		!HASH.test(String(claim.sourcePartsSha256 ?? '')) ||
		!HASH.test(String(claim.priorContinuationPartsSha256 ?? '')) ||
		!HASH.test(String(claim.priorContinuationClaimsSha256 ?? '')) ||
		!HASH.test(String(claim.promptSha256 ?? '')) ||
		!HASH.test(String(claim.responseSchemaSha256 ?? '')) ||
		!/^part-\d{2}$/.test(String(claim.partId ?? '')) ||
		!Number.isInteger(claim.partIndex) ||
		claim.partIndex < 1 ||
		claim.partId !== `part-${String(claim.partIndex).padStart(2, '0')}` ||
		!Number.isInteger(claim.sourceAttemptedPartCount) ||
		claim.sourceAttemptedPartCount < 1 ||
		!Number.isInteger(claim.expectedPartCount) ||
		claim.expectedPartCount <= claim.sourceAttemptedPartCount ||
		claim.partIndex <= claim.sourceAttemptedPartCount ||
		claim.partIndex > claim.expectedPartCount ||
		!Array.isArray(claim.rowIds) ||
		claim.rowIds.length < 1 ||
		claim.rowIds.some((id) => typeof id !== 'string' || !id.trim()) ||
		new Set(claim.rowIds).size !== claim.rowIds.length ||
		!invocationPolicyValid ||
		claim.invocationPolicySha256 !== canonicalHash(invocationPolicy)
	) {
		throw new Error(`${shardId} ${String(claim?.partId)} multipart continuation claim is invalid.`);
	}
}

function validateMultipartContinuationInvocationStart({
	invocation,
	identity,
	shardId,
	attempt,
	outputRootSha256,
	claim,
	claimPath
}) {
	if (
		invocation?.schemaVersion !==
			SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MULTIPART_INVOCATION_SCHEMA ||
		invocation.objectiveId !== identity.objectiveId ||
		invocation.executionId !== identity.executionId ||
		invocation.shardId !== shardId ||
		invocation.attempt !== attempt ||
		invocation.partId !== claim.partId ||
		invocation.outputRootSha256 !== outputRootSha256 ||
		invocation.claimSha256 !== canonicalHash(claim) ||
		invocation.claimByteSha256 !== sha256(readFileSync(claimPath)) ||
		invocation.promptSha256 !== claim.promptSha256 ||
		invocation.responseSchemaSha256 !== claim.responseSchemaSha256
	) {
		throw new Error(`${shardId} ${claim.partId} invocation-start journal is invalid.`);
	}
}

function zeroUsage(value) {
	if (value === undefined || value === null) return true;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	return Object.values(value).every(
		(count) => typeof count === 'number' && Number.isFinite(count) && count === 0
	);
}

function approvedLocalInfrastructureError(value) {
	if (typeof value !== 'string') return false;
	if (value.includes('\n') || value.includes('\r')) {
		return value.replace(/\r\n/g, '\n') === CODEX_LOCAL_INFRASTRUCTURE_ERROR;
	}
	return LOCAL_INFRASTRUCTURE_ERROR.test(value.trim());
}

function validateRecoveryPreflight(preflight, identity) {
	if (
		!preflight ||
		preflight.schemaVersion !== SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_SCHEMA ||
		preflight.status !== 'passed' ||
		preflight.token !== SCIENCE_CHALLENGE_DIRECT_PREFLIGHT_TOKEN ||
		preflight.provider !== 'chatgpt' ||
		typeof preflight.authMode !== 'string' ||
		!preflight.authMode.trim() ||
		!Number.isInteger(preflight.durationMilliseconds) ||
		preflight.durationMilliseconds < 0
	) {
		throw new Error('Recovery requires an exact passed content-free transport preflight.');
	}
	for (const field of ['model', 'transport', 'responseMode', 'thinkingLevel']) {
		if (preflight[field] !== identity[field]) {
			throw new Error(`Recovery preflight ${field} differs from the execution identity.`);
		}
	}
	if (
		preflight.modelVersion !== null &&
		(typeof preflight.modelVersion !== 'string' || !preflight.modelVersion.trim())
	) {
		throw new Error('Recovery preflight modelVersion is invalid.');
	}
}

function assertExactEvidenceEntries({ directory, required, optional = [], label }) {
	const actual = readdirSync(directory, { withFileTypes: true });
	const allowed = new Set([...required, ...optional]);
	const unexpected = actual.map((entry) => entry.name).filter((name) => !allowed.has(name));
	const missing = required.filter((name) => !actual.some((entry) => entry.name === name));
	if (unexpected.length || missing.length) {
		throw new Error(
			`${label} evidence shape differs; missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}].`
		);
	}
	for (const entry of actual) {
		if (entry.name === 'parts') {
			if (!entry.isDirectory()) throw new Error(`${label} parts evidence is not a directory.`);
		} else if (!entry.isFile()) {
			throw new Error(`${label} evidence ${entry.name} is not a regular file.`);
		}
	}
}

function requireEmptyFile(filePath, label) {
	const bytes = readFileSync(filePath);
	if (bytes.length !== 0) throw new Error(`${label} contains model-bearing bytes.`);
	return bytes;
}

function requireHashMatch(recorded, actual, label) {
	if (recorded !== actual) throw new Error(`${label} hash differs from immutable bytes.`);
}

function parseJsonLines(bytes, label) {
	const text = bytes.toString('utf8');
	if (!text.trim()) return [];
	try {
		return text
			.split(/\r?\n/)
			.filter((line) => line.trim())
			.map((line) => JSON.parse(line));
	} catch (error) {
		throw new Error(
			`${label} is not valid JSONL: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error }
		);
	}
}

function safeAttemptEvidencePath(attemptRoot, relativePath, label) {
	if (typeof relativePath !== 'string' || !relativePath.trim()) {
		throw new Error(`${label} path is missing.`);
	}
	const resolvedRoot = path.resolve(attemptRoot);
	const resolved = path.resolve(resolvedRoot, relativePath);
	if (!resolved.startsWith(`${resolvedRoot}${path.sep}`) || !existsSync(resolved)) {
		throw new Error(`${label} path is unsafe or missing.`);
	}
	return resolved;
}

function canonicalExistingDirectory(directory) {
	const resolved = realpathSync(path.resolve(directory));
	if (!statSync(resolved).isDirectory()) throw new Error(`Expected directory: ${directory}`);
	return resolved;
}

function safeExistingFileWithinRoot(filePath, root, label) {
	const resolvedRoot = realpathSync(path.resolve(root));
	const resolved = realpathSync(path.resolve(filePath));
	if (!resolved.startsWith(`${resolvedRoot}${path.sep}`) || !statSync(resolved).isFile()) {
		throw new Error(`${label} is missing, unsafe or not a regular file.`);
	}
	return resolved;
}

function localRepairShardIds(outputRoot, identity) {
	const shardsRoot = path.join(path.resolve(outputRoot), 'shards');
	const repairPrefix = `verification-repair-${identity.verificationSha256.slice(0, 12)}-attempt-`;
	return sortedDirectories(shardsRoot).filter((shardId) => {
		const names = sortedDirectories(path.join(shardsRoot, shardId));
		return names.some(
			(name) => name.startsWith(repairPrefix) && /^\d{2}$/.test(name.slice(repairPrefix.length))
		);
	});
}

function planExistingVerificationRepairExecutionAttempts({ ledgerRoot, identity, outputRoot }) {
	validateExecutionIdentity(identity);
	const resolvedOutputRoot = path.resolve(outputRoot);
	const imports = [];
	const shardIds = [
		...new Set([
			...localRepairShardIds(resolvedOutputRoot, identity),
			...sortedDirectories(path.join(path.resolve(ledgerRoot), 'shards'))
		])
	].sort();
	for (const shardId of shardIds) {
		const localAttempts = inspectLocalVerificationRepairAttempts({
			outputRoot: resolvedOutputRoot,
			identity,
			shardId
		}).map((record) => ({
			...record,
			executionIdentity: completedLocalAttemptExecutionIdentity({
				record,
				objectiveIdentity: identity
			})
		}));
		if (localAttempts.length > REPAIR_ATTEMPT_LIMIT) {
			throw new Error(
				`${shardId} local repair attempts exceed the immutable ${REPAIR_ATTEMPT_LIMIT}-attempt ceiling.`
			);
		}
		const global = inspectVerificationRepairExecutionAttempts({
			ledgerRoot,
			identity,
			shardId
		});
		if (global.attempts.length > localAttempts.length) {
			throw new Error(`${shardId} global ledger contains attempts absent from the successor root.`);
		}
		for (const [index, globalAttempt] of global.attempts.entries()) {
			const local = localAttempts[index];
			if (
				globalAttempt.claim.executionId !== local?.executionIdentity.executionId ||
				globalAttempt.claim.outputRootSha256 !== canonicalHash(resolvedOutputRoot)
			) {
				throw new Error(
					`${shardId} global repair attempt ${globalAttempt.attempt} differs from its immutable local run evidence.`
				);
			}
		}
		for (const local of localAttempts.slice(global.attempts.length)) {
			imports.push({
				shardId,
				attempt: local.attempt,
				executionIdentity: local.executionIdentity
			});
		}
	}
	return { imports, shardIds };
}

function assertPlannedVerificationRepairImportsCommitted({
	ledgerRoot,
	identity,
	outputRoot,
	shardIds
}) {
	for (const shardId of shardIds) {
		const localAttempts = inspectLocalVerificationRepairAttempts({
			outputRoot,
			identity,
			shardId
		});
		const global = inspectVerificationRepairExecutionAttempts({
			ledgerRoot,
			identity,
			shardId
		});
		requireMatchingVerificationRepairAttemptLedgers({
			localAttempts,
			globalAttempts: global.attempts,
			shardId,
			outputRoot
		});
		for (const [index, localAttempt] of localAttempts.entries()) {
			const localIdentity = completedLocalAttemptExecutionIdentity({
				record: localAttempt,
				objectiveIdentity: identity
			});
			if (global.attempts[index]?.claim.executionId !== localIdentity.executionId) {
				throw new Error(
					`${shardId} global repair attempt ${localAttempt.attempt} policy differs from its immutable local run evidence.`
				);
			}
		}
	}
}

function recoveryBindingValue({ identity, manifest, successorRoot }) {
	return {
		schemaVersion: 'science-challenge-verification-repair-recovery-binding/v2',
		objectiveId: identity.objectiveId,
		executionId: identity.executionId,
		executionIdentity: identity,
		manifestSha256: canonicalHash(manifest),
		successorRootSha256: canonicalHash(path.resolve(successorRoot))
	};
}

function recoveryTransactionValue({ identity, manifest, successorRoot, outputPath, imports }) {
	return {
		schemaVersion: 'science-challenge-verification-repair-recovery-transaction/v1',
		status: 'preparing',
		objectiveId: identity.objectiveId,
		executionId: identity.executionId,
		executionIdentity: identity,
		manifestSha256: canonicalHash(manifest),
		successorRootPath: path.resolve(successorRoot),
		successorRootSha256: canonicalHash(path.resolve(successorRoot)),
		outputPath: outputPath === null ? null : path.resolve(outputPath),
		imports
	};
}

function recoveryTransactionPath(ledgerRoot, executionId) {
	return path.join(path.resolve(ledgerRoot), RECOVERY_TRANSACTION_DIRECTORY, `${executionId}.json`);
}

function readRecoveryTransaction({ ledgerRoot, identity }) {
	const transactionPath = recoveryTransactionPath(ledgerRoot, identity.executionId);
	if (!existsSync(transactionPath)) return null;
	const transaction = readJson(transactionPath);
	validateRecoveryTransaction(transaction, identity);
	return transaction;
}

function validateRecoveryTransactionRequest(
	transaction,
	{ identity, manifest, successorRoot, outputPath }
) {
	const expected = recoveryTransactionValue({
		identity,
		manifest,
		successorRoot,
		outputPath,
		imports: transaction.imports
	});
	if (canonicalHash({ ...transaction, status: 'preparing' }) !== canonicalHash(expected)) {
		throw new Error('Existing verification-repair recovery transaction differs from this request.');
	}
}

function validateRecoveryTransaction(transaction, identity) {
	if (
		transaction?.schemaVersion !==
			'science-challenge-verification-repair-recovery-transaction/v1' ||
		!['preparing', 'committed'].includes(transaction.status) ||
		transaction.objectiveId !== identity.objectiveId ||
		transaction.executionId !== identity.executionId ||
		transaction.manifestSha256 === undefined ||
		!HASH.test(String(transaction.manifestSha256)) ||
		transaction.successorRootSha256 !==
			canonicalHash(path.resolve(transaction.successorRootPath ?? '')) ||
		(transaction.outputPath !== null &&
			(typeof transaction.outputPath !== 'string' ||
				path.resolve(transaction.outputPath) !== transaction.outputPath)) ||
		!Array.isArray(transaction.imports)
	) {
		throw new Error('Verification-repair recovery transaction is invalid.');
	}
	validateExecutionIdentity(transaction.executionIdentity);
	if (canonicalHash(transaction.executionIdentity) !== canonicalHash(identity)) {
		throw new Error('Verification-repair recovery transaction execution identity differs.');
	}
	const seen = new Set();
	for (const record of transaction.imports) {
		const key = `${record?.shardId}:${record?.attempt}`;
		if (
			!SAFE_SHARD.test(String(record?.shardId ?? '')) ||
			!Number.isInteger(record?.attempt) ||
			record.attempt < 1 ||
			record.attempt > REPAIR_ATTEMPT_LIMIT ||
			seen.has(key)
		) {
			throw new Error('Verification-repair recovery transaction imports are invalid.');
		}
		seen.add(key);
		validateExecutionIdentity(record.executionIdentity);
		if (record.executionIdentity.objectiveId !== identity.objectiveId) {
			throw new Error('Verification-repair recovery import targets another objective.');
		}
	}
}

function validateRecoveryTransactionAttemptEvidence({
	transaction,
	identity,
	outputRoot,
	requiredImports
}) {
	const transactionByKey = new Map(
		transaction.imports.map((record) => [`${record.shardId}:${record.attempt}`, record])
	);
	for (const required of requiredImports) {
		const recorded = transactionByKey.get(`${required.shardId}:${required.attempt}`);
		if (
			!recorded ||
			canonicalHash(recorded.executionIdentity) !== canonicalHash(required.executionIdentity)
		) {
			throw new Error(
				`${required.shardId} attempt ${required.attempt} is missing from the replayable recovery transaction.`
			);
		}
	}
	for (const recorded of transaction.imports) {
		const local = inspectLocalVerificationRepairAttempts({
			outputRoot,
			identity,
			shardId: recorded.shardId
		}).find((attempt) => attempt.attempt === recorded.attempt);
		if (!local) {
			throw new Error(
				`${recorded.shardId} recovery transaction attempt ${recorded.attempt} is absent from immutable successor evidence.`
			);
		}
		const localIdentity = completedLocalAttemptExecutionIdentity({
			record: local,
			objectiveIdentity: identity
		});
		if (canonicalHash(localIdentity) !== canonicalHash(recorded.executionIdentity)) {
			throw new Error(
				`${recorded.shardId} recovery transaction attempt ${recorded.attempt} policy differs from immutable successor evidence.`
			);
		}
	}
}

function preflightImmutableTarget(filePath, bytes, label) {
	if (!existsSync(filePath)) return;
	if (!readFileSync(filePath).equals(bytes)) {
		throw new Error(`Immutable ${label} differs at ${filePath}.`);
	}
}

function completedLocalAttemptExecutionIdentity({ record, objectiveIdentity }) {
	const summaryPath = path.join(record.path, 'run-summary.json');
	const validationPath = path.join(record.path, 'validation.json');
	if (!existsSync(summaryPath) || !existsSync(validationPath)) {
		throw new Error(
			`Repair attempt ${record.attempt} is still running or incomplete and cannot be archived.`
		);
	}
	const summary = readJson(summaryPath);
	const validation = readJson(validationPath);
	if (
		!['passed', 'failed'].includes(validation?.status) ||
		validation.verificationRepairSha256 !== objectiveIdentity.verificationSha256 ||
		validation.runSummarySha256 !== canonicalHash(summary)
	) {
		throw new Error(
			`Repair attempt ${record.attempt} validation does not bind its objective and immutable run summary.`
		);
	}
	requireAttemptRepairAuthority({
		record,
		validation,
		objectiveIdentity
	});
	const transport = requireText(
		validation.transport ?? summary.transport,
		`repair attempt ${record.attempt} transport`
	);
	const model = requireText(
		validation.model ?? summary.model,
		`repair attempt ${record.attempt} model`
	);
	const thinkingLevel = requireText(
		validation.thinkingLevel ?? summary.thinkingLevel,
		`repair attempt ${record.attempt} thinking level`
	);
	for (const [field, expected] of [
		['transport', transport],
		['model', model],
		['thinkingLevel', thinkingLevel]
	]) {
		if (summary[field] !== undefined && summary[field] !== expected) {
			throw new Error(
				`Repair attempt ${record.attempt} ${field} differs between run and validation evidence.`
			);
		}
	}
	let responseMode = null;
	let directPartSize = null;
	if (transport === SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT) {
		const transportVersion = validation.transportVersion ?? summary.transportVersion;
		if (
			[
				SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
				SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION
			].includes(transportVersion)
		) {
			responseMode = SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON;
		} else if (
			[
				SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT_VERSION,
				SCIENCE_CHALLENGE_DIRECT_MULTIPART_TRANSPORT_VERSION
			].includes(transportVersion)
		) {
			responseMode = SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_STRUCTURED_JSON;
		} else {
			throw new Error(`Repair attempt ${record.attempt} direct transport version is unsupported.`);
		}
		const recordedResponseMode = validation.responseMode ?? summary.responseMode;
		if (recordedResponseMode !== undefined && recordedResponseMode !== responseMode) {
			throw new Error(
				`Repair attempt ${record.attempt} response mode differs from its transport version.`
			);
		}
		directPartSize = validation.directPartSize ?? summary.partSize ?? null;
		if (directPartSize !== null) {
			requirePositiveInteger(directPartSize, `repair attempt ${record.attempt} direct part size`);
			if (directPartSize > 7) {
				throw new Error(`Repair attempt ${record.attempt} direct part size exceeds 7.`);
			}
		}
		if (
			thinkingLevel !== 'max' &&
			!(
				responseMode === SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON &&
				thinkingLevel === 'high'
			)
		) {
			throw new Error(
				`Repair attempt ${record.attempt} thinking level is incompatible with its direct response mode.`
			);
		}
	} else if (transport !== SCIENCE_CHALLENGE_CODEX_SDK_TRANSPORT) {
		throw new Error(`Repair attempt ${record.attempt} transport is unsupported.`);
	} else if (thinkingLevel !== 'max') {
		throw new Error(`Repair attempt ${record.attempt} codex-sdk thinking level must be max.`);
	}
	return scienceChallengeVerificationRepairExecutionIdentity({
		planSha256: objectiveIdentity.planSha256,
		verificationSha256: objectiveIdentity.verificationSha256,
		priorCandidateSetSha256: objectiveIdentity.priorCandidateSetSha256,
		model,
		transport,
		responseMode,
		thinkingLevel,
		directPartSize
	});
}

function requireAttemptRepairAuthority({ record, validation, objectiveIdentity }) {
	const hasAuthority = validation.verificationRepairAuthority !== undefined;
	const hasAuthorityHash = validation.verificationRepairAuthoritySha256 !== undefined;
	if (hasAuthority !== hasAuthorityHash) {
		throw new Error(
			`Repair attempt ${record.attempt} has partial verification-repair authority evidence.`
		);
	}
	const snapshotPath = path.join(
		path.dirname(record.path),
		`verification-repair-${objectiveIdentity.verificationSha256.slice(0, 12)}`,
		'verification-summary.json'
	);
	if (!existsSync(snapshotPath)) {
		if (hasAuthority) {
			throw new Error(
				`Repair attempt ${record.attempt} has typed authority but no immutable verification-summary snapshot.`
			);
		}
		return null;
	}
	const verificationSummary = readJson(snapshotPath);
	if (canonicalHash(verificationSummary) !== objectiveIdentity.verificationSha256) {
		throw new Error(
			`Repair attempt ${record.attempt} verification-summary snapshot differs from its objective.`
		);
	}
	if (!verificationSummaryHasTypedRebaseFields(verificationSummary)) {
		if (hasAuthority) {
			throw new Error(
				`Repair attempt ${record.attempt} supplies typed authority for a legacy objective.`
			);
		}
		return null;
	}
	if (!hasAuthority) {
		throw new Error(
			`Repair attempt ${record.attempt} omits the typed verification-repair authority.`
		);
	}
	const authority = buildScienceChallengeVerificationRepairAuthority({
		verificationSummary,
		suppliedAuthority: validation.verificationRepairAuthority,
		allowManifestlessReplay: true
	});
	if (
		validation.verificationRepairAuthoritySha256 !== canonicalHash(authority) ||
		authority.parent.verificationSha256 !== objectiveIdentity.verificationSha256 ||
		authority.parent.planSha256 !== objectiveIdentity.planSha256 ||
		authority.parent.candidateSetSha256 !== objectiveIdentity.priorCandidateSetSha256
	) {
		throw new Error(
			`Repair attempt ${record.attempt} typed authority differs from its fresh objective.`
		);
	}
	return authority;
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

function relativeWithinPlanRoot(planRoot, target) {
	const resolvedRoot = realpathSync(path.resolve(planRoot));
	const resolvedTarget = realpathSync(path.resolve(target));
	const relative = path.relative(resolvedRoot, resolvedTarget);
	if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error(`Recovery path is outside or equal to the canonical plan root: ${target}`);
	}
	return relative;
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

function verificationSummaryHasTypedRebaseFields(summary) {
	return TYPED_REBASE_SUMMARY_FIELDS.some((field) => summary?.[field] !== undefined);
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
