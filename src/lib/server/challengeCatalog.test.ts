import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	queryFirst: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	queryFirst: mocks.queryFirst
}));

import {
	getActiveChallengeRoutePayload,
	getChallengeCatalogIndex,
	getChallengeDetail,
	getChallengeSubject
} from './challengeCatalog';

beforeEach(() => {
	vi.clearAllMocks();
});

describe('D1 challenge catalogue route payloads', () => {
	it('loads an active page with one denormalized D1 query', async () => {
		const payload = {
			schemaVersion: 'challenge-catalog-route/v1',
			releaseId: 'fixture-release',
			socialImage: {
				url: '/challenge-assets/images/challenges/fixture/social.webp',
				alt: 'Synthetic art.',
				width: 1600,
				height: 900
			},
			ks4ScienceUrl: 'https://example.test/curriculum',
			challengeIds: ['biology-fixture-a'],
			challenges: []
		};
		mocks.queryFirst.mockResolvedValue({
			payload_json: JSON.stringify(payload),
			payload_sha256: 'a'.repeat(64),
			release_id: 'fixture-release',
			release_sha256: 'b'.repeat(64)
		});

		await expect(getChallengeCatalogIndex()).resolves.toEqual(payload);
		expect(mocks.queryFirst).toHaveBeenCalledOnce();
		const [sql, params] = mocks.queryFirst.mock.calls[0] as [string, string[]];
		expect(sql).toContain('FROM challenge_active_route_payloads');
		expect(sql).not.toContain('JOIN');
		expect(sql).toContain('WHERE route_path = ?');
		expect(params).toEqual(['/_challenge-index']);
	});

	it('normalizes safe routes before querying', async () => {
		mocks.queryFirst.mockResolvedValue(null);

		await expect(getChallengeSubject(' BIOLOGY ')).resolves.toBeNull();
		await expect(getChallengeDetail('Physics', ' Fixture-Slug ')).resolves.toBeNull();
		expect(mocks.queryFirst.mock.calls.map(([, params]) => params)).toEqual([
			['/challenges/biology'],
			['/challenges/physics/fixture-slug']
		]);
	});

	it('rejects invalid route parts without touching D1', async () => {
		await expect(getChallengeSubject('history')).resolves.toBeNull();
		await expect(getChallengeDetail('biology', '../private')).resolves.toBeNull();
		expect(mocks.queryFirst).not.toHaveBeenCalled();
	});

	it('rejects malformed or cross-release payloads', async () => {
		mocks.queryFirst.mockResolvedValue({
			payload_json: JSON.stringify({
				schemaVersion: 'challenge-catalog-route/v1',
				releaseId: 'wrong-release'
			}),
			payload_sha256: 'a'.repeat(64),
			release_id: 'active-release',
			release_sha256: 'b'.repeat(64)
		});

		await expect(getActiveChallengeRoutePayload('/challenges')).rejects.toThrow(
			/route payload is invalid/
		);
	});
});
