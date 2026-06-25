<script lang="ts">
	import QuestionTeaserGrid from '$lib/chains/QuestionTeaserGrid.svelte';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { LearningChain } from '$lib/learningChains';

	let {
		data
	}: {
		data: {
			chain: LearningChain;
		};
	} = $props();

	const chain = $derived(data.chain);
</script>

<svelte:head>
	<title>{chain.title} | Question Constellation</title>
	<meta
		name="description"
		content={`Open a GCSE question chain for ${chain.title}, then choose a related exam question.`}
	/>
</svelte:head>

<main class="qc-real-app qc-chain-page">
	<AppTopbar subject={chain.subject} />

	<div class="qc-chain-layout">
		<aside class="qc-chain-side" aria-label="Question chain summary">
			<a class="qc-chain-back" href="/" aria-label="Back to chains">←</a>
			<p class="qc-real-kicker"><MathText text={chain.topic} /></p>
			<h1><MathText text={chain.title} /></h1>
			<p><MathText text={chain.summary} /></p>
			<ThinkingChain steps={chain.steps} label="Thinking chain" />
		</aside>

		<section class="qc-chain-main" aria-label="Questions in this chain">
			<div class="qc-chain-heading">
				<p class="qc-real-kicker"><MathText text={chain.topic} /></p>
				<h2>Questions in this chain</h2>
			</div>

			<QuestionTeaserGrid {chain} />
		</section>
	</div>
</main>
