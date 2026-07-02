<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { BookOpen, ListChecks, PenLine, Route } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const chainHref = $derived(
		resolve('/questions/[questionId]/chain', { questionId: data.question.id })
	);
	const practiceHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.question.id })
	);
	const englishHref = $derived(resolve('/english'));
	const isEnglish = $derived(data.question.meta.subject.toLowerCase().includes('english'));
	const topbarSubject = $derived(isEnglish ? 'English' : data.question.meta.subject);
	const topbarSubjects = [
		'All subjects',
		'Science',
		'Biology',
		'Chemistry',
		'Physics',
		'Computer Science',
		'English'
	];
	const topicLabel = $derived(data.question.meta.topic.split(':')[0] ?? data.question.meta.topic);
	const metaItems = $derived(
		[
			data.question.meta.board,
			data.question.meta.qualification,
			data.question.meta.subject,
			data.question.meta.paper,
			`${data.question.meta.marks} marks`,
			data.question.meta.questionType
		].filter(Boolean)
	);
	const learningGoal = $derived(
		data.question.meta.subject.toLowerCase().includes('english')
			? 'Build an answer that stays on the question, uses precise evidence, explains methods, and links back to the wider text.'
			: 'Build a mark-scoring answer by making every required link explicit before you check it.'
	);
</script>

<svelte:head>
	<title>{data.question.title} | Question Constellation</title>
	<meta
		name="description"
		content={isEnglish
			? 'Attempt a GCSE English question first, then review the mark path and practise.'
			: 'Attempt a GCSE question first, then reveal the answer chain when ready.'}
	/>
	<link rel="canonical" href={questionHref} />
</svelte:head>

<main class="qc-real-app qc-question-page">
	<AppTopbar
		subject={topbarSubject}
		subjects={topbarSubjects}
		searchPlaceholder="Search questions"
	/>

	<div class="qc-real-layout qc-question-layout">
		<aside class="qc-real-rail qc-question-rail" aria-label="Question route">
			<a class="qc-real-quiet-link" href={topbarSubject === 'English' ? englishHref : resolve('/')}>
				Back to question finder
			</a>
			<p class="qc-real-kicker">
				<MathText text={`${data.question.meta.qualification} ${data.question.meta.subject}`} />
			</p>
			<h1><MathText text={data.question.title} /></h1>
			<div class="qc-question-meta-stack" aria-label="Exam metadata">
				{#each metaItems as item (item)}
					<span><MathText text={item} /></span>
				{/each}
			</div>
			<nav class="qc-real-chain-list" aria-label="Question learning route">
				<a class="active" href={questionHref}>
					<span>1</span>
					<span>Question</span>
					<small>Read the task first</small>
				</a>
				<a href={chainHref}>
					<span>2</span>
					<span>{isEnglish ? 'Mark path' : 'Answer chain'}</span>
					<small>{isEnglish ? 'See how marks build' : 'Reveal the reusable marks'}</small>
				</a>
				<a href={practiceHref}>
					<span>3</span>
					<span>Practice</span>
					<small>Write, check, repair</small>
				</a>
			</nav>
		</aside>

		<section class="qc-real-main qc-question-main" aria-label="Question">
			<div class="qc-real-question-top">
				<div>
					<p><MathText text={`${data.question.sourceRef} · ${topicLabel}`} /></p>
					<h2>Start with the exam question.</h2>
				</div>
				<a class="qc-real-link-button" href={chainHref}>
					{isEnglish ? 'Show mark path' : 'Show answer chain'}
				</a>
			</div>

			<ExamQuestionCard question={data.question} assetLoading="eager" />

			<div class="qc-action-row" aria-label="Question actions">
				<a class="qc-action-button primary" href={chainHref}>
					<Route size={18} aria-hidden="true" />
					{isEnglish ? 'Show mark path' : 'Show answer chain'}
				</a>
				<a class="qc-action-button" href={practiceHref}>
					<PenLine size={18} aria-hidden="true" />
					Try without hints
				</a>
			</div>

			<section class="qc-guidance-panel">
				<div class="qc-guidance-icon"><BookOpen size={19} aria-hidden="true" /></div>
				<div>
					<p class="qc-panel-label">Learning goal</p>
					<p>{learningGoal}</p>
				</div>
			</section>

			<section class="qc-guidance-panel muted">
				<div class="qc-guidance-icon"><ListChecks size={19} aria-hidden="true" /></div>
				<div>
					<p class="qc-panel-label">Hidden for now</p>
					<p>
						The model answer and mark checklist appear on the {isEnglish
							? 'mark path'
							: 'answer-chain'} and practice steps.
					</p>
				</div>
			</section>
		</section>
	</div>
</main>
