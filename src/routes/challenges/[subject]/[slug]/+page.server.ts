import { challengeByRoute, challengeCatalog } from '$lib/challenges/catalog';
import {
	buildAuthoredChallengeChain,
	publicChallengeDefinition,
	publicNextChallengeDefinition
} from '$lib/challenges/authoredData';
import { emptyChallengeProgress } from '$lib/challenges/progress';
import {
	ENGLAND_KS4_SCIENCE_CONTEXT_URL,
	publicChallengeCurriculumLink
} from '$lib/server/challengeCurriculum';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const challenge = challengeByRoute(params.subject, params.slug);
	if (!challenge) throw error(404, 'Challenge not found.');

	const challengeProgress = locals.user
		? ((await parent()).homeSnapshot?.challengeProgress ?? emptyChallengeProgress())
		: emptyChallengeProgress();

	return {
		challenge: publicChallengeDefinition(challenge),
		chain: buildAuthoredChallengeChain(challenge),
		nextChallenges: challengeCatalog
			.filter((candidate) => candidate.id !== challenge.id)
			.map(publicNextChallengeDefinition),
		initialProgress: challengeProgress,
		curriculumCitation: publicChallengeCurriculumLink(challenge.id, challenge.subject),
		ks4ScienceUrl: ENGLAND_KS4_SCIENCE_CONTEXT_URL,
		user: locals.user
	};
};
