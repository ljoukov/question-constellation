import { getHomePagePublicData } from '$lib/server/learningChainData';
import { challengeProgressTotals, emptyChallengeProgress } from '$lib/challenges/progress';
import {
	mostRecentlyCompletedChallenge,
	recommendedUnfinishedChallenge
} from '$lib/challenges/recommendations';
import {
	ANONYMOUS_PROFILE_COOKIE_NAME,
	parseAnonymousLearnerProfileCookie
} from '$lib/anonymousLearnerProfile';
import type { UserHomeSnapshot } from '$lib/learning/homeSnapshotTypes';
import { getChallengeCatalogIndex } from '$lib/server/challengeCatalog';
import type { PageServerLoad } from './$types';

function fallbackDashboard(user: NonNullable<App.Locals['user']>): UserHomeSnapshot['dashboard'] {
	return {
		studentName: (user.name ?? '').trim().split(/\s+/)[0] ?? '',
		subjects: [],
		weeklySummary: {
			attemptCount: 0,
			recallCount: 0,
			closedGapCount: 0
		}
	};
}

export const load: PageServerLoad = async ({ locals, parent, cookies }) => {
	if (locals.user) {
		const [layoutData, challengeIndex] = await Promise.all([parent(), getChallengeCatalogIndex()]);
		const snapshot = layoutData.homeSnapshot;
		const challengeCatalog = challengeIndex?.challenges ?? [];
		const localProfile = parseAnonymousLearnerProfileCookie(
			cookies.get(ANONYMOUS_PROFILE_COOKIE_NAME)
		);
		const pendingLocalSubjects = localProfile?.pendingSync
			? localProfile.subjects
					.filter((subject) => subject.enabled)
					.map((subject) => ({
						subject: subject.subject,
						courseLabel:
							subject.course === 'GCSE Subject'
								? `${subject.board} · GCSE`
								: `${subject.board} · ${
										subject.course === 'Separate Science' ? 'Separate' : 'Combined'
									} · ${subject.tier}`
					}))
			: [];
		const challengeProgress = snapshot?.challengeProgress ?? emptyChallengeProgress();
		const recommendedChallenge =
			recommendedUnfinishedChallenge(challengeCatalog, challengeProgress) ??
			mostRecentlyCompletedChallenge(challengeCatalog, challengeProgress);
		const challengeTotals = challengeProgressTotals(challengeProgress);

		return {
			featuredQuestion: null,
			dashboard: snapshot?.dashboard ?? fallbackDashboard(locals.user),
			challengeProgress,
			challengeCatalog,
			challengeRecommendation: recommendedChallenge,
			challengeCompletedCount: challengeTotals.completedCount,
			challengeTotalBestScore: challengeTotals.totalBestScore,
			snapshotInitialising:
				layoutData.homeSnapshotShouldRefresh === true &&
				(!snapshot || snapshot.dashboard.subjects.length === 0),
			pendingLocalSubjects,
			user: locals.user
		};
	}

	const publicData = await getHomePagePublicData();
	const featuredGroup = publicData.featuredChains[0];
	const featured = featuredGroup?.questions.find((question) => question.id);
	return {
		featuredQuestion:
			featured?.id && featuredGroup
				? {
						id: featured.id,
						subject: featuredGroup.subject,
						title: featured.title,
						teaser: featured.teaser,
						marks: featured.marks
					}
				: null,
		dashboard: null,
		challengeProgress: emptyChallengeProgress(),
		challengeCatalog: [],
		challengeRecommendation: null,
		challengeCompletedCount: 0,
		challengeTotalBestScore: 0,
		snapshotInitialising: false,
		pendingLocalSubjects: [],
		user: null
	};
};
