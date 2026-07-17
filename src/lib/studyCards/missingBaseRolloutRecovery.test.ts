import { existsSync, readFileSync } from 'node:fs';
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

describe('missing base study-card rollout recovery', () => {
	it('materializes exactly the seven accepted base lineages under explicit recovery ids', () => {
		const evidence = readJson('docs/release-evidence/study-card-base-rollout-recovery.json');
		const catalog = readJson('data/curricula/curriculum-catalog.json');

		expect(evidence.status).toBe('accepted_base_transcripts_recovered');
		expect(evidence.modelCallsDuringRecovery).toBe(0);
		expect(evidence.totals).toEqual({
			releases: 7,
			cards: 253,
			distinctTargetComponents: 222,
			plannerEligibleTargetComponents: 221,
			nonPlannerEligibleTargetComponents: 1,
			coverageRows: 114,
			readyCoverageRows: 114,
			withheldCoverageRows: 0,
			deterministicRepairAcceptedCards: 1,
			reviewedRepairAttempts: 4,
			acceptedReviewedRepairs: 2,
			sessions: 24,
			validatorsPassed: 7
		});

		let cards = 0;
		for (const release of evidence.releases) {
			expect(release.releaseId).toBe(`${release.historicalReleaseId}-rollout-recovered-v1`);
			expect(
				existsSync(path.join(rootDir, 'data/study-cards/releases', release.historicalReleaseId))
			).toBe(false);
			const bundle = validateStudyCardBundle(readJson(release.artifactPath));
			assertStudyCardCurriculumScope(bundle, catalog);
			expect(bundle.release.id).toBe(release.releaseId);
			expect(bundle.cards).toHaveLength(release.cardCount);
			expect(bundle.coverage.every((row) => row.status === 'ready')).toBe(true);
			expect(hashStudyCardArtifact(bundle)).toBe(release.artifactHash);
			expect(release.validator).toMatchObject({
				status: 'valid',
				artifactHash: release.artifactHash
			});
			cards += bundle.cards.length;
		}
		expect(cards).toBe(253);
	});

	it('proves the planner and frozen completion queue share one exact 450-target union', () => {
		const evidence = readJson('docs/release-evidence/study-card-base-rollout-recovery.json');
		const plan = readJson(
			'docs/release-evidence/study-card-descendant-coverage/post-base-recovery-uncovered.json'
		);
		const completion = readJson(
			'docs/release-evidence/study-card-descendant-coverage/completion-queue.json'
		);
		const quarantine = readJson(
			'docs/release-evidence/study-card-descendant-coverage/quarantined-accidental-interrupted-attempts.json'
		);

		expect(evidence.postRecovery).toMatchObject({
			plannerTargetCount: 450,
			plannerUniqueTargetCount: 450,
			completionJobCount: 23,
			plannerAndCompletionTargetUnionMatch: true
		});
		expect(plan).toMatchObject({
			status: 'frozen-recovery-no-model-execution',
			targetCount: 450,
			uniqueTargetCount: 450,
			completionJobCount: 23,
			maximumTargetsPerJob: 20,
			duplicateTargetCount: 0
		});
		expect(completion.jobs).toHaveLength(23);
		expect(
			completion.jobs.flatMap((job: { componentIds: string[] }) => job.componentIds)
		).toHaveLength(450);
		expect(quarantine.status).toBe('quarantined-not-accepted');
		expect(quarantine.attempts).toHaveLength(2);
		expect(
			quarantine.attempts.every(
				(attempt: {
					candidateExists: boolean;
					reviewExists: boolean;
					acceptedArtifactExists: boolean;
				}) => !attempt.candidateExists && !attempt.reviewExists && !attempt.acceptedArtifactExists
			)
		).toBe(true);
	});
});
