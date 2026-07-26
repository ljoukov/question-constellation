import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import {
	SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HASH_RECEIPT_SCHEMA,
	SCIENCE_CHALLENGE_ACCEPTED_SUBSET_MANIFEST_SCHEMA,
	SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID,
	SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS,
	findScienceChallengeAcceptedSubsetLeaks,
	validateScienceChallengeAcceptedSubsetArtifacts
} from './science-challenge-accepted-subset.mjs';
import { validateScienceChallengeArtCohortManifest } from './science-challenge-art-cohort.mjs';
import {
	SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS,
	SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_SCHEMA,
	validateScienceChallengeCatalogArtAudit
} from './science-challenge-catalog-art-audit.mjs';
import { requireArtGenerationJobEvidence } from './science-challenge-art-lineage.mjs';
import {
	SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_EVIDENCE_SCHEMA,
	SCIENCE_CHALLENGE_SHORT_RECALL_EXPECTED_COUNT,
	SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_EVIDENCE_SCHEMA,
	validateAcceptedScienceChallengeShortRecallArtifacts
} from './science-challenge-short-recall.mjs';
import { requireArtReviewEvidence } from './science-challenge-review-evidence.mjs';
import {
	SCIENCE_CHALLENGE_RELEASE_SCHEMA,
	SCIENCE_QUESTION_ART_DELIVERY_SCHEMA,
	canonicalHash,
	scienceQuestionArtPublicPath,
	scienceQuestionArtR2Key,
	sha256,
	stableStringify,
	validateGeneratedChallengeCollection,
	validateQuestionArtDeliveryManifest
} from './science-challenge-release.mjs';
import {
	buildPerceptualAudit,
	validatePerceptualAudit
} from './science-question-art-perceptual.mjs';

export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID = SCIENCE_CHALLENGE_ACCEPTED_SUBSET_RELEASE_ID;
export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT = 'data/challenges/releases/science-179-v1';
export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_PROVENANCE_SCHEMA =
	'science-challenge-accepted-release-provenance/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COVERAGE_SCHEMA =
	'science-challenge-accepted-release-coverage/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ART_LINEAGE_SCHEMA =
	'science-challenge-accepted-release-art-generation-lineage/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_EVIDENCE_PROJECTION_SCHEMA =
	'science-challenge-accepted-release-evidence-projection/v1';
export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_CURRICULUM_INDEX_SCHEMA =
	'science-challenge-accepted-release-curriculum-index/v1';

export const SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS = Object.freeze({
	reviewed: 408,
	accepted: 179,
	heldOut: 229,
	holdoutIssues: 340,
	existingDefinitions: 92,
	finalCatalogue: 271,
	acceptedVisuals: 179,
	existingReplacementVisuals: 60,
	visuals: 239,
	artPairs: 239,
	artFiles: 478,
	coveredCurriculumComponents: 162,
	totalCurriculumComponents: 304
});

const ACCEPTED_SUBSET_PROVENANCE_FILES = Object.freeze({
	acceptedSubset: 'accepted-subset.json',
	subsetManifest: 'source-manifest.json',
	evidenceProjection: 'evidence-projection.json',
	collectionValidation: 'collection-validation.json',
	holdoutLedger: 'holdout-ledger.json',
	hashReceipt: 'source-hash-receipt.json',
	curriculumEvidence: 'curriculum-evidence.json',
	trackedManifest: 'manifest.json',
	trackedHashReceipt: 'hash-receipt.json'
});
const ACCEPTED_SUBSET_SOURCE_FILES = Object.freeze({
	acceptedSubset: 'accepted-subset.json',
	evidenceProjection: 'evidence-projection.json',
	collectionValidation: 'collection-validation.json',
	holdoutLedger: 'holdout-ledger.json',
	hashReceipt: 'hash-receipt.json'
});
const RELEASE_SIBLINGS = Object.freeze({
	runtime: 'runtime.json',
	shortRecallPrompts: 'short-recall-prompts.json',
	shortRecallAuthoringEvidence: 'short-recall-authoring-evidence.json',
	shortRecallReviewEvidence: 'short-recall-review-evidence.json',
	artManifest: 'art-manifest.json',
	artReview: 'art-review.json',
	artPerceptualAudit: 'art-perceptual-audit.json',
	artGenerationLineage: 'art-generation-lineage.json',
	artDeliveryManifest: 'art-delivery-manifest.json',
	catalogArtAudit: 'catalog-art-audit.json',
	coverage: 'coverage.json'
});
const ACCEPTED_MARKER = 'accepted-challenges.json';
const PROVENANCE_ROOT = 'provenance/accepted-subset';
const PROVENANCE_MANIFEST = 'provenance/manifest.json';
const SHA256 = /^[a-f0-9]{64}$/u;
const CURRICULUM_COMPONENT_ID = /^[a-z0-9][a-z0-9.:-]*$/u;
const WEBP_RIFF = Buffer.from('RIFF');
const WEBP_MAGIC = Buffer.from('WEBP');
const RAW_EVIDENCE_PROJECTION_DEPENDENCY = Object.freeze({
	dependencyId: 'science-179-v1-accepted-subset-evidence-projection-raw',
	role: 'accepted-subset-evidence-projection-raw',
	basename: 'evidence-projection.json'
});
const RAW_CURRICULUM_EVIDENCE_DEPENDENCY = Object.freeze({
	dependencyId: 'science-179-v1-curriculum-evidence-raw',
	role: 'curriculum-evidence-raw',
	basename: 'curriculum-evidence.json'
});

/**
 * Fully authenticate every input and prepare the immutable release tree without writing anything.
 */
export function prepareScienceChallengeAcceptedRelease(options = {}) {
	const repositoryRoot = requireRealDirectory(
		options.repositoryRoot ?? process.cwd(),
		'repository root'
	);
	const artEvidenceRoot = requireRealDirectory(
		options.artEvidenceRoot ?? repositoryRoot,
		'art evidence root'
	);
	const outputRootRelative = normalizeRelative(
		options.outputRoot ?? SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT,
		'release output'
	);
	if (outputRootRelative !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT) {
		throw new Error(
			`Accepted release output must be ${SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT}.`
		);
	}
	const outputRoot = resolveWithin(repositoryRoot, outputRootRelative);
	assertAbsentPathEntry(outputRoot, 'Accepted release output');

	const values = requireInputValues(options);
	validateAcceptedSubsetPackage(values);
	validateExistingDefinitions(values.existingDefinitions, values.evidenceProjection);
	validateAcceptedChallenges(values.acceptedSubset, values.existingDefinitions);
	const coverage = buildScienceChallengeAcceptedReleaseCoverage({
		acceptedSubset: values.acceptedSubset,
		evidenceProjection: values.evidenceProjection
	});
	const curriculumById = validateCurriculumEvidence({
		acceptedSubset: values.acceptedSubset,
		evidenceProjection: values.evidenceProjection,
		curriculumEvidence: values.curriculumEvidence,
		coverage
	});
	validateShortRecall(values);

	const artValidation = validateScienceChallengeArtCohortManifest(values.artManifest);
	if (artValidation.status !== 'passed') {
		throw new Error(`Accepted art cohort failed:\n${artValidation.issues.join('\n')}`);
	}
	validateArtOwnerPartition({
		acceptedSubset: values.acceptedSubset,
		existingDefinitions: values.existingDefinitions,
		artManifest: values.artManifest
	});
	const artDeliveryManifest = buildScienceChallengeAcceptedArtDelivery({
		repositoryRoot: artEvidenceRoot,
		artManifest: values.artManifest
	});
	validateAcceptedArtReview({
		repositoryRoot: artEvidenceRoot,
		artManifest: values.artManifest,
		artReview: values.artReview,
		artDeliveryManifest
	});
	validateAcceptedPerceptualAudit({
		repositoryRoot: artEvidenceRoot,
		artManifest: values.artManifest,
		artPerceptualAudit: values.artPerceptualAudit,
		artDeliveryManifest,
		recompute: options.recomputePerceptualAudit !== false
	});
	const artGenerationLineage = buildScienceChallengeAcceptedArtGenerationLineage({
		repositoryRoot: artEvidenceRoot,
		generationRoot: options.artGenerationRoot,
		artManifest: values.artManifest,
		artDeliveryManifest
	});
	validateCatalogueArtAudit({
		catalogArtAudit: values.catalogArtAudit,
		acceptedSubset: values.acceptedSubset,
		artManifest: values.artManifest,
		existingDefinitions: values.existingDefinitions
	});
	const runtime = buildScienceChallengeAcceptedRuntime({
		acceptedSubset: values.acceptedSubset,
		existingDefinitions: values.existingDefinitions,
		curriculumById,
		artManifest: values.artManifest,
		artDeliveryManifest
	});

	const externalDependencies = validateAcceptedReleaseExternalDependencies(values);
	const curriculumIndex = buildSanitizedCurriculumIndex(values.curriculumEvidence);
	const sanitizedEvidenceProjection = buildSanitizedEvidenceProjection({
		evidenceProjection: values.evidenceProjection,
		curriculumIndex,
		externalDependency: externalDependencies[0]
	});
	const siblings = new Map();
	addSibling(siblings, RELEASE_SIBLINGS.runtime, runtime);
	addSibling(siblings, RELEASE_SIBLINGS.shortRecallPrompts, values.shortRecallPrompts);
	addSibling(
		siblings,
		RELEASE_SIBLINGS.shortRecallAuthoringEvidence,
		values.shortRecallAuthoringEvidence
	);
	addSibling(
		siblings,
		RELEASE_SIBLINGS.shortRecallReviewEvidence,
		values.shortRecallReviewEvidence
	);
	addSibling(siblings, RELEASE_SIBLINGS.artManifest, values.artManifest);
	addSibling(siblings, RELEASE_SIBLINGS.artReview, values.artReview);
	addSibling(siblings, RELEASE_SIBLINGS.artPerceptualAudit, values.artPerceptualAudit);
	addSibling(siblings, RELEASE_SIBLINGS.artGenerationLineage, artGenerationLineage);
	addSibling(siblings, RELEASE_SIBLINGS.artDeliveryManifest, artDeliveryManifest);
	addSibling(siblings, RELEASE_SIBLINGS.catalogArtAudit, values.catalogArtAudit);
	addSibling(siblings, RELEASE_SIBLINGS.coverage, coverage);

	const provenanceSourceCopies = {
		acceptedSubset: values.acceptedSubset,
		subsetManifest: values.subsetManifest,
		evidenceProjection: sanitizedEvidenceProjection,
		collectionValidation: values.collectionValidation,
		holdoutLedger: values.holdoutLedger,
		hashReceipt: values.hashReceipt,
		curriculumEvidence: curriculumIndex
	};
	const trackedReceipts = buildTrackedAcceptedSubsetProvenanceReceipts({
		provenanceCopies: provenanceSourceCopies,
		externalDependencies
	});
	const provenanceCopies = {
		...provenanceSourceCopies,
		...trackedReceipts
	};
	for (const [role, value] of Object.entries(provenanceCopies)) {
		addSibling(siblings, `${PROVENANCE_ROOT}/${ACCEPTED_SUBSET_PROVENANCE_FILES[role]}`, value);
	}
	const provenanceManifest = buildAcceptedReleaseProvenanceManifest({
		acceptedSubset: values.acceptedSubset,
		evidenceProjection: values.evidenceProjection,
		holdoutLedger: values.holdoutLedger,
		provenanceCopies,
		externalDependencies
	});
	addSibling(siblings, PROVENANCE_MANIFEST, provenanceManifest);

	const siblingInventory = buildSiblingInventory(siblings);
	const acceptedMarker = buildScienceChallengeAcceptedReleaseMarker({
		acceptedSubset: values.acceptedSubset,
		runtime,
		shortRecallPrompts: values.shortRecallPrompts,
		shortRecallAuthoringEvidence: values.shortRecallAuthoringEvidence,
		shortRecallReviewEvidence: values.shortRecallReviewEvidence,
		artManifest: values.artManifest,
		artReview: values.artReview,
		artPerceptualAudit: values.artPerceptualAudit,
		artGenerationLineage,
		artDeliveryManifest,
		catalogArtAudit: values.catalogArtAudit,
		curriculumEvidence: curriculumIndex,
		rawCurriculumEvidenceSha256: canonicalHash(values.curriculumEvidence),
		coverage,
		provenanceManifest,
		siblingInventory
	});
	assertNoPathOrUserLeaks({
		...Object.fromEntries(siblings),
		[ACCEPTED_MARKER]: acceptedMarker
	});

	return {
		status: 'passed',
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		repositoryRoot,
		outputRoot,
		outputRootRelative,
		siblings,
		siblingInventory,
		acceptedMarker,
		runtime,
		coverage,
		artDeliveryManifest,
		artGenerationLineage,
		releaseSha256: canonicalHash(acceptedMarker),
		plannedWrites: [...siblings.keys(), ACCEPTED_MARKER].sort(compareCodePoints)
	};
}

/**
 * Publish the prepared tree through one same-filesystem rename. Existing output is never reused.
 */
export function publishScienceChallengeAcceptedRelease(options = {}) {
	const repositoryRoot = requireRealDirectory(
		options.repositoryRoot ?? process.cwd(),
		'repository root'
	);
	const outputRoot = resolveWithin(repositoryRoot, SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT);
	assertAbsentPathEntry(outputRoot, 'Accepted release output');
	const prepared = prepareScienceChallengeAcceptedRelease({
		...options,
		repositoryRoot,
		outputRoot: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT
	});
	const parent = path.dirname(outputRoot);
	let stagingRoot = null;
	try {
		requireSafeParent(repositoryRoot, parent, true);
		mkdirSync(parent, { recursive: true });
		requireSafeParent(repositoryRoot, parent, false);
		stagingRoot = mkdtempSync(
			path.join(parent, `.${SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID}.preparing-`)
		);
		for (const [relativePath, value] of [...prepared.siblings.entries()].sort(([left], [right]) =>
			compareCodePoints(left, right)
		)) {
			writeStableJson(path.join(stagingRoot, relativePath), value);
		}
		// The accepted marker is the commit marker and must always be written last.
		writeStableJson(path.join(stagingRoot, ACCEPTED_MARKER), prepared.acceptedMarker);
		validateScienceChallengeAcceptedReleaseTree({
			releaseRoot: stagingRoot,
			expectedReleaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID
		});
		assertAbsentPathEntry(outputRoot, 'Accepted release output');
		renameSync(stagingRoot, outputRoot);
		stagingRoot = null;
	} catch (error) {
		if (stagingRoot && pathEntryExists(stagingRoot)) {
			rmSync(stagingRoot, { recursive: true, force: true });
		}
		throw error;
	}
	const validated = readScienceChallengeAcceptedRelease({
		repositoryRoot,
		outputRoot: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT
	});
	return { ...prepared, ...validated, action: 'published' };
}

/**
 * Strict read/replay entry point for importers and the R2 uploader.
 */
export function readScienceChallengeAcceptedRelease({
	repositoryRoot = process.cwd(),
	outputRoot = SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT
} = {}) {
	const root = requireRealDirectory(repositoryRoot, 'repository root');
	const relative = normalizeRelative(outputRoot, 'release output');
	if (relative !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT) {
		throw new Error(
			`Accepted release output must be ${SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT}.`
		);
	}
	const releaseRoot = requireRealDirectory(resolveWithin(root, relative), 'accepted release');
	return validateScienceChallengeAcceptedReleaseTree({
		releaseRoot,
		expectedReleaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID
	});
}

/**
 * Closed-world release validation. This does not depend on the legacy 408/2,000 release contract.
 */
export function validateScienceChallengeAcceptedReleaseTree({
	releaseRoot,
	expectedReleaseId = SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID
}) {
	const root = requireRealDirectory(releaseRoot, 'accepted release');
	const files = listRegularFiles(root);
	if (!files.includes(ACCEPTED_MARKER)) {
		throw new Error('Accepted release tree is missing accepted-challenges.json.');
	}
	const markerRecord = readJsonRecord(path.join(root, ACCEPTED_MARKER));
	const marker = markerRecord.value;
	validateAcceptedMarkerHeader(marker, expectedReleaseId);
	const inventory = marker.release.siblings;
	if (!Array.isArray(inventory) || inventory.length === 0) {
		throw new Error('Accepted release marker has no sibling inventory.');
	}
	const fixedSiblingPaths = expectedReleaseSiblingPaths();
	const actualSiblingPaths = inventory.map((entry) => entry?.path).sort(compareCodePoints);
	if (canonicalHash(actualSiblingPaths) !== canonicalHash(fixedSiblingPaths)) {
		throw new Error('Accepted release marker does not contain the fixed sibling set.');
	}
	const expectedFiles = [...inventory.map((entry) => entry.path), ACCEPTED_MARKER].sort(
		compareCodePoints
	);
	if (canonicalHash(files) !== canonicalHash(expectedFiles)) {
		throw new Error('Accepted release tree contains missing or unexpected files.');
	}
	if (marker.release.siblingCount !== inventory.length) {
		throw new Error('Accepted release siblingCount differs from its inventory.');
	}
	if (marker.release.siblingSetSha256 !== canonicalHash(inventory)) {
		throw new Error('Accepted release sibling inventory hash is stale.');
	}
	const seen = new Set();
	const values = new Map();
	for (const entry of inventory) {
		if (
			!isRecord(entry) ||
			typeof entry.path !== 'string' ||
			seen.has(entry.path) ||
			!SHA256.test(String(entry.sha256 ?? '')) ||
			!SHA256.test(String(entry.fileSha256 ?? '')) ||
			!Number.isInteger(entry.size) ||
			entry.size < 1
		) {
			throw new Error('Accepted release sibling inventory is malformed or duplicated.');
		}
		seen.add(entry.path);
		const relative = normalizeRelative(entry.path, 'release sibling');
		const record = readJsonRecord(path.join(root, relative));
		if (
			record.canonicalSha256 !== entry.sha256 ||
			record.fileSha256 !== entry.fileSha256 ||
			record.size !== entry.size
		) {
			throw new Error(`Accepted release sibling differs from its marker: ${relative}`);
		}
		values.set(relative, record.value);
	}
	validateReleaseHashBindings(marker, values);
	validateReleaseDynamicCounts(marker, values);
	validateReleaseSemantics(marker, values);
	assertNoPathOrUserLeaks({
		marker,
		siblings: Object.fromEntries(values)
	});
	return {
		status: 'passed',
		action: 'validated',
		releaseId: expectedReleaseId,
		releaseRoot: root,
		marker,
		values,
		releaseSha256: canonicalHash(marker),
		siblingSetSha256: marker.release.siblingSetSha256,
		counts: {
			challenges: marker.challenges.length,
			visuals: values.get(RELEASE_SIBLINGS.runtime).visuals.length,
			artPairs: values.get(RELEASE_SIBLINGS.artManifest).specs.length,
			artFiles: values.get(RELEASE_SIBLINGS.artDeliveryManifest).objects.length
		}
	};
}

export function buildScienceChallengeAcceptedReleaseCoverage({
	acceptedSubset,
	evidenceProjection
}) {
	const acceptedComponents = uniqueStrings(
		acceptedSubset.challenges.map((entry) => entry?.grounding?.curriculumComponentId)
	);
	const plannedComponents = uniqueStrings(
		evidenceProjection.sourcePlan.plan.rows.map((row) => row.curriculumComponentId)
	);
	const counts = SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS;
	if (
		acceptedComponents.length !== counts.coveredCurriculumComponents ||
		plannedComponents.length !== counts.totalCurriculumComponents ||
		acceptedComponents.some((componentId) => !plannedComponents.includes(componentId))
	) {
		throw new Error(
			`Accepted release curriculum coverage must remain exactly ${counts.coveredCurriculumComponents}/${counts.totalCurriculumComponents}.`
		);
	}
	return {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COVERAGE_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		status: 'partial',
		coveredCurriculumComponentCount: counts.coveredCurriculumComponents,
		totalCurriculumComponentCount: counts.totalCurriculumComponents,
		heldOutCurriculumComponentCount:
			counts.totalCurriculumComponents - counts.coveredCurriculumComponents,
		ratio: `${counts.coveredCurriculumComponents}/${counts.totalCurriculumComponents}`,
		acceptedChallengeCount: counts.accepted,
		heldOutChallengeCount: counts.heldOut,
		coveredCurriculumComponentIdsSha256: canonicalHash(acceptedComponents),
		totalCurriculumComponentIdsSha256: canonicalHash(plannedComponents)
	};
}

export function buildScienceChallengeAcceptedReleaseExternalDependency({
	dependencyId,
	role,
	basename,
	value,
	bytes
}) {
	if (
		typeof dependencyId !== 'string' ||
		!dependencyId ||
		typeof role !== 'string' ||
		!role ||
		typeof basename !== 'string' ||
		path.basename(basename) !== basename ||
		basename === '.' ||
		basename === '..'
	) {
		throw new Error('Accepted release external dependency identity is invalid.');
	}
	const sourceBytes = Buffer.from(bytes ?? []);
	if (sourceBytes.length === 0) {
		throw new Error(`Accepted release external dependency is empty: ${dependencyId}.`);
	}
	let parsed;
	try {
		parsed = JSON.parse(sourceBytes.toString('utf8'));
	} catch (error) {
		throw new Error(
			`Accepted release external dependency is not JSON: ${dependencyId}: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error }
		);
	}
	if (canonicalHash(parsed) !== canonicalHash(value)) {
		throw new Error(`Accepted release external dependency bytes differ from ${dependencyId}.`);
	}
	return {
		dependencyId,
		role,
		basename,
		canonicalSha256: canonicalHash(value),
		fileSha256: sha256(sourceBytes),
		size: sourceBytes.byteLength
	};
}

export function buildScienceChallengeAcceptedArtDelivery({ repositoryRoot, artManifest }) {
	const objects = [];
	const assetInventory = [];
	for (const spec of artManifest.specs) {
		const pair = {};
		for (const theme of ['dark', 'light']) {
			const localPath = spec.output?.[`${theme}Path`];
			const filePath = requireSafeRepositoryFile(
				repositoryRoot,
				localPath,
				`${spec.id} ${theme} WebP`
			);
			if (!localPath.endsWith('.webp')) {
				throw new Error(`Accepted art asset must be a WebP: ${localPath}`);
			}
			const bytes = readFileSync(filePath);
			requireWebpBytes(bytes, localPath);
			const assetSha256 = sha256(bytes);
			pair[`${theme}Sha256`] = assetSha256;
			objects.push({
				id: `${spec.id}-${theme}`,
				artId: spec.id,
				challengeId: spec.challengeId,
				subject: spec.subject,
				context: spec.context,
				theme,
				localPath,
				r2Key: scienceQuestionArtR2Key(artManifest.releaseId, spec.id, theme, assetSha256),
				publicPath: scienceQuestionArtPublicPath(
					artManifest.releaseId,
					spec.id,
					theme,
					assetSha256
				),
				sha256: assetSha256,
				size: statSync(filePath).size,
				contentType: 'image/webp',
				cacheControl: 'public, max-age=31536000, immutable'
			});
		}
		assetInventory.push({ id: spec.id, ...pair });
	}
	const delivery = {
		schemaVersion: SCIENCE_QUESTION_ART_DELIVERY_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		bucket: 'question-constellation',
		sourceManifestSha256: canonicalHash(artManifest),
		assetInventorySha256: canonicalHash(assetInventory),
		objectCount: objects.length,
		objects
	};
	const validation = validateQuestionArtDeliveryManifest(delivery, {
		artManifest,
		expectedCount: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artFiles
	});
	if (validation.status !== 'passed') {
		throw new Error(`Accepted art delivery failed:\n${validation.issues.join('\n')}`);
	}
	if (
		objects.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artFiles ||
		new Set(objects.map((object) => object.localPath)).size !== objects.length
	) {
		throw new Error('Accepted release must deliver exactly 478 unique new WebPs.');
	}
	return delivery;
}

export function buildScienceChallengeAcceptedRuntime({
	acceptedSubset,
	existingDefinitions,
	curriculumById,
	artManifest,
	artDeliveryManifest
}) {
	const definitions = acceptedSubset.challenges.map((entry) => structuredClone(entry.definition));
	const definitionById = new Map(
		[...existingDefinitions, ...definitions].map((definition) => [definition.id, definition])
	);
	const specByOwner = new Map(artManifest.specs.map((spec) => [spec.challengeId, spec]));
	const deliveryById = new Map(artDeliveryManifest.objects.map((object) => [object.id, object]));
	const visuals = artManifest.cohort.owners.map((owner) => {
		const definition = definitionById.get(owner.challengeId);
		const spec = specByOwner.get(owner.challengeId);
		if (!definition || !spec) {
			throw new Error(`Runtime visual owner is missing: ${owner.challengeId}.`);
		}
		const segments = memorySegments(definition.memoryHandle, owner.challengeId);
		const sharedArt = runtimeArtRecord(spec, deliveryById);
		return {
			id: owner.challengeId,
			segments,
			decisiveIndex: Math.max(0, segments.length - 2),
			decisiveLabel: definition.memoryHandle,
			cardArt: sharedArt,
			transferArt: structuredClone(sharedArt)
		};
	});
	const curriculum = acceptedSubset.challenges.map((entry) => {
		const componentId = entry.grounding.curriculumComponentId;
		const component = curriculumById.get(componentId);
		if (!component) {
			throw new Error(`Runtime curriculum component is missing: ${componentId}.`);
		}
		return {
			id: entry.definition.id,
			subject: entry.definition.subject,
			curriculumComponentId: componentId,
			specificationId: entry.grounding.specificationId,
			specificationSha256: entry.grounding.specificationSha256,
			specRef: component.code,
			topicLabel: component.title,
			sourceTextSha256: component.sourceTextSha256,
			pageStart: component.pageStart,
			pageEnd: component.pageEnd
		};
	});
	const runtime = {
		schemaVersion: 'generated-science-challenge-runtime/v1',
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		definitions,
		identities: definitions.map(({ id, slug, subject }) => ({ id, slug, subject })),
		curriculum,
		visuals
	};
	if (
		runtime.definitions.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.accepted ||
		runtime.identities.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.accepted ||
		runtime.curriculum.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.accepted ||
		runtime.visuals.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.visuals ||
		runtime.visuals.some(
			(visual) => canonicalHash(visual.cardArt) !== canonicalHash(visual.transferArt)
		)
	) {
		throw new Error(
			'Accepted runtime must contain 179 definitions/curriculum rows, 239 visuals, and one reused pair per visual.'
		);
	}
	return runtime;
}

export function buildScienceChallengeAcceptedArtGenerationLineage({
	repositoryRoot,
	generationRoot,
	artManifest,
	artDeliveryManifest
}) {
	const relativeRoot = normalizeRelative(generationRoot, 'art generation root');
	const workRoot = requireRealDirectory(
		resolveWithin(repositoryRoot, relativeRoot),
		'art generation root'
	);
	const deliveryById = new Map(artDeliveryManifest.objects.map((object) => [object.id, object]));
	const items = [];
	for (const spec of artManifest.specs) {
		const specDirectory = requireRealDirectory(
			path.join(workRoot, spec.id),
			`${spec.id} generation directory`
		);
		const currentOutputs = Object.fromEntries(
			['dark', 'light'].map((theme) => {
				const object = deliveryById.get(`${spec.id}-${theme}`);
				return [
					theme,
					{
						path: object.localPath,
						sha256: object.sha256,
						width: 960,
						height: 540
					}
				];
			})
		);
		const matchingJobs = [];
		for (const entry of readdirSync(specDirectory, { withFileTypes: true }).sort((left, right) =>
			compareCodePoints(left.name, right.name)
		)) {
			if (
				!entry.isFile() ||
				!(entry.name === 'job.json' || /^repair-[a-f0-9]{12}-job\.json$/u.test(entry.name))
			) {
				continue;
			}
			const jobPath = path.join(specDirectory, entry.name);
			const jobRecord = readJsonRecord(jobPath);
			const job = jobRecord.value;
			if (
				job?.schemaVersion !== 'science-question-art-job/v1' ||
				job.id !== spec.id ||
				job.status !== 'passed' ||
				canonicalHash(job.outputs) !== canonicalHash(currentOutputs)
			) {
				continue;
			}
			const repairSha256 = job.repairReviewSha256 ?? job.repairPerceptualAuditSha256 ?? null;
			let repairEvidence = null;
			let repairEvidenceDependency = null;
			if (entry.name.startsWith('repair-')) {
				if (!SHA256.test(String(repairSha256 ?? ''))) continue;
				const repairEvidencePath = path.join(workRoot, `repair-evidence-${repairSha256}.json`);
				if (!pathEntryExists(repairEvidencePath)) continue;
				const repairEvidenceRecord = readJsonRecord(repairEvidencePath);
				repairEvidence = repairEvidenceRecord.value;
				if (canonicalHash(repairEvidence) !== repairSha256) continue;
				repairEvidenceDependency = {
					dependencyId: `art-repair-evidence-${repairSha256}`,
					role: 'art-repair-evidence',
					basename: path.basename(repairEvidencePath),
					canonicalSha256: repairEvidenceRecord.canonicalSha256,
					fileSha256: repairEvidenceRecord.fileSha256,
					size: repairEvidenceRecord.size
				};
			}
			const artifacts = requireArtGenerationJobEvidence({
				job,
				jobPath,
				spec,
				manifest: artManifest,
				currentOutputs,
				rootDir: repositoryRoot,
				repairEvidence
			});
			matchingJobs.push({
				dependencyId: `art-generation-job-${spec.id}-${sha256(entry.name).slice(0, 12)}`,
				role: 'art-generation-job',
				basename: entry.name,
				canonicalSha256: jobRecord.canonicalSha256,
				fileSha256: jobRecord.fileSha256,
				size: jobRecord.size,
				imageModel: job.imageModel,
				attempt: job.attempt,
				repairReviewSha256: job.repairReviewSha256 ?? null,
				repairPerceptualAuditSha256: job.repairPerceptualAuditSha256 ?? null,
				repairEvidenceDependency,
				finishedAt: job.finishedAt,
				generationArtifacts: Object.fromEntries(
					Object.entries(artifacts).map(([role, artifact]) => [
						role,
						{
							dependencyId: `art-generation-${spec.id}-${role}`,
							role,
							basename: path.basename(artifact.path),
							sha256: artifact.sha256,
							size: artifact.size
						}
					])
				)
			});
		}
		if (matchingJobs.length === 0) {
			throw new Error(`No passed art job binds the reviewed bytes for ${spec.id}.`);
		}
		items.push({
			id: spec.id,
			challengeId: spec.challengeId,
			specSha256: canonicalHash(spec),
			outputs: currentOutputs,
			matchingJobs
		});
	}
	if (
		items.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artPairs ||
		new Set(items.map((item) => item.id)).size !== items.length
	) {
		throw new Error('Accepted art lineage must bind exactly 239 unique pairs.');
	}
	const lineage = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ART_LINEAGE_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		status: 'passed',
		manifestSha256: canonicalHash(artManifest),
		assetInventorySha256: artDeliveryManifest.assetInventorySha256,
		pairCount: items.length,
		fileCount: artDeliveryManifest.objectCount,
		items
	};
	assertNoPathOrUserLeaks(lineage);
	return lineage;
}

export function buildScienceChallengeAcceptedReleaseMarker({
	acceptedSubset,
	runtime,
	shortRecallPrompts,
	shortRecallAuthoringEvidence,
	shortRecallReviewEvidence,
	artManifest,
	artReview,
	artPerceptualAudit,
	artGenerationLineage,
	artDeliveryManifest,
	catalogArtAudit,
	curriculumEvidence,
	rawCurriculumEvidenceSha256,
	coverage,
	provenanceManifest,
	siblingInventory
}) {
	const siblingHashes = Object.fromEntries(
		siblingInventory.map((entry) => [entry.path, entry.sha256])
	);
	return {
		schemaVersion: SCIENCE_CHALLENGE_RELEASE_SCHEMA,
		release: {
			id: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
			status: 'accepted',
			receipt: {
				reviewedCount: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.reviewed,
				acceptedCount: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.accepted,
				rejectedCount: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.heldOut,
				fullCandidateSetSha256: acceptedSubset.selection.fullCandidateSetSha256,
				acceptedCandidateSetSha256: acceptedSubset.selection.acceptedCandidateSetSha256,
				acceptedIdSetSha256: acceptedSubset.selection.acceptedIdSetSha256,
				reviewSetSha256: acceptedSubset.selection.reviewSetSha256,
				acceptedReviewSetSha256: acceptedSubset.selection.acceptedReviewSetSha256
			},
			authority: {
				definitions: 'git',
				releaseMarker: 'git',
				d1: 'mirror',
				r2: 'mirror',
				gitDefinitionsAuthoritative: true
			},
			runtimeSha256: canonicalHash(runtime),
			shortRecallBundleSha256: canonicalHash(shortRecallPrompts),
			shortRecallCandidateSetSha256: canonicalHash(acceptedSubset.challenges),
			shortRecallAuthoringEvidenceSha256: canonicalHash(shortRecallAuthoringEvidence),
			shortRecallReviewSha256: canonicalHash(shortRecallReviewEvidence),
			shortRecallAuthoringRunSha256: shortRecallAuthoringEvidence.runSha256,
			shortRecallReviewerRunSha256: shortRecallReviewEvidence.runSha256,
			artManifestSha256: canonicalHash(artManifest),
			artReviewSha256: canonicalHash(artReview),
			artPerceptualAuditSha256: canonicalHash(artPerceptualAudit),
			artGenerationLineageSha256: canonicalHash(artGenerationLineage),
			artDeliveryManifestSha256: canonicalHash(artDeliveryManifest),
			catalogArtAuditSha256: canonicalHash(catalogArtAudit),
			curriculumEvidenceSha256: canonicalHash(curriculumEvidence),
			rawCurriculumEvidenceSha256,
			coverageSha256: canonicalHash(coverage),
			provenanceManifestSha256: canonicalHash(provenanceManifest),
			siblingCount: siblingInventory.length,
			siblingSetSha256: canonicalHash(siblingInventory),
			siblingHashes,
			siblings: siblingInventory
		},
		coverage,
		lineage: {
			schemaVersion: 'science-challenge-accepted-release-lineage/v1',
			acceptedSubsetSha256: canonicalHash(acceptedSubset),
			provenanceManifestSha256: canonicalHash(provenanceManifest),
			artGenerationLineageSha256: canonicalHash(artGenerationLineage)
		},
		challenges: structuredClone(acceptedSubset.challenges)
	};
}

export function assertFreshScienceChallengeAcceptedReleaseOutput(repositoryRoot = process.cwd()) {
	const root = requireRealDirectory(repositoryRoot, 'repository root');
	const output = resolveWithin(root, SCIENCE_CHALLENGE_ACCEPTED_RELEASE_OUTPUT);
	assertAbsentPathEntry(output, 'Accepted release output');
	return output;
}

export function assertNoPathOrUserLeaks(value) {
	const leaks = [];
	visitForLeaks(value, '$', leaks);
	if (leaks.length) {
		throw new Error(`Accepted release contains a path or user leak: ${leaks[0]}`);
	}
}

function requireInputValues(options) {
	const required = [
		'acceptedSubset',
		'subsetManifest',
		'evidenceProjection',
		'collectionValidation',
		'holdoutLedger',
		'hashReceipt',
		'curriculumEvidence',
		'shortRecallPrompts',
		'shortRecallAuthoringEvidence',
		'shortRecallReviewEvidence',
		'artManifest',
		'artReview',
		'artPerceptualAudit',
		'catalogArtAudit',
		'existingDefinitions',
		'evidenceProjectionExternalDependency'
	];
	for (const field of required) {
		if (options[field] === undefined || options[field] === null) {
			throw new Error(`Accepted release input ${field} is required.`);
		}
	}
	if (typeof options.artGenerationRoot !== 'string') {
		throw new Error('Accepted release input artGenerationRoot is required.');
	}
	const values = Object.fromEntries(
		required.map((field) => [field, structuredClone(options[field])])
	);
	if (options.curriculumEvidenceExternalDependency !== undefined) {
		values.curriculumEvidenceExternalDependency = structuredClone(
			options.curriculumEvidenceExternalDependency
		);
	}
	return values;
}

function validateAcceptedSubsetPackage(values) {
	validateScienceChallengeAcceptedSubsetArtifacts({
		acceptedSubset: values.acceptedSubset,
		evidenceProjection: values.evidenceProjection,
		collectionValidation: values.collectionValidation,
		holdoutLedger: values.holdoutLedger,
		hashReceipt: values.hashReceipt
	});
	if (
		values.subsetManifest?.schemaVersion !== SCIENCE_CHALLENGE_ACCEPTED_SUBSET_MANIFEST_SCHEMA ||
		values.subsetManifest.releaseId !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID ||
		values.subsetManifest.status !== 'passed'
	) {
		throw new Error('Accepted-subset manifest header is invalid.');
	}
	const { manifestCoreSha256, ...manifestCore } = values.subsetManifest;
	if (manifestCoreSha256 !== canonicalHash(manifestCore)) {
		throw new Error('Accepted-subset manifest core hash is invalid.');
	}
	if (
		values.hashReceipt.schemaVersion !== SCIENCE_CHALLENGE_ACCEPTED_SUBSET_HASH_RECEIPT_SCHEMA ||
		values.hashReceipt.releaseId !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID
	) {
		throw new Error('Accepted-subset hash receipt is invalid.');
	}
	const receiptByRole = new Map(
		values.subsetManifest.companionFiles.map((entry) => [entry.role, entry])
	);
	for (const [role, value] of Object.entries({
		acceptedSubset: values.acceptedSubset,
		evidenceProjection: values.evidenceProjection,
		collectionValidation: values.collectionValidation,
		holdoutLedger: values.holdoutLedger,
		hashReceipt: values.hashReceipt
	})) {
		const receipt = receiptByRole.get(role);
		const expectedFile = ACCEPTED_SUBSET_SOURCE_FILES[role];
		const bytes = stableJsonBytes(value);
		if (
			!receipt ||
			receipt.path !== expectedFile ||
			receipt.canonicalSha256 !== canonicalHash(value) ||
			receipt.fileSha256 !== sha256(bytes)
		) {
			throw new Error(`Accepted-subset manifest receipt is stale for ${role}.`);
		}
	}
	if (
		values.evidenceProjection.drafts.length !==
			SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.reviewed ||
		values.evidenceProjection.semanticReviews.length !==
			SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.reviewed ||
		values.holdoutLedger.holdouts.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.heldOut ||
		values.holdoutLedger.holdouts.reduce(
			(total, holdout) => total + (Array.isArray(holdout.issues) ? holdout.issues.length : 0),
			0
		) !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.holdoutIssues
	) {
		throw new Error(
			'Sanitized provenance must preserve all 408 drafts/reviews, 229 holdouts, and 340 holdout issues.'
		);
	}
	const leaks = findScienceChallengeAcceptedSubsetLeaks({
		acceptedSubset: values.acceptedSubset,
		subsetManifest: values.subsetManifest,
		evidenceProjection: values.evidenceProjection,
		collectionValidation: values.collectionValidation,
		holdoutLedger: values.holdoutLedger,
		hashReceipt: values.hashReceipt
	});
	if (leaks.length) {
		throw new Error(`Accepted-subset provenance is not sanitized: ${leaks[0]}`);
	}
}

function validateExistingDefinitions(existingDefinitions, evidenceProjection) {
	if (
		!Array.isArray(existingDefinitions) ||
		existingDefinitions.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.existingDefinitions ||
		canonicalHash(existingDefinitions) !==
			SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS.existingDefinitionSetSha256 ||
		canonicalHash(existingDefinitions) !== canonicalHash(evidenceProjection.existingDefinitions)
	) {
		throw new Error('Accepted release does not bind the exact 92 Git definitions.');
	}
}

function validateAcceptedChallenges(acceptedSubset, existingDefinitions) {
	if (
		acceptedSubset.challenges.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.accepted ||
		canonicalHash(acceptedSubset.challenges) !==
			SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS.acceptedCandidateSetSha256
	) {
		throw new Error('Accepted release must contain the exact 179 B0 candidates.');
	}
	const validation = validateGeneratedChallengeCollection(acceptedSubset.challenges, {
		existingDefinitions
	});
	if (validation.status !== 'passed') {
		throw new Error(`Accepted challenge collection failed:\n${validation.issues.join('\n')}`);
	}
}

function validateCurriculumEvidence({
	acceptedSubset,
	evidenceProjection,
	curriculumEvidence,
	coverage
}) {
	if (
		curriculumEvidence?.schemaVersion !== 'science-curriculum-evidence/v1' ||
		!Array.isArray(curriculumEvidence.components) ||
		canonicalHash(curriculumEvidence) !== acceptedSubset.evidence.curriculumEvidenceSha256 ||
		canonicalHash(curriculumEvidence) !==
			SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS.curriculumEvidenceSha256
	) {
		throw new Error('Accepted release curriculum evidence differs from B0.');
	}
	const curriculumById = new Map();
	for (const component of curriculumEvidence.components) {
		if (
			!CURRICULUM_COMPONENT_ID.test(String(component.componentId ?? '')) ||
			curriculumById.has(component.componentId)
		) {
			throw new Error('Curriculum evidence contains an invalid or duplicate component.');
		}
		curriculumById.set(component.componentId, component);
	}
	for (const entry of acceptedSubset.challenges) {
		const component = curriculumById.get(entry.grounding.curriculumComponentId);
		if (
			!component ||
			component.specificationId !== entry.grounding.specificationId ||
			component.specificationSha256 !== entry.grounding.specificationSha256
		) {
			throw new Error(`Accepted curriculum grounding differs for ${entry.definition.id}.`);
		}
	}
	if (
		coverage.coveredCurriculumComponentCount !==
			SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.coveredCurriculumComponents ||
		evidenceProjection.sourcePlan.plan.rows.length !==
			SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.reviewed
	) {
		throw new Error('Accepted curriculum coverage receipt is invalid.');
	}
	return curriculumById;
}

function validateShortRecall(values) {
	if (
		values.shortRecallAuthoringEvidence.schemaVersion !==
			SCIENCE_CHALLENGE_SHORT_RECALL_AUTHORING_EVIDENCE_SCHEMA ||
		values.shortRecallReviewEvidence.schemaVersion !==
			SCIENCE_CHALLENGE_SHORT_RECALL_REVIEW_EVIDENCE_SCHEMA
	) {
		throw new Error('Accepted short-recall evidence schema is invalid.');
	}
	const validation = validateAcceptedScienceChallengeShortRecallArtifacts({
		candidateEntries: values.acceptedSubset,
		prompts: values.shortRecallPrompts,
		authoringEvidence: values.shortRecallAuthoringEvidence,
		reviewEvidence: values.shortRecallReviewEvidence,
		expectedCount: SCIENCE_CHALLENGE_SHORT_RECALL_EXPECTED_COUNT
	});
	if (validation.status !== 'passed') {
		throw new Error(`Accepted short-recall evidence failed:\n${validation.issues.join('\n')}`);
	}
	const acceptedIds = values.acceptedSubset.challenges.map((entry) => entry.definition.id);
	const promptIds = values.shortRecallPrompts.map((prompt) => prompt.challengeId);
	if (canonicalHash(acceptedIds) !== canonicalHash(promptIds)) {
		throw new Error('Accepted short-recall prompts differ from accepted challenge order.');
	}
}

function validateArtOwnerPartition({ acceptedSubset, existingDefinitions, artManifest }) {
	const acceptedIds = new Set(acceptedSubset.challenges.map((entry) => entry.definition.id));
	const existingIds = new Set(existingDefinitions.map((definition) => definition.id));
	const acceptedOwners = artManifest.cohort.owners.filter(
		(owner) => owner.ownerKind === 'accepted-new'
	);
	const replacementOwners = artManifest.cohort.owners.filter(
		(owner) => owner.ownerKind === 'existing-expansion-replacement'
	);
	if (
		acceptedOwners.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.acceptedVisuals ||
		replacementOwners.length !==
			SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.existingReplacementVisuals ||
		acceptedOwners.some((owner) => !acceptedIds.has(owner.challengeId)) ||
		replacementOwners.some(
			(owner) => !existingIds.has(owner.challengeId) || acceptedIds.has(owner.challengeId)
		)
	) {
		throw new Error(
			'Art owner partition must be the exact 179 accepted plus 60 existing replacements.'
		);
	}
}

function validateAcceptedArtReview({
	repositoryRoot,
	artManifest,
	artReview,
	artDeliveryManifest
}) {
	const validation = requireArtReviewEvidence({
		review: artReview,
		manifest: artManifest,
		rootDir: repositoryRoot,
		requiredStatus: 'passed',
		expectedCount: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artPairs
	});
	if (validation.status !== 'passed') {
		throw new Error(`Accepted art review failed:\n${validation.issues.join('\n')}`);
	}
	if (
		artReview.assetInventorySha256 !== artDeliveryManifest.assetInventorySha256 ||
		artReview.acceptedCount !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artPairs ||
		artReview.rejectedCount !== 0
	) {
		throw new Error('Accepted art review does not bind all 239 reviewed pairs.');
	}
}

function validateAcceptedPerceptualAudit({
	repositoryRoot,
	artManifest,
	artPerceptualAudit,
	artDeliveryManifest,
	recompute
}) {
	const assetInventory = artManifest.specs.map((spec) => {
		const dark = artDeliveryManifest.objects.find((object) => object.id === `${spec.id}-dark`);
		const light = artDeliveryManifest.objects.find((object) => object.id === `${spec.id}-light`);
		return {
			id: spec.id,
			darkSha256: dark.sha256,
			lightSha256: light.sha256
		};
	});
	const validation = validatePerceptualAudit(artPerceptualAudit, {
		manifest: artManifest,
		assetInventory,
		expectedRecordCount: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artFiles
	});
	if (validation.status !== 'passed') {
		throw new Error(`Accepted perceptual audit failed:\n${validation.issues.join('\n')}`);
	}
	if (artPerceptualAudit.assetInventorySha256 !== artDeliveryManifest.assetInventorySha256) {
		throw new Error('Accepted perceptual audit binds different image bytes.');
	}
	if (recompute) {
		const replay = buildPerceptualAudit(artManifest, { rootDir: repositoryRoot });
		if (canonicalHash(replay) !== canonicalHash(artPerceptualAudit)) {
			throw new Error('Accepted perceptual audit differs from a fresh 478-WebP replay.');
		}
	}
}

function validateCatalogueArtAudit({
	catalogArtAudit,
	acceptedSubset,
	artManifest,
	existingDefinitions
}) {
	const validation = validateScienceChallengeCatalogArtAudit(catalogArtAudit, {
		expectations: SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS,
		requirePassed: true
	});
	if (
		catalogArtAudit?.schemaVersion !== SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_SCHEMA ||
		catalogArtAudit.releaseId !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID ||
		catalogArtAudit.status !== 'passed' ||
		validation.status !== 'passed'
	) {
		throw new Error(`Final catalogue-art audit failed:\n${validation.issues.join('\n')}`);
	}
	const acceptedEntries = acceptedSubset.challenges;
	const acceptedDefinitions = acceptedEntries.map((entry) => entry.definition);
	const acceptedIds = acceptedDefinitions.map((definition) => definition.id);
	const existingIds = existingDefinitions.map((definition) => definition.id);
	const finalIds = [...acceptedIds, ...existingIds].sort(compareCodePoints);
	const auditOwnerIds = catalogArtAudit.owners
		.map((owner) => owner.challengeId)
		.sort(compareCodePoints);
	const manifestOwnerIds = artManifest.cohort.owners
		.map((owner) => owner.challengeId)
		.sort(compareCodePoints);
	const auditManifestOwnerIds = catalogArtAudit.owners
		.filter((owner) => owner.sourceKind === 'art-manifest')
		.map((owner) => owner.challengeId)
		.sort(compareCodePoints);
	if (
		canonicalHash(auditOwnerIds) !== canonicalHash(finalIds) ||
		canonicalHash(auditManifestOwnerIds) !== canonicalHash(manifestOwnerIds) ||
		catalogArtAudit.inputs?.acceptedSubset?.canonicalSha256 !== canonicalHash(acceptedSubset) ||
		catalogArtAudit.inputs?.acceptedSubset?.challengeEntriesSha256 !==
			canonicalHash(acceptedEntries) ||
		catalogArtAudit.inputs?.acceptedSubset?.definitionsSha256 !==
			canonicalHash(acceptedDefinitions) ||
		catalogArtAudit.inputs?.artManifest?.canonicalSha256 !== canonicalHash(artManifest) ||
		catalogArtAudit.inputs?.artManifest?.ownerRecordsSha256 !== artManifest.cohort.ownersSha256 ||
		catalogArtAudit.inputs?.artManifest?.fileRecordsSha256 !== artManifest.cohort.filesSha256 ||
		catalogArtAudit.inputs?.authoredCatalog?.definitionsSha256 !==
			canonicalHash(existingDefinitions) ||
		catalogArtAudit.hashes?.acceptedChallengeIdsSha256 !== canonicalHash(acceptedIds) ||
		catalogArtAudit.hashes?.acceptedChallengeSortedIdsSha256 !==
			canonicalHash([...acceptedIds].sort(compareCodePoints)) ||
		catalogArtAudit.hashes?.authoredChallengeIdsSha256 !== canonicalHash(existingIds)
	) {
		throw new Error(
			'Final catalogue-art audit differs from the exact 179 accepted, 92 authored, or 239-manifest owner inputs.'
		);
	}
	assertNoPathOrUserLeaks(catalogArtAudit);
}

function validateAcceptedReleaseExternalDependencies(values) {
	const evidenceProjection = validateExternalDependencyInput({
		input: values.evidenceProjectionExternalDependency,
		identity: RAW_EVIDENCE_PROJECTION_DEPENDENCY,
		value: values.evidenceProjection
	});
	const dependencies = [evidenceProjection];
	if (values.curriculumEvidenceExternalDependency !== undefined) {
		dependencies.push(
			validateExternalDependencyInput({
				input: values.curriculumEvidenceExternalDependency,
				identity: RAW_CURRICULUM_EVIDENCE_DEPENDENCY,
				value: values.curriculumEvidence
			})
		);
	}
	return dependencies.sort((left, right) =>
		compareCodePoints(left.dependencyId, right.dependencyId)
	);
}

function validateExternalDependencyInput({ input, identity, value }) {
	if (!isRecord(input)) {
		throw new Error(
			`Accepted release external dependency input is missing: ${identity.dependencyId}.`
		);
	}
	for (const field of ['dependencyId', 'role', 'basename']) {
		if (input[field] !== identity[field]) {
			throw new Error(
				`Accepted release external dependency ${field} differs for ${identity.dependencyId}.`
			);
		}
	}
	const receipt = buildScienceChallengeAcceptedReleaseExternalDependency({
		...identity,
		value,
		bytes: input.bytes
	});
	for (const field of ['canonicalSha256', 'fileSha256', 'size']) {
		if (input[field] !== undefined && input[field] !== receipt[field]) {
			throw new Error(
				`Accepted release external dependency ${field} is stale for ${identity.dependencyId}.`
			);
		}
	}
	return receipt;
}

function buildSanitizedCurriculumIndex(curriculumEvidence) {
	const components = curriculumEvidence.components.map((component) => ({
		componentId: component.componentId,
		specificationId: component.specificationId,
		specificationSha256: component.specificationSha256,
		code: component.code,
		title: component.title,
		pageStart: component.pageStart,
		pageEnd: component.pageEnd,
		sourceTextSha256: component.sourceTextSha256
	}));
	const index = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_CURRICULUM_INDEX_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		status: 'sanitized',
		sourceCanonicalSha256: canonicalHash(curriculumEvidence),
		componentCount: components.length,
		componentSetSha256: canonicalHash(components),
		components
	};
	assertNoSourceRichProvenanceFields(index);
	return index;
}

function buildSanitizedEvidenceProjection({
	evidenceProjection,
	curriculumIndex,
	externalDependency
}) {
	const sanitizedPlan = structuredClone(evidenceProjection.sourcePlan.plan);
	delete sanitizedPlan.curriculumCatalogPath;
	delete sanitizedPlan.sourceSnapshotPath;
	const projection = {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_EVIDENCE_PROJECTION_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		status: 'sanitized',
		rawEvidenceProjection: externalDependency,
		sourceBindings: structuredClone(evidenceProjection.sourceBindings),
		sourcePlan: {
			planId: evidenceProjection.sourcePlan.planId,
			rawPlanSha256: evidenceProjection.sourcePlan.planSha256,
			projectionSha256: canonicalHash(sanitizedPlan),
			plan: sanitizedPlan
		},
		assignments: structuredClone(evidenceProjection.assignments),
		selection: structuredClone(evidenceProjection.selection),
		draftCount: evidenceProjection.drafts.length,
		draftSetSha256: canonicalHash(evidenceProjection.drafts),
		drafts: structuredClone(evidenceProjection.drafts),
		semanticReviewCount: evidenceProjection.semanticReviews.length,
		semanticReviewSetSha256: canonicalHash(evidenceProjection.semanticReviews),
		semanticReviews: structuredClone(evidenceProjection.semanticReviews),
		existingDefinitionCount: evidenceProjection.existingDefinitions.length,
		existingDefinitionSetSha256: canonicalHash(evidenceProjection.existingDefinitions),
		existingDefinitions: structuredClone(evidenceProjection.existingDefinitions),
		curriculumEvidence: curriculumIndex
	};
	if (
		projection.draftCount !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.reviewed ||
		projection.semanticReviewCount !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.reviewed ||
		projection.draftSetSha256 !== canonicalHash(evidenceProjection.drafts) ||
		projection.semanticReviewSetSha256 !== canonicalHash(evidenceProjection.semanticReviews)
	) {
		throw new Error('Sanitized evidence projection changed drafts or semantic reviews.');
	}
	assertNoSourceRichProvenanceFields(projection);
	return projection;
}

function assertNoSourceRichProvenanceFields(value) {
	const forbidden = [];
	visit(value, '$', (key, _item, location) => {
		if (
			[
				'sourceText',
				'sourceExcerpt',
				'specificationExcerpt',
				'paperQuestionText',
				'markSchemeText',
				'assignmentEvidence',
				'sourceSnapshotPath',
				'curriculumCatalogPath',
				'verifierTaskName'
			].includes(key) ||
			/(?:^|File|Directory|Workspace)Path$/u.test(key)
		) {
			forbidden.push(location);
		}
	});
	if (forbidden.length) {
		throw new Error(
			`Sanitized accepted-release provenance contains source-rich data: ${forbidden[0]}.`
		);
	}
}

function buildTrackedAcceptedSubsetProvenanceReceipts({ provenanceCopies, externalDependencies }) {
	const artifacts = Object.entries(provenanceCopies)
		.map(([role, value]) => {
			const bytes = stableJsonBytes(value);
			return {
				role,
				path: ACCEPTED_SUBSET_PROVENANCE_FILES[role],
				canonicalSha256: canonicalHash(value),
				fileSha256: sha256(bytes),
				size: bytes.byteLength
			};
		})
		.sort((left, right) => compareCodePoints(left.path, right.path));
	const manifestCore = {
		schemaVersion: 'science-challenge-accepted-release-subset-provenance-manifest/v1',
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		status: 'passed',
		sanitized: true,
		artifactCount: artifacts.length,
		artifactSetSha256: canonicalHash(artifacts),
		artifacts,
		externalDependencyCount: externalDependencies.length,
		externalDependencySetSha256: canonicalHash(externalDependencies),
		externalDependencies
	};
	const trackedManifest = {
		...manifestCore,
		manifestCoreSha256: canonicalHash(manifestCore)
	};
	const manifestBytes = stableJsonBytes(trackedManifest);
	const trackedHashReceiptCore = {
		schemaVersion: 'science-challenge-accepted-release-subset-provenance-hash-receipt/v1',
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		status: 'passed',
		manifest: {
			path: ACCEPTED_SUBSET_PROVENANCE_FILES.trackedManifest,
			canonicalSha256: canonicalHash(trackedManifest),
			fileSha256: sha256(manifestBytes),
			size: manifestBytes.byteLength
		},
		artifactCount: artifacts.length,
		artifactSetSha256: canonicalHash(artifacts),
		externalDependencySetSha256: canonicalHash(externalDependencies)
	};
	return {
		trackedManifest,
		trackedHashReceipt: {
			...trackedHashReceiptCore,
			receiptCoreSha256: canonicalHash(trackedHashReceiptCore)
		}
	};
}

function buildAcceptedReleaseProvenanceManifest({
	acceptedSubset,
	evidenceProjection,
	holdoutLedger,
	provenanceCopies,
	externalDependencies
}) {
	const sources = Object.entries(provenanceCopies)
		.map(([role, value]) => {
			const filename = ACCEPTED_SUBSET_PROVENANCE_FILES[role];
			const relativePath = `${PROVENANCE_ROOT}/${filename}`;
			const bytes = stableJsonBytes(value);
			return {
				role,
				path: relativePath,
				sha256: canonicalHash(value),
				fileSha256: sha256(bytes),
				size: bytes.byteLength
			};
		})
		.sort((left, right) => compareCodePoints(left.path, right.path));
	return {
		schemaVersion: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_PROVENANCE_SCHEMA,
		releaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
		status: 'passed',
		sanitized: true,
		draftCount: evidenceProjection.drafts.length,
		reviewCount: evidenceProjection.semanticReviews.length,
		acceptedCount: acceptedSubset.challenges.length,
		holdoutCount: holdoutLedger.holdouts.length,
		holdoutIssueCount: holdoutLedger.holdouts.reduce(
			(total, holdout) => total + holdout.issues.length,
			0
		),
		fullCandidateSetSha256: acceptedSubset.selection.fullCandidateSetSha256,
		reviewSetSha256: acceptedSubset.selection.reviewSetSha256,
		holdoutSetSha256: holdoutLedger.holdoutSetSha256,
		sourceCount: sources.length,
		sourceSetSha256: canonicalHash(sources),
		sources,
		externalDependencyCount: externalDependencies.length,
		externalDependencySetSha256: canonicalHash(externalDependencies),
		externalDependencies
	};
}

function buildSiblingInventory(siblings) {
	return [...siblings.entries()]
		.map(([relativePath, value]) => {
			const bytes = stableJsonBytes(value);
			return {
				path: relativePath,
				sha256: canonicalHash(value),
				fileSha256: sha256(bytes),
				size: bytes.byteLength
			};
		})
		.sort((left, right) => compareCodePoints(left.path, right.path));
}

function addSibling(siblings, relativePath, value) {
	const normalized = normalizeRelative(relativePath, 'release sibling');
	if (normalized === ACCEPTED_MARKER || siblings.has(normalized)) {
		throw new Error(`Accepted release sibling is duplicated: ${normalized}.`);
	}
	siblings.set(normalized, structuredClone(value));
}

function expectedReleaseSiblingPaths() {
	return [
		...Object.values(RELEASE_SIBLINGS),
		...Object.values(ACCEPTED_SUBSET_PROVENANCE_FILES).map(
			(filename) => `${PROVENANCE_ROOT}/${filename}`
		),
		PROVENANCE_MANIFEST
	].sort(compareCodePoints);
}

function validateAcceptedMarkerHeader(marker, expectedReleaseId) {
	if (
		marker?.schemaVersion !== SCIENCE_CHALLENGE_RELEASE_SCHEMA ||
		marker?.release?.id !== expectedReleaseId ||
		marker.release.status !== 'accepted' ||
		marker.release.authority?.definitions !== 'git' ||
		marker.release.authority?.d1 !== 'mirror' ||
		marker.release.authority?.r2 !== 'mirror' ||
		marker.release.authority?.gitDefinitionsAuthoritative !== true ||
		!Array.isArray(marker.challenges) ||
		marker.challenges.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.accepted
	) {
		throw new Error('Accepted release marker header or authority is invalid.');
	}
}

function validateReleaseHashBindings(marker, values) {
	const bindings = [
		['runtimeSha256', RELEASE_SIBLINGS.runtime],
		['shortRecallBundleSha256', RELEASE_SIBLINGS.shortRecallPrompts],
		['shortRecallAuthoringEvidenceSha256', RELEASE_SIBLINGS.shortRecallAuthoringEvidence],
		['shortRecallReviewSha256', RELEASE_SIBLINGS.shortRecallReviewEvidence],
		['artManifestSha256', RELEASE_SIBLINGS.artManifest],
		['artReviewSha256', RELEASE_SIBLINGS.artReview],
		['artPerceptualAuditSha256', RELEASE_SIBLINGS.artPerceptualAudit],
		['artGenerationLineageSha256', RELEASE_SIBLINGS.artGenerationLineage],
		['artDeliveryManifestSha256', RELEASE_SIBLINGS.artDeliveryManifest],
		['catalogArtAuditSha256', RELEASE_SIBLINGS.catalogArtAudit],
		[
			'curriculumEvidenceSha256',
			`${PROVENANCE_ROOT}/${ACCEPTED_SUBSET_PROVENANCE_FILES.curriculumEvidence}`
		],
		['coverageSha256', RELEASE_SIBLINGS.coverage],
		['provenanceManifestSha256', PROVENANCE_MANIFEST]
	];
	for (const [field, relativePath] of bindings) {
		const value = values.get(relativePath);
		if (!value || marker.release[field] !== canonicalHash(value)) {
			throw new Error(`Accepted release ${field} binding is stale.`);
		}
	}
	if (marker.release.shortRecallCandidateSetSha256 !== canonicalHash(marker.challenges)) {
		throw new Error('Accepted release candidate-set binding is stale.');
	}
	if (canonicalHash(marker.coverage) !== canonicalHash(values.get(RELEASE_SIBLINGS.coverage))) {
		throw new Error('Accepted release top-level coverage differs from coverage.json.');
	}
	const hashes = Object.fromEntries(
		marker.release.siblings.map((entry) => [entry.path, entry.sha256])
	);
	if (canonicalHash(hashes) !== canonicalHash(marker.release.siblingHashes)) {
		throw new Error('Accepted release siblingHashes differs from its inventory.');
	}
}

function validateReleaseDynamicCounts(marker, values) {
	const counts = SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS;
	const runtime = values.get(RELEASE_SIBLINGS.runtime);
	const prompts = values.get(RELEASE_SIBLINGS.shortRecallPrompts);
	const artManifest = values.get(RELEASE_SIBLINGS.artManifest);
	const artDelivery = values.get(RELEASE_SIBLINGS.artDeliveryManifest);
	const perceptual = values.get(RELEASE_SIBLINGS.artPerceptualAudit);
	const lineage = values.get(RELEASE_SIBLINGS.artGenerationLineage);
	const coverage = values.get(RELEASE_SIBLINGS.coverage);
	const evidence = values.get(
		`${PROVENANCE_ROOT}/${ACCEPTED_SUBSET_PROVENANCE_FILES.evidenceProjection}`
	);
	const holdouts = values.get(
		`${PROVENANCE_ROOT}/${ACCEPTED_SUBSET_PROVENANCE_FILES.holdoutLedger}`
	);
	if (
		runtime.definitions.length !== counts.accepted ||
		runtime.identities.length !== counts.accepted ||
		runtime.curriculum.length !== counts.accepted ||
		runtime.visuals.length !== counts.visuals ||
		prompts.length !== counts.accepted ||
		artManifest.specs.length !== counts.artPairs ||
		artDelivery.objects.length !== counts.artFiles ||
		perceptual.records.length !== counts.artFiles ||
		lineage.items.length !== counts.artPairs ||
		evidence.drafts.length !== counts.reviewed ||
		evidence.semanticReviews.length !== counts.reviewed ||
		holdouts.holdouts.length !== counts.heldOut ||
		holdouts.holdouts.reduce((total, holdout) => total + holdout.issues.length, 0) !==
			counts.holdoutIssues ||
		coverage.ratio !==
			`${counts.coveredCurriculumComponents}/${counts.totalCurriculumComponents}` ||
		marker.release.receipt.reviewedCount !== counts.reviewed ||
		marker.release.receipt.acceptedCount !== counts.accepted ||
		marker.release.receipt.rejectedCount !== counts.heldOut
	) {
		throw new Error('Accepted release dynamic 179/239/478/408/229/162/304 counts are invalid.');
	}
	if (
		runtime.visuals.some(
			(visual) => canonicalHash(visual.cardArt) !== canonicalHash(visual.transferArt)
		)
	) {
		throw new Error('Accepted release runtime does not reuse one pair for both art roles.');
	}
}

function validateReleaseSemantics(marker, values) {
	const provenancePath = (role) => `${PROVENANCE_ROOT}/${ACCEPTED_SUBSET_PROVENANCE_FILES[role]}`;
	const acceptedSubset = values.get(provenancePath('acceptedSubset'));
	const evidenceProjection = values.get(provenancePath('evidenceProjection'));
	const holdoutLedger = values.get(provenancePath('holdoutLedger'));
	const sourceManifest = values.get(provenancePath('subsetManifest'));
	const sourceHashReceipt = values.get(provenancePath('hashReceipt'));
	const curriculumIndex = values.get(provenancePath('curriculumEvidence'));
	const trackedManifest = values.get(provenancePath('trackedManifest'));
	const trackedHashReceipt = values.get(provenancePath('trackedHashReceipt'));
	const collectionValidation = values.get(provenancePath('collectionValidation'));
	const provenanceManifest = values.get(PROVENANCE_MANIFEST);
	const runtime = values.get(RELEASE_SIBLINGS.runtime);
	const artManifest = values.get(RELEASE_SIBLINGS.artManifest);
	const artReview = values.get(RELEASE_SIBLINGS.artReview);
	const artPerceptualAudit = values.get(RELEASE_SIBLINGS.artPerceptualAudit);
	const artDeliveryManifest = values.get(RELEASE_SIBLINGS.artDeliveryManifest);
	const artGenerationLineage = values.get(RELEASE_SIBLINGS.artGenerationLineage);
	const catalogArtAudit = values.get(RELEASE_SIBLINGS.catalogArtAudit);
	const existingDefinitions = evidenceProjection.existingDefinitions;

	validateAcceptedMarkerSourceBindings({ marker, acceptedSubset, evidenceProjection });
	validateExistingDefinitions(existingDefinitions, {
		existingDefinitions
	});
	validateAcceptedChallenges(acceptedSubset, existingDefinitions);
	validateArtOwnerPartition({
		acceptedSubset,
		existingDefinitions,
		artManifest
	});
	const artManifestValidation = validateScienceChallengeArtCohortManifest(artManifest);
	if (artManifestValidation.status !== 'passed') {
		throw new Error(
			`Tracked art manifest failed replay:\n${artManifestValidation.issues.join('\n')}`
		);
	}
	const deliveryValidation = validateQuestionArtDeliveryManifest(artDeliveryManifest, {
		artManifest,
		expectedCount: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artFiles
	});
	if (deliveryValidation.status !== 'passed') {
		throw new Error(`Tracked art delivery failed replay:\n${deliveryValidation.issues.join('\n')}`);
	}
	validateTrackedArtReview({
		artReview,
		artManifest,
		artDeliveryManifest
	});
	validateTrackedPerceptualAudit({
		artPerceptualAudit,
		artManifest,
		artDeliveryManifest
	});
	validateTrackedArtGenerationLineage({
		artGenerationLineage,
		artManifest,
		artDeliveryManifest
	});
	validateCatalogueArtAudit({
		catalogArtAudit,
		acceptedSubset,
		artManifest,
		existingDefinitions
	});

	const curriculumById = validateTrackedCurriculumIndex({
		curriculumIndex,
		acceptedSubset,
		marker
	});
	const rebuiltRuntime = buildScienceChallengeAcceptedRuntime({
		acceptedSubset,
		existingDefinitions,
		curriculumById,
		artManifest,
		artDeliveryManifest
	});
	if (canonicalHash(rebuiltRuntime) !== canonicalHash(runtime)) {
		throw new Error('Tracked runtime differs from its accepted inputs.');
	}
	validateShortRecall({
		acceptedSubset,
		shortRecallPrompts: values.get(RELEASE_SIBLINGS.shortRecallPrompts),
		shortRecallAuthoringEvidence: values.get(RELEASE_SIBLINGS.shortRecallAuthoringEvidence),
		shortRecallReviewEvidence: values.get(RELEASE_SIBLINGS.shortRecallReviewEvidence)
	});
	const rebuiltCoverage = buildScienceChallengeAcceptedReleaseCoverage({
		acceptedSubset,
		evidenceProjection
	});
	if (canonicalHash(rebuiltCoverage) !== canonicalHash(values.get(RELEASE_SIBLINGS.coverage))) {
		throw new Error('Tracked curriculum coverage differs from accepted membership.');
	}
	validateTrackedProvenance({
		acceptedSubset,
		evidenceProjection,
		holdoutLedger,
		sourceManifest,
		sourceHashReceipt,
		curriculumIndex,
		trackedManifest,
		trackedHashReceipt,
		collectionValidation,
		provenanceManifest,
		values
	});
}

function validateAcceptedMarkerSourceBindings({ marker, acceptedSubset, evidenceProjection }) {
	const expected = SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS;
	if (
		canonicalHash(marker.challenges) !== canonicalHash(acceptedSubset.challenges) ||
		canonicalHash(marker.challenges) !== expected.acceptedCandidateSetSha256 ||
		marker.release.receipt.fullCandidateSetSha256 !== expected.fullCandidateSetSha256 ||
		marker.release.receipt.acceptedCandidateSetSha256 !== expected.acceptedCandidateSetSha256 ||
		marker.release.receipt.acceptedIdSetSha256 !== expected.acceptedIdSetSha256 ||
		marker.release.receipt.reviewSetSha256 !== expected.reviewSetSha256 ||
		marker.release.receipt.acceptedReviewSetSha256 !== expected.acceptedReviewSetSha256 ||
		evidenceProjection.rawEvidenceProjection.canonicalSha256 !==
			acceptedSubset.evidence.evidenceProjectionSha256
	) {
		throw new Error('Accepted release marker differs from the frozen B0 receipt.');
	}
}

function validateTrackedCurriculumIndex({ curriculumIndex, acceptedSubset, marker }) {
	if (
		curriculumIndex?.schemaVersion !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_CURRICULUM_INDEX_SCHEMA ||
		curriculumIndex.status !== 'sanitized' ||
		curriculumIndex.sourceCanonicalSha256 !==
			SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS.curriculumEvidenceSha256 ||
		curriculumIndex.sourceCanonicalSha256 !== acceptedSubset.evidence.curriculumEvidenceSha256 ||
		marker.release.rawCurriculumEvidenceSha256 !== curriculumIndex.sourceCanonicalSha256 ||
		curriculumIndex.componentCount !== curriculumIndex.components.length ||
		curriculumIndex.componentSetSha256 !== canonicalHash(curriculumIndex.components)
	) {
		throw new Error('Tracked curriculum index does not bind the raw B0 evidence.');
	}
	assertNoSourceRichProvenanceFields(curriculumIndex);
	const curriculumById = new Map();
	for (const component of curriculumIndex.components) {
		if (
			!CURRICULUM_COMPONENT_ID.test(String(component.componentId ?? '')) ||
			curriculumById.has(component.componentId) ||
			!SHA256.test(String(component.specificationSha256 ?? '')) ||
			!SHA256.test(String(component.sourceTextSha256 ?? ''))
		) {
			throw new Error('Tracked curriculum index contains a malformed component.');
		}
		curriculumById.set(component.componentId, component);
	}
	return curriculumById;
}

function validateTrackedArtReview({ artReview, artManifest, artDeliveryManifest }) {
	if (
		artReview?.releaseId !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID ||
		artReview.status !== 'passed' ||
		artReview.manifestSha256 !== canonicalHash(artManifest) ||
		artReview.assetInventorySha256 !== artDeliveryManifest.assetInventorySha256 ||
		artReview.acceptedCount !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artPairs ||
		artReview.rejectedCount !== 0 ||
		!Array.isArray(artReview.reviews) ||
		artReview.reviews.length !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artPairs ||
		artReview.reviews.some((review) => review.accepted !== true)
	) {
		throw new Error('Tracked art review summary is not a passed 239-pair receipt.');
	}
}

function validateTrackedPerceptualAudit({ artPerceptualAudit, artManifest, artDeliveryManifest }) {
	const recordsById = new Map(artPerceptualAudit.records.map((record) => [record.id, record]));
	const assetInventory = artManifest.specs.map((spec) => ({
		id: spec.id,
		darkSha256: recordsById.get(`${spec.id}-dark`)?.sha256,
		lightSha256: recordsById.get(`${spec.id}-light`)?.sha256
	}));
	const validation = validatePerceptualAudit(artPerceptualAudit, {
		manifest: artManifest,
		assetInventory,
		expectedRecordCount: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artFiles
	});
	if (
		validation.status !== 'passed' ||
		artPerceptualAudit.assetInventorySha256 !== artDeliveryManifest.assetInventorySha256
	) {
		throw new Error(`Tracked perceptual audit failed replay:\n${validation.issues.join('\n')}`);
	}
}

function validateTrackedArtGenerationLineage({
	artGenerationLineage,
	artManifest,
	artDeliveryManifest
}) {
	if (
		artGenerationLineage?.schemaVersion !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ART_LINEAGE_SCHEMA ||
		artGenerationLineage.status !== 'passed' ||
		artGenerationLineage.manifestSha256 !== canonicalHash(artManifest) ||
		artGenerationLineage.assetInventorySha256 !== artDeliveryManifest.assetInventorySha256 ||
		artGenerationLineage.pairCount !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artPairs ||
		artGenerationLineage.fileCount !== SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS.artFiles ||
		artGenerationLineage.items.some(
			(item) =>
				!Array.isArray(item.matchingJobs) ||
				item.matchingJobs.length === 0 ||
				item.matchingJobs.some(
					(job) =>
						typeof job.dependencyId !== 'string' ||
						!SHA256.test(String(job.canonicalSha256 ?? '')) ||
						!SHA256.test(String(job.fileSha256 ?? '')) ||
						!isRecord(job.generationArtifacts)
				)
		)
	) {
		throw new Error('Tracked art generation lineage is incomplete.');
	}
}

function validateTrackedProvenance({
	acceptedSubset,
	evidenceProjection,
	holdoutLedger,
	sourceManifest,
	sourceHashReceipt,
	curriculumIndex,
	trackedManifest,
	trackedHashReceipt,
	collectionValidation,
	provenanceManifest,
	values
}) {
	if (
		evidenceProjection?.schemaVersion !==
			SCIENCE_CHALLENGE_ACCEPTED_RELEASE_EVIDENCE_PROJECTION_SCHEMA ||
		evidenceProjection.status !== 'sanitized' ||
		evidenceProjection.draftSetSha256 !== canonicalHash(evidenceProjection.drafts) ||
		evidenceProjection.semanticReviewSetSha256 !== canonicalHash(evidenceProjection.semanticReviews)
	) {
		throw new Error('Tracked evidence projection is malformed.');
	}
	assertNoSourceRichProvenanceFields(evidenceProjection);
	const externalDependencies = trackedManifest.externalDependencies;
	if (
		!Array.isArray(externalDependencies) ||
		externalDependencies.length < 1 ||
		canonicalHash(externalDependencies) !== canonicalHash(provenanceManifest.externalDependencies)
	) {
		throw new Error('Tracked external-dependency receipts are incomplete.');
	}
	const rawProjection = externalDependencies.find(
		(dependency) => dependency.dependencyId === RAW_EVIDENCE_PROJECTION_DEPENDENCY.dependencyId
	);
	const sourceProjectionReceipt = sourceManifest.companionFiles.find(
		(entry) => entry.role === 'evidenceProjection'
	);
	const sourceProjectionHashReceipt = sourceHashReceipt.artifacts.find(
		(entry) => entry.role === 'evidenceProjection'
	);
	if (
		!rawProjection ||
		rawProjection.canonicalSha256 !== evidenceProjection.rawEvidenceProjection.canonicalSha256 ||
		rawProjection.fileSha256 !== evidenceProjection.rawEvidenceProjection.fileSha256 ||
		sourceProjectionReceipt?.canonicalSha256 !== rawProjection.canonicalSha256 ||
		sourceProjectionReceipt?.fileSha256 !== rawProjection.fileSha256 ||
		sourceProjectionHashReceipt?.canonicalSha256 !== rawProjection.canonicalSha256 ||
		sourceProjectionHashReceipt?.fileSha256 !== rawProjection.fileSha256
	) {
		throw new Error('Tracked source receipts do not bind the external raw evidence projection.');
	}
	const provenanceCopies = {
		acceptedSubset,
		subsetManifest: sourceManifest,
		evidenceProjection,
		collectionValidation,
		holdoutLedger,
		hashReceipt: sourceHashReceipt,
		curriculumEvidence: curriculumIndex
	};
	const rebuiltTracked = buildTrackedAcceptedSubsetProvenanceReceipts({
		provenanceCopies,
		externalDependencies
	});
	if (
		canonicalHash(rebuiltTracked.trackedManifest) !== canonicalHash(trackedManifest) ||
		canonicalHash(rebuiltTracked.trackedHashReceipt) !== canonicalHash(trackedHashReceipt)
	) {
		throw new Error('Tracked accepted-subset provenance receipts are stale.');
	}
	const allProvenanceCopies = {
		...provenanceCopies,
		trackedManifest,
		trackedHashReceipt
	};
	const rebuiltRootManifest = buildAcceptedReleaseProvenanceManifest({
		acceptedSubset,
		evidenceProjection,
		holdoutLedger,
		provenanceCopies: allProvenanceCopies,
		externalDependencies
	});
	if (canonicalHash(rebuiltRootManifest) !== canonicalHash(provenanceManifest)) {
		throw new Error('Tracked root provenance manifest is stale.');
	}
	for (const source of provenanceManifest.sources) {
		const sibling = markerSibling(values, source.path);
		if (
			!sibling ||
			sibling.sha256 !== source.sha256 ||
			sibling.fileSha256 !== source.fileSha256 ||
			sibling.size !== source.size
		) {
			throw new Error(`Tracked provenance source receipt is stale: ${source.path}.`);
		}
	}
}

function markerSibling(values, relativePath) {
	const value = values.get(relativePath);
	if (!value) return null;
	const bytes = stableJsonBytes(value);
	return {
		sha256: canonicalHash(value),
		fileSha256: sha256(bytes),
		size: bytes.byteLength
	};
}

function runtimeArtRecord(spec, deliveryById) {
	const dark = deliveryById.get(`${spec.id}-dark`);
	const light = deliveryById.get(`${spec.id}-light`);
	if (!dark || !light) {
		throw new Error(`Runtime art delivery is missing for ${spec.id}.`);
	}
	return {
		src: light.publicPath,
		darkSrc: dark.publicPath,
		alt: spec.altText,
		width: 960,
		height: 540
	};
}

function memorySegments(memoryHandle, challengeId) {
	if (typeof memoryHandle !== 'string' || !memoryHandle.trim()) {
		throw new Error(`Runtime memory handle is missing for ${challengeId}.`);
	}
	const segments = memoryHandle
		.split(/\s*(?:→|⟶)\s*/u)
		.map((segment) => segment.trim())
		.filter(Boolean);
	if (segments.length < 2 || segments.length > 8) {
		throw new Error(`Runtime memory handle is malformed for ${challengeId}.`);
	}
	return segments;
}

function uniqueStrings(values) {
	if (values.some((value) => typeof value !== 'string' || !value)) {
		throw new Error('Expected a complete string identity collection.');
	}
	return [...new Set(values)].sort(compareCodePoints);
}

function requireWebpBytes(bytes, label) {
	if (
		bytes.length < 12 ||
		!bytes.subarray(0, 4).equals(WEBP_RIFF) ||
		!bytes.subarray(8, 12).equals(WEBP_MAGIC)
	) {
		throw new Error(`Accepted art asset is not a WebP: ${label}`);
	}
}

function writeStableJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, stableJsonBytes(value), {
		flag: 'wx',
		mode: 0o644
	});
}

function stableJsonBytes(value) {
	return Buffer.from(`${stableStringify(value)}\n`);
}

function readJsonRecord(filePath) {
	const stat = lstatSync(filePath);
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error(`Accepted release file must be regular: ${filePath}`);
	}
	const bytes = readFileSync(filePath);
	let value;
	try {
		value = JSON.parse(bytes.toString('utf8'));
	} catch (error) {
		throw new Error(
			`Accepted release JSON is malformed: ${filePath}: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error }
		);
	}
	return {
		value,
		size: bytes.byteLength,
		fileSha256: sha256(bytes),
		canonicalSha256: canonicalHash(value)
	};
}

function listRegularFiles(directory, prefix = '') {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
		compareCodePoints(left.name, right.name)
	)) {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		const absolute = path.join(directory, entry.name);
		if (entry.isSymbolicLink()) {
			throw new Error(`Accepted release tree contains a symlink: ${relative}`);
		}
		if (entry.isDirectory()) {
			files.push(...listRegularFiles(absolute, relative));
		} else if (entry.isFile()) {
			files.push(relative);
		} else {
			throw new Error(`Accepted release tree contains a non-file entry: ${relative}`);
		}
	}
	return files.sort(compareCodePoints);
}

function requireSafeRepositoryFile(repositoryRoot, relativePath, label) {
	const normalized = normalizeRelative(relativePath, label);
	const filePath = resolveWithin(repositoryRoot, normalized);
	const stat = lstatSync(filePath);
	if (!stat.isFile() || stat.isSymbolicLink()) {
		throw new Error(`${label} must be an ordinary repository file.`);
	}
	const real = realpathSync(filePath);
	if (!real.startsWith(`${repositoryRoot}${path.sep}`)) {
		throw new Error(`${label} escapes the repository.`);
	}
	return real;
}

function requireRealDirectory(directory, label) {
	const resolved = path.resolve(directory);
	const stat = lstatSync(resolved);
	if (!stat.isDirectory() || stat.isSymbolicLink()) {
		throw new Error(`${label} must be a real directory.`);
	}
	return realpathSync(resolved);
}

function requireSafeParent(repositoryRoot, directory, allowMissing) {
	const relative = path.relative(repositoryRoot, directory);
	if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') {
		throw new Error('Accepted release parent must remain inside the repository.');
	}
	const segments = relative.split(path.sep);
	let cursor = repositoryRoot;
	for (const segment of segments) {
		cursor = path.join(cursor, segment);
		if (!pathEntryExists(cursor)) {
			if (allowMissing) return;
			throw new Error('Accepted release parent appeared incomplete.');
		}
		const stat = lstatSync(cursor);
		if (!stat.isDirectory() || stat.isSymbolicLink()) {
			throw new Error('Accepted release parent contains a symlink or non-directory.');
		}
	}
}

function normalizeRelative(value, label) {
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`${label} must be a non-empty repository-relative path.`);
	}
	const portable = value.replaceAll('\\', '/');
	if (path.posix.isAbsolute(portable)) {
		throw new Error(`${label} must be repository-relative.`);
	}
	const segments = portable.split('/');
	if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
		throw new Error(`${label} must be a normalized repository-relative path.`);
	}
	return segments.join('/');
}

function resolveWithin(repositoryRoot, relativePath) {
	const resolved = path.resolve(repositoryRoot, relativePath);
	if (resolved === repositoryRoot || !resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
		throw new Error('Accepted release path escapes the repository.');
	}
	return resolved;
}

function assertAbsentPathEntry(filePath, label) {
	if (pathEntryExists(filePath)) {
		throw new Error(`${label} already exists and is immutable: ${filePath}`);
	}
}

function pathEntryExists(filePath) {
	try {
		lstatSync(filePath);
		return true;
	} catch (error) {
		if (error?.code === 'ENOENT') return false;
		throw error;
	}
}

function visitForLeaks(value, location, leaks) {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (
			/(?:^|[^A-Za-z0-9])\/(?:Users|home|private|tmp|var|opt|root|workspace|etc)\/[^\s"'`]*/u.test(
				value
			) ||
			/(?:^|[^A-Za-z0-9])[A-Za-z]:\\[^\s"'`]*/u.test(value) ||
			/file:\/\//iu.test(value) ||
			/yaroslav(?:_|)volovich/iu.test(value) ||
			(trimmed.startsWith('/') && !/^\/(?:api|images|product|assets|_app)(?:\/|$)/u.test(trimmed))
		) {
			leaks.push(`${location} contains an absolute or user-specific path.`);
		}
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) => visitForLeaks(item, `${location}[${index}]`, leaks));
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, item] of Object.entries(value)) {
		visitForLeaks(item, `${location}.${key}`, leaks);
	}
}

function visit(value, location, callback) {
	if (Array.isArray(value)) {
		value.forEach((item, index) => visit(item, `${location}[${index}]`, callback));
		return;
	}
	if (!isRecord(value)) return;
	for (const [key, item] of Object.entries(value)) {
		const itemLocation = `${location}.${key}`;
		callback(key, item, itemLocation);
		visit(item, itemLocation, callback);
	}
}

function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compareCodePoints(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}
