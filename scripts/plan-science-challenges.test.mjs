import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	resolveScienceChallengePlanOutputs,
	writeScienceChallengePlanOutputs
} from './plan-science-challenges.mjs';

const plannerCli = fileURLToPath(new URL('./plan-science-challenges.mjs', import.meta.url));

test('claims and writes the plan and curriculum evidence as one absent pair', () => {
	withRepository((repositoryRoot) => {
		const result = writeScienceChallengePlanOutputs({
			rootDir: repositoryRoot,
			output: 'tmp/release/plan.json',
			planContents: '{"plan":true}\n',
			evidenceContents: '{"evidence":true}\n'
		});

		assert.equal(result.planLabel, 'tmp/release/plan.json');
		assert.equal(result.evidenceLabel, 'tmp/release/curriculum-evidence.json');
		assert.equal(readFileSync(result.planPath, 'utf8'), '{"plan":true}\n');
		assert.equal(readFileSync(result.evidencePath, 'utf8'), '{"evidence":true}\n');
		assert.equal(result.planLabel.includes(repositoryRoot), false);
		assert.equal(result.evidenceLabel.includes(repositoryRoot), false);
	});
});

test('an existing evidence sibling blocks the pair and leaves no plan artifact', () => {
	withRepository((repositoryRoot) => {
		const parent = path.join(repositoryRoot, 'tmp/release');
		const evidencePath = path.join(parent, 'curriculum-evidence.json');
		mkdirSync(parent, { recursive: true });
		writeFileSync(evidencePath, 'preserve me\n');

		assert.throws(
			() =>
				writeScienceChallengePlanOutputs({
					rootDir: repositoryRoot,
					output: 'tmp/release/plan.json',
					planContents: '{"plan":true}\n',
					evidenceContents: '{"replacement":true}\n'
				}),
			/refusing to overwrite: tmp\/release\/curriculum-evidence\.json/
		);
		assert.equal(existsSync(path.join(parent, 'plan.json')), false);
		assert.equal(readFileSync(evidencePath, 'utf8'), 'preserve me\n');
	});
});

test('a write failure removes both files claimed by this invocation', () => {
	withRepository((repositoryRoot) => {
		assert.throws(
			() =>
				writeScienceChallengePlanOutputs({
					rootDir: repositoryRoot,
					output: 'tmp/release/plan.json',
					planContents: '{"plan":true}\n',
					// Deliberately invalid for fs.writeFileSync after both exclusive claims.
					evidenceContents: Symbol('invalid')
				}),
			/Could not create plan output tmp\/release\/curriculum-evidence\.json/
		);
		assert.equal(existsSync(path.join(repositoryRoot, 'tmp/release/plan.json')), false);
		assert.equal(
			existsSync(path.join(repositoryRoot, 'tmp/release/curriculum-evidence.json')),
			false
		);
	});
});

test('dangling output symlinks are entries and can never be followed', () => {
	withRepository((repositoryRoot, fixtureRoot) => {
		const parent = path.join(repositoryRoot, 'tmp/release');
		const outside = path.join(fixtureRoot, 'outside-plan.json');
		mkdirSync(parent, { recursive: true });
		symlinkSync(outside, path.join(parent, 'plan.json'));

		assert.throws(
			() =>
				writeScienceChallengePlanOutputs({
					rootDir: repositoryRoot,
					output: 'tmp/release/plan.json',
					planContents: 'must not be written',
					evidenceContents: 'must not be written'
				}),
			/already exists|symbolic link/i
		);
		assert.equal(lstatSync(path.join(parent, 'plan.json')).isSymbolicLink(), true);
		assert.equal(existsSync(outside), false);
		assert.equal(existsSync(path.join(parent, 'curriculum-evidence.json')), false);
	});
});

test('a symlinked output parent is rejected without writing outside the repository', () => {
	withRepository((repositoryRoot, fixtureRoot) => {
		const outside = path.join(fixtureRoot, 'outside');
		mkdirSync(outside);
		symlinkSync(outside, path.join(repositoryRoot, 'linked'));

		assert.throws(
			() =>
				writeScienceChallengePlanOutputs({
					rootDir: repositoryRoot,
					output: 'linked/plan.json',
					planContents: 'must not be written',
					evidenceContents: 'must not be written'
				}),
			/symlink/
		);
		assert.deepEqual(existsSync(path.join(outside, 'plan.json')), false);
		assert.deepEqual(existsSync(path.join(outside, 'curriculum-evidence.json')), false);
	});
});

test('absolute, escaping, and reserved output paths fail before filesystem writes', () => {
	withRepository((repositoryRoot, fixtureRoot) => {
		for (const output of [
			path.join(repositoryRoot, 'absolute.json'),
			'../escaped.json',
			'tmp/curriculum-evidence.json'
		]) {
			assert.throws(
				() => resolveScienceChallengePlanOutputs({ rootDir: repositoryRoot, output }),
				/repo-relative|reserved curriculum-evidence/
			);
		}
		assert.equal(existsSync(path.join(fixtureRoot, 'escaped.json')), false);
	});
});

test('CLI path failures do not print the repository or operator path', () => {
	withRepository((repositoryRoot) => {
		const absoluteOutput = path.join(repositoryRoot, 'plan.json');
		const result = spawnSync(process.execPath, [plannerCli, `--output=${absoluteOutput}`], {
			cwd: repositoryRoot,
			encoding: 'utf8'
		});

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /repo-relative path/);
		assert.equal(result.stderr.includes(repositoryRoot), false);
		assert.equal(result.stdout.includes(repositoryRoot), false);
	});
});

function withRepository(callback) {
	const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'science-plan-output-'));
	const repositoryRoot = path.join(fixtureRoot, 'repository');
	mkdirSync(repositoryRoot);
	try {
		return callback(repositoryRoot, fixtureRoot);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
}
