<script lang="ts">
	import ExamPaper from '$lib/experiments/questions/components/ExamPaper.svelte';
	import QuestionExperimentToolbar from '$lib/experiments/questions/components/QuestionExperimentToolbar.svelte';
	import { resolve } from '$app/paths';
	import { focusPaperByRef } from '$lib/experiments/questions/paperUtils';
	import type {
		ExperimentGradeResponse,
		ExperimentQuestionGradeResult
	} from '$lib/experiments/questions/gradingTypes';
	import type { ExamPaper as ExamPaperData } from '$lib/experiments/questions/types';

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
	let submitError = $state('');
	let gradeResponse = $state<ExperimentGradeResponse | null>(null);
	const isSubmitting = $derived(submitPhase !== 'idle');
	const submitLabel = $derived(
		submitPhase === 'submitting'
			? 'Submitting...'
			: submitPhase === 'thinking'
				? 'Thinking...'
				: submitPhase === 'grading'
					? 'Grading...'
					: 'Submit'
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
		if (gradeResponse?.results.some((result) => result.ref === ref)) {
			gradeResponse = null;
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

	function applyProgressEvent(event: string, dataText: string) {
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
			const payload = JSON.parse(dataText) as { message?: string };
			throw new Error(payload.message ?? 'Unable to grade this answer right now.');
		}
	}

	async function readGradingStream(response: Response) {
		const reader = response.body?.getReader();
		if (!reader) {
			throw new Error('The grading stream could not be opened.');
		}

		const decoder = new TextDecoder();
		let buffer = '';
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let boundary = buffer.indexOf('\n\n');
			while (boundary >= 0) {
				const rawEvent = buffer.slice(0, boundary).trimEnd();
				buffer = buffer.slice(boundary + 2);
				if (rawEvent) {
					const { event, data: dataText } = parseSseEvent(rawEvent);
					applyProgressEvent(event, dataText);
				}
				boundary = buffer.indexOf('\n\n');
			}
		}

		buffer += decoder.decode();
		const rawEvent = buffer.trim();
		if (rawEvent) {
			const { event, data: dataText } = parseSseEvent(rawEvent);
			applyProgressEvent(event, dataText);
		}
	}

	async function submitForGrading() {
		if (!canSubmit) return;
		submitPhase = 'submitting';
		submitError = '';
		gradeResponse = null;

		const payload = Object.fromEntries(
			focusedParts.map((part) => [part.ref, (answers[part.ref] ?? '').trim()])
		);

		try {
			const response = await fetch(
				`/api/experiments/questions/${data.paper.id}/${encodeURIComponent(data.ref)}/grade`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
					body: JSON.stringify({ answers: payload })
				}
			);

			if (!response.ok) {
				throw new Error(await response.text());
			}

			await readGradingStream(response);
		} catch (error) {
			console.error('[experiment-question] grading failed', error);
			submitError = 'Unable to grade this answer right now.';
		} finally {
			submitPhase = 'idle';
		}
	}
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
		{submitError}
		onAnswerChange={setAnswer}
		onDismissGrade={dismissGrade}
		onSubmitGrade={submitForGrading}
	/>
{:else}
	<main class="missing-question">
		<h1>Question not found</h1>
		<a href={resolve('/experiments/questions/[paperSlug]', { paperSlug: data.paper.id })}
			>Back to paper</a
		>
	</main>
{/if}

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
