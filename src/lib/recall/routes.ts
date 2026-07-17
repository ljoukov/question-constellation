import {
	recallCards,
	recallCurriculumTopics,
	type RecallCard,
	type RecallCardDefinition,
	type RecallRuntimeSubject,
	type RecallSubject,
	type RecallTopic
} from './aqaScienceRecall';

export type RecallActivity = 'flashcards' | 'mcq' | 'true-false';

export const recallSubjectSlugs: Record<RecallRuntimeSubject, string> = {
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
	Object.entries(recallSubjectSlugs).map(([subject, slug]) => [
		slug,
		subject as RecallRuntimeSubject
	])
);

export const recallStackSizeOptions = [5, 8, 10, 15] as const;

export function recallSubjectFromSlug(
	value: string | null | undefined
): RecallRuntimeSubject | null {
	if (!value) return null;
	return subjectBySlug.get(value.trim().toLowerCase()) ?? null;
}

export function recallActivityHref(
	subject: RecallRuntimeSubject | string,
	activity: RecallActivity
) {
	const slug = recallSubjectSlugs[subject as RecallRuntimeSubject];
	return slug ? `/recall/${slug}/${activity}` : '/recall';
}

export function recallCoverageHref(subject: RecallRuntimeSubject | string) {
	const slug = recallSubjectSlugs[subject as RecallRuntimeSubject];
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
	subject: RecallRuntimeSubject;
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
	if (activity === 'true-false') params.set('mode', 'truefalse');
	if (topic !== 'all') params.set('topic', topic);
	if (kind !== 'all') params.set('kind', kind);
	if (returnTo) params.set('returnTo', returnTo);
	return `/recall?${params.toString()}`;
}

export function recallActivityLabel(activity: RecallActivity) {
	if (activity === 'mcq') return 'Multiple choice';
	if (activity === 'true-false') return 'True or false';
	return 'Flashcards';
}

export function recallCardCountForTopic(topicId: string) {
	return recallCards.filter((card) => card.topicId === topicId).length;
}

export function recallTopicsForSubject(subject: RecallRuntimeSubject): RecallTopic[] {
	return recallCurriculumTopics.filter((topic) => topic.subject === subject);
}

export function recallTopicsForCards(cards: readonly RecallCard[]): RecallTopic[] {
	const seen = new Set<string>();
	return cards.flatMap((card) => {
		if (seen.has(card.topicId)) return [];
		seen.add(card.topicId);
		return [
			{
				id: card.topicId,
				subject: card.subject,
				specRef: card.topicComponentId || card.specRef,
				title: card.topicTitle?.trim() || card.topicId,
				paper: card.topicPaper?.trim() || 'GCSE'
			}
		];
	});
}

export function recallCardsForSubject(subject: RecallSubject): RecallCardDefinition[] {
	return recallCards.filter((card) => card.subject === subject);
}
