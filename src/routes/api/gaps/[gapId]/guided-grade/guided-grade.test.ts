import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	judgeGapFinalAnswer: vi.fn(),
	recordGapOutcomeEvidence: vi.fn()
}));

vi.mock('$lib/server/personalLearning', () => ({
	judgeGapFinalAnswer: mocks.judgeGapFinalAnswer
}));

vi.mock('$lib/server/subjectLearning', () => ({
	recordGapOutcomeEvidence: mocks.recordGapOutcomeEvidence
}));

import { POST } from './+server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.judgeGapFinalAnswer.mockResolvedValue({
		runId: 'gap-response-1',
		awardedMarks: 4,
		maxMarks: 4,
		summary: 'Pasted text cannot close this gap.',
		presentStepIds: ['step-1'],
		missingStepIds: [],
		targetStepPresent: true,
		gapClosed: false,
		externalInputDetected: true,
		externalInputSources: ['paste']
	});
	mocks.recordGapOutcomeEvidence.mockResolvedValue(undefined);
});

describe('POST /api/gaps/[gapId]/guided-grade', () => {
	it('passes external insertion through the judge and persisted evidence write', async () => {
		const response = await POST({
			locals: { user },
			params: { gapId: 'gap-1' },
			request: new Request('https://constellation.eviworld.com/api/gaps/gap-1/guided-grade', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					answer: 'The target step is present.',
					guidedAnswers: { 'missing-link': 'target step' },
					submissionId: 'gap-response-1',
					sourceSessionId: 'gap-session-1',
					responseDurationMs: 15_000,
					assistance: {
						externalInputDetected: true,
						externalInputSources: ['paste']
					}
				})
			})
		} as unknown as Parameters<typeof POST>[0]);

		expect(response.status).toBe(200);
		expect(mocks.judgeGapFinalAnswer).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: user.uid,
				gapId: 'gap-1',
				assistance: {
					externalInputDetected: true,
					externalInputSources: ['paste']
				}
			})
		);
		expect(mocks.recordGapOutcomeEvidence).toHaveBeenCalledWith(
			expect.objectContaining({
				user,
				gapId: 'gap-1',
				result: expect.objectContaining({
					gapClosed: false,
					externalInputDetected: true,
					externalInputSources: ['paste']
				})
			})
		);
		expect(await response.json()).toMatchObject({
			gapClosed: false,
			externalInputDetected: true,
			externalInputSources: ['paste']
		});
	});
});
