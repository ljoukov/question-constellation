<script lang="ts">
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import CalibratedPaperImage from '$lib/components/CalibratedPaperImage.svelte';
	import type { PaperMeasurement } from '$lib/experiments/questions/types';
	import { diagnoseResourceLoadFailure, type RequestFailure } from '$lib/requestFailure';
	type QuestionAsset = {
		publicPath: string;
		altText: string;
		sourceLabel: string;
		paperWidthPx?: number | null;
		paperHeightPx?: number | null;
		paperMeasurement?: PaperMeasurement | null;
	};

	let {
		asset,
		loading = 'lazy'
	}: {
		asset: QuestionAsset;
		loading?: 'eager' | 'lazy';
	} = $props();

	const paperStyle = $derived(
		asset.paperWidthPx && asset.paperHeightPx
			? `--paper-image-width: ${asset.paperWidthPx}px; --paper-image-height: ${asset.paperHeightPx}px;`
			: undefined
	);

	let dialog: HTMLDialogElement | undefined;
	let imageFailure = $state<RequestFailure | null>(null);
	let retryVersion = $state(0);
	let diagnosing = $state(false);
	const imageSrc = $derived(
		retryVersion === 0
			? asset.publicPath
			: `${asset.publicPath}${asset.publicPath.includes('?') ? '&' : '?'}qc-retry=${retryVersion}`
	);

	function openDialog() {
		dialog?.showModal();
	}

	function closeDialog() {
		dialog?.close();
	}

	function closeOnBackdrop(event: MouseEvent) {
		if (event.target === dialog) closeDialog();
	}

	async function handleImageFailure() {
		if (diagnosing) return;
		diagnosing = true;
		closeDialog();
		imageFailure = await diagnoseResourceLoadFailure(asset.publicPath, {
			action: 'load this question image',
			serverLabel: 'The image service'
		});
		diagnosing = false;
	}

	function retryImage() {
		imageFailure = null;
		retryVersion += 1;
	}
</script>

<figure style={paperStyle}>
	{#if imageFailure}
		<RequestFailureNotice
			failure={imageFailure}
			onRetry={retryImage}
			retrying={diagnosing}
			retryLabel="Retry image"
			compact
		/>
	{:else if asset.paperMeasurement}
		<CalibratedPaperImage
			src={imageSrc}
			alt={asset.altText}
			measurement={asset.paperMeasurement}
			{loading}
			onerror={handleImageFailure}
		/>
		<button
			class="asset-open-calibrated"
			type="button"
			onclick={openDialog}
			aria-label={`Open ${asset.sourceLabel} full screen`}
		>
			Open image full screen
		</button>
	{:else}
		<button
			class="asset-open-button"
			type="button"
			onclick={openDialog}
			aria-label={`Open ${asset.sourceLabel} full screen`}
		>
			<img
				class="asset-thumbnail"
				src={imageSrc}
				alt={asset.altText}
				{loading}
				onerror={handleImageFailure}
			/>
		</button>
	{/if}
	<figcaption>{asset.sourceLabel}</figcaption>
</figure>

<dialog
	bind:this={dialog}
	class="asset-dialog"
	aria-label={asset.sourceLabel}
	onclick={closeOnBackdrop}
>
	<div class="asset-dialog-frame">
		<button class="asset-dialog-close" type="button" onclick={closeDialog} aria-label="Close image">
			x
		</button>
		<img
			class="asset-dialog-image"
			src={imageSrc}
			alt={asset.altText}
			loading="eager"
			onerror={handleImageFailure}
		/>
	</div>
</dialog>

<style>
	.asset-open-calibrated {
		display: block;
		width: 100%;
		padding: 0.55rem 0.8rem;
		border-top: 1px solid #d9e0ea;
		background: #ffffff;
		color: #334155;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 650;
		cursor: zoom-in;
	}
</style>
