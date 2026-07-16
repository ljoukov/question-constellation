import {
	recallCards,
	recallCurriculumTopics,
	type RecallCardDefinition,
	type RecallSubject,
	type RecallTopic
} from './aqaScienceRecall';

export type RecallActivity = 'flashcards' | 'mcq';

export const recallSubjectSlugs: Record<RecallSubject, string> = {
	Biology: 'biology',
	Chemistry: 'chemistry',
	Physics: 'physics'
};

const subjectBySlug = new Map(
	Object.entries(recallSubjectSlugs).map(([subject, slug]) => [slug, subject as RecallSubject])
);

export const recallStackSizeOptions = [5, 8, 10, 15] as const;

export function recallSubjectFromSlug(value: string | null | undefined): RecallSubject | null {
	if (!value) return null;
	return subjectBySlug.get(value.trim().toLowerCase()) ?? null;
}

export function recallActivityHref(subject: RecallSubject | string, activity: RecallActivity) {
	const slug = recallSubjectSlugs[subject as RecallSubject];
	return slug ? `/recall/${slug}/${activity}` : '/recall';
}

export function recallCoverageHref(subject: RecallSubject | string) {
	const slug = recallSubjectSlugs[subject as RecallSubject];
	return slug ? `/recall/${slug}/coverage` : '/recall';
}

export function recallSessionHref({
	subject,
	activity,
	topic = 'all',
	kind = 'all',
	size = 10,
	returnTo
}: {
	subject: RecallSubject;
	activity: RecallActivity;
	topic?: string;
	kind?: string;
	size?: number;
	returnTo?: string;
}) {
	const params = new URLSearchParams({
		subject,
		activity,
		size: String(size),
		start: '1'
	});
	if (activity === 'mcq') params.set('mode', 'recognise');
	if (topic !== 'all') params.set('topic', topic);
	if (kind !== 'all') params.set('kind', kind);
	if (returnTo) params.set('returnTo', returnTo);
	return `/recall?${params.toString()}`;
}

export function recallActivityLabel(activity: RecallActivity) {
	return activity === 'mcq' ? 'Multiple choice' : 'Flashcards';
}

export function recallCardCountForTopic(topicId: string) {
	return recallCards.filter((card) => card.topicId === topicId).length;
}

export function recallTopicsForSubject(subject: RecallSubject): RecallTopic[] {
	return recallCurriculumTopics.filter((topic) => topic.subject === subject);
}

export function recallCardsForSubject(subject: RecallSubject): RecallCardDefinition[] {
	return recallCards.filter((card) => card.subject === subject);
}
