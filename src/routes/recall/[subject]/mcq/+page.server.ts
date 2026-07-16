import { recallSubjectFromSlug, recallTopicsForSubject } from '$lib/recall/routes';
import { error } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { learnerSubjectHref } from '$lib/learning/subjects';
import { defaultRecallCatalogScope, getRecallCards } from '$lib/server/recallCatalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const subject = recallSubjectFromSlug(params.subject);
	if (!subject) throw error(404, 'Recall deck not found.');
	if (locals.user) throw redirect(307, learnerSubjectHref(subject));
	return {
		subject,
		activity: 'mcq' as const,
		cards: await getRecallCards(defaultRecallCatalogScope(subject)),
		topics: recallTopicsForSubject(subject),
		user: locals.user
	};
};
