<script lang="ts">
	let {
		steps,
		label = 'Thinking chain',
		note = ''
	}: {
		steps: string[];
		label?: string;
		note?: string;
	} = $props();

	const accents = ['#168458', '#2f73bd', '#d08a1d', '#7a62c7'];
</script>

<section class="qc-thinking-chain" aria-label={label}>
	<header>
		<p>{label}</p>
		{#if note}
			<span>{note}</span>
		{/if}
	</header>

	<ol>
		{#each steps as step, index}
			<li style={`--chain-accent: ${accents[index % accents.length]}`}>
				<span class="qc-thinking-step-number">{index + 1}</span>
				<span class="qc-thinking-step-text">{step}</span>
			</li>
		{/each}
	</ol>
</section>
