<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		children,
		stacked = false,
		raised = false,
		muted = false
	}: {
		children: Snippet;
		stacked?: boolean;
		raised?: boolean;
		muted?: boolean;
	} = $props();
</script>

<div class:stacked class="panel-frame">
	<div class:raised class:muted class="challenge-panel">
		{@render children()}
	</div>
</div>

<style>
	.panel-frame {
		position: relative;
		min-width: 0;
	}

	.panel-frame.stacked::before,
	.panel-frame.stacked::after {
		position: absolute;
		inset: 0;
		z-index: 0;
		border: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface-raised) 58%, transparent);
		content: '';
		pointer-events: none;
	}

	.panel-frame.stacked::before {
		transform: translate(0.65rem, 0.65rem);
	}

	.panel-frame.stacked::after {
		transform: translate(1.3rem, 1.3rem);
		opacity: 0.55;
	}

	.challenge-panel {
		position: relative;
		z-index: 1;
		display: grid;
		gap: 1rem;
		min-width: 0;
		padding: clamp(1rem, 3vw, 1.65rem);
		border: 1px solid var(--qc-ui-border-strong);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
	}

	.challenge-panel.raised {
		box-shadow: 0 1.35rem 2.8rem color-mix(in srgb, var(--qc-ui-text) 14%, transparent);
	}

	.challenge-panel.muted {
		background: var(--qc-ui-surface-muted);
	}
</style>
