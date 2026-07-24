import { describe, expect, it } from 'vitest';
import { shortRecallPromptFromRow } from './challengeShortRecall';

describe('challenge short recall D1 rows', () => {
	it('parses a valid D1 row into the public prompt contract', () => {
		expect(
			shortRecallPromptFromRow({
				challenge_id: 'chemistry-collision-rate',
				prompt_stem: 'Successful collisions exceed the ___.',
				canonical_answer: 'activation energy',
				accepted_aliases_json: '["energy threshold"]',
				spelling_variants_json: '["activtion energy"]',
				preferred_hidden_step_index: 2,
				content_version: 'short-recall-v1'
			})
		).toEqual({
			challengeId: 'chemistry-collision-rate',
			stem: 'Successful collisions exceed the ___.',
			canonicalAnswer: 'activation energy',
			acceptedAliases: ['energy threshold'],
			spellingVariants: ['activtion energy'],
			preferredHiddenStepIndex: 2,
			contentVersion: 'short-recall-v1'
		});
	});

	it('fails closed for malformed JSON or an invalid prompt', () => {
		expect(
			shortRecallPromptFromRow({
				challenge_id: 'broken',
				prompt_stem: 'No blank here.',
				canonical_answer: 'too many answer words',
				accepted_aliases_json: '[]',
				spelling_variants_json: 'not-json',
				preferred_hidden_step_index: -1,
				content_version: 'short-recall-v1'
			})
		).toBeNull();
	});
});
