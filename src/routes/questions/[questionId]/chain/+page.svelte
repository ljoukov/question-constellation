<script lang="ts">
	import { resolve } from '$app/paths';
	import QuestionAssetFigure from '$lib/components/QuestionAssetFigure.svelte';
	import SubjectSwitcher from '$lib/components/SubjectSwitcher.svelte';
	import {
		ArrowLeft,
		ArrowRight,
		BookOpen,
		Bookmark,
		ChevronRight,
		ClipboardList,
		Lightbulb,
		Route,
		TriangleAlert
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const questionHref = $derived(
		resolve('/questions/[questionId]', { questionId: data.question.id })
	);
	const practiceHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.practiceQuestion.id })
	);
	const constellationHref = $derived(
		resolve('/constellations/[chainId]', { chainId: data.chain.id })
	);
	const currentSubject = $derived(
		data.question.meta.topic.split(':')[0] || data.question.meta.paper
	);
</script>

<svelte:head>
	<title>Same answer chain | Question Constellation</title>
	<meta
		name="description"
		content="Reveal the answer chain and see how it transfers to related GCSE questions."
	/>
</svelte:head>

<main class="flow-page chain-reveal-page">
	<header class="app-header compact-header">
		<a class="icon-button" href={questionHref} aria-label="Back to question">
			<ArrowLeft size={25} strokeWidth={2.1} />
		</a>
		<a class="brand-lockup" href={questionHref}>
			<strong>Question Constellation</strong>
		</a>
		<div class="header-actions">
			<SubjectSwitcher subjects={data.subjectNavigation} {currentSubject} />
			<Bookmark class="bookmark" size={25} strokeWidth={2.1} />
		</div>
	</header>

	<div class="flow-grid chain-grid">
		<section class="flow-main">
			<div class="section-intro">
				<h1 class="desktop-title">Same answer chain</h1>
				<p>Use this to connect the question's starting point to the final result.</p>
			</div>

			<section class="chain-card large-chain" aria-label={data.chain.concreteText}>
				<div class="chain-icons">
					{#each data.chain.steps as step (step.id)}
						<div class="chain-node">
							<span class="chain-node-icon"><Route size={25} strokeWidth={2.2} /></span>
							<span>{step.short}</span>
						</div>
					{/each}
				</div>
			</section>

			<div class="chain-teaching-grid">
				<div class="answer-stack">
					<section class="answer-panel">
						<h2>Current question</h2>
						<div class="compact-question">
							<span class="question-letter">Q</span>
							<div class="question-content compact">
								{#if data.question.context}
									<p class="question-context">{data.question.context}</p>
								{/if}
								<p>{data.question.prompt}</p>
								{#if data.question.assets.length > 0}
									<div class="question-assets compact-assets" aria-label="Question source images">
										{#each data.question.assets as asset (asset.id)}
											<QuestionAssetFigure {asset} />
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</section>

					<section class="answer-panel resources-panel">
						<h2>Use after you understand the chain</h2>
						<p>
							These resources explain how the links cause the effect and how examiners award marks.
						</p>
						<a class="resource-row" href={questionHref}>
							<BookOpen size={23} />
							Show model answer
							<ChevronRight size={22} />
						</a>
						<a
							class="resource-row"
							href={resolve('/questions/[questionId]/practice', { questionId: data.question.id })}
						>
							<ClipboardList size={23} />
							Open mark checklist
							<ChevronRight size={22} />
						</a>
						<div class="hint-card compact-hint">
							<Lightbulb size={21} />
							Try writing an answer using the chain first, then check it against the model and checklist.
						</div>
					</section>
				</div>

				<section class="answer-panel">
					<h2>Why this earns marks</h2>
					<ol class="mark-list">
						{#each data.question.checklist as item, index (item.id)}
							<li>
								<span>{index + 1}</span>
								{item.text}
							</li>
						{/each}
					</ol>
					<div class="inline-warning">
						<TriangleAlert size={20} />
						Common weak answer: {data.question.commonWeakAnswer}
					</div>
				</section>
			</div>
		</section>

		<aside class="flow-sidebar practice-transfer">
			<h2>Practice transfer</h2>
			<p>These look different, but use the same chain.</p>
			<section class="constellation-list" aria-label="Questions using this chain">
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
			</section>
			<a class="primary-button" href={constellationHref}>
				<ClipboardList size={23} />
				Open constellation
			</a>
			<a class="secondary-button" href={practiceHref}>
				<ArrowRight size={23} />
				Start question 2
			</a>
		</aside>
	</div>
</main>
