import { describe, expect, it } from 'vitest';
import {
	ASSET_CANVAS_ANSWER_PREFIX,
	MAX_ASSET_CANVAS_ANSWER_LENGTH,
	assetCanvasAnswerForGrading,
	assetCanvasAnswerIsMeaningful,
	parseAssetCanvasAnswer,
	serializeAssetCanvasAnswer
} from './assetCanvasAnswer';

describe('mixed asset-canvas answers', () => {
	it('round-trips drawing strokes, working and a final answer', () => {
		const serialized = serializeAssetCanvasAnswer({
			strokes: [
				[
					[10, 20],
					[900, 800]
				]
			],
			working: 'gradient = change in y / change in x',
			finalAnswer: '2.4 × 10^-5'
		});

		expect(serialized.startsWith(ASSET_CANVAS_ANSWER_PREFIX)).toBe(true);
		expect(parseAssetCanvasAnswer(serialized)).toEqual({
			strokes: [
				[
					[10, 20],
					[900, 800]
				]
			],
			working: 'gradient = change in y / change in x',
			finalAnswer: '2.4 × 10^-5'
		});
		expect(assetCanvasAnswerIsMeaningful(serialized)).toBe(true);
	});

	it('keeps serialized answers inside the paper-answer request limit', () => {
		const serialized = serializeAssetCanvasAnswer({
			strokes: Array.from({ length: 20 }, () =>
				Array.from({ length: 300 }, (_, index) => [index * 7, index * 9] as [number, number])
			),
			working: 'w'.repeat(8_000),
			finalAnswer: 'answer'
		});

		expect(serialized.length).toBeLessThanOrEqual(MAX_ASSET_CANVAS_ANSWER_LENGTH);
		expect(() => parseAssetCanvasAnswer(serialized)).not.toThrow();
	});

	it('formats written evidence without pretending that a recorded stroke was visually checked', () => {
		const serialized = serializeAssetCanvasAnswer({
			strokes: [
				[
					[0, 0],
					[1_000, 1_000]
				]
			],
			working: '10 / 5 = 2',
			finalAnswer: '2 mol/s'
		});
		const prompt = assetCanvasAnswerForGrading(serialized);

		expect(prompt).toContain('not automatically verifiable');
		expect(prompt).toContain('WRITTEN_WORKING:\n10 / 5 = 2');
		expect(prompt).toContain('FINAL_ANSWER:\n2 mol/s');
	});

	it('treats legacy plain text as written working', () => {
		expect(parseAssetCanvasAnswer('legacy working').working).toBe('legacy working');
		expect(assetCanvasAnswerIsMeaningful('legacy working')).toBe(true);
	});
});
