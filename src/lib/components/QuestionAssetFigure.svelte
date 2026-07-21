<script lang="ts">
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import QuestionImageViewer from '$lib/components/QuestionImageViewer.svelte';
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

	let imageFailure = $state<RequestFailure | null>(null);
	let retryVersion = $state(0);
	let diagnosing = $state(false);
	const imageSrc = $derived(
		retryVersion === 0
			? asset.publicPath
			: `${asset.publicPath}${asset.publicPath.includes('?') ? '&' : '?'}qc-retry=${retryVersion}`
	);

	async function handleImageFailure() {
		if (diagnosing) return;
		diagnosing = true;
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
	{:else}
		<QuestionImageViewer
			src={imageSrc}
			alt={asset.altText}
			label={asset.sourceLabel}
			{loading}
			measurement={asset.paperMeasurement}
			intrinsicWidth={asset.paperWidthPx}
			intrinsicHeight={asset.paperHeightPx}
			onerror={handleImageFailure}
		/>
	{/if}
	<figcaption>{asset.sourceLabel}</figcaption>
</figure>
