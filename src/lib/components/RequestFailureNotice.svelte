<script lang="ts">
	import type { RequestFailure } from '$lib/requestFailure';
	import { CircleAlert, CloudCog, RotateCcw, ServerCrash, WifiOff } from '@lucide/svelte';

	let {
		failure,
		onRetry,
		retrying = false,
		retryLabel = 'Retry',
		compact = false
	}: {
		failure: RequestFailure;
		onRetry?: () => void;
		retrying?: boolean;
		retryLabel?: string;
		compact?: boolean;
	} = $props();

	const connectionFailure = $derived(
		failure.kind === 'offline' ||
			failure.kind === 'connection' ||
			failure.kind === 'timeout' ||
			failure.kind === 'interrupted'
	);
	const sourceLabel = $derived(
		connectionFailure
			? 'Browser connection issue'
			: failure.kind === 'auth'
				? 'Sign-in issue'
				: 'Service issue'
	);
</script>

<section
	class="request-failure-notice"
	class:compact
	class:connection={connectionFailure}
	class:server={!connectionFailure}
	role="alert"
	aria-live="assertive"
	data-failure-kind={failure.kind}
>
	<span class="request-failure-icon" aria-hidden="true">
		{#if failure.kind === 'offline' || failure.kind === 'connection'}
			<WifiOff size={20} />
		{:else if failure.kind === 'timeout' || failure.kind === 'interrupted'}
			<CloudCog size={20} />
		{:else if failure.kind === 'server' || failure.kind === 'busy'}
			<ServerCrash size={20} />
		{:else}
			<CircleAlert size={20} />
		{/if}
	</span>
	<div class="request-failure-copy">
		<p class="request-failure-source">{sourceLabel}</p>
		<strong>{failure.title}</strong>
		<p>{failure.message}</p>
		{#if failure.reference}
			<small>Reference: {failure.reference}</small>
		{/if}
	</div>
	{#if failure.retryable && onRetry}
		<button type="button" onclick={onRetry} disabled={retrying}>
			<RotateCcw size={16} aria-hidden="true" />
			{retrying ? 'Retrying…' : retryLabel}
		</button>
	{/if}
</section>

<style>
	.request-failure-notice {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.8rem;
		align-items: start;
		padding: 1rem;
		border: 1px solid var(--qc-ui-danger-border, color-mix(in srgb, #b42318 42%, transparent));
		border-radius: 0.75rem;
		background: var(--qc-ui-danger-soft, color-mix(in srgb, #b42318 8%, var(--qc-ui-surface)));
		color: var(--qc-ui-text);
		font-family: inherit;
	}

	.request-failure-notice.connection {
		border-color: var(--qc-ui-warning-border, color-mix(in srgb, #b66a16 45%, transparent));
		background: var(--qc-ui-warning-soft, color-mix(in srgb, #b66a16 8%, var(--qc-ui-surface)));
	}

	.request-failure-notice.compact {
		padding: 0.8rem;
		border-radius: 0.6rem;
	}

	.request-failure-icon {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		background: color-mix(in srgb, currentColor 10%, transparent);
		color: var(--qc-ui-danger, #b42318);
	}

	.connection .request-failure-icon {
		color: var(--qc-ui-warning, #9a5a12);
	}

	.request-failure-copy {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}

	.request-failure-copy p,
	.request-failure-copy strong,
	.request-failure-copy small {
		margin: 0;
	}

	.request-failure-copy strong {
		font-size: 0.94rem;
		line-height: 1.3;
	}

	.request-failure-copy > p:not(.request-failure-source) {
		color: var(--qc-ui-text-muted);
		font-size: 0.86rem;
		line-height: 1.48;
	}

	.request-failure-source {
		color: var(--qc-ui-text-subtle, var(--qc-ui-text-muted));
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.request-failure-copy small {
		color: var(--qc-ui-text-subtle, var(--qc-ui-text-muted));
		font-size: 0.7rem;
	}

	.request-failure-notice button {
		display: inline-flex;
		gap: 0.4rem;
		align-items: center;
		justify-content: center;
		min-height: 2.4rem;
		padding: 0.55rem 0.75rem;
		border: 1px solid var(--qc-ui-border);
		border-radius: 0.5rem;
		background: var(--qc-ui-surface-raised, var(--qc-ui-surface));
		color: var(--qc-ui-text);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 750;
		white-space: nowrap;
		cursor: pointer;
	}

	.request-failure-notice button:hover:not(:disabled) {
		border-color: var(--qc-ui-accent-border, var(--qc-ui-accent));
		color: var(--qc-ui-accent-text);
	}

	.request-failure-notice button:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--qc-ui-accent) 30%, transparent);
		outline-offset: 2px;
	}

	.request-failure-notice button:disabled {
		opacity: 0.6;
		cursor: wait;
	}

	@media (max-width: 560px) {
		.request-failure-notice {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.request-failure-notice button {
			grid-column: 2;
			justify-self: start;
		}
	}
</style>
