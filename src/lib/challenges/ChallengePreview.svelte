<script lang="ts">
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { ArrowRight } from '@lucide/svelte';
	import type { PublicChallengePreviewDefinition } from './authoredData';
	import { challengePath, challengeSubjectLabel } from './routing';
	import ChallengeButton from './ui/ChallengeButton.svelte';
	import ChallengePanel from './ui/ChallengePanel.svelte';
	import ThemeAwareChallengeArt from './ui/ThemeAwareChallengeArt.svelte';
	import { challengeVisual } from './visuals';

	let {
		challenge,
		stacked = false,
		headingLevel = 'h3',
		headline,
		completed = false
	}: {
		challenge: PublicChallengePreviewDefinition;
		stacked?: boolean;
		headingLevel?: 'h1' | 'h2' | 'h3';
		headline?: string;
		completed?: boolean;
	} = $props();

	const subjectLabel = $derived(challengeSubjectLabel(challenge.subject));
	const art = $derived(challengeVisual(challenge)?.cardArt);
</script>

<div class:has-art={Boolean(art)} class="challenge-preview" data-subject={challenge.subject}>
	<ChallengePanel {stacked} raised>
		<header>
			<div>
				<span>GCSE {subjectLabel}</span>
				{#if headingLevel === 'h1'}
					<h1>{headline ?? challenge.title}</h1>
				{:else if headingLevel === 'h2'}
					<h2>{headline ?? challenge.title}</h2>
				{:else}
					<h3>{headline ?? challenge.title}</h3>
				{/if}
			</div>
			<span class="challenge-format"
				>{challenge.marks} {challenge.marks === 1 ? 'mark' : 'marks'}</span
			>
		</header>

		{#if art}
			<div class="feature-art">
				<ThemeAwareChallengeArt
					src={art.src}
					darkSrc={art.darkSrc}
					alt={art.alt}
					width={art.width}
					height={art.height}
					loading={headingLevel === 'h1' ? 'eager' : 'lazy'}
					fetchpriority={headingLevel === 'h1' ? 'high' : 'auto'}
				/>
			</div>
		{/if}

		<div class="question-preview">
			<p><MathText text={challenge.previewQuestion} /></p>
		</div>

		<div class="preview-actions">
			<ChallengeButton
				href={challengePath(challenge)}
				analyticsLabel={`${completed ? 'Replay' : 'Start'} challenge: ${challenge.id}`}
			>
				{completed ? 'Play again' : 'Play now'}
				<ArrowRight size={17} aria-hidden="true" />
			</ChallengeButton>
		</div>
	</ChallengePanel>
</div>

<style>
	.challenge-preview {
		min-width: 0;
	}

	.challenge-preview.has-art :global(.challenge-panel) {
		grid-template-areas:
			'heading heading'
			'art question'
			'art actions';
		grid-template-columns: minmax(0, 1fr) minmax(22rem, 1.08fr);
		align-items: start;
	}

	header,
	header > div:first-child,
	.preview-actions {
		display: flex;
		min-width: 0;
	}

	header {
		grid-area: heading;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	header > div:first-child {
		flex: 1 1 auto;
		flex-direction: column;
		gap: 0.22rem;
	}

	header span,
	.challenge-format {
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
		font-weight: 650;
		letter-spacing: 0.03em;
	}

	.feature-art {
		display: block;
		grid-area: art;
		overflow: hidden;
		aspect-ratio: 16 / 9;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.feature-art :global(.theme-aware-challenge-art) {
		width: 100%;
		height: 100%;
	}

	header h1,
	header h2,
	header h3,
	.question-preview p {
		margin: 0;
	}

	header h1,
	header h2,
	header h3 {
		color: var(--qc-ui-text);
		max-width: 32ch;
		font-size: clamp(1.65rem, 3vw, 2.15rem);
		font-weight: 600;
		line-height: 1.1;
		letter-spacing: -0.018em;
		text-wrap: balance;
	}

	.challenge-format {
		flex: 0 0 auto;
		padding: 0.42rem 0.58rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.question-preview {
		display: grid;
		grid-area: question;
		gap: 0.38rem;
		padding: clamp(0.9rem, 2vw, 1.15rem);
		border-left: 3px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-muted);
	}

	.question-preview p {
		color: var(--qc-ui-text);
		font-size: clamp(1.08rem, 1.8vw, 1.25rem);
		font-weight: 500;
		line-height: 1.5;
	}

	.preview-actions {
		grid-area: actions;
		align-self: end;
		align-items: center;
		justify-content: flex-end;
		padding-top: 0.2rem;
	}

	.preview-actions :global(.challenge-button) {
		min-width: min(100%, 14rem);
	}

	@media (max-width: 820px) {
		.challenge-preview.has-art :global(.challenge-panel) {
			grid-template-areas:
				'heading'
				'art'
				'question'
				'actions';
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 560px) {
		header {
			gap: 0.65rem;
		}

		header h1,
		header h2,
		header h3 {
			font-size: 1.6rem;
		}

		.challenge-format {
			padding: 0.34rem 0.45rem;
		}

		.preview-actions {
			align-items: stretch;
			justify-content: stretch;
		}

		.preview-actions :global(.challenge-button) {
			width: 100%;
		}
	}
</style>
