<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import EnglishGuidedPractice from '$lib/components/EnglishGuidedPractice.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import HintPanel from '$lib/components/HintPanel.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import PracticeAnswerEditor from '$lib/components/PracticeAnswerEditor.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault, isEnglishSubject } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { ExamPaperAsset, ExamResponse } from '$lib/experiments/questions/types';
	import {
		latestPracticeDraft,
		flushPracticeDraftQueue,
		installPracticeDraftWindowFlush,
		queuePracticeDraft,
		queuedPracticeDraftForQuestion
	} from '$lib/practiceDraftSync';
	import {
		isRecord,
		recordFromRecord,
		stringFromRecord,
		type PracticeDraftSave,
		type SavedPracticeDraft
	} from '$lib/practiceDrafts';
	import { markLabel } from '$lib/marks';
	import { ArrowRight, CheckCircle2, CircleAlert, Target, Zap } from '@lucide/svelte';
	import { onMount } from 'svelte';
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
		savedAttempt?: {
			id: string;
			activeGaps: Array<{ gapId: string; stepId: string; href: string }>;
			recallPrompt: { href: string; label: string; cardCount: number } | null;
		} | null;
	};
	type SseMessage = {
		event: string;
		data: string;
	};
	type PracticeRouteView = 'attempt' | 'result';
	type StoredPracticeState = {
		answerText?: string;
		rewriteText?: string;
		gradedAnswerText?: string;
		gradeResult?: GradeResult | null;
		view?: PracticeRouteView;
		updatedAt?: number;
	};

	let loadedQuestionId = $state('');
	let answerText = $state('');
	let rewriteText = $state('');
	let gradedAnswerText = $state('');
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
		`${includedItems.length} of ${data.question.checklist.length} steps found`
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
	const gapHrefByStepId = $derived(
		new Map((gradeResult?.savedAttempt?.activeGaps ?? []).map((gap) => [gap.stepId, gap.href]))
	);
	const recallPrompt = $derived(gradeResult?.savedAttempt?.recallPrompt ?? null);
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
				? { title: 'Missing step', text: `Use this step: ${hintMissingLinks.join(' -> ')}.` }
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
	const isEnglish = $derived(isEnglishSubject(data.question.meta.subject));
	const topbarSubject = $derived(
		isEnglish ? englishSubjectOrDefault(data.question.meta.subject) : data.question.meta.subject
	);
	const topbarSubjects = [...BROWSE_SUBJECTS];
	const questionMetaSummary = $derived(
		[data.question.sourceRef, data.question.meta.paper, markLabel(data.question.meta.marks)]
			.filter(Boolean)
			.join(' · ')
	);
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
	const requestedPracticeView = $derived<PracticeRouteView>(
		page.url.searchParams.get('view') === 'result' ? 'result' : 'attempt'
	);
	const hasCheckedResult = $derived(Boolean(gradeResult && gradedAnswerText === answerText));
	const showCheckedResult = $derived(requestedPracticeView === 'result' && hasCheckedResult);
	const currentUserId = $derived(data.user?.uid ?? null);

	const practiceStoragePrefix = 'question-constellation:science-practice:v1:';
	let lastQueuedDraftSignature = '';

	beforeNavigate(() => {
		if (!currentUserId) return;
		void flushPracticeDraftQueue(currentUserId, { keepalive: true });
	});

	onMount(() => {
		if (!currentUserId) return undefined;
		return installPracticeDraftWindowFlush(currentUserId);
	});

	function responseFromOverlay(value: Record<string, unknown> | null | undefined) {
		if (!value || value.kind === 'none') return null;
		return value as ExamResponse;
	}

	function practiceStorageKey(questionId: string) {
		return `${practiceStoragePrefix}${currentUserId ?? 'anonymous'}:${questionId}`;
	}

	function loadStoredPracticeState(questionId: string): StoredPracticeState | null {
		if (typeof window === 'undefined') return null;
		try {
			const raw = window.sessionStorage.getItem(practiceStorageKey(questionId));
			return raw ? (JSON.parse(raw) as StoredPracticeState) : null;
		} catch {
			return null;
		}
	}

	function saveStoredPracticeState(
		questionId: string,
		overrides: Partial<StoredPracticeState> = {}
	) {
		if (typeof window === 'undefined') return;
		try {
			window.sessionStorage.setItem(
				practiceStorageKey(questionId),
				JSON.stringify({
					answerText,
					rewriteText,
					gradedAnswerText,
					gradeResult,
					view: requestedPracticeView,
					...overrides,
					updatedAt: Date.now()
				} satisfies StoredPracticeState)
			);
		} catch {
			// Session storage is a convenience for browser history, not required for practice.
		}
	}

	function scienceStateFromDraft(draft: PracticeDraftSave | SavedPracticeDraft | null) {
		if (!draft || draft.draftKind !== 'science-practice' || !isRecord(draft.payload)) return null;
		const gradeResultPayload = recordFromRecord(draft.payload, 'gradeResult');
		const view = stringFromRecord(draft.payload, 'view');
		return {
			answerText: stringFromRecord(draft.payload, 'answerText'),
			rewriteText: stringFromRecord(draft.payload, 'rewriteText'),
			gradedAnswerText: stringFromRecord(draft.payload, 'gradedAnswerText'),
			gradeResult: gradeResultPayload ? (gradeResultPayload as GradeResult) : null,
			view: view === 'result' ? 'result' : 'attempt',
			updatedAt: draft.clientUpdatedAt
		} satisfies StoredPracticeState;
	}

	function savedDraftCandidate(questionId: string) {
		const savedDraft = data.savedDraft as SavedPracticeDraft | null;
		return latestPracticeDraft(
			savedDraft,
			queuedPracticeDraftForQuestion(currentUserId, questionId)
		);
	}

	function initialPracticeState(questionId: string) {
		const storedState = loadStoredPracticeState(questionId);
		const draftState = scienceStateFromDraft(savedDraftCandidate(questionId));
		if (!storedState) return draftState;
		if (!draftState) return storedState;
		return (draftState.updatedAt ?? 0) >= (storedState.updatedAt ?? 0) ? draftState : storedState;
	}

	function scienceDraftPayload(overrides: Partial<StoredPracticeState> = {}) {
		return {
			answerText,
			rewriteText,
			gradedAnswerText,
			gradeResult,
			view: requestedPracticeView,
			...overrides
		} satisfies Record<string, unknown>;
	}

	function scienceDraftSignature(overrides: Partial<StoredPracticeState> = {}) {
		return JSON.stringify(scienceDraftPayload(overrides));
	}

	function scienceDraft(
		questionId: string,
		overrides: Partial<StoredPracticeState> = {}
	): PracticeDraftSave {
		return {
			questionId,
			draftKind: 'science-practice',
			answerText: overrides.answerText ?? answerText,
			payload: scienceDraftPayload(overrides),
			clientUpdatedAt: Date.now()
		};
	}

	function markSciencePracticeTouched() {
		if (loadedQuestionId === data.question.id) return;
		loadedQuestionId = data.question.id;
		lastQueuedDraftSignature = '';
	}

	function persistSciencePracticeState(overrides: Partial<StoredPracticeState> = {}) {
		if (data.englishPractice || (loadedQuestionId && loadedQuestionId !== data.question.id)) return;
		saveStoredPracticeState(data.question.id, overrides);
		const signature = scienceDraftSignature(overrides);
		if (!currentUserId || signature === lastQueuedDraftSignature) return;
		lastQueuedDraftSignature = signature;
		queuePracticeDraft(currentUserId, scienceDraft(data.question.id, overrides));
	}

	function applySciencePracticeState(storedState: StoredPracticeState | null) {
		answerText = storedState?.answerText ?? '';
		rewriteText = storedState?.rewriteText ?? '';
		gradedAnswerText = storedState?.gradedAnswerText ?? '';
		gradeResult = storedState?.gradeResult ?? null;
		gradePhase = gradeResult ? 'done' : 'idle';
		gradeError = '';
		showHint = false;
		lastQueuedDraftSignature = scienceDraftSignature({
			answerText,
			rewriteText,
			gradedAnswerText,
			gradeResult,
			view: storedState?.view ?? requestedPracticeView
		});
	}

	function updatePracticeView(view: PracticeRouteView, historyMode: 'push' | 'replace' = 'push') {
		if (typeof window === 'undefined') return;
		const url = new URL(page.url);
		if (view === 'result') {
			url.searchParams.set('view', 'result');
		} else {
			url.searchParams.delete('view');
		}

		const nextUrl = `${url.pathname}${url.search}${url.hash}`;
		const currentUrl = `${page.url.pathname}${page.url.search}${page.url.hash}`;
		if (nextUrl === currentUrl) return;

		void goto(nextUrl, {
			replaceState: historyMode === 'replace',
			noScroll: true,
			keepFocus: true
		});
	}

	function clearCheckedResult() {
		gradedAnswerText = '';
		gradeResult = null;
		gradeError = '';
		gradePhase = 'idle';
		rewriteText = '';
		if (requestedPracticeView === 'result') updatePracticeView('attempt', 'replace');
	}

	function setAnswerText(value: string) {
		markSciencePracticeTouched();
		const invalidatesResult = gradedAnswerText.length > 0 && value !== gradedAnswerText;
		answerText = value;
		if (invalidatesResult) clearCheckedResult();
		persistSciencePracticeState(invalidatesResult ? { view: 'attempt' } : {});
	}

	function setRewriteText(value: string) {
		markSciencePracticeTouched();
		rewriteText = value;
		persistSciencePracticeState();
	}

	async function checkAnswer() {
		if (!canCheck) return;
		markSciencePracticeTouched();

		rewriteText = '';
		gradedAnswerText = '';
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
			updatePracticeView('attempt', 'replace');
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
		if (phase === 'calling') return 'Looking for the steps you included.';
		if (phase === 'thinking') {
			return 'Comparing your answer with the method.';
		}
		if (phase === 'grading') return 'Preparing feedback.';
		if (phase === 'error') return 'The check could not finish.';
		return '';
	}

	function statusLabelForPhase(phase: GradePhase) {
		if (phase === 'connecting') return 'Starting check';
		if (phase === 'calling') return 'Finding steps';
		if (phase === 'thinking') return 'Comparing method';
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
			rewriteText = answerText;
			gradedAnswerText = answerText;
			gradePhase = 'done';
			updatePracticeView('result');
			persistSciencePracticeState({ view: 'result' });
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
		if (data.englishPractice) return;
		if (loadedQuestionId === data.question.id) {
			return;
		}

		loadedQuestionId = data.question.id;
		const storedState = initialPracticeState(data.question.id);
		applySciencePracticeState(storedState);
		if (storedState?.view === 'result' && storedState.gradeResult && storedState.gradedAnswerText) {
			updatePracticeView('result', 'replace');
		}
	});

	$effect(() => {
		if (data.englishPractice) return;
		if (loadedQuestionId !== data.question.id) return;
		persistSciencePracticeState();
	});

	$effect(() => {
		if (data.englishPractice) return;
		if (requestedPracticeView === 'result' && !hasCheckedResult && !isChecking) {
			updatePracticeView('attempt', 'replace');
		}
	});
</script>

<svelte:head>
	<title>{data.question.title} practice | Question Constellation</title>
	<meta
		name="description"
		content={isEnglish
			? 'Write, check, and repair a GCSE English answer against the mark focus.'
			: 'Write, check, and repair a GCSE answer against the mark-scoring method.'}
	/>
</svelte:head>

{#if data.englishPractice}
	<EnglishGuidedPractice
		practice={data.englishPractice}
		savedDraft={data.savedDraft}
		userId={currentUserId}
		user={data.user}
	/>
{:else}
	<main class="qc-real-app qc-practice-page">
		<AppTopbar
			user={data.user}
			subject={topbarSubject}
			subjects={topbarSubjects}
			searchPlaceholder="Search questions"
		/>

		<div class="qc-real-layout qc-question-layout">
			<aside class="qc-real-rail qc-question-rail" aria-label="Practice route">
				<IconBackLink href={previousHref} label="Back to method" />
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
							<small>{question.distanceLabel}</small>
						</a>
					{/each}
				</nav>
			</aside>

			<section class="qc-real-main qc-practice-main" aria-label="Practice workspace">
				{#if !showCheckedResult}
					<div class="qc-real-question-top">
						<div>
							<p>
								<MathText text={questionMetaSummary} />
							</p>
							<h2>Write the answer, then check it.</h2>
						</div>
					</div>

					<HintPanel hints={practiceHints} bind:open={showHint} />

					<ExamQuestionCard
						question={data.question}
						showTitle={false}
						showHeader={false}
						showMeta={false}
					/>

					<section class="qc-practice-answer-card">
						<PracticeAnswerEditor
							id="answer"
							label="Your answer"
							response={structuredResponse}
							assets={responseAssets}
							value={answerText}
							rows={answerRows}
							extended={data.question.meta.marks >= 20}
							placeholder="Write your answer..."
							onValueChange={setAnswerText}
						/>
						<div class="qc-practice-actions" aria-label="Answer actions">
							<button
								class="qc-action-button primary"
								type="button"
								onclick={checkAnswer}
								disabled={!canCheck}
							>
								{#if isChecking}
									<span class="loading-spinner button-spinner" aria-hidden="true"></span>
									Checking...
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
						<a class="qc-real-link-button" href={previousHref}> Review method </a>
					</div>

					<ThinkingChain
						steps={chainSteps}
						label="Checked method"
						note={hasMissingLinks ? 'Missing steps are shown below.' : 'The method is complete.'}
					/>

					<section class="qc-repair-panel">
						<p class="qc-panel-label">Fix the method</p>
						<div class="qc-repair-chain" aria-label="Method reminder">
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
						{#if hasMissingLinks}
							<PracticeAnswerEditor
								id="rewrite"
								label="Rewrite with the missing steps"
								response={structuredResponse}
								assets={responseAssets}
								value={rewriteText}
								rows={answerRows}
								extended={data.question.meta.marks >= 20}
								placeholder="Rewrite your answer..."
								onValueChange={setRewriteText}
							/>
						{:else}
							<p class="qc-practice-answer-label">Your checked answer</p>
							<p class="qc-checked-answer">{answerText}</p>
						{/if}
					</section>

					<section class="qc-feedback-stack" aria-label="Answer feedback">
						<section class="qc-result-summary">
							<p class="qc-panel-label">Checked answer</p>
							<p>
								{gradeResult?.awardedMarks ?? 0} of {gradeResult?.maxMarks ??
									data.question.meta.marks}
								marks. {missingItems.length === 0
									? 'All required steps are present.'
									: 'Add the missing steps to complete the answer.'}
							</p>
						</section>

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
								<p>No checklist steps were confirmed yet.</p>
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
											{#if gapHrefByStepId.get(item.stepId)}
												<a class="qc-inline-repair-link" href={gapHrefByStepId.get(item.stepId)}>
													Fix this step
												</a>
											{/if}
										</li>
									{/each}
								</ul>
							</section>
						{/if}

						{#if recallPrompt}
							<section class="qc-answer-panel recall">
								<p class="qc-panel-label">Flashcard repair</p>
								<p>
									This looks like a small recall gap. Practise {recallPrompt.cardCount}
									cards for {recallPrompt.label.replace(/^.*?:\s*/, '')}.
								</p>
								<a class="qc-action-button primary compact" href={recallPrompt.href}>
									Review flashcards
								</a>
							</section>
						{/if}

						{#if feedbackMarkdown}
							<section class="qc-answer-panel">
								<p class="qc-panel-label">Feedback</p>
								<MarkdownContent markdown={feedbackMarkdown} class="qc-feedback-markdown" />
							</section>
						{/if}
					</section>

					<div class="qc-practice-actions qc-check-next-actions" aria-label="Next actions">
						<a class="qc-action-button primary" href={nextQuestionHref}>
							<ArrowRight size={18} aria-hidden="true" />
							Next question
						</a>
						<a class="qc-action-button" href={previousHref}>Review method</a>
					</div>
				{/if}
			</section>
		</div>
	</main>
{/if}
