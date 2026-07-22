<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import ComboBox from '$lib/components/ui/ComboBox.svelte';
	import type { RecallRuntimeSubject } from '$lib/recall/aqaScienceRecall';
	import {
		recallActivityForMode,
		recallModeFromPath,
		recallSessionHref,
		recallStackSizeOptions,
		type RecallSessionMode
	} from '$lib/recall/routes';
	import { ArrowRight, ChevronDown, Clock3 } from '@lucide/svelte';
	import { untrack } from 'svelte';

	type RecallDeckTopic = {
		id: string;
		title: string;
		cardCount: number;
	};

	let {
		subject,
		totalCardCount,
		topics,
		initialHref,
		primary = false
	}: {
		subject: RecallRuntimeSubject;
		totalCardCount: number;
		topics: RecallDeckTopic[];
		initialHref: string;
		primary?: boolean;
	} = $props();

	const resolveInternalPath = resolve as (path: string) => ResolvedPathname;
	const initialUrl = untrack(() => new URL(initialHref, 'https://question-constellation.local'));
	const initialPathMode = recallModeFromPath(initialUrl.pathname.split('/').filter(Boolean).at(-1));
	const supportedModes: Array<{ value: RecallSessionMode; label: string }> = [
		{ value: 'mixed', label: 'Quick recall' },
		{ value: 'recall', label: 'Flashcards' },
		{ value: 'recognise', label: 'Multiple choice' },
		{ value: 'truefalse', label: 'True or false' }
	];
	const initialTopic = initialUrl.searchParams.get('topic') ?? 'all';
	const requestedInitialSize = Number(initialUrl.searchParams.get('size') ?? '10');
	const initialSize = recallStackSizeOptions.includes(
		requestedInitialSize as (typeof recallStackSizeOptions)[number]
	)
		? requestedInitialSize
		: 10;
	const returnTo =
		initialUrl.searchParams.get('back') ?? `/subjects/${initialUrl.pathname.split('/')[2]}`;
	const disclosureId = untrack(
		() => `recall-deck-options-${subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
	);

	let optionsOpen = $state(false);
	let selectedTopic = $state(
		untrack(() => (topics.some((topic) => topic.id === initialTopic) ? initialTopic : 'all'))
	);
	let selectedMode = $state<RecallSessionMode>(
		initialPathMode && supportedModes.some((option) => option.value === initialPathMode)
			? initialPathMode
			: 'mixed'
	);
	let selectedSize = $state<number>(initialSize);

	const availableCardCount = $derived(
		selectedTopic === 'all'
			? totalCardCount
			: (topics.find((topic) => topic.id === selectedTopic)?.cardCount ?? 0)
	);
	const deckCardCount = $derived(Math.min(selectedSize, availableCardCount));
	const selectedTopicTitle = $derived(
		selectedTopic === 'all'
			? 'all included topics'
			: (topics.find((topic) => topic.id === selectedTopic)?.title ?? 'Selected topic')
	);
	const selectedModeLabel = $derived(
		supportedModes.find((option) => option.value === selectedMode)?.label ?? 'Recall'
	);
	const selectedDeckNoun = $derived(
		selectedMode === 'mixed'
			? 'mixed recall cards'
			: selectedMode === 'recall'
				? 'flashcards'
				: selectedMode === 'recognise'
					? 'multiple-choice cards'
					: 'true-or-false cards'
	);
	const deckWasCustomised = $derived(
		selectedTopic !== initialTopic ||
			selectedMode !== initialPathMode ||
			selectedSize !== initialSize
	);
	const estimatedMinutes = $derived(
		deckCardCount > 0 ? Math.max(3, Math.min(15, deckCardCount)) : null
	);
	const startHref = $derived(
		resolveInternalPath(
			recallSessionHref({
				subject,
				activity: recallActivityForMode(selectedMode),
				mode: selectedMode,
				topic: selectedTopic,
				size: selectedSize,
				returnTo
			})
		)
	);
</script>

<div class="recall-deck-customizer" class:is-open={optionsOpen}>
	<button
		type="button"
		class="recall-customise-toggle"
		aria-expanded={optionsOpen}
		aria-controls={disclosureId}
		onclick={() => (optionsOpen = !optionsOpen)}
	>
		<span>Customise deck</span>
		<ChevronDown size={17} aria-hidden="true" strokeWidth={2.2} />
	</button>

	{#if optionsOpen}
		<div id={disclosureId} class="recall-options">
			<div class="recall-option-grid">
				<label class="recall-option">
					<span class="recall-option-label">Topic</span>
					<ComboBox bind:value={selectedTopic}>
						<option value="all">All included topics</option>
						{#each topics as topic (topic.id)}
							<option value={topic.id}>{topic.title}</option>
						{/each}
					</ComboBox>
				</label>

				<label class="recall-option">
					<span class="recall-option-label">Practice style</span>
					<ComboBox bind:value={selectedMode}>
						{#each supportedModes as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</ComboBox>
				</label>

				<label class="recall-option">
					<span class="recall-option-label">Cards</span>
					<ComboBox bind:value={selectedSize}>
						{#each recallStackSizeOptions as size (size)}
							<option value={size}>{size} cards</option>
						{/each}
					</ComboBox>
				</label>
			</div>
			<p class="recall-deck-summary" aria-live="polite">
				{#if availableCardCount === 0}
					No cards are available for this topic.
				{:else if deckCardCount < selectedSize}
					This topic has {deckCardCount}
					{deckCardCount === 1 ? 'card' : 'cards'}; you’ll practise all of them as {selectedDeckNoun}.
				{:else}
					{deckCardCount}
					{selectedDeckNoun} from {selectedTopicTitle}; {availableCardCount}
					available.
				{/if}
			</p>
		</div>
	{/if}
	{#if !optionsOpen && deckWasCustomised}
		<p class="recall-current-deck" aria-live="polite">
			{selectedModeLabel} · {selectedTopicTitle} · {deckCardCount} cards
		</p>
	{/if}

	<div class="recall-start-row">
		<a
			class={primary ? 'qc-dashboard-action' : 'qc-action-button compact'}
			href={startHref}
			data-sveltekit-reload
			aria-label={`Start ${deckCardCount} ${selectedDeckNoun} from ${selectedTopicTitle}`}
			aria-disabled={deckCardCount === 0}
			data-analytics-label={`${subject} customised recall`}
		>
			Start recall
			<ArrowRight size={17} aria-hidden="true" />
		</a>
		{#if estimatedMinutes}
			<span class="qc-activity-meta">
				<Clock3 size={14} aria-hidden="true" />
				About {estimatedMinutes} min
			</span>
		{/if}
	</div>
</div>

<style>
	.recall-deck-customizer {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}

	.recall-customise-toggle {
		display: inline-flex;
		width: fit-content;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.38rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--qc-ui-text-secondary);
		font: inherit;
		font-size: 0.86rem;
		font-weight: 680;
		cursor: pointer;
	}

	.recall-customise-toggle :global(svg) {
		transition: transform 170ms ease;
	}

	.is-open .recall-customise-toggle :global(svg) {
		transform: rotate(180deg);
	}

	.recall-customise-toggle:hover {
		color: var(--qc-ui-accent-text);
	}

	.recall-customise-toggle:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--qc-ui-accent) 28%, transparent);
		outline-offset: 2px;
	}

	.recall-options {
		overflow: hidden;
		container-type: inline-size;
	}

	.recall-option-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		border-block: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface-muted) 48%, transparent);
	}

	.recall-option {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
		padding: 0.55rem 0.78rem 0.45rem;
		color: var(--qc-ui-text-muted);
		cursor: pointer;
	}

	.recall-option + .recall-option {
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.recall-option-label {
		font-size: 0.7rem;
		font-weight: 760;
		letter-spacing: 0.055em;
		line-height: 1.2;
		text-transform: uppercase;
		transition: color 140ms ease;
	}

	.recall-option:focus-within .recall-option-label {
		color: var(--qc-ui-accent-text);
	}

	.recall-deck-summary {
		margin: 0;
		padding: 0.42rem 0.05rem 0;
		color: var(--qc-ui-text-muted);
		font-size: 0.8rem;
		line-height: 1.35;
	}

	.recall-current-deck {
		margin: -0.18rem 0 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.8rem;
		font-weight: 650;
		line-height: 1.35;
	}

	.recall-start-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: center;
	}

	.recall-start-row a[aria-disabled='true'] {
		pointer-events: none;
		opacity: 0.52;
	}

	@container (min-width: 32rem) {
		.recall-option-grid {
			grid-template-columns: minmax(0, 1.45fr) minmax(8rem, 0.7fr);
		}

		.recall-option + .recall-option {
			border-top: 0;
		}

		.recall-option:first-child {
			grid-column: 1 / -1;
			border-bottom: 1px solid var(--qc-ui-border-subtle);
		}

		.recall-option:nth-child(3) {
			border-left: 1px solid var(--qc-ui-border-subtle);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.recall-customise-toggle :global(svg),
		.recall-option-label {
			transition: none;
		}
	}
</style>
