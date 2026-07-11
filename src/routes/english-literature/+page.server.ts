import { buildOcrEnglishLiteratureHub } from '$lib/englishLiteratureHub';
import { getQuestionBankBrowseData } from '$lib/server/learningChainData';
import { getLearnerProfileSettings } from '$lib/server/personalLearning';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/auth/start');

	const [settings, browseData] = await Promise.all([
		getLearnerProfileSettings(locals.user),
		getQuestionBankBrowseData()
	]);
	const literatureSubject = settings.subjects.find(
		(subject) => subject.subject === 'English Literature'
	);

	if (!literatureSubject?.enabled || literatureSubject.board !== 'OCR') {
		throw redirect(303, '/profile');
	}

	return {
		user: locals.user,
		hub: buildOcrEnglishLiteratureHub(settings.englishLiteratureSelections, browseData.questions)
	};
};
