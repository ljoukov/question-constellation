import type {
	EnglishLiteratureSelections,
	EnglishLiteratureSelectionInput
} from './englishLiteratureProfile';

export type OcrLiteratureArea = 'modern' | 'novel' | 'poetry' | 'shakespeare';

export type OcrLiteratureQuestionSource = {
	id: string;
	slug: string | null;
	title: string;
	preview: string;
	board: string;
	subject: string;
	paper: string;
	componentCode: string | null;
	series: string | null;
	year: number | null;
	topicPath: string[];
	sourceRef: string;
	marks: number | null;
	practiceAvailable: boolean;
	practiceUnavailableReason: string | null;
};

export type OcrLiteratureHubQuestion = OcrLiteratureQuestionSource & {
	questionType: string;
	formatNote: string | null;
	formatTone: 'current' | 'legacy' | 'anthology';
};

export type OcrLiteratureHubSection = {
	id: OcrLiteratureArea;
	paperNumber: '01' | '02';
	paperLabel: 'Paper 1' | 'Paper 2';
	category: string;
	selection: string | null;
	taskSummary: string;
	markShape: string;
	questions: OcrLiteratureHubQuestion[];
};

export type OcrLiteratureHub = {
	selections: EnglishLiteratureSelections;
	selectionCount: number;
	questionCount: number;
	availableQuestionCount: number;
	unavailableQuestionCount: number;
	sections: OcrLiteratureHubSection[];
};

const modernQuestionNumbers: Record<string, number> = {
	'Anita and Me': 1,
	'Never Let Me Go': 2,
	'Animal Farm': 3,
	'An Inspector Calls': 4,
	'Leave Taking': 5,
	DNA: 6
};

const currentNovelQuestionNumbers: Record<string, [number, number]> = {
	'Great Expectations': [7, 8],
	'Pride and Prejudice': [9, 10],
	'The War of the Worlds': [11, 12],
	'The Strange Case of Dr Jekyll and Mr Hyde': [13, 14],
	'Jane Eyre': [15, 16],
	'A Christmas Carol': [17, 18]
};

const splitNovelQuestionNumbers: Record<string, [number, number]> = {
	'Great Expectations': [1, 2],
	'Pride and Prejudice': [3, 4],
	'The War of the Worlds': [5, 6],
	'The Strange Case of Dr Jekyll and Mr Hyde': [7, 8],
	'Jane Eyre': [9, 10],
	'A Christmas Carol': [11, 12]
};

const poetryQuestionNumbers: Record<string, number> = {
	'Love and Relationships': 1,
	Conflict: 2,
	'Youth and Age': 3
};

const currentShakespeareQuestionNumbers: Record<string, [number, number]> = {
	'Romeo and Juliet': [4, 5],
	'The Merchant of Venice': [6, 7],
	Macbeth: [8, 9],
	'Much Ado About Nothing': [10, 11]
};

const splitShakespeareQuestionNumbers: Record<string, [number, number]> = {
	'Romeo and Juliet': [1, 2],
	'The Merchant of Venice': [3, 4],
	Macbeth: [5, 6],
	'Much Ado About Nothing': [7, 8]
};

export function buildOcrEnglishLiteratureHub(
	selections: EnglishLiteratureSelections,
	questions: OcrLiteratureQuestionSource[]
): OcrLiteratureHub {
	const ocrQuestions = questions.filter(
		(question) =>
			question.board.toLowerCase() === 'ocr' &&
			question.subject.toLowerCase() === 'english literature'
	);
	const sections = sectionDefinitions(selections).map((section) => ({
		...section,
		questions: section.selection
			? ocrQuestions
					.filter((question) => questionMatchesSelection(question, section.id, section.selection!))
					.map((question) => decorateQuestion(question, section.id, section.selection!))
					.sort(sortQuestions)
			: []
	}));

	const questionsInCourse = sections.flatMap((section) => section.questions);
	const availableQuestionCount = questionsInCourse.filter(
		(question) => question.practiceAvailable
	).length;
	return {
		selections,
		selectionCount: selectionValues(selections).filter(Boolean).length,
		questionCount: questionsInCourse.length,
		availableQuestionCount,
		unavailableQuestionCount: questionsInCourse.length - availableQuestionCount,
		sections
	};
}

export function ocrLiteratureSelectionSummary(selections: EnglishLiteratureSelectionInput): string {
	const values = selectionValues(selections).filter((value): value is string => Boolean(value));
	if (values.length === 0) return 'Choose the four options your school teaches.';
	if (values.length < 4) return `${values.length} of 4 set texts chosen · finish your profile`;
	return values.join(' · ');
}

function sectionDefinitions(
	selections: EnglishLiteratureSelections
): Array<Omit<OcrLiteratureHubSection, 'questions'>> {
	return [
		{
			id: 'modern',
			paperNumber: '01',
			paperLabel: 'Paper 1',
			category: 'Modern prose or drama',
			selection: selections.modernText,
			taskSummary:
				'Compare a studied extract with an unseen extract, then return to your set text.',
			markShape: 'Two linked 20-mark responses'
		},
		{
			id: 'novel',
			paperNumber: '01',
			paperLabel: 'Paper 1',
			category: '19th-century novel',
			selection: selections.nineteenthCenturyNovel,
			taskSummary: 'Choose an extract-based or whole-text essay on the novel you studied.',
			markShape: 'One 40-mark response'
		},
		{
			id: 'poetry',
			paperNumber: '02',
			paperLabel: 'Paper 2',
			category: 'Poetry cluster',
			selection: selections.poetryCluster,
			taskSummary:
				'Compare the named anthology poem with an unseen poem, then write on another poem.',
			markShape: 'Two linked 20-mark responses'
		},
		{
			id: 'shakespeare',
			paperNumber: '02',
			paperLabel: 'Paper 2',
			category: 'Shakespeare play',
			selection: selections.shakespearePlay,
			taskSummary: 'Choose an extract-based or whole-play essay on the play you studied.',
			markShape: 'One 40-mark response'
		}
	];
}

function selectionValues(selections: EnglishLiteratureSelectionInput) {
	return [
		selections.modernText,
		selections.nineteenthCenturyNovel,
		selections.poetryCluster,
		selections.shakespearePlay
	];
}

function questionMatchesSelection(
	question: OcrLiteratureQuestionSource,
	area: OcrLiteratureArea,
	selection: string
) {
	const component = normalizeComponent(question.componentCode);
	if (!componentSupportsArea(component, area)) return false;

	const selectedText = normalize(selection);
	const metadataText = normalize(
		[question.topicPath.join(' '), question.title, question.preview].join(' ')
	);
	if (metadataText.includes(selectedText)) return true;

	const questionNumber = leadingQuestionNumber(question.sourceRef);
	if (questionNumber === null) return false;

	if (area === 'modern') {
		if (selection === 'Leave Taking' && (question.year ?? 0) < 2024) return false;
		return modernQuestionNumbers[selection] === questionNumber;
	}
	if (area === 'novel') {
		const numbers =
			component === '12'
				? splitNovelQuestionNumbers[selection]
				: currentNovelQuestionNumbers[selection];
		return numbers?.includes(questionNumber) ?? false;
	}
	if (area === 'poetry') return poetryQuestionNumbers[selection] === questionNumber;

	const numbers =
		component === '22'
			? splitShakespeareQuestionNumbers[selection]
			: currentShakespeareQuestionNumbers[selection];
	return numbers?.includes(questionNumber) ?? false;
}

function componentSupportsArea(component: string | null, area: OcrLiteratureArea) {
	if (area === 'modern') return component === '01' || component === '11';
	if (area === 'novel') return component === '01' || component === '12';
	if (area === 'poetry') return component === '02' || component === '21';
	return component === '02' || component === '22';
}

function decorateQuestion(
	question: OcrLiteratureQuestionSource,
	area: OcrLiteratureArea,
	selection: string
): OcrLiteratureHubQuestion {
	const component = normalizeComponent(question.componentCode);
	const questionNumber = leadingQuestionNumber(question.sourceRef);
	const splitPaper =
		component === '11' || component === '12' || component === '21' || component === '22';
	const earlierAnthology = area === 'poetry' && (question.year ?? 0) < 2024;

	return {
		...question,
		questionType: questionType(area, component, question.sourceRef, questionNumber, selection),
		formatNote: earlierAnthology ? 'Earlier anthology' : splitPaper ? '2021–22 split paper' : null,
		formatTone: earlierAnthology ? 'anthology' : splitPaper ? 'legacy' : 'current'
	};
}

function questionType(
	area: OcrLiteratureArea,
	component: string | null,
	sourceRef: string,
	questionNumber: number | null,
	selection: string
) {
	if (area === 'modern') {
		return /a\s*$/i.test(sourceRef) ? 'Extract comparison' : 'Set-text response';
	}
	if (area === 'poetry') {
		return /a\s*$/i.test(sourceRef) || /\.1\s*$/.test(sourceRef)
			? 'Studied and unseen comparison'
			: 'Anthology poem response';
	}

	const pair =
		area === 'novel'
			? component === '12'
				? splitNovelQuestionNumbers[selection]
				: currentNovelQuestionNumbers[selection]
			: component === '22'
				? splitShakespeareQuestionNumbers[selection]
				: currentShakespeareQuestionNumbers[selection];
	return questionNumber !== null && pair?.[0] === questionNumber
		? area === 'novel'
			? 'Extract and whole novel'
			: 'Extract and whole play'
		: area === 'novel'
			? 'Whole-novel essay'
			: 'Whole-play essay';
}

function normalizeComponent(componentCode: string | null) {
	return /J352\/(01|02|11|12|21|22)/i.exec(componentCode ?? '')?.[1] ?? null;
}

function leadingQuestionNumber(sourceRef: string) {
	const match = /^0*(\d+)/.exec(sourceRef.trim());
	return match ? Number(match[1]) : null;
}

function normalize(value: string) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function sortQuestions(left: OcrLiteratureHubQuestion, right: OcrLiteratureHubQuestion) {
	return (
		Number(right.practiceAvailable) - Number(left.practiceAvailable) ||
		(right.year ?? 0) - (left.year ?? 0) ||
		(left.componentCode ?? '').localeCompare(right.componentCode ?? '') ||
		left.sourceRef.localeCompare(right.sourceRef, undefined, { numeric: true })
	);
}
