import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { parseUserHomeSnapshot } from './homeSnapshot';

const personalSchema = readFileSync(
	new URL('../../../migrations/personal/0001_personal.sql', import.meta.url),
	'utf8'
);

function snapshotRow(db: DatabaseSync, userId: string) {
	return db
		.prepare(
			`SELECT payload_json, dirty, source_revision, snapshot_revision, refreshed_at
			   FROM user_home_snapshots
			  WHERE user_id = ?`
		)
		.get(userId) as {
		payload_json: string;
		dirty: number;
		source_revision: number;
		snapshot_revision: number;
		refreshed_at: string | null;
	};
}

describe('user home snapshot schema', () => {
	it('creates one current, parseable snapshot for every new profile', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(personalSchema);
		db.prepare(
			`INSERT INTO user_profiles (
			   uid, email, name, theme_preference, visual_effects_enabled
			 ) VALUES (?, ?, ?, ?, ?)`
		).run('learner-1', 'learner@example.test', 'Ada Lovelace', 'dark', 0);

		const columns = (
			db.prepare(`PRAGMA table_info('user_home_snapshots')`).all() as Array<{ name: string }>
		).map(({ name }) => name);
		expect(columns).not.toContain('schema_version');

		const row = snapshotRow(db, 'learner-1');
		expect(row).toMatchObject({
			dirty: 1,
			source_revision: 0,
			snapshot_revision: 0,
			refreshed_at: null
		});
		const payload = JSON.parse(row.payload_json);
		expect(payload).not.toHaveProperty('version');
		expect(payload).not.toHaveProperty('challengeRecommendation');
		expect(parseUserHomeSnapshot(payload)).toMatchObject({
			dashboard: {
				studentName: 'Ada',
				subjects: [],
				weeklySummary: { attemptCount: 0, recallCount: 0, closedGapCount: 0 }
			},
			subjectViews: [],
			appearance: {
				themePreference: 'dark',
				visualEffectsEnabled: false
			},
			challengeProgress: { version: 2, challenges: {} },
			challengeCompletedCount: 0,
			challengeTotalBestScore: 0
		});
		expect(parseUserHomeSnapshot({ ...payload, version: 4 })).toBeNull();
	});

	it('keeps the home row point-readable while source triggers fence refreshes', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(personalSchema);
		db.prepare('INSERT INTO user_profiles (uid, email, name) VALUES (?, ?, ?)').run(
			'learner-2',
			'learner2@example.test',
			'Grace Hopper'
		);
		db.prepare(
			`UPDATE user_home_snapshots
			    SET dirty = 0, source_revision = 4, snapshot_revision = 4
			  WHERE user_id = ?`
		).run('learner-2');

		db.prepare('UPDATE user_profiles SET last_seen_at = CURRENT_TIMESTAMP WHERE uid = ?').run(
			'learner-2'
		);
		expect(snapshotRow(db, 'learner-2')).toMatchObject({
			dirty: 0,
			source_revision: 4,
			snapshot_revision: 4
		});

		db.prepare(
			`UPDATE user_profiles
			    SET theme_preference = 'light', visual_effects_enabled = 0
			  WHERE uid = ?`
		).run('learner-2');
		const appearanceRow = snapshotRow(db, 'learner-2');
		expect(appearanceRow).toMatchObject({
			dirty: 0,
			source_revision: 5,
			snapshot_revision: 5
		});
		expect(JSON.parse(appearanceRow.payload_json).appearance).toEqual({
			themePreference: 'light',
			visualEffectsEnabled: false
		});

		db.prepare(
			`INSERT INTO user_profile_subjects (
			   user_id, subject, board, qualification, course, tier, enabled
			 ) VALUES (?, 'Biology', 'AQA', 'GCSE', 'Combined Science', 'Higher', 1)`
		).run('learner-2');
		expect(snapshotRow(db, 'learner-2')).toMatchObject({
			dirty: 1,
			source_revision: 6,
			snapshot_revision: 5
		});

		db.prepare(
			`INSERT INTO user_challenge_progress (
			   user_id, challenge_id, started_at, updated_at, completed_at, plays,
			   last_stage, best_score, best_time_ms, last_score, last_time_ms
			 ) VALUES (?, ?, ?, ?, ?, 1, 'complete', 425, 25000, 425, 25000)`
		).run(
			'learner-2',
			'biology-data-conclusions',
			'2026-07-19T10:00:00.000Z',
			'2026-07-19T10:02:00.000Z',
			'2026-07-19T10:02:00.000Z'
		);
		expect(snapshotRow(db, 'learner-2')).toMatchObject({
			dirty: 1,
			source_revision: 7,
			snapshot_revision: 5
		});
	});

	it('defines every invalidation source and one complete profile deletion boundary', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(personalSchema);
		const triggerNames = new Set(
			(
				db
					.prepare(
						`SELECT name
						   FROM sqlite_master
						  WHERE type = 'trigger'`
					)
					.all() as Array<{ name: string }>
			).map(({ name }) => name)
		);
		for (const source of [
			'profile_subject',
			'literature',
			'scope',
			'attempt',
			'draft',
			'gap',
			'review',
			'evidence',
			'component_state',
			'recommendation',
			'challenge_progress'
		]) {
			for (const operation of ['insert', 'update', 'delete']) {
				expect(triggerNames).toContain(`user_home_snapshot_${source}_${operation}`);
			}
		}
		expect(triggerNames).toContain('user_profile_delete_cascade');

		const userId = 'delete-me';
		const identityKey = Buffer.from(userId, 'utf8').toString('hex');
		db.prepare('INSERT INTO user_profiles (uid, email) VALUES (?, ?)').run(
			userId,
			'delete-me@example.test'
		);
		db.prepare(
			`INSERT INTO user_question_drafts (
			   user_id, question_id, draft_kind
			 ) VALUES (?, 'question-1', 'answer')`
		).run(userId);
		db.prepare(
			`UPDATE challenge_leaderboard_snapshots
			    SET participants_json = json_set(participants_json, ?, json(?))
			  WHERE scope = 'all'`
		).run(`$."${identityKey}"`, JSON.stringify({ score: 500, completed: 1 }));

		db.prepare('DELETE FROM user_profiles WHERE uid = ?').run(userId);
		expect(
			db.prepare('SELECT COUNT(*) AS count FROM user_home_snapshots WHERE user_id = ?').get(userId)
		).toEqual({ count: 0 });
		expect(
			db.prepare('SELECT COUNT(*) AS count FROM user_question_drafts WHERE user_id = ?').get(userId)
		).toEqual({ count: 0 });
		expect(
			db
				.prepare(
					`SELECT json_extract(participants_json, ?) AS participant
					   FROM challenge_leaderboard_snapshots
					  WHERE scope = 'all'`
				)
				.get(`$."${identityKey}"`)
		).toEqual({ participant: null });
	});
});
