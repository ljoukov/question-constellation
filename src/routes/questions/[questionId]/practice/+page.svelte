<script lang="ts">
	import { resolve } from '$app/paths';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import QuestionAssetFigure from '$lib/components/QuestionAssetFigure.svelte';
	import {
		ArrowLeft,
		Bookmark,
		CheckCircle2,
		Circle,
		CircleAlert,
		Info,
		Lightbulb,
		ListChecks,
		Lock,
		Save,
		Target,
		Zap
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type GradePhase = 'idle' | 'connecting' | 'calling' | 'thinking' | 'grading' | 'done' | 'error';
	type GradeResult = {
		status: 'ok';
		result: 'correct' | 'partial' | 'incorrect';
		awardedMarks: number;
		maxMarks: number;
		presentStepIds: string[];
		missingStepIds: string[];
		feedbackMarkdown: string;
		thinkingMarkdown: string | null;
		model: string;
		modelVersion: string;
	};
	type SseMessage = {
		event: string;
		data: string;
	};

	let loadedQuestionId = $state('');
	let answerText = $state('');
	let rewriteText = $state('');
	let checked = $state(false);
	let gradePhase = $state<GradePhase>('idle');
	let gradeError = $state('');
	let gradeResult = $state<GradeResult | null>(null);
	let streamedThought = $state('');

	const questionIndex = $derived(
		data.questions.findIndex((question) => question.id === data.question.id)
	);
	const questionNumber = $derived(questionIndex + 1);
	const progressPercent = $derived(`${((questionNumber || 1) / data.questions.length) * 100}%`);
	const presentStepIds = $derived(new Set(gradeResult?.presentStepIds ?? []));
	const missingStepIds = $derived(new Set(gradeResult?.missingStepIds ?? []));
	const includedItems = $derived(
		data.question.checklist.filter((item) => presentStepIds.has(item.stepId))
	);
	const missingItems = $derived(
		data.question.checklist.filter((item) => missingStepIds.has(item.stepId))
	);
	const resultTitle = $derived(
		`${includedItems.length} of ${data.question.checklist.length} links found`
	);
	const previousHref = $derived(
		resolve('/questions/[questionId]/chain', { questionId: data.question.id })
	);
	const chainReminder = $derived(data.question.repairChain.map((node) => node.label).join(' → '));
	const isChecking = $derived(
		gradePhase === 'connecting' ||
			gradePhase === 'calling' ||
			gradePhase === 'thinking' ||
			gradePhase === 'grading'
	);
	const canCheck = $derived(answerText.trim().length > 0 && !isChecking);
	const statusText = $derived(`${gradePhase}...`);
	const statusDescription = $derived(statusDescriptionForPhase(gradePhase));
	const streamedThoughtPreview = $derived(lastMarkdownParagraph(streamedThought));
	const feedbackMarkdown = $derived((gradeResult?.feedbackMarkdown ?? '').trim());
	const hasMissingLinks = $derived(missingItems.length > 0);

	async function checkAnswer() {
		if (!canCheck) return;

		checked = false;
		rewriteText = '';
		gradeError = '';
		gradeResult = null;
		streamedThought = '';
		gradePhase = 'connecting';

		try {
			const response = await fetch(
				resolve('/api/questions/[questionId]/grade', { questionId: data.question.id }),
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({ answer: answerText })
				}
			);

			if (!response.ok || !response.body) {
				throw new Error(`Grading request failed with ${response.status}`);
			}

			await readSseStream(response.body);

			if (!gradeResult) {
				throw new Error('Grading stream ended without a result.');
			}
		} catch (error) {
			console.error('[practice] answer grading failed', error);
			gradePhase = 'error';
			gradeError = 'Answer check failed. Please try again.';
			checked = false;
		}
	}

	function shortChecklistText(text: string) {
		return text
			.replace(/^Say that /, '')
			.replace(/^Say /, '')
			.replace(/^Mention /, '')
			.replace(/^Explain that /, '')
			.replace(/\.$/, '');
	}

	function isNodeMissing(stepId: string | null) {
		return stepId ? missingStepIds.has(stepId) : false;
	}

	function statusDescriptionForPhase(phase: GradePhase) {
		if (phase === 'connecting') return 'Connecting your browser to the grading endpoint.';
		if (phase === 'calling') return 'The server is calling the model.';
		if (phase === 'thinking') return 'The model is working through the answer chain.';
		if (phase === 'grading') return 'The grade and feedback are streaming back.';
		if (phase === 'error') return 'The check could not finish.';
		return '';
	}

	function lastMarkdownParagraph(value: string) {
		const paragraphs = value
			.split(/\n\s*\n/)
			.map((paragraph) => paragraph.trim())
			.filter(Boolean);
		return paragraphs.at(-1) ?? '';
	}

	function parseSseBlock(block: string): SseMessage | null {
		const lines = block.split(/\r?\n/);
		let event = 'message';
		const dataLines: string[] = [];

		for (const rawLine of lines) {
			if (!rawLine || rawLine.startsWith(':')) continue;

			const separatorIndex = rawLine.indexOf(':');
			const field = separatorIndex === -1 ? rawLine : rawLine.slice(0, separatorIndex);
			let value = separatorIndex === -1 ? '' : rawLine.slice(separatorIndex + 1);
			if (value.startsWith(' ')) value = value.slice(1);

			if (field === 'event') {
				event = value;
			} else if (field === 'data') {
				dataLines.push(value);
			}
		}

		if (dataLines.length === 0) return null;
		return { event, data: dataLines.join('\n') };
	}

	function handleSseMessage(message: SseMessage) {
		if (message.event === 'status') {
			const status = JSON.parse(message.data) as { phase?: GradePhase };
			if (status.phase === 'calling' || status.phase === 'thinking' || status.phase === 'grading') {
				gradePhase = status.phase;
			}
			return;
		}

		if (message.event === 'thought') {
			streamedThought += message.data;
			return;
		}

		if (message.event === 'text') {
			return;
		}

		if (message.event === 'done') {
			gradeResult = JSON.parse(message.data) as GradeResult;
			gradePhase = 'done';
			checked = true;
			return;
		}

		if (message.event === 'error') {
			gradePhase = 'error';
			gradeError = 'Answer check failed. Please try again.';
		}
	}

	async function readSseStream(body: ReadableStream<Uint8Array>) {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await reader.read();
			buffer += decoder.decode(value, { stream: !done });

			let separatorIndex = buffer.indexOf('\n\n');
			while (separatorIndex !== -1) {
				const block = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + 2);
				const message = parseSseBlock(block);
				if (message) handleSseMessage(message);
				separatorIndex = buffer.indexOf('\n\n');
			}

			if (done) break;
		}

		const trailingMessage = parseSseBlock(buffer.trim());
		if (trailingMessage) handleSseMessage(trailingMessage);
	}

	$effect(() => {
		if (loadedQuestionId === data.question.id) {
			return;
		}

		loadedQuestionId = data.question.id;
		answerText = '';
		rewriteText = '';
		checked = false;
		gradePhase = 'idle';
		gradeError = '';
		gradeResult = null;
		streamedThought = '';
	});
</script>

<svelte:head>
	<title>{data.question.title} practice | Question Constellation</title>
	<meta
		name="description"
		content="Attempt a GCSE question before revealing and repairing the answer chain."
	/>
</svelte:head>

<main class="flow-page practice-page">
	<header class="app-header compact-header">
		<a class="icon-button" href={previousHref} aria-label="Back to answer chain">
			<ArrowLeft size={25} strokeWidth={2.1} />
		</a>
		<strong class="header-title desktop-centered">{data.constellation.title}</strong>
		<Bookmark class="bookmark" size={25} strokeWidth={2.1} />
	</header>

	{#if !checked}
		<section class="practice-progress-strip">
			<div class="progress-meter">
				<p class="progress-label">Question {questionNumber} of {data.questions.length}</p>
				<div class="progress-track" aria-hidden="true">
					<span class="progress-fill" style={`width: ${progressPercent}`}></span>
				</div>
			</div>

			<section class="meta-pills" aria-label="Exam metadata">
				<span class="pill">
					{data.question.meta.board}
					{data.question.meta.subject}
					{data.question.meta.tier}
				</span>
				<span class="pill">{data.question.meta.paper}</span>
				<span class="pill">{data.question.meta.marks} marks</span>
			</section>
		</section>

		<div class="flow-grid practice-attempt-grid">
			<aside class="practice-rail">
				<section class="side-card prompt-card">
					<h2>Before you check</h2>
					<ul class="prompt-list">
						<li><Circle size={21} /> Use the words in the question</li>
						<li><Circle size={21} /> Write each cause before the effect</li>
						<li><Circle size={21} /> Leave a gap if you are unsure</li>
					</ul>
				</section>

				<section class="side-card compare-card">
					<span class="icon-tile info"><Lock size={22} /></span>
					<div>
						<h2>Compare after checking</h2>
						<p>The chain appears after your attempt so you practise retrieval first.</p>
					</div>
				</section>
			</aside>

			<section class="flow-main practice-workspace">
				{#if data.question.context}
					<section class="question-context-card">
						<p>{data.question.context}</p>
					</section>
				{/if}

				{#if data.question.assets.length > 0}
					<div class="question-assets practice-assets" aria-label="Question source images">
						{#each data.question.assets as asset (asset.id)}
							<QuestionAssetFigure {asset} />
						{/each}
					</div>
				{/if}

				<h1 class="attempt-question">{data.question.prompt}</h1>

				<section class="memory-first-card">
					<span class="icon-tile info"><Lightbulb size={22} /></span>
					<div>
						<h2>Try from memory first</h2>
						<p>Compare with the chain after you check.</p>
					</div>
				</section>

				<textarea
					id="answer"
					bind:value={answerText}
					rows="8"
					placeholder="Write your answer..."
					spellcheck="true"
				></textarea>

				<div class="desktop-action-row">
					<button class="primary-button" type="button" onclick={checkAnswer} disabled={!canCheck}>
						{#if isChecking}
							<span class="loading-spinner button-spinner" aria-hidden="true"></span>
							{statusText}
						{:else}
							<CheckCircle2 size={22} />
							Check answer
						{/if}
					</button>
					<button class="secondary-button" type="button" onclick={checkAnswer} disabled={!canCheck}>
						<ListChecks size={22} />
						Use mark checklist
					</button>
				</div>

				{#if isChecking}
					<section class="grading-status-card" aria-live="polite">
						<span class="loading-spinner" aria-hidden="true"></span>
						<div>
							<h2>{statusText}</h2>
							<p>{statusDescription}</p>
							{#if streamedThoughtPreview}
								<div class="thinking-preview">
									<strong>Thinking</strong>
									<p>{streamedThoughtPreview}</p>
								</div>
							{/if}
						</div>
					</section>
				{/if}

				{#if gradeError}
					<section class="grading-status-card error" aria-live="polite">
						<CircleAlert size={22} />
						<div>
							<h2>Could not check</h2>
							<p>{gradeError}</p>
						</div>
					</section>
				{/if}
			</section>
		</div>
	{:else}
		<div class="flow-grid checklist-rewrite-grid">
			<aside class="feedback-rail">
				<section class="score-card">
					<h1 class="result-title">{resultTitle}</h1>
					<p>
						{gradeResult?.awardedMarks ?? 0} of {gradeResult?.maxMarks ?? data.question.meta.marks}
						marks. {missingItems.length === 0
							? 'All required links are present.'
							: 'Add the missing links to complete the answer.'}
					</p>
				</section>

				<section class="chain-card compact-chain-card" aria-label="Checklist result chain">
					<h2>Chain preview</h2>
					<div class="chain-icons compact result-chain">
						{#each data.question.repairChain as node (node.id)}
							<div class="chain-node" class:missing={isNodeMissing(node.stepId)}>
								<span class="chain-node-icon">
									{#if node.icon === 'zap'}
										<Zap size={22} strokeWidth={2.2} />
									{:else}
										<Target size={22} strokeWidth={2.2} />
									{/if}
								</span>
								<span>{node.label}</span>
							</div>
						{/each}
					</div>
				</section>

				<section class="result-card included-card">
					<h2>You included ({includedItems.length})</h2>
					<div class="result-list">
						{#each includedItems as item (item.id)}
							<div class="result-row">
								<CheckCircle2 size={20} />
								<span>{shortChecklistText(item.text)}</span>
							</div>
						{/each}
					</div>
				</section>

				{#if missingItems.length > 0}
					<section class="result-card missing-card">
						<h2>Missing ({missingItems.length})</h2>
						<div class="result-list">
							{#each missingItems as item (item.id)}
								<div class="result-row missing">
									<CircleAlert size={20} />
									<span>{shortChecklistText(item.text)}</span>
								</div>
							{/each}
						</div>
					</section>
				{/if}

				{#if feedbackMarkdown}
					<section class="result-card feedback-card">
						<h2>Feedback</h2>
						<MarkdownContent markdown={feedbackMarkdown} class="feedback-markdown" />
					</section>
				{/if}

				<section class="repair-card">
					<Info size={21} color="#0b57eb" />
					<span>
						{missingItems.length === 0
							? 'Save this chain or try the next transfer question.'
							: 'Add the missing links so the final effect is explained.'}
					</span>
				</section>
			</aside>

			<section class="flow-main rewrite-workspace">
				<h1>{hasMissingLinks ? 'Rewrite with the missing links' : 'Answer chain complete'}</h1>
				<p class="workspace-subtitle">
					{hasMissingLinks
						? 'Use the feedback to repair your answer.'
						: 'Save this chain or try the next transfer question.'}
				</p>
				<div class="chain-reminder">{chainReminder}</div>
				{#if hasMissingLinks}
					<textarea
						bind:value={rewriteText}
						rows="12"
						placeholder="Rewrite your answer..."
						spellcheck="true"
					></textarea>
				{:else}
					<section class="completion-card">
						<h2>Your checked answer</h2>
						<p>{answerText}</p>
					</section>
				{/if}
				<div class="button-stack">
					<a class="primary-button" href={resolve('/thinking-memory')}>
						<Save size={22} />
						View in Thinking Memory
					</a>
					<a
						class="secondary-button"
						href={resolve('/questions/[questionId]/chain', { questionId: data.question.id })}
					>
						Show model answer
					</a>
					<a
						class="text-button"
						href={resolve('/questions/[questionId]/practice', { questionId: data.nextQuestion.id })}
					>
						Next question
					</a>
				</div>
			</section>
		</div>
	{/if}
</main>
