import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const params = new URLSearchParams();
	const course = url.searchParams.get('course');
	const query = url.searchParams.get('q');

	if (query) params.set('q', query);
	if (course) {
		params.set('subject', course);
	} else {
		params.set('subject', 'English Language');
	}

	throw redirect(307, `/chains?${params.toString()}`);
};
