<script lang="ts">
	import { browser } from '$app/environment';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { ListChecks, X } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';

	let {
		points,
		marks,
		source = 'official',
		open = $bindable(false),
		onReveal
	}: {
		points: Array<{ id: string; text: string }>;
		marks: number;
		source?: 'official' | 'method';
		open?: boolean;
		onReveal?: () => void;
	} = $props();

	const bodyId = $props.id();
	const prefersReducedMotion =
		browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const revealDurationMs = prefersReducedMotion ? 0 : 180;
	let body: HTMLElement | undefined = $state();
	const isMethod = $derived(source === 'method');
	const disclosureLabel = $derived(isMethod ? 'Answer method' : 'Marking points');

	async function toggle() {
		open = !open;
		if (!open) return;
		onReveal?.();
		await tick();
		window.requestAnimationFrame(() => {
			body?.scrollIntoView({
				block: 'nearest',
				behavior: prefersReducedMotion ? 'auto' : 'smooth'
			});
		});
	}
</script>

<section class="qc-hint-panel" aria-label={disclosureLabel}>
	<button
		type="button"
		class="qc-hint-toggle"
		aria-expanded={open}
		aria-controls={bodyId}
		onclick={toggle}
	>
		{#if open}
			<X size={17} aria-hidden="true" />
			Hide {disclosureLabel.toLowerCase()}
		{:else}
			<ListChecks size={17} aria-hidden="true" />
			Show {disclosureLabel.toLowerCase()} · {marks}
			{marks === 1 ? 'mark' : 'marks'}
		{/if}
	</button>

	{#if open}
		<section
			bind:this={body}
			id={bodyId}
			class="qc-practice-static-checklist"
			transition:slide={{ duration: revealDurationMs }}
		>
			<header>
				<p class="qc-panel-label">{disclosureLabel}</p>
				<p>
					{isMethod
						? 'Use these reasoning steps to improve your answer.'
						: 'Check your answer against the credited points.'}
				</p>
			</header>
			<ol>
				{#each points as point, index (point.id)}
					<li>
						<span>{index + 1}</span>
						<MathText text={point.text} />
					</li>
				{/each}
			</ol>
		</section>
	{/if}
</section>
