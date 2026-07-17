<script lang="ts">
	import RecallActivityPage from '$lib/recall/RecallActivityPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.subject} True or False | Question Constellation</title>
	<meta
		name="description"
		content={`${data.board} GCSE ${data.subject} true-or-false recall with visible specification coverage.`}
	/>
</svelte:head>

<RecallActivityPage {...data} />
