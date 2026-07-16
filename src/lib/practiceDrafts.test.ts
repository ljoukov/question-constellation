import { describe, expect, it } from 'vitest';
import {
	MAX_PRACTICE_DRAFT_PAYLOAD_CHARS,
	practiceDraftBatchWithinSyncLimit,
	practiceDraftPayloadWithinSyncLimit
} from './practiceDrafts';

describe('practice draft sync limits', () => {
	it('accepts a completed five-stage English draft larger than the old 30 KB limit', () => {
		expect(practiceDraftPayloadWithinSyncLimit({ state: 'x'.repeat(36_196) })).toBe(true);
	});

	it('still rejects an unbounded individual payload', () => {
		expect(
			practiceDraftPayloadWithinSyncLimit({
				state: 'x'.repeat(MAX_PRACTICE_DRAFT_PAYLOAD_CHARS + 1)
			})
		).toBe(false);
	});

	it('keeps the existing aggregate request budget', () => {
		const drafts = Array.from({ length: 20 }, () => ({ payload: { state: 'x'.repeat(79_000) } }));
		expect(practiceDraftBatchWithinSyncLimit(drafts)).toBe(false);
	});
});
