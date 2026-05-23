import { getPracticeData } from '$lib/server/questionData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		return getPracticeData(params.familyId);
	} catch {
		throw error(404, 'Question family not found.');
	}
};
