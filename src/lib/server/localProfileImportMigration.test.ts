import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const baseMigration = readFileSync(
	new URL('../../../migrations/personal/0001_personal_learning.sql', import.meta.url),
	'utf8'
);
const provenanceMigration = readFileSync(
	new URL('../../../migrations/personal/0014_local_profile_import_provenance.sql', import.meta.url),
	'utf8'
);

describe('local profile import provenance migration', () => {
	it('protects every existing profile and leaves future automatic profiles pending', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(baseMigration);
		db.prepare(
			`INSERT INTO user_profiles (
			   uid, email, selected_board, selected_subject, selected_tier
			 ) VALUES (?, ?, 'AQA', 'Biology', 'Higher')`
		).run('legacy-exact-default', 'legacy@example.test');

		db.exec(provenanceMigration);

		db.prepare(
			`INSERT INTO user_profiles (
			   uid, email, selected_board, selected_subject, selected_tier
			 ) VALUES (?, ?, 'AQA', 'Biology', 'Higher')`
		).run('future-automatic-profile', 'future@example.test');

		expect(
			db
				.prepare(
					`SELECT uid, local_profile_import_pending
					 FROM user_profiles
					 ORDER BY uid`
				)
				.all()
		).toEqual([
			{ uid: 'future-automatic-profile', local_profile_import_pending: 1 },
			{ uid: 'legacy-exact-default', local_profile_import_pending: 0 }
		]);
	});
});
