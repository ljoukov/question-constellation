import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	buildScienceChallengeSourceSnapshot,
	serializeScienceChallengeSourceSnapshot,
	stableStringify
} from './science-challenge-source-snapshot.mjs';

function fixture() {
	return {
		sourceDocuments: [
			{
				id: 'aqa-biology-qp',
				doc_type: 'question_paper',
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Biology',
				subject_area: 'Biology',
				tier: 'Higher',
				paper: 'Paper 1',
				component_code: '8461/1H',
				series: 'June 2024',
				year: 2024,
				title: 'Biology Paper 1',
				source_url: 'https://example.test/qp.pdf',
				file_path: 'data/papers/qp.pdf',
				file_hash: 'a'.repeat(64),
				page_count: 20,
				metadata_json: '{"visibleIdentity":"8461/1H"}'
			},
			{
				id: 'aqa-biology-ms',
				doc_type: 'mark_scheme',
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Biology',
				subject_area: 'Biology',
				tier: 'Higher',
				paper: 'Paper 1',
				component_code: '8461/1H',
				series: 'June 2024',
				year: 2024,
				title: 'Biology Paper 1 Mark Scheme',
				source_url: 'https://example.test/ms.pdf',
				file_path: 'data/papers/ms.pdf',
				file_hash: 'b'.repeat(64),
				page_count: 12,
				metadata_json: '{}'
			}
		],
		questions: [
			{
				id: 'biology-question-1',
				source_document_id: 'aqa-biology-qp',
				parent_source_question_ref: '01',
				source_question_ref: '01.1',
				slug: 'biology-question-1',
				display_order: 1,
				prompt_text: 'Explain why an enzyme works more slowly at a low temperature.',
				self_contained_prompt_text: 'Explain why an enzyme works more slowly at a low temperature.',
				context_text: null,
				command_word: 'explain',
				marks: 2,
				board: 'AQA',
				qualification: 'GCSE',
				subject: 'Biology',
				subject_area: 'Biology',
				tier: 'Higher',
				paper: 'Paper 1',
				component_code: '8461/1H',
				series: 'June 2024',
				year: 2024,
				topic_path_json: '["4.1 Cell biology","Enzymes"]',
				spec_ref: '4.1.2.3',
				page_start: 3,
				page_end: 3,
				answer_format: 'lines',
				source_constraints_json: '[]',
				self_containment_json: '{"status":"self_contained"}',
				extraction_confidence: 0.99,
				needs_human_review: 0,
				review_notes_json: '[]',
				status: 'published',
				metadata_json: '{"card_title":"Temperature and enzyme activity"}'
			}
		],
		renderingOverlays: [
			{
				id: 'overlay-1',
				question_id: 'biology-question-1',
				source_document_id: 'aqa-biology-qp',
				source_question_ref: '01.1',
				overlay_version: 'v1',
				provenance: 'vision_extraction',
				confidence: 0.99,
				needs_human_review: 0,
				render_json: '{"blocks":[{"kind":"paragraph","text":"Explain why..."}]}'
			}
		],
		responseAnswerKeys: [
			{
				id: 'key-2',
				question_id: 'biology-question-1',
				response_kind: 'choice',
				target_id: 'choice-b',
				correct_answer: 'false',
				display_order: 2,
				aliases_json: '[]',
				metadata_json: '{}'
			},
			{
				id: 'key-1',
				question_id: 'biology-question-1',
				response_kind: 'choice',
				target_id: 'choice-a',
				correct_answer: 'true',
				display_order: 1,
				aliases_json: '["A"]',
				metadata_json: '{}'
			}
		],
		markSchemeItems: [
			{
				id: 'mark-2',
				question_id: 'biology-question-1',
				source_document_id: 'aqa-biology-ms',
				display_order: 2,
				item_type: 'marking_point',
				text: 'fewer successful collisions per second',
				marks: 1,
				source_ref: '01.1',
				confidence: 0.98,
				metadata_json: '{}'
			},
			{
				id: 'mark-1',
				question_id: 'biology-question-1',
				source_document_id: 'aqa-biology-ms',
				display_order: 1,
				item_type: 'marking_point',
				text: 'particles have less kinetic energy',
				marks: 1,
				source_ref: '01.1',
				confidence: 0.98,
				metadata_json: '{}'
			}
		],
		markChecklistItems: [
			{
				id: 'check-1',
				question_id: 'biology-question-1',
				display_order: 1,
				text: 'Link lower temperature to lower kinetic energy.',
				required: 1,
				mark_scheme_item_ids_json: '["mark-1"]',
				confidence: 0.98,
				needs_human_review: 0
			}
		],
		modelAnswers: [
			{
				id: 'answer-1',
				question_id: 'biology-question-1',
				answer_text:
					'Particles have less kinetic energy, so successful collisions happen less often.',
				derivation: 'mark_scheme',
				supporting_mark_scheme_item_ids_json: '["mark-1","mark-2"]',
				confidence: 0.98,
				needs_human_review: 0
			}
		],
		questionAssets: [
			{
				id: 'optional-asset',
				question_id: 'biology-question-1',
				asset_type: 'decorative_image',
				source_label: 'Decoration',
				required: 0,
				role: 'decorative',
				page_number: 3,
				bbox_json: null,
				alt_text: 'A decorative border.',
				extracted_text: null,
				file_path: 'tmp/optional.png',
				r2_key: null,
				public_path: null,
				extraction_confidence: 0.8,
				needs_human_review: 1,
				metadata_json: '{}'
			},
			{
				id: 'required-asset',
				question_id: 'biology-question-1',
				asset_type: 'table',
				source_label: 'Table 1',
				required: 1,
				role: 'prompt',
				page_number: 3,
				bbox_json: '{"x":10,"y":20,"width":200,"height":80}',
				alt_text: 'A table of reaction rates.',
				extracted_text: 'Temperature | Rate',
				file_path: 'data/assets/table.png',
				r2_key: 'questions/table.png',
				public_path: '/questions/table.png',
				extraction_confidence: 0.99,
				needs_human_review: 0,
				metadata_json: '{"sourcePage":3}'
			}
		],
		primaryChainMappings: [
			{
				id: 'mapping-1',
				question_id: 'biology-question-1',
				answer_chain_id: 'chain-1',
				is_primary: 1,
				fit_confidence: 0.97,
				fit_notes: 'The same collision chain earns both marks.',
				transfer_distance: 'start',
				display_order: 1,
				needs_human_review: 0,
				review_notes_json: '[]',
				metadata_json: '{}'
			}
		],
		answerChains: [
			{
				id: 'chain-1',
				slug: 'temperature-collisions',
				title: 'Temperature collisions',
				canonical_chain_text:
					'lower temperature -> less kinetic energy -> fewer successful collisions',
				subject: 'Biology',
				subject_area: 'Biology',
				broad_topic: 'Enzymes',
				summary: 'Connect temperature to enzyme collision frequency.',
				created_by: 'chain_reconciliation',
				confidence: 0.97,
				needs_human_review: 0,
				review_notes_json: '[]',
				status: 'published',
				metadata_json: '{}'
			}
		],
		answerChainSteps: [
			{
				id: 'step-2',
				answer_chain_id: 'chain-1',
				display_order: 2,
				step_text: 'fewer successful collisions',
				step_role: 'effect',
				explanation: 'The active site is reached less often.',
				common_omission: 'States only that the reaction is slower.',
				supported_by_mark_scheme_item_ids_json: '["mark-2"]',
				evidence_json: '[{"markSchemeItemId":"mark-2"}]'
			},
			{
				id: 'step-1',
				answer_chain_id: 'chain-1',
				display_order: 1,
				step_text: 'less kinetic energy',
				step_role: 'cause',
				explanation: 'Particles move more slowly.',
				common_omission: 'Does not name kinetic energy.',
				supported_by_mark_scheme_item_ids_json: '["mark-1"]',
				evidence_json: '[{"markSchemeItemId":"mark-1"}]'
			}
		],
		questionWeakAnswers: [
			{
				id: 'weak-question-1',
				question_id: 'biology-question-1',
				answer_chain_id: 'chain-1',
				weak_answer_text: 'The enzyme is colder so it is slower.',
				missing_chain_step_ids_json: '["step-1","step-2"]',
				explanation: 'It does not explain the particle mechanism.',
				source: 'examiner_report',
				confidence: 0.9,
				needs_human_review: 0
			}
		],
		chainWeakAnswers: [
			{
				id: 'weak-chain-1',
				question_id: null,
				answer_chain_id: 'chain-1',
				weak_answer_text: 'The particles stop moving.',
				missing_chain_step_ids_json: '["step-1"]',
				explanation: 'Particles still have kinetic energy.',
				source: 'agent',
				confidence: 0.9,
				needs_human_review: 0
			}
		]
	};
}

test('builds a byte-stable, evidence-complete canonical snapshot', () => {
	const rows = fixture();
	const snapshot = buildScienceChallengeSourceSnapshot(rows, { expectedQuestionCount: 1 });
	const shuffledRows = Object.fromEntries(
		Object.entries(rows).map(([name, values]) => [name, [...values].reverse()])
	);
	const shuffled = buildScienceChallengeSourceSnapshot(shuffledRows, {
		expectedQuestionCount: 1
	});

	assert.deepEqual(shuffled, snapshot);
	assert.equal(
		serializeScienceChallengeSourceSnapshot(shuffled),
		serializeScienceChallengeSourceSnapshot(snapshot)
	);
	assert.equal(snapshot.counts.questions, 1);
	assert.deepEqual(snapshot.counts.bySubject, { Biology: 1, Chemistry: 0, Physics: 0 });
	assert.deepEqual(
		snapshot.questions[0].markSchemeItems.map((item) => item.id),
		['mark-1', 'mark-2']
	);
	assert.deepEqual(
		snapshot.questions[0].primaryAnswerChain.steps.map((step) => step.id),
		['step-1', 'step-2']
	);
	assert.deepEqual(
		snapshot.questions[0].fixedAnswerKeys.map((key) => key.id),
		['key-1', 'key-2']
	);
	assert.deepEqual(
		snapshot.questions[0].requiredAssets.map((asset) => asset.id),
		['required-asset']
	);
	assert.deepEqual(
		snapshot.questions[0].commonWeakAnswers.map((answer) => answer.id),
		['weak-chain-1', 'weak-question-1']
	);
	assert.match(snapshot.integrity.canonicalPayloadHash, /^[a-f0-9]{64}$/);
	assert.equal(
		snapshot.integrity.canonicalPayloadHash,
		'5982a460383da99ef51d18b8a120653c112e3fa6cd8c512ddbd963109e3d42e5'
	);
	assert.equal(stableStringify({ z: 1, a: { d: 2, b: 1 } }), '{"a":{"b":1,"d":2},"z":1}');
});

test('fails closed for unpublished or review-needed accepted evidence', () => {
	const unpublished = fixture();
	unpublished.questions[0].status = 'draft';
	assert.throws(
		() => buildScienceChallengeSourceSnapshot(unpublished, { expectedQuestionCount: 1 }),
		/not published/
	);

	const reviewNeeded = fixture();
	reviewNeeded.modelAnswers[0].needs_human_review = 1;
	assert.throws(
		() => buildScienceChallengeSourceSnapshot(reviewNeeded, { expectedQuestionCount: 1 }),
		/Model answer answer-1 needs human review/
	);
});

test('fails closed when required grading or chain evidence is absent', () => {
	for (const [table, message] of [
		['markSchemeItems', /no mark-scheme rows/],
		['markChecklistItems', /no mark checklist/],
		['primaryChainMappings', /exactly one primary answer chain/],
		['answerChainSteps', /has no ordered steps/]
	]) {
		const rows = fixture();
		rows[table] = [];
		assert.throws(
			() => buildScienceChallengeSourceSnapshot(rows, { expectedQuestionCount: 1 }),
			message
		);
	}
});
