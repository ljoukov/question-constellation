<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import HintPanel from '$lib/components/HintPanel.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import ResponseRenderer from '$lib/experiments/questions/components/ResponseRenderer.svelte';
	import type { ExamResponse } from '$lib/experiments/questions/types';
	import { markLabel } from '$lib/marks';
	import {
		installPracticeDraftWindowFlush,
		latestPracticeDraft,
		queuePracticeDraft,
		queuedPracticeDraftForQuestion
	} from '$lib/practiceDraftSync';
	import {
		isRecord,
		recordFromRecord,
		type PracticeDraftSave,
		type SavedPracticeDraft
	} from '$lib/practiceDrafts';
	import type { AdminUser } from '$lib/server/auth/session';
	import {
		Check,
		CheckCircle2,
		ChevronRight,
		Circle,
		ClipboardCheck,
		ExternalLink,
		LockKeyhole,
		RotateCcw
	} from '@lucide/svelte';
	import { onMount } from 'svelte';

	type GradePhase = 'idle' | 'connecting' | 'calling' | 'thinking' | 'grading' | 'done' | 'error';
	type EnglishStepGradeResult = {
		status: 'ok';
		decision: 'pass' | 'revise';
		stepId: string;
		checkedAnswer: string;
		checks: Array<{
			id: string;
			label: string;
			status: 'met' | 'not_yet';
			feedback: string;
		}>;
		nextImprovement: string;
		coachingNote: string;
		learnerModel: {
			observedStrength: string;
			recurringNeed: string;
			nextStrategy: string;
		};
		confidence: number;
		model: string;
		modelVersion: string;
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
		successCriteria?: Array<{ id: string; label: string; description: string }>;
		hints?: Array<{ title: string; text: string }>;
	};

	type EnglishLearnerAttempt = {
		stepId: string;
		stepTitle: string;
		answer: string;
		decision: 'pass' | 'revise';
		checks: EnglishStepGradeResult['checks'];
		nextImprovement: string;
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
		sourcePaperUrl?: string | null;
		instructions: string[];
		stages: Stage[];
		stepLineCount: number;
		fullLineCount: number;
	};

	type StoredEnglishPracticeState = {
		stepAnswers?: Record<string, string>;
		stepResults?: Record<string, EnglishStepGradeResult>;
		attemptHistory?: EnglishLearnerAttempt[];
		updatedAt?: number;
	};

	type SseMessage = {
		event: string;
		data: string;
	};

	let {
		practice,
		stepId = '',
		savedDraft = null,
		userId = null,
		user = null
	}: {
		practice: EnglishPractice;
		stepId?: string;
		savedDraft?: SavedPracticeDraft | null;
		userId?: string | null;
		user?: AdminUser | null;
	} = $props();

	const subjects = [...BROWSE_SUBJECTS];
	let loadedQuestionId = $state('');
	let hydrated = $state(false);
	let stepAnswers = $state<Record<string, string>>({});
	let stepResults = $state<Record<string, EnglishStepGradeResult>>({});
	let attemptHistory = $state<EnglishLearnerAttempt[]>([]);
	let gradePhase = $state<GradePhase>('idle');
	let gradeError = $state('');
	let hintOpen = $state(false);
	let lastQueuedDraftSignature = '';

	const question = $derived(practice.question);
	const topbarSubject = $derived(englishSubjectOrDefault(question.meta.subject));
	const finderHref = $derived(`${resolve('/english')}?course=${encodeURIComponent(topbarSubject)}`);
	const activeStageIndex = $derived(
		Math.max(
			0,
			practice.stages.findIndex((stage) => stage.id === stepId)
		)
	);
	const activeStage = $derived(practice.stages[activeStageIndex] ?? practice.stages[0]);
	const activeAnswer = $derived((stepAnswers[activeStage?.id] ?? '').trim());
	const activeResult = $derived(validResultForStage(activeStage));
	const activePassed = $derived(activeResult?.decision === 'pass');
	const furthestUnlockedIndex = $derived(calculateFurthestUnlockedIndex());
	const isChecking = $derived(
		gradePhase === 'connecting' ||
			gradePhase === 'calling' ||
			gradePhase === 'thinking' ||
			gradePhase === 'grading'
	);
	const canCheck = $derived(activeAnswer.length >= 8 && !isChecking);
	const hintItems = $derived(buildStepHints(activeStage));
	const metaChips = $derived(
		uniqueLabels([
			question.meta.board,
			question.meta.tier,
			question.meta.paper,
			markLabel(question.meta.marks)
		])
	);

	function blankStepAnswers() {
		return Object.fromEntries(practice.stages.map((stage) => [stage.id, '']));
	}

	function uniqueLabels(values: Array<string | null | undefined>) {
		const seen: string[] = [];
		return values
			.map((value) => value?.replace(/\s+/g, ' ').trim())
			.filter((value): value is string => Boolean(value))
			.filter((value) => {
				const key = value.toLowerCase();
				if (seen.includes(key)) return false;
				seen.push(key);
				return true;
			});
	}

	function lineResponse(stage: Stage): ExamResponse {
		const isFinalStage = practice.stages.at(-1)?.id === stage.id;
		return { kind: 'lines', count: isFinalStage ? practice.fullLineCount : practice.stepLineCount };
	}

	function stepHref(stage: Stage) {
		return resolve('/questions/[questionId]/practice/step-by-step/[stepId]', {
			questionId: practice.questionId,
			stepId: stage.id
		});
	}

	function resultMatchesAnswer(
		result: EnglishStepGradeResult | undefined,
		stage: Stage | undefined
	) {
		if (!result || !stage) return false;
		return result.checkedAnswer.trim() === (stepAnswers[stage.id] ?? '').trim();
	}

	function validResultForStage(stage: Stage | undefined) {
		if (!stage) return null;
		const result = stepResults[stage.id];
		return resultMatchesAnswer(result, stage) ? result : null;
	}

	function stagePassed(stage: Stage, index: number) {
		if (index > furthestUnlockedIndex) return false;
		return validResultForStage(stage)?.decision === 'pass';
	}

	function calculateFurthestUnlockedIndex() {
		if (practice.stages.length === 0) return 0;
		let unlocked = 0;
		for (let index = 0; index < practice.stages.length - 1; index += 1) {
			const stage = practice.stages[index];
			if (validResultForStage(stage)?.decision !== 'pass') break;
			unlocked = index + 1;
		}
		return unlocked;
	}

	function englishPracticeStorageKey(questionId: string, version = 'v3') {
		return `question-constellation:english-practice:${version}:${userId ?? 'anonymous'}:${questionId}`;
	}

	function loadStoredEnglishPracticeState(questionId: string): StoredEnglishPracticeState | null {
		if (typeof window === 'undefined') return null;
		for (const version of ['v3', 'v2', 'v1']) {
			try {
				const raw = window.sessionStorage.getItem(englishPracticeStorageKey(questionId, version));
				if (raw) return JSON.parse(raw) as StoredEnglishPracticeState;
			} catch {
				// Try the older state before giving up.
			}
		}
		return null;
	}

	function saveStoredEnglishPracticeState(questionId: string) {
		if (typeof window === 'undefined') return;
		try {
			window.sessionStorage.setItem(
				englishPracticeStorageKey(questionId),
				JSON.stringify({ stepAnswers, stepResults, attemptHistory, updatedAt: Date.now() })
			);
		} catch {
			// The page remains usable without session-history restoration.
		}
	}

	function stringRecord(value: Record<string, unknown> | null) {
		if (!value) return {};
		return Object.fromEntries(
			Object.entries(value).filter(
				(entry): entry is [string, string] => typeof entry[1] === 'string'
			)
		);
	}

	function gradeResultRecord(value: Record<string, unknown> | null) {
		if (!value) return {};
		return Object.fromEntries(
			Object.entries(value).filter(
				(entry): entry is [string, EnglishStepGradeResult] =>
					isRecord(entry[1]) &&
					(entry[1].decision === 'pass' || entry[1].decision === 'revise') &&
					typeof entry[1].checkedAnswer === 'string' &&
					Array.isArray(entry[1].checks)
			)
		);
	}

	function learnerAttemptList(value: unknown): EnglishLearnerAttempt[] {
		if (!Array.isArray(value)) return [];
		return value
			.filter(
				(item): item is EnglishLearnerAttempt =>
					isRecord(item) &&
					typeof item.stepId === 'string' &&
					typeof item.stepTitle === 'string' &&
					typeof item.answer === 'string' &&
					(item.decision === 'pass' || item.decision === 'revise') &&
					Array.isArray(item.checks) &&
					typeof item.nextImprovement === 'string'
			)
			.slice(-16);
	}

	function englishStateFromDraft(draft: PracticeDraftSave | SavedPracticeDraft | null) {
		if (!draft || draft.draftKind !== 'english-guided' || !isRecord(draft.payload)) return null;
		return {
			stepAnswers: stringRecord(recordFromRecord(draft.payload, 'stepAnswers')),
			stepResults: gradeResultRecord(recordFromRecord(draft.payload, 'stepResults')),
			attemptHistory: learnerAttemptList(draft.payload.attemptHistory),
			updatedAt: draft.clientUpdatedAt
		} satisfies StoredEnglishPracticeState;
	}

	function initialEnglishPracticeState(questionId: string) {
		const storedState = loadStoredEnglishPracticeState(questionId);
		const draftState = englishStateFromDraft(
			latestPracticeDraft(savedDraft, queuedPracticeDraftForQuestion(userId, questionId))
		);
		if (!storedState) return draftState;
		if (!draftState) return storedState;
		return (draftState.updatedAt ?? 0) >= (storedState.updatedAt ?? 0) ? draftState : storedState;
	}

	function draftPayload() {
		return { stepAnswers, stepResults, attemptHistory } satisfies Record<string, unknown>;
	}

	function persistState() {
		if (!hydrated || loadedQuestionId !== practice.questionId) return;
		saveStoredEnglishPracticeState(practice.questionId);
		if (!userId) return;
		const signature = JSON.stringify(draftPayload());
		if (signature === lastQueuedDraftSignature) return;
		lastQueuedDraftSignature = signature;
		queuePracticeDraft(userId, {
			questionId: practice.questionId,
			draftKind: 'english-guided',
			answerText: practice.stages
				.map((stage) => (stepAnswers[stage.id] ?? '').trim())
				.filter(Boolean)
				.join('\n\n'),
			payload: draftPayload(),
			clientUpdatedAt: Date.now()
		});
	}

	function invalidateFromStage(index: number) {
		const invalidatedIds = practice.stages.slice(index).map((stage) => stage.id);
		stepResults = Object.fromEntries(
			Object.entries(stepResults).filter(([id]) => !invalidatedIds.includes(id))
		);
	}

	function updateActiveAnswer(value: string) {
		if (!activeStage) return;
		stepAnswers = { ...stepAnswers, [activeStage.id]: value };
		invalidateFromStage(activeStageIndex);
		gradePhase = 'idle';
		gradeError = '';
		persistState();
	}

	function openStage(index: number) {
		if (index < 0 || index >= practice.stages.length || index > furthestUnlockedIndex) return;
		gradePhase = 'idle';
		gradeError = '';
		hintOpen = false;
		void goto(stepHref(practice.stages[index]), { noScroll: true, keepFocus: false });
	}

	function continueToNextStage() {
		if (!activePassed) return;
		const nextStage = practice.stages[activeStageIndex + 1];
		if (nextStage) openStage(activeStageIndex + 1);
	}

	function resetPractice() {
		stepAnswers = blankStepAnswers();
		stepResults = {};
		attemptHistory = [];
		gradePhase = 'idle';
		gradeError = '';
		hintOpen = false;
		persistState();
		const firstStage = practice.stages[0];
		if (firstStage) void goto(stepHref(firstStage), { replaceState: true, noScroll: true });
	}

	function buildStepHints(stage: Stage | undefined) {
		if (!stage) return [];
		if (stage.hints?.length) return stage.hints;
		const hintsByStep: Record<string, Array<{ title: string; text: string }>> = {
			task: [
				{
					title: 'Find the contrast',
					text: 'Name the clearest difference between the two characters before explaining why it matters.'
				},
				{
					title: 'Build an argument',
					text: 'Move beyond a list of traits: what does the contrast allow the writer to reveal or criticise?'
				},
				{
					title: 'Sentence frame',
					text: 'The writer contrasts ___ with ___ to suggest that ___.'
				}
			],
			evidence: [
				{
					title: 'Choose one detail',
					text: 'Select a short quotation, action, or moment that directly supports the argument you passed.'
				},
				{
					title: 'Make it analysable',
					text: 'Prefer evidence containing a particular word, behaviour, or contrast you can examine closely.'
				}
			],
			method: [
				{
					title: 'Zoom in',
					text: 'Explain how a word, behaviour, narrative choice, structure, or contrast creates meaning.'
				},
				{
					title: 'Avoid technique spotting',
					text: 'Naming a method is not enough. Connect the choice to a precise impression or idea.'
				}
			],
			wider: [
				{
					title: 'Choose another moment',
					text: 'Find a precise event elsewhere in the text that develops the same argument.'
				},
				{
					title: 'Add something new',
					text: 'Use the wider moment to extend or complicate the interpretation, not simply repeat it.'
				}
			],
			'full-answer': [
				{
					title: 'Keep one argument',
					text: 'Use the responses you have already passed as building blocks for one sustained answer.'
				},
				{
					title: 'Check the journey',
					text: 'Move from argument to evidence, analyse the writer’s choice, then connect to the wider text.'
				}
			]
		};
		return (
			hintsByStep[stage.id] ?? [
				{ title: stage.shortTitle, text: stage.revealedText },
				{ title: 'What good looks like', text: stage.goal }
			]
		);
	}

	function statusText(phase: GradePhase) {
		if (phase === 'connecting') return 'Starting check';
		if (phase === 'calling') return 'Checking your step';
		if (phase === 'thinking') return 'Reading your response';
		if (phase === 'grading') return 'Preparing feedback';
		return 'Checking your step';
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
			return null;
		}
		if (message.event === 'done') return JSON.parse(message.data) as EnglishStepGradeResult;
		if (message.event === 'error') throw new Error('The step checker returned an error.');
		return null;
	}

	async function readSseStream(body: ReadableStream<Uint8Array>) {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let result: EnglishStepGradeResult | null = null;
		while (true) {
			const { done, value } = await reader.read();
			buffer += decoder.decode(value, { stream: !done });
			let separatorIndex = buffer.indexOf('\n\n');
			while (separatorIndex !== -1) {
				const block = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + 2);
				const message = parseSseBlock(block);
				if (message) result = handleSseMessage(message) ?? result;
				separatorIndex = buffer.indexOf('\n\n');
			}
			if (done) break;
		}
		const trailingMessage = parseSseBlock(buffer.trim());
		if (trailingMessage) result = handleSseMessage(trailingMessage) ?? result;
		return result;
	}

	async function checkActiveStep() {
		if (!activeStage || !canCheck) return;
		gradeError = '';
		gradePhase = 'connecting';
		try {
			const response = await fetch(
				resolve('/api/questions/[questionId]/grade-step', {
					questionId: practice.questionId
				}),
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						stepId: activeStage.id,
						answer: activeAnswer,
						stepAnswers,
						attemptHistory
					})
				}
			);
			if (!response.ok || !response.body) {
				throw new Error(`Step check failed with ${response.status}`);
			}
			const result = await readSseStream(response.body);
			if (!result) throw new Error('The step check ended without feedback.');
			stepResults = { ...stepResults, [activeStage.id]: result };
			attemptHistory = [
				...attemptHistory,
				{
					stepId: activeStage.id,
					stepTitle: activeStage.title,
					answer: activeAnswer,
					decision: result.decision,
					checks: result.checks,
					nextImprovement: result.nextImprovement
				}
			].slice(-16);
			gradePhase = 'done';
			persistState();
		} catch (error) {
			console.error('[english-step-practice] step check failed', error);
			gradePhase = 'error';
			gradeError =
				'This step could not be checked right now. Your response is saved—please try again.';
		}
	}

	function primaryAction() {
		if (activePassed) {
			continueToNextStage();
			return;
		}
		void checkActiveStep();
	}

	function primaryLabel() {
		if (isChecking) return statusText(gradePhase);
		if (activePassed) {
			return activeStageIndex === practice.stages.length - 1 ? 'Practice complete' : 'Continue';
		}
		return activeResult?.decision === 'revise' ? 'Check again' : 'Check step';
	}

	$effect(() => {
		if (loadedQuestionId === practice.questionId) return;
		loadedQuestionId = practice.questionId;
		hydrated = false;
		const storedState = initialEnglishPracticeState(practice.questionId);
		stepAnswers = { ...blankStepAnswers(), ...(storedState?.stepAnswers ?? {}) };
		stepResults = storedState?.stepResults ?? {};
		attemptHistory = storedState?.attemptHistory ?? [];
		lastQueuedDraftSignature = JSON.stringify({ stepAnswers, stepResults, attemptHistory });
		hydrated = true;
	});

	$effect(() => {
		if (!hydrated || activeStageIndex <= furthestUnlockedIndex) return;
		const unlockedStage = practice.stages[furthestUnlockedIndex];
		if (unlockedStage) {
			void goto(stepHref(unlockedStage), { replaceState: true, noScroll: true });
		}
	});

	onMount(() => installPracticeDraftWindowFlush(userId));
</script>

<svelte:head>
	<title>{question.title} step-by-step practice | Question Constellation</title>
	<meta
		name="description"
		content="Build a GCSE English answer one checked step at a time, then combine the steps into a complete response."
	/>
</svelte:head>

<main class="qc-step-practice-app">
	<AppTopbar
		{user}
		subject={topbarSubject}
		{subjects}
		searchPlaceholder="Search English questions"
		showNavigation
	/>

	<div class="qc-step-practice-layout">
		<aside class="qc-step-question" aria-label="Question">
			<IconBackLink href={finderHref} label="Back to question finder" />
			<p class="qc-step-eyebrow">{question.meta.qualification} {question.meta.subject}</p>
			<h1>Question {question.sourceRef}</h1>
			<div class="qc-step-meta" aria-label="Exam information">
				{#each metaChips as chip (chip)}
					<span>{chip}</span>
				{/each}
			</div>

			<ExamQuestionCard
				{question}
				showTitle={false}
				showHeader={false}
				showMeta={false}
				assetLoading="eager"
			/>

			{#if practice.sourcePaperUrl}
				<a
					class="qc-step-source-link"
					href={practice.sourcePaperUrl}
					target="_blank"
					rel="noreferrer"
				>
					<span>
						<strong>Open the full source paper</strong>
						<small>Use it whenever you need the printed source text.</small>
					</span>
					<ExternalLink size={16} aria-hidden="true" />
				</a>
			{/if}

			{#if practice.instructions.length > 0}
				<section class="qc-step-instructions">
					<p>Question instructions</p>
					<ul>
						{#each practice.instructions as instruction (instruction)}
							<li><MathText text={instruction} /></li>
						{/each}
					</ul>
				</section>
			{/if}
		</aside>

		<section class="qc-step-workspace" aria-label="Step-by-step answer practice">
			<nav
				class="qc-stepper"
				aria-label="Answer steps"
				style={`--step-count: ${practice.stages.length}`}
			>
				{#each practice.stages as stage, index (stage.id)}
					{@const locked = index > furthestUnlockedIndex}
					{@const passed = stagePassed(stage, index)}
					<button
						type="button"
						class:active={index === activeStageIndex}
						class:passed
						class:locked
						disabled={locked}
						onclick={() => openStage(index)}
						aria-current={index === activeStageIndex ? 'step' : undefined}
						aria-label={locked ? `${stage.shortTitle}, locked` : `Open ${stage.shortTitle}`}
					>
						<span class="qc-step-number">
							{#if passed}
								<Check size={15} strokeWidth={2.7} aria-hidden="true" />
							{:else if locked}
								<LockKeyhole size={13} aria-hidden="true" />
							{:else}
								{index + 1}
							{/if}
						</span>
						<strong>{stage.shortTitle}</strong>
					</button>
				{/each}
			</nav>

			<HintPanel hints={hintItems} bind:open={hintOpen} />

			{#if activeStage}
				<section class="qc-step-card" aria-labelledby="active-step-title">
					<header class="qc-step-card-head">
						<div>
							<p>Step {activeStageIndex + 1} of {practice.stages.length}</p>
							<h2 id="active-step-title">{activeStage.title}</h2>
						</div>
						{#if activePassed}
							<span class="qc-step-pass-badge">
								<CheckCircle2 size={17} aria-hidden="true" />
								Passed
							</span>
						{/if}
					</header>

					<p class="qc-step-explanation"><MathText text={activeStage.revealedText} /></p>
					<p class="qc-step-goal">
						<strong>For this step</strong>
						<span><MathText text={activeStage.goal} /></span>
					</p>

					<label class="qc-step-answer">
						<span><MathText text={activeStage.prompt} /></span>
						<ResponseRenderer
							response={lineResponse(activeStage)}
							answer={stepAnswers[activeStage.id] ?? ''}
							onAnswerChange={updateActiveAnswer}
						/>
					</label>

					<div class="qc-step-action-row">
						<small>
							{activeAnswer.length < 8 && !activePassed
								? 'Write a meaningful response before checking.'
								: activePassed
									? 'This step has met the required standard.'
									: 'Your response will be checked against this step only.'}
						</small>
						<button
							type="button"
							class="qc-step-primary"
							onclick={primaryAction}
							disabled={activePassed ? activeStageIndex === practice.stages.length - 1 : !canCheck}
						>
							{#if isChecking}
								<span class="qc-step-spinner" aria-hidden="true"></span>
							{:else if activePassed && activeStageIndex < practice.stages.length - 1}
								<ChevronRight size={18} aria-hidden="true" />
							{:else}
								<ClipboardCheck size={18} aria-hidden="true" />
							{/if}
							{primaryLabel()}
						</button>
					</div>
				</section>

				{#if isChecking || gradeError || activeResult}
					<section class="qc-step-feedback" aria-live="polite" aria-label="Feedback">
						<header>
							<div>
								<p>Feedback</p>
								<h3>
									{activeResult?.decision === 'pass'
										? 'Step passed'
										: activeResult
											? 'Revise this step'
											: isChecking
												? statusText(gradePhase)
												: 'Check unavailable'}
								</h3>
							</div>
							{#if activeResult}
								<span class:passed={activeResult.decision === 'pass'}>
									{activeResult.decision === 'pass' ? 'Ready to continue' : 'Not ready yet'}
								</span>
							{/if}
						</header>

						{#if isChecking}
							<div class="qc-step-checking">
								<span class="qc-step-spinner dark" aria-hidden="true"></span>
								<p>{statusText(gradePhase)}…</p>
							</div>
						{:else if gradeError}
							<p class="qc-step-error">{gradeError}</p>
						{:else if activeResult}
							<div class="qc-step-checks">
								{#each activeResult.checks as check (check.id)}
									<div class:met={check.status === 'met'}>
										{#if check.status === 'met'}
											<CheckCircle2 size={20} aria-hidden="true" />
										{:else}
											<Circle size={20} aria-hidden="true" />
										{/if}
										<span>
											<strong>{check.label}</strong>
											<small>{check.feedback}</small>
										</span>
									</div>
								{/each}
							</div>
							<div class="qc-step-next-improvement">
								<strong
									>{activeResult.decision === 'pass' ? 'Carry forward' : 'Next improvement'}</strong
								>
								<p>{activeResult.nextImprovement}</p>
							</div>
							{#if activeResult.coachingNote}
								<div class="qc-step-coaching-note">
									<strong
										>{attemptHistory.length > 1
											? 'Your learning pattern'
											: 'Your current focus'}</strong
									>
									<p>{activeResult.coachingNote}</p>
								</div>
							{/if}
						{/if}
					</section>
				{/if}
			{/if}

			<footer class="qc-step-footer">
				<span
					>{practice.stages.filter((stage) => validResultForStage(stage)?.decision === 'pass')
						.length}/{practice.stages.length} steps passed</span
				>
				<button type="button" onclick={resetPractice}>
					<RotateCcw size={16} aria-hidden="true" />
					Reset practice
				</button>
			</footer>
		</section>
	</div>
</main>

<style>
	.qc-step-practice-app {
		--step-ink: #122c2a;
		--step-muted: #607076;
		--step-line: #c9d1d0;
		--step-paper: #fffdf7;
		--step-green: #087a55;
		--step-green-soft: #eaf7f0;
		min-height: var(--app-viewport-height, 100vh);
		background:
			linear-gradient(115deg, rgba(255, 248, 222, 0.56), transparent 38%),
			linear-gradient(295deg, rgba(255, 228, 227, 0.48), transparent 42%), #f8faf7;
		color: var(--step-ink);
		overflow-x: clip;
	}

	.qc-step-practice-layout {
		display: grid;
		grid-template-columns: minmax(24rem, 32rem) minmax(0, 1fr);
		width: min(100%, 94rem);
		min-width: 0;
		min-height: calc(var(--app-viewport-height, 100vh) - 4rem);
		margin: 0 auto;
	}

	.qc-step-question {
		display: grid;
		align-content: start;
		gap: 0.95rem;
		min-width: 0;
		padding: clamp(1.4rem, 2.5vw, 2.35rem);
		border-right: 1px solid rgba(63, 79, 82, 0.18);
		background: rgba(255, 253, 247, 0.78);
	}

	.qc-step-question :global(.qc-exam-card) {
		max-width: 100%;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.qc-step-source-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 0.85rem;
		border: 1px solid #9badaa;
		background: rgba(238, 246, 241, 0.72);
		color: #164f40;
		text-decoration: none;
	}

	.qc-step-source-link:hover {
		border-color: #47816f;
		background: #eef6f1;
	}

	.qc-step-source-link span {
		display: grid;
		gap: 0.12rem;
		min-width: 0;
	}

	.qc-step-source-link strong {
		font-size: 0.84rem;
	}

	.qc-step-source-link small {
		color: #617572;
		font-size: 0.75rem;
	}

	.qc-step-eyebrow,
	.qc-step-card-head p,
	.qc-step-feedback header p,
	.qc-step-instructions > p {
		margin: 0;
		color: #597078;
		font-size: 0.76rem;
		font-weight: 750;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}

	.qc-step-question h1 {
		margin: -0.2rem 0 0;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: clamp(2rem, 3vw, 2.75rem);
		font-weight: 500;
		letter-spacing: -0.04em;
	}

	.qc-step-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.qc-step-meta span {
		padding: 0.38rem 0.58rem;
		border: 1px solid #98a7a9;
		background: rgba(255, 255, 255, 0.52);
		font-size: 0.78rem;
		font-weight: 650;
	}

	.qc-step-instructions {
		padding: 0.9rem 1rem;
		border: 1px solid var(--step-line);
		background: rgba(255, 255, 255, 0.55);
	}

	.qc-step-instructions ul {
		margin: 0.55rem 0 0;
		padding-left: 1.1rem;
		color: var(--step-muted);
		font-size: 0.88rem;
	}

	.qc-step-workspace {
		display: grid;
		align-content: start;
		gap: 1.1rem;
		min-width: 0;
		max-width: 100%;
		padding: clamp(1.4rem, 3.4vw, 3rem);
	}

	.qc-stepper {
		display: grid;
		grid-template-columns: repeat(var(--step-count), minmax(0, 1fr));
		border: 1px solid #9ba9aa;
		background: rgba(255, 255, 255, 0.55);
		max-width: 100%;
		min-width: 0;
	}

	.qc-stepper button {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.48rem;
		min-width: 0;
		min-height: 3.8rem;
		padding: 0.65rem 0.45rem;
		border: 0;
		border-right: 1px solid #c7cece;
		background: transparent;
		color: #48595e;
		cursor: pointer;
		transition:
			background 140ms ease,
			color 140ms ease;
	}

	.qc-stepper button:last-child {
		border-right: 0;
	}

	.qc-stepper button::after {
		position: absolute;
		right: -1px;
		bottom: -1px;
		left: -1px;
		height: 3px;
		content: '';
		background: transparent;
	}

	.qc-stepper button.active {
		background: #f0f8f3;
		color: #07583f;
	}

	.qc-stepper button.active::after {
		background: var(--step-green);
	}

	.qc-stepper button.passed {
		color: #076448;
	}

	.qc-stepper button.locked {
		background: rgba(232, 235, 234, 0.52);
		color: #9aa4a5;
		cursor: not-allowed;
	}

	.qc-stepper strong {
		overflow: hidden;
		font-size: 0.82rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.qc-step-number {
		display: grid;
		place-items: center;
		width: 1.45rem;
		height: 1.45rem;
		border: 1px solid currentColor;
		font-size: 0.72rem;
		font-weight: 750;
	}

	.qc-step-card,
	.qc-step-feedback {
		border: 1px solid #7f9092;
		background: rgba(255, 253, 247, 0.94);
		box-shadow: 0 16px 40px rgba(31, 50, 50, 0.055);
	}

	.qc-step-card {
		padding: clamp(1.2rem, 2.5vw, 2rem);
	}

	.qc-step-card-head,
	.qc-step-feedback > header,
	.qc-step-action-row,
	.qc-step-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.qc-step-card-head h2,
	.qc-step-feedback h3 {
		margin: 0.22rem 0 0;
		font-family: Georgia, 'Times New Roman', serif;
		font-weight: 500;
		letter-spacing: -0.025em;
	}

	.qc-step-card-head h2 {
		font-size: clamp(1.55rem, 2.6vw, 2.2rem);
	}

	.qc-step-pass-badge,
	.qc-step-feedback > header > span {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		padding: 0.38rem 0.58rem;
		border: 1px solid #b8c2c1;
		color: #6b777a;
		font-size: 0.76rem;
		font-weight: 700;
		white-space: nowrap;
	}

	.qc-step-pass-badge,
	.qc-step-feedback > header > span.passed {
		border-color: #75a991;
		background: var(--step-green-soft);
		color: #066043;
	}

	.qc-step-explanation {
		max-width: 52rem;
		margin: 1.15rem 0 0;
		color: #4d6268;
		font-size: 1rem;
		line-height: 1.6;
	}

	.qc-step-goal {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.7rem;
		margin: 1rem 0 1.25rem;
		padding: 0.72rem 0.82rem;
		border-left: 3px solid #178463;
		background: #eef6f1;
		color: #36544c;
		font-size: 0.88rem;
		line-height: 1.45;
	}

	.qc-step-goal strong {
		color: #0b6047;
	}

	.qc-step-answer {
		display: grid;
		gap: 0.65rem;
	}

	.qc-step-answer > span {
		color: #182d32;
		font-size: 1.03rem;
		font-weight: 720;
	}

	.qc-step-answer :global(.lined-textarea) {
		--qc-response-textarea-bg: rgba(255, 255, 255, 0.5);
		--qc-response-caret: #087a55;
		border-color: #8a999b;
		font-size: 1rem;
		line-height: 2rem;
	}

	.qc-step-action-row {
		align-items: flex-end;
		margin-top: 1.15rem;
	}

	.qc-step-action-row small {
		max-width: 27rem;
		color: #758185;
		font-size: 0.78rem;
		line-height: 1.4;
	}

	.qc-step-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.48rem;
		min-width: 9.25rem;
		min-height: 2.85rem;
		padding: 0.68rem 1.05rem;
		border: 1px solid #075c42;
		background: #087a55;
		color: white;
		font: inherit;
		font-size: 0.88rem;
		font-weight: 750;
		cursor: pointer;
	}

	.qc-step-primary:hover:not(:disabled) {
		background: #066848;
	}

	.qc-step-primary:disabled {
		border-color: #b2bcbc;
		background: #dce1df;
		color: #74807e;
		cursor: not-allowed;
	}

	.qc-step-spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid rgba(255, 255, 255, 0.45);
		border-top-color: currentColor;
		border-radius: 50%;
		animation: qc-step-spin 0.75s linear infinite;
	}

	.qc-step-spinner.dark {
		border-color: rgba(8, 122, 85, 0.2);
		border-top-color: #087a55;
	}

	@keyframes qc-step-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.qc-step-feedback {
		overflow: hidden;
	}

	.qc-step-feedback > header {
		padding: 1rem 1.15rem;
		border-bottom: 1px solid var(--step-line);
		background: rgba(247, 249, 246, 0.76);
	}

	.qc-step-feedback h3 {
		font-size: 1.38rem;
	}

	.qc-step-checking {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 1.5rem 1.15rem;
		color: var(--step-muted);
	}

	.qc-step-checking p,
	.qc-step-error {
		margin: 0;
	}

	.qc-step-error {
		padding: 1.15rem;
		color: #8b352f;
	}

	.qc-step-checks {
		display: grid;
	}

	.qc-step-checks > div {
		display: grid;
		grid-template-columns: 1.35rem minmax(0, 1fr);
		gap: 0.75rem;
		padding: 0.9rem 1.15rem;
		border-bottom: 1px solid #d8dedc;
		color: #8d9999;
	}

	.qc-step-checks > div.met {
		color: var(--step-green);
	}

	.qc-step-checks span {
		display: grid;
		gap: 0.22rem;
	}

	.qc-step-checks strong {
		color: #263a3e;
		font-size: 0.9rem;
	}

	.qc-step-checks small {
		color: #65757a;
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.qc-step-next-improvement {
		padding: 1rem 1.15rem 1.15rem;
		border-left: 3px solid #b97a33;
		background: #fff9eb;
	}

	.qc-step-next-improvement strong {
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.qc-step-next-improvement p {
		margin: 0.32rem 0 0;
		color: #4b5759;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.qc-step-coaching-note {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.75rem;
		padding: 0.85rem 1.15rem;
		border-top: 1px solid #d8dedc;
		background: #f3f7f4;
	}

	.qc-step-coaching-note strong {
		color: #315b4d;
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.qc-step-coaching-note p {
		margin: 0;
		color: #526568;
		font-size: 0.84rem;
		line-height: 1.45;
	}

	.qc-step-footer {
		padding-top: 0.2rem;
		color: #718083;
		font-size: 0.78rem;
	}

	.qc-step-footer button {
		display: inline-flex;
		align-items: center;
		gap: 0.42rem;
		padding: 0.35rem;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.qc-step-footer button:hover {
		color: #334b4b;
	}

	:global(.qc-step-workspace .qc-hint-panel) {
		margin: -0.1rem 0 0;
	}

	@media (max-width: 920px) {
		.qc-step-practice-layout {
			grid-template-columns: 1fr;
		}

		.qc-step-question {
			border-right: 0;
			border-bottom: 1px solid rgba(63, 79, 82, 0.18);
		}

		.qc-step-question h1 {
			font-size: 2rem;
		}
	}

	@media (max-width: 640px) {
		.qc-step-practice-layout,
		.qc-step-question,
		.qc-step-workspace {
			width: 100%;
			max-width: 100%;
			min-width: 0;
		}

		.qc-step-question,
		.qc-step-workspace {
			padding: 1rem;
		}

		.qc-stepper {
			display: flex;
			overflow-x: auto;
			overscroll-behavior-x: contain;
		}

		.qc-stepper button {
			flex: 0 0 4.75rem;
			flex-direction: column;
			min-height: 3.35rem;
			gap: 0.2rem;
		}

		.qc-stepper strong {
			overflow: visible;
			font-size: 0.7rem;
			text-overflow: clip;
		}

		.qc-step-card {
			padding: 1rem;
		}

		.qc-step-card-head,
		.qc-step-feedback > header,
		.qc-step-action-row {
			align-items: stretch;
			flex-direction: column;
		}

		.qc-step-pass-badge,
		.qc-step-feedback > header > span {
			align-self: flex-start;
		}

		.qc-step-goal {
			grid-template-columns: 1fr;
			gap: 0.2rem;
		}

		.qc-step-coaching-note {
			grid-template-columns: 1fr;
			gap: 0.25rem;
		}

		.qc-step-primary {
			width: 100%;
		}
	}
</style>
