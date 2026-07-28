import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sha256 } from './science-challenge-release.mjs';
import {
	ArtGenerationSafetyStop,
	DEFAULT_MIN_FREE_SPACE_GIB,
	GIB_BYTES,
	artGenerationExitCode,
	collectMinimumFreeSpaceTargets,
	createMinimumFreeSpaceGuard,
	imageServiceInfrastructureSafetyStop,
	inspectFailedAttemptImages,
	isArtGenerationSafetyStop,
	minimumFreeSpaceBytes,
	removeInspectedFailedAttemptImages,
	runConcurrentUntilStopped,
	serializeArtGenerationSafetyStop,
	storageExhaustionSafetyStop
} from './science-question-art-run-safety.mjs';

test('minimum-free-space guard reserves 10 GiB by default and latches a resumable stop', () => {
	assert.equal(DEFAULT_MIN_FREE_SPACE_GIB, 10);
	assert.equal(minimumFreeSpaceBytes(DEFAULT_MIN_FREE_SPACE_GIB), 10n * GIB_BYTES);
	assert.throws(() => minimumFreeSpaceBytes(0), /integer >= 1/);

	const readings = [11n * GIB_BYTES, 9n * GIB_BYTES];
	const inspectedTargets = [];
	const guard = createMinimumFreeSpaceGuard({
		paths: ['/art-work'],
		minimumBytes: minimumFreeSpaceBytes(10),
		getAvailableBytes: (targetPath) => {
			inspectedTargets.push(targetPath);
			return readings.shift();
		}
	});
	assert.doesNotThrow(() => guard.check({ phase: 'preflight' }));
	assert.throws(
		() => guard.check({ phase: 'before light generation', artId: 'biology-cell-opening' }),
		(error) => {
			assert.equal(error.code, 'SCIENCE_ART_MIN_FREE_SPACE');
			assert.equal(error.resumable, true);
			assert.match(error.message, /9\.00 GiB available, 10\.00 GiB required/);
			assert.match(error.message, /rerun with --resume/);
			assert.match(error.message, /target "art-work"/);
			assert.doesNotMatch(error.message, /\/art-work/);
			return true;
		}
	);
	assert.deepEqual(inspectedTargets, ['/art-work', '/art-work']);
	assert.deepEqual(guard.targets, ['/art-work']);
	assert.equal(guard.failure.details.phase, 'before light generation');
	assert.throws(
		() => guard.check({ phase: 'before normalization', artId: 'another-id' }),
		(error) => error === guard.failure
	);
	assert.deepEqual(serializeArtGenerationSafetyStop(guard.failure), {
		code: 'SCIENCE_ART_MIN_FREE_SPACE',
		message: guard.failure.message,
		resumable: true,
		phase: 'before light generation',
		artId: 'biology-cell-opening',
		targetPath: 'art-work',
		availableBytes: (9n * GIB_BYTES).toString(),
		minimumBytes: (10n * GIB_BYTES).toString(),
		reservedBytes: '0',
		headroomBytes: '0',
		requiredBytes: (10n * GIB_BYTES).toString()
	});
});

test('safety-stop reports recursively redact operator paths and protect base fields', () => {
	const macUserPath = path.posix.join('/Users', 'operator', 'private project', 'token.txt');
	const linuxUserPath = path.posix.join('/home', 'operator', 'art', 'job.json');
	const rootUserPath = path.posix.join('/root', 'generation', 'state.json');
	const privateTempPath = path.posix.join('/private', 'var', 'folders', 'run', 'image.webp');
	const tempPath = path.posix.join('/tmp', 'science-art', 'attempt.json');
	const windowsUserPath = ['C:', 'Users', 'operator', 'AppData', 'job.json'].join('\\');
	const windowsNetworkPath = ['', '', 'render-host', 'private-share', 'job.json'].join('\\');
	const fileUrl = `file://${macUserPath}`;
	const nestedError = Object.assign(new Error(`Could not read ${macUserPath}`), {
		path: linuxUserPath,
		dest: windowsUserPath,
		cause: new Error(`Temporary evidence remained at "${tempPath}"`)
	});
	const stop = new ArtGenerationSafetyStop(`Generation failed at ${windowsUserPath}`, {
		code: 'SCIENCE_ART_GENERATION_SAFETY_STOP',
		details: {
			code: 'ATTACKER_CODE',
			message: `attacker message ${privateTempPath}`,
			resumable: false,
			targetPath: rootUserPath,
			nested: {
				locations: [
					`mac="${macUserPath}"`,
					`linux=${linuxUserPath}`,
					`network '${windowsNetworkPath}'`,
					fileUrl,
					nestedError
				],
				keyedLocations: {
					[privateTempPath]: windowsUserPath
				}
			}
		}
	});

	assert.equal(stop.message.includes(windowsUserPath), false);
	assert.match(stop.message, /\[redacted filesystem path\]/);

	const serialized = serializeArtGenerationSafetyStop(stop);
	assert.equal(serialized.code, 'SCIENCE_ART_GENERATION_SAFETY_STOP');
	assert.equal(serialized.message, stop.message);
	assert.equal(serialized.resumable, true);
	assert.notEqual(serialized.message, 'attacker message');
	assert.match(serialized.targetPath, /\[redacted filesystem path\]/);
	assert.equal(serialized.nested.locations[4] instanceof Error, false);
	assert.match(serialized.nested.locations[4].message, /\[redacted filesystem path\]/);
	assert.match(serialized.nested.locations[4].cause.message, /\[redacted filesystem path\]/);
	assert.deepEqual(Object.keys(serialized.nested.keyedLocations), ['[redacted filesystem path]']);

	const reportText = JSON.stringify(serialized);
	for (const operatorPath of [
		macUserPath,
		linuxUserPath,
		rootUserPath,
		privateTempPath,
		tempPath,
		windowsUserPath,
		windowsNetworkPath,
		fileUrl
	]) {
		assert.equal(reportText.includes(operatorPath), false, `report leaked ${operatorPath}`);
	}

	const stopLikeObject = {
		code: 'SCIENCE_ART_MIN_FREE_SPACE',
		message: `Plain stop object referenced ${linuxUserPath}`,
		resumable: true,
		details: {
			code: 'ATTACKER_CODE',
			message: 'attacker message',
			resumable: false
		}
	};
	const serializedStopLikeObject = serializeArtGenerationSafetyStop(stopLikeObject);
	assert.equal(serializedStopLikeObject.code, 'SCIENCE_ART_MIN_FREE_SPACE');
	assert.match(serializedStopLikeObject.message, /\[redacted filesystem path\]/);
	assert.equal(serializedStopLikeObject.resumable, true);
});

test('safety-stop sanitization preserves shared details while marking true cycles', () => {
	const operatorPath = path.posix.join('/home', 'operator', 'art', 'shared.json');
	const shared = { location: operatorPath };
	const cyclic = {};
	cyclic.self = cyclic;
	const stop = new ArtGenerationSafetyStop('shared evidence failed', {
		code: 'SCIENCE_ART_GENERATION_SAFETY_STOP',
		details: { first: shared, second: shared, cyclic }
	});

	const serialized = serializeArtGenerationSafetyStop(stop);
	assert.deepEqual(serialized.first, serialized.second);
	assert.match(serialized.first.location, /\[redacted filesystem path\]/);
	assert.equal(serialized.cyclic.self, '[circular detail]');
});

test('disk target collection includes distinct existing work and output mount points', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-disk-targets-'));
	try {
		const workVolume = path.join(root, 'work-volume');
		const outputVolume = path.join(root, 'output-volume');
		mkdirSync(workVolume);
		mkdirSync(outputVolume);
		assert.deepEqual(
			collectMinimumFreeSpaceTargets([
				path.join(workVolume, 'future', 'attempt.webp'),
				path.join(outputVolume, 'future', 'final.webp'),
				path.join(outputVolume, 'another-final.webp')
			]),
			[workVolume, outputVolume]
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('reservations and write headroom are additive and abort in-flight phases on failure', () => {
	const available = 25n;
	const guard = createMinimumFreeSpaceGuard({
		paths: ['/art-work'],
		minimumBytes: 10n,
		getAvailableBytes: () => available
	});
	const release = guard.reserve({
		phase: 'normalization reservation',
		artId: 'biology-test-opening',
		bytes: 10n
	});
	assert.equal(guard.reservedBytes, 10n);
	assert.doesNotThrow(() =>
		guard.check({
			phase: 'publication with headroom',
			artId: 'biology-test-opening',
			headroomBytes: 5n
		})
	);
	assert.throws(
		() =>
			guard.check({
				phase: 'publication beyond headroom',
				artId: 'biology-test-opening',
				headroomBytes: 6n
			}),
		(error) => {
			assert.equal(error.details.requiredBytes, '26');
			assert.equal(error.details.reservedBytes, '10');
			assert.equal(error.details.headroomBytes, '6');
			return true;
		}
	);
	assert.equal(guard.signal.aborted, true);
	assert.equal(guard.signal.reason, guard.failure);
	release();
	assert.equal(guard.reservedBytes, 0n);
});

test('filesystem quota and capacity errors become resumable shared safety stops', () => {
	for (const storageCode of ['ENOSPC', 'EDQUOT', 'EFBIG']) {
		const cause = Object.assign(new Error(`simulated ${storageCode}`), { code: storageCode });
		const stop = storageExhaustionSafetyStop(cause, {
			phase: 'while writing an image',
			artId: 'biology-test-opening'
		});
		assert.equal(stop.code, 'SCIENCE_ART_STORAGE_EXHAUSTED');
		assert.equal(stop.details.storageCode, storageCode);
		assert.equal(stop.details.artId, 'biology-test-opening');
		assert.equal(stop.cause, cause);
		assert.equal(isArtGenerationSafetyStop(stop), true);
	}
	assert.equal(
		storageExhaustionSafetyStop(Object.assign(new Error('permission denied'), { code: 'EACCES' }), {
			phase: 'while writing an image'
		}),
		null
	);
});

test('image-service infrastructure failures stop the cohort before scheduling more pairs', () => {
	for (const error of [
		new TypeError('fetch failed'),
		Object.assign(new Error('DNS lookup failed'), { code: 'ENOTFOUND' }),
		Object.assign(new Error('service unavailable'), { status: 503 }),
		Object.assign(new Error('request timed out'), { name: 'TimeoutError' })
	]) {
		const stop = imageServiceInfrastructureSafetyStop(error, {
			phase: 'while generating a dark master',
			artId: 'biology-test-opening',
			nextAction: 'Restore access, then rerun with --resume.'
		});
		assert.equal(stop.code, 'SCIENCE_ART_IMAGE_SERVICE_UNAVAILABLE');
		assert.equal(stop.details.artId, 'biology-test-opening');
		assert.equal(stop.resumable, true);
		assert.match(stop.message, /No additional art pairs will be scheduled/);
		assert.match(stop.message, /--resume/);
		assert.equal(isArtGenerationSafetyStop(stop), true);
	}
	assert.equal(
		imageServiceInfrastructureSafetyStop(new Error('Dark master check failed: wrong dimensions'), {
			phase: 'while generating a dark master'
		}),
		null
	);
});

test('failed attempts retain prompt and hash evidence while removing only bulky image bytes', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-failure-cleanup-'));
	const attemptDir = path.join(root, 'attempt-01');
	try {
		mkdirSync(attemptDir, { recursive: true });
		const promptPath = path.join(attemptDir, 'dark-prompt.txt');
		const failurePath = path.join(attemptDir, 'failure.json');
		const darkMasterPath = path.join(attemptDir, 'dark-master.webp');
		const lightPath = path.join(attemptDir, 'light.webp');
		writeFileSync(promptPath, 'Generate exact dark scene.\n');
		writeFileSync(failurePath, '{"status":"pending-cleanup"}\n');
		writeFileSync(darkMasterPath, Buffer.from([1, 2, 3, 4]));
		writeFileSync(lightPath, Buffer.from([5, 6, 7]));

		const inspection = inspectFailedAttemptImages(attemptDir);
		assert.deepEqual(inspection.issues, []);
		assert.deepEqual(inspection.artifacts, [
			{ name: 'dark-master.webp', sha256: sha256(Buffer.from([1, 2, 3, 4])), size: 4 },
			{ name: 'light.webp', sha256: sha256(Buffer.from([5, 6, 7])), size: 3 }
		]);
		assert.equal(readFileSync(promptPath, 'utf8'), 'Generate exact dark scene.\n');

		const removal = removeInspectedFailedAttemptImages(attemptDir, inspection.artifacts);
		assert.deepEqual(removal, {
			removed: ['dark-master.webp', 'light.webp'],
			issues: []
		});
		assert.equal(readFileSync(promptPath, 'utf8'), 'Generate exact dark scene.\n');
		assert.equal(readFileSync(failurePath, 'utf8'), '{"status":"pending-cleanup"}\n');
		assert.throws(() => readFileSync(darkMasterPath), /ENOENT/);
		assert.throws(() => readFileSync(lightPath), /ENOENT/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('cleanup never inspects or removes an image owned by a passed job', () => {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-protected-cleanup-'));
	const attemptDir = path.join(root, 'attempt-01');
	try {
		mkdirSync(attemptDir, { recursive: true });
		const protectedImage = path.join(attemptDir, 'dark-master.webp');
		writeFileSync(protectedImage, 'accepted-bytes');
		const protectedPaths = new Set([protectedImage]);
		const inspection = inspectFailedAttemptImages(attemptDir, { protectedPaths });
		assert.deepEqual(inspection.artifacts, []);
		assert.match(inspection.issues[0], /belongs to a passed job/);
		const removal = removeInspectedFailedAttemptImages(
			attemptDir,
			[
				{
					name: 'dark-master.webp',
					sha256: sha256(Buffer.from('accepted-bytes')),
					size: Buffer.byteLength('accepted-bytes')
				}
			],
			{ protectedPaths }
		);
		assert.deepEqual(removal.removed, []);
		assert.match(removal.issues[0], /belongs to a passed job/);
		assert.equal(readFileSync(protectedImage, 'utf8'), 'accepted-bytes');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('concurrent runner stops claiming new pairs after a resumable safety failure', async () => {
	const executed = [];
	let stopError = null;
	const safetyError = new ArtGenerationSafetyStop('disk reserve reached', {
		code: 'SCIENCE_ART_MIN_FREE_SPACE'
	});
	const tasks = [
		async () => {
			executed.push(0);
			await Promise.resolve();
			throw safetyError;
		},
		async () => {
			executed.push(1);
			await Promise.resolve();
			return { status: 'passed' };
		},
		async () => {
			executed.push(2);
			return { status: 'passed' };
		}
	];
	const outcome = await runConcurrentUntilStopped(tasks, 2, {
		getStopError: () => stopError,
		onTaskError(error) {
			if (isArtGenerationSafetyStop(error)) stopError = error;
		}
	});
	assert.deepEqual(executed, [0, 1]);
	assert.equal(outcome.scheduledCount, 2);
	assert.equal(outcome.results[0].status, 'failed');
	assert.equal(outcome.results[0].resumable, true);
	assert.equal(outcome.results[1].status, 'passed');
	assert.equal(outcome.results[2], undefined);
});

test('ordinary concurrent task errors redact absolute paths before entering result records', async () => {
	const operatorPath = path.posix.join('/root', 'science-art', 'failed-attempt.json');
	const outcome = await runConcurrentUntilStopped(
		[
			async () => {
				throw new Error(`Write failed at "${operatorPath}"`);
			}
		],
		1
	);
	assert.equal(outcome.results[0].error.includes(operatorPath), false);
	assert.match(outcome.results[0].error, /\[redacted filesystem path\]/);
});

test('a before-claim safety latch does not consume or schedule the task slot', async () => {
	let stopError = null;
	let claims = 0;
	let executions = 0;
	const safetyError = new ArtGenerationSafetyStop('pre-claim reserve reached', {
		code: 'SCIENCE_ART_MIN_FREE_SPACE'
	});
	const outcome = await runConcurrentUntilStopped(
		[
			async () => {
				executions += 1;
			}
		],
		1,
		{
			beforeClaim() {
				claims += 1;
				throw safetyError;
			},
			getStopError: () => stopError,
			onTaskError(error) {
				stopError = error;
			}
		}
	);
	assert.equal(claims, 1);
	assert.equal(executions, 0);
	assert.equal(outcome.scheduledCount, 0);
	assert.equal(outcome.results[0], undefined);
});

test('failed-resumable summaries exit nonzero even when every completed result passed', () => {
	assert.equal(
		artGenerationExitCode({
			status: 'failed-resumable',
			passedCount: 1,
			failedCount: 0,
			results: [{ status: 'passed', safetyStop: { code: 'SCIENCE_ART_MIN_FREE_SPACE' } }]
		}),
		1
	);
	assert.equal(artGenerationExitCode({ status: 'passed', failedCount: 0 }), 0);
});
