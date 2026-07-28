import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const personalSchema = readFileSync(
	new URL('../../../migrations/personal/0001_personal.sql', import.meta.url),
	'utf8'
);

function identityKey(userId: string) {
	return Buffer.from(userId, 'utf8').toString('hex');
}

describe('challenge leaderboard snapshot schema', () => {
	it('starts with four empty scope rows and removes a deleted profile identity', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(personalSchema);

		const rows = db
			.prepare(
				`SELECT scope, participants_json
				   FROM challenge_leaderboard_snapshots
				  ORDER BY scope`
			)
			.all() as Array<{ scope: string; participants_json: string }>;
		expect(rows).toEqual([
			{ scope: 'all', participants_json: '{}' },
			{ scope: 'biology', participants_json: '{}' },
			{ scope: 'chemistry', participants_json: '{}' },
			{ scope: 'physics', participants_json: '{}' }
		]);

		const userId = 'leader@example.test';
		const key = identityKey(userId);
		db.prepare('INSERT INTO user_profiles (uid, email, name) VALUES (?, ?, ?)').run(
			userId,
			userId,
			'Ada Leader'
		);
		db.prepare(
			`UPDATE challenge_leaderboard_snapshots
			    SET participants_json = json_set(participants_json, ?, json(?))
			  WHERE scope IN ('all', 'biology')`
		).run(`$."${key}"`, JSON.stringify({ score: 425, completed: 1 }));

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
