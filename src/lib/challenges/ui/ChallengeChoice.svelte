<script lang="ts">
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { CheckCircle2, XCircle } from '@lucide/svelte';
	import HapticSurface from './HapticSurface.svelte';

	let {
		text,
		label,
		marker,
		feedback,
		selected = false,
		status = 'idle',
		disabled = false,
		prominent = false,
		onclick,
		analyticsLabel
	}: {
		text: string;
		label?: string;
		marker?: string;
		feedback?: string | null;
		selected?: boolean;
		status?: 'idle' | 'correct' | 'incorrect';
		disabled?: boolean;
		prominent?: boolean;
		onclick: () => void;
		analyticsLabel?: string;
	} = $props();
</script>

<HapticSurface block>
	<button
		type="button"
		class:selected
		class:correct={status === 'correct'}
		class:incorrect={status === 'incorrect'}
		class:prominent
		{disabled}
		{onclick}
		aria-pressed={selected}
		data-analytics-label={analyticsLabel}
		data-haptic-control
	>
		{#if status !== 'idle'}
			<span class="visually-hidden">{status === 'correct' ? 'Correct.' : 'Incorrect.'}</span>
		{/if}
		{#if marker}<span class="choice-marker" aria-hidden="true">{marker}</span>{/if}
		<span class="choice-copy">
			{#if label}<span class="choice-label">{label}</span>{/if}
			<span class="choice-text"><MathText {text} /></span>
			{#if feedback}<small><MathText text={feedback} /></small>{/if}
		</span>
		{#if status !== 'idle'}
			<span class="choice-status" aria-hidden="true">
				{#if status === 'correct'}
					<CheckCircle2 size={20} strokeWidth={2.3} />
				{:else}
					<XCircle size={20} strokeWidth={2.3} />
				{/if}
			</span>
		{/if}
	</button>
</HapticSurface>

<style>
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	button {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.7rem;
		min-width: 0;
		min-height: 3.7rem;
		align-items: start;
		padding: 0.8rem;
		border: 1px solid var(--qc-ui-border-control);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
		font-size: clamp(1rem, 2vw, 1.08rem);
		font-weight: 500;
		line-height: 1.45;
		text-align: left;
		cursor: pointer;
		overflow-wrap: anywhere;
		transition:
			border-color 160ms ease,
			background 160ms ease,
			color 160ms ease,
			box-shadow 160ms ease,
			transform 160ms ease;
	}

	button.prominent {
		min-height: 7.2rem;
		align-content: start;
	}

	button:disabled {
		cursor: default;
	}

	button:focus-visible {
		outline: 3px solid var(--qc-ui-focus-ring);
		outline-offset: 3px;
	}

	button:hover:not(:disabled):not(.correct):not(.incorrect) {
		border-color: var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-muted);
	}

	button.correct {
		border-color: var(--qc-ui-accent-text);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	button.incorrect {
		border-color: var(--qc-ui-danger);
		background: color-mix(in srgb, var(--qc-ui-danger) 12%, var(--qc-ui-surface));
		color: var(--qc-ui-danger);
	}

	button.incorrect:focus-visible {
		outline-color: var(--qc-ui-danger);
	}

	button.selected.correct {
		animation: challenge-choice-correct var(--challenge-motion-duration, 560ms)
			cubic-bezier(0.2, 0.76, 0.2, 1) both;
	}

	button.selected.incorrect {
		animation: challenge-choice-incorrect var(--challenge-motion-duration, 560ms)
			cubic-bezier(0.2, 0.76, 0.2, 1) both;
	}

	.choice-marker {
		display: inline-grid;
		width: 1.65rem;
		height: 1.65rem;
		place-items: center;
		border: 1px solid var(--qc-ui-border-control);
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		font-weight: 700;
	}

	.choice-copy {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}

	.choice-label {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.choice-text {
		color: inherit;
	}

	.choice-copy small {
		color: var(--qc-ui-text-secondary);
		font-size: 0.84rem;
		font-weight: 450;
		line-height: 1.45;
	}

	.choice-status {
		display: inline-grid;
		place-items: center;
		color: currentColor;
	}

	@keyframes challenge-choice-correct {
		0%,
		100% {
			transform: scale(1);
			box-shadow: 0 0 0 color-mix(in srgb, var(--qc-ui-accent) 0%, transparent);
		}

		35% {
			transform: scale(1.018);
			box-shadow: 0 0 0 0.32rem color-mix(in srgb, var(--qc-ui-accent) 14%, transparent);
		}
	}

	@keyframes challenge-choice-incorrect {
		0%,
		100% {
			transform: scale(1);
			box-shadow: 0 0 0 color-mix(in srgb, var(--qc-ui-danger) 0%, transparent);
		}

		42% {
			transform: scale(1.012);
			box-shadow: 0 0 0 0.28rem color-mix(in srgb, var(--qc-ui-danger) 12%, transparent);
		}
	}

	@media (max-width: 520px) {
		button.prominent {
			min-height: 5.6rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		button {
			animation: none !important;
			transition: none;
		}
	}

	:global(html[data-visual-effects='off']) button {
		animation: none !important;
		transition: none;
	}
</style>
