<script lang="ts">
	import ExamPaper from '$lib/experiments/questions/components/ExamPaper.svelte';
	import QuestionExperimentToolbar from '$lib/experiments/questions/components/QuestionExperimentToolbar.svelte';
	import { focusPaperByRef } from '$lib/experiments/questions/paperUtils';
	import type { ExamPaper as ExamPaperData } from '$lib/experiments/questions/types';

	let {
		data
	}: {
		data: {
			ref: string;
			paper: ExamPaperData;
		};
	} = $props();

	const basePath = $derived(`/experiments/questions/${data.paper.id}`);
	const focusedPaper = $derived(focusPaperByRef(data.paper, data.ref));
</script>

<svelte:head>
	<title>{data.paper.title} {data.ref} | Question rendering experiment</title>
</svelte:head>

<QuestionExperimentToolbar paper={data.paper} {basePath} currentRef={data.ref} />

{#if focusedPaper}
	<ExamPaper paper={focusedPaper} />
{:else}
	<main class="missing-question">
		<h1>Question not found</h1>
		<a href={basePath}>Back to paper</a>
	</main>
{/if}

<style>
	.missing-question {
		width: min(100%, 900px);
		margin: 0 auto;
		padding: 2rem;
		background: #ffffff;
		color: #000000;
		font-family: Arial, Helvetica, sans-serif;
	}
</style>
