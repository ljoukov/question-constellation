<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { authStartHref } from '$lib/authReturn';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import AuthRequiredDialog from '$lib/components/AuthRequiredDialog.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import HintPanel from '$lib/components/HintPanel.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault } from '$lib/englishSubjects';
	import { withEnglishPracticeContext } from '$lib/englishPracticeNavigation';
	import { shouldShowEnglishSourcePaper } from '$lib/englishSourceAvailability';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import ResponseRenderer from '$lib/experiments/questions/components/ResponseRenderer.svelte';
	import type { ExamResponse } from '$lib/experiments/questions/types';
	import { createActivityId, responseDurationMs } from '$lib/learning/activityTiming';
	import { learnerSubjectHref } from '$lib/learning/subjects';
	import { markLabel } from '$lib/marks';
	import { safeInternalReturnPath } from '$lib/navigation/returnPath';
	import {
		flushPracticeDraftQueue,
		installPracticeDraftWindowFlush,
		latestPracticeDraft,
		queuePracticeDraft,
		queuedPracticeDraftForQuestion
	} from '$lib/practiceDraftSync';
	import {
		isRecord,
		numberFromRecord,
		recordFromRecord,
		type PracticeDraftSave,
		type SavedPracticeDraft
	} from '$lib/practiceDrafts';
	import type { AdminUser } from '$lib/server/auth/session';
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
		Check,
		CheckCircle2,
		ChevronRight,
		Circle,
		ClipboardCheck,
		ExternalLink,
		LockKeyhole,
		RotateCcw
	} from '@lucide/svelte';
	import { onDestroy, onMount, tick } from 'svelte';

	type GradePhase = 'idle' | 'connecting' | 'calling' | 'thinking' | 'grading' | 'done' | 'error';
	type EnglishStepGradeResult = {
		status: 'ok';
		decision: 'pass' | 'revise';
		stepId: string;
		stepTitle: string;
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
		activitySessionId?: string;
		responseStartedAt?: number;
		pendingCheckId?: string;
		pendingCheckSignature?: string;
		pendingResponseDurationMs?: number | null;
		updatedAt?: number;
	};

	type SseMessage = {
		event: string;
		data: string;
	};
	type EnglishGradeRequest = {
		sequence: number;
		questionId: string;
		stageId: string;
		stageTitle: string;
		answer: string;
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
	let stepperElement = $state<HTMLElement | null>(null);
	let hydrated = $state(false);
	let stepAnswers = $state<Record<string, string>>({});
	let stepResults = $state<Record<string, EnglishStepGradeResult>>({});
	let attemptHistory = $state<EnglishLearnerAttempt[]>([]);
	let gradePhase = $state<GradePhase>('idle');
	let gradeFailure = $state<RequestFailure | null>(null);
	let gradeReasoningSummary = $state('');
	let hintOpen = $state(false);
	let feedbackPanel = $state<HTMLElement | null>(null);
	let authDialogOpen = $state(false);
	let hintUsed = $state(false);
	let activitySessionId = $state('');
	let responseStartedAt = $state(0);
	let pendingCheckId = $state('');
	let pendingCheckSignature = $state('');
	let pendingResponseDurationMs = $state<number | null>(null);
	let migratedAnonymousState = false;
	let lastQueuedDraftSignature = '';
	let gradeRequestSequence = 0;
	let activeGradeController: AbortController | null = null;
	const pendingGradeStorageKey = 'question-constellation:pending-model-check:v1';
	const gradingProgressSteps = [
		'Connecting',
		'Loading guidance',
		'Reviewing your response',
		'Preparing feedback'
	];

	const question = $derived(practice.question);
	const topbarSubject = $derived(englishSubjectOrDefault(question.meta.subject));
	const finderHref = $derived(`${resolve('/english')}?course=${encodeURIComponent(topbarSubject)}`);
	const requestedReturnTo = $derived(safeInternalReturnPath(page.url.searchParams.get('returnTo')));
	const signedSubjectHref = $derived(
		topbarSubject === 'English Literature' && question.meta.board === 'OCR'
			? resolve('/english-literature')
			: learnerSubjectHref(topbarSubject)
	);
	const completionHref = $derived(user ? (requestedReturnTo ?? signedSubjectHref) : finderHref);
	const backHref = $derived(user ? (requestedReturnTo ?? signedSubjectHref) : finderHref);
	const backLabel = $derived(
		user && requestedReturnTo?.startsWith('/questions/')
			? 'Back to question'
			: user
				? `Back to ${topbarSubject}`
				: 'Back to question finder'
	);
	const showSourcePaperLink = $derived(
		shouldShowEnglishSourcePaper({
			sourcePaperUrl: practice.sourcePaperUrl,
			signedIn: Boolean(user),
			prompt: question.prompt,
			context: question.context,
			hasAssets: Boolean(question.assets?.length)
		})
	);
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
	const progressStepIndex = $derived(gradePhaseProgressIndex(gradePhase));
	const visibleReasoningSummary = $derived(readableReasoningSummary(gradeReasoningSummary));
	const signInHref = $derived(authStartHref(stepHref(activeStage)));
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
		const path = resolve('/questions/[questionId]/practice/step-by-step/[stepId]', {
			questionId: practice.questionId,
			stepId: stage.id
		});
		return withEnglishPracticeContext(path, page.url.searchParams);
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

	function englishPracticeStorageKey(
		questionId: string,
		version = 'v3',
		identity = userId ?? 'anonymous'
	) {
		return `question-constellation:english-practice:${version}:${identity}:${questionId}`;
	}

	function loadStoredEnglishPracticeState(
		questionId: string,
		identity = userId ?? 'anonymous'
	): StoredEnglishPracticeState | null {
		if (typeof window === 'undefined') return null;
		for (const version of ['v3', 'v2', 'v1']) {
			try {
				const raw = window.sessionStorage.getItem(
					englishPracticeStorageKey(questionId, version, identity)
				);
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
				JSON.stringify({
					stepAnswers,
					stepResults,
					attemptHistory,
					activitySessionId,
					responseStartedAt,
					pendingCheckId,
					pendingCheckSignature,
					pendingResponseDurationMs,
					updatedAt: Date.now()
				})
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
			activitySessionId:
				typeof draft.payload.activitySessionId === 'string'
					? draft.payload.activitySessionId
					: undefined,
			responseStartedAt: numberFromRecord(draft.payload, 'responseStartedAt') ?? undefined,
			pendingCheckId:
				typeof draft.payload.pendingCheckId === 'string' ? draft.payload.pendingCheckId : undefined,
			pendingCheckSignature:
				typeof draft.payload.pendingCheckSignature === 'string'
					? draft.payload.pendingCheckSignature
					: undefined,
			pendingResponseDurationMs: numberFromRecord(draft.payload, 'pendingResponseDurationMs'),
			updatedAt: draft.clientUpdatedAt
		} satisfies StoredEnglishPracticeState;
	}

	function initialEnglishPracticeState(questionId: string) {
		const storedState = loadStoredEnglishPracticeState(questionId);
		const anonymousState = userId ? loadStoredEnglishPracticeState(questionId, 'anonymous') : null;
		const draftState = englishStateFromDraft(
			latestPracticeDraft(savedDraft, queuedPracticeDraftForQuestion(userId, questionId))
		);
		const candidates = [storedState, anonymousState, draftState].filter(
			(candidate): candidate is StoredEnglishPracticeState => Boolean(candidate)
		);
		const newest = candidates.sort(
			(left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
		)[0];
		migratedAnonymousState = Boolean(userId && anonymousState && newest === anonymousState);
		return newest ?? null;
	}

	function draftPayload() {
		return {
			stepAnswers,
			stepResults,
			attemptHistory,
			activitySessionId,
			responseStartedAt,
			pendingCheckId,
			pendingCheckSignature,
			pendingResponseDurationMs
		} satisfies Record<string, unknown>;
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

	function openAuthDialog() {
		persistState();
		authDialogOpen = true;
	}

	function ensurePendingCheck() {
		if (!activeStage) return null;
		if (!activitySessionId) activitySessionId = createActivityId('english-session');
		if (!responseStartedAt) responseStartedAt = Date.now();
		const signature = JSON.stringify({
			stepId: activeStage.id,
			answer: activeAnswer,
			hintUsed
		});
		if (!pendingCheckId || pendingCheckSignature !== signature) {
			pendingCheckId = createActivityId('english-step');
			pendingCheckSignature = signature;
			pendingResponseDurationMs = responseDurationMs(responseStartedAt);
			persistState();
		}
		return {
			checkId: pendingCheckId,
			sourceSessionId: activitySessionId,
			responseDurationMs: pendingResponseDurationMs,
			hintOpened: hintUsed
		};
	}

	function prepareAuthRedirect() {
		if (typeof window === 'undefined' || !activeStage) return;
		const pendingCheck = ensurePendingCheck();
		persistState();
		window.sessionStorage.setItem(
			pendingGradeStorageKey,
			JSON.stringify({
				kind: 'english-step',
				questionId: practice.questionId,
				stepId: activeStage.id,
				answer: activeAnswer,
				...pendingCheck,
				createdAt: Date.now()
			})
		);
	}

	function consumePendingGrade() {
		if (!userId || typeof window === 'undefined' || !activeStage) return false;
		try {
			const raw = window.sessionStorage.getItem(pendingGradeStorageKey);
			if (!raw) return false;
			const pending = JSON.parse(raw) as {
				kind?: string;
				questionId?: string;
				stepId?: string;
				answer?: string;
				checkId?: string;
				sourceSessionId?: string;
				responseDurationMs?: number | null;
				hintOpened?: boolean;
				createdAt?: number;
			};
			const matches =
				pending.kind === 'english-step' &&
				pending.questionId === practice.questionId &&
				pending.stepId === activeStage.id &&
				pending.answer?.trim() === activeAnswer &&
				Date.now() - Number(pending.createdAt ?? 0) < 30 * 60 * 1000;
			window.sessionStorage.removeItem(pendingGradeStorageKey);
			if (matches) {
				hintUsed = pending.hintOpened ?? hintUsed;
				pendingCheckId = pending.checkId ?? '';
				pendingCheckSignature = JSON.stringify({
					stepId: pending.stepId,
					answer: pending.answer?.trim(),
					hintUsed: pending.hintOpened ?? hintUsed
				});
				activitySessionId = pending.sourceSessionId || activitySessionId;
				pendingResponseDurationMs = pending.responseDurationMs ?? null;
			}
			return matches;
		} catch {
			window.sessionStorage.removeItem(pendingGradeStorageKey);
			return false;
		}
	}

	function invalidateFromStage(index: number) {
		const invalidatedIds = practice.stages.slice(index).map((stage) => stage.id);
		stepResults = Object.fromEntries(
			Object.entries(stepResults).filter(([id]) => !invalidatedIds.includes(id))
		);
	}

	function invalidateGradeRequest() {
		gradeRequestSequence += 1;
		activeGradeController?.abort('English practice changed');
		activeGradeController = null;
	}

	function gradeRequestIsCurrent(request: EnglishGradeRequest) {
		return (
			request.sequence === gradeRequestSequence &&
			request.questionId === practice.questionId &&
			request.stageId === activeStage?.id &&
			request.answer === activeAnswer
		);
	}

	function updateActiveAnswer(value: string) {
		if (!activeStage) return;
		if (value !== (stepAnswers[activeStage.id] ?? '')) invalidateGradeRequest();
		stepAnswers = { ...stepAnswers, [activeStage.id]: value };
		invalidateFromStage(activeStageIndex);
		pendingCheckId = '';
		pendingCheckSignature = '';
		pendingResponseDurationMs = null;
		if (!responseStartedAt) responseStartedAt = Date.now();
		gradePhase = 'idle';
		gradeFailure = null;
		gradeReasoningSummary = '';
		persistState();
	}

	function openStage(index: number) {
		if (index < 0 || index >= practice.stages.length || index > furthestUnlockedIndex) return;
		invalidateGradeRequest();
		gradePhase = 'idle';
		gradeFailure = null;
		gradeReasoningSummary = '';
		hintOpen = false;
		hintUsed = false;
		responseStartedAt = Date.now();
		pendingCheckId = '';
		pendingCheckSignature = '';
		pendingResponseDurationMs = null;
		void goto(stepHref(practice.stages[index]), { noScroll: true, keepFocus: false });
	}

	function continueToNextStage() {
		if (!activePassed) return;
		const nextStage = practice.stages[activeStageIndex + 1];
		if (nextStage) openStage(activeStageIndex + 1);
	}

	function resetPractice() {
		invalidateGradeRequest();
		stepAnswers = blankStepAnswers();
		stepResults = {};
		attemptHistory = [];
		gradePhase = 'idle';
		gradeFailure = null;
		gradeReasoningSummary = '';
		hintOpen = false;
		hintUsed = false;
		activitySessionId = createActivityId('english-session');
		responseStartedAt = Date.now();
		pendingCheckId = '';
		pendingCheckSignature = '';
		pendingResponseDurationMs = null;
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
		if (phase === 'connecting') return 'Connecting to the checker';
		if (phase === 'calling') return 'Loading the question guidance';
		if (phase === 'thinking') return 'Reviewing your response';
		if (phase === 'grading') return 'Preparing feedback';
		return 'Checking your step';
	}

	function gradePhaseProgressIndex(phase: GradePhase) {
		if (phase === 'connecting') return 0;
		if (phase === 'calling') return 1;
		if (phase === 'thinking') return 2;
		if (phase === 'grading') return 3;
		return -1;
	}

	function readableReasoningSummary(value: string) {
		const cleaned = value
			.replace(/```[\s\S]*?```/g, '')
			.replace(/^#{1,6}\s+/gm, '')
			.replace(/\*\*/g, '')
			.replace(/`/g, '')
			.trim();
		if (!cleaned) return '';
		const safeSentences = (cleaned.match(/[^.!?]+[.!?]+/g) ?? [])
			.map((sentence) => sentence.replace(/\s+/g, ' ').trim())
			.filter(
				(sentence) =>
					!/(?:^|\s)(?:I|we)\s/i.test(sentence) &&
					!/(?:JSON|output format|instructions?|system prompt)/i.test(sentence)
			);
		const latestSummary = safeSentences.slice(-2).join(' ');
		return latestSummary.length > 420 ? `${latestSummary.slice(0, 417).trimEnd()}…` : latestSummary;
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

	function handleSseMessage(
		message: SseMessage,
		reference: string | null,
		request: EnglishGradeRequest
	) {
		if (!gradeRequestIsCurrent(request)) return null;
		if (message.event === 'status') {
			const status = JSON.parse(message.data) as {
				phase?: GradePhase;
				summaryDelta?: string;
			};
			if (status.phase === 'calling' || status.phase === 'thinking' || status.phase === 'grading') {
				gradePhase = status.phase;
			}
			if (status.summaryDelta) {
				gradeReasoningSummary = `${gradeReasoningSummary}${status.summaryDelta}`.slice(-3000);
			}
			return null;
		}
		if (message.event === 'done') return JSON.parse(message.data) as EnglishStepGradeResult;
		if (message.event === 'error') {
			const payload = JSON.parse(message.data) as { error?: string; message?: string };
			throw new ServerRequestError(payload.message ?? 'The step checker returned an error.', {
				code: payload.error,
				reference
			});
		}
		return null;
	}

	async function readSseStream(
		body: ReadableStream<Uint8Array>,
		reference: string | null,
		request: EnglishGradeRequest
	) {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let result: EnglishStepGradeResult | null = null;
		while (true) {
			const { done, value } = await readStreamChunkWithTimeout(reader);
			buffer += decoder.decode(value, { stream: !done });
			let separatorIndex = buffer.indexOf('\n\n');
			while (separatorIndex !== -1) {
				const block = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + 2);
				const message = parseSseBlock(block);
				if (message) result = handleSseMessage(message, reference, request) ?? result;
				separatorIndex = buffer.indexOf('\n\n');
			}
			if (done) break;
		}
		const trailingMessage = parseSseBlock(buffer.trim());
		if (trailingMessage) {
			result = handleSseMessage(trailingMessage, reference, request) ?? result;
		}
		return result;
	}

	async function checkActiveStep() {
		if (!activeStage || !canCheck) return;
		if (!user) {
			openAuthDialog();
			return;
		}
		gradeFailure = null;
		gradeReasoningSummary = '';
		gradePhase = 'connecting';
		let streamStarted = false;
		const pendingCheck = ensurePendingCheck();
		if (!pendingCheck) return;
		activeGradeController?.abort('Superseded by a new step check');
		const controller = new AbortController();
		activeGradeController = controller;
		const request: EnglishGradeRequest = {
			sequence: ++gradeRequestSequence,
			questionId: practice.questionId,
			stageId: activeStage.id,
			stageTitle: activeStage.title,
			answer: activeAnswer
		};
		const submittedStepAnswers = { ...stepAnswers };
		const submittedAttemptHistory = [...attemptHistory];
		await tick();
		if (!gradeRequestIsCurrent(request)) return;
		feedbackPanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		try {
			const response = await fetchWithResponseTimeout(
				resolve('/api/questions/[questionId]/grade-step', {
					questionId: request.questionId
				}),
				{
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						stepId: request.stageId,
						answer: request.answer,
						stepAnswers: submittedStepAnswers,
						attemptHistory: submittedAttemptHistory,
						...pendingCheck
					}),
					signal: controller.signal
				}
			);
			if (!gradeRequestIsCurrent(request)) return;
			if (response.status === 401) {
				gradePhase = 'idle';
				openAuthDialog();
				return;
			}
			if (!response.ok || !response.body) {
				throw await requestErrorFromResponse(response, 'Step check request failed.');
			}
			streamStarted = true;
			const result = await readSseStream(
				response.body,
				response.headers.get('cf-ray') ?? response.headers.get('x-request-id'),
				request
			);
			if (!gradeRequestIsCurrent(request)) return;
			if (!result) throw new InterruptedRequestError('The step check ended without feedback.');
			stepResults = { ...stepResults, [request.stageId]: result };
			attemptHistory = [
				...attemptHistory,
				{
					stepId: request.stageId,
					stepTitle: request.stageTitle,
					answer: request.answer,
					decision: result.decision,
					checks: result.checks,
					nextImprovement: result.nextImprovement
				}
			].slice(-16);
			gradePhase = 'done';
			persistState();
		} catch (error) {
			if (controller.signal.aborted || !gradeRequestIsCurrent(request)) return;
			console.error('[english-step-practice] step check failed', error);
			gradePhase = 'error';
			gradeFailure = classifyRequestFailure(error, {
				action: 'finish checking this step',
				serverLabel: 'The answer checker',
				streamStarted
			});
		} finally {
			if (activeGradeController === controller) activeGradeController = null;
		}
	}

	function primaryAction() {
		if (activePassed) {
			if (activeStageIndex === practice.stages.length - 1) {
				persistState();
				void goto(completionHref);
			} else {
				continueToNextStage();
			}
			return;
		}
		void checkActiveStep();
	}

	function primaryLabel() {
		if (isChecking) return statusText(gradePhase);
		if (activePassed) {
			return activeStageIndex === practice.stages.length - 1 ? 'Finish practice' : 'Continue';
		}
		return activeResult?.decision === 'revise' ? 'Check again' : 'Check step';
	}

	$effect(() => {
		if (loadedQuestionId === practice.questionId) return;
		invalidateGradeRequest();
		loadedQuestionId = practice.questionId;
		hydrated = false;
		gradePhase = 'idle';
		gradeFailure = null;
		gradeReasoningSummary = '';
		const storedState = initialEnglishPracticeState(practice.questionId);
		stepAnswers = { ...blankStepAnswers(), ...(storedState?.stepAnswers ?? {}) };
		stepResults = storedState?.stepResults ?? {};
		attemptHistory = storedState?.attemptHistory ?? [];
		activitySessionId = storedState?.activitySessionId || createActivityId('english-session');
		responseStartedAt =
			storedState?.responseStartedAt &&
			responseDurationMs(storedState.responseStartedAt, Date.now()) !== null
				? storedState.responseStartedAt
				: Date.now();
		pendingCheckId = storedState?.pendingCheckId ?? '';
		pendingCheckSignature = storedState?.pendingCheckSignature ?? '';
		pendingResponseDurationMs = storedState?.pendingResponseDurationMs ?? null;
		lastQueuedDraftSignature = migratedAnonymousState ? '' : JSON.stringify(draftPayload());
		hydrated = true;
	});

	beforeNavigate(({ to }) => {
		if (to?.url.pathname !== page.url.pathname) invalidateGradeRequest();
	});

	onDestroy(invalidateGradeRequest);

	$effect(() => {
		if (!hintOpen || hintUsed) return;
		hintUsed = true;
		pendingCheckId = '';
		pendingCheckSignature = '';
		pendingResponseDurationMs = null;
		persistState();
	});

	$effect(() => {
		if (!hydrated || activeStageIndex <= furthestUnlockedIndex) return;
		const unlockedStage = practice.stages[furthestUnlockedIndex];
		if (unlockedStage) {
			void goto(stepHref(unlockedStage), { replaceState: true, noScroll: true });
		}
	});

	$effect(() => {
		activeStageIndex;
		if (!hydrated || !stepperElement) return;
		void tick().then(() => {
			const activeButton = stepperElement?.querySelector<HTMLElement>('[aria-current="step"]');
			if (!activeButton) return;
			activeButton.scrollIntoView({
				block: 'nearest',
				inline: 'nearest',
				behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
			});
		});
	});

	onMount(() => {
		const cleanup = installPracticeDraftWindowFlush(userId);
		if (userId && migratedAnonymousState) {
			persistState();
			void flushPracticeDraftQueue(userId);
		}
		if (consumePendingGrade()) {
			window.setTimeout(() => void checkActiveStep(), 0);
		}
		return cleanup;
	});
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
		<aside class="qc-context-rail qc-step-question" aria-label="Question">
			<IconBackLink href={backHref} label={backLabel} />
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

			{#if showSourcePaperLink && practice.sourcePaperUrl}
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

		<section
			class="qc-step-workspace"
			class:hydrating={!hydrated}
			aria-label="Step-by-step answer practice"
			aria-busy={!hydrated}
			inert={!hydrated}
		>
			{#if !hydrated}
				<div class="qc-step-hydrating" role="status">
					<span class="qc-step-spinner dark" aria-hidden="true"></span>
					Preparing the practice controls…
				</div>
			{/if}
			<nav
				bind:this={stepperElement}
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
								Complete
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
						{#if !activePassed}
							<small>
								{activeAnswer.length < 8
									? 'Write a meaningful response before checking.'
									: 'Your response will be checked against this step only.'}
							</small>
						{/if}
						<button
							type="button"
							class="qc-step-primary"
							onclick={primaryAction}
							disabled={!activePassed && !canCheck}
						>
							{#if isChecking}
								<span class="qc-step-spinner" aria-hidden="true"></span>
							{:else if activePassed}
								<ChevronRight size={18} aria-hidden="true" />
							{:else}
								<ClipboardCheck size={18} aria-hidden="true" />
							{/if}
							{primaryLabel()}
						</button>
					</div>
				</section>

				{#if isChecking || gradeFailure || activeResult}
					<section
						class="qc-step-feedback"
						aria-live="polite"
						aria-label="Feedback"
						bind:this={feedbackPanel}
					>
						<header>
							<div>
								<p>Feedback</p>
								<h3>
									{activeResult?.decision === 'pass'
										? 'What worked'
										: activeResult
											? 'What to improve'
											: isChecking
												? statusText(gradePhase)
												: 'Check unavailable'}
								</h3>
							</div>
						</header>

						{#if isChecking}
							<div class="qc-step-checking">
								<div class="qc-step-checking-head">
									<span class="qc-step-spinner dark" aria-hidden="true"></span>
									<span>
										<strong>{statusText(gradePhase)}</strong>
										<small>The coach is checking this step only.</small>
									</span>
								</div>
								<ol class="qc-step-progress-list" aria-label="Check progress">
									{#each gradingProgressSteps as progressStep, index (progressStep)}
										<li
											class:current={index === progressStepIndex}
											class:complete={index < progressStepIndex}
										>
											<span aria-hidden="true">
												{#if index < progressStepIndex}
													<Check size={12} strokeWidth={2.8} />
												{:else}
													{index + 1}
												{/if}
											</span>
											{progressStep}
										</li>
									{/each}
								</ol>
								{#if visibleReasoningSummary}
									<div class="qc-step-reasoning-summary">
										<strong>What the coach is checking</strong>
										<p>{visibleReasoningSummary}</p>
									</div>
								{/if}
							</div>
						{:else if gradeFailure}
							<div class="qc-step-failure">
								<RequestFailureNotice
									failure={gradeFailure}
									onRetry={() => void checkActiveStep()}
									retryLabel="Retry check"
								/>
							</div>
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
									>{activeResult.decision === 'pass' ? 'Use this next' : 'Next improvement'}</strong
								>
								<p>{activeResult.nextImprovement}</p>
							</div>
							{#if activeResult.coachingNote}
								<div class="qc-step-coaching-note">
									<strong
										>{attemptHistory.length > 1 ? 'Pattern to keep' : 'Your current focus'}</strong
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
						.length}/{practice.stages.length} complete</span
				>
				<button type="button" onclick={resetPractice}>
					<RotateCcw size={16} aria-hidden="true" />
					Reset practice
				</button>
			</footer>
		</section>
	</div>
</main>

<AuthRequiredDialog
	open={authDialogOpen}
	href={signInHref}
	onDismiss={() => (authDialogOpen = false)}
	onSignIn={prepareAuthRedirect}
/>

<style>
	.qc-step-practice-app {
		--step-ink: var(--qc-ui-text);
		--step-muted: var(--qc-ui-text-muted);
		--step-line: var(--qc-ui-border-subtle);
		--step-paper: var(--qc-ui-surface);
		--step-green: var(--qc-ui-accent);
		--step-green-soft: var(--qc-ui-accent-muted);
		min-height: var(--app-viewport-height, 100vh);
		background:
			linear-gradient(115deg, var(--qc-ui-canvas-art-primary), transparent 38%),
			linear-gradient(295deg, var(--qc-ui-canvas-art-secondary), transparent 42%),
			var(--qc-ui-canvas);
		color: var(--step-ink);
		overflow-x: clip;
	}

	.qc-step-practice-layout {
		display: grid;
		grid-template-columns: minmax(24rem, 32rem) minmax(0, 1fr);
		width: min(100%, 94rem);
		min-width: 0;
		min-height: calc(var(--app-viewport-height, 100vh) - var(--qc-topbar-height, 4rem));
		margin: 0 auto;
	}

	.qc-step-question {
		display: grid;
		align-content: start;
		gap: 0.95rem;
		min-width: 0;
		padding: clamp(1.4rem, 2.5vw, 2.35rem);
		border-right: 1px solid var(--qc-ui-border-subtle);
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
		border: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
		text-decoration: none;
	}

	.qc-step-source-link:hover {
		border-color: var(--qc-ui-accent);
		background: var(--qc-ui-accent-soft);
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
		color: var(--qc-ui-text-muted);
		font-size: 0.75rem;
	}

	.qc-step-eyebrow,
	.qc-step-card-head p,
	.qc-step-feedback header p,
	.qc-step-instructions > p {
		margin: 0;
		color: var(--qc-ui-text-muted);
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
		border: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-subtle);
		font-size: 0.78rem;
		font-weight: 650;
	}

	.qc-step-instructions {
		padding: 0.9rem 1rem;
		border: 1px solid var(--step-line);
		background: var(--qc-ui-surface-subtle);
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
		container: english-step-workspace / inline-size;
	}

	.qc-step-hydrating {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
	}

	.qc-stepper {
		display: grid;
		grid-template-columns: repeat(var(--step-count), minmax(0, 1fr));
		border: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-subtle);
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
		border-right: 1px solid var(--qc-ui-border-subtle);
		background: transparent;
		color: var(--qc-ui-text-secondary);
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
		background: var(--qc-ui-accent-soft);
		color: var(--qc-ui-accent-text);
	}

	.qc-stepper button.active::after {
		background: var(--step-green);
	}

	.qc-stepper button.passed {
		color: var(--qc-ui-accent-text);
	}

	.qc-stepper button.locked {
		background: var(--qc-ui-disabled-surface);
		color: var(--qc-ui-disabled-text);
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

	@container english-step-workspace (max-width: 36rem) {
		.qc-stepper button {
			flex-direction: column;
			gap: 0.2rem;
		}

		.qc-stepper strong {
			overflow: visible;
			text-align: center;
			text-overflow: clip;
			white-space: normal;
		}
	}

	.qc-step-card,
	.qc-step-feedback {
		border: 1px solid var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-raised);
		box-shadow: 0 16px 40px var(--qc-ui-shadow);
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

	.qc-step-card-head h2 {
		margin: 0.22rem 0 0;
		font-family: Georgia, 'Times New Roman', serif;
		font-weight: 500;
		letter-spacing: -0.025em;
	}

	.qc-step-card-head h2 {
		font-size: clamp(1.55rem, 2.6vw, 2.2rem);
	}

	.qc-step-pass-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		padding: 0.38rem 0.58rem;
		border: 1px solid var(--qc-ui-border-subtle);
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		font-weight: 700;
		white-space: nowrap;
	}

	.qc-step-pass-badge {
		border-color: var(--qc-ui-accent-border);
		background: var(--step-green-soft);
		color: var(--qc-ui-accent-text);
	}

	.qc-step-explanation {
		max-width: 52rem;
		margin: 1.15rem 0 0;
		color: var(--qc-ui-text-secondary);
		font-size: 1rem;
		line-height: 1.6;
	}

	.qc-step-goal {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.7rem;
		margin: 1rem 0 1.25rem;
		padding: 0.72rem 0.82rem;
		border-left: 3px solid var(--qc-ui-accent);
		background: var(--qc-ui-accent-soft);
		color: var(--qc-ui-text-secondary);
		font-size: 0.88rem;
		line-height: 1.45;
	}

	.qc-step-goal strong {
		color: var(--qc-ui-accent-text);
	}

	.qc-step-answer {
		display: grid;
		gap: 0.65rem;
	}

	.qc-step-answer > span {
		color: var(--qc-ui-text);
		font-size: 1.03rem;
		font-weight: 720;
	}

	.qc-step-answer :global(.lined-textarea) {
		--qc-response-ink: var(--qc-ui-text);
		--qc-response-line: var(--qc-ui-border-strong);
		--qc-response-textarea-bg: var(--qc-ui-surface-subtle);
		--qc-response-caret: var(--qc-ui-accent);
		border-color: var(--qc-ui-border);
		font-size: 1rem;
		line-height: 2rem;
	}

	.qc-step-action-row {
		align-items: flex-end;
		margin-top: 1.15rem;
	}

	.qc-step-action-row small {
		max-width: 27rem;
		color: var(--qc-ui-text-subtle);
		font-size: 0.78rem;
		line-height: 1.4;
	}

	.qc-step-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.48rem;
		margin-left: auto;
		min-width: 9.25rem;
		min-height: 2.85rem;
		padding: 0.68rem 1.05rem;
		border: 1px solid var(--qc-ui-accent-strong);
		background: var(--qc-ui-accent);
		color: var(--qc-ui-on-accent);
		font: inherit;
		font-size: 0.88rem;
		font-weight: 750;
		cursor: pointer;
	}

	.qc-step-primary:hover:not(:disabled) {
		background: var(--qc-ui-accent-hover);
	}

	.qc-step-primary:disabled {
		border-color: var(--qc-ui-disabled-border);
		background: var(--qc-ui-disabled-surface);
		color: var(--qc-ui-disabled-text);
		cursor: not-allowed;
	}

	.qc-step-spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid color-mix(in srgb, var(--qc-ui-on-accent) 45%, transparent);
		border-top-color: currentColor;
		border-radius: 50%;
		animation: qc-step-spin 0.75s linear infinite;
	}

	.qc-step-spinner.dark {
		border-color: color-mix(in srgb, var(--qc-ui-accent) 20%, transparent);
		border-top-color: var(--qc-ui-accent);
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
		background: var(--qc-ui-surface-muted);
	}

	.qc-step-feedback h3 {
		margin: 0.22rem 0 0;
		font-family: inherit;
		font-size: 1.2rem;
		font-weight: 750;
		letter-spacing: -0.01em;
	}

	.qc-step-checking {
		display: grid;
		gap: 1rem;
		padding: 1.5rem 1.15rem;
		color: var(--step-muted);
	}

	.qc-step-checking-head {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	.qc-step-checking-head > span:last-child {
		display: grid;
		gap: 0.15rem;
	}

	.qc-step-checking-head strong {
		color: var(--qc-ui-text);
		font-size: 0.9rem;
	}

	.qc-step-checking-head small {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
	}

	.qc-step-progress-list {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.qc-step-progress-list li {
		display: grid;
		grid-template-columns: 1.35rem minmax(0, 1fr);
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
		color: var(--qc-ui-text-subtle);
		font-size: 0.72rem;
		line-height: 1.25;
	}

	.qc-step-progress-list li > span {
		display: grid;
		place-items: center;
		width: 1.35rem;
		height: 1.35rem;
		border: 1px solid var(--qc-ui-border-subtle);
		font-size: 0.66rem;
		font-weight: 750;
	}

	.qc-step-progress-list li.current {
		color: var(--qc-ui-accent-text);
		font-weight: 720;
	}

	.qc-step-progress-list li.current > span {
		border-color: var(--qc-ui-accent);
		background: var(--qc-ui-accent-muted);
	}

	.qc-step-progress-list li.complete {
		color: var(--qc-ui-text-muted);
	}

	.qc-step-progress-list li.complete > span {
		border-color: var(--qc-ui-accent-border);
		color: var(--qc-ui-accent-text);
	}

	.qc-step-reasoning-summary {
		padding: 0.75rem 0.85rem;
		border-left: 3px solid var(--qc-ui-accent);
		background: var(--qc-ui-accent-soft);
	}

	.qc-step-reasoning-summary strong {
		color: var(--qc-ui-accent-text);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.qc-step-checking .qc-step-reasoning-summary p {
		margin: 0.35rem 0 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.84rem;
		line-height: 1.45;
	}

	.qc-step-checking p {
		margin: 0;
	}

	.qc-step-failure {
		padding: 1rem;
	}

	.qc-step-checks {
		display: grid;
	}

	.qc-step-checks > div {
		display: grid;
		grid-template-columns: 1.35rem minmax(0, 1fr);
		gap: 0.75rem;
		padding: 0.9rem 1.15rem;
		border-bottom: 1px solid var(--qc-ui-border-subtle);
		color: var(--qc-ui-text-subtle);
	}

	.qc-step-checks > div.met {
		color: var(--step-green);
	}

	.qc-step-checks span {
		display: grid;
		gap: 0.22rem;
	}

	.qc-step-checks strong {
		color: var(--qc-ui-text);
		font-size: 0.9rem;
	}

	.qc-step-checks small {
		color: var(--qc-ui-text-muted);
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.qc-step-next-improvement {
		padding: 1rem 1.15rem 1.15rem;
		border-left: 3px solid var(--qc-ui-warning);
		background: var(--qc-ui-warning-surface);
	}

	.qc-step-next-improvement strong {
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.qc-step-next-improvement p {
		margin: 0.32rem 0 0;
		color: var(--qc-ui-warning-text);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.qc-step-coaching-note {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.75rem;
		padding: 0.85rem 1.15rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.qc-step-coaching-note strong {
		color: var(--qc-ui-accent-text);
		font-size: 0.75rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.qc-step-coaching-note p {
		margin: 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.84rem;
		line-height: 1.45;
	}

	.qc-step-footer {
		padding-top: 0.2rem;
		color: var(--qc-ui-text-subtle);
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
		color: var(--qc-ui-text);
	}

	:global(.qc-step-workspace .qc-hint-panel) {
		margin: -0.1rem 0 0;
	}

	@media (max-width: 1100px) {
		.qc-step-practice-layout {
			grid-template-columns: 1fr;
		}

		.qc-step-question {
			border-right: 0;
			border-bottom: 1px solid var(--qc-ui-border-subtle);
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
			overflow-y: hidden;
			overscroll-behavior-x: contain;
			scrollbar-width: none;
		}

		.qc-stepper::-webkit-scrollbar {
			display: none;
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

		.qc-step-pass-badge {
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

		.qc-step-progress-list {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.qc-step-primary {
			width: 100%;
			margin-left: 0;
		}
	}
</style>
