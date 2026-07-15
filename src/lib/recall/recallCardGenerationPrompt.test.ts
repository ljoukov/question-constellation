import { describe, expect, it } from 'vitest';

import {
	RECALL_CARD_GENERATION_SYSTEM_PROMPT,
	RECALL_VISUAL_CUE_REVIEW_SYSTEM_PROMPT,
	approvedRecallVisualCuesBySubject,
	buildRecallCardGenerationPrompt,
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
		expect(prompt).toContain('replacement itself must pass the same semantic check');
		expect(prompt).toContain('<official_curriculum>');
		expect(prompt).toContain('The heart pumps blood around the body.');
		for (const cue of approvedRecallVisualCuesBySubject.Biology) expect(prompt).toContain(cue);
		expect(prompt).not.toContain('🧲');
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
		expect(reviewPrompt).toContain('helps eliminate even one distractor');
		expect(reviewPrompt).toContain('<candidate_card>');
		expect(reviewPrompt).toContain('Neutral fallback candidate: 📘');
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
