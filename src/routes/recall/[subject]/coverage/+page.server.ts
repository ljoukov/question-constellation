import { recallActivityHref, recallSubjectFromSlug } from '$lib/recall/routes';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const subject = recallSubjectFromSlug(params.subject);
	if (!subject) throw error(404, 'Recall deck not found.');
	throw redirect(307, recallActivityHref(subject, 'flashcards'));
};
