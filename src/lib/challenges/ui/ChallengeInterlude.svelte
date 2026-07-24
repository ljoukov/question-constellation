<script lang="ts">
	import { analyticsEvent } from '$lib/analytics/client';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { haptics } from '$lib/haptics';
	import {
		ArrowLeft,
		ArrowRight,
		Check,
		Eye,
		Focus,
		Link2,
		ListOrdered,
		ScanSearch,
		XCircle,
		Waypoints
	} from '@lucide/svelte';
	import { onMount, tick } from 'svelte';
	import type { PublicChallengeDefinition } from '../authoredData';
	import {
		buildChainEcho,
		buildDiagnosisReasonItems,
		buildEvidenceSweep,
		buildLinkOrder,
		challengeInterludeDefinitions,
		challengeInterludeScore,
		isLinkOrderCorrect,
		restoreLinkOrder,
		shuffledDiagnosisReasons,
		weaknessLensOptions,
		type DiagnosisReasonItem,
		type ChallengeInterludeMechanic,
		type ChallengeInterludeResult,
		type LinkOrderItem
	} from '../challengeInterludes';
	import type { ChallengePathScope } from '../routing';
	import { matchShortRecall, type ShortRecallPrompt } from '../shortRecall';
	import { playChallengeSound } from '../sound';
	import type { ChallengeWeakAnswerKind } from '../types';
	import { challengeVisual } from '../visuals';
	import ChallengeButton from './ChallengeButton.svelte';
	import ChallengeChoiceControl from './ChallengeChoice.svelte';

	let {
		challenge,
		shortRecallPrompt = null,
		mechanic,
		sessionStartedAt,
		sessionOrbit,
		sessionOrbitPosition,
		pathScope,
		pathPlannerVersion,
		oncomplete
	}: {
		challenge: PublicChallengeDefinition;
		shortRecallPrompt?: ShortRecallPrompt | null;
		mechanic: ChallengeInterludeMechanic;
		sessionStartedAt: string | null;
		sessionOrbit: number;
		sessionOrbitPosition: number;
		pathScope: ChallengePathScope;
		pathPlannerVersion: string;
		oncomplete: (result: ChallengeInterludeResult) => void;
	} = $props();

	let answerRevealed = $state(false);
	let echoFaded = $state(false);
	let echoResponse = $state('');
	let echoCorrect = $state(false);
	let echoRevealed = $state(false);
	let echoFeedback = $state('');
	let echoIncorrect = $state(false);
	let sweepIndex = $state(0);
	let sweepSelection = $state<boolean | null>(null);
	let sweepCorrectDecisions = $state(0);
	let sweepFinished = $state(false);
	let weaknessSelection = $state<ChallengeWeakAnswerKind | null>(null);
	let weaknessCorrect = $state(false);
	let linkOrder = $state<LinkOrderItem[]>([]);
	let linkOrderCorrect = $state(false);
	let linkOrderRevealed = $state(false);
	let linkOrderFeedback = $state('');
	let reasonIndex = $state(0);
	let reasonSelection = $state<string | null>(null);
	let reasonCorrectDecisions = $state(0);
	let reasonFinished = $state(false);
	let attempts = $state(0);
	let completed = $state(false);
	let startedAt = $state(0);
	let announcement = $state('');
	let heading = $state<HTMLElement | null>(null);
	let echoInput = $state<HTMLInputElement | null>(null);
	let resultFocus = $state<HTMLElement | null>(null);
	let sweepStatementFocus = $state<HTMLElement | null>(null);
	let reasonStatementFocus = $state<HTMLElement | null>(null);

	const definition = $derived(
		challengeInterludeDefinitions.find((candidate) => candidate.id === mechanic) ??
			challengeInterludeDefinitions[0]
	);
	const echo = $derived(buildChainEcho(challenge.memoryHandle));
	const visual = $derived(challengeVisual(challenge));
	const echoSteps = $derived(visual?.segments ?? echo.steps);
	const seededLinkOrder = $derived(buildLinkOrder(echoSteps, challenge.id));
	const shownLinkOrder = $derived(linkOrder.length > 0 ? linkOrder : seededLinkOrder);
	const echoHiddenIndex = $derived(
		Math.min(
			Math.max(0, shortRecallPrompt?.preferredHiddenStepIndex ?? echo.hiddenIndex),
			Math.max(0, echoSteps.length - 1)
		)
	);
	const echoExpectedAnswer = $derived(shortRecallPrompt?.canonicalAnswer ?? echo.hiddenStep);
	const echoStem = $derived(shortRecallPrompt?.stem ?? 'Restore the missing link: ___.');
	const echoResolved = $derived(echoCorrect || echoRevealed);
	const sweepItems = $derived(buildEvidenceSweep(challenge.repairChoices, challenge.id));
	const linkOrderResolved = $derived(linkOrderCorrect || linkOrderRevealed);
	const reasonItems = $derived(buildDiagnosisReasonItems(challenge.diagnosisChoices, challenge.id));
	const reasonOptions = $derived(shuffledDiagnosisReasons(reasonItems, challenge.id));
	const currentReasonItem = $derived<DiagnosisReasonItem | undefined>(reasonItems[reasonIndex]);
	const reasonSelectionCorrect = $derived(
		Boolean(currentReasonItem && reasonSelection === currentReasonItem.id)
	);
	const correctRepairChoice = $derived(
		challenge.repairChoices.find((choice) => choice.correct) ?? challenge.repairChoices[0]
	);
	const currentSweepItem = $derived(sweepItems[sweepIndex] ?? sweepItems[0]);
	const sweepAnswerCorrect = $derived(
		sweepSelection !== null &&
			Boolean(currentSweepItem) &&
			sweepSelection === currentSweepItem.earnsMark
	);
	const readyToFinish = $derived.by(() => {
		switch (mechanic) {
			case 'faded-examiner':
				return answerRevealed;
			case 'chain-echo':
				return echoResolved;
			case 'evidence-sweep':
				return sweepFinished;
			case 'weakness-lens':
				return weaknessSelection !== null;
			case 'link-order':
				return linkOrderResolved;
			case 'reason-match':
				return reasonFinished;
		}
	});

	onMount(() => {
		startedAt = performance.now();
		analyticsEvent('challenge_interlude_start', context());
		void focusHeading();
	});

	function context(extra: Record<string, unknown> = {}) {
		return {
			challengeId: challenge.id,
			subject: challenge.subject,
			mechanic,
			sessionPacing: 'mixed-orbit-v1',
			pathScope,
			pathPlannerVersion,
			sessionStartedAt,
			sessionOrbit,
			sessionOrbitPosition,
			selectionMode: 'automatic',
			...extra
		};
	}

	async function focusHeading() {
		await tick();
		heading?.focus({ preventScroll: true });
	}

	async function focusResult() {
		await tick();
		resultFocus?.focus({ preventScroll: true });
	}

	async function focusSweepStatement() {
		await tick();
		sweepStatementFocus?.focus({ preventScroll: true });
	}

	async function focusReasonStatement() {
		await tick();
		reasonStatementFocus?.focus({ preventScroll: true });
	}

	function revealAnswer() {
		if (answerRevealed) return;
		answerRevealed = true;
		haptics.selection();
		void playChallengeSound('reveal');
		announcement = 'The exam-ready answer and the scoring move are now visible.';
		analyticsEvent('challenge_interlude_reveal', context({ activity: 'answer-replay' }));
		void focusResult();
	}

	function fadeEchoLink() {
		if (echoFaded) return;
		echoFaded = true;
		haptics.selection();
		void playChallengeSound('reveal');
		announcement = 'One link has faded. Recall the missing words.';
		analyticsEvent(
			'challenge_interlude_reveal',
			context({
				activity: 'chain-echo',
				hiddenIndex: echoHiddenIndex,
				contentVersion: shortRecallPrompt?.contentVersion ?? 'legacy-fallback'
			})
		);
		void tick().then(() => echoInput?.focus());
	}

	function submitEcho() {
		if (echoResolved || !echoResponse.trim()) return;
		attempts += 1;
		const match = matchShortRecall(
			echoResponse,
			shortRecallPrompt ?? {
				canonicalAnswer: echo.hiddenStep,
				acceptedAliases: [],
				spellingVariants: []
			}
		);
		const correct = match.correct;
		if (correct) {
			echoCorrect = true;
			echoIncorrect = false;
			echoFeedback = 'That is the short answer this link needs.';
			haptics.success();
			void playChallengeSound('correct');
			announcement = 'The missing link is back in the chain.';
			void focusResult();
		} else {
			echoIncorrect = true;
			echoFeedback = 'Not that link yet. Try one or two words, or reveal it.';
			haptics.error();
			void playChallengeSound('incorrect');
			announcement = 'That does not restore the missing link yet.';
		}
		analyticsEvent(
			'challenge_interlude_decision',
			context({
				activity: 'chain-echo',
				correct,
				matchKind: match.kind,
				contentVersion: shortRecallPrompt?.contentVersion ?? 'legacy-fallback',
				attempt: attempts
			})
		);
	}

	function revealEchoLink() {
		if (echoResolved) return;
		echoRevealed = true;
		echoIncorrect = false;
		echoFeedback = 'Read the completed statement once.';
		haptics.selection();
		void playChallengeSound('reveal');
		announcement = `The short answer was ${echoExpectedAnswer}.`;
		analyticsEvent(
			'challenge_interlude_reveal',
			context({
				activity: 'chain-echo',
				supportUsed: true,
				contentVersion: shortRecallPrompt?.contentVersion ?? 'legacy-fallback',
				attempt: attempts
			})
		);
		void focusResult();
	}

	function judgeSweep(earnsMark: boolean) {
		if (sweepSelection !== null || !currentSweepItem) return;
		attempts += 1;
		sweepSelection = earnsMark;
		const correct = earnsMark === currentSweepItem.earnsMark;
		if (correct) {
			sweepCorrectDecisions += 1;
			haptics.success();
			void playChallengeSound('correct');
			announcement = currentSweepItem.feedback;
		} else {
			haptics.error();
			void playChallengeSound('incorrect');
			announcement = `Not quite. ${currentSweepItem.feedback}`;
		}
		analyticsEvent(
			'challenge_interlude_decision',
			context({
				activity: 'evidence-sweep',
				itemId: currentSweepItem.id,
				itemIndex: sweepIndex,
				correct,
				attempt: attempts
			})
		);
		void focusResult();
	}

	function advanceSweep() {
		if (sweepSelection === null) return;
		if (sweepIndex >= sweepItems.length - 1) {
			sweepFinished = true;
			haptics.selection();
			void playChallengeSound('reveal');
			announcement = 'Mark sweep complete.';
			void focusResult();
			return;
		}
		sweepIndex += 1;
		sweepSelection = null;
		haptics.selection();
		void focusSweepStatement();
	}

	function chooseWeakness(id: ChallengeWeakAnswerKind) {
		if (weaknessSelection !== null) return;
		attempts += 1;
		weaknessSelection = id;
		weaknessCorrect = id === challenge.weakAnswerKind;
		if (weaknessCorrect) {
			haptics.success();
			void playChallengeSound('correct');
			announcement = 'You named the answer weakness.';
		} else {
			haptics.selection();
			void playChallengeSound('reveal');
			announcement = 'The reviewed weakness is now highlighted.';
		}
		analyticsEvent(
			'challenge_interlude_decision',
			context({
				activity: 'weakness-lens',
				selectedKind: id,
				correct: weaknessCorrect,
				attempt: attempts
			})
		);
		void focusResult();
	}

	function moveLink(index: number, direction: -1 | 1) {
		if (linkOrderResolved) return;
		const nextIndex = index + direction;
		if (nextIndex < 0 || nextIndex >= shownLinkOrder.length) return;
		const reordered = [...shownLinkOrder];
		const current = reordered[index];
		const next = reordered[nextIndex];
		if (!current || !next) return;
		reordered[index] = next;
		reordered[nextIndex] = current;
		linkOrder = reordered;
		linkOrderFeedback = '';
		haptics.selection();
		announcement = `${current.label} moved to position ${nextIndex + 1}.`;
	}

	function checkLinkOrder() {
		if (linkOrderResolved) return;
		attempts += 1;
		const correct = isLinkOrderCorrect(shownLinkOrder);
		linkOrderCorrect = correct;
		if (correct) {
			linkOrderFeedback = 'The chain now runs from cause or method to outcome.';
			haptics.success();
			void playChallengeSound('correct');
			announcement = 'The answer chain is in order.';
			void focusResult();
		} else {
			linkOrderFeedback = 'A link is still out of sequence. Move it and check again.';
			haptics.error();
			void playChallengeSound('incorrect');
			announcement = 'The chain is not in order yet.';
		}
		analyticsEvent(
			'challenge_interlude_decision',
			context({ activity: 'link-order', correct, attempt: attempts })
		);
	}

	function revealLinkOrder() {
		if (linkOrderResolved) return;
		linkOrder = restoreLinkOrder(shownLinkOrder);
		linkOrderRevealed = true;
		linkOrderFeedback = 'Read the restored chain from first link to last.';
		haptics.selection();
		void playChallengeSound('reveal');
		announcement = 'The reviewed link order is visible.';
		analyticsEvent(
			'challenge_interlude_reveal',
			context({ activity: 'link-order', supportUsed: true, attempt: attempts })
		);
		void focusResult();
	}

	function chooseReason(reasonId: string) {
		if (reasonSelection !== null || !currentReasonItem) return;
		attempts += 1;
		reasonSelection = reasonId;
		const correct = reasonId === currentReasonItem.id;
		if (correct) {
			reasonCorrectDecisions += 1;
			haptics.success();
			void playChallengeSound('correct');
			announcement = `Diagnosis ${reasonIndex + 1} of ${reasonItems.length}. That diagnosis and reason match.`;
		} else {
			haptics.selection();
			void playChallengeSound('reveal');
			announcement = `Diagnosis ${reasonIndex + 1} of ${reasonItems.length}. The reviewed reason is now highlighted.`;
		}
		analyticsEvent(
			'challenge_interlude_decision',
			context({
				activity: 'reason-match',
				itemId: currentReasonItem.id,
				itemIndex: reasonIndex,
				selectedReasonId: reasonId,
				correct,
				attempt: attempts
			})
		);
		void focusResult();
	}

	function advanceReason() {
		if (reasonSelection === null) return;
		if (reasonIndex >= reasonItems.length - 1) {
			reasonFinished = true;
			haptics.selection();
			void playChallengeSound('reveal');
			announcement = `Reason match complete. ${reasonCorrectDecisions} of ${reasonItems.length} first choices matched.`;
			void focusResult();
			return;
		}
		reasonIndex += 1;
		reasonSelection = null;
		haptics.selection();
		announcement = `Diagnosis ${reasonIndex + 1} of ${reasonItems.length}. Choose the matching reason.`;
		void focusReasonStatement();
	}

	function finishInterlude() {
		if (!readyToFinish || completed) return;
		completed = true;
		const { totalDecisions, correctDecisions } = interludeDecisionCounts();
		const result: ChallengeInterludeResult = {
			mechanic,
			score: challengeInterludeScore(mechanic),
			durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
			attempts,
			correctDecisions,
			totalDecisions
		};
		haptics.success();
		void playChallengeSound('bank');
		analyticsEvent('challenge_interlude_complete', context(result));
		oncomplete(result);
	}

	function interludeDecisionCounts() {
		switch (mechanic) {
			case 'faded-examiner':
				return { correctDecisions: 0, totalDecisions: 0 };
			case 'chain-echo':
				return { correctDecisions: Number(echoCorrect), totalDecisions: 1 };
			case 'evidence-sweep':
				return { correctDecisions: sweepCorrectDecisions, totalDecisions: sweepItems.length };
			case 'weakness-lens':
				return { correctDecisions: Number(weaknessCorrect), totalDecisions: 1 };
			case 'link-order':
				return { correctDecisions: Number(linkOrderCorrect), totalDecisions: 1 };
			case 'reason-match':
				return {
					correctDecisions: reasonCorrectDecisions,
					totalDecisions: reasonItems.length
				};
		}
	}
</script>

<section class="challenge-interlude" aria-labelledby="interlude-title">
	<p class="interlude-announcement" aria-live="polite" aria-atomic="true">{announcement}</p>

	<header class="interlude-header" tabindex="-1" bind:this={heading}>
		<span class="interlude-icon" aria-hidden="true">
			{#if mechanic === 'faded-examiner'}
				<Eye size={23} strokeWidth={2.1} />
			{:else if mechanic === 'chain-echo'}
				<Link2 size={23} strokeWidth={2.1} />
			{:else if mechanic === 'evidence-sweep'}
				<ScanSearch size={23} strokeWidth={2.1} />
			{:else if mechanic === 'weakness-lens'}
				<Focus size={23} strokeWidth={2.1} />
			{:else if mechanic === 'link-order'}
				<ListOrdered size={23} strokeWidth={2.1} />
			{:else}
				<Waypoints size={23} strokeWidth={2.1} />
			{/if}
		</span>
		<div>
			<p>Quick review</p>
			<h2 id="interlude-title">{definition.label}</h2>
			<span>{definition.description}</span>
		</div>
	</header>

	{#if mechanic === 'faded-examiner'}
		<div class="answer-replay">
			<article>
				<span>Before · plausible but weak</span>
				<p><MathText text={challenge.staticAnswers[challenge.weakAnswer]} /></p>
			</article>
			<div class:revealed={answerRevealed} class="replay-after">
				<span>After · exam-ready</span>
				{#if answerRevealed}
					<p><MathText text={challenge.staticAnswers[challenge.strongerAnswer]} /></p>
				{:else}
					<div class="answer-placeholder" aria-hidden="true">
						<span></span><span></span><span></span>
					</div>
				{/if}
			</div>
		</div>

		{#if answerRevealed}
			<div class="interlude-explanation" tabindex="-1" bind:this={resultFocus}>
				<span>What earned the mark</span>
				<strong><MathText text={correctRepairChoice?.text ?? challenge.memoryHandle} /></strong>
			</div>
		{:else}
			<ChallengeButton onclick={revealAnswer} fullWidth>
				Reveal the upgrade
				<ArrowRight size={18} aria-hidden="true" />
			</ChallengeButton>
		{/if}
	{:else if mechanic === 'chain-echo'}
		<div class="echo-chain" aria-label="Question Chain">
			{#each echoSteps as step, index (`${index}:${step}`)}
				{#if index > 0}<ArrowRight size={17} strokeWidth={2.1} aria-hidden="true" />{/if}
				<span class:hidden={echoFaded && !echoResolved && index === echoHiddenIndex}>
					{echoFaded && !echoResolved && index === echoHiddenIndex ? '?' : step}
				</span>
			{/each}
		</div>

		{#if !echoFaded}
			<ChallengeButton onclick={fadeEchoLink} fullWidth>
				Fade one link
				<ArrowRight size={18} aria-hidden="true" />
			</ChallengeButton>
		{:else if !echoResolved}
			<form
				class="echo-recall"
				onsubmit={(event) => {
					event.preventDefault();
					submitEcho();
				}}
			>
				<div class="echo-prompt">
					<span>Complete in one or two words</span>
					<strong><MathText text={echoStem} /></strong>
				</div>
				<label for="chain-echo-response">Your short answer</label>
				<input
					id="chain-echo-response"
					bind:this={echoInput}
					type="text"
					autocomplete="off"
					spellcheck="true"
					maxlength="64"
					value={echoResponse}
					class:incorrect={echoIncorrect}
					aria-invalid={echoIncorrect}
					aria-describedby={echoFeedback ? 'chain-echo-feedback' : undefined}
					oninput={(event) => {
						echoResponse = event.currentTarget.value;
						if (echoIncorrect) {
							echoIncorrect = false;
							echoFeedback = '';
						}
					}}
					data-analytics-label={`Challenge ${challenge.id}: chain echo recall`}
					data-analytics-redact
				/>
				<div class="interlude-actions">
					<ChallengeButton onclick={submitEcho} disabled={!echoResponse.trim()} fullWidth>
						Check answer
					</ChallengeButton>
					<ChallengeButton variant="secondary" onclick={revealEchoLink} fullWidth>
						Show answer
					</ChallengeButton>
				</div>
				{#if echoFeedback}
					<p id="chain-echo-feedback" class:incorrect={echoIncorrect}>
						{#if echoIncorrect}<XCircle size={18} strokeWidth={2.4} aria-hidden="true" />{/if}
						<span>{echoFeedback}</span>
					</p>
				{/if}
			</form>
		{:else}
			<div class="interlude-explanation" tabindex="-1" bind:this={resultFocus}>
				<span>{echoCorrect ? 'Recalled answer' : 'Restored answer'}</span>
				<strong><MathText text={echoStem.replace('___', echoExpectedAnswer)} /></strong>
				<p>{echoFeedback}</p>
			</div>
		{/if}
	{:else if mechanic === 'evidence-sweep' && currentSweepItem}
		<div
			class="sweep-progress"
			role="progressbar"
			aria-label={`Statement ${Math.min(sweepIndex + 1, sweepItems.length)} of ${sweepItems.length}`}
			aria-valuemin="0"
			aria-valuemax={sweepItems.length}
			aria-valuenow={Math.min(sweepIndex + 1, sweepItems.length)}
			aria-valuetext={`Statement ${Math.min(sweepIndex + 1, sweepItems.length)} of ${sweepItems.length}`}
		>
			<span
				style={`--sweep-progress: ${(Math.min(sweepIndex + 1, sweepItems.length) / sweepItems.length) * 100}%`}
			></span>
		</div>

		{#if !sweepFinished}
			<article class="sweep-statement" tabindex="-1" bind:this={sweepStatementFocus}>
				<span>Statement {sweepIndex + 1} of {sweepItems.length}</span>
				<p><MathText text={currentSweepItem.text} /></p>
			</article>

			<div class="sweep-choices" role="group" aria-label="Would this earn the missing mark?">
				<ChallengeChoiceControl
					text="Earns the missing mark"
					marker="✓"
					selected={sweepSelection === true}
					status={sweepSelection !== null && currentSweepItem.earnsMark
						? 'correct'
						: sweepSelection === true && !currentSweepItem.earnsMark
							? 'incorrect'
							: 'idle'}
					disabled={sweepSelection !== null}
					onclick={() => judgeSweep(true)}
					analyticsLabel={`Challenge ${challenge.id}: mark sweep earns mark`}
				/>
				<ChallengeChoiceControl
					text="Not enough yet"
					marker="×"
					selected={sweepSelection === false}
					status={sweepSelection !== null && !currentSweepItem.earnsMark
						? 'correct'
						: sweepSelection === false && currentSweepItem.earnsMark
							? 'incorrect'
							: 'idle'}
					disabled={sweepSelection !== null}
					onclick={() => judgeSweep(false)}
					analyticsLabel={`Challenge ${challenge.id}: mark sweep no mark`}
				/>
			</div>

			{#if sweepSelection !== null}
				<div
					class:correct={sweepAnswerCorrect}
					class="sweep-feedback"
					tabindex="-1"
					bind:this={resultFocus}
				>
					<strong>{sweepAnswerCorrect ? 'Good call.' : 'Examiner check.'}</strong>
					<p>{currentSweepItem.feedback}</p>
				</div>
				<ChallengeButton onclick={advanceSweep} fullWidth>
					{sweepIndex >= sweepItems.length - 1 ? 'Finish the sweep' : 'Next statement'}
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{/if}
		{:else}
			<div class="interlude-explanation" tabindex="-1" bind:this={resultFocus}>
				<span>Mark sweep complete</span>
				<strong>{sweepCorrectDecisions} of {sweepItems.length} calls matched the examiner</strong>
				<p>{challenge.repairSuccess}</p>
			</div>
		{/if}
	{:else if mechanic === 'weakness-lens'}
		<article class="weakness-answer">
			<span>Review the weaker answer</span>
			<p><MathText text={challenge.staticAnswers[challenge.weakAnswer]} /></p>
		</article>

		<div class="weakness-options" role="group" aria-label="What kind of weakness is this?">
			{#each weaknessLensOptions as option, index (option.id)}
				<ChallengeChoiceControl
					text={option.label}
					marker={String(index + 1)}
					selected={weaknessSelection === option.id}
					status={weaknessSelection !== null && option.id === challenge.weakAnswerKind
						? 'correct'
						: weaknessSelection === option.id
							? 'incorrect'
							: 'idle'}
					disabled={weaknessSelection !== null}
					onclick={() => chooseWeakness(option.id)}
					analyticsLabel={`Challenge ${challenge.id}: weakness lens ${option.id}`}
				/>
			{/each}
		</div>

		{#if weaknessSelection !== null}
			<div class="interlude-explanation" tabindex="-1" bind:this={resultFocus}>
				<span>{weaknessCorrect ? 'Why it fits' : 'Reviewed weakness'}</span>
				{#if !weaknessCorrect}
					<strong>
						{weaknessLensOptions.find((option) => option.id === challenge.weakAnswerKind)?.label}
					</strong>
				{/if}
				<p>{challenge.showdownExplanation}</p>
			</div>
		{/if}
	{:else if mechanic === 'link-order'}
		<ol
			class:resolved={linkOrderResolved}
			class:correct={linkOrderCorrect}
			class="link-order-list"
			aria-label="Answer-chain links"
		>
			{#each shownLinkOrder as item, index (item.id)}
				<li style={`--link-order-delay: ${index * 90}ms`}>
					<span>{index + 1}</span>
					<strong><MathText text={item.label} /></strong>
					<div aria-label={`Move ${item.label}`}>
						<button
							type="button"
							onclick={() => moveLink(index, -1)}
							disabled={index === 0 || linkOrderResolved}
							aria-label={`Move ${item.label} one place earlier`}
						>
							<ArrowLeft size={16} aria-hidden="true" />
						</button>
						<button
							type="button"
							onclick={() => moveLink(index, 1)}
							disabled={index === shownLinkOrder.length - 1 || linkOrderResolved}
							aria-label={`Move ${item.label} one place later`}
						>
							<ArrowRight size={16} aria-hidden="true" />
						</button>
					</div>
				</li>
			{/each}
		</ol>

		{#if !linkOrderResolved}
			<div class="interlude-actions">
				<ChallengeButton onclick={checkLinkOrder} fullWidth>Check the chain</ChallengeButton>
				<ChallengeButton variant="secondary" onclick={revealLinkOrder} fullWidth>
					Show the order
				</ChallengeButton>
			</div>
			{#if linkOrderFeedback}<p class="inline-feedback" role="status">{linkOrderFeedback}</p>{/if}
		{:else}
			<div class="interlude-explanation" tabindex="-1" bind:this={resultFocus}>
				<span>{linkOrderCorrect ? 'Chain restored' : 'Reviewed order'}</span>
				<strong>{visual?.decisiveLabel ?? challenge.memoryHandle}</strong>
			</div>
		{/if}
	{:else if mechanic === 'reason-match' && currentReasonItem}
		<div
			class="sweep-progress"
			role="progressbar"
			aria-label={`Diagnosis ${Math.min(reasonIndex + 1, reasonItems.length)} of ${reasonItems.length}`}
			aria-valuemin="0"
			aria-valuemax={reasonItems.length}
			aria-valuenow={Math.min(reasonIndex + 1, reasonItems.length)}
			aria-valuetext={`Diagnosis ${Math.min(reasonIndex + 1, reasonItems.length)} of ${reasonItems.length}`}
		>
			<span
				style={`--sweep-progress: ${(Math.min(reasonIndex + 1, reasonItems.length) / reasonItems.length) * 100}%`}
			></span>
		</div>

		{#if !reasonFinished}
			<article class="reason-statement" tabindex="-1" bind:this={reasonStatementFocus}>
				<span>Diagnosis {reasonIndex + 1} of {reasonItems.length}</span>
				<p><MathText text={currentReasonItem.statement} /></p>
			</article>

			<div class="reason-options" role="group" aria-label="Choose the matching reason">
				{#each reasonOptions as option, index (option.id)}
					<ChallengeChoiceControl
						text={option.reason}
						marker={String.fromCharCode(65 + index)}
						selected={reasonSelection === option.id}
						status={reasonSelection !== null && option.id === currentReasonItem.id
							? 'correct'
							: reasonSelection === option.id
								? 'incorrect'
								: 'idle'}
						disabled={reasonSelection !== null}
						onclick={() => chooseReason(option.id)}
						analyticsLabel={`Challenge ${challenge.id}: reason match option ${option.id}`}
					/>
				{/each}
			</div>

			{#if reasonSelection !== null}
				<div
					class:correct={reasonSelectionCorrect}
					class="sweep-feedback"
					tabindex="-1"
					bind:this={resultFocus}
				>
					<strong>{reasonSelectionCorrect ? 'Matched.' : 'Reviewed match.'}</strong>
					<p>{currentReasonItem.reason}</p>
				</div>
				<ChallengeButton onclick={advanceReason} fullWidth>
					{reasonIndex >= reasonItems.length - 1 ? 'Finish matching' : 'Next diagnosis'}
					<ArrowRight size={18} aria-hidden="true" />
				</ChallengeButton>
			{/if}
		{:else}
			<div class="interlude-explanation" tabindex="-1" bind:this={resultFocus}>
				<span>Reason match complete</span>
				<strong>
					{reasonCorrectDecisions} of {reasonItems.length} first choices matched
				</strong>
				<p>{challenge.showdownExplanation}</p>
			</div>
		{/if}
	{/if}

	{#if readyToFinish}
		<div class="interlude-finish">
			<div>
				<Check size={18} strokeWidth={2.4} aria-hidden="true" />
				<span>+{challengeInterludeScore(mechanic)} points</span>
			</div>
			<ChallengeButton onclick={finishInterlude} fullWidth>
				Continue
				<ArrowRight size={18} aria-hidden="true" />
			</ChallengeButton>
		</div>
	{/if}
</section>

<style>
	.challenge-interlude {
		display: grid;
		gap: 0.8rem;
		width: min(100%, 48rem);
		margin: 0 auto;
		color: var(--qc-ui-text);
	}

	.interlude-announcement {
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

	.interlude-header {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.7rem;
		align-items: start;
		padding-bottom: 0.7rem;
		border-bottom: 1px solid var(--qc-ui-border-subtle);
		outline: none;
	}

	.interlude-icon {
		display: inline-grid;
		width: 2.65rem;
		height: 2.65rem;
		place-items: center;
		border: 1px solid var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
	}

	.interlude-header > div {
		display: grid;
		gap: 0.14rem;
		min-width: 0;
	}

	.interlude-header p,
	.interlude-header h2,
	.interlude-header span {
		margin: 0;
	}

	.interlude-header p {
		color: var(--qc-ui-accent-text);
		font-size: 0.68rem;
		font-weight: 760;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.interlude-header h2 {
		font-size: clamp(1.25rem, 3vw, 1.65rem);
		font-weight: 650;
		line-height: 1.15;
	}

	.interlude-header > div > span {
		color: var(--qc-ui-text-secondary);
		font-size: 0.85rem;
		line-height: 1.4;
	}

	.answer-replay {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.answer-replay article,
	.replay-after,
	.sweep-statement {
		display: grid;
		gap: 0.45rem;
		min-height: 9rem;
		align-content: start;
		padding: 0.85rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-raised);
	}

	.replay-after {
		border-style: dashed;
		background: var(--qc-ui-surface-muted);
	}

	.replay-after.revealed {
		border-style: solid;
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	.answer-replay span,
	.sweep-statement > span,
	.interlude-explanation > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.68rem;
		font-weight: 760;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.answer-replay p,
	.sweep-statement p {
		margin: 0;
		font-size: 0.98rem;
		line-height: 1.48;
	}

	.answer-placeholder {
		display: grid;
		gap: 0.55rem;
		padding-top: 0.25rem;
	}

	.answer-placeholder span {
		display: block;
		height: 0.62rem;
		background: var(--qc-ui-border-subtle);
	}

	.answer-placeholder span:nth-child(2) {
		width: 86%;
	}

	.answer-placeholder span:nth-child(3) {
		width: 62%;
	}

	.interlude-explanation {
		display: grid;
		gap: 0.35rem;
		padding: 0.8rem 0.85rem;
		border-left: 3px solid var(--qc-ui-accent);
		background: var(--qc-ui-accent-muted);
		outline: none;
	}

	.interlude-explanation strong {
		font-size: 1.05rem;
		line-height: 1.35;
	}

	.interlude-explanation p {
		margin: 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.88rem;
		line-height: 1.5;
	}

	.echo-chain {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.42rem;
		min-height: 8.5rem;
		padding: 1rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.echo-chain > span {
		display: inline-grid;
		min-height: 2.65rem;
		place-items: center;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-raised);
		font-size: 0.88rem;
		font-weight: 660;
		line-height: 1.3;
		text-align: center;
		transition:
			background 220ms ease,
			color 220ms ease,
			opacity 220ms ease;
	}

	.echo-chain > span.hidden {
		min-width: 4.5rem;
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
		color: var(--qc-ui-accent-text);
		font-size: 1.2rem;
	}

	.sweep-choices {
		display: grid;
		gap: 0.5rem;
	}

	.echo-recall {
		display: grid;
		gap: 0.5rem;
	}

	.echo-prompt,
	.weakness-answer,
	.reason-statement {
		display: grid;
		gap: 0.35rem;
		padding: 0.8rem 0.85rem;
		border: 1px solid var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-raised);
	}

	.echo-prompt span,
	.weakness-answer > span,
	.reason-statement > span {
		color: var(--qc-ui-text-muted);
		font-size: 0.68rem;
		font-weight: 760;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.echo-prompt strong {
		font-size: clamp(1rem, 2vw, 1.16rem);
		line-height: 1.4;
	}

	.weakness-answer p,
	.reason-statement p {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.48;
	}

	.echo-recall label {
		color: var(--qc-ui-text);
		font-size: 0.86rem;
		font-weight: 680;
	}

	.echo-recall input {
		width: 100%;
		min-height: 3rem;
		padding: 0.65rem 0.72rem;
		border: 1px solid var(--qc-ui-border-control);
		border-radius: 0;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
		font-size: 1rem;
	}

	.echo-recall input:focus-visible {
		border-color: var(--qc-ui-focus-ring);
		outline: 3px solid var(--qc-ui-focus-ring);
		outline-offset: 1px;
	}

	.echo-recall input.incorrect {
		border-color: var(--qc-ui-danger);
		background: color-mix(in srgb, var(--qc-ui-danger) 11%, var(--qc-ui-surface-raised));
		box-shadow: inset 3px 0 0 var(--qc-ui-danger);
	}

	.echo-recall input.incorrect:focus-visible {
		border-color: var(--qc-ui-danger);
		outline-color: color-mix(in srgb, var(--qc-ui-danger) 72%, transparent);
	}

	:global(html[data-visual-effects='on']) .echo-recall input.incorrect {
		animation: echo-incorrect-shake 260ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}

	.interlude-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.echo-recall > p {
		display: flex;
		align-items: center;
		gap: 0.38rem;
		margin: 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.echo-recall > p.incorrect {
		color: var(--qc-ui-danger);
		font-weight: 680;
	}

	.sweep-choices {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.weakness-options,
	.reason-options {
		display: grid;
		gap: 0.5rem;
	}

	.weakness-options {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.inline-feedback {
		margin: 0;
		color: var(--qc-ui-text-secondary);
		font-size: 0.84rem;
		line-height: 1.45;
	}

	.link-order-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.link-order-list li {
		position: relative;
		display: grid;
		min-width: 0;
		gap: 0.42rem;
		align-content: space-between;
		overflow: hidden;
		padding: 0.72rem;
		border: 1px solid var(--qc-ui-border-strong);
		background: var(--qc-ui-surface-raised);
	}

	.link-order-list li::after {
		position: absolute;
		right: 0;
		bottom: 0;
		left: 0;
		height: 2px;
		background: var(--qc-ui-accent);
		content: '';
		opacity: 0;
		pointer-events: none;
		transform: scaleX(0);
		transform-origin: left center;
	}

	.link-order-list li > span {
		color: var(--qc-ui-accent-text);
		font-size: 0.68rem;
		font-weight: 760;
	}

	.link-order-list li > strong {
		font-size: 0.88rem;
		line-height: 1.35;
	}

	.link-order-list li > div {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.35rem;
	}

	.link-order-list button {
		display: inline-grid;
		min-height: 2.75rem;
		place-items: center;
		border: 1px solid var(--qc-ui-border-control);
		border-radius: 0;
		background: var(--qc-ui-surface-muted);
		color: var(--qc-ui-text);
		cursor: pointer;
	}

	.link-order-list button:hover:not(:disabled) {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	.link-order-list button:focus-visible {
		outline: 3px solid var(--qc-ui-focus-ring);
		outline-offset: 1px;
	}

	.link-order-list button:disabled {
		opacity: 0.38;
		cursor: default;
	}

	.link-order-list.resolved li {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	:global(html[data-visual-effects='on']) .link-order-list.resolved.correct li::after {
		animation: link-order-trace 540ms cubic-bezier(0.22, 0.8, 0.3, 1) var(--link-order-delay) both;
	}

	.sweep-progress {
		height: 3px;
		overflow: hidden;
		background: var(--qc-ui-border-subtle);
	}

	.sweep-progress span {
		display: block;
		width: var(--sweep-progress);
		height: 100%;
		background: var(--qc-ui-accent);
		transition: width 220ms ease;
	}

	.sweep-statement {
		min-height: 7.5rem;
		border-color: var(--qc-ui-border-strong);
	}

	.sweep-statement p {
		font-size: clamp(1rem, 2vw, 1.12rem);
		font-weight: 560;
	}

	.sweep-feedback {
		display: grid;
		gap: 0.18rem;
		padding: 0.7rem 0.8rem;
		border-left: 3px solid var(--qc-ui-warning);
		background: color-mix(in srgb, var(--qc-ui-warning) 8%, var(--qc-ui-surface));
		outline: none;
	}

	.sweep-feedback.correct {
		border-left-color: var(--qc-ui-accent);
		background: var(--qc-ui-accent-muted);
	}

	.sweep-feedback strong,
	.sweep-feedback p {
		margin: 0;
	}

	.sweep-feedback p {
		color: var(--qc-ui-text-secondary);
		font-size: 0.86rem;
		line-height: 1.45;
	}

	.interlude-finish {
		display: grid;
		gap: 0.55rem;
		padding-top: 0.25rem;
		border-top: 1px solid var(--qc-ui-border-subtle);
	}

	.interlude-finish > div {
		display: flex;
		align-items: center;
		gap: 0.42rem;
		color: var(--qc-ui-accent-text);
		font-size: 0.78rem;
		font-weight: 680;
	}

	@keyframes link-order-trace {
		0% {
			opacity: 0;
			transform: scaleX(0);
		}
		28% {
			opacity: 0.9;
		}
		100% {
			opacity: 0.62;
			transform: scaleX(1);
		}
	}

	@keyframes echo-incorrect-shake {
		0%,
		100% {
			transform: translateX(0);
		}

		28% {
			transform: translateX(-3px);
		}

		55% {
			transform: translateX(2px);
		}

		78% {
			transform: translateX(-1px);
		}
	}

	@media (max-width: 620px) {
		.challenge-interlude {
			gap: 0.65rem;
		}

		.interlude-header {
			grid-template-columns: auto minmax(0, 1fr);
		}

		.answer-replay,
		.sweep-choices,
		.weakness-options,
		.interlude-actions {
			grid-template-columns: minmax(0, 1fr);
		}

		.link-order-list {
			grid-template-columns: minmax(0, 1fr);
		}

		.link-order-list li {
			grid-template-columns: auto minmax(0, 1fr) auto;
			align-items: center;
		}

		.link-order-list li > div {
			width: 6rem;
		}

		.answer-replay article,
		.replay-after {
			min-height: 0;
		}

		.echo-chain {
			min-height: 0;
			padding: 0.75rem 0.55rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.echo-recall input {
			animation: none !important;
		}

		.echo-chain > span,
		.sweep-progress span,
		.link-order-list li {
			transition: none;
		}

		:global(html[data-visual-effects='on']) .link-order-list.resolved.correct li::after {
			animation: none;
		}
	}

	:global(html[data-visual-effects='off']) .echo-chain > span,
	:global(html[data-visual-effects='off']) .sweep-progress span,
	:global(html[data-visual-effects='off']) .link-order-list li {
		transition: none;
	}
</style>
