/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Untrusted release JSON is validated by explicit runtime schema and digest guards.
import { createHash } from 'node:crypto';
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';
import {
	binaryArtifact,
	fileSha256,
	jsonArtifact,
	stableJsonStringify
} from './codex-phase-artifacts.mjs';

export const LEARNER_ASSET_BUNDLE_SCHEMA = 'learner-visible-local-asset-bundle-v1';
export const LEARNER_ASSET_COPY_ATTESTATION_SCHEMA = 'verified-learner-visible-asset-copies-v1';

const LOCAL_PATH_FIELDS = ['filePath', 'file_path', 'localPath', 'sourcePath', 'path', 'file'];
const LEARNER_BLOCK_FIELDS = ['stemBlocks', 'leadBlocks', 'promptBlocks', 'afterResponseBlocks'];
const ASSET_ID_FIELDS = ['assetId', 'id', 'sourceLabel', 'assetLabel', 'label'];

export function stageLearnerVisibleAssetBundle({
	paper,
	paperArtifact = null,
	rootDir = process.cwd(),
	bundleRoot,
	sourceDocumentId
}) {
	const resolvedRoot = path.resolve(rootDir);
	const resolvedBundleRoot = path.resolve(bundleRoot);
	const paperSourceDocumentId = String(
		paper?.sourceDocument?.id ?? paper?.sourceDocumentId ?? ''
	).trim();
	const expectedSourceDocumentId = String(sourceDocumentId ?? paperSourceDocumentId).trim();
	if (!expectedSourceDocumentId) {
		throw new Error('Learner asset bundle requires a source document id.');
	}
	if (paperSourceDocumentId && paperSourceDocumentId !== expectedSourceDocumentId) {
		throw new Error('Learner asset bundle source document id differs from the extraction.');
	}

	const collected = collectLearnerVisibleLocalAssets(paper, { rootDir: resolvedRoot });
	rmSync(resolvedBundleRoot, { recursive: true, force: true });
	mkdirSync(path.join(resolvedBundleRoot, 'assets'), { recursive: true });

	const entries = collected.map((item, index) => {
		const bytes = readStableFile(item.resolvedPath, `Learner-visible asset ${item.sourcePath}`);
		const sha256 = digest(bytes);
		const size = bytes.length;
		const fileName = path.basename(item.resolvedPath);
		const snapshotPath = path.join(
			resolvedBundleRoot,
			'assets',
			`${String(index + 1).padStart(3, '0')}-${fileName}`
		);
		writeFileSync(snapshotPath, bytes, { mode: 0o444 });
		chmodSync(snapshotPath, 0o444);
		assertBinary(snapshotPath, { sha256, size }, `Staged learner asset ${fileName}`);
		assertBinary(
			item.resolvedPath,
			{ sha256, size },
			`Learner-visible source asset ${item.sourcePath}`
		);
		return {
			sourcePath: item.sourcePath,
			sha256,
			size,
			contentType: contentTypeForFile(fileName),
			r2Key: `images/papers/${expectedSourceDocumentId}/${fileName}`,
			publicPath: `/images/papers/${expectedSourceDocumentId}/${fileName}`,
			snapshotPath: relativePath(resolvedRoot, snapshotPath),
			references: item.references
		};
	});
	assertUniqueDeliveryKeys(entries);

	const manifest = {
		schemaVersion: LEARNER_ASSET_BUNDLE_SCHEMA,
		sourceDocumentId: expectedSourceDocumentId,
		...(paperArtifact ? { extraction: paperArtifact } : {}),
		assetCount: entries.length,
		entries
	};
	const manifestPath = path.join(resolvedBundleRoot, 'manifest.json');
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o444 });
	chmodSync(manifestPath, 0o444);
	assertLearnerVisibleAssetBundleCurrent({
		paper,
		manifest,
		rootDir: resolvedRoot
	});
	return {
		path: manifestPath,
		manifest,
		artifact: jsonArtifact(manifestPath, { rootDir: resolvedRoot })
	};
}

export function collectLearnerVisibleLocalAssets(
	paper,
	{ rootDir = process.cwd(), requireFiles = true } = {}
) {
	if (!paper || typeof paper !== 'object' || !Array.isArray(paper.questions)) {
		throw new Error('Learner asset collection requires a paper with questions.');
	}
	const resolvedRoot = path.resolve(rootDir);
	const references = [];
	const referencedIds = new Set();

	for (const [questionIndex, question] of paper.questions.entries()) {
		const questionPointer = `/questions/${questionIndex}`;
		for (const [assetIndex, asset] of (question?.assets ?? []).entries()) {
			const pointer = `${questionPointer}/assets/${assetIndex}`;
			addIdentifiers(referencedIds, asset);
			collectObjectPaths(asset, pointer, references);
		}
		for (const field of LEARNER_BLOCK_FIELDS) {
			const blocks = question?.[field];
			if (!Array.isArray(blocks)) continue;
			walkLearnerBlocks(
				blocks,
				`${questionPointer}/${escapePointer(field)}`,
				references,
				referencedIds
			);
		}
	}

	const directResolved = new Set(
		references.map((reference) => resolveLocalPath(reference.declaredPath, resolvedRoot))
	);
	for (const [manifestIndex, asset] of (paper.localAssetManifest ?? []).entries()) {
		const identifiers = identifiersFor(asset);
		const localPaths = objectLocalPaths(asset);
		const pathMatches = localPaths.some((entry) =>
			directResolved.has(resolveLocalPath(entry.value, resolvedRoot))
		);
		const idMatches = identifiers.some((identifier) => referencedIds.has(identifier));
		if (!pathMatches && !idMatches) continue;
		collectObjectPaths(asset, `/localAssetManifest/${manifestIndex}`, references);
	}

	const grouped = new Map();
	for (const reference of references) {
		const resolvedPath = resolveLocalPath(reference.declaredPath, resolvedRoot);
		const sourcePath = relativePath(resolvedRoot, resolvedPath);
		if (requireFiles) assertRegularNonEmptyFile(resolvedPath, sourcePath);
		const record = grouped.get(sourcePath) ?? {
			sourcePath,
			resolvedPath,
			references: []
		};
		record.references.push({
			jsonPointer: reference.jsonPointer,
			field: reference.field,
			declaredPath: reference.declaredPath
		});
		grouped.set(sourcePath, record);
	}

	const entries = [...grouped.values()]
		.map((entry) => ({
			...entry,
			references: uniqueSortedReferences(entry.references)
		}))
		.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
	assertUniqueBasenames(entries);
	return entries;
}

export function assertLearnerVisibleAssetBundleCurrent({
	paper,
	manifest,
	rootDir = process.cwd(),
	requireSourceCurrent = true
}) {
	const resolvedRoot = path.resolve(rootDir);
	if (manifest?.schemaVersion !== LEARNER_ASSET_BUNDLE_SCHEMA) {
		throw new Error('Learner asset manifest has an unsupported schema.');
	}
	if (!Array.isArray(manifest.entries) || manifest.assetCount !== manifest.entries.length) {
		throw new Error('Learner asset manifest count differs from its entries.');
	}
	const paperSourceDocumentId = String(
		paper?.sourceDocument?.id ?? paper?.sourceDocumentId ?? ''
	).trim();
	if (paperSourceDocumentId && manifest.sourceDocumentId !== paperSourceDocumentId) {
		throw new Error('Learner asset manifest belongs to a different source document.');
	}

	const actual = collectLearnerVisibleLocalAssets(paper, {
		rootDir: resolvedRoot,
		requireFiles: requireSourceCurrent
	});
	const actualByPath = new Map(actual.map((entry) => [entry.sourcePath, entry]));
	const expectedPaths = manifest.entries.map((entry) => String(entry?.sourcePath ?? '')).sort();
	const actualPaths = actual.map((entry) => entry.sourcePath).sort();
	if (
		new Set(expectedPaths).size !== expectedPaths.length ||
		stableJsonStringify(expectedPaths) !== stableJsonStringify(actualPaths)
	) {
		throw new Error('Learner asset manifest has missing or extra extraction asset paths.');
	}

	for (const entry of manifest.entries) {
		const actualEntry = actualByPath.get(entry.sourcePath);
		if (
			!validDigest(entry.sha256) ||
			!Number.isInteger(entry.size) ||
			entry.size <= 0 ||
			!actualEntry ||
			stableJsonStringify(entry.references) !== stableJsonStringify(actualEntry.references)
		) {
			throw new Error(`Learner asset manifest metadata differs for ${entry.sourcePath}.`);
		}
		const sourcePath = path.resolve(resolvedRoot, entry.sourcePath);
		const snapshotPath = path.resolve(resolvedRoot, String(entry.snapshotPath ?? ''));
		assertInsideRoot(sourcePath, resolvedRoot, 'Learner asset source');
		assertInsideRoot(snapshotPath, resolvedRoot, 'Learner asset snapshot');
		if (requireSourceCurrent) {
			assertBinary(sourcePath, entry, `Learner-visible source asset ${entry.sourcePath}`);
		}
		assertBinary(snapshotPath, entry, `Learner asset snapshot ${entry.snapshotPath}`);
		const expectedName = path.basename(sourcePath);
		if (
			entry.r2Key !== `images/papers/${manifest.sourceDocumentId}/${expectedName}` ||
			entry.publicPath !== `/images/papers/${manifest.sourceDocumentId}/${expectedName}` ||
			entry.contentType !== contentTypeForFile(expectedName)
		) {
			throw new Error(`Learner asset delivery metadata differs for ${entry.sourcePath}.`);
		}
	}
	assertUniqueDeliveryKeys(manifest.entries);
	return true;
}

export function stageVerifiedLearnerAssetCopies({
	manifest,
	rootDir = process.cwd(),
	destinationRoot
}) {
	const resolvedRoot = path.resolve(rootDir);
	const resolvedDestinationRoot = path.resolve(destinationRoot);
	rmSync(resolvedDestinationRoot, { recursive: true, force: true });
	mkdirSync(resolvedDestinationRoot, { recursive: true });
	const entries = manifest.entries.map((entry) => {
		const sourceSnapshotPath = path.resolve(resolvedRoot, entry.snapshotPath);
		const bytes = readStableFile(
			sourceSnapshotPath,
			`Learner asset snapshot ${entry.snapshotPath}`
		);
		if (digest(bytes) !== entry.sha256 || bytes.length !== entry.size) {
			throw new Error(`Learner asset snapshot differs for ${entry.sourcePath}.`);
		}
		const consumerPath = path.join(resolvedDestinationRoot, path.basename(entry.sourcePath));
		writeFileSync(consumerPath, bytes, { mode: 0o444 });
		chmodSync(consumerPath, 0o444);
		assertBinary(consumerPath, entry, `Consumer learner asset ${entry.sourcePath}`);
		return {
			sourcePath: entry.sourcePath,
			sha256: entry.sha256,
			size: entry.size,
			r2Key: entry.r2Key,
			sourceSnapshot: binaryArtifact(sourceSnapshotPath, { rootDir: resolvedRoot }),
			consumerSnapshot: binaryArtifact(consumerPath, { rootDir: resolvedRoot }),
			consumerRelativePath: relativePath(path.dirname(resolvedDestinationRoot), consumerPath)
		};
	});
	return {
		schemaVersion: LEARNER_ASSET_COPY_ATTESTATION_SCHEMA,
		sourceDocumentId: manifest.sourceDocumentId,
		assetCount: entries.length,
		entries
	};
}

export function assertVerifiedLearnerAssetCopiesCurrent({
	manifest,
	attestation,
	rootDir = process.cwd()
}) {
	const resolvedRoot = path.resolve(rootDir);
	if (
		attestation?.schemaVersion !== LEARNER_ASSET_COPY_ATTESTATION_SCHEMA ||
		attestation.sourceDocumentId !== manifest.sourceDocumentId ||
		attestation.assetCount !== manifest.assetCount ||
		!Array.isArray(attestation.entries)
	) {
		throw new Error('Learner asset consumer-copy attestation is invalid.');
	}
	const expectedByPath = new Map(manifest.entries.map((entry) => [entry.sourcePath, entry]));
	if (
		new Set(attestation.entries.map((entry) => entry.sourcePath)).size !== manifest.entries.length
	) {
		throw new Error('Learner asset consumer-copy attestation has missing or extra assets.');
	}
	for (const copy of attestation.entries) {
		const expected = expectedByPath.get(copy.sourcePath);
		if (
			!expected ||
			copy.sha256 !== expected.sha256 ||
			copy.size !== expected.size ||
			copy.r2Key !== expected.r2Key
		) {
			throw new Error(`Learner asset consumer-copy metadata differs for ${copy.sourcePath}.`);
		}
		for (const artifact of [copy.sourceSnapshot, copy.consumerSnapshot]) {
			const artifactPath = path.resolve(resolvedRoot, String(artifact?.path ?? ''));
			assertInsideRoot(artifactPath, resolvedRoot, 'Learner asset consumer copy');
			assertBinary(artifactPath, expected, `Learner asset consumer copy ${copy.sourcePath}`);
			if (artifact.sha256 !== expected.sha256) {
				throw new Error(`Learner asset consumer artifact differs for ${copy.sourcePath}.`);
			}
		}
	}
	return true;
}

export function remapPaperToVerifiedLearnerAssets({
	paper,
	manifest,
	attestation,
	rootDir = process.cwd()
}) {
	assertVerifiedLearnerAssetCopiesCurrent({ manifest, attestation, rootDir });
	const resolvedRoot = path.resolve(rootDir);
	const mapped = new Map(
		attestation.entries.map((entry) => [
			entry.sourcePath,
			String(entry.consumerRelativePath).split(path.sep).join('/')
		])
	);
	const output = structuredClone(paper);

	function remapObject(value) {
		if (!value || typeof value !== 'object') return;
		for (const field of LOCAL_PATH_FIELDS) {
			const declared = value[field];
			if (!isLocalPathValue(declared)) continue;
			const sourcePath = relativePath(resolvedRoot, resolveLocalPath(declared, resolvedRoot));
			const replacement = mapped.get(sourcePath);
			if (!replacement) {
				throw new Error(`No verified learner asset copy exists for ${sourcePath}.`);
			}
			value[field] = replacement;
		}
	}

	for (const question of output.questions ?? []) {
		for (const asset of question?.assets ?? []) remapObject(asset);
		for (const field of LEARNER_BLOCK_FIELDS) {
			walkObjects(question?.[field], remapObject);
		}
	}
	if (Array.isArray(output.localAssetManifest)) {
		output.localAssetManifest = output.localAssetManifest.filter((asset) => {
			const localPaths = objectLocalPaths(asset);
			if (localPaths.length === 0) return false;
			const isBound = localPaths.every(({ value }) =>
				mapped.has(relativePath(resolvedRoot, resolveLocalPath(value, resolvedRoot)))
			);
			if (isBound) remapObject(asset);
			return isBound;
		});
	}
	return output;
}

export function learnerAssetManifestArtifact(manifestPath, { rootDir = process.cwd() } = {}) {
	return jsonArtifact(manifestPath, { rootDir });
}

function walkLearnerBlocks(value, pointer, references, referencedIds) {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		value.forEach((entry, index) =>
			walkLearnerBlocks(entry, `${pointer}/${index}`, references, referencedIds)
		);
		return;
	}
	addIdentifiers(referencedIds, value);
	collectObjectPaths(value, pointer, references);
	for (const [key, child] of Object.entries(value)) {
		if (LOCAL_PATH_FIELDS.includes(key)) continue;
		if (child && typeof child === 'object') {
			walkLearnerBlocks(child, `${pointer}/${escapePointer(key)}`, references, referencedIds);
		}
	}
}

function walkObjects(value, visitor) {
	if (!value || typeof value !== 'object') return;
	if (Array.isArray(value)) {
		for (const entry of value) walkObjects(entry, visitor);
		return;
	}
	visitor(value);
	for (const child of Object.values(value)) {
		if (child && typeof child === 'object') walkObjects(child, visitor);
	}
}

function collectObjectPaths(value, pointer, references) {
	for (const { field, value: declaredPath } of objectLocalPaths(value)) {
		references.push({
			jsonPointer: `${pointer}/${escapePointer(field)}`,
			field,
			declaredPath
		});
	}
}

function objectLocalPaths(value) {
	if (!value || typeof value !== 'object') return [];
	return LOCAL_PATH_FIELDS.flatMap((field) =>
		isLocalPathValue(value[field]) ? [{ field, value: String(value[field]) }] : []
	);
}

function isLocalPathValue(value) {
	const text = String(value ?? '').trim();
	return Boolean(text) && !/^[a-z][a-z0-9+.-]*:/i.test(text) && !text.startsWith('//');
}

function resolveLocalPath(value, rootDir) {
	const text = String(value ?? '').trim();
	const resolved = path.isAbsolute(text) ? path.resolve(text) : path.resolve(rootDir, text);
	assertInsideRoot(resolved, rootDir, 'Learner asset');
	return resolved;
}

function assertInsideRoot(filePath, rootDir, label) {
	const relative = path.relative(rootDir, filePath);
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw new Error(`${label} is outside the repository root: ${filePath}`);
	}
}

function assertRegularNonEmptyFile(filePath, displayPath) {
	if (!existsSync(filePath)) {
		throw new Error(`Referenced learner-visible asset is missing: ${displayPath}`);
	}
	const stats = statSync(filePath);
	if (!stats.isFile() || stats.size <= 0) {
		throw new Error(`Referenced learner-visible asset is not a non-empty file: ${displayPath}`);
	}
}

function readStableFile(filePath, label) {
	assertRegularNonEmptyFile(filePath, filePath);
	const before = statSync(filePath);
	const bytes = readFileSync(filePath);
	const after = statSync(filePath);
	if (
		before.size !== after.size ||
		before.mtimeMs !== after.mtimeMs ||
		before.ino !== after.ino ||
		bytes.length !== after.size
	) {
		throw new Error(`${label} changed while it was being captured.`);
	}
	return bytes;
}

function assertBinary(filePath, expected, label) {
	assertRegularNonEmptyFile(filePath, filePath);
	const stats = statSync(filePath);
	if (stats.size !== expected.size || fileSha256(filePath) !== expected.sha256) {
		throw new Error(`${label} differs from its exact SHA-256/size binding.`);
	}
}

function assertUniqueBasenames(entries) {
	const byName = new Map();
	for (const entry of entries) {
		const name = path.basename(entry.sourcePath);
		const previous = byName.get(name);
		if (previous && previous !== entry.sourcePath) {
			throw new Error(
				`Learner assets ${previous} and ${entry.sourcePath} collide on delivery basename ${name}.`
			);
		}
		byName.set(name, entry.sourcePath);
	}
}

function assertUniqueDeliveryKeys(entries) {
	const keys = entries.map((entry) => String(entry?.r2Key ?? ''));
	if (keys.some((key) => !key) || new Set(keys).size !== keys.length) {
		throw new Error('Learner asset manifest contains missing or duplicate R2 keys.');
	}
}

function uniqueSortedReferences(references) {
	const byCanonical = new Map(
		references.map((reference) => [stableJsonStringify(reference), reference])
	);
	return [...byCanonical.values()].sort(
		(left, right) =>
			left.jsonPointer.localeCompare(right.jsonPointer) ||
			left.field.localeCompare(right.field) ||
			left.declaredPath.localeCompare(right.declaredPath)
	);
}

function addIdentifiers(target, value) {
	for (const identifier of identifiersFor(value)) target.add(identifier);
}

function identifiersFor(value) {
	return ASSET_ID_FIELDS.map((field) =>
		String(value?.[field] ?? '')
			.trim()
			.toLowerCase()
	).filter(Boolean);
}

function escapePointer(value) {
	return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function relativePath(rootDir, filePath) {
	return path.relative(rootDir, path.resolve(filePath)).split(path.sep).join('/');
}

function digest(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function validDigest(value) {
	return /^[a-f0-9]{64}$/.test(String(value ?? ''));
}

function contentTypeForFile(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	if (['.jpg', '.jpeg'].includes(extension)) return 'image/jpeg';
	if (extension === '.png') return 'image/png';
	if (extension === '.webp') return 'image/webp';
	if (extension === '.gif') return 'image/gif';
	if (extension === '.svg') return 'image/svg+xml';
	return 'application/octet-stream';
}
