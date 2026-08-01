import { enabledProfileCombinationForQuestion } from '$lib/learning/profileQuestionCompatibility';
import {
	buildPracticePaperSelection,
	estimatedPracticePaperMinutes,
	normalizePracticePaperDuration
} from '$lib/learning/practicePaper';
import { learnerSubjectFromSlug } from '$lib/learning/subjects';
import { questionPracticeStateFromDraft } from '$lib/learning/questionPracticeDraft';
import type { SignedInSubjectView } from '$lib/learning/viewTypes';
import {
	getQuestionBankQuestionsForSubject,
	type QuestionBankQuestion
} from '$lib/server/learningChainData';
import { getPracticePageData } from '$lib/server/questionData';
import { getQuestionDrafts } from '$lib/server/questionDrafts';
import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const paperSeedPattern = /^[a-zA-Z0-9_-]{8,80}$/;

function paperQuestionMatchesSubject(question: QuestionBankQuestion, subject: SignedInSubjectView) {
	return Boolean(
		enabledProfileCombinationForQuestion(
			[
				{
					subject: subject.subject,
					board: subject.board,
					qualification: subject.qualification,
					course: subject.course as 'Separate Science' | 'Combined Science' | 'GCSE Subject',
					tier: subject.tier as 'Higher' | 'Foundation',
					enabled: true
				}
			],
			{
				board: question.board,
				qualification: question.qualification,
				subject: question.subject,
				subjectArea: question.subject,
				componentCode: question.componentCode,
				tier: question.tier
			}
		)
	);
}

function scopedPaperQuestions(questions: QuestionBankQuestion[], subject: SignedInSubjectView) {
	const compatible = questions.filter(
		(question) => question.practiceAvailable && paperQuestionMatchesSubject(question, subject)
	);
	if (subject.scope.status !== 'selected' || subject.scope.includedTopicIds.length === 0) {
		return compatible;
	}
	const included = new Set(subject.scope.includedTopicIds);
	return compatible.filter((question) => included.has(question.topicId));
}

function topicOptions(questions: QuestionBankQuestion[], subject: SignedInSubjectView) {
	const topicTitleById = new Map(subject.topics.map((topic) => [topic.id, topic.title]));
	const topics = new Map<string, { id: string; title: string; questionCount: number }>();
	for (const question of questions) {
		const topic = topics.get(question.topicId) ?? {
			id: question.topicId,
			title: topicTitleById.get(question.topicId) ?? question.topic,
			questionCount: 0
		};
		topic.questionCount += 1;
		topics.set(question.topicId, topic);
	}
	const subjectOrder = new Map(subject.topics.map((topic, index) => [topic.id, index]));
	return [...topics.values()].sort(
		(left, right) =>
			(subjectOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
				(subjectOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
			left.title.localeCompare(right.title)
	);
}

function publicSubject(subject: SignedInSubjectView) {
	return {
		subject: subject.subject,
		slug: subject.slug,
		href: subject.href,
		board: subject.board,
		qualification: subject.qualification,
		course: subject.course,
		tier: subject.tier,
		courseLabel: subject.courseLabel
	};
}

function draftPaperMetadata(payload: Record<string, unknown>) {
	const value = payload.practicePaper;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	if (typeof record.id !== 'string' || record.id.length === 0) return null;
	return {
		id: record.id,
		status: record.status === 'complete' ? ('complete' as const) : ('in_progress' as const)
	};
}

export const load: PageServerLoad = async ({ locals, params, url, parent }) => {
	if (!locals.user) {
		throw redirect(303, `/auth/start?next=${encodeURIComponent(url.pathname + url.search)}`);
	}
	const subjectName = learnerSubjectFromSlug(params.subject);
	if (!subjectName) throw error(404, 'Subject not found.');

	const layout = await parent();
	const subject = layout.homeSnapshot?.subjectViews?.find(
		(candidate) => candidate.subject === subjectName
	);
	if (!subject) throw error(404, 'This subject is not enabled in your profile.');
	if (subject.scope.status === 'not_set' && subject.scope.href) {
		throw redirect(303, subject.scope.href);
	}

	const availableQuestions = scopedPaperQuestions(
		await getQuestionBankQuestionsForSubject(subject.board, subject.subject),
		subject
	);
	const topics = topicOptions(availableQuestions, subject);
	const requestedSeed = url.searchParams.get('paper')?.trim() ?? '';
	const seed = paperSeedPattern.test(requestedSeed) ? requestedSeed : null;

	if (!seed) {
		return {
			user: locals.user,
			subject: publicSubject(subject),
			topics,
			questionCount: availableQuestions.length,
			paper: null,
			notice:
				availableQuestions.length === 0
					? 'There are not enough reviewed questions for this profile yet.'
					: null
		};
	}

	const durationMinutes = normalizePracticePaperDuration(url.searchParams.get('minutes'));
	const validTopicIds = new Set(topics.map((topic) => topic.id));
	const selectedTopicIds = [
		...new Set(
			url.searchParams
				.getAll('topic')
				.map((value) => value.trim())
				.filter((value) => validTopicIds.has(value))
		)
	];
	const selectedSummaries = buildPracticePaperSelection({
		questions: availableQuestions,
		selectedTopicIds,
		seed,
		durationMinutes
	});
	const loaded = await Promise.all(
		selectedSummaries.map(async (summary) => {
			try {
				const data = await getPracticePageData(summary.id);
				return data.question.practiceAvailable ? { summary, data } : null;
			} catch (cause) {
				console.warn('[practice-paper] skipped unavailable question', {
					questionId: summary.id,
					cause
				});
				return null;
			}
		})
	);
	const readyQuestions = loaded.filter((entry): entry is NonNullable<typeof entry> =>
		Boolean(entry)
	);
	if (readyQuestions.length === 0) {
		return {
			user: locals.user,
			subject: publicSubject(subject),
			topics,
			questionCount: availableQuestions.length,
			paper: null,
			notice: 'A paper could not be assembled from those topics. Try a broader selection.'
		};
	}

	const drafts = await getQuestionDrafts(
		locals.user.uid,
		readyQuestions.map(({ data }) => data.question.id)
	).catch((cause) => {
		console.warn('[practice-paper] saved answers unavailable', { cause });
		return [];
	});
	const draftByQuestionId = new Map(drafts.map((draft) => [draft.questionId, draft]));
	const selectedTopicTitles = topics
		.filter((topic) => selectedTopicIds.includes(topic.id))
		.map((topic) => topic.title);
	const title =
		selectedTopicTitles.length === 1
			? `${selectedTopicTitles[0]} practice paper`
			: `${subject.subject} practice paper`;
	const totalMarks = readyQuestions.reduce(
		(total, { data }) => total + Math.max(0, data.question.meta.marks ?? 0),
		0
	);
	const href = `${url.pathname}${url.search}`;
	const questions = readyQuestions.map(({ data }, index) => {
		const question = data.question;
		const draft = draftByQuestionId.get(question.id) ?? null;
		const draftPaper = draftPaperMetadata(draft?.payload ?? {});
		const restored = draftPaper?.id === seed ? questionPracticeStateFromDraft(draft) : null;
		return {
			number: index + 1,
			id: question.id,
			sourceRef: question.sourceRef,
			title: question.title,
			prompt: question.prompt,
			context: question.context,
			assets: question.assets,
			renderingOverlay: question.renderingOverlay,
			meta: question.meta,
			checklist: question.checklist,
			markingPoints: data.chain.steps.map((point) => ({
				id: point.id,
				short: point.short,
				label: point.label
			})),
			saved: restored
				? {
						answerText: restored.answerText,
						gradedAnswerText: restored.gradedAnswerText,
						gradeResult: restored.gradeResult,
						updatedAt: restored.updatedAt,
						paperStatus: draftPaper?.status ?? 'in_progress'
					}
				: null
		};
	});
	const savedStatus = questions.every((question) => question.saved?.paperStatus === 'complete')
		? 'complete'
		: 'in_progress';

	return {
		user: locals.user,
		subject: publicSubject(subject),
		topics,
		questionCount: availableQuestions.length,
		notice: null,
		paper: {
			id: seed,
			title,
			href,
			durationMinutes,
			estimatedDurationMinutes: estimatedPracticePaperMinutes(totalMarks),
			totalMarks,
			topicIds: selectedTopicIds,
			topicTitles:
				selectedTopicTitles.length > 0 ? selectedTopicTitles : topics.map((topic) => topic.title),
			savedStatus,
			questions
		}
	};
};

export const actions: Actions = {
	createPaper: async ({ locals, params, request, url }) => {
		if (!locals.user) throw redirect(303, `/auth/start?next=${encodeURIComponent(url.pathname)}`);
		if (!learnerSubjectFromSlug(params.subject)) throw error(404, 'Subject not found.');
		const form = await request.formData();
		const duration = normalizePracticePaperDuration(String(form.get('minutes') ?? '60'));
		const topics = [
			...new Set(
				form
					.getAll('topic')
					.map((value) => String(value).trim())
					.filter((value) => value.length > 0 && value.length <= 160)
					.slice(0, 24)
			)
		];
		const search = new URLSearchParams({
			paper: crypto.randomUUID(),
			minutes: String(duration)
		});
		for (const topic of topics) search.append('topic', topic);
		throw redirect(303, `${url.pathname}?${search.toString()}`);
	}
};
