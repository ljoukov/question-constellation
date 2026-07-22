<script lang="ts">
	import { ExternalLink, ShieldCheck, X } from '@lucide/svelte';

	let {
		topicLabel,
		officialUrl,
		contextUrl,
		onOpenChange
	}: {
		topicLabel: string;
		officialUrl: string;
		contextUrl: string;
		onOpenChange?: (open: boolean) => void;
	} = $props();

	const componentId = $props.id();
	const dialogId = `${componentId}-dialog`;
	const titleId = `${componentId}-title`;
	const descriptionId = `${componentId}-description`;

	let dialog = $state<HTMLDialogElement | null>(null);
	let trigger = $state<HTMLButtonElement | null>(null);
	let closeButton = $state<HTMLButtonElement | null>(null);
	let open = $state(false);

	function openDialog() {
		if (!dialog || dialog.open) return;
		open = true;
		onOpenChange?.(true);
		dialog.showModal();
		queueMicrotask(() => closeButton?.focus());
	}

	function closeDialog() {
		dialog?.close();
	}

	function handleClose() {
		open = false;
		onOpenChange?.(false);
		trigger?.focus();
	}

	function closeOnBackdrop(event: MouseEvent) {
		if (event.target === dialog) closeDialog();
	}
</script>

<button
	type="button"
	class="curriculum-trigger"
	aria-label="Open curriculum information"
	aria-haspopup="dialog"
	aria-controls={dialogId}
	aria-expanded={open}
	title="Curriculum"
	data-analytics-label="Challenge: open curriculum information"
	bind:this={trigger}
	onclick={openDialog}
>
	<span class="curriculum-trigger-icon" aria-hidden="true">
		<ShieldCheck size={21} strokeWidth={2.2} />
	</span>
	<span class="curriculum-trigger-label">Curriculum</span>
</button>

<dialog
	class="curriculum-dialog"
	id={dialogId}
	aria-labelledby={titleId}
	aria-describedby={descriptionId}
	bind:this={dialog}
	onclose={handleClose}
	onclick={closeOnBackdrop}
>
	<div class="curriculum-dialog-card">
		<header>
			<span class="curriculum-dialog-icon" aria-hidden="true">
				<ShieldCheck size={24} strokeWidth={2.2} />
			</span>
			<div>
				<p>Official curriculum</p>
				<h2 id={titleId}>{topicLabel}</h2>
			</div>
			<button
				type="button"
				class="curriculum-dialog-close"
				aria-label="Close curriculum information"
				bind:this={closeButton}
				onclick={closeDialog}
			>
				<X size={21} strokeWidth={2.2} aria-hidden="true" />
			</button>
		</header>

		<div class="curriculum-dialog-content">
			<p id={descriptionId}>
				This challenge practises knowledge and exam skills from the official GCSE science
				curriculum. Use these sources to see the exact subject content and its wider Key Stage 4
				context.
			</p>

			<div class="curriculum-links">
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a href={officialUrl} target="_blank" rel="noreferrer">
					<span>
						<small>AQA specification</small>
						<strong>{topicLabel}</strong>
					</span>
					<ExternalLink size={17} strokeWidth={2.1} aria-hidden="true" />
				</a>
				<a href={contextUrl} target="_blank" rel="noreferrer">
					<span>
						<small>GOV.UK</small>
						<strong>Key Stage 4 science programme</strong>
					</span>
					<ExternalLink size={17} strokeWidth={2.1} aria-hidden="true" />
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</div>
		</div>
	</div>
</dialog>

<style>
	.curriculum-trigger {
		display: inline-flex;
		min-width: 0;
		height: 2.75rem;
		box-sizing: border-box;
		align-items: center;
		justify-content: flex-start;
		padding: 0;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
		font-size: 0.78rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
		transition:
			border-color 150ms ease,
			background 150ms ease,
			color 150ms ease,
			transform 150ms ease;
	}

	.curriculum-trigger-icon {
		display: grid;
		width: 2.75rem;
		height: 100%;
		flex: 0 0 auto;
		place-items: center;
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
		transition:
			background 150ms ease,
			color 150ms ease;
	}

	.curriculum-trigger-label {
		padding: 0 0.75rem;
		white-space: nowrap;
	}

	.curriculum-trigger:hover {
		border-color: var(--qc-ui-accent-strong);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-accent-text);
	}

	.curriculum-trigger:hover .curriculum-trigger-icon {
		background: var(--qc-ui-accent);
		color: var(--qc-ui-on-accent);
	}

	.curriculum-trigger:active {
		transform: translateY(1px);
	}

	.curriculum-trigger:focus-visible,
	.curriculum-dialog-close:focus-visible,
	.curriculum-links a:focus-visible {
		outline: 3px solid var(--qc-ui-accent-text);
		outline-offset: 2px;
	}

	.curriculum-dialog {
		width: min(calc(100% - 1.25rem), 34rem);
		max-width: none;
		max-height: min(90dvh, 42rem);
		box-sizing: border-box;
		padding: 0;
		border: 1px solid var(--qc-ui-border-strong);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		box-shadow: 0 1.5rem 4rem color-mix(in srgb, #071426 32%, transparent);
	}

	.curriculum-dialog::backdrop {
		background: color-mix(in srgb, #071426 58%, transparent);
		backdrop-filter: blur(3px);
	}

	.curriculum-dialog-card {
		display: grid;
		max-height: inherit;
		overflow: auto;
	}

	header {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.8rem;
		align-items: start;
		padding: 1rem;
		border-bottom: 1px solid var(--qc-ui-border-subtle);
	}

	header > div {
		display: grid;
		gap: 0.22rem;
		min-width: 0;
	}

	header p,
	header h2,
	.curriculum-dialog-content > p {
		margin: 0;
	}

	header p {
		color: var(--qc-ui-accent-text);
		font-size: 0.72rem;
		font-weight: 760;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	header h2 {
		font-size: 1.2rem;
		font-weight: 680;
		line-height: 1.25;
		text-wrap: balance;
	}

	.curriculum-dialog-icon,
	.curriculum-dialog-close {
		display: grid;
		width: 2.75rem;
		height: 2.75rem;
		place-items: center;
	}

	.curriculum-dialog-icon {
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.curriculum-dialog-close {
		padding: 0;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text-muted);
		cursor: pointer;
		transition:
			border-color 150ms ease,
			background 150ms ease,
			color 150ms ease;
	}

	.curriculum-dialog-close:hover {
		border-color: var(--qc-ui-accent-strong);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-accent-text);
	}

	.curriculum-dialog-content {
		display: grid;
		gap: 1rem;
		padding: 1rem;
	}

	.curriculum-dialog-content > p {
		color: var(--qc-ui-text-secondary);
		font-size: 0.92rem;
		line-height: 1.55;
	}

	.curriculum-links {
		display: grid;
		gap: 0.6rem;
	}

	.curriculum-links a {
		display: flex;
		min-height: 3.5rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text);
		text-decoration: none;
		transition:
			border-color 150ms ease,
			background 150ms ease,
			color 150ms ease;
	}

	.curriculum-links a:hover {
		border-color: var(--qc-ui-accent-strong);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.curriculum-links a > span {
		display: grid;
		gap: 0.18rem;
		min-width: 0;
	}

	.curriculum-links small {
		color: var(--qc-ui-text-muted);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.curriculum-links strong {
		font-size: 0.88rem;
		font-weight: 650;
		line-height: 1.35;
	}

	.curriculum-links :global(svg) {
		flex: 0 0 auto;
	}

	@media (max-width: 430px) {
		.curriculum-trigger {
			width: 3.25rem;
			height: 2.75rem;
			justify-content: center;
		}

		.curriculum-trigger-icon {
			width: 100%;
		}

		.curriculum-trigger-label {
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

		header {
			grid-template-columns: auto minmax(0, 1fr) auto;
			gap: 0.62rem;
			padding: 0.8rem;
		}

		header h2 {
			font-size: 1.05rem;
		}

		.curriculum-dialog-icon,
		.curriculum-dialog-close {
			width: 2.5rem;
			height: 2.5rem;
		}

		.curriculum-dialog-content {
			padding: 0.8rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.curriculum-trigger,
		.curriculum-trigger-icon,
		.curriculum-dialog-close,
		.curriculum-links a {
			transition: none;
		}
	}
</style>
