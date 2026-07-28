import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { canonicalHash } from './lib/challenge-catalog-bundle.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const cli = path.join(repositoryRoot, 'scripts/build-science-challenge-review-rebase.mjs');

test('review-rebase CLI documents every immutable input and the write-free mode', () => {
	const result = run(['--help']);

	assert.equal(result.status, 0, result.stderr);
	for (const option of [
		'--output-root',
		'--catalog-source',
		'--spec',
		'--base-plan',
		'--source',
		'--evidence',
		'--parent-verification',
		'--parent-repair',
		'--selections',
		'--dry-run'
	]) {
		assert.match(result.stdout, new RegExp(option, 'u'));
	}
});

test('review-rebase CLI rejects ambiguous flags and incomplete invocations', async (t) => {
	for (const [args, pattern] of [
		[['--dry-run=true'], /boolean flag/u],
		[['--dry-run', '--dry-run'], /Duplicate --dry-run/u],
		[['--unknown=value'], /Unknown option/u],
		[[], /--output-root is required/u]
	]) {
		await t.test(args.join(' ') || 'no arguments', () => {
			const result = run(args);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, pattern);
		});
	}
});

test('review-rebase CLI dry-run rejects path escape before creating its output root', () => {
	const outputRoot = `tmp/review-rebase-cli-test-${process.pid}`;
	const catalogSource = `tmp/review-rebase-cli-source-${process.pid}.json`;
	assert.equal(existsSync(path.join(repositoryRoot, outputRoot)), false);
	const unsignedCatalogSource = {
		schemaVersion: 'challenge-catalog-source/v1',
		release: {
			id: 'synthetic-review-rebase-test',
			contentSha256: 'a'.repeat(64),
			challengeCount: 1
		},
		records: [
			{
				definition: {
					id: 'existing-review-rebase-fixture',
					slug: 'existing-review-rebase-fixture',
					subject: 'biology'
				}
			}
		],
		subjects: [],
		arcs: []
	};
	writeFileSync(
		path.join(repositoryRoot, catalogSource),
		`${JSON.stringify({
			...unsignedCatalogSource,
			contentSha256: canonicalHash(unsignedCatalogSource)
		})}\n`
	);
	try {
		const result = run([
			`--output-root=${outputRoot}`,
			`--catalog-source=${catalogSource}`,
			'--spec=../outside.json',
			'--base-plan=missing/base-plan.json',
			'--source=missing/source.json',
			'--evidence=missing/evidence.json',
			'--parent-verification=missing/verification.json',
			'--parent-repair=missing/repair.json',
			'--selections=missing/selections.json',
			'--dry-run'
		]);

		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /repository-relative path/u);
		assert.equal(existsSync(path.join(repositoryRoot, outputRoot)), false);
	} finally {
		rmSync(path.join(repositoryRoot, catalogSource), { force: true });
	}
});

function run(args) {
	return spawnSync(process.execPath, [cli, ...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env: {
			...process.env,
			NO_COLOR: '1'
		}
	});
}
