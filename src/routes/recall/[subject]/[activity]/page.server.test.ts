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

function card(id: string, overrides: Partial<RecallCard> = {}): RecallCard {
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
		contentHash: id.repeat(64).slice(0, 64),
		...overrides
	};
}

async function loadRecall(
	platform?: { ctx: { waitUntil: (promise: Promise<unknown>) => void } },
	activeUser: typeof user | null = user,
	url = 'https://constellation.eviworld.com/recall/biology/multiple-choice?topic=biology-cell-biology'
) {
	const parsedUrl = new URL(url);
	const [, , subject, activity] = parsedUrl.pathname.split('/');
	const result = await load({
		locals: { user: activeUser },
		params: { subject, activity },
		url: parsedUrl,
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

	it('opens a non-science public deck with its exact board and topic metadata', async () => {
		const historyCard = card('h', {
			board: 'AQA',
			subject: 'History',
			topicId: 'aqa-history-germany',
			topicTitle: 'Germany, 1890–1945',
			topicPaper: 'Paper 1',
			topicComponentId: 'aqa-history-germany',
			offeringId: 'aqa-gcse-history-8145-v1.3:higher',
			kind: 'chronology',
			visualCue: '🏛️'
		});
		mocks.defaultRecallCatalogScope.mockReturnValue({
			subject: 'History',
			offeringId: historyCard.offeringId
		});
		mocks.getRecallCards.mockResolvedValue([historyCard]);

		const result = await loadRecall(
			undefined,
			null,
			'https://constellation.eviworld.com/recall/history/true-or-false?topic=aqa-history-germany'
		);

		expect(mocks.defaultRecallCatalogScope).toHaveBeenCalledWith('History');
		expect(result.cards).toEqual([historyCard]);
		expect(result.initialActivity).toBe('true-false');
		expect(result.initialMode).toBe('truefalse');
		expect(result.topics).toEqual([
			expect.objectContaining({
				id: 'aqa-history-germany',
				subject: 'History',
				title: 'Germany, 1890–1945',
				paper: 'Paper 1'
			})
		]);
	});
});

describe('signed-in recall page load', () => {
	it('uses an OCR Literature learner offering and preserves true-or-false mode', async () => {
		const literatureCard = card('l', {
			board: 'OCR',
			subject: 'English Literature',
			topicId: 'ocr-j352-macbeth',
			topicTitle: 'Macbeth',
			topicPaper: 'Component 01',
			topicComponentId: 'ocr-j352-macbeth',
			offeringId: 'ocr-gcse-english-literature-j352-v3.0:higher',
			kind: 'quotation',
			visualCue: '📖'
		});
		mocks.getRecallCatalogScopeForLearner.mockResolvedValue({
			subject: 'English Literature',
			offeringId: literatureCard.offeringId
		});
		mocks.getRecallCards.mockResolvedValue([literatureCard]);
		mocks.recallCardsWithinLearnerScope.mockResolvedValue([literatureCard]);

		const result = await loadRecall(
			undefined,
			user,
			'https://constellation.eviworld.com/recall/english-literature/true-or-false?topic=ocr-j352-macbeth'
		);

		expect(mocks.getRecallCatalogScopeForLearner).toHaveBeenCalledWith(user, 'English Literature');
		expect(mocks.recallCardsWithinLearnerScope).toHaveBeenCalledWith(user, 'English Literature', [
			literatureCard
		]);
		expect(result.initialActivity).toBe('true-false');
		expect(result.initialMode).toBe('truefalse');
		expect(result.subjects).toContain('English Literature');
		expect(result.subjects).not.toContain('All subjects');
	});

	it('opens the aggregate quick-start stack inside the learner curriculum scope', async () => {
		const result = await loadRecall(
			undefined,
			user,
			'https://constellation.eviworld.com/recall/biology/quick'
		);

		expect(mocks.recallCardsWithinLearnerScope).toHaveBeenCalledWith(
			user,
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
