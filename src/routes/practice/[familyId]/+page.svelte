<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Atom,
		BookOpen,
		Brain,
		CheckCircle2,
		ChevronRight,
		Crown,
		FlaskConical,
		Leaf,
		Lightbulb,
		Link2,
		LockKeyhole,
		Route,
		Sparkles,
		Target,
		Trophy
	} from '@lucide/svelte';
	import type { Component } from 'svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let activeStepIndex = $state(0);
	let revealPattern = $state(false);

	const subjectIcons = {
		leaf: Leaf,
		flask: FlaskConical,
		atom: Atom,
		book: BookOpen,
		crown: Crown
	} satisfies Record<string, Component>;

	const distanceLabels = {
		near: 'Nearby',
		stretch: 'Stretch',
		'exam-transfer': 'Exam transfer'
	};

	const SubjectIcon = $derived(subjectIcons[data.subject.icon]);
	const activeStep = $derived(
		data.family.practiceSteps[activeStepIndex] ?? data.family.practiceSteps[0]
	);
	const completedSteps = $derived(
		revealPattern ? data.family.practiceSteps.length : activeStepIndex
	);
	const canGoNext = $derived(activeStepIndex < data.family.practiceSteps.length - 1);

	function nextStep() {
		if (canGoNext) {
			activeStepIndex += 1;
			return;
		}
		revealPattern = true;
	}
</script>

<svelte:head>
	<title>{data.family.title} | Question Constellation</title>
	<meta
		name="description"
		content="Practice a concrete GCSE question family before revealing the reusable thinking pattern."
	/>
</svelte:head>

<main class="page-main">
	<section class="practice-hero">
		<div class={['icon-orb', `tone-${data.subject.tone}`]}>
			<SubjectIcon size={34} strokeWidth={2.3} />
		</div>
		<div>
			<span class="badge">{data.subject.name} - {data.family.topic}</span>
			<h1>{data.family.title}</h1>
			<p>{data.family.context}</p>
		</div>
	</section>

	<section class="practice-layout">
		<div class="panel practice-question">
			<div class="panel-header">
				<div class="title-row">
					<Target size={24} color="#008762" />
					<h2>Concrete question first</h2>
				</div>
				<span class="badge">{data.family.meta}</span>
			</div>
			<p class="question-prompt">{data.family.prompt}</p>
			<ul class="check-list">
				{#each data.family.checks as check (check)}
					<li><CheckCircle2 size={18} color="#008762" />{check}</li>
				{/each}
			</ul>
		</div>

		<div class="panel reasoning-panel">
			<div class="panel-header">
				<div class="title-row">
					<Lightbulb size={24} color="#005cff" />
					<h2>Guided reasoning repair</h2>
				</div>
				<span class="badge">{completedSteps}/{data.family.practiceSteps.length} repaired</span>
			</div>

			<div class="reasoning-steps" aria-label="Reasoning steps">
				{#each data.family.practiceSteps as step, index (step.id)}
					<button
						class={[
							'reasoning-tab',
							index === activeStepIndex && !revealPattern && 'active',
							(index < activeStepIndex || revealPattern) && 'complete'
						]}
						type="button"
						onclick={() => {
							activeStepIndex = index;
							revealPattern = false;
						}}
					>
						<span>{index + 1}</span>
						{step.label}
					</button>
				{/each}
			</div>

			<div class="reasoning-card">
				<span class="badge">Step {activeStepIndex + 1}</span>
				<h3>{activeStep.question}</h3>
				<p><strong>Hint:</strong> {activeStep.hint}</p>
				<div class="repair-box">
					<strong>Reasoning repair</strong>
					<p>{activeStep.repair}</p>
				</div>
				<div class="answer-fragment">
					<strong>Answer fragment</strong>
					<p>{activeStep.answerFragment}</p>
				</div>
				<button class="btn primary" type="button" onclick={nextStep} disabled={revealPattern}>
					{revealPattern
						? 'Pattern revealed'
						: canGoNext
							? 'Repair next step'
							: 'Reveal the thinking pattern'}
					{#if revealPattern}
						<CheckCircle2 size={20} />
					{:else}
						<ArrowRight size={20} />
					{/if}
				</button>
			</div>
		</div>

		<aside class={['panel', 'reveal-panel', revealPattern && 'unlocked']}>
			<div class="title-row">
				{#if revealPattern}
					<Trophy size={28} color="#7438ee" />
				{:else}
					<LockKeyhole size={28} color="#6b7cc4" />
				{/if}
				<h2>{revealPattern ? 'Pattern earned' : 'Pattern locked'}</h2>
			</div>

			{#if revealPattern}
				<div class="pattern-reveal">
					<Brain size={34} color="#005cff" />
					<div>
						<span class="badge">Saved to Thinking Memory</span>
						<h3>{data.revealedPattern.title}</h3>
						<p>{data.revealedPattern.summary}</p>
					</div>
				</div>
				<div class="pattern-chain">
					{#each data.revealedPattern.parts as part, index (part)}
						<span>{part}</span>
						{#if index < data.revealedPattern.parts.length - 1}
							<ChevronRight size={18} />
						{/if}
					{/each}
				</div>
				<a class="btn blue" href={resolve('/thinking-memory#selected')}>
					Open in Thinking Memory
					<ArrowRight size={20} />
				</a>
			{:else}
				<p>
					The pattern is hidden until the concrete reasoning chain has been repaired. This keeps the
					thinking move earned, not chosen from a menu.
				</p>
			{/if}
		</aside>
	</section>

	<section class="panel transfer-practice" id="transfer">
		<div class="panel-header">
			<div class="title-row">
				<Route size={26} color="#005cff" />
				<h2>Constellation transfer</h2>
			</div>
			<span class="badge">Nearby -> harder exam transfer</span>
		</div>
		<div class="transfer-cards">
			{#each data.family.transferQuestions as transfer (transfer.id)}
				<div class={['transfer-card', `distance-${transfer.distance}`]}>
					<span class="badge">{distanceLabels[transfer.distance]}</span>
					<h3>{transfer.title}</h3>
					<p>{transfer.description}</p>
					<small
						>{data.subjects.find((subject) => subject.id === transfer.subjectId)?.name} - {transfer.topic}</small
					>
				</div>
			{/each}
		</div>
	</section>

	<section class="workspace-grid">
		<div class="panel">
			<div class="title-row">
				<Sparkles size={24} color="#7438ee" />
				<h2>What just happened</h2>
			</div>
			<div class="why-list">
				<div class="why-item">
					<Target size={28} color="#008762" />
					<div>
						<h3>Concrete first</h3>
						<p>You started with a familiar GCSE question family.</p>
					</div>
				</div>
				<div class="why-item">
					<Lightbulb size={28} color="#005cff" />
					<div>
						<h3>Guided reasoning</h3>
						<p>The missing chain was repaired before any abstract label appeared.</p>
					</div>
				</div>
				<div class="why-item">
					<Brain size={28} color="#7438ee" />
					<div>
						<h3>Pattern naming</h3>
						<p>The reusable move becomes part of Thinking Memory only after practice.</p>
					</div>
				</div>
			</div>
		</div>

		<div class="panel">
			<div class="title-row">
				<Link2 size={24} color="#008762" />
				<h2>Keep practising</h2>
			</div>
			<div class="linked-list">
				{#each data.relatedFamilies as family (family.id)}
					<a
						class="mini-row"
						href={resolve('/practice/[familyId]', {
							familyId: family.id
						})}
					>
						<SubjectIcon size={18} />
						<span>{family.title}</span>
						<ChevronRight size={17} />
					</a>
				{/each}
				{#if data.relatedFamilies.length === 0}
					<p>More {data.subject.name} question families will appear here as the library grows.</p>
				{/if}
			</div>
		</div>
	</section>

	<footer class="footer-note">
		<BookOpen size={18} />
		Practice first. Reveal the pattern. Transfer with confidence.
	</footer>
</main>
