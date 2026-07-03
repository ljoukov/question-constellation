<script lang="ts">
	import { resolve } from '$app/paths';
	import AppTopbar from '$lib/components/AppTopbar.svelte';
	import MathText from '$lib/experiments/questions/components/MathText.svelte';
	import type { ChainQuestionTeaser, LearningChain } from '$lib/learningChains';
	import {
		Activity,
		ArrowRight,
		BookOpenCheck,
		Brain,
		CheckCircle2,
		CircleAlert,
		ClipboardCheck,
		GraduationCap,
		Network,
		Search,
		Sparkles,
		Target
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const chainsHref = resolve('/chains');
	const pastPapersHref = resolve('/past-papers/gcse');
	const englishHref = resolve('/english');
	const blogHref = resolve('/blog');
	const signInHref = resolve('/auth/start');
	const profileHref = resolve('/profile');
	const featuredChain = $derived(data.featuredChains[0] ?? null);
	const dashboard = $derived(data.dashboard);
	const subjectLanes = $derived(dashboard?.subjectLanes ?? []);
	const primaryLane = $derived(subjectLanes[0] ?? null);
	const learnerName = $derived(
		dashboard?.profile.name?.split(/\s+/)[0] ?? dashboard?.profile.email.split('@')[0] ?? 'there'
	);
	const averageMarkLabel = $derived(
		dashboard?.stats.averageMarkPercent === null ||
			dashboard?.stats.averageMarkPercent === undefined
			? 'No checks yet'
			: `${dashboard.stats.averageMarkPercent}%`
	);
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
		{ href: chainsHref, label: 'Question bank' },
		{ href: englishHref, label: 'English' },
		{ href: pastPapersHref, label: 'Past papers' },
		{ href: blogHref, label: 'Blog' }
	];

	const coverage = [
		{
			label: 'AQA GCSE Science',
			detail: 'Biology, Chemistry and Physics questions with mark checklists and repair steps.'
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
				'No. The public pages are built around curated questions, mark checklists, model answers, common weak answers and guided repair.'
		},
		{
			question: 'Can students use it without an account?',
			answer:
				'Yes. Public question, method, practice-set and practice routes are usable without signing in.'
		},
		{
			question: 'What is a method?',
			answer:
				'A topic names the content. A method shows the ordered steps that turn a weak answer into a mark-scoring answer.'
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

	function markLabel(value: number | null) {
		return value === null ? 'No checks' : `${value}%`;
	}
</script>

<svelte:head>
	<title>Question Constellation | GCSE Question Practice</title>
	<meta
		name="description"
		content="A public GCSE question bank: start with a real exam question, see the method, then practise similar questions and fix missed steps."
	/>
	<link rel="canonical" href="https://constellation.eviworld.com/" />
	<meta property="og:title" content="Question Constellation" />
	<meta
		property="og:description"
		content="GCSE exam questions with mark methods, similar practice questions and guided repair."
	/>
	<meta
		property="og:image"
		content="https://constellation.eviworld.com/product/question-flow.webp"
	/>
	<meta property="og:url" content="https://constellation.eviworld.com/" />
</svelte:head>

{#if dashboard}
	<main class="qc-real-app qc-dashboard-page">
		<AppTopbar
			subject={dashboard.profile.selectedSubject}
			subjects={['All subjects', ...dashboard.subjectOptions]}
			searchPlaceholder="Search questions"
		/>

		<div class="qc-dashboard-layout">
			<section class="qc-dashboard-hero" aria-labelledby="dashboard-title">
				<div>
					<p class="qc-real-kicker">Today</p>
					<h1 id="dashboard-title">Choose what to practise, {learnerName}.</h1>
					<p>
						Each subject starts from the best next step: fix a known mistake, review due
						flashcards, or continue with a real exam question.
					</p>
				</div>
				<a class="qc-dashboard-profile-link" href={profileHref}>
					<span>Profile</span>
					<strong>{subjectLanes.length || dashboard.learnerSubjects.length} selected subjects</strong>
					<ArrowRight size={16} aria-hidden="true" strokeWidth={2.2} />
				</a>
			</section>

			<section class="qc-dashboard-stat-strip" aria-label="Learning stats">
				<div>
					<CheckCircle2 size={18} aria-hidden="true" />
					<strong>{dashboard.stats.attemptCount}</strong>
					<span>checked answers</span>
				</div>
				<div>
					<CircleAlert size={18} aria-hidden="true" />
					<strong>{dashboard.stats.activeGapCount}</strong>
					<span>mistakes to fix</span>
				</div>
				<div>
					<Brain size={18} aria-hidden="true" />
					<strong>{dashboard.stats.recallDueCount}</strong>
					<span>flashcards due</span>
				</div>
				<div>
					<Activity size={18} aria-hidden="true" />
					<strong>{averageMarkLabel}</strong>
					<span>average checked mark</span>
				</div>
			</section>

			<section class="qc-dashboard-subject-section" aria-labelledby="dashboard-subjects">
				<div class="qc-dashboard-section-head">
					<div>
						<p class="qc-real-kicker">Subjects</p>
						<h2 id="dashboard-subjects">One next step per subject.</h2>
					</div>
					<a href={profileHref}>Edit profile</a>
				</div>

				{#if subjectLanes.length > 0}
					<div class="qc-dashboard-subjects">
						{#each subjectLanes as lane (lane.subject)}
							<article class="qc-subject-card" data-action={lane.primaryAction.kind}>
								<header>
									<div>
										<p class="qc-real-kicker">{lane.courseLabel}</p>
										<h3>{lane.subject}</h3>
									</div>
									<span class="qc-subject-confidence">{lane.confidenceLabel}</span>
								</header>

								<div class="qc-subject-meter" aria-label={`${lane.confidencePercent}% evidence`}>
									<span style={`width: ${lane.confidencePercent}%`}></span>
								</div>
								<p><MathText text={lane.confidenceDetail} /></p>

								<div class="qc-subject-stats" aria-label={`${lane.subject} learning evidence`}>
									<div>
										<strong>{lane.recallDueCount}</strong>
										<span>recall due</span>
									</div>
									<div>
										<strong>{lane.activeGapCount}</strong>
										<span>mistakes</span>
									</div>
									<div>
										<strong>{lane.attemptCount}</strong>
										<span>answers checked</span>
									</div>
									<div>
										<strong>{markLabel(lane.averageMarkPercent)}</strong>
										<span>mark signal</span>
									</div>
								</div>

								{#if lane.openGap}
									<a class="qc-dashboard-question-link" href={lane.openGap.href}>
										<strong><MathText text={lane.openGap.stepText} /></strong>
										<span><MathText text={`${lane.openGap.questionTitle} · ${lane.openGap.topic}`} /></span>
									</a>
								{:else if lane.nextQuestion}
									<a class="qc-dashboard-question-link" href={lane.nextQuestion.href}>
										<strong><MathText text={lane.nextQuestion.title} /></strong>
										<span><MathText text={lane.nextQuestion.meta} /></span>
									</a>
								{:else}
									<p>No unused question found for the current bank.</p>
								{/if}

								<div class="qc-subject-actions">
									<a class="qc-dashboard-action" href={lane.primaryAction.href}>
										{lane.primaryAction.label}
										<ArrowRight size={16} aria-hidden="true" />
									</a>
									{#if lane.supportsRecall}
										<a href={lane.recallHref}>Flashcards</a>
									{/if}
									<a href={lane.href}>Browse</a>
								</div>
							</article>
						{/each}
					</div>
				{:else}
					<section class="qc-dashboard-panel primary" aria-label="No selected subjects">
						<div class="qc-dashboard-panel-head">
							<div>
								<p class="qc-real-kicker">Profile</p>
								<h2>Select at least one subject</h2>
							</div>
							<GraduationCap size={21} aria-hidden="true" />
						</div>
						<p>Choose the GCSE subjects you want to practise in your profile.</p>
						<a class="qc-dashboard-action" href={profileHref}>
							Open profile
							<ArrowRight size={16} aria-hidden="true" />
						</a>
					</section>
				{/if}
			</section>

			<div class="qc-dashboard-grid">
				<section class="qc-dashboard-panel primary" aria-labelledby="dashboard-next-question">
					<div class="qc-dashboard-panel-head">
						<div>
							<p class="qc-real-kicker">Exam practice</p>
							<h2 id="dashboard-next-question">Next exam question</h2>
						</div>
						<GraduationCap size={21} aria-hidden="true" />
					</div>
					{#if primaryLane?.nextQuestion}
						<a class="qc-dashboard-question-link" href={primaryLane.nextQuestion.href}>
							<strong><MathText text={primaryLane.nextQuestion.title} /></strong>
							<span><MathText text={primaryLane.nextQuestion.meta} /></span>
							<small>Method: <MathText text={primaryLane.nextQuestion.chainTitle} /></small>
						</a>
					{:else if dashboard.nextQuestion}
						<a class="qc-dashboard-question-link" href={dashboard.nextQuestion.href}>
							<strong><MathText text={dashboard.nextQuestion.title} /></strong>
							<span><MathText text={dashboard.nextQuestion.meta} /></span>
							<small>Method: <MathText text={dashboard.nextQuestion.chainTitle} /></small>
						</a>
					{:else}
						<p>No unattempted question was found for your selected subjects.</p>
					{/if}
				</section>

				<section class="qc-dashboard-panel" aria-labelledby="dashboard-recent">
					<div class="qc-dashboard-panel-head">
						<div>
							<p class="qc-real-kicker">Recent checks</p>
							<h2 id="dashboard-recent">Latest answers</h2>
						</div>
						<ClipboardCheck size={21} aria-hidden="true" />
					</div>
					{#if dashboard.recentAttempts.length > 0}
						<div class="qc-dashboard-list">
							{#each dashboard.recentAttempts.slice(0, 3) as attempt (attempt.id)}
								<a href={attempt.questionHref}>
									<strong><MathText text={attempt.questionTitle} /></strong>
									<span>
										{attempt.awardedMarks}/{attempt.maxMarks}
										marks · {attempt.meta}
									</span>
								</a>
							{/each}
						</div>
					{:else}
						<p>Your checked answers will appear here after practice.</p>
					{/if}
				</section>

				<section class="qc-dashboard-panel" aria-labelledby="dashboard-gaps">
					<div class="qc-dashboard-panel-head">
						<div>
							<p class="qc-real-kicker">Practice repair</p>
							<h2 id="dashboard-gaps">Mistakes to fix</h2>
						</div>
						<Target size={21} aria-hidden="true" />
					</div>
					{#if dashboard.activeGaps.length > 0}
						<div class="qc-dashboard-list">
							{#each dashboard.activeGaps.slice(0, 3) as gap (gap.id)}
								<a href={gap.href}>
									<strong><MathText text={gap.stepText} /></strong>
									<span><MathText text={`${gap.questionTitle} · ${gap.topic}`} /></span>
								</a>
							{/each}
						</div>
					{:else}
						<p>Check a longer answer and missed method steps will appear here.</p>
					{/if}
				</section>
			</div>
		</div>
	</main>
{:else}
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
					<p class="qc-home-eyebrow">Public GCSE question bank</p>
					<h1 id="home-title">Question Constellation</h1>
					<p class="qc-home-hero-copy">
						Find real exam questions, see the method behind the marks, then practise similar
						questions and fix the steps you missed.
					</p>
					<div class="qc-home-actions" aria-label="Homepage actions">
						<a class="qc-home-button primary" href={startQuestionHref}>
							Start with a question
							<ArrowRight size={18} aria-hidden="true" />
						</a>
						<a class="qc-home-button secondary" href={chainsHref}>Open question bank</a>
					</div>
					<dl class="qc-home-stats" aria-label="Question bank size">
						<div>
							<dt>{questionCountLabel}</dt>
							<dd>public questions</dd>
						</div>
						<div>
							<dt>{chainCountLabel}</dt>
							<dd>practice sets</dd>
						</div>
						<div>
							<dt>{subjectCountLabel}</dt>
							<dd>subject areas</dd>
						</div>
					</dl>
				</div>

				{#if featuredChain && featuredQuestion}
					<aside class="qc-home-hero-preview" aria-label="Example question and method">
						<div class="qc-home-preview-question">
							<span>
								<MathText
									text={`${featuredQuestion.label} · ${featuredQuestion.marks ?? '?'} marks`}
								/>
							</span>
							<strong><MathText text={featuredQuestion.title} /></strong>
						</div>

						<div class="qc-home-preview-chain">
							<p class="qc-home-mini-label">Method</p>
							<ol aria-label={`${featuredChain.title} method`}>
								{#each featuredChain.steps.slice(0, 4) as step, index (`hero-${featuredChain.id}-${index}`)}
									<li><MathText text={step} /></li>
								{/each}
							</ol>
						</div>

						<div class="qc-home-preview-links">
							<a href={featuredChainHref}>
								See the method
								<ArrowRight size={16} aria-hidden="true" />
							</a>
							<a href={featuredConstellationHref}>Practice similar questions</a>
						</div>
					</aside>
				{/if}
			</div>
		</section>

		<section class="qc-home-section qc-home-flow" aria-labelledby="flow-title">
			<div class="qc-home-section-head">
				<p class="qc-home-eyebrow">Question first</p>
				<h2 id="flow-title">The flow follows how marks are won.</h2>
				<p>
					Start on a concrete question, learn the method, practise similar questions, and repair
					the steps that were missing.
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
					<h3>See the method</h3>
					<p>The mark-scoring steps appear beside the model answer and checklist.</p>
				</article>
				<article>
					<ClipboardCheck size={21} aria-hidden="true" />
					<h3>Practise similar questions</h3>
					<p>Near, stretch and transfer questions make the same method work in new contexts.</p>
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
				<h2 id="product-title">Questions that look different can use the same method.</h2>
				<p>
					Question Constellation groups exam questions by the steps that earn marks.
					That makes revision less about memorising isolated answers and more about spotting
					transferable structure.
				</p>
				<a class="qc-home-inline-link" href={featuredConstellationHref}>
					Open a practice set
					<ArrowRight size={17} aria-hidden="true" />
				</a>
			</div>
			<div class="qc-home-image-stack">
				<img
					class="qc-theme-image qc-theme-image-light qc-home-image-primary"
					src="/product/answer-chain-reveal.webp"
					alt="Method page showing an exam question and reusable mark-scoring steps."
					width="1040"
					height="585"
					loading="eager"
					decoding="async"
				/>
				<img
					class="qc-theme-image qc-theme-image-dark qc-home-image-primary"
					src="/product/answer-chain-reveal-dark.webp"
					alt="Method page showing an exam question and reusable mark-scoring steps."
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
					<p class="qc-home-eyebrow">Example method</p>
					<h2 id="featured-title"><MathText text={featuredChain.title} /></h2>
					<p><MathText text={featuredChain.summary} /></p>
				</div>

				<div class="qc-home-chain-panel">
					<div>
						<p class="qc-home-mini-label"><MathText text={featuredChain.topic} /></p>
						<ol class="qc-home-chain-steps" aria-label="Featured method steps">
							{#each featuredChain.steps.slice(0, 5) as step, index (`${featuredChain.id}-${index}`)}
								<li><MathText text={step} /></li>
							{/each}
						</ol>
					</div>
					<div class="qc-home-chain-questions">
						{#each featuredChain.questions.slice(0, 3) as question (question.id ?? question.ref)}
							<a href={questionHref(featuredChain, question)}>
								<span><MathText text={`${question.label} · ${question.marks ?? '?'} marks`} /></span
								>
								<strong><MathText text={question.title} /></strong>
							</a>
						{/each}
					</div>
				</div>

				<div class="qc-home-actions compact" aria-label="Featured chain actions">
					<a class="qc-home-button primary" href={featuredChainHref}>View this method</a>
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
					Question, method, practice-set and practice pages stay public.
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
			<p>Start from a real question, see the method, then practise similar questions.</p>
			<div class="qc-home-actions compact" aria-label="Footer actions">
				<a class="qc-home-button primary" href={chainsHref}>Open question bank</a>
				<a class="qc-home-button secondary" href={pastPapersHref}>Download past papers</a>
			</div>
		</section>
	</main>
{/if}
