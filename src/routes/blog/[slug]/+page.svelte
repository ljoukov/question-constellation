<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight } from '@lucide/svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import BlogCard from '$lib/blog/BlogCard.svelte';
	import { formatArticleDate } from '$lib/blog/format';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const article = $derived(data.article);
	const canonicalUrl = $derived(`https://constellation.eviworld.com/blog/${article.slug}`);
	const jsonLd = $derived.by(() => {
		const graph: unknown[] = [
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
						item: 'https://constellation.eviworld.com/blog'
					},
					{
						'@type': 'ListItem',
						position: 3,
						name: article.title,
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'BlogPosting',
				headline: article.title,
				description: article.description,
				datePublished: article.publishedAt,
				dateModified: article.updatedAt ?? article.publishedAt,
				url: canonicalUrl,
				mainEntityOfPage: canonicalUrl,
				inLanguage: 'en-GB',
				image: 'https://constellation.eviworld.com/product/question-flow.webp',
				author: {
					'@type': 'Organization',
					name: 'Question Constellation'
				},
				publisher: {
					'@type': 'Organization',
					name: 'Question Constellation',
					logo: {
						'@type': 'ImageObject',
						url: 'https://constellation.eviworld.com/icon-512.png'
					}
				}
			}
		];

		if (article.faqs?.length) {
			graph.push({
				'@context': 'https://schema.org',
				'@type': 'FAQPage',
				mainEntity: article.faqs.map((faq) => ({
					'@type': 'Question',
					name: faq.question,
					acceptedAnswer: {
						'@type': 'Answer',
						text: faq.answer
					}
				}))
			});
		}

		return JSON.stringify(graph).replace(/</g, '\\u003c');
	});
	const jsonLdScript = $derived(`<script type="application/ld+json">${jsonLd}</` + 'script>');
</script>

<svelte:head>
	<title>{article.title} | Question Constellation</title>
	<meta name="description" content={article.description} />
	<meta name="keywords" content={article.tags.join(', ')} />
	<link rel="canonical" href={canonicalUrl} />

	<meta property="og:type" content="article" />
	<meta property="og:site_name" content="Question Constellation" />
	<meta property="og:title" content={`${article.title} | Question Constellation`} />
	<meta property="og:description" content={article.description} />
	<meta property="og:url" content={canonicalUrl} />
	<meta
		property="og:image"
		content="https://constellation.eviworld.com/product/question-flow.webp"
	/>
	<meta property="article:published_time" content={article.publishedAt} />
	<meta property="article:modified_time" content={article.updatedAt ?? article.publishedAt} />
	<meta property="article:section" content={article.category} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={`${article.title} | Question Constellation`} />
	<meta name="twitter:description" content={article.description} />
	<meta
		name="twitter:image"
		content="https://constellation.eviworld.com/product/question-flow.webp"
	/>

	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdScript}
</svelte:head>

<div class="blog-shell">
	<AppTopbar user={data.user} showSearch={false} showSubject={false} showNavigation />

	<main class="blog-article-page">
		<nav class="blog-breadcrumb" aria-label="Breadcrumb">
			<a href={resolve('/blog')}>Blog</a>
			<span aria-hidden="true">/</span>
			<span>{article.shortTitle}</span>
		</nav>

		<article class="blog-article">
			<header class="blog-article-hero">
				<div class="blog-article-meta">
					<span>{article.category}</span>
					<span>{formatArticleDate(article.publishedAt)}</span>
					<span>{article.readMinutes} min read</span>
				</div>
				<h1>{article.title}</h1>
				<p>{article.standfirst}</p>
				<div class="blog-article-tags" aria-label="Article tags">
					{#each article.tags as tag (tag)}
						<span>{tag}</span>
					{/each}
				</div>
			</header>

			<aside class="blog-quick-take" aria-label="Quick take">
				<p class="blog-kicker">Quick take</p>
				<p>{article.quickTake}</p>
			</aside>

			<MarkdownContent markdown={article.bodyMarkdown} class="blog-article-body" />

			{#if article.faqs?.length}
				<section class="blog-faq" aria-labelledby="blog-faq-title">
					<h2 id="blog-faq-title">Frequently asked questions</h2>
					{#each article.faqs as faq (faq.question)}
						<details>
							<summary>{faq.question}</summary>
							<p>{faq.answer}</p>
						</details>
					{/each}
				</section>
			{/if}

			{#if article.sources?.length}
				<section class="blog-sources" aria-labelledby="blog-sources-title">
					<h2 id="blog-sources-title">Sources and further reading</h2>
					<ul>
						{#each article.sources as source (source.url)}
							<li>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
								<a href={source.url} rel="noreferrer">{source.label}</a>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="blog-article-cta" aria-label="Try Question Constellation">
				<div>
					<p class="blog-kicker">Question first</p>
					<h2>Try a GCSE question next.</h2>
					<p>
						Start with a real question, see the method, then practise related questions that use the
						same logic.
					</p>
				</div>
				<a href={resolve('/chains')}>
					Open question bank
					<ArrowRight size={17} aria-hidden="true" strokeWidth={2.2} />
				</a>
			</section>
		</article>

		{#if data.relatedArticles.length}
			<section class="related-posts" aria-labelledby="related-posts-title">
				<div class="related-posts-head">
					<p class="blog-kicker">Related</p>
					<h2 id="related-posts-title">Read next</h2>
				</div>
				<div class="related-post-grid">
					{#each data.relatedArticles as related (related.slug)}
						<BlogCard article={related} compact />
					{/each}
				</div>
			</section>
		{/if}
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

	.blog-article-page {
		width: min(100%, 72rem);
		margin: 0 auto;
		padding: 1rem clamp(0.9rem, 2.4vw, 2rem) 3rem;
	}

	.blog-breadcrumb {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		color: #64748b;
		font-size: 0.86rem;
		font-weight: 460;
	}

	.blog-breadcrumb a {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.blog-article {
		max-width: 45rem;
		padding-top: clamp(1.2rem, 2.5vw, 2rem);
	}

	.blog-article-hero {
		padding-bottom: 1.1rem;
		border-bottom: 1px solid rgba(105, 129, 143, 0.15);
	}

	.blog-article-meta,
	.blog-article-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		color: #64748b;
		font-size: 0.82rem;
		line-height: 1.25;
	}

	.blog-article-meta span + span::before {
		content: '/';
		margin-right: 0.45rem;
		color: #9aa8b6;
	}

	.blog-article-hero h1 {
		margin: 0.75rem 0 0;
		color: #123f35;
		font-size: clamp(1.55rem, 3vw, 2.55rem);
		line-height: 1.06;
		font-weight: 560;
		letter-spacing: 0;
	}

	.blog-article-hero p {
		margin: 0.9rem 0 0;
		color: #526778;
		font-size: clamp(1.03rem, 1.6vw, 1.12rem);
		line-height: 1.68;
	}

	.blog-article-tags {
		margin-top: 0.9rem;
	}

	.blog-article-tags span {
		border: 1px solid #dce7ef;
		padding: 0.2rem 0.42rem;
		background: rgba(239, 248, 248, 0.7);
		color: #31586b;
	}

	.blog-kicker {
		margin: 0 0 0.55rem;
		color: #168458;
		font-size: 0.78rem;
		font-weight: 560;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	.blog-quick-take,
	.blog-article-cta {
		margin: 1.2rem 0;
		padding: 1rem;
		border: 1px solid #d6e0e8;
		background: rgba(255, 255, 255, 0.72);
	}

	.blog-quick-take p:last-child,
	.blog-article-cta p {
		margin: 0;
		color: #526778;
		line-height: 1.62;
	}

	:global(.markdown-content.blog-article-body) {
		--markdown-text: #203247;
		--markdown-strong: #102033;
		--markdown-link: #0f6b3d;
		overflow-x: auto;
		padding-bottom: 0.15rem;
		color: #203247;
		font-size: clamp(1rem, 1.35vw, 1.06rem);
		line-height: 1.82;
	}

	:global(.markdown-content.blog-article-body p),
	:global(.markdown-content.blog-article-body ul),
	:global(.markdown-content.blog-article-body ol) {
		margin-top: 1rem;
		margin-bottom: 0;
	}

	:global(.markdown-content.blog-article-body li + li) {
		margin-top: 0.42rem;
	}

	:global(.markdown-content.blog-article-body strong) {
		font-weight: 600;
	}

	:global(.markdown-content.blog-article-body h2) {
		margin: 2.4rem 0 0.75rem;
		color: #102033;
		font-size: clamp(1.16rem, 2vw, 1.45rem);
		line-height: 1.25;
		font-weight: 560;
		letter-spacing: 0;
	}

	:global(.markdown-content.blog-article-body table) {
		display: table;
		width: 100%;
		min-width: 44rem;
		max-width: none;
		border-collapse: collapse;
		border: 1px solid #d6e0e8;
		background: rgba(255, 255, 255, 0.72);
		font-size: 0.92rem;
		line-height: 1.56;
	}

	:global(.markdown-content.blog-article-body th),
	:global(.markdown-content.blog-article-body td) {
		min-width: 10rem;
		padding: 0.8rem 0.78rem;
		border: 1px solid #d6e0e8;
		text-align: left;
		vertical-align: top;
	}

	:global(.markdown-content.blog-article-body th) {
		color: #102033;
		background: rgba(239, 248, 248, 0.9);
		font-weight: 580;
	}

	.blog-faq,
	.blog-sources,
	.related-posts {
		margin-top: 2rem;
	}

	.blog-faq h2,
	.blog-sources h2,
	.blog-article-cta h2,
	.related-posts h2 {
		margin: 0 0 0.8rem;
		color: #102033;
		font-size: clamp(1.15rem, 2vw, 1.45rem);
		line-height: 1.24;
		font-weight: 560;
	}

	.blog-faq details {
		border: 1px solid #d6e0e8;
		background: rgba(255, 255, 255, 0.72);
	}

	.blog-faq details + details {
		margin-top: 0.55rem;
	}

	.blog-faq summary {
		cursor: pointer;
		padding: 0.75rem 0.85rem;
		color: #102033;
		font-weight: 560;
	}

	.blog-faq details p {
		margin: 0;
		padding: 0 0.85rem 0.85rem;
		color: #526778;
		line-height: 1.62;
	}

	.blog-sources ul {
		margin: 0;
		padding-left: 1.2rem;
		color: #526778;
	}

	.blog-sources li + li {
		margin-top: 0.35rem;
	}

	.blog-sources a,
	.blog-article-cta a {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.blog-article-cta {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: center;
	}

	.blog-article-cta a {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		font-weight: 560;
		text-decoration: none;
	}

	.blog-article-cta a:hover,
	.blog-article-cta a:focus-visible {
		text-decoration: underline;
		outline: none;
	}

	.related-post-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
		gap: 0.75rem;
	}

	:root[data-theme='dark'] .blog-shell {
		background:
			linear-gradient(180deg, rgba(15, 23, 42, 0.8), rgba(15, 23, 42, 0)), var(--qc-app-surface);
		color: #e5edf7;
	}

	:root[data-theme='dark'] .blog-article-hero,
	:root[data-theme='dark'] .blog-quick-take,
	:root[data-theme='dark'] .blog-article-cta,
	:root[data-theme='dark'] .blog-faq details,
	:root[data-theme='dark'] :global(.markdown-content.blog-article-body table),
	:root[data-theme='dark'] :global(.markdown-content.blog-article-body th),
	:root[data-theme='dark'] :global(.markdown-content.blog-article-body td) {
		border-color: rgba(148, 163, 184, 0.24);
	}

	:root[data-theme='dark'] .blog-quick-take,
	:root[data-theme='dark'] .blog-article-cta,
	:root[data-theme='dark'] .blog-faq details,
	:root[data-theme='dark'] :global(.markdown-content.blog-article-body table) {
		background: rgba(15, 23, 42, 0.72);
	}

	:root[data-theme='dark'] .blog-article-hero h1,
	:root[data-theme='dark'] .blog-faq h2,
	:root[data-theme='dark'] .blog-faq summary,
	:root[data-theme='dark'] .blog-sources h2,
	:root[data-theme='dark'] .blog-article-cta h2,
	:root[data-theme='dark'] .related-posts h2,
	:root[data-theme='dark'] :global(.markdown-content.blog-article-body h2),
	:root[data-theme='dark'] :global(.markdown-content.blog-article-body th) {
		color: #eaf2f8;
	}

	:root[data-theme='dark'] .blog-faq summary::marker,
	:root[data-theme='dark'] .blog-faq summary::-webkit-details-marker {
		color: #8de0b4;
	}

	:root[data-theme='dark'] .blog-article-hero p,
	:root[data-theme='dark'] .blog-quick-take p:last-child,
	:root[data-theme='dark'] .blog-article-cta p,
	:root[data-theme='dark'] .blog-faq details p,
	:root[data-theme='dark'] .blog-sources ul,
	:root[data-theme='dark'] :global(.markdown-content.blog-article-body) {
		color: #a9b8c8;
	}

	:root[data-theme='dark'] .blog-article-tags span,
	:root[data-theme='dark'] :global(.markdown-content.blog-article-body th) {
		border-color: rgba(148, 163, 184, 0.28);
		background: rgba(15, 23, 42, 0.82);
		color: #d5e2ee;
	}

	:root[data-theme='dark'] .blog-sources a,
	:root[data-theme='dark'] .blog-article-cta a,
	:root[data-theme='dark'] .blog-breadcrumb a {
		color: #8de0b4;
	}

	@media (max-width: 720px) {
		.blog-article-cta {
			grid-template-columns: 1fr;
		}
	}
</style>
