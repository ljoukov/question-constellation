#!/usr/bin/env node

import { isDeepStrictEqual } from 'node:util';

import { loadChainIllustrationCandidates } from './lib/chain-illustration-candidates.mjs';
import { normalizedSourceFingerprintInput } from './lib/chain-illustration-pipeline.mjs';
import { d1Config, d1Rows } from './lib/d1-rest.mjs';
import {
	PHYSICS_QUESTION_ID_RECONCILIATION,
	buildPhysicsFingerprintTransition,
	buildPhysicsQuestionIdReconciliationPlan,
	buildPublishedPrimaryFingerprintRebasePlan,
	inspectPhysicsQuestionIdState,
	reconciliationSummary,
	validateD1TransactionalBatchResponse,
	validatePhysicsIllustrationFingerprintState,
	validatePhysicsIllustrationsAfterFingerprintRebase,
	validatePhysicsIllustrationsAfterIdentityPhase,
	validatePhysicsQuestionIdPreflight
} from './lib/physics-question-id-reconciliation.mjs';

const rootDir = process.cwd();
const write = process.argv.includes('--write');
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--write');
if (unknownArguments.length) {
	throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}. Only --write is supported.`);
}

const before = await inspectRemoteState();
requireQuestionState(before, 'Preflight');
const identity = before.oldQuestions.length === 1 ? 'placeholder' : 'canonical';
const idPlan = buildPhysicsQuestionIdReconciliationPlan(before);
const initialCandidate = await loadExactCandidate({ includeExisting: true });
const transition = buildPhysicsFingerprintTransition(initialCandidate, identity);
const initialIllustrationCheck = validatePhysicsIllustrationFingerprintState(
	initialCandidate,
	transition,
	before.illustrationRows
);
requirePassed(initialIllustrationCheck, 'Illustration fingerprint preflight');
const primaryId = initialIllustrationCheck.primary.id;
const storedFingerprint = initialIllustrationCheck.primary.source_fingerprint;

if (!write) {
	console.log(
		JSON.stringify(
			{
				status:
					idPlan.status === 'already-reconciled' && initialIllustrationCheck.phase === 'complete'
						? 'already-reconciled'
						: 'ready',
				write: false,
				mode: 'dry-run',
				identityPhase: idPlan.status,
				fingerprintPhase: initialIllustrationCheck.phase,
				identityStatementCount: idPlan.statements.length,
				fingerprintStatementCount: initialIllustrationCheck.phase === 'complete' ? 0 : 2,
				primaryIllustrationId: primaryId,
				oldFingerprint: transition.oldFingerprint,
				canonicalFingerprint: transition.canonicalFingerprint,
				storedFingerprint,
				legacyOldFingerprint: transition.legacyOldFingerprint,
				legacyCanonicalFingerprint: transition.legacyCanonicalFingerprint,
				fingerprintIdentityChanges: transition.changedPaths,
				before: idPlan.summary
			},
			null,
			2
		)
	);
	process.exit(0);
}

let identityBatchResults = [];
let afterIdentity = before;
let canonicalCandidate = initialCandidate;
if (idPlan.status !== 'already-reconciled') {
	identityBatchResults = await executeD1TransactionalBatch(idPlan.statements);
	await requireNoForeignKeyViolations('identity transaction');
	afterIdentity = await inspectRemoteState();
	requireQuestionState(afterIdentity, 'Post-identity');
	const afterIdentityPlan = buildPhysicsQuestionIdReconciliationPlan(afterIdentity);
	if (afterIdentityPlan.status !== 'already-reconciled') {
		throw new Error(
			`Post-identity state is ${afterIdentityPlan.status}, expected already-reconciled.`
		);
	}
	const illustrationIdentityCheck = validatePhysicsIllustrationsAfterIdentityPhase(
		before.illustrationRows,
		afterIdentity.illustrationRows
	);
	requirePassed(illustrationIdentityCheck, 'Post-identity illustration invariants');
	canonicalCandidate = await loadExactCandidate({ includeExisting: true });
	const canonicalInput = normalizedSourceFingerprintInput(canonicalCandidate);
	if (!isDeepStrictEqual(canonicalInput, transition.canonicalInput)) {
		throw new Error(
			'Canonical candidate fingerprint input differs from the allowlisted preflight projection.'
		);
	}
	if (canonicalCandidate.sourceFingerprint !== transition.canonicalFingerprint) {
		throw new Error(
			`Canonical candidate fingerprint is ${canonicalCandidate.sourceFingerprint}, expected ${transition.canonicalFingerprint}.`
		);
	}
}

const canonicalTransition = buildPhysicsFingerprintTransition(canonicalCandidate, 'canonical');
if (
	canonicalTransition.oldFingerprint !== transition.oldFingerprint ||
	canonicalTransition.canonicalFingerprint !== transition.canonicalFingerprint ||
	canonicalTransition.legacyOldFingerprint !== transition.legacyOldFingerprint ||
	canonicalTransition.legacyCanonicalFingerprint !== transition.legacyCanonicalFingerprint
) {
	throw new Error('Canonical candidate did not reproduce the preflight fingerprint transition.');
}
const beforeRebaseCheck = validatePhysicsIllustrationFingerprintState(
	canonicalCandidate,
	canonicalTransition,
	afterIdentity.illustrationRows
);
requirePassed(beforeRebaseCheck, 'Pre-rebase illustration fingerprint state');
if (beforeRebaseCheck.primary.id !== primaryId) {
	throw new Error(
		'Published primary illustration changed between preflight and fingerprint rebase.'
	);
}

let fingerprintBatchResults = [];
if (beforeRebaseCheck.phase === 'fingerprint-rebase-pending') {
	const rebasePlan = buildPublishedPrimaryFingerprintRebasePlan({
		illustrationRows: afterIdentity.illustrationRows,
		primaryId,
		oldFingerprint: storedFingerprint,
		canonicalFingerprint: transition.canonicalFingerprint
	});
	fingerprintBatchResults = await executeD1TransactionalBatch(rebasePlan.statements);
	await requireNoForeignKeyViolations('fingerprint transaction');
} else if (beforeRebaseCheck.phase !== 'complete') {
	throw new Error(`Unexpected pre-rebase phase ${beforeRebaseCheck.phase}.`);
}

const after = await inspectRemoteState();
requireQuestionState(after, 'Final');
const finalIdPlan = buildPhysicsQuestionIdReconciliationPlan(after);
if (finalIdPlan.status !== 'already-reconciled') {
	throw new Error(`Final question state is ${finalIdPlan.status}, expected already-reconciled.`);
}
const finalIllustrationCheck = validatePhysicsIllustrationsAfterFingerprintRebase(
	before.illustrationRows,
	after.illustrationRows,
	{
		primaryId,
		oldFingerprint: storedFingerprint,
		canonicalFingerprint: transition.canonicalFingerprint
	}
);
requirePassed(finalIllustrationCheck, 'Final illustration invariants');
const finalCandidate = await loadExactCandidate({ includeExisting: true });
if (
	!isDeepStrictEqual(normalizedSourceFingerprintInput(finalCandidate), transition.canonicalInput)
) {
	throw new Error('Final canonical candidate input differs from the preflight projection.');
}
const finalFingerprintState = validatePhysicsIllustrationFingerprintState(
	finalCandidate,
	buildPhysicsFingerprintTransition(finalCandidate, 'canonical'),
	after.illustrationRows
);
requirePassed(finalFingerprintState, 'Final illustration fingerprint state');
if (finalFingerprintState.phase !== 'complete') {
	throw new Error(`Final fingerprint state is ${finalFingerprintState.phase}, expected complete.`);
}
await requireSkippedFresh();
await requireNoForeignKeyViolations('final verification');

console.log(
	JSON.stringify(
		{
			status: 'reconciled',
			write: true,
			identityStatementsSucceeded: identityBatchResults.length,
			fingerprintStatementsSucceeded: fingerprintBatchResults.length,
			primaryIllustrationId: primaryId,
			oldFingerprint: storedFingerprint,
			canonicalFingerprint: transition.canonicalFingerprint,
			before: reconciliationSummary(before),
			after: reconciliationSummary(after),
			verification:
				'canonical-only; routes snapshot-guarded; foreign keys valid; primary freshness rebased; assets, hashes, drafts, status and timestamps preserved; candidate skipped fresh'
		},
		null,
		2
	)
);

async function inspectRemoteState() {
	return inspectPhysicsQuestionIdState((sql, params = []) => d1Rows(sql, params, { rootDir }));
}

/** @param {Awaited<ReturnType<typeof inspectPhysicsQuestionIdState>>} state @param {string} label */
function requireQuestionState(state, label) {
	const validation = validatePhysicsQuestionIdPreflight(state);
	if (validation.status !== 'passed') {
		throw new Error(`${label} question-id validation failed: ${validation.issues.join(' ')}`);
	}
}

/** @param {{includeExisting: boolean}} options */
async function loadExactCandidate({ includeExisting }) {
	const result = await loadChainIllustrationCandidates({
		rootDir,
		chainIds: [PHYSICS_QUESTION_ID_RECONCILIATION.expectedAnswerChainId],
		limit: 1,
		includeExisting
	});
	const eligible = result.eligible ?? [];
	const rejected = result.rejected ?? [];
	const skippedFresh = result.skippedFresh ?? [];
	if (rejected.length) {
		throw new Error(
			`Physics illustration candidate failed its mechanical gate: ${rejected[0].mechanicalGate?.blockers?.join(', ')}`
		);
	}
	const candidates = [...eligible, ...skippedFresh];
	if (candidates.length !== 1) {
		throw new Error(
			`Expected one exact Physics illustration candidate, found ${candidates.length}.`
		);
	}
	return candidates[0];
}

async function requireSkippedFresh() {
	const result = await loadChainIllustrationCandidates({
		rootDir,
		chainIds: [PHYSICS_QUESTION_ID_RECONCILIATION.expectedAnswerChainId],
		limit: 1,
		includeExisting: false
	});
	if (
		(result.eligible ?? []).length !== 0 ||
		(result.rejected ?? []).length !== 0 ||
		(result.skippedFresh ?? []).length !== 1 ||
		result.skippedFresh[0].id !== PHYSICS_QUESTION_ID_RECONCILIATION.expectedAnswerChainId
	) {
		throw new Error('Default candidate selection did not place the Physics chain in skippedFresh.');
	}
}

/** @param {{status: string, issues: string[]}} check @param {string} label */
function requirePassed(check, label) {
	if (check.status !== 'passed') throw new Error(`${label} failed: ${check.issues.join(' ')}`);
}

/** @param {string} label */
async function requireNoForeignKeyViolations(label) {
	const violations = await d1Rows('SELECT * FROM pragma_foreign_key_check', [], { rootDir });
	if (violations.length) {
		throw new Error(`${label} left foreign-key violations: ${JSON.stringify(violations)}`);
	}
}

/**
 * Cloudflare D1 batch calls are transactions. Guard statements intentionally error on any stale
 * snapshot, and this runner also requires explicit success=true on every returned statement.
 * @param {Array<{sql: string, params: Array<string | number | null>}>} statements
 */
async function executeD1TransactionalBatch(statements) {
	const { accountId, apiToken, databaseId } = d1Config(rootDir);
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify({
				batch: statements.map((statement) => ({
					sql: statement.sql,
					params: statement.params
				}))
			})
		}
	);
	const bodyText = await response.text();
	if (!response.ok) {
		throw new Error(
			`D1 reconciliation batch failed: ${response.status} ${response.statusText}: ${bodyText}`
		);
	}
	let body;
	try {
		body = JSON.parse(bodyText);
	} catch {
		throw new Error(`D1 reconciliation batch returned invalid JSON: ${bodyText}`);
	}
	return validateD1TransactionalBatchResponse(body, statements.length);
}
