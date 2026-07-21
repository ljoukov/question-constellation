<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import type { PublicChallengePreviewDefinition } from '$lib/challenges/authoredData';
	import { challengeProgressTotals, type ChallengeProgress } from '$lib/challenges/progress';
	import {
		CHALLENGE_PROGRESS_UPDATED_EVENT,
		type ChallengeProgressUpdatedDetail
	} from '$lib/challenges/progressSync';
	import {
		mostRecentlyCompletedChallenge,
		recommendedUnfinishedChallenge
	} from '$lib/challenges/recommendations';
	import { challengePath, challengeSubjectLabel } from '$lib/challenges/routing';
	import { subjectArtForChallenge } from '$lib/challenges/subjectVisuals';
	import ThemeAwareChallengeArt from '$lib/challenges/ui/ThemeAwareChallengeArt.svelte';
	import type { UserHomeSnapshot } from '$lib/learning/homeSnapshotTypes';
	import { ArrowRight, Gamepad2, Settings2, Sparkles } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { hydrateSignedInChallengeProgress } from './subjectChallengePromotion';

	type HomeDashboard = UserHomeSnapshot['dashboard'];
	type HomeSubject = HomeDashboard['subjects'][number];
	type PendingLocalSubject = {
		subject: string;
		courseLabel: string;
	};

	let {
		dashboard,
		userId,
		challengeProgress,
		challengeCatalog,
		challengeRecommendation,
		challengeCompletedCount,
		challengeTotalBestScore,
		snapshotInitialising = false,
		pendingLocalSubjects = []
	}: {
		dashboard: HomeDashboard;
		userId: string;
		challengeProgress: ChallengeProgress;
		challengeCatalog: PublicChallengePreviewDefinition[];
		challengeRecommendation: PublicChallengePreviewDefinition | null;
		challengeCompletedCount: number;
		challengeTotalBestScore: number;
		snapshotInitialising?: boolean;
		pendingLocalSubjects?: PendingLocalSubject[];
	} = $props();
	let liveChallengeRecommendation = $derived(challengeRecommendation);
	let liveChallengeCompletedCount = $derived(challengeCompletedCount);
	let liveChallengeTotalBestScore = $derived(challengeTotalBestScore);
	let progressHydrated = $state(false);
	const resolveInternalPath = resolve as (path: string) => ResolvedPathname;
	const challengeHref = $derived(
		liveChallengeRecommendation
			? resolveInternalPath(challengePath(liveChallengeRecommendation))
			: resolve('/challenges')
	);
	const challengeArt = $derived(
		liveChallengeRecommendation ? subjectArtForChallenge(liveChallengeRecommendation) : null
	);

	onMount(() => {
		const applyProgress = (progress: ChallengeProgress) => {
			const totals = challengeProgressTotals(progress);
			liveChallengeRecommendation =
				recommendedUnfinishedChallenge(challengeCatalog, progress) ??
				mostRecentlyCompletedChallenge(challengeCatalog, progress);
			liveChallengeCompletedCount = totals.completedCount;
			liveChallengeTotalBestScore = totals.totalBestScore;
		};
		applyProgress(hydrateSignedInChallengeProgress(challengeProgress, userId, window.localStorage));
		progressHydrated = true;
		const handleProgressUpdated = (event: Event) => {
			const detail = (event as CustomEvent<ChallengeProgressUpdatedDetail>).detail;
			if (detail?.userId !== userId || !detail.progress) return;
			applyProgress(detail.progress);
		};
		window.addEventListener(CHALLENGE_PROGRESS_UPDATED_EVENT, handleProgressUpdated);
		return () => {
			window.removeEventListener(CHALLENGE_PROGRESS_UPDATED_EVENT, handleProgressUpdated);
		};
	});

	const hasWeeklyActivity = $derived(
		dashboard.weeklySummary.attemptCount +
			dashboard.weeklySummary.recallCount +
			dashboard.weeklySummary.closedGapCount >
			0
	);

	function hasProgress(subject: HomeSubject) {
		return (
			subject.progress.coverageCount > 0 ||
			subject.progress.secureCount > 0 ||
			subject.progress.dueCount > 0 ||
			subject.progress.examAnswerCount > 0
		);
	}

	function progressSummary(subject: HomeSubject) {
		if (subject.scope.status === 'not_set') return null;
		if (hasProgress(subject)) return subject.progress.coverageLabel;
		return subject.scope.status === 'all'
			? `All ${subject.scope.totalCount} ${subject.scope.unitPlural}`
			: `${subject.scope.includedCount} of ${subject.scope.totalCount} ${subject.scope.unitPlural}`;
	}

	function weeklySummary() {
		return [
			dashboard.weeklySummary.attemptCount > 0
				? `${dashboard.weeklySummary.attemptCount} checked ${dashboard.weeklySummary.attemptCount === 1 ? 'answer' : 'answers'}`
				: null,
			dashboard.weeklySummary.recallCount > 0
				? `${dashboard.weeklySummary.recallCount} recall ${dashboard.weeklySummary.recallCount === 1 ? 'check' : 'checks'}`
				: null,
			dashboard.weeklySummary.closedGapCount > 0
				? `${dashboard.weeklySummary.closedGapCount} ${dashboard.weeklySummary.closedGapCount === 1 ? 'gap closed' : 'gaps closed'}`
				: null
		]
			.filter(Boolean)
			.join(' · ');
	}

	function cardHref(subject: HomeSubject) {
		return subject.scope.status === 'not_set' ||
			subject.nextAction.kind === 'scope' ||
			subject.nextAction.kind === 'resume'
			? subject.nextAction.href
			: subject.href;
	}

	function cardActionLabel(subject: HomeSubject) {
		if (subject.scope.status === 'not_set') return 'Set up';
		if (subject.nextAction.kind === 'resume') return 'Resume';
		return subject.nextAction.kind === 'scope' ? 'Adjust' : 'Open';
	}

	function setupPrompt(subject: HomeSubject) {
		if (subject.scope.unitPlural === 'content choices') {
			return 'Confirm what your class is studying';
		}
		if (subject.scope.unitPlural === 'set texts') {
			return 'Choose the texts your class is studying';
		}
		return 'Tell us what your class has covered';
	}
</script>

<section class="qc-learning-layout qc-home-learning-layout" aria-labelledby="learning-home-title">
	<aside class="qc-learning-sidebar">
		<header class="qc-learning-heading">
			<h1 id="learning-home-title">
				{dashboard.studentName ? `Hello, ${dashboard.studentName}.` : 'Welcome back.'}
			</h1>
			<p>Open a subject to see what to do next.</p>
		</header>

		{#if hasWeeklyActivity}
			<section class="qc-dashboard-panel" aria-label="This week's activity">
				<header class="qc-dashboard-panel-head">
					<p class="qc-panel-label">This week</p>
					<Sparkles size={18} aria-hidden="true" />
				</header>
				<p>{weeklySummary()}</p>
			</section>
		{/if}

		<section
			class="qc-dashboard-panel qc-home-challenge-card"
			aria-labelledby="home-challenge-title"
		>
			<header class="qc-dashboard-panel-head">
				<div>
					<p class="qc-panel-label">Challenges</p>
					<a href={resolve('/challenges')}>Explore all</a>
				</div>
				<Gamepad2 size={18} aria-hidden="true" />
			</header>

			{#if challengeArt}
				<div class="qc-home-challenge-art">
					<ThemeAwareChallengeArt
						src={challengeArt.src}
						darkSrc={challengeArt.darkSrc}
						alt={challengeArt.alt}
						width={challengeArt.width}
						height={challengeArt.height}
					/>
				</div>
			{/if}

			<div class="qc-home-challenge-copy">
				{#if liveChallengeRecommendation}
					<p class="qc-home-challenge-subject">
						{challengeSubjectLabel(liveChallengeRecommendation.subject)}
					</p>
					<h2 id="home-challenge-title">{liveChallengeRecommendation.title}</h2>
					<p>{liveChallengeRecommendation.hook}</p>
				{:else}
					<h2 id="home-challenge-title">Your science challenges</h2>
					<p>Replay a challenge to improve your personal best.</p>
				{/if}
			</div>

			{#if snapshotInitialising && !progressHydrated}
				<p class="qc-home-challenge-stats syncing" aria-live="polite">
					Syncing saved challenge progress…
				</p>
			{:else}
				<p class="qc-home-challenge-stats" aria-label="Challenge progress">
					<span><strong>{liveChallengeCompletedCount}</strong> complete</span>
					<span><strong>{liveChallengeTotalBestScore.toLocaleString('en-GB')}</strong> points</span>
				</p>
			{/if}

			<a
				class="qc-dashboard-action qc-home-challenge-action"
				href={challengeHref}
				data-analytics-label={liveChallengeRecommendation
					? `Play ${liveChallengeRecommendation.title}`
					: 'Explore science challenges'}
			>
				{liveChallengeRecommendation ? 'Play now' : 'Explore challenges'}
				<ArrowRight size={16} aria-hidden="true" />
			</a>
		</section>
	</aside>

	<section class="qc-learning-main" aria-labelledby="subjects-heading">
		<div class="qc-dashboard-section-head">
			<h2 id="subjects-heading">Your subjects</h2>
		</div>

		<div class="qc-dashboard-subjects">
			{#each dashboard.subjects as lane (lane.subject)}
				<a
					class="qc-subject-card"
					class:setup={lane.scope.status === 'not_set'}
					data-action={lane.nextAction.kind}
					href={resolveInternalPath(cardHref(lane))}
				>
					<header>
						<div>
							<h3>{lane.subject}</h3>
							<p>{lane.courseLabel}</p>
							{#if progressSummary(lane)}
								<p class="qc-subject-card-progress">{progressSummary(lane)}</p>
							{/if}
							{#if lane.scope.status !== 'not_set'}
								<p class="qc-subject-card-performance">
									<span>{lane.progress.checkedAnswerPerformance.label}</span>
									{#if lane.progress.checkedAnswerPerformance.value}
										<strong>{lane.progress.checkedAnswerPerformance.value}</strong>
									{/if}
								</p>
							{/if}
						</div>
					</header>

					<div class="qc-subject-next">
						<span>
							{lane.nextAction.kind === 'resume' ? 'Resume' : 'Next'}
							{#if lane.scope.status !== 'not_set' && lane.nextAction.durationMinutes}
								· {lane.nextAction.durationMinutes} min{/if}
						</span>
						<strong>
							{lane.scope.status === 'not_set' ? setupPrompt(lane) : lane.nextAction.title}
						</strong>
					</div>

					<div class="qc-subject-actions">
						<span class="qc-dashboard-action">
							{cardActionLabel(lane)}
							<ArrowRight size={16} aria-hidden="true" />
						</span>
					</div>
				</a>
			{:else}
				<article class="qc-dashboard-panel primary">
					{#if pendingLocalSubjects.length > 0}
						<h2>Bringing over your saved subjects…</h2>
						<p>{pendingLocalSubjects.map((subject) => subject.subject).join(' · ')}</p>
					{:else if snapshotInitialising}
						<h2>Loading your subjects…</h2>
						<p>Your subject choices will appear here in a moment.</p>
					{:else}
						<h2>Add your subjects</h2>
						<p>Choose the subjects and exam boards your school uses.</p>
						<a class="qc-dashboard-action" href={resolve('/profile')}>Set up subjects</a>
					{/if}
				</article>
			{/each}
		</div>
	</section>

	{#if dashboard.subjects.length > 0}
		<nav class="qc-subject-actions qc-learning-resources" aria-label="Subject settings">
			<a class="qc-action-button compact" href={resolve('/profile')}>
				<Settings2 size={18} aria-hidden="true" />
				Subjects and exam boards
			</a>
		</nav>
	{/if}
</section>

<style>
	.qc-home-challenge-card {
		gap: 0.68rem;
		border-color: rgba(22, 132, 88, 0.28);
	}

	.qc-home-challenge-card .qc-dashboard-panel-head > div {
		display: grid;
		gap: 0.2rem;
	}

	.qc-home-challenge-card .qc-dashboard-panel-head a {
		color: var(--qc-ui-accent-text);
		font-size: 0.8rem;
		font-weight: 720;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.qc-home-challenge-art {
		overflow: hidden;
		aspect-ratio: 16 / 9;
		border: 1px solid var(--qc-ui-border-subtle);
		background: var(--qc-ui-surface-muted);
	}

	.qc-home-challenge-art :global(.theme-aware-challenge-art) {
		width: 100%;
		height: 100%;
	}

	.qc-home-challenge-copy {
		display: grid;
		gap: 0.34rem;
		min-width: 0;
	}

	.qc-home-challenge-copy h2 {
		margin: 0;
		font-size: 1rem;
		line-height: 1.24;
	}

	.qc-home-challenge-copy > p {
		font-size: 0.84rem;
		line-height: 1.38;
	}

	.qc-home-challenge-copy > .qc-home-challenge-subject {
		color: #126647;
		font-size: 0.72rem;
		font-weight: 760;
		letter-spacing: 0.05em;
		line-height: 1.2;
		text-transform: uppercase;
	}

	.qc-home-challenge-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.75rem;
		font-size: 0.78rem;
	}

	.qc-home-challenge-stats span {
		display: inline-flex;
		align-items: baseline;
		gap: 0.24rem;
	}

	.qc-home-challenge-stats strong {
		color: #102033;
		font-size: 0.88rem;
		font-weight: 760;
	}

	.qc-home-challenge-action {
		min-height: 2.4rem;
		padding: 0.38rem 0.65rem;
	}

	:global(:root[data-theme='dark']) .qc-home-challenge-copy > .qc-home-challenge-subject {
		color: #73e0a9;
	}

	:global(:root[data-theme='dark']) .qc-home-challenge-stats strong {
		color: #eff6ff;
	}
</style>
