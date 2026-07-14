<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const canonicalUrl = $derived(`https://constellation.eviworld.com${data.board.localPath}`);
	const pageTitle = $derived(`${data.board.name} GCSE Past Papers | Question Constellation`);
	const pageDescription = $derived(
		`Download ${data.board.name} GCSE past papers and mark schemes by subject, including separate science, combined science, maths, English and humanities.`
	);
	const boardPath = $derived(resolve('/past-papers/gcse/[board]', { board: data.board.id }));
	const subjectPages = $derived(data.categories.flatMap((category) => category.pages));
	function subjectVariantLinkText(
		subject: PageData['categories'][number]['subjects'][number],
		variant: PageData['categories'][number]['subjects'][number]['variants'][number]
	) {
		return `${data.board.name} GCSE ${subject.subject}${variant.tier ? ` ${variant.tier}` : ''} past papers`;
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
						name: data.board.name,
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				name: `${data.board.name} GCSE Past Papers`,
				description: pageDescription,
				url: canonicalUrl,
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: subjectPages.length,
					itemListElement: subjectPages.slice(0, 50).map((page, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						name: `${page.boardName} GCSE ${page.subject}${page.tier ? ` ${page.tier}` : ''}`,
						url: `https://constellation.eviworld.com${page.localPath}`
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
			<a href={resolve('/past-papers/gcse')}>GCSE Past Papers</a>
			<span aria-hidden="true">/</span>
			<span>{data.board.name}</span>
		</nav>

		<section class="board-hero" aria-labelledby="board-title">
			<h1 id="board-title">{data.board.name} GCSE past papers</h1>
			<p>Choose your subject.</p>
		</section>

		<section class="subject-directory" aria-labelledby="subject-directory-title">
			<div class="section-heading">
				<h2 id="subject-directory-title">Subjects</h2>
			</div>

			<nav class="course-filter" aria-label="Filter courses">
				{#each data.courseFilters as filter (filter.id)}
					<a
						class:active-filter={data.selectedCourseId === filter.id}
						aria-current={data.selectedCourseId === filter.id ? 'page' : undefined}
						href={filter.id === 'all' ? boardPath : `${boardPath}?course=${filter.id}`}
					>
						{filter.label}
					</a>
				{/each}
			</nav>

			<div class="category-grid">
				{#each data.categories as category (category.name)}
					<section class="category-section" aria-labelledby={`course-${category.id}`}>
						{#if data.categories.length > 1}
							<h3 id={`course-${category.id}`}>{category.name}</h3>
						{:else}
							<span class="sr-only" id={`course-${category.id}`}>{category.name}</span>
						{/if}
						<div class="subject-grid">
							{#each category.subjects as subject (subject.id)}
								<article class="subject-card">
									<div class="subject-card-title">{subject.subject}</div>

									<div class="subject-tier-links" aria-label={`${subject.subject} tiers`}>
										{#each subject.variants as variant (variant.id)}
											{@const linkText = subjectVariantLinkText(subject, variant)}
											<a
												href={resolve('/past-papers/gcse/[board]/[subjectSlug]', {
													board: variant.boardId,
													subjectSlug: variant.subjectSlug
												})}
												title={linkText}
											>
												<span class="sr-only">{linkText}</span>
												<span aria-hidden="true">{variant.label}</span>
											</a>
										{/each}
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/each}
			</div>
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

	.board-hero {
		padding: clamp(1.1rem, 2.5vw, 2rem) 0;
		border-bottom: 1px solid rgba(105, 129, 143, 0.15);
	}

	.board-hero h1 {
		margin: 0;
		color: #123f35;
		font-size: clamp(1.45rem, 2.8vw, 2.25rem);
		line-height: 1.06;
		font-weight: 520;
		letter-spacing: 0;
	}

	.board-hero p {
		color: #526778;
		font-weight: 400;
		line-height: 1.42;
	}

	.board-hero p {
		margin: 0.75rem 0 0;
		font-size: 0.96rem;
	}

	.subject-directory {
		padding-top: 1.6rem;
	}

	.section-heading {
		margin-bottom: 0.8rem;
	}

	.section-heading h2 {
		margin: 0;
		font-size: 1.08rem;
		font-weight: 620;
	}

	.course-filter {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin: 0 0 0.9rem;
	}

	.course-filter a {
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

	.course-filter a:hover,
	.course-filter a:focus-visible,
	.subject-tier-links a:hover,
	.subject-tier-links a:focus-visible {
		color: #0f6b3d;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.course-filter a.active-filter {
		border-color: #0f6b3d;
		background: rgba(15, 107, 61, 0.07);
		color: #0f6b3d;
	}

	.category-grid {
		display: grid;
		gap: 1rem;
	}

	.category-section {
		display: grid;
		gap: 0.65rem;
		padding: 1rem;
		border: 1px solid #cbd7df;
		background: rgba(255, 255, 255, 0.72);
	}

	.category-section h3 {
		margin: 0;
		color: #526778;
		font-size: 0.9rem;
		font-weight: 620;
	}

	.subject-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.subject-card {
		display: grid;
		gap: 0.75rem;
		min-height: 5.5rem;
		align-content: space-between;
		padding: 0.75rem 0.8rem;
		border: 1px solid #cbd7df;
		background: rgba(255, 255, 255, 0.82);
	}

	.subject-card-title {
		display: inline-flex;
		align-items: flex-start;
		gap: 0.55rem;
		color: #0f172a;
		font-weight: 620;
		line-height: 1.25;
	}

	.subject-tier-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.42rem;
	}

	.subject-tier-links a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 1.95rem;
		padding: 0.34rem 0.56rem;
		border: 1px solid #cbd7df;
		background: #ffffff;
		color: #34495e;
		font-size: 0.82rem;
		font-weight: 620;
		line-height: 1;
	}

	:global(:root[data-theme='dark']) .past-papers-shell {
		background: #020617;
		color: #e5edf6;
	}

	:global(:root[data-theme='dark']) .board-hero {
		border-color: rgba(148, 163, 184, 0.22);
	}

	:global(:root[data-theme='dark']) .breadcrumb a,
	:global(:root[data-theme='dark']) .course-filter a:hover,
	:global(:root[data-theme='dark']) .course-filter a:focus-visible,
	:global(:root[data-theme='dark']) .course-filter a.active-filter,
	:global(:root[data-theme='dark']) .subject-tier-links a:hover,
	:global(:root[data-theme='dark']) .subject-tier-links a:focus-visible {
		color: #7dd3a1;
	}

	:global(:root[data-theme='dark']) .board-hero p,
	:global(:root[data-theme='dark']) .breadcrumb,
	:global(:root[data-theme='dark']) .category-section h3 {
		color: #9fb0c5;
	}

	:global(:root[data-theme='dark']) .course-filter a,
	:global(:root[data-theme='dark']) .subject-tier-links a,
	:global(:root[data-theme='dark']) .category-section,
	:global(:root[data-theme='dark']) .subject-card {
		border-color: #263449;
		background: rgba(15, 23, 42, 0.78);
	}

	:global(:root[data-theme='dark']) .course-filter a {
		color: #cbd5e1;
	}

	:global(:root[data-theme='dark']) .subject-tier-links a {
		background: rgba(15, 23, 42, 0.92);
		color: #cbd5e1;
	}

	:global(:root[data-theme='dark']) .course-filter a.active-filter {
		border-color: #2f9f72;
		background: rgba(47, 159, 114, 0.12);
	}

	:global(:root[data-theme='dark']) .subject-card-title,
	:global(:root[data-theme='dark']) .board-hero h1,
	:global(:root[data-theme='dark']) .section-heading h2 {
		color: #e5edf6;
	}

	@media (max-width: 1100px) {
		.subject-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 900px) {
		.past-papers-page {
			padding: 0.9rem 0.78rem 3rem;
		}

		.board-hero {
			padding-top: 1.8rem;
		}

		.subject-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
