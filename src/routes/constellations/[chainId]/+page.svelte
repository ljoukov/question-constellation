<script lang="ts">
	import { resolve } from '$app/paths';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault, isEnglishSubject } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const chainHref = $derived(
		resolve('/questions/[questionId]/chain', { questionId: data.startQuestion.id })
	);
	const practiceHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.practiceQuestion.id })
	);
	const isEnglish = $derived(isEnglishSubject(data.startQuestion.meta.subject));
	const topbarSubject = $derived(
		isEnglish
			? englishSubjectOrDefault(data.startQuestion.meta.subject)
			: data.startQuestion.meta.subject
	);
	const topbarSubjects = [...BROWSE_SUBJECTS];
	const chainSteps = $derived(data.chain.steps.map((step) => step.short));
</script>

<svelte:head>
	<title>{data.constellation.title} | Question Constellation</title>
	<meta
		name="description"
		content={isEnglish
			? 'A GCSE English question set using the same mark path.'
			: 'A GCSE practice set: different questions using the same method.'}
	/>
</svelte:head>

<main class="qc-real-app qc-constellation-page">
	<AppTopbar
		subject={topbarSubject}
		subjects={topbarSubjects}
		searchPlaceholder="Search questions"
	/>

	<div class="qc-real-layout qc-question-layout">
		<aside
			class="qc-real-rail qc-question-rail"
			aria-label="Practice set summary"
		>
			<IconBackLink href={chainHref} label="Back to method" />
			<p class="qc-real-kicker">Practice set</p>
			<h1><MathText text={data.constellation.title} /></h1>
			<p class="qc-rail-summary"><MathText text={data.constellation.summary} /></p>
			<ThinkingChain
				steps={chainSteps}
				label="Shared method"
			/>
		</aside>

		<section class="qc-real-main qc-constellation-main" aria-label="Question set">
			<div class="qc-real-question-top">
				<div>
					<p>
						{data.questions.length} questions · {data.startQuestion.meta.board}
						{data.startQuestion.meta.subject}
					</p>
					<h2>Questions in this set</h2>
				</div>
				<a class="qc-real-link-button" href={practiceHref}>Start practice</a>
			</div>

			<ol class="qc-chain-question-list">
				{#each data.questions as question, index (question.id)}
					<li>
						<a
							class="qc-chain-question"
							href={resolve('/questions/[questionId]/practice', { questionId: question.id })}
						>
							<span class="qc-chain-question-index">{index + 1}</span>
							<span class="qc-chain-question-body">
								<span class="qc-chain-question-meta">
									<MathText
										text={`${question.distanceLabel} · ${question.meta.questionType} · ${question.meta.marks} marks`}
									/>
								</span>
								<span class="qc-chain-question-title"><MathText text={question.title} /></span>
								<span class="qc-chain-question-teaser"><MathText text={question.prompt} /></span>
							</span>
							<span class="qc-chain-question-action">Practice</span>
						</a>
					</li>
				{/each}
			</ol>
		</section>
	</div>
</main>
