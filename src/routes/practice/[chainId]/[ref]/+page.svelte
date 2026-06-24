<script lang="ts">
	import PracticeQuestionScreen from '$lib/chains/PracticeQuestionScreen.svelte';
	import type { ExamPaper as ExamPaperData } from '$lib/experiments/questions/types';
	import type { LearningChain } from '$lib/learningChains';

	let {
		data
	}: {
		data: {
			chain: LearningChain;
			initialRef: string;
			paper: ExamPaperData;
		};
	} = $props();
</script>

<svelte:head>
	<title>{data.chain.title} practice | Question Constellation</title>
</svelte:head>

<PracticeQuestionScreen paper={data.paper} chain={data.chain} initialRef={data.initialRef} />
