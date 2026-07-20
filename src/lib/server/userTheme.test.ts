import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	executePersonalQuery: vi.fn(),
	queryPersonalFirst: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	executePersonalQuery: mocks.executePersonalQuery,
	queryPersonalFirst: mocks.queryPersonalFirst
}));

import {
	getUserAppearancePreferences,
	safeThemePreference,
	safeVisualEffectsEnabled,
	updateUserThemePreference,
	updateUserVisualEffectsPreference
} from './userTheme';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.executePersonalQuery.mockResolvedValue(undefined);
	mocks.queryPersonalFirst.mockResolvedValue(null);
});

describe('user appearance preferences', () => {
	it('uses safe defaults for malformed stored values', () => {
		expect(safeThemePreference('dark')).toBe('dark');
		expect(safeThemePreference('sepia')).toBe('auto');
		expect(safeVisualEffectsEnabled(0)).toBe(false);
		expect(safeVisualEffectsEnabled(false)).toBe(false);
		expect(safeVisualEffectsEnabled(null)).toBe(true);
		expect(safeVisualEffectsEnabled('0')).toBe(true);
	});

	it('reads both preferences from one profile row', async () => {
		mocks.queryPersonalFirst.mockResolvedValue({
			theme_preference: 'light',
			visual_effects_enabled: 0
		});

		await expect(getUserAppearancePreferences(user)).resolves.toEqual({
			themePreference: 'light',
			visualEffectsEnabled: false
		});
		expect(mocks.queryPersonalFirst).toHaveBeenCalledWith(
			expect.stringContaining('visual_effects_enabled'),
			[user.uid]
		);
		expect(mocks.executePersonalQuery).not.toHaveBeenCalled();
	});

	it('creates a missing profile and defaults visual effects on', async () => {
		await expect(getUserAppearancePreferences(user)).resolves.toEqual({
			themePreference: 'auto',
			visualEffectsEnabled: true
		});
		expect(mocks.executePersonalQuery).toHaveBeenCalledTimes(1);
		expect(mocks.executePersonalQuery.mock.calls[0][0]).toContain('INSERT INTO user_profiles');
		expect(mocks.executePersonalQuery.mock.calls[0][0]).not.toContain(
			'local_profile_import_pending'
		);
	});

	it('persists theme and visual effects in independent columns', async () => {
		await expect(updateUserThemePreference({ user, themePreference: 'dark' })).resolves.toBe(
			'dark'
		);
		await expect(
			updateUserVisualEffectsPreference({ user, visualEffectsEnabled: false })
		).resolves.toBe(false);

		const updates = mocks.executePersonalQuery.mock.calls.filter(([sql]) =>
			String(sql).startsWith('UPDATE user_profiles')
		);
		expect(updates).toHaveLength(2);
		expect(updates[0][0]).toContain('theme_preference = ?');
		expect(updates[0][0]).not.toContain('visual_effects_enabled = ?');
		expect(updates[0][0]).not.toContain('local_profile_import_pending');
		expect(updates[0][1]).toEqual(['dark', user.uid]);
		expect(updates[1][0]).toContain('visual_effects_enabled = ?');
		expect(updates[1][0]).not.toContain('theme_preference = ?');
		expect(updates[1][0]).not.toContain('local_profile_import_pending');
		expect(updates[1][1]).toEqual([0, user.uid]);
	});
});
