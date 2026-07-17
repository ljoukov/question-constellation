<script lang="ts">
	import { analyticsEvent } from '$lib/analytics/client';
	import ChainIllustration from '$lib/chains/ChainIllustration.svelte';
	import type { ChainIllustration as ChainIllustrationData } from '$lib/chains/chainIllustration';
	import { ScanSearch } from '@lucide/svelte';
	import type { ChallengeDefinition } from '../types';
	import { challengeVisual } from '../visuals';
	import ChallengeGapMap from './ChallengeGapMap.svelte';

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
	const illustration = $derived(illustrationOverride ?? visual?.earnedIllustration ?? null);
	const lightImage = $derived(
		illustration ? `url(${JSON.stringify(illustration.lightSrc)})` : 'none'
	);
	const darkImage = $derived(illustration ? `url(${JSON.stringify(illustration.src)})` : 'none');

	function reportAtlasPanComplete() {
		analyticsEvent('challenge_atlas_pan_complete', {
			challengeId: challenge.id,
			subject: challenge.subject
		});
	}
</script>

{#if mode === 'gap'}
	<ChallengeGapMap {challenge} {compact} />
{:else if mode === 'earned' && illustration}
	<div class="earned-atlas-shell">
		<ChainIllustration
			{illustration}
			label="Question Chain visual"
			showCaption
			{expandable}
			mobilePan
			mobilePanels={visual?.mobilePanels ?? []}
			eager
			onPanComplete={reportAtlasPanComplete}
		/>
	</div>
{:else if mode === 'earned'}
	<ChallengeGapMap {challenge} />
{:else}
	<div
		class:has-art={Boolean(illustration)}
		class:compact
		class="challenge-visual-teaser"
		role="img"
		aria-label={`Spoiler-free scientific preview for ${challenge.title}`}
		style:--teaser-light-image={lightImage}
		style:--teaser-dark-image={darkImage}
		style:--teaser-position={visual?.teaserPosition ?? '50% 50%'}
	>
		<div class="teaser-art" aria-hidden="true"></div>
		<div class="teaser-nodes" aria-hidden="true">
			<span></span><i></i><span></span><i></i><span></span>
		</div>
		<div class="teaser-scan" aria-hidden="true"></div>
		<span class="teaser-label"><ScanSearch size={15} /> Science clue · answer hidden</span>
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
		position: relative;
		min-height: 9.4rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background:
			radial-gradient(
				circle at 22% 35%,
				color-mix(in srgb, var(--qc-ui-accent) 22%, transparent),
				transparent 28%
			),
			linear-gradient(125deg, var(--qc-ui-surface-muted), var(--qc-ui-surface-raised));
		overflow: hidden;
		isolation: isolate;
	}

	.challenge-visual-teaser.compact {
		min-height: 6.5rem;
	}

	.teaser-art {
		position: absolute;
		inset: -14%;
		z-index: -2;
		background-image: var(--teaser-light-image);
		background-position: var(--teaser-position);
		background-repeat: no-repeat;
		background-size: 176% auto;
		filter: saturate(0.74) contrast(0.9) blur(2.4px);
		transform: scale(1.04);
	}

	.challenge-visual-teaser:not(.has-art) .teaser-art {
		background-image:
			radial-gradient(
				circle at 52% 48%,
				color-mix(in srgb, var(--qc-ui-accent) 42%, transparent) 0 4%,
				transparent 5%
			),
			repeating-linear-gradient(
				0deg,
				transparent 0 24px,
				color-mix(in srgb, var(--qc-ui-border-subtle) 40%, transparent) 25px
			),
			repeating-linear-gradient(
				90deg,
				transparent 0 24px,
				color-mix(in srgb, var(--qc-ui-border-subtle) 40%, transparent) 25px
			);
	}

	.challenge-visual-teaser::after {
		position: absolute;
		inset: 0;
		z-index: -1;
		background:
			linear-gradient(
				90deg,
				var(--qc-ui-surface-raised),
				transparent 28% 72%,
				var(--qc-ui-surface-raised)
			),
			linear-gradient(
				0deg,
				color-mix(in srgb, var(--qc-ui-surface-raised) 66%, transparent),
				transparent 38% 62%,
				color-mix(in srgb, var(--qc-ui-surface-raised) 54%, transparent)
			);
		content: '';
	}

	.teaser-nodes {
		position: absolute;
		top: 50%;
		left: 50%;
		display: flex;
		width: min(72%, 28rem);
		align-items: center;
		transform: translate(-50%, -50%);
		opacity: 0.74;
	}

	.teaser-nodes span {
		width: 0.72rem;
		height: 0.72rem;
		flex: 0 0 auto;
		border: 2px solid var(--qc-ui-accent-text);
		background: var(--qc-ui-surface-raised);
		box-shadow: 0 0 1rem color-mix(in srgb, var(--qc-ui-accent) 52%, transparent);
	}

	.teaser-nodes i {
		height: 1px;
		flex: 1 1 auto;
		background: linear-gradient(
			90deg,
			var(--qc-ui-accent-text),
			transparent 45% 55%,
			var(--qc-ui-accent-text)
		);
	}

	.has-art .teaser-nodes {
		opacity: 0.25;
	}

	.teaser-scan {
		position: absolute;
		top: 0;
		bottom: 0;
		left: -18%;
		width: 18%;
		background: linear-gradient(
			90deg,
			transparent,
			color-mix(in srgb, var(--qc-ui-accent) 28%, transparent),
			transparent
		);
		animation: teaser-scan calc(var(--challenge-motion-duration, 560ms) * 4.3)
			cubic-bezier(0.2, 0.75, 0.2, 1) 240ms 1 both;
	}

	.teaser-label {
		position: absolute;
		right: 0.7rem;
		bottom: 0.65rem;
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		padding: 0.35rem 0.48rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface-raised) 90%, transparent);
		color: var(--qc-ui-text-secondary);
		font-size: 0.7rem;
		font-weight: 680;
		backdrop-filter: blur(8px);
	}

	:global(:root[data-theme='dark']) .teaser-art {
		background-image: var(--teaser-dark-image);
		filter: saturate(0.8) contrast(1.02) blur(2.4px);
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .teaser-art {
			background-image: var(--teaser-dark-image);
			filter: saturate(0.8) contrast(1.02) blur(2.4px);
		}
	}

	@keyframes teaser-scan {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(660%);
		}
	}

	@media (max-width: 520px) {
		.challenge-visual-teaser {
			min-height: 7rem;
		}

		.challenge-visual-teaser.compact {
			min-height: 5.4rem;
		}

		.teaser-label {
			right: 0.45rem;
			bottom: 0.4rem;
			font-size: 0.64rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.teaser-scan {
			display: none;
		}
	}
</style>
