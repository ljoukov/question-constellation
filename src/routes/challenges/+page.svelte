<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import ChallengePreview from '$lib/challenges/ChallengePreview.svelte';
	import {
		CHALLENGE_PROGRESS_GUEST_STORAGE_KEY,
		CHALLENGE_PROGRESS_STORAGE_KEY,
		LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY,
		challengeProgressStorageKey,
		emptyChallengeProgress,
		mergeChallengeProgress,
		readChallengeProgress,
		type ChallengeProgress
	} from '$lib/challenges/progress';
	import {
		CHALLENGE_PROGRESS_UPDATED_EVENT,
		type ChallengeProgressUpdatedDetail
	} from '$lib/challenges/progressSync';
	import {
		mostRecentlyCompletedChallenge,
		recommendedUnfinishedChallenge
	} from '$lib/challenges/recommendations';
	import { subjectArtForChallenge } from '$lib/challenges/subjectVisuals';
	import {
		challengeSocialImage,
		challengeSocialImageAlt,
		challengeSocialImageHeight,
		challengeSocialImageWidth
	} from '$lib/challenges/seo';
	import ChallengeCardLink from '$lib/challenges/ui/ChallengeCardLink.svelte';
	import ChallengeRouteShell from '$lib/challenges/ui/ChallengeRouteShell.svelte';
	import CurriculumDisclosure from '$lib/challenges/ui/CurriculumDisclosure.svelte';
	import type { ChallengeSubject } from '$lib/challenges/types';
	import { ExternalLink, House, Trophy } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const canonicalUrl = 'https://constellation.eviworld.com/challenges';
	const pageTitle = 'GCSE Science Exam Question Games | Biology, Chemistry & Physics';
	const pageDescription =
		'Try free GCSE Biology, Chemistry and Physics exam-question games. Compare two answers, find the missing mark, improve it and use the same reasoning again.';
	const catalogue = $derived(data.challenges);
	const serverProgress = $derived(data.challengeProgress as ChallengeProgress);
	const userId = $derived(data.user?.uid ?? null);
	let browserProgress = $state<ChallengeProgress | null>(null);
	const progress = $derived(browserProgress ?? serverProgress);

	const totalCompleted = $derived(
		catalogue.filter((challenge) => Boolean(progress.challenges[challenge.id]?.completedAt)).length
	);
	const totalBestScore = $derived(
		catalogue.reduce(
			(total, challenge) => total + (progress.challenges[challenge.id]?.bestScore ?? 0),
			0
		)
	);
	const subjectGroups = $derived(
		data.subjects.map((subject) => {
			const subjectChallenges = catalogue.filter((challenge) =>
				subject.challengeIds.includes(challenge.id)
			);
			const entries = subject.challengeIds.map((id) => progress.challenges[id]);
			const nextChallenge =
				recommendedUnfinishedChallenge(subjectChallenges, progress, {
					preferredSubject: subject.subject
				}) ?? mostRecentlyCompletedChallenge(subjectChallenges, progress);
			return {
				...subject,
				completed: entries.filter((entry) => Boolean(entry?.completedAt)).length,
				totalBestScore: entries.reduce((total, entry) => total + (entry?.bestScore ?? 0), 0),
				art: nextChallenge ? subjectArtForChallenge(nextChallenge) : undefined
			};
		})
	);
	const featuredChallenge = $derived(
		recommendedUnfinishedChallenge(catalogue, progress) ??
			mostRecentlyCompletedChallenge(catalogue, progress) ??
			data.featuredChallenge
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
					numberOfItems: data.subjects.length,
					itemListElement: data.subjects.map((subject, index) => ({
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
		const refreshProgress = () => (browserProgress = mergedBrowserProgress());
		const handleStorage = (event: StorageEvent) => {
			if (isRelevantProgressKey(event.key)) refreshProgress();
		};
		const handleProgressUpdated = (event: Event) => {
			const detail = (event as CustomEvent<ChallengeProgressUpdatedDetail>).detail;
			if (!detail?.progress) return;
			const eventUserId = detail.userId || null;
			if (userId ? eventUserId !== userId : Boolean(eventUserId)) return;
			browserProgress = mergeChallengeProgress(progress, detail.progress);
		};

		refreshProgress();
		window.addEventListener('pageshow', refreshProgress);
		window.addEventListener('storage', handleStorage);
		window.addEventListener(CHALLENGE_PROGRESS_UPDATED_EVENT, handleProgressUpdated);

		return () => {
			window.removeEventListener('pageshow', refreshProgress);
			window.removeEventListener('storage', handleStorage);
			window.removeEventListener(CHALLENGE_PROGRESS_UPDATED_EVENT, handleProgressUpdated);
		};
	});

	function mergedBrowserProgress(): ChallengeProgress {
		if (!browser) return serverProgress ?? emptyChallengeProgress();
		const accountOrGuest = readChallengeProgress(window.localStorage, userId);
		const guest = userId ? readChallengeProgress(window.localStorage) : emptyChallengeProgress();
		return mergeChallengeProgress(
			serverProgress ?? emptyChallengeProgress(),
			mergeChallengeProgress(accountOrGuest, guest)
		);
	}

	function isRelevantProgressKey(key: string | null): boolean {
		return (
			key === null ||
			key === CHALLENGE_PROGRESS_STORAGE_KEY ||
			key === CHALLENGE_PROGRESS_GUEST_STORAGE_KEY ||
			key === LEGACY_CHALLENGE_PROGRESS_STORAGE_KEY ||
			key === challengeProgressStorageKey(userId)
		);
	}

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
		<nav class="challenge-breadcrumbs" aria-label="Breadcrumb">
			<a href={resolve('/')} data-analytics-label="Challenges: home">
				<House size={16} strokeWidth={2.2} aria-hidden="true" />
				<span>Home</span>
			</a>
			<span aria-hidden="true">/</span>
			<strong aria-current="page">Challenges</strong>
		</nav>

		<section class="play-first" aria-label="Recommended GCSE Science challenge">
			<ChallengePreview
				challenge={featuredChallenge}
				stacked
				headingLevel="h1"
				headline={featuredChallenge.hook}
				completed={Boolean(progress.challenges[featuredChallenge.id]?.completedAt)}
			/>
		</section>

		<section class="activity-strip" aria-labelledby="activity-title" aria-live="polite">
			<span class="activity-mark" aria-hidden="true">
				<Trophy size={18} strokeWidth={2.25} />
			</span>
			<div>
				<h2 id="activity-title">Your challenge score</h2>
				<p>
					<strong>{totalBestScore.toLocaleString('en-GB')} points</strong>
					<span>· {totalCompleted} complete</span>
				</p>
			</div>
		</section>

		<section class="subject-paths" aria-label="Choose a subject">
			<div>
				{#each subjectGroups as subject (subject.subject)}
					<ChallengeCardLink
						href={subjectHref(subject.subject)}
						eyebrow={`${subject.completed} complete`}
						title={`GCSE ${subject.label}`}
						meta={`${subject.totalBestScore.toLocaleString('en-GB')} points`}
						art={subject.art}
					/>
				{/each}
			</div>
		</section>

		<CurriculumDisclosure>
			<ul class="curriculum-links" aria-label="Official GCSE science curriculum links">
				{#each data.curriculumLinks as link (link.officialUrl)}
					<li>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
						<a href={link.officialUrl} target="_blank" rel="noreferrer">
							AQA · {link.topicLabel}
							<ExternalLink size={14} aria-hidden="true" />
						</a>
					</li>
				{/each}
				<li>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={data.ks4ScienceUrl} target="_blank" rel="noreferrer">
						GOV.UK KS4 science
						<ExternalLink size={14} aria-hidden="true" />
					</a>
				</li>
			</ul>
		</CurriculumDisclosure>
	</div>
</ChallengeRouteShell>

<style>
	.challenge-home-shell {
		display: grid;
		gap: clamp(1.4rem, 4vw, 2.8rem);
		width: min(100%, 66rem);
		margin: 0 auto;
	}

	.challenge-breadcrumbs {
		display: flex;
		min-height: 2.25rem;
		align-items: center;
		gap: 0.55rem;
		margin-bottom: calc(clamp(1.4rem, 4vw, 2.8rem) * -0.55);
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
		font-weight: 650;
	}

	.challenge-breadcrumbs a {
		display: inline-flex;
		min-height: 2.25rem;
		align-items: center;
		gap: 0.38rem;
		color: var(--qc-ui-text-secondary);
		text-decoration: none;
	}

	.challenge-breadcrumbs a:hover {
		color: var(--qc-ui-accent-text);
	}

	.challenge-breadcrumbs a:focus-visible {
		outline: 3px solid var(--qc-ui-accent-text);
		outline-offset: 2px;
	}

	.challenge-breadcrumbs strong {
		color: var(--qc-ui-text);
		font-weight: 700;
	}

	.play-first {
		min-width: 0;
	}

	.activity-strip {
		display: flex;
		width: min(100%, 25rem);
		align-items: center;
		gap: 0.7rem;
		margin: -0.45rem 0 0;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface-raised) 72%, transparent);
	}

	.activity-mark {
		display: grid;
		width: 2.4rem;
		aspect-ratio: 1;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-accent-text);
	}

	.activity-strip > div {
		display: grid;
		gap: 0.08rem;
	}

	.activity-strip h2,
	.activity-strip p {
		margin: 0;
	}

	.activity-strip h2 {
		color: var(--qc-ui-text-muted);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.055em;
		line-height: 1.2;
		text-transform: uppercase;
	}

	.activity-strip p {
		color: var(--qc-ui-text-secondary);
		font-size: 0.88rem;
		line-height: 1.35;
	}

	.activity-strip strong {
		color: var(--qc-ui-text);
		font-size: 1rem;
		font-weight: 720;
	}

	.subject-paths {
		display: grid;
		gap: 0.85rem;
		padding-top: clamp(0.8rem, 2vw, 1.4rem);
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.subject-paths > div {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.7rem;
	}

	.curriculum-links {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.65rem 1.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.curriculum-links a {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		color: var(--qc-ui-accent-text);
		font-size: 0.82rem;
		font-weight: 650;
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
