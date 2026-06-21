<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		Bookmark,
		Circle,
		Info,
		Link2,
		Lock,
		Network,
		PenLine,
		Target,
		TriangleAlert
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const chainHref = $derived(
		resolve('/questions/[questionId]/chain', { questionId: data.question.id })
	);
	const practiceHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.question.id })
	);
	const topicLabel = $derived(data.question.meta.topic.split(':')[0] ?? data.question.meta.topic);
</script>

<svelte:head>
	<title>{data.question.title} | Question Constellation</title>
	<meta
		name="description"
		content="Attempt a GCSE question first, then reveal the answer chain when ready."
	/>
	<link rel="canonical" href={questionHref} />
</svelte:head>

<main class="flow-page public-learning-page">
	<header class="app-header">
		<a
			class="brand-lockup"
			href={resolve('/questions/[questionId]', { questionId: data.question.id })}
		>
			<Network size={30} strokeWidth={1.9} />
			<strong>Question Constellation</strong>
		</a>
		<nav class="desktop-nav" aria-label="Main navigation">
			<a href={questionHref}>Biology</a>
			<a href={practiceHref}>Practice</a>
		</nav>
		<Bookmark class="bookmark" size={25} strokeWidth={2.1} />
	</header>

	<div class="flow-grid public-grid">
		<section class="flow-main">
			<p class="breadcrumb">
				{data.question.meta.board}
				{data.question.meta.subject}
				{data.question.meta.tier} /
				{data.question.meta.paper}
			</p>
			<h1 class="desktop-title">{data.question.title}</h1>

			<section class="meta-pills" aria-label="Exam metadata">
				<span class="pill">{data.question.meta.marks} marks</span>
				<span class="pill">{topicLabel}</span>
				<span class="pill">{data.question.meta.questionType}</span>
			</section>

			<section class="exam-question-card">
				<div class="question-letter">Q</div>
				<div class="question-content">
					{#if data.question.context}
						<p class="question-context">{data.question.context}</p>
					{/if}
					<h2>{data.question.prompt}</h2>
				</div>
			</section>

			<div class="desktop-action-row">
				<a class="primary-button" href={chainHref}>
					<Link2 size={23} />
					Show answer chain
				</a>
				<a class="secondary-button" href={practiceHref}>
					<PenLine size={23} />
					Try without hints
				</a>
			</div>

			{#if data.question.assets.length > 0}
				<div class="question-assets public-question-assets" aria-label="Question source images">
					{#each data.question.assets as asset (asset.id)}
						<figure>
							<img src={asset.publicPath} alt={asset.altText} loading="eager" />
							<figcaption>{asset.sourceLabel}</figcaption>
						</figure>
					{/each}
				</div>
			{/if}

			<section class="teaching-card">
				<span class="icon-tile success"><Target size={28} /></span>
				<div>
					<h2>Learning goal</h2>
					<p>Build a cause-and-effect explanation from the given change to the final symptom.</p>
				</div>
			</section>

			<p class="helper-line">
				<Info size={18} />
				The chain appears after you reveal it or check an attempt.
			</p>
		</section>

		<aside class="flow-sidebar">
			<section class="side-card prompt-card">
				<h2>Before you reveal</h2>
				<ul class="prompt-list">
					<li><Circle size={21} /> What changes first?</li>
					<li><Circle size={21} /> What happens inside the cells?</li>
					<li><Circle size={21} /> How does that cause pain?</li>
				</ul>
			</section>

			<section class="side-card hidden-card">
				<div class="side-title-row">
					<h2>Hidden for now</h2>
					<Lock size={22} />
				</div>
				<div class="locked-chain" aria-label="Hidden answer chain">
					<span></span><span></span><span></span><span></span><span></span>
				</div>
				<p>The answer chain and related questions stay hidden until the next step.</p>
			</section>

			<section class="side-card warning-card">
				<span class="icon-tile warning"><TriangleAlert size={24} /></span>
				<div>
					<h2>Common trap</h2>
					<p>Jumping straight from the given change to the final symptom.</p>
				</div>
			</section>
		</aside>
	</div>
</main>
