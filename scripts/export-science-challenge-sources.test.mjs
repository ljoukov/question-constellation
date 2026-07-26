import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { writeScienceChallengeSourceOutput } from './export-science-challenge-sources.mjs';

const exporterCli = fileURLToPath(
	new URL('./export-science-challenge-sources.mjs', import.meta.url)
);

test('writes a safe relative output and returns only a repo-relative display label', () => {
	withRepository((repositoryRoot) => {
		const result = writeScienceChallengeSourceOutput({
			rootDir: repositoryRoot,
			output: 'tmp/exports/sources.json',
			contents: '{"safe":true}\n'
		});

		assert.equal(result.outputLabel, 'tmp/exports/sources.json');
		assert.equal(result.outputPath, path.join(repositoryRoot, 'tmp/exports/sources.json'));
		assert.equal(readFileSync(result.outputPath, 'utf8'), '{"safe":true}\n');
		assert.equal(result.outputLabel.includes(repositoryRoot), false);
	});
});

test('rejects absolute and repository-escaping outputs before creating anything', () => {
	withRepository((repositoryRoot, fixtureRoot) => {
		const absoluteOutput = path.join(repositoryRoot, 'absolute.json');
		const escapedOutput = path.join(fixtureRoot, 'escaped.json');

		for (const output of [absoluteOutput, '../escaped.json']) {
			assert.throws(
				() =>
					writeScienceChallengeSourceOutput({
						rootDir: repositoryRoot,
						output,
						contents: 'must not be written'
					}),
				(error) => {
					assert.match(error.message, /repo-relative file path/);
					assert.equal(error.message.includes(repositoryRoot), false);
					return true;
				}
			);
		}

		assert.equal(existsSync(absoluteOutput), false);
		assert.equal(existsSync(escapedOutput), false);
		assert.deepEqual(listRepositoryEntries(repositoryRoot), []);
	});
});

test('exclusive creation leaves an existing output unchanged', () => {
	withRepository((repositoryRoot) => {
		const output = path.join(repositoryRoot, 'tmp/sources.json');
		mkdirSync(path.dirname(output), { recursive: true });
		writeFileSync(output, 'original\n');

		assert.throws(
			() =>
				writeScienceChallengeSourceOutput({
					rootDir: repositoryRoot,
					output: 'tmp/sources.json',
					contents: 'replacement\n'
				}),
			(error) => {
				assert.match(error.message, /refusing to overwrite: tmp\/sources\.json/);
				assert.equal(error.message.includes(repositoryRoot), false);
				return true;
			}
		);
		assert.equal(readFileSync(output, 'utf8'), 'original\n');
	});
});

test('a payload write failure removes the final path claimed by this invocation', () => {
	withRepository((repositoryRoot) => {
		const output = path.join(repositoryRoot, 'tmp/sources.json');

		assert.throws(
			() =>
				writeScienceChallengeSourceOutput({
					rootDir: repositoryRoot,
					output: 'tmp/sources.json',
					// Deliberately invalid for fs.writeFileSync after the exclusive claim.
					contents: Symbol('invalid')
				}),
			/Could not create output tmp\/sources\.json/
		);
		assert.equal(existsSync(output), false);
	});
});

test('exclusive creation rejects a dangling output symlink without creating its target', () => {
	withRepository((repositoryRoot, fixtureRoot) => {
		const output = path.join(repositoryRoot, 'sources.json');
		const danglingTarget = path.join(fixtureRoot, 'must-not-be-created.json');
		symlinkSync(danglingTarget, output);

		assert.throws(
			() =>
				writeScienceChallengeSourceOutput({
					rootDir: repositoryRoot,
					output: 'sources.json',
					contents: 'must not be written'
				}),
			/already exists|symbolic link/i
		);
		assert.equal(lstatSync(output).isSymbolicLink(), true);
		assert.equal(existsSync(danglingTarget), false);
	});
});

test('does not follow a symlinked output parent', () => {
	withRepository((repositoryRoot, fixtureRoot) => {
		const outside = path.join(fixtureRoot, 'outside');
		mkdirSync(outside);
		symlinkSync(outside, path.join(repositoryRoot, 'linked'));

		assert.throws(
			() =>
				writeScienceChallengeSourceOutput({
					rootDir: repositoryRoot,
					output: 'linked/sources.json',
					contents: 'must not be written'
				}),
			/symbolic links/
		);
		assert.equal(existsSync(path.join(outside, 'sources.json')), false);
	});
});

test('CLI path validation does not print an absolute operator path', () => {
	withRepository((repositoryRoot) => {
		const absoluteOutput = path.join(repositoryRoot, 'sources.json');
		const result = spawnSync(process.execPath, [exporterCli, '--output', absoluteOutput], {
			cwd: repositoryRoot,
			encoding: 'utf8'
		});

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /repo-relative file path/);
		assert.equal(result.stderr.includes(repositoryRoot), false);
		assert.equal(result.stdout.includes(repositoryRoot), false);
		assert.deepEqual(listRepositoryEntries(repositoryRoot), []);
	});
});

function withRepository(callback) {
	const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'science-source-export-'));
	const repositoryRoot = path.join(fixtureRoot, 'repository');
	mkdirSync(repositoryRoot);
	try {
		return callback(repositoryRoot, fixtureRoot);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
}

function listRepositoryEntries(repositoryRoot) {
	return readdirSync(repositoryRoot);
}
