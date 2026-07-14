<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import type { PastPaperDownloadRow } from './gcsePastPapers';

	let {
		rows,
		showPageLabel = false
	}: {
		rows: PastPaperDownloadRow[];
		showPageLabel?: boolean;
	} = $props();

	function paperPageLabel(row: PastPaperDownloadRow) {
		return `${row.pageLabel} ${row.paper} ${row.series} ${row.year} past papers`;
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

			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a class="paper-detail-link" href={row.paperLocalPath} aria-label={paperPageLabel(row)}>
				Open files
				<ArrowRight size={15} aria-hidden="true" strokeWidth={2.2} />
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
		grid-template-columns: minmax(17rem, 1fr) auto;
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

	.paper-detail-link {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 2rem;
		padding: 0.38rem 0.6rem;
		border: 1px solid #b8d0c2;
		background: #ffffff;
		color: #0f6b3d;
		font-size: 0.84rem;
		font-weight: 820;
		text-decoration: none;
	}

	.paper-detail-link:hover,
	.paper-detail-link:focus-visible {
		border-color: #0f6b3d;
		background: #f3faf6;
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

	:global(:root[data-theme='dark']) .paper-detail-link,
	:global(:root[data-theme='dark']) .paper-year {
		border-color: #334155;
		background: #0f172a;
		color: #dbe7f3;
	}

	:global(:root[data-theme='dark']) .paper-detail-link:hover,
	:global(:root[data-theme='dark']) .paper-detail-link:focus-visible {
		border-color: #7dd3a1;
		background: #111d33;
		color: #7dd3a1;
	}

	@media (max-width: 620px) {
		.paper-row {
			grid-template-columns: 1fr;
		}

		.paper-detail-link {
			justify-self: start;
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
	}
</style>
