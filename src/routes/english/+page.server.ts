import { queryFirst, queryRows } from '$lib/server/db';
import type { PageServerLoad } from './$types';

type EnglishQuestionRow = {
	id: string;
	slug: string;
	source_document_id: string;
	source_question_ref: string;
	display_order: number;
	prompt_text: string;
	command_word: string | null;
	marks: number | null;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	subject_area: string | null;
	paper: string | null;
	component_code: string | null;
	series: string | null;
	year: number | null;
	topic_path_json: string;
	metadata_json: string;
	source_title: string | null;
	source_paper: string | null;
	source_component_code: string | null;
	source_series: string | null;
	source_year: number | null;
	has_model_answer: number | boolean | null;
	has_chain: number | boolean | null;
};

type EnglishCorpusRow = {
	source_documents: number | null;
};

type QuestionMetadata = {
	title?: string;
	source?: string;
	stem?: string;
	sourceQuestionRef?: string;
};

const OCR_BOARD = 'OCR';
const FALLBACK_GUIDED_QUESTION_ID = 'english-lit-romeo-juliet-fate-guided';
const SUBJECT_ORDER = ['English Language', 'English Literature'];
const KNOWN_TEXTS = [
	'Romeo and Juliet',
	'Macbeth',
	'The Merchant of Venice',
	'Much Ado About Nothing',
	'Pride and Prejudice',
	'Great Expectations',
	'The Strange Case of Dr Jekyll and Mr Hyde',
	'A Christmas Carol',
	'An Inspector Calls',
	'Never Let Me Go',
	'Animal Farm',
	'Lord of the Flies',
	"Journey's End",
	'Poetry anthology',
	'Unseen poetry'
];

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function cleanText(value: string | null | undefined) {
	return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, limit: number) {
	if (value.length <= limit) return value;
	return `${value.slice(0, limit - 3).trim()}...`;
}

function truthy(value: number | boolean | null) {
	return value === true || value === 1;
}

function normaliseSubject(row: EnglishQuestionRow, topicPath: string[]) {
	const haystack = [row.subject, row.paper, row.source_paper, row.source_title, ...topicPath]
		.join(' ')
		.toLowerCase();
	if (haystack.includes('literature')) return 'English Literature';
	if (haystack.includes('language')) return 'English Language';
	return row.subject?.includes('Literature') ? 'English Literature' : 'English Language';
}

function canonicalTextMatch(value: string) {
	const normalised = value.toLowerCase().replace(/[\u2019']/g, "'");
	for (const text of KNOWN_TEXTS) {
		const textNormalised = text.toLowerCase().replace(/[\u2019']/g, "'");
		if (normalised.includes(textNormalised)) return text;
	}
	if (/\bunseen\s+poetry\b|\bunseen\s+poem\b/.test(normalised)) return 'Unseen poetry';
	if (/\bpoetry\b|\bpoem\b|\bpoems\b/.test(normalised)) return 'Poetry anthology';
	if (/\bshakespeare\b/.test(normalised)) return 'Shakespeare';
	if (/\bmodern\s+(?:prose|drama|text)\b/.test(normalised)) return 'Modern prose or drama';
	if (/\b19th[-\s]century\b|\bnineteenth[-\s]century\b/.test(normalised)) return '19th-century prose';
	return '';
}

function deriveTextGroup(row: EnglishQuestionRow, subject: string, topicPath: string[], metadata: QuestionMetadata) {
	if (subject !== 'English Literature') return '';
	const haystack = [
		...topicPath,
		metadata.title,
		metadata.stem,
		row.prompt_text,
		row.paper,
		row.source_title
	].join(' ');
	return canonicalTextMatch(haystack);
}

function titleFromPrompt(row: EnglishQuestionRow, metadata: QuestionMetadata) {
	if (metadata.title) return truncate(cleanText(metadata.title), 150);
	if (metadata.stem) return truncate(cleanText(metadata.stem), 150);

	const lines = row.prompt_text
		.split(/\r?\n/)
		.map(cleanText)
		.filter(Boolean)
		.filter((line) => !/^\[?\d+\s+marks?\]?$/i.test(line));
	const commandLine =
		lines.find((line) =>
			/^(?:explore|compare|write|how|what|why|explain|analyse|analyze|evaluate|describe|state|identify|select|choose|tick)\b/i.test(
				line
			)
		) ?? lines.find((line) => line.endsWith('?'));
	return truncate(commandLine ?? lines[0] ?? row.source_question_ref, 150);
}

function deriveQuestionType(row: EnglishQuestionRow, subject: string) {
	const lower = `${row.command_word ?? ''} ${row.prompt_text}`.toLowerCase();
	if (subject === 'English Literature') {
		if (lower.includes('poem') && lower.includes('compare')) return 'Poetry comparison';
		if (lower.includes('unseen')) return 'Unseen poetry';
		if (lower.includes('extract')) return 'Extract essay';
		if (lower.includes('elsewhere')) return 'Whole text essay';
		return row.command_word ? cleanText(row.command_word) : 'Literature essay';
	}
	if (/\bwrite\b|\bletter\b|\barticle\b|\bspeech\b|\baccount\b|\bstory\b|\bdescription\b/.test(lower)) {
		return 'Writing task';
	}
	if (/\bcompare\b|\bcomparison\b/.test(lower)) return 'Comparison';
	if (/\banalyse\b|\banalyze\b|\bexplore\b|\beffect\b|\blanguage\b|\bstructure\b/.test(lower)) {
		return 'Analysis';
	}
	if (/\bselect\b|\bidentify\b|\btick\b|\bstate\b|\bgive\b/.test(lower)) return 'Short answer';
	return row.command_word ? cleanText(row.command_word) : 'Reading question';
}

function marksBand(marks: number | null) {
	if (marks === null) return 'Unknown marks';
	if (marks <= 2) return '1-2 marks';
	if (marks <= 5) return '3-5 marks';
	if (marks <= 10) return '6-10 marks';
	if (marks <= 20) return '11-20 marks';
	return '20+ marks';
}

function uniqueSorted(values: string[]) {
	return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function sortSubjects(subjects: string[]) {
	return uniqueSorted(subjects).sort((left, right) => {
		const leftIndex = SUBJECT_ORDER.indexOf(left);
		const rightIndex = SUBJECT_ORDER.indexOf(right);
		if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
		if (leftIndex === -1) return 1;
		if (rightIndex === -1) return -1;
		return leftIndex - rightIndex;
	});
}

function hydrateQuestion(row: EnglishQuestionRow) {
	const topicPath = parseJson<string[]>(row.topic_path_json, []);
	const metadata = parseJson<QuestionMetadata>(row.metadata_json, {});
	const subject = normaliseSubject(row, topicPath);
	const paper = row.paper ?? row.source_paper ?? row.source_title ?? 'OCR English paper';
	const componentCode = row.component_code ?? row.source_component_code ?? '';
	const series = row.series ?? row.source_series ?? '';
	const year = row.year ?? row.source_year ?? null;
	const title = titleFromPrompt(row, metadata);
	const preview = truncate(cleanText(row.prompt_text), 240);
	const questionType = deriveQuestionType(row, subject);
	const textGroup = deriveTextGroup(row, subject, topicPath, metadata);
	const sourceQuestionRef = metadata.sourceQuestionRef ?? row.source_question_ref;

	return {
		id: row.id,
		slug: row.slug,
		sourceDocumentId: row.source_document_id,
		sourceQuestionRef,
		title,
		preview,
		board: row.board ?? OCR_BOARD,
		qualification: row.qualification ?? 'GCSE',
		subject,
		paper,
		componentCode,
		series,
		year,
		textGroup,
		questionType,
		marks: row.marks,
		marksBand: marksBand(row.marks),
		topicPath,
		sourceTitle: row.source_title ?? paper,
		hasModelAnswer: truthy(row.has_model_answer),
		hasChain: truthy(row.has_chain),
		displayOrder: row.display_order
	};
}

export const load: PageServerLoad = async ({ url }) => {
	try {
		const rows = await queryRows<EnglishQuestionRow>(
			`SELECT q.id, q.slug, q.source_document_id, q.source_question_ref, q.display_order,
			        q.prompt_text, q.command_word, q.marks, q.board, q.qualification, q.subject,
			        q.subject_area, q.paper, q.component_code, q.series, q.year, q.topic_path_json,
			        q.metadata_json, sd.title AS source_title, sd.paper AS source_paper,
			        sd.component_code AS source_component_code, sd.series AS source_series,
				        sd.year AS source_year,
				        EXISTS (
					        SELECT 1
					        FROM model_answers ma
					        WHERE ma.question_id = q.id
					          AND ma.needs_human_review = 0
				        ) AS has_model_answer,
				        EXISTS (
					        SELECT 1
					        FROM question_answer_chains qac
					        JOIN answer_chains ac ON ac.id = qac.answer_chain_id
					        WHERE qac.question_id = q.id
					          AND qac.needs_human_review = 0
					          AND ac.needs_human_review = 0
					          AND ac.status = 'published'
				        ) AS has_chain
			 FROM questions q
			 JOIN source_documents sd ON sd.id = q.source_document_id
			 WHERE q.board = ?
			   AND (q.subject_area = 'English' OR q.subject LIKE 'English%')
			   AND q.needs_human_review = 0
			   AND q.status = 'published'
			 ORDER BY COALESCE(q.year, sd.year) DESC,
			          COALESCE(q.series, sd.series) DESC,
			          COALESCE(q.component_code, sd.component_code),
			          q.display_order
			 LIMIT 1000`,
			[OCR_BOARD]
		);

		const corpus = await queryFirst<EnglishCorpusRow>(
			`SELECT COUNT(DISTINCT q.source_document_id) AS source_documents
			 FROM questions q
			 WHERE q.board = ?
			   AND (q.subject_area = 'English' OR q.subject LIKE 'English%')
			   AND q.needs_human_review = 0
			   AND q.status = 'published'`,
			[OCR_BOARD]
		);
		const questions = rows.map(hydrateQuestion);

		return {
			questions,
			fallbackGuidedQuestionId: FALLBACK_GUIDED_QUESTION_ID,
			stats: {
				questionCount: questions.length,
				sourceDocumentCount: corpus?.source_documents ?? 0,
				subjects: sortSubjects(questions.map((question) => question.subject)),
				papers: uniqueSorted(questions.map((question) => question.paper)),
				texts: uniqueSorted(questions.map((question) => question.textGroup)),
				questionTypes: uniqueSorted(questions.map((question) => question.questionType)),
				years: uniqueSorted(questions.map((question) => (question.year ? String(question.year) : '')))
			},
			initialFilters: {
				search: url.searchParams.get('q') ?? '',
				course: url.searchParams.get('course') ?? 'All English',
				paper: url.searchParams.get('paper') ?? 'All papers',
				year: url.searchParams.get('year') ?? 'All years',
				text: url.searchParams.get('text') ?? 'All texts',
				type: url.searchParams.get('type') ?? 'All types',
				marks: url.searchParams.get('marks') ?? 'All marks'
			}
		};
	} catch (error) {
		console.error('[english] failed to load OCR English questions', error);
		return {
			questions: [],
			fallbackGuidedQuestionId: FALLBACK_GUIDED_QUESTION_ID,
			stats: {
				questionCount: 0,
				sourceDocumentCount: 0,
				subjects: [],
				papers: [],
				texts: [],
				questionTypes: [],
				years: []
			},
			initialFilters: {
				search: url.searchParams.get('q') ?? '',
				course: 'All English',
				paper: 'All papers',
				year: 'All years',
				text: 'All texts',
				type: 'All types',
				marks: 'All marks'
			}
		};
	}
};
