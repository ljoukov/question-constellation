import { describe, expect, it } from 'vitest';
import { isResumableEnglishGuidedDraft } from './englishGuidedDraft';

function draft(stepAnswers: Record<string, string>, stepResults: Record<string, unknown> = {}) {
	return {
		questionId: 'english-question',
		draftKind: 'english-guided' as const,
		answerText: Object.values(stepAnswers).join('\n'),
		payload: { stepAnswers, stepResults },
		clientUpdatedAt: 1
	};
}

describe('English guided draft resume', () => {
	it('resumes a partly written or partly checked sequence', () => {
		expect(isResumableEnglishGuidedDraft(draft({ task: 'A clear thesis', evidence: '' }))).toBe(
			true
		);
	});

	it('does not advertise a fully passed sequence as unfinished', () => {
		const answers = { task: 'A clear thesis', evidence: 'A precise quotation' };
		expect(
			isResumableEnglishGuidedDraft(
				draft(answers, {
					task: { decision: 'pass', checkedAnswer: answers.task },
					evidence: { decision: 'pass', checkedAnswer: answers.evidence }
				})
			)
		).toBe(false);
	});

	it('ignores empty and non-English drafts', () => {
		expect(isResumableEnglishGuidedDraft(draft({ task: '', evidence: '' }))).toBe(false);
		expect(
			isResumableEnglishGuidedDraft({
				...draft({ task: 'A clear thesis' }),
				draftKind: 'science-practice'
			})
		).toBe(false);
	});
});
