<script lang="ts">
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { ChevronLeft, ChevronRight, Lightbulb, X } from '@lucide/svelte';
	import { slide } from 'svelte/transition';

	type Hint = string | { title?: string; text: string };

	let {
		hints,
		open = $bindable(false),
		label = 'Show hint'
	}: {
		hints: Hint[];
		open?: boolean;
		label?: string;
	} = $props();

	let activeIndex = $state(0);

	const hintItems = $derived(
		hints
			.map((hint) => (typeof hint === 'string' ? { title: '', text: hint } : hint))
			.filter((hint) => hint.text.trim().length > 0)
	);
	const activeHint = $derived(hintItems[activeIndex] ?? hintItems[0]);
	const hasMultipleHints = $derived(hintItems.length > 1);

	function showPrevious() {
		if (hintItems.length === 0) return;
		activeIndex = (activeIndex - 1 + hintItems.length) % hintItems.length;
	}

	function showNext() {
		if (hintItems.length === 0) return;
		activeIndex = (activeIndex + 1) % hintItems.length;
	}

	$effect(() => {
		if (activeIndex >= hintItems.length) activeIndex = 0;
	});
</script>

{#if hintItems.length > 0}
	<section class="qc-hint-panel" aria-label="Hint">
		<button type="button" class="qc-hint-toggle" onclick={() => (open = !open)}>
			{#if open}
				<X size={17} aria-hidden="true" />
				Hide hint
			{:else}
				<Lightbulb size={17} aria-hidden="true" />
				{label}
			{/if}
		</button>

		{#if open && activeHint}
			<div class="qc-hint-body" transition:slide={{ duration: 180 }}>
				<header>
					<p>
						{activeHint.title || (hasMultipleHints ? `Hint ${activeIndex + 1}` : 'Hint')}
					</p>
					{#if hasMultipleHints}
						<div class="qc-hint-nav" aria-label="Choose hint">
							<button type="button" onclick={showPrevious} aria-label="Previous hint">
								<ChevronLeft size={16} aria-hidden="true" />
							</button>
							<span>{activeIndex + 1}/{hintItems.length}</span>
							<button type="button" onclick={showNext} aria-label="Next hint">
								<ChevronRight size={16} aria-hidden="true" />
							</button>
						</div>
					{/if}
				</header>
				<span><MathText text={activeHint.text} /></span>
			</div>
		{/if}
	</section>
{/if}
