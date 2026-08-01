<script lang="ts">
	import { browser } from '$app/environment';
	import { beforeNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import PracticeAnswerEditor from '$lib/components/PracticeAnswerEditor.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import SubjectBreadcrumbs from '$lib/learning/SubjectBreadcrumbs.svelte';
	import type { ExamPaperAsset, ExamResponse } from '$lib/experiments/questions/types';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { addExternalInputSource, type ExternalInputSource } from '$lib/learning/answerAssistance';
	import { createActivityId, responseDurationMs } from '$lib/learning/activityTiming';
	import { markHomeSnapshotDirty } from '$lib/homeSnapshotClient';
	import {
		flushPracticeDraftQueue,
		installPracticeDraftWindowFlush,
		queuePracticeDraft
	} from '$lib/practiceDraftSync';
	import {
		classifyRequestFailure,
		fetchWithResponseTimeout,
		InterruptedRequestError,
		readStreamChunkWithTimeout,
		requestErrorFromResponse,
		ServerRequestError,
		type RequestFailure
	} from '$lib/requestFailure';
	import {
		ArrowRight,
		Check,
		CheckCircle2,
		CircleAlert,
		Clock3,
		FilePlus2,
		ListChecks,
		RotateCcw
	} from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const resolveInternalPath = resolve as (path: string) => ResolvedPathname;

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
	type PaperQuestion = NonNullable<PageProps['data']['paper']>['questions'][number];
	type PaperPhase = 'working' | 'checking' | 'result';
	type LocalPaperSnapshot = {
		version: 1;
		paperId: string;
		answers: Record<string, string>;
		results: Record<string, GradeResult>;
		responseStartedAt: Record<string, number>;
		externalInputSources: Record<string, ExternalInputSource[]>;
		pendingAttemptIds: Record<string, string>;
		phase: PaperPhase;
		updatedAt: number;
	};
	type SseMessage = { event: string; data: string };

	function isGradeResult(value: unknown): value is GradeResult {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
		const record = value as Record<string, unknown>;
		return (
			record.status === 'ok' &&
			typeof record.awardedMarks === 'number' &&
			typeof record.maxMarks === 'number' &&
			Array.isArray(record.presentStepIds) &&
			Array.isArray(record.missingStepIds)
		);
	}

	function serverAnswers() {
		return Object.fromEntries(
			(data.paper?.questions ?? []).map((question) => [
				question.id,
				question.saved?.answerText ?? ''
			])
		);
	}

	function serverResults() {
		return Object.fromEntries(
			(data.paper?.questions ?? [])
				.map((question) => [question.id, question.saved?.gradeResult] as const)
				.filter((entry): entry is [string, GradeResult] => isGradeResult(entry[1]))
		);
	}

	function serverUpdatedAt() {
		return Math.max(
			0,
			...(data.paper?.questions ?? []).map((question) => question.saved?.updatedAt ?? 0)
		);
	}

	let answers = $state<Record<string, string>>(serverAnswers());
	let results = $state<Record<string, GradeResult>>(serverResults());
	let responseStartedAt = $state<Record<string, number>>({});
	let externalInputSources = $state<Record<string, ExternalInputSource[]>>({});
	let pendingAttemptIds = $state<Record<string, string>>({});
	let phase = $state<PaperPhase>('working');
	let failure = $state<RequestFailure | null>(null);
	let checkingQuestionNumber = $state(0);
	let checkingStatus = $state('Preparing your paper');
	let stateUpdatedAt = $state(serverUpdatedAt());
	let hydratedPaperId = $state('');

	const paperQuestions = $derived(data.paper?.questions ?? []);
	const answeredCount = $derived(
		paperQuestions.filter((question) => (answers[question.id] ?? '').trim().length > 0).length
	);
	const checkedCount = $derived(
		paperQuestions.filter((question) => Boolean(results[question.id])).length
	);
	const blankCount = $derived(paperQuestions.length - answeredCount);
	const awardedMarks = $derived(
		paperQuestions.reduce((total, question) => total + (results[question.id]?.awardedMarks ?? 0), 0)
	);
	const percentage = $derived(
		data.paper?.totalMarks ? Math.round((awardedMarks / data.paper.totalMarks) * 100) : 0
	);
	const checkingProgress = $derived(
		paperQuestions.length > 0 ? Math.round((checkedCount / paperQuestions.length) * 100) : 0
	);
	const builderHref = $derived(resolveInternalPath(`${data.subject.href}/paper`));

	function storageKey(paperId: string) {
		return `question-constellation:practice-paper:v1:${data.user.uid}:${paperId}`;
	}

	function readLocalSnapshot(paperId: string): LocalPaperSnapshot | null {
		if (!browser) return null;
		try {
			const raw = window.localStorage.getItem(storageKey(paperId));
			if (!raw) return null;
			const parsed = JSON.parse(raw) as LocalPaperSnapshot;
			if (parsed.version !== 1 || parsed.paperId !== paperId) return null;
			return parsed;
		} catch {
			return null;
		}
	}

	function restorePaperState() {
		const paper = data.paper;
		if (!paper) {
			answers = {};
			results = {};
			phase = 'working';
			return;
		}
		answers = serverAnswers();
		results = serverResults();
		responseStartedAt = {};
		externalInputSources = {};
		pendingAttemptIds = {};
		phase = paper.savedStatus === 'complete' ? 'result' : 'working';
		stateUpdatedAt = serverUpdatedAt();
		failure = null;
		checkingQuestionNumber = 0;

		const local = readLocalSnapshot(paper.id);
		if (!local || local.updatedAt < stateUpdatedAt) return;
		const currentIds = new Set(paper.questions.map((question) => question.id));
		if (Object.keys(local.answers).some((questionId) => !currentIds.has(questionId))) return;
		answers = { ...answers, ...local.answers };
		results = { ...results, ...local.results };
		responseStartedAt = local.responseStartedAt ?? {};
		externalInputSources = local.externalInputSources ?? {};
		pendingAttemptIds = local.pendingAttemptIds ?? {};
		phase = local.phase === 'checking' ? 'working' : local.phase;
		stateUpdatedAt = local.updatedAt;
	}

	function persistPaperState() {
		const paper = data.paper;
		if (!browser || !paper) return;
		stateUpdatedAt = Date.now();
		const snapshot: LocalPaperSnapshot = {
			version: 1,
			paperId: paper.id,
			answers,
			results,
			responseStartedAt,
			externalInputSources,
			pendingAttemptIds,
			phase,
			updatedAt: stateUpdatedAt
		};
		try {
			window.localStorage.setItem(storageKey(paper.id), JSON.stringify(snapshot));
		} catch {
			// Cloud answer drafts remain the durable fallback when local storage is unavailable.
		}
	}

	function paperMetadata(status: 'in_progress' | 'complete') {
		const paper = data.paper;
		if (!paper) return null;
		return {
			version: 1,
			id: paper.id,
			href: paper.href,
			subject: data.subject.subject,
			title: paper.title,
			topicIds: paper.topicIds,
			questionIds: paper.questions.map((question) => question.id),
			durationMinutes: paper.durationMinutes,
			totalMarks: paper.totalMarks,
			status,
			updatedAt: Date.now()
		};
	}

	function queueQuestionDraft(
		question: PaperQuestion,
		status: 'in_progress' | 'complete' = 'in_progress'
	) {
		const paper = data.paper;
		if (!paper) return;
		const answerText = answers[question.id] ?? '';
		const gradeResult = results[question.id] ?? null;
		const clientUpdatedAt = Date.now();
		queuePracticeDraft(data.user.uid, {
			questionId: question.id,
			draftKind: 'question-practice',
			answerText,
			clientUpdatedAt,
			payload: {
				answerText,
				rewriteText: '',
				gradedAnswerText: gradeResult ? answerText : '',
				gradeResult,
				view: gradeResult ? 'result' : 'attempt',
				activitySessionId: `practice-paper_${paper.id}`,
				responseStartedAt: responseStartedAt[question.id] ?? clientUpdatedAt,
				pendingAttemptId: pendingAttemptIds[question.id] ?? '',
				pendingAttemptSignature: '',
				pendingResponseDurationMs: null,
				hintUsed: false,
				markingPointsUsed: false,
				answerExternalInputSources: externalInputSources[question.id] ?? [],
				rewriteExternalInputSources: [],
				practicePaper: paperMetadata(status),
				updatedAt: clientUpdatedAt
			}
		});
	}

	function setAnswer(question: PaperQuestion, value: string) {
		if (phase !== 'working') return;
		answers = { ...answers, [question.id]: value };
		if (!responseStartedAt[question.id] && value.trim()) {
			responseStartedAt = { ...responseStartedAt, [question.id]: Date.now() };
		}
		if (results[question.id]) {
			const nextResults = { ...results };
			delete nextResults[question.id];
			results = nextResults;
		}
		failure = null;
		persistPaperState();
		queueQuestionDraft(question);
	}

	function markExternalInput(question: PaperQuestion, source: ExternalInputSource) {
		externalInputSources = {
			...externalInputSources,
			[question.id]: addExternalInputSource(externalInputSources[question.id] ?? [], source)
		};
		persistPaperState();
		queueQuestionDraft(question);
	}

	function structuredResponse(question: PaperQuestion): ExamResponse | null {
		const value = question.renderingOverlay?.responseInteraction;
		if (!value || value.kind === 'none') return null;
		return value as ExamResponse;
	}

	function responseAssets(question: PaperQuestion): Record<string, ExamPaperAsset> {
		return Object.fromEntries(
			question.assets.map((asset) => [
				asset.id,
				{
					id: asset.id,
					label: asset.sourceLabel,
					src: asset.publicPath,
					alt: asset.altText,
					width: asset.paperWidthPx ?? undefined,
					height: asset.paperHeightPx ?? undefined,
					paperMeasurement: asset.paperMeasurement ?? null
				}
			])
		);
	}

	function answerRows(marks: number) {
		if (marks >= 10) return 9;
		if (marks >= 6) return 6;
		if (marks >= 4) return 5;
		return 4;
	}

	function parseSseBlock(block: string): SseMessage | null {
		let event = 'message';
		const dataLines: string[] = [];
		for (const line of block.split(/\r?\n/)) {
			if (!line || line.startsWith(':')) continue;
			if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
			if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
		}
		return dataLines.length > 0 ? { event, data: dataLines.join('\n') } : null;
	}

	function applySseMessage(
		message: SseMessage,
		reference: string | null,
		completed: { result: GradeResult | null }
	) {
		if (message.event === 'status') {
			const payload = JSON.parse(message.data) as { phase?: string };
			checkingStatus =
				payload.phase === 'calling'
					? 'Finding marking points'
					: payload.phase === 'thinking'
						? 'Comparing with marking guidance'
						: payload.phase === 'grading'
							? 'Preparing feedback'
							: checkingStatus;
			return;
		}
		if (message.event === 'done') {
			const value = JSON.parse(message.data) as unknown;
			if (!isGradeResult(value))
				throw new InterruptedRequestError('The checker returned no result.');
			completed.result = value;
			return;
		}
		if (message.event === 'error') {
			const payload = JSON.parse(message.data) as { error?: string; message?: string };
			throw new ServerRequestError(payload.message ?? 'Unable to check this answer right now.', {
				code: payload.error,
				reference
			});
		}
	}

	async function readGradeStream(response: Response) {
		const reader = response.body?.getReader();
		if (!reader) throw new InterruptedRequestError('The grading stream could not be opened.');
		const decoder = new TextDecoder();
		const completed: { result: GradeResult | null } = { result: null };
		const reference = response.headers.get('cf-ray') ?? response.headers.get('x-request-id');
		let buffer = '';
		while (true) {
			const { value, done } = await readStreamChunkWithTimeout(reader);
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let boundary = buffer.indexOf('\n\n');
			while (boundary >= 0) {
				const message = parseSseBlock(buffer.slice(0, boundary).trimEnd());
				buffer = buffer.slice(boundary + 2);
				if (message) applySseMessage(message, reference, completed);
				boundary = buffer.indexOf('\n\n');
			}
		}
		buffer += decoder.decode();
		const trailing = parseSseBlock(buffer.trim());
		if (trailing) applySseMessage(trailing, reference, completed);
		if (!completed.result) throw new InterruptedRequestError('The answer check ended early.');
		return completed.result;
	}

	async function gradeQuestion(question: PaperQuestion) {
		const paper = data.paper;
		if (!paper) throw new Error('Practice paper is unavailable.');
		const answer = (answers[question.id] ?? '').trim();
		let attemptId = pendingAttemptIds[question.id];
		if (!attemptId) {
			attemptId = createActivityId('paper-attempt');
			pendingAttemptIds = { ...pendingAttemptIds, [question.id]: attemptId };
			persistPaperState();
		}
		checkingStatus = 'Starting answer check';
		const response = await fetchWithResponseTimeout(
			resolve('/api/questions/[questionId]/grade', { questionId: question.id }),
			{
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					answer,
					attemptId,
					sourceSessionId: `practice-paper_${paper.id}`,
					responseDurationMs: responseDurationMs(responseStartedAt[question.id] ?? Date.now()),
					assistance: {
						hintOpened: false,
						markingPointsViewed: false,
						feedbackRewrite: false,
						externalInputDetected: (externalInputSources[question.id] ?? []).length > 0,
						externalInputSources: externalInputSources[question.id] ?? []
					}
				})
			}
		);
		if (!response.ok)
			throw await requestErrorFromResponse(response, 'Answer check request failed.');
		return await readGradeStream(response);
	}

	async function finishPaper() {
		if (!data.paper || phase === 'checking' || answeredCount === 0) return;
		if (
			blankCount > 0 &&
			!window.confirm(
				`${blankCount} question${blankCount === 1 ? ' is' : 's are'} still blank. Finish the paper anyway?`
			)
		) {
			return;
		}

		phase = 'checking';
		failure = null;
		persistPaperState();
		try {
			for (const question of paperQuestions) {
				if (!(answers[question.id] ?? '').trim() || results[question.id]) continue;
				checkingQuestionNumber = question.number;
				const result = await gradeQuestion(question);
				results = { ...results, [question.id]: result };
				queueQuestionDraft(question);
				persistPaperState();
			}
			phase = 'result';
			checkingQuestionNumber = 0;
			for (const question of paperQuestions) queueQuestionDraft(question, 'complete');
			persistPaperState();
			await flushPracticeDraftQueue(data.user.uid);
			markHomeSnapshotDirty();
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (cause) {
			console.error('[practice-paper] checking failed', cause);
			phase = 'working';
			failure = classifyRequestFailure(cause, {
				action: 'finish checking this paper',
				serverLabel: 'The answer checker',
				streamStarted: checkedCount > 0
			});
			persistPaperState();
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function resetLocalPaper() {
		const paper = data.paper;
		if (!paper || !window.confirm('Clear every answer and result in this paper?')) return;
		window.localStorage.removeItem(storageKey(paper.id));
		answers = Object.fromEntries(paper.questions.map((question) => [question.id, '']));
		results = {};
		responseStartedAt = {};
		externalInputSources = {};
		pendingAttemptIds = {};
		phase = 'working';
		failure = null;
		for (const question of paper.questions) queueQuestionDraft(question);
		persistPaperState();
	}

	function resultClass(result: GradeResult | undefined) {
		if (!result) return 'blank';
		return result.result;
	}

	function pointLabel(question: PaperQuestion, point: PaperQuestion['markingPoints'][number]) {
		return question.checklist.find((item) => item.stepId === point.id)?.text ?? point.label;
	}

	function questionResultHref(question: PaperQuestion) {
		const base = resolve('/questions/[questionId]/practice', { questionId: question.id });
		return resolveInternalPath(`${base}?view=result`);
	}

	$effect(() => {
		const nextPaperId = data.paper?.id ?? '';
		if (!browser || nextPaperId === hydratedPaperId) return;
		hydratedPaperId = nextPaperId;
		restorePaperState();
	});

	beforeNavigate(() => {
		void flushPracticeDraftQueue(data.user.uid, { keepalive: true });
	});

	onMount(() => installPracticeDraftWindowFlush(data.user.uid));
</script>

<svelte:head>
	<title>
		{data.paper ? data.paper.title : `Create a ${data.subject.subject} practice paper`} | Question Constellation
	</title>
	<meta
		name="description"
		content={`Create a longer ${data.subject.subject} practice paper from reviewed questions.`}
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="qc-real-app practice-paper-page qc-test-taking-view">
	<AppTopbar user={data.user} subject={data.subject.subject} showSearch={false} showNavigation />

	{#if !data.paper}
		<div class="paper-builder-shell">
			<SubjectBreadcrumbs subject={data.subject.subject} subjectHref={data.subject.href} />

			<header class="paper-builder-hero">
				<p class="qc-real-kicker">Longer practice</p>
				<h1>Create a practice paper</h1>
				<p>
					Get a complete list of exam questions to work through in one sitting. Choose topics, or
					leave them blank for a mixed paper.
				</p>
			</header>

			<form class="paper-builder" method="POST" action="?/createPaper">
				<fieldset class="builder-section duration-section">
					<legend>How long should it be?</legend>
					<div class="duration-options">
						<label>
							<input type="radio" name="minutes" value="30" />
							<span><strong>30 min</strong><small>Short paper</small></span>
						</label>
						<label>
							<input type="radio" name="minutes" value="45" />
							<span><strong>45 min</strong><small>Standard paper</small></span>
						</label>
						<label>
							<input type="radio" name="minutes" value="60" checked />
							<span><strong>60 min</strong><small>Full paper</small></span>
						</label>
					</div>
				</fieldset>

				<fieldset class="builder-section topic-section" disabled={data.topics.length === 0}>
					<legend>Choose topics <span>optional</span></legend>
					<p class="builder-help">No topics selected means mix everything in your course.</p>
					<div class="topic-options">
						{#each data.topics as topic (topic.id)}
							<label>
								<input type="checkbox" name="topic" value={topic.id} />
								<span>
									<strong><MathText text={topic.title} /></strong>
									<small>
										{topic.questionCount} reviewed {topic.questionCount === 1
											? 'question'
											: 'questions'}
									</small>
								</span>
							</label>
						{/each}
					</div>
				</fieldset>

				{#if data.notice}
					<p class="builder-notice" role="status"><CircleAlert size={19} /> {data.notice}</p>
				{/if}

				<footer class="builder-action-bar">
					<div>
						<strong>{data.questionCount} questions available</strong>
						<span>Questions and answers are saved to your account.</span>
					</div>
					<button
						class="qc-action-button primary"
						type="submit"
						disabled={data.questionCount === 0}
					>
						<FilePlus2 size={18} aria-hidden="true" />
						Create paper
					</button>
				</footer>
			</form>
		</div>
	{:else}
		<div class="paper-workspace">
			<aside class="paper-rail" aria-label="Paper progress">
				<a class="paper-back" href={builderHref}>← Create a different paper</a>
				<p class="qc-real-kicker">Practice paper</p>
				<h1>{data.paper.title}</h1>
				<div class="paper-facts">
					<span><Clock3 size={15} /> About {data.paper.estimatedDurationMinutes} min</span>
					<span><ListChecks size={15} /> {data.paper.totalMarks} marks</span>
					<span>{paperQuestions.length} questions</span>
				</div>
				<div
					class="paper-progress"
					aria-label={`${answeredCount} of ${paperQuestions.length} answered`}
				>
					<div>
						<strong>{phase === 'result' ? checkedCount : answeredCount}</strong
						>/{paperQuestions.length}
					</div>
					<span>{phase === 'result' ? 'checked' : 'answered'}</span>
				</div>
				<nav class="paper-jump-list" aria-label="Jump to a question">
					{#each paperQuestions as question (question.id)}
						<a
							href={`#paper-question-${question.number}`}
							class:answered={Boolean((answers[question.id] ?? '').trim())}
							class:checked={Boolean(results[question.id])}
							aria-label={`Question ${question.number}, ${results[question.id] ? 'checked' : (answers[question.id] ?? '').trim() ? 'answered' : 'blank'}`}
						>
							{question.number}
						</a>
					{/each}
				</nav>
				<p class="paper-save-note">Untimed · leave and resume whenever you need.</p>
			</aside>

			<section class="paper-main" aria-label="Practice paper">
				{#if phase === 'checking'}
					<section class="paper-checking" aria-live="polite" aria-busy="true">
						<div class="checking-mark"><span>{checkingQuestionNumber || '•'}</span></div>
						<p class="qc-real-kicker">Checking question {checkingQuestionNumber}</p>
						<h2>{checkingStatus}</h2>
						<p>Your answers are saved. Keep this page open while the paper is checked.</p>
						<div class="checking-track" aria-hidden="true">
							<span style={`width: ${checkingProgress}%`}></span>
						</div>
						<small>{checkedCount} of {answeredCount} answered questions checked</small>
					</section>
				{:else if phase === 'result'}
					<header class="paper-result-summary">
						<div>
							<p class="qc-real-kicker">Paper complete</p>
							<h2>{awardedMarks}/{data.paper.totalMarks} marks</h2>
							<p>
								{percentage}% · This is your score on this practice paper, not a qualification-grade
								prediction.
							</p>
						</div>
						<CheckCircle2 size={32} aria-hidden="true" />
					</header>

					<div class="paper-result-list">
						{#each paperQuestions as question (question.id)}
							{@const result = results[question.id]}
							<details
								id={`paper-question-${question.number}`}
								class={`paper-result ${resultClass(result)}`}
								open={!result || result.result !== 'correct'}
							>
								<summary>
									<span class="result-number">{question.number}</span>
									<span>
										<strong><MathText text={question.title} /></strong>
										<small
											>{result
												? `${result.awardedMarks}/${result.maxMarks} marks`
												: 'Not answered'}</small
										>
									</span>
									{#if result?.result === 'correct'}
										<Check size={20} aria-hidden="true" />
									{:else}
										<CircleAlert size={20} aria-hidden="true" />
									{/if}
								</summary>
								<div class="result-body">
									<ExamQuestionCard
										{question}
										compact
										showHeader={false}
										showMeta={false}
										showTitle={false}
									/>
									<div class="checked-answer">
										<span>Your answer</span>
										<p>{answers[question.id]?.trim() || 'No answer submitted.'}</p>
									</div>
									{#if result && question.markingPoints.length > 0}
										<ol class="result-points" aria-label="Marking points">
											{#each question.markingPoints as point (point.id)}
												{@const included = result.presentStepIds.includes(point.id)}
												<li class:included class:missing={!included}>
													{#if included}<Check size={16} />{:else}<CircleAlert size={16} />{/if}
													<span>
														<strong>{included ? 'Included' : 'Missing'}</strong>
														<MathText text={pointLabel(question, point)} />
													</span>
												</li>
											{/each}
										</ol>
									{/if}
									{#if result?.feedbackMarkdown}
										<div class="result-feedback">
											<span>Feedback</span>
											<MarkdownContent markdown={result.feedbackMarkdown} />
										</div>
									{/if}
									<a class="qc-action-button compact" href={questionResultHref(question)}>
										{result && result.result !== 'correct'
											? 'Improve this answer'
											: 'Open question'}
										<ArrowRight size={15} />
									</a>
								</div>
							</details>
						{/each}
					</div>

					<footer class="result-actions">
						<a class="qc-action-button primary" href={builderHref}>
							<FilePlus2 size={18} /> Create another paper
						</a>
						<button class="qc-action-button" type="button" onclick={resetLocalPaper}>
							<RotateCcw size={17} /> Start this paper again
						</button>
					</footer>
				{:else}
					<header class="paper-intro">
						<div>
							<p class="qc-real-kicker">Your paper is ready</p>
							<h2>Work through the problems in any order.</h2>
							<p>Every question is on this page. Marking guidance stays hidden until you finish.</p>
						</div>
						<span>{answeredCount}/{paperQuestions.length} answered</span>
					</header>

					{#if failure}
						<RequestFailureNotice
							{failure}
							onRetry={() => void finishPaper()}
							retryLabel="Continue checking"
						/>
					{/if}

					<div class="paper-question-list">
						{#each paperQuestions as question (question.id)}
							<article id={`paper-question-${question.number}`} class="paper-question">
								<header class="paper-question-heading">
									<span>Question {question.number}</span>
									<strong
										>{question.meta.marks} {question.meta.marks === 1 ? 'mark' : 'marks'}</strong
									>
								</header>
								<ExamQuestionCard
									{question}
									showHeader={false}
									showMeta={false}
									showTitle={false}
									assetLoading={question.number <= 2 ? 'eager' : 'lazy'}
								/>
								<section class="paper-answer">
									<PracticeAnswerEditor
										id={`paper-answer-${question.id}`}
										label="Your answer"
										response={structuredResponse(question)}
										assets={responseAssets(question)}
										value={answers[question.id] ?? ''}
										rows={answerRows(question.meta.marks)}
										extended={question.meta.marks >= 10}
										placeholder="Write your answer..."
										onValueChange={(value) => setAnswer(question, value)}
										onExternalInput={(source) => markExternalInput(question, source)}
									/>
									<span class="answer-save-state">
										{(answers[question.id] ?? '').trim() ? 'Answer saved' : 'Not answered yet'}
									</span>
								</section>
							</article>
						{/each}
					</div>

					<footer class="finish-paper-bar">
						<div>
							<strong>{answeredCount} of {paperQuestions.length} answered</strong>
							<span
								>{blankCount > 0
									? `${blankCount} still blank`
									: 'Every question has an answer'}</span
							>
						</div>
						<button
							class="qc-action-button primary"
							type="button"
							onclick={() => void finishPaper()}
							disabled={answeredCount === 0}
						>
							<CheckCircle2 size={18} /> Finish and check paper
						</button>
					</footer>
				{/if}
			</section>
		</div>
	{/if}
</main>

<style>
	.practice-paper-page {
		min-height: var(--app-viewport-height, 100vh);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0)),
			var(--qc-app-surface);
		color: var(--qc-ui-text);
	}

	.paper-builder-shell {
		width: min(100%, 68rem);
		margin: 0 auto;
		padding: 0 clamp(0.8rem, 2.4vw, 1.5rem) 4rem;
	}

	.paper-builder-hero {
		padding: clamp(2rem, 5vw, 4.4rem) 0 clamp(1.4rem, 3vw, 2.3rem);
		border-bottom: 1px solid var(--qc-ui-border-subtle);
	}

	.paper-builder-hero h1,
	.paper-builder-hero p {
		margin: 0;
	}

	.paper-builder-hero h1 {
		max-width: 44rem;
		font-size: clamp(2.2rem, 6.5vw, 4.8rem);
		font-weight: 580;
		letter-spacing: -0.055em;
		line-height: 0.96;
	}

	.paper-builder-hero > p:last-child {
		max-width: 40rem;
		margin-top: 1.1rem;
		color: var(--qc-ui-text-secondary);
		font-size: 1.05rem;
		line-height: 1.55;
	}

	.paper-builder {
		display: grid;
		gap: 1.2rem;
		padding-top: 1.5rem;
	}

	.builder-section {
		min-width: 0;
		margin: 0;
		padding: 1.1rem;
		border: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-raised);
	}

	.builder-section legend {
		padding: 0 0.4rem;
		font-size: 1.05rem;
		font-weight: 760;
	}

	.builder-section legend span {
		margin-left: 0.3rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.74rem;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.duration-options,
	.topic-options {
		display: grid;
		gap: 0.65rem;
	}

	.duration-options {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.duration-options label,
	.topic-options label {
		position: relative;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.7rem;
		align-items: center;
		min-height: 4.25rem;
		padding: 0.75rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface);
		cursor: pointer;
	}

	.duration-options label:has(input:checked),
	.topic-options label:has(input:checked) {
		border-color: var(--qc-ui-accent);
		background: var(--qc-ui-accent-muted);
		box-shadow: inset 0.22rem 0 var(--qc-ui-accent);
	}

	.duration-options input,
	.topic-options input {
		width: 1.05rem;
		height: 1.05rem;
		accent-color: var(--qc-ui-accent);
	}

	.duration-options span,
	.topic-options span {
		display: grid;
		gap: 0.14rem;
	}

	.duration-options strong,
	.topic-options strong {
		font-size: 0.95rem;
		line-height: 1.25;
	}

	.duration-options small,
	.topic-options small,
	.builder-help {
		color: var(--qc-ui-text-muted);
		font-size: 0.8rem;
		line-height: 1.35;
	}

	.builder-help {
		margin: 0 0 0.85rem;
	}

	.topic-options {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		max-height: 31rem;
		overflow-y: auto;
		padding-right: 0.15rem;
	}

	.builder-notice {
		display: flex;
		gap: 0.55rem;
		align-items: center;
		margin: 0;
		padding: 0.8rem;
		border: 1px solid var(--qc-ui-warning-border);
		background: var(--qc-ui-warning-soft);
		color: var(--qc-ui-warning);
	}

	.builder-action-bar,
	.finish-paper-bar,
	.result-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.9rem;
		align-items: center;
		justify-content: space-between;
	}

	.builder-action-bar {
		position: sticky;
		bottom: 0.75rem;
		z-index: 3;
		padding: 0.9rem 1rem;
		border: 1px solid var(--qc-ui-border);
		background: color-mix(in srgb, var(--qc-ui-surface-raised) 94%, transparent);
		box-shadow: 0 1rem 2.5rem rgba(16, 32, 51, 0.12);
		backdrop-filter: blur(14px);
	}

	.builder-action-bar > div,
	.finish-paper-bar > div {
		display: grid;
		gap: 0.15rem;
	}

	.builder-action-bar span,
	.finish-paper-bar span {
		color: var(--qc-ui-text-muted);
		font-size: 0.8rem;
	}

	.paper-workspace {
		display: grid;
		grid-template-columns: minmax(14rem, 18.5rem) minmax(0, 1fr);
		width: min(100%, 91rem);
		margin: 0 auto;
	}

	.paper-rail {
		position: sticky;
		top: var(--qc-topbar-height, 4rem);
		display: grid;
		align-content: start;
		gap: 0.8rem;
		min-height: calc(var(--app-viewport-height, 100vh) - var(--qc-topbar-height, 4rem));
		padding: 1.2rem;
		border-right: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-translucent);
		backdrop-filter: blur(16px);
	}

	.paper-back {
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
		font-weight: 650;
		text-decoration: none;
	}

	.paper-rail h1,
	.paper-rail p {
		margin: 0;
	}

	.paper-rail h1 {
		font-size: 1.35rem;
		line-height: 1.15;
	}

	.paper-facts {
		display: grid;
		gap: 0.35rem;
		padding: 0.8rem 0;
		border-block: 1px solid var(--qc-ui-border-subtle);
		color: var(--qc-ui-text-secondary);
		font-size: 0.82rem;
	}

	.paper-facts span {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.paper-progress {
		display: flex;
		gap: 0.45rem;
		align-items: baseline;
	}

	.paper-progress div {
		font-size: 1.45rem;
		font-variant-numeric: tabular-nums;
	}

	.paper-progress span {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		text-transform: uppercase;
	}

	.paper-jump-list {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.35rem;
	}

	.paper-jump-list a {
		display: grid;
		aspect-ratio: 1;
		place-items: center;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface);
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		font-weight: 750;
		text-decoration: none;
	}

	.paper-jump-list a.answered {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.paper-jump-list a.checked {
		background: var(--qc-ui-accent);
		color: var(--qc-ui-on-accent);
	}

	.paper-save-note {
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		line-height: 1.45;
	}

	.paper-main {
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
		padding: clamp(0.8rem, 2.5vw, 1.7rem) clamp(0.7rem, 3vw, 2.2rem) 5rem;
	}

	.paper-intro,
	.paper-result-summary {
		display: flex;
		gap: 1rem;
		align-items: start;
		justify-content: space-between;
		width: min(100%, 980px);
		padding: 1.15rem;
		border: 1px solid var(--qc-ui-accent-border);
		background:
			repeating-linear-gradient(
				0deg,
				transparent 0,
				transparent 1.65rem,
				color-mix(in srgb, var(--qc-ui-accent) 6%, transparent) 1.65rem,
				color-mix(in srgb, var(--qc-ui-accent) 6%, transparent) calc(1.65rem + 1px)
			),
			var(--qc-ui-accent-muted);
	}

	.paper-intro h2,
	.paper-intro p,
	.paper-result-summary h2,
	.paper-result-summary p {
		margin: 0;
	}

	.paper-intro h2 {
		margin-top: 0.16rem;
		font-size: clamp(1.25rem, 2.6vw, 1.8rem);
	}

	.paper-intro div > p:last-child,
	.paper-result-summary div > p:last-child {
		margin-top: 0.4rem;
		color: var(--qc-ui-text-secondary);
		line-height: 1.45;
	}

	.paper-intro > span {
		flex: none;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--qc-ui-accent-border);
		background: var(--qc-ui-surface);
		font-size: 0.76rem;
		font-weight: 730;
	}

	.paper-question-list,
	.paper-result-list {
		display: grid;
		gap: 1.25rem;
		width: min(100%, 980px);
	}

	.paper-question {
		scroll-margin-top: calc(var(--qc-topbar-height, 4rem) + 0.8rem);
		border: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-raised);
		box-shadow: 0 0.7rem 1.8rem rgba(16, 32, 51, 0.06);
	}

	.paper-question-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 3rem;
		padding: 0.7rem 0.9rem;
		border-bottom: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-muted);
	}

	.paper-question-heading span {
		font-size: 1rem;
		font-weight: 800;
	}

	.paper-question-heading strong {
		font-size: 0.78rem;
		font-weight: 680;
	}

	.paper-question :global(.qc-exam-card) {
		width: 100%;
		border: 0;
		background: transparent;
	}

	.paper-answer {
		display: grid;
		gap: 0.45rem;
		padding: 1rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
		background: color-mix(in srgb, var(--qc-ui-surface) 86%, transparent);
	}

	.answer-save-state {
		justify-self: end;
		color: var(--qc-ui-text-muted);
		font-size: 0.72rem;
	}

	.finish-paper-bar {
		position: sticky;
		bottom: 0.7rem;
		z-index: 3;
		width: min(100%, 980px);
		padding: 0.85rem 1rem;
		border: 1px solid var(--qc-ui-border);
		background: color-mix(in srgb, var(--qc-ui-surface-raised) 94%, transparent);
		box-shadow: 0 1rem 2.5rem rgba(16, 32, 51, 0.16);
		backdrop-filter: blur(14px);
	}

	.paper-checking {
		display: grid;
		justify-items: center;
		width: min(100%, 42rem);
		margin: clamp(2rem, 8vh, 6rem) auto 0;
		padding: clamp(1.4rem, 4vw, 2.8rem);
		border: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-raised);
		text-align: center;
	}

	.checking-mark {
		display: grid;
		width: 5rem;
		aspect-ratio: 1;
		margin-bottom: 1rem;
		place-items: center;
		border: 2px solid var(--qc-ui-accent);
		border-radius: 50%;
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
		font-size: 1.8rem;
		font-weight: 800;
		animation: paper-pulse 1.5s ease-in-out infinite;
	}

	.paper-checking h2,
	.paper-checking p {
		margin: 0;
	}

	.paper-checking h2 {
		margin-top: 0.2rem;
		font-size: 1.45rem;
	}

	.paper-checking > p:not(.qc-real-kicker) {
		max-width: 30rem;
		margin-top: 0.45rem;
		color: var(--qc-ui-text-muted);
		line-height: 1.45;
	}

	.checking-track {
		width: min(100%, 24rem);
		height: 0.45rem;
		margin-top: 1.2rem;
		background: var(--qc-ui-surface-muted);
	}

	.checking-track span {
		display: block;
		height: 100%;
		background: var(--qc-ui-accent);
		transition: width 240ms ease;
	}

	.paper-checking small {
		margin-top: 0.45rem;
		color: var(--qc-ui-text-muted);
	}

	.paper-result-summary {
		border-color: var(--qc-ui-accent);
	}

	.paper-result-summary h2 {
		margin-top: 0.12rem;
		font-size: clamp(2rem, 6vw, 3.8rem);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.05em;
	}

	.paper-result-summary > :global(svg) {
		flex: none;
		color: var(--qc-ui-accent);
	}

	.paper-result {
		scroll-margin-top: calc(var(--qc-topbar-height, 4rem) + 0.8rem);
		border: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-raised);
	}

	.paper-result.correct {
		border-left: 0.3rem solid var(--qc-ui-accent);
	}

	.paper-result.partial,
	.paper-result.incorrect,
	.paper-result.blank {
		border-left: 0.3rem solid var(--qc-ui-warning);
	}

	.paper-result summary {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.75rem;
		align-items: center;
		min-height: 4.4rem;
		padding: 0.75rem 0.9rem;
		cursor: pointer;
		list-style: none;
	}

	.paper-result summary::-webkit-details-marker {
		display: none;
	}

	.result-number {
		display: grid;
		width: 2.3rem;
		aspect-ratio: 1;
		place-items: center;
		border: 1px solid var(--qc-ui-border);
		font-weight: 800;
	}

	.paper-result summary > span:nth-child(2) {
		display: grid;
		gap: 0.18rem;
	}

	.paper-result summary small {
		color: var(--qc-ui-text-muted);
	}

	.paper-result.correct summary > :global(svg) {
		color: var(--qc-ui-accent);
	}

	.paper-result:not(.correct) summary > :global(svg) {
		color: var(--qc-ui-warning);
	}

	.result-body {
		display: grid;
		gap: 0.9rem;
		padding: 0 0.95rem 1rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.result-body :global(.qc-exam-card) {
		width: 100%;
		border: 0;
		background: transparent;
	}

	.checked-answer,
	.result-feedback {
		display: grid;
		gap: 0.35rem;
		padding: 0.8rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.checked-answer > span,
	.result-feedback > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.72rem;
		font-weight: 760;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.checked-answer p {
		margin: 0;
		white-space: pre-wrap;
	}

	.result-points {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.result-points li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.55rem;
		align-items: start;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--qc-ui-border-subtle);
	}

	.result-points li.included {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.result-points li.missing {
		border-color: var(--qc-ui-warning-border);
		background: var(--qc-ui-warning-soft);
		color: var(--qc-ui-warning);
	}

	.result-points li > span {
		display: grid;
		gap: 0.12rem;
	}

	.result-points strong {
		font-size: 0.7rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.result-actions {
		width: min(100%, 980px);
		padding-top: 0.5rem;
	}

	@keyframes paper-pulse {
		0%,
		100% {
			box-shadow: 0 0 0 0 color-mix(in srgb, var(--qc-ui-accent) 24%, transparent);
		}
		50% {
			box-shadow: 0 0 0 0.7rem transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.checking-mark {
			animation: none;
		}

		.checking-track span {
			transition: none;
		}
	}

	@media (max-width: 820px) {
		.paper-workspace {
			display: block;
		}

		.paper-rail {
			position: sticky;
			top: var(--qc-topbar-height, 4rem);
			z-index: 4;
			grid-template-columns: minmax(0, 1fr) auto;
			min-height: 0;
			padding: 0.65rem 0.8rem;
			border-right: 0;
			border-bottom: 1px solid var(--qc-ui-border-subtle);
		}

		.paper-rail .paper-back,
		.paper-rail > .qc-real-kicker,
		.paper-rail h1,
		.paper-facts,
		.paper-jump-list,
		.paper-save-note {
			display: none;
		}

		.paper-progress {
			grid-column: 2;
		}

		.paper-progress div {
			font-size: 1rem;
		}

		.paper-main {
			padding-top: 0.8rem;
		}
	}

	@media (max-width: 620px) {
		.duration-options,
		.topic-options {
			grid-template-columns: minmax(0, 1fr);
		}

		.duration-options label {
			min-height: 3.7rem;
		}

		.builder-action-bar,
		.finish-paper-bar {
			align-items: stretch;
			flex-direction: column;
		}

		.builder-action-bar .qc-action-button,
		.finish-paper-bar .qc-action-button,
		.result-actions .qc-action-button {
			width: 100%;
		}

		.paper-builder-hero h1 {
			font-size: clamp(2.4rem, 14vw, 4rem);
		}

		.builder-section {
			padding: 0.85rem;
		}

		.paper-main {
			padding-inline: 0.55rem;
		}

		.paper-question-heading,
		.paper-answer {
			padding-inline: 0.75rem;
		}

		.paper-question :global(.qc-exam-card) {
			padding-inline: 0.75rem;
		}

		.paper-intro,
		.paper-result-summary {
			align-items: flex-start;
			flex-direction: column;
		}

		.paper-result summary {
			padding-inline: 0.7rem;
		}
	}
</style>
