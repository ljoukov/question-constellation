import { learnerSubjectFromSlug, learnerSubjectHref } from '$lib/learning/subjects';
import { curriculumOfferingTopics } from '$lib/curriculum/catalog';
import { ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR, profileAnchorHref } from '$lib/profileNavigation';
import { getCurriculumOffering } from '$lib/server/curriculumCatalog';
import {
	CurriculumScopeValidationError,
	getSignedInSubjectView,
	saveSubjectCurriculumScope
} from '$lib/server/subjectLearning';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) {
		throw redirect(303, `/auth/start?next=${encodeURIComponent(url.pathname)}`);
	}
	const subjectName = learnerSubjectFromSlug(params.subject);
	if (!subjectName) {
		throw error(404, 'Curriculum scope is not available for this subject.');
	}
	const subject = await getSignedInSubjectView(locals.user, subjectName);
	if (!subject) throw error(404, 'This subject is not enabled in your profile.');
	if (subject.subject === 'English Literature' && subject.board === 'OCR') {
		throw redirect(303, profileAnchorHref('/profile', ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR));
	}
	const offering = await getCurriculumOffering({
		board: subject.board,
		qualification: subject.qualification,
		profileSubject: subject.subject,
		course: subject.course,
		tier: subject.tier
	});
	if (!offering) {
		throw error(404, 'No imported official specification matches this board and course.');
	}
	const curriculum = {
		board: offering.board,
		qualification: offering.qualification,
		specificationCode: offering.specification.code,
		specificationVersion: offering.specification.version,
		specificationUrl: offering.specification.officialSourceUrl,
		label: offering.label,
		groups: offering.selectionTree.groups,
		topics: curriculumOfferingTopics(offering)
	};
	return {
		subject,
		curriculum,
		user: locals.user
	};
};

export const actions: Actions = {
	default: async ({ locals, params, request }) => {
		if (!locals.user) return fail(401, { message: 'Sign in to save your curriculum scope.' });
		const subjectName = learnerSubjectFromSlug(params.subject);
		if (!subjectName) {
			return fail(404, { message: 'Curriculum scope is not available for this subject.' });
		}
		const form = await request.formData();
		const mode = form.get('scopeMode') === 'all' ? 'all' : 'selected';
		const selectedTopicIds = form.getAll('topicId').map(String);
		try {
			await saveSubjectCurriculumScope(locals.user, subjectName, {
				mode,
				selectedTopicIds
			});
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : '';
			const knownValidationMessage =
				cause instanceof CurriculumScopeValidationError ||
				message === 'No imported official specification matches this board and course.'
					? message
					: 'Unable to save this curriculum scope. Please try again.';
			return fail(400, {
				message: knownValidationMessage,
				mode,
				selectedTopicIds
			});
		}
		throw redirect(303, learnerSubjectHref(subjectName));
	}
};
