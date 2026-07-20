import { challengeSubjects, challengesForSubject } from '$lib/challenges/catalog';
import { publicChallengePreviewDefinition } from '$lib/challenges/authoredData';
import { emptyChallengeProgress } from '$lib/challenges/progress';
import type { ChallengeSubject } from '$lib/challenges/types';
import {
	ENGLAND_KS4_SCIENCE_CONTEXT_URL,
	publicChallengeCurriculumLinks
} from '$lib/server/challengeCurriculum';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const subjectDefinition = challengeSubjects.find(
		(candidate) => candidate.subject === params.subject
	);
	if (!subjectDefinition) throw error(404, 'Challenge subject not found.');

	const subject = subjectDefinition.subject as ChallengeSubject;
	const challenges = challengesForSubject(subject);
	const heroChallenge =
		challenges.find(({ slug }) => slug === subjectDefinition.heroSlug) ?? challenges[0];
	if (!heroChallenge) throw error(500, 'Subject challenge is unavailable.');
	const challengeProgress = locals.user
		? ((await parent()).homeSnapshot?.challengeProgress ?? emptyChallengeProgress())
		: emptyChallengeProgress();

	return {
		subject: {
			subject: subjectDefinition.subject,
			label: subjectDefinition.label,
			description: subjectDefinition.description
		},
		defaultHeroId: heroChallenge.id,
		challenges: challenges.map(publicChallengePreviewDefinition),
		curriculumLinks: publicChallengeCurriculumLinks(challenges),
		ks4ScienceUrl: ENGLAND_KS4_SCIENCE_CONTEXT_URL,
		challengeProgress,
		user: locals.user
	};
};
