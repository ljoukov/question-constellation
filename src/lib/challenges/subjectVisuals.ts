import { base } from '$app/paths';
import type { ChallengeCardArt } from './visuals';
import type {
	BiologySubjectArtTheme,
	ChallengeDefinition,
	ChallengeSubjectArtTheme,
	ChemistrySubjectArtTheme,
	PhysicsSubjectArtTheme
} from './types';

export const subjectArtThemes = {
	biology: ['cells-practical', 'biochemistry', 'inheritance-reproduction', 'regulation-immunity'],
	chemistry: ['particles-bonding', 'reactions-energy', 'practical-analysis', 'materials-industry'],
	physics: ['forces-motion', 'electricity-magnetism', 'thermal-particles', 'radiation-measurement']
} as const satisfies {
	biology: readonly BiologySubjectArtTheme[];
	chemistry: readonly ChemistrySubjectArtTheme[];
	physics: readonly PhysicsSubjectArtTheme[];
};

const subjectArtRoot = `${base}/product/challenges/subjects`;
const subjectArtRevision = '20260719-1';

const subjectArtAlt: Record<ChallengeSubjectArtTheme, string> = {
	'cells-practical':
		'Microscope, contrasting cell models and measurement apparatus arranged for a Biology investigation.',
	biochemistry:
		'Enzyme models, test tubes and a water bath arranged for a Biology biochemistry practical.',
	'inheritance-reproduction':
		'DNA, allele models, a genetic grid and embryology apparatus arranged as an inheritance and reproduction study scene.',
	'regulation-immunity':
		'Body-regulation, antibody and vaccination models arranged as a homeostasis and immunity study scene.',
	'particles-bonding':
		'Atomic, ionic and alloy lattice models arranged as a Chemistry particles and bonding study scene.',
	'reactions-energy':
		'Collision models, reaction vessels and an insulated-cup thermometer arranged as a Chemistry reactions and energy study scene.',
	'practical-analysis':
		'Flame-test, electrolysis and constant-mass apparatus arranged on a Chemistry practical bench.',
	'materials-industry':
		'Raw materials, reactor vessels, manufactured products, recycling and disposal arranged as an industrial Chemistry life-cycle scene.',
	'forces-motion':
		'Trolleys, track, pulley, distance markers and a parachute model arranged as a Physics forces and motion investigation.',
	'electricity-magnetism':
		'A parallel circuit and a current-carrying wire between magnet poles arranged as an electricity and magnetism investigation.',
	'thermal-particles':
		'A gas syringe particle model and contrasting conductors arranged as a thermal Physics investigation.',
	'radiation-measurement':
		'Shielded radiation apparatus, rulers and timing equipment arranged as a Physics measurement investigation.'
};

export function subjectArtThemeForChallenge(
	challenge: Pick<ChallengeDefinition, 'subjectArtTheme'>
): ChallengeSubjectArtTheme {
	return challenge.subjectArtTheme;
}

export function subjectArtForChallenge(
	challenge: Pick<ChallengeDefinition, 'subject' | 'subjectArtTheme'>
): ChallengeCardArt {
	const theme = subjectArtThemeForChallenge(challenge);
	const id = `${challenge.subject}-${theme}`;
	return {
		src: `${subjectArtRoot}/${id}-light-v1.webp?rev=${subjectArtRevision}`,
		darkSrc: `${subjectArtRoot}/${id}-dark-v1.webp?rev=${subjectArtRevision}`,
		alt: subjectArtAlt[theme],
		width: 1672,
		height: 941
	};
}
