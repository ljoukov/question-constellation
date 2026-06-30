#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fetchPublicChains } from './lib/public-chain-d1.mjs';
import { publicChainStyleIssues } from './lib/answer-chain-style.mjs';
import { writeJson } from './lib/llm-extraction-pipeline.mjs';

const rootDir = process.cwd();

const usage = `Usage:
node scripts/audit-public-answer-chain-style.mjs

Optional:
  --subject=all|Physics|Biology|Chemistry
  --chain-id=<id>                    may be passed multiple times
  --output=tmp/public-chain-style-audit.json
  --fail-on-error
  --fail-on-warning
  --include-reuse-warnings
  --json`;

if (hasArg('help')) {
	console.log(usage);
	process.exit(0);
}

const subject = stringArg('subject', 'all');
const outputPath = stringArg('output', 'tmp/public-chain-style-audit.json');
const jsonOnly = hasArg('json');
const failOnError = hasArg('fail-on-error');
const failOnWarning = hasArg('fail-on-warning');
const includeReuseWarnings = hasArg('include-reuse-warnings');
const chainIds = stringArgs('chain-id');

const chains = await fetchPublicChains({ rootDir, subject, chainIds });
const chainReports = chains.map((chain) => {
	const issues = publicChainStyleIssues(chain, { includeReuseWarnings });
	return {
		id: chain.id,
		title: chain.title,
		subjectArea: chain.subjectArea,
		publicQuestions: Number(chain.publicQuestions ?? 0),
		publicPapers: Number(chain.publicPapers ?? 0),
		issues
	};
});
const errorReports = chainReports.filter((chain) =>
	chain.issues.some((issue) => issue.severity === 'error')
);
const warningReports = chainReports.filter(
	(chain) =>
		chain.issues.some((issue) => issue.severity === 'warning') &&
		!chain.issues.some((issue) => issue.severity === 'error')
);
const output = {
	status:
		errorReports.length > 0 || (failOnWarning && warningReports.length > 0) ? 'failed' : 'passed',
	generatedAt: new Date().toISOString(),
	subject,
	chainIds,
	includeReuseWarnings,
	publicChains: chains.length,
	errorChains: errorReports.length,
	warningChains: warningReports.length,
	errors: chainReports.reduce(
		(sum, chain) => sum + chain.issues.filter((issue) => issue.severity === 'error').length,
		0
	),
	warnings: chainReports.reduce(
		(sum, chain) => sum + chain.issues.filter((issue) => issue.severity === 'warning').length,
		0
	),
	findings: chainReports.filter((chain) => chain.issues.length > 0)
};

if (outputPath) {
	const resolvedOutput = path.resolve(rootDir, outputPath);
	mkdirSync(path.dirname(resolvedOutput), { recursive: true });
	writeJson(resolvedOutput, output);
}

if (jsonOnly) {
	console.log(JSON.stringify(output, null, 2));
} else {
	console.log(
		JSON.stringify(
			{
				status: output.status,
				publicChains: output.publicChains,
				errorChains: output.errorChains,
				warningChains: output.warningChains,
				errors: output.errors,
				warnings: output.warnings,
				output: outputPath || null
			},
			null,
			2
		)
	);
	for (const finding of output.findings.slice(0, 30)) {
		const issueSummary = finding.issues
			.slice(0, 4)
			.map((issue) => `${issue.severity}:${issue.code}:${issue.field}`)
			.join(', ');
		console.log(
			`${finding.issues.some((issue) => issue.severity === 'error') ? 'ERROR' : 'WARNING'} ${finding.id}: ${issueSummary}`
		);
	}
}

if (failOnError && errorReports.length > 0) process.exitCode = 1;
if (failOnWarning && (errorReports.length > 0 || warningReports.length > 0)) process.exitCode = 1;

function hasArg(name) {
	return process.argv.includes(`--${name}`);
}

function stringArg(name, defaultValue) {
	const prefix = `--${name}=`;
	const arg = process.argv.find((candidate) => candidate.startsWith(prefix));
	return arg ? arg.slice(prefix.length) : defaultValue;
}

function stringArgs(name) {
	const prefix = `--${name}=`;
	return process.argv
		.filter((candidate) => candidate.startsWith(prefix))
		.map((arg) => arg.slice(prefix.length));
}
