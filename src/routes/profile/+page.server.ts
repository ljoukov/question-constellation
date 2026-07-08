import { getLearnerProfileSettings, updateLearnerSubjects } from '$lib/server/personalLearning';
import {
	gcsePastPaperBoards,
	gcsePastPaperSubjectIndex,
	type PastPaperSubjectIndex
} from '$lib/pastPapers/gcsePastPapers';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/auth/start');
	}

	return {
		user: locals.user,
		settings: await getLearnerProfileSettings(locals.user),
		examProfile: buildExamProfileOptions()
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

		await updateLearnerSubjects({
			userId: locals.user.uid,
			subjects
		});

		return { saved: true };
	}
};

const livePracticeBoardIds = new Set(['aqa']);
const scienceProfileSubjects = new Set(['Biology', 'Chemistry', 'Physics']);

function buildExamProfileOptions() {
	const boardOptions = gcsePastPaperBoards
		.filter((board) => board.id !== 'all')
		.map((board) => ({
			id: board.id,
			name: board.name,
			practiceReady: livePracticeBoardIds.has(board.id),
			paperAtlasHref: `/past-papers/gcse/${board.id}`,
			subjectPageCount: board.subjectPageCount
		}));

	return {
		boardOptions,
		subjects: [
			'Biology',
			'Chemistry',
			'Physics',
			'Computer Science',
			'Geography',
			'History',
			'English',
			'English Language',
			'English Literature'
		].map((subject) => ({
			subject,
			tierApplies: scienceProfileSubjects.has(subject),
			paperPages: gcsePastPaperSubjectIndex
				.filter((page) => profileSubjectMatchesPaperPage(subject, page))
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
				}))
		}))
	};
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

	if (subject === 'English') {
		return pageSubject === 'english language' || pageSubject === 'english literature';
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
