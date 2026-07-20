<script lang="ts">
	import { ChevronDown, ShieldCheck } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<details class="curriculum-disclosure">
	<summary>
		<span class="curriculum-icon" aria-hidden="true"><ShieldCheck size={21} /></span>
		<strong>Curriculum</strong>
		<span class="curriculum-chevron" aria-hidden="true"><ChevronDown size={18} /></span>
	</summary>
	<div class="curriculum-disclosure-content">
		{@render children()}
	</div>
</details>

<style>
	.curriculum-disclosure {
		width: min(100%, 66rem);
		margin: 0 auto;
		border-block: 1px solid var(--qc-ui-border-subtle);
		color: var(--qc-ui-text);
	}

	summary {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.7rem;
		align-items: center;
		min-height: 3.5rem;
		padding: 0.55rem 0;
		color: var(--qc-ui-text);
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:focus-visible {
		outline: 3px solid var(--qc-ui-accent-text);
		outline-offset: 2px;
	}

	summary strong {
		font-size: 0.9rem;
		font-weight: 680;
	}

	.curriculum-icon {
		display: grid;
		width: 2.35rem;
		height: 2.35rem;
		place-items: center;
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.curriculum-chevron {
		display: inline-flex;
		color: var(--qc-ui-text-muted);
		transition: transform 160ms ease;
	}

	.curriculum-disclosure[open] .curriculum-chevron {
		transform: rotate(180deg);
	}

	.curriculum-disclosure-content {
		padding: 0.35rem 0 1rem;
	}

	@media (max-width: 760px) {
		summary,
		.curriculum-disclosure-content {
			padding-right: 0.4rem;
			padding-left: 0.4rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.curriculum-chevron {
			transition: none;
		}
	}
</style>
