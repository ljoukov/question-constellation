<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import PastPaperDownloadRows from '$lib/pastPapers/PastPaperDownloadRows.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const canonicalUrl = $derived(`https://constellation.eviworld.com${data.page.localPath}`);
	const pageTitle = $derived(`${data.page.pageLabel} Past Papers | Question Constellation`);
	const firstYear = $derived(Math.min(...data.page.rows.map((row) => row.year)));
	const latestYear = $derived(Math.max(...data.page.rows.map((row) => row.year)));
	const subjectPath = $derived(
		resolve('/past-papers/gcse/[board]/[subjectSlug]', {
			board: data.page.boardId,
			subjectSlug: data.page.subjectSlug
		})
	);
	const pageDescription = $derived(
		`Download ${data.page.pageLabel} GCSE past papers, mark schemes and inserts from ${firstYear}-${latestYear}.`
	);
	function paperFilterLinkText(filterLabel: string) {
		return `${data.page.pageLabel} ${filterLabel} past papers`;
	}
	const jsonLd = $derived.by(() =>
		JSON.stringify([
			{
				'@context': 'https://schema.org',
				'@type': 'BreadcrumbList',
				itemListElement: [
					{
						'@type': 'ListItem',
						position: 1,
						name: 'GCSE Past Papers',
						item: 'https://constellation.eviworld.com/past-papers/gcse'
					},
					{
						'@type': 'ListItem',
						position: 2,
						name: data.page.boardName,
						item: `https://constellation.eviworld.com/past-papers/gcse/${data.page.boardId}`
					},
					{
						'@type': 'ListItem',
						position: 3,
						name: data.page.pageLabel,
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				name: data.page.pageLabel,
				description: pageDescription,
				url: canonicalUrl,
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: data.page.rows.length,
					itemListElement: data.page.rows.slice(0, 50).map((row, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						name: `${data.page.pageLabel} ${row.year} ${row.series} ${row.paper}`
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
		<nav class="breadcrumb" aria-label="Breadcrumb">
			<a href={resolve('/past-papers/gcse')}>GCSE Past Papers</a>
			<span aria-hidden="true">/</span>
			<a href={resolve(`/past-papers/gcse/${data.page.boardId}`)}>{data.page.boardName}</a>
			<span aria-hidden="true">/</span>
			<span>{data.page.subject}{data.page.tier ? ` ${data.page.tier}` : ''}</span>
		</nav>

		<section class="subject-hero" aria-labelledby="subject-title">
			<p class="subject-kicker">{data.page.category}</p>
			<div class="subject-hero-grid">
				<div>
					<h1 id="subject-title">{data.page.pageLabel} Past Papers</h1>
					<p>{data.page.description || pageDescription}</p>
				</div>
			</div>
		</section>

		<section class="download-section" aria-labelledby="download-title">
			<div class="section-heading">
				<h2 id="download-title">Download Papers</h2>
				<p>Question papers, mark schemes and inserts are listed where they are available.</p>
			</div>

			{#if data.page.paperFilters.length > 1}
				<nav class="paper-filter" aria-label="Filter papers">
					<a
						class:active-filter={data.page.selectedPaperFilterId === 'all'}
						aria-current={data.page.selectedPaperFilterId === 'all' ? 'page' : undefined}
						href={subjectPath}
						title={paperFilterLinkText('all papers')}
					>
						<span class="sr-only">{paperFilterLinkText('all papers')}</span>
						<span aria-hidden="true">All papers</span>
					</a>
					{#each data.page.paperFilters as filter (filter.id)}
						<a
							class:active-filter={data.page.selectedPaperFilterId === filter.id}
							aria-current={data.page.selectedPaperFilterId === filter.id ? 'page' : undefined}
							href={`${subjectPath}?paper=${filter.id}`}
							title={paperFilterLinkText(filter.label)}
						>
							<span class="sr-only">{paperFilterLinkText(filter.label)}</span>
							<span aria-hidden="true">{filter.label}</span>
						</a>
					{/each}
				</nav>
			{/if}

			<PastPaperDownloadRows rows={data.page.rows} />
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

	.breadcrumb {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		align-items: center;
		color: #64748b;
		font-size: 0.86rem;
		font-weight: 460;
	}

	.breadcrumb a {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.subject-hero {
		padding: clamp(1.1rem, 2.5vw, 2rem) 0;
		border-bottom: 1px solid rgba(105, 129, 143, 0.15);
	}

	.subject-kicker {
		margin: 0 0 0.65rem;
		color: #168458;
		font-size: 0.78rem;
		font-weight: 620;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	.subject-hero-grid {
		max-width: 52rem;
	}

	.subject-hero h1 {
		margin: 0;
		color: #123f35;
		font-size: clamp(1.45rem, 2.8vw, 2.25rem);
		line-height: 1.06;
		font-weight: 520;
		letter-spacing: 0;
	}

	.subject-hero p,
	.section-heading p {
		color: #526778;
		font-weight: 400;
		line-height: 1.42;
	}

	.subject-hero p {
		margin: 0.75rem 0 0;
		font-size: 0.96rem;
	}

	.download-section {
		padding-top: 1.6rem;
	}

	.section-heading {
		display: grid;
		gap: 0.35rem;
		align-items: start;
		margin-bottom: 0.8rem;
	}

	.section-heading h2 {
		margin: 0;
		font-size: 1.08rem;
		font-weight: 620;
	}

	.section-heading p {
		max-width: 40rem;
		margin: 0;
		font-size: 0.95rem;
	}

	.paper-filter {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin: 0 0 0.9rem;
	}

	.paper-filter a {
		display: inline-flex;
		align-items: center;
		min-height: 2.25rem;
		padding: 0.45rem 0.72rem;
		border: 1px solid #cbd7df;
		background: rgba(255, 255, 255, 0.78);
		color: #34495e;
		font-size: 0.9rem;
		font-weight: 560;
	}

	.paper-filter a:hover,
	.paper-filter a:focus-visible {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.paper-filter a.active-filter {
		border-color: #0f6b3d;
		background: rgba(15, 107, 61, 0.07);
		color: #0f6b3d;
	}

	.download-section :global(.paper-table) {
		border: 1px solid #cbd7df;
		background: rgba(255, 255, 255, 0.82);
	}

	:global(:root[data-theme='dark']) .past-papers-shell {
		background: #020617;
		color: #e5edf6;
	}

	:global(:root[data-theme='dark']) .subject-hero {
		border-color: rgba(148, 163, 184, 0.22);
	}

	:global(:root[data-theme='dark']) .subject-kicker,
	:global(:root[data-theme='dark']) .breadcrumb a {
		color: #7dd3a1;
	}

	:global(:root[data-theme='dark']) .subject-hero p,
	:global(:root[data-theme='dark']) .section-heading p,
	:global(:root[data-theme='dark']) .breadcrumb {
		color: #9fb0c5;
	}

	:global(:root[data-theme='dark']) .download-section :global(.paper-table) {
		border-color: #263449;
		background: rgba(15, 23, 42, 0.78);
	}

	:global(:root[data-theme='dark']) .paper-filter a {
		border-color: #263449;
		background: rgba(15, 23, 42, 0.78);
		color: #cbd5e1;
	}

	:global(:root[data-theme='dark']) .paper-filter a:hover,
	:global(:root[data-theme='dark']) .paper-filter a:focus-visible,
	:global(:root[data-theme='dark']) .paper-filter a.active-filter {
		color: #7dd3a1;
	}

	:global(:root[data-theme='dark']) .paper-filter a.active-filter {
		border-color: #2f9f72;
		background: rgba(47, 159, 114, 0.12);
	}

	:global(:root[data-theme='dark']) .subject-hero h1,
	:global(:root[data-theme='dark']) .section-heading h2 {
		color: #e5edf6;
	}

	@media (max-width: 900px) {
		.past-papers-page {
			padding: 0.9rem 0.78rem 3rem;
		}
	}
</style>
