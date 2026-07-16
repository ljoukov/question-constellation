import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getRecallCardForLearner: vi.fn(),
	getRecallReviewEvidenceReceipt: vi.fn(),
	isRecallCardWithinLearnerScope: vi.fn(),
	recordRecallReviewEvidence: vi.fn(),
	recordRecallCardReview: vi.fn()
}));

vi.mock('$lib/server/subjectLearning', () => ({
	getRecallCardForLearner: mocks.getRecallCardForLearner,
	getRecallReviewEvidenceReceipt: mocks.getRecallReviewEvidenceReceipt,
	isRecallCardWithinLearnerScope: mocks.isRecallCardWithinLearnerScope,
	recordRecallReviewEvidence: mocks.recordRecallReviewEvidence
}));

vi.mock('$lib/server/personalLearning', () => ({
	recordRecallCardReview: mocks.recordRecallCardReview
}));

import { POST } from './+server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

const currentCard = {
	id: 'card-1',
	subject: 'Biology',
	topicId: 'biology-cell-biology',
	back: 'Nucleus',
	choiceKeys: {
		Nucleus: 'correct',
		Cytoplasm: 'confuses-cell-location'
	},
	choiceMisconceptions: {
		Cytoplasm: 'Confuses where genetic material is enclosed.'
	},
	contentRevision: 4,
	contentHash: 'current-content-hash'
};

function requestBody(overrides: Record<string, unknown> = {}) {
	return {
		reviewId: 'review-1',
		cardId: currentCard.id,
		contentRevision: currentCard.contentRevision,
		contentHash: currentCard.contentHash,
		grade: 'good',
		mode: 'recall',
		selectedChoiceKey: null,
		sourceSessionId: 'session-1',
		responseDurationMs: 3_000,
		createdAt: Date.UTC(2026, 6, 15),
		...overrides
	};
}

async function post(body: Record<string, unknown>) {
	return await POST({
		locals: { user },
		request: new Request('https://constellation.eviworld.com/api/recall/review', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as unknown as Parameters<typeof POST>[0]);
}

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.getRecallCardForLearner.mockResolvedValue(currentCard);
	mocks.isRecallCardWithinLearnerScope.mockResolvedValue(true);
	mocks.getRecallReviewEvidenceReceipt.mockResolvedValue(null);
	mocks.recordRecallReviewEvidence.mockResolvedValue(undefined);
	mocks.recordRecallCardReview.mockResolvedValue({
		status: 'ok',
		dueAt: '2026-07-16 00:00:00',
		intervalDays: 1
	});
});

describe('POST /api/recall/review', () => {
	it('derives the learner partition only from the authenticated session', async () => {
		const response = await post(requestBody({ userId: 'learner-2' }));

		expect(response.status).toBe(200);
		expect(mocks.getRecallCardForLearner).toHaveBeenCalledWith(user, currentCard.id);
		expect(mocks.getRecallReviewEvidenceReceipt).toHaveBeenCalledWith(user.uid, 'review-1');
		expect(mocks.recordRecallReviewEvidence).toHaveBeenCalledWith(
			expect.objectContaining({ user })
		);
	});

	it('requires the immutable card content identity', async () => {
		const body = requestBody();
		delete (body as Partial<typeof body>).contentHash;

		const response = await post(body);
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'invalid_body' });
		expect(mocks.getRecallCardForLearner).not.toHaveBeenCalled();
	});

	it('explicitly rejects a queued review for revised content before any evidence write', async () => {
		const response = await post(requestBody({ contentRevision: 3, contentHash: 'old-hash' }));

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: 'stale_recall_card' });
		expect(mocks.recordRecallReviewEvidence).not.toHaveBeenCalled();
		expect(mocks.recordRecallCardReview).not.toHaveBeenCalled();
	});

	it('writes only the current card revision and hash', async () => {
		const response = await post(requestBody());

		expect(response.status).toBe(200);
		expect(mocks.recordRecallReviewEvidence).toHaveBeenCalledWith(
			expect.objectContaining({
				card: currentCard,
				reviewId: 'review-1',
				grade: 'good',
				selectedChoice: null
			})
		);
		expect(mocks.recordRecallCardReview).toHaveBeenCalledWith(
			expect.objectContaining({ card: currentCard, grade: 'good' })
		);
	});

	it('resolves a selected choice and misconception only from canonical card data', async () => {
		const response = await post(
			requestBody({
				grade: 'again',
				mode: 'recognise',
				selectedChoiceKey: 'confuses-cell-location',
				selectedChoiceMisconception: 'Client supplied text must be ignored.'
			})
		);

		expect(response.status).toBe(200);
		expect(mocks.recordRecallReviewEvidence).toHaveBeenCalledWith(
			expect.objectContaining({
				selectedChoice: {
					key: 'confuses-cell-location',
					text: 'Cytoplasm',
					isCorrect: false,
					misconception: 'Confuses where genetic material is enclosed.'
				}
			})
		);
	});

	it('rejects a spoofed or cross-card choice key before writing evidence', async () => {
		const response = await post(
			requestBody({ grade: 'again', mode: 'recognise', selectedChoiceKey: 'other-card-choice' })
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'invalid_selected_choice' });
		expect(mocks.recordRecallReviewEvidence).not.toHaveBeenCalled();
		expect(mocks.recordRecallCardReview).not.toHaveBeenCalled();
	});

	it('does not allow a wrong canonical choice to be submitted as remembered', async () => {
		const response = await post(
			requestBody({ mode: 'recognise', selectedChoiceKey: 'confuses-cell-location' })
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'inconsistent_review' });
		expect(mocks.recordRecallReviewEvidence).not.toHaveBeenCalled();
	});

	it('replays an identical offline review idempotently for the authenticated learner', async () => {
		mocks.getRecallReviewEvidenceReceipt.mockResolvedValue({
			cardId: currentCard.id,
			contentRevision: currentCard.contentRevision,
			contentHash: currentCard.contentHash,
			grade: 'again',
			mode: 'recognise',
			selectedChoiceKey: 'confuses-cell-location',
			sourceSessionId: 'session-1',
			responseDurationMs: 3_000,
			createdAt: Date.UTC(2026, 6, 15)
		});
		const response = await post(
			requestBody({
				grade: 'again',
				mode: 'recognise',
				selectedChoiceKey: 'confuses-cell-location'
			})
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ duplicate: true });
		expect(mocks.getRecallReviewEvidenceReceipt).toHaveBeenCalledWith(user.uid, 'review-1');
	});

	it('rejects a reused review id with a different choice without exposing the stored choice', async () => {
		mocks.getRecallReviewEvidenceReceipt.mockResolvedValue({
			cardId: currentCard.id,
			contentRevision: currentCard.contentRevision,
			contentHash: currentCard.contentHash,
			grade: 'again',
			mode: 'recognise',
			selectedChoiceKey: 'correct',
			sourceSessionId: 'session-1',
			responseDurationMs: 3_000,
			createdAt: Date.UTC(2026, 6, 15)
		});
		const response = await post(
			requestBody({
				grade: 'again',
				mode: 'recognise',
				selectedChoiceKey: 'confuses-cell-location'
			})
		);

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: 'review_id_conflict' });
		expect(mocks.recordRecallReviewEvidence).not.toHaveBeenCalled();
	});
});
