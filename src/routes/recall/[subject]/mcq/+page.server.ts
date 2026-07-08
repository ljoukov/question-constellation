import {
	recallCardsForSubject,
	recallSubjectFromSlug,
	recallTopicsForSubject
} from '$lib/recall/routes';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const subject = recallSubjectFromSlug(params.subject);
	if (!subject) throw error(404, 'Recall deck not found.');
	return {
		subject,
		activity: 'mcq' as const,
		cards: recallCardsForSubject(subject),
		topics: recallTopicsForSubject(subject)
	};
};
