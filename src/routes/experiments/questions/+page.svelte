<script lang="ts">
	import { matchingStressPaper } from '$lib/experiments/questions/papers/matchingStress';

	let {
		data
	}: {
		data: {
			papers: Array<{
				href: string;
				title: string;
				subtitle: string;
				questionCount: number;
			}>;
		};
	} = $props();
</script>

<svelte:head>
	<title>Question rendering experiments | Question Constellation</title>
</svelte:head>

<main class="experiment-index">
	<h1>Question Rendering Experiments</h1>
	<div class="experiment-links">
		{#each data.papers as paper}
			<a href={paper.href}>
				<strong>{paper.title}</strong>
				<span>{paper.subtitle} · {paper.questionCount} questions · D1/R2</span>
			</a>
		{/each}
		<a href="/experiments/questions/matching-stress">
			<strong>{matchingStressPaper.title}</strong>
			<span>{matchingStressPaper.subtitle} · synthetic test data</span>
		</a>
	</div>
</main>

<style>
	.experiment-index {
		width: 100%;
		min-height: var(--app-viewport-height, 100vh);
		padding: 2rem;
		background: #ffffff;
		color: #000000;
		font-family: Arial, Helvetica, sans-serif;
	}

	h1 {
		margin: 0 0 1.5rem;
		font-size: 1.4rem;
	}

	.experiment-links {
		display: grid;
		gap: 0.75rem;
		width: min(100%, 34rem);
	}

	a {
		display: grid;
		gap: 0.3rem;
		padding: 1rem;
		border: 1px solid #000000;
		color: #000000;
		text-decoration: none;
	}

	span {
		font-size: 0.95rem;
	}
</style>
