import { execFile as defaultExecFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	chmodSync,
	constants,
	copyFileSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const defaultExecFileAsync = promisify(defaultExecFile);

/**
 * Put one content-addressed WebP from a private read-only snapshot, then require an
 * exact R2 get/readback before reporting success.
 */
export async function uploadScienceChallengeArtObject({
	object,
	bucket,
	repositoryRoot,
	assetRoot = repositoryRoot,
	wranglerCommand,
	retries = 2,
	execFileAsync = defaultExecFileAsync,
	assertBindingCurrent = () => {},
	assertLocalObjectCurrent = () => {},
	wait = defaultWait
}) {
	const snapshotRoot = mkdtempSync(path.join(tmpdir(), 'science-challenge-art-upload-snapshot-'));
	const snapshotPath = path.join(snapshotRoot, `${object.sha256}.webp`);
	try {
		assertBindingCurrent();
		assertLocalObjectCurrent();
		copyFileSync(path.resolve(assetRoot, object.localPath), snapshotPath, constants.COPYFILE_EXCL);
		chmodSync(snapshotPath, 0o400);
		assertUploadSnapshotCurrent(snapshotPath, object);

		let lastError = null;
		for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
			try {
				assertBindingCurrent();
				assertLocalObjectCurrent();
				assertUploadSnapshotCurrent(snapshotPath, object);
				await execFileAsync(
					wranglerCommand,
					[
						'r2',
						'object',
						'put',
						`${bucket}/${object.r2Key}`,
						'--remote',
						'--file',
						snapshotPath,
						'--content-type',
						object.contentType,
						'--cache-control',
						object.cacheControl,
						'--force'
					],
					{
						cwd: repositoryRoot,
						env: process.env,
						maxBuffer: 4 * 1024 * 1024
					}
				);
				assertUploadSnapshotCurrent(snapshotPath, object);
				assertBindingCurrent();
				assertLocalObjectCurrent();
				await verifyRemoteObject({
					object,
					bucket,
					repositoryRoot,
					wranglerCommand,
					execFileAsync
				});
				return { id: object.id, status: 'passed', attempt };
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error);
				if (attempt <= retries) {
					await wait(Math.min(30_000, 1_000 * 2 ** (attempt - 1)));
				}
			}
		}
		return { id: object.id, status: 'failed', error: lastError };
	} finally {
		rmSync(snapshotRoot, { recursive: true, force: true });
	}
}

export function assertUploadSnapshotCurrent(snapshotPath, object) {
	if (
		!existsSync(snapshotPath) ||
		statSync(snapshotPath).size !== object.size ||
		sha256(readFileSync(snapshotPath)) !== object.sha256
	) {
		throw new Error(`Private upload snapshot differs from the reviewed bytes: ${object.r2Key}`);
	}
}

async function verifyRemoteObject({
	object,
	bucket,
	repositoryRoot,
	wranglerCommand,
	execFileAsync
}) {
	const readbackRoot = mkdtempSync(path.join(tmpdir(), 'science-challenge-art-r2-readback-'));
	const readbackPath = path.join(readbackRoot, `${object.sha256}.webp`);
	try {
		await execFileAsync(
			wranglerCommand,
			['r2', 'object', 'get', `${bucket}/${object.r2Key}`, '--remote', '--file', readbackPath],
			{
				cwd: repositoryRoot,
				env: process.env,
				maxBuffer: 4 * 1024 * 1024
			}
		);
		if (
			!existsSync(readbackPath) ||
			statSync(readbackPath).size !== object.size ||
			sha256(readFileSync(readbackPath)) !== object.sha256
		) {
			throw new Error(`Remote R2 readback differs from the reviewed bytes: ${object.r2Key}`);
		}
	} finally {
		rmSync(readbackRoot, { recursive: true, force: true });
	}
}

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function defaultWait(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
