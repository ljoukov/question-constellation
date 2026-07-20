<script lang="ts">
	let {
		steps,
		activeIndex,
		value,
		complete = false,
		label = 'Challenge progress',
		reviewIndex = null,
		onStepSelect
	}: {
		steps: Array<{ short: string; label: string }>;
		activeIndex: number;
		value?: number;
		complete?: boolean;
		label?: string;
		reviewIndex?: number | null;
		onStepSelect?: (index: number) => void;
	} = $props();

	const learnerLabels = ['Compare', 'Problem', 'Fix', 'Apply'] as const;
	const stepCount = $derived(steps.length);
	const safeActiveIndex = $derived(
		stepCount === 0 ? 0 : Math.min(stepCount - 1, Math.max(0, activeIndex))
	);
	const safeReviewIndex = $derived(
		reviewIndex !== null &&
			reviewIndex >= 0 &&
			reviewIndex < safeActiveIndex &&
			reviewIndex < stepCount
			? reviewIndex
			: null
	);
	const currentNumber = $derived(stepCount === 0 ? 0 : complete ? stepCount : safeActiveIndex + 1);
	const reportedValue = $derived(
		complete ? stepCount : Math.min(stepCount, Math.max(currentNumber, value ?? currentNumber))
	);
	const currentFullLabel = $derived(
		complete
			? 'Challenge complete'
			: (steps[safeActiveIndex]?.label ??
					learnerLabels[safeActiveIndex] ??
					steps[safeActiveIndex]?.short ??
					'Challenge')
	);

	function stateFor(index: number) {
		if (complete) return 'completed';
		if (index === safeReviewIndex) return 'reviewing';
		if (index < safeActiveIndex) return 'completed';
		if (index === safeActiveIndex) return safeReviewIndex === null ? 'current' : 'returning';
		return 'pending';
	}

	function canSelect(index: number) {
		return (
			!complete &&
			Boolean(onStepSelect) &&
			(index < safeActiveIndex || (safeReviewIndex !== null && index === safeActiveIndex))
		);
	}

	function controlLabel(index: number, stepLabel: string) {
		return index === safeActiveIndex ? `Return to ${stepLabel}` : `Review ${stepLabel}`;
	}
</script>

<div
	class="challenge-progress"
	role="group"
	aria-label={label}
	style={`--challenge-step-count: ${Math.max(stepCount, 1)}`}
>
	<div class="progress-rail">
		{#each steps as step, index (step.label)}
			{@const state = stateFor(index)}
			<div
				class="progress-step"
				class:completed={state === 'completed'}
				class:current={state === 'current'}
				class:reviewing={state === 'reviewing'}
				class:returning={state === 'returning'}
			>
				{#if canSelect(index)}
					<button
						class="step-control"
						type="button"
						aria-label={controlLabel(index, step.label)}
						aria-pressed={state === 'reviewing'}
						aria-current={state === 'returning' ? 'step' : undefined}
						onclick={() => onStepSelect?.(index)}
					>
						<span class="step-marker">{index + 1}</span>
						<strong>{learnerLabels[index] ?? step.short}</strong>
					</button>
				{:else}
					<div
						class="step-control"
						aria-current={state === 'current' || state === 'returning' ? 'step' : undefined}
						aria-hidden="true"
					>
						<span class="step-marker">{index + 1}</span>
						<strong>{learnerLabels[index] ?? step.short}</strong>
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<span
		class="visually-hidden"
		role="progressbar"
		aria-label={label}
		aria-valuemin="0"
		aria-valuemax={stepCount}
		aria-valuenow={reportedValue}
		aria-valuetext={complete
			? `${stepCount} of ${stepCount}; challenge complete`
			: `Step ${currentNumber} of ${stepCount}; ${currentFullLabel}`}
	>
	</span>

	<ol class="visually-hidden">
		{#each steps as step, index (step.label)}
			{@const state = stateFor(index)}
			<li aria-current={state === 'current' || state === 'returning' ? 'step' : undefined}>
				{step.label}: {state}.
			</li>
		{/each}
	</ol>
</div>

<style>
	.challenge-progress {
		display: block;
		width: 100%;
		min-width: 0;
	}

	.progress-rail {
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--challenge-step-count, 4), minmax(0, 1fr));
		min-width: 0;
	}

	.progress-step {
		position: relative;
		min-width: 0;
		color: var(--qc-ui-text-subtle);
	}

	.progress-step:not(:last-child)::after {
		position: absolute;
		top: 1.05rem;
		left: calc(50% + 0.9rem);
		z-index: 0;
		width: calc(100% - 1.8rem);
		height: 2px;
		content: '';
		background: var(--qc-ui-border-subtle);
		transition: background var(--challenge-motion-duration, 180ms) ease;
	}

	.progress-step.completed:not(:last-child)::after,
	.progress-step.reviewing:not(:last-child)::after {
		background: color-mix(in srgb, var(--qc-ui-accent) 62%, var(--qc-ui-border-subtle));
	}

	.step-control {
		position: relative;
		z-index: 1;
		display: grid;
		width: 100%;
		min-width: 0;
		min-height: 2.75rem;
		grid-template-rows: 2.1rem auto;
		gap: 0.22rem;
		justify-items: center;
		align-items: start;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
	}

	button.step-control {
		cursor: pointer;
	}

	button.step-control:hover .step-marker {
		border-color: var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-muted);
	}

	button.step-control:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--qc-ui-accent) 28%, transparent);
		outline-offset: 2px;
	}

	.step-marker {
		position: relative;
		z-index: 1;
		display: inline-grid;
		width: 2.1rem;
		height: 2.1rem;
		box-sizing: border-box;
		place-items: center;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		line-height: 1;
		transition:
			border-color var(--challenge-motion-duration, 180ms) ease,
			background var(--challenge-motion-duration, 180ms) ease,
			color var(--challenge-motion-duration, 180ms) ease,
			box-shadow var(--challenge-motion-duration, 180ms) ease;
	}

	.step-control > strong {
		overflow: hidden;
		max-width: 100%;
		color: inherit;
		font-size: clamp(0.7rem, 1vw, 0.8rem);
		font-weight: 650;
		line-height: 1.15;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.progress-step.completed {
		color: var(--qc-ui-text-secondary);
	}

	.progress-step.completed .step-marker {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
		font-weight: 720;
	}

	.progress-step.current {
		color: var(--qc-ui-text);
	}

	.progress-step.current .step-marker {
		border: 2px solid var(--qc-ui-accent);
		background: var(--qc-ui-accent-muted);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--qc-ui-accent) 11%, transparent);
		color: var(--qc-ui-accent-text);
		font-size: 0.8rem;
		font-weight: 820;
	}

	.progress-step.current .step-control > strong {
		font-weight: 780;
	}

	.progress-step.reviewing {
		color: var(--qc-ui-text-secondary);
	}

	.progress-step.reviewing .step-marker {
		border-color: var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-secondary);
		font-weight: 680;
	}

	.progress-step.returning {
		color: var(--qc-ui-text-secondary);
	}

	.progress-step.returning .step-marker {
		border: 2px solid var(--qc-ui-accent-border);
		background: color-mix(in srgb, var(--qc-ui-accent-muted) 58%, var(--qc-ui-surface-raised));
		color: var(--qc-ui-accent-text);
		font-weight: 820;
	}

	.progress-step.returning .step-control > strong {
		font-weight: 720;
	}

	.progress-step.returning button.step-control:hover .step-marker,
	.progress-step.returning button.step-control:focus-visible .step-marker {
		border-color: var(--qc-ui-accent);
		background: var(--qc-ui-accent-muted);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (prefers-reduced-motion: reduce) {
		.progress-step:not(:last-child)::after,
		.step-marker {
			transition: none;
		}
	}

	@media (max-width: 420px) {
		.progress-step:not(:last-child)::after {
			top: 0.95rem;
			left: calc(50% + 0.78rem);
			width: calc(100% - 1.56rem);
		}

		.step-control {
			min-height: 2.75rem;
			grid-template-rows: 1.9rem auto;
			gap: 0.18rem;
		}

		.step-marker {
			width: 1.9rem;
			height: 1.9rem;
			font-size: 0.68rem;
		}

		.progress-step.current .step-marker {
			font-size: 0.72rem;
		}

		.step-control > strong {
			font-size: 0.66rem;
		}
	}
</style>
