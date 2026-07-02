<script lang="ts">
	import { resolve } from '$app/paths';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import EnglishGuidedPractice from '$lib/components/EnglishGuidedPractice.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import HintPanel from '$lib/components/HintPanel.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import ResponseRenderer from '$lib/experiments/questions/components/ResponseRenderer.svelte';
	import type { ExamPaperAsset, ExamResponse } from '$lib/experiments/questions/types';
	import { ArrowRight, CheckCircle2, CircleAlert, Target, Zap } from '@lucide/svelte';
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
	let showHint = $state(false);

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
	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const nextQuestionHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.nextQuestion.id })
	);
	const isChecking = $derived(
		gradePhase === 'connecting' ||
			gradePhase === 'calling' ||
			gradePhase === 'thinking' ||
			gradePhase === 'grading'
	);
	const canCheck = $derived(answerText.trim().length > 0 && !isChecking);
	const statusText = $derived(statusLabelForPhase(gradePhase));
	const statusDescription = $derived(statusDescriptionForPhase(gradePhase));
	const feedbackMarkdown = $derived((gradeResult?.feedbackMarkdown ?? '').trim());
	const hasMissingLinks = $derived(missingItems.length > 0);
	const hintMissingLinks = $derived(
		data.question.weakAnswerMissingStepIds
			.map(
				(stepId) => data.question.repairChain.find((node) => node.stepId === stepId)?.label ?? null
			)
			.filter((label): label is string => Boolean(label))
	);
	const weakAnswerExplanation = $derived(
		data.question.commonWeakExplanation.replace(/\s+/g, ' ').trim()
	);
	const practiceHints = $derived(
		[
			weakAnswerExplanation
				? { title: 'Common trap', text: `Avoid this: ${weakAnswerExplanation}` }
				: null,
			hintMissingLinks.length > 0
				? { title: 'Missing link', text: `Use this link: ${hintMissingLinks.join(' -> ')}.` }
				: null,
			data.question.commonWeakAnswer.trim()
				? {
						title: 'Weak answer',
						text: `Do not stop at: ${data.question.commonWeakAnswer.replace(/\s+/g, ' ').trim()}`
					}
				: null,
			{ title: 'Reminder', text: data.chain.commonMissingLink }
		].filter((hint): hint is { title: string; text: string } => Boolean(hint?.text))
	);
	const isEnglish = $derived(data.question.meta.subject.toLowerCase().includes('english'));
	const topbarSubject = $derived(isEnglish ? 'English' : data.question.meta.subject);
	const topbarSubjects = [
		'All subjects',
		'Science',
		'Biology',
		'Chemistry',
		'Physics',
		'Computer Science',
		'Geography',
		'History',
		'English'
	];
	const chainSteps = $derived(data.chain.steps.map((step) => step.short));
	const answerRows = $derived(
		data.question.meta.marks >= 30 ? 16 : data.question.meta.marks >= 10 ? 12 : 8
	);
	const structuredResponse = $derived(
		responseFromOverlay(data.question.renderingOverlay?.responseInteraction)
	);
	const responseAssets = $derived(
		Object.fromEntries(
			data.question.assets.map((asset) => [
				asset.id,
				{
					id: asset.id,
					label: asset.sourceLabel,
					src: asset.publicPath,
					alt: asset.altText,
					width: asset.paperWidthPx ?? undefined
				}
			])
		) as Record<string, ExamPaperAsset>
	);

	function responseFromOverlay(value: Record<string, unknown> | null | undefined) {
		if (!value || value.kind === 'none') return null;
		return value as ExamResponse;
	}

	function setAnswerText(value: string) {
		answerText = value;
	}

	async function checkAnswer() {
		if (!canCheck) return;

		checked = false;
		rewriteText = '';
		gradeError = '';
		gradeResult = null;
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
		if (phase === 'connecting') return 'Starting the answer check.';
		if (phase === 'calling') return 'Looking for the links you included.';
		if (phase === 'thinking') {
			return isEnglish
				? 'Comparing your answer with the mark path.'
				: 'Comparing your answer with the chain.';
		}
		if (phase === 'grading') return 'Preparing feedback.';
		if (phase === 'error') return 'The check could not finish.';
		return '';
	}

	function statusLabelForPhase(phase: GradePhase) {
		if (phase === 'connecting') return 'Starting check';
		if (phase === 'calling') return 'Checking answer';
		if (phase === 'thinking') return 'Checking answer';
		if (phase === 'grading') return 'Preparing feedback';
		if (phase === 'done') return 'Checked';
		if (phase === 'error') return 'Could not check';
		return 'Check answer';
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
		showHint = false;
	});
</script>

<svelte:head>
	<title>{data.question.title} practice | Question Constellation</title>
	<meta
		name="description"
		content={isEnglish
			? 'Write, check, and repair a GCSE English answer against the mark focus.'
			: 'Attempt a GCSE question before revealing and repairing the answer chain.'}
	/>
</svelte:head>

{#if data.englishPractice}
	<EnglishGuidedPractice practice={data.englishPractice} />
{:else}
	<main class="qc-real-app qc-practice-page">
		<AppTopbar
			subject={topbarSubject}
			subjects={topbarSubjects}
			searchPlaceholder="Search questions"
		/>

		<div class="qc-real-layout qc-question-layout">
			<aside class="qc-real-rail qc-question-rail" aria-label="Practice route">
				<IconBackLink
					href={previousHref}
					label={`Back to ${isEnglish ? 'mark path' : 'answer chain'}`}
				/>
				<p class="qc-real-kicker">Guided practice</p>
				<h1><MathText text={data.constellation.title} /></h1>
				<div class="qc-practice-progress" aria-label="Practice progress">
					<span>Question {questionNumber} of {data.questions.length}</span>
					<div class="qc-practice-progress-track" aria-hidden="true">
						<span class="qc-practice-progress-fill" style={`width: ${progressPercent}`}></span>
					</div>
				</div>
				<nav class="qc-real-chain-list" aria-label="Practice questions">
					{#each data.questions as question, index (question.id)}
						<a
							class:active={question.id === data.question.id}
							href={resolve('/questions/[questionId]/practice', { questionId: question.id })}
						>
							<span>{index + 1}</span>
							<span><MathText text={question.title} /></span>
							<small>{question.distanceLabel} · {question.meta.marks} marks</small>
						</a>
					{/each}
				</nav>
			</aside>

			<section class="qc-real-main qc-practice-main" aria-label="Practice workspace">
				{#if !checked}
					<div class="qc-real-question-top">
						<div>
							<p>
								<MathText
									text={`${data.question.sourceRef} · ${data.question.meta.paper} · ${data.question.meta.marks} marks`}
								/>
							</p>
							<h2>Write the answer, then check it.</h2>
						</div>
					</div>

					<HintPanel hints={practiceHints} bind:open={showHint} />

					<ExamQuestionCard question={data.question} showTitle={false} />

					<section class="qc-practice-answer-card">
						{#if structuredResponse}
							<p class="qc-practice-answer-label">Your answer</p>
							<div class="qc-practice-response">
								<ResponseRenderer
									response={structuredResponse}
									assets={responseAssets}
									answer={answerText}
									onAnswerChange={setAnswerText}
								/>
							</div>
						{:else}
							<label for="answer">Your answer</label>
							<textarea
								id="answer"
								class="qc-lined-answer"
								class:extended={data.question.meta.marks >= 20}
								bind:value={answerText}
								rows={answerRows}
								placeholder="Write your answer..."
								spellcheck="true"
							></textarea>
						{/if}
						<div class="qc-practice-actions" aria-label="Answer actions">
							<button
								class="qc-action-button primary"
								type="button"
								onclick={checkAnswer}
								disabled={!canCheck}
							>
								{#if isChecking}
									<span class="loading-spinner button-spinner" aria-hidden="true"></span>
									{statusText}
								{:else}
									<CheckCircle2 size={18} aria-hidden="true" />
									Check answer
								{/if}
							</button>
						</div>
					</section>

					{#if isChecking}
						<section class="qc-status-panel" aria-live="polite">
							<span class="loading-spinner" aria-hidden="true"></span>
							<div>
								<p class="qc-panel-label">{statusText}</p>
								<p>{statusDescription}</p>
							</div>
						</section>
					{/if}

					{#if gradeError}
						<section class="qc-status-panel error" aria-live="polite">
							<CircleAlert size={19} aria-hidden="true" />
							<div>
								<p class="qc-panel-label">Could not check</p>
								<p>{gradeError}</p>
							</div>
						</section>
					{/if}
				{:else}
					<div class="qc-real-question-top">
						<div>
							<p><MathText text={data.question.sourceRef} /></p>
							<h2>{resultTitle}</h2>
						</div>
						<a class="qc-real-link-button" href={previousHref}>
							Review {isEnglish ? 'mark path' : 'chain'}
						</a>
					</div>

					<section class="qc-result-summary">
						<p class="qc-panel-label">Checked answer</p>
						<p>
							{gradeResult?.awardedMarks ?? 0} of {gradeResult?.maxMarks ??
								data.question.meta.marks}
							marks. {missingItems.length === 0
								? 'All required links are present.'
								: 'Add the missing links to complete the answer.'}
						</p>
					</section>

					<ThinkingChain
						steps={chainSteps}
						label={isEnglish ? 'Checked mark path' : 'Checked answer chain'}
						note={hasMissingLinks
							? 'Missing links are shown below.'
							: `${isEnglish ? 'The mark path' : 'The chain'} is complete.`}
					/>

					<div class="qc-feedback-stack">
						<section class="qc-answer-panel">
							<p class="qc-panel-label">You included ({includedItems.length})</p>
							{#if includedItems.length > 0}
								<ul class="qc-result-list">
									{#each includedItems as item (item.id)}
										<li>
											<CheckCircle2 size={18} aria-hidden="true" />
											<span><MathText text={shortChecklistText(item.text)} /></span>
										</li>
									{/each}
								</ul>
							{:else}
								<p>No checklist links were confirmed yet.</p>
							{/if}
						</section>

						{#if missingItems.length > 0}
							<section class="qc-answer-panel missing">
								<p class="qc-panel-label">Missing ({missingItems.length})</p>
								<ul class="qc-result-list">
									{#each missingItems as item (item.id)}
										<li>
											<CircleAlert size={18} aria-hidden="true" />
											<span><MathText text={shortChecklistText(item.text)} /></span>
										</li>
									{/each}
								</ul>
							</section>
						{/if}

						{#if feedbackMarkdown}
							<section class="qc-answer-panel">
								<p class="qc-panel-label">Feedback</p>
								<MarkdownContent markdown={feedbackMarkdown} class="qc-feedback-markdown" />
							</section>
						{/if}
					</div>

					<section class="qc-repair-panel">
						<p class="qc-panel-label">{isEnglish ? 'Repair path' : 'Repair chain'}</p>
						<div
							class="qc-repair-chain"
							aria-label={isEnglish ? 'Mark path reminder' : 'Answer chain reminder'}
						>
							{#each data.question.repairChain as node (node.id)}
								<span class:missing={isNodeMissing(node.stepId)}>
									{#if node.icon === 'zap'}
										<Zap size={16} aria-hidden="true" />
									{:else}
										<Target size={16} aria-hidden="true" />
									{/if}
									<MathText text={node.label} />
								</span>
							{/each}
						</div>
					</section>

					<section class="qc-practice-answer-card">
						<label for="rewrite">
							{hasMissingLinks ? 'Rewrite with the missing links' : 'Your checked answer'}
						</label>
						{#if hasMissingLinks}
							<textarea
								id="rewrite"
								class="qc-lined-answer"
								class:extended={data.question.meta.marks >= 20}
								bind:value={rewriteText}
								rows={answerRows}
								placeholder="Rewrite your answer..."
								spellcheck="true"
							></textarea>
						{:else}
							<p class="qc-checked-answer">{answerText}</p>
						{/if}
						<div class="qc-practice-actions" aria-label="Next actions">
							<a class="qc-action-button primary" href={nextQuestionHref}>
								<ArrowRight size={18} aria-hidden="true" />
								Next question
							</a>
							<a class="qc-action-button" href={previousHref}>Review chain</a>
						</div>
					</section>
				{/if}
			</section>
		</div>
	</main>
{/if}
