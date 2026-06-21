<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		ArrowLeft,
		Atom,
		Bookmark,
		CheckCircle2,
		Circle,
		CircleAlert,
		Droplet,
		Info,
		Lightbulb,
		ListChecks,
		Lock,
		Save,
		Target,
		Zap
	} from '@lucide/svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let loadedQuestionId = $state('');
	let answerText = $state('');
	let rewriteText = $state('');
	let checked = $state(false);

	const questionIndex = $derived(
		data.questions.findIndex((question) => question.id === data.question.id)
	);
	const questionNumber = $derived(questionIndex + 1);
	const progressPercent = $derived(`${((questionNumber || 1) / data.questions.length) * 100}%`);
	const includedItems = $derived(
		data.question.checklist.filter(
			(item) => !data.question.weakAnswerMissingStepIds.includes(item.stepId)
		)
	);
	const missingItems = $derived(
		data.question.checklist.filter((item) =>
			data.question.weakAnswerMissingStepIds.includes(item.stepId)
		)
	);
	const resultTitle = $derived(
		`${includedItems.length} of ${data.question.checklist.length} links found`
	);
	const previousHref = $derived(
		resolve('/questions/[questionId]/chain', { questionId: data.question.id })
	);
	const chainReminder = $derived(data.question.repairChain.map((node) => node.label).join(' → '));

	function checkAnswer() {
		checked = true;
		rewriteText = '';
	}

	function shortChecklistText(text: string) {
		return text
			.replace(/^Say that /, '')
			.replace(/^Say /, '')
			.replace(/^Mention /, '')
			.replace(/^Explain that /, '')
			.replace(/\.$/, '');
	}

	function isNodeMissing(stepId: string | null) {
		return stepId ? data.question.weakAnswerMissingStepIds.includes(stepId) : false;
	}

	$effect(() => {
		if (loadedQuestionId === data.question.id) {
			return;
		}

		loadedQuestionId = data.question.id;
		answerText = '';
		rewriteText = '';
		checked = false;
	});
</script>

<svelte:head>
	<title>{data.question.title} practice | Question Constellation</title>
	<meta
		name="description"
		content="Attempt a GCSE question before revealing and repairing the answer chain."
	/>
</svelte:head>

<main class="flow-page practice-page">
	<header class="app-header compact-header">
		<a class="icon-button" href={previousHref} aria-label="Back to answer chain">
			<ArrowLeft size={25} strokeWidth={2.1} />
		</a>
		<strong class="header-title desktop-centered">{data.constellation.title}</strong>
		<Bookmark class="bookmark" size={25} strokeWidth={2.1} />
	</header>

	{#if !checked}
		<section class="practice-progress-strip">
			<div class="progress-meter">
				<p class="progress-label">Question {questionNumber} of {data.questions.length}</p>
				<div class="progress-track" aria-hidden="true">
					<span class="progress-fill" style={`width: ${progressPercent}`}></span>
				</div>
			</div>

			<section class="meta-pills" aria-label="Exam metadata">
				<span class="pill">
					{data.question.meta.board}
					{data.question.meta.subject}
					{data.question.meta.tier}
				</span>
				<span class="pill">{data.question.meta.paper}</span>
				<span class="pill">{data.question.meta.marks} marks</span>
			</section>
		</section>

		<div class="flow-grid practice-attempt-grid">
			<aside class="practice-rail">
				<section class="side-card prompt-card">
					<h2>Before you check</h2>
					<ul class="prompt-list">
						<li><Circle size={21} /> Use the words in the question</li>
						<li><Circle size={21} /> Write each cause before the effect</li>
						<li><Circle size={21} /> Leave a gap if you are unsure</li>
					</ul>
				</section>

				<section class="side-card compare-card">
					<span class="icon-tile info"><Lock size={22} /></span>
					<div>
						<h2>Compare after checking</h2>
						<p>The chain appears after your attempt so you practise retrieval first.</p>
					</div>
				</section>
			</aside>

			<section class="flow-main practice-workspace">
				<h1 class="attempt-question">{data.question.prompt}</h1>

				<section class="memory-first-card">
					<span class="icon-tile info"><Lightbulb size={22} /></span>
					<div>
						<h2>Try from memory first</h2>
						<p>Compare with the chain after you check.</p>
					</div>
				</section>

				<textarea
					id="answer"
					bind:value={answerText}
					rows="8"
					placeholder="Write your answer..."
					spellcheck="true"
				></textarea>

				<div class="desktop-action-row">
					<button class="primary-button" type="button" onclick={checkAnswer}>
						<CheckCircle2 size={22} />
						Check answer
					</button>
					<button class="secondary-button" type="button" onclick={checkAnswer}>
						<ListChecks size={22} />
						Use mark checklist
					</button>
				</div>
			</section>
		</div>
	{:else}
		<div class="flow-grid checklist-rewrite-grid">
			<aside class="feedback-rail">
				<section class="score-card">
					<h1 class="result-title">{resultTitle}</h1>
					<p>Add the missing links to complete the answer.</p>
				</section>

				<section class="chain-card compact-chain-card" aria-label="Checklist result chain">
					<h2>Chain preview</h2>
					<div class="chain-icons compact result-chain">
						{#each data.question.repairChain as node (node.id)}
							<div class="chain-node" class:missing={isNodeMissing(node.stepId)}>
								<span class="chain-node-icon">
									{#if node.icon === 'droplet'}
										<Droplet size={22} strokeWidth={2.2} />
									{:else if node.icon === 'oxygen'}
										<strong>O₂</strong>
									{:else if node.icon === 'atom'}
										<Atom size={22} strokeWidth={2.2} />
									{:else if node.icon === 'zap'}
										<Zap size={22} strokeWidth={2.2} />
									{:else}
										<Target size={22} strokeWidth={2.2} />
									{/if}
								</span>
								<span>{node.label}</span>
							</div>
						{/each}
					</div>
				</section>

				<section class="result-card included-card">
					<h2>You included ({includedItems.length})</h2>
					<div class="result-list">
						{#each includedItems as item (item.id)}
							<div class="result-row">
								<CheckCircle2 size={20} />
								<span>{shortChecklistText(item.text)}</span>
							</div>
						{/each}
					</div>
				</section>

				<section class="result-card missing-card">
					<h2>Missing ({missingItems.length})</h2>
					<div class="result-list">
						{#each missingItems as item (item.id)}
							<div class="result-row missing">
								<CircleAlert size={20} />
								<span>{shortChecklistText(item.text)}</span>
							</div>
						{/each}
					</div>
				</section>

				<section class="repair-card">
					<Info size={21} color="#0b57eb" />
					<span>Add the missing links so the final effect is explained.</span>
				</section>
			</aside>

			<section class="flow-main rewrite-workspace">
				<h1>Rewrite with the missing links</h1>
				<p class="workspace-subtitle">Use the feedback to repair your answer.</p>
				<div class="chain-reminder">{chainReminder}</div>
				<textarea
					bind:value={rewriteText}
					rows="12"
					placeholder="Rewrite your answer..."
					spellcheck="true"
				></textarea>
				<div class="button-stack">
					<a class="primary-button" href={resolve('/thinking-memory')}>
						<Save size={22} />
						Save repaired chain
					</a>
					<a
						class="secondary-button"
						href={resolve('/questions/[questionId]/chain', { questionId: data.question.id })}
					>
						Show model answer
					</a>
					<button class="text-button" type="button" onclick={() => (checked = false)}>
						Continue without saving
					</button>
				</div>
			</section>
		</div>
	{/if}
</main>
