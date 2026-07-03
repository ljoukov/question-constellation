<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight } from '@lucide/svelte';
	import { formatArticleDate } from './format';
	import type { BlogArticleMeta } from './types';

	let { article, compact = false }: { article: BlogArticleMeta; compact?: boolean } = $props();

	const articleHref = $derived(resolve('/blog/[slug]', { slug: article.slug }));
</script>

<article class="blog-card" class:compact>
	<div class="blog-card-meta">
		<span>{article.category}</span>
		<span>{formatArticleDate(article.publishedAt)}</span>
		<span>{article.readMinutes} min read</span>
	</div>
	<h2>
		<a href={articleHref}>{article.title}</a>
	</h2>
	<p>{article.description}</p>
	<div class="blog-card-tags" aria-label="Article tags">
		{#each article.tags.slice(0, compact ? 2 : 3) as tag (tag)}
			<span>{tag}</span>
		{/each}
	</div>
	<a class="blog-card-link" href={articleHref}>
		Read article
		<ArrowRight size={16} aria-hidden="true" strokeWidth={2.2} />
	</a>
</article>

<style>
	.blog-card {
		display: grid;
		align-content: start;
		gap: 0.75rem;
		min-width: 0;
		min-height: 100%;
		padding: 1rem;
		border: 1px solid #d6e0e8;
		background: rgba(255, 255, 255, 0.74);
		color: #0f172a;
	}

	.blog-card.compact {
		padding: 0.9rem;
	}

	.blog-card-meta,
	.blog-card-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		color: #64748b;
		font-size: 0.78rem;
		line-height: 1.25;
	}

	.blog-card-meta span + span::before {
		content: '/';
		margin-right: 0.45rem;
		color: #9aa8b6;
	}

	.blog-card h2 {
		margin: 0;
		color: #102033;
		font-size: clamp(1.05rem, 1.7vw, 1.28rem);
		line-height: 1.16;
		font-weight: 620;
		letter-spacing: 0;
	}

	.blog-card h2 a {
		color: inherit;
		text-decoration: none;
	}

	.blog-card h2 a:hover,
	.blog-card h2 a:focus-visible {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
		outline: none;
	}

	.blog-card p {
		margin: 0;
		color: #526778;
		font-size: 0.92rem;
		line-height: 1.45;
	}

	.blog-card-tags span {
		border: 1px solid #dce7ef;
		padding: 0.2rem 0.42rem;
		background: rgba(239, 248, 248, 0.7);
		color: #31586b;
	}

	.blog-card-link {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		width: fit-content;
		color: #0f6b3d;
		font-size: 0.9rem;
		font-weight: 620;
		text-decoration: none;
	}

	.blog-card-link:hover,
	.blog-card-link:focus-visible {
		text-decoration: underline;
		text-underline-offset: 0.18em;
		outline: none;
	}

	:root[data-theme='dark'] .blog-card {
		border-color: rgba(148, 163, 184, 0.24);
		background: rgba(15, 23, 42, 0.72);
		color: #e5edf7;
	}

	:root[data-theme='dark'] .blog-card h2 {
		color: #eaf2f8;
	}

	:root[data-theme='dark'] .blog-card p,
	:root[data-theme='dark'] .blog-card-meta {
		color: #a9b8c8;
	}

	:root[data-theme='dark'] .blog-card-tags span {
		border-color: rgba(148, 163, 184, 0.28);
		background: rgba(15, 23, 42, 0.82);
		color: #b7c7d8;
	}

	:root[data-theme='dark'] .blog-card-link,
	:root[data-theme='dark'] .blog-card h2 a:hover,
	:root[data-theme='dark'] .blog-card h2 a:focus-visible {
		color: #8de0b4;
	}
</style>
