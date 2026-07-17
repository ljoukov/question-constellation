import { describe, expect, it } from 'vitest';
import { signAnalyticsWorkflow, signaturesMatch } from './workflowAuth';

describe('analytics workflow authentication', () => {
	it('signs one summary id deterministically without accepting another', async () => {
		const secret = 'a-test-secret-that-is-at-least-thirty-two-bytes';
		const signature = await signAnalyticsWorkflow('summary-one', secret);

		expect(signature).toHaveLength(64);
		expect(
			signaturesMatch(signature, await signAnalyticsWorkflow('summary-one', secret))
		).toBe(true);
		expect(
			signaturesMatch(signature, await signAnalyticsWorkflow('summary-two', secret))
		).toBe(false);
	});

	it('rejects values of different lengths', () => {
		expect(signaturesMatch('abcd', 'abc')).toBe(false);
	});
});
