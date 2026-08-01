import { describe, expect, it } from 'vitest';
import {
	buildPracticePaperSelection,
	estimatedPracticePaperMinutes,
	normalizePracticePaperDuration
} from './practicePaper';

function question(id: string, topicId: string, marks: number | null) {
	return { id, topicId, marks };
}

const candidates = [
	...Array.from({ length: 8 }, (_, index) =>
		question(`cells-${index + 1}`, 'cells', 2 + (index % 4))
	),
	...Array.from({ length: 8 }, (_, index) =>
		question(`energy-${index + 1}`, 'energy', 1 + (index % 5))
	),
	...Array.from({ length: 8 }, (_, index) =>
		question(`rates-${index + 1}`, 'rates', 3 + (index % 4))
	)
];

describe('generated practice-paper selection', () => {
	it('is stable for a paper seed and contains no duplicate questions', () => {
		const first = buildPracticePaperSelection({
			questions: candidates,
			selectedTopicIds: [],
			seed: 'paper-seed-1',
			durationMinutes: 60
		});
		const second = buildPracticePaperSelection({
			questions: candidates,
			selectedTopicIds: [],
			seed: 'paper-seed-1',
			durationMinutes: 60
		});

		expect(second).toEqual(first);
		expect(first).toHaveLength(12);
		expect(new Set(first.map((entry) => entry.id))).toHaveLength(first.length);
	});

	it('uses only explicitly selected topics and treats an empty selection as mixed', () => {
		const focused = buildPracticePaperSelection({
			questions: candidates,
			selectedTopicIds: ['energy'],
			seed: 'paper-seed-2',
			durationMinutes: 45
		});
		const mixed = buildPracticePaperSelection({
			questions: candidates,
			selectedTopicIds: [],
			seed: 'paper-seed-2',
			durationMinutes: 45
		});

		expect(focused.every((entry) => entry.topicId === 'energy')).toBe(true);
		expect(new Set(mixed.map((entry) => entry.topicId)).size).toBeGreaterThan(1);
	});

	it('builds from shorter to longer questions and ignores unmarked rows', () => {
		const selected = buildPracticePaperSelection({
			questions: [...candidates, question('unmarked', 'cells', null)],
			selectedTopicIds: [],
			seed: 'paper-seed-3',
			durationMinutes: 30
		});

		expect(selected.map((entry) => entry.id)).not.toContain('unmarked');
		expect(selected.map((entry) => entry.marks)).toEqual(
			[...selected.map((entry) => entry.marks)].sort((left, right) => (left ?? 0) - (right ?? 0))
		);
	});

	it('normalises duration inputs and estimates working time from marks', () => {
		expect(normalizePracticePaperDuration('45')).toBe(45);
		expect(normalizePracticePaperDuration('90')).toBe(60);
		expect(estimatedPracticePaperMinutes(24)).toBe(30);
	});
});
