import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
	assertAcceptedReleaseTarget,
	assertExactAuthoredRemoteMembership,
	assertExpectedBefore,
	assertNoAuthoredOnlyDowngrade,
	buildImportPlan,
	buildWriteStatements,
	contentFingerprint,
	D1_BOUND_PARAMETER_LIMIT,
	D1_UPSERT_CHUNK_SIZE,
	parseArgs,
	requireCommittedAcceptedReleaseEvidence,
	storedContentFingerprint,
	verifyRemoteSnapshot
} from './import-challenge-short-recall-prompts.mjs';

test('the 92 to 271 release plan is dynamically additive and fingerprinted', () => {
	const expectedRows = sampleRows(271);
	const remoteRows = expectedRows.slice(0, 92).map(storedRow);
	const plan = buildImportPlan(expectedRows, remoteRows);

	assert.equal(plan.before.rowCount, 92);
	assert.equal(plan.before.contentFingerprint, storedContentFingerprint(remoteRows));
	assert.equal(plan.after.rowCount, 271);
	assert.equal(plan.after.contentFingerprint, contentFingerprint(expectedRows));
	assert.equal(plan.adds.length, 179);
	assert.equal(plan.changes.length, 0);
	assert.equal(plan.deletes.length, 0);
	assert.equal(plan.unchanged.length, 92);
	assert.match(plan.planSha256, /^[a-f0-9]{64}$/);
});

test('the accepted release gate requires 179 generated prompts split 34, 71 and 74', () => {
	const rows = sampleReleaseRows();
	const snapshot = {
		rows,
		generatedChallengeIds: rows.slice(92).map((row) => row.challengeId),
		generatedCountsBySubject: {
			biology: 34,
			chemistry: 71,
			physics: 74
		},
		countsBySubject: {
			biology: 64,
			chemistry: 101,
			physics: 106
		},
		acceptedReleaseEvidence: { releaseId: 'science-179-v1' }
	};
	assert.doesNotThrow(() => assertAcceptedReleaseTarget(snapshot));
	assert.throws(
		() =>
			assertAcceptedReleaseTarget({
				...snapshot,
				generatedChallengeIds: snapshot.generatedChallengeIds.slice(0, -1),
				rows: snapshot.rows.slice(0, -1)
			}),
		/92 authored plus 179 generated/
	);
	assert.throws(
		() =>
			assertAcceptedReleaseTarget({
				...snapshot,
				generatedCountsBySubject: { biology: 33, chemistry: 72, physics: 74 }
			}),
		/accepted generated biology/
	);
});

test('the exact plan identifies add, field-level change and guarded delete rows', () => {
	const expectedRows = sampleRows(3);
	const remoteRows = [
		storedRow(expectedRows[0]),
		{ ...storedRow(expectedRows[1]), content_version: 'short-recall-v0' },
		storedRow(sampleRows(1, 4)[0])
	];
	const plan = buildImportPlan(expectedRows, remoteRows);

	assert.deepEqual(plan.adds, [
		{
			challengeId: expectedRows[2].challengeId,
			contentSha256: expectedRows[2].contentSha256
		}
	]);
	assert.deepEqual(plan.changes, [
		{
			challengeId: expectedRows[1].challengeId,
			beforeContentSha256: expectedRows[1].contentSha256,
			afterContentSha256: expectedRows[1].contentSha256,
			fields: ['content_version']
		}
	]);
	assert.deepEqual(plan.deletes, [
		{
			challengeId: 'challenge-004',
			contentSha256: sampleRows(1, 4)[0].contentSha256
		}
	]);
	assert.deepEqual(plan.unchanged, ['challenge-001']);
});

test('writes execute only exact planned ids with old-hash guards and bounded insert chunks', () => {
	const expectedRows = sampleRows(271);
	const remoteRows = expectedRows.slice(0, 92).map(storedRow);
	remoteRows[0] = {
		...remoteRows[0],
		content_sha256: 'f'.repeat(64),
		content_version: 'short-recall-v0'
	};
	remoteRows.push(storedRow(sampleRows(1, 400)[0]));
	const plan = buildImportPlan(expectedRows, remoteRows);
	const statements = buildWriteStatements(expectedRows, {
		plan,
		expectedBeforeRows: remoteRows
	});

	assert.equal(plan.adds.length, 179);
	assert.equal(plan.changes.length, 1);
	assert.equal(plan.deletes.length, 1);
	assert.equal(statements.length, 1 + 1 + 1 + Math.ceil(plan.adds.length / D1_UPSERT_CHUNK_SIZE));
	assert.match(statements[0].sql, /exact_pre_write_guard/);
	assert.match(statements[0].sql, /json_each\(\?\)/);
	assert.equal(statements[0].params[0], remoteRows.length);
	assert.deepEqual(JSON.parse(statements[0].params[1]), remoteRows);
	assert.match(statements[1].sql, /DELETE FROM/);
	assert.match(statements[1].sql, /challenge_id = \? AND content_sha256 = \?/);
	assert.doesNotMatch(statements[1].sql, /NOT IN/);
	assert.deepEqual(statements[1].params, ['challenge-400', sampleRows(1, 400)[0].contentSha256]);
	assert.match(statements[2].sql, /UPDATE/);
	assert.match(statements[2].sql, /WHERE challenge_id = \? AND content_sha256 = \?/);
	assert.deepEqual(statements[2].params.slice(-2), ['challenge-001', 'f'.repeat(64)]);

	const insertedIds = [];
	for (const statement of statements.slice(3)) {
		assert.match(statement.sql, /ON CONFLICT\(challenge_id\) DO NOTHING/);
		assert.ok(statement.params.length <= D1_BOUND_PARAMETER_LIMIT);
		assert.equal(statement.params.length % 8, 0);
		for (let index = 0; index < statement.params.length; index += 8) {
			insertedIds.push(statement.params[index]);
		}
	}
	assert.deepEqual(
		insertedIds,
		plan.adds.map((entry) => entry.challengeId)
	);
	assert.throws(
		() =>
			buildWriteStatements(expectedRows, {
				plan: { ...plan, planSha256: '0'.repeat(64) },
				expectedBeforeRows: remoteRows
			}),
		/plan hash is invalid/
	);
});

test('explicit expected-before count and fingerprint are independent hard gates', () => {
	const expectedRows = sampleRows(3);
	const remoteRows = expectedRows.slice(0, 2).map(storedRow);
	const plan = buildImportPlan(expectedRows, remoteRows);

	assert.doesNotThrow(() =>
		assertExpectedBefore(plan, {
			expectedBeforeCount: 2,
			expectedBeforeFingerprint: storedContentFingerprint(remoteRows)
		})
	);
	assert.throws(
		() =>
			assertExpectedBefore(plan, {
				expectedBeforeCount: 3,
				expectedBeforeFingerprint: storedContentFingerprint(remoteRows)
			}),
		/explicitly authorized 3/
	);
	assert.throws(
		() =>
			assertExpectedBefore(plan, {
				expectedBeforeCount: 2,
				expectedBeforeFingerprint: '0'.repeat(64)
			}),
		/explicitly authorized/
	);
});

test('release writes require the exact 92 authored challenge ids as a separate gate', () => {
	const authoredIds = sampleRows(92).map((row) => row.challengeId);
	const remoteRows = sampleRows(92).map(storedRow);
	assert.doesNotThrow(() => assertExactAuthoredRemoteMembership(remoteRows, authoredIds));
	assert.throws(
		() => assertExactAuthoredRemoteMembership(remoteRows.slice(0, -1), authoredIds),
		/exact 92-row/
	);
	const wrongMembership = [...remoteRows];
	wrongMembership[0] = storedRow(sampleRows(1, 500)[0]);
	assert.throws(
		() => assertExactAuthoredRemoteMembership(wrongMembership, authoredIds),
		/not the exact authored/
	);
});

test('an authored-only target cannot plan a destructive generated-row downgrade', () => {
	const authoredRows = sampleRows(92);
	const generatedRemoteRows = sampleRows(271).map(storedRow);
	const destructivePlan = buildImportPlan(authoredRows, generatedRemoteRows);
	assert.throws(
		() => assertNoAuthoredOnlyDowngrade({ acceptedReleaseEvidence: null }, destructivePlan),
		/destructive authored-only downgrade/
	);
});

test('accepted release authentication requires all replayed siblings byte-identical in HEAD', () => {
	const fixture = committedReleaseFixture();
	const authenticated = requireCommittedAcceptedReleaseEvidence(fixture.snapshot, {
		rootDir: fixture.rootDir,
		readHeadFileImpl: fixture.readHeadFile,
		readHeadCommitImpl: () => 'a'.repeat(40),
		evidenceReader: fixture.evidenceReader
	});

	assert.equal(authenticated.releaseId, fixture.releaseId);
	assert.equal(authenticated.challengeCount, 2);
	assert.equal(authenticated.headCommit, 'a'.repeat(40));
	for (const fileName of [
		'accepted-challenges.json',
		'runtime.json',
		'short-recall-prompts.json',
		'short-recall-authoring-evidence.json',
		'short-recall-review-evidence.json'
	]) {
		assert.ok(authenticated.files.some((filePath) => filePath.endsWith(`/${fileName}`)));
	}

	assert.throws(
		() =>
			requireCommittedAcceptedReleaseEvidence(fixture.snapshot, {
				rootDir: fixture.rootDir,
				readHeadFileImpl: () => Buffer.from('dirty'),
				readHeadCommitImpl: () => 'a'.repeat(40),
				evidenceReader: fixture.evidenceReader
			}),
		/differs from HEAD/
	);
	assert.throws(
		() =>
			requireCommittedAcceptedReleaseEvidence(fixture.snapshot, {
				rootDir: fixture.rootDir,
				readHeadFileImpl: () => {
					throw new Error('not tracked');
				},
				readHeadCommitImpl: () => 'a'.repeat(40),
				evidenceReader: fixture.evidenceReader
			}),
		/not tracked in HEAD/
	);
	assert.throws(
		() =>
			requireCommittedAcceptedReleaseEvidence(fixture.snapshot, {
				rootDir: fixture.rootDir,
				readHeadFileImpl: fixture.readHeadFile,
				readHeadCommitImpl: () => 'a'.repeat(40),
				evidenceReader: () => ({ status: 'failed', issues: ['review mismatch'] })
			}),
		/did not replay.*review mismatch/
	);
});

test('accepted release authentication rejects non-accepted markers and replay membership drift', () => {
	const candidate = committedReleaseFixture({ status: 'candidate' });
	assert.throws(
		() =>
			requireCommittedAcceptedReleaseEvidence(candidate.snapshot, {
				rootDir: candidate.rootDir,
				readHeadFileImpl: candidate.readHeadFile,
				readHeadCommitImpl: () => 'b'.repeat(40),
				evidenceReader: candidate.evidenceReader
			}),
		/not an accepted release/
	);

	const accepted = committedReleaseFixture();
	assert.throws(
		() =>
			requireCommittedAcceptedReleaseEvidence(accepted.snapshot, {
				rootDir: accepted.rootDir,
				readHeadFileImpl: accepted.readHeadFile,
				readHeadCommitImpl: () => 'b'.repeat(40),
				evidenceReader: () => ({
					status: 'passed',
					candidateSet: { rows: [{ challengeId: 'different-generated-id' }] }
				})
			}),
		/replay differs/
	);
});

test('--write requires both valid expected-before arguments', () => {
	const rootDir = '/repo';
	assert.throws(() => parseArgs(['--write'], rootDir), /requires both/);
	assert.throws(
		() =>
			parseArgs(
				['--write', '--expected-before-count=92', '--expected-before-fingerprint=ABC'],
				rootDir
			),
		/lowercase SHA-256/
	);
	const parsed = parseArgs(
		['--write', '--expected-before-count=92', `--expected-before-fingerprint=${'a'.repeat(64)}`],
		rootDir
	);
	assert.equal(parsed.expectedBeforeCount, 92);
	assert.equal(parsed.expectedBeforeFingerprint, 'a'.repeat(64));
	assert.equal(parsed.verifyRemote, true);
});

test('post-write verification fingerprints the actual full readback', async () => {
	const expectedRows = sampleRows(271);
	const storedRows = expectedRows.map(storedRow).reverse();
	const d1RowsImpl = async (sql, params) => {
		assert.match(sql, /ORDER BY challenge_id/);
		assert.deepEqual(params, []);
		return storedRows;
	};
	const verification = await verifyRemoteSnapshot(expectedRows, { d1RowsImpl });
	assert.deepEqual(verification, {
		verified: true,
		rowCount: 271,
		contentFingerprint: storedContentFingerprint(storedRows),
		expectedContentFingerprint: contentFingerprint(expectedRows)
	});
	assert.equal(verification.contentFingerprint, verification.expectedContentFingerprint);
});

test('post-write verification fails closed on a stale field or unexpected row', async () => {
	const expectedRows = sampleRows(2);
	const staleRows = expectedRows.map(storedRow);
	staleRows[0] = { ...staleRows[0], content_version: 'short-recall-v0' };
	await assert.rejects(
		verifyRemoteSnapshot(expectedRows, { d1RowsImpl: async () => staleRows }),
		/content_version/
	);

	const unexpectedRows = [...expectedRows.map(storedRow), storedRow(sampleRows(1, 9)[0])];
	await assert.rejects(
		verifyRemoteSnapshot(expectedRows, { d1RowsImpl: async () => unexpectedRows }),
		/challenge-009: unexpected/
	);
});

function sampleRows(count, start = 1) {
	return Array.from({ length: count }, (_, offset) => {
		const index = start + offset;
		return {
			challengeId: `challenge-${String(index).padStart(3, '0')}`,
			stem: `Science statement ${index} needs the ___.`,
			canonicalAnswer: `term${index}`,
			acceptedAliases: [],
			spellingVariants: [`tre m${index}`],
			preferredHiddenStepIndex: 1,
			contentVersion: index <= 92 ? 'short-recall-v1' : 'generated-science-short-recall-v1',
			contentSha256: index.toString(16).padStart(64, '0').slice(-64),
			subject: index <= 64 ? 'biology' : index <= 165 ? 'chemistry' : 'physics'
		};
	});
}

function sampleReleaseRows() {
	const rows = sampleRows(271);
	const subjects = [
		...Array.from({ length: 30 }, () => 'biology'),
		...Array.from({ length: 30 }, () => 'chemistry'),
		...Array.from({ length: 32 }, () => 'physics'),
		...Array.from({ length: 34 }, () => 'biology'),
		...Array.from({ length: 71 }, () => 'chemistry'),
		...Array.from({ length: 74 }, () => 'physics')
	];
	return rows.map((row, index) => ({ ...row, subject: subjects[index] }));
}

function storedRow(row) {
	return {
		challenge_id: row.challengeId,
		prompt_stem: row.stem,
		canonical_answer: row.canonicalAnswer,
		accepted_aliases_json: JSON.stringify(row.acceptedAliases),
		spelling_variants_json: JSON.stringify(row.spellingVariants),
		preferred_hidden_step_index: row.preferredHiddenStepIndex,
		content_version: row.contentVersion,
		content_sha256: row.contentSha256
	};
}

function committedReleaseFixture({ status = 'accepted' } = {}) {
	const rootDir = mkdtempSync(path.join(os.tmpdir(), 'short-recall-import-'));
	const releaseId = 'science-release-test';
	const releaseRoot = path.join(rootDir, 'data', 'challenges', 'releases', releaseId);
	mkdirSync(releaseRoot, { recursive: true });
	const generatedChallengeIds = ['generated-one', 'generated-two'];
	const runtimeSha256 = '1'.repeat(64);
	const shortRecallBundleSha256 = '2'.repeat(64);
	const shortRecallCandidateSetSha256 = '3'.repeat(64);
	const release = {
		schemaVersion: 'science-challenge-release/v1',
		release: {
			id: releaseId,
			status,
			runtimeSha256,
			shortRecallBundleSha256,
			shortRecallCandidateSetSha256,
			shortRecallReviewSha256: '4'.repeat(64)
		},
		challenges: generatedChallengeIds.map((id) => ({
			definition: { id, subject: 'biology' }
		}))
	};
	const files = {
		'accepted-challenges.json': release,
		'runtime.json': { releaseId, definitions: generatedChallengeIds.map((id) => ({ id })) },
		'short-recall-prompts.json': generatedChallengeIds.map((challengeId) => ({ challengeId })),
		'short-recall-authoring-evidence.json': { status: 'passed' },
		'short-recall-review-evidence.json': { status: 'passed' }
	};
	for (const [fileName, value] of Object.entries(files)) {
		writeFileSync(path.join(releaseRoot, fileName), `${JSON.stringify(value, null, 2)}\n`);
	}
	const rows = [
		...sampleRows(92),
		...generatedChallengeIds.map((challengeId, index) => ({
			...sampleRows(1, 100 + index)[0],
			challengeId
		}))
	];
	const snapshot = {
		rows,
		generatedChallengeIds,
		acceptedReleaseEvidence: {
			releaseId,
			challengeIds: generatedChallengeIds,
			runtimeSha256,
			shortRecallBundleSha256,
			shortRecallCandidateSetSha256
		}
	};
	return {
		rootDir,
		releaseId,
		snapshot,
		readHeadFile: (relativePath) => readFileSync(path.resolve(rootDir, relativePath)),
		evidenceReader: () => ({
			status: 'passed',
			candidateSet: {
				rows: generatedChallengeIds.map((challengeId) => ({ challengeId }))
			}
		})
	};
}
