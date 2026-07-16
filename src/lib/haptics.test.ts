import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const selection = vi.fn();
	return {
		selection,
		success: vi.fn(),
		error: vi.fn()
	};
});

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('ios-haptics', () => ({
	haptic: Object.assign(mocks.selection, {
		confirm: mocks.success,
		error: mocks.error
	})
}));

import { haptics } from './haptics';

describe('recall haptic cues', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('maps selection and answer outcomes to the proven browser haptic API', () => {
		haptics.selection();
		haptics.success();
		haptics.error();

		expect(mocks.selection).toHaveBeenCalledTimes(1);
		expect(mocks.success).toHaveBeenCalledTimes(1);
		expect(mocks.error).toHaveBeenCalledTimes(1);
	});
});
