<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { ArrowRight, CheckCircle2, CircleAlert, RotateCcw, Target } from '@lucide/svelte';
	import type { PageProps } from './$types';

	type FieldStatus = 'idle' | 'checking' | 'correct' | 'partial' | 'incorrect' | 'error';
	type FieldResult = {
		status: FieldStatus;
		feedback: string;
	};
	type Phase = 'build' | 'memory' | 'compose' | 'feedback' | 'model';
	type FinalResult = {
		status: 'ok';
		awardedMarks: number;
		maxMarks: number;
		summary: string;
		presentStepIds: string[];
		missingStepIds: string[];
		gapClosed: boolean;
	};

	let { data }: PageProps = $props();

	let phase = $state<Phase>('build');
	let activeGapId = $state('');
	let answerOverrides = $state<Record<string, string>>({});
	let fieldResultOverrides = $state<Record<string, FieldResult>>({});
	let finalAnswer = $state('');
	let finalResult = $state<FinalResult | null>(null);
	let finalError = $state('');
	let checkingFinal = $state(false);

	const questions = $derived(data.gapData.presentation.questions);
	const defaultAnswers = $derived(
		Object.fromEntries(questions.map((question) => [question.id, '']))
	);
	const defaultFieldResults = $derived(
		Object.fromEntries(
			questions.map((question) => [question.id, { status: 'idle', feedback: question.hint }])
		) as Record<string, FieldResult>
	);
	const answers = $derived({ ...defaultAnswers, ...answerOverrides });
	const fieldResults = $derived({ ...defaultFieldResults, ...fieldResultOverrides } as Record<
		string,
		FieldResult
	>);

	const subject = $derived(
		data.gapData.gap.meta.includes('Chemistry')
			? 'Chemistry'
			: data.gapData.gap.meta.includes('Physics')
				? 'Physics'
				: 'Biology'
	);
	const allFieldsFilled = $derived(questions.every((question) => answers[question.id]?.trim()));
	const checkingFields = $derived(
		Object.values(fieldResults).some((result) => result.status === 'checking')
	);
	const presentSteps = $derived(new Set(finalResult?.presentStepIds ?? []));
	const missingSteps = $derived(new Set(finalResult?.missingStepIds ?? []));
	const sourceHref = $derived(data.gapData.question.href ?? resolve('/'));
	const chainHref = $derived(data.gapData.chain.href);
	const recallHref = $derived(
		`${resolve('/recall')}?subject=${encodeURIComponent(subject)}&start=1`
	);

	$effect.pre(() => {
		if (activeGapId === data.gapData.gap.id) return;
		activeGapId = data.gapData.gap.id;
		answerOverrides = {};
		fieldResultOverrides = {};
		finalAnswer = '';
		finalResult = null;
		finalError = '';
		checkingFinal = false;
		phase = 'build';
	});

	function fieldResult(questionId: string): FieldResult {
		return fieldResults[questionId] ?? { status: 'idle', feedback: '' };
	}

	function updateAnswer(questionId: string, value: string) {
		answerOverrides = { ...answerOverrides, [questionId]: value };
		const question = questions.find((entry) => entry.id === questionId);
		fieldResultOverrides = {
			...fieldResultOverrides,
			[questionId]: { status: 'idle', feedback: question?.hint ?? '' }
		};
	}

	async function checkField(questionId: string) {
		const answer = answers[questionId]?.trim() ?? '';
		if (!answer) return;
		fieldResultOverrides = {
			...fieldResultOverrides,
			[questionId]: { status: 'checking', feedback: 'Checking...' }
		};
		try {
			const response = await fetch(
				resolve('/api/gaps/[gapId]/guided-field-grade', { gapId: data.gapData.gap.id }),
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ questionId, answer })
				}
			);
			if (!response.ok) throw new Error(`Field check failed with ${response.status}`);
			const result = (await response.json()) as {
				status: 'ok';
				result: 'correct' | 'partial' | 'incorrect';
				feedback: string;
			};
			fieldResultOverrides = {
				...fieldResultOverrides,
				[questionId]: { status: result.result, feedback: result.feedback }
			};
		} catch (error) {
			console.error('Gap field check failed.', error);
			fieldResultOverrides = {
				...fieldResultOverrides,
				[questionId]: { status: 'error', feedback: 'Could not check this answer.' }
			};
		}
	}

	async function submitBuild(event: SubmitEvent) {
		event.preventDefault();
		if (!allFieldsFilled || checkingFields) return;
		for (const question of questions) {
			await checkField(question.id);
		}
		phase = 'memory';
	}

	async function submitFinal(event: SubmitEvent) {
		event.preventDefault();
		const answer = finalAnswer.trim();
		if (!answer || checkingFinal) return;
		checkingFinal = true;
		finalError = '';
		finalResult = null;
		try {
			const response = await fetch(
				resolve('/api/gaps/[gapId]/guided-grade', { gapId: data.gapData.gap.id }),
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ answer, guidedAnswers: answers })
				}
			);
			if (!response.ok) throw new Error(`Final check failed with ${response.status}`);
			finalResult = (await response.json()) as FinalResult;
			phase = 'feedback';
		} catch (error) {
			console.error('Gap final check failed.', error);
			finalError = 'Could not check this answer right now.';
		} finally {
			checkingFinal = false;
		}
	}
</script>

<svelte:head>
	<title>Fix mistake | {data.gapData.chain.title}</title>
</svelte:head>

<main class="qc-real-app qc-gap-page">
	<AppTopbar
		{subject}
		subjects={[
			'All subjects',
			'Science',
			'Biology',
			'Chemistry',
			'Physics',
			'Computer Science',
			'Geography',
			'History',
			'English'
		]}
		searchPlaceholder="Search questions"
	/>

	<div class="qc-gap-layout">
		<aside class="qc-gap-context" aria-label="Gap context">
			<p class="qc-real-kicker">{data.gapData.subjectLabel}</p>
			<h1><MathText text={data.gapData.gap.stepText} /></h1>
			<p><MathText text={`${data.gapData.gap.chainTitle} · ${data.gapData.gap.topic}`} /></p>
			<div class="qc-gap-context-actions">
				<a href={sourceHref}>Original question</a>
				<a href={chainHref}>Method</a>
				<a href={recallHref}>Flashcards</a>
			</div>
		</aside>

		<section class="qc-gap-workspace" aria-label="Fix mistake builder">
			<header class="qc-gap-header">
				<span>{subject}</span>
				<h2><MathText text={data.gapData.question.title} /></h2>
			</header>

			{#if phase === 'build'}
				<div class="qc-gap-section-bar">
					<strong>Build the missing steps</strong>
					<span>{allFieldsFilled ? 'Ready' : 'In progress'}</span>
				</div>
				<form class="qc-gap-questions" onsubmit={submitBuild}>
					{#each data.gapData.presentation.questions as question, index (question.id)}
						<label class="qc-gap-question">
							<span class="qc-gap-number">{index + 1}</span>
							<span class="qc-gap-question-text"><MathText text={question.question} /></span>
							<textarea
								rows="1"
								value={answers[question.id] ?? ''}
								class={`qc-gap-short-answer ${fieldResult(question.id).status}`}
								placeholder="Type a short answer"
								oninput={(event) =>
									updateAnswer(question.id, (event.currentTarget as HTMLTextAreaElement).value)}
								onblur={() => checkField(question.id)}
							></textarea>
							<small class={`qc-gap-feedback ${fieldResult(question.id).status}`}>
								{fieldResult(question.id).feedback}
							</small>
						</label>
					{/each}
					<footer class="qc-gap-footer">
						<span>{checkingFields ? 'Checking...' : 'Fill each step to continue.'}</span>
						<button type="submit" disabled={!allFieldsFilled || checkingFields}>Next</button>
					</footer>
				</form>
			{:else if phase === 'memory'}
				<section class="qc-gap-memory">
					<p class="qc-panel-label">Method reminder</p>
					<div>
						{#each data.gapData.chain.steps as step (step.id)}
							<span class:target={step.id === data.gapData.presentation.targetStepId}>
								<MathText text={step.short} />
							</span>
						{/each}
					</div>
				</section>
				<footer class="qc-gap-footer">
					<span>Now turn the method into full sentences.</span>
					<button type="button" onclick={() => (phase = 'compose')}>Write answer</button>
				</footer>
			{:else if phase === 'compose'}
				<form class="qc-gap-compose" onsubmit={submitFinal}>
					<label for="gap-final-answer">{data.gapData.presentation.answerPrompt}</label>
					<textarea
						id="gap-final-answer"
						rows="7"
						bind:value={finalAnswer}
						placeholder="Write the improved answer..."
					></textarea>
					{#if finalError}
						<p class="qc-gap-error">{finalError}</p>
					{/if}
					<footer class="qc-gap-footer">
						<span
							>{checkingFinal ? 'Checking answer...' : 'Use the method, but write naturally.'}</span
						>
						<button type="submit" disabled={!finalAnswer.trim() || checkingFinal}>
							{checkingFinal ? 'Checking' : 'Check answer'}
						</button>
					</footer>
				</form>
			{:else if phase === 'feedback' && finalResult}
				<section class="qc-gap-result" class:closed={finalResult.gapClosed}>
					{#if finalResult.gapClosed}
						<CheckCircle2 size={21} aria-hidden="true" />
					{:else}
						<CircleAlert size={21} aria-hidden="true" />
					{/if}
					<div>
						<p class="qc-panel-label">
							{finalResult.awardedMarks}/{finalResult.maxMarks} marks
						</p>
						<p>{finalResult.summary}</p>
					</div>
				</section>
				<div class="qc-gap-step-review">
					{#each data.gapData.chain.steps as step (step.id)}
						<span
							class:present={presentSteps.has(step.id)}
							class:missing={missingSteps.has(step.id)}
						>
							{#if presentSteps.has(step.id)}
								<CheckCircle2 size={15} aria-hidden="true" />
							{:else}
								<CircleAlert size={15} aria-hidden="true" />
							{/if}
							<MathText text={step.short} />
						</span>
					{/each}
				</div>
				<footer class="qc-gap-footer">
					<span>{finalResult.gapClosed ? 'Mistake fixed.' : 'Try the rewrite once more.'}</span>
					{#if finalResult.gapClosed}
						<button type="button" onclick={() => (phase = 'model')}>Model answer</button>
					{:else}
						<button type="button" onclick={() => (phase = 'compose')}>
							<RotateCcw size={16} aria-hidden="true" />
							Try again
						</button>
					{/if}
				</footer>
			{:else}
				<section class="qc-gap-model">
					<p class="qc-panel-label">Model answer</p>
					<p><MathText text={data.gapData.presentation.modelAnswer} /></p>
				</section>
				<footer class="qc-gap-footer">
					<a href={sourceHref}>
						Back to practice
						<ArrowRight size={16} aria-hidden="true" />
					</a>
				</footer>
			{/if}
		</section>
	</div>
</main>
