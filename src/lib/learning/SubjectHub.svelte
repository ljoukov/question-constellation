<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import type { SignedInSubjectView } from '$lib/learning/viewTypes';
	import {
		ArrowRight,
		BookOpenCheck,
		Brain,
		ChevronDown,
		ChevronRight,
		Clock3,
		Compass,
		Layers3,
		Target
	} from '@lucide/svelte';
	import { slide } from 'svelte/transition';

	let { subject }: { subject: SignedInSubjectView } = $props();
	let curriculumProgressOpen = $state(false);
	let recommendationReasonOpen = $state(false);
	const recommendationReasonId = $derived(
		`recommendation-reason-${subject.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
	);
	const disclosureDurationMs =
		browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;

	const includedTopics = $derived(subject.topics.filter((topic) => topic.included));
	const otherActions = $derived(
		subject.alternatives.filter((action) => action.available && action.id !== subject.nextAction.id)
	);
	const scopeReady = $derived(subject.scope.status !== 'not_set');
	const showProgress = $derived(
		scopeReady && subject.nextAction.kind !== 'scope' && subject.nextAction.available
	);
	const hasSubjectEvidence = $derived(
		subject.progress.coverageCount > 0 ||
			subject.progress.examAnswerCount > 0 ||
			subject.progress.secureCount > 0 ||
			subject.progress.dueCount > 0
	);

	function actionIcon(kind: SignedInSubjectView['nextAction']['kind']) {
		if (kind === 'recall') return Brain;
		if (kind === 'close_gap') return Target;
		if (kind === 'apply_chain') return Layers3;
		if (kind === 'scope') return Compass;
		return BookOpenCheck;
	}

	function actionLabel(action: SignedInSubjectView['nextAction']) {
		if (!action.available) {
			return action.id === 'foundation-not-ready'
				? 'Review profile'
				: `Change ${subject.scope.unitPlural}`;
		}
		if (action.kind === 'scope') {
			return scopeReady
				? `Change ${subject.scope.unitPlural}`
				: `Choose ${subject.scope.unitPlural}`;
		}
		if (action.id.startsWith('quick:')) return 'Answer question';
		if (action.kind === 'recall') return 'Start recall';
		if (action.kind === 'close_gap') return 'Close this gap';
		if (action.kind === 'apply_chain') return 'Start question';
		return 'Choose a question';
	}

	function actionTitle(action: SignedInSubjectView['nextAction']) {
		return action.kind === 'recall' ? action.title.replace(/\s+recall$/i, '') : action.title;
	}

	const RecommendedIcon = $derived(actionIcon(subject.nextAction.kind));
</script>

<div class="qc-learning-layout qc-subject-hub-layout">
	<aside class="qc-learning-sidebar">
		<IconBackLink href={resolve('/')} label="Back home" />

		<header class="qc-learning-heading" aria-labelledby="subject-title">
			<p class="qc-real-kicker">{subject.courseLabel}</p>
			<h1 id="subject-title">{subject.subject}</h1>
		</header>
	</aside>

	<div class="qc-learning-main">
		<section
			class="qc-dashboard-panel"
			class:primary={subject.nextAction.available}
			aria-labelledby="recommended-heading"
		>
			<header class="qc-dashboard-panel-head">
				<div>
					<p class="qc-panel-label">{subject.nextAction.eyebrow}</p>
					<h2 id="recommended-heading">{actionTitle(subject.nextAction)}</h2>
				</div>
				<RecommendedIcon size={22} aria-hidden="true" strokeWidth={2.2} />
			</header>
			<p>{subject.nextAction.detail}</p>
			{#if subject.nextAction.available && subject.nextAction.reason && subject.nextAction.kind !== 'scope'}
				<div
					class="qc-inline-disclosure qc-recommendation-reason"
					class:is-open={recommendationReasonOpen}
				>
					<button
						type="button"
						class="qc-inline-disclosure-toggle"
						aria-expanded={recommendationReasonOpen}
						aria-controls={recommendationReasonId}
						onclick={() => (recommendationReasonOpen = !recommendationReasonOpen)}
					>
						<span>Why this?</span>
						<ChevronDown size={17} aria-hidden="true" />
					</button>
					{#if recommendationReasonOpen}
						<div
							id={recommendationReasonId}
							class="qc-inline-disclosure-content"
							transition:slide={{ duration: disclosureDurationMs }}
						>
							<p>{subject.nextAction.reason}</p>
						</div>
					{/if}
				</div>
			{/if}
			<div class="qc-subject-actions">
				<a
					class={subject.nextAction.available ? 'qc-dashboard-action' : 'qc-action-button compact'}
					href={subject.nextAction.href}
					aria-label={`${actionLabel(subject.nextAction)}: ${subject.nextAction.title}`}
				>
					{actionLabel(subject.nextAction)}
					<ArrowRight size={17} aria-hidden="true" />
				</a>
				{#if subject.nextAction.durationMinutes}
					<span class="qc-activity-meta">
						<Clock3 size={14} aria-hidden="true" />
						About {subject.nextAction.durationMinutes} min
					</span>
				{/if}
			</div>
		</section>

		{#if scopeReady && otherActions.length > 0}
			<section aria-labelledby="activity-heading">
				<div class="qc-dashboard-section-head">
					<h2 id="activity-heading">Choose another focus</h2>
				</div>
				<div
					class="qc-dashboard-grid qc-learning-action-grid"
					class:single={otherActions.length === 1}
				>
					{#each otherActions as action (action.id)}
						{@const ActionIcon = actionIcon(action.kind)}
						<article class="qc-dashboard-panel">
							<header class="qc-dashboard-panel-head">
								<h2>{actionTitle(action)}</h2>
								<ActionIcon size={20} aria-hidden="true" strokeWidth={2.2} />
							</header>
							<p>{action.detail}</p>
							<a
								class="qc-action-button compact"
								href={action.href}
								aria-label={`${actionLabel(action)}: ${action.title}`}
								data-analytics-label={`${subject.subject} ${action.kind}`}
							>
								{actionLabel(action)}
								<ChevronRight size={15} aria-hidden="true" />
							</a>
						</article>
					{/each}
				</div>
			</section>
		{/if}

		{#if showProgress}
			<section
				class="qc-dashboard-panel qc-subject-progress-panel"
				aria-labelledby="subject-progress-heading"
			>
				<header class="qc-dashboard-panel-head">
					<h2 id="subject-progress-heading">Your progress</h2>
					{#if hasSubjectEvidence}
						<span class="qc-subject-confidence">{subject.progress.evidenceLabel}</span>
					{/if}
				</header>

				{#if !hasSubjectEvidence}
					<p>Nothing checked yet. Start the suggested activity to see your progress here.</p>
				{:else}
					<div class="qc-subject-stats" class:single={subject.topics.length === 0}>
						{#if subject.topics.length > 0}
							<div>
								<strong>{subject.progress.coverageCount} of {subject.progress.coverageTotal}</strong
								>
								<span>Practised</span>
							</div>
							<div>
								<strong>{subject.progress.secureCount}</strong>
								<span>Looks secure</span>
							</div>
							<div>
								<strong>{subject.progress.dueCount}</strong>
								<span>Review due</span>
							</div>
						{:else}
							<div>
								<strong>{subject.progress.examAnswerCount}</strong>
								<span>Checked answers</span>
							</div>
						{/if}
					</div>
				{/if}

				{#if hasSubjectEvidence && includedTopics.length > 0}
					<div class="qc-mark-details" class:is-open={curriculumProgressOpen}>
						<button
							type="button"
							class="qc-mark-details-toggle"
							aria-expanded={curriculumProgressOpen}
							aria-controls="subject-curriculum-progress"
							onclick={() => (curriculumProgressOpen = !curriculumProgressOpen)}
						>
							<span class="qc-panel-label">Progress by {subject.scope.unitSingular}</span>
							<span class="qc-mark-details-action">
								{curriculumProgressOpen ? 'Hide details' : 'Show details'}
								<ChevronDown size={17} aria-hidden="true" />
							</span>
						</button>
						{#if curriculumProgressOpen}
							<div
								id="subject-curriculum-progress"
								class="qc-mark-details-content"
								transition:slide={{ duration: disclosureDurationMs }}
							>
								<ol class="qc-checklist" aria-label={`${subject.subject} included curriculum`}>
									{#each includedTopics as topic, index (topic.id)}
										<li>
											<span>{index + 1}</span>
											<div>
												<strong>{topic.title}</strong>
												<p>{topic.stateLabel}</p>
											</div>
										</li>
									{/each}
								</ol>
							</div>
						{/if}
					</div>
				{/if}
			</section>
		{/if}
	</div>

	{#if subject.scope.href && scopeReady && subject.nextAction.kind !== 'scope'}
		<nav class="qc-learning-resources" aria-label="Course settings">
			<a class="qc-dashboard-profile-link" href={subject.scope.href}>
				<span>Included course content</span>
				<strong>{subject.scope.label}</strong>
				<ChevronRight size={18} aria-hidden="true" />
			</a>
		</nav>
	{/if}
</div>
