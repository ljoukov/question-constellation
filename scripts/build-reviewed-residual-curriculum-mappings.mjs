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
import { REVIEWED_TOPIC_BACKFILL_ROWS } from './lib/aqa-science-topic-mapping.mjs';
import { d1Rows } from './lib/d1-rest.mjs';

const rootDir = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(rootDir, args.outputDir);
const REVIEW_COMPLETED_AT = '2026-07-16';
const BIOLOGY_SPECIFICATION_ID = 'aqa-gcse-biology-8461-v1.0';
const COMBINED_SPECIFICATION_ID = 'aqa-gcse-combined-science-trilogy-8464-v1.1';
const PHYSICS_SPECIFICATION_ID = 'aqa-gcse-physics-8463-v1.1';
const LITERATURE_SPECIFICATION_ID = 'ocr-gcse-english-literature-j352-v3.0';
const SCIENCE_SKILL_WITHHOLDING =
	'Official prompt and mark evidence assess a generic mathematical or working-scientifically operation; the surrounding context alone is not enough to assign one Physics curriculum chapter.';
const HISTORICAL_LITERATURE_OPTION_REASON =
	'The official paper question is for My Mother Said I Never Should, but that historical text is not a selectable option in the reviewed current OCR J352 curriculum catalog; no substitute text or generic paper mapping is inferred.';
const COMBINED_PHYSICS_MAPPING_DECISIONS = combinedPhysicsMappingDecisions();
const COMBINED_PHYSICS_WITHHOLDING_DECISIONS = combinedPhysicsWithholdingDecisions();
const SEPARATE_PHYSICS_MAPPING_DECISIONS = separatePhysicsMappingDecisions();
const SEPARATE_PHYSICS_WITHHOLDING_DECISIONS = separatePhysicsWithholdingDecisions();
const BIOLOGY_P2_MAPPING_DECISIONS = biologyPaper2MappingDecisions();
const BIOLOGY_P2_WITHHOLDING_DECISIONS = biologyPaper2WithholdingDecisions();
const LITERATURE_MAPPING_DECISIONS = literatureMappingDecisions();
const LITERATURE_WITHHOLDING_DECISIONS = literatureWithholdingDecisions();

const catalog = validateCurriculumCatalog(
	JSON.parse(readFileSync(path.resolve(rootDir, args.catalog), 'utf8')),
	{ rootDir }
);
const snapshot = buildCurriculumImportSnapshot(catalog);
const specificationById = new Map(
	snapshot.specifications.map((specification) => [specification.id, specification])
);
const componentBySpecificationAndCode = new Map(
	snapshot.components.map((component) => [
		`${component.specificationId}\u0000${component.code}`,
		component
	])
);

const biologyWithholdings = REVIEWED_TOPIC_BACKFILL_ROWS.filter(
	(row) => row.sourceDocumentId === 'aqa-84611h-qp-nov20' && row.topicCode === null
);
if (biologyWithholdings.length !== 13) {
	throw new Error(`Expected 13 reviewed Biology withholdings, found ${biologyWithholdings.length}`);
}

const sourceDocumentIds = [
	...new Set([
		...biologyWithholdings.map((row) => row.sourceDocumentId),
		...Object.keys(BIOLOGY_P2_MAPPING_DECISIONS),
		...Object.keys(BIOLOGY_P2_WITHHOLDING_DECISIONS),
		...Object.keys(COMBINED_PHYSICS_MAPPING_DECISIONS),
		...Object.keys(COMBINED_PHYSICS_WITHHOLDING_DECISIONS),
		...Object.keys(SEPARATE_PHYSICS_MAPPING_DECISIONS),
		...Object.keys(SEPARATE_PHYSICS_WITHHOLDING_DECISIONS),
		...Object.keys(LITERATURE_MAPPING_DECISIONS),
		...Object.keys(LITERATURE_WITHHOLDING_DECISIONS)
	])
];
const questions = await loadQuestionEvidence(sourceDocumentIds);
const questionByDocumentAndRef = new Map(
	questions.map((question) => [
		`${question.source_document_id}\u0000${question.source_question_ref}`,
		question
	])
);
const questionById = new Map(questions.map((question) => [question.id, question]));

const biologyArtifact = buildBiologyArtifact();
const biologyPaper2Artifact = buildMappedArtifact({
	id: 'aqa-biology-8461-paper-2-missing-spec-ref-review-v1',
	board: 'AQA',
	qualification: 'GCSE',
	subject: 'Biology',
	specificationId: BIOLOGY_SPECIFICATION_ID,
	mappingDecisions: BIOLOGY_P2_MAPPING_DECISIONS,
	withholdingDecisions: BIOLOGY_P2_WITHHOLDING_DECISIONS,
	review: {
		method:
			'Item-by-item review of the stored June 2024 Paper 2 official question wording, primary answer chain and imported mark-scheme rows against the local AQA Biology curriculum; no prompt classifier or model call.',
		boundary:
			'Questions map only where the official item evidence fixes a learner-selectable Biology chapter. Generic arithmetic or graph construction with incidental topic context is explicitly withheld.'
	}
});
const physicsArtifact = buildMappedArtifact({
	id: 'aqa-combined-physics-missing-spec-ref-review-v1',
	board: 'AQA',
	qualification: 'GCSE',
	subject: 'Combined Science',
	specificationId: COMBINED_SPECIFICATION_ID,
	mappingDecisions: COMBINED_PHYSICS_MAPPING_DECISIONS,
	withholdingDecisions: COMBINED_PHYSICS_WITHHOLDING_DECISIONS,
	review: {
		method:
			'Item-by-item review of stored official question wording, primary answer chain and imported mark-scheme rows against the local official AQA curriculum; no prompt classifier or model call.',
		boundary:
			'Only a deterministic learner-selectable Physics chapter is mapped. Pure graph, scale, percentage, uncertainty or proportionality work with incidental science context is explicitly withheld.'
	}
});
const separatePhysicsArtifact = buildMappedArtifact({
	id: 'aqa-physics-8463-paper-1-missing-spec-ref-review-v1',
	board: 'AQA',
	qualification: 'GCSE',
	subject: 'Physics',
	specificationId: PHYSICS_SPECIFICATION_ID,
	mappingDecisions: SEPARATE_PHYSICS_MAPPING_DECISIONS,
	withholdingDecisions: SEPARATE_PHYSICS_WITHHOLDING_DECISIONS,
	review: {
		method:
			'Item-by-item review of the official AQA 8463/1H June 2024 question paper and mark scheme, the stored D1 prompt/chain/mark rows, and the hashed local AQA Physics specification; no keyword classifier or model call.',
		boundary:
			'Questions map only where the official prompt and positive mark evidence fix one learner-selectable Physics chapter. A context-only percentage calculation and three standalone working-scientifically measurement-error operations are explicitly withheld.'
	}
});
const literatureArtifact = buildMappedArtifact({
	id: 'ocr-english-literature-j352-text-option-review-v1',
	board: 'OCR',
	qualification: 'GCSE',
	subject: 'English Literature',
	specificationId: LITERATURE_SPECIFICATION_ID,
	mappingDecisions: LITERATURE_MAPPING_DECISIONS,
	withholdingDecisions: LITERATURE_WITHHOLDING_DECISIONS,
	review: {
		method:
			'Explicit official paper/component/question-reference review against the local OCR specification option tree; no title keyword classifier or model call.',
		boundary:
			'Questions are mapped only to the exact currently selectable studied text or poetry cluster. My Mother Said I Never Should questions are withheld because that historical text has no current selectable option in the reviewed specification.'
	}
});

mkdirSync(outputDir, { recursive: true });
const outputs = [
	['aqa-biology-8461-missing-spec-ref-reviewed-v1.json', biologyArtifact],
	['aqa-biology-8461-paper-2-missing-spec-ref-reviewed-v1.json', biologyPaper2Artifact],
	['aqa-combined-physics-missing-spec-ref-reviewed-v1.json', physicsArtifact],
	['aqa-physics-8463-paper-1-missing-spec-ref-reviewed-v1.json', separatePhysicsArtifact],
	['ocr-english-literature-j352-options-reviewed-v1.json', literatureArtifact]
];
for (const [filename, artifact] of outputs) {
	const outputPath = path.join(outputDir, filename);
	writeFileSync(
		outputPath,
		await formatWithPrettier(JSON.stringify(artifact), {
			...(await resolvePrettierConfig(outputPath)),
			filepath: outputPath
		})
	);
}

process.stdout.write(
	`${JSON.stringify(
		{
			outputDir: path.relative(rootDir, outputDir),
			artifacts: outputs.map(([filename, artifact]) => ({
				filename,
				questions: artifact.scope.questionCount,
				mappedQuestions: artifact.mappings.length,
				withheldQuestions: artifact.withheldQuestions.length
			}))
		},
		null,
		2
	)}\n`
);

function buildBiologyArtifact() {
	const mappedQuestions = [];
	const withheldQuestions = biologyWithholdings.map((decision) => {
		const question = questionById.get(decision.id);
		if (!question) throw new Error(`Reviewed Biology decision is stale: ${decision.id}`);
		assertQuestionIdentity(question, {
			sourceDocumentId: decision.sourceDocumentId,
			sourceQuestionRef: decision.sourceQuestionRef,
			componentCode: decision.componentCode,
			specRef: null
		});
		return evidenceWithholding(
			question,
			'aqa-gcse-biology-8461-working-scientifically-withheld',
			decision.reason
		);
	});
	return artifactEnvelope({
		id: 'aqa-biology-8461-missing-spec-ref-review-v1',
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		specificationId: BIOLOGY_SPECIFICATION_ID,
		questions: withheldQuestions.map((entry) => questionById.get(entry.questionId)),
		mappings: mappedQuestions,
		withheldQuestions,
		review: {
			method:
				'Reuses the checked-in manual question-and-mark-evidence decisions in scripts/lib/aqa-science-topic-mapping.mjs; no prompt classifier or model call.',
			boundary:
				'These items assess working-scientifically calculations, controls, graphs or study validity without a deterministic single Biology chapter, so they remain explicitly withheld.'
		}
	});
}

function buildMappedArtifact({
	id,
	board,
	qualification,
	subject,
	specificationId,
	mappingDecisions,
	withholdingDecisions,
	review
}) {
	const mappings = [];
	const accountedQuestions = [];
	for (const [sourceDocumentId, decisionsByCode] of Object.entries(mappingDecisions)) {
		for (const [curriculumCode, refs] of Object.entries(decisionsByCode)) {
			const component = requiredSelectableComponent(specificationId, curriculumCode);
			for (const sourceQuestionRef of refs) {
				const question = requiredQuestion(sourceDocumentId, sourceQuestionRef);
				assertQuestionIdentity(question, { sourceDocumentId, sourceQuestionRef, specRef: null });
				accountedQuestions.push(question);
				mappings.push({
					questionId: question.id,
					sourceClassification: `${specificationId}:missing-imported-spec-ref`,
					sourceSpecificationId: specificationId,
					evidenceHash: questionCurriculumMappingEvidenceHash(question),
					evidence: buildQuestionCurriculumMappingEvidence(question),
					targets: [
						{
							specificationId,
							curriculumComponentId: component.id,
							curriculumCode,
							confidence: 1,
							reviewNote: `Exact stored paper/question identity and official mark evidence were reviewed against learner-selectable ${curriculumCode} ${component.title}.`
						}
					],
					withheldTargets: []
				});
			}
		}
	}
	const withheldQuestions = [];
	for (const [sourceDocumentId, decisions] of Object.entries(withholdingDecisions)) {
		for (const decision of decisions) {
			const question = requiredQuestion(sourceDocumentId, decision.ref);
			assertQuestionIdentity(question, {
				sourceDocumentId,
				sourceQuestionRef: decision.ref,
				specRef: null
			});
			accountedQuestions.push(question);
			withheldQuestions.push(
				evidenceWithholding(question, decision.sourceClassification, decision.reason)
			);
		}
	}
	return artifactEnvelope({
		id,
		board,
		qualification,
		subject,
		specificationId,
		questions: accountedQuestions,
		mappings,
		withheldQuestions,
		review
	});
}

function artifactEnvelope({
	id,
	board,
	qualification,
	subject,
	specificationId,
	questions,
	mappings,
	withheldQuestions,
	review
}) {
	const specification = requiredSpecification(specificationId);
	const uniqueQuestions = new Map(questions.map((question) => [question.id, question]));
	if (uniqueQuestions.size !== questions.length) {
		throw new Error(`${id} contains duplicate question decisions`);
	}
	const sourceDocumentIds = [
		...new Set(questions.map((question) => question.source_document_id))
	].sort();
	return {
		schemaVersion: REVIEWED_QUESTION_MAPPING_SCHEMA_VERSION,
		id,
		importOwner: CURRICULUM_IMPORT_OWNER,
		generatedAt: REVIEW_COMPLETED_AT,
		review,
		specificationSources: [
			{
				specificationId: specification.id,
				version: specification.version,
				fileHash: specification.fileHash,
				localPath: specification.localPath,
				pdfUrl: specification.pdfUrl
			}
		],
		scope: {
			board,
			qualification,
			subject,
			sourceDocumentIds,
			questionIds: [...uniqueQuestions.keys()].sort(),
			questionCount: uniqueQuestions.size
		},
		mappings: mappings.sort(compareArtifactEntries),
		withheldQuestions: withheldQuestions.sort(compareArtifactEntries)
	};
}

function evidenceWithholding(question, sourceClassification, reason) {
	return {
		questionId: question.id,
		sourceClassification,
		reason,
		evidenceHash: questionCurriculumMappingEvidenceHash(question),
		evidence: buildQuestionCurriculumMappingEvidence(question)
	};
}

function requiredQuestion(sourceDocumentId, sourceQuestionRef) {
	const question = questionByDocumentAndRef.get(`${sourceDocumentId}\u0000${sourceQuestionRef}`);
	if (!question)
		throw new Error(`Reviewed decision is stale: ${sourceDocumentId} ${sourceQuestionRef}`);
	return question;
}

function assertQuestionIdentity(
	question,
	{ sourceDocumentId, sourceQuestionRef, componentCode = null, specRef }
) {
	const problems = [];
	if (question.source_document_id !== sourceDocumentId) problems.push('source document');
	if (question.source_question_ref !== sourceQuestionRef) problems.push('question reference');
	if (componentCode !== null && question.component_code !== componentCode)
		problems.push('component');
	if ((question.spec_ref ?? null) !== specRef) problems.push('spec_ref');
	if (problems.length) {
		throw new Error(`Reviewed identity drift for ${question.id}: ${problems.join(', ')}`);
	}
}

function requiredSpecification(specificationId) {
	const specification = specificationById.get(specificationId);
	if (!specification) throw new Error(`Missing official specification ${specificationId}`);
	return specification;
}

function requiredSelectableComponent(specificationId, curriculumCode) {
	const component = componentBySpecificationAndCode.get(
		`${specificationId}\u0000${curriculumCode}`
	);
	if (!component?.selectable) {
		throw new Error(`Missing selectable official component ${specificationId} ${curriculumCode}`);
	}
	return component;
}

async function loadQuestionEvidence(documentIds) {
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
			            SELECT item.id, item.source_document_id, item.display_order, item.item_type,
			                   item.text, item.marks, item.source_ref,
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
		 WHERE q.source_document_id IN (${documentIds.map(() => '?').join(', ')})
		   AND q.status = 'published'
		   AND q.needs_human_review = 0
		 ORDER BY q.source_document_id, q.display_order, q.id`,
		documentIds,
		{ rootDir }
	);
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

function parseArgs(argv) {
	const value = (name, fallback) =>
		argv.find((argument) => argument.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
	return {
		catalog: value('catalog', 'data/curricula/curriculum-catalog.json'),
		outputDir: value('output-dir', 'data/curricula/question-mappings')
	};
}

// Every decision below is an explicit official paper/question-reference review,
// not a classifier rule. Generic working-scientifically items are listed in the
// corresponding withholding ledger rather than inferred from their wording.
function biologyPaper2MappingDecisions() {
	return {
		'aqa-84612h-qp-jun24': {
			4.5: [
				'04.1',
				'04.2',
				'04.3',
				'04.4',
				'04.5',
				'04.6',
				'04.7',
				'04.8',
				'05.1',
				'05.2',
				'05.3',
				'05.4',
				'05.5',
				'05.6',
				'08.1',
				'08.2',
				'08.3'
			],
			4.6: ['01.1', '01.2', '01.3', '01.4', '06.1', '06.2', '06.3', '06.4', '09.1', '09.2'],
			4.7: [
				'02.1',
				'02.2',
				'02.3',
				'02.4',
				'02.5',
				'03.1',
				'03.5',
				'07.1',
				'07.2',
				'07.4',
				'07.5',
				'07.6'
			]
		}
	};
}

function biologyPaper2WithholdingDecisions() {
	const reason =
		'Official prompt and mark evidence assess generic arithmetic, percentage work or graph construction; the surrounding Biology context alone is not enough to assign one curriculum chapter.';
	return {
		'aqa-84612h-qp-jun24': ['03.2', '03.3', '03.4', '07.3'].map((ref) => ({
			ref,
			sourceClassification: 'aqa-biology-working-scientifically-withheld',
			reason
		}))
	};
}

function combinedPhysicsMappingDecisions() {
	return {
		'aqa-8464p1h-qp-jun24': {
			6.1: ['01.1'],
			6.2: ['03.1', '03.2', '03.4'],
			6.3: ['06.2', '06.3']
		},
		'aqa-8464p1h-qp-jun18': {
			6.1: ['05.1', '05.3', '05.4'],
			6.2: ['06.1', '06.2', '06.3', '06.4'],
			6.3: ['02.1', '03.1', '03.2', '03.3', '03.6'],
			6.4: ['01.2', '04.1', '04.2', '04.3', '04.4', '04.5']
		},
		'aqa-8464p1h-qp-jun19': {
			6.1: ['05.3', '05.4'],
			6.3: ['05.5'],
			6.4: ['06.1', '06.2', '06.3', '06.4', '06.6']
		}
	};
}

function combinedPhysicsWithholdingDecisions() {
	return {
		'aqa-8464p1h-qp-jun24': [
			{
				ref: '03.3',
				sourceClassification: 'aqa-combined-physics-working-scientifically-withheld',
				reason:
					'The official item awards all three marks for plotting supplied values and drawing a line of best fit. The LED supplies the dataset, but no Electricity chapter knowledge earns a mark.'
			},
			{
				ref: '03.5',
				sourceClassification: 'aqa-combined-physics-working-scientifically-withheld',
				reason:
					'The official item awards its mark only for identifying results obtained by another student with the same pattern as reproducible. This is a generic working-scientifically classification, not Electricity chapter knowledge.'
			}
		],
		'aqa-8464p1h-qp-jun18': ['01.3', '01.4', '02.2', '02.3', '03.4', '03.5', '05.2'].map((ref) => ({
			ref,
			sourceClassification: 'aqa-combined-physics-working-scientifically-withheld',
			reason: SCIENCE_SKILL_WITHHOLDING
		})),
		'aqa-8464p1h-qp-jun19': [
			{
				ref: '06.5',
				sourceClassification: 'aqa-combined-physics-working-scientifically-withheld',
				reason: SCIENCE_SKILL_WITHHOLDING
			}
		]
	};
}

function separatePhysicsMappingDecisions() {
	return {
		'aqa-84631h-qp-jun24': {
			4.1: ['01.1', '01.2', '01.3', '01.4', '02.2', '02.3', '06.1', '06.2', '06.3'],
			4.2: [
				'03.1',
				'03.2',
				'03.3',
				'04.1',
				'04.2',
				'04.3',
				'04.4',
				'04.5',
				'05.1',
				'05.2',
				'05.3',
				'05.4',
				'05.5',
				'10.1',
				'10.2',
				'10.3'
			],
			4.3: ['07.2', '07.5', '08.1', '08.2', '08.3', '10.4', '10.5'],
			4.4: ['02.1', '02.4', '09.1', '09.2', '09.3', '09.4', '09.5']
		}
	};
}

function separatePhysicsWithholdingDecisions() {
	return {
		'aqa-84631h-qp-jun24': [
			{
				ref: '02.5',
				sourceClassification: 'aqa-physics-generic-mathematics-withheld',
				reason:
					'The official item awards both marks for calculating 92% of 365 days. Nuclear generation supplies the setting but no Physics chapter knowledge earns a mark.'
			},
			{
				ref: '07.1',
				sourceClassification: 'aqa-physics-working-scientifically-withheld',
				reason:
					'The official item awards its mark only for identifying random error from a misaligned eye. This is a generic working-scientifically error classification, not density content.'
			},
			{
				ref: '07.3',
				sourceClassification: 'aqa-physics-working-scientifically-withheld',
				reason:
					'The official item awards its mark only for recognising inadequate measuring-cylinder resolution. The metal-ring setting does not make the generic measurement-resolution operation a Particle model chapter question.'
			},
			{
				ref: '07.4',
				sourceClassification: 'aqa-physics-working-scientifically-withheld',
				reason:
					'The official item awards its mark only for subtracting a residual balance reading. Correcting a zero offset is a generic working-scientifically operation; no Physics chapter content is assessed.'
			}
		]
	};
}

function literatureMappingDecisions() {
	return {
		'ocr-j352-11-qp-jun22': {
			'01.modern.anita-and-me': ['01.1b'],
			'01.modern.never-let-me-go': ['02.1b'],
			'01.modern.animal-farm': ['03.1b'],
			'01.modern.an-inspector-calls': ['04.1b'],
			'01.modern.dna': ['06.1a', '06.1b']
		},
		'ocr-j352-11-qp-nov21': {
			'01.modern.anita-and-me': ['01.1', '01.2'],
			'01.modern.never-let-me-go': ['02.1', '02.2'],
			'01.modern.animal-farm': ['03.1', '03.2'],
			'01.modern.an-inspector-calls': ['04.1', '04.2'],
			'01.modern.dna': ['06.1', '06.2']
		},
		'ocr-j352-12-qp-jun22': {
			'01.nineteenth-century.great-expectations': ['01.0', '02.0'],
			'01.nineteenth-century.pride-and-prejudice': ['03.0', '04.0'],
			'01.nineteenth-century.the-war-of-the-worlds': ['05.0', '06.0'],
			'01.nineteenth-century.the-strange-case-of-dr-jekyll-and-mr-hyde': ['07.0', '08.0'],
			'01.nineteenth-century.jane-eyre': ['09.0', '10.0'],
			'01.nineteenth-century.a-christmas-carol': ['11.0', '12.0']
		},
		'ocr-j352-12-qp-nov21': {
			'01.nineteenth-century.great-expectations': ['01.0', '02.0'],
			'01.nineteenth-century.pride-and-prejudice': ['03.0', '04.0'],
			'01.nineteenth-century.the-war-of-the-worlds': ['05.0', '06.0'],
			'01.nineteenth-century.the-strange-case-of-dr-jekyll-and-mr-hyde': ['07.0', '08.0'],
			'01.nineteenth-century.jane-eyre': ['09.0', '10.0'],
			'01.nineteenth-century.a-christmas-carol': ['11.0', '12.0']
		},
		'ocr-j352-21-qp-jun22': {
			'02.poetry.love-and-relationships': ['01.1', '01.2'],
			'02.poetry.conflict': ['02.1', '02.2'],
			'02.poetry.youth-and-age': ['03.1', '03.2']
		},
		'ocr-j352-21-qp-nov21': {
			'02.poetry.love-and-relationships': ['01.1a', '01.1b'],
			'02.poetry.conflict': ['02.1a', '02.1b'],
			'02.poetry.youth-and-age': ['03.1a', '03.1b']
		},
		'ocr-j352-22-qp-jun22': {
			'02.shakespeare.romeo-and-juliet': ['01.0', '02.0'],
			'02.shakespeare.the-merchant-of-venice': ['03.0', '04.0'],
			'02.shakespeare.macbeth': ['05.0', '06.0'],
			'02.shakespeare.much-ado-about-nothing': ['07.0', '08.0']
		},
		'ocr-j352-22-qp-nov21': {
			'02.shakespeare.romeo-and-juliet': ['01.0', '02.0'],
			'02.shakespeare.the-merchant-of-venice': ['03.0', '04.0'],
			'02.shakespeare.macbeth': ['05.0', '06.0'],
			'02.shakespeare.much-ado-about-nothing': ['07.0', '08.0']
		}
	};
}

function literatureWithholdingDecisions() {
	return {
		'ocr-j352-11-qp-jun22': ['05.1a', '05.1b'].map((ref) => ({
			ref,
			sourceClassification: 'ocr-j352-historical-text-not-in-current-option-tree',
			reason: HISTORICAL_LITERATURE_OPTION_REASON
		})),
		'ocr-j352-11-qp-nov21': ['05.1', '05.2'].map((ref) => ({
			ref,
			sourceClassification: 'ocr-j352-historical-text-not-in-current-option-tree',
			reason: HISTORICAL_LITERATURE_OPTION_REASON
		}))
	};
}
