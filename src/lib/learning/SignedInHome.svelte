<script lang="ts">
	import { resolve } from '$app/paths';
	import type { SignedInLearningHome } from '$lib/learning/viewTypes';
	import { ArrowRight, Settings2, Sparkles } from '@lucide/svelte';

	let { dashboard }: { dashboard: SignedInLearningHome } = $props();

	const hasWeeklyActivity = $derived(
		dashboard.weeklySummary.attemptCount +
			dashboard.weeklySummary.recallCount +
			dashboard.weeklySummary.closedGapCount >
			0
	);

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

	function cardHref(subject: SignedInLearningHome['subjects'][number]) {
		return subject.scope.status === 'not_set' || subject.nextAction.kind === 'scope'
			? subject.nextAction.href
			: subject.href;
	}

	function cardActionLabel(subject: SignedInLearningHome['subjects'][number]) {
		if (subject.scope.status === 'not_set') return 'Set up';
		return subject.nextAction.kind === 'scope' ? 'Adjust' : 'Open';
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
					href={cardHref(lane)}
				>
					<header>
						<div>
							<h3>{lane.subject}</h3>
							<p>{lane.courseLabel}</p>
							{#if progressSummary(lane)}
								<p class="qc-subject-card-progress">{progressSummary(lane)}</p>
							{/if}
						</div>
					</header>

					<div class="qc-subject-next">
						<span>
							Next
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
					<h2>Add your subjects</h2>
					<p>Choose the courses and exam boards your school uses.</p>
					<a class="qc-dashboard-action" href={resolve('/profile')}>Set up subjects</a>
				</article>
			{/each}
		</div>
	</section>

	{#if dashboard.subjects.length > 0}
		<nav class="qc-subject-actions qc-learning-resources" aria-label="Course settings">
			<a class="qc-action-button compact" href={resolve('/profile')}>
				<Settings2 size={18} aria-hidden="true" />
				Subjects and exam boards
			</a>
		</nav>
	{/if}
</section>
