<script lang="ts">
	import { page as pageState } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { authStartHref } from '$lib/authReturn';
	import ExamPaper from '$lib/experiments/questions/components/ExamPaper.svelte';
	import FullPaperSitting from '$lib/experiments/questions/components/FullPaperSitting.svelte';
	import QuestionExperimentToolbar from '$lib/experiments/questions/components/QuestionExperimentToolbar.svelte';
	import type { ExamPaper as ExamPaperData } from '$lib/experiments/questions/types';
	import type { AdminUser } from '$lib/server/auth/session';
	import type { PaperSittingAvailability } from '$lib/server/paperSittingReadiness';

	let {
		data
	}: {
		data: {
			paper: ExamPaperData;
			user: AdminUser | null;
			sittingAvailability: PaperSittingAvailability;
		};
	} = $props();
	const resolveInternalPath = resolve as (path: string) => ResolvedPathname;

	const sittingMode = $derived(pageState.url.searchParams.get('mode') === 'sit');
	const paperPath = $derived(
		resolve('/experiments/questions/[paperSlug]', { paperSlug: data.paper.id })
	);
	const sittingHref = $derived(`${paperPath}?mode=sit` as ResolvedPathname);
	const signInHref = $derived(resolveInternalPath(authStartHref(sittingHref)));
	const readyToSit = $derived(
		data.sittingAvailability.available &&
			data.sittingAvailability.durationMinutes !== null &&
			data.sittingAvailability.reviewedAt !== null
	);
</script>

<svelte:head>
	<title
		>{data.paper.title} | {sittingMode
			? 'Online GCSE paper'
			: 'Question rendering experiment'}</title
	>
</svelte:head>

<main class="paper-page-shell">
	{#if readyToSit && sittingMode && data.user}
		<FullPaperSitting
			paper={data.paper}
			userId={data.user.uid}
			durationMinutes={data.sittingAvailability.durationMinutes!}
			totalMarks={data.sittingAvailability.totalMarks}
			reviewedAt={data.sittingAvailability.reviewedAt!}
		/>
	{:else}
		{#if !sittingMode}
			<QuestionExperimentToolbar paper={data.paper} />
		{/if}

		{#if readyToSit}
			<section class="paper-mode-card ready" aria-labelledby="paper-mode-title">
				<p class="eyebrow">Reviewed full paper</p>
				<h1 id="paper-mode-title">
					{sittingMode && !data.user ? 'Sign in to sit this paper' : 'Sit this paper online'}
				</h1>
				<p>
					All {data.sittingAvailability.inventoryQuestionCount} questions have reviewed online renderings
					and passed the source-and-rendering checks.
				</p>
				<div class="paper-facts">
					<span>{data.sittingAvailability.durationMinutes} minutes</span>
					<span>{data.sittingAvailability.totalMarks} marks</span>
					<span>{data.sittingAvailability.eligiblePartCount} answer fields</span>
				</div>
				<a href={sittingMode && !data.user ? signInHref : sittingHref}>
					{sittingMode && !data.user ? 'Sign in and return' : 'Start or resume sitting'}
				</a>
			</section>
		{:else}
			<section class="paper-mode-card preview" aria-labelledby="paper-mode-title">
				<p class="eyebrow">Renderer preview</p>
				<h1 id="paper-mode-title">Online sitting is not ready for this paper</h1>
				<p>
					The questions below are reviewed renderer samples only. They are not advertised as a
					complete paper, and answers are disabled on this preview.
				</p>
				{#if data.sittingAvailability.inventoryQuestionCount > 0}
					<p class="coverage-note">
						{data.sittingAvailability.renderedQuestionCount} of
						{data.sittingAvailability.inventoryQuestionCount} imported question rows currently render
						online.
					</p>
				{/if}
			</section>
		{/if}

		<ExamPaper paper={data.paper} readOnly />
	{/if}
</main>

<style>
	.paper-page-shell {
		display: flex;
		min-height: var(--app-viewport-height, 100vh);
		flex-direction: column;
		background: var(--qc-ui-canvas);
		color: var(--qc-ui-text);
	}

	.paper-mode-card {
		box-sizing: border-box;
		width: min(calc(100% - 2rem), 900px);
		margin: 1rem auto 0;
		border: 1px solid var(--qc-ui-border-subtle);
		padding: 1rem 1.1rem;
		background: var(--qc-ui-surface-raised);
		color: var(--qc-ui-text);
		font: inherit;
	}

	.paper-mode-card.ready {
		border-color: var(--qc-ui-accent-border);
		background: var(--qc-ui-accent-muted);
	}

	.paper-mode-card h1,
	.paper-mode-card p {
		margin: 0;
	}

	.paper-mode-card h1 {
		margin-top: 0.2rem;
		font-size: clamp(1.2rem, 3vw, 1.65rem);
		line-height: 1.2;
	}

	.paper-mode-card h1 + p,
	.coverage-note {
		margin-top: 0.55rem;
		max-width: 48rem;
		color: var(--qc-ui-text-secondary);
		line-height: 1.45;
	}

	.eyebrow {
		color: var(--qc-ui-accent-text);
		font-size: 0.76rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.paper-facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 0.75rem;
	}

	.paper-facts span {
		border: 1px solid var(--qc-ui-accent-border);
		padding: 0.25rem 0.45rem;
		background: var(--qc-ui-surface);
		font-size: 0.82rem;
	}

	.paper-mode-card a {
		display: inline-flex;
		margin-top: 0.85rem;
		border-radius: 0.35rem;
		padding: 0.65rem 0.85rem;
		background: var(--qc-ui-accent);
		color: var(--qc-ui-on-accent);
		font-weight: 750;
		text-decoration: none;
	}

	.coverage-note {
		font-size: 0.88rem;
	}

	@media (max-width: 600px) {
		.paper-mode-card {
			width: calc(100% - 0.8rem);
			padding: 0.85rem;
		}
	}
</style>
