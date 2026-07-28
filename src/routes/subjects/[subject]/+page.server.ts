import { emptyChallengeProgress } from '$lib/challenges/progress';
import {
	mostRecentlyCompletedChallenge,
	recommendedUnfinishedChallenge
} from '$lib/challenges/recommendations';
import { learnerSubjectFromSlug } from '$lib/learning/subjects';
import { isScienceLearnerSubject } from '$lib/learning/subjects';
import type { RecallRuntimeSubject } from '$lib/recall/aqaScienceRecall';
import { recallTopicsForCards } from '$lib/recall/routes';
import { getEnglishLiteratureSubjectHub } from '$lib/server/englishLiteratureSubjectHub';
import { getRecallCards } from '$lib/server/recallCatalog';
import {
	getRecallCatalogScopeForLearner,
	recallCardsWithinLearnerScope
} from '$lib/server/subjectLearning';
import { getChallengeSubject } from '$lib/server/challengeCatalog';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

type RecallDeckSummary = {
	subject: RecallRuntimeSubject;
	totalCardCount: number;
	topics: Array<{
		id: string;
		title: string;
		cardCount: number;
	}>;
};

async function recallDeckForSubject(
	user: NonNullable<App.Locals['user']>,
	subject: RecallRuntimeSubject
): Promise<RecallDeckSummary | null> {
	try {
		const catalogScope = await getRecallCatalogScopeForLearner(user, subject);
		if (!catalogScope) return null;
		const catalogCards = await getRecallCards(catalogScope);
		const cards = await recallCardsWithinLearnerScope(user, subject, catalogCards);
		if (cards.length === 0) return null;
		const cardCountByTopic = new Map<string, number>();
		for (const card of cards) {
			cardCountByTopic.set(card.topicId, (cardCountByTopic.get(card.topicId) ?? 0) + 1);
		}
		return {
			subject,
			totalCardCount: cards.length,
			topics: recallTopicsForCards(cards).map((topic) => ({
				id: topic.id,
				title: topic.title,
				cardCount: cardCountByTopic.get(topic.id) ?? 0
			}))
		};
	} catch (cause) {
		console.warn('[subject hub] recall deck unavailable', { subject, cause });
		return null;
	}
}

export const load: PageServerLoad = async ({ locals, params, url, parent }) => {
	if (!locals.user) {
		throw redirect(303, `/auth/start?next=${encodeURIComponent(url.pathname)}`);
	}
	const subjectName = learnerSubjectFromSlug(params.subject);
	if (!subjectName) throw error(404, 'Subject not found.');
	const layoutData = await parent();
	const projectedSubject =
		layoutData.homeSnapshot?.subjectViews?.find((subject) => subject.subject === subjectName) ??
		null;
	if (!projectedSubject && layoutData.homeSnapshotShouldRefresh) {
		throw error(503, 'Your subject view is updating. Reload in a moment.');
	}
	const subject = projectedSubject;
	if (!subject) throw error(404, 'This subject is not enabled in your profile.');
	if (subject.subject === 'English Literature' && subject.board === 'OCR') {
		if (subject.scope.status === 'not_set') throw redirect(303, subject.nextAction.href);
		const [literatureHub, recallDeck] = await Promise.all([
			getEnglishLiteratureSubjectHub(locals.user),
			recallDeckForSubject(locals.user, subjectName)
		]);
		return {
			subject,
			user: locals.user,
			literatureHub,
			recallDeck,
			challengeCatalog: [],
			challengeProgress: emptyChallengeProgress(),
			challengeRecommendation: null,
			challengeRecommendationCompleted: false,
			challengeCompletedCount: 0,
			challengeTotalBestScore: 0
		};
	}
	const [recallDeck, challengePayload] = await Promise.all([
		recallDeckForSubject(locals.user, subjectName),
		isScienceLearnerSubject(subject.subject)
			? getChallengeSubject(subject.subject.toLowerCase())
			: Promise.resolve(null)
	]);
	const challengeCatalog = challengePayload?.challenges ?? [];
	const challengeProgress =
		challengeCatalog.length > 0
			? (layoutData.homeSnapshot?.challengeProgress ?? emptyChallengeProgress())
			: emptyChallengeProgress();
	const challengeRecommendation =
		recommendedUnfinishedChallenge(challengeCatalog, challengeProgress) ??
		mostRecentlyCompletedChallenge(challengeCatalog, challengeProgress) ??
		challengeCatalog[0] ??
		null;
	return {
		subject,
		user: locals.user,
		literatureHub: null,
		recallDeck,
		challengeCatalog,
		challengeProgress,
		challengeRecommendation,
		challengeRecommendationCompleted: challengeRecommendation
			? Boolean(challengeProgress.challenges[challengeRecommendation.id]?.completedAt)
			: false,
		challengeCompletedCount: challengeCatalog.filter((challenge) =>
			Boolean(challengeProgress.challenges[challenge.id]?.completedAt)
		).length,
		challengeTotalBestScore: challengeCatalog.reduce(
			(total, challenge) => total + (challengeProgress.challenges[challenge.id]?.bestScore ?? 0),
			0
		)
	};
};
