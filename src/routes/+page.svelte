<script lang="ts">
	import { resolve } from '$app/paths';
	import QuestionTeaserGrid from '$lib/chains/QuestionTeaserGrid.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import type { LearningChain } from '$lib/learningChains';

	let {
		data
	}: {
		data: {
			chains: LearningChain[];
		};
	} = $props();

	const firstChain = $derived(data.chains[0]!);

	function chainHref(chain: LearningChain) {
		return resolve('/chains/[chainId]', { chainId: chain.id });
	}
</script>

<svelte:head>
	<title>Question Constellation</title>
	<meta
		name="description"
		content="Browse GCSE question chains, choose a question, then practise it in the original exam-paper format."
	/>
</svelte:head>

<main class="qc-real-app qc-browse-app">
	<AppTopbar subject="Physics" />

	<div class="qc-browse-layout">
		<aside class="qc-browse-intro">
			<p class="qc-real-kicker">GCSE Physics</p>
			<h1>Choose a question chain.</h1>
			<p>
				Pick a real exam question, then practise the same thinking chain in nearby
				questions.
			</p>
			<a class="qc-browse-start" href={chainHref(firstChain)}>Start with gas pressure</a>
		</aside>

		<section class="qc-browse-feed" aria-label="Question chains">
			<div class="qc-browse-heading">
				<h2>Question chains</h2>
			</div>

			{#each data.chains as chain (chain.id)}
				<article class={['qc-browse-chain', `accent-${chain.accent}`]}>
					<a class="qc-chain-title-link" href={chainHref(chain)}>
						<span class="qc-chain-symbol" aria-hidden="true">{chain.symbol}</span>
						<span>
							<span class="qc-chain-topic">{chain.topic}</span>
							<span class="qc-chain-title">{chain.title}</span>
						</span>
					</a>

					<ol class="qc-browse-pattern" aria-label={`${chain.title} reasoning steps`}>
						{#each chain.steps as step}
							<li>{step}</li>
						{/each}
					</ol>

					<QuestionTeaserGrid {chain} />
				</article>
			{/each}
		</section>
	</div>
</main>
