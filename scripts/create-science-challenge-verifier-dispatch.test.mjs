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
const ASSIGNMENT_COUNT = 7;

test('creates a validated arbitrary-sized ledger in index and verifier argument order', () => {
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

		const expectedCounts = [3, 2, 2];
		let allocationStart = 0;
		for (const [verifierIndex, taskName] of VERIFIERS.entries()) {
			const count = expectedCounts[verifierIndex];
			const allocation = ledger.dispatches.slice(allocationStart, allocationStart + count);
			assert.equal(allocation.length, count);
			assert.ok(allocation.every((dispatch) => dispatch.taskName === taskName));
			allocationStart += count;
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
				['science-001', 'science-003'],
				['science-004', 'science-005'],
				['science-006', 'science-007']
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

test('accepts a variable verifier count and balances contiguous blocks', () => {
	const fixture = createFixture();
	try {
		const result = runCli(fixture, { verifiers: VERIFIERS.slice(0, 2) });
		assert.equal(result.status, 0, result.stderr);
		const report = JSON.parse(result.stdout);
		assert.deepEqual(
			report.allocations.map((allocation) => allocation.assignmentCount),
			[4, 3]
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('rejects missing and duplicate canonical verifier identities before writing', () => {
	const cases = [
		{
			name: 'no identities',
			verifiers: [],
			expected: /at least one --verifier argument/
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
		assert.match(result.stderr, /contiguous science-NNN ids/);
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
	const assignments = Array.from({ length: ASSIGNMENT_COUNT }, (_unused, index) => {
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
		candidateCount: assignments.reduce((sum, assignment) => sum + assignment.ids.length, 0),
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
