import { queryFirst } from '$lib/server/db';
import type { PageServerLoad } from './$types';

const ENGLISH_GUIDED_QUESTION_ID = 'english-lit-romeo-juliet-fate-guided';

type EnglishQuestionRow = {
	id: string;
	source_question_ref: string;
	prompt_text: string;
	context_text: string | null;
	marks: number | null;
	board: string | null;
	qualification: string | null;
	subject: string | null;
	paper: string | null;
	metadata_json: string;
	source_title: string | null;
};

type ModelAnswerRow = {
	answer_text: string;
};

type GuidedQuestionMetadata = {
	title?: string;
	source?: string;
	stem?: string;
	instructions?: string[];
	extract?: string[];
	sourceQuestionRef?: string;
};

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function textLines(value: string | null | undefined) {
	return (value ?? '')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

export const load: PageServerLoad = async () => {
	try {
		const row = await queryFirst<EnglishQuestionRow>(
			`SELECT q.id, q.source_question_ref, q.prompt_text, q.context_text, q.marks,
			        q.board, q.qualification, q.subject, q.paper, q.metadata_json,
			        sd.title AS source_title
			 FROM questions q
			 JOIN source_documents sd ON sd.id = q.source_document_id
			 WHERE (q.id = ? OR q.slug = ?)
			   AND q.needs_human_review = 0
			   AND q.status = 'published'
			 LIMIT 1`,
			[ENGLISH_GUIDED_QUESTION_ID, ENGLISH_GUIDED_QUESTION_ID]
		);

		if (!row) return { guidedQuestion: null };

		const modelAnswer = await queryFirst<ModelAnswerRow>(
			`SELECT answer_text
			 FROM model_answers
			 WHERE question_id = ?
			   AND needs_human_review = 0
			 ORDER BY COALESCE(confidence, 0) DESC
			 LIMIT 1`,
			[row.id]
		);
		const metadata = parseJson<GuidedQuestionMetadata>(row.metadata_json, {});

		return {
			guidedQuestion: {
				id: row.id,
				board: row.board ?? 'OCR',
				qualification: row.qualification ?? 'GCSE',
				subject: row.subject ?? 'English Literature',
				paper: row.paper ?? row.source_title ?? 'English paper',
				marks: row.marks ?? 40,
				sourceQuestionRef: metadata.sourceQuestionRef ?? row.source_question_ref,
				source: metadata.source ?? row.source_title ?? 'D1 English guided question',
				title: metadata.title ?? 'English guided answer practice',
				stem: metadata.stem ?? row.prompt_text,
				instructions: metadata.instructions ?? [
					'Write about the extract.',
					'Write about the wider text.',
					'Use references to support your answer.'
				],
				extract: metadata.extract ?? textLines(row.context_text),
				modelAnswer: modelAnswer?.answer_text ?? ''
			}
		};
	} catch (error) {
		console.error('[english] failed to load D1 guided question', error);
		return { guidedQuestion: null };
	}
};
