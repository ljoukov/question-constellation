<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Atom,
		BookOpen,
		Bookmark,
		Brain,
		CheckCircle2,
		CircleHelp,
		Crown,
		FlaskConical,
		HeartPulse,
		Leaf,
		PlayCircle,
		Puzzle,
		Rocket,
		Sparkles,
		Target,
		TrendingUp
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const subjectIcons = {
		leaf: Leaf,
		flask: FlaskConical,
		atom: Atom,
		book: BookOpen,
		crown: Crown
	} satisfies Record<string, Component>;

	const patternIcons = {
		link: Target,
		cycle: TrendingUp,
		network: Puzzle,
		quote: BookOpen,
		line: Sparkles,
		nodes: Brain
	} satisfies Record<string, Component>;
</script>

<svelte:head>
	<title>Question Constellation</title>
	<meta
		name="description"
		content="Question Constellation helps GCSE learners discover and reuse thinking patterns."
	/>
</svelte:head>

<main class="page-main">
	<section class="hero">
		<div class="hero-content">
			<h1>Welcome to<br />Question Constellation</h1>
			<p>
				Start with a real GCSE question. Discover the thinking pattern behind it. Save it, then use
				it again and again across any topic.
			</p>
			<div class="hero-actions">
				<a class="btn primary" href={resolve('/#start')}>
					<Leaf size={23} />
					Start with Biology
					<ArrowRight size={21} />
				</a>
				<a class="btn blue" href={resolve('/#how-it-works')}>
					<PlayCircle size={23} />
					See how it works
				</a>
			</div>
		</div>
	</section>

	<section class="subject-row" aria-label="Subjects">
		{#each data.subjects as subject (subject.id)}
			{@const Icon = subjectIcons[subject.icon]}
			<a
				class={['subject-card', `tone-${subject.tone}`, subject.id === 'biology' && 'active']}
				href={resolve('/')}
			>
				<span class="icon-orb"><Icon size={32} strokeWidth={2.4} /></span>
				<h2>{subject.name}</h2>
				<p>{subject.description}</p>
				<ArrowRight size={20} />
			</a>
		{/each}
	</section>

	<section class="workspace-grid" id="start">
		<div class="panel question-card">
			<div class="heart-visual tone-green" aria-hidden="true">
				<HeartPulse size={80} strokeWidth={1.8} />
			</div>
			<div class="question-copy">
				<span class="badge">Biology - {data.suggestedQuestion.topic}</span>
				<h2>{data.suggestedQuestion.prompt}</h2>
				<p><strong>{data.suggestedQuestion.meta}</strong></p>
				<a class="btn primary" href={resolve('/thinking-memory')}>
					Try this question family
					<ArrowRight size={20} />
				</a>
			</div>
			<div class="split-rail">
				<ul class="check-list">
					{#each data.suggestedQuestion.checks as check (check)}
						<li><CheckCircle2 size={18} color="#008762" /> {check}</li>
					{/each}
				</ul>
			</div>
		</div>

		<div class="panel" id="how-it-works">
			<div class="panel-header">
				<div class="title-row">
					<CircleHelp size={22} color="#005cff" />
					<h2>How it works</h2>
				</div>
			</div>
			<div class="steps">
				<div class="step tone-green">
					<span class="step-number">1</span>
					<span class="icon-orb"><Leaf size={30} /></span>
					<strong>Choose a subject</strong>
					<small>Pick a subject to focus your learning.</small>
				</div>
				<ArrowRight size={28} color="#6b7cc4" />
				<div class="step tone-blue">
					<span class="step-number">2</span>
					<span class="icon-orb"><CircleHelp size={30} /></span>
					<strong>Try a question family</strong>
					<small>Answer with guidance and examples.</small>
				</div>
				<ArrowRight size={28} color="#6b7cc4" />
				<div class="step tone-violet">
					<span class="step-number">3</span>
					<span class="icon-orb"><Bookmark size={30} /></span>
					<strong>Save the thinking move</strong>
					<small>We reveal the pattern. Save it to use anywhere.</small>
				</div>
			</div>
			<div class="tip">Patterns appear after practice. They are yours to keep.</div>
		</div>

		<div class="panel">
			<div class="panel-header">
				<div class="title-row">
					<Brain size={24} color="#005cff" />
					<h2>What you'll build: Thinking Memory</h2>
				</div>
			</div>
			<div class="pattern-stack">
				{#each data.featuredPatterns as pattern (pattern.id)}
					{@const Icon = patternIcons[pattern.icon]}
					<div
						class={[
							'pattern-card',
							`tone-${data.subjects.find((s) => s.id === pattern.subjectId)?.tone}`
						]}
					>
						<Icon size={24} />
						<div>
							<div class="pattern-dots" aria-label={`Mastery ${pattern.mastery} of 5`}>
								{#each [1, 2, 3, 4, 5] as dot (dot)}
									<span class={dot <= pattern.mastery ? 'filled' : ''}></span>
								{/each}
							</div>
							<strong>{pattern.title}</strong>
						</div>
					</div>
				{/each}
			</div>
			<p>Use them across topics to answer more questions with less effort.</p>
		</div>
	</section>

	<section class="workspace-grid" aria-label="More learning context">
		<div class="panel transfer-panel">
			<div>
				<h2>From one question to many</h2>
				<p>One thinking move. Many Biology topics.</p>
			</div>
			<div class="transfer-row">
				<div class="transfer-root">Cause<br />process<br />effect</div>
				<div class="family-list">
					{#each data.featuredPatterns[0].questionFamilies.slice(0, 4) as family (family)}
						<div class="family-pill">
							<span>{family}</span>
							<ArrowRight size={18} />
						</div>
					{/each}
				</div>
			</div>
			<div class="panel">
				<Sparkles size={28} color="#7438ee" />
				<p>Practise one pattern across different topics and watch your confidence grow.</p>
			</div>
		</div>

		<div class="panel">
			<div class="title-row">
				<TrendingUp size={22} color="#005cff" />
				<h2>Your progress</h2>
			</div>
			<div class="progress-grid">
				<div class="progress-cell">
					<strong>{data.progress.questionsPractised}</strong>
					<span>Questions practised</span>
				</div>
				<div class="progress-cell">
					<strong>{data.progress.patternsSaved}</strong>
					<span>Patterns saved</span>
				</div>
				<div class="progress-cell">
					<strong>{data.progress.topicsExplored}</strong>
					<span>Topics explored</span>
				</div>
				<div class="progress-cell">
					<Rocket size={24} color="#7438ee" />
					<span>Day streak</span>
				</div>
			</div>
			<p>Every question you try builds your memory.</p>
		</div>

		<div class="panel">
			<div class="title-row">
				<Target size={24} color="#008762" />
				<h2>Why this works</h2>
			</div>
			<div class="why-list">
				<div class="why-item">
					<Target size={28} color="#008762" />
					<div>
						<h3>Concrete first</h3>
						<p>Start with real questions, not abstract theory.</p>
					</div>
				</div>
				<div class="why-item">
					<Puzzle size={28} color="#005cff" />
					<div>
						<h3>Discover the pattern</h3>
						<p>We reveal the hidden thinking move behind your answers.</p>
					</div>
				</div>
				<div class="why-item">
					<Rocket size={28} color="#7438ee" />
					<div>
						<h3>Transfer with confidence</h3>
						<p>Use the same patterns across different topics and exams.</p>
					</div>
				</div>
			</div>
		</div>
	</section>

	<footer class="footer-note">
		<CheckCircle2 size={18} />
		Built by teachers. Backed by evidence. Designed for GCSE success.
	</footer>
</main>
