<script lang="ts">
	import ExamPaper from '$lib/experiments/questions/components/ExamPaper.svelte';
	import QuestionExperimentToolbar from '$lib/experiments/questions/components/QuestionExperimentToolbar.svelte';
	import type { ExamPaper as ExamPaperData } from '$lib/experiments/questions/types';

	let {
		data
	}: {
		data: {
			paper: ExamPaperData;
		};
	} = $props();
</script>

<svelte:head>
	<title>{data.paper.title} | Question rendering experiment</title>
</svelte:head>

<QuestionExperimentToolbar paper={data.paper} />
<ExamPaper paper={data.paper} />
