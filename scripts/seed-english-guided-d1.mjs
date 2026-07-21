import { d1Query, d1Rows } from './lib/d1-rest.mjs';

const importId = 'english-guided-romeo-juliet-fate-seed-v1';
const sourceDocumentId = 'ocr-j352-02-jun24-romeo-juliet-fate';
const questionId = 'english-lit-romeo-juliet-fate-guided';
const chainId = 'english-chain-romeo-juliet-fate';
const constellationId = 'english-constellation-romeo-juliet-fate';
const sourceQuestionRef = '4*';
const questionPaperUrl =
	'https://www.ocr.org.uk/Images/727831-question-paper-exploring-poetry-and-shakespeare.pdf';
const markSchemeUrl =
	'https://www.ocr.org.uk/Images/727833-mark-scheme-exploring-poetry-and-shakespeare.pdf';

const legacySeeds = [
	{
		importId: 'english-guided-macbeth-seed-v1',
		sourceDocumentId: 'ocr-english-lit-macbeth-guided-sample',
		questionId: 'english-lit-macbeth-conflicted-guided',
		chainId: 'english-chain-macbeth-conflict',
		constellationId: 'english-constellation-macbeth-conflict'
	}
];

const extract = [
	'Two households, both alike in dignity,',
	'In fair Verona, where we lay our scene,',
	'From ancient grudge break to new mutiny,',
	'Where civil blood makes civil hands unclean.',
	'From forth the fatal loins of these two foes',
	"A pair of star-cross'd lovers take their life;",
	'Whose misadventured piteous overthrows',
	"Doth with their death bury their parents' strife.",
	"The fearful passage of their death-mark'd love,",
	"And the continuance of their parents' rage,",
	"Which, but their children's end, nought could remove,",
	"Is now the two hours' traffic of our stage;",
	'The which if you with patient ears attend,',
	'What here shall miss, our toil shall strive to mend.'
];

const stem =
	'Explore the ways in which Shakespeare presents fate in this tragedy. Refer to this extract which is the Prologue and elsewhere in the play.';

const instructions = [
	'Write about how fate is presented in this extract.',
	'Write about how Shakespeare presents fate elsewhere in the play.',
	'Use references to the play to support your answer.',
	'Remember that 6 marks are available for spelling, punctuation, grammar and specialist terminology.'
];

const modelAnswer =
	'Shakespeare presents fate as a force that seems to shape the whole tragedy before the action begins. The Prologue calls Romeo and Juliet "star-cross\'d lovers", suggesting that their love is controlled by forces beyond ordinary choice, while "death-mark\'d love" makes the ending feel unavoidable. The Chorus also creates dramatic irony because the audience knows the lovers are doomed before they do. This idea develops elsewhere when Romeo calls himself "fortune\'s fool" after Mercutio dies and later declares "I defy you, stars", as if he tries to fight the fate already set out in the opening. A strong answer could also argue that Shakespeare leaves space for human responsibility: the family feud, Friar Lawrence\'s failed plan and the missed letter all make fate look like a mixture of destiny, chance and human error. For an audience familiar with astrology and tragedy, the language of stars and fortune would make the lovers seem trapped by a larger order.';

const markItems = [
	{
		id: `${questionId}-ms-argument`,
		text: 'AO1: clear, task-focused argument about how Shakespeare presents fate in the tragedy, supported by knowledge of the play rather than plot summary.',
		marks: 10
	},
	{
		id: `${questionId}-ms-evidence`,
		text: 'AO1: precise textual references from the Prologue and the wider play, integrated into the argument.',
		marks: 8
	},
	{
		id: `${questionId}-ms-method`,
		text: "AO2: analysis of Shakespeare's methods, such as the Chorus, sonnet form, imagery, structure, dramatic irony, and audience effect.",
		marks: 10
	},
	{
		id: `${questionId}-ms-wider`,
		text: 'AO1/AO2: meaningful connection between the Prologue and moments elsewhere in Romeo and Juliet, not a detached second example.',
		marks: 6
	},
	{
		id: `${questionId}-ms-context`,
		text: 'AO3/AO4: relevant context and controlled expression, including ideas about astrology, tragedy, fate, social disorder, audience expectation, and SPaG.',
		marks: 6
	}
];

const chainSteps = [
	{
		id: `${chainId}-step-claim`,
		text: 'Make a clear claim about fate in the tragedy',
		role: 'conclusion',
		explanation: 'A high-mark answer starts by answering the exact task.',
		commonOmission: 'Retelling the story without saying what Shakespeare suggests about fate.'
	},
	{
		id: `${chainId}-step-evidence`,
		text: 'Anchor the point in precise evidence',
		role: 'evidence',
		explanation: 'Use a short quotation or precise reference from the Prologue or wider play.',
		commonOmission: 'Making a general claim without source support.'
	},
	{
		id: `${chainId}-step-method`,
		text: "Explain Shakespeare's method and effect",
		role: 'method',
		explanation: 'Move from quotation to method, structure, dramatic irony, or audience effect.',
		commonOmission: 'Naming a technique without explaining what it shows.'
	},
	{
		id: `${chainId}-step-wider`,
		text: 'Connect the extract to the wider play',
		role: 'link',
		explanation: 'Show how fate, chance, and choice return later in the play.',
		commonOmission: 'Writing only about the extract when the question asks elsewhere too.'
	},
	{
		id: `${chainId}-step-context`,
		text: 'Use context and expression to sharpen the argument',
		role: 'link',
		explanation: 'Use context only where it strengthens the reading of fate and tragedy.',
		commonOmission:
			'Adding context as a disconnected fact, or losing marks through unclear expression.'
	}
];

const metadata = {
	title: 'How Shakespeare presents fate in Romeo and Juliet',
	source: 'OCR June 2024 J352/02 Question 4*',
	stem,
	instructions,
	extract,
	sourceQuestionRef,
	seededForRoute: '/questions?subject=English%20Literature',
	officialOcrQuestion: true,
	sourceQuestionPaperUrl: questionPaperUrl,
	sourceMarkSchemeUrl: markSchemeUrl,
	sourceExaminerReportUrl:
		'https://www.ocr.org.uk/Images/729389-examiners-report-exploring-poetry-and-shakespeare.pdf',
	gradingProfile: 'ocr-gcse-english-literature-section-b-shakespeare-extract',
	ocrSectionBMarking: {
		totalMarks: 40,
		contentMarks: 36,
		spagMarks: 4,
		assessmentObjectiveWeights: {
			AO1: 14,
			AO2: 14,
			AO3: 8,
			AO4: 4
		},
		levelSummary: [
			'31-36 content: sustained critical style, perceptive understanding, precise interwoven references, detailed sensitive AO2, perceptive context.',
			'25-30 content: convincing critical style, well-developed response, integrated references, thoughtful AO2, convincing context.',
			'19-24 content: credible critical style, detailed response, relevant references, some analytical AO2, clear context.',
			'13-18 content: reasonably developed response with some relevant references, reasonable AO2 explanation, some relevant context.',
			'7-12 content: straightforward response, some textual support, simple comments on language/form/structure, some implied context.',
			'1-6 content: basic relevant comments, limited references, little awareness of method or context.'
		],
		extractQuestionCaps: [
			'If the answer does not move beyond the Prologue extract, the content mark should not normally move beyond Level 3: for this 40-mark question, do not award above 22/40 including SPaG.',
			'If the answer refers only briefly to the wider play, the content mark should not normally move beyond Level 4: for this 40-mark question, do not award above 28/40 including SPaG.'
		],
		spagSummary: [
			'4 SPaG: consistently accurate spelling and punctuation, controlled vocabulary and sentence structures.',
			'2-3 SPaG: considerable accuracy and general control of meaning.',
			'1 SPaG: reasonable accuracy; errors do not stop meaning.'
		]
	},
	markSchemeGuidance: {
		credit: [
			"Credit arguments that Romeo and Juliet's love is death-marked from the beginning and that the audience knows this before the characters do.",
			"Credit discussion of fatal loins, star-cross'd lovers, death-mark'd love, misadventured overthrows, fortune, chance, accident, and debate about destiny versus human choice.",
			"Credit wider-play links including Queen Mab, the first meeting, prodigious birth of love, fortune's fool, ill-divining soul, I defy you stars, misfortune's book, Friar Lawrence's failed message, the tomb scene, and the Prince's closing judgement.",
			'Credit method analysis of the Prologue as sonnet, Chorus, dramatic irony, theatrical structure, star imagery, and the contrast between rage and love.',
			'Credit relevant context about astrology, predetermination, tragedy, social feud/civil disorder, Fortune, providence, and audience expectations where it sharpens the argument.'
		],
		cautions: [
			'Do not require every indicative example; OCR says other valid content should be credited.',
			'Do not reward plot summary unless it is used to support a clear argument about fate.',
			'Do not reward context that is bolted on and not linked to the question.',
			'Do not treat Fortune and God as interchangeable if the answer becomes confused.'
		]
	},
	examinerReportGuidance: {
		successSignals: [
			"Strong answers understood the Prologue as setting out how fate and chance shape the lovers' lives and deaths.",
			'Strong answers grasped the sonnet form and dramatic structure, then made confident links to well-selected moments elsewhere.',
			'Strong answers returned to the extract while discussing wider moments, making genuine links rather than adding a separate paragraph.',
			'Some strong answers considered agency versus fate, but the line of argument had to remain controlled.'
		],
		commonWeaknesses: [
			'Weaker answers retold the plot or inserted quotations randomly.',
			'Weaker answers used pre-prepared material that drifted away from the wording of the task.',
			'Weaker answers bolted on general context about patriarchy, church, divine right, or social order without linking it to fate.',
			'Some answers confused the Chorus addressing the audience or became unclear when discussing Fortune, God, and agency.',
			'Long answers could become repetitive; quality and control matter more than quantity.'
		],
		feedbackPriorities: [
			'Name the highest-value missing move: task argument, precise evidence, method/effect, wider-play link, or relevant context/expression.',
			'When an answer is nearly good, tell the student what to tighten rather than replacing the whole answer.',
			'When an answer is stuck or very weak, give one concrete next sentence or reference to add.'
		]
	},
	note: 'Guided-practice seed based on OCR June 2024 J352/02 Question 4*. Extract text is from Shakespeare.'
};

const renderJson = {
	stemBlocks: [
		{ type: 'text', text: 'OCR June 2024 J352/02 Question 4*' },
		{ type: 'extract', lines: extract }
	],
	promptBlocks: [
		{ type: 'paragraph', text: stem },
		{ type: 'list', items: instructions }
	],
	response: { kind: 'extended_text', marks: 40, suggestedLines: 32 },
	afterResponseBlocks: [{ type: 'marks', text: '[40]' }],
	assets: [],
	layout: { kind: 'exam-paper', questionNumber: sourceQuestionRef },
	metadata
};

async function exec(sql, params = []) {
	await d1Query(sql, params);
}

async function deleteExistingRows() {
	const seedsToDelete = [
		{ importId, sourceDocumentId, questionId, chainId, constellationId },
		...legacySeeds
	];

	for (const seed of seedsToDelete) {
		const statements = [
			[
				'DELETE FROM common_weak_answers WHERE question_id = ? OR answer_chain_id = ?',
				[seed.questionId, seed.chainId]
			],
			[
				'DELETE FROM constellation_questions WHERE constellation_id = ? OR question_id = ?',
				[seed.constellationId, seed.questionId]
			],
			['DELETE FROM constellations WHERE id = ?', [seed.constellationId]],
			[
				'DELETE FROM question_answer_chains WHERE question_id = ? OR answer_chain_id = ?',
				[seed.questionId, seed.chainId]
			],
			['DELETE FROM answer_chain_steps WHERE answer_chain_id = ?', [seed.chainId]],
			['DELETE FROM model_answers WHERE question_id = ?', [seed.questionId]],
			['DELETE FROM mark_checklist_items WHERE question_id = ?', [seed.questionId]],
			['DELETE FROM mark_scheme_items WHERE question_id = ?', [seed.questionId]],
			['DELETE FROM question_response_answer_keys WHERE question_id = ?', [seed.questionId]],
			['DELETE FROM question_rendering_overlays WHERE question_id = ?', [seed.questionId]],
			['DELETE FROM question_assets WHERE question_id = ?', [seed.questionId]],
			['DELETE FROM questions WHERE id = ?', [seed.questionId]],
			['DELETE FROM answer_chains WHERE id = ?', [seed.chainId]],
			['DELETE FROM source_documents WHERE id = ?', [seed.sourceDocumentId]],
			['DELETE FROM content_imports WHERE id = ?', [seed.importId]]
		];

		for (const [sql, params] of statements) {
			await exec(sql, params);
		}
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
			JSON.stringify({
				route: '/questions?subject=English%20Literature',
				sourceDocumentId,
				questionId,
				chainId
			})
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
			'English Literature',
			null,
			'J352/02 Exploring poetry and Shakespeare',
			'J352/02',
			'June 2024',
			2024,
			'OCR J352/02 June 2024 Question paper - Exploring poetry and Shakespeare',
			questionPaperUrl,
			'data/ocr-gcse-english-literature/question-papers/OCR-J352-02-QP-JUN24.PDF',
			'c0f3be806bddf97e106ac6a1c3ff57e676871c83a68a086eaad97cf0f2017574',
			16,
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
			40,
			'OCR',
			'GCSE',
			'English Literature',
			'English Literature',
			null,
			'J352/02 Exploring poetry and Shakespeare',
			'J352/02',
			'June 2024',
			2024,
			JSON.stringify(['English Literature', 'Romeo and Juliet', 'fate']),
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
				JSON.stringify({ seededForRoute: '/questions?subject=English%20Literature' })
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
			'Romeo and Juliet fate paragraph',
			'claim -> evidence -> method -> wider play -> context',
			'English Literature',
			'English Literature',
			'Romeo and Juliet',
			'Build a high-mark Romeo and Juliet paragraph about fate by growing from a clear claim to evidence, method, wider-play link, and relevant context.',
			'manual_seed',
			0.82,
			0,
			JSON.stringify([]),
			'published',
			JSON.stringify({ route: '/questions?subject=English%20Literature', sourceDocumentId })
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
			'This guided question uses the same answer-building chain as the canonical question practice experience.',
			'start',
			1,
			0,
			JSON.stringify([]),
			JSON.stringify({ route: '/questions?subject=English%20Literature' })
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
			'Romeo and Juliet fate paragraphs',
			chainId,
			'OCR',
			'GCSE',
			'English Literature',
			'English Literature',
			null,
			'J352/02 Exploring poetry and Shakespeare',
			JSON.stringify(['English Literature', 'Romeo and Juliet', 'fate']),
			'Guided practice for building high-mark Shakespeare paragraphs in stages.',
			0.82,
			0,
			JSON.stringify([]),
			'published',
			JSON.stringify({ route: '/questions?subject=English%20Literature' })
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
			JSON.stringify({ route: '/questions?subject=English%20Literature' })
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
			'Romeo and Juliet are unlucky because their families argue and they both die.',
			JSON.stringify([
				`${chainId}-step-method`,
				`${chainId}-step-wider`,
				`${chainId}-step-context`
			]),
			"This retells the tragedy but does not explain Shakespeare's methods, connect precise moments across the play, or link fate to context and audience expectations.",
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
