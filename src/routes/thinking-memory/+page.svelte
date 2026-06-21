<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Atom,
		Bookmark,
		Droplet,
		Info,
		Leaf,
		Link2,
		Lock,
		Network,
		RefreshCcw,
		Target,
		TriangleAlert,
		Zap
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Thinking Memory | Question Constellation</title>
	<meta
		name="description"
		content="Saved GCSE answer chains for retrieval, review, and transfer practice."
	/>
</svelte:head>

<main class="flow-page memory-page">
	<header class="app-header">
		<a
			class="brand-lockup"
			href={resolve('/questions/[questionId]', { questionId: data.selected.savedFromQuestion.id })}
		>
			<Network size={30} strokeWidth={1.9} />
			<strong>Question Constellation</strong>
		</a>
		<strong class="header-title desktop-centered">Thinking Memory</strong>
		<Bookmark class="bookmark" size={24} strokeWidth={2.1} />
	</header>

	<div class="memory-grid">
		<aside class="memory-library">
			<h1>Earned chains</h1>
			<div class="subject-row">
				<Leaf size={22} />
				<span>Biology</span>
			</div>
			<a class="memory-entry active" href={resolve('/thinking-memory')}>
				<span class="icon-tile"><Atom size={23} /></span>
				<span>
					<strong>Respiration -> energy</strong>
					<small>{data.selected.lastSavedLabel.toLowerCase()}</small>
				</span>
				<ArrowRight size={22} />
			</a>
			<div class="memory-entry locked">
				<span class="icon-tile muted"><Lock size={23} /></span>
				<span>More chains appear after practice</span>
			</div>
			<section class="bottom-note library-note">
				<Info size={19} color="#0b57eb" />
				<span>You only see chains you have earned through practice.</span>
			</section>
		</aside>

		<section class="memory-detail">
			<h1 class="saved-title">Respiration -> energy</h1>
			<p class="saved-subtitle">Saved to Thinking Memory</p>

			<section class="chain-card" aria-label={data.selected.chain.concreteText}>
				<div class="chain-icons compact">
					<div class="chain-node">
						<span class="chain-node-icon"><Droplet size={24} strokeWidth={2.2} /></span>
						<span>blood flow</span>
					</div>
					<div class="chain-node">
						<span class="chain-node-icon"><strong>O₂</strong></span>
						<span>oxygen</span>
					</div>
					<div class="chain-node">
						<span class="chain-node-icon"><Atom size={24} strokeWidth={2.2} /></span>
						<span>respiration</span>
					</div>
					<div class="chain-node">
						<span class="chain-node-icon"><Zap size={24} strokeWidth={2.2} /></span>
						<span>energy</span>
					</div>
					<div class="chain-node">
						<span class="chain-node-icon"><Target size={24} strokeWidth={2.2} /></span>
						<span>effect</span>
					</div>
				</div>
			</section>

			<section class="stat-card">
				<span class="icon-tile"><Link2 size={22} /></span>
				<span>
					<strong>Used in {data.selected.attemptedQuestionIds.length} questions</strong>
					You applied this chain twice.
				</span>
			</section>

			<section class="warning-card">
				<span class="icon-tile warning"><TriangleAlert size={22} /></span>
				<span>
					<strong>Often skips: respiration</strong>
					This link is commonly missing.
				</span>
			</section>

			<section class="bottom-note">
				<Info size={19} color="#0b57eb" />
				<span>Your memory grows after practice, not before.</span>
			</section>
		</section>

		<aside class="review-plan">
			<h2>Next retrieval</h2>
			<a
				class="question-row review-question"
				href={resolve('/questions/[questionId]/practice', {
					questionId: data.selected.nextReviewQuestion.id
				})}
			>
				<span class="number-dot">5</span>
				<h3>{data.selected.nextReviewQuestion.title}</h3>
				<span class={['tag', data.selected.nextReviewQuestion.transferDistance]}>
					{data.selected.nextReviewQuestion.distanceLabel}
				</span>
			</a>
			<p>Same chain, less obvious topic.</p>
			<div class="button-stack">
				<a
					class="green-button"
					href={resolve('/questions/[questionId]/practice', {
						questionId: data.selected.nextReviewQuestion.id
					})}
				>
					Review this chain
				</a>
				<a
					class="secondary-button"
					href={resolve('/questions/[questionId]/practice', { questionId: data.questions[2].id })}
				>
					<ArrowRight size={21} />
					Continue to question 3
				</a>
				<a
					class="secondary-button success"
					href={resolve('/questions/[questionId]', {
						questionId: data.selected.savedFromQuestion.id
					})}
				>
					<RefreshCcw size={21} />
					Reset / relearn
				</a>
			</div>
			<section class="helper-line">
				<Info size={19} />
				Model answers stay behind each reviewed question.
			</section>
		</aside>
	</div>
</main>
