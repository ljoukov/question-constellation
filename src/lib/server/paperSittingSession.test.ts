import { describe, expect, it } from 'vitest';
import type { ExperimentGradeResponse } from '$lib/experiments/questions/gradingTypes';
import {
	createPaperSittingSessionService,
	PaperSittingSessionError,
	type ApprovedPaperSittingManifest,
	type PaperSittingSessionRecord,
	type PaperSittingSessionStore
} from './paperSittingSession';

function clone<T>(value: T): T {
	return structuredClone(value);
}

class MemoryStore implements PaperSittingSessionStore {
	records = new Map<string, PaperSittingSessionRecord>();

	async insert(record: PaperSittingSessionRecord) {
		if (this.records.has(record.id)) throw new Error('duplicate session');
		this.records.set(record.id, clone(record));
	}

	async get(id: string) {
		const record = this.records.get(id);
		return record ? clone(record) : null;
	}

	async compareAndSwap(id: string, expectedVersion: number, next: PaperSittingSessionRecord) {
		const current = this.records.get(id);
		if (!current || current.version !== expectedVersion) return false;
		this.records.set(id, clone(next));
		return true;
	}
}

function manifest(): ApprovedPaperSittingManifest {
	return {
		paperSlug: 'approved-paper',
		sourceDocumentId: 'source-approved-paper',
		reviewedAt: '2026-07-16T10:00:00.000Z',
		approvedContentFingerprint: `paper-sitting-content-v1:${'a'.repeat(64)}`,
		durationMinutes: 75,
		totalMarks: 4,
		questionGroups: [
			{ questionRef: '01', partRefs: ['01.1', '01.2'] },
			{ questionRef: '02', partRefs: ['02.1'] }
		]
	};
}

function gradeResponse(
	questionRef: '01' | '02',
	awardedMarks = questionRef === '01' ? 2 : 1
): ExperimentGradeResponse {
	const refs = questionRef === '01' ? ['01.1', '01.2'] : ['02.1'];
	return {
		status: 'ok',
		paperSlug: 'approved-paper',
		ref: questionRef,
		model: 'chatgpt-test',
		modelVersion: `test-${awardedMarks}`,
		totals: {
			awardedMarks,
			maxMarks: refs.length,
			gradeableMarks: refs.length,
			ungradedMarks: 0
		},
		results: refs.map((ref, index) => ({
			questionId: `question-${ref}`,
			ref,
			status: 'graded' as const,
			result: index < awardedMarks ? ('correct' as const) : ('incorrect' as const),
			awardedMarks: index < awardedMarks ? 1 : 0,
			maxMarks: 1,
			gradeableMarks: 1,
			confidence: 'high' as const,
			summary: index < awardedMarks ? 'Credited.' : 'Not credited.',
			nextStep: '',
			checklist: [],
			chain: null,
			modelAnswer: null,
			warnings: []
		}))
	};
}

function harness() {
	const store = new MemoryStore();
	let now = 1_000_000;
	let currentManifest = manifest();
	let reviewWithdrawn = false;
	let sequence = 0;
	const service = createPaperSittingSessionService({
		store,
		now: () => now,
		loadManifest: async () => {
			if (reviewWithdrawn) throw new PaperSittingSessionError('review_not_approved');
			return clone(currentManifest);
		},
		randomId: (prefix) => `${prefix}_${String(++sequence).padStart(40, '0')}`
	});
	return {
		store,
		service,
		advance(milliseconds: number) {
			now += milliseconds;
		},
		changeReview() {
			currentManifest = {
				...currentManifest,
				reviewedAt: '2026-07-16T11:00:00.000Z'
			};
		},
		changeApprovedContent() {
			currentManifest = {
				...currentManifest,
				approvedContentFingerprint: `paper-sitting-content-v1:${'b'.repeat(64)}`
			};
		},
		withdrawReview() {
			reviewWithdrawn = true;
		}
	};
}

function identity(started: { sessionId: string; nonce: string }) {
	return {
		userId: 'learner-1',
		paperSlug: 'approved-paper',
		sessionId: started.sessionId,
		nonce: started.nonce
	};
}

function fullAnswers() {
	return { '01.1': 'First answer', '01.2': '', '02.1': 'Second answer' };
}

async function saveFullDraft(
	service: ReturnType<typeof createPaperSittingSessionService>,
	started: { sessionId: string; nonce: string },
	draftRevision = 1,
	activePartRef: string | null = '01.1'
) {
	return service.saveDraft({
		...identity(started),
		draftRevision,
		answers: fullAnswers(),
		activePartRef
	});
}

async function expectCode(promise: Promise<unknown>, code: string) {
	await expect(promise).rejects.toMatchObject({
		name: 'PaperSittingSessionError',
		code
	});
}

describe('server-owned paper sitting sessions', () => {
	it('rejects direct spoofing, a wrong nonce, another user and another paper', async () => {
		const { service } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });

		await expectCode(
			service.resume({
				...identity(started),
				sessionId: 'ps_0000000000000000000000000000000000999999'
			}),
			'session_missing'
		);
		await expectCode(
			service.resume({ ...identity(started), nonce: 'x'.repeat(64) }),
			'session_nonce_mismatch'
		);
		await expectCode(
			service.resume({ ...identity(started), userId: 'learner-2' }),
			'session_mismatch'
		);
		await expectCode(
			service.resume({ ...identity(started), paperSlug: 'different-paper' }),
			'session_mismatch'
		);
	});

	it('binds the session to the exact approved review', async () => {
		const { service, changeReview } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		changeReview();

		await expectCode(service.resume(identity(started)), 'session_review_stale');
	});

	it('invalidates an old session when content is re-approved under the same reviewed timestamp', async () => {
		const { service, changeApprovedContent } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		changeApprovedContent();

		await expectCode(service.resume(identity(started)), 'session_review_stale');
	});

	it('rejects draft inventory drift and makes a committed submit retry idempotent', async () => {
		const { service, advance } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(1_000);

		await expectCode(
			service.saveDraft({
				...identity(started),
				draftRevision: 1,
				answers: { '01.1': 'Only one answer' },
				activePartRef: '01.1'
			}),
			'session_inventory_mismatch'
		);
		await expectCode(
			service.saveDraft({
				...identity(started),
				draftRevision: 1,
				answers: fullAnswers(),
				activePartRef: 'not-a-paper-part'
			}),
			'session_inventory_mismatch'
		);

		advance(39_000);
		const savedBeforeLostResponse = await saveFullDraft(service, started);
		await expect(saveFullDraft(service, started)).resolves.toEqual(savedBeforeLostResponse);
		const submitted = await service.submit(identity(started));
		expect(submitted).toMatchObject({
			status: 'submitted',
			nextQuestionRef: '01',
			answers: fullAnswers(),
			draftRevision: 1
		});
		await expect(service.submit(identity(started))).resolves.toEqual(submitted);
	});

	it('locks the last server draft at the approved deadline after a closed-tab resume', async () => {
		const { service, store, advance } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(30_000);
		await saveFullDraft(service, started);
		advance(24 * 60 * 60_000);

		await expect(service.resume(identity(started))).resolves.toMatchObject({
			status: 'submitted',
			answers: fullAnswers(),
			draftRevision: 1
		});
		const record = await store.get(started.sessionId);
		expect(record?.submittedAtMs).toBe(record!.startedAtMs + 75 * 60_000);
		expect(
			Object.values(record!.responseDurationsMs).reduce((sum, duration) => sum + duration, 0)
		).toBe(75 * 60_000);
	});

	it('derives per-part timing from server-side activation changes', async () => {
		const { service, store, advance } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(20_000);
		await saveFullDraft(service, started, 1, '01.2');
		advance(5_000);
		await saveFullDraft(service, started, 2, '02.1');
		advance(10_000);
		await service.submit(identity(started));

		expect((await store.get(started.sessionId))?.responseDurationsMs).toEqual({
			'01.1': 20_000,
			'01.2': 5_000,
			'02.1': 10_000
		});
	});

	it('keeps a newer autosave when an older revision arrives later', async () => {
		const { service, store, advance } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(1_000);
		const newest = { ...fullAnswers(), '01.1': 'Newest answer' };
		await service.saveDraft({
			...identity(started),
			draftRevision: 2,
			answers: newest,
			activePartRef: '01.2'
		});
		await service.saveDraft({
			...identity(started),
			draftRevision: 1,
			answers: { ...fullAnswers(), '01.1': 'Stale answer' },
			activePartRef: '01.1'
		});

		expect(await store.get(started.sessionId)).toMatchObject({
			draftRevision: 2,
			answers: newest,
			activePartRef: '01.2'
		});
		await expectCode(
			service.saveDraft({
				...identity(started),
				draftRevision: 2,
				answers: { ...newest, '01.1': 'Conflicting replay' },
				activePartRef: '01.2'
			}),
			'session_conflict'
		);
	});

	it('locks the existing server draft when a new save races the deadline', async () => {
		const { service, store, advance } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(75 * 60_000);

		const [save, resume] = await Promise.all([
			service.saveDraft({
				...identity(started),
				draftRevision: 1,
				answers: fullAnswers(),
				activePartRef: '02.1'
			}),
			service.resume(identity(started))
		]);

		expect(save.status).toBe('submitted');
		expect(resume.status).toBe('submitted');
		expect(await store.get(started.sessionId)).toMatchObject({
			status: 'submitted',
			draftRevision: 0,
			answers: { '01.1': '', '01.2': '', '02.1': '' }
		});
	});

	it('enforces question order and one live grading claim before any model work', async () => {
		const { service, advance } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(40_000);
		await saveFullDraft(service, started);
		await service.submit(identity(started));

		await expectCode(
			service.claimGrade({ ...identity(started), questionRef: '02' }),
			'question_out_of_order'
		);
		const first = await service.claimGrade({ ...identity(started), questionRef: '01' });
		expect(first).toMatchObject({
			kind: 'claimed',
			answers: { '01.1': 'First answer', '01.2': '' },
			reusedResponse: null
		});
		await expectCode(
			service.claimGrade({ ...identity(started), questionRef: '01' }),
			'session_busy'
		);
	});

	it('releases a failed claim for retry, then completes sequential grading normally', async () => {
		const { service, advance } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(40_000);
		await saveFullDraft(service, started);
		await service.submit(identity(started));

		const failedClaim = await service.claimGrade({ ...identity(started), questionRef: '01' });
		if (failedClaim.kind !== 'claimed') throw new Error('expected a live claim');
		await expect(
			service.releaseGradeClaim({
				sessionId: started.sessionId,
				claimId: failedClaim.authorization.claimId
			})
		).resolves.toBe(true);

		const retried = await service.claimGrade({ ...identity(started), questionRef: '01' });
		if (retried.kind !== 'claimed') throw new Error('expected a retry claim');
		const response01 = gradeResponse('01');
		await service.stageGrade({ authorization: retried.authorization, response: response01 });
		await service.completeGrade({
			authorization: retried.authorization,
			results: response01.results
		});

		const replay = await service.claimGrade({ ...identity(started), questionRef: '01' });
		expect(replay).toEqual({ kind: 'replay', response: response01 });

		const second = await service.claimGrade({ ...identity(started), questionRef: '02' });
		if (second.kind !== 'claimed') throw new Error('expected the second claim');
		const response02 = gradeResponse('02');
		await service.stageGrade({ authorization: second.authorization, response: response02 });
		await expect(
			service.completeGrade({ authorization: second.authorization, results: response02.results })
		).resolves.toMatchObject({
			status: 'complete',
			nextQuestionRef: null,
			gradedQuestionRefs: ['01', '02']
		});
	});

	it('reuses a staged grade after a timeout and refuses a different second model result', async () => {
		const { service, advance } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(40_000);
		await saveFullDraft(service, started);
		await service.submit(identity(started));

		const first = await service.claimGrade({ ...identity(started), questionRef: '01' });
		if (first.kind !== 'claimed') throw new Error('expected a live claim');
		const original = gradeResponse('01', 2);
		await service.stageGrade({ authorization: first.authorization, response: original });
		await service.releaseGradeClaim({
			sessionId: started.sessionId,
			claimId: first.authorization.claimId
		});

		const retry = await service.claimGrade({ ...identity(started), questionRef: '01' });
		if (retry.kind !== 'claimed') throw new Error('expected a retry claim');
		expect(retry.reusedResponse).toEqual(original);
		await expectCode(
			service.stageGrade({
				authorization: retry.authorization,
				response: gradeResponse('01', 0)
			}),
			'session_replay'
		);
		await service.stageGrade({ authorization: retry.authorization, response: original });
		await expect(
			service.completeGrade({ authorization: retry.authorization, results: original.results })
		).resolves.toMatchObject({ gradedQuestionRefs: ['01'] });
	});

	it('requires the live approval for the first stage commit', async () => {
		const { service, advance, withdrawReview } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(40_000);
		await saveFullDraft(service, started);
		await service.submit(identity(started));
		const claim = await service.claimGrade({ ...identity(started), questionRef: '01' });
		if (claim.kind !== 'claimed') throw new Error('expected a live claim');
		withdrawReview();

		await expectCode(
			service.stageGrade({ authorization: claim.authorization, response: gradeResponse('01') }),
			'session_review_stale'
		);
	});

	it('retries an exact staged response after approval drift without another authorization commit', async () => {
		const { service, advance, changeApprovedContent } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(40_000);
		await saveFullDraft(service, started);
		await service.submit(identity(started));
		const first = await service.claimGrade({ ...identity(started), questionRef: '01' });
		if (first.kind !== 'claimed') throw new Error('expected a live claim');
		const response = gradeResponse('01');
		await service.stageGrade({ authorization: first.authorization, response });

		changeApprovedContent();
		await expect(service.resume(identity(started))).resolves.toMatchObject({
			status: 'grading',
			nextQuestionRef: '01'
		});
		const retry = await service.claimGrade({ ...identity(started), questionRef: '01' });
		if (retry.kind !== 'claimed') throw new Error('expected a retry claim');
		expect(retry.authorization.claimId).not.toBe(first.authorization.claimId);
		expect(retry.reusedResponse).toEqual(response);
		await expect(
			service.stageGrade({ authorization: retry.authorization, response })
		).resolves.toEqual(response);
		await expect(
			service.completeGrade({ authorization: retry.authorization, results: response.results })
		).resolves.toMatchObject({ gradedQuestionRefs: ['01'] });
		await expectCode(service.resume(identity(started)), 'session_review_stale');
	});

	it('rejects forged claim identity even when the grade response was durably staged', async () => {
		const { service, advance } = harness();
		const started = await service.start({ userId: 'learner-1', paperSlug: 'approved-paper' });
		advance(40_000);
		await saveFullDraft(service, started);
		await service.submit(identity(started));
		const claim = await service.claimGrade({ ...identity(started), questionRef: '01' });
		if (claim.kind !== 'claimed') throw new Error('expected a live claim');
		const response = gradeResponse('01');
		await service.stageGrade({ authorization: claim.authorization, response });

		await expectCode(
			service.completeGrade({
				authorization: {
					...claim.authorization,
					reviewedAt: '2026-07-16T12:00:00.000Z'
				},
				results: response.results
			}),
			'session_conflict'
		);
	});

	it('uses a typed error for unavailable papers so routes can return a stable 409', () => {
		expect(new PaperSittingSessionError('paper_unavailable')).toMatchObject({
			name: 'PaperSittingSessionError',
			code: 'paper_unavailable'
		});
	});
});
