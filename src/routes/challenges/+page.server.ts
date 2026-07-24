import {
	challengeByRoute,
	challengeCatalog,
	challengeSubjects,
	challengesForSubject
} from '$lib/challenges/catalog';
import { publicChallengePreviewDefinition } from '$lib/challenges/authoredData';
import { emptyChallengeProgress } from '$lib/challenges/progress';
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

	const subjectGroups = challengeSubjects.map((subject) => {
		const challenges = challengesForSubject(subject.subject);
		return {
			subject: subject.subject,
			label: subject.label,
			challengeIds: challenges.map(({ id }) => id)
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
		featuredChallenge: publicChallengePreviewDefinition(featuredChallenge),
		challenges: challengeCatalog.map(publicChallengePreviewDefinition),
		subjects: subjectGroups,
		curriculumLinks: publicChallengeCurriculumLinks(curriculumExamples),
		ks4ScienceUrl: ENGLAND_KS4_SCIENCE_CONTEXT_URL,
		challengeProgress,
		leaderboard,
		user: locals.user
	};
};
