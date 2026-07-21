import { describe, expect, it } from 'vitest';
import { parseRecommendationResponse } from './recommendationLlm';

describe('recommendation model response parsing', () => {
	it('accepts a supplied candidate', () => {
		expect(
			parseRecommendationResponse(
				'```json\n{"candidateId":"recall:cells"}\n```',
				new Set(['recall:cells', 'apply:question-1'])
			)
		).toEqual({ candidateId: 'recall:cells' });
	});

	it('rejects invented candidates and malformed output', () => {
		expect(
			parseRecommendationResponse('{"candidateId":"invented"}', new Set(['recall:cells']))
		).toBeNull();
		expect(parseRecommendationResponse('recall cells', new Set(['recall:cells']))).toBeNull();
	});
});
