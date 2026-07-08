import { getSeoTopicPage } from '$lib/server/seoIndexData';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const topic = await getSeoTopicPage(params.board, params.subjectSlug, params.topicSlug);
	if (!topic) {
		throw error(404, 'Topic question page not found.');
	}

	return { topic, user: locals.user };
};
