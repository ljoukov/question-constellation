<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { analyticsEvent } from '$lib/analytics/client';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { haptics } from '$lib/haptics';
	import type { AnswerChain, Question } from '$lib/server/questionData';
	import {
		ArrowRight,
		Check,
		CheckCircle2,
		CircleHelp,
		Copy,
		Flag,
		PenLine,
		RotateCcw,
		Share2,
		Sparkles,
		Target
	} from '@lucide/svelte';
	import { onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { ChallengeChoice, ChallengeDefinition } from './types';
	import { challengePath } from './catalog';
	import {
		readChallengeProgress,
		updateChallengeProgress,
		writeChallengeProgress
	} from './progress';
	import { playChallengeSound } from './sound';
	import ChallengeButton from './ui/ChallengeButton.svelte';
	import ChallengeChoiceControl from './ui/ChallengeChoice.svelte';
	import ChallengeSessionShell from './ui/ChallengeSessionShell.svelte';
	import ChallengeVisualStory from './ui/ChallengeVisualStory.svelte';
	import { challengeVisual } from './visuals';

	type Stage = 'showdown' | 'diagnose' | 'repair' | 'transfer' | 'complete';

	let {
		challenge,
		question,
		transferQuestion,
		chain,
		nextChallenge
	}: {
		challenge: ChallengeDefinition;
		question: Question;
		transferQuestion: Question;
		chain: AnswerChain;
		nextChallenge: ChallengeDefinition | null;
	} = $props();

	const stageOrder: Array<{ id: Stage; short: string; label: string }> = [
		{ id: 'showdown', short: '1', label: 'Compare' },
		{ id: 'diagnose', short: '2', label: 'Find the gap' },
		{ id: 'repair', short: '3', label: 'Fix it' },
		{ id: 'transfer', short: '4', label: 'New case' }
	];

	let stage = $state<Stage>('showdown');
	let selectedAnswer = $state<'a' | 'b' | null>(null);
	let diagnosisChoice = $state<string | null>(null);
	let diagnosisAttempts = $state(0);
	let repairChoice = $state<string | null>(null);
	let repairAttempts = $state(0);
	let repairPassed = $state(false);
	let repairSupportUsed = $state(false);
	let writeRepair = $state(false);
	let repairDraft = $state('');
	let writtenSelfCheckOpen = $state(false);
	let repairMessage = $state('');
	let transferChoice = $state<string | null>(null);
	let transferAttempts = $state(0);
	let transferPassed = $state(false);
	let transferHintOpen = $state(false);
	let disagreementOpen = $state(false);
	let disagreementSent = $state(false);
	let disagreementPanel = $state<HTMLElement | null>(null);
	let shareMessage = $state('');
	let announcement = $state('');
	let reduceMotion = $state(false);
	let canNativeShare = $state(false);
	let stageHeading = $state<HTMLElement | null>(null);
	let showdownReveal = $state<HTMLElement | null>(null);
	let earnedChain = $state<HTMLElement | null>(null);
	let stageStartedAt = $state(0);
	let roundStartedAt = $state(0);

	const selectedShowdownCorrect = $derived(selectedAnswer === challenge.strongerAnswer);
	const correctRepairChoice = $derived(
		challenge.repairChoices.find((choice) => choice.correct) ?? challenge.repairChoices[0]
	);
	const repairedAnswer = $derived(challenge.staticAnswers[challenge.strongerAnswer]);
	const stagePosition = $derived(
		stage === 'complete' ? stageOrder.length : stageOrder.findIndex((item) => item.id === stage)
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
		(stage === 'showdown' && Boolean(selectedAnswer)) ||
			(stage === 'diagnose' && diagnosisPassed) ||
			(stage === 'repair' && repairPassed) ||
			(stage === 'transfer' && transferPassed) ||
			stage === 'complete'
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
	const commandWord = $derived(inferCommandWord(challenge.previewQuestion));
	const paperLabel = $derived(compactPaperLabel(question.meta.paper, question.meta.tier));
	const visual = $derived(challengeVisual(challenge));
	const completedWithoutFeedback = $derived(
		selectedShowdownCorrect &&
			diagnosisAttempts === 1 &&
			repairAttempts === 1 &&
			transferAttempts === 1 &&
			!repairSupportUsed &&
			!transferHintOpen
	);

	onMount(() => {
		const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotionPreference = () => {
			reduceMotion = motionPreference.matches;
		};
		syncMotionPreference();
		canNativeShare = typeof navigator.share === 'function';
		const previewChoice = page.url.searchParams.get('previewChoice');
		if (previewChoice === 'a' || previewChoice === 'b') {
			selectedAnswer = previewChoice;
			stage = 'diagnose';
			announcement = 'Your answer is carried into the missing-link step.';
			analyticsEvent('challenge_preview_resume', eventContext({ answer: previewChoice }));
		}
		motionPreference.addEventListener('change', syncMotionPreference);
		roundStartedAt = performance.now();
		stageStartedAt = roundStartedAt;
		repairDraft = `${weakAnswerText}\n`;
		recordProgress(stage);
		analyticsEvent('challenge_round_start', eventContext());

		return () => motionPreference.removeEventListener('change', syncMotionPreference);
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

	function elapsedSince(startedAt: number) {
		return Math.max(0, Math.round(performance.now() - startedAt));
	}

	function recordProgress(nextStage: Stage, newPlay = false) {
		if (!browser) return;
		const progress = readChallengeProgress(window.localStorage);
		writeChallengeProgress(
			updateChallengeProgress({
				progress,
				challengeId: challenge.id,
				stage: nextStage,
				newPlay
			}),
			window.localStorage
		);
	}

	async function focusStage() {
		await tick();
		stageHeading?.focus({ preventScroll: true });
	}

	function moveTo(nextStage: Stage) {
		analyticsEvent(
			`challenge_${stage}_complete`,
			eventContext({ durationMs: elapsedSince(stageStartedAt) })
		);
		haptics.selection();
		void playChallengeSound('reveal');
		stage = nextStage;
		stageStartedAt = performance.now();
		recordProgress(nextStage);
		void focusStage();
	}

	function chooseShowdown(answer: 'a' | 'b') {
		if (selectedAnswer) return;
		selectedAnswer = answer;
		const correct = answer === challenge.strongerAnswer;
		if (correct) haptics.success();
		else haptics.error();
		void playChallengeSound(correct ? 'correct' : 'incorrect');
		announcement = correct
			? 'You chose the stronger answer.'
			: `You chose the plausible near-miss: ${weakAnswerLabel.toLowerCase()}.`;
		analyticsEvent(
			'challenge_first_action',
			eventContext({
				answer,
				correct,
				timeToActionMs: elapsedSince(roundStartedAt)
			})
		);
		analyticsEvent('challenge_reveal_complete', eventContext({ correct }));
		void revealShowdownResult();
	}

	async function revealShowdownResult() {
		await tick();
		showdownReveal?.scrollIntoView({
			behavior: reduceMotion ? 'auto' : 'smooth',
			block: 'center'
		});
	}

	function chooseDiagnosis(choice: ChallengeChoice) {
		if (
			diagnosisChoice &&
			challenge.diagnosisChoices.find((item) => item.id === diagnosisChoice)?.correct
		)
			return;
		diagnosisAttempts += 1;
		diagnosisChoice = choice.id;
		if (choice.correct) {
			haptics.success();
			void playChallengeSound('correct');
			announcement = 'You found the missing link.';
		} else {
			haptics.error();
			void playChallengeSound('incorrect');
			announcement = 'That is plausible, but it does not repair the decisive gap. Try again.';
		}
		analyticsEvent(
			'challenge_missing_link_result',
			eventContext({ choiceId: choice.id, correct: choice.correct, attempt: diagnosisAttempts })
		);
	}

	function chooseRepair(choice: ChallengeChoice) {
		if (repairPassed) return;
		repairAttempts += 1;
		repairChoice = choice.id;
		repairMessage = choice.feedback ?? '';
		if (choice.correct) {
			repairPassed = true;
			haptics.success();
			void playChallengeSound('correct');
			announcement = 'Repair complete. You earned the full Question Chain.';
			void revealEarnedChain();
		} else {
			haptics.error();
			void playChallengeSound('incorrect');
			announcement = 'That edit is still incomplete. Use the feedback and try again.';
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
		earnedChain?.scrollIntoView({
			behavior: reduceMotion ? 'auto' : 'smooth',
			block: 'start'
		});
	}

	function openWrittenSelfCheck() {
		repairAttempts += 1;
		writtenSelfCheckOpen = true;
		haptics.selection();
		void playChallengeSound('select');
		announcement = 'The self-check is open. You—not an automated checker—compare the whole answer.';
		analyticsEvent('challenge_written_self_check', eventContext({ attempt: repairAttempts }));
	}

	function useWritingMode() {
		if (repairPassed) return;
		writeRepair = !writeRepair;
		writtenSelfCheckOpen = false;
		haptics.selection();
		void playChallengeSound('select');
		repairMessage = '';
		if (!repairDraft.trim()) repairDraft = `${weakAnswerText}\n`;
		analyticsEvent(
			'challenge_repair_mode',
			eventContext({ mode: writeRepair ? 'write-own' : 'smallest-edit' })
		);
	}

	function revealReviewedRepair() {
		if (repairPassed) return;
		repairSupportUsed = true;
		analyticsEvent('challenge_repair_support_used', eventContext({ attempt: repairAttempts }));
		chooseRepair(correctRepairChoice);
	}

	function chooseTransfer(choice: ChallengeChoice) {
		if (transferPassed) return;
		transferAttempts += 1;
		transferChoice = choice.id;
		if (choice.correct) {
			transferPassed = true;
			haptics.success();
			void playChallengeSound('correct');
			announcement =
				transferAttempts === 1
					? 'You recognised the link in a new context first time.'
					: 'You recognised the link in a new context with feedback.';
		} else {
			haptics.error();
			void playChallengeSound('incorrect');
			announcement = 'That answer repeats the context, but misses the shared link. Try again.';
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
		announcement = 'A Question Chain reminder is visible. Use it to choose, then try again.';
	}

	function finishRound() {
		stage = 'complete';
		recordProgress('complete');
		haptics.success();
		void playChallengeSound('complete');
		analyticsEvent(
			'challenge_round_complete',
			eventContext({
				durationMs: elapsedSince(roundStartedAt),
				diagnosisAttempts,
				repairAttempts,
				transferAttempts,
				repairSupportUsed,
				transferHintUsed: transferHintOpen,
				completedWithoutFeedback
			})
		);
		void focusStage();
	}

	function replay() {
		haptics.selection();
		void playChallengeSound('select');
		stage = 'showdown';
		selectedAnswer = null;
		diagnosisChoice = null;
		diagnosisAttempts = 0;
		repairChoice = null;
		repairAttempts = 0;
		repairPassed = false;
		repairSupportUsed = false;
		writeRepair = false;
		repairDraft = `${weakAnswerText}\n`;
		writtenSelfCheckOpen = false;
		repairMessage = '';
		transferChoice = null;
		transferAttempts = 0;
		transferPassed = false;
		transferHintOpen = false;
		disagreementOpen = false;
		disagreementSent = false;
		shareMessage = '';
		roundStartedAt = performance.now();
		stageStartedAt = roundStartedAt;
		recordProgress('showdown', true);
		analyticsEvent('challenge_replay', eventContext());
		void focusStage();
	}

	function submitDisagreement(reason: string) {
		disagreementSent = true;
		haptics.selection();
		void playChallengeSound('select');
		analyticsEvent('challenge_disagreement', eventContext({ reason }));
	}

	async function toggleDisagreement() {
		disagreementOpen = !disagreementOpen;
		void playChallengeSound('select');
		if (!disagreementOpen) return;
		await tick();
		disagreementPanel?.focus({ preventScroll: true });
		const scroller = disagreementPanel?.closest<HTMLElement>('.stack-card.active');
		if (scroller && disagreementPanel) {
			scroller.scrollTo({
				top: Math.max(0, disagreementPanel.offsetTop - 16),
				behavior: reduceMotion ? 'auto' : 'smooth'
			});
		}
	}

	async function shareChallenge() {
		const url = `${window.location.origin}${challengePath(challenge)}`;
		const shareData = {
			title: challenge.title,
			text: challenge.hook,
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

	function inferCommandWord(prompt: string) {
		const match = prompt.match(
			/\b(calculate|compare|complete|describe|determine|evaluate|explain|give|identify|name|state|suggest|use|write)\b/i
		);
		return match ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` : 'Exam task';
	}

	function compactPaperLabel(paper: string, tier: string) {
		if (!paper || !tier) return paper;
		return paper.replace(new RegExp(`\\s*${tier}\\s*$`, 'i'), '').trim() || paper;
	}
</script>

<div class="challenge-game">
	<p class="challenge-announcement" aria-live="polite" aria-atomic="true">{announcement}</p>
	<ChallengeSessionShell
		exitHref={`/challenges/${challenge.subject}`}
		exitLabel={`Back to ${challenge.subject === 'biology' ? 'Biology' : 'Physics'} challenges`}
		eyebrow={`${challenge.subject === 'biology' ? 'GCSE Biology' : 'GCSE Physics'} · ${challenge.mechanic === 'first-wrong-step' ? 'Mark the working' : 'Find the decisive gap'}`}
		title={challenge.title}
		steps={stageOrder}
		activeIndex={Math.min(stagePosition, stageOrder.length - 1)}
		value={completedStageCount}
		complete={stage === 'complete'}
		{slowMotion}
		actionsVisible={sessionActionsVisible}
	>
		{#key stage}
			<div
				class="challenge-stage"
				class:complete={stage === 'complete'}
				in:fly={{ y: reduceMotion ? 0 : 18, duration: motionDuration }}
			>
				{#if stage === 'showdown'}
					<div class="challenge-stage-heading" tabindex="-1" bind:this={stageHeading}>
						<span>Answer showdown</span>
						<h2><MathText text={challenge.previewQuestion} /></h2>
						<p>
							<span class="showdown-instruction-wide"
								>Both answers sound plausible. Tap the one you would trust in the exam.</span
							>
							<span class="showdown-instruction-mobile">Tap the answer you trust.</span>
						</p>
					</div>

					<div class="question-meta-row" aria-label="Question details">
						<span>{question.meta.board}</span>
						<span>{question.meta.tier || 'All tiers'}</span>
						<span>{paperLabel || question.meta.subject}</span>
						<span>{question.meta.marks} {question.meta.marks === 1 ? 'mark' : 'marks'}</span>
						<span>{commandWord}</span>
					</div>

					<ChallengeVisualStory {challenge} mode="teaser" compact />

					<div class="answer-showdown" role="group" aria-label="Answer choices" data-nosnippet>
						{#each ['a', 'b'] as answer (answer)}
							{@const answerKey = answer as 'a' | 'b'}
							<ChallengeChoiceControl
								text={challenge.staticAnswers[answerKey]}
								label={selectedAnswer
									? answerKey === challenge.strongerAnswer
										? `Answer ${answerKey.toUpperCase()} · stronger`
										: selectedAnswer === answerKey
											? `Answer ${answerKey.toUpperCase()} · ${weakAnswerLabel}`
											: `Answer ${answerKey.toUpperCase()}`
									: `Answer ${answerKey.toUpperCase()}`}
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
						<div class="showdown-gap" bind:this={showdownReveal}>
							<ChallengeVisualStory {challenge} mode="gap" compact />
						</div>

						<div
							class:correct={selectedShowdownCorrect}
							class:incorrect={!selectedShowdownCorrect}
							class="showdown-reveal"
						>
							<div class="reveal-icon" aria-hidden="true">
								{#if selectedShowdownCorrect}
									<CheckCircle2 size={25} strokeWidth={2.4} />
								{:else}
									<CircleHelp size={25} strokeWidth={2.4} />
								{/if}
							</div>
							<div>
								<p class="reveal-label">
									{selectedShowdownCorrect ? 'Well supported' : 'A plausible near-miss'}
								</p>
								<h3>The missing link: {visual?.decisiveLabel ?? challenge.memoryHandle}</h3>
								<p>
									{selectedShowdownCorrect
										? 'The stronger answer makes this step explicit.'
										: 'Your choice sounds plausible, but it breaks at this step.'}
								</p>
								<details>
									<summary>Why this changes the mark</summary>
									<p>{challenge.showdownExplanation}</p>
									<p class="command-lesson">{challenge.commandWordLesson}</p>
								</details>
							</div>
						</div>

						<article class="question-focus">
							<header>
								<span>Source reconstruction · available after your choice</span>
								<strong>{question.meta.marks} {question.meta.marks === 1 ? 'mark' : 'marks'}</strong
								>
							</header>
							<p><MathText text={challenge.previewQuestion} /></p>
							<details class="source-details">
								<summary
									data-analytics-label={`Challenge ${challenge.id}: view full source question`}
								>
									View the full source reconstruction
								</summary>
								<ExamQuestionCard
									{question}
									showTitle={false}
									showMeta={false}
									assetLoading="lazy"
									compact
								/>
							</details>
						</article>

						{#if disagreementOpen}
							<div
								id={`challenge-disagreement-${challenge.id}`}
								class="disagreement-panel"
								tabindex="-1"
								bind:this={disagreementPanel}
							>
								{#if disagreementSent}
									<p role="status">
										<strong>Thanks.</strong> Disagreement is useful evidence, not a wrong answer.
									</p>
								{:else}
									<p>What feels off?</p>
									<div>
										{#each ['Another answer could also work', 'The stronger answer feels unfair', 'The explanation is unclear'] as reason (reason)}
											<ChallengeButton
												variant="secondary"
												onclick={() => submitDisagreement(reason)}
											>
												{reason}
											</ChallengeButton>
										{/each}
									</div>
								{/if}
								<small>Our learning interpretation, not an official AQA mark.</small>
							</div>
						{/if}
					{/if}
				{:else if stage === 'diagnose'}
					<div class="challenge-stage-heading" tabindex="-1" bind:this={stageHeading}>
						<span>{weakAnswerLabel}</span>
						<h2>{challenge.diagnosisPrompt}</h2>
						<p>Pick the one move that repairs the marking-point gap.</p>
					</div>

					<article class="weak-answer-focus">
						<span>Sample answer to repair</span>
						<p><MathText text={weakAnswerText} /></p>
					</article>

					<div class="diagnosis-options" role="group" aria-label="Missing-link choices">
						{#each challenge.diagnosisChoices as choice, index (choice.id)}
							<ChallengeChoiceControl
								text={choice.text}
								marker={String(index + 1)}
								feedback={diagnosisChoice === choice.id ? choice.feedback : null}
								selected={diagnosisChoice === choice.id}
								status={diagnosisChoice === choice.id
									? choice.correct
										? 'correct'
										: 'incorrect'
									: 'idle'}
								disabled={isCorrectChoice(challenge.diagnosisChoices, diagnosisChoice)}
								onclick={() => chooseDiagnosis(choice)}
								analyticsLabel={`Challenge ${challenge.id}: diagnosis choice ${choice.id}`}
							/>
						{/each}
					</div>
				{:else if stage === 'repair'}
					<div class="challenge-stage-heading" tabindex="-1" bind:this={stageHeading}>
						<span>Smallest sufficient edit</span>
						<h2>{challenge.repairPrompt}</h2>
						<p>Keep the sample answer’s useful wording. Change only what the target link needs.</p>
					</div>

					<div class="repair-workspace">
						<div class="repair-before">
							<span>Before</span>
							<p><MathText text={weakAnswerText} /></p>
						</div>

						{#if !repairPassed}
							<ChallengeButton variant="secondary" onclick={useWritingMode}>
								{#if writeRepair}
									<Target size={17} aria-hidden="true" />
									Use quick edits
								{:else}
									<PenLine size={17} aria-hidden="true" />
									Write it myself (self-check)
								{/if}
							</ChallengeButton>

							{#if writeRepair}
								<div class="write-repair">
									<label for={`repair-${challenge.id}`}>Edit the answer in your own words</label>
									<small>Your text stays in this box. There is no automated mark.</small>
									<textarea
										id={`repair-${challenge.id}`}
										bind:value={repairDraft}
										rows="5"
										spellcheck="true"
										data-analytics-label={`Challenge ${challenge.id}: written repair`}
									></textarea>
									<ChallengeButton onclick={openWrittenSelfCheck} disabled={!repairDraft.trim()}>
										Open my self-check
									</ChallengeButton>
									{#if writtenSelfCheckOpen}
										<div class="written-self-check">
											<strong>Compare the whole answer</strong>
											<ul>
												<li>
													Did I remove or correct the original problem, rather than contradict it?
												</li>
												<li>Did I make the target scientific link explicit?</li>
												<li>Did I preserve the parts that were already useful?</li>
											</ul>
											<p>
												Now compare with the reviewed choices. Other scientifically valid wording
												can also earn credit.
											</p>
											<ChallengeButton variant="secondary" onclick={useWritingMode}>
												Compare reviewed edits
											</ChallengeButton>
										</div>
									{/if}
								</div>
							{:else}
								<div
									class="repair-choice-list"
									role="group"
									aria-label="Choose the smallest sufficient edit"
								>
									{#each challenge.repairChoices as choice (choice.id)}
										<ChallengeChoiceControl
											text={choice.text}
											marker="+"
											feedback={repairChoice === choice.id ? choice.feedback : null}
											selected={repairChoice === choice.id}
											status={repairChoice === choice.id
												? choice.correct
													? 'correct'
													: 'incorrect'
												: 'idle'}
											disabled={repairPassed}
											onclick={() => chooseRepair(choice)}
											analyticsLabel={`Challenge ${challenge.id}: repair choice ${choice.id}`}
										/>
									{/each}
								</div>
							{/if}

							{#if repairMessage}
								<p class:success={repairPassed} class="repair-feedback" aria-live="polite">
									{repairMessage}
								</p>
							{/if}
							{#if !writeRepair && repairAttempts >= 2}
								<div class="support-callout">
									<p>You can still finish this case with backup and see the full chain.</p>
									<ChallengeButton variant="secondary" onclick={revealReviewedRepair}>
										Show the reviewed repair
									</ChallengeButton>
								</div>
							{/if}
						{:else}
							<div class="chain-earned" bind:this={earnedChain}>
								<header>
									<div>
										<span><Sparkles size={17} aria-hidden="true" /> The full mechanism</span>
										<h3>{challenge.memoryHandle}</h3>
									</div>
									<small>You repaired it. Follow it once, then spot it in a new disguise.</small>
								</header>
								<ChallengeVisualStory
									{challenge}
									mode="earned"
									illustrationOverride={chain.illustration}
									expandable
								/>
								<details class="chain-evidence">
									<summary>Review the marking steps</summary>
									<ol>
										{#each chain.steps as chainStep, index (chainStep.id)}
											<li style={`--step-delay: ${index * 70}ms`}>
												<span>{index + 1}</span>
												<div>
													<strong><MathText text={chainStep.short} /></strong>
													<small>{chainStep.markEvidence}</small>
												</div>
											</li>
										{/each}
									</ol>
								</details>
							</div>

							<details class="repair-detail">
								<summary>See the repaired answer and why it works</summary>
								<div class="repair-after">
									<span>After · coherent exam-ready sample</span>
									<p><mark><MathText text={repairedAnswer} /></mark></p>
								</div>
								<p class="repair-why">
									<strong
										>{repairSupportUsed
											? 'Reviewed repair revealed'
											: 'Why this is now sufficient'}</strong
									>
									{challenge.repairSuccess}
								</p>
							</details>
						{/if}
					</div>
				{:else if stage === 'transfer'}
					<div class="challenge-stage-heading" tabindex="-1" bind:this={stageHeading}>
						<span>Same link, new disguise</span>
						<h2>{challenge.transferPromptLead}</h2>
						<p>The atlas is hidden. Spot the step that carries into this question.</p>
					</div>

					<ExamQuestionCard question={transferQuestion} showTitle={false} compact />

					<div class="transfer-options" role="group" aria-label="New-case choices">
						{#each challenge.transferChoices as choice, index (choice.id)}
							<ChallengeChoiceControl
								text={choice.text}
								marker={String.fromCharCode(65 + index)}
								feedback={transferChoice === choice.id ? choice.feedback : null}
								selected={transferChoice === choice.id}
								status={transferChoice === choice.id
									? choice.correct
										? 'correct'
										: 'incorrect'
									: 'idle'}
								disabled={transferPassed}
								onclick={() => chooseTransfer(choice)}
								analyticsLabel={`Challenge ${challenge.id}: transfer choice ${choice.id}`}
							/>
						{/each}
					</div>

					{#if !transferPassed && transferAttempts >= 2}
						<div class="support-callout">
							<p>Need one link from the chain without revealing the option?</p>
							<ChallengeButton variant="secondary" onclick={showTransferHint}>
								Show me one link
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
								<strong>
									{transferAttempts === 1
										? 'You recognised the same link first time.'
										: 'You recognised the same link with feedback.'}
								</strong>
								<p>{challenge.transferExplanation}</p>
							</div>
						</div>
					{/if}
				{:else}
					<div class="completion-card" tabindex="-1" bind:this={stageHeading}>
						<div class="completion-icon" aria-hidden="true">
							<Check size={34} strokeWidth={2.5} />
						</div>
						<p class="completion-kicker">
							{completedWithoutFeedback ? 'Solved without hints' : 'Cracked with feedback'}
						</p>
						<h2>
							{transferAttempts === 1
								? 'You repaired one answer and recognised the link in a second question.'
								: 'You repaired one answer and found the same link with support.'}
						</h2>
						<p>
							Use the Question Chain as a prompt next time. Secure transfer takes another unseen
							question without feedback.
						</p>

						<div class="completion-chain">
							<span>Question Chain</span>
							<strong>{challenge.memoryHandle}</strong>
							<div>
								{#each chain.steps as chainStep, index (chainStep.id)}
									<span><MathText text={chainStep.short} /></span>
									{#if index < chain.steps.length - 1}<ArrowRight
											size={15}
											aria-hidden="true"
										/>{/if}
								{/each}
							</div>
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
				{/if}
			</div>
		{/key}

		{#snippet actions()}
			{#if stage === 'showdown' && selectedAnswer}
				<ChallengeButton
					onclick={() => moveTo('diagnose')}
					analyticsLabel={`Challenge ${challenge.id}: continue to diagnosis`}
				>
					Find the exact gap
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
				<ChallengeButton
					variant="quiet"
					ariaExpanded={disagreementOpen}
					ariaControls={`challenge-disagreement-${challenge.id}`}
					onclick={toggleDisagreement}
					analyticsLabel={`Challenge ${challenge.id}: challenge marking`}
				>
					<Flag size={16} aria-hidden="true" />
					Challenge this judgment
				</ChallengeButton>
			{:else if stage === 'diagnose' && diagnosisPassed}
				<ChallengeButton
					onclick={() => moveTo('repair')}
					analyticsLabel={`Challenge ${challenge.id}: continue to repair`}
				>
					Repair the answer
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{:else if stage === 'repair' && repairPassed}
				<ChallengeButton
					onclick={() => moveTo('transfer')}
					analyticsLabel={`Challenge ${challenge.id}: start transfer`}
				>
					Hide the chain and try a new case
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{:else if stage === 'transfer' && transferPassed}
				<ChallengeButton
					onclick={finishRound}
					analyticsLabel={`Challenge ${challenge.id}: finish round`}
				>
					See what you learned
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{:else if stage === 'complete'}
				{#if nextChallenge}
					<ChallengeButton
						href={challengePath(nextChallenge)}
						analyticsLabel={`Challenge ${challenge.id}: next challenge ${nextChallenge.id}`}
					>
						Next challenge
						<ArrowRight size={18} aria-hidden="true" />
					</ChallengeButton>
				{:else}
					<ChallengeButton href={`/challenges/${challenge.subject}`}>
						Browse more {challenge.subject === 'biology' ? 'Biology' : 'Physics'}
						<ArrowRight size={18} aria-hidden="true" />
					</ChallengeButton>
				{/if}
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

	.showdown-instruction-mobile {
		display: none;
	}

	.question-focus {
		display: grid;
		gap: 0.75rem;
		padding: clamp(0.85rem, 2vw, 1.1rem);
		border: 1px solid var(--qc-ui-border-strong);
		border-radius: 1rem;
		background: var(--qc-ui-surface);
		color: var(--qc-ui-text);
	}

	.question-focus > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.73rem;
		font-weight: 850;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	.question-focus > header strong {
		padding: 0.25rem 0.45rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 999px;
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text-secondary);
		letter-spacing: 0;
		text-transform: none;
	}

	.question-focus > p {
		margin: 0;
		font-size: clamp(1rem, 1.8vw, 1.14rem);
		font-weight: 650;
		line-height: 1.5;
	}

	.question-focus details {
		padding-top: 0.65rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.question-focus summary {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		width: fit-content;
		color: var(--challenge-accent);
		font-size: 0.82rem;
		font-weight: 780;
		cursor: pointer;
	}

	.question-focus details :global(.qc-exam-card) {
		width: 100%;
		margin-top: 0.75rem;
	}

	.answer-showdown {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
	}

	.question-meta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		color: var(--qc-ui-text-muted);
		font-size: 0.72rem;
		font-weight: 650;
	}

	.question-meta-row span {
		padding: 0.22rem 0.42rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.source-details {
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.source-details summary {
		min-height: 2.75rem;
		color: var(--qc-ui-accent-text);
		font-size: 0.82rem;
		font-weight: 650;
		line-height: 2.75rem;
		cursor: pointer;
	}

	.source-details :global(.qc-exam-card) {
		margin-top: 0.65rem;
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
		font-size: 0.74rem;
		font-weight: 850;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	.showdown-reveal h3 {
		margin-top: 0.15rem;
		font-size: 1.15rem;
	}

	.showdown-reveal p:not(.reveal-label),
	.transfer-result p {
		margin-top: 0.35rem;
		color: var(--qc-ui-text-secondary);
		line-height: 1.48;
	}

	.showdown-reveal .command-lesson {
		padding-left: 0.65rem;
		border-left: 3px solid var(--challenge-accent);
		font-size: 0.92rem;
	}

	.showdown-gap,
	.chain-earned {
		scroll-margin-block: 0.8rem;
	}

	.showdown-reveal details {
		margin-top: 0.55rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.showdown-reveal summary,
	.chain-evidence summary,
	.repair-detail summary {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		color: var(--qc-ui-accent-text);
		font-size: 0.82rem;
		font-weight: 650;
		cursor: pointer;
	}

	.disagreement-panel {
		display: grid;
		gap: 0.65rem;
		padding: 0.9rem;
		border: 1px dashed var(--qc-ui-border);
		border-radius: 0.9rem;
		background: var(--qc-ui-surface-subtle);
	}

	.disagreement-panel p {
		margin: 0;
	}

	.disagreement-panel > div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.disagreement-panel small {
		color: var(--qc-ui-text-subtle);
	}

	.weak-answer-focus,
	.repair-before,
	.repair-after {
		display: grid;
		gap: 0.38rem;
		padding: 1rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 1rem;
		background: var(--qc-ui-surface);
	}

	.weak-answer-focus > span,
	.repair-before > span,
	.repair-after > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.74rem;
		font-weight: 850;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	.weak-answer-focus p,
	.repair-before p,
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

	.repair-workspace {
		display: grid;
		gap: 0.8rem;
	}

	.write-repair {
		display: grid;
		gap: 0.55rem;
	}

	.write-repair label {
		color: var(--qc-ui-text-secondary);
		font-size: 0.86rem;
		font-weight: 760;
	}

	.write-repair > small {
		color: var(--qc-ui-text-muted);
		font-size: 0.78rem;
		line-height: 1.4;
	}

	.write-repair textarea {
		width: 100%;
		min-height: 8rem;
		resize: vertical;
		padding: 0.85rem;
		border: 1px solid var(--qc-ui-border);
		border-radius: 0.9rem;
		background: var(--qc-ui-surface);
		color: var(--qc-ui-text);
		font-size: 1rem;
		line-height: 1.5;
	}

	.written-self-check {
		display: grid;
		gap: 0.55rem;
		padding: 0.8rem;
		border: 1px solid var(--qc-ui-accent-border);
		border-radius: 0.85rem;
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-text-secondary);
	}

	.written-self-check > strong {
		color: var(--qc-ui-accent-text);
	}

	.written-self-check ul {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding-left: 1.2rem;
		font-size: 0.86rem;
		line-height: 1.45;
	}

	.written-self-check p {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.repair-feedback {
		margin: 0;
		padding: 0.65rem 0.75rem;
		border-left: 3px solid var(--qc-ui-warning);
		background: var(--qc-ui-warning-surface);
		color: var(--qc-ui-warning-text);
		line-height: 1.45;
	}

	.repair-feedback.success {
		border-left-color: var(--qc-ui-accent);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
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

	.chain-earned header small {
		color: var(--qc-ui-text-muted);
	}

	.chain-earned ol {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chain-evidence {
		border-top: 1px solid var(--qc-ui-accent-border);
	}

	.repair-detail {
		display: grid;
		gap: 0.7rem;
		border-block: 1px solid var(--qc-ui-border-subtle);
	}

	.repair-detail > .repair-after,
	.repair-detail > .repair-why {
		margin-bottom: 0.7rem;
	}

	.chain-earned li {
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

	.chain-earned li > span {
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

	.chain-earned li div {
		display: grid;
		gap: 0.24rem;
	}

	.chain-earned li strong {
		font-size: 0.92rem;
		line-height: 1.3;
	}

	.chain-earned li small {
		color: var(--qc-ui-text-muted);
		font-size: 0.76rem;
		line-height: 1.35;
	}

	.transfer-result strong {
		color: var(--qc-ui-accent-text);
	}

	.completion-card {
		display: grid;
		justify-items: center;
		gap: 0.8rem;
		width: min(100%, 54rem);
		margin: 0 auto;
		padding: clamp(0.5rem, 2vw, 1.2rem);
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--qc-ui-text);
		text-align: center;
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
		max-width: 17ch;
		color: var(--qc-ui-text);
		font-size: clamp(1.8rem, 4vw, 3rem);
		line-height: 1.05;
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

	.completion-chain > div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
		color: var(--qc-ui-text-secondary);
		font-size: 0.86rem;
	}

	.completion-chain > div > span {
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--qc-ui-border-subtle);
		border-radius: 999px;
		background: var(--qc-ui-surface);
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
		.chain-earned li,
		.completion-icon {
			animation: none;
		}
	}

	/* Stage-specific composition only. Shared geometry, controls, choices and progress
	   live in the Challenge UI components above. */
	.challenge-stage {
		display: grid;
		gap: 1rem;
		width: 100%;
		max-width: 100%;
		min-width: 0;
		min-height: 100%;
		align-content: start;
		padding: clamp(1rem, 3vw, 1.65rem);
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		backdrop-filter: none;
	}

	.challenge-stage > *,
	.challenge-stage-heading,
	.challenge-stage-heading > *,
	.question-focus,
	.question-focus > *,
	.question-focus > p :global(.math-text),
	.question-focus details,
	.question-focus summary,
	.question-focus details :global(.qc-exam-card),
	.question-focus details :global(.qc-exam-card > *),
	.repair-workspace,
	.write-repair,
	.answer-showdown,
	.diagnosis-options,
	.transfer-options,
	.repair-choice-list {
		max-width: 100%;
		min-width: 0;
	}

	.challenge-stage-heading > *,
	.question-meta-row,
	.source-details,
	.question-focus > p,
	.question-focus > p :global(.math-text),
	.question-focus summary,
	.question-focus details :global(.qc-exam-card),
	.question-focus details :global(.qc-exam-card *) {
		overflow-wrap: anywhere;
	}

	.challenge-stage-heading {
		display: grid;
		gap: 0.35rem;
		max-width: 38rem;
		outline: none;
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
		font-size: clamp(1.45rem, 3.5vw, 2.25rem);
		font-weight: 560;
		line-height: 1.12;
	}

	.challenge-stage-heading p {
		margin: 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.94rem;
		line-height: 1.45;
	}

	.question-meta-row,
	.source-details {
		max-width: 100%;
		min-width: 0;
	}

	.question-focus,
	.weak-answer-focus,
	.repair-before,
	.repair-after,
	.written-self-check,
	.support-callout,
	.disagreement-panel,
	.showdown-reveal,
	.transfer-result,
	.chain-earned,
	.completion-chain {
		border-radius: 0;
		box-shadow: none;
	}

	.question-focus {
		display: grid;
		gap: 0.7rem;
		padding: 0.85rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.question-focus > header {
		flex-wrap: wrap;
	}

	.question-focus > header > span {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.question-focus summary {
		width: 100%;
		white-space: normal;
	}

	.question-focus > p {
		font-family: Arial, Helvetica, sans-serif;
		font-size: 1rem;
		font-weight: 400;
		line-height: 1.48;
	}

	.question-focus > header strong,
	.question-focus summary {
		border-radius: 0;
		font-weight: 650;
	}

	.answer-showdown {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
	}

	.diagnosis-options,
	.transfer-options,
	.repair-choice-list {
		display: grid;
		gap: 0.6rem;
	}

	.weak-answer-focus,
	.repair-before,
	.repair-after {
		padding: 0.85rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.weak-answer-focus p,
	.repair-before p,
	.repair-after p {
		font-size: 1rem;
		font-weight: 450;
		line-height: 1.5;
	}

	.repair-workspace,
	.write-repair {
		display: grid;
		gap: 0.75rem;
	}

	.write-repair textarea {
		width: 100%;
		min-height: 8rem;
		padding: 0.8rem;
		border: 1px solid var(--qc-ui-border-strong);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
		line-height: 1.5;
		resize: vertical;
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

	.chain-earned li {
		border-radius: 0;
	}

	.chain-earned li > span,
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
		font-size: clamp(1.45rem, 3.5vw, 2.2rem);
		font-weight: 560;
		line-height: 1.15;
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

		.challenge-game :global(.challenge-visual-teaser) {
			display: none;
		}

		.answer-showdown {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.45rem;
		}

		.challenge-stage-heading h2 {
			font-size: clamp(1.08rem, 5.2vw, 1.42rem);
			line-height: 1.08;
		}

		.challenge-stage-heading {
			gap: 0.2rem;
		}

		.challenge-stage-heading p {
			font-size: 0.8rem;
			line-height: 1.3;
		}

		.showdown-instruction-wide,
		.question-meta-row {
			display: none;
		}

		.showdown-instruction-mobile {
			display: inline;
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

		.question-focus > header {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
