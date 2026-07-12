import { describe, expect, it } from 'vitest';
import {
	anonymousProfileSettings,
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
});
