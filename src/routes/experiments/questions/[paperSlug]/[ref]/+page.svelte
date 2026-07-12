<script lang="ts">
	import ExamPaper from '$lib/experiments/questions/components/ExamPaper.svelte';
	import QuestionExperimentToolbar from '$lib/experiments/questions/components/QuestionExperimentToolbar.svelte';
	import { resolve } from '$app/paths';
	import { page as pageState } from '$app/state';
	import { authStartHref } from '$lib/authReturn';
	import AuthRequiredDialog from '$lib/components/AuthRequiredDialog.svelte';
	import { focusPaperByRef } from '$lib/experiments/questions/paperUtils';
	import type {
		ExperimentGradeResponse,
		ExperimentQuestionGradeResult
	} from '$lib/experiments/questions/gradingTypes';
	import type { ExamPaper as ExamPaperData } from '$lib/experiments/questions/types';
	import {
		classifyRequestFailure,
		fetchWithResponseTimeout,
		InterruptedRequestError,
		readStreamChunkWithTimeout,
		requestErrorFromResponse,
		ServerRequestError,
		type RequestFailure
	} from '$lib/requestFailure';
	import type { AdminUser } from '$lib/server/auth/session';
	import { onMount } from 'svelte';

	type SubmitPhase = 'idle' | 'submitting' | 'thinking' | 'grading';

	let {
		data
	}: {
		data: {
			ref: string;
			paper: ExamPaperData;
		};
	} = $props();

	let answers = $state<Record<string, string>>({});
	let submitPhase = $state<SubmitPhase>('idle');
	let submitFailure = $state<RequestFailure | null>(null);
	let gradeResponse = $state<ExperimentGradeResponse | null>(null);
	let authDialogOpen = $state(false);
	const answerStorageKey = $derived(
		`question-constellation:experiment-practice:v1:${data.paper.id}:${data.ref}`
	);
	const pendingCheckKey = 'question-constellation:pending-model-check:v1';
	const currentUser = $derived((pageState.data.user ?? null) as AdminUser | null);
	const signInHref = $derived(
		authStartHref(`${pageState.url.pathname}${pageState.url.search}${pageState.url.hash}`)
	);
	const isSubmitting = $derived(submitPhase !== 'idle');
	const submitLabel = $derived(
		submitPhase === 'submitting'
			? 'Checking...'
			: submitPhase === 'thinking'
				? 'Reading answer...'
				: submitPhase === 'grading'
					? 'Checking marks...'
					: 'Check answer'
	);

	const focusedPaper = $derived(focusPaperByRef(data.paper, data.ref));
	const focusedParts = $derived(
		focusedPaper?.questions.flatMap((question) => question.parts) ?? []
	);
	const focusedPartRefs = $derived(new Set(focusedParts.map((part) => part.ref)));
	const answeredParts = $derived(
		focusedParts.filter((part) => (answers[part.ref] ?? '').trim().length > 0)
	);
	const canSubmit = $derived(Boolean(focusedPaper && answeredParts.length > 0 && !isSubmitting));
	const gradeResultsByRef = $derived<Record<string, ExperimentQuestionGradeResult>>(
		Object.fromEntries(
			(gradeResponse?.results ?? [])
				.filter((result) => focusedPartRefs.has(result.ref))
				.map((result) => [result.ref, result])
		) as Record<string, ExperimentQuestionGradeResult>
	);

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
			// Keep the in-memory answer usable when browser storage is unavailable.
		}
	}

	function prepareAuthRedirect() {
		persistAnswers();
		window.sessionStorage.setItem(
			pendingCheckKey,
			JSON.stringify({
				kind: 'experiment-practice',
				paperId: data.paper.id,
				ref: data.ref,
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
			if (pending?.kind !== 'experiment-practice') return false;
			window.sessionStorage.removeItem(pendingCheckKey);
			return (
				pending.paperId === data.paper.id &&
				pending.ref === data.ref &&
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
			return;
		}
		if (event === 'error') {
			const payload = JSON.parse(dataText) as { error?: string; message?: string };
			throw new ServerRequestError(payload.message ?? 'Unable to grade this answer right now.', {
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
				`/api/experiments/questions/${data.paper.id}/${encodeURIComponent(data.ref)}/grade`,
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
			console.error('[experiment-question] grading failed', error);
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

<svelte:head>
	<title>{data.paper.title} {data.ref} | Question rendering experiment</title>
</svelte:head>

<QuestionExperimentToolbar paper={data.paper} currentRef={data.ref} />

{#if focusedPaper}
	<ExamPaper
		paper={focusedPaper}
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
	<main class="missing-question">
		<h1>Question not found</h1>
		<a href={resolve('/experiments/questions/[paperSlug]', { paperSlug: data.paper.id })}
			>Back to paper</a
		>
	</main>
{/if}

<AuthRequiredDialog
	open={authDialogOpen}
	href={signInHref}
	onDismiss={() => (authDialogOpen = false)}
	onSignIn={prepareAuthRedirect}
/>

<style>
	.missing-question {
		width: min(100%, 900px);
		margin: 0 auto;
		padding: 2rem;
		background: #ffffff;
		color: #000000;
		font-family: Arial, Helvetica, sans-serif;
	}
</style>
