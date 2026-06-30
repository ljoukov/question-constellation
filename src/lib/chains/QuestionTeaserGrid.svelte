<script lang="ts">
	import { resolve } from '$app/paths';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { LearningChain } from '$lib/learningChains';

	let {
		chain,
		questions = chain.questions,
		limit = null
	}: {
		chain: LearningChain;
		questions?: LearningChain['questions'];
		limit?: number | null;
	} = $props();

	const visibleQuestions = $derived(limit === null ? questions : questions.slice(0, limit));

	function practiceHref(ref = chain.primaryRef) {
		return resolve('/practice/[chainId]/[ref]', { chainId: chain.id, ref });
	}

	function questionRouteRef(question: LearningChain['questions'][number]) {
		return question.id ?? question.ref;
	}

	function accessibleText(value: string) {
		return value.replace(/\s*<=>\s*/g, ' ⇌ ').replace(/\s*(?:->|⟶|⇒|)\s*/g, ' → ');
	}
</script>

<div class="qc-question-card-grid" aria-label={`${accessibleText(chain.title)} question teasers`}>
	{#each visibleQuestions as question (question.id ?? question.ref)}
		<a class="qc-question-card" href={practiceHref(questionRouteRef(question))}>
			<span class="qc-question-label"><MathText text={question.label} /></span>
			<span class="qc-question-title"><MathText text={question.title} /></span>
			<span class="qc-question-preview"><MathText text={question.teaser} /></span>
			<span class="qc-question-meta"
				><MathText text={`${question.command} · ${question.marks ?? '?'} marks`} /></span
			>
		</a>
	{/each}
</div>
