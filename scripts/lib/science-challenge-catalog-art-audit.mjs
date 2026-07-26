import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	existsSync,
	linkSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import {
	auditQuestionArtAuthority,
	canonicalHash,
	sha256,
	stableStringify,
	validateQuestionArtManifest
} from './science-challenge-release.mjs';
import { requireArtReviewEvidence } from './science-challenge-review-evidence.mjs';
import {
	SCIENCE_CHALLENGE_ART_COHORT_EXPECTATIONS,
	validateScienceChallengeArtCohortManifest
} from './science-challenge-art-cohort.mjs';
import {
	SCIENCE_QUESTION_ART_DHASH_ALGORITHM,
	SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
	SCIENCE_QUESTION_ART_DHASH_VARIANTS,
	dHashFromGrayPixels,
	hammingDistanceHex
} from './science-question-art-perceptual.mjs';

export const SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_SCHEMA = 'science-challenge-catalog-art-audit/v2';
export const SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SCHEMA = 'science-challenge-accepted-subset/v1';

export const SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS = Object.freeze({
	releaseId: 'science-179-v1',
	acceptedSubsetSchema: SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SCHEMA,
	acceptedChallengeCount: 179,
	acceptedChallengeEntriesSha256:
		'e8d5366939295208d1f56eb6b2c64f7d71cb015989d2cd65614434512a582eba',
	acceptedChallengeIdsSha256: 'b63211399bbed340786c2d8642108bc48c0a26abcb01dd3bcd4c65801227cbfa',
	acceptedChallengeSortedIdsSha256:
		'83c36c70fd9752ecb0b7bb44673317382c9158fe9c098e5fce64c550063768fc',
	artManifestSha256: 'fd824914480b8bd8486af11e1b69b98906811e9c88958b320d1361464f6fa171',
	manifestOwnerCount: 239,
	acceptedNewOwnerCount: 179,
	existingReplacementOwnerCount: 60,
	authoredChallengeCount: 92,
	authoredDefinitionsSha256: '6355e6ef48bf1cf5069941fc69b69e1756b6467e00fec3337b80decc65e72cc3',
	retainedStaticOwnerCount: 32,
	finalOwnerCount: 271,
	finalFileCount: 542,
	requireFrozenArtManifest: true,
	requireRetainedStaticReview: true,
	requiredStaticMappings: Object.freeze({
		'biology-recessive-inheritance': Object.freeze({
			darkPath: 'static/product/challenges/cards/biology-recessive-inheritance-dark-v3.webp',
			lightPath: 'static/product/challenges/cards/biology-recessive-inheritance-light-v3.webp'
		}),
		'chemistry-alloy-hardness': Object.freeze({
			darkPath: 'static/product/challenges/cards/chemistry-alloy-hardness-dark-v3.webp',
			lightPath: 'static/product/challenges/cards/chemistry-alloy-hardness-light-v3.webp'
		}),
		'chemistry-equilibrium-pressure': Object.freeze({
			darkPath: 'static/product/challenges/cards/chemistry-equilibrium-pressure-dark-v3.webp',
			lightPath: 'static/product/challenges/cards/chemistry-equilibrium-pressure-light-v3.webp'
		}),
		'chemistry-exothermic-energy': Object.freeze({
			darkPath: 'static/product/challenges/cards/chemistry-exothermic-energy-dark-v3.webp',
			lightPath: 'static/product/challenges/cards/chemistry-exothermic-energy-light-v3.webp'
		}),
		'chemistry-flame-tests': Object.freeze({
			darkPath: 'static/product/challenges/cards/chemistry-flame-tests-dark-v3.webp',
			lightPath: 'static/product/challenges/cards/chemistry-flame-tests-light-v3.webp'
		}),
		'chemistry-ionic-bonding': Object.freeze({
			darkPath: 'static/product/challenges/cards/chemistry-ionic-bonding-dark-v3.webp',
			lightPath: 'static/product/challenges/cards/chemistry-ionic-bonding-light-v3.webp'
		}),
		'chemistry-molten-electrolysis': Object.freeze({
			darkPath: 'static/product/challenges/cards/chemistry-molten-electrolysis-dark-v3.webp',
			lightPath: 'static/product/challenges/cards/chemistry-molten-electrolysis-light-v3.webp'
		}),
		'physics-conductivity-rate': Object.freeze({
			darkPath: 'static/product/challenges/cards/physics-conductivity-bowl-dark-v3.webp',
			lightPath: 'static/product/challenges/cards/physics-conductivity-bowl-light-v3.webp'
		}),
		'physics-motor-force': Object.freeze({
			darkPath: 'static/product/challenges/cards/physics-motor-wire-dark-v3.webp',
			lightPath: 'static/product/challenges/cards/physics-motor-wire-light-v3.webp'
		})
	})
});

const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DHASH = /^[a-f0-9]{16}$/u;
const THEMES = Object.freeze(['dark', 'light']);
const MANIFEST_OWNER_KINDS = Object.freeze(['accepted-new', 'existing-expansion-replacement']);
const FINAL_OWNER_KINDS = Object.freeze([
	'accepted-new',
	'existing-expansion-replacement',
	'authored-static'
]);
const WINDOWS_ABSOLUTE = /^[a-z]:[\\/]/iu;
const USER_PATH_FRAGMENT = /(?:^|[\\/])(?:Users|home)[\\/][^/\\\s]+(?:[\\/]|$)/u;

/**
 * Build the closed-world primary-art audit for the accepted 179 plus the current authored 92.
 * The caller supplies authored definitions and visuals loaded through Vite so this library does not
 * parse TypeScript or duplicate application routing logic.
 */
export function buildScienceChallengeCatalogArtAudit({
	repositoryRoot,
	acceptedSubset,
	acceptedSubsetPath,
	artManifest,
	artManifestPath,
	retainedStaticManifest = null,
	retainedStaticManifestPath = null,
	retainedStaticReview = null,
	retainedStaticReviewPath = null,
	authoredDefinitions,
	authoredVisuals,
	expectations = SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS,
	fingerprintFiles = fingerprintScienceChallengeCatalogArtFiles,
	validateRetainedStaticReview = requireArtReviewEvidence
}) {
	const expected = normalizeExpectations(expectations);
	const root = realpathSync(repositoryRoot);
	const acceptedInputPath = normalizeAuditInputPath(acceptedSubsetPath, 'accepted subset path');
	const manifestInputPath = normalizeAuditInputPath(artManifestPath, 'art manifest path');
	const retainedStaticManifestInputPath = expected.requireRetainedStaticReview
		? normalizeAuditInputPath(retainedStaticManifestPath, 'retained static art manifest path')
		: null;
	const retainedStaticReviewInputPath = expected.requireRetainedStaticReview
		? normalizeAuditInputPath(retainedStaticReviewPath, 'retained static art review path')
		: null;
	const acceptedEntries = extractAcceptedChallengeEntries(acceptedSubset, expected);
	const acceptedDefinitions = acceptedEntries.map((entry) => entry.definition);
	const acceptedIds = acceptedDefinitions.map((definition) => definition.id);

	assertExactAcceptedSubset({
		acceptedSubset,
		acceptedEntries,
		acceptedDefinitions,
		acceptedIds,
		expected
	});
	assertExactArtManifest(artManifest, expected);
	assertExactAuthoredCatalog(authoredDefinitions, authoredVisuals, expected);

	const authoredIds = authoredDefinitions.map((definition) => definition.id);
	const authoredIdSet = new Set(authoredIds);
	const acceptedIdSet = new Set(acceptedIds);
	for (const id of acceptedIds) {
		if (authoredIdSet.has(id)) {
			throw new Error(`Accepted challenge collides with authored catalog id ${id}.`);
		}
	}

	const manifestOwners = artManifest.cohort.owners;
	const manifestFiles = artManifest.cohort.files;
	const acceptedManifestIds = manifestOwners
		.filter((owner) => owner.ownerKind === 'accepted-new')
		.map((owner) => owner.challengeId);
	const replacementIds = manifestOwners
		.filter((owner) => owner.ownerKind === 'existing-expansion-replacement')
		.map((owner) => owner.challengeId);
	assertExactSet(
		acceptedIds,
		acceptedManifestIds,
		'Accepted subset and accepted-new art owners differ'
	);
	for (const id of replacementIds) {
		if (!authoredIdSet.has(id)) {
			throw new Error(`Replacement art owner is not an authored challenge: ${id}.`);
		}
		if (acceptedIdSet.has(id)) {
			throw new Error(`Replacement art owner collides with accepted challenge: ${id}.`);
		}
	}

	const retainedStaticIds = authoredIds.filter((id) => !replacementIds.includes(id));
	if (retainedStaticIds.length !== expected.retainedStaticOwnerCount) {
		throw new Error(
			`Authored static remainder must contain exactly ${expected.retainedStaticOwnerCount} challenges.`
		);
	}

	const manifestFileByOwnerTheme = indexManifestFiles(manifestFiles);
	const manifestOwnerRecords = manifestOwners.map((owner) => {
		const darkFile = manifestFileByOwnerTheme.get(`${owner.challengeId}\ndark`);
		const lightFile = manifestFileByOwnerTheme.get(`${owner.challengeId}\nlight`);
		if (!darkFile || !lightFile) {
			throw new Error(`${owner.challengeId} is missing a manifest light/dark file pair.`);
		}
		const darkPath = normalizeManifestLocalPath(owner.darkPath, `${owner.challengeId} dark path`);
		const lightPath = normalizeManifestLocalPath(
			owner.lightPath,
			`${owner.challengeId} light path`
		);
		if (
			darkFile.localPath !== owner.darkPath ||
			lightFile.localPath !== owner.lightPath ||
			darkFile.artId !== owner.artId ||
			lightFile.artId !== owner.artId
		) {
			throw new Error(`${owner.challengeId} manifest owner/file bindings differ.`);
		}
		return {
			challengeId: owner.challengeId,
			ownerKind: owner.ownerKind,
			sourceKind: 'art-manifest',
			artId: owner.artId,
			sourceBindingSha256: owner.sourceSpecSha256,
			darkPath,
			lightPath,
			fileIds: {
				dark: darkFile.id,
				light: lightFile.id
			}
		};
	});

	const authoredVisualById = new Map(
		authoredVisuals.map((entry) => [entry.challengeId, entry.visual])
	);
	const staticOwnerRecords = retainedStaticIds.map((challengeId) => {
		const visual = authoredVisualById.get(challengeId);
		if (!visual?.cardArt) {
			throw new Error(`${challengeId} must own one authored primary art pair.`);
		}
		const darkPath = staticArtSourceToRepoPath(
			visual.cardArt.darkSrc,
			`${challengeId} dark card art`
		);
		const lightPath = staticArtSourceToRepoPath(
			visual.cardArt.src,
			`${challengeId} light card art`
		);
		return {
			challengeId,
			ownerKind: 'authored-static',
			sourceKind: 'vite-authored-static',
			artId: challengeId,
			sourceBindingSha256: canonicalHash({
				challengeId,
				darkPath,
				lightPath
			}),
			darkPath,
			lightPath,
			fileIds: {
				dark: `${challengeId}-dark`,
				light: `${challengeId}-light`
			}
		};
	});

	const ownerRecordsWithFileIds = [...manifestOwnerRecords, ...staticOwnerRecords].sort(
		(left, right) => left.challengeId.localeCompare(right.challengeId)
	);
	assertOwnerRecords(ownerRecordsWithFileIds, expected);
	assertRequiredStaticMappings(ownerRecordsWithFileIds, expected.requiredStaticMappings);

	const fileInputs = ownerRecordsWithFileIds.flatMap((owner) =>
		THEMES.map((theme) => ({
			id: owner.fileIds[theme],
			challengeId: owner.challengeId,
			ownerKind: owner.ownerKind,
			artId: owner.artId,
			theme,
			path: owner[`${theme}Path`]
		}))
	);
	if (fileInputs.length !== expected.finalFileCount) {
		throw new Error(`Final art inventory must contain exactly ${expected.finalFileCount} files.`);
	}
	const fileRecords = fingerprintFiles({
		repositoryRoot: root,
		fileRecords: fileInputs
	});
	assertFingerprintedFileRecords(fileInputs, fileRecords, expected);
	const retainedStaticReviewAudit = buildRetainedStaticReviewAudit({
		repositoryRoot: root,
		required: expected.requireRetainedStaticReview,
		retainedStaticIds,
		staticOwnerRecords,
		fileRecords,
		authoredDefinitions,
		retainedStaticManifest,
		retainedStaticReview,
		validateRetainedStaticReview
	});

	const collisions = findCatalogArtPerceptualCollisions(fileRecords);
	const functionalDiagramAudit = auditAcceptedFunctionalDiagramRequirements(acceptedDefinitions);
	const questionAuthorityAudit = auditCatalogQuestionAuthority({
		owners: ownerRecordsWithFileIds,
		artManifest,
		acceptedDefinitions,
		authoredDefinitions,
		authoredVisuals
	});
	const owners = ownerRecordsWithFileIds.map((owner) => ({
		challengeId: owner.challengeId,
		ownerKind: owner.ownerKind,
		sourceKind: owner.sourceKind,
		artId: owner.artId,
		sourceBindingSha256: owner.sourceBindingSha256,
		darkPath: owner.darkPath,
		lightPath: owner.lightPath
	}));
	const authoredVisualProjection = authoredDefinitions.map((definition) => {
		const visual = authoredVisualById.get(definition.id);
		return {
			challengeId: definition.id,
			darkSource: normalizeWebArtSource(
				visual?.cardArt?.darkSrc,
				`${definition.id} dark authored visual`
			),
			lightSource: normalizeWebArtSource(
				visual?.cardArt?.src,
				`${definition.id} light authored visual`
			)
		};
	});
	const hashes = {
		acceptedChallengeIdsSha256: canonicalHash(acceptedIds),
		acceptedChallengeSortedIdsSha256: canonicalHash(
			[...acceptedIds].sort((left, right) => left.localeCompare(right))
		),
		authoredChallengeIdsSha256: canonicalHash(authoredIds),
		finalOwnerIdsSha256: canonicalHash(owners.map((owner) => owner.challengeId)),
		ownerRecordsSha256: canonicalHash(owners),
		fileRecordsSha256: canonicalHash(fileRecords),
		imageInventorySha256: canonicalHash(
			fileRecords.map(({ challengeId, artId, theme, sha256: fileSha256, dHashes }) => ({
				challengeId,
				artId,
				theme,
				sha256: fileSha256,
				dHashes
			}))
		),
		functionalDiagramRequirementsSha256: canonicalHash(functionalDiagramAudit.requirements),
		questionAuthorityFindingsSha256: canonicalHash(questionAuthorityAudit.findings),
		retainedStaticReviewPairsSha256: canonicalHash(retainedStaticReviewAudit.pairs)
	};
	const status =
		collisions.length === 0 &&
		functionalDiagramAudit.unresolvedCount === 0 &&
		questionAuthorityAudit.majorMismatchCount === 0 &&
		retainedStaticReviewAudit.status === 'passed'
			? 'passed'
			: 'failed';
	const audit = {
		schemaVersion: SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_SCHEMA,
		releaseId: expected.releaseId,
		status,
		inputs: {
			acceptedSubset: {
				path: acceptedInputPath,
				canonicalSha256: canonicalHash(acceptedSubset),
				challengeEntriesSha256: canonicalHash(acceptedEntries),
				definitionsSha256: canonicalHash(acceptedDefinitions)
			},
			artManifest: {
				path: manifestInputPath,
				canonicalSha256: canonicalHash(artManifest),
				ownerRecordsSha256: artManifest.cohort.ownersSha256,
				fileRecordsSha256: artManifest.cohort.filesSha256
			},
			authoredCatalog: {
				definitionsSha256: canonicalHash(authoredDefinitions),
				visualProjectionSha256: canonicalHash(authoredVisualProjection)
			},
			retainedStaticReview: expected.requireRetainedStaticReview
				? {
						manifestPath: retainedStaticManifestInputPath,
						manifestSha256: canonicalHash(retainedStaticManifest),
						reviewPath: retainedStaticReviewInputPath,
						reviewSha256: canonicalHash(retainedStaticReview)
					}
				: null
		},
		policy: {
			pairPolicy: 'one-primary-light-dark-pair-per-challenge',
			semanticReviewPolicy:
				'question-authoritative-major-fresh-regeneration-minor-retain-with-annotation',
			perceptualAlgorithm: SCIENCE_QUESTION_ART_DHASH_ALGORITHM,
			perceptualThreshold: SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
			perceptualVariants: [...SCIENCE_QUESTION_ART_DHASH_VARIANTS]
		},
		counts: {
			acceptedChallengeDefinitions: acceptedDefinitions.length,
			authoredChallengeDefinitions: authoredDefinitions.length,
			acceptedNewOwners: acceptedManifestIds.length,
			existingReplacementOwners: replacementIds.length,
			retainedStaticOwners: retainedStaticIds.length,
			primaryOwnerRecords: owners.length,
			primaryPairRecords: owners.length,
			fileRecords: fileRecords.length,
			perceptualCollisions: collisions.length,
			functionalDiagramRequirements: functionalDiagramAudit.requirementCount,
			unresolvedFunctionalDiagramRequirements: functionalDiagramAudit.unresolvedCount,
			questionAuthorityOwners: questionAuthorityAudit.scannedOwnerCount,
			questionAuthorityMajorMismatches: questionAuthorityAudit.majorMismatchCount,
			retainedStaticCleanAccepted: retainedStaticReviewAudit.cleanAcceptedCount,
			retainedStaticAnnotatedAccepted: retainedStaticReviewAudit.annotatedAcceptedCount,
			retainedStaticMajorRejected: retainedStaticReviewAudit.majorRejectedCount
		},
		hashes,
		owners,
		files: fileRecords,
		perceptualAudit: {
			algorithm: SCIENCE_QUESTION_ART_DHASH_ALGORITHM,
			threshold: SCIENCE_QUESTION_ART_DHASH_THRESHOLD,
			variants: [...SCIENCE_QUESTION_ART_DHASH_VARIANTS],
			collisionCount: collisions.length,
			collisions
		},
		functionalDiagramAudit,
		questionAuthorityAudit,
		retainedStaticReviewAudit
	};
	const validation = validateScienceChallengeCatalogArtAudit(audit, {
		expectations: expected,
		requirePassed: false
	});
	if (validation.status !== 'passed') {
		throw new Error(`Built catalog art audit is invalid:\n${validation.issues.join('\n')}`);
	}
	return audit;
}

export function buildRetainedStaticReviewAudit({
	repositoryRoot,
	required,
	retainedStaticIds,
	staticOwnerRecords,
	fileRecords,
	authoredDefinitions,
	retainedStaticManifest,
	retainedStaticReview,
	validateRetainedStaticReview = requireArtReviewEvidence
}) {
	if (!required) {
		return {
			required: false,
			status: 'passed',
			reviewedPairCount: 0,
			cleanAcceptedCount: 0,
			annotatedAcceptedCount: 0,
			majorRejectedCount: 0,
			pairs: []
		};
	}
	if (!isRecord(retainedStaticManifest) || !isRecord(retainedStaticReview)) {
		throw new Error(
			'Final catalogue audit requires a retained-static art manifest and complete independent review.'
		);
	}
	const expectedCount = retainedStaticIds.length;
	const manifestValidation = validateQuestionArtManifest(retainedStaticManifest, {
		expectedCount
	});
	if (manifestValidation.status !== 'passed') {
		throw new Error(
			`Retained-static art manifest is invalid:\n${manifestValidation.issues.join('\n')}`
		);
	}
	const bindings = retainedStaticManifest.cohort?.sourceBindings;
	if (
		retainedStaticManifest.cohort?.sourceKind !== 'vite-authored-static' ||
		retainedStaticManifest.cohort?.ownerCount !== expectedCount ||
		!Array.isArray(bindings) ||
		bindings.length !== expectedCount ||
		retainedStaticManifest.cohort.sourceBindingsSha256 !== canonicalHash(bindings)
	) {
		throw new Error(
			'Retained-static art manifest does not bind the complete authored-static cohort.'
		);
	}
	const reviewValidation = validateRetainedStaticReview({
		review: retainedStaticReview,
		manifest: retainedStaticManifest,
		rootDir: repositoryRoot,
		requiredStatus: 'passed',
		expectedCount,
		useCurrentAssetBytes: true
	});
	if (reviewValidation?.status !== 'passed') {
		throw new Error(
			`Retained-static independent art review is invalid:\n${(
				reviewValidation?.issues ?? ['unknown review validation failure']
			).join('\n')}`
		);
	}
	const definitionsById = new Map(
		authoredDefinitions.map((definition) => [definition.id, definition])
	);
	const ownersById = new Map(staticOwnerRecords.map((owner) => [owner.challengeId, owner]));
	const bindingsById = uniqueIndex(bindings, 'challengeId', 'retained-static source binding');
	const specsByChallengeId = uniqueIndex(
		retainedStaticManifest.specs,
		'challengeId',
		'retained-static art spec'
	);
	const reviewsById = uniqueIndex(reviewValidation.rawReviews, 'id', 'retained-static art review');
	const filesByOwnerTheme = new Map(
		fileRecords
			.filter((file) => file.ownerKind === 'authored-static')
			.map((file) => [`${file.challengeId}\n${file.theme}`, file])
	);
	assertExactSet(
		retainedStaticIds,
		bindings.map((binding) => binding.challengeId),
		'Retained-static source bindings differ from the final authored-static cohort'
	);
	assertExactSet(
		retainedStaticIds,
		retainedStaticManifest.specs.map((spec) => spec.challengeId),
		'Retained-static review specs differ from the final authored-static cohort'
	);

	const pairs = [...retainedStaticIds]
		.sort((left, right) => left.localeCompare(right))
		.map((challengeId) => {
			const definition = definitionsById.get(challengeId);
			const owner = ownersById.get(challengeId);
			const binding = bindingsById.get(challengeId);
			const spec = specsByChallengeId.get(challengeId);
			const review = reviewsById.get(spec?.id);
			if (!definition || !owner || !binding || !spec || !review) {
				throw new Error(`${challengeId} has incomplete retained-static review bindings.`);
			}
			if (
				spec.id !== `${challengeId}-opening` ||
				spec.context !== 'opening' ||
				normalizeAuthorityText(spec.question) !==
					normalizeAuthorityText(definition.previewQuestion) ||
				binding.artId !== spec.id ||
				binding.darkSourcePath !== owner.darkPath ||
				binding.lightSourcePath !== owner.lightPath ||
				binding.darkReviewPath !== spec.output.darkPath ||
				binding.lightReviewPath !== spec.output.lightPath
			) {
				throw new Error(
					`${challengeId} retained-static review is not bound to its current question and source pair.`
				);
			}
			const darkFile = filesByOwnerTheme.get(`${challengeId}\ndark`);
			const lightFile = filesByOwnerTheme.get(`${challengeId}\nlight`);
			if (
				!darkFile ||
				!lightFile ||
				binding.darkSourceSha256 !== darkFile.sha256 ||
				binding.lightSourceSha256 !== lightFile.sha256
			) {
				throw new Error(
					`${challengeId} retained-static review source hashes differ from final catalogue bytes.`
				);
			}
			for (const theme of THEMES) {
				const reviewedFile = resolveAuditAssetFile(
					repositoryRoot,
					binding[`${theme}ReviewPath`],
					`${challengeId} retained-static ${theme} review copy`
				);
				if (sha256(readFileSync(reviewedFile.absolute)) !== binding[`${theme}SourceSha256`]) {
					throw new Error(
						`${challengeId} ${theme} review copy differs from its final authored-static source.`
					);
				}
			}
			if (
				review.accepted !== true ||
				!['accept', 'retain-with-annotation'].includes(review.disposition) ||
				review.issues.some((issue) => issue.severity === 'major')
			) {
				throw new Error(
					`${challengeId} has a major retained-static defect and requires fresh regeneration.`
				);
			}
			return {
				challengeId,
				artId: spec.id,
				disposition: review.disposition,
				darkSha256: darkFile.sha256,
				lightSha256: lightFile.sha256,
				annotations: review.issues
					.filter((issue) => issue.severity === 'minor')
					.map(({ category, description, annotation }) => ({
						category,
						description,
						annotation
					}))
			};
		});
	const cleanAcceptedCount = pairs.filter((pair) => pair.disposition === 'accept').length;
	const annotatedAcceptedCount = pairs.filter(
		(pair) => pair.disposition === 'retain-with-annotation'
	).length;
	return {
		required: true,
		status: 'passed',
		reviewedPairCount: pairs.length,
		cleanAcceptedCount,
		annotatedAcceptedCount,
		majorRejectedCount: 0,
		pairs
	};
}

export function fingerprintScienceChallengeCatalogArtFiles({
	repositoryRoot,
	fileRecords,
	batchSize = 64
}) {
	const root = realpathSync(repositoryRoot);
	if (!Array.isArray(fileRecords) || fileRecords.length === 0) {
		throw new Error('Catalog art fingerprint input must be a non-empty file array.');
	}
	if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 256) {
		throw new Error('Catalog art fingerprint batch size must be an integer from 1 to 256.');
	}
	const results = [];
	for (let offset = 0; offset < fileRecords.length; offset += batchSize) {
		const batch = fileRecords.slice(offset, offset + batchSize);
		const resolved = batch.map((record) =>
			resolveAuditAssetFile(root, record.path, `${record.challengeId} ${record.theme} art`)
		);
		const command = [];
		for (const file of resolved) {
			for (const variant of SCIENCE_QUESTION_ART_DHASH_VARIANTS) {
				command.push('(', file.absolute, '-auto-orient', ...variantTransform(variant));
				command.push('-colorspace', 'Gray', '-resize', '9x8!', '-depth', '8', ')');
			}
		}
		command.push('gray:-');
		const pixels = execFileSync('magick', command, {
			cwd: root,
			encoding: null,
			maxBuffer: batch.length * SCIENCE_QUESTION_ART_DHASH_VARIANTS.length * 72 + 1024
		});
		const expectedPixels = batch.length * SCIENCE_QUESTION_ART_DHASH_VARIANTS.length * 72;
		if (pixels.length !== expectedPixels) {
			throw new Error(
				`ImageMagick returned ${pixels.length} grayscale bytes; expected ${expectedPixels}.`
			);
		}
		for (const [index, record] of batch.entries()) {
			const bytes = readFileSync(resolved[index].absolute);
			const dHashes = Object.fromEntries(
				SCIENCE_QUESTION_ART_DHASH_VARIANTS.map((variant, variantIndex) => {
					const fingerprintIndex =
						index * SCIENCE_QUESTION_ART_DHASH_VARIANTS.length + variantIndex;
					const start = fingerprintIndex * 72;
					return [variant, dHashFromGrayPixels(pixels.subarray(start, start + 72))];
				})
			);
			results.push({
				...record,
				sha256: sha256(bytes),
				dHashes
			});
		}
	}
	return results;
}

export function findCatalogArtPerceptualCollisions(
	records,
	threshold = SCIENCE_QUESTION_ART_DHASH_THRESHOLD
) {
	if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) {
		throw new Error('Catalog art perceptual threshold must be an integer from 0 to 64.');
	}
	const collisions = [];
	for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
		for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
			const left = records[leftIndex];
			const right = records[rightIndex];
			if (left.challengeId === right.challengeId) continue;
			const closest = closestFingerprintDistance(left, right);
			if (closest.distance <= threshold) {
				collisions.push({
					leftChallengeId: left.challengeId,
					leftTheme: left.theme,
					rightChallengeId: right.challengeId,
					rightTheme: right.theme,
					distance: closest.distance,
					leftVariant: closest.leftVariant,
					rightVariant: closest.rightVariant
				});
			}
		}
	}
	return collisions;
}

/**
 * Scan only learner-task language. Art briefs, alt text, explanatory metadata and post-answer
 * feedback are deliberately excluded because none of those can make the task depend on a diagram.
 */
export function auditAcceptedFunctionalDiagramRequirements(definitions) {
	const requirements = [];
	for (const definition of definitions) {
		const challengeId = String(definition?.id ?? '');
		for (const taskField of collectLearnerTaskFields(definition)) {
			const classification = classifyFunctionalVisualRequirement(taskField.text);
			if (!classification) continue;
			const tableSupplied =
				taskField.scope === 'opening' &&
				classification.visualKind === 'table' &&
				validQuestionPresentationTable(definition?.questionPresentation?.table);
			const resolved = tableSupplied;
			requirements.push({
				challengeId,
				field: taskField.field,
				visualKind: classification.visualKind,
				requirementKind: classification.requirementKind,
				resolution: resolved ? 'questionPresentation.table' : 'unresolved-external',
				reason: resolved
					? 'The opening task references a table and questionPresentation.table supplies the complete structured evidence.'
					: classification.reason
			});
		}
	}
	requirements.sort((left, right) => {
		const idOrder = left.challengeId.localeCompare(right.challengeId);
		return idOrder || left.field.localeCompare(right.field);
	});
	const resolvedCount = requirements.filter(
		(requirement) => requirement.resolution !== 'unresolved-external'
	).length;
	const unresolvedCount = requirements.length - resolvedCount;
	return {
		scannedDefinitionCount: definitions.length,
		requirementCount: requirements.length,
		resolvedCount,
		unresolvedCount,
		status: unresolvedCount === 0 ? 'passed' : 'failed',
		requirements
	};
}

/**
 * Bind every final primary-art owner to its learner-facing opening question and reject only exact,
 * deterministic authority contradictions. Broader scientific relevance stays with the independent
 * image reviewer, which can distinguish a major semantic failure from a minor retained annotation.
 */
export function auditCatalogQuestionAuthority({
	owners,
	artManifest,
	acceptedDefinitions,
	authoredDefinitions,
	authoredVisuals
}) {
	const definitionById = new Map(
		[...acceptedDefinitions, ...authoredDefinitions].map((definition) => [
			definition.id,
			definition
		])
	);
	const specByChallengeId = new Map(
		(Array.isArray(artManifest?.specs) ? artManifest.specs : []).map((spec) => [
			spec.challengeId,
			spec
		])
	);
	const visualById = new Map(
		(Array.isArray(authoredVisuals) ? authoredVisuals : []).map((entry) => [
			entry.challengeId,
			entry.visual
		])
	);
	const findings = [];
	for (const owner of owners) {
		const definition = definitionById.get(owner.challengeId);
		const issues = [];
		if (!definition || typeof definition.previewQuestion !== 'string') {
			issues.push('No learner-facing opening question is bound to this art owner.');
		}
		let art = null;
		let sourceQuestion = definition?.previewQuestion ?? '';
		if (owner.sourceKind === 'art-manifest') {
			const spec = specByChallengeId.get(owner.challengeId);
			if (!spec) {
				issues.push('No opening art spec is bound to this manifest owner.');
			} else {
				sourceQuestion = spec.question;
				art = spec;
				if (
					normalizeAuthorityText(spec.question) !==
					normalizeAuthorityText(definition?.previewQuestion)
				) {
					issues.push(
						'The art manifest question differs from the current learner-facing opening question.'
					);
				}
			}
		} else {
			const visual = visualById.get(owner.challengeId);
			const altText = visual?.cardArt?.alt;
			if (typeof altText !== 'string' || !altText.trim()) {
				issues.push('The retained authored pair has no reviewable card-art description.');
			} else {
				art = {
					scene: altText,
					visualAnchor: altText,
					altText,
					accuracyConstraints: []
				};
			}
		}
		if (art && sourceQuestion) {
			const authority = auditQuestionArtAuthority({ question: sourceQuestion, art });
			issues.push(...authority.issues);
		}
		if (issues.length > 0) {
			findings.push({
				challengeId: owner.challengeId,
				ownerKind: owner.ownerKind,
				sourceKind: owner.sourceKind,
				severity: 'major',
				disposition: 'fresh-regenerate',
				questionSha256: sha256(sourceQuestion),
				artAuthoritySha256: canonicalHash(art),
				issues
			});
		}
	}
	return {
		scannedOwnerCount: owners.length,
		majorMismatchCount: findings.length,
		status: findings.length === 0 ? 'passed' : 'failed',
		findings
	};
}

function normalizeAuthorityText(value) {
	return String(value ?? '')
		.replace(/\s+/gu, ' ')
		.trim();
}

export function validateScienceChallengeCatalogArtAudit(
	audit,
	{ expectations = SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS, requirePassed = true } = {}
) {
	const expected = normalizeExpectations(expectations);
	const issues = [];
	if (!isRecord(audit)) return failed(['Catalog art audit must be an object.']);
	if (audit.schemaVersion !== SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_SCHEMA}.`);
	}
	if (audit.releaseId !== expected.releaseId) {
		issues.push(`releaseId must be ${expected.releaseId}.`);
	}
	if (!isRecord(audit.counts)) {
		issues.push('counts must be an object.');
	} else {
		for (const [field, count] of [
			['acceptedChallengeDefinitions', expected.acceptedChallengeCount],
			['authoredChallengeDefinitions', expected.authoredChallengeCount],
			['acceptedNewOwners', expected.acceptedNewOwnerCount],
			['existingReplacementOwners', expected.existingReplacementOwnerCount],
			['retainedStaticOwners', expected.retainedStaticOwnerCount],
			['primaryOwnerRecords', expected.finalOwnerCount],
			['primaryPairRecords', expected.finalOwnerCount],
			['fileRecords', expected.finalFileCount]
		]) {
			if (audit.counts[field] !== count) issues.push(`counts.${field} must be ${count}.`);
		}
	}
	if (!Array.isArray(audit.owners) || audit.owners.length !== expected.finalOwnerCount) {
		issues.push(`owners must contain exactly ${expected.finalOwnerCount} rows.`);
	}
	if (!Array.isArray(audit.files) || audit.files.length !== expected.finalFileCount) {
		issues.push(`files must contain exactly ${expected.finalFileCount} rows.`);
	}
	if (
		!isRecord(audit.inputs) ||
		!isRecord(audit.inputs.acceptedSubset) ||
		!isRecord(audit.inputs.artManifest) ||
		!isRecord(audit.inputs.authoredCatalog) ||
		(expected.requireRetainedStaticReview && !isRecord(audit.inputs.retainedStaticReview))
	) {
		issues.push(
			'inputs must contain acceptedSubset, artManifest, authoredCatalog and required retained-static review records.'
		);
	} else {
		const acceptedInput = audit.inputs.acceptedSubset;
		const manifestInput = audit.inputs.artManifest;
		const authoredInput = audit.inputs.authoredCatalog;
		if (
			!validSanitizedRepoPath(acceptedInput.path) ||
			!SHA256.test(String(acceptedInput.canonicalSha256 ?? '')) ||
			acceptedInput.challengeEntriesSha256 !== expected.acceptedChallengeEntriesSha256 ||
			!SHA256.test(String(acceptedInput.definitionsSha256 ?? ''))
		) {
			issues.push('inputs.acceptedSubset does not identify the exact accepted challenge evidence.');
		}
		if (
			!validSanitizedRepoPath(manifestInput.path) ||
			manifestInput.canonicalSha256 !== expected.artManifestSha256 ||
			!SHA256.test(String(manifestInput.ownerRecordsSha256 ?? '')) ||
			!SHA256.test(String(manifestInput.fileRecordsSha256 ?? ''))
		) {
			issues.push('inputs.artManifest does not identify the exact frozen art manifest.');
		}
		if (
			authoredInput.definitionsSha256 !== expected.authoredDefinitionsSha256 ||
			!SHA256.test(String(authoredInput.visualProjectionSha256 ?? ''))
		) {
			issues.push('inputs.authoredCatalog does not identify the exact Vite-authored catalog.');
		}
		if (expected.requireRetainedStaticReview) {
			const retainedInput = audit.inputs.retainedStaticReview;
			if (
				!validSanitizedRepoPath(retainedInput.manifestPath) ||
				!SHA256.test(String(retainedInput.manifestSha256 ?? '')) ||
				!validSanitizedRepoPath(retainedInput.reviewPath) ||
				!SHA256.test(String(retainedInput.reviewSha256 ?? ''))
			) {
				issues.push('inputs.retainedStaticReview does not identify a complete byte-bound review.');
			}
		} else if (audit.inputs.retainedStaticReview !== null) {
			issues.push('inputs.retainedStaticReview must be null when the test fixture disables it.');
		}
	}
	if (!isRecord(audit.hashes)) {
		issues.push('hashes must be an object.');
	} else {
		for (const field of [
			'acceptedChallengeIdsSha256',
			'acceptedChallengeSortedIdsSha256',
			'authoredChallengeIdsSha256',
			'finalOwnerIdsSha256',
			'ownerRecordsSha256',
			'fileRecordsSha256',
			'imageInventorySha256',
			'functionalDiagramRequirementsSha256',
			'questionAuthorityFindingsSha256',
			'retainedStaticReviewPairsSha256'
		]) {
			if (!SHA256.test(String(audit.hashes[field] ?? ''))) {
				issues.push(`hashes.${field} must be SHA-256.`);
			}
		}
		if (audit.hashes.acceptedChallengeIdsSha256 !== expected.acceptedChallengeIdsSha256) {
			issues.push('hashes.acceptedChallengeIdsSha256 does not match the exact accepted order.');
		}
		if (
			audit.hashes.acceptedChallengeSortedIdsSha256 !== expected.acceptedChallengeSortedIdsSha256
		) {
			issues.push(
				'hashes.acceptedChallengeSortedIdsSha256 does not match the exact accepted ID set.'
			);
		}
	}
	if (
		!isRecord(audit.policy) ||
		audit.policy.pairPolicy !== 'one-primary-light-dark-pair-per-challenge' ||
		audit.policy.semanticReviewPolicy !==
			'question-authoritative-major-fresh-regeneration-minor-retain-with-annotation'
	) {
		issues.push('policy does not bind the question-authoritative major/minor review contract.');
	}
	if (issues.length) return failed(issues);

	const owners = audit.owners;
	const files = audit.files;
	const ownerById = new Map();
	const artIdOwner = new Map();
	const ownedPaths = new Map();
	const ownerKindCounts = Object.fromEntries(FINAL_OWNER_KINDS.map((ownerKind) => [ownerKind, 0]));
	for (const owner of owners) {
		if (
			!isRecord(owner) ||
			!SAFE_ID.test(String(owner.challengeId ?? '')) ||
			!SAFE_ID.test(String(owner.artId ?? '')) ||
			!FINAL_OWNER_KINDS.includes(owner.ownerKind) ||
			!['art-manifest', 'vite-authored-static'].includes(owner.sourceKind) ||
			!SHA256.test(String(owner.sourceBindingSha256 ?? ''))
		) {
			issues.push(`Owner row is malformed: ${String(owner?.challengeId)}.`);
			continue;
		}
		const expectedSourceKind =
			owner.ownerKind === 'authored-static' ? 'vite-authored-static' : 'art-manifest';
		if (owner.sourceKind !== expectedSourceKind) {
			issues.push(`${owner.challengeId} has an invalid source for ${owner.ownerKind}.`);
		}
		ownerKindCounts[owner.ownerKind] += 1;
		if (ownerById.has(owner.challengeId)) {
			issues.push(`Owner id is duplicated: ${owner.challengeId}.`);
		}
		ownerById.set(owner.challengeId, owner);
		const priorArtOwner = artIdOwner.get(owner.artId);
		if (priorArtOwner && priorArtOwner !== owner.challengeId) {
			issues.push(`Art id ${owner.artId} is reused across challenge owners.`);
		}
		artIdOwner.set(owner.artId, owner.challengeId);
		for (const theme of THEMES) {
			const ownerPath = owner[`${theme}Path`];
			if (!validSanitizedRepoPath(ownerPath) || ownerPath === owner[`${opposite(theme)}Path`]) {
				issues.push(`${owner.challengeId} does not own one distinct sanitized pair.`);
			}
			const priorPathOwner = ownedPaths.get(ownerPath);
			if (priorPathOwner && priorPathOwner !== owner.challengeId) {
				issues.push(`${ownerPath} is reused across ${priorPathOwner} and ${owner.challengeId}.`);
			}
			ownedPaths.set(ownerPath, owner.challengeId);
		}
	}
	const sortedOwnerIds = [...ownerById.keys()].sort((left, right) => left.localeCompare(right));
	if (canonicalHash(owners.map((owner) => owner.challengeId)) !== canonicalHash(sortedOwnerIds)) {
		issues.push('owners must be ordered by unique challengeId.');
	}
	for (const [ownerKind, expectedCount, countField] of [
		['accepted-new', expected.acceptedNewOwnerCount, 'acceptedNewOwners'],
		[
			'existing-expansion-replacement',
			expected.existingReplacementOwnerCount,
			'existingReplacementOwners'
		],
		['authored-static', expected.retainedStaticOwnerCount, 'retainedStaticOwners']
	]) {
		if (
			ownerKindCounts[ownerKind] !== expectedCount ||
			audit.counts[countField] !== ownerKindCounts[ownerKind]
		) {
			issues.push(
				`owners contain ${ownerKindCounts[ownerKind]} ${ownerKind} rows; expected ${expectedCount}.`
			);
		}
	}

	const filesByOwner = new Map();
	const fileIds = new Set();
	for (const file of files) {
		if (
			!isRecord(file) ||
			!SAFE_ID.test(String(file.challengeId ?? '')) ||
			!SAFE_ID.test(String(file.artId ?? '')) ||
			!THEMES.includes(file.theme) ||
			!FINAL_OWNER_KINDS.includes(file.ownerKind) ||
			!validSanitizedRepoPath(file.path) ||
			!SHA256.test(String(file.sha256 ?? '')) ||
			!validDHashes(file.dHashes)
		) {
			issues.push(`File row is malformed: ${String(file?.id)}.`);
			continue;
		}
		if (fileIds.has(file.id)) issues.push(`File id is duplicated: ${file.id}.`);
		fileIds.add(file.id);
		const owner = ownerById.get(file.challengeId);
		if (
			!owner ||
			owner.artId !== file.artId ||
			owner.ownerKind !== file.ownerKind ||
			owner[`${file.theme}Path`] !== file.path
		) {
			issues.push(`${file.id} differs from its owner pair.`);
		}
		const ownerFiles = filesByOwner.get(file.challengeId) ?? [];
		ownerFiles.push(file);
		filesByOwner.set(file.challengeId, ownerFiles);
	}
	for (const owner of owners) {
		const ownerFiles = filesByOwner.get(owner.challengeId) ?? [];
		if (
			ownerFiles.length !== 2 ||
			!THEMES.every(
				(theme) =>
					ownerFiles.filter((file) => file.theme === theme && file.artId === owner.artId).length ===
					1
			)
		) {
			issues.push(`${owner.challengeId} must have exactly one light and one dark file record.`);
		}
	}

	if (
		audit.hashes.finalOwnerIdsSha256 !== canonicalHash(owners.map((owner) => owner.challengeId))
	) {
		issues.push('hashes.finalOwnerIdsSha256 differs from owners.');
	}
	if (audit.hashes.ownerRecordsSha256 !== canonicalHash(owners)) {
		issues.push('hashes.ownerRecordsSha256 differs from owners.');
	}
	if (audit.hashes.fileRecordsSha256 !== canonicalHash(files)) {
		issues.push('hashes.fileRecordsSha256 differs from files.');
	}
	const imageInventory = files.map(
		({ challengeId, artId, theme, sha256: fileSha256, dHashes }) => ({
			challengeId,
			artId,
			theme,
			sha256: fileSha256,
			dHashes
		})
	);
	if (audit.hashes.imageInventorySha256 !== canonicalHash(imageInventory)) {
		issues.push('hashes.imageInventorySha256 differs from files.');
	}

	let collisions = [];
	try {
		collisions = findCatalogArtPerceptualCollisions(files);
	} catch (error) {
		issues.push(
			`Perceptual records are invalid: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	if (
		!isRecord(audit.perceptualAudit) ||
		audit.perceptualAudit.algorithm !== SCIENCE_QUESTION_ART_DHASH_ALGORITHM ||
		audit.perceptualAudit.threshold !== SCIENCE_QUESTION_ART_DHASH_THRESHOLD ||
		canonicalHash(audit.perceptualAudit.variants) !==
			canonicalHash(SCIENCE_QUESTION_ART_DHASH_VARIANTS) ||
		audit.perceptualAudit.collisionCount !== collisions.length ||
		canonicalHash(audit.perceptualAudit.collisions) !== canonicalHash(collisions)
	) {
		issues.push('perceptualAudit differs from the recorded multi-transform dHashes.');
	}

	const diagram = audit.functionalDiagramAudit;
	let diagramRequirementCount = 0;
	let diagramResolvedCount = 0;
	let diagramUnresolvedCount = 0;
	if (
		!isRecord(diagram) ||
		!Array.isArray(diagram.requirements) ||
		diagram.scannedDefinitionCount !== expected.acceptedChallengeCount
	) {
		issues.push('functionalDiagramAudit counts or status are invalid.');
	} else {
		diagramRequirementCount = diagram.requirements.length;
		for (const requirement of diagram.requirements) {
			if (
				!isRecord(requirement) ||
				!SAFE_ID.test(String(requirement.challengeId ?? '')) ||
				typeof requirement.field !== 'string' ||
				!requirement.field ||
				![
					'circuit-diagram',
					'micrograph',
					'diagram',
					'graph',
					'chart',
					'image',
					'apparatus',
					'map',
					'drawing',
					'sketch',
					'table',
					'source'
				].includes(requirement.visualKind) ||
				!['functional-drawing-request', 'external-visual-reference'].includes(
					requirement.requirementKind
				) ||
				!['questionPresentation.table', 'unresolved-external'].includes(requirement.resolution) ||
				typeof requirement.reason !== 'string' ||
				!requirement.reason.trim()
			) {
				issues.push(
					`Functional diagram requirement is malformed: ${String(requirement?.challengeId)}.`
				);
				continue;
			}
			if (
				requirement.resolution === 'questionPresentation.table' &&
				(requirement.visualKind !== 'table' ||
					requirement.requirementKind !== 'external-visual-reference')
			) {
				issues.push(`${requirement.challengeId} has an invalid functional diagram resolution.`);
			}
			if (requirement.resolution === 'unresolved-external') {
				diagramUnresolvedCount += 1;
			} else {
				diagramResolvedCount += 1;
			}
		}
		const expectedDiagramStatus = diagramUnresolvedCount === 0 ? 'passed' : 'failed';
		if (
			diagram.requirementCount !== diagramRequirementCount ||
			diagram.resolvedCount !== diagramResolvedCount ||
			diagram.unresolvedCount !== diagramUnresolvedCount ||
			diagram.status !== expectedDiagramStatus
		) {
			issues.push('functionalDiagramAudit counts or status are invalid.');
		}
		if (audit.hashes.functionalDiagramRequirementsSha256 !== canonicalHash(diagram.requirements)) {
			issues.push('functional diagram requirement hash differs from its records.');
		}
	}

	if (audit.counts.perceptualCollisions !== collisions.length) {
		issues.push('counts.perceptualCollisions differs from the recomputed collisions.');
	}
	if (audit.counts.functionalDiagramRequirements !== diagramRequirementCount) {
		issues.push('counts.functionalDiagramRequirements differs from functionalDiagramAudit.');
	}
	if (audit.counts.unresolvedFunctionalDiagramRequirements !== diagramUnresolvedCount) {
		issues.push(
			'counts.unresolvedFunctionalDiagramRequirements differs from functionalDiagramAudit.'
		);
	}
	const authority = audit.questionAuthorityAudit;
	let authorityMismatchCount = 0;
	if (
		!isRecord(authority) ||
		!Array.isArray(authority.findings) ||
		authority.scannedOwnerCount !== expected.finalOwnerCount
	) {
		issues.push('questionAuthorityAudit counts or status are invalid.');
	} else {
		authorityMismatchCount = authority.findings.length;
		for (const finding of authority.findings) {
			if (
				!isRecord(finding) ||
				!SAFE_ID.test(String(finding.challengeId ?? '')) ||
				!FINAL_OWNER_KINDS.includes(finding.ownerKind) ||
				!['art-manifest', 'vite-authored-static'].includes(finding.sourceKind) ||
				finding.severity !== 'major' ||
				finding.disposition !== 'fresh-regenerate' ||
				!SHA256.test(String(finding.questionSha256 ?? '')) ||
				!SHA256.test(String(finding.artAuthoritySha256 ?? '')) ||
				!Array.isArray(finding.issues) ||
				finding.issues.length === 0 ||
				finding.issues.some((issue) => typeof issue !== 'string' || !issue.trim())
			) {
				issues.push(`Question-authority finding is malformed: ${String(finding?.challengeId)}.`);
			}
		}
		const expectedAuthorityStatus = authorityMismatchCount === 0 ? 'passed' : 'failed';
		if (
			authority.majorMismatchCount !== authorityMismatchCount ||
			authority.status !== expectedAuthorityStatus
		) {
			issues.push('questionAuthorityAudit counts or status are invalid.');
		}
		if (audit.hashes.questionAuthorityFindingsSha256 !== canonicalHash(authority.findings)) {
			issues.push('question-authority finding hash differs from its records.');
		}
	}
	if (audit.counts.questionAuthorityOwners !== expected.finalOwnerCount) {
		issues.push('counts.questionAuthorityOwners differs from final owner count.');
	}
	if (audit.counts.questionAuthorityMajorMismatches !== authorityMismatchCount) {
		issues.push('counts.questionAuthorityMajorMismatches differs from questionAuthorityAudit.');
	}
	const retainedReview = audit.retainedStaticReviewAudit;
	let retainedReviewPassed = false;
	if (
		!isRecord(retainedReview) ||
		!Array.isArray(retainedReview.pairs) ||
		typeof retainedReview.required !== 'boolean'
	) {
		issues.push('retainedStaticReviewAudit is malformed.');
	} else if (expected.requireRetainedStaticReview) {
		const staticOwnerIds = new Set(
			owners
				.filter((owner) => owner.ownerKind === 'authored-static')
				.map((owner) => owner.challengeId)
		);
		const pairIds = new Set();
		for (const pair of retainedReview.pairs) {
			const owner = ownerById.get(pair?.challengeId);
			const ownerFiles = filesByOwner.get(pair?.challengeId) ?? [];
			const dark = ownerFiles.find((file) => file.theme === 'dark');
			const light = ownerFiles.find((file) => file.theme === 'light');
			if (
				!isRecord(pair) ||
				!SAFE_ID.test(String(pair.challengeId ?? '')) ||
				!SAFE_ID.test(String(pair.artId ?? '')) ||
				pair.artId !== `${pair.challengeId}-opening` ||
				!['accept', 'retain-with-annotation'].includes(pair.disposition) ||
				!SHA256.test(String(pair.darkSha256 ?? '')) ||
				!SHA256.test(String(pair.lightSha256 ?? '')) ||
				!Array.isArray(pair.annotations) ||
				pair.annotations.some(
					(annotation) =>
						!isRecord(annotation) ||
						typeof annotation.category !== 'string' ||
						!annotation.category ||
						typeof annotation.description !== 'string' ||
						!annotation.description.trim() ||
						typeof annotation.annotation !== 'string' ||
						!annotation.annotation.trim()
				) ||
				(pair.disposition === 'accept' && pair.annotations.length !== 0) ||
				(pair.disposition === 'retain-with-annotation' && pair.annotations.length === 0) ||
				!owner ||
				owner.ownerKind !== 'authored-static' ||
				!dark ||
				!light ||
				pair.darkSha256 !== dark.sha256 ||
				pair.lightSha256 !== light.sha256 ||
				pairIds.has(pair.challengeId)
			) {
				issues.push(
					`Retained-static review pair is malformed or stale: ${String(pair?.challengeId)}.`
				);
				continue;
			}
			pairIds.add(pair.challengeId);
		}
		const cleanAcceptedCount = retainedReview.pairs.filter(
			(pair) => pair.disposition === 'accept'
		).length;
		const annotatedAcceptedCount = retainedReview.pairs.filter(
			(pair) => pair.disposition === 'retain-with-annotation'
		).length;
		retainedReviewPassed =
			retainedReview.required === true &&
			retainedReview.status === 'passed' &&
			retainedReview.reviewedPairCount === expected.retainedStaticOwnerCount &&
			retainedReview.pairs.length === expected.retainedStaticOwnerCount &&
			pairIds.size === expected.retainedStaticOwnerCount &&
			[...staticOwnerIds].every((id) => pairIds.has(id)) &&
			retainedReview.cleanAcceptedCount === cleanAcceptedCount &&
			retainedReview.annotatedAcceptedCount === annotatedAcceptedCount &&
			retainedReview.majorRejectedCount === 0;
		if (!retainedReviewPassed) {
			issues.push(
				'retainedStaticReviewAudit must pass every current authored-static pair with zero major defects.'
			);
		}
		if (
			audit.counts.retainedStaticCleanAccepted !== cleanAcceptedCount ||
			audit.counts.retainedStaticAnnotatedAccepted !== annotatedAcceptedCount ||
			audit.counts.retainedStaticMajorRejected !== 0
		) {
			issues.push('retained-static review counts differ from their pair dispositions.');
		}
	} else {
		retainedReviewPassed =
			retainedReview.required === false &&
			retainedReview.status === 'passed' &&
			retainedReview.reviewedPairCount === 0 &&
			retainedReview.cleanAcceptedCount === 0 &&
			retainedReview.annotatedAcceptedCount === 0 &&
			retainedReview.majorRejectedCount === 0 &&
			retainedReview.pairs.length === 0;
		if (!retainedReviewPassed) {
			issues.push('Disabled retainedStaticReviewAudit fixture state is invalid.');
		}
	}
	if (audit.hashes.retainedStaticReviewPairsSha256 !== canonicalHash(retainedReview?.pairs ?? [])) {
		issues.push('retained-static review pair hash differs from its records.');
	}
	const expectedStatus =
		collisions.length === 0 &&
		diagramUnresolvedCount === 0 &&
		authorityMismatchCount === 0 &&
		retainedReviewPassed
			? 'passed'
			: 'failed';
	if (audit.status !== expectedStatus) {
		issues.push(`status must be ${expectedStatus} for the recorded gates.`);
	}
	if (requirePassed && expectedStatus !== 'passed') {
		if (collisions.length) {
			issues.push('Perceptual duplicate gate requires zero cross-challenge collisions.');
		}
		if (diagramUnresolvedCount) {
			issues.push('Functional diagram gate has unresolved externally referenced learner evidence.');
		}
		if (authorityMismatchCount) {
			issues.push(
				'Question-authority gate requires every brief and retained description to match the learner-facing question.'
			);
		}
		if (!retainedReviewPassed) {
			issues.push(
				'Retained-static semantic review gate requires every current pair to be independently accepted or retained only with a minor annotation.'
			);
		}
	}
	findAbsoluteOrUserPaths(audit, 'audit', issues);
	return issues.length ? failed(issues) : passed();
}

export function resolveScienceChallengeCatalogArtAuditOutput(repositoryRoot, outputPath) {
	const root = realpathSync(repositoryRoot);
	const relative = normalizeAuditInputPath(outputPath, 'catalog art audit output');
	if (!relative.endsWith('.json')) {
		throw new Error('Catalog art audit output must be a repo-relative .json path.');
	}
	const absolute = path.resolve(root, relative);
	if (!isInside(root, absolute)) {
		throw new Error('Catalog art audit output must remain inside the repository.');
	}
	return { root, absolute, relative };
}

export function publishScienceChallengeCatalogArtAudit({
	repositoryRoot,
	outputPath,
	audit,
	expectations = SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS
}) {
	const validation = validateScienceChallengeCatalogArtAudit(audit, {
		expectations,
		requirePassed: true
	});
	if (validation.status !== 'passed') {
		throw new Error(`Catalog art audit publication failed:\n${validation.issues.join('\n')}`);
	}
	const output = resolveScienceChallengeCatalogArtAuditOutput(repositoryRoot, outputPath);
	if (existsSync(output.absolute)) {
		throw new Error(`Catalog art audit already exists and is immutable: ${output.relative}`);
	}
	const parent = path.dirname(output.absolute);
	mkdirSync(parent, { recursive: true });
	const realParent = realpathSync(parent);
	if (!isInside(output.root, realParent)) {
		throw new Error('Catalog art audit parent escapes the repository.');
	}
	const temporary = path.join(
		realParent,
		`.${path.basename(output.absolute)}.preparing-${process.pid}-${randomUUID()}`
	);
	let published = false;
	try {
		writeFileSync(temporary, `${stableStringify(audit)}\n`, {
			flag: 'wx',
			mode: 0o644
		});
		linkSync(temporary, output.absolute);
		published = true;
		unlinkSync(temporary);
		const replay = JSON.parse(readFileSync(output.absolute, 'utf8'));
		if (canonicalHash(replay) !== canonicalHash(audit)) {
			throw new Error('Published catalog art audit differs from the prepared audit.');
		}
		return {
			status: 'passed',
			outputPath: output.relative,
			auditSha256: canonicalHash(replay)
		};
	} catch (error) {
		if (existsSync(temporary)) rmSync(temporary, { force: true });
		if (published && existsSync(output.absolute)) rmSync(output.absolute, { force: true });
		throw error;
	}
}

function assertExactAcceptedSubset({
	acceptedSubset,
	acceptedEntries,
	acceptedDefinitions,
	acceptedIds,
	expected
}) {
	if (!isRecord(acceptedSubset) || acceptedSubset.schemaVersion !== expected.acceptedSubsetSchema) {
		throw new Error(`Accepted subset schema must be ${expected.acceptedSubsetSchema}.`);
	}
	if (acceptedSubset.releaseId !== expected.releaseId) {
		throw new Error(`Accepted subset releaseId must be ${expected.releaseId}.`);
	}
	if (acceptedEntries.length !== expected.acceptedChallengeCount) {
		throw new Error(
			`Accepted subset must contain exactly ${expected.acceptedChallengeCount} challenges.`
		);
	}
	if (
		acceptedEntries.some(
			(entry) =>
				!isRecord(entry) ||
				!isRecord(entry.definition) ||
				!SAFE_ID.test(String(entry.definition.id ?? ''))
		)
	) {
		throw new Error('Accepted subset contains a malformed challenge entry.');
	}
	if (new Set(acceptedIds).size !== acceptedIds.length) {
		throw new Error('Accepted subset challenge ids must be unique.');
	}
	assertExpectedHash(
		canonicalHash(acceptedEntries),
		expected.acceptedChallengeEntriesSha256,
		'Accepted challenge entries'
	);
	assertExpectedHash(
		canonicalHash(acceptedIds),
		expected.acceptedChallengeIdsSha256,
		'Accepted challenge id order'
	);
	assertExpectedHash(
		canonicalHash([...acceptedIds].sort((left, right) => left.localeCompare(right))),
		expected.acceptedChallengeSortedIdsSha256,
		'Accepted challenge id set'
	);
	if (acceptedDefinitions.length !== acceptedEntries.length) {
		throw new Error('Accepted subset definitions are incomplete.');
	}
}

function assertExactArtManifest(artManifest, expected) {
	if (!isRecord(artManifest)) throw new Error('Art manifest must be an object.');
	assertExpectedHash(canonicalHash(artManifest), expected.artManifestSha256, 'Art manifest');
	if (expected.requireFrozenArtManifest) {
		const validation = validateScienceChallengeArtCohortManifest(artManifest, {
			expectations: SCIENCE_CHALLENGE_ART_COHORT_EXPECTATIONS
		});
		if (validation.status !== 'passed') {
			throw new Error(
				`Art manifest failed exact cohort validation:\n${validation.issues.join('\n')}`
			);
		}
	}
	if (
		artManifest.releaseId !== expected.releaseId ||
		artManifest.cohort?.pairPolicy !== 'one-pair-per-challenge' ||
		!Array.isArray(artManifest.cohort?.owners) ||
		!Array.isArray(artManifest.cohort?.files) ||
		artManifest.cohort.owners.length !== expected.manifestOwnerCount ||
		artManifest.cohort.files.length !== expected.manifestOwnerCount * 2
	) {
		throw new Error('Art manifest does not contain the exact one-pair owner cohort.');
	}
	const acceptedCount = artManifest.cohort.owners.filter(
		(owner) => owner.ownerKind === 'accepted-new'
	).length;
	const replacementCount = artManifest.cohort.owners.filter(
		(owner) => owner.ownerKind === 'existing-expansion-replacement'
	).length;
	if (
		acceptedCount !== expected.acceptedNewOwnerCount ||
		replacementCount !== expected.existingReplacementOwnerCount ||
		artManifest.cohort.owners.some((owner) => !MANIFEST_OWNER_KINDS.includes(owner.ownerKind))
	) {
		throw new Error('Art manifest owner-kind counts differ from the exact cohort.');
	}
}

function assertExactAuthoredCatalog(authoredDefinitions, authoredVisuals, expected) {
	if (
		!Array.isArray(authoredDefinitions) ||
		authoredDefinitions.length !== expected.authoredChallengeCount
	) {
		throw new Error(
			`Vite authored catalog must contain exactly ${expected.authoredChallengeCount} definitions.`
		);
	}
	const ids = authoredDefinitions.map((definition) => definition?.id);
	if (
		ids.some((id) => !SAFE_ID.test(String(id ?? ''))) ||
		new Set(ids).size !== expected.authoredChallengeCount
	) {
		throw new Error('Vite authored catalog ids are malformed or duplicated.');
	}
	assertExpectedHash(
		canonicalHash(authoredDefinitions),
		expected.authoredDefinitionsSha256,
		'Vite authored definitions'
	);
	if (
		!Array.isArray(authoredVisuals) ||
		authoredVisuals.length !== expected.authoredChallengeCount
	) {
		throw new Error(
			`Vite authored visuals must contain exactly ${expected.authoredChallengeCount} rows.`
		);
	}
	const visualIds = authoredVisuals.map((entry) => entry?.challengeId);
	assertExactSet(ids, visualIds, 'Authored catalog and visual ids differ');
	for (const entry of authoredVisuals) {
		if (!entry.visual?.cardArt) {
			throw new Error(`${entry.challengeId} has no primary authored card art.`);
		}
	}
}

function indexManifestFiles(files) {
	const byOwnerTheme = new Map();
	for (const file of files) {
		const key = `${file.challengeId}\n${file.theme}`;
		if (byOwnerTheme.has(key)) {
			throw new Error(`Art manifest repeats ${file.challengeId} ${file.theme}.`);
		}
		byOwnerTheme.set(key, file);
	}
	return byOwnerTheme;
}

function assertOwnerRecords(owners, expected) {
	if (owners.length !== expected.finalOwnerCount) {
		throw new Error(`Final art ownership must contain exactly ${expected.finalOwnerCount} owners.`);
	}
	const challengeIds = new Set();
	const artIds = new Map();
	const paths = new Map();
	for (const owner of owners) {
		if (challengeIds.has(owner.challengeId)) {
			throw new Error(`Final art owner repeats challenge ${owner.challengeId}.`);
		}
		challengeIds.add(owner.challengeId);
		const priorArtOwner = artIds.get(owner.artId);
		if (priorArtOwner && priorArtOwner !== owner.challengeId) {
			throw new Error(`Art id ${owner.artId} is shared across challenge owners.`);
		}
		artIds.set(owner.artId, owner.challengeId);
		if (owner.darkPath === owner.lightPath) {
			throw new Error(`${owner.challengeId} light and dark art paths must differ.`);
		}
		for (const theme of THEMES) {
			const sourcePath = owner[`${theme}Path`];
			const priorPathOwner = paths.get(sourcePath);
			if (priorPathOwner && priorPathOwner !== owner.challengeId) {
				throw new Error(
					`Art path is reused across ${priorPathOwner} and ${owner.challengeId}: ${sourcePath}.`
				);
			}
			paths.set(sourcePath, owner.challengeId);
		}
	}
}

function assertRequiredStaticMappings(owners, requiredMappings) {
	for (const [challengeId, mapping] of Object.entries(requiredMappings ?? {})) {
		const owner = owners.find((candidate) => candidate.challengeId === challengeId);
		if (
			!owner ||
			owner.ownerKind !== 'authored-static' ||
			owner.darkPath !== mapping.darkPath ||
			owner.lightPath !== mapping.lightPath
		) {
			throw new Error(`${challengeId} does not use its required authored static remap.`);
		}
	}
}

function assertFingerprintedFileRecords(inputs, records, expected) {
	if (!Array.isArray(records) || records.length !== expected.finalFileCount) {
		throw new Error(
			`Fingerprint result must contain exactly ${expected.finalFileCount} file records.`
		);
	}
	for (const [index, input] of inputs.entries()) {
		const record = records[index];
		for (const field of ['id', 'challengeId', 'ownerKind', 'artId', 'theme', 'path']) {
			if (record?.[field] !== input[field]) {
				throw new Error(`Fingerprint result ${index} changed ${field}.`);
			}
		}
		if (!SHA256.test(String(record.sha256 ?? '')) || !validDHashes(record.dHashes)) {
			throw new Error(`Fingerprint result ${record.id} has invalid hashes.`);
		}
	}
}

function extractAcceptedChallengeEntries(acceptedSubset, expected) {
	if (
		!isRecord(acceptedSubset) ||
		acceptedSubset.schemaVersion !== expected.acceptedSubsetSchema ||
		!Array.isArray(acceptedSubset.challenges)
	) {
		throw new Error('Accepted subset must contain a challenges array.');
	}
	return acceptedSubset.challenges;
}

function collectLearnerTaskFields(definition) {
	const fields = [];
	addTaskField(fields, 'previewQuestion', definition?.previewQuestion, 'opening');
	addTaskField(
		fields,
		'questionPresentation.lead',
		definition?.questionPresentation?.lead,
		'opening'
	);
	addTaskField(
		fields,
		'questionPresentation.task',
		definition?.questionPresentation?.task,
		'opening'
	);
	addTaskField(fields, 'staticAnswers.a', definition?.staticAnswers?.a, 'opening');
	addTaskField(fields, 'staticAnswers.b', definition?.staticAnswers?.b, 'opening');
	addTaskField(fields, 'diagnosisPrompt', definition?.diagnosisPrompt, 'opening');
	for (const [index, choice] of (definition?.diagnosisChoices ?? []).entries()) {
		addTaskField(fields, `diagnosisChoices[${index}].text`, choice?.text, 'opening');
	}
	addTaskField(fields, 'repairPrompt', definition?.repairPrompt, 'opening');
	for (const [index, choice] of (definition?.repairChoices ?? []).entries()) {
		addTaskField(fields, `repairChoices[${index}].text`, choice?.text, 'opening');
	}
	addTaskField(fields, 'transferPromptLead', definition?.transferPromptLead, 'transfer');
	for (const [index, choice] of (definition?.transferChoices ?? []).entries()) {
		addTaskField(fields, `transferChoices[${index}].text`, choice?.text, 'transfer');
	}
	return fields;
}

function addTaskField(fields, field, value, scope) {
	if (typeof value === 'string' && value.trim()) {
		fields.push({ field, text: value, scope });
	}
}

function classifyFunctionalVisualRequirement(text) {
	const normalized = text.replace(/\s+/gu, ' ').trim();
	const lower = normalized.toLowerCase();
	const drawingMatch = lower.match(
		/\b(draw|sketch|plot|annotate|label)\s+(?:a|an|the|this|your|one|two|three)\b/u
	);
	if (drawingMatch) {
		return {
			visualKind: drawingMatch[1] === 'plot' ? 'graph' : 'drawing',
			requirementKind: 'functional-drawing-request',
			reason:
				'Learner-facing task asks for a functional drawing, sketch, plot, annotation or label, but the challenge interaction supplies no drawing surface.'
		};
	}
	const visualKind = detectExternallyReferencedVisualKind(lower);
	if (!visualKind) return null;
	return {
		visualKind,
		requirementKind: 'external-visual-reference',
		reason: `Learner-facing task depends on an externally referenced ${visualKind} that is not encoded by questionPresentation.`
	};
}

function detectExternallyReferencedVisualKind(text) {
	const kinds = [
		['circuit-diagram', 'circuit diagram', true],
		['micrograph', 'micrograph', true],
		['diagram', 'diagram', true],
		['graph', 'graph', true],
		['chart', 'chart', true],
		['image', 'image', false],
		['apparatus', 'apparatus', false],
		['map', 'map', true],
		['drawing', 'drawing', true],
		['sketch', 'sketch', true],
		['table', 'table', true],
		['source', 'source', false]
	];
	for (const [visualKind, term, strongStandaloneNoun] of kinds) {
		const escaped = term.replaceAll(' ', '\\s+');
		const patterns = [
			new RegExp(`\\b(?:following|above|below|accompanying)\\s+${escaped}\\b`, 'u'),
			new RegExp(
				`\\b${escaped}\\b.{0,60}\\b(?:shown|displayed|illustrated|pictured|provided|given)\\b`,
				'u'
			),
			new RegExp(
				`\\b(?:shown|displayed|illustrated|pictured|provided|given)\\b.{0,60}\\b${escaped}\\b`,
				'u'
			),
			new RegExp(
				`\\b(?:use|using|study|refer\\s+to|look\\s+at|from)\\s+(?:the|this|following)\\s+${escaped}\\b`,
				'u'
			),
			new RegExp(`\\bwhich\\s+(?:of\\s+the\\s+following\\s+)?${escaped}\\b`, 'u')
		];
		if (strongStandaloneNoun) {
			patterns.push(new RegExp(`\\b(?:the|this)\\s+${escaped}\\b`, 'u'));
		}
		if (patterns.some((pattern) => pattern.test(text))) {
			if (
				visualKind === 'image' &&
				/\bimage\s+(?:size|height|length|diameter|distance|width)\b/u.test(text)
			) {
				continue;
			}
			if (
				visualKind === 'source' &&
				!/\b(?:use|using|study|refer\s+to|look\s+at|from)\s+(?:the|this|following)\s+source(?:\s+(?:extract|material))?\b|\bsource\b.{0,40}\b(?:shown|displayed|provided|given|above|below)\b/u.test(
					text
				)
			) {
				continue;
			}
			return visualKind;
		}
	}
	return null;
}

function validQuestionPresentationTable(table) {
	return (
		isRecord(table) &&
		Array.isArray(table.columns) &&
		table.columns.length === 2 &&
		Array.isArray(table.rows) &&
		table.rows.length > 0
	);
}

function closestFingerprintDistance(left, right) {
	let closest = { distance: 65, leftVariant: null, rightVariant: null };
	for (const leftVariant of SCIENCE_QUESTION_ART_DHASH_VARIANTS) {
		for (const rightVariant of SCIENCE_QUESTION_ART_DHASH_VARIANTS) {
			const distance = hammingDistanceHex(left.dHashes[leftVariant], right.dHashes[rightVariant]);
			if (distance < closest.distance) {
				closest = { distance, leftVariant, rightVariant };
			}
		}
	}
	return closest;
}

function validDHashes(value) {
	return (
		isRecord(value) &&
		Object.keys(value).length === SCIENCE_QUESTION_ART_DHASH_VARIANTS.length &&
		SCIENCE_QUESTION_ART_DHASH_VARIANTS.every((variant) => DHASH.test(String(value[variant] ?? '')))
	);
}

function variantTransform(variant) {
	const transforms = {
		full: [],
		mirror: ['-flop'],
		center90: ['-gravity', 'center', '-crop', '90%x90%+0+0', '+repage'],
		center90Mirror: ['-gravity', 'center', '-crop', '90%x90%+0+0', '+repage', '-flop'],
		center80: ['-gravity', 'center', '-crop', '80%x80%+0+0', '+repage'],
		center80Mirror: ['-gravity', 'center', '-crop', '80%x80%+0+0', '+repage', '-flop']
	};
	if (!(variant in transforms)) throw new Error(`Unknown perceptual hash variant ${variant}.`);
	return transforms[variant];
}

function staticArtSourceToRepoPath(source, label) {
	const normalized = normalizeWebArtSource(source, label);
	if (!normalized.startsWith('/')) {
		throw new Error(`${label} must resolve to a root-relative static asset.`);
	}
	return normalizeManifestLocalPath(`static${normalized}`, label);
}

function normalizeWebArtSource(source, label) {
	if (typeof source !== 'string' || !source.trim()) {
		throw new Error(`${label} must be a non-empty path.`);
	}
	const normalized = source.trim().split(/[?#]/u, 1)[0];
	if (
		!normalized ||
		normalized.includes('\\') ||
		normalized.includes('://') ||
		normalized.startsWith('//') ||
		normalized.split('/').some((segment) => segment === '.' || segment === '..')
	) {
		throw new Error(`${label} is not a safe static source.`);
	}
	return normalized;
}

function normalizeManifestLocalPath(source, label) {
	if (typeof source !== 'string') throw new Error(`${label} must be a path.`);
	const normalized = source.trim().split(/[?#]/u, 1)[0];
	if (!validSanitizedRepoPath(normalized)) {
		throw new Error(`${label} must be a sanitized repo-relative path.`);
	}
	return normalized;
}

function normalizeAuditInputPath(source, label) {
	return normalizeManifestLocalPath(source, label);
}

function validSanitizedRepoPath(value) {
	if (
		typeof value !== 'string' ||
		!value ||
		value.startsWith('/') ||
		path.isAbsolute(value) ||
		WINDOWS_ABSOLUTE.test(value) ||
		value.startsWith('file://') ||
		value.includes('\\') ||
		USER_PATH_FRAGMENT.test(value)
	) {
		return false;
	}
	const segments = value.split('/');
	return !segments.some((segment) => !segment || segment === '.' || segment === '..');
}

function resolveAuditAssetFile(root, relativePath, label) {
	if (!validSanitizedRepoPath(relativePath)) {
		throw new Error(`${label} path must be a sanitized repo-relative path.`);
	}
	const absolute = path.resolve(root, relativePath);
	if (!isInside(root, absolute) || !existsSync(absolute)) {
		throw new Error(`${label} is missing: ${relativePath}`);
	}
	const metadata = lstatSync(absolute);
	if (!metadata.isFile() || metadata.isSymbolicLink()) {
		throw new Error(`${label} must be a regular non-symlink file: ${relativePath}`);
	}
	const real = realpathSync(absolute);
	if (!isInside(root, real)) throw new Error(`${label} resolves outside the repository.`);
	return { absolute: real, relative: relativePath };
}

function uniqueIndex(rows, key, label) {
	if (!Array.isArray(rows)) throw new Error(`${label} rows must be an array.`);
	const index = new Map();
	for (const row of rows) {
		const value = row?.[key];
		if (typeof value !== 'string' || !value || index.has(value)) {
			throw new Error(`${label} rows contain a missing or duplicate ${key}.`);
		}
		index.set(value, row);
	}
	return index;
}

function assertExactSet(left, right, message) {
	if (
		left.length !== right.length ||
		new Set(left).size !== left.length ||
		new Set(right).size !== right.length
	) {
		throw new Error(`${message}: counts or uniqueness differ.`);
	}
	const rightSet = new Set(right);
	if (left.some((id) => !rightSet.has(id))) throw new Error(`${message}.`);
}

function assertExpectedHash(actual, expected, label) {
	if (typeof expected === 'string' && actual !== expected) {
		throw new Error(`${label} canonical SHA-256 is not the exact expected value.`);
	}
}

function normalizeExpectations(expectations) {
	const hasRequiredMappings =
		expectations && Object.prototype.hasOwnProperty.call(expectations, 'requiredStaticMappings');
	return {
		...SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS,
		...expectations,
		requiredStaticMappings: hasRequiredMappings
			? { ...(expectations.requiredStaticMappings ?? {}) }
			: {
					...SCIENCE_CHALLENGE_CATALOG_ART_AUDIT_EXPECTATIONS.requiredStaticMappings
				}
	};
}

function findAbsoluteOrUserPaths(value, location, issues) {
	if (typeof value === 'string') {
		if (
			value.startsWith('/') ||
			WINDOWS_ABSOLUTE.test(value) ||
			value.startsWith('file://') ||
			USER_PATH_FRAGMENT.test(value)
		) {
			issues.push(`${location} contains an absolute or user-specific path.`);
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			findAbsoluteOrUserPaths(entry, `${location}[${index}]`, issues);
		}
		return;
	}
	if (isRecord(value)) {
		for (const [key, entry] of Object.entries(value)) {
			findAbsoluteOrUserPaths(entry, `${location}.${key}`, issues);
		}
	}
}

function opposite(theme) {
	return theme === 'dark' ? 'light' : 'dark';
}

function isInside(root, candidate) {
	return candidate.startsWith(`${root}${path.sep}`) && candidate !== root;
}

function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function passed() {
	return { status: 'passed', issues: [] };
}

function failed(issues) {
	return { status: 'failed', issues };
}
