import type { ChallengeProgress } from '$lib/challenges/progress';
import type {
	LearningActionView,
	SignedInLearningHome,
	SignedInSubjectView
} from '$lib/learning/viewTypes';
import type { ThemePreference } from '$lib/server/userTheme';

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
 * the signed-in home page. Challenge content comes from QUESTION_DB and image
 * bytes come from QUESTION_R2; PERSONAL_DB stores only learner state.
 */
export type UserHomeSnapshot = {
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
