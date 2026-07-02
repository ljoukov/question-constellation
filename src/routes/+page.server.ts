import { getExplorableLearningChains } from '$lib/server/learningChainData';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const chains = await getExplorableLearningChains();
	const subjects = new Set(chains.map((chain) => chain.subject).filter(Boolean));
	const questionCount = chains.reduce((total, chain) => total + chain.questions.length, 0);

	return {
		featuredChains: chains.slice(0, 3),
		stats: {
			chainCount: chains.length,
			questionCount,
			subjectCount: subjects.size
		}
	};
};
