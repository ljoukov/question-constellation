import {
	recallCardsForSubject,
	recallSubjectFromSlug,
	recallTopicsForSubject
} from '$lib/recall/routes';
import { error } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { learnerSubjectHref } from '$lib/learning/subjects';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params }) => {
	const subject = recallSubjectFromSlug(params.subject);
	if (!subject) throw error(404, 'Recall deck not found.');
	if (locals.user) throw redirect(307, learnerSubjectHref(subject));
	return {
		subject,
		activity: 'flashcards' as const,
		cards: recallCardsForSubject(subject),
		topics: recallTopicsForSubject(subject),
		user: locals.user
	};
};
