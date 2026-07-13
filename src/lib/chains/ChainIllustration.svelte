<script lang="ts">
	import type { ChainIllustration } from './chainIllustration';

	let {
		illustration,
		label = 'Visual method',
		eager = false
	}: {
		illustration: ChainIllustration;
		label?: string;
		eager?: boolean;
	} = $props();
</script>

<figure class="chain-illustration" data-analytics-label={`${label}: ${illustration.caption}`}>
	<div class="chain-illustration-frame">
		<img
			src={illustration.src}
			alt={illustration.alt}
			width={illustration.width}
			height={illustration.height}
			loading={eager ? 'eager' : 'lazy'}
			decoding="async"
		/>
	</div>
	{#if illustration.caption}
		<figcaption>
			<span>{label}</span>
			<p>{illustration.caption}</p>
		</figcaption>
	{/if}
</figure>

<style>
	.chain-illustration {
		width: min(100%, 980px);
		margin: 0;
		border: 1px solid rgba(70, 201, 255, 0.62);
		background: #020b17;
		color: #edf9ff;
		box-shadow:
			0 0 0 1px rgba(69, 213, 255, 0.08),
			0 18px 46px -28px rgba(5, 92, 159, 0.68);
		overflow: hidden;
	}

	.chain-illustration-frame {
		aspect-ratio: 16 / 9;
		background:
			radial-gradient(circle at 50% 30%, rgba(17, 93, 139, 0.2), transparent 58%), #020b17;
		overflow: hidden;
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	figcaption {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.65rem 0.9rem;
		align-items: baseline;
		padding: 0.72rem 0.9rem 0.78rem;
		border-top: 1px solid rgba(85, 208, 255, 0.3);
		background: linear-gradient(90deg, rgba(4, 29, 50, 0.96), rgba(3, 15, 29, 0.96));
	}

	figcaption span {
		color: #6fe5ff;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	figcaption p {
		margin: 0;
		color: #dcecf6;
		font-size: 0.88rem;
		line-height: 1.35;
	}

	@media (max-width: 620px) {
		figcaption {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.25rem;
			padding-inline: 0.72rem;
		}

		figcaption p {
			font-size: 0.8rem;
		}
	}
</style>
