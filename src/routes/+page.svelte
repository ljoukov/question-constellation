<script lang="ts">
	import { resolve } from '$app/paths';
	import QuestionTeaserGrid from '$lib/chains/QuestionTeaserGrid.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { LearningChain } from '$lib/learningChains';
	import { untrack } from 'svelte';

	let {
		data
	}: {
		data: {
			chains: LearningChain[];
			initialSearch: string;
			initialSubject: string;
		};
	} = $props();

	const subjectOrder = ['Biology', 'Chemistry', 'Physics'];

	function canonicalSubject(value: string | null | undefined) {
		const lower = (value ?? '').toLowerCase();
		if (lower.includes('biology')) return 'Biology';
		if (lower.includes('chemistry')) return 'Chemistry';
		if (lower.includes('physics')) return 'Physics';
		return null;
	}

	function chainSubject(chain: LearningChain) {
		return (
			canonicalSubject(chain.subject) ??
			canonicalSubject(chain.paperLabel) ??
			canonicalSubject(chain.topic) ??
			canonicalSubject(chain.title) ??
			'Science'
		);
	}

	let searchQuery = $state(untrack(() => data.initialSearch));
	let selectedSubject = $state(
		untrack(() => canonicalSubject(data.initialSubject) ?? 'All subjects')
	);
	let visibleCount = $state(12);
	const previewQuestionLimit = 3;

	const subjects = $derived([
		'All subjects',
		...subjectOrder.filter((subject) =>
			data.chains.some((chain) => chainSubject(chain) === subject)
		)
	]);
	const normalizedSearch = $derived(searchQuery.trim().toLowerCase());
	const filteredChains = $derived(
		data.chains.filter((chain) => {
			if (selectedSubject !== 'All subjects' && chainSubject(chain) !== selectedSubject)
				return false;
			if (!normalizedSearch) return true;

			const haystack = [
				chain.title,
				chain.subject,
				chainSubject(chain),
				chain.topic,
				chain.summary,
				chain.steps.join(' '),
				chain.questions
					.map((question) =>
						[
							question.title,
							question.teaser,
							question.label,
							question.command,
							question.paperLabel
						].join(' ')
					)
					.join(' ')
			]
				.join(' ')
				.toLowerCase();
			return normalizedSearch.split(/\s+/).every((term) => haystack.includes(term));
		})
	);
	const firstChain = $derived(filteredChains[0] ?? null);
	const visibleChains = $derived(filteredChains.slice(0, visibleCount));
	const remainingCount = $derived(Math.max(0, filteredChains.length - visibleChains.length));

	$effect(() => {
		searchQuery;
		selectedSubject;
		visibleCount = 12;
	});

	function chainHref(chain: LearningChain) {
		return resolve('/chains/[chainId]', { chainId: chain.id });
	}

	function syncBrowseUrl(nextSearch: string, nextSubject: string) {
		if (typeof window === 'undefined') return;
		const params = new URLSearchParams();
		const trimmedSearch = nextSearch.trim();
		if (trimmedSearch) params.set('q', trimmedSearch);
		if (nextSubject && nextSubject !== 'All subjects') params.set('subject', nextSubject);
		const query = params.toString();
		const nextUrl = `${resolve('/')}${query ? `?${query}` : ''}`;
		window.history.replaceState(window.history.state, '', nextUrl);
	}

	function updateSearch(value: string) {
		searchQuery = value;
		syncBrowseUrl(value, selectedSubject);
	}

	function updateSubject(value: string) {
		selectedSubject = value;
		syncBrowseUrl(searchQuery, value);
	}

	function accessibleText(value: string) {
		return value.replace(/\s*<=>\s*/g, ' ⇌ ').replace(/\s*(?:->|⟶|⇒|)\s*/g, ' → ');
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
	<AppTopbar
		subject={selectedSubject}
		{subjects}
		searchValue={searchQuery}
		searchPlaceholder="Search chains or questions"
		onSearchChange={updateSearch}
		onSubjectChange={updateSubject}
	/>

	<div class="qc-browse-layout">
		<aside class="qc-browse-intro">
			<p class="qc-real-kicker">GCSE Science</p>
			<h1>Choose a question chain.</h1>
			<p>Pick a real exam question, then practise the same thinking chain in nearby questions.</p>
			{#if firstChain}
				<a class="qc-browse-start" href={chainHref(firstChain)}>Start with a chain</a>
			{/if}
		</aside>

		<section class="qc-browse-feed" aria-label="Question chains">
			<div class="qc-browse-heading">
				<h2>Question chains</h2>
				<p>
					{#if filteredChains.length === data.chains.length}
						{data.chains.length} chains in the database
					{:else}
						{filteredChains.length} of {data.chains.length} chains
					{/if}
				</p>
			</div>

			{#each visibleChains as chain (chain.id)}
				<article class={['qc-browse-chain', `accent-${chain.accent}`]}>
					<a class="qc-chain-title-link" href={chainHref(chain)}>
						<span class="qc-chain-symbol" aria-hidden="true">{chain.symbol}</span>
						<span>
							<span class="qc-chain-topic"><MathText text={chain.topic} /></span>
							<span class="qc-chain-title"><MathText text={chain.title} /></span>
						</span>
					</a>

					<section
						class="qc-browse-chain-steps"
						aria-label={`${accessibleText(chain.title)} thinking chain`}
					>
						<h3>Thinking chain</h3>
						<ol class="qc-browse-pattern">
							{#each chain.steps as step}
								<li><MathText text={step} /></li>
							{/each}
						</ol>
					</section>

					<section
						class="qc-browse-question-set"
						aria-label={`${accessibleText(chain.title)} questions`}
					>
						<div class="qc-browse-question-set-head">
							<h3>Practice questions</h3>
							<span>
								{chain.questions.length} questions
								{#if chain.questions.length > previewQuestionLimit}
									<a href={chainHref(chain)}>More</a>
								{/if}
							</span>
						</div>
						<QuestionTeaserGrid {chain} limit={previewQuestionLimit} />
					</section>
				</article>
			{/each}

			{#if visibleChains.length === 0}
				<p class="qc-empty-search">No chains match that search.</p>
			{/if}

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
