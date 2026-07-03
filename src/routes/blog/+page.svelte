<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight, BookOpenCheck, Network, Rows3 } from '@lucide/svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import BlogCard from '$lib/blog/BlogCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const canonicalUrl = 'https://constellation.eviworld.com/blog';
	const pageTitle = 'Question Constellation Blog | GCSE Revision Comparisons and Exam Technique';
	const pageDescription =
		'Comparisons, GCSE revision guides and learning-science notes from Question Constellation, a public question bank organized by answer chains.';
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
						name: 'Blog',
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				name: 'Question Constellation Blog',
				description: pageDescription,
				url: canonicalUrl,
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: data.articles.length,
					itemListElement: data.articles.map((article, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						name: article.title,
						url: `https://constellation.eviworld.com/blog/${article.slug}`
					}))
				}
			}
		]).replace(/</g, '\\u003c')
	);
	const jsonLdScript = $derived(`<script type="application/ld+json">${jsonLd}</` + 'script>');
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonicalUrl} />

	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Question Constellation" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta
		property="og:image"
		content="https://constellation.eviworld.com/product/question-flow.webp"
	/>

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta
		name="twitter:image"
		content="https://constellation.eviworld.com/product/question-flow.webp"
	/>

	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdScript}
</svelte:head>

<div class="blog-shell">
	<AppTopbar showSearch={false} showSubject={false} />

	<main class="blog-page">
		<section class="blog-hero" aria-labelledby="blog-title">
			<div class="blog-hero-copy">
				<p class="blog-kicker">GCSE revision notes</p>
				<h1 id="blog-title">Question Constellation Blog</h1>
				<p>
					Comparisons, exam-technique guides and learning-science notes for students who want
					questions, mark checklists and answer chains to do more of the work.
				</p>
				<a class="blog-hero-link" href={resolve('/past-papers/gcse')}>
					Open GCSE past papers
					<ArrowRight size={17} aria-hidden="true" strokeWidth={2.2} />
				</a>
			</div>
			<div class="blog-hero-media" aria-hidden="true">
				<img
					class="qc-theme-image qc-theme-image-light"
					src="/product/question-flow.webp"
					alt=""
					width="1280"
					height="720"
					loading="eager"
					decoding="async"
				/>
				<img
					class="qc-theme-image qc-theme-image-dark"
					src="/product/question-flow-dark.webp"
					alt=""
					width="1280"
					height="720"
					loading="eager"
					decoding="async"
				/>
			</div>
		</section>

		<section class="blog-method-strip" aria-label="Question Constellation method">
			<div>
				<BookOpenCheck size={20} aria-hidden="true" strokeWidth={2.2} />
				<span>Start with an exam question</span>
			</div>
			<div>
				<Network size={20} aria-hidden="true" strokeWidth={2.2} />
				<span>Reveal the answer chain</span>
			</div>
			<div>
				<Rows3 size={20} aria-hidden="true" strokeWidth={2.2} />
				<span>Practise nearby and transfer questions</span>
			</div>
		</section>

		<section class="blog-section" aria-labelledby="comparisons-title">
			<div class="blog-section-heading">
				<p class="blog-kicker">Comparisons</p>
				<h2 id="comparisons-title">Question Constellation vs other GCSE tools</h2>
				<p>
					Each comparison is written around student jobs: learning content, remembering facts,
					finding resources, checking answers and building mark-scoring structure.
				</p>
			</div>
			<div class="blog-card-grid">
				{#each data.comparisonArticles as article (article.slug)}
					<BlogCard {article} />
				{/each}
			</div>
		</section>

		<section class="blog-section" aria-labelledby="learning-title">
			<div class="blog-section-heading">
				<p class="blog-kicker">Learning science</p>
				<h2 id="learning-title">Why the question-first method works</h2>
				<p>
					Short articles on retrieval practice, interleaving, feedback and transfer, grounded in
					education research and adapted to GCSE exam practice.
				</p>
			</div>
			<div class="blog-card-grid learning">
				{#each data.learningArticles as article (article.slug)}
					<BlogCard {article} />
				{/each}
			</div>
		</section>
	</main>
</div>

<style>
	.blog-shell {
		width: 100%;
		min-height: var(--app-viewport-height, 100vh);
		display: flex;
		flex-direction: column;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.52), rgba(255, 255, 255, 0)),
			var(--qc-app-surface);
		color: #0b1020;
	}

	.blog-page {
		width: min(100%, 91rem);
		margin: 0 auto;
		padding: 1rem clamp(0.9rem, 2.4vw, 2rem) 3rem;
	}

	.blog-hero {
		display: grid;
		grid-template-columns: minmax(0, 0.86fr) minmax(17rem, 0.72fr);
		gap: clamp(1rem, 3vw, 2.4rem);
		align-items: center;
		padding: clamp(1.1rem, 2.5vw, 2.2rem) 0;
		border-bottom: 1px solid rgba(105, 129, 143, 0.15);
	}

	.blog-hero-copy {
		min-width: 0;
		max-width: 48rem;
	}

	.blog-kicker {
		margin: 0 0 0.65rem;
		color: #168458;
		font-size: 0.78rem;
		font-weight: 620;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	.blog-hero h1,
	.blog-section-heading h2 {
		margin: 0;
		color: #123f35;
		letter-spacing: 0;
	}

	.blog-hero h1 {
		font-size: clamp(1.55rem, 3vw, 2.55rem);
		line-height: 1.06;
		font-weight: 560;
	}

	.blog-hero p,
	.blog-section-heading p {
		margin: 0.75rem 0 0;
		color: #526778;
		font-weight: 400;
		line-height: 1.45;
	}

	.blog-hero-link {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 1rem;
		color: #0f6b3d;
		font-weight: 650;
		text-decoration: none;
	}

	.blog-hero-link:hover,
	.blog-hero-link:focus-visible {
		text-decoration: underline;
		text-underline-offset: 0.18em;
		outline: none;
	}

	.blog-hero-media {
		position: relative;
		min-width: 0;
		aspect-ratio: 16 / 9;
		border: 1px solid #d6e0e8;
		background: rgba(255, 255, 255, 0.74);
		overflow: hidden;
	}

	.blog-hero-media img.qc-theme-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: left top;
	}

	.blog-hero-media img.qc-theme-image-light {
		display: block;
	}

	.blog-method-strip {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
		padding: 1rem 0 0;
	}

	.blog-method-strip div {
		display: flex;
		gap: 0.55rem;
		align-items: center;
		min-width: 0;
		padding: 0.75rem;
		border: 1px solid #d6e0e8;
		background: rgba(255, 255, 255, 0.65);
		color: #234155;
		font-size: 0.9rem;
		font-weight: 560;
	}

	.blog-method-strip :global(svg) {
		flex: 0 0 auto;
		color: #168458;
	}

	.blog-section {
		padding-top: 2rem;
	}

	.blog-section-heading {
		max-width: 48rem;
		margin-bottom: 1rem;
	}

	.blog-section-heading h2 {
		font-size: clamp(1.2rem, 2.1vw, 1.75rem);
		line-height: 1.12;
		font-weight: 600;
	}

	.blog-card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
		gap: 0.8rem;
	}

	.blog-card-grid.learning {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
	}

	:root[data-theme='dark'] .blog-shell {
		background:
			linear-gradient(180deg, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0)), var(--qc-app-surface);
		color: #e5edf7;
	}

	:root[data-theme='dark'] .blog-hero,
	:root[data-theme='dark'] .blog-hero-media,
	:root[data-theme='dark'] .blog-method-strip div {
		border-color: rgba(148, 163, 184, 0.24);
	}

	:root[data-theme='dark'] .blog-hero h1,
	:root[data-theme='dark'] .blog-section-heading h2 {
		color: #eaf2f8;
	}

	:root[data-theme='dark'] .blog-hero p,
	:root[data-theme='dark'] .blog-section-heading p {
		color: #a9b8c8;
	}

	:root[data-theme='dark'] .blog-hero-link {
		color: #8de0b4;
	}

	:root[data-theme='dark'] .blog-hero-media,
	:root[data-theme='dark'] .blog-method-strip div {
		background: rgba(15, 23, 42, 0.72);
		color: #d5e2ee;
	}

	@media (max-width: 760px) {
		.blog-hero,
		.blog-method-strip {
			grid-template-columns: 1fr;
		}

		.blog-hero-media {
			max-width: 34rem;
		}
	}
</style>
