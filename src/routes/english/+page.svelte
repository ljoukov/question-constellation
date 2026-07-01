<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import ResponseRenderer from '$lib/experiments/questions/components/ResponseRenderer.svelte';
	import type { ExamResponse } from '$lib/experiments/questions/types';
	import type { PageProps } from './$types';
	import {
		Check,
		ChevronLeft,
		ChevronRight,
		Circle,
		ClipboardCheck,
		Eye,
		ListChecks,
		PenLine,
		RotateCcw
	} from '@lucide/svelte';

	type Mode = 'steps' | 'full';
	type GradePhase = 'idle' | 'connecting' | 'calling' | 'thinking' | 'grading' | 'done' | 'error';

	type Stage = {
		id: string;
		stepId: string;
		title: string;
		shortTitle: string;
		markRange: string;
		revealTitle: string;
		revealedText: string;
		prompt: string;
		placeholder: string;
		goal: string;
	};

	type Criterion = {
		id: string;
		stepId: string;
		title: string;
		marks: number;
		present: boolean;
		found: string;
		missing: string;
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

	const subjects = ['English', 'Biology', 'Chemistry', 'Physics'];
	const fallbackQuestionId = 'english-lit-romeo-juliet-fate-guided';
	const stepResponse = { kind: 'lines', count: 5 } satisfies ExamResponse;
	const fullResponse = { kind: 'lines', count: 16 } satisfies ExamResponse;
	let { data }: PageProps = $props();

	const fallbackQuestion = {
		id: fallbackQuestionId,
		board: 'OCR',
		qualification: 'GCSE',
		subject: 'English Literature',
		paper: 'J352/02 Exploring poetry and Shakespeare',
		marks: 40,
		sourceQuestionRef: '4*',
		source: 'OCR June 2024 J352/02 Question 4*',
		title: 'How Shakespeare presents fate in Romeo and Juliet',
		stem: 'Explore the ways in which Shakespeare presents fate in this tragedy. Refer to this extract which is the Prologue and elsewhere in the play.',
		modelAnswer:
			'Shakespeare presents fate as a force that seems to shape the whole tragedy before the action begins. The Prologue calls Romeo and Juliet "star-cross\'d lovers", suggesting that their love is controlled by forces beyond ordinary choice, while "death-mark\'d love" makes the ending feel unavoidable. The Chorus also creates dramatic irony because the audience knows the lovers are doomed before they do. This idea develops elsewhere when Romeo calls himself "fortune\'s fool" after Mercutio dies and later declares "I defy you, stars", as if he tries to fight the fate already set out in the opening. A strong answer could also argue that Shakespeare leaves space for human responsibility: the family feud, Friar Lawrence\'s failed plan and the missed letter all make fate look like a mixture of destiny, chance and human error. For an audience familiar with astrology and tragedy, the language of stars and fortune would make the lovers seem trapped by a larger order.',
		instructions: [
			'Write about how fate is presented in this extract.',
			'Write about how Shakespeare presents fate elsewhere in the play.',
			'Use references to the play to support your answer.',
			'Remember that 6 marks are available for spelling, punctuation, grammar and specialist terminology.'
		],
		extract: [
			'Two households, both alike in dignity,',
			'In fair Verona, where we lay our scene,',
			'From ancient grudge break to new mutiny,',
			'Where civil blood makes civil hands unclean.',
			'From forth the fatal loins of these two foes',
			"A pair of star-cross'd lovers take their life;",
			'Whose misadventured piteous overthrows',
			"Doth with their death bury their parents' strife.",
			"The fearful passage of their death-mark'd love,",
			"And the continuance of their parents' rage,",
			"Which, but their children's end, nought could remove,",
			"Is now the two hours' traffic of our stage;",
			'The which if you with patient ears attend,',
			'What here shall miss, our toil shall strive to mend.'
		]
	};
	const question = $derived(data.guidedQuestion ?? fallbackQuestion);
	const questionId = $derived(question.id ?? fallbackQuestionId);

	const stages: Stage[] = [
		{
			id: 'task',
			stepId: 'english-chain-romeo-juliet-fate-step-claim',
			title: 'Read the task',
			shortTitle: 'Task',
			markRange: '0-8',
			revealTitle: 'Question focus',
			revealedText:
				'The task is not asking for a plot summary. It asks how Shakespeare presents fate in the tragedy, starting with the Prologue and then reaching elsewhere in the play.',
			prompt: 'What exactly must your answer prove about fate?',
			placeholder: 'Shakespeare presents fate as...',
			goal: 'Make a direct claim about fate and tragedy.'
		},
		{
			id: 'evidence',
			stepId: 'english-chain-romeo-juliet-fate-step-evidence',
			title: 'Choose first evidence',
			shortTitle: 'Quote',
			markRange: '8-16',
			revealTitle: 'First extract slice',
			revealedText:
				'"Star-cross\'d lovers", "fatal loins", and "death-mark\'d love" all let you write about fate, danger, and an ending that seems fixed from the start.',
			prompt: 'Choose one word or phrase from the extract and say why it matters.',
			placeholder: 'The phrase "star-cross\'d lovers" matters because...',
			goal: 'Anchor the point in a quotation instead of making a general comment.'
		},
		{
			id: 'analysis',
			stepId: 'english-chain-romeo-juliet-fate-step-method',
			title: 'Explain the method',
			shortTitle: 'Effect',
			markRange: '16-25',
			revealTitle: 'Language lens',
			revealedText:
				'The Chorus tells the audience the ending before the play unfolds. That creates dramatic irony and makes the lovers seem trapped inside the pattern of tragedy.',
			prompt: 'What does Shakespeare make the audience understand through the Prologue?',
			placeholder: 'This makes the audience see the lovers as...',
			goal: 'Move from quotation to effect: what the method makes the audience understand.'
		},
		{
			id: 'development',
			stepId: 'english-chain-romeo-juliet-fate-step-wider',
			title: 'Open the wider question',
			shortTitle: 'Link',
			markRange: '25-32',
			revealTitle: 'More of the question',
			revealedText:
				'The full question also asks about elsewhere in the play. You could link to Queen Mab, "fortune\'s fool", "I defy you, stars", Friar Lawrence\'s failed message, or the tomb scene.',
			prompt: 'Where else in the play could you connect this idea of fate?',
			placeholder: 'Elsewhere, fate seems important when...',
			goal: 'Show that the paragraph can grow beyond the extract.'
		},
		{
			id: 'response',
			stepId: 'english-chain-romeo-juliet-fate-step-context',
			title: 'Build the full answer',
			shortTitle: 'Essay',
			markRange: '32-40',
			revealTitle: 'Full response shape',
			revealedText:
				"A high-mark answer makes a clear argument, uses evidence, analyses Shakespeare's choices, links the Prologue to the wider play, and keeps expression controlled for the SPaG marks.",
			prompt: 'Turn your notes into one developed paragraph.',
			placeholder: 'Shakespeare presents fate in Romeo and Juliet by...',
			goal: 'Join the previous steps into a paragraph that can be checked against the mark scheme.'
		}
	];

	const initialStepAnswers = stages.reduce<Record<string, string>>((answers, stage) => {
		answers[stage.id] = '';
		return answers;
	}, {});

	let mode = $state<Mode>('steps');
	let activeStageIndex = $state(0);
	let stepAnswers = $state<Record<string, string>>({ ...initialStepAnswers });
	let fullAnswer = $state('');
	let checked = $state(false);
	let gradePhase = $state<GradePhase>('idle');
	let gradeError = $state('');
	let gradeResult = $state<GradeResult | null>(null);
	let showModelAnswer = $state(false);

	const activeStage = $derived(stages[activeStageIndex]);
	const visibleStages = $derived(stages.slice(0, activeStageIndex + 1));
	const draftedAnswer = $derived(buildDraftFromSteps());
	const answerForFeedback = $derived(mode === 'full' ? fullAnswer : draftedAnswer);
	const deterministicGrade = $derived(gradeAnswer(answerForFeedback));
	const displayGrade = $derived(
		gradeResult ? gradeFromModelResult(gradeResult) : deterministicGrade
	);
	const completedStepCount = $derived(
		stages.filter((stage) => stepAnswers[stage.id].trim().length > 12).length
	);
	const stageProgress = $derived(Math.round(((activeStageIndex + 1) / stages.length) * 100));
	const isChecking = $derived(
		gradePhase === 'connecting' ||
			gradePhase === 'calling' ||
			gradePhase === 'thinking' ||
			gradePhase === 'grading'
	);
	const canCheck = $derived(answerForFeedback.trim().length > 0 && !isChecking);
	const markText = $derived(
		displayGrade.score === null ? 'Not checked' : `${displayGrade.score}/${question.marks}`
	);
	const modelDirection = $derived(makeModelDirection(displayGrade.criteria, answerForFeedback));
	const nextAdvice = $derived(makeNextAdvice(displayGrade.criteria, answerForFeedback));
	const feedbackMarkdown = $derived((gradeResult?.feedbackMarkdown ?? '').trim());

	function includesAny(text: string, terms: string[]) {
		const lower = text.toLowerCase();
		return terms.some((term) => lower.includes(term.toLowerCase()));
	}

	function baseCriteria(answer: string): Criterion[] {
		const trimmed = answer.trim();
		const hasAttempt = trimmed.length > 0;
		return [
			{
				id: 'argument',
				stepId: 'english-chain-romeo-juliet-fate-step-claim',
				title: 'Clear answer to the task',
				marks: 8,
				present:
					hasAttempt &&
					includesAny(trimmed, [
						'fate',
						'fated',
						'destiny',
						'predetermin',
						'doomed',
						'chance',
						'fortune',
						'tragedy'
					]) &&
					includesAny(trimmed, ['Romeo', 'Juliet', 'Shakespeare']),
				found: 'You make an argument about fate rather than only retelling the plot.',
				missing: 'Start with a direct argument about how Shakespeare presents fate in the tragedy.'
			},
			{
				id: 'evidence',
				stepId: 'english-chain-romeo-juliet-fate-step-evidence',
				title: 'Precise textual evidence',
				marks: 8,
				present: includesAny(trimmed, [
					'star-cross',
					'fatal loins',
					'death-mark',
					'ancient grudge',
					'misadventured',
					'fortune',
					'defy you, stars',
					'prologue',
					'chorus'
				]),
				found: 'You use textual evidence that can be analysed.',
				missing: 'Add a short quotation or precise reference from the Prologue or wider play.'
			},
			{
				id: 'method',
				stepId: 'english-chain-romeo-juliet-fate-step-method',
				title: "Analysis of Shakespeare's methods",
				marks: 9,
				present: includesAny(trimmed, [
					'suggest',
					'imply',
					'connot',
					'image',
					'imagery',
					'sonnet',
					'prologue',
					'chorus',
					'foreshadow',
					'dramatic irony',
					'metaphor',
					'audience',
					'structure',
					'dramatic'
				]),
				found: 'You explain how a writer choice shapes meaning.',
				missing:
					"Explain what Shakespeare's language, structure, or dramatic irony makes the audience understand."
			},
			{
				id: 'wider',
				stepId: 'english-chain-romeo-juliet-fate-step-wider',
				title: 'Connection to the wider play',
				marks: 7,
				present: includesAny(trimmed, [
					'elsewhere',
					'later',
					'before',
					'after',
					'queen mab',
					"fortune's fool",
					'defy you, stars',
					'friar',
					'letter',
					'tomb',
					'mercutio',
					'tybalt',
					'act 3',
					'act 5'
				]),
				found: 'You connect the extract to the wider play.',
				missing:
					'Add one sentence linking the Prologue to another moment where fate, chance, or choice matters.'
			},
			{
				id: 'context',
				stepId: 'english-chain-romeo-juliet-fate-step-context',
				title: 'Context and controlled expression',
				marks: 8,
				present:
					includesAny(trimmed, [
						'Elizabethan',
						'Jacobean',
						'astrology',
						'stars',
						'fortune',
						'providence',
						'tragedy',
						'audience',
						'fate'
					]) && trimmed.split(/\s+/).length >= 50,
				found: 'You bring in context or audience expectations without making it the whole answer.',
				missing:
					'Link fate to relevant context or audience expectations, and keep expression controlled for the SPaG marks.'
			}
		];
	}

	function gradeAnswer(answer: string): { score: number | null; criteria: Criterion[] } {
		const trimmed = answer.trim();
		const criteria = baseCriteria(trimmed);
		if (!trimmed) return { score: null, criteria };

		const score = criteria.reduce(
			(sum, criterion) => sum + (criterion.present ? criterion.marks : 0),
			0
		);
		const lengthBonus = trimmed.split(/\s+/).length >= 120 ? 2 : 0;
		return { score: Math.min(question.marks, score + lengthBonus), criteria };
	}

	function gradeFromModelResult(result: GradeResult): {
		score: number | null;
		criteria: Criterion[];
	} {
		const presentStepIds = new Set(result.presentStepIds);
		const criteria = baseCriteria(answerForFeedback).map((criterion) => ({
			...criterion,
			present: presentStepIds.has(criterion.stepId)
		}));
		return { score: result.awardedMarks, criteria };
	}

	function buildDraftFromSteps() {
		return stages
			.map((stage) => stepAnswers[stage.id].trim())
			.filter(Boolean)
			.join(' ');
	}

	function makeModelDirection(criteria: Criterion[], answer: string) {
		const missing = criteria.filter((criterion) => !criterion.present);
		const base = question.modelAnswer;
		if (!answer.trim()) return base;
		if (missing.length === 0) {
			return `Your answer has the main ingredients. A cleaner model version would tighten the line of argument: ${base}`;
		}
		return `Keep the strongest parts of your answer, then add ${missing
			.slice(0, 2)
			.map((criterion) => criterion.title.toLowerCase())
			.join(' and ')}. Model direction: ${base}`;
	}

	function makeNextAdvice(criteria: Criterion[], answer: string) {
		if (!answer.trim()) return 'Start with one sentence that answers the exact task.';
		const missing = criteria.find((criterion) => !criterion.present);
		return missing
			? missing.missing
			: 'Now improve precision: reduce summary and make each quotation do more analytical work.';
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
		stepAnswers[activeStage.id] = value;
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
		activeStageIndex = Math.max(0, Math.min(stages.length - 1, index));
		checked = false;
	}

	function nextStage() {
		if (activeStageIndex < stages.length - 1) {
			goToStage(activeStageIndex + 1);
			return;
		}
		setMode('full');
	}

	function resetWork() {
		stepAnswers = { ...initialStepAnswers };
		fullAnswer = '';
		activeStageIndex = 0;
		checked = false;
		gradeResult = null;
		gradeError = '';
		gradePhase = 'idle';
		showModelAnswer = false;
		mode = 'steps';
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
			const response = await fetch(resolve('/api/questions/[questionId]/grade', { questionId }), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ answer: answerForFeedback })
			});

			if (!response.ok || !response.body) {
				throw new Error(`Grading request failed with ${response.status}`);
			}

			await readSseStream(response.body);
			if (!gradeResult) throw new Error('Grading stream ended without a result.');
			checked = true;
		} catch (error) {
			console.error('[english] model grading failed; using checklist fallback', error);
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
</script>

<svelte:head>
	<title>English guided answer practice | Question Constellation</title>
	<meta
		name="description"
		content="Practise high-mark GCSE English questions by building an answer step by step, then checking it against the mark scheme."
	/>
</svelte:head>

<main class="qc-real-app english-app">
	<AppTopbar subject="English" {subjects} searchPlaceholder="Search English papers" />

	<div class="qc-chain-layout english-layout">
		<aside class="qc-chain-side english-side" aria-label="Question and mark scheme support">
			<p class="qc-real-kicker">GCSE English</p>
			<h1>{question.title}</h1>
			<p>
				{question.board} · {question.qualification} · {question.subject}
			</p>

			<div class="english-meta" aria-label="Question metadata">
				<span>{question.paper}</span>
				<span>{question.marks} marks</span>
			</div>

			<section class="english-paper" aria-label="Full question">
				<div class="english-paper-number">
					<span>{question.sourceQuestionRef ?? '4*'}</span>
				</div>
				<div class="english-paper-body">
					<p class="english-source-label">{question.source}</p>
					<p class="english-stem">{question.stem}</p>
					<div class="english-extract" aria-label="Extract">
						{#each question.extract as line}
							<p>{line}</p>
						{/each}
					</div>
					<ul class="english-instructions">
						{#each question.instructions as instruction}
							<li>{instruction}</li>
						{/each}
					</ul>
					<p class="english-marks">[{question.marks}]</p>
				</div>
			</section>

			<section class="english-support-block" aria-label="Mark scheme focus">
				<div class="english-section-title">
					<ListChecks size={18} aria-hidden="true" />
					<h2>Mark scheme focus</h2>
				</div>
				<ol class="english-support-list">
					{#each displayGrade.criteria as criterion}
						<li class:present={criterion.present}>
							{#if criterion.present}
								<Check size={17} aria-hidden="true" />
							{:else}
								<Circle size={17} aria-hidden="true" />
							{/if}
							<span>{criterion.title}</span>
							<em>{criterion.marks}</em>
						</li>
					{/each}
				</ol>
			</section>
		</aside>

		<section class="qc-chain-main english-main" aria-label="Guided answer workspace">
			<div class="english-main-head">
				<div>
					<p class="qc-real-kicker">Guided answer</p>
					<h2>Build the paragraph, then check it.</h2>
				</div>
				<strong class="english-score">{markText}</strong>
			</div>

			<div class="english-mode-tabs" role="tablist" aria-label="Practice mode">
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

			{#if mode === 'steps'}
				<section class="english-work-panel" aria-label="Step build">
					<div class="english-stepper" aria-label="Answer build stages">
						{#each stages as stage, index}
							<button
								type="button"
								class:active={index === activeStageIndex}
								class:complete={stepAnswers[stage.id].trim().length > 12}
								onclick={() => goToStage(index)}
								aria-label={`Open ${stage.title}`}
							>
								<span>{index + 1}</span>
								<strong>{stage.shortTitle}</strong>
							</button>
						{/each}
					</div>

					<div class="english-progress" aria-hidden="true">
						<div style={`width: ${stageProgress}%`}></div>
					</div>

					<section class="english-current-step">
						<div class="english-section-title">
							<Eye size={18} aria-hidden="true" />
							<h3>{activeStage.title}</h3>
						</div>
						<p>{activeStage.revealedText}</p>
					</section>

					<label class="english-answer-box">
						<span>{activeStage.prompt}</span>
						<small>{activeStage.goal}</small>
						<ResponseRenderer
							response={stepResponse}
							answer={stepAnswers[activeStage.id]}
							onAnswerChange={updateActiveStepAnswer}
						/>
					</label>

					<div class="english-actions">
						<button
							type="button"
							class="english-secondary"
							onclick={() => goToStage(activeStageIndex - 1)}
							disabled={activeStageIndex === 0}
						>
							<ChevronLeft size={18} aria-hidden="true" />
							Back
						</button>
						<button
							type="button"
							class="english-primary"
							onclick={nextStage}
							aria-label={activeStageIndex === stages.length - 1
								? 'Write full answer'
								: 'Reveal next part'}
						>
							{#if activeStageIndex === stages.length - 1}
								<PenLine size={18} aria-hidden="true" />
								Full answer
							{:else}
								<ChevronRight size={18} aria-hidden="true" />
								Next part
							{/if}
						</button>
					</div>
				</section>

				<section class="english-draft" aria-label="Working answer plan">
					<div class="english-section-title">
						<ClipboardCheck size={18} aria-hidden="true" />
						<h3>Working answer</h3>
					</div>
					{#if draftedAnswer}
						<ol>
							{#each stages as stage, index}
								<li class:empty={!stepAnswers[stage.id].trim()}>
									<span>{index + 1}</span>
									<p>{stepAnswers[stage.id].trim() || stage.goal}</p>
								</li>
							{/each}
						</ol>
					{:else}
						<p>Your notes collect here, then move into the full answer box.</p>
					{/if}
				</section>
			{:else}
				<section class="english-work-panel" aria-label="Full answer">
					<label class="english-answer-box full">
						<span>Write the full answer</span>
						<small>Use the full question on the left, then check against the mark scheme.</small>
						<ResponseRenderer
							response={fullResponse}
							answer={fullAnswer}
							onAnswerChange={updateFullAnswer}
						/>
					</label>

					<div class="english-actions">
						<button type="button" class="english-secondary" onclick={() => setMode('steps')}>
							<ListChecks size={18} aria-hidden="true" />
							Build it in steps
						</button>
						<button
							type="button"
							class="english-primary"
							onclick={checkAnswer}
							disabled={!canCheck}
						>
							{#if isChecking}
								{statusText(gradePhase)}
							{:else}
								<ClipboardCheck size={18} aria-hidden="true" />
								Check answer
							{/if}
						</button>
					</div>
				</section>
			{/if}

			<section class="english-feedback-panel" aria-label="Answer feedback">
				<div class="english-section-title">
					<ClipboardCheck size={18} aria-hidden="true" />
					<h3>{checked ? 'Feedback' : 'Draft check'}</h3>
				</div>

				{#if isChecking}
					<p class="english-status">{statusText(gradePhase)}.</p>
				{:else if gradeError}
					<p class="english-status warning">{gradeError}</p>
				{:else if !answerForFeedback.trim()}
					<p class="english-status">Write one step or a full answer to see what is missing.</p>
				{/if}

				{#if feedbackMarkdown}
					<MarkdownContent markdown={feedbackMarkdown} class="english-feedback-markdown" />
				{/if}

				<div class="english-feedback-grid">
					{#each displayGrade.criteria as criterion}
						<div class:present={criterion.present}>
							{#if criterion.present}
								<Check size={18} aria-hidden="true" />
							{:else}
								<Circle size={18} aria-hidden="true" />
							{/if}
							<span>
								<strong>{criterion.title}</strong>
								<small>{criterion.present ? criterion.found : criterion.missing}</small>
							</span>
						</div>
					{/each}
				</div>

				<div class="english-next-step">
					<strong>Next best fix</strong>
					<p>{nextAdvice}</p>
				</div>

				{#if checked || gradeError}
					<button
						type="button"
						class="english-secondary english-model-toggle"
						onclick={() => (showModelAnswer = !showModelAnswer)}
					>
						{showModelAnswer ? 'Hide model direction' : 'Show model direction'}
					</button>
					{#if showModelAnswer}
						<p class="english-model-direction">{modelDirection}</p>
					{/if}
				{/if}
			</section>

			<div class="english-bottom-actions">
				<span>{completedStepCount}/{stages.length} steps drafted</span>
				<button type="button" class="english-reset" onclick={resetWork}>
					<RotateCcw size={18} aria-hidden="true" />
					Reset
				</button>
			</div>
		</section>
	</div>
</main>

<style>
	.english-app {
		--english-line: rgba(16, 32, 51, 0.34);
		--english-ink: #102033;
		--english-muted: #526778;
		--english-green: #168458;
		--english-blue: #2f73bd;
	}

	.english-layout {
		display: grid;
		width: min(100%, 91rem);
		margin: 0 auto;
	}

	.english-side,
	.english-main {
		display: grid;
		align-content: start;
		min-width: 0;
	}

	.english-side {
		gap: 0.95rem;
		overflow-x: hidden;
		padding: clamp(1.1rem, 2.5vw, 2rem);
		border-bottom: 1px solid rgba(105, 129, 143, 0.15);
		background: color-mix(in srgb, #ffffff 58%, transparent);
		backdrop-filter: blur(16px);
	}

	.english-main {
		gap: 1rem;
		padding: clamp(1rem, 2.4vw, 2rem);
	}

	.english-side h1 {
		margin: 0;
		color: #123f35;
		font-size: clamp(1.45rem, 2.8vw, 2.25rem);
		font-weight: 520;
		letter-spacing: 0;
		line-height: 1.06;
	}

	.english-side > p:not(.qc-real-kicker),
	.english-draft > p,
	.english-current-step p,
	.english-next-step p,
	.english-model-direction,
	.english-status {
		margin: 0;
		color: var(--english-muted);
		font-size: 0.96rem;
		font-weight: 400;
		line-height: 1.42;
		overflow-wrap: anywhere;
	}

	.english-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.42rem;
	}

	.english-meta span,
	.english-score {
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
	}

	.english-paper {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.85rem;
		min-width: 0;
		padding: 0.9rem;
		border: 1px solid #102033;
		background: #ffffff;
		color: #111111;
		font-family: Arial, Helvetica, sans-serif;
	}

	.english-paper-number {
		display: flex;
		align-items: start;
		padding-top: 0.05rem;
	}

	.english-paper-number span {
		display: inline-grid;
		width: 1.42rem;
		height: 1.42rem;
		place-items: center;
		border: 1px solid #111111;
		font-size: 0.9rem;
		font-weight: 700;
	}

	.english-paper-body {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.english-source-label,
	.english-stem,
	.english-instructions,
	.english-marks {
		margin: 0;
		font-size: 0.98rem;
		line-height: 1.45;
	}

	.english-source-label,
	.english-stem,
	.english-marks {
		font-weight: 700;
	}

	.english-extract {
		display: grid;
		gap: 0.16rem;
		padding-left: 0.8rem;
		border-left: 3px solid #111111;
	}

	.english-extract p {
		margin: 0;
		font-size: 0.98rem;
		line-height: 1.35;
	}

	.english-instructions {
		padding-left: 1.15rem;
	}

	.english-marks {
		justify-self: end;
	}

	.english-support-block,
	.english-work-panel,
	.english-draft,
	.english-feedback-panel {
		display: grid;
		gap: 0.85rem;
		padding: clamp(0.85rem, 1.8vw, 1.1rem);
		border: 1px solid #102033;
		background: color-mix(in srgb, #ffffff 64%, transparent);
		backdrop-filter: blur(14px);
	}

	.english-main-head {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
		min-width: 0;
	}

	.english-main-head h2,
	.english-section-title h2,
	.english-section-title h3 {
		margin: 0;
		color: #102033;
		font-size: clamp(1.08rem, 2vw, 1.32rem);
		font-weight: 480;
		line-height: 1.2;
	}

	.english-section-title {
		display: flex;
		align-items: center;
		gap: 0.52rem;
		color: #0d5a3f;
	}

	.english-section-title :global(svg) {
		flex: 0 0 auto;
		color: var(--english-green);
	}

	.english-mode-tabs {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		border: 1px solid #102033;
		background: color-mix(in srgb, #ffffff 68%, transparent);
	}

	.english-mode-tabs button,
	.english-stepper button,
	.english-primary,
	.english-secondary,
	.english-reset {
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

	.english-mode-tabs button + button {
		border-left: 1px solid #102033;
	}

	.english-mode-tabs button.active {
		background: #edfaf3;
		color: #0d5a3f;
	}

	.english-stepper {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		border: 1px solid #102033;
		background: #ffffff;
	}

	.english-stepper button {
		flex-direction: column;
		gap: 0.12rem;
		min-height: 3.35rem;
		padding: 0.38rem;
	}

	.english-stepper button + button {
		border-left: 1px solid rgba(16, 32, 51, 0.34);
	}

	.english-stepper button.active,
	.english-stepper button.complete {
		background: #edfaf3;
		color: #0d5a3f;
	}

	.english-stepper button span {
		display: inline-grid;
		width: 1.34rem;
		height: 1.34rem;
		place-items: center;
		border: 1px solid currentColor;
		font-size: 0.78rem;
		font-weight: 620;
	}

	.english-stepper button strong {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.76rem;
		line-height: 1.05;
	}

	.english-progress {
		height: 0.42rem;
		overflow: hidden;
		background: #d9e0ea;
	}

	.english-progress div {
		height: 100%;
		background: linear-gradient(90deg, #168458, #2f73bd);
		transition: width 0.2s ease;
	}

	.english-current-step {
		display: grid;
		gap: 0.55rem;
		padding-bottom: 0.85rem;
		border-bottom: 1px solid rgba(16, 32, 51, 0.22);
	}

	.english-answer-box {
		display: grid;
		gap: 0.35rem;
	}

	.english-answer-box span {
		color: #102033;
		font-size: 0.96rem;
		font-weight: 620;
	}

	.english-answer-box small {
		color: #64748b;
		font-size: 0.86rem;
		line-height: 1.35;
	}

	.english-answer-box :global(.lined-textarea) {
		margin-top: 0.35rem;
		color: #111827;
		font-size: 1rem;
	}

	.english-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		justify-content: space-between;
	}

	.english-primary,
	.english-secondary,
	.english-reset {
		padding: 0.58rem 0.82rem;
		border: 1px solid #102033;
		background: #ffffff;
	}

	.english-primary {
		border-color: #168458;
		background: #168458;
		color: #ffffff;
	}

	.english-secondary,
	.english-reset {
		color: #0d5a3f;
	}

	.english-primary:disabled,
	.english-secondary:disabled {
		border-color: #94a3b8;
		background: #eef2f7;
		color: #64748b;
		cursor: not-allowed;
	}

	.english-draft ol,
	.english-support-list {
		display: grid;
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.english-draft li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.62rem;
		padding-top: 0.55rem;
		border-top: 1px solid rgba(16, 32, 51, 0.18);
	}

	.english-draft li span {
		display: inline-grid;
		width: 1.55rem;
		height: 1.55rem;
		place-items: center;
		border: 1px solid #168458;
		background: #edfaf3;
		color: #0d5a3f;
		font-size: 0.78rem;
		font-weight: 620;
	}

	.english-draft li p {
		margin: 0;
		color: var(--english-ink);
		font-size: 0.94rem;
		line-height: 1.42;
		overflow-wrap: anywhere;
	}

	.english-draft li.empty p {
		color: #7a8796;
	}

	.english-support-list li,
	.english-feedback-grid > div {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.58rem;
		align-items: start;
		padding-top: 0.55rem;
		border-top: 1px solid rgba(16, 32, 51, 0.18);
		color: #102033;
	}

	.english-feedback-grid > div {
		grid-template-columns: auto minmax(0, 1fr);
	}

	.english-support-list :global(svg),
	.english-feedback-grid :global(svg) {
		margin-top: 0.12rem;
		color: #94a3b8;
	}

	.english-support-list li.present :global(svg),
	.english-feedback-grid > div.present :global(svg) {
		color: #168458;
	}

	.english-support-list span,
	.english-feedback-grid strong,
	.english-next-step strong {
		color: #102033;
		font-size: 0.92rem;
		font-weight: 620;
		line-height: 1.22;
	}

	.english-support-list em {
		color: #27415f;
		font-size: 0.82rem;
		font-style: normal;
		font-weight: 620;
	}

	.english-feedback-grid {
		display: grid;
		gap: 0.58rem;
	}

	.english-feedback-grid small {
		display: block;
		margin-top: 0.18rem;
		color: var(--english-muted);
		font-size: 0.84rem;
		line-height: 1.34;
	}

	.english-status.warning {
		color: #8a4a10;
	}

	:global(.english-feedback-markdown) {
		--markdown-text: #344054;
		--markdown-strong: #102033;
		padding: 0.7rem 0;
		border-top: 1px solid rgba(16, 32, 51, 0.18);
		border-bottom: 1px solid rgba(16, 32, 51, 0.18);
	}

	.english-next-step {
		padding-top: 0.7rem;
		border-top: 1px solid rgba(16, 32, 51, 0.18);
	}

	.english-model-toggle {
		justify-self: start;
	}

	.english-model-direction {
		padding: 0.85rem;
		border: 1px solid rgba(16, 32, 51, 0.24);
		background: #ffffff;
	}

	.english-bottom-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
		color: var(--english-muted);
		font-size: 0.9rem;
	}

	@media (min-width: 900px) {
		.english-layout {
			grid-template-columns: minmax(22rem, 30rem) minmax(0, 1fr);
		}

		.english-side {
			position: sticky;
			top: 4rem;
			min-height: calc(var(--app-viewport-height, 100vh) - 4rem);
			border-right: 1px solid rgba(105, 129, 143, 0.16);
			border-bottom: 0;
		}
	}

	@media (max-width: 700px) {
		.english-layout {
			display: block;
			width: 100%;
			max-width: 100%;
		}

		.english-side {
			padding: 1rem 0.9rem;
		}

		.english-main {
			padding: 0.9rem 0.7rem 1.6rem;
		}

		.english-paper {
			grid-template-columns: minmax(0, 1fr);
		}

		.english-paper-number {
			justify-content: start;
		}

		.english-main-head,
		.english-bottom-actions {
			align-items: stretch;
			flex-direction: column;
		}

		.english-score {
			width: fit-content;
		}

		.english-stepper {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}

		.english-actions {
			flex-wrap: nowrap;
			align-items: center;
			gap: 0.65rem;
		}

		.english-actions .english-primary {
			margin-left: auto;
		}
	}

	@media (max-width: 430px) {
		.english-side h1 {
			font-size: 1.55rem;
		}

		.english-paper,
		.english-support-block,
		.english-work-panel,
		.english-draft,
		.english-feedback-panel {
			padding: 0.75rem;
		}

		.english-stepper button strong {
			font-size: 0.7rem;
		}
	}

	:global(:root[data-theme='dark']) .english-side,
	:global(:root[data-theme='dark']) .english-support-block,
	:global(:root[data-theme='dark']) .english-work-panel,
	:global(:root[data-theme='dark']) .english-draft,
	:global(:root[data-theme='dark']) .english-feedback-panel {
		border-color: rgba(148, 163, 184, 0.28);
		background: rgba(7, 20, 31, 0.7);
		color: #eaf4ff;
	}

	:global(:root[data-theme='dark']) .english-side h1,
	:global(:root[data-theme='dark']) .english-main-head h2,
	:global(:root[data-theme='dark']) .english-section-title h2,
	:global(:root[data-theme='dark']) .english-section-title h3,
	:global(:root[data-theme='dark']) .english-answer-box span,
	:global(:root[data-theme='dark']) .english-feedback-grid strong,
	:global(:root[data-theme='dark']) .english-next-step strong,
	:global(:root[data-theme='dark']) .english-support-list span,
	:global(:root[data-theme='dark']) .english-draft li p {
		color: #f8fafc;
	}

	:global(:root[data-theme='dark']) .english-side > p:not(.qc-real-kicker),
	:global(:root[data-theme='dark']) .english-current-step p,
	:global(:root[data-theme='dark']) .english-draft > p,
	:global(:root[data-theme='dark']) .english-feedback-grid small,
	:global(:root[data-theme='dark']) .english-next-step p,
	:global(:root[data-theme='dark']) .english-model-direction,
	:global(:root[data-theme='dark']) .english-status,
	:global(:root[data-theme='dark']) .english-answer-box small,
	:global(:root[data-theme='dark']) .english-bottom-actions {
		color: #a9bbcc;
	}

	:global(:root[data-theme='dark']) .english-paper,
	:global(:root[data-theme='dark']) .english-paper-number span,
	:global(:root[data-theme='dark']) .english-extract {
		border-color: #f8f8f2;
		background: #050505;
		color: #f8f8f2;
	}

	:global(:root[data-theme='dark']) .english-meta span,
	:global(:root[data-theme='dark']) .english-score,
	:global(:root[data-theme='dark']) .english-mode-tabs,
	:global(:root[data-theme='dark']) .english-mode-tabs button,
	:global(:root[data-theme='dark']) .english-stepper,
	:global(:root[data-theme='dark']) .english-stepper button,
	:global(:root[data-theme='dark']) .english-secondary,
	:global(:root[data-theme='dark']) .english-reset,
	:global(:root[data-theme='dark']) .english-model-direction {
		border-color: rgba(226, 232, 240, 0.42);
		background: #071426;
		color: #eaf4ff;
	}

	:global(:root[data-theme='dark']) .english-answer-box :global(.lined-textarea) {
		color: #f8fafc;
		background-image: linear-gradient(
			to bottom,
			transparent calc(100% - 1px),
			rgba(248, 248, 242, 0.72) 0
		);
	}

	:global(:root[data-theme='dark']) .english-mode-tabs button.active,
	:global(:root[data-theme='dark']) .english-stepper button.active,
	:global(:root[data-theme='dark']) .english-stepper button.complete {
		background: rgba(86, 216, 148, 0.16);
		color: #b8f7d5;
	}

	:global(:root[data-theme='dark']) .english-primary {
		border-color: #56d894;
		background: #56d894;
		color: #052d1c;
	}
</style>
