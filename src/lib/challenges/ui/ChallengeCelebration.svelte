<script lang="ts">
	let { variant }: { variant: 'record' | 'orbit' } = $props();

	const shards = [
		{ x: -220, y: 96, r: -150, delay: 0 },
		{ x: -176, y: 154, r: 115, delay: 70 },
		{ x: -126, y: 72, r: -80, delay: 25 },
		{ x: -74, y: 174, r: 190, delay: 110 },
		{ x: -28, y: 104, r: -120, delay: 45 },
		{ x: 32, y: 164, r: 135, delay: 85 },
		{ x: 82, y: 82, r: -190, delay: 10 },
		{ x: 132, y: 168, r: 95, delay: 105 },
		{ x: 182, y: 112, r: -115, delay: 55 },
		{ x: 224, y: 150, r: 165, delay: 90 }
	] as const;
</script>

<div class:orbit={variant === 'orbit'} class="challenge-celebration" aria-hidden="true">
	<span class="burst"></span>
	{#each shards as shard, index (`${shard.x}-${shard.y}`)}
		<i
			class:secondary={index % 3 === 1}
			class:quiet={index % 3 === 2}
			style={`--x:${shard.x}px;--y:${shard.y}px;--r:${shard.r}deg;--delay:${shard.delay}ms`}
		></i>
	{/each}
</div>

<style>
	.challenge-celebration {
		position: absolute;
		z-index: 0;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.challenge-celebration i {
		position: absolute;
		top: 2.8rem;
		left: 50%;
		width: 0.46rem;
		height: 0.9rem;
		border: 1px solid color-mix(in srgb, var(--qc-ui-accent) 76%, white);
		background: var(--qc-ui-accent);
		opacity: 0;
		animation: score-shard 980ms cubic-bezier(0.16, 0.72, 0.28, 1) var(--delay) both;
	}

	.challenge-celebration i.secondary {
		width: 0.72rem;
		height: 0.38rem;
		background: var(--qc-ui-text);
	}

	.challenge-celebration i.quiet {
		width: 0.32rem;
		height: 0.72rem;
		background: transparent;
	}

	.challenge-celebration.orbit i {
		top: 3.6rem;
		animation-duration: 1180ms;
	}

	.burst {
		position: absolute;
		top: 3rem;
		left: 50%;
		width: 5rem;
		height: 5rem;
		border: 1px solid var(--qc-ui-accent-border);
		opacity: 0;
		transform: translate(-50%, -50%) rotate(45deg);
		animation: score-burst 900ms ease-out both;
	}

	.orbit .burst {
		width: 7rem;
		height: 7rem;
		animation-duration: 1100ms;
	}

	@keyframes score-shard {
		0% {
			opacity: 0;
			transform: translate(-50%, 0) rotate(0deg) scale(0.45);
		}
		14% {
			opacity: 1;
		}
		100% {
			opacity: 0;
			transform: translate(calc(-50% + var(--x)), var(--y)) rotate(var(--r)) scale(1);
		}
	}

	@keyframes score-burst {
		0% {
			opacity: 0;
			transform: translate(-50%, -50%) rotate(45deg) scale(0.35);
		}
		28% {
			opacity: 0.82;
		}
		100% {
			opacity: 0;
			transform: translate(-50%, -50%) rotate(45deg) scale(1.55);
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
