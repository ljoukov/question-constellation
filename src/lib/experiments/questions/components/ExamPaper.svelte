<script lang="ts">
	import BlockRenderer from './BlockRenderer.svelte';
	import QuestionNumber from './QuestionNumber.svelte';
	import ResponseRenderer from './ResponseRenderer.svelte';
	import type { ExamPaper } from '../types';

	let { paper }: { paper: ExamPaper } = $props();
</script>

<div class="question-experiment-page">
	<article class="paper-sheet" aria-label={paper.title}>
		<header class="paper-header">
			<p>{paper.subtitle}</p>
			<h1>{paper.title}</h1>
			<p class="source-note">{paper.source}</p>
		</header>

		{#each paper.questions as question}
			<section class="main-question" aria-labelledby={`question-${question.ref}`}>
				<div class="exam-question-row exam-main-row">
					<div class="exam-number-cell">
						<QuestionNumber ref={question.ref} />
					</div>
					<div class="exam-question-body">
						<h2 id={`question-${question.ref}`} class="sr-only">Question {question.ref}</h2>
						{#each question.blocks as block}
							<BlockRenderer {block} assets={paper.assets} />
						{/each}
					</div>
				</div>

				{#each question.parts as part}
					{#if part.leadBlocks?.length}
						<div class="exam-question-row exam-lead-row">
							<div class="exam-number-cell"></div>
							<div class="exam-question-body">
								{#each part.leadBlocks as block}
									<BlockRenderer {block} assets={paper.assets} />
								{/each}
							</div>
						</div>
					{/if}
					<div class="exam-question-row exam-part-row" id={part.ref}>
						<div class="exam-number-cell">
							<QuestionNumber ref={part.ref} />
						</div>
						<div class="exam-question-body">
							{#each part.blocks as block}
								<BlockRenderer {block} assets={paper.assets} />
							{/each}
							<p class="marks">[{part.marks} {part.marks === 1 ? 'mark' : 'marks'}]</p>
							<ResponseRenderer response={part.response} assets={paper.assets} />
							{#if part.afterResponseBlocks?.length}
								<div class="after-response-blocks">
									{#each part.afterResponseBlocks as block}
										<BlockRenderer {block} assets={paper.assets} />
									{/each}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</section>
		{/each}
	</article>
</div>

<style>
	.question-experiment-page {
		flex: 0 0 100%;
		box-sizing: border-box;
		width: 100%;
		min-height: var(--app-viewport-height, 100vh);
		padding: 1.5rem 1rem 3rem;
		background: #ffffff;
		color: #000000;
	}

	.paper-sheet {
		width: min(100%, 900px);
		margin: 0 auto;
		padding: 2.2rem 2rem 3rem;
		background: #ffffff;
		color: #000000;
		font-family: Arial, Helvetica, sans-serif;
		font-size: 15px;
		line-height: 1.45;
	}

	.paper-header {
		margin-bottom: 2.2rem;
		border-bottom: 1px solid #000000;
		padding-bottom: 1rem;
	}

	.paper-header h1,
	.paper-header p {
		margin: 0;
	}

	.paper-header h1 {
		margin-top: 0.35rem;
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
	}

	.source-note {
		margin-top: 0.4rem !important;
		font-size: 0.86rem;
	}

	.main-question {
		margin: 0 0 2.4rem;
		break-inside: avoid;
	}

	.exam-question-row {
		display: grid;
		grid-template-columns: 6.6rem minmax(0, 1fr);
		gap: 1.15rem;
		align-items: start;
		min-height: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}

	.exam-main-row {
		margin-bottom: 1.35rem;
	}

	.exam-lead-row {
		margin: 0.8rem 0 1.05rem;
	}

	.exam-part-row {
		margin: 1.55rem 0;
	}

	.exam-number-cell {
		padding-top: 0.1rem;
	}

	.exam-question-body {
		min-width: 0;
	}

	.marks {
		margin: 0.2rem 0 0.35rem;
		text-align: right;
		font-weight: 700;
	}

	.after-response-blocks {
		margin-top: 1.35rem;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 720px) {
		.question-experiment-page {
			padding: 0.75rem 0.55rem 2rem;
			overflow-x: hidden;
		}

		.paper-sheet {
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
			padding: 1.2rem 0.75rem 2rem;
			font-size: 15px;
		}

		.exam-question-row {
			grid-template-columns: 4.8rem minmax(0, 1fr);
			gap: 0.75rem;
		}
	}

	@media (max-width: 520px) {
		.question-experiment-page {
			padding: 0.55rem 0.4rem 1.8rem;
		}

		.paper-sheet {
			padding: 0.9rem 0.45rem 1.8rem;
		}

		.paper-header {
			margin-bottom: 1.4rem;
		}

		.exam-question-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.45rem;
		}

		.exam-main-row {
			margin-bottom: 1.05rem;
		}

		.exam-lead-row {
			margin: 0.75rem 0 0.95rem;
		}

		.exam-part-row {
			margin: 1.25rem 0;
		}

		.exam-number-cell {
			padding-top: 0;
		}
	}
</style>
