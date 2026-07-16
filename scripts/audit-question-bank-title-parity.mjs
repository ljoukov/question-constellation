#!/usr/bin/env node

import { storedQuestionTitle, storedQuestionTitleIssues } from '../src/lib/storedQuestionTitle.js';
import { d1Rows } from './lib/d1-rest.mjs';
import { decodePublicRoutePayload } from './lib/physics-question-id-reconciliation.mjs';

const rootDir = process.cwd();
const [payloadRow] = await d1Rows(
	`SELECT payload_json, source_version
	   FROM public_route_payloads
	  WHERE id = 'chains:browse'`,
	[],
	{ rootDir }
);
if (!payloadRow) throw new Error('The materialized chains:browse payload is missing.');
const payload = decodePublicRoutePayload(String(payloadRow.payload_json)).value;
const questions = Array.isArray(payload?.questions) ? payload.questions : [];
if (questions.length === 0) throw new Error('The materialized question bank is empty.');

const [homePayloadRow] = await d1Rows(
	`SELECT payload_json, source_version
	   FROM public_route_payloads
	  WHERE id = 'home:public-summary'`,
	[],
	{ rootDir }
);
if (!homePayloadRow) throw new Error('The materialized home:public-summary payload is missing.');
const homePayload = decodePublicRoutePayload(String(homePayloadRow.payload_json)).value;
const homeQuestions = (
	Array.isArray(homePayload?.featuredChains) ? homePayload.featuredChains : []
).flatMap((chain) => (Array.isArray(chain?.questions) ? chain.questions : []));

const ids = [...new Set([...questions, ...homeQuestions].map((question) => question.id))];
const rows = [];
for (let index = 0; index < ids.length; index += 80) {
	const batch = ids.slice(index, index + 80);
	const placeholders = batch.map(() => '?').join(', ');
	rows.push(
		...(await d1Rows(
			`SELECT q.id, q.subject, q.prompt_text, q.self_contained_prompt_text,
			        q.topic_path_json, q.metadata_json,
			        (SELECT COUNT(*)
			           FROM question_answer_chains qac
			           JOIN answer_chains ac ON ac.id = qac.answer_chain_id
			          WHERE qac.question_id = q.id
			            AND qac.needs_human_review = 0
			            AND ac.needs_human_review = 0
			            AND ac.status = 'published') AS public_chain_count,
			        (SELECT ma.answer_text FROM model_answers ma
			          WHERE ma.question_id = q.id AND ma.needs_human_review = 0
			          ORDER BY ma.confidence DESC LIMIT 1) AS answer_text
			   FROM questions q
			  WHERE q.id IN (${placeholders})`,
			batch,
			{ rootDir }
		))
	);
}
const rowById = new Map(rows.map((row) => [row.id, row]));
const failures = [];
for (const bankQuestion of questions) {
	const row = rowById.get(bankQuestion.id);
	if (!row) {
		failures.push({ questionId: bankQuestion.id, code: 'missing_question_row' });
		continue;
	}
	const liveTitle = storedQuestionTitle({
		id: row.id,
		subject: row.subject,
		metadataJson: row.metadata_json,
		promptText: row.prompt_text,
		selfContainedPromptText: row.self_contained_prompt_text,
		topicPathJson: row.topic_path_json
	});
	const issues = storedQuestionTitleIssues({
		title: liveTitle,
		subject: row.subject,
		promptText: row.prompt_text,
		selfContainedPromptText: row.self_contained_prompt_text,
		answerText: row.answer_text
	});
	if (Number(row.public_chain_count) < 1) {
		failures.push({
			questionId: row.id,
			code: 'missing_reviewed_public_chain'
		});
		continue;
	}
	if (bankQuestion.title !== liveTitle || issues.length > 0) {
		failures.push({
			questionId: row.id,
			code: bankQuestion.title !== liveTitle ? 'materialized_title_drift' : 'invalid_live_title',
			materializedTitle: bankQuestion.title,
			liveTitle,
			issues
		});
	}
}

for (const homeQuestion of homeQuestions) {
	const row = rowById.get(homeQuestion.id);
	if (!row) {
		failures.push({ questionId: homeQuestion.id, surface: 'home', code: 'missing_question_row' });
		continue;
	}
	const liveTitle = storedQuestionTitle({
		id: row.id,
		subject: row.subject,
		metadataJson: row.metadata_json,
		promptText: row.prompt_text,
		selfContainedPromptText: row.self_contained_prompt_text,
		topicPathJson: row.topic_path_json
	});
	const issues = storedQuestionTitleIssues({
		title: liveTitle,
		subject: row.subject,
		promptText: row.prompt_text,
		selfContainedPromptText: row.self_contained_prompt_text,
		answerText: row.answer_text
	});
	if (homeQuestion.title !== liveTitle || issues.length > 0) {
		failures.push({
			questionId: row.id,
			surface: 'home',
			code: homeQuestion.title !== liveTitle ? 'materialized_title_drift' : 'invalid_live_title',
			materializedTitle: homeQuestion.title,
			liveTitle,
			issues
		});
	}
}

const report = {
	status: failures.length === 0 ? 'passed' : 'failed',
	sourceVersion: payloadRow.source_version,
	questionCount: questions.length,
	homeQuestionCount: homeQuestions.length,
	failureCount: failures.length,
	failures
};
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
