import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	assertScienceChallengeMultipartSalvageApprovalsConsumed,
	readScienceChallengeMultipartSalvageSourceApprovals
} from './science-challenge-multipart-salvage-approval-cli.mjs';

test('reads repeatable exact shard-bound approvals and rejects duplicate, foreign and unconsumed entries', () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'science-salvage-approval-cli-'));
	try {
		const first = write(root, 'first.json', {
			shardId: 'science-028',
			selectedAttempt: 4,
			operatorDecision: 'approve'
		});
		const second = write(root, 'second.json', {
			shardId: 'science-044',
			selectedAttempt: 3,
			operatorDecision: 'approve'
		});
		const approvalByShard = readScienceChallengeMultipartSalvageSourceApprovals({
			paths: [first, second],
			rootDir: root,
			selectedShardIds: ['science-028', 'science-044'],
			rejectedShardIds: ['science-028', 'science-044']
		});
		assert.deepEqual(approvalByShard.get('science-028'), {
			shardId: 'science-028',
			selectedAttempt: 4,
			operatorDecision: 'approve'
		});
		assert.doesNotThrow(() =>
			assertScienceChallengeMultipartSalvageApprovalsConsumed({
				approvalByShard,
				consumedShardIds: ['science-028', 'science-044']
			})
		);
		assert.throws(
			() =>
				assertScienceChallengeMultipartSalvageApprovalsConsumed({
					approvalByShard,
					consumedShardIds: ['science-028']
				}),
			/not consumed.*science-044/i
		);
		assert.throws(
			() =>
				readScienceChallengeMultipartSalvageSourceApprovals({
					paths: [first, first],
					rootDir: root,
					selectedShardIds: ['science-028'],
					rejectedShardIds: ['science-028']
				}),
			/Multiple.*science-028/i
		);
		assert.throws(
			() =>
				readScienceChallengeMultipartSalvageSourceApprovals({
					paths: [second],
					rootDir: root,
					selectedShardIds: ['science-028'],
					rejectedShardIds: ['science-028', 'science-044']
				}),
			/outside the selected rejected repair cohort/i
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

function write(root, name, value) {
	const filePath = path.join(root, name);
	writeFileSync(filePath, `${JSON.stringify(value)}\n`);
	return filePath;
}
