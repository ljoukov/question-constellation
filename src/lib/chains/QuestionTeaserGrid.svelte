<script lang="ts">
	import { resolve } from '$app/paths';
	import type { LearningChain } from '$lib/learningChains';

	let { chain }: { chain: LearningChain } = $props();

	function practiceHref(ref = chain.primaryRef) {
		return resolve('/practice/[chainId]/[ref]', { chainId: chain.id, ref });
	}
</script>

<div class="qc-question-card-grid" aria-label={`${chain.title} question teasers`}>
	{#each chain.questions as question (question.ref)}
		<a class="qc-question-card" href={practiceHref(question.ref)}>
			<span class="qc-question-label">{question.label}</span>
			<span class="qc-question-title">{question.title}</span>
			<span class="qc-question-preview">{question.teaser}</span>
			<span class="qc-question-meta">{question.command} · {question.marks ?? '?'} marks</span>
		</a>
	{/each}
</div>
