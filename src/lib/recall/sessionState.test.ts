import { describe, expect, it } from 'vitest';
import {
	RECALL_SESSION_MAX_AGE_MS,
	readRecallSession,
	recallSessionStorageKey,
	type RecallSessionScope,
	type StoredRecallSession
} from './sessionState';

const scope: RecallSessionScope = {
	subject: 'Biology',
	topic: 'cell-biology',
	kind: 'all',
	mode: 'mixed',
	stackSize: 5,
	search: '',
	returnTo: '/subjects/biology'
};

const cardContentKeys = ['card-1@1:hash-one', 'card-2@4:hash-two'];

function snapshot(overrides: Partial<StoredRecallSession> = {}): StoredRecallSession {
	return {
		version: 2,
		scope,
		cardContentKeys,
		cardIndex: 1,
		cardPositionInSession: 1,
		reviewedInSession: 1,
		rememberedInSession: 1,
		returningSoonerInSession: 0,
		revealed: false,
		selectedChoice: null,
		mcqFeedback: null,
		sessionId: 'recall-session-1',
		updatedAt: 10_000,
		...overrides
	};
}

describe('recall session persistence', () => {
	it('restores the exact active content identities and position', () => {
		const stored = snapshot({ revealed: true });
		expect(
			readRecallSession(JSON.stringify(stored), scope, new Set(stored.cardContentKeys), 11_000)
		).toMatchObject({
			cardContentKeys,
			cardIndex: 1,
			cardPositionInSession: 1,
			revealed: true,
			sessionId: 'recall-session-1'
		});
	});

	it('treats a checked MCQ as revealed when refresh interrupts its flip', () => {
		const stored = snapshot({
			revealed: false,
			selectedChoice: 'Mitochondria',
			mcqFeedback: 'correct'
		});
		expect(
			readRecallSession(JSON.stringify(stored), scope, new Set(stored.cardContentKeys), 11_000)
		).toMatchObject({ revealed: true, selectedChoice: 'Mitochondria', mcqFeedback: 'correct' });
	});

	it('rejects stale, mismatched, or no-longer-available sessions', () => {
		const stored = snapshot();
		expect(
			readRecallSession(
				JSON.stringify(stored),
				scope,
				new Set(stored.cardContentKeys),
				stored.updatedAt + RECALL_SESSION_MAX_AGE_MS + 1
			)
		).toBeNull();
		expect(
			readRecallSession(
				JSON.stringify(stored),
				{ ...scope, topic: 'infection-and-response' },
				new Set(stored.cardContentKeys),
				11_000
			)
		).toBeNull();
		expect(
			readRecallSession(JSON.stringify(stored), scope, new Set([cardContentKeys[0]]), 11_000)
		).toBeNull();
	});

	it('invalidates an active stack when a stable card id is revised', () => {
		const stored = snapshot({
			cardContentKeys: ['card-1@1:old-hash'],
			cardIndex: 0,
			cardPositionInSession: 0,
			reviewedInSession: 0,
			rememberedInSession: 0
		});
		expect(
			readRecallSession(
				JSON.stringify(stored),
				scope,
				new Set(['card-1@2:new-hash']),
				11_000
			)
		).toBeNull();
	});

	it('rejects legacy id-only snapshots', () => {
		const legacy = {
			...snapshot(),
			version: 1,
			cardIds: ['card-1', 'card-2'],
			cardContentKeys: undefined
		};
		expect(
			readRecallSession(JSON.stringify(legacy), scope, new Set(cardContentKeys), 11_000)
		).toBeNull();
	});

	it('scopes storage by learner identity without exposing it as a path segment', () => {
		expect(recallSessionStorageKey('student/name@example.test')).toBe(
			'question-constellation.recall-session.v2:student%2Fname%40example.test'
		);
	});
});
