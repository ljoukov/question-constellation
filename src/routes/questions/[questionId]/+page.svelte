<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { BROWSE_SUBJECTS } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { learnerSubjectForQuestion } from '$lib/learning/subjects';
	import {
		ArrowRight,
		BookOpenCheck,
		ChevronDown,
		CircleAlert,
		TriangleAlert
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const learnerSubject = $derived(
		learnerSubjectForQuestion({
			subject: data.question.meta.subject,
			subjectArea: data.question.meta.subjectArea,
			paper: data.question.meta.paper
		}) ?? data.question.meta.subject
	);
	const browseHref = $derived(
		`${resolve('/questions')}?subject=${encodeURIComponent(learnerSubject)}`
	);
	const browseLabel = $derived(`Back to ${learnerSubject} questions`);
	const questionPath = $derived(`/questions/${encodeURIComponent(data.question.id)}`);
	const practiceHref = $derived(
		`${resolve('/questions/[questionId]/practice', { questionId: data.question.id })}?entry=question&returnTo=${encodeURIComponent(questionPath)}` as ResolvedPathname
	);
	const hasRelatedPracticeQuestion = $derived(
		data.practiceQuestion.practiceAvailable && data.practiceQuestion.id !== data.question.id
	);
	const relatedPracticeHref = $derived(
		`${resolve('/questions/[questionId]/practice', {
			questionId: data.practiceQuestion.id
		})}?entry=related&returnTo=${encodeURIComponent(questionPath)}` as ResolvedPathname
	);
	const contextLine = $derived(
		[
			data.question.meta.board,
			data.question.meta.qualification,
			data.question.meta.subject,
			data.question.meta.tier
		]
			.filter(Boolean)
			.join(' · ')
	);
	const hasMarkingGuide = $derived(
		data.question.checklist.length > 0 ||
			Boolean(data.question.modelAnswer.trim()) ||
			Boolean(data.question.commonWeakAnswer.trim() && data.question.commonWeakExplanation.trim())
	);
	const markingGuideTitle = $derived(
		data.question.checklistSource === 'method'
			? 'What a strong answer needs'
			: 'Marking points'
	);
</script>

<svelte:head>
	<title>{data.question.title} | Question Constellation</title>
	<meta
		name="description"
		content={`Answer ${data.question.sourceRef}, then check it against the marking points and a full-mark answer.`}
	/>
	<link
		rel="canonical"
		href={`https://constellation.eviworld.com/questions/${encodeURIComponent(data.question.id)}`}
	/>
</svelte:head>

<main class="qc-real-app qc-public-question-page">
	<AppTopbar user={data.user} subject={learnerSubject} subjects={[...BROWSE_SUBJECTS]} />

	<div class="qc-public-question-shell">
		<IconBackLink href={browseHref} label={browseLabel} />

		<header class="qc-public-question-header">
			<p class="qc-real-kicker"><MathText text={contextLine} /></p>
			<h1><MathText text={data.question.title} /></h1>
		</header>

		<ExamQuestionCard
			question={data.question}
			showTitle={false}
			showMeta={false}
			assetLoading="eager"
		/>

		{#if !data.practiceAvailable && data.question.practiceUnavailableReason}
			<section class="qc-warning-panel" aria-label="Practice unavailable">
				<CircleAlert size={19} aria-hidden="true" />
				<div>
					<p class="qc-panel-label">Practice unavailable</p>
					<p><MathText text={data.question.practiceUnavailableReason} /></p>
				</div>
			</section>
		{/if}

		<div class="qc-public-question-choice">
			<p>Write your answer first. You can study the marking guidance whenever you need it.</p>
			<div class="qc-public-question-actions" aria-label="Question actions">
				{#if data.practiceAvailable}
					<a class="qc-action-button primary" href={practiceHref}>
						Answer this question
						<ArrowRight size={18} aria-hidden="true" />
					</a>
				{/if}
			</div>
		</div>

		{#if hasMarkingGuide}
			<details class="qc-question-marking-guide">
				<summary>
					<span class="qc-question-marking-guide-icon">
						<BookOpenCheck size={19} aria-hidden="true" />
					</span>
					<span>
						<strong>Study the marking</strong>
						<small>See what earns credit and compare it with a full-mark answer.</small>
					</span>
					<ChevronDown size={19} aria-hidden="true" />
				</summary>

				<div class="qc-question-marking-guide-content">
					{#if data.question.checklist.length > 0}
						<section class="qc-answer-panel">
							<p class="qc-panel-label">{markingGuideTitle}</p>
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

					{#if data.question.modelAnswer.trim()}
						<section class="qc-answer-panel">
							<p class="qc-panel-label">Full-mark answer</p>
							<p><MathText text={data.question.modelAnswer} /></p>
						</section>
					{/if}

					{#if data.question.commonWeakAnswer.trim() && data.question.commonWeakExplanation.trim()}
						<section class="qc-warning-panel">
							<TriangleAlert size={19} aria-hidden="true" />
							<div>
								<p class="qc-panel-label">Why this answer loses marks</p>
								<p class="qc-weak-answer-example">
									<MathText text={data.question.commonWeakAnswer} />
								</p>
								<p><MathText text={data.question.commonWeakExplanation} /></p>
							</div>
						</section>
					{/if}

					<div class="qc-action-row" aria-label="Marking-guide actions">
						{#if data.practiceAvailable}
							<a class="qc-action-button primary" href={practiceHref}>
								Answer this question
								<ArrowRight size={18} aria-hidden="true" />
							</a>
						{/if}
						{#if hasRelatedPracticeQuestion}
							<a class="qc-action-button" href={relatedPracticeHref}>
								Try a related question
							</a>
						{/if}
					</div>
				</div>
			</details>
		{/if}
	</div>
</main>
