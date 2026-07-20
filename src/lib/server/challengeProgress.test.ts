import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	executePersonalQuery: vi.fn(),
	queryPersonalRows: vi.fn(),
	invalidateUserHomeSnapshotForRepair: vi.fn(),
	updateUserHomeSnapshotChallengeProjection: vi.fn()
}));

vi.mock('$lib/server/db', () => ({
	executePersonalQuery: mocks.executePersonalQuery,
	queryPersonalRows: mocks.queryPersonalRows
}));

vi.mock('$lib/server/homeSnapshot', () => ({
	invalidateUserHomeSnapshotForRepair: mocks.invalidateUserHomeSnapshotForRepair,
	updateUserHomeSnapshotChallengeProjection: mocks.updateUserHomeSnapshotChallengeProjection
}));

import type { ChallengeProgress, ChallengeProgressEntry } from '$lib/challenges/progress';
import { getUserChallengeProgress, mergeUserChallengeProgress } from './challengeProgress';

const challengeId = 'biology-data-conclusions';

const entry = (overrides: Partial<ChallengeProgressEntry> = {}): ChallengeProgressEntry => ({
	startedAt: '2026-07-18T10:00:00.000Z',
	updatedAt: '2026-07-18T10:04:00.000Z',
	completedAt: '2026-07-18T10:04:00.000Z',
	plays: 1,
	lastStage: 'complete',
	bestScore: 400,
	bestTimeMs: 30_000,
	lastScore: 400,
	lastTimeMs: 30_000,
	...overrides
});

const progress = (
	challenges: Record<string, ChallengeProgressEntry> = {
		[challengeId]: entry()
	}
): ChallengeProgress => ({
	version: 2,
	challenges
});

function row(overrides: Record<string, unknown> = {}) {
	return {
		challenge_id: challengeId,
		started_at: '2026-07-18T10:00:00.000Z',
		updated_at: '2026-07-18T10:04:00.000Z',
		completed_at: '2026-07-18T10:04:00.000Z',
		plays: 1,
		last_stage: 'complete',
		best_score: 400,
		best_time_ms: 30_000,
		last_score: 400,
		last_time_ms: 30_000,
		...overrides
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.queryPersonalRows.mockResolvedValue([]);
	mocks.executePersonalQuery.mockResolvedValue(undefined);
	mocks.invalidateUserHomeSnapshotForRepair.mockResolvedValue(undefined);
	mocks.updateUserHomeSnapshotChallengeProjection.mockResolvedValue(undefined);
});

describe('challenge progress persistence', () => {
	it('reads only valid current-catalogue challenge rows', async () => {
		mocks.queryPersonalRows.mockResolvedValue([
			row(),
			row({ challenge_id: 'retired-or-spoofed-challenge' }),
			row({ challenge_id: 'chemistry-collision-rate', plays: 0 })
		]);

		await expect(getUserChallengeProgress('learner-1')).resolves.toEqual(progress());
		const [query, params] = mocks.queryPersonalRows.mock.calls[0] as [string, unknown[]];
		expect(query).toContain('AND challenge_id IN (');
		expect(params[0]).toBe('learner-1');
		expect(params).toContain(challengeId);
		expect(params.at(-1)).toEqual(expect.any(Number));
	});

	it('filters unknown challenge IDs before any write', async () => {
		const result = await mergeUserChallengeProgress(
			'learner-1',
			progress({ 'unknown-challenge': entry() })
		);

		expect(result).toEqual({ version: 2, challenges: {} });
		expect(mocks.executePersonalQuery).not.toHaveBeenCalled();
	});

	it('keeps the highest score and binds its time when progress overlaps', async () => {
		mocks.queryPersonalRows
			.mockResolvedValueOnce([row({ best_score: 400, best_time_ms: 20_000 })])
			.mockResolvedValueOnce([
				row({
					updated_at: '2026-07-19T10:04:00.000Z',
					completed_at: '2026-07-18T10:04:00.000Z',
					plays: 2,
					best_score: 425,
					best_time_ms: 35_000,
					last_score: 425,
					last_time_ms: 35_000
				})
			]);
		const incoming = progress({
			[challengeId]: entry({
				updatedAt: '2026-07-19T10:04:00.000Z',
				completedAt: '2026-07-19T10:04:00.000Z',
				plays: 2,
				bestScore: 425,
				bestTimeMs: 35_000,
				lastScore: 425,
				lastTimeMs: 35_000
			})
		});

		const result = await mergeUserChallengeProgress('learner-1', incoming);

		expect(result.challenges[challengeId]).toMatchObject({
			plays: 2,
			bestScore: 425,
			bestTimeMs: 35_000,
			lastScore: 425,
			lastTimeMs: 35_000
		});
		expect(mocks.updateUserHomeSnapshotChallengeProjection).toHaveBeenCalledWith(
			'learner-1',
			result
		);
		expect(mocks.executePersonalQuery).toHaveBeenCalledTimes(1);
		expect(mocks.executePersonalQuery.mock.calls[0][0]).toContain(
			'started_at = MIN(user_challenge_progress.started_at, excluded.started_at)'
		);
		expect(mocks.executePersonalQuery.mock.calls[0][0]).toContain(
			'json_array(excluded.last_stage, excluded.last_score, excluded.last_time_ms)'
		);
		expect(mocks.executePersonalQuery.mock.calls[0][1]).toEqual([
			'learner-1',
			challengeId,
			result.challenges[challengeId].startedAt,
			result.challenges[challengeId].updatedAt,
			result.challenges[challengeId].completedAt,
			result.challenges[challengeId].plays,
			result.challenges[challengeId].lastStage,
			425,
			35_000,
			425,
			35_000
		]);
	});

	it('uses the shortest time to break an equal best-score tie', async () => {
		mocks.queryPersonalRows
			.mockResolvedValueOnce([row({ best_score: 400, best_time_ms: 35_000 })])
			.mockResolvedValueOnce([
				row({
					updated_at: '2026-07-19T10:04:00.000Z',
					completed_at: '2026-07-18T10:04:00.000Z',
					plays: 2,
					best_score: 400,
					best_time_ms: 25_000,
					last_score: 400,
					last_time_ms: 25_000
				})
			]);
		const incoming = progress({
			[challengeId]: entry({
				updatedAt: '2026-07-19T10:04:00.000Z',
				completedAt: '2026-07-19T10:04:00.000Z',
				plays: 2,
				bestScore: 400,
				bestTimeMs: 25_000,
				lastScore: 400,
				lastTimeMs: 25_000
			})
		});

		const result = await mergeUserChallengeProgress('learner-1', incoming);
		expect(result.challenges[challengeId]).toMatchObject({
			bestScore: 400,
			bestTimeMs: 25_000
		});
		expect(mocks.queryPersonalRows).toHaveBeenCalledTimes(2);
	});

	it('writes the same canonical values when an identical merge is retried', async () => {
		const stored = row();
		mocks.queryPersonalRows.mockResolvedValue([stored]);
		const incoming = progress();

		const first = await mergeUserChallengeProgress('learner-1', incoming);
		const second = await mergeUserChallengeProgress('learner-1', incoming);

		expect(first).toEqual(second);
		expect(mocks.executePersonalQuery).toHaveBeenCalledTimes(2);
		expect(mocks.executePersonalQuery.mock.calls[0][1]).toEqual(
			mocks.executePersonalQuery.mock.calls[1][1]
		);
	});

	it('invalidates the cached home row when a multi-entry merge partially commits', async () => {
		mocks.executePersonalQuery
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error('second write failed'));
		const incoming = progress({
			[challengeId]: entry(),
			'biology-cell-differences': entry({
				updatedAt: '2026-07-18T10:05:00.000Z'
			})
		});

		await expect(mergeUserChallengeProgress('learner-partial', incoming)).rejects.toThrow(
			'second write failed'
		);

		expect(mocks.executePersonalQuery).toHaveBeenCalledTimes(2);
		expect(mocks.invalidateUserHomeSnapshotForRepair).toHaveBeenCalledOnce();
		expect(mocks.invalidateUserHomeSnapshotForRepair).toHaveBeenCalledWith('learner-partial');
		expect(mocks.updateUserHomeSnapshotChallengeProjection).not.toHaveBeenCalled();
	});
});
