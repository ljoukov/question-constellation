import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const personalMigrationDirectory = new URL('../../../migrations/personal/', import.meta.url);
const migrationFiles = readdirSync(personalMigrationDirectory)
	.filter((file) => file.endsWith('.sql'))
	.sort();

function applyThrough(db: DatabaseSync, lastMigration: string) {
	for (const file of migrationFiles) {
		db.exec(readFileSync(new URL(file, personalMigrationDirectory), 'utf8'));
		if (file === lastMigration) break;
	}
}

function identityKey(userId: string) {
	return Buffer.from(userId, 'utf8').toString('hex');
}

function insertProgress(
	db: DatabaseSync,
	userId: string,
	challengeId: string,
	score: number,
	updatedAt: string
) {
	db.prepare(
		`INSERT INTO user_challenge_progress (
		   user_id, challenge_id, started_at, updated_at, completed_at, plays,
		   last_stage, best_score, best_time_ms, last_score, last_time_ms
		 ) VALUES (?, ?, ?, ?, ?, 1, 'complete', ?, 30000, ?, 30000)`
	).run(userId, challengeId, updatedAt, updatedAt, updatedAt, score, score);
}

describe('challenge leaderboard snapshot migration', () => {
	it('backfills four bounded scope rows and removes a deleted profile identity', () => {
		const db = new DatabaseSync(':memory:');
		applyThrough(db, '0019_remove_snapshot_challenge_recommendation.sql');

		const userId = 'leader@example.test';
		db.prepare(
			`INSERT INTO user_profiles (uid, email, name)
			 VALUES (?, ?, ?)`
		).run(userId, userId, 'Ada Leader');
		insertProgress(db, userId, 'biology-data-conclusions', 425, '2026-07-26T10:00:00.000Z');
		insertProgress(db, userId, 'physics-half-range', 500, '2026-07-26T10:05:00.000Z');

		db.exec(
			readFileSync(
				new URL('0020_challenge_leaderboard_snapshots.sql', personalMigrationDirectory),
				'utf8'
			)
		);

		const rows = db
			.prepare(
				`SELECT scope, participants_json
				   FROM challenge_leaderboard_snapshots
				  ORDER BY scope`
			)
			.all() as Array<{ scope: string; participants_json: string }>;
		expect(rows.map((row) => row.scope)).toEqual(['all', 'biology', 'chemistry', 'physics']);

		const participants = Object.fromEntries(
			rows.map((row) => [row.scope, JSON.parse(row.participants_json)])
		);
		const key = identityKey(userId);
		expect(participants.all[key]).toEqual({ score: 925, completed: 2 });
		expect(participants.biology[key]).toEqual({ score: 425, completed: 1 });
		expect(participants.chemistry).toEqual({});
		expect(participants.physics[key]).toEqual({ score: 500, completed: 1 });

		db.prepare('DELETE FROM user_profiles WHERE uid = ?').run(userId);
		const remaining = db
			.prepare(
				`SELECT json_extract(participants_json, ?) AS participant
				   FROM challenge_leaderboard_snapshots`
			)
			.all(`$."${key}"`) as Array<{ participant: unknown }>;
		expect(remaining.every((row) => row.participant === null)).toBe(true);
	});
});
