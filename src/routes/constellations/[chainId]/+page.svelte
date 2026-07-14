<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import ThinkingChain from '$lib/chains/ThinkingChain.svelte';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import IconBackLink from '$lib/components/IconBackLink.svelte';
	import { BROWSE_SUBJECTS, englishSubjectOrDefault, isEnglishSubject } from '$lib/englishSubjects';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import { ArrowRight, ChevronDown } from '@lucide/svelte';
	import { slide } from 'svelte/transition';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let methodOpen = $state(false);
	const revealDurationMs =
		browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180;

	const chainHref = $derived(
		resolve('/questions/[questionId]/chain', { questionId: data.startQuestion.id })
	);
	const canonicalUrl = $derived(
		`https://constellation.eviworld.com/constellations/${encodeURIComponent(data.chain.id)}`
	);
	const isEnglish = $derived(isEnglishSubject(data.startQuestion.meta.subject));
	const topbarSubject = $derived(
		isEnglish
			? englishSubjectOrDefault(data.startQuestion.meta.subject)
			: data.startQuestion.meta.subject
	);
	const chainSteps = $derived(data.chain.steps.map((step) => step.short));

	function friendlyDistance(value: string) {
		if (value === 'start') return 'First';
		if (value === 'near') return 'Similar';
		if (value === 'stretch') return 'New context';
		if (value === 'exam transfer') return 'Challenge';
		return value;
	}

	function usefulPrompt(title: string, prompt: string) {
		const normalize = (value: string) =>
			value
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, ' ');
		const normalizedTitle = normalize(title);
		const normalizedPrompt = normalize(prompt);
		if (
			!normalizedPrompt ||
			normalizedPrompt === normalizedTitle ||
			normalizedPrompt.startsWith(normalizedTitle)
		) {
			return null;
		}
		return prompt;
	}
</script>

<svelte:head>
	<title>{data.chain.title} questions | Question Constellation</title>
	<meta
		name="description"
		content={`${data.questions.length} GCSE questions using the same ${chainSteps.length}-step answer chain.`}
	/>
	<link rel="canonical" href={canonicalUrl} />
</svelte:head>

<main class="qc-real-app qc-constellation-page qc-constellation-simplified">
	<AppTopbar
		user={data.user}
		subject={topbarSubject}
		subjects={[...BROWSE_SUBJECTS]}
	/>

	<div class="qc-constellation-shell">
		<IconBackLink href={chainHref} label="Back to answer" />

		<header class="qc-constellation-header">
			<div>
				<p class="qc-real-kicker"><MathText text={data.startQuestion.meta.subject} /></p>
				<h1><MathText text={data.chain.title} /></h1>
				<p>{data.questions.length} questions using the same {chainSteps.length}-step method</p>
			</div>
		</header>

		<section class="qc-constellation-method" class:is-open={methodOpen}>
			<button
				type="button"
				aria-expanded={methodOpen}
				aria-controls="constellation-shared-method"
				onclick={() => (methodOpen = !methodOpen)}
			>
				<span>Shared answer chain</span>
				<span>
					{methodOpen ? 'Hide' : 'View'}
					<ChevronDown size={17} aria-hidden="true" />
				</span>
			</button>
			{#if methodOpen}
				<div
					id="constellation-shared-method"
					class="qc-constellation-method-content"
					transition:slide={{ duration: revealDurationMs }}
				>
					<ThinkingChain steps={chainSteps} label="Shared answer chain" showLabel={false} />
				</div>
			{/if}
		</section>

		<ol class="qc-chain-question-list qc-constellation-question-list">
			{#each data.questions as question, index (question.id)}
				{@const prompt = usefulPrompt(question.title, question.prompt)}
				<li>
					<a
						class="qc-chain-question"
						href={resolve('/questions/[questionId]/practice', { questionId: question.id })}
					>
						<span class="qc-chain-question-index">{index + 1}</span>
						<span class="qc-chain-question-body">
							<span class="qc-chain-question-meta">
								<MathText
									text={`${friendlyDistance(question.distanceLabel)} · ${question.meta.marks} marks`}
								/>
							</span>
							<span class="qc-chain-question-title"><MathText text={question.title} /></span>
							{#if prompt}
								<span class="qc-chain-question-teaser"><MathText text={prompt} /></span>
							{/if}
						</span>
						<ArrowRight class="qc-chain-question-arrow" size={18} aria-hidden="true" />
					</a>
				</li>
			{/each}
		</ol>
	</div>
</main>
