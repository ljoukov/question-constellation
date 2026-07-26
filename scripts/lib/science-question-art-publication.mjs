import { createHash, randomUUID } from 'node:crypto';
import {
	closeSync,
	constants,
	copyFileSync,
	existsSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import path from 'node:path';

import {
	ArtGenerationSafetyStop,
	storageExhaustionSafetyStop
} from './science-question-art-run-safety.mjs';
import { writeTextAtomically } from './science-question-art-run-state.mjs';

export const ART_PUBLICATION_SCHEMA = 'science-question-art-publication/v1';

export function publicationHeadroomBytes({
	darkSource,
	lightSource,
	finalDark,
	finalLight,
	jobPath,
	jobText
}) {
	let bytes =
		BigInt(statSync(darkSource).size) +
		BigInt(statSync(lightSource).size) +
		BigInt(Buffer.byteLength(jobText));
	for (const filePath of [finalDark, finalLight, jobPath]) {
		if (existsSync(filePath)) bytes += BigInt(statSync(filePath).size);
	}
	return bytes + 1024n * 1024n;
}

export function publicationRecoveryHeadroomBytes({ jobPath, finalDark, finalLight }) {
	const journalPath = publicationJournalPath(jobPath);
	if (!existsSync(journalPath)) return 0n;
	const journal = readAndValidateJournal(journalPath, { jobPath, finalDark, finalLight });
	return (
		Object.values(journal.prior).reduce((total, record) => total + BigInt(record?.size ?? 0), 0n) +
		1024n * 1024n
	);
}

export function recoverArtPublication({
	jobPath,
	finalDark,
	finalLight,
	validateCommitted = null
}) {
	const journalPath = publicationJournalPath(jobPath);
	if (existsSync(journalPath)) {
		const journal = readAndValidateJournal(journalPath, { jobPath, finalDark, finalLight });
		if (newPublicationMatches(journal)) {
			if (typeof validateCommitted !== 'function') {
				throw publicationStop(
					'Committed publication requires full lineage validation before cleanup.',
					{ jobPath, finalDark, finalLight }
				);
			}
			try {
				validateCommitted(jobPath);
			} catch (validationError) {
				rollbackPublication(journal, journalPath);
				return {
					action: 'rolled-back-invalid-committed-publication',
					validationError: errorMessage(validationError)
				};
			}
			cleanupTransaction(journal, journalPath);
			return { action: 'finalized-committed-publication' };
		}
		rollbackPublication(journal, journalPath);
		return { action: 'rolled-back-interrupted-publication' };
	}
	const removed = removeStrandedAuxiliaryFiles([finalDark, finalLight, jobPath, journalPath]);
	return { action: removed.length ? 'removed-stranded-temporaries' : 'none', removed };
}

export function recoverArtPublicationsForSpec({
	jobPaths,
	finalDark,
	finalLight,
	beforeRecover = () => {},
	afterRecover = () => {},
	validateCommitted = null
}) {
	const uniqueJobPaths = [...new Set(jobPaths.map((jobPath) => path.resolve(jobPath)))];
	const journalOwners = uniqueJobPaths.filter((jobPath) =>
		existsSync(publicationJournalPath(jobPath))
	);
	if (journalOwners.length > 1) {
		throw publicationStop('Multiple publication journals make recovery ambiguous.', {
			jobPaths: uniqueJobPaths,
			finalDark,
			finalLight
		});
	}
	const journalOwner = journalOwners[0] ?? null;
	const orderedJobPaths = [
		...(journalOwner ? [journalOwner] : []),
		...uniqueJobPaths.filter((jobPath) => jobPath !== journalOwner)
	];
	const results = [];
	for (const jobPath of orderedJobPaths) {
		beforeRecover(jobPath);
		const result = recoverArtPublication({
			jobPath,
			finalDark,
			finalLight,
			validateCommitted:
				typeof validateCommitted === 'function' ? () => validateCommitted(jobPath) : null
		});
		afterRecover(jobPath, result);
		results.push({ jobPath, ...result });
	}
	return results;
}

export function publishArtPairAndJob({
	darkSource,
	lightSource,
	finalDark,
	finalLight,
	jobPath,
	jobText,
	validateCommitted,
	onStep = () => {},
	leaveInterruptedOnError = () => false
}) {
	if (typeof validateCommitted !== 'function') {
		throw new Error('Art publication requires a committed-lineage validator.');
	}
	if (existsSync(publicationJournalPath(jobPath))) {
		throw publicationStop(
			'An existing publication journal must be lineage-validated and recovered first.',
			{ jobPath, finalDark, finalLight }
		);
	}
	recoverArtPublication({ jobPath, finalDark, finalLight });
	for (const [label, filePath] of [
		['dark source', darkSource],
		['light source', lightSource]
	]) {
		requireRegularFile(filePath, label, { jobPath, finalDark, finalLight });
	}
	for (const [label, filePath] of [
		['dark destination', finalDark],
		['light destination', finalLight],
		['job destination', jobPath]
	]) {
		if (existsSync(filePath)) {
			requireRegularFile(filePath, label, { jobPath, finalDark, finalLight });
		}
	}
	for (const directory of [
		path.dirname(finalDark),
		path.dirname(finalLight),
		path.dirname(jobPath)
	]) {
		mkdirSync(directory, { recursive: true });
	}
	const token = randomUUID();
	const journalPath = publicationJournalPath(jobPath);
	const files = {
		darkCandidate: auxiliaryPath(finalDark, token, 'candidate'),
		lightCandidate: auxiliaryPath(finalLight, token, 'candidate'),
		jobCandidate: auxiliaryPath(jobPath, token, 'candidate'),
		darkBackup: auxiliaryPath(finalDark, token, 'backup'),
		lightBackup: auxiliaryPath(finalLight, token, 'backup'),
		jobBackup: auxiliaryPath(jobPath, token, 'backup')
	};
	let journal = null;
	let committed = false;
	let committedLineageValidated = false;
	try {
		copyExclusiveAndSync(darkSource, files.darkCandidate);
		copyExclusiveAndSync(lightSource, files.lightCandidate);
		writeExclusiveAndSync(files.jobCandidate, jobText);
		const prior = {
			dark: backupIfPresent(finalDark, files.darkBackup),
			light: backupIfPresent(finalLight, files.lightBackup),
			job: backupIfPresent(jobPath, files.jobBackup)
		};
		syncDirectories(Object.values(files).filter((filePath) => existsSync(filePath)));
		journal = {
			schemaVersion: ART_PUBLICATION_SCHEMA,
			token,
			jobPath,
			finalDark,
			finalLight,
			files,
			prior,
			next: {
				dark: fileRecord(files.darkCandidate),
				light: fileRecord(files.lightCandidate),
				job: fileRecord(files.jobCandidate)
			}
		};
		writeTextAtomically(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
		onStep('prepared', journal);
		renameSync(files.darkCandidate, finalDark);
		syncDirectory(path.dirname(finalDark));
		onStep('dark-committed', journal);
		renameSync(files.lightCandidate, finalLight);
		syncDirectory(path.dirname(finalLight));
		onStep('light-committed', journal);
		renameSync(files.jobCandidate, jobPath);
		syncDirectory(path.dirname(jobPath));
		committed = true;
		onStep('job-committed', journal);
		if (!newPublicationMatches(journal)) {
			throw new Error('Published art pair/job hashes differ from the prepared transaction.');
		}
		validateCommitted(jobPath);
		committedLineageValidated = true;
		onStep('lineage-validated', journal);
		try {
			cleanupTransaction(journal, journalPath);
			return {
				action: 'committed',
				outputs: { dark: journal.next.dark, light: journal.next.light }
			};
		} catch (cleanupError) {
			return {
				action: 'committed-pending-cleanup',
				outputs: { dark: journal.next.dark, light: journal.next.light },
				warnings: [errorMessage(cleanupError)]
			};
		}
	} catch (error) {
		if (leaveInterruptedOnError(error)) throw error;
		const storageStop = storageExhaustionSafetyStop(error, {
			phase: 'during transactional pair publication',
			nextAction:
				'Free storage space or quota, then recover the publication journal before resuming.'
		});
		if (committed && committedLineageValidated && journal && newPublicationMatches(journal)) {
			return {
				action: 'committed-pending-cleanup',
				outputs: { dark: journal.next.dark, light: journal.next.light },
				warnings: [errorMessage(error)]
			};
		}
		if (journal) {
			try {
				rollbackPublication(journal, journalPath);
			} catch (rollbackError) {
				throw publicationStop(
					`Art publication failed and rollback could not restore the prior pair: ${errorMessage(
						rollbackError
					)}`,
					{ jobPath, finalDark, finalLight },
					error
				);
			}
		} else if (!journal) {
			removeExisting(Object.values(files));
		}
		throw storageStop ?? error;
	}
}

export function publicationJournalPath(jobPath) {
	return `${jobPath}.publication.json`;
}

function readAndValidateJournal(journalPath, expected) {
	const stats = lstatSync(journalPath);
	if (!stats.isFile() || stats.isSymbolicLink()) {
		throw publicationStop('Art publication journal must be a regular file.', expected);
	}
	let journal;
	try {
		journal = JSON.parse(readFileSync(journalPath, 'utf8'));
	} catch (error) {
		throw publicationStop('Art publication journal is malformed.', expected, error);
	}
	if (
		journal?.schemaVersion !== ART_PUBLICATION_SCHEMA ||
		journal.jobPath !== expected.jobPath ||
		journal.finalDark !== expected.finalDark ||
		journal.finalLight !== expected.finalLight ||
		!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(journal.token)
	) {
		throw publicationStop('Art publication journal identity is invalid.', expected);
	}
	const expectedFiles = {
		darkCandidate: auxiliaryPath(expected.finalDark, journal.token, 'candidate'),
		lightCandidate: auxiliaryPath(expected.finalLight, journal.token, 'candidate'),
		jobCandidate: auxiliaryPath(expected.jobPath, journal.token, 'candidate'),
		darkBackup: auxiliaryPath(expected.finalDark, journal.token, 'backup'),
		lightBackup: auxiliaryPath(expected.finalLight, journal.token, 'backup'),
		jobBackup: auxiliaryPath(expected.jobPath, journal.token, 'backup')
	};
	if (JSON.stringify(journal.files) !== JSON.stringify(expectedFiles)) {
		throw publicationStop('Art publication journal auxiliary paths are invalid.', expected);
	}
	for (const collection of [journal.prior, journal.next]) {
		if (!collection || typeof collection !== 'object') {
			throw publicationStop('Art publication journal records are incomplete.', expected);
		}
	}
	for (const record of Object.values(journal.prior)) {
		if (record !== null && !validFileRecord(record)) {
			throw publicationStop('Art publication journal prior records are malformed.', expected);
		}
	}
	for (const record of Object.values(journal.next)) {
		if (!validFileRecord(record)) {
			throw publicationStop('Art publication journal next records are malformed.', expected);
		}
	}
	return journal;
}

function newPublicationMatches(journal) {
	return (
		matchesRecord(journal.finalDark, journal.next.dark) &&
		matchesRecord(journal.finalLight, journal.next.light) &&
		matchesRecord(journal.jobPath, journal.next.job)
	);
}

function rollbackPublication(journal, journalPath) {
	for (const [destination, backup, record, nextRecord] of [
		[journal.finalDark, journal.files.darkBackup, journal.prior.dark, journal.next.dark],
		[journal.finalLight, journal.files.lightBackup, journal.prior.light, journal.next.light],
		[journal.jobPath, journal.files.jobBackup, journal.prior.job, journal.next.job]
	]) {
		if (record === null) {
			if (existsSync(destination)) {
				if (!matchesRecord(destination, nextRecord)) {
					throw publicationStop(
						`Refusing to remove an unrecognized partial publication at ${destination}.`,
						{
							jobPath: journal.jobPath,
							finalDark: journal.finalDark,
							finalLight: journal.finalLight
						}
					);
				}
				unlinkSync(destination);
			}
			continue;
		}
		if (matchesRecord(destination, record)) continue;
		if (existsSync(destination) && !matchesRecord(destination, nextRecord)) {
			throw publicationStop(
				`Refusing to overwrite unrecognized bytes during rollback at ${destination}.`,
				{
					jobPath: journal.jobPath,
					finalDark: journal.finalDark,
					finalLight: journal.finalLight
				}
			);
		}
		if (!matchesRecord(backup, record)) {
			throw publicationStop(`Required publication backup is missing or changed: ${backup}`, {
				jobPath: journal.jobPath,
				finalDark: journal.finalDark,
				finalLight: journal.finalLight
			});
		}
		atomicCopy(backup, destination);
	}
	for (const [destination, record] of [
		[journal.finalDark, journal.prior.dark],
		[journal.finalLight, journal.prior.light],
		[journal.jobPath, journal.prior.job]
	]) {
		if (record === null ? existsSync(destination) : !matchesRecord(destination, record)) {
			throw publicationStop(`Publication rollback did not restore ${destination}.`, {
				jobPath: journal.jobPath,
				finalDark: journal.finalDark,
				finalLight: journal.finalLight
			});
		}
	}
	cleanupTransaction(journal, journalPath);
}

function cleanupTransaction(journal, journalPath) {
	removeExisting([...Object.values(journal.files), journalPath]);
	removeStrandedAuxiliaryFiles([
		journal.finalDark,
		journal.finalLight,
		journal.jobPath,
		journalPath
	]);
	for (const directory of new Set([
		path.dirname(journal.finalDark),
		path.dirname(journal.finalLight),
		path.dirname(journal.jobPath)
	])) {
		syncDirectory(directory);
	}
}

function removeStrandedAuxiliaryFiles(destinations) {
	const removed = [];
	for (const destination of destinations) {
		const directory = path.dirname(destination);
		if (!existsSync(directory)) continue;
		const basename = path.basename(destination);
		let removedInDirectory = false;
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (!entry.name.startsWith(`${basename}.`)) continue;
			const suffix = entry.name.slice(basename.length);
			const isTransactionAuxiliary = /^\.qc-art-[a-f0-9-]+\.(?:candidate|backup)$/.test(suffix);
			const isAtomicTemporary = /^\.tmp-\d+(?:-[a-f0-9-]+)?$/.test(suffix);
			if (!isTransactionAuxiliary && !isAtomicTemporary) continue;
			const filePath = path.join(directory, entry.name);
			if (!entry.isFile() || entry.isSymbolicLink?.()) {
				throw publicationStop('Stranded publication auxiliary is not a regular file.', {
					destination,
					filePath
				});
			}
			unlinkSync(filePath);
			removed.push(filePath);
			removedInDirectory = true;
		}
		if (removedInDirectory) syncDirectory(directory);
	}
	return removed;
}

function backupIfPresent(source, backup) {
	if (!existsSync(source)) return null;
	copyExclusiveAndSync(source, backup);
	return fileRecord(backup);
}

function copyExclusiveAndSync(source, destination) {
	copyFileSync(source, destination, constants.COPYFILE_EXCL);
	syncFile(destination);
}

function writeExclusiveAndSync(destination, text) {
	let descriptor;
	try {
		descriptor = openSync(destination, 'wx', 0o600);
		writeFileSync(descriptor, text);
		fsyncSync(descriptor);
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
	}
}

function atomicCopy(source, destination) {
	const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
	try {
		copyFileSync(source, temporary, constants.COPYFILE_EXCL);
		syncFile(temporary);
		renameSync(temporary, destination);
		syncDirectory(path.dirname(destination));
	} catch (error) {
		if (existsSync(temporary)) unlinkSync(temporary);
		throw error;
	}
}

function fileRecord(filePath) {
	const bytes = readFileSync(filePath);
	return {
		sha256: createHash('sha256').update(bytes).digest('hex'),
		size: bytes.byteLength
	};
}

function matchesRecord(filePath, record) {
	if (!record || !existsSync(filePath)) return false;
	const stats = lstatSync(filePath);
	if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== record.size) return false;
	return fileRecord(filePath).sha256 === record.sha256;
}

function validFileRecord(record) {
	return (
		record &&
		typeof record === 'object' &&
		/^[a-f0-9]{64}$/.test(record.sha256) &&
		Number.isInteger(record.size) &&
		record.size >= 0
	);
}

function removeExisting(filePaths) {
	for (const filePath of filePaths) {
		if (existsSync(filePath)) unlinkSync(filePath);
	}
}

function syncFile(filePath) {
	let descriptor;
	try {
		descriptor = openSync(filePath, 'r');
		fsyncSync(descriptor);
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
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

function syncDirectories(filePaths) {
	for (const directory of new Set(filePaths.map((filePath) => path.dirname(filePath)))) {
		syncDirectory(directory);
	}
}

function requireRegularFile(filePath, label, details) {
	const stats = lstatSync(filePath);
	if (!stats.isFile() || stats.isSymbolicLink()) {
		throw publicationStop(`Art publication ${label} is not a regular file.`, {
			...details,
			filePath
		});
	}
}

function auxiliaryPath(destination, token, kind) {
	return `${destination}.qc-art-${token}.${kind}`;
}

function publicationStop(message, details, cause) {
	return new ArtGenerationSafetyStop(message, {
		code: 'SCIENCE_ART_PUBLICATION_RECOVERY_FAILED',
		details: {
			...details,
			nextAction:
				'Do not regenerate. Restore or verify the journal/backups, then rerun the same command.'
		},
		cause
	});
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
