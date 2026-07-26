import assert from 'node:assert/strict';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS,
	readScienceChallengeAcceptedSubset
} from './lib/science-challenge-accepted-subset.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(repositoryRoot, 'scripts/build-science-challenge-accepted-subset.mjs');
const evidenceRoot = path.resolve(repositoryRoot, '../question-constellation-evi-ui-takeover');
const hasLiveEvidence =
	existsSync(path.join(evidenceRoot, 'src/lib/challenges/catalog.ts')) &&
	existsSync(
		path.join(
			evidenceRoot,
			'tmp/science-challenges/science-500-v1/verification-completion-20260724-cycle02/summary.json'
		)
	);

test('CLI documents the immutable accepted-subset evidence directory', () => {
	const result = runCli(['--help']);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /science-179-v1\/accepted-subset-evidence/u);
	assert.match(result.stdout, /--dry-run/u);
});

test('CLI rejects assigned booleans and unknown options before loading evidence', () => {
	for (const [args, expected] of [
		[['--dry-run=false'], /boolean flag and does not accept a value/iu],
		[['--unknown=value'], /Unknown option --unknown/iu],
		[['positional'], /Unexpected positional argument positional/iu]
	]) {
		const result = runCli(args);
		assert.equal(result.status, 1);
		assert.match(result.stderr, expected);
		assertNoMachineIdentity(result.stderr);
	}
});

test(
	'CLI dry-run is write-free, publication is replayable, and the root is immutable',
	{ skip: hasLiveEvidence ? false : 'Historical B0/V1 evidence checkout is not present.' },
	() => {
		const outputRoot = `tmp/science-challenges/science-179-v1/accepted-subset-evidence-test-${process.pid}-${Date.now()}`;
		const absoluteOutputRoot = path.join(repositoryRoot, outputRoot);
		try {
			const dryRun = runCli([
				'--dry-run',
				`--evidence-root=${path.relative(repositoryRoot, evidenceRoot)}`,
				`--output-root=${outputRoot}`
			]);
			assert.equal(dryRun.status, 0, dryRun.stderr);
			const planned = JSON.parse(dryRun.stdout);
			assert.equal(planned.status, 'planned');
			assert.equal(planned.acceptedCount, 179);
			assert.equal(planned.rejectedCount, 229);
			assert.deepEqual(planned.plannedWrites, []);
			assert.equal(existsSync(absoluteOutputRoot), false);
			assertNoMachineIdentity(dryRun.stdout);

			const publication = runCli([
				`--evidence-root=${path.relative(repositoryRoot, evidenceRoot)}`,
				`--output-root=${outputRoot}`
			]);
			assert.equal(publication.status, 0, publication.stderr);
			const published = JSON.parse(publication.stdout);
			assert.equal(published.status, 'passed');
			assert.equal(
				published.acceptedCandidateSetSha256,
				SCIENCE_CHALLENGE_ACCEPTED_SUBSET_SOURCE_BINDINGS.acceptedCandidateSetSha256
			);
			assert.deepEqual(readdirSync(absoluteOutputRoot).sort(), [
				'accepted-subset.json',
				'collection-validation.json',
				'evidence-projection.json',
				'hash-receipt.json',
				'holdout-ledger.json',
				'manifest.json'
			]);
			assertNoMachineIdentity(publication.stdout);

			const replay = readScienceChallengeAcceptedSubset({
				repositoryRoot,
				outputRoot
			});
			assert.equal(replay.status, 'passed', replay.issues?.join('\n'));
			assert.equal(replay.acceptedSubset.challenges.length, 179);
			assert.equal(replay.holdoutLedger.holdouts.length, 229);

			const secondPublication = runCli([
				`--evidence-root=${path.relative(repositoryRoot, evidenceRoot)}`,
				`--output-root=${outputRoot}`
			]);
			assert.equal(secondPublication.status, 1);
			assert.match(secondPublication.stderr, /output root must be absent/iu);
			assertNoMachineIdentity(secondPublication.stderr);
		} finally {
			if (existsSync(absoluteOutputRoot)) {
				rmSync(absoluteOutputRoot, { recursive: true, force: true });
			}
		}
	}
);

function runCli(args) {
	return spawnSync(process.execPath, [script, ...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		timeout: 30_000
	});
}

function assertNoMachineIdentity(value) {
	assert.doesNotMatch(value, /\/(?:Users|home|root)\//u);
	assert.doesNotMatch(value, /yaroslav(?:_|)volovich/iu);
	assert.doesNotMatch(value, /science_verify_completion/iu);
}
