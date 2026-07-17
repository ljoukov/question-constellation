import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { stableStringify } from '../../../scripts/lib/study-card-artifact.mjs';
import {
	assertPreparedStudyCardSourcePdfLock,
	preparedStudyCardAtomicTempPath,
	quarantineIncompletePreparedStudyCardRelease,
	requeuePreparedStudyCardJobWithMissingArtifact,
	writePreparedStudyCardStateAtomically
} from '../../../scripts/lib/prepared-study-card-completion-state.mjs';

const lockPath = 'docs/release-evidence/study-card-prepared-completion/prepared-run-lock.json';
const dryRunPath = 'docs/release-evidence/study-card-prepared-completion/orchestrator-dry-run.json';
const statePath = 'docs/release-evidence/study-card-prepared-completion/queue-state.json';

describe('prepared study-card completion orchestrator', () => {
	it('hash-binds the exact 438-target and 171-card queues without execution', () => {
		const lock = readJson(lockPath);
		const dryRun = readJson(dryRunPath);
		const { lockFingerprint } = lock;
		const inputs = { ...lock };
		delete inputs.schemaVersion;
		delete inputs.lockFingerprint;

		expect(lockFingerprint).toBe(sha256(stableStringify(inputs)));
		for (const input of [
			lock.executionQueue,
			lock.literatureQueue,
			lock.coverageLedger,
			lock.literatureSourcePreflight
		]) {
			expect(sha256(readFileSync(input.path))).toBe(input.sha256);
		}
		expect(lock.counts).toMatchObject({
			standardPhysicalBatches: 26,
			standardGenerationBatches: 24,
			archivedFreshReviewPhysicalBatches: 2,
			atomicStandardExecutionUnits: 25,
			standardTargets: 438,
			literatureShards: 13,
			literatureCards: 171
		});
		expect(lock.maxModelConcurrency).toBe(2);
		expect(lock.stageOrder).toEqual(['standard-study-cards', 'english-literature']);
		const queue = readJson(lock.executionQueue.path);
		expect(queue.lineage.standardGenerationPromptVersion).toBe(
			'standard-study-card-descendant-coverage-v2'
		);
		expect(
			queue.physicalBatches
				.filter(
					(batch: { executionKind: string }) => batch.executionKind === 'standard-generation-review'
				)
				.every(
					(batch: { dryPlan: { promptVersion: string } }) =>
						batch.dryPlan.promptVersion === 'standard-study-card-descendant-coverage-v2'
				)
		).toBe(true);
		const sourcePdfs = queue.physicalBatches
			.filter(
				(batch: { executionKind: string }) => batch.executionKind === 'standard-generation-review'
			)
			.map((batch: { dryPlan: { sourcePdf: { path: string; sha256: string } } }) => {
				const locked = batch.dryPlan.sourcePdf;
				expect(sha256(readFileSync(locked.path))).toBe(locked.sha256);
				expect(() =>
					assertPreparedStudyCardSourcePdfLock(locked, locked, 'locked-test-batch')
				).not.toThrow();
				return locked.path;
			});
		expect(new Set(sourcePdfs).size).toBe(5);
		expect(dryRun.status).toBe('passed-no-model-execution');
		expect(dryRun.modelCallsDuringDryRun).toBe(0);
		expect(dryRun.executeCommand).toBe(
			'node scripts/run-prepared-study-card-completion.mjs --execute'
		);
		if (existsSync(statePath)) {
			const state = readJson(statePath);
			expect(state).toMatchObject({
				schemaVersion: 'prepared-study-card-completion-state-v1',
				status: 'complete',
				lockFingerprint
			});
			expect(state.standard.jobs).toHaveLength(26);
			expect(state.literature.jobs).toHaveLength(13);
			expect(
				[...state.standard.jobs, ...state.literature.jobs].every(
					(job: { status: string }) => job.status === 'accepted'
				)
			).toBe(true);
		}
	});

	it('rejects a live standard source PDF path or hash that differs from the queue lock', () => {
		const locked = {
			path: 'data/curricula/sources/official.pdf',
			sha256: 'a'.repeat(64)
		};

		expect(() =>
			assertPreparedStudyCardSourcePdfLock(
				{ ...locked, sha256: 'b'.repeat(64) },
				locked,
				'mutated-hash'
			)
		).toThrow(/differs from the prepared queue lock/);
		expect(() =>
			assertPreparedStudyCardSourcePdfLock(
				{ ...locked, path: 'data/curricula/sources/replacement.pdf' },
				locked,
				'mutated-path'
			)
		).toThrow(/differs from the prepared queue lock/);
		expect(() =>
			assertPreparedStudyCardSourcePdfLock({ ...locked, extra: true }, locked, 'extra-source-field')
		).toThrow(/differs from the prepared queue lock/);
	});

	it('keeps the last good queue state when a write is killed before atomic rename', () => {
		const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'prepared-state-atomic-'));
		try {
			const filePath = path.join(temporaryRoot, 'queue-state.json');
			const temporaryPath = preparedStudyCardAtomicTempPath(filePath);
			writeFileSync(filePath, '{"status":"last-good"}\n');
			writeFileSync(temporaryPath, '{"status":');

			expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({ status: 'last-good' });
			writePreparedStudyCardStateAtomically(filePath, { status: 'next-good', accepted: 4 });
			expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
				status: 'next-good',
				accepted: 4
			});
			expect(existsSync(temporaryPath)).toBe(false);
		} finally {
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});

	it('quarantines a killed partial release before resume but never moves a complete publication', () => {
		const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'prepared-release-resume-'));
		const quarantineRoot = path.join(temporaryRoot, 'quarantine');
		const requiredEvidenceFiles = ['generation-run.json', 'review-model-output.json'];
		try {
			const partialDir = path.join(temporaryRoot, 'partial-release');
			mkdirSync(partialDir);
			writeFileSync(path.join(partialDir, 'plan.json'), '{}\n');
			const preservedPartial = quarantineIncompletePreparedStudyCardRelease({
				releaseDir: partialDir,
				requiredEvidenceFiles,
				quarantineRoot,
				suffix: 'killed-before-accepted-artifact'
			});
			expect(preservedPartial).toBe(
				path.join(
					quarantineRoot,
					'partial-release-preserved-incomplete-killed-before-accepted-artifact'
				)
			);
			expect(existsSync(partialDir)).toBe(false);
			expect(existsSync(path.join(preservedPartial!, 'plan.json'))).toBe(true);

			const acceptedPartialDir = path.join(temporaryRoot, 'accepted-file-only-release');
			mkdirSync(acceptedPartialDir);
			writeFileSync(path.join(acceptedPartialDir, 'accepted-study-cards.json'), '{}\n');
			const preservedAcceptedPartial = quarantineIncompletePreparedStudyCardRelease({
				releaseDir: acceptedPartialDir,
				requiredEvidenceFiles,
				quarantineRoot,
				suffix: 'killed-after-accepted-artifact'
			});
			expect(preservedAcceptedPartial).toBe(
				path.join(
					quarantineRoot,
					'accepted-file-only-release-preserved-incomplete-killed-after-accepted-artifact'
				)
			);
			expect(existsSync(acceptedPartialDir)).toBe(false);

			const completeDir = path.join(temporaryRoot, 'complete-release');
			mkdirSync(completeDir);
			for (const name of ['accepted-study-cards.json', ...requiredEvidenceFiles]) {
				writeFileSync(path.join(completeDir, name), '{}\n');
			}
			expect(
				quarantineIncompletePreparedStudyCardRelease({
					releaseDir: completeDir,
					requiredEvidenceFiles,
					quarantineRoot,
					suffix: 'must-not-move'
				})
			).toBeNull();
			expect(existsSync(completeDir)).toBe(true);

			const cleanCloneDir = path.join(temporaryRoot, 'manifest-backed-release');
			mkdirSync(cleanCloneDir);
			writeFileSync(path.join(cleanCloneDir, 'accepted-study-cards.json'), '{}\n');
			writeFileSync(path.join(cleanCloneDir, 'model-lineage-evidence.json'), '{}\n');
			expect(
				quarantineIncompletePreparedStudyCardRelease({
					releaseDir: cleanCloneDir,
					requiredEvidenceFiles,
					quarantineRoot,
					suffix: 'must-not-move-manifest'
				})
			).toBeNull();
			expect(existsSync(cleanCloneDir)).toBe(true);
		} finally {
			rmSync(temporaryRoot, { recursive: true, force: true });
		}
	});

	it('launches the two rejected-output review cohorts once as one atomic group', () => {
		const queue = readJson(
			'docs/release-evidence/study-card-descendant-coverage/tier-safe-execution-queue.json'
		);
		const recovery = queue.physicalBatches.filter(
			(batch: { executionKind: string }) =>
				batch.executionKind === 'archived-output-fresh-review-only'
		);
		const targets = queue.physicalBatches.flatMap(
			(batch: { componentIds: string[] }) => batch.componentIds
		);

		expect(queue.physicalBatches).toHaveLength(26);
		expect(targets).toHaveLength(438);
		expect(new Set(targets).size).toBe(438);
		expect(recovery).toHaveLength(2);
		expect(
			new Set(recovery.map((batch: { executionGroupId: string }) => batch.executionGroupId)).size
		).toBe(1);
		expect(
			new Set(recovery.map((batch: { command: string[] }) => stableStringify(batch.command))).size
		).toBe(1);
		expect(recovery.map((batch: { mode: string }) => batch.mode)).toEqual([
			'shared-rejected',
			'higher-only'
		]);
		expect(recovery.map((batch: { componentCount: number }) => batch.componentCount)).toEqual([
			1, 2
		]);
		expect(recovery[1].offeringIds).toEqual([
			'aqa-gcse-combined-science-trilogy-8464-v1.1:physics:higher'
		]);
	});

	it('requeues a stale accepted row when its durable artifact is missing', () => {
		const row = {
			id: 'missing-release',
			status: 'accepted',
			attempts: 1,
			artifactHash: 'a'.repeat(64),
			artifactPath: 'data/study-cards/releases/missing-release/accepted-study-cards.json',
			acceptedCardCount: 12,
			finishedAt: '2026-07-16T00:00:00.000Z',
			error: 'stale error',
			note: 'new-immutable-output-validated'
		};

		expect(requeuePreparedStudyCardJobWithMissingArtifact(row)).toEqual({
			id: 'missing-release',
			status: 'queued',
			attempts: 1,
			artifactHash: null,
			artifactPath: null,
			acceptedCardCount: null,
			lineageManifestPath: null,
			lineageManifestSha256: null,
			note: 'durable-artifact-missing-requeued'
		});
	});
});

function readJson(filePath: string) {
	return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sha256(value: string | Buffer) {
	return createHash('sha256').update(value).digest('hex');
}
