import type { ChallengeSubject } from '../types';

export type BiologyExpansionIdentity = {
	id: string;
	slug: string;
	subject: ChallengeSubject;
};

export const biologyExpansionIdentities = [
	{
		id: 'biology-disinfectant-data-conclusions',
		slug: 'disinfectant-clear-zone-conclusions',
		subject: 'biology'
	},
	{
		id: 'biology-exercise-recovery-conclusions',
		slug: 'pulse-recovery-data-conclusions',
		subject: 'biology'
	},
	{
		id: 'biology-bacterial-cell-features',
		slug: 'bacterial-and-cheek-cell-differences',
		subject: 'biology'
	},
	{
		id: 'biology-prokaryote-eukaryote-comparison',
		slug: 'bacterium-and-yeast-differences',
		subject: 'biology'
	},
	{
		id: 'biology-photosynthesis-control-variables',
		slug: 'pondweed-control-variables',
		subject: 'biology'
	},
	{
		id: 'biology-osmosis-control-variables',
		slug: 'potato-osmosis-control-variables',
		subject: 'biology'
	},
	{
		id: 'biology-catalase-denaturation',
		slug: 'catalase-high-temperature',
		subject: 'biology'
	},
	{
		id: 'biology-amylase-denaturation',
		slug: 'amylase-overheating',
		subject: 'biology'
	},
	{
		id: 'biology-starch-test-result',
		slug: 'iodine-starch-test-result',
		subject: 'biology'
	},
	{
		id: 'biology-lipid-test-result',
		slug: 'ethanol-emulsion-test-result',
		subject: 'biology'
	},
	{
		id: 'biology-banana-benedicts-test',
		slug: 'banana-benedicts-heating',
		subject: 'biology'
	},
	{
		id: 'biology-reducing-sugar-test-sequence',
		slug: 'reducing-sugar-test-correct-order',
		subject: 'biology'
	},
	{
		id: 'biology-ivf-laboratory-fertilisation',
		slug: 'ivf-laboratory-fertilisation',
		subject: 'biology'
	},
	{
		id: 'biology-ivf-embryo-transfer-sequence',
		slug: 'ivf-embryo-transfer-order',
		subject: 'biology'
	},
	{
		id: 'biology-flu-vaccine-memory',
		slug: 'flu-vaccine-memory-cells',
		subject: 'biology'
	},
	{
		id: 'biology-booster-vaccine-response',
		slug: 'booster-vaccine-response',
		subject: 'biology'
	},
	{
		id: 'biology-temperature-homeostasis-loop',
		slug: 'temperature-homeostasis-control-loop',
		subject: 'biology'
	},
	{
		id: 'biology-blood-glucose-control-loop',
		slug: 'blood-glucose-control-loop',
		subject: 'biology'
	},
	{
		id: 'biology-cystic-fibrosis-inheritance',
		slug: 'cystic-fibrosis-carrier-cross',
		subject: 'biology'
	},
	{
		id: 'biology-recessive-flower-inheritance',
		slug: 'recessive-flower-colour-cross',
		subject: 'biology'
	}
] as const satisfies readonly BiologyExpansionIdentity[];
