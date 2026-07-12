<script lang="ts">
	import { page as pageState } from '$app/state';
	import { resolve } from '$app/paths';
	import { authStartHref } from '$lib/authReturn';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import AuthRequiredDialog from '$lib/components/AuthRequiredDialog.svelte';
	import ExamPaper from '$lib/experiments/questions/components/ExamPaper.svelte';
	import HintPanel from '$lib/components/HintPanel.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { focusPaperByRef } from '$lib/experiments/questions/paperUtils';
	import ThinkingChain from './ThinkingChain.svelte';
	import type {
		ExperimentGradeResponse,
		ExperimentQuestionGradeResult
	} from '$lib/experiments/questions/gradingTypes';
	import type { ExamPaper as ExamPaperData } from '$lib/experiments/questions/types';
	import type { LearningChain } from '$lib/learningChains';
	import type { AdminUser } from '$lib/server/auth/session';
	import {
		classifyRequestFailure,
		fetchWithResponseTimeout,
		InterruptedRequestError,
		readStreamChunkWithTimeout,
		requestErrorFromResponse,
		ServerRequestError,
		type RequestFailure
	} from '$lib/requestFailure';
	import { onMount } from 'svelte';

	type SubmitPhase = 'idle' | 'submitting' | 'thinking' | 'grading';

	let {
		paper,
		chain,
		initialRef
	}: {
		paper: ExamPaperData;
		chain: LearningChain;
		initialRef: string;
	} = $props();

	const firstQuestion = $derived(chain.questions[0]!);
	const chainHref = $derived(resolve('/chains/[chainId]', { chainId: chain.id }));
	const questionRoute = (question: LearningChain['questions'][number]) =>
		question.id
			? resolve('/questions/[questionId]/practice', { questionId: question.id })
			: chainHref;
	const questionSourceRef = (question: LearningChain['questions'][number]) =>
		question.sourceRef ?? question.ref;
	const questionMatchesRef = (question: LearningChain['questions'][number], ref: string) =>
		question.id === ref || question.ref === ref || question.sourceRef === ref;

	const selectedRef = $derived(initialRef);
	let answers = $state<Record<string, string>>({});
	let submitPhase = $state<SubmitPhase>('idle');
	let submitFailure = $state<RequestFailure | null>(null);
	let gradeResponse = $state<ExperimentGradeResponse | null>(null);
	let hintOpen = $state(false);
	let patternOpen = $state(false);
	let lastInitialRef = $state<string | null>(null);
	let authDialogOpen = $state(false);
	const pendingCheckKey = 'question-constellation:pending-model-check:v1';
	const answerStorageKey = $derived(
		`question-constellation:chain-practice:v1:${chain.id}:${paper.id}`
	);
	const currentUser = $derived((pageState.data.user ?? null) as AdminUser | null);
	const signInHref = $derived(
		authStartHref(`${pageState.url.pathname}${pageState.url.search}${pageState.url.hash}`)
	);

	const activeQuestion = $derived(
		chain.questions.find((question) => questionMatchesRef(question, selectedRef)) ?? firstQuestion
	);
	const selectedIndex = $derived(
		Math.max(
			0,
			chain.questions.findIndex((question) => questionMatchesRef(question, selectedRef))
		)
	);
	const nextQuestion = $derived(
		chain.questions[Math.min(selectedIndex + 1, chain.questions.length - 1)]
	);
	const focusedRef = $derived(questionSourceRef(activeQuestion));
	const focusedPaper = $derived(focusPaperByRef(paper, focusedRef));
	const displayPaper = $derived(
		focusedPaper
			? {
					...focusedPaper,
					title: '',
					subtitle: '',
					source: ''
				}
			: null
	);
	const focusedParts = $derived(
		focusedPaper?.questions.flatMap((question) => question.parts) ?? []
	);
	const activeHint = $derived(activeQuestion.hint?.trim() || chain.weakLink);
	const focusedPartRefs = $derived(new Set(focusedParts.map((part) => part.ref)));
	const answeredParts = $derived(
		focusedParts.filter((part) => (answers[part.ref] ?? '').trim().length > 0)
	);
	const isSubmitting = $derived(submitPhase !== 'idle');
	const canSubmit = $derived(Boolean(focusedPaper && answeredParts.length > 0 && !isSubmitting));
	const submitLabel = $derived(
		submitPhase === 'submitting'
			? 'Checking...'
			: submitPhase === 'thinking'
				? 'Reading answer...'
				: submitPhase === 'grading'
					? 'Checking marks...'
					: 'Check answer'
	);
	const gradeResultsByRef = $derived<Record<string, ExperimentQuestionGradeResult>>(
		Object.fromEntries(
			(gradeResponse?.results ?? [])
				.filter((result) => focusedPartRefs.has(result.ref))
				.map((result) => [result.ref, result])
		) as Record<string, ExperimentQuestionGradeResult>
	);
	const hasGrade = $derived(Object.keys(gradeResultsByRef).length > 0);

	$effect(() => {
		if (lastInitialRef === null) {
			lastInitialRef = initialRef;
			return;
		}
		if (lastInitialRef === initialRef) return;
		answers = readStoredAnswers();
		submitPhase = 'idle';
		submitFailure = null;
		gradeResponse = null;
		hintOpen = false;
		patternOpen = false;
		lastInitialRef = initialRef;
	});

	function setAnswer(ref: string, answer: string) {
		answers = { ...answers, [ref]: answer };
		persistAnswers();
		if (gradeResponse?.results.some((result) => result.ref === ref)) {
			gradeResponse = null;
		}
	}

	function readStoredAnswers() {
		if (typeof window === 'undefined') return {};
		try {
			const stored = JSON.parse(window.sessionStorage.getItem(answerStorageKey) ?? '{}');
			return stored && typeof stored === 'object' ? (stored as Record<string, string>) : {};
		} catch {
			return {};
		}
	}

	function persistAnswers() {
		if (typeof window === 'undefined') return;
		try {
			window.sessionStorage.setItem(answerStorageKey, JSON.stringify(answers));
		} catch {
			// Keep the current in-memory answer usable when storage is unavailable.
		}
	}

	function prepareAuthRedirect() {
		persistAnswers();
		window.sessionStorage.setItem(
			pendingCheckKey,
			JSON.stringify({
				kind: 'chain-practice',
				paperId: paper.id,
				ref: focusedRef,
				createdAt: Date.now()
			})
		);
	}

	function consumePendingCheck() {
		if (!currentUser || typeof window === 'undefined') return false;
		try {
			const pending = JSON.parse(window.sessionStorage.getItem(pendingCheckKey) ?? 'null') as {
				kind?: string;
				paperId?: string;
				ref?: string;
				createdAt?: number;
			} | null;
			if (pending?.kind !== 'chain-practice') return false;
			window.sessionStorage.removeItem(pendingCheckKey);
			return (
				pending.paperId === paper.id &&
				pending.ref === focusedRef &&
				Date.now() - Number(pending.createdAt ?? 0) < 30 * 60 * 1000
			);
		} catch {
			window.sessionStorage.removeItem(pendingCheckKey);
			return false;
		}
	}

	function dismissGrade(ref: string) {
		if (!gradeResponse) return;
		gradeResponse = {
			...gradeResponse,
			results: gradeResponse.results.filter((result) => result.ref !== ref)
		};
	}

	function parseSseEvent(rawEvent: string) {
		let event = 'message';
		const dataLines: string[] = [];
		for (const line of rawEvent.split(/\r?\n/)) {
			if (!line || line.startsWith(':')) continue;
			if (line.startsWith('event:')) {
				event = line.slice('event:'.length).trim();
				continue;
			}
			if (line.startsWith('data:')) {
				dataLines.push(line.slice('data:'.length).trimStart());
			}
		}
		return { event, data: dataLines.join('\n') };
	}

	function applyProgressEvent(event: string, dataText: string, reference: string | null) {
		if (event === 'status') {
			const payload = JSON.parse(dataText) as { phase?: string };
			if (payload.phase === 'thinking') submitPhase = 'thinking';
			if (payload.phase === 'grading') submitPhase = 'grading';
			return;
		}
		if (event === 'done') {
			gradeResponse = JSON.parse(dataText) as ExperimentGradeResponse;
			hintOpen = false;
			patternOpen = true;
			return;
		}
		if (event === 'error') {
			const payload = JSON.parse(dataText) as { error?: string; message?: string };
			throw new ServerRequestError(payload.message ?? 'Unable to check this answer right now.', {
				code: payload.error,
				reference
			});
		}
	}

	async function readGradingStream(response: Response) {
		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('The grading stream could not be opened.');
		}

		const decoder = new TextDecoder();
		const reference = response.headers.get('cf-ray') ?? response.headers.get('x-request-id');
		let buffer = '';
		while (true) {
			const { value, done } = await readStreamChunkWithTimeout(reader);
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let boundary = buffer.indexOf('\n\n');
			while (boundary >= 0) {
				const rawEvent = buffer.slice(0, boundary).trimEnd();
				buffer = buffer.slice(boundary + 2);
				if (rawEvent) {
					const { event, data: dataText } = parseSseEvent(rawEvent);
					applyProgressEvent(event, dataText, reference);
				}
				boundary = buffer.indexOf('\n\n');
			}
		}

		buffer += decoder.decode();
		const rawEvent = buffer.trim();
		if (rawEvent) {
			const { event, data: dataText } = parseSseEvent(rawEvent);
			applyProgressEvent(event, dataText, reference);
		}
	}

	async function submitForGrading() {
		if (!canSubmit) return;
		if (!currentUser) {
			persistAnswers();
			authDialogOpen = true;
			return;
		}
		submitPhase = 'submitting';
		submitFailure = null;
		gradeResponse = null;
		let streamStarted = false;

		const payload = Object.fromEntries(
			focusedParts.map((part) => [part.ref, (answers[part.ref] ?? '').trim()])
		);

		try {
			const response = await fetchWithResponseTimeout(
				`/api/experiments/questions/${paper.id}/${encodeURIComponent(focusedRef)}/grade`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
					body: JSON.stringify({ answers: payload })
				}
			);
			if (response.status === 401) {
				submitPhase = 'idle';
				authDialogOpen = true;
				return;
			}

			if (!response.ok) {
				throw await requestErrorFromResponse(response, 'Answer check request failed.');
			}

			streamStarted = true;
			await readGradingStream(response);
			if (!gradeResponse) {
				throw new InterruptedRequestError('The answer check ended without feedback.');
			}
		} catch (error) {
			console.error('[practice-question] grading failed', error);
			submitFailure = classifyRequestFailure(error, {
				action: 'finish checking this answer',
				serverLabel: 'The answer checker',
				streamStarted
			});
		} finally {
			submitPhase = 'idle';
		}
	}

	onMount(() => {
		answers = readStoredAnswers();
		if (consumePendingCheck()) window.setTimeout(() => void submitForGrading(), 0);
	});
</script>

<main class="qc-real-app">
	<AppTopbar subject={chain.subject} showNavigation />

	<div class="qc-real-layout">
		<aside class="qc-real-rail" aria-label="Related practice sequence">
			<IconBackLink href={chainHref} label="View all questions in this chain" />
			<p class="qc-real-kicker">{chain.paperLabel}</p>
			<h1><MathText text={chain.title} /></h1>

			<nav class="qc-real-chain-list" aria-label="Related questions">
				{#each chain.questions as question, index (question.id ?? question.ref)}
					<a
						href={questionRoute(question)}
						class:active={questionMatchesRef(question, selectedRef)}
						aria-current={questionMatchesRef(question, selectedRef) ? 'page' : undefined}
					>
						<span>{index + 1}</span>
						<span><MathText text={question.title} /></span>
						<small><MathText text={`${question.label} · ${question.marks ?? '?'} marks`} /></small>
					</a>
				{/each}
			</nav>
		</aside>

		<section class="qc-real-main" aria-label="Current question">
			<div class="qc-real-question-top">
				<div>
					<p>{paper.subtitle || chain.paperLabel} · Question {focusedRef}</p>
					<h2><MathText text={activeQuestion.title} /></h2>
				</div>
				{#if hasGrade}
					<button
						type="button"
						class="qc-real-link-button"
						onclick={() => (patternOpen = !patternOpen)}
					>
						{patternOpen ? 'Hide method' : 'Show method'}
					</button>
				{/if}
			</div>

			{#if !hasGrade}
				<HintPanel
					hints={[{ title: 'Hint for this question', text: activeHint }]}
					bind:open={hintOpen}
				/>
			{/if}

			{#if displayPaper}
				<ExamPaper
					paper={displayPaper}
					{answers}
					gradingResults={gradeResultsByRef}
					{canSubmit}
					{isSubmitting}
					{submitLabel}
					{submitFailure}
					onAnswerChange={setAnswer}
					onDismissGrade={dismissGrade}
					onSubmitGrade={submitForGrading}
					onRetrySubmit={submitForGrading}
				/>
			{:else}
				<p class="qc-real-missing">This question is not available in the current paper.</p>
			{/if}

			{#if patternOpen}
				<ThinkingChain steps={chain.steps} label="Method" note="Use the steps in order." />
			{/if}

			{#if hasGrade && nextQuestion && !questionMatchesRef(nextQuestion, selectedRef)}
				<div class="qc-real-next">
					<span>Next related question: <MathText text={nextQuestion.title} /></span>
					<a href={questionRoute(nextQuestion)}>Continue</a>
				</div>
			{/if}
		</section>
	</div>
</main>

<AuthRequiredDialog
	open={authDialogOpen}
	href={signInHref}
	onDismiss={() => (authDialogOpen = false)}
	onSignIn={prepareAuthRedirect}
/>
