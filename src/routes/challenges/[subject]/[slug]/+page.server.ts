import { emptyChallengeLeaderboard } from '$lib/challenges/leaderboard';
import { emptyChallengeProgress } from '$lib/challenges/progress';
import { normalizeChallengePathScope, normalizeChallengeSubject } from '$lib/challenges/routing';
import { getChallengeDetail } from '$lib/server/challengeCatalog';
import { getChallengeLeaderboard } from '$lib/server/challengeLeaderboard';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, parent, url }) => {
	const subject = normalizeChallengeSubject(params.subject);
	if (!subject) throw error(404, 'Challenge not found.');
	const [catalog, layoutData, leaderboard] = await Promise.all([
		getChallengeDetail(subject, params.slug),
		locals.user ? parent() : Promise.resolve(null),
		getChallengeLeaderboard({
			scope: subject,
			currentUserId: locals.user?.uid
		}).catch(() => emptyChallengeLeaderboard())
	]);
	if (!catalog) throw error(404, 'Challenge not found.');

	const challengeProgress = locals.user
		? (layoutData?.homeSnapshot?.challengeProgress ?? emptyChallengeProgress())
		: emptyChallengeProgress();

	return {
		...catalog,
		initialProgress: challengeProgress,
		leaderboard,
		pathScope: normalizeChallengePathScope(
			url.searchParams.get('scope'),
			catalog.challenge.subject
		),
		user: locals.user
	};
};
