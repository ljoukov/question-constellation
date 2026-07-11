<script lang="ts">
	import MathText from '$lib/experiments/questions/components/MathText.svelte';

	let {
		href,
		meta,
		title,
		detail = null,
		tag = null
	}: {
		href: string;
		meta: string;
		title: string;
		detail?: string | null;
		tag?: string | null;
	} = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a class="qc-topic-question" {href}>
	<span><MathText text={meta} /></span>
	<strong><MathText text={title} /></strong>
	{#if detail}
		<small><MathText text={detail} /></small>
	{/if}
	{#if tag}
		<em><MathText text={tag} /></em>
	{/if}
</a>
