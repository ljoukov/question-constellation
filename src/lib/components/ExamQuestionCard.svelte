<script lang="ts">
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import QuestionAssetFigure from './QuestionAssetFigure.svelte';

	type ExamQuestionAsset = {
		id?: string;
		publicPath: string;
		altText: string;
		sourceLabel: string;
		paperWidthPx?: number | null;
		paperHeightPx?: number | null;
	};

	type ExamQuestion = {
		sourceRef?: string;
		title?: string;
		prompt: string;
		context?: string;
		assets?: ExamQuestionAsset[];
		meta?: {
			board?: string;
			qualification?: string;
			subject?: string;
			tier?: string;
			paper?: string;
			questionType?: string;
			marks?: number | null;
		};
	};

	let {
		question,
		heading = '',
		compact = false,
		showTitle = true,
		assetLoading = 'lazy'
	}: {
		question: ExamQuestion;
		heading?: string;
		compact?: boolean;
		showTitle?: boolean;
		assetLoading?: 'eager' | 'lazy';
	} = $props();

	const contextLines = $derived(linesFrom(question.context ?? ''));
	const promptLines = $derived(linesFrom(question.prompt));
	const assets = $derived(question.assets ?? []);
	const questionLabel = $derived(
		question.sourceRef ?? heading ?? question.title ?? 'Exam question'
	);
	const marksLabel = $derived(
		typeof question.meta?.marks === 'number' ? `${question.meta.marks} marks` : ''
	);
	const metaLine = $derived(
		[
			question.meta?.board,
			question.meta?.qualification,
			question.meta?.subject,
			question.meta?.tier,
			question.meta?.paper
		]
			.filter(Boolean)
			.join(' · ')
	);

	function linesFrom(value: string) {
		return value
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);
	}

	function isBullet(line: string) {
		return /^[*-]\s+/.test(line) || /^•\s+/.test(line);
	}

	function cleanBullet(line: string) {
		return line.replace(/^(?:[*-]|•)\s+/, '');
	}
</script>

<section class="qc-exam-card" class:compact aria-label={questionLabel}>
	<header class="qc-exam-card-head">
		<span class="qc-exam-ref"><MathText text={questionLabel} /></span>
		{#if marksLabel}
			<span class="qc-exam-marks">{marksLabel}</span>
		{/if}
	</header>

	{#if metaLine}
		<p class="qc-exam-meta"><MathText text={metaLine} /></p>
	{/if}

	{#if showTitle && question.title}
		<h2><MathText text={question.title} /></h2>
	{/if}

	{#if contextLines.length > 0}
		<div class="qc-exam-context" aria-label="Question source">
			{#each contextLines as line, index (index)}
				<p><MathText text={line} /></p>
			{/each}
		</div>
	{/if}

	{#if assets.length > 0}
		<div class="question-assets qc-exam-assets" aria-label="Question source images">
			{#each assets as asset, index (asset.id ?? `${asset.publicPath}-${index}`)}
				<QuestionAssetFigure {asset} loading={assetLoading} />
			{/each}
		</div>
	{/if}

	<div class="qc-exam-prompt">
		{#each promptLines as line, index (index)}
			<p class:bullet={isBullet(line)}>
				{#if isBullet(line)}
					<span aria-hidden="true">•</span>
					<MathText text={cleanBullet(line)} />
				{:else}
					<MathText text={line} />
				{/if}
			</p>
		{/each}
	</div>
</section>
