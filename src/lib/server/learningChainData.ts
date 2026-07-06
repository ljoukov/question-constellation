import {
	getLearningChain,
	getQuestionTeaser,
	learningChains,
	type ChainQuestionLabel,
	type ChainQuestionTeaser,
	type LearningChain
} from '$lib/learningChains';
import { sourceDocumentSlug } from './questionExperimentData';
import { queryRows } from './db';

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

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
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

function sentenceTitle(text: string, fallback: string) {
	const cleaned = cleanPromptText(text);
	const sentence =
		cleaned.match(
			/(?:Explain|Calculate|Determine|Describe|Give|State|What|Which|Why|How|Name|Suggest|Compare|Draw|Complete|Use)\b[^.?!]*(?:[.?!]|$)/i
		)?.[0] ??
		cleaned.split(/(?<=[.?!])\s+/)[0] ??
		fallback;
	const normalized = sentence.replace(/\s+/g, ' ').trim() || fallback;
	return truncateRichText(normalized, 74);
}

function teaserFromPrompt(text: string) {
	const cleaned = cleanPromptText(text);
	return truncateRichText(cleaned, 132);
}

function titleFromQuestion(row: QuestionMembershipRow) {
	const metadata = parseJson<{ title?: string }>(row.metadata_json, {});
	if (metadata.title) return metadata.title;
	return sentenceTitle(row.prompt_text, row.source_question_ref);
}

function topicFromRow(row: QuestionMembershipRow) {
	const topicPath = parseJson<string[]>(row.topic_path_json, []);
	return topicPath.at(-1) ?? row.subject_area ?? row.paper ?? 'GCSE science';
}

function subjectName(row: Pick<ChainRow, 'subject' | 'subject_area'>) {
	return row.subject_area ?? row.subject ?? 'Science';
}

function subjectSymbol(subject: string) {
	const lower = subject.toLowerCase();
	if (lower.includes('biology')) return '🧬';
	if (lower.includes('chemistry')) return '⚗️';
	if (lower.includes('physics')) return '⚛️';
	if (lower.includes('computer')) return '</>';
	if (lower.includes('geography')) return '⌖';
	if (lower.includes('history')) return '¶';
	if (lower.includes('english')) return 'Aa';
	return '✦';
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
	const sortedQuestions = [...questions].sort(sortQuestions);
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
		paperLabel: `${subject} · ${row.question_count} questions`,
		summary:
			row.summary ??
			`Practise ${sortedQuestions.length} questions that use the same thinking chain.`,
		steps: stepTexts,
		weakLink:
			steps.find((step) => step.common_omission)?.common_omission ??
			'Use each link in the chain before jumping to the final answer.',
		primaryRef: firstQuestion.id,
		accent: subjectAccent(subject),
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
		   AND EXISTS (
			SELECT 1
			FROM question_rendering_overlays qro
			WHERE qro.question_id = q.id
		 )
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
		   AND EXISTS (
			SELECT 1
			FROM question_rendering_overlays qro
			WHERE qro.question_id = q.id
		 )
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
		   AND EXISTS (
			SELECT 1
			FROM question_rendering_overlays qro
			WHERE qro.question_id = q.id
		   )
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
		   AND EXISTS (
			SELECT 1
			FROM question_rendering_overlays qro
			WHERE qro.question_id = q.id
		   )
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

export async function getExplorableLearningChains(): Promise<LearningChain[]> {
	try {
		const [chains, steps, questions] = await Promise.all([
			fetchChainRows(),
			fetchStepRows(),
			fetchQuestionRows()
		]);

		const stepsByChain = groupBy(steps, (step) => step.answer_chain_id);
		const questionsByChain = groupBy(questions, (question) => question.answer_chain_id);
		const result = chains
			.map((chain) =>
				buildLearningChain(
					chain,
					stepsByChain.get(chain.id) ?? [],
					questionsByChain.get(chain.id) ?? []
				)
			)
			.filter((chain): chain is LearningChain => Boolean(chain));

		return result.length > 0 ? result : learningChains;
	} catch (error) {
		console.error('[learningChainData] falling back to static chains', error);
		return learningChains;
	}
}

export async function getExplorableLearningChain(chainId: string): Promise<LearningChain | null> {
	try {
		const row = await fetchChainRow(chainId);
		if (!row) return getLearningChain(chainId);

		const [steps, questions] = await Promise.all([
			fetchStepRowsForChain(row.id),
			fetchQuestionRowsForChain(row.id)
		]);
		return buildLearningChain(row, steps, questions);
	} catch (error) {
		console.error('[learningChainData] falling back to static chain', error);
		return getLearningChain(chainId);
	}
}

export { getQuestionTeaser };
