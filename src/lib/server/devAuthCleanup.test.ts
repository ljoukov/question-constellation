import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
	analyticsCleanupStatements,
	personalCleanupStatements
} from '../../../scripts/cleanup-dev-auth-data.mjs';

const uid = 'ux-cleanup-test-user';

describe('disposable development-auth cleanup', () => {
	it('removes the exact Personal uid from every enumerated table and preserves another user', () => {
		const db = personalFixture();
		runAtomically(db, personalCleanupStatements(uid));

		for (const { name } of db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'user_%'")
			.all() as Array<{ name: string }>) {
			const column = name === 'user_profiles' ? 'uid' : 'user_id';
			expect(
				Number(
					(
						db.prepare(`SELECT COUNT(*) count FROM ${name} WHERE ${column} = ?`).get(uid) as {
							count: number;
						}
					).count
				)
			).toBe(0);
			expect(
				Number(
					(
						db
							.prepare(`SELECT COUNT(*) count FROM ${name} WHERE ${column} = 'other-user'`)
							.get() as { count: number }
					).count
				)
			).toBe(1);
		}
		expect(cleanupGuardCount(db)).toBe(0);
	});

	it('rolls Personal cleanup back if a new user table has not been enumerated', () => {
		const db = personalFixture();
		db.exec('CREATE TABLE user_new_private_rows (user_id TEXT)');

		expect(() => runAtomically(db, personalCleanupStatements(uid))).toThrow(
			/CHECK constraint failed/
		);
		expect(
			Number(
				(
					db.prepare('SELECT COUNT(*) count FROM user_profiles WHERE uid = ?').get(uid) as {
						count: number;
					}
				).count
			)
		).toBe(1);
		expect(cleanupGuardCount(db)).toBe(0);
	});

	it('removes complete development sessions and direct summaries while preserving unrelated rows', () => {
		const db = analyticsFixture();
		runAtomically(db, analyticsCleanupStatements(uid));

		expect(ids(db, 'analytics_sessions', 'session_id')).toEqual(['dev-keep', 'prod-keep']);
		expect(ids(db, 'analytics_requests', 'request_id')).toEqual([
			'dev-keep-request',
			'prod-keep-request'
		]);
		expect(ids(db, 'analytics_events', 'event_id')).toEqual(['dev-keep-event', 'prod-keep-event']);
		expect(ids(db, 'analytics_model_runs', 'run_id')).toEqual([
			'dev-keep-model',
			'prod-keep-model'
		]);
		expect(ids(db, 'analytics_ai_summaries', 'summary_id')).toEqual(['prod-keep-summary']);
		expect(ids(db, 'analytics_admin_audit', 'audit_id')).toEqual(['other-audit']);
		expect(ids(db, 'analytics_actor_labels', 'actor_key')).toEqual([
			'anonymous:ux-cleanup-test-user',
			'user:other-user',
			'user:ux-cleanup-test-user-suffix'
		]);
		expect(cleanupGuardCount(db)).toBe(0);
	});

	it('rolls Analytics cleanup back when the uid reaches a production session', () => {
		const db = analyticsFixture();
		db.exec(
			"UPDATE analytics_sessions SET user_id = 'ux-cleanup-test-user' WHERE session_id = 'prod-keep'"
		);

		expect(() => runAtomically(db, analyticsCleanupStatements(uid))).toThrow(
			/CHECK constraint failed/
		);
		expect(ids(db, 'analytics_sessions', 'session_id')).toContain('dev-target');
		expect(ids(db, 'analytics_sessions', 'session_id')).toContain('prod-keep');
		expect(ids(db, 'analytics_actor_labels', 'actor_key')).toContain('user:ux-cleanup-test-user');
		expect(cleanupGuardCount(db)).toBe(0);
	});
});

function personalFixture() {
	const db = new DatabaseSync(':memory:');
	const tables = [
		'user_paper_sitting_sessions',
		'user_recommendation_decisions',
		'user_learner_component_states',
		'user_recall_coverage_misses',
		'user_gap_builder_runs',
		'user_chain_gaps',
		'user_learning_evidence',
		'user_question_attempts',
		'user_question_drafts',
		'user_recall_card_reviews',
		'user_subject_curriculum_scopes',
		'user_english_literature_selections',
		'user_profile_subjects',
		'user_challenge_progress',
		'user_home_snapshots'
	];
	db.exec('CREATE TABLE user_profiles (uid TEXT PRIMARY KEY)');
	for (const table of tables) db.exec(`CREATE TABLE ${table} (user_id TEXT)`);
	db.exec("INSERT INTO user_profiles VALUES ('ux-cleanup-test-user'), ('other-user')");
	for (const table of tables) {
		db.exec(`INSERT INTO ${table} VALUES ('ux-cleanup-test-user'), ('other-user')`);
	}
	return db;
}

function analyticsFixture() {
	const db = new DatabaseSync(':memory:');
	db.exec('PRAGMA foreign_keys = ON');
	for (const migration of [
		'0001_analytics.sql',
		'0002_environment_and_model_runs.sql',
		'0003_ai_summaries.sql',
		'0004_admin_audit.sql',
		'0005_traffic_classification.sql',
		'0006_classifier_v2.sql',
		'0007_backfill_unclassified_traffic.sql'
	]) {
		db.exec(readFileSync(path.resolve('migrations/analytics', migration), 'utf8'));
	}
	for (const [sessionId, userId, environment] of [
		['dev-target', uid, 'development'],
		['dev-shared', 'other-user', 'development'],
		['dev-keep', 'other-user', 'development'],
		['prod-keep', 'other-user', 'production']
	]) {
		db.prepare(
			`INSERT INTO analytics_sessions (
			  session_id, anonymous_id, user_id, started_at, last_seen_at, environment
			) VALUES (?, ?, ?, '2026-07-16T00:00:00Z', '2026-07-16T00:01:00Z', ?)`
		).run(sessionId, `anonymous-${sessionId}`, userId, environment);
		insertRequestEvent(db, sessionId, userId, environment);
		insertModelRun(db, sessionId, userId, environment);
	}
	// A uid event turns this otherwise shared development session into a target;
	// all analytics from the session must be removed together.
	db.exec(
		"UPDATE analytics_events SET user_id = 'ux-cleanup-test-user' WHERE session_id = 'dev-shared'"
	);
	db.prepare(
		`INSERT INTO analytics_model_runs (
		  run_id, session_id, user_id, environment, feature, model, status, started_at
		) VALUES ('sessionless-target-model', NULL, ?, 'development', 'test', 'model', 'completed',
		          '2026-07-16T00:00:00Z')`
	).run(uid);
	db.prepare(
		`INSERT INTO analytics_ai_summaries (
		  summary_id, status, environment, window_days, requested_by, created_at, model
		) VALUES ('dev-target-summary', 'completed', 'development', 7, ?,
		          '2026-07-16T00:00:00Z', 'model')`
	).run(uid);
	db.exec(`
		INSERT INTO analytics_ai_summaries (
		  summary_id, status, environment, window_days, requested_by, created_at, model
		) VALUES ('prod-keep-summary', 'completed', 'production', 7, 'other-user',
		          '2026-07-16T00:00:00Z', 'model');
		INSERT INTO analytics_admin_audit (
		  audit_id, action, scope, requested_by, created_at
		) VALUES ('other-audit', 'view', 'analytics', 'other-user', '2026-07-16T00:00:00Z');
		INSERT INTO analytics_actor_labels (
		  actor_key, classification, note, created_by, created_at, updated_at
		) VALUES
		  ('user:ux-cleanup-test-user', 'internal_test', 'cleanup target', 'test',
		   '2026-07-16T00:00:00Z', '2026-07-16T00:00:00Z'),
		  ('user:other-user', 'human', 'unrelated user', 'test',
		   '2026-07-16T00:00:00Z', '2026-07-16T00:00:00Z'),
		  ('anonymous:ux-cleanup-test-user', 'internal_test', 'similar anonymous key', 'test',
		   '2026-07-16T00:00:00Z', '2026-07-16T00:00:00Z'),
		  ('user:ux-cleanup-test-user-suffix', 'internal_test', 'similar user key', 'test',
		   '2026-07-16T00:00:00Z', '2026-07-16T00:00:00Z');
	`);
	return db;
}

function insertRequestEvent(
	db: DatabaseSync,
	sessionId: string,
	userId: string,
	environment: string
) {
	db.prepare(
		`INSERT INTO analytics_requests (
		  request_id, session_id, received_at, event_count, environment
		) VALUES (?, ?, '2026-07-16T00:00:00Z', 1, ?)`
	).run(`${sessionId}-request`, sessionId, environment);
	db.prepare(
		`INSERT INTO analytics_events (
		  event_id, request_id, session_id, anonymous_id, user_id, event_type,
		  client_timestamp_ms, occurred_at, received_at, environment
		) VALUES (?, ?, ?, ?, ?, 'page_view', 1,
		          '2026-07-16T00:00:00Z', '2026-07-16T00:00:00Z', ?)`
	).run(
		`${sessionId}-event`,
		`${sessionId}-request`,
		sessionId,
		`anonymous-${sessionId}`,
		userId,
		environment
	);
}

function insertModelRun(db: DatabaseSync, sessionId: string, userId: string, environment: string) {
	db.prepare(
		`INSERT INTO analytics_model_runs (
		  run_id, session_id, user_id, environment, feature, model, status, started_at
		) VALUES (?, ?, ?, ?, 'test', 'model', 'completed', '2026-07-16T00:00:00Z')`
	).run(`${sessionId}-model`, sessionId, userId, environment);
}

function runAtomically(
	db: DatabaseSync,
	statements: Array<{ sql: string; params?: Array<string | number | null> }>
) {
	db.exec('BEGIN IMMEDIATE');
	try {
		for (const statement of statements) {
			db.prepare(statement.sql).run(...((statement.params ?? []) as never[]));
		}
		db.exec('COMMIT');
	} catch (error) {
		db.exec('ROLLBACK');
		throw error;
	}
}

function ids(db: DatabaseSync, table: string, column: string) {
	return (
		db.prepare(`SELECT ${column} id FROM ${table} ORDER BY ${column}`).all() as Array<{
			id: string;
		}>
	).map((row) => row.id);
}

function cleanupGuardCount(db: DatabaseSync) {
	return Number(
		(
			db
				.prepare(
					`SELECT COUNT(*) count FROM sqlite_master
					  WHERE type = 'table' AND name LIKE '_ux_cleanup_%'`
				)
				.get() as { count: number }
		).count
	);
}
