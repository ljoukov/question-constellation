<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import ExamQuestionCard from '$lib/components/ExamQuestionCard.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { BROWSE_SUBJECTS } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { ArrowRight, Eye } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const browseHref = $derived(
		`${resolve('/chains')}?subject=${encodeURIComponent(data.question.meta.subject)}`
	);
	const chainHref = $derived(
		resolve('/questions/[questionId]/chain', { questionId: data.question.id })
	);
	const practiceHref = $derived(
		resolve('/questions/[questionId]/practice', { questionId: data.question.id })
	);
	const contextLine = $derived(
		[
			data.question.meta.board,
			data.question.meta.qualification,
			data.question.meta.subject,
			data.question.meta.tier
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<svelte:head>
	<title>{data.question.title} | Question Constellation</title>
	<meta
		name="description"
		content={`Try ${data.question.sourceRef}, then reveal the answer chain and marking points.`}
	/>
	<link
		rel="canonical"
		href={`https://constellation.eviworld.com/questions/${encodeURIComponent(data.question.id)}`}
	/>
</svelte:head>

<main class="qc-real-app qc-public-question-page">
	<AppTopbar
		user={data.user}
		subject={data.question.meta.subject}
		subjects={[...BROWSE_SUBJECTS]}
	/>

	<div class="qc-public-question-shell">
		<IconBackLink href={browseHref} label={`Back to ${data.question.meta.subject} questions`} />

		<header class="qc-public-question-header">
			<p class="qc-real-kicker"><MathText text={contextLine} /></p>
			<h1><MathText text={data.question.title} /></h1>
		</header>

		<ExamQuestionCard
			question={data.question}
			showTitle={false}
			showMeta={false}
			assetLoading="eager"
		/>

		<div class="qc-public-question-actions" aria-label="Question actions">
			<a class="qc-action-button primary" href={practiceHref}>
				Try this question
				<ArrowRight size={18} aria-hidden="true" />
			</a>
			<a class="qc-action-button" href={chainHref}>
				<Eye size={18} aria-hidden="true" />
				Show answer chain
			</a>
		</div>
	</div>
</main>
