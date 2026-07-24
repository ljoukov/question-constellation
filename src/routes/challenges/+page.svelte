<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { analyticsEvent } from '$lib/analytics/client';
	import ChallengePreview from '$lib/challenges/ChallengePreview.svelte';
	import ChallengeLeaderboard from '$lib/challenges/ui/ChallengeLeaderboard.svelte';
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
	import { challengePathWithScope } from '$lib/challenges/routing';
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
	import { ExternalLink, House } from '@lucide/svelte';
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
				nextChallenge,
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

	function recordScopeSelection(scope: 'mixed' | ChallengeSubject, source: string) {
		analyticsEvent('challenge_scope_selected', {
			scope,
			source,
			plannerVersion: 'science-path-v1'
		});
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

		<section class="play-first" aria-label="Recommended mixed science path">
			<header class="path-intro">
				<p><strong>Mixed science</strong> · Biology, Chemistry and Physics in rotation.</p>
			</header>
			<ChallengePreview
				challenge={featuredChallenge}
				stacked
				headingLevel="h1"
				headline={featuredChallenge.hook}
				completed={Boolean(progress.challenges[featuredChallenge.id]?.completedAt)}
				href={challengePathWithScope(featuredChallenge, 'mixed')}
				actionLabel="Start mixed science"
				onstart={() => recordScopeSelection('mixed', 'challenge_hub_primary')}
			/>
		</section>

		<section class="subject-paths" aria-labelledby="subject-paths-title">
			<header>
				<h2 id="subject-paths-title">Choose a subject</h2>
			</header>
			<div>
				{#each subjectGroups as subject (subject.subject)}
					<ChallengeCardLink
						href={subject.nextChallenge
							? challengePathWithScope(subject.nextChallenge, subject.subject)
							: subjectHref(subject.subject)}
						eyebrow={`${subject.label} only · ${subject.completed} complete`}
						title={`GCSE ${subject.label} path`}
						meta={subject.nextChallenge
							? `Next: ${subject.nextChallenge.title}`
							: 'All challenges complete'}
						art={subject.art}
						complete={!subject.nextChallenge}
						analyticsLabel={`Start ${subject.subject} challenge path`}
						onclick={() => recordScopeSelection(subject.subject, 'challenge_hub_subject_path')}
					/>
				{/each}
			</div>
		</section>

		<ChallengeLeaderboard
			snapshot={data.leaderboard}
			scopeLabel="All science"
			personalScore={totalBestScore}
			personalCompleted={totalCompleted}
			signedIn={Boolean(data.user)}
		/>

		<CurriculumDisclosure>
			<ul class="curriculum-links" aria-label="Official GCSE science curriculum links">
				{#each data.curriculumLinks as link (`${link.officialUrl}\u0000${link.topicLabel}`)}
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
		gap: clamp(1.25rem, 3vw, 2.2rem);
		width: min(100%, 66rem);
		margin: 0 auto;
	}

	.challenge-breadcrumbs {
		display: flex;
		min-height: 2.25rem;
		align-items: center;
		gap: 0.55rem;
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
		display: grid;
		gap: 0.65rem;
		min-width: 0;
	}

	.path-intro {
		padding-left: 0.72rem;
		border-left: 3px solid var(--qc-ui-accent);
	}

	.path-intro p {
		margin: 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.88rem;
		line-height: 1.45;
	}

	.path-intro strong {
		color: var(--qc-ui-accent-text);
		font-weight: 750;
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

	.subject-paths h2 {
		margin: 0;
		font-size: clamp(1.08rem, 2vw, 1.3rem);
		font-weight: 650;
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
			gap: 1.25rem;
		}

		.subject-paths > div {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
