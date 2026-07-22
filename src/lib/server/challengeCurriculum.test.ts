import { describe, expect, it } from 'vitest';
import { challengeCatalog } from '$lib/challenges/catalog';
import { biologyCurriculumAliases } from '$lib/challenges/expansions/biology';
import { chemistryCurriculumAliases } from '$lib/challenges/expansions/chemistry';
import { physicsCurriculumAliases } from '$lib/challenges/expansions/physics';
import {
	ENGLAND_KS4_SCIENCE_CONTEXT_URL,
	challengeCurriculumReferences,
	publicChallengeCurriculumLink,
	publicChallengeCurriculumLinks,
	resolveChallengeCurriculumReference
} from './challengeCurriculum';

const chemistryReferenceIds = [
	'chemistry-alloy-hardness',
	'chemistry-collision-rate',
	'chemistry-stoichiometric-mass',
	'chemistry-constant-mass',
	'chemistry-ionic-bonding',
	'chemistry-molten-electrolysis',
	'chemistry-exothermic-energy',
	'chemistry-flame-tests',
	'chemistry-equilibrium-pressure',
	'chemistry-life-cycle'
] as const;

describe('challenge curriculum references', () => {
	it('covers all 30 Biology, 30 Chemistry and 32 Physics definitions', () => {
		expect(Object.keys(challengeCurriculumReferences)).toHaveLength(92);
		expect(
			Object.keys(challengeCurriculumReferences).filter((id) => id.startsWith('biology-'))
		).toHaveLength(30);
		expect(
			Object.keys(challengeCurriculumReferences).filter((id) => id.startsWith('physics-'))
		).toHaveLength(32);
		expect(
			Object.keys(challengeCurriculumReferences).filter((id) => id.startsWith('chemistry-'))
		).toEqual(expect.arrayContaining([...chemistryReferenceIds]));
		expect(
			Object.keys(challengeCurriculumReferences).filter((id) => id.startsWith('chemistry-'))
		).toHaveLength(30);
	});

	it('grounds each expansion id in one explicit reviewed topic reference', () => {
		const aliases = {
			...biologyCurriculumAliases,
			...chemistryCurriculumAliases,
			...physicsCurriculumAliases
		};

		expect(Object.keys(aliases)).toHaveLength(60);
		for (const [id, sourceId] of Object.entries(aliases)) {
			const reference = challengeCurriculumReferences[id];
			expect(reference, `${id} via ${sourceId}`).toBeDefined();
			expect(reference?.officialUrl, id).toMatch(/^https:\/\/www\.aqa\.org\.uk\//u);
			expect(reference?.expectedContent.length, id).toBeGreaterThanOrEqual(2);
		}
	});

	it('uses exact official specification references for every expanded subject area', () => {
		const expected = {
			'biology-disinfectant-data-conclusions': {
				specificationCode: '8464',
				specRef: 'WS 3.5',
				topicLabel: 'Interpreting observations and drawing conclusions',
				urlFragment: '#3_Analysis_and_evaluation'
			},
			'biology-catalase-denaturation': {
				specificationCode: '8464',
				specRef: '4.2.2.1',
				topicLabel: 'The human digestive system: enzyme action',
				urlFragment: '#The_human_digestive_system'
			},
			'biology-blood-glucose-control-loop': {
				specificationCode: '8464',
				specRef: '4.5.3.2',
				topicLabel: 'Control of blood glucose concentration',
				urlFragment: '#Control_of_blood_glucose_concentration'
			},
			'biology-homeostasis-control': {
				specificationCode: '8464',
				specRef: '4.5.1',
				topicLabel: 'Homeostasis',
				urlFragment: '#Homeostasis'
			},
			'biology-recessive-inheritance': {
				specificationCode: '8464',
				specRef: '4.6.1.4',
				topicLabel: 'Genetic inheritance',
				urlFragment: '#Genetic_inheritance'
			},
			'chemistry-ionic-bonding': {
				specificationCode: '8464',
				specRef: '5.2.1.1',
				topicLabel: 'Chemical bonds',
				urlFragment: '#Chemical_bonds'
			},
			'chemistry-molten-electrolysis': {
				specificationCode: '8464',
				specRef: '5.4.3.5',
				topicLabel: 'Representation of reactions at electrodes as half equations (HT only)',
				urlFragment: '#Representation_of_reactions_at_electrodes_as_half_equations_HT_only'
			},
			'chemistry-exothermic-energy': {
				specificationCode: '8464',
				specRef: '5.5.1.1',
				topicLabel: 'Energy transfer during exothermic and endothermic reactions',
				urlFragment: '#Energy_transfer_during_exothermic_and_endothermic_reactions'
			},
			'chemistry-flame-tests': {
				specificationCode: '8462',
				specRef: '4.8.3.1',
				topicLabel: 'Flame tests',
				urlFragment: '#Flame_tests'
			},
			'chemistry-equilibrium-pressure': {
				specificationCode: '8464',
				specRef: '5.6.2.7',
				topicLabel: 'The effect of pressure changes on equilibrium (HT only)',
				urlFragment: '#The_effect_of_pressure_changes_on_equilibrium_HT_only'
			},
			'chemistry-life-cycle': {
				specificationCode: '8464',
				specRef: '5.10.2.1',
				topicLabel: 'Life cycle assessment',
				urlFragment: '#Life_cycle_assessment'
			}
		} as const;

		for (const [id, exact] of Object.entries(expected)) {
			const reference = challengeCurriculumReferences[id as keyof typeof expected];
			expect(reference).toMatchObject({
				specificationCode: exact.specificationCode,
				specRef: exact.specRef,
				topicLabel: exact.topicLabel
			});
			expect(reference.officialUrl).toContain(exact.urlFragment);
			if (exact.specRef.startsWith('WS ')) {
				expect(reference.expectedContent.some((line) => line.includes(exact.specRef))).toBe(true);
			} else {
				expect(reference.expectedHeading).toContain(exact.specRef);
			}
			expect(reference.expectedContent.length).toBeGreaterThanOrEqual(3);
		}
	});

	it('covers the exact current challenge catalog without a broad fallback', () => {
		expect(Object.keys(challengeCurriculumReferences).sort()).toEqual(
			challengeCatalog.map(({ id }) => id).sort()
		);

		for (const challenge of challengeCatalog) {
			expect(resolveChallengeCurriculumReference(challenge.id, challenge.subject)).toBeDefined();
		}
	});

	it('resolves each Chemistry id to its exact reviewed specification and live HTML fragment', () => {
		expect(
			resolveChallengeCurriculumReference('chemistry-alloy-hardness', 'chemistry')
		).toMatchObject({
			subject: 'chemistry',
			specificationCode: '8464',
			specRef: '5.2.2.7',
			expectedHeading: '5.2.2.7 Properties of metals and alloys',
			expectedContent: expect.arrayContaining([
				'Students should be able to explain why alloys are harder than pure metals in terms of distortion of the layers of atoms in the structure of a pure metal.'
			]),
			officialUrl:
				'https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/chemistry-subject-content#Properties_of_metals_and_alloys'
		});
		expect(
			resolveChallengeCurriculumReference('chemistry-collision-rate', 'chemistry')
		).toMatchObject({
			subject: 'chemistry',
			specificationCode: '8462',
			specRef: '4.6.1.3',
			expectedHeading: '4.6.1.3 Collision theory and activation energy',
			expectedContent: expect.arrayContaining([
				'Increasing the temperature increases the frequency of collisions and makes the collisions more energetic, and so increases the rate of reaction.'
			]),
			officialUrl:
				'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462/specification/subject-content/the-rate-and-extent-of-chemical-change#Collision_theory_and_activation_energy'
		});
		expect(
			resolveChallengeCurriculumReference('chemistry-stoichiometric-mass', 'chemistry')
		).toMatchObject({
			subject: 'chemistry',
			specificationCode: '8464',
			specRef: '5.3.2.2',
			expectedHeading: '5.3.2.2 Amounts of substances in equations (HT only)',
			expectedContent: expect.arrayContaining([
				'calculate the masses of reactants and products from the balanced symbol equation and the mass of a given reactant or product.'
			]),
			officialUrl:
				'https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/chemistry-subject-content#Amounts_of_substances_in_equations_HT_only'
		});
		expect(
			resolveChallengeCurriculumReference('chemistry-constant-mass', 'chemistry')
		).toMatchObject({
			subject: 'chemistry',
			specificationCode: '8462',
			specRef: '8.2.8',
			expectedHeading: '8.2.8 Required practical activity 8',
			expectedContent: expect.arrayContaining([
				'Analysis and purification of water samples from different sources, including pH, dissolved solids and distillation.',
				'AT 4 – safe use of a range of equipment to purify and/or separate chemical mixtures including evaporation, distillation.'
			]),
			officialUrl:
				'https://www.aqa.org.uk/subjects/chemistry/gcse/chemistry-8462/specification/practical-assessment#Required_practical_activity_8'
		});
	});

	it('grounds the aquatic-plant temperature challenge in Combined Biology 8464 photosynthesis', () => {
		expect(resolveChallengeCurriculumReference('biology-enzyme-denature', 'biology')).toMatchObject(
			{
				subject: 'biology',
				specificationCode: '8464',
				specRef: '4.4.1.2',
				topicLabel: 'Rate of photosynthesis',
				expectedHeading: '4.4.1.2 Rate of photosynthesis',
				expectedContent: expect.arrayContaining([
					'Students should be able to explain the effects of temperature, light intensity, carbon dioxide concentration, and the amount of chlorophyll on the rate of photosynthesis.',
					'Required practical activity 5: investigate the effect of light intensity on the rate of photosynthesis using an aquatic organism such as pondweed.'
				]),
				officialUrl:
					'https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/biology-subject-content#Rate_of_photosynthesis'
			}
		);
	});

	it('projects only the public topic label and deep link', () => {
		const publicLink = publicChallengeCurriculumLink('biology-enzyme-denature', 'biology');

		expect(publicLink).toEqual({
			topicLabel: 'Rate of photosynthesis',
			officialUrl:
				'https://www.aqa.org.uk/subjects/science/gcse/science-8464/specification/biology-subject-content#Rate_of_photosynthesis'
		});
		expect(publicLink).not.toHaveProperty('specificationCode');
		expect(publicLink).not.toHaveProperty('specRef');
		expect(publicLink).not.toHaveProperty('expectedHeading');
		expect(publicLink).not.toHaveProperty('expectedContent');
		expect(publicLink).not.toHaveProperty('verifiedAt');
		expect(publicLink).not.toHaveProperty('contextUrl');
	});

	it('deduplicates public topic links without exposing verification data', () => {
		const challenge = challengeCatalog.find(({ id }) => id === 'physics-zero-resultant');
		expect(challenge).toBeDefined();

		const links = publicChallengeCurriculumLinks([challenge!, challenge!]);
		expect(links).toHaveLength(1);
		expect(Object.keys(links[0] ?? {}).sort()).toEqual(['officialUrl', 'topicLabel']);
	});

	it('keeps the checked date and KS4 context on every Chemistry reference', () => {
		for (const id of challengeCatalog
			.filter(({ subject }) => subject === 'chemistry')
			.map(({ id }) => id)) {
			const reference = resolveChallengeCurriculumReference(id, 'chemistry');
			expect(reference?.verifiedAt).toBe('2026-07-21');
			expect(reference?.contextUrl).toBe(ENGLAND_KS4_SCIENCE_CONTEXT_URL);
		}
	});

	it('uses one canonical GOV.UK Key Stage 4 science context link for every reference', () => {
		for (const reference of Object.values(challengeCurriculumReferences)) {
			expect(reference.contextUrl).toBe(ENGLAND_KS4_SCIENCE_CONTEXT_URL);
		}
	});

	it('rejects an exact id with the wrong subject', () => {
		expect(
			resolveChallengeCurriculumReference('chemistry-alloy-hardness', 'biology')
		).toBeUndefined();
		expect(
			resolveChallengeCurriculumReference('biology-cell-differences', 'chemistry')
		).toBeUndefined();
	});

	it('returns undefined for unknown or near-match ids', () => {
		expect(
			resolveChallengeCurriculumReference('chemistry-not-reviewed', 'chemistry')
		).toBeUndefined();
		expect(
			resolveChallengeCurriculumReference(' Chemistry-Alloy-Hardness ', 'chemistry')
		).toBeUndefined();
	});
});
