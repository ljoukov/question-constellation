import { describe, expect, it } from 'vitest';
import { getAqaStemSubjectForCourse } from './aqaStem';

describe('AQA science curriculum by course', () => {
	it.each([
		['Biology', '4'],
		['Chemistry', '5'],
		['Physics', '6']
	] as const)(
		'uses the Combined Science specification and %s section codes',
		(subject, section) => {
			const curriculum = getAqaStemSubjectForCourse(subject, 'Combined Science');

			expect(curriculum.specificationCode).toBe('8464');
			expect(curriculum.specificationUrl).toContain('/science/gcse/science-8464/specification');
			expect(curriculum.topics).not.toHaveLength(0);
			expect(curriculum.topics.every((topic) => topic.code.startsWith(`${section}.`))).toBe(true);
		}
	);

	it('excludes content that is only part of Separate Science', () => {
		const combinedChemistry = getAqaStemSubjectForCourse('Chemistry', 'Combined Science');
		const combinedPhysics = getAqaStemSubjectForCourse('Physics', 'Combined Science');

		expect(combinedChemistry.topics.map((topic) => topic.title)).not.toContain('Key ideas');
		expect(combinedPhysics.topics.map((topic) => topic.title)).not.toContain('Space physics');
	});

	it('retains separate-only content for Separate Science', () => {
		const separateChemistry = getAqaStemSubjectForCourse('Chemistry', 'Separate Science');
		const separatePhysics = getAqaStemSubjectForCourse('Physics', 'Separate Science');

		expect(separateChemistry.specificationCode).toBe('8462');
		expect(separateChemistry.topics.map((topic) => topic.title)).toContain('Key ideas');
		expect(separatePhysics.specificationCode).toBe('8463');
		expect(separatePhysics.topics.map((topic) => topic.title)).toContain('Space physics');
	});

	it.each(['Biology', 'Chemistry', 'Physics'] as const)(
		'uses distinct Combined and Separate Science topic ids for %s',
		(subject) => {
			const combinedIds = new Set(
				getAqaStemSubjectForCourse(subject, 'Combined Science').topics.map((topic) => topic.id)
			);
			const separateIds = getAqaStemSubjectForCourse(subject, 'Separate Science').topics.map(
				(topic) => topic.id
			);

			expect(separateIds.some((id) => combinedIds.has(id))).toBe(false);
		}
	);
});
