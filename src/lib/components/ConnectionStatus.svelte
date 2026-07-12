<script lang="ts">
	import { Wifi, WifiOff } from '@lucide/svelte';
	import { onMount } from 'svelte';

	let online = $state(true);
	let showRestored = $state(false);
	let restoredTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		online = navigator.onLine;
		const handleOffline = () => {
			if (restoredTimer) clearTimeout(restoredTimer);
			showRestored = false;
			online = false;
		};
		const handleOnline = () => {
			online = true;
			showRestored = true;
			if (restoredTimer) clearTimeout(restoredTimer);
			restoredTimer = setTimeout(() => (showRestored = false), 3200);
		};
		window.addEventListener('offline', handleOffline);
		window.addEventListener('online', handleOnline);
		return () => {
			window.removeEventListener('offline', handleOffline);
			window.removeEventListener('online', handleOnline);
			if (restoredTimer) clearTimeout(restoredTimer);
		};
	});
</script>

{#if !online}
	<div class="connection-status offline" role="status" aria-live="assertive">
		<WifiOff size={18} aria-hidden="true" />
		<span><strong>You're offline.</strong> Text you enter remains on this device.</span>
	</div>
{:else if showRestored}
	<div class="connection-status restored" role="status" aria-live="polite">
		<Wifi size={18} aria-hidden="true" />
		<span><strong>Back online.</strong> You can retry the last action.</span>
	</div>
{/if}

<style>
	.connection-status {
		position: fixed;
		z-index: 1200;
		right: 1rem;
		bottom: max(1rem, env(safe-area-inset-bottom));
		display: flex;
		gap: 0.65rem;
		align-items: center;
		max-width: min(26rem, calc(100vw - 2rem));
		padding: 0.78rem 0.9rem;
		border: 1px solid var(--qc-ui-border);
		border-radius: 0.7rem;
		background: var(--qc-ui-surface-raised, var(--qc-ui-surface));
		box-shadow: 0 16px 45px rgb(2 6 23 / 0.2);
		color: var(--qc-ui-text);
		font-size: 0.82rem;
		line-height: 1.35;
	}

	.connection-status.offline {
		border-color: var(--qc-ui-warning-border, #b66a16);
	}

	.connection-status.offline :global(svg) {
		color: var(--qc-ui-warning, #9a5a12);
	}

	.connection-status.restored :global(svg) {
		color: var(--qc-ui-accent-text);
	}

	@media (max-width: 560px) {
		.connection-status {
			left: 0.75rem;
			right: 0.75rem;
			bottom: max(0.75rem, env(safe-area-inset-bottom));
			max-width: none;
		}
	}
</style>
