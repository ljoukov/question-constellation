import {
	getLearnerProfileSettings,
	updateLearnerSubjects
} from '$lib/server/personalLearning';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(303, '/auth/start');
	}

	return {
		user: locals.user,
		settings: await getLearnerProfileSettings(locals.user)
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
