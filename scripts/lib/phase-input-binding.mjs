// @ts-nocheck -- Unknown JSON inputs are parsed and bound by exact runtime digest checks.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { canonicalJsonSha256, sha256 } from './codex-phase-artifacts.mjs';

/**
 * Capture one JSON file from a single byte read and optionally require the
 * caller's exact byte and canonical JSON hashes. The returned bytes are kept
 * in memory so a verified snapshot can be written without reopening a mutable
 * source path.
 */
export function captureBoundJsonInput(
	filePath,
	{
		rootDir = process.cwd(),
		expectedSha256 = '',
		expectedCanonicalJsonSha256 = '',
		label = 'JSON input'
	} = {}
) {
	const resolvedPath = path.resolve(filePath);
	if (!existsSync(resolvedPath)) throw new Error(`${label} does not exist: ${resolvedPath}`);
	const bytes = readFileSync(resolvedPath);
	let value;
	try {
		value = JSON.parse(bytes.toString('utf8'));
	} catch (error) {
		throw new Error(`${label} is not valid JSON: ${resolvedPath}`, { cause: error });
	}
	const artifact = {
		path: relativePath(rootDir, resolvedPath),
		sha256: sha256(bytes),
		canonicalJsonSha256: canonicalJsonSha256(value)
	};
	assertExpectedDigest(expectedSha256, artifact.sha256, `${label} byte SHA-256`);
	assertExpectedDigest(
		expectedCanonicalJsonSha256,
		artifact.canonicalJsonSha256,
		`${label} canonical JSON SHA-256`
	);
	return { path: resolvedPath, rootDir: path.resolve(rootDir), artifact, bytes, value };
}

/**
 * Re-read a bound path once and fail when either its bytes or parsed JSON
 * differ from the captured input.
 */
export function assertBoundJsonInputCurrent(binding, { label = 'JSON input' } = {}) {
	const current = captureBoundJsonInput(binding.path, {
		rootDir: binding.rootDir ?? process.cwd(),
		label
	});
	assertExactJsonArtifactsEqual(binding.artifact, current.artifact, label);
	return current.artifact;
}

/**
 * Write the already-captured bytes to a dedicated read-only snapshot and
 * prove both the source and snapshot still equal the captured artifact.
 */
export function stageBoundJsonSnapshot(
	binding,
	snapshotPath,
	{ rootDir = process.cwd(), label = 'JSON input' } = {}
) {
	const resolvedSnapshotPath = path.resolve(snapshotPath);
	mkdirSync(path.dirname(resolvedSnapshotPath), { recursive: true });
	rmSync(resolvedSnapshotPath, { force: true });
	writeFileSync(resolvedSnapshotPath, binding.bytes, { mode: 0o444 });
	chmodSync(resolvedSnapshotPath, 0o444);
	const snapshot = captureBoundJsonInput(resolvedSnapshotPath, {
		rootDir,
		label: `${label} snapshot`
	});
	assertExactJsonArtifactsEqual(binding.artifact, snapshot.artifact, `${label} snapshot`);
	assertBoundJsonInputCurrent(binding, { label });
	return snapshot;
}

export function assertExactJsonArtifactsEqual(expected, actual, label = 'JSON artifact') {
	if (
		!validDigest(expected?.sha256) ||
		!validDigest(expected?.canonicalJsonSha256) ||
		expected.sha256 !== actual?.sha256 ||
		expected.canonicalJsonSha256 !== actual?.canonicalJsonSha256
	) {
		throw new Error(`${label} differs from its exact bound artifact.`);
	}
	return true;
}

export function exactJsonArtifactMatches(expected, actual) {
	try {
		return assertExactJsonArtifactsEqual(expected, actual);
	} catch {
		return false;
	}
}

function assertExpectedDigest(expected, actual, label) {
	if (!expected) return;
	if (!validDigest(expected)) throw new Error(`${label} must be a lowercase 64-character digest.`);
	if (expected !== actual) throw new Error(`${label} differs from the expected digest.`);
}

function relativePath(rootDir, filePath) {
	return path.relative(rootDir, path.resolve(filePath)).split(path.sep).join('/');
}

function validDigest(value) {
	return /^[a-f0-9]{64}$/.test(String(value ?? ''));
}
