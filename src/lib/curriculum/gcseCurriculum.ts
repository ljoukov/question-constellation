export type GcseCurriculumTopic = {
	id: string;
	board: string;
	qualification: 'GCSE';
	subject: string;
	code: string;
	title: string;
	paper: string;
	specUrl: string;
	aliases: string[];
};

const aqaBase = 'https://www.aqa.org.uk';
const ocrBase = 'https://www.ocr.org.uk';

export const preferredBoardBySubject: Record<string, string> = {
	Biology: 'AQA',
	Chemistry: 'AQA',
	Physics: 'AQA',
	'Computer Science': 'OCR',
	Geography: 'AQA',
	History: 'AQA',
	'English Language': 'AQA',
	'English Literature': 'AQA'
};

export const gcseCurriculumTopics: GcseCurriculumTopic[] = [
	{
		id: 'aqa-biology-cell-biology',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		code: '4.1',
		title: 'Cell biology',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/biology/gcse/biology-8461/specification/subject-content/cell-biology`,
		aliases: ['cell biology']
	},
	{
		id: 'aqa-biology-organisation',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		code: '4.2',
		title: 'Organisation',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/biology/gcse/biology-8461/specification/subject-content/organisation`,
		aliases: ['organisation', 'organization']
	},
	{
		id: 'aqa-biology-infection-response',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		code: '4.3',
		title: 'Infection and response',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/biology/gcse/biology-8461/specification/subject-content/infection-and-response`,
		aliases: ['infection and response']
	},
	{
		id: 'aqa-biology-bioenergetics',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		code: '4.4',
		title: 'Bioenergetics',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/biology/gcse/biology-8461/specification/subject-content/bioenergetics`,
		aliases: ['bioenergetics']
	},
	{
		id: 'aqa-biology-homeostasis-response',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		code: '4.5',
		title: 'Homeostasis and response',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/biology/gcse/biology-8461/specification/subject-content/homeostasis-and-response`,
		aliases: ['homeostasis and response']
	},
	{
		id: 'aqa-biology-inheritance-variation-evolution',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		code: '4.6',
		title: 'Inheritance, variation and evolution',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/biology/gcse/biology-8461/specification/subject-content/inheritance-variation-and-evolution`,
		aliases: ['inheritance variation and evolution', 'inheritance, variation and evolution']
	},
	{
		id: 'aqa-biology-ecology',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		code: '4.7',
		title: 'Ecology',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/biology/gcse/biology-8461/specification/subject-content/ecology`,
		aliases: ['ecology']
	},
	{
		id: 'aqa-chemistry-atomic-structure',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.1',
		title: 'Atomic structure and the periodic table',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification/specification-at-a-glance`,
		aliases: ['atomic structure', 'periodic table']
	},
	{
		id: 'aqa-chemistry-bonding-structure',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.2',
		title: 'Bonding, structure, and the properties of matter',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification/specification-at-a-glance`,
		aliases: ['bonding', 'structure', 'properties of matter']
	},
	{
		id: 'aqa-chemistry-quantitative',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.3',
		title: 'Quantitative chemistry',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification/specification-at-a-glance`,
		aliases: ['quantitative chemistry', 'moles']
	},
	{
		id: 'aqa-chemistry-chemical-changes',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.4',
		title: 'Chemical changes',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/chemical-changes`,
		aliases: ['chemical changes', 'electrolysis', 'acids']
	},
	{
		id: 'aqa-chemistry-energy-changes',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.5',
		title: 'Energy changes',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/energy-changes`,
		aliases: ['energy changes', 'exothermic', 'endothermic']
	},
	{
		id: 'aqa-chemistry-rates',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.6',
		title: 'The rate and extent of chemical change',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification`,
		aliases: ['rate and extent', 'rates of reaction', 'chemical change']
	},
	{
		id: 'aqa-chemistry-organic',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.7',
		title: 'Organic chemistry',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification`,
		aliases: ['organic chemistry']
	},
	{
		id: 'aqa-chemistry-analysis',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.8',
		title: 'Chemical analysis',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification`,
		aliases: ['chemical analysis', 'tests']
	},
	{
		id: 'aqa-chemistry-atmosphere',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.9',
		title: 'Chemistry of the atmosphere',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/chemistry-of-the-atmosphere`,
		aliases: ['atmosphere', 'chemistry of the atmosphere']
	},
	{
		id: 'aqa-chemistry-using-resources',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Chemistry',
		code: '4.10',
		title: 'Using resources',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/using-resources`,
		aliases: ['using resources', 'resources']
	},
	{
		id: 'aqa-physics-energy',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		code: '4.1',
		title: 'Energy',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/physics/gcse/physics-8463/specification/subject-content/energy`,
		aliases: ['energy']
	},
	{
		id: 'aqa-physics-electricity',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		code: '4.2',
		title: 'Electricity',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/physics/gcse/physics-8463/specification/subject-content/electricity`,
		aliases: ['electricity', 'circuits']
	},
	{
		id: 'aqa-physics-particle-model',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		code: '4.3',
		title: 'Particle model of matter',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/physics/gcse/physics-8463/specification/subject-content/particle-model-of-matter`,
		aliases: ['particle model', 'particle model of matter']
	},
	{
		id: 'aqa-physics-atomic-structure',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		code: '4.4',
		title: 'Atomic structure',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/physics/gcse/physics-8463/specification/subject-content/atomic-structure`,
		aliases: ['atomic structure', 'radioactivity', 'half-life']
	},
	{
		id: 'aqa-physics-forces',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		code: '4.5',
		title: 'Forces',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/physics/gcse/physics-8463/specification/subject-content/forces`,
		aliases: ['forces', 'momentum', 'elasticity']
	},
	{
		id: 'aqa-physics-waves',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		code: '4.6',
		title: 'Waves',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/physics/gcse/physics-8463/specification/subject-content/waves`,
		aliases: ['waves', 'wave speed']
	},
	{
		id: 'aqa-physics-magnetism',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		code: '4.7',
		title: 'Magnetism and electromagnetism',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/physics/gcse/physics-8463/specification/subject-content/magnetism-and-electromagnetism`,
		aliases: ['magnetism', 'electromagnetism', 'motor effect']
	},
	{
		id: 'aqa-physics-space',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Physics',
		code: '4.8',
		title: 'Space physics',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/physics/gcse/physics-8463/specification/subject-content/space-physics`,
		aliases: ['space physics']
	},
	{
		id: 'aqa-geography-physical-environment',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Geography',
		code: '3.1',
		title: 'Living with the physical environment',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/geography/gcse/geography-8035/specification/subject-content/living-with-the-physical-environment`,
		aliases: ['living with the physical environment', 'paper 1', 'natural hazards', 'living world']
	},
	{
		id: 'aqa-geography-human-environment',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Geography',
		code: '3.2',
		title: 'Challenges in the human environment',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/geography/gcse/geography-8035/specification/subject-content/challenges-in-the-human-environment`,
		aliases: ['challenges in the human environment', 'paper 2', 'urban issues', 'resource management']
	},
	{
		id: 'aqa-geography-applications',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Geography',
		code: '3.3',
		title: 'Geographical applications',
		paper: 'Paper 3',
		specUrl: `${aqaBase}/subjects/geography/gcse/geography-8035/specification/subject-content`,
		aliases: ['geographical applications', 'paper 3', 'fieldwork', 'issue evaluation']
	},
	{
		id: 'aqa-history-period-studies',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'History',
		code: '1A',
		title: 'Paper 1 Section A: Period studies',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/history/gcse/history-8145/specification/specification-at-a-glance`,
		aliases: ['paper 1 section a', 'america, 1840-1895', 'germany, 1890-1945', 'russia, 1894-1945', 'america, 1920-1973']
	},
	{
		id: 'aqa-history-wider-world',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'History',
		code: '1B',
		title: 'Paper 1 Section B: Wider world depth studies',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/history/gcse/history-8145/specification/specification-at-a-glance`,
		aliases: ['paper 1 section b', 'conflict and tension', 'first world war', 'inter-war years', 'east and west', 'asia', 'gulf and afghanistan']
	},
	{
		id: 'aqa-history-thematic-studies',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'History',
		code: '2A',
		title: 'Paper 2 Section A: Thematic studies',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/history/gcse/history-8145/specification/subject-content/shaping-the-nation`,
		aliases: ['paper 2 section a', 'health and the people', 'power and the people', 'migration, empires and the people']
	},
	{
		id: 'aqa-history-british-depth',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'History',
		code: '2B',
		title: 'Paper 2 Section B: British depth studies',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/history/gcse/history-8145/specification/specification-at-a-glance`,
		aliases: ['paper 2 section b', 'norman england', 'medieval england', 'elizabethan england', 'restoration england']
	},
	{
		id: 'ocr-computer-science-systems',
		board: 'OCR',
		qualification: 'GCSE',
		subject: 'Computer Science',
		code: 'J277/01',
		title: 'Computer systems',
		paper: 'Paper 1',
		specUrl: `${ocrBase}/qualifications/gcse/computer-science-j277-from-2020/`,
		aliases: ['computer systems', 'systems architecture', 'memory and storage', 'networks', 'network security', 'systems software']
	},
	{
		id: 'ocr-computer-science-algorithms',
		board: 'OCR',
		qualification: 'GCSE',
		subject: 'Computer Science',
		code: 'J277/02',
		title: 'Computational thinking, algorithms and programming',
		paper: 'Paper 2',
		specUrl: `${ocrBase}/qualifications/gcse/computer-science-j277-from-2020/`,
		aliases: ['computational thinking', 'algorithms', 'programming', 'boolean logic', 'programming languages', 'ides']
	},
	{
		id: 'aqa-english-language-creative-reading-writing',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'English Language',
		code: '1',
		title: 'Explorations in creative reading and writing',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/english/gcse/english-8700/specification/specification-at-a-glance`,
		aliases: ['creative reading', 'creative writing', 'explorations in creative reading and writing']
	},
	{
		id: 'aqa-english-language-viewpoints',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'English Language',
		code: '2',
		title: "Writers' viewpoints and perspectives",
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/english/gcse/english-8700/specification/specification-at-a-glance`,
		aliases: ["writers' viewpoints", 'viewpoints and perspectives', 'communicating information and ideas']
	},
	{
		id: 'aqa-english-literature-shakespeare-novel',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'English Literature',
		code: '3.1',
		title: 'Shakespeare and the 19th-century novel',
		paper: 'Paper 1',
		specUrl: `${aqaBase}/subjects/english/gcse/english-8702/specification/subject-content/shakespeare-and-the-19th-century-novel`,
		aliases: ['shakespeare', '19th century novel', '19th-century novel', 'macbeth', 'romeo and juliet', 'a christmas carol', 'jekyll']
	},
	{
		id: 'aqa-english-literature-modern-texts-poetry',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'English Literature',
		code: '3.2',
		title: 'Modern texts and poetry',
		paper: 'Paper 2',
		specUrl: `${aqaBase}/subjects/english/gcse/english-8702/specification/subject-content/modern-texts-and-poetry`,
		aliases: ['modern texts', 'poetry', 'unseen poetry', 'poetry anthology']
	}
];

export function normaliseCurriculumText(value: string | null | undefined): string {
	return (value ?? '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function slugifyCurriculumPart(value: string): string {
	return normaliseCurriculumText(value).replace(/\s+/g, '-');
}

export function canonicalCurriculumSubject(value: string | null | undefined): string | null {
	const text = normaliseCurriculumText(value);
	if (!text) return null;
	if (text.includes('english') && text.includes('literature')) return 'English Literature';
	if (text.includes('english') && text.includes('language')) return 'English Language';
	if (text.includes('computer') || text.includes('computing')) return 'Computer Science';
	if (text.includes('geography')) return 'Geography';
	if (text.includes('history')) return 'History';
	if (text.includes('biology')) return 'Biology';
	if (text.includes('chemistry')) return 'Chemistry';
	if (text.includes('physics')) return 'Physics';
	if (text.includes('science')) return 'Science';
	return null;
}

export function subjectBelongsToScience(subject: string): boolean {
	return ['Biology', 'Chemistry', 'Physics'].includes(subject);
}
