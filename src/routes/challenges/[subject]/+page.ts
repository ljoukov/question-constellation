import { challengeArcs, challengeSubjects, challengesForSubject } from '$lib/challenges/catalog';
import type { ChallengeSubject } from '$lib/challenges/types';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const subjectDefinition = challengeSubjects.find(
		(candidate) => candidate.subject === params.subject
	);
	if (!subjectDefinition) throw error(404, 'Challenge subject not found.');

	const subject = subjectDefinition.subject as ChallengeSubject;
	const challenges = challengesForSubject(subject);
	const usedArcs = new Set(challenges.map((challenge) => challenge.arc));

	return {
		subject: subjectDefinition,
		challenges,
		arcs: challengeArcs.filter((arc) => usedArcs.has(arc.id))
	};
};
