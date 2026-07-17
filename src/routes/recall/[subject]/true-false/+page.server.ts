import { learnerSubjectHref } from '$lib/learning/subjects';
import { recallSessionHref, recallSubjectFromSlug, recallTopicsForCards } from '$lib/recall/routes';
import {
	defaultRecallCatalogScope,
	getRecallCards,
	recallBoardForSubject
} from '$lib/server/recallCatalog';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const subject = recallSubjectFromSlug(params.subject);
	if (!subject) throw error(404, 'Recall deck not found.');
	if (locals.user) {
		throw redirect(
			307,
			recallSessionHref({
				subject,
				activity: 'true-false',
				returnTo: learnerSubjectHref(subject)
			})
		);
	}
	const cards = await getRecallCards(defaultRecallCatalogScope(subject));
	return {
		subject,
		board: recallBoardForSubject(subject),
		activity: 'true-false' as const,
		cards,
		topics: recallTopicsForCards(cards),
		user: locals.user
	};
};
