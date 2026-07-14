import {
	recallCards,
	recallCurriculumTopics,
	recallKindLabels,
	recallSubjects,
	type RecallSubject
} from '$lib/recall/aqaScienceRecall';
import { recallActivityHref } from '$lib/recall/routes';
import { learnerSubjectHref } from '$lib/learning/subjects';
import {
	getRecallReviewSnapshot,
	isRecallTopicWithinLearnerScope
} from '$lib/server/subjectLearning';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const initialActivity = url.searchParams.get('activity') === 'mcq' ? 'mcq' : 'flashcards';
	if (url.searchParams.get('start') !== '1') {
		const requestedSubject = url.searchParams.get('subject');
		const subject = recallSubjects.includes(requestedSubject as RecallSubject)
			? (requestedSubject as RecallSubject)
			: 'Biology';
		throw redirect(307, recallActivityHref(subject, initialActivity));
	}
	const requestedSubject = url.searchParams.get('subject');
	const reviewSubject = recallSubjects.includes(requestedSubject as RecallSubject)
		? (requestedSubject as RecallSubject)
		: undefined;
	const requestedTopic = url.searchParams.get('topic');
	const hasRequestedTopic = Boolean(
		reviewSubject &&
		requestedTopic &&
		recallCards.some((card) => card.subject === reviewSubject && card.topicId === requestedTopic)
	);
	if (locals.user) {
		if (
			!reviewSubject ||
			!hasRequestedTopic ||
			!(await isRecallTopicWithinLearnerScope(locals.user.uid, reviewSubject, requestedTopic!))
		) {
			throw redirect(303, reviewSubject ? learnerSubjectHref(reviewSubject) : '/');
		}
	}
	const serverProgress = locals.user
		? await getRecallReviewSnapshot(locals.user, reviewSubject).catch(() => [])
		: [];
	const cards = reviewSubject
		? recallCards.filter(
				(card) =>
					card.subject === reviewSubject && (!hasRequestedTopic || card.topicId === requestedTopic)
			)
		: recallCards;
	const cardIds = new Set(cards.map((card) => card.id));
	const topics = reviewSubject
		? recallCurriculumTopics.filter((topic) => topic.subject === reviewSubject)
		: recallCurriculumTopics;
	return {
		cards,
		kindLabels: recallKindLabels,
		subjects: recallSubjects,
		topics,
		initialSubject: url.searchParams.get('subject') ?? 'All subjects',
		initialTopic: url.searchParams.get('topic') ?? 'all',
		initialKind: url.searchParams.get('kind') ?? 'all',
		initialMode:
			url.searchParams.get('mode') ?? (initialActivity === 'mcq' ? 'recognise' : 'recall'),
		initialActivity,
		initialSearch: url.searchParams.get('q') ?? '',
		initialSize: url.searchParams.get('size') ?? '10',
		initialStart: url.searchParams.get('start') === '1',
		initialReturnTo: url.searchParams.get('returnTo') ?? '/',
		serverProgress: serverProgress
			.filter((row) => cardIds.has(row.card_id))
			.map((row) => ({
				cardId: row.card_id,
				lastGrade: row.last_grade,
				seenCount: row.seen_count,
				correctCount: row.correct_count,
				intervalDays: row.interval_days,
				dueAt: row.due_at,
				updatedAt: row.updated_at
			})),
		user: locals.user
	};
};
