import { describe, expect, it } from 'vitest';
import {
	CHALLENGE_PROGRESS_STORAGE_KEY,
	completedChallengeIds,
	parseChallengeProgress,
	readChallengeProgress,
	updateChallengeProgress,
	writeChallengeProgress
} from './progress';

describe('challenge progress', () => {
	it('rejects corrupt and incompatible storage', () => {
		expect(parseChallengeProgress('{')).toEqual({ version: 1, challenges: {} });
		expect(parseChallengeProgress(JSON.stringify({ version: 2, challenges: {} }))).toEqual({
			version: 1,
			challenges: {}
		});
	});

	it('records stages and completion without retaining learner answers', () => {
		const started = updateChallengeProgress({
			progress: { version: 1, challenges: {} },
			challengeId: 'bio-enzyme',
			stage: 'showdown',
			now: new Date('2026-07-17T10:00:00.000Z')
		});
		const completed = updateChallengeProgress({
			progress: started,
			challengeId: 'bio-enzyme',
			stage: 'complete',
			now: new Date('2026-07-17T10:02:00.000Z')
		});

		expect(completed.challenges['bio-enzyme']).toEqual({
			startedAt: '2026-07-17T10:00:00.000Z',
			completedAt: '2026-07-17T10:02:00.000Z',
			plays: 1,
			lastStage: 'complete'
		});
		expect(completedChallengeIds(completed)).toEqual(new Set(['bio-enzyme']));
	});

	it('increments plays only when a fresh round starts', () => {
		const initial = updateChallengeProgress({
			progress: { version: 1, challenges: {} },
			challengeId: 'physics-half-range',
			stage: 'showdown'
		});
		const replay = updateChallengeProgress({
			progress: initial,
			challengeId: 'physics-half-range',
			stage: 'showdown',
			newPlay: true
		});
		const diagnose = updateChallengeProgress({
			progress: replay,
			challengeId: 'physics-half-range',
			stage: 'diagnose'
		});

		expect(diagnose.challenges['physics-half-range'].plays).toBe(2);
	});

	it('reads and writes through a storage-shaped object', () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value)
		};
		const progress = updateChallengeProgress({
			progress: { version: 1, challenges: {} },
			challengeId: 'bio-vaccine',
			stage: 'repair'
		});

		writeChallengeProgress(progress, storage);

		expect(values.has(CHALLENGE_PROGRESS_STORAGE_KEY)).toBe(true);
		expect(readChallengeProgress(storage)).toEqual(progress);
	});
});
