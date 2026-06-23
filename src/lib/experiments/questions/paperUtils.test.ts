import { describe, expect, it } from 'vitest';
import { focusPaperByRef } from './paperUtils';
import type { ExamPaper } from './types';

const paper: ExamPaper = {
	id: 'sample-paper',
	title: 'Sample Paper',
	subtitle: 'Higher Tier',
	source: 'sample.pdf',
	assets: {
		figure2: {
			id: 'figure2',
			label: 'Figure 2',
			src: '/images/figure2.png',
			alt: 'Figure 2'
		}
	},
	questions: [
		{
			ref: '02',
			blocks: [{ kind: 'paragraph', text: 'This question is about waves.' }],
			parts: [
				{
					ref: '02.1',
					marks: 1,
					leadBlocks: [{ kind: 'figure', assetId: 'figure2', label: 'Figure 2' }],
					blocks: [{ kind: 'paragraph', text: 'Use Figure 2 to name the wave.' }],
					response: { kind: 'lines', count: 1 }
				},
				{
					ref: '02.3',
					marks: 2,
					blocks: [{ kind: 'paragraph', text: 'Use Fig. 2 to calculate the speed.' }],
					response: { kind: 'lines', count: 2 }
				}
			]
		}
	]
};

describe('focusPaperByRef', () => {
	it('keeps sibling visual dependencies when focusing a single subpart', () => {
		const focused = focusPaperByRef(paper, '02.3');

		const part = focused?.questions[0]?.parts[0];
		expect(part?.ref).toBe('02.3');
		expect(part?.leadBlocks).toEqual([{ kind: 'figure', assetId: 'figure2', label: 'Figure 2' }]);
	});

	it('does not duplicate visuals already available to the selected subpart', () => {
		const focused = focusPaperByRef(paper, '02.1');

		const part = focused?.questions[0]?.parts[0];
		expect(part?.leadBlocks).toEqual([{ kind: 'figure', assetId: 'figure2', label: 'Figure 2' }]);
	});

	it('uses sibling visuals when the shared stem references them', () => {
		const focused = focusPaperByRef(
			{
				...paper,
				questions: [
					{
						...paper.questions[0],
						blocks: [{ kind: 'paragraph', text: 'Figure 2 shows the apparatus.' }]
					}
				]
			},
			'02.3'
		);

		const part = focused?.questions[0]?.parts[0];
		expect(part?.leadBlocks).toEqual([{ kind: 'figure', assetId: 'figure2', label: 'Figure 2' }]);
	});
});
