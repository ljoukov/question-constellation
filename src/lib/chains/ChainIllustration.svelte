<script lang="ts">
	import { Maximize2, MoveHorizontal, X } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { ChainIllustration } from './chainIllustration';

	let {
		illustration,
		label = 'Visual method',
		eager = false,
		showCaption = true,
		expandable = false,
		mobilePan = false,
		mobilePanels = [],
		onPanComplete
	}: {
		illustration: ChainIllustration;
		label?: string;
		eager?: boolean;
		showCaption?: boolean;
		expandable?: boolean;
		mobilePan?: boolean;
		mobilePanels?: Array<{ label: string; position: string }>;
		onPanComplete?: () => void;
	} = $props();

	let expandedDialog: HTMLDialogElement | undefined = $state();
	let activeTheme: 'light' | 'dark' | null = $state(null);
	let panCompletionReported = false;
	const activeSrc = $derived(
		activeTheme === 'dark'
			? illustration.src
			: activeTheme === 'light'
				? illustration.lightSrc
				: null
	);
	const lightBackground = $derived(`url(${JSON.stringify(illustration.lightSrc)})`);
	const darkBackground = $derived(`url(${JSON.stringify(illustration.src)})`);

	onMount(() => {
		const root = document.documentElement;
		const syncTheme = () => {
			activeTheme = root.dataset.theme === 'dark' ? 'dark' : 'light';
		};
		const observer = new MutationObserver(syncTheme);

		syncTheme();
		observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });

		return () => observer.disconnect();
	});

	function openExpandedView() {
		expandedDialog?.showModal();
	}

	function closeExpandedView() {
		expandedDialog?.close();
	}

	function closeFromBackdrop(event: MouseEvent) {
		if (event.target === expandedDialog) closeExpandedView();
	}

	function panFocus(node: HTMLElement, enabled: boolean) {
		let featureEnabled = enabled;
		const sync = () => {
			const canPan = featureEnabled && node.scrollWidth > node.clientWidth + 1;
			if (canPan) {
				node.tabIndex = 0;
				node.setAttribute(
					'aria-label',
					`${label}. Swipe horizontally or use the arrow keys to see all four steps.`
				);
			} else {
				node.removeAttribute('tabindex');
				node.setAttribute('aria-label', `${label} image`);
			}
		};
		const update = (nextEnabled: boolean) => {
			featureEnabled = nextEnabled;
			sync();
		};
		const resizeObserver = new ResizeObserver(sync);
		resizeObserver.observe(node);
		if (node.firstElementChild instanceof HTMLElement) {
			resizeObserver.observe(node.firstElementChild);
		}
		node.addEventListener('keydown', handlePanKeydown);
		node.addEventListener('scroll', handlePanScroll, { passive: true });
		sync();
		return {
			update,
			destroy: () => {
				resizeObserver.disconnect();
				node.removeEventListener('keydown', handlePanKeydown);
				node.removeEventListener('scroll', handlePanScroll);
			}
		};
	}

	function handlePanScroll(event: Event) {
		if (panCompletionReported || !(event.currentTarget instanceof HTMLElement)) return;
		const scroller = event.currentTarget;
		if (scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 8) return;
		panCompletionReported = true;
		onPanComplete?.();
	}

	function handlePanKeydown(event: KeyboardEvent) {
		if (!mobilePan || !(event.currentTarget instanceof HTMLElement)) return;
		const scroller = event.currentTarget;
		const step = Math.max(96, Math.round(scroller.clientWidth * 0.8));
		if (event.key === 'ArrowRight') scroller.scrollBy({ left: step });
		else if (event.key === 'ArrowLeft') scroller.scrollBy({ left: -step });
		else if (event.key === 'Home') scroller.scrollTo({ left: 0 });
		else if (event.key === 'End') scroller.scrollTo({ left: scroller.scrollWidth });
		else return;
		event.preventDefault();
	}
</script>

<figure
	class="chain-illustration"
	class:mobile-pan={mobilePan}
	class:mobile-panel-sequence={mobilePanels.length > 0}
	data-analytics-label={`${label}: ${illustration.caption}`}
>
	{#if mobilePan}
		<p class="chain-illustration-pan-hint">
			<MoveHorizontal size={17} strokeWidth={2.2} aria-hidden="true" />
			Swipe to see all 4 steps · expand for the full atlas
		</p>
	{/if}
	<div class="chain-illustration-frame-shell">
		<div
			class="chain-illustration-frame-scroll"
			use:panFocus={mobilePan}
			role="region"
			aria-label={`${label} image`}
		>
			<div class="chain-illustration-frame">
				{#if eager}
					<div
						class="chain-illustration-art"
						role="img"
						aria-label={illustration.alt}
						style:--illustration-light-image={lightBackground}
						style:--illustration-dark-image={darkBackground}
					></div>
				{:else if activeSrc}
					<img
						src={activeSrc}
						alt={illustration.alt}
						width={illustration.width}
						height={illustration.height}
						loading={eager ? 'eager' : 'lazy'}
						decoding="async"
					/>
				{/if}
			</div>
			{#if mobilePanels.length > 0}
				<div
					class="chain-illustration-mobile-sequence"
					role="img"
					aria-label={`${label}: ${mobilePanels.map((panel) => panel.label).join(', then ')}`}
				>
					{#each mobilePanels as panel, index (panel.label)}
						<div
							class="chain-illustration-mobile-panel"
							style:--illustration-light-image={lightBackground}
							style:--illustration-dark-image={darkBackground}
							style:--mobile-panel-position={panel.position}
							aria-hidden="true"
						>
							<span>{index + 1}</span>
							<strong>{panel.label}</strong>
						</div>
					{/each}
				</div>
			{/if}
		</div>
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
			<p class="chain-illustration-dialog-hint">
				<MoveHorizontal size={17} strokeWidth={2.2} aria-hidden="true" />
				Swipe across the full atlas
			</p>
			<div class="chain-illustration-pan">
				{#if activeSrc}
					<img
						class="chain-illustration-expanded-image"
						src={activeSrc}
						alt={illustration.alt}
						width={illustration.width}
						height={illustration.height}
						loading={eager ? 'eager' : 'lazy'}
						decoding="async"
					/>
				{/if}
			</div>
		</div>
	</dialog>
{/if}

<style>
	.chain-illustration,
	.chain-illustration-dialog {
		--illustration-border: color-mix(in srgb, var(--qc-ui-accent) 34%, var(--qc-ui-border-subtle));
		--illustration-surface: var(--qc-ui-surface-raised);
		--illustration-text: var(--qc-ui-text);
		--illustration-frame:
			radial-gradient(circle at 50% 30%, rgba(8, 122, 85, 0.08), transparent 58%), #f7fbf9;
		--illustration-shadow-ring: rgba(8, 122, 85, 0.08);
		--illustration-shadow-drop: rgba(18, 44, 42, 0.22);
		--illustration-control-border: color-mix(in srgb, var(--qc-ui-accent) 58%, white);
		--illustration-control-surface: rgba(255, 253, 247, 0.9);
		--illustration-control-text: var(--qc-ui-accent-strong);
		--illustration-control-hover-border: var(--qc-ui-accent);
		--illustration-control-hover-surface: #eef8f3;
		--illustration-control-outline: color-mix(in srgb, var(--qc-ui-accent) 34%, transparent);
		--illustration-caption-border: color-mix(in srgb, var(--qc-ui-accent) 20%, transparent);
		--illustration-caption-surface: linear-gradient(90deg, #f5faf7, #fffdf7);
		--illustration-caption-label: var(--qc-ui-accent-text);
		--illustration-caption-copy: var(--qc-ui-text-secondary);
	}

	.chain-illustration {
		width: min(100%, 980px);
		max-width: 100%;
		min-width: 0;
		margin: 0;
		border: 1px solid var(--illustration-border);
		background: var(--illustration-surface);
		color: var(--illustration-text);
		box-shadow:
			0 0 0 1px var(--illustration-shadow-ring),
			0 18px 46px -28px var(--illustration-shadow-drop);
		overflow: hidden;
	}

	.chain-illustration-frame {
		aspect-ratio: 16 / 9;
		background: var(--illustration-frame);
		overflow: hidden;
	}

	.chain-illustration-frame-shell {
		position: relative;
		width: 100%;
		max-width: 100%;
		min-width: 0;
		overflow: hidden;
	}

	.chain-illustration-frame-scroll {
		width: 100%;
		max-width: 100%;
		min-width: 0;
	}

	.chain-illustration-frame > img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	.chain-illustration-art {
		width: 100%;
		height: 100%;
		background-image: var(--illustration-light-image);
		background-position: center;
		background-repeat: no-repeat;
		background-size: contain;
	}

	.chain-illustration-expand,
	.chain-illustration-close {
		display: inline-grid;
		width: 2.5rem;
		height: 2.5rem;
		place-items: center;
		border: 1px solid var(--illustration-control-border);
		background: var(--illustration-control-surface);
		color: var(--illustration-control-text);
		cursor: pointer;
		backdrop-filter: blur(8px);
	}

	.chain-illustration-expand {
		position: absolute;
		top: 0.65rem;
		right: 0.65rem;
		z-index: 2;
	}

	.chain-illustration-pan-hint {
		display: none;
	}

	.chain-illustration-mobile-sequence,
	.chain-illustration-dialog-hint {
		display: none;
	}

	.chain-illustration-expand:hover,
	.chain-illustration-expand:focus-visible,
	.chain-illustration-close:hover,
	.chain-illustration-close:focus-visible {
		border-color: var(--illustration-control-hover-border);
		background: var(--illustration-control-hover-surface);
		outline: 2px solid var(--illustration-control-outline);
		outline-offset: 2px;
	}

	.chain-illustration-dialog {
		width: min(calc(100vw - 2rem), 75rem);
		max-width: none;
		height: min(calc(100vh - 2rem), 50rem);
		max-height: none;
		margin: auto;
		padding: 0;
		border: 1px solid var(--illustration-border);
		background: var(--illustration-surface);
		color: var(--illustration-text);
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

	:global(:root[data-theme='dark']) .chain-illustration,
	:global(:root[data-theme='dark']) .chain-illustration-dialog {
		--illustration-border: rgba(70, 201, 255, 0.62);
		--illustration-surface: #020b17;
		--illustration-text: #edf9ff;
		--illustration-frame:
			radial-gradient(circle at 50% 30%, rgba(17, 93, 139, 0.2), transparent 58%), #020b17;
		--illustration-shadow-ring: rgba(69, 213, 255, 0.08);
		--illustration-shadow-drop: rgba(5, 92, 159, 0.68);
		--illustration-control-border: rgba(118, 225, 255, 0.72);
		--illustration-control-surface: rgba(2, 15, 29, 0.86);
		--illustration-control-text: #e9faff;
		--illustration-control-hover-border: #ffffff;
		--illustration-control-hover-surface: rgba(7, 40, 65, 0.96);
		--illustration-control-outline: rgba(111, 229, 255, 0.46);
		--illustration-caption-border: rgba(85, 208, 255, 0.3);
		--illustration-caption-surface: linear-gradient(
			90deg,
			rgba(4, 29, 50, 0.96),
			rgba(3, 15, 29, 0.96)
		);
		--illustration-caption-label: #6fe5ff;
		--illustration-caption-copy: #dcecf6;
	}

	:global(:root[data-theme='dark']) .chain-illustration-art {
		background-image: var(--illustration-dark-image);
	}

	:global(:root[data-theme='dark']) .chain-illustration-mobile-panel {
		background-image: var(--illustration-dark-image);
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .chain-illustration,
		:global(:root:not([data-theme='light'])) .chain-illustration-dialog {
			--illustration-border: rgba(70, 201, 255, 0.62);
			--illustration-surface: #020b17;
			--illustration-text: #edf9ff;
			--illustration-frame:
				radial-gradient(circle at 50% 30%, rgba(17, 93, 139, 0.2), transparent 58%), #020b17;
			--illustration-shadow-ring: rgba(69, 213, 255, 0.08);
			--illustration-shadow-drop: rgba(5, 92, 159, 0.68);
			--illustration-control-border: rgba(118, 225, 255, 0.72);
			--illustration-control-surface: rgba(2, 15, 29, 0.86);
			--illustration-control-text: #e9faff;
			--illustration-control-hover-border: #ffffff;
			--illustration-control-hover-surface: rgba(7, 40, 65, 0.96);
			--illustration-control-outline: rgba(111, 229, 255, 0.46);
			--illustration-caption-border: rgba(85, 208, 255, 0.3);
			--illustration-caption-surface: linear-gradient(
				90deg,
				rgba(4, 29, 50, 0.96),
				rgba(3, 15, 29, 0.96)
			);
			--illustration-caption-label: #6fe5ff;
			--illustration-caption-copy: #dcecf6;
		}

		:global(:root:not([data-theme='light'])) .chain-illustration-art {
			background-image: var(--illustration-dark-image);
		}

		:global(:root:not([data-theme='light'])) .chain-illustration-mobile-panel {
			background-image: var(--illustration-dark-image);
		}
	}

	@media (max-width: 520px) {
		.mobile-pan {
			contain: inline-size;
		}

		.mobile-pan .chain-illustration-frame-scroll {
			overflow-x: auto;
			overscroll-behavior-inline: contain;
			scrollbar-width: thin;
		}

		.mobile-pan .chain-illustration-frame-scroll:focus-visible {
			outline: 2px solid var(--illustration-control-outline);
			outline-offset: -2px;
		}

		.mobile-pan .chain-illustration-frame {
			width: 45rem;
			max-width: none;
		}

		.mobile-panel-sequence .chain-illustration-frame {
			display: none;
		}

		.mobile-panel-sequence .chain-illustration-frame-scroll {
			scroll-snap-type: x mandatory;
		}

		.mobile-panel-sequence .chain-illustration-mobile-sequence {
			display: flex;
			width: max-content;
			gap: 0.5rem;
			padding: 0.5rem;
		}

		.mobile-panel-sequence .chain-illustration-mobile-panel {
			position: relative;
			width: min(17rem, calc(100vw - 5.5rem));
			aspect-ratio: 1.46;
			flex: 0 0 auto;
			scroll-snap-align: start;
			border: 1px solid var(--illustration-border);
			background-image: var(--illustration-light-image);
			background-position: var(--mobile-panel-position);
			background-repeat: no-repeat;
			background-size: 334% auto;
			overflow: hidden;
		}

		.mobile-panel-sequence .chain-illustration-mobile-panel::after {
			position: absolute;
			inset: auto 0 0;
			height: 44%;
			background: linear-gradient(transparent, rgba(1, 9, 20, 0.88));
			content: '';
		}

		.mobile-panel-sequence .chain-illustration-mobile-panel > span,
		.mobile-panel-sequence .chain-illustration-mobile-panel > strong {
			position: absolute;
			z-index: 1;
			bottom: 0.55rem;
			color: #fff;
			text-shadow: 0 1px 4px rgba(0, 0, 0, 0.85);
		}

		.mobile-panel-sequence .chain-illustration-mobile-panel > span {
			left: 0.55rem;
			display: grid;
			width: 1.55rem;
			height: 1.55rem;
			place-items: center;
			border: 1px solid rgba(255, 255, 255, 0.76);
			background: rgba(2, 16, 31, 0.82);
			font-size: 0.78rem;
			font-weight: 850;
		}

		.mobile-panel-sequence .chain-illustration-mobile-panel > strong {
			right: 0.55rem;
			left: 2.45rem;
			font-size: 0.83rem;
			line-height: 1.2;
		}

		.mobile-pan .chain-illustration-pan-hint {
			display: flex;
			gap: 0.42rem;
			align-items: center;
			margin: 0;
			padding: 0.58rem 0.7rem;
			border-bottom: 1px solid var(--illustration-caption-border);
			background: var(--illustration-caption-surface);
			color: var(--illustration-caption-copy);
			font-size: 0.76rem;
			font-weight: 650;
			line-height: 1.35;
		}

		.mobile-pan .chain-illustration-expand {
			position: absolute;
			right: 0.55rem;
			top: 0.55rem;
		}
	}

	figcaption {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.65rem 0.9rem;
		align-items: baseline;
		padding: 0.72rem 0.9rem 0.78rem;
		border-top: 1px solid var(--illustration-caption-border);
		background: var(--illustration-caption-surface);
	}

	figcaption span {
		color: var(--illustration-caption-label);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	figcaption p {
		margin: 0;
		color: var(--illustration-caption-copy);
		font-size: 0.88rem;
		line-height: 1.35;
	}

	@media (max-width: 620px) {
		.chain-illustration:not(.mobile-pan) .chain-illustration-expand {
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
			padding: 0.5rem;
		}

		.chain-illustration-dialog-shell {
			grid-template-rows: auto minmax(0, 1fr);
		}

		.chain-illustration-dialog-hint {
			display: flex;
			gap: 0.42rem;
			align-items: center;
			min-height: 3.4rem;
			margin: 0;
			padding: 0.8rem 3.7rem 0.8rem 0.8rem;
			border-bottom: 1px solid var(--illustration-caption-border);
			background: var(--illustration-caption-surface);
			color: var(--illustration-caption-copy);
			font-size: 0.8rem;
			font-weight: 650;
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
