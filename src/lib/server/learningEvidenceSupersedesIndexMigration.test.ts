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

describe('learning evidence supersedes index migration', () => {
	it('adds a partial covering index used by the evidence anti-join', () => {
		const db = new DatabaseSync(':memory:');
		applyThrough(db, '0015_user_home_snapshot_v2.sql');
		db.exec(
			readFileSync(
				new URL('0016_user_learning_evidence_supersedes_index.sql', personalMigrationDirectory),
				'utf8'
			)
		);

		const index = (
			db.prepare(`PRAGMA index_list('user_learning_evidence')`).all() as Array<{
				name: string;
				partial: number;
			}>
		).find(({ name }) => name === 'idx_user_learning_evidence_supersedes');
		expect(index).toMatchObject({ partial: 1 });
		expect(
			(
				db.prepare(`PRAGMA index_info('idx_user_learning_evidence_supersedes')`).all() as Array<{
					name: string;
				}>
			).map(({ name }) => name)
		).toEqual(['user_id', 'supersedes_evidence_id']);

		const plan = (
			db
				.prepare(
					`EXPLAIN QUERY PLAN
					 SELECT e.id
					 FROM user_learning_evidence e
					 WHERE e.user_id = ? AND e.subject = ?
					   AND NOT EXISTS (
					     SELECT 1
					     FROM user_learning_evidence correction
					     WHERE correction.user_id = e.user_id
					       AND correction.supersedes_evidence_id = e.id
					   )`
				)
				.all('learner-1', 'Biology') as Array<{ detail: string }>
		).map(({ detail }) => detail);

		expect(plan).toContainEqual(
			expect.stringMatching(
				/SEARCH correction USING COVERING INDEX idx_user_learning_evidence_supersedes \(user_id=\? AND supersedes_evidence_id=\?\)/
			)
		);
	});
});
