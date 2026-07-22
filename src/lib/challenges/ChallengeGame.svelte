<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { analyticsEvent } from '$lib/analytics/client';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { haptics } from '$lib/haptics';
	import type { AnswerChain } from '$lib/server/questionData';
	import {
		ArrowRight,
		Check,
		CheckCircle2,
		ChevronDown,
		Copy,
		RotateCcw,
		Share2,
		Sparkles,
		X
	} from '@lucide/svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { ChallengeChoice, ChallengeDefinition } from './types';
	import { challengePath, challengeSubjectLabel } from './routing';
	import {
		calculateChallengeScore,
		emptyChallengeProgress,
		mergeChallengeProgress,
		mergeStoredChallengeProgress,
		type ChallengeProgress,
		updateStoredChallengeProgress
	} from './progress';
	import {
		CHALLENGE_PROGRESS_UPDATED_EVENT,
		type ChallengeProgressUpdatedDetail,
		syncChallengeProgress
	} from './progressSync';
	import { recommendedUnfinishedChallenge } from './recommendations';
	import { playChallengeSound } from './sound';
	import ChallengeButton from './ui/ChallengeButton.svelte';
	import ChallengeChoiceControl from './ui/ChallengeChoice.svelte';
	import ChallengeSessionShell from './ui/ChallengeSessionShell.svelte';
	import ChallengeVisualStory from './ui/ChallengeVisualStory.svelte';
	import ThemeAwareChallengeArt from './ui/ThemeAwareChallengeArt.svelte';
	import { challengeVisual } from './visuals';

	type Stage = 'showdown' | 'diagnose' | 'repair' | 'transfer' | 'complete';

	let {
		challenge,
		chain,
		nextChallenges,
		initialProgress = null,
		userId = null
	}: {
		challenge: ChallengeDefinition;
		chain: AnswerChain;
		nextChallenges: Array<Pick<ChallengeDefinition, 'id' | 'slug' | 'subject'>>;
		initialProgress?: ChallengeProgress | null;
		userId?: string | null;
	} = $props();

	const stageOrder: Array<{ id: Stage; short: string; label: string }> = [
		{ id: 'showdown', short: '1', label: 'Compare answers' },
		{ id: 'diagnose', short: '2', label: 'Find the problem' },
		{ id: 'repair', short: '3', label: 'Fix the answer' },
		{ id: 'transfer', short: '4', label: 'Apply the method' }
	];

	let stage = $state<Stage>('showdown');
	let reviewStage = $state<Stage | null>(null);
	let selectedAnswer = $state<'a' | 'b' | null>(null);
	let diagnosisChoice = $state<string | null>(null);
	let diagnosisWrongChoices = $state<string[]>([]);
	let diagnosisAttempts = $state(0);
	let repairChoice = $state<string | null>(null);
	let repairWrongChoices = $state<string[]>([]);
	let repairAttempts = $state(0);
	let repairPassed = $state(false);
	let repairSupportUsed = $state(false);
	let transferChoice = $state<string | null>(null);
	let transferWrongChoices = $state<string[]>([]);
	let transferAttempts = $state(0);
	let transferPassed = $state(false);
	let transferHintOpen = $state(false);
	let shareMessage = $state('');
	let announcement = $state('');
	let reduceMotion = $state(false);
	let canNativeShare = $state(false);
	let challengeGame = $state<HTMLElement | null>(null);
	let stageHeading = $state<HTMLElement | null>(null);
	let showdownReveal = $state<HTMLElement | null>(null);
	let earnedChain = $state<HTMLElement | null>(null);
	let stageStartedAt = $state(0);
	let completedStageElapsedMs = $state(0);
	let stageElapsedDisplaySeconds = $state(0);
	let progressSnapshot = $state<ChallengeProgress>(emptyChallengeProgress());
	let roundScore = $state<number | null>(null);
	let roundTimeMs = $state<number | null>(null);
	let bestScore = $state<number | null>(null);
	let bestTimeMs = $state<number | null>(null);
	let recommendedNextChallenge = $state<Pick<
		ChallengeDefinition,
		'id' | 'slug' | 'subject'
	> | null>(null);
	let exitTimerPaused = $state(false);
	let exitTimerPausedAt = $state(0);
	let stagePausedMs = $state(0);
	let roundCompletionRecorded = $state(false);
	let roundPlayRecorded = $state(false);
	let stageTimerStopped = $state(false);
	let stageElapsedMsAtStop = $state<number | null>(null);

	const selectedShowdownCorrect = $derived(selectedAnswer === challenge.strongerAnswer);
	const visibleStage = $derived(reviewStage ?? stage);
	const correctRepairChoice = $derived(
		challenge.repairChoices.find((choice) => choice.correct) ?? challenge.repairChoices[0]
	);
	const repairedAnswer = $derived(challenge.staticAnswers[challenge.strongerAnswer]);
	const stagePosition = $derived(
		stage === 'complete' ? stageOrder.length : stageOrder.findIndex((item) => item.id === stage)
	);
	const reviewPosition = $derived(
		reviewStage ? stageOrder.findIndex((item) => item.id === reviewStage) : null
	);
	const diagnosisPassed = $derived(isCorrectChoice(challenge.diagnosisChoices, diagnosisChoice));
	const completedStageCount = $derived(
		stage === 'complete'
			? 4
			: stage === 'transfer'
				? 3 + (transferPassed ? 1 : 0)
				: stage === 'repair'
					? 2 + (repairPassed ? 1 : 0)
					: stage === 'diagnose'
						? 1 + (diagnosisPassed ? 1 : 0)
						: selectedAnswer
							? 1
							: 0
	);
	const sessionActionsVisible = $derived(
		Boolean(reviewStage) ||
			(stage === 'showdown' && Boolean(selectedAnswer)) ||
			(stage === 'diagnose' && diagnosisPassed) ||
			(stage === 'repair' && repairPassed) ||
			(stage === 'transfer' && transferPassed)
	);
	const slowMotion = $derived(page.url.searchParams.get('debugMotion') === 'slow');
	const motionDuration = $derived(reduceMotion ? 0 : slowMotion ? 1280 : 320);
	const weakAnswerText = $derived(challenge.staticAnswers[challenge.weakAnswer]);
	const weakAnswerLabel = $derived(
		{
			incomplete: 'Incomplete',
			'incorrect-claim': 'Incorrect scientific claim',
			'wrong-value': 'Right method, wrong value',
			'off-command': 'Does not answer the command word'
		}[challenge.weakAnswerKind]
	);
	const visual = $derived(challengeVisual(challenge));
	const questionArt = $derived(visual?.cardArt);
	const transferArt = $derived(visual?.transferArt);
	const subjectLabel = $derived(challengeSubjectLabel(challenge.subject));
	const completedWithoutFeedback = $derived(
		selectedShowdownCorrect &&
			diagnosisAttempts === 1 &&
			repairAttempts === 1 &&
			transferAttempts === 1 &&
			!repairSupportUsed &&
			!transferHintOpen
	);
	const firstTryStepCount = $derived(
		[
			selectedShowdownCorrect,
			diagnosisAttempts === 1,
			repairAttempts === 1,
			transferAttempts === 1
		].filter(Boolean).length
	);
	const completionTitle = $derived(
		challenge.id === 'physics-zero-resultant'
			? 'You used balanced forces to explain a stationary parcel and a moving glider.'
			: challenge.id === 'physics-half-range'
				? 'You calculated uncertainty from repeated readings and used the same steps with new values.'
				: 'You found the problem, fixed the answer and used the method on a new question.'
	);

	$effect(() => {
		const incomingProgress = initialProgress;
		if (!browser || !incomingProgress) return;

		// Storage events are reconciled by the route wrapper and arrive here as
		// a fresh prop. Only the progress snapshot changes; the learner's active
		// stage, choices and timer remain untouched.
		progressSnapshot = mergeChallengeProgress(
			untrack(() => progressSnapshot),
			incomingProgress
		);
	});

	onMount(() => {
		const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotionPreference = () => {
			reduceMotion = motionPreference.matches;
		};
		syncMotionPreference();
		canNativeShare = typeof navigator.share === 'function';
		motionPreference.addEventListener('change', syncMotionPreference);
		stageStartedAt = performance.now();
		progressSnapshot = mergeStoredChallengeProgress({
			progress: progressSnapshot,
			incomingProgress: initialProgress,
			storage: window.localStorage,
			userId
		});
		const handleProgressUpdated = (event: Event) => {
			const detail = (event as CustomEvent<ChallengeProgressUpdatedDetail>).detail;
			if (!detail?.progress) return;
			const eventUserId = detail.userId || null;
			if (userId ? eventUserId !== userId : Boolean(eventUserId)) return;
			progressSnapshot = mergeStoredChallengeProgress({
				progress: progressSnapshot,
				incomingProgress: detail.progress,
				storage: window.localStorage,
				userId
			});
		};
		window.addEventListener(CHALLENGE_PROGRESS_UPDATED_EVENT, handleProgressUpdated);
		const timer = window.setInterval(() => {
			if (stage !== 'complete' && !exitTimerPaused && !stageTimerStopped) {
				stageElapsedDisplaySeconds = stageElapsedSeconds();
			}
		}, 1000);
		analyticsEvent('challenge_round_start', eventContext());

		return () => {
			motionPreference.removeEventListener('change', syncMotionPreference);
			window.removeEventListener(CHALLENGE_PROGRESS_UPDATED_EVENT, handleProgressUpdated);
			window.clearInterval(timer);
		};
	});

	function eventContext(extra: Record<string, unknown> = {}) {
		return {
			challengeId: challenge.id,
			subject: challenge.subject,
			mechanic: challenge.mechanic,
			stage,
			...extra
		};
	}

	function stageElapsedMs() {
		const openPauseMs = exitTimerPaused ? performance.now() - exitTimerPausedAt : 0;
		return Math.max(0, performance.now() - stageStartedAt - stagePausedMs - openPauseMs);
	}

	function stageElapsedSeconds() {
		return Math.floor((stageElapsedMsAtStop ?? stageElapsedMs()) / 1000);
	}

	function setTimerPaused(paused: boolean) {
		if (paused === exitTimerPaused) return;
		if (paused) {
			exitTimerPausedAt = performance.now();
			exitTimerPaused = true;
			return;
		}
		const resumedAt = performance.now();
		stagePausedMs += resumedAt - exitTimerPausedAt;
		exitTimerPausedAt = 0;
		exitTimerPaused = false;
	}

	function resetStageTimer() {
		stageStartedAt = performance.now();
		stagePausedMs = 0;
		exitTimerPaused = false;
		exitTimerPausedAt = 0;
		stageTimerStopped = false;
		stageElapsedMsAtStop = null;
		stageElapsedDisplaySeconds = 0;
	}

	function stopStageTimer() {
		if (stageTimerStopped) return;
		stageElapsedMsAtStop = stageElapsedMs();
		stageElapsedDisplaySeconds = stageElapsedSeconds();
		stageTimerStopped = true;
	}

	function recordProgress(
		nextStage: Stage,
		newPlay = false,
		result: { score?: number; durationMs?: number } = {}
	): ChallengeProgress {
		if (!browser) return progressSnapshot;
		const nextProgress = updateStoredChallengeProgress({
			progress: progressSnapshot,
			incomingProgress: initialProgress,
			storage: window.localStorage,
			userId,
			challengeId: challenge.id,
			stage: nextStage,
			newPlay,
			...result
		});
		progressSnapshot = nextProgress;
		window.dispatchEvent(
			new CustomEvent<ChallengeProgressUpdatedDetail>(CHALLENGE_PROGRESS_UPDATED_EVENT, {
				detail: { userId, progress: nextProgress }
			})
		);
		if (userId) {
			void syncChallengeProgress(userId, nextProgress, window.localStorage).catch(() => {
				// The shared background-sync surface owns retry messaging.
			});
		}
		return nextProgress;
	}

	async function focusStage() {
		await tick();
		stageHeading?.focus({ preventScroll: true });
	}

	function moveTo(nextStage: Stage) {
		const completedStageDurationMs = Math.round(stageElapsedMsAtStop ?? stageElapsedMs());
		analyticsEvent(
			`challenge_${stage}_complete`,
			eventContext({ durationMs: completedStageDurationMs })
		);
		completedStageElapsedMs += completedStageDurationMs;
		haptics.selection();
		void playChallengeSound('reveal');
		reviewStage = null;
		stage = nextStage;
		resetStageTimer();
		recordProgress(nextStage);
		void focusStage();
	}

	function chooseShowdown(answer: 'a' | 'b') {
		if (selectedAnswer) return;
		if (!roundPlayRecorded) {
			const startsAnotherPlay = Boolean(progressSnapshot.challenges[challenge.id]);
			roundPlayRecorded = true;
			recordProgress('showdown', startsAnotherPlay);
		}
		selectedAnswer = answer;
		stopStageTimer();
		const correct = answer === challenge.strongerAnswer;
		if (correct) haptics.success();
		else haptics.error();
		void playChallengeSound(correct ? 'correct' : 'incorrect');
		announcement = correct
			? 'You chose the stronger answer.'
			: `You chose an answer that needs improvement: ${weakAnswerLabel.toLowerCase()}.`;
		analyticsEvent(
			'challenge_first_action',
			eventContext({
				answer,
				correct,
				timeToActionMs: Math.round(stageElapsedMsAtStop ?? stageElapsedMs())
			})
		);
		analyticsEvent('challenge_reveal_complete', eventContext({ correct }));
		void revealShowdownResult();
	}

	async function revealShowdownResult() {
		await tick();
		scrollIntoViewIfNeeded(showdownReveal, 'center');
	}

	function chooseDiagnosis(choice: ChallengeChoice) {
		if (
			diagnosisChoice &&
			challenge.diagnosisChoices.find((item) => item.id === diagnosisChoice)?.correct
		)
			return;
		if (diagnosisWrongChoices.includes(choice.id)) return;
		diagnosisAttempts += 1;
		diagnosisChoice = choice.id;
		if (choice.correct) {
			stopStageTimer();
			haptics.success();
			void playChallengeSound('correct');
			announcement = 'You found the problem.';
			void revealStageAction();
		} else {
			if (!diagnosisWrongChoices.includes(choice.id)) {
				diagnosisWrongChoices = [...diagnosisWrongChoices, choice.id];
			}
			haptics.error();
			void playChallengeSound('incorrect');
			announcement = `${choice.feedback ?? 'That does not fix the decisive gap.'} Try again. Attempt ${diagnosisAttempts}.`;
		}
		analyticsEvent(
			'challenge_missing_link_result',
			eventContext({ choiceId: choice.id, correct: choice.correct, attempt: diagnosisAttempts })
		);
	}

	function chooseRepair(choice: ChallengeChoice) {
		if (repairPassed) return;
		if (repairWrongChoices.includes(choice.id)) return;
		repairAttempts += 1;
		repairChoice = choice.id;
		if (choice.correct) {
			stopStageTimer();
			repairPassed = true;
			haptics.success();
			void playChallengeSound('correct');
			announcement = 'Answer improved. The full method is now visible.';
			void revealEarnedChain();
		} else {
			if (!repairWrongChoices.includes(choice.id)) {
				repairWrongChoices = [...repairWrongChoices, choice.id];
			}
			haptics.error();
			void playChallengeSound('incorrect');
			announcement = `${choice.feedback ?? 'That edit is still incomplete.'} Try again. Attempt ${repairAttempts}.`;
		}
		analyticsEvent(
			'challenge_repair_result',
			eventContext({
				mode: 'smallest-edit',
				choiceId: choice.id,
				correct: choice.correct,
				attempt: repairAttempts
			})
		);
	}

	async function revealEarnedChain() {
		await tick();
		scrollIntoViewIfNeeded(earnedChain, 'start');
	}

	async function revealStageAction() {
		await tick();
		const actionFooter = challengeGame?.querySelector<HTMLElement>('.session-actions');
		scrollIntoViewIfNeeded(actionFooter ?? null, 'end');
	}

	function scrollIntoViewIfNeeded(element: HTMLElement | null, block: ScrollLogicalPosition) {
		if (!element) return;
		const rect = element.getBoundingClientRect();
		const visibleTop = Math.max(0, rect.top);
		const visibleBottom = Math.min(window.innerHeight, rect.bottom);
		const visibleHeight = Math.max(0, visibleBottom - visibleTop);
		const requiredVisibleHeight = Math.min(rect.height, window.innerHeight * 0.8);
		if (visibleHeight >= requiredVisibleHeight) return;
		element.scrollIntoView({
			behavior: reduceMotion ? 'auto' : 'smooth',
			block
		});
	}

	function revealReviewedRepair() {
		if (repairPassed) return;
		repairSupportUsed = true;
		analyticsEvent('challenge_repair_support_used', eventContext({ attempt: repairAttempts }));
		chooseRepair(correctRepairChoice);
	}

	function chooseTransfer(choice: ChallengeChoice) {
		if (transferPassed) return;
		if (transferWrongChoices.includes(choice.id)) return;
		transferAttempts += 1;
		transferChoice = choice.id;
		if (choice.correct) {
			stopStageTimer();
			transferPassed = true;
			haptics.success();
			void playChallengeSound('correct');
			announcement =
				transferAttempts === 1
					? 'You recognised the link in a new context first time.'
					: 'You recognised the link in a new context with feedback.';
			void revealStageAction();
		} else {
			if (!transferWrongChoices.includes(choice.id)) {
				transferWrongChoices = [...transferWrongChoices, choice.id];
			}
			haptics.error();
			void playChallengeSound('incorrect');
			announcement = `${choice.feedback ?? 'That answer misses the shared link.'} Try again. Attempt ${transferAttempts}.`;
		}
		analyticsEvent(
			'challenge_transfer_result',
			eventContext({ choiceId: choice.id, correct: choice.correct, attempt: transferAttempts })
		);
	}

	function showTransferHint() {
		transferHintOpen = true;
		haptics.selection();
		void playChallengeSound('reveal');
		analyticsEvent('challenge_transfer_hint_used', eventContext({ attempt: transferAttempts }));
		announcement = 'A step reminder is visible. Use it to choose, then try again.';
	}

	function recordRoundCompletion() {
		if (roundCompletionRecorded) return;
		roundCompletionRecorded = true;
		const durationMs =
			completedStageElapsedMs + Math.round(stageElapsedMsAtStop ?? stageElapsedMs());
		const score = calculateChallengeScore({
			showdownFirstTryCorrect: selectedShowdownCorrect,
			diagnosisFirstTryCorrect: diagnosisAttempts === 1,
			repairFirstTryCorrect: repairAttempts === 1,
			transferFirstTryCorrect: transferAttempts === 1
		});
		roundScore = score;
		roundTimeMs = durationMs;
		const completedProgress = recordProgress('complete', false, { score, durationMs });
		const completedEntry = completedProgress.challenges[challenge.id];
		bestScore = completedEntry?.bestScore ?? score;
		bestTimeMs = completedEntry?.bestTimeMs ?? durationMs;
		recommendedNextChallenge = recommendedUnfinishedChallenge(nextChallenges, completedProgress, {
			currentChallengeId: challenge.id,
			preferredSubject: challenge.subject
		});
		analyticsEvent(
			'challenge_round_complete',
			eventContext({
				durationMs,
				score,
				diagnosisAttempts,
				repairAttempts,
				transferAttempts,
				repairSupportUsed,
				transferHintUsed: transferHintOpen,
				completedWithoutFeedback
			})
		);
	}

	function finishRound() {
		stopStageTimer();
		recordRoundCompletion();
		reviewStage = null;
		stage = 'complete';
		haptics.success();
		void playChallengeSound('complete');
		void focusStage();
	}

	function replay() {
		haptics.selection();
		void playChallengeSound('select');
		stage = 'showdown';
		reviewStage = null;
		selectedAnswer = null;
		diagnosisChoice = null;
		diagnosisAttempts = 0;
		repairChoice = null;
		diagnosisWrongChoices = [];
		repairAttempts = 0;
		repairWrongChoices = [];
		repairPassed = false;
		repairSupportUsed = false;
		transferChoice = null;
		transferWrongChoices = [];
		transferAttempts = 0;
		transferPassed = false;
		transferHintOpen = false;
		shareMessage = '';
		completedStageElapsedMs = 0;
		roundScore = null;
		roundTimeMs = null;
		bestScore = null;
		bestTimeMs = null;
		recommendedNextChallenge = null;
		roundCompletionRecorded = false;
		roundPlayRecorded = true;
		resetStageTimer();
		recordProgress('showdown', true);
		analyticsEvent('challenge_replay', eventContext());
		void focusStage();
	}

	function reviewCompletedStage(index: number) {
		if (reviewStage && index === stagePosition) {
			returnToCurrentStage();
			return;
		}
		if (stage === 'complete' || index < 0 || index >= stagePosition) return;
		const nextReviewStage = stageOrder[index]?.id;
		if (!nextReviewStage || nextReviewStage === 'complete') return;
		reviewStage = nextReviewStage;
		setTimerPaused(true);
		haptics.selection();
		analyticsEvent(
			'challenge_stage_review_open',
			eventContext({ reviewStage: nextReviewStage, reviewIndex: index })
		);
		void focusStage();
	}

	function returnToCurrentStage() {
		if (!reviewStage) return;
		const closedReviewStage = reviewStage;
		reviewStage = null;
		setTimerPaused(false);
		haptics.selection();
		analyticsEvent(
			'challenge_stage_review_close',
			eventContext({ reviewStage: closedReviewStage })
		);
		void focusStage();
	}

	function handleShellPauseChange(paused: boolean) {
		if (paused) {
			setTimerPaused(true);
			return;
		}

		if (!reviewStage) setTimerPaused(false);
	}

	async function shareChallenge() {
		const url = `${window.location.origin}${challengePath(challenge)}`;
		const shareData = {
			title: challenge.title,
			text: `${subjectLabel} challenge: ${challenge.previewQuestion}`,
			url
		};
		try {
			if (canNativeShare) {
				await navigator.share(shareData);
				shareMessage = 'Shared without revealing the answer.';
			} else if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(url);
				shareMessage = 'Challenge link copied.';
			} else {
				shareMessage = `Copy this challenge link: ${url}`;
			}
			haptics.success();
			analyticsEvent(
				'challenge_share',
				eventContext({
					method: canNativeShare ? 'native' : navigator.clipboard ? 'copy' : 'manual'
				})
			);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			shareMessage = 'Could not share automatically. Copy the page address instead.';
		}
	}

	function isCorrectChoice(choices: ChallengeChoice[], id: string | null) {
		return Boolean(id && choices.find((choice) => choice.id === id)?.correct);
	}

	function formatDuration(durationMs: number | null) {
		if (durationMs === null) return '—';
		const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = String(totalSeconds % 60).padStart(2, '0');
		return `${minutes}:${seconds}`;
	}
</script>

<div class="challenge-game" bind:this={challengeGame}>
	<p class="challenge-announcement" aria-live="polite" aria-atomic="true">{announcement}</p>
	<ChallengeSessionShell
		exitHref={`/challenges/${challenge.subject}`}
		exitLabel="Leave challenge"
		eyebrow={`GCSE ${subjectLabel}`}
		title={challenge.title}
		steps={stageOrder}
		activeIndex={Math.min(stagePosition, stageOrder.length - 1)}
		reviewIndex={reviewPosition}
		onStepSelect={reviewCompletedStage}
		value={completedStageCount}
		elapsedSeconds={stageElapsedDisplaySeconds}
		onPauseChange={handleShellPauseChange}
		complete={stage === 'complete'}
		{slowMotion}
		actionsVisible={sessionActionsVisible}
	>
		{#key visibleStage}
			<div
				class="challenge-stage"
				class:complete={visibleStage === 'complete'}
				in:fly={{ y: reduceMotion ? 0 : 18, duration: motionDuration }}
			>
				{#if visibleStage === 'complete'}
					<div class="completion-card" tabindex="-1" bind:this={stageHeading}>
						<div class="completion-icon" aria-hidden="true">
							<Check size={34} strokeWidth={2.5} />
						</div>
						<p class="completion-kicker">
							{completedWithoutFeedback ? 'Solved without hints' : 'Challenge complete'}
						</p>
						<h2>{completionTitle}</h2>
						<p>You found the problem, chose the fix and used it on another question.</p>

						<div class="completion-score" aria-label="Challenge result">
							<div>
								<span>Points earned</span>
								<strong>+{roundScore ?? 400}</strong>
								<small>{firstTryStepCount} of 4 steps first try</small>
							</div>
							<div>
								<span>Total time</span>
								<strong>{formatDuration(roundTimeMs)}</strong>
							</div>
							<div>
								<span>Personal best</span>
								<strong>{bestScore ?? roundScore ?? 400} pts</strong>
								{#if bestTimeMs !== null}<small>{formatDuration(bestTimeMs)}</small>{/if}
							</div>
						</div>
						<p class="score-note">Retries never take points away. Feedback helps you finish.</p>

						<div class="completion-chain">
							<span>Method</span>
							<strong>{challenge.memoryHandle}</strong>
						</div>

						<div class="completion-primary">
							{#if recommendedNextChallenge}
								<ChallengeButton
									href={challengePath(recommendedNextChallenge)}
									analyticsLabel={`Challenge ${challenge.id}: next unfinished challenge ${recommendedNextChallenge.id}`}
									fullWidth
								>
									Play your next unfinished challenge
									<ArrowRight size={18} aria-hidden="true" />
								</ChallengeButton>
							{:else}
								<ChallengeButton href={`/challenges/${challenge.subject}`} fullWidth>
									Choose another {subjectLabel} challenge
									<ArrowRight size={18} aria-hidden="true" />
								</ChallengeButton>
							{/if}
						</div>

						<div class="completion-actions">
							<ChallengeButton variant="secondary" onclick={replay} fullWidth>
								<RotateCcw size={17} aria-hidden="true" />
								Play again
							</ChallengeButton>
							<ChallengeButton variant="secondary" onclick={shareChallenge} fullWidth>
								{#if canNativeShare}
									<Share2 size={17} aria-hidden="true" />
									Share
								{:else}
									<Copy size={17} aria-hidden="true" />
									Copy link
								{/if}
							</ChallengeButton>
						</div>
						{#if shareMessage}<p class="share-message" role="status">{shareMessage}</p>{/if}
					</div>
				{:else}
					<div class:transfer-context={visibleStage === 'transfer'} class="learning-layout">
						<aside
							class="challenge-question-context"
							aria-label={visibleStage === 'transfer'
								? 'New practice question'
								: 'Practice question'}
						>
							{#if visibleStage === 'transfer' && transferArt}
								<figure class="question-illustration">
									<ThemeAwareChallengeArt
										src={transferArt.src}
										darkSrc={transferArt.darkSrc}
										alt={transferArt.alt}
										width={transferArt.width}
										height={transferArt.height}
										loading="eager"
										fetchpriority="high"
									/>
								</figure>
							{:else if visibleStage !== 'transfer' && questionArt}
								<figure class="question-illustration">
									<ThemeAwareChallengeArt
										src={questionArt.src}
										darkSrc={questionArt.darkSrc}
										alt={questionArt.alt}
										width={questionArt.width}
										height={questionArt.height}
										loading="eager"
										fetchpriority="high"
									/>
								</figure>
							{/if}

							<div class="context-copy">
								<span
									>{visibleStage === 'transfer'
										? 'New practice question'
										: 'Practice question'}</span
								>
								{#if visibleStage === 'transfer'}
									<p class="question-lead">
										<MathText text={challenge.transferPromptLead} />
									</p>
								{:else if challenge.questionPresentation}
									<p class="question-lead">{challenge.questionPresentation.lead}</p>
									{#if challenge.questionPresentation.table}
										<figure class="question-data">
											<figcaption>{challenge.questionPresentation.table.caption}</figcaption>
											<table>
												<thead>
													<tr>
														{#each challenge.questionPresentation.table.columns as column (column)}
															<th scope="col">{column}</th>
														{/each}
													</tr>
												</thead>
												<tbody>
													{#each challenge.questionPresentation.table.rows as row (row[0])}
														<tr>
															<th scope="row">{row[0]}</th>
															<td>{row[1]}</td>
														</tr>
													{/each}
												</tbody>
											</table>
										</figure>
									{/if}
									<p class="question-task">{challenge.questionPresentation.task}</p>
								{:else}
									<p class="question-lead"><MathText text={challenge.previewQuestion} /></p>
								{/if}
							</div>
						</aside>

						<section class="active-task">
							{#if reviewStage}
								<p class="review-note">
									Step {(reviewPosition ?? 0) + 1} recap · your current step is paused
								</p>
							{/if}

							{#if visibleStage === 'showdown'}
								<div class="challenge-stage-heading" tabindex="-1" bind:this={stageHeading}>
									<span>Compare</span>
									<h2>Which answer would score higher?</h2>
									<p>Choose the answer that responds more fully and accurately.</p>
								</div>

								<div
									class="answer-showdown"
									role="group"
									aria-label="Answer choices"
									data-nosnippet
								>
									{#each ['a', 'b'] as answer (answer)}
										{@const answerKey = answer as 'a' | 'b'}
										<ChallengeChoiceControl
											text={challenge.staticAnswers[answerKey]}
											label={`Answer ${answerKey.toUpperCase()}${selectedAnswer && answerKey === challenge.strongerAnswer ? ' · correct' : ''}`}
											selected={selectedAnswer === answerKey}
											status={selectedAnswer
												? answerKey === challenge.strongerAnswer
													? 'correct'
													: selectedAnswer === answerKey
														? 'incorrect'
														: 'idle'
												: 'idle'}
											disabled={Boolean(selectedAnswer)}
											prominent
											onclick={() => chooseShowdown(answerKey)}
											analyticsLabel={`Challenge ${challenge.id}: showdown answer ${answerKey.toUpperCase()}`}
										/>
									{/each}
								</div>

								{#if selectedAnswer}
									<div
										class:correct={selectedShowdownCorrect}
										class:incorrect={!selectedShowdownCorrect}
										class="showdown-reveal"
										bind:this={showdownReveal}
									>
										<div class="reveal-icon" aria-hidden="true">
											{#if selectedShowdownCorrect}
												<CheckCircle2 size={22} strokeWidth={2.4} />
											{:else}
												<X size={22} strokeWidth={2.4} />
											{/if}
										</div>
										<div>
											<p class="reveal-label">
												Answer {challenge.strongerAnswer.toUpperCase()} would score higher
											</p>
											<h3>
												Next, find the problem in Answer {challenge.weakAnswer.toUpperCase()}.
											</h3>
										</div>
									</div>
								{/if}
							{:else if visibleStage === 'diagnose'}
								<div class="challenge-stage-heading" tabindex="-1" bind:this={stageHeading}>
									<span>Find the problem</span>
									<h2>{challenge.diagnosisPrompt}</h2>
								</div>

								<p class="diagnosis-instruction">
									{challenge.mechanic === 'first-wrong-step'
										? 'Choose the first incorrect step.'
										: 'Choose the statement that identifies the problem.'}
								</p>

								<article class="weak-answer-focus">
									<span>Answer {challenge.weakAnswer.toUpperCase()}</span>
									<p><MathText text={weakAnswerText} /></p>
								</article>

								<div class="diagnosis-options" role="group" aria-label="Problem choices">
									{#each challenge.diagnosisChoices as choice, index (choice.id)}
										<ChallengeChoiceControl
											text={choice.text}
											marker={String(index + 1)}
											feedback={diagnosisWrongChoices.includes(choice.id) ||
											(diagnosisPassed && choice.correct)
												? choice.feedback
												: null}
											selected={diagnosisChoice === choice.id}
											status={diagnosisPassed && choice.correct
												? 'correct'
												: diagnosisWrongChoices.includes(choice.id)
													? 'incorrect'
													: 'idle'}
											disabled={diagnosisPassed || diagnosisWrongChoices.includes(choice.id)}
											onclick={() => chooseDiagnosis(choice)}
											analyticsLabel={`Challenge ${challenge.id}: diagnosis choice ${choice.id}`}
										/>
									{/each}
								</div>
							{:else if visibleStage === 'repair'}
								<div class="challenge-stage-heading" tabindex="-1" bind:this={stageHeading}>
									<span>Fix Answer {challenge.weakAnswer.toUpperCase()}</span>
									<h2>{challenge.repairPrompt}</h2>
									<p>Choose the single best replacement.</p>
								</div>

								<article class="weak-answer-focus">
									<span>Answer {challenge.weakAnswer.toUpperCase()}</span>
									<p><MathText text={weakAnswerText} /></p>
								</article>

								<div class="repair-workspace">
									<div class="repair-choice-list" role="group" aria-label="Choose one fix">
										{#each challenge.repairChoices as choice, index (choice.id)}
											<ChallengeChoiceControl
												text={choice.text}
												marker={String(index + 1)}
												feedback={repairWrongChoices.includes(choice.id) ||
												(repairPassed && choice.correct)
													? choice.feedback
													: null}
												selected={repairChoice === choice.id}
												status={repairPassed && choice.correct
													? 'correct'
													: repairWrongChoices.includes(choice.id)
														? 'incorrect'
														: 'idle'}
												disabled={repairPassed || repairWrongChoices.includes(choice.id)}
												onclick={() => chooseRepair(choice)}
												analyticsLabel={`Challenge ${challenge.id}: fix choice ${choice.id}`}
											/>
										{/each}
									</div>
									{#if !repairPassed && repairAttempts >= 2}
										<div class="support-callout">
											<p>Need help choosing the sentence that completes the answer?</p>
											<ChallengeButton variant="secondary" onclick={revealReviewedRepair}>
												Show the correct fix
											</ChallengeButton>
										</div>
									{/if}
									{#if repairPassed}
										<div class="chain-earned" bind:this={earnedChain}>
											<header>
												<div>
													<span><Sparkles size={17} aria-hidden="true" /> Method</span>
													<h3>{challenge.memoryHandle}</h3>
												</div>
											</header>
											<ChallengeVisualStory
												{challenge}
												mode="earned"
												compact
												illustrationOverride={chain.illustration}
												expandable
											/>
											<details class="chain-evidence">
												<summary>
													<span>Review the method steps</span>
													<ChevronDown size={18} strokeWidth={2.2} aria-hidden="true" />
												</summary>
												<ol class="method-steps">
													{#each chain.steps as chainStep, index (chainStep.id)}
														<li style={`--step-delay: ${index * 70}ms`}>
															<span>{index + 1}</span>
															<div>
																<strong><MathText text={chainStep.short} /></strong>
																{#if chainStep.markEvidence && chainStep.markEvidence !== chainStep.short}
																	<small>{chainStep.markEvidence}</small>
																{/if}
															</div>
														</li>
													{/each}
												</ol>
											</details>
										</div>

										<details class="repair-detail">
											<summary>
												<span>See the improved answer and why it works</span>
												<ChevronDown size={18} strokeWidth={2.2} aria-hidden="true" />
											</summary>
											<div class="repair-after">
												<span>Improved answer</span>
												<p><mark><MathText text={repairedAnswer} /></mark></p>
											</div>
											<p class="repair-why">
												<strong>{repairSupportUsed ? 'Correct fix shown' : 'Why this works'}</strong
												>
												{challenge.repairSuccess}
											</p>
										</details>
									{/if}
								</div>
							{:else}
								<div class="challenge-stage-heading" tabindex="-1" bind:this={stageHeading}>
									<span>Apply</span>
									<h2>Use the same method on this question.</h2>
									<p>Choose one answer.</p>
								</div>

								<div class="transfer-options" role="group" aria-label="New-question choices">
									{#each challenge.transferChoices as choice, index (choice.id)}
										<ChallengeChoiceControl
											text={choice.text}
											marker={String.fromCharCode(65 + index)}
											feedback={transferWrongChoices.includes(choice.id) ||
											(transferPassed && choice.correct)
												? choice.feedback
												: null}
											selected={transferChoice === choice.id}
											status={transferPassed && choice.correct
												? 'correct'
												: transferWrongChoices.includes(choice.id)
													? 'incorrect'
													: 'idle'}
											disabled={transferPassed || transferWrongChoices.includes(choice.id)}
											onclick={() => chooseTransfer(choice)}
											analyticsLabel={`Challenge ${challenge.id}: transfer choice ${choice.id}`}
										/>
									{/each}
								</div>

								{#if !transferPassed && transferAttempts >= 2}
									<div class="support-callout">
										<p>Need a reminder without revealing the answer?</p>
										<ChallengeButton variant="secondary" onclick={showTransferHint}>
											Show one step
										</ChallengeButton>
										{#if transferHintOpen}
											<strong><MathText text={challenge.memoryHandle} /></strong>
										{/if}
									</div>
								{/if}

								{#if transferPassed}
									<div class="transfer-result">
										<CheckCircle2 size={24} strokeWidth={2.4} aria-hidden="true" />
										<div>
											<strong>Correct.</strong>
											<p>{challenge.transferExplanation}</p>
										</div>
									</div>
								{/if}
							{/if}
						</section>
					</div>
				{/if}
			</div>
		{/key}

		{#snippet actions()}
			{#if reviewStage}
				<ChallengeButton onclick={returnToCurrentStage}>
					Back to current step
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{:else if stage === 'showdown' && selectedAnswer}
				<ChallengeButton
					onclick={() => moveTo('diagnose')}
					analyticsLabel={`Challenge ${challenge.id}: continue to diagnosis`}
				>
					Next: find the problem
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{:else if stage === 'diagnose' && diagnosisPassed}
				<ChallengeButton
					onclick={() => moveTo('repair')}
					analyticsLabel={`Challenge ${challenge.id}: continue to repair`}
				>
					Next: fix the answer
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{:else if stage === 'repair' && repairPassed}
				<ChallengeButton
					onclick={() => moveTo('transfer')}
					analyticsLabel={`Challenge ${challenge.id}: start transfer`}
				>
					Next: try a new question
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{:else if stage === 'transfer' && transferPassed}
				<ChallengeButton
					onclick={finishRound}
					analyticsLabel={`Challenge ${challenge.id}: finish round`}
				>
					See results
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{/if}
		{/snippet}
	</ChallengeSessionShell>
</div>

<style>
	.challenge-game {
		--challenge-accent: var(--qc-ui-accent-text);
		--challenge-accent-fill: var(--qc-ui-accent);
		--challenge-on-accent: var(--qc-ui-on-accent);
		display: block;
		width: 100%;
		margin: 0;
		color: var(--qc-ui-text);
	}

	.challenge-stage-heading > span,
	.challenge-stage-heading h2,
	.challenge-stage-heading p,
	.challenge-announcement {
		margin: 0;
	}

	.challenge-stage-heading > span {
		color: var(--challenge-accent);
		font-size: 0.76rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.challenge-announcement {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.challenge-stage {
		display: grid;
		gap: clamp(1rem, 2.4vw, 1.35rem);
		min-width: 0;
		padding: clamp(1rem, 2.8vw, 1.65rem);
		scroll-margin-top: calc(var(--qc-topbar-height, 4rem) + 0.75rem);
		border: 1px solid var(--qc-ui-border);
		border-radius: 1.6rem;
		background: var(--qc-ui-surface-translucent);
		box-shadow: 0 1.3rem 3.2rem var(--qc-ui-shadow);
		backdrop-filter: blur(18px);
	}

	.challenge-stage-heading {
		display: grid;
		gap: 0.3rem;
		max-width: 54rem;
		outline: none;
	}

	.challenge-stage-heading h2 {
		font-size: clamp(1.55rem, 3.5vw, 2.5rem);
		line-height: 1.05;
	}

	.challenge-stage-heading p {
		color: var(--qc-ui-text-secondary);
		font-size: clamp(0.95rem, 1.5vw, 1.05rem);
		line-height: 1.45;
	}

	.answer-showdown {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}

	.showdown-reveal,
	.transfer-result {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.8rem;
		align-items: start;
		padding: 1rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 1rem;
		background: var(--qc-ui-surface-muted);
		animation: reveal-rise var(--challenge-motion-duration, 560ms) cubic-bezier(0.2, 0.8, 0.2, 1)
			both;
	}

	.showdown-reveal.correct,
	.transfer-result {
		border-color: var(--qc-ui-accent-border);
	}

	.showdown-reveal.incorrect {
		border-color: color-mix(in srgb, var(--qc-ui-warning) 58%, var(--qc-ui-border-subtle));
		background: color-mix(in srgb, var(--qc-ui-warning) 8%, var(--qc-ui-surface));
	}

	.reveal-icon,
	.transfer-result > :global(svg) {
		color: var(--qc-ui-accent-text);
	}

	.showdown-reveal.incorrect .reveal-icon {
		color: var(--qc-ui-warning);
	}

	.reveal-label,
	.showdown-reveal h3,
	.showdown-reveal p,
	.transfer-result p {
		margin: 0;
	}

	.reveal-label {
		color: var(--challenge-accent);
		font-size: 0.76rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.showdown-reveal h3 {
		margin-top: 0.08rem;
		font-size: 1rem;
		font-weight: 650;
		line-height: 1.35;
	}

	.showdown-reveal p:not(.reveal-label),
	.transfer-result p {
		margin-top: 0.2rem;
		color: var(--qc-ui-text-secondary);
		line-height: 1.48;
	}

	.chain-earned {
		scroll-margin-block: 0.8rem;
	}

	.chain-evidence summary,
	.repair-detail summary {
		display: flex;
		min-height: 3rem;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-accent-text);
		font-size: 0.88rem;
		font-weight: 700;
		cursor: pointer;
		list-style: none;
	}

	.chain-evidence summary::-webkit-details-marker,
	.repair-detail summary::-webkit-details-marker {
		display: none;
	}

	.chain-evidence summary :global(svg),
	.repair-detail summary :global(svg) {
		flex: 0 0 auto;
		transition: transform 180ms ease;
	}

	.chain-evidence[open] summary :global(svg),
	.repair-detail[open] summary :global(svg) {
		transform: rotate(180deg);
	}

	.chain-evidence summary:focus-visible,
	.repair-detail summary:focus-visible {
		outline: 3px solid var(--qc-ui-accent-text);
		outline-offset: 2px;
	}

	.weak-answer-focus,
	.repair-after {
		display: grid;
		gap: 0.38rem;
		padding: 1rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 1rem;
		background: var(--qc-ui-surface);
	}

	.weak-answer-focus > span,
	.repair-after > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.74rem;
		font-weight: 850;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	.weak-answer-focus p,
	.repair-after p {
		margin: 0;
		font-size: 1.05rem;
		line-height: 1.52;
	}

	.diagnosis-options,
	.repair-choice-list,
	.transfer-options {
		display: grid;
		gap: 0.6rem;
	}

	.diagnosis-instruction {
		margin: 0 0 -0.25rem;
		color: var(--qc-ui-text-secondary);
		font-size: 0.98rem;
		line-height: 1.45;
	}

	.repair-workspace {
		display: grid;
		gap: 0.8rem;
	}

	.support-callout {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.7rem 0.8rem;
		border: 1px dashed var(--qc-ui-accent-border);
		border-radius: 0.8rem;
		background: var(--qc-ui-surface-subtle);
		color: var(--qc-ui-text-secondary);
	}

	.support-callout p {
		flex: 1 1 15rem;
		margin: 0;
		font-size: 0.84rem;
		line-height: 1.45;
	}

	.support-callout > strong {
		flex-basis: 100%;
		color: var(--qc-ui-accent-text);
	}

	.repair-after {
		border-color: var(--qc-ui-accent-border);
	}

	.repair-after mark {
		padding: 0.08rem 0.18rem;
		border-radius: 0.25rem;
		background: color-mix(in srgb, var(--qc-ui-accent) 24%, transparent);
		color: var(--qc-ui-text);
	}

	.repair-why {
		margin: 0;
		padding: 0.75rem 0.85rem;
		border-left: 3px solid var(--qc-ui-accent);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-text-secondary);
		line-height: 1.5;
	}

	.repair-why strong {
		display: block;
		margin-bottom: 0.18rem;
		color: var(--qc-ui-accent-text);
	}

	.chain-earned {
		display: grid;
		width: 100%;
		max-width: 100%;
		min-width: 0;
		gap: 0.8rem;
		padding: 1rem;
		border: 1px solid var(--qc-ui-accent-border);
		border-radius: 1.1rem;
		background: var(--qc-ui-accent-muted);
	}

	.chain-earned header {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
	}

	.chain-earned header > div {
		display: grid;
		gap: 0.18rem;
	}

	.chain-earned header span {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
		color: var(--qc-ui-accent-text);
		font-size: 0.75rem;
		font-weight: 850;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.chain-earned h3 {
		margin: 0;
		font-size: clamp(1.2rem, 2.5vw, 1.6rem);
	}

	.method-steps {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chain-evidence {
		display: grid;
		gap: 0.7rem;
	}

	.repair-detail {
		display: grid;
		gap: 0.7rem;
	}

	.repair-detail > .repair-after,
	.repair-detail > .repair-why {
		margin-bottom: 0.7rem;
	}

	.method-steps li {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.55rem;
		padding: 0.7rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 0.8rem;
		background: var(--qc-ui-surface);
		animation: chain-step-in var(--challenge-motion-duration, 560ms) cubic-bezier(0.2, 0.8, 0.2, 1)
			both;
		animation-delay: var(--step-delay);
	}

	.method-steps li > span {
		display: inline-grid;
		width: 1.55rem;
		height: 1.55rem;
		place-items: center;
		border-radius: 999px;
		background: var(--challenge-accent-fill);
		color: var(--challenge-on-accent);
		font-size: 0.72rem;
		font-weight: 850;
	}

	.method-steps li div {
		display: grid;
		gap: 0.24rem;
	}

	.method-steps li strong {
		font-size: 0.92rem;
		line-height: 1.3;
	}

	.method-steps li small {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		line-height: 1.35;
	}

	.transfer-result strong {
		color: var(--qc-ui-accent-text);
	}

	.completion-card {
		display: grid;
		gap: 0.8rem;
		width: min(100%, 46rem);
		margin: 0 auto;
		padding: clamp(0.5rem, 2vw, 1.2rem);
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--qc-ui-text);
		text-align: left;
		outline: none;
	}

	.completion-icon {
		display: inline-grid;
		width: 4.5rem;
		height: 4.5rem;
		place-items: center;
		border: 1px solid var(--qc-ui-accent-border);
		border-radius: 999px;
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
		animation: completion-pop var(--challenge-motion-duration, 560ms)
			cubic-bezier(0.2, 0.9, 0.2, 1.2) both;
	}

	.completion-kicker {
		margin: 0;
		color: var(--qc-ui-accent-text);
		font-size: 0.76rem;
		font-weight: 850;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	.completion-card h2,
	.completion-card > p:not(.completion-kicker) {
		margin: 0;
	}

	.completion-card h2 {
		max-width: 32ch;
		color: var(--qc-ui-text);
		font-size: clamp(1.4rem, 3vw, 1.9rem);
		font-weight: 600;
		line-height: 1.22;
	}

	.completion-card > p:not(.completion-kicker) {
		max-width: 54ch;
		color: var(--qc-ui-text-secondary);
		line-height: 1.5;
	}

	.completion-chain {
		display: grid;
		gap: 0.45rem;
		width: 100%;
		margin-top: 0.5rem;
		padding: 1rem;
		border: 1px solid var(--qc-ui-accent-border);
		border-radius: 1rem;
		background: var(--qc-ui-accent-muted);
		text-align: left;
	}

	.completion-chain > span {
		color: var(--qc-ui-accent-text);
		font-size: 0.73rem;
		font-weight: 850;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.completion-chain > strong {
		font-size: 1.15rem;
	}

	.completion-primary {
		width: min(100%, 42rem);
		margin-top: 0.3rem;
	}

	.completion-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		width: min(100%, 42rem);
		margin-top: 0.45rem;
	}

	.share-message {
		margin: 0;
		color: var(--qc-ui-accent-text);
		font-size: 0.85rem;
	}

	@keyframes reveal-rise {
		from {
			opacity: 0;
			transform: translateY(0.7rem);
		}
	}

	@keyframes chain-step-in {
		from {
			opacity: 0;
			transform: translateY(0.55rem) scale(0.985);
		}
	}

	@keyframes completion-pop {
		from {
			opacity: 0;
			transform: scale(0.72) rotate(-8deg);
		}
	}

	@media (max-width: 760px) {
		.answer-showdown {
			grid-template-columns: minmax(0, 1fr);
		}

		.chain-earned header {
			flex-direction: column;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.showdown-reveal,
		.transfer-result,
		.method-steps li,
		.completion-icon {
			animation: none;
		}
	}

	/* Stage-specific composition only. Shared geometry, controls, choices and progress
	   live in the Challenge UI components above. */
	.challenge-stage {
		display: grid;
		gap: clamp(0.55rem, 1.4vh, 0.8rem);
		width: 100%;
		max-width: 100%;
		min-width: 0;
		min-height: 100%;
		align-content: start;
		padding: clamp(0.7rem, 1.8vw, 1rem);
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		backdrop-filter: none;
	}

	.challenge-stage > *,
	.challenge-stage-heading,
	.challenge-stage-heading > *,
	.repair-workspace,
	.answer-showdown,
	.diagnosis-options,
	.transfer-options,
	.repair-choice-list {
		max-width: 100%;
		min-width: 0;
	}

	.challenge-stage-heading > * {
		overflow-wrap: anywhere;
	}

	.question-illustration {
		grid-area: art;
		display: grid;
		width: 100%;
		aspect-ratio: 16 / 9;
		align-self: start;
		margin: 0;
		overflow: hidden;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.question-illustration :global(.theme-aware-challenge-art) {
		width: 100%;
		height: 100%;
	}

	.challenge-stage-heading {
		display: grid;
		gap: 0.55rem;
		max-width: 48rem;
		outline: none;
	}

	.question-lead,
	.question-task {
		margin: 0;
		font-size: clamp(1.08rem, 1.65vw, 1.22rem);
		font-weight: 670;
		line-height: 1.38;
		letter-spacing: -0.008em;
	}

	.question-task {
		font-weight: 680;
	}

	.question-data {
		width: min(100%, 34rem);
		margin: 0;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.question-data figcaption {
		padding: 0.38rem 0.55rem;
		border-bottom: 1px solid var(--qc-ui-border-subtle);
		color: var(--qc-ui-text-secondary);
		font-size: 0.76rem;
		font-weight: 650;
		line-height: 1.35;
	}

	.question-data table {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}

	.question-data th,
	.question-data td {
		padding: 0.27rem 0.55rem;
		border-bottom: 1px solid var(--qc-ui-border-subtle);
		text-align: left;
	}

	.question-data tr:last-child th,
	.question-data tr:last-child td {
		border-bottom: 0;
	}

	.question-data thead th {
		color: var(--qc-ui-text-muted);
		font-size: 0.7rem;
		letter-spacing: 0.035em;
		text-transform: uppercase;
	}

	.question-data tbody th,
	.question-data tbody td {
		font-size: 0.82rem;
		font-weight: 560;
	}

	.challenge-stage-heading > span {
		color: var(--qc-ui-accent-text);
		font-size: 0.76rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.challenge-stage-heading h2 {
		margin: 0;
		color: var(--qc-ui-text);
		font-size: clamp(1.12rem, 2vw, 1.4rem);
		font-weight: 520;
		line-height: 1.42;
		letter-spacing: -0.012em;
	}

	.weak-answer-focus,
	.repair-after,
	.support-callout,
	.showdown-reveal,
	.transfer-result,
	.chain-earned,
	.completion-chain {
		border-radius: 0;
		box-shadow: none;
	}

	.answer-showdown {
		grid-area: answers;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.48rem;
	}

	.answer-showdown :global(button.prominent) {
		min-height: 4.65rem;
		padding: 0.58rem 0.65rem;
		border-color: var(--qc-ui-border-strong);
		font-size: clamp(0.92rem, 1.45vw, 1.02rem);
		line-height: 1.34;
	}

	.diagnosis-options,
	.transfer-options,
	.repair-choice-list {
		display: grid;
		gap: 0.6rem;
	}

	.weak-answer-focus,
	.repair-after {
		padding: 0.85rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.weak-answer-focus p,
	.repair-after p {
		font-size: 1rem;
		font-weight: 450;
		line-height: 1.5;
	}

	.repair-workspace {
		display: grid;
		gap: 0.75rem;
	}

	@media (min-width: 761px) {
		.repair-workspace:has(.chain-earned) {
			grid-template-columns: minmax(13rem, 0.72fr) minmax(24rem, 1.28fr);
			align-items: start;
		}

		.repair-workspace:has(.chain-earned) .chain-earned {
			grid-column: 2;
			grid-row: 1;
		}

		.repair-workspace:has(.chain-earned) .repair-detail {
			grid-column: 2;
			grid-row: 2;
		}
	}

	.showdown-reveal,
	.transfer-result {
		padding: 0.85rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.showdown-reveal.correct,
	.transfer-result {
		border-color: var(--qc-ui-accent-border);
	}

	.showdown-reveal.incorrect {
		border-color: var(--qc-ui-warning);
	}

	.chain-earned {
		padding: 0.9rem;
		border: 1px solid var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	.chain-earned header {
		gap: 0.65rem;
	}

	.chain-earned h3 {
		font-size: clamp(1.08rem, 2vw, 1.35rem);
		line-height: 1.18;
	}

	.chain-evidence summary,
	.repair-detail summary {
		min-height: 2.75rem;
		padding: 0.5rem 0.7rem;
	}

	.method-steps li {
		border-radius: 0;
	}

	.method-steps li > span,
	.completion-icon {
		border-radius: 0;
	}

	.completion-card {
		display: grid;
		gap: 0.85rem;
		align-content: start;
		text-align: left;
	}

	.completion-card > h2 {
		font-size: clamp(1.4rem, 3vw, 1.9rem);
		font-weight: 600;
		line-height: 1.22;
	}

	.completion-icon {
		width: 3rem;
		height: 3rem;
	}

	.completion-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	@media (max-width: 620px) {
		.challenge-game {
			width: calc(100% + 2rem);
			max-width: none;
			margin-inline: -1rem;
		}

		.challenge-stage {
			gap: 0.52rem;
			padding: 0.58rem;
		}

		.question-illustration {
			width: min(100%, 26rem);
			justify-self: center;
		}

		.challenge-game :global(.challenge-visual-teaser) {
			display: none;
		}

		.answer-showdown {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.45rem;
		}

		.challenge-stage-heading h2 {
			font-size: 1.05rem;
			line-height: 1.4;
		}

		.challenge-stage-heading {
			gap: 0.45rem;
		}

		.answer-showdown :global(button[data-analytics-label*='showdown answer']) {
			min-height: 0;
			padding: 0.56rem;
			font-size: 0.84rem;
			line-height: 1.32;
		}

		.answer-showdown :global(.choice-copy) {
			gap: 0.18rem;
		}

		.answer-showdown :global(.choice-label) {
			font-size: 0.68rem;
		}

		.chain-earned {
			padding: 0.45rem;
		}
	}

	@media (min-width: 761px) and (max-height: 800px) {
		.challenge-stage {
			padding: 0.7rem;
		}
	}

	@media (max-width: 360px) {
		.challenge-stage {
			gap: 0.42rem;
			padding: 0.48rem;
		}

		.challenge-stage-heading h2 {
			font-size: 1.04rem;
		}

		.answer-showdown :global(button[data-analytics-label*='showdown answer']) {
			padding: 0.48rem;
			font-size: 0.78rem;
			line-height: 1.28;
		}

		.chain-earned {
			padding: 0.35rem;
		}
	}

	/* The four stages share one stable reading order:
	   context on the left, the current decision on the right. */
	.learning-layout {
		display: grid;
		grid-template-columns: minmax(17rem, 0.82fr) minmax(24rem, 1.18fr);
		gap: clamp(0.9rem, 2vw, 1.3rem);
		align-items: start;
		width: 100%;
		min-width: 0;
	}

	.challenge-question-context,
	.active-task {
		display: grid;
		min-width: 0;
		align-content: start;
	}

	.challenge-question-context {
		gap: 0.65rem;
		padding: 0.7rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text);
	}

	.question-illustration {
		grid-area: auto;
		width: 100%;
		max-height: 13.5rem;
		aspect-ratio: 16 / 9;
		border-color: var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.question-illustration :global(img) {
		max-height: 13.5rem;
		object-fit: contain;
	}

	.context-copy {
		display: grid;
		gap: 0.4rem;
		min-width: 0;
	}

	.context-copy > span,
	.weak-answer-focus > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.7rem;
		font-weight: 760;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	.context-copy .question-lead,
	.context-copy .question-task {
		color: var(--qc-ui-text);
		font-size: clamp(0.94rem, 1.35vw, 1.04rem);
		font-weight: 560;
		line-height: 1.42;
	}

	.context-copy .question-task {
		font-weight: 660;
	}

	.context-copy .question-data {
		width: 100%;
	}

	.context-copy .question-data tbody th,
	.context-copy .question-data tbody td {
		color: var(--qc-ui-text);
	}

	.weak-answer-focus {
		gap: 0.26rem;
		padding: 0.65rem;
		background: var(--qc-ui-surface-raised);
	}

	.weak-answer-focus p {
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.active-task {
		gap: 0.68rem;
		padding-block: 0.1rem;
	}

	.active-task > * {
		grid-area: auto;
		width: 100%;
	}

	.active-task .challenge-stage-heading {
		gap: 0.25rem;
	}

	.active-task .challenge-stage-heading > span {
		font-size: 0.7rem;
	}

	.active-task .challenge-stage-heading h2 {
		font-size: clamp(1.16rem, 2vw, 1.48rem);
		font-weight: 630;
		line-height: 1.2;
	}

	.active-task .challenge-stage-heading p,
	.diagnosis-instruction {
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.review-note {
		margin: 0;
		padding: 0.45rem 0.6rem;
		border-left: 3px solid color-mix(in srgb, var(--qc-ui-accent) 45%, var(--qc-ui-border-strong));
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-secondary);
		font-size: 0.78rem;
		font-weight: 680;
	}

	.active-task .answer-showdown {
		grid-template-columns: minmax(0, 1fr);
		gap: 0.5rem;
	}

	.active-task .answer-showdown :global(button.prominent) {
		min-height: 4.35rem;
		padding: 0.62rem 0.7rem;
		font-size: 0.94rem;
		line-height: 1.35;
	}

	.active-task .diagnosis-options,
	.active-task .repair-choice-list,
	.active-task .transfer-options {
		gap: 0.48rem;
	}

	.active-task :global(.diagnosis-options button),
	.active-task :global(.repair-choice-list button),
	.active-task :global(.transfer-options button) {
		min-height: 3.3rem;
		padding: 0.62rem 0.7rem;
		font-size: 0.94rem;
		line-height: 1.34;
	}

	.repair-workspace:has(.chain-earned) {
		grid-template-columns: minmax(0, 1fr);
	}

	.repair-workspace:has(.chain-earned) .chain-earned,
	.repair-workspace:has(.chain-earned) .repair-detail {
		grid-column: auto;
		grid-row: auto;
	}

	.chain-earned {
		gap: 0.6rem;
		padding: 0.75rem;
		border-color: var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.chain-earned h3 {
		font-size: clamp(1rem, 1.6vw, 1.18rem);
		font-weight: 650;
	}

	.chain-earned header span {
		font-size: 0.7rem;
	}

	.chain-evidence summary,
	.repair-detail summary {
		min-height: 2.7rem;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font-size: 0.84rem;
	}

	.completion-card {
		width: min(100%, 40rem);
		gap: 0.68rem;
	}

	.completion-chain {
		gap: 0.25rem;
		margin-top: 0.25rem;
		padding: 0.72rem 0.82rem;
		border-color: var(--qc-ui-border-subtle);
		border-radius: 0;
		background: var(--qc-ui-surface-muted);
	}

	.completion-chain > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.68rem;
	}

	.completion-chain > strong {
		font-size: 1rem;
		font-weight: 620;
	}

	.completion-score {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
		width: 100%;
	}

	.completion-score > div {
		display: grid;
		gap: 0.18rem;
		min-width: 0;
		padding: 0.72rem 0.78rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.completion-score span {
		color: var(--qc-ui-text-muted);
		font-size: 0.68rem;
		font-weight: 760;
		letter-spacing: 0.045em;
		text-transform: uppercase;
	}

	.completion-score strong {
		color: var(--qc-ui-text);
		font-size: clamp(1rem, 2vw, 1.2rem);
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}

	.completion-score small {
		color: var(--qc-ui-text-secondary);
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
	}

	.completion-card > .score-note {
		max-width: none;
		color: var(--qc-ui-accent-text);
		font-size: 0.82rem;
		font-weight: 620;
	}

	.completion-primary,
	.completion-actions {
		width: 100%;
	}

	@media (max-width: 800px) {
		.learning-layout {
			grid-template-columns: minmax(0, 1fr);
		}

		.challenge-question-context {
			grid-template-columns: minmax(0, 10.5rem) minmax(0, 1fr);
			align-items: start;
		}

		.challenge-question-context .question-illustration {
			grid-row: 1 / span 2;
			max-height: none;
		}
	}

	@media (max-width: 520px) {
		.challenge-question-context {
			grid-template-columns: minmax(0, 1fr);
		}

		.challenge-question-context .question-illustration {
			grid-column: auto;
			grid-row: auto;
		}

		.completion-actions {
			grid-template-columns: minmax(0, 1fr);
		}

		.completion-score {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (min-width: 721px) and (max-height: 800px) {
		.challenge-stage {
			gap: 0.45rem;
			padding: 0.62rem;
		}

		.challenge-question-context {
			gap: 0.5rem;
			padding: 0.6rem;
		}

		.question-illustration,
		.question-illustration :global(img) {
			max-height: 10.5rem;
		}

		.context-copy .question-lead,
		.context-copy .question-task {
			font-size: 0.9rem;
			line-height: 1.34;
		}

		.active-task {
			gap: 0.5rem;
		}

		.active-task .answer-showdown :global(button.prominent),
		.active-task :global(.diagnosis-options button),
		.active-task :global(.repair-choice-list button),
		.active-task :global(.transfer-options button) {
			min-height: 3.15rem;
			padding: 0.52rem 0.62rem;
			font-size: 0.87rem;
		}

		.showdown-reveal,
		.transfer-result {
			padding: 0.6rem;
		}
	}
</style>
