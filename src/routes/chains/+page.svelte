<script lang="ts">
	import { resolve } from '$app/paths';
	import QuestionTeaserGrid from '$lib/chains/QuestionTeaserGrid.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { LearningChain } from '$lib/learningChains';
	import { untrack } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';

	let {
		data
	}: {
		data: {
			chains: LearningChain[];
			initialSearch: string;
			initialSubject: string;
			initialMarks: string;
		};
	} = $props();

	const subjectOrder = [
		'English',
		'Science',
		'Biology',
		'Chemistry',
		'Physics',
		'Computer Science',
		'Geography',
		'History'
	];
	const scienceSubjects = new Set(['Science', 'Biology', 'Chemistry', 'Physics']);
	const marksFilterOptions = [
		{ value: 'all', label: 'All' },
		{ value: '1', label: '1' },
		{ value: '2', label: '2' },
		{ value: '3-4', label: '3-4' },
		{ value: '4+', label: '4+' },
		{ value: '5+', label: '5+' },
		{ value: '6', label: '6' }
	] as const;
	type MarksFilter = (typeof marksFilterOptions)[number]['value'];
	const validMarksFilterValues = new Set<string>(marksFilterOptions.map((option) => option.value));

	function canonicalSubject(value: string | null | undefined) {
		const lower = (value ?? '').toLowerCase();
		if (lower.includes('english')) return 'English';
		if (lower.includes('computer science') || lower.includes('computing'))
			return 'Computer Science';
		if (lower.includes('geography')) return 'Geography';
		if (lower.includes('history')) return 'History';
		if (lower.includes('biology')) return 'Biology';
		if (lower.includes('chemistry')) return 'Chemistry';
		if (lower.includes('physics')) return 'Physics';
		if (lower.includes('science')) return 'Science';
		return null;
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

	function chainMatchesSubject(chain: LearningChain, subject: string) {
		const subjectName = chainSubject(chain);
		if (subject === 'All subjects') return true;
		if (subject === 'Science') return scienceSubjects.has(subjectName);
		return subjectName === subject;
	}

	let searchQuery = $state(untrack(() => data.initialSearch));
	let selectedSubject = $state(
		untrack(() => canonicalSubject(data.initialSubject) ?? 'All subjects')
	);
	let selectedMarksFilter = $state<MarksFilter>(
		untrack(() =>
			validMarksFilterValues.has(data.initialMarks) ? (data.initialMarks as MarksFilter) : 'all'
		)
	);
	let visibleCount = $state(12);
	let visibleFilterKey = $state('');
	const previewQuestionLimit = 3;

	const subjects = $derived.by(() => {
		const availableSubjects = new Set<string>(data.chains.map(chainSubject));
		const ordered = subjectOrder.filter((subject) => {
			if (subject === 'Science') {
				return [...availableSubjects].some((candidate) => scienceSubjects.has(candidate));
			}
			return availableSubjects.has(subject);
		});
		const remaining = [...availableSubjects]
			.filter((subject) => !subjectOrder.includes(subject))
			.sort((left, right) => left.localeCompare(right));
		return ['All subjects', ...ordered, ...remaining];
	});
	const normalizedSearch = $derived(searchQuery.trim().toLowerCase());
	const browseKicker = $derived(
		selectedSubject === 'All subjects'
			? 'GCSE question bank'
			: selectedSubject === 'Science'
				? 'GCSE Science'
				: `GCSE ${selectedSubject}`
	);

	function questionMatchesMarks(question: LearningChain['questions'][number]) {
		const marks = question.marks;
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
		return chain.questions.filter(questionMatchesMarks);
	}

	const filteredChains = $derived(
		data.chains.filter((chain) => {
			if (!chainMatchesSubject(chain, selectedSubject)) return false;
			if (selectedMarksFilter !== 'all' && matchingQuestions(chain).length === 0) return false;
			if (!normalizedSearch) return true;

			const haystack = [
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
			]
				.join(' ')
				.toLowerCase();
			return normalizedSearch.split(/\s+/).every((term) => haystack.includes(term));
		})
	);
	const firstChain = $derived(filteredChains[0] ?? null);
	const visibleChains = $derived(filteredChains.slice(0, visibleCount));
	const remainingCount = $derived(Math.max(0, filteredChains.length - visibleChains.length));
	const filteredQuestionCount = $derived(
		filteredChains.reduce((sum, chain) => sum + matchingQuestions(chain).length, 0)
	);

	$effect(() => {
		const nextFilterKey = `${searchQuery}\0${selectedSubject}\0${selectedMarksFilter}`;
		if (nextFilterKey !== visibleFilterKey) {
			visibleFilterKey = nextFilterKey;
			visibleCount = 12;
		}
	});

	function chainHref(chain: LearningChain) {
		return resolve('/chains/[chainId]', { chainId: chain.id });
	}

	function syncBrowseUrl(nextSearch: string, nextSubject: string, nextMarksFilter: MarksFilter) {
		if (typeof window === 'undefined') return;
		const params = new SvelteURLSearchParams();
		const trimmedSearch = nextSearch.trim();
		if (trimmedSearch) params.set('q', trimmedSearch);
		if (nextSubject && nextSubject !== 'All subjects') params.set('subject', nextSubject);
		if (nextMarksFilter !== 'all') params.set('marks', nextMarksFilter);
		const query = params.toString();
		const nextUrl = `${resolve('/chains')}${query ? `?${query}` : ''}`;
		window.history.replaceState(window.history.state, '', nextUrl);
	}

	function updateSearch(value: string) {
		searchQuery = value;
		syncBrowseUrl(value, selectedSubject, selectedMarksFilter);
	}

	function updateSubject(value: string) {
		if (value === 'English') {
			window.location.assign(resolve('/english'));
			return;
		}
		selectedSubject = value;
		syncBrowseUrl(searchQuery, value, selectedMarksFilter);
	}

	function updateMarksFilter(value: MarksFilter) {
		selectedMarksFilter = value;
		syncBrowseUrl(searchQuery, selectedSubject, value);
	}

	function accessibleText(value: string) {
		return value.replace(/\s*<=>\s*/g, ' ⇌ ').replace(/\s*(?:->|⟶|⇒|)\s*/g, ' → ');
	}
</script>

<svelte:head>
	<title>Question Bank | Question Constellation</title>
	<meta
		name="description"
		content="Browse GCSE questions, choose a practice set, then practise in the original exam-paper format."
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/chains" />
</svelte:head>

<main class="qc-real-app qc-browse-app">
	<AppTopbar
		subject={selectedSubject}
		searchValue={searchQuery}
		searchPlaceholder="Search questions or topics"
		onSearchChange={updateSearch}
	/>

	<div class="qc-browse-layout">
		<aside class="qc-browse-intro">
			<p class="qc-real-kicker">{browseKicker}</p>
			<h1>Choose a question.</h1>
			<p>Pick a real exam question, then practise similar questions that use the same method.</p>
			{#if firstChain}
				<a class="qc-browse-start" href={chainHref(firstChain)}>Start with this set</a>
			{/if}
		</aside>

		<section class="qc-browse-feed" aria-label="Question bank">
			<div class="qc-browse-heading">
				<h2>Practice sets</h2>
				<p>
					{#if filteredChains.length === data.chains.length}
						{data.chains.length} sets in the question bank
					{:else}
						{filteredChains.length} of {data.chains.length} sets · {filteredQuestionCount}
						questions match
					{/if}
				</p>
			</div>

			<section class="qc-browse-filters" aria-label="Browse filters">
				<label class="qc-subject-filter">
					<span>Subject</span>
					<select value={selectedSubject} onchange={(event) => updateSubject(event.currentTarget.value)}>
						{#each subjects as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>

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
						aria-label={`${accessibleText(chain.title)} method`}
					>
						<h3>Method</h3>
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
								{#if matchingQuestions(chain).length > previewQuestionLimit}
									<a href={chainHref(chain)}>More</a>
								{/if}
							</span>
						</div>
						<QuestionTeaserGrid
							{chain}
							questions={matchingQuestions(chain)}
							limit={previewQuestionLimit}
						/>
					</section>
				</article>
			{/each}

			{#if visibleChains.length === 0}
				<p class="qc-empty-search">No practice sets match that search.</p>
			{/if}

			{#if remainingCount > 0}
				<button
					type="button"
					class="qc-show-more-chains"
					onclick={() => (visibleCount = Math.min(visibleCount + 12, data.chains.length))}
				>
					Show more sets
				</button>
			{/if}
		</section>
	</div>
</main>
