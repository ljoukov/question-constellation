import { challengeByRoute, challengesForSubject } from '$lib/challenges/catalog';
import { getChallengeQuestionPairData } from '$lib/server/questionData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const challenge = challengeByRoute(params.subject, params.slug);
	if (!challenge) throw error(404, 'Challenge not found.');

	try {
		const questionData = await getChallengeQuestionPairData(
			challenge.sourceQuestionId,
			challenge.transferQuestionId
		);

		const subjectChallenges = challengesForSubject(challenge.subject);
		const challengeIndex = subjectChallenges.findIndex(
			(candidate) => candidate.id === challenge.id
		);
		const nextChallenge =
			challengeIndex >= 0 && challengeIndex < subjectChallenges.length - 1
				? subjectChallenges[challengeIndex + 1]
				: null;

		return {
			challenge,
			question: questionData.question,
			transferQuestion: questionData.transferQuestion,
			chain: questionData.chain,
			questionStandaloneAvailable: questionData.questionStandaloneAvailable,
			nextChallenge,
			user: locals.user
		};
	} catch (loadError) {
		if (loadError && typeof loadError === 'object' && 'status' in loadError) throw loadError;
		throw error(404, 'Challenge question data could not be loaded.');
	}
};
