<script lang="ts">
	import { analyticsEvent } from '$lib/analytics/client';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { haptics } from '$lib/haptics';
	import { ArrowRight, CheckCircle2, CircleX } from '@lucide/svelte';
	import { challengePath } from './catalog';
	import type { ChallengeDefinition } from './types';
	import ChallengeButton from './ui/ChallengeButton.svelte';
	import ChallengeChoice from './ui/ChallengeChoice.svelte';
	import ChallengePanel from './ui/ChallengePanel.svelte';

	let {
		challenge,
		stacked = false,
		headingLevel = 'h3'
	}: {
		challenge: ChallengeDefinition;
		stacked?: boolean;
		headingLevel?: 'h2' | 'h3';
	} = $props();

	let selected = $state<'a' | 'b' | null>(null);
	const correct = $derived(selected === challenge.strongerAnswer);
	const fullChallengeHref = $derived(
		selected ? `${challengePath(challenge)}?previewChoice=${selected}` : challengePath(challenge)
	);

	function choose(answer: 'a' | 'b') {
		if (selected) return;
		selected = answer;
		if (answer === challenge.strongerAnswer) haptics.success();
		else haptics.error();
		analyticsEvent('challenge_preview_pick', {
			challengeId: challenge.id,
			subject: challenge.subject,
			answer,
			correct: answer === challenge.strongerAnswer
		});
	}
</script>

<div class="challenge-preview" data-subject={challenge.subject}>
	<ChallengePanel {stacked} raised>
		<header>
			<div>
				<span>{challenge.subject === 'biology' ? 'Biology' : 'Physics'} quick play</span>
				{#if headingLevel === 'h2'}
					<h2>{challenge.title}</h2>
				{:else}
					<h3>{challenge.title}</h3>
				{/if}
			</div>
			<span class="preview-time">{challenge.estimatedMinutes} min</span>
		</header>

		<p class="preview-question"><MathText text={challenge.previewQuestion} /></p>
		<p class="preview-prompt">
			{challenge.mechanic === 'first-wrong-step'
				? 'Which working is better supported by the marking points?'
				: 'Which answer is better supported by the marking points?'}
		</p>

		<div class="preview-answers" aria-label="Choose the stronger answer" data-nosnippet>
			{#each ['a', 'b'] as answer (answer)}
				{@const answerKey = answer as 'a' | 'b'}
				<ChallengeChoice
					text={challenge.staticAnswers[answerKey]}
					label={`Answer ${answerKey.toUpperCase()}`}
					selected={selected === answerKey}
					status={selected
						? answerKey === challenge.strongerAnswer
							? 'correct'
							: selected === answerKey
								? 'incorrect'
								: 'idle'
						: 'idle'}
					feedback={selected === answerKey
						? answerKey === challenge.strongerAnswer
							? 'This is the stronger answer. Open the full case to uncover the scoring link.'
							: 'This is the tempting near-miss. Open the full case to find the decisive gap.'
						: null}
					disabled={Boolean(selected)}
					prominent
					onclick={() => choose(answerKey)}
					analyticsLabel={`Challenge preview ${challenge.id}: choose answer ${answerKey.toUpperCase()}`}
				/>
			{/each}
		</div>

		{#if selected}
			<div class:correct class:incorrect={!correct} class="preview-result" aria-live="polite">
				<span aria-hidden="true">
					{#if correct}
						<CheckCircle2 size={22} strokeWidth={2.3} />
					{:else}
						<CircleX size={22} strokeWidth={2.3} />
					{/if}
				</span>
				<div>
					<strong>{correct ? 'You saw it.' : 'That is the tempting one.'}</strong>
					<p>{challenge.showdownExplanation}</p>
				</div>
			</div>
		{/if}

		<ChallengeButton
			href={fullChallengeHref}
			fullWidth
			analyticsLabel={`Open full challenge: ${challenge.id}`}
		>
			{selected
				? `See why Answer ${challenge.strongerAnswer.toUpperCase()} earns the mark`
				: 'Play the full challenge'}
			<ArrowRight size={17} aria-hidden="true" />
		</ChallengeButton>
	</ChallengePanel>
</div>

<style>
	.challenge-preview {
		min-width: 0;
	}

	header,
	header > div {
		display: flex;
		min-width: 0;
	}

	header {
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	header > div {
		flex-direction: column;
		gap: 0.22rem;
	}

	header span,
	.preview-time,
	.preview-prompt {
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.03em;
	}

	header h2,
	header h3,
	.preview-question,
	.preview-prompt,
	.preview-result p {
		margin: 0;
	}

	header h2,
	header h3 {
		color: var(--qc-ui-text);
		font-size: clamp(1.25rem, 2.5vw, 1.6rem);
		font-weight: 650;
		line-height: 1.18;
	}

	.preview-time {
		flex: 0 0 auto;
		padding: 0.3rem 0.45rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.preview-question {
		color: var(--qc-ui-text);
		font-size: clamp(1rem, 2vw, 1.12rem);
		font-weight: 550;
		line-height: 1.5;
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
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-secondary);
	}

	.preview-result.correct {
		border-color: var(--qc-ui-accent-border);
		color: var(--qc-ui-accent-text);
	}

	.preview-result.incorrect {
		border-color: var(--qc-ui-danger);
		color: var(--qc-ui-danger);
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
		.preview-answers {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
