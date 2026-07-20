import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	updateUserThemePreference: vi.fn(),
	updateUserVisualEffectsPreference: vi.fn()
}));

vi.mock('$lib/server/userTheme', () => ({
	updateUserThemePreference: mocks.updateUserThemePreference,
	updateUserVisualEffectsPreference: mocks.updateUserVisualEffectsPreference
}));

import { POST } from './+server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

function post(body: unknown, authenticated = true) {
	return POST({
		locals: { user: authenticated ? user : null },
		request: new Request('http://localhost/api/theme-preference', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.updateUserThemePreference.mockImplementation(
		async ({ themePreference }) => themePreference
	);
	mocks.updateUserVisualEffectsPreference.mockImplementation(
		async ({ visualEffectsEnabled }) => visualEffectsEnabled
	);
});

describe('/api/theme-preference', () => {
	it('requires authentication', async () => {
		const response = await post({ visualEffectsEnabled: false }, false);
		expect(response.status).toBe(401);
		expect(mocks.updateUserThemePreference).not.toHaveBeenCalled();
		expect(mocks.updateUserVisualEffectsPreference).not.toHaveBeenCalled();
	});

	it('rejects malformed, empty, unknown and invalid fields', async () => {
		for (const body of [
			null,
			[],
			{},
			{ visualEffectsEnabled: 'false' },
			{ themePreference: 'sepia' },
			{ themePreference: 'dark', extra: true }
		]) {
			expect((await post(body)).status).toBe(400);
		}
		expect(mocks.updateUserThemePreference).not.toHaveBeenCalled();
		expect(mocks.updateUserVisualEffectsPreference).not.toHaveBeenCalled();
	});

	it('keeps theme-only requests backward compatible', async () => {
		const response = await post({ themePreference: 'dark' });
		expect(response.status).toBe(200);
		expect(mocks.updateUserThemePreference).toHaveBeenCalledWith({
			user,
			themePreference: 'dark'
		});
		expect(mocks.updateUserVisualEffectsPreference).not.toHaveBeenCalled();
		expect(await response.json()).toEqual({ themePreference: 'dark' });
	});

	it('saves only a provided visual effects preference', async () => {
		const response = await post({ visualEffectsEnabled: false });
		expect(response.status).toBe(200);
		expect(mocks.updateUserThemePreference).not.toHaveBeenCalled();
		expect(mocks.updateUserVisualEffectsPreference).toHaveBeenCalledWith({
			user,
			visualEffectsEnabled: false
		});
		expect(await response.json()).toEqual({ visualEffectsEnabled: false });
	});

	it('accepts both valid appearance fields together', async () => {
		const response = await post({
			themePreference: 'auto',
			visualEffectsEnabled: true
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			themePreference: 'auto',
			visualEffectsEnabled: true
		});
	});
});
