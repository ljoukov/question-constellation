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

	const firstChain = $derived(data.chains[0] ?? null);
	let visibleCount = $state(12);
	const visibleChains = $derived(data.chains.slice(0, visibleCount));
	const remainingCount = $derived(Math.max(0, data.chains.length - visibleChains.length));

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
	<AppTopbar subject="All subjects" />

	<div class="qc-browse-layout">
		<aside class="qc-browse-intro">
			<p class="qc-real-kicker">GCSE Science</p>
			<h1>Choose a question chain.</h1>
			<p>
				Pick a real exam question, then practise the same thinking chain in nearby
				questions.
			</p>
			{#if firstChain}
				<a class="qc-browse-start" href={chainHref(firstChain)}>Start with a chain</a>
			{/if}
		</aside>

		<section class="qc-browse-feed" aria-label="Question chains">
			<div class="qc-browse-heading">
				<h2>Question chains</h2>
				<p>{data.chains.length} chains in the database</p>
			</div>

			{#each visibleChains as chain (chain.id)}
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

			{#if remainingCount > 0}
				<button
					type="button"
					class="qc-show-more-chains"
					onclick={() => (visibleCount = Math.min(visibleCount + 12, data.chains.length))}
				>
					Show more chains
				</button>
			{/if}
		</section>
	</div>
</main>
