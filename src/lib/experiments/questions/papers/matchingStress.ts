import type { ExamPaper } from '../types';

function numberedLabels(prefix: string, count: number) {
	return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
}

function matchingPart(count: number) {
	return {
		ref: `01.${count}`,
		marks: count,
		blocks: [{ kind: 'paragraph' as const, text: `${count}-row matching stress case.` }],
		response: {
			kind: 'matching' as const,
			leftTitle: `${count}-row sources`,
			rightTitle: `${count}-row targets`,
			left: numberedLabels(`${count}-row source`, count),
			right: numberedLabels(`${count}-row target`, count)
		}
	};
}

export const matchingStressPaper: ExamPaper = {
	id: 'matching-stress',
	title: 'Matching Connector Stress Cases',
	subtitle: 'Generated renderer validation',
	source: 'Local generated data for /experiments/questions component checks',
	assets: {},
	questions: [
		{
			ref: '01',
			blocks: [
				{
					kind: 'paragraph',
					text: 'These generated examples validate connector geometry across larger matching sets.'
				}
			],
			parts: [matchingPart(5), matchingPart(6), matchingPart(8)]
		}
	]
};
