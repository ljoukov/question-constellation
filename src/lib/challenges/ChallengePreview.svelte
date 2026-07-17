<script lang="ts">
	import { analyticsEvent } from '$lib/analytics/client';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { haptics } from '$lib/haptics';
	import { ArrowRight, CheckCircle2, CircleHelp } from '@lucide/svelte';
	import { tick } from 'svelte';
	import { challengePath } from './catalog';
	import { playChallengeSound } from './sound';
	import type { ChallengeDefinition } from './types';
	import { challengeVisual } from './visuals';
	import ChallengeButton from './ui/ChallengeButton.svelte';
	import ChallengeChoice from './ui/ChallengeChoice.svelte';
	import ChallengePanel from './ui/ChallengePanel.svelte';
	import ChallengeSoundToggle from './ui/ChallengeSoundToggle.svelte';
	import ChallengeVisualStory from './ui/ChallengeVisualStory.svelte';

	let {
		challenge,
		stacked = false,
		headingLevel = 'h3',
		headline,
		showTeaser = true
	}: {
		challenge: ChallengeDefinition;
		stacked?: boolean;
		headingLevel?: 'h1' | 'h2' | 'h3';
		headline?: string;
		showTeaser?: boolean;
	} = $props();

	let selected = $state<'a' | 'b' | null>(null);
	let previewResult = $state<HTMLElement | null>(null);
	const correct = $derived(selected === challenge.strongerAnswer);
	const visual = $derived(challengeVisual(challenge));
	const fullChallengeHref = $derived(
		selected ? `${challengePath(challenge)}?previewChoice=${selected}` : challengePath(challenge)
	);

	function choose(answer: 'a' | 'b') {
		if (selected) return;
		selected = answer;
		if (answer === challenge.strongerAnswer) {
			haptics.success();
			void playChallengeSound('correct');
		} else {
			haptics.error();
			void playChallengeSound('incorrect');
		}
		analyticsEvent('challenge_preview_pick', {
			challengeId: challenge.id,
			subject: challenge.subject,
			answer,
			correct: answer === challenge.strongerAnswer
		});
		void revealResult();
	}

	async function revealResult() {
		await tick();
		previewResult?.scrollIntoView({
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
			block: 'center'
		});
	}
</script>

<div class="challenge-preview" data-subject={challenge.subject}>
	<ChallengePanel {stacked} raised>
		<header>
			<div>
				<span>GCSE {challenge.subject === 'biology' ? 'Biology' : 'Physics'} · one question</span>
				{#if headingLevel === 'h1'}
					<h1>{headline ?? challenge.title}</h1>
				{:else if headingLevel === 'h2'}
					<h2>{headline ?? challenge.title}</h2>
				{:else}
					<h3>{headline ?? challenge.title}</h3>
				{/if}
			</div>
			<div class="preview-tools">
				<span class="preview-time">{challenge.estimatedMinutes} min</span>
				<ChallengeSoundToggle />
			</div>
		</header>

		{#if showTeaser && !selected}
			<ChallengeVisualStory {challenge} mode="teaser" compact />
		{/if}

		<p class="preview-question"><MathText text={challenge.previewQuestion} /></p>
		<p class="preview-prompt">
			{challenge.mechanic === 'first-wrong-step'
				? 'Tap the working you would trust.'
				: 'Tap the answer you would trust.'}
		</p>

		<div
			class="preview-answers"
			role="group"
			aria-label="Choose the stronger answer"
			data-nosnippet
		>
			{#each ['a', 'b'] as answer (answer)}
				{@const answerKey = answer as 'a' | 'b'}
				<ChallengeChoice
					text={challenge.staticAnswers[answerKey]}
					label={selected
						? answerKey === challenge.strongerAnswer
							? `Answer ${answerKey.toUpperCase()} · stronger`
							: `Answer ${answerKey.toUpperCase()} · near-miss`
						: `Answer ${answerKey.toUpperCase()}`}
					selected={selected === answerKey}
					status={selected
						? answerKey === challenge.strongerAnswer
							? 'correct'
							: selected === answerKey
								? 'incorrect'
								: 'idle'
						: 'idle'}
					disabled={Boolean(selected)}
					prominent
					onclick={() => choose(answerKey)}
					analyticsLabel={`Challenge preview ${challenge.id}: choose answer ${answerKey.toUpperCase()}`}
				/>
			{/each}
		</div>

		{#if selected}
			<div class="preview-result" aria-live="polite" bind:this={previewResult}>
				<span aria-hidden="true">
					{#if correct}
						<CheckCircle2 size={22} strokeWidth={2.3} />
					{:else}
						<CircleHelp size={22} strokeWidth={2.3} />
					{/if}
				</span>
				<div>
					<strong>
						{correct ? 'Found it' : 'That answer breaks here'} — {visual?.decisiveLabel ??
							challenge.memoryHandle}
					</strong>
					<p>The exact cause-and-effect step is highlighted below.</p>
				</div>
			</div>

			<ChallengeVisualStory {challenge} mode="gap" compact />
		{/if}

		{#if selected}
			<ChallengeButton
				href={fullChallengeHref}
				fullWidth
				analyticsLabel={`Open full challenge: ${challenge.id}`}
			>
				Fix the missing link
				<ArrowRight size={17} aria-hidden="true" />
			</ChallengeButton>
		{/if}
	</ChallengePanel>
</div>

<style>
	.challenge-preview {
		min-width: 0;
	}

	header,
	header > div:first-child,
	.preview-tools {
		display: flex;
		min-width: 0;
	}

	header {
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	header > div:first-child {
		flex-direction: column;
		gap: 0.22rem;
	}

	.preview-tools {
		align-items: center;
		gap: 0.45rem;
	}

	header span,
	.preview-time,
	.preview-prompt {
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.03em;
	}

	header h1,
	header h2,
	header h3,
	.preview-question,
	.preview-prompt,
	.preview-result p {
		margin: 0;
	}

	header h1,
	header h2,
	header h3 {
		color: var(--qc-ui-text);
		font-size: clamp(1.35rem, 3vw, 2rem);
		font-weight: 560;
		line-height: 1.08;
		letter-spacing: -0.025em;
	}

	.preview-time {
		flex: 0 0 auto;
		padding: 0.3rem 0.45rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.preview-tools :global(.sound-control button) {
		width: 2.75rem;
		height: 2.75rem;
		min-width: 2.75rem;
		min-height: 2.75rem;
		border-radius: 0;
		box-shadow: none;
	}

	.preview-question {
		color: var(--qc-ui-text);
		font-size: clamp(0.98rem, 1.7vw, 1.08rem);
		font-weight: 520;
		line-height: 1.42;
	}

	.preview-prompt {
		color: var(--qc-ui-accent-text);
	}

	.preview-answers {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
	}

	.preview-result {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.7rem;
		align-items: start;
		padding: 0.85rem;
		border: 1px solid var(--qc-ui-accent-border);
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.preview-result strong {
		display: block;
		margin-bottom: 0.15rem;
		color: currentColor;
	}

	.preview-result p {
		color: var(--qc-ui-text-secondary);
		font-size: 0.9rem;
		line-height: 1.45;
	}

	@media (max-width: 560px) {
		header {
			gap: 0.65rem;
		}

		header h1,
		header h2,
		header h3 {
			font-size: 1.35rem;
		}

		.preview-time {
			display: none;
		}

		.preview-answers {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.5rem;
		}
	}
</style>
