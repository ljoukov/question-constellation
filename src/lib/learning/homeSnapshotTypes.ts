import type { ChallengeProgress } from '$lib/challenges/progress';
import type {
	LearningActionView,
	SignedInLearningHome,
	SignedInSubjectView
} from '$lib/learning/viewTypes';
import type { ThemePreference } from '$lib/server/userTheme';

// Version 4 removes the redundant challenge recommendation projection. The
// current catalogue and saved progress determine that recommendation at read
// time, so persisting a second copy only creates stale learner-facing copy.
export const USER_HOME_SNAPSHOT_VERSION = 4 as const;

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

/**
 * One compact, user-bound payload supplies every personal field rendered by
 * the signed-in home page. Public challenge definitions and their featured
 * teaser copy remain bundled in the Worker; D1 stores progress, not a stale
 * duplicate of the derived recommendation.
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
