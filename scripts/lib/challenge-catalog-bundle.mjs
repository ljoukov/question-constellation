import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const CHALLENGE_CATALOG_BUNDLE_SCHEMA = 'challenge-catalog-bundle/v2';
export const CHALLENGE_CATALOG_SOURCE_SCHEMA = 'challenge-catalog-source/v1';
export const CHALLENGE_CATALOG_DRAFT_SCHEMA = 'challenge-catalog-draft/v1';
export const CHALLENGE_CATALOG_CHANGESET_SCHEMA = 'challenge-catalog-changes/v1';
export const CHALLENGE_CATALOG_ROUTE_SCHEMA = 'challenge-catalog-route/v1';
export const CHALLENGE_CATALOG_INDEX_PATH = '/_challenge-index';
export const CHALLENGE_KS4_SCIENCE_URL =
	'https://www.gov.uk/government/publications/national-curriculum-in-england-science-programmes-of-study/national-curriculum-in-england-science-programmes-of-study#key-stage-4';

const SUBJECTS = Object.freeze(['biology', 'chemistry', 'physics']);
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/u;
const ASSET_TOKEN = /^asset:([a-z0-9][a-z0-9-]*)$/u;

/**
 * Build a release directly from one complete final-state draft. Image references use
 * `asset:<asset-id>` or an exact prior public path and are resolved once into immutable
 * release-scoped R2 URLs.
 */
export function createChallengeCatalogBundle({ rootDir, draft }) {
	if (!path.isAbsolute(rootDir)) throw new Error('rootDir must be absolute.');
	validateDraft(draft);
	return finalizeBundle({
		rootDir,
		releaseId: draft.releaseId,
		subjects: draft.subjects,
		arcs: draft.arcs,
		socialImage: draft.socialImage,
		assets: draft.assets,
		challenges: draft.challenges,
		sourceEvidence: draft.sourceEvidence ?? {}
	});
}

/**
 * Derive the next release from an exact portable export plus one final-state change set. Changed
 * records are complete canonical replacements; partial record patches are deliberately unsupported.
 */
export function deriveChallengeCatalogBundle({
	rootDir,
	sourceBundle,
	releaseId,
	changeSet,
	changeFileSha256
}) {
	if (!path.isAbsolute(rootDir)) throw new Error('rootDir must be absolute.');
	const sourceValidation = validateChallengeCatalogBundle(sourceBundle, {
		rootDir,
		verifyFiles: true
	});
	assertSafeId(releaseId, 'release id');
	if (releaseId === sourceValidation.releaseId) {
		throw new Error('Derived catalogue release id must differ from its source release.');
	}
	validateChangeSet(changeSet, sourceBundle);
	if (!HASH.test(String(changeFileSha256 ?? ''))) {
		throw new Error('Change-set file hash must be a SHA-256 hash.');
	}

	const removedChallengeIds = new Set(changeSet.removeChallengeIds ?? []);
	const removedAssetIds = new Set(changeSet.removeAssetIds ?? []);
	const assetsById = new Map(
		sourceBundle.assets
			.filter(
				(asset) =>
					!removedAssetIds.has(asset.id) &&
					!(asset.challengeId && removedChallengeIds.has(asset.challengeId))
			)
			.map((asset) => [asset.id, structuredClone(asset)])
	);
	for (const asset of changeSet.assetUpserts ?? []) {
		assetsById.set(asset.id, structuredClone(asset));
	}

	const recordsById = new Map(
		sourceBundle.challenges
			.filter((record) => !removedChallengeIds.has(record.definition.id))
			.map((record) => [record.definition.id, structuredClone(record)])
	);
	for (const record of changeSet.recordUpserts ?? []) {
		recordsById.set(record.definition.id, structuredClone(record));
	}

	return finalizeBundle({
		rootDir,
		releaseId,
		subjects: changeSet.subjects ?? sourceBundle.subjects,
		arcs: changeSet.arcs ?? sourceBundle.arcs,
		socialImage: changeSet.socialImage ?? sourceBundle.socialImage,
		assets: [...assetsById.values()],
		challenges: [...recordsById.values()],
		sourceEvidence: {
			...sourceBundle.release.sourceEvidence,
			catalogueChange: {
				sourceReleaseId: sourceValidation.releaseId,
				sourceContentSha256: sourceValidation.contentSha256,
				changeSchemaVersion: changeSet.schemaVersion,
				changeContentSha256: canonicalHash(changeSet),
				changeFileSha256
			}
		}
	});
}

export function validateChallengeCatalogBundle(
	bundle,
	{ rootDir = process.cwd(), verifyFiles = false } = {}
) {
	if (!isRecord(bundle) || bundle.schemaVersion !== CHALLENGE_CATALOG_BUNDLE_SCHEMA) {
		throw new Error(`Expected ${CHALLENGE_CATALOG_BUNDLE_SCHEMA}.`);
	}
	if (!isRecord(bundle.release))
		throw new Error('Challenge catalogue release metadata is missing.');
	assertSafeId(bundle.release.id, 'release id');
	for (const field of ['assets', 'challenges', 'routes', 'subjects', 'arcs']) {
		if (!Array.isArray(bundle[field])) throw new Error(`${field} must be an array.`);
	}
	if (bundle.challenges.length === 0) throw new Error('Challenge catalogue bundle is empty.');
	if (
		bundle.release.challengeCount !== bundle.challenges.length ||
		bundle.release.assetCount !== bundle.assets.length ||
		bundle.release.routePayloadCount !== bundle.routes.length
	) {
		throw new Error('Challenge catalogue release counts differ from bundle membership.');
	}

	const challengeIds = bundle.challenges.map((record) => record?.definition?.id);
	const challengeRoutes = bundle.challenges.map(
		(record) => `${record?.definition?.subject}/${record?.definition?.slug}`
	);
	assertUnique(challengeIds, 'challenge ids');
	assertUnique(challengeRoutes, 'challenge routes');
	assertUnique(
		bundle.assets.map((asset) => asset?.id),
		'asset ids'
	);
	assertUnique(
		bundle.assets.map((asset) => asset?.r2Key),
		'R2 keys'
	);
	assertUnique(
		bundle.routes.map((route) => route?.path),
		'route payload paths'
	);

	const challengeIdSet = new Set(challengeIds);
	const assetPublicPaths = new Set();
	for (const [index, record] of bundle.challenges.entries()) {
		validateRecord(record, index);
	}
	for (const asset of bundle.assets) {
		validateAsset(asset, bundle.release.id);
		if (asset.challengeId !== null && !challengeIdSet.has(asset.challengeId)) {
			throw new Error(`Asset ${asset.id} belongs to unknown challenge ${asset.challengeId}.`);
		}
		assetPublicPaths.add(asset.publicPath);
		if (!verifyFiles) continue;
		const absolutePath = path.resolve(rootDir, asset.localPath);
		if (!isWithin(rootDir, absolutePath) || !existsSync(absolutePath)) {
			throw new Error(`Bundle asset is missing or outside the workspace: ${asset.localPath}`);
		}
		if (
			statSync(absolutePath).size !== asset.size ||
			sha256(readFileSync(absolutePath)) !== asset.sha256
		) {
			throw new Error(`Bundle asset bytes differ from their binding: ${asset.localPath}`);
		}
	}
	for (const publicPath of collectPublicAssetPaths({
		challenges: bundle.challenges,
		subjects: bundle.subjects,
		arcs: bundle.arcs,
		socialImage: bundle.socialImage
	})) {
		if (!assetPublicPaths.has(publicPath)) {
			throw new Error(`Catalogue content references an unknown R2 asset: ${publicPath}`);
		}
	}

	const expectedRoutes = buildChallengeCatalogRoutePayloads({
		releaseId: bundle.release.id,
		records: bundle.challenges,
		subjects: bundle.subjects,
		arcs: bundle.arcs,
		socialImage: bundle.socialImage
	});
	if (canonicalHash(bundle.routes) !== canonicalHash(expectedRoutes)) {
		throw new Error('Denormalized route payloads differ from the canonical catalogue records.');
	}
	for (const route of bundle.routes) {
		const payloadJson = stableStringify(route.payload);
		if (
			route.payload.releaseId !== bundle.release.id ||
			route.payloadSha256 !== sha256(payloadJson) ||
			route.payloadBytes !== Buffer.byteLength(payloadJson)
		) {
			throw new Error(`Route payload binding is invalid: ${route.path}`);
		}
	}

	const subjectCounts = countBySubject(bundle.challenges.map((record) => record.definition));
	assertExactCounts(subjectCounts, bundle.release.subjectCounts, 'release metadata');
	const unsigned = {
		schemaVersion: bundle.schemaVersion,
		release: { ...bundle.release },
		subjects: bundle.subjects,
		arcs: bundle.arcs,
		socialImage: bundle.socialImage,
		assets: bundle.assets,
		challenges: bundle.challenges,
		routes: bundle.routes
	};
	delete unsigned.release.contentSha256;
	const contentSha256 = canonicalHash(durableBundleContent(unsigned));
	if (
		!HASH.test(String(bundle.contentSha256 ?? '')) ||
		bundle.contentSha256 !== contentSha256 ||
		bundle.release.contentSha256 !== contentSha256
	) {
		throw new Error('Challenge catalogue bundle content hash is invalid.');
	}
	return {
		releaseId: bundle.release.id,
		contentSha256,
		challengeCount: bundle.challenges.length,
		assetCount: bundle.assets.length,
		routePayloadCount: bundle.routes.length,
		subjectCounts,
		bytes: bundle.assets.reduce((total, asset) => total + asset.size, 0)
	};
}

export function buildChallengeCatalogRoutePayloads({
	releaseId,
	records,
	subjects,
	arcs,
	socialImage
}) {
	const previews = records.map((record) => record.preview);
	const allIds = records.map((record) => record.definition.id);
	const nextChallenges = records.map((record) => record.next);
	const bySubject = new Map(
		SUBJECTS.map((subject) => [
			subject,
			records.filter((record) => record.definition.subject === subject)
		])
	);
	const subjectGroups = subjects.map((subjectDefinition) => {
		const entries = bySubject.get(subjectDefinition.subject) ?? [];
		const hero =
			entries.find((record) => record.definition.slug === subjectDefinition.heroSlug) ?? entries[0];
		return {
			subject: subjectDefinition.subject,
			label: subjectDefinition.label,
			challengeIds: entries.map((record) => record.definition.id),
			cardArt: hero?.preview.cardArt ?? null
		};
	});
	const featured = records[0];
	const hubCurriculumLinks = uniqueLinks(
		SUBJECTS.map(
			(subject) =>
				(bySubject.get(subject) ?? []).find(
					(record) => record.curriculumCatalogLink ?? record.curriculumCitation
				)?.curriculumCatalogLink ?? (bySubject.get(subject) ?? [])[0]?.curriculumCitation
		)
	);
	const latestReviewed = records
		.map((record) => record.definition.lastReviewed)
		.filter(Boolean)
		.sort()
		.at(-1);
	const sitemapEntries = [
		{
			path: '/challenges',
			priority: '0.92',
			changefreq: 'weekly',
			lastmod: latestReviewed
		},
		...subjects.map((subject) => ({
			path: `/challenges/${subject.subject}`,
			priority: '0.88',
			changefreq: 'weekly',
			lastmod: latestReviewed
		})),
		...records.map((record) => ({
			path: `/challenges/${record.definition.subject}/${record.definition.slug}`,
			priority: '0.82',
			changefreq: 'monthly',
			lastmod: record.definition.lastReviewed
		}))
	];
	const common = {
		schemaVersion: CHALLENGE_CATALOG_ROUTE_SCHEMA,
		releaseId,
		socialImage,
		ks4ScienceUrl: CHALLENGE_KS4_SCIENCE_URL
	};
	const routes = [
		route(CHALLENGE_CATALOG_INDEX_PATH, 'index', {
			...common,
			challengeIds: allIds,
			challenges: previews,
			subjects,
			arcs,
			sitemapEntries,
			latestReviewed
		}),
		route('/challenges', 'hub', {
			...common,
			featuredChallenge: featured.preview,
			challenges: previews,
			subjects: subjectGroups,
			curriculumLinks: hubCurriculumLinks,
			challengeIds: allIds
		})
	];
	for (const subjectDefinition of subjects) {
		const entries = bySubject.get(subjectDefinition.subject) ?? [];
		const hero =
			entries.find((record) => record.definition.slug === subjectDefinition.heroSlug) ?? entries[0];
		routes.push(
			route(`/challenges/${subjectDefinition.subject}`, 'subject', {
				...common,
				subject: {
					subject: subjectDefinition.subject,
					label: subjectDefinition.label,
					description: subjectDefinition.description
				},
				defaultHeroId: hero?.definition.id ?? null,
				challenges: entries.map((record) => record.preview),
				curriculumLinks: uniqueLinks(entries.map((record) => record.curriculumCatalogLink)),
				challengeIds: entries.map((record) => record.definition.id)
			})
		);
	}
	for (const record of records) {
		routes.push(
			route(`/challenges/${record.definition.subject}/${record.definition.slug}`, 'detail', {
				...common,
				challenge: record.publicDefinition,
				chain: record.chain,
				visual: record.visual,
				nextChallenges: nextChallenges.filter((candidate) => candidate.id !== record.definition.id),
				shortRecallPrompt: record.shortRecallPrompt,
				curriculumCitation: record.curriculumCitation,
				challengeIds: allIds
			})
		);
	}
	return routes;
}

function finalizeBundle({
	rootDir,
	releaseId,
	subjects,
	arcs,
	socialImage,
	assets: sourceAssets,
	challenges: sourceChallenges,
	sourceEvidence
}) {
	assertSafeId(releaseId, 'release id');
	if (!Array.isArray(subjects) || !Array.isArray(arcs)) {
		throw new Error('Catalogue subjects and arcs must be arrays.');
	}
	if (!Array.isArray(sourceAssets) || sourceAssets.length === 0) {
		throw new Error('Catalogue draft must contain assets.');
	}
	if (!Array.isArray(sourceChallenges) || sourceChallenges.length === 0) {
		throw new Error('Catalogue draft must contain challenges.');
	}

	const replacements = new Map();
	const assets = sourceAssets.map((sourceAsset) => {
		const asset = normalizeAsset(rootDir, releaseId, sourceAsset);
		if (typeof sourceAsset.publicPath === 'string' && sourceAsset.publicPath) {
			replacements.set(sourceAsset.publicPath, asset.publicPath);
		}
		replacements.set(`asset:${asset.id}`, asset.publicPath);
		return asset;
	});
	assertUnique(
		assets.map((asset) => asset.id),
		'asset ids'
	);

	const challenges = sourceChallenges
		.map((sourceRecord, index) => ({
			index,
			record: replaceExactStrings(structuredClone(sourceRecord), replacements)
		}))
		.sort((left, right) => {
			const leftOrder = Number.isInteger(left.record.displayOrder)
				? left.record.displayOrder
				: Number.MAX_SAFE_INTEGER;
			const rightOrder = Number.isInteger(right.record.displayOrder)
				? right.record.displayOrder
				: Number.MAX_SAFE_INTEGER;
			return leftOrder - rightOrder || left.index - right.index;
		})
		.map(({ record }, displayOrder) => deriveRecordProjections(record, displayOrder));
	const resolvedSubjects = replaceExactStrings(structuredClone(subjects), replacements);
	const resolvedArcs = replaceExactStrings(structuredClone(arcs), replacements);
	const resolvedSocialImage = replaceExactStrings(structuredClone(socialImage), replacements);
	const routes = buildChallengeCatalogRoutePayloads({
		releaseId,
		records: challenges,
		subjects: resolvedSubjects,
		arcs: resolvedArcs,
		socialImage: resolvedSocialImage
	});
	const release = {
		id: releaseId,
		schemaVersion: CHALLENGE_CATALOG_BUNDLE_SCHEMA,
		challengeCount: challenges.length,
		assetCount: assets.length,
		routePayloadCount: routes.length,
		subjectCounts: countBySubject(challenges.map((record) => record.definition)),
		sourceEvidence: canonicalObject(sourceEvidence)
	};
	const unsigned = {
		schemaVersion: CHALLENGE_CATALOG_BUNDLE_SCHEMA,
		release,
		subjects: resolvedSubjects,
		arcs: resolvedArcs,
		socialImage: resolvedSocialImage,
		assets: assets.sort((left, right) => left.id.localeCompare(right.id)),
		challenges,
		routes
	};
	const contentSha256 = canonicalHash(durableBundleContent(unsigned));
	const bundle = {
		...unsigned,
		release: { ...release, contentSha256 },
		contentSha256
	};
	validateChallengeCatalogBundle(bundle, { rootDir, verifyFiles: true });
	return bundle;
}

function validateDraft(value) {
	if (
		!isRecord(value) ||
		value.schemaVersion !== CHALLENGE_CATALOG_DRAFT_SCHEMA ||
		!Array.isArray(value.subjects) ||
		!Array.isArray(value.arcs) ||
		!Array.isArray(value.assets) ||
		!Array.isArray(value.challenges)
	) {
		throw new Error(`Expected one complete ${CHALLENGE_CATALOG_DRAFT_SCHEMA} document.`);
	}
	assertSafeId(value.releaseId, 'release id');
}

function validateChangeSet(value, sourceBundle) {
	const allowedFields = new Set([
		'schemaVersion',
		'sourceReleaseId',
		'sourceContentSha256',
		'recordUpserts',
		'removeChallengeIds',
		'assetUpserts',
		'removeAssetIds',
		'subjects',
		'arcs',
		'socialImage'
	]);
	if (
		!isRecord(value) ||
		value.schemaVersion !== CHALLENGE_CATALOG_CHANGESET_SCHEMA ||
		value.sourceReleaseId !== sourceBundle.release.id ||
		value.sourceContentSha256 !== sourceBundle.contentSha256
	) {
		throw new Error('Challenge catalogue change set is invalid or stale.');
	}
	const unknownFields = Object.keys(value).filter((field) => !allowedFields.has(field));
	if (unknownFields.length > 0) {
		throw new Error(
			`Challenge catalogue change set has unsupported fields: ${unknownFields.join(', ')}.`
		);
	}
	for (const field of [
		'recordUpserts',
		'removeChallengeIds',
		'assetUpserts',
		'removeAssetIds'
	]) {
		if (value[field] !== undefined && !Array.isArray(value[field])) {
			throw new Error(`Challenge catalogue change-set ${field} must be an array.`);
		}
	}
	const sourceIds = new Set(sourceBundle.challenges.map((record) => record.definition.id));
	const upsertIds = (value.recordUpserts ?? []).map((record) => record?.definition?.id);
	if (upsertIds.length) assertUnique(upsertIds, 'record upsert challenge ids');
	const removeChallengeIds = value.removeChallengeIds ?? [];
	if (removeChallengeIds.length) {
		assertUnique(removeChallengeIds, 'removed challenge ids');
		for (const id of removeChallengeIds) {
			if (!sourceIds.has(id)) throw new Error(`Cannot remove unknown challenge ${id}.`);
			if (upsertIds.includes(id)) throw new Error(`Cannot remove and upsert challenge ${id}.`);
		}
	}
	const assetUpsertIds = (value.assetUpserts ?? []).map((asset) => asset?.id);
	if (assetUpsertIds.length) assertUnique(assetUpsertIds, 'asset upsert ids');
	const removeAssetIds = value.removeAssetIds ?? [];
	if (removeAssetIds.length) {
		assertUnique(removeAssetIds, 'removed asset ids');
		const sourceAssetIds = new Set(sourceBundle.assets.map((asset) => asset.id));
		for (const id of removeAssetIds) {
			if (!sourceAssetIds.has(id)) throw new Error(`Cannot remove unknown asset ${id}.`);
			if (assetUpsertIds.includes(id)) throw new Error(`Cannot remove and upsert asset ${id}.`);
		}
	}
	const changeCount =
		upsertIds.length +
		removeChallengeIds.length +
		assetUpsertIds.length +
		removeAssetIds.length +
		Number(value.subjects !== undefined) +
		Number(value.arcs !== undefined) +
		Number(value.socialImage !== undefined);
	if (changeCount === 0) throw new Error('Challenge catalogue change set is empty.');
}

function normalizeAsset(rootDir, releaseId, sourceAsset) {
	for (const field of ['id', 'artId', 'localPath', 'sha256', 'theme']) {
		if (typeof sourceAsset?.[field] !== 'string' || !sourceAsset[field]) {
			throw new Error(`Asset ${sourceAsset?.id ?? '<unknown>'} has invalid ${field}.`);
		}
	}
	assertSafeId(sourceAsset.id, 'asset id');
	assertSafeId(sourceAsset.artId, 'art id');
	const absolutePath = path.resolve(rootDir, sourceAsset.localPath);
	if (!isWithin(rootDir, absolutePath)) {
		throw new Error(`Asset path escapes the workspace: ${sourceAsset.localPath}`);
	}
	const localPath = path.relative(rootDir, absolutePath).replaceAll(path.sep, '/');
	const r2Key = challengeAssetR2Key(releaseId, sourceAsset);
	return {
		id: sourceAsset.id,
		artId: sourceAsset.artId,
		challengeId: sourceAsset.challengeId ?? null,
		role: sourceAsset.role,
		theme: sourceAsset.theme,
		localPath,
		size: sourceAsset.size,
		sha256: sourceAsset.sha256,
		contentType: sourceAsset.contentType ?? 'image/webp',
		cacheControl: sourceAsset.cacheControl ?? 'public, max-age=31536000, immutable',
		r2Key,
		publicPath: `/${r2Key}`,
		reviewDisposition: sourceAsset.reviewDisposition
	};
}

function validateRecord(record, index) {
	if (!isRecord(record) || record.displayOrder !== index || !isRecord(record.definition)) {
		throw new Error(`Challenge record ${index} has invalid display order or definition.`);
	}
	assertSafeId(record.definition.id, 'challenge id');
	assertSafeId(record.definition.slug, 'challenge slug');
	if (!SUBJECTS.includes(record.definition.subject)) {
		throw new Error(
			`${record.definition.id} has invalid subject ${String(record.definition.subject)}.`
		);
	}
	if (
		record.publicDefinition?.id !== record.definition.id ||
		record.preview?.id !== record.definition.id ||
		record.next?.id !== record.definition.id
	) {
		throw new Error(`${record.definition.id} projections do not bind the canonical definition.`);
	}
	if (!record.visual?.cardArt?.src || !record.visual.cardArt.darkSrc) {
		throw new Error(`${record.definition.id} has no primary R2 art pair.`);
	}
	if (
		record.visualReview?.accepted !== true ||
		record.visualReview.disposition === 'fresh-regenerate'
	) {
		throw new Error(`${record.definition.id} has no accepted final visual review.`);
	}
	if (
		record.artAuthority?.spec?.challengeId !== record.definition.id ||
		record.artAuthority.spec.question !== record.definition.previewQuestion ||
		record.artAuthority.review?.accepted !== true
	) {
		throw new Error(`${record.definition.id} has no exact accepted art authority.`);
	}
	if (
		!Array.isArray(record.artAuthority.spec.generationGuards) ||
		record.artAuthority.spec.generationGuards.some(
			(guard) => typeof guard !== 'string' || !guard.trim()
		)
	) {
		throw new Error(`${record.definition.id} has invalid generation guards.`);
	}
}

function validateAsset(asset, releaseId) {
	for (const field of ['id', 'artId', 'localPath', 'sha256', 'r2Key', 'publicPath']) {
		if (typeof asset?.[field] !== 'string' || !asset[field]) {
			throw new Error(`Asset ${asset?.id ?? '<unknown>'} has invalid ${field}.`);
		}
	}
	if (!HASH.test(asset.sha256) || !Number.isInteger(asset.size) || asset.size <= 0) {
		throw new Error(`Asset ${asset.id} has invalid byte binding.`);
	}
	if (
		asset.r2Key !== challengeAssetR2Key(releaseId, asset) ||
		asset.publicPath !== `/${asset.r2Key}`
	) {
		throw new Error(`Asset ${asset.id} has invalid R2 identity.`);
	}
}

function deriveRecordProjections(record, displayOrder) {
	if (!isRecord(record) || !isRecord(record.definition)) {
		throw new Error(`Catalogue record ${displayOrder} has no canonical definition.`);
	}
	const output = structuredClone(record);
	output.displayOrder = displayOrder;
	output.publicDefinition = toPublicDefinition(output.definition);
	output.preview = {
		...toPreview(output.definition),
		cardArt: output.visual?.cardArt ?? output.preview?.cardArt ?? null
	};
	output.next = toNext(output.definition);
	return output;
}

function durableBundleContent(bundle) {
	return {
		...bundle,
		assets: bundle.assets.map(({ localPath: _localPath, ...asset }) => asset)
	};
}

function challengeAssetR2Key(releaseId, asset) {
	return `images/challenges/${releaseId}/${asset.artId}-${asset.theme}-${asset.sha256.slice(0, 16)}.webp`;
}

function route(pathname, kind, payload) {
	const payloadJson = stableStringify(payload);
	return {
		path: pathname,
		kind,
		payload,
		payloadSha256: sha256(payloadJson),
		payloadBytes: Buffer.byteLength(payloadJson)
	};
}

function uniqueLinks(links) {
	return [
		...new Map(
			links
				.filter(
					(link) =>
						link && typeof link.topicLabel === 'string' && typeof link.officialUrl === 'string'
				)
				.map((link) => [`${link.topicLabel}\n${link.officialUrl}`, structuredClone(link)])
		).values()
	];
}

function toPublicDefinition(definition) {
	const output = structuredClone(definition);
	delete output.hook;
	delete output.sourceQuestionId;
	delete output.transferQuestionId;
	return output;
}

function toPreview(definition) {
	return pick(definition, [
		'id',
		'slug',
		'subject',
		'subjectArtTheme',
		'title',
		'topic',
		'hook',
		'marks',
		'previewQuestion'
	]);
}

function toNext(definition) {
	return pick(definition, [
		'id',
		'slug',
		'subject',
		'title',
		'topic',
		'difficulty',
		'arc',
		'marks',
		'estimatedMinutes',
		'mechanic'
	]);
}

function pick(value, fields) {
	return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function replaceExactStrings(value, replacements) {
	if (typeof value === 'string') {
		const token = value.match(ASSET_TOKEN);
		if (token && !replacements.has(value)) {
			throw new Error(`Catalogue content references unknown asset token ${value}.`);
		}
		return replacements.get(value) ?? value;
	}
	if (Array.isArray(value)) return value.map((entry) => replaceExactStrings(entry, replacements));
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [key, replaceExactStrings(entry, replacements)])
	);
}

function collectPublicAssetPaths(value, target = new Set()) {
	if (typeof value === 'string') {
		if (value.startsWith('/images/challenges/')) target.add(value);
		return target;
	}
	if (Array.isArray(value)) {
		for (const entry of value) collectPublicAssetPaths(entry, target);
		return target;
	}
	if (isRecord(value)) {
		for (const entry of Object.values(value)) collectPublicAssetPaths(entry, target);
	}
	return target;
}

function countBySubject(definitions) {
	return Object.fromEntries(
		SUBJECTS.map((subject) => [
			subject,
			definitions.filter((definition) => definition?.subject === subject).length
		])
	);
}

function assertExactCounts(actual, expected, label) {
	for (const subject of SUBJECTS) {
		if (actual[subject] !== expected[subject]) {
			throw new Error(
				`${label} ${subject} count is ${actual[subject] ?? 0}; expected ${expected[subject]}.`
			);
		}
	}
}

function assertUnique(values, label) {
	if (
		values.some((value) => typeof value !== 'string' || !value) ||
		new Set(values).size !== values.length
	) {
		throw new Error(`${label} are missing or duplicated.`);
	}
}

function assertSafeId(value, label) {
	if (typeof value !== 'string' || !SAFE_ID.test(value)) {
		throw new Error(`${label} is unsafe: ${String(value)}`);
	}
}

function canonicalObject(value) {
	return JSON.parse(stableStringify(value));
}

export function canonicalHash(value) {
	return sha256(stableStringify(value));
}

export function stableStringify(value) {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	return `{${Object.keys(value)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
		.join(',')}}`;
}

export function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

function isWithin(parent, child) {
	const relative = path.relative(path.resolve(parent), path.resolve(child));
	return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isRecord(value) {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
