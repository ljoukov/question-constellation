<script lang="ts">
	import { resolve } from '$app/paths';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { ClipboardList, PenLine, TriangleAlert } from '@lucide/svelte';
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
	const isEnglish = $derived(data.question.meta.subject.toLowerCase().includes('english'));
	const topbarSubject = $derived(isEnglish ? 'English' : data.question.meta.subject);
	const topbarSubjects = [
		'All subjects',
		'Science',
		'Biology',
		'Chemistry',
		'Physics',
		'Computer Science',
		'Geography',
		'History',
		'English'
	];
	const chainSteps = $derived(data.chain.steps.map((step) => step.short));
</script>

<svelte:head>
	<title>{isEnglish ? 'How this earns marks' : data.chain.pageTitle} | Question Constellation</title
	>
	<meta
		name="description"
		content={isEnglish
			? 'Review the mark path for this GCSE English question and practise another question.'
			: 'Reveal the answer chain and see how it transfers to related GCSE questions.'}
	/>
</svelte:head>

<main class="qc-real-app qc-chain-reveal-page">
	<AppTopbar
		subject={topbarSubject}
		subjects={topbarSubjects}
		searchPlaceholder="Search questions"
	/>

	<div class="qc-real-layout qc-question-layout">
		<aside
			class="qc-real-rail qc-question-rail"
			aria-label={isEnglish ? 'Questions using this mark path' : 'Questions using this chain'}
		>
			<IconBackLink href={questionHref} label="Back to question" />
			<p class="qc-real-kicker">{isEnglish ? 'Mark path' : 'Answer chain'}</p>
			<h1><MathText text={data.chain.title} /></h1>
			<p class="qc-rail-summary"><MathText text={data.chain.summary} /></p>
			<ThinkingChain
				steps={chainSteps}
				label={isEnglish ? 'Mark path' : 'Answer chain'}
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

		<section
			class="qc-real-main qc-chain-reveal-main"
			aria-label={isEnglish ? 'Mark path' : 'Answer chain'}
		>
			<div class="qc-real-question-top">
				<div>
					<p><MathText text={data.question.sourceRef} /></p>
					<h2>{isEnglish ? 'How this earns marks' : 'Same answer chain'}</h2>
				</div>
				<a class="qc-real-link-button" href={currentPracticeHref}>Practise this question</a>
			</div>

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

			<div
				class="qc-action-row"
				aria-label={isEnglish ? 'Mark path actions' : 'Answer chain actions'}
			>
				<a class="qc-action-button primary" href={constellationHref}>
					<ClipboardList size={18} aria-hidden="true" />
					{isEnglish ? 'Open question set' : 'Open constellation'}
				</a>
				<a class="qc-action-button" href={practiceHref}>
					<PenLine size={18} aria-hidden="true" />
					Start practice
				</a>
			</div>
		</section>
	</div>
</main>
