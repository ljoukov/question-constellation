<script lang="ts">
	import { browser } from '$app/environment';
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { authStartHref } from '$lib/authReturn';
	import ChainIllustration from '$lib/chains/ChainIllustration.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import AuthRequiredDialog from '$lib/components/AuthRequiredDialog.svelte';
	import EnglishGuidedPractice from '$lib/components/EnglishGuidedPractice.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import HintPanel from '$lib/components/HintPanel.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import MarkdownContent from '$lib/components/MarkdownContent.svelte';
	import PracticeAnswerEditor from '$lib/components/PracticeAnswerEditor.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault, isEnglishSubject } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { createActivityId, responseDurationMs } from '$lib/learning/activityTiming';
	import { learnerSubjectHref } from '$lib/learning/subjects';
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
		activitySessionId?: string;
		responseStartedAt?: number;
		pendingAttemptId?: string;
		pendingAttemptSignature?: string;
		pendingResponseDurationMs?: number | null;
		hintUsed?: boolean;
		markingPointsUsed?: boolean;
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
	let showMarkingPoints = $state(false);
	let hintUsed = $state(false);
	let markingPointsUsed = $state(false);
	let authDialogOpen = $state(false);
	let checkingRewrite = $state(false);
	let migratedAnonymousState = false;
	let practiceQuestionList: HTMLElement | undefined = $state();
	let resultHeader: HTMLElement | undefined = $state();
	let lastFocusedResultSignature = '';
	let activitySessionId = '';
	let responseStartedAt = 0;
	let pendingAttemptId = '';
	let pendingAttemptSignature = '';
	let pendingResponseDurationMs: number | null = null;
	const markingPointsRevealDurationMs =
		browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;

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
	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const nextQuestionHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.nextQuestion.id })
	);
	const constellationHref = $derived(
		resolve('/constellations/[chainId]', { chainId: data.chain.id })
	);
	const isLastQuestion = $derived(questionIndex === data.questions.length - 1);
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
			{
				title: 'Hint',
				text:
					hintMissingLinks.length > 0
						? `Include: ${hintMissingLinks.join(' → ')}.`
						: weakAnswerExplanation || data.chain.commonMissingLink
			}
		].filter((hint) => Boolean(hint.text))
	);
	const isEnglish = $derived(isEnglishSubject(data.question.meta.subject));
	const topbarSubject = $derived(
		isEnglish
			? englishSubjectOrDefault(data.question.meta.subject)
			: (data.question.meta.subjectArea ?? data.question.meta.subject)
	);
	const subjectHubHref = $derived(learnerSubjectHref(topbarSubject));
	const usesSignedInSubjectBack = $derived(Boolean(data.user && !isEnglish));
	const practiceBackHref = $derived(usesSignedInSubjectBack ? subjectHubHref : questionHref);
	const practiceBackLabel = $derived(
		usesSignedInSubjectBack ? `Back to ${topbarSubject}` : 'Back to question'
	);
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
	const hasCheckedResult = $derived(Boolean(gradeResult && gradedAnswerText === answerText));
	const showCheckedResult = $derived(
		requestedPracticeView === 'result' && (hasCheckedResult || checkingRewrite)
	);
	const currentUserId = $derived(data.user?.uid ?? null);
	const signInHref = $derived(authStartHref(`${page.url.pathname}${page.url.search}`));

	const practiceStoragePrefix = 'question-constellation:science-practice:v1:';
	const pendingGradeStorageKey = 'question-constellation:pending-model-check:v1';
	let lastQueuedDraftSignature = '';

	beforeNavigate(() => {
		if (!currentUserId) return;
		void flushPracticeDraftQueue(currentUserId, { keepalive: true });
	});

	function scrollActiveQuestionIntoView() {
		if (typeof window === 'undefined') return;
		window.requestAnimationFrame(() => {
			if (!window.matchMedia('(max-width: 980px)').matches) return;
			practiceQuestionList
				?.querySelector<HTMLElement>('.active')
				?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
		});
	}

	onMount(() => {
		const cleanup = installPracticeDraftWindowFlush(currentUserId);
		scrollActiveQuestionIntoView();
		if (currentUserId && migratedAnonymousState) {
			persistSciencePracticeState();
			void flushPracticeDraftQueue(currentUserId);
		}
		const pendingFeedbackRewrite = consumePendingScienceGrade();
		if (pendingFeedbackRewrite !== null) {
			checkingRewrite = pendingFeedbackRewrite;
			window.setTimeout(async () => {
				await checkAnswer(pendingFeedbackRewrite);
				checkingRewrite = false;
			}, 0);
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
			hintUsed: draft.payload.hintUsed === true,
			markingPointsUsed: draft.payload.markingPointsUsed === true,
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
		const draftState = scienceStateFromDraft(savedDraftCandidate(questionId));
		const candidates = [storedState, anonymousState, draftState].filter(
			(candidate): candidate is StoredPracticeState => Boolean(candidate)
		);
		const newest = candidates.sort(
			(left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
		)[0];
		migratedAnonymousState = Boolean(currentUserId && anonymousState && newest === anonymousState);
		return newest ?? null;
	}

	function scienceDraftPayload(overrides: Partial<StoredPracticeState> = {}) {
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

	function openAuthDialog() {
		persistSciencePracticeState();
		authDialogOpen = true;
	}

	function currentAssistance(feedbackRewrite = false) {
		return {
			hintOpened: hintUsed,
			markingPointsViewed: markingPointsUsed,
			feedbackRewrite
		};
	}

	function toggleMarkingPoints() {
		showMarkingPoints = !showMarkingPoints;
		if (showMarkingPoints) markingPointsUsed = true;
		persistSciencePracticeState();
	}

	function ensurePendingAttempt(feedbackRewrite = false) {
		if (!activitySessionId) activitySessionId = createActivityId('science-session');
		if (!responseStartedAt) responseStartedAt = Date.now();
		const assistance = currentAssistance(feedbackRewrite);
		const signature = JSON.stringify({ answer: answerText, assistance });
		if (!pendingAttemptId || pendingAttemptSignature !== signature) {
			pendingAttemptId = createActivityId('attempt');
			pendingAttemptSignature = signature;
			pendingResponseDurationMs = responseDurationMs(responseStartedAt);
			persistSciencePracticeState();
		}
		return {
			attemptId: pendingAttemptId,
			sourceSessionId: activitySessionId,
			responseDurationMs: pendingResponseDurationMs,
			assistance
		};
	}

	function prepareScienceAuthRedirect() {
		if (typeof window === 'undefined') return;
		const pendingAttempt = ensurePendingAttempt(
			requestedPracticeView === 'result' || checkingRewrite
		);
		persistSciencePracticeState();
		window.sessionStorage.setItem(
			pendingGradeStorageKey,
			JSON.stringify({
				kind: 'science',
				questionId: data.question.id,
				answer: answerText,
				...pendingAttempt,
				createdAt: Date.now()
			})
		);
	}

	function consumePendingScienceGrade(): boolean | null {
		if (!currentUserId || typeof window === 'undefined') return null;
		try {
			const raw = window.sessionStorage.getItem(pendingGradeStorageKey);
			if (!raw) return null;
			const pending = JSON.parse(raw) as {
				kind?: string;
				questionId?: string;
				answer?: string;
				attemptId?: string;
				sourceSessionId?: string;
				responseDurationMs?: number | null;
				assistance?: ReturnType<typeof currentAssistance>;
				createdAt?: number;
			};
			const matches =
				pending.kind === 'science' &&
				pending.questionId === data.question.id &&
				pending.answer === answerText &&
				Date.now() - Number(pending.createdAt ?? 0) < 30 * 60 * 1000;
			window.sessionStorage.removeItem(pendingGradeStorageKey);
			if (matches) {
				hintUsed = pending.assistance?.hintOpened ?? hintUsed;
				markingPointsUsed = pending.assistance?.markingPointsViewed ?? markingPointsUsed;
				pendingAttemptId = pending.attemptId ?? '';
				activitySessionId = pending.sourceSessionId || activitySessionId;
				pendingResponseDurationMs = pending.responseDurationMs ?? null;
				pendingAttemptSignature = JSON.stringify({
					answer: pending.answer,
					assistance: pending.assistance ?? currentAssistance(false)
				});
			}
			return matches ? (pending.assistance?.feedbackRewrite ?? false) : null;
		} catch {
			window.sessionStorage.removeItem(pendingGradeStorageKey);
			return null;
		}
	}

	function applySciencePracticeState(storedState: StoredPracticeState | null) {
		answerText = storedState?.answerText ?? '';
		rewriteText = storedState?.rewriteText ?? '';
		gradedAnswerText = storedState?.gradedAnswerText ?? '';
		gradeResult = storedState?.gradeResult ?? null;
		gradePhase = gradeResult ? 'done' : 'idle';
		gradeFailure = null;
		showHint = false;
		showMarkingPoints = false;
		hintUsed = storedState?.hintUsed ?? false;
		markingPointsUsed = storedState?.markingPointsUsed ?? false;
		activitySessionId = storedState?.activitySessionId || createActivityId('science-session');
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
			: scienceDraftSignature({
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
		gradeFailure = null;
		gradePhase = 'idle';
		rewriteText = '';
		if (requestedPracticeView === 'result') updatePracticeView('attempt', 'replace');
	}

	function setAnswerText(value: string) {
		markSciencePracticeTouched();
		const invalidatesResult = gradedAnswerText.length > 0 && value !== gradedAnswerText;
		if (pendingAttemptId && value !== answerText) {
			pendingAttemptId = '';
			pendingAttemptSignature = '';
			pendingResponseDurationMs = null;
			responseStartedAt = Date.now();
		}
		answerText = value;
		if (invalidatesResult) clearCheckedResult();
		persistSciencePracticeState(invalidatesResult ? { view: 'attempt' } : {});
	}

	function setRewriteText(value: string) {
		markSciencePracticeTouched();
		rewriteText = value;
		persistSciencePracticeState();
	}

	async function checkRewrite() {
		const rewrittenAnswer = rewriteText.trim();
		if (!rewrittenAnswer || isChecking) return;
		answerText = rewrittenAnswer;
		pendingAttemptId = '';
		pendingAttemptSignature = '';
		pendingResponseDurationMs = null;
		responseStartedAt = Date.now();
		gradedAnswerText = '';
		checkingRewrite = true;
		persistSciencePracticeState({ answerText: rewrittenAnswer, view: 'result' });
		await checkAnswer(true);
		checkingRewrite = false;
	}

	async function checkAnswer(preserveVisibleResult = false) {
		if (!canCheck) return;
		markSciencePracticeTouched();
		if (!data.user) {
			openAuthDialog();
			return;
		}

		if (!preserveVisibleResult) rewriteText = '';
		gradedAnswerText = '';
		gradeFailure = null;
		if (!preserveVisibleResult) gradeResult = null;
		gradePhase = 'connecting';
		let streamStarted = false;
		const pendingAttempt = ensurePendingAttempt(preserveVisibleResult || checkingRewrite);

		try {
			const response = await fetchWithResponseTimeout(
				resolve('/api/questions/[questionId]/grade', { questionId: data.question.id }),
				{
					method: 'POST',
					headers: {
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						answer: answerText,
						...pendingAttempt
					})
				}
			);
			if (response.status === 401) {
				gradePhase = 'idle';
				openAuthDialog();
				return;
			}

			if (!response.ok || !response.body) {
				throw await requestErrorFromResponse(response, 'Answer check request failed.');
			}

			streamStarted = true;
			await readSseStream(
				response.body,
				response.headers.get('cf-ray') ?? response.headers.get('x-request-id')
			);

			if (!gradeResult) {
				throw new InterruptedRequestError('The answer check ended without a result.');
			}
		} catch (error) {
			console.error('[practice] answer grading failed', error);
			gradePhase = 'error';
			gradeFailure = classifyRequestFailure(error, {
				action: 'finish checking this answer',
				serverLabel: 'The answer checker',
				streamStarted
			});
			updatePracticeView('attempt', 'replace');
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

	function handleSseMessage(message: SseMessage, reference: string | null) {
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
			const payload = JSON.parse(message.data) as { error?: string; message?: string };
			throw new ServerRequestError(payload.message ?? 'The answer checker returned an error.', {
				code: payload.error,
				reference
			});
		}
	}

	async function readSseStream(body: ReadableStream<Uint8Array>, reference: string | null) {
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
				if (message) handleSseMessage(message, reference);
				separatorIndex = buffer.indexOf('\n\n');
			}

			if (done) break;
		}

		const trailingMessage = parseSseBlock(buffer.trim());
		if (trailingMessage) handleSseMessage(trailingMessage, reference);
	}

	$effect(() => {
		if (data.englishPractice) return;
		if (loadedQuestionId === data.question.id) {
			return;
		}

		loadedQuestionId = data.question.id;
		scrollActiveQuestionIntoView();
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
		if (data.englishPractice || loadedQuestionId !== data.question.id || !showHint || hintUsed)
			return;
		hintUsed = true;
		persistSciencePracticeState();
	});

	$effect(() => {
		if (data.englishPractice) return;
		if (requestedPracticeView === 'result' && !hasCheckedResult && !isChecking) {
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
			: 'Write and check a GCSE answer against the mark-scoring method.'}
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

		<div class="qc-real-layout qc-question-layout" class:singleton={data.questions.length === 1}>
			<aside class="qc-real-rail qc-question-rail" aria-label="Practice route">
				<IconBackLink href={practiceBackHref} label={practiceBackLabel} />
				<p class="qc-real-kicker"><MathText text={data.question.meta.subject} /></p>
				<h1>{data.questions.length > 1 ? 'Practice set' : 'Exam practice'}</h1>
				{#if data.questions.length > 1}
					<div class="qc-practice-progress" aria-label="Practice progress">
						<span>Question {questionNumber} of {data.questions.length}</span>
						<div class="qc-practice-progress-track" aria-hidden="true">
							<span class="qc-practice-progress-fill" style={`width: ${progressPercent}`}></span>
						</div>
					</div>
				{/if}
				{#if data.questions.length > 1}
					<nav
						bind:this={practiceQuestionList}
						class="qc-real-chain-list"
						aria-label="Practice questions"
					>
						{#each data.questions as question, index (question.id)}
							<a
								class:active={question.id === data.question.id}
								aria-current={question.id === data.question.id ? 'page' : undefined}
								href={resolve('/questions/[questionId]/practice', { questionId: question.id })}
							>
								<span>{index + 1}</span>
								<span><MathText text={question.title} /></span>
								<small>{question.distanceLabel}</small>
							</a>
						{/each}
					</nav>
				{/if}
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
							onValueChange={setAnswerText}
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
							<button
								class="qc-action-button"
								type="button"
								aria-expanded={showMarkingPoints}
								aria-controls="practice-marking-points"
								onclick={toggleMarkingPoints}
							>
								{showMarkingPoints ? 'Hide marking points' : 'Use marking points'}
							</button>
						</div>
					</section>

					{#if showMarkingPoints}
						<section
							id="practice-marking-points"
							class="qc-practice-static-checklist"
							transition:slide={{ duration: markingPointsRevealDurationMs }}
						>
							<header>
								<p class="qc-panel-label">Mark your answer</p>
								<p>Compare your answer with each point.</p>
							</header>
							<ol>
								{#each data.question.checklist as item, index (item.id)}
									<li>
										<span>{index + 1}</span>
										<MathText text={shortChecklistText(item.text)} />
									</li>
								{/each}
							</ol>
						</section>
					{/if}

					{#if isChecking}
						<section class="qc-status-panel" aria-live="polite">
							<span class="loading-spinner" aria-hidden="true"></span>
							<div>
								<p class="qc-panel-label">{statusText}</p>
								<p>{statusDescription}</p>
							</div>
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
							{hasMissingLinks
								? resultTitle
								: `${gradeResult?.awardedMarks ?? 0}/${gradeResult?.maxMarks ?? data.question.meta.marks} marks`}
						</h2>
						{#if hasMissingLinks}
							<p>
								<strong>
									{gradeResult?.awardedMarks ?? 0}/{gradeResult?.maxMarks ??
										data.question.meta.marks}
									marks
								</strong>
								Complete the missing links below.
							</p>
						{/if}
					</header>

					{#if hasMissingLinks}
						<details class="qc-practice-detail qc-practice-original-question">
							<summary>
								Original question
								<ChevronDown size={17} aria-hidden="true" />
							</summary>
							<ExamQuestionCard
								question={data.question}
								compact
								showHeader={false}
								showMeta={false}
								showTitle={false}
								assetLoading="eager"
							/>
						</details>
					{/if}

					{#if data.chain.illustration}
						<ChainIllustration
							illustration={data.chain.illustration}
							eager
							showCaption={false}
							expandable
						/>
					{/if}

					<section class="qc-chain-result" aria-label="Checked answer chain">
						<p class="qc-panel-label">Answer chain</p>
						<ol>
							{#each data.question.checklist as item, index (item.id)}
								<li
									class:present={presentStepIds.has(item.stepId)}
									class:missing={missingStepIds.has(item.stepId)}
								>
									<span class="qc-chain-result-index">{index + 1}</span>
									{#if presentStepIds.has(item.stepId)}
										<CheckCircle2 size={18} aria-hidden="true" />
									{:else}
										<CircleAlert size={18} aria-hidden="true" />
									{/if}
									<span>
										<span class="sr-only">
											{presentStepIds.has(item.stepId) ? 'Present: ' : 'Missing: '}
										</span>
										<MathText text={shortChecklistText(item.text)} />
									</span>
									{#if missingStepIds.has(item.stepId) && gapHrefByStepId.get(item.stepId)}
										<a class="qc-inline-gap-link" href={gapHrefByStepId.get(item.stepId)}>
											Practise this step
										</a>
									{/if}
								</li>
							{/each}
						</ol>
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
							<div class="qc-practice-actions">
								<button
									class="qc-action-button primary"
									type="button"
									onclick={checkRewrite}
									disabled={!rewriteText.trim() || isChecking}
								>
									<CheckCircle2 size={18} aria-hidden="true" />
									{isChecking ? 'Checking...' : 'Check rewrite'}
								</button>
							</div>
						{:else}
							<p class="qc-practice-answer-label">Your checked answer</p>
							<p class="qc-checked-answer">{answerText}</p>
						{/if}
					</section>

					{#if !hasMissingLinks}
						<div class="qc-practice-actions qc-check-next-actions" aria-label="Next action">
							<a
								class="qc-action-button primary"
								href={!isLastQuestion
									? nextQuestionHref
									: data.user
										? subjectHubHref
										: constellationHref}
							>
								{isLastQuestion ? 'Finish set' : 'Next question'}
								<ArrowRight size={18} aria-hidden="true" />
							</a>
						</div>
					{/if}

					{#if recallPrompt && hasMissingLinks}
						<section class="qc-quick-recall">
							<div>
								<p class="qc-panel-label">Quick recall</p>
								<p>
									{recallPrompt.cardCount} cards for {recallPrompt.label.replace(/^.*?:\s*/, '')}
								</p>
							</div>
							<a href={recallPrompt.href}>Open flashcards</a>
						</section>
					{/if}

					{#if feedbackMarkdown}
						<details class="qc-practice-detail">
							<summary>
								Detailed feedback
								<ChevronDown size={17} aria-hidden="true" />
							</summary>
							<MarkdownContent markdown={feedbackMarkdown} class="qc-feedback-markdown" />
						</details>
					{/if}

					<details class="qc-practice-detail">
						<summary>
							Full-mark answer
							<ChevronDown size={17} aria-hidden="true" />
						</summary>
						<p><MathText text={data.question.modelAnswer} /></p>
					</details>
				{/if}
			</section>
		</div>
	</main>
{/if}

{#if !data.englishPractice}
	<AuthRequiredDialog
		open={authDialogOpen}
		href={signInHref}
		onDismiss={() => (authDialogOpen = false)}
		onSignIn={prepareScienceAuthRedirect}
	/>
{/if}
