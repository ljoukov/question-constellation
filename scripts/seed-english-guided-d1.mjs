import { d1Query, d1Rows } from './lib/d1-rest.mjs';

const importId = 'english-guided-macbeth-seed-v1';
const sourceDocumentId = 'ocr-english-lit-macbeth-guided-sample';
const questionId = 'english-lit-macbeth-conflicted-guided';
const chainId = 'english-chain-macbeth-conflict';
const constellationId = 'english-constellation-macbeth-conflict';
const sourceQuestionRef = '21';

const extract = [
	'Is this a dagger which I see before me,',
	'The handle toward my hand? Come, let me clutch thee.',
	'I have thee not, and yet I see thee still.',
	'Art thou not, fatal vision, sensible',
	'To feeling as to sight? or art thou but',
	'A dagger of the mind, a false creation,',
	'Proceeding from the heat-oppressed brain?',
	'I see thee yet, in form as palpable',
	'As this which now I draw.'
];

const stem =
	'Starting with this extract, explore how Shakespeare presents Macbeth as a conflicted character.';

const instructions = [
	'Write about how Macbeth is presented in this extract.',
	'Write about how Shakespeare presents Macbeth elsewhere in the play.',
	'Use references to the play to support your answer.'
];

const modelAnswer =
	'Shakespeare presents Macbeth as conflicted by making the dagger both tempting and unreachable. The phrase "fatal vision" suggests that Macbeth can imagine the murder clearly, but the word "vision" also makes it unstable, as if his ambition is disturbing his mind. Because he reaches for the dagger but cannot touch it, the audience sees him caught between action and fear. This conflict connects to the wider play because Macbeth hesitates before killing Duncan, but later his ambition and guilt make him more violent. For a Jacobean audience, his struggle would also feel dangerous because regicide breaks the expected order of kingship.';

const markItems = [
	{
		id: `${questionId}-ms-argument`,
		text: 'Clear argument about Macbeth as conflicted, not only plot summary.',
		marks: 6
	},
	{
		id: `${questionId}-ms-evidence`,
		text: 'Precise quotation or textual reference from the extract or wider play.',
		marks: 6
	},
	{
		id: `${questionId}-ms-method`,
		text: "Analysis of Shakespeare's language, imagery, staging, or audience effect.",
		marks: 8
	},
	{
		id: `${questionId}-ms-wider`,
		text: 'Connection between the extract and Macbeth elsewhere in the play.',
		marks: 5
	},
	{
		id: `${questionId}-ms-context`,
		text: 'Relevant context linked to the argument, such as kingship, regicide, ambition, or the supernatural.',
		marks: 5
	}
];

const chainSteps = [
	{
		id: `${chainId}-step-claim`,
		text: 'Make a clear claim about Macbeth as conflicted',
		role: 'conclusion',
		explanation: 'A high-mark answer starts by answering the exact task.',
		commonOmission: 'Retelling the scene without naming the conflict.'
	},
	{
		id: `${chainId}-step-evidence`,
		text: 'Anchor the point in precise evidence',
		role: 'evidence',
		explanation: 'Use a short quotation or precise reference that can be analysed.',
		commonOmission: 'Making a general claim without source support.'
	},
	{
		id: `${chainId}-step-method`,
		text: "Explain Shakespeare's method and effect",
		role: 'method',
		explanation: 'Move from quotation to language, imagery, staging, or audience effect.',
		commonOmission: 'Naming a technique without explaining what it shows.'
	},
	{
		id: `${chainId}-step-wider`,
		text: 'Connect the extract to the wider play',
		role: 'link',
		explanation: 'Show how this moment develops before or after Duncan is murdered.',
		commonOmission: 'Writing only about the extract when the question asks elsewhere too.'
	},
	{
		id: `${chainId}-step-context`,
		text: 'Link relevant context to the argument',
		role: 'link',
		explanation: 'Use context only where it strengthens the reading of Macbeth as conflicted.',
		commonOmission: 'Adding context as a disconnected fact.'
	}
];

const metadata = {
	title: 'How Shakespeare presents Macbeth as conflicted',
	source: 'OCR-style sample using public-domain Macbeth text',
	stem,
	instructions,
	extract,
	seededForRoute: '/english',
	officialOcrQuestion: false,
	note: 'Curated guided-practice seed. Full OCR PDF extraction/import is separate.'
};

const renderJson = {
	stemBlocks: [
		{ type: 'text', text: 'OCR-style sample using public-domain Macbeth text' },
		{ type: 'extract', lines: extract }
	],
	promptBlocks: [
		{ type: 'paragraph', text: stem },
		{ type: 'list', items: instructions }
	],
	response: { kind: 'extended_text', marks: 30, suggestedLines: 28 },
	afterResponseBlocks: [{ type: 'marks', text: '[30]' }],
	assets: [],
	layout: { kind: 'exam-paper', questionNumber: sourceQuestionRef },
	metadata
};

async function exec(sql, params = []) {
	await d1Query(sql, params);
}

async function deleteExistingRows() {
	const statements = [
		[
			'DELETE FROM common_weak_answers WHERE question_id = ? OR answer_chain_id = ?',
			[questionId, chainId]
		],
		[
			'DELETE FROM constellation_questions WHERE constellation_id = ? OR question_id = ?',
			[constellationId, questionId]
		],
		['DELETE FROM constellations WHERE id = ?', [constellationId]],
		[
			'DELETE FROM question_answer_chains WHERE question_id = ? OR answer_chain_id = ?',
			[questionId, chainId]
		],
		['DELETE FROM answer_chain_steps WHERE answer_chain_id = ?', [chainId]],
		['DELETE FROM model_answers WHERE question_id = ?', [questionId]],
		['DELETE FROM mark_checklist_items WHERE question_id = ?', [questionId]],
		['DELETE FROM mark_scheme_items WHERE question_id = ?', [questionId]],
		['DELETE FROM question_response_answer_keys WHERE question_id = ?', [questionId]],
		['DELETE FROM question_rendering_overlays WHERE question_id = ?', [questionId]],
		['DELETE FROM question_assets WHERE question_id = ?', [questionId]],
		['DELETE FROM questions WHERE id = ?', [questionId]],
		['DELETE FROM answer_chains WHERE id = ?', [chainId]],
		['DELETE FROM source_documents WHERE id = ?', [sourceDocumentId]],
		['DELETE FROM content_imports WHERE id = ?', [importId]]
	];

	for (const [sql, params] of statements) {
		await exec(sql, params);
	}
}

async function insertSeedRows() {
	await exec(
		`INSERT INTO content_imports
		 (id, source, question_count, chain_count, constellation_count, metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[
			importId,
			'manual-english-guided-seed',
			1,
			1,
			1,
			JSON.stringify({ route: '/english', sourceDocumentId, questionId, chainId })
		]
	);

	await exec(
		`INSERT INTO source_documents
		 (id, doc_type, board, qualification, subject, subject_area, tier, paper,
		  component_code, series, year, title, source_url, file_path, file_hash, page_count,
		  metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			sourceDocumentId,
			'question_paper',
			'OCR',
			'GCSE',
			'English Literature',
			'English',
			null,
			'J352/02 Exploring poetry and Shakespeare',
			'J352/02',
			'guided-sample',
			null,
			'OCR-style Macbeth guided sample',
			null,
			null,
			null,
			null,
			JSON.stringify(metadata)
		]
	);

	await exec(
		`INSERT INTO questions
		 (id, source_document_id, parent_source_question_ref, source_question_ref, slug,
		  display_order, prompt_text, self_contained_prompt_text, context_text, command_word,
		  marks, board, qualification, subject, subject_area, tier, paper, component_code,
		  series, year, topic_path_json, spec_ref, page_start, page_end, answer_format,
		  source_constraints_json, self_containment_json, extraction_confidence,
		  needs_human_review, review_notes_json, status, metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			questionId,
			sourceDocumentId,
			null,
			sourceQuestionRef,
			questionId,
			1,
			stem,
			`${stem}\n\n${extract.join('\n')}\n\n${instructions.join('\n')}`,
			extract.join('\n'),
			'explore',
			30,
			'OCR',
			'GCSE',
			'English Literature',
			'English',
			null,
			'J352/02 Exploring poetry and Shakespeare',
			'J352/02',
			'guided-sample',
			null,
			JSON.stringify(['English Literature', 'Macbeth', 'character conflict']),
			null,
			null,
			null,
			'extended_response',
			JSON.stringify(instructions),
			JSON.stringify({ is_self_contained: true, requires_context: true, requires_assets: false }),
			0.82,
			0,
			JSON.stringify([]),
			'published',
			JSON.stringify(metadata)
		]
	);

	await exec(
		`INSERT INTO question_rendering_overlays
		 (id, question_id, source_document_id, source_question_ref, overlay_version, provenance,
		  confidence, needs_human_review, render_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			`${questionId}-overlay-v1`,
			questionId,
			sourceDocumentId,
			sourceQuestionRef,
			'v1',
			'manual',
			0.82,
			0,
			JSON.stringify(renderJson)
		]
	);

	for (const [index, item] of markItems.entries()) {
		await exec(
			`INSERT INTO mark_scheme_items
			 (id, question_id, source_document_id, display_order, item_type, text, marks,
			  source_ref, confidence, metadata_json)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				item.id,
				questionId,
				sourceDocumentId,
				index + 1,
				'level_descriptor',
				item.text,
				item.marks,
				'guided-rubric',
				0.8,
				JSON.stringify({ seededForRoute: '/english' })
			]
		);
		await exec(
			`INSERT INTO mark_checklist_items
			 (id, question_id, display_order, text, required, mark_scheme_item_ids_json,
			  confidence, needs_human_review)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				item.id.replace('-ms-', '-check-'),
				questionId,
				index + 1,
				item.text,
				1,
				JSON.stringify([item.id]),
				0.8,
				0
			]
		);
	}

	await exec(
		`INSERT INTO model_answers
		 (id, question_id, answer_text, derivation, supporting_mark_scheme_item_ids_json,
		  confidence, needs_human_review)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			`${questionId}-model-answer`,
			questionId,
			modelAnswer,
			'manual-guided-seed',
			JSON.stringify(markItems.map((item) => item.id)),
			0.82,
			0
		]
	);

	await exec(
		`INSERT INTO answer_chains
		 (id, slug, title, canonical_chain_text, subject, subject_area, broad_topic,
		  summary, created_by, confidence, needs_human_review, review_notes_json, status,
		  metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			chainId,
			chainId,
			'Macbeth conflict paragraph',
			'claim -> evidence -> method -> wider play -> context',
			'English Literature',
			'English',
			'Macbeth',
			'Build a high-mark Macbeth paragraph by growing from a clear claim to evidence, method, wider-play link, and relevant context.',
			'manual_seed',
			0.82,
			0,
			JSON.stringify([]),
			'published',
			JSON.stringify({ route: '/english', sourceDocumentId })
		]
	);

	for (const [index, step] of chainSteps.entries()) {
		await exec(
			`INSERT INTO answer_chain_steps
			 (id, answer_chain_id, display_order, step_text, step_role, explanation,
			  common_omission, supported_by_mark_scheme_item_ids_json, evidence_json)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				step.id,
				chainId,
				index + 1,
				step.text,
				step.role,
				step.explanation,
				step.commonOmission,
				JSON.stringify([markItems[index]?.id].filter(Boolean)),
				JSON.stringify([
					{
						mark_scheme_item_id: markItems[index]?.id,
						evidence_summary: markItems[index]?.text
					}
				])
			]
		);
	}

	await exec(
		`INSERT INTO question_answer_chains
		 (id, question_id, answer_chain_id, is_primary, fit_confidence, fit_notes,
		  transfer_distance, display_order, needs_human_review, review_notes_json, metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			`${questionId}-${chainId}`,
			questionId,
			chainId,
			1,
			0.82,
			'This guided question uses the same answer-building chain that the /english experience teaches.',
			'start',
			1,
			0,
			JSON.stringify([]),
			JSON.stringify({ route: '/english' })
		]
	);

	await exec(
		`INSERT INTO constellations
		 (id, slug, title, answer_chain_id, board, qualification, subject, subject_area,
		  tier, paper, topic_path_json, summary, confidence, needs_human_review,
		  review_notes_json, status, metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			constellationId,
			constellationId,
			'Macbeth conflict paragraphs',
			chainId,
			'OCR',
			'GCSE',
			'English Literature',
			'English',
			null,
			'J352/02 Exploring poetry and Shakespeare',
			JSON.stringify(['English Literature', 'Macbeth']),
			'Guided practice for building high-mark Shakespeare paragraphs in stages.',
			0.82,
			0,
			JSON.stringify([]),
			'published',
			JSON.stringify({ route: '/english' })
		]
	);

	await exec(
		`INSERT INTO constellation_questions
		 (id, constellation_id, question_id, display_order, transfer_distance, role,
		  rationale, confidence, needs_human_review, metadata_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			`${constellationId}-${questionId}`,
			constellationId,
			questionId,
			1,
			'start',
			'start',
			'Seed question for the first English guided-answer experience.',
			0.82,
			0,
			JSON.stringify({ route: '/english' })
		]
	);

	await exec(
		`INSERT INTO common_weak_answers
		 (id, question_id, answer_chain_id, weak_answer_text, missing_chain_step_ids_json,
		  explanation, source, confidence, needs_human_review)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			`${questionId}-weak-summary-only`,
			questionId,
			chainId,
			'Macbeth sees a dagger and feels scared, then he kills Duncan.',
			JSON.stringify([
				`${chainId}-step-method`,
				`${chainId}-step-wider`,
				`${chainId}-step-context`
			]),
			"This retells the moment but does not explain Shakespeare's method, connect elsewhere in the play, or link context to the argument.",
			'manual_seed',
			0.78,
			0
		]
	);
}

async function verifySeed() {
	const rows = await d1Rows(
		`SELECT
		 (SELECT COUNT(*) FROM questions WHERE id = ? AND status = 'published') AS questions,
		 (SELECT COUNT(*) FROM question_rendering_overlays WHERE question_id = ?) AS overlays,
		 (SELECT COUNT(*) FROM mark_scheme_items WHERE question_id = ?) AS mark_items,
		 (SELECT COUNT(*) FROM mark_checklist_items WHERE question_id = ?) AS checklist_items,
		 (SELECT COUNT(*) FROM answer_chain_steps WHERE answer_chain_id = ?) AS chain_steps,
		 (SELECT COUNT(*) FROM question_answer_chains WHERE question_id = ? AND answer_chain_id = ?) AS memberships`,
		[questionId, questionId, questionId, questionId, chainId, questionId, chainId]
	);
	return rows[0];
}

async function main() {
	await deleteExistingRows();
	await insertSeedRows();
	const verification = await verifySeed();
	console.log(
		JSON.stringify(
			{
				importId,
				sourceDocumentId,
				questionId,
				chainId,
				constellationId,
				verification
			},
			null,
			2
		)
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
