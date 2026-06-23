<script lang="ts">
	import ExamPaper from '$lib/experiments/questions/components/ExamPaper.svelte';
	import { focusPaperByRef } from '$lib/experiments/questions/paperUtils';
	import type {
		ExperimentGradeResponse,
		ExperimentQuestionGradeResult
	} from '$lib/experiments/questions/gradingTypes';
	import type {
		ExamPaper as ExamPaperData,
		ExamQuestionBlock
	} from '$lib/experiments/questions/types';

	type SubmitPhase = 'idle' | 'submitting' | 'thinking' | 'grading';

	type ChainQuestion = {
		ref: string;
		label: string;
		role: 'foundation' | 'link' | 'practice';
	};

	let {
		data
	}: {
		data: {
			paper: ExamPaperData;
			initialRef: string;
		};
	} = $props();

	const chainTitle = 'Gas particles and pressure';
	const chainQuestions: ChainQuestion[] = [
		{ ref: '03.1', label: 'Movement of air particles', role: 'foundation' },
		{ ref: '03.2', label: 'Temperature and particle speed', role: 'link' },
		{ ref: '03.3', label: 'Temperature rise and pressure danger', role: 'practice' }
	];
	const reasoningPattern = [
		'temperature changes',
		'particles move faster or slower',
		'collisions with the container change',
		'pressure changes'
	];
	const firstQuestion: ChainQuestion = chainQuestions[0]!;
	const initialRef = '03.3';

	let selectedRef = $state(initialRef);
	let answers = $state<Record<string, string>>({});
	let submitPhase = $state<SubmitPhase>('idle');
	let submitError = $state('');
	let gradeResponse = $state<ExperimentGradeResponse | null>(null);
	let hintOpen = $state(false);
	let patternOpen = $state(false);

	const activeQuestion = $derived(
		chainQuestions.find((question) => question.ref === selectedRef) ?? firstQuestion
	);
	const selectedIndex = $derived(
		Math.max(
			0,
			chainQuestions.findIndex((question) => question.ref === selectedRef)
		)
	);
	const nextQuestion = $derived(
		chainQuestions[Math.min(selectedIndex + 1, chainQuestions.length - 1)]
	);
	const focusedPaper = $derived(focusPaperByRef(data.paper, selectedRef));
	const displayPaper = $derived(
		focusedPaper
			? {
					...cleanPrototypeFocus(focusedPaper, selectedRef),
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

	function selectQuestion(ref: string) {
		selectedRef = ref;
		answers = {};
		submitPhase = 'idle';
		submitError = '';
		gradeResponse = null;
		hintOpen = false;
		patternOpen = false;
	}

	function cleanPrototypeBlocks(blocks: ExamQuestionBlock[]) {
		return blocks.flatMap((block): ExamQuestionBlock[] => {
			if (block.kind === 'bullet-list') {
				const belongsToNextPart = block.items.some((item) =>
					item.includes('Air was allowed to escape from the canister')
				);
				return belongsToNextPart ? [] : [block];
			}

			if (block.kind !== 'paragraph') return [block];

			if (block.text.trim() === '80 minutes.') return [];

			const leakStart = block.text.indexOf('A canister of air was tested');
			if (leakStart < 0) return [block];

			const text = block.text.slice(0, leakStart).trim();
			return text ? [{ ...block, text }] : [];
		});
	}

	function cleanPrototypeFocus(paper: ExamPaperData, ref: string): ExamPaperData {
		if (ref !== '03.3') return paper;
		return {
			...paper,
			questions: paper.questions.map((question) => ({
				...question,
				parts: question.parts.map((part) => ({
					...part,
					blocks: cleanPrototypeBlocks(part.blocks),
					afterResponseBlocks: part.afterResponseBlocks
						? cleanPrototypeBlocks(part.afterResponseBlocks)
						: part.afterResponseBlocks
				}))
			}))
		};
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
				`/api/experiments/questions/${data.paper.id}/${encodeURIComponent(selectedRef)}/grade`,
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
			console.error('[home-question] grading failed', error);
			submitError = 'Unable to check this answer right now.';
		} finally {
			submitPhase = 'idle';
		}
	}
</script>

<svelte:head>
	<title>Question Constellation</title>
	<meta
		name="description"
		content="Practise GCSE questions by finding the thinking pattern behind related exam prompts."
	/>
</svelte:head>

<main class="qc-real-app">
	<header class="qc-real-topbar" aria-label="Site header">
		<a href="/" class="qc-real-brand">Question Constellation</a>
		<span>Physics</span>
	</header>

	<div class="qc-real-layout">
		<aside class="qc-real-rail" aria-label="Related practice sequence">
			<p class="qc-real-kicker">AQA Physics Paper 1</p>
			<h1>{chainTitle}</h1>

			<nav class="qc-real-chain-list" aria-label="Related questions">
				{#each chainQuestions as question, index (question.ref)}
					<button
						type="button"
						class:active={question.ref === selectedRef}
						aria-current={question.ref === selectedRef ? 'page' : undefined}
						onclick={() => selectQuestion(question.ref)}
					>
						<span>{index + 1}</span>
						<span>{question.label}</span>
						<small>{question.role}</small>
					</button>
				{/each}
			</nav>
		</aside>

		<section class="qc-real-main" aria-label="Current question">
			<div class="qc-real-question-top">
				<div>
					<p>{data.paper.subtitle || 'Higher Tier, June 2018'} · Question {selectedRef}</p>
					<h2>{activeQuestion.label}</h2>
				</div>
				<button
					type="button"
					class="qc-real-link-button"
					onclick={() => (hasGrade ? (patternOpen = !patternOpen) : (hintOpen = !hintOpen))}
				>
					{#if hasGrade}
						{patternOpen ? 'Hide thinking pattern' : 'Show thinking pattern'}
					{:else}
						{hintOpen ? 'Hide hint' : 'Need a hint?'}
					{/if}
				</button>
			</div>

			{#if hintOpen && !hasGrade}
				<section class="qc-real-hint" aria-label="Hint">
					<p>Hint</p>
					<span
						>Start with what higher temperature does to the air particles, then connect that to
						pressure.</span
					>
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
				<section class="qc-real-chain-strip" aria-label="Thinking pattern">
					<p>Thinking pattern</p>
					<ol>
						{#each reasoningPattern as step}
							<li>{step}</li>
						{/each}
					</ol>
				</section>
			{/if}

			{#if hasGrade && nextQuestion && nextQuestion.ref !== selectedRef}
				<div class="qc-real-next">
					<span>Next related question: {nextQuestion.label}</span>
					<button type="button" onclick={() => selectQuestion(nextQuestion.ref)}>Continue</button>
				</div>
			{/if}
		</section>
	</div>
</main>
