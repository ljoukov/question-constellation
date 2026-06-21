export type TransferDistance = 'start' | 'near' | 'stretch' | 'exam-transfer';

export type ExamMeta = {
	qualification: string;
	board: string;
	subject: string;
	tier: string;
	paper: string;
	topic: string;
	questionType: string;
	marks: number;
};

export type ChainStep = {
	id: string;
	short: string;
	label: string;
	role: 'given' | 'link' | 'process' | 'effect';
	explanation: string;
	markEvidence: string;
	commonOmission: string;
};

export type MarkChecklistItem = {
	id: string;
	text: string;
	stepId: string;
};

export type RepairChainNode = {
	id: string;
	label: string;
	stepId: string | null;
	icon: 'target' | 'droplet' | 'oxygen' | 'atom' | 'zap';
};

export type Question = {
	id: string;
	sourceRef: string;
	title: string;
	prompt: string;
	context: string;
	meta: ExamMeta;
	transferDistance: TransferDistance;
	distanceLabel: string;
	constellationRole: string;
	modelAnswer: string;
	commonWeakAnswer: string;
	weakAnswerMissingStepIds: string[];
	checklist: MarkChecklistItem[];
	repairChain: RepairChainNode[];
	practiceDraft: string;
	whyThisFits: string;
};

export type AnswerChain = {
	id: string;
	title: string;
	canonicalText: string;
	concreteText: string;
	pageTitle: string;
	summary: string;
	steps: ChainStep[];
	commonMissingLink: string;
	modelAnswer: string;
};

export type Constellation = {
	id: string;
	title: string;
	summary: string;
	chainId: string;
	questionIds: string[];
};

export type MemoryEntry = {
	id: string;
	chainId: string;
	savedFromQuestionId: string;
	lastPractisedQuestionId: string;
	nextReviewQuestionId: string;
	mastery: 'new' | 'building' | 'secure';
	lastSavedLabel: string;
	reviewLabel: string;
	attemptedQuestionIds: string[];
	recurringMissingStepId: string;
};

export type NavigationData = {
	primaryQuestionId: string;
	primaryChainId: string;
	primaryPracticeQuestionId: string;
};

export type PublicQuestionData = {
	question: Question;
	chain: AnswerChain;
	constellation: Constellation;
	nextQuestion: Question;
};

export type AnswerChainPageData = {
	chain: AnswerChain;
	startQuestion: Question;
	questions: Question[];
	constellation: Constellation;
};

export type QuestionChainPageData = AnswerChainPageData & {
	question: Question;
	practiceQuestion: Question;
};

export type ConstellationPageData = AnswerChainPageData & {
	practiceQuestion: Question;
};

export type PracticePageData = {
	question: Question;
	chain: AnswerChain;
	constellation: Constellation;
	questions: Question[];
	nextQuestion: Question;
	memoryEntry: MemoryEntry;
};

export type ThinkingMemoryPageData = {
	entries: Array<
		MemoryEntry & {
			chain: AnswerChain;
			savedFromQuestion: Question;
			lastPractisedQuestion: Question;
			nextReviewQuestion: Question;
			recurringMissingStep: ChainStep;
		}
	>;
	selected: MemoryEntry & {
		chain: AnswerChain;
		savedFromQuestion: Question;
		lastPractisedQuestion: Question;
		nextReviewQuestion: Question;
		recurringMissingStep: ChainStep;
	};
	questions: Question[];
};

const chain: AnswerChain = {
	id: 'supply-respiration-energy-effect',
	title: 'Supply -> respiration -> energy -> effect',
	canonicalText: 'supply -> oxygen/glucose -> respiration -> energy -> effect',
	concreteText: 'blood flow -> oxygen -> respiration -> energy -> pain',
	pageTitle: 'Same answer chain',
	summary:
		'Use this when a question asks how a change in supply affects cell respiration, energy release, and the final visible effect.',
	commonMissingLink:
		'Students often jump from blood or oxygen straight to the symptom and miss respiration or energy.',
	modelAnswer:
		'Reduced blood flow means less oxygen reaches heart muscle cells. The cells carry out less aerobic respiration, so less energy is released for contraction. This can cause chest pain because the muscle cannot work normally.',
	steps: [
		{
			id: 'supply',
			short: 'Supply changes',
			label: 'Start with the concrete supply change',
			role: 'given',
			explanation:
				'Name the change in blood flow, oxygen, glucose, or another useful supply before explaining the symptom.',
			markEvidence: 'Mark schemes usually credit the reduced supply before downstream effects.',
			commonOmission:
				'Starting with pain, tiredness, or poor growth without naming what changed first.'
		},
		{
			id: 'resource',
			short: 'Useful substance reaches cells',
			label: 'Say what reaches the cells',
			role: 'link',
			explanation:
				'Connect the supply change to oxygen or glucose reaching the cells that need to work.',
			markEvidence:
				'Mark schemes usually require oxygen, glucose, or named reactant reaching cells.',
			commonOmission: 'Saying "less blood" or "less food" without the useful substance.'
		},
		{
			id: 'respiration',
			short: 'Respiration changes',
			label: 'Connect the substance to respiration',
			role: 'process',
			explanation:
				'State how the change affects aerobic respiration or respiration rate inside the cells.',
			markEvidence: 'The respiration link is normally the hidden mark students miss.',
			commonOmission: 'Mentioning oxygen but not saying what oxygen is used for.'
		},
		{
			id: 'energy',
			short: 'Energy release changes',
			label: 'Name the energy consequence',
			role: 'link',
			explanation:
				'Show that less respiration means less energy released for the cell or tissue job.',
			markEvidence: 'Mark schemes often credit energy release separately from respiration.',
			commonOmission: 'Saying cells are "weaker" without explaining energy release.'
		},
		{
			id: 'effect',
			short: 'Final effect',
			label: 'Finish with the effect asked for',
			role: 'effect',
			explanation:
				'Return to the exact outcome in the prompt: pain, movement, active transport, contraction, or growth.',
			markEvidence:
				'The final mark usually depends on answering the symptom or outcome in the question.',
			commonOmission: 'Writing a good process chain but not answering the actual question.'
		}
	]
};

const baseMeta: Omit<ExamMeta, 'topic' | 'questionType' | 'marks'> = {
	qualification: 'GCSE',
	board: 'AQA',
	subject: 'Combined Science',
	tier: 'Higher',
	paper: 'Biology Paper 1'
};

const questions: Question[] = [
	{
		id: 'blood-flow-chest-pain',
		sourceRef: 'Q01.2',
		title: 'Chest pain from reduced blood flow',
		prompt: 'Explain why reduced blood flow to the heart can cause chest pain.',
		context:
			'A coronary artery becomes narrowed. During exercise, the heart muscle needs more oxygen for aerobic respiration and contraction.',
		meta: {
			...baseMeta,
			topic: 'Organisation: the heart and blood vessels',
			questionType: 'Explain',
			marks: 4
		},
		transferDistance: 'start',
		distanceLabel: 'start',
		constellationRole: 'First question',
		modelAnswer: chain.modelAnswer,
		commonWeakAnswer: 'Less blood gets to the heart, so it hurts.',
		weakAnswerMissingStepIds: ['respiration', 'energy'],
		checklist: [
			{
				id: 'blood-flow',
				text: 'Say that reduced blood flow lowers oxygen supply to heart muscle cells.',
				stepId: 'resource'
			},
			{
				id: 'less-respiration',
				text: 'Link less oxygen to less aerobic respiration.',
				stepId: 'respiration'
			},
			{
				id: 'less-energy',
				text: 'Say that less respiration releases less energy for contraction.',
				stepId: 'energy'
			},
			{
				id: 'pain-effect',
				text: 'Finish by explaining chest pain or the heart muscle not working normally.',
				stepId: 'effect'
			}
		],
		repairChain: [
			{ id: 'blood-flow-node', label: 'blood flow', stepId: null, icon: 'droplet' },
			{ id: 'oxygen-node', label: 'oxygen', stepId: 'resource', icon: 'oxygen' },
			{ id: 'respiration-node', label: 'respiration', stepId: 'respiration', icon: 'atom' },
			{ id: 'energy-node', label: 'energy', stepId: 'energy', icon: 'zap' },
			{ id: 'pain-node', label: 'pain', stepId: 'effect', icon: 'target' }
		],
		practiceDraft:
			'Less blood gets to the heart during exercise so the heart muscle does not get enough oxygen.',
		whyThisFits:
			'The mark-scoring answer must connect blood flow to oxygen, respiration, energy release, and pain.'
	},
	{
		id: 'heart-rate-exercise',
		sourceRef: 'Q03.4',
		title: 'Heart rate during exercise',
		prompt:
			'Explain why heart rate increases during vigorous exercise. Refer to muscle cells in your answer.',
		context:
			'Muscle cells contract more during vigorous exercise, so their demand for respiration increases.',
		meta: {
			...baseMeta,
			topic: 'Bioenergetics: aerobic respiration',
			questionType: 'Explain',
			marks: 4
		},
		transferDistance: 'near',
		distanceLabel: 'near',
		constellationRole: 'Nearby practice',
		modelAnswer:
			'During vigorous exercise, muscle cells need more energy for contraction. They respire faster, so they need more oxygen and glucose delivered in the blood. A higher heart rate increases blood flow to the muscles.',
		commonWeakAnswer: 'The heart beats faster because the muscles are working harder.',
		weakAnswerMissingStepIds: ['resource', 'respiration', 'energy'],
		checklist: [
			{
				id: 'muscle-energy',
				text: 'Say that muscle cells need more energy for contraction.',
				stepId: 'energy'
			},
			{
				id: 'faster-respiration',
				text: 'Link this to a higher rate of respiration.',
				stepId: 'respiration'
			},
			{
				id: 'deliver-substances',
				text: 'Mention oxygen and/or glucose being delivered in the blood.',
				stepId: 'resource'
			},
			{
				id: 'heart-rate-effect',
				text: 'Explain that increased heart rate raises blood flow to muscles.',
				stepId: 'effect'
			}
		],
		repairChain: [
			{ id: 'heart-rate-node', label: 'heart rate', stepId: null, icon: 'target' },
			{ id: 'blood-flow-node', label: 'blood flow', stepId: 'effect', icon: 'droplet' },
			{ id: 'oxygen-glucose-node', label: 'oxygen/glucose', stepId: 'resource', icon: 'oxygen' },
			{ id: 'respiration-node', label: 'respiration', stepId: 'respiration', icon: 'atom' },
			{ id: 'energy-node', label: 'energy', stepId: 'energy', icon: 'zap' },
			{
				id: 'contraction-node',
				label: 'muscle contraction',
				stepId: 'energy',
				icon: 'target'
			}
		],
		practiceDraft:
			'The heart rate increases because the muscles need more oxygen while they are working hard.',
		whyThisFits:
			'It uses the same supply, respiration, energy, effect links but starts from increased demand.'
	},
	{
		id: 'muscle-fatigue-respiration',
		sourceRef: 'Q04.1',
		title: 'Muscle fatigue in vigorous exercise',
		prompt:
			'During vigorous exercise, oxygen supply may not meet demand. Explain why muscles can become fatigued.',
		context:
			'The question asks for the chain from limited oxygen to reduced aerobic respiration and muscle performance.',
		meta: {
			...baseMeta,
			topic: 'Bioenergetics: exercise',
			questionType: 'Explain',
			marks: 4
		},
		transferDistance: 'near',
		distanceLabel: 'near',
		constellationRole: 'Nearby practice',
		modelAnswer:
			'If not enough oxygen reaches muscle cells, aerobic respiration cannot release energy fast enough. The cells rely more on anaerobic respiration, lactic acid builds up, and the muscles fatigue.',
		commonWeakAnswer: 'The muscles get tired because there is not enough oxygen.',
		weakAnswerMissingStepIds: ['respiration', 'energy', 'effect'],
		checklist: [
			{
				id: 'oxygen-demand',
				text: 'Say oxygen supply does not meet the demand of muscle cells.',
				stepId: 'resource'
			},
			{
				id: 'aerobic-rate',
				text: 'Connect low oxygen to less aerobic respiration.',
				stepId: 'respiration'
			},
			{
				id: 'energy-rate',
				text: 'Explain that energy is released too slowly for contraction.',
				stepId: 'energy'
			},
			{
				id: 'fatigue-effect',
				text: 'Finish with fatigue or lactic acid build-up affecting contraction.',
				stepId: 'effect'
			}
		],
		repairChain: [
			{ id: 'oxygen-supply-node', label: 'oxygen supply', stepId: 'resource', icon: 'oxygen' },
			{ id: 'respiration-node', label: 'respiration', stepId: 'respiration', icon: 'atom' },
			{ id: 'energy-node', label: 'energy', stepId: 'energy', icon: 'zap' },
			{ id: 'fatigue-node', label: 'fatigue', stepId: 'effect', icon: 'target' }
		],
		practiceDraft: 'The muscles fatigue because oxygen cannot get to them quickly enough.',
		whyThisFits:
			'The same respiration and energy links explain the final effect, even though the symptom is fatigue rather than chest pain.'
	},
	{
		id: 'sperm-mitochondria',
		sourceRef: 'Q05.3',
		title: 'Sperm cells and mitochondria',
		prompt: 'Explain why sperm cells contain many mitochondria.',
		context:
			'This question looks like cell structure, but the marks come from connecting mitochondria to respiration, energy, and movement.',
		meta: {
			...baseMeta,
			topic: 'Cell biology: specialised cells',
			questionType: 'Explain',
			marks: 3
		},
		transferDistance: 'stretch',
		distanceLabel: 'stretch',
		constellationRole: 'Less obvious topic',
		modelAnswer:
			'Mitochondria are the site of aerobic respiration. Respiration releases energy, which sperm cells need to swim towards the egg.',
		commonWeakAnswer: 'Sperm cells have mitochondria so they can swim.',
		weakAnswerMissingStepIds: ['respiration', 'energy'],
		checklist: [
			{
				id: 'mitochondria-site',
				text: 'Say mitochondria are where aerobic respiration happens.',
				stepId: 'respiration'
			},
			{
				id: 'release-energy',
				text: 'Say respiration releases energy.',
				stepId: 'energy'
			},
			{
				id: 'movement',
				text: 'Use the energy to explain sperm movement towards the egg.',
				stepId: 'effect'
			}
		],
		repairChain: [
			{ id: 'mitochondria-node', label: 'mitochondria', stepId: null, icon: 'atom' },
			{ id: 'respiration-node', label: 'respiration', stepId: 'respiration', icon: 'atom' },
			{ id: 'energy-node', label: 'energy', stepId: 'energy', icon: 'zap' },
			{ id: 'movement-node', label: 'movement to egg', stepId: 'effect', icon: 'target' }
		],
		practiceDraft: 'They have mitochondria because they need energy to swim.',
		whyThisFits:
			'The context changes to cell structure, but full marks still depend on respiration -> energy -> effect.'
	},
	{
		id: 'root-hair-active-transport',
		sourceRef: 'Q06.2',
		title: 'Root hair cells and active transport',
		prompt:
			'Explain why root hair cells need energy for active transport of mineral ions from the soil.',
		context:
			'The visible topic is plants, but the reasoning chain still runs through respiration and energy release.',
		meta: {
			...baseMeta,
			topic: 'Transport in cells: active transport',
			questionType: 'Explain',
			marks: 4
		},
		transferDistance: 'stretch',
		distanceLabel: 'stretch',
		constellationRole: 'Less obvious topic',
		modelAnswer:
			'Active transport moves mineral ions from a lower concentration in the soil to a higher concentration in the root hair cell. This movement is against the concentration gradient, so it requires energy released by respiration.',
		commonWeakAnswer: 'Root hair cells need energy to take in minerals.',
		weakAnswerMissingStepIds: ['respiration', 'effect'],
		checklist: [
			{
				id: 'against-gradient',
				text: 'Say active transport moves ions against the concentration gradient.',
				stepId: 'effect'
			},
			{
				id: 'energy-needed',
				text: 'Say this process requires energy.',
				stepId: 'energy'
			},
			{
				id: 'respiration-source',
				text: 'Link that energy to respiration.',
				stepId: 'respiration'
			},
			{
				id: 'mineral-uptake',
				text: 'Return to mineral ions being taken into root hair cells.',
				stepId: 'effect'
			}
		],
		repairChain: [
			{ id: 'root-hair-node', label: 'root hair cell', stepId: null, icon: 'target' },
			{ id: 'active-transport-node', label: 'active transport', stepId: 'effect', icon: 'target' },
			{ id: 'gradient-node', label: 'against gradient', stepId: 'effect', icon: 'droplet' },
			{ id: 'energy-node', label: 'energy', stepId: 'energy', icon: 'zap' },
			{ id: 'respiration-node', label: 'respiration', stepId: 'respiration', icon: 'atom' }
		],
		practiceDraft: 'They need energy because minerals are moved into the cell by active transport.',
		whyThisFits:
			'The answer still has to explain how a cell process depends on energy released by respiration.'
	},
	{
		id: 'blocked-artery-heart-muscle',
		sourceRef: 'Q08.5',
		title: 'Blocked arteries and heart muscle',
		prompt:
			'A blood clot blocks a coronary artery. Explain how this can damage part of the heart muscle.',
		context:
			'This is the harder transfer because the final effect is tissue damage rather than pain.',
		meta: {
			...baseMeta,
			topic: 'Organisation: coronary heart disease',
			questionType: 'Explain',
			marks: 5
		},
		transferDistance: 'exam-transfer',
		distanceLabel: 'exam transfer',
		constellationRole: 'Exam transfer',
		modelAnswer:
			'The blocked artery stops oxygenated blood reaching part of the heart muscle. Without oxygen, the cells cannot carry out enough aerobic respiration, so not enough energy is released. The cells cannot contract or stay alive and the tissue can be damaged.',
		commonWeakAnswer: 'The blockage stops blood getting to the heart and damages it.',
		weakAnswerMissingStepIds: ['resource', 'respiration', 'energy'],
		checklist: [
			{
				id: 'blocked-supply',
				text: 'Say the blockage stops oxygenated blood reaching part of the heart muscle.',
				stepId: 'resource'
			},
			{
				id: 'cannot-respire',
				text: 'Link oxygen shortage to less aerobic respiration.',
				stepId: 'respiration'
			},
			{
				id: 'not-enough-energy',
				text: 'Say less energy is released for contraction or cell survival.',
				stepId: 'energy'
			},
			{
				id: 'tissue-damage',
				text: 'Finish with heart muscle cells being damaged or dying.',
				stepId: 'effect'
			}
		],
		repairChain: [
			{ id: 'blocked-artery-node', label: 'blocked artery', stepId: null, icon: 'target' },
			{
				id: 'oxygenated-blood-node',
				label: 'oxygenated blood',
				stepId: 'resource',
				icon: 'oxygen'
			},
			{ id: 'respiration-node', label: 'respiration', stepId: 'respiration', icon: 'atom' },
			{ id: 'energy-node', label: 'energy', stepId: 'energy', icon: 'zap' },
			{ id: 'damage-node', label: 'tissue damage', stepId: 'effect', icon: 'target' }
		],
		practiceDraft: 'The artery is blocked so blood and oxygen cannot get to the heart muscle.',
		whyThisFits:
			'The exam-transfer version keeps the same ordered chain but asks for damage rather than pain.'
	}
];

const constellation: Constellation = {
	id: 'biology-respiration-energy',
	title: 'Blood Flow & Respiration',
	summary:
		'Six GCSE Biology questions that look different but reward the same supply, respiration, energy, effect reasoning.',
	chainId: chain.id,
	questionIds: questions.map((question) => question.id)
};

const memoryEntries: MemoryEntry[] = [
	{
		id: 'memory-respiration-energy',
		chainId: chain.id,
		savedFromQuestionId: 'blood-flow-chest-pain',
		lastPractisedQuestionId: 'heart-rate-exercise',
		nextReviewQuestionId: 'root-hair-active-transport',
		mastery: 'building',
		lastSavedLabel: 'Saved after 2 repaired attempts',
		reviewLabel: 'Review today',
		attemptedQuestionIds: ['blood-flow-chest-pain', 'heart-rate-exercise'],
		recurringMissingStepId: 'respiration'
	}
];

function findQuestion(questionId: string): Question {
	const question = questions.find((item) => item.id === questionId);

	if (!question) {
		throw new Error(`Question not found: ${questionId}`);
	}

	return question;
}

function findChain(chainId: string): AnswerChain {
	if (chain.id !== chainId) {
		throw new Error(`Answer chain not found: ${chainId}`);
	}

	return chain;
}

function getQuestionsForChain(chainId: string): Question[] {
	findChain(chainId);
	return constellation.questionIds.map(findQuestion);
}

function findMemoryEntry(entryId = memoryEntries[0].id): MemoryEntry {
	const entry = memoryEntries.find((item) => item.id === entryId);

	if (!entry) {
		throw new Error(`Memory entry not found: ${entryId}`);
	}

	return entry;
}

function hydrateMemoryEntry(entry: MemoryEntry) {
	const hydratedChain = findChain(entry.chainId);
	const recurringMissingStep = hydratedChain.steps.find(
		(step) => step.id === entry.recurringMissingStepId
	);

	if (!recurringMissingStep) {
		throw new Error(`Missing chain step: ${entry.recurringMissingStepId}`);
	}

	return {
		...entry,
		chain: hydratedChain,
		savedFromQuestion: findQuestion(entry.savedFromQuestionId),
		lastPractisedQuestion: findQuestion(entry.lastPractisedQuestionId),
		nextReviewQuestion: findQuestion(entry.nextReviewQuestionId),
		recurringMissingStep
	};
}

export function getNavigationData(): NavigationData {
	return {
		primaryQuestionId: questions[0].id,
		primaryChainId: chain.id,
		primaryPracticeQuestionId: questions[1].id
	};
}

export function getPublicQuestionData(questionId = questions[0].id): PublicQuestionData {
	const question = findQuestion(questionId);
	const questionIndex = questions.findIndex((item) => item.id === question.id);
	const nextQuestion = questions[(questionIndex + 1) % questions.length];

	return {
		question,
		chain,
		constellation,
		nextQuestion
	};
}

export function getAnswerChainPageData(chainId: string): AnswerChainPageData {
	return {
		chain: findChain(chainId),
		startQuestion: questions[0],
		questions: getQuestionsForChain(chainId),
		constellation
	};
}

export function getQuestionChainPageData(questionId: string): QuestionChainPageData {
	const question = findQuestion(questionId);
	const questionIndex = questions.findIndex((item) => item.id === question.id);
	const practiceQuestion = questions[(questionIndex + 1) % questions.length];

	return {
		...getAnswerChainPageData(chain.id),
		question,
		practiceQuestion
	};
}

export function getConstellationPageData(chainId: string): ConstellationPageData {
	return {
		...getAnswerChainPageData(chainId),
		practiceQuestion: questions[1]
	};
}

export function getPracticePageData(questionId: string): PracticePageData {
	const question = findQuestion(questionId);
	const questionIndex = questions.findIndex((item) => item.id === question.id);
	const nextQuestion = questions[(questionIndex + 1) % questions.length];

	return {
		question,
		chain,
		constellation,
		questions,
		nextQuestion,
		memoryEntry: findMemoryEntry()
	};
}

export function getThinkingMemoryPageData(): ThinkingMemoryPageData {
	const entries = memoryEntries.map(hydrateMemoryEntry);

	return {
		entries,
		selected: entries[0],
		questions
	};
}
