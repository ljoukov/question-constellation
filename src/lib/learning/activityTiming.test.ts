import { describe, expect, it } from 'vitest';
import { createActivityId, responseDurationMs } from './activityTiming';

describe('activity timing helpers', () => {
	it('creates opaque ids with a safe prefix', () => {
		const first = createActivityId('question response');
		const second = createActivityId('question response');
		expect(first).toMatch(/^questionresponse_/);
		expect(second).not.toBe(first);
	});

	it('keeps plausible elapsed time and rejects invalid or extreme values', () => {
		expect(responseDurationMs(1_000, 3_450)).toBe(2_450);
		expect(responseDurationMs(0, 3_450)).toBeNull();
		expect(responseDurationMs(3_450, 1_000)).toBeNull();
		expect(responseDurationMs(1_000, 1_000 + 7 * 60 * 60 * 1000)).toBeNull();
	});
});
