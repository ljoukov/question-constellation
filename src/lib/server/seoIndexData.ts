import { learningChains } from '$lib/learningChains';
import { queryRows } from './db';
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
	answer_chain_id: string | null;
	chain_title: string | null;
};

type ChainSeoRow = {
	id: string;
	title: string | null;
	subject: string | null;
	broad_topic: string | null;
	question_count: number;
};

export type SeoTopicQuestion = {
	id: string;
	sourceRef: string;
	title: string;
	meta: string;
	marks: number | null;
	chainId: string | null;
	chainTitle: string | null;
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
	chains: Array<{ id: string; title: string; questionCount: number }>;
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
		        q.topic_path_json,
		        qac.answer_chain_id,
		        ac.title AS chain_title
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
	const rows = await fetchPublicQuestionSeoRows();
	const seen = new Set<string>();
	return rows
		.filter((row) => {
			if (seen.has(row.id)) return false;
			seen.add(row.id);
			return true;
		})
		.map((row) => ({
			path: `/questions/${encodePathSegment(row.id)}`,
			changefreq: 'monthly',
			priority: '0.78'
		}));
}

export async function getPublicChainSitemapEntries(): Promise<SitemapEntry[]> {
	try {
		const rows = await queryRows<ChainSeoRow>(
			`SELECT ac.id, ac.title, ac.subject, ac.broad_topic,
			        COUNT(DISTINCT q.id) AS question_count
			 FROM answer_chains ac
			 JOIN question_answer_chains qac ON qac.answer_chain_id = ac.id
			 JOIN questions q ON q.id = qac.question_id
			 WHERE ac.needs_human_review = 0
			   AND ac.status = 'published'
			   AND qac.needs_human_review = 0
			   AND ${PUBLIC_QUESTION_WHERE}
			 GROUP BY ac.id
			 HAVING question_count > 0
			 ORDER BY CASE WHEN question_count > 1 THEN 0 ELSE 1 END,
			          question_count DESC,
			          ac.subject,
			          ac.title`
		);

		return rows.map((row) => ({
			path: `/chains/${encodePathSegment(row.id)}`,
			changefreq: 'monthly',
			priority: row.question_count > 1 ? '0.76' : '0.68'
		}));
	} catch {
		return learningChains.map((chain) => ({
			path: `/chains/${encodePathSegment(chain.id)}`,
			changefreq: 'monthly',
			priority: chain.questions.length > 1 ? '0.72' : '0.62'
		}));
	}
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
				description: `Practise ${board} GCSE ${subject} ${topic} exam questions, mark-scheme links, and reusable answer chains.`,
				questionCount: 0,
				questions: [],
				chains: []
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
			marks: row.marks,
			chainId: row.answer_chain_id,
			chainTitle: normalizeWhitespace(row.chain_title) || null
		});
	}

	for (const group of groups.values()) {
		group.questionCount = group.questions.length;
		const chainCounts = new Map<string, { id: string; title: string; questionCount: number }>();
		for (const question of group.questions) {
			if (!question.chainId || !question.chainTitle) continue;
			const chain = chainCounts.get(question.chainId) ?? {
				id: question.chainId,
				title: question.chainTitle,
				questionCount: 0
			};
			chain.questionCount += 1;
			chainCounts.set(question.chainId, chain);
		}
		group.chains = Array.from(chainCounts.values()).sort(
			(a, b) => b.questionCount - a.questionCount || a.title.localeCompare(b.title)
		);
		group.questions.sort((a, b) => a.title.localeCompare(b.title));
	}

	return Array.from(groups.values())
		.filter((group) => group.questionCount >= 2)
		.sort((a, b) => b.questionCount - a.questionCount || a.title.localeCompare(b.title));
}

export async function getSeoTopicPages(): Promise<SeoTopicPage[]> {
	return buildTopicPages(await fetchPublicQuestionSeoRows());
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
