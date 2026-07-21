import { challengesForSubject } from '$lib/challenges/catalog';
import { publicChallengePreviewDefinition } from '$lib/challenges/authoredData';
import { emptyChallengeProgress } from '$lib/challenges/progress';
import {
	mostRecentlyCompletedChallenge,
	recommendedUnfinishedChallenge
} from '$lib/challenges/recommendations';
import type { ChallengeDefinition } from '$lib/challenges/types';
import { learnerSubjectFromSlug } from '$lib/learning/subjects';
import { isScienceLearnerSubject } from '$lib/learning/subjects';
import { getEnglishLiteratureSubjectHub } from '$lib/server/englishLiteratureSubjectHub';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

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
		return {
			subject,
			user: locals.user,
			literatureHub: await getEnglishLiteratureSubjectHub(locals.user),
			challengeCatalog: [],
			challengeProgress: emptyChallengeProgress(),
			challengeRecommendation: null,
			challengeRecommendationCompleted: false,
			challengeCompletedCount: 0,
			challengeTotalBestScore: 0
		};
	}
	const subjectChallenges: ChallengeDefinition[] = isScienceLearnerSubject(subject.subject)
		? challengesForSubject(subject.subject.toLowerCase())
		: [];
	const challengeCatalog = subjectChallenges.map(publicChallengePreviewDefinition);
	const challengeProgress =
		subjectChallenges.length > 0
			? (layoutData.homeSnapshot?.challengeProgress ?? emptyChallengeProgress())
			: emptyChallengeProgress();
	const challengeRecommendation =
		recommendedUnfinishedChallenge(subjectChallenges, challengeProgress) ??
		mostRecentlyCompletedChallenge(subjectChallenges, challengeProgress) ??
		subjectChallenges[0] ??
		null;
	return {
		subject,
		user: locals.user,
		literatureHub: null,
		challengeCatalog,
		challengeProgress,
		challengeRecommendation: challengeRecommendation
			? publicChallengePreviewDefinition(challengeRecommendation)
			: null,
		challengeRecommendationCompleted: challengeRecommendation
			? Boolean(challengeProgress.challenges[challengeRecommendation.id]?.completedAt)
			: false,
		challengeCompletedCount: subjectChallenges.filter((challenge) =>
			Boolean(challengeProgress.challenges[challenge.id]?.completedAt)
		).length,
		challengeTotalBestScore: subjectChallenges.reduce(
			(total, challenge) => total + (challengeProgress.challenges[challenge.id]?.bestScore ?? 0),
			0
		)
	};
};
