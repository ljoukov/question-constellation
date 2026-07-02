<script lang="ts">
	import { Download, FileCheck2, FileText, Layers } from '@lucide/svelte';
	import type { PastPaperDocument, PastPaperDownloadRow } from './gcsePastPapers';

	let {
		rows,
		showPageLabel = false
	}: {
		rows: PastPaperDownloadRow[];
		showPageLabel?: boolean;
	} = $props();

	function documentText(document: PastPaperDocument) {
		if (document.type === 'questionPaper') return 'Question paper';
		if (document.type === 'markScheme') return 'Mark scheme';
		if (document.type === 'insert') return 'Insert';
		return document.label;
	}

	function documentClass(document: PastPaperDocument) {
		return `document-link document-${document.type}`;
	}

	function documentAriaLabel(row: PastPaperDownloadRow, document: PastPaperDocument) {
		return `${row.pageLabel} ${row.year} ${row.series} ${row.paper} ${documentText(document)} PDF`;
	}
</script>

<div class="paper-table" role="list">
	{#each rows as row (row.id)}
		<article class="paper-row" role="listitem">
			<div class="paper-meta">
				<span class="paper-year">{row.year}</span>
				<span>{row.series}</span>
				<strong>{row.paper}</strong>
				{#if showPageLabel}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a class="paper-page-link" href={row.localPath}>{row.pageLabel}</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
			</div>

			<div class="document-links">
				{#each row.documents as document (document.url + document.label)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<a
						class={documentClass(document)}
						href={document.url}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={documentAriaLabel(row, document)}
					>
						{#if document.type === 'markScheme'}
							<FileCheck2 size={15} aria-hidden="true" strokeWidth={2.2} />
						{:else if document.type === 'insert'}
							<Layers size={15} aria-hidden="true" strokeWidth={2.2} />
						{:else}
							<FileText size={15} aria-hidden="true" strokeWidth={2.2} />
						{/if}
						<span>{documentText(document)}</span>
						<Download size={14} aria-hidden="true" strokeWidth={2.2} />
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/each}
			</div>
		</article>
	{/each}
</div>

<style>
	.paper-table {
		display: grid;
		border-top: 1px solid #e2e8ee;
	}

	.paper-row {
		display: grid;
		grid-template-columns: minmax(17rem, 1fr) minmax(18rem, 1.2fr);
		gap: 0.8rem;
		align-items: center;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid #e8eef3;
	}

	.paper-row:last-child {
		border-bottom: 0;
	}

	.paper-meta {
		display: grid;
		grid-template-columns: 4.6rem 5.4rem minmax(0, 1fr);
		gap: 0.7rem;
		align-items: center;
		min-width: 0;
		color: #344256;
		font-size: 0.9rem;
	}

	.paper-meta strong {
		min-width: 0;
		color: #0f172a;
		font-weight: 850;
	}

	.paper-page-link {
		grid-column: 1 / -1;
		width: fit-content;
		color: #0f6b3d;
		font-size: 0.82rem;
		font-weight: 820;
		text-decoration: underline;
		text-underline-offset: 0.18em;
	}

	.paper-year {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 1.75rem;
		border: 1px solid #d3dde6;
		background: #f8fafb;
		color: #132033;
		font-weight: 900;
	}

	.document-links {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.42rem;
	}

	.document-link {
		display: inline-flex;
		align-items: center;
		gap: 0.38rem;
		min-height: 2rem;
		padding: 0.38rem 0.54rem;
		border: 1px solid #cbd7df;
		background: #ffffff;
		color: #183047;
		font-size: 0.82rem;
		font-weight: 820;
	}

	.document-link:hover,
	.document-link:focus-visible {
		border-color: #10253a;
		background: #f6fafb;
	}

	.document-questionPaper {
		border-color: #b8d0c2;
		color: #0f6b3d;
	}

	.document-markScheme {
		border-color: #bfcee6;
		color: #1d4f91;
	}

	.document-insert {
		border-color: #ead295;
		color: #795719;
	}

	:global(:root[data-theme='dark']) .paper-table,
	:global(:root[data-theme='dark']) .paper-row {
		border-color: #263449;
	}

	:global(:root[data-theme='dark']) .paper-meta {
		color: #9fb0c5;
	}

	:global(:root[data-theme='dark']) .paper-meta strong {
		color: #e5edf6;
	}

	:global(:root[data-theme='dark']) .paper-page-link {
		color: #7dd3a1;
	}

	:global(:root[data-theme='dark']) .document-link,
	:global(:root[data-theme='dark']) .paper-year {
		border-color: #334155;
		background: #0f172a;
		color: #dbe7f3;
	}

	@media (max-width: 860px) {
		.paper-row {
			grid-template-columns: 1fr;
		}

		.document-links {
			justify-content: flex-start;
		}
	}

	@media (max-width: 520px) {
		.paper-row {
			padding-inline: 0.72rem;
		}

		.paper-meta {
			grid-template-columns: 4.1rem minmax(0, 1fr);
		}

		.paper-meta strong,
		.paper-page-link {
			grid-column: 1 / -1;
		}

		.document-link {
			flex: 1 1 9rem;
			justify-content: center;
		}
	}
</style>
