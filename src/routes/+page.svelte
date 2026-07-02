<script lang="ts">
	import { resolve } from '$app/paths';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { ChainQuestionTeaser, LearningChain } from '$lib/learningChains';
	import {
		ArrowRight,
		BookOpenCheck,
		CheckCircle2,
		ClipboardCheck,
		Network,
		Search,
		Sparkles
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const chainsHref = resolve('/chains');
	const pastPapersHref = resolve('/past-papers/gcse');
	const englishHref = resolve('/english');
	const signInHref = resolve('/auth/start');
	const featuredChain = $derived(data.featuredChains[0] ?? null);
	const featuredQuestion = $derived(featuredChain?.questions[0] ?? null);
	const featuredChainHref = $derived(
		featuredChain ? resolve('/chains/[chainId]', { chainId: featuredChain.id }) : chainsHref
	);
	const featuredConstellationHref = $derived(
		featuredChain ? resolve('/constellations/[chainId]', { chainId: featuredChain.id }) : chainsHref
	);
	const startQuestionHref = $derived(
		featuredChain && featuredQuestion ? questionHref(featuredChain, featuredQuestion) : chainsHref
	);
	const chainCountLabel = $derived(formatCount(data.stats.chainCount));
	const questionCountLabel = $derived(formatCount(data.stats.questionCount));
	const subjectCountLabel = $derived(formatCount(data.stats.subjectCount));

	const navLinks = [
		{ href: chainsHref, label: 'Questions' },
		{ href: englishHref, label: 'English' },
		{ href: pastPapersHref, label: 'Past papers' }
	];

	const coverage = [
		{
			label: 'AQA GCSE Science',
			detail: 'Biology, Chemistry and Physics chains from published question sets.'
		},
		{
			label: 'GCSE English',
			detail: 'Guided practice built around evidence, method, context and thesis control.'
		},
		{
			label: 'Past-paper routes',
			detail: 'Board, subject, paper, tier, topic and mark value stay visible.'
		}
	];

	const faqs = [
		{
			question: 'Is this a chatbot?',
			answer:
				'No. The public pages are built around curated questions, mark checklists, model answers, common weak answers and reusable answer chains.'
		},
		{
			question: 'Can students use it without an account?',
			answer:
				'Yes. Public question, answer-chain, constellation and practice routes are usable without signing in.'
		},
		{
			question: 'What makes an answer chain different from a topic?',
			answer:
				'A topic names the content. An answer chain shows the ordered links that turn a weak answer into a mark-scoring answer.'
		}
	];

	function formatCount(value: number) {
		return new Intl.NumberFormat('en-GB').format(value);
	}

	function questionHref(chain: LearningChain, question: ChainQuestionTeaser) {
		if (question.id) {
			return resolve('/questions/[questionId]', { questionId: question.id });
		}

		return resolve('/practice/[chainId]/[ref]', { chainId: chain.id, ref: question.ref });
	}
</script>

<svelte:head>
	<title>Question Constellation | GCSE Answer Chains</title>
	<meta
		name="description"
		content="A public GCSE question bank organized by answer chains: start with a real exam question, reveal the chain, then practise transfer questions."
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/" />
	<meta property="og:title" content="Question Constellation" />
	<meta
		property="og:description"
		content="GCSE exam questions mapped by the answer chains that earn marks."
	/>
	<meta
		property="og:image"
		content="https://constellation.eviworld.com/product/question-flow.webp"
	/>
	<meta property="og:url" content="https://constellation.eviworld.com/" />
</svelte:head>

<main class="qc-home-app">
	<header class="qc-home-topbar" aria-label="Site header">
		<a class="qc-home-brand" href={resolve('/')} aria-label="Question Constellation home">
			<img src="/brand/question-constellation-logo.svg" alt="" width="34" height="34" />
			<span>Question Constellation</span>
		</a>
		<nav class="qc-home-nav" aria-label="Primary navigation">
			{#each navLinks as link (link.href)}
				<a href={link.href}>{link.label}</a>
			{/each}
		</nav>
		<a class="qc-home-nav-action" href={signInHref}>Sign In For Free</a>
	</header>

	<section class="qc-home-hero" aria-labelledby="home-title">
		<div class="qc-home-hero-media" aria-hidden="true">
			<img
				src="/product/question-flow.webp"
				alt=""
				width="1280"
				height="720"
				loading="eager"
				decoding="async"
			/>
		</div>
		<div class="qc-home-hero-content">
			<p class="qc-home-eyebrow">Public GCSE question bank</p>
			<h1 id="home-title">Question Constellation</h1>
			<p class="qc-home-hero-copy">
				Find real exam questions, reveal the answer chain behind the marks, then practise nearby and
				harder questions that use the same hidden logic.
			</p>
			<div class="qc-home-actions" aria-label="Homepage actions">
				<a class="qc-home-button primary" href={startQuestionHref}>
					Start with a question
					<ArrowRight size={18} aria-hidden="true" />
				</a>
				<a class="qc-home-button secondary" href={chainsHref}>Browse all chains</a>
			</div>
			<dl class="qc-home-stats" aria-label="Question bank size">
				<div>
					<dt>{questionCountLabel}</dt>
					<dd>public questions</dd>
				</div>
				<div>
					<dt>{chainCountLabel}</dt>
					<dd>answer chains</dd>
				</div>
				<div>
					<dt>{subjectCountLabel}</dt>
					<dd>subject areas</dd>
				</div>
			</dl>
		</div>
	</section>

	<section class="qc-home-section qc-home-flow" aria-labelledby="flow-title">
		<div class="qc-home-section-head">
			<p class="qc-home-eyebrow">Question first</p>
			<h2 id="flow-title">The page flow follows how marks are won.</h2>
			<p>
				A student starts on a concrete question, sees the missing links in a weak answer, opens the
				constellation, and practises transfer.
			</p>
		</div>

		<div class="qc-home-flow-grid">
			<article>
				<Search size={21} aria-hidden="true" />
				<h3>Start from a paper-style question</h3>
				<p>Board, subject, topic, tier, command word and mark value stay visible.</p>
			</article>
			<article>
				<Network size={21} aria-hidden="true" />
				<h3>Reveal the answer chain</h3>
				<p>The reusable reasoning steps appear beside the model answer and checklist.</p>
			</article>
			<article>
				<ClipboardCheck size={21} aria-hidden="true" />
				<h3>Practise the constellation</h3>
				<p>Near, stretch and transfer questions make the same chain work in new contexts.</p>
			</article>
			<article>
				<BookOpenCheck size={21} aria-hidden="true" />
				<h3>Check and repair the answer</h3>
				<p>The mark checklist shows which links are present, missing, or need a rewrite.</p>
			</article>
		</div>
	</section>

	<section class="qc-home-section qc-home-product-band" aria-labelledby="product-title">
		<div class="qc-home-product-copy">
			<p class="qc-home-eyebrow">Built like an exam atlas</p>
			<h2 id="product-title">Questions that look different can use the same chain.</h2>
			<p>
				Question Constellation groups exam questions by the reasoning sequence that earns marks.
				That makes revision less about memorising isolated answers and more about spotting
				transferable structure.
			</p>
			<a class="qc-home-inline-link" href={featuredConstellationHref}>
				Open a constellation
				<ArrowRight size={17} aria-hidden="true" />
			</a>
		</div>
		<div class="qc-home-image-stack">
			<img
				src="/product/answer-chain-reveal.webp"
				alt="Answer chain reveal page showing an exam question and reusable reasoning steps."
				width="1040"
				height="585"
				loading="eager"
				decoding="async"
			/>
			<img
				src="/product/checklist-rewrite.webp"
				alt="Practice page showing a mark checklist and answer rewrite flow."
				width="1040"
				height="585"
				loading="eager"
				decoding="async"
			/>
		</div>
	</section>

	{#if featuredChain}
		<section class="qc-home-section qc-home-featured" aria-labelledby="featured-title">
			<div class="qc-home-section-head">
				<p class="qc-home-eyebrow">Example chain</p>
				<h2 id="featured-title"><MathText text={featuredChain.title} /></h2>
				<p><MathText text={featuredChain.summary} /></p>
			</div>

			<div class="qc-home-chain-panel">
				<div>
					<p class="qc-home-mini-label"><MathText text={featuredChain.topic} /></p>
					<ol class="qc-home-chain-steps" aria-label="Featured answer chain steps">
						{#each featuredChain.steps.slice(0, 5) as step, index (`${featuredChain.id}-${index}`)}
							<li><MathText text={step} /></li>
						{/each}
					</ol>
				</div>
				<div class="qc-home-chain-questions">
					{#each featuredChain.questions.slice(0, 3) as question (question.id ?? question.ref)}
						<a href={questionHref(featuredChain, question)}>
							<span><MathText text={`${question.label} · ${question.marks ?? '?'} marks`} /></span>
							<strong><MathText text={question.title} /></strong>
						</a>
					{/each}
				</div>
			</div>

			<div class="qc-home-actions compact" aria-label="Featured chain actions">
				<a class="qc-home-button primary" href={featuredChainHref}>View this chain</a>
				<a class="qc-home-button secondary" href={pastPapersHref}>Download past papers</a>
			</div>
		</section>
	{/if}

	<section class="qc-home-section qc-home-coverage" aria-labelledby="coverage-title">
		<div class="qc-home-section-head">
			<p class="qc-home-eyebrow">Exam-specific surfaces</p>
			<h2 id="coverage-title">Public pages keep the exam context visible.</h2>
		</div>
		<div class="qc-home-coverage-grid">
			{#each coverage as item (item.label)}
				<article>
					<CheckCircle2 size={20} aria-hidden="true" />
					<h3>{item.label}</h3>
					<p>{item.detail}</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="qc-home-section qc-home-principles" aria-labelledby="principles-title">
		<div>
			<p class="qc-home-eyebrow">Product stance</p>
			<h2 id="principles-title">Curated structure carries the value.</h2>
		</div>
		<div class="qc-home-principle-list">
			<p>
				<BookOpenCheck size={20} aria-hidden="true" />
				Model answers, mark checklists and common weak answers are public.
			</p>
			<p>
				<Sparkles size={20} aria-hidden="true" />
				Runtime AI is optional and belongs behind explicit checking actions.
			</p>
			<p>
				<Network size={20} aria-hidden="true" />
				Question, chain, constellation and practice pages stay public.
			</p>
		</div>
	</section>

	<section class="qc-home-section qc-home-faq" aria-labelledby="faq-title">
		<div class="qc-home-section-head">
			<p class="qc-home-eyebrow">FAQ</p>
			<h2 id="faq-title">Straight answers before you open a question.</h2>
		</div>
		<div class="qc-home-faq-grid">
			{#each faqs as item (item.question)}
				<article>
					<h3>{item.question}</h3>
					<p>{item.answer}</p>
				</article>
			{/each}
		</div>
	</section>

	<section class="qc-home-final" aria-labelledby="final-title">
		<h2 id="final-title">Open the question bank.</h2>
		<p>Start from a real question, reveal the chain, then practise transfer.</p>
		<div class="qc-home-actions compact" aria-label="Footer actions">
			<a class="qc-home-button primary" href={chainsHref}>Browse question chains</a>
			<a class="qc-home-button secondary" href={pastPapersHref}>Download past papers</a>
		</div>
	</section>
</main>
