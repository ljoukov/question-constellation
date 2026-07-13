<script lang="ts">
	import { resolve } from '$app/paths';
	import ChainIllustration from '$lib/chains/ChainIllustration.svelte';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import { hasExplainedWeakAnswer, useIllustratedChainLayout } from '$lib/chains/chainPresentation';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault, isEnglishSubject } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { ChevronDown, ClipboardList, PenLine, TriangleAlert } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const practiceHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.practiceQuestion.id })
	);
	const currentPracticeHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.question.id })
	);
	const constellationHref = $derived(
		resolve('/constellations/[chainId]', { chainId: data.chain.id })
	);
	const isEnglish = $derived(isEnglishSubject(data.question.meta.subject));
	const topbarSubject = $derived(
		isEnglish ? englishSubjectOrDefault(data.question.meta.subject) : data.question.meta.subject
	);
	const topbarSubjects = [...BROWSE_SUBJECTS];
	const chainSteps = $derived(data.chain.steps.map((step) => step.short));
	const useFocusedLayout = $derived(
		useIllustratedChainLayout(data.question.meta.subject, data.chain.illustration)
	);
	const showWeakAnswer = $derived(
		hasExplainedWeakAnswer(data.question.commonWeakAnswer, data.question.commonWeakExplanation)
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
		showNavigation
	/>

	{#if useFocusedLayout}
		<div class="qc-chain-answer-page">
			<IconBackLink href={questionHref} label="Back to question" />

			<ExamQuestionCard question={data.question} compact showTitle={false} />

			<section class="qc-chain-answer-explanation" aria-labelledby="answer-chain-title">
				<header class="qc-chain-focus-header">
					<p class="qc-real-kicker">Answer chain</p>
					<h1 id="answer-chain-title"><MathText text={data.chain.title} /></h1>
				</header>

				{#if data.chain.illustration}
					<ChainIllustration
						illustration={data.chain.illustration}
						showCaption={false}
						expandable
					/>
				{/if}
			</section>

			<section class="qc-answer-panel">
				<p class="qc-panel-label">Full-mark answer</p>
				<p><MathText text={data.question.modelAnswer} /></p>
			</section>

			<details class="qc-answer-panel qc-mark-details">
				<summary>
					<span class="qc-panel-label">Marking points</span>
					<span class="qc-mark-details-action">
						Show {data.question.checklist.length}
						<ChevronDown size={17} strokeWidth={2} aria-hidden="true" />
					</span>
				</summary>
				<ol class="qc-checklist">
					{#each data.question.checklist as item, index (item.id)}
						<li>
							<span>{index + 1}</span>
							<MathText text={item.text} />
						</li>
					{/each}
				</ol>
			</details>

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
				<a class="qc-action-button primary" href={constellationHref}>
					<ClipboardList size={18} aria-hidden="true" />
					Choose another question
				</a>
			</div>
		</div>
	{:else}
		<div class="qc-real-layout qc-question-layout">
			<aside class="qc-real-rail qc-question-rail" aria-label="Questions using this method">
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
						<a
							class:active={question.id === data.question.id}
							href={resolve('/questions/[questionId]/practice', { questionId: question.id })}
						>
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
					<a class="qc-real-link-button" href={currentPracticeHref}>Practise this question</a>
				</div>

				{#if data.chain.illustration}
					<ChainIllustration illustration={data.chain.illustration} />
				{/if}

				<section class="qc-answer-panel">
					<p class="qc-panel-label">Model answer</p>
					<p><MathText text={data.question.modelAnswer} /></p>
				</section>

				<section class="qc-answer-panel">
					<p class="qc-panel-label">Mark checklist</p>
					<ol class="qc-checklist">
						{#each data.question.checklist as item, index (item.id)}
							<li>
								<span>{index + 1}</span>
								<MathText text={item.text} />
							</li>
						{/each}
					</ol>
				</section>

				<section class="qc-warning-panel">
					<TriangleAlert size={19} aria-hidden="true" />
					<div>
						<p class="qc-panel-label">Common weak answer</p>
						<p><MathText text={data.question.commonWeakAnswer} /></p>
					</div>
				</section>

				<ExamQuestionCard question={data.question} compact showTitle={false} />

				<div class="qc-action-row" aria-label="Method actions">
					<a class="qc-action-button primary" href={constellationHref}>
						<ClipboardList size={18} aria-hidden="true" />
						Open constellation
					</a>
					<a class="qc-action-button" href={practiceHref}>
						<PenLine size={18} aria-hidden="true" />
						Start practice
					</a>
				</div>
			</section>
		</div>
	{/if}
</main>
