#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { format as formatWithPrettier, resolveConfig as resolvePrettierConfig } from 'prettier';
import {
	CURRICULUM_IMPORT_OWNER,
	REVIEWED_QUESTION_MAPPING_SCHEMA_VERSION,
	buildCurriculumImportSnapshot,
	buildQuestionCurriculumMappingEvidence,
	questionCurriculumMappingEvidenceHash,
	validateCurriculumCatalog
} from './lib/curriculum-catalog.mjs';
import { d1Rows } from './lib/d1-rest.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outputPath = path.resolve(rootDir, args.output);
const catalog = validateCurriculumCatalog(
	JSON.parse(readFileSync(path.resolve(rootDir, args.catalog), 'utf8')),
	{ rootDir }
);
const snapshot = buildCurriculumImportSnapshot(catalog);

const SOURCE_SPECIFICATION_ID = 'aqa-gcse-computer-science-8525-v1.2-2026';
const CURRENT_SPECIFICATION_ID = 'aqa-gcse-computer-science-8525-v1.3-2027';
const REVIEW_COMPLETED_AT = '2026-07-16';
const REVIEWED_CHAPTER_DECISIONS = reviewedChapterDecisions();
const LEGACY_DOCUMENT_IDS = [
	'aqa-computer-science-2021-june-paper-1-computational-thinking-and-problem-solving-qp',
	'aqa-computer-science-2021-june-paper-2-written-assessment-qp'
];
const SOURCE_DOCUMENT_IDS = [...LEGACY_DOCUMENT_IDS, ...Object.keys(REVIEWED_CHAPTER_DECISIONS)];

const questions = await loadQuestionEvidence(SOURCE_DOCUMENT_IDS);
const questionByDocumentAndRef = new Map(
	questions.map((question) => [
		`${question.source_document_id}\u0000${question.source_question_ref}`,
		question
	])
);
const sourceSpecification = requiredSpecification(SOURCE_SPECIFICATION_ID);
const currentSpecification = requiredSpecification(CURRENT_SPECIFICATION_ID);
const componentsBySpecificationAndCode = new Map(
	snapshot.components.map((component) => [
		`${component.specificationId}\u0000${component.code}`,
		component
	])
);

const mappings = [];
for (const [sourceDocumentId, byChapter] of Object.entries(REVIEWED_CHAPTER_DECISIONS)) {
	for (const [curriculumCode, sourceQuestionRefs] of Object.entries(byChapter)) {
		const sourceComponent = requiredComponent(SOURCE_SPECIFICATION_ID, curriculumCode);
		const currentComponent = requiredComponent(CURRENT_SPECIFICATION_ID, curriculumCode);
		for (const sourceQuestionRef of sourceQuestionRefs) {
			const question = questionByDocumentAndRef.get(
				`${sourceDocumentId}\u0000${sourceQuestionRef}`
			);
			if (!question) {
				throw new Error(`Reviewed decision is stale: ${sourceDocumentId} ${sourceQuestionRef}`);
			}
			if (!String(question.component_code ?? '').startsWith('8525')) {
				throw new Error(`Reviewed 8525 decision has non-8525 component: ${question.id}`);
			}
			const evidence = buildQuestionCurriculumMappingEvidence(question);
			const evidenceHash = questionCurriculumMappingEvidenceHash(question);
			const removedFromCurrent =
				question.id === 'computer-science-2023-june-paper-2-computing-concepts-qp-13-3';
			mappings.push({
				questionId: question.id,
				sourceClassification: 'aqa-gcse-computer-science-8525-v1.2-2026',
				sourceSpecificationId: SOURCE_SPECIFICATION_ID,
				evidenceHash,
				evidence,
				targets: [
					{
						specificationId: SOURCE_SPECIFICATION_ID,
						curriculumComponentId: sourceComponent.id,
						curriculumCode,
						confidence: 1,
						reviewNote: `Stored prompt, primary chain and mark-scheme evidence were reviewed against official ${curriculumCode} ${sourceComponent.title}.`
					},
					...(removedFromCurrent
						? []
						: [
								{
									specificationId: CURRENT_SPECIFICATION_ID,
									curriculumComponentId: currentComponent.id,
									curriculumCode,
									confidence: 1,
									reviewNote: `The assessed content remains in identically coded official ${curriculumCode} ${currentComponent.title}; the v1.2-to-v1.3 removed-content delta was checked explicitly.`
								}
							])
				],
				withheldTargets: removedFromCurrent
					? [
							{
								specificationId: CURRENT_SPECIFICATION_ID,
								reason:
									'Official v1.3 removes the v1.2 requirement to describe and compare star and bus LAN topologies; this bus-versus-star question is therefore withheld from the 2027 offering.'
							}
						]
					: []
			});
		}
	}
}

const withheldQuestions = questions
	.filter((question) => LEGACY_DOCUMENT_IDS.includes(question.source_document_id))
	.map((question) => {
		if (
			!String(question.component_code ?? '').startsWith('8520') ||
			Number(question.year) !== 2021
		) {
			throw new Error(`Legacy source classification drifted for ${question.id}`);
		}
		return {
			questionId: question.id,
			sourceClassification: 'aqa-gcse-computer-science-8520-legacy',
			reason:
				'The official paper component is 85201/85202 from the withdrawn 8520 qualification. No 8525 or 2027 mapping is assumed without a separate item-level legacy-specification review.',
			evidenceHash: questionCurriculumMappingEvidenceHash(question),
			evidence: buildQuestionCurriculumMappingEvidence(question)
		};
	});

const mappedIds = new Set(mappings.map((entry) => entry.questionId));
const withheldIds = new Set(withheldQuestions.map((entry) => entry.questionId));
const unaccounted = questions.filter(
	(question) => !mappedIds.has(question.id) && !withheldIds.has(question.id)
);
if (unaccounted.length) {
	throw new Error(
		`Explicit review plan does not account for ${unaccounted.length} questions: ${unaccounted
			.map((question) => question.id)
			.join(', ')}`
	);
}
if (mappings.length !== 163 || withheldQuestions.length !== 65) {
	throw new Error(
		`Expected 163 reviewed 8525 mappings and 65 explicit 8520 withholdings; got ${mappings.length} and ${withheldQuestions.length}`
	);
}

const artifact = {
	schemaVersion: REVIEWED_QUESTION_MAPPING_SCHEMA_VERSION,
	id: 'aqa-cs-8520-8525-question-curriculum-review-v1',
	importOwner: CURRICULUM_IMPORT_OWNER,
	generatedAt: REVIEW_COMPLETED_AT,
	review: {
		method:
			'Item-by-item review of stored learner prompt, primary answer chain and every imported mark-scheme row against official AQA specification chapters; no prompt keyword classifier or model call.',
		decisionPlan:
			'Explicit source-document/question-reference decisions in scripts/build-aqa-cs-reviewed-question-mapping.mjs',
		legacyBoundary:
			'85201/85202 papers are classified as withdrawn 8520 and withheld from both 8525 offerings.',
		crossVersionBoundary:
			'8525 v1.2 questions are mapped to v1.3 only where the assessed content remains in the current official chapter.'
	},
	specificationSources: [sourceSpecification, currentSpecification].map((specification) => ({
		specificationId: specification.id,
		version: specification.version,
		fileHash: specification.fileHash,
		localPath: specification.localPath,
		pdfUrl: specification.pdfUrl
	})),
	crossVersionReview: {
		unchangedSelectableChapterCodes: ['3.1', '3.2', '3.3', '3.4', '3.5', '3.6', '3.7', '3.8'],
		removedV12ContentChecked: [
			'optical secondary storage',
			'star and bus LAN topologies',
			'FTP and UDP protocols',
			'Ethernet and Wi-Fi protocol-family detail'
		],
		cohortImpact: {
			mappedToCurrentV13: 162,
			withheldFromCurrentV13: 1,
			withheldQuestionId: 'computer-science-2023-june-paper-2-computing-concepts-qp-13-3'
		}
	},
	scope: {
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Computer Science',
		sourceDocumentIds: SOURCE_DOCUMENT_IDS,
		questionCount: questions.length
	},
	mappings: mappings.sort(compareArtifactEntries),
	withheldQuestions: withheldQuestions.sort(compareArtifactEntries)
};

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(
	outputPath,
	await formatWithPrettier(JSON.stringify(artifact), {
		...(await resolvePrettierConfig(outputPath)),
		filepath: outputPath
	})
);
process.stdout.write(
	`${JSON.stringify(
		{
			output: path.relative(rootDir, outputPath),
			questions: questions.length,
			mapped8525Questions: mappings.length,
			withheld8520Questions: withheldQuestions.length,
			v12MappingRows: mappings.length,
			v13MappingRows: mappings.filter((entry) =>
				entry.targets.some((target) => target.specificationId === CURRENT_SPECIFICATION_ID)
			).length,
			v13WithheldTargets: mappings.filter((entry) => entry.withheldTargets.length).length
		},
		null,
		2
	)}\n`
);

function parseArgs(argv) {
	const value = (name, fallback) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	return {
		catalog: value('catalog', 'data/curricula/curriculum-catalog.json'),
		output: value(
			'output',
			'data/curricula/question-mappings/aqa-computer-science-8525-reviewed-v1.json'
		)
	};
}

async function loadQuestionEvidence(sourceDocumentIds) {
	return d1Rows(
		`SELECT q.id, q.status, q.needs_human_review, q.board, q.qualification,
		        q.subject, q.subject_area, q.component_code, q.spec_ref, q.topic_path_json, q.year,
		        q.source_document_id, q.source_question_ref, q.prompt_text,
		        q.self_contained_prompt_text, q.context_text, q.marks,
		        sd.doc_type AS mapping_evidence_source_document_type,
		        sd.board AS mapping_evidence_source_document_board,
		        sd.qualification AS mapping_evidence_source_document_qualification,
		        sd.subject AS mapping_evidence_source_document_subject,
		        sd.subject_area AS mapping_evidence_source_document_subject_area,
		        sd.tier AS mapping_evidence_source_document_tier,
		        sd.paper AS mapping_evidence_source_document_paper,
		        sd.component_code AS mapping_evidence_source_document_component_code,
		        sd.series AS mapping_evidence_source_document_series,
		        sd.year AS mapping_evidence_source_document_year,
		        sd.title AS mapping_evidence_source_document_title,
		        sd.source_url AS mapping_evidence_source_document_url,
		        sd.file_hash AS mapping_evidence_source_document_hash,
		        sd.page_count AS mapping_evidence_source_document_page_count,
		        COALESCE((
		          SELECT json_group_array(json_object(
		            'id', ordered.id,
		            'sourceDocumentId', ordered.source_document_id,
		            'displayOrder', ordered.display_order,
		            'itemType', ordered.item_type,
		            'text', ordered.text,
		            'marks', ordered.marks,
			            'sourceRef', ordered.source_ref,
			            'sourceDocumentDocType', ordered.source_document_doc_type,
			            'sourceDocumentTitle', ordered.source_document_title,
			            'sourceDocumentUrl', ordered.source_document_url,
			            'sourceDocumentHash', ordered.source_document_hash
			          ))
			          FROM (
			            SELECT item.id, item.source_document_id, item.display_order, item.item_type, item.text,
			                   item.marks, item.source_ref,
			                   mark_source.doc_type AS source_document_doc_type,
			                   mark_source.title AS source_document_title,
			                   mark_source.source_url AS source_document_url,
			                   mark_source.file_hash AS source_document_hash
			            FROM mark_scheme_items item
			            LEFT JOIN source_documents mark_source ON mark_source.id = item.source_document_id
		            WHERE item.question_id = q.id
		            ORDER BY item.display_order, item.id
		          ) ordered
		        ), '[]') AS mapping_evidence_mark_scheme_json,
		        qac.answer_chain_id AS mapping_evidence_answer_chain_id,
		        chain.title AS mapping_evidence_answer_chain_title,
		        chain.canonical_chain_text AS mapping_evidence_answer_chain_text,
		        qac.fit_notes AS mapping_evidence_chain_fit_notes
		 FROM questions q
		 LEFT JOIN source_documents sd ON sd.id = q.source_document_id
		 LEFT JOIN question_answer_chains qac
		   ON qac.question_id = q.id
		  AND qac.is_primary = 1
		  AND qac.needs_human_review = 0
		 LEFT JOIN answer_chains chain
		   ON chain.id = qac.answer_chain_id
		  AND chain.needs_human_review = 0
		 WHERE q.source_document_id IN (${sourceDocumentIds.map(() => '?').join(', ')})
		   AND q.status = 'published'
		   AND q.needs_human_review = 0
		 ORDER BY q.source_document_id, q.display_order, q.id`,
		sourceDocumentIds,
		{ rootDir }
	);
}

function requiredSpecification(specificationId) {
	const specification = snapshot.specifications.find((entry) => entry.id === specificationId);
	if (!specification) throw new Error(`Missing official specification ${specificationId}`);
	return specification;
}

function requiredComponent(specificationId, curriculumCode) {
	const component = componentsBySpecificationAndCode.get(
		`${specificationId}\u0000${curriculumCode}`
	);
	if (!component?.selectable) {
		throw new Error(`Missing selectable official component ${specificationId} ${curriculumCode}`);
	}
	return component;
}

function compareArtifactEntries(left, right) {
	return (
		left.evidence.question.sourceDocumentId.localeCompare(
			right.evidence.question.sourceDocumentId
		) ||
		left.evidence.question.sourceQuestionRef.localeCompare(
			right.evidence.question.sourceQuestionRef,
			undefined,
			{ numeric: true }
		) ||
		left.questionId.localeCompare(right.questionId)
	);
}

// These are review decisions, not classifier rules. Every source question ref
// is intentionally enumerated under one learner-selectable official chapter.
function reviewedChapterDecisions() {
	return {
		'aqa-computer-science-2022-june-paper-2-computing-concepts-qp': {
			3.3: [
				'01.1',
				'01.2',
				'01.3',
				'02.1',
				'02.2',
				'02.3',
				'02.4',
				'10.0',
				'11.0',
				'12.0',
				'13.1',
				'13.2',
				'13.3',
				'17.1',
				'17.2',
				'17.3'
			],
			3.4: [
				'03.1',
				'03.2',
				'03.3',
				'03.4',
				'04.1',
				'04.2',
				'06.0',
				'07.1',
				'07.2',
				'08.0',
				'09.1',
				'09.2'
			],
			3.5: ['14.1', '14.2', '14.3', '14.4', '14.5'],
			3.6: ['15.1', '15.2', '15.3', '16.1', '16.2'],
			3.7: ['18.1', '18.2', '18.3', '18.4', '18.5', '18.6'],
			3.8: ['05.0']
		},
		'aqa-computer-science-2023-june-paper-2-computing-concepts-qp': {
			3.3: [
				'01.1',
				'01.2',
				'02.1',
				'02.2',
				'03.0',
				'04.0',
				'05.0',
				'06.1',
				'06.2',
				'07.1',
				'07.2',
				'07.3',
				'07.4'
			],
			3.4: [
				'08.1',
				'08.2',
				'08.3',
				'08.4',
				'08.5',
				'08.6',
				'09.1',
				'09.2',
				'09.3',
				'10.1',
				'10.2',
				'11.1',
				'11.2',
				'11.3',
				'12.1',
				'12.2',
				'12.3'
			],
			3.5: ['13.1', '13.2', '13.3', '13.4', '13.5'],
			3.6: ['16.1', '16.2', '16.3'],
			3.7: ['14.1', '14.2', '14.3', '14.4', '14.5'],
			3.8: ['15.0']
		},
		'aqa-computer-science-2024-june-paper-1a-computational-thinking-and-programming-skills-c-qp': {
			3.1: ['02.2', '02.3', '02.5', '04.1', '04.2', '05.0', '13.0'],
			3.2: [
				'01.1',
				'01.2',
				'01.3',
				'01.4',
				'01.5',
				'02.1',
				'02.4',
				'03.1',
				'03.2',
				'03.3',
				'06.0',
				'07.0',
				'08.0',
				'09.1',
				'09.2',
				'09.3',
				'10.1',
				'10.2',
				'11.0',
				'12.1',
				'12.2',
				'12.3',
				'12.4',
				'12.5',
				'12.6',
				'12.7',
				'14.1',
				'14.2',
				'15.0'
			]
		},
		'aqa-computer-science-2024-june-paper-2-computing-concepts-qp': {
			3.3: [
				'01.0',
				'02.1',
				'02.2',
				'03.0',
				'04.1',
				'04.2',
				'04.3',
				'05.1',
				'05.2',
				'05.3',
				'05.4',
				'05.5',
				'06.0',
				'09.1',
				'09.2'
			],
			3.4: ['07.1', '07.2', '07.3', '08.1', '08.2', '10.0', '11.0', '12.0'],
			3.5: ['13.1', '13.2', '14.0'],
			3.6: ['15.0', '16.0', '17.0', '19.1', '19.2'],
			3.7: ['18.1', '18.2', '18.3', '18.4', '18.5', '18.6', '18.7']
		}
	};
}
