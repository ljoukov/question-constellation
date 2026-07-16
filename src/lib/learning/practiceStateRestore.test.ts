import { describe, expect, it } from 'vitest';
import { practiceStateRestoreMode } from './practiceStateRestore';

describe('science practice state restoration', () => {
	it('resumes an unfinished draft on an ordinary practice URL', () => {
		expect(
			practiceStateRestoreMode(
				{ answerText: 'An unfinished answer', gradeResult: null, view: 'attempt' },
				'attempt'
			)
		).toBe('draft');
	});

	it('starts a fresh attempt instead of reopening a saved result', () => {
		expect(
			practiceStateRestoreMode(
				{
					answerText: 'A checked answer',
					gradedAnswerText: 'A checked answer',
					gradeResult: { result: 'correct' },
					view: 'result'
				},
				'attempt'
			)
		).toBe('fresh_attempt');
	});

	it('restores a checked result only when the URL explicitly asks for it', () => {
		expect(
			practiceStateRestoreMode(
				{
					answerText: 'A checked answer',
					gradedAnswerText: 'A checked answer',
					gradeResult: { result: 'correct' },
					view: 'result'
				},
				'result'
			)
		).toBe('checked_result');
	});

	it('recovers from an incomplete stored result as a fresh attempt', () => {
		expect(practiceStateRestoreMode({ answerText: 'Stale answer', view: 'result' }, 'result')).toBe(
			'fresh_attempt'
		);
	});
});
