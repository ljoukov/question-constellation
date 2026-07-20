import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getUserHomeSnapshot: vi.fn(),
	fallbackUserHomeSnapshot: vi.fn()
}));

vi.mock('$lib/server/homeSnapshot', () => ({
	getUserHomeSnapshot: mocks.getUserHomeSnapshot,
	fallbackUserHomeSnapshot: mocks.fallbackUserHomeSnapshot
}));

import { load } from './+layout.server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};
const homeSnapshot = {
	appearance: {
		themePreference: 'dark',
		visualEffectsEnabled: false
	},
	challengeProgress: { version: 2, challenges: {} }
};
const fallbackSnapshot = {
	appearance: {
		themePreference: 'auto',
		visualEffectsEnabled: true
	},
	challengeProgress: { version: 2, challenges: {} }
};

function run(pathname: string, authenticated = true) {
	return load({
		locals: { user: authenticated ? user : null },
		url: new URL(`http://localhost${pathname}`)
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getUserHomeSnapshot.mockResolvedValue({
		status: 'fresh',
		snapshot: homeSnapshot,
		shouldRefresh: false
	});
	mocks.fallbackUserHomeSnapshot.mockReturnValue(fallbackSnapshot);
});

describe('root layout snapshot loading', () => {
	it('uses one home snapshot read for the signed-in home and reuses its appearance', async () => {
		const result = await run('/');

		expect(mocks.getUserHomeSnapshot).toHaveBeenCalledOnce();
		expect(mocks.getUserHomeSnapshot).toHaveBeenCalledWith(user);
		expect(result).toMatchObject({
			user,
			themePreference: 'dark',
			visualEffectsEnabled: false,
			homeSnapshot,
			homeSnapshotShouldRefresh: false
		});
	});

	it('passes through stale data immediately and requests a background refresh', async () => {
		mocks.getUserHomeSnapshot.mockResolvedValue({
			status: 'stale',
			snapshot: homeSnapshot,
			shouldRefresh: true
		});

		const result = await run('/');

		expect(result).toMatchObject({
			homeSnapshot,
			homeSnapshotShouldRefresh: true
		});
	});

	it('uses the same one-row snapshot outside home for appearance and route progress', async () => {
		const result = await run('/subjects/biology');

		expect(mocks.getUserHomeSnapshot).toHaveBeenCalledOnce();
		expect(mocks.getUserHomeSnapshot).toHaveBeenCalledWith(user);
		expect(result).toMatchObject({
			user,
			themePreference: 'dark',
			visualEffectsEnabled: false,
			homeSnapshot,
			homeSnapshotShouldRefresh: false
		});
	});

	it('does not read personal D1 for a signed-out visitor', async () => {
		const result = await run('/', false);

		expect(mocks.getUserHomeSnapshot).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			user: null,
			themePreference: null,
			homeSnapshot: null
		});
	});

	it('does not replace a failed home snapshot read with a second personal query', async () => {
		mocks.getUserHomeSnapshot.mockRejectedValue(new Error('D1 unavailable'));

		const result = await run('/');

		expect(mocks.getUserHomeSnapshot).toHaveBeenCalledOnce();
		expect(mocks.fallbackUserHomeSnapshot).toHaveBeenCalledWith(user);
		expect(result).toMatchObject({
			user,
			themePreference: 'auto',
			visualEffectsEnabled: true,
			homeSnapshot: fallbackSnapshot,
			homeSnapshotShouldRefresh: true
		});
	});
});
