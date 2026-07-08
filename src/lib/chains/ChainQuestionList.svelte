<script lang="ts">
	import { resolve } from '$app/paths';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { LearningChain } from '$lib/learningChains';

	let { chain }: { chain: LearningChain } = $props();

	let visibleCount = $state(12);
	const visibleQuestions = $derived(chain.questions.slice(0, visibleCount));
	const remainingCount = $derived(Math.max(0, chain.questions.length - visibleQuestions.length));

	function practiceHref(question: LearningChain['questions'][number]) {
		return resolve('/questions/[questionId]/practice', {
			questionId: question.id ?? question.ref
		});
	}

	function accessibleText(value: string) {
		return value.replace(/\s*<=>\s*/g, ' ⇌ ').replace(/\s*(?:->|⟶|⇒|)\s*/g, ' → ');
	}
</script>

<ol class="qc-chain-question-list" aria-label={`${accessibleText(chain.title)} questions`}>
	{#each visibleQuestions as question, index (question.id ?? question.ref)}
		<li>
			<a class="qc-chain-question" href={practiceHref(question)}>
				<span class="qc-chain-question-index">{index + 1}</span>
				<span class="qc-chain-question-body">
					<span class="qc-chain-question-meta"
						><MathText
							text={`${question.label} · ${question.command} · ${question.marks ?? '?'} marks`}
						/></span
					>
					<span class="qc-chain-question-title"><MathText text={question.title} /></span>
					<span class="qc-chain-question-teaser"><MathText text={question.teaser} /></span>
				</span>
				<span class="qc-chain-question-action">Open question</span>
			</a>
		</li>
	{/each}
</ol>

{#if remainingCount > 0}
	<button
		type="button"
		class="qc-chain-load-more"
		onclick={() => (visibleCount = Math.min(visibleCount + 12, chain.questions.length))}
	>
		Show {remainingCount > 12 ? 12 : remainingCount} more questions
	</button>
{/if}
