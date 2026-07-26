import assert from 'node:assert/strict';
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	ART_PUBLICATION_SCHEMA,
	publicationHeadroomBytes,
	publicationJournalPath,
	publicationRecoveryHeadroomBytes,
	publishArtPairAndJob,
	recoverArtPublication,
	recoverArtPublicationsForSpec
} from './science-question-art-publication.mjs';
import { createMinimumFreeSpaceGuard } from './science-question-art-run-safety.mjs';

test('publishes dark, light and job as one recoverable transaction', () => {
	const fixture = makeFixture();
	try {
		const result = publishArtPairAndJob(fixture.next);
		assert.equal(result.action, 'committed');
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'new-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'new-light');
		assert.equal(readFileSync(fixture.jobPath, 'utf8'), fixture.next.jobText);
		assert.equal(existsSync(publicationJournalPath(fixture.jobPath)), false);
		assert.deepEqual(auxiliaryFiles(fixture.root), []);
	} finally {
		fixture.cleanup();
	}
});

test('a caught mid-commit failure rolls the complete prior pair and job back', () => {
	const fixture = makeFixture({ withPrior: true });
	try {
		assert.throws(
			() =>
				publishArtPairAndJob({
					...fixture.next,
					onStep(step) {
						if (step === 'dark-committed') throw new Error('simulated rename failure');
					}
				}),
			/simulated rename failure/
		);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'old-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'old-light');
		assert.equal(readFileSync(fixture.jobPath, 'utf8'), 'old-job');
		assert.equal(existsSync(publicationJournalPath(fixture.jobPath)), false);
		assert.deepEqual(auxiliaryFiles(fixture.root), []);
	} finally {
		fixture.cleanup();
	}
});

test('committed lineage validation runs before cleanup and restores the prior triple on rejection', () => {
	const fixture = makeFixture({ withPrior: true });
	try {
		assert.throws(
			() =>
				publishArtPairAndJob({
					...fixture.next,
					validateCommitted() {
						throw new Error('semantic lineage rejected');
					}
				}),
			/semantic lineage rejected/
		);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'old-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'old-light');
		assert.equal(readFileSync(fixture.jobPath, 'utf8'), 'old-job');
		assert.equal(existsSync(publicationJournalPath(fixture.jobPath)), false);
		assert.deepEqual(auxiliaryFiles(fixture.root), []);
	} finally {
		fixture.cleanup();
	}
});

test('injected storage exhaustion rolls back publication and becomes a shared safety stop', () => {
	const fixture = makeFixture({ withPrior: true });
	try {
		assert.throws(
			() =>
				publishArtPairAndJob({
					...fixture.next,
					onStep(step) {
						if (step !== 'prepared') return;
						throw Object.assign(new Error('simulated quota exhaustion'), { code: 'EDQUOT' });
					}
				}),
			(error) => {
				assert.equal(error.code, 'SCIENCE_ART_STORAGE_EXHAUSTED');
				assert.equal(error.details.storageCode, 'EDQUOT');
				assert.equal(error.resumable, true);
				return true;
			}
		);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'old-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'old-light');
		assert.equal(readFileSync(fixture.jobPath, 'utf8'), 'old-job');
		assert.deepEqual(auxiliaryFiles(fixture.root), []);
	} finally {
		fixture.cleanup();
	}
});

test('validated publication with interrupted cleanup keeps its journal and reports pending cleanup', () => {
	const fixture = makeFixture({ withPrior: true });
	try {
		const result = publishArtPairAndJob({
			...fixture.next,
			onStep(step) {
				if (step === 'lineage-validated') throw new Error('cleanup interruption');
			}
		});
		assert.equal(result.action, 'committed-pending-cleanup');
		assert.match(result.warnings[0], /cleanup interruption/);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'new-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'new-light');
		assert.equal(existsSync(publicationJournalPath(fixture.jobPath)), true);
	} finally {
		fixture.cleanup();
	}
});

test('re-entry rolls back a crash-stranded partial pair from its journal', () => {
	const fixture = makeFixture({ withPrior: true });
	const simulatedCrash = new Error('simulated process crash');
	try {
		assert.throws(
			() =>
				publishArtPairAndJob({
					...fixture.next,
					onStep(step) {
						if (step === 'dark-committed') throw simulatedCrash;
					},
					leaveInterruptedOnError: (error) => error === simulatedCrash
				}),
			/simulated process crash/
		);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'new-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'old-light');
		assert.equal(existsSync(publicationJournalPath(fixture.jobPath)), true);
		assert.equal(
			recoverArtPublication({
				jobPath: fixture.jobPath,
				finalDark: fixture.finalDark,
				finalLight: fixture.finalLight,
				validateCommitted: () => {}
			}).action,
			'rolled-back-interrupted-publication'
		);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'old-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'old-light');
		assert.equal(readFileSync(fixture.jobPath, 'utf8'), 'old-job');
		assert.deepEqual(auxiliaryFiles(fixture.root), []);
	} finally {
		fixture.cleanup();
	}
});

test('rollback re-entry succeeds after destinations were restored and a backup was already cleaned', () => {
	const fixture = makeFixture({ withPrior: true });
	const simulatedCrash = new Error('leave rollback state');
	try {
		assert.throws(() =>
			publishArtPairAndJob({
				...fixture.next,
				onStep(step) {
					if (step === 'dark-committed') throw simulatedCrash;
				},
				leaveInterruptedOnError: (error) => error === simulatedCrash
			})
		);
		const journal = JSON.parse(readFileSync(publicationJournalPath(fixture.jobPath), 'utf8'));
		writeFileSync(fixture.finalDark, 'old-dark');
		unlinkSync(journal.files.darkBackup);
		const recovery = recoverArtPublication({
			jobPath: fixture.jobPath,
			finalDark: fixture.finalDark,
			finalLight: fixture.finalLight
		});
		assert.equal(recovery.action, 'rolled-back-interrupted-publication');
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'old-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'old-light');
		assert.equal(readFileSync(fixture.jobPath, 'utf8'), 'old-job');
		assert.deepEqual(auxiliaryFiles(fixture.root), []);
	} finally {
		fixture.cleanup();
	}
});

test('re-entry finalizes a fully committed pair/job left with a crash journal', () => {
	const fixture = makeFixture({ withPrior: true });
	const simulatedCrash = new Error('crash after job commit');
	try {
		assert.throws(
			() =>
				publishArtPairAndJob({
					...fixture.next,
					onStep(step) {
						if (step === 'job-committed') throw simulatedCrash;
					},
					leaveInterruptedOnError: (error) => error === simulatedCrash
				}),
			/crash after job commit/
		);
		assert.equal(
			recoverArtPublication({
				jobPath: fixture.jobPath,
				finalDark: fixture.finalDark,
				finalLight: fixture.finalLight,
				validateCommitted: () => {}
			}).action,
			'finalized-committed-publication'
		);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'new-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'new-light');
		assert.equal(readFileSync(fixture.jobPath, 'utf8'), fixture.next.jobText);
		assert.deepEqual(auxiliaryFiles(fixture.root), []);
	} finally {
		fixture.cleanup();
	}
});

test('re-entry rolls a fully committed but semantically invalid publication back', () => {
	const fixture = makeFixture({ withPrior: true });
	const simulatedCrash = new Error('crash after job commit');
	try {
		assert.throws(
			() =>
				publishArtPairAndJob({
					...fixture.next,
					onStep(step) {
						if (step === 'job-committed') throw simulatedCrash;
					},
					leaveInterruptedOnError: (error) => error === simulatedCrash
				}),
			/crash after job commit/
		);
		const recovery = recoverArtPublication({
			jobPath: fixture.jobPath,
			finalDark: fixture.finalDark,
			finalLight: fixture.finalLight,
			validateCommitted() {
				throw new Error('full lineage invalid');
			}
		});
		assert.equal(recovery.action, 'rolled-back-invalid-committed-publication');
		assert.match(recovery.validationError, /full lineage invalid/);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'old-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'old-light');
		assert.equal(readFileSync(fixture.jobPath, 'utf8'), 'old-job');
	} finally {
		fixture.cleanup();
	}
});

test('recovery fails closed when a required rollback backup was changed', () => {
	const fixture = makeFixture({ withPrior: true });
	const simulatedCrash = new Error('leave partial transaction');
	try {
		assert.throws(() =>
			publishArtPairAndJob({
				...fixture.next,
				onStep(step, journal) {
					if (step !== 'dark-committed') return;
					writeFileSync(journal.files.darkBackup, 'tampered-backup');
					throw simulatedCrash;
				},
				leaveInterruptedOnError: (error) => error === simulatedCrash
			})
		);
		assert.throws(
			() =>
				recoverArtPublication({
					jobPath: fixture.jobPath,
					finalDark: fixture.finalDark,
					finalLight: fixture.finalLight
				}),
			/backup is missing or changed/
		);
		assert.equal(existsSync(publicationJournalPath(fixture.jobPath)), true);
	} finally {
		fixture.cleanup();
	}
});

test('stranded candidates without a journal are removed and headroom includes backups', () => {
	const fixture = makeFixture({ withPrior: true });
	try {
		const stranded = `${fixture.finalDark}.qc-art-deadbeef.candidate`;
		writeFileSync(stranded, 'stranded');
		assert.equal(
			recoverArtPublication({
				jobPath: fixture.jobPath,
				finalDark: fixture.finalDark,
				finalLight: fixture.finalLight
			}).action,
			'removed-stranded-temporaries'
		);
		assert.equal(existsSync(stranded), false);
		assert.ok(publicationHeadroomBytes(fixture.next) > 1024n * 1024n);
	} finally {
		fixture.cleanup();
	}
});

test('recovery removes stranded atomic-copy and journal temporaries', () => {
	const fixture = makeFixture({ withPrior: true });
	try {
		const copyTemporary = `${fixture.finalDark}.tmp-123-deadbeef`;
		const journalTemporary = `${publicationJournalPath(fixture.jobPath)}.tmp-456-deadbeef`;
		writeFileSync(copyTemporary, 'copy-temp');
		writeFileSync(journalTemporary, 'journal-temp');
		const result = recoverArtPublication({
			jobPath: fixture.jobPath,
			finalDark: fixture.finalDark,
			finalLight: fixture.finalLight
		});
		assert.equal(result.action, 'removed-stranded-temporaries');
		assert.equal(existsSync(copyTemporary), false);
		assert.equal(existsSync(journalTemporary), false);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'old-dark');
	} finally {
		fixture.cleanup();
	}
});

test('recovery headroom accounts for rollback copies before mutation', () => {
	const fixture = makeFixture({ withPrior: true });
	const simulatedCrash = new Error('leave partial transaction');
	try {
		assert.throws(() =>
			publishArtPairAndJob({
				...fixture.next,
				onStep(step) {
					if (step === 'dark-committed') throw simulatedCrash;
				},
				leaveInterruptedOnError: (error) => error === simulatedCrash
			})
		);
		const headroom = publicationRecoveryHeadroomBytes({
			jobPath: fixture.jobPath,
			finalDark: fixture.finalDark,
			finalLight: fixture.finalLight
		});
		assert.ok(headroom > 1024n * 1024n);
		const guard = createMinimumFreeSpaceGuard({
			paths: [fixture.root],
			minimumBytes: 100n,
			getAvailableBytes: () => 100n + headroom - 1n
		});
		assert.throws(
			() =>
				guard.check({
					phase: 'before publication rollback',
					headroomBytes: headroom
				}),
			(error) => error.code === 'SCIENCE_ART_MIN_FREE_SPACE'
		);
		assert.equal(existsSync(publicationJournalPath(fixture.jobPath)), true);
	} finally {
		fixture.cleanup();
	}
});

test('spec-level recovery handles a repair journal before ordinary stray cleanup', () => {
	const fixture = makeFixture({ withPrior: true });
	const repairJobPath = path.join(path.dirname(fixture.jobPath), 'repair-aaaaaaaaaaaa-job.json');
	const simulatedCrash = new Error('repair crash after dark');
	try {
		assert.throws(
			() =>
				publishArtPairAndJob({
					...fixture.next,
					jobPath: repairJobPath,
					onStep(step) {
						if (step === 'dark-committed') throw simulatedCrash;
					},
					leaveInterruptedOnError: (error) => error === simulatedCrash
				}),
			/repair crash after dark/
		);
		const results = recoverArtPublicationsForSpec({
			jobPaths: [fixture.jobPath, repairJobPath],
			finalDark: fixture.finalDark,
			finalLight: fixture.finalLight,
			validateCommitted: () => {}
		});
		assert.equal(results[0].jobPath, repairJobPath);
		assert.equal(results[0].action, 'rolled-back-interrupted-publication');
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'old-dark');
		assert.equal(readFileSync(fixture.finalLight, 'utf8'), 'old-light');
		assert.equal(readFileSync(fixture.jobPath, 'utf8'), 'old-job');
		assert.equal(existsSync(repairJobPath), false);
		assert.deepEqual(auxiliaryFiles(fixture.root), []);
	} finally {
		fixture.cleanup();
	}
});

test('recovery refuses to overwrite destination bytes changed after a crash', () => {
	const fixture = makeFixture({ withPrior: true });
	const simulatedCrash = new Error('leave partial transaction');
	try {
		assert.throws(() =>
			publishArtPairAndJob({
				...fixture.next,
				onStep(step) {
					if (step === 'dark-committed') throw simulatedCrash;
				},
				leaveInterruptedOnError: (error) => error === simulatedCrash
			})
		);
		writeFileSync(fixture.finalDark, 'unrecognized-external-change');
		assert.throws(
			() =>
				recoverArtPublication({
					jobPath: fixture.jobPath,
					finalDark: fixture.finalDark,
					finalLight: fixture.finalLight
				}),
			/Refusing to overwrite unrecognized bytes/
		);
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'unrecognized-external-change');
		assert.equal(existsSync(publicationJournalPath(fixture.jobPath)), true);
	} finally {
		fixture.cleanup();
	}
});

test('recovery rejects a traversal token before touching any files', () => {
	const fixture = makeFixture({ withPrior: true });
	try {
		const outside = path.join(fixture.root, 'outside-sentinel');
		writeFileSync(outside, 'keep');
		writeFileSync(
			publicationJournalPath(fixture.jobPath),
			`${JSON.stringify({
				schemaVersion: ART_PUBLICATION_SCHEMA,
				token: '../outside-sentinel',
				jobPath: fixture.jobPath,
				finalDark: fixture.finalDark,
				finalLight: fixture.finalLight,
				files: {},
				prior: {},
				next: {}
			})}\n`
		);
		assert.throws(
			() =>
				recoverArtPublication({
					jobPath: fixture.jobPath,
					finalDark: fixture.finalDark,
					finalLight: fixture.finalLight
				}),
			(error) => {
				assert.equal(error.code, 'SCIENCE_ART_PUBLICATION_RECOVERY_FAILED');
				assert.match(error.message, /identity is invalid/);
				return true;
			}
		);
		assert.equal(readFileSync(outside, 'utf8'), 'keep');
		assert.equal(readFileSync(fixture.finalDark, 'utf8'), 'old-dark');
	} finally {
		fixture.cleanup();
	}
});

function makeFixture({ withPrior = false } = {}) {
	const root = mkdtempSync(path.join(tmpdir(), 'science-art-publication-'));
	const attempts = path.join(root, 'work', 'art-id', 'attempt-01');
	const output = path.join(root, 'outputs');
	const specDir = path.join(root, 'work', 'art-id');
	mkdirSync(attempts, { recursive: true });
	mkdirSync(output, { recursive: true });
	const darkSource = path.join(attempts, 'dark.webp');
	const lightSource = path.join(attempts, 'light.webp');
	const finalDark = path.join(output, 'dark.webp');
	const finalLight = path.join(output, 'light.webp');
	const jobPath = path.join(specDir, 'job.json');
	writeFileSync(darkSource, 'new-dark');
	writeFileSync(lightSource, 'new-light');
	if (withPrior) {
		writeFileSync(finalDark, 'old-dark');
		writeFileSync(finalLight, 'old-light');
		writeFileSync(jobPath, 'old-job');
	}
	const jobText = '{"status":"passed"}\n';
	return {
		root,
		finalDark,
		finalLight,
		jobPath,
		next: {
			darkSource,
			lightSource,
			finalDark,
			finalLight,
			jobPath,
			jobText,
			validateCommitted: () => {}
		},
		cleanup() {
			rmSync(root, { recursive: true, force: true });
		}
	};
}

function auxiliaryFiles(root) {
	const found = [];
	const visit = (directory) => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const filePath = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(filePath);
			else if (/\.qc-art-|\.publication\.json$/.test(entry.name)) found.push(filePath);
		}
	};
	visit(root);
	return found;
}
