<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight } from '@lucide/svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import BlogCard from '$lib/blog/BlogCard.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const filterOptions = [
		{ label: 'All', value: 'all' },
		{ label: 'Comparisons', value: 'Comparison' },
		{ label: 'Revision research', value: 'Revision research' },
		{ label: 'Exam technique', value: 'Exam technique' }
	] as const;
	type BlogFilter = (typeof filterOptions)[number]['value'];
	let selectedFilter = $state<BlogFilter>('all');
	const visibleArticles = $derived(
		selectedFilter === 'all'
			? data.articles
			: data.articles.filter((article) => article.category === selectedFilter)
	);
	const canonicalUrl = 'https://constellation.eviworld.com/blog';
	const pageTitle = 'Question Constellation Blog | GCSE Revision Comparisons and Exam Technique';
	const pageDescription =
		'Comparisons, GCSE revision guides and revision-research notes from Question Constellation, a public collection of real questions and mark-scoring methods.';
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
	<AppTopbar user={data.user} showSearch={false} showSubject={false} showNavigation />

	<main class="blog-page">
		<section class="blog-hero" aria-labelledby="blog-title">
			<div class="blog-hero-copy">
				<p class="blog-kicker">GCSE revision notes</p>
				<h1 id="blog-title">Question Constellation Blog</h1>
				<p>
					Comparisons, exam-technique guides and revision-research notes for students who want
					questions, mark checklists and methods to do more of the work.
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

		<section class="blog-section" aria-labelledby="latest-title">
			<div class="blog-section-heading">
				<p class="blog-kicker">Latest</p>
				<h2 id="latest-title">GCSE revision articles</h2>
				<p>
					Comparisons and revision-method notes, ordered by publication date. Use the filters to
					narrow the list without leaving the page.
				</p>
			</div>

			<div class="blog-filter-row" role="group" aria-label="Filter blog articles">
				{#each filterOptions as option (option.value)}
					<button
						type="button"
						class:active={selectedFilter === option.value}
						aria-pressed={selectedFilter === option.value}
						onclick={() => (selectedFilter = option.value)}
					>
						{option.label}
					</button>
				{/each}
			</div>

			<div class="blog-card-grid">
				{#each visibleArticles as article (article.slug)}
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

	.blog-section {
		padding-top: 2rem;
	}

	.blog-section-heading {
		max-width: 48rem;
		margin-bottom: 0.9rem;
	}

	.blog-section-heading h2 {
		font-size: clamp(1.2rem, 2.1vw, 1.75rem);
		line-height: 1.12;
		font-weight: 560;
	}

	.blog-filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0 0 1rem;
	}

	.blog-filter-row button {
		border: 1px solid #102033;
		border-radius: 0;
		padding: 0.45rem 0.68rem;
		background: rgba(255, 255, 255, 0.74);
		color: #102033;
		font: inherit;
		font-size: 0.88rem;
		font-weight: 520;
		line-height: 1.2;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease,
			background-color 160ms ease;
	}

	.blog-filter-row button:hover,
	.blog-filter-row button:focus-visible,
	.blog-filter-row button.active {
		border-color: #168458;
		background: #edfaf3;
		box-shadow: 0 0 0 2px color-mix(in srgb, #168458 22%, transparent);
		outline: none;
	}

	.blog-card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
		gap: 0.8rem;
	}

	:root[data-theme='dark'] .blog-shell {
		background:
			linear-gradient(180deg, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0)), var(--qc-app-surface);
		color: #e5edf7;
	}

	:root[data-theme='dark'] .blog-hero,
	:root[data-theme='dark'] .blog-hero-media,
	:root[data-theme='dark'] .blog-filter-row button {
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
	:root[data-theme='dark'] .blog-filter-row button {
		background: rgba(15, 23, 42, 0.72);
		color: #d5e2ee;
	}

	:root[data-theme='dark'] .blog-filter-row button:hover,
	:root[data-theme='dark'] .blog-filter-row button:focus-visible,
	:root[data-theme='dark'] .blog-filter-row button.active {
		border-color: #8de0b4;
		background: rgba(16, 56, 44, 0.66);
		box-shadow: 0 0 0 2px color-mix(in srgb, #8de0b4 30%, transparent);
	}

	@media (max-width: 760px) {
		.blog-hero {
			grid-template-columns: 1fr;
		}

		.blog-hero-media {
			max-width: 34rem;
		}
	}
</style>
