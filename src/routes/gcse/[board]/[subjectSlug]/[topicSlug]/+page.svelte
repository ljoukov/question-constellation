<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const canonicalUrl = $derived(`https://constellation.eviworld.com${data.topic.path}`);
	const title = $derived(`${data.topic.title} | Question Constellation`);
	const questionWord = $derived(data.topic.questionCount === 1 ? 'question' : 'questions');
	const jsonLd = $derived.by(() =>
		JSON.stringify([
			{
				'@context': 'https://schema.org',
				'@type': 'BreadcrumbList',
				itemListElement: [
					{
						'@type': 'ListItem',
						position: 1,
						name: 'Question Constellation',
						item: 'https://constellation.eviworld.com/'
					},
					{
						'@type': 'ListItem',
						position: 2,
						name: data.topic.title,
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				name: data.topic.title,
				description: data.topic.description,
				url: canonicalUrl,
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: data.topic.questionCount,
					itemListElement: data.topic.questions.slice(0, 50).map((question, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						url: `https://constellation.eviworld.com/questions/${encodeURIComponent(question.id)}`,
						name: question.title
					}))
				}
			}
		]).replace(/</g, '\\u003c')
	);
	const jsonLdScript = $derived(`<script type="application/ld+json">${jsonLd}</` + 'script>');
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={data.topic.description} />
	<link rel="canonical" href={canonicalUrl} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Question Constellation" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={data.topic.description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content="https://constellation.eviworld.com/icon-512.png" />
	<meta property="og:image:alt" content="Question Constellation" />

	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={data.topic.description} />
	<meta name="twitter:image" content="https://constellation.eviworld.com/icon-512.png" />

	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdScript}
</svelte:head>

<main class="qc-real-app topic-page">
	<AppTopbar subject={data.topic.subject} showSearch={false} />

	<div class="topic-layout">
		<section class="topic-hero" aria-labelledby="topic-title">
			<nav class="breadcrumb" aria-label="Breadcrumb">
				<a href={resolve('/')}>Question Constellation</a>
				<span aria-hidden="true">/</span>
				<span>{data.topic.board} GCSE {data.topic.subject}</span>
			</nav>

			<p class="qc-real-kicker">
				{data.topic.board}
				{data.topic.qualification}
				{data.topic.subject}
			</p>
			<h1 id="topic-title">
				<MathText text={data.topic.topic} /> questions
			</h1>
			<p>{data.topic.description}</p>
		</section>

		<section class="topic-section" aria-labelledby="topic-questions">
			<div class="section-heading">
				<h2 id="topic-questions">
					{data.topic.questionCount} exam {questionWord}
				</h2>
				<p>Start with a real question, then open the answer chain when you are ready.</p>
			</div>

			<div class="question-list" role="list">
				{#each data.topic.questions as question (question.id)}
					<article class="question-row" role="listitem">
						<div>
							<a href={resolve('/questions/[questionId]', { questionId: question.id })}>
								<MathText text={question.title} />
							</a>
							<p><MathText text={question.meta} /></p>
						</div>
						{#if question.chainId && question.chainTitle}
							<a
								class="chain-link"
								href={resolve('/chains/[chainId]', { chainId: question.chainId })}
							>
								<MathText text={question.chainTitle} />
							</a>
						{/if}
					</article>
				{/each}
			</div>
		</section>

		{#if data.topic.chains.length > 0}
			<section class="topic-section" aria-labelledby="topic-chains">
				<div class="section-heading">
					<h2 id="topic-chains">Reusable answer chains</h2>
					<p>Questions in this topic often reuse the same mark-scoring steps.</p>
				</div>

				<div class="chain-grid" role="list">
					{#each data.topic.chains as chain (chain.id)}
						<div role="listitem">
							<a class="chain-card" href={resolve('/chains/[chainId]', { chainId: chain.id })}>
								<strong><MathText text={chain.title} /></strong>
								<span
									>{chain.questionCount} linked {chain.questionCount === 1
										? 'question'
										: 'questions'}</span
								>
							</a>
						</div>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</main>

<style>
	.topic-page {
		min-height: var(--app-viewport-height, 100vh);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.48), rgba(255, 255, 255, 0)),
			var(--qc-app-surface);
		color: #0b1020;
	}

	.topic-layout {
		width: min(100%, 74rem);
		margin: 0 auto;
		padding: 1rem clamp(0.9rem, 2.4vw, 2rem) 3rem;
	}

	.breadcrumb {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		margin-bottom: 1.2rem;
		color: #64748b;
		font-size: 0.86rem;
		font-weight: 460;
	}

	.breadcrumb a {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.topic-hero {
		padding: clamp(1.1rem, 2.5vw, 2rem) 0;
		border-bottom: 1px solid rgba(105, 129, 143, 0.15);
	}

	.topic-hero h1 {
		max-width: 52rem;
		margin: 0;
		color: #123f35;
		font-size: clamp(1.55rem, 3.2vw, 2.6rem);
		line-height: 1.05;
		font-weight: 560;
		letter-spacing: 0;
	}

	.topic-hero p,
	.section-heading p,
	.question-row p {
		color: #526778;
		font-weight: 400;
		line-height: 1.42;
	}

	.topic-hero > p:last-child {
		max-width: 48rem;
		margin: 0.95rem 0 0;
		font-size: 1rem;
	}

	.topic-section {
		padding: 1.45rem 0 0;
	}

	.section-heading {
		display: grid;
		gap: 0.25rem;
		margin-bottom: 0.9rem;
	}

	.section-heading h2 {
		margin: 0;
		color: #122238;
		font-size: 1.05rem;
		font-weight: 720;
		letter-spacing: 0;
	}

	.section-heading p {
		margin: 0;
	}

	.question-list {
		display: grid;
		border-top: 1px solid #e2e8ee;
	}

	.question-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.42fr);
		gap: 1rem;
		align-items: center;
		padding: 0.78rem 0;
		border-bottom: 1px solid #e8eef3;
	}

	.question-row a {
		color: #10253a;
		font-weight: 820;
		text-decoration: none;
	}

	.question-row a:hover,
	.question-row a:focus-visible {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.question-row p {
		margin: 0.22rem 0 0;
		font-size: 0.88rem;
	}

	.chain-link {
		justify-self: end;
		font-size: 0.86rem;
		text-align: right;
	}

	.chain-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.7rem;
	}

	.chain-card {
		display: grid;
		gap: 0.35rem;
		padding: 0.8rem;
		border: 1px solid #cddbe4;
		background: #ffffff;
		color: #10253a;
		text-decoration: none;
	}

	.chain-card:hover,
	.chain-card:focus-visible {
		border-color: #10253a;
		background: #f6fafb;
	}

	.chain-card strong {
		font-size: 0.95rem;
		font-weight: 820;
	}

	.chain-card span {
		color: #526778;
		font-size: 0.84rem;
	}

	:global(:root[data-theme='dark']) .topic-page {
		background:
			linear-gradient(180deg, rgba(15, 23, 42, 0.52), rgba(15, 23, 42, 0)), var(--qc-app-surface);
		color: #e5edf6;
	}

	:global(:root[data-theme='dark']) .topic-hero,
	:global(:root[data-theme='dark']) .question-list,
	:global(:root[data-theme='dark']) .question-row {
		border-color: #263449;
	}

	:global(:root[data-theme='dark']) .topic-hero h1,
	:global(:root[data-theme='dark']) .section-heading h2,
	:global(:root[data-theme='dark']) .question-row a,
	:global(:root[data-theme='dark']) .chain-card {
		color: #e5edf6;
	}

	:global(:root[data-theme='dark']) .breadcrumb,
	:global(:root[data-theme='dark']) .topic-hero p,
	:global(:root[data-theme='dark']) .section-heading p,
	:global(:root[data-theme='dark']) .question-row p,
	:global(:root[data-theme='dark']) .chain-card span {
		color: #9fb0c5;
	}

	:global(:root[data-theme='dark']) .breadcrumb a,
	:global(:root[data-theme='dark']) .question-row a:hover,
	:global(:root[data-theme='dark']) .question-row a:focus-visible {
		color: #7dd3a1;
	}

	:global(:root[data-theme='dark']) .chain-card {
		border-color: #334155;
		background: #0f172a;
	}

	:global(:root[data-theme='dark']) .chain-card:hover,
	:global(:root[data-theme='dark']) .chain-card:focus-visible {
		border-color: #7dd3a1;
		background: #111d33;
	}

	@media (max-width: 760px) {
		.question-row {
			grid-template-columns: 1fr;
			gap: 0.42rem;
		}

		.chain-link {
			justify-self: start;
			text-align: left;
		}
	}
</style>
