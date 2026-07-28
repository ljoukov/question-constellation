import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

function migrationFiles(directory: URL) {
	return readdirSync(directory)
		.filter((file) => file.endsWith('.sql'))
		.sort();
}

function applySchema(directory: URL, file: string) {
	const db = new DatabaseSync(':memory:');
	db.exec(readFileSync(new URL(file, directory), 'utf8'));
	return db;
}

describe('clean-slate D1 schemas', () => {
	it('defines personal storage in one current migration without versioned snapshots', () => {
		const directory = new URL('../../../migrations/personal/', import.meta.url);
		expect(migrationFiles(directory)).toEqual(['0001_personal.sql']);
		const db = applySchema(directory, '0001_personal.sql');

		const snapshotColumns = (
			db.prepare(`PRAGMA table_info('user_home_snapshots')`).all() as Array<{ name: string }>
		).map(({ name }) => name);
		const leaderboardColumns = (
			db.prepare(`PRAGMA table_info('challenge_leaderboard_snapshots')`).all() as Array<{
				name: string;
			}>
		).map(({ name }) => name);
		const profileColumns = (
			db.prepare(`PRAGMA table_info('user_profiles')`).all() as Array<{ name: string }>
		).map(({ name }) => name);

		expect(snapshotColumns).not.toContain('schema_version');
		expect(leaderboardColumns).not.toContain('schema_version');
		expect(profileColumns).toContain('guest_profile_sync_pending');
		expect(profileColumns).not.toContain('local_profile_import_pending');
	});

	it('defines analytics storage in one current migration without classifier history', () => {
		const directory = new URL('../../../migrations/analytics/', import.meta.url);
		expect(migrationFiles(directory)).toEqual(['0001_analytics.sql']);
		const db = applySchema(directory, '0001_analytics.sql');

		const sessionColumns = (
			db.prepare(`PRAGMA table_info('analytics_sessions')`).all() as Array<{ name: string }>
		).map(({ name }) => name);
		expect(sessionColumns).not.toContain('classification_version');
		expect(sessionColumns).not.toContain('classified_at');

		db.prepare(
			`INSERT INTO analytics_ai_summaries (
			   summary_id, status, environment, window_days, created_at, model
			 ) VALUES ('summary-1', 'queued', 'development', 7, CURRENT_TIMESTAMP, 'model')`
		).run();
		expect(
			db
				.prepare(
					`SELECT traffic_scope, identity_scope
					   FROM analytics_ai_summaries
					  WHERE summary_id = 'summary-1'`
				)
				.get()
		).toEqual({ traffic_scope: 'all', identity_scope: 'all' });
	});
});
