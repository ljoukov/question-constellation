import { emptyChallengeProgress } from '$lib/challenges/progress';
import { emptyChallengeLeaderboard } from '$lib/challenges/leaderboard';
import { normalizeChallengeSubject } from '$lib/challenges/routing';
import { getChallengeSubject } from '$lib/server/challengeCatalog';
import { getChallengeLeaderboard } from '$lib/server/challengeLeaderboard';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent }) => {
	const subject = normalizeChallengeSubject(params.subject);
	if (!subject) throw error(404, 'Challenge subject not found.');
	const [catalog, layoutData, leaderboard] = await Promise.all([
		getChallengeSubject(subject),
		locals.user ? parent() : Promise.resolve(null),
		getChallengeLeaderboard({
			scope: subject,
			currentUserId: locals.user?.uid
		}).catch(() => emptyChallengeLeaderboard())
	]);
	if (!catalog) throw error(404, 'Challenge subject not found.');
	const challengeProgress = locals.user
		? (layoutData?.homeSnapshot?.challengeProgress ?? emptyChallengeProgress())
		: emptyChallengeProgress();

	return {
		...catalog,
		challengeProgress,
		leaderboard,
		user: locals.user
	};
};
