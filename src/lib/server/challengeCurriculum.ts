import type { ChallengeSubject } from '$lib/challenges/types';

export const ENGLAND_KS4_SCIENCE_CONTEXT_URL =
	'https://www.gov.uk/government/publications/national-curriculum-in-england-science-programmes-of-study/national-curriculum-in-england-science-programmes-of-study#key-stage-4';

const AQA_COMBINED_BIOLOGY_URL =
	'https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/biology-subject-content';
const AQA_COMBINED_CHEMISTRY_URL =
	'https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/chemistry-subject-content';
const AQA_COMBINED_PHYSICS_URL =
	'https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/physics-subject-content';
const AQA_COMBINED_WORKING_SCIENTIFICALLY_URL =
	'https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/working-scientifically';
const AQA_COMBINED_PRACTICAL_ASSESSMENT_URL =
	'https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/practical-assessment';
const AQA_BIOLOGY_ORGANISATION_URL =
	'https://www.aqa.org.uk/subjects/biology/gcse/biology-8461/specification/subject-content/organisation';
const AQA_PHYSICS_PARTICLE_MODEL_URL =
	'https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/specification/subject-content/particle-model-of-matter';
const AQA_PHYSICS_FORCES_URL =
	'https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/specification/subject-content/forces';
const AQA_PHYSICS_WORKING_SCIENTIFICALLY_URL =
	'https://www.aqa.org.uk/subjects/physics/gcse/physics-8463/specification/working-scientifically';
const AQA_CHEMISTRY_RATE_URL =
	'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/the-rate-and-extent-of-chemical-change';
const AQA_CHEMISTRY_PRACTICAL_ASSESSMENT_URL =
	'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462/specification/practical-assessment';
const AQA_CHEMISTRY_CHEMICAL_ANALYSIS_URL =
	'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/chemical-analysis';

const VERIFIED_AT = '2026-07-17' as const;

export type ChallengeCurriculumReference = {
	subject: ChallengeSubject;
	specificationLabel: string;
	specificationCode: '8461' | '8462' | '8463' | '8464';
	specRef: string;
	topicLabel: string;
	officialUrl: string;
	expectedHeading: string;
	expectedContent: readonly string[];
	verifiedAt: typeof VERIFIED_AT;
	contextUrl?: string;
};

type SpecificationIdentity = Pick<
	ChallengeCurriculumReference,
	'subject' | 'specificationLabel' | 'specificationCode'
>;

const biology8461 = {
	subject: 'biology',
	specificationLabel: 'AQA GCSE Biology (8461)',
	specificationCode: '8461'
} as const satisfies SpecificationIdentity;

const physics8463 = {
	subject: 'physics',
	specificationLabel: 'AQA GCSE Physics (8463)',
	specificationCode: '8463'
} as const satisfies SpecificationIdentity;

const chemistry8462 = {
	subject: 'chemistry',
	specificationLabel: 'AQA GCSE Chemistry (8462)',
	specificationCode: '8462'
} as const satisfies SpecificationIdentity;

const combinedBiology8464 = {
	subject: 'biology',
	specificationLabel: 'AQA GCSE Combined Science: Trilogy (8464)',
	specificationCode: '8464'
} as const satisfies SpecificationIdentity;

const combinedChemistry8464 = {
	subject: 'chemistry',
	specificationLabel: 'AQA GCSE Combined Science: Trilogy (8464)',
	specificationCode: '8464'
} as const satisfies SpecificationIdentity;

const combinedPhysics8464 = {
	subject: 'physics',
	specificationLabel: 'AQA GCSE Combined Science: Trilogy (8464)',
	specificationCode: '8464'
} as const satisfies SpecificationIdentity;

function reviewedReference(
	specification: SpecificationIdentity,
	reference: Pick<
		ChallengeCurriculumReference,
		'specRef' | 'topicLabel' | 'officialUrl' | 'expectedHeading' | 'expectedContent'
	>
): ChallengeCurriculumReference {
	return {
		...specification,
		...reference,
		verifiedAt: VERIFIED_AT,
		contextUrl: ENGLAND_KS4_SCIENCE_CONTEXT_URL
	};
}

/**
 * Reviewed public-web references for the launch challenge cohort.
 *
 * Combined Science questions deliberately stay within the 8464 specification
 * rather than swapping in a similar-looking 8461, 8462 or 8463 page. URLs
 * retain the exact live HTML fragments reviewed on 2026-07-17;
 * `expectedHeading` and `expectedContent` make later source-drift checks
 * possible without guessing.
 */
export const challengeCurriculumReferences = {
	'biology-data-conclusions': reviewedReference(biology8461, {
		specRef: '4.2.2.6',
		topicLabel: 'The effect of lifestyle on some non-communicable diseases',
		officialUrl: `${AQA_BIOLOGY_ORGANISATION_URL}#The_effect_of_lifestyle_on_some_non-communicable_diseases`,
		expectedHeading: '4.2.2.6 The effect of lifestyle on some non-communicable diseases',
		expectedContent: [
			'Risk factors are linked to an increased rate of a disease.',
			'The effects of diet, smoking and exercise on cardiovascular disease.',
			'Interpret data about risk factors for specified diseases.'
		]
	}),
	'biology-cell-differences': reviewedReference(combinedBiology8464, {
		specRef: '4.1.1.1',
		topicLabel: 'Eukaryotes and prokaryotes',
		officialUrl: `${AQA_COMBINED_BIOLOGY_URL}#Eukaryotes_and_prokaryotes`,
		expectedHeading: '4.1.1.1 Eukaryotes and prokaryotes',
		expectedContent: [
			'Plant and animal cells (eukaryotic cells) have a cell membrane, cytoplasm and genetic material enclosed in a nucleus.',
			'Bacterial cells (prokaryotic cells) are much smaller in comparison.',
			'The genetic material is not enclosed in a nucleus.'
		]
	}),
	'biology-extra-controls': reviewedReference(combinedBiology8464, {
		specRef: 'WS 2.2',
		topicLabel: 'Experimental skills and strategies',
		officialUrl: `${AQA_COMBINED_WORKING_SCIENTIFICALLY_URL}#2_Experimental_skills_and_strategies`,
		expectedHeading: '2 Experimental skills and strategies',
		expectedContent: [
			'WS 2.2 Plan experiments or devise procedures',
			'Explain the need to manipulate and control variables.',
			'control variables and be able to explain why they are kept the same.'
		]
	}),
	'biology-enzyme-denature': reviewedReference(combinedBiology8464, {
		specRef: '4.4.1.2',
		topicLabel: 'Rate of photosynthesis',
		officialUrl: `${AQA_COMBINED_BIOLOGY_URL}#Rate_of_photosynthesis`,
		expectedHeading: '4.4.1.2 Rate of photosynthesis',
		expectedContent: [
			'Students should be able to explain the effects of temperature, light intensity, carbon dioxide concentration, and the amount of chlorophyll on the rate of photosynthesis.',
			'measure and calculate rates of photosynthesis',
			'Required practical activity 5: investigate the effect of light intensity on the rate of photosynthesis using an aquatic organism such as pondweed.'
		]
	}),
	'biology-reagent-colour': reviewedReference(combinedBiology8464, {
		specRef: '4.2.2.1',
		topicLabel: 'The human digestive system',
		officialUrl: `${AQA_COMBINED_BIOLOGY_URL}#The_human_digestive_system`,
		expectedHeading: '4.2.2.1 The human digestive system',
		expectedContent: [
			'Required practical activity 3: use qualitative reagents to test for a range of carbohydrates, lipids and proteins.',
			'Benedict’s test for sugars; iodine test for starch; and Biuret reagent for protein.'
		]
	}),
	'biology-heated-food-test': reviewedReference(combinedBiology8464, {
		specRef: '10.2.3',
		topicLabel: 'Required practical activity 3',
		officialUrl: `${AQA_COMBINED_PRACTICAL_ASSESSMENT_URL}#Required_practical_activity_3`,
		expectedHeading: '10.2.3 Required practical activity 3',
		expectedContent: [
			'Use qualitative reagents to test for a range of carbohydrates, lipids and proteins.',
			'Benedict’s test for sugars; iodine test for starch; and Biuret reagent for protein.',
			'Biology AT 2 – safe use of a Bunsen burner and a boiling water bath.'
		]
	}),
	'biology-ivf-sequence': reviewedReference(combinedBiology8464, {
		specRef: '4.5.3.5',
		topicLabel: 'The use of hormones to treat infertility (HT only)',
		officialUrl: `${AQA_COMBINED_BIOLOGY_URL}#The_use_of_hormones_to_treat_infertility_HT_only`,
		expectedHeading: '4.5.3.5 The use of hormones to treat infertility (HT only)',
		expectedContent: [
			'The eggs are collected from the mother and fertilised by sperm from the father in the laboratory.',
			"one or two embryos are inserted into the mother's uterus (womb)."
		]
	}),
	'biology-vaccine-immunity': reviewedReference(combinedBiology8464, {
		specRef: '4.3.1.7',
		topicLabel: 'Vaccination',
		officialUrl: `${AQA_COMBINED_BIOLOGY_URL}#Vaccination`,
		expectedHeading: '4.3.1.7 Vaccination',
		expectedContent: [
			'Vaccination involves introducing small quantities of dead or inactive forms of a pathogen into the body',
			'the white blood cells respond quickly to produce the correct antibodies'
		]
	}),
	'biology-homeostasis-control': reviewedReference(combinedBiology8464, {
		specRef: '4.5.1',
		topicLabel: 'Homeostasis',
		officialUrl: `${AQA_COMBINED_BIOLOGY_URL}#Homeostasis`,
		expectedHeading: '4.5.1 Homeostasis',
		expectedContent: [
			'Homeostasis is the regulation of the internal conditions of a cell or organism to maintain optimum conditions for function in response to internal and external changes.',
			'These automatic control systems may involve nervous responses or chemical responses.',
			'All control systems include cells called receptors, coordination centres and effectors.'
		]
	}),
	'biology-recessive-inheritance': reviewedReference(combinedBiology8464, {
		specRef: '4.6.1.4',
		topicLabel: 'Genetic inheritance',
		officialUrl: `${AQA_COMBINED_BIOLOGY_URL}#Genetic_inheritance`,
		expectedHeading: '4.6.1.4 Genetic inheritance',
		expectedContent: [
			'An allele that is only expressed if two copies of it are present is called recessive.',
			'Students should be able to understand the concept of probability in predicting the results of a single gene cross',
			'Students should be able to complete a Punnett square diagram and extract and interpret information from genetic crosses and family trees.'
		]
	}),
	'chemistry-alloy-hardness': reviewedReference(combinedChemistry8464, {
		specRef: '5.2.2.7',
		topicLabel: 'Properties of metals and alloys',
		officialUrl: `${AQA_COMBINED_CHEMISTRY_URL}#Properties_of_metals_and_alloys`,
		expectedHeading: '5.2.2.7 Properties of metals and alloys',
		expectedContent: [
			'In pure metals, atoms are arranged in layers, which allows metals to be bent and shaped.',
			'Pure metals are too soft for many uses and so are mixed with other metals to make alloys which are harder.',
			'Students should be able to explain why alloys are harder than pure metals in terms of distortion of the layers of atoms in the structure of a pure metal.'
		]
	}),
	'chemistry-collision-rate': reviewedReference(chemistry8462, {
		specRef: '4.6.1.3',
		topicLabel: 'Collision theory and activation energy',
		officialUrl: `${AQA_CHEMISTRY_RATE_URL}#Collision_theory_and_activation_energy`,
		expectedHeading: '4.6.1.3 Collision theory and activation energy',
		expectedContent: [
			'Collision theory explains how various factors affect rates of reactions.',
			'Increasing the temperature increases the frequency of collisions and makes the collisions more energetic, and so increases the rate of reaction.',
			'predict and explain using collision theory the effects of changing conditions of concentration, pressure and temperature on the rate of a reaction'
		]
	}),
	'chemistry-stoichiometric-mass': reviewedReference(combinedChemistry8464, {
		specRef: '5.3.2.2',
		topicLabel: 'Amounts of substances in equations (HT only)',
		officialUrl: `${AQA_COMBINED_CHEMISTRY_URL}#Amounts_of_substances_in_equations_HT_only`,
		expectedHeading: '5.3.2.2 Amounts of substances in equations (HT only)',
		expectedContent: [
			'The masses of reactants and products can be calculated from balanced symbol equations.',
			'Chemical equations can be interpreted in terms of moles.',
			'calculate the masses of reactants and products from the balanced symbol equation and the mass of a given reactant or product.'
		]
	}),
	// The learner task asks what heating a water sample to an unchanged mass
	// demonstrates. Required practical 8 is the direct curriculum match: it names
	// analysis of dissolved solids and evaporation. The HTML does not itself use
	// "constant mass", so the drift anchors remain limited to its published wording.
	'chemistry-constant-mass': reviewedReference(chemistry8462, {
		specRef: '8.2.8',
		topicLabel: 'Required practical activity 8: dissolved solids in water',
		officialUrl: `${AQA_CHEMISTRY_PRACTICAL_ASSESSMENT_URL}#Required_practical_activity_8`,
		expectedHeading: '8.2.8 Required practical activity 8',
		expectedContent: [
			'Analysis and purification of water samples from different sources, including pH, dissolved solids and distillation.',
			'AT 2 – safe use of appropriate heating devices and techniques including use of a Bunsen burner and a water bath or electric heater.',
			'AT 4 – safe use of a range of equipment to purify and/or separate chemical mixtures including evaporation, distillation.'
		]
	}),
	'chemistry-ionic-bonding': reviewedReference(combinedChemistry8464, {
		specRef: '5.2.1.1',
		topicLabel: 'Chemical bonds',
		officialUrl: `${AQA_COMBINED_CHEMISTRY_URL}#Chemical_bonds`,
		expectedHeading: '5.2.1.1 Chemical bonds',
		expectedContent: [
			'For ionic bonding the particles are oppositely charged ions.',
			'Ionic bonding occurs in compounds formed from metals combined with non-metals.',
			'Students should be able to explain chemical bonding in terms of electrostatic forces and the transfer or sharing of electrons.'
		]
	}),
	'chemistry-molten-electrolysis': reviewedReference(combinedChemistry8464, {
		specRef: '5.4.3.5',
		topicLabel: 'Representation of reactions at electrodes as half equations (HT only)',
		officialUrl: `${AQA_COMBINED_CHEMISTRY_URL}#Representation_of_reactions_at_electrodes_as_half_equations_HT_only`,
		expectedHeading:
			'5.4.3.5 Representation of reactions at electrodes as half equations (HT only)',
		expectedContent: [
			'During electrolysis, at the cathode (negative electrode), positively charged ions gain electrons and so the reactions are reductions.',
			'At the anode (positive electrode), negatively charged ions lose electrons and so the reactions are oxidations.',
			'Reactions at electrodes can be represented by half equations'
		]
	}),
	'chemistry-exothermic-energy': reviewedReference(combinedChemistry8464, {
		specRef: '5.5.1.1',
		topicLabel: 'Energy transfer during exothermic and endothermic reactions',
		officialUrl: `${AQA_COMBINED_CHEMISTRY_URL}#Energy_transfer_during_exothermic_and_endothermic_reactions`,
		expectedHeading: '5.5.1.1 Energy transfer during exothermic and endothermic reactions',
		expectedContent: [
			'Energy is conserved in chemical reactions.',
			'In exothermic reactions, energy is transferred to the surroundings so the temperature of the surroundings increases.',
			'In endothermic reactions, energy is taken in from the surroundings so the temperature of the surroundings decreases.'
		]
	}),
	'chemistry-flame-tests': reviewedReference(chemistry8462, {
		specRef: '4.8.3.1',
		topicLabel: 'Flame tests',
		officialUrl: `${AQA_CHEMISTRY_CHEMICAL_ANALYSIS_URL}#Flame_tests`,
		expectedHeading: '4.8.3.1 Flame tests',
		expectedContent: [
			'Flame tests can be used to identify some metal ions (cations).',
			'Lithium, Li+ gives a crimson flame; sodium, Na+ gives a yellow flame; potassium, K+ gives a lilac flame.',
			'If a sample containing a mixture of ions is used some flame colours can be masked.'
		]
	}),
	'chemistry-equilibrium-pressure': reviewedReference(combinedChemistry8464, {
		specRef: '5.6.2.7',
		topicLabel: 'The effect of pressure changes on equilibrium (HT only)',
		officialUrl: `${AQA_COMBINED_CHEMISTRY_URL}#The_effect_of_pressure_changes_on_equilibrium_HT_only`,
		expectedHeading: '5.6.2.7 The effect of pressure changes on equilibrium (HT only)',
		expectedContent: [
			'an increase in pressure causes the equilibrium position to shift towards the side with the smaller number of molecules as shown by the symbol equation for that reaction',
			'a decrease in pressure causes the equilibrium position to shift towards the side with the larger number of molecules as shown by the symbol equation for that reaction',
			'Students should be able to interpret appropriate given data to predict the effect of pressure changes on given reactions at equilibrium.'
		]
	}),
	'chemistry-life-cycle': reviewedReference(combinedChemistry8464, {
		specRef: '5.10.2.1',
		topicLabel: 'Life cycle assessment',
		officialUrl: `${AQA_COMBINED_CHEMISTRY_URL}#Life_cycle_assessment`,
		expectedHeading: '5.10.2.1 Life cycle assessment',
		expectedContent: [
			'Life cycle assessments (LCAs) are carried out to assess the environmental impact of products in each of these stages.',
			'extracting and processing raw materials; manufacturing and packaging; use and operation during its lifetime; disposal at the end of its useful life, including transport and distribution at each stage.',
			'Comparative LCAs can be used to evaluate products made from alternative materials.'
		]
	}),
	'physics-gas-pressure': reviewedReference(physics8463, {
		specRef: '4.3.3.2',
		topicLabel: 'Pressure in gases (physics only)',
		officialUrl: `${AQA_PHYSICS_PARTICLE_MODEL_URL}#Pressure_in_gases_physics_only`,
		expectedHeading: '4.3.3.2 Pressure in gases (physics only)',
		expectedContent: [
			'fixed mass of gas held at a constant temperature',
			'increasing the volume',
			'decrease in pressure'
		]
	}),
	'physics-half-range': reviewedReference(physics8463, {
		specRef: 'WS 3.4',
		topicLabel: 'Representing distributions of results and make estimations of uncertainty',
		officialUrl: `${AQA_PHYSICS_WORKING_SCIENTIFICALLY_URL}#3_Analysis_and_evaluation`,
		expectedHeading: '3 Analysis and evaluation',
		expectedContent: [
			'WS 3.4 Representing distributions of results and make estimations of uncertainty.',
			'there is always some uncertainty',
			'Use the range of a set of measurements about the mean as a measure of uncertainty.'
		]
	}),
	'physics-weight-equation': reviewedReference(combinedPhysics8464, {
		specRef: '6.5.1.3',
		topicLabel: 'Gravity',
		officialUrl: `${AQA_COMBINED_PHYSICS_URL}#Gravity`,
		expectedHeading: '6.5.1.3 Gravity',
		expectedContent: [
			'The weight of an object depends on the gravitational field strength at the point where the object is.',
			'The weight of an object and the mass of an object are directly proportional.'
		]
	}),
	'physics-momentum-sharing': reviewedReference(combinedPhysics8464, {
		specRef: '6.5.5.2',
		topicLabel: 'Conservation of momentum',
		officialUrl: `${AQA_COMBINED_PHYSICS_URL}#Conservation_of_momentum`,
		expectedHeading: '6.5.5.2 Conservation of momentum',
		expectedContent: [
			'In a closed system, the total momentum before an event is equal to the total momentum after the event.',
			'use the concept of momentum as a model to describe and explain examples of momentum in an event, such as a collision'
		]
	}),
	'physics-conductivity-rate': reviewedReference(combinedPhysics8464, {
		specRef: '6.1.2.1',
		topicLabel: 'Energy transfers in a system',
		officialUrl: `${AQA_COMBINED_PHYSICS_URL}#Energy_transfers_in_a_system`,
		expectedHeading: '6.1.2.1 Energy transfers in a system',
		expectedContent: [
			'explain ways of reducing unwanted energy transfers, for example through lubrication and the use of thermal insulation',
			'The higher the thermal conductivity of a material the higher the rate of energy transfer by conduction across the material.'
		]
	}),
	'physics-motor-force': reviewedReference(combinedPhysics8464, {
		specRef: '6.7.2.2',
		topicLabel: "Fleming's left-hand rule (HT only)",
		officialUrl: `${AQA_COMBINED_PHYSICS_URL}#Flemingandapos;s_left-hand_rule_HT_only`,
		expectedHeading: "6.7.2.2 Fleming's left-hand rule (HT only)",
		expectedContent: [
			'When a conductor carrying a current is placed in a magnetic field the magnet producing the field and the conductor exert a force on each other.',
			'This is called the motor effect.'
		]
	}),
	'physics-parallel-currents': reviewedReference(combinedPhysics8464, {
		specRef: '6.2.2',
		topicLabel: 'Series and parallel circuits',
		officialUrl: `${AQA_COMBINED_PHYSICS_URL}#Series_and_parallel_circuits`,
		expectedHeading: '6.2.2 Series and parallel circuits',
		expectedContent: [
			'the potential difference across each component is the same',
			'the total current through the whole circuit is the sum of the currents through the separate components'
		]
	}),
	'physics-resultant-acceleration': reviewedReference(physics8463, {
		specRef: '4.5.6.2.2',
		topicLabel: "Newton's Second Law",
		officialUrl: `${AQA_PHYSICS_FORCES_URL}#Newtonandapos;s_Second_Law`,
		expectedHeading: "4.5.6.2.2 Newton's Second Law",
		expectedContent: [
			'The acceleration of an object is proportional to the resultant force acting on the object',
			'inversely proportional to the mass of the object'
		]
	}),
	'physics-radiation-risk': reviewedReference(combinedPhysics8464, {
		specRef: '6.6.2.3',
		topicLabel: 'Properties of electromagnetic waves 2',
		officialUrl: `${AQA_COMBINED_PHYSICS_URL}#Properties_of_electromagnetic_waves_2`,
		expectedHeading: '6.6.2.3 Properties of electromagnetic waves 2',
		expectedContent: [
			'Ultraviolet waves, X-rays and gamma rays can have hazardous effects on human body tissue.',
			'Radiation dose (in sieverts) is a measure of the risk of harm resulting from an exposure of the body to the radiation.'
		]
	}),
	'physics-drag-balance': reviewedReference(combinedPhysics8464, {
		specRef: '6.5.4.1.5',
		topicLabel: 'Acceleration',
		officialUrl: `${AQA_COMBINED_PHYSICS_URL}#Acceleration`,
		expectedHeading: '6.5.4.1.5 Acceleration',
		expectedContent: [
			'An object falling through a fluid initially accelerates due to the force of gravity.',
			'Eventually the resultant force will be zero and the object will move at its terminal velocity.'
		]
	}),
	'physics-thinking-distance': reviewedReference(combinedPhysics8464, {
		specRef: '6.5.4.3.2',
		topicLabel: 'Reaction time',
		officialUrl: `${AQA_COMBINED_PHYSICS_URL}#Reaction_time`,
		expectedHeading: '6.5.4.3.2 Reaction time',
		expectedContent: [
			'A driver’s reaction time can be affected by tiredness, drugs and alcohol.',
			'evaluate the effect of various factors on thinking distance based on given data'
		]
	}),
	'physics-zero-resultant': reviewedReference(physics8463, {
		specRef: '4.5.1.4',
		topicLabel: 'Resultant forces',
		officialUrl: `${AQA_PHYSICS_FORCES_URL}#Resultant_forces`,
		expectedHeading: '4.5.1.4 Resultant forces',
		expectedContent: [
			'A number of forces acting on an object may be replaced by a single force that has the same effect as all the original forces acting together.',
			'balanced forces when the resultant force is zero'
		]
	})
} as const satisfies Readonly<Record<string, ChallengeCurriculumReference>>;

export type ReviewedChallengeCurriculumId = keyof typeof challengeCurriculumReferences;

/**
 * Resolve only an exact reviewed challenge and reject subject mismatches.
 *
 * The launch cohort is complete, so an unknown id intentionally has no broad
 * subject fallback: choosing one could silently turn an 8464 question into an
 * 8461, 8462 or 8463 citation.
 */
export function resolveChallengeCurriculumReference(
	challengeId: string,
	subject?: ChallengeSubject
): ChallengeCurriculumReference | undefined {
	if (!Object.prototype.hasOwnProperty.call(challengeCurriculumReferences, challengeId)) {
		return undefined;
	}

	const reference = (
		challengeCurriculumReferences as Readonly<
			Record<string, ChallengeCurriculumReference | undefined>
		>
	)[challengeId];

	if (!reference || (subject && reference.subject !== subject)) return undefined;
	return reference;
}

export type PublicChallengeCurriculumLink = {
	topicLabel: string;
	officialUrl: string;
};

/**
 * Return only the learner-facing topic and reviewed deep link.
 *
 * The source anchors, expected page text, verification date and specification
 * identity remain in this server-only registry so they cannot become part of
 * a public route payload.
 */
export function publicChallengeCurriculumLink(
	challengeId: string,
	subject?: ChallengeSubject
): PublicChallengeCurriculumLink | undefined {
	const reference = resolveChallengeCurriculumReference(challengeId, subject);
	if (!reference) return undefined;

	return {
		topicLabel: reference.topicLabel,
		officialUrl: reference.officialUrl
	};
}

export function publicChallengeCurriculumLinks(
	challenges: ReadonlyArray<{ id: string; subject: ChallengeSubject }>
): PublicChallengeCurriculumLink[] {
	const links = challenges
		.map(({ id, subject }) => publicChallengeCurriculumLink(id, subject))
		.filter((link): link is PublicChallengeCurriculumLink => Boolean(link));

	return [
		...new Map(links.map((link) => [`${link.officialUrl}\u0000${link.topicLabel}`, link])).values()
	];
}
