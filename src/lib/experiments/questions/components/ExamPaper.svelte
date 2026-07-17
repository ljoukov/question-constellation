<script lang="ts">
	import BlockRenderer from './BlockRenderer.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import MathText from './MathText.svelte';
	import QuestionNumber from './QuestionNumber.svelte';
	import ResponseRenderer from './ResponseRenderer.svelte';
	import { Check, X } from '@lucide/svelte';
	import { resolvePaperDependencies } from '../paperUtils';
	import type { ExperimentQuestionGradeResult } from '../gradingTypes';
	import type { ExamPaper } from '../types';
	import type { RequestFailure } from '$lib/requestFailure';

	let {
		paper,
		answers = {},
		gradingResults = {},
		readOnly = false,
		canSubmit = false,
		isSubmitting = false,
		submitLabel = 'Submit',
		submitError = '',
		submitFailure = null,
		onAnswerChange,
		onPartActivate,
		onDismissGrade,
		onSubmitGrade,
		onRetrySubmit
	}: {
		paper: ExamPaper;
		answers?: Record<string, string>;
		gradingResults?: Record<string, ExperimentQuestionGradeResult>;
		readOnly?: boolean;
		canSubmit?: boolean;
		isSubmitting?: boolean;
		submitLabel?: string;
		submitError?: string;
		submitFailure?: RequestFailure | null;
		onAnswerChange?: (ref: string, answer: string) => void;
		onPartActivate?: (ref: string) => void;
		onDismissGrade?: (ref: string) => void;
		onSubmitGrade?: () => void;
		onRetrySubmit?: () => void;
	} = $props();

	function marksLabel(result: ExperimentQuestionGradeResult) {
		if (result.status === 'not_gradeable') return "Can't check";
		if (result.status === 'unanswered') return 'No answer';
		return `${result.awardedMarks ?? 0}/${result.maxMarks} marks`;
	}

	const showSubmit = $derived(
		Boolean(onSubmitGrade) &&
			(isSubmitting ||
				Boolean(submitError) ||
				Boolean(submitFailure) ||
				Object.keys(gradingResults).length === 0)
	);
	const displayPaper = $derived(resolvePaperDependencies(paper));
	const hasHeader = $derived(
		Boolean(displayPaper.subtitle.trim() || displayPaper.title.trim() || displayPaper.source.trim())
	);
</script>

<div class="question-experiment-page">
	<article
		class="paper-sheet"
		aria-label={displayPaper.title || displayPaper.subtitle || 'Exam question'}
	>
		{#if hasHeader}
			<header class="paper-header">
				{#if displayPaper.subtitle}
					<p>{displayPaper.subtitle}</p>
				{/if}
				{#if displayPaper.title}
					<h1>{displayPaper.title}</h1>
				{/if}
				{#if displayPaper.source}
					<p class="source-note">{displayPaper.source}</p>
				{/if}
			</header>
		{/if}

		{#each displayPaper.questions as question (question.ref)}
			<section class="main-question" aria-labelledby={`question-${question.ref}`}>
				<div class="exam-question-row exam-main-row">
					<div class="exam-number-cell">
						<QuestionNumber ref={question.ref} />
					</div>
					<div class="exam-question-body">
						<h2 id={`question-${question.ref}`} class="sr-only">Question {question.ref}</h2>
						{#each question.blocks as block (block)}
							<BlockRenderer {block} assets={displayPaper.assets} />
						{/each}
					</div>
				</div>

				{#each question.parts as part (part.ref)}
					{#if part.leadBlocks?.length}
						<div class="exam-question-row exam-lead-row">
							<div class="exam-number-cell"></div>
							<div class="exam-question-body">
								{#each part.leadBlocks as block (block)}
									<BlockRenderer {block} assets={displayPaper.assets} />
								{/each}
							</div>
						</div>
					{/if}
					<div
						class="exam-question-row exam-part-row"
						id={part.ref}
						role="group"
						aria-label={`Question ${part.ref}`}
						onfocusin={() => onPartActivate?.(part.ref)}
						onpointerdown={() => onPartActivate?.(part.ref)}
					>
						<div class="exam-number-cell">
							<QuestionNumber ref={part.ref} />
						</div>
						<div class="exam-question-body">
							{#each part.blocks as block (block)}
								<BlockRenderer {block} assets={displayPaper.assets} />
							{/each}
							<p class="marks">[{part.marks} {part.marks === 1 ? 'mark' : 'marks'}]</p>
							<ResponseRenderer
								response={part.response}
								assets={displayPaper.assets}
								answer={answers[part.ref] ?? ''}
								{readOnly}
								onAnswerChange={(answer) => onAnswerChange?.(part.ref, answer)}
							/>
							{#if gradingResults[part.ref]}
								{@const grade = gradingResults[part.ref]}
								<section
									class="experiment-grade-card"
									class:correct={grade.result === 'correct'}
									class:partial={grade.result === 'partial'}
									class:incorrect={grade.result === 'incorrect'}
									class:ungraded={grade.status === 'not_gradeable' || grade.status === 'unanswered'}
									aria-label={`Feedback for question ${part.ref}`}
								>
									<header class="grade-card-header">
										<div class="grade-card-title">
											<p class="grade-card-label">Feedback</p>
											{#if grade.checklist.length}
												<p class="grade-mark-total">{marksLabel(grade)}</p>
											{:else}
												<h3><MathText text={grade.summary} /></h3>
											{/if}
										</div>
										<button
											type="button"
											class="grade-close-button"
											aria-label={`Close feedback for question ${part.ref}`}
											onclick={() => onDismissGrade?.(part.ref)}
										>
											Hide
										</button>
									</header>

									{#if grade.checklist.length}
										{#if grade.summary}
											<p class="grade-summary"><MathText text={grade.summary} /></p>
										{/if}
										<ul
											class="grade-mark-list"
											aria-label={`Mark breakdown for question ${part.ref}`}
										>
											{#each grade.checklist as item (item.id)}
												<li class={item.verdict}>
													<span class="grade-mark-icon" aria-hidden="true">
														{#if item.verdict === 'credited'}
															<Check size={14} strokeWidth={2.6} />
														{:else}
															<X size={14} strokeWidth={2.6} />
														{/if}
													</span>
													<span>
														<span class="grade-mark-text"><MathText text={item.text} /></span>
														{#if item.explanation && item.explanation !== item.text}
															<span class="grade-mark-note"
																><MathText text={item.explanation} /></span
															>
														{/if}
													</span>
												</li>
											{/each}
										</ul>
									{:else if grade.nextStep && grade.result !== 'incorrect'}
										<p class="grade-next-step"><MathText text={grade.nextStep} /></p>
									{/if}

									{#if grade.modelAnswer}
										<div class="grade-model-answer">
											<p class="grade-model-answer-label">Model answer</p>
											<p><MathText text={grade.modelAnswer} /></p>
										</div>
									{/if}
								</section>
							{/if}
							{#if part.afterResponseBlocks?.length}
								<div class="after-response-blocks">
									{#each part.afterResponseBlocks as block (block)}
										<BlockRenderer {block} assets={displayPaper.assets} />
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</section>
		{/each}

		{#if showSubmit}
			<section class="grading-shell" aria-label="Question grading controls">
				<button
					type="button"
					class="submit-grade-button"
					disabled={!canSubmit}
					onclick={() => onSubmitGrade?.()}
				>
					{submitLabel}
				</button>
				{#if submitError}
					<p class="submit-error">{submitError}</p>
				{/if}
				{#if submitFailure}
					<RequestFailureNotice
						failure={submitFailure}
						onRetry={onRetrySubmit ?? onSubmitGrade}
						retrying={isSubmitting}
						retryLabel="Retry check"
						compact
					/>
				{/if}
			</section>
		{/if}
	</article>
</div>

<style>
	.question-experiment-page {
		--qc-response-ink: var(--qc-ui-text);
		--qc-response-line: var(--qc-ui-border-strong);
		--qc-response-control-bg: var(--qc-ui-surface-raised);
		--qc-response-selected-bg: var(--qc-ui-surface-muted);
		--qc-response-muted: var(--qc-ui-text-muted);
		--qc-response-caret: var(--qc-ui-accent);
		flex: 1 1 auto;
		min-height: 0;
		box-sizing: border-box;
		width: 100%;
		padding: 1.5rem 1rem 0.75rem;
		background: var(--qc-ui-canvas);
		color: var(--qc-ui-text);
	}

	.paper-sheet {
		width: min(100%, 900px);
		margin: 0 auto;
		padding: 2.2rem 2rem 1.25rem;
		background: var(--qc-ui-surface);
		color: var(--qc-ui-text);
		font-family: Arial, Helvetica, sans-serif;
		font-size: 15px;
		line-height: 1.45;
	}

	.paper-header {
		margin-bottom: 2.2rem;
		border-bottom: 1px solid var(--qc-ui-border-strong);
		padding-bottom: 1rem;
	}

	.paper-header h1,
	.paper-header p {
		margin: 0;
	}

	.paper-header h1 {
		margin-top: 0.35rem;
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.source-note {
		margin-top: 0.4rem;
		font-size: 0.86rem;
	}

	.main-question {
		margin: 0 0 1.1rem;
		break-inside: avoid;
	}

	.exam-question-row {
		display: grid;
		grid-template-columns: 6.6rem minmax(0, 1fr);
		gap: 1.15rem;
		align-items: start;
		min-height: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}

	.exam-main-row {
		margin-bottom: 1.35rem;
	}

	.exam-lead-row {
		margin: 0.8rem 0 1.05rem;
	}

	.exam-part-row {
		margin: 1.55rem 0;
	}

	.exam-number-cell {
		padding-top: 0.1rem;
	}

	.exam-question-body {
		min-width: 0;
	}

	.marks {
		margin: 0.2rem 0 0.35rem;
		text-align: right;
		font-weight: 700;
	}

	.after-response-blocks {
		margin-top: 1.35rem;
	}

	.grading-shell {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		justify-content: flex-end;
		margin: 0.25rem 0 1.25rem;
		background: var(--qc-ui-surface);
		color: var(--qc-ui-text);
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	.submit-grade-button {
		min-width: 7.5rem;
		border: 0;
		border-radius: 7px;
		padding: 0.62rem 0.95rem;
		background: var(--qc-ui-accent);
		color: var(--qc-ui-on-accent);
		font: inherit;
		font-weight: 850;
		cursor: pointer;
		box-shadow: 0 8px 18px var(--qc-ui-shadow);
	}

	.submit-grade-button:disabled {
		background: var(--qc-ui-disabled-surface);
		color: var(--qc-ui-disabled-text);
		cursor: not-allowed;
		box-shadow: none;
	}

	.submit-error {
		margin: 0;
		color: var(--qc-ui-danger);
		text-align: right;
		font-size: 0.82rem;
	}

	.experiment-grade-card {
		position: relative;
		margin: 1rem 0 0.35rem;
		padding: 0.9rem;
		border: 1px solid var(--qc-ui-border-strong);
		border-radius: 0;
		background: var(--qc-ui-surface);
		color: var(--qc-ui-text);
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		box-shadow: none;
	}

	.experiment-grade-card.correct {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	.experiment-grade-card.partial {
		border-color: var(--qc-ui-warning);
		background: var(--qc-ui-warning-surface);
	}

	.experiment-grade-card.incorrect {
		border-color: var(--qc-ui-danger);
		background: color-mix(in srgb, var(--qc-ui-danger) 9%, var(--qc-ui-surface));
	}

	.experiment-grade-card.ungraded {
		border-color: var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-secondary);
	}

	.grade-card-header {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		justify-content: space-between;
	}

	.grade-card-title {
		display: grid;
		gap: 0.18rem;
		min-width: 0;
	}

	.grade-card-label {
		margin: 0;
		color: var(--qc-ui-accent-text);
		font-size: 0.84rem;
		font-weight: 560;
		line-height: 1.22;
	}

	.grade-card-header h3,
	.grade-mark-total,
	.grade-summary,
	.grade-next-step {
		margin: 0;
	}

	.grade-mark-total {
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.3;
	}

	.grade-card-header h3 {
		font-size: 1rem;
		font-weight: 400;
		line-height: 1.3;
	}

	.grade-close-button {
		flex: 0 0 auto;
		border: 0;
		border-bottom: 1px dotted currentColor;
		border-radius: 0;
		background: transparent;
		color: var(--qc-ui-text-muted);
		font: inherit;
		font-size: 0.82rem;
		font-weight: 400;
		line-height: 1.2;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}

	.grade-close-button:hover,
	.grade-close-button:focus-visible {
		color: var(--qc-ui-text);
	}

	.grade-next-step {
		margin-top: 0.65rem;
		font-size: 0.93rem;
	}

	.grade-summary {
		margin-top: 0.55rem;
		color: var(--qc-ui-text-secondary);
		font-size: 0.92rem;
		line-height: 1.38;
	}

	.grade-mark-list {
		display: grid;
		gap: 0.35rem;
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
	}

	.grade-mark-list li {
		display: grid;
		grid-template-columns: 1.35rem minmax(0, 1fr);
		gap: 0.45rem;
		align-items: start;
		font-size: 0.92rem;
		line-height: 1.35;
		font-weight: 400;
	}

	.grade-mark-icon {
		display: inline-grid;
		place-items: center;
		width: 1rem;
		height: 1rem;
		margin-top: 0.08rem;
		border-radius: 50%;
	}

	.grade-mark-list li.credited .grade-mark-icon {
		color: var(--qc-ui-accent);
	}

	.grade-mark-list li.missed .grade-mark-icon,
	.grade-mark-list li.uncertain .grade-mark-icon {
		color: var(--qc-ui-danger);
	}

	.grade-mark-text,
	.grade-mark-note {
		display: block;
	}

	.grade-mark-note {
		margin-top: 0.12rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.86rem;
	}

	.grade-model-answer {
		margin-top: 0.85rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
		padding-top: 0.72rem;
		font-size: 0.92rem;
		line-height: 1.42;
	}

	.grade-model-answer p {
		margin: 0;
	}

	.grade-model-answer p + p {
		margin-top: 0.3rem;
	}

	.grade-model-answer-label {
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 720px) {
		.question-experiment-page {
			padding: 0.75rem 0.55rem 2rem;
			overflow-x: hidden;
		}

		.paper-sheet {
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
			padding: 1.2rem 0.75rem 2rem;
			font-size: 15px;
		}

		.exam-question-row {
			grid-template-columns: 4.8rem minmax(0, 1fr);
			gap: 0.75rem;
		}
	}

	@media (max-width: 520px) {
		.question-experiment-page {
			padding: 0.55rem 0.4rem 1.8rem;
			width: 100%;
			max-width: 100%;
			min-width: 0;
		}

		.paper-sheet {
			width: 100%;
			max-width: 100%;
			padding: 0.9rem 0.65rem 1.8rem;
			overflow: hidden;
		}

		.paper-header {
			margin-bottom: 1.4rem;
		}

		.exam-question-row {
			width: 100%;
			max-width: 100%;
			grid-template-columns: minmax(0, 1fr);
			gap: 0.45rem;
		}

		.main-question,
		.exam-question-body {
			width: 100%;
			max-width: 100%;
			min-width: 0;
			overflow-wrap: anywhere;
		}

		.exam-main-row {
			margin-bottom: 1.05rem;
		}

		.exam-lead-row {
			margin: 0.75rem 0 0.95rem;
		}

		.exam-part-row {
			margin: 1.25rem 0;
		}

		.exam-number-cell {
			padding-top: 0;
		}

		.experiment-grade-card {
			margin-right: 0.15rem;
			padding-right: 0.85rem;
		}
	}
</style>
