<script lang="ts">
	import ExamPaper from '$lib/experiments/questions/components/ExamPaper.svelte';
	import { matchingStressPaper } from '$lib/experiments/questions/papers/matchingStress';
</script>

<svelte:head>
	<title>{matchingStressPaper.title} | Question rendering experiment</title>
</svelte:head>

<ExamPaper paper={matchingStressPaper} />
