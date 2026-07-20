import { describe, expect, it } from 'vitest';
import {
	anonymousProfileSettings,
	mergeAnonymousProfileIntoAccount,
	parseAnonymousLearnerProfile,
	parseAnonymousLearnerProfileCookie
} from './anonymousLearnerProfile';
import type { AnonymousLearnerProfile } from './anonymousLearnerProfile';
import type { LearnerProfileSettings } from './server/personalLearning';

const defaults: LearnerProfileSettings = {
	profile: {
		uid: 'anonymous',
		email: '',
		name: null,
		photoUrl: null,
		selectedBoard: 'AQA',
		selectedQualification: 'GCSE',
		selectedSubject: 'Biology',
		selectedTier: 'Higher',
		themePreference: 'auto'
	},
	subjects: [
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
	subjectOptions: ['Biology', 'English Literature'],
	englishLiteratureSelections: {
		board: 'OCR',
		specificationCode: 'J352',
		modernText: null,
		nineteenthCenturyNovel: null,
		poetryCluster: null,
		shakespearePlay: null
	}
};

const stored: AnonymousLearnerProfile = {
	version: 1,
	updatedAt: 123,
	pendingSync: true,
	subjects: defaults.subjects.map((subject) => ({
		...subject,
		qualification: 'GCSE' as const,
		enabled: subject.subject === 'English Literature'
	})),
	englishLiteratureSelections: {
		board: 'OCR',
		specificationCode: 'J352',
		modernText: 'An Inspector Calls',
		nineteenthCenturyNovel: 'A Christmas Carol',
		poetryCluster: 'Conflict',
		shakespearePlay: 'Macbeth'
	}
};

describe('anonymous learner profile', () => {
	it('validates and reads the URL-encoded cookie representation', () => {
		expect(parseAnonymousLearnerProfile(stored)).toEqual(stored);
		expect(parseAnonymousLearnerProfileCookie(encodeURIComponent(JSON.stringify(stored)))).toEqual(
			stored
		);
	});

	it('applies local choices without changing the server profile identity', () => {
		const settings = anonymousProfileSettings(defaults, stored);
		expect(settings.profile.uid).toBe('anonymous');
		expect(
			settings.subjects.find((subject) => subject.subject === 'English Literature')?.enabled
		).toBe(true);
		expect(settings.englishLiteratureSelections.modernText).toBe('An Inspector Calls');
	});

	it('rejects malformed local state', () => {
		expect(parseAnonymousLearnerProfile({ ...stored, pendingSync: 'yes' })).toBeNull();
		expect(parseAnonymousLearnerProfileCookie('%not-json')).toBeNull();
	});

	it('adds guest subjects without replacing established account choices', () => {
		const account: LearnerProfileSettings = {
			...defaults,
			profile: {
				...defaults.profile,
				selectedBoard: 'Edexcel',
				selectedSubject: 'Biology',
				selectedTier: 'Foundation'
			},
			subjects: [
				{
					...defaults.subjects[0],
					board: 'Edexcel',
					tier: 'Foundation',
					currentGrade: '6',
					targetGrade: null
				},
				{
					subject: 'Physics',
					board: 'AQA',
					qualification: 'GCSE',
					course: 'Combined Science',
					tier: 'Higher',
					enabled: false,
					currentGrade: null,
					targetGrade: null
				}
			]
		};
		const guest: AnonymousLearnerProfile = {
			...stored,
			subjects: [
				{
					...account.subjects[0],
					board: 'AQA',
					qualification: 'GCSE',
					tier: 'Higher',
					enabled: false,
					currentGrade: null,
					targetGrade: '9'
				},
				{
					...account.subjects[1],
					board: 'OCR',
					qualification: 'GCSE',
					course: 'Separate Science',
					tier: 'Foundation',
					enabled: true,
					currentGrade: '5',
					targetGrade: '8'
				}
			]
		};

		const merge = mergeAnonymousProfileIntoAccount(account, guest, ['Biology']);

		expect(merge.subjects).toEqual([
			account.subjects[0],
			{
				...account.subjects[1],
				board: 'OCR',
				course: 'Separate Science',
				tier: 'Foundation',
				enabled: true,
				currentGrade: '5',
				targetGrade: '8'
			}
		]);
		expect(merge.subjectsChanged).toBe(true);
	});

	it('fills missing Literature choices but never replaces account selections', () => {
		const account: LearnerProfileSettings = {
			...defaults,
			englishLiteratureSelections: {
				...defaults.englishLiteratureSelections,
				modernText: 'Animal Farm',
				poetryCluster: 'Conflict'
			}
		};
		const guest: AnonymousLearnerProfile = {
			...stored,
			subjects: [],
			englishLiteratureSelections: {
				...stored.englishLiteratureSelections,
				modernText: 'An Inspector Calls',
				poetryCluster: 'Love and Relationships'
			}
		};

		const merge = mergeAnonymousProfileIntoAccount(account, guest, []);

		expect(merge.englishLiteratureSelections).toEqual({
			board: 'OCR',
			specificationCode: 'J352',
			modernText: 'Animal Farm',
			nineteenthCenturyNovel: 'A Christmas Carol',
			poetryCluster: 'Conflict',
			shakespearePlay: 'Macbeth'
		});
		expect(merge.englishLiteratureSelectionsChanged).toBe(true);
	});

	it('treats an empty guest and a replayed import as no-ops', () => {
		const emptyGuest: AnonymousLearnerProfile = {
			...stored,
			subjects: [],
			englishLiteratureSelections: {
				board: 'OCR',
				specificationCode: 'J352',
				modernText: null,
				nineteenthCenturyNovel: null,
				poetryCluster: null,
				shakespearePlay: null
			}
		};
		const emptyMerge = mergeAnonymousProfileIntoAccount(defaults, emptyGuest, []);
		expect(emptyMerge.subjectsChanged).toBe(false);
		expect(emptyMerge.englishLiteratureSelectionsChanged).toBe(false);

		const firstMerge = mergeAnonymousProfileIntoAccount(defaults, stored, []);
		const importedAccount: LearnerProfileSettings = {
			...defaults,
			subjects: firstMerge.subjects,
			englishLiteratureSelections: firstMerge.englishLiteratureSelections
		};
		const retryMerge = mergeAnonymousProfileIntoAccount(
			importedAccount,
			stored,
			importedAccount.subjects.map((subject) => subject.subject)
		);
		expect(retryMerge.subjectsChanged).toBe(false);
		expect(retryMerge.englishLiteratureSelectionsChanged).toBe(false);
	});

	it('normalizes empty guest grades so a database round trip stays idempotent', () => {
		const guest: AnonymousLearnerProfile = {
			...stored,
			subjects: [
				{
					...defaults.subjects[0],
					qualification: 'GCSE',
					currentGrade: '   ',
					targetGrade: ''
				}
			],
			englishLiteratureSelections: {
				...defaults.englishLiteratureSelections,
				modernText: ''
			}
		};

		const merge = mergeAnonymousProfileIntoAccount(defaults, guest, []);

		expect(merge.subjects[0].currentGrade).toBeNull();
		expect(merge.subjects[0].targetGrade).toBeNull();
		expect(merge.englishLiteratureSelections.modernText).toBeNull();
		expect(merge.subjectsChanged).toBe(false);
		expect(merge.englishLiteratureSelectionsChanged).toBe(false);
	});
});
