import { randomUUID } from 'node:crypto';
import {
	existsSync,
	linkSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import {
	SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
	canonicalHash,
	scienceQuestionArtLocalPath,
	stableStringify,
	validateIndependentContentReviewRow,
	validateQuestionArtManifest
} from './science-challenge-release.mjs';

export const SCIENCE_CHALLENGE_ART_COHORT_SCHEMA = 'science-challenge-art-cohort/v1';
export const SCIENCE_CHALLENGE_ART_COHORT_TARGET_RELEASE_ID = 'science-179-v1';

export const SCIENCE_CHALLENGE_ART_COHORT_EXPECTATIONS = Object.freeze({
	sourceReleaseId: 'science-500-v1',
	targetReleaseId: SCIENCE_CHALLENGE_ART_COHORT_TARGET_RELEASE_ID,
	sourceArtManifestSha256: 'f28e3d0f387361eeb7de9b9b8a10052d1287a8dd06a7bed90b6ee2a210407876',
	verificationSummarySha256: '65e8c0e159fa555e45845b659c6a00351373018b006c7131694b3f84722afd15',
	sourceSpecCount: 1_000,
	verificationReviewCount: 408,
	acceptedNewCount: 179,
	rejectedNewCount: 229,
	existingReplacementCount: 60,
	ownerCount: 239,
	fileCount: 478,
	acceptedNewOwnerIdsSha256: '83c36c70fd9752ecb0b7bb44673317382c9158fe9c098e5fce64c550063768fc',
	existingReplacementOwnerIdsSha256:
		'733616d1d733cb2ded1f3897a23f8bf7577368693f99dd2ee1d20e2e0e8157b4',
	ownerIdsSha256: '0a8248a4e804040194a14f28c7af4be80d31af16606a42cda941b1a0343b4c2d'
});

const OWNER_KINDS = Object.freeze(['accepted-new', 'existing-expansion-replacement']);
const THEMES = Object.freeze(['dark', 'light']);
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9-]*$/u;
const WINDOWS_ABSOLUTE = /^[a-z]:[\\/]/iu;
const USER_PATH_FRAGMENT = /(?:^|[\\/])(?:Users|home)[\\/][^/\\\s]+(?:[\\/]|$)/u;

export function scienceChallengeArtOwnerIdsSha256(ids) {
	if (!Array.isArray(ids) || ids.some((id) => !SAFE_ID.test(String(id ?? '')))) {
		throw new Error('Art cohort owner ids must be an array of kebab-case ids.');
	}
	const sorted = [...ids].sort((left, right) => left.localeCompare(right));
	if (new Set(sorted).size !== sorted.length) {
		throw new Error('Art cohort owner ids must be unique.');
	}
	return canonicalHash(sorted);
}

/**
 * Select the exact independently accepted/new plus authored-expansion replacement cohort from the
 * immutable 1,000-spec source manifest. Source prompt fields are copied byte-for-byte as JSON values;
 * only the release-scoped output paths are rewritten.
 */
export function buildScienceChallengeArtCohort({
	sourceArtManifest,
	verificationSummary,
	existingExpansionIds,
	expectations = SCIENCE_CHALLENGE_ART_COHORT_EXPECTATIONS
}) {
	const expected = normalizedExpectations(expectations);
	const inputIssues = validateInputs({
		sourceArtManifest,
		verificationSummary,
		existingExpansionIds,
		expected
	});
	if (inputIssues.length) {
		throw new Error(`Science challenge art cohort inputs failed:\n${inputIssues.join('\n')}`);
	}

	const acceptedNewIds = verificationSummary.reviews
		.filter((review) => review.accepted === true)
		.map((review) => review.id)
		.sort((left, right) => left.localeCompare(right));
	const replacementIds = [...existingExpansionIds].sort((left, right) => left.localeCompare(right));
	const kindByChallengeId = new Map([
		...acceptedNewIds.map((id) => [id, 'accepted-new']),
		...replacementIds.map((id) => [id, 'existing-expansion-replacement'])
	]);
	const sourceOpeningByChallengeId = new Map();
	for (const spec of sourceArtManifest.specs) {
		if (!kindByChallengeId.has(spec.challengeId) || spec.context !== 'opening') continue;
		if (sourceOpeningByChallengeId.has(spec.challengeId)) {
			throw new Error(`Source art manifest repeats opening owner ${spec.challengeId}.`);
		}
		sourceOpeningByChallengeId.set(spec.challengeId, spec);
	}

	const ownerIds = [...kindByChallengeId.keys()].sort((left, right) => left.localeCompare(right));
	const sourceOpeningSpecs = ownerIds.map((id) => sourceOpeningByChallengeId.get(id));
	const specs = sourceOpeningSpecs.map((sourceSpec) => {
		const spec = structuredClone(sourceSpec);
		spec.output = {
			darkPath: scienceQuestionArtLocalPath(expected.targetReleaseId, spec.id, 'dark'),
			lightPath: scienceQuestionArtLocalPath(expected.targetReleaseId, spec.id, 'light')
		};
		return spec;
	});
	const sourceSpecHashByChallengeId = new Map(
		sourceOpeningSpecs.map((spec) => [spec.challengeId, canonicalHash(spec)])
	);
	const specByChallengeId = new Map(specs.map((spec) => [spec.challengeId, spec]));
	const owners = ownerIds.map((challengeId) => {
		const spec = specByChallengeId.get(challengeId);
		return {
			challengeId,
			ownerKind: kindByChallengeId.get(challengeId),
			artId: spec.id,
			context: 'opening',
			sourceSpecSha256: sourceSpecHashByChallengeId.get(challengeId),
			darkPath: spec.output.darkPath,
			lightPath: spec.output.lightPath
		};
	});
	const files = owners.flatMap((owner) =>
		THEMES.map((theme) => ({
			id: `${owner.artId}-${theme}`,
			challengeId: owner.challengeId,
			ownerKind: owner.ownerKind,
			artId: owner.artId,
			theme,
			localPath: owner[`${theme}Path`]
		}))
	);

	const manifest = {
		schemaVersion: SCIENCE_QUESTION_ART_MANIFEST_SCHEMA,
		releaseId: expected.targetReleaseId,
		width: sourceArtManifest.width,
		height: sourceArtManifest.height,
		cohort: {
			schemaVersion: SCIENCE_CHALLENGE_ART_COHORT_SCHEMA,
			pairPolicy: 'one-pair-per-challenge',
			source: {
				releaseId: sourceArtManifest.releaseId,
				artManifestSha256: canonicalHash(sourceArtManifest),
				verificationSummarySha256: canonicalHash(verificationSummary),
				sourceSpecCount: sourceArtManifest.specs.length,
				verificationReviewCount: verificationSummary.reviews.length,
				sourceOpeningSpecSetSha256: canonicalHash(sourceOpeningSpecs)
			},
			acceptedNewOwnerCount: acceptedNewIds.length,
			existingReplacementOwnerCount: replacementIds.length,
			ownerCount: owners.length,
			pairCount: owners.length,
			fileCount: files.length,
			acceptedNewOwnerIdsSha256: scienceChallengeArtOwnerIdsSha256(acceptedNewIds),
			existingReplacementOwnerIdsSha256: scienceChallengeArtOwnerIdsSha256(replacementIds),
			ownerIdsSha256: scienceChallengeArtOwnerIdsSha256(ownerIds),
			targetSpecSetSha256: canonicalHash(specs),
			ownersSha256: canonicalHash(owners),
			filesSha256: canonicalHash(files),
			owners,
			files
		},
		specs
	};
	const validation = validateScienceChallengeArtCohortManifest(manifest, {
		expectations: expected
	});
	if (validation.status !== 'passed') {
		throw new Error(`Built science challenge art cohort failed:\n${validation.issues.join('\n')}`);
	}
	return manifest;
}

export function validateScienceChallengeArtCohortManifest(
	manifest,
	{ expectations = SCIENCE_CHALLENGE_ART_COHORT_EXPECTATIONS } = {}
) {
	const expected = normalizedExpectations(expectations);
	const issues = [];
	if (!isRecord(manifest)) return failed(['Art cohort manifest must be an object.']);
	const baseValidation = validateQuestionArtManifest(manifest, {
		expectedCount: expected.ownerCount
	});
	issues.push(...baseValidation.issues.map((issue) => `Art manifest: ${issue}`));
	if (manifest.schemaVersion !== SCIENCE_QUESTION_ART_MANIFEST_SCHEMA) {
		issues.push(`schemaVersion must be ${SCIENCE_QUESTION_ART_MANIFEST_SCHEMA}.`);
	}
	if (manifest.releaseId !== expected.targetReleaseId) {
		issues.push(`releaseId must be ${expected.targetReleaseId}.`);
	}
	if (manifest.width !== 960 || manifest.height !== 540) {
		issues.push('Art cohort dimensions must be 960x540.');
	}
	if (!Array.isArray(manifest.specs) || manifest.specs.length !== expected.ownerCount) {
		issues.push(`specs must contain exactly ${expected.ownerCount} opening pairs.`);
	}
	const cohort = manifest.cohort;
	if (!isRecord(cohort) || cohort.schemaVersion !== SCIENCE_CHALLENGE_ART_COHORT_SCHEMA) {
		issues.push(`cohort.schemaVersion must be ${SCIENCE_CHALLENGE_ART_COHORT_SCHEMA}.`);
		return failed(issues);
	}
	if (cohort.pairPolicy !== 'one-pair-per-challenge') {
		issues.push('cohort.pairPolicy must be one-pair-per-challenge.');
	}
	validateCohortHeader(cohort, expected, issues);
	if (!Array.isArray(cohort.owners) || cohort.owners.length !== expected.ownerCount) {
		issues.push(`cohort.owners must contain exactly ${expected.ownerCount} rows.`);
	}
	if (!Array.isArray(cohort.files) || cohort.files.length !== expected.fileCount) {
		issues.push(`cohort.files must contain exactly ${expected.fileCount} rows.`);
	}
	if (issues.length) return failed(issues);

	const specs = manifest.specs;
	const owners = cohort.owners;
	const files = cohort.files;
	if (cohort.targetSpecSetSha256 !== canonicalHash(specs)) {
		issues.push('cohort.targetSpecSetSha256 differs from specs.');
	}
	if (cohort.ownersSha256 !== canonicalHash(owners)) {
		issues.push('cohort.ownersSha256 differs from owners.');
	}
	if (cohort.filesSha256 !== canonicalHash(files)) {
		issues.push('cohort.filesSha256 differs from files.');
	}

	const specIds = new Set();
	const challengeIds = new Set();
	const outputPaths = new Set();
	const normalizedQuestions = new Set();
	const normalizedScenes = new Set();
	const ownerByChallengeId = new Map();
	for (const [index, owner] of owners.entries()) {
		const prefix = `cohort.owners[${index}]`;
		if (!isRecord(owner)) {
			issues.push(`${prefix} must be an object.`);
			continue;
		}
		if (!SAFE_ID.test(String(owner.challengeId ?? ''))) {
			issues.push(`${prefix}.challengeId must be kebab-case.`);
		}
		if (!OWNER_KINDS.includes(owner.ownerKind)) {
			issues.push(`${prefix}.ownerKind is invalid.`);
		}
		if (!SHA256.test(String(owner.sourceSpecSha256 ?? ''))) {
			issues.push(`${prefix}.sourceSpecSha256 must be SHA-256.`);
		}
		if (owner.context !== 'opening' || owner.artId !== `${owner.challengeId}-opening`) {
			issues.push(`${prefix} must own exactly its opening art pair.`);
		}
		if (ownerByChallengeId.has(owner.challengeId)) {
			issues.push(`${prefix} duplicates owner ${String(owner.challengeId)}.`);
		}
		ownerByChallengeId.set(owner.challengeId, owner);
	}
	const sortedOwnerIds = [...ownerByChallengeId.keys()].sort((left, right) =>
		left.localeCompare(right)
	);
	if (canonicalHash(owners.map((owner) => owner.challengeId)) !== canonicalHash(sortedOwnerIds)) {
		issues.push('cohort.owners must be ordered by unique challengeId.');
	}
	const acceptedIds = owners
		.filter((owner) => owner.ownerKind === 'accepted-new')
		.map((owner) => owner.challengeId);
	const replacementIds = owners
		.filter((owner) => owner.ownerKind === 'existing-expansion-replacement')
		.map((owner) => owner.challengeId);
	validateIdHash(
		acceptedIds,
		expected.acceptedNewCount,
		expected.acceptedNewOwnerIdsSha256,
		cohort.acceptedNewOwnerIdsSha256,
		'accepted-new',
		issues
	);
	validateIdHash(
		replacementIds,
		expected.existingReplacementCount,
		expected.existingReplacementOwnerIdsSha256,
		cohort.existingReplacementOwnerIdsSha256,
		'existing-replacement',
		issues
	);
	validateIdHash(
		sortedOwnerIds,
		expected.ownerCount,
		expected.ownerIdsSha256,
		cohort.ownerIdsSha256,
		'all owner',
		issues
	);

	for (const [index, spec] of specs.entries()) {
		const prefix = `specs[${index}]`;
		if (!isRecord(spec)) {
			issues.push(`${prefix} must be an object.`);
			continue;
		}
		const owner = ownerByChallengeId.get(spec.challengeId);
		if (!owner) issues.push(`${prefix} has no cohort owner.`);
		if (
			spec.context !== 'opening' ||
			spec.id !== `${spec.challengeId}-opening` ||
			owner?.artId !== spec.id
		) {
			issues.push(`${prefix} is not the owner's unique opening spec.`);
		}
		if (specIds.has(spec.id)) issues.push(`${prefix} duplicates art id ${String(spec.id)}.`);
		if (challengeIds.has(spec.challengeId)) {
			issues.push(`${prefix} duplicates challenge owner ${String(spec.challengeId)}.`);
		}
		specIds.add(spec.id);
		challengeIds.add(spec.challengeId);
		const question = normalizedText(spec.question);
		const scene = normalizedText(spec.scene);
		if (!question) issues.push(`${prefix}.question is required.`);
		else if (normalizedQuestions.has(question)) issues.push(`${prefix} duplicates a question.`);
		if (!scene) issues.push(`${prefix}.scene is required.`);
		else if (normalizedScenes.has(scene)) issues.push(`${prefix} duplicates a scene.`);
		normalizedQuestions.add(question);
		normalizedScenes.add(scene);
		for (const theme of THEMES) {
			const expectedPath = scienceQuestionArtLocalPath(expected.targetReleaseId, spec.id, theme);
			const outputPath = spec.output?.[`${theme}Path`];
			if (outputPath !== expectedPath || owner?.[`${theme}Path`] !== expectedPath) {
				issues.push(`${prefix}.output.${theme}Path is not the exact release sibling path.`);
			}
			if (outputPaths.has(outputPath)) {
				issues.push(`${prefix} duplicates output path ${String(outputPath)}.`);
			}
			outputPaths.add(outputPath);
		}
	}
	if (challengeIds.size !== owners.length || specIds.size !== owners.length) {
		issues.push('Every owner must map one-to-one to exactly one opening spec.');
	}
	if (outputPaths.size !== expected.fileCount) {
		issues.push(`Opening pairs must map to exactly ${expected.fileCount} unique files.`);
	}
	const expectedFiles = owners.flatMap((owner) =>
		THEMES.map((theme) => ({
			id: `${owner.artId}-${theme}`,
			challengeId: owner.challengeId,
			ownerKind: owner.ownerKind,
			artId: owner.artId,
			theme,
			localPath: owner[`${theme}Path`]
		}))
	);
	if (canonicalHash(files) !== canonicalHash(expectedFiles)) {
		issues.push('cohort.files differs from the owners and their light/dark sibling paths.');
	}

	const pathIssues = findAbsoluteOrUserPaths(manifest);
	issues.push(...pathIssues);
	if (
		containsExactString(
			{ ...manifest, cohort: { ...cohort, source: null } },
			expected.sourceReleaseId
		)
	) {
		issues.push('The source release id may appear only in cohort.source.');
	}
	return issues.length ? failed(issues) : passed();
}

export function resolveScienceChallengeArtCohortOutput(repositoryRoot, outputPath) {
	const root = realpathSync(repositoryRoot);
	if (
		typeof outputPath !== 'string' ||
		!outputPath.endsWith('.json') ||
		path.isAbsolute(outputPath) ||
		outputPath.includes('\\')
	) {
		throw new Error('Art cohort output must be a repo-relative .json path.');
	}
	const segments = outputPath.split('/');
	if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
		throw new Error('Art cohort output must not contain empty, dot or parent path segments.');
	}
	const absolute = path.resolve(root, outputPath);
	if (!isInside(root, absolute)) {
		throw new Error('Art cohort output must remain inside the repository.');
	}
	return { root, absolute, relative: segments.join('/') };
}

export function publishScienceChallengeArtCohort({
	repositoryRoot,
	outputPath,
	manifest,
	expectations = SCIENCE_CHALLENGE_ART_COHORT_EXPECTATIONS
}) {
	const validation = validateScienceChallengeArtCohortManifest(manifest, { expectations });
	if (validation.status !== 'passed') {
		throw new Error(`Art cohort publication validation failed:\n${validation.issues.join('\n')}`);
	}
	const output = resolveScienceChallengeArtCohortOutput(repositoryRoot, outputPath);
	if (existsSync(output.absolute)) {
		throw new Error(`Art cohort output already exists and is immutable: ${output.relative}`);
	}
	const parent = path.dirname(output.absolute);
	mkdirSync(parent, { recursive: true });
	const realParent = realpathSync(parent);
	if (!isInside(output.root, realParent)) {
		throw new Error('Art cohort output parent escapes the repository.');
	}
	const temporary = path.join(
		realParent,
		`.${path.basename(output.absolute)}.preparing-${process.pid}-${randomUUID()}`
	);
	let published = false;
	try {
		writeFileSync(temporary, `${stableStringify(manifest)}\n`, {
			flag: 'wx',
			mode: 0o644
		});
		linkSync(temporary, output.absolute);
		published = true;
		unlinkSync(temporary);
		const replay = JSON.parse(readFileSync(output.absolute, 'utf8'));
		if (canonicalHash(replay) !== canonicalHash(manifest)) {
			throw new Error('Published art cohort differs from the prepared manifest.');
		}
		return {
			status: 'passed',
			outputPath: output.relative,
			manifestSha256: canonicalHash(replay)
		};
	} catch (error) {
		if (existsSync(temporary)) rmSync(temporary, { force: true });
		if (published && existsSync(output.absolute)) rmSync(output.absolute, { force: true });
		throw error;
	}
}

function validateInputs({
	sourceArtManifest,
	verificationSummary,
	existingExpansionIds,
	expected
}) {
	const issues = [];
	if (canonicalHash(sourceArtManifest) !== expected.sourceArtManifestSha256) {
		issues.push('Source art manifest canonical SHA-256 is not the authoritative value.');
	}
	const sourceValidation = validateQuestionArtManifest(sourceArtManifest, {
		expectedCount: expected.sourceSpecCount
	});
	if (sourceValidation.status !== 'passed') {
		issues.push(...sourceValidation.issues.map((issue) => `Source art manifest: ${issue}`));
	}
	if (sourceArtManifest?.releaseId !== expected.sourceReleaseId) {
		issues.push(`Source art manifest releaseId must be ${expected.sourceReleaseId}.`);
	}
	if (canonicalHash(verificationSummary) !== expected.verificationSummarySha256) {
		issues.push('Verification summary canonical SHA-256 is not the authoritative value.');
	}
	if (
		!isRecord(verificationSummary) ||
		verificationSummary.schemaVersion !== 'science-challenge-independent-verification-summary/v1'
	) {
		issues.push('Verification summary schemaVersion is invalid.');
		return issues;
	}
	if (verificationSummary.planId !== expected.sourceReleaseId) {
		issues.push('Verification summary planId differs from the source release.');
	}
	if (
		verificationSummary.status !== 'failed' ||
		verificationSummary.acceptedCount !== expected.acceptedNewCount ||
		verificationSummary.rejectedCount !== expected.rejectedNewCount ||
		verificationSummary.reviewCount !== expected.verificationReviewCount ||
		!Array.isArray(verificationSummary.reviews) ||
		verificationSummary.reviews.length !== expected.verificationReviewCount
	) {
		issues.push(
			'Verification summary does not contain the exact 179 accepted / 229 rejected cohort.'
		);
		return issues;
	}
	if (!Array.isArray(verificationSummary.issues) || verificationSummary.issues.length !== 0) {
		issues.push('Verification summary must have a complete empty top-level issue list.');
	}
	const reviewIds = new Set();
	for (const review of verificationSummary.reviews) {
		const validation = validateIndependentContentReviewRow(review);
		if (validation.status !== 'passed') {
			issues.push(`Verification review ${String(review?.id)}: ${validation.issues.join(' ')}`);
		}
		if (!SAFE_ID.test(String(review?.id ?? '')) || reviewIds.has(review.id)) {
			issues.push(`Verification review id is unsafe or duplicated: ${String(review?.id)}.`);
		}
		reviewIds.add(review.id);
	}
	const acceptedNewIds = verificationSummary.reviews
		.filter((review) => review.accepted === true)
		.map((review) => review.id);
	const replacementIds = Array.isArray(existingExpansionIds) ? existingExpansionIds : [];
	validateExactIdSet(
		acceptedNewIds,
		expected.acceptedNewCount,
		expected.acceptedNewOwnerIdsSha256,
		'Accepted-new',
		issues
	);
	validateExactIdSet(
		replacementIds,
		expected.existingReplacementCount,
		expected.existingReplacementOwnerIdsSha256,
		'Existing replacement',
		issues
	);
	if (new Set([...acceptedNewIds, ...replacementIds]).size !== expected.ownerCount) {
		issues.push('Accepted-new and existing replacement owners must be disjoint.');
	}
	validateExactIdSet(
		[...acceptedNewIds, ...replacementIds],
		expected.ownerCount,
		expected.ownerIdsSha256,
		'Combined owner',
		issues
	);
	if (expected.fileCount !== expected.ownerCount * 2) {
		issues.push('Expected file count must be exactly two files per owner pair.');
	}
	if (Array.isArray(sourceArtManifest?.specs)) {
		const openingCounts = new Map();
		for (const spec of sourceArtManifest.specs) {
			if (spec?.context !== 'opening') continue;
			openingCounts.set(spec.challengeId, (openingCounts.get(spec.challengeId) ?? 0) + 1);
		}
		for (const id of [...acceptedNewIds, ...replacementIds]) {
			if (openingCounts.get(id) !== 1) {
				issues.push(`${id} must have exactly one authoritative opening art spec.`);
			}
		}
	}
	return issues;
}

function validateCohortHeader(cohort, expected, issues) {
	if (!isRecord(cohort.source)) {
		issues.push('cohort.source must be an object.');
		return;
	}
	const source = cohort.source;
	if (
		source.releaseId !== expected.sourceReleaseId ||
		source.artManifestSha256 !== expected.sourceArtManifestSha256 ||
		source.verificationSummarySha256 !== expected.verificationSummarySha256 ||
		source.sourceSpecCount !== expected.sourceSpecCount ||
		source.verificationReviewCount !== expected.verificationReviewCount ||
		!SHA256.test(String(source.sourceOpeningSpecSetSha256 ?? ''))
	) {
		issues.push('cohort.source differs from the exact authoritative source bindings.');
	}
	for (const [field, value] of [
		['acceptedNewOwnerCount', expected.acceptedNewCount],
		['existingReplacementOwnerCount', expected.existingReplacementCount],
		['ownerCount', expected.ownerCount],
		['pairCount', expected.ownerCount],
		['fileCount', expected.fileCount]
	]) {
		if (cohort[field] !== value) issues.push(`cohort.${field} must be ${value}.`);
	}
	for (const field of [
		'acceptedNewOwnerIdsSha256',
		'existingReplacementOwnerIdsSha256',
		'ownerIdsSha256',
		'targetSpecSetSha256',
		'ownersSha256',
		'filesSha256'
	]) {
		if (!SHA256.test(String(cohort[field] ?? ''))) {
			issues.push(`cohort.${field} must be SHA-256.`);
		}
	}
}

function validateIdHash(ids, count, expectedHash, recordedHash, label, issues) {
	if (ids.length !== count || new Set(ids).size !== count) {
		issues.push(`${label} owners must contain exactly ${count} unique ids.`);
		return;
	}
	const hash = scienceChallengeArtOwnerIdsSha256(ids);
	if (hash !== expectedHash || recordedHash !== expectedHash) {
		issues.push(`${label} owner ids differ from their exact frozen SHA-256.`);
	}
}

function validateExactIdSet(ids, count, expectedHash, label, issues) {
	if (!Array.isArray(ids)) {
		issues.push(`${label} ids must be an array.`);
		return;
	}
	try {
		if (
			ids.length !== count ||
			new Set(ids).size !== count ||
			scienceChallengeArtOwnerIdsSha256(ids) !== expectedHash
		) {
			issues.push(`${label} ids differ from the exact ${count}-owner set.`);
		}
	} catch (error) {
		issues.push(
			`${label} ids are invalid: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

function findAbsoluteOrUserPaths(value, location = 'manifest', issues = []) {
	if (typeof value === 'string') {
		if (
			value.startsWith('/') ||
			WINDOWS_ABSOLUTE.test(value) ||
			value.startsWith('file://') ||
			USER_PATH_FRAGMENT.test(value)
		) {
			issues.push(`${location} contains an absolute or user-specific path.`);
		}
		return issues;
	}
	if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			findAbsoluteOrUserPaths(entry, `${location}[${index}]`, issues);
		}
		return issues;
	}
	if (isRecord(value)) {
		for (const [key, entry] of Object.entries(value)) {
			findAbsoluteOrUserPaths(entry, `${location}.${key}`, issues);
		}
	}
	return issues;
}

function containsExactString(value, expected) {
	if (typeof value === 'string') return value === expected;
	if (Array.isArray(value)) return value.some((entry) => containsExactString(entry, expected));
	if (isRecord(value))
		return Object.values(value).some((entry) => containsExactString(entry, expected));
	return false;
}

function normalizedExpectations(expectations) {
	return { ...SCIENCE_CHALLENGE_ART_COHORT_EXPECTATIONS, ...expectations };
}

function normalizedText(value) {
	return String(value ?? '')
		.replace(/\s+/gu, ' ')
		.trim()
		.toLowerCase();
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
