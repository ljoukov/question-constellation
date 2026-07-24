<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { analyticsEvent } from '$lib/analytics/client';
	import ChallengePreview from '$lib/challenges/ChallengePreview.svelte';
	import { challengePath, challengePathWithScope } from '$lib/challenges/routing';
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
		CHALLENGE_PATH_PLANNER_VERSION,
		mostRecentlyCompletedChallenge,
		recommendedUnfinishedChallenge
	} from '$lib/challenges/recommendations';
	import {
		challengeSocialImage,
		challengeSocialImageAlt,
		challengeSocialImageHeight,
		challengeSocialImageWidth
	} from '$lib/challenges/seo';
	import ChallengeCardLink from '$lib/challenges/ui/ChallengeCardLink.svelte';
	import ChallengeRouteShell from '$lib/challenges/ui/ChallengeRouteShell.svelte';
	import ChallengeLeaderboard from '$lib/challenges/ui/ChallengeLeaderboard.svelte';
	import CurriculumDisclosure from '$lib/challenges/ui/CurriculumDisclosure.svelte';
	import type { PublicChallengePreviewDefinition } from '$lib/challenges/authoredData';
	import type { ChallengeSubject } from '$lib/challenges/types';
	import SubjectIcon from '$lib/learning/SubjectIcon.svelte';
	import { ExternalLink, House } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	const subjectPageCopy: Record<
		ChallengeSubject,
		{
			pageTitle: string;
		}
	> = {
		biology: {
			pageTitle: 'GCSE Biology Exam Questions & Answer Quiz'
		},
		chemistry: {
			pageTitle: 'GCSE Chemistry Exam Questions & Answer Quiz'
		},
		physics: {
			pageTitle: 'GCSE Physics Exam Questions & Working Quiz'
		}
	};

	let { data }: PageProps = $props();

	const subjectLabel = $derived(`GCSE ${data.subject.label}`);
	const subjectCopy = $derived(subjectPageCopy[data.subject.subject]);
	const canonicalUrl = $derived(
		`https://constellation.eviworld.com/challenges/${data.subject.subject}`
	);
	const pageTitle = $derived(subjectCopy.pageTitle);
	const pageDescription = $derived(
		`Try free ${subjectLabel} exam-question challenges. Compare two answers, find the missing idea, improve the answer and apply the same method again.`
	);
	const challenges = $derived(data.challenges);
	const serverProgress = $derived(data.challengeProgress as ChallengeProgress);
	const userId = $derived(data.user?.uid ?? null);
	let browserProgress = $state<ChallengeProgress | null>(null);
	const progress = $derived(browserProgress ?? serverProgress);

	const heroChallenge = $derived(
		recommendedUnfinishedChallenge(challenges, progress, {
			preferredSubject: data.subject.subject
		}) ??
			mostRecentlyCompletedChallenge(challenges, progress) ??
			challenges.find((challenge) => challenge.id === data.defaultHeroId) ??
			challenges[0]
	);
	const otherChallenges = $derived(
		challenges.filter((challenge) => challenge.id !== heroChallenge.id)
	);
	const completedCount = $derived(
		challenges.filter((challenge) => Boolean(progress.challenges[challenge.id]?.completedAt)).length
	);
	const totalBestScore = $derived(
		challenges.reduce(
			(total, challenge) => total + (progress.challenges[challenge.id]?.bestScore ?? 0),
			0
		)
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
					itemListElement: challenges.map((challenge, index) => ({
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

	function challengeEyebrow(challenge: PublicChallengePreviewDefinition): string | undefined {
		const entry = progress.challenges[challenge.id];
		if (entry?.bestScore !== null && entry?.bestScore !== undefined) {
			return `Personal best · ${entry.bestScore} points`;
		}
		if (entry?.completedAt) return 'Complete';
		if (entry) return 'In progress';
		return undefined;
	}

	function recordSubjectPathSelection(source: string) {
		analyticsEvent('challenge_scope_selected', {
			scope: data.subject.subject,
			source,
			plannerVersion: CHALLENGE_PATH_PLANNER_VERSION
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
	<div class="challenge-subject-shell">
		<nav class="subject-nav" aria-label="Breadcrumb">
			<a href={resolve('/')} data-analytics-label={`${data.subject.label} challenges: home`}>
				<House size={16} strokeWidth={2.2} aria-hidden="true" />
				<span>Home</span>
			</a>
			<span aria-hidden="true">/</span>
			<a href={resolve('/challenges')} data-analytics-label="Back to challenges">Challenges</a>
			<span aria-hidden="true">/</span>
			<strong aria-current="page">
				<SubjectIcon subject={data.subject.label} size={16} />
				{data.subject.label}
			</strong>
		</nav>

		<section class="subject-hero" aria-label={`Recommended ${subjectLabel} challenge`}>
			<header class="path-intro">
				<p>
					<strong>{data.subject.label}</strong> · {challenges.length} short exam-question games.
				</p>
			</header>
			<ChallengePreview
				challenge={heroChallenge}
				headingLevel="h1"
				headline={heroChallenge.hook}
				stacked
				completed={Boolean(progress.challenges[heroChallenge.id]?.completedAt)}
				href={challengePathWithScope(heroChallenge, data.subject.subject)}
				actionLabel={`Start ${data.subject.label} path`}
				onstart={() => recordSubjectPathSelection('challenge_subject_primary')}
			/>
		</section>

		<section class="recommended-cases" aria-labelledby="recommended-cases-title">
			<header>
				<h2 id="recommended-cases-title">More {data.subject.label} challenges</h2>
			</header>
			<div>
				{#each otherChallenges as challenge (challenge.id)}
					<ChallengeCardLink
						href={challengePathWithScope(challenge, data.subject.subject)}
						eyebrow={challengeEyebrow(challenge)}
						markLabel={`${challenge.marks} ${challenge.marks === 1 ? 'mark' : 'marks'}`}
						title={challenge.title}
						meta={challenge.topic}
						visualChallenge={challenge}
						complete={Boolean(progress.challenges[challenge.id]?.completedAt)}
						balanced
						analyticsLabel={`Open ${challenge.title} challenge`}
						onclick={() => recordSubjectPathSelection('challenge_subject_catalogue')}
					/>
				{/each}
			</div>
		</section>

		<ChallengeLeaderboard
			snapshot={data.leaderboard}
			scopeLabel={data.subject.label}
			personalScore={totalBestScore}
			personalCompleted={completedCount}
			signedIn={Boolean(data.user)}
		/>

		<CurriculumDisclosure>
			<ul class="curriculum-links" aria-label={`Official ${data.subject.label} curriculum links`}>
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
	.challenge-subject-shell {
		display: grid;
		gap: clamp(1.25rem, 3vw, 2.2rem);
		width: min(100%, 66rem);
		margin: 0 auto;
	}

	.subject-nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.75rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
		font-weight: 650;
	}

	.subject-nav a {
		display: inline-flex;
		min-height: 2.25rem;
		align-items: center;
		gap: 0.38rem;
		color: var(--qc-ui-text-secondary);
		text-decoration: none;
		transition: color 150ms ease;
	}

	.subject-nav a:hover {
		color: var(--qc-ui-accent-text);
	}

	.subject-nav a:focus-visible {
		outline: 3px solid var(--qc-ui-accent-text);
		outline-offset: 2px;
	}

	.subject-nav strong {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		color: var(--qc-ui-text);
		font-weight: 700;
	}

	.subject-hero {
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

	.recommended-cases {
		display: grid;
		gap: 0.8rem;
		padding-top: 1rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.recommended-cases h2 {
		margin: 0;
	}

	.recommended-cases h2 {
		font-size: clamp(1.4rem, 2.6vw, 1.75rem);
		font-weight: 600;
		line-height: 1.15;
		letter-spacing: -0.018em;
		text-wrap: balance;
	}

	.recommended-cases > div {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.65rem;
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

	@media (max-width: 760px) {
		.recommended-cases > div {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.subject-nav a {
			transition: none;
		}
	}
</style>
