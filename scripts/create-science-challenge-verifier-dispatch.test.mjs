import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalHash, stableStringify } from './lib/science-challenge-release.mjs';
import { validateScienceChallengeVerifierDispatchLedger } from './lib/science-challenge-verifier-dispatch.mjs';

const cliPath = fileURLToPath(
	new URL('./create-science-challenge-verifier-dispatch.mjs', import.meta.url)
);
const CREATED_AT = '2026-07-23T00:00:00.000Z';
const VERIFIERS = [
	'/root/science_verify_001',
	'/root/science_verify_002',
	'/root/science_verify_003'
];

test('creates a validated 51-row ledger in index and verifier argument order', () => {
	const fixture = createFixture();
	try {
		const result = runCli(fixture);
		assert.equal(result.status, 0, result.stderr);
		const ledger = readJson(fixture.outputPath);
		const validation = validateScienceChallengeVerifierDispatchLedger(ledger, fixture.index);
		assert.equal(validation.status, 'passed', validation.issues.join('\n'));
		assert.equal(ledger.createdAt, CREATED_AT);
		assert.deepEqual(
			ledger.dispatches.map((dispatch) => dispatch.assignmentId),
			fixture.index.assignments.map((assignment) => assignment.assignmentId)
		);

		for (const [verifierIndex, taskName] of VERIFIERS.entries()) {
			const start = verifierIndex * 17;
			const allocation = ledger.dispatches.slice(start, start + 17);
			assert.equal(allocation.length, 17);
			assert.ok(allocation.every((dispatch) => dispatch.taskName === taskName));
		}

		const rawLedger = readFileSync(fixture.outputPath, 'utf8');
		assert.equal(rawLedger, `${stableStringify(ledger)}\n`);
		const report = JSON.parse(result.stdout);
		assert.equal(report.dispatchLedgerSha256, canonicalHash(ledger));
		assert.deepEqual(
			report.allocations.map((allocation) => [
				allocation.firstAssignmentId,
				allocation.lastAssignmentId
			]),
			[
				['science-001', 'science-017'],
				['science-018', 'science-034'],
				['science-035', 'science-051']
			]
		);

		const secondRun = runCli(fixture);
		assert.notEqual(secondRun.status, 0);
		assert.match(secondRun.stderr, /refusing to overwrite the frozen dispatch ledger/);
		assert.equal(readFileSync(fixture.outputPath, 'utf8'), rawLedger);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('rejects missing, extra and duplicate canonical verifier identities before writing', () => {
	const cases = [
		{
			name: 'two identities',
			verifiers: VERIFIERS.slice(0, 2),
			expected: /exactly 3 --verifier arguments/
		},
		{
			name: 'four identities',
			verifiers: [...VERIFIERS, '/root/science_verify_004'],
			expected: /exactly 3 --verifier arguments/
		},
		{
			name: 'duplicate task name',
			verifiers: [VERIFIERS[0], VERIFIERS[0], VERIFIERS[2]],
			expected: /canonical task names must be unique/
		}
	];

	for (const testCase of cases) {
		const fixture = createFixture();
		try {
			const result = runCli(fixture, { verifiers: testCase.verifiers });
			assert.notEqual(result.status, 0, testCase.name);
			assert.match(result.stderr, testCase.expected, testCase.name);
			assert.equal(existsSync(fixture.outputPath), false, testCase.name);
		} finally {
			rmSync(fixture.rootDir, { recursive: true, force: true });
		}
	}
});

test('rejects non-canonical task names and obsolete paired identity syntax', () => {
	const cases = [
		{
			value: 'root/science_verify_001',
			expected: /canonical \/root/
		},
		{
			value: '/root/science-verify-001',
			expected: /canonical \/root/
		},
		{
			value: 'obsolete-opaque-id|/root/science_verify_001',
			expected: /canonical \/root/
		}
	];

	for (const testCase of cases) {
		const fixture = createFixture();
		try {
			const result = runCli(fixture, {
				verifiers: [testCase.value, VERIFIERS[1], VERIFIERS[2]]
			});
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, testCase.expected);
			assert.equal(existsSync(fixture.outputPath), false);
		} finally {
			rmSync(fixture.rootDir, { recursive: true, force: true });
		}
	}
});

test('rejects a reordered assignment index and a non-canonical creation timestamp', () => {
	const reordered = createFixture();
	try {
		[reordered.index.assignments[0], reordered.index.assignments[1]] = [
			reordered.index.assignments[1],
			reordered.index.assignments[0]
		];
		writeJson(reordered.indexPath, reordered.index);
		const result = runCli(reordered);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /assignment index order must be science-001 through science-051/);
		assert.equal(existsSync(reordered.outputPath), false);
	} finally {
		rmSync(reordered.rootDir, { recursive: true, force: true });
	}

	const timestamp = createFixture();
	try {
		const result = runCli(timestamp, { createdAt: '2026-07-23' });
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /canonical ISO date-time/);
		assert.equal(existsSync(timestamp.outputPath), false);
	} finally {
		rmSync(timestamp.rootDir, { recursive: true, force: true });
	}
});

function createFixture() {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'science-verifier-dispatch-'));
	const indexPath = path.join(rootDir, 'verification/assignment-index.json');
	const outputPath = path.join(rootDir, 'verification/dispatch-ledger.json');
	const assignments = Array.from({ length: 51 }, (_unused, index) => {
		const ordinal = String(index + 1).padStart(3, '0');
		return {
			assignmentId: `science-${ordinal}`,
			path: `verification/assignments/science-${ordinal}.json`,
			sha256: String(index + 1).padStart(64, '0'),
			ids: Array.from(
				{ length: 8 },
				(_unusedId, challengeIndex) => `challenge-${ordinal}-${challengeIndex + 1}`
			)
		};
	});
	const index = {
		schemaVersion: 'science-challenge-verification-assignment-index/v1',
		planId: 'science-fixture-v1',
		planSha256: 'a'.repeat(64),
		sourceSnapshotSha256: 'b'.repeat(64),
		curriculumEvidenceSha256: 'c'.repeat(64),
		candidateSetSha256: 'd'.repeat(64),
		assignments
	};
	writeJson(indexPath, index);
	return { rootDir, indexPath, outputPath, index };
}

function runCli(
	fixture,
	{ verifiers = VERIFIERS, createdAt = CREATED_AT, additionalArguments = [] } = {}
) {
	return spawnSync(
		process.execPath,
		[
			cliPath,
			`--index=${path.relative(fixture.rootDir, fixture.indexPath)}`,
			`--output=${path.relative(fixture.rootDir, fixture.outputPath)}`,
			`--created-at=${createdAt}`,
			...verifiers.map((verifier) => `--verifier=${verifier}`),
			...additionalArguments
		],
		{ cwd: fixture.rootDir, encoding: 'utf8' }
	);
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}
