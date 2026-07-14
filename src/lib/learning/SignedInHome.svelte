<script lang="ts">
	import { resolve } from '$app/paths';
	import type { SignedInLearningHome } from '$lib/learning/viewTypes';
	import { ArrowRight, ChevronRight, Settings2, Sparkles } from '@lucide/svelte';

	let { dashboard }: { dashboard: SignedInLearningHome } = $props();

	const hasWeeklyActivity = $derived(
		dashboard.weeklySummary.attemptCount +
			dashboard.weeklySummary.recallCount +
			dashboard.weeklySummary.closedGapCount >
			0
	);

	function scopeSummary(subject: SignedInLearningHome['subjects'][number]) {
		return subject.scope.status === 'all'
			? `Scope · all ${subject.scope.totalCount} ${subject.scope.unitPlural}`
			: `Scope · ${subject.scope.includedCount} of ${subject.scope.totalCount} ${subject.scope.unitPlural}`;
	}

	function hasProgress(subject: SignedInLearningHome['subjects'][number]) {
		return (
			subject.progress.coverageCount > 0 ||
			subject.progress.secureCount > 0 ||
			subject.progress.dueCount > 0 ||
			subject.progress.examAnswerCount > 0
		);
	}

	function progressSummary(subject: SignedInLearningHome['subjects'][number]) {
		if (subject.scope.status === 'not_set') return null;
		if (hasProgress(subject)) return subject.progress.coverageLabel;
		return 'Not enough evidence yet';
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

	function actionLabel(subject: SignedInLearningHome['subjects'][number]) {
		if (!subject.nextAction.available) {
			return subject.nextAction.id === 'foundation-not-ready'
				? 'Review profile'
				: `View ${subject.scope.unitPlural}`;
		}
		if (subject.nextAction.kind !== 'scope') {
			return 'Start';
		}
		return subject.scope.status === 'not_set'
			? `Choose ${subject.scope.unitPlural}`
			: `Change ${subject.scope.unitPlural}`;
	}

	function setupPrompt(subject: SignedInLearningHome['subjects'][number]) {
		if (subject.scope.unitPlural === 'course options') {
			return 'Confirm what your class is studying';
		}
		if (subject.scope.unitPlural === 'course texts') {
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

		<nav class="qc-subject-actions qc-learning-resources" aria-label="Course settings">
			<a class="qc-action-button compact" href={resolve('/profile')}>
				<Settings2 size={18} aria-hidden="true" />
				Subjects and exam boards
			</a>
		</nav>
	</aside>

	<section class="qc-learning-main" aria-labelledby="subjects-heading">
		<div class="qc-dashboard-section-head">
			<h2 id="subjects-heading">Your subjects</h2>
		</div>

		<div class="qc-dashboard-subjects">
			{#each dashboard.subjects as lane (lane.subject)}
				<article
					class="qc-subject-card"
					class:setup={lane.scope.status === 'not_set'}
					data-action={lane.nextAction.kind}
				>
					<header>
						<div>
							<a href={lane.href}><h3>{lane.subject}</h3></a>
							<p>{lane.courseLabel}</p>
							{#if progressSummary(lane)}
								<p class="qc-subject-card-progress">{progressSummary(lane)}</p>
							{/if}
						</div>
						{#if lane.scope.status !== 'not_set' && lane.scope.href !== lane.nextAction.href}
							<a class="qc-action-button compact" href={lane.scope.href}>
								{scopeSummary(lane)}
								<ChevronRight size={14} aria-hidden="true" />
							</a>
						{/if}
					</header>

					<div class="qc-subject-next">
						<span>
							{lane.scope.status === 'not_set'
								? 'Set up'
								: lane.nextAction.kind === 'scope'
									? 'Adjust course content'
									: 'Next'}
							{#if lane.nextAction.durationMinutes}
								· {lane.nextAction.durationMinutes} min{/if}
						</span>
						<strong>
							{lane.scope.status === 'not_set' ? setupPrompt(lane) : lane.nextAction.title}
						</strong>
					</div>

					<div class="qc-subject-actions">
						<a
							class={lane.nextAction.available ? 'qc-dashboard-action' : 'qc-action-button compact'}
							href={lane.nextAction.href}
						>
							{actionLabel(lane)}
							<ArrowRight size={16} aria-hidden="true" />
						</a>
					</div>
				</article>
			{:else}
				<article class="qc-dashboard-panel primary">
					<h2>Add your subjects</h2>
					<p>Choose the courses and exam boards your school uses.</p>
					<a class="qc-dashboard-action" href={resolve('/profile')}>Set up subjects</a>
				</article>
			{/each}
		</div>
	</section>
</section>
