<script lang="ts">
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import type { PageProps } from './$types';
	import {
		BookOpen,
		Check,
		ChevronLeft,
		ChevronRight,
		Circle,
		ClipboardCheck,
		Eye,
		ListChecks,
		PenLine,
		RotateCcw,
		Target
	} from '@lucide/svelte';

	type Mode = 'steps' | 'full';

	type Stage = {
		id: string;
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
		title: string;
		marks: number;
		present: boolean;
		found: string;
		missing: string;
	};

	const subjects = ['English', 'Biology', 'Chemistry', 'Physics'];
	let { data }: PageProps = $props();

	const fallbackQuestion = {
		board: 'OCR',
		qualification: 'GCSE',
		subject: 'English Literature',
		paper: 'J352/02 Exploring poetry and Shakespeare',
		marks: 30,
		source: 'OCR-style sample using public-domain Macbeth text',
		title: 'How Shakespeare presents Macbeth as conflicted',
		stem: 'Starting with this extract, explore how Shakespeare presents Macbeth as a conflicted character.',
		modelAnswer:
			'Shakespeare presents Macbeth as conflicted by making the dagger both tempting and unreachable. The phrase "fatal vision" suggests that Macbeth can imagine the murder clearly, but the word "vision" also makes it unstable, as if his ambition is disturbing his mind. Because he reaches for the dagger but cannot touch it, the audience sees him caught between action and fear. This conflict connects to the wider play because Macbeth hesitates before killing Duncan, but later his ambition and guilt make him more violent. For a Jacobean audience, his struggle would also feel dangerous because regicide breaks the expected order of kingship.',
		instructions: [
			'Write about how Macbeth is presented in this extract.',
			'Write about how Shakespeare presents Macbeth elsewhere in the play.',
			'Use references to the play to support your answer.'
		],
		extract: [
			'Is this a dagger which I see before me,',
			'The handle toward my hand? Come, let me clutch thee.',
			'I have thee not, and yet I see thee still.',
			'Art thou not, fatal vision, sensible',
			'To feeling as to sight? or art thou but',
			'A dagger of the mind, a false creation,',
			'Proceeding from the heat-oppressed brain?',
			'I see thee yet, in form as palpable',
			'As this which now I draw.'
		]
	};
	const question = $derived(data.guidedQuestion ?? fallbackQuestion);

	const stages: Stage[] = [
		{
			id: 'task',
			title: 'Read the task',
			shortTitle: 'Task',
			markRange: '0-6',
			revealTitle: 'Question focus',
			revealedText:
				'The task is not asking for a plot summary. It asks how Shakespeare presents Macbeth as conflicted, starting with this moment and then reaching elsewhere in the play.',
			prompt: 'What exactly must your answer prove about Macbeth?',
			placeholder: 'Macbeth is shown as conflicted because...',
			goal: 'Name the character, the focus word, and the kind of argument you need to make.'
		},
		{
			id: 'evidence',
			title: 'Choose first evidence',
			shortTitle: 'Quote',
			markRange: '6-12',
			revealTitle: 'First extract slice',
			revealedText:
				'"Is this a dagger which I see before me" and "fatal vision" let you write about hallucination, temptation, fear, and violent intent.',
			prompt: 'Choose one word or phrase from the extract and say why it matters.',
			placeholder: 'The phrase "fatal vision" matters because...',
			goal: 'Anchor the point in a quotation instead of making a general comment.'
		},
		{
			id: 'analysis',
			title: 'Explain the method',
			shortTitle: 'Effect',
			markRange: '12-18',
			revealTitle: 'Language lens',
			revealedText:
				'The image is both physical and uncertain. Macbeth reaches for the dagger, but cannot touch it, so Shakespeare can stage conflict inside his mind.',
			prompt: 'What does Shakespeare make the audience notice about Macbeth through this image?',
			placeholder: 'This suggests Macbeth is torn between...',
			goal: 'Move from quotation to effect: what the method makes the audience understand.'
		},
		{
			id: 'development',
			title: 'Open the wider question',
			shortTitle: 'Link',
			markRange: '18-24',
			revealTitle: 'More of the question',
			revealedText:
				'The full question also asks about elsewhere in the play. You can link this moment to Macbeth before Duncan is murdered, then to how guilt and ambition change him later.',
			prompt: 'Where else in the play could you connect this conflict?',
			placeholder: 'Elsewhere, Macbeth is conflicted when...',
			goal: 'Show that the paragraph can grow beyond the extract.'
		},
		{
			id: 'response',
			title: 'Build the full answer',
			shortTitle: 'Essay',
			markRange: '24-30',
			revealTitle: 'Full response shape',
			revealedText:
				"A high-mark answer makes a clear argument, uses evidence, analyses Shakespeare's choices, and links the extract to the wider play and audience expectations.",
			prompt: 'Turn your notes into one developed paragraph.',
			placeholder: 'Shakespeare presents Macbeth as conflicted in this extract by...',
			goal: 'Join the previous steps into a paragraph that can be marked against the scheme.'
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

	const activeStage = $derived(stages[activeStageIndex]);
	const visibleStages = $derived(stages.slice(0, activeStageIndex + 1));
	const draftedAnswer = $derived(buildDraftFromSteps());
	const answerForFeedback = $derived(mode === 'full' ? fullAnswer : draftedAnswer);
	const grade = $derived(gradeAnswer(answerForFeedback));
	const completedStepCount = $derived(
		stages.filter((stage) => stepAnswers[stage.id].trim().length > 12).length
	);
	const stageProgress = $derived(Math.round(((activeStageIndex + 1) / stages.length) * 100));
	const markText = $derived(
		grade.score === null ? 'Not checked' : `${grade.score}/${question.marks}`
	);
	const modelAnswer = $derived(makeModelAnswer(grade.criteria, answerForFeedback));
	const nextAdvice = $derived(makeNextAdvice(grade.criteria, answerForFeedback));

	function includesAny(text: string, terms: string[]) {
		const lower = text.toLowerCase();
		return terms.some((term) => lower.includes(term.toLowerCase()));
	}

	function gradeAnswer(answer: string): { score: number | null; criteria: Criterion[] } {
		const trimmed = answer.trim();
		const hasAttempt = trimmed.length > 0;
		const criteria: Criterion[] = [
			{
				id: 'argument',
				title: 'Clear answer to the task',
				marks: 6,
				present:
					hasAttempt &&
					includesAny(trimmed, ['conflict', 'conflicted', 'torn', 'hesitat', 'struggle']) &&
					includesAny(trimmed, ['Macbeth', 'Shakespeare']),
				found: 'You are making an argument about Macbeth rather than only retelling the scene.',
				missing: 'State a direct argument about how Shakespeare presents Macbeth as conflicted.'
			},
			{
				id: 'evidence',
				title: 'Precise textual evidence',
				marks: 6,
				present: includesAny(trimmed, [
					'dagger',
					'fatal vision',
					'heat-oppressed',
					'false creation',
					'mind',
					'bell',
					'blood',
					'guilt'
				]),
				found: 'You use textual evidence that can be analysed.',
				missing: 'Add a short quotation or precise reference from the extract or wider play.'
			},
			{
				id: 'method',
				title: "Analysis of Shakespeare's methods",
				marks: 8,
				present: includesAny(trimmed, [
					'suggest',
					'imply',
					'connot',
					'image',
					'imagery',
					'metaphor',
					'soliloquy',
					'audience',
					'stage',
					'dramatic'
				]),
				found: 'You explain how a writer choice shapes meaning.',
				missing:
					"Explain what Shakespeare's language, image, or stage moment makes the audience think."
			},
			{
				id: 'wider',
				title: 'Connection to the wider play',
				marks: 5,
				present: includesAny(trimmed, [
					'elsewhere',
					'later',
					'before',
					'after',
					'Duncan',
					'Lady Macbeth',
					'ambition',
					'guilt',
					'king'
				]),
				found: 'You connect the extract to the wider play.',
				missing:
					'Add one sentence linking this extract to Macbeth before or after Duncan is murdered.'
			},
			{
				id: 'context',
				title: 'Relevant context',
				marks: 5,
				present: includesAny(trimmed, [
					'Jacobean',
					'kingship',
					'divine right',
					'supernatural',
					'masculinity',
					'regicide',
					'ambition'
				]),
				found: 'You bring in context without making it the whole answer.',
				missing:
					'Link the conflict to a relevant idea such as kingship, ambition, masculinity, or the supernatural.'
			}
		];

		if (!hasAttempt) return { score: null, criteria };

		const score = criteria.reduce(
			(sum, criterion) => sum + (criterion.present ? criterion.marks : 0),
			0
		);
		const lengthBonus = trimmed.split(/\s+/).length >= 120 ? 2 : 0;
		return { score: Math.min(question.marks, score + lengthBonus), criteria };
	}

	function buildDraftFromSteps() {
		return stages
			.map((stage) => stepAnswers[stage.id].trim())
			.filter(Boolean)
			.join(' ');
	}

	function makeModelAnswer(criteria: Criterion[], answer: string) {
		const missing = criteria.filter((criterion) => !criterion.present);
		const base = question.modelAnswer;

		if (!answer.trim()) return base;
		if (missing.length === 0) {
			return (
				'Your answer already has the main ingredients. A cleaner model version would tighten the line of argument: ' +
				base
			);
		}
		return `Keep the strongest parts of your answer, then add ${missing
			.slice(0, 2)
			.map((criterion) => criterion.title.toLowerCase())
			.join(' and ')}. Model direction: ${base}`;
	}

	function makeNextAdvice(criteria: Criterion[], answer: string) {
		if (!answer.trim()) return 'Start by writing one sentence that answers the exact task.';
		const missing = criteria.find((criterion) => !criterion.present);
		return missing
			? missing.missing
			: 'Now improve precision: reduce summary and make each quotation do more analytical work.';
	}

	function setMode(nextMode: Mode) {
		mode = nextMode;
		checked = false;
		if (nextMode === 'full' && !fullAnswer.trim() && draftedAnswer.trim()) {
			fullAnswer = draftedAnswer;
		}
	}

	function updateStepAnswer(event: Event) {
		stepAnswers[activeStage.id] = (event.currentTarget as HTMLTextAreaElement).value;
		checked = false;
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
		mode = 'steps';
	}
</script>

<svelte:head>
	<title>English guided answer practice | Question Constellation</title>
	<meta
		name="description"
		content="Practise high-mark GCSE English questions by answering the full prompt or building the answer step by step."
	/>
</svelte:head>

<main class="qc-real-app english-app">
	<AppTopbar subject="English" {subjects} searchPlaceholder="Search English papers" />

	<div class="english-shell">
		<section class="english-question english-card" aria-label="Full question">
			<div class="english-question-head">
				<p class="english-kicker">GCSE English</p>
				<h1>{question.title}</h1>
				<div class="english-meta" aria-label="Question metadata">
					<span>{question.board}</span>
					<span>{question.paper}</span>
					<span>{question.marks} marks</span>
				</div>
			</div>

			<div class="english-paper">
				<div class="english-paper-number">
					<span>2</span><span>1</span>
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
			</div>
		</section>

		<section class="english-workspace">
			<section class="english-card english-mode-card" aria-label="Answer mode">
				<div class="english-card-head">
					<div>
						<p class="english-kicker">Practice mode</p>
						<h2>Build the answer without hiding the exam question.</h2>
					</div>
					<div class="english-score-pill">{markText}</div>
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

					<div class="english-progress">
						<div style={`width: ${stageProgress}%`}></div>
					</div>

					<section class="english-reveal" aria-label="Question revealed so far">
						<div class="english-section-title">
							<Eye size={18} aria-hidden="true" />
							<h3>More of the question</h3>
						</div>
						{#each visibleStages as stage}
							<div class="english-reveal-row">
								<span>{stage.markRange}</span>
								<div>
									<strong>{stage.revealTitle}</strong>
									<p>{stage.revealedText}</p>
								</div>
							</div>
						{/each}
					</section>

					<label class="english-answer-box">
						<span>{activeStage.prompt}</span>
						<small>{activeStage.goal}</small>
						<textarea
							value={stepAnswers[activeStage.id]}
							placeholder={activeStage.placeholder}
							oninput={updateStepAnswer}
						></textarea>
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
						<button type="button" class="english-primary" onclick={nextStage}>
							{#if activeStageIndex === stages.length - 1}
								<PenLine size={18} aria-hidden="true" />
								Write full answer
							{:else}
								<ChevronRight size={18} aria-hidden="true" />
								Reveal next part
							{/if}
						</button>
					</div>
				{:else}
					<label class="english-answer-box full">
						<span>Write the full answer</span>
						<small>Use the full question, then check against the mark scheme.</small>
						<textarea
							bind:value={fullAnswer}
							placeholder="Shakespeare presents Macbeth as conflicted because..."
						></textarea>
					</label>

					<div class="english-actions">
						<button type="button" class="english-secondary" onclick={() => setMode('steps')}>
							<ListChecks size={18} aria-hidden="true" />
							Build it in steps
						</button>
						<button type="button" class="english-primary" onclick={() => (checked = true)}>
							<ClipboardCheck size={18} aria-hidden="true" />
							Check answer
						</button>
					</div>
				{/if}
			</section>

			<section class="english-card english-plan-card" aria-label="Answer plan">
				<div class="english-section-title">
					<BookOpen size={18} aria-hidden="true" />
					<h2>Working answer plan</h2>
				</div>
				{#if draftedAnswer}
					<ol class="english-plan-list">
						{#each stages as stage, index}
							<li class:empty={!stepAnswers[stage.id].trim()}>
								<span>{index + 1}</span>
								<p>{stepAnswers[stage.id].trim() || stage.goal}</p>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="english-muted">
						Your step answers will collect here, then move into the full answer box.
					</p>
				{/if}
			</section>
		</section>

		<aside class="english-feedback">
			<section class="english-card english-feedback-card" aria-label="Feedback">
				<div class="english-card-head">
					<div>
						<p class="english-kicker">Mark scheme check</p>
						<h2>{checked || mode === 'steps' ? markText : 'Ready to check'}</h2>
					</div>
					<Target size={24} aria-hidden="true" />
				</div>

				<div class="english-checklist">
					{#each grade.criteria as criterion}
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
							<em>{criterion.marks}</em>
						</div>
					{/each}
				</div>

				<div class="english-next-step">
					<strong>Next best fix</strong>
					<p>{nextAdvice}</p>
				</div>
			</section>

			<section class="english-card english-model-card" aria-label="Model answer">
				<div class="english-section-title">
					<ClipboardCheck size={18} aria-hidden="true" />
					<h2>Model direction</h2>
				</div>
				<p>{modelAnswer}</p>
			</section>

			<section class="english-card english-session-card" aria-label="Session controls">
				<div>
					<strong>{completedStepCount}/{stages.length} steps drafted</strong>
					<p>
						Use the step build when the whole answer feels too large, then move into full-answer
						checking.
					</p>
				</div>
				<button type="button" class="english-reset" onclick={resetWork}>
					<RotateCcw size={18} aria-hidden="true" />
					Reset
				</button>
			</section>
		</aside>
	</div>
</main>

<style>
	.english-app {
		--english-line: rgba(105, 129, 143, 0.2);
		--english-ink: #102033;
		--english-muted: #5b6c7b;
		--english-green: #168458;
		--english-blue: #245dc1;
	}

	.english-shell {
		display: grid;
		grid-template-columns: minmax(20rem, 0.95fr) minmax(24rem, 1.12fr) minmax(18rem, 0.72fr);
		gap: clamp(0.85rem, 1.6vw, 1.2rem);
		width: min(100%, 112rem);
		margin: 0 auto;
		padding: clamp(0.85rem, 1.8vw, 1.25rem);
	}

	.english-card {
		min-width: 0;
		border: 1px solid var(--english-line);
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.94);
		box-shadow: 0 16px 38px rgba(15, 23, 42, 0.065);
		backdrop-filter: blur(14px);
	}

	.english-question,
	.english-workspace,
	.english-feedback {
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
	}

	.english-question {
		position: sticky;
		top: 5rem;
		max-height: calc(var(--app-viewport-height, 100vh) - 6rem);
		overflow: auto;
		padding: 1rem;
	}

	.english-question-head {
		display: grid;
		gap: 0.65rem;
		margin-bottom: 1rem;
	}

	.english-kicker {
		margin: 0;
		color: #0b6d3e;
		font-size: 0.76rem;
		font-weight: 860;
		letter-spacing: 0;
		text-transform: uppercase;
	}

	.english-question h1,
	.english-card h2,
	.english-section-title h2,
	.english-section-title h3 {
		margin: 0;
		color: #123f35;
		font-size: clamp(1.1rem, 1.6vw, 1.35rem);
		font-weight: 760;
		letter-spacing: 0;
		line-height: 1.12;
	}

	.english-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.english-meta span,
	.english-score-pill {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		padding: 0.34rem 0.62rem;
		border: 1px solid #cfe1f8;
		border-radius: 999px;
		background: #ffffff;
		color: #27415f;
		font-size: 0.82rem;
		font-weight: 820;
	}

	.english-paper {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.85rem;
		padding: 1rem;
		border: 1px solid #111111;
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

	.english-paper-number span + span {
		border-left: 0;
	}

	.english-paper-body {
		display: grid;
		gap: 0.78rem;
		min-width: 0;
	}

	.english-source-label,
	.english-stem,
	.english-instructions,
	.english-marks {
		margin: 0;
		font-size: 0.98rem;
		line-height: 1.45;
	}

	.english-source-label {
		font-weight: 700;
	}

	.english-stem {
		font-weight: 700;
	}

	.english-extract {
		display: grid;
		gap: 0.18rem;
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
		font-weight: 700;
	}

	.english-mode-card,
	.english-plan-card,
	.english-feedback-card,
	.english-model-card,
	.english-session-card {
		display: grid;
		gap: 0.9rem;
		padding: 1rem;
	}

	.english-card-head,
	.english-section-title {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.9rem;
		min-width: 0;
	}

	.english-section-title {
		justify-content: start;
		align-items: center;
	}

	.english-section-title :global(svg),
	.english-card-head :global(svg) {
		flex: 0 0 auto;
		color: var(--english-green);
	}

	.english-card-head p {
		margin-bottom: 0.28rem;
	}

	.english-mode-tabs,
	.english-stepper {
		display: grid;
		gap: 0.35rem;
		padding: 0.35rem;
		border: 1px solid #d9e3ef;
		border-radius: 0.5rem;
		background: rgba(248, 250, 252, 0.92);
	}

	.english-mode-tabs {
		grid-template-columns: repeat(2, minmax(0, 1fr));
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
		border-radius: 0.42rem;
		font-size: 0.9rem;
		font-weight: 850;
		cursor: pointer;
	}

	.english-mode-tabs button,
	.english-stepper button {
		background: transparent;
		color: #475569;
	}

	.english-mode-tabs button.active,
	.english-stepper button.active {
		background: #eff6ff;
		color: var(--english-blue);
	}

	.english-stepper {
		grid-template-columns: repeat(5, minmax(0, 1fr));
	}

	.english-stepper button {
		flex-direction: column;
		gap: 0.16rem;
		min-height: 3.4rem;
		padding: 0.38rem;
	}

	.english-stepper button span {
		display: inline-grid;
		width: 1.38rem;
		height: 1.38rem;
		place-items: center;
		border: 1px solid #c7d7f1;
		border-radius: 999px;
		background: #ffffff;
		font-size: 0.78rem;
		font-weight: 900;
	}

	.english-stepper button.complete span {
		border-color: #168458;
		background: #e9f8ee;
		color: #075323;
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
		height: 0.55rem;
		overflow: hidden;
		border-radius: 999px;
		background: #e2e8f0;
	}

	.english-progress div {
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, #168458, #245dc1);
		transition: width 0.2s ease;
	}

	.english-reveal {
		display: grid;
		gap: 0.7rem;
	}

	.english-reveal-row {
		display: grid;
		grid-template-columns: 3.2rem minmax(0, 1fr);
		gap: 0.72rem;
		align-items: start;
		padding: 0.75rem 0;
		border-top: 1px solid #e3ebf4;
	}

	.english-reveal-row > span {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 1.7rem;
		border: 1px solid #cfe1f8;
		border-radius: 999px;
		background: #ffffff;
		color: #27415f;
		font-size: 0.72rem;
		font-weight: 860;
	}

	.english-reveal-row strong {
		color: var(--english-ink);
		font-size: 0.92rem;
		font-weight: 900;
	}

	.english-reveal-row p,
	.english-muted,
	.english-next-step p,
	.english-model-card p,
	.english-session-card p {
		margin: 0.2rem 0 0;
		color: var(--english-muted);
		font-size: 0.94rem;
		line-height: 1.42;
		overflow-wrap: anywhere;
	}

	.english-answer-box {
		display: grid;
		gap: 0.35rem;
	}

	.english-answer-box span {
		color: #1f2937;
		font-size: 0.96rem;
		font-weight: 860;
	}

	.english-answer-box small {
		color: #64748b;
		font-size: 0.86rem;
		line-height: 1.35;
	}

	.english-answer-box textarea {
		width: 100%;
		min-height: 9.5rem;
		resize: vertical;
		padding: 0.9rem;
		border: 1.5px solid #b7c7dd;
		border-radius: 0.45rem;
		background: #ffffff;
		color: #111827;
		font-size: 1rem;
		line-height: 1.45;
	}

	.english-answer-box.full textarea {
		min-height: 18rem;
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
		border: 1px solid #168458;
	}

	.english-primary {
		background: #168458;
		color: #ffffff;
	}

	.english-secondary,
	.english-reset {
		background: #ffffff;
		color: #0d5a3f;
	}

	.english-secondary:disabled {
		border-color: #cbd5e1;
		background: #f1f5f9;
		color: #94a3b8;
		cursor: not-allowed;
	}

	.english-plan-list {
		display: grid;
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.english-plan-list li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.62rem;
		align-items: start;
		padding-top: 0.6rem;
		border-top: 1px solid #e3ebf4;
	}

	.english-plan-list li span {
		display: inline-grid;
		width: 1.65rem;
		height: 1.65rem;
		place-items: center;
		border-radius: 999px;
		background: #e9f8ee;
		color: #075323;
		font-size: 0.78rem;
		font-weight: 900;
	}

	.english-plan-list li p {
		margin: 0;
		color: var(--english-ink);
		font-size: 0.94rem;
		line-height: 1.42;
		overflow-wrap: anywhere;
	}

	.english-plan-list li.empty p {
		color: #7a8796;
	}

	.english-checklist {
		display: grid;
		gap: 0.58rem;
	}

	.english-checklist > div {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.62rem;
		align-items: start;
		padding: 0.7rem 0;
		border-top: 1px solid #e3ebf4;
	}

	.english-checklist :global(svg) {
		margin-top: 0.12rem;
		color: #94a3b8;
	}

	.english-checklist .present :global(svg) {
		color: #168458;
	}

	.english-checklist strong,
	.english-next-step strong,
	.english-session-card strong {
		display: block;
		color: var(--english-ink);
		font-size: 0.92rem;
		font-weight: 900;
		line-height: 1.22;
	}

	.english-checklist small {
		display: block;
		margin-top: 0.18rem;
		color: var(--english-muted);
		font-size: 0.82rem;
		line-height: 1.32;
	}

	.english-checklist em {
		color: #27415f;
		font-size: 0.82rem;
		font-style: normal;
		font-weight: 900;
	}

	.english-next-step {
		padding-top: 0.7rem;
		border-top: 1px solid #e3ebf4;
	}

	.english-session-card {
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
	}

	@media (max-width: 1180px) {
		.english-shell {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.english-feedback {
			grid-column: 1 / -1;
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 820px) {
		.english-shell {
			grid-template-columns: minmax(0, 1fr);
			padding: 0.75rem;
		}

		.english-question {
			position: static;
			max-height: none;
		}

		.english-feedback {
			grid-column: auto;
			grid-template-columns: minmax(0, 1fr);
		}

		.english-stepper {
			grid-template-columns: repeat(5, minmax(3.45rem, 1fr));
			overflow-x: auto;
		}
	}

	@media (max-width: 520px) {
		.english-shell {
			padding: 0.6rem;
		}

		.english-question,
		.english-mode-card,
		.english-plan-card,
		.english-feedback-card,
		.english-model-card,
		.english-session-card {
			padding: 0.85rem;
		}

		.english-paper {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.65rem;
			padding: 0.8rem;
		}

		.english-paper-number {
			justify-content: start;
		}

		.english-card-head,
		.english-actions,
		.english-session-card {
			align-items: stretch;
			flex-direction: column;
		}

		.english-card-head {
			display: grid;
		}

		.english-score-pill {
			justify-self: start;
		}

		.english-primary,
		.english-secondary,
		.english-reset {
			width: 100%;
		}
	}

	:global(:root[data-theme='dark']) .english-card {
		border-color: rgba(226, 232, 240, 0.28);
		background: rgba(7, 20, 31, 0.72);
		color: #eaf4ff;
	}

	:global(:root[data-theme='dark']) .english-question h1,
	:global(:root[data-theme='dark']) .english-card h2,
	:global(:root[data-theme='dark']) .english-section-title h2,
	:global(:root[data-theme='dark']) .english-section-title h3,
	:global(:root[data-theme='dark']) .english-checklist strong,
	:global(:root[data-theme='dark']) .english-next-step strong,
	:global(:root[data-theme='dark']) .english-session-card strong,
	:global(:root[data-theme='dark']) .english-plan-list li p,
	:global(:root[data-theme='dark']) .english-reveal-row strong,
	:global(:root[data-theme='dark']) .english-answer-box span {
		color: #f8fafc;
	}

	:global(:root[data-theme='dark']) .english-muted,
	:global(:root[data-theme='dark']) .english-reveal-row p,
	:global(:root[data-theme='dark']) .english-next-step p,
	:global(:root[data-theme='dark']) .english-model-card p,
	:global(:root[data-theme='dark']) .english-session-card p,
	:global(:root[data-theme='dark']) .english-checklist small,
	:global(:root[data-theme='dark']) .english-answer-box small {
		color: #a9bbcc;
	}

	:global(:root[data-theme='dark']) .english-paper,
	:global(:root[data-theme='dark']) .english-paper-number span,
	:global(:root[data-theme='dark']) .english-extract {
		border-color: #f8f8f2;
		background: #050505;
		color: #f8f8f2;
	}

	:global(:root[data-theme='dark']) .english-mode-tabs,
	:global(:root[data-theme='dark']) .english-stepper {
		border-color: rgba(226, 232, 240, 0.22);
		background: rgba(2, 6, 23, 0.55);
	}

	:global(:root[data-theme='dark']) .english-mode-tabs button,
	:global(:root[data-theme='dark']) .english-stepper button,
	:global(:root[data-theme='dark']) .english-secondary,
	:global(:root[data-theme='dark']) .english-reset,
	:global(:root[data-theme='dark']) .english-answer-box textarea {
		border-color: rgba(226, 232, 240, 0.42);
		background: #071426;
		color: #eaf4ff;
	}

	:global(:root[data-theme='dark']) .english-mode-tabs button.active,
	:global(:root[data-theme='dark']) .english-stepper button.active {
		background: rgba(36, 93, 193, 0.25);
		color: #d7e7ff;
	}

	:global(:root[data-theme='dark']) .english-stepper button span,
	:global(:root[data-theme='dark']) .english-score-pill,
	:global(:root[data-theme='dark']) .english-meta span,
	:global(:root[data-theme='dark']) .english-reveal-row > span {
		border-color: rgba(226, 232, 240, 0.42);
		background: #071426;
		color: #d7e7ff;
	}

	:global(:root[data-theme='dark']) .english-primary {
		border-color: #56d894;
		background: #56d894;
		color: #052d1c;
	}
	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .english-card {
			border-color: rgba(226, 232, 240, 0.28);
			background: rgba(7, 20, 31, 0.72);
			color: #eaf4ff;
		}

		:global(:root:not([data-theme='light'])) .english-question h1,
		:global(:root:not([data-theme='light'])) .english-card h2,
		:global(:root:not([data-theme='light'])) .english-section-title h2,
		:global(:root:not([data-theme='light'])) .english-section-title h3,
		:global(:root:not([data-theme='light'])) .english-checklist strong,
		:global(:root:not([data-theme='light'])) .english-next-step strong,
		:global(:root:not([data-theme='light'])) .english-session-card strong,
		:global(:root:not([data-theme='light'])) .english-plan-list li p,
		:global(:root:not([data-theme='light'])) .english-reveal-row strong,
		:global(:root:not([data-theme='light'])) .english-answer-box span {
			color: #f8fafc;
		}

		:global(:root:not([data-theme='light'])) .english-muted,
		:global(:root:not([data-theme='light'])) .english-reveal-row p,
		:global(:root:not([data-theme='light'])) .english-next-step p,
		:global(:root:not([data-theme='light'])) .english-model-card p,
		:global(:root:not([data-theme='light'])) .english-session-card p,
		:global(:root:not([data-theme='light'])) .english-checklist small,
		:global(:root:not([data-theme='light'])) .english-answer-box small {
			color: #a9bbcc;
		}

		:global(:root:not([data-theme='light'])) .english-paper,
		:global(:root:not([data-theme='light'])) .english-paper-number span,
		:global(:root:not([data-theme='light'])) .english-extract {
			border-color: #f8f8f2;
			background: #050505;
			color: #f8f8f2;
		}

		:global(:root:not([data-theme='light'])) .english-mode-tabs,
		:global(:root:not([data-theme='light'])) .english-stepper {
			border-color: rgba(226, 232, 240, 0.22);
			background: rgba(2, 6, 23, 0.55);
		}

		:global(:root:not([data-theme='light'])) .english-mode-tabs button,
		:global(:root:not([data-theme='light'])) .english-stepper button,
		:global(:root:not([data-theme='light'])) .english-secondary,
		:global(:root:not([data-theme='light'])) .english-reset,
		:global(:root:not([data-theme='light'])) .english-answer-box textarea {
			border-color: rgba(226, 232, 240, 0.42);
			background: #071426;
			color: #eaf4ff;
		}

		:global(:root:not([data-theme='light'])) .english-mode-tabs button.active,
		:global(:root:not([data-theme='light'])) .english-stepper button.active {
			background: rgba(36, 93, 193, 0.25);
			color: #d7e7ff;
		}

		:global(:root:not([data-theme='light'])) .english-stepper button span,
		:global(:root:not([data-theme='light'])) .english-score-pill,
		:global(:root:not([data-theme='light'])) .english-meta span,
		:global(:root:not([data-theme='light'])) .english-reveal-row > span {
			border-color: rgba(226, 232, 240, 0.42);
			background: #071426;
			color: #d7e7ff;
		}

		:global(:root:not([data-theme='light'])) .english-primary {
			border-color: #56d894;
			background: #56d894;
			color: #052d1c;
		}
	}
</style>
