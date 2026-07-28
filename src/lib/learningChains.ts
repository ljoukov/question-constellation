import type { ChainIllustration } from '$lib/chains/chainIllustration';

/**
 * Internal D1 projection used to select and render public questions.
 * Chain terminology remains here only because the stored catalogue still uses it.
 */
export type ChainQuestionLabel =
	| 'Start here'
	| 'Similar'
	| 'Small change'
	| 'New context'
	| 'Challenge';

export type ChainQuestionTeaser = {
	id?: string;
	ref: string;
	sourceRef?: string;
	paperSlug?: string;
	paperLabel?: string;
	title: string;
	teaser: string;
	hint?: string | null;
	label: ChainQuestionLabel;
	marks: number | null;
	command: string;
};

export type LearningChain = {
	id: string;
	title: string;
	subject: string;
	topic: string;
	symbol: string;
	paperSlug: string;
	paperLabel: string;
	summary: string;
	steps: string[];
	weakLink: string;
	primaryRef: string;
	accent: 'green' | 'blue' | 'amber';
	illustration: ChainIllustration | null;
	questions: ChainQuestionTeaser[];
};
