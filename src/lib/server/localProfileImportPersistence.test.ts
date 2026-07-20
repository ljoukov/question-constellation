import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearnerSubjectInput } from './personalLearning';
import { clearQuestionBindings, setPersonalDb } from './bindings';

vi.mock('./curriculumCatalog', () => ({
	getCurriculumProfileSnapshot: vi.fn(async () => ({
		qualification: 'GCSE',
		subjects: [
			'Biology',
			'Chemistry',
			'Physics',
			'Computer Science',
			'Geography',
			'History',
			'English Language',
			'English Literature'
		].map((subject) => ({
			subject,
			boards: [
				{ name: subject === 'History' ? 'Edexcel' : subject.startsWith('English') ? 'OCR' : 'AQA' }
			]
		}))
	}))
}));

import {
	consumeLocalProfileImportPending,
	getLearnerProfileSettingsForLocalImport,
	updateEnglishLiteratureSelections,
	updateLearnerSubjects
} from './personalLearning';

const personalMigration = [
	readFileSync(
		new URL('../../../migrations/personal/0001_personal_learning.sql', import.meta.url),
		'utf8'
	),
	readFileSync(
		new URL('../../../migrations/personal/0002_english_literature_selections.sql', import.meta.url),
		'utf8'
	),
	readFileSync(
		new URL(
			'../../../migrations/personal/0014_local_profile_import_provenance.sql',
			import.meta.url
		),
		'utf8'
	)
].join('\n');

function sqliteBinding(db: DatabaseSync, failAfterSubjectWrites: number | null = null) {
	let subjectWrites = 0;
	return {
		prepare(sql: string) {
			let params: unknown[] = [];
			const statement = {
				bind(...values: unknown[]) {
					params = values;
					return statement;
				},
				async run() {
					if (sql.includes('INSERT INTO user_profile_subjects')) {
						subjectWrites += 1;
						if (failAfterSubjectWrites !== null && subjectWrites > failAfterSubjectWrites) {
							throw new Error('injected partial subject write failure');
						}
					}
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
	} as never;
}

function subject(name: string, overrides: Partial<LearnerSubjectInput> = {}): LearnerSubjectInput {
	return {
		subject: name,
		board: name === 'History' ? 'Edexcel' : name.startsWith('English') ? 'OCR' : 'AQA',
		course: ['Biology', 'Chemistry', 'Physics'].includes(name)
			? 'Combined Science'
			: 'GCSE Subject',
		tier: 'Higher',
		enabled: false,
		currentGrade: null,
		targetGrade: null,
		...overrides
	};
}

function profileSubjects(...enabled: LearnerSubjectInput[]) {
	const enabledByName = new Map(enabled.map((entry) => [entry.subject, entry]));
	return [
		'Biology',
		'Chemistry',
		'Physics',
		'Computer Science',
		'Geography',
		'History',
		'English Language',
		'English Literature'
	].map((name) => enabledByName.get(name) ?? subject(name));
}

let db: DatabaseSync;

beforeEach(() => {
	db = new DatabaseSync(':memory:');
	db.exec(personalMigration);
	db.prepare(
		`INSERT INTO user_profiles (
		   uid, email, selected_board, selected_subject, selected_tier
		 ) VALUES (?, ?, 'AQA', 'Biology', 'Higher')`
	).run('learner-1', 'learner-1@example.test');
	setPersonalDb(sqliteBinding(db));
});

afterEach(() => {
	clearQuestionBindings();
	db.close();
});

describe('local profile import persistence', () => {
	it('cannot let a delayed older import or direct save replace stronger stored data', async () => {
		await updateLearnerSubjects({
			userId: 'learner-1',
			subjects: profileSubjects(
				subject('History', {
					enabled: true,
					currentGrade: '7',
					targetGrade: '9'
				})
			),
			updatePrimaryProfile: false,
			preserveExistingRows: true
		});
		await updateEnglishLiteratureSelections({
			userId: 'learner-1',
			selections: {
				modernText: 'Animal Farm',
				nineteenthCenturyNovel: 'A Christmas Carol',
				poetryCluster: 'Conflict',
				shakespearePlay: 'Macbeth'
			},
			preserveExistingSelections: true
		});

		// This is the delayed older request: its full stale payload must not
		// disable History, lower grades, or replace the newer Literature row.
		await updateLearnerSubjects({
			userId: 'learner-1',
			subjects: profileSubjects(
				subject('History', {
					board: 'AQA',
					enabled: false,
					currentGrade: '4',
					targetGrade: '5'
				})
			),
			updatePrimaryProfile: false,
			preserveExistingRows: true
		});
		await updateEnglishLiteratureSelections({
			userId: 'learner-1',
			selections: {
				modernText: 'An Inspector Calls',
				nineteenthCenturyNovel: null,
				poetryCluster: 'Love and Relationships',
				shakespearePlay: null
			},
			preserveExistingSelections: true
		});

		// A direct account save remains authoritative over another stale import.
		await updateLearnerSubjects({
			userId: 'learner-1',
			subjects: profileSubjects(
				subject('History', {
					enabled: true,
					currentGrade: '8',
					targetGrade: '9'
				})
			)
		});
		await updateEnglishLiteratureSelections({
			userId: 'learner-1',
			selections: {
				modernText: 'Never Let Me Go',
				nineteenthCenturyNovel: 'Great Expectations',
				poetryCluster: 'Youth and Age',
				shakespearePlay: 'Much Ado About Nothing'
			}
		});
		await updateLearnerSubjects({
			userId: 'learner-1',
			subjects: profileSubjects(
				subject('History', {
					enabled: true,
					currentGrade: '3',
					targetGrade: '4'
				})
			),
			updatePrimaryProfile: false,
			preserveExistingRows: true
		});
		await updateEnglishLiteratureSelections({
			userId: 'learner-1',
			selections: {
				modernText: 'An Inspector Calls',
				nineteenthCenturyNovel: null,
				poetryCluster: null,
				shakespearePlay: null
			},
			preserveExistingSelections: true
		});

		const storedSubject = db
			.prepare(
				`SELECT board, tier, enabled, current_grade, target_grade
				 FROM user_profile_subjects
				 WHERE user_id = ? AND subject = 'History'`
			)
			.get('learner-1') as Record<string, unknown>;
		expect(storedSubject).toMatchObject({
			board: 'Edexcel',
			tier: 'Higher',
			enabled: 1,
			current_grade: '8',
			target_grade: '9'
		});
		const storedLiterature = db
			.prepare(
				`SELECT modern_text, nineteenth_century_novel, poetry_cluster, shakespeare_play
				 FROM user_english_literature_selections
				 WHERE user_id = ?`
			)
			.get('learner-1') as Record<string, unknown>;
		expect(storedLiterature).toEqual({
			modern_text: 'Never Let Me Go',
			nineteenth_century_novel: 'Great Expectations',
			poetry_cluster: 'Youth and Age',
			shakespeare_play: 'Much Ado About Nothing'
		});
	});

	it('keeps first-import provenance until all subject rows land, then finalizes the primary', async () => {
		setPersonalDb(sqliteBinding(db, 0));
		const separateBiologyProfile = profileSubjects(
			subject('Biology', {
				enabled: true,
				course: 'Separate Science',
				tier: 'Foundation'
			})
		);

		await expect(
			updateLearnerSubjects({
				userId: 'learner-1',
				subjects: separateBiologyProfile,
				updatePrimaryProfile: true,
				updatePrimaryProfileBeforeSubjects: false,
				expectedPrimaryProfile: {
					board: 'AQA',
					subject: 'Biology',
					tier: 'Higher'
				},
				preserveExistingRows: true
			})
		).rejects.toThrow('injected partial subject write failure');

		expect(
			db
				.prepare(
					`SELECT selected_board, selected_subject, selected_tier,
					        local_profile_import_pending
					 FROM user_profiles WHERE uid = ?`
				)
				.get('learner-1')
		).toEqual({
			selected_board: 'AQA',
			selected_subject: 'Biology',
			selected_tier: 'Higher',
			local_profile_import_pending: 1
		});

		setPersonalDb(sqliteBinding(db));
		await updateLearnerSubjects({
			userId: 'learner-1',
			subjects: separateBiologyProfile,
			updatePrimaryProfile: true,
			updatePrimaryProfileBeforeSubjects: false,
			expectedPrimaryProfile: {
				board: 'AQA',
				subject: 'Biology',
				tier: 'Higher'
			},
			preserveExistingRows: true
		});

		expect(
			db
				.prepare(
					`SELECT course, tier, enabled
					 FROM user_profile_subjects
					 WHERE user_id = ? AND subject = 'Biology'`
				)
				.get('learner-1')
		).toEqual({ course: 'Separate Science', tier: 'Foundation', enabled: 1 });
		expect(
			db
				.prepare(
					`SELECT selected_subject, selected_tier, local_profile_import_pending
					 FROM user_profiles WHERE uid = ?`
				)
				.get('learner-1')
		).toEqual({
			selected_subject: 'Biology',
			selected_tier: 'Foundation',
			local_profile_import_pending: 0
		});
	});

	it('CAS-protects an explicit legacy primary with no subject rows', async () => {
		db.prepare(
			`UPDATE user_profiles
			 SET selected_board = 'Edexcel', selected_subject = 'History', selected_tier = 'Higher',
			     local_profile_import_pending = 0
			 WHERE uid = ?`
		).run('learner-1');

		await updateLearnerSubjects({
			userId: 'learner-1',
			subjects: profileSubjects(subject('Biology', { enabled: true })),
			updatePrimaryProfile: true,
			updatePrimaryProfileBeforeSubjects: true,
			expectedPrimaryProfile: {
				board: 'AQA',
				subject: 'Biology',
				tier: 'Higher'
			},
			preserveExistingRows: true
		});

		expect(
			db
				.prepare(
					`SELECT selected_board, selected_subject
					 FROM user_profiles WHERE uid = ?`
				)
				.get('learner-1')
		).toEqual({
			selected_board: 'Edexcel',
			selected_subject: 'History'
		});
	});

	it('keeps a profile-loader-created row pending until import consumes it', async () => {
		const user = {
			uid: 'brand-new-learner',
			email: 'brand-new-learner@example.test',
			name: 'New Learner',
			photoUrl: null
		};

		const createdByProfileLoader = await getLearnerProfileSettingsForLocalImport(user);
		const observedByImport = await getLearnerProfileSettingsForLocalImport(user);

		expect(createdByProfileLoader.localProfileImportPending).toBe(true);
		expect(observedByImport.localProfileImportPending).toBe(true);

		await updateLearnerSubjects({
			userId: user.uid,
			subjects: profileSubjects(subject('History', { enabled: true })),
			updatePrimaryProfile: true,
			updatePrimaryProfileBeforeSubjects: false,
			expectedPrimaryProfile: {
				board: 'AQA',
				subject: 'Biology',
				tier: 'Higher'
			},
			preserveExistingRows: true
		});

		expect((await getLearnerProfileSettingsForLocalImport(user)).localProfileImportPending).toBe(
			false
		);
	});

	it('consumes an unchanged first import without materializing subject rows', async () => {
		const userId = 'unchanged-first-import';
		db.prepare(
			`INSERT INTO user_profiles (uid, email, selected_board, selected_subject, selected_tier)
			 VALUES (?, ?, 'AQA', 'Biology', 'Higher')`
		).run(userId, 'unchanged-first-import@example.test');

		await consumeLocalProfileImportPending({
			userId,
			expectedPrimaryProfile: {
				board: 'AQA',
				subject: 'Biology',
				tier: 'Higher'
			}
		});

		expect(
			db
				.prepare(
					`SELECT local_profile_import_pending
					 FROM user_profiles
					 WHERE uid = ?`
				)
				.get(userId)
		).toEqual({ local_profile_import_pending: 0 });
		expect(
			db
				.prepare(
					`SELECT COUNT(*) AS count
					 FROM user_profile_subjects
					 WHERE user_id = ?`
				)
				.get(userId)
		).toEqual({ count: 0 });
	});

	it('does not consume a stale no-op import after the primary profile changes', async () => {
		const userId = 'stale-no-op-import';
		db.prepare(
			`INSERT INTO user_profiles (uid, email, selected_board, selected_subject, selected_tier)
			 VALUES (?, ?, 'AQA', 'Biology', 'Higher')`
		).run(userId, 'stale-no-op-import@example.test');
		db.prepare(
			`UPDATE user_profiles
			 SET selected_board = 'Edexcel', selected_subject = 'History', selected_tier = 'Higher'
			 WHERE uid = ?`
		).run(userId);

		await consumeLocalProfileImportPending({
			userId,
			expectedPrimaryProfile: {
				board: 'AQA',
				subject: 'Biology',
				tier: 'Higher'
			}
		});

		expect(
			db
				.prepare(
					`SELECT selected_board, selected_subject, local_profile_import_pending
					 FROM user_profiles
					 WHERE uid = ?`
				)
				.get(userId)
		).toEqual({
			selected_board: 'Edexcel',
			selected_subject: 'History',
			local_profile_import_pending: 1
		});
	});

	it('recognizes a home-refresh-created profile as import-pending', async () => {
		db.prepare(
			`INSERT INTO user_profiles (uid, email, selected_board, selected_subject)
			 VALUES (?, ?, 'AQA', 'Biology')`
		).run('snapshot-created-learner', 'snapshot-created@example.test');

		const observed = await getLearnerProfileSettingsForLocalImport({
			uid: 'snapshot-created-learner',
			email: 'snapshot-created@example.test',
			name: null,
			photoUrl: null
		});

		expect(observed.localProfileImportPending).toBe(true);
	});
});
