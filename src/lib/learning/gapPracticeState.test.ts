import { describe, expect, it } from 'vitest';
import { restorableGapFieldResults } from './gapPracticeState';

describe('restorableGapFieldResults', () => {
	it('turns an interrupted in-flight check back into an editable idle step', () => {
		expect(
			restorableGapFieldResults({
				step1: { status: 'checking', feedback: 'Checking...', failure: null },
				step2: { status: 'correct', feedback: 'Good link.', failure: null }
			})
		).toEqual({
			step1: { status: 'idle', feedback: '', failure: null },
			step2: { status: 'correct', feedback: 'Good link.', failure: null }
		});
	});
});
