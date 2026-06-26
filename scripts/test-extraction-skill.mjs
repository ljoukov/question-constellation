#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, lstatSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const skillPath = path.join(rootDir, 'skills/question-constellation-extraction/SKILL.md');
const packagePath = path.join(rootDir, 'package.json');
const localSkillPath = path.join(
	process.env.HOME ?? '',
	'.codex/skills/question-constellation-extraction'
);

function fail(message, details = null) {
	console.error(JSON.stringify({ status: 'failed', message, details }, null, 2));
	process.exit(1);
}

function readText(filePath) {
	if (!existsSync(filePath)) fail(`Missing file: ${path.relative(rootDir, filePath)}`);
	return readFileSync(filePath, 'utf8');
}

function requireIncludes(text, values, label) {
	const missing = values.filter((value) => !text.includes(value));
	if (missing.length > 0) fail(`${label} is missing required text.`, missing);
}

function runNodeScript(scriptPath, args = []) {
	return execFileSync(process.execPath, [scriptPath, ...args], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

const skill = readText(skillPath);
const packageJson = JSON.parse(readText(packagePath));

requireIncludes(
	skill,
	[
		'---\nname: question-constellation-extraction',
		'## Source Of Truth',
		'## Fast Acceptance Checks',
		'## Extraction And Repair Commands',
		'## Golden Data Workflow',
		'## Independent Reviewer Thread',
		'## Review Standard',
		'## Install This Skill Locally'
	],
	'Skill'
);

requireIncludes(
	skill,
	[
		'AGENTS.md',
		'docs/product-methodology.md',
		'docs/product-flows.md',
		'docs/extraction-spec.md',
		'tests/golden/answer-chain-quality.json',
		'node scripts/test-answer-chain-golden.mjs',
		'node scripts/audit-answer-chain-specificity.mjs --fail-on-blocking',
		'pnpm run repair:physics-vision-chains -- --all --specificity',
		'pnpm run import:physics-vision -- --all',
		'Do not edit files.',
		'Do not import to D1'
	],
	'Skill workflow'
);

for (const filePath of [
	'AGENTS.md',
	'docs/product-methodology.md',
	'docs/product-flows.md',
	'docs/extraction-spec.md',
	'scripts/test-answer-chain-golden.mjs',
	'scripts/audit-answer-chain-specificity.mjs',
	'scripts/repair-physics-vision-chains.mjs',
	'scripts/import-physics-vision.mjs',
	'tests/golden/answer-chain-quality.json'
]) {
	if (!existsSync(path.join(rootDir, filePath))) fail(`Skill references missing file: ${filePath}`);
}

for (const scriptName of [
	'extract:physics-vision',
	'import:physics-vision',
	'repair:physics-vision-chains',
	'test:chain-golden'
]) {
	if (!packageJson.scripts?.[scriptName]) fail(`Missing package script: ${scriptName}`);
}

const goldenOutput = JSON.parse(runNodeScript('scripts/test-answer-chain-golden.mjs'));
if (goldenOutput.status !== 'passed' || goldenOutput.cases < 4) {
	fail('Golden chain test did not pass through the skill contract test.', goldenOutput);
}

const auditOutput = JSON.parse(runNodeScript('scripts/audit-answer-chain-specificity.mjs', ['--json']));
for (const key of ['findings', 'blocking_findings', 'warning_findings']) {
	if (typeof auditOutput[key] !== 'number') {
		fail('Audit output is missing expected numeric keys.', auditOutput);
	}
}

let localInstall = 'not_checked';
if (process.argv.includes('--check-install')) {
	if (!existsSync(localSkillPath)) fail(`Local skill is not installed at ${localSkillPath}`);
	const stat = lstatSync(localSkillPath);
	localInstall = stat.isSymbolicLink() ? 'symlink' : 'directory';
}

console.log(
	JSON.stringify(
		{
			status: 'passed',
			skill: path.relative(rootDir, skillPath),
			localInstall,
			goldenCases: goldenOutput.cases,
			auditFindings: auditOutput.findings,
			auditBlockingFindings: auditOutput.blocking_findings,
			auditWarningFindings: auditOutput.warning_findings
		},
		null,
		2
	)
);
