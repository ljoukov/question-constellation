<script lang="ts">
	import { resolve } from '$app/paths';
	import ChainQuestionList from '$lib/chains/ChainQuestionList.svelte';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { LearningChain } from '$lib/learningChains';
	import type { AdminUser } from '$lib/server/auth/session';

	let {
		data
	}: {
		data: {
			chain: LearningChain;
			user?: AdminUser | null;
		};
	} = $props();

	const chain = $derived(data.chain);
	const canonicalUrl = $derived(
		`https://constellation.eviworld.com/chains/${encodeURIComponent(chain.id)}`
	);
</script>

<svelte:head>
	<title>{chain.title} | Question Constellation</title>
	<meta
		name="description"
		content={`Open the GCSE method for ${chain.title}, then choose a related exam question.`}
	/>
	<link rel="canonical" href={canonicalUrl} />
</svelte:head>

<main class="qc-real-app qc-chain-page">
	<AppTopbar user={data.user} subject={chain.subject} showNavigation />

	<div class="qc-chain-layout">
		<aside class="qc-chain-side" aria-label="Question method summary">
			<IconBackLink href={resolve('/chains')} label="Back to question finder" />
			<p class="qc-real-kicker"><MathText text={chain.topic} /></p>
			<h1><MathText text={chain.title} /></h1>
			<p><MathText text={chain.summary} /></p>
			<ThinkingChain steps={chain.steps} label="Method" />
		</aside>

		<section class="qc-chain-main" aria-label="Questions using this method">
			<div class="qc-chain-heading">
				<p class="qc-real-kicker"><MathText text={chain.topic} /></p>
				<h2>Questions using this method</h2>
			</div>

			<ChainQuestionList {chain} />
		</section>
	</div>
</main>
