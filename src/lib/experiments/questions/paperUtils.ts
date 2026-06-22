import type { ExamPaper } from './types';

export function questionRefs(paper: ExamPaper) {
	return paper.questions.flatMap((question) => [
		question.ref,
		...question.parts.map((part) => part.ref)
	]);
}

export function focusPaperByRef(paper: ExamPaper, ref: string): ExamPaper | null {
	for (const question of paper.questions) {
		if (question.ref === ref) {
			return {
				...paper,
				title: `${paper.title} Question ${question.ref}`,
				questions: [question]
			};
		}

		const part = question.parts.find((candidate) => candidate.ref === ref);
		if (part) {
			return {
				...paper,
				title: `${paper.title} Question ${part.ref}`,
				questions: [
					{
						...question,
						parts: [part]
					}
				]
			};
		}
	}

	return null;
}
