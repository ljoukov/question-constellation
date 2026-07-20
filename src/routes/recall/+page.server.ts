import {
	recallKindLabels,
	runtimeRecallSubjects,
	type RecallRuntimeSubject
} from '$lib/recall/aqaScienceRecall';
import { recallActivityHref, recallTopicsForCards, type RecallActivity } from '$lib/recall/routes';
import { learnerSubjectHref } from '$lib/learning/subjects';
import {
	getRecallCatalogScopeForLearner,
	getRecallReviewSnapshot,
	isRecallTopicWithinLearnerScope,
	recallCardsWithinLearnerScope
} from '$lib/server/subjectLearning';
import { defaultRecallCatalogScope, getRecallCards } from '$lib/server/recallCatalog';
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

function requestedRecallSubject(value: string | null): RecallRuntimeSubject | undefined {
	return value &&
		value !== 'All subjects' &&
		runtimeRecallSubjects.includes(value as RecallRuntimeSubject)
		? (value as RecallRuntimeSubject)
		: undefined;
}

function requestedRecallActivity(value: string | null): RecallActivity {
	if (value === 'mcq') return 'mcq';
	if (value === 'true-false' || value === 'true_false') return 'true-false';
	return 'flashcards';
}

export const load: PageServerLoad = async ({ locals, url, platform }) => {
	const initialActivity = requestedRecallActivity(url.searchParams.get('activity'));
	if (url.searchParams.get('start') !== '1') {
		const subject = requestedRecallSubject(url.searchParams.get('subject')) ?? 'Biology';
		throw redirect(307, recallActivityHref(subject, initialActivity));
	}
	const requestedSubject = url.searchParams.get('subject');
	const reviewSubject = requestedRecallSubject(requestedSubject);
	const catalogScope =
		locals.user && reviewSubject
			? await getRecallCatalogScopeForLearner(locals.user, reviewSubject)
			: reviewSubject
				? defaultRecallCatalogScope(reviewSubject)
				: null;
	if (locals.user && (!reviewSubject || !catalogScope)) {
		throw redirect(303, reviewSubject ? learnerSubjectHref(reviewSubject) : '/');
	}
	const catalogCards = await getRecallCards(catalogScope ?? undefined);
	const allCards =
		locals.user && reviewSubject
			? await recallCardsWithinLearnerScope(locals.user, reviewSubject, catalogCards)
			: catalogCards;
	const requestedTopic = url.searchParams.get('topic');
	const aggregateTopicRequested = !requestedTopic || requestedTopic === 'all';
	const hasRequestedTopic = Boolean(
		reviewSubject &&
		requestedTopic &&
		!aggregateTopicRequested &&
		allCards.some((card) => card.subject === reviewSubject && card.topicId === requestedTopic)
	);
	let requestedTopicAllowed = aggregateTopicRequested;
	if (locals.user && !aggregateTopicRequested && reviewSubject && requestedTopic) {
		requestedTopicAllowed =
			hasRequestedTopic &&
			(await isRecallTopicWithinLearnerScope(locals.user, reviewSubject, requestedTopic));
	}
	if (locals.user) {
		if (allCards.length === 0 || !requestedTopicAllowed) {
			throw redirect(303, reviewSubject ? learnerSubjectHref(reviewSubject) : '/');
		}
	}
	const cards = reviewSubject
		? allCards.filter(
				(card) =>
					card.subject === reviewSubject &&
					(aggregateTopicRequested || card.topicId === requestedTopic)
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
	const topics = recallTopicsForCards(
		reviewSubject ? allCards.filter((card) => card.subject === reviewSubject) : allCards
	);
	return {
		cards: orderedCards,
		kindLabels: recallKindLabels,
		// A session is hydrated for one exact learner offering. The selector may
		// navigate to another subject, but it must not imply that this payload
		// contains a synthetic cross-subject deck.
		subjects: runtimeRecallSubjects.filter((subject) => subject !== 'All subjects'),
		topics,
		initialSubject: url.searchParams.get('subject') ?? 'All subjects',
		initialTopic: url.searchParams.get('topic') ?? 'all',
		initialKind: url.searchParams.get('kind') ?? 'all',
		initialMode:
			url.searchParams.get('mode') ??
			(initialActivity === 'mcq'
				? 'recognise'
				: initialActivity === 'true-false'
					? 'truefalse'
					: 'recall'),
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
