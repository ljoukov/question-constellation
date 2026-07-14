import { buildOcrEnglishLiteratureHub } from '$lib/englishLiteratureHub';
import { getQuestionBankBrowseData } from '$lib/server/learningChainData';
import {
	getDefaultLearnerProfileSettings,
	getLearnerProfileSettings
} from '$lib/server/personalLearning';
import {
	ANONYMOUS_PROFILE_COOKIE_NAME,
	anonymousProfileSettings,
	parseAnonymousLearnerProfileCookie
} from '$lib/anonymousLearnerProfile';
import { profileAnchorHref, profileSubjectAnchor } from '$lib/profileNavigation';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const [baseSettings, browseData] = await Promise.all([
		locals.user ? getLearnerProfileSettings(locals.user) : getDefaultLearnerProfileSettings(),
		getQuestionBankBrowseData()
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

	return {
		user: locals.user,
		hub: buildOcrEnglishLiteratureHub(settings.englishLiteratureSelections, browseData.questions)
	};
};
