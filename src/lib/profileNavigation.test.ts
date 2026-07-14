import { describe, expect, it } from 'vitest';
import {
	ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR,
	PROFILE_SUBJECTS_ANCHOR,
	englishLiteratureChoiceAnchor,
	profileAnchorHref,
	profileSubjectAnchor
} from './profileNavigation';

describe('profile navigation anchors', () => {
	it('keeps general and subject settings anchors stable', () => {
		expect(PROFILE_SUBJECTS_ANCHOR).toBe('profile-subjects');
		expect(profileSubjectAnchor('English Literature')).toBe('profile-subject-english-literature');
		expect(profileSubjectAnchor('Computer Science')).toBe('profile-subject-computer-science');
		expect(profileSubjectAnchor('Design & Technology')).toBe(
			'profile-subject-design-and-technology'
		);
	});

	it('targets the English Literature course panel and each exact choice', () => {
		expect(ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR).toBe('profile-english-literature-course-texts');
		expect(englishLiteratureChoiceAnchor('modern')).toBe('profile-english-literature-modern-text');
		expect(englishLiteratureChoiceAnchor('novel')).toBe(
			'profile-english-literature-nineteenth-century-novel'
		);
		expect(englishLiteratureChoiceAnchor('poetry')).toBe(
			'profile-english-literature-poetry-cluster'
		);
		expect(englishLiteratureChoiceAnchor('shakespeare')).toBe(
			'profile-english-literature-shakespeare-play'
		);
	});

	it('preserves a resolved base path when building a deep link', () => {
		expect(profileAnchorHref('/school/profile', PROFILE_SUBJECTS_ANCHOR)).toBe(
			'/school/profile#profile-subjects'
		);
	});
});
