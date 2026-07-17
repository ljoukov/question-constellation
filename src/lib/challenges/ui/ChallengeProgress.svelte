<script lang="ts">
	let {
		steps,
		activeIndex,
		value,
		complete = false,
		label = 'Challenge progress'
	}: {
		steps: Array<{ short: string; label: string }>;
		activeIndex: number;
		value?: number;
		complete?: boolean;
		label?: string;
	} = $props();

	const progressValue = $derived(
		complete ? steps.length : Math.min(steps.length, Math.max(0, value ?? activeIndex))
	);
	const completed = $derived(complete ? steps.length : Math.max(0, activeIndex));
	const width = $derived(`${(progressValue / steps.length) * 100}%`);
	const currentLabel = $derived(
		complete ? 'Complete' : (steps[Math.max(0, activeIndex)]?.label ?? 'Challenge')
	);
</script>

<div class="challenge-progress" aria-label={label}>
	<div class="progress-copy">
		<strong>{progressValue} of {steps.length}</strong>
		<span>{currentLabel}</span>
	</div>
	<div
		class="progress-track"
		role="progressbar"
		aria-label={label}
		aria-valuemin="0"
		aria-valuemax={steps.length}
		aria-valuenow={progressValue}
		aria-valuetext={`${progressValue} of ${steps.length}; ${complete ? 'complete' : `current step: ${currentLabel}`}`}
	>
		<span style={`width: ${width}`}></span>
	</div>
	<ol>
		{#each steps as step, index (step.label)}
			<li
				class:active={!complete && index === activeIndex}
				class:done={complete || index < completed}
				aria-current={!complete && index === activeIndex ? 'step' : undefined}
				aria-label={`${step.label}${!complete && index === activeIndex ? ', current step' : ''}`}
			>
				<span>{complete || index < completed ? '✓' : step.short}</span>
				<small>{step.label}</small>
			</li>
		{/each}
	</ol>
</div>

<style>
	.challenge-progress {
		display: grid;
		gap: 0.48rem;
		min-width: 0;
	}

	.progress-copy {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.86rem;
	}

	.progress-copy strong {
		color: var(--qc-ui-text);
	}

	.progress-track {
		height: 0.52rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.progress-track > span {
		display: block;
		height: 100%;
		background: var(--qc-ui-accent);
		transition: width var(--challenge-motion-duration, 180ms) ease;
	}

	ol {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		min-width: 0;
		color: var(--qc-ui-text-subtle);
	}

	li > span {
		display: inline-grid;
		width: 1.4rem;
		height: 1.4rem;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
		font-size: 0.68rem;
		font-weight: 700;
	}

	li small {
		overflow: hidden;
		font-size: 0.7rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	li.active,
	li.done {
		color: var(--qc-ui-accent-text);
	}

	li.active > span,
	li.done > span {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	@media (max-width: 520px) {
		li small {
			display: none;
		}

		li {
			justify-content: center;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.progress-track > span {
			transition: none;
		}
	}
</style>
