import { getNavigationData } from '$lib/server/questionData';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	let navigation;

	try {
		navigation = await getNavigationData();
	} catch {
		throw error(503, 'No chained questions are available yet.');
	}

	throw redirect(307, `/questions/${navigation.primaryQuestionId}`);
};
