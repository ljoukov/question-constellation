import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecallCard } from '$lib/recall/aqaScienceRecall';

const mocks = vi.hoisted(() => ({
	getRecallCatalogScopeForLearner: vi.fn(),
	getRecallReviewSnapshot: vi.fn(),
	isRecallTopicWithinLearnerScope: vi.fn(),
	recallCardsWithinLearnerScope: vi.fn(),
	defaultRecallCatalogScope: vi.fn(),
	getRecallCards: vi.fn(),
	recordRecallCoverageMisses: vi.fn()
}));

vi.mock('$lib/server/subjectLearning', () => ({
	getRecallCatalogScopeForLearner: mocks.getRecallCatalogScopeForLearner,
	getRecallReviewSnapshot: mocks.getRecallReviewSnapshot,
	isRecallTopicWithinLearnerScope: mocks.isRecallTopicWithinLearnerScope,
	recallCardsWithinLearnerScope: mocks.recallCardsWithinLearnerScope
}));

vi.mock('$lib/server/recallCatalog', () => ({
	defaultRecallCatalogScope: mocks.defaultRecallCatalogScope,
	getRecallCards: mocks.getRecallCards
}));

vi.mock('$lib/server/recallCoverageShadow', () => ({
	recordRecallCoverageMisses: mocks.recordRecallCoverageMisses
}));

import { load } from './+page.server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Learner',
	photoUrl: null
};

function card(id: string): RecallCard {
	return {
		id,
		board: 'AQA',
		qualification: 'GCSE',
		subject: 'Biology',
		topicId: 'biology-cell-biology',
		specRef: '4.1.1',
		kind: 'fact',
		visualCue: '🔬',
		front: `Question ${id}`,
		back: `Answer ${id}`,
		distractors: [`Wrong ${id}`],
		choiceKeys: { [`Answer ${id}`]: 'correct', [`Wrong ${id}`]: 'wrong' },
		sourceUrl: 'https://example.test/specification',
		sourceTitle: 'Official specification',
		offeringId: 'offering-1',
		curriculumComponentId: `component-${id}`,
		topicComponentId: 'topic-1',
		contentRevision: 1,
		contentHash: id.repeat(64).slice(0, 64)
	};
}

async function loadRecall(
	platform?: { ctx: { waitUntil: (promise: Promise<unknown>) => void } },
	activeUser: typeof user | null = user,
	url = 'https://constellation.eviworld.com/recall?start=1&subject=Biology&topic=biology-cell-biology&activity=mcq'
) {
	const result = await load({
		locals: { user: activeUser },
		url: new URL(url),
		platform
	} as unknown as Parameters<typeof load>[0]);
	if (!result) throw new Error('Expected recall page data.');
	return result;
}

beforeEach(() => {
	for (const mock of Object.values(mocks)) mock.mockReset();
	mocks.getRecallCatalogScopeForLearner.mockResolvedValue({
		subject: 'Biology',
		offeringId: 'offering-1'
	});
	mocks.defaultRecallCatalogScope.mockReturnValue({
		subject: 'Biology',
		offeringId: 'aqa-gcse-biology-8461-v1.0:higher'
	});
	mocks.isRecallTopicWithinLearnerScope.mockResolvedValue(true);
	const cards = [card('a'), card('b')];
	mocks.getRecallCards.mockResolvedValue(cards);
	mocks.recallCardsWithinLearnerScope.mockResolvedValue(cards);
	mocks.getRecallReviewSnapshot.mockResolvedValue([]);
	mocks.recordRecallCoverageMisses.mockResolvedValue(0);
});

describe('anonymous recall page load', () => {
	it('opens the same public catalog advertised by the activity page', async () => {
		const result = await loadRecall(undefined, null);

		expect(mocks.defaultRecallCatalogScope).toHaveBeenCalledWith('Biology');
		expect(mocks.getRecallCards).toHaveBeenCalledWith({
			subject: 'Biology',
			offeringId: 'aqa-gcse-biology-8461-v1.0:higher'
		});
		expect(result.cards.map((item: RecallCard) => item.id)).toEqual(['a', 'b']);
		expect(result.user).toBeNull();
	});
});

describe('signed-in recall page load', () => {
	it('opens the aggregate quick-start stack inside the learner curriculum scope', async () => {
		const result = await loadRecall(
			undefined,
			user,
			'https://constellation.eviworld.com/recall?start=1&subject=Biology&topic=all&mode=mixed'
		);

		expect(mocks.recallCardsWithinLearnerScope).toHaveBeenCalledWith(
			user.uid,
			'Biology',
			expect.arrayContaining([
				expect.objectContaining({ id: 'a' }),
				expect.objectContaining({ id: 'b' })
			])
		);
		expect(mocks.isRecallTopicWithinLearnerScope).not.toHaveBeenCalled();
		expect(result.cards.map((item: RecallCard) => item.id)).toEqual(['a', 'b']);
		expect(result.initialTopic).toBe('all');
	});

	it('preserves canonical order when private progress is unavailable', async () => {
		mocks.getRecallReviewSnapshot.mockRejectedValue(new Error('personal D1 unavailable'));

		const result = await loadRecall();

		expect(result.cards.map((item: RecallCard) => item.id)).toEqual(['a', 'b']);
		expect(result.serverProgress).toEqual([]);
	});

	it('keeps canonical recall available when shadow telemetry fails', async () => {
		mocks.recordRecallCoverageMisses.mockRejectedValue(new Error('shadow write failed'));

		const result = await loadRecall();

		expect(result.cards.map((item: RecallCard) => item.id)).toEqual(['a', 'b']);
		expect(mocks.recordRecallCoverageMisses).toHaveBeenCalledWith({
			user,
			subject: 'Biology',
			canonicalCards: expect.arrayContaining([
				expect.objectContaining({ id: 'a' }),
				expect.objectContaining({ id: 'b' })
			])
		});
	});

	it('delegates the private shadow observation to the Cloudflare request lifetime', async () => {
		const waitUntil = vi.fn();

		await loadRecall({ ctx: { waitUntil } });

		expect(waitUntil).toHaveBeenCalledTimes(1);
		expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
	});
});
