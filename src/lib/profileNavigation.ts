import type { OcrLiteratureArea } from './englishLiteratureHub';

export const PROFILE_SUBJECTS_ANCHOR = 'profile-subjects';
export const ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR = 'profile-english-literature-course-texts';

const englishLiteratureChoiceAnchors = {
	modern: 'profile-english-literature-modern-text',
	novel: 'profile-english-literature-nineteenth-century-novel',
	poetry: 'profile-english-literature-poetry-cluster',
	shakespeare: 'profile-english-literature-shakespeare-play'
} as const satisfies Record<OcrLiteratureArea, string>;

export function profileSubjectAnchor(subject: string): string {
	const subjectSlug = subject
		.trim()
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

	return `profile-subject-${subjectSlug || 'settings'}`;
}

export function englishLiteratureChoiceAnchor(area: OcrLiteratureArea): string {
	return englishLiteratureChoiceAnchors[area];
}

export function profileAnchorHref(profilePath: string, anchor: string): string {
	return `${profilePath}#${anchor}`;
}
