export type SubjectId = 'biology' | 'chemistry' | 'physics' | 'english' | 'history';

export type Subject = {
	id: SubjectId;
	name: string;
	shortName: string;
	description: string;
	tone: 'green' | 'blue' | 'violet' | 'orange' | 'gold';
	icon: 'leaf' | 'flask' | 'atom' | 'book' | 'crown';
};

export type Pattern = {
	id: string;
	subjectId: SubjectId;
	title: string;
	parts: string[];
	icon: 'link' | 'cycle' | 'network' | 'quote' | 'line' | 'nodes';
	mastery: number;
	usedCount: number;
	savedAt: string;
	summary: string;
	topics: string[];
	questionFamilies: string[];
};

export type ProgressSummary = {
	questionsPractised: number;
	patternsSaved: number;
	topicsExplored: number;
	dayStreak: number;
};

export type HomeData = {
	subjects: Subject[];
	suggestedSubject: Subject;
	suggestedQuestion: {
		subjectId: SubjectId;
		topic: string;
		prompt: string;
		meta: string;
		checks: string[];
	};
	featuredPatterns: Pattern[];
	progress: ProgressSummary;
};

export type ThinkingMemoryData = {
	subjects: Subject[];
	patterns: Pattern[];
	groupedPatterns: Array<{
		subject: Subject;
		patterns: Pattern[];
	}>;
	selectedPattern: Pattern;
	recentlySaved: Pattern[];
	recentlyUsed: Pattern[];
	crossSubjectLinks: Array<{
		from: Pattern;
		to: Pattern;
		reason: string;
	}>;
};

const subjects: Subject[] = [
	{
		id: 'biology',
		name: 'Biology',
		shortName: 'Biology',
		description: 'Life processes, cells and living systems.',
		tone: 'green',
		icon: 'leaf'
	},
	{
		id: 'chemistry',
		name: 'Chemistry',
		shortName: 'Chemistry',
		description: 'Atoms, reactions and everyday materials.',
		tone: 'blue',
		icon: 'flask'
	},
	{
		id: 'physics',
		name: 'Physics',
		shortName: 'Physics',
		description: 'Energy, forces and how the world works.',
		tone: 'violet',
		icon: 'atom'
	},
	{
		id: 'english',
		name: 'English',
		shortName: 'English',
		description: 'Texts, ideas and how meaning is created.',
		tone: 'orange',
		icon: 'book'
	},
	{
		id: 'history',
		name: 'History',
		shortName: 'History',
		description: 'Events, change and historical interpretations.',
		tone: 'gold',
		icon: 'crown'
	}
];

const patterns: Pattern[] = [
	{
		id: 'cause-process-effect',
		subjectId: 'biology',
		title: 'Cause -> process -> effect',
		parts: ['Cause', 'process', 'effect'],
		icon: 'link',
		mastery: 4,
		usedCount: 8,
		savedAt: '2h ago',
		summary:
			'Use this when one change leads to another through a biological or scientific process.',
		topics: ['Circulation', 'Respiration', 'Photosynthesis', 'Enzymes'],
		questionFamilies: [
			'Blood flow and the heart',
			'Gas exchange in lungs',
			'How plants make food',
			'Enzyme control reactions'
		]
	},
	{
		id: 'change-response',
		subjectId: 'biology',
		title: 'Change -> response',
		parts: ['Change', 'response'],
		icon: 'cycle',
		mastery: 4,
		usedCount: 3,
		savedAt: '4h ago',
		summary: 'Use this when a stimulus, condition or variable changes and the system responds.',
		topics: ['Homeostasis', 'Hormones', 'Plant responses'],
		questionFamilies: ['Blood glucose control', 'Temperature regulation', 'Phototropism']
	},
	{
		id: 'substance-cell-energy-effect',
		subjectId: 'biology',
		title: 'Substance -> cell process -> energy -> effect',
		parts: ['Substance', 'cell process', 'energy', 'effect'],
		icon: 'network',
		mastery: 3,
		usedCount: 3,
		savedAt: 'Yesterday',
		summary: 'Trace a substance into a cell-level process before explaining the visible outcome.',
		topics: ['Glucose', 'Mitochondria', 'Respiration'],
		questionFamilies: ['Exercise and respiration', 'Photosynthesis products', 'Cell metabolism']
	},
	{
		id: 'structure-property',
		subjectId: 'chemistry',
		title: 'Structure -> property',
		parts: ['Structure', 'property'],
		icon: 'line',
		mastery: 4,
		usedCount: 6,
		savedAt: 'Yesterday',
		summary: 'Connect the arrangement of particles or bonds to an observable material property.',
		topics: ['Bonding', 'Polymers', 'States of matter'],
		questionFamilies: [
			'Giant covalent structures',
			'Simple molecular substances',
			'Metal properties'
		]
	},
	{
		id: 'particle-movement-property',
		subjectId: 'chemistry',
		title: 'Particle arrangement -> movement -> property',
		parts: ['Particle arrangement', 'movement', 'property'],
		icon: 'nodes',
		mastery: 3,
		usedCount: 3,
		savedAt: '2 days ago',
		summary: 'Explain a bulk property by first describing how particles are arranged and move.',
		topics: ['Solids', 'Liquids', 'Gases'],
		questionFamilies: ['Melting and boiling points', 'Diffusion', 'Density']
	},
	{
		id: 'evidence-method-effect',
		subjectId: 'english',
		title: 'Evidence -> method -> effect',
		parts: ['Evidence', 'method', 'effect'],
		icon: 'network',
		mastery: 3,
		usedCount: 7,
		savedAt: '2 days ago',
		summary: 'Move from a quotation to the writer method and then to the reader or meaning effect.',
		topics: ['Language analysis', 'Character', 'Theme'],
		questionFamilies: ['Analysing imagery', 'Narrative voice', 'Tension in extracts']
	},
	{
		id: 'quote-inference-judgement',
		subjectId: 'english',
		title: 'Quote -> inference -> judgement',
		parts: ['Quote', 'inference', 'judgement'],
		icon: 'quote',
		mastery: 3,
		usedCount: 5,
		savedAt: '3 days ago',
		summary: 'Use a short quotation to support an inference before making a precise judgement.',
		topics: ['Essay paragraphs', 'Evaluation', 'Context'],
		questionFamilies: ['Character motivation', 'Theme comparison', 'Writer intention']
	},
	{
		id: 'evidence-inference-judgement',
		subjectId: 'physics',
		title: 'Evidence -> inference -> judgement',
		parts: ['Evidence', 'inference', 'judgement'],
		icon: 'nodes',
		mastery: 3,
		usedCount: 6,
		savedAt: '3 days ago',
		summary:
			'Start with measured evidence, infer what it shows, then choose the strongest conclusion.',
		topics: ['Practical skills', 'Graphs', 'Forces'],
		questionFamilies: ['Interpreting graphs', 'Required practicals', 'Uncertainty']
	}
];

const progress: ProgressSummary = {
	questionsPractised: 0,
	patternsSaved: 0,
	topicsExplored: 0,
	dayStreak: 0
};

function subjectById(subjectId: SubjectId): Subject {
	const subject = subjects.find((item) => item.id === subjectId);
	if (!subject) {
		throw new Error(`Unknown subject: ${subjectId}`);
	}
	return subject;
}

export function getSubjects(): Subject[] {
	return subjects;
}

export function getHomeData(): HomeData {
	return {
		subjects,
		suggestedSubject: subjectById('biology'),
		suggestedQuestion: {
			subjectId: 'biology',
			topic: 'Circulation',
			prompt: 'Explain why reduced blood flow to the heart can cause chest pain.',
			meta: 'Exam style - 6 marks',
			checks: [
				'Real GCSE question',
				'Step-by-step guidance',
				'Build your confidence',
				'Reveal the thinking move'
			]
		},
		featuredPatterns: [
			patterns.find((pattern) => pattern.id === 'cause-process-effect'),
			patterns.find((pattern) => pattern.id === 'structure-property'),
			patterns.find((pattern) => pattern.id === 'evidence-inference-judgement')
		].filter(Boolean) as Pattern[],
		progress
	};
}

export function getThinkingMemoryData(): ThinkingMemoryData {
	const visibleSubjectIds: SubjectId[] = ['biology', 'chemistry', 'english'];
	const groupedPatterns = visibleSubjectIds.map((subjectId) => {
		return {
			subject: subjectById(subjectId),
			patterns: patterns.filter((pattern) => pattern.subjectId === subjectId)
		};
	});
	const selectedPattern =
		patterns.find((pattern) => pattern.id === 'cause-process-effect') ?? patterns[0];

	return {
		subjects,
		patterns,
		groupedPatterns,
		selectedPattern,
		recentlySaved: patterns.slice(0, 4),
		recentlyUsed: [
			selectedPattern,
			patterns.find((pattern) => pattern.id === 'structure-property'),
			patterns.find((pattern) => pattern.id === 'evidence-inference-judgement'),
			patterns.find((pattern) => pattern.id === 'change-response')
		].filter(Boolean) as Pattern[],
		crossSubjectLinks: [
			{
				from: selectedPattern,
				to: patterns.find((pattern) => pattern.id === 'structure-property') ?? selectedPattern,
				reason: 'Same reasoning pattern. Different examples.'
			},
			{
				from: patterns.find((pattern) => pattern.id === 'structure-property') ?? selectedPattern,
				to: patterns.find((pattern) => pattern.id === 'evidence-method-effect') ?? selectedPattern,
				reason: 'Transfer your thinking across subjects.'
			}
		]
	};
}
