import { learnerSubjectFromSlug, learnerSubjectHref } from '$lib/learning/subjects';
import { ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR, profileAnchorHref } from '$lib/profileNavigation';
import {
	CurriculumScopeValidationError,
	getSubjectLearningPublicCatalog,
	saveSubjectCurriculumScope
} from '$lib/server/subjectLearning';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url, parent }) => {
	if (!locals.user) {
		throw redirect(303, `/auth/start?next=${encodeURIComponent(url.pathname)}`);
	}
	const subjectName = learnerSubjectFromSlug(params.subject);
	if (!subjectName) {
		throw error(404, 'Curriculum scope is not available for this subject.');
	}
	const layoutData = await parent();
	const subject =
		layoutData.homeSnapshot?.subjectViews?.find(
			(candidate) => candidate.subject === subjectName
		) ?? null;
	if (!subject && layoutData.homeSnapshotShouldRefresh) {
		throw error(503, 'Your course options are updating. Reload in a moment.');
	}
	if (!subject) throw error(404, 'This subject is not enabled in your profile.');
	if (subject.subject === 'English Literature' && subject.board === 'OCR') {
		throw redirect(303, profileAnchorHref('/profile', ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR));
	}
	let publicCatalog;
	try {
		publicCatalog = await getSubjectLearningPublicCatalog();
	} catch {
		throw error(503, 'Your course options are updating. Reload in a moment.');
	}
	const offering =
		publicCatalog.offerings.find(
			(candidate) =>
				candidate.curriculum.board === subject.board &&
				candidate.curriculum.qualification === subject.qualification &&
				candidate.curriculum.profileSubject === subject.subject &&
				candidate.curriculum.course === subject.course &&
				candidate.curriculum.tier === subject.tier
		) ?? null;
	if (!offering) {
		throw error(404, 'No imported official specification matches this board and course.');
	}
	const topicById = new Map(
		offering.curriculum.topics.map((topic) => [topic.id, topic] as const)
	);
	const curriculum = {
		board: offering.curriculum.board,
		qualification: offering.curriculum.qualification,
		specificationCode: offering.curriculum.specificationCode,
		specificationVersion: offering.curriculum.specificationVersion,
		specificationUrl: offering.curriculum.specificationUrl,
		label: offering.curriculum.label,
		groups: offering.curriculum.groups.map((group, index) => ({
			id: `${offering.curriculum.id}:selection-group:${index}`,
			title: group.title,
			kind: group.kind,
			selectionMin: group.selectionMin,
			selectionMax: group.selectionMax,
			components: group.components.map((component) => ({
				id: component.id,
				title: topicById.get(component.id)?.title ?? component.id
			}))
		})),
		topics: offering.curriculum.topics
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
