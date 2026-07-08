<script lang="ts">
	import RecallActivityPage from '$lib/recall/RecallActivityPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.subject} Recall Coverage | Question Constellation</title>
	<meta
		name="description"
		content={`AQA GCSE ${data.subject} recall cards grouped by specification topic and paper.`}
	/>
</svelte:head>

<RecallActivityPage {...data} pageKind="coverage" />
