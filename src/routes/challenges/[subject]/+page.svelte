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
	import ChallengeButton from '$lib/challenges/ui/ChallengeButton.svelte';
	import ChallengeCardLink from '$lib/challenges/ui/ChallengeCardLink.svelte';
	import ChallengePageHeader from '$lib/challenges/ui/ChallengePageHeader.svelte';
	import ChallengePanel from '$lib/challenges/ui/ChallengePanel.svelte';
	import ChallengeRouteShell from '$lib/challenges/ui/ChallengeRouteShell.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import {
		ArrowRight,
		CheckCircle2,
		Clock3,
		Compass,
		FlaskConical,
		Gauge,
		LockKeyholeOpen
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const subjectLabel = $derived(`GCSE ${data.subject.label}`);
	const canonicalUrl = $derived(
		`https://constellation.eviworld.com/challenges/${data.subject.subject}`
	);
	const pageTitle = $derived(`${subjectLabel} Exam Answer Quiz | Past-Paper Questions`);
	const pageDescription = $derived(
		`Play ${data.challenges.length} short ${subjectLabel} exam-answer challenges. Compare plausible answers, repair missing reasoning and recognise the Question Chain in a new case.`
	);
	const heroChallenge = $derived(
		challengeByRoute(data.subject.subject, data.subject.heroSlug) ?? data.challenges[0]
	);
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
						name: 'GCSE Science Challenges',
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
				name: `${subjectLabel} exam-answer challenges`,
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
		<IconBackLink href={resolve('/challenges')} label="Back to all challenges" />

		<ChallengePageHeader
			eyebrow={`GCSE ${data.subject.label} answer challenges`}
			title={`${subjectLabel} answers: spot the decisive link.`}
			description={data.subject.description}
		>
			{#snippet actions()}
				{#if heroChallenge}
					<ChallengeButton href={challengePath(heroChallenge)}>
						Start the warm-up
						<ArrowRight size={17} aria-hidden="true" />
					</ChallengeButton>
				{/if}
			{/snippet}
			{#snippet aside()}
				<ChallengePanel>
					<div class="subject-readout">
						<strong>{completedCount}<small>/{data.challenges.length}</small></strong>
						<span>case files solved</span>
						<div
							role="progressbar"
							aria-label={`${subjectLabel} challenge progress`}
							aria-valuemin="0"
							aria-valuemax={data.challenges.length}
							aria-valuenow={completedCount}
						>
							<i style={`width: ${(completedCount / data.challenges.length) * 100}%`}></i>
						</div>
					</div>
				</ChallengePanel>
			{/snippet}
		</ChallengePageHeader>

		<div class="subject-hero-meta">
			<span>
				<FlaskConical size={17} aria-hidden="true" />
				AQA {data.subject.label} + Combined Science · Higher tier
			</span>
			<span><Clock3 size={17} aria-hidden="true" /> 4–6 minutes each</span>
			<span><LockKeyholeOpen size={17} aria-hidden="true" /> No account needed</span>
		</div>

		{#if heroChallenge}
			<section class="subject-preview" aria-labelledby="first-case">
				<header>
					<p>Warm-up case</p>
					<h2 id="first-case">Choose before the explanation gives it away</h2>
				</header>
				<ChallengePreview challenge={heroChallenge} />
			</section>
		{/if}

		<section class="case-files" aria-labelledby="case-files">
			<header class="case-heading">
				<div>
					<p>{data.challenges.length} interactive case files</p>
					<h2 id="case-files">Build the chain, one arc at a time</h2>
				</div>
				<span><Compass size={17} aria-hidden="true" /> Start anywhere; each arc is finite.</span>
			</header>

			{#each data.arcs as arc, arcIndex (arc.id)}
				{@const arcChallenges = data.challenges.filter((challenge) => challenge.arc === arc.id)}
				<section class="arc-section" aria-labelledby={`arc-${arc.id}`}>
					<header>
						<span>{String(arcIndex + 1).padStart(2, '0')}</span>
						<div>
							<h3 id={`arc-${arc.id}`}>{arc.label}</h3>
							<p>{arc.description}</p>
						</div>
					</header>

					<div class="case-grid">
						{#each arcChallenges as challenge, index (challenge.id)}
							<ChallengeCardLink
								href={challengePath(challenge)}
								eyebrow={`Case ${index + 1} · ${completedIds.includes(challenge.id) ? 'Solved' : challenge.difficulty}`}
								title={challenge.title}
								description={challenge.hook}
								meta={`${challenge.topic} · ${challenge.estimatedMinutes} min`}
								complete={completedIds.includes(challenge.id)}
								analyticsLabel={`Open ${challenge.title} challenge`}
							/>
						{/each}
					</div>
				</section>
			{/each}
		</section>

		<ChallengePanel>
			<aside class="teacher-note">
				<Gauge size={21} aria-hidden="true" />
				<div>
					<strong>Teacher note</strong>
					<p>
						Use the quick-play preview for a two-minute class vote, or one full case as a 4–6 minute
						starter.
					</p>
				</div>
			</aside>
		</ChallengePanel>

		<ChallengePanel>
			<footer class="subject-footer">
				<CheckCircle2 size={22} aria-hidden="true" />
				<div>
					<strong>What counts as solved?</strong>
					<p>Repair the answer and recognise the same reasoning in a second question.</p>
				</div>
				<ChallengeButton variant="secondary" href="/challenges">Switch subject</ChallengeButton>
			</footer>
		</ChallengePanel>
	</div>
</ChallengeRouteShell>

<style>
	.challenge-subject-shell {
		width: min(100%, 75rem);
		margin: 0 auto;
		padding: 1.2rem clamp(1rem, 3vw, 2rem) 5rem;
	}

	.subject-preview > header p,
	.case-heading p {
		margin: 0 0 0.6rem;
		color: var(--qc-ui-accent-text);
		font-size: 0.75rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.subject-hero-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		margin-top: 1.25rem;
	}

	.subject-hero-meta span {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
		font-weight: 650;
	}

	.subject-readout {
		display: grid;
		min-width: 10rem;
		gap: 0.2rem;
		padding: 1rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 1rem;
		background: var(--qc-ui-surface-raised);
	}

	.subject-readout > strong {
		color: var(--qc-ui-text);
		font-size: 2.6rem;
		line-height: 1;
	}

	.subject-readout > strong small {
		color: var(--qc-ui-text-muted);
		font-size: 1rem;
	}

	.subject-readout > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		font-weight: 700;
	}

	.subject-readout > div {
		height: 0.38rem;
		margin-top: 0.6rem;
		overflow: hidden;
		border-radius: 99px;
		background: var(--qc-ui-border-subtle);
	}

	.subject-readout i {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--qc-ui-accent);
		transition: width 320ms ease;
	}

	.subject-preview,
	.case-files {
		padding-top: clamp(3rem, 7vw, 5rem);
	}

	.subject-preview > header,
	.case-heading {
		margin-bottom: 1.1rem;
	}

	.subject-preview h2,
	.case-heading h2 {
		margin: 0;
		color: var(--qc-ui-text);
		font-size: clamp(1.55rem, 3.5vw, 2.5rem);
		letter-spacing: -0.035em;
	}

	.subject-preview :global(.challenge-preview) {
		max-width: 52rem;
	}

	.case-heading {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: end;
	}

	.case-heading > span {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.84rem;
	}

	.arc-section {
		margin-top: 2rem;
	}

	.arc-section > header {
		display: grid;
		grid-template-columns: 2.4rem minmax(0, 1fr);
		gap: 0.75rem;
		align-items: start;
		margin-bottom: 0.8rem;
	}

	.arc-section > header > span {
		display: grid;
		width: 2.4rem;
		height: 2.4rem;
		place-items: center;
		border: 1px solid var(--qc-ui-accent-border);
		border-radius: 0.72rem;
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
		font-size: 0.76rem;
		font-weight: 900;
	}

	.arc-section h3 {
		margin: 0;
		color: var(--qc-ui-text);
		font-size: 1.25rem;
	}

	.arc-section header p {
		margin: 0.2rem 0 0;
		color: var(--qc-ui-text-muted);
		line-height: 1.5;
	}

	.case-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
	}

	.subject-footer {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.75rem;
		align-items: center;
		margin-top: 4rem;
		padding: 1rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 1rem;
		background: var(--qc-ui-surface-translucent);
		color: var(--qc-ui-text-secondary);
	}

	.teacher-note {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.7rem;
		align-items: start;
		margin-top: 3rem;
		padding: 0.85rem 1rem;
		border-left: 3px solid var(--qc-ui-accent);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-text-secondary);
	}

	.teacher-note > :global(svg) {
		color: var(--qc-ui-accent-text);
	}

	.teacher-note strong {
		color: var(--qc-ui-text);
	}

	.teacher-note p {
		margin: 0.15rem 0 0;
		font-size: 0.84rem;
		line-height: 1.5;
	}

	.subject-footer > :global(svg) {
		color: var(--qc-ui-accent-text);
	}

	.subject-footer strong {
		color: var(--qc-ui-text);
	}

	.subject-footer p {
		margin: 0.15rem 0 0;
		font-size: 0.84rem;
	}

	@media (max-width: 820px) {
		.case-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 620px) {
		.subject-readout {
			grid-template-columns: auto minmax(0, 1fr);
			align-items: center;
		}

		.subject-readout > div {
			grid-column: 1 / -1;
			margin-top: 0.35rem;
		}

		.case-heading {
			display: block;
		}

		.case-heading > span {
			margin-top: 0.65rem;
		}

		.case-grid {
			grid-template-columns: 1fr;
		}

		.subject-footer {
			grid-template-columns: auto minmax(0, 1fr);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.subject-readout i {
			transition: none;
		}
	}

	/* Route CSS is intentionally limited to composition around shared Challenge UI. */
	.challenge-subject-shell {
		display: grid;
		gap: clamp(2rem, 5vw, 4rem);
		width: auto;
		margin: 0;
		padding: 0;
	}

	.subject-hero-meta {
		margin-top: -3rem;
	}

	.subject-readout {
		min-width: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
	}

	.subject-readout > strong {
		font-size: 2.25rem;
		font-weight: 560;
	}

	.subject-readout > div,
	.subject-readout i {
		border-radius: 0;
	}

	.subject-preview,
	.case-files {
		padding-top: 0;
	}

	.subject-preview h2,
	.case-heading h2 {
		font-size: clamp(1.45rem, 3vw, 1.9rem);
		font-weight: 560;
		letter-spacing: 0;
	}

	.arc-section > header > span {
		border-radius: 0;
		font-weight: 700;
	}

	.arc-section h3 {
		font-weight: 600;
	}

	.case-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.teacher-note,
	.subject-footer {
		margin-top: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
	}

	@media (max-width: 620px) {
		.challenge-subject-shell {
			gap: 2.5rem;
		}

		.subject-hero-meta {
			margin-top: -1.75rem;
		}

		.case-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
