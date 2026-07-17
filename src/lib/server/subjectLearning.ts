import { storedQuestionTitle, storedQuestionTitleIssues } from '$lib/storedQuestionTitle.js';
import {
	constructedAnswerIsIndependent,
	normalizeConstructedAnswerAssistance,
	type ConstructedAnswerAssistance
} from '$lib/learning/answerAssistance';
import { curriculumOfferingTopics } from '$lib/curriculum/catalog';
import type { CurriculumSelectionGroup } from '$lib/curriculum/catalog';
import type { StemCurriculumTopic } from '$lib/curriculum/aqaStem';
import {
	computeLearnerState,
	rankCandidateActions,
	type EvidenceKind,
	type EvidenceOutcome,
	type LearnerEvidence,
	type LearnerState,
	type LearnerUncertainty,
	type LearningActionCandidate
} from '$lib/learning/learnerModel';
import {
	isScienceLearnerSubject,
	learnerSubjectHref,
	learnerSubjectScopeHref,
	supportedLearnerSubjects,
	type SupportedLearnerSubject
} from '$lib/learning/subjects';
import { supportsLearnerPracticeInput } from '$lib/learning/practiceEligibility';
import { deriveCheckedAnswerPerformance } from '$lib/learning/workingGradeEstimate';
import {
	englishPracticeEligibility,
	type EnglishSourceAssetEvidence
} from '$lib/englishPracticeEligibility';
import { enabledProfileCombinationForQuestion } from '$lib/learning/profileQuestionCompatibility';
import type { EnglishLiteratureSelections } from '$lib/englishLiteratureProfile';
import type {
	CurriculumScopeView,
	CurriculumTopicProgressView,
	LearnerFacingState,
	LearningActionView,
	SignedInLearningHome,
	SignedInSubjectView
} from '$lib/learning/viewTypes';
import {
	ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR,
	profileAnchorHref,
	profileSubjectAnchor
} from '$lib/profileNavigation';
import {
	recallCurriculumTopics,
	type RecallCard,
	type RecallRuntimeSubject,
	type RecallSubject,
	type RecallTopic
} from '$lib/recall/aqaScienceRecall';
import {
	getRecallCardById,
	getRecallCards,
	recallEvidenceComponentId,
	recallReviewMatchesCard,
	type RecallCatalogScope
} from '$lib/server/recallCatalog';
import type { RecallChoiceDiagnostic } from '$lib/recall/personalization';
import { recallSessionHref } from '$lib/recall/routes';
import type { AdminUser } from '$lib/server/auth/session';
import type { QuestionGradeResult } from '$lib/server/answerGrading';
import type { EnglishStepGradeResult } from '$lib/server/englishStepGrading';
import type { GapFinalJudgeResult } from '$lib/server/personalLearning';
import {
	getLearnerProfileSettings,
	type LearnerProfileSettings,
	type LearnerSubject
} from '$lib/server/personalLearning';
import { getCurriculumOffering } from '$lib/server/curriculumCatalog';
import { getLatestResumeActionsBySubject } from '$lib/server/learningResume';
import {
	executePersonalQuery,
	queryPersonalFirst,
	queryPersonalRows,
	queryRows
} from '$lib/server/db';

type CurriculumScopeRow = {
	user_id: string;
	subject: string;
	board: string;
	qualification: string;
	course: string;
	tier: string;
	specification_code: string;
	specification_version: string | null;
	official_source_url: string;
	scope_mode: 'all' | 'selected';
	selected_component_ids_json: string;
	updated_at: string;
};

type ComponentStateRow = {
	curriculum_component_id: string;
	component_kind: string;
	component_id: string;
	state: LearnerState;
	uncertainty: LearnerUncertainty;
	evidence_count: number;
	next_check_at: string | null;
};

type TopicEvidenceRow = {
	curriculum_component_id: string;
	evidence_count: number;
};

type RecallReviewBaseRow = {
	card_id: string;
	topic_id: string;
	last_grade: string;
	seen_count: number;
	correct_count: number;
	interval_days: number;
	due_at: string;
	content_revision: number | null;
	content_hash: string | null;
	updated_at: string;
};

type RecallReviewRow = RecallReviewBaseRow & {
	wrong_choice_count: number;
	repeated_misconception_count: number;
};

type RecallChoiceDiagnosticCountRow = {
	card_id: string;
	content_revision: number;
	content_hash: string;
	wrong_choice_count: number;
	repeated_misconception_count: number;
};

type AttemptRow = {
	id: string;
	question_id: string;
	answer_chain_id: string | null;
	result: string;
	awarded_marks: number;
	max_marks: number;
	independent: number;
	topic_path_json: string;
	created_at: string;
};

type GapRow = {
	id: string;
	answer_chain_id: string;
	chain_step_id: string;
	step_text: string;
	chain_title: string;
	evidence_count: number;
	distinct_item_count: number;
	gap_band: string;
	status: string;
	source_question_id: string | null;
	topic_path_json: string;
	updated_at: string;
};

type QuestionCandidateRow = {
	id: string;
	subject: string | null;
	prompt_text: string;
	self_contained_prompt_text: string | null;
	context_text: string | null;
	self_containment_json: string | null;
	reviewed_source_assets_json: string | null;
	reviewed_render_json: string | null;
	metadata_json: string;
	source_question_ref: string;
	marks: number | null;
	answer_format: string | null;
	response_kind: string | null;
	paper: string | null;
	topic_path_json: string;
	spec_ref: string | null;
	curriculum_component_id: string | null;
	answer_chain_id: string;
	chain_title: string;
	transfer_distance: string;
	step_count: number;
	reviewed_answer_text: string | null;
};

type CandidateDetail = {
	candidate: LearningActionCandidate;
	action: LearningActionView;
};

type RecommendationDecisionRow = {
	id: string;
	selected_action_id: string;
	reason_text: string;
	decision_source: 'rules' | 'llm';
	valid_until: string | null;
	curriculum_scope_snapshot_json: string;
	learner_state_snapshot_json: string;
	candidate_actions_json: string;
};

type SubjectEvidenceBundle = {
	states: ComponentStateRow[];
	topicEvidence: TopicEvidenceRow[];
	reviews: RecallReviewBaseRow[];
	attempts: AttemptRow[];
	gaps: GapRow[];
	recallCards: RecallCard[];
};

type LearnerCurriculum = {
	id: string;
	specificationId: string;
	board: string;
	qualification: string;
	profileSubject: string;
	course: string;
	tier: string;
	specificationCode: string;
	specificationVersion: string;
	specificationUrl: string;
	label: string;
	groups: CurriculumSelectionGroup[];
	topics: StemCurriculumTopic[];
};

type ProfileCourseConfiguration = {
	selectedCount: number;
	totalCount: number;
};

export type SubjectCurriculumScopeInput = {
	mode: 'all' | 'selected';
	selectedTopicIds: string[];
};

export class CurriculumScopeValidationError extends Error {
	name = 'CurriculumScopeValidationError';
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function normalized(value: string | null | undefined): string {
	return (value ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

const genericCurriculumWords = new Set([
	'biology',
	'chapter',
	'chemistry',
	'computer',
	'english',
	'gcse',
	'geography',
	'history',
	'option',
	'paper',
	'physics',
	'question',
	'science',
	'section',
	'studies',
	'study',
	'subject',
	'topic',
	'unit'
]);

function distinctiveCurriculumWords(title: string): string[] {
	return normalized(title)
		.split(' ')
		.filter((word) => word.length >= 5 && !genericCurriculumWords.has(word));
}

function isoNow(): string {
	return new Date().toISOString();
}

function courseLabel(subject: LearnerSubject): string {
	return [
		subject.board,
		isScienceLearnerSubject(subject.subject)
			? subject.course === 'Combined Science'
				? 'Combined'
				: 'Separate'
			: subject.qualification,
		isScienceLearnerSubject(subject.subject) ? subject.tier : null
	]
		.filter(Boolean)
		.join(' · ');
}

function recallTopicForOfficialTopic(
	subject: RecallRuntimeSubject,
	topic: StemCurriculumTopic
): RecallTopic | null {
	return (
		recallCurriculumTopics.find(
			(entry) => entry.subject === subject && entry.specRef === topic.code
		) ??
		recallCurriculumTopics.find(
			(entry) => entry.subject === subject && normalized(entry.title) === normalized(topic.title)
		) ??
		null
	);
}

function officialTopicForRecallTopic(
	subject: RecallRuntimeSubject,
	recallTopicId: string,
	topics: StemCurriculumTopic[]
): StemCurriculumTopic | null {
	const directlyMappedTopic = topics.find((topic) => topic.id === recallTopicId);
	if (directlyMappedTopic) return directlyMappedTopic;
	const recallTopic = recallCurriculumTopics.find(
		(entry) => entry.subject === subject && entry.id === recallTopicId
	);
	if (!recallTopic) return null;
	return (
		topics.find((topic) => topic.code === recallTopic.specRef) ??
		topics.find((topic) => normalized(topic.title) === normalized(recallTopic.title)) ??
		null
	);
}

async function recallCatalogScopeForSettings(
	settings: LearnerProfileSettings,
	subject: RecallRuntimeSubject
): Promise<RecallCatalogScope | null> {
	const learnerSubject = settings.subjects.find(
		(entry) => entry.enabled && entry.subject === subject
	);
	if (!learnerSubject) return null;
	const offering = await getCurriculumOffering({
		board: learnerSubject.board,
		qualification: learnerSubject.qualification,
		profileSubject: learnerSubject.subject,
		course: learnerSubject.course,
		tier: learnerSubject.tier
	});
	return offering ? { subject, offeringId: offering.id } : null;
}

export async function getRecallCatalogScopeForLearner(
	user: AdminUser,
	subject: RecallRuntimeSubject
): Promise<RecallCatalogScope | null> {
	return await recallCatalogScopeForSettings(await getLearnerProfileSettings(user), subject);
}

export async function getRecallCardForLearner(
	user: AdminUser,
	cardId: string
): Promise<RecallCard | null> {
	const settings = await getLearnerProfileSettings(user);
	for (const learnerSubject of settings.subjects) {
		if (
			!learnerSubject.enabled ||
			!supportedLearnerSubjects.includes(learnerSubject.subject as RecallRuntimeSubject)
		) {
			continue;
		}
		const subject = learnerSubject.subject as RecallRuntimeSubject;
		const scope = await recallCatalogScopeForSettings(settings, subject);
		if (!scope) continue;
		const card = await getRecallCardById(cardId, scope);
		if (card) return card;
	}
	return null;
}

async function curriculumForLearnerSubject(
	subject: Pick<LearnerSubject, 'subject' | 'board' | 'qualification' | 'course' | 'tier'>
): Promise<LearnerCurriculum | null> {
	const offering = await getCurriculumOffering({
		board: subject.board,
		qualification: subject.qualification,
		profileSubject: subject.subject,
		course: subject.course,
		tier: subject.tier
	});
	if (!offering) return null;
	return {
		id: offering.id,
		specificationId: offering.specification.id,
		board: offering.board,
		qualification: offering.qualification,
		profileSubject: offering.profileSubject,
		course: offering.course,
		tier: offering.tier,
		specificationCode: offering.specification.code,
		specificationVersion: offering.specification.version,
		specificationUrl: offering.specification.officialSourceUrl,
		label: offering.label,
		groups: offering.selectionTree.groups,
		topics: curriculumOfferingTopics(offering).map((component) => ({
			id: component.id,
			code: component.code,
			title: component.title,
			paper: component.paper ?? component.groupTitle,
			specUrl: offering.specification.officialSourceUrl
		}))
	};
}

export function officialTopicForQuestion(
	topics: StemCurriculumTopic[],
	row:
		| Pick<QuestionCandidateRow, 'curriculum_component_id' | 'spec_ref' | 'topic_path_json'>
		| {
				curriculum_component_id?: string | null;
				spec_ref?: string | null;
				topic_path_json: string;
		  }
): StemCurriculumTopic | null {
	const mappedComponentId = row.curriculum_component_id?.trim();
	if (mappedComponentId) {
		const mapped = topics.find((topic) => topic.id === mappedComponentId);
		if (mapped) return mapped;
	}
	const specRef = (row.spec_ref ?? '').trim();
	if (specRef) {
		const bySpec = topics.find(
			(topic) => specRef === topic.code || specRef.startsWith(`${topic.code}.`)
		);
		if (bySpec) return bySpec;
	}
	const topicText = normalized(parseJson<string[]>(row.topic_path_json, []).join(' '));
	const exactTitle = topics.find((topic) => topicText.includes(normalized(topic.title)));
	if (exactTitle) return exactTitle;
	const topicTextWords = new Set(topicText.split(' '));
	const wordFrequency = new Map<string, number>();
	for (const topic of topics) {
		for (const word of new Set(distinctiveCurriculumWords(topic.title))) {
			wordFrequency.set(word, (wordFrequency.get(word) ?? 0) + 1);
		}
	}
	const matches = topics
		.map((topic) => ({
			topic,
			score: distinctiveCurriculumWords(topic.title).filter(
				(word) => wordFrequency.get(word) === 1 && topicTextWords.has(word)
			).length
		}))
		.filter((entry) => entry.score >= 2)
		.sort((left, right) => right.score - left.score);
	if (matches.length === 0 || matches[0].score === matches[1]?.score) return null;
	return matches[0].topic;
}

async function curriculumTopicForStoredQuestion(
	curriculum: LearnerCurriculum,
	questionId: string | null | undefined,
	fallback: { spec_ref?: string | null; topic_path_json: string }
): Promise<StemCurriculumTopic | null> {
	if (questionId) {
		const rows = await queryRows<{ curriculum_component_id: string }>(
			`WITH RECURSIVE mapped_ancestors(component_id, parent_id, selectable, depth) AS (
			   SELECT cc.id, cc.parent_id, cc.selectable, cc.depth
			   FROM question_curriculum_components qcc
			   JOIN curriculum_components cc ON cc.id = qcc.curriculum_component_id
			   WHERE qcc.question_id = ?
			     AND qcc.specification_id = ?
			     AND qcc.is_primary = 1
			     AND qcc.reviewed = 1
			   UNION ALL
			   SELECT parent.id, parent.parent_id, parent.selectable, parent.depth
			   FROM mapped_ancestors child
			   JOIN curriculum_components parent ON parent.id = child.parent_id
			 )
			 SELECT component_id AS curriculum_component_id
			 FROM mapped_ancestors
			 WHERE selectable = 1
			 ORDER BY depth DESC, component_id
			 LIMIT 1`,
			[questionId, curriculum.specificationId]
		);
		const mappedId = rows[0]?.curriculum_component_id;
		if (mappedId) {
			const mapped = curriculum.topics.find((topic) => topic.id === mappedId);
			if (mapped) return mapped;
		}
	}
	return officialTopicForQuestion(curriculum.topics, fallback);
}

async function readCurriculumScope(
	userId: string,
	subject: string
): Promise<CurriculumScopeRow | null> {
	return await queryPersonalFirst<CurriculumScopeRow>(
		`SELECT user_id, subject, board, qualification, course, tier,
		        specification_code, specification_version, official_source_url,
		        scope_mode, selected_component_ids_json, updated_at
		 FROM user_subject_curriculum_scopes
		 WHERE user_id = ? AND subject = ?`,
		[userId, subject]
	);
}

function validSelectedTopicIds(
	row: CurriculumScopeRow | null,
	topics: StemCurriculumTopic[]
): string[] {
	if (!row) return [];
	const allowed = new Set(topics.map((topic) => topic.id));
	return [...new Set(parseJson<string[]>(row.selected_component_ids_json, []))].filter((id) =>
		allowed.has(id)
	);
}

function curriculumScopeUnits(
	subject: string,
	groups: CurriculumSelectionGroup[]
): {
	unitSingular: string;
	unitPlural: string;
} {
	if (groups.some((group) => group.kind === 'option_group')) {
		return { unitSingular: 'course option', unitPlural: 'course options' };
	}
	if (subject === 'Geography') return { unitSingular: 'section', unitPlural: 'sections' };
	if (subject === 'Computer Science') return { unitSingular: 'topic', unitPlural: 'topics' };
	if (subject === 'English Language') {
		return { unitSingular: 'course area', unitPlural: 'course areas' };
	}
	const groupTitle = normalized(groups[0]?.title);
	if (groupTitle === 'topics') return { unitSingular: 'topic', unitPlural: 'topics' };
	if (groupTitle === 'course content') {
		return { unitSingular: 'course area', unitPlural: 'course areas' };
	}
	return { unitSingular: 'chapter', unitPlural: 'chapters' };
}

function scopeView(
	subject: string,
	row: CurriculumScopeRow | null,
	topics: StemCurriculumTopic[],
	groups: CurriculumSelectionGroup[]
): CurriculumScopeView {
	const units = curriculumScopeUnits(subject, groups);
	if (topics.length === 0) {
		return {
			status: 'not_available',
			label: 'Whole course',
			...units,
			href: null,
			includedTopicIds: [],
			includedCount: 0,
			totalCount: 0
		};
	}
	if (!row) {
		return {
			status: 'not_set',
			label: `Choose ${units.unitPlural}`,
			...units,
			href: learnerSubjectScopeHref(subject),
			includedTopicIds: [],
			includedCount: 0,
			totalCount: topics.length
		};
	}
	const selected = validSelectedTopicIds(row, topics);
	const optionGroups = groups.filter((group) => group.kind === 'option_group');
	const storedSelectionIsValid =
		row.scope_mode === 'all'
			? optionGroups.length === 0
			: selected.length > 0 &&
				optionGroups.every((group) => {
					const componentIds = new Set(group.components.map((component) => component.id));
					const selectedCount = selected.filter((id) => componentIds.has(id)).length;
					return (
						selectedCount >= (group.selectionMin ?? 0) &&
						(group.selectionMax == null || selectedCount <= group.selectionMax)
					);
				});
	if (!storedSelectionIsValid) {
		return {
			status: 'not_set',
			label: `Choose ${units.unitPlural}`,
			...units,
			href: learnerSubjectScopeHref(subject),
			includedTopicIds: selected,
			includedCount: selected.length,
			totalCount: topics.length
		};
	}
	const includedTopicIds = row.scope_mode === 'all' ? topics.map((topic) => topic.id) : selected;
	return {
		status: row.scope_mode === 'all' ? 'all' : 'selected',
		label:
			row.scope_mode === 'all'
				? `All ${topics.length} ${units.unitPlural}`
				: includedTopicIds.length === 1
					? (topics.find((topic) => topic.id === includedTopicIds[0])?.title ??
						`1 ${units.unitSingular}`)
					: `${includedTopicIds.length} of ${topics.length} ${units.unitPlural}`,
		...units,
		href: learnerSubjectScopeHref(subject),
		includedTopicIds,
		includedCount: includedTopicIds.length,
		totalCount: topics.length
	};
}

function isOcrEnglishLiterature(subject: LearnerSubject): boolean {
	return subject.subject === 'English Literature' && subject.board === 'OCR';
}

function ocrEnglishLiteratureScope(
	subject: LearnerSubject,
	selections: EnglishLiteratureSelections | undefined,
	topics: StemCurriculumTopic[]
): { scope: CurriculumScopeView; configuration: ProfileCourseConfiguration } | null {
	if (!isOcrEnglishLiterature(subject) || !selections) return null;

	const selectedTitles = [
		selections.modernText,
		selections.nineteenthCenturyNovel,
		selections.poetryCluster,
		selections.shakespearePlay
	].filter((title): title is string => Boolean(title?.trim()));
	const selectedTopicIds = selectedTitles.flatMap((title) => {
		const topic = topics.find((entry) => normalized(entry.title) === normalized(title));
		return topic ? [topic.id] : [];
	});
	const selectedCount = selectedTitles.length;
	const totalCount = 4;
	const profileComplete = selectedCount === totalCount;
	const curriculumMatched = selectedTopicIds.length === totalCount;
	const href = profileAnchorHref('/profile', ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR);

	return {
		configuration: { selectedCount, totalCount },
		scope: {
			status: profileComplete ? (curriculumMatched ? 'selected' : 'not_available') : 'not_set',
			label: profileComplete
				? '4 course texts selected'
				: `${selectedCount} of ${totalCount} course texts selected`,
			unitSingular: 'course text',
			unitPlural: 'course texts',
			href,
			includedTopicIds: selectedTopicIds,
			includedCount: selectedTopicIds.length,
			totalCount
		}
	};
}

async function readSubjectEvidence(
	userId: string,
	subject: LearnerSubject
): Promise<SubjectEvidenceBundle> {
	const runtimeSubject = supportedLearnerSubjects.includes(subject.subject as RecallRuntimeSubject)
		? (subject.subject as RecallRuntimeSubject)
		: null;
	const catalogCardsPromise = runtimeSubject
		? getCurriculumOffering({
				board: subject.board,
				qualification: subject.qualification,
				profileSubject: subject.subject,
				course: subject.course,
				tier: subject.tier
			}).then((offering) =>
				offering ? getRecallCards({ subject: runtimeSubject, offeringId: offering.id }) : []
			)
		: Promise.resolve([]);
	const catalogCards = await catalogCardsPromise;
	const activeRecallComponentIds = new Set(catalogCards.map(recallEvidenceComponentId));
	const activeRecallComponentIdsJson = JSON.stringify([...activeRecallComponentIds]);
	const [states, topicEvidence, reviews, attempts, gaps] = await Promise.all([
		queryPersonalRows<ComponentStateRow>(
			`SELECT curriculum_component_id, component_kind, component_id, state,
			        uncertainty, evidence_count, next_check_at
			 FROM user_learner_component_states
			 WHERE user_id = ? AND subject = ? AND course = ? AND tier = ?`,
			[userId, subject.subject, subject.course, subject.tier]
		),
		queryPersonalRows<TopicEvidenceRow>(
			`SELECT CASE
			          WHEN e.component_kind = 'recall_card'
			            THEN COALESCE(
			              NULLIF(json_extract(e.metadata_json, '$.topicComponentId'), ''),
			              e.curriculum_component_id
			            )
			          ELSE e.curriculum_component_id
			        END AS curriculum_component_id,
			        COUNT(DISTINCT CASE
			          WHEN COALESCE(e.source_attempt_id, '') <> ''
			            THEN 'attempt:' || e.source_attempt_id
			          WHEN COALESCE(e.source_session_id, '') <> ''
			           AND COALESCE(e.source_item_id, '') <> ''
			            THEN 'session:' || e.source_session_id || ':item:' || e.source_item_id
			          ELSE 'evidence:' || e.id
			        END) AS evidence_count
			 FROM user_learning_evidence e
			 WHERE e.user_id = ? AND e.subject = ?
			   AND COALESCE(e.course, '') = COALESCE(?, '')
				   AND COALESCE(e.tier, '') = COALESCE(?, '')
				   AND (
				     e.component_kind <> 'recall_card'
				     OR e.component_id IN (SELECT value FROM json_each(?))
				   )
			   AND NOT EXISTS (
			     SELECT 1
			     FROM user_learning_evidence correction
			     WHERE correction.user_id = e.user_id
			       AND correction.supersedes_evidence_id = e.id
			   )
			 GROUP BY CASE
			            WHEN e.component_kind = 'recall_card'
			              THEN COALESCE(
			                NULLIF(json_extract(e.metadata_json, '$.topicComponentId'), ''),
			                e.curriculum_component_id
			              )
			            ELSE e.curriculum_component_id
			          END`,
			[userId, subject.subject, subject.course, subject.tier, activeRecallComponentIdsJson]
		),
		queryPersonalRows<RecallReviewBaseRow>(
			`SELECT card_id, topic_id, last_grade, seen_count, correct_count, interval_days,
				        due_at, content_revision, content_hash, updated_at
			 FROM user_recall_card_reviews
			 WHERE user_id = ? AND subject = ? AND course = ? AND tier = ?`,
			[userId, subject.subject, subject.course, subject.tier]
		),
		queryPersonalRows<AttemptRow>(
			`SELECT id, question_id, answer_chain_id, result, awarded_marks, max_marks, independent,
			        topic_path_json, created_at
			 FROM user_question_attempts
			 WHERE user_id = ? AND subject = ? AND course = ? AND tier = ?
			 ORDER BY created_at DESC
			 LIMIT 500`,
			[userId, subject.subject, subject.course, subject.tier]
		),
		queryPersonalRows<GapRow>(
			`SELECT g.id, g.answer_chain_id, g.chain_step_id, g.step_text, g.chain_title,
			        g.evidence_count, COALESCE(s.distinct_item_count, 0) AS distinct_item_count,
			        g.gap_band, g.status, g.source_question_id, g.topic_path_json, g.updated_at
			 FROM user_chain_gaps g
			 LEFT JOIN user_learner_component_states s
			   ON s.user_id = g.user_id
			  AND s.subject = g.subject
			  AND s.course = g.course
			  AND s.tier = g.tier
			  AND s.component_kind = 'chain_step'
			  AND s.component_id = g.chain_step_id
			 WHERE g.user_id = ? AND g.subject = ? AND g.course = ? AND g.tier = ?
			   AND g.status IN ('active', 'awaiting_check')
			 ORDER BY g.evidence_count DESC, g.updated_at DESC, g.id`,
			[userId, subject.subject, subject.course, subject.tier]
		)
	]);
	const currentStates = states.filter(
		(row) => row.component_kind !== 'recall_card' || activeRecallComponentIds.has(row.component_id)
	);
	const cardsById = new Map(catalogCards.map((card) => [card.id, card]));
	const currentReviews = reviews.filter((review) => {
		const card = cardsById.get(review.card_id);
		return card ? recallReviewMatchesCard(card, review) : false;
	});
	return {
		states: currentStates,
		topicEvidence,
		reviews: currentReviews,
		attempts,
		gaps,
		recallCards: catalogCards
	};
}

async function readQuestionCandidates(
	subject: LearnerSubject,
	specificationId: string | null,
	scope: CurriculumScopeView
): Promise<QuestionCandidateRow[]> {
	return await queryRows<QuestionCandidateRow>(
		`WITH RECURSIVE candidate_questions AS MATERIALIZED (
		   SELECT
		     q.id, q.subject, q.prompt_text, q.self_contained_prompt_text, q.context_text,
		     q.self_containment_json, q.metadata_json,
		     q.source_question_ref, q.marks, q.answer_format, q.paper, q.topic_path_json,
		     q.spec_ref,
		     (SELECT ma.answer_text
		        FROM model_answers ma
		       WHERE ma.question_id = q.id
		         AND ma.needs_human_review = 0
		       ORDER BY ma.confidence DESC, ma.id
		       LIMIT 1) AS reviewed_answer_text,
		     (SELECT LOWER(json_extract(qro.render_json, '$.response.kind'))
		        FROM question_rendering_overlays qro
		       WHERE qro.question_id = q.id
		         AND qro.needs_human_review = 0
		       ORDER BY CASE qro.provenance
		         WHEN 'manual' THEN 0 WHEN 'pdf-geometry' THEN 1
		         WHEN 'vision-extracted' THEN 2 ELSE 3 END,
		         qro.overlay_version DESC
		       LIMIT 1) AS response_kind,
		     (SELECT json_group_array(json_object(
		               'id', qa.id,
		               'publicPath', qa.public_path,
		               'role', qa.role,
		               'sourceLabel', qa.source_label,
		               'altText', qa.alt_text,
		               'required', qa.required
		             ))
		        FROM question_assets qa
		       WHERE qa.question_id = q.id
		         AND qa.needs_human_review = 0
		         AND COALESCE(TRIM(qa.public_path), '') <> '') AS reviewed_source_assets_json,
		     (SELECT qro.render_json
		        FROM question_rendering_overlays qro
		       WHERE qro.question_id = q.id
		         AND qro.needs_human_review = 0
		       ORDER BY CASE qro.provenance
		         WHEN 'manual' THEN 0 WHEN 'pdf-geometry' THEN 1
		         WHEN 'vision-extracted' THEN 2 ELSE 3 END,
		         qro.overlay_version DESC
		       LIMIT 1) AS reviewed_render_json,
		     qac.answer_chain_id, ac.title AS chain_title,
		     qac.transfer_distance, COALESCE(qac.fit_confidence, 0) AS fit_confidence,
		     CASE qac.transfer_distance
		       WHEN 'start' THEN 0 WHEN 'near' THEN 1 WHEN 'stretch' THEN 2
		       WHEN 'exam_transfer' THEN 3 ELSE 4
		     END AS transfer_order
		   FROM questions q
		   JOIN question_answer_chains qac
		     ON qac.question_id = q.id AND qac.is_primary = 1
		   JOIN answer_chains ac ON ac.id = qac.answer_chain_id
		   WHERE q.status = 'published'
		     AND q.needs_human_review = 0
		     AND qac.needs_human_review = 0
		     AND ac.status = 'published'
		     AND ac.needs_human_review = 0
		     AND (q.subject_area = ? OR q.subject = ?)
		     AND (q.board IS NULL OR LOWER(q.board) = LOWER(?))
		     AND (q.qualification IS NULL OR LOWER(q.qualification) = LOWER(?))
		     AND (
		       ? = 'GCSE Subject'
		       OR (
		         ? = 'Combined Science'
		         AND (
		           LOWER(COALESCE(q.subject, '')) LIKE '%combined science%'
		           OR LOWER(COALESCE(q.component_code, '')) LIKE '8464%'
		         )
		       )
		       OR (
		         ? = 'Separate Science'
		         AND LOWER(COALESCE(q.subject, '')) NOT LIKE '%combined science%'
		         AND LOWER(COALESCE(q.component_code, '')) NOT LIKE '8464%'
		       )
		     )
		     AND (
		       q.tier IS NULL OR q.tier = '' OR LOWER(q.tier) = LOWER(?)
		       OR LOWER(q.tier) LIKE '%foundation and higher%'
		       OR LOWER(q.tier) LIKE '%higher and foundation%'
		       OR LOWER(q.tier) LIKE '%both%'
		     )
		   ORDER BY transfer_order, fit_confidence DESC, q.id
		   LIMIT ?
		 ),
		 mapped_ancestors(
		   question_id, component_id, parent_id, selectable, depth
		 ) AS (
		   SELECT qcc.question_id, cc.id, cc.parent_id, cc.selectable, cc.depth
		   FROM question_curriculum_components qcc
		   JOIN curriculum_components cc ON cc.id = qcc.curriculum_component_id
		   JOIN candidate_questions candidate ON candidate.id = qcc.question_id
		   WHERE qcc.specification_id = ?
		     AND qcc.is_primary = 1
		     AND qcc.reviewed = 1
		   UNION ALL
		   SELECT child.question_id, parent.id, parent.parent_id, parent.selectable, parent.depth
		   FROM mapped_ancestors child
		   JOIN curriculum_components parent ON parent.id = child.parent_id
		 ),
		 selectable_mappings AS (
		   SELECT question_id, component_id
		   FROM (
		     SELECT question_id, component_id,
		            ROW_NUMBER() OVER (
		              PARTITION BY question_id
		              ORDER BY depth DESC, component_id
		            ) AS mapping_rank
		     FROM mapped_ancestors
		     WHERE selectable = 1
		   )
		   WHERE mapping_rank = 1
		 )
		 SELECT
		   candidate.id, candidate.subject, candidate.prompt_text, candidate.self_contained_prompt_text,
		   candidate.context_text, candidate.self_containment_json,
		   candidate.reviewed_source_assets_json, candidate.reviewed_render_json,
		   candidate.metadata_json, candidate.source_question_ref, candidate.marks,
		   candidate.answer_format, candidate.response_kind, candidate.paper,
		   candidate.topic_path_json, candidate.spec_ref, candidate.reviewed_answer_text,
		   sm.component_id AS curriculum_component_id,
		   candidate.answer_chain_id, candidate.chain_title, candidate.transfer_distance,
		   (SELECT COUNT(*)
		      FROM answer_chain_steps acs
		      WHERE acs.answer_chain_id = candidate.answer_chain_id) AS step_count
		 FROM candidate_questions candidate
		 LEFT JOIN selectable_mappings sm ON sm.question_id = candidate.id
		 WHERE (
		   ? = 'all'
		   OR sm.component_id IS NULL
		   OR sm.component_id IN (SELECT value FROM json_each(?))
		 )
		 ORDER BY candidate.transfer_order, candidate.fit_confidence DESC, candidate.id
		 LIMIT ?`,
		[
			subject.subject,
			subject.subject,
			subject.board,
			subject.qualification,
			subject.course,
			subject.course,
			subject.course,
			subject.tier,
			scope.status === 'selected' ? -1 : 160,
			specificationId ?? '',
			scope.status,
			JSON.stringify(scope.includedTopicIds),
			scope.status === 'selected' ? 600 : 160
		]
	);
}

function stateForTopic(
	topic: StemCurriculumTopic,
	states: ComponentStateRow[]
): Pick<ComponentStateRow, 'state' | 'uncertainty' | 'evidence_count'> | null {
	const now = Date.now();
	const components = states
		.filter(
			(row) => row.component_kind !== 'curriculum_topic' && row.curriculum_component_id === topic.id
		)
		.map((row) => ({
			...row,
			state:
				row.state === 'secure' && row.next_check_at && Date.parse(row.next_check_at) <= now
					? ('due' as const)
					: row.state
		}));
	if (components.length === 0) return null;
	const evidenceCount = components.reduce((total, row) => total + row.evidence_count, 0);
	if (components.some((row) => row.state === 'conflicting')) {
		return { state: 'conflicting', uncertainty: 'high', evidence_count: evidenceCount };
	}
	if (components.some((row) => row.state === 'due')) {
		return { state: 'due', uncertainty: 'high', evidence_count: evidenceCount };
	}
	const secureComponents = components.filter((row) => row.state === 'secure');
	const developingComponents = components.filter((row) => row.state === 'developing');
	if (secureComponents.length >= 3 && developingComponents.length === 0) {
		return {
			state: 'secure',
			uncertainty: secureComponents.every((row) => row.uncertainty === 'low') ? 'low' : 'medium',
			evidence_count: evidenceCount
		};
	}
	return {
		state: 'developing',
		uncertainty: components.some((row) => row.uncertainty === 'high') ? 'high' : 'medium',
		evidence_count: evidenceCount
	};
}

function learnerFacingState(state: LearnerState | null): LearnerFacingState {
	return state === 'no_evidence' || state === null ? 'not_checked' : state;
}

function stateLabel(state: LearnerFacingState): string {
	if (state === 'not_checked') return 'Not practised yet';
	if (state === 'developing') return 'Practised';
	if (state === 'secure') return 'Looks secure';
	if (state === 'due') return 'Review due';
	return 'Needs a check';
}

function topicProgress(
	topics: StemCurriculumTopic[],
	scope: CurriculumScopeView,
	bundle: SubjectEvidenceBundle,
	subject: RecallRuntimeSubject | null
): CurriculumTopicProgressView[] {
	const included = new Set(scope.includedTopicIds);
	const topicEvidenceCounts = new Map(
		bundle.topicEvidence.map((row) => [row.curriculum_component_id, row.evidence_count])
	);
	const now = Date.now();
	return topics.map((topic) => {
		const stateRow = stateForTopic(topic, bundle.states);
		const staticRecallTopic = subject ? recallTopicForOfficialTopic(subject, topic) : null;
		const cardTopicIds = new Set(
			bundle.recallCards
				.filter(
					(card) =>
						card.topicComponentId === topic.id ||
						(Boolean(staticRecallTopic) && card.topicId === staticRecallTopic?.id)
				)
				.map((card) => card.topicId)
		);
		const dueCount = bundle.reviews.filter(
			(review) => cardTopicIds.has(review.topic_id) && Date.parse(review.due_at) <= now
		).length;
		const state = learnerFacingState(dueCount > 0 ? 'due' : (stateRow?.state ?? null));
		return {
			id: topic.id,
			code: topic.code,
			title: topic.title,
			paper: topic.paper,
			included: included.has(topic.id),
			state,
			stateLabel: stateLabel(state),
			evidenceCount: topicEvidenceCounts.get(topic.id) ?? 0,
			dueCount
		};
	});
}

function questionTitle(row: QuestionCandidateRow): string {
	return storedQuestionTitle({
		id: row.id,
		subject: row.subject,
		metadataJson: row.metadata_json,
		promptText: row.prompt_text,
		selfContainedPromptText: row.self_contained_prompt_text,
		topicPathJson: row.topic_path_json
	});
}

function recommendedPracticeHref(subject: string, questionId: string): string {
	const params = new URLSearchParams({
		entry: 'recommended',
		returnTo: learnerSubjectHref(subject)
	});
	return `/questions/${encodeURIComponent(questionId)}/practice?${params.toString()}`;
}

function directRecallAction(
	subject: RecallRuntimeSubject,
	topic: StemCurriculumTopic,
	cards: RecallCard[],
	curriculumOrder: number,
	dueCount: number,
	state: LearnerState,
	uncertainty: LearnerUncertainty
): CandidateDetail | null {
	const staticRecallTopic = recallTopicForOfficialTopic(subject, topic);
	const topicId = cards.some((card) => card.topicComponentId === topic.id)
		? topic.id
		: staticRecallTopic?.id;
	if (!topicId) return null;
	const cardCount = cards.filter(
		(card) => card.topicComponentId === topic.id || card.topicId === topicId
	).length;
	if (cardCount === 0) return null;
	const size = Math.min(8, cardCount);
	const baseHref = recallSessionHref({
		subject,
		activity: 'flashcards',
		topic: topicId,
		size,
		returnTo: learnerSubjectHref(subject)
	});
	const href = `${baseHref}&mode=mixed`;
	return {
		candidate: {
			id: `recall:${topic.id}`,
			subject,
			kind: 'recall',
			curriculumComponentId: topic.id,
			componentId: topicId,
			state,
			uncertainty,
			estimatedMinutes: Math.max(4, Math.min(8, size)),
			available: true,
			dueAt: dueCount > 0 ? new Date(0).toISOString() : null,
			curriculumOrder
		},
		action: {
			id: `recall:${topic.id}`,
			kind: 'recall',
			eyebrow: dueCount > 0 ? 'Recall due' : 'Quick recall',
			title: `${topic.title} recall`,
			detail: `${size} short prompts, mixed automatically.`,
			reason:
				dueCount > 0
					? `${dueCount} ${dueCount === 1 ? 'item is' : 'items are'} ready for another check.`
					: state === 'no_evidence'
						? 'You haven’t practised this chapter here yet.'
						: 'A short mixed set keeps the key facts easy to retrieve.',
			durationMinutes: Math.max(4, Math.min(8, size)),
			href,
			available: true
		}
	};
}

function gapCandidate(
	subject: string,
	gap: GapRow,
	topic: StemCurriculumTopic,
	state: LearnerState,
	uncertainty: LearnerUncertainty
): CandidateDetail {
	return {
		candidate: {
			id: `gap:${gap.id}`,
			subject,
			kind: 'close_gap',
			curriculumComponentId: topic.id,
			componentId: gap.chain_step_id,
			state,
			uncertainty,
			estimatedMinutes: 7,
			available: gap.distinct_item_count >= 2,
			activeGap: gap.distinct_item_count >= 2,
			lastPractisedAt: gap.updated_at
		},
		action: {
			id: `gap:${gap.id}`,
			kind: 'close_gap',
			eyebrow: 'Close a knowledge gap',
			title: `Make “${gap.step_text}” explicit`,
			detail: `Rebuild the missing link, then use it in a fresh answer.`,
			reason: `This link was missing in ${gap.distinct_item_count} different checked questions.`,
			durationMinutes: 7,
			href: `/gaps/${encodeURIComponent(gap.id)}`,
			available: gap.distinct_item_count >= 2
		}
	};
}

function questionCandidate(
	subject: string,
	row: QuestionCandidateRow,
	title: string,
	topic: StemCurriculumTopic | null,
	hasUsedChain: boolean,
	pendingIndependentCheck: boolean,
	contentOrder: number,
	state: LearnerState,
	uncertainty: LearnerUncertainty
): CandidateDetail {
	return {
		candidate: {
			id: `apply:${row.id}`,
			subject,
			kind: 'apply_chain',
			curriculumComponentId: topic?.id ?? `${subject.toLowerCase()}-course`,
			componentId: row.answer_chain_id,
			state,
			uncertainty,
			estimatedMinutes: row.marks && row.marks >= 6 ? 10 : 7,
			available: (row.marks ?? 0) >= 4 && row.step_count >= 3,
			activeGap: pendingIndependentCheck,
			lastPractisedAt: null,
			curriculumOrder: contentOrder
		},
		action: {
			id: `apply:${row.id}`,
			kind: 'apply_chain',
			eyebrow: 'Practise exam reasoning',
			title,
			detail: `${row.marks ?? 4}-mark question · build the links, then check them.`,
			reason: pendingIndependentCheck
				? 'Try the same missing link in a fresh question, without the guided steps.'
				: hasUsedChain
					? 'Use a method you have seen before in a different context.'
					: 'This question has a reusable answer method worth practising.',
			durationMinutes: row.marks && row.marks >= 6 ? 10 : 7,
			href: recommendedPracticeHref(subject, row.id),
			available: (row.marks ?? 0) >= 4 && row.step_count >= 3
		}
	};
}

function quickQuestionCandidate(
	subject: string,
	row: QuestionCandidateRow,
	title: string,
	topic: StemCurriculumTopic | null,
	contentOrder: number,
	state: LearnerState,
	uncertainty: LearnerUncertainty
): CandidateDetail {
	const marks = Math.max(1, row.marks ?? 1);
	return {
		candidate: {
			id: `quick:${row.id}`,
			subject,
			kind: 'recall',
			curriculumComponentId: topic?.id ?? `${subject.toLowerCase()}-course`,
			componentId: row.answer_chain_id,
			state,
			uncertainty,
			estimatedMinutes: Math.min(5, marks + 2),
			available: marks <= 3,
			curriculumOrder: contentOrder
		},
		action: {
			id: `quick:${row.id}`,
			kind: 'recall',
			eyebrow: 'Quick exam check',
			title,
			detail: `${marks}-mark question · answer from memory, then check it.`,
			reason:
				state === 'due'
					? 'A short written answer will check whether this still comes back without prompts.'
					: 'Writing a short answer checks more than recognising an option.',
			durationMinutes: Math.min(5, marks + 2),
			href: recommendedPracticeHref(subject, row.id),
			available: marks <= 3
		}
	};
}

export function supportsTextPracticeRecommendation(
	question: Pick<
		QuestionCandidateRow,
		| 'subject'
		| 'answer_format'
		| 'prompt_text'
		| 'self_contained_prompt_text'
		| 'context_text'
		| 'self_containment_json'
		| 'reviewed_source_assets_json'
		| 'reviewed_render_json'
	> & { response_kind?: string | null }
): boolean {
	if (/english/i.test(question.subject ?? '')) {
		return englishPracticeEligibility({
			subject: question.subject,
			prompt: question.prompt_text,
			context: question.context_text,
			selfContainedPrompt: question.self_contained_prompt_text,
			selfContainmentJson: question.self_containment_json,
			assets: parseJson<EnglishSourceAssetEvidence[]>(question.reviewed_source_assets_json, []),
			renderingOverlay: parseJson<unknown>(question.reviewed_render_json, null),
			reviewed: true
		}).available;
	}
	const prompt = `${question.prompt_text}\n${question.self_contained_prompt_text ?? ''}`;
	return supportsLearnerPracticeInput({
		answerFormat: question.answer_format,
		prompt,
		responseKind: question.response_kind
	});
}

function emptyAlternative(
	kind: LearningActionView['kind'],
	title: string,
	detail: string,
	reason: string,
	href: string
): LearningActionView {
	return {
		id: `unavailable:${kind}`,
		kind,
		eyebrow: '',
		title,
		detail,
		reason,
		durationMinutes: null,
		href,
		available: false
	};
}

function chooseCandidateDetails(
	subject: LearnerSubject,
	scope: CurriculumScopeView,
	topics: StemCurriculumTopic[],
	topicViews: CurriculumTopicProgressView[],
	bundle: SubjectEvidenceBundle,
	questions: QuestionCandidateRow[]
): {
	selected: LearningActionView | null;
	alternatives: LearningActionView[];
	details: CandidateDetail[];
	rankedIds: string[];
} {
	const includedIds = new Set(scope.includedTopicIds);
	const details: CandidateDetail[] = [];
	const recallSubject = supportedLearnerSubjects.includes(subject.subject as RecallRuntimeSubject)
		? (subject.subject as RecallRuntimeSubject)
		: null;
	const scienceSubject = isScienceLearnerSubject(subject.subject)
		? (subject.subject as RecallSubject)
		: null;
	if (recallSubject) {
		for (const topic of topics.filter((entry) => includedIds.has(entry.id))) {
			const topicView = topicViews.find((entry) => entry.id === topic.id);
			const stateRow = stateForTopic(topic, bundle.states);
			const detail = directRecallAction(
				recallSubject,
				topic,
				bundle.recallCards,
				topics.findIndex((entry) => entry.id === topic.id),
				topicView?.dueCount ?? 0,
				topicView?.state === 'due' ? 'due' : (stateRow?.state ?? 'no_evidence'),
				stateRow?.uncertainty ?? 'high'
			);
			if (detail) details.push(detail);
		}
	}

	for (const gap of bundle.gaps) {
		if (!scienceSubject) continue;
		if (gap.status !== 'active') continue;
		const topic = officialTopicForQuestion(topics, gap);
		if (!topic || !includedIds.has(topic.id)) continue;
		const stateRow =
			bundle.states.find(
				(row) => row.component_kind === 'chain_step' && row.component_id === gap.chain_step_id
			) ?? stateForTopic(topic, bundle.states);
		details.push(
			gapCandidate(
				subject.subject,
				gap,
				topic,
				stateRow?.state ?? 'developing',
				stateRow?.uncertainty ?? 'high'
			)
		);
	}

	const attemptedIds = new Set(bundle.attempts.map((attempt) => attempt.question_id));
	const attemptedChains = new Set(
		bundle.attempts.map((attempt) => attempt.answer_chain_id).filter(Boolean)
	);
	const chainsAwaitingIndependentCheck = new Set(
		bundle.gaps.filter((gap) => gap.status === 'awaiting_check').map((gap) => gap.answer_chain_id)
	);
	for (const [contentOrder, question] of questions.entries()) {
		if (attemptedIds.has(question.id)) continue;
		const title = questionTitle(question);
		if (
			storedQuestionTitleIssues({
				title,
				subject: question.subject,
				promptText: question.prompt_text,
				selfContainedPromptText: question.self_contained_prompt_text,
				answerText: question.reviewed_answer_text
			}).length > 0
		) {
			continue;
		}
		const topic = topics.length > 0 ? officialTopicForQuestion(topics, question) : null;
		if (
			topics.length > 0 &&
			((topic && !includedIds.has(topic.id)) || (!topic && scope.status !== 'all'))
		) {
			continue;
		}
		const stateRow =
			bundle.states.find(
				(row) =>
					row.component_kind === 'answer_chain' && row.component_id === question.answer_chain_id
			) ?? (topic ? stateForTopic(topic, bundle.states) : null);
		const state = stateRow?.state ?? 'no_evidence';
		const uncertainty = stateRow?.uncertainty ?? 'high';
		if ((question.marks ?? 0) >= 1 && (question.marks ?? 0) <= 3) {
			if (supportsTextPracticeRecommendation(question)) {
				details.push(
					quickQuestionCandidate(
						subject.subject,
						question,
						title,
						topic,
						contentOrder,
						state,
						uncertainty
					)
				);
			}
			continue;
		}
		if (!supportsTextPracticeRecommendation(question)) continue;
		details.push(
			questionCandidate(
				subject.subject,
				question,
				title,
				topic,
				attemptedChains.has(question.answer_chain_id),
				chainsAwaitingIndependentCheck.has(question.answer_chain_id),
				contentOrder,
				state,
				uncertainty
			)
		);
	}

	const ranked = rankCandidateActions(
		details.map((detail) => detail.candidate),
		{
			subject: subject.subject,
			scopeComponentIds:
				topics.length > 0 && scope.status !== 'all' ? scope.includedTopicIds : undefined,
			maxMinutes: 12
		}
	);
	const detailById = new Map(details.map((detail) => [detail.candidate.id, detail]));
	const selected =
		ranked.length > 0 ? (detailById.get(ranked[0].candidate.id)?.action ?? null) : null;

	const firstByKind = new Map<LearningActionCandidate['kind'], LearningActionView>();
	let directRecallAlternative: LearningActionView | null = null;
	let directQuickAlternative: LearningActionView | null = null;
	for (const rankedAction of ranked) {
		const action = detailById.get(rankedAction.candidate.id)?.action;
		if (!directRecallAlternative && rankedAction.candidate.id.startsWith('recall:') && action) {
			directRecallAlternative = action;
		}
		if (!directQuickAlternative && rankedAction.candidate.id.startsWith('quick:') && action) {
			directQuickAlternative = action;
		}
		if (action && !firstByKind.has(rankedAction.candidate.kind)) {
			firstByKind.set(rankedAction.candidate.kind, action);
		}
	}

	const alternatives: LearningActionView[] = [
		directRecallAlternative ??
			emptyAlternative(
				'recall',
				'Study cards',
				'Flashcards, multiple choice, and true or false from the standard deck.',
				recallSubject
					? `No recall items match the selected ${scope.unitPlural} yet.`
					: 'Recall sets are not available for this course yet.',
				learnerSubjectHref(subject.subject)
			),
		directQuickAlternative ??
			emptyAlternative(
				'recall',
				'1–3 mark questions',
				'Write a short exam answer from memory, then check it.',
				'No suitable reviewed short question matches this course scope yet.',
				scope.href ?? learnerSubjectHref(subject.subject)
			),
		firstByKind.get('close_gap') ??
			emptyAlternative(
				'close_gap',
				'Close a gap',
				'Rebuild one missing idea and check it in a fresh answer.',
				'No repeated knowledge gap is confirmed yet.',
				learnerSubjectHref(subject.subject)
			),
		firstByKind.get('apply_chain') ??
			emptyAlternative(
				'apply_chain',
				'Longer questions',
				'Practise a 4–6 mark answer method in a new context.',
				'No suitable reviewed question matches this scope yet.',
				scope.href ?? learnerSubjectHref(subject.subject)
			)
	];

	return {
		selected,
		alternatives,
		details,
		rankedIds: ranked.map((entry) => entry.candidate.id)
	};
}

async function readCurrentRecommendation(
	userId: string,
	subject: string
): Promise<RecommendationDecisionRow | null> {
	return await queryPersonalFirst<RecommendationDecisionRow>(
		`SELECT id, selected_action_id, reason_text, decision_source, valid_until,
		        curriculum_scope_snapshot_json, learner_state_snapshot_json,
		        candidate_actions_json
		 FROM user_recommendation_decisions
		 WHERE user_id = ? AND subject = ?
		   AND dismissed_at IS NULL
		   AND acted_at IS NULL
		   AND (valid_until IS NULL OR valid_until > CURRENT_TIMESTAMP)
		 ORDER BY CASE decision_source WHEN 'llm' THEN 0 ELSE 1 END, created_at DESC
		 LIMIT 1`,
		[userId, subject]
	);
}

function recommendationSnapshots(
	scope: CurriculumScopeView,
	topicViews: CurriculumTopicProgressView[],
	candidateResult: ReturnType<typeof chooseCandidateDetails>
): Pick<
	RecommendationDecisionRow,
	'curriculum_scope_snapshot_json' | 'learner_state_snapshot_json' | 'candidate_actions_json'
> {
	return {
		curriculum_scope_snapshot_json: JSON.stringify(scope),
		learner_state_snapshot_json: JSON.stringify(
			topicViews
				.filter((topic) => topic.included)
				.map((topic) => ({
					id: topic.id,
					state: topic.state,
					evidenceCount: topic.evidenceCount,
					dueCount: topic.dueCount
				}))
		),
		candidate_actions_json: JSON.stringify(
			candidateResult.details.map((detail) => ({
				...detail.candidate,
				title: detail.action.title,
				detail: detail.action.detail,
				route: detail.action.href
			}))
		)
	};
}

function recommendationMatchesCurrentState(
	recommendation: RecommendationDecisionRow,
	snapshots: ReturnType<typeof recommendationSnapshots>
): boolean {
	return (
		recommendation.curriculum_scope_snapshot_json === snapshots.curriculum_scope_snapshot_json &&
		recommendation.learner_state_snapshot_json === snapshots.learner_state_snapshot_json &&
		recommendation.candidate_actions_json === snapshots.candidate_actions_json
	);
}

async function storeRecommendationDecision({
	userId,
	subject,
	scope,
	topicViews,
	candidateResult,
	selected,
	reason,
	source,
	modelRunId
}: {
	userId: string;
	subject: LearnerSubject;
	scope: CurriculumScopeView;
	topicViews: CurriculumTopicProgressView[];
	candidateResult: ReturnType<typeof chooseCandidateDetails>;
	selected: CandidateDetail;
	reason: string;
	source: 'rules' | 'llm';
	modelRunId?: string | null;
}): Promise<void> {
	const validUntil = new Date(Date.now() + 24 * 60 * 60 * 1000)
		.toISOString()
		.slice(0, 19)
		.replace('T', ' ');
	const snapshots = recommendationSnapshots(scope, topicViews, candidateResult);
	await executePersonalQuery(
		`INSERT INTO user_recommendation_decisions (
		   id, user_id, subject, board, qualification,
		   curriculum_scope_snapshot_json, learner_state_snapshot_json,
		   candidate_actions_json, selected_action_id, selected_action_kind,
		   selected_component_kind, selected_component_id,
		   selected_curriculum_component_id, selected_route,
		   reason_code, reason_text, decision_source, algorithm_version,
		   model_run_id, valid_until
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			`recommendation_${crypto.randomUUID().replace(/-/g, '')}`,
			userId,
			subject.subject,
			subject.board,
			subject.qualification,
			snapshots.curriculum_scope_snapshot_json,
			snapshots.learner_state_snapshot_json,
			snapshots.candidate_actions_json,
			selected.candidate.id,
			selected.candidate.kind,
			selected.candidate.kind === 'apply_chain' ? 'answer_chain' : selected.candidate.kind,
			selected.candidate.componentId,
			selected.candidate.curriculumComponentId,
			selected.action.href,
			source === 'llm' ? 'llm_ranked_eligible_candidates' : 'deterministic_ranked_candidate',
			reason,
			source,
			'next-action-v1',
			modelRunId ?? null,
			validUntil
		]
	);
}

function scopeSetupAction(
	subject: LearnerSubject,
	scope: CurriculumScopeView,
	profileCourseConfiguration: ProfileCourseConfiguration | null
): LearningActionView {
	if (profileCourseConfiguration) {
		const { selectedCount, totalCount } = profileCourseConfiguration;
		return {
			id: `scope:${subject.subject}`,
			kind: 'scope',
			eyebrow: 'Set what your class studies',
			title:
				selectedCount > 0
					? 'Finish your English Literature course texts'
					: 'Choose your English Literature course texts',
			detail: `${selectedCount} of ${totalCount} selected. Practice will only use those choices.`,
			reason: 'Only questions for the options your class studies will appear.',
			durationMinutes: null,
			href: scope.href ?? profileAnchorHref('/profile', ENGLISH_LITERATURE_COURSE_TEXTS_ANCHOR),
			available: true
		};
	}
	return {
		id: `scope:${subject.subject}`,
		kind: 'scope',
		eyebrow: 'Set what you have covered',
		title: `Choose your ${subject.subject} ${scope.unitPlural}`,
		detail: 'Practice will only use official topics you include.',
		reason: 'This prevents untaught material from appearing as a weakness.',
		durationMinutes: null,
		href: learnerSubjectScopeHref(subject.subject),
		available: true
	};
}

function fallbackSubjectAction(
	subject: LearnerSubject,
	scope: CurriculumScopeView
): LearningActionView {
	const canExpandSelection = scope.status === 'selected' && scope.includedCount < scope.totalCount;
	return {
		id: `scope-adjust:${subject.subject}`,
		kind: 'scope',
		eyebrow: 'Course coverage',
		title: `Review your ${scope.unitPlural}`,
		detail: canExpandSelection
			? `No reviewed question matches this selection. Add more only if your class has covered it.`
			: `No reviewed question currently matches these ${scope.unitPlural}. Check that the selection is accurate.`,
		reason: 'Suggested questions always stay inside the official course content you include.',
		durationMinutes: null,
		href: scope.href ?? profileAnchorHref('/profile', profileSubjectAnchor(subject.subject)),
		available: true
	};
}

function ocrEnglishLiteraturePracticeAction(): LearningActionView {
	return {
		id: 'english-literature:choose-question',
		kind: 'subject',
		eyebrow: 'Next',
		title: 'Choose an essay question',
		detail: 'Questions for your four course texts, grouped by the task format in each paper.',
		reason: 'Only questions for the texts and poetry cluster selected in your profile are shown.',
		durationMinutes: null,
		href: '/english-literature',
		available: true
	};
}

function unavailableFoundationAction(): LearningActionView {
	return {
		id: 'foundation-not-ready',
		kind: 'subject',
		eyebrow: 'Course availability',
		title: 'Foundation questions are not available yet',
		detail: 'The current reviewed science question and recall bank is Higher tier only.',
		reason: 'We will not show Higher-only material to a Foundation learner.',
		durationMinutes: null,
		href: '/profile',
		available: false
	};
}

async function buildSubjectView(
	userId: string,
	subject: LearnerSubject,
	englishLiteratureSelections?: EnglishLiteratureSelections
): Promise<SignedInSubjectView> {
	const curriculum = await curriculumForLearnerSubject(subject);
	const topics = curriculum?.topics ?? [];
	const usesProfileCourseConfiguration = isOcrEnglishLiterature(subject);
	const [scopeRow, bundle] = await Promise.all([
		usesProfileCourseConfiguration
			? Promise.resolve(null)
			: readCurriculumScope(userId, subject.subject),
		readSubjectEvidence(userId, subject)
	]);
	const currentScopeRow =
		scopeRow &&
		scopeRow.board === subject.board &&
		scopeRow.qualification === subject.qualification &&
		scopeRow.course === subject.course &&
		scopeRow.tier === subject.tier &&
		scopeRow.specification_code === curriculum?.specificationCode &&
		scopeRow.specification_version === curriculum?.specificationVersion
			? scopeRow
			: null;
	const profileCourseScope = ocrEnglishLiteratureScope(
		subject,
		englishLiteratureSelections,
		topics
	);
	const scope =
		profileCourseScope?.scope ??
		scopeView(subject.subject, currentScopeRow, topics, curriculum?.groups ?? []);
	const foundationQuestionsUnavailable =
		isScienceLearnerSubject(subject.subject) && subject.tier === 'Foundation';
	const questions =
		curriculum &&
		scope.status !== 'not_set' &&
		scope.status !== 'not_available' &&
		!usesProfileCourseConfiguration &&
		!foundationQuestionsUnavailable
			? await readQuestionCandidates(subject, curriculum.specificationId, scope)
			: [];
	const topicViews = topicProgress(
		topics,
		scope,
		bundle,
		supportedLearnerSubjects.includes(subject.subject as RecallRuntimeSubject)
			? (subject.subject as RecallRuntimeSubject)
			: null
	);
	const candidateResult = chooseCandidateDetails(
		subject,
		scope,
		topics,
		topicViews,
		bundle,
		questions
	);
	let recommendedAction = candidateResult.selected;
	if (scope.status !== 'not_set' && recommendedAction) {
		const cached = await readCurrentRecommendation(userId, subject.subject);
		const snapshots = recommendationSnapshots(scope, topicViews, candidateResult);
		const detailById = new Map(
			candidateResult.details
				.filter((detail) => detail.candidate.available !== false)
				.map((detail) => [detail.candidate.id, detail] as const)
		);
		const cachedDetail = cached ? detailById.get(cached.selected_action_id) : null;
		const cachedIsCurrent = cached ? recommendationMatchesCurrentState(cached, snapshots) : false;
		if (cached && (!cachedDetail || !cachedIsCurrent)) {
			await executePersonalQuery(
				`UPDATE user_recommendation_decisions
				 SET dismissed_at = CURRENT_TIMESTAMP
				 WHERE user_id = ? AND subject = ?
				   AND dismissed_at IS NULL AND acted_at IS NULL`,
				[userId, subject.subject]
			);
		}
		if (cached && cachedDetail && cachedIsCurrent) {
			recommendedAction = { ...cachedDetail.action, reason: cached.reason_text };
		} else {
			const selectedDetail = detailById.get(recommendedAction.id);
			if (selectedDetail) {
				await storeRecommendationDecision({
					userId,
					subject,
					scope,
					topicViews,
					candidateResult,
					selected: selectedDetail,
					reason: selectedDetail.action.reason,
					source: 'rules'
				});
			}
		}
	}
	const includedTopicViews = topicViews.filter((topic) => topic.included);
	const includedTopicIds = new Set(scope.includedTopicIds);
	const scopedRecallSubject = supportedLearnerSubjects.includes(
		subject.subject as RecallRuntimeSubject
	)
		? (subject.subject as RecallRuntimeSubject)
		: null;
	const scopedAttempts =
		topics.length === 0
			? bundle.attempts
			: bundle.attempts.filter((attempt) => {
					const topic = officialTopicForQuestion(topics, attempt);
					return Boolean(topic && includedTopicIds.has(topic.id));
				});
	const scopedReviews =
		topics.length === 0 || !scopedRecallSubject
			? bundle.reviews
			: bundle.reviews.filter((review) => {
					const card = bundle.recallCards.find((candidate) => candidate.id === review.card_id);
					const topic = card
						? topics.find((candidate) => candidate.id === card.topicComponentId)
						: officialTopicForRecallTopic(scopedRecallSubject, review.topic_id, topics);
					return Boolean(topic && includedTopicIds.has(topic.id));
				});
	const scopedRecallCheckCount = scopedReviews.reduce(
		(total, review) => total + review.seen_count,
		0
	);
	const coverageCount = includedTopicViews.filter((topic) => topic.state !== 'not_checked').length;
	const secureCount = includedTopicViews.filter((topic) => topic.state === 'secure').length;
	const dueCardCount = includedTopicViews.reduce((sum, topic) => sum + topic.dueCount, 0);
	const examAnswerCount = scopedAttempts.filter((attempt) => attempt.max_marks >= 3).length;
	const total = scope.status === 'not_available' ? 0 : scope.includedCount;
	const independentAttempts = scopedAttempts.filter((attempt) => attempt.independent === 1);
	const independentlyObservedTopicIds = new Set(
		independentAttempts.flatMap((attempt) => {
			const topic = officialTopicForQuestion(topics, attempt);
			return topic && includedTopicIds.has(topic.id) ? [topic.id] : [];
		})
	);
	const checkedAnswerPerformance = deriveCheckedAnswerPerformance({
		attempts: independentAttempts.map((attempt) => ({
			questionId: attempt.question_id,
			awardedMarks: attempt.awarded_marks,
			maxMarks: attempt.max_marks
		})),
		observedTopicCount: independentlyObservedTopicIds.size,
		includedTopicCount: total,
		offeringId: curriculum?.id ?? null
	});
	const englishLiteratureCourseIsComplete =
		usesProfileCourseConfiguration &&
		profileCourseScope?.configuration.selectedCount ===
			profileCourseScope?.configuration.totalCount;
	const nextAction = englishLiteratureCourseIsComplete
		? ocrEnglishLiteraturePracticeAction()
		: foundationQuestionsUnavailable && !recommendedAction
			? unavailableFoundationAction()
			: scope.status === 'not_set'
				? scopeSetupAction(subject, scope, profileCourseScope?.configuration ?? null)
				: (recommendedAction ?? fallbackSubjectAction(subject, scope));
	const coverageLabel =
		scope.status === 'not_set'
			? `Choose ${scope.unitPlural} to begin`
			: total > 0
				? `Practised ${coverageCount} of ${total} ${scope.unitPlural}`
				: `${examAnswerCount} checked answers`;
	const evidenceLabel =
		scope.status === 'not_set'
			? 'Untaught chapters will stay out of your progress.'
			: scopedAttempts.length + scopedRecallCheckCount === 0
				? 'Nothing checked yet'
				: `${scopedAttempts.length} exam ${scopedAttempts.length === 1 ? 'answer' : 'answers'} · ${scopedRecallCheckCount} recall ${scopedRecallCheckCount === 1 ? 'check' : 'checks'}`;

	return {
		subject: subject.subject,
		slug: learnerSubjectHref(subject.subject).split('/').at(-1) ?? '',
		href: usesProfileCourseConfiguration
			? '/english-literature'
			: learnerSubjectHref(subject.subject),
		board: subject.board,
		qualification: subject.qualification,
		course: subject.course,
		tier: subject.tier,
		courseLabel: courseLabel(subject),
		scope,
		progress: {
			coverageCount,
			coverageTotal: total,
			coverageLabel,
			secureCount,
			dueCount: dueCardCount,
			examAnswerCount,
			evidenceLabel,
			checkedAnswerPerformance
		},
		nextAction,
		alternatives: candidateResult.alternatives,
		topics: topicViews,
		specification: {
			code: curriculum?.specificationCode ?? null,
			url: curriculum?.specificationUrl ?? null
		}
	};
}

export async function getSignedInLearningHome(user: AdminUser): Promise<SignedInLearningHome> {
	const settings = await getLearnerProfileSettings(user);
	const enabledSubjects = settings.subjects.filter((subject) => subject.enabled);
	const [builtSubjects, weekly] = await Promise.all([
		Promise.all(
			enabledSubjects.map((subject) =>
				buildSubjectView(user.uid, subject, settings.englishLiteratureSelections)
			)
		),
		queryPersonalFirst<{
			attempt_count: number;
			recall_count: number;
			closed_gap_count: number;
		}>(
			`SELECT
			   (SELECT COUNT(*) FROM user_question_attempts
			     WHERE user_id = ? AND created_at >= datetime('now', '-7 days')) AS attempt_count,
			   (SELECT COUNT(*) FROM user_learning_evidence
			     WHERE user_id = ? AND evidence_kind IN ('flashcard_self_rating', 'multiple_choice', 'true_false')
			       AND component_kind = 'recall_card'
			       AND occurred_at >= datetime('now', '-7 days')) AS recall_count,
			   (SELECT COUNT(*) FROM user_chain_gaps
			     WHERE user_id = ? AND status = 'closed' AND updated_at >= datetime('now', '-7 days')) AS closed_gap_count`,
			[user.uid, user.uid, user.uid]
		)
	]);
	const resumeActions = await getLatestResumeActionsBySubject(
		user.uid,
		enabledSubjects,
		new Map(
			builtSubjects.map((subject) => [
				subject.subject,
				new Set(
					subject.scope.status === 'all' || subject.scope.status === 'selected'
						? subject.scope.includedTopicIds
						: []
				)
			])
		)
	);
	const subjects = builtSubjects.map((subject) => {
		const resumeAction = resumeActions.get(subject.subject);
		if (!resumeAction) return subject;
		const alternatives = [subject.nextAction, ...subject.alternatives].filter(
			(action, index, actions) =>
				action.id !== resumeAction.id &&
				actions.findIndex((candidate) => candidate.id === action.id) === index
		);
		return {
			...subject,
			nextAction: resumeAction,
			alternatives
		};
	});
	return {
		studentName: (user.name ?? '').trim().split(/\s+/)[0] ?? '',
		subjects,
		weeklySummary: {
			attemptCount: weekly?.attempt_count ?? 0,
			recallCount: weekly?.recall_count ?? 0,
			closedGapCount: weekly?.closed_gap_count ?? 0
		}
	};
}

export async function getSignedInSubjectView(
	user: AdminUser,
	subjectName: SupportedLearnerSubject
): Promise<SignedInSubjectView | null> {
	const settings = await getLearnerProfileSettings(user);
	const subject = settings.subjects.find((entry) => entry.enabled && entry.subject === subjectName);
	return subject
		? await buildSubjectView(user.uid, subject, settings.englishLiteratureSelections)
		: null;
}

export async function saveSubjectCurriculumScope(
	user: AdminUser,
	subjectName: SupportedLearnerSubject,
	input: SubjectCurriculumScopeInput
): Promise<void> {
	const settings = await getLearnerProfileSettings(user);
	const learnerSubject = settings.subjects.find(
		(subject) => subject.enabled && subject.subject === subjectName
	);
	if (!learnerSubject) throw new Error('This subject is not enabled in the learner profile.');
	const curriculum = await curriculumForLearnerSubject(learnerSubject);
	if (!curriculum) {
		throw new Error('No imported official specification matches this board and course.');
	}
	const scopeUnit = curriculumScopeUnits(learnerSubject.subject, curriculum.groups).unitSingular;
	const selected = validatedCurriculumScopeSelection(
		input,
		curriculum.topics,
		curriculum.groups,
		scopeUnit
	);
	await executePersonalQuery(
		`INSERT INTO user_subject_curriculum_scopes (
		   user_id, subject, board, qualification, course, tier,
		   specification_code, specification_version, official_source_url,
		   scope_mode, selected_component_ids_json, updated_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id, subject) DO UPDATE SET
		   board = excluded.board,
		   qualification = excluded.qualification,
		   course = excluded.course,
		   tier = excluded.tier,
		   specification_code = excluded.specification_code,
		   specification_version = excluded.specification_version,
		   official_source_url = excluded.official_source_url,
		   scope_mode = excluded.scope_mode,
		   selected_component_ids_json = excluded.selected_component_ids_json,
		   updated_at = CURRENT_TIMESTAMP`,
		[
			user.uid,
			subjectName,
			learnerSubject.board,
			learnerSubject.qualification,
			learnerSubject.course,
			learnerSubject.tier,
			curriculum.specificationCode,
			curriculum.specificationVersion,
			curriculum.specificationUrl,
			input.mode,
			JSON.stringify(selected)
		]
	);
	await executePersonalQuery(
		`UPDATE user_recommendation_decisions
		 SET dismissed_at = CURRENT_TIMESTAMP
		 WHERE user_id = ? AND subject = ? AND dismissed_at IS NULL AND acted_at IS NULL`,
		[user.uid, subjectName]
	);
}

export function validatedCurriculumScopeSelection(
	input: SubjectCurriculumScopeInput,
	topics: Pick<StemCurriculumTopic, 'id'>[],
	groups: {
		kind?: string;
		title: string;
		selectionMin?: number | null;
		selectionMax?: number | null;
		components: { id: string }[];
	}[],
	scopeUnit: string
): string[] {
	if (input.mode === 'all') {
		if (groups.some((group) => group.kind === 'option_group')) {
			throw new CurriculumScopeValidationError('Choose the course options taught by your school.');
		}
		return [];
	}
	const selected = [...new Set(input.selectedTopicIds)];
	const validIds = new Set(topics.map((topic) => topic.id));
	if (selected.some((id) => !validIds.has(id))) {
		throw new CurriculumScopeValidationError(
			`One or more selected ${scopeUnit}s are not in this official specification.`
		);
	}
	if (selected.length === 0) {
		throw new CurriculumScopeValidationError(`Choose at least one ${scopeUnit}.`);
	}
	for (const group of groups) {
		const componentIds = new Set(group.components.map((component) => component.id));
		const selectedInGroup = selected.filter((id) => componentIds.has(id)).length;
		if (group.selectionMin != null && selectedInGroup < group.selectionMin) {
			throw new CurriculumScopeValidationError(
				group.selectionMin === 1
					? `Choose one option from ${group.title}.`
					: `Choose at least ${group.selectionMin} options from ${group.title}.`
			);
		}
		if (group.selectionMax != null && selectedInGroup > group.selectionMax) {
			throw new CurriculumScopeValidationError(
				group.selectionMax === 1
					? `Choose one option from ${group.title}.`
					: `Choose no more than ${group.selectionMax} options from ${group.title}.`
			);
		}
	}
	return selected;
}

type EvidenceWriteInput = {
	id: string;
	user: AdminUser;
	subject: SupportedLearnerSubject;
	board?: string | null;
	qualification?: string | null;
	course?: string | null;
	tier?: string | null;
	topic: StemCurriculumTopic;
	curriculumComponentId?: string;
	componentKind: string;
	componentId: string;
	componentTitle: string;
	evidenceKind: EvidenceKind;
	outcome: EvidenceOutcome;
	independent: boolean;
	sourceItemId: string;
	sourceAttemptId?: string | null;
	sourceSessionId?: string | null;
	responseDurationMs?: number | null;
	questionId?: string | null;
	answerChainId?: string | null;
	awardedMarks?: number | null;
	maxMarks?: number | null;
	metadata?: Record<string, unknown>;
	occurredAt?: string;
};

async function recomputeComponentState(
	userId: string,
	subject: string,
	board: string,
	qualification: string,
	course: string | null,
	tier: string | null,
	topic: StemCurriculumTopic,
	componentKind: string,
	componentId: string,
	componentTitle: string,
	evidenceCurriculumComponentId = topic.id
): Promise<void> {
	const whereComponent =
		componentKind === 'curriculum_topic'
			? "curriculum_component_id = ? AND component_kind != 'chain_step'"
			: 'curriculum_component_id = ? AND component_kind = ? AND component_id = ?';
	const componentParams =
		componentKind === 'curriculum_topic'
			? [evidenceCurriculumComponentId]
			: [evidenceCurriculumComponentId, componentKind, componentId];
	const rows = await queryPersonalRows<{
		id: string;
		evidence_kind: EvidenceKind;
		outcome: EvidenceOutcome;
		occurred_at: string;
		source_item_id: string | null;
		independent: number;
		supersedes_evidence_id: string | null;
	}>(
		`SELECT id, evidence_kind, outcome, occurred_at, source_item_id, independent,
		        supersedes_evidence_id
		 FROM user_learning_evidence
			 WHERE user_id = ? AND subject = ?
			   AND COALESCE(course, '') = COALESCE(?, '')
			   AND COALESCE(tier, '') = COALESCE(?, '')
			   AND ${whereComponent}
			 ORDER BY occurred_at, id`,
		[userId, subject, course, tier, ...componentParams]
	);
	const summary = computeLearnerState(
		rows.map((row) => ({
			id: row.id,
			kind: row.evidence_kind,
			outcome: row.outcome,
			occurredAt: row.occurred_at,
			itemId: row.source_item_id ?? undefined,
			independent: row.independent === 1,
			supersedesEvidenceId: row.supersedes_evidence_id ?? undefined
		})),
		{ now: new Date() }
	);
	await executePersonalQuery(
		`INSERT INTO user_learner_component_states (
		   user_id, subject, board, qualification, course, tier, curriculum_component_id,
		   component_kind, component_id, component_title, state, uncertainty,
		   evidence_count, independent_evidence_count, distinct_item_count,
		   strongest_evidence_kind, last_evidence_id, last_outcome,
		   last_evidence_at, next_check_at, reason_code,
		   supporting_evidence_ids_json, algorithm_version, computed_at
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
		 ON CONFLICT(user_id, subject, component_kind, component_id) DO UPDATE SET
		   board = excluded.board,
		   qualification = excluded.qualification,
		   course = excluded.course,
		   tier = excluded.tier,
		   curriculum_component_id = excluded.curriculum_component_id,
		   component_title = excluded.component_title,
		   state = excluded.state,
		   uncertainty = excluded.uncertainty,
		   evidence_count = excluded.evidence_count,
		   independent_evidence_count = excluded.independent_evidence_count,
		   distinct_item_count = excluded.distinct_item_count,
		   strongest_evidence_kind = excluded.strongest_evidence_kind,
		   last_evidence_id = excluded.last_evidence_id,
		   last_outcome = excluded.last_outcome,
		   last_evidence_at = excluded.last_evidence_at,
		   next_check_at = excluded.next_check_at,
		   reason_code = excluded.reason_code,
			   supporting_evidence_ids_json = excluded.supporting_evidence_ids_json,
			   algorithm_version = excluded.algorithm_version,
			   computed_at = CURRENT_TIMESTAMP
			 WHERE excluded.evidence_count > user_learner_component_states.evidence_count
			    OR (
			      excluded.evidence_count = user_learner_component_states.evidence_count
			      AND COALESCE(excluded.last_evidence_at, '') >=
			          COALESCE(user_learner_component_states.last_evidence_at, '')
			    )`,
		[
			userId,
			subject,
			board,
			qualification,
			course,
			tier,
			topic.id,
			componentKind,
			componentId,
			componentTitle,
			summary.state,
			summary.uncertainty,
			summary.evidenceCount,
			summary.independentEvidenceCount,
			summary.distinctItemCount,
			summary.strongestEvidenceKind,
			summary.lastEvidenceId,
			summary.lastOutcome,
			summary.lastEvidenceAt,
			summary.nextCheckAt,
			summary.reasonCode,
			JSON.stringify(summary.supportingEvidenceIds),
			summary.algorithmVersion
		]
	);
}

export async function recordLearnerEvidence(input: EvidenceWriteInput): Promise<void> {
	const occurredAt = input.occurredAt ?? isoNow();
	const board = input.board?.trim() || 'AQA';
	const qualification = input.qualification?.trim() || 'GCSE';
	const responseDurationMs =
		typeof input.responseDurationMs === 'number' &&
		Number.isFinite(input.responseDurationMs) &&
		input.responseDurationMs >= 0 &&
		input.responseDurationMs <= 6 * 60 * 60 * 1000
			? Math.round(input.responseDurationMs)
			: null;
	const metadataJson = JSON.stringify(input.metadata ?? {});
	const inserted = await queryPersonalFirst<{ id: string }>(
		`INSERT INTO user_learning_evidence (
		   id, user_id, subject, board, qualification, course, tier, curriculum_component_id,
		   component_kind, component_id, component_title, evidence_kind, outcome,
		   independent, awarded_marks, max_marks, source_item_id, source_attempt_id,
		   source_session_id, question_id, answer_chain_id, response_duration_ms,
		   occurred_at, metadata_json
		 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(id) DO NOTHING
		 RETURNING id`,
		[
			input.id,
			input.user.uid,
			input.subject,
			board,
			qualification,
			input.course ?? null,
			input.tier ?? null,
			input.curriculumComponentId ?? input.topic.id,
			input.componentKind,
			input.componentId,
			input.componentTitle,
			input.evidenceKind,
			input.outcome,
			input.independent ? 1 : 0,
			input.awardedMarks ?? null,
			input.maxMarks ?? null,
			input.sourceItemId,
			input.sourceAttemptId ?? null,
			input.sourceSessionId ?? null,
			input.questionId ?? null,
			input.answerChainId ?? null,
			responseDurationMs,
			occurredAt,
			metadataJson
		]
	);
	if (!inserted) {
		const existing = await queryPersonalFirst<{ matches_write: number }>(
			`SELECT CASE WHEN
			   user_id = ? AND subject = ? AND board = ? AND qualification = ?
			   AND COALESCE(course, '') = COALESCE(?, '')
			   AND COALESCE(tier, '') = COALESCE(?, '')
			   AND curriculum_component_id = ?
			   AND component_kind = ? AND component_id = ?
			   AND COALESCE(component_title, '') = COALESCE(?, '')
			   AND evidence_kind = ? AND outcome = ?
			   AND independent = ?
			   AND COALESCE(awarded_marks, -1) = COALESCE(?, -1)
			   AND COALESCE(max_marks, -1) = COALESCE(?, -1)
			   AND COALESCE(source_item_id, '') = COALESCE(?, '')
			   AND COALESCE(source_attempt_id, '') = COALESCE(?, '')
			   AND COALESCE(source_session_id, '') = COALESCE(?, '')
			   AND COALESCE(question_id, '') = COALESCE(?, '')
			   AND COALESCE(answer_chain_id, '') = COALESCE(?, '')
			   AND COALESCE(response_duration_ms, -1) = COALESCE(?, -1)
			   AND metadata_json = ?
			 THEN 1 ELSE 0 END AS matches_write
			 FROM user_learning_evidence
			 WHERE id = ?`,
			[
				input.user.uid,
				input.subject,
				board,
				qualification,
				input.course ?? null,
				input.tier ?? null,
				input.curriculumComponentId ?? input.topic.id,
				input.componentKind,
				input.componentId,
				input.componentTitle,
				input.evidenceKind,
				input.outcome,
				input.independent ? 1 : 0,
				input.awardedMarks ?? null,
				input.maxMarks ?? null,
				input.sourceItemId,
				input.sourceAttemptId ?? null,
				input.sourceSessionId ?? null,
				input.questionId ?? null,
				input.answerChainId ?? null,
				responseDurationMs,
				metadataJson,
				input.id
			]
		);
		if (existing?.matches_write !== 1) {
			throw new Error(`Learner evidence id ${input.id} already belongs to a different write.`);
		}
	}
	await recomputeComponentState(
		input.user.uid,
		input.subject,
		board,
		qualification,
		input.course ?? null,
		input.tier ?? null,
		input.topic,
		input.componentKind,
		input.componentId,
		input.componentTitle,
		input.curriculumComponentId ?? input.topic.id
	);
	await executePersonalQuery(
		`UPDATE user_recommendation_decisions
		 SET dismissed_at = CURRENT_TIMESTAMP
		 WHERE user_id = ? AND subject = ? AND dismissed_at IS NULL AND acted_at IS NULL`,
		[input.user.uid, input.subject]
	);
}

export async function isRecallTopicWithinLearnerScope(
	userId: string,
	subject: RecallRuntimeSubject,
	recallTopicId: string
): Promise<boolean> {
	const context = await recallScopeContext(userId, subject);
	if (!context) return false;
	const { selectedTopicIds, curriculum } = context;
	const officialTopic = officialTopicForRecallTopic(subject, recallTopicId, curriculum.topics);
	if (!officialTopic) return false;
	return selectedTopicIds === null || selectedTopicIds.has(officialTopic.id);
}

export async function isRecallCardWithinLearnerScope(
	userId: string,
	card: RecallCard
): Promise<boolean> {
	return (await recallCardsWithinLearnerScope(userId, card.subject, [card])).length === 1;
}

export async function recallCardsWithinLearnerScope(
	userId: string,
	subject: RecallRuntimeSubject,
	cards: RecallCard[]
): Promise<RecallCard[]> {
	const context = await recallScopeContext(userId, subject);
	if (!context) return [];
	const { selectedTopicIds, curriculum } = context;
	const topicIds = new Set(curriculum.topics.map((topic) => topic.id));
	return cards.filter(
		(card) =>
			card.subject === subject &&
			card.offeringId === curriculum.id &&
			topicIds.has(card.topicComponentId) &&
			(selectedTopicIds === null || selectedTopicIds.has(card.topicComponentId))
	);
}

async function recallScopeContext(
	userId: string,
	subject: RecallRuntimeSubject
): Promise<{
	curriculum: LearnerCurriculum;
	selectedTopicIds: Set<string> | null;
} | null> {
	const profile = await queryPersonalFirst<{
		board: string;
		qualification: string;
		course: string;
		tier: string;
	}>(
		`SELECT board, qualification, course, tier
		 FROM user_profile_subjects
		 WHERE user_id = ? AND subject = ? AND enabled = 1`,
		[userId, subject]
	);
	if (!profile) return null;
	const curriculum = await curriculumForLearnerSubject({
		subject,
		board: profile.board,
		qualification: profile.qualification,
		course: profile.course as LearnerSubject['course'],
		tier: profile.tier as LearnerSubject['tier']
	});
	if (!curriculum) return null;

	if (subject === 'English Literature') {
		const selections = await queryPersonalFirst<{
			modern_text: string | null;
			nineteenth_century_novel: string | null;
			poetry_cluster: string | null;
			shakespeare_play: string | null;
		}>(
			`SELECT modern_text, nineteenth_century_novel, poetry_cluster, shakespeare_play
			 FROM user_english_literature_selections
			 WHERE user_id = ?`,
			[userId]
		);
		const titles = selections
			? [
					selections.modern_text,
					selections.nineteenth_century_novel,
					selections.poetry_cluster,
					selections.shakespeare_play
				].filter((title): title is string => Boolean(title?.trim()))
			: [];
		if (titles.length !== 4) return { curriculum, selectedTopicIds: new Set() };
		const selectedTopicIds = new Set(
			titles.flatMap((title) => {
				const topic = curriculum.topics.find(
					(candidate) => normalized(candidate.title) === normalized(title)
				);
				return topic ? [topic.id] : [];
			})
		);
		return {
			curriculum,
			selectedTopicIds: selectedTopicIds.size === 4 ? selectedTopicIds : new Set()
		};
	}

	const scope = await readCurriculumScope(userId, subject);
	if (
		!scope ||
		scope.board !== profile.board ||
		scope.qualification !== profile.qualification ||
		scope.course !== profile.course ||
		scope.tier !== profile.tier ||
		scope.specification_code !== curriculum.specificationCode ||
		scope.specification_version !== curriculum.specificationVersion
	) {
		return null;
	}
	return {
		curriculum,
		selectedTopicIds:
			scope.scope_mode === 'all' ? null : new Set(validSelectedTopicIds(scope, curriculum.topics))
	};
}

export async function hasLearnerEvidence(userId: string, evidenceId: string): Promise<boolean> {
	const row = await queryPersonalFirst<{ id: string }>(
		`SELECT id FROM user_learning_evidence WHERE user_id = ? AND id = ?`,
		[userId, evidenceId]
	);
	return Boolean(row);
}

export type RecallReviewEvidenceReceipt = {
	cardId: string;
	contentRevision: number;
	contentHash: string;
	grade: string;
	mode: string;
	selectedChoiceKey: string | null;
	statementChoiceKey?: string | null;
	selectedTruth?: boolean | null;
	sourceSessionId: string | null;
	responseDurationMs: number | null;
	createdAt: number;
};

export async function getRecallReviewEvidenceReceipt(
	userId: string,
	reviewId: string
): Promise<RecallReviewEvidenceReceipt | null> {
	const row = await queryPersonalFirst<{
		source_item_id: string | null;
		source_session_id: string | null;
		response_duration_ms: number | null;
		occurred_at: string;
		metadata_json: string;
	}>(
		`SELECT source_item_id, source_session_id, response_duration_ms, occurred_at, metadata_json
		 FROM user_learning_evidence
		 WHERE user_id = ? AND id = ? AND component_kind = 'recall_card'
		 LIMIT 1`,
		[userId, `recall_${reviewId}`]
	);
	if (!row?.source_item_id) return null;
	const metadata = parseJson<Record<string, unknown>>(row.metadata_json, {});
	const contentRevision = metadata.contentRevision;
	const contentHash = metadata.contentHash;
	const grade = metadata.grade;
	const mode = metadata.mode;
	const selectedChoiceKey = metadata.selectedChoiceKey;
	const statementChoiceKey = metadata.statementChoiceKey ?? null;
	const selectedTruth = metadata.selectedTruth ?? null;
	const createdAt = Date.parse(row.occurred_at);
	if (
		typeof contentRevision !== 'number' ||
		!Number.isInteger(contentRevision) ||
		typeof contentHash !== 'string' ||
		typeof grade !== 'string' ||
		typeof mode !== 'string' ||
		(selectedChoiceKey !== null && typeof selectedChoiceKey !== 'string') ||
		(statementChoiceKey !== null && typeof statementChoiceKey !== 'string') ||
		(selectedTruth !== null && typeof selectedTruth !== 'boolean') ||
		!Number.isFinite(createdAt)
	) {
		return null;
	}
	const receipt: RecallReviewEvidenceReceipt = {
		cardId: row.source_item_id,
		contentRevision,
		contentHash,
		grade,
		mode,
		selectedChoiceKey: selectedChoiceKey as string | null,
		sourceSessionId: row.source_session_id,
		responseDurationMs: row.response_duration_ms,
		createdAt
	};
	if (metadata.statementChoiceKey !== undefined || metadata.selectedTruth !== undefined) {
		receipt.statementChoiceKey = statementChoiceKey as string | null;
		receipt.selectedTruth = selectedTruth as boolean | null;
	}
	return receipt;
}

export async function recordRecallReviewEvidence({
	user,
	reviewId,
	card,
	grade,
	mode,
	selectedChoice,
	statementChoice,
	selectedTruth,
	sourceSessionId,
	responseDurationMs,
	createdAt
}: {
	user: AdminUser;
	reviewId: string;
	card: RecallCard;
	grade: 'again' | 'hard' | 'good' | 'easy';
	mode: 'recall' | 'recognise' | 'reverse' | 'true_false';
	selectedChoice: RecallChoiceDiagnostic | null;
	statementChoice: RecallChoiceDiagnostic | null;
	selectedTruth: boolean | null;
	sourceSessionId?: string | null;
	responseDurationMs?: number | null;
	createdAt: number;
}): Promise<void> {
	const settings = await getLearnerProfileSettings(user);
	const learnerSubject = settings.subjects.find(
		(entry) => entry.enabled && entry.subject === card.subject
	);
	const curriculum = learnerSubject ? await curriculumForLearnerSubject(learnerSubject) : null;
	if (!curriculum) throw new Error('Recall is not available for this board and course.');
	if (card.offeringId !== curriculum.id) {
		throw new Error('Recall card is not mapped to this exact curriculum offering.');
	}
	const topic = curriculum.topics.find((entry) => entry.id === card.topicComponentId) ?? null;
	if (!topic) throw new Error('Recall card is not mapped to the official curriculum.');
	const recognition = mode === 'recognise';
	const trueFalse = mode === 'true_false';
	if (recognition !== Boolean(selectedChoice)) {
		throw new Error('Recall recognition evidence requires one canonical selected choice.');
	}
	if (trueFalse !== Boolean(statementChoice) || trueFalse !== (selectedTruth !== null)) {
		throw new Error('True-or-false evidence requires one canonical statement and one answer.');
	}
	const positive = grade === 'good' || grade === 'easy';
	const trueFalseCorrect = statementChoice ? statementChoice.isCorrect === selectedTruth : null;
	await recordLearnerEvidence({
		id: `recall_${reviewId}`,
		user,
		subject: card.subject,
		course: learnerSubject?.course,
		tier: learnerSubject?.tier,
		topic,
		curriculumComponentId: card.curriculumComponentId,
		componentKind: 'recall_card',
		componentId: recallEvidenceComponentId(card),
		componentTitle: card.front,
		evidenceKind: recognition
			? 'multiple_choice'
			: trueFalse
				? 'true_false'
				: 'flashcard_self_rating',
		outcome: recognition
			? selectedChoice!.isCorrect
				? 'correct'
				: 'incorrect'
			: trueFalse
				? trueFalseCorrect
					? 'correct'
					: 'incorrect'
				: positive
					? 'known'
					: 'unsure',
		independent: false,
		sourceItemId: card.id,
		sourceAttemptId: reviewId,
		sourceSessionId,
		responseDurationMs,
		metadata: {
			grade,
			mode,
			specRef: card.specRef,
			offeringId: card.offeringId,
			curriculumComponentId: card.curriculumComponentId,
			topicComponentId: card.topicComponentId,
			contentRevision: card.contentRevision,
			contentHash: card.contentHash,
			selectedChoiceKey: selectedChoice?.key ?? null,
			selectedChoiceCorrect: selectedChoice?.isCorrect ?? null,
			selectedChoiceMisconception: selectedChoice?.misconception ?? null,
			statementChoiceKey: statementChoice?.key ?? null,
			statementChoiceCorrect: statementChoice?.isCorrect ?? null,
			statementChoiceMisconception: statementChoice?.misconception ?? null,
			selectedTruth,
			trueFalseCorrect
		},
		occurredAt: new Date(createdAt).toISOString()
	});
}

type QuestionEvidenceRow = {
	id: string;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	subject_area: string | null;
	component_code: string | null;
	tier: string | null;
	spec_ref: string | null;
	topic_path_json: string;
	marks: number | null;
	answer_chain_id: string;
	transfer_distance: string;
};

export async function recordQuestionAttemptEvidence({
	user,
	attemptId,
	questionId,
	result,
	assistance,
	sourceSessionId,
	responseDurationMs,
	occurredAt
}: {
	user: AdminUser;
	attemptId: string;
	questionId: string;
	result: QuestionGradeResult;
	assistance?: ConstructedAnswerAssistance;
	sourceSessionId?: string | null;
	responseDurationMs?: number | null;
	occurredAt?: string;
}): Promise<boolean> {
	const [rows, settings] = await Promise.all([
		queryRows<QuestionEvidenceRow>(
			`SELECT q.id, q.board, q.qualification, q.subject, q.subject_area, q.component_code, q.tier,
			        q.spec_ref, q.topic_path_json, q.marks,
			        qac.answer_chain_id, qac.transfer_distance
			 FROM questions q
			 JOIN question_answer_chains qac
			   ON qac.question_id = q.id AND qac.is_primary = 1
			 WHERE q.id = ?
			 LIMIT 1`,
			[questionId]
		),
		getLearnerProfileSettings(user)
	]);
	const row = rows[0];
	if (!row) return false;
	const learnerSubject = enabledProfileCombinationForQuestion(settings.subjects, {
		board: row.board,
		qualification: row.qualification,
		subject: row.subject,
		subjectArea: row.subject_area,
		componentCode: row.component_code,
		tier: row.tier
	});
	if (!learnerSubject) return false;
	const subject = learnerSubject.subject as SupportedLearnerSubject;
	const curriculum = await curriculumForLearnerSubject(learnerSubject);
	if (!curriculum) return false;
	const topic = await curriculumTopicForStoredQuestion(curriculum, questionId, row);
	if (!topic) return false;
	const normalizedAssistance = normalizeConstructedAnswerAssistance(assistance);
	const independent = constructedAnswerIsIndependent(normalizedAssistance);
	const isFixedChoice = result.modelVersion === 'fixed-choice-v1';
	const evidenceKind: EvidenceKind = isFixedChoice
		? 'multiple_choice'
		: !independent
			? 'short_constructed'
			: row.transfer_distance === 'stretch' || row.transfer_distance === 'exam_transfer'
				? 'independent_transfer_constructed'
				: (row.marks ?? result.maxMarks) <= 3
					? 'short_constructed'
					: 'independent_exam_constructed';
	const outcome: EvidenceOutcome =
		result.result === 'correct' ? 'correct' : result.result === 'partial' ? 'partial' : 'incorrect';

	await recordLearnerEvidence({
		id: `attempt_${attemptId}`,
		user,
		subject,
		board: learnerSubject.board,
		qualification: learnerSubject.qualification,
		course: learnerSubject.course,
		tier: learnerSubject.tier,
		topic,
		componentKind: 'answer_chain',
		componentId: row.answer_chain_id,
		componentTitle: row.answer_chain_id,
		evidenceKind,
		outcome,
		independent,
		sourceItemId: questionId,
		sourceAttemptId: attemptId,
		sourceSessionId,
		responseDurationMs,
		occurredAt,
		questionId,
		answerChainId: row.answer_chain_id,
		awardedMarks: result.awardedMarks,
		maxMarks: result.maxMarks,
		metadata: { transferDistance: row.transfer_distance, assistance: normalizedAssistance }
	});

	const stepRows = await queryRows<{ id: string; step_text: string }>(
		`SELECT id, step_text
		 FROM answer_chain_steps
		 WHERE answer_chain_id = ?
		 ORDER BY display_order`,
		[row.answer_chain_id]
	);
	const present = new Set(result.presentStepIds);
	const missing = new Set(result.missingStepIds);
	for (const step of stepRows) {
		if (!present.has(step.id) && !missing.has(step.id)) continue;
		await recordLearnerEvidence({
			id: `attempt_${attemptId}_${step.id}`,
			user,
			subject,
			board: learnerSubject.board,
			qualification: learnerSubject.qualification,
			course: learnerSubject.course,
			tier: learnerSubject.tier,
			topic,
			componentKind: 'chain_step',
			componentId: step.id,
			componentTitle: step.step_text,
			evidenceKind,
			outcome: present.has(step.id) ? 'correct' : 'incorrect',
			independent,
			sourceItemId: questionId,
			sourceAttemptId: attemptId,
			sourceSessionId,
			responseDurationMs,
			occurredAt,
			questionId,
			answerChainId: row.answer_chain_id,
			metadata: { transferDistance: row.transfer_distance, assistance: normalizedAssistance }
		});
	}

	// A successful assisted rewrite is ready for checking, but does not prove transfer.
	// Only a fresh, unassisted question can close a gap from a different source question.
	if (independent) {
		for (const stepId of present) {
			await executePersonalQuery(
				`UPDATE user_chain_gaps
				 SET status = 'closed',
				     gap_band = 'closed',
				     latest_attempt_id = ?,
				     updated_at = CURRENT_TIMESTAMP,
				     last_seen_at = CURRENT_TIMESTAMP
				 WHERE user_id = ?
				   AND answer_chain_id = ?
				   AND chain_step_id = ?
				   AND course = ?
				   AND tier = ?
				   AND status IN ('active', 'awaiting_check')
				   AND COALESCE(source_question_id, '') <> ?`,
				[
					attemptId,
					user.uid,
					row.answer_chain_id,
					stepId,
					learnerSubject.course,
					learnerSubject.tier,
					questionId
				]
			);
		}
	} else if (normalizedAssistance.feedbackRewrite) {
		for (const stepId of present) {
			await executePersonalQuery(
				`UPDATE user_chain_gaps
				 SET status = 'awaiting_check',
				     latest_attempt_id = ?,
				     updated_at = CURRENT_TIMESTAMP,
				     last_seen_at = CURRENT_TIMESTAMP
				 WHERE user_id = ?
				   AND answer_chain_id = ?
				   AND chain_step_id = ?
				   AND course = ?
				   AND tier = ?
				   AND status = 'active'
				   AND COALESCE(source_question_id, '') = ?`,
				[
					attemptId,
					user.uid,
					row.answer_chain_id,
					stepId,
					learnerSubject.course,
					learnerSubject.tier,
					questionId
				]
			);
		}
	}
	return true;
}

export async function recordEnglishStepAttemptEvidence({
	user,
	checkId,
	questionId,
	stepId,
	result,
	hintOpened = false,
	assistance,
	sourceSessionId,
	responseDurationMs
}: {
	user: AdminUser;
	checkId: string;
	questionId: string;
	stepId: string;
	result: EnglishStepGradeResult;
	hintOpened?: boolean;
	assistance?: ConstructedAnswerAssistance;
	sourceSessionId?: string | null;
	responseDurationMs?: number | null;
}): Promise<void> {
	const [rows, settings] = await Promise.all([
		queryRows<QuestionEvidenceRow>(
			`SELECT q.id, q.board, q.qualification, q.subject, q.subject_area, q.component_code, q.tier,
			        q.spec_ref, q.topic_path_json, q.marks,
			        qac.answer_chain_id, qac.transfer_distance
			 FROM questions q
			 JOIN question_answer_chains qac
			   ON qac.question_id = q.id AND qac.is_primary = 1
			 WHERE q.id = ?
			 LIMIT 1`,
			[questionId]
		),
		getLearnerProfileSettings(user)
	]);
	const row = rows[0];
	if (!row) return;
	const learnerSubject = enabledProfileCombinationForQuestion(settings.subjects, {
		board: row.board,
		qualification: row.qualification,
		subject: row.subject,
		subjectArea: row.subject_area,
		componentCode: row.component_code,
		tier: row.tier
	});
	if (
		!learnerSubject ||
		(learnerSubject.subject !== 'English Language' &&
			learnerSubject.subject !== 'English Literature')
	) {
		return;
	}
	const englishSubject = learnerSubject.subject as 'English Language' | 'English Literature';
	const curriculum = await curriculumForLearnerSubject(learnerSubject);
	if (!curriculum) return;
	const mappedTopic = await curriculumTopicForStoredQuestion(curriculum, questionId, row);
	const topic =
		mappedTopic ??
		({
			id: curriculum.specificationId,
			code: curriculum.specificationCode,
			title: curriculum.label,
			paper: 'Whole course',
			specUrl: curriculum.specificationUrl
		} satisfies StemCurriculumTopic);
	const metCount = result.checks.filter((check) => check.status === 'met').length;
	const normalizedAssistance = normalizeConstructedAnswerAssistance({
		...assistance,
		hintOpened
	});
	const outcome: EvidenceOutcome =
		result.decision === 'pass' ? 'correct' : metCount > 0 ? 'partial' : 'incorrect';
	const common = {
		user,
		subject: englishSubject,
		board: learnerSubject.board,
		qualification: learnerSubject.qualification,
		course: learnerSubject.course,
		tier: learnerSubject.tier,
		topic,
		evidenceKind: 'short_constructed' as const,
		independent: false,
		sourceItemId: `${questionId}:${stepId}`,
		sourceAttemptId: checkId,
		sourceSessionId,
		responseDurationMs,
		questionId,
		answerChainId: row.answer_chain_id
	};
	await recordLearnerEvidence({
		...common,
		id: `english_${checkId}`,
		componentKind: 'english_practice_step',
		componentId: `${row.answer_chain_id}:${stepId}`,
		componentTitle: result.stepTitle,
		outcome,
		awardedMarks: metCount,
		maxMarks: result.checks.length,
		metadata: {
			guided: true,
			hintOpened,
			assistance: normalizedAssistance,
			decision: result.decision,
			confidence: result.confidence,
			learnerModel: result.learnerModel,
			nextImprovement: result.nextImprovement,
			coachingNote: result.coachingNote,
			curriculumMapping: mappedTopic ? 'question' : 'specification_root'
		}
	});
	for (const check of result.checks) {
		await recordLearnerEvidence({
			...common,
			id: `english_${checkId}_${check.id}`,
			componentKind: 'english_skill',
			componentId: `${stepId}:${check.id}`,
			componentTitle: check.label,
			outcome: check.status === 'met' ? 'correct' : 'incorrect',
			metadata: {
				guided: true,
				hintOpened,
				assistance: normalizedAssistance,
				stepId,
				feedback: check.feedback,
				curriculumMapping: mappedTopic ? 'question' : 'specification_root'
			}
		});
	}
}

export async function getRecallReviewSnapshot(
	user: AdminUser,
	subject: RecallRuntimeSubject,
	cards: RecallCard[]
): Promise<RecallReviewRow[]> {
	const settings = await getLearnerProfileSettings(user);
	const learnerSubject = settings.subjects.find(
		(entry) => entry.enabled && entry.subject === subject
	);
	if (!learnerSubject) return [];
	const [rows, diagnosticRows] = await Promise.all([
		queryPersonalRows<RecallReviewBaseRow>(
			`SELECT card_id, topic_id, last_grade, seen_count, correct_count, interval_days,
			        due_at, content_revision, content_hash, updated_at
			 FROM user_recall_card_reviews
			 WHERE user_id = ? AND subject = ? AND course = ? AND tier = ?
			 ORDER BY updated_at DESC`,
			[user.uid, subject, learnerSubject.course, learnerSubject.tier]
		),
		queryPersonalRows<RecallChoiceDiagnosticCountRow>(
			`WITH choice_counts AS (
			   SELECT source_item_id AS card_id,
			          CAST(json_extract(metadata_json, '$.contentRevision') AS INTEGER) AS content_revision,
			          json_extract(metadata_json, '$.contentHash') AS content_hash,
			          json_extract(metadata_json, '$.selectedChoiceKey') AS choice_key,
			          COUNT(*) AS choice_count
			   FROM user_learning_evidence evidence
			   WHERE user_id = ? AND subject = ? AND course = ? AND tier = ?
			     AND component_kind = 'recall_card'
			     AND evidence_kind = 'multiple_choice'
			     AND outcome = 'incorrect'
			     AND json_type(metadata_json, '$.selectedChoiceKey') = 'text'
			     AND NOT EXISTS (
			       SELECT 1 FROM user_learning_evidence correction
			       WHERE correction.user_id = evidence.user_id
			         AND correction.supersedes_evidence_id = evidence.id
			     )
			   GROUP BY source_item_id, content_revision, content_hash, choice_key
			 )
			 SELECT card_id, content_revision, content_hash,
			        SUM(choice_count) AS wrong_choice_count,
			        MAX(choice_count) AS repeated_misconception_count
			 FROM choice_counts
			 GROUP BY card_id, content_revision, content_hash`,
			[user.uid, subject, learnerSubject.course, learnerSubject.tier]
		)
	]);
	const diagnosticsByContent = new Map(
		diagnosticRows.map((row) => [`${row.card_id}@${row.content_revision}:${row.content_hash}`, row])
	);
	const cardsById = new Map(cards.map((card) => [card.id, card]));
	return rows.flatMap((row) => {
		const card = cardsById.get(row.card_id);
		if (!card || !recallReviewMatchesCard(card, row)) return [];
		const diagnostic = diagnosticsByContent.get(recallEvidenceComponentId(card));
		return [
			{
				...row,
				wrong_choice_count: diagnostic?.wrong_choice_count ?? 0,
				repeated_misconception_count: diagnostic?.repeated_misconception_count ?? 0
			}
		];
	});
}

export async function recordGapOutcomeEvidence({
	user,
	gapId,
	result,
	sourceSessionId,
	responseDurationMs
}: {
	user: AdminUser;
	gapId: string;
	result: GapFinalJudgeResult;
	sourceSessionId?: string | null;
	responseDurationMs?: number | null;
}): Promise<void> {
	const gap = await queryPersonalFirst<{
		subject: string | null;
		answer_chain_id: string;
		chain_step_id: string;
		step_text: string;
		source_question_id: string | null;
		topic_path_json: string;
	}>(
		`SELECT subject, answer_chain_id, chain_step_id, step_text,
		        source_question_id, topic_path_json
		 FROM user_chain_gaps
		 WHERE user_id = ? AND id = ?`,
		[user.uid, gapId]
	);
	if (!gap || !isScienceLearnerSubject(gap.subject ?? '')) return;
	const subject = gap.subject as RecallSubject;
	const settings = await getLearnerProfileSettings(user);
	const learnerSubject = settings.subjects.find(
		(entry) => entry.enabled && entry.subject === subject
	);
	const curriculum = learnerSubject ? await curriculumForLearnerSubject(learnerSubject) : null;
	if (!curriculum) return;
	const topic = await curriculumTopicForStoredQuestion(curriculum, gap.source_question_id, gap);
	if (!topic) return;
	const common = {
		user,
		subject,
		course: learnerSubject?.course,
		tier: learnerSubject?.tier,
		topic,
		evidenceKind: 'short_constructed' as const,
		outcome: result.targetStepPresent ? ('correct' as const) : ('incorrect' as const),
		independent: false,
		sourceItemId: gap.source_question_id ?? gapId,
		sourceAttemptId: result.runId,
		sourceSessionId,
		responseDurationMs,
		questionId: gap.source_question_id,
		answerChainId: gap.answer_chain_id,
		awardedMarks: result.awardedMarks,
		maxMarks: result.maxMarks,
		metadata: {
			guidedGapCheck: true,
			gapId,
			externalInputDetected: result.externalInputDetected,
			externalInputSources: result.externalInputSources
		}
	};
	await recordLearnerEvidence({
		...common,
		id: `gap_${result.runId}`,
		componentKind: 'gap_check',
		componentId: gap.chain_step_id,
		componentTitle: gap.step_text
	});
	await recordLearnerEvidence({
		...common,
		id: `gap_${result.runId}_${gap.chain_step_id}`,
		componentKind: 'chain_step',
		componentId: gap.chain_step_id,
		componentTitle: gap.step_text
	});
}
