import { redirect } from '@sveltejs/kit';
import { getExplorableLearningChains } from '$lib/server/learningChainData';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const subject = url.searchParams.get('subject') ?? '';
	if (subject.toLowerCase().includes('english')) {
		const course =
			subject.toLowerCase().includes('literature')
				? 'English Literature'
				: subject.toLowerCase().includes('language')
					? 'English Language'
					: '';
		throw redirect(307, course ? `/english?course=${encodeURIComponent(course)}` : '/english');
	}

	return {
		chains: await getExplorableLearningChains(),
		initialSearch: url.searchParams.get('q') ?? '',
		initialSubject: url.searchParams.get('subject') ?? 'All subjects',
		initialMarks: url.searchParams.get('marks') ?? 'all'
	};
};
