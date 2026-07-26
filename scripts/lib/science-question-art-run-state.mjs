import { randomUUID } from 'node:crypto';
import {
	closeSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	realpathSync,
	renameSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';

import { ArtGenerationSafetyStop } from './science-question-art-run-safety.mjs';

export const ART_WORK_ROOT_SCHEMA = 'science-question-art-work-root/v1';
export const ART_WORK_ROOT_LOCK_SCHEMA = 'science-question-art-work-root-lock/v1';
export const ART_REPAIR_LINEAGE_SCHEMA = 'science-question-art-repair-lineage/v1';

const JOB_FILE_PATTERN = /^(?:job|repair-[a-f0-9]{12}-job)\.json$/;
const REQUIRED_IMAGE_ARTIFACTS = Object.freeze([
	'darkMaster',
	'lightMaster',
	'darkNormalized',
	'lightNormalized'
]);

export function prepareOwnedArtWorkRoot({ workRoot, workspaceRoot, releaseId, manifestSha256 }) {
	const resolvedRoot = path.resolve(workRoot);
	const resolvedWorkspace = path.resolve(workspaceRoot);
	if (
		resolvedRoot === path.parse(resolvedRoot).root ||
		resolvedRoot === resolvedWorkspace ||
		resolvedWorkspace.startsWith(`${resolvedRoot}${path.sep}`) ||
		!resolvedRoot.startsWith(`${resolvedWorkspace}${path.sep}`)
	) {
		throw workRootStop(
			`Refusing unsafe art work root ${resolvedRoot}; it must be a dedicated child directory.`
		);
	}
	ensureDirectoryTreeWithoutSymlinks(resolvedWorkspace, resolvedRoot);
	const rootStats = lstatSync(resolvedRoot);
	if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
		throw workRootStop(`Art work root is not a real directory: ${resolvedRoot}`);
	}
	const rootRelativeToWorkspace = path.relative(resolvedWorkspace, resolvedRoot);
	const expectedRealRoot =
		rootRelativeToWorkspace !== '..' &&
		!rootRelativeToWorkspace.startsWith(`..${path.sep}`) &&
		!path.isAbsolute(rootRelativeToWorkspace)
			? path.resolve(realpathSync(resolvedWorkspace), rootRelativeToWorkspace)
			: realpathSync(resolvedRoot);
	if (realpathSync(resolvedRoot) !== expectedRealRoot) {
		throw workRootStop(`Art work root traverses a symbolic link or path alias: ${resolvedRoot}`);
	}

	const markerPath = path.join(resolvedRoot, '.science-question-art-work-root');
	const expectedMarker = {
		schemaVersion: ART_WORK_ROOT_SCHEMA,
		releaseId,
		manifestSha256,
		workRoot: resolvedRoot
	};
	let created = false;
	if (!existsSync(markerPath)) {
		const unexpectedEntries = readdirSync(resolvedRoot);
		if (unexpectedEntries.length) {
			throw workRootStop(
				`Art work root has content but no ownership marker: ${unexpectedEntries
					.slice(0, 5)
					.join(', ')}`
			);
		}
		try {
			writeTextExclusively(markerPath, `${JSON.stringify(expectedMarker, null, 2)}\n`);
			created = true;
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;
		}
	}
	const markerStats = lstatSync(markerPath);
	if (!markerStats.isFile() || markerStats.isSymbolicLink()) {
		throw workRootStop('Art work-root ownership marker must be a regular file.');
	}
	let marker;
	try {
		marker = JSON.parse(readFileSync(markerPath, 'utf8'));
	} catch (error) {
		throw workRootStop('Art work-root ownership marker is not valid JSON.', error);
	}
	if (
		marker?.schemaVersion !== ART_WORK_ROOT_SCHEMA ||
		marker.releaseId !== releaseId ||
		marker.manifestSha256 !== manifestSha256 ||
		marker.workRoot !== resolvedRoot
	) {
		throw workRootStop(
			'Art work-root ownership marker does not bind this release, manifest and exact directory.'
		);
	}
	return {
		workRoot: resolvedRoot,
		markerPath,
		marker,
		action: created ? 'created' : 'validated'
	};
}

export function prepareArtSpecDirectory({ workRoot, artId }) {
	const resolvedRoot = path.resolve(workRoot);
	const specDir = path.join(resolvedRoot, artId);
	if (path.dirname(specDir) !== resolvedRoot) {
		throw workRootStop(`Invalid art id for work-root ownership: ${String(artId)}`);
	}
	if (existsSync(specDir)) {
		const stats = lstatSync(specDir);
		if (!stats.isDirectory() || stats.isSymbolicLink()) {
			throw workRootStop(`Art spec work directory is not a real directory: ${specDir}`);
		}
		if (realpathSync(specDir) !== path.join(realpathSync(resolvedRoot), artId)) {
			throw workRootStop(`Art spec work directory traverses a path alias: ${specDir}`);
		}
	} else {
		mkdirSync(specDir);
		syncDirectory(resolvedRoot);
	}
	return specDir;
}

export function acquireArtWorkRootLock({
	workRoot,
	releaseId,
	manifestSha256,
	processId = process.pid,
	host = hostname(),
	now = () => new Date().toISOString(),
	isProcessAlive = defaultProcessAlive
}) {
	const lockPath = path.join(path.resolve(workRoot), '.science-question-art.lock');
	return acquireExactArtLock({
		lockPath,
		releaseId,
		manifestSha256,
		processId,
		host,
		now,
		isProcessAlive,
		scopeLabel: 'art work root'
	});
}

export function acquireArtReleaseLock({
	workspaceRoot,
	releaseId,
	manifestSha256,
	processId = process.pid,
	host = hostname(),
	now = () => new Date().toISOString(),
	isProcessAlive = defaultProcessAlive
}) {
	const releaseRoot = path.join(
		path.resolve(workspaceRoot),
		'tmp',
		'science-challenges',
		releaseId
	);
	ensureDirectoryTreeWithoutSymlinks(path.resolve(workspaceRoot), releaseRoot);
	return acquireExactArtLock({
		lockPath: path.join(releaseRoot, '.science-question-art-output.lock'),
		releaseId,
		manifestSha256,
		processId,
		host,
		now,
		isProcessAlive,
		scopeLabel: 'canonical release outputs'
	});
}

function acquireExactArtLock({
	lockPath,
	releaseId,
	manifestSha256,
	processId,
	host,
	now,
	isProcessAlive,
	scopeLabel
}) {
	const create = () => {
		const token = randomUUID();
		const lock = {
			schemaVersion: ART_WORK_ROOT_LOCK_SCHEMA,
			releaseId,
			manifestSha256,
			processId,
			host,
			token,
			acquiredAt: now()
		};
		let descriptor;
		let created = false;
		try {
			descriptor = openSync(lockPath, 'wx', 0o600);
			created = true;
			writeFileSync(descriptor, `${JSON.stringify(lock, null, 2)}\n`);
			fsyncSync(descriptor);
		} catch (error) {
			if (descriptor !== undefined) {
				closeSync(descriptor);
				descriptor = undefined;
			}
			if (created && existsSync(lockPath)) unlinkSync(lockPath);
			throw error;
		} finally {
			if (descriptor !== undefined) closeSync(descriptor);
		}
		syncDirectory(path.dirname(lockPath));
		let released = false;
		return {
			lockPath,
			lock,
			release() {
				if (released) return;
				released = true;
				if (!existsSync(lockPath)) return;
				let current;
				try {
					current = JSON.parse(readFileSync(lockPath, 'utf8'));
				} catch {
					return;
				}
				if (current?.token !== token) return;
				unlinkSync(lockPath);
				syncDirectory(path.dirname(lockPath));
			}
		};
	};

	try {
		return create();
	} catch (error) {
		if (error?.code !== 'EEXIST') throw error;
	}

	const existing = readExistingLock(lockPath);
	if (
		existing.releaseId !== releaseId ||
		existing.manifestSha256 !== manifestSha256 ||
		existing.host !== host
	) {
		throw lockStop(
			`${scopeLabel} is locked by a different release, manifest or host.`,
			lockPath,
			existing,
			undefined,
			'Do not remove the foreign lock automatically; use the matching release/workspace or inspect its owner.'
		);
	}
	if (isProcessAlive(existing.processId)) {
		throw lockStop(
			`${scopeLabel} is already locked by live process ${existing.processId}.`,
			lockPath,
			existing,
			undefined,
			'Wait for the recorded live owner to finish.'
		);
	}
	unlinkSync(lockPath);
	syncDirectory(path.dirname(lockPath));
	try {
		return create();
	} catch (error) {
		throw lockStop(
			`A competing process acquired the ${scopeLabel} lock.`,
			lockPath,
			existing,
			error,
			'Retry after the competing owner finishes.'
		);
	}
}

function ensureDirectoryTreeWithoutSymlinks(workspaceRoot, targetDirectory) {
	const relative = path.relative(workspaceRoot, targetDirectory);
	if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		throw workRootStop('Canonical release lock directory is outside the workspace.');
	}
	const realWorkspace = realpathSync(workspaceRoot);
	let current = workspaceRoot;
	for (const component of relative.split(path.sep).filter(Boolean)) {
		current = path.join(current, component);
		if (existsSync(current)) {
			const stats = lstatSync(current);
			if (!stats.isDirectory() || stats.isSymbolicLink()) {
				throw workRootStop(`Release lock path is not a real directory: ${current}`);
			}
		} else {
			mkdirSync(current);
			syncDirectory(path.dirname(current));
		}
		const currentRelative = path.relative(workspaceRoot, current);
		if (realpathSync(current) !== path.resolve(realWorkspace, currentRelative)) {
			throw workRootStop(`Release lock path traverses a symbolic link: ${current}`);
		}
	}
}

export function inspectAttemptSlots({ specDir, repairRunId = null, maxAttempts = 4 }) {
	const slots = new Map();
	if (!existsSync(specDir)) return { slots, nextAttempt: 1 };
	const expression = repairRunId
		? new RegExp(`^repair-${escapeRegExp(repairRunId)}-attempt-(\\d{2})$`)
		: /^attempt-(\d{2})$/;
	const reservedPrefix = repairRunId ? `repair-${repairRunId}-attempt-` : 'attempt-';
	for (const entry of readdirSync(specDir, { withFileTypes: true })) {
		const match = entry.name.match(expression);
		if (!match) {
			if (entry.name.startsWith(reservedPrefix)) {
				throw attemptStop(`Malformed reserved art attempt entry ${entry.name} in ${specDir}.`);
			}
			continue;
		}
		const attempt = Number(match[1]);
		if (!entry.isDirectory() || entry.isSymbolicLink?.() || attempt < 1 || attempt > maxAttempts) {
			throw attemptStop(`Invalid art attempt entry ${entry.name} in ${specDir}.`);
		}
		if (slots.has(attempt)) throw attemptStop(`Duplicate art attempt ${attempt} in ${specDir}.`);
		slots.set(attempt, path.join(specDir, entry.name));
	}
	const attempts = [...slots.keys()].sort((left, right) => left - right);
	for (const [index, attempt] of attempts.entries()) {
		if (attempt !== index + 1) {
			throw attemptStop(`Art attempt history has a non-monotonic gap before attempt ${attempt}.`);
		}
	}
	const nextAttempt = attempts.length < maxAttempts ? attempts.length + 1 : null;
	return { slots, nextAttempt };
}

export function prepareRepairLineageIdentity({
	specDir,
	repairRunId,
	repairEvidenceKind,
	repairEvidenceSha256
}) {
	if (
		!/^[a-f0-9]{12}$/.test(repairRunId) ||
		!/^[a-f0-9]{64}$/.test(repairEvidenceSha256) ||
		!repairEvidenceSha256.startsWith(repairRunId) ||
		!['independent-review', 'perceptual-audit'].includes(repairEvidenceKind)
	) {
		throw attemptStop('Repair lineage identity inputs are invalid.');
	}
	const markerPath = path.join(specDir, `repair-${repairRunId}-identity.json`);
	const expected = {
		schemaVersion: ART_REPAIR_LINEAGE_SCHEMA,
		repairRunId,
		repairEvidenceKind,
		repairEvidenceSha256
	};
	if (!existsSync(markerPath)) {
		const existingLineageEntries = readdirSync(specDir).filter(
			(name) =>
				name.startsWith(`repair-${repairRunId}-attempt-`) ||
				name.startsWith(`repair-${repairRunId}-job.json`)
		);
		if (existingLineageEntries.length) {
			throw attemptStop(
				`Repair lineage ${repairRunId} has artifacts but no full-hash identity marker.`
			);
		}
		try {
			writeTextExclusively(markerPath, `${JSON.stringify(expected, null, 2)}\n`);
		} catch (error) {
			if (error?.code !== 'EEXIST') throw error;
		}
	}
	const actual = readRepairLineageIdentity({ specDir, repairRunId });
	if (
		actual.repairEvidenceKind !== repairEvidenceKind ||
		actual.repairEvidenceSha256 !== repairEvidenceSha256
	) {
		throw attemptStop(
			`Repair lineage prefix ${repairRunId} is already bound to different full-hash evidence.`
		);
	}
	return { markerPath, identity: actual };
}

export function readRepairLineageIdentity({ specDir, repairRunId }) {
	const markerPath = path.join(specDir, `repair-${repairRunId}-identity.json`);
	if (!existsSync(markerPath)) {
		throw attemptStop(`Repair lineage ${repairRunId} has no full-hash identity marker.`);
	}
	const stats = lstatSync(markerPath);
	if (!stats.isFile() || stats.isSymbolicLink()) {
		throw attemptStop(`Repair lineage marker ${path.basename(markerPath)} is not a regular file.`);
	}
	let identity;
	try {
		identity = JSON.parse(readFileSync(markerPath, 'utf8'));
	} catch (error) {
		throw attemptStop(`Repair lineage marker ${path.basename(markerPath)} is malformed.`, error);
	}
	if (
		identity?.schemaVersion !== ART_REPAIR_LINEAGE_SCHEMA ||
		identity.repairRunId !== repairRunId ||
		!/^[a-f0-9]{64}$/.test(identity.repairEvidenceSha256) ||
		!identity.repairEvidenceSha256.startsWith(repairRunId) ||
		!['independent-review', 'perceptual-audit'].includes(identity.repairEvidenceKind)
	) {
		throw attemptStop(`Repair lineage marker ${path.basename(markerPath)} has invalid identity.`);
	}
	return identity;
}

export function passedJobArtifactPaths({ specDir, rootDir }) {
	const protectedPaths = new Set();
	if (!existsSync(specDir)) return protectedPaths;
	for (const entry of readdirSync(specDir, { withFileTypes: true })) {
		if (!JOB_FILE_PATTERN.test(entry.name)) continue;
		if (!entry.isFile() || entry.isSymbolicLink?.()) {
			throw attemptStop(`Art job ${entry.name} is not a regular file; cleanup is blocked.`);
		}
		const jobPath = path.join(specDir, entry.name);
		let job;
		try {
			job = JSON.parse(readFileSync(jobPath, 'utf8'));
		} catch (error) {
			throw attemptStop(`Art job ${entry.name} is not valid JSON; cleanup is blocked.`, error);
		}
		if (job?.status !== 'passed') continue;
		if (!Number.isInteger(job.attempt) || job.attempt < 1 || job.attempt > 4) {
			throw attemptStop(`Passed art job ${entry.name} has an invalid attempt identity.`);
		}
		const repairMatch = entry.name.match(/^repair-([a-f0-9]{12})-job\.json$/);
		if (repairMatch) {
			const identity = readRepairLineageIdentity({
				specDir,
				repairRunId: repairMatch[1]
			});
			const jobEvidenceHash =
				identity.repairEvidenceKind === 'independent-review'
					? job.repairReviewSha256
					: job.repairPerceptualAuditSha256;
			if (
				jobEvidenceHash !== identity.repairEvidenceSha256 ||
				(identity.repairEvidenceKind === 'independent-review'
					? job.repairPerceptualAuditSha256 !== null
					: job.repairReviewSha256 !== null)
			) {
				throw attemptStop(
					`Passed art job ${entry.name} differs from its full-hash repair identity.`
				);
			}
		}
		const attemptName = repairMatch
			? `repair-${repairMatch[1]}-attempt-${String(job.attempt).padStart(2, '0')}`
			: `attempt-${String(job.attempt).padStart(2, '0')}`;
		const attemptRoot = path.join(specDir, attemptName);
		for (const key of REQUIRED_IMAGE_ARTIFACTS) {
			const artifactPath = path.resolve(rootDir, String(job.artifacts?.[key]?.path ?? ''));
			const expectedName =
				key === 'darkMaster'
					? 'dark-master.webp'
					: key === 'lightMaster'
						? 'light-master.webp'
						: key === 'darkNormalized'
							? 'dark.webp'
							: 'light.webp';
			if (artifactPath !== path.join(attemptRoot, expectedName)) {
				throw attemptStop(
					`Passed art job ${entry.name} has an invalid ${key} path; cleanup is blocked.`
				);
			}
			protectedPaths.add(artifactPath);
		}
	}
	return protectedPaths;
}

export function writeTextAtomically(filePath, text) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
	let descriptor;
	try {
		descriptor = openSync(temporaryPath, 'wx', 0o600);
		writeFileSync(descriptor, text);
		fsyncSync(descriptor);
		closeSync(descriptor);
		descriptor = undefined;
		renameSync(temporaryPath, filePath);
		syncDirectory(path.dirname(filePath));
	} catch (error) {
		if (descriptor !== undefined) closeSync(descriptor);
		if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
		throw error;
	}
}

function writeTextExclusively(filePath, text) {
	let descriptor;
	try {
		descriptor = openSync(filePath, 'wx', 0o600);
		writeFileSync(descriptor, text);
		fsyncSync(descriptor);
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
	}
	syncDirectory(path.dirname(filePath));
}

function readExistingLock(lockPath) {
	const stats = lstatSync(lockPath);
	if (!stats.isFile() || stats.isSymbolicLink()) {
		throw lockStop('Art work-root lock must be a regular file.', lockPath, null);
	}
	let lock;
	try {
		lock = JSON.parse(readFileSync(lockPath, 'utf8'));
	} catch (error) {
		throw lockStop(
			'Art work-root lock is malformed and cannot be recovered automatically.',
			lockPath,
			null,
			error
		);
	}
	if (
		lock?.schemaVersion !== ART_WORK_ROOT_LOCK_SCHEMA ||
		typeof lock.releaseId !== 'string' ||
		!/^[a-f0-9]{64}$/.test(lock.manifestSha256) ||
		!Number.isInteger(lock.processId) ||
		lock.processId < 1 ||
		typeof lock.host !== 'string' ||
		lock.host.length === 0 ||
		!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(lock.token) ||
		typeof lock.acquiredAt !== 'string' ||
		!Number.isFinite(Date.parse(lock.acquiredAt))
	) {
		throw lockStop('Art work-root lock has invalid ownership fields.', lockPath, lock);
	}
	return lock;
}

function defaultProcessAlive(processId) {
	try {
		process.kill(processId, 0);
		return true;
	} catch (error) {
		if (error?.code === 'ESRCH') return false;
		return true;
	}
}

function syncDirectory(directory) {
	let descriptor;
	try {
		descriptor = openSync(directory, 'r');
		fsyncSync(descriptor);
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
	}
}

function workRootStop(message, cause) {
	return new ArtGenerationSafetyStop(message, {
		code: 'SCIENCE_ART_WORK_ROOT_INVALID',
		details: { nextAction: 'Choose or restore the exact owned art-generation work root.' },
		cause
	});
}

function lockStop(
	message,
	lockPath,
	lock,
	cause,
	nextAction = 'Inspect the lock and its owner; do not delete malformed or foreign lock evidence blindly.'
) {
	return new ArtGenerationSafetyStop(message, {
		code: 'SCIENCE_ART_WORK_ROOT_LOCKED',
		details: {
			lockPath,
			lockOwner: lock
				? { processId: lock.processId, host: lock.host, acquiredAt: lock.acquiredAt }
				: null,
			nextAction
		},
		cause
	});
}

function attemptStop(message, cause) {
	return new ArtGenerationSafetyStop(message, {
		code: 'SCIENCE_ART_ATTEMPT_HISTORY_INVALID',
		details: {
			nextAction: 'Inspect the recorded attempt/job evidence; do not delete or reuse it blindly.'
		},
		cause
	});
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
