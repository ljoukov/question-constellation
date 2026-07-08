<script lang="ts">
	import { pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import QuestionTeaserGrid from '$lib/chains/QuestionTeaserGrid.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import {
		canonicalCurriculumSubject,
		subjectBelongsToScience
	} from '$lib/curriculum/gcseCurriculum';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { LearningChain } from '$lib/learningChains';
	import type { QuestionBankQuestion, QuestionBankTopic } from '$lib/server/learningChainData';
	import type { AdminUser } from '$lib/server/auth/session';
	import { BookOpenCheck, ListTree, Network, Search } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	type ViewMode = 'topics' | 'chains';
	type MarksFilter = (typeof marksFilterOptions)[number]['value'];
	let {
		data
	}: {
		data: {
			chains: LearningChain[];
			questions: QuestionBankQuestion[];
			topics: QuestionBankTopic[];
			initialSearch: string;
			initialSubject: string;
			initialMarks: string;
			initialView: string;
			initialTopic: string;
			initialBoard: string;
			user?: AdminUser | null;
		};
	} = $props();

	const browseHref = resolve('/chains');
	const previewQuestionLimit = 4;
	const subjectOrder = [
		'Science',
		'Biology',
		'Chemistry',
		'Physics',
		'Computer Science',
		'Geography',
		'History',
		'English Language',
		'English Literature'
	];
	const viewOptions: Array<{ value: ViewMode; label: string; icon: typeof ListTree }> = [
		{ value: 'topics', label: 'Specification topics', icon: ListTree },
		{ value: 'chains', label: 'Answer chains', icon: Network }
	];
	const marksFilterOptions = [
		{ value: 'all', label: 'All' },
		{ value: '1', label: '1' },
		{ value: '2', label: '2' },
		{ value: '3-4', label: '3-4' },
		{ value: '4+', label: '4+' },
		{ value: '5+', label: '5+' },
		{ value: '6', label: '6' }
	] as const;
	const validMarksFilterValues = new Set<string>(marksFilterOptions.map((option) => option.value));

	let searchQuery = $state(untrack(() => data.initialSearch));
	let selectedSubject = $state(
		untrack(() => canonicalSubject(data.initialSubject) ?? 'All subjects')
	);
	let selectedMarksFilter = $state<MarksFilter>(
		untrack(() =>
			validMarksFilterValues.has(data.initialMarks) ? (data.initialMarks as MarksFilter) : 'all'
		)
	);
	let selectedView = $state<ViewMode>(untrack(() => validViewMode(data.initialView)));
	let selectedTopic = $state(untrack(() => data.initialTopic || 'all'));
	let selectedBoard = $state(untrack(() => data.initialBoard || 'all'));
	let visibleCount = $state(12);
	let visibleFilterKey = $state('');

	const subjects = $derived.by(() => {
		const availableSubjects = new Set<string>();
		for (const question of data.questions) availableSubjects.add(question.subject);
		for (const chain of data.chains) availableSubjects.add(chainSubject(chain));
		for (const topic of data.topics) availableSubjects.add(topic.subject);

		const ordered = subjectOrder.filter((subject) => {
			if (subject === 'Science') {
				return [...availableSubjects].some((candidate) => subjectBelongsToScience(candidate));
			}
			return availableSubjects.has(subject);
		});
		const remaining = [...availableSubjects]
			.filter((subject) => !subjectOrder.includes(subject))
			.sort((left, right) => left.localeCompare(right));
		return ['All subjects', ...ordered, ...remaining];
	});
	const normalizedSearch = $derived(searchQuery.trim().toLowerCase());
	const selectedSubjectLabel = $derived(
		selectedSubject === 'All subjects'
			? 'GCSE question bank'
			: selectedSubject === 'Science'
				? 'GCSE Science'
				: `GCSE ${selectedSubject}`
	);
	const boardOptions = $derived.by(() => {
		const boards = new Set<string>();
		for (const question of data.questions) {
			if (questionMatchesSubject(question.subject, selectedSubject)) boards.add(question.board);
		}
		for (const topic of data.topics) {
			if (questionMatchesSubject(topic.subject, selectedSubject)) boards.add(topic.board);
		}
		return ['all', ...[...boards].sort((left, right) => left.localeCompare(right))];
	});
	const visibleTopicOptions = $derived.by(() => {
		const topics = data.topics.filter(
			(topic) =>
				questionMatchesSubject(topic.subject, selectedSubject) &&
				topicMatchesBoard(topic, selectedBoard) &&
				topic.questionCount > 0
		);
		return [
			{ id: 'all', title: 'All topics' },
			...topics.map((topic) => ({ id: topic.id, title: topic.title }))
		];
	});
	const filteredQuestions = $derived(
		data.questions.filter((question) => {
			if (!questionMatchesSubject(question.subject, selectedSubject)) return false;
			if (!questionMatchesBoard(question, selectedBoard)) return false;
			if (!questionMatchesMarks(question.marks)) return false;
			if (selectedTopic !== 'all' && question.topicId !== selectedTopic) return false;
			if (!normalizedSearch) return true;
			return textMatchesSearch(
				[
					question.title,
					question.preview,
					question.board,
					question.subject,
					question.paper,
					question.componentCode,
					question.series,
					question.sourceRef,
					question.topicPath.join(' '),
					question.chainTitle
				].join(' ')
			);
		})
	);
	const filteredTopicSections = $derived.by(() =>
		data.topics
			.filter((topic) => {
				if (!questionMatchesSubject(topic.subject, selectedSubject)) return false;
				if (!topicMatchesBoard(topic, selectedBoard)) return false;
				if (selectedTopic !== 'all' && topic.id !== selectedTopic) return false;
				if (!normalizedSearch) return true;
				if (textMatchesSearch([topic.title, topic.paper, topic.code, topic.subject].join(' '))) {
					return true;
				}
				return filteredQuestions.some((question) => question.topicId === topic.id);
			})
			.map((topic) => {
				const questions = filteredQuestions.filter((question) => question.topicId === topic.id);
				return { topic, questions, questionCount: questions.length };
			})
			.filter((section) => section.questionCount > 0)
	);
	const visibleTopicSections = $derived(filteredTopicSections.slice(0, visibleCount));
	const topicRemainingCount = $derived(
		Math.max(0, filteredTopicSections.length - visibleTopicSections.length)
	);
	const filteredChains = $derived(
		data.chains.filter((chain) => {
			if (!chainMatchesSubject(chain, selectedSubject)) return false;
			if (!chainMatchesBoard(chain, selectedBoard)) return false;
			if (selectedMarksFilter !== 'all' && matchingQuestions(chain).length === 0) return false;
			if (!normalizedSearch) return true;

			return textMatchesSearch(
				[
					chain.title,
					chain.subject,
					chainSubject(chain),
					chain.topic,
					chain.summary,
					chain.steps.join(' '),
					chain.questions
						.map((question) =>
							[
								question.title,
								question.teaser,
								question.label,
								question.command,
								question.paperLabel
							].join(' ')
						)
						.join(' ')
				].join(' ')
			);
		})
	);
	const firstTopicSection = $derived(filteredTopicSections[0] ?? null);
	const firstChain = $derived(filteredChains[0] ?? null);
	const visibleChains = $derived(filteredChains.slice(0, visibleCount));
	const chainRemainingCount = $derived(Math.max(0, filteredChains.length - visibleChains.length));
	const filteredQuestionCount = $derived(filteredQuestions.length);
	const filteredChainQuestionCount = $derived(
		filteredChains.reduce((sum, chain) => sum + matchingQuestions(chain).length, 0)
	);
	const activeSummary = $derived(
		selectedView === 'topics'
			? `${filteredTopicSections.length} topics · ${filteredQuestionCount} questions`
			: `${filteredChains.length} chains · ${filteredChainQuestionCount} questions`
	);
	const startHref = $derived.by(() => {
		if (selectedView === 'topics' && firstTopicSection?.questions[0]) {
			return questionHref(firstTopicSection.questions[0]);
		}
		return firstChain ? chainHref(firstChain) : browseHref;
	});

	$effect(() => {
		const nextFilterKey = `${searchQuery}\0${selectedSubject}\0${selectedMarksFilter}\0${selectedView}\0${selectedTopic}\0${selectedBoard}`;
		if (nextFilterKey !== visibleFilterKey) {
			visibleFilterKey = nextFilterKey;
			visibleCount = 12;
		}
	});

	$effect(() => {
		if (!boardOptions.includes(selectedBoard)) {
			selectedBoard = 'all';
			syncBrowseUrl(
				searchQuery,
				selectedSubject,
				selectedMarksFilter,
				selectedView,
				selectedTopic,
				'all'
			);
		}
		if (!visibleTopicOptions.some((topic) => topic.id === selectedTopic)) {
			selectedTopic = 'all';
			syncBrowseUrl(
				searchQuery,
				selectedSubject,
				selectedMarksFilter,
				selectedView,
				'all',
				selectedBoard
			);
		}
	});

	$effect(() => {
		const params = page.url.searchParams;
		const nextSearchQuery = params.get('q') ?? '';
		const nextSubject = canonicalSubject(params.get('subject')) ?? 'All subjects';
		const rawMarksFilter = params.get('marks') ?? 'all';
		const nextMarksFilter = validMarksFilterValues.has(rawMarksFilter)
			? (rawMarksFilter as MarksFilter)
			: 'all';
		const nextView = validViewMode(params.get('view') ?? 'topics');
		const nextTopic = params.get('topic') ?? 'all';
		const nextBoard = params.get('board') ?? 'all';

		untrack(() => {
			if (searchQuery !== nextSearchQuery) searchQuery = nextSearchQuery;
			if (selectedSubject !== nextSubject) selectedSubject = nextSubject;
			if (selectedMarksFilter !== nextMarksFilter) selectedMarksFilter = nextMarksFilter;
			if (selectedView !== nextView) selectedView = nextView;
			if (selectedTopic !== nextTopic) selectedTopic = nextTopic;
			if (selectedBoard !== nextBoard) selectedBoard = nextBoard;
		});
	});

	function canonicalSubject(value: string | null | undefined) {
		const canonical = canonicalCurriculumSubject(value);
		if (canonical === 'Science') return 'Science';
		return canonical;
	}

	function validViewMode(value: string): ViewMode {
		return value === 'chains' ? 'chains' : 'topics';
	}

	function chainSubject(chain: LearningChain) {
		return (
			canonicalSubject(chain.subject) ??
			canonicalSubject(chain.paperLabel) ??
			canonicalSubject(chain.topic) ??
			canonicalSubject(chain.title) ??
			'Science'
		);
	}

	function questionMatchesSubject(subject: string, selected: string) {
		if (selected === 'All subjects') return true;
		if (selected === 'Science') return subjectBelongsToScience(subject);
		return subject === selected;
	}

	function chainMatchesSubject(chain: LearningChain, subject: string) {
		return questionMatchesSubject(chainSubject(chain), subject);
	}

	function questionMatchesBoard(question: QuestionBankQuestion, board: string) {
		return board === 'all' || question.board === board;
	}

	function topicMatchesBoard(topic: QuestionBankTopic, board: string) {
		return board === 'all' || topic.board === board;
	}

	function chainMatchesBoard(chain: LearningChain, board: string) {
		if (board === 'all') return true;
		return chain.questions.some((question) =>
			(question.paperLabel ?? '').toLowerCase().includes(board.toLowerCase())
		);
	}

	function questionMatchesMarks(marks: number | null) {
		if (selectedMarksFilter === 'all') return true;
		if (marks === null || marks === undefined) return false;
		if (selectedMarksFilter === '1') return marks === 1;
		if (selectedMarksFilter === '2') return marks === 2;
		if (selectedMarksFilter === '3-4') return marks >= 3 && marks <= 4;
		if (selectedMarksFilter === '4+') return marks >= 4;
		if (selectedMarksFilter === '5+') return marks >= 5;
		if (selectedMarksFilter === '6') return marks === 6;
		return true;
	}

	function matchingQuestions(chain: LearningChain) {
		return chain.questions.filter((question) => questionMatchesMarks(question.marks));
	}

	function textMatchesSearch(value: string) {
		const haystack = value.toLowerCase();
		return normalizedSearch.split(/\s+/).every((term) => haystack.includes(term));
	}

	function chainHref(chain: LearningChain) {
		return resolve('/chains/[chainId]', { chainId: chain.id });
	}

	function questionHref(question: QuestionBankQuestion) {
		return resolve('/questions/[questionId]', { questionId: question.slug || question.id });
	}

	function syncBrowseUrl(
		nextSearch: string,
		nextSubject: string,
		nextMarksFilter: MarksFilter,
		nextView: ViewMode,
		nextTopic: string,
		nextBoard: string,
		historyMode: 'push' | 'replace' = 'replace'
	) {
		if (typeof window === 'undefined') return;
		const params = new SvelteURLSearchParams();
		const trimmedSearch = nextSearch.trim();
		if (trimmedSearch) params.set('q', trimmedSearch);
		if (nextSubject && nextSubject !== 'All subjects') params.set('subject', nextSubject);
		if (nextMarksFilter !== 'all') params.set('marks', nextMarksFilter);
		if (nextView !== 'topics') params.set('view', nextView);
		if (nextTopic !== 'all') params.set('topic', nextTopic);
		if (nextBoard !== 'all') params.set('board', nextBoard);
		const query = params.toString();
		const nextUrl = `${browseHref}${query ? `?${query}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}${page.url.hash}`;
		if (nextUrl === currentUrl) return;
		if (historyMode === 'push') {
			pushState(nextUrl, page.state);
			return;
		}
		replaceState(nextUrl, page.state);
	}

	function updateSearch(value: string) {
		searchQuery = value;
		syncBrowseUrl(
			value,
			selectedSubject,
			selectedMarksFilter,
			selectedView,
			selectedTopic,
			selectedBoard,
			'replace'
		);
	}

	function updateSubject(value: string) {
		selectedSubject = value;
		selectedTopic = 'all';
		selectedBoard = 'all';
		syncBrowseUrl(searchQuery, value, selectedMarksFilter, selectedView, 'all', 'all', 'push');
	}

	function updateView(value: ViewMode) {
		selectedView = value;
		syncBrowseUrl(
			searchQuery,
			selectedSubject,
			selectedMarksFilter,
			value,
			selectedTopic,
			selectedBoard,
			'push'
		);
	}

	function updateMarksFilter(value: MarksFilter) {
		selectedMarksFilter = value;
		syncBrowseUrl(
			searchQuery,
			selectedSubject,
			value,
			selectedView,
			selectedTopic,
			selectedBoard,
			'push'
		);
	}

	function updateTopic(value: string) {
		selectedTopic = value;
		syncBrowseUrl(
			searchQuery,
			selectedSubject,
			selectedMarksFilter,
			selectedView,
			value,
			selectedBoard,
			'push'
		);
	}

	function updateBoard(value: string) {
		selectedBoard = value;
		selectedTopic = 'all';
		syncBrowseUrl(
			searchQuery,
			selectedSubject,
			selectedMarksFilter,
			selectedView,
			'all',
			value,
			'push'
		);
	}

	function accessibleText(value: string) {
		return value.replace(/\s*<=>\s*/g, ' <=> ').replace(/\s*(?:->|⟶|⇒|)\s*/g, ' -> ');
	}

	function metaLine(parts: Array<string | number | null | undefined>) {
		return parts
			.map((part) => (typeof part === 'number' ? String(part) : part))
			.filter((part): part is string => Boolean(part && part.trim()))
			.join(' · ');
	}
</script>

<svelte:head>
	<title>Question Bank | Question Constellation</title>
	<meta
		name="description"
		content="Browse GCSE questions by specification topic or answer chain, then open a real exam question and practise transfer."
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/chains" />
</svelte:head>

<main class="qc-real-app qc-browse-app">
	<AppTopbar
		user={data.user}
		subject={selectedSubject}
		searchValue={searchQuery}
		searchPlaceholder="Search questions, topics or chains"
		onSearchChange={updateSearch}
	/>

	<div class="qc-browse-layout">
		<aside class="qc-browse-intro">
			<p class="qc-real-kicker">{selectedSubjectLabel}</p>
			<h1>Choose a question.</h1>
			<p>
				Browse by the exam specification first, or switch to answer chains when you want transfer
				practice across similar questions.
			</p>
			<div class="qc-bank-mode" role="group" aria-label="Question bank view">
				{#each viewOptions as option (option.value)}
					{@const ViewIcon = option.icon}
					<button
						type="button"
						class:active={selectedView === option.value}
						aria-pressed={selectedView === option.value}
						onclick={() => updateView(option.value)}
					>
						<ViewIcon size={16} aria-hidden="true" strokeWidth={2.2} />
						{option.label}
					</button>
				{/each}
			</div>
			<a class="qc-browse-start" href={startHref}>
				{selectedView === 'topics' ? 'Start first question' : 'Start first chain'}
			</a>
		</aside>

		<section class="qc-browse-feed" aria-label="Question bank">
			<div class="qc-browse-heading qc-bank-heading">
				<div>
					<h2>{selectedView === 'topics' ? 'Specification topics' : 'Answer chains'}</h2>
					<p>{activeSummary}</p>
				</div>
				{#if selectedView === 'topics'}
					<BookOpenCheck size={22} aria-hidden="true" strokeWidth={2.1} />
				{:else}
					<Network size={22} aria-hidden="true" strokeWidth={2.1} />
				{/if}
			</div>

			<section class="qc-browse-filters" aria-label="Browse filters">
				<label class="qc-subject-filter">
					<span>Subject</span>
					<select
						value={selectedSubject}
						onchange={(event) => updateSubject(event.currentTarget.value)}
					>
						{#each subjects as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>

				{#if boardOptions.length > 2}
					<label class="qc-subject-filter">
						<span>Board</span>
						<select
							value={selectedBoard}
							onchange={(event) => updateBoard(event.currentTarget.value)}
						>
							{#each boardOptions as option (option)}
								<option value={option}>{option === 'all' ? 'All boards' : option}</option>
							{/each}
						</select>
					</label>
				{/if}

				{#if selectedView === 'topics' && visibleTopicOptions.length > 2}
					<label class="qc-subject-filter qc-topic-filter">
						<span>Topic</span>
						<select
							value={selectedTopic}
							onchange={(event) => updateTopic(event.currentTarget.value)}
						>
							{#each visibleTopicOptions as option (option.id)}
								<option value={option.id}>{option.title}</option>
							{/each}
						</select>
					</label>
				{/if}

				<div class="qc-mark-filter" role="group" aria-label="Question marks">
					<span>Marks</span>
					{#each marksFilterOptions as option (option.value)}
						<button
							type="button"
							class:active={selectedMarksFilter === option.value}
							aria-pressed={selectedMarksFilter === option.value}
							onclick={() => updateMarksFilter(option.value)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			</section>

			{#if selectedView === 'topics'}
				{#each visibleTopicSections as section (section.topic.id)}
					<article class="qc-browse-chain qc-topic-card">
						<header class="qc-topic-card-head">
							<div>
								<p class="qc-real-kicker">
									{metaLine([
										section.topic.board,
										section.topic.qualification,
										section.topic.subject
									])}
								</p>
								<h3>
									<MathText text={section.topic.title} />
								</h3>
								<div class="qc-topic-card-meta" aria-label="Topic metadata">
									{#if section.topic.code}
										<span>{section.topic.code}</span>
									{/if}
									<span>{section.topic.paper}</span>
									<span>{section.questionCount} questions</span>
									{#if section.topic.chainCount > 0}
										<span>{section.topic.chainCount} chains</span>
									{/if}
								</div>
							</div>
							{#if section.topic.specUrl}
								<a class="qc-topic-spec-link" href={section.topic.specUrl} rel="noreferrer">
									Spec
								</a>
							{/if}
						</header>

						<div class="qc-topic-question-list">
							{#each section.questions.slice(0, previewQuestionLimit) as question (question.id)}
								<a class="qc-topic-question" href={questionHref(question)}>
									<span
										>{metaLine([
											question.sourceRef,
											question.paper,
											question.marks ? `${question.marks} marks` : null
										])}</span
									>
									<strong><MathText text={question.title} /></strong>
									<small><MathText text={question.preview} /></small>
									{#if question.chainTitle}
										<em><MathText text={question.chainTitle} /></em>
									{/if}
								</a>
							{/each}
						</div>
					</article>
				{/each}

				{#if visibleTopicSections.length === 0}
					<section class="qc-empty-search qc-bank-empty">
						<Search size={19} aria-hidden="true" />
						<span>No topics match those filters.</span>
					</section>
				{/if}

				{#if topicRemainingCount > 0}
					<button
						type="button"
						class="qc-show-more-chains"
						onclick={() =>
							(visibleCount = Math.min(visibleCount + 12, filteredTopicSections.length))}
					>
						Show more topics
					</button>
				{/if}
			{:else}
				{#each visibleChains as chain (chain.id)}
					<article class={['qc-browse-chain', `accent-${chain.accent}`]}>
						<a class="qc-chain-title-link" href={chainHref(chain)}>
							<span class="qc-chain-symbol" aria-hidden="true">{chain.symbol}</span>
							<span>
								<span class="qc-chain-topic"><MathText text={chain.topic} /></span>
								<span class="qc-chain-title"><MathText text={chain.title} /></span>
							</span>
						</a>

						<a
							class="qc-browse-chain-steps"
							href={chainHref(chain)}
							aria-label={`${accessibleText(chain.title)} answer chain`}
						>
							<h3>Answer chain</h3>
							<ol class="qc-browse-pattern">
								{#each chain.steps as step, index (`${chain.id}-${index}`)}
									<li><MathText text={step} /></li>
								{/each}
							</ol>
						</a>

						<section
							class="qc-browse-question-set"
							aria-label={`${accessibleText(chain.title)} questions`}
						>
							<div class="qc-browse-question-set-head">
								<h3>Practice questions</h3>
								<span>
									{#if selectedMarksFilter === 'all'}
										{chain.questions.length} questions
									{:else}
										{matchingQuestions(chain).length} matching
									{/if}
									{#if matchingQuestions(chain).length > 3}
										<a href={chainHref(chain)}>More</a>
									{/if}
								</span>
							</div>
							<QuestionTeaserGrid {chain} questions={matchingQuestions(chain)} limit={3} />
						</section>
					</article>
				{/each}

				{#if visibleChains.length === 0}
					<section class="qc-empty-search qc-bank-empty">
						<Search size={19} aria-hidden="true" />
						<span>No answer chains match those filters.</span>
					</section>
				{/if}

				{#if chainRemainingCount > 0}
					<button
						type="button"
						class="qc-show-more-chains"
						onclick={() => (visibleCount = Math.min(visibleCount + 12, filteredChains.length))}
					>
						Show more chains
					</button>
				{/if}
			{/if}
		</section>
	</div>
</main>
