import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnonymousLearnerProfile } from '$lib/anonymousLearnerProfile';
import type { LearnerProfileSettings } from '$lib/server/personalLearning';

const mocks = vi.hoisted(() => ({
	getLearnerProfileSettingsForLocalImport: vi.fn(),
	updateEnglishLiteratureSelections: vi.fn(),
	updateLearnerSubjects: vi.fn()
}));

vi.mock('$lib/server/personalLearning', () => ({
	getLearnerProfileSettingsForLocalImport: mocks.getLearnerProfileSettingsForLocalImport,
	updateEnglishLiteratureSelections: mocks.updateEnglishLiteratureSelections,
	updateLearnerSubjects: mocks.updateLearnerSubjects
}));

import { POST } from './+server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

const account: LearnerProfileSettings = {
	profile: {
		uid: user.uid,
		email: user.email,
		name: user.name,
		photoUrl: null,
		selectedBoard: 'Edexcel',
		selectedQualification: 'GCSE',
		selectedSubject: 'History',
		selectedTier: 'Foundation',
		themePreference: 'auto'
	},
	subjects: [
		{
			subject: 'History',
			board: 'Edexcel',
			qualification: 'GCSE',
			course: 'GCSE Subject',
			tier: 'Foundation',
			enabled: true,
			currentGrade: '6',
			targetGrade: '8'
		},
		{
			subject: 'Biology',
			board: 'AQA',
			qualification: 'GCSE',
			course: 'Combined Science',
			tier: 'Higher',
			enabled: false,
			currentGrade: null,
			targetGrade: null
		},
		{
			subject: 'English Literature',
			board: 'OCR',
			qualification: 'GCSE',
			course: 'GCSE Subject',
			tier: 'Higher',
			enabled: false,
			currentGrade: null,
			targetGrade: null
		}
	],
	subjectOptions: ['History', 'Biology', 'English Literature'],
	englishLiteratureSelections: {
		board: 'OCR',
		specificationCode: 'J352',
		modernText: 'Animal Farm',
		nineteenthCenturyNovel: null,
		poetryCluster: 'Conflict',
		shakespearePlay: null
	}
};

const guest: AnonymousLearnerProfile = {
	version: 1,
	updatedAt: 123,
	pendingSync: true,
	subjects: [
		{
			subject: 'History',
			board: 'AQA',
			qualification: 'GCSE',
			course: 'GCSE Subject',
			tier: 'Higher',
			enabled: false,
			currentGrade: null,
			targetGrade: null
		},
		{
			subject: 'Biology',
			board: 'AQA',
			qualification: 'GCSE',
			course: 'Separate Science',
			tier: 'Foundation',
			enabled: true,
			currentGrade: '5',
			targetGrade: '7'
		},
		{
			subject: 'English Literature',
			board: 'OCR',
			qualification: 'GCSE',
			course: 'GCSE Subject',
			tier: 'Higher',
			enabled: true,
			currentGrade: null,
			targetGrade: '9'
		}
	],
	englishLiteratureSelections: {
		board: 'OCR',
		specificationCode: 'J352',
		modernText: 'An Inspector Calls',
		nineteenthCenturyNovel: 'A Christmas Carol',
		poetryCluster: 'Love and Relationships',
		shakespearePlay: 'Macbeth'
	}
};

function post(profile: unknown, authenticated = true) {
	return POST({
		locals: { user: authenticated ? user : null },
		request: new Request('http://localhost/api/profile/import-local', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ profile })
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getLearnerProfileSettingsForLocalImport.mockResolvedValue({
		settings: account,
		persistedSubjectNames: ['History'],
		localProfileImportPending: false
	});
	mocks.updateEnglishLiteratureSelections.mockResolvedValue(undefined);
	mocks.updateLearnerSubjects.mockResolvedValue(undefined);
});

describe('POST /api/profile/import-local', () => {
	it('requires authentication and validates the complete anonymous profile', async () => {
		expect((await post(guest, false)).status).toBe(401);
		expect((await post({ ...guest, pendingSync: 'yes' })).status).toBe(400);
		expect(mocks.getLearnerProfileSettingsForLocalImport).not.toHaveBeenCalled();
		expect(mocks.updateLearnerSubjects).not.toHaveBeenCalled();
	});

	it('unions two guest subjects with the account without replacing established choices', async () => {
		const response = await post(guest);

		expect(response.status).toBe(200);
		await expect(response.clone().json()).resolves.toMatchObject({ snapshotChanged: true });
		expect(mocks.updateLearnerSubjects).toHaveBeenCalledWith({
			userId: user.uid,
			subjects: [
				account.subjects[0],
				{
					...account.subjects[1],
					course: 'Separate Science',
					tier: 'Foundation',
					enabled: true,
					currentGrade: '5',
					targetGrade: '7'
				},
				{
					...account.subjects[2],
					enabled: true,
					targetGrade: '9'
				}
			],
			updatePrimaryProfile: false,
			updatePrimaryProfileBeforeSubjects: false,
			expectedPrimaryProfile: null,
			preserveExistingRows: true
		});
		expect(mocks.updateEnglishLiteratureSelections).toHaveBeenCalledWith({
			userId: user.uid,
			selections: {
				board: 'OCR',
				specificationCode: 'J352',
				modernText: 'Animal Farm',
				nineteenthCenturyNovel: 'A Christmas Carol',
				poetryCluster: 'Conflict',
				shakespearePlay: 'Macbeth'
			},
			preserveExistingSelections: true
		});
		expect(account.profile.selectedSubject).toBe('History');
	});

	it('does not write for an empty guest profile', async () => {
		const response = await post({
			...guest,
			subjects: [],
			englishLiteratureSelections: {
				board: 'OCR',
				specificationCode: 'J352',
				modernText: null,
				nineteenthCenturyNovel: null,
				poetryCluster: null,
				shakespearePlay: null
			}
		});

		expect(response.status).toBe(200);
		await expect(response.clone().json()).resolves.toMatchObject({ snapshotChanged: false });
		expect(mocks.updateLearnerSubjects).not.toHaveBeenCalled();
		expect(mocks.updateEnglishLiteratureSelections).not.toHaveBeenCalled();
	});

	it('makes a successful retry a no-op', async () => {
		const firstResponse = await post(guest);
		expect(firstResponse.status).toBe(200);
		expect(mocks.updateLearnerSubjects).toHaveBeenLastCalledWith(
			expect.objectContaining({ updatePrimaryProfile: false })
		);

		const importedSubjects = mocks.updateLearnerSubjects.mock.calls[0][0].subjects;
		const importedSelections = mocks.updateEnglishLiteratureSelections.mock.calls[0][0].selections;
		mocks.getLearnerProfileSettingsForLocalImport.mockResolvedValue({
			settings: {
				...account,
				subjects: importedSubjects,
				englishLiteratureSelections: importedSelections
			},
			persistedSubjectNames: importedSubjects.map(
				(subject: { subject: string }) => subject.subject
			),
			localProfileImportPending: false
		});

		const retryResponse = await post(guest);
		expect(retryResponse.status).toBe(200);
		expect(mocks.updateLearnerSubjects).toHaveBeenCalledTimes(1);
		expect(mocks.updateEnglishLiteratureSelections).toHaveBeenCalledTimes(1);
	});

	it('allows an account without persisted subjects to initialize its primary profile', async () => {
		const freshAccount: LearnerProfileSettings = {
			...account,
			profile: {
				...account.profile,
				selectedBoard: 'AQA',
				selectedSubject: 'Biology',
				selectedTier: 'Higher'
			},
			subjects: [
				{
					...account.subjects[1],
					enabled: true
				},
				{
					subject: 'Chemistry',
					board: 'AQA',
					qualification: 'GCSE',
					course: 'Combined Science',
					tier: 'Higher',
					enabled: true,
					currentGrade: null,
					targetGrade: null
				},
				{
					...account.subjects[0],
					enabled: false,
					currentGrade: null,
					targetGrade: null
				}
			]
		};
		const historyGuest: AnonymousLearnerProfile = {
			...guest,
			subjects: [
				{
					...guest.subjects[1],
					enabled: false,
					currentGrade: null,
					targetGrade: null
				},
				{
					...freshAccount.subjects[1],
					qualification: 'GCSE',
					enabled: false
				},
				{
					...guest.subjects[0],
					enabled: true,
					currentGrade: '6',
					targetGrade: '8'
				}
			]
		};
		mocks.getLearnerProfileSettingsForLocalImport.mockResolvedValue({
			settings: freshAccount,
			persistedSubjectNames: [],
			localProfileImportPending: true
		});

		const response = await post(historyGuest);

		expect(response.status).toBe(200);
		expect(mocks.updateLearnerSubjects).toHaveBeenCalledWith({
			userId: user.uid,
			subjects: [
				{
					...freshAccount.subjects[0],
					course: 'Separate Science',
					tier: 'Foundation',
					enabled: false
				},
				{
					...freshAccount.subjects[1],
					enabled: false
				},
				{
					...freshAccount.subjects[2],
					board: 'AQA',
					tier: 'Higher',
					enabled: true,
					currentGrade: '6',
					targetGrade: '8'
				}
			],
			updatePrimaryProfile: true,
			updatePrimaryProfileBeforeSubjects: false,
			expectedPrimaryProfile: {
				board: 'AQA',
				subject: 'Biology',
				tier: 'Higher'
			},
			preserveExistingRows: true
		});
	});

	it('materializes an unchanged first import before consuming its provenance marker', async () => {
		const defaultSubjects = [
			{
				subject: 'Biology',
				board: 'AQA',
				qualification: 'GCSE',
				course: 'Combined Science',
				tier: 'Higher',
				enabled: true,
				currentGrade: null,
				targetGrade: null
			},
			{
				subject: 'Chemistry',
				board: 'AQA',
				qualification: 'GCSE',
				course: 'Combined Science',
				tier: 'Higher',
				enabled: true,
				currentGrade: null,
				targetGrade: null
			},
			{
				subject: 'Physics',
				board: 'AQA',
				qualification: 'GCSE',
				course: 'Combined Science',
				tier: 'Higher',
				enabled: true,
				currentGrade: null,
				targetGrade: null
			}
		] satisfies LearnerProfileSettings['subjects'];
		mocks.getLearnerProfileSettingsForLocalImport.mockResolvedValue({
			settings: {
				...account,
				profile: {
					...account.profile,
					selectedBoard: 'AQA',
					selectedSubject: 'Biology',
					selectedTier: 'Higher'
				},
				subjects: defaultSubjects,
				englishLiteratureSelections: {
					board: 'OCR',
					specificationCode: 'J352',
					modernText: null,
					nineteenthCenturyNovel: null,
					poetryCluster: null,
					shakespearePlay: null
				}
			},
			persistedSubjectNames: [],
			localProfileImportPending: true
		});

		const response = await post({
			...guest,
			subjects: defaultSubjects,
			englishLiteratureSelections: {
				board: 'OCR',
				specificationCode: 'J352',
				modernText: null,
				nineteenthCenturyNovel: null,
				poetryCluster: null,
				shakespearePlay: null
			}
		});

		expect(response.status).toBe(200);
		await expect(response.clone().json()).resolves.toMatchObject({ snapshotChanged: true });
		expect(mocks.updateLearnerSubjects).toHaveBeenCalledWith({
			userId: user.uid,
			subjects: defaultSubjects,
			updatePrimaryProfile: true,
			updatePrimaryProfileBeforeSubjects: false,
			expectedPrimaryProfile: {
				board: 'AQA',
				subject: 'Biology',
				tier: 'Higher'
			},
			preserveExistingRows: true
		});
		expect(mocks.updateEnglishLiteratureSelections).not.toHaveBeenCalled();
	});

	it('preserves an explicit legacy primary even when no subject rows exist yet', async () => {
		mocks.getLearnerProfileSettingsForLocalImport.mockResolvedValue({
			settings: account,
			persistedSubjectNames: [],
			localProfileImportPending: false
		});

		const response = await post(guest);

		expect(response.status).toBe(200);
		expect(mocks.updateLearnerSubjects).toHaveBeenCalledWith(
			expect.objectContaining({
				updatePrimaryProfile: false,
				expectedPrimaryProfile: null,
				subjects: expect.arrayContaining([
					expect.objectContaining({
						subject: 'History',
						board: 'Edexcel',
						tier: 'Foundation',
						enabled: true,
						currentGrade: '6',
						targetGrade: '8'
					})
				])
			})
		);
	});

	it('preserves an existing exact-default primary with zero subject rows', async () => {
		const exactDefaultAccount: LearnerProfileSettings = {
			...account,
			profile: {
				...account.profile,
				selectedBoard: 'AQA',
				selectedSubject: 'Biology',
				selectedTier: 'Higher'
			},
			subjects: account.subjects.map((entry) =>
				entry.subject === 'Biology' ? { ...entry, enabled: true } : entry
			)
		};
		mocks.getLearnerProfileSettingsForLocalImport.mockResolvedValue({
			settings: exactDefaultAccount,
			persistedSubjectNames: [],
			localProfileImportPending: false
		});

		const response = await post({
			...guest,
			subjects: guest.subjects.map((entry) =>
				entry.subject === 'Biology' ? { ...entry, enabled: false } : entry
			)
		});

		expect(response.status).toBe(200);
		expect(mocks.updateLearnerSubjects).toHaveBeenCalledWith(
			expect.objectContaining({
				updatePrimaryProfile: false,
				expectedPrimaryProfile: null,
				subjects: expect.arrayContaining([
					expect.objectContaining({ subject: 'Biology', enabled: true })
				])
			})
		);
	});
});
