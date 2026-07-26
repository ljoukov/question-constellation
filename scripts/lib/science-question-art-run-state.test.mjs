import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	ART_WORK_ROOT_LOCK_SCHEMA,
	acquireArtReleaseLock,
	acquireArtWorkRootLock,
	inspectAttemptSlots,
	passedJobArtifactPaths,
	prepareArtSpecDirectory,
	prepareRepairLineageIdentity,
	prepareOwnedArtWorkRoot
} from './science-question-art-run-state.mjs';

const MANIFEST_HASH = 'a'.repeat(64);

test('work-root ownership is exact and rejects unowned, rebound and symlink roots', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-owned-root-'));
	try {
		const owned = path.join(root, 'owned');
		const first = prepareOwnedArtWorkRoot({
			workRoot: owned,
			workspaceRoot: root,
			releaseId: 'science-test-v1',
			manifestSha256: MANIFEST_HASH
		});
		assert.equal(first.action, 'created');
		assert.equal(JSON.parse(readFileSync(first.markerPath, 'utf8')).manifestSha256, MANIFEST_HASH);
		assert.equal(
			prepareOwnedArtWorkRoot({
				workRoot: owned,
				workspaceRoot: root,
				releaseId: 'science-test-v1',
				manifestSha256: MANIFEST_HASH
			}).action,
			'validated'
		);
		assert.throws(
			() =>
				prepareOwnedArtWorkRoot({
					workRoot: owned,
					workspaceRoot: root,
					releaseId: 'science-test-v1',
					manifestSha256: 'b'.repeat(64)
				}),
			/does not bind/
		);

		const unowned = path.join(root, 'unowned');
		mkdirSync(unowned);
		writeFileSync(path.join(unowned, 'somebody-elses-file'), 'keep');
		assert.throws(
			() =>
				prepareOwnedArtWorkRoot({
					workRoot: unowned,
					workspaceRoot: root,
					releaseId: 'science-test-v1',
					manifestSha256: MANIFEST_HASH
				}),
			/content but no ownership marker/
		);

		const lockOnly = path.join(root, 'lock-only');
		mkdirSync(lockOnly);
		writeFileSync(path.join(lockOnly, '.science-question-art.lock'), '{}\n');
		assert.throws(
			() =>
				prepareOwnedArtWorkRoot({
					workRoot: lockOnly,
					workspaceRoot: root,
					releaseId: 'science-test-v1',
					manifestSha256: MANIFEST_HASH
				}),
			/content but no ownership marker/
		);
		assert.equal(existsSync(path.join(lockOnly, '.science-question-art-work-root')), false);

		const target = path.join(root, 'target');
		const linked = path.join(root, 'linked');
		mkdirSync(target);
		symlinkSync(target, linked);
		assert.throws(
			() =>
				prepareOwnedArtWorkRoot({
					workRoot: linked,
					workspaceRoot: root,
					releaseId: 'science-test-v1',
					manifestSha256: MANIFEST_HASH
				}),
			/not a real directory/
		);

		const ancestorTarget = path.join(root, 'ancestor-target');
		const ancestorLink = path.join(root, 'ancestor-link');
		mkdirSync(ancestorTarget);
		symlinkSync(ancestorTarget, ancestorLink);
		assert.throws(
			() =>
				prepareOwnedArtWorkRoot({
					workRoot: path.join(ancestorLink, 'new', 'deep'),
					workspaceRoot: root,
					releaseId: 'science-test-v1',
					manifestSha256: MANIFEST_HASH
				}),
			/symbolic link|not a real directory/
		);
		assert.equal(existsSync(path.join(ancestorTarget, 'new')), false);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('spec work directories cannot redirect through symbolic links', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-spec-symlink-'));
	try {
		const workRoot = path.join(root, 'work');
		const outside = path.join(root, 'outside');
		prepareOwnedArtWorkRoot({
			workRoot,
			workspaceRoot: root,
			releaseId: 'science-test-v1',
			manifestSha256: MANIFEST_HASH
		});
		mkdirSync(outside);
		symlinkSync(outside, path.join(workRoot, 'biology-test-opening'));
		assert.throws(
			() =>
				prepareArtSpecDirectory({
					workRoot,
					artId: 'biology-test-opening'
				}),
			/not a real directory/
		);
		assert.deepEqual(readdirNames(outside), []);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('exclusive lock rejects a live owner and recovers only a valid dead-owner lock', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-lock-'));
	try {
		prepareOwnedArtWorkRoot({
			workRoot: root,
			workspaceRoot: path.dirname(root),
			releaseId: 'science-test-v1',
			manifestSha256: MANIFEST_HASH
		});
		const first = acquireArtWorkRootLock({
			workRoot: root,
			releaseId: 'science-test-v1',
			manifestSha256: MANIFEST_HASH,
			processId: 101,
			host: 'test-host',
			isProcessAlive: () => true
		});
		assert.throws(
			() =>
				acquireArtWorkRootLock({
					workRoot: root,
					releaseId: 'science-test-v1',
					manifestSha256: MANIFEST_HASH,
					processId: 202,
					host: 'test-host',
					isProcessAlive: () => true
				}),
			/already locked by live process 101/
		);
		first.release();
		assert.equal(existsSync(first.lockPath), false);

		const stalePath = path.join(root, '.science-question-art.lock');
		writeFileSync(
			stalePath,
			`${JSON.stringify({
				schemaVersion: ART_WORK_ROOT_LOCK_SCHEMA,
				releaseId: 'science-test-v1',
				manifestSha256: MANIFEST_HASH,
				processId: 303,
				host: 'test-host',
				token: '00000000-0000-4000-8000-000000000001',
				acquiredAt: '2026-01-01T00:00:00.000Z'
			})}\n`
		);
		const recovered = acquireArtWorkRootLock({
			workRoot: root,
			releaseId: 'science-test-v1',
			manifestSha256: MANIFEST_HASH,
			processId: 404,
			host: 'test-host',
			isProcessAlive: () => false
		});
		assert.equal(recovered.lock.processId, 404);
		recovered.release();

		writeFileSync(stalePath, '{broken');
		assert.throws(
			() =>
				acquireArtWorkRootLock({
					workRoot: root,
					releaseId: 'science-test-v1',
					manifestSha256: MANIFEST_HASH,
					processId: 505,
					host: 'test-host',
					isProcessAlive: () => false
				}),
			/malformed/
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('canonical release lock excludes a second process even when work roots differ', async () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-release-lock-'));
	const moduleUrl = new URL('./science-question-art-run-state.mjs', import.meta.url).href;
	const firstWorkRoot = path.join(root, 'work-a');
	const secondWorkRoot = path.join(root, 'work-b');
	let child;
	try {
		for (const workRoot of [firstWorkRoot, secondWorkRoot]) {
			prepareOwnedArtWorkRoot({
				workRoot,
				workspaceRoot: root,
				releaseId: 'science-test-v1',
				manifestSha256: MANIFEST_HASH
			});
		}
		child = spawn(
			process.execPath,
			[
				'--input-type=module',
				'--eval',
				`import { acquireArtReleaseLock, acquireArtWorkRootLock } from ${JSON.stringify(moduleUrl)};
const releaseLock = acquireArtReleaseLock({
  workspaceRoot: process.argv[1],
  releaseId: 'science-test-v1',
  manifestSha256: '${MANIFEST_HASH}'
});
const workLock = acquireArtWorkRootLock({
  workRoot: process.argv[2],
  releaseId: 'science-test-v1',
  manifestSha256: '${MANIFEST_HASH}'
});
process.stdout.write('ready\\n');
process.stdin.once('data', () => {
  workLock.release();
  releaseLock.release();
  process.exit(0);
});
process.stdin.resume();`,
				root,
				firstWorkRoot
			],
			{ stdio: ['pipe', 'pipe', 'pipe'] }
		);
		const [ready] = await once(child.stdout, 'data');
		assert.match(String(ready), /ready/);
		assert.throws(
			() =>
				acquireArtReleaseLock({
					workspaceRoot: root,
					releaseId: 'science-test-v1',
					manifestSha256: MANIFEST_HASH
				}),
			/already locked by live process/
		);
		const secondWorkLock = acquireArtWorkRootLock({
			workRoot: secondWorkRoot,
			releaseId: 'science-test-v1',
			manifestSha256: MANIFEST_HASH
		});
		secondWorkLock.release();
		child.stdin.write('release\n');
		const [exitCode] = await once(child, 'exit');
		assert.equal(exitCode, 0);
	} finally {
		if (child && child.exitCode === null) child.kill();
		rmSync(root, { recursive: true, force: true });
	}
});

test('attempt slots are immutable, monotonic and capped across invocations', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-attempt-slots-'));
	try {
		assert.deepEqual(inspectAttemptSlots({ specDir: root }), {
			slots: new Map(),
			nextAttempt: 1
		});
		for (let attempt = 1; attempt <= 4; attempt += 1) {
			mkdirSync(path.join(root, `attempt-${String(attempt).padStart(2, '0')}`));
			assert.equal(
				inspectAttemptSlots({ specDir: root }).nextAttempt,
				attempt === 4 ? null : attempt + 1
			);
		}
		rmSync(path.join(root, 'attempt-02'), { recursive: true });
		assert.throws(() => inspectAttemptSlots({ specDir: root }), /non-monotonic gap/);
		mkdirSync(path.join(root, 'attempt-02'));
		mkdirSync(path.join(root, 'attempt-1'));
		assert.throws(() => inspectAttemptSlots({ specDir: root }), /Malformed reserved/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('repair attempt prefixes are bound to one full evidence hash', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-repair-identity-'));
	const prefix = 'abcdef123456';
	try {
		const firstHash = `${prefix}${'a'.repeat(52)}`;
		const secondHash = `${prefix}${'b'.repeat(52)}`;
		prepareRepairLineageIdentity({
			specDir: root,
			repairRunId: prefix,
			repairEvidenceKind: 'independent-review',
			repairEvidenceSha256: firstHash
		});
		assert.throws(
			() =>
				prepareRepairLineageIdentity({
					specDir: root,
					repairRunId: prefix,
					repairEvidenceKind: 'independent-review',
					repairEvidenceSha256: secondHash
				}),
			(error) => {
				assert.equal(error.code, 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID');
				assert.match(error.message, /different full-hash evidence/);
				return true;
			}
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('passed job image artifacts are protected and malformed passed claims fail closed', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-protected-attempt-'));
	try {
		const specDir = path.join(root, 'work', 'biology-test-opening');
		const attemptDir = path.join(specDir, 'attempt-01');
		mkdirSync(attemptDir, { recursive: true });
		const artifacts = {
			darkMaster: 'dark-master.webp',
			lightMaster: 'light-master.webp',
			darkNormalized: 'dark.webp',
			lightNormalized: 'light.webp'
		};
		for (const name of Object.values(artifacts)) writeFileSync(path.join(attemptDir, name), name);
		const job = {
			status: 'passed',
			attempt: 1,
			artifacts: Object.fromEntries(
				Object.entries(artifacts).map(([key, name]) => [
					key,
					{ path: path.relative(root, path.join(attemptDir, name)) }
				])
			)
		};
		const jobPath = path.join(specDir, 'job.json');
		writeFileSync(jobPath, `${JSON.stringify(job)}\n`);
		assert.deepEqual(
			passedJobArtifactPaths({ specDir, rootDir: root }),
			new Set(Object.values(artifacts).map((name) => path.join(attemptDir, name)))
		);

		job.artifacts.darkMaster.path = path.relative(root, path.join(specDir, 'wrong.webp'));
		writeFileSync(jobPath, `${JSON.stringify(job)}\n`);
		assert.throws(
			() => passedJobArtifactPaths({ specDir, rootDir: root }),
			(error) => {
				assert.equal(error.code, 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID');
				assert.equal(error.resumable, true);
				assert.match(error.message, /invalid darkMaster path/);
				return true;
			}
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

function readdirNames(directory) {
	return existsSync(directory) ? readdirSync(directory) : [];
}
