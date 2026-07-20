import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChallengeProgress, ChallengeProgressEntry } from '$lib/challenges/progress';
import { clearQuestionBindings, setPersonalDb } from './bindings';
import { getUserChallengeProgress, mergeUserChallengeProgress } from './challengeProgress';

const migration = readFileSync(
	new URL('../../../migrations/personal/0009_challenge_progress.sql', import.meta.url),
	'utf8'
);
const challengeId = 'biology-data-conclusions';

function progress(entry: ChallengeProgressEntry): ChallengeProgress {
	return { version: 2, challenges: { [challengeId]: entry } };
}

function sqliteBinding(db: DatabaseSync, staleReaders: number) {
	let initialReads = 0;
	let releaseInitialReads = () => {};
	const initialReadBarrier = new Promise<void>((resolve) => {
		releaseInitialReads = resolve;
	});

	return {
		prepare(sql: string) {
			let params: unknown[] = [];
			const statement = {
				bind(...values: unknown[]) {
					params = values;
					return statement;
				},
				async run() {
					db.prepare(sql).run(...(params as never[]));
					return { success: true, meta: {} };
				},
				async all<T>() {
					const results = db.prepare(sql).all(...(params as never[])) as T[];
					if (sql.includes('FROM user_challenge_progress') && initialReads < staleReaders) {
						initialReads += 1;
						if (initialReads === staleReaders) releaseInitialReads();
						await initialReadBarrier;
					}
					return { success: true, results, meta: {} };
				}
			};
			return statement;
		}
	} as never;
}

function bindingWithDelayedSecondProgressRead(db: DatabaseSync) {
	let progressReads = 0;
	let markOlderReadCaptured = () => {};
	let releaseOlderRead = () => {};
	const olderReadCaptured = new Promise<void>((resolve) => {
		markOlderReadCaptured = resolve;
	});
	const olderReadRelease = new Promise<void>((resolve) => {
		releaseOlderRead = resolve;
	});

	return {
		binding: {
			prepare(sql: string) {
				let params: unknown[] = [];
				const statement = {
					bind(...values: unknown[]) {
						params = values;
						return statement;
					},
					async run() {
						db.prepare(sql).run(...(params as never[]));
						return { success: true, meta: {} };
					},
					async all<T>() {
						const results = db.prepare(sql).all(...(params as never[])) as T[];
						if (sql.includes('FROM user_challenge_progress')) {
							progressReads += 1;
							// The first merge's second read has captured its post-write,
							// canonical result. Hold that stale result while a newer merge
							// completes and publishes its home projection.
							if (progressReads === 2) {
								markOlderReadCaptured();
								await olderReadRelease;
							}
						}
						return { success: true, results, meta: {} };
					}
				};
				return statement;
			}
		} as never,
		olderReadCaptured,
		releaseOlderRead
	};
}

afterEach(() => {
	clearQuestionBindings();
});

describe('challenge progress concurrent merges', () => {
	it('preserves every canonical winner when stale devices upsert concurrently', async () => {
		const db = new DatabaseSync(':memory:');
		db.exec(migration);
		setPersonalDb(sqliteBinding(db, 3));

		const strongButSlower = progress({
			startedAt: '2026-07-18T10:00:00.000Z',
			updatedAt: '2026-07-18T10:04:00.000Z',
			completedAt: '2026-07-18T10:04:00.000Z',
			plays: 1,
			lastStage: 'complete',
			bestScore: 500,
			bestTimeMs: 40_000,
			lastScore: 500,
			lastTimeMs: 40_000
		});
		const strongAndFaster = progress({
			startedAt: '2026-07-18T09:00:00.000Z',
			updatedAt: '2026-07-18T10:03:00.000Z',
			completedAt: '2026-07-18T10:03:00.000Z',
			plays: 3,
			lastStage: 'repair',
			bestScore: 500,
			bestTimeMs: 25_000,
			lastScore: 425,
			lastTimeMs: 15_000
		});
		const latestButLowerScore = progress({
			startedAt: '2026-07-18T10:01:00.000Z',
			updatedAt: '2026-07-18T10:05:00.000Z',
			completedAt: '2026-07-18T10:05:00.000Z',
			plays: 2,
			lastStage: 'complete',
			bestScore: 400,
			bestTimeMs: 10_000,
			lastScore: 400,
			lastTimeMs: 10_000
		});

		await Promise.all([
			mergeUserChallengeProgress('learner-race', strongButSlower),
			mergeUserChallengeProgress('learner-race', strongAndFaster),
			mergeUserChallengeProgress('learner-race', latestButLowerScore)
		]);

		const canonical = await getUserChallengeProgress('learner-race');
		expect(canonical.challenges[challengeId]).toEqual({
			startedAt: '2026-07-18T09:00:00.000Z',
			updatedAt: '2026-07-18T10:05:00.000Z',
			completedAt: '2026-07-18T10:03:00.000Z',
			plays: 3,
			lastStage: 'complete',
			bestScore: 500,
			bestTimeMs: 25_000,
			lastScore: 400,
			lastTimeMs: 10_000
		});

		await mergeUserChallengeProgress('learner-race', strongButSlower);
		await expect(getUserChallengeProgress('learner-race')).resolves.toEqual(canonical);
	});

	it('uses the same deterministic last-result tie-break when timestamps match', async () => {
		const db = new DatabaseSync(':memory:');
		db.exec(migration);
		setPersonalDb(sqliteBinding(db, 2));
		const shared = {
			startedAt: '2026-07-18T10:00:00.000Z',
			updatedAt: '2026-07-18T10:04:00.000Z',
			completedAt: null,
			plays: 1,
			bestScore: 425,
			bestTimeMs: 25_000
		} as const;
		const diagnose = progress({
			...shared,
			lastStage: 'diagnose',
			lastScore: 425,
			lastTimeMs: 20_000
		});
		const transfer = progress({
			...shared,
			lastStage: 'transfer',
			lastScore: 400,
			lastTimeMs: 30_000
		});

		await Promise.all([
			mergeUserChallengeProgress('learner-tie', transfer),
			mergeUserChallengeProgress('learner-tie', diagnose)
		]);

		expect((await getUserChallengeProgress('learner-tie')).challenges[challengeId]).toMatchObject({
			updatedAt: shared.updatedAt,
			lastStage: 'transfer',
			lastScore: 400,
			lastTimeMs: 30_000
		});
	});

	it('cannot publish an older projection after a delayed merge loses to a newer request', async () => {
		const db = new DatabaseSync(':memory:');
		db.exec(migration);
		db.exec(`
			CREATE TABLE user_home_snapshots (
				user_id TEXT PRIMARY KEY,
				schema_version INTEGER NOT NULL,
				payload_json TEXT NOT NULL,
				source_revision INTEGER NOT NULL DEFAULT 0,
				snapshot_revision INTEGER NOT NULL DEFAULT 0,
				updated_at TEXT
			);
			INSERT INTO user_home_snapshots (
				user_id, schema_version, payload_json, source_revision, snapshot_revision
			) VALUES (
				'learner-projection-race',
				2,
				'{"version":2,"subjectViews":[],"challengeProgress":{"version":2,"challenges":{}},"challengeRecommendation":null,"challengeCompletedCount":0,"challengeTotalBestScore":0}',
				0,
				0
			);
			CREATE TRIGGER user_home_snapshot_challenge_progress_insert
			AFTER INSERT ON user_challenge_progress
			BEGIN
				UPDATE user_home_snapshots
				SET source_revision = source_revision + 1
				WHERE user_id = NEW.user_id;
			END;
			CREATE TRIGGER user_home_snapshot_challenge_progress_update
			AFTER UPDATE ON user_challenge_progress
			BEGIN
				UPDATE user_home_snapshots
				SET source_revision = source_revision + 1
				WHERE user_id = NEW.user_id;
			END;
		`);
		const delayed = bindingWithDelayedSecondProgressRead(db);
		setPersonalDb(delayed.binding);

		const older = progress({
			startedAt: '2026-07-18T10:00:00.000Z',
			updatedAt: '2026-07-18T10:04:00.000Z',
			completedAt: '2026-07-18T10:04:00.000Z',
			plays: 1,
			lastStage: 'complete',
			bestScore: 400,
			bestTimeMs: 40_000,
			lastScore: 400,
			lastTimeMs: 40_000
		});
		const newer = progress({
			startedAt: '2026-07-18T10:00:00.000Z',
			updatedAt: '2026-07-18T10:05:00.000Z',
			completedAt: '2026-07-18T10:04:00.000Z',
			plays: 2,
			lastStage: 'complete',
			bestScore: 500,
			bestTimeMs: 25_000,
			lastScore: 500,
			lastTimeMs: 25_000
		});

		const delayedOlderMerge = mergeUserChallengeProgress('learner-projection-race', older);
		await delayed.olderReadCaptured;
		await mergeUserChallengeProgress('learner-projection-race', newer);
		delayed.releaseOlderRead();
		await delayedOlderMerge;

		const canonical = await getUserChallengeProgress('learner-projection-race');
		const snapshotRow = db
			.prepare(
				`SELECT payload_json, source_revision, snapshot_revision
				   FROM user_home_snapshots
				  WHERE user_id = ?`
			)
			.get('learner-projection-race') as {
			payload_json: string;
			source_revision: number;
			snapshot_revision: number;
		};
		const snapshot = JSON.parse(snapshotRow.payload_json) as {
			challengeProgress: ChallengeProgress;
			challengeCompletedCount: number;
			challengeTotalBestScore: number;
		};

		expect(snapshot.challengeProgress).toEqual(canonical);
		expect(snapshot.challengeProgress.challenges[challengeId]).toMatchObject({
			updatedAt: newer.challenges[challengeId].updatedAt,
			plays: 2,
			bestScore: 500,
			bestTimeMs: 25_000
		});
		expect(snapshot.challengeCompletedCount).toBe(1);
		expect(snapshot.challengeTotalBestScore).toBe(500);
		expect(snapshotRow.source_revision).toBe(2);
		expect(snapshotRow.source_revision).toBe(snapshotRow.snapshot_revision);
	});
});
