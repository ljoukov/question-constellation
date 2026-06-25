<script lang="ts">
	import type { ExamPaperAsset, ExamQuestionBlock } from '../types';
	import MathText from './MathText.svelte';

	let {
		block,
		assets
	}: {
		block: ExamQuestionBlock;
		assets: Record<string, ExamPaperAsset>;
	} = $props();

	let failedAssetIds = $state<Set<string>>(new Set());

	function markImageFailed(assetId: string) {
		failedAssetIds = new Set([...failedAssetIds, assetId]);
	}
</script>

{#if block.kind === 'paragraph'}
	<p class="exam-paragraph"><MathText text={block.text} /></p>
{:else if block.kind === 'figure'}
	{@const asset = assets[block.assetId]}
	{#if asset && !failedAssetIds.has(block.assetId)}
		<figure class="exam-figure" style={`--figure-width: ${block.width ?? asset.width ?? 360}px`}>
			<figcaption>{block.label ?? asset.label}</figcaption>
			<img src={asset.src} alt={asset.alt} onerror={() => markImageFailed(block.assetId)} />
		</figure>
	{:else}
		<p class="missing-asset">
			{asset
				? `Image unavailable: ${block.label ?? asset.label}`
				: `Missing asset: ${block.assetId}`}
		</p>
	{/if}
{:else if block.kind === 'table'}
	<figure class="exam-table-wrap" class:compact={block.compact}>
		{#if block.label}
			<figcaption>{block.label}</figcaption>
		{/if}
		<table>
			<thead>
				<tr>
					{#each block.columns as column}
						<th><MathText text={column} /></th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each block.rows as row}
					<tr>
						{#each row as cell}
							<td><MathText text={cell} /></td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</figure>
{:else if block.kind === 'structured-table'}
	<figure class="exam-table-wrap" class:compact={block.compact} class:wide={block.wide}>
		{#if block.label}
			<figcaption>{block.label}</figcaption>
		{/if}
		<table>
			<tbody>
				{#each block.rows as row}
					<tr>
						{#each row as cell}
							<svelte:element
								this={cell.header ? 'th' : 'td'}
								colspan={cell.colspan}
								rowspan={cell.rowspan}
								style={`text-align: ${cell.align ?? (cell.header ? 'center' : 'left')}`}
							>
								<MathText text={cell.text} />
							</svelte:element>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</figure>
{:else if block.kind === 'key'}
	<div class="exam-key">
		<strong>Key</strong>
		<dl>
			{#each block.items as item}
				<div>
					<dt><MathText text={item.marker} /></dt>
					<dd><MathText text={item.text} /></dd>
				</div>
			{/each}
		</dl>
	</div>
{:else if block.kind === 'ordered-list'}
	<ol class="exam-list">
		{#each block.items as item}
			<li><MathText text={item} /></li>
		{/each}
	</ol>
{:else if block.kind === 'bullet-list'}
	<ul class="exam-list">
		{#each block.items as item}
			<li><MathText text={item} /></li>
		{/each}
	</ul>
{:else if block.kind === 'equation'}
	<div class="exam-equation"><MathText text={block.text} display /></div>
{/if}

<style>
	.exam-paragraph {
		margin: 0 0 0.85rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.exam-figure {
		width: min(100%, var(--figure-width));
		margin: 0.8rem auto 1.05rem;
		text-align: center;
	}

	.exam-figure figcaption,
	.exam-table-wrap figcaption {
		margin-bottom: 0.45rem;
		color: #000000;
		font-weight: 700;
		text-align: center;
	}

	.exam-figure img {
		display: block;
		width: 100%;
		height: auto;
		margin: 0 auto;
	}

	.exam-table-wrap {
		width: min(100%, 34rem);
		margin: 0.85rem auto 1.05rem;
	}

	.exam-table-wrap.compact {
		width: min(100%, 28rem);
	}

	.exam-table-wrap.wide {
		width: min(100%, 48rem);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		color: #000000;
		font-size: 0.95em;
	}

	th,
	td {
		border: 1px solid #000000;
		padding: 0.35rem 0.55rem;
		text-align: center;
		vertical-align: middle;
	}

	th {
		font-weight: 700;
	}

	.exam-key {
		display: grid;
		gap: 0.25rem;
		width: min(100%, 34rem);
		margin: 0.55rem auto 1.05rem;
	}

	.exam-key strong {
		font-weight: 700;
	}

	.exam-key dl {
		display: grid;
		gap: 0.15rem;
		margin: 0;
	}

	.exam-key div {
		display: grid;
		grid-template-columns: 1.8rem minmax(0, 1fr);
		gap: 0.4rem;
		align-items: baseline;
	}

	.exam-key dt,
	.exam-key dd {
		margin: 0;
	}

	.exam-list {
		margin: 0.4rem 0 0.95rem 1.35rem;
		padding: 0;
	}

	.exam-list li {
		margin: 0.25rem 0;
		padding-left: 0.2rem;
	}

	.exam-equation {
		margin: 0.9rem 0;
		text-align: center;
		font-size: 1.05em;
		white-space: pre-wrap;
	}

	.missing-asset {
		margin: 0.75rem 0;
		color: #7f1d1d;
	}

	@media (max-width: 720px) {
		.exam-figure,
		.exam-table-wrap,
		.exam-table-wrap.compact,
		.exam-table-wrap.wide {
			width: min(100%, calc(100vw - 8rem));
			max-width: min(100%, calc(100vw - 8rem));
		}

		table {
			table-layout: fixed;
			font-size: 0.84em;
		}

		th,
		td {
			padding: 0.3rem 0.32rem;
			overflow-wrap: break-word;
			word-break: normal;
		}
	}
</style>
