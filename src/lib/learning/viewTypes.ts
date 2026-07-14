export type LearnerFacingState = 'not_checked' | 'developing' | 'secure' | 'due' | 'conflicting';

export type CurriculumScopeView = {
	status: 'not_set' | 'all' | 'selected' | 'not_available';
	label: string;
	unitSingular: string;
	unitPlural: string;
	href: string | null;
	includedTopicIds: string[];
	includedCount: number;
	totalCount: number;
};

export type LearningActionView = {
	id: string;
	kind: 'scope' | 'recall' | 'close_gap' | 'apply_chain' | 'subject';
	eyebrow: string;
	title: string;
	detail: string;
	reason: string;
	durationMinutes: number | null;
	href: string;
	available: boolean;
};

export type CurriculumTopicProgressView = {
	id: string;
	code: string;
	title: string;
	paper: string;
	included: boolean;
	state: LearnerFacingState;
	stateLabel: string;
	evidenceCount: number;
	dueCount: number;
};

export type SubjectProgressView = {
	coverageCount: number;
	coverageTotal: number;
	coverageLabel: string;
	secureCount: number;
	dueCount: number;
	examAnswerCount: number;
	evidenceLabel: string;
	gradeEstimate: {
		label: string;
		detail: string;
		range: string | null;
	};
};

export type SignedInSubjectView = {
	subject: string;
	slug: string;
	href: string;
	board: string;
	qualification: string;
	course: string;
	tier: string;
	courseLabel: string;
	scope: CurriculumScopeView;
	progress: SubjectProgressView;
	nextAction: LearningActionView;
	alternatives: LearningActionView[];
	topics: CurriculumTopicProgressView[];
	specification: {
		code: string | null;
		url: string | null;
	};
};

export type SignedInLearningHome = {
	studentName: string;
	subjects: SignedInSubjectView[];
	weeklySummary: {
		attemptCount: number;
		recallCount: number;
		closedGapCount: number;
	};
};
