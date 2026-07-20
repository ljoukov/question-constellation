#!/usr/bin/env node
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- This operator CLI validates generic D1 JSON rows at runtime.

import { pathToFileURL } from 'node:url';

import { d1Batch, d1Rows } from './lib/d1-rest.mjs';

export const DISPOSABLE_DEV_AUTH_USER_ID = 'ux-cleanup-test-user';
export const DEV_AUTH_CLEANUP_CONFIRMATION = `delete-${DISPOSABLE_DEV_AUTH_USER_ID}`;
const USER_ID = DISPOSABLE_DEV_AUTH_USER_ID;
const CONFIRMATION = DEV_AUTH_CLEANUP_CONFIRMATION;
const PERSONAL_BINDING = 'PERSONAL_DB';
const ANALYTICS_BINDING = 'ANALYTICS_DB';
export const PERSONAL_CLEANUP_TABLES = Object.freeze([
	['user_paper_sitting_sessions', 'user_id'],
	['user_recommendation_decisions', 'user_id'],
	['user_learner_component_states', 'user_id'],
	['user_recall_coverage_misses', 'user_id'],
	['user_gap_builder_runs', 'user_id'],
	['user_chain_gaps', 'user_id'],
	['user_learning_evidence', 'user_id'],
	['user_question_attempts', 'user_id'],
	['user_question_drafts', 'user_id'],
	['user_recall_card_reviews', 'user_id'],
	['user_subject_curriculum_scopes', 'user_id'],
	['user_english_literature_selections', 'user_id'],
	['user_profile_subjects', 'user_id'],
	['user_challenge_progress', 'user_id'],
	['user_home_snapshots', 'user_id'],
	['user_profiles', 'uid']
]);
export const ANALYTICS_CLEANUP_TABLES = Object.freeze([
	'analytics_actor_labels',
	'analytics_admin_audit',
	'analytics_ai_summaries',
	'analytics_events',
	'analytics_model_runs',
	'analytics_requests',
	'analytics_sessions'
]);
const PERSONAL_TABLES = PERSONAL_CLEANUP_TABLES;
const ANALYTICS_TABLES = ANALYTICS_CLEANUP_TABLES;
const SUMMARY_PREDICATE = `(requested_by = ?
	OR instr(COALESCE(prompt_text, ''), ?) > 0
	OR instr(COALESCE(source_snapshot_json, ''), ?) > 0
	OR instr(COALESCE(reasoning_text, ''), ?) > 0
	OR instr(COALESCE(summary_markdown, ''), ?) > 0)`;
const ADMIN_PREDICATE = `(requested_by = ? OR instr(COALESCE(metadata_json, ''), ?) > 0)`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(usage());
		return;
	}
	if (args.userId !== USER_ID) {
		throw new Error(`This tool is locked to the disposable development uid ${USER_ID}.`);
	}
	if (args.write && args.confirm !== CONFIRMATION) {
		throw new Error(`Write mode requires --confirm=${CONFIRMATION}.`);
	}
	if (!args.write && args.confirm) {
		throw new Error('--confirm is only valid together with --write.');
	}

	const before = await inventory(USER_ID);
	if (!before.schema.personalExact || !before.schema.analyticsExact) {
		throw new Error('Cleanup refused because the Personal or Analytics table inventory drifted.');
	}
	if (!before.analytics.safeToDelete) {
		throw new Error(
			'Cleanup refused: matching production analytics or environment-less admin audit rows require manual review.'
		);
	}

	if (!args.write) {
		console.log(
			JSON.stringify(
				{
					schemaVersion: 'dev-auth-cleanup-inventory-v1',
					status: 'dry-run-safe',
					writePerformed: false,
					userId: USER_ID,
					confirmationRequired: CONFIRMATION,
					...before,
					analyticsConsequence: {
						directRows:
							'All direct uid rows and every request/event/model row in a uid-associated development session are in scope.',
						aiSummaries:
							'Only summaries with requested_by equal to the uid or the literal uid in stored source/prompt/reasoning/result text are directly traceable.',
						lineageLimit:
							'The schema does not persist source-session lineage for AI summaries, so a development overview that indirectly aggregated these sessions cannot be identified exactly. Regenerate or disregard development summaries after cleanup.'
					}
				},
				null,
				2
			)
		);
		return;
	}

	await deleteAnalyticsData(USER_ID);
	await deletePersonalData(USER_ID);
	const after = await inventory(USER_ID);
	const remaining =
		Object.values(after.personal.counts).reduce((sum, value) => sum + Number(value), 0) +
		Object.values(after.analytics.counts).reduce((sum, value) => sum + Number(value), 0);
	if (remaining !== 0)
		throw new Error(`Cleanup verification found ${remaining} remaining direct row(s).`);

	console.log(
		JSON.stringify(
			{
				schemaVersion: 'dev-auth-cleanup-result-v1',
				status: 'deleted-and-verified',
				writePerformed: true,
				userId: USER_ID,
				before,
				after
			},
			null,
			2
		)
	);
}

async function inventory(userId) {
	const [personalTables, analyticsTables] = await Promise.all([
		d1Rows(
			`SELECT name FROM sqlite_master
			  WHERE type = 'table' AND name LIKE 'user_%' ORDER BY name`,
			[],
			{ binding: PERSONAL_BINDING }
		),
		d1Rows(
			`SELECT name FROM sqlite_master
			  WHERE type = 'table' AND name LIKE 'analytics_%' ORDER BY name`,
			[],
			{ binding: ANALYTICS_BINDING }
		)
	]);
	const actualPersonalTables = personalTables.map((row) => row.name);
	const actualAnalyticsTables = analyticsTables.map((row) => row.name);
	const expectedPersonalTables = PERSONAL_TABLES.map(([table]) => table).sort();
	const expectedAnalyticsTables = [...ANALYTICS_TABLES].sort();
	const personalExact = sameStrings(actualPersonalTables, expectedPersonalTables);
	const analyticsExact = sameStrings(actualAnalyticsTables, expectedAnalyticsTables);
	if (!personalExact || !analyticsExact) {
		return {
			schema: {
				personalExact,
				analyticsExact,
				expectedPersonalTables,
				actualPersonalTables,
				expectedAnalyticsTables,
				actualAnalyticsTables
			},
			personal: { counts: {} },
			analytics: { counts: {}, risks: {}, safeToDelete: false }
		};
	}
	const [personal, analytics] = await Promise.all([
		personalInventory(userId),
		analyticsInventory(userId)
	]);
	return {
		schema: {
			personalExact,
			analyticsExact,
			expectedPersonalTables,
			actualPersonalTables,
			expectedAnalyticsTables,
			actualAnalyticsTables
		},
		personal,
		analytics
	};
}

export async function devAuthCleanupInventory(userId = USER_ID) {
	if (userId !== USER_ID) {
		throw new Error(`Cleanup inventory is locked to the disposable development uid ${USER_ID}.`);
	}
	return inventory(userId);
}

async function personalInventory(userId) {
	const sql = `SELECT ${PERSONAL_TABLES.map(
		([table, column]) => `(SELECT COUNT(*) FROM ${table} WHERE ${column} = ?) AS ${table}`
	).join(',\n')}`;
	const [counts = {}] = await d1Rows(
		sql,
		PERSONAL_TABLES.map(() => userId),
		{
			binding: PERSONAL_BINDING
		}
	);
	return {
		counts: Object.fromEntries(
			PERSONAL_TABLES.map(([table]) => [table, Number(counts[table] ?? 0)])
		),
		total: PERSONAL_TABLES.reduce((sum, [table]) => sum + Number(counts[table] ?? 0), 0)
	};
}

async function analyticsInventory(userId) {
	const targetCte = targetSessionsCte();
	const actorKey = userActorKey(userId);
	const summaryParams = Array(5).fill(userId);
	const adminParams = Array(2).fill(userId);
	const [counts = {}] = await d1Rows(
		`${targetCte}
		 SELECT
		  (SELECT COUNT(*) FROM analytics_actor_labels
		    WHERE actor_key = ?) AS analytics_actor_labels,
		  (SELECT COUNT(*) FROM target_sessions) AS analytics_sessions,
		  (SELECT COUNT(*) FROM analytics_requests
		    WHERE session_id IN (SELECT session_id FROM target_sessions)) AS analytics_requests,
		  (SELECT COUNT(*) FROM analytics_events
		    WHERE user_id = ? OR session_id IN (SELECT session_id FROM target_sessions)) AS analytics_events,
		  (SELECT COUNT(*) FROM analytics_model_runs
		    WHERE user_id = ? OR session_id IN (SELECT session_id FROM target_sessions)) AS analytics_model_runs,
		  (SELECT COUNT(*) FROM analytics_ai_summaries WHERE ${SUMMARY_PREDICATE}) AS analytics_ai_summaries,
		  (SELECT COUNT(*) FROM analytics_admin_audit WHERE ${ADMIN_PREDICATE}) AS analytics_admin_audit`,
		[userId, userId, userId, actorKey, userId, userId, ...summaryParams, ...adminParams],
		{ binding: ANALYTICS_BINDING }
	);
	const [risks = {}] = await d1Rows(
		`${targetCte}
		 SELECT
		  (SELECT COUNT(*) FROM analytics_sessions
		    WHERE session_id IN (SELECT session_id FROM target_sessions)
		      AND environment <> 'development') AS non_development_sessions,
		  (SELECT COUNT(*) FROM analytics_requests
		    WHERE session_id IN (SELECT session_id FROM target_sessions)
		      AND environment <> 'development') AS non_development_requests,
		  (SELECT COUNT(*) FROM analytics_events
		    WHERE (user_id = ? OR session_id IN (SELECT session_id FROM target_sessions))
		      AND environment <> 'development') AS non_development_events,
		  (SELECT COUNT(*) FROM analytics_model_runs
		    WHERE (user_id = ? OR session_id IN (SELECT session_id FROM target_sessions))
		      AND environment <> 'development') AS non_development_model_runs,
		  (SELECT COUNT(*) FROM analytics_ai_summaries
		    WHERE ${SUMMARY_PREDICATE} AND environment <> 'development') AS non_development_ai_summaries,
		  (SELECT COUNT(*) FROM analytics_admin_audit WHERE ${ADMIN_PREDICATE}) AS environmentless_admin_audits`,
		[userId, userId, userId, userId, userId, ...summaryParams, ...adminParams],
		{ binding: ANALYTICS_BINDING }
	);
	const normalizedCounts = Object.fromEntries(
		ANALYTICS_TABLES.map((table) => [table, Number(counts[table] ?? 0)])
	);
	const normalizedRisks = Object.fromEntries(
		Object.entries(risks).map(([key, value]) => [key, Number(value ?? 0)])
	);
	return {
		counts: normalizedCounts,
		total: Object.values(normalizedCounts).reduce((sum, value) => sum + value, 0),
		risks: normalizedRisks,
		safeToDelete: Object.values(normalizedRisks).every((value) => value === 0)
	};
}

async function deleteAnalyticsData(userId) {
	await d1Batch(analyticsCleanupStatements(userId), { binding: ANALYTICS_BINDING });
}

export function analyticsCleanupStatements(userId = USER_ID) {
	const actorKey = userActorKey(userId);
	const summaryParams = Array(5).fill(userId);
	const adminParams = Array(2).fill(userId);
	return [
		{
			sql: `CREATE TABLE _ux_cleanup_release_guard (
				  singleton INTEGER PRIMARY KEY CHECK (singleton = 1)
				)`
		},
		{
			sql: `CREATE TABLE _ux_cleanup_target_sessions (
				  session_id TEXT PRIMARY KEY,
				  environment TEXT NOT NULL CHECK (environment = 'development')
				)`
		},
		{
			sql: `INSERT INTO _ux_cleanup_target_sessions (session_id, environment)
				      ${targetSessionsCte()}
				      SELECT s.session_id, s.environment FROM analytics_sessions s
				       WHERE s.session_id IN (SELECT session_id FROM target_sessions)`,
			params: [userId, userId, userId]
		},
		{
			sql: `INSERT INTO _ux_cleanup_release_guard (singleton)
				      SELECT CASE WHEN
				       NOT EXISTS (
				         SELECT 1 FROM analytics_events
				          WHERE (user_id = ? OR session_id IN (SELECT session_id FROM _ux_cleanup_target_sessions))
				            AND environment <> 'development'
				       )
				       AND NOT EXISTS (
				         SELECT 1 FROM analytics_model_runs
				          WHERE (user_id = ? OR session_id IN (SELECT session_id FROM _ux_cleanup_target_sessions))
				            AND environment <> 'development'
				       )
				       AND NOT EXISTS (
				         SELECT 1 FROM analytics_ai_summaries
				          WHERE ${SUMMARY_PREDICATE} AND environment <> 'development'
				       )
				       AND NOT EXISTS (SELECT 1 FROM analytics_admin_audit WHERE ${ADMIN_PREDICATE})
				      THEN 1 ELSE 0 END`,
			params: [userId, userId, ...summaryParams, ...adminParams]
		},
		{
			sql: `DELETE FROM analytics_events
				       WHERE user_id = ?
				          OR session_id IN (SELECT session_id FROM _ux_cleanup_target_sessions)`,
			params: [userId]
		},
		{
			sql: `DELETE FROM analytics_requests
				       WHERE session_id IN (SELECT session_id FROM _ux_cleanup_target_sessions)`
		},
		{
			sql: `DELETE FROM analytics_model_runs
				       WHERE user_id = ?
				          OR session_id IN (SELECT session_id FROM _ux_cleanup_target_sessions)`,
			params: [userId]
		},
		{
			sql: `DELETE FROM analytics_sessions
				       WHERE session_id IN (SELECT session_id FROM _ux_cleanup_target_sessions)`
		},
		{
			sql: `DELETE FROM analytics_ai_summaries WHERE ${SUMMARY_PREDICATE}`,
			params: summaryParams
		},
		{
			sql: `DELETE FROM analytics_admin_audit WHERE ${ADMIN_PREDICATE}`,
			params: adminParams
		},
		{
			sql: 'DELETE FROM analytics_actor_labels WHERE actor_key = ?',
			params: [actorKey]
		},
		{ sql: 'DELETE FROM _ux_cleanup_release_guard' },
		{
			sql: `INSERT INTO _ux_cleanup_release_guard (singleton)
				      SELECT CASE WHEN
				       NOT EXISTS (SELECT 1 FROM analytics_actor_labels WHERE actor_key = ?)
				       AND NOT EXISTS (SELECT 1 FROM analytics_sessions WHERE user_id = ?)
				       AND NOT EXISTS (SELECT 1 FROM analytics_events WHERE user_id = ?)
				       AND NOT EXISTS (SELECT 1 FROM analytics_model_runs WHERE user_id = ?)
				       AND NOT EXISTS (SELECT 1 FROM analytics_ai_summaries WHERE ${SUMMARY_PREDICATE})
				       AND NOT EXISTS (SELECT 1 FROM analytics_admin_audit WHERE ${ADMIN_PREDICATE})
				      THEN 1 ELSE 0 END`,
			params: [actorKey, userId, userId, userId, ...summaryParams, ...adminParams]
		},
		{ sql: 'DROP TABLE _ux_cleanup_target_sessions' },
		{ sql: 'DROP TABLE _ux_cleanup_release_guard' }
	];
}

async function deletePersonalData(userId) {
	await d1Batch(personalCleanupStatements(userId), { binding: PERSONAL_BINDING });
}

export function personalCleanupStatements(userId = USER_ID) {
	const expectedNames = PERSONAL_TABLES.map(([table]) => `'${table}'`).join(', ');
	const allAbsent = PERSONAL_TABLES.map(
		([table, column]) => `NOT EXISTS (SELECT 1 FROM ${table} WHERE ${column} = ?)`
	).join('\nAND ');
	return [
		{
			sql: `CREATE TABLE _ux_cleanup_release_guard (
				  singleton INTEGER PRIMARY KEY CHECK (singleton = 1)
				)`
		},
		{
			sql: `INSERT INTO _ux_cleanup_release_guard (singleton)
				      SELECT CASE WHEN
				       (SELECT COUNT(*) FROM sqlite_master
				         WHERE type = 'table' AND name LIKE 'user_%') = ${PERSONAL_TABLES.length}
				       AND NOT EXISTS (
				         SELECT 1 FROM sqlite_master
				          WHERE type = 'table' AND name LIKE 'user_%' AND name NOT IN (${expectedNames})
				       )
				      THEN 1 ELSE 0 END`
		},
		...PERSONAL_TABLES.map(([table, column]) => ({
			sql: `DELETE FROM ${table} WHERE ${column} = ?`,
			params: [userId]
		})),
		{ sql: 'DELETE FROM _ux_cleanup_release_guard' },
		{
			sql: `INSERT INTO _ux_cleanup_release_guard (singleton)
				      SELECT CASE WHEN ${allAbsent} THEN 1 ELSE 0 END`,
			params: PERSONAL_TABLES.map(() => userId)
		},
		{ sql: 'DROP TABLE _ux_cleanup_release_guard' }
	];
}

function targetSessionsCte() {
	return `WITH target_sessions AS (
	 SELECT session_id FROM analytics_sessions WHERE user_id = ?
	 UNION
	 SELECT session_id FROM analytics_events WHERE user_id = ?
	 UNION
	 SELECT session_id FROM analytics_model_runs WHERE user_id = ? AND session_id IS NOT NULL
	)`;
}

function userActorKey(userId) {
	return `user:${userId}`;
}

function sameStrings(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function parseArgs(argv) {
	const value = (name, fallback = null) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	const known = new Set(['--help', '-h', '--write']);
	for (const argument of argv) {
		if (!known.has(argument) && !/^--(?:user-id|confirm)=/.test(argument)) {
			throw new Error(`Unknown option ${argument}.`);
		}
	}
	return {
		help: argv.includes('--help') || argv.includes('-h'),
		write: argv.includes('--write'),
		userId: value('user-id', USER_ID),
		confirm: value('confirm')
	};
}

function usage() {
	return `Usage: node scripts/cleanup-dev-auth-data.mjs [options]

Default: read-only inventory of every Personal row and directly traceable
Analytics row for the fixed disposable uid ${USER_ID}.

Options:
  --user-id=${USER_ID}  optional explicit uid; no other uid is accepted
  --write                         execute the two idempotent D1 cleanup batches
  --confirm=${CONFIRMATION}  mandatory with --write
  --help                          show this help`;
}
