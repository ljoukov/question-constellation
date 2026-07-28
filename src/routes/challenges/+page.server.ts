import { emptyChallengeProgress } from '$lib/challenges/progress';
import { getChallengeHub } from '$lib/server/challengeCatalog';
import { getChallengeLeaderboard } from '$lib/server/challengeLeaderboard';
import { emptyChallengeLeaderboard } from '$lib/challenges/leaderboard';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const [catalog, layoutData, leaderboard] = await Promise.all([
		getChallengeHub(),
		locals.user ? parent() : Promise.resolve(null),
		getChallengeLeaderboard({
			scope: 'all',
			currentUserId: locals.user?.uid
		}).catch(() => emptyChallengeLeaderboard())
	]);
	if (!catalog) throw error(503, 'Challenge catalogue is unavailable.');
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
