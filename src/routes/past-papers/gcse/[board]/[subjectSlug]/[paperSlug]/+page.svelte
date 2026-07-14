<script lang="ts">
	import { resolve } from '$app/paths';
	import { Download, FileCheck2, FileText, Layers } from '@lucide/svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import PastPaperDownloadRows from '$lib/pastPapers/PastPaperDownloadRows.svelte';
	import type { PastPaperDocument } from '$lib/pastPapers/gcsePastPapers';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const paperTitle = $derived(
		`${data.page.pageLabel} ${data.page.entry.paper} ${data.page.entry.series} ${data.page.entry.year}`
	);
	const canonicalUrl = $derived(`https://constellation.eviworld.com${data.page.localPath}`);
	const pageTitle = $derived(`${paperTitle} | Past Paper and Mark Scheme`);
	const pageDescription = $derived(
		`Download ${paperTitle} GCSE question paper, mark scheme and supporting documents.`
	);
	const subjectPath = $derived(
		resolve('/past-papers/gcse/[board]/[subjectSlug]', {
			board: data.page.boardId,
			subjectSlug: data.page.subjectSlug
		})
	);

	function documentText(document: PastPaperDocument) {
		if (document.type === 'questionPaper') return 'Question paper';
		if (document.type === 'markScheme') return 'Mark scheme';
		if (document.type === 'insert') return 'Insert';
		return document.label;
	}

	function documentClass(document: PastPaperDocument) {
		return `document-card document-${document.type}`;
	}

	function documentLabel(document: PastPaperDocument) {
		return `${paperTitle} ${documentText(document)} PDF`;
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
						item: `https://constellation.eviworld.com${data.page.subjectPath}`
					},
					{
						'@type': 'ListItem',
						position: 4,
						name: paperTitle,
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'WebPage',
				name: paperTitle,
				description: pageDescription,
				url: canonicalUrl,
				isPartOf: {
					'@type': 'CollectionPage',
					name: `${data.page.pageLabel} Past Papers`,
					url: `https://constellation.eviworld.com${data.page.subjectPath}`
				},
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: data.page.entry.documents.length,
					itemListElement: data.page.entry.documents.map((document, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						item: {
							'@type': 'DigitalDocument',
							name: documentLabel(document),
							url: document.url
						}
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
	<AppTopbar user={data.user} showSearch={false} showSubject={false} showNavigation />

	<main class="past-papers-page">
		<nav class="breadcrumb" aria-label="Breadcrumb">
			<a href={resolve('/past-papers/gcse')}>GCSE</a>
			<span aria-hidden="true">/</span>
			<a href={resolve(`/past-papers/gcse/${data.page.boardId}`)}>{data.page.boardName}</a>
			<span aria-hidden="true">/</span>
			<a href={subjectPath}>{data.page.pageLabel}</a>
		</nav>

		<section class="paper-hero" aria-labelledby="paper-title">
			<h1 id="paper-title">{paperTitle}</h1>
		</section>

		<section class="download-section" aria-labelledby="download-title">
			<div class="section-heading">
				<h2 id="download-title">Files</h2>
			</div>

			<div class="document-grid">
				{#each data.page.entry.documents as document (document.url + document.label)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						class={documentClass(document)}
						href={document.url}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={documentLabel(document)}
					>
						<span class="document-icon" aria-hidden="true">
							{#if document.type === 'markScheme'}
								<FileCheck2 size={20} strokeWidth={2.1} />
							{:else if document.type === 'insert'}
								<Layers size={20} strokeWidth={2.1} />
							{:else}
								<FileText size={20} strokeWidth={2.1} />
							{/if}
						</span>
						<span>
							<strong>{documentText(document)}</strong>
							<small>PDF · opens in a new tab</small>
						</span>
						<Download size={17} aria-hidden="true" strokeWidth={2.2} />
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/each}
			</div>
		</section>

		{#if data.page.relatedRows.length > 0}
			<section class="related-section" aria-labelledby="related-title">
				<div class="section-heading related-heading">
					<h2 id="related-title">More papers</h2>
					<a href={subjectPath}>View all {data.page.pageLabel}</a>
				</div>

				<PastPaperDownloadRows rows={data.page.relatedRows} />
			</section>
		{/if}
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

	.paper-hero {
		padding: clamp(1.1rem, 2.5vw, 2rem) 0;
		border-bottom: 1px solid rgba(105, 129, 143, 0.15);
	}

	.paper-hero h1 {
		margin: 0;
		color: #123f35;
		font-size: clamp(1.45rem, 2.8vw, 2.25rem);
		line-height: 1.06;
		font-weight: 520;
		letter-spacing: 0;
	}

	.download-section,
	.related-section {
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

	.section-heading a {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.related-heading {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.65rem 1rem;
		align-items: baseline;
	}

	.document-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
		gap: 0.75rem;
	}

	.document-card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.8rem;
		align-items: center;
		min-height: 5.4rem;
		padding: 0.9rem 1rem;
		border: 1px solid #cbd7df;
		background: rgba(255, 255, 255, 0.82);
		color: #183047;
		text-decoration: none;
	}

	.document-card:hover,
	.document-card:focus-visible {
		border-color: #10253a;
		background: #f6fafb;
	}

	.document-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.4rem;
		height: 2.4rem;
		border: 1px solid currentColor;
	}

	.document-card strong,
	.document-card small {
		display: block;
		min-width: 0;
	}

	.document-card strong {
		color: #0f172a;
		font-size: 0.98rem;
		font-weight: 720;
	}

	.document-card small {
		margin-top: 0.18rem;
		color: #526778;
		font-size: 0.82rem;
		line-height: 1.35;
	}

	.document-questionPaper {
		border-color: #b8d0c2;
		color: #0f6b3d;
	}

	.document-markScheme {
		border-color: #bfcee6;
		color: #1d4f91;
	}

	.document-insert {
		border-color: #ead295;
		color: #795719;
	}

	.related-section :global(.paper-table) {
		border: 1px solid #cbd7df;
		background: rgba(255, 255, 255, 0.82);
	}

	:global(:root[data-theme='dark']) .past-papers-shell {
		background: #020617;
		color: #e5edf6;
	}

	:global(:root[data-theme='dark']) .paper-hero {
		border-color: rgba(148, 163, 184, 0.22);
	}

	:global(:root[data-theme='dark']) .breadcrumb a,
	:global(:root[data-theme='dark']) .section-heading a {
		color: #7dd3a1;
	}

	:global(:root[data-theme='dark']) .breadcrumb,
	:global(:root[data-theme='dark']) .document-card small {
		color: #9fb0c5;
	}

	:global(:root[data-theme='dark']) .paper-hero h1,
	:global(:root[data-theme='dark']) .section-heading h2,
	:global(:root[data-theme='dark']) .document-card strong {
		color: #e5edf6;
	}

	:global(:root[data-theme='dark']) .document-card,
	:global(:root[data-theme='dark']) .related-section :global(.paper-table) {
		border-color: #263449;
		background: rgba(15, 23, 42, 0.78);
	}

	:global(:root[data-theme='dark']) .document-card:hover,
	:global(:root[data-theme='dark']) .document-card:focus-visible {
		border-color: #7dd3a1;
		background: rgba(15, 23, 42, 0.96);
	}

	@media (max-width: 900px) {
		.past-papers-page {
			padding: 0.9rem 0.78rem 3rem;
		}
	}
</style>
