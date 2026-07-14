import { describe, expect, it } from 'vitest';
import {
	isScienceLearnerSubject,
	learnerSubjectFromSlug,
	learnerSubjectHref,
	learnerSubjectScopeHref,
	learnerSubjectSlug,
	officialScienceCurriculum
} from './subjects';

describe('learner subject routes', () => {
	it('uses stable readable slugs', () => {
		expect(learnerSubjectSlug('English Literature')).toBe('english-literature');
		expect(learnerSubjectFromSlug('computer-science')).toBe('Computer Science');
		expect(learnerSubjectHref('Biology')).toBe('/subjects/biology');
		expect(learnerSubjectScopeHref('Physics')).toBe('/subjects/physics/scope');
	});

	it('only exposes the current official science curriculum where it is available', () => {
		expect(isScienceLearnerSubject('Chemistry')).toBe(true);
		expect(isScienceLearnerSubject('History')).toBe(false);
		expect(officialScienceCurriculum('Chemistry')?.specificationCode).toBe('8462');
		expect(officialScienceCurriculum('History')).toBeNull();
	});
});
