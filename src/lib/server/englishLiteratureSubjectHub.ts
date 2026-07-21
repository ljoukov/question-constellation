import { buildOcrEnglishLiteratureHub } from '$lib/englishLiteratureHub';
import type { AdminUser } from '$lib/server/auth/session';
import { getQuestionBankQuestionsForSubject } from '$lib/server/learningChainData';
import { getLearnerProfileSettings } from '$lib/server/personalLearning';

export async function getEnglishLiteratureSubjectHub(user: AdminUser) {
	const [settings, questions] = await Promise.all([
		getLearnerProfileSettings(user),
		getQuestionBankQuestionsForSubject('OCR', 'English Literature')
	]);

	return buildOcrEnglishLiteratureHub(settings.englishLiteratureSelections, questions);
}
