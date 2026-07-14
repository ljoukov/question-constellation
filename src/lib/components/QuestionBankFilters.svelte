<script lang="ts">
	import FormField from '$lib/components/ui/FormField.svelte';
	import { Search, SlidersHorizontal } from '@lucide/svelte';

	type Option = {
		value: string;
		label: string;
	};

	type TopicOption = {
		id: string;
		title: string;
	};

	let {
		action,
		search,
		subject,
		subjects,
		board,
		boards,
		topic,
		topics,
		marks,
		markOptions,
		summary,
		active
	}: {
		action: string;
		search: string;
		subject: string;
		subjects: string[];
		board: string;
		boards: string[];
		topic: string;
		topics: TopicOption[];
		marks: string;
		markOptions: Option[];
		summary: string;
		active: boolean;
	} = $props();

	let open = $state(false);
</script>

<button
	type="button"
	class="qc-action-button compact filter-toggle"
	aria-expanded={open}
	aria-controls="question-bank-filters"
	onclick={() => (open = !open)}
>
	<SlidersHorizontal size={17} aria-hidden="true" />
	<span>
		<strong>{open ? 'Hide filters' : 'Filter questions'}</strong>
		<small>{summary}</small>
	</span>
</button>

<form
	id="question-bank-filters"
	class="qc-dashboard-panel filter-panel"
	class:mobile-open={open}
	method="GET"
	{action}
>
	<FormField label="Search">
		<input type="search" name="q" value={search} placeholder="Keyword or phrase" />
	</FormField>

	<FormField label="Subject">
		<select name="subject" value={subject}>
			{#each subjects as option (option)}
				<option value={option}>{option}</option>
			{/each}
		</select>
	</FormField>

	{#if boards.length > 2}
		<FormField label="Board">
			<select name="board" value={board}>
				{#each boards as option (option)}
					<option value={option}>{option === 'all' ? 'All boards' : option}</option>
				{/each}
			</select>
		</FormField>
	{/if}

	{#if topics.length > 1}
		<FormField label="Topic">
			<select name="topic" value={topic}>
				<option value="all">All topics</option>
				{#each topics as option (option.id)}
					<option value={option.id}>{option.title}</option>
				{/each}
			</select>
		</FormField>
	{/if}

	<FormField label="Marks">
		<select name="marks" value={marks}>
			{#each markOptions as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</FormField>

	<div class="actions">
		<button class="qc-action-button primary" type="submit">
			<Search size={17} aria-hidden="true" />
			Apply filters
		</button>
		{#if active}
			<a class="clear" href={action}>Clear</a>
		{/if}
	</div>
</form>

<style>
	.filter-toggle {
		justify-content: flex-start;
		width: 100%;
	}

	.filter-toggle > span {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
		text-align: left;
	}

	.filter-toggle strong,
	.filter-toggle small {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.filter-toggle small {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		font-weight: 500;
	}

	.filter-panel {
		display: none;
		gap: 0.7rem;
	}

	.filter-panel.mobile-open {
		display: grid;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
	}

	.clear {
		min-height: 2.75rem;
		display: inline-flex;
		align-items: center;
		color: var(--qc-ui-text-muted);
		font-size: 0.86rem;
		font-weight: 620;
		text-underline-offset: 0.18em;
	}

	@media (min-width: 720px) {
		.filter-toggle {
			display: none;
		}

		.filter-panel {
			display: grid;
		}
	}
</style>
