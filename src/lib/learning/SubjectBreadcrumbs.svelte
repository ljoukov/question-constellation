<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { House } from '@lucide/svelte';

	let {
		subject,
		subjectHref,
		currentLabel = null
	}: {
		subject: string;
		subjectHref: string;
		currentLabel?: string | null;
	} = $props();

	const resolveInternalPath = resolve as (path: string) => ResolvedPathname;
</script>

<nav class="qc-learning-breadcrumbs" aria-label="Breadcrumb">
	<a href={resolve('/')} data-analytics-label={`${subject} subject: home`}>
		<House size={18} strokeWidth={2.2} aria-hidden="true" />
		<span>Home</span>
	</a>
	<span aria-hidden="true">/</span>
	<a href={resolve('/challenges')} data-analytics-label={`${subject} subject: all challenges`}>
		All challenges
	</a>
	<span aria-hidden="true">/</span>
	{#if currentLabel}
		<a href={resolveInternalPath(subjectHref)} data-analytics-label={`Back to ${subject} subject`}>
			{subject}
		</a>
		<span aria-hidden="true">/</span>
		<strong aria-current="page">{currentLabel}</strong>
	{:else}
		<strong aria-current="page">{subject}</strong>
	{/if}
</nav>

<style>
	.qc-learning-breadcrumbs {
		grid-area: breadcrumbs;
		display: flex;
		min-width: 0;
		min-height: 2.5rem;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.42rem 0.62rem;
		color: var(--qc-ui-text-muted);
		font-size: clamp(0.9rem, 1.5vw, 1.02rem);
		font-weight: 680;
		line-height: 1.3;
	}

	.qc-learning-breadcrumbs a {
		display: inline-flex;
		min-height: 2.5rem;
		align-items: center;
		gap: 0.4rem;
		color: var(--qc-ui-text-secondary);
		text-decoration: none;
	}

	.qc-learning-breadcrumbs a:hover {
		color: var(--qc-ui-accent-text);
	}

	.qc-learning-breadcrumbs a:focus-visible {
		outline: 3px solid var(--qc-ui-accent-text);
		outline-offset: 2px;
	}

	.qc-learning-breadcrumbs strong {
		min-width: 0;
		color: var(--qc-ui-text);
		font-weight: 760;
	}

	@media (max-width: 420px) {
		.qc-learning-breadcrumbs {
			gap: 0.3rem 0.48rem;
			font-size: 0.84rem;
		}

		.qc-learning-breadcrumbs a,
		.qc-learning-breadcrumbs {
			min-height: 2.25rem;
		}
	}
</style>
