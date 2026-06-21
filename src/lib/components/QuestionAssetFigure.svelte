<script lang="ts">
	type QuestionAsset = {
		publicPath: string;
		altText: string;
		sourceLabel: string;
		paperWidthPx?: number | null;
		paperHeightPx?: number | null;
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

	function openDialog() {
		dialog?.showModal();
	}

	function closeDialog() {
		dialog?.close();
	}

	function closeOnBackdrop(event: MouseEvent) {
		if (event.target === dialog) closeDialog();
	}
</script>

<figure style={paperStyle}>
	<button
		class="asset-open-button"
		type="button"
		onclick={openDialog}
		aria-label={`Open ${asset.sourceLabel} full screen`}
	>
		<img class="asset-thumbnail" src={asset.publicPath} alt={asset.altText} {loading} />
	</button>
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
		<img class="asset-dialog-image" src={asset.publicPath} alt={asset.altText} loading="eager" />
	</div>
</dialog>
