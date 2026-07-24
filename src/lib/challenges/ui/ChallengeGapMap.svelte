<script lang="ts">
	import { ArrowRight, Sparkles } from '@lucide/svelte';
	import type { ChallengeDefinition } from '../types';
	import { challengeVisual } from '../visuals';

	let {
		challenge,
		compact = false,
		showLabel = true
	}: {
		challenge: Pick<ChallengeDefinition, 'id' | 'memoryHandle'>;
		compact?: boolean;
		showLabel?: boolean;
	} = $props();

	const visual = $derived(challengeVisual(challenge));
	const accessibleSummary = $derived(
		visual
			? `The decisive link is ${visual.segments[visual.decisiveIndex]}. ${visual.decisiveLabel}`
			: challenge.memoryHandle
	);
</script>

{#if visual}
	<div class:compact class="challenge-gap-map" role="img" aria-label={accessibleSummary}>
		<ol>
			{#each visual.segments as segment, index (segment)}
				<li
					class:decisive={index === visual.decisiveIndex}
					style={`--gap-step-delay: ${index * 72}ms`}
				>
					<span>{index + 1}</span>
					<strong>{segment}</strong>
				</li>
				{#if index < visual.segments.length - 1}
					<span
						class:broken={index + 1 === visual.decisiveIndex}
						class="gap-connector"
						aria-hidden="true"
					>
						<i></i>
						<ArrowRight size={compact ? 12 : 15} strokeWidth={1.7} />
					</span>
				{/if}
			{/each}
		</ol>
		{#if showLabel}
			<p>
				<Sparkles size={15} strokeWidth={1.8} aria-hidden="true" />
				<span><strong>Why it earns the mark</strong> {visual.decisiveLabel}</span>
			</p>
		{/if}
	</div>
{/if}

<style>
	.challenge-gap-map {
		display: grid;
		gap: 0.7rem;
		min-width: 0;
		padding: 0.8rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
		overflow: hidden;
	}

	ol {
		display: flex;
		min-width: 0;
		align-items: stretch;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		position: relative;
		display: grid;
		min-width: 0;
		flex: 1 1 0;
		gap: 0.24rem;
		align-content: center;
		padding: 0.62rem 0.55rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface) 76%, var(--qc-ui-surface-raised));
		animation: gap-node-in var(--challenge-motion-duration, 480ms) cubic-bezier(0.2, 0.78, 0.2, 1)
			both;
		animation-delay: var(--gap-step-delay);
	}

	li > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.68rem;
		font-weight: 760;
	}

	li strong {
		color: var(--qc-ui-text-secondary);
		font-size: clamp(0.72rem, 1.5vw, 0.86rem);
		font-weight: 600;
		line-height: 1.22;
	}

	li.decisive {
		z-index: 1;
		border-color: color-mix(in srgb, var(--qc-ui-accent) 45%, var(--qc-ui-border-subtle));
		background: var(--qc-ui-surface);
		box-shadow: inset 0 3px 0 var(--qc-ui-accent);
	}

	li.decisive > span {
		color: var(--qc-ui-accent-text);
	}

	li.decisive strong {
		color: var(--qc-ui-text);
	}

	.gap-connector {
		position: relative;
		display: inline-flex;
		width: clamp(1rem, 3vw, 1.75rem);
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		color: color-mix(in srgb, var(--qc-ui-text-muted) 62%, var(--qc-ui-border-subtle));
	}

	.gap-connector i {
		position: absolute;
		right: 0;
		left: 0;
		height: 1px;
		background: currentColor;
	}

	.gap-connector :global(svg) {
		position: relative;
		z-index: 1;
		margin-left: auto;
		background: var(--qc-ui-surface-raised);
	}

	.gap-connector.broken {
		color: color-mix(in srgb, var(--qc-ui-warning) 70%, var(--qc-ui-border-subtle));
		animation: gap-link-pulse var(--challenge-motion-duration, 480ms) ease-out both;
	}

	.gap-connector.broken i {
		background: repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 6px);
	}

	p {
		display: flex;
		gap: 0.48rem;
		align-items: flex-start;
		margin: 0;
		padding-top: 0.65rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
		color: var(--qc-ui-text-muted);
		font-size: 0.84rem;
		line-height: 1.4;
	}

	p :global(svg) {
		flex: 0 0 auto;
		margin-top: 0.1rem;
		color: var(--qc-ui-text-muted);
	}

	p strong {
		margin-right: 0.25rem;
		color: var(--qc-ui-text);
	}

	.challenge-gap-map.compact {
		gap: 0.55rem;
		padding: 0.65rem;
	}

	.challenge-gap-map.compact li {
		padding: 0.48rem 0.35rem;
	}

	.challenge-gap-map.compact li strong {
		font-size: clamp(0.63rem, 1.5vw, 0.76rem);
	}

	.challenge-gap-map.compact p {
		font-size: 0.8rem;
	}

	@keyframes gap-node-in {
		from {
			opacity: 0;
			transform: translateY(0.25rem);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	@keyframes gap-link-pulse {
		0% {
			opacity: 0;
			transform: scaleX(0.45);
		}
		100% {
			opacity: 1;
			transform: none;
		}
	}

	@media (max-width: 520px) {
		.challenge-gap-map {
			padding: 0.65rem;
		}

		li {
			padding: 0.48rem 0.28rem;
		}

		li > span {
			font-size: 0.59rem;
		}

		li strong {
			font-size: 0.65rem;
		}

		.gap-connector {
			width: 0.72rem;
		}

		.gap-connector :global(svg) {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		li,
		.gap-connector.broken {
			animation: none;
		}
	}
</style>
