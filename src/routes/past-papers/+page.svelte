<script lang="ts">
	import { resolve } from '$app/paths';
	import { BookOpen } from '@lucide/svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';

	const canonicalUrl = 'https://constellation.eviworld.com/past-papers';
	const pageTitle = 'Free Past Papers | GCSE Past Papers | Question Constellation';
	const pageDescription =
		'Find free past papers, question papers, mark schemes and inserts by qualification, exam board and subject.';
	const gcsePath = resolve('/past-papers/gcse');
	const jsonLd = JSON.stringify([
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
					name: 'Past Papers',
					item: canonicalUrl
				}
			]
		},
		{
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: 'Past Papers',
			description: pageDescription,
			url: canonicalUrl,
			isPartOf: {
				'@type': 'WebSite',
				name: 'Question Constellation',
				url: 'https://constellation.eviworld.com/'
			},
			mainEntity: {
				'@type': 'ItemList',
				numberOfItems: 1,
				itemListElement: [
					{
						'@type': 'ListItem',
						position: 1,
						name: 'GCSE Past Papers',
						url: 'https://constellation.eviworld.com/past-papers/gcse'
					}
				]
			}
		}
	]).replace(/</g, '\\u003c');
	const jsonLdScript = `<script type="application/ld+json">${jsonLd}</` + 'script>';
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
	<AppTopbar showSearch={false} showSubject={false} showNavigation />

	<main class="past-papers-page">
		<section class="past-papers-hero" aria-labelledby="past-papers-title">
			<p class="past-papers-kicker">Exam paper atlas</p>
			<div class="past-papers-hero-grid">
				<div>
					<h1 id="past-papers-title">Past Papers</h1>
					<p>
						Find question papers, mark schemes and inserts by qualification, exam board and subject.
					</p>
				</div>
			</div>
		</section>

		<section class="qualification-directory" aria-labelledby="qualification-directory-title">
			<div class="section-heading">
				<h2 id="qualification-directory-title">Choose Your Qualification</h2>
			</div>

			<div class="qualification-grid">
				<a class="qualification-card" href={gcsePath}>
					<span class="qualification-card-title">
						<BookOpen size={18} aria-hidden="true" strokeWidth={2.2} />
						<span>GCSE Past Papers</span>
					</span>
					<span class="qualification-card-copy">AQA, Edexcel, OCR and WJEC</span>
				</a>
			</div>
		</section>

		<section class="seo-copy" aria-label="About free past papers">
			<h2>Free Past Papers And Mark Schemes</h2>
			<p>
				Start with GCSE past papers, then choose your exam board and subject. Download pages include
				question papers, mark schemes and inserts where they are available.
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

	.qualification-directory {
		padding-top: 1.6rem;
	}

	.section-heading {
		margin-bottom: 0.8rem;
	}

	.section-heading h2,
	.seo-copy h2 {
		margin: 0;
		color: #0f172a;
		font-size: 1.08rem;
		font-weight: 620;
	}

	.qualification-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
		gap: 0.7rem;
	}

	.qualification-card {
		display: grid;
		gap: 0.45rem;
		min-height: 6.5rem;
		padding: 1rem;
		border: 1px solid #d6e0e8;
		background: rgba(255, 255, 255, 0.72);
		color: #0f172a;
		text-decoration: none;
	}

	.qualification-card:hover,
	.qualification-card:focus-visible {
		border-color: #123f35;
		background: #ffffff;
		outline: none;
	}

	.qualification-card-title {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		font-size: 1rem;
		font-weight: 720;
	}

	.qualification-card-copy {
		color: #526778;
		font-size: 0.9rem;
		font-weight: 500;
	}

	.seo-copy {
		margin-top: 1.4rem;
		padding: 1.3rem;
		border: 1px solid #cbd7df;
		background: rgba(255, 255, 255, 0.82);
	}

	.seo-copy p {
		max-width: 40rem;
		margin: 0;
		font-size: 0.95rem;
	}

	:global(:root[data-theme='dark']) .past-papers-shell {
		background:
			linear-gradient(180deg, rgba(15, 23, 42, 0.7), rgba(15, 23, 42, 0)), var(--qc-app-surface);
		color: #e5edf6;
	}

	:global(:root[data-theme='dark']) .past-papers-hero,
	:global(:root[data-theme='dark']) .seo-copy {
		border-color: #263449;
	}

	:global(:root[data-theme='dark']) .past-papers-kicker {
		color: #7dd3a1;
	}

	:global(:root[data-theme='dark']) .past-papers-hero h1,
	:global(:root[data-theme='dark']) .section-heading h2,
	:global(:root[data-theme='dark']) .seo-copy h2,
	:global(:root[data-theme='dark']) .qualification-card {
		color: #f8fafc;
	}

	:global(:root[data-theme='dark']) .past-papers-hero p,
	:global(:root[data-theme='dark']) .seo-copy p,
	:global(:root[data-theme='dark']) .qualification-card-copy {
		color: #a8b7ca;
	}

	:global(:root[data-theme='dark']) .qualification-card {
		border-color: #334155;
		background: rgba(15, 23, 42, 0.76);
	}

	:global(:root[data-theme='dark']) .seo-copy {
		background: rgba(15, 23, 42, 0.78);
	}

	:global(:root[data-theme='dark']) .qualification-card:hover,
	:global(:root[data-theme='dark']) .qualification-card:focus-visible {
		border-color: #7dd3a1;
		background: #111c2f;
	}

	@media (max-width: 640px) {
		.past-papers-page {
			padding-inline: 0.8rem;
		}
	}
</style>
