export type ChainQuestionLabel =
	| 'Start here'
	| 'Similar'
	| 'Small change'
	| 'New context'
	| 'Challenge';

export type ChainQuestionTeaser = {
	ref: string;
	title: string;
	teaser: string;
	label: ChainQuestionLabel;
	marks: number | null;
	command: string;
};

export type LearningChain = {
	id: string;
	title: string;
	subject: string;
	topic: string;
	symbol: string;
	paperSlug: string;
	paperLabel: string;
	summary: string;
	steps: string[];
	weakLink: string;
	primaryRef: string;
	accent: 'green' | 'blue' | 'amber';
	questions: ChainQuestionTeaser[];
};

export const learningChains: LearningChain[] = [
	{
		id: 'gas-particles-pressure',
		title: 'Gas particles and pressure',
		subject: 'Physics',
		topic: 'Particle model',
		symbol: '⚛️',
		paperSlug: 'aqa-8464p1h-jun18',
		paperLabel: 'AQA Physics Paper 1, June 2018',
		summary:
			'Use particle motion to explain why a gas pressure changes when conditions change.',
		steps: [
			'temperature changes',
			'particle speed changes',
			'wall collisions change',
			'pressure changes'
		],
		weakLink: 'Students often jump from temperature to pressure without explaining collisions.',
		primaryRef: '03.3',
		accent: 'green',
		questions: [
			{
				ref: '03.1',
				title: 'Air particles in a canister',
				teaser: 'Choose the descriptions that fit gas-particle motion.',
				label: 'Start here',
				marks: 2,
				command: 'Tick two'
			},
			{
				ref: '03.2',
				title: 'Heating air particles',
				teaser: 'Say what higher temperature does to particle movement.',
				label: 'Similar',
				marks: 1,
				command: 'What'
			},
			{
				ref: '03.3',
				title: 'Canister pressure danger',
				teaser: 'Explain why a large temperature rise could make compressed air dangerous.',
				label: 'New context',
				marks: 2,
				command: 'Explain'
			}
		]
	},
	{
		id: 'half-life-activity-change',
		title: 'Half-life and activity change',
		subject: 'Physics',
		topic: 'Radioactivity',
		symbol: '☢️',
		paperSlug: 'aqa-8464p1h-jun18',
		paperLabel: 'AQA Physics Paper 1, June 2018',
		summary: 'Compare elapsed time with half-life, then use repeated halving.',
		steps: [
			'identify the half-life',
			'count the half-lives',
			'halve activity repeatedly',
			'state the risk or year'
		],
		weakLink: 'Students mention half-life but do not count how many half-lives have passed.',
		primaryRef: '04.4',
		accent: 'amber',
		questions: [
			{
				ref: '04.4',
				title: 'Chernobyl isotope risk',
				teaser: 'Explain why caesium and iodine risks changed differently since 1986.',
				label: 'Start here',
				marks: 4,
				command: 'Explain'
			},
			{
				ref: '04.5',
				title: 'Caesium activity year',
				teaser: 'Find when caesium activity becomes 1/32 of its original value.',
				label: 'Small change',
				marks: 3,
				command: 'Determine'
			}
		]
	},
	{
		id: 'parallel-current-and-ldr',
		title: 'Current sharing and changing resistance',
		subject: 'Physics',
		topic: 'Electricity',
		symbol: '⚡',
		paperSlug: 'aqa-8464p1h-jun18',
		paperLabel: 'AQA Physics Paper 1, June 2018',
		summary: 'Track how current and potential difference change through a circuit.',
		steps: [
			'identify the circuit path',
			'resistance changes',
			'current or p.d. changes',
			'meter readings change'
		],
		weakLink: 'Students name the component but miss how the circuit quantities change.',
		primaryRef: '06.2',
		accent: 'blue',
		questions: [
			{
				ref: '06.2',
				title: 'Parallel lamp currents',
				teaser: 'Compare branch currents with the total current in a parallel circuit.',
				label: 'Start here',
				marks: 2,
				command: 'Compare'
			},
			{
				ref: '06.4',
				title: 'Meters in changing light',
				teaser: 'Explain how meter readings change when an LDR responds to conditions.',
				label: 'Challenge',
				marks: 6,
				command: 'Explain'
			}
		]
	}
];

export function getLearningChain(chainId: string) {
	return learningChains.find((chain) => chain.id === chainId) ?? null;
}

export function getQuestionTeaser(chain: LearningChain, ref: string) {
	return chain.questions.find((question) => question.ref === ref) ?? null;
}
