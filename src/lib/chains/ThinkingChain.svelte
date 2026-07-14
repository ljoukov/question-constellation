<script lang="ts">
	import MathText from '$lib/experiments/questions/components/MathText.svelte';

	let {
		steps,
		label = 'Method',
		note = '',
		showLabel = true
	}: {
		steps: string[];
		label?: string;
		note?: string;
		showLabel?: boolean;
	} = $props();

	const accents = ['#168458', '#2f73bd', '#d08a1d', '#7a62c7'];
</script>

<section class="qc-thinking-chain" aria-label={label}>
	{#if showLabel}
		<header>
			<p>{label}</p>
			{#if note}
				<span>{note}</span>
			{/if}
		</header>
	{/if}

	<ol>
		{#each steps as step, index}
			<li style={`--chain-accent: ${accents[index % accents.length]}`}>
				<span class="qc-thinking-step-number">{index + 1}</span>
				<span class="qc-thinking-step-text"><MathText text={step} /></span>
			</li>
		{/each}
	</ol>
</section>
