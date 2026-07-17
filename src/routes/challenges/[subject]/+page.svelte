<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import ChallengePreview from '$lib/challenges/ChallengePreview.svelte';
	import { challengeByRoute, challengePath } from '$lib/challenges/catalog';
	import { readChallengeProgress } from '$lib/challenges/progress';
	import {
		challengeSocialImage,
		challengeSocialImageAlt,
		challengeSocialImageHeight,
		challengeSocialImageWidth
	} from '$lib/challenges/seo';
	import ChallengeCardLink from '$lib/challenges/ui/ChallengeCardLink.svelte';
	import ChallengeRouteShell from '$lib/challenges/ui/ChallengeRouteShell.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { Check, ChevronDown, Clock3, LockKeyholeOpen } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const subjectLabel = $derived(`GCSE ${data.subject.label}`);
	const canonicalUrl = $derived(
		`https://constellation.eviworld.com/challenges/${data.subject.subject}`
	);
	const pageTitle = $derived(
		data.subject.subject === 'biology'
			? 'GCSE Biology Exam Questions & Answer Quiz'
			: 'GCSE Physics Exam Questions & Working Quiz'
	);
	const pageDescription = $derived(
		`Try ${data.challenges.length} free ${subjectLabel} exam-question challenges. Compare plausible answers, find the scoring gap, improve it and apply the reasoning again.`
	);
	const heroChallenge = $derived(
		challengeByRoute(data.subject.subject, data.subject.heroSlug) ?? data.challenges[0]
	);
	const heroHeadline = $derived(
		data.subject.subject === 'biology'
			? 'Both answers say the enzyme stops. Only one explains why.'
			: 'The range is right. Why does the uncertainty still lose the mark?'
	);
	const recommended = $derived.by(() => {
		const pool = data.challenges.filter((challenge) => challenge.id !== heroChallenge?.id);
		const varied = (['starter', 'standard', 'stretch'] as const)
			.map((difficulty) => pool.find((challenge) => challenge.difficulty === difficulty))
			.filter((challenge) => challenge !== undefined);
		return [
			...new Map([...varied, ...pool].map((challenge) => [challenge.id, challenge])).values()
		].slice(0, 3);
	});
	let completedIds = $state<string[]>([]);
	const completedCount = $derived(
		data.challenges.filter((challenge) => completedIds.includes(challenge.id)).length
	);
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
						name: 'GCSE Science Exam Question Games',
						item: 'https://constellation.eviworld.com/challenges'
					},
					{
						'@type': 'ListItem',
						position: 3,
						name: subjectLabel,
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				name: `${subjectLabel} exam questions`,
				description: pageDescription,
				url: canonicalUrl,
				isAccessibleForFree: true,
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: data.challenges.length,
					itemListElement: data.challenges.map((challenge, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						name: challenge.title,
						url: `https://constellation.eviworld.com${challengePath(challenge)}`
					}))
				}
			}
		]).replace(/</g, '\\u003c')
	);
	const jsonLdScript = $derived(`<script type="application/ld+json">${jsonLd}</` + 'script>');

	onMount(() => {
		if (!browser) return;
		const progress = readChallengeProgress(window.localStorage);
		completedIds = Object.entries(progress.challenges)
			.filter(([, entry]) => Boolean(entry.completedAt))
			.map(([id]) => id);
	});
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
	<meta property="og:image" content={challengeSocialImage} />
	<meta property="og:image:width" content={challengeSocialImageWidth} />
	<meta property="og:image:height" content={challengeSocialImageHeight} />
	<meta property="og:image:alt" content={challengeSocialImageAlt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content={challengeSocialImage} />
	<meta name="twitter:image:alt" content={challengeSocialImageAlt} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdScript}
</svelte:head>

<ChallengeRouteShell user={data.user} wide>
	<div class="challenge-subject-shell">
		<div class="subject-toolbar">
			<IconBackLink href={resolve('/challenges')} label="Back to all challenges" />
			<span class="progress-chip">
				{#if completedCount > 0}<Check size={15} aria-hidden="true" />{/if}
				{completedCount}/{data.challenges.length} solved
			</span>
		</div>

		{#if heroChallenge}
			<section class="subject-hero" aria-label={`Play a ${subjectLabel} question`}>
				<ChallengePreview
					challenge={heroChallenge}
					headingLevel="h1"
					headline={heroHeadline}
					stacked
				/>
			</section>
		{/if}

		<p class="subject-facts">
			<span><Clock3 size={15} aria-hidden="true" /> 4–6 minutes a question</span>
			<span><LockKeyholeOpen size={15} aria-hidden="true" /> No account needed</span>
		</p>

		<section class="recommended-cases" aria-labelledby="recommended-cases-title">
			<header>
				<p>Three ways in</p>
				<h2 id="recommended-cases-title">Choose another {data.subject.label} question</h2>
			</header>
			<div>
				{#each recommended as challenge (challenge.id)}
					<ChallengeCardLink
						href={challengePath(challenge)}
						eyebrow={`${completedIds.includes(challenge.id) ? 'Solved' : challenge.difficulty} · ${challenge.estimatedMinutes} min`}
						title={challenge.title}
						description={challenge.hook}
						meta={challenge.topic}
						visualChallenge={challenge}
						complete={completedIds.includes(challenge.id)}
						analyticsLabel={`Open ${challenge.title} challenge`}
					/>
				{/each}
			</div>
		</section>

		<details class="all-cases">
			<summary>
				<span>
					<strong>View all {data.challenges.length} {data.subject.label} questions</strong>
					<small>Grouped by the reasoning move they practise</small>
				</span>
				<ChevronDown size={19} aria-hidden="true" />
			</summary>

			<div class="arc-list">
				{#each data.arcs as arc (arc.id)}
					{@const arcChallenges = data.challenges.filter((challenge) => challenge.arc === arc.id)}
					{#if arcChallenges.length > 0}
						<section aria-labelledby={`arc-${arc.id}`}>
							<header>
								<h2 id={`arc-${arc.id}`}>{arc.label}</h2>
								<p>{arc.description}</p>
							</header>
							<div>
								{#each arcChallenges as challenge (challenge.id)}
									<ChallengeCardLink
										href={challengePath(challenge)}
										eyebrow={`${completedIds.includes(challenge.id) ? 'Solved' : challenge.difficulty} · ${challenge.estimatedMinutes} min`}
										title={challenge.title}
										description={challenge.hook}
										meta={challenge.topic}
										complete={completedIds.includes(challenge.id)}
									/>
								{/each}
							</div>
						</section>
					{/if}
				{/each}
			</div>
		</details>
	</div>
</ChallengeRouteShell>

<style>
	.challenge-subject-shell {
		display: grid;
		gap: clamp(1.35rem, 3vw, 2.3rem);
		width: min(100%, 66rem);
		margin: 0 auto;
	}

	.subject-toolbar,
	.subject-facts {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.55rem 1rem;
	}

	.progress-chip,
	.subject-facts span {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		font-weight: 620;
	}

	.progress-chip {
		min-height: 2rem;
		padding: 0.32rem 0.48rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.progress-chip :global(svg) {
		color: var(--qc-ui-accent-text);
	}

	.subject-facts {
		justify-content: flex-start;
		margin: -0.6rem 0 0;
	}

	.recommended-cases {
		display: grid;
		gap: 0.8rem;
		padding-top: 1rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.recommended-cases > header,
	.arc-list section > header {
		display: grid;
		gap: 0.22rem;
	}

	.recommended-cases p,
	.recommended-cases h2,
	.arc-list h2,
	.arc-list p {
		margin: 0;
	}

	.recommended-cases > header p {
		color: var(--qc-ui-accent-text);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.recommended-cases h2 {
		font-size: clamp(1.35rem, 3vw, 1.85rem);
		font-weight: 540;
		line-height: 1.1;
		letter-spacing: -0.025em;
	}

	.recommended-cases > div {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
	}

	.all-cases {
		border-block: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface-raised) 78%, transparent);
	}

	.all-cases > summary {
		display: flex;
		min-height: 4rem;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 0.9rem;
		cursor: pointer;
	}

	.all-cases > summary::-webkit-details-marker {
		display: none;
	}

	.all-cases > summary span {
		display: grid;
		gap: 0.15rem;
	}

	.all-cases > summary strong {
		font-size: 0.95rem;
		font-weight: 620;
	}

	.all-cases > summary small {
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
	}

	.all-cases[open] > summary :global(svg) {
		transform: rotate(180deg);
	}

	.arc-list {
		display: grid;
		gap: 1.4rem;
		padding: 0.25rem 0.9rem 1rem;
	}

	.arc-list section {
		display: grid;
		gap: 0.65rem;
	}

	.arc-list section > header {
		padding-top: 0.75rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.arc-list h2 {
		font-size: 1.12rem;
		font-weight: 620;
	}

	.arc-list p {
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
		line-height: 1.4;
	}

	.arc-list section > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
	}

	@media (max-width: 760px) {
		.recommended-cases > div,
		.arc-list section > div {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
