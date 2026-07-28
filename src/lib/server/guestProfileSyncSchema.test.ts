import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const personalSchema = readFileSync(
	new URL('../../../migrations/personal/0001_personal.sql', import.meta.url),
	'utf8'
);

describe('guest profile sync schema', () => {
	it('starts every new profile with one explicit pending sync fence', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(personalSchema);
		db.prepare(
			`INSERT INTO user_profiles (
			   uid, email, selected_board, selected_subject, selected_tier
			 ) VALUES (?, ?, 'AQA', 'Biology', 'Higher')`
		).run('new-profile', 'new@example.test');

		expect(
			db
				.prepare(
					`SELECT uid, guest_profile_sync_pending
					 FROM user_profiles`
				)
				.all()
		).toEqual([{ uid: 'new-profile', guest_profile_sync_pending: 1 }]);
	});
});
