import type { PublicChallengePreviewDefinition } from '$lib/challenges/authoredData';
import type { ChallengeProgress } from '$lib/challenges/progress';
import type {
	LearningActionView,
	SignedInLearningHome,
	SignedInSubjectView
} from '$lib/learning/viewTypes';
import type { ThemePreference } from '$lib/server/userTheme';

export const USER_HOME_SNAPSHOT_VERSION = 2 as const;

export type UserHomeLearningAction = Pick<
	LearningActionView,
	'kind' | 'title' | 'durationMinutes' | 'href'
>;

export type UserHomeSubject = {
	subject: string;
	href: string;
	courseLabel: string;
	scope: Pick<
		SignedInLearningHome['subjects'][number]['scope'],
		'status' | 'unitPlural' | 'includedCount' | 'totalCount'
	>;
	progress: Pick<
		SignedInLearningHome['subjects'][number]['progress'],
		'coverageCount' | 'coverageLabel' | 'secureCount' | 'dueCount' | 'examAnswerCount'
	> & {
		checkedAnswerPerformance: Pick<
			SignedInLearningHome['subjects'][number]['progress']['checkedAnswerPerformance'],
			'label' | 'value'
		>;
	};
	nextAction: UserHomeLearningAction;
};

export type UserHomeDashboard = {
	studentName: string;
	subjects: UserHomeSubject[];
	weeklySummary: SignedInLearningHome['weeklySummary'];
};

export type UserHomeChallengeRecommendation = Pick<
	PublicChallengePreviewDefinition,
	'id' | 'slug' | 'subject' | 'title' | 'hook'
>;

/**
 * One compact, user-bound payload supplies every personal field rendered by
 * the signed-in home page. Public challenge definitions remain bundled in the
 * Worker; D1 stores only the small recommendation identity/copy projection.
 */
export type UserHomeSnapshot = {
	version: typeof USER_HOME_SNAPSHOT_VERSION;
	dashboard: UserHomeDashboard;
	subjectViews: SignedInSubjectView[];
	appearance: {
		themePreference: ThemePreference;
		visualEffectsEnabled: boolean;
	};
	challengeProgress: ChallengeProgress;
	challengeRecommendation: UserHomeChallengeRecommendation | null;
	challengeCompletedCount: number;
	challengeTotalBestScore: number;
};

export type UserHomeSnapshotReadResult = {
	status: 'fresh' | 'stale' | 'fallback';
	snapshot: UserHomeSnapshot;
	shouldRefresh: boolean;
};

export type UserHomeSnapshotRefreshResult =
	| {
			status: 'refreshed';
			snapshot: UserHomeSnapshot;
	  }
	| {
			status: 'current' | 'busy' | 'superseded' | 'failed';
	  };
