<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Bookmark,
		Brain,
		CheckCircle2,
		ChevronRight,
		Network,
		RefreshCcw,
		Route
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const selectedQuestionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.selected.savedFromQuestion.id })
	);
	const selectedPracticeHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.selected.nextReviewQuestion.id })
	);
</script>

<svelte:head>
	<title>Thinking Memory | Question Constellation</title>
	<meta
		name="description"
		content="A public preview of earned GCSE answer chains from the question bank."
	/>
</svelte:head>

<main class="flow-page thinking-memory-page">
	<header class="app-header">
		<a class="brand-lockup" href={selectedQuestionHref}>
			<Network size={30} strokeWidth={1.9} />
			<strong>Question Constellation</strong>
		</a>
		<nav class="desktop-nav" aria-label="Main navigation">
			<a href={selectedQuestionHref}>Question</a>
			<a href={selectedPracticeHref}>Practice</a>
		</nav>
		<Bookmark class="bookmark" size={25} strokeWidth={2.1} />
	</header>

	<div class="flow-grid memory-grid">
		<section class="flow-main">
			<p class="breadcrumb">Thinking Memory / earned answer chains</p>
			<h1 class="desktop-title">{data.selected.chain.title}</h1>
			<p class="workspace-subtitle">{data.selected.chain.summary}</p>

			<section class="answer-panel">
				<div class="side-title-row">
					<h2>Selected chain</h2>
					<Brain size={24} />
				</div>
				<div class="chain-line">
					{#each data.selected.chain.steps as step, index (step.id)}
						<span>{step.short}</span>
						{#if index < data.selected.chain.steps.length - 1}
							<ChevronRight size={18} />
						{/if}
					{/each}
				</div>
				<p>
					<strong>Recurring missing link:</strong>
					{data.selected.recurringMissingStep.commonOmission}
				</p>
				<div class="desktop-action-row">
					<a class="primary-button" href={selectedPracticeHref}>
						<RefreshCcw size={22} />
						Review this chain
					</a>
					<a class="secondary-button" href={selectedQuestionHref}>
						<Route size={22} />
						Original question
					</a>
				</div>
			</section>

			<section class="memory-library">
				<h2>Available chains</h2>
				<div class="linked-list">
					{#each data.entries as entry (entry.id)}
						<a class="mini-row" href={resolve('/chains/[chainId]', { chainId: entry.chain.id })}>
							<Brain size={19} />
							<span>
								<strong>{entry.chain.title}</strong><br />
								<small
									>{entry.savedFromQuestion.meta.subject} - {entry.savedFromQuestion.meta
										.topic}</small
								>
							</span>
							<ChevronRight size={17} />
						</a>
					{/each}
				</div>
			</section>
		</section>

		<aside class="flow-sidebar">
			<section class="side-card">
				<div class="side-title-row">
					<h2>Next review</h2>
					<CheckCircle2 size={22} />
				</div>
				<p>{data.selected.nextReviewQuestion.title}</p>
				<a class="open-link" href={selectedPracticeHref}>
					Open practice <ArrowRight size={17} />
				</a>
			</section>

			<section class="side-card">
				<h2>Transfer questions</h2>
				<div class="linked-list">
					{#each data.questions as question (question.id)}
						<a
							class="mini-row"
							href={resolve('/questions/[questionId]/practice', { questionId: question.id })}
						>
							<span>
								<strong>{question.title}</strong><br />
								<small>{question.distanceLabel} - {question.meta.marks} marks</small>
							</span>
							<ChevronRight size={17} />
						</a>
					{/each}
				</div>
			</section>
		</aside>
	</div>
</main>
