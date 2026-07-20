import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	refreshUserHomeSnapshot: vi.fn()
}));

vi.mock('$lib/server/homeSnapshot', () => ({
	refreshUserHomeSnapshot: mocks.refreshUserHomeSnapshot
}));

import { POST } from './+server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

function post(authenticated = true) {
	return POST({
		locals: { user: authenticated ? user : null }
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.refreshUserHomeSnapshot.mockResolvedValue({ status: 'refreshed' });
});

describe('/api/home-snapshot/refresh', () => {
	it('requires authentication without touching snapshot storage', async () => {
		const response = await post(false);

		expect(response.status).toBe(401);
		expect(mocks.refreshUserHomeSnapshot).not.toHaveBeenCalled();
	});

	it('refreshes only the authenticated learner snapshot', async () => {
		mocks.refreshUserHomeSnapshot.mockResolvedValue({
			status: 'refreshed',
			snapshot: { shouldNeverReachClient: true },
			revision: 42
		});

		const response = await post();

		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(mocks.refreshUserHomeSnapshot).toHaveBeenCalledOnce();
		expect(mocks.refreshUserHomeSnapshot).toHaveBeenCalledWith(user);
		expect(await response.json()).toEqual({ status: 'refreshed' });
	});

	it('returns an already-current snapshot as a successful no-op', async () => {
		mocks.refreshUserHomeSnapshot.mockResolvedValue({ status: 'current' });

		const response = await post();

		expect(response.status).toBe(200);
		expect(mocks.refreshUserHomeSnapshot).toHaveBeenCalledOnce();
		expect(await response.json()).toEqual({ status: 'current' });
	});

	it('reports an in-flight refresh without treating it as a failure', async () => {
		mocks.refreshUserHomeSnapshot.mockResolvedValue({ status: 'busy' });

		const response = await post();

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual({ status: 'busy' });
	});

	it('returns a retryable failure when snapshot generation fails', async () => {
		mocks.refreshUserHomeSnapshot.mockResolvedValue({ status: 'failed' });

		const response = await post();

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ status: 'failed' });
	});
});
