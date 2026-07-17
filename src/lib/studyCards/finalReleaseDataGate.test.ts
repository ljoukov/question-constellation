import { describe, expect, it } from 'vitest';

import {
	EXPECTED,
	buildFinalReleaseDataReport
} from '../../../scripts/verify-final-release-data.mjs';

describe('final release data gate', () => {
	it('locks the exact curriculum topology and validates reconstructed lineage manifests', async () => {
		expect(EXPECTED).toMatchObject({
			offerings: 17,
			canonicalDescendantTargets: 789,
			offeringComponentPairs: 1401,
			effectiveDeckScopes: 152,
			totalReleases: 63,
			totalCards: 1097
		});

		const report = await buildFinalReleaseDataReport({ rootDir: process.cwd() });
		expect(report.local.counts).toMatchObject({
			canonicalDescendantTargets: 789,
			expectedOfferingComponentPairs: 1401,
			effectiveDeckScopes: 152
		});
		expect(report.issues).not.toEqual(
			expect.arrayContaining([
				expect.stringMatching(/pair definition is .* not 1401/),
				expect.stringMatching(/deck-scope definition is .* not 152/)
			])
		);
		for (const releaseId of [
			'aqa-computer-science-2027-standard-v1',
			'aqa-geography-8035-standard-v1',
			'ocr-english-language-j351-standard-v1-rollout-recovered-v1',
			'ocr-j352-literature-standard-v1'
		]) {
			expect(
				report.local.releases.find(
					(release: { releaseId: string }) => release.releaseId === releaseId
				)
			).toMatchObject({
				releaseId,
				lineageManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/)
			});
		}
	});
});
