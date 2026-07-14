<script lang="ts">
	import { resolve } from '$app/paths';
	import { authStartHref } from '$lib/authReturn';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import { BROWSE_SUBJECTS, canonicalEnglishSubject } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { createActivityId, responseDurationMs } from '$lib/learning/activityTiming';
	import { learnerSubjectHref } from '$lib/learning/subjects';
	import { ArrowRight, CheckCircle2, ChevronDown, CircleAlert, RotateCcw } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import type { PageProps } from './$types';
	import {
		classifyRequestFailure,
		fetchWithResponseTimeout,
		requestErrorFromResponse,
		type RequestFailure
	} from '$lib/requestFailure';

	type FieldStatus = 'idle' | 'checking' | 'correct' | 'partial' | 'incorrect' | 'error';
	type FieldResult = {
		status: FieldStatus;
		feedback: string;
		failure?: RequestFailure | null;
	};
	type Phase = 'build' | 'compose' | 'feedback';
	type FinalResult = {
		status: 'ok';
		awardedMarks: number;
		maxMarks: number;
		summary: string;
		presentStepIds: string[];
		missingStepIds: string[];
		gapClosed: boolean;
	};

	let { data }: PageProps = $props();

	let phase = $state<Phase>('build');
	let activeGapId = $state('');
	let answerOverrides = $state<Record<string, string>>({});
	let fieldResultOverrides = $state<Record<string, FieldResult>>({});
	let finalAnswer = $state('');
	let finalResult = $state<FinalResult | null>(null);
	let finalFailure = $state<RequestFailure | null>(null);
	let checkingFinal = $state(false);
	let modelAnswerOpen = $state(false);
	let hydratedGapId = $state('');
	let resultPanel: HTMLElement | undefined = $state();
	let focusedResultSignature = '';
	let activitySessionId = createActivityId('gap-session');
	let responseStartedAt = Date.now();
	let pendingSubmissionId = '';
	let pendingSubmissionSignature = '';
	let pendingResponseDurationMs: number | null = null;
	const gapStorageKey = $derived(
		`question-constellation:gap-practice:v2:${data.gapData.gap.id}:${encodeURIComponent(data.gapData.gap.updatedAt)}`
	);

	const questions = $derived(data.gapData.presentation.questions);
	const defaultAnswers = $derived(
		Object.fromEntries(questions.map((question) => [question.id, '']))
	);
	const defaultFieldResults = $derived(
		Object.fromEntries(
			questions.map((question) => [question.id, { status: 'idle', feedback: '' }])
		) as Record<string, FieldResult>
	);
	const answers = $derived({ ...defaultAnswers, ...answerOverrides });
	const fieldResults = $derived({ ...defaultFieldResults, ...fieldResultOverrides } as Record<
		string,
		FieldResult
	>);

	const subject = $derived(
		subjectFromGapText(`${data.gapData.gap.meta} ${data.gapData.subjectLabel}`)
	);
	const allFieldsFilled = $derived(questions.every((question) => answers[question.id]?.trim()));
	const checkingFields = $derived(
		Object.values(fieldResults).some((result) => result.status === 'checking')
	);
	const presentSteps = $derived(new Set(finalResult?.presentStepIds ?? []));
	const missingSteps = $derived(new Set(finalResult?.missingStepIds ?? []));
	const sourceHref = $derived(data.gapData.question.href ?? resolve('/'));
	const chainHref = $derived(data.gapData.chain.href);
	const subjectHref = $derived(learnerSubjectHref(subject));
	const followUpHref = $derived(data.gapData.followUpQuestion?.href ?? subjectHref);

	function subjectFromGapText(value: string) {
		const englishSubject = canonicalEnglishSubject(value);
		if (englishSubject) return englishSubject;
		if (value.includes('Chemistry')) return 'Chemistry';
		if (value.includes('Physics')) return 'Physics';
		if (value.includes('Computer Science')) return 'Computer Science';
		if (value.includes('Geography')) return 'Geography';
		if (value.includes('History')) return 'History';
		return 'Biology';
	}

	$effect.pre(() => {
		if (activeGapId === data.gapData.gap.id) return;
		activeGapId = data.gapData.gap.id;
		answerOverrides = {};
		fieldResultOverrides = {};
		finalAnswer = '';
		finalResult = null;
		finalFailure = null;
		checkingFinal = false;
		modelAnswerOpen = false;
		activitySessionId = createActivityId('gap-session');
		responseStartedAt = Date.now();
		pendingSubmissionId = '';
		pendingSubmissionSignature = '';
		pendingResponseDurationMs = null;
		phase = 'build';
	});

	$effect(() => {
		if (
			typeof window === 'undefined' ||
			hydratedGapId !== data.gapData.gap.id ||
			activeGapId !== data.gapData.gap.id
		)
			return;
		persistGapState();
	});

	$effect(() => {
		if (typeof window === 'undefined' || hydratedGapId === data.gapData.gap.id) return;
		const gapId = data.gapData.gap.id;
		try {
			const stored = JSON.parse(window.sessionStorage.getItem(gapStorageKey) ?? 'null') as {
				phase?: Phase;
				answers?: Record<string, string>;
				fieldResults?: Record<string, FieldResult>;
				finalAnswer?: string;
				finalResult?: FinalResult | null;
				activitySessionId?: string;
				responseStartedAt?: number;
				pendingSubmissionId?: string;
				pendingSubmissionSignature?: string;
				pendingResponseDurationMs?: number | null;
			} | null;
			if (stored) {
				answerOverrides = stored.answers ?? {};
				fieldResultOverrides = stored.fieldResults ?? {};
				finalAnswer = stored.finalAnswer ?? '';
				finalResult = stored.finalResult ?? null;
				activitySessionId = stored.activitySessionId || activitySessionId;
				responseStartedAt = stored.responseStartedAt ?? responseStartedAt;
				pendingSubmissionId = stored.pendingSubmissionId ?? '';
				pendingSubmissionSignature = stored.pendingSubmissionSignature ?? '';
				pendingResponseDurationMs = stored.pendingResponseDurationMs ?? null;
				phase = stored.phase ?? 'build';
			}
		} catch {
			// Start clean if this browser cannot read the saved practice state.
		} finally {
			hydratedGapId = gapId;
		}
	});

	$effect(() => {
		if (phase !== 'feedback' || !finalResult || !resultPanel || typeof window === 'undefined')
			return;
		const signature = `${data.gapData.gap.id}:${finalAnswer}:${finalResult.awardedMarks}`;
		if (signature === focusedResultSignature) return;
		focusedResultSignature = signature;
		window.requestAnimationFrame(() => {
			resultPanel?.focus({ preventScroll: true });
			resultPanel?.scrollIntoView({ block: 'start', behavior: 'auto' });
		});
	});

	function persistGapState() {
		if (typeof window === 'undefined') return;
		try {
			window.sessionStorage.setItem(
				gapStorageKey,
				JSON.stringify({
					phase,
					answers: answerOverrides,
					fieldResults: fieldResultOverrides,
					finalAnswer,
					finalResult,
					activitySessionId,
					responseStartedAt,
					pendingSubmissionId,
					pendingSubmissionSignature,
					pendingResponseDurationMs
				})
			);
		} catch {
			// The current in-memory practice remains usable if storage is unavailable.
		}
	}

	function retryOrSignIn(failure: RequestFailure, retry: () => void) {
		if (failure.kind !== 'auth') {
			retry();
			return;
		}
		persistGapState();
		window.location.assign(authStartHref(`${window.location.pathname}${window.location.search}`));
	}

	function fieldResult(questionId: string): FieldResult {
		return fieldResults[questionId] ?? { status: 'idle', feedback: '' };
	}

	function updateAnswer(questionId: string, value: string) {
		answerOverrides = { ...answerOverrides, [questionId]: value };
		fieldResultOverrides = {
			...fieldResultOverrides,
			[questionId]: { status: 'idle', feedback: '', failure: null }
		};
	}

	async function checkField(questionId: string) {
		const answer = answers[questionId]?.trim() ?? '';
		if (!answer) return false;
		fieldResultOverrides = {
			...fieldResultOverrides,
			[questionId]: { status: 'checking', feedback: 'Checking...', failure: null }
		};
		try {
			const response = await fetchWithResponseTimeout(
				resolve('/api/gaps/[gapId]/guided-field-grade', { gapId: data.gapData.gap.id }),
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ questionId, answer })
				}
			);
			if (!response.ok) {
				throw await requestErrorFromResponse(response, 'Guided step check failed.');
			}
			const result = (await response.json()) as {
				status: 'ok';
				result: 'correct' | 'partial' | 'incorrect';
				feedback: string;
			};
			fieldResultOverrides = {
				...fieldResultOverrides,
				[questionId]: { status: result.result, feedback: result.feedback, failure: null }
			};
			return result.result === 'correct';
		} catch (error) {
			console.error('Gap field check failed.', error);
			fieldResultOverrides = {
				...fieldResultOverrides,
				[questionId]: {
					status: 'error',
					feedback: '',
					failure: classifyRequestFailure(error, {
						action: 'check this step',
						serverLabel: 'The answer checker'
					})
				}
			};
			return false;
		}
	}

	async function submitBuild(event: SubmitEvent) {
		event.preventDefault();
		if (!allFieldsFilled || checkingFields) return;
		let allChecksCompleted = true;
		for (const question of questions) {
			if (!(await checkField(question.id))) allChecksCompleted = false;
		}
		if (allChecksCompleted) phase = 'compose';
	}

	async function submitFinal(event?: SubmitEvent) {
		event?.preventDefault();
		const answer = finalAnswer.trim();
		if (!answer || checkingFinal) return;
		checkingFinal = true;
		modelAnswerOpen = false;
		finalFailure = null;
		finalResult = null;
		const submissionSignature = JSON.stringify({ answer, guidedAnswers: answers });
		if (!pendingSubmissionId || pendingSubmissionSignature !== submissionSignature) {
			pendingSubmissionId = createActivityId('gap-response');
			pendingSubmissionSignature = submissionSignature;
			pendingResponseDurationMs = responseDurationMs(responseStartedAt);
			persistGapState();
		}
		try {
			const response = await fetchWithResponseTimeout(
				resolve('/api/gaps/[gapId]/guided-grade', { gapId: data.gapData.gap.id }),
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						answer,
						guidedAnswers: answers,
						submissionId: pendingSubmissionId,
						sourceSessionId: activitySessionId,
						responseDurationMs: pendingResponseDurationMs
					})
				}
			);
			if (!response.ok) {
				throw await requestErrorFromResponse(response, 'Final answer check failed.');
			}
			finalResult = (await response.json()) as FinalResult;
			phase = 'feedback';
		} catch (error) {
			console.error('Gap final check failed.', error);
			finalFailure = classifyRequestFailure(error, {
				action: 'check this rewrite',
				serverLabel: 'The answer checker'
			});
		} finally {
			checkingFinal = false;
		}
	}
</script>

<svelte:head>
	<title>Close the gap | {data.gapData.chain.title}</title>
</svelte:head>

<main class="qc-real-app qc-gap-page">
	<AppTopbar
		user={data.user}
		{subject}
		subjects={[...BROWSE_SUBJECTS]}
		searchPlaceholder="Search questions"
	/>

	<div class="qc-gap-layout">
		<aside class="qc-gap-context" aria-label="Gap context">
			<p class="qc-real-kicker">{data.gapData.subjectLabel}</p>
			<h1><MathText text={data.gapData.gap.chainTitle} /></h1>
			<p><MathText text={data.gapData.gap.topic} /></p>
			<div class="qc-gap-context-actions">
				<a href={sourceHref}>Original question</a>
				<a href={chainHref}>Answer chain</a>
			</div>
		</aside>

		<section class="qc-gap-workspace" aria-label="Close the gap">
			<header class="qc-gap-header">
				<span>{subject}</span>
				<h2><MathText text={data.gapData.question.title} /></h2>
			</header>

			{#if phase === 'build'}
				<div class="qc-gap-section-bar">
					<strong>Complete the chain</strong>
					<span>{allFieldsFilled ? 'Ready' : 'In progress'}</span>
				</div>
				<form class="qc-gap-questions" onsubmit={submitBuild}>
					{#each data.gapData.presentation.questions as question, index (question.id)}
						{@const currentFieldResult = fieldResult(question.id)}
						<label class="qc-gap-question">
							<span class="qc-gap-number">{index + 1}</span>
							<span class="qc-gap-question-text"><MathText text={question.question} /></span>
							<textarea
								rows="1"
								value={answers[question.id] ?? ''}
								class={`qc-gap-short-answer ${currentFieldResult.status}`}
								placeholder="Type a short answer"
								oninput={(event) =>
									updateAnswer(question.id, (event.currentTarget as HTMLTextAreaElement).value)}
							></textarea>
							{#if currentFieldResult.failure}
								<RequestFailureNotice
									failure={currentFieldResult.failure}
									onRetry={() =>
										retryOrSignIn(currentFieldResult.failure!, () => void checkField(question.id))}
									retrying={currentFieldResult.status === 'checking'}
									retryLabel={currentFieldResult.failure.kind === 'auth'
										? 'Sign in again'
										: 'Retry step'}
									compact
								/>
							{:else if currentFieldResult.feedback}
								<small class={`qc-gap-feedback ${currentFieldResult.status}`}>
									{currentFieldResult.feedback}
								</small>
							{/if}
						</label>
					{/each}
					<footer class="qc-gap-footer">
						<span>{checkingFields ? 'Checking...' : 'Fill each step to continue.'}</span>
						<button type="submit" disabled={!allFieldsFilled || checkingFields}>Next</button>
					</footer>
				</form>
			{:else if phase === 'compose'}
				<section class="qc-gap-memory">
					<p class="qc-panel-label">Answer chain</p>
					<div>
						{#each data.gapData.chain.steps as step (step.id)}
							<span class:target={step.id === data.gapData.presentation.targetStepId}>
								<MathText text={step.short} />
							</span>
						{/each}
					</div>
				</section>
				<form class="qc-gap-compose" onsubmit={submitFinal}>
					<label for="gap-final-answer">{data.gapData.presentation.answerPrompt}</label>
					<textarea
						id="gap-final-answer"
						rows="7"
						bind:value={finalAnswer}
						placeholder="Write the improved answer..."
					></textarea>
					{#if finalFailure}
						<RequestFailureNotice
							failure={finalFailure}
							onRetry={() => retryOrSignIn(finalFailure!, () => void submitFinal())}
							retrying={checkingFinal}
							retryLabel={finalFailure.kind === 'auth' ? 'Sign in again' : 'Retry check'}
						/>
					{/if}
					<footer class="qc-gap-footer">
						<span
							>{checkingFinal ? 'Checking answer...' : 'Use the method, but write naturally.'}</span
						>
						<button type="submit" disabled={!finalAnswer.trim() || checkingFinal}>
							{checkingFinal ? 'Checking' : 'Check answer'}
						</button>
					</footer>
				</form>
			{:else if phase === 'feedback' && finalResult}
				<section class="qc-gap-checked-answer" aria-label="Checked rewrite">
					<p class="qc-panel-label">Your rewrite</p>
					<p><MathText text={finalAnswer} /></p>
				</section>
				<section
					bind:this={resultPanel}
					class="qc-gap-result"
					class:closed={finalResult.gapClosed}
					tabindex="-1"
					aria-live="polite"
				>
					{#if finalResult.gapClosed}
						<CheckCircle2 size={21} aria-hidden="true" />
					{:else}
						<CircleAlert size={21} aria-hidden="true" />
					{/if}
					<div>
						<p class="qc-panel-label">
							{finalResult.awardedMarks}/{finalResult.maxMarks} marks
						</p>
						<p>{finalResult.summary}</p>
					</div>
				</section>
				<div class="qc-gap-step-review">
					{#each data.gapData.chain.steps as step (step.id)}
						<span
							class:present={presentSteps.has(step.id)}
							class:missing={missingSteps.has(step.id)}
							aria-label={`${presentSteps.has(step.id) ? 'Present' : 'Missing'}: ${step.short}`}
						>
							{#if presentSteps.has(step.id)}
								<CheckCircle2 size={15} aria-hidden="true" />
							{:else}
								<CircleAlert size={15} aria-hidden="true" />
							{/if}
							<MathText text={step.short} />
						</span>
					{/each}
				</div>
				<section class="qc-gap-model">
					<button
						class="qc-gap-model-toggle"
						class:open={modelAnswerOpen}
						type="button"
						aria-expanded={modelAnswerOpen}
						aria-controls="gap-model-answer"
						onclick={() => (modelAnswerOpen = !modelAnswerOpen)}
					>
						<span class="qc-panel-label">Model answer</span>
						<ChevronDown size={17} aria-hidden="true" />
					</button>
					{#if modelAnswerOpen}
						<div
							id="gap-model-answer"
							class="qc-gap-model-content"
							transition:slide={{ duration: 180 }}
						>
							<p><MathText text={data.gapData.presentation.modelAnswer} /></p>
						</div>
					{/if}
				</section>
				<footer class="qc-gap-footer" class:completed={finalResult.gapClosed}>
					{#if !finalResult.gapClosed}
						<span>Try the rewrite once more.</span>
					{/if}
					{#if finalResult.gapClosed}
						<div class="qc-gap-footer-actions">
							<a href={followUpHref}>
								{data.gapData.followUpQuestion ? 'Try a fresh question' : 'See next step'}
								<ArrowRight size={16} aria-hidden="true" />
							</a>
						</div>
					{:else}
						<button type="button" onclick={() => (phase = 'compose')}>
							<RotateCcw size={16} aria-hidden="true" />
							Try again
						</button>
					{/if}
				</footer>
			{/if}
		</section>
	</div>
</main>
