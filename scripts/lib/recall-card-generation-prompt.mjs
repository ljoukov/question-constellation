import {
	approvedRecallVisualCues,
	approvedRecallVisualCuesBySubject,
	isApprovedRecallVisualCueForSubject
} from '../../src/lib/recall/visualCues.js';

const neutralFallbackCueBySubject = Object.freeze({
	Biology: '📘',
	Chemistry: '📘',
	Physics: '📘'
});

/** @param {unknown} subject */
function subjectCueContract(subject) {
	if (typeof subject !== 'string' || !Object.hasOwn(approvedRecallVisualCuesBySubject, subject)) {
		throw new Error('Recall generation subject must be Biology, Chemistry or Physics.');
	}
	const typedSubject = /** @type {keyof typeof approvedRecallVisualCuesBySubject} */ (subject);
	return {
		cues: approvedRecallVisualCuesBySubject[typedSubject],
		fallback: neutralFallbackCueBySubject[typedSubject]
	};
}

export const RECALL_VISUAL_CUE_PROMPT = `
For every card, output a visualCue field containing exactly one familiar Unicode emoji from the approved list below.

The cue is a quick visual landmark for the scientific context. It is decorative, not an answer hint.
- Prefer a literal object or broad topic already explicit in the question. Example: a question explicitly about the heart may use 🫀.
- Never encode the correct answer, formula, result, trend, unit, process step, or a clue that eliminates a distractor.
- If a specific emoji would help solve the question, move up to a broader topic cue.
- Use exactly one approved grapheme: no emoji pairs, words, numbers, flags, skin tones, jokes, metaphors, or correctness symbols such as ✅, ❌ or ❓.
- The cue must be recognisable to a UK student aged 14–16 without explanation.

Write the complete question, answer and distractors first. Only then choose visualCue. Audit it against all of that text as if the cue were visible before the choices:
1. Does it depict or name a noun, apparatus, measurement, quantity, result, property, relationship or process that appears in the answer but is not already explicit in the question?
2. Does it make any distractor look impossible or make the correct option easier to select?
If either answer might be yes, reject that cue and try the neutral fallback. The replacement itself must pass the same semantic check; never assume any fallback is automatically safe. Do not rely on the card kind or topic name alone.
`.trim();

export const RECALL_CARD_GENERATION_SYSTEM_PROMPT = `
You create concise GCSE science recall cards grounded only in the supplied official exam-board curriculum extract.

Each card must test one precise, examinable idea. Write a direct question, a compact correct answer, three plausible distractors that diagnose distinct misconceptions, and a short explanation. Do not introduce knowledge absent from the supplied curriculum evidence.

${RECALL_VISUAL_CUE_PROMPT}

Return JSON only. Every card must contain:
id, subject, topicId, specRef, kind, visualCue, front, back, distractors, explanation.
`.trim();

export const RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT = `
You are the independent safety reviewer for a generated GCSE science recall card. Review only its visualCue after the full card has been written.

Assume the learner sees the cue before answering. Reject it if it supplies any correct-answer content not already explicit in the front, helps select the answer, or helps eliminate even one distractor. Matching the topic is not enough. If uncertain, reject it and propose the neutral fallback, but apply the same semantic test to that replacement too.

Return JSON only with exactly these fields:
accepted: boolean
reason: one concise sentence
replacementCue: the original cue when accepted, otherwise one subject-approved replacement candidate that must be reviewed again after it is applied
`.trim();

/**
 * Build the reusable prompt for a future curriculum-grounded recall import.
 * The current deck remains curated source data; this function prevents a
 * later importer from inventing a second visual-cue contract.
 *
 * @param {{
 *   subject: string;
 *   topicId: string;
 *   specRef: string;
 *   officialCurriculumExcerpt: string;
 *   count: number;
 * }} input
 */
export function buildRecallCardGenerationPrompt({
	subject,
	topicId,
	specRef,
	officialCurriculumExcerpt,
	count
}) {
	if (!subject || !topicId || !specRef || !officialCurriculumExcerpt) {
		throw new Error(
			'Recall generation requires subject, topicId, specRef and curriculum evidence.'
		);
	}
	if (!Number.isInteger(count) || count < 1 || count > 20) {
		throw new Error('Recall generation count must be an integer from 1 to 20.');
	}
	const cueContract = subjectCueContract(subject);

	return `${RECALL_CARD_GENERATION_SYSTEM_PROMPT}

Approved ${subject} cues: ${cueContract.cues.join(' ')}
Neutral fallback candidate: ${cueContract.fallback}

Generate ${count} card${count === 1 ? '' : 's'}.
Subject: ${subject}
Topic ID: ${topicId}
Specification reference: ${specRef}

Official curriculum evidence:
<official_curriculum>
${officialCurriculumExcerpt}
</official_curriculum>`;
}

/**
 * Build a separate review request so cue safety is not accepted solely on the
 * generating model's self-check.
 *
 * @param {{
 *   subject: string;
 *   visualCue: string;
 *   front: string;
 *   back: string;
 *   distractors?: string[];
 * }} card
 * @param {unknown} expectedSubject
 */
export function buildRecallCardVisualCueReviewPrompt(card, expectedSubject) {
	if (!card || typeof card !== 'object') throw new Error('A complete recall card is required.');
	const { cues, fallback } = subjectCueContract(expectedSubject);
	if (card.subject !== expectedSubject) {
		throw new Error('Generated card subject does not match the import job subject.');
	}
	if (!card.front || !card.back || !Array.isArray(card.distractors)) {
		throw new Error('Cue review requires front, back and distractors.');
	}

	return `${RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT}

Subject-approved cues: ${cues.join(' ')}
Neutral fallback candidate: ${fallback}

<candidate_card>
${JSON.stringify(card)}
</candidate_card>`;
}

/** @param {unknown} card @param {unknown} expectedSubject */
export function validateGeneratedRecallCardVisualCue(card, expectedSubject) {
	if (!card || typeof card !== 'object' || !('visualCue' in card) || !('subject' in card)) {
		return false;
	}
	return (
		card.subject === expectedSubject &&
		isApprovedRecallVisualCueForSubject(card.visualCue, expectedSubject)
	);
}

/** @param {unknown} card @param {unknown} review @param {unknown} expectedSubject */
export function validateGeneratedRecallCardVisualCueReview(card, review, expectedSubject) {
	if (
		!validateGeneratedRecallCardVisualCue(card, expectedSubject) ||
		!review ||
		typeof review !== 'object'
	) {
		return false;
	}
	if (!('accepted' in review) || review.accepted !== true) return false;
	if (!('reason' in review) || typeof review.reason !== 'string' || !review.reason.trim())
		return false;
	if (!('replacementCue' in review) || !card || typeof card !== 'object') return false;
	return (
		'replacementCue' in review && 'visualCue' in card && review.replacementCue === card.visualCue
	);
}

export { approvedRecallVisualCues, approvedRecallVisualCuesBySubject };
