import { describe, expect, it } from 'vitest';

import {
	RECALL_CARD_GENERATION_SYSTEM_PROMPT,
	RECALL_FULL_REVIEW_SYSTEM_PROMPT,
	RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT,
	approvedRecallVisualCuesBySubject,
	buildRecallCardFullReviewPrompt,
	buildRecallCardGenerationPrompt,
	buildRecallCardVisualCueBatchReviewPrompt,
	buildRecallCardVisualCueReviewPrompt,
	validateGeneratedRecallCardVisualCue,
	validateGeneratedRecallCardVisualCueReview
} from '../../../scripts/lib/recall-card-generation-prompt.mjs';

describe('recall card generation prompt', () => {
	it('requires one non-answering visual cue grounded in official curriculum evidence', () => {
		const prompt = buildRecallCardGenerationPrompt({
			subject: 'Biology',
			topicId: 'biology-organisation',
			specRef: '4.2',
			officialCurriculumExcerpt: 'The heart pumps blood around the body.',
			count: 2
		});

		expect(RECALL_CARD_GENERATION_SYSTEM_PROMPT).toContain('visualCue');
		expect(prompt).toContain('exactly one familiar Unicode emoji');
		expect(prompt).toContain('decorative, not an answer hint');
		expect(prompt).toContain('Never encode the correct answer');
		expect(prompt).toContain('Only then choose visualCue');
		expect(prompt).toContain('make any distractor look impossible');
		expect(prompt).toContain('Neutral fallback candidate: 📘');
		expect(prompt).toContain('include at least one genuinely useful memoryTip');
		expect(prompt).toContain('use more than one safe visualCue');
		expect(prompt).toContain('Treat the neutral fallback as a last resort');
		expect(prompt).toContain('when diffusion is already named on the front, 💨');
		expect(prompt).toContain('replacement itself must pass the same semantic check');
		expect(prompt).toContain('choice:<choiceKey>:feedback');
		expect(prompt).toContain('choice:<choiceKey>:misconception');
		expect(prompt).toContain('Include front, back and explanation');
		expect(prompt).toContain('Include reverse whenever a reverse pair is present');
		expect(prompt).toContain('every learner-facing claim and correction independently auditable');
		expect(prompt).toContain('exact, self-contained, contiguous sourceExcerpt');
		expect(prompt).toContain('Return it on one line by collapsing line breaks');
		expect(prompt).toContain('Never reconstruct, tidy, or paraphrase an excerpt');
		expect(prompt).toContain(
			'sourceExcerpt must be one exact contiguous quote of 12–1400 characters'
		);
		expect(prompt).toContain('each choice text 180; feedback 220; misconception 160');
		expect(prompt).toContain('recall-card-bundle-v2 / recall-card-compiler-v9');
		expect(prompt).toContain('<official_curriculum>');
		expect(prompt).toContain('The heart pumps blood around the body.');
		expect(prompt).toContain('Generation mode: additive only');
		expect(prompt).toContain('Never reuse a reserved card id or subject-local conceptKey');
		expect(prompt).toContain('identity-preserving migration');
		expect(prompt).toContain('"reservedIds":[]');
		for (const cue of approvedRecallVisualCuesBySubject.Biology) expect(prompt).toContain(cue);
		expect(prompt).not.toContain('🧲');
	});

	it('includes the compiler-enforced existing identity snapshot', () => {
		const prompt = buildRecallCardGenerationPrompt({
			subject: 'Chemistry',
			topicId: 'atomic-structure',
			specRef: '4.1',
			officialCurriculumExcerpt: 'Atoms contain protons, neutrons and electrons.',
			count: 1,
			existingCardContext: {
				mode: 'additive',
				reservedIds: ['chem-existing-card'],
				reservedConceptKeys: ['existing-concept'],
				existingTargetCards: [
					{ id: 'chem-existing-card', front: 'Existing front?', back: 'Existing back.' }
				]
			}
		});

		expect(prompt).toContain('chem-existing-card');
		expect(prompt).toContain('existing-concept');
		expect(prompt).toContain('Existing front?');
	});

	it('gives the independent full reviewer the existing target cards for semantic duplicate checks', () => {
		const prompt = buildRecallCardFullReviewPrompt({
			cards: [{ id: 'chem-new-card', front: 'New question?', back: 'New answer.' }],
			evidence: { pageText: 'Official evidence.' },
			targets: [{ offeringId: 'combined-chemistry-higher' }],
			existingCardContext: {
				mode: 'additive',
				existingTargetCards: [
					{
						id: 'chem-existing-card',
						front: 'Existing wording?',
						back: 'Existing answer.'
					}
				]
			}
		});

		expect(RECALL_FULL_REVIEW_SYSTEM_PROMPT).toContain(
			'reject a candidate that tests the same retrieval task or concept'
		);
		expect(RECALL_FULL_REVIEW_SYSTEM_PROMPT).toContain('name the existing card id in issues');
		expect(prompt).toContain('<existing_target_cards>');
		expect(prompt).toContain('chem-existing-card');
	});

	it('validates generated cues against the matching subject contract', () => {
		expect(
			validateGeneratedRecallCardVisualCue({ subject: 'Biology', visualCue: '🫀' }, 'Biology')
		).toBe(true);
		expect(
			validateGeneratedRecallCardVisualCue({ subject: 'Physics', visualCue: '⚙️' }, 'Biology')
		).toBe(false);
		expect(
			validateGeneratedRecallCardVisualCue({ subject: 'Physics', visualCue: '🫀' }, 'Physics')
		).toBe(false);
		expect(
			validateGeneratedRecallCardVisualCue({ subject: 'Biology', visualCue: '✅' }, 'Biology')
		).toBe(false);
		expect(
			validateGeneratedRecallCardVisualCue({ subject: 'Biology', visualCue: '🫀🩸' }, 'Biology')
		).toBe(false);
		expect(validateGeneratedRecallCardVisualCue({ visualCue: '🫀' }, 'Biology')).toBe(false);
	});

	it('requires an independent semantic cue review after generation', () => {
		const card = {
			subject: 'Physics',
			visualCue: '⚙️',
			front: 'What is the density equation?',
			back: 'ρ = m / V',
			distractors: ['P = E / t', 'F = ke', 'a = Δv / t']
		};
		const reviewPrompt = buildRecallCardVisualCueReviewPrompt(card, 'Physics');

		expect(RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT).toContain('independent safety reviewer');
		expect(RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT).toContain(
			'Never propose a cue merely because it is related to the hidden answer'
		);
		expect(RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT).toContain(
			'the neutral fallback is correct and must be accepted'
		);
		expect(reviewPrompt).toContain('helps eliminate even one distractor');
		expect(reviewPrompt).toContain('<candidate_card>');
		expect(reviewPrompt).toContain('Neutral fallback candidate: 📘');
		expect(reviewPrompt).toContain('exactly these fields:');
		expect(
			validateGeneratedRecallCardVisualCueReview(
				card,
				{
					accepted: true,
					reason: 'The cue only identifies the broad subject.',
					replacementCue: '⚙️'
				},
				'Physics'
			)
		).toBe(true);
		expect(
			validateGeneratedRecallCardVisualCueReview(
				card,
				{
					accepted: false,
					reason: 'The cue reveals the tested quantity.',
					replacementCue: '📘'
				},
				'Physics'
			)
		).toBe(false);
		expect(
			validateGeneratedRecallCardVisualCueReview(
				card,
				{
					accepted: true,
					reason: 'Looks suitable.',
					replacementCue: '🔌'
				},
				'Physics'
			)
		).toBe(false);
		expect(() => buildRecallCardVisualCueReviewPrompt(card, 'Biology')).toThrow(
			'does not match the import job subject'
		);
	});

	it('uses distinct, non-contradictory response contracts for single and batch cue review', () => {
		const card = {
			id: 'phys-density-equation',
			subject: 'Physics',
			visualCue: '⚙️',
			front: 'What is the density equation?',
			back: 'ρ = m / V',
			choices: [
				{ text: 'ρ = m / V' },
				{ text: 'P = E / t' },
				{ text: 'F = ke' },
				{ text: 'a = Δv / t' }
			]
		};
		const batchPrompt = buildRecallCardVisualCueBatchReviewPrompt([card], 'Physics');
		expect(RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT).not.toContain('exactly these fields');
		expect(batchPrompt).toContain('Return JSON only with a reviews array');
		expect(batchPrompt).not.toContain('Return JSON only with exactly these fields');
	});

	it('rejects unsupported subjects before producing a generation prompt', () => {
		expect(() =>
			buildRecallCardGenerationPrompt({
				subject: 'Computer Science',
				topicId: 'networks',
				specRef: '1.1',
				officialCurriculumExcerpt: 'Networks transfer data.',
				count: 1
			})
		).toThrow('subject must be Biology, Chemistry or Physics');
		expect(() =>
			buildRecallCardGenerationPrompt({
				subject: 'constructor',
				topicId: 'prototype',
				specRef: '1.1',
				officialCurriculumExcerpt: 'Prototype names are not subjects.',
				count: 1
			})
		).toThrow('subject must be Biology, Chemistry or Physics');
	});
});
