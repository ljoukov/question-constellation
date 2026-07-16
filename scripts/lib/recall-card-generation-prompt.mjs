import {
	approvedRecallVisualCues,
	approvedRecallVisualCuesBySubject,
	isApprovedRecallVisualCueForSubject
} from '../../src/lib/recall/visualCues.js';
import {
	RECALL_BUNDLE_SCHEMA_VERSION,
	RECALL_CARD_KINDS,
	RECALL_PROMPT_VERSION,
	RECALL_REVIEW_CHECKS
} from './recall-card-bundle.mjs';

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
- A familiar conventional association is allowed when it represents a term or context already explicit in the front and adds no hidden answer content. For example, when diffusion is already named on the front, 💨 can mark that named topic without revealing its definition or direction.
- Treat the neutral fallback as a last resort. Test the strongest safe topical cue first, and across a multi-card batch use distinct landmarks where the fronts expose different contexts. Never force variety if it would reveal an answer.

Write the complete question, answer and distractors first. Only then choose visualCue. Audit it against all of that text as if the cue were visible before the choices:
1. Does it depict or name a noun, apparatus, measurement, quantity, result, property, relationship or process that appears in the answer but is not already explicit in the question?
2. Does it make any distractor look impossible or make the correct option easier to select?
If either answer might be yes, reject that cue and try the neutral fallback. The replacement itself must pass the same semantic check; never assume any fallback is automatically safe. Do not rely on the card kind or topic name alone.
`.trim();

export const RECALL_CARD_GENERATION_SYSTEM_PROMPT = `
You compile concise GCSE science recall cards from one supplied extract of an official exam-board specification. The card must be useful for both unaided recall and four-choice recognition.

Evidence and scope:
- Use only scientific claims directly supported by the supplied official PDF page text, including every choice's feedback and misconception correction.
- Test one precise examinable concept per card. Do not combine loosely related facts.
- Copy one exact, self-contained, contiguous sourceExcerpt from the supplied page text. Preserve every word and symbol. Return it on one line by collapsing line breaks, tabs, and repeated spaces to single spaces; no other editing is allowed.
- PDF text can contain column labels or split equation typography. Never reconstruct, tidy, or paraphrase an excerpt. Use a shorter contiguous passage that still supports every claim, or choose a different concept.
- The front, exact answer, explanation, reverse form and any memory tip must be supportable from that quote.
- Do not invent source IDs, pages, curriculum mappings, provenance, revisions or hashes. The compiler adds those deterministically.

Learner-facing writing:
- front: a direct standalone question, normally no more than 18 words. Never mention buttons, choices or selecting an answer.
- back: the exact compact answer, normally no more than 22 words. It is also the text of the one correct choice.
- explanation: one short sentence that adds the useful why, relationship or distinction; do not merely repeat back.
- memoryTip: prefer a brief second encoding when the source supports one: a sequence with arrows, a compact contrast, or an imageable restatement. It may compress the same relationship, but must add a different retrieval route rather than repeat the back as prose. Use null only when no honest extra encoding is available.
- reverseFront and reverseBack: both null unless reversing the card creates a distinct, unambiguous retrieval task. Never make a tautological reverse.
- Hard character limits, including spaces: front 140; back 180; explanation 360; memoryTip 180; reverseFront 140; reverseBack 180. Prefer substantially shorter text.

Recognition choices:
- Supply exactly four unique choices: the exact back plus three plausible diagnostic distractors.
- Each distractor must represent a different likely misconception, not random nonsense or a grammar/length giveaway.
- Every choice needs concise feedback. Explain the relevant distinction without labels such as "correct answer" or repetitive praise.
- The correct choice has misconception null. Every distractor names its specific misconception.
- Keep choices parallel in grammar, specificity and approximate length where the science permits.
- Hard character limits, including spaces: each choice text 180; feedback 220; misconception 160.

Use a stable kebab-case id prefixed bio-, chem- or phys-, and a stable subject-local conceptKey. Supported card kinds: ${RECALL_CARD_KINDS.join(', ')}.

${RECALL_VISUAL_CUE_PROMPT}

Return JSON only with a top-level cards array. Every card must contain exactly:
id, conceptKey, kind, visualCue, front, back, reverseFront, reverseBack, explanation, memoryTip, choices, evidence.
Each choice contains choiceKey, text, isCorrect, feedback and misconception.
Evidence contains sourceExcerpt and supports. sourceExcerpt must be one exact contiguous quote of 12–1400 characters; use the shortest passage that supports every claim and never copy the whole page by default. Include front, back and explanation, plus choice:<choiceKey>:feedback for all four choices and choice:<choiceKey>:misconception for each distractor. Include reverse whenever a reverse pair is present, and memoryTip whenever a tip is present. This makes every learner-facing claim and correction independently auditable.
`.trim();

export const RECALL_FULL_REVIEW_SYSTEM_PROMPT = `
You are an independent GCSE science recall-card reviewer. You did not generate the candidates. Review each complete card against the supplied official PDF text and deterministic curriculum mapping. Do not rewrite or silently repair a card.

Accept a card only when every check below is true:
${RECALL_REVIEW_CHECKS.map((check) => `- ${check}`).join('\n')}

Interpret the checks strictly:
- one compact examinable concept, suitable for low-mark retrieval practice;
- this is an additive run: compare each candidate with every supplied existing target card and reject a candidate that tests the same retrieval task or concept, even when its wording, context or answer phrasing is changed; shared broad topic alone is not a duplicate;
- every positive scientific claim, including every choice's feedback and misconception correction, is supported by the exact source quote and page text;
- the back is precise enough for an exam-board answer and exactly matches one choice;
- the other three choices are plausible, mutually distinct misconceptions with no obvious length or grammar clue;
- feedback is concise, choice-specific and explanatory rather than repetitive;
- the front, answer, choices and explanation are comfortable to scan on a phone;
- a reverse pair is present only when distinct and unambiguous;
- a memory tip is absent unless it adds an evidence-grounded retrieval connection;
- the supplied component, topic and offering targets genuinely cover the concept.

When a candidate is a semantic duplicate, set accepted false and name the existing card id in issues. Do not approve a light paraphrase as a new additive card.

Return JSON only with one review per candidate and no unknown card IDs. Each review contains cardId, accepted, reason, checks and issues. checks must contain exactly the named checks above. accepted may be true only when every check is true and issues is empty. Give concise auditable reasons, not private reasoning traces.
`.trim();

export const RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT = `
You are the independent safety reviewer for a generated GCSE science recall card. Review only its visualCue after the full card has been written.

Assume the learner sees the cue before answering. Reject it if it supplies any correct-answer content not already explicit in the front, helps select the answer, or helps eliminate even one distractor. Matching the topic is not enough.

The cue should still be a meaningful rapid landmark, because its purpose is to pair verbal recall with a distinct visual route. A familiar conventional association is allowed when it represents a scientific term or context already explicit in the front and adds no hidden answer content; it need not be a literal anatomical or apparatus drawing. For example, when diffusion is already named on the front, 💨 can safely mark that named topic without revealing its definition or direction.

Never propose a cue merely because it is related to the hidden answer. The cue must represent information already visible on the front and remain neutral across every choice.

Treat the neutral fallback as a last resort. Before accepting it, name and test the strongest subject-approved topical alternative against every choice. Across a batch, do not accept the same neutral cue for every card merely because the cards share a topic: use distinct safe landmarks where their fronts expose different contexts. If every topical cue would add answer information absent from the front, the neutral fallback is correct and must be accepted. Apply the same pre-answer test to every replacement.
`.trim();

/**
 * Build the reusable prompt for the curriculum-grounded recall compiler.
 * Curated fallback cards and generated cards share one visual-cue contract.
 *
 * @param {{
 *   subject: string;
 *   topicId: string;
 *   specRef: string;
 *   officialCurriculumExcerpt: string;
 *   count: number;
 *   source?: unknown;
 *   curriculumTargets?: unknown[];
 *   existingCardContext?: {
 *     mode: 'additive';
 *     reservedIds: string[];
 *     reservedConceptKeys: string[];
 *     existingTargetCards: unknown[];
 *   };
 * }} input
 */
export function buildRecallCardGenerationPrompt({
	subject,
	topicId,
	specRef,
	officialCurriculumExcerpt,
	count,
	source = null,
	curriculumTargets = [],
	existingCardContext = {
		mode: 'additive',
		reservedIds: [],
		reservedConceptKeys: [],
		existingTargetCards: []
	}
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
	if (
		existingCardContext?.mode !== 'additive' ||
		!Array.isArray(existingCardContext.reservedIds) ||
		!Array.isArray(existingCardContext.reservedConceptKeys) ||
		!Array.isArray(existingCardContext.existingTargetCards)
	) {
		throw new Error('Recall generation requires a valid additive identity context.');
	}

	return `${RECALL_CARD_GENERATION_SYSTEM_PROMPT}

Compiler contract: ${RECALL_BUNDLE_SCHEMA_VERSION} / ${RECALL_PROMPT_VERSION}

Approved ${subject} cues: ${cueContract.cues.join(' ')}
Neutral fallback candidate: ${cueContract.fallback}

Generate ${count} card${count === 1 ? '' : 's'}.
Batch encoding expectation: where the supplied evidence permits, include at least one genuinely useful memoryTip and use more than one safe visualCue across a multi-card batch. Never force either by adding unsupported science or answer hints.
Generation mode: additive only. Create genuinely new cards; this is not a refresh or rewrite workflow.
- Never reuse a reserved card id or subject-local conceptKey.
- Never duplicate or lightly rephrase an existing card for this target.
- If the requested evidence is already covered, choose a distinct supported concept. Do not rename an existing identity to evade these rules.
- Updating or replacing an existing card requires a separate identity-preserving migration, not this compiler.
Subject: ${subject}
Topic ID: ${topicId}
Specification reference: ${specRef}
Official source metadata (compiler-owned; do not copy IDs into cards):
${JSON.stringify(source)}
Reviewed curriculum targets (compiler-owned; use only to judge scope):
${JSON.stringify(curriculumTargets)}
Reserved identity and target-card snapshot (compiler-enforced after generation):
${JSON.stringify(existingCardContext)}

Official curriculum PDF page text. sourceExcerpt must be copied exactly from here:
<official_curriculum>
${officialCurriculumExcerpt}
</official_curriculum>`;
}

/**
 * @param {{
 *   cards:unknown[];
 *   evidence:unknown;
 *   targets:unknown[];
 *   existingCardContext:{mode:'additive',existingTargetCards:unknown[]};
 * }} input
 */
export function buildRecallCardFullReviewPrompt({ cards, evidence, targets, existingCardContext }) {
	if (!Array.isArray(cards) || cards.length === 0) {
		throw new Error('Full review requires at least one complete recall card.');
	}
	if (!evidence || typeof evidence !== 'object') {
		throw new Error('Full review requires official curriculum evidence.');
	}
	if (
		existingCardContext?.mode !== 'additive' ||
		!Array.isArray(existingCardContext.existingTargetCards)
	) {
		throw new Error('Full review requires the additive existing-card snapshot.');
	}
	return `${RECALL_FULL_REVIEW_SYSTEM_PROMPT}

<official_evidence>
${JSON.stringify(evidence)}
</official_evidence>

<reviewed_curriculum_targets>
${JSON.stringify(targets)}
</reviewed_curriculum_targets>

<existing_target_cards>
${JSON.stringify(existingCardContext.existingTargetCards)}
</existing_target_cards>

<candidate_cards>
${JSON.stringify(cards)}
</candidate_cards>`;
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

Return JSON only with exactly these fields:
accepted: boolean
reason: one concise sentence
replacementCue: the original cue when accepted, otherwise one subject-approved replacement candidate that must be reviewed again after it is applied

Subject-approved cues: ${cues.join(' ')}
Neutral fallback candidate: ${fallback}

<candidate_card>
${JSON.stringify(card)}
</candidate_card>`;
}

/**
 * Review a batch in one independent turn while retaining the exact full-card
 * semantic test used by the single-card compatibility helper above.
 *
 * @param {unknown[]} cards
 * @param {unknown} expectedSubject
 */
export function buildRecallCardVisualCueBatchReviewPrompt(cards, expectedSubject) {
	if (!Array.isArray(cards) || cards.length === 0) {
		throw new Error('Cue review requires at least one complete recall card.');
	}
	const { cues, fallback } = subjectCueContract(expectedSubject);
	for (const card of cards) {
		if (!card || typeof card !== 'object') {
			throw new Error('Generated card subject does not match the cue-review subject.');
		}
		const candidate = /** @type {Record<string, unknown>} */ (card);
		if (candidate.subject !== expectedSubject) {
			throw new Error('Generated card subject does not match the cue-review subject.');
		}
		if (!candidate.front || !candidate.back || !Array.isArray(candidate.choices)) {
			throw new Error('Cue review requires each complete card and its four choices.');
		}
	}
	return `${RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT}

Return JSON only with a reviews array. Include exactly one item per card with:
cardId, accepted, reason, replacementCue.
When accepted, replacementCue must equal the existing visualCue. When rejected, replacementCue is one subject-approved candidate; it is not accepted until a new independent review checks the complete updated card.

Subject-approved cues: ${cues.join(' ')}
Neutral fallback candidate: ${fallback}

<candidate_cards>
${JSON.stringify(cards)}
</candidate_cards>`;
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
