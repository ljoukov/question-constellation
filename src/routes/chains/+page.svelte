<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import QuestionBankQuestionCard from '$lib/components/QuestionBankQuestionCard.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { Search, SlidersHorizontal } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let filtersOpen = $state(false);
	const browseHref = resolve('/chains');
	const marksFilterOptions = [
		{ value: 'all', label: 'All marks' },
		{ value: '1-2', label: '1–2 marks' },
		{ value: '3-4', label: '3–4 marks' },
		{ value: '5-6', label: '5–6 marks' },
		{ value: '7+', label: '7+ marks' }
	];

	const subjectLabel = $derived(
		data.filters.subject === 'All subjects'
			? 'GCSE question bank'
			: data.filters.subject === 'Science'
				? 'GCSE Science'
				: `GCSE ${data.filters.subject}`
	);
	const resultSummary = $derived(
		data.totalQuestions === 0
			? 'No matching questions'
			: data.pageCount > 1
				? `Showing ${formatCount(data.resultStart)}–${formatCount(data.resultEnd)} of ${formatCount(data.totalQuestions)} · Page ${data.page} of ${data.pageCount}`
				: `${formatCount(data.totalQuestions)} ${data.totalQuestions === 1 ? 'question' : 'questions'}`
	);
	const filterScopeSummary = $derived.by(() => {
		const topicLabel =
			data.filters.topic === 'all'
				? 'All topics'
				: (data.topicOptions.find((option) => option.id === data.filters.topic)?.title ??
					'Chosen topic');
		const marksLabel =
			marksFilterOptions.find((option) => option.value === data.filters.marks)?.label ??
			'All marks';
		const parts = [data.filters.subject, topicLabel];
		if (data.filters.board !== 'all') parts.push(data.filters.board);
		if (data.filters.marks !== 'all') parts.push(marksLabel);
		if (data.filters.search) parts.push(`“${data.filters.search}”`);
		return parts.join(' · ');
	});
	const filtersActive = $derived(
		Boolean(
			data.filters.search ||
			data.filters.subject !== 'All subjects' ||
			data.filters.board !== 'all' ||
			data.filters.topic !== 'all' ||
			data.filters.marks !== 'all'
		)
	);

	function questionHref(question: (typeof data.sections)[number]['questions'][number]) {
		return resolve('/questions/[questionId]', { questionId: question.slug || question.id });
	}

	function formatCount(value: number) {
		return new Intl.NumberFormat('en-GB').format(value);
	}

	function metaLine(parts: Array<string | number | null | undefined>) {
		return parts
			.map((part) => (typeof part === 'number' ? String(part) : part))
			.filter((part): part is string => Boolean(part && part.trim()))
			.join(' · ');
	}

	function questionDetail(question: (typeof data.sections)[number]['questions'][number]) {
		const normalize = (value: string) =>
			value
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, ' ');
		const title = normalize(question.title);
		const preview = normalize(question.preview);
		if (!preview || preview === title || preview.startsWith(title) || title.startsWith(preview)) {
			return null;
		}
		return question.preview;
	}

	function pageHref(targetPage: number) {
		const params = new URLSearchParams();
		if (data.filters.search) params.set('q', data.filters.search);
		if (data.filters.subject !== 'All subjects') params.set('subject', data.filters.subject);
		if (data.filters.board !== 'all') params.set('board', data.filters.board);
		if (data.filters.topic !== 'all') params.set('topic', data.filters.topic);
		if (data.filters.marks !== 'all') params.set('marks', data.filters.marks);
		if (targetPage > 1) params.set('page', String(targetPage));
		const query = params.toString();
		return `${browseHref}${query ? `?${query}` : ''}`;
	}
</script>

<svelte:head>
	<title>Question Bank | Question Constellation</title>
	<meta
		name="description"
		content="Browse real GCSE questions by specification topic, then try one before seeing its answer chain."
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/chains" />
</svelte:head>

<main class="qc-real-app qc-browse-app">
	<AppTopbar user={data.user} showNavigation />

	<div class="qc-browse-layout">
		<aside class="qc-browse-intro">
			<p class="qc-real-kicker">{subjectLabel}</p>
			<h1>Find a question.</h1>
			<p>{resultSummary}</p>

			<button
				type="button"
				class="qc-bank-filter-toggle"
				aria-expanded={filtersOpen}
				aria-controls="question-bank-filters"
				onclick={() => (filtersOpen = !filtersOpen)}
			>
				<SlidersHorizontal size={17} aria-hidden="true" />
				<span>
					<strong>Search and filters</strong>
					<small>{filterScopeSummary}</small>
				</span>
			</button>

			<form
				id="question-bank-filters"
				class="qc-browse-filters qc-bank-filter-form"
				class:mobile-open={filtersOpen}
				method="GET"
				action={browseHref}
			>
				<label class="qc-bank-search">
					<span class="sr-only">Search questions</span>
					<Search size={18} aria-hidden="true" />
					<input
						type="search"
						name="q"
						value={data.filters.search}
						placeholder="Search questions"
					/>
				</label>

				<label class="qc-subject-filter">
					<span>Subject</span>
					<select
						name="subject"
						value={data.filters.subject}
						onchange={(event) => event.currentTarget.form?.requestSubmit()}
					>
						{#each data.subjects as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>

				{#if data.boards.length > 2}
					<label class="qc-subject-filter">
						<span>Board</span>
						<select
							name="board"
							value={data.filters.board}
							onchange={(event) => event.currentTarget.form?.requestSubmit()}
						>
							{#each data.boards as option (option)}
								<option value={option}>{option === 'all' ? 'All boards' : option}</option>
							{/each}
						</select>
					</label>
				{/if}

				{#if data.topicOptions.length > 1}
					<label class="qc-subject-filter qc-topic-filter">
						<span>Topic</span>
						<select
							name="topic"
							value={data.filters.topic}
							onchange={(event) => event.currentTarget.form?.requestSubmit()}
						>
							<option value="all">All topics</option>
							{#each data.topicOptions as option (option.id)}
								<option value={option.id}>{option.title}</option>
							{/each}
						</select>
					</label>
				{/if}

				<label class="qc-subject-filter">
					<span>Length</span>
					<select
						name="marks"
						value={data.filters.marks}
						onchange={(event) => event.currentTarget.form?.requestSubmit()}
					>
						{#each marksFilterOptions as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>

				<button class="qc-action-button primary qc-bank-search-submit" type="submit">
					<Search size={17} aria-hidden="true" />
					Find questions
				</button>
				{#if filtersActive}
					<a class="qc-bank-clear" href={browseHref}>Clear filters</a>
				{/if}
			</form>
		</aside>

		<section class="qc-browse-feed" aria-label="Question bank">
			{#each data.sections as section (section.topic.id)}
				<section class="qc-browse-chain qc-topic-card">
					<header class="qc-topic-card-head">
						<div>
							<p class="qc-real-kicker">
								{metaLine([
									section.topic.board,
									section.topic.qualification,
									section.topic.subject
								])}
							</p>
							<h2><MathText text={section.topic.title} /></h2>
						</div>
						{#if section.topic.specUrl}
							<a class="qc-topic-spec-link" href={section.topic.specUrl} rel="noreferrer">Spec</a>
						{/if}
					</header>

					<div class="qc-topic-question-list">
						{#each section.questions as question (question.id)}
							<QuestionBankQuestionCard
								href={questionHref(question)}
								meta={metaLine([
									question.sourceRef,
									question.marks ? `${question.marks} marks` : null
								])}
								title={question.title}
								detail={questionDetail(question)}
							/>
						{/each}
					</div>
				</section>
			{/each}

			{#if data.sections.length === 0}
				<section class="qc-empty-search qc-bank-empty">
					<Search size={19} aria-hidden="true" />
					<div>
						<strong>No questions match those filters.</strong>
						<a href={browseHref}>Clear filters</a>
					</div>
				</section>
			{/if}

			{#if data.pageCount > 1}
				<nav class="qc-bank-pagination" aria-label="Question bank pages">
					{#if data.page > 1}
						<a class="qc-action-button" href={pageHref(data.page - 1)}>Previous</a>
					{/if}
					<span>Page {data.page} of {data.pageCount}</span>
					{#if data.page < data.pageCount}
						<a class="qc-action-button primary" href={pageHref(data.page + 1)}>Next</a>
					{/if}
				</nav>
			{/if}
		</section>
	</div>
</main>
