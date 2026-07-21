import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { parseUserHomeSnapshot } from './homeSnapshot';

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

function snapshotRow(db: DatabaseSync, userId: string) {
	return db
		.prepare(
			`SELECT schema_version, payload_json, dirty, source_revision, snapshot_revision
			   FROM user_home_snapshots
			  WHERE user_id = ?`
		)
		.get(userId) as {
		schema_version: number;
		payload_json: string;
		dirty: number;
		source_revision: number;
		snapshot_revision: number;
	};
}

type FallbackPayload = {
	version: number;
	dashboard: {
		studentName: string;
		subjects: unknown[];
		weeklySummary: {
			attemptCount: number;
			recallCount: number;
			closedGapCount: number;
		};
	};
	appearance: {
		themePreference: string;
		visualEffectsEnabled: boolean;
	};
	challengeProgress: { version: number; challenges: Record<string, unknown> };
	challengeRecommendation: {
		id: string;
		slug: string;
		subject: string;
		title: string;
		hook: string;
	};
	challengeCompletedCount: number;
	challengeTotalBestScore: number;
};

describe('user home snapshot migration', () => {
	it('upgrades legacy rows and future profile seeds to a parseable v3 fallback', () => {
		const db = new DatabaseSync(':memory:');
		applyThrough(db, '0011_relax_challenge_completion_time.sql');
		db.prepare(
			`INSERT INTO user_profiles (uid, email, name, theme_preference)
			 VALUES (?, ?, ?, ?)`
		).run('legacy-user', 'legacy@example.test', 'Ada Lovelace', 'dark');
		for (const migration of [
			'0012_user_home_snapshot.sql',
			'0013_profile_delete_challenge_cleanup.sql',
			'0014_local_profile_import_provenance.sql'
		]) {
			db.exec(readFileSync(new URL(migration, personalMigrationDirectory), 'utf8'));
		}
		const inProgress = {
			version: 2,
			challenges: {
				'biology-data-conclusions': {
					startedAt: '2026-07-19T10:00:00.000Z',
					updatedAt: '2026-07-19T10:01:00.000Z',
					completedAt: null,
					plays: 1,
					lastStage: 'showdown',
					bestScore: null,
					bestTimeMs: null,
					lastScore: null,
					lastTimeMs: null
				}
			}
		};
		db.prepare(
			`UPDATE user_home_snapshots
			    SET payload_json = json_set(payload_json, '$.challengeProgress', json(?))
			  WHERE user_id = ?`
		).run(JSON.stringify(inProgress), 'legacy-user');

		db.exec(
			readFileSync(new URL('0015_user_home_snapshot_v2.sql', personalMigrationDirectory), 'utf8')
		);

		const upgraded = snapshotRow(db, 'legacy-user');
		expect(upgraded).toMatchObject({
			schema_version: 2,
			dirty: 1,
			source_revision: 1,
			snapshot_revision: 0
		});
		// Migration 0015 remains immutable history. The v3 runtime deliberately
		// rejects its cached links until migration 0017 clears and rebuilds them.
		expect(parseUserHomeSnapshot(JSON.parse(upgraded.payload_json))).toBeNull();

		for (const migration of [
			'0016_user_learning_evidence_supersedes_index.sql',
			'0017_user_home_snapshot_v3.sql'
		]) {
			db.exec(readFileSync(new URL(migration, personalMigrationDirectory), 'utf8'));
		}
		const upgradedV3 = snapshotRow(db, 'legacy-user');
		expect(upgradedV3).toMatchObject({
			schema_version: 3,
			dirty: 1,
			source_revision: 2,
			snapshot_revision: 0
		});
		const upgradedPayload = parseUserHomeSnapshot(JSON.parse(upgradedV3.payload_json));
		expect(upgradedPayload).not.toBeNull();
		expect(upgradedPayload?.subjectViews).toEqual([]);
		expect(upgradedPayload?.challengeProgress).toEqual(inProgress);

		db.prepare(
			`INSERT INTO user_profiles (uid, email, name, theme_preference)
			 VALUES (?, ?, ?, ?)`
		).run('new-user', 'new@example.test', 'Grace Hopper', 'light');
		const seeded = snapshotRow(db, 'new-user');
		expect(seeded.schema_version).toBe(3);
		expect(parseUserHomeSnapshot(JSON.parse(seeded.payload_json))).toMatchObject({
			version: 3,
			dashboard: { studentName: 'Grace', subjects: [] },
			subjectViews: [],
			appearance: { themePreference: 'light' }
		});
	});

	it('seeds every existing profile with an appearance-correct fallback', () => {
		const db = new DatabaseSync(':memory:');
		applyThrough(db, '0011_relax_challenge_completion_time.sql');
		db.prepare(
			`INSERT INTO user_profiles (
			   uid, email, name, theme_preference, visual_effects_enabled
			 ) VALUES (?, ?, ?, ?, ?)`
		).run('learner-1', 'learner@example.test', 'Ada Lovelace', 'dark', 0);

		db.exec(
			readFileSync(new URL('0012_user_home_snapshot.sql', personalMigrationDirectory), 'utf8')
		);

		const row = snapshotRow(db, 'learner-1');
		const payload = JSON.parse(row.payload_json) as FallbackPayload;
		expect(row).toMatchObject({
			dirty: 1,
			source_revision: 0,
			snapshot_revision: 0
		});
		expect(payload).toMatchObject({
			version: 1,
			dashboard: {
				studentName: 'Ada',
				subjects: [],
				weeklySummary: { attemptCount: 0, recallCount: 0, closedGapCount: 0 }
			},
			appearance: {
				themePreference: 'dark',
				visualEffectsEnabled: false
			},
			challengeProgress: { version: 2, challenges: {} },
			challengeRecommendation: {
				id: 'biology-data-conclusions',
				slug: 'smoking-risk-data-conclusions',
				subject: 'biology',
				title: 'Can you draw a conclusion from smoking-risk data?',
				hook: '“Smoking causes disease” sounds scientific — but the table cannot prove that.'
			},
			challengeCompletedCount: 0,
			challengeTotalBestScore: 0
		});
		// Migration 0012 intentionally remains the deployed v1 history. Runtime
		// treats it as a useful legacy row and schedules a v2 catalog-backed
		// rebuild instead of accepting a partial subject projection as current.
		expect(parseUserHomeSnapshot(payload)).toBeNull();
		const triggerNames = new Set(
			(
				db
					.prepare(
						`SELECT name
						   FROM sqlite_master
						  WHERE type = 'trigger'
						    AND name LIKE 'user_home_snapshot_%'`
					)
					.all() as Array<{ name: string }>
			).map((trigger) => trigger.name)
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
			'recommendation'
		]) {
			for (const operation of ['insert', 'update', 'delete']) {
				expect(triggerNames).toContain(`user_home_snapshot_${source}_${operation}`);
			}
		}
		expect(triggerNames).not.toContain('user_home_snapshot_profile_delete');
	});

	it('does not invalidate on last-seen writes but projects appearance changes immediately', () => {
		const db = new DatabaseSync(':memory:');
		applyThrough(db, '0013_profile_delete_challenge_cleanup.sql');
		db.prepare(
			`INSERT INTO user_profiles (
			   uid, email, name, theme_preference, visual_effects_enabled
			 ) VALUES (?, ?, ?, ?, ?)`
		).run('learner-2', 'learner2@example.test', 'Grace Hopper', 'auto', 1);
		db.prepare(
			`UPDATE user_home_snapshots
			    SET dirty = 0, source_revision = 4, snapshot_revision = 4
			  WHERE user_id = ?`
		).run('learner-2');

		db.prepare(
			`UPDATE user_profiles
			    SET last_seen_at = CURRENT_TIMESTAMP
			  WHERE uid = ?`
		).run('learner-2');
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
		db.prepare('DELETE FROM user_profiles WHERE uid = ?').run('learner-2');
		expect(
			db
				.prepare('SELECT COUNT(*) AS count FROM user_home_snapshots WHERE user_id = ?')
				.get('learner-2')
		).toEqual({ count: 0 });
		expect(
			db
				.prepare('SELECT COUNT(*) AS count FROM user_challenge_progress WHERE user_id = ?')
				.get('learner-2')
		).toEqual({ count: 0 });
		const triggerNames = new Set(
			(
				db
					.prepare(
						`SELECT name
						   FROM sqlite_master
						  WHERE type = 'trigger'
						    AND name LIKE 'user_home_snapshot_challenge_progress_%'`
					)
					.all() as Array<{ name: string }>
			).map((trigger) => trigger.name)
		);
		expect(triggerNames).toEqual(
			new Set([
				'user_home_snapshot_challenge_progress_insert',
				'user_home_snapshot_challenge_progress_update',
				'user_home_snapshot_challenge_progress_delete'
			])
		);
	});

	it('invalidates one owning row for learner sources while challenge writes stay integrated', () => {
		const db = new DatabaseSync(':memory:');
		applyThrough(db, '0012_user_home_snapshot.sql');
		db.prepare(
			`INSERT INTO user_profiles (uid, email, name)
			 VALUES (?, ?, ?)`
		).run('learner-3', 'learner3@example.test', 'Katherine Johnson');
		db.prepare(
			`UPDATE user_home_snapshots
			    SET dirty = 0, source_revision = 0, snapshot_revision = 0
			  WHERE user_id = ?`
		).run('learner-3');

		db.prepare(
			`INSERT INTO user_profile_subjects (
			   user_id, subject, board, qualification, course, tier, enabled
			 ) VALUES (?, 'Biology', 'AQA', 'GCSE', 'Combined Science', 'Higher', 1)`
		).run('learner-3');
		expect(snapshotRow(db, 'learner-3')).toMatchObject({
			dirty: 1,
			source_revision: 1,
			snapshot_revision: 0
		});

		db.prepare(
			`UPDATE user_home_snapshots
			    SET dirty = 0, snapshot_revision = source_revision
			  WHERE user_id = ?`
		).run('learner-3');
		db.prepare(
			`INSERT INTO user_challenge_progress (
			   user_id, challenge_id, started_at, updated_at, completed_at, plays,
			   last_stage, best_score, best_time_ms, last_score, last_time_ms
			 ) VALUES (?, ?, ?, ?, ?, 1, 'complete', 425, 25000, 425, 25000)`
		).run(
			'learner-3',
			'biology-data-conclusions',
			'2026-07-19T10:00:00.000Z',
			'2026-07-19T10:02:00.000Z',
			'2026-07-19T10:02:00.000Z'
		);
		expect(snapshotRow(db, 'learner-3')).toMatchObject({
			dirty: 0,
			source_revision: 1,
			snapshot_revision: 1
		});
	});
});
