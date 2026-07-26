import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
	buildScienceChallengeAuthoringParts,
	mergeScienceChallengeAuthoringPartBatches,
	readScienceChallengeDirectMultipartEvidence,
	scienceChallengeMultipartPartPaths
} from './science-challenge-authoring-parts.mjs';
import {
	isScienceChallengeDirectMultipartRunSummary,
	validateScienceChallengeDirectPromptJsonRunPolicy
} from './science-challenge-authoring-run-policy.mjs';
import {
	SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT,
	SCIENCE_CHALLENGE_DIRECT_MULTIPART_EVENT_SCHEMA,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION,
	SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON
} from './science-challenge-authoring-transport.mjs';
import {
	SCIENCE_CHALLENGE_QUESTION_PRESENTATION_PART_DEFAULT_SCHEMA,
	salvageScienceChallengeQuestionPresentationNullDefaultPart
} from './science-challenge-multipart-plan-salvage.mjs';
import {
	SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
	SCIENCE_CHALLENGE_PROMPT_VERSION,
	canonicalHash,
	challengeBatchOutputSchema,
	normalizeGeneratedChallengeBatch,
	sha256,
	stableStringify
} from './science-challenge-release.mjs';
import {
	SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS,
	inspectVerificationRepairAttempts,
	invalidatedVerificationRepairAttempts,
	readVerificationRepairCohortState,
	scienceChallengeVerificationRepairRunId,
	validateVerificationRepairCandidate,
	writeImmutableRepairEvidence,
	writeImmutableRepairJson
} from './science-challenge-verification-repair-transaction.mjs';
import {
	claimVerificationRepairMultipartContinuationPart,
	inspectVerificationRepairExecutionAttempts,
	inspectVerificationRepairMultipartContinuationClaims,
	requireMatchingVerificationRepairAttemptLedgers,
	scienceChallengeVerificationRepairObjectiveIdentity,
	startVerificationRepairMultipartContinuationInvocation,
	verificationRepairExecutionLedgerRoot
} from './science-challenge-verification-repair-lineage.mjs';

export const SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_SCHEMA =
	'science-challenge-exhausted-multipart-continuation/v1';
export const SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_VALIDATION_SCHEMA =
	'science-challenge-exhausted-multipart-continuation-validation/v1';
export const SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_PLAN_SCHEMA =
	'science-challenge-exhausted-multipart-continuation-plan/v1';

const ATTEMPT = SCIENCE_CHALLENGE_VERIFICATION_REPAIR_MAX_ATTEMPTS;
const CONTINUATION_FAILURE_SCHEMA = 'science-challenge-exhausted-multipart-continuation-failure/v1';
const COLLECTION_VALIDATION_SNAPSHOT_SCHEMA =
	'science-challenge-exhausted-multipart-continuation-collection-snapshot/v1';
const RETRYABLE_COLLECTION_FAILURE_PREFIX =
	'Multipart continuation failed full collection validation.\n';
const HASH = /^[a-f0-9]{64}$/;
const REQUIRED_PART_FILES = Object.freeze([
	'prompt.txt',
	'request.json',
	'events.jsonl',
	'last-message.json',
	'thoughts.txt',
	'result-metadata.json',
	'run-summary.json'
]);
const PREPARED_PART_FILES = Object.freeze(['prompt.txt']);

export function requireExclusiveScienceChallengeMultipartRecoveryLineage({
	shardId,
	salvageDirectories,
	continuationDirectories
}) {
	if (!Array.isArray(salvageDirectories) || !Array.isArray(continuationDirectories)) {
		throw new Error('Multipart recovery lineage directories must be arrays.');
	}
	if (salvageDirectories.length > 0 && continuationDirectories.length > 0) {
		throw new Error(
			`${String(shardId)} contains both multipart salvage and continuation lineage; recovery is ambiguous.`
		);
	}
}

export function scienceChallengeMultipartContinuationDirectory({
	shardDir,
	repairSha256,
	attempt = ATTEMPT
}) {
	requireHash(repairSha256, 'verification repair SHA-256');
	if (attempt !== ATTEMPT) {
		throw new Error('Exhausted multipart continuation is restricted to attempt 4.');
	}
	return path.join(
		path.resolve(shardDir),
		`verification-repair-${scienceChallengeVerificationRepairRunId(
			repairSha256
		)}-attempt-04-multipart-continuation`
	);
}

/**
 * Read-only eligibility and replay inspection. It permits one deterministic prompt-only
 * preparation before the irreversible invocation marker, proves every completed claim has a
 * policy-valid local part, and closes any invocation-started part with incomplete evidence.
 */
export function inspectScienceChallengeMultipartContinuation(options) {
	try {
		const context = buildContext(options);
		if (context.status !== 'passed') return context;
		return {
			status: 'passed',
			issues: [],
			action:
				context.completedParts.length === context.missingParts.length ? 'complete' : 'eligible',
			shardId: options.shardId,
			sourceAttempt: ATTEMPT,
			sourceAttemptedPartCount: context.sourceAttemptedPartCount,
			expectedPartCount: context.parts.length,
			missingPartIds: context.missingParts.map((part) => part.partId),
			completedPartIds: context.completedParts.map((part) => part.part.partId),
			nextPartId: context.missingParts[context.completedParts.length]?.partId ?? null,
			continuationDir: context.continuationDir,
			plan: context.plan,
			context
		};
	} catch (error) {
		return failed(errorMessage(error));
	}
}

/**
 * Execute only the unclaimed suffix part slots. The caller supplies the normal direct prompt-JSON
 * single-turn runner; tests can inject an in-memory runner without network access.
 */
export async function runScienceChallengeMultipartContinuation({
	runPartImpl,
	dryRun = false,
	resume = false,
	timeoutMs,
	authMode,
	onJournalPhase = null,
	...options
}) {
	if (onJournalPhase !== null && typeof onJournalPhase !== 'function') {
		return failed('Multipart continuation onJournalPhase must be a function when supplied.');
	}
	const inspected = inspectScienceChallengeMultipartContinuation({
		...options,
		authMode
	});
	if (inspected.status !== 'passed') return inspected;
	if (dryRun) {
		if (inspected.action === 'complete') {
			const prepared = prepareFinalArtifacts(inspected.context, options, {
				collectionValidation: readFrozenCollectionValidation(inspected.context)
			});
			if (prepared.status !== 'passed') return prepared;
			const existingFinals = validateExistingFinalArtifacts(inspected.context, prepared);
			if (existingFinals.status !== 'passed') return existingFinals;
		}
		return {
			...withoutContext(inspected),
			action: inspected.action === 'complete' ? 'dry-run-complete' : 'dry-run-planned'
		};
	}
	if (resume !== true) {
		return failed('Exhausted multipart continuation requires explicit --resume.');
	}
	if (typeof runPartImpl !== 'function') {
		return failed('Exhausted multipart continuation requires the explicit prompt-JSON runner.');
	}
	if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
		return failed('Exhausted multipart continuation timeout must be a positive integer.');
	}
	let context = inspected.context;
	if (context.finalArtifactsPresent) {
		return readScienceChallengeMultipartContinuation({ ...options, authMode });
	}
	writeImmutableRepairJson(context.planPath, context.plan);

	for (
		let offset = context.completedParts.length;
		offset < context.missingParts.length;
		offset += 1
	) {
		const part = context.missingParts[offset];
		const partPlan = context.plan.parts.find((record) => record.partId === part.partId);
		const relativePaths = scienceChallengeMultipartPartPaths(part.partId);
		const absolutePaths = Object.fromEntries(
			Object.entries(relativePaths).map(([key, relativePath]) => [
				key,
				path.join(context.continuationDir, ...relativePath.split('/'))
			])
		);
		writeImmutableRepairEvidence(absolutePaths.prompt, `${part.prompt}\n`);
		await emitJournalPhase(onJournalPhase, 'prepared', {
			shardId: options.shardId,
			partId: part.partId
		});

		const priorContinuationPartsSha256 = canonicalHash(
			context.completedParts.map((record) => ({
				partId: record.part.partId,
				evidenceSha256: record.evidenceSha256
			}))
		);
		const claims = inspectVerificationRepairMultipartContinuationClaims({
			ledgerRoot: context.executionLedgerRoot,
			identity: options.expectedExecutionIdentity,
			shardId: options.shardId,
			attempt: ATTEMPT,
			outputRoot: options.outputRoot
		});
		const priorClaims = claims.claims.filter((record) => record.partIndex < part.index);
		const partClaim = {
			planSha256: options.expectedPlanSha256,
			inputSha256: options.inputSha256,
			fullPartPlanSha256: context.plan.fullPartPlanSha256,
			partPlanSha256: canonicalHash(partPlan),
			partId: part.partId,
			partIndex: part.index,
			rowIds: [...part.rowIds],
			sourceAttemptSha256: context.sourceAttemptBinding.sha256,
			sourcePartsSha256: context.sourceAttemptBinding.partsSha256,
			sourceAttemptedPartCount: context.sourceAttemptedPartCount,
			expectedPartCount: context.parts.length,
			priorContinuationPartsSha256,
			priorContinuationClaimsSha256: canonicalHash(
				priorClaims.map((record) => ({
					partId: record.partId,
					claimSha256: canonicalHash(record.claim)
				}))
			),
			promptSha256: partPlan.promptSha256,
			responseSchemaSha256: partPlan.responseSchemaSha256,
			invocationPolicy: context.invocationPolicy,
			invocationPolicySha256: canonicalHash(context.invocationPolicy)
		};
		let claimed;
		if (context.pendingPart?.phase === 'claimed') {
			if (context.pendingPart.part.partId !== part.partId) {
				return failed('Multipart continuation pending claim is not the next canonical part.');
			}
			claimed = {
				claim: context.pendingPart.claimRecord.claim,
				claimPath: context.pendingPart.claimRecord.path,
				claimRoot: path.dirname(context.pendingPart.claimRecord.path)
			};
		} else {
			claimed = claimVerificationRepairMultipartContinuationPart({
				ledgerRoot: context.executionLedgerRoot,
				identity: options.expectedExecutionIdentity,
				shardId: options.shardId,
				attempt: ATTEMPT,
				outputRoot: options.outputRoot,
				partClaim
			});
		}
		await emitJournalPhase(onJournalPhase, 'claimed', {
			shardId: options.shardId,
			partId: part.partId,
			claimSha256: canonicalHash(claimed.claim)
		});
		const invocation = startVerificationRepairMultipartContinuationInvocation({
			ledgerRoot: context.executionLedgerRoot,
			identity: options.expectedExecutionIdentity,
			shardId: options.shardId,
			attempt: ATTEMPT,
			outputRoot: options.outputRoot,
			partId: part.partId
		});
		if (invocation.started !== true) {
			return failed(
				`${part.partId} invocation was already started; incomplete or unknown model work cannot be retried.`
			);
		}
		await emitJournalPhase(onJournalPhase, 'invocation-started', {
			shardId: options.shardId,
			partId: part.partId,
			invocationSha256: canonicalHash(invocation.marker)
		});
		try {
			await runPartImpl({
				prompt: part.prompt,
				outputSchema: challengeBatchOutputSchema(part.rowIds.length),
				eventsPath: absolutePaths.events,
				lastMessagePath: absolutePaths.lastMessage,
				thoughtsPath: absolutePaths.thoughts,
				requestPath: absolutePaths.request,
				resultMetadataPath: absolutePaths.resultMetadata,
				summaryPath: absolutePaths.runSummary,
				model: options.expectedExecutionIdentity.model,
				thinkingLevel: options.expectedExecutionIdentity.thinkingLevel,
				timeoutMs,
				authMode
			});
		} catch (error) {
			const failure = {
				schemaVersion: 'science-challenge-exhausted-multipart-continuation-failure/v1',
				shardId: options.shardId,
				attempt: ATTEMPT,
				partId: part.partId,
				claimSha256: canonicalHash(claimed.claim),
				error: errorMessage(error)
			};
			writeImmutableRepairJson(context.failurePath, failure);
			return failed(
				`${part.partId} continuation failed and its canonical slot is now closed: ${failure.error}`
			);
		}
		await emitJournalPhase(onJournalPhase, 'invocation-returned', {
			shardId: options.shardId,
			partId: part.partId
		});
		const replayed = inspectScienceChallengeMultipartContinuation({ ...options, authMode });
		if (replayed.status !== 'passed') return replayed;
		context = replayed.context;
		if (context.completedParts.length !== offset + 1) {
			return failed(`${part.partId} completed call did not produce one exact reusable part.`);
		}
		await emitJournalPhase(onJournalPhase, 'evidence-validated', {
			shardId: options.shardId,
			partId: part.partId
		});
	}

	const prepared = prepareFinalArtifacts(context, options, {
		collectionValidation: readFrozenCollectionValidation(context)
	});
	if (prepared.status !== 'passed') {
		writeImmutableRepairJson(context.failurePath, {
			schemaVersion: CONTINUATION_FAILURE_SCHEMA,
			shardId: options.shardId,
			attempt: ATTEMPT,
			partId: null,
			claimSha256: canonicalHash(
				context.completedParts.map((record) => canonicalHash(record.claim))
			),
			error: prepared.issues.join('\n')
		});
		return prepared;
	}
	writeImmutableRepairJson(
		context.collectionValidationPath,
		buildCollectionValidationSnapshot(context, prepared)
	);
	const existingFinals = validateExistingFinalArtifacts(context, prepared);
	if (existingFinals.status !== 'passed') return existingFinals;
	writeImmutableRepairJson(context.candidatePath, prepared.candidate);
	writeImmutableRepairJson(context.validationPath, prepared.validation);
	writeImmutableRepairJson(context.manifestPath, prepared.manifest);
	return readScienceChallengeMultipartContinuation({ ...options, authMode });
}

export function readScienceChallengeMultipartContinuation(options) {
	const inspected = inspectScienceChallengeMultipartContinuation(options);
	if (inspected.status !== 'passed') return inspected;
	const context = inspected.context;
	if (!context.finalArtifactsPresent) {
		return failed('Multipart continuation is not complete.');
	}
	let candidate;
	let validation;
	let manifest;
	try {
		candidate = readJson(context.candidatePath);
		validation = readJson(context.validationPath);
		manifest = readJson(context.manifestPath);
	} catch (error) {
		return failed(errorMessage(error));
	}
	const prepared = prepareFinalArtifacts(context, options, {
		collectionValidation: manifest.collectionValidation
	});
	if (prepared.status !== 'passed') return prepared;
	if (
		existsSync(context.collectionValidationPath) &&
		!readFileSync(context.collectionValidationPath).equals(
			stableJsonBytes(buildCollectionValidationSnapshot(context, prepared))
		)
	) {
		return failed('Multipart continuation frozen collection validation differs from its manifest.');
	}
	if (
		!readFileSync(context.candidatePath).equals(stableJsonBytes(prepared.candidate)) ||
		!readFileSync(context.validationPath).equals(stableJsonBytes(prepared.validation)) ||
		!readFileSync(context.manifestPath).equals(stableJsonBytes(prepared.manifest))
	) {
		return failed(
			'Multipart continuation candidate, validation or manifest differs from deterministic replay.'
		);
	}
	return {
		status: 'passed',
		issues: [],
		action: 'reused',
		continuationDir: context.continuationDir,
		artifactPaths: {
			plan: context.planPath,
			manifest: context.manifestPath,
			candidate: context.candidatePath,
			validation: context.validationPath
		},
		manifest,
		candidate,
		validation,
		proposal: {
			shardId: options.shardId,
			attempt: ATTEMPT,
			candidatePath: context.candidatePath,
			validationPath: context.validationPath,
			candidateSha256: canonicalHash(candidate),
			validationSha256: canonicalHash(validation),
			expectedTargetCandidateSha256: canonicalHash(options.priorCandidate),
			expectedTargetValidationSha256: canonicalHash(options.priorValidation)
		},
		lineage: buildLineage(context, prepared)
	};
}

export function validateScienceChallengeMultipartContinuationAcceptance({
	acceptedCandidate,
	acceptedValidation,
	replayOptions
}) {
	const issues = [];
	if (acceptedValidation?.authoringDisposition !== 'exhausted-multipart-part-continuation') {
		issues.push('Accepted validation strips the multipart continuation disposition.');
	}
	if (
		acceptedValidation?.sourceAttempt !== ATTEMPT ||
		acceptedValidation?.sourceAttemptStatus !== 'failed'
	) {
		issues.push('Accepted multipart continuation relabels or replaces its failed source attempt.');
	}
	const replay = readScienceChallengeMultipartContinuation(replayOptions);
	if (replay.status !== 'passed') {
		return {
			status: 'failed',
			issues: [
				'Accepted multipart continuation has no complete replayed provenance.',
				...replay.issues
			],
			lineage: null,
			replay
		};
	}
	if (canonicalHash(acceptedCandidate) !== replay.lineage.candidateSha256) {
		issues.push('Multipart continuation lineage does not bind the accepted candidate.');
	}
	if (canonicalHash(acceptedValidation) !== replay.lineage.validationSha256) {
		issues.push('Multipart continuation lineage does not bind the accepted validation.');
	}
	return {
		status: issues.length ? 'failed' : 'passed',
		issues,
		lineage: issues.length ? null : replay.lineage,
		replay
	};
}

function buildContext(options) {
	const preflight = validateOptions(options);
	if (preflight.length) return failed(preflight);
	const shardDir = path.resolve(options.shardDir);
	if (shardDir !== path.join(path.resolve(options.outputRoot), 'shards', options.shardId)) {
		return failed('Multipart continuation shard directory differs from the claimed output root.');
	}
	const localLedger = inspectVerificationRepairAttempts({
		shardDir,
		repairSha256: options.repairSha256,
		maxAttempts: ATTEMPT
	});
	const executionLedgerRoot = verificationRepairExecutionLedgerRoot(
		options.workspaceRoot,
		options.expectedExecutionIdentity.objectiveId
	);
	const globalLedger = inspectVerificationRepairExecutionAttempts({
		ledgerRoot: executionLedgerRoot,
		identity: options.expectedExecutionIdentity,
		shardId: options.shardId
	});
	requireMatchingVerificationRepairAttemptLedgers({
		localAttempts: localLedger.attempts,
		globalAttempts: globalLedger.attempts,
		shardId: options.shardId,
		outputRoot: options.outputRoot
	});
	if (
		!localLedger.exhausted ||
		!globalLedger.exhausted ||
		localLedger.attempts.length !== ATTEMPT ||
		globalLedger.attempts.length !== ATTEMPT
	) {
		return failed('Multipart continuation requires matching exhausted four-attempt ledgers.');
	}
	const cohortState = readVerificationRepairCohortState({
		outputRoot: options.outputRoot,
		repairSha256: options.repairSha256
	}).state;
	if (invalidatedVerificationRepairAttempts(cohortState, options.shardId).has(ATTEMPT)) {
		return failed(
			'Multipart continuation source attempt 4 was invalidated by collection validation.'
		);
	}
	const sourceRecord = localLedger.attempts.find((record) => record.attempt === ATTEMPT);
	const source = replayPartialSource({ ...options, sourceRecord, shardDir });
	if (source.status !== 'passed') return source;

	const continuationDir = scienceChallengeMultipartContinuationDirectory(options);
	const paths = {
		planPath: path.join(continuationDir, 'plan.json'),
		manifestPath: path.join(continuationDir, 'manifest.json'),
		candidatePath: path.join(continuationDir, 'candidate.json'),
		validationPath: path.join(continuationDir, 'validation.json'),
		collectionValidationPath: path.join(continuationDir, 'collection-validation.json'),
		failurePath: path.join(continuationDir, 'failure.json')
	};
	const invocationPolicy = {
		schemaVersion: 'science-challenge-verification-repair-multipart-continuation-invocation/v1',
		model: options.expectedExecutionIdentity.model,
		transport: options.expectedExecutionIdentity.transport,
		responseMode: options.expectedExecutionIdentity.responseMode,
		thinkingLevel: options.expectedExecutionIdentity.thinkingLevel,
		directPartSize: options.expectedExecutionIdentity.directPartSize,
		authMode: options.authMode,
		operation: 'streamText',
		providerSchemaApplied: false,
		tools: [],
		maxCalls: 1
	};
	const partPlan = source.parts.map((part) => ({
		partId: part.partId,
		index: part.index,
		start: part.start,
		end: part.end,
		rowIds: [...part.rowIds],
		inputSha256: part.inputSha256,
		promptSha256: sha256(`${part.prompt}\n`),
		responseSchemaSha256: canonicalHash(challengeBatchOutputSchema(part.rowIds.length))
	}));
	const plan = {
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_PLAN_SCHEMA,
		objectiveId: options.expectedExecutionIdentity.objectiveId,
		executionId: options.expectedExecutionIdentity.executionId,
		shardId: options.shardId,
		attempt: ATTEMPT,
		planSha256: options.expectedPlanSha256,
		inputSha256: options.inputSha256,
		sourceAttemptSha256: source.sourceAttemptBinding.sha256,
		sourcePartsSha256: source.sourceAttemptBinding.partsSha256,
		sourceAttemptedPartCount: source.sourceAttemptedPartCount,
		expectedPartCount: source.parts.length,
		invocationPolicy,
		invocationPolicySha256: canonicalHash(invocationPolicy),
		parts: partPlan,
		fullPartPlanSha256: canonicalHash(partPlan)
	};
	if (existsSync(paths.planPath) && !readFileSync(paths.planPath).equals(stableJsonBytes(plan))) {
		return failed('Immutable multipart continuation plan differs from deterministic replay.');
	}

	const claimLedger = inspectVerificationRepairMultipartContinuationClaims({
		ledgerRoot: executionLedgerRoot,
		identity: options.expectedExecutionIdentity,
		shardId: options.shardId,
		attempt: ATTEMPT,
		outputRoot: options.outputRoot
	});
	const missingParts = source.parts.slice(source.sourceAttemptedPartCount);
	if (claimLedger.claims.length > missingParts.length) {
		return failed('Multipart continuation contains more claims than missing canonical parts.');
	}
	const localPartsRoot = path.join(continuationDir, 'parts');
	const localPartNames = existsSync(localPartsRoot)
		? readdirSync(localPartsRoot, { withFileTypes: true }).map((entry) => {
				if (!entry.isDirectory() || !/^part-\d{2}$/.test(entry.name)) {
					throw new Error(`Malformed local multipart continuation part ${entry.name}.`);
				}
				return entry.name;
			})
		: [];
	const claimedNames = claimLedger.claims.map((record) => record.partId);
	const completedParts = [];
	let pendingPart = null;
	for (const [index, claimRecord] of claimLedger.claims.entries()) {
		const expectedPart = missingParts[index];
		if (claimRecord.partId !== expectedPart?.partId) {
			return failed('Multipart continuation claims are reordered or substitute another part.');
		}
		const state = inspectClaimedContinuationPart({
			part: expectedPart,
			partPlan: partPlan.find((record) => record.partId === expectedPart.partId),
			claimRecord,
			continuationDir,
			plan,
			sourceAttemptBinding: source.sourceAttemptBinding,
			invocationPolicy,
			priorCompletedParts: completedParts
		});
		if (state.status !== 'passed') return state;
		if (state.phase === 'claimed') {
			if (index !== claimLedger.claims.length - 1 || pendingPart) {
				return failed(
					'Multipart continuation has work claimed after an incomplete pre-invocation part.'
				);
			}
			pendingPart = state;
		} else {
			if (pendingPart) {
				return failed(
					'Multipart continuation has completed evidence after an incomplete claimed part.'
				);
			}
			completedParts.push(state);
		}
	}
	const unclaimedLocalPartNames = localPartNames.filter((name) => !claimedNames.includes(name));
	if (claimedNames.some((name) => !localPartNames.includes(name))) {
		return failed('Multipart continuation claim has no locally prepared evidence directory.');
	}
	if (unclaimedLocalPartNames.length > 0) {
		if (pendingPart || unclaimedLocalPartNames.length !== 1) {
			return failed('Multipart continuation contains ambiguous unclaimed local part preparation.');
		}
		const expectedPart = missingParts[claimLedger.claims.length];
		if (unclaimedLocalPartNames[0] !== expectedPart?.partId) {
			return failed('Multipart continuation local preparation is not the next canonical part.');
		}
		const prepared = inspectPreparedContinuationPart({
			part: expectedPart,
			continuationDir
		});
		if (prepared.status !== 'passed') return prepared;
		pendingPart = prepared;
	}
	const finalPresence = [paths.manifestPath, paths.candidatePath, paths.validationPath].map(
		existsSync
	);
	if (
		finalPresence.some(Boolean) &&
		(completedParts.length !== missingParts.length || pendingPart)
	) {
		return failed(
			'Multipart continuation final evidence exists before every missing part is complete.'
		);
	}
	const retryableCollectionFailure = readRetryableCollectionFailure({
		failurePath: paths.failurePath,
		shardId: options.shardId,
		completedParts,
		missingParts,
		pendingPart
	});
	if (retryableCollectionFailure?.status === 'failed') {
		return retryableCollectionFailure;
	}
	const collectionValidationSnapshot = readCollectionValidationSnapshot({
		snapshotPath: paths.collectionValidationPath,
		shardId: options.shardId,
		completedParts,
		missingParts,
		pendingPart
	});
	if (collectionValidationSnapshot?.status === 'failed') {
		return collectionValidationSnapshot;
	}
	return {
		status: 'passed',
		issues: [],
		...paths,
		shardDir,
		continuationDir,
		executionLedgerRoot,
		localLedger,
		globalLedger,
		claimLedger,
		parts: source.parts,
		missingParts,
		completedParts,
		pendingPart,
		sourceAttemptedPartCount: source.sourceAttemptedPartCount,
		sourceBatches: source.batches,
		sourceCorrections: source.corrections,
		sourceAttemptBinding: source.sourceAttemptBinding,
		source,
		invocationPolicy,
		plan,
		retryableCollectionFailure: retryableCollectionFailure?.failure ?? null,
		collectionValidationSnapshot: collectionValidationSnapshot?.snapshot ?? null,
		finalArtifactsPresent: finalPresence.every(Boolean)
	};
}

function readCollectionValidationSnapshot({
	snapshotPath,
	shardId,
	completedParts,
	missingParts,
	pendingPart
}) {
	if (!existsSync(snapshotPath)) return null;
	if (completedParts.length !== missingParts.length || pendingPart !== null) {
		return failed(
			'Multipart continuation collection snapshot exists before every suffix part is complete.'
		);
	}
	let snapshot;
	try {
		snapshot = readJson(snapshotPath);
	} catch (error) {
		return failed(
			`Multipart continuation collection snapshot is unreadable: ${errorMessage(error)}`
		);
	}
	const expectedClaimSetSha256 = canonicalHash(
		completedParts.map((record) => canonicalHash(record.claim))
	);
	if (
		canonicalHash(Object.keys(snapshot).sort()) !==
			canonicalHash([
				'attempt',
				'candidateSha256',
				'claimSetSha256',
				'collectionValidation',
				'schemaVersion',
				'shardId'
			]) ||
		snapshot.schemaVersion !== COLLECTION_VALIDATION_SNAPSHOT_SCHEMA ||
		snapshot.shardId !== shardId ||
		snapshot.attempt !== ATTEMPT ||
		!HASH.test(String(snapshot.candidateSha256 ?? '')) ||
		snapshot.claimSetSha256 !== expectedClaimSetSha256 ||
		!snapshot.collectionValidation ||
		typeof snapshot.collectionValidation !== 'object' ||
		Array.isArray(snapshot.collectionValidation)
	) {
		return failed(
			'Multipart continuation collection snapshot differs from its exact suffix claims.'
		);
	}
	return { status: 'passed', issues: [], snapshot };
}

function readRetryableCollectionFailure({
	failurePath,
	shardId,
	completedParts,
	missingParts,
	pendingPart
}) {
	if (!existsSync(failurePath)) return null;
	let failure;
	try {
		failure = readJson(failurePath);
	} catch (error) {
		return failed(`Immutable multipart continuation failure is unreadable: ${errorMessage(error)}`);
	}
	const expectedKeys = ['attempt', 'claimSha256', 'error', 'partId', 'schemaVersion', 'shardId'];
	const actualKeys = Object.keys(failure).sort();
	const expectedClaimSha256 = canonicalHash(
		completedParts.map((record) => canonicalHash(record.claim))
	);
	const valid =
		canonicalHash(actualKeys) === canonicalHash(expectedKeys) &&
		failure.schemaVersion === CONTINUATION_FAILURE_SCHEMA &&
		failure.shardId === shardId &&
		failure.attempt === ATTEMPT &&
		failure.partId === null &&
		failure.claimSha256 === expectedClaimSha256 &&
		typeof failure.error === 'string' &&
		failure.error.startsWith(RETRYABLE_COLLECTION_FAILURE_PREFIX) &&
		failure.error.length > RETRYABLE_COLLECTION_FAILURE_PREFIX.length &&
		completedParts.length === missingParts.length &&
		pendingPart === null;
	if (!valid) {
		return failed(
			'An immutable multipart continuation failure already exists; no missing part may be called.'
		);
	}
	return { status: 'passed', issues: [], failure };
}

function replayPartialSource(options) {
	const attemptDir = options.sourceRecord.path;
	const repairRunId = scienceChallengeVerificationRepairRunId(options.repairSha256);
	const promptPath = path.join(
		options.shardDir,
		`verification-repair-${repairRunId}-prompt-attempt-4.txt`
	);
	const paths = {
		prompt: promptPath,
		runSummary: path.join(attemptDir, 'run-summary.json'),
		eventLog: path.join(attemptDir, 'events.jsonl'),
		lastMessage: path.join(attemptDir, 'last-message.json'),
		validation: path.join(attemptDir, 'validation.json')
	};
	for (const [name, filePath] of Object.entries(paths)) {
		if (!existsSync(filePath)) return failed(`Source attempt 4 is missing ${name} evidence.`);
	}
	const summary = readJson(paths.runSummary);
	const validation = readJson(paths.validation);
	if (!isScienceChallengeDirectMultipartRunSummary(summary)) {
		return failed('Source attempt 4 is not a direct multipart run.');
	}
	if (
		summary.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
		summary.transportVersion !== SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION ||
		summary.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ||
		summary.providerSchemaApplied !== false ||
		summary.status !== 'failed' ||
		summary.mergedCandidateSha256 !== null ||
		summary.model !== options.expectedExecutionIdentity.model ||
		summary.thinkingLevel !== options.expectedExecutionIdentity.thinkingLevel ||
		summary.partSize !== options.expectedExecutionIdentity.directPartSize ||
		summary.inputSha256 !== options.inputSha256
	) {
		return failed('Source attempt 4 is not the exact failed prompt-JSON multipart invocation.');
	}
	const reconstruction = options.reconstructSourceEvidence({
		attempt: ATTEMPT,
		attemptDirectory: options.sourceRecord.directory,
		attemptDir,
		summary,
		sourceValidation: validation
	});
	const expectedPromptBytes = Buffer.from(reconstruction?.expectedPromptBytes ?? []);
	if (!readFileSync(paths.prompt).equals(expectedPromptBytes)) {
		return failed(
			'Source attempt 4 orchestration prompt differs from deterministic reconstruction.'
		);
	}
	const expectedPartPrompts = reconstruction?.expectedPartPrompts;
	if (
		!Array.isArray(expectedPartPrompts) ||
		expectedPartPrompts.length !== summary.expectedPartCount
	) {
		return failed('Source attempt 4 has no complete deterministic part-prompt reconstruction.');
	}
	const parts = buildScienceChallengeAuthoringParts({
		rows: options.rows,
		inputs: options.inputs,
		partSize: summary.partSize
	}).map((part, index) => ({ ...part, prompt: expectedPartPrompts[index] }));
	if (
		summary.expectedPartCount !== parts.length ||
		!Number.isInteger(summary.attemptedPartCount) ||
		summary.attemptedPartCount < 1 ||
		summary.attemptedPartCount >= parts.length ||
		summary.completedPartCount !== summary.attemptedPartCount - 1 ||
		!Array.isArray(summary.parts) ||
		summary.parts.length !== summary.attemptedPartCount ||
		summary.partsSha256 !== canonicalHash(summary.parts) ||
		canonicalHash(summary.rowIds) !== canonicalHash(parts.flatMap((part) => part.rowIds))
	) {
		return failed('Source attempt 4 does not expose one exact contiguous missing part suffix.');
	}
	const sourcePartsRoot = path.join(attemptDir, 'parts');
	const sourcePartNames = readdirSync(sourcePartsRoot, { withFileTypes: true }).map((entry) => {
		if (!entry.isDirectory() || !/^part-\d{2}$/.test(entry.name)) {
			throw new Error(`Malformed source multipart part ${entry.name}.`);
		}
		return entry.name;
	});
	const expectedAttemptedNames = parts
		.slice(0, summary.attemptedPartCount)
		.map((part) => part.partId);
	if (canonicalHash(sourcePartNames.sort()) !== canonicalHash([...expectedAttemptedNames].sort())) {
		return failed('Source attempt 4 contains evidence outside its recorded attempted part prefix.');
	}
	const evidence = readScienceChallengeDirectMultipartEvidence({ attemptDir, summary });
	const batches = [];
	const corrections = [];
	for (let index = 0; index < summary.attemptedPartCount; index += 1) {
		const part = parts[index];
		const partEvidence = evidence.parts[index];
		const recordIssues = validateSourcePartRecord({
			record: summary.parts[index],
			part,
			evidence: partEvidence,
			expectedPrompt: part.prompt
		});
		if (recordIssues.length) return failed(recordIssues);
		if (index === summary.attemptedPartCount - 1) {
			const salvage = salvageScienceChallengeQuestionPresentationNullDefaultPart({
				part,
				evidence: partEvidence,
				expectedPrompt: part.prompt
			});
			if (salvage.status !== 'passed') return salvage;
			if (
				summary.error !== partEvidence.summary.error ||
				summary.parts[index].status !== 'failed'
			) {
				return failed('Source root failure does not equal its terminal attempted part failure.');
			}
			batches.push(salvage.batch);
			corrections.push(...salvage.corrections);
		} else {
			const policy = validateScienceChallengeDirectPromptJsonRunPolicy({
				summary: partEvidence.summary,
				eventLogBytes: partEvidence.eventLogBytes,
				lastMessageBytes: partEvidence.lastMessageBytes,
				promptBytes: partEvidence.promptBytes,
				requestBytes: partEvidence.requestBytes,
				thoughtsBytes: partEvidence.thoughtsBytes,
				resultMetadataBytes: partEvidence.resultMetadataBytes,
				expectedResponseJsonSchema: challengeBatchOutputSchema(part.rowIds.length)
			});
			if (policy.status !== 'passed') {
				return failed([`${part.partId} source raw policy failed.`, ...policy.issues]);
			}
			const batch = JSON.parse(partEvidence.lastMessageBytes.toString('utf8'));
			if (
				summary.parts[index].status !== 'passed' ||
				canonicalHash(batch.challenges.map((entry) => entry?.definition?.id)) !==
					canonicalHash(part.rowIds)
			) {
				return failed(`${part.partId} source batch does not bind its canonical rows.`);
			}
			batches.push(batch);
		}
	}
	const expectedRootEvents = summary.parts.map((record) => ({
		schemaVersion: SCIENCE_CHALLENGE_DIRECT_MULTIPART_EVENT_SCHEMA,
		type: 'part.finished',
		partId: record.partId,
		index: record.index,
		status: record.status,
		promptSha256: record.promptSha256,
		runSummarySha256: record.runSummarySha256,
		rawOutputSha256: record.rawOutputSha256,
		eventLogSha256: record.eventLogSha256,
		responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
		transportVersion: SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION
	}));
	const rootEventBytes = readFileSync(paths.eventLog);
	const rootLastMessageBytes = readFileSync(paths.lastMessage);
	if (
		canonicalHash(parseJsonLines(rootEventBytes)) !== canonicalHash(expectedRootEvents) ||
		summary.eventLogSha256 !== sha256(rootEventBytes) ||
		rootLastMessageBytes.length !== 0 ||
		summary.finalResponseSha256 !== sha256(rootLastMessageBytes) ||
		summary.lastMessageFileSha256 !== sha256(rootLastMessageBytes) ||
		summary.orchestrationPromptSha256 !== sha256(expectedPromptBytes) ||
		summary.mergedResponseSchemaSha256 !==
			canonicalHash(challengeBatchOutputSchema(options.inputs.length))
	) {
		return failed('Source attempt 4 root evidence does not bind its exact partial multipart run.');
	}
	const transportError = `Authoring transport failed: ${summary.error}`;
	const expectedValidationIssues = [
		transportError,
		`schemaVersion must be ${challengeBatchOutputSchema(options.inputs.length).properties.schemaVersion.const}.`,
		`Batch must contain exactly ${options.inputs.length} challenges.`
	];
	if (
		validation.status !== 'failed' ||
		validation.inputSha256 !== options.inputSha256 ||
		validation.verificationRepairSha256 !== options.repairSha256 ||
		validation.priorCandidateSha256 !== canonicalHash(options.priorCandidate) ||
		validation.candidateSha256 !== null ||
		validation.rawCandidateSha256 !== null ||
		validation.runSummarySha256 !== canonicalHash(summary) ||
		validation.promptSha256 !== sha256(expectedPromptBytes) ||
		validation.transportError !== transportError ||
		canonicalHash(validation.issues) !== canonicalHash(expectedValidationIssues)
	) {
		return failed('Source attempt 4 failed validation is not bound to the exact partial run.');
	}
	const sourcePartBindings = evidence.parts.map((partEvidence) =>
		partEvidenceBinding(partEvidence, attemptDir)
	);
	const sourceAttemptBinding = {
		attempt: ATTEMPT,
		directory: options.sourceRecord.directory,
		status: 'failed',
		prompt: fileBinding(paths.prompt, options.shardDir),
		runSummary: fileBinding(paths.runSummary, options.shardDir, { json: true }),
		eventLog: fileBinding(paths.eventLog, options.shardDir),
		lastMessage: fileBinding(paths.lastMessage, options.shardDir),
		validation: fileBinding(paths.validation, options.shardDir, { json: true }),
		parts: sourcePartBindings,
		partsSha256: canonicalHash(sourcePartBindings)
	};
	sourceAttemptBinding.sha256 = canonicalHash(sourceAttemptBinding);
	return {
		status: 'passed',
		issues: [],
		attemptDir,
		paths,
		summary,
		validation,
		parts,
		evidence,
		batches,
		corrections,
		sourceAttemptedPartCount: summary.attemptedPartCount,
		sourceAttemptBinding
	};
}

function validateSourcePartRecord({ record, part, evidence, expectedPrompt }) {
	const issues = [];
	const expectedPaths = scienceChallengeMultipartPartPaths(part.partId);
	const expectedPromptBytes = Buffer.from(`${expectedPrompt}\n`);
	const hashes = {
		promptSha256: sha256(evidence.promptBytes),
		requestSha256: sha256(evidence.requestBytes),
		eventLogSha256: sha256(evidence.eventLogBytes),
		rawOutputSha256: sha256(evidence.lastMessageBytes),
		thoughtsSha256: sha256(evidence.thoughtsBytes),
		resultMetadataSha256: sha256(evidence.resultMetadataBytes),
		runSummarySha256: canonicalHash(evidence.summary)
	};
	if (
		record?.partId !== part.partId ||
		record.index !== part.index ||
		record.start !== part.start ||
		record.end !== part.end ||
		canonicalHash(record.rowIds) !== canonicalHash(part.rowIds) ||
		record.inputSha256 !== part.inputSha256 ||
		record.transportVersion !== SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_TRANSPORT_VERSION ||
		record.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ||
		record.providerSchemaApplied !== false ||
		record.responseSchemaSha256 !== canonicalHash(challengeBatchOutputSchema(part.rowIds.length)) ||
		record.promptPath !== expectedPaths.prompt ||
		record.requestPath !== expectedPaths.request ||
		record.eventLogPath !== expectedPaths.events ||
		record.rawOutputPath !== expectedPaths.lastMessage ||
		record.thoughtsPath !== expectedPaths.thoughts ||
		record.resultMetadataPath !== expectedPaths.resultMetadata ||
		record.runSummaryPath !== expectedPaths.runSummary ||
		!evidence.promptBytes.equals(expectedPromptBytes) ||
		record.promptSha256 !== sha256(expectedPromptBytes) ||
		Object.entries(hashes).some(([field, value]) => record[field] !== value)
	) {
		issues.push(`${part.partId} source record does not bind its canonical partition and bytes.`);
	}
	return issues;
}

function inspectPreparedContinuationPart({ part, continuationDir }) {
	const partDir = path.join(continuationDir, 'parts', part.partId);
	if (!existsSync(partDir) || !statSync(partDir).isDirectory()) {
		return failed(`${part.partId} local preparation directory is missing.`);
	}
	const entries = readdirSync(partDir, { withFileTypes: true });
	const actualNames = entries.map((entry) => entry.name).sort();
	const promptPath = path.join(partDir, 'prompt.txt');
	if (
		entries.some((entry) => !entry.isFile()) ||
		canonicalHash(actualNames) !== canonicalHash([...PREPARED_PART_FILES]) ||
		!readFileSync(promptPath).equals(Buffer.from(`${part.prompt}\n`))
	) {
		return failed(`${part.partId} pre-invocation preparation is partial or differs.`);
	}
	return {
		status: 'passed',
		issues: [],
		phase: 'prepared',
		part,
		partDir,
		promptPath
	};
}

function inspectClaimedContinuationPart({
	part,
	partPlan,
	claimRecord,
	continuationDir,
	plan,
	sourceAttemptBinding,
	invocationPolicy,
	priorCompletedParts
}) {
	const claimBinding = validateContinuationClaimBinding({
		part,
		partPlan,
		claimRecord,
		plan,
		sourceAttemptBinding,
		invocationPolicy,
		priorCompletedParts
	});
	if (claimBinding.status !== 'passed') return claimBinding;
	const partDir = path.join(continuationDir, 'parts', part.partId);
	if (!existsSync(partDir) || !statSync(partDir).isDirectory()) {
		return failed(`${part.partId} has an immutable claim but no local preparation.`);
	}
	const entries = readdirSync(partDir, { withFileTypes: true });
	const actualNames = entries.map((entry) => entry.name).sort();
	const promptOnly =
		entries.every((entry) => entry.isFile()) &&
		canonicalHash(actualNames) === canonicalHash([...PREPARED_PART_FILES]);
	if (promptOnly) {
		const prepared = inspectPreparedContinuationPart({ part, continuationDir });
		if (prepared.status !== 'passed') return prepared;
		if (claimRecord.invocation) {
			return failed(
				`${part.partId} invocation may have started but its model evidence is incomplete; the slot is closed.`
			);
		}
		return {
			...prepared,
			phase: 'claimed',
			claimRecord
		};
	}
	const completeEvidence =
		entries.every((entry) => entry.isFile()) &&
		canonicalHash(actualNames) === canonicalHash([...REQUIRED_PART_FILES].sort());
	if (!completeEvidence) {
		return failed(
			claimRecord.invocation
				? `${part.partId} invocation may have started but its model evidence is partial; the slot is closed.`
				: `${part.partId} pre-invocation evidence is partial or has unexpected files.`
		);
	}
	if (!claimRecord.invocation) {
		return failed(
			`${part.partId} has model evidence without an immutable invocation-start journal.`
		);
	}
	const completed = replayContinuationPart({
		part,
		claimRecord,
		continuationDir
	});
	return completed.status === 'passed' ? { ...completed, phase: 'completed' } : completed;
}

function replayContinuationPart({ part, claimRecord, continuationDir }) {
	const paths = Object.fromEntries(
		Object.entries(scienceChallengeMultipartPartPaths(part.partId)).map(([key, relativePath]) => [
			key,
			path.join(continuationDir, ...relativePath.split('/'))
		])
	);
	const evidence = {
		summary: readJson(paths.runSummary),
		promptBytes: readFileSync(paths.prompt),
		requestBytes: readFileSync(paths.request),
		eventLogBytes: readFileSync(paths.events),
		lastMessageBytes: readFileSync(paths.lastMessage),
		thoughtsBytes: readFileSync(paths.thoughts),
		resultMetadataBytes: readFileSync(paths.resultMetadata)
	};
	const policy = validateScienceChallengeDirectPromptJsonRunPolicy({
		summary: evidence.summary,
		eventLogBytes: evidence.eventLogBytes,
		lastMessageBytes: evidence.lastMessageBytes,
		promptBytes: evidence.promptBytes,
		requestBytes: evidence.requestBytes,
		thoughtsBytes: evidence.thoughtsBytes,
		resultMetadataBytes: evidence.resultMetadataBytes,
		expectedResponseJsonSchema: challengeBatchOutputSchema(part.rowIds.length)
	});
	if (policy.status !== 'passed') {
		return failed([`${part.partId} continuation raw policy failed.`, ...policy.issues]);
	}
	let batch;
	try {
		batch = JSON.parse(evidence.lastMessageBytes.toString('utf8'));
	} catch {
		return failed(`${part.partId} continuation output is not JSON.`);
	}
	if (
		canonicalHash(batch.challenges?.map((entry) => entry?.definition?.id) ?? null) !==
		canonicalHash(part.rowIds)
	) {
		return failed(`${part.partId} continuation output substitutes or reorders canonical rows.`);
	}
	const evidenceBinding = {
		partId: part.partId,
		claimSha256: canonicalHash(claimRecord.claim),
		claimByteSha256: sha256(readFileSync(claimRecord.path)),
		prompt: fileBinding(paths.prompt, continuationDir),
		request: fileBinding(paths.request, continuationDir, { json: true }),
		eventLog: fileBinding(paths.events, continuationDir),
		lastMessage: fileBinding(paths.lastMessage, continuationDir),
		thoughts: fileBinding(paths.thoughts, continuationDir),
		resultMetadata: fileBinding(paths.resultMetadata, continuationDir, { json: true }),
		runSummary: fileBinding(paths.runSummary, continuationDir, { json: true }),
		rawCandidateSha256: canonicalHash(batch)
	};
	const evidenceSha256 = canonicalHash(evidenceBinding);
	return {
		status: 'passed',
		issues: [],
		part,
		claim: claimRecord.claim,
		claimPath: claimRecord.path,
		paths,
		evidence,
		evidenceBinding,
		evidenceSha256,
		batch
	};
}

function validateContinuationClaimBinding({
	part,
	partPlan,
	claimRecord,
	plan,
	sourceAttemptBinding,
	invocationPolicy,
	priorCompletedParts
}) {
	const claim = claimRecord.claim;
	if (
		claim.planSha256 !== plan.planSha256 ||
		claim.inputSha256 !== plan.inputSha256 ||
		claim.fullPartPlanSha256 !== plan.fullPartPlanSha256 ||
		claim.partPlanSha256 !== canonicalHash(partPlan) ||
		claim.partId !== partPlan.partId ||
		claim.partIndex !== partPlan.index ||
		canonicalHash(claim.rowIds) !== canonicalHash(partPlan.rowIds) ||
		claim.sourceAttemptSha256 !== sourceAttemptBinding.sha256 ||
		claim.sourcePartsSha256 !== sourceAttemptBinding.partsSha256 ||
		claim.sourceAttemptedPartCount !== plan.sourceAttemptedPartCount ||
		claim.expectedPartCount !== plan.expectedPartCount ||
		claim.promptSha256 !== partPlan.promptSha256 ||
		claim.responseSchemaSha256 !== partPlan.responseSchemaSha256 ||
		claim.invocationPolicySha256 !== canonicalHash(invocationPolicy) ||
		claim.priorContinuationPartsSha256 !==
			canonicalHash(
				priorCompletedParts.map((record) => ({
					partId: record.part.partId,
					evidenceSha256: record.evidenceSha256
				}))
			)
	) {
		return failed(
			`${part.partId} continuation claim differs from its exact source, input, plan or predecessor.`
		);
	}
	return { status: 'passed', issues: [] };
}

function prepareFinalArtifacts(
	context,
	options,
	{ collectionValidation: frozenCollectionValidation } = {}
) {
	if (context.completedParts.length !== context.missingParts.length) {
		return failed('Multipart continuation cannot merge before every missing part is complete.');
	}
	const merge = mergeScienceChallengeAuthoringPartBatches({
		parts: context.parts,
		batches: [...context.sourceBatches, ...context.completedParts.map((record) => record.batch)]
	});
	if (merge.status !== 'passed' || !merge.candidate) {
		return failed(['Multipart continuation full ordered merge failed.', ...merge.issues]);
	}
	const candidate = normalizeGeneratedChallengeBatch(merge.candidate);
	const candidateHashBeforeValidation = canonicalHash(candidate);
	const deterministicValidation = options.validateBatchCandidate(
		structuredClone(candidate),
		structuredClone(options.rows)
	);
	if (canonicalHash(candidate) !== candidateHashBeforeValidation) {
		return failed('Multipart continuation deterministic validation mutated candidate bytes.');
	}
	if (
		deterministicValidation?.status !== 'passed' ||
		(deterministicValidation.issues?.length ?? 0) > 0
	) {
		return failed([
			'Multipart continuation failed current deterministic validation.',
			...(deterministicValidation?.issues ?? [])
		]);
	}
	const repairValidation = validateVerificationRepairCandidate({
		candidate,
		priorCandidate: options.priorCandidate,
		rows: options.rows,
		reviews: options.reviews
	});
	if (repairValidation.status !== 'passed') {
		return failed([
			'Multipart continuation failed verification-repair validation.',
			...repairValidation.issues
		]);
	}
	const collectionValidation =
		frozenCollectionValidation === null || frozenCollectionValidation === undefined
			? options.validateCollectionCandidate(structuredClone(candidate))
			: structuredClone(frozenCollectionValidation);
	const collectionIssues = collectionValidation?.issues;
	if (
		!collectionValidation ||
		!['passed', 'failed'].includes(collectionValidation.status) ||
		!Array.isArray(collectionIssues) ||
		(collectionValidation.status === 'passed' && collectionIssues.length > 0) ||
		(collectionValidation.status === 'failed' && collectionIssues.length === 0)
	) {
		return failed('Multipart continuation collection validation returned an invalid envelope.');
	}
	if (collectionValidation.status === 'failed') {
		const repairTargets = collectionValidation.repairTargets;
		const targetIssues = [];
		const targetChallengeIds = new Set();
		const localChallengeIds = new Set(options.rows.map((row) => row.id));
		if (!Array.isArray(repairTargets) || repairTargets.length === 0) {
			return failed(
				'Multipart continuation cannot defer an unattributed collection validation failure.'
			);
		}
		for (const target of repairTargets) {
			if (
				!target ||
				typeof target !== 'object' ||
				Array.isArray(target) ||
				canonicalHash(Object.keys(target).sort()) !==
					canonicalHash(['challengeId', 'issues', 'shardId']) ||
				typeof target.challengeId !== 'string' ||
				!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.challengeId) ||
				typeof target.shardId !== 'string' ||
				!/^science-\d{3}$/.test(target.shardId) ||
				!Array.isArray(target.issues) ||
				target.issues.length === 0 ||
				target.issues.some((issue) => typeof issue !== 'string' || issue.length === 0) ||
				targetChallengeIds.has(target.challengeId)
			) {
				return failed(
					'Multipart continuation collection validation contains malformed repair targets.'
				);
			}
			if (target.shardId === options.shardId || localChallengeIds.has(target.challengeId)) {
				return failed(
					'Multipart continuation cannot defer a collection failure assigned to its own shard.'
				);
			}
			targetChallengeIds.add(target.challengeId);
			targetIssues.push(...target.issues);
		}
		if (
			collectionIssues.some((issue) => typeof issue !== 'string' || issue.length === 0) ||
			new Set(targetIssues).size !== targetIssues.length ||
			new Set(collectionIssues).size !== collectionIssues.length ||
			canonicalHash([...targetIssues].sort()) !== canonicalHash([...collectionIssues].sort())
		) {
			return failed(
				'Multipart continuation collection issues are not exactly attributed to peer shards.'
			);
		}
	}
	if (
		options.priorValidation?.status !== 'passed' ||
		options.priorValidation.candidateSha256 !== canonicalHash(options.priorCandidate)
	) {
		return failed('Multipart continuation prior candidate is not verifier-bound and passed.');
	}
	const validation = {
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_VALIDATION_SCHEMA,
		status: 'passed',
		issues: [],
		inputSha256: options.inputSha256,
		verificationRepairSha256: options.repairSha256,
		verificationRepairCohortIssues:
			collectionValidation.status === 'failed' ? [...collectionIssues] : [],
		priorCandidateSha256: canonicalHash(options.priorCandidate),
		rawCandidateSha256: null,
		candidateSha256: canonicalHash(candidate),
		normalizationVersion: SCIENCE_CHALLENGE_NORMALIZATION_VERSION,
		promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
		promptSha256: context.source.summary.orchestrationPromptSha256,
		runSummarySha256: canonicalHash(context.source.summary),
		transport: options.expectedExecutionIdentity.transport,
		transportVersion: SCIENCE_CHALLENGE_DIRECT_PROMPT_JSON_MULTIPART_TRANSPORT_VERSION,
		responseMode: SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON,
		providerSchemaApplied: false,
		provider: context.source.summary.provider,
		model: options.expectedExecutionIdentity.model,
		modelVersion: null,
		modelVersions: [
			...new Set(
				[
					...context.source.summary.modelVersions,
					...context.completedParts.map((record) => record.evidence.summary.modelVersion)
				].filter(Boolean)
			)
		].sort(),
		directPartSize: options.expectedExecutionIdentity.directPartSize,
		thinkingLevel: options.expectedExecutionIdentity.thinkingLevel,
		transportError: null,
		authoringDisposition: 'exhausted-multipart-part-continuation',
		sourceAttempt: ATTEMPT,
		sourceAttemptStatus: 'failed',
		sourceAttemptedPartCount: context.sourceAttemptedPartCount,
		continuedPartIds: context.completedParts.map((record) => record.part.partId),
		questionPresentationCorrectionSchema:
			SCIENCE_CHALLENGE_QUESTION_PRESENTATION_PART_DEFAULT_SCHEMA,
		sourceCorrectionsSha256: canonicalHash(context.sourceCorrections),
		deterministicValidationSha256: canonicalHash(deterministicValidation),
		repairValidationSha256: canonicalHash(repairValidation),
		collectionValidationSha256: canonicalHash(collectionValidation),
		priorCollectionFailureSha256: context.retryableCollectionFailure
			? canonicalHash(context.retryableCollectionFailure)
			: null
	};
	const manifest = {
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_SCHEMA,
		objectiveId: options.expectedExecutionIdentity.objectiveId,
		executionId: options.expectedExecutionIdentity.executionId,
		executionIdentity: options.expectedExecutionIdentity,
		executionIdentitySha256: canonicalHash(options.expectedExecutionIdentity),
		shardId: options.shardId,
		attempt: ATTEMPT,
		repairSha256: options.repairSha256,
		plan: context.plan,
		planSha256: canonicalHash(context.plan),
		sourceAttempt: context.sourceAttemptBinding,
		sourceCorrections: context.sourceCorrections,
		sourceCorrectionsSha256: canonicalHash(context.sourceCorrections),
		continuationParts: context.completedParts.map((record) => record.evidenceBinding),
		continuationPartsSha256: canonicalHash(
			context.completedParts.map((record) => record.evidenceBinding)
		),
		deterministicValidation,
		repairValidation,
		collectionValidation,
		priorCollectionFailure: context.retryableCollectionFailure,
		candidateSha256: canonicalHash(candidate),
		validationSha256: canonicalHash(validation)
	};
	return {
		status: 'passed',
		issues: [],
		candidate,
		validation,
		manifest,
		deterministicValidation,
		repairValidation,
		collectionValidation
	};
}

function validateExistingFinalArtifacts(context, prepared) {
	if (
		existsSync(context.collectionValidationPath) &&
		!readFileSync(context.collectionValidationPath).equals(
			stableJsonBytes(buildCollectionValidationSnapshot(context, prepared))
		)
	) {
		return failed(
			'Multipart continuation frozen collection validation differs from deterministic replay.'
		);
	}
	for (const [filePath, value, label] of [
		[context.candidatePath, prepared.candidate, 'candidate'],
		[context.validationPath, prepared.validation, 'validation'],
		[context.manifestPath, prepared.manifest, 'manifest']
	]) {
		if (existsSync(filePath) && !readFileSync(filePath).equals(stableJsonBytes(value))) {
			return failed(`Multipart continuation partial ${label} differs from deterministic replay.`);
		}
	}
	return { status: 'passed', issues: [] };
}

function readFrozenCollectionValidation(context) {
	if (context.collectionValidationSnapshot) {
		return context.collectionValidationSnapshot.collectionValidation;
	}
	if (existsSync(context.manifestPath)) {
		return readJson(context.manifestPath).collectionValidation;
	}
	return null;
}

function buildCollectionValidationSnapshot(context, prepared) {
	return {
		schemaVersion: COLLECTION_VALIDATION_SNAPSHOT_SCHEMA,
		shardId: context.plan.shardId,
		attempt: ATTEMPT,
		claimSetSha256: canonicalHash(
			context.completedParts.map((record) => canonicalHash(record.claim))
		),
		candidateSha256: canonicalHash(prepared.candidate),
		collectionValidation: prepared.collectionValidation
	};
}

function buildLineage(context, prepared) {
	return {
		schemaVersion: SCIENCE_CHALLENGE_MULTIPART_CONTINUATION_SCHEMA,
		manifestPath: context.manifestPath,
		manifestSha256: canonicalHash(prepared.manifest),
		planPath: context.planPath,
		planSha256: canonicalHash(context.plan),
		candidatePath: context.candidatePath,
		candidateSha256: canonicalHash(prepared.candidate),
		validationPath: context.validationPath,
		validationSha256: canonicalHash(prepared.validation),
		execution: {
			objectivePath: path.join(context.executionLedgerRoot, 'objective.json'),
			objectiveSha256: canonicalHash(
				scienceChallengeVerificationRepairObjectiveIdentity(prepared.manifest.executionIdentity)
			),
			claims: context.claimLedger.claims.map((record) => ({
				partId: record.partId,
				path: record.path,
				sha256: canonicalHash(record.claim),
				byteSha256: sha256(readFileSync(record.path)),
				invocationPath: record.invocationPath,
				invocationSha256: canonicalHash(record.invocation),
				invocationByteSha256: sha256(readFileSync(record.invocationPath))
			}))
		},
		sourceAttempt: {
			...context.sourceAttemptBinding,
			attemptDir: context.source.attemptDir,
			files: { ...context.source.paths },
			partFiles: context.source.evidence.parts.map((partEvidence) => ({
				partId: partEvidence.record.partId,
				paths: { ...partEvidence.absolutePaths }
			}))
		},
		continuationParts: context.completedParts.map((record) => ({
			partId: record.part.partId,
			claimPath: record.claimPath,
			claimSha256: canonicalHash(record.claim),
			evidenceSha256: record.evidenceSha256,
			paths: record.paths
		})),
		priorCollectionFailure: context.retryableCollectionFailure,
		collectionValidationSnapshot: context.collectionValidationSnapshot
			? {
					path: context.collectionValidationPath,
					canonicalSha256: canonicalHash(context.collectionValidationSnapshot),
					byteSha256: sha256(readFileSync(context.collectionValidationPath))
				}
			: null,
		priorCollectionFailureEvidence: context.retryableCollectionFailure
			? {
					path: context.failurePath,
					canonicalSha256: canonicalHash(context.retryableCollectionFailure),
					byteSha256: sha256(readFileSync(context.failurePath))
				}
			: null
	};
}

function validateOptions(options) {
	const issues = [];
	if (!options || typeof options !== 'object' || Array.isArray(options)) {
		return ['Multipart continuation options must be an object.'];
	}
	if (typeof options.shardId !== 'string' || !/^science-\d{3}$/.test(options.shardId)) {
		issues.push('Multipart continuation shardId is invalid.');
	}
	for (const [field, label] of [
		['repairSha256', 'repair SHA-256'],
		['expectedPlanSha256', 'plan SHA-256'],
		['inputSha256', 'input SHA-256']
	]) {
		if (!HASH.test(String(options[field] ?? ''))) {
			issues.push(`Multipart continuation ${label} is invalid.`);
		}
	}
	if (!Array.isArray(options.rows) || !Array.isArray(options.inputs)) {
		issues.push('Multipart continuation requires exact rows and inputs.');
	} else if (
		options.rows.length < 2 ||
		options.rows.length !== options.inputs.length ||
		options.rows.some((row, index) => row?.id !== options.inputs[index]?.plan?.id)
	) {
		issues.push('Multipart continuation rows and inputs are not one-to-one.');
	}
	for (const field of [
		'validateBatchCandidate',
		'validateCollectionCandidate',
		'reconstructSourceEvidence'
	]) {
		if (typeof options[field] !== 'function') {
			issues.push(`Multipart continuation requires ${field}.`);
		}
	}
	if (!Array.isArray(options.reviews) || !Array.isArray(options.expectedReviewIds)) {
		issues.push('Multipart continuation requires exact verifier review coverage.');
	} else {
		const expected = [...options.expectedReviewIds].sort();
		const actual = options.reviews.map((review) => review?.id).sort();
		if (
			new Set(expected).size !== expected.length ||
			new Set(actual).size !== actual.length ||
			canonicalHash(expected) !== canonicalHash(actual) ||
			options.reviews.some((review) => typeof review?.accepted !== 'boolean')
		) {
			issues.push('Multipart continuation verifier reviews are incomplete or duplicated.');
		}
	}
	const identity = options.expectedExecutionIdentity;
	if (
		!identity ||
		identity.planSha256 !== options.expectedPlanSha256 ||
		identity.verificationSha256 !== options.repairSha256 ||
		identity.transport !== SCIENCE_CHALLENGE_DIRECT_JSON_TRANSPORT ||
		identity.responseMode !== SCIENCE_CHALLENGE_DIRECT_RESPONSE_MODE_PROMPT_JSON ||
		identity.thinkingLevel !== 'high' ||
		!Number.isInteger(identity.directPartSize) ||
		identity.directPartSize < 1
	) {
		issues.push(
			'Multipart continuation requires the exact prompt-JSON/high exhausted execution identity.'
		);
	}
	if (!['configured-proxy', 'default-chatgpt-profile'].includes(options.authMode)) {
		issues.push('Multipart continuation authMode is invalid.');
	}
	if (typeof options.outputRoot !== 'string' || !options.outputRoot.trim()) {
		issues.push('Multipart continuation outputRoot is required.');
	}
	if (typeof options.workspaceRoot !== 'string' || !options.workspaceRoot.trim()) {
		issues.push('Multipart continuation workspaceRoot is required.');
	}
	if (
		options.inputSha256 !==
		canonicalHash({
			promptVersion: SCIENCE_CHALLENGE_PROMPT_VERSION,
			inputs: options.inputs,
			priorCandidateSha256: canonicalHash(options.priorCandidate),
			verificationSummarySha256: options.repairSha256
		})
	) {
		issues.push('Multipart continuation input SHA-256 does not bind the repair envelope.');
	}
	return issues;
}

function partEvidenceBinding(evidence, attemptDir) {
	const paths = evidence.absolutePaths;
	return {
		partId: evidence.record.partId,
		recordSha256: canonicalHash(evidence.record),
		prompt: fileBinding(paths.prompt, attemptDir),
		request: fileBinding(paths.request, attemptDir, { json: true }),
		eventLog: fileBinding(paths.events, attemptDir),
		lastMessage: fileBinding(paths.lastMessage, attemptDir),
		thoughts: fileBinding(paths.thoughts, attemptDir),
		resultMetadata: fileBinding(paths.resultMetadata, attemptDir, { json: true }),
		runSummary: fileBinding(paths.runSummary, attemptDir, { json: true })
	};
}

function fileBinding(filePath, root, { json = false } = {}) {
	const bytes = readFileSync(filePath);
	const binding = {
		path: path.relative(path.resolve(root), path.resolve(filePath)),
		byteSha256: sha256(bytes),
		bytes: bytes.length
	};
	if (json) binding.canonicalSha256 = canonicalHash(JSON.parse(bytes.toString('utf8')));
	return binding;
}

async function emitJournalPhase(handler, phase, details) {
	if (handler) await handler({ phase, ...details });
}

function parseJsonLines(bytes) {
	return bytes
		.toString('utf8')
		.split(/\r?\n/)
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line));
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function stableJsonBytes(value) {
	return Buffer.from(`${stableStringify(value)}\n`);
}

function requireHash(value, label) {
	if (!HASH.test(String(value ?? ''))) throw new Error(`${label} is invalid.`);
	return value;
}

function failed(value) {
	const issues = Array.isArray(value) ? value : [value];
	return { status: 'failed', issues };
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function withoutContext(result) {
	const publicResult = { ...result };
	delete publicResult.context;
	return publicResult;
}
