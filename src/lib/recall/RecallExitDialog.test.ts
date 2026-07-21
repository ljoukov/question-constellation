import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import RecallExitDialog from './RecallExitDialog.svelte';

function renderDialog(cardsRemaining: number) {
	return render(RecallExitDialog, {
		props: {
			cardsRemaining,
			onStay: vi.fn(),
			onRestart: vi.fn(),
			onLeave: vi.fn()
		}
	}).body;
}

describe('RecallExitDialog', () => {
	it('uses recall-specific progress and offers continue, restart, and leave actions', () => {
		const body = renderDialog(3);

		expect(body).toContain('role="alertdialog"');
		expect(body).toContain('3 cards left');
		expect(body).toContain('Leave this recall deck?');
		expect(body).toContain('One more card can make this easier to remember next time.');
		expect(body).toContain('Keep practising');
		expect(body).toContain('Restart deck');
		expect(body).toContain('Leave deck');
		expect(body).not.toMatch(/timer|paused/i);
	});

	it('uses the singular card label', () => {
		expect(renderDialog(1)).toContain('1 card left');
	});
});
