import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	challengeIds: Array.from({ length: 500 }, (_, index) => `challenge-${index}`),
	queryPersonalRows: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/server/challengeCatalog', () => ({
	getActiveChallengeIds: vi.fn().mockResolvedValue(mocks.challengeIds)
}));

vi.mock('$lib/server/db', () => ({
	executePersonalQuery: vi.fn(),
	queryPersonalRows: mocks.queryPersonalRows
}));

vi.mock('$lib/server/homeSnapshot', () => ({
	invalidateUserHomeSnapshotForRepair: vi.fn(),
	updateUserHomeSnapshotChallengeProjection: vi.fn()
}));

import { getUserChallengeProgress } from './challengeProgress';

describe('challenge progress query parameters', () => {
	it('keeps a 500-challenge catalogue below the D1 bound-parameter limit', async () => {
		await getUserChallengeProgress('learner-500');

		const [query, params] = mocks.queryPersonalRows.mock.calls[0] as [string, unknown[]];
		expect(query).toContain('FROM json_each(?)');
		expect(params.length).toBeLessThanOrEqual(100);
		expect(params).toHaveLength(3);
		expect(JSON.parse(params[1] as string)).toEqual(mocks.challengeIds);
		expect(params[2]).toBe(500);
	});
});
