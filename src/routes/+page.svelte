<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import SignedInHome from '$lib/learning/SignedInHome.svelte';
	import type { ChainQuestionTeaser, LearningChain } from '$lib/learningChains';
	import { ArrowRight } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const questionBankHref = resolve('/questions');
	const pastPapersHref = resolve('/past-papers/gcse');
	const featuredChain = $derived(data.featuredChains[0] ?? null);
	const featuredQuestion = $derived(featuredChain?.questions[0] ?? null);
	const websiteJsonLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'Question Constellation',
		alternateName: 'GCSE Question Constellation',
		url: 'https://constellation.eviworld.com/'
	}).replace(/</g, '\\u003c');
	const websiteJsonLdScript = `<script type="application/ld+json">${websiteJsonLd}</` + 'script>';
	const startQuestionHref = $derived(
		featuredChain && featuredQuestion
			? questionHref(featuredChain, featuredQuestion)
			: questionBankHref
	);

	const subjectEntryPoints = [
		{
			label: 'Biology',
			meta: 'AQA GCSE Science',
			href: `${questionBankHref}?subject=Biology`
		},
		{
			label: 'Chemistry',
			meta: 'AQA GCSE Science',
			href: `${questionBankHref}?subject=Chemistry`
		},
		{
			label: 'Physics',
			meta: 'AQA GCSE Science',
			href: `${questionBankHref}?subject=Physics`
		},
		{
			label: 'English Language',
			meta: 'GCSE English',
			href: `${questionBankHref}?subject=English%20Language`
		},
		{
			label: 'English Literature',
			meta: 'GCSE English',
			href: `${questionBankHref}?subject=English%20Literature`
		},
		{
			label: 'Computer Science',
			meta: 'GCSE Computer Science',
			href: `${questionBankHref}?subject=Computer%20Science`
		},
		{
			label: 'Geography',
			meta: 'GCSE Geography',
			href: `${questionBankHref}?subject=Geography`
		},
		{
			label: 'History',
			meta: 'GCSE History',
			href: `${questionBankHref}?subject=History`
		}
	];

	function questionHref(chain: LearningChain, question: ChainQuestionTeaser) {
		if (question.id) {
			return resolve('/questions/[questionId]', { questionId: question.id });
		}
		return resolve('/constellations/[chainId]', { chainId: chain.id });
	}
</script>

<svelte:head>
	<title
		>{data.user && data.dashboard
			? 'Your GCSE practice | Question Constellation'
			: 'Free GCSE Questions And Past Papers | Question Constellation'}</title
	>
	<meta
		name="description"
		content={data.user && data.dashboard
			? 'See your progress by subject and start the next GCSE practice activity selected for you.'
			: 'Free GCSE exam questions: try a real question, see the answer chain behind the marks, then practise similar questions.'}
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/" />
	<meta property="og:title" content="Free GCSE Questions And Past Papers" />
	<meta property="og:site_name" content="Question Constellation" />
	<meta
		property="og:description"
		content="GCSE exam questions with answer chains, marking points and similar practice questions."
	/>
	<meta
		property="og:image"
		content="https://constellation.eviworld.com/product/question-flow.webp"
	/>
	<meta property="og:url" content="https://constellation.eviworld.com/" />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html websiteJsonLdScript}
</svelte:head>

<main
	class:qc-real-app={Boolean(data.user && data.dashboard)}
	class:qc-dashboard-page={Boolean(data.user && data.dashboard)}
	class:qc-home-app={!data.user || !data.dashboard}
	class:qc-home-simplified={!data.user || !data.dashboard}
>
	<AppTopbar user={data.user} showSearch={false} showNavigation />

	{#if data.user && data.dashboard}
		<SignedInHome
			dashboard={data.dashboard}
			userId={data.user.uid}
			challengeProgress={data.challengeProgress}
			challengeCatalog={data.challengeCatalog}
			challengeRecommendation={data.challengeRecommendation}
			challengeCompletedCount={data.challengeCompletedCount}
			challengeTotalBestScore={data.challengeTotalBestScore}
			snapshotInitialising={data.snapshotInitialising}
			pendingLocalSubjects={data.pendingLocalSubjects}
		/>
	{:else}
		<section class="qc-home-hero qc-home-hero-simple" aria-labelledby="home-title">
			<div class="qc-home-hero-content">
				<div class="qc-home-hero-copy-block">
					<p class="qc-home-eyebrow">Free GCSE exam questions</p>
					<h1 id="home-title">See how the marks are won.</h1>
					<p class="qc-home-hero-copy">
						Start with a real exam question. Reveal the answer chain behind it, then try the same
						method in a new question.
					</p>
					<div class="qc-home-actions" aria-label="Homepage actions">
						<a class="qc-home-button primary" href={startQuestionHref}>
							Try a question
							<ArrowRight size={18} aria-hidden="true" />
						</a>
						<a class="qc-home-button secondary" href={questionBankHref}>Choose a subject</a>
					</div>
					<a class="qc-home-quiet-link" href={pastPapersHref}>Looking for a full past paper?</a>
				</div>

				{#if featuredChain && featuredQuestion}
					<aside
						class="qc-home-hero-preview qc-home-question-preview"
						aria-label="Featured question"
					>
						<p class="qc-home-mini-label">
							<MathText
								text={`${featuredChain.subject} · ${featuredQuestion.marks ?? '?'} marks`}
							/>
						</p>
						<h2><MathText text={featuredQuestion.title} /></h2>
						<p><MathText text={featuredQuestion.teaser} /></p>
					</aside>
				{/if}
			</div>
		</section>

		<section
			class="qc-home-section qc-home-subjects qc-home-subjects-simple"
			aria-labelledby="subject-title"
		>
			<div class="qc-home-section-head">
				<p class="qc-home-eyebrow">Choose a subject</p>
				<h2 id="subject-title">Find questions for your subject.</h2>
			</div>
			<div class="qc-home-subject-grid qc-home-subject-grid-simple">
				{#each subjectEntryPoints as subject (subject.label)}
					<article>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a class="qc-home-subject-main" href={subject.href}>
							<span>{subject.meta}</span>
							<strong>{subject.label}</strong>
							<ArrowRight size={17} aria-hidden="true" />
						</a>
					</article>
				{/each}
			</div>
		</section>
	{/if}
</main>
