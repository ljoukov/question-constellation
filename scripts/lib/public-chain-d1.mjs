import { d1Rows } from './d1-rest.mjs';

const PUBLIC_CHAIN_WHERE = `
	ac.status = 'published'
	AND ac.needs_human_review = 0
	AND qac.needs_human_review = 0
	AND q.status = 'published'
	AND q.needs_human_review = 0
	AND EXISTS (
		SELECT 1
		FROM question_rendering_overlays qro
		WHERE qro.question_id = q.id
	)
`;

const POSITIVE_MARK_TYPES = new Set([
	'mark',
	'answer',
	'answer_mark',
	'fixed_answer',
	'method_mark',
	'indicative',
	'indicative_content',
	'indicative-content',
	'indicativeContent',
	'alternative_mark',
	'alternative-mark',
	'alternative',
	'alternative_method',
	'alternative-method',
	'creditworthy_alternative',
	'fallback_credit'
]);

export async function fetchPublicChains({
	rootDir = process.cwd(),
	subject = 'all',
	chainIds = [],
	includeExamples = false,
	maxExamplesPerChain = 3,
	maxMarkItemsPerExample = 8
} = {}) {
	if (chainIds.length > 80) {
		const results = await Promise.all(
			chunk(chainIds, 80).map((ids) =>
				fetchPublicChains({
					rootDir,
					subject,
					chainIds: ids,
					includeExamples,
					maxExamplesPerChain,
					maxMarkItemsPerExample
				})
			)
		);
		return results.flat().sort((left, right) => String(left.id).localeCompare(String(right.id)));
	}
	const subjectFilter = subject && subject !== 'all' ? 'AND ac.subject_area = ?' : '';
	const chainFilter = chainIds.length ? `AND ac.id IN (${chainIds.map(() => '?').join(', ')})` : '';
	const params = [...(subjectFilter ? [subject] : []), ...(chainIds.length ? chainIds : [])];
	const chains = await d1Rows(
		`SELECT ac.id, ac.slug, ac.title, ac.canonical_chain_text AS canonicalChainText,
		        ac.summary, ac.subject_area AS subjectArea, ac.broad_topic AS broadTopic,
		        ac.metadata_json AS metadataJson,
		        COUNT(DISTINCT q.id) AS publicQuestions,
		        COUNT(DISTINCT q.source_document_id) AS publicPapers
		 FROM answer_chains ac
		 JOIN question_answer_chains qac ON qac.answer_chain_id = ac.id
		 JOIN questions q ON q.id = qac.question_id
		 WHERE ${PUBLIC_CHAIN_WHERE}
		   ${subjectFilter}
		   ${chainFilter}
		 GROUP BY ac.id
		 ORDER BY ac.subject_area, ac.id`,
		params,
		{ rootDir }
	);
	const publicChainIds = chains.map((chain) => chain.id);
	if (publicChainIds.length === 0) return [];

	const steps = (
		await Promise.all(
			chunk(publicChainIds, 80).map((ids) =>
				d1Rows(
					`SELECT answer_chain_id AS chainId, id, display_order AS displayOrder,
					        step_text AS stepText, step_role AS stepRole,
					        explanation, common_omission AS commonOmission,
					        supported_by_mark_scheme_item_ids_json AS supportedByMarkSchemeItemIdsJson
					 FROM answer_chain_steps
					 WHERE answer_chain_id IN (${ids.map(() => '?').join(', ')})
					 ORDER BY answer_chain_id, display_order`,
					ids,
					{ rootDir }
				)
			)
		)
	).flat();
	const stepsByChain = groupBy(steps, (step) => step.chainId);

	let examplesByChain = new Map();
	if (includeExamples) {
		examplesByChain = await fetchExamples({
			rootDir,
			chainIds: publicChainIds,
			maxExamplesPerChain,
			maxMarkItemsPerExample
		});
	}

	return chains.map((chain) => ({
		...chain,
		steps: stepsByChain.get(chain.id) ?? [],
		examples: examplesByChain.get(chain.id) ?? []
	}));
}

async function fetchExamples({ rootDir, chainIds, maxExamplesPerChain, maxMarkItemsPerExample }) {
	const questions = (
		await Promise.all(
			chunk(chainIds, 80).map((ids) =>
				d1Rows(
					`SELECT qac.answer_chain_id AS chainId, q.id AS questionId,
					        q.source_document_id AS sourceDocumentId, q.source_question_ref AS sourceQuestionRef,
					        q.prompt_text AS promptText, q.command_word AS commandWord,
					        q.marks, q.subject_area AS subjectArea, qac.fit_notes AS fitNotes
					 FROM question_answer_chains qac
					 JOIN answer_chains ac ON ac.id = qac.answer_chain_id
					 JOIN questions q ON q.id = qac.question_id
					 WHERE ${PUBLIC_CHAIN_WHERE}
					   AND ac.id IN (${ids.map(() => '?').join(', ')})
					 ORDER BY qac.answer_chain_id,
					          CASE qac.transfer_distance
					            WHEN 'start' THEN 0
					            WHEN 'near' THEN 1
					            WHEN 'stretch' THEN 2
					            WHEN 'exam_transfer' THEN 3
					            ELSE 4
					          END,
					          COALESCE(qac.display_order, 9999),
					          q.source_document_id,
					          q.source_question_ref`,
					ids,
					{ rootDir }
				)
			)
		)
	).flat();
	const questionIds = questions.map((question) => question.questionId);
	const markRows = questionIds.length
		? (
				await Promise.all(
					chunk(questionIds, 80).map((ids) =>
						d1Rows(
							`SELECT question_id AS questionId, display_order AS displayOrder,
							        item_type AS itemType, text
							 FROM mark_scheme_items
							 WHERE question_id IN (${ids.map(() => '?').join(', ')})
							 ORDER BY question_id, display_order`,
							ids,
							{ rootDir }
						)
					)
				)
			).flat()
		: [];
	const marksByQuestion = groupBy(
		markRows.filter((item) => POSITIVE_MARK_TYPES.has(String(item.itemType ?? '').toLowerCase())),
		(item) => item.questionId
	);
	const examplesByChain = new Map();
	for (const question of questions) {
		const existing = examplesByChain.get(question.chainId) ?? [];
		if (existing.length >= maxExamplesPerChain) continue;
		existing.push({
			questionId: question.questionId,
			sourceDocumentId: question.sourceDocumentId,
			sourceQuestionRef: question.sourceQuestionRef,
			promptText: snippet(question.promptText, 420),
			commandWord: question.commandWord,
			marks: question.marks,
			fitNotes: snippet(question.fitNotes, 220),
			markSchemeItems: (marksByQuestion.get(question.questionId) ?? [])
				.slice(0, maxMarkItemsPerExample)
				.map((item) => ({
					itemType: item.itemType,
					text: snippet(item.text, 260)
				}))
		});
		examplesByChain.set(question.chainId, existing);
	}
	return examplesByChain;
}

function groupBy(values, keyFn) {
	const map = new Map();
	for (const value of values) {
		const key = keyFn(value);
		const existing = map.get(key);
		if (existing) existing.push(value);
		else map.set(key, [value]);
	}
	return map;
}

function chunk(values, size) {
	const out = [];
	for (let index = 0; index < values.length; index += size)
		out.push(values.slice(index, index + size));
	return out;
}

function snippet(value, maxLength) {
	const text = String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3).trimEnd()}...`;
}
