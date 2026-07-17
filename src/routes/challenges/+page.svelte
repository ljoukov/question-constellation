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
	import ChallengeButton from '$lib/challenges/ui/ChallengeButton.svelte';
	import ChallengeCardLink from '$lib/challenges/ui/ChallengeCardLink.svelte';
	import ChallengeHowItWorks from '$lib/challenges/ui/ChallengeHowItWorks.svelte';
	import ChallengePageHeader from '$lib/challenges/ui/ChallengePageHeader.svelte';
	import ChallengePanel from '$lib/challenges/ui/ChallengePanel.svelte';
	import ChallengeRouteShell from '$lib/challenges/ui/ChallengeRouteShell.svelte';
	import type { ChallengeSubject } from '$lib/challenges/types';
	import { ArrowRight, Check, Orbit, SearchCheck, Wrench } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const canonicalUrl = 'https://constellation.eviworld.com/challenges';
	const pageTitle = 'GCSE Science Exam Answers | Find the Missing Mark';
	const pageDescription =
		'Compare answers to real cited GCSE Biology and Physics questions, find the exact missing mark, repair the reasoning and try it in a new case.';
	const featuredChallenge = challengeByRoute('physics', 'thermal-conductivity-ice-cream-bowl');
	let completedIds = $state<string[]>([]);

	const subjectGroups = $derived(
		challengeSubjects.map((subject) => {
			const challenges = challengesForSubject(subject.subject);
			return {
				...subject,
				challenges,
				hero: challengeByRoute(subject.subject, subject.heroSlug),
				completed: challenges.filter((challenge) => completedIds.includes(challenge.id)).length
			};
		})
	);
	const totalCompleted = $derived(
		challengeCatalog.filter((challenge) => completedIds.includes(challenge.id)).length
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
						name: 'GCSE Science Challenges',
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'CollectionPage',
				name: 'GCSE Science Challenges',
				description: pageDescription,
				url: canonicalUrl,
				isAccessibleForFree: true,
				mainEntity: {
					'@type': 'ItemList',
					numberOfItems: challengeSubjects.length,
					itemListElement: challengeSubjects.map((subject, index) => ({
						'@type': 'ListItem',
						position: index + 1,
						name: `GCSE ${subject.label} answer challenges`,
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
		<ChallengePageHeader
			eyebrow="Free GCSE Science past-paper answer challenges"
			title="Two answers sound right. One loses the mark."
			description="Compare model answers to real cited GCSE Biology and Physics past-paper questions. Find the exact line that loses the mark, repair the reasoning steps an examiner expects—then use them in a new case."
		>
			{#snippet actions()}
				<ChallengeButton href={subjectHref('biology')}>
					Browse Biology cases
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
				<ChallengeButton variant="secondary" href={subjectHref('physics')}>
					Browse Physics cases
				</ChallengeButton>
			{/snippet}
			{#snippet aside()}
				{#if featuredChallenge}
					<div class="hero-play">
						<p>Try one now · no sign-up</p>
						<ChallengePreview challenge={featuredChallenge} stacked headingLevel="h2" />
					</div>
				{/if}
			{/snippet}
		</ChallengePageHeader>

		<p class="challenge-launch-note" aria-live="polite">
			{#if totalCompleted > 0}
				<Check size={17} aria-hidden="true" />
				You have solved {totalCompleted} of {challengeCatalog.length} launch challenges on this device.
			{:else}
				No account needed · 4–6 minutes each · 2–4 mark Higher-tier source questions.
			{/if}
		</p>

		<ChallengeHowItWorks
			eyebrow="Past-paper questions, decoded"
			title="Find where the answer stops earning marks"
			headingId="challenge-loop-title"
		/>

		<section class="subject-section" aria-labelledby="choose-subject">
			<header class="section-heading">
				<p>Choose a case file</p>
				<h2 id="choose-subject">Start with a real GCSE question</h2>
				<span>Completed challenges stay on this device.</span>
			</header>

			<div class="subject-grid">
				{#each subjectGroups as subject (subject.subject)}
					<ChallengeCardLink
						href={subjectHref(subject.subject)}
						eyebrow={`${subject.challenges.length} challenges · ${subject.completed} solved`}
						title={`GCSE ${subject.label}`}
						description={subject.description}
						meta={`Open ${subject.label}`}
						complete={subject.completed === subject.challenges.length}
					/>
				{/each}
			</div>
		</section>

		<section class="preview-section" aria-labelledby="try-now">
			<header class="section-heading compact">
				<p>Two more starting points</p>
				<h2 id="try-now">Choose your first answer showdown</h2>
				<span>The full round unlocks the Question Chain only after you repair the answer.</span>
			</header>
			<div class="preview-grid">
				{#each subjectGroups as subject (subject.subject)}
					{#if subject.hero}
						<ChallengePreview challenge={subject.hero} />
					{/if}
				{/each}
			</div>
		</section>

		<ChallengePanel>
			<section class="why-section" aria-labelledby="why-challenges">
				<div>
					<p class="challenge-kicker">Not another fact quiz</p>
					<h2 id="why-challenges">Train the link that earns the mark</h2>
					<p>
						Each case starts with exam evidence, shows exactly why a plausible answer is incomplete
						and makes you use the repaired reasoning again before moving on.
					</p>
				</div>
				<ul>
					<li><SearchCheck size={21} aria-hidden="true" /> Grounded in public exam questions</li>
					<li>
						<Wrench size={21} aria-hidden="true" /> Repair the answer instead of just revealing it
					</li>
					<li><Orbit size={21} aria-hidden="true" /> Try one Question Chain across contexts</li>
				</ul>
			</section>
		</ChallengePanel>
	</div>
</ChallengeRouteShell>

<style>
	.challenge-kicker,
	.section-heading > p {
		margin: 0 0 0.65rem;
		color: var(--qc-ui-accent-text);
		font-size: 0.76rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.hero-play {
		display: grid;
		gap: 0.55rem;
		min-width: 0;
	}

	.hero-play > p {
		margin: 0;
		color: var(--qc-ui-text-muted);
		font-size: 0.75rem;
		font-weight: 820;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.subject-section,
	.preview-section,
	.why-section {
		padding-top: clamp(3rem, 7vw, 6rem);
	}

	.section-heading {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 0.3rem 1rem;
		margin-bottom: 1.25rem;
	}

	.section-heading > p,
	.section-heading h2 {
		grid-column: 1;
	}

	.section-heading h2,
	.why-section h2 {
		margin: 0;
		color: var(--qc-ui-text);
		font-size: clamp(1.65rem, 3.6vw, 2.65rem);
		letter-spacing: -0.035em;
	}

	.section-heading > span {
		grid-column: 2;
		grid-row: 1 / span 2;
		max-width: 22rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.86rem;
		line-height: 1.5;
		text-align: right;
	}

	.subject-grid,
	.preview-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.preview-grid {
		align-items: start;
	}

	.why-section {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.8fr);
		gap: 2rem;
		align-items: center;
	}

	.why-section p:not(.challenge-kicker) {
		max-width: 42rem;
		margin: 1rem 0 0;
		color: var(--qc-ui-text-secondary);
		font-size: 1.02rem;
		line-height: 1.65;
	}

	.why-section ul {
		display: grid;
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.why-section li {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.85rem 1rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 0.85rem;
		background: var(--qc-ui-surface-translucent);
		color: var(--qc-ui-text-secondary);
		font-weight: 700;
	}

	.why-section li :global(svg) {
		flex: 0 0 auto;
		color: var(--qc-ui-accent-text);
	}

	@media (max-width: 760px) {
		.section-heading {
			display: block;
		}

		.section-heading > span {
			display: block;
			margin-top: 0.55rem;
			text-align: left;
		}

		.subject-grid,
		.preview-grid,
		.why-section {
			grid-template-columns: 1fr;
		}
	}

	/* Page CSS owns layout only; shared components own controls, panels and type. */
	.challenge-home-shell {
		display: grid;
		gap: clamp(2.5rem, 6vw, 4.5rem);
		width: auto;
		margin: 0;
		padding: 0;
	}

	.hero-play {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
		padding-right: 1.3rem;
		padding-bottom: 1.3rem;
	}

	.hero-play > p {
		margin: 0;
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.challenge-launch-note {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: -3.5rem 0 0;
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
		line-height: 1.4;
	}

	.section-heading h2,
	.why-section h2 {
		font-size: clamp(1.45rem, 3vw, 1.9rem);
		font-weight: 560;
		letter-spacing: 0;
	}

	.subject-section,
	.preview-section,
	.why-section {
		padding-top: 0;
	}

	.subject-grid,
	.preview-grid {
		gap: 0.75rem;
	}

	.why-section li {
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		font-size: 0.9rem;
		font-weight: 550;
	}

	@media (max-width: 760px) {
		.challenge-home-shell {
			gap: 2.5rem;
		}

		.hero-play {
			padding-right: 0.75rem;
			padding-bottom: 0.75rem;
		}

		.challenge-launch-note {
			margin-top: -1.75rem;
		}
	}
</style>
