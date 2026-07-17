import { describe, expect, it } from 'vitest';
import { challengeCatalog } from './catalog';
import { allChallengeVisualIds, challengeVisual } from './visuals';

describe('challenge visual definitions', () => {
	it('gives every challenge one decisive visual gap', () => {
		expect(allChallengeVisualIds().sort()).toEqual(challengeCatalog.map((item) => item.id).sort());

		for (const challenge of challengeCatalog) {
			const visual = challengeVisual(challenge);
			expect(visual, challenge.id).toBeDefined();
			expect(visual?.segments.length, challenge.id).toBeGreaterThanOrEqual(3);
			expect(visual?.decisiveIndex, challenge.id).toBeGreaterThanOrEqual(0);
			expect(visual?.decisiveIndex, challenge.id).toBeLessThan(visual?.segments.length ?? 0);
			expect(visual?.decisiveLabel.trim(), challenge.id).not.toBe('');
		}
	});

	it('ships complete theme pairs for every earned illustration', () => {
		for (const challenge of challengeCatalog) {
			const visual = challengeVisual(challenge);
			const illustration = visual?.earnedIllustration;
			if (!illustration) continue;

			expect(illustration.src).toMatch(/-dark-v1\.webp$/);
			expect(illustration.lightSrc).toMatch(/-light-v1\.webp$/);
			expect(illustration.width / illustration.height).toBeCloseTo(16 / 9, 2);

			if (visual.mobilePanels) {
				expect(visual.mobilePanels.map((panel) => panel.label)).toEqual(visual.segments);
				expect(new Set(visual.mobilePanels.map((panel) => panel.position)).size).toBe(
					visual.mobilePanels.length
				);
			}
		}
	});
});
