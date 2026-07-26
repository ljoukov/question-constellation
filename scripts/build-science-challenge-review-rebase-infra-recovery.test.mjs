import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

import { buildCliOutput } from './build-science-challenge-review-rebase-infra-recovery.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const cli = path.join(
	repositoryRoot,
	'scripts/build-science-challenge-review-rebase-infra-recovery.mjs'
);

test('infrastructure-recovery CLI documents every parent-bound input and dry-run', () => {
	const result = run(['--help']);
	assert.equal(result.status, 0, result.stderr);
	for (const option of [
		'--workspace-root',
		'--catalog-root',
		'--review-rebase-manifest',
		'--verification-summary',
		'--failed-root',
		'--successor-root',
		'--dry-run'
	]) {
		assert.match(result.stdout, new RegExp(option, 'u'));
	}
});

test('infrastructure-recovery CLI rejects ambiguous or incomplete invocations', async (t) => {
	for (const [args, pattern] of [
		[['--dry-run=true'], /boolean flag/u],
		[['--dry-run', '--dry-run'], /Duplicate --dry-run/u],
		[['--unknown=value'], /Unknown option/u],
		[['--registry-root=isolated'], /Unknown option/u],
		[['--discovery-ledger-root=isolated'], /Unknown option/u],
		[['--discovery-search-root=isolated'], /Unknown option/u],
		[[], /--review-rebase-manifest is required/u],
		[
			[
				'--review-rebase-manifest=b0.json',
				'--verification-summary=v1.json',
				'--repair-verification=v1.json',
				'--failed-root=failed',
				'--successor-root=successor'
			],
			/Use only one/u
		]
	]) {
		await t.test(args.join(' ') || 'no arguments', () => {
			const result = run(args);
			assert.notEqual(result.status, 0);
			assert.match(result.stderr, pattern);
		});
	}
});

test('infrastructure-recovery CLI summary gives compact deterministic per-shard attempt proof', () => {
	const sourceAttempts = [
		{
			classification: 'strict-pre-model-infrastructure-exemption',
			unexposedAbsolutePath: '/private/example/attempt-01'
		},
		{
			classification: 'content-bearing-or-indeterminate',
			unexposedAbsolutePath: '/private/example/attempt-02'
		}
	];
	const output = buildCliOutput({
		dryRun: true,
		result: {
			status: 'planned',
			action: 'stage-successor',
			manifestSha256: 'a'.repeat(64),
			plannedWrites: ['tmp/recovery/verification-repair-infrastructure-recovery.json'],
			manifest: {
				successor: { path: 'tmp/recovery' },
				recoveryId: 'b'.repeat(64),
				recoveryExecutionId: 'c'.repeat(64),
				contentNamespaceId: 'd'.repeat(64),
				failedRootInventorySha256: 'e'.repeat(64),
				baselineLogicalLedgerSha256: 'f'.repeat(64),
				preservedProposalSetSha256: '0'.repeat(64),
				directChildRegistration: {
					authorityLabel: 'git-common-dir:science-challenge-review-rebase-child-registry/v2',
					lineageKeySha256: '1'.repeat(64),
					reservationSha256: '2'.repeat(64),
					commitSha256: '3'.repeat(64),
					diagnostics: {
						liveWorktreeCount: 2,
						liveWorktreeSetSha256: '4'.repeat(64),
						ignoredPrunableWorktreeCount: 0,
						ignoredPrunableWorktreeSetSha256: '5'.repeat(64)
					}
				},
				counts: {
					shardCount: 2,
					'passed-proposal': 0,
					'repair-required': 1,
					'frozen-nonmutable': 1
				},
				shards: [
					{
						shardId: 'science-010',
						status: 'repair-required',
						sourceAttempts,
						consumedLogicalContentAttempts: 1,
						nextLogicalContentOrdinal: 2,
						remainingLogicalContentAttempts: 3
					},
					{
						shardId: 'science-002',
						status: 'frozen-nonmutable',
						sourceAttempts: [],
						consumedLogicalContentAttempts: 0,
						nextLogicalContentOrdinal: null,
						remainingLogicalContentAttempts: 0
					}
				]
			}
		}
	});
	assert.deepEqual(output.shards, [
		{
			shardId: 'science-002',
			status: 'frozen-nonmutable',
			sourceAttemptCount: 0,
			preModelExemptAttemptCount: 0,
			consumedLogicalContentAttempts: 0,
			nextLogicalContentOrdinal: null,
			remainingLogicalContentAttempts: 0
		},
		{
			shardId: 'science-010',
			status: 'repair-required',
			sourceAttemptCount: 2,
			preModelExemptAttemptCount: 1,
			consumedLogicalContentAttempts: 1,
			nextLogicalContentOrdinal: 2,
			remainingLogicalContentAttempts: 3
		}
	]);
	assert.deepEqual(Object.keys(output.directChildRegistration).sort(), [
		'authorityLabel',
		'commitSha256',
		'diagnostics',
		'lineageKeySha256',
		'reservationSha256'
	]);
	assert.equal(Object.hasOwn(output.directChildRegistration, 'registryPath'), false);
	assert.equal(JSON.stringify(output).includes('/private/example'), false);
});

function run(args) {
	return spawnSync(process.execPath, [cli, ...args], {
		cwd: repositoryRoot,
		encoding: 'utf8',
		env: { ...process.env, NO_COLOR: '1' }
	});
}
