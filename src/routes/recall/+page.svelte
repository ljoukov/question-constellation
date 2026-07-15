<script lang="ts">
	import { browser } from '$app/environment';
	import { goto, pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { authStartHref } from '$lib/authReturn';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import RequestFailureNotice from '$lib/components/RequestFailureNotice.svelte';
	import ControlSection from '$lib/components/ui/ControlSection.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { createActivityId, responseDurationMs } from '$lib/learning/activityTiming';
	import { safeInternalReturnPath } from '$lib/navigation/returnPath';
	import type {
		RecallCard,
		RecallCardKind,
		RecallSubject,
		RecallTopic
	} from '$lib/recall/aqaScienceRecall';
	import {
		readRecallSession,
		recallSessionStorageKey,
		type RecallSessionScope,
		type StoredRecallSession
	} from '$lib/recall/sessionState';
	import {
		mixedRecallPresentation,
		recallControlModel,
		recallReviewDecision,
		type RecallMcqFeedback,
		type RecallPresentation,
		type RecallReviewIntent
	} from '$lib/recall/sessionControls';
	import {
		flushRecallReviewQueue,
		queueRecallReview,
		type RecallReviewFlushResult
	} from '$lib/recallReviewSync';
	import type { RequestFailure } from '$lib/requestFailure';
	import {
		ArrowRight,
		Brain,
		CheckCircle2,
		CircleX,
		Eye,
		Layers3,
		RotateCcw,
		Shuffle,
		Target,
		X
	} from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';

	type Mode = 'mixed' | 'recall' | 'recognise' | 'reverse';
	type Grade = 'again' | 'hard' | 'good' | 'easy';
	type SubjectFilter = RecallSubject | 'All subjects';
	type KindFilter = RecallCardKind | 'all';
	type CardMotion =
		| 'idle'
		| 'entering'
		| 'dragging'
		| 'returning'
		| 'flipping'
		| 'answering'
		| 'exiting-left'
		| 'exiting-right';

	type RecallProgress = {
		seen: number;
		correct: number;
		streak: number;
		intervalDays: number;
		dueAt: number;
		lastGrade: Grade;
		lastSeenAt: number;
		wrongChoices: Record<string, number>;
	};

	let {
		data
	}: {
		data: {
			cards: RecallCard[];
			kindLabels: Record<RecallCardKind, string>;
			subjects: readonly SubjectFilter[];
			topics: RecallTopic[];
			initialSubject: string;
			initialTopic: string;
			initialKind: string;
			initialMode: string;
			initialActivity: string;
			initialSearch: string;
			initialSize: string;
			initialStart: boolean;
			initialReturnTo: string;
			serverProgress: Array<{
				cardId: string;
				lastGrade: string;
				seenCount: number;
				correctCount: number;
				intervalDays: number;
				dueAt: string;
				updatedAt: string;
			}>;
			user: { uid: string; email: string; name: string | null; photoUrl: string | null } | null;
		};
	} = $props();

	const storageKey = untrack(
		() => `question-constellation.recall-progress.v2:${data.user?.uid ?? 'anonymous'}`
	);
	const sessionStorageKey = untrack(() => recallSessionStorageKey(data.user?.uid ?? 'anonymous'));
	const topicById = untrack(() => new Map(data.topics.map((topic) => [topic.id, topic])));
	const cardById = untrack(() => new Map(data.cards.map((card) => [card.id, card])));
	const subjectOptions = untrack(() => Array.from(data.subjects));
	const kindOptions = untrack(
		() => Object.entries(data.kindLabels) as Array<[RecallCardKind, string]>
	);
	const returnToHref = untrack(() => safeInternalReturnPath(data.initialReturnTo) ?? '/');
	const modeOptions: Array<{ value: Mode; label: string; icon: typeof Brain }> = [
		{ value: 'mixed', label: 'Quick recall', icon: Layers3 },
		{ value: 'recall', label: 'Flashcards', icon: Brain },
		{ value: 'recognise', label: 'Multiple choice', icon: Target },
		{ value: 'reverse', label: 'Reverse', icon: Shuffle }
	];
	const stackSizeOptions = [5, 8, 10, 15] as const;

	function validSubject(value: string): SubjectFilter {
		return subjectOptions.includes(value as SubjectFilter)
			? (value as SubjectFilter)
			: 'All subjects';
	}

	function validKind(value: string): KindFilter {
		if (value === 'all') return 'all';
		return kindOptions.some(([kind]) => kind === value) ? (value as RecallCardKind) : 'all';
	}

	function validMode(value: string): Mode {
		return modeOptions.some((option) => option.value === value) ? (value as Mode) : 'recall';
	}

	function validStackSize(value: string | number): number {
		const numeric = Number(value);
		return stackSizeOptions.includes(numeric as (typeof stackSizeOptions)[number]) ? numeric : 10;
	}

	function parseServerDate(value: string): number {
		const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
			? `${value.replace(' ', 'T')}Z`
			: value;
		const parsed = Date.parse(normalized);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	const initialSubject = untrack(() => validSubject(data.initialSubject));
	const initialTopic = untrack(() => data.initialTopic);
	const initialKind = untrack(() => validKind(data.initialKind));
	const initialSearch = untrack(() => data.initialSearch);
	const initialMode = untrack(() => validMode(data.initialMode));
	const initialStackSize = untrack(() => validStackSize(data.initialSize));
	const initialCardCount = untrack(
		() => filterCards(initialSubject, initialTopic, initialKind, initialSearch).length
	);
	const initialProgress = untrack(() => progressFromServer(data.serverProgress));
	const initialSessionCardIds = untrack(() =>
		data.initialStart
			? rankCards(
					filterCards(initialSubject, initialTopic, initialKind, initialSearch),
					initialProgress
				)
					.slice(0, Math.min(initialStackSize, initialCardCount))
					.map((card) => card.id)
			: []
	);

	let selectedSubject = $state<SubjectFilter>(initialSubject);
	let selectedTopic = $state(initialTopic);
	let selectedKind = $state<KindFilter>(initialKind);
	let searchQuery = $state(initialSearch);
	let mode = $state<Mode>(initialMode);
	let stackSize = $state(initialStackSize);
	let sessionActive = $state(untrack(() => data.initialStart && initialCardCount > 0));
	let sessionComplete = $state(false);
	let cardIndex = $state(0);
	let cardPositionInSession = $state(0);
	let reviewedInSession = $state(0);
	let rememberedInSession = $state(0);
	let returningSoonerInSession = $state(0);
	let revealed = $state(false);
	let selectedChoice = $state<string | null>(null);
	let mcqFeedback = $state<RecallMcqFeedback>(null);
	let progressById = $state<Record<string, RecallProgress>>(initialProgress);
	let sessionCardIds = $state<string[]>(initialSessionCardIds);
	let dragX = $state(0);
	let dragY = $state(0);
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let dragging = $state(false);
	let activePointerId = $state<number | null>(null);
	let cardMotion = $state<CardMotion>('idle');
	let motionTimer: ReturnType<typeof setTimeout> | null = null;
	let recallSyncFailure = $state<RequestFailure | null>(null);
	let recallSyncPendingCount = $state(0);
	let recallSyncing = $state(false);
	let reducedMotion = $state(false);
	let mcqResultHeading = $state<HTMLElement | null>(null);
	let flashcardResultHeading = $state<HTMLElement | null>(null);
	let currentPromptHeading = $state<HTMLHeadingElement | null>(null);
	let leavingSession = $state(false);
	let recallSyncPromise: Promise<void> | null = null;
	let sessionHydrated = $state(false);
	let recallSessionId = $state(
		untrack(() => (data.initialStart ? createActivityId('recall-session') : ''))
	);
	let cardStartedAt = $state(untrack(() => (data.initialStart ? Date.now() : 0)));

	const normalizedSearch = $derived(searchQuery.trim().toLowerCase());
	const availableTopics = $derived(
		data.topics.filter(
			(topic) => selectedSubject === 'All subjects' || topic.subject === selectedSubject
		)
	);
	const filteredCards = $derived(
		filterCards(selectedSubject, selectedTopic, selectedKind, searchQuery)
	);
	const rankedCards = $derived(rankCards(filteredCards, progressById));
	const sessionCards = $derived(
		sessionCardIds.map((id) => cardById.get(id)).filter((card): card is RecallCard => Boolean(card))
	);
	const currentCard = $derived((sessionActive ? sessionCards : rankedCards)[cardIndex] ?? null);
	const currentTopic = $derived(currentCard ? topicById.get(currentCard.topicId) : null);
	const nextCard = $derived((sessionActive ? sessionCards : rankedCards)[cardIndex + 1] ?? null);
	const followingCard = $derived(
		(sessionActive ? sessionCards : rankedCards)[cardIndex + 2] ?? null
	);
	const currentChoices = $derived(currentCard ? answerChoices(currentCard) : []);
	const currentPresentation = $derived<RecallPresentation>(
		currentCard ? presentationFor(currentCard) : 'flashcard'
	);
	const currentExplanation = $derived(currentCard ? explanationTextFor(currentCard) : null);
	const currentChoiceFeedback = $derived(
		currentCard && selectedChoice
			? (currentCard.choiceFeedback?.[selectedChoice]?.trim() ?? null)
			: null
	);
	const filteredCardCount = $derived(filteredCards.length);
	const totalCards = $derived(sessionActive ? sessionCards.length : filteredCardCount);
	const seenCount = $derived(filteredCards.filter((card) => progressById[card.id]?.seen).length);
	const dueCount = $derived(
		filteredCards.filter((card) => {
			const progress = progressById[card.id];
			return !progress || progress.dueAt <= Date.now();
		}).length
	);
	const steadyCount = $derived(
		filteredCards.filter((card) => {
			const progress = progressById[card.id];
			return (
				progress && ['good', 'easy'].includes(progress.lastGrade) && progress.intervalDays >= 1
			);
		}).length
	);
	const sessionProgress = $derived(
		totalCards === 0 ? '0%' : `${Math.min(100, (cardPositionInSession / totalCards) * 100)}%`
	);
	const currentControls = $derived(
		recallControlModel({
			presentation: currentPresentation,
			revealed,
			isLastCard: cardIndex + 1 >= sessionCards.length
		})
	);
	const activityLabel = $derived(
		mode === 'mixed' ? 'Quick recall' : mode === 'recognise' ? 'Multiple choice' : 'Flashcards'
	);
	const completionReturnLabel = $derived.by(() => {
		if (returnToHref.startsWith('/questions/')) return 'Back to question';
		if (returnToHref.startsWith('/gaps/')) return 'Back to gap';
		if (returnToHref.startsWith('/recall/')) return 'Choose another stack';
		if (returnToHref.startsWith('/subjects/')) {
			return selectedSubject === 'All subjects'
				? 'Back to subject'
				: `Continue in ${selectedSubject}`;
		}
		if (returnToHref === '/') return 'Back home';
		return 'Done';
	});
	const completionSummary = $derived.by(() => {
		if (reviewedInSession === 0) {
			return 'No cards were checked.';
		}
		return `${rememberedInSession} remembered · ${returningSoonerInSession} to repeat`;
	});
	const dragRotation = $derived(Math.max(-6, Math.min(6, dragX / 80)));
	const dragCue = $derived(!revealed || Math.abs(dragX) < 24 ? '' : dragX > 0 ? 'Next' : 'Repeat');
	const dragProgress = $derived(Math.min(1, Math.abs(dragX) / 140));
	const cardBusy = $derived(cardMotion !== 'idle' && cardMotion !== 'dragging');
	const slowMotion = $derived(page.url.searchParams.get('debugMotion') === 'slow');
	const sessionAnnouncement = $derived.by(() => {
		if (sessionComplete) return `Session complete. ${reviewedInSession} prompts checked.`;
		if (!currentCard) return '';
		if (!revealed) return `Card ${cardPositionInSession + 1} of ${totalCards}.`;
		if (currentPresentation === 'mcq') return '';
		return 'Answer shown.';
	});

	$effect(() => {
		if (selectedTopic === 'all') return;
		if (availableTopics.some((topic) => topic.id === selectedTopic)) return;
		selectedTopic = 'all';
		syncRecallUrl('replace', sessionActive);
	});

	$effect(() => {
		selectedSubject;
		selectedTopic;
		selectedKind;
		searchQuery;
		mode;
		if (!sessionActive) cardIndex = 0;
	});

	$effect(() => {
		const params = page.url.searchParams;
		const nextSubject = validSubject(params.get('subject') ?? 'All subjects');
		const nextTopic = params.get('topic') ?? 'all';
		const nextKind = validKind(params.get('kind') ?? 'all');
		const nextActivity = params.get('activity') === 'mcq' ? 'mcq' : 'flashcards';
		const nextMode = validMode(
			params.get('mode') ?? (nextActivity === 'mcq' ? 'recognise' : 'recall')
		);
		const nextSearch = params.get('q') ?? '';
		const nextStackSize = validStackSize(params.get('size') ?? '10');
		const nextSessionActive =
			params.get('start') === '1' &&
			filterCards(nextSubject, nextTopic, nextKind, nextSearch).length > 0;

		untrack(() => {
			if (selectedSubject !== nextSubject) selectedSubject = nextSubject;
			if (selectedTopic !== nextTopic) selectedTopic = nextTopic;
			if (selectedKind !== nextKind) selectedKind = nextKind;
			if (mode !== nextMode) mode = nextMode;
			if (stackSize !== nextStackSize) stackSize = nextStackSize;
			if (searchQuery !== nextSearch) searchQuery = nextSearch;
			if (sessionActive !== nextSessionActive) {
				if (nextSessionActive) {
					startSessionState();
				} else {
					quitSessionState();
				}
			}
		});
	});

	$effect(() => {
		if (!browser || !sessionHydrated || !sessionActive || sessionComplete) return;
		if (sessionCardIds.length === 0 || !recallSessionId) return;
		const snapshot: StoredRecallSession = {
			version: 1,
			scope: currentSessionScope(),
			cardIds: [...sessionCardIds],
			cardIndex,
			cardPositionInSession,
			reviewedInSession,
			rememberedInSession,
			returningSoonerInSession,
			revealed: revealed || selectedChoice !== null,
			selectedChoice,
			mcqFeedback,
			sessionId: recallSessionId,
			updatedAt: Date.now()
		};
		try {
			window.localStorage.setItem(sessionStorageKey, JSON.stringify(snapshot));
		} catch {
			// Recall still works when storage is unavailable.
		}
	});

	onMount(() => {
		let localProgress: Record<string, RecallProgress> = {};
		try {
			const raw = window.localStorage.getItem(storageKey);
			if (raw) localProgress = JSON.parse(raw) as Record<string, RecallProgress>;
		} catch {
			localProgress = {};
		}
		const merged = { ...localProgress };
		for (const remote of data.serverProgress) {
			const remoteSeenAt = parseServerDate(remote.updatedAt);
			const local = merged[remote.cardId];
			if (local && local.lastSeenAt > remoteSeenAt) continue;
			const grade = ['again', 'hard', 'good', 'easy'].includes(remote.lastGrade)
				? (remote.lastGrade as Grade)
				: 'again';
			merged[remote.cardId] = {
				seen: remote.seenCount,
				correct: remote.correctCount,
				streak: grade === 'again' ? 0 : Math.max(1, local?.streak ?? 1),
				intervalDays: remote.intervalDays,
				dueAt: parseServerDate(remote.dueAt),
				lastGrade: grade,
				lastSeenAt: remoteSeenAt,
				wrongChoices: local?.wrongChoices ?? {}
			};
		}
		progressById = merged;
		const eligibleCards = filterCards(selectedSubject, selectedTopic, selectedKind, searchQuery);
		let restoredSession: StoredRecallSession | null = null;
		if (data.initialStart && eligibleCards.length > 0) {
			try {
				restoredSession = readRecallSession(
					window.localStorage.getItem(sessionStorageKey),
					currentSessionScope(),
					new Set(eligibleCards.map((card) => card.id))
				);
			} catch {
				restoredSession = null;
			}
		}
		if (restoredSession) {
			sessionCardIds = restoredSession.cardIds;
			cardIndex = restoredSession.cardIndex;
			cardPositionInSession = restoredSession.cardPositionInSession;
			reviewedInSession = restoredSession.reviewedInSession;
			rememberedInSession = restoredSession.rememberedInSession;
			returningSoonerInSession = restoredSession.returningSoonerInSession;
			revealed = restoredSession.revealed;
			selectedChoice = restoredSession.selectedChoice;
			mcqFeedback = restoredSession.mcqFeedback;
			recallSessionId = restoredSession.sessionId;
			cardMotion = 'idle';
			cardStartedAt = Date.now();
		} else if (data.initialStart && eligibleCards.length > 0) {
			sessionCardIds = rankCards(eligibleCards, merged)
				.slice(0, Math.min(stackSize, eligibleCards.length))
				.map((card) => card.id);
			clearPersistedSession();
		}
		sessionHydrated = true;
		const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotionPreference = () => {
			reducedMotion = motionPreference.matches;
		};
		syncMotionPreference();
		motionPreference.addEventListener('change', syncMotionPreference);
		if (Object.keys(merged).length > 0) saveProgress(merged);
		if (data.user) void flushRecallSync();
		const retrySync = () => void flushRecallSync();
		window.addEventListener('online', retrySync);
		window.addEventListener('focus', retrySync);
		return () => {
			clearMotionTimer();
			motionPreference.removeEventListener('change', syncMotionPreference);
			window.removeEventListener('online', retrySync);
			window.removeEventListener('focus', retrySync);
		};
	});

	function flushRecallSync(): Promise<void> {
		if (!data.user) return Promise.resolve();
		if (recallSyncPromise) return recallSyncPromise;

		recallSyncing = true;
		recallSyncPromise = flushRecallReviewQueue(data.user.uid)
			.then((result: RecallReviewFlushResult) => {
				recallSyncFailure = result.failure;
				recallSyncPendingCount = result.pendingCount;
			})
			.finally(() => {
				recallSyncing = false;
				recallSyncPromise = null;
			});
		return recallSyncPromise;
	}

	function retryRecallSync() {
		if (recallSyncFailure?.kind === 'auth') {
			window.location.assign(
				authStartHref(`${window.location.pathname}${window.location.search}${window.location.hash}`)
			);
			return;
		}
		void flushRecallSync();
	}

	function clearMotionTimer() {
		if (!motionTimer) return;
		clearTimeout(motionTimer);
		motionTimer = null;
	}

	function afterMotion(delayMs: number, callback: () => void) {
		clearMotionTimer();
		motionTimer = setTimeout(() => {
			motionTimer = null;
			callback();
		}, motionMs(delayMs));
	}

	function motionMs(delayMs: number) {
		if (reducedMotion) return 0;
		return slowMotion ? delayMs * 4 : delayMs;
	}

	function progressFromServer(rows: typeof data.serverProgress): Record<string, RecallProgress> {
		const progress: Record<string, RecallProgress> = {};
		for (const remote of rows) {
			const grade = ['again', 'hard', 'good', 'easy'].includes(remote.lastGrade)
				? (remote.lastGrade as Grade)
				: 'again';
			progress[remote.cardId] = {
				seen: remote.seenCount,
				correct: remote.correctCount,
				streak: grade === 'again' ? 0 : 1,
				intervalDays: remote.intervalDays,
				dueAt: parseServerDate(remote.dueAt),
				lastGrade: grade,
				lastSeenAt: parseServerDate(remote.updatedAt),
				wrongChoices: {}
			};
		}
		return progress;
	}

	function rankCards(cards: RecallCard[], progress: Record<string, RecallProgress>) {
		return [...cards].sort((left, right) => {
			const leftProgress = progress[left.id];
			const rightProgress = progress[right.id];
			const leftDue = !leftProgress || leftProgress.dueAt <= Date.now();
			const rightDue = !rightProgress || rightProgress.dueAt <= Date.now();
			if (leftDue !== rightDue) return leftDue ? -1 : 1;
			return (leftProgress?.lastSeenAt ?? 0) - (rightProgress?.lastSeenAt ?? 0);
		});
	}

	function currentSessionScope(): RecallSessionScope {
		return {
			subject: selectedSubject,
			topic: selectedTopic,
			kind: selectedKind,
			mode,
			stackSize,
			search: searchQuery.trim(),
			returnTo: returnToHref
		};
	}

	function clearPersistedSession() {
		if (!browser) return;
		try {
			window.localStorage.removeItem(sessionStorageKey);
		} catch {
			// Recall still works when storage is unavailable.
		}
	}

	function topicFor(card: RecallCard) {
		return topicById.get(card.topicId);
	}

	function filterCards(subject: SubjectFilter, topicId: string, kind: KindFilter, search: string) {
		const normalized = search.trim().toLowerCase();
		return data.cards.filter((card) => {
			if (subject !== 'All subjects' && card.subject !== subject) return false;
			if (topicId !== 'all' && card.topicId !== topicId) return false;
			if (kind !== 'all' && card.kind !== kind) return false;
			if (!normalized) return true;
			const topic = topicById.get(card.topicId);
			const haystack = [
				card.front,
				card.back,
				card.reverseFront,
				card.reverseBack,
				card.subject,
				card.specRef,
				card.kind,
				topic?.title,
				topic?.specRef
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return normalized.split(/\s+/).every((term) => haystack.includes(term));
		});
	}

	function promptTextFor(card: RecallCard) {
		return mode === 'reverse' ? (card.reverseFront ?? card.back) : card.front;
	}

	function answerTextFor(card: RecallCard) {
		return mode === 'reverse' ? (card.reverseBack ?? card.front) : card.back;
	}

	function presentationFor(card: RecallCard): RecallPresentation {
		const hasMultipleChoiceOptions = answerChoices(card).length >= 2;
		if (mode === 'recognise') return hasMultipleChoiceOptions ? 'mcq' : 'flashcard';
		if (mode === 'mixed') {
			return mixedRecallPresentation(cardPositionInSession, hasMultipleChoiceOptions);
		}
		return 'flashcard';
	}

	function explanationTextFor(card: RecallCard): string | null {
		const explanation = card.explanation?.trim();
		return explanation || null;
	}

	function topicCardCount(topicId: string) {
		return data.cards.filter((card) => card.topicId === topicId).length;
	}

	function answerChoices(card: RecallCard) {
		const uniqueChoices: string[] = [];
		for (const choice of [card.back, ...(card.distractors ?? [])]) {
			const normalized = choice.trim();
			if (!normalized || uniqueChoices.includes(normalized)) continue;
			uniqueChoices.push(normalized);
		}
		const [answer, ...distractors] = uniqueChoices;
		const cappedChoices = [answer, ...distractors.slice(0, 3)].filter(Boolean);
		return seededShuffle(cappedChoices, hashString(card.id)).slice(0, 4);
	}

	function hashString(value: string) {
		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
		}
		return hash;
	}

	function seededShuffle<T>(items: T[], seed: number) {
		const next = [...items];
		let state = seed || 1;
		for (let index = next.length - 1; index > 0; index -= 1) {
			state = (state * 1664525 + 1013904223) >>> 0;
			const swapIndex = state % (index + 1);
			[next[index], next[swapIndex]] = [next[swapIndex], next[index]];
		}
		return next;
	}

	function startSessionState() {
		if (filteredCards.length === 0) return;
		recallSessionId = createActivityId('recall-session');
		sessionCardIds = rankedCards
			.slice(0, Math.min(stackSize, rankedCards.length))
			.map((card) => card.id);
		sessionActive = true;
		sessionComplete = false;
		cardIndex = 0;
		cardPositionInSession = 0;
		reviewedInSession = 0;
		rememberedInSession = 0;
		returningSoonerInSession = 0;
		resetCardState();
	}

	function quitSessionState() {
		clearPersistedSession();
		sessionActive = false;
		sessionCardIds = [];
		sessionComplete = false;
		cardIndex = 0;
		cardPositionInSession = 0;
		reviewedInSession = 0;
		rememberedInSession = 0;
		returningSoonerInSession = 0;
		recallSessionId = '';
		resetCardState();
	}

	function startSession() {
		startSessionState();
		syncRecallUrl('push', true);
		requestAnimationFrame(() => focusCurrentPrompt());
	}

	function focusCurrentPrompt() {
		requestAnimationFrame(() => currentPromptHeading?.focus({ preventScroll: true }));
	}

	async function exitSession() {
		if (leavingSession) return;
		leavingSession = true;
		clearPersistedSession();
		try {
			await flushRecallSync();
			await goto(returnToHref, { replaceState: true });
		} finally {
			leavingSession = false;
		}
	}

	function resetCardState(options?: { entering?: boolean }) {
		clearMotionTimer();
		revealed = false;
		selectedChoice = null;
		mcqFeedback = null;
		dragX = 0;
		dragY = 0;
		dragging = false;
		activePointerId = null;
		cardStartedAt = sessionActive && !sessionComplete ? Date.now() : 0;
		cardMotion = options?.entering ? 'entering' : 'idle';
		if (options?.entering) {
			afterMotion(360, () => {
				cardMotion = 'idle';
				focusCurrentPrompt();
			});
		}
	}

	function saveProgress(nextProgress: Record<string, RecallProgress>) {
		progressById = nextProgress;
		if (!browser) return;
		try {
			window.localStorage.setItem(storageKey, JSON.stringify(nextProgress));
		} catch {
			// Keep the active session usable when storage is unavailable.
		}
	}

	function gradeCard(card: RecallCard, grade: Grade, chosenAnswer?: string) {
		const now = Date.now();
		const previous = progressById[card.id];
		const wasCorrect = grade !== 'again';
		const previousInterval = previous?.intervalDays ?? 0;
		const intervalDays =
			grade === 'again'
				? 0
				: grade === 'hard'
					? Math.max(0.25, previousInterval * 1.2 || 0.25)
					: grade === 'good'
						? Math.max(1, previousInterval * 2 || 1)
						: Math.max(3, previousInterval * 3 || 3);
		const wrongChoices = { ...(previous?.wrongChoices ?? {}) };
		if (!wasCorrect && chosenAnswer) {
			wrongChoices[chosenAnswer] = (wrongChoices[chosenAnswer] ?? 0) + 1;
		}
		const dueDelay = grade === 'again' ? 1000 * 60 * 5 : intervalDays * 24 * 60 * 60 * 1000;

		saveProgress({
			...progressById,
			[card.id]: {
				seen: (previous?.seen ?? 0) + 1,
				correct: (previous?.correct ?? 0) + (wasCorrect ? 1 : 0),
				streak: wasCorrect ? (previous?.streak ?? 0) + 1 : 0,
				intervalDays,
				dueAt: now + dueDelay,
				lastGrade: grade,
				lastSeenAt: now,
				wrongChoices
			}
		});
		if (grade === 'again') returningSoonerInSession += 1;
		else rememberedInSession += 1;
		syncRecallReview(card, grade);
		advanceCard(true);
	}

	function syncRecallReview(card: RecallCard, grade: Grade) {
		if (!browser || !data.user) return;
		const reviewMode: Exclude<Mode, 'mixed'> =
			mode === 'mixed' ? (currentPresentation === 'mcq' ? 'recognise' : 'recall') : mode;
		queueRecallReview(data.user.uid, {
			cardId: card.id,
			grade,
			mode: reviewMode,
			sourceSessionId: recallSessionId || createActivityId('recall-session'),
			responseDurationMs: responseDurationMs(cardStartedAt)
		});
		void flushRecallSync().catch((error) => {
			console.warn('Recall review sync failed unexpectedly.', error);
		});
	}

	function chooseAnswer(card: RecallCard, choice: string) {
		if (selectedChoice || cardBusy || currentPresentation !== 'mcq') return;
		selectedChoice = choice;
		const isCorrect = choice === card.back;
		mcqFeedback = isCorrect ? 'correct' : 'incorrect';
		cardMotion = 'answering';
		afterMotion(560, () => {
			cardMotion = 'flipping';
			revealed = true;
			afterMotion(560, () => {
				cardMotion = 'idle';
				requestAnimationFrame(() => mcqResultHeading?.focus({ preventScroll: true }));
			});
		});
	}

	function revealCard() {
		if (!currentCard || revealed || currentPresentation === 'mcq' || cardBusy) return;
		dragging = false;
		activePointerId = null;
		dragX = 0;
		dragY = 0;
		cardMotion = 'flipping';
		revealed = true;
		afterMotion(560, () => {
			cardMotion = 'idle';
			requestAnimationFrame(() => flashcardResultHeading?.focus({ preventScroll: true }));
		});
	}

	function returnCard(afterReturn?: () => void) {
		dragging = false;
		activePointerId = null;
		dragX = 0;
		dragY = 0;
		cardMotion = 'returning';
		afterMotion(260, () => {
			cardMotion = 'idle';
			afterReturn?.();
		});
	}

	function exitCard(direction: 'left' | 'right', afterExit: () => void) {
		if (!currentCard || cardMotion === 'exiting-left' || cardMotion === 'exiting-right') return;
		const width = browser ? window.innerWidth : 420;
		dragging = false;
		activePointerId = null;
		dragX = direction === 'right' ? width * 1.18 : -width * 1.18;
		dragY = Math.max(-86, Math.min(86, dragY));
		cardMotion = direction === 'right' ? 'exiting-right' : 'exiting-left';
		afterMotion(360, afterExit);
	}

	function reviewCurrentCard(intent: RecallReviewIntent) {
		if (!currentCard || !revealed || cardBusy) return;
		const card = currentCard;
		const decision = recallReviewDecision({
			presentation: currentPresentation,
			mcqFeedback,
			intent
		});
		if (!decision) return;
		const chosenAnswer =
			currentPresentation === 'mcq' && mcqFeedback === 'incorrect'
				? (selectedChoice ?? undefined)
				: undefined;
		exitCard(decision.direction, () => gradeCard(card, decision.grade, chosenAnswer));
	}

	function advanceCard(countAsAnswered = false) {
		cardPositionInSession += 1;
		if (countAsAnswered) reviewedInSession += 1;
		if (cardIndex + 1 >= sessionCards.length) {
			sessionComplete = true;
			clearPersistedSession();
			resetCardState();
			return;
		}
		cardIndex += 1;
		resetCardState({ entering: true });
	}

	function handlePointerDown(event: PointerEvent) {
		if (!currentCard || sessionComplete || cardBusy || !revealed) {
			return;
		}
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		clearMotionTimer();
		activePointerId = event.pointerId;
		dragging = true;
		cardMotion = 'dragging';
		dragStartX = event.clientX;
		dragStartY = event.clientY;
		dragX = 0;
		dragY = 0;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!dragging || activePointerId !== event.pointerId) return;
		event.preventDefault();
		dragX = event.clientX - dragStartX;
		dragY = event.clientY - dragStartY;
	}

	function handlePointerUp(event: PointerEvent) {
		if (!dragging || activePointerId !== event.pointerId) return;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		} catch {
			// Pointer capture may already be released by the browser.
		}
		const direction = dragX > 0 ? 'right' : 'left';
		const shouldAct = Math.abs(dragX) > 92 && Math.abs(dragX) > Math.abs(dragY);
		dragging = false;
		activePointerId = null;
		if (shouldAct) {
			reviewCurrentCard(direction === 'right' ? 'next' : 'repeat');
		} else {
			returnCard();
		}
	}

	function handlePointerCancel(event: PointerEvent) {
		if (!dragging || activePointerId !== event.pointerId) return;
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		} catch {
			// Pointer capture may already be released by the browser.
		}
		returnCard();
	}

	function syncRecallUrl(
		historyMode: 'push' | 'replace' = 'replace',
		nextSessionActive = sessionActive
	) {
		if (!browser) return;
		const params = new URLSearchParams();
		if (searchQuery.trim()) params.set('q', searchQuery.trim());
		if (selectedSubject !== 'All subjects') params.set('subject', selectedSubject);
		if (selectedTopic !== 'all') params.set('topic', selectedTopic);
		if (selectedKind !== 'all') params.set('kind', selectedKind);
		params.set('activity', mode === 'recognise' ? 'mcq' : 'flashcards');
		params.set('size', String(stackSize));
		if (mode !== 'recall') params.set('mode', mode);
		if (nextSessionActive) params.set('start', '1');
		if (returnToHref !== '/') params.set('returnTo', returnToHref);
		const suffix = params.toString();
		const nextUrl = `${resolve('/recall')}${suffix ? `?${suffix}` : ''}`;
		const currentUrl = `${page.url.pathname}${page.url.search}${page.url.hash}`;
		if (nextUrl === currentUrl) return;
		if (historyMode === 'push') {
			pushState(nextUrl, page.state);
			return;
		}
		replaceState(nextUrl, page.state);
	}

	function updateSearch(value: string) {
		searchQuery = value;
		syncRecallUrl('replace');
	}

	function updateSubject(value: string) {
		selectedSubject = validSubject(value);
		syncRecallUrl('push');
	}

	function updateMode(value: Mode) {
		mode = value;
		syncRecallUrl('push');
	}

	function updateStackSize(value: number) {
		stackSize = validStackSize(value);
		syncRecallUrl('push');
	}

	function updateKind(value: KindFilter) {
		selectedKind = value;
		syncRecallUrl('push');
	}

	function updateTopic(value: string) {
		selectedTopic = value;
		syncRecallUrl('push');
	}

	function clearProgress() {
		saveProgress({});
	}
</script>

<svelte:head>
	<title>AQA Science Recall Practice | Question Constellation</title>
	<meta
		name="description"
		content="Practise compact AQA GCSE science recall cards for definitions, formulae, tests, units, and required practical facts."
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/recall" />
</svelte:head>

{#if sessionActive}
	<main class="recall-session" class:slow-motion={slowMotion} aria-label="Recall card session">
		<header class="session-header" class:complete={sessionComplete}>
			{#if !sessionComplete}
				<button
					type="button"
					class="session-icon-button"
					aria-label="Quit recall session"
					disabled={leavingSession}
					onclick={exitSession}
				>
					<X size={23} aria-hidden="true" strokeWidth={2.2} />
				</button>
			{/if}
			<div class="session-progress">
				<div class="session-progress-text">
					<strong>
						{sessionComplete
							? `${activityLabel} complete`
							: `${Math.min(cardPositionInSession + 1, totalCards)} of ${totalCards}`}
					</strong>
					<span>{sessionComplete ? selectedSubject : `${activityLabel} · ${selectedSubject}`}</span>
				</div>
				{#if !sessionComplete}
					<div class="session-progress-track" aria-hidden="true">
						<span style={`width: ${sessionProgress}`}></span>
					</div>
				{/if}
			</div>
		</header>
		<p class="sr-only" aria-live="polite" aria-atomic="true">{sessionAnnouncement}</p>

		{#if !sessionHydrated}
			<section class="session-resuming" aria-live="polite">
				<span class="session-resuming-mark" aria-hidden="true"></span>
				<p>Preparing your set…</p>
			</section>
		{:else if sessionComplete}
			<section class="session-complete">
				<span class="completion-mark" aria-hidden="true">
					<CheckCircle2 size={34} strokeWidth={2.2} />
				</span>
				<p class="recall-kicker">Set complete</p>
				<h1>
					{reviewedInSession}
					{reviewedInSession === 1 ? 'card' : 'cards'} done
				</h1>
				<p class="completion-outcome">{completionSummary}</p>
				<div class="session-complete-actions">
					<button
						type="button"
						class="session-primary"
						disabled={leavingSession}
						onclick={exitSession}
					>
						{completionReturnLabel}
					</button>
					<button
						type="button"
						class="session-secondary"
						disabled={leavingSession}
						onclick={startSession}
					>
						Another set
					</button>
				</div>
			</section>
		{:else if currentCard}
			<section
				class="card-stage"
				class:showing-result={currentPresentation === 'mcq' && revealed}
				class:flipping-stack={cardMotion === 'flipping'}
				class:moving-stack={['dragging', 'exiting-left', 'exiting-right'].includes(cardMotion)}
			>
				{#if followingCard}
					<article class="stack-card preview two" aria-hidden="true"></article>
				{/if}
				{#if nextCard}
					{@const topic = topicFor(nextCard)}
					<article class="stack-card preview one" aria-hidden="true">
						<div class="card-face front">
							<header class="card-meta">
								<span class="card-visual-cue" aria-hidden="true">{nextCard.visualCue}</span>
							</header>
							<section class="card-prompt">
								<p>{topic?.title ?? 'AQA Science'}</p>
								<h1><MathText text={promptTextFor(nextCard)} /></h1>
							</section>
						</div>
					</article>
				{/if}
				{#key currentCard.id}
					<article
						class="stack-card active"
						class:entering={cardMotion === 'entering'}
						class:dragging={cardMotion === 'dragging'}
						class:returning={cardMotion === 'returning'}
						class:answering={cardMotion === 'answering'}
						class:flipping={cardMotion === 'flipping'}
						class:revealed
						class:mcq-card={currentPresentation === 'mcq'}
						class:mcq-correct={mcqFeedback === 'correct'}
						class:mcq-incorrect={mcqFeedback === 'incorrect'}
						class:exiting-left={cardMotion === 'exiting-left'}
						class:exiting-right={cardMotion === 'exiting-right'}
						style={`--drag-x: ${dragX}px; --drag-y: ${dragY}px; --drag-rotate: ${dragRotation}deg; --drag-progress: ${dragProgress};`}
						onpointerdown={handlePointerDown}
						onpointermove={handlePointerMove}
						onpointerup={handlePointerUp}
						onpointercancel={handlePointerCancel}
					>
						{#if dragCue}
							<div class:positive={dragX > 0} class:negative={dragX < 0} class="drag-cue">
								{dragCue}
							</div>
						{/if}

						<div class="card-flipper">
							<div
								class="card-face front"
								class:mcq-front={currentPresentation === 'mcq'}
								aria-hidden={revealed}
								inert={revealed}
							>
								<header class="card-meta">
									<span class="card-visual-cue" aria-hidden="true">{currentCard.visualCue}</span>
									<span class="sr-only">Card type: {data.kindLabels[currentCard.kind]}.</span>
								</header>

								<section class="card-prompt">
									<p>{currentTopic?.title ?? 'AQA Science'}</p>
									<h1
										id={`recall-prompt-${currentCard.id}`}
										tabindex="-1"
										bind:this={currentPromptHeading}
									>
										<MathText text={promptTextFor(currentCard)} />
									</h1>
								</section>

								{#if currentPresentation === 'mcq'}
									<div
										class="choice-grid"
										role="group"
										aria-labelledby={`recall-prompt-${currentCard.id}`}
									>
										{#each currentChoices as choice (choice)}
											<button
												type="button"
												class:selected={selectedChoice === choice}
												class:correct={selectedChoice !== null && choice === currentCard.back}
												class:incorrect={selectedChoice === choice && choice !== currentCard.back}
												disabled={selectedChoice !== null || cardBusy}
												onclick={() => chooseAnswer(currentCard, choice)}
											>
												<MathText text={choice} />
											</button>
										{/each}
									</div>
								{:else}
									<button
										type="button"
										class="card-reveal-hitbox"
										tabindex="-1"
										aria-label="Reveal answer"
										disabled={revealed || cardBusy}
										onclick={revealCard}
									></button>
								{/if}
							</div>

							<div
								class="card-face back"
								class:mcq-result-face={currentPresentation === 'mcq'}
								aria-hidden={!revealed}
								inert={!revealed}
							>
								{#if currentPresentation === 'mcq'}
									<header
										class="mcq-result-status"
										class:correct={mcqFeedback === 'correct'}
										class:incorrect={mcqFeedback === 'incorrect'}
										tabindex="-1"
										aria-describedby={`mcq-answer-${currentCard.id}`}
										bind:this={mcqResultHeading}
									>
										<span class="mcq-result-icon" aria-hidden="true">
											{#if mcqFeedback === 'correct'}
												<CheckCircle2 size={25} strokeWidth={2.4} />
											{:else}
												<CircleX size={25} strokeWidth={2.4} />
											{/if}
										</span>
										<h1>{mcqFeedback === 'correct' ? 'That’s right' : 'Not quite'}</h1>
									</header>

									<section class="card-answer mcq-answer" aria-label="Answer feedback">
										<div class="mcq-key-answer" id={`mcq-answer-${currentCard.id}`}>
											<span>Answer</span>
											<strong><MathText text={answerTextFor(currentCard)} /></strong>
										</div>

										{#if currentExplanation}
											<div class="mcq-explanation">
												<p><MathText text={currentExplanation} /></p>
											</div>
										{/if}

										{#if selectedChoice && selectedChoice !== currentCard.back}
											<div class="mcq-choice-review">
												<span>Your choice</span>
												<strong><MathText text={selectedChoice} /></strong>
												{#if currentChoiceFeedback}
													<p><MathText text={currentChoiceFeedback} /></p>
												{/if}
											</div>
										{/if}
									</section>
								{:else}
									<header class="card-meta">
										<span class="card-visual-cue" aria-hidden="true">{currentCard.visualCue}</span>
										<span class="sr-only">Card type: {data.kindLabels[currentCard.kind]}.</span>
									</header>
									<section class="card-answer">
										<p tabindex="-1" bind:this={flashcardResultHeading}>Answer</p>
										<div>
											<MathText text={answerTextFor(currentCard)} />
										</div>
									</section>
								{/if}
							</div>
						</div>
					</article>
				{/key}
			</section>

			<footer
				class="session-actions"
				class:prompt-actions={currentControls.phase === 'prompt'}
				class:result-actions={currentControls.phase === 'result'}
			>
				{#if currentControls.phase === 'result'}
					<button
						type="button"
						class="session-secondary"
						disabled={cardBusy}
						aria-label="Repeat this card sooner"
						onclick={() => reviewCurrentCard('repeat')}
					>
						<RotateCcw size={18} aria-hidden="true" strokeWidth={2.2} />
						{currentControls.repeatLabel}
					</button>
					<button
						type="button"
						class="session-primary session-next"
						disabled={cardBusy}
						onclick={() => reviewCurrentCard('next')}
					>
						{currentControls.nextLabel}
						<ArrowRight size={18} aria-hidden="true" strokeWidth={2.2} />
					</button>
				{:else if currentControls.action === 'reveal'}
					<button type="button" class="session-primary" disabled={cardBusy} onclick={revealCard}>
						<Eye size={18} aria-hidden="true" strokeWidth={2.2} />
						{currentControls.label}
					</button>
				{:else}
					<button type="button" class="session-instruction" disabled>
						{currentControls.label}
					</button>
				{/if}
			</footer>
		{/if}
	</main>
{:else}
	<main class="recall-setup">
		<AppTopbar
			user={data.user}
			searchValue={searchQuery}
			searchPlaceholder="Search recall cards"
			onSearchChange={updateSearch}
		/>

		<section class="setup-shell" aria-label="Recall setup">
			<div class="setup-copy">
				<p class="recall-kicker">AQA GCSE Science</p>
				<h1>Recall cards</h1>
				<p>
					Practise the small facts, equations, tests, units, and practical hooks that one- and
					two-mark questions usually expect.
				</p>
				<div class="setup-stats" aria-label="Current recall stack">
					<div>
						<strong>{totalCards}</strong>
						<span>cards</span>
					</div>
					<div>
						<strong>{seenCount}</strong>
						<span>seen</span>
					</div>
					<div>
						<strong>{steadyCount}</strong>
						<span>steady</span>
					</div>
					<div>
						<strong>{dueCount}</strong>
						<span>due</span>
					</div>
				</div>
				<div class="setup-actions">
					<button
						type="button"
						class="setup-primary"
						disabled={totalCards === 0}
						onclick={startSession}
					>
						{totalCards === 0
							? 'No cards in this filter'
							: `Start ${Math.min(stackSize, totalCards)} cards`}
					</button>
					<button type="button" class="setup-secondary" onclick={clearProgress}
						>Clear progress</button
					>
				</div>
			</div>

			<div class="setup-panel">
				<ControlSection label="Subject">
					{#snippet icon()}
						<Brain size={17} aria-hidden="true" strokeWidth={2.2} />
					{/snippet}
					<select
						class="setup-select"
						value={selectedSubject}
						aria-label="Recall subject"
						onchange={(event) => updateSubject(event.currentTarget.value)}
					>
						{#each subjectOptions as option (option)}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</ControlSection>

				<ControlSection label="Mode">
					{#snippet icon()}
						<Brain size={17} aria-hidden="true" strokeWidth={2.2} />
					{/snippet}
					<div class="setup-segment">
						{#each modeOptions as option (option.value)}
							{@const ModeIcon = option.icon}
							<button
								type="button"
								class:active={mode === option.value}
								aria-pressed={mode === option.value}
								onclick={() => updateMode(option.value)}
							>
								<ModeIcon size={17} aria-hidden="true" strokeWidth={2.2} />
								{option.label}
							</button>
						{/each}
					</div>
				</ControlSection>

				<ControlSection label="Stack size">
					{#snippet icon()}
						<Target size={17} aria-hidden="true" strokeWidth={2.2} />
					{/snippet}
					<div class="setup-segment">
						{#each stackSizeOptions as size (size)}
							<button
								type="button"
								class:active={stackSize === size}
								aria-pressed={stackSize === size}
								onclick={() => updateStackSize(size)}
							>
								{size}
							</button>
						{/each}
					</div>
				</ControlSection>

				<ControlSection label="Type">
					{#snippet icon()}
						<Layers3 size={17} aria-hidden="true" strokeWidth={2.2} />
					{/snippet}
					<div class="setup-chip-grid">
						<button
							type="button"
							class:active={selectedKind === 'all'}
							aria-pressed={selectedKind === 'all'}
							onclick={() => updateKind('all')}
						>
							All
						</button>
						{#each kindOptions as [kind, label] (kind)}
							<button
								type="button"
								class:active={selectedKind === kind}
								aria-pressed={selectedKind === kind}
								onclick={() => updateKind(kind)}
							>
								{label}
							</button>
						{/each}
					</div>
				</ControlSection>

				<ControlSection label="Specification">
					{#snippet icon()}
						<Target size={17} aria-hidden="true" strokeWidth={2.2} />
					{/snippet}
					<select
						class="setup-select"
						value={selectedTopic}
						aria-label="Specification topic"
						onchange={(event) => updateTopic(event.currentTarget.value)}
					>
						<option value="all">All topics</option>
						{#each availableTopics as topic (topic.id)}
							<option value={topic.id}>
								{topic.specRef}
								{topic.title} ({topicCardCount(topic.id)})
							</option>
						{/each}
					</select>
				</ControlSection>
			</div>
		</section>
	</main>
{/if}

{#if recallSyncFailure}
	<div class="recall-sync-failure">
		<RequestFailureNotice
			failure={recallSyncFailure}
			onRetry={retryRecallSync}
			retrying={recallSyncing}
			retryLabel={recallSyncFailure.kind === 'auth'
				? 'Sign in again'
				: `Retry ${recallSyncPendingCount === 1 ? 'review' : `${recallSyncPendingCount} reviews`}`}
			compact
		/>
	</div>
{/if}

<style>
	.recall-sync-failure {
		position: fixed;
		z-index: 100;
		right: 1rem;
		bottom: max(1rem, env(safe-area-inset-bottom));
		width: min(31rem, calc(100vw - 2rem));
	}

	@media (max-width: 560px) {
		.recall-sync-failure {
			left: 0.75rem;
			right: 0.75rem;
			bottom: max(0.75rem, env(safe-area-inset-bottom));
			width: auto;
		}
	}

	.recall-setup,
	.recall-session {
		width: 100%;
		min-width: 0;
		min-height: var(--app-viewport-height, 100vh);
		background: var(--qc-app-surface);
		color: #0b1020;
	}

	.recall-kicker {
		margin: 0 0 0.55rem;
		color: #08602c;
		font-size: 0.82rem;
		font-weight: 860;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.setup-shell {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(20rem, 29rem);
		gap: 1rem;
		width: min(100%, 1160px);
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2rem);
	}

	.setup-copy,
	.setup-panel,
	.session-complete {
		border: 1px solid #d9e0ea;
		background: #ffffff;
		box-shadow: 0 5px 14px rgba(15, 23, 42, 0.035);
	}

	.setup-copy {
		display: grid;
		align-content: start;
		gap: 0.85rem;
		min-height: 0;
		padding: clamp(1rem, 2.4vw, 1.45rem);
	}

	.setup-copy h1 {
		max-width: 16ch;
		margin: 0;
		color: #050811;
		font-size: clamp(2rem, 4.2vw, 3.25rem);
		font-weight: 880;
		line-height: 1.02;
		letter-spacing: 0;
	}

	.setup-copy p:not(.recall-kicker) {
		max-width: 46rem;
		margin: 0;
		color: #465568;
		font-size: 1.02rem;
		line-height: 1.48;
	}

	.setup-stats {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0;
		border: 1px solid #d9e0ea;
	}

	.setup-stats div {
		display: grid;
		gap: 0.2rem;
		min-height: 4.4rem;
		padding: 0.75rem;
		border-right: 1px solid #d9e0ea;
		background: #ffffff;
	}

	.setup-stats div:last-child {
		border-right: 0;
	}

	.setup-stats strong {
		color: #050811;
		font-size: 1.55rem;
		line-height: 1;
	}

	.setup-stats span {
		color: #647085;
		font-size: 0.75rem;
		font-weight: 820;
		text-transform: uppercase;
	}

	.setup-actions,
	.session-complete-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: center;
	}

	.setup-primary,
	.setup-secondary,
	.session-primary,
	.session-secondary,
	.session-instruction {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		min-height: 3.15rem;
		padding: 0.72rem 1rem;
		border-radius: 0;
		font-size: 1rem;
		font-weight: 860;
		cursor: pointer;
	}

	.setup-primary,
	.session-primary {
		border: 0;
		background: linear-gradient(180deg, #08773b, #05642f);
		color: #ffffff;
		box-shadow: 0 10px 18px rgba(5, 100, 47, 0.14);
	}

	.setup-primary:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.setup-secondary,
	.session-secondary {
		border: 1.5px solid #0b57eb;
		background: #ffffff;
		color: #0b45d9;
	}

	.session-instruction {
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-muted);
		box-shadow: none;
		cursor: default;
	}

	.setup-panel {
		display: grid;
		gap: 0;
		align-content: start;
	}

	.setup-segment,
	.setup-chip-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.setup-segment button,
	.setup-chip-grid button,
	.setup-select {
		min-height: 2.45rem;
		border: 1px solid #cfd7e2;
		border-radius: 0;
		background: #ffffff;
		color: #172033;
		font: inherit;
		font-weight: 780;
	}

	.setup-segment button,
	.setup-chip-grid button {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.48rem 0.64rem;
		cursor: pointer;
	}

	.setup-segment button.active,
	.setup-chip-grid button.active {
		border-color: #08602c;
		background: #f4fbf5;
		color: #075323;
	}

	.setup-select {
		width: 100%;
		padding: 0 0.65rem;
	}

	.recall-session {
		position: fixed;
		inset: 0;
		z-index: 80;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		height: var(--app-viewport-height, 100dvh);
		min-height: 0;
		max-height: var(--app-viewport-height, 100dvh);
		overflow: hidden;
		touch-action: pan-y;
		--recall-card-enter-duration: 360ms;
		--recall-card-exit-duration: 360ms;
		--recall-card-return-duration: 220ms;
		--recall-flip-duration: 560ms;
		--recall-answer-duration: 560ms;
	}

	.recall-session.slow-motion {
		--recall-card-enter-duration: 1440ms;
		--recall-card-exit-duration: 1440ms;
		--recall-card-return-duration: 880ms;
		--recall-flip-duration: 2240ms;
		--recall-answer-duration: 2240ms;
	}

	.session-header {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.8rem;
		align-items: center;
		padding: max(0.75rem, env(safe-area-inset-top)) 1rem 0.75rem;
		border-bottom: 1px solid #d9e0ea;
		background: #ffffff;
	}

	.session-header.complete {
		grid-template-columns: minmax(0, 1fr);
	}

	.session-icon-button {
		display: inline-grid;
		width: 2.65rem;
		height: 2.65rem;
		place-items: center;
		border: 1px solid #d9e0ea;
		border-radius: 0;
		background: #ffffff;
		color: #0b1020;
		cursor: pointer;
	}

	.session-progress {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}

	.session-progress-text {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		color: #465568;
		font-size: 0.9rem;
	}

	.session-progress-text strong {
		color: #050811;
	}

	.session-progress-track {
		height: 0.55rem;
		border: 1px solid #cfd7e2;
		background: #ffffff;
	}

	.session-progress-track span {
		display: block;
		height: 100%;
		background: #08773b;
		transition: width 180ms ease;
	}

	.card-stage {
		position: relative;
		display: grid;
		place-items: center;
		min-height: 0;
		padding: clamp(1rem, 3vw, 2rem);
		overflow: hidden;
	}

	.stack-card {
		position: absolute;
		width: min(100%, 42rem);
		height: min(100%, 38rem);
		max-height: 100%;
		border: 1px solid #0b1020;
		background: #ffffff;
		box-shadow: 0 1.35rem 2.8rem rgba(15, 23, 42, 0.18);
		overflow: hidden;
	}

	.stack-card.preview {
		pointer-events: none;
		border-color: rgba(11, 16, 32, 0.18);
		background: rgba(255, 255, 255, 0.56);
		box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.04);
		opacity: 0.38;
		transition: opacity 180ms ease;
	}

	.stack-card.preview.one {
		z-index: 1;
		transform: translate(0.65rem, 0.65rem);
	}

	.stack-card.preview.two {
		z-index: 0;
		transform: translate(1.3rem, 1.3rem);
		opacity: 0.46;
	}

	.stack-card.preview.two {
		background: #f5f8fc;
	}

	.card-stage.moving-stack .stack-card.preview.one {
		opacity: 0.72;
	}

	.card-stage.flipping-stack .stack-card.preview {
		opacity: 0.18;
	}

	.card-stage.showing-result .stack-card.preview {
		opacity: 0;
	}

	.stack-card.preview .card-meta {
		opacity: 0.78;
	}

	.stack-card.active {
		position: relative;
		z-index: 2;
		border: 0;
		background: transparent;
		box-shadow: none;
		overflow: visible;
		user-select: none;
		touch-action: none;
		transform: translate(var(--drag-x), var(--drag-y)) rotate(var(--drag-rotate));
		transition:
			transform var(--recall-card-return-duration) cubic-bezier(0.22, 0.75, 0.25, 1),
			opacity var(--recall-card-return-duration) ease;
		will-change: transform, opacity;
		perspective: 1400px;
		-webkit-tap-highlight-color: transparent;
	}

	.stack-card.active.entering {
		animation: promote-card var(--recall-card-enter-duration) cubic-bezier(0.2, 0.76, 0.18, 1) both;
	}

	.stack-card.active.dragging {
		cursor: grabbing;
		transition: none;
	}

	.stack-card.active.mcq-card {
		touch-action: pan-y;
	}

	.stack-card.active.exiting-left,
	.stack-card.active.exiting-right {
		opacity: 0;
		transition:
			transform var(--recall-card-exit-duration) cubic-bezier(0.22, 0.75, 0.25, 1),
			opacity calc(var(--recall-card-exit-duration) * 0.78) ease;
	}

	@keyframes promote-card {
		from {
			opacity: 0.92;
			transform: translate(0.65rem, 0.65rem) rotate(0deg) scale(0.985);
		}

		to {
			opacity: 1;
			transform: translate(0, 0) rotate(0deg) scale(1);
		}
	}

	.card-flipper {
		position: relative;
		width: 100%;
		height: 100%;
		border: 1px solid #0b1020;
		background: #ffffff;
		box-shadow: 0 1.35rem 2.8rem rgba(15, 23, 42, 0.18);
		transform-style: preserve-3d;
		transform-origin: center center;
		transition: transform var(--recall-flip-duration) cubic-bezier(0.2, 0.72, 0.18, 1);
		will-change: transform;
	}

	.stack-card.active.mcq-card.answering.mcq-correct .card-flipper {
		animation: mcq-card-correct var(--recall-answer-duration) cubic-bezier(0.2, 0.76, 0.2, 1) both;
	}

	.stack-card.active.mcq-card.answering.mcq-incorrect .card-flipper {
		animation: mcq-card-incorrect var(--recall-answer-duration) cubic-bezier(0.25, 0.75, 0.25, 1)
			both;
	}

	.stack-card.active.revealed .card-flipper {
		transform: rotateY(-180deg);
	}

	.card-face {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: 1rem;
		padding: clamp(1rem, 3vw, 1.65rem);
		background: #ffffff;
		backface-visibility: hidden;
		-webkit-backface-visibility: hidden;
		transform-style: preserve-3d;
		overflow: hidden;
	}

	.card-face.mcq-front {
		grid-template-rows: auto auto auto;
		align-content: start;
		gap: clamp(0.85rem, 2.4vh, 1.35rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-color: var(--qc-ui-border-strong) transparent;
		scrollbar-gutter: stable;
		scrollbar-width: thin;
	}

	.card-face.mcq-front::-webkit-scrollbar {
		width: 0.4rem;
	}

	.card-face.mcq-front::-webkit-scrollbar-track {
		background: transparent;
	}

	.card-face.mcq-front::-webkit-scrollbar-thumb {
		background: var(--qc-ui-border-strong);
	}

	.card-face.back {
		transform: rotateY(180deg);
	}

	.card-reveal-hitbox {
		position: absolute;
		inset: 0;
		z-index: 2;
		border: 0;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}

	.stack-card.active.revealed .card-reveal-hitbox,
	.card-reveal-hitbox:disabled {
		pointer-events: none;
	}

	.card-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.42rem;
	}

	.card-meta .card-visual-cue {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3.45rem;
		height: 3.45rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
		font-size: 2.15rem;
		line-height: 1;
	}

	.card-prompt {
		display: grid;
		align-content: center;
		gap: 0.7rem;
		min-height: 0;
	}

	.card-prompt p,
	.card-answer p {
		margin: 0;
		color: #647085;
		font-size: 0.78rem;
		font-weight: 820;
		letter-spacing: 0.02em;
		text-transform: uppercase;
	}

	.card-prompt h1 {
		margin: 0;
		color: #050811;
		font-size: clamp(1.9rem, 4.8vw, 3.8rem);
		font-weight: 650;
		line-height: 1.18;
		letter-spacing: 0;
		overflow-wrap: anywhere;
	}

	.mcq-front .card-prompt {
		align-content: center;
		gap: 0.5rem;
	}

	.mcq-front .card-prompt h1 {
		max-width: 34ch;
		font-size: clamp(1.65rem, 3.8vw, 2.55rem);
		font-weight: 500;
		line-height: 1.32;
	}

	.card-answer {
		display: grid;
		gap: 0.38rem;
		align-content: center;
		min-height: 0;
		padding: clamp(1rem, 4vw, 1.3rem);
		border: 1px solid #08602c;
		background: #f8fcf8;
	}

	.card-answer:not(.mcq-answer) > div {
		color: #122316;
		font-size: clamp(1.2rem, 3.5vw, 2rem);
		font-weight: 760;
		line-height: 1.36;
		overflow-wrap: anywhere;
	}

	.card-answer.mcq-answer {
		border: 0;
		background: transparent;
		align-content: start;
		gap: 1rem;
		padding: 0 0.1rem 0.15rem 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		-webkit-overflow-scrolling: touch;
	}

	.card-face.mcq-result-face {
		grid-template-rows: auto minmax(0, 1fr);
		gap: 1rem;
		background: var(--qc-ui-surface-muted);
	}

	.mcq-result-status {
		display: flex;
		align-items: center;
		gap: 0.72rem;
		min-width: 0;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid var(--qc-ui-border-subtle);
		outline: none;
	}

	.mcq-result-icon {
		display: inline-grid;
		flex: 0 0 auto;
		width: 2.55rem;
		height: 2.55rem;
		place-items: center;
		border: 1px solid currentColor;
		border-radius: 999px;
	}

	.mcq-result-status.correct {
		color: var(--qc-ui-accent-text);
	}

	.mcq-result-status.correct .mcq-result-icon {
		background: var(--qc-ui-accent-muted);
	}

	.mcq-result-status.incorrect {
		color: var(--qc-ui-danger);
	}

	.mcq-result-status.incorrect .mcq-result-icon {
		background: color-mix(in srgb, var(--qc-ui-danger) 10%, var(--qc-ui-surface));
	}

	.mcq-key-answer > span,
	.mcq-choice-review > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		font-weight: 650;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.mcq-result-status h1 {
		margin: 0;
		color: currentColor;
		font-size: clamp(1.35rem, 3.8vw, 1.9rem);
		font-weight: 700;
		line-height: 1.15;
	}

	.mcq-key-answer,
	.mcq-explanation,
	.mcq-choice-review {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}

	.mcq-explanation p,
	.mcq-choice-review p {
		margin: 0;
		color: var(--qc-ui-text-secondary);
		font-size: clamp(1rem, 2vw, 1.08rem);
		font-weight: 450;
		line-height: 1.5;
		letter-spacing: 0;
		text-transform: none;
		overflow-wrap: anywhere;
	}

	.mcq-key-answer {
		padding: 0.2rem 0 0.2rem 0.9rem;
		border-left: 0.22rem solid var(--qc-ui-accent);
	}

	.mcq-key-answer strong,
	.mcq-choice-review strong {
		margin: 0;
		color: var(--qc-ui-text);
		font-size: clamp(1.08rem, 2.5vw, 1.38rem);
		font-weight: 600;
		line-height: 1.42;
		overflow-wrap: anywhere;
	}

	.mcq-explanation {
		padding-top: 0.9rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.mcq-choice-review {
		padding-top: 0.9rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.mcq-choice-review strong {
		color: var(--qc-ui-danger);
		font-size: clamp(1rem, 2.2vw, 1.12rem);
	}

	.mcq-choice-review p {
		color: var(--qc-ui-text-secondary);
	}

	.choice-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		align-self: start;
		gap: 0.65rem;
		min-height: 0;
	}

	.choice-grid button {
		min-width: 0;
		min-height: 3.7rem;
		padding: 0.8rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
		font-size: clamp(1rem, 2vw, 1.08rem);
		font-weight: 500;
		line-height: 1.45;
		text-align: left;
		cursor: pointer;
		overflow-wrap: anywhere;
		transition:
			border-color 160ms ease,
			background 160ms ease,
			color 160ms ease,
			box-shadow 160ms ease,
			transform 160ms ease;
	}

	.choice-grid button:disabled {
		cursor: default;
	}

	.choice-grid button.correct {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.choice-grid button.incorrect {
		border-color: var(--qc-ui-danger);
		background: color-mix(in srgb, var(--qc-ui-danger) 9%, var(--qc-ui-surface));
		color: var(--qc-ui-danger);
	}

	.choice-grid button.selected.correct {
		animation: mcq-choice-correct var(--recall-answer-duration) cubic-bezier(0.2, 0.76, 0.2, 1) both;
	}

	.choice-grid button.selected.incorrect {
		animation: mcq-choice-incorrect var(--recall-answer-duration) cubic-bezier(0.25, 0.75, 0.25, 1)
			both;
	}

	@keyframes mcq-choice-correct {
		0% {
			transform: scale(1);
			box-shadow: 0 0 0 rgba(8, 119, 59, 0);
		}

		35% {
			transform: scale(1.018);
			box-shadow: 0 0 0 0.32rem rgba(8, 119, 59, 0.14);
		}

		100% {
			transform: scale(1);
			box-shadow: 0 0 0 rgba(8, 119, 59, 0);
		}
	}

	@keyframes mcq-choice-incorrect {
		0%,
		100% {
			transform: translateX(0);
			box-shadow: 0 0 0 rgba(180, 35, 24, 0);
		}

		16% {
			transform: translateX(-0.52rem);
			box-shadow: 0 0 0 0.24rem rgba(180, 35, 24, 0.14);
		}

		33% {
			transform: translateX(0.44rem);
		}

		50% {
			transform: translateX(-0.34rem);
		}

		68% {
			transform: translateX(0.22rem);
		}

		84% {
			transform: translateX(-0.1rem);
		}
	}

	@keyframes mcq-card-correct {
		0%,
		100% {
			box-shadow: 0 1.35rem 2.8rem rgba(15, 23, 42, 0.18);
		}

		36% {
			box-shadow:
				0 1.35rem 2.8rem rgba(15, 23, 42, 0.18),
				0 0 0 0.36rem rgba(8, 119, 59, 0.16);
		}
	}

	@keyframes mcq-card-incorrect {
		0%,
		100% {
			box-shadow: 0 1.35rem 2.8rem rgba(15, 23, 42, 0.18);
		}

		32% {
			box-shadow:
				0 1.35rem 2.8rem rgba(15, 23, 42, 0.18),
				0 0 0 0.28rem rgba(180, 35, 24, 0.16);
		}
	}

	.drag-cue {
		position: absolute;
		top: 4rem;
		z-index: 3;
		padding: 0.45rem 0.65rem;
		border: 2px solid currentColor;
		background: #ffffff;
		font-size: 1.25rem;
		font-weight: 900;
		text-transform: uppercase;
		opacity: var(--drag-progress);
		pointer-events: none;
		animation: cue-pop 160ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		transform: rotate(var(--cue-rotate, -7deg));
	}

	.drag-cue.positive {
		left: 1.1rem;
		color: #05642f;
		--cue-rotate: -7deg;
	}

	.drag-cue.negative {
		right: 1.1rem;
		color: #8f1f14;
		--cue-rotate: 7deg;
	}

	@keyframes cue-pop {
		from {
			opacity: 0;
			transform: translateY(0.35rem) rotate(var(--cue-rotate, -7deg)) scale(0.94);
		}

		to {
			opacity: 1;
			transform: translateY(0) rotate(var(--cue-rotate, -7deg)) scale(1);
		}
	}

	.session-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 12rem));
		flex: 0 0 auto;
		justify-content: center;
		gap: 0.7rem;
		min-height: calc(4.85rem + env(safe-area-inset-bottom));
		padding: 0.85rem 1rem max(1rem, env(safe-area-inset-bottom));
		border-top: 1px solid #d9e0ea;
		background: #ffffff;
	}

	.session-actions button {
		width: 100%;
		min-width: 0;
	}

	.session-actions button:disabled {
		cursor: default;
		opacity: 0.62;
	}

	.session-actions .session-instruction:disabled {
		opacity: 1;
	}

	.session-actions.prompt-actions {
		grid-template-columns: minmax(0, 18rem);
	}

	.session-actions.result-actions {
		grid-template-columns: repeat(2, minmax(0, 12rem));
	}

	.session-next {
		justify-content: space-between;
	}

	.session-icon-button:focus-visible,
	.choice-grid button:focus-visible,
	.session-actions button:focus-visible {
		outline: 3px solid var(--qc-ui-accent-border);
		outline-offset: 3px;
	}

	.session-resuming {
		align-self: center;
		justify-self: center;
		display: grid;
		justify-items: center;
		gap: 0.75rem;
		color: var(--qc-ui-text-muted);
	}

	.session-resuming p {
		margin: 0;
		font-weight: 650;
	}

	.session-resuming-mark {
		width: 2.35rem;
		height: 2.35rem;
		border: 0.22rem solid var(--qc-ui-border-subtle);
		border-top-color: var(--qc-ui-accent);
		border-radius: 999px;
		animation: recall-loading 720ms linear infinite;
	}

	@keyframes recall-loading {
		to {
			transform: rotate(360deg);
		}
	}

	.session-complete {
		align-self: center;
		justify-self: center;
		display: grid;
		justify-items: center;
		gap: 0.85rem;
		width: min(calc(100% - 2rem), 42rem);
		max-height: calc(100% - 2rem);
		padding: clamp(1.2rem, 3vw, 2rem);
		overflow-y: auto;
		text-align: center;
		overscroll-behavior: contain;
	}

	.completion-mark {
		display: inline-grid;
		width: 4rem;
		height: 4rem;
		place-items: center;
		border: 1px solid var(--qc-ui-accent-border);
		border-radius: 999px;
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.session-complete h1 {
		margin: 0;
		color: #050811;
		font-size: clamp(2rem, 5vw, 4rem);
		font-weight: 900;
		line-height: 1;
	}

	.session-complete p:not(.recall-kicker) {
		margin: 0;
		color: #465568;
	}

	.session-complete .completion-outcome {
		font-size: clamp(1rem, 2.4vw, 1.15rem);
		font-weight: 620;
	}

	.session-complete-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		width: min(100%, 30rem);
		margin-top: 0.35rem;
	}

	:global(:root[data-theme='dark']) .recall-setup,
	:global(:root[data-theme='dark']) .recall-session {
		background: #020617;
		color: #f8fafc;
	}

	:global(:root[data-theme='dark']) .setup-copy,
	:global(:root[data-theme='dark']) .setup-panel,
	:global(:root[data-theme='dark']) .session-header,
	:global(:root[data-theme='dark']) .session-actions,
	:global(:root[data-theme='dark']) .session-complete,
	:global(:root[data-theme='dark']) .stack-card.active,
	:global(:root[data-theme='dark']) .card-face,
	:global(:root[data-theme='dark']) .session-icon-button,
	:global(:root[data-theme='dark']) .setup-stats,
	:global(:root[data-theme='dark']) .setup-stats div,
	:global(:root[data-theme='dark']) .setup-segment button,
	:global(:root[data-theme='dark']) .setup-chip-grid button,
	:global(:root[data-theme='dark']) .setup-select,
	:global(:root[data-theme='dark']) .choice-grid button,
	:global(:root[data-theme='dark']) .card-meta .card-visual-cue {
		border-color: #334155;
		background: #0f172a;
		color: #e5e7eb;
	}

	:global(:root[data-theme='dark']) .setup-copy h1,
	:global(:root[data-theme='dark']) .setup-stats strong,
	:global(:root[data-theme='dark']) .session-progress-text strong,
	:global(:root[data-theme='dark']) .card-prompt h1,
	:global(:root[data-theme='dark']) .session-complete h1 {
		color: #f8fafc;
	}

	:global(:root[data-theme='dark']) .setup-copy p:not(.recall-kicker),
	:global(:root[data-theme='dark']) .session-progress-text,
	:global(:root[data-theme='dark']) .card-prompt p,
	:global(:root[data-theme='dark']) .card-answer p,
	:global(:root[data-theme='dark']) .session-complete p:not(.recall-kicker) {
		color: #a7b4c5;
	}

	:global(:root[data-theme='dark']) .stack-card {
		border-color: rgba(148, 163, 184, 0.42);
		box-shadow:
			0 1.35rem 3rem rgba(0, 0, 0, 0.42),
			0 0 0 1px rgba(226, 232, 240, 0.08);
	}

	:global(:root[data-theme='dark']) .card-flipper {
		border-color: rgba(148, 163, 184, 0.42);
		background: #0f172a;
		box-shadow:
			0 1.35rem 3rem rgba(0, 0, 0, 0.42),
			0 0 0 1px rgba(226, 232, 240, 0.08);
	}

	:global(:root[data-theme='dark']) .stack-card.preview {
		border-color: rgba(148, 163, 184, 0.18);
		background: rgba(15, 23, 42, 0.48);
		box-shadow: none;
		opacity: 0.34;
	}

	:global(:root[data-theme='dark']) .card-stage.moving-stack .stack-card.preview.one {
		opacity: 0.62;
	}

	:global(:root[data-theme='dark']) .card-stage.flipping-stack .stack-card.preview {
		opacity: 0.14;
	}

	:global(:root[data-theme='dark']) .stack-card.preview.one .card-face {
		background: #0d1b24;
	}

	:global(:root[data-theme='dark']) .stack-card.preview.two {
		background: #0a1421;
	}

	:global(:root[data-theme='dark']) .setup-segment button.active,
	:global(:root[data-theme='dark']) .setup-chip-grid button.active {
		border-color: #22c55e;
		background: #0f2b1d;
		color: #bbf7d0;
	}

	:global(:root[data-theme='dark']) .card-answer {
		border-color: #22c55e;
		background: #0f2b1d;
	}

	:global(:root[data-theme='dark']) .card-answer:not(.mcq-answer) > div {
		color: #bbf7d0;
	}

	:global(:root[data-theme='dark']) .card-face.mcq-result-face {
		background: var(--qc-ui-surface-muted);
	}

	:global(:root[data-theme='dark']) .card-answer.mcq-answer {
		border: 0;
		background: transparent;
	}

	:global(:root[data-theme='dark']) .choice-grid button.correct {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	:global(:root[data-theme='dark']) .choice-grid button.incorrect {
		border-color: var(--qc-ui-danger);
		background: color-mix(in srgb, var(--qc-ui-danger) 12%, var(--qc-ui-surface));
		color: var(--qc-ui-danger);
	}

	@media (min-width: 621px) and (max-height: 820px) {
		.card-stage {
			padding: 0.85rem 1rem;
		}

		.card-face {
			gap: 0.65rem;
			padding: 1rem;
		}

		.card-face.mcq-result-face {
			gap: 0.58rem;
		}

		.mcq-result-status {
			padding-bottom: 0.54rem;
		}

		.card-answer.mcq-answer {
			gap: 0.54rem;
		}

		.mcq-key-answer,
		.mcq-explanation,
		.mcq-choice-review {
			padding: 0.58rem 0.68rem;
		}
	}

	@media (max-width: 860px) {
		.setup-shell {
			grid-template-columns: 1fr;
		}

		.setup-copy {
			min-height: auto;
		}
	}

	@media (max-width: 620px) {
		.setup-shell {
			padding: 0.85rem;
		}

		.session-complete-actions {
			grid-template-columns: minmax(0, 1fr);
			width: 100%;
		}

		.setup-copy h1 {
			font-size: clamp(1.85rem, 10vw, 2.75rem);
		}

		.setup-stats {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.setup-stats div:nth-child(2n) {
			border-right: 0;
		}

		.setup-stats div:nth-child(-n + 2) {
			border-bottom: 1px solid #d9e0ea;
		}

		.stack-card {
			width: min(calc(100vw - 2rem), 42rem);
			height: min(100%, 42rem);
			box-shadow: 0 1rem 2.2rem rgba(15, 23, 42, 0.18);
		}

		.card-flipper {
			box-shadow: 0 1rem 2.2rem rgba(15, 23, 42, 0.18);
		}

		.stack-card.preview.one {
			transform: translate(0.45rem, 0.45rem);
		}

		.stack-card.preview.two {
			transform: translate(0.9rem, 0.9rem);
		}

		.card-stage {
			padding: 0.72rem 0.78rem;
		}

		.card-face {
			gap: 0.72rem;
			padding: 0.88rem;
		}

		.card-meta {
			gap: 0.28rem;
		}

		.card-meta .card-visual-cue {
			width: 3.2rem;
			height: 3.2rem;
			font-size: 2rem;
		}

		.card-prompt h1 {
			font-size: clamp(1.55rem, 7.5vw, 2.35rem);
			line-height: 1.22;
		}

		.mcq-front .card-prompt {
			gap: 0.42rem;
		}

		.mcq-front .card-prompt h1 {
			font-size: clamp(1.55rem, 6.3vw, 2rem);
			line-height: 1.32;
		}

		.choice-grid {
			grid-template-columns: 1fr;
			gap: 0.42rem;
		}

		.choice-grid button {
			min-height: 3.35rem;
			padding: 0.66rem 0.7rem;
			font-size: 1.05rem;
			line-height: 1.42;
		}

		.card-answer.mcq-answer {
			gap: 0.52rem;
			padding: 0 0.05rem 0.1rem 0;
		}

		.card-face.mcq-result-face {
			gap: 0.68rem;
		}

		.mcq-result-status {
			gap: 0.58rem;
			padding-bottom: 0.62rem;
		}

		.mcq-result-icon {
			width: 2.25rem;
			height: 2.25rem;
		}

		.mcq-key-answer {
			padding: 0.15rem 0 0.15rem 0.75rem;
		}

		.mcq-explanation,
		.mcq-choice-review {
			padding-top: 0.72rem;
		}

		.mcq-key-answer strong {
			font-size: 1.08rem;
			line-height: 1.42;
		}

		.mcq-explanation p {
			font-size: 1rem;
			line-height: 1.5;
		}

		.session-actions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			min-height: calc(4.2rem + env(safe-area-inset-bottom));
			padding: 0.64rem 0.78rem max(0.72rem, env(safe-area-inset-bottom));
		}

		.session-actions button {
			min-width: 0;
			width: 100%;
		}

		.session-actions.prompt-actions {
			grid-template-columns: minmax(0, 1fr);
		}

		.session-actions.result-actions {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 620px) and (max-height: 720px) {
		.session-header {
			gap: 0.62rem;
			padding: max(0.52rem, env(safe-area-inset-top)) 0.7rem 0.56rem;
		}

		.session-icon-button {
			width: 2.75rem;
			height: 2.75rem;
		}

		.session-progress {
			gap: 0.3rem;
		}

		.session-progress-text {
			font-size: 0.82rem;
		}

		.card-stage {
			padding: 0.52rem 0.64rem;
		}

		.card-face {
			gap: 0.52rem;
			padding: 0.72rem;
		}

		.mcq-front .card-prompt p {
			display: none;
		}

		.mcq-front .card-prompt h1 {
			font-size: clamp(1.45rem, 5.9vw, 1.75rem);
			line-height: 1.3;
		}

		.choice-grid {
			gap: 0.34rem;
		}

		.choice-grid button {
			min-height: 3.1rem;
			padding: 0.52rem 0.58rem;
			font-size: 1.05rem;
			line-height: 1.38;
		}

		.card-answer.mcq-answer {
			gap: 0.42rem;
			padding: 0 0.04rem 0.08rem 0;
		}

		.card-face.mcq-result-face {
			gap: 0.48rem;
		}

		.mcq-result-status {
			padding-bottom: 0.45rem;
		}

		.mcq-key-answer > span,
		.mcq-choice-review > span {
			font-size: 0.74rem;
		}

		.mcq-key-answer {
			gap: 0.2rem;
			padding: 0.12rem 0 0.12rem 0.68rem;
		}

		.mcq-explanation,
		.mcq-choice-review {
			gap: 0.2rem;
			padding-top: 0.58rem;
		}

		.mcq-key-answer strong {
			font-size: 1.05rem;
			line-height: 1.38;
		}

		.mcq-explanation p {
			font-size: 1rem;
			line-height: 1.45;
		}

		.session-actions {
			min-height: calc(3.72rem + env(safe-area-inset-bottom));
			padding: 0.48rem 0.64rem max(0.55rem, env(safe-area-inset-bottom));
		}

		.setup-primary,
		.setup-secondary,
		.session-primary,
		.session-secondary,
		.session-instruction {
			min-height: 2.75rem;
			padding: 0.48rem 0.62rem;
			font-size: 0.9rem;
		}
	}

	:global(:root[data-theme='dark']) .stack-card {
		box-shadow:
			0 1.35rem 3rem rgba(0, 0, 0, 0.42),
			0 0 0 1px rgba(226, 232, 240, 0.08);
	}

	:global(:root[data-theme='dark']) .stack-card.active {
		border: 0;
		background: transparent;
		box-shadow: none;
	}

	:global(:root[data-theme='dark']) .stack-card.preview {
		box-shadow: none;
	}

	@media (prefers-reduced-motion: reduce) {
		.stack-card,
		.card-flipper,
		.card-face,
		.session-progress-track span,
		.choice-grid button,
		.drag-cue,
		.session-resuming-mark {
			animation: none !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
