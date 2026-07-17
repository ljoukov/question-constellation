export type ChallengeSubject = 'biology' | 'physics';

export type ChallengeMechanic = 'missing-link' | 'first-wrong-step';

export type ChallengeDifficulty = 'starter' | 'standard' | 'stretch';

export type ChallengeArc =
	| 'read-the-evidence'
	| 'complete-the-method'
	| 'connect-cause-to-effect'
	| 'mark-the-working'
	| 'track-the-forces';

export type ChallengeAnswerId = 'a' | 'b';

export type ChallengeWeakAnswerKind =
	| 'incomplete'
	| 'incorrect-claim'
	| 'wrong-value'
	| 'off-command';

export type ChallengeChoice = {
	id: string;
	text: string;
	feedback?: string;
	correct: boolean;
};

export type ChallengeDefinition = {
	id: string;
	slug: string;
	subject: ChallengeSubject;
	title: string;
	topic: string;
	hook: string;
	arc: ChallengeArc;
	mechanic: ChallengeMechanic;
	difficulty: ChallengeDifficulty;
	estimatedMinutes: number;
	previewQuestion: string;
	metaDescription: string;
	sourceQuestionId: string;
	transferQuestionId: string;
	lastReviewed: string;
	version: number;
	staticAnswers: Record<ChallengeAnswerId, string>;
	strongerAnswer: ChallengeAnswerId;
	weakAnswer: ChallengeAnswerId;
	weakAnswerKind: ChallengeWeakAnswerKind;
	showdownExplanation: string;
	commandWordLesson: string;
	diagnosisPrompt: string;
	diagnosisChoices: ChallengeChoice[];
	repairPrompt: string;
	repairChoices: ChallengeChoice[];
	freeTextKeywordGroups: string[][];
	repairSuccess: string;
	transferPromptLead: string;
	transferChoices: ChallengeChoice[];
	transferExplanation: string;
	memoryHandle: string;
};

export type ChallengeSubjectDefinition = {
	subject: ChallengeSubject;
	label: string;
	description: string;
	heroSlug: string;
	accent: string;
};

export type ChallengeArcDefinition = {
	id: ChallengeArc;
	label: string;
	description: string;
};
