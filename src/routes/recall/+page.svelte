<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ControlSection from '$lib/components/ui/ControlSection.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type {
		RecallCard,
		RecallCardKind,
		RecallSubject,
		RecallTopic
	} from '$lib/recall/aqaScienceRecall';
	import {
		ArrowLeft,
		Brain,
		CheckCircle2,
		Eye,
		Layers3,
		RotateCcw,
		Shuffle,
		Target,
		X
	} from '@lucide/svelte';
	import { onMount, untrack } from 'svelte';

	type Mode = 'recall' | 'recognise' | 'reverse';
	type Grade = 'again' | 'hard' | 'good' | 'easy';
	type SubjectFilter = RecallSubject | 'All subjects';
	type KindFilter = RecallCardKind | 'all';
	type CardMotion =
		| 'idle'
		| 'entering'
		| 'dragging'
		| 'returning'
		| 'flipping'
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
			initialSearch: string;
			initialStart: boolean;
			user: { uid: string; email: string; name: string | null; photoUrl: string | null } | null;
		};
	} = $props();

	const storageKey = 'question-constellation.recall-progress.v1';
	const topicById = untrack(() => new Map(data.topics.map((topic) => [topic.id, topic])));
	const subjectOptions = untrack(() => Array.from(data.subjects));
	const kindOptions = untrack(
		() => Object.entries(data.kindLabels) as Array<[RecallCardKind, string]>
	);
	const modeOptions: Array<{ value: Mode; label: string; icon: typeof Brain }> = [
		{ value: 'recall', label: 'Recall', icon: Brain },
		{ value: 'recognise', label: 'Recognise', icon: Target },
		{ value: 'reverse', label: 'Reverse', icon: Shuffle }
	];

	function validSubject(value: string): SubjectFilter {
		return subjectOptions.includes(value as SubjectFilter)
			? (value as SubjectFilter)
			: 'All subjects';
	}

	function validKind(value: string): KindFilter {
		if (value === 'all') return 'all';
		return kindOptions.some(([kind]) => kind === value) ? (value as RecallCardKind) : 'all';
	}

	let selectedSubject = $state<SubjectFilter>(untrack(() => validSubject(data.initialSubject)));
	let selectedTopic = $state(untrack(() => data.initialTopic));
	let selectedKind = $state<KindFilter>(untrack(() => validKind(data.initialKind)));
	let searchQuery = $state(untrack(() => data.initialSearch));
	let mode = $state<Mode>('recall');
	let sessionActive = $state(untrack(() => data.initialStart && data.cards.length > 0));
	let sessionComplete = $state(false);
	let cardIndex = $state(0);
	let answeredInSession = $state(0);
	let revealed = $state(false);
	let selectedChoice = $state<string | null>(null);
	let progressById = $state<Record<string, RecallProgress>>({});
	let dragX = $state(0);
	let dragY = $state(0);
	let dragStartX = $state(0);
	let dragStartY = $state(0);
	let dragging = $state(false);
	let activePointerId = $state<number | null>(null);
	let cardMotion = $state<CardMotion>('idle');
	let motionTimer: ReturnType<typeof setTimeout> | null = null;

	const normalizedSearch = $derived(searchQuery.trim().toLowerCase());
	const availableTopics = $derived(
		data.topics.filter(
			(topic) => selectedSubject === 'All subjects' || topic.subject === selectedSubject
		)
	);
	const filteredCards = $derived(
		data.cards.filter((card) => {
			if (selectedSubject !== 'All subjects' && card.subject !== selectedSubject) return false;
			if (selectedTopic !== 'all' && card.topicId !== selectedTopic) return false;
			if (selectedKind !== 'all' && card.kind !== selectedKind) return false;
			if (!normalizedSearch) return true;
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
			return normalizedSearch.split(/\s+/).every((term) => haystack.includes(term));
		})
	);
	const currentCard = $derived(filteredCards[cardIndex] ?? null);
	const currentTopic = $derived(currentCard ? topicById.get(currentCard.topicId) : null);
	const nextCard = $derived(filteredCards[cardIndex + 1] ?? null);
	const followingCard = $derived(filteredCards[cardIndex + 2] ?? null);
	const currentChoices = $derived(currentCard ? answerChoices(currentCard) : []);
	const totalCards = $derived(filteredCards.length);
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
		totalCards === 0 ? '0%' : `${Math.min(100, (answeredInSession / totalCards) * 100)}%`
	);
	const dragRotation = $derived(Math.max(-6, Math.min(6, dragX / 80)));
	const dragCue = $derived(!revealed || Math.abs(dragX) < 24 ? '' : dragX > 0 ? 'Good' : 'Review');
	const dragProgress = $derived(Math.min(1, Math.abs(dragX) / 140));
	const cardBusy = $derived(cardMotion !== 'idle' && cardMotion !== 'dragging');

	$effect(() => {
		if (selectedTopic === 'all') return;
		if (availableTopics.some((topic) => topic.id === selectedTopic)) return;
		selectedTopic = 'all';
	});

	$effect(() => {
		selectedSubject;
		selectedTopic;
		selectedKind;
		searchQuery;
		if (!sessionActive) cardIndex = 0;
		syncRecallUrl();
	});

	onMount(() => {
		try {
			const raw = window.localStorage.getItem(storageKey);
			if (raw) progressById = JSON.parse(raw) as Record<string, RecallProgress>;
		} catch {
			progressById = {};
		}
		return () => {
			clearMotionTimer();
		};
	});

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
		}, delayMs);
	}

	function topicFor(card: RecallCard) {
		return topicById.get(card.topicId);
	}

	function promptTextFor(card: RecallCard) {
		return mode === 'reverse' ? (card.reverseFront ?? card.back) : card.front;
	}

	function answerTextFor(card: RecallCard) {
		return mode === 'reverse' ? (card.reverseBack ?? card.front) : card.back;
	}

	function topicCardCount(topicId: string) {
		return data.cards.filter((card) => card.topicId === topicId).length;
	}

	function answerChoices(card: RecallCard) {
		const choices = [card.back, ...(card.distractors ?? [])];
		return seededShuffle(Array.from(new Set(choices)), hashString(card.id)).slice(0, 4);
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

	function startSession() {
		if (filteredCards.length === 0) return;
		sessionActive = true;
		sessionComplete = false;
		cardIndex = 0;
		answeredInSession = 0;
		resetCardState();
	}

	function quitSession() {
		sessionActive = false;
		sessionComplete = false;
		cardIndex = 0;
		answeredInSession = 0;
		resetCardState();
	}

	function resetCardState(options?: { entering?: boolean }) {
		clearMotionTimer();
		revealed = false;
		selectedChoice = null;
		dragX = 0;
		dragY = 0;
		dragging = false;
		activePointerId = null;
		cardMotion = options?.entering ? 'entering' : 'idle';
		if (options?.entering) {
			afterMotion(360, () => {
				cardMotion = 'idle';
			});
		}
	}

	function saveProgress(nextProgress: Record<string, RecallProgress>) {
		progressById = nextProgress;
		if (!browser) return;
		window.localStorage.setItem(storageKey, JSON.stringify(nextProgress));
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
		syncRecallReview(card, grade);
		advanceCard(true);
	}

	function syncRecallReview(card: RecallCard, grade: Grade) {
		if (!browser || !data.user) return;
		void fetch(resolve('/api/recall/review'), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				cardId: card.id,
				grade,
				mode
			})
		}).catch((error) => {
			console.warn('Recall review sync failed.', error);
		});
	}

	function chooseAnswer(card: RecallCard, choice: string) {
		if (selectedChoice) return;
		selectedChoice = choice;
		const isCorrect = choice === card.back;
		gradeCard(card, isCorrect ? 'good' : 'again', isCorrect ? undefined : choice);
	}

	function revealCard() {
		if (!currentCard || revealed || mode === 'recognise' || cardBusy) return;
		dragging = false;
		activePointerId = null;
		dragX = 0;
		dragY = 0;
		cardMotion = 'flipping';
		revealed = true;
		afterMotion(560, () => {
			cardMotion = 'idle';
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

	function skipCard() {
		exitCard('left', () => advanceCard(false));
	}

	function gradeCurrentCard(grade: Grade) {
		if (!currentCard) return;
		const card = currentCard;
		exitCard(grade === 'again' ? 'left' : 'right', () => gradeCard(card, grade));
	}

	function advanceCard(countAsAnswered = false) {
		if (countAsAnswered) answeredInSession += 1;
		if (cardIndex + 1 >= filteredCards.length) {
			sessionComplete = true;
			resetCardState();
			return;
		}
		cardIndex += 1;
		resetCardState({ entering: true });
	}

	function handlePointerDown(event: PointerEvent) {
		if (!currentCard || sessionComplete || mode === 'recognise' || cardBusy || !revealed) return;
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
			gradeCurrentCard(direction === 'right' ? 'good' : 'again');
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

	function syncRecallUrl() {
		if (!browser) return;
		const params = new URLSearchParams();
		if (searchQuery.trim()) params.set('q', searchQuery.trim());
		if (selectedSubject !== 'All subjects') params.set('subject', selectedSubject);
		if (selectedTopic !== 'all') params.set('topic', selectedTopic);
		if (selectedKind !== 'all') params.set('kind', selectedKind);
		const suffix = params.toString();
		window.history.replaceState(
			window.history.state,
			'',
			`${resolve('/recall')}${suffix ? `?${suffix}` : ''}`
		);
	}

	function updateSearch(value: string) {
		searchQuery = value;
	}

	function updateSubject(value: string) {
		selectedSubject = validSubject(value);
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
	<main class="recall-session" aria-label="Recall card session">
		<header class="session-header">
			<button
				type="button"
				class="session-icon-button"
				aria-label="Quit recall session"
				onclick={quitSession}
			>
				<X size={23} aria-hidden="true" strokeWidth={2.2} />
			</button>
			<div class="session-progress">
				<div class="session-progress-text">
					<strong>{Math.min(answeredInSession + 1, totalCards)} of {totalCards}</strong>
					<span>{mode} · {selectedSubject}</span>
				</div>
				<div class="session-progress-track" aria-hidden="true">
					<span style={`width: ${sessionProgress}`}></span>
				</div>
			</div>
		</header>

		{#if sessionComplete}
			<section class="session-complete">
				<p class="recall-kicker">Session complete</p>
				<h1>{answeredInSession} cards reviewed</h1>
				<p>{steadyCount} steady cards in this filter. {dueCount} still due for review.</p>
				<div class="session-complete-actions">
					<button type="button" class="session-primary" onclick={startSession}>Start again</button>
					<button type="button" class="session-secondary" onclick={quitSession}
						>Back to setup</button
					>
				</div>
			</section>
		{:else if currentCard}
			<section
				class="card-stage"
				class:flipping-stack={cardMotion === 'flipping'}
				class:moving-stack={['dragging', 'exiting-left', 'exiting-right'].includes(cardMotion)}
				aria-live="polite"
			>
				{#if followingCard}
					<article class="stack-card preview two" aria-hidden="true"></article>
				{/if}
				{#if nextCard}
					{@const topic = topicFor(nextCard)}
					<article class="stack-card preview one" aria-hidden="true">
						<div class="card-face front">
							<header class="card-meta">
								<span>{nextCard.subject}</span>
								<span>{data.kindLabels[nextCard.kind]}</span>
								<span>{nextCard.specRef}</span>
							</header>
							<section class="card-prompt">
								<p>{topic?.title ?? 'AQA Science'}</p>
								<h1><MathText text={promptTextFor(nextCard)} /></h1>
							</section>
							<p class="card-gesture-hint">Next card</p>
						</div>
					</article>
				{/if}
				{#key currentCard.id}
					<article
						class="stack-card active"
						class:entering={cardMotion === 'entering'}
						class:dragging={cardMotion === 'dragging'}
						class:returning={cardMotion === 'returning'}
						class:flipping={cardMotion === 'flipping'}
						class:revealed
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
							<div class="card-face front">
								<header class="card-meta">
									<span>{currentCard.subject}</span>
									<span>{data.kindLabels[currentCard.kind]}</span>
									<span>{currentCard.specRef}</span>
								</header>

								<section class="card-prompt">
									<p>{currentTopic?.title ?? 'AQA Science'}</p>
									<h1>
										<MathText text={promptTextFor(currentCard)} />
									</h1>
								</section>

								{#if mode === 'recognise'}
									<div class="choice-grid" aria-label="Answer choices">
										{#each currentChoices as choice (choice)}
											<button
												type="button"
												class:correct={selectedChoice !== null && choice === currentCard.back}
												class:incorrect={selectedChoice === choice && choice !== currentCard.back}
												onclick={() => chooseAnswer(currentCard, choice)}
											>
												<MathText text={choice} />
											</button>
										{/each}
									</div>
								{:else}
									<p class="card-gesture-hint">Tap the card to flip and reveal.</p>
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

							<div class="card-face back" aria-hidden={!revealed}>
								<header class="card-meta">
									<span>{currentCard.subject}</span>
									<span>{data.kindLabels[currentCard.kind]}</span>
									<span>{currentCard.specRef}</span>
								</header>

								<section class="card-answer">
									<p>Expected recall</p>
									<div>
										<MathText text={answerTextFor(currentCard)} />
									</div>
								</section>

								<p class="card-gesture-hint">
									Swipe right if you had it. Swipe left to review again.
								</p>
							</div>
						</div>
					</article>
				{/key}
			</section>

			<footer class="session-actions">
				{#if mode === 'recognise'}
					<button
						type="button"
						class="session-secondary"
						disabled={cardBusy}
						onclick={() => advanceCard(false)}
					>
						<ArrowLeft size={18} aria-hidden="true" strokeWidth={2.2} />
						Skip
					</button>
					<button type="button" class="session-primary" disabled>
						Choose answer
					</button>
				{:else if revealed}
					<button
						type="button"
						class="session-secondary danger"
						disabled={cardBusy}
						onclick={() => gradeCurrentCard('again')}
					>
						<RotateCcw size={18} aria-hidden="true" strokeWidth={2.2} />
						Review again
					</button>
					<button
						type="button"
						class="session-primary"
						disabled={cardBusy}
						onclick={() => gradeCurrentCard('good')}
					>
						<CheckCircle2 size={18} aria-hidden="true" strokeWidth={2.2} />
						Had it
					</button>
				{:else}
					<button type="button" class="session-secondary" disabled={cardBusy} onclick={skipCard}>
						Skip
					</button>
					<button type="button" class="session-primary" disabled={cardBusy} onclick={revealCard}>
						<Eye size={18} aria-hidden="true" strokeWidth={2.2} />
						Reveal
					</button>
				{/if}
			</footer>
		{/if}
	</main>
{:else}
	<main class="recall-setup">
		<AppTopbar
			subject={selectedSubject}
			subjects={subjectOptions}
			searchValue={searchQuery}
			searchPlaceholder="Search recall cards"
			onSearchChange={updateSearch}
			onSubjectChange={updateSubject}
		/>

		<section class="setup-shell" aria-label="Recall setup">
			<div class="setup-copy">
				<p class="recall-kicker">AQA GCSE Science</p>
				<h1>Recall cards</h1>
				<p>
					Practise the small facts, equations, tests, units, and practical hooks that one- and
					two-mark questions usually expect.
				</p>
				<div class="setup-stats" aria-label="Current recall set">
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
						Start
					</button>
					<button type="button" class="setup-secondary" onclick={clearProgress}
						>Clear progress</button
					>
				</div>
			</div>

			<div class="setup-panel">
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
								onclick={() => (mode = option.value)}
							>
								<ModeIcon size={17} aria-hidden="true" strokeWidth={2.2} />
								{option.label}
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
							onclick={() => (selectedKind = 'all')}
						>
							All
						</button>
						{#each kindOptions as [kind, label] (kind)}
							<button
								type="button"
								class:active={selectedKind === kind}
								aria-pressed={selectedKind === kind}
								onclick={() => (selectedKind = kind)}
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
					<select class="setup-select" bind:value={selectedTopic} aria-label="Specification topic">
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

<style>
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
	.session-secondary {
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

	.session-secondary.danger {
		border-color: #b42318;
		color: #8f1f14;
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
		height: min(100%, 36rem);
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

	.stack-card.preview .card-meta,
	.stack-card.preview .card-gesture-hint {
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
			transform 220ms cubic-bezier(0.22, 0.75, 0.25, 1),
			opacity 220ms ease;
		will-change: transform, opacity;
		perspective: 1400px;
		-webkit-tap-highlight-color: transparent;
	}

	.stack-card.active.entering {
		animation: promote-card 360ms cubic-bezier(0.2, 0.76, 0.18, 1) both;
	}

	.stack-card.active.dragging {
		cursor: grabbing;
		transition: none;
	}

	.stack-card.active.exiting-left,
	.stack-card.active.exiting-right {
		opacity: 0;
		transition:
			transform 360ms cubic-bezier(0.22, 0.75, 0.25, 1),
			opacity 280ms ease;
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
		transition: transform 560ms cubic-bezier(0.2, 0.72, 0.18, 1);
		will-change: transform;
	}

	.stack-card.active.revealed .card-flipper {
		transform: rotateY(180deg);
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

	.card-face.back {
		transform: rotateY(-180deg);
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

	.card-meta span {
		display: inline-flex;
		align-items: center;
		min-height: 1.7rem;
		padding: 0.18rem 0.48rem;
		border: 1px solid #d9e0ea;
		background: #ffffff;
		color: #172033;
		font-size: 0.78rem;
		font-weight: 820;
	}

	.card-prompt {
		display: grid;
		align-content: center;
		gap: 0.7rem;
		min-height: 0;
	}

	.card-prompt p,
	.card-answer p,
	.card-gesture-hint {
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
		font-size: clamp(2rem, 6vw, 4.4rem);
		font-weight: 900;
		line-height: 1.02;
		letter-spacing: 0;
		overflow-wrap: anywhere;
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

	.card-answer div {
		color: #122316;
		font-size: clamp(1.2rem, 3.5vw, 2rem);
		font-weight: 760;
		line-height: 1.36;
		overflow-wrap: anywhere;
	}

	.card-gesture-hint {
		padding-top: 0.75rem;
		border-top: 1px solid #d9e0ea;
		text-transform: none;
	}

	.choice-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
	}

	.choice-grid button {
		min-height: 4rem;
		padding: 0.8rem;
		border: 1px solid #cfd7e2;
		border-radius: 0;
		background: #ffffff;
		color: #111827;
		font: inherit;
		font-weight: 760;
		line-height: 1.3;
		text-align: left;
		cursor: pointer;
	}

	.choice-grid button.correct {
		border-color: #08602c;
		background: #f4fbf5;
		color: #075323;
	}

	.choice-grid button.incorrect {
		border-color: #b42318;
		background: #fff4f2;
		color: #8f1f14;
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
		cursor: wait;
		opacity: 0.62;
	}

	.session-complete {
		align-self: center;
		justify-self: center;
		display: grid;
		gap: 1rem;
		width: min(calc(100% - 2rem), 42rem);
		padding: clamp(1.2rem, 3vw, 2rem);
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
	:global(:root[data-theme='dark']) .card-meta span {
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
	:global(:root[data-theme='dark']) .card-gesture-hint,
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

	:global(:root[data-theme='dark']) .card-answer div {
		color: #bbf7d0;
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
			height: min(100%, 34rem);
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
			padding: 0.85rem 1rem;
		}

		.card-prompt h1 {
			font-size: clamp(1.8rem, 10vw, 3.2rem);
		}

		.choice-grid {
			grid-template-columns: 1fr;
		}

		.session-actions {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.session-actions button {
			min-width: 0;
			width: 100%;
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
</style>
