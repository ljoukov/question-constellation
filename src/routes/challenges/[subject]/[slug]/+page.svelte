<script lang="ts">
	import { browser } from '$app/environment';
	import ChallengeGame from '$lib/challenges/ChallengeGame.svelte';
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
	import { challengePath, challengeSubjectLabel } from '$lib/challenges/routing';
	import {
		challengeSocialImage,
		challengeSocialImageAlt,
		challengeSocialImageHeight,
		challengeSocialImageWidth
	} from '$lib/challenges/seo';
	import ChallengeRouteShell from '$lib/challenges/ui/ChallengeRouteShell.svelte';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const subjectLabel = $derived(`GCSE ${challengeSubjectLabel(data.challenge.subject)}`);
	const subjectCanonicalPath = $derived(`/challenges/${data.challenge.subject}`);
	const canonicalUrl = $derived(
		`https://constellation.eviworld.com${challengePath(data.challenge)}`
	);
	const pageTitle = $derived(`${data.challenge.title} | ${subjectLabel}`);
	const publicDescription = $derived(
		`${subjectLabel} challenge: ${data.challenge.previewQuestion}`
	);
	const nextChallenges = $derived(data.nextChallenges);
	const userId = $derived(data.user?.uid ?? null);
	const serverProgress = $derived(data.initialProgress as ChallengeProgress);
	let browserProgress = $state<ChallengeProgress | null>(null);
	const initialProgress = $derived(browserProgress ?? serverProgress);
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
						item: `https://constellation.eviworld.com${subjectCanonicalPath}`
					},
					{
						'@type': 'ListItem',
						position: 4,
						name: data.challenge.title,
						item: canonicalUrl
					}
				]
			},
			{
				'@context': 'https://schema.org',
				'@type': 'LearningResource',
				name: data.challenge.title,
				description: publicDescription,
				url: canonicalUrl,
				learningResourceType: 'Interactive challenge',
				educationalLevel: 'GCSE',
				about: [subjectLabel, data.challenge.topic, 'Exam answer reasoning'],
				teaches: data.challenge.topic,
				timeRequired: `PT${data.challenge.estimatedMinutes}M`,
				isAccessibleForFree: true,
				dateModified: data.challenge.lastReviewed,
				inLanguage: 'en-GB',
				provider: {
					'@type': 'Organization',
					name: 'Question Constellation',
					url: 'https://constellation.eviworld.com/'
				},
				...(data.curriculumCitation ? { citation: data.curriculumCitation.officialUrl } : {})
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
			browserProgress = mergeChallengeProgress(initialProgress, detail.progress);
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
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={publicDescription} />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Question Constellation" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={publicDescription} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:image" content={challengeSocialImage} />
	<meta property="og:image:width" content={challengeSocialImageWidth} />
	<meta property="og:image:height" content={challengeSocialImageHeight} />
	<meta property="og:image:alt" content={challengeSocialImageAlt} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={publicDescription} />
	<meta name="twitter:image" content={challengeSocialImage} />
	<meta name="twitter:image:alt" content={challengeSocialImageAlt} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html jsonLdScript}
</svelte:head>

<ChallengeRouteShell user={data.user} wide focused immersive>
	<div class="challenge-leaf-shell">
		{#key data.challenge.id}
			<ChallengeGame
				challenge={data.challenge}
				chain={data.chain}
				{nextChallenges}
				{initialProgress}
				{userId}
			/>
		{/key}
	</div>
</ChallengeRouteShell>

<style>
	.challenge-leaf-shell {
		min-width: 0;
	}
</style>
