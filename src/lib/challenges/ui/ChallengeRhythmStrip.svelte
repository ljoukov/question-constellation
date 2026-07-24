<script lang="ts">
	import { ArrowRight, Brain, Zap } from '@lucide/svelte';
</script>

<aside class="rhythm-strip" aria-label="How a challenge session works">
	<div class="rhythm-step peak">
		<span aria-hidden="true"><Zap size={17} strokeWidth={2.2} /></span>
		<div>
			<small>Challenge peak</small>
			<strong>4 focused steps</strong>
		</div>
	</div>
	<span class="rhythm-arrow" aria-hidden="true">
		<ArrowRight size={17} strokeWidth={2.1} />
	</span>
	<div class="rhythm-step">
		<span aria-hidden="true"><Brain size={17} strokeWidth={2.2} /></span>
		<div>
			<small>Change the pace</small>
			<strong>Matched memory beat</strong>
		</div>
	</div>
	<div class="rhythm-copy">
		<strong>Three rounds make one orbit.</strong>
		<span>Choose the path once; we queue each next step. Pause at any checkpoint.</span>
	</div>
</aside>

<style>
	.rhythm-strip {
		display: grid;
		grid-template-columns: auto auto auto minmax(12rem, 1fr);
		gap: 0.55rem;
		align-items: stretch;
		width: min(100%, 48rem);
		margin-top: -0.45rem;
		padding: 0.55rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface-muted) 76%, transparent);
		color: var(--qc-ui-text);
	}

	.rhythm-step {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.5rem;
		align-items: center;
		min-width: 0;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.rhythm-step.peak {
		border-color: var(--qc-ui-accent-border);
	}

	.rhythm-step > span {
		display: inline-grid;
		width: 1.85rem;
		height: 1.85rem;
		place-items: center;
		border: 1px solid var(--qc-ui-border-subtle);
		color: var(--qc-ui-accent-text);
	}

	.rhythm-step > div,
	.rhythm-copy {
		display: grid;
		gap: 0.05rem;
		min-width: 0;
	}

	.rhythm-step small {
		color: var(--qc-ui-text-muted);
		font-size: 0.61rem;
		font-weight: 760;
		letter-spacing: 0.045em;
		text-transform: uppercase;
	}

	.rhythm-step strong {
		font-size: 0.77rem;
		font-weight: 680;
		line-height: 1.25;
	}

	.rhythm-arrow {
		align-self: center;
		color: var(--qc-ui-text-muted);
	}

	.rhythm-copy {
		align-content: center;
		padding: 0.25rem 0.4rem;
	}

	.rhythm-copy strong {
		font-size: 0.78rem;
		line-height: 1.3;
	}

	.rhythm-copy span {
		color: var(--qc-ui-text-secondary);
		font-size: 0.7rem;
		line-height: 1.35;
	}

	@media (max-width: 720px) {
		.rhythm-strip {
			grid-template-columns: minmax(0, 1fr);
		}

		.rhythm-arrow {
			display: none;
		}

		.rhythm-copy {
			border-left: 3px solid var(--qc-ui-accent);
		}
	}
</style>
