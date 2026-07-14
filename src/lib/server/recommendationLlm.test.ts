import { describe, expect, it } from 'vitest';
import { parseRecommendationResponse } from './recommendationLlm';

describe('recommendation model response parsing', () => {
	it('accepts a supplied candidate and trims its reason', () => {
		expect(
			parseRecommendationResponse(
				'```json\n{"candidateId":"recall:cells","reason":"  Six due items make this the best short check.  "}\n```',
				new Set(['recall:cells', 'apply:question-1'])
			)
		).toEqual({
			candidateId: 'recall:cells',
			reason: 'Six due items make this the best short check.'
		});
	});

	it('rejects invented candidates and malformed output', () => {
		expect(
			parseRecommendationResponse(
				'{"candidateId":"invented","reason":"Do this."}',
				new Set(['recall:cells'])
			)
		).toBeNull();
		expect(parseRecommendationResponse('recall cells', new Set(['recall:cells']))).toBeNull();
	});
});
