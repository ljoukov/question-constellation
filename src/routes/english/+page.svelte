<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import { BookOpen, ClipboardCheck, Search, SlidersHorizontal } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type EnglishQuestion = (typeof data.questions)[number];

	const topbarSubjects = [
		'English',
		'All subjects',
		'Science',
		'Biology',
		'Chemistry',
		'Physics',
		'Computer Science',
		'Geography',
		'History'
	];
	const marksOptions = [
		'All marks',
		'1-2 marks',
		'3-5 marks',
		'6-10 marks',
		'11-20 marks',
		'20+ marks'
	];
	const pageSize = 24;

	let searchQuery = $state(untrack(() => data.initialFilters.search));
	let selectedBoard = $state(untrack(() => data.initialFilters.board));
	let selectedCourse = $state(untrack(() => data.initialFilters.course));
	let selectedPaper = $state(untrack(() => data.initialFilters.paper));
	let selectedYear = $state(untrack(() => data.initialFilters.year));
	let selectedText = $state(untrack(() => data.initialFilters.text));
	let selectedType = $state(untrack(() => data.initialFilters.type));
	let selectedMarks = $state(untrack(() => data.initialFilters.marks));
	let visibleCount = $state(pageSize);

	const boardOptions = $derived.by(() => {
		const options = unique([
			...data.stats.boards,
			...data.questions.map((question) => question.board)
		]);
		return options.length > 0 ? options : ['OCR'];
	});
	const boardScopedQuestions = $derived(
		data.questions.filter((question) => question.board === selectedBoard)
	);
	const courseOptions = $derived([
		'All English',
		...unique(boardScopedQuestions.map((question) => question.subject))
	]);
	const courseScopedQuestions = $derived(
		boardScopedQuestions.filter(
			(question) => selectedCourse === 'All English' || question.subject === selectedCourse
		)
	);
	const paperOptions = $derived([
		'All papers',
		...unique(courseScopedQuestions.map((question) => question.paper))
	]);
	const yearOptions = $derived([
		'All years',
		...unique(
			courseScopedQuestions.map((question) => (question.year ? String(question.year) : ''))
		).sort((left, right) => Number(right) - Number(left))
	]);
	const textOptions = $derived([
		'All texts',
		...unique(courseScopedQuestions.map((question) => question.textGroup))
	]);
	const typeOptions = $derived([
		'All types',
		...unique(courseScopedQuestions.map((question) => question.questionType))
	]);
	const showTextFilter = $derived(selectedCourse !== 'English Language' && textOptions.length > 1);
	const normalizedSearch = $derived(searchQuery.trim().toLowerCase());
	const filteredQuestions = $derived.by(() =>
		data.questions.filter((question) => {
			if (question.board !== selectedBoard) return false;
			if (selectedCourse !== 'All English' && question.subject !== selectedCourse) return false;
			if (selectedPaper !== 'All papers' && question.paper !== selectedPaper) return false;
			if (selectedYear !== 'All years' && String(question.year ?? '') !== selectedYear)
				return false;
			if (selectedText !== 'All texts' && question.textGroup !== selectedText) return false;
			if (selectedType !== 'All types' && question.questionType !== selectedType) return false;
			if (selectedMarks !== 'All marks' && question.marksBand !== selectedMarks) return false;
			if (!normalizedSearch) return true;

			const haystack = [
				question.title,
				question.preview,
				question.subject,
				question.paper,
				question.componentCode,
				question.series,
				question.textGroup,
				question.questionType,
				question.sourceQuestionRef,
				question.topicPath.join(' ')
			]
				.join(' ')
				.toLowerCase();
			return normalizedSearch.split(/\s+/).every((term) => haystack.includes(term));
		})
	);
	const visibleQuestions = $derived(filteredQuestions.slice(0, visibleCount));
	const remainingCount = $derived(Math.max(0, filteredQuestions.length - visibleQuestions.length));
	const groupedQuestions = $derived(groupQuestions(visibleQuestions));
	const activeFilterCount = $derived(
		[
			boardOptions.length > 1 && selectedBoard !== defaultBoardOption(),
			selectedCourse !== 'All English',
			selectedPaper !== 'All papers',
			selectedYear !== 'All years',
			selectedText !== 'All texts',
			selectedType !== 'All types',
			selectedMarks !== 'All marks',
			Boolean(searchQuery.trim())
		].filter(Boolean).length
	);
	const finderSummary = $derived(
		filteredQuestions.length === data.questions.length
			? `${data.questions.length} English questions`
			: `${filteredQuestions.length} of ${data.questions.length} English questions`
	);

	$effect(() => {
		selectedBoard;
		selectedCourse;
		selectedPaper;
		selectedYear;
		selectedText;
		selectedType;
		selectedMarks;
		searchQuery;
		if (untrack(() => visibleCount) !== pageSize) visibleCount = pageSize;
	});

	$effect(() => {
		if (!boardOptions.includes(selectedBoard)) selectedBoard = defaultBoardOption();
		if (!courseOptions.includes(selectedCourse)) selectedCourse = 'All English';
		if (!paperOptions.includes(selectedPaper)) selectedPaper = 'All papers';
		if (!yearOptions.includes(selectedYear)) selectedYear = 'All years';
		if (!textOptions.includes(selectedText)) selectedText = 'All texts';
		if (!typeOptions.includes(selectedType)) selectedType = 'All types';
		if (!marksOptions.includes(selectedMarks)) selectedMarks = 'All marks';
	});

	function unique(values: string[]) {
		return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
	}

	function defaultBoardOption() {
		return boardOptions[0] ?? 'OCR';
	}

	function groupQuestions(questions: EnglishQuestion[]) {
		const groups = new Map<string, { key: string; title: string; questions: EnglishQuestion[] }>();
		for (const question of questions) {
			const parts = [
				question.subject,
				question.componentCode || question.paper,
				question.year ? String(question.year) : '',
				question.series
					.replace(String(question.year ?? ''), '')
					.replace(/[-\s]+$/, '')
					.trim()
			].filter(Boolean);
			const title = parts.join(' · ');
			const key = `${question.sourceDocumentId}:${title}`;
			if (!groups.has(key)) groups.set(key, { key, title, questions: [] });
			groups.get(key)?.questions.push(question);
		}
		return [...groups.values()];
	}

	function syncEnglishUrl() {
		if (typeof window === 'undefined') return;
		const params = new URLSearchParams();
		const trimmedSearch = searchQuery.trim();
		if (trimmedSearch) params.set('q', trimmedSearch);
		if (boardOptions.length > 1 && selectedBoard !== defaultBoardOption())
			params.set('board', selectedBoard);
		if (selectedCourse !== 'All English') params.set('course', selectedCourse);
		if (selectedPaper !== 'All papers') params.set('paper', selectedPaper);
		if (selectedYear !== 'All years') params.set('year', selectedYear);
		if (selectedText !== 'All texts') params.set('text', selectedText);
		if (selectedType !== 'All types') params.set('type', selectedType);
		if (selectedMarks !== 'All marks') params.set('marks', selectedMarks);
		const query = params.toString();
		window.history.replaceState(
			window.history.state,
			'',
			`${resolve('/english')}${query ? `?${query}` : ''}`
		);
	}

	function updateSearch(value: string) {
		searchQuery = value;
		syncEnglishUrl();
	}

	function updateFilter(next: {
		course?: string;
		board?: string;
		paper?: string;
		year?: string;
		text?: string;
		type?: string;
		marks?: string;
	}) {
		if (next.board !== undefined && next.board !== selectedBoard) {
			selectedBoard = next.board;
			selectedCourse = 'All English';
			selectedPaper = 'All papers';
			selectedYear = 'All years';
			selectedText = 'All texts';
			selectedType = 'All types';
			selectedMarks = 'All marks';
		}
		if (next.course !== undefined && next.course !== selectedCourse) {
			selectedCourse = next.course;
			selectedPaper = 'All papers';
			selectedYear = 'All years';
			selectedText = 'All texts';
			selectedType = 'All types';
			selectedMarks = 'All marks';
		}
		if (next.paper !== undefined) selectedPaper = next.paper;
		if (next.year !== undefined) selectedYear = next.year;
		if (next.text !== undefined) selectedText = next.text;
		if (next.type !== undefined) selectedType = next.type;
		if (next.marks !== undefined) selectedMarks = next.marks;
		syncEnglishUrl();
	}

	function clearFilters() {
		searchQuery = '';
		selectedBoard = defaultBoardOption();
		selectedCourse = 'All English';
		selectedPaper = 'All papers';
		selectedYear = 'All years';
		selectedText = 'All texts';
		selectedType = 'All types';
		selectedMarks = 'All marks';
		syncEnglishUrl();
	}

	function updateTopbarSubject(value: string) {
		if (typeof window === 'undefined' || value === 'English') return;
		const params = new URLSearchParams();
		if (value && value !== 'All subjects') params.set('subject', value);
		const query = params.toString();
		window.location.assign(`${resolve('/')}${query ? `?${query}` : ''}`);
	}

	function questionHref(question: EnglishQuestion) {
		return resolve('/questions/[questionId]/practice', {
			questionId: question.slug || question.id
		});
	}

	function metadataLine(question: EnglishQuestion) {
		return [
			question.board,
			question.componentCode,
			question.sourceQuestionRef ? `Q${question.sourceQuestionRef}` : '',
			question.marks ? `${question.marks} marks` : ''
		]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<svelte:head>
	<title>GCSE English Questions | Question Constellation</title>
	<meta
		name="description"
		content="Browse GCSE English Language and English Literature questions by exam board, paper, year, text, question type, and marks."
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/english" />
</svelte:head>

<main class="qc-real-app qc-browse-app qc-english-app">
	<AppTopbar
		subject="English"
		subjects={topbarSubjects}
		searchValue={searchQuery}
		searchPlaceholder="Search English questions"
		onSearchChange={updateSearch}
		onSubjectChange={updateTopbarSubject}
	/>

	<div class="qc-browse-layout qc-english-layout">
		<aside class="qc-browse-intro qc-english-side">
			<p class="qc-real-kicker">GCSE English</p>
			<h1>Choose an English question.</h1>
			<p>
				Filter by exam board, course, paper, year, text, and question type, then open a guided
				question workspace.
			</p>

			<div class="qc-english-stats" aria-label="English corpus summary">
				<span>
					<strong>{data.stats.questionCount}</strong>
					questions
				</span>
				<span>
					<strong>{data.stats.sourceDocumentCount}</strong>
					papers
				</span>
			</div>

			<section class="qc-english-filter-panel" aria-label="English filters">
				<div class="qc-english-filter-head">
					<span><SlidersHorizontal size={16} aria-hidden="true" /> Filters</span>
					{#if activeFilterCount > 0}
						<button type="button" onclick={clearFilters}>Clear</button>
					{/if}
				</div>

				<label>
					<span>Board</span>
					<select
						value={selectedBoard}
						onchange={(event) => updateFilter({ board: event.currentTarget.value })}
					>
						{#each boardOptions as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Course</span>
					<select
						value={selectedCourse}
						onchange={(event) => updateFilter({ course: event.currentTarget.value })}
					>
						{#each courseOptions as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Paper</span>
					<select
						value={selectedPaper}
						onchange={(event) => updateFilter({ paper: event.currentTarget.value })}
					>
						{#each paperOptions as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Year</span>
					<select
						value={selectedYear}
						onchange={(event) => updateFilter({ year: event.currentTarget.value })}
					>
						{#each yearOptions as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>

				{#if showTextFilter}
					<label>
						<span>Text</span>
						<select
							value={selectedText}
							onchange={(event) => updateFilter({ text: event.currentTarget.value })}
						>
							{#each textOptions as option}
								<option value={option}>{option}</option>
							{/each}
						</select>
					</label>
				{/if}

				<label>
					<span>Question type</span>
					<select
						value={selectedType}
						onchange={(event) => updateFilter({ type: event.currentTarget.value })}
					>
						{#each typeOptions as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>

				<label>
					<span>Marks</span>
					<select
						value={selectedMarks}
						onchange={(event) => updateFilter({ marks: event.currentTarget.value })}
					>
						{#each marksOptions as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
			</section>
		</aside>

		<section class="qc-browse-feed qc-english-feed" aria-label="English questions">
			<div class="qc-browse-heading qc-english-heading">
				<div>
					<p class="qc-real-kicker">Question bank</p>
					<h2>Question finder</h2>
				</div>
				<p>{finderSummary}</p>
			</div>

			{#if data.questions.length === 0}
				<section class="qc-empty-search qc-english-empty">
					<Search size={19} aria-hidden="true" />
					<span>No English questions are published in D1 yet.</span>
				</section>
			{:else if filteredQuestions.length === 0}
				<section class="qc-empty-search qc-english-empty">
					<Search size={19} aria-hidden="true" />
					<span>No English questions match those filters.</span>
				</section>
			{:else}
				{#each groupedQuestions as group (group.key)}
					<section class="qc-english-group" aria-label={group.title}>
						<div class="qc-browse-question-set-head qc-english-group-head">
							<h3>{group.title}</h3>
							<span>{group.questions.length} questions</span>
						</div>

						<div class="qc-english-question-list">
							{#each group.questions as question (question.id)}
								<article class="qc-browse-chain qc-english-question-card">
									<div class="qc-english-question-top">
										<span class="qc-english-course">
											{#if question.subject === 'English Literature'}
												<BookOpen size={16} aria-hidden="true" />
											{:else}
												<ClipboardCheck size={16} aria-hidden="true" />
											{/if}
											{question.subject}
										</span>
										<span>{metadataLine(question)}</span>
									</div>

									<h3>
										<a href={questionHref(question)}>{question.title}</a>
									</h3>
									<p>{question.preview}</p>

									<div class="qc-english-tags" aria-label="Question metadata">
										<span>{question.questionType}</span>
										{#if question.textGroup}
											<span>{question.textGroup}</span>
										{/if}
										{#if question.series}
											<span>{question.series}</span>
										{/if}
										{#if question.hasModelAnswer}
											<span>Model answer</span>
										{/if}
									</div>

									<div class="qc-english-card-actions">
										<a class="primary" href={questionHref(question)}>Open question</a>
									</div>
								</article>
							{/each}
						</div>
					</section>
				{/each}

				{#if remainingCount > 0}
					<button
						type="button"
						class="qc-show-more-chains"
						onclick={() =>
							(visibleCount = Math.min(visibleCount + pageSize, filteredQuestions.length))}
					>
						Show more questions
					</button>
				{/if}
			{/if}
		</section>
	</div>
</main>
