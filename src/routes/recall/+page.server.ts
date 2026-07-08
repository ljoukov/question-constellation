import {
	recallCards,
	recallCurriculumTopics,
	recallKindLabels,
	recallSubjects
} from '$lib/recall/aqaScienceRecall';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const initialActivity = url.searchParams.get('activity') === 'mcq' ? 'mcq' : 'flashcards';
	return {
		cards: recallCards,
		kindLabels: recallKindLabels,
		subjects: recallSubjects,
		topics: recallCurriculumTopics,
		initialSubject: url.searchParams.get('subject') ?? 'All subjects',
		initialTopic: url.searchParams.get('topic') ?? 'all',
		initialKind: url.searchParams.get('kind') ?? 'all',
		initialMode:
			url.searchParams.get('mode') ?? (initialActivity === 'mcq' ? 'recognise' : 'recall'),
		initialActivity,
		initialSearch: url.searchParams.get('q') ?? '',
		initialSize: url.searchParams.get('size') ?? '10',
		initialStart: url.searchParams.get('start') === '1',
		initialReturnTo: url.searchParams.get('returnTo') ?? '/',
		user: locals.user
	};
};
