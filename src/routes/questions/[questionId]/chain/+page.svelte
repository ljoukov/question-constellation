<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import ChainIllustration from '$lib/chains/ChainIllustration.svelte';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import {
		hasDistinctMarkingPoints,
		hasExplainedWeakAnswer,
		useFocusedChainLayout
	} from '$lib/chains/chainPresentation';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault, isEnglishSubject } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { learnerSubjectForQuestion } from '$lib/learning/subjects';
	import { ChevronDown, ClipboardList, PenLine, TriangleAlert } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let markingPointsOpen = $state(false);
	const markingPointsRevealDurationMs =
		browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;

	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const chainPageHref = $derived(`/questions/${encodeURIComponent(data.question.id)}/chain`);
	function practiceWithReturn(questionId: string) {
		const base = resolve('/questions/[questionId]/practice', { questionId });
		const params = new URLSearchParams({ entry: 'chain', returnTo: chainPageHref });
		return `${base}?${params.toString()}`;
	}
	function questionDestination(question: (typeof data.questions)[number]) {
		return question.practiceAvailable
			? practiceWithReturn(question.id)
			: resolve('/questions/[questionId]', { questionId: question.id });
	}
	const practiceHref = $derived(practiceWithReturn(data.practiceQuestion.id));
	const currentPracticeHref = $derived(practiceWithReturn(data.question.id));
	const constellationHref = $derived(
		`${resolve('/constellations/[chainId]', { chainId: data.chain.id })}?returnTo=${encodeURIComponent(chainPageHref)}`
	);
	const transferQuestions = $derived(
		data.questions.filter((question) => question.id !== data.question.id)
	);
	const isEnglish = $derived(isEnglishSubject(data.question.meta.subject));
	const learnerSubject = $derived(
		learnerSubjectForQuestion({
			subject: data.question.meta.subject,
			subjectArea: data.question.meta.subjectArea,
			paper: data.question.meta.paper
		})
	);
	const topbarSubject = $derived(
		isEnglish
			? englishSubjectOrDefault(data.question.meta.subject)
			: (learnerSubject ?? data.question.meta.subject)
	);
	const topbarSubjects = [...BROWSE_SUBJECTS];
	const chainSteps = $derived(data.chain.steps.map((step) => step.short));
	const useFocusedLayout = $derived(useFocusedChainLayout(data.question.meta.subject));
	const showWeakAnswer = $derived(
		hasExplainedWeakAnswer(data.question.commonWeakAnswer, data.question.commonWeakExplanation)
	);
	const checklistLabel = $derived(
		data.question.checklistSource === 'method' ? 'Answer method' : 'Marking points'
	);
	const showMarkingPoints = $derived(
		hasDistinctMarkingPoints(data.question.checklistSource, data.question.checklist.length)
	);
</script>

<svelte:head>
	<title>{isEnglish ? 'How this earns marks' : data.chain.pageTitle} | Question Constellation</title
	>
	<meta
		name="description"
		content={isEnglish
			? 'Review the mark path for this GCSE English question and practise another question.'
			: 'See the mark-scoring method and practise related GCSE questions.'}
	/>
</svelte:head>

<main class="qc-real-app qc-chain-reveal-page">
	<AppTopbar
		user={data.user}
		subject={topbarSubject}
		subjects={topbarSubjects}
		searchPlaceholder="Search questions"
	/>

	{#if useFocusedLayout}
		<div class="qc-chain-answer-page">
			<IconBackLink href={questionHref} label="Back to question" />

			<ExamQuestionCard question={data.question} compact showTitle={false} />

			<div class="qc-chain-answer-core">
				<section class="qc-chain-answer-explanation" aria-labelledby="answer-chain-title">
					<header class="qc-chain-focus-header">
						<p class="qc-real-kicker">Answer chain</p>
						<h1 id="answer-chain-title"><MathText text={data.chain.title} /></h1>
					</header>

					{#if data.chain.illustration}
						<ChainIllustration
							illustration={data.chain.illustration}
							eager
							showCaption={false}
							expandable
						/>
					{:else}
						<ThinkingChain steps={chainSteps} label="Answer chain" showLabel={false} />
					{/if}
				</section>

				{#if data.question.modelAnswer}
					<section class="qc-answer-panel qc-chain-full-answer">
						<p class="qc-panel-label">Full-mark answer</p>
						<p><MathText text={data.question.modelAnswer} /></p>
					</section>
				{/if}
			</div>

			{#if showMarkingPoints}
				<section class="qc-answer-panel qc-mark-details" class:is-open={markingPointsOpen}>
					<button
						type="button"
						class="qc-mark-details-toggle"
						aria-expanded={markingPointsOpen}
						aria-controls="marking-points-list"
						onclick={() => (markingPointsOpen = !markingPointsOpen)}
					>
						<span class="qc-panel-label">{checklistLabel}</span>
						<span class="qc-mark-details-action">
							{markingPointsOpen ? 'Hide' : 'Show'}
							<ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
						</span>
					</button>
					{#if markingPointsOpen}
						<div
							id="marking-points-list"
							class="qc-mark-details-content"
							transition:slide={{ duration: markingPointsRevealDurationMs }}
						>
							<ol class="qc-checklist">
								{#each data.question.checklist as item, index (item.id)}
									<li>
										<span>{index + 1}</span>
										<MathText text={item.text} />
									</li>
								{/each}
							</ol>
						</div>
					{/if}
				</section>
			{/if}

			{#if showWeakAnswer}
				<section class="qc-warning-panel">
					<TriangleAlert size={19} aria-hidden="true" />
					<div class="qc-weak-answer-copy">
						<p class="qc-panel-label">Why this loses marks</p>
						<p class="qc-weak-answer-example">
							<MathText text={data.question.commonWeakAnswer} />
						</p>
						<p><MathText text={data.question.commonWeakExplanation} /></p>
					</div>
				</section>
			{/if}

			<div class="qc-action-row" aria-label="Method actions">
				{#if transferQuestions.length > 0}
					<a class="qc-action-button primary" href={constellationHref}>
						<ClipboardList size={18} aria-hidden="true" />
						See {transferQuestions.length} more
						{transferQuestions.length === 1 ? 'question' : 'questions'}
					</a>
				{:else if data.question.practiceAvailable}
					<a class="qc-action-button primary" href={currentPracticeHref}>
						<PenLine size={18} aria-hidden="true" />
						Practise this question
					</a>
				{/if}
			</div>
		</div>
	{:else}
		<div class="qc-real-layout qc-question-layout">
			<aside
				class="qc-context-rail qc-real-rail qc-question-rail"
				aria-label="Questions using this method"
			>
				<IconBackLink href={questionHref} label="Back to question" />
				<p class="qc-real-kicker">Method</p>
				<h1><MathText text={data.chain.title} /></h1>
				<p class="qc-rail-summary"><MathText text={data.chain.summary} /></p>
				<ThinkingChain
					steps={chainSteps}
					label="Method"
					note={isEnglish ? 'Use the order, then put it into exam language.' : ''}
				/>
				<nav class="qc-real-chain-list" aria-label="Practice transfer questions">
					{#each data.questions as question, index (question.id)}
						<a class:active={question.id === data.question.id} href={questionDestination(question)}>
							<span>{index + 1}</span>
							<span><MathText text={question.title} /></span>
							<small>{question.distanceLabel} · {question.meta.marks} marks</small>
						</a>
					{/each}
				</nav>
			</aside>

			<section class="qc-real-main qc-chain-reveal-main" aria-label="Method">
				<div class="qc-real-question-top">
					<div>
						<p><MathText text={data.question.sourceRef} /></p>
						<h2>How this earns marks</h2>
					</div>
					{#if data.question.practiceAvailable}
						<a class="qc-real-link-button" href={currentPracticeHref}>Practise this question</a>
					{/if}
				</div>

				{#if data.chain.illustration}
					<ChainIllustration illustration={data.chain.illustration} eager />
				{/if}

				{#if data.question.modelAnswer}
					<section class="qc-answer-panel">
						<p class="qc-panel-label">Model answer</p>
						<p><MathText text={data.question.modelAnswer} /></p>
					</section>
				{/if}

				{#if showMarkingPoints}
					<section class="qc-answer-panel">
						<p class="qc-panel-label">{checklistLabel}</p>
						<ol class="qc-checklist">
							{#each data.question.checklist as item, index (item.id)}
								<li>
									<span>{index + 1}</span>
									<MathText text={item.text} />
								</li>
							{/each}
						</ol>
					</section>
				{/if}

				{#if showWeakAnswer}
					<section class="qc-warning-panel">
						<TriangleAlert size={19} aria-hidden="true" />
						<div>
							<p class="qc-panel-label">Why this loses marks</p>
							<p class="qc-weak-answer-example">
								<MathText text={data.question.commonWeakAnswer} />
							</p>
							<p><MathText text={data.question.commonWeakExplanation} /></p>
						</div>
					</section>
				{/if}

				<ExamQuestionCard question={data.question} compact showTitle={false} />

				<div class="qc-action-row" aria-label="Method actions">
					{#if transferQuestions.length > 0}
						<a class="qc-action-button primary" href={constellationHref}>
							<ClipboardList size={18} aria-hidden="true" />
							See related questions
						</a>
					{/if}
					{#if data.practiceQuestion.practiceAvailable}
						<a
							class:primary={transferQuestions.length === 0}
							class="qc-action-button"
							href={practiceHref}
						>
							<PenLine size={18} aria-hidden="true" />
							Start practice
						</a>
					{/if}
				</div>
			</section>
		</div>
	{/if}
</main>
