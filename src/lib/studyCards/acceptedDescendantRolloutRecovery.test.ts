import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	hashStudyCardArtifact,
	validateStudyCardBundle
} from '../../../scripts/lib/study-card-artifact.mjs';
import { assertStudyCardCurriculumScope } from '../../../scripts/lib/study-card-import.mjs';

const rootDir = process.cwd();
const readJson = (relativePath: string) =>
	JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'));

describe('accepted descendant rollout recovery', () => {
	it('contains only the 12 accepted queue jobs and their 82 reviewed cards', () => {
		const evidence = readJson('docs/release-evidence/study-card-descendant-rollout-recovery.json');
		const catalog = readJson('data/curricula/curriculum-catalog.json');

		expect(evidence.status).toBe('accepted_transcripts_recovered');
		expect(evidence.queueEvidence).toMatchObject({
			totalJobs: 35,
			acceptedJobs: 12,
			failedAtAcceptedSnapshot: 1,
			runningAtAcceptedSnapshot: 2,
			queuedAtAcceptedSnapshot: 20
		});
		expect(evidence.totals).toEqual({
			releases: 12,
			cards: 82,
			coverageRows: 42,
			reviewerRepairs: 1,
			postAcceptanceScopeCorrections: 1
		});

		let cardCount = 0;
		for (const release of evidence.releases) {
			expect(release.releaseId).toBe(`${release.historicalBatchId}-rollout-recovered-v1`);
			const raw = readJson(release.artifactPath);
			const bundle = validateStudyCardBundle(raw);
			assertStudyCardCurriculumScope(bundle, catalog);
			expect(bundle.release.id).toBe(release.releaseId);
			expect(bundle.release.generator.runId).toBe(release.generatorRunId);
			expect(bundle.release.reviewer.runId).toBe(release.reviewerRunId);
			expect(hashStudyCardArtifact(bundle)).toBe(release.artifactHash);
			expect(bundle.cards).toHaveLength(release.cardCount);
			cardCount += bundle.cards.length;
		}
		expect(cardCount).toBe(82);
		expect(
			evidence.releases.some((release: { historicalBatchId: string }) =>
				release.historicalBatchId.includes('physics-shared-descendants-03-e7b6933413')
			)
		).toBe(false);
	});

	it('preserves repair lineage and the post-acceptance Physics tier correction', () => {
		const evidence = readJson('docs/release-evidence/study-card-descendant-rollout-recovery.json');
		const repairedRelease = evidence.releases.find(
			(release: { reviewerRepairCount: number }) => release.reviewerRepairCount === 1
		);
		const repaired = validateStudyCardBundle(readJson(repairedRelease.artifactPath));
		expect(repaired.release.supplementalRuns).toHaveLength(1);
		expect(repaired.release.supplementalRuns?.[0].cardIds).toEqual([
			'aqa-8464-cdcf4e788e-aqa-8464-5-3-2-1-mole-mass-relative-formula-mass'
		]);

		const physicsRelease = evidence.releases.find(
			(release: { scopeCorrectionApplied: boolean }) => release.scopeCorrectionApplied
		);
		const physics = validateStudyCardBundle(readJson(physicsRelease.artifactPath));
		const correctedIds = new Set([
			'aqa-8463-ba4007ba2c-aqa-physics-8463-4-5-7-3-force-causes-momentum-change',
			'aqa-8463-d6d0e2d29f-aqa-physics-8463-4-5-7-2-closed-system-momentum'
		]);
		for (const card of physics.cards.filter((row) => correctedIds.has(row.id))) {
			expect(card.targets.map((target) => target.offeringId)).toEqual([
				'aqa-gcse-physics-8463-v1.1:higher'
			]);
		}
		expect(physics.coverage.filter((row) => row.status === 'withheld')).toHaveLength(1);
	});
});
