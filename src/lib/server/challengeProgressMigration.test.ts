import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	new URL('../../../migrations/personal/0009_challenge_progress.sql', import.meta.url),
	'utf8'
);
const relaxCompletionTimeMigration = readFileSync(
	new URL('../../../migrations/personal/0011_relax_challenge_completion_time.sql', import.meta.url),
	'utf8'
);
function insertProgress(db: DatabaseSync, overrides: Record<string, unknown> = {}) {
	const row = {
		user_id: 'learner-1',
		challenge_id: 'biology-data-conclusions',
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
	db.prepare(
		`INSERT INTO user_challenge_progress (
		   user_id, challenge_id, started_at, updated_at, completed_at, plays,
		   last_stage, best_score, best_time_ms, last_score, last_time_ms
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		row.user_id,
		row.challenge_id,
		row.started_at,
		row.updated_at,
		row.completed_at,
		row.plays,
		row.last_stage,
		row.best_score,
		row.best_time_ms,
		row.last_score,
		row.last_time_ms
	);
}

describe('personal challenge progress migration', () => {
	it('keeps one bounded row per user and challenge', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(migration);
		insertProgress(db);

		expect(
			db
				.prepare(
					'SELECT user_id, challenge_id, plays, last_stage, best_score FROM user_challenge_progress'
				)
				.get()
		).toEqual({
			user_id: 'learner-1',
			challenge_id: 'biology-data-conclusions',
			plays: 1,
			last_stage: 'complete',
			best_score: 400
		});
		expect(() => insertProgress(db)).toThrow(/UNIQUE constraint failed/);
		expect(() =>
			insertProgress(db, { challenge_id: 'chemistry-collision-rate', last_stage: 'won' })
		).toThrow(/CHECK constraint failed/);
		expect(() => insertProgress(db, { challenge_id: 'physics-half-range', plays: 0 })).toThrow(
			/CHECK constraint failed/
		);
		expect(() =>
			insertProgress(db, { challenge_id: 'physics-forces', best_time_ms: 21_600_001 })
		).toThrow(/CHECK constraint failed/);
		expect(() =>
			insertProgress(db, {
				challenge_id: 'biology-score-pair',
				best_score: null,
				best_time_ms: 20_000
			})
		).toThrow(/CHECK constraint failed/);
	});

	it('allows a replay to begin after the retained first-completion timestamp', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(migration);
		insertProgress(db);

		expect(() =>
			db
				.prepare(
					`UPDATE user_challenge_progress
					    SET started_at = ?, updated_at = ?, plays = ?, last_stage = ?
					  WHERE user_id = ? AND challenge_id = ?`
				)
				.run(
					'2026-07-18T10:05:00.000Z',
					'2026-07-18T10:06:00.000Z',
					2,
					'showdown',
					'learner-1',
					'biology-data-conclusions'
				)
		).toThrow(/CHECK constraint failed/);

		db.exec(relaxCompletionTimeMigration);
		expect(() =>
			db
				.prepare(
					`UPDATE user_challenge_progress
					    SET started_at = ?, updated_at = ?, plays = ?, last_stage = ?
					  WHERE user_id = ? AND challenge_id = ?`
				)
				.run(
					'2026-07-18T10:05:00.000Z',
					'2026-07-18T10:06:00.000Z',
					2,
					'showdown',
					'learner-1',
					'biology-data-conclusions'
				)
		).not.toThrow();
	});
});
