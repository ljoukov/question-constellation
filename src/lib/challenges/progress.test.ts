import { describe, expect, it } from 'vitest';
import {
	CHALLENGE_PROGRESS_GUEST_STORAGE_KEY,
	LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY,
	calculateChallengeScore,
	challengeProgressStorageKey,
	challengeProgressTotals,
	clearGuestChallengeProgress,
	completedChallengeIds,
	emptyChallengeProgress,
	mergeChallengeProgress,
	mergeStoredChallengeProgress,
	parseChallengeProgress,
	readChallengeProgress,
	type ChallengeProgress,
	type ChallengeProgressEntry,
	updateChallengeProgress,
	updateStoredChallengeProgress,
	writeChallengeProgress
} from './progress';

function entry(overrides: Partial<ChallengeProgressEntry> = {}): ChallengeProgressEntry {
	return {
		startedAt: '2026-07-17T10:00:00.000Z',
		updatedAt: '2026-07-17T10:02:00.000Z',
		completedAt: '2026-07-17T10:02:00.000Z',
		plays: 1,
		lastStage: 'complete',
		bestScore: 450,
		bestTimeMs: 120_000,
		lastScore: 450,
		lastTimeMs: 120_000,
		...overrides
	};
}

function progress(challengeId: string, value: ChallengeProgressEntry): ChallengeProgress {
	return { version: 2, challenges: { [challengeId]: value } };
}

function memoryStorage(seed: Record<string, string> = {}) {
	const values = new Map(Object.entries(seed));
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key)
	};
}

describe('challenge progress', () => {
	it('rejects corrupt and incompatible storage as empty v2 progress', () => {
		expect(parseChallengeProgress('{')).toEqual(emptyChallengeProgress());
		expect(parseChallengeProgress(JSON.stringify({ version: 3, challenges: {} }))).toEqual(
			emptyChallengeProgress()
		);
	});

	it('awards only the completion base score when migrating a completed v1 entry', () => {
		const migrated = parseChallengeProgress(
			JSON.stringify({
				version: 1,
				challenges: {
					'bio-enzyme': {
						startedAt: '2026-07-17T10:00:00.000Z',
						completedAt: '2026-07-17T10:02:00.000Z',
						plays: 2,
						lastStage: 'complete'
					}
				}
			})
		);

		expect(migrated).toEqual({
			version: 2,
			challenges: {
				'bio-enzyme': {
					startedAt: '2026-07-17T10:00:00.000Z',
					updatedAt: '2026-07-17T10:02:00.000Z',
					completedAt: '2026-07-17T10:02:00.000Z',
					plays: 2,
					lastStage: 'complete',
					bestScore: 400,
					bestTimeMs: null,
					lastScore: 400,
					lastTimeMs: null
				}
			}
		});
	});

	it('backfills the completion base score for an already-migrated v2 completion', () => {
		const migrated = parseChallengeProgress(
			JSON.stringify({
				version: 2,
				challenges: {
					'bio-enzyme': {
						startedAt: '2026-07-17T10:00:00.000Z',
						updatedAt: '2026-07-17T10:02:00.000Z',
						completedAt: '2026-07-17T10:02:00.000Z',
						plays: 2,
						lastStage: 'complete',
						bestScore: null,
						bestTimeMs: null,
						lastScore: null,
						lastTimeMs: null
					}
				}
			})
		);

		expect(migrated.challenges['bio-enzyme']).toMatchObject({
			bestScore: 400,
			bestTimeMs: null,
			lastScore: 400,
			lastTimeMs: null
		});
	});

	it('preserves an explicit canonical null latest result when a personal best exists', () => {
		const parsed = parseChallengeProgress(
			JSON.stringify({
				version: 2,
				challenges: {
					'biology-data-conclusions': entry({
						bestScore: 500,
						bestTimeMs: 45_000,
						lastScore: null,
						lastTimeMs: null
					})
				}
			})
		);

		expect(parsed.challenges['biology-data-conclusions']).toMatchObject({
			bestScore: 500,
			bestTimeMs: 45_000,
			lastScore: null,
			lastTimeMs: null
		});
	});

	it('drops v2 entries that violate canonical score, result or timestamp invariants', () => {
		const invalidEntries: ChallengeProgressEntry[] = [
			entry({ bestScore: 499 }),
			entry({ lastScore: 500, bestScore: 475 }),
			entry({ lastScore: null, lastTimeMs: 10 }),
			entry({ plays: 1_000_001 }),
			entry({ startedAt: '2026-07-17T10:03:00.000Z' }),
			entry({ completedAt: '2026-07-17T10:03:00.000Z' }),
			entry({ completedAt: null, lastStage: 'complete' })
		];

		for (const [index, invalidEntry] of invalidEntries.entries()) {
			const parsed = parseChallengeProgress(
				JSON.stringify({
					version: 2,
					challenges: { [`invalid-${index}`]: invalidEntry }
				})
			);
			expect(parsed.challenges).toEqual({});
		}
	});

	it('migrates the legacy guest key while keeping account caches separate', () => {
		const storage = memoryStorage({
			[LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY]: JSON.stringify({
				version: 1,
				challenges: {
					legacy: {
						startedAt: '2026-07-17T10:00:00.000Z',
						completedAt: null,
						plays: 1,
						lastStage: 'repair'
					}
				}
			})
		});

		expect(readChallengeProgress(storage).challenges.legacy).toBeDefined();
		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(true);
		expect(readChallengeProgress(storage, 'user-a')).toEqual(emptyChallengeProgress());

		const accountProgress = progress('account-only', entry());
		writeChallengeProgress(accountProgress, storage, 'user-a');
		expect(readChallengeProgress(storage, 'user-a')).toEqual(accountProgress);
		expect(readChallengeProgress(storage, 'user-b')).toEqual(emptyChallengeProgress());
		expect(challengeProgressStorageKey('user-a')).not.toBe(challengeProgressStorageKey('user-b'));
	});

	it('clears only guest v2 and legacy v1 state after import', () => {
		const storage = memoryStorage({
			[CHALLENGE_PROGRESS_GUEST_STORAGE_KEY]: JSON.stringify(progress('guest', entry())),
			[LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY]: '{}',
			[challengeProgressStorageKey('user-a')]: JSON.stringify(progress('account', entry()))
		});

		clearGuestChallengeProgress(storage);

		expect(storage.values.has(CHALLENGE_PROGRESS_GUEST_STORAGE_KEY)).toBe(false);
		expect(storage.values.has(LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY)).toBe(false);
		expect(storage.values.has(challengeProgressStorageKey('user-a'))).toBe(true);
	});

	it('keeps the highest score and uses the shortest time only when scores tie', () => {
		const highScoreSlow = progress(
			'physics-half-range',
			entry({ bestScore: 475, bestTimeMs: 180_000 })
		);
		const lowScoreFast = progress(
			'physics-half-range',
			entry({ bestScore: 450, bestTimeMs: 60_000 })
		);
		expect(
			mergeChallengeProgress(highScoreSlow, lowScoreFast).challenges['physics-half-range']
		).toMatchObject({ bestScore: 475, bestTimeMs: 180_000 });

		const equalScoreFast = progress(
			'physics-half-range',
			entry({ bestScore: 475, bestTimeMs: 90_000 })
		);
		expect(
			mergeChallengeProgress(highScoreSlow, equalScoreFast).challenges['physics-half-range']
		).toMatchObject({ bestScore: 475, bestTimeMs: 90_000 });
	});

	it('takes last stage and last result from the newer update while preserving completion', () => {
		const completed = progress(
			'chemistry-alloys',
			entry({
				updatedAt: '2026-07-17T10:02:00.000Z',
				completedAt: '2026-07-17T10:02:00.000Z',
				lastStage: 'complete',
				lastScore: 450,
				lastTimeMs: 120_000,
				plays: 1
			})
		);
		const replay = progress(
			'chemistry-alloys',
			entry({
				startedAt: '2026-07-18T10:00:00.000Z',
				updatedAt: '2026-07-18T10:01:00.000Z',
				completedAt: null,
				lastStage: 'diagnose',
				lastScore: null,
				lastTimeMs: null,
				plays: 2
			})
		);

		const merged = mergeChallengeProgress(completed, replay).challenges['chemistry-alloys'];
		expect(merged).toMatchObject({
			startedAt: '2026-07-17T10:00:00.000Z',
			updatedAt: '2026-07-18T10:01:00.000Z',
			completedAt: '2026-07-17T10:02:00.000Z',
			plays: 2,
			lastStage: 'diagnose',
			lastScore: null,
			lastTimeMs: null
		});
	});

	it('is commutative and safe to retry without inflating plays', () => {
		const local = progress('bio-vaccine', entry({ plays: 3, bestScore: 475, bestTimeMs: 80_000 }));
		const remote = progress(
			'bio-vaccine',
			entry({
				plays: 2,
				updatedAt: '2026-07-18T10:02:00.000Z',
				bestScore: 475,
				bestTimeMs: 75_000
			})
		);
		const merged = mergeChallengeProgress(local, remote);

		expect(mergeChallengeProgress(local, remote)).toEqual(mergeChallengeProgress(remote, local));
		expect(mergeChallengeProgress(merged, local)).toEqual(merged);
		expect(merged.challenges['bio-vaccine'].plays).toBe(3);
	});

	it('uses a deterministic server-compatible latest result for equal timestamps', () => {
		const scored = progress(
			'biology-data-conclusions',
			entry({ lastStage: 'complete', lastScore: 500, lastTimeMs: 45_000 })
		);
		const canonical = progress(
			'biology-data-conclusions',
			entry({ lastStage: 'complete', lastScore: null, lastTimeMs: null })
		);

		const leftFirst = mergeChallengeProgress(scored, canonical);
		const rightFirst = mergeChallengeProgress(canonical, scored);

		expect(leftFirst).toEqual(rightFirst);
		expect(leftFirst.challenges['biology-data-conclusions']).toMatchObject({
			lastStage: 'complete',
			lastScore: null,
			lastTimeMs: null
		});
	});

	it('counts a new play only when the caller explicitly starts one', () => {
		const current = progress('biology-data-conclusions', entry({ plays: 58 }));
		const remounted = updateChallengeProgress({
			progress: current,
			challengeId: 'biology-data-conclusions',
			stage: 'showdown',
			now: new Date('2026-07-18T10:00:00.000Z')
		});
		const replayed = updateChallengeProgress({
			progress: remounted,
			challengeId: 'biology-data-conclusions',
			stage: 'showdown',
			newPlay: true,
			now: new Date('2026-07-18T10:01:00.000Z')
		});

		expect(remounted.challenges['biology-data-conclusions']?.plays).toBe(58);
		expect(replayed.challenges['biology-data-conclusions']?.plays).toBe(59);
	});

	it('merges the latest cross-tab storage before a stale tab writes', () => {
		const storage = memoryStorage();
		const staleTabSnapshot = updateStoredChallengeProgress({
			progress: emptyChallengeProgress(),
			storage,
			challengeId: 'biology-cell-differences',
			stage: 'showdown',
			now: new Date('2026-07-17T10:00:00.000Z')
		});

		const otherTabCompletion = updateStoredChallengeProgress({
			progress: readChallengeProgress(storage),
			storage,
			challengeId: 'physics-zero-resultant',
			stage: 'complete',
			score: 500,
			durationMs: 45_000,
			now: new Date('2026-07-17T10:01:00.000Z')
		});
		expect(otherTabCompletion.challenges['physics-zero-resultant']?.completedAt).not.toBeNull();

		const staleTabNextWrite = updateStoredChallengeProgress({
			progress: staleTabSnapshot,
			incomingProgress: staleTabSnapshot,
			storage,
			challengeId: 'biology-cell-differences',
			stage: 'diagnose',
			now: new Date('2026-07-17T10:02:00.000Z')
		});

		expect(Object.keys(staleTabNextWrite.challenges).sort()).toEqual([
			'biology-cell-differences',
			'physics-zero-resultant'
		]);
		expect(staleTabNextWrite.challenges['biology-cell-differences']?.lastStage).toBe('diagnose');
		expect(staleTabNextWrite.challenges['physics-zero-resultant']).toEqual(
			otherTabCompletion.challenges['physics-zero-resultant']
		);
		expect(readChallengeProgress(storage)).toEqual(staleTabNextWrite);
	});

	it('reconciles storage-event progress without changing the active challenge entry', () => {
		const storage = memoryStorage();
		const activeRun = progress(
			'biology-cell-differences',
			entry({
				completedAt: null,
				lastStage: 'repair',
				bestScore: null,
				bestTimeMs: null,
				lastScore: null,
				lastTimeMs: null
			})
		);
		const otherTab = progress('chemistry-atom-evidence', entry({ bestScore: 500 }));
		writeChallengeProgress(otherTab, storage);

		const reconciled = mergeStoredChallengeProgress({
			progress: activeRun,
			incomingProgress: otherTab,
			storage
		});

		expect(reconciled.challenges['biology-cell-differences']).toEqual(
			activeRun.challenges['biology-cell-differences']
		);
		expect(reconciled.challenges['chemistry-atom-evidence']).toEqual(
			otherTab.challenges['chemistry-atom-evidence']
		);
	});

	it('records completion results and improves best by score, then time', () => {
		const started = updateChallengeProgress({
			progress: emptyChallengeProgress(),
			challengeId: 'bio-enzyme',
			stage: 'showdown',
			now: new Date('2026-07-17T10:00:00.000Z')
		});
		const first = updateChallengeProgress({
			progress: started,
			challengeId: 'bio-enzyme',
			stage: 'complete',
			score: 450,
			durationMs: 120_000,
			now: new Date('2026-07-17T10:02:00.000Z')
		});
		const replay = updateChallengeProgress({
			progress: first,
			challengeId: 'bio-enzyme',
			stage: 'showdown',
			newPlay: true,
			now: new Date('2026-07-18T10:00:00.000Z')
		});
		const slowerButHigher = updateChallengeProgress({
			progress: replay,
			challengeId: 'bio-enzyme',
			stage: 'complete',
			score: 475,
			durationMs: 180_000,
			now: new Date('2026-07-18T10:03:00.000Z')
		});
		const fasterTie = updateChallengeProgress({
			progress: slowerButHigher,
			challengeId: 'bio-enzyme',
			stage: 'complete',
			score: 475,
			durationMs: 90_000,
			now: new Date('2026-07-18T10:04:00.000Z')
		});

		expect(fasterTie.challenges['bio-enzyme']).toMatchObject({
			startedAt: '2026-07-18T10:00:00.000Z',
			updatedAt: '2026-07-18T10:04:00.000Z',
			completedAt: '2026-07-17T10:02:00.000Z',
			plays: 2,
			lastStage: 'complete',
			bestScore: 475,
			bestTimeMs: 90_000,
			lastScore: 475,
			lastTimeMs: 90_000
		});
	});

	it('keeps the score at 400 or above and never subtracts for retries', () => {
		expect(
			calculateChallengeScore({
				showdownFirstTryCorrect: false,
				diagnosisFirstTryCorrect: false,
				repairFirstTryCorrect: false,
				transferFirstTryCorrect: false
			})
		).toBe(400);
		expect(
			calculateChallengeScore({
				showdownFirstTryCorrect: true,
				diagnosisFirstTryCorrect: true,
				repairFirstTryCorrect: true,
				transferFirstTryCorrect: true
			})
		).toBe(500);
	});

	it('summarises completions and positive best-score totals', () => {
		const state: ChallengeProgress = {
			version: 2,
			challenges: {
				complete: entry({ bestScore: 500 }),
				incomplete: entry({
					completedAt: null,
					lastStage: 'repair',
					bestScore: null,
					bestTimeMs: null
				})
			}
		};
		expect(completedChallengeIds(state)).toEqual(new Set(['complete']));
		expect(challengeProgressTotals(state)).toEqual({
			completedCount: 1,
			totalBestScore: 500
		});
	});

	it('degrades safely when browser storage is unavailable', () => {
		const unavailableStorage = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			}
		};

		expect(readChallengeProgress(unavailableStorage)).toEqual(emptyChallengeProgress());
		expect(() =>
			writeChallengeProgress(emptyChallengeProgress(), unavailableStorage)
		).not.toThrow();
		expect(() => clearGuestChallengeProgress(unavailableStorage)).not.toThrow();
	});
});
