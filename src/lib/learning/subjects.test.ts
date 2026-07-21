import { describe, expect, it } from 'vitest';
import {
	isScienceLearnerSubject,
	learnerSubjectForQuestion,
	learnerSubjectFromSlug,
	learnerSubjectHref,
	learnerSubjectContentHref,
	learnerSubjectSlug,
	officialScienceCurriculum
} from './subjects';

describe('learner subject routes', () => {
	it('uses stable readable slugs', () => {
		expect(learnerSubjectSlug('English Literature')).toBe('english-literature');
		expect(learnerSubjectFromSlug('computer-science')).toBe('Computer Science');
		expect(learnerSubjectHref('Biology')).toBe('/subjects/biology');
		expect(learnerSubjectContentHref('Physics')).toBe('/subjects/physics/content');
	});

	it('only exposes the current official science curriculum where it is available', () => {
		expect(isScienceLearnerSubject('Chemistry')).toBe(true);
		expect(isScienceLearnerSubject('History')).toBe(false);
		expect(officialScienceCurriculum('Chemistry')?.specificationCode).toBe('8462');
		expect(officialScienceCurriculum('History')).toBeNull();
	});

	it('recovers the learner subject from combined-science paper metadata', () => {
		expect(
			learnerSubjectForQuestion({
				subject: 'Combined Science',
				paper: 'Biology Paper 1'
			})
		).toBe('Biology');
		expect(
			learnerSubjectForQuestion({
				subject: 'Combined Science',
				subjectArea: 'Chemistry',
				paper: 'Paper 1'
			})
		).toBe('Chemistry');
	});
});
