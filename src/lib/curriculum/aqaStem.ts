export type StemSubject = 'Biology' | 'Chemistry' | 'Physics' | 'Combined Science';

export type StemCurriculumTopic = {
	id: string;
	code: string;
	title: string;
	paper: string;
	specUrl: string;
};

export type StemCurriculumSubject = {
	board: 'AQA';
	qualification: 'GCSE';
	subject: StemSubject;
	specificationCode: string;
	specificationUrl: string;
	localSpecificationPath: string;
	topics: StemCurriculumTopic[];
};

const sourceBase = 'https://www.aqa.org.uk';

export const aqaStemCurriculum: StemCurriculumSubject[] = [
	{
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		specificationCode: '8461',
		specificationUrl: `${sourceBase}/subjects/biology/gcse/biology-8461/specification`,
		localSpecificationPath:
			'data/aqa-science-specifications/aqa-gcse-biology-8461-specification.pdf',
		topics: [
			{
				id: 'aqa-gcse-biology-cell-biology',
				code: '4.1',
				title: 'Cell biology',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/biology/gcse/biology-8461/specification/subject-content/cell-biology`
			},
			{
				id: 'aqa-gcse-biology-organisation',
				code: '4.2',
				title: 'Organisation',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/biology/gcse/biology-8461/specification/subject-content/organisation`
			},
			{
				id: 'aqa-gcse-biology-infection-and-response',
				code: '4.3',
				title: 'Infection and response',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/biology/gcse/biology-8461/specification/subject-content/infection-and-response`
			},
			{
				id: 'aqa-gcse-biology-bioenergetics',
				code: '4.4',
				title: 'Bioenergetics',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/biology/gcse/biology-8461/specification/subject-content/bioenergetics`
			},
			{
				id: 'aqa-gcse-biology-homeostasis-and-response',
				code: '4.5',
				title: 'Homeostasis and response',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/biology/gcse/biology-8461/specification/subject-content/homeostasis-and-response`
			},
			{
				id: 'aqa-gcse-biology-inheritance-variation-and-evolution',
				code: '4.6',
				title: 'Inheritance, variation and evolution',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/biology/gcse/biology-8461/specification/subject-content/inheritance-variation-and-evolution`
			},
			{
				id: 'aqa-gcse-biology-ecology',
				code: '4.7',
				title: 'Ecology',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/biology/gcse/biology-8461/specification/subject-content/ecology`
			}
		]
	},
	{
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		specificationCode: '8462',
		specificationUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification`,
		localSpecificationPath:
			'data/aqa-science-specifications/aqa-gcse-chemistry-8462-specification.pdf',
		topics: [
			{
				id: 'aqa-gcse-chemistry-atomic-structure',
				code: '4.1',
				title: 'Atomic structure and the periodic table',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/atomic-structure-and-the-periodic-table`
			},
			{
				id: 'aqa-gcse-chemistry-bonding-structure-properties',
				code: '4.2',
				title: 'Bonding, structure, and the properties of matter',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/bonding-structure-and-the-properties-of-matter`
			},
			{
				id: 'aqa-gcse-chemistry-quantitative',
				code: '4.3',
				title: 'Quantitative chemistry',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/quantitative-chemistry`
			},
			{
				id: 'aqa-gcse-chemistry-chemical-changes',
				code: '4.4',
				title: 'Chemical changes',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/chemical-changes`
			},
			{
				id: 'aqa-gcse-chemistry-energy-changes',
				code: '4.5',
				title: 'Energy changes',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/energy-changes`
			},
			{
				id: 'aqa-gcse-chemistry-rates',
				code: '4.6',
				title: 'The rate and extent of chemical change',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/the-rate-and-extent-of-chemical-change`
			},
			{
				id: 'aqa-gcse-chemistry-organic',
				code: '4.7',
				title: 'Organic chemistry',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/organic-chemistry`
			},
			{
				id: 'aqa-gcse-chemistry-analysis',
				code: '4.8',
				title: 'Chemical analysis',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/chemical-analysis`
			},
			{
				id: 'aqa-gcse-chemistry-atmosphere',
				code: '4.9',
				title: 'Chemistry of the atmosphere',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/chemistry-of-the-atmosphere`
			},
			{
				id: 'aqa-gcse-chemistry-using-resources',
				code: '4.10',
				title: 'Using resources',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/using-resources`
			},
			{
				id: 'aqa-gcse-chemistry-key-ideas',
				code: '4.11',
				title: 'Key ideas',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/key-ideas`
			}
		]
	},
	{
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		specificationCode: '8463',
		specificationUrl: `${sourceBase}/subjects/physics/gcse/physics-8463/specification`,
		localSpecificationPath:
			'data/aqa-science-specifications/aqa-gcse-physics-8463-specification.pdf',
		topics: [
			{
				id: 'aqa-gcse-physics-energy',
				code: '4.1',
				title: 'Energy',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/physics/gcse/physics-8463/specification/subject-content/energy`
			},
			{
				id: 'aqa-gcse-physics-electricity',
				code: '4.2',
				title: 'Electricity',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/physics/gcse/physics-8463/specification/subject-content/electricity`
			},
			{
				id: 'aqa-gcse-physics-particle-model',
				code: '4.3',
				title: 'Particle model of matter',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/physics/gcse/physics-8463/specification/subject-content/particle-model-of-matter`
			},
			{
				id: 'aqa-gcse-physics-atomic-structure',
				code: '4.4',
				title: 'Atomic structure',
				paper: 'Paper 1',
				specUrl: `${sourceBase}/subjects/physics/gcse/physics-8463/specification/subject-content/atomic-structure`
			},
			{
				id: 'aqa-gcse-physics-forces',
				code: '4.5',
				title: 'Forces',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/physics/gcse/physics-8463/specification/subject-content/forces`
			},
			{
				id: 'aqa-gcse-physics-waves',
				code: '4.6',
				title: 'Waves',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/physics/gcse/physics-8463/specification/subject-content/waves`
			},
			{
				id: 'aqa-gcse-physics-magnetism',
				code: '4.7',
				title: 'Magnetism and electromagnetism',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/physics/gcse/physics-8463/specification/subject-content/magnetism-and-electromagnetism`
			},
			{
				id: 'aqa-gcse-physics-space',
				code: '4.8',
				title: 'Space physics',
				paper: 'Paper 2',
				specUrl: `${sourceBase}/subjects/physics/gcse/physics-8463/specification/subject-content/space-physics`
			}
		]
	}
];

export const stemSubjectOptions = aqaStemCurriculum.map((subject) => subject.subject);

export function getAqaStemSubject(subject: string | null | undefined): StemCurriculumSubject {
	const normalized = (subject ?? '').trim().toLowerCase();
	return (
		aqaStemCurriculum.find((entry) => entry.subject.toLowerCase() === normalized) ??
		aqaStemCurriculum[0]
	);
}

export function subjectTopicMatches(subject: string, topic: string): StemCurriculumTopic | null {
	const normalizedTopic = topic.toLowerCase();
	return (
		getAqaStemSubject(subject).topics.find((entry) =>
			normalizedTopic.includes(entry.title.toLowerCase())
		) ?? null
	);
}
