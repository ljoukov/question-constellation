import {
	recallCurriculumTopics,
	recallKindLabels,
	recallSubjects,
	type RecallSubject
} from '$lib/recall/aqaScienceRecall';
import { recallActivityHref } from '$lib/recall/routes';
import { learnerSubjectHref } from '$lib/learning/subjects';
import {
	getRecallCatalogScopeForLearner,
	getRecallReviewSnapshot,
	isRecallTopicWithinLearnerScope
} from '$lib/server/subjectLearning';
import { getRecallCards } from '$lib/server/recallCatalog';
import { rankCanonicalRecallCards } from '$lib/recall/personalization';
import { recordRecallCoverageMisses } from '$lib/server/recallCoverageShadow';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

function serverTimestamp(value: string): number {
	const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
		? `${value.replace(' ', 'T')}Z`
		: value;
	const parsed = Date.parse(normalized);
	return Number.isFinite(parsed) ? parsed : 0;
}

export const load: PageServerLoad = async ({ locals, url, platform }) => {
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
	const catalogScope =
		locals.user && reviewSubject
			? await getRecallCatalogScopeForLearner(locals.user, reviewSubject)
			: null;
	const allCards = await getRecallCards(catalogScope ?? undefined);
	const requestedTopic = url.searchParams.get('topic');
	const hasRequestedTopic = Boolean(
		reviewSubject &&
		requestedTopic &&
		allCards.some((card) => card.subject === reviewSubject && card.topicId === requestedTopic)
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
	const cards = reviewSubject
		? allCards.filter(
				(card) =>
					card.subject === reviewSubject && (!hasRequestedTopic || card.topicId === requestedTopic)
			)
		: allCards;
	const serverProgress =
		locals.user && reviewSubject
			? await getRecallReviewSnapshot(locals.user, reviewSubject, cards).catch(() => [])
			: [];
	const rankingProgress = Object.fromEntries(
		serverProgress.flatMap((row) => {
			const card = cards.find((candidate) => candidate.id === row.card_id);
			if (!card) return [];
			return [
				[
					`${card.id}@${card.contentRevision}:${card.contentHash}`,
					{
						seenCount: row.seen_count,
						dueAt: serverTimestamp(row.due_at),
						lastSeenAt: serverTimestamp(row.updated_at),
						wrongChoiceCount: row.wrong_choice_count,
						repeatedMisconceptionCount: row.repeated_misconception_count
					}
				] as const
			];
		})
	);
	const orderedCards = rankCanonicalRecallCards(cards, rankingProgress, Date.now());
	if (locals.user && reviewSubject) {
		const shadowWrite = recordRecallCoverageMisses({
			user: locals.user,
			subject: reviewSubject,
			canonicalCards: allCards
		}).catch((error) => {
			console.warn('[recall] coverage shadow signal failed; canonical recall is unchanged', {
				subject: reviewSubject,
				error
			});
		});
		if (platform?.ctx) platform.ctx.waitUntil(shadowWrite);
		else await shadowWrite;
	}
	const cardIds = new Set(orderedCards.map((card) => card.id));
	const topics = reviewSubject
		? recallCurriculumTopics.filter((topic) => topic.subject === reviewSubject)
		: recallCurriculumTopics;
	return {
		cards: orderedCards,
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
				updatedAt: row.updated_at,
				wrongChoiceCount: row.wrong_choice_count,
				repeatedMisconceptionCount: row.repeated_misconception_count
			})),
		user: locals.user
	};
};
