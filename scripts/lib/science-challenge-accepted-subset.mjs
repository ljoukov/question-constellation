import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import { requireContentVerificationEvidence } from './science-challenge-review-evidence.mjs';
import { readScienceChallengeReviewRebaseEvidence } from './science-challenge-review-rebase-evidence.mjs';
import {
	SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS,
	canonicalHash,
	sha256,
	stableStringify,
	validateGeneratedChallengeCollection,
	validateIndependentContentReviewRow
} from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SCHEMA = 'science-challenge-accepted-subset/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_EVIDENCE_SCHEMA =
	'science-challenge-accepted-subset-evidence-projection/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_COLLECTION_VALIDATION_SCHEMA =
	'science-challenge-accepted-subset-collection-validation/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HOLDOUT_SCHEMA =
	'science-challenge-accepted-subset-holdout-ledger/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HASH_RECEIPT_SCHEMA =
	'science-challenge-accepted-subset-hash-receipt/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_MANIFEST_SCHEMA =
	'science-challenge-accepted-subset-manifest/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID = 'science-179-v1';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_OUTPUT_ROOT =
	'tmp/science-challenges/science-179-v1/accepted-subset-evidence';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_REBASE_MANIFEST =
	'tmp/science-challenges/science-500-v1/generation-review-rebase-cycle02/manifest.json';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_VERIFICATION_SUMMARY =
	'tmp/science-challenges/science-500-v1/verification-completion-20260724-cycle02/summary.json';

export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS = Object.freeze({
	releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
	sourcePlanId: 'science-500-v1',
	reviewedCount: 408,
	acceptedCount: 179,
	rejectedCount: 229,
	existingDefinitionCount: 92,
	projectedCatalogueCount: 271,
	subjectAcceptedCounts: Object.freeze({ biology: 34, chemistry: 71, physics: 74 }),
	subjectRejectedCounts: Object.freeze({ biology: 102, chemistry: 67, physics: 60 }),
	reviewRebaseManifestSha256: '8ec5427d02c931e56860934ccf45f3c2b62df995690103fead287a06e086a46a',
	reviewRebaseId: '3766077f25cddc4c377fdda53065447484cee37445600aafad39f0ba5a97ad84',
	basePlanSha256: 'd9d7a8defcc53a60103b54dcec48843e2bae382f755541626b64f4a6ff8a77b3',
	sourcePlanSha256: 'c9358de63bcc60e557a50e46dbb796494e6038ad157d2a26d7dbdf7239cf569d',
	fullCandidateSetSha256: 'a952fb3eaeea0a17ead1e14c8f47d1fdfe040185d13015f6ab3c458bf2a99202',
	acceptedCandidateSetSha256: 'e8d5366939295208d1f56eb6b2c64f7d71cb015989d2cd65614434512a582eba',
	acceptedIdSetSha256: 'b63211399bbed340786c2d8642108bc48c0a26abcb01dd3bcd4c65801227cbfa',
	acceptedReviewSetSha256: '0c165bd9e00d595e8319874db6268e6e188ab17ab538b427a35762be1a658375',
	reviewSetSha256: 'e391880a8f35e447f2574e1b00c25b0336957b7fcbafa9f720e7f5ad7063175c',
	rejectedCandidateSetSha256: '06eede08dae9798c9ce01caa4d2786bc9d37d56efb33a4094b1fe33614e640f1',
	verificationSummarySha256: '65e8c0e159fa555e45845b659c6a00351373018b006c7131694b3f84722afd15',
	verificationSummaryFileSha256: 'bfd7b8ec3b1910e86f5ca5c4fbbd4dbdbcb66cf9d437a8d46f78d0ae2756e6d1',
	existingDefinitionSetSha256: '6355e6ef48bf1cf5069941fc69b69e1756b6467e00fec3337b80decc65e72cc3',
	sourceSnapshotSha256: '5e99ddef90d3b6990f4f110749137d19f52d7514f18e6317445726c3ee020521',
	curriculumEvidenceSha256: '7ffe7848f7ceccb63e48d5d5f426bbd53d883f55657b1068493ad3e151f1f1f3',
	verificationIndexSha256: '6515f8206f659632caacd60184091e838758ee96707a79e8636cfebe8030f7c1',
	verificationDispatchLedgerSha256:
		'be2d928d881fdac34f19f1730a12963b3aef52994764e5d788c18cbdc0006c9d',
	reviewRebaseCollectionRemediationTargetSetSha256:
		'46283dcbb85bb0fa5e08f980a80fb5fbb8dec1515a0d216d972e15261afd1170',
	reviewRebaseCollectionRemediationSetSha256:
		'f8a49e7cc8db2de4909c57254d77def831e40d689cdafdd03deec85f0cdc5616',
	reviewRebaseCollectionRemediationTargetIds: Object.freeze([
		'biology-meiosis-02',
		'biology-photosynthetic-reaction-01',
		'biology-waste-management-02',
		'physics-nuclear-equations-02'
	])
});

const OUTPUT_FILES = Object.freeze({
	acceptedSubset: 'accepted-subset.json',
	evidenceProjection: 'evidence-projection.json',
	collectionValidation: 'collection-validation.json',
	holdoutLedger: 'holdout-ledger.json',
	hashReceipt: 'hash-receipt.json',
	manifest: 'manifest.json'
});
const HASH = /^[a-f0-9]{64}$/u;

/**
 * Authenticate B0 and V1 in place, then prepare deterministic release projection bytes.
 * This is deliberately write-free and is the implementation of CLI --dry-run.
 */
export function prepareScienceChallengeAcceptedSubset(options = {}) {
	try {
		const repositoryRoot = requireDirectory(options.repositoryRoot ?? process.cwd(), 'repository');
		const evidenceRepositoryRoot = requireDirectory(
			options.evidenceRepositoryRoot,
			'evidence repository'
		);
		const outputRootRelative = normalizeRelative(
			options.outputRoot ?? SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_OUTPUT_ROOT,
			'output root'
		);
		const outputRoot = resolveWithin(repositoryRoot, outputRootRelative);
		if (existsSync(outputRoot)) {
			throw new Error('Accepted-subset output root must be absent before preparation.');
		}
		requireSafeParent(repositoryRoot, path.dirname(outputRoot), true);

		const existingDefinitions = structuredClone(options.existingDefinitions);
		requireExactExistingDefinitions(existingDefinitions);
		const reviewRebaseManifestPath = normalizeRelative(
			options.reviewRebaseManifestPath ?? SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_REBASE_MANIFEST,
			'review-rebase manifest'
		);
		const verificationSummaryPath = normalizeRelative(
			options.verificationSummaryPath ??
				SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_VERIFICATION_SUMMARY,
			'verification summary'
		);

		const rebase = readScienceChallengeReviewRebaseEvidence({
			repositoryRoot: evidenceRepositoryRoot,
			manifestPath: reviewRebaseManifestPath,
			existingDefinitions
		});
		if (rebase.status !== 'passed') {
			throw new Error(`B0 replay failed: ${(rebase.issues ?? []).join(' ')}`);
		}
		requireExactRebase(rebase);

		const basePlan = readManifestInput(
			evidenceRepositoryRoot,
			rebase.manifest?.evidence?.inputs?.basePlan,
			'B0 base plan'
		);
		const sourceSnapshot = readManifestInput(
			evidenceRepositoryRoot,
			rebase.manifest?.evidence?.inputs?.sourceSnapshot,
			'B0 source snapshot'
		);
		const curriculumEvidence = readManifestInput(
			evidenceRepositoryRoot,
			rebase.manifest?.evidence?.inputs?.curriculumEvidence,
			'B0 curriculum evidence'
		);
		const summaryRecord = readRelativeJson(
			evidenceRepositoryRoot,
			verificationSummaryPath,
			'V1 verification summary'
		);
		const summary = summaryRecord.value;
		if (
			canonicalHash(summary) !==
			SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS.verificationSummarySha256
		) {
			throw new Error('V1 verification summary differs from the accepted source binding.');
		}

		const verification = requireContentVerificationEvidence({
			summary,
			summaryPath: verificationSummaryPath,
			plan: rebase.plan,
			basePlan,
			expectedReviewRebaseEvidence: rebase,
			sourceSnapshot,
			curriculumEvidence,
			rootDir: evidenceRepositoryRoot,
			requiredStatus: 'failed',
			expectedCount: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS.reviewedCount
		});
		if (verification.status !== 'passed') {
			throw new Error(`V1 replay failed: ${(verification.issues ?? []).join(' ')}`);
		}

		const assignmentRecords = buildSanitizedAssignmentRecords({
			evidenceRepositoryRoot,
			plan: rebase.plan,
			summary,
			verification
		});
		const artifacts = buildScienceChallengeAcceptedSubsetArtifacts({
			plan: rebase.plan,
			candidates: verification.orderedCandidates,
			reviews: verification.rawReviews,
			existingDefinitions,
			curriculumEvidence,
			assignmentRecords,
			sourceBindings: {
				reviewRebaseManifestSha256: canonicalHash(rebase.manifest),
				reviewRebaseId: rebase.coreManifest.rebaseId,
				basePlanSha256: canonicalHash(basePlan),
				sourcePlanSha256: canonicalHash(rebase.plan),
				sourceSnapshotSha256: canonicalHash(sourceSnapshot),
				curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
				verificationSummarySha256: canonicalHash(summary),
				verificationSummaryFileSha256: summaryRecord.fileSha256,
				verificationIndexSha256: canonicalHash(verification.index),
				verificationDispatchLedgerSha256: canonicalHash(verification.ledger),
				reviewRebaseCollectionRemediationSetSha256:
					summary.reviewRebaseCollectionRemediationSetSha256,
				reviewRebaseCollectionRemediationTargetSetSha256:
					summary.reviewRebaseCollectionRemediationTargetSetSha256,
				reviewRebaseCollectionRemediationTargetIds: structuredClone(
					summary.reviewRebaseCollectionRemediationTargetIds
				)
			}
		});
		return {
			status: 'passed',
			issues: [],
			action: 'prepared',
			repositoryRoot,
			evidenceRepositoryRoot,
			outputRoot,
			outputRootRelative,
			reviewRebaseManifestPath,
			verificationSummaryPath,
			...artifacts
		};
	} catch (error) {
		return failed(sanitizeDiagnostic(error));
	}
}

/**
 * Publish the complete projection through one same-filesystem directory rename.
 */
export function publishScienceChallengeAcceptedSubset(options = {}) {
	const prepared = prepareScienceChallengeAcceptedSubset(options);
	if (prepared.status !== 'passed') return prepared;
	const { repositoryRoot, outputRoot } = prepared;
	if (existsSync(outputRoot)) return failed('Accepted-subset output root must remain absent.');
	const parent = path.dirname(outputRoot);
	let temporary = null;
	try {
		requireSafeParent(repositoryRoot, parent, true);
		mkdirSync(parent, { recursive: true });
		requireSafeParent(repositoryRoot, parent, false);
		temporary = mkdtempSync(path.join(parent, `.${path.basename(outputRoot)}.preparing-`));
		for (const [name, bytes] of prepared.fileBytes) {
			writeFileSync(path.join(temporary, name), bytes, { flag: 'wx', mode: 0o644 });
			fsyncFile(path.join(temporary, name));
		}
		fsyncDirectory(temporary);
		if (existsSync(outputRoot)) {
			throw new Error('Accepted-subset output root appeared during atomic publication.');
		}
		renameSync(temporary, outputRoot);
		temporary = null;
		fsyncDirectory(parent);
	} catch (error) {
		if (temporary && existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
		return failed(sanitizeDiagnostic(error));
	}
	const replay = readScienceChallengeAcceptedSubset({
		repositoryRoot,
		outputRoot: prepared.outputRootRelative
	});
	if (replay.status !== 'passed') return replay;
	return { ...replay, action: 'published' };
}

/**
 * Read and fail-closed validate a published projection without requiring the machine-local B0/V1
 * source checkout. The exact 92 authored definitions are retained in the sanitized evidence file so
 * collection validation can be replayed.
 */
export function readScienceChallengeAcceptedSubset({
	repositoryRoot = process.cwd(),
	outputRoot = SCIENCE_CHALLENGE_ACCEPTED_SUBSET_DEFAULT_OUTPUT_ROOT
} = {}) {
	try {
		const root = requireDirectory(repositoryRoot, 'repository');
		const relative = normalizeRelative(outputRoot, 'output root');
		const directory = requireSafeDirectory(root, relative, 'accepted-subset output root');
		const names = readdirSync(directory).sort();
		const expectedNames = Object.values(OUTPUT_FILES).sort();
		if (canonicalHash(names) !== canonicalHash(expectedNames)) {
			throw new Error('Accepted-subset output tree has missing or unexpected files.');
		}
		const manifestRecord = readOutputJson(directory, OUTPUT_FILES.manifest);
		const manifest = manifestRecord.value;
		if (manifest.schemaVersion !== SCIENCE_CHALLENGE_ACCEPTED_SUBSET_MANIFEST_SCHEMA) {
			throw new Error('Accepted-subset manifest schema is invalid.');
		}
		const { manifestCoreSha256, ...manifestCore } = manifest;
		if (
			manifestCoreSha256 !== canonicalHash(manifestCore) ||
			manifest.releaseId !== SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID
		) {
			throw new Error('Accepted-subset manifest identity is invalid.');
		}
		const values = Object.create(null);
		const companions = Array.isArray(manifest.companionFiles) ? manifest.companionFiles : [];
		if (companions.length !== expectedNames.length - 1) {
			throw new Error('Accepted-subset manifest companion inventory is incomplete.');
		}
		for (const companion of companions) {
			if (
				!Object.hasOwn(OUTPUT_FILES, companion.role) ||
				companion.role === 'manifest' ||
				companion.path !== OUTPUT_FILES[companion.role] ||
				Object.hasOwn(values, companion.role)
			) {
				throw new Error('Accepted-subset manifest contains an invalid companion binding.');
			}
			const record = readOutputJson(directory, companion.path);
			if (
				record.fileSha256 !== companion.fileSha256 ||
				record.canonicalSha256 !== companion.canonicalSha256
			) {
				throw new Error(`Accepted-subset companion ${companion.path} changed after publication.`);
			}
			values[companion.role] = record.value;
		}
		validateScienceChallengeAcceptedSubsetArtifacts(values);
		const leaks = findScienceChallengeAcceptedSubsetLeaks({ manifest, ...values });
		if (leaks.length) throw new Error(`Accepted-subset output is not sanitized: ${leaks[0]}`);
		return {
			status: 'passed',
			issues: [],
			action: 'replayed',
			repositoryRoot: root,
			outputRoot: directory,
			outputRootRelative: relative,
			manifest,
			...values
		};
	} catch (error) {
		return failed(sanitizeDiagnostic(error));
	}
}

/**
 * Deterministic pure projection builder. Authentication belongs to prepareScienceChallengeAcceptedSubset;
 * this helper exists so the projection invariants can be tested independently.
 */
export function buildScienceChallengeAcceptedSubsetArtifacts({
	plan,
	candidates,
	reviews,
	existingDefinitions,
	curriculumEvidence,
	assignmentRecords,
	sourceBindings,
	validateCollection = validateGeneratedChallengeCollection,
	expectedBindings = SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS
}) {
	requireProjectionInputs({ plan, candidates, reviews, existingDefinitions, assignmentRecords });
	requireSourceBindings(sourceBindings, expectedBindings);
	const reviewById = new Map(reviews.map((review) => [review.id, review]));
	const curriculumById = new Map(
		(curriculumEvidence?.components ?? []).map((component) => [component.componentId, component])
	);
	const decisions = plan.rows.map((row, planRowIndex) =>
		buildDecision({
			row,
			planRowIndex,
			candidate: candidates[planRowIndex],
			review: reviewById.get(row.id),
			curriculumById
		})
	);
	const acceptedDecisions = decisions.filter((row) => row.disposition === 'accepted');
	const rejectedDecisions = decisions.filter((row) => row.disposition === 'held-out');
	const acceptedIds = acceptedDecisions.map((row) => row.id);
	const rejectedIds = rejectedDecisions.map((row) => row.id);
	const acceptedCandidates = decisions
		.filter((row) => row.disposition === 'accepted')
		.map((row) => candidates[row.planRowIndex]);
	const rejectedCandidates = decisions
		.filter((row) => row.disposition === 'held-out')
		.map((row) => candidates[row.planRowIndex]);
	const acceptedReviews = acceptedIds.map((id) => reviewById.get(id));
	validateAcceptedReviewGates(acceptedReviews);

	const fullCandidateSetSha256 = canonicalHash(candidates);
	const acceptedCandidateSetSha256 = canonicalHash(acceptedCandidates);
	const acceptedIdSetSha256 = canonicalHash(acceptedIds);
	const reviewSetSha256 = canonicalHash(reviews);
	const acceptedReviewSetSha256 = canonicalHash(acceptedReviews);
	const rejectedCandidateSetSha256 = canonicalHash(rejectedCandidates);
	for (const [field, actual] of Object.entries({
		reviewedCount: candidates.length,
		acceptedCount: acceptedCandidates.length,
		rejectedCount: rejectedCandidates.length,
		existingDefinitionCount: existingDefinitions.length,
		projectedCatalogueCount: acceptedCandidates.length + existingDefinitions.length,
		sourcePlanSha256: canonicalHash(plan),
		fullCandidateSetSha256,
		acceptedCandidateSetSha256,
		acceptedIdSetSha256,
		reviewSetSha256,
		acceptedReviewSetSha256,
		rejectedCandidateSetSha256,
		existingDefinitionSetSha256: canonicalHash(existingDefinitions)
	})) {
		if (expectedBindings?.[field] !== undefined && expectedBindings[field] !== actual) {
			throw new Error(`Accepted-subset ${field} differs from the exact release binding.`);
		}
	}
	if (expectedBindings?.sourcePlanId && plan.planId !== expectedBindings.sourcePlanId) {
		throw new Error('Accepted-subset source plan id differs from the exact release binding.');
	}
	requireSubjectCounts(plan.rows, reviewById, expectedBindings);
	const remediationTargets = new Set(
		(sourceBindings.reviewRebaseCollectionRemediationTargetIds ?? []).map(String)
	);
	for (const id of acceptedIds) {
		if (remediationTargets.has(id)) {
			throw new Error(`Accepted challenge ${id} remains a B0 collection-remediation target.`);
		}
	}

	const collectionResult = validateCollection(acceptedCandidates, { existingDefinitions });
	if (collectionResult?.status !== 'passed' || (collectionResult.issues ?? []).length !== 0) {
		throw new Error(
			`Accepted 179 + existing 92 collection validation failed: ${(
				collectionResult?.issues ?? []
			).join(' ')}`
		);
	}
	const collectionValidation = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_COLLECTION_VALIDATION_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		status: 'passed',
		issues: [],
		validator: 'validateGeneratedChallengeCollection',
		acceptedChallengeCount: acceptedCandidates.length,
		existingDefinitionCount: existingDefinitions.length,
		projectedCatalogueCount: acceptedCandidates.length + existingDefinitions.length,
		acceptedCandidateSetSha256,
		existingDefinitionSetSha256: canonicalHash(existingDefinitions)
	};
	const holdoutRows = rejectedDecisions.map((decision) => {
		const review = reviewById.get(decision.id);
		return {
			...decision,
			failedGates: SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.filter((field) => review[field] !== true),
			issues: structuredClone(review.issues)
		};
	});
	const holdoutCore = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HOLDOUT_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		status: 'partial-coverage',
		ordering: 'source plan rows ascending',
		sourcePlanId: plan.planId,
		reviewedCount: candidates.length,
		acceptedCount: acceptedCandidates.length,
		heldOutCount: holdoutRows.length,
		holdouts: holdoutRows
	};
	const holdoutLedger = {
		...holdoutCore,
		holdoutSetSha256: canonicalHash(holdoutRows)
	};
	const selection = {
		ordering: 'source plan rows ascending',
		reviewedCount: candidates.length,
		acceptedCount: acceptedCandidates.length,
		rejectedCount: rejectedCandidates.length,
		fullCandidateSetSha256,
		acceptedCandidateSetSha256,
		acceptedIdSetSha256,
		reviewSetSha256,
		acceptedReviewSetSha256,
		acceptedIds,
		rejectedIds,
		decisions
	};
	const evidenceProjection = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_EVIDENCE_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		sourcePlan: {
			planId: plan.planId,
			planSha256: canonicalHash(plan),
			plan: structuredClone(plan)
		},
		sourceBindings: structuredClone(sourceBindings),
		selection: structuredClone(selection),
		assignments: structuredClone(assignmentRecords),
		drafts: structuredClone(candidates),
		semanticReviews: structuredClone(reviews),
		existingDefinitions: structuredClone(existingDefinitions),
		curriculumEvidence: structuredClone(curriculumEvidence)
	};
	const evidenceProjectionSha256 = canonicalHash(evidenceProjection);
	const acceptedSubset = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		sourcePlan: {
			planId: plan.planId,
			planSha256: canonicalHash(plan)
		},
		coverage: {
			status: 'partial',
			existingDefinitionCount: existingDefinitions.length,
			reviewedCandidateCount: candidates.length,
			acceptedCandidateCount: acceptedCandidates.length,
			heldOutCandidateCount: rejectedCandidates.length,
			projectedCatalogueCount: existingDefinitions.length + acceptedCandidates.length,
			sourceTargetCatalogueCount: plan.targetFinalCatalogueRounds
		},
		selection,
		evidence: {
			...structuredClone(sourceBindings),
			existingDefinitionSetSha256: canonicalHash(existingDefinitions),
			collectionValidationSha256: canonicalHash(collectionValidation),
			holdoutLedgerSha256: canonicalHash(holdoutLedger),
			evidenceProjectionSha256
		},
		challenges: structuredClone(acceptedCandidates)
	};

	const valueByRole = {
		acceptedSubset,
		evidenceProjection,
		collectionValidation,
		holdoutLedger
	};
	const firstReceipts = Object.entries(valueByRole).map(([role, value]) =>
		artifactReceipt(role, OUTPUT_FILES[role], value)
	);
	const hashReceipt = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HASH_RECEIPT_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		sourcePlanId: plan.planId,
		sourcePlanSha256: canonicalHash(plan),
		fullCandidateSetSha256,
		acceptedCandidateSetSha256,
		acceptedIdSetSha256,
		reviewSetSha256,
		sourceVerificationSummarySha256: sourceBindings.verificationSummarySha256,
		artifacts: firstReceipts
	};
	valueByRole.hashReceipt = hashReceipt;
	const companionFiles = Object.entries(valueByRole).map(([role, value]) =>
		artifactReceipt(role, OUTPUT_FILES[role], value)
	);
	const manifestCore = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_MANIFEST_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		status: 'passed',
		companionFiles
	};
	const manifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	const values = { ...valueByRole, manifest };
	validateScienceChallengeAcceptedSubsetArtifacts(values, {
		validateCollection,
		expectedBindings
	});
	const leaks = findScienceChallengeAcceptedSubsetLeaks(values);
	if (leaks.length) throw new Error(`Accepted-subset projection leak: ${leaks[0]}`);
	const fileBytes = new Map(
		Object.entries(values).map(([role, value]) => [OUTPUT_FILES[role], stableJsonBytes(value)])
	);
	return {
		...values,
		fileBytes,
		acceptedCandidates,
		rejectedCandidates,
		acceptedReviews
	};
}

export function validateScienceChallengeAcceptedSubsetArtifacts(
	values,
	{
		validateCollection = validateGeneratedChallengeCollection,
		expectedBindings = SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS
	} = {}
) {
	const { acceptedSubset, evidenceProjection, collectionValidation, holdoutLedger, hashReceipt } =
		values;
	for (const [value, schema, label] of [
		[acceptedSubset, SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SCHEMA, 'accepted subset'],
		[evidenceProjection, SCIENCE_CHALLENGE_ACCEPTED_SUBSET_EVIDENCE_SCHEMA, 'evidence projection'],
		[
			collectionValidation,
			SCIENCE_CHALLENGE_ACCEPTED_SUBSET_COLLECTION_VALIDATION_SCHEMA,
			'collection validation'
		],
		[holdoutLedger, SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HOLDOUT_SCHEMA, 'holdout ledger'],
		[hashReceipt, SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HASH_RECEIPT_SCHEMA, 'hash receipt']
	]) {
		if (
			value?.schemaVersion !== schema ||
			value?.releaseId !== SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID
		) {
			throw new Error(`Accepted-subset ${label} schema or release id is invalid.`);
		}
	}
	const expected = expectedBindings;
	const plan = evidenceProjection.sourcePlan?.plan;
	const candidates = evidenceProjection.drafts;
	const reviews = evidenceProjection.semanticReviews;
	const existingDefinitions = evidenceProjection.existingDefinitions;
	const curriculumEvidence = evidenceProjection.curriculumEvidence;
	requireProjectionInputs({
		plan,
		candidates,
		reviews,
		existingDefinitions,
		assignmentRecords: evidenceProjection.assignments
	});
	requireSourceBindings(evidenceProjection.sourceBindings, expected);
	if (
		evidenceProjection.sourcePlan.planId !== plan.planId ||
		evidenceProjection.sourcePlan.planSha256 !== canonicalHash(plan) ||
		(expected.sourcePlanId !== undefined && plan.planId !== expected.sourcePlanId) ||
		(expected.sourcePlanSha256 !== undefined &&
			canonicalHash(plan) !== expected.sourcePlanSha256) ||
		(expected.curriculumEvidenceSha256 !== undefined &&
			canonicalHash(curriculumEvidence) !== expected.curriculumEvidenceSha256)
	) {
		throw new Error('Accepted-subset source plan or curriculum evidence binding is invalid.');
	}
	const curriculumById = new Map(
		(curriculumEvidence?.components ?? []).map((component) => [component.componentId, component])
	);
	const decisions = plan.rows.map((row, planRowIndex) =>
		buildDecision({
			row,
			planRowIndex,
			candidate: candidates[planRowIndex],
			review: reviews[planRowIndex],
			curriculumById
		})
	);
	const acceptedDecisions = decisions.filter((row) => row.disposition === 'accepted');
	const rejectedDecisions = decisions.filter((row) => row.disposition === 'held-out');
	const acceptedIds = acceptedDecisions.map((row) => row.id);
	const rejectedIds = rejectedDecisions.map((row) => row.id);
	const acceptedCandidates = acceptedDecisions.map((row) => candidates[row.planRowIndex]);
	const rejectedCandidates = rejectedDecisions.map((row) => candidates[row.planRowIndex]);
	const acceptedReviews = acceptedDecisions.map((row) => reviews[row.planRowIndex]);
	validateAcceptedReviewGates(acceptedReviews);
	const actualBindings = {
		reviewedCount: candidates.length,
		acceptedCount: acceptedCandidates.length,
		rejectedCount: rejectedCandidates.length,
		existingDefinitionCount: existingDefinitions.length,
		projectedCatalogueCount: existingDefinitions.length + acceptedCandidates.length,
		fullCandidateSetSha256: canonicalHash(candidates),
		acceptedCandidateSetSha256: canonicalHash(acceptedCandidates),
		rejectedCandidateSetSha256: canonicalHash(rejectedCandidates),
		acceptedIdSetSha256: canonicalHash(acceptedIds),
		reviewSetSha256: canonicalHash(reviews),
		acceptedReviewSetSha256: canonicalHash(acceptedReviews),
		existingDefinitionSetSha256: canonicalHash(existingDefinitions)
	};
	for (const [field, actual] of Object.entries(actualBindings)) {
		if (expected[field] !== undefined && expected[field] !== actual) {
			throw new Error(`Accepted-subset ${field} differs from the exact release binding.`);
		}
	}
	const reviewById = new Map(reviews.map((review) => [review.id, review]));
	requireSubjectCounts(plan.rows, reviewById, expected);
	const remediationTargets = new Set(
		evidenceProjection.sourceBindings.reviewRebaseCollectionRemediationTargetIds ?? []
	);
	if (acceptedIds.some((id) => remediationTargets.has(id))) {
		throw new Error('Accepted-subset selection retains a B0 collection-remediation target.');
	}
	const expectedSelection = {
		ordering: 'source plan rows ascending',
		reviewedCount: candidates.length,
		acceptedCount: acceptedCandidates.length,
		rejectedCount: rejectedCandidates.length,
		fullCandidateSetSha256: actualBindings.fullCandidateSetSha256,
		acceptedCandidateSetSha256: actualBindings.acceptedCandidateSetSha256,
		acceptedIdSetSha256: actualBindings.acceptedIdSetSha256,
		reviewSetSha256: actualBindings.reviewSetSha256,
		acceptedReviewSetSha256: actualBindings.acceptedReviewSetSha256,
		acceptedIds,
		rejectedIds,
		decisions
	};
	if (
		canonicalHash(acceptedSubset.selection) !== canonicalHash(expectedSelection) ||
		canonicalHash(evidenceProjection.selection) !== canonicalHash(expectedSelection)
	) {
		throw new Error('Accepted-subset selection is not the exact plan-order review projection.');
	}
	validateSanitizedAssignmentRecords({
		records: evidenceProjection.assignments,
		plan,
		candidates,
		reviews
	});
	const validation = validateCollection(acceptedCandidates, { existingDefinitions });
	if (validation.status !== 'passed' || validation.issues.length !== 0) {
		throw new Error(
			'Accepted-subset retained collection no longer passes the hard collection gate.'
		);
	}
	const expectedCollectionValidation = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_COLLECTION_VALIDATION_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		status: 'passed',
		issues: [],
		validator: 'validateGeneratedChallengeCollection',
		acceptedChallengeCount: acceptedCandidates.length,
		existingDefinitionCount: existingDefinitions.length,
		projectedCatalogueCount: acceptedCandidates.length + existingDefinitions.length,
		acceptedCandidateSetSha256: actualBindings.acceptedCandidateSetSha256,
		existingDefinitionSetSha256: actualBindings.existingDefinitionSetSha256
	};
	if (canonicalHash(collectionValidation) !== canonicalHash(expectedCollectionValidation)) {
		throw new Error('Accepted-subset collection-validation receipt is invalid.');
	}
	const holdoutRows = rejectedDecisions.map((decision) => {
		const review = reviewById.get(decision.id);
		return {
			...decision,
			failedGates: SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.filter((field) => review[field] !== true),
			issues: structuredClone(review.issues)
		};
	});
	const expectedHoldoutCore = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HOLDOUT_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		status: 'partial-coverage',
		ordering: 'source plan rows ascending',
		sourcePlanId: plan.planId,
		reviewedCount: candidates.length,
		acceptedCount: acceptedCandidates.length,
		heldOutCount: holdoutRows.length,
		holdouts: holdoutRows
	};
	const expectedHoldoutLedger = {
		...expectedHoldoutCore,
		holdoutSetSha256: canonicalHash(holdoutRows)
	};
	if (canonicalHash(holdoutLedger) !== canonicalHash(expectedHoldoutLedger)) {
		throw new Error('Accepted-subset holdout ledger is not the full rejected review projection.');
	}
	const expectedEvidenceProjection = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_EVIDENCE_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		sourcePlan: {
			planId: plan.planId,
			planSha256: canonicalHash(plan),
			plan
		},
		sourceBindings: evidenceProjection.sourceBindings,
		selection: expectedSelection,
		assignments: evidenceProjection.assignments,
		drafts: candidates,
		semanticReviews: reviews,
		existingDefinitions,
		curriculumEvidence
	};
	if (canonicalHash(evidenceProjection) !== canonicalHash(expectedEvidenceProjection)) {
		throw new Error('Accepted-subset evidence projection has unexpected or stale fields.');
	}
	const expectedAcceptedSubset = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		sourcePlan: {
			planId: plan.planId,
			planSha256: canonicalHash(plan)
		},
		coverage: {
			status: 'partial',
			existingDefinitionCount: existingDefinitions.length,
			reviewedCandidateCount: candidates.length,
			acceptedCandidateCount: acceptedCandidates.length,
			heldOutCandidateCount: rejectedCandidates.length,
			projectedCatalogueCount: existingDefinitions.length + acceptedCandidates.length,
			sourceTargetCatalogueCount: plan.targetFinalCatalogueRounds
		},
		selection: expectedSelection,
		evidence: {
			...evidenceProjection.sourceBindings,
			existingDefinitionSetSha256: actualBindings.existingDefinitionSetSha256,
			collectionValidationSha256: canonicalHash(collectionValidation),
			holdoutLedgerSha256: canonicalHash(holdoutLedger),
			evidenceProjectionSha256: canonicalHash(evidenceProjection)
		},
		challenges: acceptedCandidates
	};
	if (canonicalHash(acceptedSubset) !== canonicalHash(expectedAcceptedSubset)) {
		throw new Error(
			'Accepted-subset primary artifact is not the exact accepted review projection.'
		);
	}
	const expectedArtifactValues = {
		acceptedSubset,
		evidenceProjection,
		collectionValidation,
		holdoutLedger
	};
	const expectedHashReceipt = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HASH_RECEIPT_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
		sourcePlanId: plan.planId,
		sourcePlanSha256: canonicalHash(plan),
		fullCandidateSetSha256: actualBindings.fullCandidateSetSha256,
		acceptedCandidateSetSha256: actualBindings.acceptedCandidateSetSha256,
		acceptedIdSetSha256: actualBindings.acceptedIdSetSha256,
		reviewSetSha256: actualBindings.reviewSetSha256,
		sourceVerificationSummarySha256: evidenceProjection.sourceBindings.verificationSummarySha256,
		artifacts: Object.entries(expectedArtifactValues).map(([role, value]) =>
			artifactReceipt(role, OUTPUT_FILES[role], value)
		)
	};
	if (canonicalHash(hashReceipt) !== canonicalHash(expectedHashReceipt)) {
		throw new Error('Accepted-subset hash receipt is stale or incomplete.');
	}
	return { status: 'passed', issues: [] };
}

export function findScienceChallengeAcceptedSubsetLeaks(value) {
	const leaks = [];
	visit(value, '$', leaks);
	return leaks;
}

function buildSanitizedAssignmentRecords({ evidenceRepositoryRoot, plan, summary, verification }) {
	const resultById = new Map(
		summary.assignmentResults.map((result) => [result.assignmentId, result])
	);
	const dispatchById = new Map(
		verification.ledger.dispatches.map((dispatch) => [dispatch.assignmentId, dispatch])
	);
	const candidateById = new Map(
		verification.orderedCandidates.map((candidate) => [candidate.definition.id, candidate])
	);
	const reviewById = new Map(verification.rawReviews.map((review) => [review.id, review]));
	const verifierAliases = new Map();
	return verification.index.assignments.map((assignment, assignmentIndex) => {
		const result = resultById.get(assignment.assignmentId);
		const dispatch = dispatchById.get(assignment.assignmentId);
		const assignmentFile = readBoundRelativeJson(
			evidenceRepositoryRoot,
			assignment.path,
			assignment.sha256,
			`${assignment.assignmentId} assignment`
		);
		const reviewFile = readBoundRelativeJson(
			evidenceRepositoryRoot,
			result.path,
			result.sha256,
			`${assignment.assignmentId} review`
		);
		const taskIdentity = String(dispatch.taskName);
		if (!verifierAliases.has(taskIdentity)) {
			verifierAliases.set(
				taskIdentity,
				`verifier-${String(verifierAliases.size + 1).padStart(3, '0')}`
			);
		}
		const ids = plan.rows
			.filter((row) => row.shard === assignment.assignmentId)
			.map((row) => row.id);
		const candidates = ids.map((id) => candidateById.get(id));
		const reviews = ids.map((id) => reviewById.get(id));
		return {
			alias: `assignment-${String(assignmentIndex + 1).padStart(3, '0')}`,
			shardId: assignment.assignmentId,
			candidateIds: ids,
			candidateSetSha256: canonicalHash(candidates),
			semanticReviewSetSha256: canonicalHash(reviews),
			acceptedCount: reviews.filter((review) => review.accepted === true).length,
			rejectedCount: reviews.filter((review) => review.accepted === false).length,
			assignmentFileSha256: assignmentFile.fileSha256,
			assignmentCanonicalSha256: assignmentFile.canonicalSha256,
			semanticReviewFileSha256: reviewFile.fileSha256,
			semanticReviewFileCanonicalSha256: reviewFile.canonicalSha256,
			verifier: {
				alias: verifierAliases.get(taskIdentity),
				model: reviewFile.value.verifier.model,
				reasoningEffort: reviewFile.value.verifier.reasoningEffort,
				context: reviewFile.value.verifier.context,
				forkTurns: reviewFile.value.verifier.provenance.forkTurns,
				orchestrator: reviewFile.value.verifier.provenance.orchestrator,
				reviewedAt: reviewFile.value.verifier.reviewedAt
			}
		};
	});
}

function buildDecision({ row, planRowIndex, candidate, review, curriculumById }) {
	if (candidate?.definition?.id !== row.id || review?.id !== row.id) {
		throw new Error(`Projection row ${planRowIndex} differs from plan order.`);
	}
	const sourceHashes = {
		calibrationQuestionSha256: row.calibrationQuestionSha256,
		specificationSha256: row.specificationSha256,
		curriculumSourceTextSha256:
			curriculumById.get(row.curriculumComponentId)?.sourceTextSha256 ?? null
	};
	return {
		planRowIndex,
		id: row.id,
		idSha256: canonicalHash(row.id),
		shardId: row.shard,
		disposition: review.accepted === true ? 'accepted' : 'held-out',
		planRowSha256: canonicalHash(row),
		candidateSha256: canonicalHash(candidate),
		semanticReviewSha256: canonicalHash(review),
		calibrationQuestionId: row.calibrationQuestionId,
		calibrationQuestionSha256: row.calibrationQuestionSha256,
		curriculumComponentId: row.curriculumComponentId,
		curriculumSourceTextSha256: sourceHashes.curriculumSourceTextSha256,
		specificationId: row.specificationId,
		specificationSha256: row.specificationSha256,
		sourceHashSetSha256: canonicalHash(sourceHashes)
	};
}

function requireProjectionInputs({
	plan,
	candidates,
	reviews,
	existingDefinitions,
	assignmentRecords
}) {
	if (!Array.isArray(plan?.rows)) throw new Error('Accepted-subset plan rows are missing.');
	if (!Array.isArray(candidates) || candidates.length !== plan.rows.length) {
		throw new Error('Accepted-subset candidates must cover every plan row.');
	}
	if (!Array.isArray(reviews) || reviews.length !== plan.rows.length) {
		throw new Error('Accepted-subset semantic reviews must cover every plan row.');
	}
	if (!Array.isArray(existingDefinitions)) {
		throw new Error('Accepted-subset existing definitions must be an array.');
	}
	if (!Array.isArray(assignmentRecords)) {
		throw new Error('Accepted-subset assignment records must be an array.');
	}
	const ids = new Set();
	for (const [index, row] of plan.rows.entries()) {
		const review = reviews[index];
		if (
			!row?.id ||
			ids.has(row.id) ||
			candidates[index]?.definition?.id !== row.id ||
			review?.id !== row.id ||
			typeof review.accepted !== 'boolean'
		) {
			throw new Error(`Accepted-subset plan/candidate/review row ${index} is invalid.`);
		}
		ids.add(row.id);
		const validation = validateIndependentContentReviewRow(review);
		if (validation.status !== 'passed') {
			throw new Error(`Semantic review ${row.id} is malformed: ${validation.issues.join(' ')}`);
		}
	}
}

function requireSourceBindings(sourceBindings, expected) {
	if (!sourceBindings || typeof sourceBindings !== 'object' || Array.isArray(sourceBindings)) {
		throw new Error('Accepted-subset source bindings are missing.');
	}
	for (const field of [
		'reviewRebaseManifestSha256',
		'reviewRebaseId',
		'basePlanSha256',
		'sourcePlanSha256',
		'sourceSnapshotSha256',
		'curriculumEvidenceSha256',
		'verificationSummarySha256',
		'verificationSummaryFileSha256',
		'verificationIndexSha256',
		'verificationDispatchLedgerSha256',
		'reviewRebaseCollectionRemediationSetSha256',
		'reviewRebaseCollectionRemediationTargetSetSha256'
	]) {
		if (expected?.[field] !== undefined && sourceBindings[field] !== expected[field]) {
			throw new Error(`Accepted-subset source binding ${field} differs from the exact evidence.`);
		}
	}
	if (
		expected?.reviewRebaseCollectionRemediationTargetIds !== undefined &&
		canonicalHash(sourceBindings.reviewRebaseCollectionRemediationTargetIds) !==
			canonicalHash(expected.reviewRebaseCollectionRemediationTargetIds)
	) {
		throw new Error(
			'Accepted-subset collection-remediation targets differ from the exact evidence.'
		);
	}
	for (const [field, value] of Object.entries(sourceBindings)) {
		if (field.endsWith('Sha256') && !HASH.test(String(value))) {
			throw new Error(`Accepted-subset source binding ${field} is not a SHA-256 digest.`);
		}
	}
}

function validateSanitizedAssignmentRecords({ records, plan, candidates, reviews }) {
	const shardIds = [...new Set(plan.rows.map((row) => row.shard))];
	if (records.length !== shardIds.length) {
		throw new Error('Accepted-subset sanitized assignment inventory is incomplete.');
	}
	const verifierAliases = new Set();
	for (const [index, record] of records.entries()) {
		requireExactObjectKeys(
			record,
			[
				'alias',
				'shardId',
				'candidateIds',
				'candidateSetSha256',
				'semanticReviewSetSha256',
				'acceptedCount',
				'rejectedCount',
				'assignmentFileSha256',
				'assignmentCanonicalSha256',
				'semanticReviewFileSha256',
				'semanticReviewFileCanonicalSha256',
				'verifier'
			],
			'sanitized assignment'
		);
		const shardId = shardIds[index];
		const rowIndexes = plan.rows
			.map((row, rowIndex) => ({ row, rowIndex }))
			.filter(({ row }) => row.shard === shardId)
			.map(({ rowIndex }) => rowIndex);
		const ids = rowIndexes.map((rowIndex) => plan.rows[rowIndex].id);
		const shardCandidates = rowIndexes.map((rowIndex) => candidates[rowIndex]);
		const shardReviews = rowIndexes.map((rowIndex) => reviews[rowIndex]);
		if (
			record.alias !== `assignment-${String(index + 1).padStart(3, '0')}` ||
			record.shardId !== shardId ||
			canonicalHash(record.candidateIds) !== canonicalHash(ids) ||
			record.candidateSetSha256 !== canonicalHash(shardCandidates) ||
			record.semanticReviewSetSha256 !== canonicalHash(shardReviews) ||
			record.acceptedCount !== shardReviews.filter((review) => review.accepted === true).length ||
			record.rejectedCount !== shardReviews.filter((review) => review.accepted === false).length
		) {
			throw new Error(`Accepted-subset sanitized assignment ${index + 1} is stale.`);
		}
		for (const field of [
			'assignmentFileSha256',
			'assignmentCanonicalSha256',
			'semanticReviewFileSha256',
			'semanticReviewFileCanonicalSha256'
		]) {
			if (!HASH.test(String(record[field]))) {
				throw new Error(`Accepted-subset sanitized assignment ${index + 1} has an invalid hash.`);
			}
		}
		requireExactObjectKeys(
			record.verifier,
			['alias', 'model', 'reasoningEffort', 'context', 'forkTurns', 'orchestrator', 'reviewedAt'],
			'sanitized verifier'
		);
		if (
			!/^(?:verifier)-\d{3}$/u.test(record.verifier.alias) ||
			['model', 'reasoningEffort', 'context', 'forkTurns', 'orchestrator', 'reviewedAt'].some(
				(field) => typeof record.verifier[field] !== 'string' || !record.verifier[field]
			)
		) {
			throw new Error(`Accepted-subset sanitized verifier ${index + 1} is malformed.`);
		}
		verifierAliases.add(record.verifier.alias);
	}
	const orderedAliases = [...verifierAliases];
	for (const [index, alias] of orderedAliases.entries()) {
		if (alias !== `verifier-${String(index + 1).padStart(3, '0')}`) {
			throw new Error('Accepted-subset sanitized verifier aliases are not first-seen sequential.');
		}
	}
}

function requireExactObjectKeys(value, keys, label) {
	if (
		!value ||
		typeof value !== 'object' ||
		Array.isArray(value) ||
		canonicalHash(Object.keys(value).sort()) !== canonicalHash([...keys].sort())
	) {
		throw new Error(`Accepted-subset ${label} fields are invalid.`);
	}
}

function validateAcceptedReviewGates(acceptedReviews) {
	for (const review of acceptedReviews) {
		const failedGates = SCIENCE_CONTENT_REVIEW_BOOLEAN_FIELDS.filter(
			(field) => review[field] !== true
		);
		if (
			review.accepted !== true ||
			failedGates.length !== 0 ||
			!Array.isArray(review.issues) ||
			review.issues.length !== 0
		) {
			throw new Error(`Accepted semantic review ${review.id} has unresolved gates or issues.`);
		}
	}
}

function requireSubjectCounts(rows, reviewById, expected) {
	if (!expected?.subjectAcceptedCounts || !expected?.subjectRejectedCounts) return;
	const accepted = {};
	const rejected = {};
	for (const row of rows) {
		const target = reviewById.get(row.id)?.accepted === true ? accepted : rejected;
		target[row.subject] = (target[row.subject] ?? 0) + 1;
	}
	if (
		canonicalHash(accepted) !== canonicalHash(expected.subjectAcceptedCounts) ||
		canonicalHash(rejected) !== canonicalHash(expected.subjectRejectedCounts)
	) {
		throw new Error('Accepted-subset subject coverage differs from the exact release binding.');
	}
}

function requireExactExistingDefinitions(existingDefinitions) {
	const expected = SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS;
	if (
		!Array.isArray(existingDefinitions) ||
		existingDefinitions.length !== expected.existingDefinitionCount ||
		canonicalHash(existingDefinitions) !== expected.existingDefinitionSetSha256
	) {
		throw new Error('Evidence checkout must supply the exact historical authored 92 definitions.');
	}
}

function requireExactRebase(rebase) {
	const expected = SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS;
	for (const [label, actual, wanted] of [
		['B0 manifest', canonicalHash(rebase.manifest), expected.reviewRebaseManifestSha256],
		['B0 rebase id', rebase.coreManifest?.rebaseId, expected.reviewRebaseId],
		['B0 plan', canonicalHash(rebase.plan), expected.sourcePlanSha256],
		['B0 candidate set', rebase.coreManifest?.candidateSetSha256, expected.fullCandidateSetSha256]
	]) {
		if (actual !== wanted) throw new Error(`${label} differs from the accepted source binding.`);
	}
}

function readManifestInput(root, binding, label) {
	if (
		!binding ||
		!HASH.test(String(binding.fileSha256 ?? '')) ||
		!HASH.test(String(binding.canonicalSha256 ?? ''))
	) {
		throw new Error(`${label} binding is incomplete.`);
	}
	const record = readRelativeJson(root, normalizeRelative(binding.path, label), label);
	if (
		record.fileSha256 !== binding.fileSha256 ||
		record.canonicalSha256 !== binding.canonicalSha256
	) {
		throw new Error(`${label} changed after B0 publication.`);
	}
	return record.value;
}

function readBoundRelativeJson(root, relativePath, expectedCanonicalSha256, label) {
	const record = readRelativeJson(root, normalizeRelative(relativePath, label), label);
	if (record.canonicalSha256 !== expectedCanonicalSha256) {
		throw new Error(`${label} canonical content changed.`);
	}
	return record;
}

function readRelativeJson(root, relativePath, label) {
	const file = requireSafeFile(root, relativePath, label);
	const bytes = readFileSync(file);
	let value;
	try {
		value = JSON.parse(bytes.toString('utf8'));
	} catch {
		throw new Error(`${label} is not valid JSON.`);
	}
	return {
		value,
		fileSha256: sha256(bytes),
		canonicalSha256: canonicalHash(value)
	};
}

function readOutputJson(directory, name) {
	const file = path.join(directory, name);
	const stat = lstatSync(file);
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error(`Accepted-subset output ${name} must be a regular file.`);
	}
	const bytes = readFileSync(file);
	return {
		value: JSON.parse(bytes.toString('utf8')),
		fileSha256: sha256(bytes),
		canonicalSha256: canonicalHash(JSON.parse(bytes.toString('utf8')))
	};
}

function artifactReceipt(role, filePath, value) {
	const bytes = stableJsonBytes(value);
	return {
		role,
		path: filePath,
		fileSha256: sha256(bytes),
		canonicalSha256: canonicalHash(value)
	};
}

function stableJsonBytes(value) {
	return Buffer.from(`${stableStringify(value)}\n`);
}

function visit(value, location, leaks) {
	if (typeof value === 'string') {
		if (
			/(?:^|[\s"'`])\/(?:Users|home|private|tmp)\/[^\s"'`]*/u.test(value) ||
			/(?:^|[\s"'`])[A-Za-z]:\\[^\s"'`]*/u.test(value) ||
			/file:\/\/|\/root\/|taskName|yaroslav(?:_|)volovich/iu.test(value)
		) {
			leaks.push(`${location} contains a machine path or verifier task identity.`);
		}
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => visit(item, `${location}[${index}]`, leaks));
		return;
	}
	if (!value || typeof value !== 'object') return;
	for (const [key, item] of Object.entries(value)) {
		if (/^taskName$/iu.test(key)) leaks.push(`${location}.${key} is a verifier task-name field.`);
		visit(item, `${location}.${key}`, leaks);
	}
}

function normalizeRelative(value, label) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty.`);
	const portable = value.replaceAll('\\', '/');
	if (path.posix.isAbsolute(portable)) throw new Error(`${label} must be repository-relative.`);
	const segments = portable.split('/');
	if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
		throw new Error(`${label} must be a normalized repository-relative path.`);
	}
	return segments.join('/');
}

function requireDirectory(value, label) {
	if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} root is required.`);
	const resolved = path.resolve(value);
	const stat = lstatSync(resolved);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`${label} root must be a real directory.`);
	}
	return realpathSync(resolved);
}

function resolveWithin(root, relativePath) {
	const target = path.resolve(root, relativePath);
	if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
		throw new Error('Resolved path escapes its repository root.');
	}
	return target;
}

function requireSafeFile(root, relativePath, label) {
	const target = resolveWithin(root, relativePath);
	const stat = lstatSync(target);
	if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular file.`);
	const real = realpathSync(target);
	if (!real.startsWith(`${root}${path.sep}`))
		throw new Error(`${label} escapes its repository root.`);
	return real;
}

function requireSafeDirectory(root, relativePath, label) {
	const target = resolveWithin(root, relativePath);
	const stat = lstatSync(target);
	if (!stat.isDirectory() || stat.isSymbolicLink())
		throw new Error(`${label} must be a real directory.`);
	const real = realpathSync(target);
	if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
		throw new Error(`${label} escapes its repository root.`);
	}
	return real;
}

function requireSafeParent(root, parent, allowMissingTail) {
	const relative = path.relative(root, parent);
	if (relative.startsWith('..') || path.isAbsolute(relative)) {
		throw new Error('Accepted-subset output parent escapes the repository.');
	}
	let current = root;
	for (const segment of relative.split(path.sep).filter(Boolean)) {
		current = path.join(current, segment);
		if (!existsSync(current)) {
			if (allowMissingTail) return;
			throw new Error('Accepted-subset output parent is missing.');
		}
		const stat = lstatSync(current);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error('Accepted-subset output parent contains a symlink or non-directory.');
		}
	}
}

function fsyncFile(file) {
	const descriptor = openSync(file, 'r');
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

function sanitizeDiagnostic(error) {
	const message = error instanceof Error ? error.message : String(error);
	return message
		.replaceAll(/\/Users\/[^/\s]+\/[^\s]*/gu, '<machine-path>')
		.replaceAll(/\/home\/[^/\s]+\/[^\s]*/gu, '<machine-path>')
		.replaceAll(/\/root\/[^\s]*/gu, '<verifier-alias>');
}

function failed(issue) {
	return { status: 'failed', issues: [String(issue)] };
}
