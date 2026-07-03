<script lang="ts">
	import ResponseRenderer from '$lib/experiments/questions/components/ResponseRenderer.svelte';
	import type { ExamPaperAsset, ExamResponse } from '$lib/experiments/questions/types';

	let {
		id,
		label,
		response = null,
		assets = {},
		value = '',
		rows = 8,
		extended = false,
		placeholder = 'Write your answer...',
		onValueChange
	}: {
		id: string;
		label: string;
		response?: ExamResponse | null;
		assets?: Record<string, ExamPaperAsset>;
		value?: string;
		rows?: number;
		extended?: boolean;
		placeholder?: string;
		onValueChange?: (value: string) => void;
	} = $props();

	function updateValue(nextValue: string) {
		onValueChange?.(nextValue);
	}
</script>

{#if response}
	<p class="qc-practice-answer-label">{label}</p>
	<div class="qc-practice-response">
		<ResponseRenderer
			{response}
			{assets}
			answer={value}
			onAnswerChange={updateValue}
		/>
	</div>
{:else}
	<label for={id}>{label}</label>
	<textarea
		{id}
		class="qc-lined-answer"
		class:extended
		value={value}
		{rows}
		{placeholder}
		spellcheck="true"
		oninput={(event) => updateValue(event.currentTarget.value)}
	></textarea>
{/if}
