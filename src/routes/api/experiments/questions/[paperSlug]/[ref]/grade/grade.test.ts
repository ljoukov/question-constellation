import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	claimPaperSittingGrade: vi.fn(),
	stagePaperSittingGrade: vi.fn(),
	completePaperSittingGrade: vi.fn(),
	releasePaperSittingGradeClaim: vi.fn(),
	gradeExperimentQuestionAnswers: vi.fn(),
	persistPaperSittingGradeResponse: vi.fn()
}));

vi.mock('$app/environment', () => ({ dev: false }));
vi.mock('$lib/server/paperSittingSession', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/paperSittingSession')>()),
	claimPaperSittingGrade: mocks.claimPaperSittingGrade,
	stagePaperSittingGrade: mocks.stagePaperSittingGrade,
	completePaperSittingGrade: mocks.completePaperSittingGrade,
	releasePaperSittingGradeClaim: mocks.releasePaperSittingGradeClaim
}));
vi.mock('$lib/server/questionExperimentGrading', () => ({
	gradeExperimentQuestionAnswers: mocks.gradeExperimentQuestionAnswers
}));
vi.mock('$lib/server/paperSittingAttemptPersistence', () => ({
	persistPaperSittingGradeResponse: mocks.persistPaperSittingGradeResponse
}));

import { PaperSittingSessionError } from '$lib/server/paperSittingSession';
import { POST } from './+server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

const authorization = {
	authorizationKind: 'server_paper_sitting_claim_v1' as const,
	sessionId: 'ps_1234567890123456789012345678901234567890',
	userId: user.uid,
	paperSlug: 'aqa-biology-paper-1',
	sourceDocumentId: 'source-aqa-biology-paper-1',
	reviewedAt: '2026-07-16T10:00:00.000Z',
	questionRef: '01',
	partRefs: ['01.1'],
	responseDurationsMs: { '01.1': 60_000 },
	serverStartedAtMs: 1_000,
	serverSubmittedAtMs: 61_000,
	claimId: 'pc_1234567890123456789012345678901234567890'
};

const gradeResponse = {
	status: 'ok' as const,
	paperSlug: 'aqa-biology-paper-1',
	ref: '01',
	model: 'chatgpt-test',
	modelVersion: 'test-version',
	totals: { awardedMarks: 1, maxMarks: 1, gradeableMarks: 1, ungradedMarks: 0 },
	results: [
		{
			questionId: 'question-01-1',
			ref: '01.1',
			status: 'graded' as const,
			result: 'correct' as const,
			awardedMarks: 1,
			maxMarks: 1,
			gradeableMarks: 1,
			confidence: 'high' as const,
			summary: 'Correct.',
			nextStep: '',
			checklist: [],
			chain: null,
			modelAnswer: null,
			warnings: []
		}
	]
};

const claimed = {
	kind: 'claimed' as const,
	answers: { '01.1': 'Server-locked answer' },
	authorization,
	reusedResponse: null
};

function request(body: Record<string, unknown>, accept = 'application/json') {
	return new Request('http://localhost/api/experiments/questions/aqa-biology-paper-1/01/grade', {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept },
		body: JSON.stringify(body)
	});
}

async function post(
	body: Record<string, unknown>,
	params = { paperSlug: 'aqa-biology-paper-1', ref: '01' },
	accept = 'application/json'
) {
	return POST({
		locals: { user },
		params,
		request: request(body, accept),
		platform: undefined
	} as never);
}

const identityBody = {
	paperSitting: {
		sessionId: authorization.sessionId,
		nonce: 'pn_1234567890123456789012345678901234567890'
	}
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.claimPaperSittingGrade.mockResolvedValue(claimed);
	mocks.stagePaperSittingGrade.mockResolvedValue(gradeResponse);
	mocks.gradeExperimentQuestionAnswers.mockResolvedValue(gradeResponse);
	mocks.persistPaperSittingGradeResponse.mockResolvedValue({ saved: 1, skipped: 0, failed: 0 });
	mocks.completePaperSittingGrade.mockResolvedValue({ status: 'grading' });
	mocks.releasePaperSittingGradeClaim.mockResolvedValue(true);
});

describe('experiment question grade paper-sitting boundary', () => {
	it('rejects a direct spoof before any model or evidence write', async () => {
		mocks.claimPaperSittingGrade.mockRejectedValue(new PaperSittingSessionError('session_missing'));

		const response = await post({
			paperSitting: {
				sessionId: 'ps_0000000000000000000000000000000000000000',
				nonce: 'pn_0000000000000000000000000000000000000000'
			}
		});

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: 'paper_sitting_unavailable',
			reason: 'session_missing'
		});
		expect(mocks.gradeExperimentQuestionAnswers).not.toHaveBeenCalled();
		expect(mocks.persistPaperSittingGradeResponse).not.toHaveBeenCalled();
	});

	it('returns a stable 409 for the unavailable Combined Physics P1 negative control', async () => {
		mocks.claimPaperSittingGrade.mockRejectedValue(
			new PaperSittingSessionError('paper_unavailable')
		);

		const response = await post(identityBody, {
			paperSlug: 'aqa-8464p1h-jun24',
			ref: '01'
		});

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: 'paper_sitting_unavailable',
			reason: 'paper_unavailable'
		});
		expect(mocks.gradeExperimentQuestionAnswers).not.toHaveBeenCalled();
		expect(mocks.persistPaperSittingGradeResponse).not.toHaveBeenCalled();
	});

	it('rejects legacy client identity or timing fields instead of treating them as evidence', async () => {
		const response = await post({
			answers: { '01.1': 'Typed answer' },
			sessionId: authorization.sessionId,
			responseDurationsMs: { '01.1': 60_000 }
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'invalid_body' });
		expect(mocks.claimPaperSittingGrade).not.toHaveBeenCalled();
		expect(mocks.gradeExperimentQuestionAnswers).not.toHaveBeenCalled();
	});

	it('rejects model or prompt overrides on an independent paper-sitting grade', async () => {
		const response = await post({
			...identityBody,
			model: 'chatgpt-attacker-selected',
			thinkingLevel: 'none'
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'invalid_body' });
		expect(mocks.claimPaperSittingGrade).not.toHaveBeenCalled();
		expect(mocks.gradeExperimentQuestionAnswers).not.toHaveBeenCalled();
	});

	it('grades only the immutable server answer and stages it before independent persistence', async () => {
		const response = await post(identityBody);

		expect(response.status).toBe(200);
		expect(mocks.claimPaperSittingGrade).toHaveBeenCalledWith({
			userId: user.uid,
			paperSlug: 'aqa-biology-paper-1',
			questionRef: '01',
			sessionId: authorization.sessionId,
			nonce: identityBody.paperSitting.nonce
		});
		expect(mocks.gradeExperimentQuestionAnswers).toHaveBeenCalledWith(
			expect.objectContaining({
				paperSlug: 'aqa-biology-paper-1',
				ref: '01',
				answers: { '01.1': 'Server-locked answer' }
			})
		);
		expect(mocks.stagePaperSittingGrade).toHaveBeenCalledWith({
			authorization,
			response: gradeResponse
		});
		expect(mocks.persistPaperSittingGradeResponse).toHaveBeenCalledWith({
			user,
			answers: claimed.answers,
			response: gradeResponse,
			authorization
		});
		expect(mocks.completePaperSittingGrade).toHaveBeenCalledWith({
			authorization,
			results: gradeResponse.results
		});
		expect(mocks.stagePaperSittingGrade.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.persistPaperSittingGradeResponse.mock.invocationCallOrder[0]
		);
		expect(mocks.persistPaperSittingGradeResponse.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.completePaperSittingGrade.mock.invocationCallOrder[0]
		);
	});

	it('returns an already completed group without another model or evidence write', async () => {
		mocks.claimPaperSittingGrade.mockResolvedValue({ kind: 'replay', response: gradeResponse });

		const response = await post(identityBody);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(gradeResponse);
		expect(mocks.gradeExperimentQuestionAnswers).not.toHaveBeenCalled();
		expect(mocks.stagePaperSittingGrade).not.toHaveBeenCalled();
		expect(mocks.persistPaperSittingGradeResponse).not.toHaveBeenCalled();
	});

	it('replays a completed group over SSE without another model or evidence write', async () => {
		mocks.claimPaperSittingGrade.mockResolvedValue({ kind: 'replay', response: gradeResponse });

		const response = await post(identityBody, undefined, 'text/event-stream');
		const stream = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/event-stream');
		expect(stream).toContain('event: done');
		expect(stream).toContain(JSON.stringify(gradeResponse));
		expect(mocks.gradeExperimentQuestionAnswers).not.toHaveBeenCalled();
		expect(mocks.persistPaperSittingGradeResponse).not.toHaveBeenCalled();
	});

	it('finishes a staged timeout retry with the original result and no second model call', async () => {
		mocks.claimPaperSittingGrade.mockResolvedValue({
			...claimed,
			reusedResponse: gradeResponse
		});

		const response = await post(identityBody);

		expect(response.status).toBe(200);
		expect(mocks.gradeExperimentQuestionAnswers).not.toHaveBeenCalled();
		expect(mocks.persistPaperSittingGradeResponse).toHaveBeenCalledWith(
			expect.objectContaining({ response: gradeResponse })
		);
		expect(mocks.completePaperSittingGrade).toHaveBeenCalledOnce();
	});

	it('retries a staged response after Personal persistence fails without a second model call', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const retryAuthorization = {
			...authorization,
			claimId: 'pc_9999999999999999999999999999999999999999'
		};
		mocks.claimPaperSittingGrade.mockResolvedValueOnce(claimed).mockResolvedValueOnce({
			...claimed,
			authorization: retryAuthorization,
			reusedResponse: gradeResponse
		});
		mocks.persistPaperSittingGradeResponse
			.mockResolvedValueOnce({ saved: 0, skipped: 0, failed: 1 })
			.mockResolvedValueOnce({ saved: 1, skipped: 0, failed: 0 });

		const failed = await post(identityBody);
		const retried = await post(identityBody);

		expect(failed.status).toBe(500);
		expect(retried.status).toBe(200);
		expect(mocks.gradeExperimentQuestionAnswers).toHaveBeenCalledOnce();
		expect(mocks.stagePaperSittingGrade).toHaveBeenCalledTimes(2);
		expect(mocks.persistPaperSittingGradeResponse).toHaveBeenCalledTimes(2);
		expect(mocks.persistPaperSittingGradeResponse).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ response: gradeResponse, authorization })
		);
		expect(mocks.persistPaperSittingGradeResponse).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ response: gradeResponse, authorization: retryAuthorization })
		);
		expect(mocks.completePaperSittingGrade).toHaveBeenCalledOnce();
		expect(mocks.releasePaperSittingGradeClaim).toHaveBeenCalledTimes(1);
		consoleError.mockRestore();
	});

	it('releases the exact claim after a grading failure so the same group can retry', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mocks.gradeExperimentQuestionAnswers.mockRejectedValue(new Error('model timeout'));

		const response = await post(identityBody);

		expect(response.status).toBe(500);
		expect(mocks.releasePaperSittingGradeClaim).toHaveBeenCalledWith({
			sessionId: authorization.sessionId,
			claimId: authorization.claimId
		});
		expect(mocks.persistPaperSittingGradeResponse).not.toHaveBeenCalled();
		expect(mocks.completePaperSittingGrade).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it('does not complete the group when any independent evidence row fails to persist', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mocks.persistPaperSittingGradeResponse.mockResolvedValue({
			saved: 0,
			skipped: 0,
			failed: 1
		});

		const response = await post(identityBody);

		expect(response.status).toBe(500);
		expect(mocks.stagePaperSittingGrade).toHaveBeenCalledOnce();
		expect(mocks.completePaperSittingGrade).not.toHaveBeenCalled();
		expect(mocks.releasePaperSittingGradeClaim).toHaveBeenCalledWith({
			sessionId: authorization.sessionId,
			claimId: authorization.claimId
		});
		consoleError.mockRestore();
	});

	it('allows an explicit zero-mark paper row to be skipped without omitting evidence-bearing parts', async () => {
		const zeroMarkResult = {
			...gradeResponse.results[0],
			questionId: 'question-instruction',
			ref: '01.0',
			status: 'unanswered' as const,
			result: 'ungraded' as const,
			awardedMarks: null,
			maxMarks: 0,
			gradeableMarks: 0
		};
		const responseWithInstruction = {
			...gradeResponse,
			results: [zeroMarkResult, ...gradeResponse.results]
		};
		const claimWithInstruction = {
			...claimed,
			answers: { '01.0': '', ...claimed.answers },
			authorization: {
				...authorization,
				partRefs: ['01.0', '01.1'],
				responseDurationsMs: { '01.0': 0, ...authorization.responseDurationsMs }
			}
		};
		mocks.claimPaperSittingGrade.mockResolvedValue(claimWithInstruction);
		mocks.gradeExperimentQuestionAnswers.mockResolvedValue(responseWithInstruction);
		mocks.persistPaperSittingGradeResponse.mockResolvedValue({ saved: 1, skipped: 1, failed: 0 });

		const response = await post(identityBody);

		expect(response.status).toBe(200);
		expect(mocks.completePaperSittingGrade).toHaveBeenCalledWith({
			authorization: claimWithInstruction.authorization,
			results: responseWithInstruction.results
		});
	});

	it('keeps ordinary one-question grading separate from paper-sitting evidence', async () => {
		const response = await post({ answers: { '01.1': 'Typed answer' } });

		expect(response.status).toBe(200);
		expect(mocks.claimPaperSittingGrade).not.toHaveBeenCalled();
		expect(mocks.gradeExperimentQuestionAnswers).toHaveBeenCalledWith(
			expect.objectContaining({ answers: { '01.1': 'Typed answer' } })
		);
		expect(mocks.persistPaperSittingGradeResponse).not.toHaveBeenCalled();
	});
});
