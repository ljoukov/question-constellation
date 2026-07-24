<script lang="ts">
	import { analyticsEvent } from '$lib/analytics/client';
	import { ShieldCheck, Target, Trophy } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import {
		nextChallengeScoreLandmark,
		projectChallengeLeaderboard,
		type ChallengeLeaderboardEntry,
		type ChallengeLeaderboardSnapshot
	} from '../leaderboard';

	let {
		snapshot,
		scopeLabel,
		personalScore,
		personalCompleted,
		signedIn
	}: {
		snapshot: ChallengeLeaderboardSnapshot;
		scopeLabel: string;
		personalScore: number;
		personalCompleted: number;
		signedIn: boolean;
	} = $props();

	const landmark = $derived(nextChallengeScoreLandmark(personalScore));
	const currentTopEntry = $derived(snapshot.entries.find((entry) => entry.isCurrentUser) ?? null);
	const currentEntry = $derived(currentTopEntry ?? snapshot.currentUserEntry);
	const projection = $derived(
		projectChallengeLeaderboard({
			snapshot,
			score: personalScore,
			completed: personalCompleted,
			includeCurrentUser: signedIn
		})
	);
	const rivalTarget = $derived(
		signedIn &&
			projection.nextRival &&
			projection.pointsToNextRank !== null &&
			projection.pointsToNextRank < landmark.remaining
			? projection.nextRival
			: null
	);
	const targetProgress = $derived(
		rivalTarget ? Math.min(1, personalScore / Math.max(1, rivalTarget.score)) : landmark.progress
	);
	const targetRemaining = $derived(
		rivalTarget ? (projection.pointsToNextRank ?? landmark.remaining) : landmark.remaining
	);

	onMount(() => {
		analyticsEvent('challenge_leaderboard_view', {
			scopeLabel,
			personalScore,
			personalCompleted,
			currentRank: currentEntry?.rank ?? null,
			participantCount: snapshot.participantCount,
			visibleEntries: snapshot.entries.length
		});
	});

	function completionLabel(entry: ChallengeLeaderboardEntry) {
		return `${entry.completed} ${entry.completed === 1 ? 'challenge' : 'challenges'}`;
	}
</script>

<section class="challenge-board" id="challenge-board" aria-labelledby="challenge-board-title">
	<header>
		<div class="board-heading">
			<span><Trophy size={17} strokeWidth={2.3} aria-hidden="true" /> Challenge board</span>
			<h2 id="challenge-board-title">{scopeLabel} atlas scores</h2>
			<p>Best score from each unique challenge. Replays can improve it; speed never ranks you.</p>
		</div>

		<div class="personal-line" aria-label="Your personal challenge score">
			<span>Your score</span>
			<strong>{personalScore.toLocaleString('en-GB')}</strong>
			<small>
				{personalCompleted} complete{currentEntry ? ` · rank ${currentEntry.rank}` : ''}
			</small>
		</div>
	</header>

	<div
		class="landmark"
		aria-label={rivalTarget
			? `${targetRemaining} points to rank ${rivalTarget.rank}`
			: `${targetRemaining} points to the next score landmark`}
	>
		<div>
			<span>
				<Target size={15} strokeWidth={2.2} aria-hidden="true" />
				{rivalTarget ? 'Next rank' : 'Next landmark'}
			</span>
			<strong>
				{rivalTarget
					? `Rank ${rivalTarget.rank} · ${rivalTarget.score.toLocaleString('en-GB')} pts`
					: `${landmark.next.toLocaleString('en-GB')} pts`}
			</strong>
		</div>
		<div class="landmark-track" aria-hidden="true">
			<span style={`--landmark-progress:${targetProgress * 100}%`}></span>
		</div>
		<small>
			{targetRemaining.toLocaleString('en-GB')} points
			{rivalTarget ? ` to rank ${rivalTarget.rank}` : ' to go'}
		</small>
	</div>

	{#if snapshot.entries.length > 0}
		<ol aria-label={`${scopeLabel} challenge leaderboard`}>
			{#each snapshot.entries as entry (`${entry.rank}-${entry.alias}`)}
				<li class:you={entry.isCurrentUser}>
					<span class="rank">{entry.rank}</span>
					<div>
						<strong>{entry.isCurrentUser ? 'You' : entry.alias}</strong>
						<small>{completionLabel(entry)}</small>
					</div>
					<span class="points">{entry.score.toLocaleString('en-GB')} pts</span>
				</li>
			{/each}
		</ol>

		{#if snapshot.currentUserEntry}
			<div class="your-position">
				<span>Your position</span>
				<div>
					<span class="rank">{snapshot.currentUserEntry.rank}</span>
					<div>
						<strong>You</strong>
						<small>{completionLabel(snapshot.currentUserEntry)}</small>
					</div>
					<span class="points">{snapshot.currentUserEntry.score.toLocaleString('en-GB')} pts</span>
				</div>
			</div>
		{/if}
	{:else}
		<div class="empty-board">
			<Trophy size={21} strokeWidth={2} aria-hidden="true" />
			<p>The first signed-in atlas scores will appear here.</p>
		</div>
	{/if}

	<footer>
		<ShieldCheck size={15} strokeWidth={2.2} aria-hidden="true" />
		<span>
			Generated aliases only—never learner names. {snapshot.participantCount.toLocaleString(
				'en-GB'
			)} on this board.
		</span>
	</footer>
</section>

<style>
	.challenge-board {
		position: relative;
		display: grid;
		gap: 0.8rem;
		overflow: hidden;
		padding: clamp(0.9rem, 2.2vw, 1.2rem);
		border: 1px solid var(--qc-ui-border);
		background:
			linear-gradient(135deg, var(--qc-ui-accent-muted), transparent 44%),
			var(--qc-ui-surface-raised);
		box-shadow: 0 1rem 2.8rem var(--qc-ui-shadow);
	}

	.challenge-board::after {
		position: absolute;
		inset: 0 auto 0 -30%;
		width: 18%;
		background: linear-gradient(90deg, transparent, color-mix(in srgb, white 5%, transparent));
		content: '';
		opacity: 0;
		pointer-events: none;
		transform: skewX(-14deg);
	}

	.challenge-board > * {
		position: relative;
		z-index: 1;
	}

	header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1rem;
		align-items: end;
	}

	.board-heading {
		display: grid;
		gap: 0.28rem;
	}

	.board-heading > span,
	.landmark span,
	.personal-line > span,
	.your-position > span {
		display: inline-flex;
		gap: 0.36rem;
		align-items: center;
		color: var(--qc-ui-accent-text);
		font-size: 0.7rem;
		font-weight: 820;
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-size: clamp(1.25rem, 2.8vw, 1.75rem);
		line-height: 1.12;
	}

	.board-heading p {
		max-width: 42rem;
		color: var(--qc-ui-text-secondary);
		font-size: 0.86rem;
		line-height: 1.45;
	}

	.personal-line {
		display: grid;
		min-width: 9.5rem;
		gap: 0.08rem;
		padding: 0.65rem 0.75rem;
		border-left: 3px solid var(--qc-ui-accent);
		background: var(--qc-ui-surface);
	}

	.personal-line strong {
		font-size: 1.35rem;
		font-variant-numeric: tabular-nums;
	}

	.personal-line small,
	.landmark small,
	li small,
	.your-position small {
		color: var(--qc-ui-text-secondary);
		font-size: 0.72rem;
	}

	.landmark {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.3rem 0.8rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.landmark > div:first-child {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		grid-column: 1 / -1;
	}

	.landmark-track {
		height: 0.32rem;
		overflow: hidden;
		background: var(--qc-ui-border-subtle);
	}

	.landmark-track span {
		display: block;
		width: var(--landmark-progress);
		height: 100%;
		background: var(--qc-ui-accent);
	}

	ol {
		display: grid;
		gap: 0.35rem;
		padding: 0;
		margin: 0;
		list-style: none;
	}

	li,
	.your-position > div {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 0.65rem;
		align-items: center;
		min-width: 0;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface);
	}

	li.you,
	.your-position > div {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	.rank {
		display: inline-grid;
		width: 1.8rem;
		height: 1.8rem;
		place-items: center;
		border: 1px solid currentColor;
		color: var(--qc-ui-accent-text);
		font-size: 0.75rem;
		font-weight: 850;
		font-variant-numeric: tabular-nums;
	}

	li > div,
	.your-position > div > div {
		display: grid;
		min-width: 0;
		gap: 0.06rem;
	}

	li strong,
	.your-position strong {
		overflow: hidden;
		font-size: 0.9rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.points {
		font-size: 0.88rem;
		font-weight: 760;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.your-position {
		display: grid;
		gap: 0.25rem;
		padding-top: 0.15rem;
		border-top: 1px dashed var(--qc-ui-border);
	}

	.empty-board {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		padding: 0.8rem;
		border: 1px dashed var(--qc-ui-border);
		color: var(--qc-ui-text-secondary);
	}

	footer {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		color: var(--qc-ui-text-muted);
		font-size: 0.7rem;
		line-height: 1.4;
	}

	:global(html[data-visual-effects='on']) .challenge-board::after {
		animation: board-scan 7s ease-in-out 700ms infinite;
	}

	:global(html[data-visual-effects='on']) li.you,
	:global(html[data-visual-effects='on']) .your-position > div {
		animation: personal-rank-pulse 900ms ease-out both;
	}

	@keyframes board-scan {
		0%,
		72% {
			left: -30%;
			opacity: 0;
		}
		78% {
			opacity: 0.7;
		}
		92% {
			left: 112%;
			opacity: 0;
		}
		100% {
			left: 112%;
			opacity: 0;
		}
	}

	@keyframes personal-rank-pulse {
		0% {
			box-shadow: inset 0 0 0 1px var(--qc-ui-accent);
		}
		100% {
			box-shadow: inset 0 0 0 0 transparent;
		}
	}

	@media (max-width: 580px) {
		header {
			grid-template-columns: minmax(0, 1fr);
		}

		.personal-line {
			min-width: 0;
		}

		li,
		.your-position > div {
			gap: 0.48rem;
			padding-inline: 0.5rem;
		}

		.points {
			font-size: 0.8rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.challenge-board::after,
		:global(html[data-visual-effects='on']) .challenge-board::after {
			display: none;
			animation: none;
		}

		li.you,
		.your-position > div,
		:global(html[data-visual-effects='on']) li.you,
		:global(html[data-visual-effects='on']) .your-position > div {
			animation: none;
		}
	}
</style>
