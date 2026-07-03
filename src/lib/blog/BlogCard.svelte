<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight } from '@lucide/svelte';
	import { formatArticleDate } from './format';
	import type { BlogArticleMeta } from './types';

	let { article, compact = false }: { article: BlogArticleMeta; compact?: boolean } = $props();

	const articleHref = $derived(resolve('/blog/[slug]', { slug: article.slug }));
</script>

<a class="blog-card" class:compact href={articleHref} aria-label={`Read ${article.title}`}>
	<div class="blog-card-meta">
		<span>{article.category}</span>
		<span>{formatArticleDate(article.publishedAt)}</span>
		<span>{article.readMinutes} min read</span>
	</div>
	<h2>{article.title}</h2>
	<p>{article.description}</p>
	<div class="blog-card-tags" aria-label="Article tags">
		{#each article.tags.slice(0, compact ? 2 : 3) as tag (tag)}
			<span>{tag}</span>
		{/each}
	</div>
	<span class="blog-card-link">
		Read article
		<ArrowRight size={16} aria-hidden="true" strokeWidth={2.2} />
	</span>
</a>

<style>
	.blog-card {
		display: grid;
		align-content: start;
		gap: 0.75rem;
		min-width: 0;
		min-height: 100%;
		padding: 1rem;
		border: 1px solid #102033;
		background: rgba(255, 255, 255, 0.74);
		color: #0f172a;
		text-decoration: none;
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease,
			background-color 160ms ease;
	}

	.blog-card.compact {
		padding: 0.9rem;
	}

	.blog-card:hover,
	.blog-card:focus-visible {
		border-color: #168458;
		background: rgba(255, 255, 255, 0.9);
		box-shadow: 0 0 0 2px color-mix(in srgb, #168458 24%, transparent);
		outline: none;
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
		line-height: 1.22;
		font-weight: 560;
		letter-spacing: 0;
	}

	.blog-card:hover h2,
	.blog-card:focus-visible h2 {
		color: #0f6b3d;
	}

	.blog-card p {
		margin: 0;
		color: #526778;
		font-size: 0.94rem;
		line-height: 1.55;
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
		font-weight: 560;
		text-decoration: none;
	}

	:root[data-theme='dark'] .blog-card {
		border-color: rgba(148, 163, 184, 0.24);
		background: rgba(15, 23, 42, 0.72);
		color: #e5edf7;
	}

	:root[data-theme='dark'] .blog-card:hover,
	:root[data-theme='dark'] .blog-card:focus-visible {
		border-color: #8de0b4;
		background: rgba(15, 23, 42, 0.86);
		box-shadow: 0 0 0 2px color-mix(in srgb, #8de0b4 34%, transparent);
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
	:root[data-theme='dark'] .blog-card:hover h2,
	:root[data-theme='dark'] .blog-card:focus-visible h2 {
		color: #8de0b4;
	}
</style>
