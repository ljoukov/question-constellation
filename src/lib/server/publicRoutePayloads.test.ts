import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	queryFirst: vi.fn()
}));

vi.mock('./db', () => ({
	queryFirst: mocks.queryFirst,
	executeQuery: vi.fn()
}));

import { getPublicRoutePayload } from './publicRoutePayloads';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('public route payload point reads', () => {
	it('reads exactly one row by primary identity for the subject catalog', async () => {
		mocks.queryFirst.mockResolvedValue({
			payload_json: JSON.stringify({ version: 2, offerings: [] })
		});

		await expect(getPublicRoutePayload('subject-learning:catalog')).resolves.toEqual({
			version: 2,
			offerings: []
		});
		expect(mocks.queryFirst).toHaveBeenCalledOnce();
		const [sql, params] = mocks.queryFirst.mock.calls[0];
		expect(sql).toContain('FROM public_route_payloads');
		expect(sql).toContain('WHERE id = ?');
		expect(sql).toContain('LIMIT 1');
		expect(params).toEqual(['subject-learning:catalog']);
	});
});
