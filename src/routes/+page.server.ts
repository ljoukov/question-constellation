import { getHomePagePublicData } from '$lib/server/learningChainData';
import { challengeCatalog } from '$lib/challenges/catalog';
import { publicChallengePreviewDefinition } from '$lib/challenges/authoredData';
import { challengeProgressTotals, emptyChallengeProgress } from '$lib/challenges/progress';
import { recommendedUnfinishedChallenge } from '$lib/challenges/recommendations';
import {
	ANONYMOUS_PROFILE_COOKIE_NAME,
	parseAnonymousLearnerProfileCookie
} from '$lib/anonymousLearnerProfile';
import type { UserHomeSnapshot } from '$lib/learning/homeSnapshotTypes';
import { blogArticles } from '$lib/blog/articles';
import type { BlogArticle, BlogArticleMeta } from '$lib/blog/types';
import type { PageServerLoad } from './$types';

function toBlogMeta(article: BlogArticle): BlogArticleMeta {
	const meta = { ...article };
	delete (meta as Partial<BlogArticle>).bodyMarkdown;
	return meta;
}

const latestArticles = blogArticles.slice(0, 3).map(toBlogMeta);

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
		const layoutData = await parent();
		const snapshot = layoutData.homeSnapshot;
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
		const recommendedChallenge = recommendedUnfinishedChallenge(
			challengeCatalog,
			challengeProgress
		);
		const challengeTotals = challengeProgressTotals(challengeProgress);

		return {
			featuredChains: [],
			stats: { chainCount: 0, questionCount: 0, subjectCount: 0 },
			latestArticles,
			learnerSettings: null,
			dashboard: snapshot?.dashboard ?? fallbackDashboard(locals.user),
			challengeProgress,
			challengeRecommendation: recommendedChallenge
				? publicChallengePreviewDefinition(recommendedChallenge)
				: null,
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
	return {
		featuredChains: publicData.featuredChains,
		stats: publicData.stats,
		latestArticles,
		dashboard: null,
		challengeProgress: emptyChallengeProgress(),
		challengeRecommendation: null,
		challengeCompletedCount: 0,
		challengeTotalBestScore: 0,
		snapshotInitialising: false,
		pendingLocalSubjects: [],
		user: null
	};
};
