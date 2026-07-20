import { isResumableEnglishGuidedDraft } from '$lib/learning/englishGuidedDraft';
import { enabledProfileCombinationForQuestion } from '$lib/learning/profileQuestionCompatibility';
import { isResumableSciencePracticeDraft } from '$lib/learning/sciencePracticeDraft';
import type { LearningActionView } from '$lib/learning/viewTypes';
import type { PracticeDraftKind, SavedPracticeDraft } from '$lib/practiceDrafts';
import type { LearnerSubject } from '$lib/server/personalLearning';
import { queryPersonalRows, queryRows } from '$lib/server/db';

type QuestionDraftRow = {
	question_id: string;
	draft_kind: PracticeDraftKind;
	answer_text: string;
	draft_json: string;
	client_updated_at: number;
	updated_at: string;
};

export type ResumeQuestionRow = {
	id: string;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	subject_area: string | null;
	component_code: string | null;
	tier: string | null;
	reviewedPrimaryMappingCount: number;
	reviewedCurriculumMappings: Array<{ componentId: string; depth: number }>;
};

type StoredResumeQuestionRow = Omit<
	ResumeQuestionRow,
	'reviewedPrimaryMappingCount' | 'reviewedCurriculumMappings'
> & {
	reviewed_primary_mapping_count: number;
	reviewed_curriculum_mappings_json: string;
};

export type ResumeTopicScopes = ReadonlyMap<string, ReadonlySet<string>>;

function parseJsonRecord(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function parseCurriculumMappings(value: string): Array<{ componentId: string; depth: number }> {
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((mapping) => {
			if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return [];
			const componentId = (mapping as Record<string, unknown>).componentId;
			const depth = (mapping as Record<string, unknown>).depth;
			return typeof componentId === 'string' && typeof depth === 'number'
				? [{ componentId, depth }]
				: [];
		});
	} catch {
		return [];
	}
}

function savedDraftFromRow(row: QuestionDraftRow): SavedPracticeDraft {
	return {
		questionId: row.question_id,
		draftKind: row.draft_kind,
		answerText: row.answer_text,
		payload: parseJsonRecord(row.draft_json),
		clientUpdatedAt: row.client_updated_at,
		updatedAt: row.updated_at
	};
}

export function isResumableQuestionDraft(draft: SavedPracticeDraft): boolean {
	return isResumableSciencePracticeDraft(draft) || isResumableEnglishGuidedDraft(draft);
}

function resumeAction(subject: LearnerSubject, questionId: string): LearningActionView {
	return {
		id: `resume:${questionId}`,
		kind: 'resume',
		eyebrow: 'Unfinished answer',
		title: `Continue your ${subject.subject} answer`,
		detail: 'Your latest unfinished response is saved on this question.',
		reason: 'Carry on from the exact point you reached instead of starting another activity.',
		durationMinutes: null,
		href: `/questions/${encodeURIComponent(questionId)}/practice`,
		available: true
	};
}

function hasOneDeepestMappingInScope(
	question: ResumeQuestionRow,
	includedTopicIds: ReadonlySet<string>
): boolean {
	if (question.reviewedPrimaryMappingCount !== 1) return false;
	const matching = question.reviewedCurriculumMappings.filter(
		(mapping) =>
			mapping.componentId.trim().length > 0 &&
			Number.isInteger(mapping.depth) &&
			mapping.depth >= 0 &&
			includedTopicIds.has(mapping.componentId)
	);
	if (matching.length === 0) return false;
	const deepest = Math.max(...matching.map((mapping) => mapping.depth));
	return (
		new Set(
			matching.filter((mapping) => mapping.depth === deepest).map((mapping) => mapping.componentId)
		).size === 1
	);
}

/**
 * Select at most one latest compatible draft per enabled subject. Draft order
 * is normalized here so callers do not have to rely on a database sort.
 */
export function latestResumeActionsBySubject(
	subjects: LearnerSubject[],
	drafts: SavedPracticeDraft[],
	questions: ResumeQuestionRow[],
	topicScopes: ResumeTopicScopes
): Map<string, LearningActionView> {
	const questionsById = new Map(questions.map((question) => [question.id, question]));
	const result = new Map<string, LearningActionView>();
	const newestFirst = [...drafts].sort(
		(left, right) => right.clientUpdatedAt - left.clientUpdatedAt
	);

	for (const draft of newestFirst) {
		if (!isResumableQuestionDraft(draft)) continue;
		const question = questionsById.get(draft.questionId);
		if (!question) continue;
		const subject = enabledProfileCombinationForQuestion(subjects, {
			board: question.board,
			qualification: question.qualification,
			subject: question.subject,
			subjectArea: question.subject_area,
			componentCode: question.component_code,
			tier: question.tier
		});
		const includedTopicIds = subject ? topicScopes.get(subject.subject) : null;
		if (
			!subject ||
			!includedTopicIds ||
			!hasOneDeepestMappingInScope(question, includedTopicIds) ||
			result.has(subject.subject)
		) {
			continue;
		}
		result.set(subject.subject, resumeAction(subject, draft.questionId));
	}

	return result;
}

async function readResumeQuestions(questionIds?: string[]): Promise<ResumeQuestionRow[]> {
	if (questionIds?.length === 0) return [];
	const questionFilter = questionIds
		? `q.id IN (SELECT value FROM json_each(?))
		     AND`
		: '';
	const storedQuestions = await queryRows<StoredResumeQuestionRow>(
		`WITH RECURSIVE eligible_questions AS MATERIALIZED (
		   SELECT q.id, q.board, q.qualification, q.subject, q.subject_area,
		          q.component_code, q.tier,
		          (
		            SELECT COUNT(*)
		            FROM question_curriculum_components direct_mapping
		            WHERE direct_mapping.question_id = q.id
		              AND direct_mapping.is_primary = 1
		              AND direct_mapping.reviewed = 1
		          ) AS reviewed_primary_mapping_count
		   FROM questions q
		   WHERE ${questionFilter} q.status = 'published'
		     AND q.needs_human_review = 0
		     AND (
		       SELECT COUNT(*)
		       FROM question_curriculum_components direct_mapping
		       WHERE direct_mapping.question_id = q.id
		         AND direct_mapping.is_primary = 1
		         AND direct_mapping.reviewed = 1
		     ) = 1
		     AND EXISTS (
		       SELECT 1
		       FROM question_answer_chains qac
		       JOIN answer_chains ac ON ac.id = qac.answer_chain_id
		       WHERE qac.question_id = q.id
		         AND qac.is_primary = 1
		         AND qac.needs_human_review = 0
		         AND ac.status = 'published'
		         AND ac.needs_human_review = 0
		     )
		 ),
		 mapped_ancestors(question_id, component_id, parent_id, selectable, depth) AS (
		   SELECT qcc.question_id, component.id, component.parent_id,
		          component.selectable, component.depth
		   FROM question_curriculum_components qcc
		   JOIN curriculum_components component ON component.id = qcc.curriculum_component_id
		   JOIN eligible_questions question ON question.id = qcc.question_id
		   WHERE qcc.is_primary = 1 AND qcc.reviewed = 1
		   UNION ALL
		   SELECT child.question_id, parent.id, parent.parent_id, parent.selectable, parent.depth
		   FROM mapped_ancestors child
		   JOIN curriculum_components parent ON parent.id = child.parent_id
		 )
		 SELECT question.*,
		        COALESCE((
		          SELECT json_group_array(json_object(
		            'componentId', mapping.component_id,
		            'depth', mapping.depth
		          ))
		          FROM (
		            SELECT DISTINCT component_id, depth
		            FROM mapped_ancestors
		            WHERE question_id = question.id AND selectable = 1
		            ORDER BY depth DESC, component_id
		          ) mapping
		        ), '[]') AS reviewed_curriculum_mappings_json
		 FROM eligible_questions question`,
		questionIds ? [JSON.stringify(questionIds)] : []
	);
	return storedQuestions.map<ResumeQuestionRow>((storedQuestion) => {
		const { reviewed_primary_mapping_count, reviewed_curriculum_mappings_json, ...question } =
			storedQuestion;
		return {
			...question,
			reviewedPrimaryMappingCount: Number(reviewed_primary_mapping_count),
			reviewedCurriculumMappings: parseCurriculumMappings(reviewed_curriculum_mappings_json)
		};
	});
}

/**
 * Build the reviewed resume-question index for the versioned public subject
 * catalog. This is intentionally an offline materialization query; request
 * handlers must consume the one-row catalog instead of running this scan.
 */
export async function getFreshResumeQuestionCatalog(): Promise<ResumeQuestionRow[]> {
	return await readResumeQuestions();
}

export async function getLatestResumeActionsBySubject(
	userId: string,
	subjects: LearnerSubject[],
	topicScopes: ResumeTopicScopes,
	{
		publicQuestions
	}: {
		publicQuestions?: ResumeQuestionRow[];
	} = {}
): Promise<Map<string, LearningActionView>> {
	const rows = await queryPersonalRows<QuestionDraftRow>(
		`SELECT question_id, draft_kind, answer_text, draft_json, client_updated_at, updated_at
		 FROM user_question_drafts
		 WHERE user_id = ?
		 ORDER BY client_updated_at DESC, updated_at DESC
		 LIMIT 50`,
		[userId]
	);
	const drafts = rows.map(savedDraftFromRow).filter(isResumableQuestionDraft);
	if (drafts.length === 0) return new Map();

	const questionIds = [...new Set(drafts.map((draft) => draft.questionId))];
	const questions =
		publicQuestions === undefined
			? await readResumeQuestions(questionIds)
			: publicQuestions.filter((question) => questionIds.includes(question.id));

	return latestResumeActionsBySubject(subjects, drafts, questions, topicScopes);
}
