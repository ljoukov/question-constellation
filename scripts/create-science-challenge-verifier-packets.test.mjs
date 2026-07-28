import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalHash, stableStringify } from './lib/science-challenge-release.mjs';
import { buildScienceChallengeCurriculumRemapProposal } from './lib/science-challenge-curriculum-remap-review.mjs';

const cliPath = fileURLToPath(
	new URL('./create-science-challenge-verifier-packets.mjs', import.meta.url)
);
const VERIFIERS = [
	'/root/science_verify_001',
	'/root/science_verify_002',
	'/root/science_verify_003'
];
const ASSIGNMENT_COUNT = 7;
const VERIFIER_ASSIGNMENT_COUNTS = [3, 2, 2];

test('emits deterministic provenance-bound packets without reading assignment evidence', () => {
	const first = createFixture();
	const second = createFixture();
	try {
		for (const fixture of [first, second]) {
			const result = runCli(fixture);
			assert.equal(result.status, 0, result.stderr);
			const report = JSON.parse(result.stdout);
			assert.equal(report.status, 'passed');
			assert.equal(report.packetCount, 3);
			assert.equal(report.waveCount, ASSIGNMENT_COUNT);
			assert.equal(report.dispatchLedgerSha256, canonicalHash(fixture.ledger));
			assert.match(report.usage, /one payload per verifier/);
			assert.ok(existsSync(fixture.outputRoot));

			const manifest = readJson(path.join(fixture.outputRoot, 'manifest.json'));
			assert.equal(manifest.dispatchLedgerSha256, canonicalHash(fixture.ledger));
			assert.equal(manifest.assignmentIndexSha256, canonicalHash(fixture.index));
			assert.deepEqual(
				manifest.packets.map((packet) => [
					packet.taskName,
					packet.assignmentCount,
					packet.firstAssignmentId,
					packet.lastAssignmentId
				]),
				[
					[VERIFIERS[0], 3, 'science-001', 'science-003'],
					[VERIFIERS[1], 2, 'science-004', 'science-005'],
					[VERIFIERS[2], 2, 'science-006', 'science-007']
				]
			);

			let assignmentIndex = 0;
			for (let verifierIndex = 0; verifierIndex < 3; verifierIndex += 1) {
				const packetPath = path.join(
					fixture.outputRoot,
					`verifier-${String(verifierIndex + 1).padStart(2, '0')}`,
					'packet.json'
				);
				const packet = readJson(packetPath);
				assert.equal(packet.taskName, VERIFIERS[verifierIndex]);
				assert.equal(packet.assignmentCount, VERIFIER_ASSIGNMENT_COUNTS[verifierIndex]);
				assert.equal(packet.waves.length, VERIFIER_ASSIGNMENT_COUNTS[verifierIndex]);
				for (const [waveIndex, wave] of packet.waves.entries()) {
					const assignment = fixture.index.assignments[assignmentIndex];
					assert.deepEqual(
						[wave.waveNumber, wave.assignmentId, wave.assignmentPath, wave.assignmentSha256],
						[waveIndex + 1, assignment.assignmentId, assignment.path, assignment.sha256]
					);
					const payload = readJson(
						path.join(
							fixture.outputRoot,
							`verifier-${String(verifierIndex + 1).padStart(2, '0')}`,
							`wave-${String(waveIndex + 1).padStart(2, '0')}.json`
						)
					);
					assert.deepEqual(Object.keys(payload).sort(), ['message', 'target']);
					assert.equal(payload.target, VERIFIERS[verifierIndex]);
					assert.match(payload.message, new RegExp(assignment.assignmentId));
					assert.match(payload.message, new RegExp(assignment.sha256));
					assert.match(payload.message, new RegExp(canonicalHash(fixture.ledger)));
					assert.match(payload.message, /Review exactly one assignment/);
					assert.equal(canonicalHash(payload), wave.followupPayloadSha256);
					assignmentIndex += 1;
				}
			}

			const allOutput = outputSnapshot(fixture.outputRoot);
			assert.doesNotMatch(allOutput.bytes, /challenge-001-1/);
			assert.equal(
				existsSync(path.join(fixture.rootDir, fixture.index.assignments[0].path)),
				false,
				'the fixture deliberately has no assignment evidence files'
			);

			const beforeRefusal = allOutput.bytes;
			const refused = runCli(fixture);
			assert.notEqual(refused.status, 0);
			assert.match(refused.stderr, /refusing to overwrite verifier packet output/);
			assert.equal(outputSnapshot(fixture.outputRoot).bytes, beforeRefusal);
		}

		assert.deepEqual(outputSnapshot(first.outputRoot), outputSnapshot(second.outputRoot));
	} finally {
		rmSync(first.rootDir, { recursive: true, force: true });
		rmSync(second.rootDir, { recursive: true, force: true });
	}
});

test('refuses to emit anything without a frozen ledger', () => {
	const fixture = createFixture();
	try {
		rmSync(fixture.ledgerPath);
		const result = runCli(fixture);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /frozen dispatch ledger does not exist/);
		assert.equal(existsSync(fixture.outputRoot), false);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('OS-temp packet output carries immutable curriculum remap proposal evidence', () => {
	const fixture = createFixture();
	try {
		fixture.index.basePlanSha256 = fixture.index.planSha256;
		fixture.index.effectivePlanSha256 = fixture.index.planSha256;
		fixture.index.curriculumRemapVerifierInputSha256 = '8'.repeat(64);
		const challengeId = fixture.index.assignments[0].ids[0];
		const proposal = buildScienceChallengeCurriculumRemapProposal({
			challengeId,
			field: 'grounding.curriculumComponentId',
			from: 'aqa-gcse-biology-8461-v1.1:4-1-1',
			to: 'aqa-gcse-biology-8461-v1.1:4-1-1-2',
			basePlanSha256: fixture.index.planSha256,
			effectivePlanSha256: fixture.index.effectivePlanSha256 ?? fixture.index.planSha256,
			curriculumEvidenceSha256: fixture.index.curriculumEvidenceSha256,
			targetCandidateSha256: '5'.repeat(64),
			batchCandidateSha256: fixture.index.candidateSetSha256,
			baseReviewSha256: '6'.repeat(64),
			manifestSha256: '7'.repeat(64)
		});
		fixture.index.assignments[0].curriculumRemapProposals = [proposal];
		fixture.index.assignments[0].curriculumRemapProposalEvidence = [remapDisplayEvidence(proposal)];
		fixture.ledger.indexSha256 = canonicalHash(fixture.index);
		writeJson(fixture.indexPath, fixture.index);
		writeJson(fixture.ledgerPath, fixture.ledger);

		const result = runCli(fixture);
		assert.equal(result.status, 0, result.stderr);
		const packet = readJson(path.join(fixture.outputRoot, 'verifier-01', 'packet.json'));
		assert.deepEqual(packet.waves[0].curriculumRemapProposals, [proposal]);
		const payload = readJson(path.join(fixture.outputRoot, 'verifier-01', 'wave-01.json'));
		assert.match(payload.message, new RegExp(proposal.proposalSha256));
		assert.match(payload.message, new RegExp(proposal.baseReviewSha256));
		assert.match(
			payload.message,
			new RegExp(
				`complete ${fixture.index.candidateCount}-candidate plan-bound content review remains mandatory`,
				'i'
			)
		);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('emitted review-rebase packets and payloads retain exact typed collection evidence', () => {
	const fixture = createFixture();
	try {
		const targetId = fixture.index.assignments[0].ids[0];
		const remediations = [
			{
				issue: `${targetId} has a deterministic cohort-level context collision.`,
				preferredChallengeId: targetId
			}
		];
		const targetIds = [targetId];
		const shared = {
			reviewRebaseManifestSha256: '1'.repeat(64),
			reviewRebaseId: '2'.repeat(64),
			reviewRebaseCandidateSetSha256: fixture.index.candidateSetSha256,
			reviewRebaseCollectionValidationSha256: '3'.repeat(64),
			reviewRebaseCollectionRemediationSetSha256: canonicalHash(remediations),
			reviewRebaseCollectionRemediations: remediations,
			reviewRebaseCollectionRemediationTargetIds: targetIds,
			reviewRebaseCollectionRemediationTargetSetSha256: canonicalHash(targetIds)
		};
		Object.assign(fixture.index, shared);
		for (const assignment of fixture.index.assignments) {
			Object.assign(assignment, {
				reviewRebaseManifestSha256: shared.reviewRebaseManifestSha256,
				reviewRebaseId: shared.reviewRebaseId,
				reviewRebaseCandidateSetSha256: shared.reviewRebaseCandidateSetSha256,
				reviewRebaseCollectionRemediationSetSha256:
					shared.reviewRebaseCollectionRemediationSetSha256,
				reviewRebaseCollectionRemediations: assignment.ids.includes(targetId) ? remediations : []
			});
		}
		fixture.ledger.indexSha256 = canonicalHash(fixture.index);
		writeJson(fixture.indexPath, fixture.index);
		writeJson(fixture.ledgerPath, fixture.ledger);

		const result = runCli(fixture);
		assert.equal(result.status, 0, result.stderr);
		const packet = readJson(path.join(fixture.outputRoot, 'verifier-01', 'packet.json'));
		const targetedWave = packet.waves[0];
		const untargetedWave = packet.waves[1];
		assert.equal(packet.reviewRebaseId, shared.reviewRebaseId);
		assert.equal(
			targetedWave.reviewRebaseCollectionValidationSha256,
			shared.reviewRebaseCollectionValidationSha256
		);
		assert.deepEqual(targetedWave.reviewRebaseCollectionRemediations, remediations);
		assert.deepEqual(untargetedWave.reviewRebaseCollectionRemediations, []);
		const targetedPayload = readJson(path.join(fixture.outputRoot, 'verifier-01', 'wave-01.json'));
		const untargetedPayload = readJson(
			path.join(fixture.outputRoot, 'verifier-01', 'wave-02.json')
		);
		assert.match(targetedPayload.message, new RegExp(targetId));
		assert.match(targetedPayload.message, /Do not reject solely/i);
		assert.match(untargetedPayload.message, /no preferred remediation target/i);
	} finally {
		rmSync(fixture.rootDir, { recursive: true, force: true });
	}
});

test('rejects stale index binding, tampered dispatch rows and non-canonical ledger time', () => {
	for (const mutate of [
		(fixture) => {
			fixture.index.candidateSetSha256 = 'e'.repeat(64);
			writeJson(fixture.indexPath, fixture.index);
		},
		(fixture) => {
			fixture.ledger.dispatches[0].assignmentSha256 = 'f'.repeat(64);
			writeJson(fixture.ledgerPath, fixture.ledger);
		},
		(fixture) => {
			fixture.ledger.createdAt = '2026-07-23';
			writeJson(fixture.ledgerPath, fixture.ledger);
		}
	]) {
		const fixture = createFixture();
		try {
			mutate(fixture);
			const result = runCli(fixture);
			assert.notEqual(result.status, 0);
			assert.equal(existsSync(fixture.outputRoot), false);
		} finally {
			rmSync(fixture.rootDir, { recursive: true, force: true });
		}
	}
});

test('rejects a jointly forged unsafe assignment path and output outside verification', () => {
	const unsafeIndex = createFixture();
	try {
		unsafeIndex.index.assignments[0].path = '../generation/shards/science-001/candidate.json';
		unsafeIndex.ledger.dispatches[0].assignmentPath = unsafeIndex.index.assignments[0].path;
		unsafeIndex.ledger.indexSha256 = canonicalHash(unsafeIndex.index);
		writeJson(unsafeIndex.indexPath, unsafeIndex.index);
		writeJson(unsafeIndex.ledgerPath, unsafeIndex.ledger);
		const result = runCli(unsafeIndex);
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /unsafe or duplicate assignment path/);
		assert.equal(existsSync(unsafeIndex.outputRoot), false);
	} finally {
		rmSync(unsafeIndex.rootDir, { recursive: true, force: true });
	}

	const escapedOutput = createFixture();
	try {
		const outsideOutput = path.join(escapedOutput.rootDir, 'generation/verifier-packets');
		const result = runCli(escapedOutput, {
			outputRootArgument: `--output-root=${path.relative(escapedOutput.rootDir, outsideOutput)}`
		});
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /packet output root must be strictly inside/);
		assert.equal(existsSync(outsideOutput), false);
	} finally {
		rmSync(escapedOutput.rootDir, { recursive: true, force: true });
	}
});

function createFixture() {
	const rootDir = mkdtempSync(path.join(tmpdir(), 'science-verifier-packets-'));
	const verificationRoot = path.join(rootDir, 'verification');
	const indexPath = path.join(verificationRoot, 'assignment-index.json');
	const ledgerPath = path.join(verificationRoot, 'dispatch-ledger.json');
	const outputRoot = path.join(verificationRoot, 'verifier-packets');
	const assignments = Array.from({ length: ASSIGNMENT_COUNT }, (_unused, index) => {
		const ordinal = String(index + 1).padStart(3, '0');
		return {
			assignmentId: `science-${ordinal}`,
			path: `verification/assignments/science-${ordinal}.json`,
			sha256: String(index + 1).padStart(64, '0'),
			ids: Array.from(
				{ length: 8 },
				(_unusedId, challengeIndex) => `challenge-${ordinal}-${challengeIndex + 1}`
			)
		};
	});
	const index = {
		schemaVersion: 'science-challenge-verification-assignment-index/v1',
		planId: 'science-fixture-v1',
		planSha256: 'a'.repeat(64),
		sourceSnapshotSha256: 'b'.repeat(64),
		curriculumEvidenceSha256: 'c'.repeat(64),
		candidateSetSha256: 'd'.repeat(64),
		candidateCount: assignments.reduce((sum, assignment) => sum + assignment.ids.length, 0),
		assignments
	};
	const ledger = {
		schemaVersion: 'science-challenge-verifier-dispatch-ledger/v1',
		orchestrator: 'codex-collaboration',
		indexSha256: canonicalHash(index),
		createdAt: '2026-07-23T00:00:00.000Z',
		dispatches: assignments.map((assignment, assignmentIndex) => ({
			assignmentId: assignment.assignmentId,
			assignmentPath: assignment.path,
			assignmentSha256: assignment.sha256,
			orchestrator: 'codex-collaboration',
			taskName: verifierForAssignment(assignmentIndex),
			forkTurns: 'none',
			model: 'gpt-5.6-sol',
			reasoningEffort: 'max'
		}))
	};
	writeJson(indexPath, index);
	writeJson(ledgerPath, ledger);
	return { rootDir, verificationRoot, indexPath, ledgerPath, outputRoot, index, ledger };
}

function verifierForAssignment(assignmentIndex) {
	let upperBound = 0;
	for (const [verifierIndex, count] of VERIFIER_ASSIGNMENT_COUNTS.entries()) {
		upperBound += count;
		if (assignmentIndex < upperBound) return VERIFIERS[verifierIndex];
	}
	throw new Error(`No verifier allocation for assignment index ${assignmentIndex}.`);
}

function runCli(
	fixture,
	{
		additionalArguments = [],
		outputRootArgument = `--output-root=${path.relative(fixture.rootDir, fixture.outputRoot)}`
	} = {}
) {
	return spawnSync(
		process.execPath,
		[
			cliPath,
			`--index=${path.relative(fixture.rootDir, fixture.indexPath)}`,
			`--dispatch-ledger=${path.relative(fixture.rootDir, fixture.ledgerPath)}`,
			outputRootArgument,
			'--review-root=verification/reviews',
			...additionalArguments
		],
		{ cwd: fixture.rootDir, encoding: 'utf8' }
	);
}

function outputSnapshot(outputRoot) {
	const files = readdirSync(outputRoot, { recursive: true })
		.filter((entry) => !entry.endsWith(path.sep))
		.filter((entry) => {
			try {
				return readFileSync(path.join(outputRoot, entry)).length >= 0;
			} catch {
				return false;
			}
		})
		.sort();
	return {
		files,
		bytes: files
			.map((file) => `${file}\n${readFileSync(path.join(outputRoot, file), 'utf8')}`)
			.join('\n')
	};
}

function readJson(filePath) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, `${stableStringify(value)}\n`);
}

function remapDisplayEvidence(proposal) {
	return {
		challengeId: proposal.challengeId,
		proposalSha256: proposal.proposalSha256,
		field: proposal.field,
		from: {
			componentId: proposal.from,
			title: 'Cell biology',
			sourceTextSha256: '1'.repeat(64),
			substantiveExcerpt: 'The broad parent component excerpt.'
		},
		to: {
			componentId: proposal.to,
			title: 'Cell specialisation',
			sourceTextSha256: '2'.repeat(64),
			substantiveExcerpt: 'The exact descendant component excerpt.'
		},
		ancestryChain: [
			{ componentId: proposal.from, title: 'Cell biology' },
			{ componentId: proposal.to, title: 'Cell specialisation' }
		],
		targetRowDiffStatement: 'Only the curriculum component id changes.',
		originalSingleIssueGate: {
			field: proposal.field,
			category: 'curriculum',
			evidence: 'The original component was too broad.',
			repair: 'Use the exact descendant.'
		}
	};
}
