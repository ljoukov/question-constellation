<script lang="ts">
	import { resolve } from '$app/paths';
	import { X } from '@lucide/svelte';
	import { tick, type Snippet } from 'svelte';
	import ChallengeProgress from './ChallengeProgress.svelte';
	import ChallengeSoundToggle from './ChallengeSoundToggle.svelte';

	let {
		exitHref,
		exitLabel,
		eyebrow,
		title,
		steps,
		activeIndex,
		value,
		complete = false,
		slowMotion = false,
		actionsVisible = true,
		children,
		actions
	}: {
		exitHref: string;
		exitLabel: string;
		eyebrow: string;
		title: string;
		steps: Array<{ short: string; label: string }>;
		activeIndex: number;
		value: number;
		complete?: boolean;
		slowMotion?: boolean;
		actionsVisible?: boolean;
		children: Snippet;
		actions?: Snippet;
	} = $props();

	let activeCard = $state<HTMLElement | null>(null);
	let showScrollCue = $state(false);

	function updateScrollCue() {
		if (!activeCard) {
			showScrollCue = false;
			return;
		}
		showScrollCue =
			activeCard.scrollHeight > activeCard.clientHeight + 8 && activeCard.scrollTop < 8;
	}

	$effect(() => {
		const shouldReset = activeIndex >= 0 || complete;
		if (!shouldReset) return;
		void tick().then(() => {
			activeCard?.scrollTo({ top: 0, behavior: 'auto' });
			updateScrollCue();
		});
	});

	$effect(() => {
		if (!activeCard || typeof ResizeObserver === 'undefined') return;
		const resizeObserver = new ResizeObserver(updateScrollCue);
		const observeSizes = () => {
			resizeObserver.observe(activeCard as HTMLElement);
			if (activeCard?.firstElementChild instanceof HTMLElement) {
				resizeObserver.observe(activeCard.firstElementChild);
			}
		};
		observeSizes();

		const mutationObserver =
			typeof MutationObserver === 'undefined'
				? null
				: new MutationObserver(() => {
						observeSizes();
						void tick().then(updateScrollCue);
					});
		mutationObserver?.observe(activeCard, {
			attributes: true,
			childList: true,
			subtree: true,
			attributeFilter: ['open', 'hidden', 'class', 'style']
		});

		return () => {
			resizeObserver.disconnect();
			mutationObserver?.disconnect();
		};
	});
</script>

<section class:slow-motion={slowMotion} class="challenge-session" aria-label={title}>
	<header class="session-header">
		<a
			class="session-exit"
			href={resolve(exitHref as '/')}
			aria-label={exitLabel}
			title={exitLabel}
		>
			<X size={23} strokeWidth={2.1} aria-hidden="true" />
		</a>
		<ChallengeSoundToggle />
		<ChallengeProgress {steps} {activeIndex} {value} {complete} />
		<div class="session-context">
			<span>{eyebrow}</span>
			<h1>{title}</h1>
		</div>
	</header>

	<div class="session-stage">
		<div class="stack-card preview two" aria-hidden="true"></div>
		<div class="stack-card preview one" aria-hidden="true"></div>
		<article class="stack-card active" bind:this={activeCard} onscroll={updateScrollCue}>
			{@render children()}
		</article>
		{#if showScrollCue}
			<div class="scroll-cue" aria-hidden="true">↓ Scroll for more</div>
		{/if}
	</div>

	<footer class:empty={!actionsVisible} class="session-actions">
		{#if actionsVisible && actions}{@render actions()}{/if}
	</footer>
</section>

<style>
	.challenge-session {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		height: min(
			52rem,
			calc(
				var(--app-viewport-height, 100dvh) - var(--qc-topbar-height, 4rem) - clamp(1rem, 3vw, 2rem)
			)
		);
		min-height: min(
			38rem,
			calc(
				var(--app-viewport-height, 100dvh) - var(--qc-topbar-height, 4rem) - clamp(1rem, 3vw, 2rem)
			)
		);
		max-height: 52rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface) 78%, transparent);
		color: var(--qc-ui-text);
		--challenge-motion-duration: 560ms;
	}

	.challenge-session.slow-motion {
		--challenge-motion-duration: 2240ms;
	}

	.session-header {
		display: grid;
		grid-template-columns: auto auto minmax(16rem, 1fr) minmax(10rem, 0.55fr);
		gap: 0.8rem 1rem;
		align-items: center;
		padding: max(0.75rem, env(safe-area-inset-top)) 1rem 0.75rem;
		border-bottom: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.session-exit {
		display: inline-grid;
		width: 2.75rem;
		height: 2.75rem;
		place-items: center;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
	}

	.session-exit:focus-visible {
		outline: 3px solid var(--qc-ui-accent-text);
		outline-offset: 2px;
	}

	.session-header :global(.sound-control button) {
		border-radius: 0;
		box-shadow: none;
	}

	.session-context {
		display: grid;
		gap: 0.18rem;
		min-width: 0;
		text-align: right;
	}

	.session-context span,
	.session-context h1 {
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.session-context span {
		color: var(--qc-ui-text-muted);
		font-size: 0.74rem;
		font-weight: 550;
	}

	.session-context h1 {
		font-size: 0.86rem;
		font-weight: 650;
	}

	.session-stage {
		position: relative;
		display: grid;
		min-height: 0;
		place-items: center;
		padding: clamp(0.8rem, 2.5vw, 1.5rem);
		overflow: hidden;
	}

	.stack-card {
		position: absolute;
		width: min(calc(100% - clamp(1.6rem, 5vw, 3rem)), 42rem);
		height: min(calc(100% - clamp(1.6rem, 5vw, 3rem)), 39rem);
		border: 1px solid var(--qc-ui-border-strong);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
	}

	.stack-card.preview {
		border-color: var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface-raised) 58%, transparent);
		opacity: 0.45;
		pointer-events: none;
	}

	.stack-card.preview.one {
		z-index: 1;
		transform: translate(0.65rem, 0.65rem);
	}

	.stack-card.preview.two {
		z-index: 0;
		transform: translate(1.3rem, 1.3rem);
	}

	.stack-card.active {
		position: relative;
		z-index: 2;
		display: block;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior: contain;
		box-shadow: 0 1.35rem 2.8rem color-mix(in srgb, var(--qc-ui-text) 14%, transparent);
		-webkit-overflow-scrolling: touch;
	}

	.stack-card.active > :global(*) {
		max-width: 100%;
		min-width: 0;
	}

	.scroll-cue {
		position: absolute;
		z-index: 4;
		right: 50%;
		bottom: clamp(0.8rem, 2.5vw, 1.5rem);
		padding: 0.35rem 0.55rem;
		transform: translateX(50%);
		border: 1px solid var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text-secondary);
		font-size: 0.72rem;
		font-weight: 650;
		line-height: 1.2;
		max-width: calc(100% - 1rem);
		white-space: nowrap;
		pointer-events: none;
	}

	.session-actions {
		display: flex;
		min-height: 4.85rem;
		align-items: center;
		justify-content: center;
		gap: 0.65rem;
		padding: 0.7rem 1rem max(0.7rem, env(safe-area-inset-bottom));
		border-top: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.session-actions.empty {
		min-height: 0;
		padding: 0;
		border-top: 0;
	}

	.session-actions :global(.challenge-button) {
		min-height: 3.15rem;
		min-width: min(18rem, 44vw);
	}

	@media (max-width: 760px) {
		.challenge-session {
			max-height: none;
			border-right: 0;
			border-left: 0;
		}

		.session-header {
			grid-template-columns: auto auto minmax(0, 1fr);
			padding-right: 0.75rem;
			padding-left: 0.75rem;
		}

		.session-context {
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

		.session-stage {
			padding: 0.72rem 0.78rem;
		}

		.scroll-cue {
			bottom: 0.72rem;
		}

		.stack-card {
			width: calc(100% - 1.56rem);
			height: calc(100% - 1.44rem);
		}

		.session-actions {
			flex-wrap: wrap;
			padding-right: 0.75rem;
			padding-left: 0.75rem;
		}

		.session-actions :global(.challenge-button) {
			min-width: min(100%, 15rem);
			flex: 1 1 10rem;
		}

		.session-actions :global(.haptic-surface) {
			min-width: min(100%, 15rem);
			flex: 1 1 10rem;
		}
	}

	@media (max-width: 620px) {
		.session-stage {
			padding: 0.4rem;
		}

		.stack-card {
			width: calc(100% - 0.8rem);
			height: calc(100% - 0.8rem);
		}

		.stack-card.preview {
			display: none;
		}

		.scroll-cue {
			bottom: 0.4rem;
		}
	}

	@media (max-height: 520px) {
		.session-header {
			grid-template-columns: auto auto minmax(0, 1fr);
			gap: 0.45rem;
			padding-top: 0.35rem;
			padding-bottom: 0.35rem;
		}

		.session-context {
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

		.session-header :global(.challenge-progress) {
			gap: 0.2rem;
		}

		.session-header :global(.progress-copy span),
		.session-header :global(.challenge-progress ol) {
			display: none;
		}

		.session-stage {
			padding: 0.4rem max(0.5rem, env(safe-area-inset-right)) 0.4rem
				max(0.5rem, env(safe-area-inset-left));
		}

		.session-actions {
			min-height: 3.5rem;
			padding-top: 0.35rem;
			padding-right: max(0.5rem, env(safe-area-inset-right));
			padding-bottom: max(0.35rem, env(safe-area-inset-bottom));
			padding-left: max(0.5rem, env(safe-area-inset-left));
		}
	}

	@media (max-width: 360px) {
		.session-header {
			gap: 0.4rem;
			padding: 0.45rem 0.5rem;
		}

		.session-header :global(.challenge-progress) {
			gap: 0.25rem;
		}

		.session-header :global(.challenge-progress ol) {
			display: none;
		}

		.session-stage {
			padding: 0.25rem;
		}

		.stack-card {
			width: calc(100% - 0.5rem);
			height: calc(100% - 0.5rem);
		}

		.scroll-cue {
			right: 0.5rem;
			bottom: 0.5rem;
			max-width: 1.8rem;
			padding: 0.28rem 0.42rem;
			transform: none;
			overflow: hidden;
			font-size: 0;
		}

		.scroll-cue::first-letter {
			font-size: 0.78rem;
		}
	}

	@media (min-height: 521px) and (max-height: 720px) {
		.session-header {
			padding-top: 0.5rem;
			padding-bottom: 0.5rem;
		}

		.session-actions {
			min-height: 4rem;
			padding-top: 0.45rem;
			padding-bottom: max(0.45rem, env(safe-area-inset-bottom));
		}
	}
</style>
