<script lang="ts">
	import { resolve } from '$app/paths';
	import { Clock3, Pause, X } from '@lucide/svelte';
	import { tick } from 'svelte';
	import type { Snippet } from 'svelte';
	import ChallengeProgress from './ChallengeProgress.svelte';
	import ChallengeCurriculumControl from './ChallengeCurriculumControl.svelte';
	import ChallengeSoundToggle from './ChallengeSoundToggle.svelte';

	let {
		exitHref,
		exitLabel = 'Leave challenge',
		eyebrow,
		title,
		steps,
		activeIndex,
		value,
		reviewIndex = null,
		onStepSelect,
		elapsedSeconds = 0,
		complete = false,
		slowMotion = false,
		actionsVisible = true,
		curriculum,
		onPauseChange,
		children,
		actions
	}: {
		exitHref: string;
		exitLabel?: string;
		eyebrow: string;
		title: string;
		steps: Array<{ short: string; label: string }>;
		activeIndex: number;
		value: number;
		reviewIndex?: number | null;
		onStepSelect?: (index: number) => void;
		elapsedSeconds?: number;
		complete?: boolean;
		slowMotion?: boolean;
		actionsVisible?: boolean;
		curriculum?: {
			topicLabel: string;
			officialUrl: string;
			contextUrl: string;
		};
		onPauseChange?: (paused: boolean) => void;
		children: Snippet;
		actions?: Snippet;
	} = $props();

	const safeElapsedSeconds = $derived(Math.max(0, Math.floor(elapsedSeconds)));
	const timerText = $derived(
		`${Math.floor(safeElapsedSeconds / 60)}:${String(safeElapsedSeconds % 60).padStart(2, '0')}`
	);
	const subjectName = $derived(eyebrow.replace(/^GCSE\s+/i, '').trim() || 'subject');
	const exitControlLabel = $derived(
		exitLabel === 'Leave challenge' ? exitLabel : 'Leave challenge'
	);
	let exitDialogOpen = $state(false);
	let exitButton = $state<HTMLButtonElement | null>(null);
	let exitDialog = $state<HTMLDivElement | null>(null);
	let stayButton = $state<HTMLButtonElement | null>(null);

	async function openExitDialog() {
		if (exitDialogOpen) return;
		exitDialogOpen = true;
		onPauseChange?.(true);
		await tick();
		stayButton?.focus();
	}

	async function closeExitDialog() {
		exitDialogOpen = false;
		onPauseChange?.(false);
		await tick();
		exitButton?.focus();
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (exitDialogOpen && event.key === 'Escape') {
			event.preventDefault();
			void closeExitDialog();
		}
	}

	function handleDialogKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab' || !exitDialog) return;
		const focusable = Array.from(
			exitDialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
		);
		const first = focusable[0];
		const last = focusable.at(-1);
		if (!first || !last) return;

		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<section
	class:slow-motion={slowMotion}
	class:has-actions={!complete && actionsVisible && Boolean(actions)}
	class="challenge-session"
	aria-label={title}
	inert={exitDialogOpen}
>
	<header class="session-header">
		<div class="session-left">
			<div class="session-audio"><ChallengeSoundToggle /></div>
		</div>

		<div class="session-context">
			<span>{eyebrow}</span>
			<h1>{title}</h1>
		</div>

		<div class="session-right">
			{#if complete}
				<a
					class="session-exit"
					href={resolve(exitHref as '/')}
					aria-label={`Back to ${subjectName} challenges`}
					title={`Back to ${subjectName} challenges`}
					data-analytics-label={`Challenge complete: back to ${subjectName} challenges`}
				>
					<X size={22} strokeWidth={2.1} aria-hidden="true" />
				</a>
			{:else}
				<button
					class="session-exit"
					type="button"
					aria-label={exitControlLabel}
					aria-haspopup="dialog"
					aria-controls={exitDialogOpen ? 'challenge-exit-dialog' : undefined}
					title={exitControlLabel}
					data-analytics-label={exitControlLabel}
					bind:this={exitButton}
					onclick={openExitDialog}
				>
					<X size={22} strokeWidth={2.1} aria-hidden="true" />
				</button>
			{/if}
		</div>

		<div class="session-progress-row">
			<ChallengeProgress {steps} {activeIndex} {value} {complete} {reviewIndex} {onStepSelect} />
		</div>
	</header>

	<div class="session-stage">
		<article class="stage-content">{@render children()}</article>
	</div>

	{#if !complete}
		<footer class="session-actions">
			<div class="session-footer-curriculum">
				{#if curriculum}
					<ChallengeCurriculumControl
						topicLabel={curriculum.topicLabel}
						officialUrl={curriculum.officialUrl}
						contextUrl={curriculum.contextUrl}
						onOpenChange={onPauseChange}
					/>
				{/if}
			</div>
			{#if actionsVisible && actions}
				<div class="session-action-slot">{@render actions()}</div>
			{:else}
				<span class="session-action-slot session-action-slot-empty" aria-hidden="true"></span>
			{/if}
			<div
				class="session-timer-status"
				role="timer"
				aria-label={`Time on this step ${timerText}`}
				title={`Time on this step ${timerText}`}
			>
				<Clock3 size={15} strokeWidth={2} aria-hidden="true" />
				<span>Step time</span>
				<strong>{timerText}</strong>
			</div>
		</footer>
	{/if}
</section>

{#if !complete && exitDialogOpen}
	<div class="exit-dialog-backdrop">
		<div
			class="exit-dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="challenge-exit-title"
			aria-describedby="challenge-exit-description"
			id="challenge-exit-dialog"
			tabindex="-1"
			bind:this={exitDialog}
			onkeydown={handleDialogKeydown}
		>
			<p class="pause-status">
				<Pause size={15} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />
				<span>Timer paused</span>
			</p>
			<h2 id="challenge-exit-title">Leave this challenge?</h2>
			<p id="challenge-exit-description">You’ll return to {subjectName} challenges.</p>
			<div>
				<button type="button" bind:this={stayButton} onclick={() => void closeExitDialog()}>
					Stay
				</button>
				<a href={resolve(exitHref as '/')}>Leave</a>
			</div>
		</div>
	</div>
{/if}

<style>
	.challenge-session {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		width: min(100%, 66rem);
		min-height: calc(
			var(--app-viewport-height, 100dvh) - max(0.25rem, env(safe-area-inset-top)) -
				max(0.25rem, env(safe-area-inset-bottom))
		);
		margin: 0 auto;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		--challenge-motion-duration: 560ms;
	}

	.challenge-session.slow-motion {
		--challenge-motion-duration: 2240ms;
	}

	.session-header {
		--session-control-size: 3rem;
		display: grid;
		grid-template-columns: var(--session-control-size) minmax(0, 1fr) var(--session-control-size);
		grid-template-areas:
			'left context right'
			'progress progress progress';
		gap: 0.55rem 0.8rem;
		align-items: center;
		padding: max(0.62rem, env(safe-area-inset-top))
			max(clamp(0.75rem, 2vw, 1.15rem), env(safe-area-inset-right)) 0.55rem
			max(clamp(0.75rem, 2vw, 1.15rem), env(safe-area-inset-left));
		border-bottom: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.session-left,
	.session-right {
		display: flex;
		min-width: var(--session-control-size);
		align-items: center;
	}

	.session-left {
		grid-area: left;
		justify-content: flex-start;
	}

	.session-right {
		grid-area: right;
		justify-content: flex-end;
	}

	.session-audio {
		display: flex;
		align-items: center;
	}

	.session-audio :global(.sound-control button) {
		width: var(--session-control-size);
		height: var(--session-control-size);
		min-width: var(--session-control-size);
		min-height: var(--session-control-size);
		border-color: var(--qc-ui-border-control);
		border-radius: 999px;
		box-shadow: none;
	}

	.session-audio :global(.sound-control button.enabled) {
		border-color: var(--qc-ui-accent-text);
	}

	.session-exit {
		display: inline-grid;
		width: var(--session-control-size);
		height: var(--session-control-size);
		min-width: 2.75rem;
		min-height: 2.75rem;
		padding: 0;
		place-items: center;
		border: 1px solid var(--qc-ui-border-control);
		border-radius: 999px;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		cursor: pointer;
	}

	.session-exit:hover {
		border-color: var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-muted);
	}

	.session-exit:focus-visible {
		outline: 3px solid var(--qc-ui-focus-ring);
		outline-offset: 2px;
	}

	.session-context {
		grid-area: context;
		display: grid;
		gap: 0.1rem;
		justify-items: center;
		min-width: 0;
		text-align: center;
	}

	.session-context span,
	.session-context h1 {
		margin: 0;
	}

	.session-context span {
		color: var(--qc-ui-accent-text);
		font-size: 0.72rem;
		font-weight: 720;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	.session-context h1 {
		max-width: 54ch;
		font-size: clamp(1rem, 1.55vw, 1.2rem);
		font-weight: 650;
		line-height: 1.18;
		letter-spacing: -0.018em;
		overflow-wrap: anywhere;
	}

	.session-progress-row {
		grid-area: progress;
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 0;
	}

	.session-progress-row :global(.challenge-progress) {
		width: min(100%, 46rem);
		justify-self: center;
	}

	.session-timer-status {
		position: relative;
		display: inline-flex;
		min-width: 6.7rem;
		min-height: 2.75rem;
		box-sizing: border-box;
		gap: 0.38rem;
		align-items: center;
		justify-content: center;
		padding: 0.35rem 0.55rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-muted);
		font-size: 0.72rem;
		font-weight: 650;
		line-height: 1;
	}

	.session-timer-status strong {
		color: var(--qc-ui-text);
		font-size: 0.95rem;
		font-weight: 780;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.015em;
	}

	.session-stage {
		min-height: 0;
		padding: clamp(0.75rem, 2vw, 1.25rem);
		background: color-mix(in srgb, var(--qc-ui-surface) 84%, transparent);
	}

	.stage-content {
		display: block;
		width: min(100%, 54rem);
		margin: 0 auto;
	}

	.stage-content > :global(*) {
		max-width: 100%;
		min-width: 0;
	}

	.session-actions {
		display: grid;
		grid-template-columns: minmax(6.7rem, 1fr) minmax(0, 22rem) minmax(6.7rem, 1fr);
		box-sizing: border-box;
		min-height: calc(4rem + env(safe-area-inset-bottom));
		align-items: center;
		gap: clamp(0.5rem, 1.5vw, 0.9rem);
		padding: 0.42rem max(clamp(0.75rem, 2vw, 1.25rem), env(safe-area-inset-right))
			max(0.42rem, env(safe-area-inset-bottom))
			max(clamp(0.75rem, 2vw, 1.25rem), env(safe-area-inset-left));
		border-top: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.session-footer-curriculum {
		grid-column: 1;
		justify-self: start;
	}

	.session-footer-curriculum :global(.curriculum-trigger) {
		border-color: var(--qc-ui-border-control);
	}

	.session-action-slot {
		display: flex;
		grid-column: 2;
		width: 100%;
		min-height: 3.15rem;
		align-items: center;
		justify-content: center;
	}

	.session-action-slot-empty {
		pointer-events: none;
	}

	.session-actions .session-timer-status {
		grid-column: 3;
		justify-self: end;
	}

	.session-actions :global(.haptic-surface) {
		width: 100%;
	}

	.session-actions :global(.challenge-button) {
		width: 100%;
		min-height: 3.15rem;
	}

	.exit-dialog-backdrop {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		place-items: center;
		padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
			max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
		background: color-mix(in srgb, var(--qc-ui-text) 34%, transparent);
		backdrop-filter: blur(6px);
	}

	.exit-dialog {
		display: grid;
		gap: 0.7rem;
		width: min(100%, 28rem);
		box-sizing: border-box;
		padding: clamp(1.2rem, 4vw, 1.75rem);
		border: 1px solid var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-raised);
		box-shadow: 0 1.5rem 4rem var(--qc-ui-shadow);
		color: var(--qc-ui-text);
	}

	.exit-dialog > p,
	.exit-dialog h2 {
		margin: 0;
	}

	.exit-dialog > p.pause-status {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		color: var(--qc-ui-accent-text);
		font-size: 0.76rem;
		font-weight: 700;
	}

	.exit-dialog h2 {
		font-size: clamp(1.45rem, 4vw, 1.9rem);
		line-height: 1.1;
	}

	.exit-dialog > p:nth-of-type(2) {
		color: var(--qc-ui-text-secondary);
		line-height: 1.5;
	}

	.exit-dialog > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
		margin-top: 0.35rem;
	}

	.exit-dialog button,
	.exit-dialog a {
		display: inline-flex;
		min-height: 3rem;
		align-items: center;
		justify-content: center;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
		font-weight: 680;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
	}

	.exit-dialog button {
		border-color: var(--qc-ui-accent);
		background: var(--qc-ui-accent);
		color: var(--qc-ui-on-accent);
	}

	.exit-dialog a {
		color: var(--qc-ui-danger);
	}

	.exit-dialog button:focus-visible,
	.exit-dialog a:focus-visible {
		outline: 3px solid var(--qc-ui-focus-ring);
		outline-offset: 2px;
	}

	@media (max-width: 760px) {
		.challenge-session {
			border-right: 0;
			border-left: 0;
		}

		.session-header {
			gap: 0.48rem 0.65rem;
			padding-right: max(0.65rem, env(safe-area-inset-right));
			padding-left: max(0.65rem, env(safe-area-inset-left));
		}

		.session-stage {
			padding: 0.7rem 0.65rem;
		}
	}

	@media (max-width: 620px) {
		.session-actions {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 0.38rem 0.65rem;
		}

		.session-footer-curriculum {
			grid-column: 1;
			grid-row: 1;
		}

		.session-action-slot {
			grid-column: 1 / -1;
			grid-row: 1;
		}

		.session-actions .session-timer-status {
			grid-column: 2;
			grid-row: 1;
		}

		.challenge-session.has-actions .session-actions {
			padding-top: 0.55rem;
		}

		.challenge-session.has-actions .session-action-slot {
			grid-column: 1 / -1;
			grid-row: 1;
		}

		.challenge-session.has-actions .session-footer-curriculum {
			grid-column: 1;
			grid-row: 2;
		}

		.challenge-session.has-actions .session-actions .session-timer-status {
			grid-column: 2;
			grid-row: 2;
		}

		.challenge-session:not(.has-actions) .session-action-slot-empty {
			display: none;
		}

		.session-timer-status {
			min-width: 3.6rem;
			min-height: 2.35rem;
			gap: 0;
			padding-right: 0.38rem;
			padding-left: 0.38rem;
			border-color: transparent;
			background: transparent;
		}

		.session-footer-curriculum :global(.curriculum-trigger) {
			height: 2.35rem;
			border-color: transparent;
			background: transparent;
			color: var(--qc-ui-text-muted);
		}

		.session-footer-curriculum :global(.curriculum-trigger-icon) {
			width: 2.35rem;
			background: transparent;
		}

		.session-timer-status > span,
		.session-timer-status > :global(svg) {
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

		.session-context span {
			font-size: 0.66rem;
		}

		.session-context h1 {
			font-size: 0.96rem;
		}
	}

	@media (max-width: 480px) {
		.exit-dialog > div {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 390px) {
		.session-header {
			gap: 0.42rem 0.45rem;
			padding-right: max(0.5rem, env(safe-area-inset-right));
			padding-left: max(0.5rem, env(safe-area-inset-left));
		}

		.session-context h1 {
			font-size: 0.88rem;
		}

		.session-timer-status {
			min-width: 3.25rem;
		}

		.session-timer-status strong {
			font-size: 0.85rem;
		}
	}

	@media (max-height: 620px) {
		.session-header {
			gap: 0.38rem 0.65rem;
			padding-top: max(0.4rem, env(safe-area-inset-top));
			padding-bottom: 0.4rem;
		}

		.session-stage {
			padding-top: 0.6rem;
			padding-bottom: 0.6rem;
		}

		.session-actions {
			min-height: calc(3.75rem + env(safe-area-inset-bottom));
			padding-top: 0.3rem;
			padding-bottom: max(0.3rem, env(safe-area-inset-bottom));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.challenge-session {
			--challenge-motion-duration: 0ms;
		}
	}
</style>
