import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getEnglishLiteratureSubjectHub: vi.fn(),
	getRecallCards: vi.fn(),
	getRecallCatalogScopeForLearner: vi.fn(),
	recallCardsWithinLearnerScope: vi.fn()
}));

vi.mock('$lib/server/englishLiteratureSubjectHub', () => ({
	getEnglishLiteratureSubjectHub: mocks.getEnglishLiteratureSubjectHub
}));

vi.mock('$lib/server/recallCatalog', () => ({
	getRecallCards: mocks.getRecallCards
}));

vi.mock('$lib/server/subjectLearning', () => ({
	getRecallCatalogScopeForLearner: mocks.getRecallCatalogScopeForLearner,
	recallCardsWithinLearnerScope: mocks.recallCardsWithinLearnerScope
}));

import { load } from './+page.server';

const user = {
	uid: 'learner-1',
	email: 'learner-1@example.test',
	name: 'Ada Learner',
	photoUrl: null
};

function recallCard({
	id,
	subject,
	topicId,
	topicTitle
}: {
	id: string;
	subject: 'Biology' | 'English Literature';
	topicId: string;
	topicTitle: string;
}) {
	return {
		id,
		subject,
		topicId,
		topicTitle,
		topicComponentId: topicId,
		specRef: topicId,
		topicPaper: 'GCSE'
	};
}

function parentWithSubject(subject: Record<string, unknown>) {
	return vi.fn().mockResolvedValue({
		homeSnapshot: {
			challengeProgress: { version: 2, challenges: {} },
			subjectViews: [subject]
		},
		homeSnapshotShouldRefresh: false
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getRecallCatalogScopeForLearner.mockResolvedValue({
		subject: 'Biology',
		offeringId: 'biology-higher'
	});
	mocks.getRecallCards.mockResolvedValue([]);
	mocks.recallCardsWithinLearnerScope.mockResolvedValue([]);
	mocks.getEnglishLiteratureSubjectHub.mockResolvedValue({ sections: [] });
});

describe('signed-in subject recall deck summary', () => {
	it('summarises every card in the learner-scoped deck by topic', async () => {
		const subject = {
			subject: 'Biology',
			board: 'AQA',
			scope: { status: 'all' },
			nextAction: { href: '/recall/biology/quick' },
			alternatives: []
		};
		const catalogCards = [
			recallCard({
				id: 'cell-1',
				subject: 'Biology',
				topicId: 'cells',
				topicTitle: 'Cell biology'
			}),
			recallCard({
				id: 'cell-2',
				subject: 'Biology',
				topicId: 'cells',
				topicTitle: 'Cell biology'
			}),
			recallCard({
				id: 'organisation-1',
				subject: 'Biology',
				topicId: 'organisation',
				topicTitle: 'Organisation'
			})
		];
		mocks.getRecallCards.mockResolvedValue(catalogCards);
		mocks.recallCardsWithinLearnerScope.mockResolvedValue(catalogCards);

		const result = await load({
			locals: { user },
			params: { subject: 'biology' },
			url: new URL('http://localhost/subjects/biology'),
			parent: parentWithSubject(subject)
		} as never);

		expect(result).toMatchObject({
			recallDeck: {
				subject: 'Biology',
				totalCardCount: 3,
				topics: [
					{ id: 'cells', title: 'Cell biology', cardCount: 2 },
					{ id: 'organisation', title: 'Organisation', cardCount: 1 }
				]
			}
		});
		expect(mocks.getRecallCatalogScopeForLearner).toHaveBeenCalledWith(user, 'Biology');
		expect(mocks.getRecallCards).toHaveBeenCalledWith({
			subject: 'Biology',
			offeringId: 'biology-higher'
		});
		expect(mocks.recallCardsWithinLearnerScope).toHaveBeenCalledWith(user, 'Biology', catalogCards);
	});

	it('uses the same exact-scope path for English Literature', async () => {
		const subject = {
			subject: 'English Literature',
			board: 'OCR',
			scope: { status: 'all' },
			nextAction: { href: '/subjects/english-literature' },
			alternatives: []
		};
		const catalogScope = {
			subject: 'English Literature',
			offeringId: 'ocr-english-literature'
		};
		const selectedTextCards = [
			recallCard({
				id: 'macbeth-1',
				subject: 'English Literature',
				topicId: 'macbeth',
				topicTitle: 'Macbeth'
			})
		];
		mocks.getRecallCatalogScopeForLearner.mockResolvedValue(catalogScope);
		mocks.getRecallCards.mockResolvedValue([
			...selectedTextCards,
			recallCard({
				id: 'hamlet-1',
				subject: 'English Literature',
				topicId: 'hamlet',
				topicTitle: 'Hamlet'
			})
		]);
		mocks.recallCardsWithinLearnerScope.mockResolvedValue(selectedTextCards);

		const result = await load({
			locals: { user },
			params: { subject: 'english-literature' },
			url: new URL('http://localhost/subjects/english-literature'),
			parent: parentWithSubject(subject)
		} as never);

		expect(result).toMatchObject({
			recallDeck: {
				subject: 'English Literature',
				totalCardCount: 1,
				topics: [{ id: 'macbeth', title: 'Macbeth', cardCount: 1 }]
			}
		});
		expect(mocks.getRecallCatalogScopeForLearner).toHaveBeenCalledWith(user, 'English Literature');
		expect(mocks.recallCardsWithinLearnerScope).toHaveBeenCalledWith(
			user,
			'English Literature',
			expect.any(Array)
		);
	});

	it('keeps the subject hub available when the recall catalog read fails', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		mocks.getRecallCatalogScopeForLearner.mockRejectedValue(new Error('catalog unavailable'));
		const subject = {
			subject: 'Biology',
			board: 'AQA',
			scope: { status: 'all' },
			nextAction: { href: '/questions?subject=Biology' },
			alternatives: []
		};

		const result = await load({
			locals: { user },
			params: { subject: 'biology' },
			url: new URL('http://localhost/subjects/biology'),
			parent: parentWithSubject(subject)
		} as never);

		expect(result).toMatchObject({ subject, recallDeck: null });
		expect(warn).toHaveBeenCalledWith(
			'[subject hub] recall deck unavailable',
			expect.objectContaining({ subject: 'Biology' })
		);
		warn.mockRestore();
	});
});
