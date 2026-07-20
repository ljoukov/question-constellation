<script lang="ts">
	import { onMount } from 'svelte';
	import ExamPaper from './ExamPaper.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import type { ExperimentGradeResponse } from '../gradingTypes';
	import type { ExamPaper as ExamPaperData, ExamQuestion } from '../types';
	import {
		answerablePaperParts,
		activatePaperSittingPart,
		createPaperSitting,
		elapsedPaperSittingMs,
		MAX_PAPER_ANSWER_LENGTH,
		mergePaperGradeResponse,
		normalizedPaperAnswer,
		overlongPaperAnswerRefs,
		paperAnswerProgress,
		paperGradeSummary,
		paperSittingNeedsDeadlineSubmission,
		paperSittingStorageKey,
		parseStoredPaperSitting,
		remainingPaperSittingMs,
		submitPaperSitting,
		type StoredPaperSitting
	} from '../paperSitting';
	import { externalInputSourceFromBeforeInput } from '$lib/learning/answerAssistance';
	import { markHomeSnapshotDirty } from '$lib/homeSnapshotClient';
	import {
		classifyRequestFailure,
		fetchWithResponseTimeout,
		InterruptedRequestError,
		readStreamChunkWithTimeout,
		requestErrorFromResponse,
		ResponseRequestError,
		ServerRequestError,
		type RequestFailure
	} from '$lib/requestFailure';

	type StreamPhase = 'idle' | 'submitting' | 'calling' | 'thinking' | 'grading';

	let {
		paper,
		userId,
		durationMinutes,
		totalMarks,
		reviewedAt
	}: {
		paper: ExamPaperData;
		userId: string;
		durationMinutes: number;
		totalMarks: number;
		reviewedAt: string;
	} = $props();

	const storageKey = $derived(paperSittingStorageKey(userId, paper.id));
	const answerablePartRefs = $derived(
		new Set(answerablePaperParts(paper).map(({ part }) => part.ref))
	);
	const currentPartRefs = $derived(
		new Set(paper.questions.flatMap((question) => question.parts.map((part) => part.ref)))
	);
	let mounted = $state(false);
	let session = $state<StoredPaperSitting | null>(null);
	let now = $state(Date.now());
	let streamPhase = $state<StreamPhase>('idle');
	let currentGradingRef = $state('');
	let submitFailure = $state<RequestFailure | null>(null);
	let storageWarning = $state('');
	let draftWarning = $state('');
	let integrityNotice = $state('');
	let authorizationBlocked = $state(false);
	let savedSnapshotUnreadable = $state(false);
	let hiddenResultRefs = $state<string[]>([]);
	let deadlineSubmissionStartedFor = $state<string | null>(null);
	let pendingDraft: StoredPaperSitting | null = null;
	let draftSaveTimer: number | null = null;
	let draftSaveRunner: Promise<void> | null = null;

	const progress = $derived(paperAnswerProgress(paper, session?.answers ?? {}));
	const overlongRefs = $derived(overlongPaperAnswerRefs(paper, session?.answers ?? {}));
	const elapsedMs = $derived(session ? elapsedPaperSittingMs(session, now) : 0);
	const remainingMs = $derived(
		session ? remainingPaperSittingMs(session, durationMinutes, now) : durationMinutes * 60_000
	);
	const deadlineReached = $derived(
		Boolean(session && paperSittingNeedsDeadlineSubmission(session, durationMinutes, now))
	);
	const isSubmitting = $derived(streamPhase !== 'idle');
	const gradeSummary = $derived(paperGradeSummary(session?.results ?? {}, totalMarks));
	const visibleGradeResults = $derived(
		session && (session.status === 'complete' || authorizationBlocked)
			? Object.fromEntries(
					Object.entries(session.results).filter(([ref]) => !hiddenResultRefs.includes(ref))
				)
			: {}
	);
	const orphanAnswers = $derived(
		session
			? Object.entries(session.answers).filter(
					([ref, answer]) => !currentPartRefs.has(ref) && answer.trim().length > 0
				)
			: []
	);
	const orphanResults = $derived(
		session ? Object.entries(session.results).filter(([ref]) => !currentPartRefs.has(ref)) : []
	);
	const canSubmit = $derived(
		Boolean(
			session &&
			!authorizationBlocked &&
			!isSubmitting &&
			(session.status === 'grading' ||
				(session.status === 'in_progress' && !deadlineReached && overlongRefs.length === 0))
		)
	);
	const submitLabel = $derived(
		streamPhase === 'submitting'
			? 'Preparing paper...'
			: streamPhase === 'calling'
				? `Checking question ${currentGradingRef}...`
				: streamPhase === 'thinking'
					? `Reading question ${currentGradingRef}...`
					: streamPhase === 'grading'
						? `Marking question ${currentGradingRef}...`
						: session?.status === 'grading'
							? 'Continue checking'
							: 'Finish paper'
	);

	type ServerSittingView = {
		sessionId: string;
		status: 'in_progress' | 'submitted' | 'grading' | 'complete';
		startedAtMs: number;
		submittedAtMs: number | null;
		completedAtMs: number | null;
		reviewedAt: string;
		nextQuestionRef: string | null;
		gradedQuestionRefs: string[];
		results: StoredPaperSitting['results'];
		answers: Record<string, string>;
		draftRevision: number;
	};

	type ServerSittingStart = ServerSittingView & { nonce: string };

	async function postSittingSession(body: Record<string, unknown>, keepalive = false) {
		const response = await fetchWithResponseTimeout(
			`/api/experiments/questions/${paper.id}/sitting`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify(body),
				keepalive
			}
		);
		if (!response.ok) {
			throw await requestErrorFromResponse(response, 'Paper sitting request failed.');
		}
		return (await response.json()) as ServerSittingView | ServerSittingStart;
	}

	function persist(nextSession = session) {
		if (!nextSession || typeof window === 'undefined') return;
		try {
			window.localStorage.setItem(storageKey, JSON.stringify(nextSession));
			storageWarning = '';
		} catch {
			storageWarning =
				'This browser could not save the latest change. Keep this tab open until you finish.';
		}
	}

	function draftAnswers(snapshot: StoredPaperSitting) {
		return Object.fromEntries(
			paper.questions.flatMap((question) =>
				question.parts.map((part) => [
					part.ref,
					normalizedPaperAnswer(part.response, snapshot.answers[part.ref] ?? '')
				])
			)
		);
	}

	async function saveDraft(snapshot: StoredPaperSitting, keepalive = false) {
		const saved = (await postSittingSession(
			{
				action: 'save',
				sessionId: snapshot.sessionId,
				nonce: snapshot.nonce,
				draftRevision: snapshot.draftRevision,
				answers: draftAnswers(snapshot),
				activePartRef: snapshot.activePartRef
			},
			keepalive
		)) as ServerSittingView;
		if (
			saved.sessionId !== snapshot.sessionId ||
			saved.startedAtMs !== snapshot.startedAt ||
			saved.reviewedAt !== snapshot.readinessReviewedAt
		) {
			throw new InterruptedRequestError('The server did not save this paper draft safely.');
		}
		draftWarning = '';
	}

	async function drainDraftSaves(keepalive = false): Promise<void> {
		if (draftSaveRunner) {
			await draftSaveRunner;
			if (pendingDraft) await drainDraftSaves(keepalive);
			return;
		}
		const runner = (async () => {
			while (pendingDraft) {
				const snapshot = pendingDraft;
				pendingDraft = null;
				try {
					await saveDraft(snapshot, keepalive);
				} catch (error) {
					const pendingAfterFailure = pendingDraft as StoredPaperSitting | null;
					if (!pendingAfterFailure || pendingAfterFailure.draftRevision < snapshot.draftRevision) {
						pendingDraft = snapshot;
					}
					draftWarning =
						'The latest answer change has not reached the exam server yet. Keep this tab online.';
					throw error;
				}
			}
		})();
		draftSaveRunner = runner;
		try {
			await runner;
		} finally {
			if (draftSaveRunner === runner) draftSaveRunner = null;
		}
	}

	function scheduleDraftDrain(delayMs: number) {
		if (draftSaveTimer !== null) window.clearTimeout(draftSaveTimer);
		draftSaveTimer = window.setTimeout(() => {
			draftSaveTimer = null;
			void drainDraftSaves().catch((error) => {
				console.error('[full-paper-sitting] draft autosave failed', error);
				if (pendingDraft) scheduleDraftDrain(1_000);
			});
		}, delayMs);
	}

	function queueDraftSave(snapshot: StoredPaperSitting) {
		pendingDraft = snapshot;
		scheduleDraftDrain(300);
	}

	async function flushDraftSaves(keepalive = false) {
		if (draftSaveTimer !== null) {
			window.clearTimeout(draftSaveTimer);
			draftSaveTimer = null;
		}
		await drainDraftSaves(keepalive);
	}

	async function startPaper() {
		if (isSubmitting) return;
		streamPhase = 'submitting';
		submitFailure = null;
		try {
			const started = (await postSittingSession({ action: 'start' })) as ServerSittingStart;
			if (started.status !== 'in_progress' || started.reviewedAt !== reviewedAt) {
				throw new InterruptedRequestError('The paper review changed while this sitting started.');
			}
			const nextSession = createPaperSitting({
				paper,
				userId,
				readinessReviewedAt: started.reviewedAt,
				sessionId: started.sessionId,
				nonce: started.nonce,
				now: started.startedAtMs
			});
			deadlineSubmissionStartedFor = null;
			session = nextSession;
			persist(nextSession);
		} catch (error) {
			console.error('[full-paper-sitting] start failed', error);
			submitFailure = classifyRequestFailure(error, {
				action: 'start this paper',
				serverLabel: 'The paper sitting service'
			});
		} finally {
			streamPhase = 'idle';
		}
	}

	function setAnswer(ref: string, answer: string) {
		if (
			!session ||
			authorizationBlocked ||
			session.status !== 'in_progress' ||
			paperSittingNeedsDeadlineSubmission(session, durationMinutes)
		)
			return;
		if (answer.length > MAX_PAPER_ANSWER_LENGTH) {
			integrityNotice = `Each answer is limited to ${MAX_PAPER_ANSWER_LENGTH.toLocaleString()} characters.`;
			return;
		}
		const changedAt = Date.now();
		const activeSession = activatePaperSittingPart(session, ref, changedAt);
		const nextSession: StoredPaperSitting = {
			...activeSession,
			draftRevision: activeSession.draftRevision + 1,
			answers: { ...activeSession.answers, [ref]: answer },
			updatedAt: changedAt
		};
		session = nextSession;
		persist(nextSession);
		queueDraftSave(nextSession);
	}

	function activatePart(ref: string) {
		if (
			!session ||
			authorizationBlocked ||
			session.status !== 'in_progress' ||
			paperSittingNeedsDeadlineSubmission(session, durationMinutes) ||
			!answerablePartRefs.has(ref)
		)
			return;
		const activated = activatePaperSittingPart(session, ref);
		if (activated === session) return;
		const nextSession = { ...activated, draftRevision: activated.draftRevision + 1 };
		session = nextSession;
		persist(nextSession);
		queueDraftSave(nextSession);
	}

	function blockExternalInput(event: Event) {
		event.preventDefault();
		integrityNotice =
			'Paste and drop are blocked during a full-paper sitting. Type each answer yourself.';
	}

	function blockExternalBeforeInput(event: InputEvent) {
		if (externalInputSourceFromBeforeInput(event.inputType)) blockExternalInput(event);
	}

	function parseSseEvent(rawEvent: string) {
		let event = 'message';
		const dataLines: string[] = [];
		for (const line of rawEvent.split(/\r?\n/)) {
			if (!line || line.startsWith(':')) continue;
			if (line.startsWith('event:')) {
				event = line.slice('event:'.length).trim();
				continue;
			}
			if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
		}
		return { event, data: dataLines.join('\n') };
	}

	function applyStreamEvent(
		event: string,
		dataText: string,
		reference: string | null,
		complete: (response: ExperimentGradeResponse) => void
	) {
		if (event === 'status') {
			const payload = JSON.parse(dataText) as { phase?: string };
			if (payload.phase === 'calling') streamPhase = 'calling';
			if (payload.phase === 'thinking') streamPhase = 'thinking';
			if (payload.phase === 'grading') streamPhase = 'grading';
			return;
		}
		if (event === 'done') {
			complete(JSON.parse(dataText) as ExperimentGradeResponse);
			return;
		}
		if (event === 'error') {
			const payload = JSON.parse(dataText) as { error?: string; message?: string };
			throw new ServerRequestError(payload.message ?? 'Unable to check this paper right now.', {
				code: payload.error,
				reference
			});
		}
	}

	async function readGradeStream(response: Response) {
		const reader = response.body?.getReader();
		if (!reader) throw new Error('The grading stream could not be opened.');
		const decoder = new TextDecoder();
		const reference = response.headers.get('cf-ray') ?? response.headers.get('x-request-id');
		let buffer = '';
		const completed: { value: ExperimentGradeResponse | null } = { value: null };
		const complete = (value: ExperimentGradeResponse) => (completed.value = value);

		while (true) {
			const { value, done } = await readStreamChunkWithTimeout(reader);
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let boundary = buffer.indexOf('\n\n');
			while (boundary >= 0) {
				const rawEvent = buffer.slice(0, boundary).trimEnd();
				buffer = buffer.slice(boundary + 2);
				if (rawEvent) {
					const parsed = parseSseEvent(rawEvent);
					applyStreamEvent(parsed.event, parsed.data, reference, complete);
				}
				boundary = buffer.indexOf('\n\n');
			}
		}

		buffer += decoder.decode();
		if (buffer.trim()) {
			const parsed = parseSseEvent(buffer.trim());
			applyStreamEvent(parsed.event, parsed.data, reference, complete);
		}
		if (!completed.value) {
			throw new InterruptedRequestError('The paper check ended without feedback.');
		}
		return completed.value;
	}

	async function gradeQuestion(question: ExamQuestion, workingSession: StoredPaperSitting) {
		const response = await fetchWithResponseTimeout(
			`/api/experiments/questions/${paper.id}/${encodeURIComponent(question.ref)}/grade`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
				body: JSON.stringify({
					paperSitting: {
						sessionId: workingSession.sessionId,
						nonce: workingSession.nonce
					}
				})
			}
		);
		if (!response.ok) throw await requestErrorFromResponse(response, 'Paper check request failed.');
		const gradeResponse = await readGradeStream(response);
		const expectedRefs = new Set(question.parts.map((part) => part.ref));
		const returnedRefs = new Set(gradeResponse.results.map((result) => result.ref));
		if (
			expectedRefs.size !== returnedRefs.size ||
			[...expectedRefs].some((ref) => !returnedRefs.has(ref))
		) {
			throw new InterruptedRequestError(
				`The checker returned incomplete feedback for question ${question.ref}.`
			);
		}
		return gradeResponse;
	}

	async function runGrading() {
		if (!session || authorizationBlocked || session.status !== 'grading' || isSubmitting) return;
		streamPhase = 'submitting';
		submitFailure = null;
		let streamStarted = false;
		let snapshotWasMutated = false;
		let working = session;
		try {
			for (const question of paper.questions) {
				if (working.gradedQuestionRefs.includes(question.ref)) continue;
				currentGradingRef = question.ref;
				streamPhase = 'calling';
				streamStarted = true;
				const response = await gradeQuestion(question, working);
				snapshotWasMutated = true;
				working = mergePaperGradeResponse(working, response);
				session = working;
				persist(working);
			}
			working = { ...working, status: 'complete', updatedAt: Date.now() };
			session = working;
			persist(working);
		} catch (error) {
			console.error('[full-paper-sitting] grading failed', error);
			// A streamed question can persist some part results before reporting
			// a later part failure. Conservatively latch one snapshot refresh.
			if (streamStarted) snapshotWasMutated = true;
			submitFailure = classifyRequestFailure(error, {
				action: 'finish checking this paper',
				serverLabel: 'The answer checker',
				streamStarted
			});
		} finally {
			if (snapshotWasMutated) markHomeSnapshotDirty();
			streamPhase = 'idle';
			currentGradingRef = '';
		}
	}

	async function finishOrContinue({
		allowExpired = false,
		confirmUnanswered = true
	}: { allowExpired?: boolean; confirmUnanswered?: boolean } = {}) {
		if (!session || authorizationBlocked || isSubmitting || session.status === 'complete') return;
		if (session.status === 'in_progress') {
			const initiallyExpired = paperSittingNeedsDeadlineSubmission(session, durationMinutes);
			if ((initiallyExpired && !allowExpired) || (!initiallyExpired && !canSubmit)) return;
			if (!initiallyExpired && confirmUnanswered && progress.unanswered > 0) {
				streamPhase = 'submitting';
				submitFailure = null;
				try {
					await flushDraftSaves();
				} catch (error) {
					console.error('[full-paper-sitting] pre-confirmation draft save failed', error);
					submitFailure = classifyRequestFailure(error, {
						action: 'save this paper before submission',
						serverLabel: 'The paper sitting service'
					});
					streamPhase = 'idle';
					return;
				}
				streamPhase = 'idle';
			}
			if (
				confirmUnanswered &&
				progress.unanswered > 0 &&
				!window.confirm(
					`${progress.unanswered} answer${progress.unanswered === 1 ? ' is' : 's are'} still blank. Finish the paper anyway?`
				)
			) {
				return;
			}
			let expired = paperSittingNeedsDeadlineSubmission(session, durationMinutes);
			if (expired) {
				deadlineSubmissionStartedFor = session.sessionId;
				integrityNotice = 'Time is up. Your answers are locked and are being submitted now.';
			}
			streamPhase = 'submitting';
			submitFailure = null;
			try {
				try {
					await flushDraftSaves();
				} catch (error) {
					expired = paperSittingNeedsDeadlineSubmission(session, durationMinutes);
					if (!expired) throw error;
					console.error(
						'[full-paper-sitting] final draft save failed after the deadline; locking the last server draft',
						error
					);
				}
				const activeSession = session;
				if (!activeSession || activeSession.status !== 'in_progress') {
					throw new InterruptedRequestError('The local paper sitting changed during submission.');
				}
				const submitted = (await postSittingSession({
					action: 'submit',
					sessionId: activeSession.sessionId,
					nonce: activeSession.nonce
				})) as ServerSittingView;
				if (
					submitted.status === 'in_progress' ||
					submitted.submittedAtMs === null ||
					submitted.startedAtMs !== activeSession.startedAt
				) {
					throw new InterruptedRequestError('The server did not lock this paper submission.');
				}
				const closedSession = submitPaperSitting(
					{
						...activeSession,
						answers: submitted.answers,
						draftRevision: submitted.draftRevision,
						gradedQuestionRefs: submitted.gradedQuestionRefs,
						results: submitted.results
					},
					submitted.submittedAtMs
				);
				const lockedSession: StoredPaperSitting = {
					...closedSession,
					status: submitted.status === 'complete' ? 'complete' : 'grading',
					submittedAt: submitted.submittedAtMs,
					updatedAt: Date.now()
				};
				session = lockedSession;
				persist(lockedSession);
			} catch (error) {
				console.error('[full-paper-sitting] submission failed', error);
				submitFailure = classifyRequestFailure(error, {
					action: 'submit this paper',
					serverLabel: 'The paper sitting service'
				});
				streamPhase = 'idle';
				return;
			}
			streamPhase = 'idle';
		}
		if (session?.status === 'grading') await runGrading();
	}

	function finishManually() {
		void finishOrContinue();
	}

	function retryFinish() {
		void finishOrContinue({
			allowExpired: Boolean(
				session && paperSittingNeedsDeadlineSubmission(session, durationMinutes)
			),
			confirmUnanswered: false
		});
	}

	function hideGrade(ref: string) {
		hiddenResultRefs = [...new Set([...hiddenResultRefs, ref])];
	}

	function startAgain() {
		if (!window.confirm('Start a new sitting? This replaces the saved sitting on this browser.')) {
			return;
		}
		window.localStorage.removeItem(storageKey);
		if (draftSaveTimer !== null) window.clearTimeout(draftSaveTimer);
		draftSaveTimer = null;
		pendingDraft = null;
		hiddenResultRefs = [];
		submitFailure = null;
		deadlineSubmissionStartedFor = null;
		authorizationBlocked = false;
		savedSnapshotUnreadable = false;
		integrityNotice = '';
		session = null;
	}

	function formatClock(milliseconds: number) {
		const seconds = Math.floor(Math.abs(milliseconds) / 1_000);
		const hours = Math.floor(seconds / 3_600);
		const minutes = Math.floor((seconds % 3_600) / 60);
		const remainingSeconds = seconds % 60;
		return hours > 0
			? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
			: `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
	}

	$effect(() => {
		if (
			!mounted ||
			!session ||
			authorizationBlocked ||
			!paperSittingNeedsDeadlineSubmission(session, durationMinutes, now) ||
			deadlineSubmissionStartedFor === session.sessionId
		)
			return;
		deadlineSubmissionStartedFor = session.sessionId;
		integrityNotice = 'Time is up. Your answers are locked and are being submitted now.';
		void finishOrContinue({ allowExpired: true, confirmUnanswered: false });
	});

	onMount(() => {
		let cancelled = false;
		const interval = window.setInterval(() => (now = Date.now()), 1_000);
		const flushBeforeSuspension = () => {
			if (!pendingDraft) return;
			void flushDraftSaves(true).catch((error) =>
				console.error('[full-paper-sitting] lifecycle draft flush failed', error)
			);
		};
		const flushWhenHidden = () => {
			if (document.visibilityState === 'hidden') flushBeforeSuspension();
		};
		window.addEventListener('pagehide', flushBeforeSuspension);
		document.addEventListener('visibilitychange', flushWhenHidden);
		void (async () => {
			try {
				const raw = window.localStorage.getItem(storageKey);
				const restored = parseStoredPaperSitting(raw, {
					paper,
					userId,
					readinessReviewedAt: reviewedAt,
					recoveryMode: true
				});
				if (raw && !restored && !cancelled) {
					savedSnapshotUnreadable = true;
					storageWarning =
						'This browser has saved paper data that it cannot safely open. It has not been deleted; choose Start again only when you are ready to replace it.';
				}
				if (restored) {
					try {
						const server = (await postSittingSession({
							action: 'resume',
							sessionId: restored.sessionId,
							nonce: restored.nonce
						})) as ServerSittingView;
						if (
							server.startedAtMs !== restored.startedAt ||
							server.reviewedAt !== restored.readinessReviewedAt
						) {
							throw new InterruptedRequestError('The saved sitting no longer matches the review.');
						}
						const localDraftIsAhead =
							server.status === 'in_progress' && restored.draftRevision > server.draftRevision;
						const synced: StoredPaperSitting = {
							...restored,
							status:
								server.status === 'in_progress'
									? 'in_progress'
									: server.status === 'complete'
										? 'complete'
										: 'grading',
							submittedAt: server.submittedAtMs,
							answers: localDraftIsAhead ? restored.answers : server.answers,
							draftRevision: localDraftIsAhead ? restored.draftRevision : server.draftRevision,
							gradedQuestionRefs: server.gradedQuestionRefs,
							results: server.results,
							activePartRef: server.status === 'in_progress' ? restored.activePartRef : null,
							activePartStartedAt:
								server.status === 'in_progress' ? restored.activePartStartedAt : null,
							updatedAt: Date.now()
						};
						if (!cancelled) {
							authorizationBlocked = false;
							session = synced;
							persist(synced);
							if (localDraftIsAhead) queueDraftSave(synced);
						}
					} catch (error) {
						console.error('[full-paper-sitting] resume verification failed', error);
						if (!cancelled) {
							if (error instanceof ResponseRequestError && error.status === 409) {
								session = restored;
								authorizationBlocked = true;
								submitFailure = null;
								integrityNotice =
									'This saved sitting can no longer be resumed or checked. Your answers remain here read-only until you choose Start again.';
							} else {
								session = restored;
								authorizationBlocked = false;
								storageWarning =
									'The server could not verify this saved sitting yet. It will be checked again before submission.';
							}
						}
					}
				}
			} catch {
				storageWarning =
					'This browser cannot read saved paper progress. Keep this tab open until you finish.';
			} finally {
				if (!cancelled) mounted = true;
			}
		})();
		return () => {
			cancelled = true;
			window.clearInterval(interval);
			window.removeEventListener('pagehide', flushBeforeSuspension);
			document.removeEventListener('visibilitychange', flushWhenHidden);
			if (draftSaveTimer !== null) window.clearTimeout(draftSaveTimer);
		};
	});
</script>

<div class="full-paper-shell">
	{#if !mounted}
		<div class="sitting-loading" aria-live="polite">Loading saved paper...</div>
	{:else if !session}
		<section class="sitting-start" aria-labelledby="sitting-start-title">
			<p class="eyebrow">Full paper sitting</p>
			<h1 id="sitting-start-title">{paper.title}</h1>
			<p>
				This is the complete reviewed online paper. The timer starts when you press start and keeps
				running if you reload or close this tab.
			</p>
			<dl>
				<div>
					<dt>Time</dt>
					<dd>{durationMinutes} minutes</dd>
				</div>
				<div>
					<dt>Marks</dt>
					<dd>{totalMarks}</dd>
				</div>
				<div>
					<dt>Questions</dt>
					<dd>{paper.questions.length}</dd>
				</div>
			</dl>
			<p class="save-note">
				Answers and timing are saved on this browser for this signed-in account.
			</p>
			{#if submitFailure && !savedSnapshotUnreadable}
				<RequestFailureNotice
					failure={submitFailure}
					onRetry={startPaper}
					retrying={isSubmitting}
					retryLabel="Try starting again"
					compact
				/>
			{/if}
			{#if savedSnapshotUnreadable}
				<button type="button" class="secondary-button" onclick={startAgain}>
					Discard saved data and start again
				</button>
			{:else}
				<button type="button" onclick={startPaper} disabled={isSubmitting}>
					{isSubmitting ? 'Starting paper...' : 'Start paper'}
				</button>
			{/if}
		</section>
	{:else}
		<div
			class="full-paper-sitting qc-test-taking-view"
			role="group"
			aria-label="Full paper sitting"
			oncopy={(event) => event.preventDefault()}
			oncut={(event) => event.preventDefault()}
			onpaste={blockExternalInput}
			ondrop={blockExternalInput}
			onbeforeinput={blockExternalBeforeInput}
		>
			<section class="sitting-dashboard" aria-label="Paper sitting status">
				<div class="sitting-status-line">
					<div>
						<p class="eyebrow">
							{authorizationBlocked
								? 'Saved paper'
								: session.status === 'complete'
									? 'Paper result'
									: session.status === 'grading'
										? 'Paper submitted'
										: 'Full paper sitting'}
						</p>
						{#if authorizationBlocked}
							<h1>Saved paper — read only</h1>
							<p>
								This sitting is no longer authorized, so it cannot be edited, submitted or checked.
								Your saved answers are still shown below.
							</p>
						{:else if session.status === 'complete'}
							<h1>{gradeSummary.awardedMarks}/{gradeSummary.totalMarks} marks</h1>
							<p>
								{gradeSummary.percent}% · completed in {formatClock(elapsedMs)}. This is this
								paper's score, not a qualification-grade prediction.
							</p>
							{#if gradeSummary.ungradedMarks > 0}
								<p class="warning-copy">
									{gradeSummary.ungradedMarks} mark{gradeSummary.ungradedMarks === 1 ? '' : 's'} could
									not be checked automatically.
								</p>
							{/if}
						{:else if session.status === 'grading'}
							<h1>Checking your paper</h1>
							<p>
								{session.gradedQuestionRefs.length}/{paper.questions.length} question groups checked.
								Your submitted answers are locked.
							</p>
						{:else if deadlineReached}
							<h1>Time is up</h1>
							<p>Answers locked · {formatClock(durationMinutes * 60_000)} allowed</p>
						{:else}
							<h1>{formatClock(remainingMs)}</h1>
							<p>Time remaining · {formatClock(elapsedMs)} elapsed</p>
						{/if}
					</div>
					<div class="progress-copy">
						<strong>{progress.answered}/{progress.total}</strong>
						<span>answers started</span>
					</div>
				</div>

				{#if session.status !== 'complete'}
					{#if integrityNotice}
						<p class="warning-copy" role="status">{integrityNotice}</p>
					{/if}
					<div class="progress-track" aria-hidden="true">
						<span
							style={`width: ${progress.total ? (progress.answered / progress.total) * 100 : 0}%`}
						></span>
					</div>
				{/if}

				<nav class="question-navigator" aria-label="Paper questions">
					{#each progress.questionProgress as question (question.ref)}
						{@const targetRef =
							paper.questions
								.find((candidate) => candidate.ref === question.ref)
								?.parts.find((part) => answerablePartRefs.has(part.ref))?.ref ?? question.ref}
						<a
							href={`#${targetRef}`}
							class:complete={question.complete}
							aria-label={`Question ${question.ref}: ${question.answered} of ${question.total} answers started`}
							onclick={() => activatePart(targetRef)}
						>
							{question.ref}<span>{question.answered}/{question.total}</span>
						</a>
					{/each}
				</nav>

				{#if overlongRefs.length > 0 && session.status === 'in_progress'}
					<p class="warning-copy">
						Question {overlongRefs.join(', ')} exceeds the 5,000-character checking limit. Shorten it
						before finishing.
					</p>
				{/if}
				{#if storageWarning}<p class="warning-copy">{storageWarning}</p>{/if}
				{#if draftWarning}<p class="warning-copy">{draftWarning}</p>{/if}
				{#if submitFailure}
					<RequestFailureNotice
						failure={submitFailure}
						onRetry={retryFinish}
						retrying={isSubmitting}
						retryLabel={deadlineReached ? 'Retry locked submission' : 'Continue checking'}
						compact
					/>
				{/if}
				{#if session.status === 'complete' || authorizationBlocked}
					<button type="button" class="secondary-button" onclick={startAgain}
						>{authorizationBlocked ? 'Start again' : 'Start another sitting'}</button
					>
				{/if}
			</section>

			<ExamPaper
				{paper}
				answers={session.answers}
				gradingResults={visibleGradeResults}
				readOnly={authorizationBlocked || session.status !== 'in_progress' || deadlineReached}
				{canSubmit}
				{isSubmitting}
				{submitLabel}
				onAnswerChange={setAnswer}
				onPartActivate={activatePart}
				onDismissGrade={hideGrade}
				onSubmitGrade={session.status === 'complete' || authorizationBlocked
					? undefined
					: finishManually}
				onRetrySubmit={retryFinish}
			/>

			{#if authorizationBlocked && (orphanAnswers.length > 0 || orphanResults.length > 0)}
				<section class="recovery-panel" aria-labelledby="recovery-panel-title">
					<p class="eyebrow">Earlier paper version</p>
					<h2 id="recovery-panel-title">Saved answers no longer present in this paper</h2>
					<p>
						These entries are kept exactly for recovery. They cannot be submitted or checked against
						the current paper.
					</p>
					{#each orphanAnswers as [ref, answer] (ref)}
						<article>
							<h3>Question {ref}</h3>
							<pre>{answer}</pre>
						</article>
					{/each}
					{#each orphanResults as [ref, result] (ref)}
						<article>
							<h3>Saved result for {ref}</h3>
							<p>{result.summary}</p>
							{#if result.awardedMarks !== null}
								<p>{result.awardedMarks}/{result.maxMarks} marks</p>
							{/if}
						</article>
					{/each}
				</section>
			{/if}
		</div>
	{/if}
</div>

<style>
	.full-paper-shell {
		display: flex;
		min-height: var(--app-viewport-height, 100vh);
		flex-direction: column;
		background: var(--qc-ui-canvas);
		color: var(--qc-ui-text);
	}

	.full-paper-sitting {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
		flex-direction: column;
		background: var(--qc-ui-canvas);
		color: var(--qc-ui-text);
	}

	.sitting-loading,
	.sitting-start,
	.sitting-dashboard {
		box-sizing: border-box;
		width: min(calc(100% - 2rem), 900px);
		margin: 1rem auto 0;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
	}

	.sitting-loading {
		padding: 1rem;
	}

	.sitting-start {
		padding: clamp(1.2rem, 4vw, 2.2rem);
	}

	.sitting-start h1,
	.sitting-dashboard h1,
	.sitting-start p,
	.sitting-dashboard p {
		margin: 0;
	}

	.sitting-start h1,
	.sitting-dashboard h1 {
		margin-top: 0.25rem;
		font-size: clamp(1.35rem, 3vw, 2rem);
		line-height: 1.1;
	}

	.sitting-start > p:not(.eyebrow),
	.sitting-dashboard h1 + p {
		margin-top: 0.7rem;
		max-width: 52rem;
		color: var(--qc-ui-text-secondary);
		line-height: 1.5;
	}

	.eyebrow {
		color: var(--qc-ui-accent-text);
		font-size: 0.77rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.sitting-start dl {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 1.2rem 0;
	}

	.sitting-start dl div {
		min-width: 8rem;
		border-left: 2px solid var(--qc-ui-accent);
		padding-left: 0.65rem;
	}

	.sitting-start dt {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		text-transform: uppercase;
	}

	.sitting-start dd {
		margin: 0.18rem 0 0;
		font-weight: 750;
	}

	.sitting-start button,
	.secondary-button {
		margin-top: 1.15rem;
		border: 0;
		border-radius: 0.35rem;
		padding: 0.72rem 1rem;
		background: var(--qc-ui-accent);
		color: var(--qc-ui-on-accent);
		font: inherit;
		font-weight: 750;
		cursor: pointer;
	}

	.recovery-panel {
		box-sizing: border-box;
		width: min(calc(100% - 2rem), 900px);
		margin: 1rem auto;
		border: 1px solid var(--qc-ui-warning-border, var(--qc-ui-border));
		padding: 1rem;
		background: var(--qc-ui-surface-raised);
	}

	.recovery-panel h2,
	.recovery-panel h3,
	.recovery-panel p {
		margin: 0;
	}

	.recovery-panel h2 {
		margin-top: 0.25rem;
		font-size: 1.15rem;
	}

	.recovery-panel > p:not(.eyebrow),
	.recovery-panel article {
		margin-top: 0.75rem;
	}

	.recovery-panel article {
		border-top: 1px solid var(--qc-ui-border-subtle);
		padding-top: 0.75rem;
	}

	.recovery-panel pre {
		margin: 0.45rem 0 0;
		white-space: pre-wrap;
		word-break: break-word;
		font: inherit;
	}

	.save-note {
		font-size: 0.88rem;
	}

	.sitting-dashboard {
		position: sticky;
		top: 0;
		z-index: 12;
		padding: 0.9rem 1rem;
		box-shadow: 0 0.5rem 1.5rem var(--qc-ui-shadow);
	}

	.sitting-status-line {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
		justify-content: space-between;
	}

	.progress-copy {
		display: grid;
		flex: 0 0 auto;
		text-align: right;
	}

	.progress-copy strong {
		font-size: 1.15rem;
	}

	.progress-copy span {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
	}

	.progress-track {
		height: 0.28rem;
		margin-top: 0.8rem;
		overflow: hidden;
		background: var(--qc-ui-surface-muted);
	}

	.progress-track span {
		display: block;
		height: 100%;
		background: var(--qc-ui-accent);
		transition: width 160ms ease;
	}

	.question-navigator {
		display: flex;
		gap: 0.35rem;
		margin-top: 0.8rem;
		overflow-x: auto;
		padding-bottom: 0.15rem;
	}

	.question-navigator a {
		display: inline-flex;
		flex: 0 0 auto;
		gap: 0.35rem;
		align-items: center;
		border: 1px solid var(--qc-ui-border-subtle);
		padding: 0.3rem 0.48rem;
		background: var(--qc-ui-surface);
		color: var(--qc-ui-text);
		font-size: 0.8rem;
		text-decoration: none;
	}

	.question-navigator a.complete {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	.question-navigator span {
		color: var(--qc-ui-text-muted);
		font-size: 0.7rem;
	}

	.warning-copy {
		margin-top: 0.7rem !important;
		color: var(--qc-ui-warning-text) !important;
		font-size: 0.86rem;
	}

	.secondary-button {
		border: 1px solid var(--qc-ui-border);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text);
	}

	@media (max-width: 600px) {
		.sitting-start,
		.sitting-dashboard,
		.sitting-loading {
			width: calc(100% - 0.8rem);
		}

		.recovery-panel {
			width: calc(100% - 0.8rem);
		}

		.sitting-dashboard {
			padding: 0.75rem;
		}

		.sitting-status-line {
			gap: 0.6rem;
		}
	}
</style>
