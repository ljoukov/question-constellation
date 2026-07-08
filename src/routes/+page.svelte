<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { ChainQuestionTeaser, LearningChain } from '$lib/learningChains';
	import { ArrowRight, BookOpenCheck, ClipboardCheck, Network, Search } from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const chainsHref = resolve('/chains');
	const pastPapersHref = resolve('/past-papers/gcse');
	const blogHref = resolve('/blog');
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
	const latestArticles = $derived(data.latestArticles ?? []);

	const pastPaperEntryPoints = [
		{
			label: 'AQA GCSE Science',
			meta: 'Combined and separate science',
			detail: 'Question papers and mark schemes for Biology, Chemistry and Physics.',
			href: resolve('/past-papers/gcse/aqa/combined-biology-higher')
		},
		{
			label: 'AQA GCSE English',
			meta: 'Language and Literature',
			detail: 'Paper downloads for English Language and Literature revision.',
			href: resolve('/past-papers/gcse/aqa/english-language')
		},
		{
			label: 'Edexcel GCSE Maths',
			meta: 'Higher and Foundation',
			detail: 'Find papers, mark schemes and tier-specific downloads.',
			href: resolve('/past-papers/gcse/edexcel/mathematics-higher')
		},
		{
			label: 'OCR GCSE History',
			meta: 'Subject paper archive',
			detail: 'Browse OCR History papers and mark schemes by year.',
			href: resolve('/past-papers/gcse/ocr/history')
		}
	];
	const subjectEntryPoints = [
		{
			label: 'Biology',
			meta: 'AQA GCSE Science',
			detail: 'Question routes grouped by answer chain.',
			href: `${chainsHref}?subject=Biology`,
			flashcardsHref: resolve('/recall/biology/flashcards'),
			mcqHref: resolve('/recall/biology/mcq')
		},
		{
			label: 'Chemistry',
			meta: 'AQA GCSE Science',
			detail: 'Questions filtered by answer chain and mark value.',
			href: `${chainsHref}?subject=Chemistry`,
			flashcardsHref: resolve('/recall/chemistry/flashcards'),
			mcqHref: resolve('/recall/chemistry/mcq')
		},
		{
			label: 'Physics',
			meta: 'AQA GCSE Science',
			detail: 'Transfer practice from public question groups.',
			href: `${chainsHref}?subject=Physics`,
			flashcardsHref: resolve('/recall/physics/flashcards'),
			mcqHref: resolve('/recall/physics/mcq')
		},
		{
			label: 'English Language',
			meta: 'GCSE English',
			detail: 'Browse by course, paper, question type and marks.',
			href: `${chainsHref}?subject=English%20Language`,
			flashcardsHref: null,
			mcqHref: null
		},
		{
			label: 'English Literature',
			meta: 'GCSE English',
			detail: 'Find essay and extract questions inside the same bank.',
			href: `${chainsHref}?subject=English%20Literature`,
			flashcardsHref: null,
			mcqHref: null
		},
		{
			label: 'History',
			meta: 'GCSE History',
			detail: 'Browse through the shared question-bank filters.',
			href: `${chainsHref}?subject=History`,
			flashcardsHref: null,
			mcqHref: null
		}
	];

	const faqs = [
		{
			question: 'Is this a chatbot?',
			answer:
				'No. The public pages are built around curated questions, answer chains, mark checklists, model answers, common weak answers and guided repair.'
		},
		{
			question: 'Can students use it without an account?',
			answer:
				'Yes. Public question, answer-chain, constellation and practice routes are usable without signing in.'
		},
		{
			question: 'What is an answer chain?',
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

		return resolve('/chains/[chainId]', { chainId: chain.id });
	}
</script>

<svelte:head>
	<title>Free GCSE Question Bank And Past Papers | Question Constellation</title>
	<meta
		name="description"
		content="Free GCSE question bank and past-paper routes: start with exam questions, see the answer chains behind the marks, then practise similar questions."
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/" />
	<meta property="og:title" content="Free GCSE Question Bank And Past Papers" />
	<meta
		property="og:description"
		content="GCSE exam questions with answer chains, mark checklists, similar practice questions and free past-paper routes."
	/>
	<meta
		property="og:image"
		content="https://constellation.eviworld.com/product/question-flow.webp"
	/>
	<meta property="og:url" content="https://constellation.eviworld.com/" />
</svelte:head>

<main class="qc-home-app">
	<AppTopbar showSearch={false} showNavigation />

	<section class="qc-home-hero" aria-labelledby="home-title">
		<div class="qc-home-hero-media" aria-hidden="true">
			<img
				class="qc-theme-image qc-theme-image-light"
				src="/product/question-flow.webp"
				alt=""
				width="1280"
				height="720"
				loading="eager"
				decoding="async"
			/>
			<img
				class="qc-theme-image qc-theme-image-dark"
				src="/product/question-flow-dark.webp"
				alt=""
				width="1280"
				height="720"
				loading="eager"
				decoding="async"
			/>
		</div>
		<div class="qc-home-hero-content">
			<div class="qc-home-hero-copy-block">
				<p class="qc-home-eyebrow">Free GCSE question bank</p>
				<h1 id="home-title">See how the marks are won.</h1>
				<p class="qc-home-hero-copy">
					Practise GCSE Science, English and History with exam questions organised by answer chains:
					the steps that turn a weak answer into a mark-scoring answer.
				</p>
				<div class="qc-home-actions" aria-label="Homepage actions">
					<a class="qc-home-button primary" href={chainsHref}>
						Open question bank
						<ArrowRight size={18} aria-hidden="true" />
					</a>
					<a class="qc-home-button secondary" href={pastPapersHref}>Free past papers</a>
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

			{#if featuredChain && featuredQuestion}
				<aside class="qc-home-hero-preview" aria-label="Example question and answer chain">
					<a class="qc-home-preview-question" href={startQuestionHref}>
						<span>
							<MathText text={`Physics example · ${featuredQuestion.marks ?? '?'} marks`} />
						</span>
						<strong><MathText text={featuredQuestion.title} /></strong>
					</a>

					<div class="qc-home-preview-chain">
						<p class="qc-home-mini-label">Answer chain</p>
						<ol aria-label={`${featuredChain.title} answer chain`}>
							{#each featuredChain.steps.slice(0, 4) as step, index (`hero-${featuredChain.id}-${index}`)}
								<li><MathText text={step} /></li>
							{/each}
						</ol>
					</div>

					<div class="qc-home-preview-links">
						<a href={featuredChainHref}>
							See the answer chain
							<ArrowRight size={16} aria-hidden="true" />
						</a>
						<a href={featuredConstellationHref}>Practice similar questions</a>
					</div>
				</aside>
			{/if}
		</div>
	</section>

	<section class="qc-home-section qc-home-subjects" aria-labelledby="subject-title">
		<div class="qc-home-section-head">
			<p class="qc-home-eyebrow">Choose a subject</p>
			<h2 id="subject-title">Start where your exam entry lives.</h2>
			<p>
				Start with the subject, board, topic, paper or mark value you already know. Then switch into
				answer-chain practice when a question keeps costing marks.
			</p>
		</div>
		<div class="qc-home-subject-grid">
			{#each subjectEntryPoints as subject (subject.label)}
				<article>
					<a class="qc-home-subject-main" href={subject.href}>
						<span>{subject.meta}</span>
						<strong>{subject.label}</strong>
						<small>{subject.detail}</small>
						<ArrowRight size={16} aria-hidden="true" />
					</a>
					<div class="qc-home-subject-actions" aria-label={`${subject.label} practice choices`}>
						{#if subject.flashcardsHref}
							<a href={subject.flashcardsHref}>Flashcards</a>
						{/if}
						{#if subject.mcqHref}
							<a href={subject.mcqHref}>MCQ</a>
						{/if}
						<a href={subject.href}>Questions</a>
					</div>
				</article>
			{/each}
		</div>
	</section>

	<section class="qc-home-section qc-home-flow" aria-labelledby="flow-title">
		<div class="qc-home-section-head">
			<p class="qc-home-eyebrow">Question first</p>
			<h2 id="flow-title">One question leads to the whole constellation.</h2>
			<p>
				Open a concrete question, reveal the answer chain behind it, then practise nearby and
				transfer questions that reward the same links.
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
				<p>The mark-scoring links appear beside the model answer and checklist.</p>
			</article>
			<article>
				<ClipboardCheck size={21} aria-hidden="true" />
				<h3>Practise similar questions</h3>
				<p>Near, stretch and transfer questions make the same answer chain work in new contexts.</p>
			</article>
			<article>
				<BookOpenCheck size={21} aria-hidden="true" />
				<h3>Check and repair the answer</h3>
				<p>The checklist shows which links are present, missing, or need a rewrite.</p>
			</article>
		</div>
	</section>

	<section class="qc-home-section qc-home-product-band" aria-labelledby="product-title">
		<div class="qc-home-product-copy">
			<p class="qc-home-eyebrow">Built like an exam atlas</p>
			<h2 id="product-title">Questions that look different can use the same answer chain.</h2>
			<p>
				Question Constellation groups exam questions by the reasoning links that earn marks. That
				makes revision less about memorising isolated answers and more about spotting transferable
				structure.
			</p>
			<a class="qc-home-inline-link" href={featuredConstellationHref}>
				Open a constellation
				<ArrowRight size={17} aria-hidden="true" />
			</a>
		</div>
		<div class="qc-home-image-stack">
			<img
				class="qc-theme-image qc-theme-image-light qc-home-image-primary"
				src="/product/answer-chain-reveal.webp"
				alt="Answer-chain page showing an exam question and reusable mark-scoring steps."
				width="1040"
				height="585"
				loading="eager"
				decoding="async"
			/>
			<img
				class="qc-theme-image qc-theme-image-dark qc-home-image-primary"
				src="/product/answer-chain-reveal-dark.webp"
				alt="Answer-chain page showing an exam question and reusable mark-scoring steps."
				width="1040"
				height="585"
				loading="eager"
				decoding="async"
			/>
			<img
				class="qc-theme-image qc-theme-image-light qc-home-image-secondary"
				src="/product/checklist-rewrite.webp"
				alt="Practice page showing a mark checklist and answer rewrite flow."
				width="1440"
				height="960"
				loading="eager"
				decoding="async"
			/>
			<img
				class="qc-theme-image qc-theme-image-dark qc-home-image-secondary"
				src="/product/checklist-rewrite-dark.webp"
				alt="Practice page showing a mark checklist and answer rewrite flow."
				width="1440"
				height="960"
				loading="eager"
				decoding="async"
			/>
		</div>
	</section>

	{#if featuredChain}
		<section class="qc-home-section qc-home-featured" aria-labelledby="featured-title">
			<div class="qc-home-section-head">
				<p class="qc-home-eyebrow">Worked example</p>
				<h2 id="featured-title"><MathText text={featuredChain.title} /></h2>
				<p><MathText text={featuredChain.summary} /></p>
			</div>

			<div class="qc-home-chain-panel">
				<div>
					<p class="qc-home-mini-label"><MathText text={featuredChain.topic} /></p>
					<ol class="qc-home-chain-steps" aria-label="Featured answer-chain steps">
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
				<a class="qc-home-button primary" href={featuredChainHref}>View this answer chain</a>
				<a class="qc-home-button secondary" href={featuredConstellationHref}>
					Open its constellation
				</a>
			</div>
		</section>
	{/if}

	<section class="qc-home-section qc-home-papers" aria-labelledby="papers-title">
		<div class="qc-home-papers-layout">
			<div class="qc-home-section-head qc-home-papers-copy">
				<p class="qc-home-eyebrow">Free past papers</p>
				<h2 id="papers-title">Find GCSE past papers and mark schemes by board.</h2>
				<p>
					Use the paper archive when you need a full question paper. Use the question bank when you
					want the answer chain, mark checklist and similar practice questions.
				</p>
				<a class="qc-home-inline-link" href={pastPapersHref}>
					Open all GCSE past papers
					<ArrowRight size={17} aria-hidden="true" />
				</a>
			</div>

			<div class="qc-home-resource-grid">
				{#each pastPaperEntryPoints as item (item.label)}
					<a class="qc-home-resource-card" href={item.href}>
						<span>{item.meta}</span>
						<strong>{item.label}</strong>
						<small>{item.detail}</small>
						<ArrowRight size={16} aria-hidden="true" />
					</a>
				{/each}
			</div>
		</div>
	</section>

	<section class="qc-home-section qc-home-blog" aria-labelledby="blog-title">
		<div class="qc-home-section-head">
			<p class="qc-home-eyebrow">From the blog</p>
			<h2 id="blog-title">GCSE revision advice tied back to exam questions.</h2>
			<p>
				Articles compare common revision tools and explain how model answers, mark schemes,
				retrieval practice and answer chains can work together.
			</p>
		</div>
		<div class="qc-home-blog-grid">
			{#each latestArticles as article (article.slug)}
				<a class="qc-home-blog-card" href={resolve('/blog/[slug]', { slug: article.slug })}>
					<span>{article.category} · {article.readMinutes} min read</span>
					<strong>{article.shortTitle || article.title}</strong>
					<p>{article.description}</p>
					<small>
						Read article
						<ArrowRight size={15} aria-hidden="true" />
					</small>
				</a>
			{/each}
		</div>
		<a class="qc-home-inline-link qc-home-blog-link" href={blogHref}>
			Open all GCSE revision articles
			<ArrowRight size={17} aria-hidden="true" />
		</a>
	</section>

	<section class="qc-home-section qc-home-faq" aria-labelledby="faq-title">
		<div class="qc-home-section-head">
			<p class="qc-home-eyebrow">FAQ</p>
			<h2 id="faq-title">Straight answers before you open the question bank.</h2>
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
		<h2 id="final-title">Start with a GCSE question.</h2>
		<p>Open the bank, see the answer chain, then practise similar questions.</p>
		<div class="qc-home-actions compact" aria-label="Footer actions">
			<a class="qc-home-button primary" href={chainsHref}>Open question bank</a>
			<a class="qc-home-button secondary" href={pastPapersHref}>Free past papers</a>
		</div>
	</section>
</main>
