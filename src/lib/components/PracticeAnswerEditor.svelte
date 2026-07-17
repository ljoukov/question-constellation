<script lang="ts">
	import ResponseRenderer from '$lib/experiments/questions/components/ResponseRenderer.svelte';
	import type { ExamPaperAsset, ExamResponse } from '$lib/experiments/questions/types';
	import {
		externalInputSourceFromBeforeInput,
		type ExternalInputSource
	} from '$lib/learning/answerAssistance';

	let {
		id,
		label,
		response = null,
		assets = {},
		value = '',
		rows = 8,
		extended = false,
		placeholder = 'Write your answer...',
		onValueChange,
		onExternalInput
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
		onExternalInput?: (source: ExternalInputSource) => void;
	} = $props();
	let blockedInputNotice = $state(false);

	function updateValue(nextValue: string) {
		onValueChange?.(nextValue);
	}

	function markBeforeInput(event: InputEvent) {
		const source = externalInputSourceFromBeforeInput(event.inputType);
		if (!source) return;
		event.preventDefault();
		blockedInputNotice = true;
		onExternalInput?.(source);
	}

	function blockExternalInput(event: Event, source: ExternalInputSource) {
		event.preventDefault();
		blockedInputNotice = true;
		onExternalInput?.(source);
	}
</script>

{#if response}
	<p class="qc-practice-answer-label">{label}</p>
	<div
		class="qc-practice-response"
		role="group"
		aria-label={label}
		onpaste={(event) => blockExternalInput(event, 'paste')}
		ondrop={(event) => blockExternalInput(event, 'drop')}
		onbeforeinput={(event) => markBeforeInput(event as InputEvent)}
	>
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
		onpaste={(event) => blockExternalInput(event, 'paste')}
		ondrop={(event) => blockExternalInput(event, 'drop')}
		onbeforeinput={(event) => markBeforeInput(event as InputEvent)}
		oninput={(event) => updateValue(event.currentTarget.value)}
	></textarea>
{/if}
{#if blockedInputNotice}
	<p class="qc-assisted-evidence-note" role="status">
		Paste and drop are blocked here. Type the answer yourself.
	</p>
{/if}
