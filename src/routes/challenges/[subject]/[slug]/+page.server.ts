import { challengeByRoute, challengeCatalog } from '$lib/challenges/catalog';
import {
	buildAuthoredChallengeChain,
	publicChallengeDefinition,
	publicNextChallengeDefinition
} from '$lib/challenges/authoredData';
import { emptyChallengeLeaderboard } from '$lib/challenges/leaderboard';
import { emptyChallengeProgress } from '$lib/challenges/progress';
import { normalizeChallengePathScope } from '$lib/challenges/routing';
import { getChallengeLeaderboard } from '$lib/server/challengeLeaderboard';
import {
	ENGLAND_KS4_SCIENCE_CONTEXT_URL,
	publicChallengeCurriculumLink
} from '$lib/server/challengeCurriculum';
import { getChallengeShortRecallPrompt } from '$lib/server/challengeShortRecall';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent, url }) => {
	const challenge = challengeByRoute(params.subject, params.slug);
	if (!challenge) throw error(404, 'Challenge not found.');

	const challengeProgress = locals.user
		? ((await parent()).homeSnapshot?.challengeProgress ?? emptyChallengeProgress())
		: emptyChallengeProgress();
	const [leaderboard, shortRecallPrompt] = await Promise.all([
		getChallengeLeaderboard({
			challengeIds: challengeCatalog.map((candidate) => candidate.id),
			currentUserId: locals.user?.uid
		}).catch(() => emptyChallengeLeaderboard()),
		getChallengeShortRecallPrompt(challenge.id)
	]);

	return {
		challenge: publicChallengeDefinition(challenge),
		chain: buildAuthoredChallengeChain(challenge),
		nextChallenges: challengeCatalog
			.filter((candidate) => candidate.id !== challenge.id)
			.map(publicNextChallengeDefinition),
		initialProgress: challengeProgress,
		leaderboard,
		shortRecallPrompt,
		pathScope: normalizeChallengePathScope(url.searchParams.get('scope'), challenge.subject),
		curriculumCitation: publicChallengeCurriculumLink(challenge.id, challenge.subject),
		ks4ScienceUrl: ENGLAND_KS4_SCIENCE_CONTEXT_URL,
		user: locals.user
	};
};
