import { describe, expect, it } from 'vitest';
import { conciseSummary } from './summaryFormat';

describe('conciseSummary', () => {
	it('keeps one bounded bullet under each expected heading', () => {
		const longSignal = Array.from({ length: 60 }, (_, index) => `signal-${index}`).join(' ');
		const result = conciseSummary(`## Signal
- Scope: production people, n=12.
- ${longSignal}

## Inspect next
Open session abc123 and check its route.

## Limitation
The sample is small and no intent can be inferred.`);

		expect(result.match(/^## /gm)).toHaveLength(3);
		expect(result.match(/^- /gm)).toHaveLength(3);
		expect(result.split(/\s+/).length).toBeLessThanOrEqual(150);
		expect(result).toContain('…');
		expect(result).toContain('## Inspect next\n- Open session abc123');
		expect(result).toContain('## Limitation\n- The sample is small');
	});

	it('falls back to a single short signal when headings are missing', () => {
		expect(conciseSummary('A useful observation without the requested formatting.')).toBe(
			'## Signal\n- A useful observation without the requested formatting.'
		);
	});
});
