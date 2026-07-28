import { createHash } from 'node:crypto';

/**
 * @typedef {object} ChainStep
 * @property {string} id
 * @property {string | undefined} [chainId]
 * @property {number} displayOrder
 * @property {string} stepText
 * @property {string} stepRole
 * @property {string | null | undefined} [explanation]
 * @property {string | null | undefined} [commonOmission]
 */

/**
 * @typedef {object} MarkSchemeItem
 * @property {string} id
 * @property {number} displayOrder
 * @property {string} itemType
 * @property {string} text
 * @property {number | null} marks
 * @property {number} confidence
 */

/**
 * @typedef {object} ChecklistItem
 * @property {string} id
 * @property {number} displayOrder
 * @property {string} text
 * @property {boolean} required
 * @property {number} confidence
 * @property {number} needsHumanReview
 * @property {string[]} markSchemeItemIds
 */

/**
 * @typedef {object} ModelAnswer
 * @property {string} id
 * @property {string} answerText
 * @property {string | null | undefined} [derivation]
 * @property {number} confidence
 * @property {number} needsHumanReview
 * @property {string[]} supportingMarkSchemeItemIds
 */

/**
 * @typedef {object} ChainMember
 * @property {string | undefined} [chainId]
 * @property {string} questionId
 * @property {string | undefined} [questionStatus]
 * @property {number | undefined} [questionNeedsReview]
 * @property {number | undefined} [membershipNeedsReview]
 * @property {number | undefined} [extractionConfidence]
 * @property {string} sourceDocumentId
 * @property {string} sourceQuestionRef
 * @property {string} promptText
 * @property {string | null | undefined} [selfContainedPromptText]
 * @property {string | null | undefined} [commandWord]
 * @property {number} marks
 * @property {number} fitConfidence
 * @property {string | null | undefined} [paper]
 * @property {string | null | undefined} [series]
 * @property {number | null | undefined} [year]
 * @property {number | undefined} [overlayCount]
 * @property {MarkSchemeItem[]} markSchemeItems
 * @property {ChecklistItem[]} checklistItems
 * @property {ModelAnswer[]} modelAnswers
 */

/**
 * @typedef {object} ChainIllustrationCandidate
 * @property {string} id
 * @property {string | null | undefined} [slug]
 * @property {string | null | undefined} [title]
 * @property {string} canonicalChainText
 * @property {string | null | undefined} [summary]
 * @property {string} subjectArea
 * @property {string | null | undefined} [broadTopic]
 * @property {number} confidence
 * @property {string | null | undefined} [updatedAt]
 * @property {ChainStep[]} steps
 * @property {ChainMember[]} members
 */

/**
 * Return the normalized evidence projection used by D1 answer-chain
 * illustration freshness records and the guarded Physics identity repair.
 *
 * @param {ChainIllustrationCandidate} candidate
 */
export function normalizedSourceFingerprintInput(candidate) {
	return {
		chain: {
			id: candidate.id,
			slug: candidate.slug,
			title: candidate.title,
			canonicalChainText: candidate.canonicalChainText,
			summary: candidate.summary,
			subjectArea: candidate.subjectArea,
			broadTopic: candidate.broadTopic,
			confidence: candidate.confidence,
			updatedAt: candidate.updatedAt
		},
		steps: candidate.steps.map((step) => ({
			id: step.id,
			chainId: step.chainId,
			displayOrder: step.displayOrder,
			stepText: step.stepText,
			stepRole: step.stepRole,
			explanation: step.explanation,
			commonOmission: step.commonOmission
		})),
		members: candidate.members.map((member) => ({
			chainId: member.chainId,
			questionId: member.questionId,
			questionStatus: member.questionStatus,
			questionNeedsReview: member.questionNeedsReview,
			membershipNeedsReview: member.membershipNeedsReview,
			extractionConfidence: member.extractionConfidence,
			sourceDocumentId: member.sourceDocumentId,
			sourceQuestionRef: member.sourceQuestionRef,
			promptText: member.promptText,
			selfContainedPromptText: member.selfContainedPromptText,
			commandWord: member.commandWord,
			marks: member.marks,
			fitConfidence: member.fitConfidence,
			paper: member.paper,
			series: member.series,
			year: member.year,
			overlayCount: member.overlayCount,
			markSchemeItems: member.markSchemeItems.map((item) => ({
				id: item.id,
				displayOrder: item.displayOrder,
				itemType: item.itemType,
				text: item.text,
				marks: item.marks,
				confidence: item.confidence
			})),
			checklistItems: member.checklistItems.map((item) => ({
				id: item.id,
				displayOrder: item.displayOrder,
				text: item.text,
				required: item.required,
				confidence: item.confidence,
				needsHumanReview: item.needsHumanReview,
				markSchemeItemIds: item.markSchemeItemIds
			})),
			modelAnswers: member.modelAnswers.map((answer) => ({
				id: answer.id,
				answerText: answer.answerText,
				derivation: answer.derivation,
				confidence: answer.confidence,
				needsHumanReview: answer.needsHumanReview,
				supportingMarkSchemeItemIds: answer.supportingMarkSchemeItemIds
			}))
		}))
	};
}

/** @param {unknown} source */
export function sourceFingerprintFromInput(source) {
	return sha256(stableStringify(source));
}

/** @param {ChainIllustrationCandidate} candidate */
export function sourceFingerprint(candidate) {
	return sourceFingerprintFromInput(normalizedSourceFingerprintInput(candidate));
}

/** @param {string} value */
export function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value */
export function stableStringify(value) {
	return /** @type {string} */ (JSON.stringify(sortValue(value)));
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
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
