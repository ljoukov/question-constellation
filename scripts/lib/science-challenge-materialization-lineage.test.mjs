import assert from 'node:assert/strict';
import test from 'node:test';

import {
	classifyScienceChallengeReviewRebaseMaterializationSource,
	scienceChallengeReviewRebaseInfrastructureRecoveryProposalLineage,
	workspaceRelativeMaterializationPath
} from './science-challenge-materialization-lineage.mjs';
import { canonicalHash } from './science-challenge-release.mjs';

const hash = (value) => canonicalHash(String(value));

function fixture() {
	const candidate = { candidate: 'terminal' };
	const validation = { validation: 'terminal' };
	const finalProposals = Array.from({ length: 49 }, (_, index) => ({
		shardId: `science-${String(index + 1).padStart(3, '0')}`,
		origin: index < 10 ? 'preserved-source-proposal' : 'recovery-invocation-proposal',
		logicalContentOrdinal: (index % 4) + 1,
		candidateSha256: index === 0 ? canonicalHash(candidate) : hash(`candidate-${index + 1}`),
		validationSha256: index === 0 ? canonicalHash(validation) : hash(`validation-${index + 1}`)
	}));
	const binding = {
		manifestPath: 'tmp/recovery/verification-repair-infrastructure-recovery.json',
		manifestSha256: hash('manifest'),
		recoveryId: hash('recovery'),
		recoveryExecutionId: hash('execution'),
		failedRootInventorySha256: hash('failed-root'),
		logicalLedgerSha256: hash('ledger'),
		preservedProposalSetSha256: hash('preserved'),
		finalProposalSetSha256: canonicalHash(finalProposals),
		contentNamespaceId: hash('namespace')
	};
	const terminal = {
		status: 'passed',
		binding,
		finalProposals,
		finalProposalOriginCounts: {
			'preserved-source-proposal': 10,
			'recovery-invocation-proposal': 39
		},
		frozenShardIds: ['science-050', 'science-051'],
		pendingShardIds: []
	};
	return { binding, terminal, candidate, validation };
}

test('selects current repair, terminal recovery, and frozen B0 sources in strict priority order', () => {
	const { binding, terminal, candidate, validation } = fixture();
	assert.equal(
		classifyScienceChallengeReviewRebaseMaterializationSource({
			infrastructureRecoveryBinding: binding,
			infrastructureRecoveryTerminal: terminal,
			shardId: 'science-001',
			candidate,
			validation
		}),
		'terminal-recovery-proposal'
	);
	assert.equal(
		classifyScienceChallengeReviewRebaseMaterializationSource({
			infrastructureRecoveryBinding: binding,
			infrastructureRecoveryTerminal: terminal,
			shardId: 'science-001',
			candidate: { candidate: 'V2 repair' },
			validation: { validation: 'V2 repair' }
		}),
		'current-successor-repair'
	);
	assert.equal(
		classifyScienceChallengeReviewRebaseMaterializationSource({
			infrastructureRecoveryBinding: binding,
			infrastructureRecoveryTerminal: terminal,
			shardId: 'science-001',
			candidate,
			validation,
			hasCurrentTypedRepair: true
		}),
		'current-typed-repair'
	);
	assert.equal(
		classifyScienceChallengeReviewRebaseMaterializationSource({
			infrastructureRecoveryBinding: binding,
			infrastructureRecoveryTerminal: terminal,
			shardId: 'science-050',
			candidate: { candidate: 'B0' },
			validation: { validation: 'B0' }
		}),
		'frozen-review-rebase-source'
	);
});

test('recovery proposal lineage follows terminal bytes through later unchanged successors', () => {
	const { binding, terminal, candidate, validation } = fixture();
	const lineage = scienceChallengeReviewRebaseInfrastructureRecoveryProposalLineage({
		infrastructureRecoveryBinding: binding,
		infrastructureRecoveryTerminal: terminal,
		shard: {
			shardId: 'science-001',
			disposition: 'successor-unchanged',
			lineage: {}
		},
		candidate,
		validation
	});
	assert.equal(lineage.logicalContentOrdinal, 1);
	assert.equal(lineage.terminalProposalSha256, canonicalHash(terminal.finalProposals[0]));
});

test('rejects malformed composition and workspace-escaping serialized paths', () => {
	const { binding, terminal, candidate, validation } = fixture();
	assert.throws(
		() =>
			classifyScienceChallengeReviewRebaseMaterializationSource({
				infrastructureRecoveryBinding: binding,
				infrastructureRecoveryTerminal: {
					...terminal,
					frozenShardIds: ['science-050']
				},
				shardId: 'science-001',
				candidate,
				validation
			}),
		/exact terminal 10\/39\/2/
	);
	assert.equal(
		workspaceRelativeMaterializationPath('/workspace', '/workspace/tmp/value.json'),
		'tmp/value.json'
	);
	assert.throws(
		() => workspaceRelativeMaterializationPath('/workspace', '/outside/value.json'),
		/must remain within/
	);
	assert.throws(
		() => workspaceRelativeMaterializationPath('/workspace', '/workspace'),
		/must remain within/
	);
});
