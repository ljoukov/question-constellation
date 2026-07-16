import { getAqaStemSubject, type StemCurriculumSubject } from '$lib/curriculum/aqaStem';

export const supportedLearnerSubjects = [
	'Biology',
	'Chemistry',
	'Physics',
	'Computer Science',
	'Geography',
	'History',
	'English Language',
	'English Literature'
] as const;

export type SupportedLearnerSubject = (typeof supportedLearnerSubjects)[number];

const subjectSlugByName: Record<SupportedLearnerSubject, string> = {
	Biology: 'biology',
	Chemistry: 'chemistry',
	Physics: 'physics',
	'Computer Science': 'computer-science',
	Geography: 'geography',
	History: 'history',
	'English Language': 'english-language',
	'English Literature': 'english-literature'
};

const subjectBySlug = new Map(
	Object.entries(subjectSlugByName).map(([subject, slug]) => [
		slug,
		subject as SupportedLearnerSubject
	])
);

export function learnerSubjectSlug(subject: string): string {
	return (
		subjectSlugByName[subject as SupportedLearnerSubject] ??
		subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')
	);
}

export function learnerSubjectFromSlug(
	slug: string | null | undefined
): SupportedLearnerSubject | null {
	if (!slug) return null;
	return subjectBySlug.get(slug.trim().toLowerCase()) ?? null;
}

export function learnerSubjectHref(subject: string): string {
	return `/subjects/${encodeURIComponent(learnerSubjectSlug(subject))}`;
}

export function learnerSubjectForQuestion({
	subject,
	subjectArea,
	paper
}: {
	subject: string;
	subjectArea?: string | null;
	paper?: string | null;
}): SupportedLearnerSubject | null {
	const values = [subjectArea, subject, paper].filter((value): value is string => Boolean(value));
	for (const candidate of supportedLearnerSubjects) {
		if (values.some((value) => value.trim().toLowerCase() === candidate.toLowerCase())) {
			return candidate;
		}
	}
	const context = values.join(' ').toLowerCase();
	return (
		supportedLearnerSubjects.find((candidate) => context.includes(candidate.toLowerCase())) ?? null
	);
}

export function learnerSubjectScopeHref(subject: string): string {
	return `${learnerSubjectHref(subject)}/scope`;
}

export function isScienceLearnerSubject(
	subject: string
): subject is 'Biology' | 'Chemistry' | 'Physics' {
	return subject === 'Biology' || subject === 'Chemistry' || subject === 'Physics';
}

export function officialScienceCurriculum(subject: string): StemCurriculumSubject | null {
	return isScienceLearnerSubject(subject) ? getAqaStemSubject(subject) : null;
}
