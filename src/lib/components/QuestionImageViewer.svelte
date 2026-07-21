<script lang="ts">
	import { X } from '@lucide/svelte';
	import CalibratedPaperImage from '$lib/components/CalibratedPaperImage.svelte';
	import type { PaperMeasurement } from '$lib/experiments/questions/types';

	let {
		src,
		alt,
		label,
		loading = 'lazy',
		measurement = null,
		intrinsicWidth,
		intrinsicHeight,
		onerror
	}: {
		src: string;
		alt: string;
		label: string;
		loading?: 'eager' | 'lazy';
		measurement?: PaperMeasurement | null;
		intrinsicWidth?: number | null;
		intrinsicHeight?: number | null;
		onerror?: () => void | Promise<void>;
	} = $props();

	const componentId = $props.id();
	const dialogId = `${componentId}-dialog`;
	const titleId = `${componentId}-title`;

	let dialog: HTMLDialogElement | undefined;
	let closeButton: HTMLButtonElement | undefined;
	let opener: HTMLAnchorElement | undefined;

	function prefersNativeImageViewer() {
		return window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
	}

	function openImage(event: MouseEvent) {
		if (prefersNativeImageViewer()) return;
		event.preventDefault();
		if (!dialog || dialog.open) return;
		opener = event.currentTarget as HTMLAnchorElement;
		dialog.showModal();
		queueMicrotask(() => closeButton?.focus());
	}

	function closeDialog() {
		dialog?.close();
	}

	function restoreFocus() {
		opener?.focus();
		opener = undefined;
	}

	function closeOnBackdrop(event: MouseEvent) {
		const target = event.target;
		if (target instanceof HTMLElement && target.dataset.lightboxBackdrop === 'true') {
			closeDialog();
		}
	}

	function closeOnEscape(event: KeyboardEvent) {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		closeDialog();
	}

	function handleImageFailure() {
		closeDialog();
		void onerror?.();
	}
</script>

{#if measurement}
	<CalibratedPaperImage
		{src}
		{alt}
		{measurement}
		{loading}
		imageHref={src}
		imageLabel={`${alt}. Open full-size image`}
		onImageOpen={openImage}
		onerror={handleImageFailure}
	/>
{:else}
	<a
		class="image-trigger"
		href={src}
		target="_blank"
		rel="noopener noreferrer"
		onclick={openImage}
		aria-label={`${alt}. Open full-size image`}
	>
		<img
			class="thumbnail"
			{src}
			{alt}
			{loading}
			width={intrinsicWidth ?? undefined}
			height={intrinsicHeight ?? undefined}
			onerror={handleImageFailure}
		/>
	</a>
{/if}

<dialog
	bind:this={dialog}
	id={dialogId}
	class="image-dialog"
	aria-labelledby={titleId}
	onclick={closeOnBackdrop}
	onkeydown={closeOnEscape}
	onclose={restoreFocus}
>
	<div class="dialog-shell" data-lightbox-backdrop="true">
		<header class="dialog-toolbar">
			<div>
				<h2 id={titleId}>{label}</h2>
				<p>Enlarged question image</p>
			</div>
			<button
				bind:this={closeButton}
				class="dialog-close"
				type="button"
				onclick={closeDialog}
				aria-label="Close enlarged image"
			>
				<X size={23} strokeWidth={2.15} aria-hidden="true" />
			</button>
		</header>
		<div class="dialog-viewport" data-lightbox-backdrop="true">
			<img
				class="dialog-image"
				{src}
				{alt}
				loading="eager"
				width={intrinsicWidth ?? undefined}
				height={intrinsicHeight ?? undefined}
				onerror={handleImageFailure}
			/>
		</div>
	</div>
</dialog>

<style>
	.image-trigger {
		display: block;
		width: 100%;
		background: #ffffff;
		cursor: zoom-in;
		text-decoration: none;
	}

	.thumbnail {
		display: block;
		width: 100%;
		height: auto;
		max-width: 100%;
		max-height: min(var(--paper-image-height, 32rem), 32rem);
		margin: 0 auto;
		object-fit: contain;
		background: #ffffff;
	}

	.image-trigger:hover .thumbnail {
		filter: contrast(1.025);
	}

	.image-trigger:focus-visible,
	.dialog-close:focus-visible {
		outline: 3px solid #38bdf8;
		outline-offset: 3px;
	}

	.image-dialog {
		width: 100vw;
		max-width: 100vw;
		height: 100vh;
		height: 100dvh;
		max-height: 100vh;
		max-height: 100dvh;
		margin: 0;
		padding: 0;
		border: 0;
		background: rgba(5, 12, 20, 0.94);
		overflow: hidden;
	}

	.image-dialog::backdrop {
		background: rgba(5, 12, 20, 0.94);
	}

	.dialog-shell {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 0;
		padding: max(0.65rem, env(safe-area-inset-top)) max(0.65rem, env(safe-area-inset-right))
			max(0.65rem, env(safe-area-inset-bottom)) max(0.65rem, env(safe-area-inset-left));
	}

	.dialog-toolbar {
		display: flex;
		flex: 0 0 auto;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
		width: min(100%, 96rem);
		min-height: 3.5rem;
		margin: 0 auto;
		padding: 0 0 0.65rem;
		color: #ffffff;
		text-align: left;
	}

	.dialog-toolbar h2,
	.dialog-toolbar p {
		margin: 0;
	}

	.dialog-toolbar h2 {
		color: #ffffff;
		font-size: clamp(1rem, 2vw, 1.25rem);
		line-height: 1.2;
	}

	.dialog-toolbar p {
		margin-top: 0.14rem;
		color: #cbd5e1;
		font-size: 0.78rem;
	}

	.dialog-close {
		display: inline-flex;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		width: 2.75rem;
		height: 2.75rem;
		padding: 0;
		border: 1px solid rgba(255, 255, 255, 0.5);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.98);
		color: #102033;
		cursor: pointer;
	}

	.dialog-viewport {
		display: block;
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		padding: 0 0 0.35rem;
		scrollbar-gutter: stable;
		-webkit-overflow-scrolling: touch;
	}

	.dialog-image {
		display: block;
		width: min(100%, 96rem);
		height: auto;
		max-width: none;
		margin: 0 auto;
		background: #ffffff;
		box-shadow: 0 12px 44px rgba(0, 0, 0, 0.42);
		object-fit: contain;
	}

	:global(:root[data-theme='dark'] .qc-exam-assets) .image-trigger,
	:global(:root[data-theme='dark'] .qc-exam-assets) .thumbnail,
	:global(:root[data-theme='dark'] .qc-exam-assets) .dialog-image {
		background: #050505;
	}

	:global(:root[data-theme='dark'] .qc-exam-assets) .thumbnail,
	:global(:root[data-theme='dark'] .qc-exam-assets) .dialog-image {
		filter: invert(1) hue-rotate(180deg) contrast(1.08) brightness(0.95);
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light']) .qc-exam-assets) .image-trigger,
		:global(:root:not([data-theme='light']) .qc-exam-assets) .thumbnail,
		:global(:root:not([data-theme='light']) .qc-exam-assets) .dialog-image {
			background: #050505;
		}

		:global(:root:not([data-theme='light']) .qc-exam-assets) .thumbnail,
		:global(:root:not([data-theme='light']) .qc-exam-assets) .dialog-image {
			filter: invert(1) hue-rotate(180deg) contrast(1.08) brightness(0.95);
		}
	}

	@media (max-width: 560px) {
		.dialog-shell {
			padding-right: max(0.35rem, env(safe-area-inset-right));
			padding-left: max(0.35rem, env(safe-area-inset-left));
		}

		.dialog-toolbar {
			padding-right: 0.2rem;
			padding-left: 0.2rem;
		}

		.dialog-toolbar p {
			display: none;
		}

		.image-dialog {
			display: none;
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.image-dialog[open] {
			animation: dialog-fade 130ms ease-out;
		}

		@keyframes dialog-fade {
			from {
				opacity: 0;
			}
			to {
				opacity: 1;
			}
		}
	}
</style>
