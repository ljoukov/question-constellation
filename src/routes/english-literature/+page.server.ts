import { buildOcrEnglishLiteratureHub } from '$lib/englishLiteratureHub';
import { getQuestionBankQuestionsForSubject } from '$lib/server/learningChainData';
import {
	getDefaultLearnerProfileSettings,
	getLearnerProfileSettings
} from '$lib/server/personalLearning';
import {
	ANONYMOUS_PROFILE_COOKIE_NAME,
	anonymousProfileSettings,
	parseAnonymousLearnerProfileCookie
} from '$lib/anonymousLearnerProfile';
import {
	ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR,
	profileAnchorHref,
	profileSubjectAnchor
} from '$lib/profileNavigation';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const [baseSettings, questions] = await Promise.all([
		locals.user ? getLearnerProfileSettings(locals.user) : getDefaultLearnerProfileSettings(),
		getQuestionBankQuestionsForSubject('OCR', 'English Literature')
	]);
	const localProfile = parseAnonymousLearnerProfileCookie(
		cookies.get(ANONYMOUS_PROFILE_COOKIE_NAME)
	);
	const settings = anonymousProfileSettings(
		baseSettings,
		!locals.user || localProfile?.pendingSync ? localProfile : null
	);
	const literatureSubject = settings.subjects.find(
		(subject) => subject.subject === 'English Literature'
	);

	if (!literatureSubject?.enabled || literatureSubject.board !== 'OCR') {
		throw redirect(303, profileAnchorHref('/profile', profileSubjectAnchor('English Literature')));
	}
	if (
		[
			settings.englishLiteratureSelections.modernText,
			settings.englishLiteratureSelections.nineteenthCenturyNovel,
			settings.englishLiteratureSelections.poetryCluster,
			settings.englishLiteratureSelections.shakespearePlay
		].some((selection) => !selection)
	) {
		throw redirect(303, profileAnchorHref('/profile', ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR));
	}

	return {
		user: locals.user,
		hub: buildOcrEnglishLiteratureHub(settings.englishLiteratureSelections, questions)
	};
};
