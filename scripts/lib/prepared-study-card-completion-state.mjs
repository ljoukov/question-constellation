/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- Prepared queue-state JSON is validated by the orchestrator before mutation.
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function assertPreparedStudyCardSourcePdfLock(live, locked, batchId) {
	const valid = (value) =>
		value &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		Object.keys(value).sort().join(',') === 'path,sha256' &&
		typeof value.path === 'string' &&
		value.path.length > 0 &&
		typeof value.sha256 === 'string' &&
		SHA256_PATTERN.test(value.sha256);
	if (
		!valid(live) ||
		!valid(locked) ||
		live.path !== locked.path ||
		live.sha256 !== locked.sha256
	) {
		throw new Error(
			`${batchId} live official source PDF path/SHA-256 differs from the prepared queue lock.`
		);
	}
	return live;
}

export function preparedStudyCardAtomicTempPath(filePath) {
	return `${filePath}.tmp-${process.pid}`;
}

export function writePreparedStudyCardStateAtomically(filePath, value) {
	const temporaryPath = preparedStudyCardAtomicTempPath(filePath);
	writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
	renameSync(temporaryPath, filePath);
}

export function quarantineIncompletePreparedStudyCardRelease({
	releaseDir,
	requiredEvidenceFiles,
	quarantineRoot = path.dirname(releaseDir),
	suffix = `${Date.now()}-${process.pid}`
}) {
	if (!existsSync(releaseDir)) return null;
	const acceptedPath = path.join(releaseDir, 'accepted-study-cards.json');
	const lineagePath = path.join(releaseDir, 'model-lineage-evidence.json');
	if (existsSync(acceptedPath) && existsSync(lineagePath)) return null;
	const incomplete =
		!existsSync(acceptedPath) ||
		requiredEvidenceFiles.some((name) => !existsSync(path.join(releaseDir, name)));
	if (!incomplete) return null;
	mkdirSync(quarantineRoot, { recursive: true });
	const preservedPath = path.join(
		quarantineRoot,
		`${path.basename(releaseDir)}-preserved-incomplete-${suffix}`
	);
	renameSync(releaseDir, preservedPath);
	return preservedPath;
}

export function requeuePreparedStudyCardJobWithMissingArtifact(row) {
	if (row.status === 'queued') return row;
	row.status = 'queued';
	row.artifactHash = null;
	row.artifactPath = null;
	row.acceptedCardCount = null;
	row.lineageManifestPath = null;
	row.lineageManifestSha256 = null;
	row.note = row.preservedIncompleteReleaseDirs?.length
		? 'incomplete-durable-publication-preserved-and-requeued'
		: 'durable-artifact-missing-requeued';
	delete row.finishedAt;
	delete row.error;
	return row;
}
