import { beforeEach, describe, expect, it, vi } from 'vitest';

const { d1Rows } = vi.hoisted(() => ({ d1Rows: vi.fn() }));

vi.mock('../../../scripts/lib/d1-rest.mjs', () => ({ d1Rows }));

import { loadChainIllustrationCandidates } from '../../../scripts/lib/chain-illustration-candidates.mjs';

describe('chain illustration candidate freshness', () => {
	beforeEach(() => d1Rows.mockReset());

	it('only treats a published primary as fresh when its light asset trio is complete', async () => {
		d1Rows.mockResolvedValueOnce([]);

		await expect(loadChainIllustrationCandidates()).resolves.toEqual({
			eligible: [],
			rejected: [],
			skippedFresh: []
		});

		const sql = String(d1Rows.mock.calls[0][0]);
		for (const field of ['light_r2_key', 'light_public_path', 'light_asset_sha256']) {
			expect(sql.match(new RegExp(`${field} IS NOT NULL`, 'g'))).toHaveLength(2);
		}
	});
});
