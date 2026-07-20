export type ChallengeSubject = 'biology' | 'chemistry' | 'physics';

export type ChallengeMechanic = 'missing-link' | 'first-wrong-step';

export type ChallengeDifficulty = 'starter' | 'standard' | 'stretch';

export type BiologySubjectArtTheme =
	| 'cells-practical'
	| 'biochemistry'
	| 'inheritance-reproduction'
	| 'regulation-immunity';

export type ChemistrySubjectArtTheme =
	| 'particles-bonding'
	| 'reactions-energy'
	| 'practical-analysis'
	| 'materials-industry';

export type PhysicsSubjectArtTheme =
	| 'forces-motion'
	| 'electricity-magnetism'
	| 'thermal-particles'
	| 'radiation-measurement';

export type ChallengeSubjectArtTheme =
	| BiologySubjectArtTheme
	| ChemistrySubjectArtTheme
	| PhysicsSubjectArtTheme;

export type ChallengeSubjectArtAssignment =
	| { subject: 'biology'; subjectArtTheme: BiologySubjectArtTheme }
	| { subject: 'chemistry'; subjectArtTheme: ChemistrySubjectArtTheme }
	| { subject: 'physics'; subjectArtTheme: PhysicsSubjectArtTheme };

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

export type ChallengeQuestionPresentation = {
	lead: string;
	task: string;
	table?: {
		caption: string;
		columns: [string, string];
		rows: Array<[string, string]>;
	};
};

type ChallengeDefinitionCore = {
	id: string;
	slug: string;
	title: string;
	topic: string;
	hook: string;
	arc: ChallengeArc;
	mechanic: ChallengeMechanic;
	difficulty: ChallengeDifficulty;
	marks: number;
	estimatedMinutes: number;
	previewQuestion: string;
	questionPresentation?: ChallengeQuestionPresentation;
	metaDescription: string;
	/** Optional internal provenance. Never required to launch an authored challenge. */
	sourceQuestionId?: string;
	/** Optional internal provenance. Never required to launch an authored challenge. */
	transferQuestionId?: string;
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

export type ChallengeDefinition = ChallengeDefinitionCore & ChallengeSubjectArtAssignment;

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
