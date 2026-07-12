export type GalleryScreen = {
	slug: string;
	title: string;
	description: string;
	alt: string;
	full: string;
	thumb: string;
};

export type GalleryConcept = {
	slug: string;
	title: string;
	shortTitle: string;
	summary: string;
	strongest: string;
	risk: string;
	recommendation: string;
	accent: string;
	screens: GalleryScreen[];
};

const assetBase = '/api/experiments/gallery';

function image(slug: string): Pick<GalleryScreen, 'full' | 'thumb'> {
	return {
		full: `${assetBase}/full/${slug}.webp`,
		thumb: `${assetBase}/thumb/${slug}.webp`
	};
}

export const galleryConcepts: GalleryConcept[] = [
	{
		slug: 'living-paper',
		title: 'Living Paper Observatory',
		shortTitle: 'Living Paper',
		summary:
			'Tactile exam paper over a deep scientific canvas, with spatial trails and evidence that remain directly usable.',
		strongest: 'The strongest complete product identity, home trail, and progress experience.',
		risk: 'Atmosphere can become decorative or expensive if motion is not restrained.',
		recommendation: 'Recommended visual and spatial base.',
		accent: '#d9e96b',
		screens: [
			{
				slug: 'home',
				title: 'Returning home',
				description: 'A finite four-question trail with one authentic question as the focal point.',
				alt: 'Living Paper Observatory returning-home screen with a finite question trail',
				...image('living-paper-home')
			},
			{
				slug: 'attempt',
				title: 'Authentic question attempt',
				description:
					'The paper becomes the working surface, with saved answer state and explicit checking.',
				alt: 'Living Paper Observatory authentic question attempt screen',
				...image('living-paper-attempt')
			},
			{
				slug: 'checked',
				title: 'Checked answer and improvement',
				description:
					'One missing move is isolated; improvement is primary and transfer stays locked.',
				alt: 'Living Paper Observatory checked answer with improvement and locked transfer',
				...image('living-paper-checked')
			},
			{
				slug: 'progress',
				title: 'Progress and covered scope',
				description:
					'Evidence becomes a spatial curriculum map, with later-at-school topics kept separate.',
				alt: 'Living Paper Observatory Biology progress and covered-scope screen',
				...image('living-paper-progress')
			},
			{
				slug: 'recall',
				title: 'Recall launch',
				description: 'Seven due cards, one format choice, and one direct start action.',
				alt: 'Living Paper Observatory streamlined Biology recall launch',
				...image('living-paper-recall')
			}
		]
	},
	{
		slug: 'electric-paper',
		title: 'Electric Paper',
		shortTitle: 'Electric Paper',
		summary:
			'The boldest direction: cream exam sheets, acid-lime actions, and a highly visible state sequence.',
		strongest: 'The clearest check, improve, recheck, and transfer sequence.',
		risk: 'Condensed type and large state phrases can drift back toward poster design.',
		recommendation: 'Borrow its result-state and recall mechanics.',
		accent: '#cbf42c',
		screens: [
			{
				slug: 'home',
				title: 'Returning home',
				description: 'A stable app shell, finite trail rail, and one active paper in a stack.',
				alt: 'Electric Paper returning-home screen with four-question trail',
				...image('electric-paper-home')
			},
			{
				slug: 'attempt',
				title: 'Authentic question attempt',
				description: 'Exact source table and question beside a large, focused answer canvas.',
				alt: 'Electric Paper authentic beta-blocker question attempt',
				...image('electric-paper-attempt')
			},
			{
				slug: 'improve',
				title: 'Improve and recheck',
				description:
					'Three of four reasoning links are held; transfer remains visibly unavailable.',
				alt: 'Electric Paper improve-and-recheck screen with transfer locked',
				...image('electric-paper-improve')
			},
			{
				slug: 'recheck-passed',
				title: 'Recheck passes and transfer opens',
				description:
					'The missing link holds on recheck and a sourced transfer question becomes available.',
				alt: 'Electric Paper successful recheck with transfer question unlocked',
				...image('electric-paper-recheck-passed')
			},
			{
				slug: 'progress',
				title: 'Progress and protected paper',
				description: 'A bold curriculum atlas with a qualified range and unopened mock state.',
				alt: 'Electric Paper Biology progress and protected-paper screen',
				...image('electric-paper-progress')
			},
			{
				slug: 'recall',
				title: 'Recall launch',
				description: 'A decisive seven-card session without the old configuration wall.',
				alt: 'Electric Paper streamlined Biology recall launch',
				...image('electric-paper-recall')
			}
		]
	},
	{
		slug: 'afterglow-atlas',
		title: 'Afterglow Atlas',
		shortTitle: 'Afterglow',
		summary:
			'A polished split workspace with restrained coaching and the clearest authentic-paper shelf.',
		strongest: 'The clearest conventional answer workspace and paper-protection experience.',
		risk: 'It can settle into familiar dark premium-SaaS patterns if the material system is weakened.',
		recommendation: 'Borrow its dense-attempt and paper-shelf patterns.',
		accent: '#3867ff',
		screens: [
			{
				slug: 'home',
				title: 'Returning home',
				description:
					'A spatial four-question trail with recall and later-at-school context nearby.',
				alt: 'Afterglow Atlas returning-home screen with four-question trail',
				...image('afterglow-home')
			},
			{
				slug: 'attempt',
				title: 'Authentic question attempt',
				description:
					'A buildable split workspace keeps the official question and answer visible together.',
				alt: 'Afterglow Atlas split authentic-question attempt screen',
				...image('afterglow-attempt')
			},
			{
				slug: 'checked',
				title: 'Checked answer and improvement',
				description:
					'Feedback quotes the answer, asks for missing links, and locks transfer until recheck.',
				alt: 'Afterglow Atlas checked answer with active improvement and locked transfer',
				...image('afterglow-checked')
			},
			{
				slug: 'papers',
				title: 'Protected authentic papers',
				description:
					'An untouched June 2024 mock is materially distinct from exposed practice papers.',
				alt: 'Afterglow Atlas protected authentic-paper shelf',
				...image('afterglow-papers')
			},
			{
				slug: 'recall',
				title: 'Recall launch',
				description:
					'A restrained launch with one preview, one format row, and one primary action.',
				alt: 'Afterglow Atlas streamlined Biology recall launch',
				...image('afterglow-recall')
			}
		]
	}
];

export const galleryScreenCount = galleryConcepts.reduce(
	(total, concept) => total + concept.screens.length,
	0
);

export function galleryUrl(concept: GalleryConcept, screen = concept.screens[0]): string {
	return `/experiments/gallery?concept=${concept.slug}&screen=${screen.slug}`;
}
