import { describe, expect, it } from 'vitest';
import { safeVisualEffectsPreference } from './visualEffectsPreference';

describe('visual effects preference', () => {
	it('is default-on and only accepts explicit false values as off', () => {
		expect(safeVisualEffectsPreference(undefined)).toBe(true);
		expect(safeVisualEffectsPreference(null)).toBe(true);
		expect(safeVisualEffectsPreference(true)).toBe(true);
		expect(safeVisualEffectsPreference(false)).toBe(false);
		expect(safeVisualEffectsPreference(0)).toBe(false);
		expect(safeVisualEffectsPreference('false')).toBe(true);
	});
});
