<script lang="ts">
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { AdminUser } from '$lib/server/auth/session';
	import { ArrowRight, Brain, CheckSquare } from '@lucide/svelte';
	import type { RecallCardDefinition, RecallSubject, RecallTopic } from './aqaScienceRecall';
	import {
		recallActivityHref,
		recallActivityLabel,
		recallSessionHref,
		recallSubjectSlugs,
		type RecallActivity
	} from './routes';

	let {
		subject,
		activity,
		pageKind: _pageKind = 'activity',
		cards,
		topics,
		user = null
	}: {
		subject: RecallSubject;
		activity: RecallActivity;
		pageKind?: 'activity' | 'coverage';
		cards: RecallCardDefinition[];
		topics: RecallTopic[];
		user?: AdminUser | null;
	} = $props();

	const title = $derived(recallActivityLabel(activity));
	const returnTo = $derived(recallActivityHref(subject, activity));
	const availableTopicCount = $derived(
		topics.filter((topic) => cards.some((card) => card.topicId === topic.id)).length
	);
	const subjectOptions = ['Biology', 'Chemistry', 'Physics'];
	const browseHref = $derived(`/chains?subject=${encodeURIComponent(subject)}`);

	function cardsForTopic(topicId: string) {
		return cards.filter((card) => card.topicId === topicId);
	}

	function startHref(topic = 'all') {
		return recallSessionHref({ subject, activity, topic, size: 10, returnTo });
	}
</script>

<main class="recall-route-page recall-route-simple">
	<AppTopbar
		{user}
		{subject}
		subjects={subjectOptions}
		showSearch={false}
		showNavigation
		onSubjectChange={(nextSubject) => {
			const slug = recallSubjectSlugs[nextSubject as RecallSubject];
			if (slug) window.location.href = `/recall/${slug}/${activity}`;
		}}
	/>

	<div class="recall-route-shell">
		<header class="recall-route-header">
			<div>
				<p class="recall-route-kicker">AQA GCSE {subject}</p>
				<h1>{title}</h1>
				<p>Start a quick mixed stack, or choose one curriculum topic.</p>
			</div>
			<nav class="recall-activity-switch" aria-label="Recall activity">
				<a
					class:active={activity === 'flashcards'}
					href={recallActivityHref(subject, 'flashcards')}
				>
					<Brain size={17} aria-hidden="true" />
					Flashcards
				</a>
				<a class:active={activity === 'mcq'} href={recallActivityHref(subject, 'mcq')}>
					<CheckSquare size={17} aria-hidden="true" />
					Multiple choice
				</a>
			</nav>
		</header>

		<section class="recall-quick-start" aria-label="Quick start">
			<div>
				<p class="recall-route-kicker">Mixed topics</p>
				<h2>Start with 10 cards</h2>
				<p>{cards.length} cards available across {availableTopicCount} topics.</p>
			</div>
			<a href={startHref()}>
				Start {title.toLowerCase()}
				<ArrowRight size={17} aria-hidden="true" />
			</a>
		</section>

		<section class="recall-route-topics" aria-labelledby="recall-route-topics-title">
			<header class="recall-route-section-head">
				<div>
					<p class="recall-route-kicker">By topic</p>
					<h2 id="recall-route-topics-title">Choose a topic</h2>
				</div>
				<a href={browseHref}>Exam questions</a>
			</header>

			<div class="recall-topic-grid">
				{#each topics as topic (topic.id)}
					{@const topicCards = cardsForTopic(topic.id)}
					{#if topicCards.length > 0}
						<a class="recall-topic-card" href={startHref(topic.id)}>
							<span>{topic.specRef} · {topic.paper}</span>
							<strong><MathText text={topic.title} /></strong>
							<small>{topicCards.length} cards</small>
							<ArrowRight size={17} aria-hidden="true" />
						</a>
					{:else}
						<div class="recall-topic-card unavailable" aria-disabled="true">
							<span>{topic.specRef} · {topic.paper}</span>
							<strong><MathText text={topic.title} /></strong>
							<small>No cards yet</small>
						</div>
					{/if}
				{/each}
			</div>
		</section>
	</div>
</main>

<style>
	.recall-route-page {
		min-height: var(--app-viewport-height, 100vh);
		background: var(--qc-app-surface);
		color: #102033;
	}

	.recall-route-shell {
		display: grid;
		gap: 1rem;
		width: min(100%, 64rem);
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2rem);
	}

	.recall-route-header {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 1rem 2rem;
		align-items: end;
	}

	.recall-route-header > div,
	.recall-quick-start > div,
	.recall-route-section-head > div {
		display: grid;
		gap: 0.3rem;
	}

	.recall-route-kicker,
	.recall-route-header h1,
	.recall-route-header p,
	.recall-quick-start h2,
	.recall-quick-start p,
	.recall-route-section-head h2 {
		margin: 0;
	}

	.recall-route-kicker {
		color: #0d5a3f;
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.recall-route-header h1 {
		font-size: clamp(2rem, 5vw, 3.7rem);
		font-weight: 560;
		line-height: 1;
	}

	.recall-route-header p,
	.recall-quick-start p {
		color: #526778;
		font-size: 0.94rem;
		line-height: 1.4;
	}

	.recall-activity-switch {
		display: inline-flex;
		border: 1px solid #102033;
		background: #ffffff;
	}

	.recall-activity-switch a {
		display: inline-flex;
		gap: 0.38rem;
		align-items: center;
		min-height: 2.65rem;
		padding: 0.55rem 0.72rem;
		color: #526778;
		font-size: 0.86rem;
		font-weight: 520;
		text-decoration: none;
	}

	.recall-activity-switch a + a {
		border-left: 1px solid #102033;
	}

	.recall-activity-switch a.active {
		background: #edfaf3;
		color: #0d5a3f;
	}

	.recall-quick-start {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid #102033;
		background: color-mix(in srgb, #ffffff 82%, transparent);
	}

	.recall-quick-start h2,
	.recall-route-section-head h2 {
		font-size: clamp(1.35rem, 3vw, 1.8rem);
		font-weight: 540;
		line-height: 1.1;
	}

	.recall-quick-start > a {
		display: inline-flex;
		gap: 0.45rem;
		align-items: center;
		justify-content: center;
		min-height: 2.7rem;
		padding: 0.58rem 0.82rem;
		border: 1px solid #168458;
		background: #edfaf3;
		color: #0d5a3f;
		font-size: 0.9rem;
		font-weight: 560;
		text-decoration: none;
		white-space: nowrap;
	}

	.recall-route-topics {
		display: grid;
		gap: 0.8rem;
		padding-bottom: 2rem;
	}

	.recall-route-section-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
	}

	.recall-route-section-head > a {
		color: #0d5a3f;
		font-size: 0.86rem;
		font-weight: 540;
	}

	.recall-topic-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.65rem;
	}

	.recall-topic-card {
		position: relative;
		display: grid;
		gap: 0.28rem;
		min-width: 0;
		min-height: 6.7rem;
		align-content: center;
		padding: 0.85rem 2.5rem 0.85rem 0.85rem;
		border: 1px solid rgba(16, 32, 51, 0.48);
		background: #ffffff;
		color: #102033;
		text-decoration: none;
	}

	.recall-topic-card > span,
	.recall-topic-card > small {
		color: #657687;
		font-size: 0.77rem;
	}

	.recall-topic-card > strong {
		font-size: 1rem;
		font-weight: 540;
		line-height: 1.22;
	}

	.recall-topic-card :global(svg) {
		position: absolute;
		right: 0.85rem;
		bottom: 0.85rem;
		color: #168458;
	}

	.recall-topic-card:hover,
	.recall-topic-card:focus-visible {
		border-color: #168458;
		box-shadow: 0 0 0 2px rgba(22, 132, 88, 0.17);
		outline: 0;
	}

	.recall-topic-card.unavailable {
		opacity: 0.58;
	}

	:global(:root[data-theme='dark']) .recall-route-page {
		background: #020617;
		color: #eaf4ff;
	}

	:global(:root[data-theme='dark']) .recall-activity-switch,
	:global(:root[data-theme='dark']) .recall-quick-start,
	:global(:root[data-theme='dark']) .recall-topic-card {
		border-color: rgba(226, 232, 240, 0.72);
		background: rgba(7, 20, 31, 0.72);
		color: #eaf4ff;
	}

	:global(:root[data-theme='dark']) .recall-activity-switch a + a {
		border-left-color: rgba(226, 232, 240, 0.72);
	}

	:global(:root[data-theme='dark']) .recall-activity-switch a.active,
	:global(:root[data-theme='dark']) .recall-quick-start > a {
		background: rgba(16, 67, 49, 0.72);
		color: #98f0c5;
	}

	:global(:root[data-theme='dark']) .recall-route-kicker,
	:global(:root[data-theme='dark']) .recall-route-section-head > a {
		color: #78dbaa;
	}

	:global(:root[data-theme='dark']) .recall-route-header > div > p:not(.recall-route-kicker),
	:global(:root[data-theme='dark']) .recall-quick-start > div > p:not(.recall-route-kicker),
	:global(:root[data-theme='dark']) .recall-topic-card > span,
	:global(:root[data-theme='dark']) .recall-topic-card > small {
		color: #b5c6d5;
	}

	:global(:root[data-theme='dark']) .recall-topic-card > strong {
		color: #f1f7fc;
	}

	@media (prefers-color-scheme: dark) {
		:global(:root:not([data-theme='light'])) .recall-route-page {
			background: #020617;
			color: #eaf4ff;
		}

		:global(:root:not([data-theme='light'])) .recall-activity-switch,
		:global(:root:not([data-theme='light'])) .recall-quick-start,
		:global(:root:not([data-theme='light'])) .recall-topic-card {
			border-color: rgba(226, 232, 240, 0.72);
			background: rgba(7, 20, 31, 0.72);
			color: #eaf4ff;
		}

		:global(:root:not([data-theme='light'])) .recall-activity-switch a + a {
			border-left-color: rgba(226, 232, 240, 0.72);
		}

		:global(:root:not([data-theme='light'])) .recall-activity-switch a.active,
		:global(:root:not([data-theme='light'])) .recall-quick-start > a {
			background: rgba(16, 67, 49, 0.72);
			color: #98f0c5;
		}

		:global(:root:not([data-theme='light'])) .recall-route-kicker,
		:global(:root:not([data-theme='light'])) .recall-route-section-head > a {
			color: #78dbaa;
		}

		:global(:root:not([data-theme='light']))
			.recall-route-header
			> div
			> p:not(.recall-route-kicker),
		:global(:root:not([data-theme='light']))
			.recall-quick-start
			> div
			> p:not(.recall-route-kicker),
		:global(:root:not([data-theme='light'])) .recall-topic-card > span,
		:global(:root:not([data-theme='light'])) .recall-topic-card > small {
			color: #b5c6d5;
		}

		:global(:root:not([data-theme='light'])) .recall-topic-card > strong {
			color: #f1f7fc;
		}
	}

	@media (max-width: 700px) {
		.recall-route-header {
			grid-template-columns: minmax(0, 1fr);
			align-items: start;
		}

		.recall-activity-switch {
			width: 100%;
		}

		.recall-activity-switch a {
			flex: 1;
			justify-content: center;
		}

		.recall-quick-start {
			align-items: flex-start;
			flex-direction: column;
		}

		.recall-topic-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 520px) {
		.recall-route-shell {
			padding: 0.85rem 0.7rem 1.5rem;
		}
	}
</style>
