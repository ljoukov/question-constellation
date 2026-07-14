#!/usr/bin/env node

import {
	deriveQuestionCardTitle,
	questionCardTitleIssues,
	QUESTION_CARD_TITLE_CONTRACT
} from '../src/lib/questionCardTitle.js';
import { d1Rows } from './lib/d1-rest.mjs';

const subjects = ['Biology', 'Chemistry', 'Physics'];
const includeAll = process.argv.includes('--include-all');
const report = {
	contract: QUESTION_CARD_TITLE_CONTRACT,
	course: 'AQA Combined Science Higher',
	subjects: {},
	totalCandidates: 0,
	totalFailures: 0,
	failures: [],
	...(includeAll ? { entries: [] } : {})
};

for (const subject of subjects) {
	const queried = await readCandidateWindow(subject);
	const candidates = queried.filter(isLearnerActionCandidate);
	const failures = candidates.flatMap((row) => {
		const metadata = parseJson(row.metadata_json, {});
		const storedTitle = [metadata.card_title, metadata.cardTitle, metadata.title].find(
			(value) => typeof value === 'string' && value.trim()
		);
		const title = deriveQuestionCardTitle({
			cardTitle: storedTitle,
			promptText: row.prompt_text,
			selfContainedPromptText: row.self_contained_prompt_text,
			answerText: row.answer_text,
			fallback: row.chain_title
		});
		const issues = questionCardTitleIssues(title, {
			promptText: `${row.prompt_text ?? ''} ${row.self_contained_prompt_text ?? ''}`,
			answerText: row.answer_text
		});
		if (includeAll) {
			report.entries.push({
				subject,
				questionId: row.id,
				marks: row.marks,
				title,
				storedTitle: storedTitle ?? null,
				answerText: row.answer_text ?? null,
				selfContainedPromptText: row.self_contained_prompt_text ?? null,
				issues,
				promptText: row.prompt_text
			});
		}
		return issues.length
			? [
					{
						subject,
						questionId: row.id,
						marks: row.marks,
						title,
						issues,
						promptText: row.prompt_text
					}
				]
			: [];
	});

	report.subjects[subject] = {
		queried: queried.length,
		candidates: candidates.length,
		failures: failures.length
	};
	report.totalCandidates += candidates.length;
	report.totalFailures += failures.length;
	report.failures.push(...failures);
}

console.log(JSON.stringify(report, null, 2));
if (report.totalFailures > 0) process.exitCode = 1;

async function readCandidateWindow(subject) {
	return await d1Rows(
		`SELECT
		   q.id, q.prompt_text, q.self_contained_prompt_text, q.metadata_json,
		   q.marks, q.answer_format, ac.title AS chain_title,
		   (SELECT COUNT(*) FROM answer_chain_steps acs
		     WHERE acs.answer_chain_id = ac.id) AS step_count,
		   (SELECT ma.answer_text FROM model_answers ma
		     WHERE ma.question_id = q.id AND ma.needs_human_review = 0
		     ORDER BY ma.confidence DESC LIMIT 1) AS answer_text
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
		   AND (q.board IS NULL OR LOWER(q.board) = 'aqa')
		   AND (q.qualification IS NULL OR LOWER(q.qualification) = 'gcse')
		   AND (
		     LOWER(COALESCE(q.subject, '')) LIKE '%combined science%'
		     OR LOWER(COALESCE(q.component_code, '')) LIKE '8464%'
		   )
		   AND (
		     q.tier IS NULL OR q.tier = '' OR LOWER(q.tier) = 'higher'
		     OR LOWER(q.tier) LIKE '%foundation and higher%'
		     OR LOWER(q.tier) LIKE '%higher and foundation%'
		     OR LOWER(q.tier) LIKE '%both%'
		   )
		 ORDER BY
		   CASE qac.transfer_distance
		     WHEN 'start' THEN 0 WHEN 'near' THEN 1 WHEN 'stretch' THEN 2
		     WHEN 'exam_transfer' THEN 3 ELSE 4
		   END,
		   COALESCE(qac.fit_confidence, 0) DESC,
		   q.id
		 LIMIT 160`,
		[subject, subject]
	);
}

function isLearnerActionCandidate(row) {
	const format = String(row.answer_format ?? '').toLowerCase();
	const supportsWritten = !format || format === 'lines' || format === 'labeled lines';
	const marks = Number(row.marks ?? 0);
	const hasUsableChain = marks <= 3 || Number(row.step_count ?? 0) >= 3;
	return supportsWritten && marks >= 1 && marks <= 6 && hasUsableChain;
}

function parseJson(value, fallback) {
	try {
		return value ? JSON.parse(value) : fallback;
	} catch {
		return fallback;
	}
}
