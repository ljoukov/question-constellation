<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowRight,
		Atom,
		BookOpen,
		Brain,
		CheckCircle2,
		ChevronRight,
		Clock3,
		Crown,
		Eye,
		FlaskConical,
		Leaf,
		Lightbulb,
		Link2,
		List,
		Network,
		Quote,
		RefreshCcw,
		Route,
		Search,
		SquareLibrary,
		Zap
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
		link: Link2,
		cycle: RefreshCcw,
		network: Route,
		quote: Quote,
		line: Zap,
		nodes: Network
	} satisfies Record<string, Component>;
</script>

<svelte:head>
	<title>Thinking Memory | Question Constellation</title>
	<meta
		name="description"
		content="A server-generated Thinking Memory library organised by subject."
	/>
</svelte:head>

<main class="page-main">
	<section class="hero compact">
		<div class="hero-content">
			<h1>Your Thinking Memory</h1>
			<p>Patterns you've discovered, saved, and can reuse across GCSE questions.</p>
			<div class="hero-notes">
				<span class="note-pill"
					><CheckCircle2 size={21} color="#008762" />Stored automatically after practice</span
				>
				<span class="note-pill"
					><Brain size={21} color="#005cff" />Open anytime from the top menu</span
				>
			</div>
		</div>
	</section>

	<section class="memory-layout">
		<div class="panel filter-bar">
			<div class="filter-set">
				<span class="chip active"><List size={19} />All patterns</span>
				{#each data.subjects.slice(0, 5) as subject (subject.id)}
					{@const Icon = subjectIcons[subject.icon]}
					<span class={['chip', `tone-${subject.tone}`]}><Icon size={19} />{subject.name}</span>
				{/each}
			</div>
			<div class="segmented" aria-label="View mode">
				<span>View:</span>
				<span class="segment">All</span>
				<span class="segment active"><List size={18} />By subject</span>
			</div>
		</div>

		<div>
			<div class="panel">
				{#each data.groupedPatterns as group (group.subject.id)}
					{@const SubjectIcon = subjectIcons[group.subject.icon]}
					<section class={['subject-group', `tone-${group.subject.tone}`]}>
						<div class="subject-group-header">
							<span class="icon-orb"><SubjectIcon size={24} /></span>
							<span
								>{group.subject.name}
								<span class="badge">{group.patterns.length} patterns</span></span
							>
							<span>Mastery</span>
							<span>Used</span>
							<span></span>
						</div>
						{#each group.patterns as pattern (pattern.id)}
							{@const PatternIcon = patternIcons[pattern.icon]}
							<div class="memory-row">
								<span class="icon-orb"><PatternIcon size={23} /></span>
								<strong>{pattern.title}</strong>
								<div class="pattern-dots" aria-label={`Mastery ${pattern.mastery} of 5`}>
									{#each [1, 2, 3, 4, 5] as dot (dot)}
										<span class={dot <= pattern.mastery ? 'filled' : ''}></span>
									{/each}
								</div>
								<span>Used {pattern.usedCount} times</span>
								<a
									class="open-link"
									href={resolve('/practice/[familyId]', {
										familyId: pattern.discoveredFromFamilyId
									})}
								>
									Open <ChevronRight size={17} />
								</a>
							</div>
						{/each}
					</section>
				{/each}
				<div class="tip">
					<Lightbulb size={17} />
					Tip: Open any pattern to see how it works, examples, and linked questions across subjects.
				</div>
			</div>

			<div class="panel">
				<div class="title-row">
					<Route size={24} color="#005cff" />
					<h2>Cross-subject links</h2>
				</div>
				<p>Subjects help navigation. The full library helps transfer.</p>
				<div class="transfer-map">
					{#each data.crossSubjectLinks as link, index (link.from.id + link.to.id)}
						<div class="transfer-row">
							<div class={['pattern-card', index === 0 ? 'tone-green' : 'tone-blue']}>
								<Link2 size={22} />
								<strong>{link.from.title}</strong>
							</div>
							<div class={['pattern-card', index === 0 ? 'tone-blue' : 'tone-orange']}>
								<ArrowRight size={22} />
								<strong>{link.to.title}</strong>
								<small>{link.reason}</small>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div class="panel selected-panel" id="selected">
				<div class="selected-visual">
					<Link2 size={72} strokeWidth={1.8} />
				</div>
				<div>
					<span class="badge">Selected pattern</span>
					<h2>{data.selectedPattern.title}</h2>
					<p>{data.selectedPattern.summary}</p>
					<p>
						<strong>Discovered after:</strong>
						{data.sourceFamily.title} ({data.sourceFamily.topic})
					</p>
					<div class="topic-row">
						{#each data.selectedPattern.topics as topic (topic)}
							<span class="topic-pill">{topic}</span>
						{/each}
					</div>
					<a
						class="btn primary"
						href={resolve('/practice/[familyId]', {
							familyId: data.sourceFamily.id
						})}
					>
						Reopen practice
						<ArrowRight size={20} />
					</a>
					<a
						class="btn blue"
						href={resolve('/practice/[familyId]', {
							familyId: data.sourceFamily.id
						})}
					>
						<Eye size={20} />
						See transfer map
					</a>
				</div>
				<div class="split-rail">
					<h3>Example linked question families</h3>
					<div class="linked-list">
						<a
							class="mini-row tone-green"
							href={resolve('/practice/[familyId]', {
								familyId: data.sourceFamily.id
							})}
						>
							<Leaf size={18} />
							<span>
								<strong>{data.sourceFamily.title}</strong><br />
								<small>Original discovery question</small>
							</span>
							<ChevronRight size={17} />
						</a>
						{#each data.sourceFamily.transferQuestions as family (family.id)}
							{@const subject = data.subjects.find((item) => item.id === family.subjectId)}
							{@const TransferIcon = subject ? subjectIcons[subject.icon] : BookOpen}
							<div class={['mini-row', subject && `tone-${subject.tone}`]}>
								<TransferIcon size={18} />
								<span>
									<strong>{family.title}</strong><br />
									<small>{family.topic}</small>
								</span>
								<ChevronRight size={17} />
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>

		<aside class="sidebar-stack">
			<div class="panel">
				<div class="title-row">
					<Brain size={28} color="#005cff" />
					<h2>How to access your patterns</h2>
				</div>
				<div class="access-list">
					<div class="access-step tone-green">
						<span class="access-number">1</span>
						<span class="icon-orb"><CheckCircle2 size={28} /></span>
						<div>
							<h3>Saved automatically</h3>
							<p>After you finish a question family, the thinking move is saved to your memory.</p>
						</div>
					</div>
					<div class="access-step tone-blue">
						<span class="access-number">2</span>
						<span class="icon-orb"><Brain size={28} /></span>
						<div>
							<h3>Open "Thinking Memory"</h3>
							<p>Use the tab at the top of the page any time to view saved patterns.</p>
						</div>
					</div>
					<div class="access-step tone-violet">
						<span class="access-number">3</span>
						<span class="icon-orb"><SquareLibrary size={28} /></span>
						<div>
							<h3>Reopen and reuse</h3>
							<p>
								Open any pattern to see examples, linked families, and topics to practise again.
							</p>
						</div>
					</div>
				</div>
				<div class="tip">
					<strong>Your memory grows with you</strong>
					<p>The more you practise, the more useful patterns you'll have at your fingertips.</p>
				</div>
			</div>

			<div class="panel">
				<div class="panel-header">
					<div class="title-row">
						<Search size={26} color="#008762" />
						<h2>Why this structure works</h2>
					</div>
				</div>
				<div class="why-list">
					<div class="why-item">
						<Search size={30} color="#008762" />
						<div>
							<h3>Easy to find</h3>
							<p>Learners can open patterns through familiar subjects and contexts.</p>
						</div>
					</div>
					<div class="why-item">
						<Route size={30} color="#005cff" />
						<div>
							<h3>Still transferable</h3>
							<p>One library helps them reuse patterns across any GCSE question.</p>
						</div>
					</div>
					<div class="why-item">
						<Zap size={30} color="#7438ee" />
						<div>
							<h3>Less clutter</h3>
							<p>Subjects organise the library clearly without losing the bigger idea.</p>
						</div>
					</div>
				</div>
				<div class="tip">
					<CheckCircle2 size={22} color="#008762" />
					Best approach: one Thinking Memory, organised by subject.
				</div>
			</div>

			<div class="panel">
				<div class="panel-header">
					<div class="title-row">
						<Clock3 size={23} color="#07176d" />
						<h2>Recently used</h2>
					</div>
					<a class="open-link" href={resolve('/thinking-memory')}>View all</a>
				</div>
				<div class="linked-list">
					{#each data.recentlyUsed as pattern (pattern.id)}
						{@const subject = data.subjects.find((item) => item.id === pattern.subjectId)}
						{@const PatternIcon = patternIcons[pattern.icon]}
						<div class={['mini-row', subject && `tone-${subject.tone}`]}>
							<PatternIcon size={19} />
							<span>
								<strong>{pattern.title}</strong><br />
								<small>{subject?.name}</small>
							</span>
							<a
								class="open-link"
								href={resolve('/practice/[familyId]', {
									familyId: pattern.discoveredFromFamilyId
								})}>Continue</a
							>
						</div>
					{/each}
				</div>
			</div>
		</aside>
	</section>

	<footer class="footer-note">
		<CheckCircle2 size={18} />
		Built by teachers. Backed by evidence. Designed for GCSE success.
	</footer>
</main>
