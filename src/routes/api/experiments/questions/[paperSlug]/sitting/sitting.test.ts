import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	start: vi.fn(),
	resume: vi.fn(),
	save: vi.fn(),
	submit: vi.fn()
}));

vi.mock('$lib/server/paperSittingSession', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/paperSittingSession')>()),
	startPaperSittingSession: mocks.start,
	resumePaperSittingSession: mocks.resume,
	savePaperSittingDraft: mocks.save,
	submitPaperSittingSession: mocks.submit
}));

import { PaperSittingSessionError } from '$lib/server/paperSittingSession';
import { POST } from './+server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

const sessionId = 'ps_1234567890123456789012345678901234567890';
const nonce = 'pn_1234567890123456789012345678901234567890';

async function post(body: Record<string, unknown>, authenticated = true) {
	return POST({
		locals: { user: authenticated ? user : null },
		params: { paperSlug: 'approved-paper' },
		request: new Request('http://localhost/api/experiments/questions/approved-paper/sitting', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.start.mockResolvedValue({
		sessionId,
		nonce,
		status: 'in_progress',
		startedAtMs: 1_000,
		submittedAtMs: null,
		completedAtMs: null,
		reviewedAt: '2026-07-16T10:00:00.000Z',
		nextQuestionRef: '01',
		gradedQuestionRefs: [],
		results: {}
	});
});

describe('paper sitting lifecycle endpoint', () => {
	it('requires authentication before creating server state', async () => {
		const response = await post({ action: 'start' }, false);
		expect(response.status).toBe(401);
		expect(mocks.start).not.toHaveBeenCalled();
	});

	it('starts against the authenticated user and route paper only', async () => {
		const response = await post({ action: 'start' });
		expect(response.status).toBe(201);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(mocks.start).toHaveBeenCalledWith({
			userId: user.uid,
			paperSlug: 'approved-paper'
		});
		expect(await response.json()).toMatchObject({ sessionId, nonce, status: 'in_progress' });
	});

	it('does not accept client-provided identity or timing on start', async () => {
		const response = await post({ action: 'start', sessionId, startedAtMs: 1 });
		expect(response.status).toBe(400);
		expect(mocks.start).not.toHaveBeenCalled();
	});

	it('autosaves a revisioned answer snapshot without accepting client timing', async () => {
		mocks.save.mockResolvedValue({ status: 'in_progress', draftRevision: 1 });
		const response = await post({
			action: 'save',
			sessionId,
			nonce,
			draftRevision: 1,
			answers: { '01.1': 'Typed answer' },
			activePartRef: '01.1'
		});

		expect(response.status).toBe(200);
		expect(mocks.save).toHaveBeenCalledWith({
			userId: user.uid,
			paperSlug: 'approved-paper',
			sessionId,
			nonce,
			draftRevision: 1,
			answers: { '01.1': 'Typed answer' },
			activePartRef: '01.1'
		});
	});

	it('submits only the server-owned draft and rejects fabricated client duration fields', async () => {
		mocks.submit.mockResolvedValue({ status: 'submitted' });
		const response = await post({
			action: 'submit',
			sessionId,
			nonce
		});

		expect(response.status).toBe(200);
		expect(mocks.submit).toHaveBeenCalledWith({
			userId: user.uid,
			paperSlug: 'approved-paper',
			sessionId,
			nonce
		});

		const spoofed = await post({
			action: 'submit',
			sessionId,
			nonce,
			responseDurationsMs: { '01.1': 1 }
		});
		expect(spoofed.status).toBe(400);
		expect(mocks.submit).toHaveBeenCalledTimes(1);
	});

	it('maps stale reviews and unavailable papers to a stable 409', async () => {
		mocks.resume.mockRejectedValue(new PaperSittingSessionError('session_review_stale'));
		const response = await post({ action: 'resume', sessionId, nonce });
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			error: 'paper_sitting_unavailable',
			reason: 'session_review_stale'
		});
	});
});
