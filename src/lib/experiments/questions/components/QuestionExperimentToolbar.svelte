<script lang="ts">
	import { goto } from '$app/navigation';
	import { questionRefs } from '../paperUtils';
	import type { ExamPaper } from '../types';

	let {
		paper,
		basePath,
		currentRef = ''
	}: {
		paper: ExamPaper;
		basePath: string;
		currentRef?: string;
	} = $props();

	const refs = $derived(questionRefs(paper));

	function openRef(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		void goto(value ? `${basePath}/${encodeURIComponent(value)}` : basePath);
	}
</script>

<nav class="experiment-toolbar" aria-label="Question experiment views">
	<a href={basePath} aria-current={currentRef ? undefined : 'page'}>Full paper</a>
	<label>
		<span>Single question</span>
		<select onchange={openRef} value={currentRef}>
			<option value="">Choose</option>
			{#each refs as ref}
				<option value={ref}>{ref}</option>
			{/each}
		</select>
	</label>
</nav>

<style>
	.experiment-toolbar {
		display: flex;
		flex: 0 0 100%;
		flex-wrap: wrap;
		gap: 0.8rem 1rem;
		align-items: center;
		width: min(100%, 900px);
		box-sizing: border-box;
		margin: 0 auto;
		padding: 0.8rem 2rem 0;
		background: #ffffff;
		color: #000000;
		font-family: Arial, Helvetica, sans-serif;
		font-size: 15px;
	}

	a {
		color: #000000;
		text-decoration: underline;
		text-underline-offset: 0.14em;
	}

	a[aria-current='page'] {
		font-weight: 700;
		text-decoration: none;
	}

	label {
		display: flex;
		gap: 0.45rem;
		align-items: center;
	}

	select {
		border: 1px solid #000000;
		border-radius: 0;
		background: #ffffff;
		color: #000000;
		font: inherit;
	}

	@media (max-width: 720px) {
		.experiment-toolbar {
			padding: 0.75rem 0.75rem 0;
		}
	}

	@media (max-width: 520px) {
		.experiment-toolbar {
			padding: 0.55rem 0.45rem 0;
		}

		label {
			width: 100%;
			justify-content: space-between;
		}

		select {
			max-width: 12rem;
		}
	}
</style>
