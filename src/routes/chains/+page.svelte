<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import QuestionBankFilters from '$lib/components/QuestionBankFilters.svelte';
	import QuestionBankQuestionCard from '$lib/components/QuestionBankQuestionCard.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { Search } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
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

	function markLabel(marks: number | null) {
		if (!marks) return null;
		return `${marks} ${marks === 1 ? 'mark' : 'marks'}`;
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

	function pageHref(targetPage: number): ResolvedPathname {
		const params = new URLSearchParams();
		if (data.filters.search) params.set('q', data.filters.search);
		if (data.filters.subject !== 'All subjects') params.set('subject', data.filters.subject);
		if (data.filters.board !== 'all') params.set('board', data.filters.board);
		if (data.filters.topic !== 'all') params.set('topic', data.filters.topic);
		if (data.filters.marks !== 'all') params.set('marks', data.filters.marks);
		if (targetPage > 1) params.set('page', String(targetPage));
		const query = params.toString();
		return `${browseHref}${query ? `?${query}` : ''}` as ResolvedPathname;
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

<main class="qc-real-app qc-question-bank-page">
	<AppTopbar user={data.user} showNavigation />

	<div class="qc-learning-layout">
		<aside class="qc-learning-sidebar">
			<header class="qc-learning-heading">
				<p class="qc-real-kicker">{subjectLabel}</p>
				<h1>Find a question</h1>
				<p>{resultSummary}</p>
			</header>

			<QuestionBankFilters
				action={browseHref}
				search={data.filters.search}
				subject={data.filters.subject}
				subjects={data.subjects}
				board={data.filters.board}
				boards={data.boards}
				topic={data.filters.topic}
				topics={data.topicOptions}
				marks={data.filters.marks}
				markOptions={marksFilterOptions}
				summary={filterScopeSummary}
				active={filtersActive}
			/>
		</aside>

		<section class="qc-learning-main" aria-label="Question bank">
			{#each data.sections as section (section.topic.id)}
				<section class="qc-dashboard-panel qc-topic-card">
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
					</header>

					<div class="qc-topic-question-list">
						{#each section.questions as question (question.id)}
							<QuestionBankQuestionCard
								href={questionHref(question)}
								meta={metaLine([question.sourceRef, markLabel(question.marks)])}
								title={question.title}
								detail={questionDetail(question)}
								unavailableReason={question.practiceUnavailableReason}
							/>
						{/each}
					</div>
				</section>
			{/each}

			{#if data.sections.length === 0}
				<section class="qc-dashboard-panel qc-bank-empty">
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
