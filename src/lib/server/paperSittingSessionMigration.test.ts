import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { clearQuestionBindings, setPersonalDb } from './bindings';
import { d1PaperSittingSessionStore, type PaperSittingSessionRecord } from './paperSittingSession';

const migration = readFileSync(
	new URL('../../../migrations/personal/0008_paper_sitting_sessions.sql', import.meta.url),
	'utf8'
);

function insertSession(db: DatabaseSync, overrides: Record<string, unknown> = {}) {
	const row = {
		id: 'ps-test',
		user_id: 'learner-1',
		nonce_hash: 'hash',
		paper_slug: 'approved-paper',
		source_document_id: 'source-approved-paper',
		review_fingerprint: 'fingerprint',
		reviewed_at: '2026-07-16T10:00:00.000Z',
		duration_minutes: 75,
		total_marks: 70,
		question_groups_json: '[{"questionRef":"01","partRefs":["01.1"]}]',
		status: 'in_progress',
		started_at_ms: 1000,
		submitted_at_ms: null,
		completed_at_ms: null,
		transition_token: 'transition-1',
		...overrides
	};
	db.prepare(
		`INSERT INTO user_paper_sitting_sessions (
		   id, user_id, nonce_hash, paper_slug, source_document_id,
		   review_fingerprint, reviewed_at, duration_minutes, total_marks,
		   question_groups_json, status, started_at_ms, submitted_at_ms,
		   completed_at_ms, transition_token
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		row.id,
		row.user_id,
		row.nonce_hash,
		row.paper_slug,
		row.source_document_id,
		row.review_fingerprint,
		row.reviewed_at,
		row.duration_minutes,
		row.total_marks,
		row.question_groups_json,
		row.status,
		row.started_at_ms,
		row.submitted_at_ms,
		row.completed_at_ms,
		row.transition_token
	);
}

describe('personal paper sitting migration', () => {
	it('creates the server-owned lifecycle table and enforces one-way state invariants', () => {
		const db = new DatabaseSync(':memory:');
		db.exec(migration);
		insertSession(db);

		expect(
			db.prepare('SELECT user_id, status, answers_json FROM user_paper_sitting_sessions').get()
		).toEqual({ user_id: 'learner-1', status: 'in_progress', answers_json: '{}' });
		expect(() =>
			insertSession(db, {
				id: 'invalid-submitted',
				status: 'submitted',
				submitted_at_ms: null
			})
		).toThrow();
		expect(() =>
			insertSession(db, {
				id: 'invalid-complete',
				status: 'complete',
				submitted_at_ms: 2000,
				completed_at_ms: null
			})
		).toThrow();
		expect(() =>
			insertSession(db, {
				id: 'invalid-json',
				question_groups_json: 'not json'
			})
		).toThrow();

		db.prepare(
			`UPDATE user_paper_sitting_sessions
			 SET status = 'submitted', submitted_at_ms = 2000, answers_json = '{"01.1":"answer"}'
			 WHERE id = 'ps-test'`
		).run();
		expect(() =>
			db
				.prepare(
					"UPDATE user_paper_sitting_sessions SET status = 'in_progress' WHERE id = 'ps-test'"
				)
				.run()
		).toThrow(/status cannot move backwards/);
		expect(() =>
			db
				.prepare(
					'UPDATE user_paper_sitting_sessions SET answers_json = \'{"01.1":"changed"}\' WHERE id = \'ps-test\''
				)
				.run()
		).toThrow(/locked submission are immutable/);
		expect(() =>
			db
				.prepare(
					"UPDATE user_paper_sitting_sessions SET user_id = 'learner-2' WHERE id = 'ps-test'"
				)
				.run()
		).toThrow(/identity and locked submission are immutable/);
	});

	it('round-trips the production D1 store and its optimistic transition fence', async () => {
		const db = new DatabaseSync(':memory:');
		db.exec(migration);
		setPersonalDb({
			prepare(sql: string) {
				let params: unknown[] = [];
				const statement = {
					bind(...values: unknown[]) {
						params = values;
						return statement;
					},
					async run() {
						db.prepare(sql).run(...(params as never[]));
						return { success: true, meta: {} };
					},
					async all<T>() {
						return {
							success: true,
							results: db.prepare(sql).all(...(params as never[])) as T[],
							meta: {}
						};
					}
				};
				return statement;
			}
		} as never);
		const record: PaperSittingSessionRecord = {
			id: 'ps-store',
			userId: 'learner-1',
			nonceHash: 'nonce-hash',
			paperSlug: 'approved-paper',
			sourceDocumentId: 'source-approved-paper',
			reviewFingerprint: 'review-fingerprint',
			reviewedAt: '2026-07-16T10:00:00.000Z',
			durationMinutes: 75,
			totalMarks: 1,
			questionGroups: [{ questionRef: '01', partRefs: ['01.1'] }],
			status: 'in_progress',
			startedAtMs: 1_000,
			submittedAtMs: null,
			completedAtMs: null,
			answers: {},
			responseDurationsMs: {},
			draftRevision: 0,
			activePartRef: null,
			activePartStartedAtMs: null,
			results: {},
			gradeResponses: {},
			nextQuestionIndex: 0,
			gradedQuestionRefs: [],
			inFlightClaimId: null,
			inFlightQuestionRef: null,
			inFlightStartedAtMs: null,
			version: 0,
			transitionToken: 'transition-0'
		};

		try {
			await d1PaperSittingSessionStore.insert(record);
			await expect(d1PaperSittingSessionStore.get(record.id)).resolves.toEqual(record);
			const next = {
				...record,
				status: 'submitted' as const,
				submittedAtMs: 2_000,
				version: 1,
				transitionToken: 'transition-1'
			};
			await expect(d1PaperSittingSessionStore.compareAndSwap(record.id, 0, next)).resolves.toBe(
				true
			);
			await expect(
				d1PaperSittingSessionStore.compareAndSwap(record.id, 0, {
					...next,
					version: 2,
					transitionToken: 'losing-transition'
				})
			).resolves.toBe(false);
		} finally {
			clearQuestionBindings();
		}
	});
});
