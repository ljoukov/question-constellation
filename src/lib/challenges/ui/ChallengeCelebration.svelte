<script lang="ts">
	let { variant }: { variant: 'record' | 'orbit' } = $props();

	const nodes = [0, 1, 2, 3] as const;
</script>

<div class:orbit={variant === 'orbit'} class="challenge-celebration" aria-hidden="true">
	<span class="trace-line"></span>
	{#each nodes as node (node)}
		<i style={`--trace-position:${node / (nodes.length - 1)};--trace-delay:${node * 85}ms`}></i>
	{/each}
	<span class="registration-mark"></span>
</div>

<style>
	.challenge-celebration {
		position: absolute;
		z-index: 0;
		top: 0;
		right: 0;
		left: 0;
		height: 0.75rem;
		pointer-events: none;
	}

	.trace-line {
		position: absolute;
		top: 0.2rem;
		right: 0;
		left: 0;
		height: 2px;
		background: var(--qc-ui-accent);
		transform: scaleX(0);
		transform-origin: left;
		animation: chain-trace 620ms cubic-bezier(0.2, 0.78, 0.2, 1) 80ms both;
	}

	.challenge-celebration i {
		position: absolute;
		top: -0.03rem;
		left: calc(var(--trace-position) * 100%);
		width: 0.48rem;
		height: 0.48rem;
		border: 1px solid var(--qc-ui-accent);
		background: var(--qc-ui-surface-raised);
		opacity: 0;
		transform: translateX(-50%) scale(0.45);
		animation: chain-node-set 260ms ease-out calc(170ms + var(--trace-delay)) both;
	}

	.challenge-celebration.orbit i {
		background: var(--qc-ui-accent);
		box-shadow: inset 0 0 0 2px var(--qc-ui-surface-raised);
	}

	.registration-mark {
		position: absolute;
		top: -0.22rem;
		right: -0.34rem;
		width: 0.9rem;
		height: 0.9rem;
		border: 1px solid var(--qc-ui-accent-border);
		border-radius: 50%;
		opacity: 0;
		animation: registration-set 320ms ease-out 600ms both;
	}

	.registration-mark::before,
	.registration-mark::after {
		position: absolute;
		top: 50%;
		left: 50%;
		content: '';
		background: var(--qc-ui-accent);
		transform: translate(-50%, -50%);
	}

	.registration-mark::before {
		width: 1.15rem;
		height: 1px;
	}

	.registration-mark::after {
		width: 1px;
		height: 1.15rem;
	}

	@keyframes chain-trace {
		to {
			transform: scaleX(1);
		}
	}

	@keyframes chain-node-set {
		to {
			opacity: 1;
			transform: translateX(-50%) scale(1);
		}
	}

	@keyframes registration-set {
		from {
			opacity: 0;
			transform: rotate(-22deg) scale(0.72);
		}
		to {
			opacity: 0.9;
			transform: none;
		}
	}

	:global(html[data-visual-effects='off']) .challenge-celebration {
		display: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.challenge-celebration {
			display: none;
		}
	}
</style>
