<script lang="ts">
	import { resolve } from '$app/paths';
	import { BookOpen } from '@lucide/svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const canonicalUrl = 'https://constellation.eviworld.com/past-papers/gcse';
	const pageDescription =
		'Download free GCSE past papers and mark schemes for AQA, Edexcel, OCR and WJEC by exam board and subject.';
	const pageTitle = 'Free GCSE Past Papers | AQA, Edexcel, OCR, WJEC | Question Constellation';
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
						name: 'GCSE Past Papers',
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				name: 'GCSE Past Papers',
				description: pageDescription,
				url: canonicalUrl,
				isPartOf: {
					'@type': 'WebSite',
					name: 'Question Constellation',
					url: 'https://constellation.eviworld.com/'
				},
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: data.boards.length,
					itemListElement: data.boards.map((board, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						name: `${board.name} GCSE Past Papers`,
						url: `https://constellation.eviworld.com${board.localPath}`
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
	<meta property="og:image" content="https://constellation.eviworld.com/icon-512.png" />
	<meta property="og:image:alt" content="Question Constellation" />

	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content="https://constellation.eviworld.com/icon-512.png" />

	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdScript}
</svelte:head>

<div class="past-papers-shell">
	<AppTopbar showSearch={false} showSubject={false} />

	<main class="past-papers-page">
		<section class="past-papers-hero" aria-labelledby="past-papers-title">
			<p class="past-papers-kicker">GCSE paper atlas</p>
			<div class="past-papers-hero-grid">
				<div>
					<h1 id="past-papers-title">GCSE Past Papers</h1>
					<p>
						Download GCSE question papers, mark schemes and inserts across AQA, Edexcel, OCR and
						WJEC.
					</p>
				</div>
			</div>
		</section>

		<section class="subject-directory" aria-labelledby="subject-directory-title">
			<div class="section-heading">
				<h2 id="subject-directory-title">Choose Your Exam Board</h2>
			</div>

			<div class="board-grid">
				{#each data.boards as board (board.id)}
					<a class="board-card" href={resolve('/past-papers/gcse/[board]', { board: board.id })}>
						<span class="board-card-title">
							<BookOpen size={18} aria-hidden="true" strokeWidth={2.2} />
							<span>{board.name}</span>
						</span>
						<span class="board-card-copy">Past papers by subject</span>
					</a>
				{/each}
			</div>
		</section>

		<section class="seo-copy" aria-label="About GCSE past papers">
			<h2>Free GCSE Past Papers And Mark Schemes</h2>
			<p>
				Use this directory to find GCSE past papers by exam board, subject, tier and year. The
				download pages include question papers, mark schemes and inserts where they are available.
			</p>
		</section>
	</main>
</div>

<style>
	.past-papers-shell {
		width: 100%;
		min-height: var(--app-viewport-height, 100vh);
		display: flex;
		flex-direction: column;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.52), rgba(255, 255, 255, 0)),
			var(--qc-app-surface);
		color: #0b1020;
	}

	.past-papers-page {
		width: min(100%, 91rem);
		margin: 0 auto;
		padding: 1rem clamp(0.9rem, 2.4vw, 2rem) 3rem;
	}

	.past-papers-hero {
		padding: clamp(1.1rem, 2.5vw, 2rem) 0;
		border-bottom: 1px solid rgba(105, 129, 143, 0.15);
	}

	.past-papers-kicker {
		margin: 0 0 0.65rem;
		color: #168458;
		font-size: 0.78rem;
		font-weight: 620;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	.past-papers-hero-grid {
		max-width: 48rem;
	}

	.past-papers-hero h1 {
		margin: 0;
		color: #123f35;
		font-size: clamp(1.45rem, 2.8vw, 2.25rem);
		line-height: 1.06;
		font-weight: 520;
		letter-spacing: 0;
	}

	.past-papers-hero p,
	.seo-copy p {
		color: #526778;
		font-weight: 400;
		line-height: 1.42;
	}

	.past-papers-hero p {
		margin: 0.75rem 0 0;
		font-size: 0.96rem;
	}

	.board-card:hover .board-card-title,
	.board-card:focus-visible .board-card-title {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.subject-directory,
	.seo-copy {
		padding-top: 1.6rem;
	}

	.section-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: end;
		margin-bottom: 0.8rem;
	}

	.section-heading h2,
	.seo-copy h2 {
		margin: 0;
		font-size: 1.08rem;
		font-weight: 620;
	}

	.seo-copy p {
		max-width: 40rem;
		margin: 0;
		font-size: 0.95rem;
	}

	.board-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.board-card {
		display: grid;
		gap: 0.45rem;
		min-height: 5rem;
		align-content: center;
		padding: 0.9rem;
		border: 1px solid #cbd7df;
		background: rgba(255, 255, 255, 0.82);
	}

	.board-card-title {
		display: inline-flex;
		align-items: flex-start;
		gap: 0.55rem;
		color: #0f172a;
		font-weight: 620;
		line-height: 1.25;
	}

	.board-card-title :global(svg) {
		flex: 0 0 auto;
		margin-top: 0.1rem;
	}

	.board-card-copy {
		color: #526778;
		font-size: 0.9rem;
	}

	.seo-copy {
		margin-top: 1.4rem;
		padding: 1.3rem;
		border: 1px solid #cbd7df;
		background: rgba(255, 255, 255, 0.82);
	}

	:global(:root[data-theme='dark']) .past-papers-shell {
		background: #020617;
		color: #e5edf6;
	}

	:global(:root[data-theme='dark']) .past-papers-hero {
		border-color: rgba(148, 163, 184, 0.22);
	}

	:global(:root[data-theme='dark']) .past-papers-kicker,
	:global(:root[data-theme='dark']) .board-card:hover .board-card-title,
	:global(:root[data-theme='dark']) .board-card:focus-visible .board-card-title {
		color: #7dd3a1;
	}

	:global(:root[data-theme='dark']) .past-papers-hero p,
	:global(:root[data-theme='dark']) .seo-copy p,
	:global(:root[data-theme='dark']) .board-card-copy {
		color: #9fb0c5;
	}

	:global(:root[data-theme='dark']) .board-card,
	:global(:root[data-theme='dark']) .seo-copy {
		border-color: #263449;
		background: rgba(15, 23, 42, 0.78);
	}

	:global(:root[data-theme='dark']) .board-card-title,
	:global(:root[data-theme='dark']) .past-papers-hero h1,
	:global(:root[data-theme='dark']) .section-heading h2,
	:global(:root[data-theme='dark']) .seo-copy h2 {
		color: #e5edf6;
	}

	@media (max-width: 900px) {
		.past-papers-page {
			padding: 0.9rem 0.78rem 3rem;
		}

		.past-papers-hero {
			padding-top: 1.8rem;
		}

		.section-heading {
			display: grid;
			align-items: start;
		}

		.board-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
