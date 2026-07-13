<script lang="ts">
	import { Maximize2, X } from '@lucide/svelte';
	import type { ChainIllustration } from './chainIllustration';

	let {
		illustration,
		label = 'Visual method',
		eager = false,
		showCaption = true,
		expandable = false
	}: {
		illustration: ChainIllustration;
		label?: string;
		eager?: boolean;
		showCaption?: boolean;
		expandable?: boolean;
	} = $props();

	let expandedDialog: HTMLDialogElement | undefined = $state();

	function openExpandedView() {
		expandedDialog?.showModal();
	}

	function closeExpandedView() {
		expandedDialog?.close();
	}

	function closeFromBackdrop(event: MouseEvent) {
		if (event.target === expandedDialog) closeExpandedView();
	}
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
		{#if expandable}
			<button
				type="button"
				class="chain-illustration-expand"
				onclick={openExpandedView}
				aria-label="Expand visual method"
				data-analytics-label="Expand visual method"
			>
				<Maximize2 size={19} strokeWidth={2.2} aria-hidden="true" />
			</button>
		{/if}
	</div>
	{#if showCaption && illustration.caption}
		<figcaption>
			<span>{label}</span>
			<p>{illustration.caption}</p>
		</figcaption>
	{/if}
</figure>

{#if expandable}
	<dialog
		bind:this={expandedDialog}
		class="chain-illustration-dialog"
		aria-label={`Expanded ${label}`}
		onclick={closeFromBackdrop}
	>
		<div class="chain-illustration-dialog-shell">
			<button
				type="button"
				class="chain-illustration-close"
				onclick={closeExpandedView}
				aria-label="Close expanded visual"
				data-analytics-label="Close expanded visual"
			>
				<X size={21} strokeWidth={2.2} aria-hidden="true" />
			</button>
			<div class="chain-illustration-pan">
				<img
					class="chain-illustration-expanded-image"
					src={illustration.src}
					alt={illustration.alt}
					width={illustration.width}
					height={illustration.height}
					loading="lazy"
					decoding="async"
				/>
			</div>
		</div>
	</dialog>
{/if}

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
		position: relative;
		aspect-ratio: 16 / 9;
		background:
			radial-gradient(circle at 50% 30%, rgba(17, 93, 139, 0.2), transparent 58%), #020b17;
		overflow: hidden;
	}

	.chain-illustration-frame > img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.chain-illustration-expand,
	.chain-illustration-close {
		display: inline-grid;
		width: 2.5rem;
		height: 2.5rem;
		place-items: center;
		border: 1px solid rgba(118, 225, 255, 0.72);
		background: rgba(2, 15, 29, 0.86);
		color: #e9faff;
		cursor: pointer;
		backdrop-filter: blur(8px);
	}

	.chain-illustration-expand {
		position: absolute;
		top: 0.65rem;
		right: 0.65rem;
	}

	.chain-illustration-expand:hover,
	.chain-illustration-expand:focus-visible,
	.chain-illustration-close:hover,
	.chain-illustration-close:focus-visible {
		border-color: #ffffff;
		background: rgba(7, 40, 65, 0.96);
		outline: 2px solid rgba(111, 229, 255, 0.46);
		outline-offset: 2px;
	}

	.chain-illustration-dialog {
		width: min(calc(100vw - 2rem), 75rem);
		max-width: none;
		height: min(calc(100vh - 2rem), 50rem);
		max-height: none;
		margin: auto;
		padding: 0;
		border: 1px solid rgba(118, 225, 255, 0.72);
		background: #020b17;
		color: #e9faff;
		overflow: hidden;
	}

	.chain-illustration-dialog::backdrop {
		background: rgba(1, 7, 16, 0.88);
		backdrop-filter: blur(5px);
	}

	.chain-illustration-dialog-shell {
		position: relative;
		display: grid;
		height: 100%;
		min-height: 0;
	}

	.chain-illustration-close {
		position: absolute;
		top: 0.7rem;
		right: 0.7rem;
		z-index: 1;
	}

	.chain-illustration-pan {
		display: grid;
		min-width: 0;
		min-height: 0;
		place-items: center;
		overflow: auto;
		padding: 3.4rem 1rem 1rem;
	}

	.chain-illustration-expanded-image {
		display: block;
		width: min(100%, 70rem);
		height: auto;
		margin: auto;
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
		.chain-illustration-expand {
			top: auto;
			right: 0.42rem;
			bottom: 0.42rem;
		}

		.chain-illustration-dialog {
			width: 100vw;
			height: 100dvh;
			margin: 0;
			border: 0;
		}

		.chain-illustration-pan {
			place-items: start;
			padding: 3.4rem 0.5rem 0.5rem;
		}

		.chain-illustration-expanded-image {
			width: 56rem;
			max-width: none;
			margin: 0;
		}

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
