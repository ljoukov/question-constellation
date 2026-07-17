import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExperimentGradeResponse } from '$lib/experiments/questions/gradingTypes';

const mocks = vi.hoisted(() => ({
	recordQuestionAttempt: vi.fn(),
	recordQuestionAttemptEvidence: vi.fn()
}));

vi.mock('$lib/server/personalLearning', () => ({
	recordQuestionAttempt: mocks.recordQuestionAttempt
}));
vi.mock('$lib/server/subjectLearning', () => ({
	recordQuestionAttemptEvidence: mocks.recordQuestionAttemptEvidence
}));

import {
	paperSittingAttemptId,
	persistPaperSittingGradeResponse
} from './paperSittingAttemptPersistence';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

const authorization = {
	authorizationKind: 'server_paper_sitting_claim_v1' as const,
	sessionId: 'sitting-1',
	userId: user.uid,
	paperSlug: 'aqa-biology-paper-1',
	sourceDocumentId: 'source-aqa-biology-paper-1',
	questionRef: '01',
	partRefs: ['01.1', '01.2', '01.3'],
	reviewedAt: '2026-07-16T10:00:00.000Z',
	responseDurationsMs: {
		'01.1': 42_000,
		'01.2': 10_000,
		'01.3': 18_000
	},
	serverStartedAtMs: 1_000,
	serverSubmittedAtMs: 71_000,
	claimId: 'claim-1'
};

function responseFixture(): ExperimentGradeResponse {
	return {
		status: 'ok',
		paperSlug: 'aqa-biology-paper-1',
		ref: '01',
		model: 'chatgpt-test',
		modelVersion: 'test-version',
		totals: { awardedMarks: 2, maxMarks: 5, gradeableMarks: 2, ungradedMarks: 3 },
		results: [
			{
				questionId: 'question-01-1',
				ref: '01.1',
				status: 'graded',
				result: 'partial',
				awardedMarks: 2,
				maxMarks: 3,
				gradeableMarks: 3,
				confidence: 'high',
				summary: 'Two links were credited.',
				nextStep: 'Add the final consequence.',
				checklist: [],
				chain: {
					id: 'chain-1',
					title: 'Cause to consequence',
					canonicalText: 'cause -> process -> consequence',
					steps: [
						{
							id: 'step-1',
							text: 'Cause',
							role: 'cause',
							verdict: 'credited',
							explanation: 'Present.'
						},
						{
							id: 'step-2',
							text: 'Consequence',
							role: 'outcome',
							verdict: 'missed',
							explanation: 'Missing.'
						}
					]
				},
				modelAnswer: null,
				warnings: []
			},
			{
				questionId: 'question-01-2',
				ref: '01.2',
				status: 'unanswered',
				result: 'ungraded',
				awardedMarks: null,
				maxMarks: 1,
				gradeableMarks: 1,
				confidence: 'low',
				summary: 'No answer was submitted.',
				nextStep: '',
				checklist: [],
				chain: null,
				modelAnswer: null,
				warnings: []
			},
			{
				questionId: 'question-01-3',
				ref: '01.3',
				status: 'unanswered',
				result: 'ungraded',
				awardedMarks: null,
				maxMarks: 1,
				gradeableMarks: 1,
				confidence: 'low',
				summary: 'No answer was submitted.',
				nextStep: '',
				checklist: [],
				chain: null,
				modelAnswer: null,
				warnings: []
			}
		]
	};
}

beforeEach(() => {
	mocks.recordQuestionAttempt.mockReset();
	mocks.recordQuestionAttemptEvidence.mockReset();
	mocks.recordQuestionAttemptEvidence.mockResolvedValue(true);
});

describe('full-paper attempt persistence', () => {
	it('uses a stable identity and records fully gradeable blank answers as zero-mark evidence', async () => {
		const attemptId = paperSittingAttemptId({
			userId: user.uid,
			sessionId: 'sitting-1',
			paperSlug: 'aqa-biology-paper-1',
			questionId: 'question-01-1'
		});
		mocks.recordQuestionAttempt.mockImplementation(async ({ attemptId: id }) => ({
			id,
			activeGaps: [],
			recallPrompt: null
		}));

		const summary = await persistPaperSittingGradeResponse({
			user,
			answers: { '01.1': 'A typed answer', '01.2': '', '01.3': 'A drawing description' },
			response: responseFixture(),
			authorization
		});

		expect(summary).toEqual({ saved: 3, skipped: 0, failed: 0 });
		expect(mocks.recordQuestionAttempt).toHaveBeenCalledTimes(3);
		expect(mocks.recordQuestionAttempt).toHaveBeenCalledWith(
			expect.objectContaining({
				user,
				questionId: 'question-01-1',
				answer: 'A typed answer',
				attemptId,
				assistance: {},
				result: expect.objectContaining({
					result: 'partial',
					presentStepIds: ['step-1'],
					missingStepIds: ['step-2'],
					model: 'chatgpt-test',
					modelVersion: 'test-version'
				})
			})
		);
		expect(mocks.recordQuestionAttemptEvidence).toHaveBeenCalledWith(
			expect.objectContaining({
				attemptId,
				questionId: 'question-01-1',
				assistance: {},
				sourceSessionId: 'sitting-1',
				responseDurationMs: 42_000,
				occurredAt: '1970-01-01T00:01:11.000Z'
			})
		);
		expect(mocks.recordQuestionAttempt).toHaveBeenCalledWith(
			expect.objectContaining({
				questionId: 'question-01-2',
				answer: '',
				result: expect.objectContaining({
					result: 'incorrect',
					awardedMarks: 0,
					maxMarks: 1
				})
			})
		);
		expect(
			paperSittingAttemptId({
				userId: user.uid,
				sessionId: 'sitting-1',
				paperSlug: 'aqa-biology-paper-1',
				questionId: 'question-01-1'
			})
		).toBe(attemptId);
	});

	it('reports every personal persistence failure so the sitting remains retryable', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mocks.recordQuestionAttempt.mockRejectedValue(new Error('Personal D1 unavailable'));

		await expect(
			persistPaperSittingGradeResponse({
				user,
				answers: { '01.1': 'A typed answer', '01.2': '', '01.3': '' },
				response: responseFixture(),
				authorization
			})
		).resolves.toEqual({ saved: 0, skipped: 0, failed: 3 });
		expect(mocks.recordQuestionAttemptEvidence).not.toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it('reuses the same canonical Personal identities after a partial persistence failure', async () => {
		const response = responseFixture();
		response.results = [response.results[0]];
		response.totals = { awardedMarks: 2, maxMarks: 3, gradeableMarks: 3, ungradedMarks: 0 };
		const singlePartAuthorization = {
			...authorization,
			partRefs: ['01.1'],
			responseDurationsMs: { '01.1': authorization.responseDurationsMs['01.1'] }
		};
		const seenAttemptIds = new Set<string>();
		mocks.recordQuestionAttempt.mockImplementation(async ({ attemptId: id }) => {
			seenAttemptIds.add(id);
			return { id, activeGaps: [], recallPrompt: null };
		});
		mocks.recordQuestionAttemptEvidence.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

		const input = {
			user,
			answers: { '01.1': 'A typed answer' },
			response,
			authorization: singlePartAuthorization
		};
		await expect(persistPaperSittingGradeResponse(input)).resolves.toEqual({
			saved: 0,
			skipped: 0,
			failed: 1
		});
		await expect(persistPaperSittingGradeResponse(input)).resolves.toEqual({
			saved: 1,
			skipped: 0,
			failed: 0
		});

		const expectedAttemptId = paperSittingAttemptId({
			userId: user.uid,
			sessionId: authorization.sessionId,
			paperSlug: authorization.paperSlug,
			questionId: response.results[0].questionId
		});
		expect(seenAttemptIds).toEqual(new Set([expectedAttemptId]));
		expect(mocks.recordQuestionAttempt).toHaveBeenCalledTimes(2);
		expect(mocks.recordQuestionAttemptEvidence).toHaveBeenCalledTimes(2);
		expect(mocks.recordQuestionAttemptEvidence).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ attemptId: expectedAttemptId })
		);
		expect(mocks.recordQuestionAttemptEvidence).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ attemptId: expectedAttemptId })
		);
	});

	it('skips an explicit zero-mark instruction row while preserving all evidence-bearing parts', async () => {
		mocks.recordQuestionAttempt.mockImplementation(async ({ attemptId: id }) => ({
			id,
			activeGaps: [],
			recallPrompt: null
		}));
		const response = responseFixture();
		response.results.unshift({
			...response.results[1],
			questionId: 'question-instruction',
			ref: '01.0',
			maxMarks: 0,
			gradeableMarks: 0
		});

		await expect(
			persistPaperSittingGradeResponse({
				user,
				answers: { '01.0': '', '01.1': 'A typed answer', '01.2': '', '01.3': '' },
				response,
				authorization: {
					...authorization,
					partRefs: ['01.0', ...authorization.partRefs],
					responseDurationsMs: { '01.0': 0, ...authorization.responseDurationsMs }
				}
			})
		).resolves.toEqual({ saved: 3, skipped: 1, failed: 0 });
		expect(mocks.recordQuestionAttempt).toHaveBeenCalledTimes(3);
	});

	it('fails closed when the graded payload does not match the approved question inventory', async () => {
		await expect(
			persistPaperSittingGradeResponse({
				user,
				answers: { '01.1': 'A typed answer' },
				response: responseFixture(),
				authorization
			})
		).rejects.toThrow('exact server-authorized question inventory');
		expect(mocks.recordQuestionAttempt).not.toHaveBeenCalled();
		expect(mocks.recordQuestionAttemptEvidence).not.toHaveBeenCalled();
	});

	it('rejects an authorization bound to another user before any independent write', async () => {
		await expect(
			persistPaperSittingGradeResponse({
				user,
				answers: { '01.1': 'A typed answer', '01.2': '', '01.3': '' },
				response: responseFixture(),
				authorization: { ...authorization, userId: 'learner-2' }
			})
		).rejects.toThrow('exact server-authorized question inventory');
		expect(mocks.recordQuestionAttempt).not.toHaveBeenCalled();
		expect(mocks.recordQuestionAttemptEvidence).not.toHaveBeenCalled();
	});
});
