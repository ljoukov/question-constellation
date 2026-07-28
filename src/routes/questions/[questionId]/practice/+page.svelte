<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { ResolvedPathname } from '$app/types';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import HintPanel from '$lib/components/HintPanel.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import PracticeAnswerEditor from '$lib/components/PracticeAnswerEditor.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault, isEnglishSubject } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import {
		addExternalInputSource,
		normalizeExternalInputSources,
		type ExternalInputSource
	} from '$lib/learning/answerAssistance';
	import { createActivityId, responseDurationMs } from '$lib/learning/activityTiming';
	import {
		fixedChoiceAnswerIsCorrect,
		fixedChoiceCorrectAnswers,
		resolvePracticeResultPresentation
	} from '$lib/learning/practiceResult';
	import { practiceStateRestoreMode } from '$lib/learning/practiceStateRestore';
	import { learnerSubjectForQuestion } from '$lib/learning/subjects';
	import { markHomeSnapshotDirty } from '$lib/homeSnapshotClient';
	import { safeInternalReturnPath } from '$lib/navigation/returnPath';
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
	import {
		classifyRequestFailure,
		fetchWithResponseTimeout,
		InterruptedRequestError,
		readStreamChunkWithTimeout,
		requestErrorFromResponse,
		ServerRequestError,
		type RequestFailure
	} from '$lib/requestFailure';
	import { ArrowRight, CheckCircle2, ChevronDown, CircleAlert } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const resolveInternalPath = resolve as (path: string) => ResolvedPathname;

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
		evidence?: {
			independent: boolean;
			externalInputDetected: boolean;
			externalInputSources: ExternalInputSource[];
		};
		savedAttempt?: {
			id: string;
			recallPrompt: { href: string; label: string; cardCount: number } | null;
		} | null;
	};
	type SseMessage = {
		event: string;
		data: string;
	};
	type GradeRequestContext = {
		sequence: number;
		questionId: string;
		answer: string;
		completed: boolean;
	};
	type PracticeRouteView = 'attempt' | 'result';
	type StoredPracticeState = {
		answerText?: string;
		rewriteText?: string;
		gradedAnswerText?: string;
		gradeResult?: GradeResult | null;
		view?: PracticeRouteView;
		activitySessionId?: string;
		responseStartedAt?: number;
		pendingAttemptId?: string;
		pendingAttemptSignature?: string;
		pendingResponseDurationMs?: number | null;
		hintUsed?: boolean;
		markingPointsUsed?: boolean;
		answerExternalInputSources?: ExternalInputSource[];
		rewriteExternalInputSources?: ExternalInputSource[];
		updatedAt?: number;
	};

	let loadedQuestionId = $state('');
	let answerText = $state('');
	let rewriteText = $state('');
	let gradedAnswerText = $state('');
	let gradePhase = $state<GradePhase>('idle');
	let gradeFailure = $state<RequestFailure | null>(null);
	let gradeResult = $state<GradeResult | null>(null);
	let showHint = $state(false);
	let hintUsed = $state(false);
	let markingPointsUsed = $state(false);
	let answerExternalInputSources = $state<ExternalInputSource[]>([]);
	let rewriteExternalInputSources = $state<ExternalInputSource[]>([]);
	let copyAttempt = $state(0);
	let checkingRewrite = $state(false);
	let showDetailedFeedback = $state(true);
	let showFullMarkAnswer = $state(false);
	let migratedAnonymousState = false;
	let resultHeader: HTMLElement | undefined = $state();
	let lastFocusedResultSignature = '';
	let activitySessionId = '';
	let responseStartedAt = 0;
	let pendingAttemptId = '';
	let pendingAttemptSignature = '';
	let pendingResponseDurationMs: number | null = null;
	let gradeRequestSequence = 0;
	let activeGradeController: AbortController | null = null;

	const requestedReturnTo = $derived(safeInternalReturnPath(page.url.searchParams.get('returnTo')));
	const isChoiceResponse = $derived(
		data.question.renderingOverlay?.responseInteraction?.kind === 'choice'
	);
	const choiceAnswerCorrect = $derived(
		fixedChoiceAnswerIsCorrect(
			data.question.renderingOverlay?.responseInteraction,
			gradedAnswerText || answerText
		)
	);
	const choiceCorrectAnswerText = $derived(
		fixedChoiceCorrectAnswers(data.question.renderingOverlay?.responseInteraction).join(' and ')
	);
	const resultPresentation = $derived(
		resolvePracticeResultPresentation({
			gradeResult,
			checklistStepIds: data.markingPoints.map((point) => point.id),
			choiceResponse: isChoiceResponse,
			choiceAnswerCorrect
		})
	);
	const presentStepIds = $derived(resultPresentation.presentStepIds);
	const missingStepIds = $derived(resultPresentation.missingStepIds);
	const includedPointCount = $derived(
		data.markingPoints.filter((point) => presentStepIds.has(point.id)).length
	);
	const resultTitle = $derived(
		`${includedPointCount} of ${data.markingPoints.length} marking ${data.markingPoints.length === 1 ? 'point' : 'points'} included`
	);
	const fullMarksTitle = $derived(
		`All ${data.markingPoints.length} marking ${data.markingPoints.length === 1 ? 'point is' : 'points are'} included`
	);
	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const hasRelatedQuestion = $derived(data.nextQuestionId !== data.question.id);
	const relatedQuestionHref = $derived.by(() => {
		const base = resolve('/questions/[questionId]/practice', {
			questionId: data.nextQuestionId
		});
		const currentResult = `/questions/${encodeURIComponent(data.question.id)}/practice?view=result`;
		const params = new URLSearchParams({
			entry: 'related',
			returnTo: currentResult
		});
		return resolveInternalPath(`${base}?${params.toString()}`);
	});
	const isChecking = $derived(
		gradePhase === 'connecting' ||
			gradePhase === 'calling' ||
			gradePhase === 'thinking' ||
			gradePhase === 'grading'
	);
	const rewriteCheckPending = $derived(checkingRewrite);
	const canCheck = $derived(answerText.trim().length > 0 && !isChecking);
	const statusText = $derived(statusLabelForPhase(gradePhase));
	const feedbackMarkdown = $derived(
		gradeResult?.model === 'deterministic' ? '' : (gradeResult?.feedbackMarkdown ?? '').trim()
	);
	const needsImprovement = $derived(resultPresentation.nextAction === 'improve_answer');
	const choiceNeedsRetry = $derived(resultPresentation.nextAction === 'retry_choice');
	const hintedMarkingPoints = $derived(
		data.question.weakAnswerMissingStepIds
			.map((pointId) => data.markingPoints.find((point) => point.id === pointId)?.label ?? null)
			.filter((label): label is string => Boolean(label))
	);
	const weakAnswerExplanation = $derived(
		data.question.commonWeakExplanation.replace(/\s+/g, ' ').trim()
	);
	const practiceHints = $derived(
		[
			{
				title: 'Hint',
				text:
					hintedMarkingPoints.length > 0
						? `Include: ${hintedMarkingPoints.join('; ')}.`
						: weakAnswerExplanation ||
							data.question.checklist[0]?.text ||
							'Make each marking point explicit in your answer.'
			}
		].filter((hint) => Boolean(hint.text))
	);
	const isEnglish = $derived(isEnglishSubject(data.question.meta.subject));
	const learnerSubject = $derived(
		learnerSubjectForQuestion({
			subject: data.question.meta.subject,
			subjectArea: data.question.meta.subjectArea,
			paper: data.question.meta.paper
		})
	);
	const topbarSubject = $derived(
		isEnglish
			? englishSubjectOrDefault(data.question.meta.subject)
			: (learnerSubject ?? data.question.meta.subjectArea ?? data.question.meta.subject)
	);
	const practiceBackHref = $derived(requestedReturnTo ?? questionHref);
	const practiceBackLabel = $derived(
		requestedReturnTo?.includes('/practice')
			? 'Back to previous result'
			: requestedReturnTo?.startsWith('/questions/')
				? 'Back to question'
				: requestedReturnTo
					? `Back to ${topbarSubject}`
					: 'Back to question'
	);
	const completionHref = $derived(requestedReturnTo ?? questionHref);
	const completionLabel = $derived(
		requestedReturnTo?.includes('/practice')
			? 'Back to previous result'
			: requestedReturnTo?.startsWith('/questions/')
				? 'Back to question'
				: requestedReturnTo
					? `Continue in ${topbarSubject}`
					: 'Back to question'
	);
	const successfulNextHref = $derived(
		hasRelatedQuestion ? relatedQuestionHref : resolveInternalPath(completionHref)
	);
	const successfulNextLabel = $derived(
		hasRelatedQuestion ? 'Try another question' : completionLabel
	);

	function checkedMarkingPointText(point: (typeof data.markingPoints)[number]) {
		const checklistPoint = data.question.checklist.find((item) => item.stepId === point.id);
		return checklistPoint ? shortChecklistText(checklistPoint.text) : point.label || point.short;
	}
	const topbarSubjects = [...BROWSE_SUBJECTS];
	const answerRows = $derived(
		data.question.meta.marks >= 30
			? 14
			: data.question.meta.marks >= 10
				? 10
				: data.question.meta.marks >= 6
					? 6
					: data.question.meta.marks >= 5
						? 5
						: 4
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
	const showCheckedResult = $derived(
		requestedPracticeView === 'result' && Boolean(gradeResult || checkingRewrite)
	);
	const currentUserId = $derived(data.user?.uid ?? null);

	const practiceStoragePrefix = 'question-constellation:question-practice:v2:';
	let lastQueuedDraftSignature = '';

	function invalidateGradeRequest() {
		gradeRequestSequence += 1;
		activeGradeController?.abort('Question changed');
		activeGradeController = null;
		checkingRewrite = false;
	}

	function gradeRequestIsCurrent(request: GradeRequestContext) {
		return (
			request.sequence === gradeRequestSequence &&
			request.questionId === data.question.id &&
			request.answer === answerText
		);
	}

	beforeNavigate(({ to }) => {
		if (to?.url.pathname !== page.url.pathname) invalidateGradeRequest();
		if (!currentUserId) return;
		void flushPracticeDraftQueue(currentUserId, { keepalive: true });
	});

	onMount(() => {
		const cleanup = installPracticeDraftWindowFlush(currentUserId);
		if (currentUserId && migratedAnonymousState) {
			persistQuestionPracticeState();
			void flushPracticeDraftQueue(currentUserId);
		}
		return cleanup;
	});

	function responseFromOverlay(value: Record<string, unknown> | null | undefined) {
		if (!value || value.kind === 'none') return null;
		return value as ExamResponse;
	}

	function practiceStorageKey(questionId: string, identity = currentUserId ?? 'anonymous') {
		return `${practiceStoragePrefix}${identity}:${questionId}`;
	}

	function loadStoredPracticeState(
		questionId: string,
		identity = currentUserId ?? 'anonymous'
	): StoredPracticeState | null {
		if (typeof window === 'undefined') return null;
		try {
			const raw = window.sessionStorage.getItem(practiceStorageKey(questionId, identity));
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
					activitySessionId,
					responseStartedAt,
					pendingAttemptId,
					pendingAttemptSignature,
					pendingResponseDurationMs,
					hintUsed,
					markingPointsUsed,
					answerExternalInputSources,
					rewriteExternalInputSources,
					...overrides,
					updatedAt: Date.now()
				} satisfies StoredPracticeState)
			);
		} catch {
			// Session storage is a convenience for browser history, not required for practice.
		}
	}

	function questionStateFromDraft(draft: PracticeDraftSave | SavedPracticeDraft | null) {
		if (!draft || draft.draftKind !== 'question-practice' || !isRecord(draft.payload)) return null;
		const gradeResultPayload = recordFromRecord(draft.payload, 'gradeResult');
		const view = stringFromRecord(draft.payload, 'view');
		return {
			answerText: stringFromRecord(draft.payload, 'answerText'),
			rewriteText: stringFromRecord(draft.payload, 'rewriteText'),
			gradedAnswerText: stringFromRecord(draft.payload, 'gradedAnswerText'),
			gradeResult: gradeResultPayload ? (gradeResultPayload as GradeResult) : null,
			view: view === 'result' ? 'result' : 'attempt',
			hintUsed: draft.payload.hintUsed === true,
			markingPointsUsed: draft.payload.markingPointsUsed === true,
			answerExternalInputSources: normalizeExternalInputSources(
				draft.payload.answerExternalInputSources
			),
			rewriteExternalInputSources: normalizeExternalInputSources(
				draft.payload.rewriteExternalInputSources
			),
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
		const anonymousState = currentUserId ? loadStoredPracticeState(questionId, 'anonymous') : null;
		const draftState = questionStateFromDraft(savedDraftCandidate(questionId));
		const candidates = [storedState, anonymousState, draftState].filter(
			(candidate): candidate is StoredPracticeState => Boolean(candidate)
		);
		const newest = candidates.sort(
			(left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
		)[0];
		migratedAnonymousState = Boolean(currentUserId && anonymousState && newest === anonymousState);
		return newest ?? null;
	}

	function questionDraftPayload(overrides: Partial<StoredPracticeState> = {}) {
		return {
			answerText,
			rewriteText,
			gradedAnswerText,
			gradeResult,
			view: requestedPracticeView,
			activitySessionId,
			responseStartedAt,
			pendingAttemptId,
			pendingAttemptSignature,
			pendingResponseDurationMs,
			hintUsed,
			markingPointsUsed,
			answerExternalInputSources,
			rewriteExternalInputSources,
			...overrides
		} satisfies Record<string, unknown>;
	}

	function questionDraftSignature(overrides: Partial<StoredPracticeState> = {}) {
		return JSON.stringify(questionDraftPayload(overrides));
	}

	function questionDraft(
		questionId: string,
		overrides: Partial<StoredPracticeState> = {}
	): PracticeDraftSave {
		return {
			questionId,
			draftKind: 'question-practice',
			answerText: overrides.answerText ?? answerText,
			payload: questionDraftPayload(overrides),
			clientUpdatedAt: Date.now()
		};
	}

	function markQuestionPracticeTouched() {
		if (loadedQuestionId === data.question.id) return;
		loadedQuestionId = data.question.id;
		lastQueuedDraftSignature = '';
	}

	function persistQuestionPracticeState(overrides: Partial<StoredPracticeState> = {}) {
		if (loadedQuestionId && loadedQuestionId !== data.question.id) return;
		saveStoredPracticeState(data.question.id, overrides);
		const signature = questionDraftSignature(overrides);
		if (!currentUserId || signature === lastQueuedDraftSignature) return;
		lastQueuedDraftSignature = signature;
		queuePracticeDraft(currentUserId, questionDraft(data.question.id, overrides));
	}

	function currentAssistance(feedbackRewrite = false) {
		const externalInputSources = feedbackRewrite
			? rewriteExternalInputSources
			: answerExternalInputSources;
		return {
			hintOpened: hintUsed,
			markingPointsViewed: markingPointsUsed,
			feedbackRewrite,
			externalInputDetected: externalInputSources.length > 0,
			externalInputSources
		};
	}

	function markAnswerExternalInput(source: ExternalInputSource, feedbackRewrite = false) {
		if (feedbackRewrite) {
			rewriteExternalInputSources = addExternalInputSource(rewriteExternalInputSources, source);
		} else {
			answerExternalInputSources = addExternalInputSource(answerExternalInputSources, source);
		}
		pendingAttemptId = '';
		pendingAttemptSignature = '';
		pendingResponseDurationMs = null;
		persistQuestionPracticeState();
	}

	function blockCopy(event: ClipboardEvent) {
		event.preventDefault();
		copyAttempt += 1;
	}

	function ensurePendingAttempt(feedbackRewrite = false) {
		if (!activitySessionId) activitySessionId = createActivityId('question-session');
		if (!responseStartedAt) responseStartedAt = Date.now();
		const assistance = currentAssistance(feedbackRewrite);
		const signature = JSON.stringify({ answer: answerText, assistance });
		if (!pendingAttemptId || pendingAttemptSignature !== signature) {
			pendingAttemptId = createActivityId('attempt');
			pendingAttemptSignature = signature;
			pendingResponseDurationMs = responseDurationMs(responseStartedAt);
			persistQuestionPracticeState();
		}
		return {
			attemptId: pendingAttemptId,
			sourceSessionId: activitySessionId,
			responseDurationMs: pendingResponseDurationMs,
			assistance
		};
	}

	function applyQuestionPracticeState(storedState: StoredPracticeState | null) {
		answerText = storedState?.answerText ?? '';
		rewriteText = storedState?.rewriteText ?? '';
		gradedAnswerText = storedState?.gradedAnswerText ?? '';
		gradeResult = storedState?.gradeResult ?? null;
		gradePhase = gradeResult ? 'done' : 'idle';
		gradeFailure = null;
		showDetailedFeedback = true;
		showFullMarkAnswer = false;
		showHint = false;
		hintUsed = storedState?.hintUsed ?? false;
		markingPointsUsed = storedState?.markingPointsUsed ?? false;
		answerExternalInputSources = normalizeExternalInputSources(
			storedState?.answerExternalInputSources
		);
		rewriteExternalInputSources = normalizeExternalInputSources(
			storedState?.rewriteExternalInputSources
		);
		activitySessionId = storedState?.activitySessionId || createActivityId('question-session');
		responseStartedAt =
			storedState?.responseStartedAt &&
			responseDurationMs(storedState.responseStartedAt, Date.now()) !== null
				? storedState.responseStartedAt
				: Date.now();
		pendingAttemptId = storedState?.pendingAttemptId ?? '';
		pendingAttemptSignature = storedState?.pendingAttemptSignature ?? '';
		pendingResponseDurationMs = storedState?.pendingResponseDurationMs ?? null;
		lastQueuedDraftSignature = migratedAnonymousState
			? ''
			: questionDraftSignature({
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

		const nextUrl = resolveInternalPath(
			`/questions/${encodeURIComponent(data.question.id)}/practice${url.search}${url.hash}`
		);
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
		gradeFailure = null;
		gradePhase = 'idle';
		rewriteText = '';
		rewriteExternalInputSources = [];
		if (requestedPracticeView === 'result') updatePracticeView('attempt', 'replace');
	}

	function restartQuestion() {
		invalidateGradeRequest();
		answerText = '';
		rewriteText = '';
		gradedAnswerText = '';
		gradeResult = null;
		gradeFailure = null;
		gradePhase = 'idle';
		showDetailedFeedback = true;
		showFullMarkAnswer = false;
		showHint = false;
		hintUsed = false;
		markingPointsUsed = false;
		answerExternalInputSources = [];
		rewriteExternalInputSources = [];
		checkingRewrite = false;
		activitySessionId = createActivityId('question-session');
		responseStartedAt = Date.now();
		pendingAttemptId = '';
		pendingAttemptSignature = '';
		pendingResponseDurationMs = null;
		updatePracticeView('attempt', 'replace');
		persistQuestionPracticeState({
			answerText: '',
			rewriteText: '',
			gradedAnswerText: '',
			gradeResult: null,
			view: 'attempt',
			hintUsed: false,
			markingPointsUsed: false,
			answerExternalInputSources: [],
			rewriteExternalInputSources: []
		});
	}

	function setAnswerText(value: string) {
		markQuestionPracticeTouched();
		if (isChecking && value !== answerText) {
			invalidateGradeRequest();
			gradePhase = 'idle';
		}
		const invalidatesResult = gradedAnswerText.length > 0 && value !== gradedAnswerText;
		if (pendingAttemptId && value !== answerText) {
			pendingAttemptId = '';
			pendingAttemptSignature = '';
			pendingResponseDurationMs = null;
			responseStartedAt = Date.now();
		}
		answerText = value;
		if (invalidatesResult) clearCheckedResult();
		persistQuestionPracticeState(invalidatesResult ? { view: 'attempt' } : {});
	}

	function setRewriteText(value: string) {
		markQuestionPracticeTouched();
		if (isChecking && value !== rewriteText) {
			invalidateGradeRequest();
			if (gradeResult && gradedAnswerText) answerText = gradedAnswerText;
			gradePhase = gradeResult ? 'done' : 'idle';
		}
		rewriteText = value;
		persistQuestionPracticeState();
	}

	async function checkRewrite() {
		const rewrittenAnswer = rewriteText.trim();
		if (!rewrittenAnswer || isChecking || checkingRewrite) return;
		answerText = rewrittenAnswer;
		answerExternalInputSources = [...rewriteExternalInputSources];
		pendingAttemptId = '';
		pendingAttemptSignature = '';
		pendingResponseDurationMs = null;
		responseStartedAt = Date.now();
		checkingRewrite = true;
		persistQuestionPracticeState({ answerText: rewrittenAnswer, view: 'result' });
		await checkAnswer(true);
	}

	async function checkAnswer(preserveVisibleResult = false) {
		if (!canCheck) {
			if (preserveVisibleResult) checkingRewrite = false;
			return;
		}
		markQuestionPracticeTouched();

		if (!preserveVisibleResult) rewriteText = '';
		if (!preserveVisibleResult) gradedAnswerText = '';
		gradeFailure = null;
		if (!preserveVisibleResult) gradeResult = null;
		gradePhase = 'connecting';
		let streamStarted = false;
		activeGradeController?.abort('Superseded by a new answer check');
		const controller = new AbortController();
		activeGradeController = controller;
		const request: GradeRequestContext = {
			sequence: ++gradeRequestSequence,
			questionId: data.question.id,
			answer: answerText,
			completed: false
		};
		const pendingAttempt = ensurePendingAttempt(preserveVisibleResult || checkingRewrite);

		try {
			const response = await fetchWithResponseTimeout(
				resolve('/api/questions/[questionId]/grade', { questionId: request.questionId }),
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						answer: request.answer,
						...pendingAttempt
					}),
					signal: controller.signal
				}
			);
			if (!gradeRequestIsCurrent(request)) return;

			if (!response.ok || !response.body) {
				throw await requestErrorFromResponse(response, 'Answer check request failed.');
			}

			streamStarted = true;
			await readSseStream(
				response.body,
				response.headers.get('cf-ray') ?? response.headers.get('x-request-id'),
				request
			);

			if (!gradeRequestIsCurrent(request)) return;
			if (!request.completed) {
				throw new InterruptedRequestError('The answer check ended without a result.');
			}
		} catch (error) {
			if (!gradeRequestIsCurrent(request) || controller.signal.aborted) return;
			console.error('[practice] answer grading failed', error);
			gradePhase = 'error';
			gradeFailure = classifyRequestFailure(error, {
				action: 'finish checking this answer',
				serverLabel: 'The answer checker',
				streamStarted
			});
			if (preserveVisibleResult && gradeResult && gradedAnswerText) {
				answerText = gradedAnswerText;
			}
			updatePracticeView('attempt', 'replace');
		} finally {
			if (activeGradeController === controller) {
				activeGradeController = null;
				if (preserveVisibleResult) checkingRewrite = false;
			}
		}
	}

	function shortChecklistText(text: string) {
		const cleaned = text
			.replace(/^Say that /, '')
			.replace(/^Say /, '')
			.replace(/^Mention /, '')
			.replace(/^Explain that /, '')
			.replace(/\.$/, '');
		return cleaned ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : cleaned;
	}

	function statusLabelForPhase(phase: GradePhase) {
		if (phase === 'connecting') return 'Starting check';
		if (phase === 'calling') return 'Finding marking points';
		if (phase === 'thinking') return 'Comparing with marking guidance';
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

	function handleSseMessage(
		message: SseMessage,
		reference: string | null,
		request: GradeRequestContext
	) {
		if (message.event === 'done') markHomeSnapshotDirty();
		if (!gradeRequestIsCurrent(request)) return;
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
			request.completed = true;
			showDetailedFeedback = true;
			showFullMarkAnswer = false;
			rewriteText = request.answer;
			rewriteExternalInputSources = [...answerExternalInputSources];
			gradedAnswerText = request.answer;
			gradePhase = 'done';
			updatePracticeView('result');
			persistQuestionPracticeState({ view: 'result' });
			return;
		}

		if (message.event === 'error') {
			const payload = JSON.parse(message.data) as { error?: string; message?: string };
			throw new ServerRequestError(payload.message ?? 'The answer checker returned an error.', {
				code: payload.error,
				reference
			});
		}
	}

	async function readSseStream(
		body: ReadableStream<Uint8Array>,
		reference: string | null,
		request: GradeRequestContext
	) {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		while (true) {
			const { done, value } = await readStreamChunkWithTimeout(reader);
			buffer += decoder.decode(value, { stream: !done });

			let separatorIndex = buffer.indexOf('\n\n');
			while (separatorIndex !== -1) {
				const block = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + 2);
				const message = parseSseBlock(block);
				if (message) handleSseMessage(message, reference, request);
				separatorIndex = buffer.indexOf('\n\n');
			}

			if (done) break;
		}

		const trailingMessage = parseSseBlock(buffer.trim());
		if (trailingMessage) handleSseMessage(trailingMessage, reference, request);
	}

	$effect(() => {
		if (loadedQuestionId === data.question.id) {
			return;
		}

		invalidateGradeRequest();
		loadedQuestionId = data.question.id;
		const storedState = initialPracticeState(data.question.id);
		const restoreMode = practiceStateRestoreMode(storedState, requestedPracticeView);
		if (restoreMode === 'checked_result') {
			applyQuestionPracticeState(storedState);
		} else if (restoreMode === 'fresh_attempt') {
			applyQuestionPracticeState(null);
			if (requestedPracticeView === 'result') updatePracticeView('attempt', 'replace');
		} else {
			applyQuestionPracticeState(storedState);
		}
	});

	$effect(() => {
		if (loadedQuestionId !== data.question.id) return;
		persistQuestionPracticeState();
	});

	$effect(() => {
		if (loadedQuestionId !== data.question.id || !showHint || hintUsed) return;
		hintUsed = true;
		persistQuestionPracticeState();
	});

	$effect(() => {
		if (requestedPracticeView === 'result' && !showCheckedResult && !isChecking) {
			updatePracticeView('attempt', 'replace');
		}
	});

	$effect(() => {
		if (
			!showCheckedResult ||
			!gradeResult ||
			!resultHeader ||
			isChecking ||
			typeof window === 'undefined'
		)
			return;
		const signature = `${data.question.id}:${gradedAnswerText}:${gradeResult.awardedMarks}`;
		if (signature === lastFocusedResultSignature) return;
		lastFocusedResultSignature = signature;
		window.requestAnimationFrame(() => {
			resultHeader?.focus({ preventScroll: true });
			resultHeader?.scrollIntoView({ block: 'start', behavior: 'auto' });
		});
	});
</script>

<svelte:head>
	<title>{data.question.title} practice | Question Constellation</title>
	<meta
		name="description"
		content={isEnglish
			? 'Write and check a GCSE English answer against the mark focus.'
			: 'Write and check a GCSE answer against clear marking points.'}
	/>
</svelte:head>

<main
	class="qc-real-app qc-practice-page qc-test-taking-view"
	oncopy={blockCopy}
	oncut={(event) => event.preventDefault()}
>
	<AppTopbar
		user={data.user}
		subject={topbarSubject}
		subjects={topbarSubjects}
		searchPlaceholder="Search questions"
	/>

	<div class="qc-real-layout qc-question-layout singleton">
		<aside class="qc-context-rail qc-real-rail qc-question-rail" aria-label="Practice route">
			<IconBackLink href={practiceBackHref} label={practiceBackLabel} />
			<p class="qc-real-kicker"><MathText text={topbarSubject} /></p>
			<h1>Exam practice</h1>
		</aside>

		<section class="qc-real-main qc-practice-main" aria-label="Practice workspace">
			{#if !showCheckedResult}
				<ExamQuestionCard question={data.question} showTitle={false} assetLoading="eager" />

				<HintPanel hints={practiceHints} bind:open={showHint} />

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
						{copyAttempt}
						onValueChange={setAnswerText}
						onExternalInput={(source) => markAnswerExternalInput(source)}
					/>
					<div class="qc-practice-actions" aria-label="Answer actions">
						<button
							class="qc-action-button primary"
							type="button"
							onclick={() => void checkAnswer()}
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
						<p class="qc-panel-label">{statusText}</p>
					</section>
				{/if}

				{#if gradeFailure}
					<RequestFailureNotice
						failure={gradeFailure}
						onRetry={() => void checkAnswer()}
						retryLabel="Retry check"
					/>
				{/if}
			{:else}
				<header
					bind:this={resultHeader}
					class="qc-practice-result-header"
					tabindex="-1"
					aria-live="polite"
				>
					<p class="qc-real-kicker"><MathText text={data.question.sourceRef} /></p>
					<h2>
						{rewriteCheckPending
							? 'Checking your improved answer'
							: choiceNeedsRetry
								? 'Not quite'
								: needsImprovement
									? resultTitle
									: isChoiceResponse
										? `${gradeResult?.awardedMarks ?? 0}/${gradeResult?.maxMarks ?? data.question.meta.marks} marks`
										: fullMarksTitle}
					</h2>
					{#if !rewriteCheckPending && needsImprovement}
						<p class="qc-practice-result-meta">
							<strong>
								{gradeResult?.awardedMarks ?? 0}/{gradeResult?.maxMarks ?? data.question.meta.marks}
								marks
							</strong>
							Use the missing marking points below to improve it.
						</p>
					{:else if !rewriteCheckPending && !choiceNeedsRetry && !isChoiceResponse}
						<p class="qc-practice-result-meta">
							<strong>
								{gradeResult?.awardedMarks ?? 0}/{gradeResult?.maxMarks ?? data.question.meta.marks}
								marks
							</strong>
							You are ready for another question.
						</p>
					{/if}
					{#if !rewriteCheckPending && gradeResult?.evidence?.externalInputDetected}
						<p class="qc-assisted-evidence-note">
							Paste and drop are blocked here. Type the answer yourself; this attempted input is not
							counted as independent evidence.
						</p>
					{/if}
				</header>

				<section class="qc-practice-original-question" aria-labelledby="original-question-title">
					<header>
						<p id="original-question-title" class="qc-panel-label">Original question</p>
					</header>
					<ExamQuestionCard
						question={data.question}
						compact
						showHeader={false}
						showMeta={false}
						showTitle={false}
						assetLoading="eager"
					/>
				</section>

				{#if resultPresentation.showStepDiagnostics || rewriteCheckPending}
					<section
						class="qc-marking-result"
						aria-label={rewriteCheckPending
							? 'Marking-point update in progress'
							: 'Checked marking points'}
						aria-busy={rewriteCheckPending}
					>
						<header class="qc-marking-result-heading">
							<div>
								<p class="qc-panel-label">Marking points</p>
								<p>These are the ideas the examiner can credit in this answer.</p>
							</div>
							{#if !rewriteCheckPending}
								<span>{includedPointCount}/{data.markingPoints.length} included</span>
							{/if}
						</header>
						<ol>
							{#each data.markingPoints as point, index (point.id)}
								<li
									class:present={!rewriteCheckPending && presentStepIds.has(point.id)}
									class:missing={!rewriteCheckPending && missingStepIds.has(point.id)}
								>
									<span class="qc-marking-result-index">{index + 1}</span>
									{#if rewriteCheckPending}
										<span class="loading-spinner qc-marking-result-spinner" aria-hidden="true"
										></span>
									{:else if presentStepIds.has(point.id)}
										<CheckCircle2 size={18} aria-hidden="true" />
									{:else}
										<CircleAlert size={18} aria-hidden="true" />
									{/if}
									<span>
										<span class="sr-only">
											{rewriteCheckPending
												? 'Marking point: '
												: presentStepIds.has(point.id)
													? 'Included: '
													: 'Missing: '}
										</span>
										<MathText text={checkedMarkingPointText(point)} />
									</span>
									<span class="qc-marking-result-status">
										{rewriteCheckPending
											? 'Checking'
											: presentStepIds.has(point.id)
												? 'Included'
												: 'Missing'}
									</span>
								</li>
							{/each}
						</ol>
					</section>
				{/if}

				<section class="qc-practice-answer-card" class:qc-practice-improve-card={needsImprovement}>
					{#if needsImprovement}
						<header class="qc-practice-improve-copy">
							<p class="qc-panel-label">Improve your answer</p>
							<p>Keep what was right, then add the missing marking points.</p>
						</header>
						<PracticeAnswerEditor
							id="rewrite"
							label="Your improved answer"
							response={structuredResponse}
							assets={responseAssets}
							value={rewriteText}
							rows={answerRows}
							extended={data.question.meta.marks >= 20}
							placeholder="Improve your answer using the marking feedback..."
							{copyAttempt}
							onValueChange={setRewriteText}
							onExternalInput={(source) => markAnswerExternalInput(source, true)}
						/>
						<div class="qc-practice-actions">
							<button
								class="qc-action-button primary"
								class:qc-rewrite-checking={rewriteCheckPending}
								type="button"
								onclick={checkRewrite}
								disabled={!rewriteText.trim() || isChecking || rewriteCheckPending}
								aria-busy={rewriteCheckPending}
							>
								{#if rewriteCheckPending}
									<span class="loading-spinner button-spinner" aria-hidden="true"></span>
								{:else}
									<CheckCircle2 size={18} aria-hidden="true" />
								{/if}
								{rewriteCheckPending ? 'Checking...' : 'Check improved answer'}
							</button>
						</div>
					{:else}
						<p class="qc-practice-answer-label">Your checked answer</p>
						<p class="qc-checked-answer">{answerText}</p>
					{/if}
				</section>

				{#if choiceNeedsRetry}
					<div class="qc-practice-actions qc-check-next-actions" aria-label="Retry answer">
						<button class="qc-action-button primary" type="button" onclick={restartQuestion}>
							Try again
						</button>
					</div>
				{:else if !needsImprovement}
					<div class="qc-practice-actions qc-check-next-actions" aria-label="Next action">
						<a class="qc-action-button primary" href={successfulNextHref}>
							{successfulNextLabel}
							<ArrowRight size={18} aria-hidden="true" />
						</a>
						<button class="qc-action-button" type="button" onclick={restartQuestion}>
							Try again
						</button>
					</div>
				{/if}

				{#if rewriteCheckPending}
					<section
						class="qc-practice-feedback-pending"
						aria-label="Detailed feedback"
						aria-live="polite"
						aria-busy="true"
					>
						<div class="qc-practice-feedback-status">
							<span>Detailed feedback</span>
							<span class="qc-working-ellipsis" aria-hidden="true">
								<span>.</span><span>.</span><span>.</span>
							</span>
							<span class="sr-only">Working</span>
						</div>
					</section>
				{:else if feedbackMarkdown}
					<section class="qc-practice-reveal qc-practice-feedback-reveal">
						<header class="qc-practice-reveal-header">
							<div>
								<p class="qc-panel-label">Detailed feedback</p>
								<p>Specific guidance based on the answer you submitted.</p>
							</div>
							<button
								class="qc-practice-reveal-button"
								type="button"
								onclick={() => (showDetailedFeedback = !showDetailedFeedback)}
								aria-expanded={showDetailedFeedback}
								aria-controls="practice-detailed-feedback"
							>
								{showDetailedFeedback ? 'Hide feedback' : 'Show detailed feedback'}
								<ChevronDown
									size={17}
									aria-hidden="true"
									class={showDetailedFeedback ? 'expanded' : undefined}
								/>
							</button>
						</header>
						{#if showDetailedFeedback}
							<div
								id="practice-detailed-feedback"
								class="qc-practice-reveal-content"
								transition:slide={{ duration: 220 }}
							>
								<MarkdownContent markdown={feedbackMarkdown} class="qc-feedback-markdown" />
							</div>
						{/if}
					</section>
				{/if}

				{#if !isChoiceResponse && data.question.modelAnswer}
					<section class="qc-practice-reveal qc-practice-full-mark-reveal">
						<header class="qc-practice-reveal-header">
							<div>
								<p class="qc-panel-label">Full-mark answer</p>
								<p>Compare your response with one complete answer.</p>
							</div>
							<button
								class="qc-practice-reveal-button primary"
								type="button"
								onclick={() => (showFullMarkAnswer = !showFullMarkAnswer)}
								aria-expanded={showFullMarkAnswer}
								aria-controls="practice-full-mark-answer"
							>
								{showFullMarkAnswer ? 'Hide full-mark answer' : 'Show full-mark answer'}
								<ChevronDown
									size={17}
									aria-hidden="true"
									class={showFullMarkAnswer ? 'expanded' : undefined}
								/>
							</button>
						</header>
						{#if showFullMarkAnswer}
							<div
								id="practice-full-mark-answer"
								class="qc-practice-reveal-content qc-practice-model-answer"
								transition:slide={{ duration: 220 }}
							>
								<p><MathText text={data.question.modelAnswer} /></p>
							</div>
						{/if}
					</section>
				{:else if isChoiceResponse && choiceNeedsRetry && (choiceCorrectAnswerText || data.question.modelAnswer)}
					<section class="qc-practice-reveal qc-practice-full-mark-reveal">
						<header class="qc-practice-reveal-header">
							<div>
								<p class="qc-panel-label">Correct answer</p>
								<p>Reveal the correct response when you are ready to compare.</p>
							</div>
							<button
								class="qc-practice-reveal-button primary"
								type="button"
								onclick={() => (showFullMarkAnswer = !showFullMarkAnswer)}
								aria-expanded={showFullMarkAnswer}
								aria-controls="practice-correct-answer"
							>
								{showFullMarkAnswer ? 'Hide correct answer' : 'Show correct answer'}
								<ChevronDown
									size={17}
									aria-hidden="true"
									class={showFullMarkAnswer ? 'expanded' : undefined}
								/>
							</button>
						</header>
						{#if showFullMarkAnswer}
							<div
								id="practice-correct-answer"
								class="qc-practice-reveal-content qc-practice-model-answer"
								transition:slide={{ duration: 220 }}
							>
								<p>
									<MathText text={choiceCorrectAnswerText || data.question.modelAnswer} />
								</p>
							</div>
						{/if}
					</section>
				{/if}
			{/if}
		</section>
	</div>
</main>
