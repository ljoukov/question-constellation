<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamPaper from '$lib/experiments/questions/components/ExamPaper.svelte';
	import { focusPaperByRef } from '$lib/experiments/questions/paperUtils';
	import ThinkingChain from './ThinkingChain.svelte';
	import type {
		ExperimentGradeResponse,
		ExperimentQuestionGradeResult
	} from '$lib/experiments/questions/gradingTypes';
	import type {
		ExamPaper as ExamPaperData,
	} from '$lib/experiments/questions/types';
	import type { LearningChain } from '$lib/learningChains';

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

	let selectedRef = $state('');
	let answers = $state<Record<string, string>>({});
	let submitPhase = $state<SubmitPhase>('idle');
	let submitError = $state('');
	let gradeResponse = $state<ExperimentGradeResponse | null>(null);
	let hintOpen = $state(false);
	let patternOpen = $state(false);

	const activeQuestion = $derived(
		chain.questions.find((question) => question.ref === selectedRef) ?? firstQuestion
	);
	const selectedIndex = $derived(
		Math.max(
			0,
			chain.questions.findIndex((question) => question.ref === selectedRef)
		)
	);
	const nextQuestion = $derived(
		chain.questions[Math.min(selectedIndex + 1, chain.questions.length - 1)]
	);
	const focusedPaper = $derived(focusPaperByRef(paper, selectedRef));
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
		if (!selectedRef) selectedRef = initialRef;
	});

	function selectQuestion(ref: string) {
		selectedRef = ref;
		answers = {};
		submitPhase = 'idle';
		submitError = '';
		gradeResponse = null;
		hintOpen = false;
		patternOpen = false;
	}

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
			hintOpen = false;
			patternOpen = true;
			return;
		}
		if (event === 'error') {
			const payload = JSON.parse(dataText) as { message?: string };
			throw new Error(payload.message ?? 'Unable to check this answer right now.');
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
				`/api/experiments/questions/${paper.id}/${encodeURIComponent(selectedRef)}/grade`,
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
			console.error('[practice-question] grading failed', error);
			submitError = 'Unable to check this answer right now.';
		} finally {
			submitPhase = 'idle';
		}
	}
</script>

<main class="qc-real-app">
	<AppTopbar subject={chain.subject} />

	<div class="qc-real-layout">
		<aside class="qc-real-rail" aria-label="Related practice sequence">
			<p class="qc-real-kicker">{chain.paperLabel}</p>
			<h1>{chain.title}</h1>

			<nav class="qc-real-chain-list" aria-label="Related questions">
				{#each chain.questions as question, index (question.ref)}
					<button
						type="button"
						class:active={question.ref === selectedRef}
						aria-current={question.ref === selectedRef ? 'page' : undefined}
						onclick={() => selectQuestion(question.ref)}
					>
						<span>{index + 1}</span>
						<span>{question.title}</span>
						<small>{question.label} · {question.marks ?? '?'} marks</small>
					</button>
				{/each}
			</nav>

			<a class="qc-real-quiet-link" href={chainHref}>View all questions in this chain</a>
		</aside>

		<section class="qc-real-main" aria-label="Current question">
			<div class="qc-real-question-top">
				<div>
					<p>{paper.subtitle || chain.paperLabel} · Question {selectedRef}</p>
					<h2>{activeQuestion.title}</h2>
				</div>
				<button
					type="button"
					class="qc-real-link-button"
					onclick={() => (hasGrade ? (patternOpen = !patternOpen) : (hintOpen = !hintOpen))}
				>
					{#if hasGrade}
						{patternOpen ? 'Hide thinking chain' : 'Show thinking chain'}
					{:else}
						{hintOpen ? 'Hide hint' : 'Need a hint?'}
					{/if}
				</button>
			</div>

			{#if hintOpen && !hasGrade}
				<section class="qc-real-hint" aria-label="Hint">
					<p>Hint</p>
					<span>{chain.weakLink}</span>
				</section>
			{/if}

			{#if displayPaper}
				<ExamPaper
					paper={displayPaper}
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
				<p class="qc-real-missing">This question is not available in the current paper.</p>
			{/if}

			{#if patternOpen}
				<ThinkingChain
					steps={chain.steps}
					label="Thinking chain"
					note="Use the links in order."
				/>
			{/if}

			{#if hasGrade && nextQuestion && nextQuestion.ref !== selectedRef}
				<div class="qc-real-next">
					<span>Next related question: {nextQuestion.title}</span>
					<button type="button" onclick={() => selectQuestion(nextQuestion.ref)}>Continue</button>
				</div>
			{/if}
		</section>
	</div>
</main>
