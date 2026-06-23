export type ExperimentGradeVerdict = 'credited' | 'missed' | 'uncertain';

export type ExperimentQuestionGradeResult = {
	questionId: string;
	ref: string;
	status: 'graded' | 'not_gradeable' | 'unanswered';
	result: 'correct' | 'partial' | 'incorrect' | 'ungraded';
	awardedMarks: number | null;
	maxMarks: number;
	gradeableMarks: number;
	confidence: 'high' | 'medium' | 'low';
	summary: string;
	nextStep: string;
	checklist: Array<{
		id: string;
		text: string;
		verdict: ExperimentGradeVerdict;
		explanation: string;
	}>;
	chain: {
		id: string;
		title: string;
		canonicalText: string;
		steps: Array<{
			id: string;
			text: string;
			role: string;
			verdict: ExperimentGradeVerdict;
			explanation: string;
		}>;
	} | null;
	modelAnswer: string | null;
	warnings: string[];
};

export type ExperimentGradeResponse = {
	status: 'ok';
	paperSlug: string;
	ref: string;
	model: string;
	modelVersion: string;
	totals: {
		awardedMarks: number;
		maxMarks: number;
		gradeableMarks: number;
		ungradedMarks: number;
	};
	results: ExperimentQuestionGradeResult[];
	debugPrompt?: string;
};
