import {
	getDefaultLearnerProfileSettings,
	getLearnerProfileSettings,
	updateEnglishLiteratureSelections,
	updateLearnerSubjects
} from '$lib/server/personalLearning';
import {
	ANONYMOUS_PROFILE_COOKIE_NAME,
	anonymousProfileSettings,
	parseAnonymousLearnerProfileCookie
} from '$lib/anonymousLearnerProfile';
import { parseOcrEnglishLiteratureSelections } from '$lib/englishLiteratureProfile';
import { getCurriculumNotices } from '$lib/server/curriculumNotices';
import { getCurriculumProfileSnapshot } from '$lib/server/curriculumCatalog';
import type { CurriculumProfileSnapshot } from '$lib/curriculum/catalog';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const [baseSettings, curriculumProfile, curriculumNotices] = await Promise.all([
		locals.user ? getLearnerProfileSettings(locals.user) : getDefaultLearnerProfileSettings(),
		getCurriculumProfileSnapshot(),
		getCurriculumNotices({
			board: 'OCR',
			qualification: 'GCSE',
			subject: 'English Literature',
			specificationCode: 'J352'
		})
	]);
	const localProfile = parseAnonymousLearnerProfileCookie(
		cookies.get(ANONYMOUS_PROFILE_COOKIE_NAME)
	);
	const settings = anonymousProfileSettings(
		baseSettings,
		!locals.user || localProfile?.pendingSync ? localProfile : null
	);

	return {
		user: locals.user,
		settings,
		examProfile: curriculumProfile,
		curriculumNotices
	};
};

export const actions: Actions = {
	saveProfile: async ({ locals, request }) => {
		if (!locals.user) {
			return fail(401, { message: 'Sign in to save your profile.' });
		}

		const form = await request.formData();
		const subjectCount = Number(form.get('subjectCount') ?? 0);
		const subjects = Array.from({ length: subjectCount }, (_, index) => ({
			subject: String(form.get(`subject-${index}`) ?? ''),
			board: String(form.get(`board-${index}`) ?? 'AQA'),
			course: String(form.get(`course-${index}`) ?? 'Separate Science'),
			tier: String(form.get(`tier-${index}`) ?? 'Higher'),
			enabled: form.get(`enabled-${index}`) === 'on',
			currentGrade: String(form.get(`currentGrade-${index}`) ?? '').trim() || null,
			targetGrade: String(form.get(`targetGrade-${index}`) ?? '').trim() || null
		}));
		const englishLiteratureSelections = parseOcrEnglishLiteratureSelections({
			modernText: form.get('ocrEnglishLiteratureModernText'),
			nineteenthCenturyNovel: form.get('ocrEnglishLiteratureNineteenthCenturyNovel'),
			poetryCluster: form.get('ocrEnglishLiteraturePoetryCluster'),
			shakespearePlay: form.get('ocrEnglishLiteratureShakespearePlay')
		});

		if (!englishLiteratureSelections) {
			return fail(400, { message: 'Choose valid OCR English Literature texts.' });
		}

		const curriculumProfile = await getCurriculumProfileSnapshot();
		const invalidSubject = subjects.find(
			(subject) => !curriculumCombinationExists(curriculumProfile, subject)
		);
		if (invalidSubject) {
			return fail(400, {
				message: `${invalidSubject.subject} does not match an imported official specification.`
			});
		}

		await Promise.all([
			updateLearnerSubjects({
				userId: locals.user.uid,
				subjects
			}),
			updateEnglishLiteratureSelections({
				userId: locals.user.uid,
				selections: englishLiteratureSelections
			})
		]);

		return { saved: true };
	}
};

function curriculumCombinationExists(
	snapshot: CurriculumProfileSnapshot,
	input: { subject: string; board: string; course: string; tier: string }
) {
	const subject = snapshot.subjects.find((entry) => entry.subject === input.subject);
	const board = subject?.boards.find(
		(entry) => entry.name.toLowerCase() === input.board.toLowerCase()
	);
	const course = board?.courses.find((entry) => entry.name === input.course);
	return Boolean(course?.tiers.some((entry) => entry.name === input.tier));
}
