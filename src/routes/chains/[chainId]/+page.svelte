<script lang="ts">
	import { resolve } from '$app/paths';
	import ChainIllustration from '$lib/chains/ChainIllustration.svelte';
	import ChainQuestionList from '$lib/chains/ChainQuestionList.svelte';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import { useIllustratedChainLayout } from '$lib/chains/chainPresentation';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { isEnglishSubject } from '$lib/englishSubjects';
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
	const isEnglish = $derived(isEnglishSubject(chain.subject));
	const useFocusedLayout = $derived(useIllustratedChainLayout(chain.subject, chain.illustration));
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

	{#if useFocusedLayout}
		<div class="qc-chain-focus-page">
			<IconBackLink href={resolve('/chains')} label="Back to question finder" />
			<header class="qc-chain-focus-header">
				<p class="qc-real-kicker"><MathText text={chain.topic} /></p>
				<h1><MathText text={chain.title} /></h1>
			</header>

			{#if chain.illustration}
				<ChainIllustration illustration={chain.illustration} eager showCaption={false} expandable />
			{/if}

			<section class="qc-chain-focus-questions" aria-label="Questions using this method">
				<div class="qc-chain-heading">
					<p class="qc-real-kicker">
						{chain.questions.length}
						{chain.questions.length === 1 ? 'question' : 'questions'}
					</p>
					<h2>Questions using this method</h2>
				</div>

				<ChainQuestionList {chain} showTeasers={false} />
			</section>
		</div>
	{:else}
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
					{#if isEnglish}
						<p class="qc-real-kicker"><MathText text={chain.topic} /></p>
					{/if}
					<h2>Questions using this method</h2>
				</div>

				{#if chain.illustration}
					<ChainIllustration illustration={chain.illustration} eager />
				{/if}

				<ChainQuestionList {chain} showTeasers={isEnglish} />
			</section>
		</div>
	{/if}
</main>
