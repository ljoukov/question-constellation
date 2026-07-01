import {
	recallCards,
	recallCurriculumTopics,
	recallKindLabels,
	recallSubjects
} from '$lib/recall/aqaScienceRecall';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
	cards: recallCards,
	kindLabels: recallKindLabels,
	subjects: recallSubjects,
	topics: recallCurriculumTopics,
	initialSubject: url.searchParams.get('subject') ?? 'All subjects',
	initialTopic: url.searchParams.get('topic') ?? 'all',
	initialKind: url.searchParams.get('kind') ?? 'all',
	initialSearch: url.searchParams.get('q') ?? '',
	initialStart: url.searchParams.get('start') === '1'
});
