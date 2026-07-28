import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const personalSchema = readFileSync(
	new URL('../../../migrations/personal/0001_personal.sql', import.meta.url),
	'utf8'
);

describe('learning evidence supersedes index schema', () => {
	it('includes the partial covering index used by the evidence anti-join', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(personalSchema);

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
