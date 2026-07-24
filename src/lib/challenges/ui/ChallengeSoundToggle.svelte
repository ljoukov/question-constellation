<script lang="ts">
	import { Volume2, VolumeX } from '@lucide/svelte';
	import { challengeSoundEnabled, playChallengeSound, toggleChallengeSound } from '../sound';
	import HapticSurface from './HapticSurface.svelte';

	let announcement = $state('');
	const controlLabel = $derived(
		$challengeSoundEnabled ? 'Turn challenge sounds off' : 'Turn challenge sounds on'
	);

	function handleToggle() {
		const enabled = toggleChallengeSound();
		announcement = enabled ? 'Challenge sounds on' : 'Challenge sounds off';

		// Enabling is an explicit user gesture, so iOS can safely play this short preview.
		if (enabled) void playChallengeSound('select');
	}
</script>

<span class="sound-control">
	<HapticSurface>
		<button
			type="button"
			class:enabled={$challengeSoundEnabled}
			onclick={handleToggle}
			aria-label={controlLabel}
			aria-pressed={$challengeSoundEnabled}
			title={controlLabel}
			data-analytics-label={controlLabel}
			data-haptic-control
		>
			{#if $challengeSoundEnabled}
				<Volume2 size={20} strokeWidth={2.2} aria-hidden="true" />
			{:else}
				<VolumeX size={20} strokeWidth={2.2} aria-hidden="true" />
			{/if}
		</button>
	</HapticSurface>
	<span class="visually-hidden" aria-live="polite">{announcement}</span>
</span>

<style>
	.sound-control {
		position: relative;
		display: inline-grid;
		flex: 0 0 auto;
	}

	button {
		display: inline-grid;
		width: 2.75rem;
		height: 2.75rem;
		min-width: 2.75rem;
		min-height: 2.75rem;
		place-items: center;
		padding: 0;
		border: 1px solid var(--qc-ui-border-control);
		border-radius: 999px;
		background: var(--qc-ui-surface-raised);
		box-shadow: 0 4px 14px var(--qc-ui-shadow);
		color: var(--qc-ui-text-muted);
		font: inherit;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background 140ms ease,
			color 140ms ease,
			transform 140ms ease;
	}

	button.enabled {
		border-color: var(--qc-ui-accent-text);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	button:hover {
		border-color: var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text);
	}

	button:active {
		transform: scale(0.96);
	}

	button:focus-visible {
		outline: 3px solid var(--qc-ui-focus-ring);
		outline-offset: 2px;
	}

	button :global(svg) {
		pointer-events: none;
	}

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

	@media (prefers-reduced-motion: reduce) {
		button {
			transition: none;
		}
	}
</style>
