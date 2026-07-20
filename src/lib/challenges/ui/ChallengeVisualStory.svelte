<script lang="ts">
	import { analyticsEvent } from '$lib/analytics/client';
	import ChainIllustration from '$lib/chains/ChainIllustration.svelte';
	import type { ChainIllustration as ChainIllustrationData } from '$lib/chains/chainIllustration';
	import type { ChallengeDefinition } from '../types';
	import { challengeVisual } from '../visuals';
	import ChallengeGapMap from './ChallengeGapMap.svelte';
	import ThemeAwareChallengeArt from './ThemeAwareChallengeArt.svelte';

	let {
		challenge,
		mode = 'teaser',
		compact = false,
		expandable = false,
		illustrationOverride = null
	}: {
		challenge: ChallengeDefinition;
		mode?: 'teaser' | 'gap' | 'earned';
		compact?: boolean;
		expandable?: boolean;
		illustrationOverride?: ChainIllustrationData | null;
	} = $props();

	const visual = $derived(challengeVisual(challenge));
	const cardArt = $derived(visual?.cardArt ?? null);
	const earnedIllustration = $derived(illustrationOverride ?? visual?.earnedIllustration ?? null);

	function reportAtlasPanComplete() {
		analyticsEvent('challenge_atlas_pan_complete', {
			challengeId: challenge.id,
			subject: challenge.subject
		});
	}
</script>

{#if mode === 'gap'}
	<ChallengeGapMap {challenge} {compact} />
{:else if mode === 'earned' && earnedIllustration}
	<div class="earned-atlas-shell">
		<ChainIllustration
			illustration={earnedIllustration}
			label="Method visual"
			showCaption
			{expandable}
			mobilePanels={visual?.mobilePanels ?? []}
			eager
			onPanComplete={reportAtlasPanComplete}
		/>
	</div>
{:else if mode === 'earned'}
	<ChallengeGapMap {challenge} />
{:else if cardArt}
	<div class:compact class="challenge-visual-teaser">
		<ThemeAwareChallengeArt
			src={cardArt.src}
			darkSrc={cardArt.darkSrc}
			alt={cardArt.alt}
			width={cardArt.width}
			height={cardArt.height}
		/>
	</div>
{/if}

<style>
	.earned-atlas-shell,
	.earned-atlas-shell :global(.chain-illustration) {
		width: 100%;
		max-width: 100%;
		min-width: 0;
	}

	.earned-atlas-shell {
		max-width: 100%;
		overflow: hidden;
		contain: inline-size;
	}

	.challenge-visual-teaser {
		width: 100%;
		min-width: 0;
	}

	.challenge-visual-teaser :global(.theme-aware-challenge-art) {
		width: 100%;
	}
</style>
