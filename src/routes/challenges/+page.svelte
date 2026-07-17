<script lang="ts">
	import { browser } from '$app/environment';
	import ChallengePreview from '$lib/challenges/ChallengePreview.svelte';
	import {
		challengeByRoute,
		challengeCatalog,
		challengeSubjects,
		challengesForSubject
	} from '$lib/challenges/catalog';
	import { readChallengeProgress } from '$lib/challenges/progress';
	import {
		challengeSocialImage,
		challengeSocialImageAlt,
		challengeSocialImageHeight,
		challengeSocialImageWidth
	} from '$lib/challenges/seo';
	import ChallengeCardLink from '$lib/challenges/ui/ChallengeCardLink.svelte';
	import ChallengeRouteShell from '$lib/challenges/ui/ChallengeRouteShell.svelte';
	import type { ChallengeSubject } from '$lib/challenges/types';
	import { Check, ChevronDown } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const canonicalUrl = 'https://constellation.eviworld.com/challenges';
	const pageTitle = 'GCSE Science Exam Question Games | Biology & Physics';
	const pageDescription =
		'Try free GCSE Biology and Physics exam-question games. Compare two answers, find the missing mark, improve it and use the same reasoning on a new question.';
	const featuredChallenge = challengeByRoute('biology', 'measles-vaccine-immunity');
	let completedIds = $state<string[]>([]);
	const totalCompleted = $derived(
		challengeCatalog.filter((challenge) => completedIds.includes(challenge.id)).length
	);
	const subjectGroups = $derived(
		challengeSubjects.map((subject) => {
			const challenges = challengesForSubject(subject.subject);
			return {
				...subject,
				challenges,
				completed: challenges.filter((challenge) => completedIds.includes(challenge.id)).length
			};
		})
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
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				name: 'GCSE Science Exam Question Games',
				description: pageDescription,
				url: canonicalUrl,
				isAccessibleForFree: true,
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: challengeSubjects.length,
					itemListElement: challengeSubjects.map((subject, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						name: `GCSE ${subject.label} exam questions`,
						url: `https://constellation.eviworld.com/challenges/${subject.subject}`
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

	function subjectHref(subject: ChallengeSubject) {
		return `/challenges/${subject}` as const;
	}
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
	<div class="challenge-home-shell">
		{#if featuredChallenge}
			<section class="play-first" aria-label="Play a GCSE Biology question">
				<ChallengePreview
					challenge={featuredChallenge}
					stacked
					headingLevel="h1"
					headline="Both answers mention antibodies. Only one explains lasting immunity."
				/>
			</section>
		{/if}

		{#if totalCompleted > 0}
			<p class="device-progress" aria-live="polite">
				<Check size={16} aria-hidden="true" />
				{totalCompleted} of {challengeCatalog.length} challenges solved on this device
			</p>
		{/if}

		<section class="subject-paths" aria-labelledby="subject-paths-title">
			<header>
				<p>Choose what comes next</p>
				<h2 id="subject-paths-title">More exam questions, same missing-link idea</h2>
			</header>
			<div>
				{#each subjectGroups as subject (subject.subject)}
					<ChallengeCardLink
						href={subjectHref(subject.subject)}
						eyebrow={`${subject.challenges.length} questions · ${subject.completed} solved`}
						title={`GCSE ${subject.label}`}
						description={subject.subject === 'biology'
							? 'Explain cells, practicals, data and biological cause-and-effect.'
							: 'Check calculations, particles, circuits, forces and motion.'}
						meta={`Browse ${subject.label}`}
						complete={subject.completed === subject.challenges.length}
					/>
				{/each}
			</div>
		</section>

		<details class="method-note">
			<summary>
				<span>How these GCSE exam-question games work</span>
				<ChevronDown size={17} aria-hidden="true" />
			</summary>
			<p>
				Compare two plausible answers, expose the exact scoring gap, fix the smallest part that
				matters, then use the same Question Chain in a different exam context. No account is
				required.
			</p>
		</details>
	</div>
</ChallengeRouteShell>

<style>
	.challenge-home-shell {
		display: grid;
		gap: clamp(1.4rem, 4vw, 2.8rem);
		width: min(100%, 66rem);
		margin: 0 auto;
	}

	.play-first {
		min-width: 0;
	}

	.device-progress {
		display: inline-flex;
		width: fit-content;
		gap: 0.4rem;
		align-items: center;
		margin: -0.4rem 0 0;
		color: var(--qc-ui-accent-text);
		font-size: 0.82rem;
		font-weight: 620;
	}

	.subject-paths {
		display: grid;
		gap: 0.85rem;
		padding-top: clamp(0.8rem, 2vw, 1.4rem);
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.subject-paths > header {
		display: grid;
		gap: 0.22rem;
	}

	.subject-paths p,
	.subject-paths h2,
	.method-note p {
		margin: 0;
	}

	.subject-paths header p {
		color: var(--qc-ui-accent-text);
		font-size: 0.72rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.subject-paths h2 {
		font-size: clamp(1.35rem, 3vw, 1.85rem);
		font-weight: 540;
		line-height: 1.1;
		letter-spacing: -0.025em;
	}

	.subject-paths > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
	}

	.method-note {
		border-block: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface-raised) 72%, transparent);
	}

	.method-note summary {
		display: flex;
		min-height: 3rem;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.7rem 0.85rem;
		color: var(--qc-ui-text-secondary);
		font-size: 0.86rem;
		font-weight: 620;
		cursor: pointer;
	}

	.method-note summary::-webkit-details-marker {
		display: none;
	}

	.method-note[open] summary :global(svg) {
		transform: rotate(180deg);
	}

	.method-note p {
		max-width: 54rem;
		padding: 0 0.85rem 0.9rem;
		color: var(--qc-ui-text-secondary);
		font-size: 0.9rem;
		line-height: 1.55;
	}

	@media (max-width: 640px) {
		.challenge-home-shell {
			gap: 1.4rem;
		}

		.subject-paths > div {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
