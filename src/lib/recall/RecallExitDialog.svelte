<script lang="ts">
	import { Layers3 } from '@lucide/svelte';
	import { onMount, tick } from 'svelte';

	let {
		cardsRemaining,
		busy = false,
		onStay,
		onRestart,
		onLeave
	}: {
		cardsRemaining: number;
		busy?: boolean;
		onStay: () => void | Promise<void>;
		onRestart: () => void | Promise<void>;
		onLeave: () => void | Promise<void>;
	} = $props();

	let dialog = $state<HTMLDivElement | null>(null);
	let keepGoingButton = $state<HTMLButtonElement | null>(null);

	onMount(() => {
		void tick().then(() => keepGoingButton?.focus());
	});

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || busy) return;
		event.preventDefault();
		void onStay();
	}

	function handleDialogKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab' || !dialog) return;
		const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled])'));
		const first = focusable[0];
		const last = focusable.at(-1);
		if (!first || !last) return;

		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="exit-dialog-backdrop">
	<div
		class="exit-dialog"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="recall-exit-title"
		aria-describedby="recall-exit-description"
		id="recall-exit-dialog"
		tabindex="-1"
		bind:this={dialog}
		onkeydown={handleDialogKeydown}
	>
		<p class="recall-status">
			<Layers3 size={15} strokeWidth={2.4} aria-hidden="true" />
			<span>{cardsRemaining} {cardsRemaining === 1 ? 'card' : 'cards'} left</span>
		</p>
		<h2 id="recall-exit-title">Leave this recall deck?</h2>
		<p class="exit-description" id="recall-exit-description">
			One more card can make this easier to remember next time. Or restart for a fresh pass.
		</p>
		<div class="exit-dialog-actions">
			<button
				class="keep-going"
				type="button"
				disabled={busy}
				bind:this={keepGoingButton}
				onclick={() => void onStay()}
			>
				Keep practising
			</button>
			<button class="restart" type="button" disabled={busy} onclick={() => void onRestart()}>
				Restart deck
			</button>
			<button class="leave" type="button" disabled={busy} onclick={() => void onLeave()}>
				Leave deck
			</button>
		</div>
	</div>
</div>

<style>
	.exit-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: grid;
		place-items: center;
		padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
			max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
		background: color-mix(in srgb, var(--qc-ui-text) 34%, transparent);
		backdrop-filter: blur(6px);
	}

	.exit-dialog {
		display: grid;
		gap: 0.7rem;
		width: min(100%, 28rem);
		box-sizing: border-box;
		padding: clamp(1.2rem, 4vw, 1.75rem);
		border: 1px solid var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-raised);
		box-shadow: 0 1.5rem 4rem var(--qc-ui-shadow);
		color: var(--qc-ui-text);
	}

	.exit-dialog > p,
	.exit-dialog h2 {
		margin: 0;
	}

	.exit-dialog > p.recall-status {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		color: var(--qc-ui-accent-text);
		font-size: 0.76rem;
		font-weight: 700;
	}

	.exit-dialog h2 {
		font-size: clamp(1.45rem, 4vw, 1.9rem);
		line-height: 1.1;
	}

	.exit-dialog > p.exit-description {
		color: var(--qc-ui-text-secondary);
		line-height: 1.5;
	}

	.exit-dialog-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		margin-top: 0.35rem;
	}

	.exit-dialog-actions button {
		display: inline-flex;
		min-height: 3rem;
		align-items: center;
		justify-content: center;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
		font-weight: 680;
		text-align: center;
		cursor: pointer;
	}

	.exit-dialog-actions .keep-going {
		grid-column: 1 / -1;
		border-color: var(--qc-ui-accent);
		background: var(--qc-ui-accent);
		color: var(--qc-ui-on-accent);
	}

	.exit-dialog-actions .leave {
		color: var(--qc-ui-danger);
	}

	.exit-dialog-actions button:disabled {
		cursor: wait;
		opacity: 0.62;
	}

	.exit-dialog-actions button:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--qc-ui-accent) 32%, transparent);
		outline-offset: 2px;
	}

	@media (max-width: 480px) {
		.exit-dialog-actions {
			grid-template-columns: 1fr;
		}

		.exit-dialog-actions .keep-going {
			grid-column: auto;
		}
	}
</style>
