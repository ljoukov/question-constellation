import { describe, expect, it } from 'vitest';
import { deriveEnglishQuestionCardTitle } from './englishQuestionCardTitle';

describe('English question card titles', () => {
	it.each([
		[
			'How does Dickens present the relationship between Pip and Joe, in this extract and elsewhere in the novel?',
			['Section B', '19th century prose', 'Great Expectations'],
			"Pip and Joe's relationship"
		],
		[
			'How does Austen present Elizabeth as different from other women, in this extract and elsewhere in the novel?',
			['Section B', '19th century prose', 'Pride and Prejudice'],
			'Elizabeth as different from other women'
		],
		[
			'How does Wells present the breakdown of order, in this extract and elsewhere in the novel?',
			['Section B', '19th century prose', 'The War of the Worlds'],
			'The breakdown of order'
		],
		[
			'How does Dickens encourage you to feel pity for Scrooge, in this extract and elsewhere in the novel?',
			['Section B', '19th century prose', 'A Christmas Carol'],
			'Pity for Scrooge'
		],
		[
			'Explore the ways in which Shakespeare presents fate in this tragedy. Refer to this extract which is the Prologue and elsewhere in the play.',
			['English Literature', 'Romeo and Juliet', 'fate'],
			'Fate in Romeo and Juliet'
		]
	])('names the literary focus without copying the exam command', (promptText, topicPath, title) => {
		expect(deriveEnglishQuestionCardTitle({ promptText, topicPath })).toBe(title);
	});

	it.each([
		[
			'Compare how family tension is presented in these two extracts.',
			['Modern prose or drama', 'An Inspector Calls'],
			'Family tension'
		],
		[
			'Explore another moment in An Inspector Calls where there is a dramatic entrance or exit.',
			['Modern prose or drama', 'An Inspector Calls'],
			'A dramatic entrance or exit'
		],
		[
			'Compare how these poems present pity for victims of conflict.',
			['Poetry', 'Conflict'],
			'Pity for victims of conflict'
		],
		[
			'Explore in detail one other poem from your anthology which presents sympathy for those involved in conflict.',
			['Poetry', 'Conflict'],
			'Sympathy for those involved in conflict'
		],
		[
			"'Dickens presents Miss Havisham as mainly motivated by revenge.' How far do you agree with this view? Explore at least two moments from the novel to support your ideas.",
			['19th century prose', 'Great Expectations'],
			'Miss Havisham: motivated by revenge'
		],
		[
			"'In Great Expectations there are no happy parent and child relationships.' How far do you agree with this view? Explore at least two moments from the novel to support your ideas.",
			['19th century prose', 'Great Expectations'],
			'Happy parent and child relationships'
		]
	])('condenses common OCR task shapes into a focus label', (promptText, topicPath, title) => {
		expect(deriveEnglishQuestionCardTitle({ promptText, topicPath })).toBe(title);
	});

	it('returns null rather than inventing a label for an unsupported task', () => {
		expect(
			deriveEnglishQuestionCardTitle({
				promptText: 'Write your answer in the space provided.',
				topicPath: ['English Literature']
			})
		).toBeNull();
	});

	it.each([
		[
			'Explore how horror is presented in the play. Refer to this extract from Act 2 Scene 3 and elsewhere in the play.',
			'Horror in Macbeth'
		],
		[
			'To what extent does Shakespeare encourage the audience to feel pity for Lady Macbeth? Explore at least two moments from the play to support your ideas.',
			'Pity for Lady Macbeth'
		],
		[
			"To what extent do Macbeth's soliloquies encourage the audience to pity him? Explore at least two moments from the play to support your ideas.",
			"Pity through Macbeth's soliloquies"
		]
	])('names the remaining selected Macbeth tasks', (promptText, title) => {
		expect(
			deriveEnglishQuestionCardTitle({
				promptText,
				topicPath: ['Paper 2', 'Shakespeare', 'Macbeth']
			})
		).toBe(title);
	});
});
