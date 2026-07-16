import { describe, expect, it } from 'vitest';
import { recallCardContentKey, recallCardContentMatches } from './contentIdentity';

describe('recall card content identity', () => {
	it('changes when either the revision or immutable content hash changes', () => {
		expect(
			recallCardContentKey({ id: 'card-1', contentRevision: 4, contentHash: 'hash-a' })
		).toBe('card-1@4:hash-a');
		expect(
			recallCardContentKey({ id: 'card-1', contentRevision: 5, contentHash: 'hash-b' })
		).not.toBe('card-1@4:hash-a');
	});

	it('requires both the current revision and current hash', () => {
		const card = { id: 'card-1', contentRevision: 4, contentHash: 'hash-a' };
		expect(recallCardContentMatches(card, { contentRevision: 4, contentHash: 'hash-a' })).toBe(
			true
		);
		expect(recallCardContentMatches(card, { contentRevision: 3, contentHash: 'hash-a' })).toBe(
			false
		);
		expect(recallCardContentMatches(card, { contentRevision: 4, contentHash: 'hash-b' })).toBe(
			false
		);
	});
});
