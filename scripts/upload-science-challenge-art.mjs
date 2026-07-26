#!/usr/bin/env node

import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

import { loadDefaultEnv } from './lib/codex-sdk-runner.mjs';
import {
	SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS,
	SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID,
	validateScienceChallengeAcceptedReleaseTree
} from './lib/science-challenge-accepted-release.mjs';
import { uploadScienceChallengeArtObject } from './lib/science-challenge-art-r2-upload.mjs';
import {
	scienceChallengeProvenanceBindings,
	validateScienceChallengeProvenanceArchive
} from './lib/science-challenge-provenance-archive.mjs';
import {
	canonicalHash,
	sha256,
	validateQuestionArtDeliveryManifest,
	validateRelease
} from './lib/science-challenge-release.mjs';
import {
	readScienceChallengeReleaseShortRecallUploadEvidence,
	validateScienceChallengeReleaseUploadEvidence
} from './lib/science-challenge-release-upload.mjs';
import {
	buildPerceptualAudit,
	validatePerceptualAudit
} from './lib/science-question-art-perceptual.mjs';

const rootDir = process.cwd();
const ACCEPTED_ART_MANIFEST = 'art-manifest.json';
const ACCEPTED_ART_DELIVERY_MANIFEST = 'art-delivery-manifest.json';
const ACCEPTED_ART_PERCEPTUAL_AUDIT = 'art-perceptual-audit.json';
loadDefaultEnv(rootDir);
const args = parseArgs(process.argv.slice(2));
if (args.help) {
	console.log(usage());
	process.exit(0);
}
if (args.releaseEvidenceOnly && args.upload) {
	throw new Error(
		'--release-evidence-only is a read-only dry-run and cannot be combined with --upload.'
	);
}
if (
	args.upload &&
	(!args.expectedFileSha256 || !args.expectedCanonicalSha256 || !args.expectedReleaseSha256)
) {
	throw new Error(
		'--upload requires --expected-file-sha256, --expected-canonical-sha256 and --expected-release-sha256.'
	);
}

const artEvidenceRoot = resolveArtEvidenceRoot(args.artEvidenceRoot);
const releasePath = path.resolve(rootDir, args.release);
if (args.releaseEvidenceOnly) {
	if (args.expectedFileSha256 || args.expectedCanonicalSha256) {
		throw new Error(
			'--release-evidence-only does not read an art delivery manifest; manifest hash flags are not applicable.'
		);
	}
	const binding = captureReleaseEvidenceBinding(releasePath);
	if (args.expectedReleaseSha256 && args.expectedReleaseSha256 !== binding.releaseCanonicalSha256) {
		throw new Error('Accepted release SHA-256 differs from --expected-release-sha256.');
	}
	console.log(
		JSON.stringify(
			{
				status: 'dry-run',
				scope: 'release-evidence',
				releaseId: binding.release.release.id,
				acceptedRelease: path.relative(rootDir, releasePath),
				acceptedReleaseSha256: binding.releaseCanonicalSha256,
				provenanceArchiveSha256: binding.provenanceArchiveSha256,
				basePlanSha256: binding.basePlanSha256,
				effectivePlanSha256: binding.effectivePlanSha256,
				candidateSetSha256: binding.candidateSetSha256,
				shortRecallBundleSha256: binding.shortRecallBundleSha256,
				shortRecallReviewSha256: binding.shortRecallReviewSha256,
				shortRecallAuthoringEvidenceSha256: binding.shortRecallAuthoringEvidenceSha256,
				siblingSetSha256: binding.siblingSetSha256,
				counts: binding.counts,
				remoteReadback: 'not-run'
			},
			null,
			2
		)
	);
	process.exit(0);
}

const manifestPath = path.resolve(rootDir, args.manifest);
const artManifestPath = path.resolve(rootDir, args.artManifest);
const binding = captureManifestBinding(manifestPath, artManifestPath, releasePath);
if (args.expectedFileSha256 && args.expectedFileSha256 !== binding.fileSha256) {
	throw new Error('Delivery manifest file SHA-256 differs from --expected-file-sha256.');
}
if (args.expectedCanonicalSha256 && args.expectedCanonicalSha256 !== binding.canonicalSha256) {
	throw new Error('Delivery manifest canonical SHA-256 differs from --expected-canonical-sha256.');
}
if (args.expectedReleaseSha256 && args.expectedReleaseSha256 !== binding.releaseCanonicalSha256) {
	throw new Error('Accepted release SHA-256 differs from --expected-release-sha256.');
}
for (const object of binding.manifest.objects) assertLocalObjectCurrent(object);

console.log(
	JSON.stringify(
		{
			status: args.upload ? 'upload-authorized' : 'dry-run',
			releaseId: binding.manifest.releaseId,
			bucket: binding.manifest.bucket,
			artPairs: binding.artPairCount,
			objects: binding.manifest.objects.length,
			perceptualRecords: binding.perceptualRecordCount,
			bytes: binding.manifest.objects.reduce((sum, object) => sum + object.size, 0),
			manifest: path.relative(rootDir, manifestPath),
			manifestFileSha256: binding.fileSha256,
			manifestCanonicalSha256: binding.canonicalSha256,
			acceptedRelease: path.relative(rootDir, releasePath),
			acceptedReleaseSha256: binding.releaseCanonicalSha256,
			provenanceArchiveSha256: binding.provenanceArchiveSha256,
			basePlanSha256: binding.basePlanSha256,
			effectivePlanSha256: binding.effectivePlanSha256,
			candidateSetSha256: binding.candidateSetSha256,
			shortRecallBundleSha256: binding.shortRecallBundleSha256,
			shortRecallReviewSha256: binding.shortRecallReviewSha256,
			shortRecallAuthoringEvidenceSha256: binding.shortRecallAuthoringEvidenceSha256,
			siblingSetSha256: binding.siblingSetSha256,
			remoteReadback: args.upload ? 'required-after-every-object' : 'not-run',
			concurrency: args.concurrency
		},
		null,
		2
	)
);

if (!args.upload) process.exit(0);

assertManifestCurrent(binding, true);
assertReleaseEvidenceCurrent(binding);
const results = await runConcurrent(
	binding.manifest.objects.map(
		(object) => async () =>
			uploadScienceChallengeArtObject({
				object,
				bucket: binding.manifest.bucket,
				repositoryRoot: rootDir,
				assetRoot: artEvidenceRoot,
				wranglerCommand: wranglerCommand(),
				retries: args.retries,
				assertBindingCurrent: () => assertManifestCurrent(binding),
				assertLocalObjectCurrent: () => assertLocalObjectCurrent(object)
			})
	),
	args.concurrency
);
assertManifestCurrent(binding, true);
assertReleaseEvidenceCurrent(binding);
for (const object of binding.manifest.objects) assertLocalObjectCurrent(object);
const failures = results.filter((result) => result.status !== 'passed');
if (failures.length) {
	throw new Error(
		`Challenge art upload failed for ${failures.length} objects:\n${failures
			.slice(0, 20)
			.map((failure) => `${failure.id}: ${failure.error}`)
			.join('\n')}`
	);
}
console.log(
	JSON.stringify(
		{
			status: 'passed',
			releaseId: binding.manifest.releaseId,
			uploadedAndReadBack: results.length,
			manifestCanonicalSha256: binding.canonicalSha256
		},
		null,
		2
	)
);

function captureManifestBinding(deliveryPath, sourcePath, acceptedReleasePath) {
	if (!existsSync(deliveryPath))
		throw new Error(`Delivery manifest does not exist: ${deliveryPath}`);
	if (!existsSync(sourcePath)) throw new Error(`Art manifest does not exist: ${sourcePath}`);
	const bytes = readFileSync(deliveryPath);
	const manifest = JSON.parse(bytes.toString('utf8'));
	const artManifestBytes = readFileSync(sourcePath);
	const artManifest = JSON.parse(artManifestBytes.toString('utf8'));
	const releaseEvidence = captureReleaseEvidenceBinding(acceptedReleasePath);
	if (releaseEvidence.contract === 'science-179-v1') {
		return captureAcceptedSubsetManifestBinding({
			deliveryPath,
			sourcePath,
			acceptedReleasePath,
			bytes,
			manifest,
			artManifest,
			releaseEvidence
		});
	}
	const { release, uploadEvidence } = releaseEvidence;
	const runtimePath = path.join(path.dirname(acceptedReleasePath), 'runtime.json');
	const runtimeBytes = existsSync(runtimePath) ? readFileSync(runtimePath) : null;
	if (!runtimeBytes) throw new Error(`Accepted runtime projection does not exist: ${runtimePath}`);
	const runtime = JSON.parse(runtimeBytes.toString('utf8'));
	const validation = validateQuestionArtDeliveryManifest(manifest, {
		artManifest,
		expectedCount: 2_000
	});
	if (validation.status !== 'passed') {
		throw new Error(`Delivery manifest validation failed:\n${validation.issues.join('\n')}`);
	}
	const plan = uploadEvidence.effectivePlan;
	const sourceById = new Map(
		(uploadEvidence.sourceHashIndex?.questions ?? []).map((question) => [question.id, question])
	);
	const curriculumById = new Map(
		(uploadEvidence.curriculumHashIndex?.components ?? []).map((component) => [
			component.componentId,
			component
		])
	);
	const planById = new Map(plan.rows.map((row) => [row.id, row]));
	const releaseValidation = validateRelease(release, {
		expectedCount: 408,
		forEntry: (entry) => {
			const row = planById.get(entry?.definition?.id);
			const source = sourceById.get(row?.calibrationQuestionId);
			const curriculum = curriculumById.get(row?.curriculumComponentId);
			return {
				planRow: row,
				sourceQuestion: source ? { id: source.id, contentSha256: source.contentSha256 } : undefined,
				curriculum: curriculum
					? {
							id: curriculum.componentId,
							specificationId: curriculum.specificationId,
							specificationSha256: curriculum.specificationSha256
						}
					: undefined
			};
		}
	});
	if (releaseValidation.status !== 'passed' || release.release?.status !== 'accepted') {
		throw new Error(`Accepted release validation failed:\n${releaseValidation.issues.join('\n')}`);
	}
	if (
		release.release.id !== manifest.releaseId ||
		release.release.artManifestSha256 !== canonicalHash(artManifest) ||
		release.release.artDeliveryManifestSha256 !== canonicalHash(manifest) ||
		release.release.runtimeSha256 !== canonicalHash(runtime)
	) {
		throw new Error('Upload evidence is not the exact evidence bound by the accepted release.');
	}
	const perceptualAuditPath = path.join(
		releaseEvidence.provenanceRoot,
		'art',
		'perceptual-audit.json'
	);
	const perceptualAuditBytes = readFileSync(perceptualAuditPath);
	const perceptualAudit = JSON.parse(perceptualAuditBytes.toString('utf8'));
	if (release.release.artPerceptualAuditSha256 !== canonicalHash(perceptualAudit)) {
		throw new Error('Archived perceptual audit differs from the accepted release binding.');
	}
	const assetInventory = artManifest.specs.map((spec) => ({
		id: spec.id,
		darkSha256: sha256(readFileSync(path.resolve(artEvidenceRoot, spec.output.darkPath))),
		lightSha256: sha256(readFileSync(path.resolve(artEvidenceRoot, spec.output.lightPath)))
	}));
	const perceptualValidation = validatePerceptualAudit(perceptualAudit, {
		manifest: artManifest,
		assetInventory,
		expectedRecordCount: 2_000
	});
	if (perceptualValidation.status !== 'passed') {
		throw new Error(
			`Perceptual audit validation failed:\n${perceptualValidation.issues.join('\n')}`
		);
	}
	if (
		canonicalHash(buildPerceptualAudit(artManifest, { rootDir: artEvidenceRoot })) !==
		canonicalHash(perceptualAudit)
	) {
		throw new Error('Perceptual audit differs from a fresh hash of all current image bytes.');
	}
	return {
		contract: 'legacy',
		manifestPath: deliveryPath,
		manifest,
		fileSha256: sha256(bytes),
		canonicalSha256: canonicalHash(manifest),
		releaseCanonicalSha256: releaseEvidence.releaseCanonicalSha256,
		artPairCount: artManifest.specs.length,
		perceptualRecordCount: perceptualAudit.records?.length ?? manifest.objects.length,
		provenanceArchiveSha256: releaseEvidence.provenanceArchiveSha256,
		basePlanSha256: releaseEvidence.basePlanSha256,
		effectivePlanSha256: releaseEvidence.effectivePlanSha256,
		candidateSetSha256: releaseEvidence.candidateSetSha256,
		shortRecallBundleSha256: releaseEvidence.shortRecallBundleSha256,
		shortRecallReviewSha256: releaseEvidence.shortRecallReviewSha256,
		shortRecallAuthoringEvidenceSha256: releaseEvidence.shortRecallAuthoringEvidenceSha256,
		provenanceRoot: releaseEvidence.provenanceRoot,
		provenanceBindings: releaseEvidence.provenanceBindings,
		provenanceRelease: releaseEvidence.provenanceRelease,
		watchedFiles: [
			watchFile(deliveryPath, bytes),
			watchFile(sourcePath, artManifestBytes),
			...releaseEvidence.watchedFiles,
			watchFile(runtimePath, runtimeBytes),
			watchFile(perceptualAuditPath, perceptualAuditBytes)
		]
	};
}

function captureAcceptedSubsetManifestBinding({
	deliveryPath,
	sourcePath,
	acceptedReleasePath,
	bytes,
	manifest,
	artManifest,
	releaseEvidence
}) {
	const releaseRoot = releaseEvidence.releaseRoot;
	assertExactAcceptedReleaseSibling(
		acceptedReleasePath,
		releaseRoot,
		'accepted-challenges.json',
		'accepted release'
	);
	assertExactAcceptedReleaseSibling(
		deliveryPath,
		releaseRoot,
		ACCEPTED_ART_DELIVERY_MANIFEST,
		'delivery manifest'
	);
	assertExactAcceptedReleaseSibling(sourcePath, releaseRoot, ACCEPTED_ART_MANIFEST, 'art manifest');

	const treeArtManifest = releaseEvidence.values.get(ACCEPTED_ART_MANIFEST);
	const treeDeliveryManifest = releaseEvidence.values.get(ACCEPTED_ART_DELIVERY_MANIFEST);
	const perceptualAudit = releaseEvidence.values.get(ACCEPTED_ART_PERCEPTUAL_AUDIT);
	if (
		canonicalHash(artManifest) !== canonicalHash(treeArtManifest) ||
		canonicalHash(manifest) !== canonicalHash(treeDeliveryManifest)
	) {
		throw new Error(
			'Uploader manifests are not the exact siblings authenticated by science-179-v1.'
		);
	}

	const expected = SCIENCE_CHALLENGE_ACCEPTED_RELEASE_COUNTS;
	if (
		releaseEvidence.counts.challenges !== expected.accepted ||
		releaseEvidence.counts.visuals !== expected.visuals ||
		releaseEvidence.counts.artPairs !== expected.artPairs ||
		releaseEvidence.counts.artFiles !== expected.artFiles ||
		artManifest.specs.length !== expected.artPairs ||
		manifest.objects.length !== expected.artFiles ||
		!Array.isArray(perceptualAudit?.records) ||
		perceptualAudit.records.length !== expected.artFiles
	) {
		throw new Error(
			'Accepted science-179-v1 art upload requires exactly 179 challenges, 239 pairs, 478 delivery objects and 478 perceptual records.'
		);
	}

	const deliveryValidation = validateQuestionArtDeliveryManifest(manifest, {
		artManifest,
		expectedCount: expected.artFiles
	});
	if (deliveryValidation.status !== 'passed') {
		throw new Error(
			`Delivery manifest validation failed:\n${deliveryValidation.issues.join('\n')}`
		);
	}
	const deliveryById = new Map(manifest.objects.map((object) => [object.id, object]));
	const assetInventory = artManifest.specs.map((spec) => {
		const dark = deliveryById.get(`${spec.id}-dark`);
		const light = deliveryById.get(`${spec.id}-light`);
		if (!dark || !light) {
			throw new Error(`Accepted delivery manifest is missing a pair for ${spec.id}.`);
		}
		return {
			id: spec.id,
			darkSha256: dark.sha256,
			lightSha256: light.sha256
		};
	});
	const perceptualValidation = validatePerceptualAudit(perceptualAudit, {
		manifest: artManifest,
		assetInventory,
		expectedRecordCount: expected.artFiles
	});
	if (perceptualValidation.status !== 'passed') {
		throw new Error(
			`Perceptual audit validation failed:\n${perceptualValidation.issues.join('\n')}`
		);
	}
	for (const object of manifest.objects) assertLocalObjectCurrent(object);
	if (
		canonicalHash(buildPerceptualAudit(artManifest, { rootDir: artEvidenceRoot })) !==
		canonicalHash(perceptualAudit)
	) {
		throw new Error('Perceptual audit differs from a fresh hash of all 478 accepted image bytes.');
	}

	return {
		contract: 'science-179-v1',
		manifestPath: deliveryPath,
		manifest,
		fileSha256: sha256(bytes),
		canonicalSha256: canonicalHash(manifest),
		releaseCanonicalSha256: releaseEvidence.releaseCanonicalSha256,
		siblingSetSha256: releaseEvidence.siblingSetSha256,
		artPairCount: artManifest.specs.length,
		perceptualRecordCount: perceptualAudit.records.length,
		releaseRoot,
		releaseTree: {
			releaseSha256: releaseEvidence.releaseCanonicalSha256,
			siblingSetSha256: releaseEvidence.siblingSetSha256,
			counts: structuredClone(releaseEvidence.counts)
		},
		watchedFiles: releaseEvidence.watchedFiles
	};
}

function captureAcceptedSubsetReleaseEvidenceBinding({
	acceptedReleasePath,
	release,
	releaseBytes
}) {
	const releaseRoot = path.dirname(acceptedReleasePath);
	const validation = validateScienceChallengeAcceptedReleaseTree({
		releaseRoot,
		expectedReleaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID
	});
	assertExactAcceptedReleaseSibling(
		acceptedReleasePath,
		validation.releaseRoot,
		'accepted-challenges.json',
		'accepted release'
	);
	if (
		canonicalHash(release) !== validation.releaseSha256 ||
		canonicalHash(release) !== canonicalHash(validation.marker)
	) {
		throw new Error('Accepted release marker differs from the authenticated science-179-v1 tree.');
	}
	const watchedFiles = [watchFile(acceptedReleasePath, releaseBytes)];
	for (const sibling of validation.marker.release.siblings) {
		const siblingPath = path.join(validation.releaseRoot, sibling.path);
		watchedFiles.push(watchFile(siblingPath, readFileSync(siblingPath)));
	}
	return {
		contract: 'science-179-v1',
		release: validation.marker,
		releaseBytes,
		releaseRoot: validation.releaseRoot,
		values: validation.values,
		counts: validation.counts,
		releaseCanonicalSha256: validation.releaseSha256,
		siblingSetSha256: validation.siblingSetSha256,
		watchedFiles
	};
}

function captureReleaseEvidenceBinding(acceptedReleasePath) {
	if (!existsSync(acceptedReleasePath)) {
		throw new Error(`Accepted release does not exist: ${acceptedReleasePath}`);
	}
	const releaseBytes = readFileSync(acceptedReleasePath);
	const release = JSON.parse(releaseBytes.toString('utf8'));
	if (release.release?.status !== 'accepted') {
		throw new Error('Release-evidence replay requires an accepted release.');
	}
	if (release.release.id === SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID) {
		return captureAcceptedSubsetReleaseEvidenceBinding({
			acceptedReleasePath,
			release,
			releaseBytes
		});
	}
	const shortRecallEvidence = readScienceChallengeReleaseShortRecallUploadEvidence({
		acceptedReleasePath,
		release
	});
	if (shortRecallEvidence.status !== 'passed') {
		throw new Error(
			`Accepted short-recall upload evidence failed:\n${shortRecallEvidence.issues.join('\n')}`
		);
	}
	const provenanceRoot = path.join(path.dirname(acceptedReleasePath), 'provenance');
	const provenanceBindings = scienceChallengeProvenanceBindings(release.release);
	const provenanceValidation = validateScienceChallengeProvenanceArchive({
		archiveRoot: provenanceRoot,
		expectedBindings: provenanceBindings
	});
	if (provenanceValidation.status !== 'passed') {
		throw new Error(
			`Accepted provenance archive validation failed:\n${provenanceValidation.issues.join('\n')}`
		);
	}
	const provenanceManifest = provenanceValidation.manifest;
	if (
		canonicalHash(provenanceManifest) !== release.release.provenanceArchiveSha256 ||
		provenanceManifest.releaseId !== release.release.id ||
		provenanceManifest.materializedAt !== release.release.materializedAt
	) {
		throw new Error('Accepted release does not bind this exact provenance archive.');
	}
	const uploadEvidence = validateScienceChallengeReleaseUploadEvidence({
		archiveRoot: provenanceRoot,
		provenanceManifest,
		release
	});
	if (uploadEvidence.status !== 'passed') {
		throw new Error(
			`Accepted release upload evidence failed:\n${uploadEvidence.issues.join('\n')}`
		);
	}
	return {
		contract: 'legacy',
		release,
		releaseBytes,
		releaseCanonicalSha256: canonicalHash(release),
		provenanceArchiveSha256: canonicalHash(provenanceManifest),
		basePlanSha256: canonicalHash(uploadEvidence.basePlan),
		effectivePlanSha256: canonicalHash(uploadEvidence.effectivePlan),
		candidateSetSha256: uploadEvidence.candidateSetSha256,
		shortRecallBundleSha256: shortRecallEvidence.bundleSha256,
		shortRecallReviewSha256: shortRecallEvidence.reviewSha256,
		shortRecallAuthoringEvidenceSha256: shortRecallEvidence.authoringEvidenceSha256,
		provenanceRoot,
		provenanceBindings,
		provenanceRelease: {
			sha256: release.release.provenanceArchiveSha256,
			releaseId: release.release.id,
			materializedAt: release.release.materializedAt
		},
		uploadEvidence,
		shortRecallEvidence,
		watchedFiles: [
			watchFile(acceptedReleasePath, releaseBytes),
			watchFile(shortRecallEvidence.files.prompts.path, shortRecallEvidence.files.prompts.bytes),
			watchFile(
				shortRecallEvidence.files.reviewEvidence.path,
				shortRecallEvidence.files.reviewEvidence.bytes
			),
			watchFile(
				shortRecallEvidence.files.authoringEvidence.path,
				shortRecallEvidence.files.authoringEvidence.bytes
			)
		]
	};
}

function assertReleaseEvidenceCurrent(bindingValue) {
	if (bindingValue.contract === 'science-179-v1') {
		const validation = validateScienceChallengeAcceptedReleaseTree({
			releaseRoot: bindingValue.releaseRoot,
			expectedReleaseId: SCIENCE_CHALLENGE_ACCEPTED_RELEASE_ID
		});
		if (
			validation.releaseSha256 !== bindingValue.releaseTree.releaseSha256 ||
			validation.siblingSetSha256 !== bindingValue.releaseTree.siblingSetSha256 ||
			canonicalHash(validation.counts) !== canonicalHash(bindingValue.releaseTree.counts)
		) {
			throw new Error('Accepted science-179-v1 release tree changed during upload.');
		}
		return;
	}
	const validation = validateScienceChallengeProvenanceArchive({
		archiveRoot: bindingValue.provenanceRoot,
		expectedBindings: bindingValue.provenanceBindings
	});
	if (
		validation.status !== 'passed' ||
		canonicalHash(validation.manifest) !== bindingValue.provenanceRelease.sha256 ||
		validation.manifest?.releaseId !== bindingValue.provenanceRelease.releaseId ||
		validation.manifest?.materializedAt !== bindingValue.provenanceRelease.materializedAt
	) {
		throw new Error(
			`Accepted provenance archive changed during upload:\n${validation.issues.join('\n')}`
		);
	}
}

function assertExactAcceptedReleaseSibling(actualPath, releaseRoot, relativePath, label) {
	const expectedPath = path.join(releaseRoot, relativePath);
	if (path.resolve(actualPath) !== expectedPath) {
		throw new Error(`science-179-v1 ${label} must be the exact ${relativePath} release sibling.`);
	}
}

function assertManifestCurrent(bindingValue, requireHash = false) {
	for (const watched of bindingValue.watchedFiles) {
		const stats = statSync(watched.path);
		if (stats.size !== watched.size || stats.mtimeMs !== watched.mtimeMs) {
			throw new Error(`${watched.label} changed during upload.`);
		}
		if (requireHash && sha256(readFileSync(watched.path)) !== watched.sha256) {
			throw new Error(`${watched.label} bytes changed during upload.`);
		}
	}
}

function watchFile(filePath, bytes) {
	const stats = statSync(filePath);
	return {
		path: filePath,
		label: path.basename(filePath),
		size: stats.size,
		mtimeMs: stats.mtimeMs,
		sha256: sha256(bytes)
	};
}

function assertLocalObjectCurrent(object) {
	const filePath = path.resolve(artEvidenceRoot, object.localPath);
	const allowedRoot = path.join(artEvidenceRoot, 'tmp', 'science-challenges');
	if (!filePath.startsWith(`${allowedRoot}${path.sep}`)) {
		throw new Error(
			`Challenge art local path escapes the ignored release workspace: ${object.localPath}`
		);
	}
	if (!existsSync(filePath)) throw new Error(`Challenge art file is missing: ${object.localPath}`);
	const entry = lstatSync(filePath);
	if (!entry.isFile() || entry.isSymbolicLink()) {
		throw new Error(`Challenge art file must be an ordinary file: ${object.localPath}`);
	}
	const realPath = realpathSync(filePath);
	if (!realPath.startsWith(`${allowedRoot}${path.sep}`)) {
		throw new Error(`Challenge art file resolves outside the evidence root: ${object.localPath}`);
	}
	const stats = statSync(realPath);
	if (stats.size !== object.size || sha256(readFileSync(realPath)) !== object.sha256) {
		throw new Error(`Challenge art file differs from the delivery manifest: ${object.localPath}`);
	}
}

function resolveArtEvidenceRoot(value) {
	const resolved = path.resolve(rootDir, value);
	if (!existsSync(resolved)) {
		throw new Error('--art-evidence-root must be an existing real directory.');
	}
	const entry = lstatSync(resolved);
	if (!entry.isDirectory() || entry.isSymbolicLink()) {
		throw new Error('--art-evidence-root must be an existing real directory.');
	}
	return realpathSync(resolved);
}

function wranglerCommand() {
	const local = path.join(rootDir, 'node_modules', '.bin', 'wrangler');
	return existsSync(local) ? local : 'wrangler';
}

async function runConcurrent(tasks, concurrency) {
	const results = new Array(tasks.length);
	let cursor = 0;
	async function worker() {
		while (cursor < tasks.length) {
			const index = cursor;
			cursor += 1;
			try {
				results[index] = await tasks[index]();
			} catch (error) {
				results[index] = {
					status: 'failed',
					error: error instanceof Error ? error.message : String(error)
				};
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
	return results;
}

function parseArgs(argv) {
	const booleanOptions = new Set(['help', 'upload', 'release-evidence-only']);
	const valueOptions = new Set([
		'manifest',
		'art-manifest',
		'release',
		'art-evidence-root',
		'expected-file-sha256',
		'expected-canonical-sha256',
		'expected-release-sha256',
		'concurrency',
		'retries'
	]);
	const values = new Map();
	for (const arg of argv) {
		if (arg === '-h') {
			if (values.has('help')) throw new Error('Duplicate option --help.');
			values.set('help', true);
			continue;
		}
		if (!arg.startsWith('--')) {
			throw new Error(`Unexpected positional argument: ${arg}`);
		}
		const body = arg.slice(2);
		const assignment = body.indexOf('=');
		const key = assignment === -1 ? body : body.slice(0, assignment);
		const value = assignment === -1 ? null : body.slice(assignment + 1);
		if (booleanOptions.has(key)) {
			if (assignment !== -1) {
				throw new Error(`Boolean option --${key} does not accept a value.`);
			}
			if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
			values.set(key, true);
			continue;
		}
		if (!valueOptions.has(key)) throw new Error(`Unknown option --${key}.`);
		if (assignment === -1 || !value) {
			throw new Error(`Option --${key} requires a non-empty value.`);
		}
		if (values.has(key)) throw new Error(`Duplicate option --${key}.`);
		values.set(key, value);
	}
	return {
		help: Boolean(values.get('help')),
		upload: Boolean(values.get('upload')),
		releaseEvidenceOnly: Boolean(values.get('release-evidence-only')),
		manifest: String(
			values.get('manifest') ?? 'data/challenges/releases/science-179-v1/art-delivery-manifest.json'
		),
		artManifest: String(
			values.get('art-manifest') ?? 'data/challenges/releases/science-179-v1/art-manifest.json'
		),
		release: String(
			values.get('release') ?? 'data/challenges/releases/science-179-v1/accepted-challenges.json'
		),
		artEvidenceRoot: String(values.get('art-evidence-root') ?? '.'),
		expectedFileSha256: String(values.get('expected-file-sha256') ?? ''),
		expectedCanonicalSha256: String(values.get('expected-canonical-sha256') ?? ''),
		expectedReleaseSha256: String(values.get('expected-release-sha256') ?? ''),
		concurrency: integer(values.get('concurrency') ?? 4, '--concurrency', 1, 8),
		retries: integer(values.get('retries') ?? 2, '--retries', 0, 5)
	};
}

function integer(value, label, minimum, maximum) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
		throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
	}
	return parsed;
}

function usage() {
	return [
		'Usage: node scripts/upload-science-challenge-art.mjs [options]',
		'',
		'Dry-run is the default and performs no network calls.',
		'Defaults authenticate the closed science-179-v1 release tree and exactly 239 pairs / 478 WebPs.',
		'--upload                              Explicitly authorize R2 writes and exact readback',
		'--release-evidence-only               Replay accepted provenance/cohort evidence only',
		'--manifest=<art-delivery-manifest.json>',
		'--art-manifest=<art-manifest.json>',
		'--release=<accepted-challenges.json>',
		'--art-evidence-root=<real directory> Resolve manifest localPath values here (default cwd)',
		'',
		'science-179-v1 replays the exact closed release tree; legacy releases replay <release>/provenance.',
		'--expected-file-sha256=<sha256>       Required with --upload',
		'--expected-canonical-sha256=<sha256>  Required with --upload',
		'--expected-release-sha256=<sha256>    Required with --upload',
		'--concurrency=<1-8>                   Default 4',
		'--retries=<0-5>                       Default 2'
	].join('\n');
}
