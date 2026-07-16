import { isApprovedRecallVisualCueForSubject, recallVisualCueFor } from './visualCues.js';

export const recallSubjects = ['All subjects', 'Biology', 'Chemistry', 'Physics'] as const;

export type RecallSubject = Exclude<(typeof recallSubjects)[number], 'All subjects'>;

export type RecallCardKind =
	| 'definition'
	| 'formula'
	| 'process'
	| 'test-result'
	| 'unit'
	| 'practical'
	| 'fact'
	| 'comparison';

export type RecallTopic = {
	id: string;
	subject: RecallSubject;
	specRef: string;
	title: string;
	paper: 'Paper 1' | 'Paper 2' | 'Both papers';
};

export type RecallCardDefinition = {
	id: string;
	board: 'AQA';
	qualification: 'GCSE';
	subject: RecallSubject;
	topicId: string;
	specRef: string;
	kind: RecallCardKind;
	visualCue: string;
	front: string;
	back: string;
	reverseFront?: string;
	reverseBack?: string;
	distractors?: string[];
	explanation?: string;
	memoryTip?: string;
	choiceFeedback?: Record<string, string>;
	choiceMisconceptions?: Record<string, string>;
	sourceUrl: string;
	sourceTitle: string;
};

/**
 * A learner-facing card is always tied to one exact curriculum offering and
 * one immutable content identity. The unscoped definitions below are authoring
 * data only; server catalog hydration adds these fields before a card can enter
 * a signed-in session or produce learner evidence.
 */
export type RecallCard = RecallCardDefinition & {
	offeringId: string;
	curriculumComponentId: string;
	topicComponentId: string;
	contentRevision: number;
	contentHash: string;
	/**
	 * Server-owned identifiers for every recognition choice, keyed by the exact
	 * learner-facing text. Clients may return an identifier, but never define
	 * what it means.
	 */
	choiceKeys: Record<string, string>;
};

export const recallKindLabels: Record<RecallCardKind, string> = {
	definition: 'Definitions',
	formula: 'Formulae',
	process: 'Processes',
	'test-result': 'Tests and results',
	unit: 'Units',
	practical: 'Required practicals',
	fact: 'Facts',
	comparison: 'Comparisons'
};

const sourceBySubject: Record<RecallSubject, { url: string; title: string }> = {
	Biology: {
		url: 'https://www.aqa.org.uk/subjects/biology/gcse/biology-8461/specification',
		title: 'AQA GCSE Biology 8461 specification'
	},
	Chemistry: {
		url: 'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462/specification',
		title: 'AQA GCSE Chemistry 8462 specification'
	},
	Physics: {
		url: 'https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/specification',
		title: 'AQA GCSE Physics 8463 specification'
	}
};

export const recallCurriculumTopics: RecallTopic[] = [
	{
		id: 'biology-cell-biology',
		subject: 'Biology',
		specRef: '4.1',
		title: 'Cell biology',
		paper: 'Paper 1'
	},
	{
		id: 'biology-organisation',
		subject: 'Biology',
		specRef: '4.2',
		title: 'Organisation',
		paper: 'Paper 1'
	},
	{
		id: 'biology-infection-response',
		subject: 'Biology',
		specRef: '4.3',
		title: 'Infection and response',
		paper: 'Paper 1'
	},
	{
		id: 'biology-bioenergetics',
		subject: 'Biology',
		specRef: '4.4',
		title: 'Bioenergetics',
		paper: 'Paper 1'
	},
	{
		id: 'biology-homeostasis-response',
		subject: 'Biology',
		specRef: '4.5',
		title: 'Homeostasis and response',
		paper: 'Paper 2'
	},
	{
		id: 'biology-inheritance-variation-evolution',
		subject: 'Biology',
		specRef: '4.6',
		title: 'Inheritance, variation and evolution',
		paper: 'Paper 2'
	},
	{
		id: 'biology-ecology',
		subject: 'Biology',
		specRef: '4.7',
		title: 'Ecology',
		paper: 'Paper 2'
	},
	{
		id: 'biology-key-ideas',
		subject: 'Biology',
		specRef: '4.8',
		title: 'Key ideas',
		paper: 'Both papers'
	},
	{
		id: 'chemistry-atomic-structure-periodic-table',
		subject: 'Chemistry',
		specRef: '4.1',
		title: 'Atomic structure and the periodic table',
		paper: 'Paper 1'
	},
	{
		id: 'chemistry-bonding-structure-properties',
		subject: 'Chemistry',
		specRef: '4.2',
		title: 'Bonding, structure, and properties',
		paper: 'Paper 1'
	},
	{
		id: 'chemistry-quantitative-chemistry',
		subject: 'Chemistry',
		specRef: '4.3',
		title: 'Quantitative chemistry',
		paper: 'Paper 1'
	},
	{
		id: 'chemistry-chemical-changes',
		subject: 'Chemistry',
		specRef: '4.4',
		title: 'Chemical changes',
		paper: 'Paper 1'
	},
	{
		id: 'chemistry-energy-changes',
		subject: 'Chemistry',
		specRef: '4.5',
		title: 'Energy changes',
		paper: 'Paper 1'
	},
	{
		id: 'chemistry-rate-equilibrium',
		subject: 'Chemistry',
		specRef: '4.6',
		title: 'Rate and extent of chemical change',
		paper: 'Paper 2'
	},
	{
		id: 'chemistry-organic-chemistry',
		subject: 'Chemistry',
		specRef: '4.7',
		title: 'Organic chemistry',
		paper: 'Paper 2'
	},
	{
		id: 'chemistry-chemical-analysis',
		subject: 'Chemistry',
		specRef: '4.8',
		title: 'Chemical analysis',
		paper: 'Paper 2'
	},
	{
		id: 'chemistry-atmosphere',
		subject: 'Chemistry',
		specRef: '4.9',
		title: 'Chemistry of the atmosphere',
		paper: 'Paper 2'
	},
	{
		id: 'chemistry-using-resources',
		subject: 'Chemistry',
		specRef: '4.10',
		title: 'Using resources',
		paper: 'Paper 2'
	},
	{
		id: 'chemistry-key-ideas',
		subject: 'Chemistry',
		specRef: '4.11',
		title: 'Key ideas',
		paper: 'Both papers'
	},
	{
		id: 'physics-energy',
		subject: 'Physics',
		specRef: '4.1',
		title: 'Energy',
		paper: 'Paper 1'
	},
	{
		id: 'physics-electricity',
		subject: 'Physics',
		specRef: '4.2',
		title: 'Electricity',
		paper: 'Paper 1'
	},
	{
		id: 'physics-particle-model',
		subject: 'Physics',
		specRef: '4.3',
		title: 'Particle model of matter',
		paper: 'Paper 1'
	},
	{
		id: 'physics-atomic-structure',
		subject: 'Physics',
		specRef: '4.4',
		title: 'Atomic structure',
		paper: 'Paper 1'
	},
	{
		id: 'physics-forces',
		subject: 'Physics',
		specRef: '4.5',
		title: 'Forces',
		paper: 'Paper 2'
	},
	{
		id: 'physics-waves',
		subject: 'Physics',
		specRef: '4.6',
		title: 'Waves',
		paper: 'Paper 2'
	},
	{
		id: 'physics-magnetism-electromagnetism',
		subject: 'Physics',
		specRef: '4.7',
		title: 'Magnetism and electromagnetism',
		paper: 'Paper 2'
	},
	{
		id: 'physics-space',
		subject: 'Physics',
		specRef: '4.8',
		title: 'Space physics',
		paper: 'Paper 2'
	},
	{
		id: 'physics-key-ideas',
		subject: 'Physics',
		specRef: '4.9',
		title: 'Key ideas',
		paper: 'Both papers'
	}
];

function recallCard(
	card: Omit<
		RecallCardDefinition,
		'board' | 'qualification' | 'sourceUrl' | 'sourceTitle' | 'visualCue'
	> & {
		visualCue?: string;
	}
) {
	const source = sourceBySubject[card.subject];
	const visualCue = card.visualCue ?? recallVisualCueFor(card.id);
	if (!isApprovedRecallVisualCueForSubject(visualCue, card.subject)) {
		throw new Error(`Recall card ${card.id} has an invalid visual cue`);
	}
	return {
		board: 'AQA',
		qualification: 'GCSE',
		sourceUrl: source.url,
		sourceTitle: source.title,
		...card,
		visualCue
	} satisfies RecallCardDefinition;
}

export const recallCards: RecallCardDefinition[] = [
	recallCard({
		id: 'bio-eukaryote-prokaryote',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.1.1',
		kind: 'comparison',
		front: 'What is the key difference between eukaryotic and prokaryotic cells?',
		back: 'Eukaryotic cells have genetic material enclosed in a nucleus. Prokaryotic cells have genetic material not enclosed in a nucleus.',
		reverseFront: 'Genetic material is not enclosed in a nucleus.',
		reverseBack: 'Prokaryotic cell.',
		distractors: [
			'Prokaryotic cells have a nucleus; eukaryotic cells do not.',
			'Both cell types always contain chloroplasts.',
			'Eukaryotic cells are bacterial cells only.'
		]
	}),
	recallCard({
		id: 'bio-nucleus-function',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.1.2',
		kind: 'fact',
		front: 'What does the nucleus do in a plant or animal cell?',
		back: 'It contains genetic material and controls the activities of the cell.',
		reverseFront: 'Contains genetic material and controls cell activities.',
		reverseBack: 'Nucleus.',
		distractors: [
			'It is where aerobic respiration happens.',
			'It makes proteins on its surface.',
			'It absorbs light for photosynthesis.'
		],
		explanation:
			'The nucleus contains DNA. Those genetic instructions direct the cell’s activities, including which proteins it makes.',
		choiceFeedback: {
			'It is where aerobic respiration happens.':
				'Aerobic respiration happens in mitochondria, where energy is released for the cell.',
			'It makes proteins on its surface.':
				'Ribosomes make proteins. The nucleus stores the genetic instructions for making them.',
			'It absorbs light for photosynthesis.':
				'Chloroplasts contain chlorophyll that absorbs light for photosynthesis.'
		}
	}),
	recallCard({
		id: 'bio-mitochondria-function',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.1.2',
		kind: 'fact',
		front: 'What is the function of mitochondria?',
		back: 'They are the site of aerobic respiration.',
		reverseFront: 'Site of aerobic respiration.',
		reverseBack: 'Mitochondria.',
		distractors: [
			'They contain cell sap.',
			'They control what enters and leaves the cell.',
			'They are the site of protein synthesis.'
		]
	}),
	recallCard({
		id: 'bio-ribosome-function',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.1.2',
		kind: 'fact',
		front: 'What is the function of ribosomes?',
		back: 'They are the site of protein synthesis.',
		reverseFront: 'Site of protein synthesis.',
		reverseBack: 'Ribosomes.',
		distractors: [
			'They store cell sap.',
			'They contain chlorophyll.',
			'They release enzymes into the blood.'
		]
	}),
	recallCard({
		id: 'bio-chloroplast-function',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.1.2',
		kind: 'fact',
		front: 'What is the function of chloroplasts?',
		back: 'They contain chlorophyll and absorb light for photosynthesis.',
		reverseFront: 'Contain chlorophyll and absorb light.',
		reverseBack: 'Chloroplasts.',
		distractors: [
			'They make antibodies.',
			'They carry nerve impulses.',
			'They control cell division.'
		]
	}),
	recallCard({
		id: 'bio-stem-cell-definition',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.2.3',
		kind: 'definition',
		front: 'What is a stem cell?',
		back: 'An undifferentiated cell that can produce more cells of the same type and can differentiate into certain other cell types.',
		reverseFront:
			'Undifferentiated cell that can make more cells and become certain specialised cells.',
		reverseBack: 'Stem cell.',
		distractors: [
			'A mature cell that cannot divide.',
			'A pathogen that produces toxins.',
			'A sex cell with paired chromosomes.'
		]
	}),
	recallCard({
		id: 'bio-diffusion-definition',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.3.1',
		kind: 'definition',
		front: 'What is diffusion?',
		back: 'The net movement of particles from a region of higher concentration to a region of lower concentration.',
		reverseFront: 'Net movement from higher concentration to lower concentration.',
		reverseBack: 'Diffusion.',
		distractors: [
			'Movement of water through a partially permeable membrane only.',
			'Movement against a concentration gradient using energy.',
			'Movement of blood through arteries.'
		]
	}),
	recallCard({
		id: 'bio-osmosis-definition',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.3.2',
		kind: 'definition',
		front: 'What is osmosis?',
		back: 'The net movement of water from a dilute solution to a concentrated solution through a partially permeable membrane.',
		reverseFront:
			'Water moves through a partially permeable membrane from dilute to concentrated solution.',
		reverseBack: 'Osmosis.',
		distractors: [
			'Movement of mineral ions from low to high concentration using energy.',
			'Movement of oxygen from high to low concentration.',
			'Movement of food through the gut.'
		]
	}),
	recallCard({
		id: 'bio-active-transport-definition',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.3.3',
		kind: 'definition',
		front: 'What is active transport?',
		back: 'Movement of substances from a more dilute solution to a more concentrated solution using energy from respiration.',
		reverseFront: 'Movement against the concentration gradient using energy.',
		reverseBack: 'Active transport.',
		distractors: [
			'Net water movement through a partially permeable membrane.',
			'Movement down the concentration gradient without energy.',
			'Movement of air in and out of the lungs.'
		]
	}),
	recallCard({
		id: 'bio-enzyme-definition',
		subject: 'Biology',
		topicId: 'biology-organisation',
		specRef: '4.2.2.1',
		kind: 'definition',
		front: 'What is an enzyme?',
		back: 'A biological catalyst that speeds up a reaction without being used up.',
		reverseFront: 'Biological catalyst that is not used up.',
		reverseBack: 'Enzyme.',
		distractors: [
			'A hormone carried in the blood.',
			'A pathogen that causes disease.',
			'A molecule that stores genetic information.'
		]
	}),
	recallCard({
		id: 'bio-coronary-heart-disease',
		subject: 'Biology',
		topicId: 'biology-organisation',
		specRef: '4.2.2.4',
		kind: 'process',
		front: 'What causes coronary heart disease?',
		back: 'Fatty material builds up in coronary arteries, narrowing them and reducing blood flow to heart muscle.',
		reverseFront:
			'Fatty material narrows coronary arteries and reduces blood flow to the heart muscle.',
		reverseBack: 'Coronary heart disease.',
		distractors: [
			'Valves in veins open and close too quickly.',
			'Red blood cells make antibodies against heart muscle.',
			'Oxygen diffuses into the alveoli too quickly.'
		]
	}),
	recallCard({
		id: 'bio-vaccination-memory-cells',
		subject: 'Biology',
		topicId: 'biology-infection-response',
		specRef: '4.3.1.7',
		kind: 'process',
		front: 'How does vaccination protect against a pathogen?',
		back: 'It introduces dead, inactive, or fragments of pathogen so white blood cells make antibodies and memory cells.',
		reverseFront: 'Introduces harmless pathogen material so memory cells are made.',
		reverseBack: 'Vaccination.',
		distractors: [
			'It kills all bacteria directly with painkillers.',
			'It stops all mutations in the pathogen.',
			'It removes toxins from the bloodstream by dialysis.'
		]
	}),
	recallCard({
		id: 'bio-antibiotics-vs-painkillers',
		subject: 'Biology',
		topicId: 'biology-infection-response',
		specRef: '4.3.1.8',
		kind: 'comparison',
		front: 'What is the difference between antibiotics and painkillers?',
		back: 'Antibiotics kill or stop bacterial growth. Painkillers treat symptoms but do not kill pathogens.',
		reverseFront: 'Treat symptoms but do not kill pathogens.',
		reverseBack: 'Painkillers.',
		distractors: [
			'Antibiotics kill viruses; painkillers kill bacteria.',
			'Both kill pathogens directly.',
			'Painkillers stimulate antibody production.'
		]
	}),
	recallCard({
		id: 'bio-aerobic-respiration-equation',
		subject: 'Biology',
		topicId: 'biology-bioenergetics',
		specRef: '4.4.2.1',
		kind: 'formula',
		front: 'What is the word equation for aerobic respiration?',
		back: 'glucose + oxygen -> carbon dioxide + water',
		reverseFront: 'glucose + oxygen -> carbon dioxide + water',
		reverseBack: 'Aerobic respiration.',
		distractors: [
			'glucose -> lactic acid',
			'carbon dioxide + water -> glucose + oxygen',
			'oxygen + lactic acid -> glucose + water'
		]
	}),
	recallCard({
		id: 'bio-anaerobic-respiration-muscles',
		subject: 'Biology',
		topicId: 'biology-bioenergetics',
		specRef: '4.4.2.2',
		kind: 'formula',
		front: 'What is the word equation for anaerobic respiration in muscles?',
		back: 'glucose -> lactic acid',
		reverseFront: 'glucose -> lactic acid',
		reverseBack: 'Anaerobic respiration in muscles.',
		distractors: [
			'glucose + oxygen -> carbon dioxide + water',
			'carbon dioxide + water -> glucose + oxygen',
			'glucose -> ethanol + carbon dioxide'
		]
	}),
	recallCard({
		id: 'bio-photosynthesis-equation',
		subject: 'Biology',
		topicId: 'biology-bioenergetics',
		specRef: '4.4.1.1',
		kind: 'formula',
		front: 'What is the word equation for photosynthesis?',
		back: 'carbon dioxide + water -> glucose + oxygen',
		reverseFront: 'carbon dioxide + water -> glucose + oxygen',
		reverseBack: 'Photosynthesis.',
		distractors: [
			'glucose + oxygen -> carbon dioxide + water',
			'glucose -> lactic acid',
			'oxygen + water -> glucose + carbon dioxide'
		]
	}),
	recallCard({
		id: 'bio-transpiration-definition',
		subject: 'Biology',
		topicId: 'biology-bioenergetics',
		specRef: '4.4.2.3',
		kind: 'definition',
		front: 'What is transpiration?',
		back: 'The loss of water vapour from leaves through the stomata.',
		reverseFront: 'Loss of water vapour from leaves through stomata.',
		reverseBack: 'Transpiration.',
		distractors: [
			'Movement of sugar through phloem.',
			'Movement of water into cells by osmosis.',
			'Exchange of gases in the alveoli.'
		]
	}),
	recallCard({
		id: 'bio-homeostasis-definition',
		subject: 'Biology',
		topicId: 'biology-homeostasis-response',
		specRef: '4.5.1',
		kind: 'definition',
		front: 'What is homeostasis?',
		back: 'Regulation of internal conditions to maintain optimum conditions for enzyme action and cell function.',
		reverseFront: 'Regulation of internal conditions.',
		reverseBack: 'Homeostasis.',
		distractors: [
			'Release of energy from glucose.',
			'Transfer of pollen between flowers.',
			'Division of cells to form gametes.'
		]
	}),
	recallCard({
		id: 'bio-hormone-definition',
		subject: 'Biology',
		topicId: 'biology-homeostasis-response',
		specRef: '4.5.3.1',
		kind: 'definition',
		front: 'What is a hormone?',
		back: 'A chemical messenger released from a gland and carried in the blood to a target organ.',
		reverseFront: 'Chemical messenger carried in blood from a gland to a target organ.',
		reverseBack: 'Hormone.',
		distractors: [
			'A white blood cell protein that binds to antigens.',
			'An enzyme that digests protein.',
			'A gene version on a chromosome.'
		]
	}),
	recallCard({
		id: 'bio-meiosis-purpose',
		subject: 'Biology',
		topicId: 'biology-inheritance-variation-evolution',
		specRef: '4.6.1.2',
		kind: 'process',
		front: 'What does meiosis produce?',
		back: 'Gametes with half the normal number of chromosomes, and genetic variation.',
		reverseFront: 'Produces gametes with half the chromosomes.',
		reverseBack: 'Meiosis.',
		distractors: [
			'Two identical body cells with paired chromosomes.',
			'Antibodies and memory cells.',
			'Glucose and oxygen in chloroplasts.'
		]
	}),
	recallCard({
		id: 'bio-genotype-phenotype',
		subject: 'Biology',
		topicId: 'biology-inheritance-variation-evolution',
		specRef: '4.6.1.6',
		kind: 'comparison',
		front: 'What is the difference between genotype and phenotype?',
		back: 'Genotype is the alleles an organism has. Phenotype is the observable characteristic.',
		reverseFront: 'Observable characteristic.',
		reverseBack: 'Phenotype.',
		distractors: [
			'Genotype is the visible trait; phenotype is the DNA sequence only.',
			'Both mean the same gene version.',
			'Phenotype is always unaffected by environment.'
		]
	}),
	recallCard({
		id: 'bio-natural-selection-steps',
		subject: 'Biology',
		topicId: 'biology-inheritance-variation-evolution',
		specRef: '4.6.2.1',
		kind: 'process',
		front: 'What are the core steps in natural selection?',
		back: 'Variation exists, better-adapted organisms survive and reproduce, and advantageous alleles become more common.',
		reverseFront: 'Advantageous alleles become more common over generations.',
		reverseBack: 'Natural selection.',
		distractors: [
			'All individuals change their genes during life.',
			'Organisms choose the traits their offspring need.',
			'Mutations always make organisms better adapted.'
		]
	}),
	recallCard({
		id: 'bio-biodiversity-definition',
		subject: 'Biology',
		topicId: 'biology-ecology',
		specRef: '4.7.3.1',
		kind: 'definition',
		front: 'What is biodiversity?',
		back: 'The variety of all the different species of organisms on Earth or within an ecosystem.',
		reverseFront: 'Variety of species on Earth or in an ecosystem.',
		reverseBack: 'Biodiversity.',
		distractors: [
			'The number of trophic levels in one food chain.',
			'The mass of living material in a habitat.',
			'The recycling of carbon only.'
		]
	}),
	recallCard({
		id: 'bio-decomposers-role',
		subject: 'Biology',
		topicId: 'biology-ecology',
		specRef: '4.7.2.2',
		kind: 'fact',
		front: 'What do decomposers do in an ecosystem?',
		back: 'They break down dead material and return mineral ions to the soil.',
		reverseFront: 'Break down dead material and return mineral ions to soil.',
		reverseBack: 'Decomposers.',
		distractors: [
			'They make glucose by photosynthesis.',
			'They pass oxygen into red blood cells.',
			'They transfer pollen between flowers.'
		]
	}),
	recallCard({
		id: 'chem-atom-definition',
		subject: 'Chemistry',
		topicId: 'chemistry-atomic-structure-periodic-table',
		specRef: '4.1.1.1',
		kind: 'definition',
		front: 'What is an atom?',
		back: 'The smallest part of an element that can exist.',
		reverseFront: 'Smallest part of an element that can exist.',
		reverseBack: 'Atom.',
		distractors: [
			'A substance made from two or more elements chemically combined.',
			'A mixture of substances not chemically combined.',
			'A charged particle formed by gaining or losing electrons.'
		]
	}),
	recallCard({
		id: 'chem-isotope-definition',
		subject: 'Chemistry',
		topicId: 'chemistry-atomic-structure-periodic-table',
		specRef: '4.1.1.6',
		kind: 'definition',
		front: 'What is an isotope?',
		back: 'Atoms of the same element with the same number of protons but different numbers of neutrons.',
		reverseFront: 'Same protons, different neutrons.',
		reverseBack: 'Isotopes.',
		distractors: [
			'Atoms with the same neutrons but different protons.',
			'Ions with opposite charges.',
			'Molecules with shared electron pairs.'
		],
		explanation:
			'The proton number fixes the element. Changing only the neutron number changes the mass, giving a different isotope of that element.',
		choiceFeedback: {
			'Atoms with the same neutrons but different protons.':
				'Different proton numbers mean different elements, even when the neutron numbers match.',
			'Ions with opposite charges.':
				'Ions form when electrons are gained or lost. Isotopes differ in their numbers of neutrons.',
			'Molecules with shared electron pairs.':
				'Shared electron pairs describe covalent bonds between atoms, not isotopes.'
		}
	}),
	recallCard({
		id: 'chem-subatomic-charges',
		subject: 'Chemistry',
		topicId: 'chemistry-atomic-structure-periodic-table',
		specRef: '4.1.1.5',
		kind: 'fact',
		front: 'What are the relative charges of protons, neutrons, and electrons?',
		back: 'Proton +1, neutron 0, electron -1.',
		reverseFront: 'Proton +1, neutron 0, electron -1.',
		reverseBack: 'Relative charges of subatomic particles.',
		distractors: [
			'Proton -1, neutron 0, electron +1.',
			'Proton +1, neutron -1, electron 0.',
			'All three have charge 0.'
		]
	}),
	recallCard({
		id: 'chem-mixture-definition',
		subject: 'Chemistry',
		topicId: 'chemistry-atomic-structure-periodic-table',
		specRef: '4.1.1.2',
		kind: 'definition',
		front: 'What is a mixture?',
		back: 'Two or more elements or compounds not chemically combined together.',
		reverseFront: 'Substances together but not chemically combined.',
		reverseBack: 'Mixture.',
		distractors: [
			'Two or more elements chemically combined in fixed proportions.',
			'A charged atom.',
			'A substance made of one type of atom only.'
		]
	}),
	recallCard({
		id: 'chem-ionic-bonding',
		subject: 'Chemistry',
		topicId: 'chemistry-bonding-structure-properties',
		specRef: '4.2.1.1',
		kind: 'process',
		front: 'How does ionic bonding form?',
		back: 'Electrons are transferred so oppositely charged ions form and attract each other.',
		reverseFront: 'Electron transfer forms oppositely charged ions.',
		reverseBack: 'Ionic bonding.',
		distractors: [
			'Atoms share pairs of electrons.',
			'Positive metal ions are attracted to delocalised electrons.',
			'Molecules evaporate without chemical change.'
		]
	}),
	recallCard({
		id: 'chem-covalent-bonding',
		subject: 'Chemistry',
		topicId: 'chemistry-bonding-structure-properties',
		specRef: '4.2.1.4',
		kind: 'definition',
		front: 'What is a covalent bond?',
		back: 'A shared pair of electrons between atoms.',
		reverseFront: 'Shared pair of electrons.',
		reverseBack: 'Covalent bond.',
		distractors: [
			'Attraction between oppositely charged ions.',
			'Attraction between metal ions and delocalised electrons.',
			'Transfer of neutrons between atoms.'
		]
	}),
	recallCard({
		id: 'chem-metallic-bonding',
		subject: 'Chemistry',
		topicId: 'chemistry-bonding-structure-properties',
		specRef: '4.2.1.7',
		kind: 'definition',
		front: 'What is metallic bonding?',
		back: 'The attraction between positive metal ions and delocalised electrons.',
		reverseFront: 'Positive metal ions attracted to delocalised electrons.',
		reverseBack: 'Metallic bonding.',
		distractors: [
			'Attraction between two non-metal atoms sharing electrons.',
			'Attraction between a nucleus and neutrons.',
			'Weak forces between simple molecules only.'
		]
	}),
	recallCard({
		id: 'chem-moles-mass-mr',
		subject: 'Chemistry',
		topicId: 'chemistry-quantitative-chemistry',
		specRef: '4.3.2.1',
		kind: 'formula',
		front: 'What equation links moles, mass, and relative formula mass?',
		back: '$\\text{moles} = \\frac{\\text{mass}}{M_r}$',
		reverseFront: '$\\text{moles} = \\frac{\\text{mass}}{M_r}$',
		reverseBack: 'Moles from mass and relative formula mass.',
		distractors: [
			'$\\text{mass} = \\frac{\\text{moles}}{M_r}$',
			'$\\text{moles} = \\text{mass} \\times M_r$',
			'$M_r = \\text{mass} \\times \\text{moles}$'
		]
	}),
	recallCard({
		id: 'chem-concentration-mass-volume',
		subject: 'Chemistry',
		topicId: 'chemistry-quantitative-chemistry',
		specRef: '4.3.4.2',
		kind: 'formula',
		front: 'What equation links concentration, mass, and volume for a solution?',
		back: '$\\text{concentration} = \\frac{\\text{mass}}{\\text{volume}}$',
		reverseFront: '$\\text{concentration} = \\frac{\\text{mass}}{\\text{volume}}$',
		reverseBack: 'Concentration from mass and volume.',
		distractors: [
			'$\\text{concentration} = \\text{mass} \\times \\text{volume}$',
			'$\\text{volume} = \\text{mass} \\times \\text{concentration}$',
			'$\\text{mass} = \\frac{\\text{volume}}{\\text{concentration}}$'
		]
	}),
	recallCard({
		id: 'chem-group-one-reactivity',
		subject: 'Chemistry',
		topicId: 'chemistry-atomic-structure-periodic-table',
		specRef: '4.1.2.5',
		kind: 'fact',
		front: 'What happens to Group 1 metal reactivity down the group?',
		back: 'Reactivity increases down Group 1.',
		reverseFront: 'Reactivity increases down the group.',
		reverseBack: 'Group 1 metals.',
		distractors: [
			'Reactivity decreases down Group 1.',
			'Reactivity stays exactly the same.',
			'Reactivity increases across the period only.'
		]
	}),
	recallCard({
		id: 'chem-electrolysis-definition',
		subject: 'Chemistry',
		topicId: 'chemistry-chemical-changes',
		specRef: '4.4.3.1',
		kind: 'definition',
		front: 'What is electrolysis?',
		back: 'Splitting up an ionic compound using electricity when molten or in solution.',
		reverseFront: 'Splitting ionic compounds using electricity.',
		reverseBack: 'Electrolysis.',
		distractors: [
			'Neutralising an acid with an alkali.',
			'Separating an insoluble solid by filtration.',
			'Burning a hydrocarbon in oxygen.'
		]
	}),
	recallCard({
		id: 'chem-neutralisation-products',
		subject: 'Chemistry',
		topicId: 'chemistry-chemical-changes',
		specRef: '4.4.2.4',
		kind: 'fact',
		front: 'What are the products of acid neutralisation by an alkali?',
		back: 'A salt and water.',
		reverseFront: 'A salt and water.',
		reverseBack: 'Neutralisation products.',
		distractors: [
			'A metal and hydrogen.',
			'Carbon dioxide and oxygen.',
			'A precipitate and chlorine.'
		]
	}),
	recallCard({
		id: 'chem-soluble-salt-method',
		subject: 'Chemistry',
		topicId: 'chemistry-chemical-changes',
		specRef: '4.4.2.3',
		kind: 'practical',
		front: 'How do you make a pure dry soluble salt from an insoluble base and acid?',
		back: 'Add excess base to acid, filter off the excess solid, then crystallise the solution.',
		reverseFront: 'Excess base, filter, crystallise.',
		reverseBack: 'Making a pure dry soluble salt.',
		distractors: [
			'Electrolyse the acid then collect the gas.',
			'Use chromatography then distil the spots.',
			'Add indicator, neutralise exactly, then discard the solution.'
		]
	}),
	recallCard({
		id: 'chem-exothermic-definition',
		subject: 'Chemistry',
		topicId: 'chemistry-energy-changes',
		specRef: '4.5.1.1',
		kind: 'definition',
		front: 'What is an exothermic reaction?',
		back: 'A reaction that transfers energy to the surroundings, usually causing a temperature increase.',
		reverseFront: 'Transfers energy to the surroundings.',
		reverseBack: 'Exothermic reaction.',
		distractors: [
			'Transfers energy from the surroundings.',
			'Always uses electrolysis.',
			'Only happens between acids and metals.'
		]
	}),
	recallCard({
		id: 'chem-endothermic-definition',
		subject: 'Chemistry',
		topicId: 'chemistry-energy-changes',
		specRef: '4.5.1.1',
		kind: 'definition',
		front: 'What is an endothermic reaction?',
		back: 'A reaction that takes in energy from the surroundings, usually causing a temperature decrease.',
		reverseFront: 'Takes in energy from the surroundings.',
		reverseBack: 'Endothermic reaction.',
		distractors: [
			'Transfers energy to the surroundings.',
			'Always makes a precipitate.',
			'Only happens in combustion.'
		]
	}),
	recallCard({
		id: 'chem-temperature-rate',
		subject: 'Chemistry',
		topicId: 'chemistry-rate-equilibrium',
		specRef: '4.6.1.2',
		kind: 'process',
		front: 'Why does increasing temperature increase reaction rate?',
		back: 'Particles have more energy, move faster, and collide more often with enough energy to react.',
		reverseFront: 'More energy, faster movement, more successful collisions.',
		reverseBack: 'Increasing temperature increases reaction rate.',
		distractors: [
			'Particles become larger and dissolve more slowly.',
			'Activation energy disappears completely.',
			'The number of atoms in each particle changes.'
		]
	}),
	recallCard({
		id: 'chem-catalyst-definition',
		subject: 'Chemistry',
		topicId: 'chemistry-rate-equilibrium',
		specRef: '4.6.1.4',
		kind: 'definition',
		front: 'What is a catalyst?',
		back: 'A substance that increases reaction rate without being used up, by providing a different pathway with lower activation energy.',
		reverseFront: 'Increases rate without being used up.',
		reverseBack: 'Catalyst.',
		distractors: [
			'A product that lowers concentration.',
			'A reactant that is always consumed.',
			'A solvent that dissolves every solid.'
		]
	}),
	recallCard({
		id: 'chem-alkane-general-formula',
		subject: 'Chemistry',
		topicId: 'chemistry-organic-chemistry',
		specRef: '4.7.1.1',
		kind: 'formula',
		front: 'What is the general formula for alkanes?',
		back: '$C_nH_{2n+2}$',
		reverseFront: '$C_nH_{2n+2}$',
		reverseBack: 'Alkanes.',
		distractors: ['$C_nH_{2n}$', '$C_nH_{2n-2}$', '$C_nH_n$']
	}),
	recallCard({
		id: 'chem-alkene-bromine-water',
		subject: 'Chemistry',
		topicId: 'chemistry-organic-chemistry',
		specRef: '4.7.1.4',
		kind: 'test-result',
		front: 'What happens when an alkene is shaken with bromine water?',
		back: 'Bromine water turns from orange to colourless.',
		reverseFront: 'Bromine water turns orange to colourless.',
		reverseBack: 'Alkene test.',
		distractors: [
			'It turns limewater cloudy.',
			'It makes a squeaky pop with a lit splint.',
			'It turns blue litmus red.'
		]
	}),
	recallCard({
		id: 'chem-chromatography-rf',
		subject: 'Chemistry',
		topicId: 'chemistry-chemical-analysis',
		specRef: '4.8.1.3',
		kind: 'formula',
		front: 'What is the equation for an $R_f$ value in chromatography?',
		back: '$R_f = \\frac{\\text{distance moved by substance}}{\\text{distance moved by solvent}}$',
		reverseFront:
			'$R_f = \\frac{\\text{distance moved by substance}}{\\text{distance moved by solvent}}$',
		reverseBack: 'Chromatography $R_f$ value.',
		distractors: [
			'$R_f = \\frac{\\text{distance moved by solvent}}{\\text{distance moved by substance}}$',
			'$R_f = \\text{distance moved by solvent} - \\text{distance moved by substance}$',
			'$R_f = \\text{mass} \\div \\text{volume}$'
		]
	}),
	recallCard({
		id: 'chem-flame-test-lithium',
		subject: 'Chemistry',
		topicId: 'chemistry-chemical-analysis',
		specRef: '4.8.3.1',
		kind: 'test-result',
		front: 'What flame colour does lithium produce?',
		back: 'Crimson.',
		reverseFront: 'Crimson flame.',
		reverseBack: 'Lithium ion.',
		distractors: ['Lilac.', 'Green.', 'Yellow.']
	}),
	recallCard({
		id: 'chem-carbon-dioxide-test',
		subject: 'Chemistry',
		topicId: 'chemistry-chemical-analysis',
		specRef: '4.8.3.5',
		kind: 'test-result',
		front: 'What is the test for carbon dioxide?',
		back: 'Bubble the gas through limewater; it turns cloudy.',
		reverseFront: 'Turns limewater cloudy.',
		reverseBack: 'Carbon dioxide.',
		distractors: [
			'Relights a glowing splint.',
			'Makes a squeaky pop with a lit splint.',
			'Bleaches damp litmus paper.'
		]
	}),
	recallCard({
		id: 'chem-life-cycle-assessment',
		subject: 'Chemistry',
		topicId: 'chemistry-using-resources',
		specRef: '4.10.2.1',
		kind: 'definition',
		front: 'What does a life cycle assessment compare?',
		back: 'The environmental impacts of a product across extraction, manufacture, use, and disposal.',
		reverseFront: 'Environmental impact across a product life cycle.',
		reverseBack: 'Life cycle assessment.',
		distractors: [
			'The rate of reaction at different temperatures.',
			'The pH change during neutralisation only.',
			'The number of neutrons in an isotope.'
		]
	}),
	recallCard({
		id: 'phys-scalar-vector',
		subject: 'Physics',
		topicId: 'physics-forces',
		specRef: '4.5.1.2',
		kind: 'comparison',
		front: 'What is the difference between a scalar and a vector?',
		back: 'A scalar has magnitude only. A vector has magnitude and direction.',
		reverseFront: 'Magnitude and direction.',
		reverseBack: 'Vector.',
		distractors: [
			'A scalar has direction only; a vector has magnitude only.',
			'Both always have direction.',
			'Both are forces measured in newtons.'
		]
	}),
	recallCard({
		id: 'phys-kinetic-energy-equation',
		subject: 'Physics',
		topicId: 'physics-energy',
		specRef: '4.1.1.2',
		kind: 'formula',
		front: 'What is the kinetic energy equation?',
		back: '$E_k = \\frac{1}{2}mv^2$',
		reverseFront: '$E_k = \\frac{1}{2}mv^2$',
		reverseBack: 'Kinetic energy.',
		distractors: ['$E_p = mgh$', '$P = IV$', '$W = mg$']
	}),
	recallCard({
		id: 'phys-gpe-equation',
		subject: 'Physics',
		topicId: 'physics-energy',
		specRef: '4.1.1.2',
		kind: 'formula',
		front: 'What is the gravitational potential energy equation?',
		back: '$E_p = mgh$',
		reverseFront: '$E_p = mgh$',
		reverseBack: 'Gravitational potential energy.',
		distractors: ['$E_k = \\frac{1}{2}mv^2$', '$Q = It$', '$F = ke$']
	}),
	recallCard({
		id: 'phys-power-equation',
		subject: 'Physics',
		topicId: 'physics-energy',
		specRef: '4.1.2.3',
		kind: 'formula',
		front: 'What equation links power, energy transferred, and time?',
		back: '$P = \\frac{E}{t}$',
		reverseFront: '$P = \\frac{E}{t}$',
		reverseBack: 'Power from energy transferred and time.',
		distractors: ['$P = IV$', '$E = \\frac{P}{t}$', '$P = Et$']
	}),
	recallCard({
		id: 'phys-efficiency-equation',
		subject: 'Physics',
		topicId: 'physics-energy',
		specRef: '4.1.2.2',
		kind: 'formula',
		front: 'What is the efficiency equation?',
		back: '$\\text{efficiency} = \\frac{\\text{useful output energy transfer}}{\\text{total input energy transfer}}$',
		reverseFront: 'Useful output divided by total input.',
		reverseBack: 'Efficiency.',
		distractors: [
			'Total input divided by useful output.',
			'Wasted output divided by useful output.',
			'Power divided by current.'
		]
	}),
	recallCard({
		id: 'phys-current-equation',
		subject: 'Physics',
		topicId: 'physics-electricity',
		specRef: '4.2.1.2',
		kind: 'formula',
		front: 'What equation links charge flow, current, and time?',
		back: '$Q = It$',
		reverseFront: '$Q = It$',
		reverseBack: 'Charge flow from current and time.',
		distractors: ['$V = IR$', '$P = IV$', '$W = mg$']
	}),
	recallCard({
		id: 'phys-potential-difference-definition',
		subject: 'Physics',
		topicId: 'physics-electricity',
		specRef: '4.2.1.3',
		kind: 'definition',
		front: 'What does potential difference mean?',
		back: 'Energy transferred per unit charge passing between two points.',
		reverseFront: 'Energy transferred per unit charge.',
		reverseBack: 'Potential difference.',
		distractors: ['Charge flow per second.', 'Force per unit mass.', 'Work done per unit time.']
	}),
	recallCard({
		id: 'phys-resistance-equation',
		subject: 'Physics',
		topicId: 'physics-electricity',
		specRef: '4.2.1.4',
		kind: 'formula',
		front: 'What equation links potential difference, current, and resistance?',
		back: '$V = IR$',
		reverseFront: '$V = IR$',
		reverseBack: 'Potential difference, current, and resistance.',
		distractors: ['$Q = It$', '$P = \\frac{E}{t}$', '$F = ma$']
	}),
	recallCard({
		id: 'phys-iv-characteristics-practical',
		subject: 'Physics',
		topicId: 'physics-electricity',
		specRef: '4.2.1.4',
		kind: 'practical',
		front: 'In the I-V characteristics practical, what do you vary and measure?',
		back: 'Vary the potential difference and measure current through the component.',
		reverseFront: 'Vary potential difference and measure current.',
		reverseBack: 'I-V characteristics practical.',
		distractors: [
			'Vary mass and measure extension.',
			'Vary wavelength and measure frequency.',
			'Vary volume and measure density.'
		]
	}),
	recallCard({
		id: 'phys-ohmic-conductor',
		subject: 'Physics',
		topicId: 'physics-electricity',
		specRef: '4.2.1.4',
		kind: 'definition',
		front: 'What is an ohmic conductor?',
		back: 'A component where current is directly proportional to potential difference, if temperature is constant.',
		reverseFront: 'Current is directly proportional to p.d. at constant temperature.',
		reverseBack: 'Ohmic conductor.',
		distractors: [
			'A component whose resistance falls as temperature rises.',
			'A component that stores charge in a magnetic field.',
			'A component that only lets current flow one way.'
		]
	}),
	recallCard({
		id: 'phys-series-current',
		subject: 'Physics',
		topicId: 'physics-electricity',
		specRef: '4.2.2',
		kind: 'fact',
		front: 'What happens to current in a series circuit?',
		back: 'The current is the same through each component.',
		reverseFront: 'Same current through each component.',
		reverseBack: 'Series circuit.',
		distractors: [
			'Current splits between branches.',
			'Potential difference is always the same across every component.',
			'Resistance is always zero.'
		]
	}),
	recallCard({
		id: 'phys-parallel-pd',
		subject: 'Physics',
		topicId: 'physics-electricity',
		specRef: '4.2.2',
		kind: 'fact',
		front: 'What happens to potential difference in parallel branches?',
		back: 'The potential difference across each parallel branch is the same.',
		reverseFront: 'Same potential difference across each branch.',
		reverseBack: 'Parallel circuit.',
		distractors: [
			'Current is the same through every branch.',
			'Potential difference is shared between branches.',
			'Charge stops flowing in each branch.'
		],
		explanation:
			'Each parallel branch is connected across the same two points of the supply, so every branch gets the full supply potential difference.',
		choiceFeedback: {
			'Current is the same through every branch.':
				'Current splits between parallel branches. The split depends on the resistance of each branch.',
			'Potential difference is shared between branches.':
				'Potential difference is shared between components in series, not between parallel branches.',
			'Charge stops flowing in each branch.':
				'Charge continues to flow through every complete branch of a parallel circuit.'
		}
	}),
	recallCard({
		id: 'phys-density-equation',
		subject: 'Physics',
		topicId: 'physics-particle-model',
		specRef: '4.3.1.1',
		kind: 'formula',
		front: 'What is the density equation?',
		back: '$\\rho = \\frac{m}{V}$',
		reverseFront: '$\\rho = \\frac{m}{V}$',
		reverseBack: 'Density.',
		distractors: ['$P = \\frac{E}{t}$', '$F = ke$', '$a = \\frac{\\Delta v}{t}$']
	}),
	recallCard({
		id: 'phys-specific-heat-capacity-equation',
		subject: 'Physics',
		topicId: 'physics-particle-model',
		specRef: '4.3.2.1',
		kind: 'formula',
		front: 'What is the specific heat capacity equation?',
		back: '$\\Delta E = mc\\Delta \\theta$',
		reverseFront: '$\\Delta E = mc\\Delta \\theta$',
		reverseBack: 'Specific heat capacity.',
		distractors: ['$E = ml$', '$Q = It$', '$E_k = \\frac{1}{2}mv^2$']
	}),
	recallCard({
		id: 'phys-specific-latent-heat-equation',
		subject: 'Physics',
		topicId: 'physics-particle-model',
		specRef: '4.3.2.2',
		kind: 'formula',
		front: 'What is the specific latent heat equation?',
		back: '$E = mL$',
		reverseFront: '$E = mL$',
		reverseBack: 'Specific latent heat.',
		distractors: ['$\\Delta E = mc\\Delta \\theta$', '$W = mg$', '$V = IR$']
	}),
	recallCard({
		id: 'phys-isotope-definition',
		subject: 'Physics',
		topicId: 'physics-atomic-structure',
		specRef: '4.4.2.1',
		kind: 'definition',
		front: 'What is an isotope?',
		back: 'Atoms of the same element with different numbers of neutrons.',
		reverseFront: 'Same element, different neutrons.',
		reverseBack: 'Isotope.',
		distractors: [
			'Atoms with different proton numbers.',
			'Molecules with shared electrons.',
			'Particles with no mass.'
		]
	}),
	recallCard({
		id: 'phys-half-life-definition',
		subject: 'Physics',
		topicId: 'physics-atomic-structure',
		specRef: '4.4.2.3',
		kind: 'definition',
		front: 'What is half-life?',
		back: 'The time taken for the count rate or activity of a radioactive source to fall to half its initial value.',
		reverseFront: 'Time for activity or count rate to halve.',
		reverseBack: 'Half-life.',
		distractors: [
			'Time for temperature to halve.',
			'Time for all nuclei to decay.',
			'Distance travelled by radiation in air.'
		]
	}),
	recallCard({
		id: 'phys-resultant-force-equation',
		subject: 'Physics',
		topicId: 'physics-forces',
		specRef: '4.5.6.2',
		kind: 'formula',
		front: "What is Newton's second law equation?",
		back: '$F = ma$',
		reverseFront: '$F = ma$',
		reverseBack: 'Resultant force, mass, and acceleration.',
		distractors: ['$W = mg$', '$p = mv$', '$v = f\\lambda$']
	}),
	recallCard({
		id: 'phys-force-unit',
		subject: 'Physics',
		topicId: 'physics-forces',
		specRef: '4.5.1.3',
		kind: 'unit',
		front: 'What is the SI unit of force?',
		back: 'Newton, N.',
		reverseFront: 'Newton, N.',
		reverseBack: 'SI unit of force.',
		distractors: ['Joule, J.', 'Watt, W.', 'Volt, V.']
	}),
	recallCard({
		id: 'phys-weight-equation',
		subject: 'Physics',
		topicId: 'physics-forces',
		specRef: '4.5.1.3',
		kind: 'formula',
		front: 'What is the weight equation?',
		back: '$W = mg$',
		reverseFront: '$W = mg$',
		reverseBack: 'Weight.',
		distractors: ['$F = ma$', '$E_p = mgh$', '$P = IV$']
	}),
	recallCard({
		id: 'phys-acceleration-equation',
		subject: 'Physics',
		topicId: 'physics-forces',
		specRef: '4.5.6.1',
		kind: 'formula',
		front: 'What equation links acceleration, change in velocity, and time?',
		back: '$a = \\frac{\\Delta v}{t}$',
		reverseFront: '$a = \\frac{\\Delta v}{t}$',
		reverseBack: 'Acceleration from change in velocity and time.',
		distractors: ['$v = f\\lambda$', '$p = mv$', '$s = vt$']
	}),
	recallCard({
		id: 'phys-momentum-equation',
		subject: 'Physics',
		topicId: 'physics-forces',
		specRef: '4.5.7.1',
		kind: 'formula',
		front: 'What is the momentum equation?',
		back: '$p = mv$',
		reverseFront: '$p = mv$',
		reverseBack: 'Momentum.',
		distractors: ['$F = ke$', '$W = mg$', '$Q = It$']
	}),
	recallCard({
		id: 'phys-stopping-distance',
		subject: 'Physics',
		topicId: 'physics-forces',
		specRef: '4.5.6.3',
		kind: 'definition',
		front: 'What two distances make up stopping distance?',
		back: 'Thinking distance plus braking distance.',
		reverseFront: 'Thinking distance plus braking distance.',
		reverseBack: 'Stopping distance.',
		distractors: [
			'Reaction distance plus acceleration distance.',
			'Braking force plus friction force.',
			'Velocity plus acceleration.'
		]
	}),
	recallCard({
		id: 'phys-frequency-definition',
		subject: 'Physics',
		topicId: 'physics-waves',
		specRef: '4.6.1.2',
		kind: 'definition',
		front: 'What is frequency?',
		back: 'The number of waves passing a point each second.',
		reverseFront: 'Number of waves passing a point each second.',
		reverseBack: 'Frequency.',
		distractors: [
			'Distance from one wave peak to the next.',
			'Maximum displacement from rest position.',
			'Speed of light in a vacuum.'
		]
	}),
	recallCard({
		id: 'phys-wave-speed-equation',
		subject: 'Physics',
		topicId: 'physics-waves',
		specRef: '4.6.1.2',
		kind: 'formula',
		front: 'What is the wave speed equation?',
		back: '$v = f\\lambda$',
		reverseFront: '$v = f\\lambda$',
		reverseBack: 'Wave speed.',
		distractors: ['$p = mv$', '$F = ma$', '$P = IV$']
	}),
	recallCard({
		id: 'phys-electromagnetic-spectrum-order',
		subject: 'Physics',
		topicId: 'physics-waves',
		specRef: '4.6.2.1',
		kind: 'fact',
		front: 'What is the electromagnetic spectrum order from long wavelength to short wavelength?',
		back: 'Radio, microwave, infrared, visible light, ultraviolet, X-rays, gamma rays.',
		reverseFront: 'Radio, microwave, infrared, visible, ultraviolet, X-rays, gamma.',
		reverseBack: 'Electromagnetic spectrum from long to short wavelength.',
		distractors: [
			'Gamma, X-rays, ultraviolet, visible, infrared, microwave, radio.',
			'Radio, visible, microwave, infrared, X-rays, ultraviolet, gamma.',
			'Infrared, radio, visible, gamma, microwave, ultraviolet, X-rays.'
		]
	}),
	recallCard({
		id: 'phys-magnetic-field-wire',
		subject: 'Physics',
		topicId: 'physics-magnetism-electromagnetism',
		specRef: '4.7.2.1',
		kind: 'fact',
		front: 'What happens around a wire when current flows through it?',
		back: 'A magnetic field is produced around the wire.',
		reverseFront: 'Current in a wire produces this around it.',
		reverseBack: 'Magnetic field.',
		distractors: [
			'A gravitational field is cancelled.',
			'Charge stops moving.',
			'The wire becomes an isotope.'
		]
	}),
	recallCard({
		id: 'phys-transformer-purpose',
		subject: 'Physics',
		topicId: 'physics-magnetism-electromagnetism',
		specRef: '4.7.3.2',
		kind: 'fact',
		front: 'What does a transformer change?',
		back: 'The potential difference of an alternating current supply.',
		reverseFront: 'Changes the potential difference of an a.c. supply.',
		reverseBack: 'Transformer.',
		distractors: [
			'Changes mass into energy.',
			'Changes direct current into charge.',
			'Changes resistance into density.'
		]
	}),
	recallCard({
		id: 'phys-red-shift',
		subject: 'Physics',
		topicId: 'physics-space',
		specRef: '4.8.2',
		kind: 'definition',
		front: 'What does red-shift show about distant galaxies?',
		back: 'Their light has longer observed wavelengths, showing they are moving away.',
		reverseFront: 'Longer observed wavelengths from distant galaxies.',
		reverseBack: 'Red-shift.',
		distractors: [
			'Shorter wavelengths showing galaxies are stationary.',
			'Cloudy limewater showing carbon dioxide.',
			'Count rate halving over time.'
		]
	})
];

export function getRecallTopic(topicId: string) {
	return recallCurriculumTopics.find((topic) => topic.id === topicId) ?? null;
}

export function getRecallTopicsForSubject(subject: RecallSubject | 'All subjects') {
	return recallCurriculumTopics.filter(
		(topic) => subject === 'All subjects' || topic.subject === subject
	);
}
