<script lang="ts">
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import {
		recallKindLabels,
		type RecallCard,
		type RecallSubject,
		type RecallTopic
	} from './aqaScienceRecall';
	import {
		recallActivityHref,
		recallActivityLabel,
		recallCoverageHref,
		recallSessionHref,
		recallStackSizeOptions,
		recallSubjectSlugs,
		type RecallActivity
	} from './routes';
	import type { AdminUser } from '$lib/server/auth/session';
	import { ArrowRight, BookOpenCheck, Brain, CheckSquare, Layers3, Target } from '@lucide/svelte';

	let {
		subject,
		activity,
		pageKind = 'activity',
		cards,
		topics,
		user = null
	}: {
		subject: RecallSubject;
		activity: RecallActivity;
		pageKind?: 'activity' | 'coverage';
		cards: RecallCard[];
		topics: RecallTopic[];
		user?: AdminUser | null;
	} = $props();

	const title = $derived(
		pageKind === 'coverage' ? `${subject} recall coverage` : recallActivityLabel(activity)
	);
	const companionActivity = $derived(activity === 'mcq' ? 'flashcards' : 'mcq');
	const returnTo = $derived(
		pageKind === 'coverage' ? recallCoverageHref(subject) : recallActivityHref(subject, activity)
	);
	const paperOneCount = $derived(topics.filter((topic) => topic.paper === 'Paper 1').length);
	const paperTwoCount = $derived(topics.filter((topic) => topic.paper === 'Paper 2').length);
	const kindCounts = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const card of cards) counts.set(card.kind, (counts.get(card.kind) ?? 0) + 1);
		return [...counts.entries()]
			.map(([kind, count]) => ({
				kind,
				label: recallKindLabels[kind as keyof typeof recallKindLabels],
				count
			}))
			.sort((left, right) => right.count - left.count);
	});
	const subjectOptions = ['Biology', 'Chemistry', 'Physics'];
	const browseHref = $derived(`/chains?subject=${encodeURIComponent(subject)}`);

	function cardsForTopic(topicId: string) {
		return cards.filter((card) => card.topicId === topicId);
	}

	function startHref(size: number, topic = 'all') {
		return recallSessionHref({
			subject,
			activity,
			topic,
			size,
			returnTo
		});
	}
</script>

<main class="recall-route-page">
	<AppTopbar
		{user}
		{subject}
		subjects={subjectOptions}
		showSearch={false}
		showNavigation
		onSubjectChange={(nextSubject) => {
			const slug = recallSubjectSlugs[nextSubject as RecallSubject];
			if (slug)
				window.location.href = `/recall/${slug}/${pageKind === 'coverage' ? 'coverage' : activity}`;
		}}
	/>

	<section class="recall-route-hero" aria-labelledby="recall-route-title">
		<div>
			<p class="recall-route-kicker">AQA GCSE {subject}</p>
			<h1 id="recall-route-title">{title}</h1>
			<p>
				{pageKind === 'coverage'
					? 'See which specification topics have recall support, then open a short stack from the exact topic.'
					: 'Practise compact specification facts before you write longer exam answers. Change the stack size here, then the full-screen session opens without another setup step.'}
			</p>
		</div>
		<div class="recall-route-stats" aria-label={`${subject} recall coverage`}>
			<div>
				<strong>{cards.length}</strong>
				<span>cards</span>
			</div>
			<div>
				<strong>{topics.length}</strong>
				<span>topics</span>
			</div>
			<div>
				<strong>{paperOneCount}</strong>
				<span>Paper 1</span>
			</div>
			<div>
				<strong>{paperTwoCount}</strong>
				<span>Paper 2</span>
			</div>
		</div>
	</section>

	<section class="recall-route-grid" aria-label="Recall actions">
		<article class="recall-route-panel primary">
			<div class="recall-route-panel-head">
				<div>
					<p class="recall-route-kicker">Start stack</p>
					<h2>{title}</h2>
				</div>
				{#if activity === 'mcq'}
					<CheckSquare size={22} aria-hidden="true" strokeWidth={2.2} />
				{:else}
					<Brain size={22} aria-hidden="true" strokeWidth={2.2} />
				{/if}
			</div>
			<p>
				Use this when you want a short warm-up before exam questions or a quick check after a missed
				factual link.
			</p>
			<div class="recall-route-stack-actions">
				{#each recallStackSizeOptions as size (size)}
					<a class:featured={size === 10} href={startHref(size)}>
						{size} cards
						<ArrowRight size={16} aria-hidden="true" strokeWidth={2.2} />
					</a>
				{/each}
			</div>
			<div class="recall-route-secondary-actions">
				<a href={recallActivityHref(subject, companionActivity)}>
					{recallActivityLabel(companionActivity)}
				</a>
				<a href={recallCoverageHref(subject)}>Coverage</a>
				<a href={browseHref}>Exam questions</a>
			</div>
		</article>

		<article class="recall-route-panel">
			<div class="recall-route-panel-head">
				<div>
					<p class="recall-route-kicker">Card mix</p>
					<h2>What is in this deck</h2>
				</div>
				<Layers3 size={22} aria-hidden="true" strokeWidth={2.2} />
			</div>
			<div class="recall-route-kind-list">
				{#each kindCounts as item (item.kind)}
					<div>
						<span>{item.label}</span>
						<strong>{item.count}</strong>
					</div>
				{/each}
			</div>
		</article>
	</section>

	<section class="recall-route-topics" aria-labelledby="recall-route-topics-title">
		<div class="recall-route-section-head">
			<div>
				<p class="recall-route-kicker">Specification coverage</p>
				<h2 id="recall-route-topics-title">Choose a curriculum topic</h2>
			</div>
			<BookOpenCheck size={23} aria-hidden="true" strokeWidth={2.2} />
		</div>

		<div class="recall-topic-grid">
			{#each topics as topic (topic.id)}
				{@const topicCards = cardsForTopic(topic.id)}
				<article>
					<header>
						<span>{topic.specRef} · {topic.paper}</span>
						<strong><MathText text={topic.title} /></strong>
					</header>
					<p>{topicCards.length} cards covered</p>
					<div>
						{#if topicCards.length > 0}
							<a href={startHref(Math.min(10, Math.max(5, topicCards.length)), topic.id)}>
								Start
							</a>
						{:else}
							<span class="recall-topic-empty">No cards yet</span>
						{/if}
						<a
							href={`/recall?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic.id)}&activity=${activity}${activity === 'mcq' ? '&mode=recognise' : ''}&returnTo=${encodeURIComponent(returnTo)}`}
						>
							Adjust
						</a>
					</div>
				</article>
			{/each}
		</div>
	</section>
</main>

<style>
	.recall-route-page {
		min-height: var(--app-viewport-height, 100vh);
		background: var(--qc-app-surface);
		color: #0b1020;
	}

	.recall-route-hero,
	.recall-route-grid,
	.recall-route-topics {
		width: min(100%, 1160px);
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2rem);
	}

	.recall-route-hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 28rem);
		gap: 1rem;
		align-items: end;
		padding-bottom: 1rem;
	}

	.recall-route-kicker {
		margin: 0 0 0.45rem;
		color: #08602c;
		font-size: 0.8rem;
		font-weight: 860;
		text-transform: uppercase;
	}

	.recall-route-hero h1,
	.recall-route-panel h2,
	.recall-route-section-head h2 {
		margin: 0;
		color: #050811;
		letter-spacing: 0;
	}

	.recall-route-hero h1 {
		font-size: clamp(2.25rem, 6vw, 4.6rem);
		font-weight: 900;
		line-height: 0.98;
	}

	.recall-route-hero p,
	.recall-route-panel p,
	.recall-topic-grid p {
		margin: 0;
		color: #465568;
		line-height: 1.48;
	}

	.recall-route-hero p {
		max-width: 48rem;
		margin-top: 0.8rem;
		font-size: 1.05rem;
	}

	.recall-route-stats,
	.recall-route-kind-list {
		display: grid;
		border: 1px solid #d9e0ea;
		background: #ffffff;
	}

	.recall-route-stats {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.recall-route-stats div,
	.recall-route-kind-list div {
		display: grid;
		gap: 0.25rem;
		padding: 0.82rem;
		border-right: 1px solid #d9e0ea;
		border-bottom: 1px solid #d9e0ea;
	}

	.recall-route-stats div:nth-child(2n),
	.recall-route-kind-list div:nth-child(2n) {
		border-right: 0;
	}

	.recall-route-stats div:nth-last-child(-n + 2),
	.recall-route-kind-list div:last-child {
		border-bottom: 0;
	}

	.recall-route-stats strong,
	.recall-route-kind-list strong {
		color: #050811;
		font-size: 1.5rem;
		line-height: 1;
	}

	.recall-route-stats span,
	.recall-route-kind-list span,
	.recall-topic-grid span {
		color: #647085;
		font-size: 0.75rem;
		font-weight: 820;
		text-transform: uppercase;
	}

	.recall-route-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) minmax(19rem, 0.75fr);
		gap: 1rem;
		padding-top: 0;
	}

	.recall-route-panel,
	.recall-topic-grid article {
		display: grid;
		gap: 0.9rem;
		border: 1px solid #d9e0ea;
		background: #ffffff;
		padding: 1rem;
	}

	.recall-route-panel.primary {
		border-color: #b9d9c6;
		background: #fbfefb;
	}

	.recall-route-panel-head,
	.recall-route-section-head {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 1rem;
	}

	.recall-route-panel h2,
	.recall-route-section-head h2 {
		font-size: clamp(1.35rem, 3vw, 2rem);
		line-height: 1.05;
	}

	.recall-route-stack-actions,
	.recall-route-secondary-actions,
	.recall-topic-grid article div {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem;
	}

	.recall-route-stack-actions a,
	.recall-route-secondary-actions a,
	.recall-topic-grid a,
	.recall-topic-empty {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		min-height: 2.6rem;
		padding: 0.58rem 0.78rem;
		border: 1px solid #cfd7e2;
		background: #ffffff;
		color: #0b45d9;
		font-weight: 820;
		text-decoration: none;
	}

	.recall-topic-empty {
		border-color: #d9e0ea;
		background: #f6f8fb;
		color: #647085;
	}

	.recall-route-stack-actions a.featured,
	.recall-topic-grid a:first-child {
		border-color: #05642f;
		background: #08773b;
		color: #ffffff;
	}

	.recall-route-kind-list {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.recall-route-topics {
		padding-top: 0;
		padding-bottom: 3rem;
	}

	.recall-topic-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.8rem;
		margin-top: 1rem;
	}

	.recall-topic-grid header {
		display: grid;
		gap: 0.35rem;
	}

	.recall-topic-grid strong {
		color: #050811;
		font-size: 1.08rem;
		line-height: 1.22;
	}

	:global(:root[data-theme='dark']) .recall-route-page {
		background: #020617;
		color: #f8fafc;
	}

	:global(:root[data-theme='dark']) .recall-route-panel,
	:global(:root[data-theme='dark']) .recall-topic-grid article,
	:global(:root[data-theme='dark']) .recall-route-stats,
	:global(:root[data-theme='dark']) .recall-route-kind-list,
	:global(:root[data-theme='dark']) .recall-route-stats div,
	:global(:root[data-theme='dark']) .recall-route-kind-list div,
	:global(:root[data-theme='dark']) .recall-route-stack-actions a,
	:global(:root[data-theme='dark']) .recall-route-secondary-actions a,
	:global(:root[data-theme='dark']) .recall-topic-grid a,
	:global(:root[data-theme='dark']) .recall-topic-empty {
		border-color: #334155;
		background: #0f172a;
		color: #e5e7eb;
	}

	:global(:root[data-theme='dark']) .recall-route-hero h1,
	:global(:root[data-theme='dark']) .recall-route-panel h2,
	:global(:root[data-theme='dark']) .recall-route-section-head h2,
	:global(:root[data-theme='dark']) .recall-route-stats strong,
	:global(:root[data-theme='dark']) .recall-route-kind-list strong,
	:global(:root[data-theme='dark']) .recall-topic-grid strong {
		color: #f8fafc;
	}

	:global(:root[data-theme='dark']) .recall-route-hero p,
	:global(:root[data-theme='dark']) .recall-route-panel p,
	:global(:root[data-theme='dark']) .recall-topic-grid p,
	:global(:root[data-theme='dark']) .recall-route-stats span,
	:global(:root[data-theme='dark']) .recall-route-kind-list span,
	:global(:root[data-theme='dark']) .recall-topic-grid span {
		color: #a7b4c5;
	}

	:global(:root[data-theme='dark']) .recall-route-stack-actions a.featured,
	:global(:root[data-theme='dark']) .recall-topic-grid a:first-child {
		border-color: #22c55e;
		background: #15803d;
		color: #ffffff;
	}

	@media (max-width: 880px) {
		.recall-route-hero,
		.recall-route-grid {
			grid-template-columns: 1fr;
		}

		.recall-topic-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 620px) {
		.recall-route-hero,
		.recall-route-grid,
		.recall-route-topics {
			padding: 0.85rem;
		}

		.recall-route-hero {
			padding-bottom: 0.5rem;
		}

		.recall-route-grid {
			padding-top: 0;
		}

		.recall-topic-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
