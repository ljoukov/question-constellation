import { queryRows } from './db';
import { getQuestionBankBrowseData } from './learningChainData';
import type { SitemapEntry } from './sitemap';

type QuestionSeoRow = {
	id: string;
	source_question_ref: string | null;
	command_word: string | null;
	marks: number | null;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	subject_area: string | null;
	tier: string | null;
	paper: string | null;
	series: string | null;
	year: number | null;
	topic_path_json: string | null;
};

export type SeoTopicQuestion = {
	id: string;
	sourceRef: string;
	title: string;
	meta: string;
	marks: number | null;
};

export type SeoTopicPage = {
	id: string;
	path: string;
	board: string;
	boardSlug: string;
	qualification: string;
	subject: string;
	subjectSlug: string;
	topic: string;
	topicSlug: string;
	title: string;
	description: string;
	questionCount: number;
	questions: SeoTopicQuestion[];
};

const PUBLIC_QUESTION_WHERE = `
	q.needs_human_review = 0
	AND q.status = 'published'
	AND EXISTS (
		SELECT 1
		FROM question_rendering_overlays qro
		WHERE qro.question_id = q.id
	)
	AND LOWER(
		COALESCE(q.subject, '') || ' ' ||
		COALESCE(q.subject_area, '') || ' ' ||
		COALESCE(q.paper, '')
	) NOT LIKE '%english%'
`;

function encodePathSegment(value: string) {
	return encodeURIComponent(value);
}

function normalizeWhitespace(value: string | null | undefined) {
	return (value ?? '').replace(/\s+/g, ' ').trim();
}

export function slugifySeoPart(value: string) {
	return normalizeWhitespace(value)
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function parseTopicPath(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		if (Array.isArray(parsed)) {
			return parsed
				.map((item) => (typeof item === 'string' ? normalizeWhitespace(item) : ''))
				.filter(Boolean);
		}
		if (typeof parsed === 'string') {
			const cleaned = normalizeWhitespace(parsed);
			return cleaned ? [cleaned] : [];
		}
	} catch {
		const cleaned = normalizeWhitespace(value);
		return cleaned ? [cleaned] : [];
	}
	return [];
}

function topicFromRow(row: QuestionSeoRow) {
	const topicPath = parseTopicPath(row.topic_path_json);
	return topicPath[topicPath.length - 1] ?? '';
}

function boardFromRow(row: QuestionSeoRow) {
	return normalizeWhitespace(row.board) || 'AQA';
}

function qualificationFromRow(row: QuestionSeoRow) {
	return normalizeWhitespace(row.qualification) || 'GCSE';
}

function subjectFromRow(row: QuestionSeoRow) {
	return normalizeWhitespace(row.subject_area) || normalizeWhitespace(row.subject) || 'Science';
}

function questionTitle(row: QuestionSeoRow) {
	const board = boardFromRow(row);
	const qualification = qualificationFromRow(row);
	const subject = subjectFromRow(row);
	const ref = normalizeWhitespace(row.source_question_ref);
	return [board, qualification, subject, ref ? `Question ${ref}` : 'exam question']
		.filter(Boolean)
		.join(' ');
}

function questionMeta(row: QuestionSeoRow) {
	return [
		normalizeWhitespace(row.paper),
		normalizeWhitespace(row.series),
		row.year ? String(row.year) : '',
		row.marks ? `${row.marks} marks` : ''
	]
		.filter(Boolean)
		.join(' · ');
}

async function fetchPublicQuestionSeoRows() {
	return await queryRows<QuestionSeoRow>(
		`SELECT q.id, q.source_question_ref, q.command_word, q.marks,
		        COALESCE(q.board, sd.board) AS board,
		        COALESCE(q.qualification, sd.qualification) AS qualification,
		        COALESCE(q.subject, sd.subject) AS subject,
		        q.subject_area, COALESCE(q.tier, sd.tier) AS tier,
		        COALESCE(q.paper, sd.paper) AS paper,
		        COALESCE(q.series, sd.series) AS series,
		        COALESCE(q.year, sd.year) AS year,
		        q.topic_path_json
		 FROM questions q
		 LEFT JOIN source_documents sd ON sd.id = q.source_document_id
		 JOIN question_answer_chains qac
		   ON qac.question_id = q.id
		  AND qac.needs_human_review = 0
		 JOIN answer_chains ac
		   ON ac.id = qac.answer_chain_id
		  AND ac.needs_human_review = 0
		  AND ac.status = 'published'
		 WHERE ${PUBLIC_QUESTION_WHERE}
		 ORDER BY board, qualification, subject, year DESC, paper, q.source_question_ref, q.id`
	);
}

export async function getPublicQuestionSitemapEntries(): Promise<SitemapEntry[]> {
	const browseData = await getQuestionBankBrowseData();
	return browseData.questions.map((question) => ({
		path: `/questions/${encodePathSegment(question.id)}`,
		changefreq: 'monthly',
		priority: '0.78'
	}));
}

export async function getPublicChainSitemapEntries(): Promise<SitemapEntry[]> {
	const browseData = await getQuestionBankBrowseData();
	const questionCountByChain = new Map<string, number>();
	for (const question of browseData.questions) {
		if (!question.chainId) continue;
		questionCountByChain.set(
			question.chainId,
			(questionCountByChain.get(question.chainId) ?? 0) + 1
		);
	}
	return [...questionCountByChain]
		.sort(
			([leftId, leftCount], [rightId, rightCount]) =>
				rightCount - leftCount || leftId.localeCompare(rightId)
		)
		.map(([chainId, questionCount]) => ({
			path: `/constellations/${encodePathSegment(chainId)}`,
			changefreq: 'monthly',
			priority: questionCount > 1 ? '0.76' : '0.68'
		}));
}

function topicPageId(boardSlug: string, subjectSlug: string, topicSlug: string) {
	return `${boardSlug}/${subjectSlug}/${topicSlug}`;
}

function topicPagePath(boardSlug: string, subjectSlug: string, topicSlug: string) {
	return `/gcse/${boardSlug}/${subjectSlug}/${topicSlug}-questions`;
}

function buildTopicPages(rows: QuestionSeoRow[]) {
	const groups = new Map<string, SeoTopicPage>();
	const seenQuestionIdsByGroup = new Map<string, Set<string>>();

	for (const row of rows) {
		const topic = topicFromRow(row);
		if (!topic) continue;

		const board = boardFromRow(row);
		const qualification = qualificationFromRow(row);
		if (qualification.toLowerCase() !== 'gcse') continue;

		const subject = subjectFromRow(row);
		const boardSlug = slugifySeoPart(board);
		const subjectSlug = slugifySeoPart(subject);
		const topicSlug = slugifySeoPart(topic);
		if (!boardSlug || !subjectSlug || !topicSlug) continue;

		const id = topicPageId(boardSlug, subjectSlug, topicSlug);
		let group = groups.get(id);
		if (!group) {
			group = {
				id,
				path: topicPagePath(boardSlug, subjectSlug, topicSlug),
				board,
				boardSlug,
				qualification,
				subject,
				subjectSlug,
				topic,
				topicSlug,
				title: `${board} GCSE ${subject} ${topic} questions`,
				description: `Practise ${board} GCSE ${subject} ${topic} exam questions with clear paper details and marking support.`,
				questionCount: 0,
				questions: []
			};
			groups.set(id, group);
			seenQuestionIdsByGroup.set(id, new Set());
		}

		const seenQuestionIds = seenQuestionIdsByGroup.get(id);
		if (seenQuestionIds?.has(row.id)) continue;
		seenQuestionIds?.add(row.id);

		group.questions.push({
			id: row.id,
			sourceRef: normalizeWhitespace(row.source_question_ref),
			title: questionTitle(row),
			meta: questionMeta(row),
			marks: row.marks
		});
	}

	for (const group of groups.values()) {
		group.questionCount = group.questions.length;
		group.questions.sort((a, b) => a.title.localeCompare(b.title));
	}

	return Array.from(groups.values())
		.filter((group) => group.questionCount >= 2)
		.sort((a, b) => b.questionCount - a.questionCount || a.title.localeCompare(b.title));
}

export async function getSeoTopicPages(): Promise<SeoTopicPage[]> {
	const [rows, browseData] = await Promise.all([
		fetchPublicQuestionSeoRows(),
		getQuestionBankBrowseData()
	]);
	const visibleQuestionIds = new Set(browseData.questions.map((question) => question.id));
	return buildTopicPages(rows.filter((row) => visibleQuestionIds.has(row.id)));
}

export async function getSeoTopicSitemapEntries(): Promise<SitemapEntry[]> {
	return (await getSeoTopicPages()).map((topic) => ({
		path: topic.path,
		changefreq: 'monthly',
		priority: topic.questionCount >= 6 ? '0.74' : '0.68'
	}));
}

export async function getSeoTopicPage(
	boardSlug: string,
	subjectSlug: string,
	topicPageSlug: string
): Promise<SeoTopicPage | null> {
	const normalizedTopicSlug = topicPageSlug.replace(/-questions$/, '');
	const id = topicPageId(boardSlug, subjectSlug, normalizedTopicSlug);
	return (await getSeoTopicPages()).find((topic) => topic.id === id) ?? null;
}
