import {
	challengeByRoute,
	challengeCatalog,
	challengeSubjects,
	challengesForSubject
} from '$lib/challenges/catalog';
import { emptyChallengeProgress } from '$lib/challenges/progress';
import { publicChallengeCardDefinition } from '$lib/server/challengeCatalogPresentation';
import {
	ENGLAND_KS4_SCIENCE_CONTEXT_URL,
	publicChallengeCurriculumLinks
} from '$lib/server/challengeCurriculum';
import { getChallengeLeaderboard } from '$lib/server/challengeLeaderboard';
import { emptyChallengeLeaderboard } from '$lib/challenges/leaderboard';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const featuredChallenge = challengeByRoute('biology', 'measles-vaccine-immunity');
	if (!featuredChallenge) throw error(500, 'Featured challenge is unavailable.');

	const challengeCards = challengeCatalog.map(publicChallengeCardDefinition);
	const challengeCardById = new Map(challengeCards.map((challenge) => [challenge.id, challenge]));
	const featuredChallengeCard = challengeCardById.get(featuredChallenge.id);
	if (!featuredChallengeCard) throw error(500, 'Featured challenge card is unavailable.');
	const subjectGroups = challengeSubjects.map((subject) => {
		const challenges = challengesForSubject(subject.subject);
		const subjectHero =
			challenges.find((challenge) => challenge.slug === subject.heroSlug) ?? challenges[0];
		return {
			subject: subject.subject,
			label: subject.label,
			challengeIds: challenges.map(({ id }) => id),
			cardArt: subjectHero ? (challengeCardById.get(subjectHero.id)?.cardArt ?? null) : null
		};
	});
	const curriculumExamples = [
		featuredChallenge,
		challengeByRoute('chemistry', 'temperature-collision-rate'),
		challengeByRoute('physics', 'half-range-uncertainty')
	].filter((challenge) => challenge !== undefined);
	const challengeProgress = locals.user
		? ((await parent()).homeSnapshot?.challengeProgress ?? emptyChallengeProgress())
		: emptyChallengeProgress();
	const leaderboard = await getChallengeLeaderboard({
		challengeIds: challengeCatalog.map((challenge) => challenge.id),
		currentUserId: locals.user?.uid
	}).catch(() => emptyChallengeLeaderboard());

	return {
		featuredChallenge: featuredChallengeCard,
		challenges: challengeCards,
		subjects: subjectGroups,
		curriculumLinks: publicChallengeCurriculumLinks(curriculumExamples),
		ks4ScienceUrl: ENGLAND_KS4_SCIENCE_CONTEXT_URL,
		challengeProgress,
		leaderboard,
		user: locals.user
	};
};
