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

import { buildScienceChallengeReviewRebase } from './science-challenge-review-rebase.mjs';
import { validateScienceChallengeGeneratedBatch } from './science-challenge-batch-validation.mjs';
import {
	canonicalHash,
	sha256,
	stableStringify,
	validateChallengePlan,
	validateGeneratedChallengeCollection
} from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_REVIEW_REBASE_EVIDENCE_SCHEMA =
	'science-challenge-review-rebase-filesystem-evidence/v1';
export const SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA =
	'science-challenge-review-rebase-selection-index/v1';

const HASH = /^[a-f0-9]{64}$/u;

/**
 * Load every immutable input and deterministically prepare a review-pending rebase.
 * This function is deliberately write-free and is also the implementation of CLI dry-run.
 */
export function prepareScienceChallengeReviewRebaseEvidence(options) {
	try {
		return prepare(options);
	} catch (error) {
		return failed(error instanceof Error ? error.message : String(error));
	}
}

/**
 * Publish a complete rebase directory with one same-filesystem rename.
 * The requested output root must not exist.
 */
export function publishScienceChallengeReviewRebaseEvidence(options) {
	const prepared = prepareScienceChallengeReviewRebaseEvidence(options);
	if (prepared.status !== 'passed') return prepared;
	const outputRoot = prepared.outputRoot;
	if (existsSync(outputRoot)) {
		return failed('Review-rebase output root must be absent before publication.');
	}
	const parent = path.dirname(outputRoot);
	try {
		requireSafeDirectoryChain(prepared.repositoryRoot, parent, {
			allowMissingTail: true,
			label: 'review-rebase output parent'
		});
		mkdirSync(parent, { recursive: true });
		requireSafeDirectoryChain(prepared.repositoryRoot, parent, {
			allowMissingTail: false,
			label: 'review-rebase output parent'
		});
		const temporary = mkdtempSync(path.join(parent, `.${path.basename(outputRoot)}.preparing-`));
		try {
			writePreparedTree(temporary, prepared);
			if (existsSync(outputRoot)) {
				throw new Error('Review-rebase output root appeared during atomic publication.');
			}
			renameSync(temporary, outputRoot);
		} catch (error) {
			if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
			throw error;
		}
	} catch (error) {
		return failed(error instanceof Error ? error.message : String(error));
	}
	return readScienceChallengeReviewRebaseEvidence({
		repositoryRoot: prepared.repositoryRoot,
		manifestPath: prepared.manifestPathRelative,
		validatePlan: options.validatePlan,
		validateBatch: options.validateBatch,
		validateCollection: options.validateCollection,
		existingDefinitions: options.existingDefinitions
	});
}

/**
 * Replay a published rebase solely from the manifest's repository-relative bindings.
 * Every input is reloaded, the core builder is rerun, and every output byte is compared.
 */
export function readScienceChallengeReviewRebaseEvidence({
	repositoryRoot,
	manifestPath,
	validatePlan,
	validateBatch,
	validateCollection,
	existingDefinitions
}) {
	try {
		const root = requireRepositoryRoot(repositoryRoot);
		const manifestRelative = normalizeRepositoryRelativePath(manifestPath, 'manifest path');
		const manifestFile = requireSafeExistingFile(root, manifestRelative, 'review-rebase manifest');
		const manifest = readJsonBytes(manifestFile, 'review-rebase manifest').value;
		if (
			!isRecord(manifest?.evidence) ||
			manifest.evidence.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_EVIDENCE_SCHEMA
		) {
			return failed(
				`Review-rebase manifest evidence must use ${SCIENCE_CHALLENGE_REVIEW_REBASE_EVIDENCE_SCHEMA}.`
			);
		}
		if (
			manifest.evidence.manifestPath !== manifestRelative ||
			!nonEmpty(manifest.evidence.outputRoot)
		) {
			return failed('Review-rebase manifest path or output-root binding is stale.');
		}
		const outputRootRelative = normalizeRepositoryRelativePath(
			manifest.evidence.outputRoot,
			'manifest output root'
		);
		const outputRoot = requireSafeExistingDirectory(
			root,
			outputRootRelative,
			'review-rebase output root'
		);
		if (path.join(outputRoot, 'manifest.json') !== manifestFile) {
			return failed('Review-rebase manifest must be the bound output root manifest.json.');
		}

		const inputPaths = inputPathsFromEvidence(manifest.evidence.inputs);
		const prepared = prepare({
			repositoryRoot: root,
			outputRoot: outputRootRelative,
			...inputPaths,
			validatePlan,
			validateBatch,
			validateCollection,
			existingDefinitions,
			allowExistingOutputRoot: true
		});
		if (prepared.status !== 'passed') return prepared;
		if (!readFileSync(manifestFile).equals(stableJsonBytes(prepared.manifest))) {
			return failed('Review-rebase manifest bytes differ from deterministic replay.');
		}
		comparePublishedTree(outputRoot, prepared);
		return {
			status: 'passed',
			issues: [],
			action: 'replayed',
			repositoryRoot: root,
			outputRoot,
			manifestPath: manifestFile,
			manifestPathRelative: manifestRelative,
			manifest: prepared.manifest,
			coreManifest: prepared.coreManifest,
			plan: prepared.plan,
			planValidation: prepared.planValidation,
			candidateBatches: prepared.candidateBatches,
			outputValidations: prepared.outputValidations,
			collectionValidation: prepared.collectionValidation,
			parentCandidateById: prepared.parentCandidateById,
			selections: prepared.selections
		};
	} catch (error) {
		return failed(error instanceof Error ? error.message : String(error));
	}
}

export function scienceChallengeReviewRebaseArtifactPaths(outputRoot, shardIds = []) {
	const root = path.resolve(outputRoot);
	return {
		manifest: path.join(root, 'manifest.json'),
		plan: path.join(root, 'plan.json'),
		planValidation: path.join(root, 'plan-validation.json'),
		collectionValidation: path.join(root, 'collection-validation.json'),
		shards: new Map(
			shardIds.map((shardId) => [
				shardId,
				{
					candidate: path.join(root, 'shards', shardId, 'candidate.json'),
					validation: path.join(root, 'shards', shardId, 'validation.json')
				}
			])
		)
	};
}

function prepare(options) {
	if (!isRecord(options)) return failed('Review-rebase evidence options must be an object.');
	const repositoryRoot = requireRepositoryRoot(options.repositoryRoot);
	const outputRootRelative = normalizeRepositoryRelativePath(
		options.outputRoot,
		'review-rebase output root'
	);
	const outputRoot = resolveWithin(repositoryRoot, outputRootRelative);
	if (!options.allowExistingOutputRoot && existsSync(outputRoot)) {
		return failed('Review-rebase output root must be absent before preparation.');
	}
	if (options.allowExistingOutputRoot) {
		requireSafeExistingDirectory(repositoryRoot, outputRootRelative, 'review-rebase output root');
	} else {
		requireSafeDirectoryChain(repositoryRoot, path.dirname(outputRoot), {
			allowMissingTail: true,
			label: 'review-rebase output parent'
		});
	}

	const requestedPaths = {
		specPath: normalizeRepositoryRelativePath(options.specPath, 'spec path'),
		basePlanPath: normalizeRepositoryRelativePath(options.basePlanPath, 'base plan path'),
		sourceSnapshotPath: normalizeRepositoryRelativePath(
			options.sourceSnapshotPath,
			'source snapshot path'
		),
		curriculumEvidencePath: normalizeRepositoryRelativePath(
			options.curriculumEvidencePath,
			'curriculum evidence path'
		),
		parentVerificationPath: normalizeRepositoryRelativePath(
			options.parentVerificationPath,
			'parent verification path'
		),
		parentRepairPath: normalizeRepositoryRelativePath(
			options.parentRepairPath,
			'parent repair path'
		),
		selectionIndexPath: normalizeRepositoryRelativePath(
			options.selectionIndexPath,
			'selection index path'
		)
	};
	const inputs = {};
	for (const [field, relativePath] of Object.entries(requestedPaths)) {
		inputs[field] = loadBoundJson(repositoryRoot, relativePath, field);
	}
	if (
		!Array.isArray(options.existingDefinitions) ||
		options.existingDefinitions.length !== inputs.basePlanPath.value.baseCatalogRecordCount
	) {
		return failed(
			'Review-rebase evidence requires the catalogue record count bound into the base plan.'
		);
	}
	const validators = resolveValidators({
		options,
		sourceSnapshot: inputs.sourceSnapshotPath.value,
		curriculumEvidence: inputs.curriculumEvidencePath.value
	});
	const { value: selectionIndex } = inputs.selectionIndexPath;
	const selectionLoad = loadSelectionIndex({
		repositoryRoot,
		selectionIndex,
		basePlan: inputs.basePlanPath.value,
		parentVerification: inputs.parentVerificationPath.value
	});
	if (selectionLoad.status !== 'passed') return selectionLoad;

	const built = buildScienceChallengeReviewRebase({
		basePlan: inputs.basePlanPath.value,
		sourceSnapshot: inputs.sourceSnapshotPath.value,
		curriculumEvidence: inputs.curriculumEvidencePath.value,
		parentVerificationSummary: inputs.parentVerificationPath.value,
		parentRepairSummary: inputs.parentRepairPath.value,
		parentCandidateById: selectionLoad.parentCandidateById,
		selections: selectionLoad.selections,
		spec: inputs.specPath.value,
		validatePlan: validators.validatePlan,
		validateBatch: validators.validateBatch,
		validateCollection: validators.validateCollection
	});
	if (built.status !== 'passed') return built;

	const shardIds = [...built.candidateBatches.keys()].sort();
	const artifacts = scienceChallengeReviewRebaseArtifactPaths(outputRoot, shardIds);
	const manifestPathRelative = portableRelative(repositoryRoot, artifacts.manifest);
	const outputBindings = {
		plan: outputJsonBinding(repositoryRoot, artifacts.plan, built.plan),
		planValidation: outputJsonBinding(
			repositoryRoot,
			artifacts.planValidation,
			built.planValidation
		),
		collectionValidation: outputJsonBinding(
			repositoryRoot,
			artifacts.collectionValidation,
			built.collectionValidation
		),
		shards: shardIds.map((shardId) => ({
			shardId,
			candidate: outputJsonBinding(
				repositoryRoot,
				artifacts.shards.get(shardId).candidate,
				built.candidateBatches.get(shardId)
			),
			validation: outputJsonBinding(
				repositoryRoot,
				artifacts.shards.get(shardId).validation,
				built.outputValidations.get(shardId)
			)
		}))
	};
	const evidence = {
		schemaVersion: SCIENCE_CHALLENGE_REVIEW_REBASE_EVIDENCE_SCHEMA,
		outputRoot: outputRootRelative,
		manifestPath: manifestPathRelative,
		inputs: {
			spec: inputs.specPath.binding,
			basePlan: inputs.basePlanPath.binding,
			sourceSnapshot: inputs.sourceSnapshotPath.binding,
			curriculumEvidence: inputs.curriculumEvidencePath.binding,
			parentVerification: inputs.parentVerificationPath.binding,
			parentRepair: inputs.parentRepairPath.binding,
			selectionIndex: inputs.selectionIndexPath.binding,
			existingDefinitions: {
				count: options.existingDefinitions.length,
				canonicalSha256: canonicalHash(options.existingDefinitions)
			},
			parentCandidateSources: selectionLoad.parentCandidateBindings,
			selectedArtifacts: selectionLoad.selectedArtifactBindings
		},
		outputs: outputBindings
	};
	const manifest = {
		...built.manifest,
		evidence
	};
	return {
		status: 'passed',
		issues: [],
		action: options.allowExistingOutputRoot ? 'replay-prepared' : 'publish-prepared',
		repositoryRoot,
		outputRoot,
		outputRootRelative,
		manifestPathRelative,
		manifest,
		coreManifest: built.manifest,
		plan: built.plan,
		planValidation: built.planValidation,
		candidateBatches: built.candidateBatches,
		outputValidations: built.outputValidations,
		collectionValidation: built.collectionValidation,
		orderedCandidates: built.orderedCandidates,
		parentCandidateById: selectionLoad.parentCandidateById,
		selections: selectionLoad.selections,
		artifacts
	};
}

function loadSelectionIndex({ repositoryRoot, selectionIndex, basePlan, parentVerification }) {
	const issues = [];
	if (
		!isRecord(selectionIndex) ||
		selectionIndex.schemaVersion !== SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA
	) {
		return failed(
			`Selection index must use ${SCIENCE_CHALLENGE_REVIEW_REBASE_SELECTION_INDEX_SCHEMA}.`
		);
	}
	if (
		!Array.isArray(selectionIndex.parentCandidateSources) ||
		!Array.isArray(selectionIndex.selections)
	) {
		return failed('Selection index requires parentCandidateSources and selections arrays.');
	}
	const shardIds = [...new Set(basePlan?.rows?.map((row) => row?.shard) ?? [])].sort();
	if (
		selectionIndex.parentCandidateSources.length !== shardIds.length ||
		selectionIndex.selections.length !== shardIds.length
	) {
		issues.push('Selection index must contain exactly one parent source and selection per shard.');
	}
	const parentSourceByShard = uniqueByShard(
		selectionIndex.parentCandidateSources,
		'parent candidate source',
		issues
	);
	const selectionByShard = uniqueByShard(selectionIndex.selections, 'selection', issues);
	if (
		shardIds.some((shardId) => !parentSourceByShard.has(shardId) || !selectionByShard.has(shardId))
	) {
		issues.push('Selection index shard membership differs from the base plan.');
	}
	if (issues.length) return failed(issues);

	const parentCandidateById = new Map();
	const parentCandidateBindings = [];
	for (const shardId of shardIds) {
		const descriptor = parentSourceByShard.get(shardId);
		const assignmentPath = normalizeRepositoryRelativePath(
			descriptor.assignmentPath,
			`${shardId} parent assignment path`
		);
		requireHash(descriptor.assignmentSha256, `${shardId} parent assignment SHA-256`);
		const loaded = loadBoundJson(repositoryRoot, assignmentPath, `${shardId} parent assignment`);
		if (loaded.binding.canonicalSha256 !== descriptor.assignmentSha256) {
			issues.push(`${shardId} parent assignment SHA-256 is stale.`);
			continue;
		}
		const assignment = loaded.value;
		const expectedRows = basePlan.rows.filter((row) => row.shard === shardId);
		const candidates = assignment?.items?.map((item) => item?.candidate) ?? [];
		const candidateIds = candidates.map((candidate) => candidate?.definition?.id);
		const expectedIds = expectedRows.map((row) => row.id);
		if (
			assignment?.assignmentId !== shardId ||
			assignment?.planSha256 !== canonicalHash(basePlan) ||
			assignment?.sourceSnapshotSha256 !== parentVerification?.sourceSnapshotSha256 ||
			assignment?.curriculumEvidenceSha256 !== parentVerification?.curriculumEvidenceSha256 ||
			canonicalHash(candidateIds) !== canonicalHash(expectedIds) ||
			candidates.some((candidate) => !isRecord(candidate))
		) {
			issues.push(`${shardId} parent assignment does not bind the exact base-plan candidates.`);
			continue;
		}
		for (const candidate of candidates) {
			if (parentCandidateById.has(candidate.definition.id)) {
				issues.push(`${candidate.definition.id} has duplicate parent candidate evidence.`);
			}
			parentCandidateById.set(candidate.definition.id, candidate);
		}
		parentCandidateBindings.push({
			shardId,
			assignment: loaded.binding
		});
	}
	const parentOrderedCandidates = basePlan.rows.map((row) => parentCandidateById.get(row.id));
	if (
		parentOrderedCandidates.length !== basePlan.rows.length ||
		parentOrderedCandidates.some((candidate) => !isRecord(candidate)) ||
		canonicalHash(parentOrderedCandidates) !== parentVerification?.candidateSetSha256
	) {
		issues.push('Parent assignments differ from the verifier-bound parent candidate set.');
	}

	const selections = [];
	const selectedArtifactBindings = [];
	for (const shardId of shardIds) {
		const descriptor = selectionByShard.get(shardId);
		const loaded = loadCandidateValidationPair({
			repositoryRoot,
			shardId,
			descriptor,
			label: `${shardId} selection`
		});
		if (loaded.status !== 'passed') {
			issues.push(...loaded.issues);
			continue;
		}
		const rowOverrides = [];
		const rowOverrideBindings = [];
		if (descriptor.rowOverrides !== undefined && !Array.isArray(descriptor.rowOverrides)) {
			issues.push(`${shardId} rowOverrides must be an array when present.`);
			continue;
		}
		const seenOverrideIds = new Set();
		for (const [index, overrideDescriptor] of (descriptor.rowOverrides ?? []).entries()) {
			if (
				!nonEmpty(overrideDescriptor?.challengeId) ||
				!HASH.test(String(overrideDescriptor?.rowSha256 ?? '')) ||
				seenOverrideIds.has(overrideDescriptor?.challengeId)
			) {
				issues.push(
					`${shardId} rowOverrides[${index}] has a missing challengeId or row hash, or is duplicated.`
				);
				continue;
			}
			seenOverrideIds.add(overrideDescriptor.challengeId);
			const override = loadCandidateValidationPair({
				repositoryRoot,
				shardId,
				descriptor: overrideDescriptor,
				label: `${shardId} row override ${overrideDescriptor.challengeId}`
			});
			if (override.status !== 'passed') {
				issues.push(...override.issues);
				continue;
			}
			rowOverrides.push({
				challengeId: overrideDescriptor.challengeId,
				rowSha256: overrideDescriptor.rowSha256,
				candidatePath: override.selection.candidatePath,
				candidateSha256: override.selection.candidateSha256,
				validationPath: override.selection.validationPath,
				validationSha256: override.selection.validationSha256,
				candidate: override.selection.candidate,
				validation: override.selection.validation
			});
			rowOverrideBindings.push({
				challengeId: overrideDescriptor.challengeId,
				rowSha256: overrideDescriptor.rowSha256,
				candidate: override.bindings.candidate,
				validation: override.bindings.validation
			});
		}
		selections.push({
			shardId,
			disposition: descriptor.disposition,
			candidatePath: loaded.selection.candidatePath,
			candidateSha256: loaded.selection.candidateSha256,
			validationPath: loaded.selection.validationPath,
			validationSha256: loaded.selection.validationSha256,
			candidate: loaded.selection.candidate,
			validation: loaded.selection.validation,
			...(rowOverrides.length ? { rowOverrides } : {})
		});
		selectedArtifactBindings.push({
			shardId,
			disposition: descriptor.disposition,
			candidate: loaded.bindings.candidate,
			validation: loaded.bindings.validation,
			...(rowOverrideBindings.length ? { rowOverrides: rowOverrideBindings } : {})
		});
	}
	return issues.length
		? failed(issues)
		: {
				status: 'passed',
				issues: [],
				parentCandidateById,
				parentCandidateBindings,
				selections,
				selectedArtifactBindings
			};
}

function loadCandidateValidationPair({ repositoryRoot, shardId, descriptor, label }) {
	try {
		if (!isRecord(descriptor) || (descriptor.shardId && descriptor.shardId !== shardId)) {
			return failed(`${label} has an invalid shard binding.`);
		}
		const candidatePath = normalizeRepositoryRelativePath(
			descriptor.candidatePath,
			`${label} candidate path`
		);
		const validationPath = normalizeRepositoryRelativePath(
			descriptor.validationPath,
			`${label} validation path`
		);
		requireHash(descriptor.candidateSha256, `${label} candidate SHA-256`);
		requireHash(descriptor.validationSha256, `${label} validation SHA-256`);
		const candidate = loadBoundJson(repositoryRoot, candidatePath, `${label} candidate`);
		const validation = loadBoundJson(repositoryRoot, validationPath, `${label} validation`);
		if (candidate.binding.canonicalSha256 !== descriptor.candidateSha256) {
			return failed(`${label} candidate SHA-256 is stale.`);
		}
		if (validation.binding.canonicalSha256 !== descriptor.validationSha256) {
			return failed(`${label} validation SHA-256 is stale.`);
		}
		return {
			status: 'passed',
			issues: [],
			selection: {
				candidatePath,
				candidateSha256: descriptor.candidateSha256,
				validationPath,
				validationSha256: descriptor.validationSha256,
				candidate: candidate.value,
				validation: validation.value
			},
			bindings: {
				candidate: candidate.binding,
				validation: validation.binding
			}
		};
	} catch (error) {
		return failed(`${label}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function writePreparedTree(temporary, prepared) {
	const shardIds = [...prepared.candidateBatches.keys()].sort();
	const paths = scienceChallengeReviewRebaseArtifactPaths(temporary, shardIds);
	mkdirSync(path.join(temporary, 'shards'), { recursive: true });
	for (const shardId of shardIds) {
		mkdirSync(path.dirname(paths.shards.get(shardId).candidate), { recursive: true });
		writeFileSync(
			paths.shards.get(shardId).candidate,
			stableJsonBytes(prepared.candidateBatches.get(shardId)),
			{ flag: 'wx' }
		);
		writeFileSync(
			paths.shards.get(shardId).validation,
			stableJsonBytes(prepared.outputValidations.get(shardId)),
			{ flag: 'wx' }
		);
	}
	writeFileSync(paths.plan, stableJsonBytes(prepared.plan), { flag: 'wx' });
	writeFileSync(paths.planValidation, stableJsonBytes(prepared.planValidation), { flag: 'wx' });
	writeFileSync(paths.collectionValidation, stableJsonBytes(prepared.collectionValidation), {
		flag: 'wx'
	});
	writeFileSync(paths.manifest, stableJsonBytes(prepared.manifest), { flag: 'wx' });
}

function comparePublishedTree(outputRoot, prepared) {
	const shardIds = [...prepared.candidateBatches.keys()].sort();
	const paths = scienceChallengeReviewRebaseArtifactPaths(outputRoot, shardIds);
	for (const [label, filePath, value] of [
		['plan', paths.plan, prepared.plan],
		['plan validation', paths.planValidation, prepared.planValidation],
		['collection validation', paths.collectionValidation, prepared.collectionValidation]
	]) {
		requireSafeExistingFile(
			prepared.repositoryRoot,
			portableRelative(prepared.repositoryRoot, filePath),
			label
		);
		if (!readFileSync(filePath).equals(stableJsonBytes(value))) {
			throw new Error(`Review-rebase ${label} bytes differ from deterministic replay.`);
		}
	}
	for (const shardId of shardIds) {
		for (const [label, filePath, value] of [
			['candidate', paths.shards.get(shardId).candidate, prepared.candidateBatches.get(shardId)],
			['validation', paths.shards.get(shardId).validation, prepared.outputValidations.get(shardId)]
		]) {
			requireSafeExistingFile(
				prepared.repositoryRoot,
				portableRelative(prepared.repositoryRoot, filePath),
				`${shardId} ${label}`
			);
			if (!readFileSync(filePath).equals(stableJsonBytes(value))) {
				throw new Error(
					`Review-rebase ${shardId} ${label} bytes differ from deterministic replay.`
				);
			}
		}
	}
	const expectedFiles = new Set([
		'manifest.json',
		'plan.json',
		'plan-validation.json',
		'collection-validation.json',
		...shardIds.flatMap((shardId) => [
			`shards/${shardId}/candidate.json`,
			`shards/${shardId}/validation.json`
		])
	]);
	const actualFiles = listTreeFiles(outputRoot);
	if (
		actualFiles.length !== expectedFiles.size ||
		actualFiles.some((relativePath) => !expectedFiles.has(relativePath))
	) {
		throw new Error('Review-rebase output tree contains missing or unexpected artifacts.');
	}
}

function inputPathsFromEvidence(inputs) {
	if (!isRecord(inputs)) throw new Error('Review-rebase manifest input bindings are missing.');
	for (const field of [
		'spec',
		'basePlan',
		'sourceSnapshot',
		'curriculumEvidence',
		'parentVerification',
		'parentRepair',
		'selectionIndex'
	]) {
		if (!isRecord(inputs[field]) || !nonEmpty(inputs[field].path)) {
			throw new Error(`Review-rebase manifest ${field} input binding is missing.`);
		}
	}
	return {
		specPath: inputs.spec.path,
		basePlanPath: inputs.basePlan.path,
		sourceSnapshotPath: inputs.sourceSnapshot.path,
		curriculumEvidencePath: inputs.curriculumEvidence.path,
		parentVerificationPath: inputs.parentVerification.path,
		parentRepairPath: inputs.parentRepair.path,
		selectionIndexPath: inputs.selectionIndex.path
	};
}

function outputJsonBinding(repositoryRoot, filePath, value) {
	const bytes = stableJsonBytes(value);
	return {
		path: portableRelative(repositoryRoot, filePath),
		fileSha256: sha256(bytes),
		canonicalSha256: canonicalHash(value)
	};
}

function loadBoundJson(repositoryRoot, relativePath, label) {
	const filePath = requireSafeExistingFile(repositoryRoot, relativePath, label);
	const loaded = readJsonBytes(filePath, label);
	return {
		...loaded,
		binding: {
			path: relativePath,
			fileSha256: sha256(loaded.bytes),
			canonicalSha256: canonicalHash(loaded.value)
		}
	};
}

function readJsonBytes(filePath, label) {
	const bytes = readFileSync(filePath);
	let value;
	try {
		value = JSON.parse(bytes.toString('utf8'));
	} catch (error) {
		throw new Error(
			`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	return { bytes, value };
}

function requireRepositoryRoot(value) {
	if (!nonEmpty(value)) throw new Error('Review-rebase repository root is required.');
	const resolved = path.resolve(value);
	if (!existsSync(resolved) || !lstatSync(resolved).isDirectory()) {
		throw new Error('Review-rebase repository root must be an existing directory.');
	}
	if (lstatSync(resolved).isSymbolicLink()) {
		throw new Error('Review-rebase repository root must not be a symbolic link.');
	}
	return realpathSync(resolved);
}

function normalizeRepositoryRelativePath(value, label) {
	if (!nonEmpty(value) || path.isAbsolute(value) || value.includes('\\') || value.includes('\0')) {
		throw new Error(`${label} must be a portable repository-relative path.`);
	}
	const normalized = path.posix.normalize(value);
	if (
		normalized !== value ||
		normalized === '.' ||
		normalized === '..' ||
		normalized.startsWith('../') ||
		normalized.split('/').some((part) => !part || part === '.' || part === '..')
	) {
		throw new Error(`${label} must be a normalized repository-relative path.`);
	}
	return normalized;
}

function resolveWithin(repositoryRoot, relativePath) {
	const resolved = path.resolve(repositoryRoot, ...relativePath.split('/'));
	if (resolved === repositoryRoot || !resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
		throw new Error('Repository-relative path escapes the repository root.');
	}
	return resolved;
}

function requireSafeExistingFile(repositoryRoot, relativePath, label) {
	const normalized = normalizeRepositoryRelativePath(relativePath, `${label} path`);
	const resolved = resolveWithin(repositoryRoot, normalized);
	requireNoSymlinkComponents(repositoryRoot, normalized, label);
	const stat = lstatSync(resolved);
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error(`${label} must be a regular non-symlink file.`);
	}
	if (!realpathSync(resolved).startsWith(`${repositoryRoot}${path.sep}`)) {
		throw new Error(`${label} resolves outside the repository root.`);
	}
	return resolved;
}

function requireSafeExistingDirectory(repositoryRoot, relativePath, label) {
	const normalized = normalizeRepositoryRelativePath(relativePath, `${label} path`);
	const resolved = resolveWithin(repositoryRoot, normalized);
	requireNoSymlinkComponents(repositoryRoot, normalized, label);
	const stat = lstatSync(resolved);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`${label} must be a non-symlink directory.`);
	}
	return resolved;
}

function requireNoSymlinkComponents(repositoryRoot, relativePath, label) {
	let current = repositoryRoot;
	for (const part of relativePath.split('/')) {
		current = path.join(current, part);
		if (!existsSync(current)) throw new Error(`${label} is missing: ${relativePath}`);
		const stat = lstatSync(current);
		if (stat.isSymbolicLink()) throw new Error(`${label} contains a symbolic link.`);
	}
}

function requireSafeDirectoryChain(repositoryRoot, directory, { allowMissingTail, label }) {
	if (path.resolve(directory) === repositoryRoot) return;
	const relative = portableRelative(repositoryRoot, directory);
	normalizeRepositoryRelativePath(relative, `${label} path`);
	let current = repositoryRoot;
	let missing = false;
	for (const part of relative.split('/')) {
		current = path.join(current, part);
		if (!existsSync(current)) {
			missing = true;
			if (!allowMissingTail) throw new Error(`${label} is missing.`);
			continue;
		}
		if (missing) throw new Error(`${label} has a non-contiguous filesystem path.`);
		const stat = lstatSync(current);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error(`${label} contains a non-directory or symbolic-link component.`);
		}
	}
}

function listTreeFiles(root) {
	const files = [];
	const visit = (directory, prefix = '') => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.isSymbolicLink()) {
				throw new Error('Review-rebase output tree contains a symbolic link.');
			}
			const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
			const filePath = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(filePath, relative);
			else if (entry.isFile()) files.push(relative);
			else throw new Error('Review-rebase output tree contains a non-regular artifact.');
		}
	};
	visit(root);
	return files.sort();
}

function uniqueByShard(rows, label, issues) {
	const result = new Map();
	for (const row of rows) {
		if (!nonEmpty(row?.shardId) || result.has(row.shardId)) {
			issues.push(`${label} shard ids must be non-empty and unique.`);
			continue;
		}
		result.set(row.shardId, row);
	}
	return result;
}

function resolveValidators({ options, sourceSnapshot, curriculumEvidence }) {
	const supplied = [options.validatePlan, options.validateBatch, options.validateCollection];
	if (supplied.some((value) => value !== undefined)) {
		if (supplied.some((value) => typeof value !== 'function')) {
			throw new Error(
				'Review-rebase evidence requires all three injected validators when any is supplied.'
			);
		}
		return {
			validatePlan: options.validatePlan,
			validateBatch: options.validateBatch,
			validateCollection: options.validateCollection
		};
	}
	const existingDefinitions = options.existingDefinitions;
	const sourceById = new Map(
		sourceSnapshot.questions.map((question) => [
			question.id,
			{
				...question,
				contentSha256: question.contentSha256 ?? canonicalHash(question)
			}
		])
	);
	const curriculumById = new Map(
		curriculumEvidence.components.map((component) => [component.componentId, component])
	);
	return {
		validatePlan: (plan) =>
			validateChallengePlan(plan, {
				sourceSnapshot,
				curriculumEvidence
			}),
		validateBatch: (candidate, rows, plan) =>
			validateScienceChallengeGeneratedBatch(candidate, rows, {
				sourceById,
				curriculumById,
				existingDefinitions,
				planRows: plan.rows
			}),
		validateCollection: (candidateSet) =>
			validateGeneratedChallengeCollection(candidateSet, { existingDefinitions })
	};
}

function stableJsonBytes(value) {
	return Buffer.from(`${stableStringify(value)}\n`);
}

function portableRelative(root, filePath) {
	const relative = path.relative(root, filePath).split(path.sep).join('/');
	return normalizeRepositoryRelativePath(relative, 'recorded artifact path');
}

function requireHash(value, label) {
	if (!HASH.test(String(value ?? ''))) throw new Error(`${label} is invalid.`);
	return value;
}

function nonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function failed(input) {
	return { status: 'failed', issues: Array.isArray(input) ? input : [input] };
}
