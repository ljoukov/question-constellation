<script lang="ts">
	import type { PaperMeasurement } from '$lib/experiments/questions/types';

	let {
		src,
		alt,
		measurement,
		loading = 'lazy',
		onerror
	}: {
		src: string;
		alt: string;
		measurement: PaperMeasurement;
		loading?: 'eager' | 'lazy';
		onerror?: () => void | Promise<void>;
	} = $props();

	let startPx = $state(0);
	let endPx = $state(0);
	let initializedWidth = $state(0);
	const measuredMillimetres = $derived(Math.abs(endPx - startPx) / measurement.pixelsPerMillimetre);

	$effect(() => {
		if (measurement.pixelWidth === initializedWidth) return;
		initializedWidth = measurement.pixelWidth;
		startPx = Math.round(measurement.pixelWidth * 0.2);
		endPx = Math.round(measurement.pixelWidth * 0.8);
	});

	function guidePosition(value: number) {
		return `${Math.max(0, Math.min(100, (value / measurement.pixelWidth) * 100))}%`;
	}
</script>

<div class="calibrated-paper-image">
	<div class="image-stage">
		<img {src} {alt} {loading} onerror={() => void onerror?.()} />
		<span
			class="measurement-guide start"
			style={`left: ${guidePosition(startPx)}`}
			aria-hidden="true"
		></span>
		<span class="measurement-guide end" style={`left: ${guidePosition(endPx)}`} aria-hidden="true"
		></span>
	</div>
	<div class="paper-ruler" aria-label="Digital paper ruler">
		<p>
			{measurement.instructions ??
				'Move the two guides to the points you want to measure. The result uses the original paper scale.'}
		</p>
		<div class="ruler-controls">
			<label>
				<span>Left guide</span>
				<input type="range" min="0" max={measurement.pixelWidth} step="1" bind:value={startPx} />
			</label>
			<label>
				<span>Right guide</span>
				<input type="range" min="0" max={measurement.pixelWidth} step="1" bind:value={endPx} />
			</label>
		</div>
		<output aria-live="polite">Measured distance: {measuredMillimetres.toFixed(1)} mm</output>
	</div>
</div>

<style>
	.calibrated-paper-image,
	.image-stage {
		width: 100%;
	}

	.image-stage {
		position: relative;
		background: #ffffff;
	}

	.image-stage img {
		display: block;
		width: 100%;
		height: auto;
		margin: 0 auto;
		background: #ffffff;
	}

	.measurement-guide {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		transform: translateX(-1px);
		background: #b42318;
		box-shadow: 0 0 0 1px rgb(255 255 255 / 82%);
		pointer-events: none;
	}

	.measurement-guide::before {
		position: absolute;
		top: 0.25rem;
		left: 50%;
		width: 0.58rem;
		height: 0.58rem;
		border: 2px solid #ffffff;
		border-radius: 999px;
		background: #b42318;
		content: '';
		transform: translateX(-50%);
	}

	.paper-ruler {
		display: grid;
		gap: 0.65rem;
		padding: 0.8rem;
		border-top: 1px solid #d9e0ea;
		background: #f8fafc;
		color: #172033;
		text-align: left;
	}

	.paper-ruler p,
	.paper-ruler output {
		margin: 0;
	}

	.paper-ruler p {
		font-size: 0.88rem;
		line-height: 1.4;
	}

	.ruler-controls {
		display: grid;
		gap: 0.55rem;
	}

	.ruler-controls label {
		display: grid;
		grid-template-columns: 5.5rem minmax(0, 1fr);
		gap: 0.65rem;
		align-items: center;
		font-size: 0.82rem;
		font-weight: 650;
	}

	.ruler-controls input {
		width: 100%;
		accent-color: #b42318;
	}

	.paper-ruler output {
		font-variant-numeric: tabular-nums;
		font-weight: 750;
	}
</style>
