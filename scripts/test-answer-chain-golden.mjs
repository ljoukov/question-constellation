#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { answerChainSpecificityIssues } from './answer-chain-specificity.mjs';

const rootDir = process.cwd();
const fixturePath = path.join(rootDir, 'tests/golden/answer-chain-quality.json');

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function unique(values) {
	return Array.from(new Set(values)).sort();
}

function codesBySeverity(issues, severity) {
	return unique(issues.filter((issue) => issue.severity === severity).map((issue) => issue.code));
}

function missingExpected(actual, expected) {
	return expected.filter((code) => !actual.includes(code));
}

function unexpectedActual(actual, expected) {
	return actual.filter((code) => !expected.includes(code));
}

const fixture = readJson(fixturePath);
const failures = [];

for (const testCase of fixture.cases ?? []) {
	const issues = answerChainSpecificityIssues(testCase.answerChain, testCase.context ?? {});
	const blockingCodes = codesBySeverity(issues, 'error');
	const warningCodes = codesBySeverity(issues, 'warning');
	const expectedBlocking = unique(testCase.expect?.blockingCodes ?? []);
	const expectedWarnings = unique(testCase.expect?.warningCodes ?? []);
	const missingBlocking = missingExpected(blockingCodes, expectedBlocking);
	const unexpectedBlocking = unexpectedActual(blockingCodes, expectedBlocking);
	const missingWarnings = missingExpected(warningCodes, expectedWarnings);
	const unexpectedWarnings = unexpectedActual(warningCodes, expectedWarnings);

	if (
		missingBlocking.length ||
		unexpectedBlocking.length ||
		missingWarnings.length ||
		unexpectedWarnings.length
	) {
		failures.push({
			name: testCase.name,
			expectedBlocking,
			blockingCodes,
			missingBlocking,
			unexpectedBlocking,
			expectedWarnings,
			warningCodes,
			missingWarnings,
			unexpectedWarnings,
			issues
		});
	}
}

if (failures.length > 0) {
	console.error(
		JSON.stringify(
			{
				fixture: path.relative(rootDir, fixturePath),
				failures
			},
			null,
			2
		)
	);
	process.exit(1);
}

console.log(
	JSON.stringify(
		{
			fixture: path.relative(rootDir, fixturePath),
			cases: fixture.cases.length,
			status: 'passed'
		},
		null,
		2
	)
);
