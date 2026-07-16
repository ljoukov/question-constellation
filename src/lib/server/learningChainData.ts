import {
	getQuestionTeaser,
	type ChainQuestionLabel,
	type ChainQuestionTeaser,
	type LearningChain
} from '$lib/learningChains';
import { storedQuestionTitle, storedQuestionTitleIssues } from '$lib/storedQuestionTitle.js';
import {
	canonicalCurriculumSubject,
	gcseCurriculumTopics,
	normaliseCurriculumText,
	slugifyCurriculumPart,
	subjectBelongsToScience,
	type GcseCurriculumTopic
} from '$lib/curriculum/gcseCurriculum';
import { subjectSymbol } from '$lib/subjectSymbols.js';
import { getPublishedChainIllustration } from './chainIllustrations';
import { sourceDocumentSlug } from './questionExperimentData';
import { queryRows } from './db';
import { getPublicRoutePayload } from './publicRoutePayloads';

type ChainRow = {
	id: string;
	title: string;
	canonical_chain_text: string;
	subject: string | null;
	subject_area: string | null;
	broad_topic: string | null;
	summary: string | null;
	confidence: number | null;
	needs_human_review: number;
	question_count: number;
};

type ChainStepRow = {
	id: string;
	answer_chain_id: string;
	display_order: number;
	step_text: string;
	common_omission: string | null;
};

type QuestionMembershipRow = {
	answer_chain_id: string;
	transfer_distance: string;
	display_order: number | null;
	id: string;
	source_document_id: string;
	source_question_ref: string;
	prompt_text: string;
	self_contained_prompt_text: string | null;
	command_word: string | null;
	marks: number | null;
	subject: string | null;
	subject_area: string | null;
	paper: string | null;
	series: string | null;
	year: number | null;
	topic_path_json: string;
	metadata_json: string;
	source_board: string | null;
	source_qualification: string | null;
	source_subject: string | null;
	source_tier: string | null;
	source_paper: string | null;
	source_series: string | null;
	source_year: number | null;
	source_component_code: string | null;
	weak_answer_text: string | null;
	weak_answer_explanation: string | null;
	weak_missing_chain_step_ids_json: string | null;
};

type QuestionBankQuestionRow = {
	id: string;
	slug: string | null;
	source_document_id: string;
	source_question_ref: string | null;
	display_order: number | null;
	prompt_text: string;
	self_contained_prompt_text: string | null;
	command_word: string | null;
	marks: number | null;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	subject_area: string | null;
	tier: string | null;
	paper: string | null;
	component_code: string | null;
	series: string | null;
	year: number | null;
	topic_path_json: string | null;
	metadata_json: string | null;
	source_board: string | null;
	source_qualification: string | null;
	source_subject: string | null;
	source_tier: string | null;
	source_paper: string | null;
	source_component_code: string | null;
	source_series: string | null;
	source_year: number | null;
	answer_chain_id: string | null;
	chain_title: string | null;
	reviewed_answer_text: string | null;
};

export type HomePagePublicData = {
	featuredChains: LearningChain[];
	stats: {
		chainCount: number;
		questionCount: number;
		subjectCount: number;
	};
};

export type QuestionBankQuestion = {
	id: string;
	slug: string | null;
	title: string;
	preview: string;
	board: string;
	qualification: string;
	subject: string;
	tier: string | null;
	paper: string;
	componentCode: string | null;
	series: string | null;
	year: number | null;
	topicPath: string[];
	topic: string;
	topicId: string;
	sourceRef: string;
	marks: number | null;
	command: string;
	chainId: string | null;
	chainTitle: string | null;
};

export type QuestionBankTopic = {
	id: string;
	board: string;
	qualification: string;
	subject: string;
	code: string | null;
	title: string;
	paper: string;
	specUrl: string | null;
	questionCount: number;
	chainCount: number;
	firstQuestionId: string | null;
	firstQuestionTitle: string | null;
};

export type QuestionBankBrowseData = {
	questions: QuestionBankQuestion[];
	topics: QuestionBankTopic[];
};

export type QuestionBankBrowseFilters = {
	search: string;
	subject: string;
	marks: string;
	topic: string;
	board: string;
	page: number;
};

export type QuestionBankBrowseSection = {
	topic: QuestionBankTopic;
	questions: QuestionBankQuestion[];
};

export type QuestionBankBrowsePageData = {
	filters: QuestionBankBrowseFilters;
	sections: QuestionBankBrowseSection[];
	subjects: string[];
	boards: string[];
	topicOptions: Array<Pick<QuestionBankTopic, 'id' | 'title'>>;
	totalQuestions: number;
	resultStart: number;
	resultEnd: number;
	page: number;
	pageCount: number;
};

const questionBankBrowsePayloadId = 'chains:browse';
const homePublicSummaryPayloadId = 'home:public-summary';

type TopicAssignableQuestion = Omit<QuestionBankQuestion, 'topicId'> & { topicId?: string };

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function parseTopicPath(raw: string | null | undefined): string[] {
	const parsed = parseJson<unknown>(raw, []);
	if (Array.isArray(parsed)) {
		return parsed
			.map((item) => (typeof item === 'string' ? cleanSingleLine(item) : ''))
			.filter(Boolean);
	}
	if (typeof parsed === 'string') {
		const cleaned = cleanSingleLine(parsed);
		return cleaned ? [cleaned] : [];
	}
	return [];
}

function cleanNullable(value: string | null | undefined): string | null {
	const cleaned = (value ?? '').replace(/\s+/g, ' ').trim();
	return cleaned || null;
}

function questionSubjectName(row: QuestionBankQuestionRow): string {
	const sourceSubject = cleanNullable(row.subject) ?? cleanNullable(row.source_subject);
	const subjectArea = cleanNullable(row.subject_area);
	const canonical =
		canonicalCurriculumSubject(sourceSubject) ??
		canonicalCurriculumSubject(subjectArea) ??
		canonicalCurriculumSubject(row.paper) ??
		canonicalCurriculumSubject(row.source_paper);
	if (canonical && canonical !== 'Science') return canonical;
	return subjectArea ?? sourceSubject ?? 'Science';
}

function questionBoard(row: QuestionBankQuestionRow): string {
	return cleanNullable(row.board) ?? cleanNullable(row.source_board) ?? 'AQA';
}

function questionQualification(row: QuestionBankQuestionRow): string {
	return cleanNullable(row.qualification) ?? cleanNullable(row.source_qualification) ?? 'GCSE';
}

function questionPaper(row: QuestionBankQuestionRow): string {
	return cleanNullable(row.paper) ?? cleanNullable(row.source_paper) ?? 'Question paper';
}

function questionComponentCode(row: QuestionBankQuestionRow): string | null {
	return cleanNullable(row.component_code) ?? cleanNullable(row.source_component_code);
}

function questionSeries(row: QuestionBankQuestionRow): string | null {
	return cleanNullable(row.series) ?? cleanNullable(row.source_series);
}

function questionYear(row: QuestionBankQuestionRow): number | null {
	return row.year ?? row.source_year ?? null;
}

function questionBankTitle(row: QuestionBankQuestionRow) {
	return storedQuestionTitle({
		id: row.id,
		subject: questionSubjectName(row),
		metadataJson: row.metadata_json,
		promptText: row.prompt_text,
		selfContainedPromptText: row.self_contained_prompt_text,
		topicPathJson: row.topic_path_json
	});
}

function questionBankPreview(row: QuestionBankQuestionRow) {
	return teaserFromPrompt(row.prompt_text);
}

function questionTopic(question: TopicAssignableQuestion): string {
	return question.topicPath.at(-1) ?? question.paper ?? question.subject;
}

function questionMatchesCurriculumTopic(
	question: TopicAssignableQuestion,
	topic: GcseCurriculumTopic
): boolean {
	if (question.subject !== topic.subject) return false;
	if (question.board.toLowerCase() !== topic.board.toLowerCase()) return false;

	const haystack = normaliseCurriculumText(
		[
			question.title,
			question.preview,
			question.paper,
			question.componentCode,
			question.topicPath.join(' ')
		].join(' ')
	);
	return topic.aliases.some((alias) => {
		const normalizedAlias = normaliseCurriculumText(alias);
		return normalizedAlias.length > 0 && haystack.includes(normalizedAlias);
	});
}

function curriculumTopicForQuestion(question: TopicAssignableQuestion): GcseCurriculumTopic | null {
	return (
		gcseCurriculumTopics.find((topic) => questionMatchesCurriculumTopic(question, topic)) ?? null
	);
}

function dynamicTopicId(question: TopicAssignableQuestion): string {
	return [
		'imported',
		slugifyCurriculumPart(question.board),
		slugifyCurriculumPart(question.subject),
		slugifyCurriculumPart(questionTopic(question) || question.paper)
	]
		.filter(Boolean)
		.join('-');
}

function topicSeedForQuestion(question: TopicAssignableQuestion): QuestionBankTopic {
	const curriculumTopic = curriculumTopicForQuestion(question);
	if (curriculumTopic) {
		return {
			id: curriculumTopic.id,
			board: curriculumTopic.board,
			qualification: curriculumTopic.qualification,
			subject: curriculumTopic.subject,
			code: curriculumTopic.code,
			title: curriculumTopic.title,
			paper: curriculumTopic.paper,
			specUrl: curriculumTopic.specUrl,
			questionCount: 0,
			chainCount: 0,
			firstQuestionId: null,
			firstQuestionTitle: null
		};
	}

	const topicTitle = questionTopic(question);
	return {
		id: dynamicTopicId(question),
		board: question.board,
		qualification: question.qualification,
		subject: question.subject,
		code: null,
		title: topicTitle,
		paper: question.paper,
		specUrl: null,
		questionCount: 0,
		chainCount: 0,
		firstQuestionId: null,
		firstQuestionTitle: null
	};
}

function subjectSortRank(subject: string): number {
	const order = [
		'Biology',
		'Chemistry',
		'Physics',
		'Computer Science',
		'Geography',
		'History',
		'English Language',
		'English Literature'
	];
	const index = order.indexOf(subject);
	return index === -1 ? order.length : index;
}

function topicSortRank(topic: QuestionBankTopic): number {
	const curriculumIndex = gcseCurriculumTopics.findIndex((entry) => entry.id === topic.id);
	if (curriculumIndex !== -1) return curriculumIndex;
	return 1000;
}

function cleanPromptText(text: string): string {
	return text
		.replace(/\*\*/g, '')
		.split(/\r?\n/)
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.filter((line) => !/^\[\s*\d+\s*marks?\s*\]$/i.test(line))
		.filter((line) => !/^(?:figure|table)\s+\d+$/i.test(line))
		.join(' ')
		.trim();
}

function mathOpenerAt(value: string, index: number): { open: string; close: string } | null {
	if (value.startsWith('$$', index)) return { open: '$$', close: '$$' };
	if (value.startsWith('\\[', index)) return { open: '\\[', close: '\\]' };
	if (value.startsWith('\\(', index)) return { open: '\\(', close: '\\)' };
	if (value[index] === '$' && value[index - 1] !== '\\') return { open: '$', close: '$' };
	return null;
}

function mathAwareCutIndex(value: string, limit: number) {
	let activeMath: { close: string; start: number } | null = null;
	let lastSafeBoundary = -1;
	let index = 0;

	while (index < limit) {
		if (activeMath) {
			if (value.startsWith(activeMath.close, index)) {
				index += activeMath.close.length;
				activeMath = null;
				continue;
			}
			index += 1;
			continue;
		}

		const opener = mathOpenerAt(value, index);
		if (opener) {
			activeMath = { close: opener.close, start: index };
			index += opener.open.length;
			continue;
		}

		if (/[\s,.;:!?)]/.test(value[index])) {
			lastSafeBoundary = index;
		}
		index += 1;
	}

	if (activeMath) return activeMath.start;
	return lastSafeBoundary > Math.floor(limit * 0.55) ? lastSafeBoundary : limit;
}

function truncateRichText(text: string, maxLength: number) {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (normalized.length <= maxLength) return normalized;

	const limit = Math.max(1, maxLength - 3);
	const cutIndex = mathAwareCutIndex(normalized, limit);
	const snippet =
		normalized
			.slice(0, cutIndex)
			.trimEnd()
			.replace(/[,:;([{]+$/, '')
			.trimEnd() ||
		normalized
			.slice(0, limit)
			.replace(/\s+\S*$/, '')
			.trimEnd();

	return `${snippet}...`;
}

function teaserFromPrompt(text: string) {
	const cleaned = cleanPromptText(text);
	return truncateRichText(cleaned, 132);
}

function titleFromQuestion(row: QuestionMembershipRow) {
	return storedQuestionTitle({
		id: row.id,
		subject: row.subject ?? row.source_subject,
		metadataJson: row.metadata_json,
		promptText: row.prompt_text,
		selfContainedPromptText: row.self_contained_prompt_text,
		topicPathJson: row.topic_path_json
	});
}

function questionHasSafeTitle(row: QuestionMembershipRow): boolean {
	return (
		storedQuestionTitleIssues({
			title: titleFromQuestion(row),
			subject: row.subject_area ?? row.subject ?? row.source_subject,
			promptText: row.prompt_text,
			selfContainedPromptText: row.self_contained_prompt_text
		}).length === 0
	);
}

function topicFromRow(row: QuestionMembershipRow) {
	const topicPath = parseJson<string[]>(row.topic_path_json, []);
	return topicPath.at(-1) ?? row.subject_area ?? row.paper ?? 'GCSE science';
}

function subjectName(row: Pick<ChainRow, 'subject' | 'subject_area'>) {
	return row.subject_area ?? row.subject ?? 'Science';
}

function subjectAccent(subject: string): LearningChain['accent'] {
	const lower = subject.toLowerCase();
	if (lower.includes('chemistry')) return 'amber';
	if (lower.includes('physics')) return 'blue';
	if (lower.includes('computer')) return 'blue';
	if (lower.includes('history')) return 'amber';
	return 'green';
}

function distanceLabel(value: string): ChainQuestionLabel {
	if (value === 'start') return 'Start here';
	if (value === 'near') return 'Similar';
	if (value === 'stretch') return 'Challenge';
	if (value === 'exam_transfer' || value === 'exam-transfer') return 'New context';
	return 'Small change';
}

function paperLabel(row: QuestionMembershipRow) {
	return [
		row.source_board ?? 'AQA',
		row.source_qualification ?? row.subject ?? 'GCSE',
		row.source_subject ?? row.subject_area ?? row.subject ?? 'Science',
		row.source_tier ? `${row.source_tier} Tier` : null,
		row.source_paper ?? row.source_component_code ?? row.paper,
		row.source_series ?? (row.source_year ? String(row.source_year) : null)
	]
		.filter(Boolean)
		.join(' · ');
}

function fallbackSteps(canonicalText: string) {
	const parts = canonicalText
		.split(/\s*(?:->|→|⇒|➜)\s*/u)
		.map((part) => part.trim())
		.filter(Boolean);
	return parts.length > 1 ? parts : [canonicalText];
}

function questionSortRank(value: string) {
	if (value === 'start') return 0;
	if (value === 'near') return 1;
	if (value === 'stretch') return 2;
	if (value === 'exam_transfer' || value === 'exam-transfer') return 3;
	return 4;
}

function sortQuestions(a: QuestionMembershipRow, b: QuestionMembershipRow) {
	return (
		questionSortRank(a.transfer_distance) - questionSortRank(b.transfer_distance) ||
		(a.display_order ?? 9999) - (b.display_order ?? 9999) ||
		(a.year ?? 0) - (b.year ?? 0) ||
		a.source_question_ref.localeCompare(b.source_question_ref)
	);
}

function cleanSingleLine(text: string) {
	return text.replace(/\s+/g, ' ').trim();
}

function questionHintFromWeakAnswer(
	row: QuestionMembershipRow,
	steps: ChainStepRow[]
): string | null {
	const explanation = row.weak_answer_explanation
		? cleanSingleLine(row.weak_answer_explanation)
		: '';
	if (explanation) {
		return truncateRichText(`Avoid the common trap: ${explanation}`, 180);
	}

	const missingStepRefs = parseJson<Array<string | number>>(
		row.weak_missing_chain_step_ids_json,
		[]
	);
	const missingSteps = missingStepRefs
		.map((item) => {
			if (typeof item === 'number') return steps[item]?.step_text;
			return steps.find((step) => step.id === item)?.step_text;
		})
		.filter((item): item is string => Boolean(item))
		.map((item) => item.replace(/\.$/, ''));

	if (missingSteps.length > 0) {
		return truncateRichText(`Focus on this link: ${missingSteps.join(' -> ')}`, 160);
	}

	const weakAnswer = row.weak_answer_text ? cleanSingleLine(row.weak_answer_text) : '';
	if (weakAnswer) {
		return truncateRichText(`Do not stop at "${weakAnswer}". Use the full chain.`, 160);
	}

	return null;
}

function groupBy<T, K extends string>(items: T[], keyFor: (item: T) => K) {
	const groups = new Map<K, T[]>();
	for (const item of items) {
		const key = keyFor(item);
		const existing = groups.get(key);
		if (existing) {
			existing.push(item);
		} else {
			groups.set(key, [item]);
		}
	}
	return groups;
}

function toQuestionTeaser(row: QuestionMembershipRow, steps: ChainStepRow[]): ChainQuestionTeaser {
	return {
		id: row.id,
		ref: row.source_question_ref,
		sourceRef: row.source_question_ref,
		paperSlug: sourceDocumentSlug(row.source_document_id),
		paperLabel: paperLabel(row),
		title: titleFromQuestion(row),
		teaser: teaserFromPrompt(row.prompt_text),
		hint: questionHintFromWeakAnswer(row, steps),
		label: distanceLabel(row.transfer_distance),
		marks: row.marks,
		command: row.command_word ?? 'Question'
	};
}

function buildLearningChain(
	row: ChainRow,
	steps: ChainStepRow[],
	questions: QuestionMembershipRow[]
): LearningChain | null {
	const sortedQuestions = questions.filter(questionHasSafeTitle).sort(sortQuestions);
	const firstQuestion = sortedQuestions[0];
	if (!firstQuestion) return null;

	const subject = subjectName(row);
	const stepTexts = steps.length
		? steps
				.sort((a, b) => a.display_order - b.display_order)
				.map((step) => step.step_text.replace(/\.$/, ''))
		: fallbackSteps(row.canonical_chain_text);

	return {
		id: row.id,
		title: row.title,
		subject,
		topic: row.broad_topic ?? topicFromRow(firstQuestion),
		symbol: subjectSymbol(subject),
		paperSlug: sourceDocumentSlug(firstQuestion.source_document_id),
		paperLabel: `${subject} · ${sortedQuestions.length} questions`,
		summary:
			row.summary ??
			`Practise ${sortedQuestions.length} questions that use the same thinking chain.`,
		steps: stepTexts,
		weakLink:
			steps.find((step) => step.common_omission)?.common_omission ??
			'Use each link in the chain before jumping to the final answer.',
		primaryRef: firstQuestion.id,
		accent: subjectAccent(subject),
		illustration: null,
		questions: sortedQuestions.map((question) => toQuestionTeaser(question, steps))
	};
}

async function fetchChainRows() {
	return queryRows<ChainRow>(
		`SELECT ac.id, ac.title, ac.canonical_chain_text, ac.subject, ac.subject_area,
		        ac.broad_topic, ac.summary, ac.confidence, ac.needs_human_review,
		        COUNT(DISTINCT q.id) AS question_count
		 FROM answer_chains ac
		 JOIN question_answer_chains qac ON qac.answer_chain_id = ac.id
		 JOIN questions q ON q.id = qac.question_id
		 WHERE ac.needs_human_review = 0
		   AND ac.status = 'published'
		   AND qac.needs_human_review = 0
		   AND q.needs_human_review = 0
		   AND q.status = 'published'
		 GROUP BY ac.id
		 HAVING question_count > 0
		 ORDER BY ac.needs_human_review ASC,
		          CASE WHEN question_count > 1 THEN 0 ELSE 1 END,
		          COALESCE(ac.confidence, 0) DESC,
		          question_count DESC,
		          ac.subject_area,
		          ac.title`
	);
}

async function fetchStepRows() {
	return queryRows<ChainStepRow>(
		`SELECT id, answer_chain_id, display_order, step_text, common_omission
		 FROM answer_chain_steps
		 ORDER BY answer_chain_id, display_order`
	);
}

async function fetchQuestionRows() {
	return queryRows<QuestionMembershipRow>(
		`SELECT qac.answer_chain_id, qac.transfer_distance, qac.display_order,
		        q.id, q.source_document_id, q.source_question_ref, q.prompt_text,
		        q.self_contained_prompt_text,
		        q.command_word, q.marks, q.subject, q.subject_area, q.paper,
		        q.series, q.year, q.topic_path_json, q.metadata_json,
		        sd.board AS source_board, sd.qualification AS source_qualification,
		        sd.subject AS source_subject, sd.tier AS source_tier,
		        sd.paper AS source_paper, sd.series AS source_series,
		        sd.year AS source_year, sd.component_code AS source_component_code,
		        cwa.weak_answer_text AS weak_answer_text,
		        cwa.explanation AS weak_answer_explanation,
		        cwa.missing_chain_step_ids_json AS weak_missing_chain_step_ids_json
		 FROM question_answer_chains qac
		 JOIN questions q ON q.id = qac.question_id
		 LEFT JOIN source_documents sd ON sd.id = q.source_document_id
		 LEFT JOIN common_weak_answers cwa
		   ON cwa.question_id = q.id
		  AND cwa.needs_human_review = 0
		  AND cwa.id = (
			SELECT cwa2.id
			FROM common_weak_answers cwa2
			WHERE cwa2.question_id = q.id
			  AND cwa2.needs_human_review = 0
			ORDER BY CASE
			           WHEN cwa2.explanation IS NOT NULL AND TRIM(cwa2.explanation) <> '' THEN 0
			           ELSE 1
			         END,
			         CASE
			           WHEN cwa2.missing_chain_step_ids_json IS NOT NULL
			             AND cwa2.missing_chain_step_ids_json <> '[]' THEN 0
			           ELSE 1
			         END,
			         COALESCE(cwa2.confidence, 0) DESC,
			         LENGTH(COALESCE(cwa2.explanation, '')) DESC,
			         cwa2.id
			LIMIT 1
		  )
		 WHERE qac.needs_human_review = 0
		   AND q.needs_human_review = 0
		   AND q.status = 'published'
		 ORDER BY qac.answer_chain_id,
		          CASE qac.transfer_distance
		            WHEN 'start' THEN 0
		            WHEN 'near' THEN 1
		            WHEN 'stretch' THEN 2
		            WHEN 'exam_transfer' THEN 3
		            ELSE 4
		          END,
		          COALESCE(qac.display_order, 9999),
		          q.year,
		          q.source_question_ref`
	);
}

async function fetchQuestionBankRows(filter?: { board: string; subject: string }) {
	const exactProfileClause = filter ? '\n\t\t   AND q.board = ?\n\t\t   AND q.subject = ?' : '';
	return queryRows<QuestionBankQuestionRow>(
		`SELECT
		        q.id,
		        q.slug,
		        q.source_document_id,
		        q.source_question_ref,
		        q.display_order,
		        q.prompt_text,
		        q.self_contained_prompt_text,
		        q.command_word,
		        q.marks,
		        q.board,
		        q.qualification,
		        q.subject,
		        q.subject_area,
		        q.tier,
		        q.paper,
		        q.component_code,
		        q.series,
		        q.year,
		        q.topic_path_json,
		        q.metadata_json,
		        sd.board AS source_board,
		        sd.qualification AS source_qualification,
		        sd.subject AS source_subject,
		        sd.tier AS source_tier,
		        sd.paper AS source_paper,
		        sd.component_code AS source_component_code,
		        sd.series AS source_series,
		        sd.year AS source_year,
		        qac.answer_chain_id,
		        ac.title AS chain_title,
		        (SELECT ma.answer_text
		           FROM model_answers ma
		          WHERE ma.question_id = q.id
		            AND ma.needs_human_review = 0
		          ORDER BY ma.confidence DESC, ma.id
		          LIMIT 1) AS reviewed_answer_text
		 FROM questions q
		 LEFT JOIN source_documents sd ON sd.id = q.source_document_id
		 JOIN question_answer_chains qac
		   ON qac.question_id = q.id
		  AND qac.needs_human_review = 0
		 JOIN answer_chains ac
		   ON ac.id = qac.answer_chain_id
		  AND ac.needs_human_review = 0
		  AND ac.status = 'published'
		 WHERE q.needs_human_review = 0
		   AND q.status = 'published'
		   ${exactProfileClause}
		 ORDER BY
		   COALESCE(q.board, sd.board, 'AQA'),
		   COALESCE(q.subject_area, q.subject, sd.subject, ''),
		   COALESCE(q.year, sd.year, 0) DESC,
		   COALESCE(q.paper, sd.paper, ''),
		   qac.is_primary DESC,
		   CASE qac.transfer_distance
		     WHEN 'start' THEN 0
		     WHEN 'near' THEN 1
		     WHEN 'stretch' THEN 2
		     WHEN 'exam_transfer' THEN 3
		     ELSE 4
		   END,
		   COALESCE(qac.fit_confidence, 0) DESC,
		   COALESCE(q.display_order, 9999),
		   q.source_question_ref,
		   q.id`,
		filter ? [filter.board, filter.subject] : []
	);
}

function hydrateQuestionBankQuestion(row: QuestionBankQuestionRow): QuestionBankQuestion {
	const topicPath = parseTopicPath(row.topic_path_json);
	const subject = questionSubjectName(row);
	const paper = questionPaper(row);
	const questionWithoutTopicId = {
		id: row.id,
		slug: row.slug,
		title: questionBankTitle(row),
		preview: questionBankPreview(row),
		board: questionBoard(row),
		qualification: questionQualification(row),
		subject,
		tier: cleanNullable(row.tier) ?? cleanNullable(row.source_tier),
		paper,
		componentCode: questionComponentCode(row),
		series: questionSeries(row),
		year: questionYear(row),
		topicPath,
		topic: topicPath.at(-1) ?? paper,
		sourceRef: cleanNullable(row.source_question_ref) ?? row.id,
		marks: row.marks,
		command: cleanNullable(row.command_word) ?? 'Question',
		chainId: cleanNullable(row.answer_chain_id),
		chainTitle: cleanNullable(row.chain_title)
	} satisfies Omit<QuestionBankQuestion, 'topicId'>;
	return {
		...questionWithoutTopicId,
		topicId: topicSeedForQuestion(questionWithoutTopicId).id
	};
}

function dedupeQuestionBankRows(rows: QuestionBankQuestionRow[]): QuestionBankQuestion[] {
	const byQuestionId = new Map<string, QuestionBankQuestion>();
	for (const row of rows) {
		if (byQuestionId.has(row.id)) continue;
		const question = hydrateQuestionBankQuestion(row);
		if (
			storedQuestionTitleIssues({
				title: question.title,
				subject: question.subject,
				promptText: row.prompt_text,
				selfContainedPromptText: row.self_contained_prompt_text,
				answerText: row.reviewed_answer_text
			}).length > 0
		) {
			continue;
		}
		byQuestionId.set(row.id, question);
	}
	return [...byQuestionId.values()];
}

function buildQuestionBankTopics(questions: QuestionBankQuestion[]): QuestionBankTopic[] {
	const topics = new Map<string, QuestionBankTopic>();
	const chainIdsByTopic = new Map<string, Set<string>>();

	for (const question of questions) {
		const seed = topicSeedForQuestion(question);
		const topic = topics.get(seed.id) ?? seed;
		topic.questionCount += 1;
		topic.firstQuestionId ??= question.id;
		topic.firstQuestionTitle ??= question.title;
		if (question.chainId) {
			const chainIds = chainIdsByTopic.get(seed.id) ?? new Set<string>();
			chainIds.add(question.chainId);
			chainIdsByTopic.set(seed.id, chainIds);
			topic.chainCount = chainIds.size;
		}
		topics.set(seed.id, topic);
	}

	return [...topics.values()].sort(
		(left, right) =>
			subjectSortRank(left.subject) - subjectSortRank(right.subject) ||
			left.board.localeCompare(right.board) ||
			topicSortRank(left) - topicSortRank(right) ||
			right.questionCount - left.questionCount ||
			left.title.localeCompare(right.title)
	);
}

async function fetchChainRow(chainId: string) {
	const rows = await queryRows<ChainRow>(
		`SELECT ac.id, ac.title, ac.canonical_chain_text, ac.subject, ac.subject_area,
		        ac.broad_topic, ac.summary, ac.confidence, ac.needs_human_review,
		        COUNT(DISTINCT q.id) AS question_count
		 FROM answer_chains ac
		 JOIN question_answer_chains qac ON qac.answer_chain_id = ac.id
		 JOIN questions q ON q.id = qac.question_id
		 WHERE (ac.id = ? OR ac.slug = ?)
		   AND ac.needs_human_review = 0
		   AND ac.status = 'published'
		   AND qac.needs_human_review = 0
		   AND q.needs_human_review = 0
		   AND q.status = 'published'
		 GROUP BY ac.id
		 HAVING question_count > 0
		 LIMIT 1`,
		[chainId, chainId]
	);
	return rows[0] ?? null;
}

async function fetchStepRowsForChain(chainId: string) {
	return queryRows<ChainStepRow>(
		`SELECT id, answer_chain_id, display_order, step_text, common_omission
		 FROM answer_chain_steps
		 WHERE answer_chain_id = ?
		 ORDER BY display_order`,
		[chainId]
	);
}

async function fetchQuestionRowsForChain(chainId: string) {
	return queryRows<QuestionMembershipRow>(
		`SELECT qac.answer_chain_id, qac.transfer_distance, qac.display_order,
		        q.id, q.source_document_id, q.source_question_ref, q.prompt_text,
		        q.command_word, q.marks, q.subject, q.subject_area, q.paper,
		        q.series, q.year, q.topic_path_json, q.metadata_json,
		        sd.board AS source_board, sd.qualification AS source_qualification,
		        sd.subject AS source_subject, sd.tier AS source_tier,
		        sd.paper AS source_paper, sd.series AS source_series,
		        sd.year AS source_year, sd.component_code AS source_component_code,
		        cwa.weak_answer_text AS weak_answer_text,
		        cwa.explanation AS weak_answer_explanation,
		        cwa.missing_chain_step_ids_json AS weak_missing_chain_step_ids_json
		 FROM question_answer_chains qac
		 JOIN questions q ON q.id = qac.question_id
		 LEFT JOIN source_documents sd ON sd.id = q.source_document_id
		 LEFT JOIN common_weak_answers cwa
		   ON cwa.question_id = q.id
		  AND cwa.needs_human_review = 0
		  AND cwa.id = (
			SELECT cwa2.id
			FROM common_weak_answers cwa2
			WHERE cwa2.question_id = q.id
			  AND cwa2.needs_human_review = 0
			ORDER BY CASE
			           WHEN cwa2.explanation IS NOT NULL AND TRIM(cwa2.explanation) <> '' THEN 0
			           ELSE 1
			         END,
			         CASE
			           WHEN cwa2.missing_chain_step_ids_json IS NOT NULL
			             AND cwa2.missing_chain_step_ids_json <> '[]' THEN 0
			           ELSE 1
			         END,
			         COALESCE(cwa2.confidence, 0) DESC,
			         LENGTH(COALESCE(cwa2.explanation, '')) DESC,
			         cwa2.id
			LIMIT 1
		  )
		 WHERE qac.answer_chain_id = ?
		   AND qac.needs_human_review = 0
		   AND q.needs_human_review = 0
		   AND q.status = 'published'
		 ORDER BY CASE qac.transfer_distance
		            WHEN 'start' THEN 0
		            WHEN 'near' THEN 1
		            WHEN 'stretch' THEN 2
		            WHEN 'exam_transfer' THEN 3
		            ELSE 4
		          END,
		          COALESCE(qac.display_order, 9999),
		          q.year,
		          q.source_question_ref`,
		[chainId]
	);
}

const homeFeaturedChainIds = [
	'bio-chain-vaccine-antigen-antibodies-memory-immunity',
	'chem-chain-alloy-hardness-distorted-layers',
	'physics-chain-grid-transformer-efficiency'
] as const;

function homeQuestionScore(question: ChainQuestionTeaser) {
	const marks = question.marks ?? 0;
	const extendedExplanation = marks >= 3 && marks <= 6 ? 20 : 0;
	const explanationCommand = /^(?:describe|explain|evaluate|justify|suggest)$/i.test(
		question.command
	)
		? 8
		: 0;
	return extendedExplanation + explanationCommand + marks;
}

function homeReadyChains(chains: LearningChain[]): LearningChain[] {
	return chains
		.map((chain) => ({
			...chain,
			questions: chain.questions.filter(
				(question) =>
					storedQuestionTitleIssues({
						title: question.title,
						subject: chain.subject
					}).length === 0
			)
		}))
		.filter((chain) => chain.questions.length > 0);
}

function featuredHomeChains(chains: LearningChain[]) {
	const preferred = homeFeaturedChainIds
		.map((chainId) => chains.find((chain) => chain.id === chainId))
		.filter((chain): chain is LearningChain => Boolean(chain));
	const selected = [...preferred, ...chains.filter((chain) => !preferred.includes(chain))].slice(
		0,
		3
	);

	return selected.map((chain) => ({
		...chain,
		questions: [...chain.questions].sort(
			(questionA, questionB) => homeQuestionScore(questionB) - homeQuestionScore(questionA)
		)
	}));
}

function summarizeChains(chains: LearningChain[]): HomePagePublicData {
	const readyChains = homeReadyChains(chains);
	const subjects = new Set(readyChains.map((chain) => chain.subject).filter(Boolean));
	return {
		featuredChains: featuredHomeChains(readyChains),
		stats: {
			chainCount: readyChains.length,
			questionCount: readyChains.reduce((total, chain) => total + chain.questions.length, 0),
			subjectCount: subjects.size
		}
	};
}

export async function getExplorableLearningChains(): Promise<LearningChain[]> {
	const [chains, steps, questions] = await Promise.all([
		fetchChainRows(),
		fetchStepRows(),
		fetchQuestionRows()
	]);

	const stepsByChain = groupBy(steps, (step) => step.answer_chain_id);
	const questionsByChain = groupBy(questions, (question) => question.answer_chain_id);
	return chains
		.map((chain) =>
			buildLearningChain(
				chain,
				stepsByChain.get(chain.id) ?? [],
				questionsByChain.get(chain.id) ?? []
			)
		)
		.filter((chain): chain is LearningChain => Boolean(chain));
}

export async function getQuestionBankQuestions(): Promise<QuestionBankQuestion[]> {
	return dedupeQuestionBankRows(await fetchQuestionBankRows());
}

/**
 * Signed-in subject hubs should read their current reviewed questions directly.
 * They must not inherit the deliberately small/stale public browse snapshot.
 */
export async function getQuestionBankQuestionsForSubject(
	board: string,
	subject: string
): Promise<QuestionBankQuestion[]> {
	return dedupeQuestionBankRows(await fetchQuestionBankRows({ board, subject }));
}

export async function getFreshQuestionBankBrowseData(): Promise<QuestionBankBrowseData> {
	const questions = await getQuestionBankQuestions();
	return {
		questions,
		topics: buildQuestionBankTopics(questions)
	};
}

export async function getQuestionBankBrowseData(): Promise<QuestionBankBrowseData> {
	const materialized = await getPublicRoutePayload<QuestionBankBrowseData>(
		questionBankBrowsePayloadId
	);
	if (!materialized?.questions || !materialized.topics) {
		throw new Error(`Missing current public route payload: ${questionBankBrowsePayloadId}`);
	}
	return materialized;
}

const questionBankPageSize = 24;
const questionBankMarksFilters = new Set(['all', '1-2', '3-4', '5-6', '7+']);
const questionBankSubjectOrder = [
	'Science',
	'Biology',
	'Chemistry',
	'Physics',
	'Computer Science',
	'Geography',
	'History',
	'English Language',
	'English Literature'
];

function browseSubjectMatches(candidate: string, selected: string) {
	if (selected === 'All subjects') return true;
	if (selected === 'Science') return subjectBelongsToScience(candidate);
	return candidate === selected;
}

function browseMarksMatch(marks: number | null, selected: string) {
	if (selected === 'all') return true;
	if (marks === null) return false;
	if (selected === '1-2') return marks >= 1 && marks <= 2;
	if (selected === '3-4') return marks >= 3 && marks <= 4;
	if (selected === '5-6') return marks >= 5 && marks <= 6;
	return selected === '7+' ? marks >= 7 : true;
}

function browseQuestionSearchText(question: QuestionBankQuestion) {
	return normaliseCurriculumText(
		[
			question.title,
			question.preview,
			question.board,
			question.subject,
			question.paper,
			question.componentCode,
			question.series,
			question.sourceRef,
			question.topicPath.join(' '),
			question.chainTitle
		]
			.filter(Boolean)
			.join(' ')
	);
}

function fallbackBrowseTopic(question: QuestionBankQuestion): QuestionBankTopic {
	return {
		id: question.topicId,
		board: question.board,
		qualification: question.qualification,
		subject: question.subject,
		code: null,
		title: question.topic,
		paper: question.paper,
		specUrl: null,
		questionCount: 0,
		chainCount: 0,
		firstQuestionId: question.id,
		firstQuestionTitle: question.title
	};
}

/**
 * Produces the small, server-filtered payload used by the public question bank.
 * The complete materialized bank remains server-side instead of being serialized
 * into every phone and tablet response.
 */
export async function getQuestionBankBrowsePageData(
	input: Partial<QuestionBankBrowseFilters>
): Promise<QuestionBankBrowsePageData> {
	const browseData = await getQuestionBankBrowseData();
	const search = cleanSingleLine(input.search ?? '').slice(0, 120);
	const requestedSubject = cleanSingleLine(input.subject ?? '');
	const availableSubjectSet = new Set(browseData.questions.map((question) => question.subject));
	const canonicalSubject = canonicalCurriculumSubject(requestedSubject);
	const subject =
		requestedSubject === 'Science'
			? 'Science'
			: canonicalSubject &&
				  canonicalSubject !== 'Science' &&
				  availableSubjectSet.has(canonicalSubject)
				? canonicalSubject
				: availableSubjectSet.has(requestedSubject)
					? requestedSubject
					: 'All subjects';
	const subjects = [
		'All subjects',
		...questionBankSubjectOrder.filter((candidate) => {
			if (candidate === 'Science') {
				return [...availableSubjectSet].some((available) => subjectBelongsToScience(available));
			}
			return availableSubjectSet.has(candidate);
		}),
		...[...availableSubjectSet]
			.filter((candidate) => !questionBankSubjectOrder.includes(candidate))
			.sort((left, right) => left.localeCompare(right))
	];

	const subjectQuestions = browseData.questions.filter((question) =>
		browseSubjectMatches(question.subject, subject)
	);
	const boards = [
		'all',
		...[...new Set(subjectQuestions.map((question) => question.board))].sort((left, right) =>
			left.localeCompare(right)
		)
	];
	const board = boards.includes(input.board ?? '') ? (input.board as string) : 'all';
	const topicCandidates = browseData.topics.filter(
		(topic) =>
			browseSubjectMatches(topic.subject, subject) &&
			(board === 'all' || topic.board === board) &&
			topic.questionCount > 0
	);
	const requestedTopic = cleanSingleLine(input.topic ?? 'all') || 'all';
	const topic =
		requestedTopic === 'all' || topicCandidates.some((candidate) => candidate.id === requestedTopic)
			? requestedTopic
			: 'all';
	const marks = questionBankMarksFilters.has(input.marks ?? '') ? (input.marks as string) : 'all';
	const searchTerms = normaliseCurriculumText(search).split(/\s+/).filter(Boolean);

	const filteredQuestions = subjectQuestions.filter((question) => {
		if (board !== 'all' && question.board !== board) return false;
		if (topic !== 'all' && question.topicId !== topic) return false;
		if (!browseMarksMatch(question.marks, marks)) return false;
		if (searchTerms.length === 0) return true;
		const haystack = browseQuestionSearchText(question);
		return searchTerms.every((term) => haystack.includes(term));
	});
	const totalQuestions = filteredQuestions.length;
	const pageCount = Math.max(1, Math.ceil(totalQuestions / questionBankPageSize));
	const requestedPage = Number.isFinite(input.page) ? Math.floor(input.page as number) : 1;
	const page = Math.min(Math.max(1, requestedPage), pageCount);
	const pageQuestions = filteredQuestions.slice(
		(page - 1) * questionBankPageSize,
		page * questionBankPageSize
	);
	const resultStart = totalQuestions === 0 ? 0 : (page - 1) * questionBankPageSize + 1;
	const resultEnd = Math.min(page * questionBankPageSize, totalQuestions);
	const topicById = new Map(browseData.topics.map((candidate) => [candidate.id, candidate]));
	const sectionByTopicId = new Map<string, QuestionBankBrowseSection>();
	for (const question of pageQuestions) {
		const existing = sectionByTopicId.get(question.topicId);
		if (existing) {
			existing.questions.push(question);
			continue;
		}
		sectionByTopicId.set(question.topicId, {
			topic: topicById.get(question.topicId) ?? fallbackBrowseTopic(question),
			questions: [question]
		});
	}

	return {
		filters: { search, subject, marks, topic, board, page },
		sections: [...sectionByTopicId.values()],
		subjects,
		boards,
		topicOptions: topicCandidates.map((candidate) => ({
			id: candidate.id,
			title: candidate.title
		})),
		totalQuestions,
		resultStart,
		resultEnd,
		page,
		pageCount
	};
}

export async function getFreshHomePagePublicData(): Promise<HomePagePublicData> {
	return summarizeChains(await getExplorableLearningChains());
}

export async function getHomePagePublicData(): Promise<HomePagePublicData> {
	const materialized = await getPublicRoutePayload<HomePagePublicData>(homePublicSummaryPayloadId);
	if (!materialized?.featuredChains || !materialized.stats) {
		throw new Error(`Missing current public route payload: ${homePublicSummaryPayloadId}`);
	}
	return materialized;
}

export async function getExplorableLearningChain(chainId: string): Promise<LearningChain | null> {
	const row = await fetchChainRow(chainId);
	if (!row) return null;

	const [steps, questions] = await Promise.all([
		fetchStepRowsForChain(row.id),
		fetchQuestionRowsForChain(row.id)
	]);
	const chain = buildLearningChain(row, steps, questions);
	if (!chain) return null;

	return {
		...chain,
		illustration: await getPublishedChainIllustration(row.id)
	};
}

export { getQuestionTeaser };
