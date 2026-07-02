<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import HintPanel from '$lib/components/HintPanel.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import ResponseRenderer from '$lib/experiments/questions/components/ResponseRenderer.svelte';
	import type { ExamResponse } from '$lib/experiments/questions/types';
	import {
		Check,
		ChevronLeft,
		ChevronRight,
		Circle,
		ClipboardCheck,
		ListChecks,
		PenLine,
		RotateCcw
	} from '@lucide/svelte';

	type Mode = 'steps' | 'full';
	type GradePhase = 'idle' | 'connecting' | 'calling' | 'thinking' | 'grading' | 'done' | 'error';

	type Criterion = {
		id: string;
		title: string;
		detail: string;
		marks: number;
		found: string;
		missing: string;
		keywords: string[];
	};

	type Stage = {
		id: string;
		criterionId: string;
		title: string;
		shortTitle: string;
		revealedText: string;
		prompt: string;
		placeholder: string;
		goal: string;
	};

	type Question = {
		id: string;
		sourceRef: string;
		title: string;
		prompt: string;
		context: string;
		meta: {
			board: string;
			qualification: string;
			subject: string;
			tier: string;
			paper: string;
			questionType: string;
			marks: number;
		};
		assets?: Array<{
			id?: string;
			publicPath: string;
			altText: string;
			sourceLabel: string;
			paperWidthPx?: number | null;
			paperHeightPx?: number | null;
		}>;
	};

	type EnglishPractice = {
		questionId: string;
		question: Question;
		sourceTitle: string;
		instructions: string[];
		criteria: Criterion[];
		stages: Stage[];
		modelAnswer: string;
		weakAnswerText: string;
		weakAnswerExplanation: string;
		isExtended: boolean;
		stepLineCount: number;
		fullLineCount: number;
	};

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

	let { practice }: { practice: EnglishPractice } = $props();

	const subjects = [
		'English',
		'All subjects',
		'Science',
		'Biology',
		'Chemistry',
		'Physics',
		'Computer Science',
		'Geography',
		'History'
	];

	let loadedQuestionId = $state('');
	let mode = $state<Mode>('steps');
	let activeStageIndex = $state(0);
	let stepAnswers = $state<Record<string, string>>({});
	let fullAnswer = $state('');
	let checked = $state(false);
	let gradePhase = $state<GradePhase>('idle');
	let gradeError = $state('');
	let gradeResult = $state<GradeResult | null>(null);
	let showModelAnswer = $state(false);
	let hintOpen = $state(false);

	const question = $derived(practice.question);
	const activeStage = $derived(practice.stages[activeStageIndex] ?? practice.stages[0]);
	const stageProgress = $derived(
		practice.stages.length > 0
			? Math.round(((activeStageIndex + 1) / practice.stages.length) * 100)
			: 0
	);
	const draftedAnswer = $derived(buildDraftFromSteps());
	const answerForFeedback = $derived(mode === 'full' ? fullAnswer : draftedAnswer);
	const deterministicGrade = $derived(gradeAnswer(answerForFeedback));
	const displayGrade = $derived(
		gradeResult ? gradeFromModelResult(gradeResult) : deterministicGrade
	);
	const feedbackMarkdown = $derived((gradeResult?.feedbackMarkdown ?? '').trim());
	const completedStepCount = $derived(
		practice.stages.filter((stage) => (stepAnswers[stage.id] ?? '').trim().length > 8).length
	);
	const isChecking = $derived(
		gradePhase === 'connecting' ||
			gradePhase === 'calling' ||
			gradePhase === 'thinking' ||
			gradePhase === 'grading'
	);
	const canCheck = $derived(answerForFeedback.trim().length > 0 && !isChecking);
	const markText = $derived(
		displayGrade.score === null
			? 'Not checked'
			: `${displayGrade.score}/${question.meta.marks} marks`
	);
	const nextAdvice = $derived(makeNextAdvice(displayGrade.criteria, answerForFeedback));
	const modelDirection = $derived(makeModelDirection(displayGrade.criteria, answerForFeedback));
	const hintItems = $derived(buildHints());

	function blankStepAnswers() {
		return Object.fromEntries(practice.stages.map((stage) => [stage.id, '']));
	}

	function lineResponse(count: number): ExamResponse {
		return { kind: 'lines', count };
	}

	function buildDraftFromSteps() {
		return practice.stages
			.map((stage) => (stepAnswers[stage.id] ?? '').trim())
			.filter(Boolean)
			.join(' ');
	}

	function keywordList(value: string) {
		return [
			...new Set(
				value
					.toLowerCase()
					.match(/[a-z][a-z'-]{3,}/g)
					?.filter((word) => !['that', 'this', 'with', 'from', 'question'].includes(word)) ?? []
			)
		].slice(0, 14);
	}

	function includesAny(text: string, terms: string[]) {
		const lower = text.toLowerCase();
		return terms.some((term) => lower.includes(term.toLowerCase()));
	}

	function criterionPresent(criterion: Criterion, index: number, answer: string) {
		const trimmed = answer.trim();
		if (!trimmed) return false;
		if (practice.criteria.length === 1) return true;

		const lowerTitle = `${criterion.title} ${criterion.detail}`.toLowerCase();
		const taskKeywords = keywordList(`${question.title} ${question.prompt}`);
		const contextKeywords = keywordList(question.context);
		const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

		if (index === 0 && (includesAny(trimmed, taskKeywords) || wordCount >= 18)) return true;
		if (/\bevidence|reference|quotation|source|extract|textual\b/.test(lowerTitle)) {
			return /["']/.test(trimmed) || includesAny(trimmed, contextKeywords.slice(0, 10));
		}
		if (/\bmethod|language|structure|form|effect|analysis|dramatic\b/.test(lowerTitle)) {
			return includesAny(trimmed, [
				'suggest',
				'imply',
				'connot',
				'audience',
				'reader',
				'language',
				'structure',
				'form',
				'method',
				'effect'
			]);
		}
		if (/\bcontext|expression|spag|spelling|punctuation|grammar|accuracy\b/.test(lowerTitle)) {
			return wordCount >= (practice.isExtended ? 50 : 12);
		}
		return includesAny(trimmed, criterion.keywords) || wordCount >= 30;
	}

	function gradeAnswer(answer: string): {
		score: number | null;
		criteria: Array<Criterion & { present: boolean }>;
	} {
		const trimmed = answer.trim();
		const criteria = practice.criteria.map((criterion, index) => ({
			...criterion,
			present: criterionPresent(criterion, index, trimmed)
		}));
		if (!trimmed) return { score: null, criteria };
		return {
			score: Math.min(
				question.meta.marks,
				criteria.reduce((sum, criterion) => sum + (criterion.present ? criterion.marks : 0), 0)
			),
			criteria
		};
	}

	function gradeFromModelResult(result: GradeResult): {
		score: number | null;
		criteria: Array<Criterion & { present: boolean }>;
	} {
		const presentStepIds = new Set(result.presentStepIds);
		return {
			score: result.awardedMarks,
			criteria: practice.criteria.map((criterion) => ({
				...criterion,
				present: presentStepIds.has(criterion.id)
			}))
		};
	}

	function makeNextAdvice(criteria: Array<Criterion & { present: boolean }>, answer: string) {
		if (!answer.trim()) return 'Start with one sentence that answers the exact question.';
		const missing = criteria.find((criterion) => !criterion.present);
		return missing
			? missing.missing
			: 'Now tighten expression and make the strongest evidence do more analytical work.';
	}

	function makeModelDirection(criteria: Array<Criterion & { present: boolean }>, answer: string) {
		const model = practice.modelAnswer.trim();
		if (!model) return 'No model direction is published for this question yet.';
		if (!answer.trim()) return model;
		const missing = criteria.filter((criterion) => !criterion.present);
		if (missing.length === 0) {
			return `Your answer has the main ingredients. A cleaner model direction is: ${model}`;
		}
		return `Keep what is working, then add ${missing
			.slice(0, 2)
			.map((criterion) => criterion.title.toLowerCase())
			.join(' and ')}. Model direction: ${model}`;
	}

	function buildHints() {
		return [
			activeStage
				? {
						title: activeStage.shortTitle,
						text: activeStage.goal
					}
				: null,
			practice.weakAnswerExplanation
				? {
						title: 'Common trap',
						text: `Avoid this: ${practice.weakAnswerExplanation}`
					}
				: null,
			practice.weakAnswerText
				? {
						title: 'Weak answer',
						text: `Do not stop at: ${practice.weakAnswerText}`
					}
				: null
		].filter((item): item is { title: string; text: string } => Boolean(item?.text));
	}

	function setMode(nextMode: Mode) {
		mode = nextMode;
		checked = false;
		gradeResult = null;
		gradeError = '';
		showModelAnswer = false;
		if (nextMode === 'full' && !fullAnswer.trim() && draftedAnswer.trim()) {
			fullAnswer = draftedAnswer;
		}
	}

	function updateActiveStepAnswer(value: string) {
		if (!activeStage) return;
		stepAnswers = { ...stepAnswers, [activeStage.id]: value };
		checked = false;
		gradeResult = null;
		gradeError = '';
		showModelAnswer = false;
	}

	function updateFullAnswer(value: string) {
		fullAnswer = value;
		checked = false;
		gradeResult = null;
		gradeError = '';
		showModelAnswer = false;
	}

	function goToStage(index: number) {
		activeStageIndex = Math.max(0, Math.min(practice.stages.length - 1, index));
		checked = false;
		hintOpen = false;
	}

	function nextStage() {
		if (activeStageIndex < practice.stages.length - 1) {
			goToStage(activeStageIndex + 1);
			return;
		}
		setMode('full');
	}

	function resetWork() {
		stepAnswers = blankStepAnswers();
		fullAnswer = '';
		activeStageIndex = 0;
		checked = false;
		gradeResult = null;
		gradeError = '';
		gradePhase = 'idle';
		showModelAnswer = false;
		hintOpen = false;
		mode = practice.isExtended ? 'steps' : 'full';
	}

	function statusText(phase: GradePhase) {
		if (phase === 'connecting') return 'Starting check';
		if (phase === 'calling') return 'Checking answer';
		if (phase === 'thinking') return 'Reading against the mark scheme';
		if (phase === 'grading') return 'Preparing feedback';
		if (phase === 'done') return 'Checked';
		if (phase === 'error') return 'Checklist fallback';
		return 'Check answer';
	}

	async function checkAnswer() {
		if (!canCheck) return;

		checked = false;
		gradeError = '';
		gradeResult = null;
		gradePhase = 'connecting';
		showModelAnswer = false;

		try {
			const response = await fetch(
				resolve('/api/questions/[questionId]/grade', { questionId: practice.questionId }),
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ answer: answerForFeedback })
				}
			);

			if (!response.ok || !response.body) {
				throw new Error(`Grading request failed with ${response.status}`);
			}

			await readSseStream(response.body);
			if (!gradeResult) throw new Error('Grading stream ended without a result.');
			checked = true;
		} catch (error) {
			console.error('[english-practice] model grading failed; using checklist fallback', error);
			gradePhase = 'error';
			gradeError = 'Live model grading is unavailable, so this check uses the mark checklist.';
			checked = true;
		}
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

			if (field === 'event') event = value;
			if (field === 'data') dataLines.push(value);
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

		if (message.event === 'done') {
			gradeResult = JSON.parse(message.data) as GradeResult;
			gradePhase = 'done';
			return;
		}

		if (message.event === 'error') {
			throw new Error('Model grading stream returned an error.');
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
		if (loadedQuestionId === practice.questionId) return;
		loadedQuestionId = practice.questionId;
		resetWork();
	});
</script>

<svelte:head>
	<title>{question.title} practice | Question Constellation</title>
	<meta
		name="description"
		content="Practise a GCSE English question by building an answer step by step or writing the full answer, then checking it against the mark focus."
	/>
</svelte:head>

<main class="qc-real-app qc-english-practice-app">
	<AppTopbar subject="English" {subjects} searchPlaceholder="Search English questions" />

	<div class="qc-english-practice-layout">
		<aside class="qc-english-practice-side" aria-label="Question and mark support">
			<IconBackLink href={resolve('/english')} label="Back to question finder" />
			<p class="qc-real-kicker">{question.meta.qualification} {question.meta.subject}</p>
			<h1><MathText text={question.title} /></h1>
			<div class="qc-question-meta-stack" aria-label="Exam metadata">
				<span>{question.meta.board}</span>
				<span>{question.meta.paper}</span>
				<span>{question.sourceRef}</span>
				<span>{question.meta.marks} marks</span>
			</div>

			<ExamQuestionCard {question} showTitle={false} assetLoading="eager" />

			{#if practice.instructions.length > 0}
				<section class="qc-english-support-panel">
					<p class="qc-panel-label">Question instructions</p>
					<ul>
						{#each practice.instructions as instruction}
							<li><MathText text={instruction} /></li>
						{/each}
					</ul>
				</section>
			{/if}

			<section class="qc-english-support-panel" aria-label="Mark focus">
				<div class="qc-english-section-title">
					<ListChecks size={18} aria-hidden="true" />
					<h2>Mark focus</h2>
				</div>
				<ol class="qc-english-criteria-list">
					{#each displayGrade.criteria as criterion}
						<li class:present={criterion.present}>
							{#if criterion.present}
								<Check size={17} aria-hidden="true" />
							{:else}
								<Circle size={17} aria-hidden="true" />
							{/if}
							<span><MathText text={criterion.title} /></span>
							<em>{criterion.marks}</em>
						</li>
					{/each}
				</ol>
			</section>
		</aside>

		<section class="qc-english-practice-main" aria-label="Guided answer workspace">
			<div class="qc-english-main-head">
				<div>
					<p class="qc-real-kicker">Guided answer</p>
					<h2>
						{practice.isExtended
							? 'Build the answer, then check it.'
							: 'Write the answer, then check it.'}
					</h2>
				</div>
				<strong class="qc-english-score">{markText}</strong>
			</div>

			<div class="qc-english-mode-tabs" role="tablist" aria-label="Practice mode">
				<button
					type="button"
					class:active={mode === 'steps'}
					aria-selected={mode === 'steps'}
					role="tab"
					onclick={() => setMode('steps')}
				>
					<ListChecks size={17} aria-hidden="true" />
					Step build
				</button>
				<button
					type="button"
					class:active={mode === 'full'}
					aria-selected={mode === 'full'}
					role="tab"
					onclick={() => setMode('full')}
				>
					<PenLine size={17} aria-hidden="true" />
					Full answer
				</button>
			</div>

			<HintPanel hints={hintItems} bind:open={hintOpen} />

			{#if mode === 'steps'}
				<section class="qc-english-work-panel" aria-label="Step build">
					{#if practice.stages.length > 1}
						<div class="qc-english-stepper" aria-label="Answer build stages">
							{#each practice.stages as stage, index}
								<button
									type="button"
									class:active={index === activeStageIndex}
									class:complete={(stepAnswers[stage.id] ?? '').trim().length > 8}
									onclick={() => goToStage(index)}
									aria-label={`Open ${stage.title}`}
								>
									<span>{index + 1}</span>
									<strong>{stage.shortTitle}</strong>
								</button>
							{/each}
						</div>

						<div class="qc-english-progress" aria-hidden="true">
							<div style={`width: ${stageProgress}%`}></div>
						</div>
					{/if}

					{#if activeStage}
						<section class="qc-english-current-step">
							<div class="qc-english-section-title">
								<ClipboardCheck size={18} aria-hidden="true" />
								<h3>{activeStage.title}</h3>
							</div>
							<p><MathText text={activeStage.revealedText} /></p>
						</section>

						<label class="qc-english-answer-box">
							<span><MathText text={activeStage.prompt} /></span>
							<small><MathText text={activeStage.goal} /></small>
							<ResponseRenderer
								response={lineResponse(practice.stepLineCount)}
								answer={stepAnswers[activeStage.id] ?? ''}
								onAnswerChange={updateActiveStepAnswer}
							/>
						</label>
					{/if}

					<div class="qc-english-actions">
						<button
							type="button"
							class="qc-english-secondary"
							onclick={() => goToStage(activeStageIndex - 1)}
							disabled={activeStageIndex === 0}
						>
							<ChevronLeft size={18} aria-hidden="true" />
							Back
						</button>
						<button type="button" class="qc-english-primary" onclick={nextStage}>
							{#if activeStageIndex === practice.stages.length - 1}
								<PenLine size={18} aria-hidden="true" />
								Full answer
							{:else}
								<ChevronRight size={18} aria-hidden="true" />
								Next part
							{/if}
						</button>
					</div>
				</section>

				<section class="qc-english-draft" aria-label="Working answer">
					<div class="qc-english-section-title">
						<ClipboardCheck size={18} aria-hidden="true" />
						<h3>Working answer</h3>
					</div>
					{#if draftedAnswer}
						<ol>
							{#each practice.stages as stage, index}
								<li class:empty={!(stepAnswers[stage.id] ?? '').trim()}>
									<span>{index + 1}</span>
									<p><MathText text={(stepAnswers[stage.id] ?? '').trim() || stage.goal} /></p>
								</li>
							{/each}
						</ol>
					{:else}
						<p>Your notes collect here, then move into the full answer box.</p>
					{/if}
				</section>
			{:else}
				<section class="qc-english-work-panel" aria-label="Full answer">
					<label class="qc-english-answer-box full">
						<span>Write the full answer</span>
						<small>Use the question on the left, then check against the mark focus.</small>
						<ResponseRenderer
							response={lineResponse(practice.fullLineCount)}
							answer={fullAnswer}
							onAnswerChange={updateFullAnswer}
						/>
					</label>

					<div class="qc-english-actions">
						<button type="button" class="qc-english-secondary" onclick={() => setMode('steps')}>
							<ListChecks size={18} aria-hidden="true" />
							Build in steps
						</button>
						<button
							type="button"
							class="qc-english-primary"
							onclick={checkAnswer}
							disabled={!canCheck}
						>
							{#if isChecking}
								<span class="loading-spinner button-spinner" aria-hidden="true"></span>
								{statusText(gradePhase)}
							{:else}
								<ClipboardCheck size={18} aria-hidden="true" />
								Check answer
							{/if}
						</button>
					</div>
				</section>
			{/if}

			<section class="qc-english-feedback-panel" aria-label="Answer feedback">
				<div class="qc-english-section-title">
					<ClipboardCheck size={18} aria-hidden="true" />
					<h3>{checked ? 'Feedback' : 'Draft check'}</h3>
				</div>

				{#if isChecking}
					<p class="qc-english-status">{statusText(gradePhase)}.</p>
				{:else if gradeError}
					<p class="qc-english-status warning">{gradeError}</p>
				{:else if !answerForFeedback.trim()}
					<p class="qc-english-status">Write one step or a full answer to see what is missing.</p>
				{/if}

				{#if feedbackMarkdown}
					<MarkdownContent markdown={feedbackMarkdown} class="qc-english-feedback-markdown" />
				{/if}

				<div class="qc-english-feedback-grid">
					{#each displayGrade.criteria as criterion}
						<div class:present={criterion.present}>
							{#if criterion.present}
								<Check size={18} aria-hidden="true" />
							{:else}
								<Circle size={18} aria-hidden="true" />
							{/if}
							<span>
								<strong><MathText text={criterion.title} /></strong>
								<small
									><MathText
										text={criterion.present ? criterion.found : criterion.missing}
									/></small
								>
							</span>
						</div>
					{/each}
				</div>

				<div class="qc-english-next-step">
					<strong>Next best fix</strong>
					<p><MathText text={nextAdvice} /></p>
				</div>

				{#if checked || gradeError}
					<button
						type="button"
						class="qc-english-secondary qc-english-model-toggle"
						onclick={() => (showModelAnswer = !showModelAnswer)}
					>
						{showModelAnswer ? 'Hide model direction' : 'Show model direction'}
					</button>
					{#if showModelAnswer}
						<p class="qc-english-model-direction"><MathText text={modelDirection} /></p>
					{/if}
				{/if}
			</section>

			<div class="qc-english-bottom-actions">
				<span>{completedStepCount}/{practice.stages.length} steps drafted</span>
				<button type="button" class="qc-english-reset" onclick={resetWork}>
					<RotateCcw size={18} aria-hidden="true" />
					Reset
				</button>
			</div>
		</section>
	</div>
</main>

<style>
	.qc-english-practice-layout {
		display: grid;
		width: min(100%, 91rem);
		margin: 0 auto;
	}

	.qc-english-practice-side,
	.qc-english-practice-main {
		display: grid;
		align-content: start;
		min-width: 0;
	}

	.qc-english-practice-side {
		gap: 0.95rem;
		overflow-x: hidden;
		padding: clamp(1.1rem, 2.5vw, 2rem);
		border-bottom: 1px solid rgba(105, 129, 143, 0.15);
		background: color-mix(in srgb, #ffffff 58%, transparent);
		backdrop-filter: blur(16px);
	}

	.qc-english-practice-main {
		gap: 1rem;
		padding: clamp(1rem, 2.4vw, 2rem);
	}

	.qc-english-practice-side h1 {
		margin: 0;
		color: #123f35;
		font-size: clamp(1.45rem, 2.8vw, 2.25rem);
		font-weight: 520;
		letter-spacing: 0;
		line-height: 1.06;
	}

	.qc-english-support-panel,
	.qc-english-work-panel,
	.qc-english-draft,
	.qc-english-feedback-panel {
		display: grid;
		gap: 0.85rem;
		width: min(100%, 980px);
		padding: clamp(0.85rem, 1.8vw, 1.1rem);
		border: 1px solid #102033;
		background: color-mix(in srgb, #ffffff 64%, transparent);
		backdrop-filter: blur(14px);
	}

	.qc-english-support-panel ul,
	.qc-english-draft ol,
	.qc-english-criteria-list {
		display: grid;
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.qc-english-support-panel li {
		color: #26394f;
		font-size: 0.92rem;
		line-height: 1.38;
	}

	.qc-english-main-head,
	.qc-english-bottom-actions {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
		width: min(100%, 980px);
		min-width: 0;
	}

	.qc-english-main-head h2,
	.qc-english-section-title h2,
	.qc-english-section-title h3 {
		margin: 0;
		color: #102033;
		font-size: clamp(1.08rem, 2vw, 1.32rem);
		font-weight: 480;
		line-height: 1.2;
	}

	.qc-english-section-title {
		display: flex;
		align-items: center;
		gap: 0.52rem;
		color: #0d5a3f;
	}

	.qc-english-section-title :global(svg) {
		flex: 0 0 auto;
		color: #168458;
	}

	.qc-english-score {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		padding: 0.34rem 0.62rem;
		border: 1px solid rgba(92, 118, 130, 0.32);
		background: #ffffff;
		color: #244b68;
		font-size: 0.82rem;
		font-weight: 520;
		line-height: 1.1;
		white-space: nowrap;
	}

	.qc-english-mode-tabs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		width: min(100%, 980px);
		border: 1px solid #102033;
		background: color-mix(in srgb, #ffffff 68%, transparent);
	}

	.qc-english-mode-tabs button,
	.qc-english-stepper button,
	.qc-english-primary,
	.qc-english-secondary,
	.qc-english-reset {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.42rem;
		min-height: 2.55rem;
		border: 0;
		background: transparent;
		color: #102033;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 520;
		line-height: 1.1;
		cursor: pointer;
	}

	.qc-english-mode-tabs button + button {
		border-left: 1px solid #102033;
	}

	.qc-english-mode-tabs button.active {
		background: #edfaf3;
		color: #0d5a3f;
	}

	.qc-english-stepper {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(5.2rem, 1fr));
		border: 1px solid #102033;
		background: #ffffff;
	}

	.qc-english-stepper button {
		flex-direction: column;
		gap: 0.12rem;
		min-height: 3.35rem;
		padding: 0.38rem;
		border-left: 1px solid rgba(16, 32, 51, 0.22);
	}

	.qc-english-stepper button:first-child {
		border-left: 0;
	}

	.qc-english-stepper button.active,
	.qc-english-stepper button.complete {
		background: #edfaf3;
		color: #0d5a3f;
	}

	.qc-english-stepper button span,
	.qc-english-draft li span {
		display: inline-grid;
		width: 1.34rem;
		height: 1.34rem;
		place-items: center;
		border: 1px solid currentColor;
		font-size: 0.78rem;
		font-weight: 620;
	}

	.qc-english-stepper button strong {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.76rem;
		line-height: 1.05;
	}

	.qc-english-progress {
		height: 0.42rem;
		overflow: hidden;
		background: #d9e0ea;
	}

	.qc-english-progress div {
		height: 100%;
		background: linear-gradient(90deg, #168458, #2f73bd);
		transition: width 0.2s ease;
	}

	.qc-english-current-step {
		display: grid;
		gap: 0.55rem;
		padding-bottom: 0.85rem;
		border-bottom: 1px solid rgba(16, 32, 51, 0.22);
	}

	.qc-english-current-step p,
	.qc-english-draft > p,
	.qc-english-next-step p,
	.qc-english-model-direction,
	.qc-english-status {
		margin: 0;
		color: #526778;
		font-size: 0.96rem;
		font-weight: 400;
		line-height: 1.42;
		overflow-wrap: anywhere;
	}

	.qc-english-answer-box {
		display: grid;
		gap: 0.35rem;
	}

	.qc-english-answer-box span {
		color: #102033;
		font-size: 0.96rem;
		font-weight: 620;
	}

	.qc-english-answer-box small {
		color: #64748b;
		font-size: 0.86rem;
		line-height: 1.35;
	}

	.qc-english-answer-box :global(.lined-textarea) {
		margin-top: 0.35rem;
		color: #111827;
		font-size: 1rem;
	}

	.qc-english-actions {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.7rem;
		justify-content: space-between;
	}

	.qc-english-primary,
	.qc-english-secondary,
	.qc-english-reset {
		padding: 0.58rem 0.82rem;
		border: 1px solid #102033;
		background: #ffffff;
	}

	.qc-english-primary {
		margin-left: auto;
		border-color: #168458;
		background: #168458;
		color: #ffffff;
	}

	.qc-english-secondary,
	.qc-english-reset {
		color: #0d5a3f;
	}

	.qc-english-primary:disabled,
	.qc-english-secondary:disabled {
		border-color: #94a3b8;
		background: #eef2f7;
		color: #64748b;
		cursor: not-allowed;
	}

	.qc-english-draft li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.62rem;
		padding-top: 0.55rem;
		border-top: 1px solid rgba(16, 32, 51, 0.18);
	}

	.qc-english-draft li span {
		background: #edfaf3;
		color: #0d5a3f;
	}

	.qc-english-draft li p {
		margin: 0;
		color: #102033;
		font-size: 0.94rem;
		line-height: 1.42;
		overflow-wrap: anywhere;
	}

	.qc-english-draft li.empty p {
		color: #7a8796;
	}

	.qc-english-criteria-list li,
	.qc-english-feedback-grid > div {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.58rem;
		align-items: start;
		padding-top: 0.55rem;
		border-top: 1px solid rgba(16, 32, 51, 0.18);
		color: #102033;
	}

	.qc-english-feedback-grid > div {
		grid-template-columns: auto minmax(0, 1fr);
	}

	.qc-english-criteria-list :global(svg),
	.qc-english-feedback-grid :global(svg) {
		margin-top: 0.12rem;
		color: #94a3b8;
	}

	.qc-english-criteria-list li.present :global(svg),
	.qc-english-feedback-grid > div.present :global(svg) {
		color: #168458;
	}

	.qc-english-criteria-list span,
	.qc-english-feedback-grid strong,
	.qc-english-next-step strong {
		color: #102033;
		font-size: 0.92rem;
		font-weight: 620;
		line-height: 1.22;
	}

	.qc-english-criteria-list em {
		color: #27415f;
		font-size: 0.82rem;
		font-style: normal;
		font-weight: 620;
	}

	.qc-english-feedback-grid {
		display: grid;
		gap: 0.58rem;
	}

	.qc-english-feedback-grid small {
		display: block;
		margin-top: 0.18rem;
		color: #526778;
		font-size: 0.84rem;
		line-height: 1.34;
	}

	.qc-english-status.warning {
		color: #8a4a10;
	}

	:global(.qc-english-feedback-markdown) {
		--markdown-text: #344054;
		--markdown-strong: #102033;
		padding: 0.7rem 0;
		border-top: 1px solid rgba(16, 32, 51, 0.18);
		border-bottom: 1px solid rgba(16, 32, 51, 0.18);
	}

	.qc-english-next-step {
		padding-top: 0.7rem;
		border-top: 1px solid rgba(16, 32, 51, 0.18);
	}

	.qc-english-model-toggle {
		justify-self: start;
	}

	.qc-english-model-direction {
		padding: 0.85rem;
		border: 1px solid rgba(16, 32, 51, 0.24);
		background: #ffffff;
	}

	.qc-english-bottom-actions {
		align-items: center;
		color: #526778;
		font-size: 0.9rem;
	}

	@media (min-width: 900px) {
		.qc-english-practice-layout {
			grid-template-columns: minmax(22rem, 30rem) minmax(0, 1fr);
		}

		.qc-english-practice-side {
			position: sticky;
			top: 4rem;
			min-height: calc(var(--app-viewport-height, 100vh) - 4rem);
			border-right: 1px solid rgba(105, 129, 143, 0.16);
			border-bottom: 0;
		}
	}

	@media (max-width: 700px) {
		.qc-english-practice-layout {
			display: block;
			width: 100%;
			max-width: 100%;
		}

		.qc-english-practice-side {
			padding: 1rem 0.9rem;
		}

		.qc-english-practice-main {
			padding: 0.9rem 0.7rem 1.6rem;
		}

		.qc-english-practice-side :global(.qc-exam-context) {
			max-height: 16rem;
			overflow: auto;
		}

		.qc-english-practice-side .qc-english-support-panel {
			display: none;
		}

		.qc-english-main-head,
		.qc-english-bottom-actions {
			align-items: stretch;
			flex-direction: column;
		}

		.qc-english-score {
			width: fit-content;
		}

		.qc-english-actions {
			align-items: center;
			gap: 0.65rem;
		}

		.qc-english-actions .qc-english-primary,
		.qc-english-actions .qc-english-secondary {
			flex: 0 1 auto;
			min-width: 0;
		}
	}

	@media (max-width: 430px) {
		.qc-english-practice-side h1 {
			font-size: 1.55rem;
		}

		.qc-english-support-panel,
		.qc-english-work-panel,
		.qc-english-draft,
		.qc-english-feedback-panel {
			padding: 0.75rem;
		}

		.qc-english-stepper button strong {
			font-size: 0.7rem;
		}
	}

	:global(:root[data-theme='dark']) .qc-english-practice-side,
	:global(:root[data-theme='dark']) .qc-english-support-panel,
	:global(:root[data-theme='dark']) .qc-english-work-panel,
	:global(:root[data-theme='dark']) .qc-english-draft,
	:global(:root[data-theme='dark']) .qc-english-feedback-panel {
		border-color: rgba(148, 163, 184, 0.28);
		background: rgba(7, 20, 31, 0.7);
		color: #eaf4ff;
	}

	:global(:root[data-theme='dark']) .qc-english-practice-side h1,
	:global(:root[data-theme='dark']) .qc-english-main-head h2,
	:global(:root[data-theme='dark']) .qc-english-section-title h2,
	:global(:root[data-theme='dark']) .qc-english-section-title h3,
	:global(:root[data-theme='dark']) .qc-english-answer-box span,
	:global(:root[data-theme='dark']) .qc-english-feedback-grid strong,
	:global(:root[data-theme='dark']) .qc-english-next-step strong,
	:global(:root[data-theme='dark']) .qc-english-criteria-list span,
	:global(:root[data-theme='dark']) .qc-english-draft li p {
		color: #f8fafc;
	}

	:global(:root[data-theme='dark']) .qc-english-current-step p,
	:global(:root[data-theme='dark']) .qc-english-draft > p,
	:global(:root[data-theme='dark']) .qc-english-feedback-grid small,
	:global(:root[data-theme='dark']) .qc-english-next-step p,
	:global(:root[data-theme='dark']) .qc-english-model-direction,
	:global(:root[data-theme='dark']) .qc-english-status,
	:global(:root[data-theme='dark']) .qc-english-answer-box small,
	:global(:root[data-theme='dark']) .qc-english-bottom-actions,
	:global(:root[data-theme='dark']) .qc-english-support-panel li {
		color: #a9bbcc;
	}

	:global(:root[data-theme='dark']) .qc-english-score,
	:global(:root[data-theme='dark']) .qc-english-mode-tabs,
	:global(:root[data-theme='dark']) .qc-english-mode-tabs button,
	:global(:root[data-theme='dark']) .qc-english-stepper,
	:global(:root[data-theme='dark']) .qc-english-stepper button,
	:global(:root[data-theme='dark']) .qc-english-secondary,
	:global(:root[data-theme='dark']) .qc-english-reset,
	:global(:root[data-theme='dark']) .qc-english-model-direction {
		border-color: rgba(226, 232, 240, 0.42);
		background: #071426;
		color: #eaf4ff;
	}

	:global(:root[data-theme='dark']) .qc-english-answer-box :global(.lined-textarea) {
		color: #f8fafc;
		background-image: linear-gradient(
			to bottom,
			transparent calc(100% - 1px),
			rgba(248, 248, 242, 0.72) 0
		);
	}

	:global(:root[data-theme='dark']) .qc-english-mode-tabs button.active,
	:global(:root[data-theme='dark']) .qc-english-stepper button.active,
	:global(:root[data-theme='dark']) .qc-english-stepper button.complete {
		background: rgba(86, 216, 148, 0.16);
		color: #b8f7d5;
	}

	:global(:root[data-theme='dark']) .qc-english-primary {
		border-color: #56d894;
		background: #56d894;
		color: #052d1c;
	}
</style>
