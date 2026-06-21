<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		ArrowRight,
		Bookmark,
		ChevronRight,
		ClipboardList,
		Network,
		Route
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const chainHref = $derived(
		resolve('/questions/[questionId]/chain', { questionId: data.startQuestion.id })
	);
	const practiceHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.practiceQuestion.id })
	);
</script>

<svelte:head>
	<title>{data.constellation.title} | Question Constellation</title>
	<meta
		name="description"
		content="A GCSE question constellation: different questions using the same answer chain."
	/>
</svelte:head>

<main class="flow-page constellation-page">
	<header class="app-header compact-header">
		<a class="icon-button" href={chainHref} aria-label="Back to answer chain">
			<ArrowLeft size={25} strokeWidth={2.1} />
		</a>
		<a
			class="brand-lockup"
			href={resolve('/questions/[questionId]', { questionId: data.startQuestion.id })}
		>
			<Network size={28} strokeWidth={1.9} />
			<strong>Question Constellation</strong>
		</a>
		<Bookmark class="bookmark" size={25} strokeWidth={2.1} />
	</header>

	<div class="flow-grid chain-grid">
		<section class="flow-main">
			<p class="breadcrumb">Constellation / {data.chain.title}</p>
			<h1 class="desktop-title">{data.constellation.title}</h1>
			<section class="meta-pills" aria-label="Constellation metadata">
				<span class="pill">{data.questions.length} questions</span>
				<span class="pill">1 answer chain</span>
				<span class="pill">{data.startQuestion.meta.board} {data.startQuestion.meta.tier}</span>
			</section>

			<section class="chain-card large-chain" aria-label={data.chain.canonicalText}>
				<div class="chain-icons">
					{#each data.chain.steps as step (step.id)}
						<div class="chain-node">
							<span class="chain-node-icon"><Route size={23} strokeWidth={2.2} /></span>
							<span>{step.short}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="answer-panel">
				<h2>Ordered question set</h2>
				<div class="constellation-list">
					{#each data.questions as question, index (question.id)}
						<a
							class="question-row"
							href={resolve('/questions/[questionId]/practice', { questionId: question.id })}
						>
							<span class="number-dot">{index + 1}</span>
							<h3>{question.title}</h3>
							<span class="row-end">
								<span class={['tag', question.transferDistance]}>{question.distanceLabel}</span>
								<ChevronRight size={22} />
							</span>
						</a>
					{/each}
				</div>
			</section>
		</section>

		<aside class="flow-sidebar practice-transfer">
			<h2>Same chain, new context</h2>
			<p>{data.constellation.summary}</p>
			<section class="side-card">
				<div class="side-title-row">
					<h2>Start question 2</h2>
					<ClipboardList size={22} />
				</div>
				<p>{data.practiceQuestion.title}</p>
			</section>
			<a class="primary-button" href={practiceHref}>
				<ArrowRight size={23} />
				Start question 2
			</a>
			<a class="secondary-button" href={chainHref}>
				<Route size={23} />
				Back to answer chain
			</a>
		</aside>
	</div>
</main>
