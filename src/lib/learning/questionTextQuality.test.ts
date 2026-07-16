import { describe, expect, it } from 'vitest';
import {
	cleanLearnerQuestionText,
	learnerQuestionTextIssues,
	stripExamPaperTail
} from './questionTextQuality.js';

describe('learner question text quality', () => {
	it('cuts repeated additional-page and copyright matter at the first boundary', () => {
		const raw = `Explain the effect of increasing temperature.\n[3 marks]\nQuestion   Additional page, if required.\nQuestion   Additional page, if required.\nCopyright information\n*206g8464/C/2H*`;
		expect(stripExamPaperTail(raw)).toBe(
			'Explain the effect of increasing temperature.\n[3 marks]'
		);
		expect(cleanLearnerQuestionText(raw)).toBe('Explain the effect of increasing temperature.');
	});

	it('reports exam-tail artefacts in an unclean extraction', () => {
		expect(
			learnerQuestionTextIssues(
				'Additional page, if required. Copyright © 2020 AQA. *206g8464/C/2H*'
			)
		).toEqual(['exam_additional_page', 'exam_copyright', 'exam_paper_code']);
	});
});
