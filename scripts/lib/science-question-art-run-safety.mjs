import { createHash } from 'node:crypto';
import {
	closeSync,
	existsSync,
	openSync,
	readSync,
	statSync,
	statfsSync,
	unlinkSync
} from 'node:fs';
import path from 'node:path';

export const DEFAULT_MIN_FREE_SPACE_GIB = 10;
export const GIB_BYTES = 1024n * 1024n * 1024n;
export const FAILED_ATTEMPT_IMAGE_NAMES = Object.freeze([
	'dark-master.webp',
	'light-master.webp',
	'dark.webp',
	'light.webp'
]);

const SAFETY_STOP_CODES = new Set([
	'SCIENCE_ART_MIN_FREE_SPACE',
	'SCIENCE_ART_FREE_SPACE_CHECK_FAILED',
	'SCIENCE_ART_STORAGE_EXHAUSTED',
	'SCIENCE_ART_FAILED_ATTEMPT_CLEANUP_FAILED',
	'SCIENCE_ART_GENERATION_SAFETY_STOP',
	'SCIENCE_ART_PUBLICATION_RECOVERY_FAILED',
	'SCIENCE_ART_WORK_ROOT_INVALID',
	'SCIENCE_ART_WORK_ROOT_LOCKED',
	'SCIENCE_ART_OUTPUT_PATH_INVALID',
	'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
	'SCIENCE_ART_LINEAGE_INVALID',
	'SCIENCE_ART_RESUME_REQUIRED',
	'SCIENCE_ART_REPAIR_EVIDENCE_REFRESH_REQUIRED',
	'SCIENCE_ART_IMAGE_SERVICE_UNAVAILABLE'
]);
const STORAGE_EXHAUSTION_CODES = new Set(['ENOSPC', 'EDQUOT', 'EFBIG']);
const IMAGE_SERVICE_INFRASTRUCTURE_CODES = new Set([
	'ABORT_ERR',
	'ECONNABORTED',
	'ECONNREFUSED',
	'ECONNRESET',
	'EHOSTUNREACH',
	'ENETDOWN',
	'ENETUNREACH',
	'ENOTFOUND',
	'ETIMEDOUT',
	'EAI_AGAIN'
]);
const REDACTED_FILESYSTEM_PATH = '[redacted filesystem path]';
const CIRCULAR_DETAIL = '[circular detail]';
const UNAVAILABLE_DETAIL = '[unavailable detail]';

export class ArtGenerationSafetyStop extends Error {
	constructor(message, { code, details = {}, cause } = {}) {
		super(sanitizePathBearingString(String(message)), cause ? { cause } : undefined);
		this.name = 'ArtGenerationSafetyStop';
		this.code = code;
		this.details = details;
		this.resumable = true;
	}
}

export function minimumFreeSpaceBytes(gib) {
	if (!Number.isInteger(gib) || gib < 1) {
		throw new Error('--min-free-space-gib must be an integer >= 1.');
	}
	return BigInt(gib) * GIB_BYTES;
}

export function storageExhaustionSafetyStop(
	error,
	{
		phase,
		artId = null,
		nextAction = 'Free storage space or quota, then follow the run summary.'
	} = {}
) {
	if (isArtGenerationSafetyStop(error)) return error;
	const storageCode = findStorageExhaustionCode(error);
	if (!storageCode) return null;
	return new ArtGenerationSafetyStop(
		`Storage failed ${phaseLabel(phase, artId)} with ${storageCode}. ` +
			`No new art pairs will be scheduled. ${nextAction}`,
		{
			code: 'SCIENCE_ART_STORAGE_EXHAUSTED',
			details: { phase, artId, storageCode, nextAction },
			cause: error
		}
	);
}

export function imageServiceInfrastructureSafetyStop(
	error,
	{
		phase,
		artId = null,
		nextAction = 'Restore image-service access or connectivity, then rerun the ordinary lineage with --resume.'
	} = {}
) {
	if (isArtGenerationSafetyStop(error)) return error;
	const failureKind = findImageServiceInfrastructureFailure(error);
	if (!failureKind) return null;
	return new ArtGenerationSafetyStop(
		`The image service failed ${phaseLabel(phase, artId)} (${failureKind}). ` +
			`No additional art pairs will be scheduled in this run. ${nextAction}`,
		{
			code: 'SCIENCE_ART_IMAGE_SERVICE_UNAVAILABLE',
			details: { phase, artId, failureKind, nextAction },
			cause: error
		}
	);
}

export function collectMinimumFreeSpaceTargets(candidatePaths) {
	const targets = new Set();
	for (const candidatePath of candidatePaths) {
		let current = path.resolve(candidatePath);
		while (true) {
			if (existsSync(current) && statSync(current).isDirectory()) {
				targets.add(current);
				break;
			}
			const parent = path.dirname(current);
			if (parent === current) {
				throw new Error(
					`No existing directory contains target "${filesystemTargetDescriptor(candidatePath)}".`
				);
			}
			current = parent;
		}
	}
	return [...targets];
}

export function createMinimumFreeSpaceGuard({
	paths,
	minimumBytes,
	resumeInstruction = 'Free disk space, then rerun with --resume.',
	getAvailableBytes = availableBytes
}) {
	const targets = [
		...new Set(
			paths
				.map((targetPath) => path.resolve(targetPath))
				.filter((targetPath) => targetPath.length > 0)
		)
	];
	if (targets.length === 0)
		throw new Error('The minimum-free-space guard needs a path to inspect.');
	const requiredBytes = BigInt(minimumBytes);
	if (requiredBytes < 1n)
		throw new Error('The minimum-free-space guard must reserve at least 1 byte.');
	let failure = null;
	let reservedBytes = 0n;
	const controller = new AbortController();

	function stop(error) {
		if (failure) return failure;
		failure = isArtGenerationSafetyStop(error)
			? error
			: new ArtGenerationSafetyStop(errorMessage(error), {
					code: 'SCIENCE_ART_GENERATION_SAFETY_STOP',
					cause: error
				});
		controller.abort(failure);
		return failure;
	}

	function check({ phase, artId = null, headroomBytes = 0n }) {
		if (failure) throw failure;
		const requestedHeadroom = BigInt(headroomBytes);
		if (requestedHeadroom < 0n) throw new Error('Disk headroom cannot be negative.');
		const totalRequiredBytes = requiredBytes + reservedBytes + requestedHeadroom;
		for (const targetPath of targets) {
			const targetDescriptor = filesystemTargetDescriptor(targetPath);
			let freeBytes;
			try {
				freeBytes = BigInt(getAvailableBytes(targetPath));
			} catch (error) {
				throw stop(
					new ArtGenerationSafetyStop(
						`Could not verify free disk space for target "${targetDescriptor}" ${phaseLabel(phase, artId)}. ` +
							`No new art pairs will be scheduled. ${resumeInstruction}`,
						{
							code: 'SCIENCE_ART_FREE_SPACE_CHECK_FAILED',
							details: {
								phase,
								artId,
								targetPath: targetDescriptor,
								minimumBytes: requiredBytes.toString(),
								reservedBytes: reservedBytes.toString(),
								headroomBytes: requestedHeadroom.toString(),
								requiredBytes: totalRequiredBytes.toString()
							},
							cause: error
						}
					)
				);
			}
			if (freeBytes < totalRequiredBytes) {
				throw stop(
					new ArtGenerationSafetyStop(
						`Minimum free-space guard tripped for target "${targetDescriptor}" ${phaseLabel(phase, artId)}: ` +
							`${formatBytes(freeBytes)} available, ${formatBytes(totalRequiredBytes)} required ` +
							`(${formatBytes(requiredBytes)} reserve plus active/write headroom). ` +
							`No new art pairs will be scheduled. ${resumeInstruction}`,
						{
							code: 'SCIENCE_ART_MIN_FREE_SPACE',
							details: {
								phase,
								artId,
								targetPath: targetDescriptor,
								availableBytes: freeBytes.toString(),
								minimumBytes: requiredBytes.toString(),
								reservedBytes: reservedBytes.toString(),
								headroomBytes: requestedHeadroom.toString(),
								requiredBytes: totalRequiredBytes.toString()
							}
						}
					)
				);
			}
		}
	}

	return {
		get failure() {
			return failure;
		},
		get signal() {
			return controller.signal;
		},
		get reservedBytes() {
			return reservedBytes;
		},
		minimumBytes: requiredBytes,
		targets,
		check,
		stop,
		reserve({ phase, artId = null, bytes }) {
			const reservationBytes = BigInt(bytes);
			if (reservationBytes < 1n) throw new Error('A disk reservation must be at least 1 byte.');
			check({ phase, artId, headroomBytes: reservationBytes });
			reservedBytes += reservationBytes;
			let active = true;
			return () => {
				if (!active) return;
				active = false;
				reservedBytes -= reservationBytes;
			};
		}
	};
}

export function inspectFailedAttemptImages(attemptDir, { protectedPaths = new Set() } = {}) {
	const artifacts = [];
	const issues = [];
	const protectedAbsolutePaths = new Set(
		[...protectedPaths].map((filePath) => path.resolve(filePath))
	);
	for (const name of FAILED_ATTEMPT_IMAGE_NAMES) {
		const filePath = path.join(attemptDir, name);
		if (!existsSync(filePath)) continue;
		if (protectedAbsolutePaths.has(path.resolve(filePath))) {
			issues.push(`${name} belongs to a passed job and was not inspected for cleanup.`);
			continue;
		}
		try {
			const stats = statSync(filePath);
			if (!stats.isFile()) {
				issues.push(`${name} is not a regular file and was not removed.`);
				continue;
			}
			artifacts.push({
				name,
				sha256: sha256File(filePath),
				size: stats.size
			});
		} catch (error) {
			issues.push(`${name} could not be hashed before cleanup: ${errorMessage(error)}`);
		}
	}
	return { artifacts, issues };
}

export function removeInspectedFailedAttemptImages(
	attemptDir,
	artifacts,
	{ protectedPaths = new Set() } = {}
) {
	const removed = [];
	const issues = [];
	const protectedAbsolutePaths = new Set(
		[...protectedPaths].map((filePath) => path.resolve(filePath))
	);
	for (const artifact of artifacts) {
		if (!FAILED_ATTEMPT_IMAGE_NAMES.includes(artifact.name)) {
			issues.push(
				`Refused to remove unexpected attempt artifact ${sanitizePathBearingString(
					String(artifact.name)
				)}.`
			);
			continue;
		}
		const filePath = path.join(attemptDir, artifact.name);
		if (protectedAbsolutePaths.has(path.resolve(filePath))) {
			issues.push(`${artifact.name} belongs to a passed job and was not removed.`);
			continue;
		}
		if (!existsSync(filePath)) {
			issues.push(`${artifact.name} disappeared before its recorded bytes could be removed.`);
			continue;
		}
		try {
			const stats = statSync(filePath);
			if (stats.size !== artifact.size || sha256File(filePath) !== artifact.sha256) {
				issues.push(`${artifact.name} changed after its failure evidence was recorded.`);
				continue;
			}
			unlinkSync(filePath);
			removed.push(artifact.name);
		} catch (error) {
			issues.push(`${artifact.name} could not be removed: ${errorMessage(error)}`);
		}
	}
	return { removed, issues };
}

export function failedAttemptCleanupStop(
	issues,
	{
		artId,
		attempt,
		nextAction = 'Resolve the recorded cleanup issue, then follow the run summary.'
	}
) {
	return new ArtGenerationSafetyStop(
		`Failed attempt image cleanup did not complete for ${artId} attempt ${attempt}: ` +
			`${issues.join(' ')} No new art pairs will be scheduled. ${nextAction}`,
		{
			code: 'SCIENCE_ART_FAILED_ATTEMPT_CLEANUP_FAILED',
			details: { artId, attempt, issues, nextAction }
		}
	);
}

export function isArtGenerationSafetyStop(error) {
	return (
		error instanceof ArtGenerationSafetyStop ||
		(error?.resumable === true && SAFETY_STOP_CODES.has(error?.code))
	);
}

export function serializeArtGenerationSafetyStop(error) {
	if (!isArtGenerationSafetyStop(error)) return null;
	let sanitizedDetails;
	try {
		sanitizedDetails = sanitizeSafetyStopValue(error.details);
	} catch {
		sanitizedDetails = {};
	}
	let sanitizedCode;
	try {
		sanitizedCode = sanitizeSafetyStopValue(error.code);
	} catch {
		sanitizedCode = undefined;
	}
	return {
		...(isMergeableDetailObject(sanitizedDetails) ? sanitizedDetails : {}),
		code: sanitizedCode,
		message: errorMessage(error),
		resumable: true
	};
}

export function artGenerationExitCode(summary) {
	return summary?.status === 'passed' ? 0 : 1;
}

function findStorageExhaustionCode(error) {
	const seen = new Set();
	let current = error;
	while (current && (typeof current === 'object' || typeof current === 'function')) {
		if (seen.has(current)) break;
		seen.add(current);
		if (STORAGE_EXHAUSTION_CODES.has(current.code)) return current.code;
		current = current.cause;
	}
	return null;
}

function findImageServiceInfrastructureFailure(error) {
	const seen = new Set();
	let current = error;
	while (current && (typeof current === 'object' || typeof current === 'function')) {
		if (seen.has(current)) break;
		seen.add(current);
		const code = String(current.code ?? '');
		if (IMAGE_SERVICE_INFRASTRUCTURE_CODES.has(code)) return code;
		const status = Number(current.status ?? current.statusCode);
		if (Number.isInteger(status) && status >= 400 && status <= 599) {
			return `HTTP_${status}`;
		}
		const name = String(current.name ?? '');
		if (name === 'AbortError' || name === 'TimeoutError') return name;
		const message = String(current.message ?? '');
		if (
			/\b(?:fetch failed|network request failed|socket hang up|service unavailable|bad gateway|gateway timeout|too many requests|unauthori[sz]ed|forbidden)\b/iu.test(
				message
			)
		) {
			return 'SERVICE_REQUEST_FAILED';
		}
		current = current.cause;
	}
	return null;
}

export async function runConcurrentUntilStopped(
	tasks,
	concurrency,
	{ beforeClaim = () => {}, getStopError = () => null, onTaskError = () => {} } = {}
) {
	const results = new Array(tasks.length);
	let cursor = 0;
	let scheduledCount = 0;
	async function worker() {
		while (cursor < tasks.length && !getStopError()) {
			const index = cursor;
			try {
				beforeClaim(index);
			} catch (error) {
				onTaskError(error);
				if (getStopError()) break;
				throw error;
			}
			if (getStopError()) break;
			cursor += 1;
			scheduledCount += 1;
			try {
				results[index] = await tasks[index]();
			} catch (error) {
				onTaskError(error);
				results[index] = {
					status: 'failed',
					error: errorMessage(error),
					resumable: isArtGenerationSafetyStop(error)
				};
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
	return { results, scheduledCount };
}

export function formatBytes(bytes) {
	const numeric = Number(BigInt(bytes)) / Number(GIB_BYTES);
	return `${numeric.toFixed(2)} GiB`;
}

function availableBytes(targetPath) {
	const stats = statfsSync(targetPath, { bigint: true });
	return stats.bavail * stats.bsize;
}

function sha256File(filePath) {
	const descriptor = openSync(filePath, 'r');
	const digest = createHash('sha256');
	const buffer = Buffer.allocUnsafe(1024 * 1024);
	try {
		let bytesRead;
		do {
			bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
			if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
		} while (bytesRead > 0);
		return digest.digest('hex');
	} finally {
		closeSync(descriptor);
	}
}

function phaseLabel(phase, artId) {
	const context = artId ? `for ${artId}` : 'for the run';
	return `during ${phase} ${context}`;
}

function errorMessage(error) {
	try {
		const message =
			error instanceof Error || (error && typeof error.message === 'string')
				? error.message
				: String(error);
		return sanitizePathBearingString(message);
	} catch {
		return 'Unknown error.';
	}
}

function filesystemTargetDescriptor(targetPath) {
	const resolvedPath = path.resolve(targetPath);
	if (resolvedPath === path.parse(resolvedPath).root) return 'filesystem root';
	const nativeBasename = path.basename(resolvedPath);
	const portableBasename = path.win32.basename(nativeBasename);
	const safeBasename = [...portableBasename]
		.map((character) => (isUnsafeTargetDescriptorCharacter(character) ? '_' : character))
		.join('')
		.trim()
		.slice(0, 120);
	return safeBasename || 'filesystem target';
}

function sanitizePathBearingString(value) {
	const text = String(value);
	const leadingWhitespace = text.match(/^\s*/u)?.[0] ?? '';
	const trailingWhitespace = text.match(/\s*$/u)?.[0] ?? '';
	const trimmed = text.trim();
	if (isAbsoluteFilesystemReference(trimmed)) {
		return `${leadingWhitespace}${REDACTED_FILESYSTEM_PATH}${trailingWhitespace}`;
	}

	return text
		.replace(/file:\/\/\/[^\s"'`<>{}(),;]*/giu, REDACTED_FILESYSTEM_PATH)
		.replace(
			/(["'`])((?:[A-Za-z]:[\\/]+|\\\\[^\\/\r\n]+[\\/]+|\/(?!\/))[^"'`\r\n]*)\1/gu,
			(_match, quote) => `${quote}${REDACTED_FILESYSTEM_PATH}${quote}`
		)
		.replace(
			/(^|[\s([{=,:;])((?:[A-Za-z]:[\\/]+|\\\\[^\\/\s]+[\\/]+|\/(?!\/))[^\s"'`<>{}(),;]*)/gmu,
			(_match, boundary) => `${boundary}${REDACTED_FILESYSTEM_PATH}`
		);
}

function isUnsafeTargetDescriptorCharacter(character) {
	const codePoint = character.codePointAt(0);
	return (
		codePoint < 32 ||
		codePoint === 127 ||
		character === '"' ||
		character === "'" ||
		character === '`' ||
		character === '/' ||
		character === '\\'
	);
}

function isAbsoluteFilesystemReference(value) {
	return (
		value.length > 0 &&
		(path.posix.isAbsolute(value) ||
			path.win32.isAbsolute(value) ||
			value.toLowerCase().startsWith('file:///'))
	);
}

function sanitizeSafetyStopValue(value, seen = new WeakSet()) {
	if (typeof value === 'string') return sanitizePathBearingString(value);
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'symbol') return sanitizePathBearingString(String(value));
	if (typeof value === 'function')
		return `[function ${sanitizePathBearingString(value.name || 'anonymous')}]`;
	if (value === null || typeof value !== 'object') return value;
	if (seen.has(value)) return CIRCULAR_DETAIL;
	seen.add(value);
	try {
		if (Array.isArray(value)) {
			return value.map((item) => sanitizeSafetyStopValue(item, seen));
		}
		if (value instanceof Date) return value.toISOString();
		if (value instanceof Error) return sanitizeErrorDetail(value, seen);

		const sanitized = {};
		for (const key of Object.keys(value)) {
			const sanitizedKey = sanitizePathBearingString(key);
			let propertyValue;
			try {
				propertyValue = value[key];
			} catch {
				propertyValue = UNAVAILABLE_DETAIL;
			}
			defineEnumerableProperty(
				sanitized,
				sanitizedKey,
				sanitizeSafetyStopValue(propertyValue, seen)
			);
		}
		return sanitized;
	} finally {
		seen.delete(value);
	}
}

function sanitizeErrorDetail(error, seen) {
	const sanitized = {};
	for (const key of Object.keys(error)) {
		let propertyValue;
		try {
			propertyValue = error[key];
		} catch {
			propertyValue = UNAVAILABLE_DETAIL;
		}
		defineEnumerableProperty(
			sanitized,
			sanitizePathBearingString(key),
			sanitizeSafetyStopValue(propertyValue, seen)
		);
	}
	let errorName = 'Error';
	try {
		errorName = sanitizePathBearingString(error.name);
	} catch {
		// Keep the safe generic name when an adversarial getter throws.
	}
	defineEnumerableProperty(sanitized, 'message', errorMessage(error));
	defineEnumerableProperty(sanitized, 'name', errorName);
	if (!Object.hasOwn(sanitized, 'cause')) {
		let cause;
		try {
			cause = error.cause;
		} catch {
			cause = UNAVAILABLE_DETAIL;
		}
		if (cause !== undefined) {
			defineEnumerableProperty(sanitized, 'cause', sanitizeSafetyStopValue(cause, seen));
		}
	}
	return sanitized;
}

function defineEnumerableProperty(target, key, value) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true
	});
}

function isMergeableDetailObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
