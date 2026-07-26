import { createHash } from 'node:crypto';

export const SCIENCE_CHALLENGE_SOURCE_SCHEMA_VERSION = 'science-challenge-source-snapshot-v1';

const SUBJECTS = Object.freeze(['Biology', 'Chemistry', 'Physics']);

/**
 * Build the immutable evidence input used by the offline science-challenge generator.
 * The function is deliberately pure so fixture tests can exercise every publication gate without
 * a D1 connection.
 *
 * @param {Record<string, Array<Record<string, unknown>>>} rawTables
 * @param {{ expectedQuestionCount?: number }} [options]
 */
export function buildScienceChallengeSourceSnapshot(
	rawTables,
	{ expectedQuestionCount = 498 } = {}
) {
	const tables = normalizedTables(rawTables);
	const sourceDocuments = uniqueRows(tables.sourceDocuments, 'source document').map(
		normalizeSourceDocument
	);
	const sourceDocumentById = new Map(sourceDocuments.map((row) => [row.id, row]));
	for (const document of sourceDocuments) {
		assertSha256(document.fileHash, `Source document ${document.id} has no SHA-256 file hash.`);
	}

	const rawQuestions = uniqueRows(tables.questions, 'question');
	if (rawQuestions.length !== expectedQuestionCount) {
		throw new Error(
			`Expected ${expectedQuestionCount} clean published science questions, found ${rawQuestions.length}.`
		);
	}

	const rowsByQuestion = {
		renderingOverlays: groupBy(tables.renderingOverlays, 'question_id'),
		responseAnswerKeys: groupBy(tables.responseAnswerKeys, 'question_id'),
		markSchemeItems: groupBy(tables.markSchemeItems, 'question_id'),
		markChecklistItems: groupBy(tables.markChecklistItems, 'question_id'),
		modelAnswers: groupBy(tables.modelAnswers, 'question_id'),
		questionAssets: groupBy(
			tables.questionAssets.filter((row) => flag(row.required)),
			'question_id'
		),
		primaryChainMappings: groupBy(tables.primaryChainMappings, 'question_id'),
		questionWeakAnswers: groupBy(tables.questionWeakAnswers, 'question_id')
	};
	const chainById = new Map(
		uniqueRows(tables.answerChains, 'answer chain').map((row) => [String(row.id), row])
	);
	const stepsByChain = groupBy(tables.answerChainSteps, 'answer_chain_id');
	const chainWeakAnswers = groupBy(
		tables.chainWeakAnswers.filter((row) => row.question_id == null),
		'answer_chain_id'
	);

	const questions = rawQuestions.map((rawQuestion) => {
		const question = normalizeQuestion(rawQuestion);
		assertPublishedClean('Question', question.id, question.status, question.needsHumanReview);
		if (!SUBJECTS.includes(question.subject)) {
			throw new Error(`Question ${question.id} has unsupported subject ${question.subject}.`);
		}
		if (!sourceDocumentById.has(question.sourceDocumentId)) {
			throw new Error(
				`Question ${question.id} references missing source document ${question.sourceDocumentId}.`
			);
		}

		const markSchemeItems = rows(rowsByQuestion.markSchemeItems, question.id)
			.map(normalizeMarkSchemeItem)
			.sort(byOrderThenId);
		if (markSchemeItems.length === 0) {
			throw new Error(`Question ${question.id} has no mark-scheme rows.`);
		}
		for (const item of markSchemeItems) {
			if (item.sourceDocumentId && !sourceDocumentById.has(item.sourceDocumentId)) {
				throw new Error(
					`Mark-scheme row ${item.id} references missing source document ${item.sourceDocumentId}.`
				);
			}
		}

		const checklistItems = rows(rowsByQuestion.markChecklistItems, question.id)
			.map(normalizeChecklistItem)
			.sort(byOrderThenId);
		if (checklistItems.length === 0) {
			throw new Error(`Question ${question.id} has no mark checklist.`);
		}
		for (const item of checklistItems) {
			assertReviewClean('Checklist item', item.id, item.needsHumanReview);
		}

		const mappings = rows(rowsByQuestion.primaryChainMappings, question.id);
		if (mappings.length !== 1) {
			throw new Error(
				`Question ${question.id} must have exactly one primary answer chain; found ${mappings.length}.`
			);
		}
		const mapping = normalizeChainMapping(mappings[0]);
		assertReviewClean('Primary chain mapping', mapping.id, mapping.needsHumanReview);
		const rawChain = chainById.get(mapping.answerChainId);
		if (!rawChain) {
			throw new Error(
				`Question ${question.id} references missing primary answer chain ${mapping.answerChainId}.`
			);
		}
		const chain = normalizeAnswerChain(rawChain);
		assertPublishedClean('Answer chain', chain.id, chain.status, chain.needsHumanReview);
		const steps = rows(stepsByChain, chain.id).map(normalizeChainStep).sort(byOrderThenId);
		if (steps.length === 0) {
			throw new Error(`Primary answer chain ${chain.id} has no ordered steps.`);
		}

		const renderingOverlays = rows(rowsByQuestion.renderingOverlays, question.id)
			.map(normalizeRenderingOverlay)
			.sort(
				(left, right) =>
					compare(left.overlayVersion, right.overlayVersion) || compare(left.id, right.id)
			);
		for (const overlay of renderingOverlays) {
			assertReviewClean('Rendering overlay', overlay.id, overlay.needsHumanReview);
		}

		const modelAnswers = rows(rowsByQuestion.modelAnswers, question.id)
			.map(normalizeModelAnswer)
			.sort(byId);
		for (const answer of modelAnswers) {
			assertReviewClean('Model answer', answer.id, answer.needsHumanReview);
		}

		const requiredAssets = rows(rowsByQuestion.questionAssets, question.id)
			.map(normalizeRequiredAsset)
			.sort(byId);
		for (const asset of requiredAssets) {
			assertReviewClean('Required asset', asset.id, asset.needsHumanReview);
		}

		const weakAnswers = deduplicateById([
			...rows(rowsByQuestion.questionWeakAnswers, question.id),
			...rows(chainWeakAnswers, chain.id)
		])
			.map(normalizeWeakAnswer)
			.sort(byId);
		for (const weakAnswer of weakAnswers) {
			assertReviewClean('Common weak answer', weakAnswer.id, weakAnswer.needsHumanReview);
		}

		return {
			...question,
			renderingOverlays,
			fixedAnswerKeys: rows(rowsByQuestion.responseAnswerKeys, question.id)
				.map(normalizeResponseAnswerKey)
				.sort(
					(left, right) =>
						compare(left.responseKind, right.responseKind) ||
						left.displayOrder - right.displayOrder ||
						compare(left.targetId, right.targetId) ||
						compare(left.id, right.id)
				),
			markSchemeItems,
			checklistItems,
			modelAnswers,
			requiredAssets,
			primaryAnswerChain: { mapping, chain, steps },
			commonWeakAnswers: weakAnswers
		};
	});

	questions.sort(
		(left, right) =>
			compare(left.subject, right.subject) ||
			compare(left.sourceDocumentId, right.sourceDocumentId) ||
			left.displayOrder - right.displayOrder ||
			compare(left.id, right.id)
	);
	sourceDocuments.sort(byId);

	const counts = {
		questions: questions.length,
		sourceDocuments: sourceDocuments.length,
		bySubject: Object.fromEntries(
			SUBJECTS.map((subject) => [
				subject,
				questions.filter((question) => question.subject === subject).length
			])
		),
		markSchemeItems: questions.reduce((sum, row) => sum + row.markSchemeItems.length, 0),
		checklistItems: questions.reduce((sum, row) => sum + row.checklistItems.length, 0),
		modelAnswers: questions.reduce((sum, row) => sum + row.modelAnswers.length, 0),
		fixedAnswerKeys: questions.reduce((sum, row) => sum + row.fixedAnswerKeys.length, 0),
		renderingOverlays: questions.reduce((sum, row) => sum + row.renderingOverlays.length, 0),
		primaryAnswerChains: questions.length,
		requiredAssets: questions.reduce((sum, row) => sum + row.requiredAssets.length, 0),
		commonWeakAnswers: questions.reduce((sum, row) => sum + row.commonWeakAnswers.length, 0)
	};
	const payload = {
		schemaVersion: SCIENCE_CHALLENGE_SOURCE_SCHEMA_VERSION,
		selection: {
			board: 'AQA',
			qualification: 'GCSE',
			subjects: [...SUBJECTS],
			questionStatus: 'published',
			needsHumanReview: false
		},
		counts,
		sourceDocuments,
		questions
	};
	return {
		...payload,
		integrity: {
			algorithm: 'sha256',
			canonicalPayloadHash: sha256(stableStringify(payload))
		}
	};
}

/** @param {unknown} value */
export function stableStringify(value) {
	return /** @type {string} */ (JSON.stringify(sortValue(value)));
}

/** @param {unknown} snapshot */
export function serializeScienceChallengeSourceSnapshot(snapshot) {
	return `${JSON.stringify(sortValue(snapshot), null, 2)}\n`;
}

/** @param {Record<string, Array<Record<string, unknown>>>} rawTables */
function normalizedTables(rawTables) {
	return Object.fromEntries(
		[
			'sourceDocuments',
			'questions',
			'renderingOverlays',
			'responseAnswerKeys',
			'markSchemeItems',
			'markChecklistItems',
			'modelAnswers',
			'questionAssets',
			'primaryChainMappings',
			'answerChains',
			'answerChainSteps',
			'questionWeakAnswers',
			'chainWeakAnswers'
		].map((name) => {
			const rows = rawTables[name];
			if (!Array.isArray(rows)) throw new Error(`Missing source table ${name}.`);
			return [name, rows];
		})
	);
}

/** @param {Record<string, unknown>} row */
function normalizeSourceDocument(row) {
	return {
		id: text(row.id),
		documentType: text(row.doc_type),
		board: nullableText(row.board),
		qualification: nullableText(row.qualification),
		subject: nullableText(row.subject),
		subjectArea: nullableText(row.subject_area),
		tier: nullableText(row.tier),
		paper: nullableText(row.paper),
		componentCode: nullableText(row.component_code),
		series: nullableText(row.series),
		year: nullableNumber(row.year),
		title: nullableText(row.title),
		sourceUrl: nullableText(row.source_url),
		filePath: nullableText(row.file_path),
		fileHash: nullableText(row.file_hash),
		pageCount: nullableNumber(row.page_count),
		metadata: json(row, 'metadata_json', {})
	};
}

/** @param {Record<string, unknown>} row */
function normalizeQuestion(row) {
	return {
		id: text(row.id),
		sourceDocumentId: text(row.source_document_id),
		parentSourceQuestionRef: nullableText(row.parent_source_question_ref),
		sourceQuestionRef: text(row.source_question_ref),
		slug: text(row.slug),
		displayOrder: number(row.display_order),
		promptText: text(row.prompt_text),
		selfContainedPromptText: nullableText(row.self_contained_prompt_text),
		contextText: nullableText(row.context_text),
		commandWord: nullableText(row.command_word),
		marks: nullableNumber(row.marks),
		board: text(row.board),
		qualification: text(row.qualification),
		subject: text(row.subject),
		subjectArea: nullableText(row.subject_area),
		tier: nullableText(row.tier),
		paper: nullableText(row.paper),
		componentCode: nullableText(row.component_code),
		series: nullableText(row.series),
		year: nullableNumber(row.year),
		topicPath: json(row, 'topic_path_json', []),
		specificationReference: nullableText(row.spec_ref),
		pageStart: nullableNumber(row.page_start),
		pageEnd: nullableNumber(row.page_end),
		answerFormat: nullableText(row.answer_format),
		sourceConstraints: json(row, 'source_constraints_json', []),
		selfContainment: json(row, 'self_containment_json', {}),
		extractionConfidence: nullableNumber(row.extraction_confidence),
		needsHumanReview: flag(row.needs_human_review),
		reviewNotes: json(row, 'review_notes_json', []),
		status: text(row.status),
		metadata: json(row, 'metadata_json', {})
	};
}

/** @param {Record<string, unknown>} row */
function normalizeRenderingOverlay(row) {
	return {
		id: text(row.id),
		sourceDocumentId: text(row.source_document_id),
		sourceQuestionRef: text(row.source_question_ref),
		overlayVersion: text(row.overlay_version),
		provenance: text(row.provenance),
		confidence: nullableNumber(row.confidence),
		needsHumanReview: flag(row.needs_human_review),
		render: json(row, 'render_json', {})
	};
}

/** @param {Record<string, unknown>} row */
function normalizeResponseAnswerKey(row) {
	return {
		id: text(row.id),
		responseKind: text(row.response_kind),
		targetId: text(row.target_id),
		correctAnswer: text(row.correct_answer),
		displayOrder: number(row.display_order),
		aliases: json(row, 'aliases_json', []),
		metadata: json(row, 'metadata_json', {})
	};
}

/** @param {Record<string, unknown>} row */
function normalizeMarkSchemeItem(row) {
	return {
		id: text(row.id),
		sourceDocumentId: nullableText(row.source_document_id),
		displayOrder: number(row.display_order),
		itemType: text(row.item_type),
		text: text(row.text),
		marks: nullableNumber(row.marks),
		sourceReference: nullableText(row.source_ref),
		confidence: nullableNumber(row.confidence),
		metadata: json(row, 'metadata_json', {})
	};
}

/** @param {Record<string, unknown>} row */
function normalizeChecklistItem(row) {
	return {
		id: text(row.id),
		displayOrder: number(row.display_order),
		text: text(row.text),
		required: flag(row.required),
		markSchemeItemIds: json(row, 'mark_scheme_item_ids_json', []),
		confidence: nullableNumber(row.confidence),
		needsHumanReview: flag(row.needs_human_review)
	};
}

/** @param {Record<string, unknown>} row */
function normalizeModelAnswer(row) {
	return {
		id: text(row.id),
		answerText: text(row.answer_text),
		derivation: text(row.derivation),
		supportingMarkSchemeItemIds: json(row, 'supporting_mark_scheme_item_ids_json', []),
		confidence: nullableNumber(row.confidence),
		needsHumanReview: flag(row.needs_human_review)
	};
}

/** @param {Record<string, unknown>} row */
function normalizeRequiredAsset(row) {
	return {
		id: text(row.id),
		assetType: text(row.asset_type),
		sourceLabel: nullableText(row.source_label),
		required: flag(row.required),
		role: nullableText(row.role),
		pageNumber: nullableNumber(row.page_number),
		boundingBox: json(row, 'bbox_json', null),
		altText: nullableText(row.alt_text),
		extractedText: nullableText(row.extracted_text),
		filePath: nullableText(row.file_path),
		r2Key: nullableText(row.r2_key),
		publicPath: nullableText(row.public_path),
		extractionConfidence: nullableNumber(row.extraction_confidence),
		needsHumanReview: flag(row.needs_human_review),
		metadata: json(row, 'metadata_json', {})
	};
}

/** @param {Record<string, unknown>} row */
function normalizeChainMapping(row) {
	return {
		id: text(row.id),
		answerChainId: text(row.answer_chain_id),
		isPrimary: flag(row.is_primary),
		fitConfidence: nullableNumber(row.fit_confidence),
		fitNotes: nullableText(row.fit_notes),
		transferDistance: text(row.transfer_distance),
		displayOrder: nullableNumber(row.display_order),
		needsHumanReview: flag(row.needs_human_review),
		reviewNotes: json(row, 'review_notes_json', []),
		metadata: json(row, 'metadata_json', {})
	};
}

/** @param {Record<string, unknown>} row */
function normalizeAnswerChain(row) {
	return {
		id: text(row.id),
		slug: text(row.slug),
		title: text(row.title),
		canonicalChainText: text(row.canonical_chain_text),
		subject: nullableText(row.subject),
		subjectArea: nullableText(row.subject_area),
		broadTopic: nullableText(row.broad_topic),
		summary: nullableText(row.summary),
		createdBy: text(row.created_by),
		confidence: nullableNumber(row.confidence),
		needsHumanReview: flag(row.needs_human_review),
		reviewNotes: json(row, 'review_notes_json', []),
		status: text(row.status),
		metadata: json(row, 'metadata_json', {})
	};
}

/** @param {Record<string, unknown>} row */
function normalizeChainStep(row) {
	return {
		id: text(row.id),
		displayOrder: number(row.display_order),
		stepText: text(row.step_text),
		stepRole: text(row.step_role),
		explanation: nullableText(row.explanation),
		commonOmission: nullableText(row.common_omission),
		supportedByMarkSchemeItemIds: json(row, 'supported_by_mark_scheme_item_ids_json', []),
		evidence: json(row, 'evidence_json', [])
	};
}

/** @param {Record<string, unknown>} row */
function normalizeWeakAnswer(row) {
	return {
		id: text(row.id),
		questionId: nullableText(row.question_id),
		answerChainId: nullableText(row.answer_chain_id),
		weakAnswerText: text(row.weak_answer_text),
		missingChainStepIds: json(row, 'missing_chain_step_ids_json', []),
		explanation: nullableText(row.explanation),
		source: text(row.source),
		confidence: nullableNumber(row.confidence),
		needsHumanReview: flag(row.needs_human_review)
	};
}

/** @param {Array<Record<string, unknown>>} sourceRows @param {string} label */
function uniqueRows(sourceRows, label) {
	const seen = new Set();
	return sourceRows.map((row) => {
		const id = text(row.id);
		if (seen.has(id)) throw new Error(`Duplicate ${label} id ${id}.`);
		seen.add(id);
		return row;
	});
}

/** @param {Array<Record<string, unknown>>} sourceRows @param {string} key */
function groupBy(sourceRows, key) {
	const grouped = new Map();
	for (const row of sourceRows) {
		const value = row[key];
		if (value == null) continue;
		const id = String(value);
		if (!grouped.has(id)) grouped.set(id, []);
		grouped.get(id).push(row);
	}
	return grouped;
}

/** @param {Map<string, Array<Record<string, unknown>>>} grouped @param {string} id */
function rows(grouped, id) {
	return grouped.get(id) ?? [];
}

/** @param {Array<Record<string, unknown>>} sourceRows */
function deduplicateById(sourceRows) {
	return [...new Map(sourceRows.map((row) => [text(row.id), row])).values()];
}

/** @param {string} label @param {string} id @param {string} status @param {boolean} needsReview */
function assertPublishedClean(label, id, status, needsReview) {
	if (status !== 'published') throw new Error(`${label} ${id} is not published.`);
	assertReviewClean(label, id, needsReview);
}

/** @param {string} label @param {string} id @param {boolean} needsReview */
function assertReviewClean(label, id, needsReview) {
	if (needsReview) throw new Error(`${label} ${id} needs human review.`);
}

/** @param {unknown} value @param {string} message */
function assertSha256(value, message) {
	if (typeof value !== 'string' || !/^(?:sha256:)?[a-f0-9]{64}$/i.test(value)) {
		throw new Error(message);
	}
}

/** @param {Record<string, unknown>} row @param {string} key @param {unknown} fallback */
function json(row, key, fallback) {
	const value = row[key];
	if (value == null || value === '') return fallback;
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch (error) {
		throw new Error(
			`Invalid JSON in ${text(row.id)}.${key}: ${error instanceof Error ? error.message : error}`,
			{ cause: error }
		);
	}
}

/** @param {unknown} value */
function text(value) {
	if (typeof value !== 'string' || value.length === 0) throw new Error('Expected non-empty text.');
	return value;
}

/** @param {unknown} value */
function nullableText(value) {
	return value == null || value === '' ? null : String(value);
}

/** @param {unknown} value */
function number(value) {
	const normalized = Number(value);
	if (!Number.isFinite(normalized)) throw new Error(`Expected a finite number, found ${value}.`);
	return normalized;
}

/** @param {unknown} value */
function nullableNumber(value) {
	return value == null || value === '' ? null : number(value);
}

/** @param {unknown} value */
function flag(value) {
	return value === true || value === 1 || value === '1';
}

/** @param {{ id: string }} left @param {{ id: string }} right */
function byId(left, right) {
	return compare(left.id, right.id);
}

/** @param {{ displayOrder: number, id: string }} left @param {{ displayOrder: number, id: string }} right */
function byOrderThenId(left, right) {
	return left.displayOrder - right.displayOrder || compare(left.id, right.id);
}

/** @param {string} left @param {string} right */
function compare(left, right) {
	return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {unknown} value */
function sha256(value) {
	return createHash('sha256').update(String(value)).digest('hex');
}

/** @param {unknown} value */
function sortValue(value) {
	if (Array.isArray(value)) return value.map(sortValue);
	if (!value || typeof value !== 'object') return value;
	const record = /** @type {Record<string, unknown>} */ (value);
	return Object.fromEntries(
		Object.keys(record)
			.sort()
			.map((key) => [key, sortValue(record[key])])
	);
}
