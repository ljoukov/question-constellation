import { base } from '$app/paths';
import type { ChainIllustration } from '$lib/chains/chainIllustration';
import type { ChallengeDefinition } from './types';

export type ChallengeCardArt = {
	src: string;
	darkSrc?: string;
	alt: string;
	width: number;
	height: number;
};

export type ChallengeVisualDefinition = {
	segments: string[];
	decisiveIndex: number;
	decisiveLabel: string;
	cardArt?: ChallengeCardArt;
	transferArt?: ChallengeCardArt;
	earnedIllustration?: ChainIllustration;
	mobilePanels?: Array<{ label: string; position: string }>;
	teaserPosition?: string;
};

const atlasRoot = `${base}/product/challenges/atlas`;
const cardRoot = `${base}/product/challenges/cards`;
const cardArtRevision = '20260719-1';

function cardArt(id: string, alt: string, version = 'v1'): ChallengeCardArt {
	return {
		src: `${cardRoot}/${id}-light-${version}.webp?rev=${cardArtRevision}`,
		darkSrc: `${cardRoot}/${id}-dark-${version}.webp?rev=${cardArtRevision}`,
		alt,
		width: 1672,
		height: 941
	};
}

function atlasIllustration(id: string, alt: string, caption: string): ChainIllustration {
	return {
		id: `challenge-atlas-${id}-v1`,
		src: `${atlasRoot}/${id}-dark-v1.webp`,
		lightSrc: `${atlasRoot}/${id}-light-v1.webp`,
		alt,
		caption,
		width: 1672,
		height: 941
	};
}

const earnedIllustrations = {
	'biology-enzyme-denature': atlasIllustration(
		'enzyme-denaturation',
		'Diagram showing excessive heat changing an enzyme, altering its active site, preventing substrate binding and reducing reaction rate.',
		'Too hot → enzyme denatures → active site changes → substrate no longer fits → reaction rate falls.'
	),
	'biology-vaccine-immunity': atlasIllustration(
		'vaccine-immunity',
		'Diagram showing a harmless vaccine antigen, specific antibodies, memory cells and a faster response on later exposure.',
		'Harmless antigen → specific antibodies → memory cells → faster response.'
	),
	'physics-conductivity-rate': atlasIllustration(
		'thermal-conductivity',
		'Diagram comparing heat transfer through metal and plastic and applying the contrast to a pan and handle.',
		'Thermal conductivity controls energy-transfer rate; the context determines which direction helps.'
	),
	'physics-momentum-sharing': atlasIllustration(
		'momentum-sharing',
		'A continuous diagram showing momentum transferred between two trolleys while total momentum is conserved.',
		'Total momentum is conserved as one object gains momentum and the other loses it.'
	),
	'physics-parallel-currents': atlasIllustration(
		'parallel-current',
		'Circuit diagram showing equal potential difference across parallel branches and branch currents adding in the main wire.',
		'Parallel branches share potential difference; currents add at a junction.'
	),
	'physics-resultant-acceleration': atlasIllustration(
		'resultant-acceleration',
		'Mechanics diagram showing forces combined into a resultant and the resulting acceleration for fixed mass.',
		'Combine forces first; use the resultant to predict acceleration and motion.'
	)
} satisfies Record<string, ChainIllustration>;

const challengeVisuals: Record<string, ChallengeVisualDefinition> = {
	'biology-data-conclusions': {
		segments: ['Read the pattern', 'Compare the values', 'Make only the supported claim'],
		decisiveIndex: 2,
		decisiveLabel: 'A link is not proof of a cause.',
		cardArt: cardArt(
			'smoking-risk-data',
			'Paired risk bars rising by different amounts in front of a subtle heart and lungs diagram.'
		)
	},
	'biology-cell-differences': {
		segments: ['Choose a feature', 'State the direction', 'Give the requested number'],
		decisiveIndex: 2,
		decisiveLabel: 'One difference cannot earn three marking points.',
		cardArt: cardArt(
			'cell-differences',
			'A prokaryotic cell and a eukaryotic cell shown side by side on a textbook grid.'
		)
	},
	'biology-extra-controls': {
		segments: ['Relevant variable', 'Specific control', 'Not already controlled'],
		decisiveIndex: 1,
		decisiveLabel: 'A control has to be usable, not just sensible-sounding.',
		cardArt: cardArt(
			'reaction-time-controls',
			'Two stand-mounted ruler-drop reaction-time setups arranged side by side.',
			'v2'
		)
	},
	'biology-enzyme-denature': {
		segments: ['Too hot', 'Enzyme denatures', 'Active site changes', 'Substrate no longer fits'],
		decisiveIndex: 2,
		decisiveLabel: 'Heat changes the active-site shape.',
		cardArt: cardArt(
			'enzyme-feature',
			'Pondweed in a warm water bath with a lamp and gas-collection tube.',
			'v2'
		),
		transferArt: cardArt(
			'enzyme-feature',
			'Pondweed in a warm water bath with a lamp and gas-collection tube.',
			'v2'
		),
		earnedIllustration: earnedIllustrations['biology-enzyme-denature'],
		teaserPosition: '48% 44%'
	},
	'biology-reagent-colour': {
		segments: ['Add Biuret solution', 'Observe the result', 'Name mauve or purple'],
		decisiveIndex: 2,
		decisiveLabel: 'The positive colour is the evidence.',
		cardArt: cardArt(
			'biology-protein-test',
			'A drink sample and unlabelled blue food-test reagent arranged as a colour-neutral laboratory setup.'
		)
	},
	'biology-heated-food-test': {
		segments: ["Add Benedict's", 'Heat the mixture', 'Look for a change from blue'],
		decisiveIndex: 1,
		decisiveLabel: 'The reagent does not complete the test without heat.',
		cardArt: cardArt(
			'biology-benedicts-test',
			'A drink sample, blue food-test reagent and a laboratory water-bath setup before any result is shown.'
		)
	},
	'biology-ivf-sequence': {
		segments: [
			'Collect mature eggs',
			'Fertilise in the laboratory',
			'Let embryos divide',
			'Transfer to the uterus'
		],
		decisiveIndex: 1,
		decisiveLabel: 'In vitro means fertilisation happens outside the body.',
		cardArt: cardArt(
			'biology-ivf-lab',
			'A clinical embryology laboratory still life with a microscope, pipette, dish and incubator.'
		)
	},
	'biology-vaccine-immunity': {
		segments: [
			'Harmless antigen',
			'Specific antibodies',
			'Memory cells remain',
			'Faster later response'
		],
		decisiveIndex: 2,
		decisiveLabel: 'Memory cells make the protection last.',
		cardArt: cardArt(
			'immunity-feature',
			'An unlabelled vaccine vial and capped syringe beside a neutral shield motif.',
			'v2'
		),
		earnedIllustration: earnedIllustrations['biology-vaccine-immunity'],
		mobilePanels: [
			{ label: 'Harmless antigen', position: '5% 20%' },
			{ label: 'Specific antibodies', position: '92% 20%' },
			{ label: 'Memory cells remain', position: '92% 88%' },
			{ label: 'Faster later response', position: '5% 88%' }
		],
		teaserPosition: '50% 49%'
	},
	'biology-homeostasis-control': {
		segments: [
			'Condition changes',
			'Receptor detects it',
			'Information is coordinated',
			'Effector restores suitable limits'
		],
		decisiveIndex: 2,
		decisiveLabel: 'The response moves the condition back within suitable limits.',
		cardArt: cardArt(
			'biology-homeostasis-control',
			'A body control loop linking a changing condition, receptors, a coordination centre and an effector response that returns a gauge to its safe range.'
		)
	},
	'biology-recessive-inheritance': {
		segments: [
			'Cross the alleles',
			'List the genotypes',
			'Match genotype to phenotype',
			'Find probability'
		],
		decisiveIndex: 2,
		decisiveLabel: 'A carrier does not show the recessive phenotype.',
		cardArt: cardArt(
			'biology-recessive-inheritance',
			'A Punnett square for Aa × Aa showing the outcomes AA, Aa, Aa and aa.',
			'v2'
		)
	},
	'chemistry-alloy-hardness': {
		segments: [
			'Different-sized atoms',
			'Layers become distorted',
			'Layers slide less easily',
			'The alloy is harder'
		],
		decisiveIndex: 1,
		decisiveLabel: 'Different-sized atoms disrupt the regular layers.',
		cardArt: cardArt(
			'chemistry-alloy-hardness',
			'Plain metal test pieces arranged beside an unused indentation tester.',
			'v2'
		)
	},
	'chemistry-collision-rate': {
		segments: [
			'Temperature rises',
			'Particles move faster',
			'More collisions succeed',
			'Reaction rate rises'
		],
		decisiveIndex: 2,
		decisiveLabel: 'The faster rate comes from more successful collisions.',
		cardArt: cardArt(
			'chemistry-temperature-rate',
			'Two identical reaction flasks resting in cool and warm water baths before the reaction begins.',
			'v2'
		)
	},
	'chemistry-stoichiometric-mass': {
		segments: ['Find ammonia moles', 'Use the equation ratio', 'Find hydrogen moles', 'Find mass'],
		decisiveIndex: 1,
		decisiveLabel: 'The balanced equation sets a three-to-two hydrogen-to-ammonia ratio.',
		cardArt: cardArt(
			'chemistry-stoichiometric-mass',
			'An ammonia reactor supplied by separate unlabelled nitrogen and hydrogen vessels.',
			'v2'
		)
	},
	'chemistry-constant-mass': {
		segments: ['Heat', 'Cool', 'Weigh', 'Repeat until unchanged'],
		decisiveIndex: 3,
		decisiveLabel: 'An unchanged mass shows that all the water has been removed.',
		cardArt: cardArt(
			'chemistry-constant-mass',
			'A damp precipitate in an evaporating dish beside separate laboratory heating and weighing equipment.',
			'v2'
		)
	},
	'chemistry-ionic-bonding': {
		segments: ['Transfer electrons', 'Form charged ions', 'Opposite charges attract'],
		decisiveIndex: 2,
		decisiveLabel: 'Electrostatic attraction holds the ions together.',
		cardArt: cardArt(
			'chemistry-ionic-bonding',
			'Atom models showing one outer electron transferring before the resulting positive and negative ions attract.'
		)
	},
	'chemistry-molten-electrolysis': {
		segments: [
			'Identify ion charge',
			'Move to opposite electrode',
			'Gain or lose electrons',
			'Form product'
		],
		decisiveIndex: 1,
		decisiveLabel: 'Each ion moves to the electrode with the opposite charge.',
		cardArt: cardArt(
			'chemistry-molten-electrolysis',
			'Molten electrolysis apparatus with a metal deposit at the negative electrode and gas bubbles at the positive electrode.'
		)
	},
	'chemistry-exothermic-energy': {
		segments: [
			'Read temperature change',
			'Track energy direction',
			'Name exothermic or endothermic'
		],
		decisiveIndex: 1,
		decisiveLabel: 'Warmer surroundings received energy from the reaction.',
		cardArt: cardArt(
			'chemistry-exothermic-energy',
			'An insulated-cup reaction before and after mixing, with the thermometer rising as energy is transferred to the surroundings.'
		)
	},
	'chemistry-flame-tests': {
		segments: ['Clean the loop', 'Add the sample', 'Observe flame colour', 'Identify the ion'],
		decisiveIndex: 0,
		decisiveLabel: 'Cleaning prevents another ion masking the result.',
		cardArt: cardArt(
			'chemistry-flame-tests',
			'Clean wire loops held in the flames of three complete Bunsen setups, producing crimson, yellow and lilac flame colours.',
			'v2'
		)
	},
	'chemistry-equilibrium-pressure': {
		segments: [
			'Count gas molecules',
			'Compare both sides',
			'Favour the side with fewer',
			'Predict yield'
		],
		decisiveIndex: 2,
		decisiveLabel: 'Higher pressure favours fewer gas molecules.',
		cardArt: cardArt(
			'chemistry-stoichiometric-mass',
			'An ammonia reactor and gas supply vessels used to introduce equilibrium pressure.',
			'v2'
		)
	},
	'chemistry-life-cycle': {
		segments: ['Raw materials', 'Manufacture and transport', 'Use and reuse', 'Disposal'],
		decisiveIndex: 1,
		decisiveLabel: 'One benefit cannot stand in for the whole life cycle.',
		cardArt: cardArt(
			'chemistry-life-cycle',
			'A product life cycle from raw-material extraction through manufacture, transport and repeated use, branching to recycling or final disposal.',
			'v2'
		)
	},
	'physics-gas-pressure': {
		segments: [
			'Condition changes',
			'Particle motion or spacing changes',
			'Wall collisions change',
			'Pressure changes'
		],
		decisiveIndex: 2,
		decisiveLabel: 'Pressure comes from collisions with the walls.',
		cardArt: cardArt(
			'gas-pressure',
			'A transparent gas syringe containing particles on a textbook grid.'
		)
	},
	'physics-half-range': {
		segments: ['Highest minus lowest', 'Find the range', 'Divide by two'],
		decisiveIndex: 2,
		decisiveLabel: 'Range is not yet half-range uncertainty.',
		cardArt: cardArt(
			'uncertainty-feature',
			'Three dynamics trolleys beside marked rulers with several unlabelled position markers.',
			'v2'
		),
		transferArt: cardArt(
			'gas-pressure',
			'A gas syringe prepared for a pressure-measurement investigation.'
		)
	},
	'physics-weight-equation': {
		segments: [
			'Use mass',
			'Multiply by gravitational field strength',
			'Keep acceleration separate'
		],
		decisiveIndex: 1,
		decisiveLabel: 'Weight follows mass × gravitational field strength.',
		cardArt: cardArt(
			'physics-weight-rocket',
			'An unmanned rocket at two altitudes above Earth with its fuel context shown but no force labels.'
		)
	},
	'physics-momentum-sharing': {
		segments: [
			'Choose the system',
			'Total momentum is conserved',
			'One object gains',
			'The other loses'
		],
		decisiveIndex: 1,
		decisiveLabel: 'Momentum is redistributed, not converted into sound.',
		cardArt: cardArt(
			'physics-momentum-collision',
			'A moving toy train approaching a stationary toy carriage on a straight track.'
		),
		earnedIllustration: earnedIllustrations['physics-momentum-sharing'],
		teaserPosition: '50% 50%'
	},
	'physics-conductivity-rate': {
		segments: ['Compare conductivity', 'Infer transfer rate', 'Use the direction in context'],
		decisiveIndex: 2,
		decisiveLabel: 'Fast transfer helps one part and hurts the other.',
		cardArt: cardArt(
			'physics-conductivity-bowl',
			'An ice-cream bowl combining metal and plastic parts without heat-flow labels.'
		),
		earnedIllustration: earnedIllustrations['physics-conductivity-rate'],
		teaserPosition: '52% 53%'
	},
	'physics-motor-force': {
		segments: ['Current in a magnetic field', 'Fields interact', 'A force acts', 'The wire moves'],
		decisiveIndex: 1,
		decisiveLabel: 'The force comes from interacting magnetic fields.',
		cardArt: cardArt(
			'physics-motor-wire',
			'A vertical copper wire crossing the horizontal magnetic field between facing poles, connected in a simple battery-and-switch circuit.',
			'v2'
		)
	},
	'physics-parallel-currents': {
		segments: [
			'Parallel branches',
			'Same potential difference',
			'Branch currents',
			'Currents add at a junction'
		],
		decisiveIndex: 3,
		decisiveLabel: 'Currents add in the main wire, not inside each branch.',
		cardArt: cardArt(
			'physics-parallel-circuit',
			'A parallel circuit with a battery, two lamp branches and unlabelled ammeters.'
		),
		earnedIllustration: earnedIllustrations['physics-parallel-currents'],
		teaserPosition: '50% 52%'
	},
	'physics-resultant-acceleration': {
		segments: [
			'Combine every force',
			'Find the resultant',
			'Use its direction',
			'Predict acceleration'
		],
		decisiveIndex: 1,
		decisiveLabel: 'Motion follows the resultant, not one force alone.',
		cardArt: cardArt(
			'physics-resultant-push',
			'A loaded dynamics trolley being pushed from a carpet strip onto a smooth hard-floor strip.'
		),
		earnedIllustration: earnedIllustrations['physics-resultant-acceleration'],
		teaserPosition: '50% 52%'
	},
	'physics-radiation-risk': {
		segments: ['Control exposure', 'Lower absorbed dose', 'Lower cell damage risk'],
		decisiveIndex: 1,
		decisiveLabel: 'The screen matters because it lowers dose.',
		cardArt: cardArt(
			'physics-radiation-screen',
			'An empty clinical X-ray room with a machine and a protective control screen.'
		)
	},
	'physics-drag-balance': {
		segments: ['Increase area', 'Drag increases', 'Forces balance sooner', 'Lower constant speed'],
		decisiveIndex: 2,
		decisiveLabel: 'Terminal velocity begins when forces balance.',
		cardArt: cardArt(
			'terminal-velocity',
			'An unmanned parachute payload descending through a calm open sky.',
			'v2'
		)
	},
	'physics-thinking-distance': {
		segments: ['Use speed', 'Use reaction time', 'Multiply for thinking distance'],
		decisiveIndex: 1,
		decisiveLabel: 'Use the extra reaction time, not the total stopping time.',
		cardArt: cardArt(
			'physics-thinking-distance',
			'An empty car on a straight test track with unlabelled reaction-timing markers.'
		)
	},
	'physics-zero-resultant': {
		segments: [
			'Forces balance',
			'Resultant is zero',
			'Acceleration is zero',
			'Velocity stays unchanged'
		],
		decisiveIndex: 3,
		decisiveLabel: 'Zero resultant means unchanged velocity, not necessarily no motion.',
		cardArt: cardArt(
			'zero-resultant',
			'A plain parcel resting motionless on a sturdy laboratory bench.',
			'v2'
		),
		transferArt: cardArt(
			'physics-zero-resultant-transfer',
			'An air-track glider continuing after its hanging mass has landed, leaving the connecting string slack.'
		)
	}
};

export function challengeVisual(challenge: Pick<ChallengeDefinition, 'id'>) {
	return challengeVisuals[challenge.id];
}

export function challengeHasEarnedIllustration(challenge: Pick<ChallengeDefinition, 'id'>) {
	return Boolean(challengeVisual(challenge)?.earnedIllustration);
}

export function challengeHasCardArt(challenge: Pick<ChallengeDefinition, 'id'>) {
	return Boolean(challengeVisual(challenge)?.cardArt);
}

export function allChallengeVisualIds() {
	return Object.keys(challengeVisuals);
}
