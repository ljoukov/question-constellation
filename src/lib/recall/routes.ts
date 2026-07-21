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
export type RecallSessionMode = 'mixed' | 'recall' | 'recognise' | 'truefalse' | 'reverse';

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
	if (!slug) return '/';
	return `/recall/${slug}/${recallActivityPath(activity)}`;
}

export function recallCoverageHref(subject: RecallRuntimeSubject | string) {
	return recallActivityHref(subject, 'flashcards');
}

export function recallSessionHref({
	subject,
	activity,
	topic = 'all',
	kind = 'all',
	size = 10,
	mode,
	search,
	returnTo
}: {
	subject: RecallRuntimeSubject;
	activity: RecallActivity;
	topic?: string;
	kind?: string;
	size?: number;
	mode?: RecallSessionMode;
	search?: string;
	returnTo?: string;
}) {
	const slug = recallSubjectSlugs[subject];
	if (!slug) return '/';
	const sessionMode = mode ?? recallModeForActivity(activity);
	const params = new URLSearchParams();
	if (topic !== 'all') params.set('topic', topic);
	if (kind !== 'all') params.set('kind', kind);
	if (size !== 10) params.set('size', String(size));
	if (search?.trim()) params.set('q', search.trim());
	if (returnTo) params.set('back', returnTo);
	const query = params.toString();
	const path = `/recall/${slug}/${recallModePath(sessionMode)}`;
	return `${path}${query ? `?${query}` : ''}`;
}

export function recallModeFromPath(value: string | null | undefined): RecallSessionMode | null {
	if (value === 'quick') return 'mixed';
	if (value === 'flashcards') return 'recall';
	if (value === 'multiple-choice') return 'recognise';
	if (value === 'true-or-false') return 'truefalse';
	if (value === 'reverse') return 'reverse';
	return null;
}

export function recallActivityForMode(mode: RecallSessionMode): RecallActivity {
	if (mode === 'recognise') return 'mcq';
	if (mode === 'truefalse') return 'true-false';
	return 'flashcards';
}

function recallActivityPath(activity: RecallActivity) {
	if (activity === 'mcq') return 'multiple-choice';
	if (activity === 'true-false') return 'true-or-false';
	return 'flashcards';
}

function recallModeForActivity(activity: RecallActivity): RecallSessionMode {
	if (activity === 'mcq') return 'recognise';
	if (activity === 'true-false') return 'truefalse';
	return 'recall';
}

function recallModePath(mode: RecallSessionMode) {
	if (mode === 'mixed') return 'quick';
	if (mode === 'recognise') return 'multiple-choice';
	if (mode === 'truefalse') return 'true-or-false';
	if (mode === 'reverse') return 'reverse';
	return 'flashcards';
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
