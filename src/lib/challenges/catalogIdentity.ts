/**
 * The small, client-safe route index for durable progress and next-challenge
 * selection. Authored challenge content remains in catalog.ts.
 */
import { biologyExpansionIdentities } from './expansions/biologyIdentity';
import { chemistryExpansionIdentities } from './expansions/chemistryIdentity';
import { physicsExpansionIdentities } from './expansions/physicsIdentity';

export const challengeRouteIdentities = [
	{
		id: 'biology-data-conclusions',
		slug: 'smoking-risk-data-conclusions',
		subject: 'biology'
	},
	{
		id: 'biology-cell-differences',
		slug: 'prokaryotic-cell-differences',
		subject: 'biology'
	},
	{
		id: 'biology-extra-controls',
		slug: 'reaction-time-control-variables',
		subject: 'biology'
	},
	{
		id: 'biology-enzyme-denature',
		slug: 'enzyme-denaturation-at-45c',
		subject: 'biology'
	},
	{
		id: 'biology-reagent-colour',
		slug: 'protein-food-test-colour',
		subject: 'biology'
	},
	{
		id: 'biology-heated-food-test',
		slug: 'benedicts-sugar-test',
		subject: 'biology'
	},
	{ id: 'biology-ivf-sequence', slug: 'ivf-process-sequence', subject: 'biology' },
	{
		id: 'biology-vaccine-immunity',
		slug: 'measles-vaccine-immunity',
		subject: 'biology'
	},
	{
		id: 'biology-homeostasis-control',
		slug: 'homeostasis-control-loop',
		subject: 'biology'
	},
	{
		id: 'biology-recessive-inheritance',
		slug: 'recessive-allele-probability',
		subject: 'biology'
	},
	...biologyExpansionIdentities,
	{ id: 'chemistry-alloy-hardness', slug: 'alloy-hardness', subject: 'chemistry' },
	{
		id: 'chemistry-collision-rate',
		slug: 'temperature-collision-rate',
		subject: 'chemistry'
	},
	{
		id: 'chemistry-stoichiometric-mass',
		slug: 'ammonia-to-hydrogen-mass',
		subject: 'chemistry'
	},
	{
		id: 'chemistry-constant-mass',
		slug: 'heat-to-constant-mass',
		subject: 'chemistry'
	},
	{
		id: 'chemistry-ionic-bonding',
		slug: 'sodium-chloride-ionic-bond',
		subject: 'chemistry'
	},
	{
		id: 'chemistry-molten-electrolysis',
		slug: 'molten-lead-bromide-electrolysis',
		subject: 'chemistry'
	},
	{
		id: 'chemistry-exothermic-energy',
		slug: 'exothermic-temperature-rise',
		subject: 'chemistry'
	},
	{ id: 'chemistry-flame-tests', slug: 'potassium-flame-test', subject: 'chemistry' },
	{
		id: 'chemistry-equilibrium-pressure',
		slug: 'equilibrium-pressure-ammonia',
		subject: 'chemistry'
	},
	{
		id: 'chemistry-life-cycle',
		slug: 'life-cycle-comparison',
		subject: 'chemistry'
	},
	...chemistryExpansionIdentities,
	{ id: 'physics-gas-pressure', slug: 'gas-pressure-in-a-syringe', subject: 'physics' },
	{ id: 'physics-half-range', slug: 'half-range-uncertainty', subject: 'physics' },
	{
		id: 'physics-weight-equation',
		slug: 'rocket-weight-during-ascent',
		subject: 'physics'
	},
	{
		id: 'physics-momentum-sharing',
		slug: 'momentum-shared-in-a-collision',
		subject: 'physics'
	},
	{
		id: 'physics-conductivity-rate',
		slug: 'thermal-conductivity-ice-cream-bowl',
		subject: 'physics'
	},
	{
		id: 'physics-motor-force',
		slug: 'motor-effect-force-on-a-wire',
		subject: 'physics'
	},
	{
		id: 'physics-parallel-currents',
		slug: 'currents-in-parallel-branches',
		subject: 'physics'
	},
	{
		id: 'physics-resultant-acceleration',
		slug: 'resultant-force-on-a-trolley',
		subject: 'physics'
	},
	{
		id: 'physics-radiation-risk',
		slug: 'x-ray-screen-radiation-dose',
		subject: 'physics'
	},
	{
		id: 'physics-drag-balance',
		slug: 'parachute-terminal-velocity',
		subject: 'physics'
	},
	{
		id: 'physics-thinking-distance',
		slug: 'extra-thinking-distance',
		subject: 'physics'
	},
	{
		id: 'physics-zero-resultant',
		slug: 'zero-resultant-balanced-forces',
		subject: 'physics'
	},
	...physicsExpansionIdentities
] as const;

export const challengeIds = challengeRouteIdentities.map((challenge) => challenge.id);
export type ChallengeId = (typeof challengeRouteIdentities)[number]['id'];
