import { getSubjects } from '$lib/server/questionData';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		subjects: getSubjects()
	};
};
