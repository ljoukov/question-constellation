import { classifyEnglishLiteratureTask, sourcePaperUrlForQuestion } from './questionData';
import { describe, expect, it } from 'vitest';

const subject = 'English Literature';

describe('English Literature practice task classification', () => {
	it('finds the original paper needed for printed extracts and poems', () => {
		expect(sourcePaperUrlForQuestion('ocr-j352-02-jun24-02-1a')).toContain(
			'OCR_GCSE_English_Literature_2024_June_question_paper'
		);
		expect(sourcePaperUrlForQuestion('ocr-j352-01-jun19-07-0')).toContain(
			'OCR_GCSE_English_Literature_2019_June_question_paper'
		);
		expect(sourcePaperUrlForQuestion('not-a-paper')).toBeNull();
	});

	it.each([
		{
			name: 'poetry comparison',
			promptText: 'Compare how these poems present a demand for a conflict to end.',
			contextText: 'Section A - Poetry across time. Read the two poems below.',
			paper: 'Exploring poetry and Shakespeare',
			expected: 'poetry-comparison'
		},
		{
			name: 'paired prose extracts',
			promptText: 'Compare how problems at school are presented in these two extracts.',
			contextText: 'For part (a), focus only on the extracts here.',
			paper: 'Exploring modern and literary heritage texts',
			expected: 'extract-comparison'
		},
		{
			name: 'paired drama extracts',
			promptText: 'Compare how family tension is presented in these two extracts.',
			contextText: 'Read the two extracts and focus only on them.',
			paper: 'Exploring modern and literary heritage texts',
			expected: 'extract-comparison'
		},
		{
			name: 'novel extract and wider text',
			promptText:
				'How does Austen present social status, in this extract and elsewhere in the novel?',
			contextText: 'This is an extract-based option.',
			paper: 'Exploring modern and literary heritage texts',
			expected: 'extract-and-wider'
		},
		{
			name: 'Shakespeare extract and elsewhere',
			promptText:
				'Explore how horror is presented in the play. Refer to this extract and elsewhere in the play.',
			contextText: 'This is the extract-based Macbeth option.',
			paper: 'Exploring poetry and Shakespeare',
			expected: 'extract-and-wider'
		},
		{
			name: 'whole-text judgement',
			promptText:
				"'The Curate is selfish and deserves no sympathy.' How far do you agree? Explore at least two moments from the novel.",
			contextText: 'Discursive option question.',
			paper: 'Exploring modern and literary heritage texts',
			expected: 'whole-text-judgement'
		},
		{
			name: 'whole-play judgement',
			promptText:
				'To what extent does Shakespeare encourage the audience to feel pity for Lady Macbeth? Explore at least two moments from the play.',
			contextText: 'Discursive Macbeth option.',
			paper: 'Exploring poetry and Shakespeare',
			expected: 'whole-text-judgement'
		},
		{
			name: 'studied-text other moment',
			promptText:
				'Explore another moment in Animal Farm where the suffering of animals is described.',
			contextText: 'Answer on another moment from the studied text.',
			paper: 'Exploring modern and literary heritage texts',
			expected: 'single-text-analysis'
		},
		{
			name: 'single anthology poem',
			promptText:
				'Explore in detail one other poem from your anthology which presents the wish for an end to conflict.',
			contextText: 'Part (b) asks for one other poem from the anthology.',
			paper: 'Exploring poetry and Shakespeare',
			expected: 'single-text-analysis'
		},
		{
			name: 'single whole-play analysis',
			promptText: 'How does Shakespeare present the young lovers in this play?',
			contextText: 'Explore at least two moments from the play to support your ideas.',
			paper: 'Exploring poetry and Shakespeare',
			expected: 'single-text-analysis'
		}
	])('classifies $name', ({ promptText, contextText, paper, expected }) => {
		expect(classifyEnglishLiteratureTask({ subject, promptText, contextText, paper })).toBe(
			expected
		);
	});
});
