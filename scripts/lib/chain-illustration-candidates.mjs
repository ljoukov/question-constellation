import { d1Rows } from './d1-rest.mjs';
import { sourceFingerprint } from './chain-illustration-pipeline.mjs';

const SCIENCE_SUBJECTS = new Set(['Biology', 'Chemistry', 'Physics']);
const REASONING_ROLES = new Set([
	'cause',
	'process',
	'link',
	'effect',
	'method',
	'calculation',
	'conclusion'
]);
const LEVEL_TYPES = new Set([
	'level',
	'level_descriptor',
	'level-descriptor',
	'leveldescriptor',
	'level_guidance'
]);

/**
 * @typedef {object} CandidateOptions
 * @property {string} [rootDir]
 * @property {string} [subject]
 * @property {string[]} [chainIds]
 * @property {string[]} [sourceDocumentIds]
 * @property {number} [limit]
 * @property {boolean} [includeExisting]
 */

/**
 * @typedef {object} ChainRow
 * @property {string} id
 * @property {string | null} slug
 * @property {string | null} title
 * @property {string} canonicalChainText
 * @property {string | null} summary
 * @property {string} subjectArea
 * @property {string | null} broadTopic
 * @property {number | string | null} confidence
 * @property {string | null} updatedAt
 * @property {string | null} [existingSourceFingerprint]
 * @property {string | null} [existingIllustrationId]
 */

/**
 * @typedef {object} ChainStepRow
 * @property {string} id
 * @property {string} chainId
 * @property {number | string} displayOrder
 * @property {string} stepText
 * @property {string} stepRole
 * @property {string | null} [explanation]
 * @property {string | null} [commonOmission]
 */

/**
 * @typedef {object} ChainMemberRow
 * @property {string} chainId
 * @property {number | string | null} fitConfidence
 * @property {number | string | null} membershipNeedsReview
 * @property {string} questionId
 * @property {string} questionStatus
 * @property {number | string | null} questionNeedsReview
 * @property {number | string | null} extractionConfidence
 * @property {string} sourceDocumentId
 * @property {string} sourceQuestionRef
 * @property {string} promptText
 * @property {string | null} selfContainedPromptText
 * @property {string | null} commandWord
 * @property {number | string | null} marks
 * @property {string | null} paper
 * @property {string | null} series
 * @property {number | string | null} year
 * @property {number | string | null} overlayCount
 */

/**
 * @typedef {object} EvidenceRow
 * @property {string} id
 * @property {string} questionId
 * @property {number | string | null} [displayOrder]
 * @property {string} [itemType]
 * @property {string} [text]
 * @property {number | string | null} [marks]
 * @property {number | string | null} [confidence]
 * @property {number | string | null} [required]
 * @property {number | string | null} [needsHumanReview]
 * @property {string | null} [markSchemeItemIdsJson]
 * @property {string} [answerText]
 * @property {string | null} [derivation]
 * @property {string | null} [supportingMarkSchemeItemIdsJson]
 */

/**
 * @typedef {object} CandidateStep
 * @property {string} id
 * @property {number} displayOrder
 * @property {string} stepText
 * @property {string} stepRole
 * @property {string | null} [explanation]
 * @property {string | null} [commonOmission]
 */

/**
 * @typedef {object} CandidateMarkSchemeItem
 * @property {string} id
 * @property {number} displayOrder
 * @property {string} itemType
 * @property {string} text
 * @property {number | null} marks
 * @property {number} confidence
 */

/**
 * @typedef {object} CandidateChecklistItem
 * @property {string} id
 * @property {number} displayOrder
 * @property {string} text
 * @property {boolean} required
 * @property {number} confidence
 * @property {number} needsHumanReview
 * @property {string[]} markSchemeItemIds
 */

/**
 * @typedef {object} CandidateModelAnswer
 * @property {string} id
 * @property {string} answerText
 * @property {string | null | undefined} derivation
 * @property {number} confidence
 * @property {number} needsHumanReview
 * @property {string[]} supportingMarkSchemeItemIds
 */

/**
 * @typedef {object} CandidateMember
 * @property {string} chainId
 * @property {number} fitConfidence
 * @property {number} membershipNeedsReview
 * @property {string} questionId
 * @property {string} questionStatus
 * @property {number} questionNeedsReview
 * @property {number} extractionConfidence
 * @property {string} sourceDocumentId
 * @property {string} sourceQuestionRef
 * @property {string} promptText
 * @property {string | null} selfContainedPromptText
 * @property {number} marks
 * @property {number} overlayCount
 * @property {CandidateMarkSchemeItem[]} markSchemeItems
 * @property {CandidateChecklistItem[]} checklistItems
 * @property {CandidateModelAnswer[]} modelAnswers
 */

/**
 * @typedef {object} ChainIllustrationCandidate
 * @property {string} id
 * @property {string | null} slug
 * @property {string | null} title
 * @property {string} canonicalChainText
 * @property {string | null} summary
 * @property {string} subjectArea
 * @property {string | null} broadTopic
 * @property {number} confidence
 * @property {string | null} updatedAt
 * @property {string | null} [existingSourceFingerprint]
 * @property {string | null} [existingIllustrationId]
 * @property {CandidateStep[]} steps
 * @property {CandidateMember[]} members
 * @property {string} [sourceFingerprint]
 * @property {{ status: 'passed' | 'rejected', blockers: string[] }} [mechanicalGate]
 */

/** @param {CandidateOptions} [options] */
export async function loadChainIllustrationCandidates({
	rootDir = process.cwd(),
	subject = 'all',
	chainIds = [],
	sourceDocumentIds = [],
	limit = 20,
	includeExisting = false
} = {}) {
	const filters = [
		"ac.status = 'published'",
		'ac.needs_human_review = 0',
		"ac.subject_area IN ('Biology', 'Chemistry', 'Physics')"
	];
	/** @type {(string | number | boolean | null)[]} */
	const params = [];
	if (subject && subject !== 'all') {
		filters.push('ac.subject_area = ?');
		params.push(subject);
	}
	if (chainIds.length) {
		filters.push(`ac.id IN (${chainIds.map(() => '?').join(', ')})`);
		params.push(...chainIds);
	}
	if (sourceDocumentIds.length) {
		filters.push(
			`EXISTS (
			  SELECT 1
			  FROM question_answer_chains source_qac
			  JOIN questions source_q ON source_q.id = source_qac.question_id
			  WHERE source_qac.answer_chain_id = ac.id
			    AND source_q.status = 'published'
			    AND source_q.source_document_id IN (${sourceDocumentIds.map(() => '?').join(', ')})
			)`
		);
		params.push(...sourceDocumentIds);
	}
	const chains = /** @type {ChainRow[]} */ (
		await d1Rows(
			`SELECT ac.id, ac.slug, ac.title,
		        ac.canonical_chain_text AS canonicalChainText,
		        ac.summary, ac.subject_area AS subjectArea,
		        ac.broad_topic AS broadTopic, ac.confidence,
		        ac.updated_at AS updatedAt,
		        (SELECT ai.source_fingerprint
		         FROM answer_chain_illustrations ai
		         WHERE ai.answer_chain_id = ac.id
		           AND ai.status = 'published'
		           AND ai.needs_human_review = 0
		           AND ai.is_primary = 1
		           AND ai.light_r2_key IS NOT NULL
		           AND ai.light_public_path IS NOT NULL
		           AND ai.light_asset_sha256 IS NOT NULL
		         LIMIT 1) AS existingSourceFingerprint,
		        (SELECT ai.id
		         FROM answer_chain_illustrations ai
		         WHERE ai.answer_chain_id = ac.id
		           AND ai.status = 'published'
		           AND ai.needs_human_review = 0
		           AND ai.is_primary = 1
		           AND ai.light_r2_key IS NOT NULL
		           AND ai.light_public_path IS NOT NULL
		           AND ai.light_asset_sha256 IS NOT NULL
		         LIMIT 1) AS existingIllustrationId
		 FROM answer_chains ac
		 WHERE ${filters.join('\n AND ')}
		 ORDER BY ac.subject_area, ac.id`,
			params,
			{ rootDir }
		)
	);
	if (!chains.length) return { eligible: [], rejected: [], skippedFresh: [] };

	const ids = chains.map((chain) => chain.id);
	const stepsByChain = groupBy(await fetchSteps(ids, rootDir), (row) => row.chainId);
	const membersByChain = groupBy(await fetchMembers(ids, rootDir), (row) => row.chainId);
	const questionIds = [
		...new Set([...membersByChain.values()].flat().map((row) => row.questionId))
	];
	const [markRows, checklistRows, modelRows] = await Promise.all([
		fetchByQuestion(
			questionIds,
			`SELECT id, question_id AS questionId, display_order AS displayOrder,
			        item_type AS itemType, text, marks, confidence
			 FROM mark_scheme_items
			 WHERE question_id IN (__IDS__)
			 ORDER BY question_id, display_order`,
			rootDir
		),
		fetchByQuestion(
			questionIds,
			`SELECT id, question_id AS questionId, display_order AS displayOrder,
			        text, required, mark_scheme_item_ids_json AS markSchemeItemIdsJson,
			        confidence, needs_human_review AS needsHumanReview
			 FROM mark_checklist_items
			 WHERE question_id IN (__IDS__)
			 ORDER BY question_id, display_order`,
			rootDir
		),
		fetchByQuestion(
			questionIds,
			`SELECT id, question_id AS questionId, answer_text AS answerText,
			        derivation,
			        supporting_mark_scheme_item_ids_json AS supportingMarkSchemeItemIdsJson,
			        confidence, needs_human_review AS needsHumanReview
			 FROM model_answers
			 WHERE question_id IN (__IDS__)
			 ORDER BY question_id, id`,
			rootDir
		)
	]);
	const marksByQuestion = groupBy(markRows, (row) => row.questionId);
	const checklistByQuestion = groupBy(checklistRows, (row) => row.questionId);
	const modelsByQuestion = groupBy(modelRows, (row) => row.questionId);
	/** @type {ChainIllustrationCandidate[]} */
	const eligible = [];
	/** @type {ChainIllustrationCandidate[]} */
	const rejected = [];
	/** @type {ChainIllustrationCandidate[]} */
	const skippedFresh = [];

	for (const chain of chains) {
		const candidate = /** @type {ChainIllustrationCandidate} */ ({
			...chain,
			confidence: Number(chain.confidence ?? 0),
			steps: (stepsByChain.get(chain.id) ?? []).map((step) => ({
				...step,
				displayOrder: Number(step.displayOrder)
			})),
			members: (membersByChain.get(chain.id) ?? []).map((member) => ({
				...member,
				marks: Number(member.marks ?? 0),
				fitConfidence: Number(member.fitConfidence ?? 0),
				extractionConfidence: Number(member.extractionConfidence ?? 0),
				questionNeedsReview: Number(member.questionNeedsReview ?? 0),
				membershipNeedsReview: Number(member.membershipNeedsReview ?? 0),
				overlayCount: Number(member.overlayCount ?? 0),
				markSchemeItems: (marksByQuestion.get(member.questionId) ?? []).map((row) => ({
					...row,
					displayOrder: Number(row.displayOrder),
					marks: row.marks === null ? null : Number(row.marks),
					confidence: Number(row.confidence ?? 0)
				})),
				checklistItems: (checklistByQuestion.get(member.questionId) ?? []).map((row) => ({
					...row,
					displayOrder: Number(row.displayOrder),
					required: Boolean(row.required),
					confidence: Number(row.confidence ?? 0),
					needsHumanReview: Number(row.needsHumanReview ?? 0),
					markSchemeItemIds: jsonArray(row.markSchemeItemIdsJson)
				})),
				modelAnswers: (modelsByQuestion.get(member.questionId) ?? []).map((row) => ({
					...row,
					confidence: Number(row.confidence ?? 0),
					needsHumanReview: Number(row.needsHumanReview ?? 0),
					supportingMarkSchemeItemIds: jsonArray(row.supportingMarkSchemeItemIdsJson)
				}))
			}))
		});
		const blockers = mechanicalBlockers(candidate);
		candidate.sourceFingerprint = sourceFingerprint(candidate);
		candidate.mechanicalGate = { status: blockers.length ? 'rejected' : 'passed', blockers };
		if (blockers.length) rejected.push(candidate);
		else if (
			!includeExisting &&
			candidate.existingIllustrationId &&
			candidate.existingSourceFingerprint === candidate.sourceFingerprint
		) {
			skippedFresh.push(candidate);
		} else eligible.push(candidate);
	}

	eligible.sort(prioritySort);
	return {
		eligible: limit > 0 ? eligible.slice(0, limit) : eligible,
		rejected,
		skippedFresh
	};
}

/** @param {ChainIllustrationCandidate} candidate */
export function mechanicalBlockers(candidate) {
	const blockers = [];
	if (!SCIENCE_SUBJECTS.has(candidate.subjectArea)) blockers.push('unsupported subject');
	if (candidate.confidence < 0.85) blockers.push('chain confidence below 0.85');
	if (candidate.steps.length < 2 || candidate.steps.length > 5) blockers.push('requires 2-5 steps');
	const canonicalLinks = String(candidate.canonicalChainText ?? '')
		.split(/\s*->\s*/)
		.map((part) => part.trim())
		.filter(Boolean);
	if (canonicalLinks.length !== candidate.steps.length)
		blockers.push('canonical/step count mismatch');
	if (candidate.steps.some((step) => !step.stepText || String(step.stepText).length > 48)) {
		blockers.push('step label missing or over 48 characters');
	}
	if (candidate.steps.filter((step) => REASONING_ROLES.has(step.stepRole)).length < 2) {
		blockers.push('not a reasoning/process chain');
	}
	if (
		/\b(?:recall|state|name|identify|round|unit)\b/i.test(
			`${candidate.id} ${candidate.title} ${candidate.summary} ${candidate.broadTopic} ${candidate.canonicalChainText}`
		)
	) {
		blockers.push('recall or formatting-only chain');
	}
	const papers = new Set(candidate.members.map((member) => member.sourceDocumentId));
	if (candidate.members.length < 2) blockers.push('fewer than two public questions');
	if (papers.size < 2) blockers.push('fewer than two source papers');
	for (const member of candidate.members) {
		const prefix = member.questionId;
		if (member.questionStatus !== 'published')
			blockers.push(`${prefix}: question is not published`);
		if (member.questionNeedsReview || member.membershipNeedsReview) {
			blockers.push(`${prefix}: review flag`);
		}
		if (member.fitConfidence < 0.85) blockers.push(`${prefix}: fit confidence below 0.85`);
		if (member.extractionConfidence < 0.8) {
			blockers.push(`${prefix}: extraction confidence below 0.80`);
		}
		if (member.marks < 1 || member.marks > 6) blockers.push(`${prefix}: marks outside 1-6`);
		const usableMarks = member.markSchemeItems.filter(
			(item) =>
				!LEVEL_TYPES.has(String(item.itemType).toLowerCase()) &&
				String(item.text ?? '').trim() &&
				Number(item.marks ?? 0) > 0 &&
				item.confidence >= 0.8
		);
		if (!usableMarks.length) blockers.push(`${prefix}: no clean mark-scheme evidence`);
		if (
			member.markSchemeItems.some((item) => LEVEL_TYPES.has(String(item.itemType).toLowerCase()))
		) {
			blockers.push(`${prefix}: level-based mark scheme`);
		}
		const cleanModels = member.modelAnswers.filter(
			(answer) => !answer.needsHumanReview && answer.confidence >= 0.82
		);
		const cleanChecklist = member.checklistItems.filter(
			(item) => !item.needsHumanReview && item.confidence >= 0.82
		);
		if (
			!cleanModels.length ||
			!cleanChecklist.length ||
			cleanModels.length !== member.modelAnswers.length ||
			cleanChecklist.length !== member.checklistItems.length
		) {
			blockers.push(`${prefix}: clean model/checklist evidence missing`);
		}
		const markIds = new Set(member.markSchemeItems.map((item) => item.id));
		for (const checklist of cleanChecklist) {
			for (const markId of checklist.markSchemeItemIds) {
				if (!markIds.has(markId)) blockers.push(`${prefix}: dangling checklist mark ID ${markId}`);
			}
		}
		for (const model of cleanModels) {
			for (const markId of model.supportingMarkSchemeItemIds) {
				if (!markIds.has(markId)) blockers.push(`${prefix}: dangling model mark ID ${markId}`);
			}
		}
	}
	return [...new Set(blockers)];
}

/**
 * @param {string[]} chainIds
 * @param {string} rootDir
 * @returns {Promise<ChainStepRow[]>}
 */
async function fetchSteps(chainIds, rootDir) {
	return /** @type {Promise<ChainStepRow[]>} */ (
		chunkedRows(
			chainIds,
			`SELECT id, answer_chain_id AS chainId, display_order AS displayOrder,
		        step_text AS stepText, step_role AS stepRole,
		        explanation, common_omission AS commonOmission
		 FROM answer_chain_steps
		 WHERE answer_chain_id IN (__IDS__)
		 ORDER BY answer_chain_id, display_order`,
			rootDir
		)
	);
}

/**
 * @param {string[]} chainIds
 * @param {string} rootDir
 * @returns {Promise<ChainMemberRow[]>}
 */
async function fetchMembers(chainIds, rootDir) {
	return /** @type {Promise<ChainMemberRow[]>} */ (
		chunkedRows(
			chainIds,
			`SELECT qac.answer_chain_id AS chainId,
		        qac.fit_confidence AS fitConfidence,
		        qac.needs_human_review AS membershipNeedsReview,
		        q.id AS questionId, q.status AS questionStatus,
		        q.needs_human_review AS questionNeedsReview,
		        q.extraction_confidence AS extractionConfidence,
		        q.source_document_id AS sourceDocumentId,
		        q.source_question_ref AS sourceQuestionRef,
		        q.prompt_text AS promptText,
		        q.self_contained_prompt_text AS selfContainedPromptText,
		        q.command_word AS commandWord, q.marks,
		        q.paper, q.series, q.year,
		        (SELECT COUNT(*) FROM question_rendering_overlays qro
		         WHERE qro.question_id = q.id
		           AND qro.needs_human_review = 0) AS overlayCount
		 FROM question_answer_chains qac
		 JOIN questions q ON q.id = qac.question_id
		 WHERE qac.answer_chain_id IN (__IDS__)
		   AND q.status = 'published'
		 ORDER BY qac.answer_chain_id, q.source_document_id, q.source_question_ref`,
			rootDir
		)
	);
}

/**
 * @param {string[]} questionIds
 * @param {string} sql
 * @param {string} rootDir
 * @returns {Promise<EvidenceRow[]>}
 */
async function fetchByQuestion(questionIds, sql, rootDir) {
	if (!questionIds.length) return [];
	return chunkedRows(questionIds, sql, rootDir);
}

/**
 * @param {string[]} ids
 * @param {string} sql
 * @param {string} rootDir
 * @returns {Promise<any[]>}
 */
async function chunkedRows(ids, sql, rootDir) {
	return (
		await Promise.all(
			chunk(ids, 80).map((group) =>
				d1Rows(sql.replace('__IDS__', group.map(() => '?').join(', ')), group, { rootDir })
			)
		)
	).flat();
}

/**
 * @param {ChainIllustrationCandidate} a
 * @param {ChainIllustrationCandidate} b
 */
function prioritySort(a, b) {
	const paperDifference =
		new Set(b.members.map((member) => member.sourceDocumentId)).size -
		new Set(a.members.map((member) => member.sourceDocumentId)).size;
	if (paperDifference) return paperDifference;
	if (b.members.length !== a.members.length) return b.members.length - a.members.length;
	return b.confidence - a.confidence || a.id.localeCompare(b.id);
}

/**
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => string} keyFor
 * @returns {Map<string, T[]>}
 */
function groupBy(rows, keyFor) {
	/** @type {Map<string, T[]>} */
	const groups = new Map();
	for (const row of rows) {
		const key = keyFor(row);
		const group = groups.get(key) ?? [];
		group.push(row);
		groups.set(key, group);
	}
	return groups;
}

/**
 * @template T
 * @param {T[]} values
 * @param {number} size
 * @returns {T[][]}
 */
function chunk(values, size) {
	/** @type {T[][]} */
	const result = [];
	for (let index = 0; index < values.length; index += size) {
		result.push(values.slice(index, index + size));
	}
	return result;
}

/** @param {unknown} value */
function jsonArray(value) {
	try {
		const parsed = JSON.parse(String(value ?? '[]'));
		return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
	} catch {
		return [];
	}
}
