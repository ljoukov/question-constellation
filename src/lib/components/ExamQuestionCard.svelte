<script lang="ts">
	import BlockRenderer from '$lib/experiments/questions/components/BlockRenderer.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { ExamPaperAsset, ExamQuestionBlock } from '$lib/experiments/questions/types';
	import { markLabel } from '$lib/marks';
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
		renderingOverlay?: {
			stemBlocks: Array<Record<string, unknown>>;
			promptBlocks: Array<Record<string, unknown>>;
		} | null;
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
		showHeader = true,
		showMeta = true,
		assetLoading = 'lazy'
	}: {
		question: ExamQuestion;
		heading?: string;
		compact?: boolean;
		showTitle?: boolean;
		showHeader?: boolean;
		showMeta?: boolean;
		assetLoading?: 'eager' | 'lazy';
	} = $props();

	const contextLines = $derived(linesFrom(question.context ?? ''));
	const promptLines = $derived(linesFrom(question.prompt));
	const assets = $derived(question.assets ?? []);
	const renderingOverlay = $derived(question.renderingOverlay ?? null);
	const overlayStemBlocks = $derived((renderingOverlay?.stemBlocks ?? []) as ExamQuestionBlock[]);
	const overlayPromptBlocks = $derived(
		(renderingOverlay?.promptBlocks ?? []) as ExamQuestionBlock[]
	);
	const hasRenderingOverlay = $derived(
		overlayStemBlocks.length > 0 || overlayPromptBlocks.length > 0
	);
	const overlayAssets = $derived(
		Object.fromEntries(
			assets.map((asset) => [
				asset.id ?? asset.publicPath,
				{
					id: asset.id ?? asset.publicPath,
					label: asset.sourceLabel,
					src: asset.publicPath,
					alt: asset.altText,
					width: asset.paperWidthPx ?? undefined
				}
			])
		) as Record<string, ExamPaperAsset>
	);
	const questionLabel = $derived(
		question.sourceRef ?? heading ?? question.title ?? 'Exam question'
	);
	const marksLabel = $derived(markLabel(question.meta?.marks));
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
	{#if showHeader}
		<header class="qc-exam-card-head">
			<span class="qc-exam-ref"><MathText text={questionLabel} /></span>
			{#if marksLabel}
				<span class="qc-exam-marks">{marksLabel}</span>
			{/if}
		</header>
	{/if}

	{#if showMeta && metaLine}
		<p class="qc-exam-meta"><MathText text={metaLine} /></p>
	{/if}

	{#if showTitle && question.title}
		<h2><MathText text={question.title} /></h2>
	{/if}

	{#if hasRenderingOverlay}
		<div class="qc-exam-rendered" aria-label="Question content">
			{#each overlayStemBlocks as block, index (`stem-${index}`)}
				<BlockRenderer {block} assets={overlayAssets} />
			{/each}

			{#each overlayPromptBlocks as block, index (`prompt-${index}`)}
				<BlockRenderer {block} assets={overlayAssets} />
			{/each}
		</div>
	{:else}
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
	{/if}
</section>
