import { base } from '$app/paths';
import type { ChainIllustration } from '$lib/chains/chainIllustration';
import type { ChallengeDefinition } from './types';

export type ChallengeVisualDefinition = {
	segments: string[];
	decisiveIndex: number;
	decisiveLabel: string;
	earnedIllustration?: ChainIllustration;
	mobilePanels?: Array<{ label: string; position: string }>;
	teaserPosition?: string;
};

const atlasRoot = `${base}/product/challenges/atlas`;

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
		'Four-stage scientific atlas showing excessive heat changing an enzyme, altering its active site, preventing substrate binding and reducing reaction rate.',
		'Too hot → enzyme denatures → active site changes → substrate no longer fits → reaction rate falls.'
	),
	'biology-vaccine-immunity': atlasIllustration(
		'vaccine-immunity',
		'Four-step scientific atlas showing a harmless vaccine antigen, specific antibodies, memory cells and a faster response on later exposure.',
		'Harmless antigen → specific antibodies → memory cells → faster response.'
	),
	'physics-conductivity-rate': atlasIllustration(
		'thermal-conductivity',
		'Four-stage scientific atlas comparing heat transfer through metal and plastic and applying the contrast to a pan and handle.',
		'Thermal conductivity controls energy-transfer rate; the context determines which direction helps.'
	),
	'physics-momentum-sharing': atlasIllustration(
		'momentum-sharing',
		'A continuous collision atlas showing momentum transferred between two trolleys while total momentum is conserved.',
		'Total momentum is conserved as one object gains momentum and the other loses it.'
	),
	'physics-parallel-currents': atlasIllustration(
		'parallel-current',
		'Four-stage circuit atlas showing equal potential difference across parallel branches and branch currents adding in the main wire.',
		'Parallel branches share potential difference; currents add at a junction.'
	),
	'physics-resultant-acceleration': atlasIllustration(
		'resultant-acceleration',
		'Four-stage mechanics atlas showing forces combined into a resultant and the resulting acceleration for fixed mass.',
		'Combine forces first; use the resultant to predict acceleration and motion.'
	)
} satisfies Record<string, ChainIllustration>;

const challengeVisuals: Record<string, ChallengeVisualDefinition> = {
	'biology-data-conclusions': {
		segments: ['Read the pattern', 'Compare the values', 'Make only the supported claim'],
		decisiveIndex: 2,
		decisiveLabel: 'A link is not proof of a cause.'
	},
	'biology-cell-differences': {
		segments: ['Choose a feature', 'State the direction', 'Give the requested number'],
		decisiveIndex: 2,
		decisiveLabel: 'One difference cannot earn three marking points.'
	},
	'biology-extra-controls': {
		segments: ['Relevant variable', 'Specific control', 'Not already controlled'],
		decisiveIndex: 1,
		decisiveLabel: 'A control has to be usable, not just sensible-sounding.'
	},
	'biology-enzyme-denature': {
		segments: ['Too hot', 'Enzyme denatures', 'Active site changes', 'Substrate no longer fits'],
		decisiveIndex: 2,
		decisiveLabel: 'Heat changes the active-site shape.',
		earnedIllustration: earnedIllustrations['biology-enzyme-denature'],
		teaserPosition: '48% 44%'
	},
	'biology-reagent-colour': {
		segments: ['Add Biuret solution', 'Observe the result', 'Name mauve or purple'],
		decisiveIndex: 2,
		decisiveLabel: 'The positive colour is the evidence.'
	},
	'biology-heated-food-test': {
		segments: ["Add Benedict's", 'Heat the mixture', 'Look for a change from blue'],
		decisiveIndex: 1,
		decisiveLabel: 'The reagent does not complete the test without heat.'
	},
	'biology-ivf-sequence': {
		segments: [
			'Collect mature eggs',
			'Fertilise in the laboratory',
			'Let embryos divide',
			'Transfer to the uterus'
		],
		decisiveIndex: 1,
		decisiveLabel: 'In vitro means fertilisation happens outside the body.'
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
		earnedIllustration: earnedIllustrations['biology-vaccine-immunity'],
		mobilePanels: [
			{ label: 'Harmless antigen', position: '5% 20%' },
			{ label: 'Specific antibodies', position: '92% 20%' },
			{ label: 'Memory cells remain', position: '92% 88%' },
			{ label: 'Faster later response', position: '5% 88%' }
		],
		teaserPosition: '50% 49%'
	},
	'physics-gas-pressure': {
		segments: [
			'Condition changes',
			'Particle motion or spacing changes',
			'Wall collisions change',
			'Pressure changes'
		],
		decisiveIndex: 2,
		decisiveLabel: 'Pressure comes from collisions with the walls.'
	},
	'physics-half-range': {
		segments: ['Highest minus lowest', 'Find the range', 'Divide by two'],
		decisiveIndex: 2,
		decisiveLabel: 'Range is not yet half-range uncertainty.'
	},
	'physics-weight-equation': {
		segments: [
			'Use mass',
			'Multiply by gravitational field strength',
			'Keep acceleration separate'
		],
		decisiveIndex: 1,
		decisiveLabel: 'Weight follows mass × gravitational field strength.'
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
		earnedIllustration: earnedIllustrations['physics-momentum-sharing'],
		teaserPosition: '50% 50%'
	},
	'physics-conductivity-rate': {
		segments: ['Compare conductivity', 'Infer transfer rate', 'Use the direction in context'],
		decisiveIndex: 2,
		decisiveLabel: 'Fast transfer helps one part and hurts the other.',
		earnedIllustration: earnedIllustrations['physics-conductivity-rate'],
		teaserPosition: '52% 53%'
	},
	'physics-motor-force': {
		segments: ['Current in a magnetic field', 'Fields interact', 'A force acts', 'The wire moves'],
		decisiveIndex: 1,
		decisiveLabel: 'The force comes from interacting magnetic fields.'
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
		earnedIllustration: earnedIllustrations['physics-resultant-acceleration'],
		teaserPosition: '50% 52%'
	},
	'physics-radiation-risk': {
		segments: ['Control exposure', 'Lower absorbed dose', 'Lower cell damage risk'],
		decisiveIndex: 1,
		decisiveLabel: 'The screen matters because it lowers dose.'
	},
	'physics-drag-balance': {
		segments: ['Increase area', 'Drag increases', 'Forces balance sooner', 'Lower constant speed'],
		decisiveIndex: 2,
		decisiveLabel: 'Terminal velocity begins when forces balance.'
	},
	'physics-thinking-distance': {
		segments: ['Use speed', 'Use reaction time', 'Multiply for thinking distance'],
		decisiveIndex: 1,
		decisiveLabel: 'Use the extra reaction time, not the total stopping time.'
	},
	'physics-zero-resultant': {
		segments: [
			'Forces balance',
			'Resultant is zero',
			'Acceleration is zero',
			'Velocity stays unchanged'
		],
		decisiveIndex: 3,
		decisiveLabel: 'Zero resultant means unchanged velocity, not necessarily no motion.'
	}
};

export function challengeVisual(challenge: Pick<ChallengeDefinition, 'id'>) {
	return challengeVisuals[challenge.id];
}

export function challengeHasEarnedIllustration(challenge: Pick<ChallengeDefinition, 'id'>) {
	return Boolean(challengeVisual(challenge)?.earnedIllustration);
}

export function allChallengeVisualIds() {
	return Object.keys(challengeVisuals);
}
