<script lang="ts">
	import { CircleAlert } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
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
		copyAttempt = 0,
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
		copyAttempt?: number;
		onValueChange?: (value: string) => void;
		onExternalInput?: (source: ExternalInputSource) => void;
	} = $props();

	type BlockedAction = ExternalInputSource | 'copy';

	// Keep the completed feedback treatment ready for a future practice-integrity pass.
	const BLOCKED_ACTION_NOTICE_ENABLED = false;
	const BLOCKED_NOTICE_DURATION_MS = 7_000;
	let blockedAction = $state<BlockedAction | null>(null);
	let previousCopyAttempt = $state<number | null>(null);
	let blockedNoticeTimer: ReturnType<typeof setTimeout> | undefined;

	const blockedActionTitle = $derived(
		blockedAction === 'copy' ? 'Copy is turned off here' : 'Paste and drop are turned off here'
	);

	function hideBlockedNotice() {
		if (blockedNoticeTimer) {
			clearTimeout(blockedNoticeTimer);
			blockedNoticeTimer = undefined;
		}
		blockedAction = null;
	}

	function showBlockedNotice(action: BlockedAction) {
		if (!BLOCKED_ACTION_NOTICE_ENABLED) return;
		if (blockedNoticeTimer) clearTimeout(blockedNoticeTimer);
		blockedAction = action;
		blockedNoticeTimer = setTimeout(() => {
			blockedAction = null;
			blockedNoticeTimer = undefined;
		}, BLOCKED_NOTICE_DURATION_MS);
	}

	function updateValue(nextValue: string) {
		hideBlockedNotice();
		onValueChange?.(nextValue);
	}

	function markBeforeInput(event: InputEvent) {
		const source = externalInputSourceFromBeforeInput(event.inputType);
		if (!source) return;
		event.preventDefault();
		showBlockedNotice(source);
		onExternalInput?.(source);
	}

	function blockExternalInput(event: Event, source: ExternalInputSource) {
		event.preventDefault();
		showBlockedNotice(source);
		onExternalInput?.(source);
	}

	$effect(() => {
		if (previousCopyAttempt === null) {
			previousCopyAttempt = copyAttempt;
			return;
		}
		if (copyAttempt === previousCopyAttempt) return;
		previousCopyAttempt = copyAttempt;
		showBlockedNotice('copy');
	});

	onDestroy(() => {
		if (blockedNoticeTimer) clearTimeout(blockedNoticeTimer);
	});
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
		<ResponseRenderer {response} {assets} answer={value} onAnswerChange={updateValue} />
	</div>
{:else}
	<label for={id}>{label}</label>
	<textarea
		{id}
		class="qc-lined-answer"
		class:extended
		{value}
		{rows}
		{placeholder}
		spellcheck="true"
		onpaste={(event) => blockExternalInput(event, 'paste')}
		ondrop={(event) => blockExternalInput(event, 'drop')}
		onbeforeinput={(event) => markBeforeInput(event as InputEvent)}
		oninput={(event) => updateValue(event.currentTarget.value)}
	></textarea>
{/if}
{#if blockedAction}
	<div
		class="qc-input-blocked-alert"
		role="alert"
		in:fly={{ x: -24, duration: 180 }}
		out:fly={{ x: 24, duration: 160 }}
	>
		<CircleAlert size={21} strokeWidth={2.25} aria-hidden="true" />
		<p>
			<strong>{blockedActionTitle}</strong>
			<span>You can keep going by typing your answer.</span>
		</p>
	</div>
{/if}

<style>
	.qc-input-blocked-alert {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 0.65rem;
		align-items: start;
		margin: 0.2rem 0 0;
		padding: 0.7rem 0.8rem;
		border: 1px solid color-mix(in srgb, var(--qc-ui-danger) 48%, var(--qc-ui-border-subtle));
		border-left: 0.25rem solid var(--qc-ui-danger);
		background: color-mix(in srgb, var(--qc-ui-danger) 10%, var(--qc-ui-surface));
		color: var(--qc-ui-danger);
	}

	.qc-input-blocked-alert :global(svg) {
		margin-top: 0.08rem;
	}

	.qc-input-blocked-alert p {
		display: grid;
		gap: 0.12rem;
		min-width: 0;
		margin: 0;
		line-height: 1.4;
	}

	.qc-input-blocked-alert strong {
		font-size: 0.9rem;
		font-weight: 760;
	}

	.qc-input-blocked-alert span {
		color: var(--qc-ui-text-secondary);
		font-size: 0.86rem;
	}
</style>
