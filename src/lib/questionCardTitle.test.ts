import { describe, expect, it } from 'vitest';
import {
	deriveQuestionCardTitle,
	questionCardTitleIssues,
	QUESTION_CARD_TITLE_CONTRACT
} from './questionCardTitle.js';

describe('question card titles', () => {
	it('turns the vaccine command into a concise process title', () => {
		expect(
			deriveQuestionCardTitle({
				promptText: 'Describe how a vaccine would work to prevent gonorrhoea.\n[4 marks]'
			})
		).toBe('Vaccine protection against gonorrhoea');
	});

	it('finds the atomic command after same-line source context', () => {
		expect(
			deriveQuestionCardTitle({
				cardTitle: 'Describe gonorrhoea vaccine action',
				selfContainedPromptText:
					'Gonorrhoea is a bacterial disease. A new vaccine is being developed against gonorrhoea. Describe how a vaccine would work to prevent gonorrhoea.',
				promptText:
					'Gonorrhoea is a bacterial disease. A new vaccine is being developed against gonorrhoea. Describe how a vaccine would work to prevent gonorrhoea.'
			})
		).toBe('Vaccine protection against gonorrhoea');
	});

	it('keeps the useful subject after removing an exam command word', () => {
		expect(
			deriveQuestionCardTitle({
				promptText: 'Explain why other metals are added to aluminium.\n[4 marks]'
			})
		).toBe('Adding other metals to aluminium');
	});

	it('names a separation process instead of truncating the exam command', () => {
		expect(
			deriveQuestionCardTitle({
				promptText:
					'Describe how crude oil is separated into fractions by fractional distillation.\n[4 marks]'
			})
		).toBe('Crude oil: fractional distillation');
	});

	it('keeps a complete visual process title for an electromagnet question', () => {
		expect(
			deriveQuestionCardTitle({
				promptText: 'Explain how this electromagnet is able to pick up and move the blocks.'
			})
		).toBe('Electromagnet lifting and moving the blocks');
	});

	it('turns comparative and causal command sentences into concept labels', () => {
		expect(
			deriveQuestionCardTitle({
				cardTitle: 'Why steel is harder than iron',
				promptText: 'Explain why steel is harder than iron. [3 marks]'
			})
		).toBe('Steel and iron hardness');
		expect(
			deriveQuestionCardTitle({
				cardTitle: 'Plants infected with tobacco mosaic virus grow slowly',
				promptText: 'Explain why plants infected with tobacco mosaic virus grow slowly. [3 marks]'
			})
		).toBe('Tobacco mosaic virus and plant growth');
		expect(
			deriveQuestionCardTitle({
				cardTitle: 'Using step-up transformers makes the network efficient',
				promptText: 'Explain how using step-up transformers makes the network efficient.'
			})
		).toBe('Step-up transformers and network efficiency');
	});

	it('prefers the scientific subject over a low-information tick-box instruction', () => {
		expect(
			deriveQuestionCardTitle({
				promptText:
					'Which of the following is also a renewable energy resource?\n\nTick (✓) **one** box.'
			})
		).toBe('Renewable energy resource');
	});

	it('names the inheritance method when a probability question supplies a Punnett square', () => {
		expect(
			deriveQuestionCardTitle({
				promptText:
					'Determine the probability that the child will have polydactyly.\nYou should complete the Punnett square diagram.'
			})
		).toBe('Punnett square inheritance probability');
	});

	it('turns a one-place instruction into a complete location label', () => {
		expect(
			deriveQuestionCardTitle({
				promptText: 'Give one place in a plant where stem cells are found.\n[1 mark]'
			})
		).toBe('Location of stem cells in plant');
	});

	it('reconstructs a wrapped question before naming its concept', () => {
		expect(
			deriveQuestionCardTitle({
				promptText:
					'A solution was diluted until its pH increased by 1.\nWhat was the hydrogen ion concentration after water had\nbeen added?\n[1 mark]'
			})
		).toBe('Concentration changes on the pH scale');
	});

	it('names equation and calculation methods rather than answer fields', () => {
		expect(
			deriveQuestionCardTitle({
				promptText:
					'Write down the equation that links acceleration ($a$), mass ($m$) and resultant force ($F$).'
			})
		).toBe('Acceleration, mass and resultant force equation');
		expect(
			deriveQuestionCardTitle({
				promptText:
					'A blue colour moved 4.77 cm and the solvent moved 5.30 cm. Calculate the Rf value for the blue colour. [2 marks]'
			})
		).toBe('Chromatography Rf value calculation');
	});

	it('normalizes definitions and paired instructions into concepts', () => {
		expect(
			deriveQuestionCardTitle({ promptText: 'Define the term ‘heterozygous’.\n[1 mark]' })
		).toBe('Meaning of heterozygous');
		expect(
			deriveQuestionCardTitle({
				promptText:
					'C2H4 is an alkene. What is the test for alkenes? Give the result if an alkene is present. [2 marks]'
			})
		).toBe('Testing for an alkene');
	});

	it('names a History interpretation method and its subject', () => {
		expect(
			deriveQuestionCardTitle({
				promptText:
					'How does Interpretation B differ from Interpretation A about the appeal of Hitler? Explain your answer based on what it says in Interpretations A and B.',
				fallback: 'Content Difference'
			})
		).toBe("Comparing interpretations of Hitler's appeal");
	});

	it('uses self-contained given context when the printed task is pronoun-dependent', () => {
		expect(
			deriveQuestionCardTitle({
				promptText: 'Explain why the students thought their hypothesis would be correct. [3 marks]',
				selfContainedPromptText:
					'Many biotic and abiotic factors affect plant growth. Explain why the students thought their hypothesis would be correct. [3 marks]'
			})
		).toBe('Plant growth hypothesis');
	});

	it('rejects a word-limit slice of the source prompt', () => {
		expect(
			questionCardTitleIssues('One place in a plant where stem cells are', {
				promptText: 'Give one place in a plant where stem cells are found.'
			})
		).toContain('truncated_prompt_fragment');
	});

	it('replaces an answer-revealing outcome that is absent from the prompt', () => {
		const answerText =
			'Other metal atoms distort the layers so they cannot slide. This makes the alloy harder and stronger.';
		expect(
			questionCardTitleIssues('Why alloying makes aluminium harder', {
				promptText: 'Explain why other metals are added to aluminium.',
				answerText
			})
		).toContain('reveals_answer_outcome');
		expect(
			deriveQuestionCardTitle({
				cardTitle: 'Why alloying makes aluminium harder',
				promptText: 'Explain why other metals are added to aluminium.',
				answerText
			})
		).toBe('Adding other metals to aluminium');
	});

	it('allows an outcome already stated in the question', () => {
		expect(
			questionCardTitleIssues('Why aluminium alloys are harder', {
				promptText: 'Aluminium alloys are harder than pure aluminium. Explain why.',
				answerText: 'Different-sized atoms stop the layers sliding, so the alloy is harder.'
			})
		).not.toContain('reveals_answer_outcome');
	});

	it('rejects copied, command-led, oversized titles', () => {
		const title =
			'Describe how a vaccine would work to prevent gonorrhoea and then discuss salmonella food poisoning';
		expect(questionCardTitleIssues(title, { promptText: title })).toEqual(
			expect.arrayContaining(['too_long', 'starts_with_command', 'copies_question'])
		);
	});

	it('rejects interrogative labels and command sentences with only the opener removed', () => {
		expect(
			questionCardTitleIssues('Why steel is harder than iron', {
				promptText: 'Explain why steel is harder than iron.'
			})
		).toEqual(expect.arrayContaining(['starts_with_interrogative']));
		expect(
			questionCardTitleIssues('Plants infected with tobacco mosaic virus grow slowly', {
				promptText: 'Explain why plants infected with tobacco mosaic virus grow slowly.'
			})
		).toContain('copies_command_remainder');
	});

	it('rejects generic, mechanics-only and context-dependent bank labels', () => {
		expect(questionCardTitleIssues('GCSE exam question')).toContain('mechanics_only');
		expect(questionCardTitleIssues('Unlabelled science question')).toContain('mechanics_only');
		expect(questionCardTitleIssues('The Physics Equations Sheet')).toContain('mechanics_only');
		expect(questionCardTitleIssues('What happened')).toContain('mechanics_only');
		expect(questionCardTitleIssues('The linear search algorithm works')).toContain(
			'copies_prompt_sentence'
		);
		expect(questionCardTitleIssues('The pressure in the chamber changes')).toContain(
			'copies_prompt_sentence'
		);
		expect(questionCardTitleIssues('Compilers and interpreters operate')).toContain(
			'sentence_not_concept_label'
		);
		expect(questionCardTitleIssues('Distance, force and work done equation')).not.toContain(
			'sentence_not_concept_label'
		);
		expect(questionCardTitleIssues('The effect shown in Figure 7')).toEqual(
			expect.arrayContaining(['context_dependent'])
		);
		expect(questionCardTitleIssues('How current changes when the')).toContain(
			'truncated_prompt_fragment'
		);
	});

	it('publishes a versioned title contract', () => {
		expect(QUESTION_CARD_TITLE_CONTRACT).toBe('concept-method-process-v2');
	});
});
