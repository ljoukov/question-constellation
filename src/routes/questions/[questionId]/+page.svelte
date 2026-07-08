<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault, isEnglishSubject } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { BookOpen, ListChecks, PenLine, Route } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const canonicalUrl = $derived(
		`https://constellation.eviworld.com/questions/${encodeURIComponent(data.question.id)}`
	);
	const chainHref = $derived(
		resolve('/questions/[questionId]/chain', { questionId: data.question.id })
	);
	const practiceHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.question.id })
	);
	const isEnglish = $derived(isEnglishSubject(data.question.meta.subject));
	const topbarSubject = $derived(
		isEnglish ? englishSubjectOrDefault(data.question.meta.subject) : data.question.meta.subject
	);
	const topbarSubjects = [...BROWSE_SUBJECTS];
	const finderHref = $derived(
		`${resolve('/chains')}?subject=${encodeURIComponent(topbarSubject)}`
	);
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
			: 'Attempt a GCSE question first, then see the method when ready.'}
	/>
	<link rel="canonical" href={canonicalUrl} />
</svelte:head>

<main class="qc-real-app qc-question-page">
	<AppTopbar
		subject={topbarSubject}
		subjects={topbarSubjects}
		searchPlaceholder="Search questions"
	/>

	<div class="qc-real-layout qc-question-layout">
		<aside class="qc-real-rail qc-question-rail" aria-label="Question route">
			<IconBackLink
				href={finderHref}
				label="Back to question finder"
			/>
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
					<span>Method</span>
					<small>See how the marks build</small>
				</a>
				<a href={practiceHref}>
					<span>3</span>
					<span>Practice/check</span>
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
					Show method
				</a>
			</div>

			<ExamQuestionCard question={data.question} assetLoading="eager" />

			<div class="qc-action-row" aria-label="Question actions">
				<a class="qc-action-button primary" href={chainHref}>
					<Route size={18} aria-hidden="true" />
					Show method
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
						The model answer and mark checklist appear on the method and practice steps.
					</p>
				</div>
			</section>
		</section>
	</div>
</main>
