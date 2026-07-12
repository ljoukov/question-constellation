import {
	getDefaultLearnerProfileSettings,
	getImportedQuestionBoardAvailability,
	getLearnerProfileSettings,
	updateEnglishLiteratureSelections,
	updateLearnerSubjects,
	type QuestionBoardAvailability
} from '$lib/server/personalLearning';
import {
	ANONYMOUS_PROFILE_COOKIE_NAME,
	anonymousProfileSettings,
	parseAnonymousLearnerProfileCookie
} from '$lib/anonymousLearnerProfile';
import { parseOcrEnglishLiteratureSelections } from '$lib/englishLiteratureProfile';
import { getCurriculumNotices } from '$lib/server/curriculumNotices';
import {
	gcsePastPaperSubjectIndex,
	type PastPaperSubjectIndex
} from '$lib/pastPapers/gcsePastPaperIndex';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
	const [baseSettings, boardAvailability, curriculumNotices] = await Promise.all([
		locals.user ? getLearnerProfileSettings(locals.user) : getDefaultLearnerProfileSettings(),
		getImportedQuestionBoardAvailability(),
		getCurriculumNotices({
			board: 'OCR',
			qualification: 'GCSE',
			subject: 'English Literature',
			specificationCode: 'J352'
		})
	]);
	const settings = locals.user
		? baseSettings
		: anonymousProfileSettings(
				baseSettings,
				parseAnonymousLearnerProfileCookie(cookies.get(ANONYMOUS_PROFILE_COOKIE_NAME))
			);

	return {
		user: locals.user,
		settings,
		examProfile: buildExamProfileOptions(boardAvailability),
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

const scienceProfileSubjects = new Set(['Biology', 'Chemistry', 'Physics']);
const paperBoardIdsByName = new Map(
	gcsePastPaperSubjectIndex.map((page) => [page.boardName.toLowerCase(), page.boardId] as const)
);

function buildExamProfileOptions(boardAvailability: QuestionBoardAvailability) {
	return {
		subjects: [
			'Biology',
			'Chemistry',
			'Physics',
			'Computer Science',
			'Geography',
			'History',
			'English Language',
			'English Literature'
		].map((subject) => {
			const boardNames = requiredBoardNames(boardAvailability, subject);
			const boardNamesSet = new Set(boardNames.map((board) => board.toLowerCase()));
			const paperPages = gcsePastPaperSubjectIndex
				.filter(
					(page) =>
						profileSubjectMatchesPaperPage(subject, page) &&
						boardNamesSet.has(page.boardName.toLowerCase())
				)
				.map((page) => ({
					boardId: page.boardId,
					boardName: page.boardName,
					subject: page.subject,
					subjectSlug: page.subjectSlug,
					course: scienceCourseForPage(page),
					tier: page.tier,
					href: page.localPath,
					label: paperPageLabel(page),
					entryCount: page.entryCount,
					documentCount: page.documentCount,
					latestYear: page.latestYear
				}));

			return {
				subject,
				tierApplies: scienceProfileSubjects.has(subject),
				boardOptions: subjectBoardOptions(boardNames),
				paperPages
			};
		})
	};
}

function requiredBoardNames(availability: QuestionBoardAvailability, subject: string) {
	const boardNames = availability.get(subject);
	if (!boardNames?.length) throw new Error(`No imported board availability for ${subject}.`);
	return boardNames;
}

function subjectBoardOptions(boardNames: string[]) {
	return boardNames.map((name) => ({
		id: paperBoardIdsByName.get(name.toLowerCase()) ?? name.toLowerCase().replace(/\s+/g, '-'),
		name
	}));
}

function profileSubjectMatchesPaperPage(subject: string, page: PastPaperSubjectIndex) {
	const pageSubject = page.subject.toLowerCase();
	const pageSlug = page.subjectSlug.toLowerCase();
	const normalizedSubject = subject.toLowerCase();

	if (scienceProfileSubjects.has(subject)) {
		if (/^science-double-award-(foundation|higher)$/.test(pageSlug)) return true;
		return (
			new RegExp(`\\b${normalizedSubject}\\b`).test(pageSubject) &&
			(new RegExp(`^${normalizedSubject}(-a)?-(foundation|higher)$`).test(pageSlug) ||
				new RegExp(`^combined-${normalizedSubject}(-a)?-(foundation|higher)$`).test(pageSlug))
		);
	}

	if (subject === 'English Language' || subject === 'English Literature') {
		return pageSubject === subject.toLowerCase();
	}

	return pageSubject === normalizedSubject;
}

function scienceCourseForPage(page: PastPaperSubjectIndex) {
	if (!page.tier) return 'GCSE Subject';
	return page.subject.toLowerCase().includes('combined') ||
		page.subjectSlug.includes('double-award')
		? 'Combined Science'
		: 'Separate Science';
}

function paperPageLabel(page: PastPaperSubjectIndex) {
	return [page.boardName, 'GCSE', page.subject, page.tier].filter(Boolean).join(' ');
}
