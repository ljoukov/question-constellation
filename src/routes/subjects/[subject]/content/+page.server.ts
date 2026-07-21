import { learnerSubjectFromSlug, learnerSubjectHref } from '$lib/learning/subjects';
import {
	ocrEnglishLiteratureOptions,
	parseOcrEnglishLiteratureSelections
} from '$lib/englishLiteratureProfile';
import {
	getLearnerProfileSettings,
	updateEnglishLiteratureSelections
} from '$lib/server/personalLearning';
import {
	CurriculumScopeValidationError,
	getSubjectLearningPublicCatalog,
	saveSubjectCurriculumScope
} from '$lib/server/subjectLearning';
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type SubjectIdentity = {
	subject: string;
	board: string;
	qualification: string;
	course: string;
	tier: string;
};

function catalogOfferingForSubject(
	catalog: Awaited<ReturnType<typeof getSubjectLearningPublicCatalog>>,
	subject: SubjectIdentity
) {
	return (
		catalog.offerings.find(
			(candidate) =>
				candidate.curriculum.board === subject.board &&
				candidate.curriculum.qualification === subject.qualification &&
				candidate.curriculum.profileSubject === subject.subject &&
				candidate.curriculum.course === subject.course &&
				candidate.curriculum.tier === subject.tier
		) ?? null
	);
}

function isOcrEnglishLiterature(subject: SubjectIdentity) {
	return subject.subject === 'English Literature' && subject.board === 'OCR';
}

export const load: PageServerLoad = async ({ locals, params, url, parent }) => {
	if (!locals.user) {
		throw redirect(303, `/auth/start?next=${encodeURIComponent(url.pathname)}`);
	}
	const subjectName = learnerSubjectFromSlug(params.subject);
	if (!subjectName) {
		throw error(404, 'Subject content is not available for this subject.');
	}
	const layoutData = await parent();
	const subject =
		layoutData.homeSnapshot?.subjectViews?.find((candidate) => candidate.subject === subjectName) ??
		null;
	if (!subject && layoutData.homeSnapshotShouldRefresh) {
		throw error(503, 'Your subject content is updating. Reload in a moment.');
	}
	if (!subject) throw error(404, 'This subject is not enabled in your profile.');
	let publicCatalog;
	try {
		publicCatalog = await getSubjectLearningPublicCatalog();
	} catch {
		throw error(503, 'Your subject content is updating. Reload in a moment.');
	}
	const offering = catalogOfferingForSubject(publicCatalog, subject);
	if (!offering) {
		throw error(404, 'No imported official specification matches these subject settings.');
	}
	const topicById = new Map(offering.curriculum.topics.map((topic) => [topic.id, topic] as const));
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
		if (!locals.user) return fail(401, { message: 'Sign in to save your subject content.' });
		const subjectName = learnerSubjectFromSlug(params.subject);
		if (!subjectName) {
			return fail(404, { message: 'Subject content is not available for this subject.' });
		}
		const form = await request.formData();
		const mode = form.get('scopeMode') === 'all' ? 'all' : 'selected';
		const selectedTopicIds = form.getAll('topicId').map(String);
		const settings = await getLearnerProfileSettings(locals.user);
		const learnerSubject =
			settings.subjects.find((subject) => subject.enabled && subject.subject === subjectName) ??
			null;
		if (!learnerSubject) {
			return fail(404, { message: 'This subject is not enabled in your profile.' });
		}
		if (isOcrEnglishLiterature(learnerSubject)) {
			let publicCatalog;
			try {
				publicCatalog = await getSubjectLearningPublicCatalog();
			} catch {
				return fail(503, { message: 'Your subject content is updating. Try again in a moment.' });
			}
			const offering = catalogOfferingForSubject(publicCatalog, learnerSubject);
			if (!offering) {
				return fail(404, {
					message: 'No imported official specification matches these subject settings.'
				});
			}
			const topicById = new Map(
				offering.curriculum.topics.map((topic) => [topic.id, topic] as const)
			);
			const selectedTitles = selectedTopicIds.flatMap((id) => {
				const title = topicById.get(id)?.title;
				return title ? [title] : [];
			});
			const selectedTitle = (options: readonly string[]) =>
				options.find((option) => selectedTitles.includes(option)) ?? null;
			const selections = parseOcrEnglishLiteratureSelections({
				modernText: selectedTitle(ocrEnglishLiteratureOptions.modernTexts),
				nineteenthCenturyNovel: selectedTitle(ocrEnglishLiteratureOptions.nineteenthCenturyNovels),
				poetryCluster: selectedTitle(ocrEnglishLiteratureOptions.poetryClusters),
				shakespearePlay: selectedTitle(ocrEnglishLiteratureOptions.shakespearePlays)
			});
			if (
				mode !== 'selected' ||
				selectedTopicIds.length !== 4 ||
				selectedTitles.length !== selectedTopicIds.length ||
				!selections ||
				Object.values(selections).some((selection) => !selection)
			) {
				return fail(400, {
					message: 'Choose one valid text or cluster from each OCR section.',
					mode,
					selectedTopicIds
				});
			}
			try {
				await updateEnglishLiteratureSelections({
					userId: locals.user.uid,
					selections
				});
			} catch {
				return fail(400, {
					message: 'Unable to save these text choices. Please try again.',
					mode,
					selectedTopicIds
				});
			}
			throw redirect(303, learnerSubjectHref(subjectName));
		}
		try {
			await saveSubjectCurriculumScope(locals.user, subjectName, {
				mode,
				selectedTopicIds
			});
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : '';
			const knownValidationMessage =
				cause instanceof CurriculumScopeValidationError ||
				message === 'No imported official specification matches these subject settings.'
					? message
					: 'Unable to save this subject content. Please try again.';
			return fail(400, {
				message: knownValidationMessage,
				mode,
				selectedTopicIds
			});
		}
		throw redirect(303, learnerSubjectHref(subjectName));
	}
};
